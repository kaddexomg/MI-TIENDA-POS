/* ==========================================================================
   MI-TIENDA-POS — keys.js (v7)
   Paleta de comandos (Ctrl+K) + atajos globales de teclado.
   Responde a: "necesitamos una lista a la que podamos ir desde donde estemos".
   ========================================================================== */
(function (root) {
  'use strict';

  /* --------------------------------------------------------- Utilidades --- */
  function isAdminPath() {
    return /\/admin(\/|$)/i.test(location.pathname.replace(/\\/g, '/'));
  }

  function isPosPath() {
    var p = location.pathname.replace(/\\/g, '/').toLowerCase();
    return !isAdminPath() && (p.endsWith('/pos.html') || p === 'pos.html');
  }

  /** Ruta base para llegar a una pantalla de administración desde donde estemos. */
  function adminBase() {
    return isAdminPath() ? '' : 'admin/';
  }

  /** Ruta de la pantalla de Caja única en la raíz. */
  function posHref() {
    return isAdminPath() ? '../pos.html' : 'pos.html';
  }

  function normalize(str) {
    return String(str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ------------------------------------------------------ Catálogo ------ */
  function getIco(name, fallback) {
    if (root.MTPIcons && typeof root.MTPIcons.get === 'function') {
      return root.MTPIcons.get(name, { size: 17 });
    }
    return fallback || '•';
  }

  function buildCommands() {
    const ab = adminBase();
    const user = (root.MTPAuth && root.MTPAuth.getCurrentUser) ? root.MTPAuth.getCurrentUser() : null;
    const role = user ? user.role : (isPosPath() ? 'cajero' : 'admin');
    const isAdmin = role === 'admin';
    const isSup = role === 'admin' || role === 'encargado';

    const cmds = [
      { id: 'caja', label: 'Vender en Caja', sub: 'Cobro rápido, códigos EM01/PAS01 y lector USB', hint: 'Ir ahora', ico: 'pos', color: 'c-green', href: posHref(), keys: 'F2' }
    ];

    if (isSup) {
      cmds.push(
        { id: 'mi-dia', label: 'Mi día — Panel de Control', sub: 'Ventas, ganancia, gaveta y alertas de stock', hint: 'Resumen', ico: 'chart', color: 'c-blue', href: ab + 'index.html' },
        { id: 'tienda', label: 'Lo que hay en la tienda', sub: 'Ingredientes de cocina y mercancía de abasto', hint: 'Inventario', ico: 'package', color: 'c-amber', href: ab + 'inventario.html' },
        { id: 'compras', label: 'Compras y gastos', sub: 'Registrar facturas, mercado y egresos', hint: 'Gastos', ico: 'fileText', color: 'c-rose', href: ab + 'facturas.html' },
        { id: 'cuadre', label: 'Cuadre del día', sub: 'Arqueo por billetes y cierre de turno', hint: 'Cierre', ico: 'calculator', color: 'c-purple', href: ab + 'cierres.html', keys: 'F7' },
        { id: 'tasa', label: 'Precios y tasa del dólar', sub: 'BCV, Euro, USDT y margen sugerido', hint: 'Tasas', ico: 'dollar', color: 'c-green', href: ab + 'precios.html' },
        { id: 'platos', label: 'Platos y productos', sub: 'Editar precios, códigos cortos y fotos', hint: 'Catálogo', ico: 'dish', color: 'c-blue', href: ab + 'productos.html' },
        { id: 'recetas', label: 'Recetas de cocina', sub: 'Gramos de masa, guisos y tandas', hint: 'Cocina', ico: 'kitchen', color: 'c-amber', href: ab + 'recetas.html' }
      );
    } else {
      cmds.push(
        {
          id: 'caja-turno',
          label: 'Tickets y Cuadre del Turno',
          sub: 'Ver cobros de hoy, referencias y vueltos entregados',
          hint: 'Turno',
          ico: 'receipt',
          color: 'c-purple',
          run: function () {
            if (root.MTPPos && typeof root.MTPPos.openTodayTicketsModal === 'function') {
              root.MTPPos.openTodayTicketsModal();
            } else {
              location.href = posHref() + '?tickets=1';
            }
          }
        }
      );
    }

    if (isAdmin) {
      cmds.push(
        { id: 'usuarios', label: 'Usuarios y claves', sub: 'PIN de Administrador, Encargado y Cajero', hint: 'Acceso', ico: 'users', color: 'c-slate', href: ab + 'usuarios.html' },
        { id: 'ajustes', label: 'Ajustes, fiscal y respaldos', sub: 'Nombre del negocio, RIF, IVA, Pago Móvil', hint: 'Sistema', ico: 'settings', color: 'c-slate', href: ab + 'ajustes.html' }
      );
    }

    const actions = [
      {
        id: 'a-gasto', label: 'Registrar compra o gasto rápido', sub: 'Anotar compra de aliños, hielo o gasto', hint: 'Acción', ico: 'outflow', color: 'c-rose',
        keys: 'F6',
        run: function () {
          if (root.MTPSidebar && root.MTPSidebar.openExpenseModal) root.MTPSidebar.openExpenseModal();
        }
      },
      {
        id: 'a-tasa', label: 'Sincronizar tasas BCV / USDT', sub: 'Actualizar dólar oficial, Euro y paralelo', hint: 'Tasas', ico: 'dollar', color: 'c-green',
        run: function () {
          if (root.MTPRates && root.MTPRates.syncOfficialRates) root.MTPRates.syncOfficialRates(false);
        }
      },
      {
        id: 'a-menu', label: 'Mostrar u ocultar menú lateral', sub: 'Expandir o plegar barra de navegación', hint: 'Vista', ico: 'menu', color: 'c-slate',
        keys: 'Ctrl+B',
        run: function () {
          if (root.MTPSidebar && root.MTPSidebar.toggleSidebarCollapse) root.MTPSidebar.toggleSidebarCollapse();
        }
      }
    ];

    return cmds.concat(actions);
  }

  function buildProductHits(q) {
    if (!q || !root.MTP || !root.MTP.state) return [];
    const needle = normalize(q);
    if (needle.length < 2) return [];
    const hits = [];
    const onPos = !!(root.MTPPos && root.MTPPos.addVariantQuick);
    const ab = adminBase();

    const pushHit = function (item, isDish) {
      const code = String(item.code || '');
      const name = String(item.name || '');
      const hay = normalize(code + ' ' + name + ' ' + (item.barcode || ''));
      if (hay.indexOf(needle) === -1) return;
      const priceStr = root.MTP.fmtUSD ? root.MTP.fmtUSD(item.priceUsd) : ('$' + Number(item.priceUsd || 0).toFixed(2));
      hits.push({
        id: 'prod-' + item.id,
        label: (code ? code + ' · ' : '') + name,
        sub: (isDish ? 'Plato de cocina' : 'Mercancía de tienda') + ' · ' + priceStr,
        hint: onPos ? '+ Agregar' : 'Ir a Caja',
        ico: isDish ? 'dish' : 'package',
        color: isDish ? 'c-amber' : 'c-green',
        run: function () {
          if (onPos) {
            if (isDish) root.MTPPos.addVariantQuick(item.id);
            else root.MTPPos.addRetailQuick(item.id);
          } else {
            location.href = posHref();
          }
        }
      });
    };

    (root.MTP.state.variants || []).forEach(function (v) { if (v.active !== false) pushHit(v, true); });
    (root.MTP.state.retailItems || []).forEach(function (r) {
      if (r.active === false) return;
      const invMatch = (root.MTP.state.inventory || []).find(function (i) { return i.id === r.id; });
      const stk = Number((invMatch ? invMatch.stock : r.stock) || 0);
      if (stk > 0) pushHit(r, false);
    });
    return hits.slice(0, 4);
  }

  /* ------------------------------------------------- Paleta de comandos -- */
  let paletteEl = null;
  let paletteIndex = 0;
  let paletteItems = [];

  function score(cmd, q) {
    if (!q) return 1;
    const hay = normalize(cmd.label + ' ' + (cmd.sub || '') + ' ' + (cmd.hint || '') + ' ' + (cmd.id || '') + ' ' + (cmd.keys || ''));
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
      .slice(0, 8)
      .map(function (x) { return x.c; });

    const prodHits = buildProductHits(q);
    const all = cmds.concat(prodHits).slice(0, 10);

    paletteItems = all;
    paletteIndex = 0;

    if (!all.length) {
      list.innerHTML = '<li class="v7-palette-empty">No encontramos nada. Prueba con: venta, EM01, gasto, cuadre, tasa.</li>';
      return;
    }

    list.innerHTML = all.map(function (c, i) {
      return '<li class="v7-palette-item' + (i === 0 ? ' active' : '') + '" role="option" data-i="' + i + '">' +
        '<div class="v7-palette-left">' +
          '<span class="v7-palette-ico ' + (c.color || 'c-slate') + '">' + getIco(c.ico || 'bolt') + '</span>' +
          '<div class="v7-palette-text">' +
            '<span class="v7-palette-label">' + escapeText(c.label) +
            (c.keys ? ' <kbd>' + escapeText(c.keys) + '</kbd>' : '') + '</span>' +
            (c.sub ? '<span class="v7-palette-sub">' + escapeText(c.sub) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="v7-palette-hint">' + escapeText(c.hint || '') + '</span>' +
        '</li>';
    }).join('');
  }

  function escapeText(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function openPalette() {
    if (paletteEl) return;
    paletteEl = document.createElement('div');
    paletteEl.className = 'v7-palette-backdrop';
    paletteEl.innerHTML =
      '<div class="v7-palette" role="dialog" aria-modal="true" aria-label="Navegación rápida">' +
        '<div class="v7-palette-hd">' +
          '<span class="v7-palette-search-ico">' + getIco('search', '🔍') + '</span>' +
          '<input id="v7PaletteInput" class="v7-palette-input" type="text" autocomplete="off" ' +
            'placeholder="¿A dónde quieres ir o qué buscas? (venta, EM01, cuadre, tasa…)" aria-label="Buscar comandos">' +
          '<span class="v7-palette-esc-badge">ESC</span>' +
        '</div>' +
        '<ul id="v7PaletteList" class="v7-palette-list" role="listbox"></ul>' +
        '<div class="v7-palette-foot"><span>↑ ↓ para moverse · Enter para abrir</span><span>Ctrl + K</span></div>' +
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

    // Escape cierra SOLO el modal activo más reciente (también en las pantallas admin)
    if (e.key === 'Escape' && !paletteEl && !posOwnsKeys) {
      const openModals = document.querySelectorAll('.modal-backdrop.open, .modal.open');
      const top = openModals.length ? openModals[openModals.length - 1] : null;
      if (top) {
        e.preventDefault();
        top.classList.remove('open');
        return;
      }
    }

    // Ctrl+K funciona incluso escribiendo en un campo
    if (combo === 'ctrl+k') { e.preventDefault(); openPalette(); return; }

    if (isTyping(e.target)) return;

    if (posOwnsKeys && posKey) return;   // lo maneja el motor de caja

    if (e.key === 'F2') {
      e.preventDefault();
      if (root.MTPPos && root.MTPPos.openCheckoutModal) root.MTPPos.openCheckoutModal();
      else location.href = posHref();
      return;
    }
    if (e.key === 'F6') {
      e.preventDefault();
      if (root.MTPSidebar && root.MTPSidebar.openExpenseModal) root.MTPSidebar.openExpenseModal();
      return;
    }
    if (e.key === 'F7') {
      e.preventDefault();
      const user = (root.MTPAuth && root.MTPAuth.getCurrentUser) ? root.MTPAuth.getCurrentUser() : null;
      const canClosures = root.MTPPermissions && typeof root.MTPPermissions.can === 'function'
        ? root.MTPPermissions.can(user, 'shift.view_expected')
        : (user && user.role !== 'cajero');
      if (!canClosures) {
        if (root.MTPPos && root.MTPPos.openTodayTicketsModal) root.MTPPos.openTodayTicketsModal();
        else location.href = posHref() + '?tickets=1';
      } else {
        location.href = adminBase() + 'cierres.html';
      }
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
