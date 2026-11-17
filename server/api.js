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
const aiKeys = require('./ai-keys');
const imageSearch = require('./image-search');
const photoStudio = require('./photo-studio');
const pagoMovilParser = require('./pagomovil-parser');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días para evitar cierres inesperados en jornada o móvil
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
  PAGO_MOVIL_INCOMING: ['Administrador', 'Encargado'],
  CATALOG_CHANGED: ['Administrador', 'Encargado']
};

let cachedSecret = null;
let cachedSecretDir = null;
const revokedTokens = new Set();
const sseClients = new Set();
const scannerStreamClients = new Set();
const recentScans = [];
const MAX_RECENT_SCANS = 60;
let lastScanSeq = 0;
let cachedScannerPairCode = null;
let cachedScannerPairDir = null;

/* Contexto de pantalla activa en la PC (para el modo AUTO del escáner móvil).
   La pantalla abierta (Caja / Inventario / Gastos) anuncia su presencia con un
   heartbeat; si el anuncio es reciente, el escáner automático enruta allí. */
let activeScreenContext = null;
const SCREEN_CONTEXT_TTL_MS = 45000;
const SCREEN_LABELS = { pos: 'Caja', inventario: 'Inventario', gastos: 'Compras y Gastos', otra: 'Otra pantalla' };

function normalizeScreenName(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'pos' || s === 'caja') return 'pos';
  if (s === 'inventario' || s === 'inventory') return 'inventario';
  if (s === 'gastos' || s === 'facturas' || s === 'expenses') return 'gastos';
  return 'otra';
}

function getFreshScreenContext() {
  if (activeScreenContext && activeScreenContext.at && (Date.now() - activeScreenContext.at) <= SCREEN_CONTEXT_TTL_MS) {
    return activeScreenContext;
  }
  return null;
}

function resolveAutoScanMode() {
  const ctx = getFreshScreenContext();
  if (!ctx) return { mode: 'POS_ADD', screen: null, reason: 'sin-contexto-caja-por-defecto' };
  if (ctx.screen === 'inventario') return { mode: 'INVENTORY_FILL', screen: 'inventario', reason: 'pantalla-inventario' };
  if (ctx.screen === 'pos') return { mode: 'POS_ADD', screen: 'pos', reason: 'pantalla-caja' };
  return { mode: 'LOOKUP', screen: ctx.screen, reason: 'pantalla-no-ventas' };
}

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

function getScannerPairCode(journal) {
  const dir = journal && typeof journal.getDataDir === 'function' ? journal.getDataDir() : null;
  if (cachedScannerPairCode && cachedScannerPairDir === dir) return cachedScannerPairCode;
  if (dir) {
    const pairFile = path.join(dir, 'scanner.pair');
    try {
      if (fs.existsSync(pairFile)) {
        const existing = fs.readFileSync(pairFile, 'utf8').trim();
        if (/^[A-Z0-9]{6}$/.test(existing)) {
          cachedScannerPairCode = existing;
          cachedScannerPairDir = dir;
          return cachedScannerPairCode;
        }
      }
      const code = String(crypto.randomInt ? crypto.randomInt(100000, 999999) : Math.floor(100000 + Math.random() * 900000));
      fs.writeFileSync(pairFile, code, 'utf8');
      cachedScannerPairCode = code;
      cachedScannerPairDir = dir;
      return cachedScannerPairCode;
    } catch (e) {
      // Fallback en memoria
    }
  }
  const secret = getAuthSecret(journal);
  cachedScannerPairCode = String((parseInt(sha256Hex(secret + ':pair').slice(0, 8), 16) % 900000) + 100000);
  cachedScannerPairDir = dir;
  return cachedScannerPairCode;
}

function matchesCatalogCode(item, q, qNoDash, qNumPad) {
  if (!item) return false;
  const c = String(item.code || '').trim().toUpperCase();
  const cNoDash = c.replace(/-/g, '');
  const bc = String(item.barcode || '').trim().toUpperCase();
  const sku = String(item.sku || '').trim().toUpperCase();
  const qr = String(item.qrCode || '').trim().toUpperCase();
  if ((c && c === q) || (bc && bc === q) || (sku && sku === q) || (qr && qr === q)) return true;
  if (cNoDash && cNoDash === qNoDash) return true;
  if (c && ('0' + c) === q) return true;
  if (/^[A-Z]+\d+$/.test(qNoDash)) {
    const m = qNoDash.match(/^([A-Z]+)(\d+)$/);
    if (m) {
      const padded = m[1] + m[2].padStart(2, '0');
      if (cNoDash === padded) return true;
      const aliasMap = { EMP: 'EM', ARE: 'AR', ALM: 'AL', CAF: 'CA' };
      if (aliasMap[m[1]] && cNoDash === (aliasMap[m[1]] + m[2].padStart(2, '0'))) return true;
    }
  }
  if (qNumPad && c === ('EM' + qNumPad)) return true;
  return false;
}

