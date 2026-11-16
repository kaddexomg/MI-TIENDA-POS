# PLAN V8.4 — "FLUJO SIMPLE" + ESCÁNER PISTOLA UNIVERSAL + PIEL MATERIAL 3

> **Fecha**: 16 de Noviembre de 2026
> **Objetivo**: Que el dueño (persona mayor, poca tecnología) pueda **vender, controlar inventario y registrar gastos** sin perderse, con un escáner que funciona como pistola inalámbrica (teléfono → Caja o Inventario, según el momento), estadísticas de cierre diario/mensual/anual fáciles de leer, conexión guiada de máquina fiscal y una piel visual nueva basada en **Material 3 (Material Web de Google)** con el movimiento artesanal de las skills de Emil Kowalski.
> **Regla de oro**: **NO se elimina ninguna función existente.** Se reorganiza, se renombra en lenguaje cotidiano y se guía. Todo lo actual (cierres, arqueo, fiscal, recetas, tandas, etiquetas, tasas, IA de fotos, Pago Móvil por SMS) se conserva.

---

## 0. Principios inviolables de este plan

1. **Cero funciones removidas**: solo se simplifica el camino para llegar a ellas. Lo avanzado queda bajo "Más opciones", intacto.
2. **Lenguaje de dueño, no de sistema**: "Llegó mercancía" en vez de "Entrada de inventario"; "Cuadre del día" en vez de "Cierre de caja Z".
3. **Constitución técnica vigente**: 100% offline, cero CDNs, 60 fps en Windows 7 SP1 / Chromium 108 (Electron 22 ia32), sin `backdrop-filter` en la PC, tipografía tabular, `prefers-reduced-motion` respetado.
4. **Lección del 12-nov registrada**: NADA de neón, fondos oscuros saturados ni resplandores discordantes. Luz limpia, alto contraste, acentos sobrios.
5. **Motor fiscal y de vuelto blindados**: `tax.js`, `computeSaleTotals()`, `change.js` y el journal anti-apagones NO se reescriben; solo se les mejora la capa de presentación.
6. **Evidencia por fase**: cada fase termina con `tests/run.js` + `check-html` + `check-scripts` en verde antes de avanzar.
7. **Secretos fuera del repo**: llaves Gemini y tokens solo en `C:\MI-TIENDA-DATOS\`.

---

## 1. Línea base (lo que ya existe, sin commitear — v8.4 en progreso)

| Pieza | Estado |
|---|---|
| `mobile/scanner.html` + `mobile/barcode-scanner.js` | ✅ Escáner web/APK con cámara, decodificador puro JS (EAN-13/8, Code-128), linterna, foto, multiplicador, entrada manual |
| Emparejamiento | ✅ Código fijo de 6 dígitos por servidor (`scanner.pair` en carpeta de datos) + PIN; link `/escaner?pair=XXXXXX` |
| Transporte en vivo | ✅ `POST /api/v1/scanner/scan` → SSE `barcode_scan` → la Caja en la PC recibe al instante; polling de respaldo |
| Modos actuales del teléfono | ⚠ Solo `POS_ADD` (enviar a Caja) y `LOOKUP` (consultar precio). El servidor ya acepta `INVENTORY_FILL` pero nadie lo usa |
| HTTPS local | ✅ `server/ssl.js` genera certificado autofirmado (puerto 7443) para que la cámara funcione en teléfonos por Wi-Fi |
| Link permanente / VPS | ✅ El mismo servidor corre en PC (LAN) o VPS (`deploy/deploy-vps.sh` + nginx); el link vale para cualquier teléfono |
| Modal "📷 Escáner" en la PC | ⚠ Muestra el código de enlace como texto, **falta QR escaneable** |
| Inventario recibe escaneos remotos | ❌ `admin/inventario.html` NO escucha el SSE del escáner (solo la Caja lo hace) |
| Enrutamiento automático por pantalla activa | ❌ No existe: el teléfono no sabe si la PC está en Caja o en Inventario |

---

## 2. Fases de implementación

### F0 — Asegurar la base (½ día)
- Ejecutar suite completa (`tests/run.js`, `server/test-journal.js`, `check-html`, `check-scripts`, `npm --prefix desktop test`) y registrar resultado.
- Commit del trabajo v8.4 actual (escáner + HTTPS) como base limpia: `feat(v8.4-base): escáner móvil, enlace de emparejamiento y HTTPS local`.
- **Criterio**: todo verde + repo sin cambios sueltos.

### F1 — Escáner pistola universal: 3 destinos + modo automático (2 días)
**El corazón del pedido.** Un solo enlace permanente; cualquier teléfono lo abre y es una pistola.

1. **Servidor** (`server/api.js`):
   - Nuevo `POST /api/v1/scanner/context`: la PC anuncia su pantalla activa (`pos` / `inventario` / `gastos` / `otra`) con heartbeat cada 20 s.
   - El SSE `barcode_scan` y `GET /api/v1/scanner/info` incluyen ese contexto.
   - Modo `AUTO` en `POST /scan`: si el teléfono manda `AUTO`, el servidor resuelve el destino según la pantalla activa de la PC (Caja → `POS_ADD`; Inventario → `INVENTORY_FILL`; otra → `LOOKUP` con aviso).
2. **Teléfono** (`mobile/scanner.html`):
   - Selector grande de 4 opciones: **[🛒 Vender]** · **[📦 Inventario]** · **[🔍 Consultar]** · **[🖥️ Automático]** (por defecto: Automático, con etiqueta visible "Ahora mismo va a: CAJA").
   - Feedback claro tras cada lectura: "✅ Sumado al ticket de la Caja" / "📦 Abierto en Inventario de la PC" / "⚠ Código no registrado".
3. **Inventario en la PC** (`admin/inventario.html` + `barcode-engine.js`):
   - Suscribirse al SSE del escáner (hoy no lo hace).
   - Escaneo en modo inventario → abre el modal **"Llegó mercancía"** con producto, cantidad y costo listos para confirmar; acepta insumos de cocina (kg/L/und) y mercancía (und/bulto).
   - Escaneo durante **"Contar lo que hay"** → suma al conteo físico de ese producto.
4. **Caja en la PC** (`pos.html`): ya recibe; añadir destello + sonido suave + tarjeta "llegó del teléfono" para que el cajero vea de dónde vino.
5. **QR del enlace** (nuevo `assets/js/ui/qr.js`, generador puro offline ~20 KB, licencia MIT, vendorizado):
   - En el modal "📷 Escáner" de la Caja y en Ajustes: **QR grande** de `https://<IP>:7443/escaner?pair=XXXXXX` + código de 6 dígitos + botón "Copiar enlace".
   - Guía visible de 2 pasos para el teléfono: "1. Escanea este QR con la cámara del teléfono · 2. Acepta el certificado la primera vez".
