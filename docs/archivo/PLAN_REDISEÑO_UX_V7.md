# PLAN DE REDISEÑO — Experiencia, Diseño y Fiabilidad de MI-TIENDA-POS (v7)

> **Destinatario**: agente implementador
> **Repositorio**: `C:\Users\PC\Desktop\MI-TIENDA-POS` (rama `main`)
> **Objetivo**: que un dueño mayor entienda el sistema en 30 segundos, que la caja cobre exactamente lo que debe, y que el sistema crezca sin saturarse.
> **Reglas de negocio v6 (intocables)**: separación cocina/venta, IVA 16% + exentos Art. 18, IGTF 3% solo en divisas y solo si el negocio es Contribuyente Especial, sin seriales ficticios.
> **Restricción de entorno**: Windows 7 / Chromium 109 / 1024×768 / 1366×768 / **100% offline**. Nada de CDN, nada de dependencias nuevas, nada de `structuredClone`, `:has()`, `top-level await`.

---

## 0. Diagnóstico resumido (auditoría real del código)

| Área | Hallazgo | Impacto |
|---|---|---|
| **Caja / dinero** | El total se calcula **sin IGTF** al abrir el modal (`pos-engine.js:840,1324`) y **con IGTF** al cobrar (`pos-engine.js:1471`). `finalizeSale` valida un total distinto al que se registra (`pos-engine.js:1594` vs `config.js:2996`) | Se cobra de menos / se entrega vuelto de más |
| **Vuelto** | No hay control por denominación, no hay validación de la distribución, `rebalanceChangeDistribution('BS_CASH')` **no existe**, el `breakdown` del recibo omite el efectivo en Bs | Error de caja constante |
| **Billetes** | Los botones `$1…$100` **reemplazan** el monto en vez de **acumular** (`pos-engine.js:1372`); `renderPaymentsAndChange` **reescribe** el input del cajero | El cajero cree haber recibido $30 y registra $10 |
| **Impresión** | No hay `@media print` del ticket: `window.print()` imprime **la pantalla POS completa** con dos tickets en rejilla `1fr 1fr` | Ticket inutilizable en impresora térmica 80 mm |
| **Lector** | El buffer USB se escribe dentro de los campos de monto (`barcode-engine.js:12-37`); `BarcodeDetector` no existe en Chromium 109; el modal de cámara usa clases CSS inexistentes | Escaneo corrompe el cobro; cámara no funciona |
| **Máquina fiscal / puertos** | `fiscalConfig.port` se guarda y no se usa; `downloadFiscalCommandFile` nunca se invoca; `emitFiscalReportX/Z` **anuncia éxito sin máquina** y resucita el número ficticio `142` | Promesas falsas al dueño |
| **Dashboard** | 11 bloques, 8 cifras, 4 gráficos (3 de ellos CSS, 1 ilegible a 7 px), `getFinancialAnalytics` **sin filtro de fecha** (dice "hoy" y muestra todo el histórico) | Ruido + datos engañosos |
| **Cierres** | 8 KPI antes de la primera tabla, **14 tablas**, 98 `<th>`, 247 estilos inline | Pantallainautilizable |
| **Inventario / Recetas / Productos** | 9 columnas, 8 chips, 7 botones, 4 acciones por fila, 4 secciones apiladas, 2 flujos de compra distintos | No se sabe dónde actuar |
| **Navegación** | No hay comando global; el Dashboard vive en "Más opciones"; `Escape` no cierra modales en admin; **F6 y F2 anunciados pero inexistentes** | Fricción alta |
| **Responsive** | Solo 3 breakpoints; **todos los grids admin son fijos inline** y nunca colapsan | Ilegible en 1024 px |
| **Accesibilidad** | 4 atributos ARIA en todo el repo, 0 en admin; sin `focus-visible`; `outline:none` sin reemplazo en 2 sitios; 11 px de tipografía en etiquetas | Inaccesible para edad avanzada |
| **Datos** | La venta solo vive en `localStorage` pese a existir `server/journal.js` con fsync | Historial editable a mano |

---

## FASE 0 — Corrección del dinero (BLOQUEANTE, antes que cualquier diseño)

> Nada de esto es cosmético. Es lo que hace que el dueño gane o pierda plata.

### 0.1 Un único total autoritativo
- Crear `assets/js/pos-engine.js::computeSaleTotals()` que calcula **una sola vez** el total con los pagos ya registrados:
  `total = MTPTax.computeTotals({ lines, payments, rateBcv, settings })`.