function formatCatalogMatch(item, kind, stateObj) {
  const settings = (stateObj && stateObj.settings) || {};
  const bcv = Number(settings.rateBcv) || 42.85;
  const priceUsd = Number(item.priceUsd || 0);
  const costUsd = Number(item.costUsd || 0);
  const taxExempt = Boolean(item.taxExempt || item.iva === 'E' || item.taxType === 'E');
  return {
    found: true,
    kind: kind,
    id: item.id || '',
    code: item.code || '',
    barcode: item.barcode || '',
    name: item.name || '',
    familyId: item.familyId || '',
    priceUsd: Number(priceUsd.toFixed(2)),
    priceBs: Number((priceUsd * bcv).toFixed(2)),
    costUsd: Number(costUsd.toFixed(2)),
    stock: item.stock !== undefined && item.stock !== null ? Number(item.stock) : null,
    minStock: item.minStock !== undefined && item.minStock !== null ? Number(item.minStock) : null,
    unit: item.unit || 'und',
    iva: taxExempt ? 'E' : (item.iva || 'G16'),
    taxExempt: taxExempt,
    sellable: kind !== 'insumo' && item.sellable !== false
  };
}

function lookupCatalogItem(stateObj, rawCode, includeInsumos) {
  const q = String(rawCode || '').trim().toUpperCase();
  if (!q || !stateObj || typeof stateObj !== 'object') {
    return { found: false, query: String(rawCode || '').trim() };
  }
  const qNoDash = q.replace(/-/g, '');
  const qNumPad = /^\d{1,2}$/.test(q) ? q.padStart(2, '0') : '';

  const variants = Array.isArray(stateObj.variants) ? stateObj.variants : [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (v && v.active !== false && matchesCatalogCode(v, q, qNoDash, qNumPad)) {
      return formatCatalogMatch(v, 'variant', stateObj);
    }
  }

  const dishes = Array.isArray(stateObj.dishes) ? stateObj.dishes : [];
  for (let i = 0; i < dishes.length; i++) {
    const d = dishes[i];
    if (d && d.active !== false && matchesCatalogCode(d, q, qNoDash, qNumPad)) {
      return formatCatalogMatch(d, 'dish', stateObj);
    }
  }

  const retailItems = Array.isArray(stateObj.retailItems) ? stateObj.retailItems : [];
  for (let i = 0; i < retailItems.length; i++) {
    const r = retailItems[i];
    if (r && r.active !== false && r.sellable !== false && matchesCatalogCode(r, q, qNoDash, '')) {
      return formatCatalogMatch(r, 'retail', stateObj);
    }
  }

  const inventory = Array.isArray(stateObj.inventory) ? stateObj.inventory : [];
  for (let i = 0; i < inventory.length; i++) {
    const inv = inventory[i];
    if (!inv || inv.active === false) continue;
    const isSellable = inv.sellable === true || inv.type === 'venta';
    if (!isSellable && !includeInsumos) continue;
    if (matchesCatalogCode(inv, q, qNoDash, '')) {
      return formatCatalogMatch(inv, isSellable ? 'retail' : 'insumo', stateObj);
    }
  }

  return { found: false, query: String(rawCode || '').trim() };
}

function parseScannedCodeInput(rawCode, rawQty) {
  const clean = String(rawCode || '').trim();
  let code = clean;
  let qty = Number(rawQty);
  if (!isFinite(qty) || qty <= 0) qty = 1;
  if (clean.indexOf('*') !== -1) {
    const parts = clean.split('*');
    const parsedMult = parseInt(parts[0], 10);
    const rest = parts.slice(1).join('*').trim();
    if (!isNaN(parsedMult) && parsedMult > 0 && rest) {
      qty = parsedMult;
      code = rest;
    }
  }
  return { code: code, qty: Math.min(999, Math.max(1, qty)) };
}

