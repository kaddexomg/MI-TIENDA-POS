# PLANES v7 — Índice, Orden de Ejecución y Convenciones

> Carpeta de implementación del rediseño de **MI-TIENDA-POS**.
> Cada documento es un plan ejecutable: dice **qué archivo**, **qué zona**, **qué se implementa**, **con qué código** y **cómo se verifica**.
> Documento maestro: [`../PLAN_REDISEÑO_UX_V7.md`](../PLAN_REDISEÑO_UX_V7.md)

---

## 1. Documentos

| # | Documento | Área | Riesgo |
|---|---|---|---|
| 04 | [`04-CAJA-COBRO-Y-VUELTO.md`](04-CAJA-COBRO-Y-VUELTO.md) | **El dinero**: total único, IGTF, vuelto, billetes | 🔴 Alto |
| 01 | [`01-DISENO-SISTEMA.md`](01-DISENO-SISTEMA.md) | Tokens, componentes, movimiento, accesibilidad | 🟢 Bajo |
| 02 | [`02-NAVEGACION-Y-COMANDOS.md`](02-NAVEGACION-Y-COMANDOS.md) | Sidebar ocultable, paleta Ctrl+K, atajos | 🟡 Medio |
| 03 | [`03-PANTALLAS-ADMIN.md`](03-PANTALLAS-ADMIN.md) | Dashboard, Cierres, Inventario, Productos, Recetas, Compras | 🟡 Medio |
| 05 | [`05-IMPRESION-Y-TICKETS.md`](05-IMPRESION-Y-TICKETS.md) | Ticket 80 mm, comanda, nota de entrega | 🟢 Bajo |
| 06 | [`06-HARDWARE-PUERTOS-LECTOR.md`](06-HARDWARE-PUERTOS-LECTOR.md) | Lector USB/cámara, COM, máquina fiscal, terminals | 🟡 Medio |
| 07 | [`07-RESPONSIVE-Y-MOVIL.md`](07-RESPONSIVE-Y-MOVIL.md) | 1024 px, tablet, móvil del dueño | 🟡 Medio |
| 08 | [`08-PRUEBAS-Y-BITACORA.md`](08-PRUEBAS-Y-BITACORA.md) | Tests, bitácora, docs de versión | 🟢 Bajo |

---

## 2. Orden de ejecución (obligatorio)

```
04 (dinero)  →  01 (design)  →  02 (navegación)  →  03 (pantallas)
                      ↓
                05 (impresión)  →  06 (hardware)  →  07 (responsive)
                      ↓
                08 (pruebas y bitácora, cierra cada fase)
```

**Regla dura**: no se rediseña una pantalla que cobra mal. La fase 04 se cierra con `tests/pos.test.js` en verde **antes** de tocar el diseño.

---

## 3. Convención de ramas y commits

```
rama: feature/v7-<area>
commit: <tipo>(<area>): <descripción corta imperativa>

tipos: feat | fix | refactor | ui | docs | test | perf
```

Ejemplos válidos:
```
fix(caja): unificar total con IGTF entre modal, ticket y recordSale
feat(ui): agregar tokens de espaciado, tipografía y movimiento
feat(nav): paleta de comandos Ctrl+K con navegación por teclado
ui(admin): rediseñar dashboard a 3 cifras + 4 preguntas
fix(lector): evitar que el escáner escriba en los campos de monto
```

---

## 4. Reglas no negociables

1. **100% offline**: nada de CDN, nada de fuentes externas, nada de librerías remotas. Todo archivo nuevo va en `assets/`.
2. **Chromium 109**: sin `structuredClone` obligatorio, sin `:has()`, sin `top-level await`, sin módulos ES nativos (`<script type="module">` no).
3. **Nada de `prompt()` / `confirm()` / `alert()` nativos**: usar `MTP.confirmDialog()` / `MTP.promptDialog()` (a crear en `assets/js/ui.js`).
4. **Nada de estilos inline nuevos** en HTML. Todo a clases en `assets/css/`.
5. **Preservar** los comentarios existentes que no traten del cambio.
6. **No tocar** `assets/js/config.js.bak` (ignorado por git).
7. **Toda fase cierra** con su checklist de verificación (§7) ejecutada de verdad: `node --check` **no** es verificación funcional.
8. **Cada fase actualiza** `AGENTS.md`, `PROJECT_BRAIN.md` y el bitácora de versión.

