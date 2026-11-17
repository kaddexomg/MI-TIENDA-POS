'use strict';

/**
 * server/pagomovil-parser.js
 * MI-TIENDA-POS v8.5.0
 *
 * Parser puro (sin dependencias) de mensajes/notificaciones bancarias
 * venezolanas de Pago Móvil. Convierte el texto crudo que captura el
 * NotificationListenerService del APK en datos estructurados:
 *
 *   parseBankMessage({ title, text, sourceApp, sourcePackage })
 *   -> { amountBs, reference, phone, ci, bankName, sourceApp,
 *        sourcePackage, rawText, confidence, isPagoMovil }
 *
 * Soporta montos `1.250,50`, `1250,50`, `1,250.50`, `1250.50`,
 * `Bs. 1.250,50`, `Bs.S 45,00`, `VES ...` y `BOLÍVARES ...`.
 * Referencias `Ref. 12345678`, `Referencia: 001234`,
 * `Nro. de referencia 123456789`, `N° 123456`, `operación 123456`,
 * `comprobante 1234`.
 *
 * Compatible con Node.js v13.14.0+ (CommonJS puro, sin operadores
 * opcionales ni dependencias externas).
 */

/* Códigos bancarios venezolanos (4 dígitos) -> nombre comercial. */
var BANK_BY_CODE = {
  '0102': 'Banco de Venezuela',
  '0104': 'Venezolano de Crédito',
  '0105': 'Mercantil',
  '0107': 'Banco del Sur',
  '0108': 'Provincial',
  '0114': 'Bancaribe',
  '0115': 'Exterior',
  '0128': 'Caroní',
  '0134': 'Banesco',
  '0137': 'Sofitasa',
  '0138': 'Banco Plaza',
  '0146': 'Bangente',
  '0151': 'BFC',
  '0163': 'Tesoro',
  '0168': 'Bancrecer',
  '0171': 'Activo',
  '0172': 'Bancamiga',
  '0174': 'Banplus',
  '0175': 'Bicentenario',
  '0177': 'Banfanb',
  '0191': 'BNC'
};

/* Nombres visibles en notificaciones/apps. Se evalúan en orden. */
var BANK_NAME_PATTERNS = [
  { re: /\bbanco\s+de\s+venezuela\b/i, name: 'Banco de Venezuela' },
  { re: /\bbdv\b/i, name: 'Banco de Venezuela' },
  { re: /\bvenezolano\s+de\s+credito\b/i, name: 'Venezolano de Crédito' },
  { re: /\bbanco\s+nacional\s+de\s+credito\b/i, name: 'BNC' },
  { re: /\bbnc\b/i, name: 'BNC' },
  { re: /\bbanesco\b/i, name: 'Banesco' },
  { re: /\bmercantil\b/i, name: 'Mercantil' },
  { re: /\bbbva\s+provincial\b/i, name: 'Provincial' },
  { re: /\bprovincial\b/i, name: 'Provincial' },
  { re: /\bbancamiga\b/i, name: 'Bancamiga' },
  { re: /\bbancaribe\b/i, name: 'Bancaribe' },
  { re: /\bbanplus\b/i, name: 'Banplus' },
  { re: /\bbicentenario\b/i, name: 'Bicentenario' },
  { re: /\bbanco\s+del\s+tesoro\b/i, name: 'Tesoro' },
  { re: /\bbanco\s+exterior\b/i, name: 'Exterior' },
  { re: /\bsofitasa\b/i, name: 'Sofitasa' },
  { re: /\bbanco\s+fondo\s+comun\b/i, name: 'BFC' },
  { re: /\bbfc\b/i, name: 'BFC' },
  { re: /\bbanco\s+del\s+sur\b/i, name: 'Banco del Sur' },
  { re: /\bbansur\b/i, name: 'Banco del Sur' },
  { re: /\bbanco\s+activo\b/i, name: 'Activo' },
  { re: /\bbancoactivo\b/i, name: 'Activo' },
  { re: /\bcaroni\b/i, name: 'Caroní' },
  { re: /\bbangente\b/i, name: 'Bangente' },
  { re: /\bbancrecer\b/i, name: 'Bancrecer' },
  { re: /\bbanfanb\b/i, name: 'Banfanb' },
  { re: /\bbanco\s+plaza\b/i, name: 'Banco Plaza' },
  { re: /\bbanplaza\b/i, name: 'Banco Plaza' }
];

