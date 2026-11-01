/**
 * assets/js/api-client.js
 * MI-TIENDA-POS v5.0.0
 * 
 * Cliente de Conexión Local con Tolerancia a Fallos y Modo Offline Transparente.
 * Se comunica con el servidor local (http://localhost:7070) para persitencia en journal.ndjson.
 * 
 * Si el servidor está apagado o no responde:
 * - Encola los eventos automáticamente en localStorage ('mtp_offline_outbox').
 * - La caja NUNCA se detiene. El cajero sigue facturando normalmente.
 * - Al reconectar con el servidor, vacía la cola en orden estricto (sync outbox).
 * 
 * Compatible con Chrome 109 / Edge 109 (Windows 7).
 * Sin operadores opcionales (?.) ni nullish (??).
 */

(function (window) {
  'use strict';

  var STORAGE_OUTBOX_KEY = 'mtp_offline_outbox';
  var HEALTH_CHECK_INTERVAL_MS = 10000; // 10 segundos
  var FETCH_TIMEOUT_MS = 3000; // 3 segundos

  // Determinar URL base del servidor
  var defaultOrigin = 'http://localhost:7070';
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.indexOf('http') === 0) {
    defaultOrigin = window.location.origin;
  }

  var baseUrl = defaultOrigin;
  var _isOnline = false;
  var _isSyncingOutbox = false;
  var _checkTimer = null;
  var _listeners = [];

  /**
   * Genera un identificador local único compatible con UUID / crypto
   */
  function generateLocalId() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      arr[6] = (arr[6] & 0x0f) | 0x40;
      arr[8] = (arr[8] & 0x3f) | 0x80;
      var hex = '';
      for (var i = 0; i < arr.length; i++) {
        var h = arr[i].toString(16);
        hex += (h.length === 1 ? '0' + h : h);
      }
      return (
        hex.substring(0, 8) + '-' +
        hex.substring(8, 12) + '-' +
        hex.substring(12, 16) + '-' +
        hex.substring(16, 20) + '-' +
        hex.substring(20, 32)
      );
    }
    return 'ev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Lee la cola de salida de eventos offline desde localStorage.
   */
  function getOutbox() {
    try {
      var raw = localStorage.getItem(STORAGE_OUTBOX_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[MTPApiClient] Error leyendo outbox local:', e);
      return [];
    }
  }

  /**
   * Guarda la cola de salida en localStorage.
   */
  function setOutbox(items) {
    try {
      localStorage.setItem(STORAGE_OUTBOX_KEY, JSON.stringify(items || []));
      notifyStatusChange();
    } catch (e) {
      console.error('[MTPApiClient] Error guardando outbox local:', e);
    }
  }

  /**
   * Encola un evento en la bandeja de salida local.
   */
  function enqueueOutbox(event) {
    var items = getOutbox();
    items.push(event);
    setOutbox(items);
  }

  /**
   * Notifica a observadores y emite evento global en window.
   */
  function notifyStatusChange() {
    var detail = {
      online: _isOnline,
      pendingCount: getOutbox().length,
      baseUrl: baseUrl
    };

    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i](detail);
      } catch (err) {
        // ignore callback error
      }
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        var ev = new CustomEvent('mtp:connection-status', { detail: detail });
        window.dispatchEvent(ev);
      } catch (e) {
        // En navegadores antiguos donde CustomEvent requiera initCustomEvent
        try {
          var evOld = document.createEvent('CustomEvent');
          evOld.initCustomEvent('mtp:connection-status', false, false, detail);
          window.dispatchEvent(evOld);
        } catch (e2) {}
      }
    }
  }

  /**
   * Realiza un fetch con timeout estricto.
   */
  function fetchWithTimeout(urlStr, options, timeoutMs) {
    var timeout = timeoutMs || FETCH_TIMEOUT_MS;
    return new Promise(function (resolve, reject) {
      var timer = null;
      var hasCompleted = false;

      var abortCtrl = null;
      var fetchOpts = Object.assign({}, options || {});

      if (typeof AbortController !== 'undefined') {
        abortCtrl = new AbortController();
        fetchOpts.signal = abortCtrl.signal;
      }

      timer = setTimeout(function () {
        if (!hasCompleted) {
          hasCompleted = true;
          if (abortCtrl) {
            try { abortCtrl.abort(); } catch (e) {}
          }
          reject(new Error('Timeout de conexión con el servidor (' + timeout + 'ms)'));
        }
      }, timeout);

      fetch(urlStr, fetchOpts)
        .then(function (res) {
          if (!hasCompleted) {
            hasCompleted = true;
            clearTimeout(timer);
            resolve(res);
          }
        })
        .catch(function (err) {
          if (!hasCompleted) {
            hasCompleted = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  }

  /**
   * Verifica la conectividad con el servidor local (/api/status).
   */
  function checkHealth() {
    var targetUrl = baseUrl + '/api/status?_t=' + Date.now();
    return fetchWithTimeout(targetUrl, { method: 'GET', cache: 'no-store' }, FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (res.status === 200) {
          return res.json().then(function (data) {
            var wasOffline = !_isOnline;
            _isOnline = (data && data.ok === true);
            notifyStatusChange();

            // Si acabamos de volver a estar online, procesar la cola de salida
            if (wasOffline && _isOnline) {
              console.log('[MTPApiClient] Servidor reconectado. Sincronizando eventos pendientes...');
              flushOutbox();
            }

            return { online: _isOnline, data: data };
          });
        } else {
          _isOnline = false;
          notifyStatusChange();
          return { online: false, status: res.status };
        }
      })
      .catch(function (err) {
        _isOnline = false;
        notifyStatusChange();
        return { online: false, error: err.message };
      });
  }

  /**
   * Vacía la cola outbox enviando los eventos pendientes uno a uno en orden FIFO.
   */
  function flushOutbox() {
    if (_isSyncingOutbox || !_isOnline) {
      return Promise.resolve({ syncing: false });
    }

    var items = getOutbox();
    if (items.length === 0) {
      return Promise.resolve({ syncedCount: 0 });
    }

    _isSyncingOutbox = true;

    function processNext(index, successCount) {
      if (index >= items.length) {
        // Todos procesados exitosamente
        setOutbox([]);
        _isSyncingOutbox = false;
        console.log('[MTPApiClient] Sincronización outbox finalizada: ' + successCount + ' eventos enviados.');
        return Promise.resolve({ syncedCount: successCount });
      }

      var currentItem = items[index];
      return fetchWithTimeout(baseUrl + '/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentItem)
      }, 5000)
        .then(function (res) {
          if (res.status === 200 || res.status === 201) {
            // Eliminar elemento enviado y persistir inmediatamente
            items.splice(index, 1);
            setOutbox(items);
            return processNext(index, successCount + 1);
          } else {
            // El servidor rechazó el evento o devolvió error 4xx/5xx
            console.warn('[MTPApiClient] Respuesta no exitosa al sincronizar evento seq:', res.status);
            _isSyncingOutbox = false;
            return Promise.resolve({ syncedCount: successCount, stoppedAt: index });
          }
        })
        .catch(function (netErr) {
          // Fallo de red durante la sincronización: detener y marcar offline
          console.warn('[MTPApiClient] Fallo de red durante sync outbox:', netErr.message);
          _isOnline = false;
          _isSyncingOutbox = false;
          notifyStatusChange();
          return Promise.resolve({ syncedCount: successCount, error: netErr.message });
        });
    }

    return processNext(0, 0);
  }

  /**
   * Emite un evento transaccional.
   * Si está online, lo envía al journal con fsync en el servidor.
   * Si está offline, lo guarda de forma transparente en la cola local.
   * 
   * @param {string} type Tipo de evento ('SALE_CREATED', 'EXPENSE_CREATED', etc.)
   * @param {Object} payload Datos del evento
   * @param {string} user Usuario responsable (opcional)
   */
  function emitEvent(type, payload, user) {
    if (!type || typeof type !== 'string') {
      return Promise.reject(new Error('emitEvent requiere un tipo de evento válido'));
    }

    var eventObj = {
      id: generateLocalId(),
      type: type,
      payload: payload !== undefined ? payload : {},
      user: user || 'cajero',
      device: 'CAJA-01',
      ts: new Date().toISOString()
    };

    // Si sabemos que estamos offline, encolar directo
    if (!_isOnline) {
      enqueueOutbox(eventObj);
      console.log('[MTPApiClient] Evento encolado en modo offline:', type, eventObj.id);
      return Promise.resolve({
        ok: true,
        queued: true,
        offline: true,
        localId: eventObj.id,
        event: eventObj
      });
    }

    // Intentar envío inmediato al servidor
    return fetchWithTimeout(baseUrl + '/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventObj)
    }, 4000)
      .then(function (res) {
        if (res.status === 200 || res.status === 201) {
          return res.json().then(function (data) {
            return {
              ok: true,
              queued: false,
              seq: data.seq,
              id: data.id,
              event: data.event
            };
          });
        } else {
          // El servidor devolvió error HTTP -> encolar para no perder la operación
          _isOnline = false;
          enqueueOutbox(eventObj);
          notifyStatusChange();
          return {
            ok: true,
            queued: true,
            offline: true,
            localId: eventObj.id,
            event: eventObj
          };
        }
      })
      .catch(function (fetchErr) {
        // Corte de conexión detectado -> encolar
        console.warn('[MTPApiClient] Error de red enviando evento (' + fetchErr.message + '). Encolando...');
        _isOnline = false;
        enqueueOutbox(eventObj);
        notifyStatusChange();
        return {
          ok: true,
          queued: true,
          offline: true,
          localId: eventObj.id,
          event: eventObj
        };
      });
  }

  /**
   * Obtiene el estado materializado actual desde el servidor.
   */
  function getState() {
    return fetchWithTimeout(baseUrl + '/api/state', { method: 'GET', cache: 'no-store' }, 4000)
      .then(function (res) {
        if (res.status === 200) {
          return res.json();
        }
        throw new Error('Servidor respondió con código ' + res.status);
      });
  }

  /**
   * Obtiene eventos transaccionales desde un seq.
   */
  function getEvents(sinceSeq) {
    var s = sinceSeq || 0;
    return fetchWithTimeout(baseUrl + '/api/events?sinceSeq=' + s, { method: 'GET', cache: 'no-store' }, 4000)
      .then(function (res) {
        if (res.status === 200) {
          return res.json();
        }
        throw new Error('Error al obtener eventos: ' + res.status);
      });
  }

  /**
   * Dispara un respaldo manual en disco.
   */
  function triggerBackup() {
    return fetchWithTimeout(baseUrl + '/api/backup', { method: 'POST' }, 10000)
      .then(function (res) {
        if (res.status === 200) {
          return res.json();
        }
        throw new Error('Error en respaldo manual: ' + res.status);
      });
  }

  /**
   * Suscribe un listener a cambios de estado de conexión.
   */
  function onStatusChange(callback) {
    if (typeof callback === 'function') {
      _listeners.push(callback);
      // Notificar estado actual inmediatamente
      callback({
        online: _isOnline,
        pendingCount: getOutbox().length,
        baseUrl: baseUrl
      });
    }
  }

  /**
   * Configura la URL base del servidor.
   */
  function setBaseUrl(newUrl) {
    if (newUrl && typeof newUrl === 'string') {
      baseUrl = newUrl.replace(/\/+$/, '');
      checkHealth();
    }
  }

  /**
   * Inicializa el cliente y el ciclo de chequeo en segundo plano.
   */
  function init(options) {
    if (options && options.baseUrl) {
      baseUrl = options.baseUrl;
    }

    // Primer chequeo inmediato
    checkHealth();

    // Eventos estándar del navegador
    if (typeof window !== 'undefined') {
      window.addEventListener('online', function () {
        checkHealth();
      });
      window.addEventListener('offline', function () {
        _isOnline = false;
        notifyStatusChange();
      });
    }

    // Intervalo de sondeo periódico
    if (_checkTimer) {
      clearInterval(_checkTimer);
    }
    _checkTimer = setInterval(function () {
      checkHealth();
    }, HEALTH_CHECK_INTERVAL_MS);

    return {
      baseUrl: baseUrl,
      isOnline: function () { return _isOnline; },
      pendingCount: function () { return getOutbox().length; }
    };
  }

  // Exportar API pública
  var clientApi = {
    init: init,
    isOnline: function () { return _isOnline; },
    getPendingCount: function () { return getOutbox().length; },
    emitEvent: emitEvent,
    getState: getState,
    getEvents: getEvents,
    triggerBackup: triggerBackup,
    checkHealth: checkHealth,
    flushOutbox: flushOutbox,
    onStatusChange: onStatusChange,
    setBaseUrl: setBaseUrl,
    getBaseUrl: function () { return baseUrl; },
    generateLocalId: generateLocalId
  };

  window.MTPApiClient = clientApi;

  // Auto-inicializar si el entorno es navegador
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        clientApi.init();
      });
    } else {
      clientApi.init();
    }
  }

})(typeof window !== 'undefined' ? window : global);
