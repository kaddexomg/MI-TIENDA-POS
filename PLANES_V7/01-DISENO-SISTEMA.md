# 01 — SISTEMA DE DISEÑO (Tokens, Componentes, Movimiento, Accesibilidad)

> 🟢 Riesgo bajo. Es la base de todo el rediseño.
> Archivos: `assets/css/variables.css`, `assets/css/components.css`, `assets/css/layout.css`, `assets/css/pos.css`, **NUEVO** `assets/js/ui.js`

---

## 1. `assets/css/variables.css` — tokens nuevos

Añadir **después** del bloque de tipografía (línea ~118):

```css
  /* ==========================================================================
     TOKENS v7 — Espaciado, escala tipográfica, movimiento, capas y foco
     ========================================================================== */
  :root {
    /* --- Espaciado (base 4px) --- */
    --sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;
    --sp-4: 16px;  --sp-5: 24px;  --sp-6: 32px;

    /* --- Escala tipográfica (base 16px para edad avanzada) --- */
    --fs-xs: 12px;  /* etiquetas secundarias — mínimo absoluto */
    --fs-sm: 13px;  /* tablas densas */
    --fs-md: 15px;  /* cuerpo */
    --fs-lg: 18px;  /* subtítulos de tarjeta */
    --fs-xl: 22px;  /* títulos de sección */
    --fs-2xl: 30px; /* cifras grandes (KPI, total a cobrar) */

    /* --- Movimiento --- */
    --dur-fast: 120ms;
    --dur: 180ms;
    --dur-slow: 260ms;
    --ease: cubic-bezier(.2, .7, .3, 1);

    /* --- Capas --- */
    --z-nav: 1000;
    --z-modal: 2000;
    --z-toast: 5000;

    /* --- Foco visible (accesibilidad) --- */
    --focus-ring: 0 0 0 3px rgba(232, 163, 23, .55);

    /* --- Estructura --- */
    --row-h: 36px;
    --content-max: 1400px;
    --touch-min: 44px;   /* objetivo táctil mínimo */
  }
```

### 1.1 Cambios de valor existentes

| Token | Valor actual | Valor v7 | Motivo |
|---|---|---|---|
| `font-size` base (`html`) | `15px` | `16px` | Edad avanzada |
| `.stat-l` / `.stat-sub` (`components.css:346,353`) | `11px` | `var(--fs-xs)` = 12px | Ilegible |
| `th` (`components.css:372`) | `12px` + `uppercase` | `var(--fs-sm)` 13px **sin** uppercase | Presbicia |
| `td` (`components.css:381`) | `13.5px` | `var(--fs-md)` 15px | Legibilidad |
| `.modal-bd` (`components.css:541`) | `12px` | `var(--fs-md)` 15px | Modal = foco de atención |
| `--txt-3` | `#64748B` | `#475569` | Contraste AA a 13px |

### 1.2 Foco visible global (nuevo, al final de `components.css`)

```css
  /* --- Foco visible en TODO el sistema --- */
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
  }
  /* Los que ya tienen box-shadow propio (inputs) no deben duplicar */
  .input:focus-visible, .select:focus-visible {
    box-shadow: var(--focus-ring), 0 0 0 1px var(--action);
  }
```

### 1.3 Movimiento con criterio

```css
  /* --- Curvas de animación --- */
  .btn { transition: background-color var(--dur-fast) var(--ease),
                      border-color var(--dur-fast) var(--ease),
                      transform var(--dur-fast) var(--ease),
                      box-shadow var(--dur-fast) var(--ease); }
  .btn:active { transform: translateY(1px) scale(.985); }

  .card { transition: box-shadow var(--dur) var(--ease),
                     border-color var(--dur) var(--ease),
                     transform var(--dur) var(--ease); }

  /* --- Utilidad de aparición --- */
  @keyframes v7FadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }
  .v7-enter { animation: v7FadeUp var(--dur) var(--ease) both; }

  /* --- Pulso real (hoy .pulse-dot es estático) --- */
  @keyframes v7Pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, .55); }
    50%      { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  }
  .pulse-dot { animation: v7Pulse 2.4s var(--ease) infinite; }

  /* --- Respetar la preferencia del sistema --- */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }
```

---

## 2. `assets/css/components.css` — componentes canónicos

### 2.1 KPI gigante (para el Dashboard)

```css
  .stat-grid { display: grid; gap: var(--sp-4); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--sp-4) var(--sp-5);
    box-shadow: var(--shadow-sm);
    display: flex; flex-direction: column; gap: var(--sp-1);
  }
  .stat-n { font-size: var(--fs-2xl); font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .stat-l { font-size: var(--fs-md); font-weight: 600; color: var(--txt-2); }
  .stat-sub { font-size: var(--fs-xs); color: var(--txt-3); }
  .stat-card.tone-in   { border-left: 5px solid var(--money-in); }
  .stat-card.tone-out  { border-left: 5px solid var(--money-out); }
  .stat-card.tone-cash { border-left: 5px solid var(--action); }
  .stat-card.tone-info { border-left: 5px solid var(--info); }
```

