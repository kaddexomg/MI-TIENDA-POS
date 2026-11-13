'use strict';

/**
 * server/image-search.js
 * MI-TIENDA-POS v8.2.0
 *
 * Buscador de fotografías reales de producto (Bing Imágenes + DuckDuckGo).
 * - No usa llaves de pago ni CDNs: consulta los dos buscadores públicos.
 * - Puntúa cada resultado (marca, tipo de producto, dominio, tamaño, señales
 *   de "clipart/logo/vector") para que las primeras fotos sean las útiles.
 * - Proxy de imágenes: el navegador nunca descarga de dominios externos, todo
 *   pasa por la caja local (funciona con internet restringido y sin Mixed
 *   Content).
 *
 * Compatible con Node.js v13.14.0+ (sin ?. ni ??, sin dependencias npm).
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const url = require('url');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';
const MAX_BYTES = 8 * 1024 * 1024;
const SEARCH_TIMEOUT_MS = 9000;
const IMAGE_TIMEOUT_MS = 12000;

const BLOCKED_DOMAINS = [
  'facebook.com', 'instagram.com', 'tiktok.com', 'pinterest.', 'twitter.com', 'x.com',
  'youtube.com', 'vimeo.com', 'mercadolibre.com.ve/articulo', 'aliexpress.com/item'
];

const BAD_WORDS = [
  'clipart', 'clip art', 'vector', 'icono', 'icon ', 'logo', 'watermark', 'marca de agua',
  'png transparente', 'sin fondo', 'coloring', 'dibujo', 'ilustración', 'ilustracion',
  'silhouette', 'silueta', 'emoji', 'wallpaper', 'fondo de pantalla'
];

const GOOD_DOMAINS = [
  'walmart', 'amazon', 'elestimulo', 'excelsior', 'notitarde', 'eluniversal', 'lider',
  'farmatodo', 'plazas', 'centralmadeirense', 'gama', 'garzon', 'hiperlider', 'nestle',
  'pepsico', 'coca-cola', 'polar', 'mavesa', 'primor', 'pan', 'empresas-polar'
];

/* -------------------------------------------------------------------------- */
/* HTTP básico con redirecciones y gzip                                       */
/* -------------------------------------------------------------------------- */

function httpGet(targetUrl, options) {
  const opts = options || {};
  const timeout = opts.timeout || SEARCH_TIMEOUT_MS;
  const maxRedirects = typeof opts.maxRedirects === 'number' ? opts.maxRedirects : 4;
  const binary = opts.binary === true;

  return new Promise(function (resolve) {
    function attempt(currentUrl, redirectsLeft) {
      let parsed;
      try {
        parsed = url.parse(currentUrl);
      } catch (_) {
        return resolve({ status: 0, error: 'URL inválida', body: Buffer.alloc(0), headers: {} });
      }
      if (!parsed.protocol || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return resolve({ status: 0, error: 'Protocolo no permitido', body: Buffer.alloc(0), headers: {} });
      }

      const lib = parsed.protocol === 'https:' ? https : http;
      const headers = Object.assign({
        'User-Agent': UA,
        'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate'
      }, opts.headers || {});
      if (binary) headers['Accept'] = 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8';

      let settled = false;
      function done(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }

      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.path,
        method: 'GET',
        headers: headers
      }, function (res) {
        const status = res.statusCode || 0;

        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          let next = res.headers.location;
          if (next.charAt(0) === '/') next = parsed.protocol + '//' + parsed.host + next;
          return attempt(next, redirectsLeft - 1);
        }

        const chunks = [];
        let total = 0;

        res.on('data', function (chunk) {
          total += chunk.length;
          if (total > MAX_BYTES) {
            req.destroy();
            return done({ status: 413, error: 'Imagen demasiado grande', body: Buffer.alloc(0), headers: res.headers });
          }
          chunks.push(chunk);
        });

        res.on('end', function () {
          let body = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc === 'gzip') body = zlib.gunzipSync(body);
            else if (enc === 'deflate') body = zlib.inflateSync(body);
          } catch (_) {}
          done({ status: status, headers: res.headers, body: body });
        });

        res.on('error', function (err) {
          done({ status: 0, error: err.message, body: Buffer.alloc(0), headers: {} });
        });
      });

      req.setTimeout(timeout, function () {
        req.destroy();
        done({ status: 0, error: 'Tiempo de espera agotado', body: Buffer.alloc(0), headers: {} });
      });
      req.on('error', function (err) {
        done({ status: 0, error: err.message, body: Buffer.alloc(0), headers: {} });
      });
      req.end();
    }

    attempt(targetUrl, maxRedirects);
  });
}

function textOf(buf) {
  return Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
}

/* -------------------------------------------------------------------------- */
/* Puntuación                                                                 */
/* -------------------------------------------------------------------------- */

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  return normalize(str).split(' ').filter(function (t) { return t.length > 2; });
}