function verifyCredentials(body, stateManager, journal) {
  const username = body && body.username ? String(body.username).trim().toLowerCase() : '';
  const pin = body && body.pin !== undefined && body.pin !== null ? String(body.pin).trim() : '';
  const pinHash = body && body.pinHash ? String(body.pinHash).trim() : '';
  const pairCode = body && body.pairCode ? String(body.pairCode).trim().toUpperCase() : '';
  const isMobileAdmin = body && (body.clientApp === 'mobile-admin' || body.clientApp === 'mobile');
  const isMobileScanner = body && body.clientApp === 'mobile-scanner';

  if (isMobileScanner && pairCode && journal) {
    const expectedPair = getScannerPairCode(journal);
    if (pairCode === expectedPair) {
      return {
        ok: true,
        paired: true,
        user: { username: 'escaner-movil', name: 'Escáner Móvil', role: 'Cajero' }
      };
    }
    return { ok: false, error: 'Código de emparejamiento inválido o expirado.' };
  }

  if (!pin && !pinHash) {
    return { ok: false, error: 'Ingresa tu PIN de acceso.' };
  }
  if (!username && !isMobileAdmin && !isMobileScanner) {
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
    } else if (isMobileScanner) {
      // Escáner móvil: permite acceso por PIN a cualquier rol activo (Cajero, Encargado o Admin)
      let hasActiveUser = false;
      for (let i = 0; i < stateUsers.length; i++) {
        const u = stateUsers[i];
        if (!u || u.active === false) continue;
        hasActiveUser = true;
        if (matchesUserPin(u)) {
          return {
            ok: true,
            user: { username: u.username, name: u.name || u.username, role: normalizeRole(u.role) }
          };
        }
      }
      if (hasActiveUser) {
        return { ok: false, error: 'PIN incorrecto.' };
      }
    }
    // También permitir usuarios semilla por defecto si aún no se han sincronizado todos
  }

  if (!username && isMobileScanner) {
    const seedKeys = Object.keys(DEFAULT_SEED_USERS);
    for (let sIdx = 0; sIdx < seedKeys.length; sIdx++) {
      const seedUser = DEFAULT_SEED_USERS[seedKeys[sIdx]];
      if ((pin && pin === seedUser.pin) || (pinHash && pinHash === sha256Hex(seedUser.pin))) {
        return { ok: true, user: { username: seedUser.username, name: seedUser.username, role: normalizeRole(seedUser.role) } };
      }
    }
    return { ok: false, error: 'PIN incorrecto.' };
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
  } else if (type === 'PAGO_MOVIL_INCOMING') {
    summary.amountBs = Number(p.amountBs || 0);
    summary.reference = p.reference || '';
    summary.bankName = p.bankName || '';
    summary.conciliated = p.conciliated === true;
    summary.saleId = p.saleId || '';
  } else if (type === 'STOCK_ADJUSTED' || type === 'WASTE_RECORDED' || type === 'ITEM_SAVED') {
    summary.itemName = p.itemName || (p.item && p.item.name) || p.name || '';
  }

  return summary;
}

function broadcastSseEvent(eventName, dataObj) {
  const payload = 'event: ' + eventName + '\ndata: ' + JSON.stringify(dataObj) + '\n\n';
  if (sseClients.size > 0) {
    sseClients.forEach(function (clientRes) {
      try {
        clientRes.write(payload);
      } catch (e) {
        sseClients.delete(clientRes);
      }
    });
  }
}

function broadcastScannerEvent(scanObj) {
  const payload = 'event: barcode_scan\ndata: ' + JSON.stringify(scanObj) + '\n\n';
  sseClients.forEach(function (clientRes) {
    try {
      clientRes.write(payload);
    } catch (e) {
      sseClients.delete(clientRes);
    }
  });
  scannerStreamClients.forEach(function (clientRes) {
    try {
      clientRes.write(payload);
    } catch (e) {
      scannerStreamClients.delete(clientRes);
    }
  });
}

function broadcastScannerContext() {
  const ctx = getFreshScreenContext();
  const data = JSON.stringify({
    screen: ctx ? ctx.screen : null,
    label: ctx ? ctx.label : null,
    at: ctx ? ctx.at : 0
  });
  const payload = 'event: scanner_context\ndata: ' + data + '\n\n';
  sseClients.forEach(function (clientRes) {
    try { clientRes.write(payload); } catch (e) { sseClients.delete(clientRes); }
  });
  scannerStreamClients.forEach(function (clientRes) {
    try { clientRes.write(payload); } catch (e) { scannerStreamClients.delete(clientRes); }
  });
}

function isLoopbackRequest(req) {
  const addr = req && req.socket && req.socket.remoteAddress
    ? String(req.socket.remoteAddress)
    : (req && req.connection && req.connection.remoteAddress ? String(req.connection.remoteAddress) : '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function resolveScannerAuth(req, query, body, secret, journal) {
  const tok = extractBearerToken(req, query);
  const tokenSession = tok ? verifyToken(tok, secret) : null;
  if (tokenSession) {
    return {
      ok: true,
      via: 'token',
      session: {
        sub: tokenSession.sub || 'usuario',
        name: tokenSession.name || tokenSession.sub || 'Usuario',
        role: normalizeRole(tokenSession.role)
      }
    };
  }
  const pairInput = (body && body.pairCode) || (query && (query.pair || query.pairCode)) || '';
  const cleanPair = String(pairInput || '').trim().toUpperCase();
  if (cleanPair && cleanPair === getScannerPairCode(journal)) {
    return {
      ok: true,
      via: 'pairCode',
      session: { sub: 'escaner-movil', name: 'Escáner Móvil', role: 'Cajero' }
    };
  }
  return { ok: false, via: null, session: null };
}

/* ==========================================================================
   Pago Móvil — Detector bancario automático (Fase 2 v8.5)
   ========================================================================== */

/**
 * Normaliza una referencia bancaria a solo dígitos.
 */
function normalizePaymentReference(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D+/g, '');
}

/**
 * Indica si un pago Pago Móvil sigue pendiente de conciliación.
 */
function isPendingPagoMovilPayment(payment) {
  if (!payment || payment.method !== 'Pago Móvil') return false;
  if (payment.verifyStatus === 'PENDIENTE') return true;
  return payment.verified === false &&
    payment.verifyStatus !== 'CONCILIADO' &&
    payment.verifyStatus !== 'RECHAZADO';
}

/**
 * Busca la venta/pago pendiente que corresponde a un abono bancario.
 * Recorre las ventas de la más reciente a la más vieja y exige:
 *   - método "Pago Móvil" y estado pendiente
 *   - referencia igual o últimos 6 dígitos coincidentes
 *   - monto en Bs con tolerancia de ±0.50
 *
 * @returns {Object|null} { saleId, paymentId, paymentRef, payRef, sale }
 */
