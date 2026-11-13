/**
 * assets/js/modules/photo-studio.js
 * MI-TIENDA-POS v8.2.0
 *
 * Estudio de fotos reales de producto.
 * - La IA (pool Gemini del servidor) convierte el nombre en una búsqueda corta.
 * - Bing / DuckDuckGo devuelven fotos reales; se muestran como miniaturas
 *   servidas por la caja (sin CORS ni dominios externos).
 * - Al elegir una, se descarga y queda guardada en la caja para siempre.
 *
 * Si la caja está offline o no hay llaves configuradas, se avisa claramente y
 * se mantienen las 47 fotos locales.
 */

(function (root) {
  'use strict';

  var backdropEl = null;
  var state = {
    query: '',
    results: [],
    selected: null,
    busy: false,
    productName: '',
    familyId: '',
    onPick: null,
    lastAiNote: ''
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getToken() {
    try {
      var t = sessionStorage.getItem('mtp_api_token_v8') || localStorage.getItem('mtp_api_token_v8') || '';
      if (t) return t;
      return sessionStorage.getItem('mtp_vps_token_v8') || localStorage.getItem('mtp_vps_token_v8') || '';
    } catch (_) {
      return '';
    }
  }

  function getBase() {
    if (root.MTPApiClient && typeof root.MTPApiClient.getBaseUrl === 'function') {
      var b = root.MTPApiClient.getBaseUrl();
      if (b) return String(b).replace(/\/+$/, '');
    }
    return (typeof location !== 'undefined' && location.origin) ? location.origin : '';
  }

  function apiFetch(path, options) {
    var opts = options || {};
    var headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    var tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    if (opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    var controller = null;
    var timer = null;
    var fetchOpts = { method: opts.method || 'GET', headers: headers, body: opts.body };
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      fetchOpts.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, opts.timeout || 20000);
    }

    return fetch(getBase() + path, fetchOpts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && data.error) ? data.error : ('Error HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error('La búsqueda tardó demasiado. Revisa la conexión a internet.');
      throw err;
    });
  }

  function proxyThumb(url) {
    var tok = getToken();
    return getBase() + '/api/ai/image-proxy?url=' + encodeURIComponent(url) +
      (tok ? '&token=' + encodeURIComponent(tok) : '');
  }

  function domainOf(url) {
    try {
      var cleaned = String(url || '').replace(/^https?:\/\//i, '');
      return cleaned.split('/')[0].replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  }

  function markup() {
    return '' +
      '<div class="apple-sheet-backdrop photo-studio-backdrop" id="photoStudioBackdrop" role="dialog" aria-modal="true" aria-labelledby="photoStudioTitle">' +
        '<div class="apple-sheet-drawer photo-studio-sheet" id="photoStudioSheet">' +
          '<div class="apple-sheet-header">' +
            '<div>' +
              '<h2 class="apple-sheet-title" id="photoStudioTitle">🌐 Buscar foto real del producto</h2>' +
              '<div class="apple-sheet-subtitle" id="photoStudioSub">La IA arma la búsqueda y tú eliges la foto</div>' +
            '</div>' +
            '<button type="button" class="apple-sheet-close-btn" id="photoStudioClose" aria-label="Cerrar">✕</button>' +
          '</div>' +

          '<div class="photo-studio-body">' +
            '<div class="photo-studio-searchrow">' +
              '<input type="text" id="photoStudioQuery" class="input" placeholder="Ej: Harina P.A.N. blanca 1kg" autocomplete="off">' +
              '<button type="button" class="btn btn-secondary btn-sm" id="photoStudioAi" title="La IA escribe una búsqueda mejor">✨ IA</button>' +
              '<button type="button" class="btn btn-action btn-sm" id="photoStudioGo">🔎 Buscar</button>' +
            '</div>' +

            '<div class="photo-studio-status" id="photoStudioStatus">Escribe el nombre o pulsa ✨ IA para que lo prepare.</div>' +

            '<div class="photo-studio-grid" id="photoStudioGrid"></div>' +
          '</div>' +

          '<div class="photo-studio-footer">' +
            '<div class="photo-studio-picked" id="photoStudioPicked">' +
              '<span class="photo-studio-picked-empty">Ninguna foto elegida</span>' +
            '</div>' +
            '<div class="photo-studio-actions">' +
              '<button type="button" class="btn btn-secondary" id="photoStudioCancel">Cancelar</button>' +
              '<button type="button" class="btn btn-action" id="photoStudioUse" disabled>Usar esta foto</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function setStatus(text, tone) {
    var el = backdropEl && backdropEl.querySelector('#photoStudioStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'photo-studio-status' + (tone ? ' is-' + tone : '');
  }

  function setBusy(busy) {
    state.busy = busy;
    var go = backdropEl.querySelector('#photoStudioGo');
    var ai = backdropEl.querySelector('#photoStudioAi');
    if (go) { go.disabled = busy; go.textContent = busy ? '⏳ Buscando…' : '🔎 Buscar'; }
    if (ai) ai.disabled = busy;
  }

  function renderGrid() {
    var grid = backdropEl.querySelector('#photoStudioGrid');
    if (!grid) return;

    if (!state.results.length) {
      grid.innerHTML = '<div class="photo-studio-empty">Todavía no hay resultados. Escribe qué producto buscas y pulsa Buscar.</div>';
      return;
    }

    grid.innerHTML = state.results.map(function (r, idx) {
      var isSel = state.selected && state.selected.image === r.image;
      var domain = domainOf(r.pageUrl || r.image);
      return '' +
        '<button type="button" class="photo-studio-tile' + (isSel ? ' selected' : '') + '" data-idx="' + idx + '" title="' + esc(r.title || domain) + '">' +
          '<img src="' + esc(proxyThumb(r.thumbnail || r.image)) + '" alt="' + esc(r.title || 'Foto') + '" loading="lazy">' +
          '<span class="photo-studio-tile-meta">' + esc(domain || 'internet') + '</span>' +
          '<span class="photo-studio-tile-score">' + (r.score >= 90 ? '★★★★' : r.score >= 65 ? '★★★' : '★★') + '</span>' +
        '</button>';
    }).join('');
  }

  function renderPicked() {
    var picked = backdropEl.querySelector('#photoStudioPicked');
    var useBtn = backdropEl.querySelector('#photoStudioUse');
    if (!picked || !useBtn) return;

    if (!state.selected) {
      picked.innerHTML = '<span class="photo-studio-picked-empty">Ninguna foto elegida</span>';
      useBtn.disabled = true;
      return;
    }

    picked.innerHTML =
      '<img src="' + esc(proxyThumb(state.selected.thumbnail || state.selected.image)) + '" alt="Elegida">' +
      '<div><strong>' + esc(domainOf(state.selected.pageUrl || state.selected.image) || 'Internet') + '</strong>' +
      '<span>' + esc((state.selected.title || 'Foto seleccionada').slice(0, 90)) + '</span></div>';
    useBtn.disabled = false;
  }

  function runSearch(useAi) {
    if (state.busy) return;
    var queryInput = backdropEl.querySelector('#photoStudioQuery');
    var typed = queryInput ? queryInput.value.trim() : '';
    var name = typed || state.productName;

    if (!name) {
      setStatus('Escribe el nombre del producto para buscar.', 'warn');
      if (queryInput) queryInput.focus();
      return;
    }

    setBusy(true);
    setStatus(useAi ? 'La IA está preparando la búsqueda…' : 'Buscando fotos reales…', 'info');

    var prepare = useAi
      ? apiFetch('/api/ai/suggest-query', {
          method: 'POST',
          body: { productName: name, familyId: state.familyId }
        }).catch(function (err) {
          return { ok: false, error: err.message, query: name };
        })
      : Promise.resolve({ ok: true, query: name, aiUsed: false });

    prepare.then(function (prep) {
      var finalQuery = (prep && prep.query) ? prep.query : name;
      state.lastQuery = finalQuery;
      state.lastAiNote = prep && prep.aiUsed ? '✨ Búsqueda preparada por la IA: ' : '';
      if (queryInput) queryInput.value = finalQuery;

      return apiFetch('/api/ai/search-images?limit=24&q=' + encodeURIComponent(finalQuery)).then(function (data) {
        state.results = Array.isArray(data.results) ? data.results : [];
        state.selected = null;
        renderGrid();
        renderPicked();

        if (!state.results.length) {
          setStatus('No encontré fotos para "' + finalQuery + '". Prueba con la marca o el nombre exacto.', 'warn');
        } else {
          setStatus(state.lastAiNote + state.results.length + ' fotos encontradas. Toca la que se parezca al producto.', 'ok');
        }
      });
    }).catch(function (err) {
      state.results = [];
      state.selected = null;
      renderGrid();
      renderPicked();
      var msg = err && err.message ? err.message : 'Error de búsqueda';
      if (err && err.status === 401) msg = 'La sesión del servidor expiró. Vuelve a entrar con tu PIN.';
      else if (err && err.status === 403) msg = 'Tu rol no puede buscar fotos. Entra como Administrador o Encargado.';
      else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'No puedo hablar con el servidor de la caja. Revisa que esté encendido (http://127.0.0.1:7070).';
      setStatus(msg, 'err');
    }).then(function () {
      setBusy(false);
    });
  }

  function selectResult(idx) {
    var item = state.results[idx];
    if (!item) return;
    state.selected = item;
    renderGrid();
    renderPicked();
  }

  function useSelected() {
    if (!state.selected || state.busy) return;
    setBusy(true);
    setStatus('Guardando la foto dentro de la caja…', 'info');

    apiFetch('/api/ai/product-photo', {
      method: 'POST',
      body: {
        imageUrl: state.selected.image,
        productName: state.productName || state.lastQuery || '',
        familyId: state.familyId
      },
      timeout: 40000
    }).then(function (data) {
      if (!data || !data.ok || !data.path) throw new Error((data && data.error) || 'No se pudo guardar la foto');
      setStatus('✅ Foto guardada en la caja.', 'ok');
      if (typeof state.onPick === 'function') {
        state.onPick(data.path, data);
      }
      close();
    }).catch(function (err) {
      setStatus('No se pudo guardar: ' + (err.message || 'error desconocido'), 'err');
      setBusy(false);
    });
  }

  function close() {
    if (!backdropEl) return;
    document.removeEventListener('keydown', onKey, true);
    backdropEl.classList.remove('open');
    var el = backdropEl;
    backdropEl = null;
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 240);
    state.results = [];
    state.selected = null;
    state.onPick = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  function open(options) {
    var opts = options || {};
    if (backdropEl) close();

    state.productName = String(opts.name || opts.productName || '').trim();
    state.familyId = String(opts.familyId || '').trim();
    state.results = [];
    state.selected = null;
    state.onPick = typeof opts.onPick === 'function' ? opts.onPick : null;

    var wrap = document.createElement('div');
    wrap.innerHTML = markup();
    backdropEl = wrap.firstChild;
    document.body.appendChild(backdropEl);

    var queryInput = backdropEl.querySelector('#photoStudioQuery');
    if (queryInput) {
      queryInput.value = state.productName;
      setTimeout(function () {
        backdropEl.classList.add('open');
        queryInput.focus();
        queryInput.select();
      }, 20);
    } else {
      backdropEl.classList.add('open');
    }

    backdropEl.querySelector('#photoStudioClose').addEventListener('click', close);
    backdropEl.querySelector('#photoStudioCancel').addEventListener('click', close);
    backdropEl.querySelector('#photoStudioGo').addEventListener('click', function () { runSearch(false); });
    backdropEl.querySelector('#photoStudioAi').addEventListener('click', function () { runSearch(true); });
    backdropEl.querySelector('#photoStudioUse').addEventListener('click', useSelected);

    backdropEl.querySelector('#photoStudioQuery').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch(false);
      }
    });

    backdropEl.querySelector('#photoStudioGrid').addEventListener('click', function (e) {
      var tile = e.target.closest ? e.target.closest('.photo-studio-tile') : null;
      if (!tile) return;
      selectResult(parseInt(tile.getAttribute('data-idx'), 10));
    });

    backdropEl.addEventListener('click', function (e) {
      if (e.target === backdropEl) close();
    });

    document.addEventListener('keydown', onKey, true);

    if (state.productName) {
      setTimeout(function () { runSearch(false); }, 120);
    } else {
      renderGrid();
    }
  }

  root.MTPPhotoStudio = {
    open: open,
    close: close,
    isOpen: function () { return !!backdropEl; }
  };
})(typeof window !== 'undefined' ? window : this);