function scoreResult(result, query) {
  const title = normalize(result.title || '');
  const page = normalize(result.pageUrl || '');
  const imageUrl = String(result.image || '').toLowerCase();
  const haystack = title + ' ' + page + ' ' + imageUrl;
  const terms = tokenize(query);

  let score = 40;

  // Palabras de la búsqueda presentes en el título o la página
  let hits = 0;
  for (let i = 0; i < terms.length; i++) {
    if (haystack.indexOf(terms[i]) !== -1) hits++;
  }
  if (terms.length) score += Math.round((hits / terms.length) * 45);

  // Señales negativas
  for (let i = 0; i < BAD_WORDS.length; i++) {
    if (haystack.indexOf(BAD_WORDS[i]) !== -1) score -= 45;
  }

  // Dominios de comercio / marcas reales
  for (let i = 0; i < GOOD_DOMAINS.length; i++) {
    if (page.indexOf(GOOD_DOMAINS[i]) !== -1) { score += 18; break; }
  }

  // Facebook/Instagram/TikTok suelen servir miniaturas rotas
  for (let i = 0; i < BLOCKED_DOMAINS.length; i++) {
    if (page.indexOf(BLOCKED_DOMAINS[i]) !== -1) score -= 60;
  }

  // Formatos con transparencia suelen ser logos, no fotos de producto
  if (/\.png(\?|$)/.test(imageUrl)) score -= 8;

  // Imágenes demasiado pequeñas no sirven para la ficha
  const w = Number(result.width) || 0;
  const h = Number(result.height) || 0;
  if (w && h) {
    if (w < 200 || h < 200) score -= 35;
    else if (w >= 500 && h >= 500) score += 12;
    if (w && h && w / h > 2.4) score -= 15;
    if (w && h && h / w > 2.4) score -= 15;
  }

  return Math.max(0, Math.min(140, score));
}

/* -------------------------------------------------------------------------- */
/* Buscadores                                                                 */
/* -------------------------------------------------------------------------- */

async function searchBing(query) {
  const target = 'https://www.bing.com/images/search?q=' + encodeURIComponent(query) + '&form=HDRSC3&first=1&setlang=es';
  const res = await httpGet(target);
  if (res.status !== 200) return [];

  const html = textOf(res.body);
  const results = [];
  const tileRegex = /\bm="(\{[^"]*?murl[^"]*?\})"/g;
  let match;

  while ((match = tileRegex.exec(html)) !== null && results.length < 30) {
    let meta;
    try {
      meta = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch (_) {
      continue;
    }
    if (!meta || !meta.murl) continue;
    const pageUrl = String(meta.purl || '');
    if (BLOCKED_DOMAINS.some(function (b) { return normalize(pageUrl).indexOf(b) !== -1; })) continue;

    results.push({
      image: meta.murl,
      thumbnail: meta.turl || meta.murl,
      title: meta.t || meta.desc || '',
      pageUrl: pageUrl,
      width: Number(meta.mw) || 0,
      height: Number(meta.mh) || 0,
      source: 'bing'
    });
  }

  return results;
}

async function searchDuckDuckGo(query) {
  const landing = await httpGet('https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images');
  if (landing.status !== 200) return [];

  const html = textOf(landing.body);
  const vqdMatch = html.match(/vqd=["']?([\d-]+)["']?/) || html.match(/vqd=([\d-]+)&/);
  if (!vqdMatch) return [];

  const jsonUrl = 'https://duckduckgo.com/i.js?l=es-es&o=json&q=' + encodeURIComponent(query) +
    '&vqd=' + encodeURIComponent(vqdMatch[1]) + '&f=,,,&p=1';
  const res = await httpGet(jsonUrl, { headers: { 'Referer': 'https://duckduckgo.com/' } });
  if (res.status !== 200) return [];

  let data;
  try { data = JSON.parse(textOf(res.body)); } catch (_) { return []; }
  const list = Array.isArray(data.results) ? data.results : [];

  return list.slice(0, 30).map(function (r) {
    return {
      image: r.image,
      thumbnail: r.thumbnail || r.image,
      title: r.title || '',
      pageUrl: r.url || '',
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      source: 'duckduckgo'
    };
  }).filter(function (r) {
    if (!r.image) return false;
    return !BLOCKED_DOMAINS.some(function (b) { return normalize(r.pageUrl).indexOf(b) !== -1; });
  });
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                */
/* -------------------------------------------------------------------------- */

async function searchImages(query, options) {
  const opts = options || {};
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return { ok: false, error: 'Falta la búsqueda.', results: [] };

  const limit = Math.max(4, Math.min(40, Number(opts.limit) || 24));

  const settled = await Promise.all([
    searchBing(cleanQuery).catch(function () { return []; }),
    searchDuckDuckGo(cleanQuery).catch(function () { return []; })
  ]);

  const merged = [];
  const seen = {};
  const all = settled[0].concat(settled[1]);

  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    const key = String(item.image || '').split('?')[0];
    if (!key || seen[key]) continue;
    seen[key] = true;
    item.score = scoreResult(item, cleanQuery);
    merged.push(item);
  }

  merged.sort(function (a, b) { return b.score - a.score; });

  return {
    ok: true,
    query: cleanQuery,
    total: merged.length,
    results: merged.slice(0, limit)
  };
}

async function fetchImage(imageUrl) {
  const res = await httpGet(imageUrl, { binary: true, timeout: IMAGE_TIMEOUT_MS });
  if (res.status !== 200 || !res.body || !res.body.length) {
    return { ok: false, error: 'No se pudo descargar la imagen (HTTP ' + res.status + ')' };
  }

  const contentType = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType.indexOf('image/') !== 0) {
    return { ok: false, error: 'El enlace no es una imagen (' + (contentType || 'desconocido') + ')' };
  }
  if (res.body.length < 2500) {
    return { ok: false, error: 'La imagen es demasiado pequeña o está rota.' };
  }

  return { ok: true, buffer: res.body, contentType: contentType };
}

module.exports = {
  searchImages: searchImages,
  fetchImage: fetchImage,
  scoreResult: scoreResult,
  httpGet: httpGet,
  normalize: normalize
};
