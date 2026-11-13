'use strict';

/**
 * server/ai-keys.js
 * MI-TIENDA-POS v8.2.0
 *
 * Pool de llaves Google Gemini con rotación automática.
 * - Varias llaves trabajan como UNA sola: si una se agota (429) pasa a la
 *   siguiente y la primera descansa unos minutos antes de volver a usarse.
 * - Si una llave es inválida (400/403 API_KEY_INVALID) se marca como muerta
 *   y no se vuelve a intentar hasta que el dueño la reemplace.
 * - Las llaves NO se guardan en el proyecto ni en Git: viven en
 *   C:\MI-TIENDA-DATOS\ia-config.json (misma carpeta del journal).
 *
 * Compatible con Node.js v13.14.0+ (sin ?. ni ??).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const journal = require('./journal');

const CONFIG_FILE = 'ia-config.json';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.8-flash'
];
const QUOTA_COOLDOWN_MS = 60 * 1000;        // 1 minuto de descanso si se agota la cuota
const INVALID_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos si la llave es inválida
const REQUEST_TIMEOUT_MS = 25000;
const GEMINI_HOST = 'generativelanguage.googleapis.com';

let cache = null;
let cacheStamp = 0;

/* -------------------------------------------------------------------------- */
/* Configuración persistente                                                  */
/* -------------------------------------------------------------------------- */

function configPath() {
  return path.join(journal.getDataDir(), CONFIG_FILE);
}

function emptyConfig() {
  return { keys: [], model: DEFAULT_MODEL, enabled: true, updatedAt: '' };
}

function sanitizeKey(raw) {
  const k = String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '');
  if (!k || k.length < 20 || k.length > 200) return '';
  if (/\s/.test(k)) return '';
  return k;
}

function splitKeys(input) {
  if (!input) return [];
  let list = [];
  if (Array.isArray(input)) {
    list = input;
  } else if (typeof input === 'object') {
    list = input.keys || input.geminiKeys || [];
  } else {
    const raw = String(input).trim();
    if (raw.charAt(0) === '[') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (_) {
        list = raw.split(/[\s,;\n]+/);
      }
    } else {
      list = raw.split(/[\s,;\n]+/);
    }
  }
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const k = sanitizeKey(list[i]);
    if (k && out.indexOf(k) === -1) out.push(k);
  }
  return out;
}

function readFromDisk() {
  const file = configPath();
  let data = emptyConfig();

  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        data.keys = splitKeys(parsed.geminiKeys || parsed.keys || []);
        if (parsed.model) data.model = String(parsed.model);
        if (typeof parsed.enabled === 'boolean') data.enabled = parsed.enabled;
        data.updatedAt = parsed.updatedAt || '';
        data.stats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
      }
    } catch (err) {
      console.error('[IA] No se pudo leer ' + CONFIG_FILE + ': ' + err.message);
    }
  }

  // Respaldo por variable de entorno (útil para instalaciones desatendidas).
  if (!data.keys.length) {
    data.keys = splitKeys(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '');
  }

  return data;
}

function ensure() {
  if (cache) return cache;
  cache = readFromDisk();
  cache.cursor = 0;
  return cache;
}

function save(data) {
  const file = configPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const payload = {
    geminiKeys: data.keys,
    model: data.model || DEFAULT_MODEL,
    enabled: data.enabled !== false,
    updatedAt: new Date().toISOString(),
    stats: data.stats || {}
  };

  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (_) {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    try { fs.unlinkSync(tmp); } catch (__) {}
  }

  cache = {
    keys: payload.geminiKeys.slice(),
    model: payload.model,
    enabled: payload.enabled,
    updatedAt: payload.updatedAt,
    stats: payload.stats,
    cursor: 0
  };
  cacheStamp = Date.now();
  return cache;
}

function maskKey(key) {
  const k = String(key || '');
  if (k.length <= 12) return k.slice(0, 3) + '••••';
  return k.slice(0, 8) + '••••' + k.slice(-4);
}

function fingerprint(key) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return 'k' + (h >>> 0).toString(36);
}

function keyStats(data, key) {
  const id = fingerprint(key);
  if (!data.stats) data.stats = {};
  if (!data.stats[id]) {
    data.stats[id] = { id: id, okCount: 0, failCount: 0, cooldownUntil: 0, lastError: '', lastUsedAt: '' };
  }
  return data.stats[id];
}

/* -------------------------------------------------------------------------- */
/* Estado público (para la pantalla de Ajustes)                                */
/* -------------------------------------------------------------------------- */