/* Paquetes Android conocidos -> banco. Se evalúan por prefijo/contiene. */
var BANK_PACKAGE_PATTERNS = [
  { key: 'com.bdv', name: 'Banco de Venezuela' },
  { key: 'com.banesco', name: 'Banesco' },
  { key: 'com.mercantil', name: 'Mercantil' },
  { key: 'com.bbva.provincial', name: 'Provincial' },
  { key: 'com.provincial', name: 'Provincial' },
  { key: 'com.bnc', name: 'BNC' },
  { key: 'com.bancamiga', name: 'Bancamiga' },
  { key: 'com.bancaribe', name: 'Bancaribe' },
  { key: 'com.bicentenarios', name: 'Bicentenario' },
  { key: 'com.bicentenario', name: 'Bicentenario' },
  { key: 'com.banplus', name: 'Banplus' },
  { key: 'com.sofitasa', name: 'Sofitasa' },
  { key: 'com.bancoex', name: 'Exterior' },
  { key: 'com.exterior', name: 'Exterior' },
  { key: 'com.bancoactivo', name: 'Activo' },
  { key: 'com.activo', name: 'Activo' },
  { key: 'com.banco.plaza', name: 'Banco Plaza' },
  { key: 'com.banplaza', name: 'Banco Plaza' },
  { key: 'com.bangente', name: 'Bangente' },
  { key: 'com.bancrecer', name: 'Bancrecer' },
  { key: 'com.banfanb', name: 'Banfanb' },
  { key: 'com.bansur', name: 'Banco del Sur' },
  { key: 'com.caroni', name: 'Caroní' },
  { key: 'com.tesorobcv', name: 'Tesoro' }
];

