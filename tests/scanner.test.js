/* ==========================================================================
   MI-TIENDA-POS — tests/scanner.test.js
   Pruebas del escáner móvil 1D (EAN-13 / Code 128), puente real-time POS,
   autenticación mobile-scanner y deduplicación en MTPBarcode.
   Ejecutar: node tests/scanner.test.js
   ========================================================================== */
'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const MTPMobileScanner = require('../mobile/barcode-scanner.js');
const apiRouter = require('../server/api.js');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    console.error('  ❌ ' + name);
    console.error('     ' + e.stack);
    process.exitCode = 1;
  }
}

console.log('\n▶ Pruebas de Escáner Móvil y Puente Tiempo Real POS\n');

/* -------------------------------------------------------------------------- */
/* 1. Motor Híbrido JS 1D (EAN-13, EAN-8, Code 128)                           */
/* -------------------------------------------------------------------------- */

test('SCN-1: Decodificación EAN-13 sintética válida (7591001000012 y 7590001000015)', () => {
  const img1 = MTPMobileScanner.renderSyntheticBarcodeImageData('7591001000012', 'ean_13', { moduleWidth: 3, height: 60 });
  const dec1 = MTPMobileScanner.decodeImageData(img1, { detailed: true, strictChecksum: true });
  assert.ok(dec1, 'Debe decodificar 7591001000012');
  assert.strictEqual(dec1.code, '7591001000012');
  assert.strictEqual(dec1.format, 'ean_13');

  const img2 = MTPMobileScanner.renderSyntheticBarcodeImageData('7590001000015', 'ean_13', { moduleWidth: 4, height: 64 });
  const dec2 = MTPMobileScanner.decodeImageData(img2, { detailed: true, strictChecksum: true });
  assert.ok(dec2, 'Debe decodificar 7590001000015');
  assert.strictEqual(dec2.code, '7590001000015');
});

test('SCN-2: Decodificación EAN-13 al revés (imagen invertida horizontalmente 180°)', () => {
  const img = MTPMobileScanner.renderSyntheticBarcodeImageData('7501055300075', 'ean_13', { moduleWidth: 3, height: 50 });
  const w = img.width;
  const h = img.height;
  const flipped = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + (w - 1 - x)) * 4;
      const dst = (y * w + x) * 4;
      flipped[dst] = img.data[src];
      flipped[dst + 1] = img.data[src + 1];
      flipped[dst + 2] = img.data[src + 2];
      flipped[dst + 3] = 255;
    }
  }
  const dec = MTPMobileScanner.decodeImageData({ width: w, height: h, data: flipped }, { detailed: true, strictChecksum: true });
  assert.ok(dec, 'Debe decodificar EAN-13 aunque el teléfono esté al revés');
  assert.strictEqual(dec.code, '7501055300075');
});

test('SCN-3: Rechazo estricto de EAN-13 con dígito verificador alterado', () => {
  assert.strictEqual(MTPMobileScanner.isValidEan13('7591001000012'), true);
  assert.strictEqual(MTPMobileScanner.isValidEan13('7591001000019'), false);
  assert.strictEqual(MTPMobileScanner.computeEan13CheckDigit('759100100001'), '2');

  const validImg = MTPMobileScanner.renderSyntheticBarcodeImageData('7591001000012', 'ean_13', { moduleWidth: 2, height: 40 });
  assert.ok(MTPMobileScanner.decodeImageData(validImg, { strictChecksum: true }), 'EAN-13 válido pasa con strictChecksum=true');

  const badImg = MTPMobileScanner.renderSyntheticBarcodeImageData('7591001000019', 'ean_13', { moduleWidth: 2, height: 40 });
  assert.strictEqual(MTPMobileScanner.decodeImageData(badImg, { strictChecksum: true }), null, 'EAN-13 con check digit alterado debe rechazarse');
  const laxDec = MTPMobileScanner.decodeImageData(badImg, { strictChecksum: false, detailed: true });
  assert.ok(laxDec && laxDec.code === '7591001000019', 'Con strictChecksum=false decodifica dígitos crudos');
});

