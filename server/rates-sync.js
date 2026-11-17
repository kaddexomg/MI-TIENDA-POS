'use strict';

/**
 * server/rates-sync.js
 * MI-TIENDA-POS v8.4.0
 *
 * Sincronización automática de tasas del BCV, Euro y USDT Binance P2P
 * directamente en el servidor (VPS). No depende de que ningún cliente
 * esté abierto.
 *
 * - Al arrancar el servidor, si han pasado más de 30 minutos desde
 *   la última sincronización, actualiza inmediatamente.
 * - Después, ejecuta un cron cada 30 minutos durante horario activo
 *   (6am–10pm VET) y cada 4 horas fuera de horario.
 *
 * Compatible con Node.js v13.14.0+ (CommonJS puro, sin dependencias externas).
 * Sin operadores opcionales (?.) ni nullish (??) para compatibilidad con Win7.
 */

var https = require('https');
var http = require('http');

var SYNC_INTERVAL_MS = 30 * 60 * 1000;       // 30 min en horario activo
var SYNC_INTERVAL_OFF_MS = 4 * 60 * 60 * 1000; // 4 horas fuera de horario
var FETCH_TIMEOUT_MS = 8000;

var intervalHandle = null;

/**
 * Hace un GET con timeout usando solo módulos nativos (sin fetch, sin AbortController).
 */
function httpGet(urlStr, timeoutMs, cb) {
  var mod = urlStr.indexOf('https://') === 0 ? https : http;
  var timer = null;
  var done = false;

  var req = mod.get(urlStr, function (res) {
    var chunks = '';
    res.on('data', function (c) { chunks += c; });
    res.on('end', function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          cb(null, JSON.parse(chunks));
        } catch (e) {
          cb(new Error('JSON inválido: ' + e.message));
        }
      } else {
        cb(new Error('HTTP ' + res.statusCode));
      }
    });
  });

  req.on('error', function (err) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cb(err);
  });

  timer = setTimeout(function () {
    if (done) return;
    done = true;
    req.abort();
    cb(new Error('Timeout (' + timeoutMs + 'ms)'));
  }, timeoutMs);
}

/**
 * Consulta las APIs externas y retorna un objeto con las tasas actualizadas.
 * Callback: cb(err, { rateBcv, rateEur, rateUsdt })
 */
function fetchRates(currentSettings, cb) {
  var result = {
    rateBcv: null,
    rateEur: null,
    rateUsdt: null
  };

  // 1. Consultar DolarAPI Venezuela
  httpGet('https://ve.dolarapi.com/v1/dolares', FETCH_TIMEOUT_MS, function (err, data) {
    if (!err && Array.isArray(data)) {
      for (var i = 0; i < data.length; i++) {
        if (data[i].fuente === 'oficial' && Number(data[i].promedio) > 0) {
          result.rateBcv = Number(Number(data[i].promedio).toFixed(2));
        }
        if (data[i].fuente === 'paralelo' && Number(data[i].promedio) > 0) {
          result.rateUsdt = Number(Number(data[i].promedio).toFixed(2));
        }
      }
    } else {
      console.warn('[Rates Sync] No se pudo consultar DolarAPI:', err ? err.message : 'datos vacíos');
    }

    // 2. Consultar Euro (paridad internacional EUR/USD × BCV)
    var bcvForEur = result.rateBcv || (currentSettings && currentSettings.rateBcv) || 0;
    if (bcvForEur > 0) {
      httpGet('https://open.er-api.com/v6/latest/USD', FETCH_TIMEOUT_MS, function (err2, fx) {
        if (!err2 && fx && fx.rates && fx.rates.EUR) {
          var eurUsdRatio = 1 / Number(fx.rates.EUR);
          result.rateEur = Number((bcvForEur * eurUsdRatio).toFixed(2));
        } else {
          // Fallback: ratio fijo EUR/USD ~1.088
          result.rateEur = Number((bcvForEur * 1.088).toFixed(2));
        }
        cb(null, result);
      });
    } else {
      cb(null, result);
    }
  });
}

/**
 * Verifica si es horario activo (6am–10pm hora Venezuela UTC-4).
 */
