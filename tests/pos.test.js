/* ==========================================================================
   MI-TIENDA-POS — tests/pos.test.js
   Flujo de caja: total único, IGTF, vuelto, denominación y pagos.
   Ejecutar: node tests/pos.test.js
   ========================================================================== */
'use strict';

const assert = require('assert');
const MTPTax = require('../assets/js/tax.js');
const MTPChange = require('../assets/js/change.js');
const fixtures = require('./fixtures.js');

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

const SETTINGS_CE = { ivaMode: 'RECARGO', isContribuyenteEspecial: true, rateBcv: 40 };
const SETTINGS_NO_CE = { ivaMode: 'RECARGO', isContribuyenteEspecial: false, rateBcv: 40 };

const EMPANADAS = fixtures.CARRT_2_EMPANADAS;
const CARRITO_MIXTO = fixtures.CART_MIXTO;

console.log('\n▶ Pruebas del flujo de caja (v7)\n');

/* --------------------------------------------------------------------- */
test('T1: El total con IGTF es el mismo se calcule antes o después del pago', () => {
  const sinPagos = MTPTax.computeTotals({
    lines: CARRITO_MIXTO, payments: [], rateBcv: 40, settings: SETTINGS_CE
  });
  const conPagos = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    rateBcv: 40, settings: SETTINGS_CE
  });
  // La base imponible y el IVA NO cambian por añadir pagos: solo cambia el IGTF.
  assert.strictEqual(conPagos.baseG16Usd, sinPagos.baseG16Usd, 'la base 16% no debe cambiar');
  assert.strictEqual(conPagos.totalIvaUsd, sinPagos.totalIvaUsd, 'el IVA no debe cambiar');
  assert.ok(conPagos.totalUsd >= sinPagos.totalUsd, 'el total con IGTF debe ser mayor o igual');
});

test('T2: IGTF = 3% de la base en divisas, con tope en el total con IVA', () => {
  const r = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    rateBcv: 40, settings: SETTINGS_CE
  });
  const esperado = Number((Math.min(r.totalBeforeIgtfUsd, 10) * 0.03).toFixed(2));
  assert.strictEqual(r.igtfUsd, esperado, 'IGTF mal calculado');
  assert.ok(r.igtfBaseUsd <= r.totalBeforeIgtfUsd, 'la base IGTF no puede pasar del total');
});

test('T3: El vuelto en US$ reduce la base IGTF (pago mixido en divisas y Bs)', () => {
  // Total de la venta: 5.14. El cliente paga $5,00 en efectivo US$ y el resto
  // en bolívares, y recibe parte del vuelto en dólares.
  const pagos = [
    { method: 'Efectivo USD', amountUsd: 5.00 },
    { method: 'Efectivo Bs', amountUsd: 0.65 }
  ];
  const base = MTPTax.computeTotals({
    lines: CARRITO_MIXTO, payments: pagos, rateBcv: 40, settings: SETTINGS_CE
  });
  const conVuelto = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: pagos,
    changeUsdCashGiven: 0.51,     // se le devuelven $0,51 en efectivo
    changeRate: 40,
    rateBcv: 40,
    settings: SETTINGS_CE
  });
  assert.ok(conVuelto.igtfUsd < base.igtfUsd,
    'el vuelto en USD debe reducir el IGTF (' + base.igtfUsd + ' vs ' + conVuelto.igtfUsd + ')');
});

test('T4: Sin IGTF cuando el negocio NO es Contribuyente Especial', () => {
  const r = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    rateBcv: 40, settings: SETTINGS_NO_CE
  });
  assert.strictEqual(r.igtfUsd, 0, 'no debe haber IGTF');
});

test('T5: La tarjeta genera IGTF solo si la terminal liquida en USD', () => {
  const enUsd = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Punto de Venta', amountUsd: 10, liquidationCurrency: 'USD' }],
    rateBcv: 40, settings: SETTINGS_CE
  });
  const enBs = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Punto de Venta', amountUsd: 10, liquidationCurrency: 'VES' }],
    rateBcv: 40, settings: SETTINGS_CE
  });
  assert.ok(enUsd.igtfUsd > 0, 'tarjeta liquidada en USD debe generar IGTF');
  assert.strictEqual(enBs.igtfUsd, 0, 'tarjeta liquidada en Bs no debe generar IGTF');
});

