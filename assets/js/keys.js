/* ==========================================================================
   MI-TIENDA-POS — keys.js (v7)
   Paleta de comandos (Ctrl+K) + atajos globales de teclado.
   Responde a: "necesitamos una lista a la que podamos ir desde donde estemos".
   ========================================================================== */
(function (root) {
  'use strict';

  /* --------------------------------------------------------- Utilidades --- */
  function isCajaPath() {
    return /\/caja(\/|$)/i.test(location.pathname.replace(/\\/g, '/'));
  }

  function isAdminPath() {
    return /\/admin(\/|$)/i.test(location.pathname.replace(/\\/g, '/'));
  }

  /** Ruta base para llegar a una pantalla de administración desde donde estemos. */
  function adminBase() {
    if (isCajaPath()) return '../admin/';
    if (isAdminPath()) return '';
    return 'admin/';               // pantalla de acceso (index.html en la raíz)
  }

  /** Ruta de la pantalla de Caja. */
  function posHref() {
    if (isCajaPath()) return 'pos.html';
    if (isAdminPath()) return 'pos.html';
    return 'admin/pos.html';
  }

  function normalize(str) {
    return String(str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ------------------------------------------------------ Catálogo ------ */
  function buildCommands() {
    const ab = adminBase();
    const cmds = [
      { id: 'caja', label: 'Vender (Caja)', hint: 'Abrir la pantalla de cobro', href: posHref(), keys: 'F2' },
      { id: 'mi-dia', label: 'Mi día (Resumen)', hint: 'Ver cómo va el día de hoy', href: ab + 'index.html' },
      { id: 'tienda', label: 'Lo que hay en la tienda', hint: 'Inventario y existencias', href: ab + 'inventario.html' },
      { id: 'compras', label: 'Registrar compra o gasto', hint: 'Compras y gastos', href: ab + 'facturas.html' },
      { id: 'cuadre', label: 'Cuadre del día', hint: 'Cerrar y conciliar la gaveta', href: ab + 'cierres.html', keys: 'F7' },
      { id: 'tasa', label: 'Precios y tasa del dólar', hint: 'BCV, Euro y paralelo', href: ab + 'precios.html' },
      { id: 'platos', label: 'Platos y productos', hint: 'Catálogo y variantes', href: ab + 'productos.html' },
      { id: 'recetas', label: 'Recetas de cocina', hint: 'Producción y escandallo', href: ab + 'recetas.html' },
      { id: 'ajustes', label: 'Ajustes y respaldos', hint: 'Configuración del sistema', href: ab + 'ajustes.html' }
    ];

    const actions = [
      {
        id: 'a-gasto', label: 'Registrar gasto rápido', hint: 'Salida de dinero del día',
        keys: 'F6',
        run: function () {
          if (root.MTPSidebar && root.MTPSidebar.openExpenseModal) root.MTPSidebar.openExpenseModal();
        }
      },
      {
        id: 'a-tasa', label: 'Actualizar tasa del dólar', hint: 'Sincronizar BCV y paralelo',
        run: function () {
          if (root.MTPRates && root.MTPRates.syncOfficialRates) root.MTPRates.syncOfficialRates(false);
        }
      },
      {
        id: 'a-menu', label: 'Mostrar u ocultar el menú', hint: 'Barra lateral',
        keys: 'Ctrl+B',
        run: function () {
          if (root.MTPSidebar && root.MTPSidebar.cycleSidebar) root.MTPSidebar.cycleSidebar();
        }
      }
    ];

    return cmds.concat(actions);
  }

  /* ------------------------------------------------- Paleta de comandos -- */
  let paletteEl = null;
  let paletteIndex = 0;
  let paletteItems = [];

  function score(cmd, q) {
    if (!q) return 1;
    const hay = normalize(cmd.label + ' ' + (cmd.hint || '') + ' ' + (cmd.id || '') + ' ' + (cmd.keys || ''));
    const needle = normalize(q);
    if (hay.indexOf(needle) >= 0) return 100 - hay.indexOf(needle);
    const words = needle.split(/\s+/);
    let hits = 0;
    words.forEach(function (w) { if (w.length > 2 && hay.indexOf(w) >= 0) hits++; });
    return hits > 0 ? (10 + hits) : 0;
  }

  function renderPalette(list, q) {
    const cmds = buildCommands()
      .map(function (c) { return { c: c, s: score(c, q) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 9)
      .map(function (x) { return x.c; });

    paletteItems = cmds;
    paletteIndex = 0;

    if (!cmds.length) {
      list.innerHTML = '<li class="v7-palette-empty">No encontramos nada. Prueba con: venta, gasto, cuadre, tasa.</li>';
      return;
    }

    list.innerHTML = cmds.map(function (c, i) {
      return '<li class="v7-palette-item' + (i === 0 ? ' active' : '') + '" role="option" data-i="' + i + '">' +
        '<span class="v7-palette-label">' + escapeText(c.label) +
        (c.keys ? ' <kbd>' + escapeText(c.keys) + '</kbd>' : '') + '</span>' +
        '<span class="v7-palette-hint">' + escapeText(c.hint || '') + '</span>' +
        '</li>';
    }).join('');
  }

  function escapeText(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openPalette() {
    if (paletteEl) return;
    paletteEl = document.createElement('div');
    paletteEl.className = 'v7-palette-backdrop';
    paletteEl.innerHTML =
      '<div class="v7-palette" role="dialog" aria-modal="true" aria-label="Buscar y ir a">' +
        '<input id="v7PaletteInput" class="v7-palette-input" type="text" autocomplete="off" ' +
          'placeholder="¿A dónde quieres ir? (venta, gasto, cuadre, tasa…)" aria-label="Buscar comandos">' +
        '<ul id="v7PaletteList" class="v7-palette-list" role="listbox"></ul>' +
        '<div class="v7-palette-foot">↑ ↓ para moverse · Enter para abrir · Esc para cerrar</div>' +
      '</div>';
    document.body.appendChild(paletteEl);

    const input = paletteEl.querySelector('#v7PaletteInput');
    const list = paletteEl.querySelector('#v7PaletteList');

    input.addEventListener('input', function () { renderPalette(list, input.value); });
    input.addEventListener('keydown', onPaletteKey);
    document.addEventListener('keydown', onPaletteEscape);
    paletteEl.addEventListener('click', function (e) { if (e.target === paletteEl) closePalette(); });
    list.addEventListener('click', function (e) {
      const li = e.target.closest ? e.target.closest('.v7-palette-item') : null;
      if (li) runPalette(Number(li.getAttribute('data-i')));
    });

    renderPalette(list, '');
    input.focus();
  }

  function onPaletteKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteIndex); }
  }

  function onPaletteEscape(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  }

  function movePalette(delta) {
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
    const nodes = paletteEl.querySelectorAll('.v7-palette-item');
    for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('active', i === paletteIndex);
    if (nodes[paletteIndex]) nodes[paletteIndex].scrollIntoView({ block: 'nearest' });
  }

  function runPalette(i) {
    const cmd = paletteItems[i];
    if (!cmd) return;
    closePalette();
    if (cmd.href) { location.href = cmd.href; return; }
    if (cmd.run) cmd.run();
  }

  function closePalette() {
    if (!paletteEl) return;
    document.removeEventListener('keydown', onPaletteEscape);
    paletteEl.remove();
    paletteEl = null;
  }

  /* ------------------------------------------------- Atajos globales ----- */
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function onGlobalKey(e) {
    const key = String(e.key || '').toLowerCase();
    const combo = (e.ctrlKey || e.metaKey) ? 'ctrl+' + key : key;

    // En la pantalla de Caja, el motor de caja ya gestiona F1-F4, Escape y
    // Enter con más contexto: no lo duplicamos.
    const posOwnsKeys = !!(root.MTPPos && root.MTPPos.openCheckoutModal);
    const posKey = (e.key === 'F2' || e.key === 'F4' || e.key === 'Escape' || e.key === 'Enter' || e.key === 'F1' || e.key === 'F3');

    // Escape cierra cualquier modal abierto (también en las pantallas admin)
    if (e.key === 'Escape' && !paletteEl && !posOwnsKeys) {
      const open = document.querySelector('.modal-backdrop.open');
      if (open) {
        e.preventDefault();
        open.classList.remove('open');
        return;
      }
    }

    // Ctrl+K funciona incluso escribiendo en un campo
    if (combo === 'ctrl+k') { e.preventDefault(); openPalette(); return; }

    if (isTyping(e.target)) return;

    if (posOwnsKeys && posKey) return;   // lo maneja el motor de caja

    if (combo === 'ctrl+b') {
      e.preventDefault();
      if (root.MTPSidebar && root.MTPSidebar.cycleSidebar) root.MTPSidebar.cycleSidebar();
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      if (root.MTPPos && root.MTPPos.openCheckoutModal) root.MTPPos.openCheckoutModal();
      return;
    }
    if (e.key === 'F6') {
      e.preventDefault();
      if (root.MTPSidebar && root.MTPSidebar.openExpenseModal) root.MTPSidebar.openExpenseModal();
      return;
    }
    if (e.key === 'F7') {
      e.preventDefault();
      location.href = adminBase() + 'cierres.html';
    }
  }

  function init() {
    document.addEventListener('keydown', onGlobalKey);
    if (root.MTPUI && root.MTPUI.ensureToastRegion) root.MTPUI.ensureToastRegion();
  }

  root.MTPKeys = {
    init: init,
    openPalette: openPalette,
    closePalette: closePalette,
    buildCommands: buildCommands
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