- `openCheckoutModal`, `renderTicket`, `renderPaymentsAndChange` y `finalizeSale` **deben usar esa misma función**. Se elimina la doble fuente de verdad.
- El IGTF se muestra como **estimado** desde el primer frame: `IGTF 3% (estimado) +$X`, con la tasa efectiva en Bs.

### 0.2 Validación dura del vuelto
- `|usdCash + bsCash + bsPm − change| ≤ $0.01` → si no cuadra, **bloquear el cobro** con mensaje claro ("El vuelto no cuadra: entregaste $X y el vuelto es $Y").
- Implementar `rebalanceChangeDistribution('BS_CASH')` (hoy es código muerto).
- `breakdown` del recibo: incluir las **tres** componentes + la tasa usada.

### 0.3 Denominaciones reales (escritura y lectura de billetes)
- **Botones que acumulan**: cada pulsación `$1/$2/$5/$10/$20/$50/$100` **añade** una línea de pago con etiqueta de billete. El campo "monto recibido" ya **no** se sobrescribe.
- **Vuelto con propuesta de desglose**: usar el componente ya diseñado y huérfano `.vuelto-bills-bar` / `.vuelto-bill-btn` (`pos.css:1109-1133`) para proponer `$20 + $5 + Bs 12,50`.
- **Denominaciones Suggested (Venezuela)**:
  - USD: `1, 2, 5, 10, 20, 50, 100`
  - Bs: `0.10, 0.25, 0.50, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000`
- **Redondeo realista del resto en Bs**: múltiplo de `0,50 Bs` (no centavos), porque el vuelto se entrega con monedas.

### 0.4 Base IGTF correcta
- Base = `min(totalConIVA, patient's pago en divisas − TODO el vuelto entregado en divisas)`.
- El vuelto entregado en Bs **también reduce** la base en divisas (equivalente a la tasa aplicada).
- **Añadir `Punto de Venta` al criterio de divisas** solo si la terminal liquida en USD (`posTerminals.liquidationCurrency === 'USD'`); si liquida en Bs, no genera IGTF.

### 0.5 Guardas de stock y de concurrencia
- `addRetailQuick` **bloquea** la venta si `qty > stock` con mensaje claro.
- `confirm()` en "Vaciar ticket" y al recuperar un pedido en espera.

### 0.6 Registro del pago real
- Cada línea de pago guarda `method, amountUsd, amountBs, rateUsed, reference, billLabel`. Sin esto el cuadre de gaveta no es reproducible.
- Formato numérico **es-VE**: `$1,55` y `1.234,56 Bs` (reemplazar `fmtUSD`/`fmtBsRaw` de `config.js:2591-2612`).

**Entregable**: `tests/pos.test.js` con los casos C1–C7 de la auditoría (total con IGTF, validación de vuelto, acumulación de billetes, `BS_CASH`, base IGTF con vuelto en Bs, IGTF con tarjeta USD, guarda de stock).

---

## FASE 1 — Sistema de diseño (la base de todo el rediseño)

### 1.1 Tokens nuevos (`assets/css/variables.css`)
```
Espaciado:  --sp-1:4px  --sp-2:8px  --sp-3:12px --sp-4:16px --sp-5:24px --sp-6:32px
Tipografía: --fs-xs:12px --fs-sm:13px --fs-md:15px --fs-lg:18px --fs-xl:22px --fs-2xl:30px
Capas:      --z-nav:1000 --z-modal:2000 --z-toast:5000
Foco:       --focus-ring:0 0 0 3px rgba(232,163,23,.55)
Filas:      --row-h:36px
```
- Base global `16px` (subir de 15). **Prohibido 11 px** (hoy en `.stat-l`, `.stat-sub`, buscador de inventario).
- Eliminar `text-transform:uppercase` de los `th` (12 px uppercase es el peor caso para presbicia).
- Subir `--txt-3` a `#475569` y usarlo solo a ≥13 px.

### 1.2 Movimiento con criterio
- Tokens `--dur-fast:120ms --dur:180ms --dur-slow:260ms` y `--ease:cubic-bezier(.2,.7,.3,1)`.
- **Regla global**: `prefers-reduced-motion: reduce` → `animation-duration:.01ms !important; transition-duration:.01ms !important`.
- Micro-interacciones a crear (ausentes hoy): pulso del botón de cobro, "pop" del vuelto, deslizamiento de la tarjeta de venta, skeleton de carga, check animado al confirmar venta, barrido de la gaveta al cuadrar.