### 2.2 Botón grande de acción principal (el "cobrar")

```css
  .btn-hero {
    height: 58px; width: 100%;
    font-size: var(--fs-lg); font-weight: 800;
    border-radius: var(--radius-lg);
    background: var(--money-in); color: #fff;
    box-shadow: 0 4px 0 var(--money-in-hover);
    letter-spacing: .3px;
  }
  .btn-hero:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--money-in-hover); }
```

### 2.3 Botones de billete (Caja)

```css
  .chk-bills { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center;
               background: var(--surface-2); border: 1px solid var(--line);
               border-radius: var(--radius); padding: var(--sp-3); margin-bottom: var(--sp-3); }
  .chk-bills-label { font-size: var(--fs-sm); font-weight: 700; color: var(--txt-2); width: 100%; }
  .chk-bill-btn {
    min-width: 62px; height: 44px; font-size: var(--fs-lg); font-weight: 800;
    background: var(--surface); color: var(--txt);
    border: 2px solid var(--line-strong); border-radius: var(--radius);
    cursor: pointer; transition: all var(--dur-fast) var(--ease);
    font-variant-numeric: tabular-nums;
  }
  .chk-bill-btn:hover { border-color: var(--action); background: #FFFBEB; transform: translateY(-2px); }
  .chk-bill-btn:active { transform: translateY(0) scale(.96); }
```

### 2.4 Total a cobrar (cifra gigante del modal)

```css
  .chk-total-block {
    background: linear-gradient(135deg, #0F2A3D, #16364D);
    color: #fff; border-radius: var(--radius-lg);
    padding: var(--sp-4) var(--sp-5); margin-bottom: var(--sp-3);
  }
  .chk-total-main { display: flex; align-items: baseline; gap: var(--sp-3); flex-wrap: wrap; }
  .chk-total-label { font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: .8px; opacity: .8; }
  .chk-total-usd { font-size: 40px; font-weight: 900; font-family: var(--font-mono); }
  .chk-total-bs { font-size: var(--fs-xl); font-weight: 700; color: #6EE7B7; font-variant-numeric: tabular-nums; }
  .chk-tax-summary { margin-top: var(--sp-2); font-size: var(--fs-sm); opacity: .95; line-height: 1.6; }
  .chk-igtf-note { margin-top: var(--sp-1); font-size: var(--fs-xs); color: #FCD34D; }
```

### 2.5 Validación del vuelto

```css
  .chk-ok    { font-size: var(--fs-sm); font-weight: 700; color: var(--money-in); }
  .chk-error { font-size: var(--fs-sm); font-weight: 700; color: var(--money-out);
               background: var(--money-out-light); padding: 4px 8px; border-radius: var(--radius-sm); }
  .vuelto-suggestion { font-size: var(--fs-md); margin: var(--sp-2) 0; }
```

### 2.6 Estado vacío (nuevo, se usa en todas las tablas)

```css
  .empty-state {
    padding: var(--sp-6) var(--sp-4); text-align: center; color: var(--txt-3);
    background: var(--surface-2); border: 1px dashed var(--line-strong);
    border-radius: var(--radius-lg); font-size: var(--fs-md);
  }
  .empty-state strong { display: block; font-size: var(--fs-lg); color: var(--txt-2); margin-bottom: var(--sp-1); }
```

### 2.7 Utilidad `.sr-only`

```css
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
```

### 2.8 Accordion "Muéstrame más" (Dashboard / Cierres)

```css
  .v7-accordion { border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); }
  .v7-accordion > summary {
    cursor: pointer; padding: var(--sp-3) var(--sp-4); font-weight: 700; font-size: var(--fs-md);
    background: var(--surface-2); list-style: none; display: flex; justify-content: space-between; align-items: center;
  }
  .v7-accordion > summary::-webkit-details-marker { display: none; }
  .v7-accordion > summary::after { content: '▾'; color: var(--txt-3); transition: transform var(--dur) var(--ease); }
  .v7-accordion[open] > summary::after { transform: rotate(180deg); }
  .v7-accordion-body { padding: var(--sp-4); }
```

---

## 3. NUEVO `assets/js/ui.js` — componentes JS reutilizables