function getStatus() {
  const data = ensure();
  const now = Date.now();
  const keys = data.keys.map(function (k, i) {
    const st = keyStats(data, k);
    let state = 'LISTA';
    if (st.cooldownUntil && st.cooldownUntil > now) {
      state = st.lastError && /inválid|invalid|API key/i.test(st.lastError) ? 'MUERTA' : 'DESCANSO';
    }
    return {
      index: i,
      masked: maskKey(k),
      id: st.id,
      state: state,
      cooldownLeftSec: st.cooldownUntil > now ? Math.ceil((st.cooldownUntil - now) / 1000) : 0,
      okCount: st.okCount || 0,
      failCount: st.failCount || 0,
      lastError: st.lastError || '',
      lastUsedAt: st.lastUsedAt || ''
    };
  });

  return {
    ok: true,
    configured: data.keys.length,
    enabled: data.enabled !== false,
    model: data.model || DEFAULT_MODEL,
    availableModels: FALLBACK_MODELS,
    configPath: configPath(),
    keys: keys,
    updatedAt: data.updatedAt || ''
  };
}

function saveKeys(input, model, enabled) {
  const data = ensure();
  const keys = splitKeys(input);
  if (model) data.model = String(model);
  if (typeof enabled === 'boolean') data.enabled = enabled;
  data.keys = keys;
  data.stats = {};
  save(data);
  return getStatus();
}

function setEnabled(enabled) {
  const data = ensure();
  data.enabled = enabled !== false;
  save(data);
  return getStatus();
}

/* -------------------------------------------------------------------------- */
/* Transporte HTTPS (sin dependencias, Node 13+)                               */
/* -------------------------------------------------------------------------- */