function findPendingPagoMovilPayment(stateObj, parsed) {
  if (!stateObj || !parsed || !Array.isArray(stateObj.sales)) return null;
  const amount = Number(parsed.amountBs);
  if (!isFinite(amount) || amount <= 0) return null;
  const messageRef = normalizePaymentReference(parsed.reference);
  if (!messageRef) return null;

  for (let si = stateObj.sales.length - 1; si >= 0; si--) {
    const sale = stateObj.sales[si];
    if (!sale || !Array.isArray(sale.payments)) continue;
    for (let pi = 0; pi < sale.payments.length; pi++) {
      const pay = sale.payments[pi];
      if (!isPendingPagoMovilPayment(pay)) continue;

      const payBs = Number(pay.amountBs);
      if (!isFinite(payBs) || Math.abs(payBs - amount) > 0.5) continue;

      const payRef = normalizePaymentReference(pay.ref !== undefined && pay.ref !== null ? pay.ref : pay.reference);
      if (!payRef) continue;

      const sameRef = payRef === messageRef;
      const sameTail = payRef.length >= 6 && messageRef.length >= 6 &&
        payRef.slice(-6) === messageRef.slice(-6);
      if (!sameRef && !sameTail) continue;

      return {
        saleId: String(sale.id || ''),
        paymentId: pay.id ? String(pay.id) : '',
        paymentRef: messageRef,
        payRef: payRef,
        sale: sale
      };
    }
  }
  return null;
}

/**
 * Busca un abono ya recibido (deduplicación por referencia+monto o texto).
 */
function findDuplicateIncomingPayment(list, parsed, textHash) {
  if (!Array.isArray(list) || !parsed) return null;
  const reference = normalizePaymentReference(parsed.reference);
  const amount = Number(parsed.amountBs);
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item) continue;
    const itemRef = normalizePaymentReference(item.reference);
    const itemAmount = Number(item.amountBs);
    if (reference && itemRef && reference === itemRef &&
        isFinite(amount) && isFinite(itemAmount) && Math.abs(itemAmount - amount) <= 0.01) {
      return item;
    }
    if (textHash && item.rawText && sha256Hex(item.rawText) === textHash) {
      return item;
    }
  }
  return null;
}

/**
 * Proyección pública del parseo (contrato POST /pagomovil/incoming).
 */
function toPublicParsedMessage(parsed) {
  const p = parsed || {};
  return {
    amountBs: p.amountBs === null || p.amountBs === undefined ? null : Number(p.amountBs),
    reference: p.reference || '',
    phone: p.phone || '',
    ci: p.ci || '',
    bankName: p.bankName || 'Banco no identificado',
    confidence: Number(p.confidence || 0)
  };
}

/**
 * Proyección pública de un abono capturado (contrato GET /pagomovil/incoming).
 */
