'use strict';

/**
 * tests/ai-photos.test.js
 * Pruebas unitarias (sin red) del pool de llaves Gemini y del estudio de fotos:
 *  - Lectura de llaves desde texto libre / JSON / lista, sin duplicados.
 *  - Enmascarado seguro de llaves para mostrarlas en pantalla.
 *  - Construcción de la búsqueda de respaldo por familia (sin IA).
 *  - Nombre de archivo seguro para las fotos guardadas en la caja.
 *  - Puntuación de resultados de imágenes (marca, clipart, tamaño).
 */

const assert = require('assert');
const aiKeys = require('../server/ai-keys');
const imageSearch = require('../server/image-search');
const photoStudio = require('../server/photo-studio');

console.log('🧪 Ejecutando pruebas del pool Gemini y del estudio de fotos...');

/* -------------------------------------------------------------------------- */
/* 1. Lectura y normalización de llaves                                       */
/* -------------------------------------------------------------------------- */
const KEY_A = 'LLAVE-DE-PRUEBA-NUMERO-UNO-1234567890';
const KEY_B = 'LLAVE-DE-PRUEBA-NUMERO-DOS-0987654321';

const fromLines = aiKeys.splitKeys(KEY_A + '\n' + KEY_B);
assert.strictEqual(fromLines.length, 2, 'Dos llaves separadas por salto de línea deben detectarse');
assert.strictEqual(fromLines[0], KEY_A);

const fromCommas = aiKeys.splitKeys(KEY_A + ', ' + KEY_B);
assert.strictEqual(fromCommas.length, 2, 'Dos llaves separadas por coma deben detectarse');

const fromArray = aiKeys.splitKeys([KEY_A, KEY_B, KEY_A]);
assert.strictEqual(fromArray.length, 2, 'Las llaves repetidas deben eliminarse');

const fromJson = aiKeys.splitKeys(JSON.stringify([KEY_A, KEY_B]));
assert.strictEqual(fromJson.length, 2, 'Debe aceptar el formato JSON de Google AI Studio');

const withGarbage = aiKeys.splitKeys('corta\n' + KEY_A + '\n\n' + KEY_A);
assert.strictEqual(withGarbage.length, 1, 'Debe descartar textos que no son llaves y duplicados');

const empty = aiKeys.splitKeys('');
assert.strictEqual(empty.length, 0, 'Sin texto no debe inventar llaves');

/* -------------------------------------------------------------------------- */
/* 2. Enmascarado                                                             */
/* -------------------------------------------------------------------------- */
const masked = aiKeys.maskKey(KEY_A);
assert.ok(masked.indexOf('••••') !== -1, 'La llave mostrada debe ocultar el centro');
assert.ok(masked.indexOf('PRUEBA-NUMERO-UNO') === -1, 'El cuerpo de la llave nunca debe mostrarse completo');
assert.ok(masked.indexOf('7890') !== -1, 'Los últimos 4 caracteres ayudan a identificar la llave');

/* -------------------------------------------------------------------------- */
/* 3. Búsqueda de respaldo por familia (funciona sin IA y sin internet)       */
/* -------------------------------------------------------------------------- */
assert.strictEqual(
  photoStudio.fallbackQuery('Harina P.A.N. Blanca', 'viveres'),
  'Harina P.A.N. Blanca harina pan arroz pasta viveres venezuela',
  'La búsqueda debe combinar el nombre con la pista de la familia'
);
assert.ok(
  photoStudio.fallbackQuery('', 'cervezas').indexOf('cerveza') !== -1,
  'Sin nombre, debe buscar por la familia'
);
assert.strictEqual(
  photoStudio.fallbackQuery('Empanada', 'familia-inexistente'),
  'Empanada producto venezolano',
  'Una familia desconocida no debe romper la búsqueda'
);

/* -------------------------------------------------------------------------- */
/* 4. Nombre de archivo seguro para la foto guardada                          */
/* -------------------------------------------------------------------------- */
assert.strictEqual(photoStudio.slugify('Harina P.A.N. Blanca 1Kg'), 'harina-p-a-n-blanca-1kg');
assert.strictEqual(photoStudio.slugify('   '), 'producto');
assert.ok(photoStudio.slugify('A/%$#B').indexOf('/') === -1, 'El nombre nunca debe contener separadores de ruta');
assert.ok(photoStudio.slugify('x'.repeat(200)).length <= 42, 'El nombre debe quedar corto para Windows 7');

/* -------------------------------------------------------------------------- */
/* 5. Puntuación de imágenes                                                  */
/* -------------------------------------------------------------------------- */
const strong = imageSearch.scoreResult({
  title: 'Harina P.A.N. Blanca 1kg Venezuela',
  pageUrl: 'https://www.walmart.com/ip/harina-pan',
  image: 'https://cdn.walmart.com/harina-pan.jpg',
  width: 900,
  height: 900
}, 'Harina P.A.N. Blanca 1kg');

const clipart = imageSearch.scoreResult({
  title: 'Harina pan clipart vector icono',
  pageUrl: 'https://ejemplo.com/clipart',
  image: 'https://ejemplo.com/harina.png',
  width: 120,
  height: 120
}, 'Harina P.A.N. Blanca 1kg');

assert.ok(strong > clipart, 'Una foto de comercio real debe puntuar más que un clipart');
assert.ok(strong >= 90, 'La foto ideal debe quedar en el grupo de 4 estrellas');
assert.ok(clipart < 40, 'El clipart debe quedar descartado por puntuación');

assert.strictEqual(
  imageSearch.normalize('Harina P.A.N.  ÁÉÍ'),
  'harina p.a.n. aei',
  'La normalización debe quitar acentos y espacios dobles'
);

/* -------------------------------------------------------------------------- */
/* 6. Contrato de los módulos usados por la API                               */
/* -------------------------------------------------------------------------- */
assert.strictEqual(typeof aiKeys.callGemini, 'function', 'Debe existir la llamada con rotación de llaves');
assert.strictEqual(typeof aiKeys.testKeys, 'function', 'Debe existir la prueba individual de llaves');
assert.strictEqual(typeof aiKeys.getStatus, 'function', 'Debe existir el estado del pool');
assert.strictEqual(typeof imageSearch.searchImages, 'function', 'Debe existir el buscador de fotos');
assert.strictEqual(typeof imageSearch.fetchImage, 'function', 'Debe existir la descarga de la foto elegida');
assert.strictEqual(typeof photoStudio.savePhoto, 'function', 'Debe existir el guardado dentro de la caja');

console.log('✅ Pool Gemini y estudio de fotos: 20/20 OK');