```js
/* ==========================================================================
   MI-TIENDA-POS — ui.js (v7)
   Componentes de interfaz reutilizables: tarjetas KPI, diálogos propios,
   trampa de foco, toasts accesibles y utilidades de foco.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- KPI --- */
  /**
   * @param {Object} o { label, value, sub, tone, icon }
   * @returns {string} HTML
   */
  function statCard(o) {
    const tone = o.tone || 'default';
    const icon = o.icon ? '<span class="stat-ico" aria-hidden="true"></span>' : '';
    const sub = o.sub ? '<span class="stat-sub">' + escapeHtml(o.sub) + '</span>' : '';
    return '<div class="stat-card tone-' + tone + '">' + icon +
      '<span class="stat-l">' + escapeHtml(o.label || '') + '</span>' +
      '<strong class="stat-n">' + (o.value === undefined ? '—' : escapeHtml(o.value)) + '</strong>' +
      sub + '</div>';
  }

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------- Diálogo propio --- */
  /**
   * Reemplaza window.confirm / window.prompt.
   * @param {Object} o { title, message, okText, cancelText, type:'confirm'|'prompt', value, placeholder, onOk(value) }
   */
  function dialog(o) {
    return new Promise(function (resolve) {
      const isPrompt = o.type === 'prompt';
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop open';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'v7DialogTitle');

      const inputHtml = isPrompt
        ? '<div class="form-group" style="margin-top:12px">' +
            '<input id="v7DialogInput" class="input" style="width:100%;padding:10px;font-size:16px" ' +
            'placeholder="' + escapeHtml(o.placeholder || '') + '" value="' + escapeHtml(o.value || '') + '">' +
          '</div>'
        : '';

      backdrop.innerHTML =
        '<div class="modal-box" style="max-width:440px">' +
          '<div class="modal-hd"><h3 id="v7DialogTitle">' + escapeHtml(o.title || 'Confirmar') + '</h3></div>' +
          '<div class="modal-bd" style="font-size:15px">' + escapeHtml(o.message || '') + inputHtml + '</div>' +
          '<div class="modal-ft">' +
            '<button class="btn btn-secondary" data-act="cancel">' + escapeHtml(o.cancelText || 'Cancelar') + '</button>' +
            '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-action') + '" data-act="ok">' +
              escapeHtml(o.okText || 'Aceptar') + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(backdrop);
      const input = backdrop.querySelector('#v7DialogInput');
      const okBtn = backdrop.querySelector('[data-act="ok"]');
      const prevFocus = document.activeElement;
      if (input) { input.focus(); input.select(); }
      else okBtn.focus();

      function close(result) {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Enter' && (!isPrompt || e.target.tagName !== 'TEXTAREA')) {
          e.preventDefault(); close(isPrompt ? (input ? input.value : '') : true);
        }
      }
      document.addEventListener('keydown', onKey);
      backdrop.querySelector('[data-act="cancel"]').addEventListener('click', function () { close(null); });
      okBtn.addEventListener('click', function () { close(isPrompt ? (input ? input.value : '') : true); });
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(null); });
    });
  }

  function confirmDialog(message, o) {
    o = o || {};
    return dialog(Object.assign({ title: o.title || '¿Está seguro?', message: message,
      okText: o.okText || 'Sí, continuar', cancelText: 'Cancelar', type: 'confirm' }, o));
  }

  function promptDialog(message, o) {
    o = o || {};
    return dialog(Object.assign({ title: o.title || 'Escriba el valor', message: message,
      type: 'prompt', okText: o.okText || 'Guardar' }, o));
  }

  /* ------------------------------------------------------- Trampa de foco --- */
  /** Mantiene el foco dentro del modal abierto y lo devuelve al cerrarse. */
  function trapFocus(container) {
    if (!container) return function () {};
    const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function onKey(e) {
      if (e.key !== 'Tab') return;
      const items = container.querySelectorAll(selector);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }

  /* ----------------------------------------------------- Toasts y vacíos --- */
  function emptyState(title, hint) {
    return '<div class="empty-state"><strong>' + escapeHtml(title) + '</strong>' +
      (hint ? escapeHtml(hint) : '') + '</div>';
  }

  root.MTPUI = {
    statCard: statCard,
    escapeHtml: escapeHtml,
    dialog: dialog,
    confirmDialog: confirmDialog,
    promptDialog: promptDialog,
    trapFocus: trapFocus,
    emptyState: emptyState
  };
})(window);
```

### 3.1 Carga del script

Agregar en **todas** las páginas `admin/*.html`, `caja/*.html` e `index.html`, después de `config.js`:

```html
  <script src="assets/js/ui.js"></script>
```
> En `admin/` y `caja/` la ruta es `../assets/js/ui.js`.

### 3.2 Migrar los `confirm()` y `prompt()` nativos

| Archivo | Línea | Actual | Nuevo |
|---|---|---|---|
| `admin/index.html` | 421 | `confirm('¿Eliminar...?')` | `await MTPUI.confirmDialog('¿Eliminar este gasto?', { danger:true, okText:'Eliminar' })` |
| `admin/ajustes.html` | 119 | `confirm(...)` | idem |
| `admin/facturas.html` | 196 | `prompt('Monto en USD a abonar...')` | `await MTPUI.promptDialog('Monto en USD a abonar', { type:'prompt', placeholder:'0.00' })` |
| `assets/js/pos-engine.js` | 946 | `prompt()` nota de cocina | input inline en la fila del ticket |

---

## 4. Checklist de cierre de la fase 01

- [ ] `node --check assets/js/ui.js`
- [ ] Ninguna pantalla admin queda con `prompt(` / `confirm(` / `alert(`
- [ ] El texto más pequeño en pantalla es 12 px (`grep` de `font-size:1[01]px` → 0 resultados)
- [ ] Tab muestra foco visible en botón, input, select y link
- [ ] Con "reducir movimiento" del sistema, no hay animaciones
- [ ] Ninguna tabla usa `text-transform:uppercase` en `th`
