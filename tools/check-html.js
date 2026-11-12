/* Verificación rápida de equilibrio de etiquetas en las pantallas HTML.
   Uso: node _v7_check.js                                              */
'use strict';
const fs = require('fs');
const path = require('path');

const PAGES = [
  'index.html',
  'admin/ajustes.html', 'admin/cierres.html', 'admin/facturas.html', 'admin/index.html',
  'admin/inventario.html', 'admin/pos.html', 'admin/precios.html', 'admin/productos.html',
  'admin/recetas.html', 'admin/usuarios.html',
  'caja/index.html', 'caja/pos.html'
];

let bad = 0;

function countOf(html, re) {
  return (html.match(re) || []).length;
}

PAGES.forEach(function (rel) {
  const file = path.join(path.join(__dirname, '..'), rel);
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, 'utf8');

  const opens = countOf(html, /<div\b/gi);
  const closes = countOf(html, /<\/div>/gi);
  const sOpen = countOf(html, /<script\b/gi);
  const sClose = countOf(html, /<\/script>/gi);
  const dupIds = {};
  const idRe = /\sid="([^"]+)"/gi;
  let m;
  while ((m = idRe.exec(html)) !== null) {
    dupIds[m[1]] = (dupIds[m[1]] || 0) + 1;
  }
  const duplicated = Object.keys(dupIds).filter(function (k) { return dupIds[k] > 1; });

  const problems = [];
  if (opens !== closes) problems.push('div: ' + opens + ' abren / ' + closes + ' cierran');
  if (sOpen !== sClose) problems.push('script: ' + sOpen + ' abren / ' + sClose + ' cierran');
  if (duplicated.length) problems.push('ids repetidos: ' + duplicated.join(', '));

  if (problems.length) {
    bad++;
    console.log('❌ ' + rel + ' → ' + problems.join(' | '));
  } else {
    console.log('✅ ' + rel);
  }
});

console.log(bad ? '\n⚠ ' + bad + ' página(s) con problemas' : '\n✅ Todas las páginas están equilibradas');

