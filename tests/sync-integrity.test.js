/**
 * ============================================================================
 * MI-TIENDA-POS — Pruebas de Integridad de Sincronización y Datos (tests/sync-integrity.test.js)
 * ============================================================================
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createStorageSandbox(sharedStorageMap) {
  const storageMap = sharedStorageMap || new Map();
  const emittedEvents = [];

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
    CustomEvent: function (name, opts) {
      this.type = name;
      this.detail = opts ? opts.detail : null;
    },
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    },
    indexedDB: null,
    document: {
      getElementById: () => null,
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        remove: () => {}
      }),
      body: { appendChild: () => {} },
      addEventListener: () => {}
    },
    location: { pathname: '/admin/inventario.html' }
  };

  sandbox.window = sandbox;
  sandbox.window.dispatchEvent = (ev) => {
    emittedEvents.push(ev);
  };
  sandbox.window.addEventListener = () => {};
  sandbox.window.MTPApiClient = {
    onStateSaved: () => {}
  };

  const taxCode = fs.readFileSync(path.join(__dirname, '../assets/js/core/tax.js'), 'utf8');
  const configCode = fs.readFileSync(path.join(__dirname, '../assets/js/core/config.js'), 'utf8');

  vm.createContext(sandbox);
  vm.runInContext(taxCode, sandbox);
  vm.runInContext(configCode, sandbox);

  return { MTP: sandbox.window.MTP, storageMap, emittedEvents };
}

console.log('--- 🧪 Ejecutando Sync & Integrity Tests (tests/sync-integrity.test.js) ---');

// 1. Round-trip de persistencia tras adjustItemStock + saveState + recarga desde localStorage
(function testPersistenceRoundTrip() {
  const { MTP, storageMap } = createStorageSandbox();
  const retailTarget = MTP.getInsumoById('prod-harina-pan');
  const kitchenTarget = MTP.getInsumoById('ins-papa');
  assert.ok(retailTarget, 'Debe existir prod-harina-pan en inventario inicial');
  assert.ok(kitchenTarget, 'Debe existir ins-papa en inventario inicial');
  const retailBefore = Number(retailTarget.stock || 0);
  const kitchenBefore = Number(kitchenTarget.stock || 0);

  const adjRetail = MTP.adjustItemStock('prod-harina-pan', 15, {
    action: 'ENTRADA_RAPIDA',
    notes: 'Prueba round-trip venta',
    responsible: 'Tester'
  });
  const adjKitchen = MTP.adjustItemStock('ins-papa', 8, {
    action: 'ENTRADA_RAPIDA',
    notes: 'Prueba round-trip insumo',
    responsible: 'Tester'
  });
  assert.ok(adjRetail && adjKitchen, 'adjustItemStock debe retornar resumen de ajuste');
  assert.strictEqual(adjRetail.nextStock, Number((retailBefore + 15).toFixed(3)));
  assert.strictEqual(adjKitchen.nextStock, Number((kitchenBefore + 8).toFixed(3)));

  // Verificar sincronización inmediata entre inventory, retailItems e insumos
  const inInvRetail = MTP.state.inventory.find((i) => i.id === 'prod-harina-pan');
  const inRetailList = MTP.state.retailItems.find((i) => i.id === 'prod-harina-pan');
  const inInvKitchen = MTP.state.inventory.find((i) => i.id === 'ins-papa');
  const inInsumosList = MTP.state.insumos.find((i) => i.id === 'ins-papa');
  assert.strictEqual(inInvRetail.stock, adjRetail.nextStock);
  assert.strictEqual(inRetailList.stock, adjRetail.nextStock);
  assert.strictEqual(inInvKitchen.stock, adjKitchen.nextStock);
  assert.strictEqual(inInsumosList.stock, adjKitchen.nextStock);

  // Simular recarga limpia en nueva pestaña compartiendo localStorage
  const reloaded = createStorageSandbox(storageMap);
  assert.strictEqual(reloaded.MTP.state.inventory.find((i) => i.id === 'prod-harina-pan').stock, adjRetail.nextStock, 'inventory venta debe persistir tras recarga');
  assert.strictEqual(reloaded.MTP.state.retailItems.find((i) => i.id === 'prod-harina-pan').stock, adjRetail.nextStock, 'retailItems debe persistir tras recarga');
  assert.strictEqual(reloaded.MTP.state.inventory.find((i) => i.id === 'ins-papa').stock, adjKitchen.nextStock, 'inventory insumo debe persistir tras recarga');
  assert.strictEqual(reloaded.MTP.state.insumos.find((i) => i.id === 'ins-papa').stock, adjKitchen.nextStock, 'insumos debe persistir tras recarga');

  const kEntry = (reloaded.MTP.state.kardex || []).find(
    (k) => k.itemId === 'prod-harina-pan' && k.notes === 'Prueba round-trip venta'
  );
  assert.ok(kEntry, 'El movimiento de kardex debe persistir tras recarga');
  assert.strictEqual(kEntry.qty, 15);
  console.log('  ✅ [Sync 1] Round-trip adjustItemStock -> saveState -> reload mantiene stock y kardex unificados.');
})();

// 2. quickSaveItem creando tanto producto 'venta' (sellable: true) como plato 'cocina'
(function testQuickSaveBothModes() {
  const { MTP } = createStorageSandbox();

  const retailRes = MTP.quickSaveItem({
    name: 'Café Molido Fama de América 500g',
    familyId: 'viveres',
    type: 'venta',
    priceUsd: 4.5,
    costUsd: 3.1,
    stock: 12,
    minStock: 4,
    taxType: 'E',
    barcode: '7591234567890'
  });
  assert.strictEqual(retailRes.success, true);
  assert.strictEqual(retailRes.item.sellable, true, 'Producto venta debe ser sellable: true');
  assert.ok(MTP.getSellableRetail().some((i) => i.id === retailRes.item.id), 'Debe aparecer en getSellableRetail()');

  const dishRes = MTP.quickSaveItem({
    name: 'Arepa Pelúa Especial',
    familyId: 'arepas',
    type: 'cocina',
    priceUsd: 2.75,
    costUsd: 1.1,
    taxType: 'G'
  });
  assert.strictEqual(dishRes.success, true);
  assert.ok(
    MTP.state.variants.some((v) => v.id === dishRes.item.id && v.name === 'Arepa Pelúa Especial'),
    'Plato cocina debe crearse en state.variants'
  );
  console.log('  ✅ [Sync 2] quickSaveItem crea correctamente venta (sellable: true) y variante de cocina.');

  // 3. deleteProduct elimina completamente de inventory / insumos / retailItems / variants
  const delRetail = MTP.deleteProduct(retailRes.item.id);
  assert.strictEqual(delRetail, true);
  assert.strictEqual(MTP.state.inventory.some((i) => i.id === retailRes.item.id), false);
  assert.strictEqual(MTP.state.insumos.some((i) => i.id === retailRes.item.id), false);
  assert.strictEqual(MTP.state.retailItems.some((i) => i.id === retailRes.item.id), false);

  const delDish = MTP.deleteProduct(dishRes.item.id);
  assert.strictEqual(delDish, true);
  assert.strictEqual(MTP.state.variants.some((v) => v.id === dishRes.item.id), false);
  console.log('  ✅ [Sync 3] deleteProduct limpia completamente inventory, insumos, retailItems y variants.');
})();

// 4. importFullBackup migrando un respaldo v5 sin perder artículos ni ajustes
(function testImportFullBackupV5() {
  const { MTP, storageMap } = createStorageSandbox();
  const v5Backup = {
    version: 5,
    settings: {
      businessName: 'Bodega Don Pedro',
      rateBcv: 51.25,
      rateParallel: 62.5,
      ivaMode: 'RECARGO'
    },
    inventory: [
      {
        id: 'prod-custom-v5',
        code: 'V5-01',
        name: 'Avena Quaker 400g',
        familyId: 'viveres',
        type: 'venta',
        sellable: true,
        stock: 9,
        minStock: 3,
        costUsd: 1.5,
        priceUsd: 2.2,
        unit: 'und',
        active: true
      }
    ],
    variants: [],
    sales: [],
    expenses: []
  };

  MTP.importFullBackup(v5Backup);
  assert.strictEqual(MTP.state.version, 6, 'El respaldo v5 importado debe migrar a version 6');
  assert.strictEqual(MTP.state.settings.businessName, 'Bodega Don Pedro');
  assert.strictEqual(MTP.state.settings.rateBcv, 51.25);
  assert.ok(MTP.state.inventory.some((i) => i.id === 'prod-custom-v5'), 'Debe conservar artículo v5 en inventory');
  assert.ok(MTP.state.retailItems.some((i) => i.id === 'prod-custom-v5'), 'Debe sincronizar artículo v5 en retailItems');

  const reloaded = createStorageSandbox(storageMap);
  assert.strictEqual(reloaded.MTP.state.settings.businessName, 'Bodega Don Pedro');
  assert.ok(reloaded.MTP.state.inventory.some((i) => i.id === 'prod-custom-v5'));
  console.log('  ✅ [Sync 4] importFullBackup migra respaldo v5 conservando artículos, ajustes y aliases.');
})();

// 5. Resolución de códigos cortos sin guion (EM01, PAS01, 01, 1, EMP-01) y asesor fiscal SENIAT
(function testShortCodesAndTaxAdvisor() {
  const { MTP } = createStorageSandbox();
  const MTPTax = require('../assets/js/core/tax.js');

  const r1 = MTP.findByCodeOrBarcode('EM01');
  const r2 = MTP.findByCodeOrBarcode('01');
  const r3 = MTP.findByCodeOrBarcode('1');
  const r4 = MTP.findByCodeOrBarcode('EMP-01');
  const r5 = MTP.findByCodeOrBarcode('PAS01');
  const r6 = MTP.findByCodeOrBarcode('PAS1');
  assert.ok(r1 && r1.item.id === 'var-emp-queso', 'EM01 debe resolver Empanada de Queso');
  assert.ok(r2 && r2.item.id === 'var-emp-queso', '01 debe resolver Empanada de Queso');
  assert.ok(r3 && r3.item.id === 'var-emp-queso', '1 debe resolver Empanada de Queso');
  assert.ok(r4 && r4.item.id === 'var-emp-queso', 'EMP-01 legado debe resolver Empanada de Queso');
  assert.ok(r5 && r5.item.id === 'var-past-queso', 'PAS01 debe resolver Pastelito Queso');
  assert.ok(r6 && r6.item.id === 'var-past-queso', 'PAS1 debe resolver Pastelito Queso');

  const advEmp = MTPTax.explainTax('fritos', 'Empanada de Carne');
  const advViv = MTPTax.explainTax('viveres', 'Harina P.A.N.');
  const advAgua = MTPTax.explainTax('bebidas', 'Agua Mineral 500ml');
  assert.strictEqual(advEmp.code, 'G16');
  assert.strictEqual(advViv.code, 'E');
  assert.strictEqual(advAgua.code, 'G16');
  console.log('  ✅ [Sync 5] Códigos cortos (EM01/PAS01/01/EMP-01) y asesor fiscal SENIAT verificados.\n');
})();
