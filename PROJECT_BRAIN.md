# 🧠 PROJECT_BRAIN.md — Cerebro Maestro, Índice Completo y Arquitectura de MI-TIENDA-POS

> **Última actualización**: 12 de Noviembre de 2026 — **Versión 7 (Rediseño de Experiencia, Dinero y Navegación)**
> **Estado Operativo**: Arquitectura Local-First Blindada para Windows 7 (Chromium 109 / Sin GPU / 100% Offline) — Lista para uso en tienda física y preparada para futura sincronización con VPS / Vista Móvil del Dueño.
> **Planes de implementación v7**: [`PLANES_V7/`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PLANES_V7/00-INDICE-Y-ORDEN.md) · Maestro: [`PLAN_REDISEÑO_UX_V7.md`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PLAN_REDISEÑO_UX_V7.md)

---

## 1. 📋 RESUMEN EJECUTIVO DE LA ESTABILIZACIÓN v7

0. **🐛 Corrección crítica**: `admin/cierres.html` tenía el JavaScript **corrupto** (un `</script>` incrustado dentro de una cadena cortaba el bloque y el resto se pintaba como texto en la página). **La pantalla "Cuadre del día" estaba muerta**. Corregido y verificado con `node --check`.
1. **Un solo total (el dinero)**: `computeSaleTotals()` en `assets/js/pos-engine.js` es la **única fuente de verdad**. Antes el total se calculaba sin IGTF en pantalla y con IGTF al guardar: se podía cobrar un número y registrar otro.
2. **Billetes que suman y vuelto con control**: los botones `$1…$100` **acumulan**, no borran lo que el cajero escribe, y el vuelto se propone con **denominaciones reales** (US$ 1-100 / Bs 0,10-2.000, resto en monedas de 0,50). Si la distribución no cuadra, **el cobro se bloquea**.
3. **Fiscal más correcto**: el punto de venta solo genera IGTF si **la terminal liquida en USD**; el vuelto se reporta en sus tres componentes sin mezclar unidades.
4. **Navegación nueva**: **paleta de comandos `Ctrl+K`**, barra lateral en **3 estados** (completo / íconos / oculta) con botón flotante, atajos globales reales (`F2`, `F6`, `F7`, `Esc`) y botón **"🏠 Ver mi día"**.
5. **Dashboard honesto y legible**: filtro de **Hoy / Semana / Mes** (antes decía "hoy" y mostraba el histórico), 4 cifras grandes (vendido, ganado, gaveta, **IVA 16%**), 4 preguntas con respuesta y un gráfico horario corregido.
6. **Impresión real de 80 mm**: un ticket por página, comanda solo si hay platos, **detalle de pagos** en la nota y rótulo fiscal dinámico.
7. **Sistema de diseño v7**: tokens de espaciado/tipografía/movimiento, tipografía mínima 12 px, foco visible en todo el sistema, `prefers-reduced-motion` y diálogos propios (fin de `prompt()`/`confirm()` nativos).
8. **Pantallas administrativas v7**:
   - `admin/cierres.html`: 3 pasos con **conciliación por denominación de billetes y monedas** (USD 1–100 / Bs 0,10–2.000) y selector dinámico de años.
   - `admin/inventario.html`: 3 botones de acción principales (*Llegó mercancía*, *Gasto de cocina*, *Contar lo que hay*), 5 columnas clave y menú contextual `⋯`.
   - `admin/productos.html` y `admin/recetas.html`: estructurados en pestañas claras y escandallo visible.
   - `admin/facturas.html`: compras y gastos unificados en 3 pasos.
   - `admin/precios.html`: tasas simplificadas con cálculo de brecha comercial real.
