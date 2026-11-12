# AGENTS.md — Contexto Maestro, Indexación Completa y Bitácora de MI-TIENDA-POS

> **Actualizado**: 1 de Noviembre de 2026 (`20:55 VET`) — **Versión 6 (Estabilización Integral v6)**
> **Cerebro del Proyecto**: Ver también [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md) y [PLAN_ESTABILIZACION_V6.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PLAN_ESTABILIZACION_V6.md)
> **Propósito**: Define las reglas de negocio gastronómicas y comerciales venezolanas, la indexación total del proyecto, la separación estricta de inventario (Ingredientes de Cocina vs. Mercancía de Venta Directa), la facturación con IVA 16% Venezolano e IGTF 3%, el menú simplificado de 5 opciones para el dueño, las 47 fotografías reales verificadas 100% offline y la suite de pruebas automatizadas.

---

## 1. Reglas de Negocio Inviolables: Cocina vs. Minimercado / Venta Directa

1. **Separación Estricta de Inventario (`Cocina` vs. `Minimercado`)**:
   - **Ingredientes Exclusivos de Cocina (`type: 'insumo'`, `sellable: false`)**:
     - Las **papas crudas, los aliños (cebolla, ajo, pimentón, cilantro, cebollín, ají dulce), carnes crudas para guisar/mechar/moler, pollo crudo para freír/guisar, harina de amasar en cocina, arroz de olla, queso/jamón de rellenar, cazón, chicharrón, aceite de freír y envases** **NO SE VENDEN SUELTOS AL PÚBLICO** en la pantalla de Caja.
     - Están obligatoriamente en el inventario de cocina (`kg`, `L`, `und`) porque de allí se descuentan los gramos exactos cuando se elaboran y venden los platos de comida.
   - **Productos de Venta Directa / Minimercado (`type: 'venta'`, `sellable: true`)**:
     - **Víveres Empaquetados (Posición #4 en Caja)**: Harina P.A.N. (Blanca / Amarilla 1Kg), Espagueti / Pasta Larga, Arroz Blanco Primor 1Kg, Margarina Mavesa 500g.
     - **Chucherías y Snacks**: Pepito Frito-Lay, Cheetos, Cheese Tris / Chiskesitos, Doritos, Galletas Samba / Savoy.
     - **Cigarros**: Cajetillas de 20 cigarros (Belmont, Consul) y cigarros detallados por unidad.
     - **Bebidas, Refrescos y Cervezas**: Frescolita, Coca-Cola, Malta Polar (personal 250ml y familiar 1.5L), Agua Mineral Nevada y **Cervezas** (Polar Pilsen, Zulia, Solera Verde, Six-Pack).
     - Se cargan al inventario y se venden mediante **Lector de Código de Barras USB, Cámara Web en Vivo o Código Corto**.
     - Se gestionan con calculadora de compra por **Bulto / Caja / Cartón** a unidades con cálculo automático de margen comercial en USD y Bs.

2. **Orden Oficial de las 9 Familias en Caja (Víveres en Posición #4)**:
   - `[1]` **Empanadas y Fritos** (`fritos`)
   - `[2]` **Arepas Venezolanas** (`arepas`)
   - `[3]` **Almuerzos y Platos** (`almuerzos`)
   - `[4]` **Víveres** (`viveres`) — *Ubicado inmediatamente después de la comida preparada como pilar del negocio*
   - `[5]` **Refrescos y Maltas** (`bebidas`)
   - `[6]` **Cafetería** (`cafeteria`)
   - `[7]` **Chucherías** (`chucherias`)
   - `[8]` **Cervezas** (`cervezas`)
   - `[9]` **Cigarros** (`cigarros`)

---

## 2. Motor Fiscal Venezolano (`assets/js/tax.js`): IVA 16%, Exentos e IGTF 3%

- **Cálculo en Centavos Enteros (`window.MTPTax`)**:
  - **Alícuota General (`G16` = 16%)**: Aplica a toda la comida preparada (empanadas, pastelitos, tequeños, papas rellenas, arepas, almuerzos, café) y a refrescos, maltas, cervezas, chucherías, cigarros y agua mineral embotellada (`pendingAccountantConfirmation: true`).
  - **Exentos (`E` = 0%, Art. 18 Ley de IVA)**: Víveres básicos de la cesta venezolana (`Harina P.A.N. Blanca`, `Harina P.A.N. Amarilla`, `Espagueti / Pasta`, `Arroz Blanco`, `Margarina Mavesa`).
  - **Modos de IVA (`ivaMode`)**:
    - `RECARGO` *(por defecto)*: El precio base del producto se suma al subtotal y se recarga `+16%` de IVA sobre la base gravada en el ticket, modal de cobro, calculadora de vuelto y recibo impreso.
    - `INCLUIDO`: Desglosa internamente la base imponible (`precio / 1.16`) y el IVA sin alterar el PVP final.
  - **IGTF 3% (`isContribuyenteEspecial`)**: Desactivado por defecto (`false`). Solo se cobra sobre pagos netos en divisas (`Efectivo USD` neto de vuelto en USD + `Zelle`) cuando el comercio está designado como Sujeto Pasivo Especial SENIAT.
  - **Sinceridad Fiscal**: Por defecto opera en modo `INTERNO` (*Nota de Despacho / Control Interno — SIN DERECHO A CRÉDITO FISCAL*). El modo de Máquina Fiscal Homologada (`FACTURA.TXT` para The Factory HKA / Bixolon / Aclas) solo se activa cuando existe un serial real configurado por el dueño (sin seriales ficticios quemados en código).

---

## 3. Sincronización Diaria de Tasas (BCV USD, Euro BCV y USDT Binance)

- **Conexión a API Diaria en Vivo (`assets/js/rates.js`)**:
  - Sincroniza automáticamente:
    1. 🏦 **Tasa Oficial BCV USD (Bs/$)**
    2. 💶 **Tasa Oficial BCV EURO (Bs/€)**
    3. 🟡 **Tasa USDT Binance P2P (Bs/$)**
- **Diferencia entre Tasas y Precio Sugerido**:
  - Calcula en tiempo real la diferencia porcentual entre **BCV USD ↔ Paralelo (USDT)** y **BCV USD ↔ Euro BCV** para sugerir precios que protejan la reposición de mercancía.

---

## 4. Índice Completo del Proyecto (`C:\Users\PC\Desktop\MI-TIENDA-POS`)

- **Raíz**:
  - [index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/index.html) — Acceso por PIN (`Administrador` / `Encargado` / `Cajero`).
  - [AGENTS.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/AGENTS.md), [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md) y [PLAN_ESTABILIZACION_V6.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PLAN_ESTABILIZACION_V6.md).
  - [INICIAR-POS.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-POS.bat), [INICIAR-ADMIN.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-ADMIN.bat) e [INSTALADOR-WINDOWS-7.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INSTALADOR-WINDOWS-7.bat).
- **Estilos (`assets/css/`)**:
  - [assets/css/variables.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/variables.css) — Tokens de diseño y tipografía base `15px` legible para adulto mayor.
  - [assets/css/components.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/components.css) — Componentes UI reutilizables con botones de `34px` y celdas claras.
  - [assets/css/layout.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/layout.css) — Barra lateral de `218px` con las 5 opciones principales del dueño.
  - [assets/css/pos.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/pos.css) — Pantalla de Caja (`Zero-Scroll 100vh`), miniaturas reales `48x48px` (`.pos-card-thumb`) y pills `+IVA` / `Exento`.
- **Lógica JS (`assets/js/`)**:
  - [assets/js/tax.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/tax.js) — Motor puro de cálculo de IVA 16%, Exentos e IGTF 3% en centavos enteros.
  - [assets/js/config.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/config.js) — Estado central v6 (`mtp_store_v3`), migración automática `migrateToV6()`, catálogo con 47 imágenes reales locales, inventario separado (`insumo` vs `venta`), compras de cocina (`recordKitchenPurchase`) y detector de Pago Móvil usado.
  - [assets/js/rates.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/rates.js) — Motor multimoneda BCV USD / Euro / USDT Binance.
  - [assets/js/pos-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/pos-engine.js) — Motor de Caja con desglose de IVA en tiempo real, miniaturas de productos reales, Pago Móvil multicuenta y vueltos mixtos.
  - [assets/js/barcode-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/barcode-engine.js) — Escáner por pistola USB y cámara web.
  - [assets/js/sidenav.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/sidenav.js) — Menú simplificado de 5 opciones principales + desplegable `"⚙️ Más opciones"`.
  - [assets/js/icons.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/icons.js) — Librería de iconos vectoriales SVG 100% offline.
- **Imágenes Reales (`assets/img/productos/`)**:
  - 47 fotografías reales optimizadas (`240x240` JPG `<25 KB`) y atribuidas en [assets/img/productos/CREDITOS.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/img/productos/CREDITOS.md).
- **Suite de Pruebas (`tests/`)**:
  - [tests/tax.test.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/tax.test.js) y [tests/run.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/run.js).

---

## 5. ✅ BITÁCORA DE LO REALIZADO

1. **Estabilización V6 Completa (`PLAN_ESTABILIZACION_V6.md`)**:
   - **Fase 1 (IVA 16% + IGTF 3%)**: Motor fiscal exacto en centavos ([`assets/js/tax.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/tax.js)) integrado en carrito, modal de cobro, calculadora de vuelto, registro de venta y recibo impreso.
   - **Fase 2 (Orden de Familias)**: **Víveres** promovido a la posición **#4 (`[4]`)** inmediatamente después de los almuerzos.
   - **Fase 3 (Lenguaje Simple para Dueño Mayor)**: Sustitución de jerga técnica (*Kardex, Merma, Conteo Ciego, Escandallo, RBAC*) por español cotidiano claro en todas las pantallas administrativas.
   - **Fase 4 (Menú Simplificado de 5 Opciones y Tipografía 15px)**: Barra lateral limpia con 5 opciones principales (*Vender, Lo que hay en la tienda, Compras y gastos, Cuadre del día, Precios y tasa del dólar*) y sección colapsable *Más opciones*.
   - **Fase 5 (47 Fotografías Reales Verificadas 100% Offline)**: Imágenes auténticas de cada variedad de empanada, arepa, pabellón, arroz chino, pollo broaster, tequeños, pastelitos, Harina P.A.N. blanca/amarilla, Arroz Primor, Mavesa, Frescolita, Malta Polar, Polar Pilsen, Zulia, Solera Verde, Pepito, Cheetos, Cheese Tris, Doritos y Samba.
   - **Fase 6 (Suite de Pruebas Automatizadas `tests/run.js`)**: Verificación automatizada de cálculos de IVA/IGTF, ventas mixtas, descuento de recetas, compras de cocina, detector anti-fraude de Pago Móvil y migración `v5 -> v6`.

6. **✅ REDISEÑO v7 — Experiencia, Diseño y Fiabilidad** (planes completos en `PLANES_V7/`):
   - **🐛 Corrección crítica**: `admin/cierres.html` tenía el JavaScript **corrupto** (error de sintaxis por un `</script>` incrustado dentro de una cadena). La pantalla **"Cuadre del día" estaba muerta**: todo su JavaScript no se ejecutaba y se mostraba texto basura en la página. **Corregido y verificado**.
   - **Fase 04 — El dinero**:
     - `assets/js/pos-engine.js`: nueva función **`computeSaleTotals()`** = **única fuente de verdad** del total. El modal de cobro, el ticket, el vuelto, la validación y el registro de la venta usan el mismo número (antes el IGTF se recalculaba **después** de cobrar y la venta guardada podía no coincidir con lo cobrado).
     - **Los botones de billete ahora SUMAN** (`$20` y luego `$5` = $25) en vez de reemplazar el monto, y **no borran** lo que el cajero escribe a mano.
     - `addPaymentLine()`: fuente única de pagos, con `bill`, `rateUsed`, terminal, voucher y **moneda de liquidación** de la tarjeta.
     - `renderVueltoValidation()`: si la distribución del vuelto **no cuadra**, el botón de cobro se **deshabilita**.
     - `rebalanceChangeDistribution('BS_CASH')` implementado (antes era código muerto).
     - `assets/js/change.js` (nuevo): motor puro de vuelto con **denominaciones reales** (US$ 1-100 / Bs 0,10-2.000) y resto en Bs redondeado a **0,50** (no hay centavos).
   - **Fase 04 — Motor fiscal** (`assets/js/tax.js`): `isForeignPayment()` (el punto de venta **solo** genera IGTF si la terminal liquida en USD), el vuelto se reporta en sus **tres componentes** sin mezclar unidades, y se devuelven `changeTotalUsd` / `changeTotalBs`.
   - **Fase 01/02 — Diseño y navegación**:
     - `assets/css/design-v7.css` (nuevo): tokens (espaciado, tipografía 12-30 px, movimiento, capas, foco), tarjetas KPI de cifra grande, acordeón "Muéstrame más", diálogos propios y **foco visible** en todo el sistema.
     - `assets/js/ui.js` (nuevo): `statCard`, `confirmDialog`, `promptDialog`, `menuDialog`, `trapFocus`, `emptyState` (eliminan el `prompt()`/`confirm()` nativos).
     - `assets/js/keys.js` (nuevo): **paleta de comandos `Ctrl+K`** (buscar pantalla, acción o producto) con `↑ ↓ Enter Esc`, y atajos **globales reales**: `F2` cobrar, `F6` registrar gasto (antes se anunciaba y no existía), `F7` cuadre, `Esc` cerrar modal, `Ctrl+B` menú.
     - `assets/js/sidenav.js`: barra lateral en **3 estados** (completo / en íconos / oculta) con **botón flotante siempre visible**, estado persistente, y botón **"🏠 Ver mi día"** en la barra superior (el Dashboard sube de "Más opciones" a un clic).
   - **Fase 03 — Dashboard "Mi día"** (`admin/index.html`):
     - **Filtro de periodo** (Hoy / Esta semana / Este mes) — antes la tarjeta decía "hoy" y mostraba **todo el histórico** (`getFinancialAnalytics` sin filtro de fecha).
     - 4 cifras claras: **"Hoy vendí" · "Hoy gané" · "Tengo en la gaveta" · "IVA 16%"** (el IVA no aparecía).
     - **4 preguntas** con respuesta y enlace directo (cuánto gasté, qué se acaba, qué se vende más, cocina vs tienda).
     - El gráfico horario ahora dibuja **todas** las horas con venta (antes las de fuera de 7-21 se sumaban al total pero no se veían), con etiquetas legibles.
     - La barra "Cocina vs Tienda" compara **importes** (antes pintaba el % de margen junto a un texto en dólares).
   - **Fase 05 — Impresión**: `assets/css/checkout.css` con `@page 80mm`, **un ticket por página**, comanda **solo si hay platos**, **detalle de pagos** en la nota de entrega y rótulo fiscal **dinámico**.
   - **Pruebas**: `tests/pos.test.js` (nuevo) con **12 casos** del flujo de caja (total único, IGTF con vuelto mixto, tarjeta en USD vs Bs, exentos, denominación) integrado en `tests/run.js`.
   - **Fase 03 — Pantallas administrativas completadas**:
     - `admin/cierres.html`: pantalla en **3 pasos** (*1. ¿Cuánto vendí?, 2. ¿Cuánto hay?, 3. ¿Cuadra?*) con **conciliación por denominación de billetes y monedas** (USD 1–100 y Bs 0,10–2.000) comparando sistema vs. conteo físico en tiempo real, selector de años dinámico (`año actual - 5` hasta `+1`) y 5 pestañas internas organizadas.
     - `admin/inventario.html`: simplificado a **3 botones de acción principales** (*Llegó mercancía*, *Gasto de cocina*, *Contar lo que hay*), 2 KPIs clave, calculadora de bulto integrada dentro del modal de compra, tabla de **5 columnas clave** y menú contextual `⋯` con `MTPUI.menuDialog` (Kardex, Editar, Merma, Auditoría).
     - `admin/productos.html`: dos pestañas claras (*Platos de cocina* vs *Mercancía de mostrador*), tabla de 5 columnas y modal de variantes con recetas en pestaña interna.
     - `admin/recetas.html`: estructurado en 3 tabs limpios (*Tanda de cocina*, *Planificador de olla*, *Recetario por plato* con extras como subfiltro).
     - `admin/facturas.html`: pantalla unificada de **Compras y Gastos en 3 pasos** (*¿Qué compraste?*, *¿Quién vendió?*, *¿Cómo pagaste?*), abonos con `MTPUI.promptDialog` registrando el egreso en gaveta.
     - `admin/precios.html`: 4 tarjetas de tasas limpias con brecha real BCV↔USDT (*Cuánto pierdo si compro al paralelo*), sin columna Euro en platos, y confirmación previa de impacto al aplicar precios protegidos.
   - **Fase 06 — Hardware, Lector y Máquina Fiscal**:
     - `assets/js/barcode-engine.js`: guarda anti-foco con `isBusyField()`, evitando que la pistola lectora escriba dentro de campos de monto; `e.preventDefault()` en Enter de escáner; aviso toast si un código no existe; detección honesta de `BarcodeDetector` para cámara web con fallback claro.
     - `assets/js/config.js`: reportes fiscales X y Z honestos que indican si la máquina está conectada o si es simulado (eliminando el número ficticio `142`).
   - **Fase 08 — Suite de Pruebas y Fixtures**:
     - `tests/fixtures.js`: carritos canónicos exportables (`CARRT_2_EMPANADAS`, `CART_MIXTO`).
     - `tests/ui.test.js`: 9 pruebas unitarias exhaustivas para `MTPChange.breakDown()` (vuelto en billetes USD y resto en monedas Bs a 0,50), denominaciones Bs, formateadores y guardas de hardware.
     - `tests/pos.test.js`: 12 pruebas del flujo de caja (total único, IGTF con vuelto mixto, tarjeta en USD vs Bs, exentos, denominación).
     - `tests/run.js`: 100% de las pruebas automatizadas (fiscales, v6, UI v7 y caja v7) pasando con éxito.


7. **✅ REDISEÑO GLOBAL DE IDENTIDAD VISUAL, NAVEGACIÓN Y COMPONENTES v7.1**:
   - **Identidad Visual Unificada (Obsidian Navy & Emerald)**: Paleta profesional de tokens CSS (`assets/css/variables.css`) con fondo pizarra suave (`#F8FAFC`), barra de navegación en azul obsidiana profunda (`#0F172A`), bordes finos nítidos (`#E2E8F0`), acentos esmeralda (`#10B981`) para ingresos y ámbar cálido (`#F59E0B`) para llamados de acción.
   - **Navegación Limpia y Sin Bugs (`assets/js/sidenav.js` y `assets/css/layout.css`)**: Eliminación total del botón flotante hackeado `#menuFab` y de la inyección invasiva en el topbar. Barra lateral semántica en 3 estados (completo, íconos y oculta en móvil), colapso fluido mediante atajo `Ctrl+B` o botón en cabecera, y sincronización perfecta del contenido principal sin saltos de scroll.
   - **Sistema de Componentes y Botones Táctiles (`assets/css/components.css`)**: Botones con respuesta háptica (`transform: translateY(1px)` al pulsar, elevación sutil al hover), jerarquía nítida (`.btn-action`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`), tarjetas elevadas con ribbons de categoría (`dinero`, `cocina`, `abasto`, `gastos`, `fiscal`), tarjetas de estadísticas KPI con variantes tonales (`tone-in`, `tone-out`, `tone-info`, `tone-cash`), y utilidades de cuadrícula responsivas (`.grid-2`, `.grid-2-asym`, `.grid-3`, `.grid-4`).
   - **Micro-Animaciones Compatibles con Windows 7 y Chromium 109 (`assets/css/design-v7.css`)**: Transiciones aceleradas por hardware puro (`opacity`, `transform`) con curva `cubic-bezier(0.16, 1, 0.3, 1)`: `@keyframes v7FadeIn`, `@keyframes v7SlideUp`, `@keyframes v7ScaleIn`, `@keyframes v7PulseGlow` para escáner activo y `@keyframes v7BadgePulse` para alertas de inventario crítico.
   - **Armonización de Todas las Pantallas**:
     - `index.html`: Pantalla de acceso por PIN rediseñada con contenedor fintech oscuro, tarjetas de rol con indicador lumínico, puntitos de PIN con animación de relleno suave y teclado numérico con respuesta táctil.
     - `admin/index.html`: Dashboard ejecutivo ordenado en tarjetas interactivas, métricas de periodo en tiempo real y gráficos SVG fluidos sin estilos en línea dispersos.
     - `admin/pos.html` y `caja/pos.html`: Caja compacta Zero-Scroll a 3 columnas con miniaturas de 48px, botón F2 Ámbar gigante para cobro y modal de pago multimoneda con calculadora de denominaciones.
     - `admin/cierres.html`, `admin/inventario.html`, `admin/productos.html`, `admin/recetas.html`, `admin/facturas.html`, `admin/precios.html`, `admin/usuarios.html`, `admin/ajustes.html` y `caja/index.html`: Modernizados con consistencia absoluta en botones, diálogos modales y tablas de datos con cabecera fija.
   - **100% de Pruebas Automatizadas Pasando**: Fiscales, integración v6, UI v7, validación sintáctica de scripts y balanceo de etiquetas HTML.

8. **✅ INTEGRACIÓN DE SPEC KIT Y HABILIDADES DE DISEÑO/ANIMACIÓN AVANZADAS**:
   - **GitHub Spec Kit (`specify-cli 1.4.0`)**: Instalado y configurado en el proyecto (`.specify/`) con integración nativa para Antigravity (`agy`), flujo SDD (`Full SDD Cycle v1.0.1`) y constitución ratificada en `.specify/memory/constitution.md`.
   - **Habilidades de Animación de Emil Kowalski (`emilkowalski/skills`)**: 14 habilidades instaladas en `.agents/skills/` (`animate`, `animation-performance`, `animation-vocabulary`, `apple-design`, `choreograph`, `emil-design-eng`, `find-animation-opportunities`, `gestures`, `improve-animations`, `learn-taste`, `mobile-native`, `remove-animations`, `review-animations`, `break-ui`) más cheatsheets de rendimiento y diseño de componentes.
   - **Artesanía y Calidad UI Impeccable (`pbakaus/impeccable`)**: Suite de diseño profesional en `.agents/skills/impeccable/` para auditorías UX, refinamiento de tipografía, contraste, layout y micro-detalles.
   - **Anti-Slop Frontend Taste (`Leonxlnx/taste-skill`)**: Habilidad `design-taste-frontend` en `.agents/skills/design-taste-frontend/` con referencias de micro-interacciones, fotografía real y acabados pulidos.

9. **✅ IMPLEMENTACIÓN DEL PLAN MAESTRO DE REDISEÑO V8 (Apple Design + Emil Kowalski + Impeccable + Taste)**:
   - **Tokens de Movimiento y Tipografía Óptica (`assets/css/variables.css` y `assets/css/design-v7.css`)**: Integración de curvas fluidas artesanales (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-fluid: cubic-bezier(0.16, 1, 0.3, 1)` y `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`), escala de tiempos ergonómica (`--dur-tap: 80ms`, `--dur-fast: 140ms`, `--dur-normal: 200ms`), tipografía tabular obligatoria (`font-variant-numeric: tabular-nums`) en precios y totales, tap target mínimo de 44px y salvaguarda estricta `@media (prefers-reduced-motion: reduce)`.
   - **Bóveda de Acceso y Teclado Táctil por PIN (`index.html` — Modo Persuade Bolder)**: Contenedor en vidrio obsidiana profundo con doble relieve especular (`backdrop-filter: blur(20px)`), tarjetas de rol con feedback háptico en `pointerdown`, teclado numérico táctil de 52px con respuesta inmediata (`scale(0.95)`), indicador de PIN con animación de relleno suave (`springFill`) y sacudida horizontal de resorte inercial (`springShake` damping 0.8) ante PIN erróneo. Corrección de bloques CSS duplicados.
   - **Caja Rápida Zero-Scroll (`assets/css/pos.css` — Modo Operate Quieter)**: Botón Ámbar gigante F2 de 52px con micro-hundimiento de 80ms (`scale(0.97)`), tarjetas de catálogo con números tabulares sin saltos de alineación, respuesta de resorte en selección de producto y modal de cobro multimoneda con calculadora física de billetes y redondeo a 0.50 Bs.
   - **Cuadre del Día y Arqueo Físico (`admin/cierres.html`)**: Micro-celebración inercial (`spring-pop`) en el badge de gaveta cuadrada exacta (`$0.00`) al empatar el conteo físico de denominaciones reales frente al sistema.
   - **Verificación Automatizada 100% Verde**: Pruebas fiscales, integración v6, UI v7, pruebas de flujo de caja (`tests/run.js`), balanceo semántico HTML (`tools/check-html.js`) y validez de scripts en línea (`tools/check-scripts.js`) pasando al 100%.

10. **✅ FLUJO RADICAL DE GESTIÓN RÁPIDA EN 5 SEGUNDOS Y PRODUCT SHEET DRAWER ESTILO APPLE (`assets/js/product-drawer.js`)**:
    - **Apple-Style Sliding Sheet Drawer**: Componente deslizante desde la derecha con curva inercial WWDC (`--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`), backdrop scrim con desenfoque de 12px (`backdrop-filter: blur(12px)`), trampa de foco y cierre accesible por tecla `Esc` o clic exterior.
    - **Control Segmentado Táctil y 9 Familias**: Alternancia en 1 toque entre *Plato de Cocina* (preparado al momento) y *Mercancía / Víveres* (empaquetado). Selector de 9 categorías venezolanas con emojis y clasificación automática de IVA según Art. 18.
    - **Cálculos en Tiempo Real**: Cálculo automático del PVP en Bolívares usando la tasa BCV del día y visualización inmediata de margen de ganancia comercial (% y USD) al escribir el costo estimado.
    - **Selector Visual de 47 Fotos Locales Offline**: Miniatura destacada con cuadrícula desplazable de las 47 fotografías auténticas locales (`empanadas.jpg`, `arepas.jpg`, `pabellon.jpg`, `harina-pan.jpg`, `malta.jpg`, `polar.jpg`, etc.).
    - **Acceso Inmediato desde Caja y Administración**:
      - Botón `[+ Producto]` en la barra de herramientas de Caja (`admin/pos.html` y `caja/pos.html`).
      - Botón táctil `✏️` sobre cada tarjeta de producto en el catálogo y en resultados de búsqueda para editar precio, nombre o pausar en 5 segundos sin resetear ni perder la orden activa del cliente.
      - Botón `+ Crear producto ahora` en búsquedas sin resultados.
      - Integración en `admin/productos.html` y `admin/inventario.html` con actualización reactiva instantánea.
    - **Métodos Core en `MTP`**: `quickSaveItem(payload)`, `deleteProduct(id)`, `toggleProductAvailability(id)`, `getItemById(id)` y evento desacoplado `mtp:state-updated`.
    - **Suite de Pruebas 100% Pasando**: Pruebas fiscales, integración v6, UI v7, pruebas de caja y Test 8 de creación/edición/pausado rápido pasando limpiamente.

11. **✅ ESTRUCTURA JERÁRQUICA DE CÓDIGOS, GENERADOR DE ETIQUETAS DE CÓDIGOS DE BARRA Y DESPLIEGUE FLUIDO DE NAVEGACIÓN**:
    - **Corrección Definitiva del Plegado/Desplegado de la Barra Lateral**:
      - Eliminada la regla que ocultaba el botón colapsador (`body.aside-collapsed .aside-collapse-btn { display: none !important; }`), reemplazándola por un botón circular luminoso de 28px con `▶` siempre accesible.
      - Evento de clic en el encabezado de marca (`.aside-brand`) para expandir con 1 toque en modo colapsado, además del atajo global `Ctrl+B`.
      - Identidad cromática única y vibrante por sección (`theme-pos`, `theme-inv`, `theme-gastos`, `theme-cierres`, `theme-precios`, `theme-productos`, `theme-cocina`, `theme-etiquetas`, `theme-usuarios`, `theme-ajustes`).
    - **Estructura Inteligente de Códigos y Subformatos (`assets/js/code-structure.js`)**:
      - Prefijos mnemotécnicos oficiales por subformato: `EMP-` (empanadas), `PAS-` (pastelitos), `TEQ-` (tequeños), `PAP-` (papas rellenas), `MAN-` (mandocas), `ARE-` (arepas), `ALM-` (almuerzos), `VIV-` (víveres), `BEB-` (bebidas), `CAF-` (cafetería), `CHU-` (chucherías), `CER-` (cervezas), `CIG-` (cigarros).
      - Autonumeración incremental inteligente (`suggestNextCode`) y generación estándar de código de barras 759 (Venezuela).
    - **Generador e Impresor Térmico de Códigos de Barras 100% Offline (`assets/js/barcode-printer.js`)**:
      - Motor vectorial Code 128-B en SVG puro sin dependencias de fuentes externas ni CDN.
      - Formatos compatibles: Térmica 50x30mm (adhesivos para vitrina y bandejas de cocina), 58mm/80mm ticketera y hoja completa.
      - Información completa en etiqueta: Nombre del producto, código formateado, código de barras escaneable, precios en $ y Bs (tasa BCV), pastilla fiscal (`+IVA 16%` / `Exento Art. 18`), fecha/hora y control de tandas de cocina (`Tanda Mañana`, `Tanda Tarde`, `Tanda Noche`).
    - **Acceso Directo Multi-Pantalla**:
      - Botón `[🏷️ Etiquetas]` en la barra de herramientas de Caja (`admin/pos.html` y `caja/pos.html`).
      - Botón `[🏷️ Imprimir Etiquetas]` en cabecera y en cada fila de variantes/productos de `admin/productos.html`.
      - Botón `[🏷️ Etiquetas]` y opción en menú `⋯` de cada fila en `admin/inventario.html`.
      - Botón `[🏷️ Etiqueta de Tanda]` para bandejas de producción en `admin/recetas.html`.
      - Enlace `"🏷️ Imprimir Etiquetas"` con badge de novedad en el menú lateral.
    - **Suite de Pruebas `tests/barcode.test.js` (8/8 OK)** integrada en `tests/run.js` (100% de pruebas automáticas pasando).
