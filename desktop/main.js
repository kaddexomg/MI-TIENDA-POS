'use strict';

/**
 * desktop/main.js
 * MI-TIENDA-POS v8.0.0
 *
 * Shell nativo todo-en-uno para Windows 7 SP1 (32 y 64 bits) / Windows 10 / 11
 * basado en Electron 22.3.27 (Chromium 108 + Node 16 embebido).
 *
 * Características clave:
 *  - Desactiva aceleración por hardware y composición GPU antes de whenReady()
 *    para rendimiento fluido sin pantallas negras en PCs sin GPU dedicada.
 *  - Bloqueo de instancia única (enfoca ventana existente en segundo lanzamiento).
 *  - Directorio de datos determinístico MTP_DATA_DIR (C:\MI-TIENDA-DATOS si es
 *    escribible, fallback %LOCALAPPDATA%\MI-TIENDA-DATOS).
 *  - Servidor HTTP + Journal Anti-Apagones embebido en puerto libre efímero
 *    sobre 127.0.0.1 (cero conflictos de puerto y cero ACL HttpListener).
 *  - Sin menú superior ni popups externos (bloquea salidas a IE/navegador).
 *  - Confirmación nativa si la Caja tiene ítems sin cobrar al cerrar.
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');

// ---------------------------------------------------------------------------
// 1. Optimización obligatoria para Windows 7 sin GPU / PCs de bajos recursos
//    (Debe ejecutarse ANTES de app.whenReady())
// ---------------------------------------------------------------------------
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.mitiendapos.desktop');
}

// ---------------------------------------------------------------------------
// 2. Perfil Chromium y bloqueo de instancia única
// ---------------------------------------------------------------------------
function configureUserDataPath() {
  try {
    const customDir = process.env.MTP_USER_DATA_DIR ? String(process.env.MTP_USER_DATA_DIR).trim() : '';
    const shellProfileBase = customDir || (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'MI-TIENDA-POS-Shell')
      : path.join(app.getPath('appData'), 'MI-TIENDA-POS-Shell'));
    if (!fs.existsSync(shellProfileBase)) {
      fs.mkdirSync(shellProfileBase, { recursive: true });
    }
    app.setPath('userData', shellProfileBase);
  } catch (_) {
    // Mantener userData por defecto si falla la ruta personalizada
  }
}

const IS_SMOKE_TEST = process.argv.some((a) => String(a || '').trim().toLowerCase() === '--smoke-test');
configureUserDataPath();

const gotSingleInstanceLock = IS_SMOKE_TEST ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  return;
}

const APP_ROOT = path.resolve(__dirname, '..');
const APP_VERSION = (() => {
  try {
    const pkgPath = fs.existsSync(path.join(__dirname, 'package.json'))
      ? path.join(__dirname, 'package.json')
      : path.join(APP_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '8.0.0';
  } catch (_) {
    return '8.0.0';
  }
})();

let mainWindow = null;
let httpServer = null;
let serverPort = 0;
let dataDir = '';
let backupsDir = '';
let logsDir = '';
let localStorageFile = '';
let journalModule = null;
let stateModule = null;
let storageHydratedOnce = false;
let forceQuitting = false;
let closePromptInFlight = false;
let reportedCartState = { hasItems: false, count: 0, totalUsd: 0 };

// ---------------------------------------------------------------------------
// 3. Resolución determinística de MTP_DATA_DIR y Perfil Chromium
// ---------------------------------------------------------------------------
function ensureWritableDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const probe = path.join(dirPath, '.mtp_write_test_' + process.pid);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveDataDirectory() {
  const candidates = [];

  if (process.env.MTP_DATA_DIR && String(process.env.MTP_DATA_DIR).trim()) {
    candidates.push(path.resolve(String(process.env.MTP_DATA_DIR).trim()));
  }
  if (process.platform === 'win32') {
    candidates.push('C:\\MI-TIENDA-DATOS');
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'MI-TIENDA-DATOS'));
  } else {
    candidates.push(path.join(app.getPath('userData'), 'MI-TIENDA-DATOS'));
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (ensureWritableDir(candidate)) {
      const respaldos = path.join(candidate, 'respaldos');
      const logs = path.join(candidate, 'logs');
      try {
        if (!fs.existsSync(respaldos)) fs.mkdirSync(respaldos, { recursive: true });
        if (!fs.existsSync(logs)) fs.mkdirSync(logs, { recursive: true });
      } catch (_) {}
      return candidate;
    }
  }

  throw new Error('No se encontró un directorio con permisos de escritura para guardar los datos de MI TIENDA POS.');
}

function writeLog(level, message) {
  const line = '[' + new Date().toISOString() + '] [' + level + '] ' + message + '\n';
  if (level === 'ERROR') {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
  if (logsDir) {
    try {
      fs.appendFileSync(path.join(logsDir, 'desktop.log'), line, 'utf8');
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// 4. Persistencia atómica de localStorage entre puertos efímeros
// ---------------------------------------------------------------------------
function readPersistedLocalStorage() {
  if (!localStorageFile || !fs.existsSync(localStorageFile)) return null;
  try {
    const raw = fs.readFileSync(localStorageFile, 'utf8');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    writeLog('WARN', 'No se pudo leer desktop-localstorage.json: ' + err.message);
    return null;
  }
}

function writePersistedLocalStorage(obj) {
  if (!localStorageFile || !obj || typeof obj !== 'object') return;
  const tmpPath = localStorageFile + '.tmp';
  try {
    const json = JSON.stringify(obj, null, 2);
    const fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, json, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmpPath, localStorageFile);
  } catch (err) {
    writeLog('WARN', 'Error guardando desktop-localstorage.json: ' + err.message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// 5. Arranque del servidor HTTP embebido en 127.0.0.1:<puerto libre>
// ---------------------------------------------------------------------------
function startEmbeddedServer() {
  return new Promise((resolve, reject) => {
    try {
      dataDir = resolveDataDirectory();
      backupsDir = path.join(dataDir, 'respaldos');
      logsDir = path.join(dataDir, 'logs');
      localStorageFile = path.join(dataDir, 'desktop-localstorage.json');
      process.env.MTP_DATA_DIR = dataDir;

      const serverPath = path.join(APP_ROOT, 'server', 'server.js');
      const journalPath = path.join(APP_ROOT, 'server', 'journal.js');
      const statePath = path.join(APP_ROOT, 'server', 'state.js');

      const serverModule = require(serverPath);
      journalModule = require(journalPath);
      stateModule = require(statePath);

      httpServer = serverModule.createServer();
      httpServer.once('error', (err) => {
        reject(err);
      });

      // Puerto 0 sobre loopback 127.0.0.1: evita conflictos de puerto fijo y alertas de Firewall/ACL en Win7
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        serverPort = addr && typeof addr.port === 'number' ? addr.port : 0;
        if (!serverPort) {
          reject(new Error('El servidor local no obtuvo un puerto válido.'));
          return;
        }
        process.env.PORT = String(serverPort);
        writeLog('INFO', 'Servidor embebido iniciado en http://127.0.0.1:' + serverPort + ' | MTP_DATA_DIR=' + dataDir);
        resolve(serverPort);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// 6. Resolución de ruta inicial (/index.html o /pos.html con --start=pos)
// ---------------------------------------------------------------------------
function resolveStartRoute(argv) {
  const args = Array.isArray(argv) ? argv : process.argv;
  const wantsPos = args.some((a) => {
    const s = String(a || '').trim().toLowerCase();
    return s === '--start=pos' || s === '--pos';
  });

  if (wantsPos && fs.existsSync(path.join(APP_ROOT, 'pos.html'))) {
    return '/pos.html';
  }
  return '/index.html';
}

function getBaseOrigin() {
  return 'http://127.0.0.1:' + serverPort;
}

function isAllowedInternalUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') return false;
  const origin = getBaseOrigin();
  return targetUrl === origin || targetUrl.indexOf(origin + '/') === 0;
}

// ---------------------------------------------------------------------------
// 7. Creación de la ventana nativa principal + Confirmación de cierre POS
// ---------------------------------------------------------------------------
async function checkActivePosCart() {
  if (reportedCartState && reportedCartState.hasItems) {
    return { hasItems: true, count: reportedCartState.count || 1 };
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { hasItems: false };
  }
  try {
    const result = await mainWindow.webContents.executeJavaScript(`(function () {
      try {
        var countEl = document.getElementById('posTicketCount');
        if (countEl) {
          var m = String(countEl.textContent || '').match(/(\\d+)/);
          if (m && parseInt(m[1], 10) > 0) {
            return { hasItems: true, count: parseInt(m[1], 10) };
          }
        }
        if (window.MTPPos && typeof window.MTPPos.getCartTotalUsd === 'function') {
          var total = Number(window.MTPPos.getCartTotalUsd() || 0);
          if (total > 0) return { hasItems: true, totalUsd: total };
        }
      } catch (_) {}
      return { hasItems: false };
    })()`, true);
    return result || { hasItems: false };
  } catch (_) {
    return { hasItems: false };
  }
}

async function flushRendererLocalStorage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const snap = await mainWindow.webContents.executeJavaScript(`(function () {
      try {
        if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') return null;
        var out = {};
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k !== null && k !== undefined) {
            var v = window.localStorage.getItem(k);
            if (v !== null) out[k] = v;
          }
        }
        return out;
      } catch (_) {
        return null;
      }
    })()`, true);
    if (snap && typeof snap === 'object' && Object.keys(snap).length > 0) {
      writePersistedLocalStorage(snap);
    }
  } catch (_) {}
}

async function handleWindowCloseRequest() {
  await flushRendererLocalStorage();
  const cartStatus = await checkActivePosCart();

  if (cartStatus && cartStatus.hasItems && mainWindow && !mainWindow.isDestroyed()) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Seguir en Caja', 'Cerrar de todas formas'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Orden activa en Caja',
      message: 'Hay productos cargados en el ticket actual sin cobrar.',
      detail: 'Si cierras MI TIENDA POS ahora, la orden abierta que no hayas guardado en espera se perderá.'
    });
    if (choice.response !== 1) {
      return;
    }
  }

  forceQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
}

function createMainWindow(startRoute) {
  Menu.setApplicationMenu(null);

  const iconIco = path.join(APP_ROOT, 'assets', 'img', 'brand-icon.ico');
  const iconPng = path.join(APP_ROOT, 'assets', 'img', 'brand-icon-64.png');
  const windowIcon = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : undefined);

  mainWindow = new BrowserWindow({
    title: 'MI TIENDA POS',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#F8FAFC',
    icon: windowIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!IS_SMOKE_TEST) {
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Mantener título nítido y evitar que páginas internas dejen un título vacío
  mainWindow.on('page-title-updated', (e, title) => {
    if (!title || !String(title).trim()) {
      e.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle('MI TIENDA POS');
      }
    }
  });

  // Bloquear window.open hacia IE u otros navegadores externos
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const target = details && details.url ? details.url : '';
    if (isAllowedInternalUrl(target) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(target);
    } else if (target) {
      writeLog('INFO', 'Popup externo bloqueado: ' + target);
    }
    return { action: 'deny' };
  });

  // Evitar navegación accidental fuera del servidor embebido (drag & drop de archivos, enlaces externos)
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedInternalUrl(targetUrl)) {
      event.preventDefault();
      writeLog('WARN', 'Navegación externa bloqueada: ' + targetUrl);
    }
  });

  mainWindow.on('close', (e) => {
    if (forceQuitting) return;
    e.preventDefault();
    if (closePromptInFlight) return;
    closePromptInFlight = true;
    handleWindowCloseRequest()
      .catch((err) => {
        writeLog('ERROR', 'Error en cierre de ventana: ' + err.message);
        forceQuitting = true;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      })
      .finally(() => {
        closePromptInFlight = false;
      });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const targetUrl = getBaseOrigin() + (startRoute || '/index.html');
  writeLog('INFO', 'Cargando interfaz: ' + targetUrl);
  if (IS_SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const probe = await mainWindow.webContents.executeJavaScript(`(async function () {
          var apiOk = false;
          try {
            var r = await fetch('/api/v1/status');
            var j = await r.json();
            apiOk = Boolean(j && j.ok);
          } catch (_) {}
          return {
            href: window.location.href,
            title: document.title,
            hasMTPDesktop: Boolean(window.MTPDesktop && window.MTPDesktop.isDesktop),
            version: window.MTPDesktop ? window.MTPDesktop.getVersion() : null,
            hasPrint: Boolean(window.MTPDesktop && typeof window.MTPDesktop.print === 'function'),
            hasOpenBackups: Boolean(window.MTPDesktop && typeof window.MTPDesktop.openBackupsFolder === 'function'),
            hasSetCartState: Boolean(window.MTPDesktop && typeof window.MTPDesktop.setCartState === 'function'),
            localStorageKeys: window.localStorage ? window.localStorage.length : 0,
            apiOk: apiOk
          };
        })()`, true);
        console.log('[MTP-SMOKE] ' + JSON.stringify({
          ok: true,
          port: serverPort,
          dataDir: dataDir,
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          arch: process.arch,
          probe: probe
        }));
        forceQuitting = true;
        shutdownEmbeddedServer();
        app.exit(0);
      } catch (smokeErr) {
        console.error('[MTP-SMOKE-ERROR] ' + smokeErr.message);
        forceQuitting = true;
        shutdownEmbeddedServer();
        app.exit(1);
      }
    });
  }
  mainWindow.loadURL(targetUrl).catch((err) => {
    writeLog('ERROR', 'Fallo cargando URL inicial: ' + err.message);
    if (IS_SMOKE_TEST) {
      forceQuitting = true;
      shutdownEmbeddedServer();
      app.exit(1);
    }
  });
}

// ---------------------------------------------------------------------------
// 8. Manejadores IPC para preload.js (window.MTPDesktop)
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  ipcMain.on('mtp:get-meta', (event) => {
    event.returnValue = {
      appVersion: APP_VERSION,
      dataDir: dataDir,
      backupsDir: backupsDir,
      port: serverPort
    };
  });

  ipcMain.on('mtp:storage-hydrate', (event) => {
    if (storageHydratedOnce) {
      event.returnValue = { shouldApply: false, data: null };
      return;
    }
    storageHydratedOnce = true;
    const data = readPersistedLocalStorage();
    event.returnValue = { shouldApply: Boolean(data), data: data };
  });

  ipcMain.on('mtp:storage-save', (_event, snap) => {
    if (snap && typeof snap === 'object') {
      writePersistedLocalStorage(snap);
    }
  });

  ipcMain.on('mtp:storage-save-sync', (event, snap) => {
    if (snap && typeof snap === 'object') {
      writePersistedLocalStorage(snap);
    }
    event.returnValue = true;
  });

  ipcMain.on('mtp:cart-state', (_event, cartState) => {
    if (cartState && typeof cartState === 'object') {
      reportedCartState = {
        hasItems: Boolean(cartState.hasItems),
        count: Number(cartState.count || 0),
        totalUsd: Number(cartState.totalUsd || 0)
      };
    }
  });

  ipcMain.handle('mtp:get-info', async () => {
    return {
      ok: true,
      version: APP_VERSION,
      electronVersion: process.versions.electron || '',
      nodeVersion: process.versions.node || '',
      chromeVersion: process.versions.chrome || '',
      platform: process.platform,
      arch: process.arch,
      dataDir: dataDir,
      backupsDir: backupsDir,
      port: serverPort
    };
  });

  ipcMain.handle('mtp:print', async (event, opts) => {
    const options = opts && typeof opts === 'object' ? opts : {};
    const win = (event && event.sender ? require('electron').BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
    if (!win || win.isDestroyed()) {
      return { ok: false, error: 'Ventana principal no disponible para imprimir.' };
    }
    return new Promise((resolve) => {
      const printOpts = {
        silent: Boolean(options.silent),
        printBackground: options.printBackground !== false,
        margins: { marginType: 'none' }
      };
      if (options.deviceName && typeof options.deviceName === 'string') {
        printOpts.deviceName = options.deviceName;
      }
      if (options.copies && Number(options.copies) > 0) {
        printOpts.copies = Number(options.copies);
      }
      win.webContents.print(printOpts, (success, failureReason) => {
        if (success) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: failureReason || 'Impresión cancelada o fallida' });
        }
      });
    });
  });

  ipcMain.handle('mtp:get-printers', async (event) => {
    const win = (event && event.sender ? require('electron').BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
    if (!win || win.isDestroyed()) return [];
    try {
      if (typeof win.webContents.getPrintersAsync === 'function') {
        return await win.webContents.getPrintersAsync();
      }
      if (typeof win.webContents.getPrinters === 'function') {
        return win.webContents.getPrinters();
      }
    } catch (_) {}
    return [];
  });

  ipcMain.handle('mtp:open-backups', async () => {
    try {
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
      const errMsg = await shell.openPath(backupsDir);
      return { ok: !errMsg, path: backupsDir, error: errMsg || null };
    } catch (err) {
      return { ok: false, path: backupsDir, error: err.message };
    }
  });

  ipcMain.handle('mtp:open-data', async () => {
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const errMsg = await shell.openPath(dataDir);
      return { ok: !errMsg, path: dataDir, error: errMsg || null };
    } catch (err) {
      return { ok: false, path: dataDir, error: err.message };
    }
  });

  ipcMain.handle('mtp:request-close', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// 9. Ciclo de vida de la aplicación y apagado limpio del Journal
// ---------------------------------------------------------------------------
app.on('second-instance', (_event, commandLine) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    const wantsPos = Array.isArray(commandLine) && commandLine.some((a) => {
      const s = String(a || '').trim().toLowerCase();
      return s === '--start=pos' || s === '--pos';
    });
    if (wantsPos && serverPort) {
      const route = resolveStartRoute(commandLine);
      const targetUrl = getBaseOrigin() + route;
      const currentUrl = mainWindow.webContents.getURL() || '';
      if (!currentUrl.endsWith(route)) {
        mainWindow.loadURL(targetUrl).catch(() => {});
      }
    }
  }
});

let serverShutdownDone = false;
function shutdownEmbeddedServer() {
  if (serverShutdownDone) return;
  serverShutdownDone = true;
  writeLog('INFO', 'Cerrando servidor embebido y guardando snapshot del journal...');
  try {
    if (stateModule && typeof stateModule.saveSnapshot === 'function') {
      stateModule.saveSnapshot();
    }
  } catch (err) {
    writeLog('ERROR', 'Error guardando snapshot al salir: ' + err.message);
  }
  try {
    if (journalModule && typeof journalModule.close === 'function') {
      journalModule.close();
    }
  } catch (err) {
    writeLog('ERROR', 'Error cerrando journal al salir: ' + err.message);
  }
  try {
    if (httpServer) {
      httpServer.close();
    }
  } catch (_) {}
}

app.on('window-all-closed', () => {
  shutdownEmbeddedServer();
  app.quit();
});

app.on('before-quit', () => {
  forceQuitting = true;
  shutdownEmbeddedServer();
});

app.whenReady()
  .then(async () => {
    registerIpcHandlers();
    await startEmbeddedServer();
    const startRoute = resolveStartRoute(process.argv);
    createMainWindow(startRoute);
  })
  .catch((err) => {
    const msg = err && err.message ? err.message : String(err);
    writeLog('ERROR', 'Error fatal de arranque: ' + msg);
    dialog.showErrorBox(
      'MI TIENDA POS — Error de Inicio',
      'No se pudo inicializar el motor local de MI TIENDA POS.\n\nDetalle técnico:\n' + msg
    );
    shutdownEmbeddedServer();
    app.exit(1);
  });
