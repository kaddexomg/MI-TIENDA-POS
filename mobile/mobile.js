(function () {
  'use strict';

  var STORAGE_KEY = 'mtp_mobile_admin_cfg_v1';
  var STATE_CACHE_KEY = 'mtp_mobile_state_cache_v2';
  var state = {
    serverUrl: '',
    vpsUrl: '',
    lanUrl: '',
    remoteUrl: '',
    username: '',
    token: '',
    user: null,
    appState: null,
    aiInsights: null,
    networkInfo: null,
    serverOnline: false,
    lastSyncAt: '',
    activeTab: 'live',
    livePeriod: 'TODAY',
    pmFilter: 'PENDIENTE',
    invFilter: 'ALL',
    invSearch: '',
    sseConnected: false,
    liveAlerts: [],
    lastAiAnswer: ''
  };

  function buildEmptyFallbackState() {
    return {
      settings: {
        storeName: 'MI TIENDA POS',
        rateBcv: 42.85,
        rateEur: 46.60,
        rateUsdt: 51.40
      },
      inventory: [],
      variants: [],
      sales: [],
      expenses: []
    };
  }

  function buildOfflineAiFallback(st) {
    var cfg = (st && st.settings) || {};
    var bcv = Number(cfg.rateBcv || 42.85);
    var usdt = Number(cfg.rateUsdt || 51.40);
    var gapPct = bcv > 0 ? Number((((usdt - bcv) / bcv) * 100).toFixed(1)) : 0;
    var inv = Array.isArray(st && st.inventory) ? st.inventory : [];
    var critical = inv.filter(function (it) {
      return it && Number(it.stock || 0) <= Number(it.minStock || 5);
    }).map(function (it) {
      return {
        id: it.id,
        name: it.name,
        stock: Number(it.stock || 0),
        unit: it.unit || 'und',
        severity: Number(it.stock || 0) <= 0 ? 'AGOTADO' : 'CRÍTICO'
      };
    });
    return {
      summary: {
        healthScore: critical.length > 0 ? 72 : 90,
        statusLabel: state.serverOnline ? 'En línea' : 'Caché local',
        headline: state.serverOnline
          ? 'Diagnóstico calculado con datos del servidor.'
          : 'Conecta tu VPS para analizar ventas e inventario en tiempo real.',
        bcv: bcv,
        usdt: usdt,
        gapPct: gapPct,
        targetMarginPct: 30
      },
      inventoryHealth: {
        criticalItems: critical,
        fallingStockItems: []
      },
      fallingProducts: [],
      pricingSuggestions: [],
      recommendations: [
        {
          tag: state.serverOnline ? 'ACTIVO' : 'VPS',
          severity: state.serverOnline ? 'ok' : 'warn',
          title: state.serverOnline ? 'Motor conectado y monitoreando costos' : 'Esperando conexión con el VPS',
          detail: state.serverOnline
            ? 'Los márgenes y brechas cambiarias se actualizan automáticamente.'
            : 'Toca "Configurar VPS" para enlazar esta app con tu servidor en la nube.'
        }
      ]
    };
  }

  function loadCachedSnapshot() {
    try {
      var raw = localStorage.getItem(STATE_CACHE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.appState) state.appState = parsed.appState;
        if (parsed && parsed.aiInsights) state.aiInsights = parsed.aiInsights;
        if (parsed && parsed.lastSyncAt) state.lastSyncAt = parsed.lastSyncAt;
      }
    } catch (e) {}
    if (!state.appState) state.appState = buildEmptyFallbackState();
    if (!state.aiInsights) state.aiInsights = buildOfflineAiFallback(state.appState);
  }

  function saveCachedSnapshot() {
    try {
      localStorage.setItem(STATE_CACHE_KEY, JSON.stringify({
        appState: state.appState,
        aiInsights: state.aiInsights,
        lastSyncAt: state.lastSyncAt
      }));
    } catch (e) {}
  }

  var pinBuffer = '';
  var pinSubmitting = false;
  var sseSource = null;
  var toastTimer = null;

  function isAdminRole(role) {
    var r = String(role || '').trim().toLowerCase();
    return r === 'administrador' || r === 'admin' || r === 'dueño' || r === 'dueno' || r === 'owner';
  }

  var DEFAULT_FAMILIES = [
    { id: 'fritos', name: 'Empanadas y Fritos', emoji: '🥟', iva: 'G16' },
    { id: 'arepas', name: 'Arepas Venezolanas', emoji: '🫓', iva: 'G16' },
    { id: 'almuerzos', name: 'Almuerzos y Platos', emoji: '🍽️', iva: 'G16' },
    { id: 'viveres', name: 'Víveres (Exentos)', emoji: '🛒', iva: 'E' },
    { id: 'bebidas', name: 'Refrescos y Maltas', emoji: '🥤', iva: 'G16' },
    { id: 'cafeteria', name: 'Cafetería', emoji: '☕', iva: 'G16' },
    { id: 'chucherias', name: 'Chucherías', emoji: '🍿', iva: 'G16' },
    { id: 'cervezas', name: 'Cervezas', emoji: '🍺', iva: 'G16' },
    { id: 'cigarros', name: 'Cigarros', emoji: '🚬', iva: 'G16' }
  ];

  function loadStoredConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.serverUrl = parsed.serverUrl || '';
          state.vpsUrl = parsed.vpsUrl || '';
          state.lanUrl = parsed.lanUrl || '';
          state.remoteUrl = parsed.remoteUrl || '';
          state.username = parsed.username || '';
          state.token = parsed.token || '';
          state.user = parsed.user || null;
        }
      }
    } catch (e) {}

    if (!state.serverUrl) {
      if (window.AndroidBridge && typeof window.AndroidBridge.getServerUrl === 'function') {
        var bUrl = window.AndroidBridge.getServerUrl();
        if (bUrl) state.serverUrl = bUrl;
      }
    }

    if (!state.serverUrl && window.location && window.location.protocol && window.location.protocol.indexOf('http') === 0) {
      var isNativeShell = Boolean(window.AndroidBridge) || (window.location.hostname === 'appassets.androidplatform.net') || (window.location.hostname === 'localhost' && !window.location.port);
      if (!isNativeShell) {
        state.serverUrl = window.location.origin;
        if (window.location.protocol === 'https:') {
          state.vpsUrl = window.location.origin;
        }
      }
    }

    if (!state.lanUrl) {
      state.lanUrl = 'http://192.168.137.1:7070';
    }
    if (!state.serverUrl) {
      state.serverUrl = state.vpsUrl || state.remoteUrl || state.lanUrl;
    }
  }

  function saveStoredConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        serverUrl: state.serverUrl,
        vpsUrl: state.vpsUrl,
        lanUrl: state.lanUrl,
        remoteUrl: state.remoteUrl,
        username: state.username,
        token: state.token,
        user: state.user
      }));
    } catch (e) {}
  }

  function esc(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtUsd(v) {
    return '$' + (Number(v) || 0).toFixed(2);
  }

  function fmtBs(v) {
    return 'Bs ' + (Number(v) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showToast(msg) {
    var el = document.getElementById('toastBanner');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2600);
  }

  function vibrateLight() {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.vibrate === 'function') {
        window.AndroidBridge.vibrate(40);
      } else if (navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch (e) {}
  }

  function apiFetch(path, opts) {
    var options = Object.assign({ method: 'GET' }, opts || {});
    var headers = Object.assign({}, options.headers || {});
    if (state.token) {
      headers['Authorization'] = 'Bearer ' + state.token;
    }
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    options.headers = headers;

    var base = String(state.serverUrl || '').replace(/\/+$/, '');
    if (!base) return Promise.reject(new Error('Servidor no configurado'));

    return new Promise(function (resolve, reject) {
      var done = false;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (ctrl) options.signal = ctrl.signal;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          if (ctrl) { try { ctrl.abort(); } catch (e) {} }
          reject(new Error('Tiempo de espera agotado'));
        }
      }, 4500);

      fetch(base + path, options)
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              if (res.status === 401) {
                handleUnauthorized();
              }
              var errMsg = (data && data.error) ? data.error : ('Error HTTP ' + res.status);
              throw new Error(errMsg);
            }
            return data;
          });
        })
        .then(function (data) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(data);
          }
        })
        .catch(function (err) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  }

  function emitServerEvent(type, payload) {
    var ev = {
      id: 'mob_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      idempotencyKey: 'idem_mob_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: type,
      payload: payload || {},
      user: state.user ? state.user.username : 'admin',
      device: 'ANDROID-ADMIN',
      ts: new Date().toISOString()
    };
    return apiFetch('/api/v1/events', {
      method: 'POST',
      body: JSON.stringify(ev)
    });
  }

  function handleUnauthorized() {
    state.token = '';
    saveStoredConfig();
    stopSse();
    if (window.AndroidBridge && typeof window.AndroidBridge.stopAlerts === 'function') {
      try { window.AndroidBridge.stopAlerts(); } catch (e) {}
    }
    showLoginScreen('Tu sesión expiró. Ingresa nuevamente como Administrador.');
  }

  function notifyAndroidService() {
    if (!state.token || !state.serverUrl) return;
    var storeName = (state.appState && state.appState.settings && state.appState.settings.storeName)
      ? state.appState.settings.storeName
      : 'MI TIENDA POS';
    if (window.AndroidBridge && typeof window.AndroidBridge.startAlerts === 'function') {
      try {
        window.AndroidBridge.startAlerts(state.serverUrl, state.token, storeName);
      } catch (e) {}
    }
  }

  function startSse() {
    stopSse();
    if (typeof EventSource === 'undefined' || !state.token || !state.serverUrl) return;
    var base = String(state.serverUrl || '').replace(/\/+$/, '');
    var streamUrl = base + '/api/v1/stream?token=' + encodeURIComponent(state.token);

    try {
      sseSource = new EventSource(streamUrl);
      sseSource.onopen = function () {
        state.sseConnected = true;
        updateConnectionHeader();
      };
      sseSource.addEventListener('state_event', function (e) {
        try {
          var meta = JSON.parse(e.data || '{}');
          recordLiveAlert(meta);
          refreshAllData(true);
        } catch (err) {}
      });
      sseSource.onerror = function () {
        state.sseConnected = false;
        updateConnectionHeader();
      };
    } catch (e) {}
  }

  function stopSse() {
    if (sseSource) {
      try { sseSource.close(); } catch (e) {}
      sseSource = null;
    }
    state.sseConnected = false;
  }

  function recordLiveAlert(meta) {
    if (!meta || !meta.type) return;
    var sum = meta.summary || {};
    var text = 'Actualización: ' + meta.type;
    if (meta.type === 'SALE_CREATED') {
      text = 'Venta #' + (sum.orderNumber || '') + ' por ' + fmtUsd(sum.totalUsd || 0);
      if (sum.hasPendingPagoMovil) {
        text += ' · 📲 Pago Móvil por verificar (' + fmtBs(sum.pendingPmBs) + ')';
      }
    } else if (meta.type === 'PAGO_MOVIL_STATUS_CHANGED') {
      text = 'Pago Móvil Ref #' + (sum.paymentRef || '') + ' → ' + (sum.newStatus || '');
    } else if (meta.type === 'RATE_UPDATED') {
      text = 'Tasas actualizadas desde PC/Móvil';
    } else if (sum.itemName) {
      text = sum.itemName + ' actualizado';
    }
    state.liveAlerts.unshift({ ts: meta.ts || new Date().toISOString(), text: text });
    if (state.liveAlerts.length > 12) state.liveAlerts.length = 12;
  }

  function updateConnectionHeader() {
    var dot = document.getElementById('hdrStatusDot');
    var txt = document.getElementById('hdrConnText');
    var isVps = Boolean((state.vpsUrl && state.serverUrl === state.vpsUrl) || String(state.serverUrl || '').indexOf('https://') === 0);
    if (dot) {
      if (state.sseConnected || state.serverOnline) dot.classList.remove('offline');
      else dot.classList.add('offline');
    }
    if (txt) {
      if (state.sseConnected) {
        txt.textContent = isVps ? 'En vivo · VPS' : 'En vivo · Red Local';
      } else if (state.serverOnline) {
        txt.textContent = isVps ? 'Conectado · VPS' : 'Conectado · Red Local';
      } else {
        txt.textContent = 'Sin conexión · Toca Ajustes';
      }
    }
  }

  function refreshAllData(silent) {
    return Promise.all([
      apiFetch('/api/v1/state'),
      apiFetch('/api/v1/ai/insights').catch(function () { return null; }),
      apiFetch('/api/v1/network-info').catch(function () { return null; })
    ]).then(function (results) {
      var stResp = results[0];
      var aiResp = results[1];
      var netResp = results[2];

      state.serverOnline = true;
      state.lastSyncAt = new Date().toISOString();

      if (stResp && stResp.state) {
        state.appState = stResp.state;
      }
      if (aiResp && aiResp.insights) {
        state.aiInsights = aiResp.insights;
      } else if (state.appState) {
        state.aiInsights = buildOfflineAiFallback(state.appState);
      }
      if (netResp && netResp.ok) {
        state.networkInfo = netResp;
        if (netResp.vpsUrl) state.vpsUrl = netResp.vpsUrl;
        if (netResp.lanUrls && netResp.lanUrls[0]) state.lanUrl = netResp.lanUrls[0];
        if (netResp.remoteUrl) state.remoteUrl = netResp.remoteUrl;
        else if (netResp.tailscaleUrls && netResp.tailscaleUrls[0]) state.remoteUrl = netResp.tailscaleUrls[0];
        saveStoredConfig();
      }

      saveCachedSnapshot();
      updateConnectionHeader();
      updateHeaderMeta();
      notifyAndroidService();
      renderAllTabs();
      if (!silent) showToast('Sincronizado con el servidor');
    }).catch(function (err) {
      state.sseConnected = false;
      state.serverOnline = false;
      if (!state.appState) state.appState = buildEmptyFallbackState();
      if (!state.aiInsights) state.aiInsights = buildOfflineAiFallback(state.appState);
      updateConnectionHeader();
      updateHeaderMeta();
      renderAllTabs();
      if (!silent) showToast('Sin conexión al VPS (' + err.message + ')');
    });
  }

  function updateHeaderMeta() {
    var st = state.appState || {};
    var cfg = st.settings || {};
    var hEl = document.getElementById('hdrStoreName');
    var rEl = document.getElementById('hdrRatePill');
    if (hEl) hEl.textContent = cfg.storeName || 'MI TIENDA POS';
    if (rEl) rEl.textContent = 'BCV ' + (Number(cfg.rateBcv) || 42.85).toFixed(2);

    // Badge de Pago Móvil pendiente
    var pmList = extractPagoMovilList();
    var pendingCount = pmList.filter(function (p) { return p.verifyStatus === 'PENDIENTE'; }).length;
    var badge = document.getElementById('pmNavBadge');
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = String(pendingCount);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  function extractPagoMovilList() {
    var st = state.appState || {};
    var sales = Array.isArray(st.sales) ? st.sales : [];
    var rows = [];
    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      if (!s || s.voided || !Array.isArray(s.payments)) continue;
      for (var j = 0; j < s.payments.length; j++) {
        var p = s.payments[j];
        if (!p || p.method !== 'Pago Móvil') continue;
        var vStatus = p.verifyStatus || (p.verified === false ? 'PENDIENTE' : 'CONCILIADO');
        rows.push({
          saleId: s.id,
          orderNumber: s.orderNumber || '—',
          customer: s.customer || 'Cliente Mostrador',
          createdAt: s.createdAt || s.ts || '',
          paymentId: p.id || '',
          ref: p.ref || '—',
          bank: p.bank || 'Banco',
          phone: p.phone || '—',
          destAccount: p.destAccountName || 'Cuenta Principal',
          amountBs: Number(p.amountBs || 0),
          amountUsd: Number(p.amountUsd || 0),
          verifyStatus: vStatus,
          reviewNotes: p.reviewNotes || ''
        });
      }
    }
    rows.sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return rows;
  }

  function computePeriodSummary(period) {
    var st = state.appState || {};
    var sales = Array.isArray(st.sales) ? st.sales : [];
    var expenses = Array.isArray(st.expenses) ? st.expenses : [];
    var bcv = Number((st.settings && st.settings.rateBcv) || 42.85);
    var now = new Date();
    var todayStr = now.toISOString().slice(0, 10);
    var weekMs = now.getTime() - (7 * 86400000);
    var monthStr = todayStr.slice(0, 7);

    function inPeriod(iso) {
      if (!iso) return false;
      if (period === 'MONTH') return iso.slice(0, 7) === monthStr;
      if (period === 'WEEK') {
        var t = Date.parse(iso);
        return !isNaN(t) && t >= weekMs;
      }
      return iso.slice(0, 10) === todayStr;
    }

    var totalUsd = 0;
    var totalBs = 0;
    var orders = 0;
    var cashUsd = 0;
    var cashBs = 0;
    var pmBs = 0;
    var filteredSales = [];

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      if (!s || s.voided) continue;
      var ts = s.createdAt || s.ts || '';
      if (!inPeriod(ts)) continue;
      filteredSales.push(s);
      orders += 1;
      totalUsd += Number(s.totalUsd || 0);
      totalBs += Number(s.totalBs || (Number(s.totalUsd || 0) * bcv));

      var pays = Array.isArray(s.payments) ? s.payments : [];
      for (var j = 0; j < pays.length; j++) {
        var p = pays[j];
        if (!p) continue;
        if (p.method === 'Efectivo USD') cashUsd += Number(p.amountUsd || 0);
        else if (p.method === 'Efectivo Bs') cashBs += Number(p.amountBs || 0);
        else if (p.method === 'Pago Móvil') pmBs += Number(p.amountBs || 0);
      }
      if (s.changeGiven) {
        cashUsd -= Number(s.changeGiven.usdCash || s.changeGiven.usdGiven || 0);
        cashBs -= Number(s.changeGiven.bsCash || 0);
      }
    }

    var expUsd = 0;
    for (var e = 0; e < expenses.length; e++) {
      var ex = expenses[e];
      if (!ex) continue;
      var ets = ex.createdAt || ex.ts || '';
      if (!inPeriod(ets)) continue;
      var u = Number(ex.amountUsd || 0);
      expUsd += u;
      if (ex.paymentSource === 'Efectivo USD') cashUsd -= u;
      else if (ex.paymentSource === 'Efectivo Bs') cashBs -= Number(ex.amountBs || u * bcv);
      else if (ex.paymentSource === 'Pago Móvil') pmBs -= Number(ex.amountBs || u * bcv);
    }

    filteredSales.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    return {
      bcv: bcv,
      totalUsd: totalUsd,
      totalBs: totalBs,
      orders: orders,
      expUsd: expUsd,
      cashUsd: cashUsd,
      cashBs: cashBs,
      pmBs: pmBs,
      recentSales: filteredSales.slice(0, 15)
    };
  }

  /* ========================================================================
     RENDER DE LAS 5 PESTAÑAS + PAGER SWIPEABLE
     ======================================================================== */
  var TAB_ORDER = ['live', 'pagomovil', 'inventory', 'ai', 'control'];
  var activePagerIndex = 0;

  function renderAllTabs() {
    var liveEl = document.getElementById('pane-live');
    var pmEl = document.getElementById('pane-pagomovil');
    var invEl = document.getElementById('pane-inventory');
    var aiEl = document.getElementById('pane-ai');
    var ctrlEl = document.getElementById('pane-control');

    if (!state.appState) {
      state.appState = buildEmptyFallbackState();
    }
    if (!state.aiInsights) {
      state.aiInsights = buildOfflineAiFallback(state.appState);
    }

    if (liveEl) renderLiveTab(liveEl);
    if (pmEl) renderPagoMovilTab(pmEl);
    if (invEl) renderInventoryTab(invEl);
    if (aiEl) renderAiTab(aiEl);
    if (ctrlEl) renderControlTab(ctrlEl);
  }

  function renderActiveTab() {
    var pane = document.getElementById('pane-' + state.activeTab);
    if (!pane) {
      renderAllTabs();
      return;
    }
    if (!state.appState) state.appState = buildEmptyFallbackState();
    if (!state.aiInsights) state.aiInsights = buildOfflineAiFallback(state.appState);

    if (state.activeTab === 'live') renderLiveTab(pane);
    else if (state.activeTab === 'pagomovil') renderPagoMovilTab(pane);
    else if (state.activeTab === 'inventory') renderInventoryTab(pane);
    else if (state.activeTab === 'ai') renderAiTab(pane);
    else if (state.activeTab === 'control') renderControlTab(pane);
  }

  function renderLiveTab(root) {
    var sum = computePeriodSummary(state.livePeriod);
    var pmPending = extractPagoMovilList().filter(function (p) { return p.verifyStatus === 'PENDIENTE'; });
    var aiSum = (state.aiInsights && state.aiInsights.summary) ? state.aiInsights.summary : null;

    var periodBtns = ['TODAY', 'WEEK', 'MONTH'].map(function (p) {
      var lbl = p === 'TODAY' ? 'Hoy' : (p === 'WEEK' ? '7 Días' : 'Este Mes');
      return '<button type="button" class="chip-btn ' + (state.livePeriod === p ? 'active' : '') + '" data-period="' + p + '">' + lbl + '</button>';
    }).join('');

    var offlineHtml = '';
    if (!state.serverOnline) {
      offlineHtml = '<div class="offline-banner">' +
        '<div><strong>Sin conexión al servidor</strong><div style="font-size:11.5px;opacity:0.88">Conecta tu VPS para ver ventas y alertas en tiempo real.</div></div>' +
        '<button type="button" id="liveSetupVpsBtn" class="m-btn m-btn-navy m-btn-sm">Configurar VPS</button>' +
      '</div>';
    }

    var alertsHtml = '';
    if (state.liveAlerts.length > 0) {
      alertsHtml = '<div class="m-card"><div class="m-card-hd"><h2>Actividad en Vivo</h2><span class="pill pill-green">En línea</span></div>' +
        state.liveAlerts.slice(0, 4).map(function (a) {
          var tStr = new Date(a.ts).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
          return '<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)"><strong>' + tStr + '</strong> · ' + esc(a.text) + '</div>';
        }).join('') + '</div>';
    }

    var salesHtml = sum.recentSales.length
      ? sum.recentSales.map(function (s) {
          var t = s.createdAt ? new Date(s.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
          var itemsDesc = (s.items || []).map(function (it) { return (it.qty || 1) + 'x ' + it.name; }).join(', ');
          var payDesc = (s.payments || []).map(function (p) { return p.method; }).join(' + ');
          return '<div class="list-item">' +
            '<div class="list-item-row">' +
              '<div><strong>Orden #' + esc(s.orderNumber) + '</strong> <span style="color:var(--txt-3);font-size:12px">' + t + '</span>' +
              '<div style="font-size:13px;color:var(--txt-2);margin-top:2px">' + esc(itemsDesc || s.customer) + '</div>' +
              '<div style="font-size:12px;color:var(--txt-3);margin-top:3px">' + esc(payDesc) + '</div></div>' +
              '<div style="text-align:right"><strong class="tabular-nums" style="color:var(--emerald-dark)">' + fmtUsd(s.totalUsd) + '</strong>' +
              '<div class="tabular-nums" style="font-size:12px;color:var(--txt-3)">' + fmtBs(s.totalBs || s.totalUsd * sum.bcv) + '</div></div>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="list-item" style="text-align:center;color:var(--txt-3)">Sin ventas registradas en este periodo.</div>';

    root.innerHTML =
      '<div class="sec-head"><div><h2 class="sec-head-title">Mi Día</h2><p class="sec-head-sub">Resumen en tiempo real de tu negocio</p></div><span class="pill pill-blue tabular-nums">' + sum.orders + ' órdenes</span></div>' +
      offlineHtml +
      '<div class="filter-row" id="livePeriodBar">' + periodBtns + '</div>' +
      '<div class="kpi-grid">' +
        '<div class="kpi-card tone-green"><div class="kpi-tag">Vendido</div><div class="kpi-val tabular-nums">' + fmtUsd(sum.totalUsd) + '</div><div class="kpi-sub tabular-nums">' + fmtBs(sum.totalBs) + '</div></div>' +
        '<div class="kpi-card tone-blue"><div class="kpi-tag">Gaveta USD / Bs</div><div class="kpi-val tabular-nums">' + fmtUsd(sum.cashUsd) + '</div><div class="kpi-sub tabular-nums">' + fmtBs(sum.cashBs) + '</div></div>' +
        '<div class="kpi-card tone-amber"><div class="kpi-tag">Pago Móvil Pend.</div><div class="kpi-val tabular-nums">' + pmPending.length + '</div><div class="kpi-sub">' + (pmPending.length ? 'Desliza a la derecha' : 'Todo verificado') + '</div></div>' +
        '<div class="kpi-card tone-red"><div class="kpi-tag">Salud IA / Gastos</div><div class="kpi-val tabular-nums">' + (aiSum ? (aiSum.healthScore + '/100') : fmtUsd(sum.expUsd)) + '</div><div class="kpi-sub tabular-nums">Gastos: ' + fmtUsd(sum.expUsd) + '</div></div>' +
      '</div>' +
      '<div class="quick-actions-row">' +
        '<button type="button" id="quickAddProdBtn" class="quick-tile"><span class="quick-tile-ico" style="background:var(--emerald-soft);color:var(--emerald-txt)">+</span><span>Nuevo Producto</span></button>' +
        '<button type="button" id="quickVerifyPmBtn" class="quick-tile"><span class="quick-tile-ico" style="background:var(--amber-soft);color:var(--amber-txt)">' + pmPending.length + '</span><span>Verificar Pagos</span></button>' +
      '</div>' +
      alertsHtml +
      '<div class="m-card"><div class="m-card-hd"><h2>Últimas Ventas</h2><span class="pill pill-blue">' + sum.orders + '</span></div>' + salesHtml + '</div>';

    var vpsBtn = document.getElementById('liveSetupVpsBtn');
    if (vpsBtn) vpsBtn.addEventListener('click', openServerSettingsSheet);

    var qAdd = document.getElementById('quickAddProdBtn');
    if (qAdd) qAdd.addEventListener('click', function () { openProductSheet(null); });

    var qPm = document.getElementById('quickVerifyPmBtn');
    if (qPm) qPm.addEventListener('click', function () { switchTab('pagomovil', true); });

    root.querySelectorAll('#livePeriodBar .chip-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.livePeriod = btn.getAttribute('data-period');
        renderLiveTab(root);
      });
    });
  }

  function renderPagoMovilTab(root) {
    var all = extractPagoMovilList();
    var filtered = all.filter(function (r) {
      return state.pmFilter === 'ALL' ? true : r.verifyStatus === state.pmFilter;
    });

    var filters = [
      { id: 'PENDIENTE', lbl: '⏳ Pendientes' },
      { id: 'CONCILIADO', lbl: '✔ Verificados' },
      { id: 'RECHAZADO', lbl: '⚠ Observados' },
      { id: 'ALL', lbl: 'Todos' }
    ].map(function (f) {
      return '<button type="button" class="chip-btn ' + (state.pmFilter === f.id ? 'active' : '') + '" data-pmf="' + f.id + '">' + f.lbl + '</button>';
    }).join('');

    var cardsHtml = filtered.length
      ? filtered.map(function (r, idx) {
          var badge = r.verifyStatus === 'CONCILIADO'
            ? '<span class="pill pill-green">✔ Confirmado</span>'
            : (r.verifyStatus === 'RECHAZADO'
              ? '<span class="pill pill-red">⚠ Observado</span>'
              : '<span class="pill pill-amber">⏳ Por Verificar</span>');
          var tStr = r.createdAt ? new Date(r.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '';
          return '<div class="list-item">' +
            '<div class="list-item-row">' +
              '<div><strong>Orden #' + esc(r.orderNumber) + '</strong> · Ref <code>#' + esc(r.ref) + '</code>' +
              '<div style="font-size:12.5px;color:var(--txt-2)">' + esc(r.customer) + ' · ' + tStr + '</div>' +
              '<div style="font-size:12px;color:var(--txt-3);margin-top:3px">' + esc(r.bank) + ' · Tel ' + esc(r.phone) + '</div>' +
              '<div style="font-size:12px;color:var(--blue-txt);font-weight:600">Destino: ' + esc(r.destAccount) + '</div></div>' +
              '<div style="text-align:right">' + badge +
              '<div class="tabular-nums" style="font-size:17px;font-weight:800;margin-top:6px">' + fmtBs(r.amountBs) + '</div>' +
              '<div class="tabular-nums" style="font-size:12px;color:var(--txt-3)">' + fmtUsd(r.amountUsd) + '</div></div>' +
            '</div>' +
            '<div class="action-row">' +
              (r.verifyStatus !== 'CONCILIADO' ? '<button type="button" class="m-btn m-btn-primary m-btn-sm" data-pm-action="CONCILIADO" data-idx="' + idx + '" style="flex:1">✔ Confirmar en Banco</button>' : '') +
              (r.verifyStatus !== 'RECHAZADO' ? '<button type="button" class="m-btn m-btn-danger m-btn-sm" data-pm-action="RECHAZADO" data-idx="' + idx + '">⚠ Observar</button>' : '') +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="m-card" style="text-align:center;color:var(--txt-3)">No hay Pagos Móviles en este filtro.</div>';

    var pendingCount = all.filter(function (x) { return x.verifyStatus === 'PENDIENTE'; }).length;
    root.innerHTML =
      '<div class="sec-head">' +
        '<div><h2 class="sec-head-title">Pago Móvil</h2><p class="sec-head-sub">Verificación bancaria y referencias</p></div>' +
        '<span class="pill ' + (pendingCount > 0 ? 'pill-amber' : 'pill-green') + '">' + pendingCount + ' pendientes</span>' +
      '</div>' +
      (!state.serverOnline ? '<div class="offline-banner"><span><strong>Sin conexión al VPS.</strong> Al conectar se mostrarán referencias reales.</span><button type="button" class="m-btn m-btn-amber m-btn-sm" id="pmCfgSrvBtn">Conectar</button></div>' : '') +
      '<div class="filter-row" id="pmFilterBar">' + filters + '</div>' +
      cardsHtml;

    var pmCfg = document.getElementById('pmCfgSrvBtn');
    if (pmCfg) pmCfg.addEventListener('click', openServerSettingsSheet);

    root.querySelectorAll('#pmFilterBar .chip-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pmFilter = b.getAttribute('data-pmf');
        renderActiveTab();
      });
    });

    root.querySelectorAll('[data-pm-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-idx'));
        var newStatus = btn.getAttribute('data-pm-action');
        var item = filtered[idx];
        if (!item) return;
        btn.disabled = true;
        vibrateLight();
        emitServerEvent('PAGO_MOVIL_STATUS_CHANGED', {
          saleId: item.saleId,
          paymentId: item.paymentId,
          paymentRef: item.ref,
          newStatus: newStatus,
          reason: newStatus === 'CONCILIADO' ? 'Confirmado en banco desde App Móvil Admin' : 'Marcado para revisión desde App Móvil'
        }).then(function () {
          showToast(newStatus === 'CONCILIADO' ? 'Pago Móvil confirmado en PC y Móvil' : 'Pago Móvil marcado para revisión');
          return refreshAllData(true);
        }).catch(function (err) {
          btn.disabled = false;
          showToast('Error: ' + err.message);
        });
      });
    });
  }

  function renderInventoryTab(root) {
    var st = state.appState || {};
    var inv = Array.isArray(st.inventory) ? st.inventory : [];
    var bcv = Number((st.settings && st.settings.rateBcv) || 42.85);
    var q = state.invSearch.toLowerCase().trim();

    var filtered = inv.filter(function (it) {
      if (!it) return false;
      var isLow = Number(it.stock || 0) <= Number(it.minStock || 5);
      var isSell = it.sellable === true || it.type === 'venta';
      if (state.invFilter === 'LOW' && !isLow) return false;
      if (state.invFilter === 'VENTA' && !isSell) return false;
      if (state.invFilter === 'INSUMO' && isSell) return false;
      if (q) {
        var hay = (String(it.name || '') + ' ' + String(it.code || '') + ' ' + String(it.barcode || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var filters = [
      { id: 'ALL', lbl: 'Todos (' + inv.length + ')' },
      { id: 'LOW', lbl: '🚨 Stock Bajo' },
      { id: 'VENTA', lbl: '🛒 Bodega / Venta' },
      { id: 'INSUMO', lbl: '🥘 Cocina' }
    ].map(function (f) {
      return '<button type="button" class="chip-btn ' + (state.invFilter === f.id ? 'active' : '') + '" data-invf="' + f.id + '">' + f.lbl + '</button>';
    }).join('');

    var cardsHtml = filtered.slice(0, 60).map(function (it) {
      var stock = Number(it.stock || 0);
      var minS = Number(it.minStock || 5);
      var pillClass = stock <= 0 ? 'pill-red' : (stock <= minS ? 'pill-amber' : 'pill-green');
      var pillText = stock <= 0 ? 'AGOTADO' : (stock <= minS ? 'CRÍTICO' : 'OK');
      var isSell = it.sellable === true || it.type === 'venta';
      return '<div class="list-item">' +
        '<div class="list-item-row">' +
          '<div><strong>' + esc(it.name) + '</strong>' +
          '<div style="font-size:12px;color:var(--txt-3)">' + (isSell ? '🛒 Venta' : '🥘 Insumo Cocina') + (it.code ? ' · Cód ' + esc(it.code) : '') + ' · ' + (it.iva === 'E' ? 'Exento' : 'IVA 16%') + '</div>' +
          '<div class="tabular-nums" style="font-size:13px;color:var(--txt-2);margin-top:4px">Stock: <strong>' + stock + ' ' + esc(it.unit || 'und') + '</strong> <span style="color:var(--txt-3)">(mín ' + minS + ')</span></div></div>' +
          '<div style="text-align:right">' +
            '<span class="pill ' + pillClass + '">' + pillText + '</span>' +
            (isSell ? '<div class="tabular-nums" style="font-size:16px;font-weight:800;margin-top:5px">' + fmtUsd(it.priceUsd || 0) + '</div><div class="tabular-nums" style="font-size:11.5px;color:var(--txt-3)">' + fmtBs((it.priceUsd || 0) * bcv) + '</div>' : '<div class="tabular-nums" style="font-size:13px;color:var(--txt-2);margin-top:5px">Costo: ' + fmtUsd(it.costUsd || 0) + '</div>') +
          '</div>' +
        '</div>' +
        '<div class="action-row">' +
          '<button type="button" class="m-btn m-btn-secondary m-btn-sm" data-stock-id="' + esc(it.id) + '" style="flex:1">± Reponer / Stock</button>' +
          '<button type="button" class="m-btn m-btn-secondary m-btn-sm" data-edit-id="' + esc(it.id) + '" style="flex:1">✎ Costo y Precio</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var lowCount = inv.filter(function (it) { return it && Number(it.stock || 0) <= Number(it.minStock || 5); }).length;
    root.innerHTML =
      '<div class="sec-head">' +
        '<div><h2 class="sec-head-title">Inventario</h2><p class="sec-head-sub">Cocina y mercancía de venta directa</p></div>' +
        '<span class="pill ' + (lowCount > 0 ? 'pill-amber' : 'pill-green') + '">' + (lowCount > 0 ? lowCount + ' bajos' : inv.length + ' items') + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
        '<input type="search" id="invSearchInput" class="m-input" value="' + esc(state.invSearch) + '" placeholder="Buscar producto, código o barra..." style="flex:1">' +
        '<button type="button" id="addNewProdBtn" class="m-btn m-btn-primary m-btn-sm" style="white-space:nowrap">+ Producto</button>' +
      '</div>' +
      '<div class="filter-row" id="invFilterBar">' + filters + '</div>' +
      '<div id="invCardsWrap">' + (cardsHtml || '<div class="m-card" style="text-align:center;color:var(--txt-3)">Sin artículos coincidentes.</div>') + '</div>';

    var sInput = document.getElementById('invSearchInput');
    if (sInput) {
      sInput.addEventListener('input', function () {
        state.invSearch = sInput.value;
        renderInventoryCardsOnly(root);
      });
    }

    var addBtn = document.getElementById('addNewProdBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openProductSheet(null);
      });
    }

    root.querySelectorAll('#invFilterBar .chip-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.invFilter = b.getAttribute('data-invf');
        renderInventoryTab(root);
      });
    });

    wireInventoryItemButtons(root);
  }

  function renderInventoryCardsOnly(rootEl) {
    var root = rootEl || document.getElementById('pane-inventory');
    if (!root) return;
    var wrap = document.getElementById('invCardsWrap');
    if (!wrap) {
      renderInventoryTab(root);
      return;
    }
    var st = state.appState || {};
    var inv = Array.isArray(st.inventory) ? st.inventory : [];
    var bcv = Number((st.settings && st.settings.rateBcv) || 42.85);
    var q = state.invSearch.toLowerCase().trim();
    var filtered = inv.filter(function (it) {
      if (!it) return false;
      var isLow = Number(it.stock || 0) <= Number(it.minStock || 5);
      var isSell = it.sellable === true || it.type === 'venta';
      if (state.invFilter === 'LOW' && !isLow) return false;
      if (state.invFilter === 'VENTA' && !isSell) return false;
      if (state.invFilter === 'INSUMO' && isSell) return false;
      if (q) {
        var hay = (String(it.name || '') + ' ' + String(it.code || '') + ' ' + String(it.barcode || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var cardsHtml = filtered.slice(0, 60).map(function (it) {
      var stock = Number(it.stock || 0);
      var minS = Number(it.minStock || 5);
      var pillClass = stock <= 0 ? 'pill-red' : (stock <= minS ? 'pill-amber' : 'pill-green');
      var pillText = stock <= 0 ? 'AGOTADO' : (stock <= minS ? 'CRÍTICO' : 'OK');
      var isSell = it.sellable === true || it.type === 'venta';
      return '<div class="list-item">' +
        '<div class="list-item-row">' +
          '<div><strong>' + esc(it.name) + '</strong>' +
          '<div style="font-size:12px;color:var(--txt-3)">' + (isSell ? 'Venta' : 'Insumo Cocina') + (it.code ? ' · Cód ' + esc(it.code) : '') + ' · ' + (it.iva === 'E' ? 'Exento' : 'IVA 16%') + '</div>' +
          '<div class="tabular-nums" style="font-size:13px;color:var(--txt-2);margin-top:4px">Stock: <strong>' + stock + ' ' + esc(it.unit || 'und') + '</strong> <span style="color:var(--txt-3)">(mín ' + minS + ')</span></div></div>' +
          '<div style="text-align:right">' +
            '<span class="pill ' + pillClass + '">' + pillText + '</span>' +
            (isSell ? '<div class="tabular-nums" style="font-size:16px;font-weight:800;margin-top:5px">' + fmtUsd(it.priceUsd || 0) + '</div><div class="tabular-nums" style="font-size:11.5px;color:var(--txt-3)">' + fmtBs((it.priceUsd || 0) * bcv) + '</div>' : '<div class="tabular-nums" style="font-size:13px;color:var(--txt-2);margin-top:5px">Costo: ' + fmtUsd(it.costUsd || 0) + '</div>') +
          '</div>' +
        '</div>' +
        '<div class="action-row">' +
          '<button type="button" class="m-btn m-btn-secondary m-btn-sm" data-stock-id="' + esc(it.id) + '" style="flex:1">± Reponer / Stock</button>' +
          '<button type="button" class="m-btn m-btn-secondary m-btn-sm" data-edit-id="' + esc(it.id) + '" style="flex:1">Costo y Precio</button>' +
        '</div>' +
      '</div>';
    }).join('');
    wrap.innerHTML = cardsHtml || '<div class="m-card" style="text-align:center;color:var(--txt-3)">Sin artículos coincidentes.</div>';
    wireInventoryItemButtons(wrap);
  }

  function wireInventoryItemButtons(root) {
    var inv = (state.appState && state.appState.inventory) ? state.appState.inventory : [];
    root.querySelectorAll('[data-stock-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-stock-id');
        var item = inv.find(function (x) { return x && x.id === id; });
        if (item) openStockAdjustSheet(item);
      });
    });
    root.querySelectorAll('[data-edit-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-edit-id');
        var item = inv.find(function (x) { return x && x.id === id; });
        if (item) openProductSheet(item);
      });
    });
  }

  function openStockAdjustSheet(item) {
    var body =
      '<p style="margin:0 0 12px;color:var(--txt-2)">Stock actual: <strong>' + Number(item.stock || 0) + ' ' + esc(item.unit || 'und') + '</strong></p>' +
      '<div class="field-group"><label class="field-label">¿Qué quieres hacer?</label>' +
      '<select id="stkMode" class="m-select"><option value="ADD">➕ Sumar entrada / reposición</option><option value="SET">📋 Fijar conteo físico exacto</option></select></div>' +
      '<div class="field-group"><label class="field-label">Cantidad (' + esc(item.unit || 'und') + ')</label>' +
      '<input id="stkQty" type="number" step="0.01" inputmode="decimal" class="m-input" placeholder="Ej: 12"></div>' +
      '<div class="field-group"><label class="field-label">Motivo</label>' +
      '<input id="stkReason" type="text" class="m-input" value="Reposición / ajuste desde App Móvil"></div>' +
      '<button type="button" id="stkSaveBtn" class="m-btn m-btn-primary m-btn-block">Guardar en Inventario</button>';

    openSheet('Stock · ' + item.name, body);
    document.getElementById('stkSaveBtn').addEventListener('click', function () {
      var mode = document.getElementById('stkMode').value;
      var q = parseFloat(document.getElementById('stkQty').value);
      var reason = document.getElementById('stkReason').value.trim();
      if (isNaN(q) || q < 0) {
        showToast('Ingresa una cantidad válida');
        return;
      }
      var cur = Number(item.stock || 0);
      var newStock = mode === 'ADD' ? Number((cur + q).toFixed(3)) : Number(q.toFixed(3));
      emitServerEvent('STOCK_ADJUSTED', {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit || 'und',
        newStock: newStock,
        difference: Number((newStock - cur).toFixed(3)),
        action: mode === 'ADD' ? 'ENTRADA_MOVIL' : 'AUDITORIA_MOVIL',
        reason: reason
      }).then(function () {
        closeSheet();
        vibrateLight();
        showToast('Stock actualizado a ' + newStock + ' ' + (item.unit || 'und'));
        refreshAllData(true);
      }).catch(function (err) {
        showToast('Error: ' + err.message);
      });
    });
  }

  function openProductSheet(existingItem) {
    var isEdit = Boolean(existingItem);
    var bcv = Number((state.appState && state.appState.settings && state.appState.settings.rateBcv) || 42.85);
    var it = existingItem || {
      id: 'prod-mob-' + Date.now(),
      type: 'venta',
      sellable: true,
      familyId: 'viveres',
      unit: 'und',
      iva: 'E',
      stock: 0,
      minStock: 5,
      costUsd: 0,
      priceUsd: 0
    };

    var famOpts = DEFAULT_FAMILIES.map(function (f) {
      return '<option value="' + f.id + '" ' + (it.familyId === f.id ? 'selected' : '') + '>' + f.emoji + ' ' + f.name + '</option>';
    }).join('');

    var body =
      '<div class="field-group"><label class="field-label">Tipo de Artículo</label>' +
      '<select id="pType" class="m-select"><option value="venta" ' + (it.type !== 'insumo' ? 'selected' : '') + '>🛒 Mercancía de Venta Directa</option><option value="insumo" ' + (it.type === 'insumo' ? 'selected' : '') + '>🥘 Ingrediente Exclusivo de Cocina</option></select></div>' +
      '<div class="field-group"><label class="field-label">Nombre del Producto</label><input id="pName" type="text" class="m-input" value="' + esc(it.name || '') + '" placeholder="Ej: Harina P.A.N. Blanca 1Kg"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div class="field-group"><label class="field-label">Código / SKU</label><input id="pCode" type="text" class="m-input" value="' + esc(it.code || '') + '" placeholder="Ej: VIV05"></div>' +
        '<div class="field-group"><label class="field-label">Código de Barras</label><input id="pBarcode" type="text" inputmode="numeric" class="m-input" value="' + esc(it.barcode || '') + '" placeholder="759..."></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div class="field-group"><label class="field-label">Familia</label><select id="pFamily" class="m-select">' + famOpts + '</select></div>' +
        '<div class="field-group"><label class="field-label">Impuesto IVA</label><select id="pIva" class="m-select"><option value="G16" ' + (it.iva !== 'E' ? 'selected' : '') + '>+16% IVA General</option><option value="E" ' + (it.iva === 'E' ? 'selected' : '') + '>Exento (0%)</option></select></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div class="field-group"><label class="field-label">Costo USD ($)</label><input id="pCost" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(it.costUsd || 0).toFixed(2) + '"></div>' +
        '<div class="field-group"><label class="field-label">Precio Venta USD ($)</label><input id="pPrice" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(it.priceUsd || 0).toFixed(2) + '"></div>' +
      '</div>' +
      '<div id="pPreviewHint" style="font-size:12.5px;font-weight:700;color:var(--emerald-txt);margin-bottom:10px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div class="field-group"><label class="field-label">Stock</label><input id="pStock" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(it.stock || 0) + '"></div>' +
        '<div class="field-group"><label class="field-label">Mínimo</label><input id="pMin" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(it.minStock || 5) + '"></div>' +
        '<div class="field-group"><label class="field-label">Unidad</label><select id="pUnit" class="m-select"><option value="und" ' + (it.unit === 'und' ? 'selected' : '') + '>und</option><option value="kg" ' + (it.unit === 'kg' ? 'selected' : '') + '>kg</option><option value="L" ' + (it.unit === 'L' ? 'selected' : '') + '>L</option></select></div>' +
      '</div>' +
      '<button type="button" id="pSaveBtn" class="m-btn m-btn-primary m-btn-block">' + (isEdit ? 'Guardar Cambios' : 'Crear Producto en Inventario') + '</button>';

    openSheet(isEdit ? ('Editar · ' + it.name) : 'Nuevo Producto / Insumo', body);

    function updatePreview() {
      var c = parseFloat(document.getElementById('pCost').value) || 0;
      var p = parseFloat(document.getElementById('pPrice').value) || 0;
      var m = p > 0 ? (((p - c) / p) * 100).toFixed(1) : '0.0';
      document.getElementById('pPreviewHint').textContent = 'Equivale a ' + fmtBs(p * bcv) + ' · Margen comercial: ' + m + '%';
    }
    document.getElementById('pCost').addEventListener('input', updatePreview);
    document.getElementById('pPrice').addEventListener('input', updatePreview);
    updatePreview();

    document.getElementById('pSaveBtn').addEventListener('click', function () {
      var name = document.getElementById('pName').value.trim();
      if (!name) {
        showToast('Escribe el nombre del producto');
        return;
      }
      var pType = document.getElementById('pType').value;
      var ivaVal = document.getElementById('pIva').value;
      var savedObj = Object.assign({}, it, {
        id: it.id,
        kind: 'retail',
        type: pType,
        sellable: pType === 'venta',
        name: name,
        code: document.getElementById('pCode').value.trim(),
        barcode: document.getElementById('pBarcode').value.trim(),
        familyId: document.getElementById('pFamily').value,
        iva: ivaVal,
        taxExempt: ivaVal === 'E',
        costUsd: Number((parseFloat(document.getElementById('pCost').value) || 0).toFixed(2)),
        priceUsd: Number((parseFloat(document.getElementById('pPrice').value) || 0).toFixed(2)),
        stock: Number((parseFloat(document.getElementById('pStock').value) || 0).toFixed(3)),
        minStock: Number((parseFloat(document.getElementById('pMin').value) || 5).toFixed(3)),
        unit: document.getElementById('pUnit').value
      });

      emitServerEvent('ITEM_SAVED', { item: savedObj }).then(function () {
        closeSheet();
        vibrateLight();
        showToast(isEdit ? 'Producto actualizado' : 'Producto agregado al inventario');
        refreshAllData(true);
      }).catch(function (err) {
        showToast('Error: ' + err.message);
      });
    });
  }

  function renderAiTab(root) {
    var ins = state.aiInsights;
    if (!ins || !ins.summary) {
      root.innerHTML = '<div class="m-card"><p style="margin:0;color:var(--txt-3)">Analizando costos, precios e inventario con IA...</p></div>';
      return;
    }
    var sum = ins.summary;
    var ih = ins.inventoryHealth || {};
    var crit = ih.criticalItems || [];
    var fallStk = ih.fallingStockItems || [];
    var fallDem = ins.fallingProducts || [];
    var prices = ins.pricingSuggestions || [];

    var recsHtml = (ins.recommendations || []).map(function (r) {
      var cls = r.severity === 'danger' ? 'pill-red' : (r.severity === 'warn' ? 'pill-amber' : (r.severity === 'ok' ? 'pill-green' : 'pill-blue'));
      return '<div class="list-item"><span class="pill ' + cls + '">' + esc(r.tag) + '</span>' +
        '<div style="font-weight:800;margin-top:6px">' + esc(r.title) + '</div>' +
        '<div style="font-size:13px;color:var(--txt-2);margin-top:3px">' + esc(r.detail) + '</div></div>';
    }).join('');

    var pricesHtml = prices.length
      ? prices.slice(0, 12).map(function (p, idx) {
          var prioCls = p.priority === 'URGENTE' ? 'pill-red' : (p.priority === 'AJUSTAR' ? 'pill-amber' : 'pill-blue');
          return '<div class="list-item">' +
            '<div class="list-item-row">' +
              '<div><span class="pill ' + prioCls + '">' + esc(p.priority) + '</span> <strong>' + esc(p.name) + '</strong>' +
              '<div style="font-size:12px;color:var(--txt-3);margin-top:4px">Costo: ' + fmtUsd(p.costUsd) + ' · Reposición brecha: ' + fmtUsd(p.replacementCostUsd) + '</div>' +
              '<div style="font-size:12.5px;color:var(--txt-2);margin-top:3px">' + esc(p.reason) + '</div></div>' +
              '<div style="text-align:right;white-space:nowrap">' +
                '<div style="font-size:12px;color:var(--txt-3)">Actual ' + fmtUsd(p.currentPriceUsd) + '</div>' +
                '<div class="tabular-nums" style="font-size:17px;font-weight:900;color:var(--emerald-dark)">→ ' + fmtUsd(p.recommendedPriceUsd) + '</div>' +
                '<div class="tabular-nums" style="font-size:11.5px;color:var(--txt-3)">' + fmtBs(p.recommendedPriceBs) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="action-row">' +
              '<button type="button" class="m-btn m-btn-primary m-btn-sm m-btn-block" data-apply-price="' + idx + '">Aplicar Mejor Precio (' + fmtUsd(p.recommendedPriceUsd) + ')</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="list-item" style="text-align:center;color:var(--emerald-txt);font-weight:700">Todos tus precios cumplen tu meta de rentabilidad (' + sum.targetMarginPct + '%).</div>';

    var fallingHtml = '';
    if (crit.length || fallStk.length || fallDem.length) {
      fallingHtml = '<div class="m-card"><div class="m-card-hd"><h2>📉 Productos Bajando (Stock y Demanda)</h2><span class="pill pill-amber">' + (crit.length + fallDem.length) + '</span></div>' +
        crit.slice(0, 5).map(function (c) {
          return '<div style="padding:7px 0;border-bottom:1px solid var(--line);font-size:13px"><span class="pill pill-red">' + esc(c.severity) + '</span> <strong>' + esc(c.name) + '</strong> · Quedan ' + c.stock + ' ' + esc(c.unit) + '</div>';
        }).join('') +
        fallStk.slice(0, 4).map(function (fs) {
          return '<div style="padding:7px 0;border-bottom:1px solid var(--line);font-size:13px"><span class="pill pill-amber">BAJANDO</span> <strong>' + esc(fs.name) + '</strong> · ' + esc(fs.reason) + '</div>';
        }).join('') +
        fallDem.slice(0, 4).map(function (fd) {
          return '<div style="padding:7px 0;border-bottom:1px solid var(--line);font-size:13px"><span class="pill pill-blue">VENTAS -' + fd.dropPct + '%</span> <strong>' + esc(fd.name) + '</strong> · ' + esc(fd.reason) + '</div>';
        }).join('') +
      '</div>';
    }

    root.innerHTML =
      '<div class="sec-head">' +
        '<div><h2 class="sec-head-title">Asistente IA</h2><p class="sec-head-sub">Costos, márgenes y reposición</p></div>' +
        '<span class="pill pill-blue">' + sum.healthScore + '/100</span>' +
      '</div>' +
      '<div class="ai-hero">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-size:11.5px;font-weight:700;color:#34D399;letter-spacing:0.04em">ASISTENTE IA DEL NEGOCIO</div><div class="ai-score-big tabular-nums">' + sum.healthScore + '/100</div><div style="font-weight:700;color:#F8FAFC">' + esc(sum.statusLabel) + '</div></div>' +
          '<div style="text-align:right;font-size:12px;color:#CBD5E1"><div>BCV: <strong style="color:#fff">' + sum.bcv.toFixed(2) + '</strong></div><div>USDT: <strong style="color:#fff">' + sum.usdt.toFixed(2) + '</strong></div><div>Brecha: <strong style="color:#fff">' + sum.gapPct + '%</strong></div></div>' +
        '</div>' +
        '<div style="font-size:13px;color:#E2E8F0;margin-top:8px">' + esc(sum.headline) + '</div>' +
      '</div>' +
      '<div class="m-card">' +
        '<div class="m-card-hd"><h2>💬 Pregúntale a la IA</h2></div>' +
        '<div style="display:flex;gap:8px">' +
          '<input id="aiAskInput" type="text" class="m-input" placeholder="Ej: ¿Qué precios debo ajustar o cómo está el inventario?">' +
          '<button type="button" id="aiAskBtn" class="m-btn m-btn-blue m-btn-sm">Preguntar</button>' +
        '</div>' +
        '<div class="url-presets" style="margin-top:8px">' +
          '<button type="button" class="chip-btn" data-aiq="¿Cómo está mi inventario?">📦 Inventario</button>' +
          '<button type="button" class="chip-btn" data-aiq="¿Qué precios debo ajustar?">💰 Precios</button>' +
          '<button type="button" class="chip-btn" data-aiq="¿Qué productos están bajando?">📉 Bajando</button>' +
        '</div>' +
        (state.lastAiAnswer ? '<div class="ai-answer-box">' + esc(state.lastAiAnswer) + '</div>' : '') +
      '</div>' +
      '<div class="m-card"><div class="m-card-hd"><h2>🎯 Diagnóstico Prioritario</h2></div>' + recsHtml + '</div>' +
      fallingHtml +
      '<div class="m-card"><div class="m-card-hd"><h2>💡 Mejores Costos y Precios Sugeridos</h2><span class="pill pill-green">' + prices.length + '</span></div>' + pricesHtml + '</div>';

    function askAi(qText) {
      if (!qText || !qText.trim()) return;
      apiFetch('/api/v1/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: qText })
      }).then(function (resp) {
        state.lastAiAnswer = (resp && resp.answer) ? resp.answer : 'Sin respuesta.';
        renderActiveTab();
      }).catch(function (err) {
        showToast('Error IA: ' + err.message);
      });
    }

    var askBtn = document.getElementById('aiAskBtn');
    if (askBtn) {
      askBtn.addEventListener('click', function () {
        askAi(document.getElementById('aiAskInput').value);
      });
    }
    root.querySelectorAll('[data-aiq]').forEach(function (b) {
      b.addEventListener('click', function () {
        askAi(b.getAttribute('data-aiq'));
      });
    });

    root.querySelectorAll('[data-apply-price]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = Number(b.getAttribute('data-apply-price'));
        var sug = prices[idx];
        if (!sug) return;
        b.disabled = true;

        var st = state.appState || {};
        var target = null;
        if (sug.kind === 'variant') {
          target = (st.variants || []).find(function (v) { return v && v.id === sug.id; });
        } else {
          target = (st.inventory || []).find(function (i) { return i && i.id === sug.id; });
        }
        if (!target) {
          showToast('No se encontró el artículo para actualizar');
          b.disabled = false;
          return;
        }
        var updated = Object.assign({}, target, {
          kind: sug.kind === 'variant' ? 'variant' : 'retail',
          priceUsd: Number(sug.recommendedPriceUsd.toFixed(2))
        });
        emitServerEvent('ITEM_SAVED', { item: updated }).then(function () {
          vibrateLight();
          showToast('Precio actualizado: ' + sug.name + ' → ' + fmtUsd(sug.recommendedPriceUsd));
          refreshAllData(true);
        }).catch(function (err) {
          b.disabled = false;
          showToast('Error: ' + err.message);
        });
      });
    });
  }

  function renderControlTab(root) {
    var st = state.appState || {};
    var cfg = st.settings || {};
    var sum = computePeriodSummary('TODAY');
    var isVps = Boolean((state.vpsUrl && state.serverUrl === state.vpsUrl) || String(state.serverUrl || '').indexOf('https://') === 0);
    var connPill = state.serverOnline
      ? (isVps ? '<span class="pill pill-green">VPS Nube</span>' : '<span class="pill pill-blue">Red Local</span>')
      : '<span class="pill pill-amber">Sin conexión</span>';
    var srvLabel = state.serverUrl ? esc(state.serverUrl) : 'No configurado todavía';

    root.innerHTML =
      '<div class="sec-head">' +
        '<div><h2 class="sec-head-title">Control</h2><p class="sec-head-sub">Tasas, gastos rápidos y servidor VPS</p></div>' +
        connPill +
      '</div>' +
      '<div class="m-card">' +
        '<div class="m-card-hd"><h2>📱 Conexión VPS y Respaldo</h2>' + connPill + '</div>' +
        '<div style="font-size:12.5px;color:var(--txt-2);margin-bottom:10px">' + (state.serverOnline ? 'Servidor activo: ' : 'Servidor objetivo: ') + '<code>' + srvLabel + '</code></div>' +
        '<div class="action-row">' +
          '<button type="button" id="editServersBtn" class="m-btn m-btn-primary m-btn-sm" style="flex:1">☁️ Configurar VPS / Red</button>' +
          (state.vpsUrl ? '<button type="button" id="switchVpsBtn" class="m-btn m-btn-secondary m-btn-sm">Usar VPS</button>' : '') +
          (state.lanUrl ? '<button type="button" id="switchLanBtn" class="m-btn m-btn-secondary m-btn-sm">Wi-Fi</button>' : '') +
        '</div>' +
        '<div class="action-row">' +
          '<button type="button" id="testNotifBtn" class="m-btn m-btn-blue m-btn-sm" style="flex:1">🔔 Probar Notificación</button>' +
          '<button type="button" id="logoutBtn" class="m-btn m-btn-danger m-btn-sm" style="flex:1">Bloquear / Salir</button>' +
        '</div>' +
      '</div>' +
      '<div class="m-card">' +
        '<div class="m-card-hd"><h2>💱 Tasas del Día (Sistema y Caja)</h2></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">' +
          '<div><label class="field-label">BCV USD</label><input id="ctrlBcv" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(cfg.rateBcv || 42.85).toFixed(2) + '"></div>' +
          '<div><label class="field-label">Euro BCV</label><input id="ctrlEur" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(cfg.rateEur || 46.60).toFixed(2) + '"></div>' +
          '<div><label class="field-label">USDT</label><input id="ctrlUsdt" type="number" step="0.01" inputmode="decimal" class="m-input" value="' + Number(cfg.rateUsdt || 51.40).toFixed(2) + '"></div>' +
        '</div>' +
        '<button type="button" id="ctrlSaveRatesBtn" class="m-btn m-btn-primary m-btn-block">Guardar Tasas en Todo el Sistema</button>' +
      '</div>' +
      '<div class="m-card">' +
        '<div class="m-card-hd"><h2>💸 Registrar Gasto o Compra Rápida</h2></div>' +
        '<div class="field-group"><label class="field-label">Concepto</label><input id="ctrlExpDesc" type="text" class="m-input" placeholder="Ej: Compra de queso / hielo / pasaje"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div class="field-group"><label class="field-label">Monto USD ($)</label><input id="ctrlExpUsd" type="number" step="0.01" inputmode="decimal" class="m-input" placeholder="0.00"></div>' +
          '<div class="field-group"><label class="field-label">Salió de</label><select id="ctrlExpSrc" class="m-select"><option value="Efectivo USD">Efectivo USD</option><option value="Efectivo Bs">Efectivo Bs</option><option value="Pago Móvil">Pago Móvil</option></select></div>' +
        '</div>' +
        '<button type="button" id="ctrlSaveExpBtn" class="m-btn m-btn-amber m-btn-block">Anotar Salida de Caja</button>' +
      '</div>' +
      '<div class="m-card">' +
        '<div class="m-card-hd"><h2>🧮 Resumen Rápido del Cuadre (Hoy)</h2></div>' +
        '<div style="font-size:13.5px;display:grid;gap:6px">' +
          '<div style="display:flex;justify-content:space-between"><span>Efectivo USD esperado</span><strong class="tabular-nums">' + fmtUsd(sum.cashUsd) + '</strong></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Efectivo Bs esperado</span><strong class="tabular-nums">' + fmtBs(sum.cashBs) + '</strong></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Saldo Pago Móvil</span><strong class="tabular-nums">' + fmtBs(sum.pmBs) + '</strong></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Gastos del día</span><strong class="tabular-nums" style="color:var(--red-txt)">-' + fmtUsd(sum.expUsd) + '</strong></div>' +
        '</div>' +
      '</div>';

    document.getElementById('ctrlSaveRatesBtn').addEventListener('click', function () {
      if (!state.token || !state.serverOnline) { showToast('Conecta tu VPS arriba para guardar en vivo'); return; }
      var rBcv = parseFloat(document.getElementById('ctrlBcv').value);
      var rEur = parseFloat(document.getElementById('ctrlEur').value);
      var rUsdt = parseFloat(document.getElementById('ctrlUsdt').value);
      if (!rBcv || rBcv <= 0) { showToast('Tasa BCV inválida'); return; }
      emitServerEvent('RATE_UPDATED', { rateBcv: rBcv, rateEur: rEur || rBcv * 1.08, rateUsdt: rUsdt || rBcv }).then(function () {
        vibrateLight();
        showToast('Tasas actualizadas en el sistema');
        refreshAllData(true);
      }).catch(function (err) { showToast('Error: ' + err.message); });
    });

    document.getElementById('ctrlSaveExpBtn').addEventListener('click', function () {
      if (!state.token || !state.serverOnline) { showToast('Conecta tu VPS arriba para registrar en vivo'); return; }
      var desc = document.getElementById('ctrlExpDesc').value.trim();
      var usd = parseFloat(document.getElementById('ctrlExpUsd').value);
      var src = document.getElementById('ctrlExpSrc').value;
      if (!desc || !usd || usd <= 0) { showToast('Escribe concepto y monto válido'); return; }
      var bcv = Number(cfg.rateBcv || 42.85);
      emitServerEvent('EXPENSE_CREATED', {
        id: 'exp-mob-' + Date.now(),
        category: 'Operativo / Reposición',
        description: desc,
        paymentSource: src,
        amountUsd: Number(usd.toFixed(2)),
        amountBs: Number((usd * bcv).toFixed(2)),
        responsible: state.user ? state.user.name : 'Administrador',
        createdAt: new Date().toISOString()
      }).then(function () {
        document.getElementById('ctrlExpDesc').value = '';
        document.getElementById('ctrlExpUsd').value = '';
        vibrateLight();
        showToast('Gasto registrado en caja');
        refreshAllData(true);
      }).catch(function (err) { showToast('Error: ' + err.message); });
    });

    var vpsB = document.getElementById('switchVpsBtn');
    if (vpsB) vpsB.addEventListener('click', function () {
      state.serverUrl = state.vpsUrl;
      saveStoredConfig();
      startSse();
      refreshAllData(false);
    });
    var lanB = document.getElementById('switchLanBtn');
    if (lanB) lanB.addEventListener('click', function () {
      state.serverUrl = state.lanUrl;
      saveStoredConfig();
      startSse();
      refreshAllData(false);
    });
    var editSrvB = document.getElementById('editServersBtn');
    if (editSrvB) editSrvB.addEventListener('click', function () {
      openServerSettingsSheet();
    });
    document.getElementById('testNotifBtn').addEventListener('click', function () {
      if (window.AndroidBridge && typeof window.AndroidBridge.showTestNotification === 'function') {
        window.AndroidBridge.showTestNotification('📲 MI TIENDA ADMIN', 'Las notificaciones en segundo plano están activas y conectadas.');
        showToast('Notificación Android enviada');
      } else {
        showToast('En Android verás esta alerta en la barra superior');
      }
    });
    document.getElementById('logoutBtn').addEventListener('click', function () {
      apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(function () {});
      state.token = '';
      state.user = null;
      saveStoredConfig();
      stopSse();
      if (window.AndroidBridge && typeof window.AndroidBridge.stopAlerts === 'function') {
        try { window.AndroidBridge.stopAlerts(); } catch (e) {}
      }
      showLoginScreen('');
    });
  }

  /* ========================================================================
     BOTTOM SHEET, CONEXIÓN VPS/LOCAL & NAVEGACIÓN
     ======================================================================== */
  function openSheet(title, htmlBody) {
    document.getElementById('sheetTitle').textContent = title;
    document.getElementById('sheetBody').innerHTML = htmlBody;
    document.getElementById('sheetBackdrop').classList.add('open');
  }

  function closeSheet() {
    document.getElementById('sheetBackdrop').classList.remove('open');
  }

  function updateLoginConnPill(status, labelText) {
    var dot = document.getElementById('loginConnDot');
    var lbl = document.getElementById('loginConnLabel');
    if (dot) {
      dot.className = 'conn-dot' + (status === 'checking' ? ' checking' : (status === 'offline' ? ' offline' : ''));
    }
    if (lbl) lbl.textContent = labelText;
  }

  function probeUrl(urlStr, timeoutMs) {
    if (!urlStr) return Promise.resolve({ ok: false });
    var clean = String(urlStr).trim().replace(/\/+$/, '');
    return new Promise(function (resolve) {
      var done = false;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          if (ctrl) { try { ctrl.abort(); } catch (e) {} }
          resolve({ ok: false, url: clean });
        }
      }, timeoutMs || 2600);

      fetch(clean + '/api/v1/status?_t=' + Date.now(), ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve({ ok: Boolean(d && d.ok), url: clean, data: d });
          }
        })
        .catch(function () {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve({ ok: false, url: clean });
          }
        });
    });
  }

  function probeBestServer() {
    updateLoginConnPill('checking', 'Conectando con la tienda...');
    var candidates = [];
    [state.vpsUrl, state.remoteUrl, state.serverUrl, state.lanUrl, 'http://192.168.137.1:7070', 'http://192.168.1.11:7070'].forEach(function (u) {
      var clean = String(u || '').trim().replace(/\/+$/, '');
      if (clean && candidates.indexOf(clean) === -1) candidates.push(clean);
    });

    var idx = 0;
    function tryNext() {
      if (idx >= candidates.length) {
        updateLoginConnPill('offline', 'Sin conexión · Toca para configurar');
        return Promise.resolve({ ok: false });
      }
      var target = candidates[idx++];
      return probeUrl(target, 2200).then(function (res) {
        if (res.ok) {
          state.serverUrl = res.url;
          saveStoredConfig();
          var isVps = (state.vpsUrl && res.url === state.vpsUrl) || res.url.indexOf('https://') === 0;
          updateLoginConnPill('online', isVps ? 'Conectado · VPS Nube' : 'Conectado · Red de Tienda');
          return res;
        }
        return tryNext();
      });
    }
    return tryNext();
  }

  function openServerSettingsSheet() {
    var body =
      '<p style="margin:0 0 12px;font-size:13px;color:var(--txt-2)">Tu base de datos principal vive en el <strong>VPS</strong>. Si falla internet, la app usa automáticamente la PC de la tienda.</p>' +
      '<div class="field-group"><label class="field-label" for="cfgSrvVps">☁️ URL Principal del VPS (HTTPS recomendado)</label>' +
      '<input id="cfgSrvVps" type="url" class="m-input" value="' + esc(state.vpsUrl || '') + '" placeholder="Ej: https://pos.tudominio.com" autocomplete="off"></div>' +
      '<div class="field-group"><label class="field-label" for="cfgSrvLan">📶 Respaldo Wi-Fi / Hotspot en Tienda</label>' +
      '<input id="cfgSrvLan" type="url" class="m-input" value="' + esc(state.lanUrl || 'http://192.168.137.1:7070') + '" placeholder="http://192.168.137.1:7070" autocomplete="off"></div>' +
      '<div class="field-group"><label class="field-label" for="cfgSrvUser">👤 Usuario (opcional — automático por defecto)</label>' +
      '<input id="cfgSrvUser" type="text" class="m-input" value="' + esc(state.username || '') + '" placeholder="Automático (Dueño / Admin)" autocapitalize="none"></div>' +
      '<div id="cfgSrvFeedback" style="font-size:12.5px;min-height:18px;margin-bottom:10px;color:var(--txt-2)"></div>' +
      '<button type="button" id="cfgSrvSaveBtn" class="m-btn m-btn-primary m-btn-block">🔌 Probar y Guardar</button>';

    openSheet('Conexión VPS y Red Local', body);

    document.getElementById('cfgSrvSaveBtn').addEventListener('click', function () {
      var vpsVal = document.getElementById('cfgSrvVps').value.trim().replace(/\/+$/, '');
      var lanVal = document.getElementById('cfgSrvLan').value.trim().replace(/\/+$/, '');
      var usrVal = document.getElementById('cfgSrvUser').value.trim();
      var fb = document.getElementById('cfgSrvFeedback');
      var btn = document.getElementById('cfgSrvSaveBtn');

      state.vpsUrl = vpsVal;
      state.lanUrl = lanVal || state.lanUrl;
      state.username = usrVal;
      state.serverUrl = vpsVal || state.lanUrl;
      if (vpsVal) state.remoteUrl = vpsVal;
      saveStoredConfig();

      btn.disabled = true;
      fb.style.color = 'var(--txt-2)';
      fb.textContent = 'Probando conexión...';

      probeBestServer().then(function (res) {
        btn.disabled = false;
        if (res && res.ok) {
          fb.style.color = '#6ee7b7';
          fb.textContent = '✔ Conectado correctamente a ' + res.url;
          setTimeout(function () {
            closeSheet();
            if (!document.getElementById('appShell').classList.contains('hidden')) {
              startSse();
              refreshAllData(false);
            }
          }, 550);
        } else {
          fb.style.color = '#fca5a5';
          fb.textContent = 'No respondió ninguno de los servidores configurados. Verifica que esté encendido.';
        }
      });
    });
  }

  function renderPinDots() {
    var dots = document.querySelectorAll('#pinDotsWrap .p-dot');
    for (var i = 0; i < dots.length; i++) {
      if (i < pinBuffer.length) dots[i].classList.add('filled');
      else dots[i].classList.remove('filled');
    }
    var manualBtn = document.getElementById('pinSubmitManualBtn');
    if (manualBtn) {
      if (pinBuffer.length >= 4 && pinBuffer.length < 6) manualBtn.classList.remove('hidden');
      else manualBtn.classList.add('hidden');
    }
  }

  function triggerPinShake(msg) {
    var wrap = document.getElementById('pinDotsWrap');
    var errEl = document.getElementById('loginErrorMsg');
    if (errEl) {
      errEl.textContent = msg || 'PIN incorrecto';
      errEl.style.display = 'block';
    }
    if (wrap) {
      wrap.classList.remove('shake');
      void wrap.offsetWidth;
      wrap.classList.add('shake');
    }
    pinBuffer = '';
    renderPinDots();
    vibrateLight();
  }

  function submitMobilePin() {
    if (pinSubmitting || pinBuffer.length < 4) return;
    var enteredPin = pinBuffer;
    var errEl = document.getElementById('loginErrorMsg');
    if (errEl) errEl.style.display = 'none';
    pinSubmitting = true;

    function attemptLogin(targetUrl) {
      return fetch(targetUrl + '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: state.username || undefined,
          pin: enteredPin,
          clientApp: 'mobile-admin'
        })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || !d.ok || !d.token) {
            var e = new Error(d.error || ('Acceso denegado (HTTP ' + r.status + ')'));
            e.httpStatus = r.status;
            throw e;
          }
          return d;
        });
      });
    }

    var primary = (state.serverUrl || state.vpsUrl || state.lanUrl || 'http://192.168.137.1:7070').replace(/\/+$/, '');
    attemptLogin(primary)
      .catch(function (err) {
        if (err && err.httpStatus) throw err;
        // Si falló la red, re-detectar servidor activo (VPS o LAN) y reintentar 1 vez
        return probeBestServer().then(function (res) {
          if (!res || !res.ok) {
            throw new Error('No se pudo conectar al servidor. Toca ⚙️ para revisar VPS o Wi-Fi.');
          }
          return attemptLogin(res.url);
        });
      })
      .then(function (d) {
        if (!d.user || !isAdminRole(d.user.role)) {
          throw new Error('Solo el Administrador puede usar esta app móvil.');
        }
        state.token = d.token;
        state.user = d.user;
        saveStoredConfig();

        pinBuffer = '';
        renderPinDots();
        showAppShell();
        startSse();
        refreshAllData(true);
        vibrateLight();
      })
      .catch(function (err) {
        triggerPinShake(err.message);
      })
      .finally(function () {
        pinSubmitting = false;
      });
  }

  function showLoginScreen(errMsg) {
    pinBuffer = '';
    pinSubmitting = false;
    renderPinDots();
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    var errEl = document.getElementById('loginErrorMsg');
    if (errEl) {
      if (errMsg) {
        errEl.textContent = errMsg;
        errEl.style.display = 'block';
      } else {
        errEl.style.display = 'none';
      }
    }
    probeBestServer();
  }

  function showAppShell() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    renderAllTabs();
    requestAnimationFrame(function () {
      switchTab(state.activeTab || 'live', false);
    });
  }

  function positionPagerAndPill(index, animate) {
    var viewport = document.getElementById('pagerViewport');
    var track = document.getElementById('pagerTrack');
    var dock = document.getElementById('liquidDock');
    var pill = document.getElementById('dockActivePill');
    var rect = viewport ? viewport.getBoundingClientRect() : null;
    var pageW = (rect && rect.width > 0) ? rect.width : window.innerWidth;

    if (track) {
      if (animate) track.classList.add('animating');
      else track.classList.remove('animating');
      track.style.transform = 'translate3d(' + (-index * pageW) + 'px, 0, 0)';
    }

    if (pill && dock) {
      var dockRect = dock.getBoundingClientRect();
      var dockW = (dockRect && dockRect.width > 0) ? dockRect.width : (window.innerWidth - 20);
      var pillW = (dockW - 10) / TAB_ORDER.length;
      if (animate) pill.classList.add('animating');
      else pill.classList.remove('animating');
      pill.style.transform = 'translate3d(' + (index * pillW) + 'px, 0, 0)';
    }
  }

  function switchTab(tabId, animate) {
    var idx = TAB_ORDER.indexOf(tabId);
    if (idx === -1) idx = 0;
    activePagerIndex = idx;
    state.activeTab = TAB_ORDER[idx];

    document.querySelectorAll('#liquidDock .dock-btn').forEach(function (b) {
      if (b.getAttribute('data-tab') === state.activeTab) b.classList.add('active');
      else b.classList.remove('active');
    });

    document.querySelectorAll('#pagerTrack .pager-page').forEach(function (pg, i) {
      if (i === idx) pg.classList.add('is-active');
      else pg.classList.remove('is-active');
    });

    positionPagerAndPill(idx, animate !== false);
  }

  function rubberband(overshoot, dim) {
    var c = 0.45;
    return (overshoot * dim * c) / (dim + c * Math.abs(overshoot));
  }

  function initSwipePager() {
    var viewport = document.getElementById('pagerViewport');
    var track = document.getElementById('pagerTrack');
    var dock = document.getElementById('liquidDock');
    var pill = document.getElementById('dockActivePill');
    if (!viewport || !track) return;

    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var lastTime = 0;
    var velX = 0;
    var dx = 0;
    var lockedAxis = ''; // 'x' | 'y' | ''
    var isDragging = false;

    function shouldIgnoreTarget(t) {
      if (!t || !t.closest) return false;
      return Boolean(t.closest('.filter-row, input, select, textarea'));
    }

    function onStart(clientX, clientY, target) {
      if (shouldIgnoreTarget(target)) {
        isDragging = false;
        return;
      }
      isDragging = true;
      lockedAxis = '';
      startX = clientX;
      startY = clientY;
      lastX = clientX;
      lastTime = Date.now();
      velX = 0;
      dx = 0;
      track.classList.remove('animating');
      if (pill) pill.classList.remove('animating');
    }

    function onMove(clientX, clientY, ev) {
      if (!isDragging) return;
      var rawDx = clientX - startX;
      var rawDy = clientY - startY;

      if (!lockedAxis) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
        lockedAxis = Math.abs(rawDx) > Math.abs(rawDy) * 1.1 ? 'x' : 'y';
      }

      if (lockedAxis === 'y') return;
      if (ev && ev.cancelable) ev.preventDefault();

      var now = Date.now();
      var dt = Math.max(1, now - lastTime);
      velX = (clientX - lastX) / dt; // px/ms
      lastX = clientX;
      lastTime = now;

      var pageW = viewport.clientWidth || window.innerWidth;
      var baseOffset = -activePagerIndex * pageW;
      var candidate = rawDx;

      if ((activePagerIndex === 0 && rawDx > 0) || (activePagerIndex === TAB_ORDER.length - 1 && rawDx < 0)) {
        candidate = rubberband(rawDx, pageW);
      }

      dx = candidate;
      track.style.transform = 'translate3d(' + (baseOffset + candidate) + 'px, 0, 0)';

      if (pill && dock) {
        var pillW = (dock.clientWidth - 10) / TAB_ORDER.length;
        var dragPages = -candidate / pageW;
        var pillTarget = Math.max(-0.25, Math.min(TAB_ORDER.length - 0.75, activePagerIndex + dragPages));
        pill.style.transform = 'translate3d(' + (pillTarget * pillW) + 'px, 0, 0)';
      }
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      if (lockedAxis !== 'x') return;

      var pageW = viewport.clientWidth || window.innerWidth;
      var nextIdx = activePagerIndex;
      if (velX < -0.28 || dx < -pageW * 0.28) {
        nextIdx = Math.min(TAB_ORDER.length - 1, activePagerIndex + 1);
      } else if (velX > 0.28 || dx > pageW * 0.28) {
        nextIdx = Math.max(0, activePagerIndex - 1);
      }

      if (nextIdx !== activePagerIndex) vibrateLight();
      switchTab(TAB_ORDER[nextIdx], true);
    }

    viewport.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    }, { passive: false });

    viewport.addEventListener('touchend', onEnd, { passive: true });
    viewport.addEventListener('touchcancel', onEnd, { passive: true });

    var mouseActive = false;
    viewport.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      mouseActive = true;
      onStart(e.clientX, e.clientY, e.target);
    });
    window.addEventListener('mousemove', function (e) {
      if (!mouseActive) return;
      onMove(e.clientX, e.clientY, e);
    });
    window.addEventListener('mouseup', function () {
      if (!mouseActive) return;
      mouseActive = false;
      onEnd();
    });

    window.addEventListener('resize', function () {
      if (!document.getElementById('appShell').classList.contains('hidden')) {
        positionPagerAndPill(activePagerIndex, false);
      }
    });
  }

  function initSheetSwipeDismiss() {
    var dragZone = document.getElementById('sheetDragZone');
    var panel = document.getElementById('sheetPanel');
    var backdrop = document.getElementById('sheetBackdrop');
    if (!dragZone || !panel || !backdrop) return;

    var startY = 0;
    var lastY = 0;
    var lastT = 0;
    var velY = 0;
    var dy = 0;
    var active = false;

    dragZone.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      if (e.target && e.target.closest && e.target.closest('#sheetCloseBtn')) return;
      active = true;
      startY = e.touches[0].clientY;
      lastY = startY;
      lastT = Date.now();
      velY = 0;
      dy = 0;
      panel.classList.add('dragging');
    }, { passive: true });

    dragZone.addEventListener('touchmove', function (e) {
      if (!active || !e.touches || e.touches.length !== 1) return;
      if (e.cancelable) e.preventDefault();
      var cy = e.touches[0].clientY;
      var now = Date.now();
      velY = (cy - lastY) / Math.max(1, now - lastT);
      lastY = cy;
      lastT = now;

      var raw = cy - startY;
      dy = raw < 0 ? raw * 0.2 : raw;
      panel.style.transform = 'translate3d(0, ' + dy + 'px, 0)';
      var opacity = Math.max(0.15, 1 - (Math.max(0, dy) / Math.max(240, panel.clientHeight)));
      backdrop.style.opacity = String(opacity);
    }, { passive: false });

    function finishDrag() {
      if (!active) return;
      active = false;
      panel.classList.remove('dragging');
      panel.style.transform = '';
      backdrop.style.opacity = '';
      if (dy > 110 || velY > 0.45) {
        closeSheet();
      }
    }

    dragZone.addEventListener('touchend', finishDrag, { passive: true });
    dragZone.addEventListener('touchcancel', finishDrag, { passive: true });
  }

  window.openMobileTab = function (tabId) {
    if (tabId && document.getElementById('appShell') && !document.getElementById('appShell').classList.contains('hidden')) {
      switchTab(tabId, true);
    } else if (tabId) {
      state.activeTab = tabId;
    }
  };

  function handlePinDigit(digit) {
    if (pinSubmitting || pinBuffer.length >= 6) return;
    var errEl = document.getElementById('loginErrorMsg');
    if (errEl) errEl.style.display = 'none';
    pinBuffer += String(digit);
    renderPinDots();
    vibrateLight();
    if (pinBuffer.length === 6) {
      setTimeout(submitMobilePin, 90);
    }
  }

  function handlePinBackspace() {
    if (pinSubmitting || pinBuffer.length === 0) return;
    pinBuffer = pinBuffer.slice(0, -1);
    renderPinDots();
    vibrateLight();
  }

  function enterOfflinePreviewMode() {
    if (!state.appState) {
      state.appState = buildEmptyFallbackState();
    }
    if (!state.aiInsights) {
      state.aiInsights = buildOfflineAiFallback(state.appState);
    }
    state.serverOnline = false;
    state.user = { name: 'Administrador', username: 'admin', role: 'admin' };
    showAppShell();
    updateConnectionHeader();
    updateHeaderMeta();
    vibrateLight();
    showToast('Vista previa sin conexión · Configura tu VPS en Control');
  }

  function wireEvents() {
    document.querySelectorAll('#liquidDock .dock-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        vibrateLight();
        switchTab(btn.getAttribute('data-tab'), true);
      });
    });

    initSwipePager();
    initSheetSwipeDismiss();

    document.getElementById('hdrRefreshBtn').addEventListener('click', function () {
      refreshAllData(false);
    });

    document.getElementById('sheetCloseBtn').addEventListener('click', closeSheet);
    document.getElementById('sheetBackdrop').addEventListener('click', function (e) {
      if (e.target === document.getElementById('sheetBackdrop')) closeSheet();
    });

    document.querySelectorAll('.pin-keypad .k-btn[data-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handlePinDigit(btn.getAttribute('data-key'));
      });
    });

    document.getElementById('pinBackspaceBtn').addEventListener('click', handlePinBackspace);
    document.getElementById('pinSubmitManualBtn').addEventListener('click', submitMobilePin);
    document.getElementById('openSrvConfigBtn').addEventListener('click', openServerSettingsSheet);
    document.getElementById('openSrvLinkBtn').addEventListener('click', openServerSettingsSheet);
    var previewBtn = document.getElementById('enterOfflinePreviewBtn');
    if (previewBtn) previewBtn.addEventListener('click', enterOfflinePreviewMode);
    document.getElementById('loginConnPill').addEventListener('click', openServerSettingsSheet);

    document.addEventListener('keydown', function (e) {
      var loginVisible = !document.getElementById('loginScreen').classList.contains('hidden');
      var sheetOpen = document.getElementById('sheetBackdrop').classList.contains('open');
      if (!loginVisible || sheetOpen) return;
      if (/^[0-9]$/.test(e.key)) {
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlePinBackspace();
      } else if (e.key === 'Enter' && pinBuffer.length >= 4) {
        submitMobilePin();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadStoredConfig();
    loadCachedSnapshot();
    wireEvents();

    // Deep link desde notificación Android (?tab=pagomovil)
    try {
      var params = new URLSearchParams(window.location.search || '');
      var reqTab = params.get('tab');
      if (reqTab) state.activeTab = reqTab;
    } catch (e) {}

    if (state.token && state.user && isAdminRole(state.user.role)) {
      showAppShell();
      updateConnectionHeader();
      updateHeaderMeta();
      startSse();
      refreshAllData(true);
    } else {
      showLoginScreen('');
    }
  });
})();
