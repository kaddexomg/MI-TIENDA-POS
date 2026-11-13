'use strict';

/**
 * server/api.js
 * MI-TIENDA-POS v8.0.0
 *
 * Enrutador de API REST + SSE en tiempo real para operaciones transaccionales locales.
 * Endpoints /api/v1/* (y alias /api/*):
 * - GET  /api/v1/status         (público: estado y versión del motor)
 * - POST /api/v1/auth/login     (verifica usuario/PIN y emite token HMAC-SHA256)
 * - POST /api/v1/auth/logout    (invalida token de sesión actual)
 * - GET  /api/v1/stream         (SSE en tiempo real de eventos confirmados)
 * - GET  /api/v1/events         (requiere token)
 * - POST /api/v1/events         (requiere token + verificación RBAC de tipo de evento)
 * - GET  /api/v1/state          (requiere token)
 * - POST /api/v1/backup         (solo Administrador / Encargado)
 * - POST /api/v1/snapshot       (solo Administrador / Encargado)
 *
 * Compatible con Node.js v13.14.0+ (CommonJS puro, sin dependencias externas).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const aiAdvisor = require('./ai-advisor');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const DEFAULT_SEED_USERS = {
  admin: { username: 'admin', role: 'Administrador', pin: '123456' },
  encargado: { username: 'encargado', role: 'Encargado', pin: '2244' },
  cajero: { username: 'cajero', role: 'Cajero', pin: '1234' }
};

// Eventos restringidos exclusivamente a Administrador o Encargado
const ADMIN_ONLY_EVENT_TYPES = {
  STATE_SYNCED: ['Administrador'],
  USER_CHANGED: ['Administrador'],
  BACKUP_IMPORTED: ['Administrador'],
  SETTINGS_UPDATED: ['Administrador'],
  FISCAL_DOC_ISSUED: ['Administrador', 'Encargado'],
  ITEM_DELETED: ['Administrador', 'Encargado'],
  ITEM_SAVED: ['Administrador', 'Encargado'],
  STOCK_ADJUSTED: ['Administrador', 'Encargado'],
  RATE_UPDATED: ['Administrador', 'Encargado'],
  SALE_VOIDED: ['Administrador', 'Encargado'],
  PAGO_MOVIL_STATUS_CHANGED: ['Administrador', 'Encargado'],
  CATALOG_CHANGED: ['Administrador', 'Encargado']
};

let cachedSecret = null;
let cachedSecretDir = null;
const revokedTokens = new Set();
const sseClients = new Set();

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function resolveCorsOrigin(req) {
  const origin = req && req.headers ? req.headers.origin : null;
  if (!origin) return 'http://127.0.0.1:7070';
  if (origin === 'null') return 'null';
  if (/^https?:\/\/appassets\.androidplatform\.net$/i.test(origin)) return origin;
  if (/^capacitor:\/\/localhost$/i.test(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(origin)) {
    return origin;
  }
  // Tailscale CGNAT 100.64.0.0/10
  if (/^https?:\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+(:\d+)?$/i.test(origin)) {
    return origin;
  }
  // Túneles HTTPS seguros (Cloudflare, Tailscale Funnel, Ngrok, dominio propio)
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) {
    return origin;
  }
  return null;
}

function buildCorsHeaders(req, extraHeaders) {
  const allowedOrigin = resolveCorsOrigin(req);
  const headers = Object.assign({
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  }, extraHeaders || {});
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return headers;
}

function getAuthSecret(journal) {
  const dir = journal && typeof journal.getDataDir === 'function' ? journal.getDataDir() : null;
  if (cachedSecret && cachedSecretDir === dir) return cachedSecret;
  if (dir) {
    const secretFile = path.join(dir, 'auth.secret');
    try {
      if (fs.existsSync(secretFile)) {
        const existing = fs.readFileSync(secretFile, 'utf8').trim();
        if (existing.length >= 32) {
          cachedSecret = existing;
          cachedSecretDir = dir;
          return cachedSecret;
        }
      }
      const fresh = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFile, fresh, 'utf8');
      cachedSecret = fresh;
      cachedSecretDir = dir;
      return cachedSecret;
    } catch (e) {
      // Fallback en memoria si no es escribible
    }
  }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  cachedSecretDir = dir;
  return cachedSecret;
}

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(b64) {
  let pad = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (pad.length % 4 !== 0) pad += '=';
  return Buffer.from(pad, 'base64').toString('utf8');
}

function signToken(payloadObj, secret) {
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'MTP' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(payloadObj));
  const data = headerB64 + '.' + payloadB64;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return data + '.' + sig;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  if (revokedTokens.has(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  try {
    const a = Buffer.from(parts[2], 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(base64UrlDecode(parts[1]));
    if (!decoded || typeof decoded.exp !== 'number' || Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch (e) {
    return null;
  }
}

function extractBearerToken(req, query) {
  const authHeader = req && req.headers ? (req.headers.authorization || req.headers.Authorization) : '';
  if (authHeader && typeof authHeader === 'string' && authHeader.indexOf('Bearer ') === 0) {
    return authHeader.slice(7).trim();
  }
  if (query && typeof query.token === 'string' && query.token.trim()) {
    return query.token.trim();
  }
  return null;
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'admin' || r === 'administrador' || r === 'dueno' || r === 'dueño' || r === 'owner') {
    return 'Administrador';
  }
  if (r === 'encargado' || r === 'manager' || r === 'supervisor') {
    return 'Encargado';
  }
  return 'Cajero';
}

function verifyCredentials(body, stateManager) {
  const username = body && body.username ? String(body.username).trim().toLowerCase() : '';
  const pin = body && body.pin !== undefined && body.pin !== null ? String(body.pin).trim() : '';
  const pinHash = body && body.pinHash ? String(body.pinHash).trim() : '';
  const isMobileAdmin = body && (body.clientApp === 'mobile-admin' || body.clientApp === 'mobile');

  if (!pin && !pinHash) {
    return { ok: false, error: 'Ingresa tu PIN de acceso.' };
  }
  if (!username && !isMobileAdmin) {
    return { ok: false, error: 'Usuario y PIN son obligatorios.' };
  }

  const currentState = stateManager && typeof stateManager.getState === 'function' ? stateManager.getState() : {};
  const stateUsers = Array.isArray(currentState.users) ? currentState.users : [];

  function matchesUserPin(u) {
    const salt = u.salt || '';
    const computedFromPin = pin ? sha256Hex(salt + ':' + pin) : '';
    const legacyFromPin = pin ? sha256Hex(pin) : '';
    return (pin && (computedFromPin === u.pinHash || legacyFromPin === u.pinHash || pin === u.pin))
      || (pinHash && u.pinHash && pinHash === u.pinHash);
  }

  if (stateUsers.length > 0) {
    if (username) {
      for (let i = 0; i < stateUsers.length; i++) {
        const u = stateUsers[i];
        if (!u || String(u.username || '').toLowerCase() !== username) continue;
        if (u.active === false) return { ok: false, error: 'Usuario desactivado.' };
        if (matchesUserPin(u)) {
          return {
            ok: true,
            user: { username: u.username, name: u.name || u.username, role: normalizeRole(u.role) }
          };
        }
        return { ok: false, error: 'PIN incorrecto.' };
      }
    } else if (isMobileAdmin) {
      // Acceso personal por PIN único: buscar Administrador activo cuyo PIN coincida
      let hasActiveAdmin = false;
      for (let i = 0; i < stateUsers.length; i++) {
        const u = stateUsers[i];
        if (!u || u.active === false) continue;
        if (normalizeRole(u.role) !== 'Administrador') continue;
        hasActiveAdmin = true;
        if (matchesUserPin(u)) {
          return {
            ok: true,
            user: { username: u.username, name: u.name || u.username, role: 'Administrador' }
          };
        }
      }
      if (hasActiveAdmin) {
        return { ok: false, error: 'PIN de Administrador incorrecto.' };
      }
    }
    // También permitir usuarios semilla por defecto si aún no se han sincronizado todos
  }

  const targetUser = username || 'admin';
  const seed = DEFAULT_SEED_USERS[targetUser];
  if (seed) {
    const seedMatches = (pin && pin === seed.pin) || (pinHash && pinHash === sha256Hex(seed.pin));
    if (seedMatches) {
      return { ok: true, user: { username: seed.username, name: seed.username, role: normalizeRole(seed.role) } };
    }
    return { ok: false, error: 'PIN incorrecto.' };
  }

  return { ok: false, error: 'Usuario no reconocido en el servidor.' };
}

function getNetworkInfo(stateManager, req) {
  const interfaces = os.networkInterfaces ? os.networkInterfaces() : {};
  const lanIps = [];
  const tailscaleIps = [];
  const keys = Object.keys(interfaces);

  for (let i = 0; i < keys.length; i++) {
    const addrs = interfaces[keys[i]] || [];
    for (let j = 0; j < addrs.length; j++) {
      const a = addrs[j];
      if (!a || a.internal || a.family !== 'IPv4') continue;
      const ip = a.address;
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(ip)) {
        if (tailscaleIps.indexOf(ip) === -1) tailscaleIps.push(ip);
      } else if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) {
        if (lanIps.indexOf(ip) === -1) lanIps.push(ip);
      }
    }
  }

  const livePort = (req && req.socket && req.socket.localPort) ? Number(req.socket.localPort) : 0;
  const port = livePort || parseInt(process.env.PORT, 10) || 7070;
  const st = stateManager && typeof stateManager.getState === 'function' ? stateManager.getState() : {};
  const vpsUrl = st && st.settings && st.settings.vpsUrl ? String(st.settings.vpsUrl).trim().replace(/\/+$/, '') : '';
  const remoteUrl = st && st.settings && st.settings.mobileTunnelUrl ? String(st.settings.mobileTunnelUrl).trim().replace(/\/+$/, '') : '';
  const lanUrls = lanIps.map(function (ip) { return 'http://' + ip + ':' + port; });
  const tailscaleUrls = tailscaleIps.map(function (ip) { return 'http://' + ip + ':' + port; });

  return {
    port: port,
    lanIps: lanIps,
    tailscaleIps: tailscaleIps,
    lanUrls: lanUrls,
    tailscaleUrls: tailscaleUrls,
    vpsUrl: vpsUrl,
    remoteUrl: vpsUrl || remoteUrl,
    primaryUrl: vpsUrl || remoteUrl || tailscaleUrls[0] || lanUrls[0] || ('http://127.0.0.1:' + port)
  };
}

function buildSseEventSummary(savedEvent, currentState) {
  const type = savedEvent ? savedEvent.type : '';
  const p = savedEvent && savedEvent.payload ? savedEvent.payload : {};
  const summary = { kind: type };

  if (type === 'SALE_CREATED') {
    summary.orderNumber = p.orderNumber || '';
    summary.customer = p.customer || 'Cliente Mostrador';
    summary.totalUsd = Number(p.totalUsd || 0);
    summary.totalBs = Number(p.totalBs || 0);

    let pendingPmCount = 0;
    let pendingPmBs = 0;
    let pendingPmRef = '';
    let pendingPmBank = '';
    if (Array.isArray(p.payments)) {
      for (let i = 0; i < p.payments.length; i++) {
        const pay = p.payments[i];
        if (pay && pay.method === 'Pago Móvil') {
          const isPending = pay.verifyStatus === 'PENDIENTE' || (pay.verified === false && pay.verifyStatus !== 'CONCILIADO' && pay.verifyStatus !== 'RECHAZADO');
          if (isPending) {
            pendingPmCount += 1;
            pendingPmBs += Number(pay.amountBs || 0);
            if (!pendingPmRef) pendingPmRef = pay.ref || '';
            if (!pendingPmBank) pendingPmBank = pay.bank || '';
          }
        }
      }
    }
    summary.hasPendingPagoMovil = pendingPmCount > 0;
    summary.pendingPmCount = pendingPmCount;
    summary.pendingPmBs = Number(pendingPmBs.toFixed(2));
    summary.pendingPmRef = pendingPmRef;
    summary.pendingPmBank = pendingPmBank;

    // Alertar si algún artículo cayó bajo mínimo tras la venta
    const lowStock = [];
    const inv = currentState && Array.isArray(currentState.inventory) ? currentState.inventory : [];
    for (let j = 0; j < inv.length; j++) {
      const it = inv[j];
      if (!it) continue;
      const stk = Number(it.stock || 0);
      const minStk = Number(it.minStock || 5);
      if (stk <= minStk) {
        lowStock.push({ id: it.id, name: it.name, stock: stk, unit: it.unit || 'und' });
        if (lowStock.length >= 3) break;
      }
    }
    summary.lowStockAlerts = lowStock;
  } else if (type === 'PAGO_MOVIL_STATUS_CHANGED') {
    summary.saleId = p.saleId || '';
    summary.paymentRef = p.paymentRef || '';
    summary.newStatus = p.newStatus || 'CONCILIADO';
  } else if (type === 'STOCK_ADJUSTED' || type === 'WASTE_RECORDED' || type === 'ITEM_SAVED') {
    summary.itemName = p.itemName || (p.item && p.item.name) || p.name || '';
  }

  return summary;
}

function broadcastSseEvent(eventName, dataObj) {
  if (sseClients.size === 0) return;
  const payload = 'event: ' + eventName + '\ndata: ' + JSON.stringify(dataObj) + '\n\n';
  sseClients.forEach(function (clientRes) {
    try {
      clientRes.write(payload);
    } catch (e) {
      sseClients.delete(clientRes);
    }
  });
}

function sendJson(res, statusCode, data, req) {
  const jsonBody = JSON.stringify(data);
  const headers = buildCorsHeaders(req, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.writeHead(statusCode, headers);
  res.end(jsonBody);
}

function readJsonBody(req, callback) {
  const chunks = [];
  let totalBytes = 0;
  let settled = false;
  const maxBytes = 10 * 1024 * 1024;

  function done(err, data) {
    if (settled) return;
    settled = true;
    callback(err, data);
  }

  req.on('data', function (chunk) {
    if (settled) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      settled = true;
      try {
        if (typeof req.destroy === 'function') req.destroy();
        else if (req.connection && typeof req.connection.destroy === 'function') req.connection.destroy();
      } catch (_) {}
      callback(new Error('Payload demasiado grande (>10MB)'));
      return;
    }
    chunks.push(buf);
  });

  req.on('end', function () {
    if (settled) return;
    const body = Buffer.concat(chunks).toString('utf8');
    if (!body || body.trim().length === 0) {
      return done(null, {});
    }
    try {
      const parsed = JSON.parse(body);
      done(null, parsed);
    } catch (parseErr) {
      done(new Error('JSON sintácticamente inválido: ' + parseErr.message));
    }
  });

  req.on('error', function (err) {
    done(err);
  });
}

function normalizeEndpoint(pathname) {
  if (pathname.indexOf('/api/v1/') === 0) {
    return '/api/' + pathname.slice('/api/v1/'.length);
  }
  if (pathname === '/api/v1') return '/api';
  return pathname;
}

function handleApiRequest(req, res, journal, stateManager) {
  const parsedUrl = url.parse(req.url, true);
  const rawPathname = parsedUrl.pathname || '/';
  const pathname = normalizeEndpoint(rawPathname);
  const query = parsedUrl.query || {};
  const method = req.method ? req.method.toUpperCase() : 'GET';

  if (method === 'OPTIONS') {
    const corsHeaders = buildCorsHeaders(req, { 'Access-Control-Max-Age': '86400' });
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // 1. GET /api/v1/status o /api/status (Público)
  if (pathname === '/api/status' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'MI-TIENDA-POS Local Engine',
      version: '8.0.0',
      uptimeSec: Math.floor(process.uptime()),
      device: 'CAJA-01',
      lastSeq: journal.getLastSeq(),
      dataDir: journal.getDataDir(),
      sseClients: sseClients.size,
      timestamp: new Date().toISOString()
    }, req);
  }

  const secret = getAuthSecret(journal);

  // 2. POST /api/v1/auth/login
  if (pathname === '/api/auth/login' && method === 'POST') {
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      const check = verifyCredentials(body, stateManager);
      if (!check.ok) {
        return sendJson(res, 401, { ok: false, error: check.error }, req);
      }
      if (body && (body.clientApp === 'mobile-admin' || body.clientApp === 'mobile') && check.user.role !== 'Administrador') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Acceso exclusivo para el Administrador (Dueño). El rol ' + check.user.role + ' no puede acceder desde el teléfono.'
        }, req);
      }
      const now = Date.now();
      const claims = {
        sub: check.user.username,
        name: check.user.name,
        role: check.user.role,
        iat: now,
        exp: now + TOKEN_TTL_MS
      };
      const token = signToken(claims, secret);
      return sendJson(res, 200, {
        ok: true,
        token: token,
        expiresAt: new Date(claims.exp).toISOString(),
        user: check.user
      }, req);
    });
    return;
  }

  // 3. POST /api/v1/auth/logout
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const tok = extractBearerToken(req, query);
    if (tok) revokedTokens.add(tok);
    return sendJson(res, 200, { ok: true }, req);
  }

  // Autenticación obligatoria para endpoints protegidos
  const token = extractBearerToken(req, query);
  const session = verifyToken(token, secret);
  if (!session) {
    return sendJson(res, 401, {
      ok: false,
      error: 'No autorizado. Inicia sesión para obtener un token local válido.'
    }, req);
  }
  const sessionRole = normalizeRole(session.role);
  session.role = sessionRole;

  // 4. GET /api/v1/stream (Server-Sent Events en tiempo real)
  if (pathname === '/api/stream' && method === 'GET') {
    const sseHeaders = buildCorsHeaders(req, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.writeHead(200, sseHeaders);
    res.write(': connected seq=' + journal.getLastSeq() + '\n\n');
    sseClients.add(res);

    const keepalive = setInterval(function () {
      try {
        res.write(': ping ' + Date.now() + '\n\n');
      } catch (e) {
        clearInterval(keepalive);
        sseClients.delete(res);
      }
    }, 25000);
    if (keepalive.unref) keepalive.unref();

    req.on('close', function () {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
    return;
  }

  // 5. GET /api/v1/events
  if (pathname === '/api/events' && method === 'GET') {
    const sinceSeq = parseInt(query.sinceSeq || '0', 10) || 0;
    const events = journal.readEventsSince(sinceSeq);
    return sendJson(res, 200, {
      ok: true,
      sinceSeq: sinceSeq,
      lastSeq: journal.getLastSeq(),
      count: events.length,
      events: events
    }, req);
  }

  // 6. POST /api/v1/events
  if (pathname === '/api/events' && method === 'POST') {
    readJsonBody(req, function (err, body) {
      if (err) {
        return sendJson(res, 400, { ok: false, error: err.message }, req);
      }

      const eventData = body.event || body;
      if (!eventData || typeof eventData !== 'object' || !eventData.type) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Estructura de evento inválida. Se requiere objeto con campo "type".'
        }, req);
      }

      const allowedRoles = ADMIN_ONLY_EVENT_TYPES[eventData.type];
      if (allowedRoles && allowedRoles.indexOf(session.role) === -1) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Tu rol (' + session.role + ') no tiene permiso para ejecutar ' + eventData.type
        }, req);
      }

      try {
        const enrichedEvent = Object.assign({}, eventData, {
          user: eventData.user || session.sub
        });
        const savedEvent = journal.appendEvent(enrichedEvent);
        if (!savedEvent.deduplicated) {
          const updatedState = stateManager.applyEvent(savedEvent, false);
          broadcastSseEvent('state_event', {
            seq: savedEvent.seq,
            type: savedEvent.type,
            id: savedEvent.id,
            ts: savedEvent.ts,
            user: savedEvent.user,
            summary: buildSseEventSummary(savedEvent, updatedState)
          });
        }

        return sendJson(res, 201, {
          ok: true,
          seq: savedEvent.seq,
          id: savedEvent.id,
          deduplicated: !!savedEvent.deduplicated,
          event: savedEvent
        }, req);
      } catch (saveErr) {
        console.error('[API] Error al guardar evento en journal:', saveErr.message);
        return sendJson(res, 500, {
          ok: false,
          error: 'Error de persistencia en disco: ' + saveErr.message
        }, req);
      }
    });
    return;
  }

  // 6b. POST /api/v1/events/batch (Sincronización en lote desde respaldo offline PC -> VPS)
  if (pathname === '/api/events/batch' && method === 'POST') {
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      const list = body && Array.isArray(body.events) ? body.events : [];
      if (list.length === 0) {
        return sendJson(res, 200, { ok: true, syncedCount: 0, deduplicatedCount: 0, lastSeq: journal.getLastSeq() }, req);
      }

      let syncedCount = 0;
      let deduplicatedCount = 0;
      const errors = [];

      for (let i = 0; i < list.length; i++) {
        const ev = list[i];
        if (!ev || typeof ev !== 'object' || !ev.type) {
          errors.push({ index: i, id: ev && ev.id ? ev.id : '', status: 400, error: 'Evento sin tipo válido' });
          continue;
        }
        const allowedRoles = ADMIN_ONLY_EVENT_TYPES[ev.type];
        if (allowedRoles && allowedRoles.indexOf(session.role) === -1) {
          errors.push({ index: i, id: ev.id || '', type: ev.type, status: 403, error: 'Sin permiso para ' + ev.type });
          continue;
        }
        try {
          const enriched = Object.assign({}, ev, { user: ev.user || session.sub });
          const saved = journal.appendEvent(enriched);
          if (saved.deduplicated) {
            deduplicatedCount += 1;
          } else {
            const updatedState = stateManager.applyEvent(saved, false);
            broadcastSseEvent('state_event', {
              seq: saved.seq,
              type: saved.type,
              id: saved.id,
              ts: saved.ts,
              user: saved.user,
              summary: buildSseEventSummary(saved, updatedState)
            });
            syncedCount += 1;
          }
        } catch (batchErr) {
          errors.push({ index: i, id: ev.id || '', type: ev.type, status: 500, error: batchErr.message });
        }
      }

      return sendJson(res, 200, {
        ok: errors.length === 0,
        syncedCount: syncedCount,
        deduplicatedCount: deduplicatedCount,
        lastSeq: journal.getLastSeq(),
        errors: errors
      }, req);
    });
    return;
  }

  // 7. GET /api/v1/state
  if (pathname === '/api/state' && method === 'GET') {
    const currentState = stateManager.getState();
    return sendJson(res, 200, {
      ok: true,
      lastSeq: stateManager.getLastSeq(),
      state: currentState
    }, req);
  }

  // 8. POST /api/v1/backup (Administrador o Encargado)
  if (pathname === '/api/backup' && method === 'POST') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede crear respaldos.' }, req);
    }
    try {
      const backupResult = journal.createDailyBackup();
      stateManager.saveSnapshot();
      return sendJson(res, 200, {
        ok: true,
        message: 'Respaldo manual generado con éxito en ' + backupResult.backupDir,
        backupDir: backupResult.backupDir,
        lastSeq: journal.getLastSeq(),
        timestamp: backupResult.timestamp
      }, req);
    } catch (bkErr) {
      console.error('[API] Error generando respaldo:', bkErr.message);
      return sendJson(res, 500, { ok: false, error: 'Error al generar respaldo: ' + bkErr.message }, req);
    }
  }

  // 9. POST /api/v1/snapshot (Administrador o Encargado)
  if (pathname === '/api/snapshot' && method === 'POST') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede guardar snapshots.' }, req);
    }
    try {
      const saved = stateManager.saveSnapshot();
      return sendJson(res, 200, {
        ok: saved,
        lastSeq: stateManager.getLastSeq(),
        timestamp: new Date().toISOString()
      }, req);
    } catch (snapErr) {
      console.error('[API] Error guardando snapshot:', snapErr.message);
      return sendJson(res, 500, { ok: false, error: 'Error al guardar snapshot: ' + snapErr.message }, req);
    }
  }

  // 10. GET /api/v1/network-info (Administrador o Encargado)
  if (pathname === '/api/network-info' && method === 'GET') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado.' }, req);
    }
    return sendJson(res, 200, Object.assign({ ok: true }, getNetworkInfo(stateManager, req)), req);
  }

  // 11. GET /api/v1/ai/insights (Análisis IA de Costos, Precios e Inventario)
  if (pathname === '/api/ai/insights' && method === 'GET') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede consultar la IA.' }, req);
    }
    try {
      const insights = aiAdvisor.analyzeBusiness(stateManager.getState());
      return sendJson(res, 200, { ok: true, insights: insights }, req);
    } catch (aiErr) {
      return sendJson(res, 500, { ok: false, error: 'Error en análisis IA: ' + aiErr.message }, req);
    }
  }

  // 12. POST /api/v1/ai/ask (Consulta interactiva en lenguaje natural al Asistente IA)
  if (pathname === '/api/ai/ask' && method === 'POST') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede consultar la IA.' }, req);
    }
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      const question = body && body.question ? String(body.question) : '';
      const result = aiAdvisor.answerQuestion(stateManager.getState(), question);
      return sendJson(res, 200, Object.assign({ ok: true }, result), req);
    });
    return;
  }

  return sendJson(res, 404, {
    ok: false,
    error: 'Endpoint API no encontrado: ' + method + ' ' + rawPathname
  }, req);
}

module.exports = {
  handleApiRequest: handleApiRequest,
  sendJson: sendJson,
  readJsonBody: readJsonBody,
  buildCorsHeaders: buildCorsHeaders,
  verifyToken: verifyToken
};
