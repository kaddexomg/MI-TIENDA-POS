/* ==========================================================================
   PRUEBAS AUTOMATIZADAS — Motor Fiscal Venezolano (MTPTax)
   Casos obligatorios §1.4 de PLAN_ESTABILIZACION_V6.md
   ========================================================================== */
const assert = require('assert');
const MTPTax = require('../assets/js/core/tax.js');

function runTaxTests() {
  console.log('--- Ejecutando pruebas de MTPTax (IVA 16%, Exentos Art. 18 e IGTF 3%) ---');

  const linesCaseA = [
    { refId: 'var-emp-mechada', name: 'Empanada de Mechada', qty: 2, priceUsd: 1.30, isDish: true, iva: 'G16' },
    { refId: 'inv-malta-250', name: 'Malta Polar 250ml', qty: 1, priceUsd: 0.80, isDish: false, iva: 'G16' },
    { refId: 'inv-harina-pan-blanca', name: 'Harina P.A.N. Blanca 1Kg', qty: 1, priceUsd: 1.20, isDish: false, iva: 'E' }
  ];

  // Caso A: 2 Empanada Mechada ($1.30) + 1 Malta ($0.80) + 1 Harina PAN ($1.20), modo RECARGO, sin IGTF
  const resA = MTPTax.computeTotals({
    lines: linesCaseA,
    payments: [],
    rateBcv: 42.85,
    settings: { ivaMode: 'RECARGO', isContribuyenteEspecial: false }
  });

  assert.strictEqual(resA.exentoUsd, 1.20, 'Caso A: Exento debe ser $1.20');
  assert.strictEqual(resA.baseG16Usd, 3.40, 'Caso A: Base 16% debe ser $3.40');
  assert.strictEqual(resA.iva16Usd, 0.54, 'Caso A: IVA 16% debe ser $0.54');
  assert.strictEqual(resA.igtfUsd, 0.00, 'Caso A: IGTF debe ser $0.00 cuando no es Contribuyente Especial');
  assert.strictEqual(resA.totalUsd, 5.14, 'Caso A: Total debe ser $5.14');
  console.log('✅ Caso A superado: Exento $1.20 · Base 16% $3.40 · IVA $0.54 · Total $5.14');

  // Caso B: Caso A pagado completo en efectivo USD, Contribuyente Especial
  const resB = MTPTax.computeTotals({
    lines: linesCaseA,
    payments: [{ method: 'Efectivo USD', amountUsd: 5.14 }],
    rateBcv: 42.85,
    settings: { ivaMode: 'RECARGO', isContribuyenteEspecial: true }
  });

  assert.strictEqual(resB.igtfUsd, 0.15, 'Caso B: IGTF 3% de $5.14 debe ser $0.15');
  assert.strictEqual(resB.totalUsd, 5.29, 'Caso B: Total con IGTF debe ser $5.29');
  console.log('✅ Caso B superado: IGTF 3% de $5.14 = $0.15 · Total $5.29');

  // Caso C: Caso A pagado mitad Pago Móvil ($3.14) y parte USD ($2.00), Contribuyente Especial
  const resC = MTPTax.computeTotals({
    lines: linesCaseA,
    payments: [
      { method: 'Pago Móvil', amountUsd: 3.14 },
      { method: 'Efectivo USD', amountUsd: 2.00 }
    ],
    rateBcv: 42.85,
    settings: { ivaMode: 'RECARGO', isContribuyenteEspecial: true }
  });

  assert.strictEqual(resC.igtfBaseUsd, 2.00, 'Caso C: Base IGTF debe ser solo los $2.00 pagados en USD');
  assert.strictEqual(resC.igtfUsd, 0.06, 'Caso C: IGTF 3% de $2.00 debe ser $0.06');
  assert.strictEqual(resC.totalUsd, 5.20, 'Caso C: Total debe ser $5.20');
  console.log('✅ Caso C superado: IGTF mixto solo sobre porción en USD ($2.00 -> $0.06 IGTF, Total $5.20)');

  // Caso C2: Pago con billete de $10 USD y vuelto de $4 USD en efectivo USD (neto $6 -> tope $5.14)
  const resC2 = MTPTax.computeTotals({
    lines: linesCaseA,
    payments: [{ method: 'Efectivo USD', amountUsd: 10.00 }],
    changeUsdCashGiven: 6.00, // Vuelto en divisas: neto pagado en USD = $4.00
    rateBcv: 42.85,
    settings: { ivaMode: 'RECARGO', isContribuyenteEspecial: true }
  });
  assert.strictEqual(resC2.igtfBaseUsd, 4.00, 'Caso C2: Base IGTF descuenta vuelto en USD');
  assert.strictEqual(resC2.igtfUsd, 0.12, 'Caso C2: IGTF 3% de $4.00 debe ser $0.12');

  // Caso D: Modo INCLUIDO, empanada de $1.16
  const resD = MTPTax.computeTotals({
    lines: [{ refId: 'var-emp-queso', name: 'Empanada de Queso', qty: 1, priceUsd: 1.16, isDish: true }],
    payments: [],
    rateBcv: 42.85,
    settings: { ivaMode: 'INCLUIDO', isContribuyenteEspecial: false }
  });

  assert.strictEqual(resD.baseG16Usd, 1.00, 'Caso D: Base en modo INCLUIDO debe ser $1.00');
  assert.strictEqual(resD.iva16Usd, 0.16, 'Caso D: IVA en modo INCLUIDO debe ser $0.16');
  assert.strictEqual(resD.totalUsd, 1.16, 'Caso D: Total en modo INCLUIDO debe ser $1.16');
  console.log('✅ Caso D superado: Modo INCLUIDO ($1.16 -> Base $1.00 + IVA $0.16 = $1.16)');

  // Caso E: Solo víveres exentos
  const resE = MTPTax.computeTotals({
    lines: [
      { refId: 'inv-harina-pan-blanca', name: 'Harina PAN Blanca', qty: 2, priceUsd: 1.20, isDish: false },
      { refId: 'inv-arroz-blanco', name: 'Arroz Primor 1Kg', qty: 1, priceUsd: 1.35, isDish: false }
    ],
    payments: [],
    rateBcv: 42.85,
    settings: { ivaMode: 'RECARGO', isContribuyenteEspecial: false }
  });

  assert.strictEqual(resE.exentoUsd, 3.75, 'Caso E: Exento debe ser $3.75');
  assert.strictEqual(resE.totalIvaUsd, 0.00, 'Caso E: IVA en víveres exentos debe ser $0.00');
  assert.strictEqual(resE.totalUsd, 3.75, 'Caso E: Total debe ser $3.75');
  console.log('✅ Caso E superado: Solo víveres exentos ($3.75, IVA $0.00)');

  // Caso F: Consistencia exacta en Bolívares (centavos × tasa BCV)
  const expectedBs = Number(((resA.totalCents * 42.85) / 100).toFixed(2));
  assert.strictEqual(resA.totalBs, expectedBs, 'Caso F: Total en Bs debe coincidir al céntimo con centavos × BCV');
  console.log(`✅ Caso F superado: Total Bs exacto (${resA.totalBs} Bs a tasa 42.85)`);

  // Clasificación automática de comida preparada aunque tenga ivaType:'E' viejo
  assert.strictEqual(
    MTPTax.classify({ id: 'var-arepa-reina', familyId: 'arepas', isDish: true, ivaType: 'E' }),
    'G16',
    'Comida preparada siempre debe clasificarse G16'
  );
  assert.strictEqual(
    MTPTax.classify({ id: 'inv-agua-500', familyId: 'bebidas', taxExempt: true }),
    'G16',
    'Agua mineral debe quedar G16 por defecto hasta confirmación del contador'
  );
  console.log('✅ Clasificación legal de platos preparados y víveres verificada.');
}

if (require.main === module) {
  runTaxTests();
}

module.exports = { runTaxTests };
