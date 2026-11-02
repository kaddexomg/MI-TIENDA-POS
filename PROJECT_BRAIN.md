# 🧠 PROJECT_BRAIN.md — Cerebro Maestro, Índice Completo y Arquitectura de MI-TIENDA-POS

> **Última actualización**: 1 de Noviembre de 2026 (`20:55 VET`) — **Versión 6 (Estabilizada y Verificada)**
> **Estado Operativo**: Arquitectura Local-First Blindada para Windows 7 (Chromium 109 / Sin GPU / 100% Offline) — Lista para uso en tienda física y preparada para futura sincronización con VPS / Vista Móvil del Dueño.

---

## 1. 📋 RESUMEN EJECUTIVO DE LA ESTABILIZACIÓN V6

1. **Motor Fiscal Venezolano Exacto ([`assets/js/tax.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/tax.js))**:
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
   - Opciones avanzadas agrupadas bajo el desplegable **"⚙️ Más opciones"** (*Platos y productos, Recetas de cocina, Resumen del negocio, Usuarios y claves, Ajustes y respaldos*).
   - Tipografía base aumentada a `15px` y botones táctiles con miniaturas fotográficas reales de `48x48px`.

4. **Catálogo Fotográfico Real 100% Offline (`assets/img/productos/`)**:
   - 47 fotografías reales descargadas de Wikimedia Commons y Open Food Facts, recortadas a `240x240` JPG (`<25 KB`) y documentadas en [`assets/img/productos/CREDITOS.md`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/img/productos/CREDITOS.md).

5. **Suite Automatizada de Pruebas ([`tests/run.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/run.js) y [`tests/tax.test.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/tax.test.js))**:
   - Prueba todos los escenarios fiscales (A–F), ventas mixtas con vuelto en USD y Bs, descuento de ingredientes de cocina por receta, compras de cocina con impacto en gaveta, detector anti-fraude de Pago Móvil y migración `v5 -> v6`.
