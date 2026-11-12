# 02 — NAVEGACIÓN, PALETA DE COMANDOS Y TECLADO

> Responde a: *"no existe una barra desplegable / una lista a la que podamos ir desde donde estemos"*.
> Archivos: `assets/js/sidenav.js`, `assets/css/layout.css`, **NUEVO** `assets/js/keys.js`, `assets/js/config.js` (toast), todos los `admin/*.html` y `caja/*.html`

---

## 1. El problema

Hoy la navegación depende de: la barra lateral (con 5+1 ítems), los botones de cada pantalla y **cero atajos globales**. El Dashboard —la pantalla que más importa— está enterrada en "Más opciones". Y 3 botones anuncian atajos que **no existen** (`F6` en `admin/index.html:37,115` y `admin/cierres.html:71,226`; `F2` en `admin/index.html:38`).

---

## 2. Sidebar: 3 estados, siempre accessible

### 2.1 Estados

| Estado | Ancho | Cuándo |
|---|---|---|
| `expanded` | 218 px | Por defecto en escritorio |
| `rail` | 54 px | `Ctrl+B` / botón "Contraer" |
| `hidden` | 0 px | Botón flotante "☰" — para dar **toda** la pantalla a las tablas |

Persistencia: `localStorage['mtp_sidebar_state']` = `expanded|rail|hidden`.

### 2.2 `assets/css/layout.css` — botón flotante siempre visible

```css
  /* --- Botón flotante de menú (visible incluso con la barra oculta) --- */
  .menu-fab {
    position: fixed; top: 10px; left: 10px; z-index: var(--z-nav);
    width: 38px; height: 38px; border-radius: var(--radius);
    background: var(--nav-bg); color: #fff; border: 1px solid var(--nav-border);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: var(--shadow-md);
    transition: transform var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
  }
  .menu-fab:hover { background: var(--nav-hover); transform: scale(1.06); }
  .menu-fab svg { width: 20px; height: 20px; }

  /* --- Estado oculto --- */
  body.aside-hidden .admin-aside { transform: translateX(-100%); }
  body.aside-hidden .admin-main { margin-left: 0 !important; max-width: 100vw !important; }
  body.aside-hidden .admin-topbar { padding-left: 58px; }

  /* --- Estado rail --- */
  body.aside-rail .admin-aside { width: var(--aside-collapsed-w); }
  body.aside-rail .aside-link-label,
  body.aside-rail .aside-brand-text,
  body.aside-rail .aside-rates { display: none; }
```

### 2.3 `assets/js/sidenav.js` — aplicar el estado

```js
  const SIDEBAR_STATE_KEY = 'mtp_sidebar_state';

  function getSidebarState() {
    try { return localStorage.getItem(SIDEBAR_STATE_KEY) || 'expanded'; } catch (e) { return 'expanded'; }
  }

  function setSidebarState(state) {
    const body = document.body;
    body.classList.remove('aside-rail', 'aside-hidden');
    if (state === 'rail') body.classList.add('aside-rail');
    if (state === 'hidden') body.classList.add('aside-hidden');
    try { localStorage.setItem(SIDEBAR_STATE_KEY, state); } catch (e) {}
    updateMenuFab();
  }

  function cycleSidebar() {
    const order = ['expanded', 'rail', 'hidden'];
    const next = order[(order.indexOf(getSidebarState()) + 1) % order.length];
    setSidebarState(next);
    MTP.toast('Menú: ' + ({ expanded:'completo', rail:'en íconos', hidden:'oculto' })[next], 'info');
  }
```

### 2.4 Corregir el bug del estado activo

`assets/js/sidenav.js:361-364` — el `style` inline pisa el ámbar de `.aside-link.active`:

```js
  // ANTES
  style="${isActive ? `border-left: 3px solid ${itemColor}; background: rgba(255,255,255,0.08);` : ''}"

  // DESPUÉS — solo el color de marca, el fondo lo pone la clase .active
  style="${isActive ? `border-left: 3px solid ${itemColor};` : ''}"
```
Y en `layout.css`, `.aside-link.active` usa `--action` como fondo con opacidad, no gris.

---

## 3. NUEVO `assets/js/keys.js` — paleta de comandos y atajos globales