### 1.3 Componentes canónicos (`assets/css/components.css` + nuevo `assets/js/ui.js`)
- `renderStatCard({label, value, sub, tone, icon})` → **una sola** implementación en vez de 7 copias de markup KPI.
- `renderBadge`, `renderEmptyState`, `renderSectionTitle`, `confirmDialog()` (reemplaza `prompt()`/`confirm()` nativos), `openSheet()` (modal lateral).
- Migrar las clases ad-hoc (`badge-mod`, `recipe-chip`, `cat-tab-btn`, `fam-tab-pill`, `badge-cat-pill`) al sistema.
- Unificar alias: `.btn-amber→.btn-action`, `.btn-p→.btn-success`, `.btn-ghost→.btn-secondary`.

### 1.4 Accesibilidad (transversal, obligatoria)
- `:focus-visible` global con `--focus-ring`; **quitar** los `outline:none` sin reemplazo (`pos.css:240`, `auth.js:623`).
- `role="dialog" aria-modal="true"` + `Escape` + foco atrapado + devolución del foco al disparador, en **todos** los modales.
- `aria-live="polite"` en `#mtpToastContainer`.
- `scope="col"` + `<caption class="sr-only">` en todas las tablas. Utilidad `.sr-only` (no existe).

---

## FASE 2 — Navegación y "entrar al sistema" desde cualquier parte

> *"Necesitamos una lista/barra que podamos desplegar y ocultar estémos donde estemos."*

### 2.1 Sidebar colapsable real
- Estado en `localStorage` (`mtp_sidebar_collapsed`) ya existe: **persistir también el modo "rail"** (iconos) y un **modo "oculto"** (solo botón flotante de 44 px).
- El botón del toggle debe estar **siempre visible** (incluso en móvil) con tooltip "Ocultar / Mostrar menú (Ctrl+B)".
- Corregir el bug visual: el estado activo usa dos estilos incompatibles (`sidenav.js:361` inline pisa el ámbar de `.aside-link.active`).

### 2.2 Paleta de comandos (Ctrl+K) — **la pieza nueva clave**
- Overlay de búsqueda (tipo Spotlight) que lista **pantallas, acciones y productos**:
  - `Vender` → `caja/pos.html`
  - `Registrar compra` → abre el flujo de compra
  - `Registrar gasto`
  - `Cerrar el día`
  - `Buscar producto…` (búsqueda directa al artículo)
  - `Cambiar tasa del dólar`
  - `Reimprimir ticket`
- Navegación por teclado: `↑ ↓ Enter Esc`, con fuzzy-match tolerante a typos ("compra" ≈ "comprar").
- Es la respuesta a *"no existe una lista a la que podamos ir"* y reduce el menú a un nivel.

### 2.3 Menú de 5 opciones + "Más opciones" (conservar, reordenar)
- Las 5 principales se quedan (son la prueba de usabilidad ya validada), pero **"Resumen del negocio" (dashboard) sube al topbar** como botón "Ver mi día" — es la pantalla que el dueño más necesita y hoy está enterrada en "Más opciones".
- Añadir un **botón "Inicio"** persistente en el topbar que lleva al Dashboard.

### 2.4 Atajos de teclado globales (la navegación no está en la UX)
| Tecla | Acción | Hoy |
|---|---|---|
| `Ctrl+K` | Paleta de comandos | ❌ nuevo |
| `Ctrl+B` | Mostrar/ocultar menú | ✅ (solo desktop) |
| `F1` | Buscar / escanear | ✅ solo POS |
| `F2` | Cobrar | ✅ solo POS → **global** |
| `F3` | Pedido en espera | ✅ solo POS → **global** |
| `F4` | Comanda / reimprimir | ✅ solo POS → **global** |
| `F6` | **Registrar gasto / compra** | ❌ **anunciado pero inexistente** → implementarlo o quitarlo de los 3 botones |
| `F7` | Cuadre del día | ❌ nuevo |
| `Esc` | Cerrar modal / salir de búsqueda | ⚠️ solo POS |
| `Alt+1..5` | Saltar a las 5 pantallas principales | ❌ nuevo |
| `0-9` | Familia en Caja | ✅ solo POS |

