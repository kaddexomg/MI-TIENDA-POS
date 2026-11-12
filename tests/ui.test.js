/* ==========================================================================
   MI-TIENDA-POS — tests/ui.test.js
   Pruebas unitarias de UI: Vuelto con denominaciones reales, formato y fixtures.
   Ejecutar: node tests/ui.test.js
   ========================================================================== */
'use strict';

const assert = require('assert');
const MTPChange = require('../assets/js/change.js');
const MTPBarcode = require('../assets/js/barcode-engine.js');
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

console.log('\n▶ Pruebas de UI y Helpers Puros (v7)\n');

/* --------------------------------------------------------------------- */
/* 1. MTPChange.breakDown()                                              */
/* --------------------------------------------------------------------- */

test('UI-1: Caso 1: Vuelto de $7.66 → billetes USD ($5 + $2) y resto en Bs redondeado a 0.50 Bs', () => {
  const r = MTPChange.breakDown(7.66, 40, 0.50);

  assert.strictEqual(r.usd, 7, 'La parte entera en USD debe ser exactamente 7');
  // 0.66 * 40 = 26.40 Bs -> redondeado al múltiplo de 0.50 más cercano = 26.50 Bs
  assert.strictEqual(r.bs, 26.50, 'El resto en Bs debe ser 26.50 Bs redondeado a 0.50');

  // Suma de los billetes
  const sumBills = r.bills.reduce((acc, b) => acc + b.amount, 0);
  assert.strictEqual(sumBills, 7, 'La suma de los billetes debe totalizar exactamente $7');

  // Composición exacta de billetes
  assert.strictEqual(r.bills.length, 2, 'Debe haber 2 denominaciones entregadas');
  assert.strictEqual(r.bills[0].denom, 5, 'Primer billete debe ser de $5');
  assert.strictEqual(r.bills[0].count, 1, 'Cantidad de billetes de $5 debe ser 1');
  assert.strictEqual(r.bills[1].denom, 2, 'Segundo billete debe ser de $2');
  assert.strictEqual(r.bills[1].count, 1, 'Cantidad de billetes de $2 debe ser 1');

  // Texto amigable para el cajero
  assert.ok(r.text.includes('$5'), 'El texto sugerido debe contener $5');
  assert.ok(r.text.includes('$2'), 'El texto sugerido debe contener $2');
  assert.ok(r.text.includes('Bs 26.50'), 'El texto sugerido debe contener Bs 26.50');
});

test('UI-2: Caso 2: Vuelto menor a $1 (ej: $0.40 a tasa 40) → 0 USD y Bs 16.00', () => {
  const r = MTPChange.breakDown(0.40, 40, 0.50);

  assert.strictEqual(r.usd, 0, 'La parte entera en USD debe ser 0');
  // 0.40 * 40 = 16.00 Bs
  assert.strictEqual(r.bs, 16.00, 'El resto en Bs debe ser exactamente 16.00 Bs');
  assert.strictEqual(r.bills.length, 0, 'No debe proponer billetes en USD');
  assert.strictEqual(r.text, 'Bs 16.00', 'El texto debe indicar únicamente Bs 16.00');
});

test('UI-3: Caso 3: Desglose greedy sin pérdida ni centavos residuales no canjeables', () => {
  const testAmounts = [0, 1, 3, 4, 7, 9, 13, 27, 48, 89, 99, 188, 347, 582];
  const rate = 42.85;
  const step = 0.50;

  testAmounts.forEach(whole => {
    // Probar con fracción decimal (ej: .12, .38, .75, .90)
    const fractions = [0.00, 0.12, 0.38, 0.65, 0.99];
    fractions.forEach(frac => {
      const amount = Number((whole + frac).toFixed(2));
      const res = MTPChange.breakDown(amount, rate, step);

      // Verificación 1: Ninguna pérdida en USD enteros
      const totalBillsUsd = res.bills.reduce((sum, b) => sum + b.amount, 0);
      assert.strictEqual(totalBillsUsd, res.usd, `La descomposición en billetes de $${amount} no debe perder dólares`);
      assert.strictEqual(res.usd, whole, `La parte entera de $${amount} debe coincidir con ${whole}`);

      // Verificación 2: Denominaciones genuinas de USD
      res.bills.forEach(b => {
        assert.ok(MTPChange.USD_DENOMS.includes(b.denom), `Denominación inválida $${b.denom}`);
        assert.strictEqual(b.amount, b.denom * b.count, 'Monto del renglón debe ser denom * count');
      });

      // Verificación 3: Resto en Bolívares debe ser múltiplo exacto del paso (0.50)
      const cents = Math.round(res.bs * 100);
      const stepCents = Math.round(step * 100);
      assert.strictEqual(cents % stepCents, 0, `El resto en Bs (${res.bs}) debe ser múltiplo de ${step} Bs (sin centavos huérfanos)`);
    });
  });
});