### 3.1 El catálogo de comandos (una sola fuente)

```js
/* ==========================================================================
   MI-TIENDA-POS — keys.js (v7)
   Paleta de comandos (Ctrl+K) + atajos globales de teclado.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ Comandos --- */
  function buildCommands() {
    const s = (root.MTP && root.MTP.state && root.MTP.state.settings) || {};
    const inAdmin = location.pathname.includes('/admin/');
    const base = inAdmin ? '../' : '';

    const cmds = [
      { id: 'caja',      label: 'Vender (Caja)',            hint: 'Abrir la pantalla de cobro', icon: 'pos',     href: base + (inAdmin ? 'pos.html' : 'pos.html') },
      { id: 'mi-dia',    label: 'Mi día (Resumen)',         hint: 'Ver cómo va el día',       icon: 'chart',   href: base + 'admin/index.html' },
      { id: 'tienda',    label: 'Lo que hay en la tienda',  hint: 'Inventario y stock',        icon: 'package', href: base + 'admin/inventario.html' },
      { id: 'compras',   label: 'Registrar compra o gasto', hint: 'Compras y gastos',         icon: 'fileText',href: base + 'admin/facturas.html' },
      { id: 'cuadre',    label: 'Cuadre del día',           hint: 'Cerrar y conciliar la gaveta', icon: 'calculator', href: base + 'admin/cierres.html' },
      { id: 'tasa',      label: 'Precios y tasa del dólar', hint: 'BCV, Euro y paralelo',      icon: 'dollar',  href: base + 'admin/precios.html' },
      { id: 'platos',    label: 'Platos y productos',       hint: 'Catálogo y variantes',      icon: 'barcode', href: base + 'admin/productos.html' },
      { id: 'recetas',   label: 'Recetas de cocina',        hint: 'Producción y escandallo',   icon: 'kitchen', href: base + 'admin/recetas.html' },
      { id: 'ajustes',   label: 'Ajustes y respaldos',      hint: 'Configuración y respaldos', icon: 'settings', href: base + 'admin/ajustes.html' }
    ];

    // Acciones que se ejecutan sin cambiar de página
    const actions = [
      { id: 'a-gasto',   label: 'Registrar gasto rápido',   hint: 'F6', run: function () { root.MTP && root.MTP.openQuickExpense && root.MTP.openQuickExpense(); } },
      { id: 'a-tasa',    label: 'Actualizar tasa del dólar', hint: 'Sincronizar BCV / USDT', run: function () { root.MTPRates && root.MTPRates.syncOfficialRates && root.MTPRates.syncOfficialRates(false); } },
      { id: 'a-buscar',  label: 'Buscar un producto…',      hint: 'Ir al catálogo', run: function () { location.href = base + 'admin/productos.html'; } }
    ];
    return cmds.concat(actions);
  }

  /* ------------------------------------------------------- Paleta Ctrl+K --- */
  let paletteEl = null;
  let paletteIndex = 0;
  let paletteItems = [];

  function openPalette() {
    if (paletteEl) return;
    paletteEl = document.createElement('div');
    paletteEl.className = 'v7-palette-backdrop';
    paletteEl.innerHTML =
      '<div class="v7-palette" role="dialog" aria-modal="true" aria-label="Buscar y ir a">' +
        '<input id="v7PaletteInput" class="v7-palette-input" type="text" autocomplete="off" ' +
          'placeholder="¿A dónde quieres ir? (escribe: venta, gasto, cuadre, un producto…)" ' +
          'aria-label="Buscar comandos">' +
        '<ul id="v7PaletteList" class="v7-palette-list" role="listbox"></ul>' +
        '<div class="v7-palette-foot">↑↓ para moverse · Enter para abrir · Esc para cerrar</div>' +
      '</div>';
    document.body.appendChild(paletteEl);
    document.body.appendChild(paletteEl);
    const input = paletteEl.querySelector('#v7PaletteInput');
    const list = paletteEl.querySelector('#v7PaletteList');

    input.addEventListener('input', function () { renderPalette(list, input.value); });
    input.addEventListener('keydown', onPaletteKey);
    document.addEventListener('keydown', onPaletteEscape);
    paletteEl.addEventListener('click', function (e) { if (e.target === paletteEl) closePalette(); });

    renderPalette(list, '');
    input.focus();
  }

  function normalize(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function score(cmd, q) {
    if (!q) return 1;
    const hay = normalize(cmd.label + ' ' + (cmd.hint || '') + ' ' + (cmd.id || ''));
    const needle = normalize(q);
    if (hay.indexOf(needle) >= 0) return 100 - hay.indexOf(needle);
    // coincidencia por palabras sueltas ("cuadre del día" → "cuadre")
    const words = needle.split(/\s+/);
    let hits = 0;
    words.forEach(w => { if (w.length > 2 && hay.indexOf(w) >= 0) hits++; });
    return hits > 0 ? 10 + hits : 0;
  }

  function renderPalette(list, q) {
    const cmds = buildCommands()
      .map(c => ({ c: c, s: score(c, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map(x => x.c);

    paletteItems = cmds;
    paletteIndex = 0;

    list.innerHTML = cmds.length
      ? cmds.map((c, i) =>
          '<li class="v7-palette-item' + (i === 0 ? ' active' : '') + '" role="option" data-i="' + i + '">' +
            '<span class="v7-palette-label">' + (c.label || '') + '</span>' +
            '<span class="v7-palette-hint">' + (c.hint || '') + '</span>' +
          '</li>').join('')
      : '<li class="v7-palette-empty">No encontramos nada. Prueba: venta, gasto, cuadre, tasa.</li>';
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
    nodes.forEach((n, i) => n.classList.toggle('active', i === paletteIndex));
    if (nodes[paletteIndex]) nodes[paletteIndex].scrollIntoView({ block: 'nearest' });
  }
  function runPalette(i) {
    const cmd = paletteItems[i];
    if (!cmd) return;
    closePalette();
    if (cmd.href) location.href = cmd.href;
    else if (cmd.run) cmd.run();
  }
  function closePalette() {
    if (!paletteEl) return;
    document.removeEventListener('keydown', onPaletteEscape);
    paletteEl.remove();
    paletteEl = null;
  }

  /* ------------------------------------------------------ Atajos globales --- */
  const GLOBAL_SHORTCUTS = {
    'ctrl+k': openPalette,
    'ctrl+b': function () { root.MTPSidebar && root.MTPSidebar.cycleSidebar && root.MTPSidebar.cycleSidebar(); },
    'f2': function () { root.MTPPos && root.MTPPos.openCheckoutModal && root.MTPPos.openCheckoutModal(); },
    'f6': function () { root.MTP && root.MTP.openQuickExpense && root.MTP.openQuickExpense(); },
    'f7': function () { location.href = (location.pathname.includes('/admin/') ? '' : '../admin/') + 'cierres.html'; }
  };

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function onGlobalKey(e) {
    const key = (e.ctrlKey ? 'ctrl+' : '') + (e.key || '').toLowerCase();

    // Escape cierra modales abiertos (admin incluido)
    if (e.key === 'Escape' && !paletteEl) {
      const open = document.querySelector('.modal-backdrop.open');
      if (open) { e.preventDefault(); open.classList.remove('open'); return; }
    }

    if (isTyping(e.target) && !(e.ctrlKey && (e.key || '').toLowerCase() === 'k')) return;

    const fn = GLOBAL_SHORTCUTS[key];
    if (fn) { e.preventDefault(); fn(); }
  }

  function init() {
    document.addEventListener('keydown', onGlobalKey);
  }

  root.MTPKeys = { init: init, openPalette: openPalette, closePalette: closePalette, buildCommands: buildCommands };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
```

