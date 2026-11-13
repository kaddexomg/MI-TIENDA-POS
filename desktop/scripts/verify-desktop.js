'use strict';

/**
 * desktop/scripts/verify-desktop.js
 *
 * Pruebas automatizadas del shell nativo Electron 22 (desktop/main.js + preload.js):
 *  1. Verificación de sintaxis de main.js, preload.js, pack-win7.js.
 *  2. Arranque real de Electron 22 con servidor embebido en 127.0.0.1:0,
 *     MTP_DATA_DIR aislado, puente window.MTPDesktop y API /api/v1/status.
 *  3. Continuidad de localStorage entre dos puertos efímeros distintos.
 *  4. Bloqueo de instancia única (segunda instancia sale rápido sin duplicar ventana).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const DESKTOP_DIR = path.resolve(__dirname, '..');
const ELECTRON_BIN = require(path.join(DESKTOP_DIR, 'node_modules', 'electron'));

function runElectronSmoke(envExtra, extraArgs) {
  return new Promise((resolve, reject) => {
    const args = [DESKTOP_DIR, '--smoke-test'].concat(extraArgs || []);
    const child = spawn(ELECTRON_BIN, args, {
      env: Object.assign({}, process.env, envExtra || {}),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      reject(new Error('Timeout esperando arranque Electron --smoke-test'));
    }, 20000);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const match = stdout.match(/\[MTP-SMOKE\] (\{.*\})/);
      if (code !== 0 || !match) {
        reject(new Error('Electron salió con código ' + code + '\nSTDOUT:\n' + stdout + '\nSTDERR:\n' + stderr));
        return;
      }
      try {
        resolve(JSON.parse(match[1]));
      } catch (e) {
        reject(new Error('No se pudo parsear salida [MTP-SMOKE]: ' + e.message));
      }
    });
  });
}

async function testSingleInstanceLock(tmpDataDir, tmpUserDataDir) {
  const env = Object.assign({}, process.env, {
    MTP_DATA_DIR: tmpDataDir,
    MTP_USER_DATA_DIR: tmpUserDataDir
  });
  // Lanzar primera instancia normal (con lock activo)
  const first = spawn(ELECTRON_BIN, [DESKTOP_DIR], {
    env: env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let firstOut = '';
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Primera instancia no levantó servidor en 12s\n' + firstOut)), 12000);
    first.stdout.on('data', (d) => {
      firstOut += d.toString('utf8');
      if (firstOut.indexOf('Cargando interfaz:') !== -1) {
        clearTimeout(t);
        resolve();
      }
    });
    first.on('exit', (code) => {
      clearTimeout(t);
      reject(new Error('Primera instancia salió prematuramente con código ' + code + '\n' + firstOut));
    });
  });

  // Lanzar segunda instancia -> debe detectar lock y salir rápidamente
  const startSecond = Date.now();
  const secondExit = await new Promise((resolve) => {
    const second = spawn(ELECTRON_BIN, [DESKTOP_DIR], {
      env: env,
      stdio: 'ignore'
    });
    const t2 = setTimeout(() => {
      try { second.kill(); } catch (_) {}
      resolve({ timedOut: true, code: -1 });
    }, 8000);
    second.on('exit', (code) => {
      clearTimeout(t2);
      resolve({ timedOut: false, code: code, ms: Date.now() - startSecond });
    });
  });

  if (process.platform === 'win32' && first.pid) {
    try { execFileSync('taskkill', ['/PID', String(first.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
  } else {
    try { first.kill(); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, 500));

  assert.strictEqual(secondExit.timedOut, false, 'La segunda instancia debe cerrarse sola por single-instance lock');
  assert.strictEqual(secondExit.code, 0, 'La segunda instancia debe salir con código 0');
  return secondExit;
}

async function main() {
  console.log('==> [1/5] Verificando sintaxis de scripts desktop/...');
  const filesToCheck = [
    path.join(DESKTOP_DIR, 'main.js'),
    path.join(DESKTOP_DIR, 'preload.js'),
    path.join(DESKTOP_DIR, 'scripts', 'pack-win7.js'),
    path.join(DESKTOP_DIR, 'scripts', 'ensure-electron-binary.js')
  ];
  for (let i = 0; i < filesToCheck.length; i++) {
    execFileSync(process.execPath, ['--check', filesToCheck[i]], { stdio: 'inherit' });
  }
  console.log('    OK: sintaxis válida en los 4 archivos.');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mtp-desktop-test-'));
  const tmpData = path.join(tmpRoot, 'datos');
  const tmpUser = path.join(tmpRoot, 'user');

  try {
    console.log('==> [2/5] Prueba de arranque Electron 22 + servidor embebido + preload...');
    const res1 = await runElectronSmoke({ MTP_DATA_DIR: tmpData, MTP_USER_DATA_DIR: tmpUser });
    assert.strictEqual(res1.ok, true);
    assert.ok(res1.port > 0, 'Puerto efímero debe ser > 0');
    assert.strictEqual(res1.electron, '22.3.27');
    assert.strictEqual(res1.probe.hasMTPDesktop, true, 'window.MTPDesktop debe estar expuesto');
    assert.strictEqual(res1.probe.version, '8.0.0');
    assert.strictEqual(res1.probe.hasPrint, true, 'MTPDesktop.print debe existir');
    assert.strictEqual(res1.probe.hasOpenBackups, true, 'MTPDesktop.openBackupsFolder debe existir');
    assert.strictEqual(res1.probe.hasSetCartState, true, 'MTPDesktop.setCartState debe existir');
    assert.strictEqual(res1.probe.apiOk, true, '/api/v1/status debe responder ok: true');
    assert.ok(fs.existsSync(path.join(tmpData, 'respaldos')), 'Carpeta respaldos debe crearse automáticamente');
    assert.ok(fs.existsSync(path.join(tmpData, 'journal.ndjson')), 'journal.ndjson debe crearse en MTP_DATA_DIR');
    console.log('    OK: Electron ' + res1.electron + ' (Chrome ' + res1.chrome + ') puerto ' + res1.port);

    console.log('==> [3/5] Prueba de continuidad de localStorage entre puertos efímeros distintos...');
    const storageSeed = {
      mtp_desktop_continuity_test: 'ok_persist_v8',
      mtp_custom_note: 'caja_win7'
    };
    fs.writeFileSync(path.join(tmpData, 'desktop-localstorage.json'), JSON.stringify(storageSeed), 'utf8');
    const res2 = await runElectronSmoke({ MTP_DATA_DIR: tmpData, MTP_USER_DATA_DIR: tmpUser });
    assert.notStrictEqual(res2.port, res1.port, 'El segundo arranque debe obtener otro puerto efímero');
    assert.ok(res2.probe.localStorageKeys >= 2, 'preload.js debe hidratar localStorage antes de ejecutar scripts');
    console.log('    OK: puerto ' + res1.port + ' -> ' + res2.port + ', claves hidratadas: ' + res2.probe.localStorageKeys);

    console.log('==> [4/5] Prueba de arranque directo --start=pos...');
    const posRes = await runElectronSmoke({ MTP_DATA_DIR: tmpData, MTP_USER_DATA_DIR: tmpUser }, ['--start=pos']);
    assert.strictEqual(posRes.ok, true);
    assert.ok(/pos\.html$/i.test(posRes.probe.href), 'Debe abrir ruta pos.html al pasar --start=pos, obtuvo: ' + posRes.probe.href);
    console.log('    OK: --start=pos cargó ' + posRes.probe.href);

    console.log('==> [5/5] Prueba de bloqueo de instancia única...');
    const lockUser = path.join(tmpRoot, 'lock-user');
    const lockRes = await testSingleInstanceLock(tmpData, lockUser);
    console.log('    OK: segunda instancia cerrada automáticamente en ' + lockRes.ms + ' ms.');

    console.log('✅ TODAS LAS PRUEBAS DE DESKTOP PASARON (5/5).');
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch((err) => {
  console.error('❌ FALLÓ verify-desktop:', err && err.stack ? err.stack : err);
  process.exit(1);
});
