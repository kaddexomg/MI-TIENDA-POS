'use strict';

/**
 * desktop/scripts/pack-win7.js
 * MI-TIENDA-POS v8.0.0
 *
 * Empaqueta la aplicación web, el servidor local y el shell Electron 22.3.27
 * en un ejecutable todo-en-uno de 32 bits (win32-ia32) compatible con
 * Windows 7 SP1 (32 y 64 bits), Windows 8.1, Windows 10 y Windows 11.
 *
 * Salida: <REPO_ROOT>/dist/MI-TIENDA-POS-win32-ia32/MI-TIENDA-POS.exe
 */

const fs = require('fs');
const path = require('path');
const { packager } = require('@electron/packager');

const DESKTOP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..');
const STAGE_DIR = path.join(DESKTOP_DIR, '.pack-stage');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const TARGET_OUT_NAME = 'MI-TIENDA-POS';

function rmDirRecursive(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function copyFilteredRecursive(src, dest, options) {
  const opts = options || {};
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    const baseName = path.basename(src);
    if (opts.skipDirs && opts.skipDirs.indexOf(baseName) !== -1) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (let i = 0; i < entries.length; i++) {
      copyFilteredRecursive(path.join(src, entries[i]), path.join(dest, entries[i]), opts);
    }
    return;
  }

  const fileName = path.basename(src);
  if (/\.bak$/i.test(fileName) || /\.tmp$/i.test(fileName)) return;
  if (opts.skipFiles && opts.skipFiles.indexOf(fileName) !== -1) return;

  const parent = path.dirname(dest);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  fs.copyFileSync(src, dest);
}

async function main() {
  const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
  const appVersion = desktopPkg.version || '8.0.0';

  console.log('==> [1/4] Preparando staging limpio para empaquetado Win7 ia32...');
  rmDirRecursive(STAGE_DIR);
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  // Copiar todos los HTML en raíz (index.html, pos.html si existe, etc.)
  const rootEntries = fs.readdirSync(REPO_ROOT);
  for (let i = 0; i < rootEntries.length; i++) {
    const entry = rootEntries[i];
    if (/\.html?$/i.test(entry)) {
      const fullSrc = path.join(REPO_ROOT, entry);
      if (fs.statSync(fullSrc).isFile()) {
        fs.copyFileSync(fullSrc, path.join(STAGE_DIR, entry));
      }
    }
  }

  // Carpetas de la aplicación web + servidor local (estructura unificada v8)
  copyFilteredRecursive(path.join(REPO_ROOT, 'admin'), path.join(STAGE_DIR, 'admin'));
  copyFilteredRecursive(path.join(REPO_ROOT, 'assets'), path.join(STAGE_DIR, 'assets'));
  copyFilteredRecursive(path.join(REPO_ROOT, 'server'), path.join(STAGE_DIR, 'server'), {
    skipFiles: ['test-journal.js']
  });
  copyFilteredRecursive(path.join(REPO_ROOT, 'mobile'), path.join(STAGE_DIR, 'mobile'), {
    skipDirs: ['android-app', 'build', 'keystore']
  });

  const requiredStaged = [
    'index.html',
    'pos.html',
    path.join('assets', 'css', 'tokens.css'),
    path.join('assets', 'css', 'app.css'),
    path.join('assets', 'css', 'pos.css'),
    path.join('assets', 'js', 'core', 'config.js'),
    path.join('assets', 'js', 'modules', 'pos-engine.js'),
    path.join('server', 'server.js')
  ];
  for (let i = 0; i < requiredStaged.length; i++) {
    const reqPath = path.join(STAGE_DIR, requiredStaged[i]);
    if (!fs.existsSync(reqPath)) {
      throw new Error('Falta archivo esencial en staging: ' + requiredStaged[i]);
    }
  }

  // Shell Electron (solo archivos de runtime, sin node_modules ni scripts de build)
  const stageDesktop = path.join(STAGE_DIR, 'desktop');
  fs.mkdirSync(stageDesktop, { recursive: true });
  fs.copyFileSync(path.join(DESKTOP_DIR, 'main.js'), path.join(stageDesktop, 'main.js'));
  fs.copyFileSync(path.join(DESKTOP_DIR, 'preload.js'), path.join(stageDesktop, 'preload.js'));

  // package.json empaquetado apunta a desktop/main.js para que APP_ROOT = resources/app
  const stagedPkg = {
    name: desktopPkg.name || 'mi-tienda-pos',
    productName: desktopPkg.productName || 'MI TIENDA POS',
    version: appVersion,
    description: desktopPkg.description || 'MI TIENDA POS',
    main: 'desktop/main.js',
    private: true
  };
  fs.writeFileSync(path.join(STAGE_DIR, 'package.json'), JSON.stringify(stagedPkg, null, 2), 'utf8');

  console.log('==> [2/4] Descargando/empaquetando Electron v22.3.27 (win32-ia32)...');
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const iconIco = path.join(REPO_ROOT, 'assets', 'img', 'brand-icon.ico');
  const packOpts = {
    dir: STAGE_DIR,
    out: DIST_DIR,
    name: TARGET_OUT_NAME,
    platform: 'win32',
    arch: 'ia32',
    electronVersion: '22.3.27',
    asar: false,
    overwrite: true,
    prune: false,
    appVersion: appVersion,
    buildVersion: appVersion + '.0',
    appCopyright: 'Copyright (C) 2026 MI TIENDA POS',
    win32metadata: {
      CompanyName: 'MI TIENDA POS',
      FileDescription: 'MI TIENDA POS - Caja y Gestión Comercial Offline',
      OriginalFilename: TARGET_OUT_NAME + '.exe',
      ProductName: 'MI TIENDA POS',
      InternalName: TARGET_OUT_NAME
    }
  };
  if (fs.existsSync(iconIco)) {
    packOpts.icon = iconIco;
  }

  const appPaths = await packager(packOpts);
  const outputDir = appPaths && appPaths[0] ? appPaths[0] : path.join(DIST_DIR, TARGET_OUT_NAME + '-win32-ia32');

  console.log('==> [3/4] Limpiando carpeta temporal de staging...');
  rmDirRecursive(STAGE_DIR);

  const exePath = path.join(outputDir, TARGET_OUT_NAME + '.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error('No se encontró el ejecutable esperado en ' + exePath);
  }

  console.log('==> [4/4] Paquete Windows 7 (32/64 bits) generado con éxito:');
  console.log('    Carpeta   : ' + outputDir);
  console.log('    Ejecutable: ' + exePath);
}

main().catch((err) => {
  try { rmDirRecursive(STAGE_DIR); } catch (_) {}
  console.error('[pack-win7] ERROR:', err && err.stack ? err.stack : err);
  process.exit(1);
});
