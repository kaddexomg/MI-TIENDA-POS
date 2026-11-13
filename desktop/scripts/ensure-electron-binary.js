'use strict';

/**
 * desktop/scripts/ensure-electron-binary.js
 *
 * En Node.js 26+, extract-zip@2.0.1 (dependencia interna de electron@22.3.27)
 * puede terminar antes de descomprimir electron.exe. Este postinstall verifica
 * si dist/electron.exe existe y, si falta, completa la extracción usando
 * @electron-internal/extract-zip desde el caché local de @electron/get.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) return;

  const electronDir = path.resolve(__dirname, '..', 'node_modules', 'electron');
  if (!fs.existsSync(electronDir)) return;

  const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron';
  const distDir = path.join(electronDir, 'dist');
  const exePath = path.join(distDir, exeName);
  const pathTxt = path.join(electronDir, 'path.txt');

  if (fs.existsSync(exePath) && fs.existsSync(pathTxt)) {
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'));
  const checksums = require(path.join(electronDir, 'checksums.json'));
  const { downloadArtifact } = require(path.join(electronDir, 'node_modules', '@electron', 'get'));
  const { extract } = require('@electron-internal/extract-zip');

  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;

  console.log('[ensure-electron] Completando extracción de Electron v' + pkg.version + ' (' + platform + '-' + arch + ')...');

  const zipPath = await downloadArtifact({
    version: pkg.version,
    artifactName: 'electron',
    cacheRoot: process.env.electron_config_cache,
    checksums: checksums,
    platform: platform,
    arch: arch
  });

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  await extract(zipPath, { dir: distDir });

  const srcDts = path.join(distDir, 'electron.d.ts');
  const dstDts = path.join(electronDir, 'electron.d.ts');
  if (fs.existsSync(srcDts)) {
    fs.renameSync(srcDts, dstDts);
  }

  fs.writeFileSync(pathTxt, exeName, 'utf8');
  console.log('[ensure-electron] Binario listo en ' + exePath);
}

main().catch((err) => {
  console.error('[ensure-electron] Error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
