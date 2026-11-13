/**
 * assets/js/api-client.js
 * MI-TIENDA-POS v8.0.0
 *
 * Cliente de Conexión Local /api/v1/* con Autenticación HMAC, Cola Offline y SSE en Tiempo Real.
 * - Si el servidor local está activo, autentica con token Bearer HMAC-SHA256.
 * - Emite eventos transaccionales al diario append-only con llave de idempotencia.
 * - Si el servidor está apagado (modo offline puro), encola eventos en localStorage sin detener Caja.
 * - Recibe notificaciones SSE en tiempo real desde otras pestañas/cajas en la red local.
 *
 * Compatible con Chrome 109 / Edge 109 (Windows 7). Sin ?. ni ??.
 */

(function (window) {
  'use strict';

  var STORAGE_OUTBOX_KEY = 'mtp_offline_outbox';
  var STORAGE_VPS_OUTBOX_KEY = 'mtp_vps_outbox_v8';
  var STORAGE_TOKEN_KEY = 'mtp_api_token_v8';
  var STORAGE_VPS_TOKEN_KEY = 'mtp_vps_token_v8';
  var STORAGE_VPS_URL_KEY = 'mtp_vps_url_v8';
  var STORAGE_LOCAL_URL_KEY = 'mtp_local_url_v8';
  var HEALTH_CHECK_INTERVAL_MS = 12000;
  var FETCH_TIMEOUT_MS = 3500;

  var defaultOrigin = 'http://127.0.0.1:7070';
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.indexOf('http') === 0) {
    if (window.location.origin) {
      defaultOrigin = window.location.origin;
    } else if (window.location.hostname) {
      defaultOrigin = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
    }
  }

  function cleanUrl(u) {
    return String(u || '').trim().replace(/\/+$/, '');
  }

  function readStorage(key) {
    try {
      return (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : '') || '';
    } catch (_) {
      return '';
    }
  }

  function writeStorage(key, val) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (val) localStorage.setItem(key, val);
      else localStorage.removeItem(key);
    } catch (_) {}
  }

  var localUrl = cleanUrl(readStorage(STORAGE_LOCAL_URL_KEY)) || defaultOrigin;
  var vpsUrl = cleanUrl(readStorage(STORAGE_VPS_URL_KEY));
  if (!vpsUrl && defaultOrigin.indexOf('https://') === 0) {
    vpsUrl = defaultOrigin;
  }

  var baseUrl = vpsUrl || localUrl;
  var _activeTarget = vpsUrl ? 'VPS' : 'LOCAL';
  var _isOnline = false;
  var _vpsOnline = false;
  var _localOnline = false;
  var _isSyncingOutbox = false;
  var _flushPromise = null;
  var _flushQueued = false;
  var _checkTimer = null;
  var _listeners = [];
  var _sse = null;
  var _syncDebounceTimer = null;
  var _lastEmittedSeqId = '';

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

  function getAuthToken(target) {
    var useVps = target === 'VPS' || (!target && _activeTarget === 'VPS' && vpsUrl);
    var key = useVps ? STORAGE_VPS_TOKEN_KEY : STORAGE_TOKEN_KEY;
    try {
      if (typeof sessionStorage !== 'undefined') {
        var sTok = sessionStorage.getItem(key);
        if (sTok) return sTok;
      }
      if (typeof localStorage !== 'undefined') {
        var lTok = localStorage.getItem(key) || '';
        if (lTok) return lTok;
      }
      // Fallback por compatibilidad si sólo existe el token clásico
      if (useVps && localUrl === vpsUrl && typeof localStorage !== 'undefined') {
        return localStorage.getItem(STORAGE_TOKEN_KEY) || '';
      }
    } catch (_) {}
    return '';
  }

  function setAuthToken(tok, target) {
    var key = (target === 'VPS') ? STORAGE_VPS_TOKEN_KEY : STORAGE_TOKEN_KEY;
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (tok) sessionStorage.setItem(key, tok);
        else sessionStorage.removeItem(key);
      }
      if (typeof localStorage !== 'undefined') {
        if (tok) localStorage.setItem(key, tok);
        else localStorage.removeItem(key);
      }
    } catch (_) {}
  }

  function buildAuthHeaders(extra, target) {
    var headers = Object.assign({}, extra || {});
    var tok = getAuthToken(target);
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return headers;
  }

  function getOutbox(key) {
    var k = key || STORAGE_OUTBOX_KEY;
    try {
      var raw = localStorage.getItem(k);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function setOutbox(items, key) {
    var k = key || STORAGE_OUTBOX_KEY;
    try {
      localStorage.setItem(k, JSON.stringify(items || []));
      notifyStatusChange();
    } catch (e) {
      console.error('[MTPApiClient] Error guardando outbox local:', e);
    }
  }

  function enqueueOutbox(event, key) {
    var k = key || STORAGE_OUTBOX_KEY;
    var items = getOutbox(k);
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].idempotencyKey && items[i].idempotencyKey === event.idempotencyKey) {
        return;
      }
    }
    if (event && event.type === 'STATE_SYNCED') {
      items = items.filter(function (it) { return !it || it.type !== 'STATE_SYNCED'; });
    }
    items.push(event);
    setOutbox(items, k);
  }

  function getTotalPendingCount() {
    return getOutbox(STORAGE_OUTBOX_KEY).length + getOutbox(STORAGE_VPS_OUTBOX_KEY).length;
  }

  function recordRejectedEvent(event, errInfo) {
    try {
      var raw = readStorage('mtp_sync_rejected_v1');
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      list.push({
        id: event && event.id ? event.id : '',
        type: event && event.type ? event.type : '',
        error: (errInfo && errInfo.error) ? errInfo.error : 'Rechazado por servidor',
        status: (errInfo && errInfo.status) ? errInfo.status : 400,
        at: new Date().toISOString()
      });
      if (list.length > 30) list = list.slice(list.length - 30);
      writeStorage('mtp_sync_rejected_v1', JSON.stringify(list));
    } catch (_) {}
  }

  function notifyStatusChange() {
    var detail = {
      online: _isOnline,
      vpsConfigured: !!vpsUrl,
      vpsOnline: _vpsOnline,
      localOnline: _localOnline,
      activeTarget: _activeTarget,
      authenticated: !!getAuthToken(),
      pendingCount: getOutbox(STORAGE_OUTBOX_KEY).length + getOutbox(STORAGE_VPS_OUTBOX_KEY).length,
      vpsPendingCount: getOutbox(STORAGE_VPS_OUTBOX_KEY).length,
      baseUrl: baseUrl,
      vpsUrl: vpsUrl,
      localUrl: localUrl
    };

    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](detail); } catch (_) {}
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('mtp:connection-status', { detail: detail }));
      } catch (e) {
        try {
          var evOld = document.createEvent('CustomEvent');
          evOld.initCustomEvent('mtp:connection-status', false, false, detail);
          window.dispatchEvent(evOld);
        } catch (e2) {}
      }
    }
  }

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
            try { abortCtrl.abort(); } catch (_) {}
          }
          reject(new Error('Timeout de conexión (' + timeout + 'ms)'));
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

  function connectStream() {
    if (typeof EventSource === 'undefined' || !_isOnline) return;
    var tok = getAuthToken();
    if (!tok) return;

    if (_sse) {
      try { _sse.close(); } catch (_) {}
      _sse = null;
    }

    try {
      _sse = new EventSource(baseUrl + '/api/v1/stream?token=' + encodeURIComponent(tok));
      _sse.addEventListener('state_event', function (e) {
        try {
          var meta = JSON.parse(e.data);
          if (meta && meta.id && meta.id === _lastEmittedSeqId) return;
          if (window.MTP && typeof window.MTP.applyRemoteState === 'function') {
            getState().then(function (resp) {
              if (resp && resp.state) {
                window.MTP.applyRemoteState(resp.state);
              }
            }).catch(function () {});
          }
        } catch (_) {}
      });
      _sse.onerror = function () {
        if (_sse) {
          try { _sse.close(); } catch (_) {}
          _sse = null;
        }
      };
    } catch (_) {}
  }

  function disconnectStream() {
    if (_sse) {
      try { _sse.close(); } catch (_) {}
      _sse = null;
    }
  }

  function probeEndpoint(urlToProbe) {
    if (!urlToProbe) return Promise.resolve({ online: false, data: null });
    return fetchWithTimeout(urlToProbe + '/api/v1/status?_t=' + Date.now(), { method: 'GET', cache: 'no-store' }, FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (res.status !== 200) return { online: false, status: res.status };
        return res.json().then(function (data) {
          return { online: Boolean(data && data.ok === true), data: data };
        }).catch(function () {
          return { online: false };
        });
      })
      .catch(function (err) {
        return { online: false, error: err.message };
      });
  }

  function checkHealth() {
    var vpsPromise = vpsUrl ? probeEndpoint(vpsUrl) : Promise.resolve({ online: false });
    var localPromise = (localUrl && localUrl !== vpsUrl) ? probeEndpoint(localUrl) : Promise.resolve({ online: false });

    return Promise.all([vpsPromise, localPromise]).then(function (results) {
      var vpsRes = results[0];
      var locRes = results[1];
      _vpsOnline = Boolean(vpsRes && vpsRes.online);
      _localOnline = (localUrl === vpsUrl) ? _vpsOnline : Boolean(locRes && locRes.online);

      var prevTarget = _activeTarget;
      var wasOffline = !_isOnline;

      if (vpsUrl && _vpsOnline) {
        _activeTarget = 'VPS';
        baseUrl = vpsUrl;
        _isOnline = true;
      } else if (_localOnline) {
        _activeTarget = vpsUrl ? 'LOCAL_FALLBACK' : 'LOCAL';
        baseUrl = localUrl;
        _isOnline = true;
      } else {
        _activeTarget = vpsUrl ? 'OFFLINE' : 'LOCAL';
        baseUrl = vpsUrl || localUrl;
        _isOnline = false;
      }

      if (prevTarget !== _activeTarget && _sse) {
        disconnectStream();
      }
      notifyStatusChange();

      if (_isOnline && getAuthToken()) {
        if (!_sse) connectStream();
        if (wasOffline || getOutbox(STORAGE_OUTBOX_KEY).length > 0 || (_vpsOnline && getOutbox(STORAGE_VPS_OUTBOX_KEY).length > 0)) {
          flushOutbox();
        }
      } else if (!_isOnline) {
        disconnectStream();
      }

      return {
        online: _isOnline,
        vpsOnline: _vpsOnline,
        localOnline: _localOnline,
        activeTarget: _activeTarget,
        data: (vpsRes && vpsRes.data) || (locRes && locRes.data) || null
      };
    });
  }

  function loginSingleEndpoint(targetUrl, tokenKeyTarget, username, pin) {
    if (!targetUrl) return Promise.resolve({ ok: false });
    return fetchWithTimeout(targetUrl + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, pin: String(pin) })
    }, FETCH_TIMEOUT_MS)
      .then(function (res) {
        return res.json().then(function (data) {
          if (res.status === 200 && data && data.ok && data.token) {
            setAuthToken(data.token, tokenKeyTarget);
            return { ok: true, token: data.token };
          }
          return { ok: false, error: (data && data.error) || ('HTTP ' + res.status) };
        });
      })
      .catch(function () {
        return { ok: false, offline: true };
      });
  }

  function loginServer(username, pin) {
    if (!username || !pin) return Promise.resolve({ ok: false });
    var tasks = [];
    var vpsIdx = -1;
    var localIdx = -1;
    if (vpsUrl) {
      vpsIdx = tasks.length;
      tasks.push(loginSingleEndpoint(vpsUrl, 'VPS', username, pin));
    }
    if (localUrl && localUrl !== vpsUrl) {
      localIdx = tasks.length;
      tasks.push(loginSingleEndpoint(localUrl, 'LOCAL', username, pin));
    }

    return Promise.all(tasks).then(function (resList) {
      var vpsOk = vpsIdx >= 0 && resList[vpsIdx] && resList[vpsIdx].ok;
      var localOk = localIdx >= 0 && resList[localIdx] && resList[localIdx].ok;
      var anyOk = (vpsOk ? resList[vpsIdx] : null) || (localOk ? resList[localIdx] : null);
      if (anyOk) {
        if (vpsOk) {
          _vpsOnline = true;
          _activeTarget = 'VPS';
          baseUrl = vpsUrl;
          if (localOk) _localOnline = true;
        } else {
          _localOnline = true;
          _activeTarget = vpsUrl ? 'LOCAL_FALLBACK' : 'LOCAL';
          baseUrl = localUrl;
        }
        _isOnline = true;
        notifyStatusChange();
        connectStream();
        flushOutbox();
        return anyOk;
      }
      return resList[0] || { ok: false, offline: true };
    });
  }

  function logoutServer() {
    var tokLocal = getAuthToken('LOCAL');
    var tokVps = getAuthToken('VPS');
    disconnectStream();
    setAuthToken('', 'LOCAL');
    setAuthToken('', 'VPS');
    notifyStatusChange();
    var p1 = (tokLocal && localUrl) ? fetchWithTimeout(localUrl + '/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tokLocal }
    }, 2000).catch(function () {}) : Promise.resolve();
    var p2 = (tokVps && vpsUrl && vpsUrl !== localUrl) ? fetchWithTimeout(vpsUrl + '/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tokVps }
    }, 2000).catch(function () {}) : Promise.resolve();
    return Promise.all([p1, p2]).then(function () { return { ok: true }; });
  }

  function flushQueueToEndpoint(targetBase, queueKey, tokenTarget) {
    var items = getOutbox(queueKey);
    if (items.length === 0) return Promise.resolve({ syncedCount: 0 });
    var tok = getAuthToken(tokenTarget);
    if (!tok) return Promise.resolve({ syncedCount: 0, waitingAuth: true });

    var sentKeys = {};
    for (var sIdx = 0; sIdx < items.length; sIdx++) {
      var sItem = items[sIdx];
      if (!sItem) continue;
      if (sItem.id) sentKeys['id:' + sItem.id] = true;
      if (sItem.idempotencyKey) sentKeys['ik:' + sItem.idempotencyKey] = true;
    }

    function wasSentInBatch(it) {
      if (!it) return false;
      return Boolean((it.id && sentKeys['id:' + it.id]) || (it.idempotencyKey && sentKeys['ik:' + it.idempotencyKey]));
    }

    function mergeRemainingWithNewerItems(keptFailed) {
      var latest = getOutbox(queueKey);
      var merged = [];
      var seen = {};
      for (var k = 0; k < keptFailed.length; k++) {
        var f = keptFailed[k];
        merged.push(f);
        if (f && f.id) seen['id:' + f.id] = true;
        if (f && f.idempotencyKey) seen['ik:' + f.idempotencyKey] = true;
      }
      for (var n = 0; n < latest.length; n++) {
        var cur = latest[n];
        if (!cur || wasSentInBatch(cur)) continue;
        if ((cur.id && seen['id:' + cur.id]) || (cur.idempotencyKey && seen['ik:' + cur.idempotencyKey])) continue;
        merged.push(cur);
      }
      setOutbox(merged, queueKey);
    }

    // Intentar sincronización en lote (/api/v1/events/batch) primero para mayor velocidad
    return fetchWithTimeout(targetBase + '/api/v1/events/batch', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, tokenTarget),
      body: JSON.stringify({ events: items })
    }, 8000)
      .then(function (res) {
        if (res.status === 200) {
          return res.json().then(function (data) {
            if (data && data.ok) {
              mergeRemainingWithNewerItems([]);
              return { syncedCount: Number(data.syncedCount || 0) + Number(data.deduplicatedCount || 0) };
            }
            if (data && Array.isArray(data.errors) && data.errors.length > 0) {
              var errorByIndex = {};
              var errorById = {};
              for (var eIdx = 0; eIdx < data.errors.length; eIdx++) {
                var er = data.errors[eIdx];
                if (!er) continue;
                if (typeof er.index === 'number') errorByIndex[er.index] = er;
                if (er.id) errorById[er.id] = er;
              }
              var remaining = [];
              var rejectedCount = 0;
              for (var idx = 0; idx < items.length; idx++) {
                var item = items[idx];
                var itemErr = errorByIndex[idx] || (item && item.id ? errorById[item.id] : null);
                if (!itemErr) continue; // Succeeded or deduplicated
                var st = Number(itemErr.status || 0);
                if (st === 400 || st === 403 || st === 404) {
                  rejectedCount += 1;
                  recordRejectedEvent(item, itemErr);
                  console.warn('[MTPApiClient] Evento descartado del outbox:', item && item.type, itemErr.error || st);
                } else {
                  remaining.push(item);
                }
              }
              mergeRemainingWithNewerItems(remaining);
              return {
                syncedCount: Number(data.syncedCount || 0) + Number(data.deduplicatedCount || 0),
                failedCount: remaining.length,
                rejectedCount: rejectedCount
              };
            }
            return { syncedCount: Number(data && data.syncedCount ? data.syncedCount : 0) };
          });
        }
        if (res.status === 401) {
          setAuthToken('', tokenTarget);
          return { syncedCount: 0, unauthorized: true };
        }
        return { syncedCount: 0, httpStatus: res.status };
      })
      .catch(function () {
        return { syncedCount: 0, offline: true };
      });
  }

  function flushOutbox() {
    if (!_isOnline) {
      return Promise.resolve({ syncing: false });
    }
    if (_isSyncingOutbox && _flushPromise) {
      if (!_flushQueued) {
        _flushQueued = true;
        return _flushPromise.then(function () {
          _flushQueued = false;
          return flushOutbox();
        });
      }
      return _flushPromise;
    }
    var tok = getAuthToken();
    if (!tok) {
      return Promise.resolve({ syncing: false, waitingAuth: true });
    }

    _isSyncingOutbox = true;

    var tasks = [];
    if (vpsUrl && _vpsOnline) {
      // Si hay eventos acumulados durante corte de internet, subirlos al VPS en lote
      tasks.push(flushQueueToEndpoint(vpsUrl, STORAGE_VPS_OUTBOX_KEY, 'VPS'));
      tasks.push(flushQueueToEndpoint(vpsUrl, STORAGE_OUTBOX_KEY, 'VPS'));
    } else if (_localOnline && localUrl) {
      tasks.push(flushQueueToEndpoint(localUrl, STORAGE_OUTBOX_KEY, 'LOCAL'));
    }

    _flushPromise = Promise.all(tasks)
      .then(function (results) {
        var total = 0;
        for (var i = 0; i < results.length; i++) {
          total += (results[i] && results[i].syncedCount) ? results[i].syncedCount : 0;
        }
        _isSyncingOutbox = false;
        _flushPromise = null;
        return { syncedCount: total };
      })
      .catch(function (err) {
        _isSyncingOutbox = false;
        _flushPromise = null;
        return { syncedCount: 0, error: err && err.message ? err.message : 'Error sync' };
      });
    return _flushPromise;
  }

  function emitEvent(type, payload, user) {
    if (!type || typeof type !== 'string') {
      return Promise.reject(new Error('emitEvent requiere un tipo de evento válido'));
    }

    var localId = generateLocalId();
    var currentUser = user;
    if (!currentUser && window.MTPAuth && typeof window.MTPAuth.getCurrentUser === 'function') {
      var u = window.MTPAuth.getCurrentUser();
      if (u && u.username) currentUser = u.username;
    }

    var eventObj = {
      id: localId,
      idempotencyKey: (payload && payload.idempotencyKey) ? payload.idempotencyKey : ('idem_' + localId),
      type: type,
      payload: payload !== undefined ? payload : {},
      user: currentUser || 'cajero',
      device: 'CAJA-01',
      ts: new Date().toISOString()
    };

    // Si hay VPS configurado pero estamos sin internet, encolar siempre para subirlo cuando vuelva la red
    if (vpsUrl && (!_vpsOnline || !getAuthToken('VPS'))) {
      enqueueOutbox(eventObj, STORAGE_VPS_OUTBOX_KEY);
    }

    var activeTokenTarget = (_activeTarget === 'VPS') ? 'VPS' : 'LOCAL';
    var tok = getAuthToken(activeTokenTarget);
    if (!_isOnline || !tok) {
      enqueueOutbox(eventObj, STORAGE_OUTBOX_KEY);
      return Promise.resolve({
        ok: true,
        queued: true,
        offline: true,
        localId: eventObj.id,
        event: eventObj
      });
    }

    _lastEmittedSeqId = eventObj.id;

    // Espejo en motor local de respaldo cuando el primario es el VPS
    if (_activeTarget === 'VPS' && _localOnline && localUrl && localUrl !== vpsUrl && getAuthToken('LOCAL')) {
      fetchWithTimeout(localUrl + '/api/v1/events', {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, 'LOCAL'),
        body: JSON.stringify(eventObj)
      }, 2500).catch(function () {});
    }

    return fetchWithTimeout(baseUrl + '/api/v1/events', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, activeTokenTarget),
      body: JSON.stringify(eventObj)
    }, 4500)
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
        }
        if (res.status === 400 || res.status === 403 || res.status === 404) {
          return res.json().catch(function () { return {}; }).then(function (errData) {
            var errMsg = (errData && errData.error) ? errData.error : ('HTTP ' + res.status);
            recordRejectedEvent(eventObj, { status: res.status, error: errMsg });
            console.warn('[MTPApiClient] Evento rechazado (' + res.status + '):', type, errMsg);
            return {
              ok: false,
              rejected: true,
              status: res.status,
              error: errMsg,
              localId: eventObj.id,
              event: eventObj
            };
          });
        }
        if (res.status === 401) {
          setAuthToken('', activeTokenTarget);
        } else {
          if (_activeTarget === 'VPS') _vpsOnline = false;
          else _isOnline = false;
        }
        enqueueOutbox(eventObj, _activeTarget === 'VPS' ? STORAGE_VPS_OUTBOX_KEY : STORAGE_OUTBOX_KEY);
        notifyStatusChange();
        return {
          ok: true,
          queued: true,
          offline: true,
          localId: eventObj.id,
          event: eventObj
        };
      })
      .catch(function () {
        if (_activeTarget === 'VPS') _vpsOnline = false;
        else _isOnline = false;
        enqueueOutbox(eventObj, _activeTarget === 'VPS' ? STORAGE_VPS_OUTBOX_KEY : STORAGE_OUTBOX_KEY);
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

  function onStateSaved(newState, options) {
    options = options || {};
    var evType = options.eventType || 'STATE_SYNCED';
    if (options.eventPayload || options.eventType) {
      if (evType === 'BACKUP_IMPORTED' || evType === 'STATE_SYNCED') {
        var snapPayload = (options.eventPayload && options.eventPayload.state)
          ? options.eventPayload
          : { state: newState };
        emitEvent(evType, snapPayload);
      } else {
        emitEvent(evType, options.eventPayload || { updatedAt: newState.updatedAt || new Date().toISOString() });
      }
      return;
    }

    // Si una mutación olvidó pasar eventType/eventPayload, advertir y sintetizar STATE_SYNCED sin descartarlo offline
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[MTPApiClient] onStateSaved recibido sin eventType/eventPayload; sintetizando STATE_SYNCED.');
    }

    if (!getAuthToken() || !_isOnline) {
      emitEvent('STATE_SYNCED', { state: newState });
      return;
    }
    if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    _syncDebounceTimer = setTimeout(function () {
      _syncDebounceTimer = null;
      emitEvent('STATE_SYNCED', { state: newState });
    }, 1500);
  }

  function getState() {
    return fetchWithTimeout(baseUrl + '/api/v1/state', {
      method: 'GET',
      cache: 'no-store',
      headers: buildAuthHeaders()
    }, 4000).then(function (res) {
      if (res.status === 200) return res.json();
      throw new Error('Servidor respondió con código ' + res.status);
    });
  }

  function getEvents(sinceSeq) {
    var s = sinceSeq || 0;
    return fetchWithTimeout(baseUrl + '/api/v1/events?sinceSeq=' + s, {
      method: 'GET',
      cache: 'no-store',
      headers: buildAuthHeaders()
    }, 4000).then(function (res) {
      if (res.status === 200) return res.json();
      throw new Error('Error al obtener eventos: ' + res.status);
    });
  }

  function triggerBackup() {
    return fetchWithTimeout(baseUrl + '/api/v1/backup', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: '{}'
    }, 10000).then(function (res) {
      if (res.status === 200) return res.json();
      throw new Error('Error en respaldo manual: ' + res.status);
    });
  }

  function onStatusChange(callback) {
    if (typeof callback === 'function') {
      _listeners.push(callback);
      callback({
        online: _isOnline,
        authenticated: !!getAuthToken(),
        pendingCount: getTotalPendingCount(),
        baseUrl: baseUrl
      });
    }
  }

  function setBaseUrl(newUrl) {
    if (newUrl && typeof newUrl === 'string') {
      localUrl = cleanUrl(newUrl);
      writeStorage(STORAGE_LOCAL_URL_KEY, localUrl);
      if (!vpsUrl) baseUrl = localUrl;
      checkHealth();
    }
  }

  function setVpsUrl(newVpsUrl) {
    vpsUrl = cleanUrl(newVpsUrl);
    writeStorage(STORAGE_VPS_URL_KEY, vpsUrl);
    baseUrl = vpsUrl || localUrl;
    return checkHealth();
  }

  function getSyncStatus() {
    return {
      online: _isOnline,
      vpsConfigured: !!vpsUrl,
      vpsOnline: _vpsOnline,
      localOnline: _localOnline,
      activeTarget: _activeTarget,
      vpsUrl: vpsUrl,
      localUrl: localUrl,
      baseUrl: baseUrl,
      pendingLocal: getOutbox(STORAGE_OUTBOX_KEY).length,
      pendingVps: getOutbox(STORAGE_VPS_OUTBOX_KEY).length
    };
  }

  function init(options) {
    if (options && options.baseUrl) localUrl = cleanUrl(options.baseUrl);
    if (options && options.vpsUrl !== undefined) {
      vpsUrl = cleanUrl(options.vpsUrl);
      writeStorage(STORAGE_VPS_URL_KEY, vpsUrl);
    }
    baseUrl = vpsUrl || localUrl;
    checkHealth();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', function () { checkHealth(); });
      window.addEventListener('offline', function () {
        _isOnline = false;
        disconnectStream();
        notifyStatusChange();
      });
    }

    if (_checkTimer) clearInterval(_checkTimer);
    _checkTimer = setInterval(function () {
      checkHealth();
    }, HEALTH_CHECK_INTERVAL_MS);

    return {
      baseUrl: baseUrl,
      isOnline: function () { return _isOnline; },
      pendingCount: getTotalPendingCount
    };
  }

  var clientApi = {
    init: init,
    isOnline: function () { return _isOnline; },
    isAuthenticated: function () { return !!getAuthToken(); },
    getPendingCount: function () { return getOutbox(STORAGE_OUTBOX_KEY).length + getOutbox(STORAGE_VPS_OUTBOX_KEY).length; },
    getSyncStatus: getSyncStatus,
    probeEndpoint: probeEndpoint,
    loginServer: loginServer,
    logoutServer: logoutServer,
    emitEvent: emitEvent,
    onStateSaved: onStateSaved,
    getState: getState,
    getEvents: getEvents,
    triggerBackup: triggerBackup,
    checkHealth: checkHealth,
    flushOutbox: flushOutbox,
    onStatusChange: onStatusChange,
    setBaseUrl: setBaseUrl,
    setVpsUrl: setVpsUrl,
    getVpsUrl: function () { return vpsUrl; },
    getBaseUrl: function () { return baseUrl; },
    generateLocalId: generateLocalId
  };

  window.MTPApiClient = clientApi;

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
