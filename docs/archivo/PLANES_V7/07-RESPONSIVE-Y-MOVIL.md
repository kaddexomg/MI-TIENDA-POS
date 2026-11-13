# 07 — RESPONSIVE, MÓVIL Y ACCESIBILIDAD

> 🟡 Riesgo medio. Archivos: `assets/css/layout.css`, `assets/css/components.css`, `assets/css/pos.css`, `assets/js/pos-engine.js`

---

## 1. El problema

El proyecto tiene **3 breakpoints** en todo el repo (`layout.css:543`, `components.css:469`, `pos.css:76`) y **todos los grids de las páginas admin son `grid-template-columns` fijos escritos en el HTML** → nunca colapsan:

| Archivo | Línea | Grid fijo |
|---|---|---|
| `admin/index.html` | 47, 81, 137 | `1.35fr 1fr` / `1fr 1fr` / `1fr 1.3fr` |
| `admin/inventario.html` | 97 | `1.8fr .8fr .8fr .9fr .9fr 1fr auto` |
| `admin/recetas.html` | 159, 177, 190 | `minmax(300px,1fr)` |
| `admin/cierres.html` | 96, 186, 278, 367 | fijos |
| `admin/ajustes.html` | 45, 195 | fijos |
| `admin/productos.html` | 321 | fijo |

Objetivos: **1024×768** (monitor de la tienda), **1366×768** (escritorio), **768×1024** (tablet), **390×844** (móvil del dueño).

---

## 2. Reglas responsive

### 2.1 Contenedor de contenido

```css
  /* assets/css/layout.css */
  .admin-main {
    margin-left: var(--aside-w);
    max-width: calc(100vw - var(--aside-w));
    transition: margin-left var(--dur) var(--ease), max-width var(--dur) var(--ease);
  }
  body.aside-rail .admin-main { margin-left: var(--aside-collapsed-w); max-width: calc(100vw - var(--aside-collapsed-w)); }
  body.aside-hidden .admin-main { margin-left: 0; max-width: 100vw; }
```

### 2.2 Breakpoints (consolidados)

```css
  /* --- Escritorio grande --- */
  @media (min-width: 1400px) {
    .admin-main > .container { max-width: var(--content-max); margin-inline: auto; }
  }

  /* --- Monitor de tienda 1024-1199 --- */
  @media (max-width: 1199px) {
    .stat-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .dash-charts { grid-template-columns: 1fr !important; }
    .dash-questions { grid-template-columns: repeat(2, 1fr) !important; }
    .data-table th, .data-table td { font-size: var(--fs-sm); padding: 6px 8px; }
  }

  /* --- Tablet --- */
  @media (max-width: 900px) {
    .grid-2, .grid-3, .dash-questions, .dash-charts { grid-template-columns: 1fr !important; }
    .stat-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    .admin-aside { transform: translateX(-100%); }
    body.aside-open .admin-aside { transform: none; }
    .admin-main { margin-left: 0 !important; max-width: 100vw !important; }
  }

  /* --- Móvil --- */
  @media (max-width: 640px) {
    :root { --fs-2xl: 26px; }
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .btn, .btn-sm, .btn-lg { min-height: var(--touch-min); }
    .modal-box { width: 96vw; max-height: 92vh; }
    .pay-methods-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .chk-total-usd { font-size: 32px; }
    .vuelto-grid, .vuelto-grid-3 { grid-template-columns: 1fr !important; }
    .modal-ft { flex-direction: column-reverse; }
    .modal-ft .btn { width: 100%; }
  }
```

### 2.3 Tablas en pantallas pequeñas

En vez de scroll horizontal molesto, las tablas **priorizan columnas**:

```css
  /* Las columnas menos importantes se ocultan antes que romper la tabla */
  @media (max-width: 900px) {
    .data-table .col-sec { display: none; }
  }
```
Y se marca cada columna con `class="col-sec"` en el HTML.

Además, la tabla va dentro de `.table-wrap` (ya existe, `components.css`) con `overflow-x:auto` como respaldo.

---

## 3. La Caja en móvil

### 3.1 Layout

```css
  /* assets/css/pos.css */
  @media (max-width: 640px) {
    .pos-layout-3col { grid-template-columns: 1fr !important; height: auto !important; }
    .pos-aside { position: static !important; width: 100% !important; }
    .pos-cart-panel {
      position: fixed; inset: auto 0 0 0; z-index: var(--z-nav);
      max-height: 78vh; border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      box-shadow: 0 -8px 30px rgba(15,23,42,.25);
      transform: translateY(100%); transition: transform var(--dur) var(--ease);
    }
    .pos-cart-panel.open { transform: none; }
    .pos-fab-cobrar {
      position: fixed; right: 12px; bottom: 12px; z-index: var(--z-nav);
      height: 56px; padding: 0 22px; border-radius: 28px;
      font-size: var(--fs-lg); font-weight: 800;
      background: var(--money-in); color: #fff;
      box-shadow: 0 6px 18px rgba(21,128,61,.4);
    }
  }
```

### 3.2 JS

```js
  // Móvil: la carrito se abre como panel inferior
  function initMobileCart() {
    const panel = document.querySelector('.pos-cart-panel');
    const fab = document.getElementById('posFabCobrar');
    if (!panel || !fab) return;
    fab.addEventListener('click', function () {
      panel.classList.toggle('open');
    });
    document.addEventListener('mtp:state-updated', function () {
      if (window.innerWidth <= 640) panel.classList.add('open');
    });
  }
```

El botón flotante **COBRAR** es lo que el dueño (o el cajero con el celular) toca para abrir el modal de cobro, que en móvil es a pantalla completa.

### 3.3 Modal de cobro a pantalla completa en móvil

```css
  @media (max-width: 640px) {
    #posCheckoutModal .modal-box { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
    .chk-bill-btn { flex: 1 1 70px; }
  }
```

---

## 4. El móvil del dueño: "Mi día" en modo lectura

El dueño quiere ver el día **desde el celular**. Hoy el estado vive en el `localStorage` de la PC de la tienda → desde el celular no hay nada.

**Requisito**: la fase 06 (bitácora + `server/`) habilita el camino. Plan:

1. El `server/` expone `GET /api/state` (`server/api.js` ya lo tiene) → el móvil consulta el estado **de la tienda**.
2. Se despliega en el VPS (`deploy/deploy-vps.sh` ya existe) con Nginx + SSL.
3. Una vista móvil mínima (`admin/mobile.html`) que muestre:
   - Hoy vendí / Hoy gané / Tengo en la gaveta
   - Lo que se está acabando
   - Las últimas 10 ventas
   - **Solo lectura** (nunca cobrar desde el móvil: la caja es de la tienda)
4. Autenticación: `auth.js` ya tiene sesiones y roles → el móvil pide PIN de rol **Administrador**.

> **Nota de alcance**: este punto **depende** de la fase 06 (bitácora) y de un despliegue real. Puede quedar para una v7.1 sin bloquear el resto del plan.

---

## 5. Checklist de cierre de la fase 07

- [ ] 1024×768: el shell no tiene scroll horizontal
- [ ] 1366×768: todo se ve sin desplazamiento
- [ ] 900 px: los grids colapsan a 1 columna
- [ ] 390 px: los botones tienen ≥ 44 px de alto
- [ ] La tabla de inventario es legible en 1024 px (columnas prioritarias visibles)
- [ ] En móvil, el carrito se abre como panel inferior y "COBRAR" es accesible con el pulgar
- [ ] El modal de cobro ocupa la pantalla completa en móvil
- [ ] El texto del sistema al 150% no rompe el layout