6. **Puerto constante**: HTTP 7070 + HTTPS 7443 siempre activos en la PC; en VPS el mismo enlace vía nginx (ya existe `deploy/`). Varios teléfonos pueden conectarse a la vez con el mismo código.
- **Criterio**: escanear desde 2 teléfonos distintos suma al ticket con la Caja abierta; con Inventario abierto, abre "Llegó mercancía"; modo manual siempre puede forzar destino. Tests nuevos de enrutamiento AUTO.

### F2 — Registrar la venta sin perderse (1½ días)
- Flujo visible de **3 pasos** en la Caja: **① Escanea o toca el producto → ② Cobra (F2) → ③ Entrega vuelto y ticket**. Indicador de paso actual siempre visible.
- Banner guía contextual: carrito vacío → "Escanea un código o toca una foto para empezar"; producto no registrado → botón grande "Crear este producto ahora" (drawer de 5 segundos ya existente).
- Botón único gigante de cobro (ámbar, ya existe) + resumen "Total en $ y Bs" sin jerga fiscal en primer plano (el desglose IVA queda visible pero secundario).
- **No se toca** `computeSaleTotals()`, IGTF, vuelto ni Pago Móvil por SMS.
- **Criterio**: una persona puede cobrar una venta mixta (empanadas + harina + refresco) siguiendo solo los indicadores de pantalla; 12 pruebas de caja siguen verdes.

