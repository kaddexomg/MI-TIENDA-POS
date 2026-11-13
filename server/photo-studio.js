'use strict';

/**
 * server/photo-studio.js
 * MI-TIENDA-POS v8.2.0
 *
 * Estudio de fotos de producto:
 * 1. La IA (pool Gemini) convierte el nombre del producto en una búsqueda corta.
 * 2. Se buscan fotos reales en Bing / DuckDuckGo y se puntúan.
 * 3. La foto elegida se descarga y se guarda DENTRO de la caja
 *    (C:\MI-TIENDA-DATOS\media\productos) para que siga sirviendo sin internet.
 *
 * Compatible con Node.js v13.14.0+.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const journal = require('./journal');
const aiKeys = require('./ai-keys');
const imageSearch = require('./image-search');

const FAMILY_HINT = {
  fritos: 'empanada venezolana frita',
  arepas: 'arepa venezolana asada',
  almuerzos: 'plato venezolano pabellon criollo',
  viveres: 'harina pan arroz pasta viveres venezuela',
  bebidas: 'refresco malta venezolana botella',
  cafeteria: 'cafe taza cafeteria',
  chucherias: 'snack chucheria venezolana',
  cervezas: 'cerveza venezolana botella',
  cigarros: 'cigarrillos cajetilla'
};

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function photosDir() {
  return path.join(journal.getDataDir(), 'media', 'productos');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(text) {
  return String(text || 'producto')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'producto';
}

function fallbackQuery(productName, familyId) {
  const name = String(productName || '').trim();
  const hint = FAMILY_HINT[familyId] || 'producto venezolano';
  if (!name) return hint;
  return (name + ' ' + hint).replace(/\s+/g, ' ').trim();
}

function cleanAiQuery(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  text = text.split('\n')[0];
  text = text.replace(/^["'“”`]+|["'“”`]+$/g, '');
  text = text.replace(/^(b[uú]squeda|query|consulta)\s*:\s*/i, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 90) text = text.slice(0, 90);
  return text;
}

async function suggestQuery(payload) {
  const body = payload || {};
  const name = String(body.productName || body.name || '').trim();
  const familyId = String(body.familyId || body.family || '').trim();
  const brand = String(body.brand || '').trim();
  const fallback = fallbackQuery(name, familyId);

  if (!name) return { ok: true, query: fallback, aiUsed: false };

  const prompt =
    'Eres un asistente de un abasto y restaurante venezolano.\n' +
    'Producto: "' + name + '"\n' +
    'Familia: ' + (familyId || 'no indicada') + '\n' +
    (brand ? 'Marca: ' + brand + '\n' : '') +
    'Escribe UNA sola línea con la búsqueda de imágenes más útil para encontrar una FOTO REAL de ese producto exacto ' +
    '(marca + presentación si aplica). Sin explicaciones, sin comillas, máximo 8 palabras.';

  const ai = await aiKeys.callGemini({
    prompt: prompt,
    temperature: 0.2,
    maxTokens: 60,
    systemInstruction: 'Responde únicamente con la consulta de búsqueda, en una línea.'
  });

  if (ai && ai.ok) {
    const query = cleanAiQuery(ai.text);
    if (query && query.length >= 3) {
      return { ok: true, query: query, aiUsed: true, fallback: fallback, model: ai.model };
    }
  }

  return {
    ok: true,
    query: fallback,
    aiUsed: false,
    aiError: ai && ai.error ? ai.error : ''
  };
}

async function savePhoto(payload) {
  const body = payload || {};
  const imageUrl = String(body.imageUrl || body.url || '').trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, error: 'Falta un enlace de imagen válido (http/https).' };
  }

  const downloaded = await imageSearch.fetchImage(imageUrl);
  if (!downloaded.ok) return downloaded;

  const ext = EXT_BY_TYPE[downloaded.contentType] || '.jpg';
  const hash = crypto.createHash('md5').update(downloaded.buffer).digest('hex').slice(0, 8);
  const base = slugify(body.productName || body.name || 'producto');
  const fileName = base + '-' + hash + ext;

  const dir = photosDir();
  ensureDir(dir);
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, downloaded.buffer);

  return {
    ok: true,
    fileName: fileName,
    path: '/media/productos/' + fileName,
    bytes: downloaded.buffer.length,
    contentType: downloaded.contentType
  };
}

function listSavedPhotos() {
  const dir = photosDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) {
    return /\.(jpg|jpeg|png|webp|gif)$/i.test(f);
  }).map(function (f) {
    return '/media/productos/' + f;
  });
}

module.exports = {
  suggestQuery: suggestQuery,
  savePhoto: savePhoto,
  listSavedPhotos: listSavedPhotos,
  photosDir: photosDir,
  fallbackQuery: fallbackQuery,
  slugify: slugify
};