- **Teclado numérico prioritario** en Caja (ya lo es) + foco visible permanente.
- Anillo de foco ámbar en TODO el sistema.

---

## FASE 3 — Rediseño de pantallas (menos información, más decisión)

> Principio: **cada pantalla responde 3 preguntas** y esconde el resto detrás de un botón "Ver detalle".

### 3.1 Dashboard → "Mi día en 30 segundos" (`admin/index.html`)
- **Fila 1 — 3 tarjetas gigantes** (una cifra grande, etiqueta en español llano):
  1. 🟢 **"Hoy vendí $X"** (sub: `Bs Y · N ventas`)
  2. 🟡 **"Gané $Z"** (sub: `después de costos y gastos · Bs W`)
  3. 🔴 **"Tengo $E en la gaveta"** (sub: `+ Bs P por pago móvil`)
- **Fila 2 — 4 botones-pregunta** con respuesta y enlace:
  - ¿Cuánto gasté? → `$G · 3 salidas`
  - ¿Qué se está acabando? → `4 artículos` (enlaza al filtro Stock Bajo que ya existe)
  - ¿Qué plato se vende más? → `Empanada mechada · 32 uds`
  - ¿Cuánto de IVA? → `$IVA` (dato fiscal que hoy **falta** en el dashboard)
- **Fila 3 — 3 tarjetas con gráfico simple y útil**:
  - Ventas por hora (**SVG legible**, con `role="img"`, texto ≥12 px, corregir el bug de que las ventas fuera de 7–21 se suman al total pero no se dibujan).
  - Dinero por método (fusionado con la gaveta, sin duplicar el Arqueo).
  - Cocina vs Tienda (la barra debe representar **importes comparados**, no el % de margen → hoy es semánticamente incorrecto).
- **Todo lo demás** (gastos, últimas órdenes, desglose) → accordion **"Muéstrame más"**, cerrado por defecto.
- **Filtro de periodo unificado** (Hoy / Semana / Mes) usando `getPeriodAnalytics()` (`config.js:3665`), NO `getFinancialAnalytics()` sin fecha.
- **Eliminar** del dashboard: conversión a USDT, "Últimas órdenes y vueltos" (ya está en Cierres).

### 3.2 Cierres → 3 pasos (`admin/cierres.html`)
- Un **único selector** (Día / Mes / Año) + un **único filtro de fecha** compartido con el Dashboard.
- **Paso 1 — ¿Cuánto vendí?** → 4 tarjetas: Vendido · IVA · Gastos · Ganancia.
- **Paso 2 — ¿Cuánto hay?** → tarjeta grande "Dinero en mano" con 3 cifras: Efectivo USD · Efectivo Bs · Saldo pago móvil.
- **Paso 3 — ¿Cuadra?** → **conciliación por denominación** (nuevo): tabla de US$ 1/2/5/10/20/50/100 y Bs 0,10…2000 con: sistema / contado / diferencia. Es el corazón del cuadre en Venezuela.
- Las 14 tablas actuales → **pestañas internas** dentro de cada paso ("Detalle de ventas", "Actas", "Puntos de venta", "Pagos móviles", "Gastos").
- Año **dinámico** (hoy hardcodeado 2025-2027 en `cierres.html:371`).
- Cerrar ticket de comanda **no** se imprime si la venta es solo de minimercado.

### 3.3 Inventario → 3 acciones (`admin/inventario.html`)
- **3 KPIs**: Valor de la mercancía en el anaquel · Dinero en cocina · Se está acabando (N).
- **Barra de 3 botones grandes**: ① **Llegó mercancía** ② **Gasto o compra de cocina** ③ **Contar lo que hay**. El resto bajo "Más".
- **Calculadora de bulto** → dentro del modal "Llegó mercancía" (no un card suelto de 6 campos).
- **Unificar los dos flujos de compra**: `inventario.html:311` (factura proveedor + renglones + forma de pago) y `facturas.html:61` (nota de entrega + abonos) → **una sola pantalla "Compras y gastos"**, con cuentas por pagar como subtema.
- Tabla: **9 columnas → 5 visibles** (Artículo+img · Stock · Precio Bs · Margen · `⋯`), el resto en la ficha de detalle.
- 8 chips de filtro → 2 grupos: "Todo / Cocina / Tienda" + botón destacado "Se está acabando (N)".
- 4 acciones por fila → menú `⋯`.
- Buscador 11 px → 15 px, `max-width` 280 px.