### F3 — Inventario entendible: entrada por unidad/cantidad con código de barras (1½ días)
- Pantalla con los 3 botones grandes ya existentes, reforzados: **[📦 Llegó mercancía]** · **[🍳 Gasto de cocina]** · **[🔢 Contar lo que hay]**.
- "Llegó mercancía" guiado: **escanea (o busca) → ¿cuántas unidades? (und / bulto / caja / cartón con calculadora integrada) → ¿cuánto costó? → confirmar**. Margen sugerido en $ y Bs visible al escribir el costo.
- Alta de producto nuevo en el mismo flujo si el código no existe (drawer existente, sin salir de la pantalla).
- Kardex renombrado a lenguaje claro: **"Qué entró · Qué salió · Qué queda"**, con filtro por producto y fecha.
- Conteo físico con escáner: cada lectura suma 1 (o la cantidad elegida) al conteo; el sistema muestra diferencia vs. lo que debería quedar.
- **Criterio**: entrada de mercancía por bulto con barcode en <30 s y sin tocar el teclado; pruebas de integridad de catálogo verdes.

### F4 — Gastos y compras simples (½ día)
- Se conserva la pantalla de 3 pasos (*¿Qué compraste? · ¿Quién vendió? · ¿Cómo pagaste?*).
- Refuerzo: atajo F6 desde cualquier pantalla, lista "Gastos de hoy" con total grande, categorías en lenguaje cotidiano (cocina, mercancía, servicios, otros).
- **Criterio**: registrar un gasto en <20 s; el egreso aparece en gaveta y en "Mis números".

### F5 — Cierres y estadísticas: diario / mensual / anual en una sola vista (1½ días)
- Nueva vista unificada **"Mis números"** (evoluciona `admin/index.html`, sin borrar nada):
  - Selector de periodo grande: **Hoy · Esta semana · Este mes · Este año** (y rango personalizado bajo "Más opciones").
  - 6 cifras grandes y claras: **Vendí · Gané · Tengo en la gaveta · Gasté · IVA cobrado · Se está acabando**.
  - Gráfico horario (solo Hoy) y gráfico de barras por día (semana/mes/año), SVG puro, etiquetas legibles.
  - Enlaces directos: "Ver cuadre del día" (arqueo por denominaciones, intacto), "Ver qué se vende más", "Cocina vs Tienda".
- El arqueo físico de `admin/cierres.html` se conserva completo; se enlaza como "Cuadre del día" desde Mis números y desde el menú.
- **Criterio**: el dueño responde "¿cuánto vendí este mes?" en 1 toque; los números cuadran con el journal (test de integridad).

### F6 — Máquina fiscal: conexión guiada paso a paso (1 día)
- Asistente en `admin/ajustes.html`: **"¿Tienes máquina fiscal?"** → No (modo interno, nota de despacho, honesto) / Sí → marca (**The Factory HKA · Bixolon · Aclas**) → serial real → puerto/conexión → **probar conexión** con resultado visible (✅ conectada / ❌ qué falló y cómo arreglarlo).
- Estado siempre visible en la Caja: pastilla "Nota interna" vs "Máquina fiscal conectada". Reportes X/Z honestos (ya existe la base; se completa el flujo guiado).
- **Nunca** seriales ficticios; sin máquina configurada todo sigue funcionando en modo interno.
- **Criterio**: el asistente se completa sin ayuda externa; tests fiscales verdes; simulación documentada como simulación.

### F7 — Móvil administrativo alineado (1 día)
- `mobile/index.html` con la misma jerarquía: **🛒 Vender (abre escáner) · 📦 Inventario · 💸 Gastos · 📊 Mis números** + Control (servidor, interfaz viva, tema).
- Botón grande **"📷 Escáner"** que abre `scanner.html` con el modo Automático; entrada de mercancía y gastos replicada en versión táctil simple.
- "Mis números" móvil con las mismas 6 cifras del periodo.
- Se conserva la **cáscara viva** (APK carga UI del servidor) → rebuild `MI-TIENDA-ADMIN.apk` **1.2.0** (versionCode 3) con `tools/build-mobile-apk.ps1`.
- **Criterio**: login → escanear → venta reflejada en la PC; entrada de mercancía desde el teléfono reflejada en el inventario; APK firmado y verificado.

### F8 — Piel visual Material 3 + movimiento Emil Kowalski (2 días)
**Referencia**: `material-components/material-web` (Material Design 3 de Google) + skills instaladas en `.agents/skills/` (`emil-design-eng`, `animate`, `choreograph`, `apple-design`, `impeccable`, `design-taste-frontend`, `animation-performance`).

