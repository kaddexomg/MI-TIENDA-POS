# MI-TIENDA-POS Constitution

## Core Principles

### I. Separación Estricta de Inventario (Cocina vs. Minimercado)
- **Insumos Exclusivos de Cocina (`type: 'insumo'`, `sellable: false`)**: Las papas, carnes crudas, harina de amasar, pollo crudo, arroz de olla, quesos de rellenar, aceite y aliños NO se venden sueltos en caja. Se descuentan automáticamente en gramos al vender platos preparados según su receta/escandallo.
- **Mercancía de Venta Directa (`type: 'venta'`, `sellable: true`)**: Víveres empaquetados (Harina P.A.N., Pasta, Arroz Primor, Margarina), bebidas, chucherías, cervezas y cigarros. Se venden por código de barras o código corto PLU.

### II. Motor Fiscal Venezolano (IVA 16%, Exentos Art. 18 e IGTF 3%)
- **Cálculo en Centavos Enteros**: Todo importe monetario se opera como entero para eliminar discrepancias de redondeo en JavaScript.
- **Alícuota General (16%)**: Comida preparada (empanadas, arepas, almuerzos, café) y mercancía gravada.
- **Exentos (0% Art. 18 Ley de IVA)**: Víveres esenciales de la canasta alimentaria.
- **IGTF (3%)**: Solo aplica si `isContribuyenteEspecial: true` sobre pagos netos en divisas.
- **Sinceridad de Control Interno**: Modo "Nota de Despacho / Control Interno" por defecto, sin seriales ficticios.

### III. Arquitectura Local-First & Compatibilidad Windows 7 (Chromium 109)
- **100% Offline**: Cero llamadas a CDNs externas en tiempo de ejecución. Fuentes de sistema, iconos vectoriales SVG locales y 47 fotos reales locales optimizadas (<25 KB).
- **GPU 0%**: Renderizado suave con transformaciones aceleradas por hardware y curvas suaves, evitando nesting o selectores incompatibles con Chromium 109.

### IV. Ergonomía para Mostrador y Dueño Mayor
- **Caja Zero-Scroll**: Distribución a 3 columnas fijas (Familias [1]-[9], Catálogo rápido táctil con miniaturas de 48px, y Ticket de venta).
- **Desglose de Vuelto con Denominaciones Reales**: Monedas y billetes reales en USD y Bs (redondeo a 0.50 Bs, sin centavos inexistentes).
- **Dashboard y Menú Limpio de 5 Opciones**: Lenguaje cotidiano en español claro sin jerga técnica innecesaria.

### V. Suite Automatizada de Verificación (100% Verde)
- Toda modificación debe validar:
  1. `node tests/run.js` (Pruebas fiscales, integración v6, UI v7 y flujo de caja v7).
  2. `node tools/check-html.js` (Balanceo estructural de etiquetas).
  3. `node tools/check-scripts.js` (Validación de sintaxis JS).

## Governance
Esta constitución rige cualquier evolución o extensión del proyecto. Las modificaciones arquitectónicas o de lógica fiscal deben estar documentadas en `AGENTS.md` y `PROJECT_BRAIN.md`.

**Version**: 7.1.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12
