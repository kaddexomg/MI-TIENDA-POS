/* ==========================================================================
   MI-TIENDA-POS — ui.js (v7)
   Componentes de interfaz reutilizables y accesibles:
   tarjetas KPI, diálogos propios (sin prompt/confirm nativos), trampa de foco,
   estados vacíos y utilidades de escape.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------- Escape --- */
  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* -------------------------------------------------------- Tarjeta KPI --- */
  /**
   * Tarjeta de cifra grande. Un solo lugar para el formato de todas las
   * tarjetas del sistema (antes había 7 copias distintas del markup).
   *
   * @param {Object} o { label, value, sub, tone, href }
   * @returns {string} HTML
   */
  function statCard(o) {
    o = o || {};
    const tone = o.tone || 'default';
    const tag = o.href ? 'a' : 'div';
    const attrs = o.href ? ' href="' + escapeHtml(o.href) + '"' : '';
    const sub = o.sub ? '<span class="stat-sub">' + escapeHtml(o.sub) + '</span>' : '';
    return '<' + tag + ' class="stat-card tone-' + tone + '"' + attrs + '>' +
      '<span class="stat-l">' + escapeHtml(o.label || '') + '</span>' +
      '<strong class="stat-n">' + (o.value === undefined || o.value === null ? '—' : escapeHtml(o.value)) + '</strong>' +
      sub +
      '</' + tag + '>';
  }

  /* ------------------------------------------------------- Estado vacío --- */
  function emptyState(title, hint) {
    return '<div class="empty-state"><strong>' + escapeHtml(title) + '</strong>' +
      (hint ? '<span>' + escapeHtml(hint) + '</span>' : '') + '</div>';
  }

  /* ---------------------------------------------------- Trampa de foco --- */
  /**
   * Mantiene el foco dentro del contenedor y lo devuelve al cerrarse.
   * @param {HTMLElement} container
   * @returns {Function} función para liberar la trampa
   */
  function trapFocus(container) {
    if (!container) return function () {};
    const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    function onKey(e) {
      if (e.key !== 'Tab') return;
      const items = container.querySelectorAll(selector);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }

  /* --------------------------------------------------------- Diálogo --- */
  /**
   * Diálogo propio (reemplaza prompt/confirm/alert nativos).
   * @param {Object} o {
   *   title, message, okText, cancelText, danger,
   *   type: 'confirm' | 'prompt' | 'menu',
   *   value, placeholder,
   *   items: [{ label, run }]  (solo para type 'menu')
   * }
   * @returns {Promise<any>} true / valor escrito / null si se cancela
   */
  function dialog(o) {
    o = o || {};
    return new Promise(function (resolve) {
      const isPrompt = o.type === 'prompt';
      const isMenu = o.type === 'menu';

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop open';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'v7DialogTitle');

      let bodyHtml = '<div class="v7-dialog-msg">' + escapeHtml(o.message || '') + '</div>';

      if (isPrompt) {
        bodyHtml += '<div class="form-group" style="margin-top:12px">' +
          '<input id="v7DialogInput" class="input" style="width:100%;padding:10px;font-size:16px" ' +
          'placeholder="' + escapeHtml(o.placeholder || '') + '" value="' + escapeHtml(o.value || '') + '">' +
          '</div>';
      }

      if (isMenu && Array.isArray(o.items)) {
        bodyHtml += '<div class="v7-dialog-menu">' + o.items.map(function (it, i) {
          return '<button type="button" class="v7-dialog-item" data-i="' + i + '">' + escapeHtml(it.label) + '</button>';
        }).join('') + '</div>';
      }

      const footHtml = isMenu
        ? '<button class="btn btn-secondary" data-act="cancel">Cerrar</button>'
        : '<button class="btn btn-secondary" data-act="cancel">' + escapeHtml(o.cancelText || 'Cancelar') + '</button>' +
          '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-action') + '" data-act="ok">' +
          escapeHtml(o.okText || 'Aceptar') + '</button>';

      backdrop.innerHTML =
        '<div class="modal-box v7-dialog-box">' +
          '<div class="modal-hd"><h3 id="v7DialogTitle">' + escapeHtml(o.title || 'Confirmar') + '</h3>' +
            '<button class="btn btn-secondary btn-sm" data-act="cancel" aria-label="Cerrar">✕</button>' +
          '</div>' +
          '<div class="modal-bd">' + bodyHtml + '</div>' +
          '<div class="modal-ft">' + footHtml + '</div>' +
        '</div>';

      document.body.appendChild(backdrop);

      const input = backdrop.querySelector('#v7DialogInput');
      const okBtn = backdrop.querySelector('[data-act="ok"]');
      const prevFocus = document.activeElement;
      const release = trapFocus(backdrop);

      if (input) { input.focus(); input.select(); }
      else if (okBtn) okBtn.focus();
      else { const first = backdrop.querySelector('.v7-dialog-item'); if (first) first.focus(); }

      function close(result) {
        document.removeEventListener('keydown', onKey);
        release();
        backdrop.remove();
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
        if (e.key === 'Enter' && !isMenu && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          close(isPrompt ? (input ? input.value : '') : true);
        }
      }
      document.addEventListener('keydown', onKey);

      backdrop.querySelectorAll('[data-act="cancel"]').forEach(function (b) {
        b.addEventListener('click', function () { close(null); });
      });
      if (okBtn) {
        okBtn.addEventListener('click', function () {
          close(isPrompt ? (input ? input.value : '') : true);
        });
      }
      backdrop.querySelectorAll('.v7-dialog-item').forEach(function (b) {
        b.addEventListener('click', function () {
          const idx = Number(b.getAttribute('data-i'));
          const item = o.items[idx];
          close(null);
          if (item && item.run) item.run();
        });
      });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close(null);
      });
    });
  }

  function confirmDialog(message, o) {
    o = o || {};
    return dialog(Object.assign({
      title: o.title || '¿Está seguro?',
      message: message,
      okText: o.okText || 'Sí, continuar',
      cancelText: 'Cancelar',
      type: 'confirm'
    }, o));
  }

  function promptDialog(message, o) {
    o = o || {};
    return dialog(Object.assign({
      title: o.title || 'Escriba el valor',
      message: message,
      type: 'prompt',
      okText: o.okText || 'Guardar'
    }, o));
  }

  function menuDialog(title, items) {
    return dialog({ title: title, type: 'menu', items: items });
  }

  /* ------------------------------------------------------------ Toasts --- */
  /** Lee los toasts existentes del sistema y les añade región aria-live. */
  function ensureToastRegion() {
    let cont = document.getElementById('mtpToastContainer');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'mtpToastContainer';
      cont.className = 'mtp-toast-container';
      document.body.appendChild(cont);
    }
    cont.setAttribute('role', 'status');
    cont.setAttribute('aria-live', 'polite');
    return cont;
  }

  root.MTPUI = {
    escapeHtml: escapeHtml,
    statCard: statCard,
    emptyState: emptyState,
    trapFocus: trapFocus,
    dialog: dialog,
    confirmDialog: confirmDialog,
    promptDialog: promptDialog,
    menuDialog: menuDialog,
    ensureToastRegion: ensureToastRegion
  };
})(window);
