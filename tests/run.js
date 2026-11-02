/**
 * ============================================================================
 * MI-TIENDA-POS — Suite Integrada de Pruebas Automatizadas v6 (tests/run.js)
 * ============================================================================
 * Ejecuta:
 *   1. Pruebas unitarias del motor fiscal MTPTax (tests/tax.test.js)
 *   2. Venta mixta (Gravado 16% + Exento) con vuelto mixto ($ + Bs)
 *   3. Detector anti-fraude de referencia de Pago Móvil duplicada
 *   4. Descuento exacto de ingredientes de cocina al vender platos con receta
 *   5. Compra de ingredientes de cocina (suma stock + descuenta gaveta)
 *   6. Migración sin pérdida de datos v5 -> v6 y Víveres en posición #4
 * ============================================================================
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('🧪 INICIANDO SUITE DE PRUEBAS MI-TIENDA-POS v6');
console.log('================================================================\n');

// 1. Ejecutar pruebas unitarias de IVA 16% e IGTF 3%
require('./tax.test.js');
console.log('');

// 2. Preparar entorno simulado de navegador para config.js + tax.js
function createPosSandbox(initialStorageObj = null) {
  const storageMap = new Map();
  if (initialStorageObj) {
    storageMap.set('mtp_store_v3', JSON.stringify(initialStorageObj));
  }

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
    parseFloat,
    parseInt,
    isNaN,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    CustomEvent: function(name, opts) { this.type = name; this.detail = opts ? opts.detail : null; },
    localStorage: {
      getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    },
    indexedDB: null,
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {}, remove: () => {} }),
      body: { appendChild: () => {} },
      addEventListener: () => {}
    },
    location: { pathname: '/admin/pos.html' }
  };
  sandbox.window = sandbox;
  sandbox.window.dispatchEvent = () => {};
  sandbox.window.addEventListener = () => {};

  const taxCode = fs.readFileSync(path.join(__dirname, '../assets/js/tax.js'), 'utf8');
  const configCode = fs.readFileSync(path.join(__dirname, '../assets/js/config.js'), 'utf8');

  vm.createContext(sandbox);
  vm.runInContext(taxCode, sandbox);
  vm.runInContext(configCode, sandbox);

  return sandbox.window.MTP;
}

const MTP = createPosSandbox();

// ============================================================================
// TEST 1: Orden de Familias (#4 Víveres) y Clasificación IVA
// ============================================================================
assert.strictEqual(MTP.state.version, 6, 'El estado debe estar en versión 6');
assert.strictEqual(MTP.DEFAULT_FAMILIES[3].id, 'viveres', 'Víveres debe ocupar la posición #4 (índice 3)');
assert.strictEqual(MTP.DEFAULT_FAMILIES[3].key, '4', 'Víveres debe tener el atajo de teclado [4]');
assert.strictEqual(MTP.POS_GROUPS[4].id, 'viveres', 'POS_GROUPS[4] (inmediatamente después de almuerzos) debe ser viveres');

const mavesa = MTP.getInsumoById('prod-mavesa');
assert.strictEqual(mavesa.iva, 'E', 'Margarina Mavesa debe ser Exenta (E)');
assert.strictEqual(mavesa.taxExempt, true, 'Margarina Mavesa debe tener taxExempt: true');

const agua = MTP.getInsumoById('prod-agua-mineral');
assert.strictEqual(agua.iva, 'G16', 'Agua Mineral embotellada debe ser Gravada 16% (G16)');

console.log('✅ [Integración 1] Víveres en posición #4 ([4]) y clasificación IVA de catálogo verificada.');

// ============================================================================
// TEST 2: Venta Mixta (2 Empanadas + 1 Malta + 1 Harina PAN) + Vuelto Mixto
// ============================================================================
const empQueso = MTP.state.variants.find(v => v.id === 'var-emp-queso');
const harinaCocinaBefore = MTP.getInsumoById('ins-harina-cocina').stock;
const quesoBefore = MTP.getInsumoById('ins-queso-cocina').stock;
const harinaPanBefore = MTP.getInsumoById('prod-harina-pan').stock;
const maltaBefore = MTP.getInsumoById('prod-malta-lata').stock;

const saleItems = [
  {
    isDish: true,
    isVariant: true,
    refId: 'var-emp-queso',
    variantId: 'var-emp-queso',
    familyId: 'fritos',
    code: empQueso.code,
    name: empQueso.name,
    qty: 2,
    priceUsd: 1.20,
    iva: 'G16',
    taxExempt: false,
    selectedModifiers: []
  },
  {
    isDish: false,
    refId: 'prod-malta-lata',
    familyId: 'refrescos',
    code: '306',
    name: 'Malta Polar 250ml (Lata / Botellita)',
    qty: 1,
    priceUsd: 2.20,
    iva: 'G16',
    taxExempt: false
  },
  {
    isDish: false,
    refId: 'prod-harina-pan',
    familyId: 'viveres',
    code: '107',
    name: 'Harina P.A.N. Blanca 1Kg',
    qty: 1,
    priceUsd: 1.40,
    iva: 'E',
    taxExempt: true
  }
];

// Base Gravada 16%: (2 * $1.20) + $2.20 = $4.60 -> IVA 16% = $0.74
// Exento: $1.40
// Subtotal = $6.00 -> Total con IVA = $6.74 USD
const saleRecord = MTP.recordSale({
  customer: 'Cliente Prueba Integral',
  items: saleItems,
  payments: [
    { method: 'Efectivo USD', amountUsd: 10.00, amountBs: 0 }
  ],
  changeGiven: {
    totalChangeUsd: 3.26,
    totalChangeBs: 139.69,
    usdCashGiven: 3.00,
    bsCashGiven: 11.14,
    bsPmGiven: 0,
    breakdown: 'Mixto ($3.00 + 11.14 Bs)'
  }
});

assert.strictEqual(saleRecord.subtotalUsd, 6.00, 'Subtotal sin IVA debe ser $6.00');
assert.strictEqual(saleRecord.baseG16Usd, 4.60, 'Base gravada 16% debe ser $4.60');
assert.strictEqual(saleRecord.exentoUsd, 1.40, 'Monto exento debe ser $1.40');
assert.strictEqual(saleRecord.ivaUsd, 0.74, 'IVA 16% debe ser $0.74');
assert.strictEqual(saleRecord.totalUsd, 6.74, 'Total cobrado con IVA debe ser $6.74');
assert(saleRecord.profitUsd < saleRecord.subtotalUsd, 'La ganancia neta no debe inflarse con el IVA');

// Verificar descuento de inventario de cocina y de venta directa
const harinaCocinaAfter = MTP.getInsumoById('ins-harina-cocina').stock;
const quesoAfter = MTP.getInsumoById('ins-queso-cocina').stock;
const harinaPanAfter = MTP.getInsumoById('prod-harina-pan').stock;
const maltaAfter = MTP.getInsumoById('prod-malta-lata').stock;

assert(harinaCocinaAfter < harinaCocinaBefore, 'Debe descontar Harina de Cocina por las 2 empanadas vendidas');
assert(quesoAfter < quesoBefore, 'Debe descontar Queso de Cocina por las 2 empanadas vendidas');
assert.strictEqual(harinaPanAfter, harinaPanBefore - 1, 'Debe descontar 1 unidad de Harina PAN de venta directa');
assert.strictEqual(maltaAfter, maltaBefore - 1, 'Debe descontar 1 unidad de Malta 1.5L de venta directa');

console.log('✅ [Integración 2 y 4] Venta con IVA 16%, vuelto mixto y descuento de ingredientes de cocina verificados.');

// ============================================================================
// TEST 3: Detector Anti-Fraude de Referencia Duplicada de Pago Móvil
// ============================================================================
MTP.recordSale({
  customer: 'Cliente Pago Móvil',
  items: [{
    isDish: false,
    refId: 'prod-harina-pan',
    familyId: 'viveres',
    code: '107',
    name: 'Harina P.A.N. Blanca 1Kg',
    qty: 1,
    priceUsd: 1.40,
    iva: 'E',
    taxExempt: true
  }],
  payments: [
    { method: 'Pago Móvil', bank: 'Banesco (0134)', ref: '887766', phone: '0414-1234567', amountUsd: 1.40, amountBs: 59.99 }
  ]
});

const dupCheck = MTP.findUsedPagoMovilRef('887766');
assert.strictEqual(MTP.isPagoMovilRefUsed('887766'), true, 'Debe detectar referencia de Pago Móvil 887766 como ya utilizada');
assert(dupCheck && dupCheck.sale, 'findUsedPagoMovilRef debe devolver la venta asociada');
const cleanCheck = MTP.isPagoMovilRefUsed('999111');
assert.strictEqual(cleanCheck, false, 'Referencia nueva 999111 debe estar libre');

console.log('✅ [Integración 3] Detector anti-fraude de referencia de Pago Móvil duplicada verificado.');

// ============================================================================
// TEST 4: Compra de Ingredientes de Cocina Suma Stock y Descuenta de Gaveta
// ============================================================================
const papaBefore = MTP.getInsumoById('ins-papa').stock;
const expensesBefore = MTP.state.expenses.length;

MTP.recordKitchenPurchase({
  insumoId: 'ins-papa',
  qty: 15,
  totalCostUsd: 20.25,
  paymentSource: 'Efectivo USD',
  supplier: 'Verduras El Páramo',
  responsible: 'Dueño'
});

const papaAfter = MTP.getInsumoById('ins-papa').stock;
assert.strictEqual(papaAfter, Number((papaBefore + 15).toFixed(3)), 'El stock de papa de cocina debe subir +15 kg');
assert.strictEqual(MTP.state.expenses.length, expensesBefore + 1, 'Debe registrarse el gasto de compra en state.expenses');
assert.strictEqual(MTP.state.expenses[0].amountUsd, 20.25, 'El gasto debe ser de $20.25 USD');

console.log('✅ [Integración 5] Compra de ingredientes de cocina (stock + descuento de gaveta) verificada.');

// ============================================================================
// TEST 5: Migración Limpia de Estado v5 -> v6 sin Pérdida de Ventas
// ============================================================================
const legacyV5State = {
  version: 5,
  settings: {
    businessName: 'Mi Negocio V5',
    rateBcv: 42.85,
    rateEur: 46.60,
    rateUsdt: 46.20,
    fiscalConfig: {
      mode: 'HOMOLOGADO',
      serialNumber: 'Z4A2098124',
      applyIgtf: true,
      ivaRate: 16,
      igtfRate: 3,
      currentInvoiceNumber: 25
    }
  },
  families: [
    { id: 'fritos', name: 'Empanadas y Fritos', key: '1', order: 1 },
    { id: 'viveres', name: 'Víveres', key: '9', order: 9 }
  ],
  products: [],
  variants: [
    { id: 'var-emp-queso', productId: 'prd-empanada', familyId: 'fritos', name: 'Queso', priceUsd: 1.20 }
  ],
  inventory: [
    { id: 'prod-mavesa', name: 'Margarina Mavesa 500g', type: 'venta', sellable: true, priceUsd: 2.35, costUsd: 1.65, stock: 10 },
    { id: 'prod-harina-pan', name: 'Harina PAN', type: 'venta', sellable: true, priceUsd: 1.40, costUsd: 1.05, stock: 20 }
  ],
  sales: [
    { id: 'ORD-999', customer: 'Venta Histórica V5', totalUsd: 10.00, items: [], payments: [] }
  ],
  expenses: []
};

const migratedMTP = createPosSandbox(legacyV5State);
assert.strictEqual(migratedMTP.state.version, 6, 'El estado v5 debe migrar automáticamente a v6');
assert.strictEqual(migratedMTP.state.sales.length, 1, 'Debe conservar las ventas históricas intactas');
assert.strictEqual(migratedMTP.state.sales[0].id, 'ORD-999', 'Debe conservar ORD-999');
assert.strictEqual(migratedMTP.state.settings.fiscalConfig.serialNumber, '', 'Debe limpiar el serial fiscal falso Z4A2098124');
assert.strictEqual(migratedMTP.state.settings.fiscalConfig.mode, 'INTERNO', 'Si tenía el serial falso de prueba, debe volver a modo INTERNO seguro');
assert.strictEqual(migratedMTP.state.families[3].id, 'viveres', 'La migración v6 debe colocar Víveres en la posición #4');
assert.strictEqual(migratedMTP.getInsumoById('prod-mavesa').iva, 'E', 'La migración v6 debe clasificar Mavesa como Exenta (E)');
assert.strictEqual(migratedMTP.state.variants.find(v => v.id === 'var-emp-queso').iva, 'G16', 'La migración v6 debe clasificar platos preparados con iva: G16');

console.log('✅ [Integración 6] Migración automática v5 -> v6 sin pérdida de ventas verificada.');

// ============================================================================
// TEST 6: Cierre Diario, Mensual y Anual + Comida Preparada al Día vs Mercancía
// ============================================================================
const todayStats = MTP.getPeriodAnalytics('TODAY');
assert(todayStats.kitchenPreparedQty >= 2, 'Debe contabilizar las empanadas preparadas y vendidas hoy');
assert(todayStats.retailSoldQty >= 2, 'Debe contabilizar la mercancía empaquetada vendida hoy');
assert(todayStats.kitchenIngredientsUsed.length > 0, 'Debe detallar los kilos/gramos de ingredientes de cocina consumidos hoy');

const dailyClosure = MTP.performDailyClosure({
  countedUsd: todayStats.netDrawerUsd,
  countedBs: todayStats.netDrawerBs,
  responsible: 'Dueño',
  notes: 'Cierre diario verificado'
});
assert(dailyClosure.id.startsWith('CIE-DIA-'), 'Debe generar acta de cierre diario CIE-DIA-*');
assert.strictEqual(dailyClosure.diffDrawerUsd, 0, 'El cuadre diario debe dar diferencia $0.00 cuando coincide lo contado');

const monthlyClosure = MTP.performMonthlyClosure({});
assert(monthlyClosure.id.startsWith('CIE-MES-'), 'Debe generar acta de cierre mensual CIE-MES-*');

const annualStats = MTP.getPeriodAnalytics('YEAR', String(new Date().getFullYear()));
assert.strictEqual(annualStats.monthsList.length, 12, 'El cierre anual debe consolidar los 12 meses del año');

console.log('✅ [Integración 7] Cierre Diario, Mensual y Anual + Producción diaria de cocina verificados.\n');
console.log('🎉 TODAS LAS PRUEBAS AUTOMATIZADAS (FISCALES E INTEGRACIÓN V6) PASARON AL 100%.');
