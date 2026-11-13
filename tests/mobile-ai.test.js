'use strict';

/**
 * tests/mobile-ai.test.js
 * Pruebas unitarias y de integración para:
 *  - Motor IA de Costos, Precios e Inventario (server/ai-advisor.js)
 *  - Evento bidireccional PAGO_MOVIL_STATUS_CHANGED (server/state.js)
 *  - Bloqueo estricto de roles no-Admin en el APK móvil (server/api.js)
 *  - Endpoints /api/v1/ai/insights, /api/v1/ai/ask, /api/v1/network-info
 */

const assert = require('assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const aiAdvisor = require('../server/ai-advisor');
const journal = require('../server/journal');
const stateManager = require('../server/state');
const serverModule = require('../server/server');

console.log('🧪 Ejecutando pruebas de IA, Pago Móvil y API Móvil Admin...');

// 1. Pruebas unitarias de aiAdvisor
const now = Date.now();
const dayMs = 86400000;
const mockState = {
  settings: {
    rateBcv: 42.85,
    rateEur: 46.60,
    rateUsdt: 52.00,
    targetMarginPct: 40
  },
  inventory: [
    {
      id: 'prod-harina',
      code: 'VIV01',
      name: 'Harina P.A.N. Blanca',
      type: 'venta',
      sellable: true,
      iva: 'E',
      unit: 'und',
      stock: 2,
      minStock: 10,
      costUsd: 1.05,
      priceUsd: 1.15
    },
    {
      id: 'ins-queso',
      code: 'INS02',
      name: 'Queso Blanco Rallado',
      type: 'insumo',
      sellable: false,
      unit: 'kg',
      stock: 0,
      minStock: 3,
      costUsd: 5.50
    }
  ],
  variants: [
    {
      id: 'var-emp-queso',
      code: 'EMP01',
      name: 'Empanada de Queso',
      priceUsd: 0.90,
      available: true,
      recipe: [{ insumoId: 'ins-queso', qty: 0.15 }]
    }
  ],
  sales: [
    {
      id: 's-prev-1',
      orderNumber: 201,
      createdAt: new Date(now - 9 * dayMs).toISOString(),
      totalUsd: 11.50,
      items: [{ id: 'prod-harina', name: 'Harina P.A.N. Blanca', qty: 10, priceUsd: 1.15 }],
      payments: [{ method: 'Efectivo USD', amountUsd: 11.50 }]
    },
    {
      id: 's-curr-1',
      orderNumber: 202,
      createdAt: new Date(now - 1 * dayMs).toISOString(),
      totalUsd: 2.30,
      items: [{ id: 'prod-harina', name: 'Harina P.A.N. Blanca', qty: 2, priceUsd: 1.15 }],
      payments: [{ id: 'p-pm-1', method: 'Pago Móvil', amountUsd: 2.30, amountBs: 98.55, ref: '774411', verifyStatus: 'PENDIENTE', verified: false }]
    }
  ]
};

const analysis = aiAdvisor.analyzeBusiness(mockState, { nowMs: now });
assert.ok(analysis && analysis.summary, 'Debe generar resumen IA');
assert.strictEqual(analysis.summary.pendingPmCount, 1, 'Debe contar 1 Pago Móvil pendiente');
assert.ok(analysis.inventoryHealth.criticalItems.length >= 2, 'Debe detectar Harina y Queso en nivel crítico/agotado');
assert.ok(analysis.pricingSuggestions.length >= 1, 'Debe sugerir mejora de precio para Harina con margen comprimido');
assert.ok(analysis.pricingSuggestions[0].recommendedPriceUsd > analysis.pricingSuggestions[0].currentPriceUsd, 'El precio recomendado debe superar el actual insuficiente');
assert.strictEqual(analysis.fallingProducts.length, 1, 'Debe detectar caída de ventas en Harina (10 -> 2)');

const qaPrice = aiAdvisor.answerQuestion(mockState, '¿Qué precios debo ajustar?');
assert.ok(qaPrice.answer.indexOf('Harina') !== -1, 'La respuesta de precios debe mencionar el producto prioritario');

const qaInv = aiAdvisor.answerQuestion(mockState, '¿Cómo está mi inventario?');
assert.ok(qaInv.answer.indexOf('Queso') !== -1 || qaInv.answer.indexOf('Harina') !== -1, 'La respuesta de inventario debe listar artículos críticos');

console.log('  ✅ Motor IA de costos, precios, demanda e inventario verificado.');

// 2. Prueba de evento PAGO_MOVIL_STATUS_CHANGED y API HTTP en directorio temporal aislado
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtp-mob-test-'));
process.env.MTP_DATA_DIR = tmpDataDir;

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

(async function runApiMobileChecks() {
  const srv = serverModule.createServer();
  await new Promise(function (resolve) { srv.listen(0, '127.0.0.1', resolve); });
  const port = srv.address().port;

  try {
    // Bloquear Cajero y Encargado en app móvil
    const cajeroTry = await httpReq(port, 'POST', '/api/v1/auth/login', {
      username: 'cajero', pin: '1234', clientApp: 'mobile-admin'
    });
    assert.strictEqual(cajeroTry.status, 403, 'Cajero debe ser rechazado (403) en mobile-admin');

    const encargadoTry = await httpReq(port, 'POST', '/api/v1/auth/login', {
      username: 'encargado', pin: '2244', clientApp: 'mobile-admin'
    });
    assert.strictEqual(encargadoTry.status, 403, 'Encargado debe ser rechazado (403) en mobile-admin');

    // Permitir Administrador por PIN directo sin username (pantalla PIN personal)
    const pinOnlyLogin = await httpReq(port, 'POST', '/api/v1/auth/login', {
      pin: '123456', clientApp: 'mobile-admin'
    });
    assert.strictEqual(pinOnlyLogin.status, 200, 'PIN único de Administrador debe iniciar sesión (200) sin escribir usuario');
    assert.strictEqual(pinOnlyLogin.data.user.role, 'Administrador');

    // Permitir Administrador clásico con username
    const adminLogin = await httpReq(port, 'POST', '/api/v1/auth/login', {
      username: 'admin', pin: '123456', clientApp: 'mobile-admin'
    });
    assert.strictEqual(adminLogin.status, 200, 'Administrador debe iniciar sesión (200) en mobile-admin');
    const tok = adminLogin.data.token;
    assert.ok(tok, 'Debe recibir token HMAC');

    // Sincronización en lote (offline fallback PC -> VPS) con idempotencia
    const batchPayload = {
      events: [
        {
          id: 'ev-batch-settings-1',
          idempotencyKey: 'idem-batch-settings-1',
          type: 'SETTINGS_UPDATED',
          payload: { vpsUrl: 'https://pos.ejemplo-tienda.com' }
        }
      ]
    };
    const batch1 = await httpReq(port, 'POST', '/api/v1/events/batch', batchPayload, tok);
    assert.strictEqual(batch1.status, 200);
    assert.strictEqual(batch1.data.syncedCount, 1, 'Primer batch debe sincronizar 1 evento');
    const batch2 = await httpReq(port, 'POST', '/api/v1/events/batch', batchPayload, tok);
    assert.strictEqual(batch2.status, 200);
    assert.strictEqual(batch2.data.deduplicatedCount, 1, 'Reintento batch idempotente no debe duplicar');

    // Crear venta con Pago Móvil pendiente
    const saleEv = await httpReq(port, 'POST', '/api/v1/events', {
      id: 'ev-sale-pm-1',
      idempotencyKey: 'idem-sale-pm-1',
      type: 'SALE_CREATED',
      payload: {
        id: 'sale-pm-1',
        orderNumber: 901,
        totalUsd: 5.00,
        totalBs: 214.25,
        items: [],
        payments: [{
          id: 'pay-pm-1',
          method: 'Pago Móvil',
          amountUsd: 5.00,
          amountBs: 214.25,
          ref: '991122',
          verifyStatus: 'PENDIENTE',
          verified: false
        }]
      }
    }, tok);
    assert.strictEqual(saleEv.status, 201, 'Debe registrar venta con Pago Móvil');

    // Confirmar Pago Móvil mediante PAGO_MOVIL_STATUS_CHANGED
    const confirmEv = await httpReq(port, 'POST', '/api/v1/events', {
      id: 'ev-pm-confirm-1',
      idempotencyKey: 'idem-pm-confirm-1',
      type: 'PAGO_MOVIL_STATUS_CHANGED',
      payload: {
        saleId: 'sale-pm-1',
        paymentId: 'pay-pm-1',
        paymentRef: '991122',
        newStatus: 'CONCILIADO',
        reason: 'Confirmado en banco desde App Móvil'
      }
    }, tok);
    assert.strictEqual(confirmEv.status, 201, 'Debe emitir PAGO_MOVIL_STATUS_CHANGED');

    const stRes = await httpReq(port, 'GET', '/api/v1/state', null, tok);
    assert.strictEqual(stRes.status, 200);
    const updatedSale = (stRes.data.state.sales || []).find(s => s.id === 'sale-pm-1');
    assert.ok(updatedSale, 'La venta debe existir en el estado');
    assert.strictEqual(updatedSale.payments[0].verifyStatus, 'CONCILIADO');
    assert.strictEqual(updatedSale.payments[0].verified, true);

    // Endpoints IA y Network Info
    const aiRes = await httpReq(port, 'GET', '/api/v1/ai/insights', null, tok);
    assert.strictEqual(aiRes.status, 200);
    assert.ok(aiRes.data.insights && typeof aiRes.data.insights.summary.healthScore === 'number');

    const askRes = await httpReq(port, 'POST', '/api/v1/ai/ask', { question: '¿Cómo está mi inventario?' }, tok);
    assert.strictEqual(askRes.status, 200);
    assert.ok(askRes.data.answer && askRes.data.answer.length > 5);

    const netRes = await httpReq(port, 'GET', '/api/v1/network-info', null, tok);
    assert.strictEqual(netRes.status, 200);
    assert.ok(Array.isArray(netRes.data.lanUrls));

    console.log('  ✅ API móvil (RBAC Admin-only, Pago Móvil bidireccional, IA y red) verificada.');
  } finally {
    srv.close();
    try { journal.close(); } catch (_) {}
    delete process.env.MTP_DATA_DIR;
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(function (err) {
  console.error('❌ Error en tests/mobile-ai.test.js:', err);
  process.exitCode = 1;
});
