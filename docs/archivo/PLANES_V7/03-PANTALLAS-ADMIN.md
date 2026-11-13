# 03 — REDISEÑO DE LAS PANTALLAS ADMINISTRATIVAS

> 🟡 Riesgo medio. Regla: **cada pantalla responde 3 preguntas y esconde el resto**.
> Archivos: `admin/index.html`, `admin/cierres.html`, `admin/inventario.html`, `admin/productos.html`, `admin/recetas.html`, `admin/facturas.html`, `admin/precios.html`, `assets/js/config.js`

---

## 1. `admin/index.html` — el Dashboard: "Mi día en 30 segundos"

### 1.1 Problemas a corregir

| # | Problema | Línea |
|---|---|---|
| P1 | `getFinancialAnalytics()` **no filtra por fecha** → la tarjeta dice "hoy" y muestra el histórico | `config.js:3493-3653` |
| P2 | 11 bloques y 8 cifras sin jerarquía | `index.html:44-168` |
| P3 | El gráfico horario escala un SVG de 480 px a 125 px → texto a 7 px | `index.html:49-65`, `300-317` |
| P4 | Las ventas fuera de 7:00-21:00 se suman al total pero **no se dibujan** | `index.html:283` vs `291` |
| P5 | La barra "Rentabilidad Cocina vs Abasto" dibuja un **%** pero el texto muestra **$** | `index.html:365-397` |
| P6 | El IVA 16% **no aparece** en el Dashboard | — |
| P7 | "No hay gastos registrados hoy" pero se lista `state.expenses` completo | `index.html:399-406` |
| P8 | Los grids son `grid-template-columns` fijos sin media query → nunca colapsan | `index.html:47,81,137` |
| P9 | Se re-renderiza todo en cada venta | `index.html:477-478` |

### 1.2 Estructura nueva

```html
        <!-- FILA 1 — 3 cifras grandes -->
        <div class="stat-grid" id="dashBigStats"></div>

        <!-- FILA 2 — 4 preguntas con respuesta -->
        <div class="dash-questions" id="dashQuestions"></div>

        <!-- FILA 3 — 3 gráficos simples -->
        <div class="dash-charts" id="dashCharts"></div>

        <!-- FILA 4 — todo lo demás, escondido -->
        <details class="v7-accordion">
          <summary>Muéstrame más (gastos, últimos pedidos y detalle)</summary>
          <div class="v7-accordion-body">
            <div class="grid-2" id="dashMore"></div>
          </div>
        </details>
```

### 1.3 Las 3 cifras grandes

```js
  function renderDashBigStats() {
    const a = MTP.getPeriodAnalytics('TODAY');           // ← con filtro de fecha
    const cash = MTP.getCashOnHand ? MTP.getCashOnHand() : null;
    const el = document.getElementById('dashBigStats');
    if (!el) return;

    el.innerHTML =
      MTPUI.statCard({
        label: 'Hoy vendí', tone: 'in',
        value: MTP.fmtUSD(a.grossSalesUsd),
        sub: MTP.fmtBsRaw(a.grossSalesUsd * a.rateBcv) + ' · ' + a.saleCount + ' ventas'
      }) +
      MTPUI.statCard({
        label: 'Hoy gané', tone: 'cash',
        value: MTP.fmtUSD(a.netOperatingProfitUsd),
        sub: 'después de costo de mercancía y gastos'
      }) +
      MTPUI.statCard({
        label: 'Tengo en la gaveta', tone: 'info',
        value: MTP.fmtUSD(a.cashUsd),
        sub: MTP.fmtBsRaw(a.cashBs) + ' en efectivo y pago móvil'
      });
  }
```

### 1.4 Las 4 preguntas

```js
  function renderDashQuestions() {
    const a = MTP.getPeriodAnalytics('TODAY');
    const low = MTP.getLowStockItems ? MTP.getLowStockItems() : [];
    const top = (a.topProducts || [])[0];
    const el = document.getElementById('dashQuestions');
    if (!el) return;

    const items = [
      { q: '¿Cuánto gasté?',        a: MTP.fmtUSD(a.totalExpensesUsd), h: a.expenseCount + ' salidas registradas', href: 'facturas.html' },
      { q: '¿Qué se está acabando?', a: low.length,                     h: low.length ? low.map(i => i.name).slice(0,3).join(', ') : 'Todo bien de stock',   href: 'inventario.html?filtro=bajo' },
      { q: '¿Qué se vende más?',    a: top ? top.name : '—',            h: top ? (top.qty + ' unidades') : '',                                            href: 'productos.html' },
      { q: '¿Cuánto de IVA?',       a: MTP.fmtUSD(a.totalIvaUsd),      h: '16% de las ventas gravadas',                                                     href: 'cierres.html' }
    ];

    el.innerHTML = items.map(i =>
      '<a class="dash-question" href="' + i.href + '">' +
        '<span class="dash-q">' + i.q + '</span>' +
        '<strong class="dash-a">' + i.a + '</strong>' +
        '<span class="dash-h">' + (i.h || '') + '</span>' +
      '</a>').join('');
  }
```

