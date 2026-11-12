/* Verifica que el JavaScript EN LÍNEA de cada pantalla sea sintácticamente válido.
   (los <script src> ya se revisan aparte con node --check)
   Uso: node _v7_check_scripts.js                                     */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const PAGES = [
  'index.html',
  'admin/ajustes.html', 'admin/cierres.html', 'admin/facturas.html', 'admin/index.html',
  'admin/inventario.html', 'admin/pos.html', 'admin/precios.html', 'admin/productos.html',
  'admin/recetas.html', 'admin/usuarios.html',
  'caja/index.html', 'caja/pos.html'
];

let bad = 0;

PAGES.forEach(function (rel) {
  const file = path.join(path.join(__dirname, '..'), rel);
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, 'utf8');

  // Extraer bloques <script> SIN atributo src
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let idx = 0;
  let failed = false;

  while ((m = re.exec(html)) !== null) {
    idx++;
    const code = m[1];
    if (!code.trim()) continue;
    const tmp = path.join(os.tmpdir(), 'v7check_' + rel.replace(/[^a-z0-9]/gi, '_') + '_' + idx + '.js');
    fs.writeFileSync(tmp, code, 'utf8');
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
      failed = true;
      const msg = (e.stderr ? e.stderr.toString() : '').split('\n').slice(0, 4).join(' | ');
      console.log('❌ ' + rel + ' [bloque inline #' + idx + '] → ' + msg);
    }
  }

  if (!failed) console.log('✅ ' + rel + ' (' + idx + ' bloque(s) inline)');
  else bad++;
});

console.log(bad ? '\n⚠ ' + bad + ' página(s) con JavaScript roto' : '\n✅ Todo el JavaScript en línea es válido');