---

## 5. Convenciones de código

```js
// 1.-functions naming
function computeSaleTotals() {}      // verbo + sustantivo
const CHG_RATE_MODE = 'BCV';         // constantes en MAYÚSCULAS

// 2. Dinero SIEMPRE en centavos dentro de cálculos
const cents = MTPTax.toCents(12.34);   // 1234
const usd   = MTPTax.fromCents(cents);

// 3. Todo elemento del DOM se busca una vez y se cachea
const el = document.getElementById('chkTotalUsd');
if (el) el.textContent = MTP.fmtUSD(totalUsd);

// 4. Todo evento que toque el DOM pasa por el bus de estado
document.addEventListener('mtp:state-updated', () => render());
```

---

## 6. Mapa de responsabilidades de archivos

```
assets/css/variables.css   → tokens (color, espacio, tipografía, movimiento, capas)
assets/css/components.css  → botones, tarjetas, tablas, modales, badges, vacíos
assets/css/layout.css      → shell: sidebar, topbar, grid de contenido, responsive
assets/css/pos.css         → caja 3 columnas, ticket, modal de cobro, impresión

assets/js/ui.js    (NUEVO)  → renderStatCard, confirmDialog, promptDialog, toast, focusTrap
assets/js/keys.js  (NUEVO)  → atajos globales + paleta de comandos Ctrl+K
assets/js/tax.js             → motor fiscal (NO tocar la lógica; solo extender APIs)
assets/js/pos-engine.js      → carrito, cobro, vuelto, impresión
assets/js/config.js          → estado central, catálogo, kardex, ventas
assets/js/sidenav.js         → barra lateral, menú,Collapse
assets/js/barcode-engine.js  → lector USB + cámara
assets/js/rates.js           → BCV / Euro / USDT

assets/js/ui.js y assets/js/keys.js se cargan DESPUÉS de config.js/auth.js
y ANTES que pos-engine.js, en todas las páginas admin/ y caja/.
```

---

## 7. Checklist de verificación por fase

| Fase | Verificación obligatoria |
|---|---|
| **04 Dinero** | `node tests/pos.test.js` en verde · cobro con IGTF: total del modal = total del ticket = total guardado · vuelto con cambio de un billete: el monto se **acumula** · validar que un vuelto mal distribuido **bloquea** el cobro |
| **01 Design** | Cargar `admin/index.html` sin errores de consola · 1024×768 sin scroll horizontal en el shell · `:focus-visible` visible con Tab · `prefers-reduced-motion` desactiva animaciones |
| **02 Navegación** | Ctrl+K abre desde cualquier pantalla · `↑↓ Enter` navega · Esc cierra · Ctrl+B colapsa y persiste tras recargar · F6 registra gasto |
| **03 Pantallas** | Cada pantalla responde 3 preguntas en menos de 10 s de lectura · filtro de periodo funciona en Dashboard y Cierres · "Llegó mercancía" crea la compra y actualiza stock y gaveta |
| **05 Impresión** | `Ctrl+P` en la caja imprime **solo** el ticket, en 80 mm, un ticket por página · el ticket incluye el detalle de pagos |
| **06 Hardware** | El escáner no escribe en los campos de monto · "Cámara" no se ofrece si no hay decoder local · Reporte Z dice "Simulado" si no hay máquina |
| **07 Responsive** | 1024×768, 1366×768, 768×1024 y 390×844 sin desbordes · botones ≥ 44 px en móvil |
| **08 Cierre** | `node tests/run.js` y `node tests/pos.test.js` en verde · `AGENTS.md`, `PROJECT_BRAIN.md`, `README.md` con la versión correcta |

---

## 8. Registro de avance

| Fecha | Fase | Estado | Commit | Nota |
|---|---|---|---|---|
| 2026-11-12 | — | Planificación | — | Auditoría inicial y planes v7 |