### 1.5 Gráficos: los 3 que quedan

| Gráfico | Cambios |
|---|---|
| Ventas por hora | SVG con `viewBox="0 0 480 200"` renderizado a **alto 200 px** (no 125). Etiquetas `font-size="12"`. Dibujar **todas** las horas con venta (no 7-21 fijos). Corregir que el total dibujado = total de `totalDay`. Añadir `role="img"` + `<title>` + `<desc>`. |
| Dinero por método | 1 sola barra apilada por método con su % y monto en texto. **Fusionar con la gaveta** (eliminar el bloque "Arqueo Neto en Mano" duplicado). |
| Cocina vs Tienda | Barras comparando **importes** (`Cocina $X` vs `Tienda $Y`), el % de margen va como texto secundario. Hoy la barra usa el margen y el texto el importe → incongruente. |

### 1.6 `config.js` — analytics con filtro de fecha

```js
  /**
   * Analytics con filtro de periodo. Es la que debe usar el Dashboard.
   * getFinancialAnalytics() queda como "histórico completo" y se renombra
   * a getHistoricalAnalytics() para que nadie la use por error.
   */
  function getPeriodAnalytics(periodType = 'TODAY', filterValue = '') {
    // ... ya existe (config.js:3665). Verificar que:
    //  1) filtra por fecha real
    //  2) devuelve saleCount, expenseCount, totalIvaUsd, cashUsd, cashBs,
    //     topProducts[] con { name, qty, revenueUsd }
    //  3) NO devuelve "histórico" mezclado
  }
```

### 1.7 Eliminar del Dashboard

- Conversión a USDT de la ganancia.
- "Últimas Órdenes y Vueltos" (ya está en Cierres y en el turno de Caja).
- El bloque "Arqueo Neto en Mano" (se fusiona con "Tengo en la gaveta").

---

## 2. `admin/cierres.html` — 3 pasos

### 2.1 Estructura

```html
        <div class="cierre-steps">
          <button class="cierre-step active" data-step="1">1 · ¿Cuánto vendí?</button>
          <button class="cierre-step" data-step="2">2 · ¿Cuánto hay?</button>
          <button class="cierre-step" data-step="3">3 · ¿Cuadra?</button>
        </div>
```

| Paso | Contenido |
|---|---|
| **1** | 4 tarjetas: Vendido · IVA 16% · Gastos · Ganancia. Debajo, un `<details>` con el detalle. |
| **2** | Una tarjeta grande "Dinero en mano" con 3 cifras grandes: Efectivo US$ · Efectivo Bs · Saldo pago móvil. Debajo, **la conciliación por denominación** (nuevo, §2.2). |
| **3** | Las tablas, en **pestañas internas**: Ventas · Actas · Puntos de venta · Pagos móviles · Gastos. |

### 2.2 Conciliación por denominación (NUEVO — el corazón del cuadre)

```html
          <div class="card">
            <div class="card-hd" data-section="dinero">
              <h3>🧾 ¿Cuadra la gaveta? (por billete y moneda)</h3>
            </div>
            <div class="card-bd">
              <table class="data-table" id="tblDenominaciones">
                <caption class="sr-only">Conciliación de efectivo por denominación</caption>
                <thead>
                  <tr>
                    <th scope="col">Moneda</th>
                    <th scope="col">Billete / moneda</th>
                    <th scope="col">Cuántos hay en el sistema</th>
                    <th scope="col">Cuántos contaste</th>
                    <th scope="col">Diferencia</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
```