### 3.4 Productos → dostabs claros (`admin/productos.html`)
- **Tab "Platos de cocina"** (familias + variantes) y **Tab "Mercancía del mostrador"** (la tabla de 9 columnas hoy escondida tras el toggle "Lector de códigos").
- Tabla de variantes: 8 columnas → 5 (Sabor · Escandallo como chips · Costo · PVP · Margen) + Editar.
- Modal de variante: la receta deja de ser un bloque anidado → **pestaña dentro del modal**.
- Escáner: **un solo flujo** "Recibí mercancía" (con entrada manual + código corto + cámara si existe).

### 3.5 Recetas → 3 tabs (`admin/recetas.html`)
- **Tanda de cocina** · **Planificador de olla** · **Recetario** (con "Extras" como sub-filtro, no 4ª sección apilada).
- Terminología única: "escandallo" (no "costo de receta" / "margen de escandallo" en dos pantallas).

### 3.6 Compras y gastos (pantalla nueva unificada)
- Reemplaza la doble lógica de `inventario.html` y `facturas.html`.
- 3 pasos: **¿Qué compraste?** (renglones con bulto→unidad) → **¿Quién te lo vendió?** (proveedor, RIF, factura, vencimiento) → **¿Cómo pagaste?** (efectivo USD / Bs / pago móvil / crédito).
- Calculadora de bulto integrada (bulto/caja/cartón → unidades → costo y margen USD/Bs).

### 3.7 Precios → 3 tarjetas, no 6 (`admin/precios.html`)
- BCV · USDT paralelo · **"Cuánto pierdo si compro al paralelo"** (una sola brecha; las otras 2 brechas son jerga).
- "Aplicar Precios Protegidos" → **dejar de sobrescribir todo el catálogo de un clic**; mostrar resumen de impacto y pedir confirmación.

### 3.8 Ajustes → separar "del dueño" de "técnico"
- **Ajustes** = datos del negocio, tasa, IVA/IGTF, respaldo (lo que el dueño usa).
- **Configuración técnica** (puertos, máquina fiscal, terminals, journals) → sección aparte, protegida por rol.

---

## FASE 4 — La Caja (el corazón)

### 4.1 El modal de cobro cambia de forma según el método
> *"La pantalla no se transforma dependiendo del método de pago."* — Requisito explícito del dueño.

- **Efectivo USD** → teclado de **billetes** grande ($1 $2 $5 $10 $20 $50 $100) que **acumula**, con contador de "recibido: $X" y propuesta de vuelto.
- **Efectivo Bs** → keypad numérico y **tasa selector** (BCV / paralelo / la que el cajero negocia).
- **Pago Móvil** → banco + referencia + **verificación antifraude en vivo** (duplicado se marca al instante) + lectura del SMS pegado.
- **Punto de Venta** → voucher, lote, aprobación, y si liquida en USD se avisa del IGTF antes de cobrar.
- **Zlelle** → monto USD → Bs a la tasa BCV del día.
- Cada método **cambia el cuerpo del modal** (no tabs que ocultan información: se muestra solo lo que aplica).

### 4.2 Estructura del modal (una sola, coherente)
```
[ Total a cobrar  $ 12,34  =  Bs 528,60 ]   ← cifra gigante, siempre arriba
[ Subtotal | Exento | Base 16% | IVA 16% | IGTF ] ← una línea, 펼nable
[ ¿Cómo paga?  6 botones grandes ]
[ Cuerpo variable según el método ]
[ Recibido: $20  |  Vuelto: $7,66 = Bs 328,60 ]
[ Desglose del vuelto:  $5 + $2 + Bs 0,66 ]
[ ✓ Confirmar cobro  (Enter)   |  Cancelar (Esc) ]
```
- `Enter` cobra, `Esc` cancela, `Tab` recorre en orden visual.
- El **vuelto se entrega como propuesta** (billetes + resto Bs redondeado a 0,50) y el cajero puede ajustarlo.

### 4.3 Ticket lateral (izquierda) simplificado
- Cabecera: tienda, fecha, hora, cajero.
- Ítems: nombre + cantidad + precio (el resto del detalle bajo `⋯`).
- Pie: **Total a cobrar** grande + desglose fiscal de una línea.
- Botón **grande** "COBRAR (F2)" siempre visible.
- Botón **grande** "IMPRIMIR" solo cuando haya venta.