test('T6: El pago móvil (Bs) NO genera IGTF', () => {
  const r = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Pago Móvil', amountUsd: 10 }],
    rateBcv: 40, settings: SETTINGS_CE
  });
  assert.strictEqual(r.igtfUsd, 0, 'el pago móvil no genera IGTF');
});

test('T7: El vuelto se reporta completo en sus tres componentes', () => {
  const r = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    changeUsdCashGiven: 2,        // 2,00 US$ en efectivo
    changeBsCashGiven: 1,         // 1,00 Bs   en efectivo
    changeBsPmGiven: 0,           // 0,00 Bs   por pago móvil
    changeRate: 40,
    rateBcv: 40,
    settings: SETTINGS_CE
  });
  assert.strictEqual(r.changeUsdCashCents, 200, 'efectivo US$ mal registrado');
  assert.strictEqual(r.changeBsCashCents, 100, 'efectivo Bs mal registrado');
  // 2,00 US$ + 1,00 Bs (a 40 Bs/$) = 2,00 + 0,025 = 2,025 → 2,03 US$
  assert.strictEqual(r.changeTotalUsd, 2.03, 'el vuelto total en USD está mal');
  // 2,00 US$ a 40 Bs = 80,00 Bs + 1,00 Bs = 81,00 Bs
  assert.strictEqual(r.changeTotalBs, 81.00, 'el vuelto total en Bs está mal');
});

test('T8: La harina P.A.N. es exenta y no lleva IVA', () => {
  const r = MTPTax.computeTotals({
    lines: [{ refId: 'prod-harina-pan', name: 'Harina P.A.N.', qty: 1, priceUsd: 1.20 }],
    payments: [], rateBcv: 40, settings: SETTINGS_NO_CE
  });
  assert.strictEqual(r.totalIvaUsd, 0, 'la harina no debe llevar IVA');
  assert.strictEqual(r.exentoUsd, 1.20, 'la harina debe estar en el exento');
  assert.strictEqual(r.totalUsd, 1.20, 'el total de la harina exenta es el precio');
});

test('T9: La comida preparada SIEMPRE grava 16% (aunque su ingrediente sea exento)', () => {
  const r = MTPTax.computeTotals({
    lines: EMPANADAS, payments: [], rateBcv: 40, settings: SETTINGS_NO_CE
  });
  assert.strictEqual(r.baseG16Usd, 2.60, 'las empanadas deben ir a la base 16%');
  assert.strictEqual(r.totalIvaUsd, 0.42, 'IVA de 2.60 al 16% = 0.42');
  assert.strictEqual(r.totalUsd, 3.02, 'total con IVA');
});

test('T10: El desglose del vuelto usa billetes reales y no deja centavos', () => {
  const r = MTPChange.breakDown(7.66, 40, 0.50);
  assert.strictEqual(r.usd, 7, 'parte entera en USD');
  // 0,66 US$ x 40 Bs = 26,40 Bs → redondeado a moneda de 0,50 = 26,50 Bs
  assert.strictEqual(r.bs, 26.50, 'el resto en Bs debe redondearse a 0,50');
  const suma = r.bills.reduce((a, b) => a + b.amount, 0);
  assert.strictEqual(suma, 7, 'los billetes deben sumar exactamente la parte entera');
  assert.ok(r.text.indexOf('$5') >= 0 && r.text.indexOf('$2') >= 0, 'debe proponer $5 + $2');
});

test('T11: El desglose en Bs usa las denominaciones Genuinas', () => {
  const r = MTPChange.breakDownBs(2750);
  const total = r.reduce((a, b) => a + b.amount, 0);
  assert.strictEqual(Number(total.toFixed(2)), 2750, 'el desglose en Bs debe sumar exacto');
  const denom = r.map(x => x.denom);
  assert.ok(denom.indexOf(2000) >= 0, 'debe usar el billete de Bs 2000');
  assert.ok(denom.indexOf(500) >= 0, 'debe usar el billete de Bs 500');
});

test('T12: La navegación porterminal NO genera IGTF (no es divisa)', () => {
  const r = MTPTax.computeTotals({
    lines: CARRITO_MIXTO,
    payments: [{ method: 'Efectivo Bs', amountUsd: 10 }],
    rateBcv: 40, settings: SETTINGS_CE
  });
  assert.strictEqual(r.igtfUsd, 0, 'el efectivo en Bs no genera IGTF');
});

console.log('\n' + (process.exitCode ? '❌ Hubo pruebas fallidas' : '✅ Pruebas de caja: ' + passed + '/12 OK') + '\n');
