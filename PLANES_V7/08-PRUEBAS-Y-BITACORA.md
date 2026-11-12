# 08 — PRUEBAS, BITÁCORA Y DOCUMENTACIÓN

> 🟢 Riesgo bajo, pero **obligatorio**: una fase no se cierra sin esto.

---

## 1. Estructura de pruebas

```
tests/
  run.js          ← corredor principal (ejecuta todo)
  tax.test.js     ← motor fiscal (existente, 106 líneas)
  pos.test.js     ← NUEVO: flujo de caja, vuelto, IGTF
  ui.test.js      ← NUEVO: helpers puros (denominaciones, desglose, formato)
  fixtures.js     ← NUEVO: carrito de ejemplo reutilizable
```

### 1.1 `tests/fixtures.js`

```js
  'use strict';

  const CARRT_2_EMPANADAS = [
    { refId: 'prod-empanada', name: 'Empanada Mechada', qty: 2, priceUsd: 1.30, isDish: true }
  ];

  const CART_MIXTO = [
    { refId: 'prod-empanada', name: 'Empanada Mechada', qty: 2, priceUsd: 1.30, isDish: true },
    { refId: 'prod-malta-polar', name: 'Malta Polar', qty: 1, priceUsd: 0.80, type: 'venta' },
    { refId: 'prod-harina-pan', name: 'Harina P.A.N.', qty: 1, priceUsd: 1.20, type: 'venta' }
  ];

  module.exports = { CARRT_2_EMPANADAS: CARRT_2_EMPANADAS, CART_MIXTO: CART_MIXTO };
```

### 1.2 `tests/ui.test.js` — helpers puros de la interfaz

Casos:
- `suggestChangeBreakdown(7.66)` → `$5 + $2` + resto en Bs redondeado a 0,50.
- `suggestChangeBreakdown(0.40)` → `0` USD + `Bs 16,00` (a tasa 40).
- El desglose por denominación **nunca deja resto** (el algorithm greedy con 100/50/20/10/5/2/1 cubre todo entero).
- `fmtUSD(1234.56)` → `$1.234,56` (formato es-VE).
- `fmtBsRaw(1234.56)` → `1.234,56 Bs`.

> Para poder probar `suggestChangeBreakdown` (que vive en `pos-engine.js`, un IIFE tiedo al DOM), **extraerlo a `assets/js/change.js`** como módulo puro exportable en Node, igual que `tax.js`:

```js
  // assets/js/change.js
  (function (root, factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.MTPChange = factory(); }
  })(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const USD_DENOMS = [100, 50, 20, 10, 5, 2, 1];

    function breakDown(changeUsd, rate, bsStep) {
      const step = bsStep || 0.50;
      const usd = Math.max(0, Number(changeUsd) || 0);
      const wholeUsd = Math.floor(usd + 0.001);
      let remBs = (usd - wholeUsd) * (rate || 0);
      remBs = Math.round(remBs / step) * step;

      const bills = [];
      let rest = wholeUsd;
      USD_DENOMS.forEach(function (d) {
        const n = Math.floor(rest / d);
        if (n > 0) { bills.push({ denom: d, count: n, amount: n * d }); rest -= n * d; }
      });

      return {
        usd: wholeUsd,
        bs: Number(remBs.toFixed(2)),
        bills: bills,
        text: bills.map(function (b) { return '$' + b.amount; }).join(' + ') +
              (remBs > 0 ? ' + Bs ' + remBs.toFixed(2) : '')
      };
    }

    return { breakDown: breakDown, USD_DENOMS: USD_DENOMS };
  });
```

### 1.3 `tests/run.js` — debe ejecutar los tres archivos

```js
  // ... al final de tests/run.js
  console.log('\n▶ Ejecutando tests/ui.test.js ...');
  require('./ui.test.js');
  console.log('▶ Ejecutando tests/pos.test.js ...');
  require('./pos.test.js');
```

---

## 2. Checklist manual por fase (la parte que `node --check` no cubre)

| Fase | Prueba manual |
|---|---|
| **04** | 1) Con IGTF activo, el total del modal coincide con el guardado en `state.sales`. 2) $20 + $5 = $25. 3) Vuelto mal distribuido **bloquea** el cobro. 4) "Efectivo Bs" recalcula el resto. 5) La propuesta dice `$20 + $5 + Bs 12,50`. |
| **01** | 1) Tab muestra foco visible. 2) "Reducir movimiento" desactiva animaciones. 3) No queda ningún `font-size:11px`. |
| **02** | 1) `Ctrl+K` desde 3 pantallas distintas. 2) `↑↓ Enter`. 3) `Ctrl+B` cicla 3 estados y persiste. 4) `Esc` cierra un modal en admin. 5) `F6` registra gasto. |
| **03** | 1) El Dashboard de hoy **excluye** una venta de hace 3 días. 2) La conciliación por denominación muestra el total del sistema. 3) "Llegó mercancía" con 3 artículos actualiza stock y gaveta. 4) Solo hay **un** flujo de compra. |
| **05** | 1) `Ctrl+P` imprime solo el ticket. 2) 1 ticket por página. 3) El ticket trae los pagos. 4) F4 ya no dice `$0.00`. |
| **06** | 1) El escáner no ensucia el monto. 2) Reporte Z dice "Simulado". 3) La trama HKA incluye comprobante y control. 4) Con el servidor apagado, el POS sigue vendiendo. |
| **07** | 1) 1024 / 1366 / 768 / 390 px sin desbordes. 2) Botones ≥ 44 px en móvil. 3) El modal de cobro ocupa la pantalla en móvil. |