### 4.4 Comanda de cocina
- Separada de la nota de entrega, **una por página**, sin IVA (es comanda, no factura).
- Se imprime **solo** si la venta tiene platos.

---

## FASE 5 — Impresión y tickets (`@media print` real)

### 5.1 CSS de impresión (nuevo bloque en `pos.css`)
```css
@page { size: 80mm auto; margin: 4mm; }
@media print {
  .admin-aside, .admin-topbar, .pos-layout-3col, .modal-ft, .no-print { display:none !important; }
  .thermal-ticket { width: 72mm; border:0; page-break-after: always; }
  .thermal-ticket:last-child { page-break-after: auto; }
}
```
- Hoy `window.print()` imprime **la pantalla completa** con dos tickets lado a lado (`pos-engine.js:1740`).

### 5.2 Contenido de la nota de entrega
- Datos de la tienda (razón social, RIF, dirección, serial si existe).
- Ítems con cantidad, precio unitario, importe.
- **Exento / Base 16% / IVA 16% / IGTF 3% / TOTAL** — en USD referencial **y en Bs a la tasa BCV del día**.
- **Detalle de pagos** (método, monto, banco, referencia) — hoy falta y es crítico para el cuadre y para evidenciar la base IGTF.
- **Vuelto desglosado**.
- Rótulo fiscal **dinámico** según `fiscalData.mode` (hoy es un literal fijo "(SIN VALIDEZ DE CRÉDITO FISCAL)").
- "Reimprimir ticket" desde el turno.

---

## FASE 6 — Hardware: lector, puertos, máquina fiscal, puntos de venta

### 6.1 Lector de códigos de barras
- **Guarda de campos**: si el foco está en un input numérico (`payAmountUsd`, `payAmountBs`) o hay un modal abierto → **no acumular** el buffer y avisar "Quite el foco para escanear". Hoy el código se escribe dentro del monto.
- **Cámara**: `BarcodeDetector` **no existe** en Chromium 109 → cargar un decoder **local** (jsQR/ZXing offline) o **quitar el botón Cámara** y dejar: Lector USB + entrada manual + código corto + **generador de códigos propios** (`generateBarcodeSvg` ya existe) para productos sin EAN.
- Arreglar el CSS del modal de cámara (usa `.modal-head`, `.form-control`, `.btn-primary` → **no existen**).
- **Toast "código no encontrado"** en vez de búsqueda silenciosa.

### 6.2 Puertos de la máquina fiscal (COM1..COM4 / IP) — dejar de ser decorativos
Un navegador **no puede** escribir a un puerto serie. El proyecto ya tiene `server/` (Node). Plan:
1. `POST /api/fiscal/print` en `server/api.js`: recibe la trama fiscal y la escribe al **spooler de Windows** (`C:\spool\...` o `\\.\pipe\...`) o al **puerto COM** vía agente local.
2. El POS manda la trama y **recibe el acuse real** de la impresora.
3. `fiscalConfig.port` pasa a tener efecto; `downloadFiscalCommandFile` queda como respaldo manual.
4. **Completar la trama HKA**: hoy `generateFiscalHkaCommand` **no incluye** número de comprobante, número de control ni serial (sí se calculan en `config.js:3044-3047`) → el archivo sería rechazado por una HKA real. La línea IGTF va **sin importe**.
5. **Reportes X/Z honestos**: `emitFiscalReportX/Z` deben verificar serial + puerto + acuse antes de decir "ejecutado exitosamente"; si no hay máquina → "Simulado (sin máquina conectada)". **Eliminar el `|| 142`** (número ficticio que la v6 quiso borrar).
6. Botón visible **"Descargar trama fiscal"** en el ticket (hoy la función existe y es inalcanzable).

### 6.3 Puntos de venta (terminales)
- `state.posTerminals` existe pero el POS **no la consulta**: hoy es una etiqueta con un campo de texto libre.
- Modelar cada cobro con tarjeta como: `terminalId, batchNumber, voucher, cardType, amount, amountRejected`.
- Si la terminal liquida en USD → el cobro **entra en la base IGTF**.

### 6.4 Cuadre por denominación (Venezuela)
- Tabla de denominaciones (USD y Bs) en Cierres: **sistema / contado / diferencia**, alimentada por los billetes realmente registrados en los pagos y por el vuelto entregado.
- Es la diferencia entre un cuadre "de机箱" y un cuadre "de verdad".