### 3.2 CSS de la paleta (`assets/css/components.css`)

```css
  .v7-palette-backdrop {
    position: fixed; inset: 0; z-index: var(--z-modal);
    background: rgba(15, 23, 42, .55);
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 12vh;
    animation: v7FadeUp var(--dur-fast) var(--ease) both;
  }
  .v7-palette {
    width: min(620px, 92vw);
    background: var(--surface); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg); overflow: hidden;
    border: 1px solid var(--line);
  }
  .v7-palette-input {
    width: 100%; border: 0; border-bottom: 1px solid var(--line);
    padding: 16px 18px; font-size: 18px; font-family: var(--font-sans); outline: none;
    background: var(--surface);
  }
  .v7-palette-list { list-style: none; margin: 0; padding: 6px; max-height: 46vh; overflow-y: auto; }
  .v7-palette-item {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 11px 12px; border-radius: var(--radius); cursor: pointer;
    font-size: var(--fs-md);
  }
  .v7-palette-item.active { background: #FFFBEB; outline: 2px solid var(--action); outline-offset: -2px; }
  .v7-palette-hint { font-size: var(--fs-xs); color: var(--txt-3); }
  .v7-palette-empty { padding: 18px; color: var(--txt-3); font-size: var(--fs-md); }
  .v7-palette-foot {
    padding: 9px 14px; font-size: var(--fs-xs); color: var(--txt-3);
    background: var(--surface-2); border-top: 1px solid var(--line);
  }
```