function httpsJson(method, hostname, pathWithQuery, bodyObj, extraHeaders) {
  return new Promise(function (resolve) {
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
    const headers = Object.assign({
      'Accept': 'application/json',
      'User-Agent': 'MI-TIENDA-POS/8.2 (+local)'
    }, extraHeaders || {});
    if (payload) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = payload.length;
    }

    let settled = false;
    function done(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    const req = https.request({
      hostname: hostname,
      port: 443,
      path: pathWithQuery,
      method: method,
      headers: headers
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        done({ status: res.statusCode || 0, json: json, text: text });
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, function () {
      req.destroy();
      done({ status: 0, json: null, text: 'Tiempo de espera agotado' });
    });

    req.on('error', function (err) {
      done({ status: 0, json: null, text: err && err.message ? err.message : 'Error de red' });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function buildModelOrder(preferred) {
  const list = [];
  const push = function (m) {
    const clean = String(m || '').trim();
    if (clean && list.indexOf(clean) === -1) list.push(clean);
  };
  push(preferred);
  for (let i = 0; i < FALLBACK_MODELS.length; i++) push(FALLBACK_MODELS[i]);
  return list;
}

function extractText(json) {
  if (!json || !Array.isArray(json.candidates) || !json.candidates.length) {
    if (json && json.promptFeedback && json.promptFeedback.blockReason) {
      return { text: '', blocked: json.promptFeedback.blockReason };
    }
    return { text: '', blocked: '' };
  }
  const cand = json.candidates[0];
  const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && typeof parts[i].text === 'string') out += parts[i].text;
  }
  return { text: out.trim(), blocked: cand && cand.finishReason === 'SAFETY' ? 'SAFETY' : '' };
}

function isInvalidKeyResponse(status, text) {
  if (status !== 400 && status !== 403) return false;
  return /API key not valid|API_KEY_INVALID|invalid api key|API key expired|PERMISSION_DENIED/i.test(String(text || ''));
}

function isQuotaResponse(status, text) {
  if (status === 429) return true;
  return /RESOURCE_EXHAUSTED|quota|rate limit|Too Many Requests/i.test(String(text || ''));
}

/* -------------------------------------------------------------------------- */
/* Llamada con rotación de llaves                                             */
/* -------------------------------------------------------------------------- */

async function callGemini(options) {
  const opts = options || {};
  const data = ensure();

  if (data.enabled === false) {
    return { ok: false, error: 'La Inteligencia Artificial está desactivada en Ajustes.', code: 'DISABLED' };
  }
  if (!data.keys.length) {
    return {
      ok: false,
      error: 'Todavía no hay llaves Gemini guardadas. Ve a Ajustes → Inteligencia Artificial y pega tus llaves.',
      code: 'NO_KEYS'
    };
  }

  const models = buildModelOrder(opts.model || data.model);
  const now = Date.now();
  const total = data.keys.length;
  const start = data.cursor % total;

  // Orden rotativo: cada llamada empieza en la llave siguiente.
  const order = [];
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const key = data.keys[idx];
    const st = keyStats(data, key);
    if (st.cooldownUntil && st.cooldownUntil > now) continue;
    order.push({ key: key, index: idx, stat: st });
  }

  if (!order.length) {
    return {
      ok: false,
      error: 'Todas las llaves están descansando por cuota o inválidas. Intenta de nuevo en un minuto.',
      code: 'ALL_COOLDOWN'
    };
  }

  const errors = [];
  const startedAt = Date.now();
  let lastModel = models[0];

  for (let i = 0; i < order.length; i++) {
    const entry = order[i];

    for (let m = 0; m < models.length; m++) {
      const model = models[m];
      lastModel = model;

      const body = {
        contents: [{ role: 'user', parts: [{ text: String(opts.prompt || '') }] }],
        generationConfig: {
          temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
          maxOutputTokens: opts.maxTokens || 800
        }
      };
      if (opts.systemInstruction) {
        body.systemInstruction = { parts: [{ text: String(opts.systemInstruction) }] };
      }
      if (opts.responseMimeType === 'application/json') {
        body.generationConfig.responseMimeType = 'application/json';
      }

      const apiPath = '/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(entry.key);
      const res = await httpsJson('POST', GEMINI_HOST, apiPath, body);
      const stat = entry.stat;

      if (res.status === 200) {
        const parsed = extractText(res.json);
        // Los modelos nuevos a veces gastan los tokens "pensando" y devuelven
        // texto vacío. No es culpa de la llave: se prueba el siguiente modelo.
        if (!parsed.text && !parsed.blocked) {
          errors.push(model + ': respuesta vacía');
          continue;
        }
        stat.okCount = (stat.okCount || 0) + 1;
        stat.lastError = '';
        stat.lastUsedAt = new Date().toISOString();
        data.cursor = (entry.index + 1) % total;
        save(data);
        return {
          ok: true,
          text: parsed.text,
          blocked: parsed.blocked || '',
          model: model,
          keyIndex: entry.index,
          latencyMs: Date.now() - startedAt,
          usedKeys: i + 1
        };
      }

      const errText = res.text || ('HTTP ' + res.status);
      stat.failCount = (stat.failCount || 0) + 1;
      stat.lastError = errText.slice(0, 260);

      if (res.status === 404) {
        errors.push(model + ': modelo no disponible');
        continue; // prueba el siguiente modelo con la misma llave
      }

      if (isInvalidKeyResponse(res.status, errText)) {
        stat.cooldownUntil = Date.now() + INVALID_COOLDOWN_MS;
        data.cursor = (entry.index + 1) % total;
        save(data);
        errors.push('llave #' + (entry.index + 1) + ' inválida');
        break; // esta llave está muerta: siguiente llave
      }

      if (isQuotaResponse(res.status, errText)) {
        stat.cooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        data.cursor = (entry.index + 1) % total;
        save(data);
        errors.push('llave #' + (entry.index + 1) + ' sin cuota');
        break; // siguiente llave
      }

      // 5xx / 503: casi siempre es el MODELO saturado, no la llave.
      // Se prueba el siguiente modelo con la MISMA llave antes de gastarla.
      if (res.status >= 500) {
        errors.push(model + ': saturado (' + res.status + ')');
        continue;
      }

      // Error transitorio de otro tipo: descansa poco y prueba otra llave.
      stat.cooldownUntil = Date.now() + 15000;
      errors.push('llave #' + (entry.index + 1) + ' error ' + res.status);
      break;
    }
  }

  save(data);
  return {
    ok: false,
    error: 'No se pudo completar la consulta con ninguna llave. ' + (errors.length ? '(' + errors.join(', ') + ')' : ''),
    code: 'ALL_FAILED',
    model: lastModel
  };
}

async function testKeys() {
  const data = ensure();
  if (!data.keys.length) {
    return { ok: false, error: 'No hay llaves configuradas.', results: [] };
  }

  const results = [];
  for (let i = 0; i < data.keys.length; i++) {
    const key = data.keys[i];
    const stat = keyStats(data, key);
    const started = Date.now();
    const apiPath = '/v1beta/models/' + encodeURIComponent(data.model || DEFAULT_MODEL) + ':generateContent?key=' + encodeURIComponent(key);
    const res = await httpsJson('POST', GEMINI_HOST, apiPath, {
      contents: [{ role: 'user', parts: [{ text: 'Responde solamente: OK' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 }
    });

    const ok = res.status === 200;
    if (ok) {
      stat.okCount = (stat.okCount || 0) + 1;
      stat.cooldownUntil = 0;
      stat.lastError = '';
      stat.lastUsedAt = new Date().toISOString();
    } else {
      stat.failCount = (stat.failCount || 0) + 1;
      stat.lastError = (res.text || ('HTTP ' + res.status)).slice(0, 260);
      if (isInvalidKeyResponse(res.status, res.text)) stat.cooldownUntil = Date.now() + INVALID_COOLDOWN_MS;
      else if (isQuotaResponse(res.status, res.text)) stat.cooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
    }

    results.push({
      index: i,
      masked: maskKey(key),
      ok: ok,
      status: res.status,
      latencyMs: Date.now() - started,
      error: ok ? '' : (res.text || '').slice(0, 220)
    });
  }

  save(data);
  return {
    ok: results.some(function (r) { return r.ok; }),
    results: results,
    configured: data.keys.length
  };
}

function quickAnswer(prompt) {
  return callGemini({ prompt: prompt, temperature: 0.2, maxTokens: 220 });
}

module.exports = {
  getStatus: getStatus,
  saveKeys: saveKeys,
  setEnabled: setEnabled,
  callGemini: callGemini,
  testKeys: testKeys,
  quickAnswer: quickAnswer,
  configPath: configPath,
  splitKeys: splitKeys,
  maskKey: maskKey
};