test('SCN-4: Decodificación Code 128-B sintética (EM01, VIV101 y 7591001000015)', () => {
  ['EM01', 'VIV101', '7591001000015'].forEach(function (sample) {
    const img = MTPMobileScanner.renderSyntheticBarcodeImageData(sample, 'code_128', { moduleWidth: 3, height: 55 });
    const dec = MTPMobileScanner.decodeImageData(img, { detailed: true });
    assert.ok(dec, 'Debe decodificar Code 128 "' + sample + '"');
    assert.strictEqual(dec.code, sample);
    assert.strictEqual(dec.format, 'code_128');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Endpoints API /api/v1/scanner/* y Autenticación Móvil                   */
/* -------------------------------------------------------------------------- */

function makeTempJournal(dir) {
  return {
    getDataDir: () => dir,
    getLastSeq: () => 12,
    readEventsSince: () => []
  };
}

function makeMockStateManager() {
  const sampleState = {
    settings: { storeName: 'Mi Tienda Test', rateBcv: 42.85 },
    variants: [
      { id: 'v-em01', code: 'EM01', barcode: '7591000000011', name: 'Empanada de Queso', familyId: 'fritos', priceUsd: 1.30, costUsd: 0.45, active: true }
    ],
    dishes: [],
    retailItems: [
      { id: 'prod-harina-pan', code: 'VIV101', barcode: '7591001000015', name: 'Harina P.A.N. Blanca 1Kg', familyId: 'viveres', priceUsd: 1.40, costUsd: 0.95, stock: 24, minStock: 6, unit: 'und', taxExempt: true, iva: 'E', sellable: true, active: true }
    ],
    inventory: [
      { id: 'prod-harina-pan', code: 'VIV101', barcode: '7591001000015', name: 'Harina P.A.N. Blanca 1Kg', type: 'venta', sellable: true, familyId: 'viveres', priceUsd: 1.40, costUsd: 0.95, stock: 24, minStock: 6, unit: 'und', taxExempt: true, iva: 'E', active: true },
      { id: 'ins-papa', code: 'INS-PAPA', barcode: '759999000001', name: 'Papa Blanca Cruda', type: 'insumo', sellable: false, familyId: 'insumos', priceUsd: 0, costUsd: 1.10, stock: 18, minStock: 5, unit: 'kg', active: true }
    ],
    users: []
  };
  return {
    getState: () => sampleState
  };
}

function invokeApiSync(method, urlStr, bodyObj, headersObj, journal, stateManager, remoteAddress) {
  const req = new EventEmitter();
  req.method = method;
  req.url = urlStr;
  req.headers = Object.assign({ host: '127.0.0.1:7070' }, headersObj || {});
  req.socket = { remoteAddress: remoteAddress || '127.0.0.1' };
  const result = { statusCode: 0, headers: {}, bodyText: '', body: null, ended: false };
  const res = {
    writeHead: (code, hdrs) => { result.statusCode = code; result.headers = hdrs || {}; },
    write: (chunk) => { result.bodyText += String(chunk || ''); },
    end: (chunk) => {
      if (chunk) result.bodyText += String(chunk);
      result.ended = true;
      try { result.body = JSON.parse(result.bodyText); } catch (_) {}
    }
  };
  apiRouter.handleApiRequest(req, res, journal, stateManager);
  if (method === 'POST' || method === 'PUT') {
    const raw = bodyObj !== undefined ? JSON.stringify(bodyObj) : '';
    if (raw) req.emit('data', Buffer.from(raw, 'utf8'));
    req.emit('end');
  }
  return result;
}

test('SCN-5: /api/v1/scanner/info, login mobile-scanner (Cajero PIN y pairCode), scan + stream + poll', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtp-scanner-test-'));
  try {
    const journal = makeTempJournal(tmpDir);
    const sm = makeMockStateManager();

    // A) Loopback recibe pairCode; LAN anónimo NO filtra pairCode
    const infoLocal = invokeApiSync('GET', '/api/v1/scanner/info', null, {}, journal, sm, '127.0.0.1');
    assert.strictEqual(infoLocal.statusCode, 200);
    assert.ok(infoLocal.body && infoLocal.body.ok);
    assert.match(String(infoLocal.body.pairCode || ''), /^[0-9A-Z]{6}$/, 'Loopback debe exponer pairCode de 6 dígitos');
    assert.ok(infoLocal.body.scannerUrl.includes('/escaner?pair='), 'Debe incluir enlace /escaner?pair=');

    const infoRemoteAnon = invokeApiSync('GET', '/api/v1/scanner/info', null, {}, journal, sm, '192.168.1.55');
    assert.strictEqual(infoRemoteAnon.statusCode, 200);
    assert.strictEqual(infoRemoteAnon.body.pairCode, null, 'LAN anónimo no debe filtrar pairCode');

    // B) mobile-admin sigue bloqueando Cajero (403), pero mobile-scanner sí acepta Cajero (200)
    const adminCajeroRes = invokeApiSync('POST', '/api/v1/auth/login', {
      clientApp: 'mobile-admin',
      pin: '1234'
    }, {}, journal, sm, '192.168.1.55');
    assert.strictEqual(adminCajeroRes.statusCode, 401, 'mobile-admin no debe autenticar Cajero');

    const scanCajeroRes = invokeApiSync('POST', '/api/v1/auth/login', {
      clientApp: 'mobile-scanner',
      pin: '1234'
    }, {}, journal, sm, '192.168.1.55');
    assert.strictEqual(scanCajeroRes.statusCode, 200, 'mobile-scanner debe aceptar Cajero con PIN 1234');
    assert.ok(scanCajeroRes.body.token, 'Debe entregar token');
    assert.strictEqual(scanCajeroRes.body.user.role, 'Cajero');

    const scanPairRes = invokeApiSync('POST', '/api/v1/auth/login', {
      clientApp: 'mobile-scanner',
      pairCode: infoLocal.body.pairCode
    }, {}, journal, sm, '192.168.1.55');
    assert.strictEqual(scanPairRes.statusCode, 200, 'mobile-scanner debe aceptar pairCode');
    assert.ok(scanPairRes.body.token);

    // C) Sin token ni pairCode falla con 401
    const unauthScan = invokeApiSync('POST', '/api/v1/scanner/scan', {
      code: '7591001000015'
    }, {}, journal, sm, '192.168.1.55');
    assert.strictEqual(unauthScan.statusCode, 401);

    // D) Suscribir cliente SSE en /api/v1/scanner/stream y disparar escaneo POS_ADD con multiplicador 3*
    const sseReq = new EventEmitter();
    sseReq.method = 'GET';
    sseReq.url = '/api/v1/scanner/stream';
    sseReq.headers = { host: '127.0.0.1:7070' };
    sseReq.socket = { remoteAddress: '127.0.0.1' };
    let sseChunks = '';
    const sseRes = {
      writeHead: () => {},
      write: (chunk) => { sseChunks += String(chunk || ''); },
      end: () => {}
    };
    apiRouter.handleApiRequest(sseReq, sseRes, journal, sm);

    const startSeq = infoLocal.body.lastScanSeq || 0;
    const scanAdd = invokeApiSync('POST', '/api/v1/scanner/scan', {
      code: '3*7591001000015',
      mode: 'POS_ADD'
    }, { Authorization: 'Bearer ' + scanPairRes.body.token }, journal, sm, '192.168.1.55');

    assert.strictEqual(scanAdd.statusCode, 200);
    assert.strictEqual(scanAdd.body.broadcasted, true);
    assert.strictEqual(scanAdd.body.scan.code, '7591001000015');
    assert.strictEqual(scanAdd.body.scan.qty, 3);
    assert.strictEqual(scanAdd.body.match.found, true);
    assert.strictEqual(scanAdd.body.match.name, 'Harina P.A.N. Blanca 1Kg');
    assert.ok(sseChunks.includes('event: barcode_scan'), 'El cliente SSE de PC debe recibir barcode_scan al instante');
    assert.ok(sseChunks.includes('7591001000015'));

    // E) LOOKUP NO se transmite al carrito de Caja ni avanza seq
    const seqAfterAdd = scanAdd.body.seq;
    const scanLookup = invokeApiSync('POST', '/api/v1/scanner/scan', {
      code: 'EM01',
      mode: 'LOOKUP'
    }, { Authorization: 'Bearer ' + scanCajeroRes.body.token }, journal, sm, '192.168.1.55');
    assert.strictEqual(scanLookup.statusCode, 200);
    assert.strictEqual(scanLookup.body.broadcasted, false);
    assert.strictEqual(scanLookup.body.seq, seqAfterAdd, 'LOOKUP no debe incrementar seq ni emitirse al POS');
    assert.strictEqual(scanLookup.body.match.found, true);
    assert.strictEqual(scanLookup.body.match.name, 'Empanada de Queso');

    // F) Separación estricta Cocina vs Minimercado en POS_ADD vs LOOKUP
    const rawInsumoPos = invokeApiSync('POST', '/api/v1/scanner/scan', {
      code: 'INS-PAPA',
      mode: 'POS_ADD'
    }, { Authorization: 'Bearer ' + scanCajeroRes.body.token }, journal, sm, '192.168.1.55');
    assert.strictEqual(rawInsumoPos.body.match.found, false, 'Insumo crudo de cocina no debe venderse en POS_ADD');

    const rawInsumoLookup = invokeApiSync('POST', '/api/v1/scanner/scan', {
      code: 'INS-PAPA',
      mode: 'LOOKUP'
    }, { Authorization: 'Bearer ' + scanCajeroRes.body.token }, journal, sm, '192.168.1.55');
    assert.strictEqual(rawInsumoLookup.body.match.found, true, 'Insumo sí puede consultarse en LOOKUP');
    assert.strictEqual(rawInsumoLookup.body.match.sellable, false);

    // G) Poll desde startSeq devuelve el escaneo 3*7591001000015 + lookup directo
    const pollRes = invokeApiSync('GET', '/api/v1/scanner/poll?sinceSeq=' + startSeq + '&lookup=7591001000015', null, {}, journal, sm, '127.0.0.1');
    assert.strictEqual(pollRes.statusCode, 200);
    assert.ok(pollRes.body.scans.some((s) => s.code === '7591001000015' && s.qty === 3));
    assert.strictEqual(pollRes.body.lookup.found, true);
    assert.strictEqual(pollRes.body.lookup.name, 'Harina P.A.N. Blanca 1Kg');

    sseReq.emit('close');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

/* -------------------------------------------------------------------------- */
/* 3. MTPBarcode (assets/js/modules/barcode-engine.js): multiplicador & dedup */
/* -------------------------------------------------------------------------- */

test('SCN-6: MTPBarcode.handleRemoteScan maneja multiplicadores, deduplicación, LOOKUP y modal de campo', () => {
  const toasts = [];
  const drawerWrap = { classList: { contains: () => true } };
  const drawerBarcodeInput = {
    id: 'drawerBarcode',
    value: '',
    closest: (sel) => (sel.indexOf('.open') !== -1 ? drawerWrap : null),
    dispatchEvent: () => {},
    focus: () => {}
  };
  let drawerOpen = false;

  const sandbox = {
    console,
    Date,
    Set,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    parseInt,
    isNaN,
    CustomEvent: function (t, o) { this.type = t; this.detail = o ? o.detail : null; },
    Event: function (t) { this.type = t; },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    window: null,
    document: {
      readyState: 'complete',
      activeElement: null,
      getElementById: (id) => {
        if (id === 'drawerBarcode' && drawerOpen) return drawerBarcodeInput;
        return null;
      },
      addEventListener: () => {}
    },
    MTP: {
      state: {
        variants: [],
        inventory: [{ id: 'p1', code: 'VIV101', barcode: '7591001000015', name: 'Harina P.A.N.', sellable: true }]
      },
      findByCodeOrBarcode: (code) => (code === '7591001000015' ? { id: 'p1', name: 'Harina P.A.N.' } : null),
      toast: (msg, kind) => toasts.push({ msg, kind })
    }
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.dispatchEvent = () => {};

  const engineCode = fs.readFileSync(path.join(__dirname, '../assets/js/modules/barcode-engine.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(engineCode, sandbox);

  const MTPBarcode = sandbox.window.MTPBarcode;
  const scannedCodes = [];
  MTPBarcode.onBarcodeScan((c) => scannedCodes.push(c));

  // A) parseScanMultiplier
  const p = MTPBarcode.parseScanMultiplier('4*7591001000015');
  assert.strictEqual(p.qty, 4);
  assert.strictEqual(p.code, '7591001000015');

  // B) handleRemoteScan con qty=3 -> dispara 3*7591001000015 y NO genera toast de error
  const ok1 = MTPBarcode.handleRemoteScan({ id: 'scan_a', seq: 1, code: '7591001000015', qty: 3, mode: 'POS_ADD' });
  assert.strictEqual(ok1, true);
  assert.deepStrictEqual(scannedCodes, ['3*7591001000015']);
  assert.strictEqual(toasts.filter((t) => t.kind === 'warn').length, 0, '3*759... no debe lanzar toast de no encontrado');

  // C) Deduplicación por id y por seq
  const dupId = MTPBarcode.handleRemoteScan({ id: 'scan_a', seq: 2, code: '7591001000015', qty: 1, mode: 'POS_ADD' });
  const dupSeq = MTPBarcode.handleRemoteScan({ id: 'scan_b', seq: 1, code: '7591001000015', qty: 1, mode: 'POS_ADD' });
  assert.strictEqual(dupId, false);
  assert.strictEqual(dupSeq, false);
  assert.strictEqual(scannedCodes.length, 1);

  // D) LOOKUP ignorado por POS de PC
  const ignLookup = MTPBarcode.handleRemoteScan({ id: 'scan_c', seq: 5, code: '7591001000015', qty: 1, mode: 'LOOKUP' });
  assert.strictEqual(ignLookup, false);

  // E) Con #drawerBarcode abierto, inserta el código limpio directo en el input y no en el carrito
  drawerOpen = true;
  const okDrawer = MTPBarcode.handleRemoteScan({ id: 'scan_d', seq: 6, code: '7592001000112', qty: 2, mode: 'POS_ADD' });
  assert.strictEqual(okDrawer, true);
  assert.strictEqual(drawerBarcodeInput.value, '7592001000112');
  assert.strictEqual(scannedCodes.length, 1, 'Con el drawer de producto abierto no debe agregarse al carrito');
});

console.log('\n' + (process.exitCode ? '❌ Hubo pruebas fallidas en Escáner Móvil' : '✅ Pruebas de Escáner Móvil y Puente POS: ' + passed + '/6 OK') + '\n');