```js
  const DENOM_USD = [100, 50, 20, 10, 5, 2, 1];
  const DENOM_BS  = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.25, 0.10];

  /**
   * Alimenta la tabla con lo que el sistema cree que hay y deja la casilla
   * "contaste" vacía para que el cajero la llene a mano.
   */
  function renderDenominations() {
    const tbody = document.querySelector('#tblDenominaciones tbody');
    if (!tbody) return;
    const rows = [];

    DENOM_USD.forEach(d => {
      const sys = countUsdBills(d);              // de state.sales[].payments[].bill
      rows.push('<tr><td>US$</td><td>$' + d + '</td><td>' + sys + '</td>' +
        '<td><input class="input" type="number" min="0" data-denom="USD:' + d + '" style="width:80px"></td>' +
        '<td class="denom-diff" data-for="USD:' + d + '">—</td></tr>');
    });
    DENOM_BS.forEach(d => {
      const sys = countBsCoins(d);
      rows.push('<tr><td>Bs</td><td>Bs ' + d.toFixed(2) + '</td><td>' + sys + '</td>' +
        '<td><input class="input" type="number" min="0" step="0.5" data-denom="BS:' + d + '" style="width:80px"></td>' +
        '<td class="denom-diff" data-for="BS:' + d + '">—</td></tr>');
    });
    tbody.innerHTML = rows.join('');
  }
```

> **Requisito**: `state.sales[].payments[]` debe guardar el **billete** recibido. Eso lo garantiza la fase 04 (`p.bill`).

### 2.3 Otros arreglos

| Cambio | Detalle |
|---|---|
| Año dinámico | `cierres.html:371-373` tiene 2025-2027 hardcodeado → generar `<option>` desde el año actual −5 a +1 |
| Un solo filtro de fecha | El selector de fecha del pane Diario, el del Mensual y el del Anual pasan a un control único arriba |
| 8 KPI → 4 | `cierreTotalsGrid` (646-674) + `netDrawerGrid` (679-705) se fusionan |
| Tablas → pestañas | Las 4 tablas del pane Diario se convierten en 4 tabs |
| Impresión | El modal de reporte (860px) se mantiene pero se leen los datos de las nuevas tarjetas |

---

## 3. `admin/inventario.html` — 3 acciones

| Zona actual | Línea | Nueva decisión |
|---|---|---|
| 3 KPI (capital cocina / mercancía / alertas) | 666-691 | **2 tarjetas**: "Valor en el anaquel" y "Se está acabando (N)" |
| Toolbar con 7 botones | 49-78 | **3 botones grandes**: `Llegó mercancía` · `Gasto de cocina` · `Contar lo que hay` + `Más` |
| Calculadora de bulto (6 campos) | 81-132 | **Dentro** del modal "Llegó mercancía" |
| 8 chips de filtro | 137-147 | 2 grupos: `Todo / Cocina / Tienda` + botón `Se está acabando (N)` |
| Buscador 11px | 148 | `var(--fs-md)` (15px), `max-width:280px` |
| Tabla de 9 columnas | 151-166 | **5 visibles**: Artículo+img · Stock · Precio Bs · Margen · `⋯` |
| 4 acciones por fila | 755-762 | Menú `⋯` con 4 opciones |
| Texto explicativo largo | 40-41 | Plegado en un `<details>` "oreigntexto: ¿Qué es cocina y qué es tienda?" |

### 3.1 Botones grandes (nuevos)

```html
        <div class="action-bar">
          <button class="action-btn action-primary" onclick="openMultiPurchaseModal()">
            <span class="action-ico">📦</span>
            <span class="action-txt"><strong>Llegó mercancía</strong><small>Registrar compra, bultos y facturas</small></span>
          </button>
          <button class="action-btn" onclick="openQuickExpenseModal()">
            <span class="action-ico">🧾</span>
            <span class="action-txt"><strong>Gasto de cocina</strong><small>Carne, aceite, harina, aliños</small></span>
          </button>
          <button class="action-btn" onclick="openAuditCountModal()">
            <span class="action-ico">🔍</span>
            <span class="action-txt"><strong>Contar lo que hay</strong><small>Comparar anaquel con el sistema</small></span>
          </button>
        </div>
```

### 3.2 Menú contextual `⋯` por fila

```js
  function openRowMenu(itemId, anchorEl) {
    MTPUI.dialog({
      title: '¿Qué quieres hacer con este artículo?',
      type: 'menu',   // nueva variante de ui.js
      items: [
        { label: 'Ver movimientos (kardex)', run: function () { openKardexModal(itemId); } },
        { label: 'Editar',                   run: function () { openItemModal(itemId); } },
        { label: 'Registrar merma',          run: function () { openWasteModal(itemId); } },
        { label: 'Ajustar por auditoría',    run: function () { openAuditModal(itemId); } }
      ]
    });
  }
```

---

