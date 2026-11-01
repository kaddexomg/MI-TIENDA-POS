'use strict';

/**
 * server/api.js
 * MI-TIENDA-POS v5.0.0
 * 
 * Enrutador de API REST para operaciones transaccionales locales.
 * Endpoints: /api/status, /api/events, /api/state, /api/backup, /api/snapshot.
 * 
 * Compatible con Node.js v13.14.0+ (CommonJS puro, sin dependencias externas).
 * Sin operadores opcionales (?.) ni nullish (??) para compatibilidad absoluta con Win7.
 */

const url = require('url');

/**
 * Responde con un payload JSON y cabeceras estándar con CORS.
 */
function sendJson(res, statusCode, data) {
  const jsonBody = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(jsonBody);
}

/**
 * Lee y parsea el cuerpo JSON de una petición POST/PUT.
 */
function readJsonBody(req, callback) {
  let body = '';
  const maxBytes = 10 * 1024 * 1024; // 10 MB límite

  req.on('data', function (chunk) {
    body += chunk;
    if (body.length > maxBytes) {
      req.connection.destroy();
      callback(new Error('Payload demasiado grande (>10MB)'));
    }
  });

  req.on('end', function () {
    if (!body || body.trim().length === 0) {
      return callback(null, {});
    }
    try {
      const parsed = JSON.parse(body);
      callback(null, parsed);
    } catch (parseErr) {
      callback(new Error('JSON sintácticamente inválido: ' + parseErr.message));
    }
  });

  req.on('error', function (err) {
    callback(err);
  });
}

/**
 * Maneja las solicitudes hacia /api/*
 * 
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Object} journal Módulo de journal
 * @param {Object} stateManager Módulo de estado
 */
function handleApiRequest(req, res, journal, stateManager) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query || {};
  const method = req.method ? req.method.toUpperCase() : 'GET';

  // Manejo de Preflight OPTIONS para navegadores y peticiones CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // 1. GET /api/status - Estado del servidor y sincronización
  if (pathname === '/api/status' && method === 'GET') {
    const statusData = {
      ok: true,
      service: 'MI-TIENDA-POS Local Engine',
      version: '5.0.0',
      uptimeSec: Math.floor(process.uptime()),
      device: 'CAJA-01',
      lastSeq: journal.getLastSeq(),
      dataDir: journal.getDataDir(),
      timestamp: new Date().toISOString()
    };
    sendJson(res, 200, statusData);
    return;
  }

  // 2. GET /api/events - Lista de eventos transaccionales desde una secuencia
  if (pathname === '/api/events' && method === 'GET') {
    const sinceSeq = parseInt(query.sinceSeq || '0', 10) || 0;
    const events = journal.readEventsSince(sinceSeq);
    sendJson(res, 200, {
      ok: true,
      sinceSeq: sinceSeq,
      lastSeq: journal.getLastSeq(),
      count: events.length,
      events: events
    });
    return;
  }

  // 3. POST /api/events - Inserción inmutable de evento en el journal con fsync
  if (pathname === '/api/events' && method === 'POST') {
    readJsonBody(req, function (err, body) {
      if (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }

      // El evento puede venir como { event: { ... } } o directamente como objeto
      const eventData = body.event || body;
      if (!eventData || typeof eventData !== 'object' || !eventData.type) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Estructura de evento inválida. Se requiere objeto con campo "type".'
        });
      }

      try {
        // Persistir físicamente en journal con fsync obligatorio
        const savedEvent = journal.appendEvent(eventData);

        // Aplicar la mutación sobre el estado materializado en memoria
        stateManager.applyEvent(savedEvent, false);

        return sendJson(res, 201, {
          ok: true,
          seq: savedEvent.seq,
          id: savedEvent.id,
          event: savedEvent
        });
      } catch (saveErr) {
        console.error('[API] Error al guardar evento en journal:', saveErr.message);
        return sendJson(res, 500, {
          ok: false,
          error: 'Error de persistencia en disco: ' + saveErr.message
        });
      }
    });
    return;
  }

  // 4. GET /api/state - Retorna el estado actual completo
  if (pathname === '/api/state' && method === 'GET') {
    const currentState = stateManager.getState();
    sendJson(res, 200, {
      ok: true,
      lastSeq: stateManager.getLastSeq(),
      state: currentState
    });
    return;
  }

  // 5. POST /api/backup - Dispara un respaldo manual inmediato en disco
  if (pathname === '/api/backup' && method === 'POST') {
    try {
      const backupResult = journal.createDailyBackup();
      stateManager.saveSnapshot();
      sendJson(res, 200, {
        ok: true,
        message: 'Respaldo manual generado con éxito en ' + backupResult.backupDir,
        backupDir: backupResult.backupDir,
        lastSeq: journal.getLastSeq(),
        timestamp: backupResult.timestamp
      });
    } catch (bkErr) {
      console.error('[API] Error generando respaldo:', bkErr.message);
      sendJson(res, 500, { ok: false, error: 'Error al generar respaldo: ' + bkErr.message });
    }
    return;
  }

  // 6. POST /api/snapshot - Fuerza guardado de snapshot
  if (pathname === '/api/snapshot' && method === 'POST') {
    try {
      const saved = stateManager.saveSnapshot();
      sendJson(res, 200, {
        ok: saved,
        lastSeq: stateManager.getLastSeq(),
        timestamp: new Date().toISOString()
      });
    } catch (snapErr) {
      console.error('[API] Error guardando snapshot:', snapErr.message);
      sendJson(res, 500, { ok: false, error: 'Error al guardar snapshot: ' + snapErr.message });
    }
    return;
  }

  // Endpoint no encontrado
  sendJson(res, 404, {
    ok: false,
    error: 'Endpoint API no encontrado: ' + method + ' ' + pathname
  });
}

module.exports = {
  handleApiRequest: handleApiRequest,
  sendJson: sendJson,
  readJsonBody: readJsonBody
};