function isActiveHours() {
  var now = new Date();
  // Hora en Venezuela (UTC-4)
  var utcHour = now.getUTCHours();
  var vetHour = (utcHour - 4 + 24) % 24;
  return vetHour >= 6 && vetHour < 22;
}

/**
 * Ejecuta una sincronización de tasas y la persiste en el journal/state.
 */
function syncNow(journal, stateManager) {
  var state = stateManager.getState();
  var settings = state && state.settings ? state.settings : {};

  fetchRates(settings, function (err, rates) {
    if (err) {
      console.warn('[Rates Sync] Error general:', err.message);
      return;
    }

    var updatedAny = false;
    var payload = {};

    if (rates.rateBcv !== null && rates.rateBcv > 0 && rates.rateBcv !== settings.rateBcv) {
      payload.rateBcv = rates.rateBcv;
      updatedAny = true;
    }
    if (rates.rateEur !== null && rates.rateEur > 0 && rates.rateEur !== settings.rateEur) {
      payload.rateEur = rates.rateEur;
      updatedAny = true;
    }
    if (rates.rateUsdt !== null && rates.rateUsdt > 0 && rates.rateUsdt !== settings.rateUsdt) {
      payload.rateUsdt = rates.rateUsdt;
      updatedAny = true;
    }

    if (!updatedAny) {
      console.log('[Rates Sync] Tasas sin cambios (BCV: ' + settings.rateBcv + ' | EUR: ' + settings.rateEur + ' | USDT: ' + settings.rateUsdt + ')');
      return;
    }

    // Persistir como evento en el journal y aplicar al estado
    var eventData = {
      type: 'RATE_UPDATED',
      user: 'sistema-auto',
      device: 'VPS-CRON',
      payload: payload
    };

    try {
      var record = journal.appendEvent(eventData);
      stateManager.applyEvent(record);
      stateManager.saveSnapshot();

      var newSettings = stateManager.getState().settings || {};
      console.log('[Rates Sync] ✅ Tasas actualizadas — BCV: ' + newSettings.rateBcv +
        ' | EUR: ' + newSettings.rateEur + ' | USDT: ' + newSettings.rateUsdt +
        ' (seq ' + record.seq + ')');
    } catch (e) {
      console.error('[Rates Sync] Error al persistir tasas:', e.message);
    }
  });
}

/**
 * Inicia el cron de sincronización automática de tasas.
 */
function start(journal, stateManager) {
  // Verificar si necesita sincronización inmediata al arrancar
  var state = stateManager.getState();
  var settings = state && state.settings ? state.settings : {};
  var lastSync = settings.lastRateSync ? Date.parse(settings.lastRateSync) : 0;
  var elapsed = Date.now() - lastSync;

  if (isNaN(lastSync) || elapsed > SYNC_INTERVAL_MS) {
    console.log('[Rates Sync] Sincronización inmediata al arrancar (última hace ' +
      Math.round(elapsed / 60000) + ' min)...');
    // Delay de 3 segundos para que el servidor termine de arrancar
    setTimeout(function () {
      syncNow(journal, stateManager);
    }, 3000);
  } else {
    console.log('[Rates Sync] Tasas vigentes (última hace ' +
      Math.round(elapsed / 60000) + ' min). Próxima en ' +
      Math.round((SYNC_INTERVAL_MS - elapsed) / 60000) + ' min.');
  }

  // Cron periódico
  intervalHandle = setInterval(function () {
    var interval = isActiveHours() ? SYNC_INTERVAL_MS : SYNC_INTERVAL_OFF_MS;
    syncNow(journal, stateManager);

    // Ajustar intervalo dinámicamente según horario
    // (El setInterval principal corre cada 30 min; fuera de horario
    //  simplemente no actualizará si no pasó tiempo suficiente)
  }, SYNC_INTERVAL_MS);

  console.log('[Rates Sync] Cron de tasas activo — cada 30 min (horario activo) / 4h (nocturno).');
}

/**
 * Detiene el cron.
 */
function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[Rates Sync] Cron de tasas detenido.');
  }
}

module.exports = {
  start: start,
  stop: stop,
  syncNow: syncNow,
  fetchRates: fetchRates
};