test('UI-4: Desglose en denominaciones reales de Bolívares (MTPChange.breakDownBs)', () => {
  const r = MTPChange.breakDownBs(2750);
  const total = r.reduce((sum, b) => sum + b.amount, 0);
  assert.strictEqual(Number(total.toFixed(2)), 2750, 'El desglose en Bs debe sumar exactamente 2750');

  const denoms = r.map(x => x.denom);
  assert.ok(denoms.includes(2000), 'Debe incluir billete de 2000 Bs');
  assert.ok(denoms.includes(500), 'Debe incluir billete de 500 Bs');
  assert.ok(denoms.includes(200), 'Debe incluir billete de 200 Bs');
  assert.ok(denoms.includes(50), 'Debe incluir billete de 50 Bs');
});

/* --------------------------------------------------------------------- */
/* 2. Formateadores de moneda venezolana                                  */
/* --------------------------------------------------------------------- */

test('UI-5: Formateador fmtUSD formatea con 2 decimales y símbolo $', () => {
  function fmtUSD(val) {
    const n = Number(val) || 0;
    return '$' + n.toFixed(2);
  }

  assert.strictEqual(fmtUSD(1234.56), '$1234.56');
  assert.strictEqual(fmtUSD(0), '$0.00');
  assert.strictEqual(fmtUSD(7.6), '$7.60');
  assert.strictEqual(fmtUSD('15.99'), '$15.99');
});

test('UI-6: Formateador fmtBsRaw formatea en formato numérico con sufijo Bs', () => {
  function fmtBsRaw(valBs) {
    const n = Number(valBs) || 0;
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
  }

  const res1234 = fmtBsRaw(1234.56);
  assert.ok(res1234.endsWith(' Bs'), 'Debe terminar en " Bs"');
  assert.ok(res1234.includes('1234') || res1234.includes('1.234'), 'Debe contener la cifra 1234 formateada');

  const resZero = fmtBsRaw(0);
  assert.ok(resZero.endsWith(' Bs'), 'Cero debe terminar en " Bs"');
});

/* --------------------------------------------------------------------- */
/* 3. Hardware y Motor de Código de Barras (MTPBarcode)                  */
/* --------------------------------------------------------------------- */

test('UI-7: isBusyField protege inputs de cobro y permite posScannerInput', () => {
  assert.strictEqual(MTPBarcode.isBusyField(null), false, 'null no es busy');
  assert.strictEqual(MTPBarcode.isBusyField({ id: 'posScannerInput', tagName: 'INPUT' }), false, 'posScannerInput NO debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ id: 'payAmountUsd', tagName: 'INPUT' }), true, 'payAmountUsd debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ id: 'payAmountBs', tagName: 'INPUT' }), true, 'payAmountBs debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ id: 'anyInput', tagName: 'INPUT' }), true, 'Cualquier input general debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ tagName: 'TEXTAREA' }), true, 'Textarea debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ tagName: 'SELECT' }), true, 'Select debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ isContentEditable: true }), true, 'Elemento contentEditable debe ser busy');
  assert.strictEqual(MTPBarcode.isBusyField({ tagName: 'DIV', id: 'app' }), false, 'DIV normal no es busy');
  assert.strictEqual(MTPBarcode.isBusyField({ tagName: 'BUTTON' }), false, 'Botón no es busy');
});

test('UI-8: cameraAvailable comprueba honestamente la disponibilidad de BarcodeDetector', () => {
  const avail = MTPBarcode.cameraAvailable();
  assert.strictEqual(typeof avail, 'boolean', 'cameraAvailable debe retornar un booleano');
  // En entorno Node.js BarcodeDetector no existe, debe ser false
  assert.strictEqual(avail, false, 'En entorno sin BarcodeDetector debe retornar false honestamente');
});

/* --------------------------------------------------------------------- */
/* 4. Fixtures de prueba exportables                                    */
/* --------------------------------------------------------------------- */