9. **Hardware y pruebas v7**: guarda anti-foco en el lector de códigos de barras ([`assets/js/barcode-engine.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/barcode-engine.js)), reportes fiscales honestos y suite extendida con [`tests/fixtures.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/fixtures.js) y [`tests/ui.test.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/ui.test.js).

---
   - Cálculo en centavos enteros para evitar errores de coma flotante.
   - **IVA 16% (`G16`)** aplicado a toda la comida preparada (empanadas, arepas, pastelitos, tequeños, papas rellenas, almuerzos, cafetería) y mercancía gravada (refrescos, maltas, cervezas, snacks, cigarros, agua mineral).
   - **Exentos (`E`, 0% Art. 18 Ley de IVA)** para víveres básicos de la cesta venezolana (`Harina P.A.N. Blanca`, `Harina P.A.N. Amarilla`, `Espagueti`, `Arroz Blanco`, `Margarina Mavesa`).
   - **IGTF 3%** condicionado estrictamente a `isContribuyenteEspecial: true` (desactivado por defecto) sobre el monto neto pagado en divisas (`Efectivo USD` menos vuelto en USD + `Zelle`).
   - Eliminación de seriales fiscales ficticios (`Z4A2098124`) y operación honesta por defecto como **Nota de Despacho / Control Interno**.

2. **Orden Comercial de Familias en Caja (`Víveres` en Posición #4)**:
   - `[1]` Empanadas y Fritos · `[2]` Arepas Venezolanas · `[3]` Almuerzos y Platos · `[4]` **Víveres** · `[5]` Refrescos y Maltas · `[6]` Cafetería · `[7]` Chucherías · `[8]` Cervezas · `[9]` Cigarros.

3. **Humanización y Lenguaje Claro para Dueño Mayor**:
   - Menú principal reducido a **5 opciones esenciales**:
     1. 🛒 **Vender (Caja)**
     2. 📦 **Lo que hay en la tienda**
     3. 🧾 **Compras y gastos**
     4. 💰 **Cuadre del día**
     5. 💵 **Precios y tasa del dólar**
   - Opciones avanzadas agrupadas bajo el desplegable **"⚙️ Más opciones"** (*Platos y productos, Recetas de cocina, Usuarios y claves, Ajustes y respaldos*). El **Resumen del negocio (Dashboard)** salió de aquí y vive ahora en el botón **"🏠 Ver mi día"** de la barra superior.
   - Tipografía base aumentada a `15px` y botones táctiles con miniaturas fotográficas reales de `48x48px`.

4. **Catálogo Fotográfico Real 100% Offline (`assets/img/productos/`)**:
   - 47 fotografías reales descargadas de Wikimedia Commons y Open Food Facts, recortadas a `240x240` JPG (`<25 KB`) y documentadas en [`assets/img/productos/CREDITOS.md`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/img/productos/CREDITOS.md).

5. **Suite Automatizada de Pruebas ([`tests/run.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/run.js), [`tests/tax.test.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/tax.test.js), [`tests/pos.test.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/pos.test.js) y [`tests/ui.test.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/ui.test.js))**:
   - Prueba todos los escenarios fiscales (A–F), ventas mixtas con vuelto en USD y Bs, descuento de ingredientes de cocina por receta, compras de cocina con impacto en gaveta, detector anti-fraude de Pago Móvil y migración `v5 -> v6`.
   - **v7**: 12 casos del flujo de caja (total único con IGTF, base IGTF con vuelto mixto, tarjeta en USD vs. Bs, exentos Art. 18, comida preparada gravada, desglose del vuelto con denominación real) + 9 casos de UI y helpers puros con `tests/fixtures.js`.

6. **Rediseño Integral de Identidad Visual, UI/UX y Animaciones v7.1**:
   - Paleta unificada Obsidian Navy & Emerald (`variables.css`), tarjetas elevadas con ribbons de módulo temáticos (`dinero`, `cocina`, `abasto`, `gastos`, `fiscal`), botones táctiles de alta jerarquía y cuadrículas responsivas.
   - Micro-animaciones nativas aceleradas por GPU (`v7FadeIn`, `v7SlideUp`, `v7ScaleIn`, `v7PulseGlow`) 100% compatibles con Windows 7 y Chromium 109.
   - Navegación limpia sin botones flotantes invasivos, barra lateral en 3 estados con colapso fluido (`Ctrl+B`) y barra superior sincronizada.
   - Pantalla de inicio de sesión por PIN (`index.html`) con contenedor fintech moderno, puntitos de PIN animados y teclado numérico táctil.
   - 100% de la suite de pruebas automatizadas y comprobaciones de integridad pasando con éxito.