## 4. `admin/productos.html` — dos tabs claros

| Actual | Nuevo |
|---|---|
| Toggle "Catálogo" / "Lector de códigos" (143-146) | Tabs de primer nivel: **Platos de cocina** · **Mercancía del mostrador** |
| Tabla de variantes con 8 columnas (573-584) | 5 columnas: Sabor · Escandallo (chips) · Costo · PVP · Margen + Editar |
| Modal de variante con receta anidada (388-396) | La receta pasa a ser una **pestaña dentro del modal** |
| 2 tablas sin `.data-table` (281, 641) | Se les agrega la clase para que hereden el estilo |

### 4.1 CSS propio a eliminar

`admin/productos.html:10-126` define `.cat-tabs`, `.cat-tab-btn`, `.product-box`, `.prod-thumb`, `.badge-mod`, `.badge-cat-pill`, `.recipe-chip` → **migrar al sistema** de `components.css` (o dejar solo `.product-box`/`.prod-thumb` que sí se usan como layout).

---

## 5. `admin/recetas.html` — 3 tabs

| Actual (4 secciones apiladas) | Nuevo |
|---|---|
| 1. Salida a producción (96-120) | Tab **"Tanda de cocina"** |
| 2. Planificador de olla (123-161) | Tab **"Planificador"** (el card del planificador se calcula **al abrir**, no siempre) |
| 3. Recetario por sabor (164-179) | Tab **"Recetario"** |
| 4. Escandallo de extras (182-192) | Sub-filtro dentro de "Recetario" |

---

## 6. `admin/facturas.html` + compra unificada

**Problema**: hay dos flujos de compra distintos:
- `admin/inventario.html:311-386` → `multiPurchaseModal` (proveedor + forma de pago + renglones + bultos)
- `admin/facturas.html:61-103` → `newInvoiceModal` (proveedor + RIF + vencimiento + renglones) + `prompt()` para abonos (línea 196)

**Decisión**: una sola pantalla **"Compras y gastos"** (`admin/facturas.html`), en 3 pasos:

```
Paso 1 — ¿Qué compraste?     renglones: artículo, bulto/caja/cartón → unidades, costo
Paso 2 — ¿Quién te lo vendió? proveedor, RIF, N° factura, fecha, vencimiento
Paso 3 — ¿Cómo pagaste?      Efectivo US$ / Efectivo Bs / Pago Móvil / Crédito
```

- El modal `multiPurchaseModal` de inventario **se elimina** y se llama a la pantalla unificada.
- `prompt()` de abono → `MTPUI.promptDialog`.
- Se conserva la vista de **cuentas por pagar** (deuda con proveedores) como tabla de la misma pantalla, con una tab.

---

## 7. `admin/precios.html` — 6 tarjetas → 3

| Actual | Nuevo |
|---|---|
| BCV, Euro BCV, USDT | 3 tarjetas: **Tasa BCV** · **Tasa paralela (USDT)** · **Tasa Euro BCV** |
| Brecha BCV↔USDT, BCV↔Euro, Euro↔USDT (3 brechas) | **1** tarjeta: "Cuánto pierdo si compro al paralelo" (brecha BCV↔USDT) |
| Tabla "Platos" con columna Euro BCV | Se **quita** la columna Euro (es jerga para el dueño) |
| "Aplicar Precios Protegidos" (234-245) | **No sobrescribe todo el catálogo de un clic**: mostrar resumen de impacto ("42 artículos, +8% promedio") y pedir confirmación |

---

## 8. Checklist de cierre de la fase 03

- [ ] El Dashboard dice "hoy" y **solo** muestra hoy (verificar con una venta de hace 3 días)
- [ ] El Dashboard tiene 3 cifras grandes, 4 preguntas y 3 gráficos
- [ ] El IVA 16% aparece en el Dashboard
- [ ] El SVG del gráfico horario se lee a simple vista (texto ≥ 12 px)
- [ ] La barra de Cocina vs Tienda compara **importes**
- [ ] `admin/cierres.html` tiene 3 pasos y un **único** filtro de fecha
- [ ] La conciliación por denominación muestra los billetes del sistema y permite contar a mano
- [ ] `admin/inventario.html` tiene 3 botones de acción y una tabla de 5 columnas
- [ ] "Llegó mercancía" crea la compra, actualiza stock y registra el gasto (prueba con 3 artículos)
- [ ] Solo existe **un** flujo de compra en todo el sistema
- [ ] Ninguna pantalla admin tiene un grid fijo que no colapse