---

## 3. Bitácora

### 3.1 `AGENTS.md` — sección de bitácora

Añadir al final de la sección **5. BITÁCORA DE LO REALIZADO**:

```markdown
6. **Rediseño v7 — Experiencia, Diseño y Fiabilidad** (ver `PLANES_V7/`):
   - **Fase 04 — Dinero**: total único con IGTF, botones de billete que acumulan,
     validación dura del vuelto, propuesta de desglose por denominación real
     (US$ 1-100 / Bs 0,10-2.000), resto redondeado a 0,50 Bs, base IGTF correcta
     con punto de venta liquidado en USD.
   - **Fase 01 — Sistema de diseño**: tokens de espaciado/tipografía/movimiento,
     tipografía mínima 12-13 px, `prefers-reduced-motion`, foco visible global,
     componentes canónicos en `assets/js/ui.js` (statCard, confirmDialog,
     promptDialog, trapFocus) y fin de los `prompt()`/`confirm()` nativos.
   - **Fase 02 — Navegación**: paleta de comandos `Ctrl+K`, sidebar en 3 estados
     (completo / íconos / oculto) con botón flotante, atajos globales reales
     (F2 cobrar, F6 gasto, F7 cuadre, Esc cerrar), "Ver mi día" en el topbar.
   - **Fase 03 — Pantallas**: Dashboard de 3 cifras + 4 preguntas, Cierres en 3
     pasos con conciliación por denominación, Inventario con 3 acciones,
     Compra unificada en 3 pasos, Recetas y Productos con tabs.
   - **Fase 05 — Impresión**: `@page 80mm`, un ticket por página, detalle de
     pagos en la nota, rótulo fiscal dinámico, reimpresión desde el turno.
   - **Fase 06 — Hardware**: guarda de campos del lector, camino de cámara
     honesto, puente de puerto COM vía `server/`, trama HKA completa con
     comprobante/control/importe, Reportes X/Z honestos, terminales con
     voucher/lote/liquidación, bitácora inmutable con el journal.
   - **Fase 07 — Responsive**: grids colapsables, móvil del dueño, panel inferior
     de carrito y botón COBRAR al alcance del pulgar.
```

### 3.2 `PROJECT_BRAIN.md` — actualizar

- Versión: `6 → 7`.
- Añadir `assets/js/ui.js`, `assets/js/keys.js`, `assets/js/change.js` al índice.
- Actualizar la sección de "Resumen ejecutivo" con los nuevos comportamientos.
- Corregir el índice de archivos: hoy el README describe una estructura que **ya no** coincide (`assets/img/` sí existe; `admin/recetas.html` sí; falta `ui.js`, `keys.js`).

### 3.3 `README.md` — actualizar

- Hoy dice **"Versión 4.0 Stable"** → corregir a la versión real.
- Añadir las nuevas teclas (`Ctrl+K`, `F6`, `F7`) a la tabla de atajos.
- Actualizar la sección de impresión (80 mm) y la de respaldo (incluye el `server/` local).

### 3.4 `PLANES_V7/00-INDICE-Y-ORDEN.md` — tabla de avance

Ir llenando la tabla de la §8 con fecha, fase, estado y commit.

---

## 4. Definición de "terminado"

Una fase está terminada cuando:

1. ✅ El código de la fase está en su rama y fusionado.
2. ✅ `node tests/run.js` **y** `node tests/pos.test.js` están en verde.
3. ✅ La checklist manual de la fase está marcada **probada de verdad** (no solo escrita).
4. ✅ No queda ningún `console.log` de depuración ni `TODO` sin resolver.
5. ✅ Los documentos (`AGENTS.md`, `PROJECT_BRAIN.md`, `README.md`) reflejan el estado real.
6. ✅ El sistema sigue funcionando en **1024×768** con el texto del sistema al 150%.
7. ✅ No se rompió ninguna regla de negocio v6 (cocina/venta, IVA 16%, exentos, IGTF condicionado, sin seriales ficticios).

---

## 5. Checklist de cierre de la fase 08

- [ ] `node tests/run.js` → todo en verde
- [ ] `node tests/pos.test.js` → 8/8
- [ ] `node tests/ui.test.js` → todo en verde
- [ ] `AGENTS.md` con la bitácora v7
- [ ] `PROJECT_BRAIN.md` con versión 7 y el índice de archivos correcto
- [ ] `README.md` con la versión correcta y los atajos nuevos
- [ ] `PLANES_V7/00-INDICE-Y-ORDEN.md` con la tabla de avance llena
- [ ] `git status` limpio y sin archivos de depuración