### 3.3 Carga del script

Agregar **después** de `config.js` y `auth.js`, en `index.html`, los 9 `admin/*.html` y los 2 `caja/*.html`:

```html
  <script src="assets/js/keys.js"></script>   <!-- ../assets/js/keys.js en admin/ y caja/ -->
```

---

## 4. Atajos globales — tabla definitiva

| Tecla | Acción | Dónde vive |
|---|---|---|
| `Ctrl+K` | Paleta de comandos | `keys.js` |
| `Ctrl+B` | Ciclar menú (completo → íconos → oculto) | `keys.js` → `sidenav.js` |
| `F1` | Buscar / escanear | `pos-engine.js` (ya existe) |
| `F2` | Cobrar | `keys.js` (nuevo, global) |
| `F3` | Pedido en espera | `pos-engine.js` (ya existe) |
| `F4` | Comanda / reimprimir | `pos-engine.js` (ya existe) |
| `F6` | Registrar gasto | `keys.js` (nuevo — hoy está anunciado y **no existe**) |
| `F7` | Cuadre del día | `keys.js` (nuevo) |
| `Esc` | Cerrar modal (en **todas** las pantallas) | `keys.js` (nuevo) |
| `0-9` | Familia en Caja | `pos-engine.js` (ya existe) |
| `+` / `-` | Cantidad | `pos-engine.js` (ya existe) |
| `Enter` | Confirmar cobro | `pos-engine.js` (nuevo, en el modal) |

---

## 5. "Ver mi día" en el topbar (el Dashboard sube de nivel)

### 5.1 `assets/js/sidenav.js` — botón en el topbar

```js
  function mountTopbarHome() {
    const bar = document.querySelector('.admin-topbar');
    if (!bar || bar.querySelector('.topbar-home-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-action btn-sm topbar-home-btn';
    btn.textContent = '🏠 Ver mi día';
    btn.title = 'Resumen del día (Resumen del negocio)';
    btn.addEventListener('click', function () {
      const base = location.pathname.includes('/admin/') ? '' : '../admin/';
      location.href = base + 'index.html';
    });
    bar.insertBefore(btn, bar.firstChild);
  }
```
Llamar a `mountTopbarHome()` dentro del `init()` que ya existe en `sidenav.js`.

### 5.2 Quitar "Resumen del negocio" de "Más opciones"

`assets/js/sidenav.js:329` — se elimina la línea del array `ADMIN_LINKS` para que no quede duplicado.

---

## 6. Checklist de cierre de la fase 02

- [ ] `Ctrl+K` abre desde `index.html`, desde `admin/pos.html` y desde `caja/pos.html`
- [ ] La paleta filtra por texto y se mueve con `↑↓`, abre con `Enter`, cierra con `Esc`
- [ ] `Ctrl+B` recorre los 3 estados y el estado persiste tras recargar
- [ ] Con la barra oculta, el botón flotante `☰` sigue visible y devuelve la barra
- [ ] `Esc` cierra un modal abierto en `admin/inventario.html` (hoy no lo hace)
- [ ] `F6` abre el registro de gasto en el Dashboard
- [ ] El botón "Ver mi día" está en el topbar de todas las pantallas
- [ ] `node --check assets/js/keys.js`