### 6.5 Bitácora inmutable (dejar de depender solo del `localStorage`)
- En `recordSale`, emitir `POST /api/events` (journal con fsync) + snapshot. El `localStorage` deja de ser la única fuente de verdad y el cajero no puede editar el historial.
- `server/api-client.js` ya existe en el cliente con **outbox**: hay que **conectarlo de verdad** (`emitEvent` / `flushOutbox`).

---

## FASE 7 — Responsive y móvil

- **Todos los grids fijos inline** pasan a clases con `repeat(auto-fit, minmax(...))` (hoy nunca colapsan).
- **1024×768** (monitor objetivo): sidebar en rail, tablas con scroll horizontal y **columnas prioritarias visibles**.
- **Tablet/celular** (móvil del dueño):
  - Layout de **una columna**, botón "Cobrar" fijo abajo (thumb reach), carrito lateral deslizable.
  - Dashboard en tarjetas apiladas, sin gráficos densos.
  - **"Mi día" como vista de solo lectura** del dueño desde el celular (requiere sincronización; hoy solo hay `localStorage` → requiere el `server/` + VPS, ya contemplado en `deploy/`).
- Objetivos táctiles ≥ 44 px.

---

## FASE 8 — Orden de ejecución y entregables

| Fase | Nombre | Entregable | Riesgo |
|---|---|---|---|
| **0** | Dinero | `tests/pos.test.js` verde + total único + vuelto validado + billetes que acumulan | Bajo (aislado) |
| **1** | Sistema de diseño | `variables.css` + `components.css` + `ui.js` + a11y + `prefers-reduced-motion` | Bajo |
| **2** | Navegación | Ctrl+K, sidebar ocultable, atajos globales, "Ver mi día" en topbar | Medio |
| **3** | Pantallas | Dashboard, Cierres, Inventario, Productos, Recetas, Compras | Medio |
| **4** | Caja | Modal por método, denominación, propuesta de vuelto | **Alto (toca dinero)** |
| **5** | Impresión | `@media print` 80 mm + ticket con pagos | Bajo |
| **6** | Hardware | Lector, puerto COM vía `server/`, trama HKA completa, terminals, cierre por denom. | Medio |
| **7** | Responsive | 1 columna, móvil del dueño | Medio |
| **8** | Calidad | Tests, bitácora, `AGENTS.md`/`PROJECT_BRAIN.md` actualizados a v7 | Bajo |

### Reglas de trabajo (obligatorias)
1. **Una fase = una rama = un commit** (`feat(v7-ui): ...`, `fix(caja): ...`).
2. **Fase 0 antes que Fase 1**: no se rediseña una pantalla que cobra mal.
3. Nada de "verificado 100%" sin pruebas: cada fase cierra con su lista de verificación.
4. Compatibilidad Chromium 109 estricta: sin `structuredClone` obligatorio, sin `:has()`, sin `top-level await`, sin CDN.
5. **Prohibido** subir el número de versión de la app sin actualizar `AGENTS.md`, `PROJECT_BRAIN.md` y `README.md` (hoy el README dice 4.0 y el código es v6).
6. Todo texto de UI nuevo se escribe **en español venezolano claro**, sin jerga técnica (nada de "escandallo" sin explicarlo, nada de "Kardex" a secas).
7. Cada cambio de UI se valida en **1024×768** y en **1366×768**, y con el texto del sistema al 150%.

---

## FASE 9 — Checklist de "listo para el dueño mayor"

- [ ] Entro al sistema y en **3 toques** llego a vender.
- [ ] Veo **3 cifras** en el dashboard y entiendo si el día fue bueno.
- [ ] En la caja, **cobro** con un botón grande y veo el vuelto **en billetes**.
- [ ] El **ticket impreso** se lee solo, con IVA y pagos.
- [ ] Si hay **mucho flujo**, la pantalla no se satura: el carrito no crece sin límite visual, las tablas tienen scroll y las columnas importantes están fijas.
- [ ] Todo se puede hacer **solo con el teclado**, con foco siempre visible.
- [ ] Los botones tienen **etiquetas en palabras**, no solo íconos.
- [ ] El sistema **no promete** lo que no hace: puertos, cámara y máquina fiscal funcionan o no se ofrecen.