function toPublicIncomingPayment(item) {
  if (!item) return null;
  return {
    id: item.id || '',
    amountBs: Number(item.amountBs || 0),
    reference: item.reference || '',
    phone: item.phone || '',
    ci: item.ci || '',
    bankName: item.bankName || 'Banco no identificado',
    sourceApp: item.sourceApp || '',
    sourcePackage: item.sourcePackage || '',
    rawText: item.rawText || '',
    receivedAt: item.receivedAt || '',
    conciliated: item.conciliated === true,
    saleId: item.saleId || '',
    paymentRef: item.paymentRef || item.reference || '',
    confidence: Number(item.confidence || 0)
  };
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
      version: '8.4.0',
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
      const check = verifyCredentials(body, stateManager, journal);
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

  // 3b. GET /api/v1/scanner/info (Redes LAN + código de emparejamiento si es local o autenticado)
  if (pathname === '/api/scanner/info' && method === 'GET') {
    const net = getNetworkInfo(stateManager, req);
    const scannerAuth = resolveScannerAuth(req, query, null, secret, journal);
    const canExposePair = scannerAuth.ok || isLoopbackRequest(req);
    const pairCode = canExposePair ? getScannerPairCode(journal) : null;
    const basePrimary = net.primaryUrl || ('http://127.0.0.1:' + net.port);
    const httpsPort = parseInt(process.env.HTTPS_PORT, 10) || 7443;
    const scannerUrl = pairCode ? (basePrimary + '/escaner?pair=' + encodeURIComponent(pairCode)) : (basePrimary + '/escaner');
    const toHttpsUrl = function (u) {
      return String(u || '').replace(/^http:\/\//i, 'https://').replace(/:\d+$/, ':' + httpsPort);
    };
    const httpsPrimary = toHttpsUrl(basePrimary);
    const httpsScannerUrl = pairCode ? (httpsPrimary + '/escaner?pair=' + encodeURIComponent(pairCode)) : (httpsPrimary + '/escaner');
    const lanScannerUrls = (net.lanUrls || []).map(function (u) {
      return pairCode ? (u + '/escaner?pair=' + encodeURIComponent(pairCode)) : (u + '/escaner');
    });
    const lanHttpsScannerUrls = (net.lanUrls || []).map(function (u) {
      const hu = toHttpsUrl(u);
      return pairCode ? (hu + '/escaner?pair=' + encodeURIComponent(pairCode)) : (hu + '/escaner');
    });
    return sendJson(res, 200, {
      ok: true,
      port: net.port,
      httpsPort: httpsPort,
      primaryUrl: basePrimary,
      lanUrls: net.lanUrls || [],
      tailscaleUrls: net.tailscaleUrls || [],
      pairCode: pairCode,
      pairedAccess: Boolean(pairCode),
      scannerUrl: scannerUrl,
      httpsScannerUrl: httpsScannerUrl,
      lanScannerUrls: lanScannerUrls,
      lanHttpsScannerUrls: lanHttpsScannerUrls,
      lastScanSeq: lastScanSeq,
      connectedScanners: scannerStreamClients.size + sseClients.size,
      activeScreen: getFreshScreenContext()
    }, req);
  }

  // 3b-2. POST /api/v1/scanner/context (La PC anuncia qué pantalla tiene abierta: pos / inventario / gastos)
  if (pathname === '/api/scanner/context' && method === 'POST') {
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      const ctxAuth = resolveScannerAuth(req, query, body, secret, journal);
      if (!ctxAuth.ok && !isLoopbackRequest(req)) {
        return sendJson(res, 401, { ok: false, error: 'Se requiere token o pairCode válido para anunciar la pantalla activa.' }, req);
      }
      const screen = normalizeScreenName(body && body.screen);
      const label = String((body && body.label) || '').trim().slice(0, 60) || SCREEN_LABELS[screen];
      const changed = !activeScreenContext || activeScreenContext.screen !== screen;
      activeScreenContext = {
        screen: screen,
        label: label,
        page: String((body && body.page) || '').slice(0, 120),
        at: Date.now()
      };
      if (changed) broadcastScannerContext();
      return sendJson(res, 200, { ok: true, context: activeScreenContext }, req);
    });
    return;
  }

  // 3c. GET /api/v1/scanner/stream (SSE exclusivo para recibir escaneos del teléfono en tiempo real)
  if (pathname === '/api/scanner/stream' && method === 'GET') {
    const streamAuth = resolveScannerAuth(req, query, null, secret, journal);
    if (!streamAuth.ok && !isLoopbackRequest(req)) {
      return sendJson(res, 401, { ok: false, error: 'Se requiere token o pairCode válido para suscribirse al escáner.' }, req);
    }
    const sseHeaders = buildCorsHeaders(req, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.writeHead(200, sseHeaders);
    res.write(': connected scanSeq=' + lastScanSeq + '\n\n');
    res.write('event: scanner_ready\ndata: ' + JSON.stringify({ lastScanSeq: lastScanSeq, activeScreen: getFreshScreenContext() }) + '\n\n');

    if (query.sinceSeq !== undefined) {
      const replayFrom = parseInt(query.sinceSeq, 10) || 0;
      for (let i = 0; i < recentScans.length; i++) {
        if (recentScans[i] && recentScans[i].seq > replayFrom) {
          res.write('event: barcode_scan\ndata: ' + JSON.stringify(recentScans[i]) + '\n\n');
        }
      }
    }

    scannerStreamClients.add(res);
    const scanKeepalive = setInterval(function () {
      try {
        res.write(': ping ' + Date.now() + '\n\n');
      } catch (e) {
        clearInterval(scanKeepalive);
        scannerStreamClients.delete(res);
      }
    }, 25000);
    if (scanKeepalive.unref) scanKeepalive.unref();

    req.on('close', function () {
      clearInterval(scanKeepalive);
      scannerStreamClients.delete(res);
    });
    return;
  }

  // 3d. GET /api/v1/scanner/poll (Polling de respaldo + consulta puntual ?lookup=CODIGO)
  if (pathname === '/api/scanner/poll' && method === 'GET') {
    const pollAuth = resolveScannerAuth(req, query, null, secret, journal);
    if (!pollAuth.ok && !isLoopbackRequest(req)) {
      return sendJson(res, 401, { ok: false, error: 'No autorizado para consultar el escáner.' }, req);
    }
    const sinceSeq = parseInt(query.sinceSeq || '0', 10) || 0;
    const scans = [];
    for (let i = 0; i < recentScans.length; i++) {
      if (recentScans[i] && recentScans[i].seq > sinceSeq) {
        scans.push(recentScans[i]);
      }
    }
    const stateObj = stateManager && typeof stateManager.getState === 'function' ? stateManager.getState() : {};
    const settings = (stateObj && stateObj.settings) || {};
    let lookupResult = null;
    if (query.lookup) {
      const parsedLookup = parseScannedCodeInput(query.lookup, query.qty);
      const found = lookupCatalogItem(stateObj, parsedLookup.code, query.includeInsumos === '1');
      lookupResult = Object.assign({ qty: parsedLookup.qty, query: parsedLookup.code }, found);
    }
    return sendJson(res, 200, {
      ok: true,
      lastSeq: lastScanSeq,
      rateBcv: Number(settings.rateBcv) || 42.85,
      activeScreen: getFreshScreenContext(),
      scans: scans,
      lookup: lookupResult
    }, req);
  }

  // 3e. POST /api/v1/scanner/scan (Recibe lectura de cámara o manual desde el teléfono y la transmite al POS)
  if (pathname === '/api/scanner/scan' && method === 'POST') {
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      const scanAuth = resolveScannerAuth(req, query, body, secret, journal);
      if (!scanAuth.ok) {
        return sendJson(res, 401, { ok: false, error: 'Inicia sesión o usa el enlace QR/código de emparejamiento válido.' }, req);
      }
      const parsed = parseScannedCodeInput(body && body.code, body && body.qty);
      if (!parsed.code) {
        return sendJson(res, 400, { ok: false, error: 'El código de barras no puede estar vacío.' }, req);
      }
      let mode = String((body && body.mode) || 'AUTO').trim().toUpperCase();
      let autoInfo = null;
      if (mode === 'AUTO') {
        autoInfo = resolveAutoScanMode();
        mode = autoInfo.mode;
      } else if (['POS_ADD', 'INVENTORY_FILL', 'LOOKUP'].indexOf(mode) === -1) {
        mode = 'POS_ADD';
      }
      const isLookupOnly = mode === 'LOOKUP';
      const includeInsumos = isLookupOnly || mode === 'INVENTORY_FILL' || Boolean(body && body.includeInsumos);
      const stateObj = stateManager && typeof stateManager.getState === 'function' ? stateManager.getState() : {};
      const match = lookupCatalogItem(stateObj, parsed.code, includeInsumos);
      const seq = isLookupOnly ? lastScanSeq : ++lastScanSeq;

      const scanRecord = {
        id: 'scan_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        seq: seq,
        code: parsed.code,
        rawCode: String((body && body.code) || '').trim(),
        qty: parsed.qty,
        mode: mode,
        requestedMode: String((body && body.mode) || 'AUTO').trim().toUpperCase(),
        autoScreen: autoInfo ? autoInfo.screen : null,
        format: String((body && body.format) || 'manual').trim(),
        device: String((body && body.device) || 'Teléfono').trim(),
        target: String((body && body.target) || 'pos').trim(),
        scannedBy: scanAuth.session ? scanAuth.session.name : 'Escáner Móvil',
        at: new Date().toISOString(),
        match: match
      };

      if (!isLookupOnly) {
        recentScans.push(scanRecord);
        while (recentScans.length > MAX_RECENT_SCANS) {
          recentScans.shift();
        }
        broadcastScannerEvent(scanRecord);
      }

      return sendJson(res, 200, {
        ok: true,
        seq: lastScanSeq,
        broadcasted: !isLookupOnly,
        resolvedMode: mode,
        activeScreen: getFreshScreenContext(),
        scan: scanRecord,
        match: match
      }, req);
    });
    return;
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

  // 3f. POST /api/v1/pagomovil/incoming — Abono capturado por el detector bancario del teléfono
  if (pathname === '/api/pagomovil/incoming' && method === 'POST') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, {
        ok: false,
        error: 'Solo Administrador o Encargado puede registrar abonos bancarios.'
      }, req);
    }

    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);

      const payload = body && typeof body === 'object' ? body : {};
      const parsed = pagoMovilParser.parseBankMessage(payload);

      if (!parsed.isPagoMovil) {
        return sendJson(res, 422, {
          ok: false,
          error: 'El mensaje no parece una confirmación de Pago Móvil venezolano.'
        }, req);
      }
      if (!parsed.amountBs) {
        return sendJson(res, 422, {
          ok: false,
          error: 'No se pudo leer el monto en bolívares del mensaje bancario.'
        }, req);
      }

      const stateObj = stateManager.getState() || {};
      const incomingList = Array.isArray(stateObj.incomingBankPayments) ? stateObj.incomingBankPayments : [];
      const textHash = parsed.rawText ? sha256Hex(parsed.rawText) : '';
      const duplicate = findDuplicateIncomingPayment(incomingList, parsed, textHash);
      if (duplicate) {
        return sendJson(res, 200, {
          ok: true,
          parsed: toPublicParsedMessage(parsed),
          duplicate: true,
          conciliated: duplicate.conciliated === true,
          saleId: duplicate.saleId || '',
          paymentId: duplicate.paymentId || '',
          paymentRef: duplicate.paymentRef || parsed.reference,
          status: duplicate.conciliated === true ? 'CONCILIADO' : 'PENDIENTE',
          incomingId: duplicate.id || '',
          at: duplicate.receivedAt || ''
        }, req);
      }

      const match = findPendingPagoMovilPayment(stateObj, parsed);
      const receivedAt = new Date().toISOString();
      const idempotencyKey = 'pm-in-' + (parsed.reference || 'sinref') + '-' + parsed.amountBs;
      const record = {
        id: 'pm-in-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
        amountBs: parsed.amountBs,
        reference: parsed.reference,
        phone: parsed.phone,
        ci: parsed.ci,
        bankName: parsed.bankName,
        sourceApp: parsed.sourceApp,
        sourcePackage: parsed.sourcePackage,
        rawText: parsed.rawText,
        confidence: parsed.confidence,
        isPagoMovil: parsed.isPagoMovil,
        clientApp: String(payload.clientApp || '').slice(0, 60),
        postedAt: Number(payload.postedAt) || 0,
        receivedAt: receivedAt,
        receivedBy: session.sub,
        conciliated: !!match,
        saleId: match ? match.saleId : '',
        paymentId: match ? match.paymentId : '',
        paymentRef: parsed.reference,
        idempotencyKey: idempotencyKey
      };

      let savedEvent;
      try {
        savedEvent = journal.appendEvent({
          type: 'PAGO_MOVIL_INCOMING',
          user: 'detector-bancario',
          payload: record
        });
      } catch (saveErr) {
        console.error('[API] Error guardando abono bancario:', saveErr.message);
        return sendJson(res, 500, {
          ok: false,
          error: 'Error de persistencia del abono bancario: ' + saveErr.message
        }, req);
      }

      if (savedEvent.deduplicated) {
        const already = savedEvent.payload || record;
        return sendJson(res, 200, {
          ok: true,
          parsed: toPublicParsedMessage(parsed),
          duplicate: true,
          conciliated: already.conciliated === true,
          saleId: already.saleId || '',
          paymentId: already.paymentId || '',
          paymentRef: already.paymentRef || parsed.reference,
          status: already.conciliated === true ? 'CONCILIADO' : 'PENDIENTE',
          incomingId: already.id || '',
          at: already.receivedAt || ''
        }, req);
      }

      const updatedState = stateManager.applyEvent(savedEvent, false);
      broadcastSseEvent('state_event', {
        seq: savedEvent.seq,
        type: savedEvent.type,
        id: savedEvent.id,
        ts: savedEvent.ts,
        user: savedEvent.user,
        summary: buildSseEventSummary(savedEvent, updatedState)
      });

      let conciliated = false;
      if (match) {
        const statusRef = match.paymentId ? parsed.reference : match.payRef;
        const statusIdem = 'pm-auto-' + match.saleId + '-' + (match.paymentId || match.payRef) + '-' + parsed.reference;
        try {
          const statusEvent = journal.appendEvent({
            type: 'PAGO_MOVIL_STATUS_CHANGED',
            user: 'detector-bancario',
            payload: {
              saleId: match.saleId,
              paymentId: match.paymentId,
              paymentRef: statusRef,
              newStatus: 'CONCILIADO',
              reason: 'Abono bancario automático: ' + parsed.bankName + ' ref ' + parsed.reference,
              sourceIncomingId: record.id,
              idempotencyKey: statusIdem
            }
          });

          if (!statusEvent.deduplicated) {
            const statusState = stateManager.applyEvent(statusEvent, false);
            broadcastSseEvent('state_event', {
              seq: statusEvent.seq,
              type: statusEvent.type,
              id: statusEvent.id,
              ts: statusEvent.ts,
              user: statusEvent.user,
              summary: buildSseEventSummary(statusEvent, statusState)
            });
            broadcastSseEvent('PAGO_MOVIL_VERIFIED', {
              saleId: match.saleId,
              paymentRef: parsed.reference,
              amountBs: parsed.amountBs,
              reference: parsed.reference,
              bankName: parsed.bankName,
              sourceApp: parsed.sourceApp,
              at: new Date().toISOString()
            });
          }
          conciliated = true;
        } catch (statusErr) {
          console.error('[API] Error conciliando abono bancario:', statusErr.message);
        }
      }

      return sendJson(res, 200, {
        ok: true,
        parsed: toPublicParsedMessage(parsed),
        duplicate: false,
        conciliated: conciliated,
        saleId: match ? match.saleId : '',
        paymentId: match ? match.paymentId : '',
        paymentRef: parsed.reference,
        status: conciliated ? 'CONCILIADO' : 'PENDIENTE',
        incomingId: record.id,
        at: receivedAt
      }, req);
    });
    return;
  }

  // 3g. GET /api/v1/pagomovil/incoming — Últimos abonos bancarios capturados
  if (pathname === '/api/pagomovil/incoming' && method === 'GET') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, {
        ok: false,
        error: 'Solo Administrador o Encargado puede consultar los abonos bancarios.'
      }, req);
    }

    const stateObj = stateManager.getState() || {};
    const incomingList = Array.isArray(stateObj.incomingBankPayments) ? stateObj.incomingBankPayments.slice() : [];
    let limit = parseInt(query.limit, 10);
    if (!isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;

    incomingList.sort(function (a, b) {
      const ta = a && a.receivedAt ? Date.parse(a.receivedAt) : 0;
      const tb = b && b.receivedAt ? Date.parse(b.receivedAt) : 0;
      return (isFinite(tb) ? tb : 0) - (isFinite(ta) ? ta : 0);
    });

    const items = [];
    for (let i = 0; i < incomingList.length && items.length < limit; i++) {
      const item = toPublicIncomingPayment(incomingList[i]);
      if (item) items.push(item);
    }

    return sendJson(res, 200, {
      ok: true,
      count: items.length,
      items: items
    }, req);
  }

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

  // 13. GET /api/v1/ai/keys — Estado del pool de llaves Gemini (solo Dueño)
  if (pathname === '/api/ai/keys' && method === 'GET') {
    if (session.role !== 'Administrador') {
      return sendJson(res, 403, { ok: false, error: 'Solo el Administrador puede ver las llaves de IA.' }, req);
    }
    return sendJson(res, 200, aiKeys.getStatus(), req);
  }

  // 14. POST /api/v1/ai/keys — Guardar llaves Gemini (solo Dueño)
  if (pathname === '/api/ai/keys' && method === 'POST') {
    if (session.role !== 'Administrador') {
      return sendJson(res, 403, { ok: false, error: 'Solo el Administrador puede cambiar las llaves de IA.' }, req);
    }
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      try {
        const status = aiKeys.saveKeys(body && body.keys, body && body.model, body && body.enabled);
        return sendJson(res, 200, status, req);
      } catch (saveErr) {
        return sendJson(res, 500, { ok: false, error: 'No se pudieron guardar las llaves: ' + saveErr.message }, req);
      }
    });
    return;
  }

  // 15. POST /api/v1/ai/keys/test — Probar cada llave contra Google (solo Dueño)
  if (pathname === '/api/ai/keys/test' && method === 'POST') {
    if (session.role !== 'Administrador') {
      return sendJson(res, 403, { ok: false, error: 'Solo el Administrador puede probar las llaves de IA.' }, req);
    }
    aiKeys.testKeys().then(function (result) {
      return sendJson(res, result.ok ? 200 : 502, result, req);
    }).catch(function (testErr) {
      return sendJson(res, 500, { ok: false, error: 'Error probando llaves: ' + testErr.message }, req);
    });
    return;
  }

  // 16. POST /api/v1/ai/suggest-query — La IA redacta la búsqueda de la foto
  if (pathname === '/api/ai/suggest-query' && method === 'POST') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede buscar fotos.' }, req);
    }
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      photoStudio.suggestQuery(body || {}).then(function (result) {
        return sendJson(res, 200, result, req);
      }).catch(function (e) {
        return sendJson(res, 500, { ok: false, error: 'Error consultando la IA: ' + e.message }, req);
      });
    });
    return;
  }

  // 17. GET /api/v1/ai/search-images?q=... — Fotos reales de producto
  if (pathname === '/api/ai/search-images' && method === 'GET') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede buscar fotos.' }, req);
    }
    const q = String(query.q || query.query || '').trim();
    if (q.length < 2) {
      return sendJson(res, 400, { ok: false, error: 'Escribe al menos 2 letras para buscar.', results: [] }, req);
    }
    imageSearch.searchImages(q, { limit: query.limit }).then(function (result) {
      return sendJson(res, 200, result, req);
    }).catch(function (e) {
      return sendJson(res, 500, { ok: false, error: 'Error buscando imágenes: ' + e.message, results: [] }, req);
    });
    return;
  }

  // 18. GET /api/v1/ai/image-proxy?url=... — Miniatura servida por la caja local
  if (pathname === '/api/ai/image-proxy' && method === 'GET') {
    const target = String(query.url || '').trim();
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
      return res.end('URL inválida');
    }
    imageSearch.httpGet(target, { binary: true, timeout: 12000 }).then(function (img) {
      if (img.status !== 200 || !img.body || !img.body.length) {
        res.writeHead(502, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
        return res.end('No se pudo leer la imagen');
      }
      const ct = String(img.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
      if (ct.indexOf('image/') !== 0) {
        res.writeHead(415, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
        return res.end('El enlace no es una imagen');
      }
      res.writeHead(200, buildCorsHeaders(req, {
        'Content-Type': ct,
        'Content-Length': img.body.length,
        'Cache-Control': 'public, max-age=86400'
      }));
      res.end(img.body);
    }).catch(function () {
      res.writeHead(502, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('Error descargando la imagen');
    });
    return;
  }

  // 19. POST /api/v1/ai/product-photo — Guardar la foto elegida dentro de la caja
  if (pathname === '/api/ai/product-photo' && method === 'POST') {
    if (session.role !== 'Administrador' && session.role !== 'Encargado') {
      return sendJson(res, 403, { ok: false, error: 'Solo Administrador o Encargado puede guardar fotos.' }, req);
    }
    readJsonBody(req, function (err, body) {
      if (err) return sendJson(res, 400, { ok: false, error: err.message }, req);
      photoStudio.savePhoto(body || {}).then(function (result) {
        return sendJson(res, result.ok ? 200 : 400, result, req);
      }).catch(function (e) {
        return sendJson(res, 500, { ok: false, error: 'No se pudo guardar la foto: ' + e.message }, req);
      });
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
  verifyToken: verifyToken,
  lookupCatalogItem: lookupCatalogItem,
  getScannerPairCode: getScannerPairCode,
  parseScannedCodeInput: parseScannedCodeInput,
  broadcastScannerEvent: broadcastScannerEvent,
  findPendingPagoMovilPayment: findPendingPagoMovilPayment,
  buildSseEventSummary: buildSseEventSummary
};