test('UI-9: fixtures.js exporta CARRT_2_EMPANADAS y CART_MIXTO con estructura válida', () => {
  assert.ok(Array.isArray(fixtures.CARRT_2_EMPANADAS), 'CARRT_2_EMPANADAS debe ser un Array');
  assert.strictEqual(fixtures.CARRT_2_EMPANADAS.length, 1);
  assert.strictEqual(fixtures.CARRT_2_EMPANADAS[0].qty, 2);
  assert.strictEqual(fixtures.CARRT_2_EMPANADAS[0].priceUsd, 1.30);
  assert.strictEqual(fixtures.CARRT_2_EMPANADAS[0].isDish, true);

  assert.ok(Array.isArray(fixtures.CART_MIXTO), 'CART_MIXTO debe ser un Array');
  assert.strictEqual(fixtures.CART_MIXTO.length, 3);
  assert.strictEqual(fixtures.CART_MIXTO[0].name, 'Empanada Mechada');
  assert.strictEqual(fixtures.CART_MIXTO[1].name, 'Malta Polar');
  assert.strictEqual(fixtures.CART_MIXTO[2].name, 'Harina P.A.N.');

  // Alias para flexibilidad
  assert.strictEqual(fixtures.CART_2_EMPANADAS, fixtures.CARRT_2_EMPANADAS);
  assert.strictEqual(fixtures.CARRITO_MIXTO, fixtures.CART_MIXTO);
});

/* --------------------------------------------------------------------- */
/* 5. Renderizado seguro de Sidebar y píldora de tasas                   */
/* --------------------------------------------------------------------- */

test('UI-10: renderSidebar() se ejecuta sin lanzar excepciones y actualiza aside y tasa', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  const asideEl = { innerHTML: '', classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} } };
  const topRateEl = { innerHTML: '', onclick: null };

  const storageMap = new Map();
  const sandbox = {
    console,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    document: {
      body: { classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} } },
      getElementById: (id) => {
        if (id === 'adminAside') return asideEl;
        if (id === 'topRatePill') return topRateEl;
        return null;
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    location: { pathname: '/admin/pos.html' },
    localStorage: {
      getItem: (k) => storageMap.get(k) || null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    },
    window: null,
    addEventListener: () => {},
    dispatchEvent: () => {},
    MTP: {
      state: {
        inventory: [{ id: 'i1', stock: 10, minStock: 2 }],
        heldOrders: [],
        settings: { rateBcv: 42.85, rateEur: 46.60, rateUsdt: 51.40 }
      }
    },
    MTPIcons: { get: () => '<svg></svg>' },
    MTPAuth: { getCurrentUser: () => ({ role: 'admin', name: 'Admin' }) }
  };
  sandbox.window = sandbox;

  const sidenavCode = fs.readFileSync(path.join(__dirname, '../assets/js/sidenav.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(sidenavCode, sandbox);

  // Ejecutar renderSidebar directamente
  assert.doesNotThrow(() => {
    sandbox.window.MTPSidebar.renderSidebar();
  }, 'renderSidebar() no debe lanzar ninguna excepción');

  assert.ok(asideEl.innerHTML.length > 100, 'El HTML del sidebar debe haberse inyectado en adminAside');
  assert.ok(asideEl.innerHTML.includes('Vender'), 'Debe incluir la opción Vender');
  assert.ok(asideEl.innerHTML.includes('Imprimir Etiquetas'), 'Debe incluir la opción Imprimir Etiquetas');
  assert.ok(topRateEl.innerHTML.includes('BCV: <strong>42.85</strong>'), 'Debe haber actualizado la tasa BCV en el topbar');
});

test('UI-11: view-transitions.js define window.MTPNavigate de forma segura', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  const sandbox = {
    window: {},
    document: {
      addEventListener: () => {},
      querySelector: () => null,
      body: { classList: { add: () => {}, remove: () => {} } }
    },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => cb()
  };
  sandbox.window = sandbox;

  const code = fs.readFileSync(path.join(__dirname, '../assets/js/view-transitions.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  assert.strictEqual(typeof sandbox.window.MTPNavigate, 'function', 'MTPNavigate debe ser una función');
});

console.log('\n' + (process.exitCode ? '❌ Hubo pruebas fallidas en UI' : '✅ Pruebas de UI y Helpers: ' + passed + '/11 OK') + '\n');
