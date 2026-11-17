'use strict';

/**
 * tests/pagomovil-bank.test.js
 * MI-TIENDA-POS v8.5.0 — Fase 2: Lector bancario de Pago Móvil
 *
 * Cubre:
 *  1. Parser de montos venezolanos (1.250,50 / 1,250.50 / 1250.50 / Bs.S ...)
 *  2. Mensajes realistas de Banesco, Banco de Venezuela, Mercantil,
 *     Provincial y BNC/Bancamiga (monto y referencia exactos)
 *  3. Teléfono, cédula, banco por nombre/código/paquete
 *  4. Casos negativos: sin referencia, sin monto y compra con tarjeta
 *  5. Estado PAGO_MOVIL_INCOMING (inserción, deduplicación y tope 200)
 *  6. Coincidencia de venta/pago pendiente (helper de server/api.js)
 *  7. Integración HTTP real: login, venta Pago Móvil pendiente, POST del SMS,
 *     conciliación, SSE PAGO_MOVIL_VERIFIED, GET de abonos y deduplicación.
 *
 * Compatible con Node.js v13.14.0+ (assert + http, sin frameworks).
 * Se ejecuta solo (`node tests/pagomovil-bank.test.js`) y desde tests/run.js.
 */

const assert = require('assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const pagoMovilParser = require('../server/pagomovil-parser');
const journal = require('../server/journal');
const stateManager = require('../server/state');
const serverModule = require('../server/server');
const apiModule = require('../server/api');

console.log('🧪 Ejecutando pruebas del Detector Bancario de Pago Móvil...');

/* ==========================================================================
   1. Montos venezolanos
   ========================================================================== */
const amountCases = [
  ['1.250,50', 1250.5],
  ['1250,50', 1250.5],
  ['1,250.50', 1250.5],
  ['1250.50', 1250.5],
  ['Bs. 1.250,50', 1250.5],
  ['Bs 1250.50', 1250.5],
  ['VES 1.250,50', 1250.5],
  ['Bs.S 45,00', 45],
  ['BOLÍVARES 2.000', 2000],
  ['1.250.000,75', 1250000.75],
  ['45', 45],
  ['Bs. 0,50', 0.5]
];

amountCases.forEach(function (pair) {
  assert.strictEqual(
    pagoMovilParser.parseBsAmount(pair[0]),
    pair[1],
    'parseBsAmount("' + pair[0] + '") debe ser ' + pair[1]
  );
});

assert.strictEqual(pagoMovilParser.parseBsAmount('sin monto'), null, 'Texto sin dígitos debe dar null');
assert.strictEqual(pagoMovilParser.parseBsAmount(''), null, 'Texto vacío debe dar null');

console.log('  ✅ Montos venezolanos (1.250,50 · 1,250.50 · 1250.50 · Bs.S) verificados.');

/* ==========================================================================
   2. Mensajes realistas de 5 bancos venezolanos
   ========================================================================== */
const bankMessages = [
  {
    bank: 'Banesco',
    input: {
      title: 'Pago Móvil recibido',
      text: 'Banesco: Pago Movil recibido de 0414-1234567 por Bs. 1.250,50 Ref. 12345678',
      sourceApp: 'Banesco',
      sourcePackage: 'com.banesco.banca'
    },
    amount: 1250.5,
    reference: '12345678',
    phone: '04141234567',
    ci: ''
  },
  {
    bank: 'Banco de Venezuela',
    input: {
      title: 'BDV App',
      text: 'BDV App: Recibiste un Pago Movil de 04121234567 por Bs. 45,00. Referencia: 001234',
      sourceApp: 'BDV App',
      sourcePackage: 'com.bdv.app'
    },
    amount: 45,
    reference: '001234',
    phone: '04121234567',
    ci: ''
  },
  {
    bank: 'Mercantil',
    input: {
      title: 'Pago móvil recibido',
      text: 'Mercantil: Pago movil recibido. Monto: Bs.S 1,250.50. Operacion 99887766. C.I. V-12.345.678',
      sourceApp: 'Mercantil',
      sourcePackage: 'com.mercantil.banca'
    },
    amount: 1250.5,
    reference: '99887766',
    phone: '',
    ci: '12345678'
  },
  {
    bank: 'Provincial',
    input: {
      title: 'Abono recibido',
      text: 'BBVA Provincial: Abono Pago Movil por Bs 1250.50 Ref 445566',
      sourceApp: 'Provincial',
      sourcePackage: 'com.bbva.provincial'
    },
    amount: 1250.5,
    reference: '445566',
    phone: '',
    ci: ''
  },
  {
    bank: 'BNC',
    input: {
      title: 'Pago Móvil',
      text: 'Banco Nacional de Crédito (0191): Pago Movil recibido por Bs. 320,10. Nro. de referencia 123456789',
      sourceApp: 'BNC',
      sourcePackage: 'com.bnc.app'
    },
    amount: 320.1,
    reference: '123456789',
    phone: '',
    ci: ''
  },
  {
    bank: 'Bancamiga',
    input: {
      title: 'Transferencia recibida',
      text: 'Bancamiga: Transferencia recibida por 1.500,00 Bs Ref. 778899',
      sourceApp: 'Bancamiga',
      sourcePackage: 'com.bancamiga.banca'
    },
    amount: 1500,
    reference: '778899',
    phone: '',
    ci: ''
  }
];

bankMessages.forEach(function (caseItem) {
  const parsed = pagoMovilParser.parseBankMessage(caseItem.input);
  assert.strictEqual(parsed.amountBs, caseItem.amount, caseItem.bank + ': monto exacto');
  assert.strictEqual(parsed.reference, caseItem.reference, caseItem.bank + ': referencia exacta');
  assert.strictEqual(parsed.bankName, caseItem.bank, caseItem.bank + ': banco detectado');
  assert.strictEqual(parsed.isPagoMovil, true, caseItem.bank + ': es Pago Móvil');
  assert.strictEqual(parsed.phone, caseItem.phone, caseItem.bank + ': teléfono normalizado');
  assert.strictEqual(parsed.ci, caseItem.ci, caseItem.bank + ': cédula normalizada');
  assert.ok(parsed.confidence >= 0.9, caseItem.bank + ': confianza alta');
});

console.log('  ✅ Banesco, BDV, Mercantil, Provincial, BNC y Bancamiga verificados.');

/* ==========================================================================
   3. Banco por código de 4 dígitos y por paquete Android
   ========================================================================== */
const byCode = pagoMovilParser.parseBankMessage({
  text: 'Banco (0102) Pago Movil recibido por Bs. 10,00 Ref 123456'
});
assert.strictEqual(byCode.bankName, 'Banco de Venezuela', 'Código 0102 debe ser Banco de Venezuela');

const byPackage = pagoMovilParser.parseBankMessage({
  text: 'Recibiste un pago por Bs. 250,00 Ref 998877',
  sourcePackage: 'com.bancamiga.banca'
});
assert.strictEqual(byPackage.bankName, 'Bancamiga', 'Paquete com.bancamiga debe detectar Bancamiga');

const unknownBank = pagoMovilParser.parseBankMessage({
  text: 'Pago Movil recibido por Bs. 10,00 Ref 123456'
});
assert.strictEqual(unknownBank.bankName, 'Banco no identificado', 'Sin banco debe usar etiqueta genérica');
assert.ok(unknownBank.confidence < byCode.confidence, 'Sin banco la confianza debe bajar');

console.log('  ✅ Banco por nombre, código (0102/0191) y paquete Android verificado.');

/* ==========================================================================
   4. Casos límite y negativos
   ========================================================================== */
const noReference = pagoMovilParser.parseBankMessage('Pago Movil recibido por Bs. 45,00');
assert.strictEqual(noReference.amountBs, 45);
assert.strictEqual(noReference.reference, '', 'Sin referencia explícita no debe inventarla');
assert.strictEqual(noReference.isPagoMovil, true);

const noAmount = pagoMovilParser.parseBankMessage('Pago Movil Banesco recibido de Juan');
assert.strictEqual(noAmount.amountBs, null, 'Sin monto debe dar null');
assert.strictEqual(noAmount.isPagoMovil, true);

const cardPurchase = pagoMovilParser.parseBankMessage(
  'Banesco: Compra con tarjeta de débito por Bs. 320,00 en Farmatodo Ref. 556677'
);
assert.strictEqual(cardPurchase.amountBs, 320, 'La compra con tarjeta no debe confundir el monto');
assert.strictEqual(cardPurchase.reference, '556677');
assert.strictEqual(cardPurchase.isPagoMovil, false, 'Una compra con tarjeta no es Pago Móvil');

const dateMessage = pagoMovilParser.parseBankMessage(
  'Pago Movil recibido el 15/11/2026 a las 10:35 por Bs. 1.250,50 Ref. 998877'
);
assert.strictEqual(dateMessage.amountBs, 1250.5, 'La fecha no debe confundirse con el monto');
assert.strictEqual(dateMessage.reference, '998877', 'La hora/fecha no debe confundirse con la referencia');

const nroRef = pagoMovilParser.parseBankMessage('Pago Movil por Bs. 10,00 Nro. de referencia 123456789');
assert.strictEqual(nroRef.reference, '123456789');

const nroGrado = pagoMovilParser.parseBankMessage('Pago Movil por Bs. 10,00 N° 123456');
assert.strictEqual(nroGrado.reference, '123456');

const comprobante = pagoMovilParser.parseBankMessage('Pago Movil Banesco por Bs. 10,00 comprobante 1234');
assert.strictEqual(comprobante.reference, '1234');

const plusPhone = pagoMovilParser.parseBankMessage(
  'Pago Movil de +58 414-1234567 por Bs. 900,00 Ref 121212'
);
assert.strictEqual(plusPhone.phone, '04141234567', 'Teléfono +58 debe normalizarse a 0414...');
assert.strictEqual(plusPhone.amountBs, 900);
assert.strictEqual(plusPhone.reference, '121212');

console.log('  ✅ Sin referencia, sin monto, fecha/hora, compra con tarjeta y teléfono +58.');

/* ==========================================================================
   5. Deduplicación de montos: formatos equivalentes producen el mismo número
   ========================================================================== */
const dedupA = pagoMovilParser.parseBankMessage(
  'Banesco: Pago Movil recibido por Bs. 1.250,50 Ref. 12345678'
);
const dedupB = pagoMovilParser.parseBankMessage(
  'Banesco: Pago Movil recibido por Bs. 1,250.50 Ref. 12345678'
);
assert.strictEqual(dedupA.amountBs, dedupB.amountBs, '1.250,50 y 1,250.50 deben dar el mismo monto');
assert.strictEqual(dedupA.reference, dedupB.reference, 'La referencia debe ser idéntica');
assert.strictEqual(
  'pm-in-' + dedupA.reference + '-' + dedupA.amountBs,
  'pm-in-' + dedupB.reference + '-' + dedupB.amountBs,
  'La clave de idempotencia debe coincidir entre formatos'
);

console.log('  ✅ Deduplicación de montos equivalentes verificada.');

/* ==========================================================================
   6. Estado PAGO_MOVIL_INCOMING (legacy sin campo, inserción, dedupe, tope)
   ========================================================================== */
const legacyState = { version: '8.0.0', settings: {}, sales: [], inventory: [] };
stateManager.resetState(legacyState);
assert.ok(
  !Array.isArray(stateManager.getState().incomingBankPayments),
  'El estado viejo no debe traer la lista'
);

stateManager.applyEvent({
  id: 'ev-pm-in-1',
  seq: 1,
  ts: '2026-11-17T10:00:00.000Z',
  user: 'detector-bancario',
  type: 'PAGO_MOVIL_INCOMING',
  payload: {
    id: 'in-1',
    amountBs: 1250.5,
    reference: '998877',
    bankName: 'Banesco',
    conciliated: true,
    saleId: 'sale-x',
    paymentRef: '998877',
    receivedAt: '2026-11-17T10:00:00.000Z',
    idempotencyKey: 'pm-in-998877-1250.5'
  }
}, true);

assert.strictEqual(stateManager.getState().incomingBankPayments.length, 1, 'Debe crear la lista y guardar 1 abono');

stateManager.applyEvent({
  id: 'ev-pm-in-1-dup',
  seq: 2,
  ts: '2026-11-17T10:01:00.000Z',
  user: 'detector-bancario',
  type: 'PAGO_MOVIL_INCOMING',
  payload: {
    id: 'in-1-dup',
    amountBs: 1250.5,
    reference: '998877',
    idempotencyKey: 'pm-in-998877-1250.5'
  }
}, true);

assert.strictEqual(
  stateManager.getState().incomingBankPayments.length,
  1,
  'La misma idempotencyKey no debe duplicar el abono'
);

for (let i = 0; i < 205; i++) {
  stateManager.applyEvent({
    id: 'ev-pm-in-bulk-' + i,
    seq: 100 + i,
    ts: '2026-11-17T11:00:00.000Z',
    user: 'detector-bancario',
    type: 'PAGO_MOVIL_INCOMING',
    payload: {
      id: 'in-bulk-' + i,
      amountBs: 10 + i,
      reference: 'REF' + i,
      idempotencyKey: 'pm-bulk-' + i
    }
  }, true);
}
assert.strictEqual(
  stateManager.getState().incomingBankPayments.length,
  200,
  'La lista de abonos debe limitarse a 200'
);
assert.strictEqual(stateManager.getState().incomingBankPayments[0].id, 'in-bulk-204', 'El más reciente va primero');

stateManager.resetState(stateManager.createDefaultState());

console.log('  ✅ Estado PAGO_MOVIL_INCOMING: lista vieja, dedupe y tope 200.');

/* ==========================================================================
   7. Coincidencia de venta/pago pendiente
   ========================================================================== */
const mockState = {
  sales: [
    {
      id: 'sale-old',
      createdAt: '2026-11-16T10:00:00.000Z',
      payments: [
        { id: 'pay-old', method: 'Pago Móvil', amountBs: 100, ref: '111111', verifyStatus: 'PENDIENTE', verified: false }
      ]
    },
    {
      id: 'sale-new',
      createdAt: '2026-11-17T10:00:00.000Z',
      payments: [
        { id: 'pay-new', method: 'Pago Móvil', amountBs: 1250.5, ref: '12345678', verifyStatus: 'PENDIENTE', verified: false },
        { id: 'pay-ok', method: 'Pago Móvil', amountBs: 500, ref: '999999', verifyStatus: 'CONCILIADO', verified: true }
      ]
    }
  ]
};

const fullRefMatch = apiModule.findPendingPagoMovilPayment(mockState, { amountBs: 1250.5, reference: '12345678' });
assert.ok(fullRefMatch, 'Debe encontrar la venta pendiente con referencia exacta');
assert.strictEqual(fullRefMatch.saleId, 'sale-new');
assert.strictEqual(fullRefMatch.paymentId, 'pay-new');

const tailRefMatch = apiModule.findPendingPagoMovilPayment(mockState, { amountBs: 1250.49, reference: '345678' });
assert.ok(tailRefMatch, 'Debe coincidir por los últimos 6 dígitos y tolerancia de monto');
assert.strictEqual(tailRefMatch.saleId, 'sale-new');

assert.strictEqual(
  apiModule.findPendingPagoMovilPayment(mockState, { amountBs: 1250.5, reference: '222222' }),
  null,
  'Una referencia distinta no debe conciliar'
);
assert.strictEqual(
  apiModule.findPendingPagoMovilPayment(mockState, { amountBs: 1300, reference: '12345678' }),
  null,
  'Un monto fuera de ±0.50 no debe conciliar'
);

const summary = apiModule.buildSseEventSummary({
  type: 'PAGO_MOVIL_INCOMING',
  payload: { amountBs: 1250.5, reference: '12345678', bankName: 'Banesco', conciliated: true, saleId: 'sale-new' }
}, mockState);
assert.strictEqual(summary.amountBs, 1250.5);
assert.strictEqual(summary.reference, '12345678');
assert.strictEqual(summary.bankName, 'Banesco');
assert.strictEqual(summary.conciliated, true);

console.log('  ✅ Coincidencia por referencia/últimos 6 y tolerancia ±0.50 verificada.');

/* ==========================================================================
   8. Integración HTTP real (servidor temporal aislado)
   ========================================================================== */
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtp-pm-bank-test-'));

function httpReq(port, method, reqPath, bodyObj, token) {
  return new Promise(function (resolve, reject) {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
    const headers = {};
    if (bodyStr) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: reqPath,
      method: method,
      headers: headers
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        let parsed = {};
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function openSseStream(port, token) {
  return new Promise(function (resolve, reject) {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/v1/stream',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, function (res) {
      let buffer = '';
      res.on('data', function (chunk) { buffer += chunk.toString('utf8'); });
      res.on('error', function () {});
      resolve({
        getBuffer: function () { return buffer; },
        close: function () { try { req.destroy(); } catch (_) {} }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForSse(sse, needle, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const started = Date.now();
    const timer = setInterval(function () {
      if (sse.getBuffer().indexOf(needle) !== -1) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timeout esperando "' + needle + '" en SSE'));
      }
    }, 25);
  });
}

(async function runHttpIntegration() {
  process.env.MTP_DATA_DIR = tmpDataDir;
  const srv = serverModule.createServer();
  await new Promise(function (resolve) { srv.listen(0, '127.0.0.1', resolve); });
  const port = srv.address().port;
  let sse = null;

  try {
    // 8.1 Login: admin y cajero
    const adminLogin = await httpReq(port, 'POST', '/api/v1/auth/login', { username: 'admin', pin: '123456' });
    assert.strictEqual(adminLogin.status, 200, 'Administrador debe iniciar sesión');
    const adminToken = adminLogin.data.token;
    assert.ok(adminToken, 'Debe recibir token de Administrador');

    const cajeroLogin = await httpReq(port, 'POST', '/api/v1/auth/login', { username: 'cajero', pin: '1234' });
    assert.strictEqual(cajeroLogin.status, 200, 'Cajero debe iniciar sesión para la prueba RBAC');
    const cajeroToken = cajeroLogin.data.token;

    // 8.2 RBAC: sin token 401, Cajero 403
    const noToken = await httpReq(port, 'POST', '/api/v1/pagomovil/incoming', {
      title: 'Pago Móvil', text: 'Pago Movil por Bs. 10,00 Ref 123456'
    });
    assert.strictEqual(noToken.status, 401, 'Sin token debe responder 401');

    const forbidden = await httpReq(port, 'POST', '/api/v1/pagomovil/incoming', {
      title: 'Pago Móvil', text: 'Pago Movil por Bs. 10,00 Ref 123456'
    }, cajeroToken);
    assert.strictEqual(forbidden.status, 403, 'Cajero debe recibir 403');

    const forbiddenList = await httpReq(port, 'GET', '/api/v1/pagomovil/incoming', null, cajeroToken);
    assert.strictEqual(forbiddenList.status, 403, 'Cajero no debe listar abonos');

    // 8.3 Venta con Pago Móvil pendiente (ref 998877, Bs 1.250,50)
    const saleRes = await httpReq(port, 'POST', '/api/v1/events', {
      id: 'ev-pm-bank-sale-1',
      idempotencyKey: 'idem-pm-bank-sale-1',
      type: 'SALE_CREATED',
      payload: {
        id: 'sale-bank-1',
        orderNumber: 950,
        totalUsd: 26.48,
        totalBs: 1250.5,
        items: [],
        payments: [{
          id: 'pay-bank-1',
          method: 'Pago Móvil',
          amountUsd: 26.48,
          amountBs: 1250.5,
          ref: '998877',
          verifyStatus: 'PENDIENTE',
          verified: false
        }]
      }
    }, adminToken);
    assert.strictEqual(saleRes.status, 201, 'Debe registrar la venta con Pago Móvil pendiente');

    // 8.4 Escuchar SSE antes de enviar el SMS
    sse = await openSseStream(port, adminToken);
    await waitForSse(sse, ': connected', 3000);

    const smsBody = {
      clientApp: 'mobile-bank-listener',
      sourcePackage: 'com.banesco.banca',
      sourceApp: 'Banesco',
      title: 'Pago Móvil recibido',
      text: 'Banesco: Pago Movil recibido de 0414-1234567 por Bs. 1.250,50 Ref. 998877',
      postedAt: Date.now()
    };

    const incoming = await httpReq(port, 'POST', '/api/v1/pagomovil/incoming', smsBody, adminToken);
    assert.strictEqual(incoming.status, 200, 'El abono bancario debe aceptarse');
    assert.strictEqual(incoming.data.ok, true);
    assert.strictEqual(incoming.data.duplicate, false);
    assert.strictEqual(incoming.data.conciliated, true, 'Debe conciliar la venta pendiente');
    assert.strictEqual(incoming.data.saleId, 'sale-bank-1');
    assert.strictEqual(incoming.data.paymentRef, '998877');
    assert.strictEqual(incoming.data.status, 'CONCILIADO');
    assert.strictEqual(incoming.data.parsed.amountBs, 1250.5);
    assert.strictEqual(incoming.data.parsed.reference, '998877');
    assert.strictEqual(incoming.data.parsed.bankName, 'Banesco');
    assert.strictEqual(incoming.data.parsed.phone, '04141234567');
    assert.ok(incoming.data.parsed.confidence >= 0.9);

    await waitForSse(sse, 'PAGO_MOVIL_VERIFIED', 3000);
    assert.ok(
      sse.getBuffer().indexOf('"saleId":"sale-bank-1"') !== -1,
      'El evento SSE PAGO_MOVIL_VERIFIED debe incluir la venta'
    );

    // 8.5 La venta quedó conciliada en el estado
    const stateRes = await httpReq(port, 'GET', '/api/v1/state', null, adminToken);
    assert.strictEqual(stateRes.status, 200);
    const updatedSale = (stateRes.data.state.sales || []).find(function (s) { return s.id === 'sale-bank-1'; });
    assert.ok(updatedSale, 'La venta debe existir');
    assert.strictEqual(updatedSale.payments[0].verifyStatus, 'CONCILIADO');
    assert.strictEqual(updatedSale.payments[0].verified, true);
    assert.ok(
      String(updatedSale.payments[0].reviewNotes || '').indexOf('Abono bancario automático') !== -1,
      'Debe guardar el motivo de la conciliación'
    );
    assert.strictEqual(stateRes.data.state.incomingBankPayments.length, 1, 'El estado debe tener 1 abono capturado');

    // 8.6 GET de abonos capturados (contrato)
    const listRes = await httpReq(port, 'GET', '/api/v1/pagomovil/incoming?limit=20', null, adminToken);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.data.ok, true);
    assert.strictEqual(listRes.data.count, 1);
    const item = listRes.data.items[0];
    assert.strictEqual(item.amountBs, 1250.5);
    assert.strictEqual(item.reference, '998877');
    assert.strictEqual(item.phone, '04141234567');
    assert.strictEqual(item.bankName, 'Banesco');
    assert.strictEqual(item.sourceApp, 'Banesco');
    assert.strictEqual(item.sourcePackage, 'com.banesco.banca');
    assert.ok(item.rawText.indexOf('Banesco') !== -1);
    assert.ok(item.receivedAt, 'Debe incluir receivedAt ISO');
    assert.strictEqual(item.conciliated, true);
    assert.strictEqual(item.saleId, 'sale-bank-1');
    assert.strictEqual(item.paymentRef, '998877');

    // 8.7 Duplicado exacto: 200 con duplicate:true y sin re-conciliar
    const dupeRes = await httpReq(port, 'POST', '/api/v1/pagomovil/incoming', smsBody, adminToken);
    assert.strictEqual(dupeRes.status, 200);
    assert.strictEqual(dupeRes.data.duplicate, true, 'El mismo SMS debe marcarse duplicado');
    assert.strictEqual(dupeRes.data.conciliated, true, 'El duplicado conserva la conciliación');

    const listAfterDupe = await httpReq(port, 'GET', '/api/pagomovil/incoming', null, adminToken);
    assert.strictEqual(listAfterDupe.status, 200, 'El alias /api/pagomovil/incoming debe responder');
    assert.strictEqual(listAfterDupe.data.count, 1, 'El duplicado no debe crear otro registro');

    // 8.8 422: compra con tarjeta y mensaje sin monto
    const cardRes = await httpReq(port, 'POST', '/api/v1/pagomovil/incoming', {
      title: 'Banesco',
      text: 'Banesco: Compra con tarjeta de débito por Bs. 320,00 en Farmatodo Ref. 556677'
    }, adminToken);
    assert.strictEqual(cardRes.status, 422, 'Una compra con tarjeta no es Pago Móvil (422)');
    assert.strictEqual(cardRes.data.ok, false);

    const noAmountRes = await httpReq(port, 'POST', '/api/v1/pagomovil/incoming', {
      title: 'Pago Móvil',
      text: 'Pago Movil recibido de Juan sin monto'
    }, adminToken);
    assert.strictEqual(noAmountRes.status, 422, 'Sin monto debe responder 422');
    assert.strictEqual(noAmountRes.data.ok, false);

    console.log('  ✅ HTTP: RBAC, conciliación automática, SSE, GET y deduplicación verificados.');
  } finally {
    if (sse) sse.close();
    await new Promise(function (resolve) { srv.close(resolve); });
    try { journal.close(); } catch (_) {}
    delete process.env.MTP_DATA_DIR;
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(function (err) {
  console.error('❌ Error en tests/pagomovil-bank.test.js:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
