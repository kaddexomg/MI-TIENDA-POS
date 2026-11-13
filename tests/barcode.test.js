/* ==========================================================================
   MI-TIENDA-POS — tests/barcode.test.js
   Pruebas de estructura de códigos por familia, subformatos y generador de etiquetas.
   Ejecutar: node tests/barcode.test.js
   ========================================================================== */
'use strict';

const assert = require('assert');
const MTPCodes = require('../assets/js/core/code-structure.js');
const MTPBarcodePrinter = require('../assets/js/modules/barcode-printer.js');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    console.error('  ❌ ' + name);
    console.error('     ' + e.message);
    process.exitCode = 1;
  }
}

console.log('\n▶ Pruebas de Estructura de Códigos y Generación de Etiquetas\n');

/* --------------------------------------------------------------------- */
/* 1. MTPCodes: Detección inteligente de subformatos por familia         */
/* --------------------------------------------------------------------- */

test('BC-1: Subformatos cortos de comida preparada (EM, PAS, TEQ, PAP, MAN)', () => {
  assert.strictEqual(MTPCodes.getPrefixFor('fritos', 'Empanada de Carne Mechada'), 'EM');
  assert.strictEqual(MTPCodes.getPrefixFor('fritos', 'Pastelito de Queso'), 'PAS');
  assert.strictEqual(MTPCodes.getPrefixFor('fritos', 'Tequeños Gourmet'), 'TEQ');
  assert.strictEqual(MTPCodes.getPrefixFor('fritos', 'Papa Rellena Criolla'), 'PAP');
  assert.strictEqual(MTPCodes.getPrefixFor('fritos', 'Mandoca con Queso'), 'MAN');
});

test('BC-2: Subformatos cortos de Arepas y Almuerzos (AR, AL)', () => {
  assert.strictEqual(MTPCodes.getPrefixFor('arepas', 'Arepa Reina Pepiada'), 'AR');
  assert.strictEqual(MTPCodes.getPrefixFor('arepas', 'Arepa Pelúa'), 'AR');
  assert.strictEqual(MTPCodes.getPrefixFor('almuerzos', 'Pabellón Criollo Completo'), 'AL');
  assert.strictEqual(MTPCodes.getPrefixFor('almuerzos', 'Pollo Broaster con Papas'), 'AL');
});

test('BC-3: Subformatos de Abasto, Bebidas y Cervezas (VIV, BEB, CER, CIG, CHU, CA)', () => {
  assert.strictEqual(MTPCodes.getPrefixFor('viveres', 'Harina P.A.N. 1kg'), 'VIV');
  assert.strictEqual(MTPCodes.getPrefixFor('viveres', 'Arroz Blanco Primor'), 'VIV');
  assert.strictEqual(MTPCodes.getPrefixFor('bebidas', 'Refresco Frescolita 1.5L'), 'BEB');
  assert.strictEqual(MTPCodes.getPrefixFor('bebidas', 'Malta Polar 250ml'), 'BEB');
  assert.strictEqual(MTPCodes.getPrefixFor('cafeteria', 'Café Marrón Grande'), 'CA');
  assert.strictEqual(MTPCodes.getPrefixFor('chucherias', 'Pepito Frito-Lay'), 'CHU');
  assert.strictEqual(MTPCodes.getPrefixFor('cervezas', 'Polar Pilsen Botella'), 'CER');
  assert.strictEqual(MTPCodes.getPrefixFor('cigarros', 'Belmont 20s Cajetilla'), 'CIG');
});

/* --------------------------------------------------------------------- */
/* 2. MTPCodes: Formato y Códigos de Barras Estándar                     */
/* --------------------------------------------------------------------- */

test('BC-4: Formateo de códigos existentes (#01 -> EM01, AR19, VIV101)', () => {
  const item1 = { code: '01', name: 'Empanada de Cazón', familyId: 'fritos' };
  assert.strictEqual(MTPCodes.formatItemCode(item1), 'EM01');

  const item2 = { code: '19', name: 'Arepa Reina Pepiada', familyId: 'arepas' };
  assert.strictEqual(MTPCodes.formatItemCode(item2), 'AR19');

  const item3 = { code: '101', name: 'Harina P.A.N.', familyId: 'viveres' };
  assert.strictEqual(MTPCodes.formatItemCode(item3), 'VIV101');
});

test('BC-5: Sugerencia de siguiente código incremental', () => {
  const nextEmp = MTPCodes.suggestNextCode('fritos', 'Empanada');
  assert.strictEqual(nextEmp.prefix, 'EM');
  assert(nextEmp.number >= 1, 'Número debe ser >= 1');
  assert(nextEmp.formattedCode.startsWith('EM'), 'Código formateado debe iniciar con EM');

  const nextAre = MTPCodes.suggestNextCode('arepas', 'Arepa');
  assert.strictEqual(nextAre.prefix, 'AR');
  assert(nextAre.formattedCode.startsWith('AR'));
});

test('BC-6: Generación de código de barras numérico con prefijo de país 759 (Venezuela)', () => {
  const barcode = MTPCodes.generateStandardBarcode('01', 'fritos');
  assert(barcode.startsWith('75910'), 'Código de barras de fritos debe iniciar con 75910');
  assert.strictEqual(barcode.length, 10, 'Longitud estándar esperada');

  const vivBarcode = MTPCodes.generateStandardBarcode('101', 'viveres');
  assert(vivBarcode.startsWith('75940'), 'Código de barras de víveres debe iniciar con 75940');
});

/* --------------------------------------------------------------------- */
/* 3. MTPBarcodePrinter: Generación SVG Code 128-B 100% Offline           */
/* --------------------------------------------------------------------- */

test('BC-7: Generación de SVG Code 128-B offline puro', () => {
  const svg = MTPBarcodePrinter.generateBarcodeSvg('EM01', { height: 50, maxWidth: '240px' });
  assert(typeof svg === 'string', 'Debe retornar un string SVG');
  assert(svg.includes('<svg'), 'Debe contener la etiqueta <svg>');
  assert(svg.includes('<rect'), 'Debe contener barras <rect>');
  assert(svg.includes('</svg>'), 'Debe cerrar con </svg>');
  assert(svg.includes('viewBox='), 'Debe contener atributo viewBox');
  assert(svg.includes('EM01'), 'Debe contener el texto legible de la etiqueta');
});

test('BC-8: Renderizado de etiqueta térmica 50x30mm con precio en $ y Bs', () => {
  const testItem = {
    name: 'Empanada de Cazón',
    code: 'EM01',
    barcode: '7591000001',
    priceUsd: 1.50,
    ivaClassification: 'G16',
    familyId: 'fritos'
  };

  const html = MTPBarcodePrinter.renderLabelHtml(testItem, { tanda: 'Tanda Mañana', format: '50x30' });
  assert(typeof html === 'string', 'Debe retornar un string HTML');
  assert(html.includes('Empanada de Caz'), 'Debe incluir el nombre del producto');
  assert(html.includes('EM01'), 'Debe incluir el código formateado');
  assert(html.includes('$1.50'), 'Debe incluir el precio en USD');
  assert(html.includes('Tanda Mañana'), 'Debe incluir la tanda de cocina');
  assert(html.includes('+IVA 16%'), 'Debe incluir la clasificación fiscal');
  assert(html.includes('<svg'), 'Debe incrustar el código de barras SVG vectorizado');
});

console.log(`\n✅ Pruebas de Códigos y Etiquetas: ${passed}/8 OK\n`);