- **Decisión técnica recomendada**: adoptar el **lenguaje Material 3 como tokens CSS puros** (color tonal, superficies, esquinas redondeadas M3, state layers, tipografía y elevación) sobre los 3 CSS consolidados + `mobile.css`. **No** importar la librería `@material/web` completa: está en *maintenance mode*, añade Lit + shadow DOM y pone en riesgo los 60 fps en Chromium 108 / Win7. (Alternativa híbrida: vendorizar solo 2-3 componentes puntuales si se aprueba.)
- Paleta: luz limpia M3 con el navy `#09131F` de la barra lateral, acento esmeralda para dinero y ámbar para cobro (se conserva la identidad actual, se refina con superficies tonales M3). Modo oscuro recalibrado, nunca inversión mecánica.
- Componentes: botones M3 (filled / tonal / outlined / text) con state layer al hover/press, tarjetas con esquinas M3 (12-28 px), campos de texto con label flotante, diálogos y sheets con las curvas ya definidas (`--ease-drawer`).
- Movimiento (skills Emil): solo `transform`/`opacity`, duraciones 80-200 ms, `cubic-bezier(0.23,1,0.32,1)`, coreografía de entrada en cascada suave, respuesta háptica `scale(0.97)` en tap, `prefers-reduced-motion` total. Cero animaciones decorativas infinitas.
- Aplicación por capas: `tokens.css` (nuevos tokens M3) → `app.css` (componentes) → `pos.css` (caja) → `mobile.css` + `scanner.html`.
- **Criterio**: auditoría con `impeccable`/`review-animations` pasada; 60 fps medidos en la Caja con 100+ productos; contraste AA en textos y cifras; nada de neón.

### F9 — Verificación total y empaquetado (½ día)
- Suite completa + pruebas nuevas (enrutamiento AUTO, modo inventario, QR, cierre anual).
- `tools/check-html.js`, `tools/check-scripts.js`, `server/test-journal.js`, `npm --prefix desktop test`.
- Rebuild instalador Win7 (`tools/build-win7-installer.ps1`) con `--smoke-test` + APK 1.2.0.
- Actualizar `AGENTS.md` (bitácora v8.4) y `README.md`.
- **Criterio**: 100% verde + instalador y APK probados + bitácora escrita.

**Duración estimada total: ~11 días de trabajo agente (paralelizable por fases independientes F2-F6).**

---

## 3. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `@material/web` en maintenance mode + Chromium 108 | Tokens CSS M3 puros (recomendado); componentes vendorizados solo si se aprueba y pasan prueba en Electron 22 |
| Certificado HTTPS autofirmado asusta al teléfono | Guía de 2 pasos con botón grande "Activar cámara segura"; fallback foto nativa (`capture`) que no requiere HTTPS |
| Repetir el error estético del 12-nov | F8 parte de la identidad Light actual; revisión visual con el dueño antes de aplicar a todas las pantallas |
| Escaneo duplicado (teléfono + pistola USB a la vez) | Dedupe por código+ventana de 1,35 s ya existente en el motor; se extiende al bus SSE |
| VPS sin dominio/certificado propio | El link LAN funciona igual; en VPS se reutiliza nginx existente y se documenta el puerto |
| Persona mayor se pierde con tantas pantallas | Menú de 3 pilares + "Mis números" + "Más opciones" (todo lo demás intacto, un nivel abajo) |

---

## 4. Decisiones confirmadas por el dueño (16-nov-2026)

1. **Piel M3**: ✅ **Tokens CSS puros** (sin librerías externas; seguro en Win7 / Chromium 108, 60 fps, 100% offline).
2. **Estilo extra**: ✅ **Liquid Morph** (primo hermano del glassmorphism): paneles con apariencia de vidrio líquido, bordes suaves y reflejos sutiles.
   - **En teléfonos y PCs modernas**: `backdrop-filter: blur()` real, moderado (8-14 px), solo en modales/sheets/topbar, nunca en listas largas.
   - **En Windows 7 / Electron 22**: vidrio **simulado** con capas semitransparentes + gradientes suaves precalculados (sin `backdrop-filter`), mismo aspecto, 60 fps intactos.
   - Siempre en **versión clara** (luz limpia): nada de vidrio oscuro neón (lección del 12-nov).
3. **Modo del escáner por defecto**: ✅ **Automático por pantalla activa de la PC**, con botones para forzar Vender / Inventario / Consultar.
4. **VPS**: ✅ **LAN primero, VPS preparado** (deploy nginx existente listo para activar cuando el dueño quiera).