var CURRENCY_SRC = 'bs\\.?\\s*s?\\.?|ves|bolivares?|bolivar';
var CURRENCY_BEFORE_RE = new RegExp('(?:' + CURRENCY_SRC + ')\\s*[:.]?\\s*$', 'i');
var CURRENCY_AFTER_RE = new RegExp('^\\s*(?:' + CURRENCY_SRC + ')', 'i');
var AMOUNT_CONTEXT_RE = /(?:\bpor|\bmonto(?:\s+de)?|\bimporte|\btotal|\babono|\bacreditad[oa]|\brecibid[oa]|\brecibiste)\s*(?:de|por)?\s*[:.]?\s*$/i;
var REF_LABEL_BEFORE_RE = /(?:\bref(?:erencia)?|\bcomprobante|\boperacion|\bnro|\bn[°º]|\bnumero|\bci|\bcedula|\btelefono|\btelf?|\btlf|\bcuenta|\bfecha|\bhora)\s*[:#.°º]*\s*$/i;

var REFERENCE_PATTERNS = [
  /\bref(?:erencia)?\b\s*(?:nro\.?|n[°º]|no\.?|#|:)?\s*[:#.]?\s*(\d{4,12})\b/i,
  /\bnro\.?\s*(?:de\s*)?(?:referencia|operacion|comprobante)\s*[:#.]?\s*(\d{4,12})\b/i,
  /\bn(?:umero|u?mero)\s+de\s+(?:referencia|operacion|comprobante)\s*[:#.]?\s*(\d{4,12})\b/i,
  /\bn[°º]\s*[:.]?\s*(\d{4,12})\b/i,
  /\boperacion\s*(?:nro\.?|n[°º]|no\.?|#)?\s*[:#.]?\s*(\d{4,12})\b/i,
  /\bcomprobante\s*(?:nro\.?|n[°º]|no\.?|#)?\s*[:#.]?\s*(\d{4,12})\b/i
];

var PHONE_RE = /(?:\+?\s*58)?[\s.-]?0?4(?:12|14|16|24|26)[\s.-]?\d{3}[\s.-]?\d{4}/;
var CI_RE = /(?:^|[^a-z])(?:c\.?\s?i\.?|cedula)\s*[:.]?\s*(?:v|e|j|p)?\s*[-.]?\s*(\d{1,2}(?:\.\d{3}){2}|\d{6,9})/i;

/**
 * Quita acentos preservando la longitud del texto para que los índices
 * de las coincidencias sigan siendo válidos (á -> a, ñ -> n, etc.).
 */
function stripAccents(value) {
  var str = String(value === null || value === undefined ? '' : value);
  if (typeof str.normalize === 'function') {
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return str;
}

function onlyDigits(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\D+/g, '');
}

function round2(value) {
  if (!isFinite(value)) return null;
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Normaliza una cadena numérica con separadores venezolanos / anglosajones.
 * Devuelve el número o null si no hay dígitos utilizables.
 */
function parseDecimalToken(token) {
  var raw = String(token === null || token === undefined ? '' : token).trim();
  raw = raw.replace(/^[^\d]+/, '').replace(/[^\d.,]+$/, '');
  if (!raw || !/\d/.test(raw)) return null;

  var dots = (raw.match(/\./g) || []).length;
  var commas = (raw.match(/,/g) || []).length;
  var decimalSep = '';
  var hasDecimals = false;

  if (dots > 0 && commas > 0) {
    decimalSep = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
  } else if (dots > 0 || commas > 0) {
    var sep = dots > 0 ? '.' : ',';
    var count = dots > 0 ? dots : commas;
    if (count === 1) {
      var after = raw.split(sep)[1] || '';
      if (after.length === 1 || after.length === 2) {
        decimalSep = sep;
      } else if (after.length === 3) {
        decimalSep = ''; // separador de miles (1.250 -> 1250)
      } else {
        decimalSep = sep;
      }
    }
  }

  var normalized;
  if (decimalSep) {
    hasDecimals = true;
    var lastIdx = raw.lastIndexOf(decimalSep);
    var intPart = raw.slice(0, lastIdx).replace(/[.,]/g, '');
    var decPart = raw.slice(lastIdx + 1).replace(/[.,]/g, '');
    normalized = (intPart || '0') + '.' + decPart;
  } else {
    normalized = raw.replace(/[.,]/g, '');
  }

  var value = parseFloat(normalized);
  if (!isFinite(value)) return null;
  return { value: round2(value), hasDecimals: hasDecimals, raw: raw };
}

/**
 * Convierte un monto en bolívares escrito de cualquier forma venezolana
 * a number (2 decimales) o null si no hay un monto reconocible.
 */
function parseBsAmount(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!isFinite(input)) return null;
    return round2(input);
  }
  var text = stripAccents(String(input)).toLowerCase();
  if (!/\d/.test(text)) return null;

  var single = parseDecimalToken(text.trim());
  var plain = text.trim().replace(/\s+/g, '');
  var isSingleToken = /^\d[\d.,]*$/.test(plain);
  if (isSingleToken && single) {
    return single.value;
  }

  var candidate = findAmountCandidate(text);
  if (candidate) return candidate.value;
  if (single) return single.value;
  return null;
}

/**
 * Busca el token numérico con mayor probabilidad de ser el monto.
 */
function findAmountCandidate(textLower) {
  var re = /\d[\d.,]*/g;
  var best = null;
  var match;

  while ((match = re.exec(textLower)) !== null) {
    var raw = match[0].replace(/[.,]+$/, '');
    if (!raw) continue;

    var start = match.index;
    var end = start + raw.length;
    var info = parseDecimalToken(raw);
    if (!info || !isFinite(info.value)) continue;

    var before = textLower.slice(Math.max(0, start - 30), start);
    var after = textLower.slice(end, end + 18);
    var prevChar = start > 0 ? textLower.charAt(start - 1) : '';
    var nextChar = end < textLower.length ? textLower.charAt(end) : '';

    var score = 0;
    if (CURRENCY_BEFORE_RE.test(before)) score += 50;
    if (CURRENCY_AFTER_RE.test(after)) score += 40;
    if (AMOUNT_CONTEXT_RE.test(before)) score += 25;
    if (info.hasDecimals) score += 15;
    if (REF_LABEL_BEFORE_RE.test(before)) score -= 80;
    if (prevChar === '/' || prevChar === ':' || nextChar === '/' || nextChar === ':') score -= 120;
    if (info.value <= 0) score -= 200;
    if (info.value > 50000000) score -= 40;
    if (!info.hasDecimals && !CURRENCY_BEFORE_RE.test(before) && !CURRENCY_AFTER_RE.test(after)) score -= 10;

    if (!best || score > best.score) {
      best = {
        value: info.value,
        hasDecimals: info.hasDecimals,
        raw: raw,
        index: start,
        score: score
      };
    }
  }

  if (!best || best.score < 5) return null;
  return best;
}

/**
 * Comprueba que los dígitos no formen parte de una fecha u hora.
 */
function hasDateNeighbor(text, index, length) {
  var prev = index > 0 ? text.charAt(index - 1) : '';
  var next = index + length < text.length ? text.charAt(index + length) : '';
  return prev === '/' || prev === ':' || next === '/' || next === ':';
}

function cleanReference(value) {
  var digits = onlyDigits(value);
  if (digits.length < 4 || digits.length > 12) return '';
  return digits;
}

/**
 * Extrae la referencia bancaria. Prioriza las etiquetas explícitas y,
 * si no hay, busca un número suelto que no sea fecha, teléfono,
 * cédula, código de banco ni monto.
 */
function findReference(textLower, context) {
  var i;
  for (i = 0; i < REFERENCE_PATTERNS.length; i++) {
    var m = REFERENCE_PATTERNS[i].exec(textLower);
    if (!m || !m[1]) continue;
    var digitsIndex = m.index + m[0].lastIndexOf(m[1]);
    if (hasDateNeighbor(textLower, digitsIndex, m[1].length)) continue;
    var labeled = cleanReference(m[1]);
    if (!labeled) continue;
    if (labeled.length === 4 && /^(19|20)\d{2}$/.test(labeled) && !/ref|operacion|comprobante/i.test(m[0])) continue;
    return labeled;
  }

  var skipSet = {};
  if (context) {
    if (context.amountRaw) skipSet[onlyDigits(context.amountRaw)] = true;
    if (context.phoneDigits) skipSet[context.phoneDigits] = true;
    if (context.phoneDigits && context.phoneDigits.length === 11 && context.phoneDigits.charAt(0) === '0') {
      skipSet[context.phoneDigits.slice(1)] = true;
    }
    if (context.ciDigits) skipSet[context.ciDigits] = true;
    if (context.bankCode) skipSet[context.bankCode] = true;
  }

  var fallback = [];
  var re = /\d{4,12}/g;
  var match;
  while ((match = re.exec(textLower)) !== null) {
    var token = match[0];
    var start = match.index;
    var end = start + token.length;
    var prevChar = start > 0 ? textLower.charAt(start - 1) : '';
    var nextChar = end < textLower.length ? textLower.charAt(end) : '';
    if (/[\d.,]/.test(prevChar) || /[\d.,]/.test(nextChar)) continue;
    if (prevChar === '/' || prevChar === ':' || nextChar === '/' || nextChar === ':') continue;
    if (skipSet[token]) continue;
    if (token.length === 4 && /^(19|20)\d{2}$/.test(token)) continue;
    if (token.length >= 10 && token.charAt(0) === '0') continue;
    var beforeToken = textLower.slice(Math.max(0, start - 20), start);
    if (/(?:fecha|hora|ci|cedula|telefono|tlf|telf|cuenta|banco)\s*[:.]?\s*$/.test(beforeToken)) continue;
    fallback.push(token);
  }

  if (fallback.length === 0) return '';
  return fallback[fallback.length - 1];
}

function findPhone(textLower) {
  var m = PHONE_RE.exec(textLower);
  if (!m) return '';
  var digits = onlyDigits(m[0]);
  if (digits.length === 12 && digits.indexOf('58') === 0) return '0' + digits.slice(2);
  if (digits.length === 10 && digits.charAt(0) === '4') return '0' + digits;
  return digits;
}

function findCi(textLower) {
  var m = CI_RE.exec(textLower);
  if (!m || !m[1]) return '';
  return onlyDigits(m[1]);
}

function detectBankName(textLower, sourcePackage, sourceApp) {
  var i;
  for (i = 0; i < BANK_NAME_PATTERNS.length; i++) {
    if (BANK_NAME_PATTERNS[i].re.test(textLower)) {
      return BANK_NAME_PATTERNS[i].name;
    }
  }

  if (sourceApp) {
    var appLower = stripAccents(String(sourceApp)).toLowerCase();
    for (i = 0; i < BANK_NAME_PATTERNS.length; i++) {
      if (BANK_NAME_PATTERNS[i].re.test(appLower)) {
        return BANK_NAME_PATTERNS[i].name;
      }
    }
  }

  var pkg = String(sourcePackage || '').trim().toLowerCase();
  if (pkg) {
    for (i = 0; i < BANK_PACKAGE_PATTERNS.length; i++) {
      if (pkg.indexOf(BANK_PACKAGE_PATTERNS[i].key) === 0) {
        return BANK_PACKAGE_PATTERNS[i].name;
      }
    }
  }

  var codes = Object.keys(BANK_BY_CODE);
  for (i = 0; i < codes.length; i++) {
    if (new RegExp('\\b' + codes[i] + '\\b').test(textLower)) {
      return BANK_BY_CODE[codes[i]];
    }
  }

  return '';
}

function detectBankCode(textLower) {
  var codes = Object.keys(BANK_BY_CODE);
  for (var i = 0; i < codes.length; i++) {
    if (new RegExp('\\b' + codes[i] + '\\b').test(textLower)) {
      return codes[i];
    }
  }
  return '';
}

function detectPagoMovil(textLower, amountBs, reference) {
  if (/pago\s*movil|pagomovil/.test(textLower)) return true;
  if (!amountBs) return false;
  var hasSignal = /(?:recibiste|recibido|recibida|abono|acreditad[oa]|transferencia)/.test(textLower);
  return hasSignal && !!reference;
}

/**
 * Punto de entrada principal.
 *
 * @param {Object|string} input Objeto con {title,text,sourceApp,sourcePackage}
 *                              o directamente el texto del mensaje.
 * @returns {Object} Datos normalizados del posible Pago Móvil.
 */
function parseBankMessage(input) {
  var data = {};
  if (typeof input === 'string') {
    data = { text: input };
  } else if (input && typeof input === 'object') {
    data = input;
  }

  var title = String(data.title === null || data.title === undefined ? '' : data.title);
  var text = String(data.text === null || data.text === undefined ? '' : data.text);
  var sourceApp = String(data.sourceApp === null || data.sourceApp === undefined ? '' : data.sourceApp);
  var sourcePackage = String(data.sourcePackage === null || data.sourcePackage === undefined ? '' : data.sourcePackage);

  var pieces = [];
  if (title.trim()) pieces.push(title.trim());
  if (text.trim()) pieces.push(text.trim());
  var rawText = pieces.join(' ').trim();

  var searchText = stripAccents(rawText + ' ' + sourceApp).toLowerCase();

  var amountCandidate = findAmountCandidate(searchText);
  var amountBs = amountCandidate ? amountCandidate.value : null;
  var amountRaw = amountCandidate ? amountCandidate.raw : '';

  var phone = findPhone(searchText);
  var ci = findCi(searchText);
  var bankCode = detectBankCode(searchText);
  var bankName = detectBankName(searchText, sourcePackage, sourceApp);

  var reference = findReference(searchText, {
    amountRaw: amountRaw,
    phoneDigits: phone,
    ciDigits: ci,
    bankCode: bankCode
  });

  var isPagoMovil = detectPagoMovil(searchText, amountBs, reference);

  var confidence = 0;
  if (amountBs) {
    confidence += 0.35;
    if (amountCandidate && amountCandidate.hasDecimals) confidence += 0.05;
  }
  if (reference) confidence += 0.25;
  if (bankName) confidence += 0.20;
  if (isPagoMovil) confidence += 0.10;
  confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;

  return {
    amountBs: amountBs,
    reference: reference,
    phone: phone,
    ci: ci,
    bankName: bankName || 'Banco no identificado',
    sourceApp: sourceApp,
    sourcePackage: sourcePackage,
    rawText: rawText,
    confidence: confidence,
    isPagoMovil: isPagoMovil
  };
}

module.exports = {
  parseBankMessage: parseBankMessage,
  parseBsAmount: parseBsAmount,
  detectBankName: detectBankName,
  BANK_BY_CODE: BANK_BY_CODE
};
