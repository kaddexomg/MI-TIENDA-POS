'use strict';

/**
 * server/test-journal.js
 * MI-TIENDA-POS v5.0.0
 * 
 * Script de prueba automatizado para verificar:
 * 1. Escritura append-only con fsync forzado
 * 2. Asignación secuencial continua (seq 1..N)
 * 3. Lectura precisa (readEventsSince)
 * 4. Tolerancia a fallos por apagón eléctrico simulado (línea corrupta o truncada)
 * 5. Materialización de estado y snapshots atómicos
 * 6. Generación de respaldos diarios rotativos
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const journal = require('./journal');
const stateManager = require('./state');
const api = require('./api');
const serverMod = require('./server');

const TEST_DIR = path.join(__dirname, '..', '.test_data_' + Date.now());

function httpRequest(options, postData, callback) {
  const req = http.request(options, function (res) {
    let data = '';
    res.on('data', function (chunk) { data += chunk; });
    res.on('end', function () {
      callback(null, res, data);
    });
  });
  req.on('error', function (err) {
    callback(err);
  });
  if (postData) {
    req.write(postData);
  }
  req.end();
}

function testHttpServer(j, s, done) {
  const testPort = 7079;
  const srv = http.createServer(function (req, res) {
    const parsed = require('url').parse(req.url, false);
    if (parsed.pathname.indexOf('/api') === 0) {
      api.handleApiRequest(req, res, j, s);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('STATIC_OK');
    }
  });

  srv.listen(testPort, '127.0.0.1', function () {
    // 1. GET /api/v1/status (Público)
    httpRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/v1/status',
      method: 'GET'
    }, null, function (err, res, body) {
      assert(!err && res.statusCode === 200, 'GET /api/v1/status responde 200 OK');
      const statusObj = JSON.parse(body);
      assert(statusObj.ok === true && statusObj.version === '8.0.0', 'statusObj contiene version 8.0.0 y ok=true');

      // 2. Acceso sin token debe retornar 401
      httpRequest({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/v1/state',
        method: 'GET'
      }, null, function (errUnauth, resUnauth) {
        assert(!errUnauth && resUnauth.statusCode === 401, 'GET /api/v1/state sin token responde 401 Unauthorized');

        // 3. Login incorrecto retorna 401
        httpRequest({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, JSON.stringify({ username: 'admin', pin: '000000' }), function (errBad, resBad) {
          assert(!errBad && resBad.statusCode === 401, 'POST /api/v1/auth/login con PIN malo responde 401');

          // 4. Login como cajero y verificar RBAC 403 en backup
          httpRequest({
            hostname: '127.0.0.1',
            port: testPort,
            path: '/api/v1/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }, JSON.stringify({ username: 'cajero', pin: '1234' }), function (errCaj, resCaj, bodyCaj) {
            assert(!errCaj && resCaj.statusCode === 200, 'Login de cajero responde 200 OK');
            const cajeroTok = JSON.parse(bodyCaj).token;

            httpRequest({
              hostname: '127.0.0.1',
              port: testPort,
              path: '/api/v1/backup',
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + cajeroTok }
            }, '{}', function (errRbac, resRbac) {
              assert(!errRbac && resRbac.statusCode === 403, 'Cajero bloqueado con 403 al intentar POST /api/v1/backup');

              // 5. Login como admin y operaciones autenticadas + idempotencyKey
              httpRequest({
                hostname: '127.0.0.1',
                port: testPort,
                path: '/api/v1/auth/login',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              }, JSON.stringify({ username: 'admin', pin: '123456' }), function (errAdm, resAdm, bodyAdm) {
                assert(!errAdm && resAdm.statusCode === 200, 'Login de admin responde 200 OK');
                const adminTok = JSON.parse(bodyAdm).token;
                const authHdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminTok };

                const postPayload = JSON.stringify({
                  type: 'SALE_CREATED',
                  idempotencyKey: 'idem-http-test-999',
                  payload: { id: 'vta-http-999', totalUsd: 5.00 },
                  user: 'test-user'
                });
                httpRequest({
                  hostname: '127.0.0.1',
                  port: testPort,
                  path: '/api/v1/events',
                  method: 'POST',
                  headers: authHdrs
                }, postPayload, function (err2, res2, body2) {
                  assert(!err2 && res2.statusCode === 201, 'POST /api/v1/events autenticado responde 201 Created');
                  const evResp = JSON.parse(body2);
                  assert(evResp.ok === true && evResp.seq > 0, 'Evento guardado por HTTP con seq válido');

                  // Reenvío idempotente no debe incrementar seq
                  httpRequest({
                    hostname: '127.0.0.1',
                    port: testPort,
                    path: '/api/v1/events',
                    method: 'POST',
                    headers: authHdrs
                  }, postPayload, function (errDup, resDup, bodyDup) {
                    const dupResp = JSON.parse(bodyDup);
                    assert(!errDup && dupResp.deduplicated === true && dupResp.seq === evResp.seq, 'IdempotencyKey deduplica evento repetido sin duplicar seq');

                    httpRequest({
                      hostname: '127.0.0.1',
                      port: testPort,
                      path: '/api/v1/events?sinceSeq=0',
                      method: 'GET',
                      headers: { 'Authorization': 'Bearer ' + adminTok }
                    }, null, function (err3, res3, body3) {
                      assert(!err3 && res3.statusCode === 200, 'GET /api/v1/events responde 200 OK');
                      const evList = JSON.parse(body3);
                      assert(evList.events.length >= 1, 'Eventos recuperados por GET /api/v1/events');

                      httpRequest({
                        hostname: '127.0.0.1',
                        port: testPort,
                        path: '/api/v1/state',
                        method: 'GET',
                        headers: { 'Authorization': 'Bearer ' + adminTok }
                      }, null, function (err4, res4, body4) {
                        assert(!err4 && res4.statusCode === 200, 'GET /api/v1/state responde 200 OK');
                        const stateResp = JSON.parse(body4);
                        assert(stateResp.state && stateResp.state.version === '8.0.0' && typeof stateResp.lastSeq === 'number', 'GET /api/v1/state retorna estado v8.0.0 materializado');

                        srv.close(function () {
                          done();
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    const entries = fs.readdirSync(TEST_DIR);
    for (let i = 0; i < entries.length; i++) {
      const p = path.join(TEST_DIR, entries[i]);
      if (fs.statSync(p).isDirectory()) {
        const sub = fs.readdirSync(p);
        for (let j = 0; j < sub.length; j++) {
          const sp = path.join(p, sub[j]);
          if (fs.statSync(sp).isDirectory()) {
            const sub2 = fs.readdirSync(sp);
            for (let k = 0; k < sub2.length; k++) {
              fs.unlinkSync(path.join(sp, sub2[k]));
            }
            fs.rmdirSync(sp);
          } else {
            fs.unlinkSync(sp);
          }
        }
        fs.rmdirSync(p);
      } else {
        fs.unlinkSync(p);
      }
    }
    fs.rmdirSync(TEST_DIR);
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FALLÓ PRUEBA:', message);
    process.exit(1);
  }
  console.log('  ✅ ' + message);
}

function runTests() {
  console.log('====================================================');
  console.log(' INICIANDO PRUEBAS DE JOURNAL Y PERSISTENCIA (P5)');
  console.log(' Carpeta temporal:', TEST_DIR);
  console.log('====================================================\n');

  try {
    // 1. Inicialización en directorio aislado
    console.log('[1/6] Inicializando Journal...');
    const initInfo = journal.init(TEST_DIR);
    assert(initInfo.dataDir === TEST_DIR, 'Directorio de datos inicializado');
    assert(initInfo.lastSeq === 0, 'Secuencia inicial en cero');
    assert(fs.existsSync(initInfo.journalPath), 'Archivo journal.ndjson creado');

    // 2. Append-Only y numeración de secuencias
    console.log('\n[2/6] Probando appendEvent con fsync...');
    const ev1 = journal.appendEvent({
      type: 'SHIFT_OPENED',
      payload: { cashier: 'Maria', initialCashUsd: 50.0 },
      user: 'cajero'
    });
    assert(ev1.seq === 1, 'Primer evento asignado con seq = 1');
    assert(typeof ev1.id === 'string' && ev1.id.length > 10, 'UUID v4 generado para evento 1');

    const ev2 = journal.appendEvent({
      type: 'SALE_CREATED',
      payload: {
        id: 'vta-001',
        totalUsd: 3.50,
        items: [{ id: 'emp-mechada', name: 'Empanada Mechada', qty: 2 }]
      },
      user: 'cajero'
    });
    assert(ev2.seq === 2, 'Segundo evento asignado con seq = 2');

    const ev3 = journal.appendEvent({
      type: 'EXPENSE_CREATED',
      payload: { description: 'Hielo para nevera', amountUsd: 1.50 },
      user: 'admin'
    });
    assert(ev3.seq === 3, 'Tercer evento asignado con seq = 3');
    assert(journal.getLastSeq() === 3, 'journal.getLastSeq() reporta 3');

    // 3. Lectura de eventos (readEventsSince)
    console.log('\n[3/6] Probando lectura selectiva de eventos (readEventsSince)...');
    const allEvents = journal.readEventsSince(0);
    assert(allEvents.length === 3, 'Lee los 3 eventos desde seq 0');
    assert(allEvents[0].type === 'SHIFT_OPENED', 'Evento 1 es SHIFT_OPENED');
    assert(allEvents[1].type === 'SALE_CREATED', 'Evento 2 es SALE_CREATED');
    assert(allEvents[2].type === 'EXPENSE_CREATED', 'Evento 3 es EXPENSE_CREATED');

    const sinceSeq2 = journal.readEventsSince(2);
    assert(sinceSeq2.length === 1, 'Lee exactamente 1 evento desde seq 2');
    assert(sinceSeq2[0].seq === 3, 'El evento leído desde seq 2 tiene seq = 3');

    // 4. Prueba de apagón eléctrico simulado (línea truncada o basura al final del archivo)
    console.log('\n[4/6] Simulando corte eléctrico brusco con bytes incompletos...');
    journal.close(); // Cerramos fd para manipular archivo
    fs.appendFileSync(path.join(TEST_DIR, 'journal.ndjson'), '{"id":"corrupt-cut-by-blackout","seq":4,"ty\n', 'utf8');

    // Reinicializar journal para simular encendido de PC tras apagón
    journal.init(TEST_DIR);
    assert(journal.getLastSeq() === 3, 'Recuperación exitosa: ignora línea corrupta del apagón y mantiene seq = 3');

    // Agregar un nuevo evento tras el reinicio
    const evAfterCrash = journal.appendEvent({
      type: 'RATE_UPDATED',
      payload: { rateBcv: 43.10 },
      user: 'admin'
    });
    assert(evAfterCrash.seq === 4, 'Nuevo evento post-apagón continúa limpiamente en seq = 4');

    // 5. Materialización de Estado en Memoria, Recetas, Reversión por Anulación y Snapshot
    console.log('\n[5/6] Probando materialización de estado, descuento por receta y anulación...');
    journal.appendEvent({
      type: 'ITEM_SAVED',
      payload: { id: 'ins-test-harina', name: 'Harina Test', type: 'insumo', sellable: false, unit: 'kg', stock: 10 },
      user: 'admin'
    });
    journal.appendEvent({
      type: 'SALE_CREATED',
      payload: {
        id: 'vta-rec-001',
        totalUsd: 3.00,
        items: [{ id: 'var-emp-test', name: 'Empanada Test', qty: 2, recipe: [{ insumoId: 'ins-test-harina', qty: 0.25 }] }]
      },
      user: 'cajero'
    });
    journal.appendEvent({
      type: 'SALE_VOIDED',
      payload: { saleId: 'vta-rec-001', reason: 'Prueba de reverso' },
      user: 'admin'
    });

    const state = stateManager.init(journal);
    assert(state.version === '8.0.0', 'Estado materializado v8.0.0');
    assert(state.lastSeq === 7, 'Estado reconstruido hasta última secuencia 7');
    assert(state.settings.rateBcv === 43.10, 'Tasa actualizada correctamente en estado');
    assert(state.sales.length === 2, 'Ambas ventas presentes en estado materializado');
    const harinaAfterVoid = state.inventory.find(i => i.id === 'ins-test-harina');
    assert(harinaAfterVoid && harinaAfterVoid.stock === 10, 'Descuento por receta y reversión tras SALE_VOIDED restauran stock exacto a 10');
    assert(state.kardex.length >= 2, 'Kardex materializado con movimiento de venta y anulación');

    const snapResult = stateManager.saveSnapshot();
    assert(snapResult === true, 'Snapshot guardado exitosamente');
    const snapshotPath = path.join(TEST_DIR, 'snapshot.json');
    assert(fs.existsSync(snapshotPath), 'Archivo snapshot.json existe en disco');

    // 6. Respaldo Diario y Purga
    console.log('\n[6/6] Probando generación de respaldos diarios...');
    const backupRes = journal.createDailyBackup();
    assert(backupRes.ok === true, 'Respaldo diario generado exitosamente');
    assert(fs.existsSync(path.join(backupRes.backupDir, 'journal.ndjson')), 'journal.ndjson copiado en respaldo');
    assert(fs.existsSync(path.join(backupRes.backupDir, 'snapshot.json')), 'snapshot.json copiado en respaldo');

    // 7. Prueba del Servidor HTTP y Endpoints REST
    console.log('\n[7/7] Probando Servidor HTTP y API REST en puerto de prueba...');
    testHttpServer(journal, stateManager, function () {
      journal.close();
      cleanupTestDir();

      console.log('\n====================================================');
      console.log(' ¡TODAS LAS PRUEBAS DE PERSISTENCIA Y API PASARON AL 100%!');
      console.log('====================================================');
    });
  } catch (err) {
    journal.close();
    cleanupTestDir();
    console.error('\n❌ ERROR EN EJECUCIÓN DE PRUEBAS:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests: runTests };
