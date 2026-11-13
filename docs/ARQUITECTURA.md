# Arquitectura Estructural — MI-TIENDA-POS

Documentación activa de la organización centralizada de rutas, estilos y módulos.

## 1. Pantallas Principales

- `index.html` — Acceso rápido por PIN (`Administrador`, `Encargado`, `Cajero`) y selección de destino.
- `pos.html` — Terminal de Caja única y unificada (3 columnas Zero-Scroll 1024×768 / 1366×768, Cobro multimoneda, Vuelto mixto, Modal de Tickets del Turno `#cajaTodayTicketsModal` y Comanda térmica).
- `admin/index.html` — Resumen del negocio ("Mi día").
- `admin/inventario.html` — Inventario separado (`insumo` Cocina vs `venta` Mostrador).
- `admin/facturas.html` — Compras de mercancía y gastos de cocina.
- `admin/cierres.html` — Cuadre del día y conciliación física por denominaciones.
- `admin/precios.html` — Tasas de cambio (BCV USD, Euro BCV, USDT Binance) y brecha cambiaria.
- `admin/productos.html` — Platos de cocina y catálogo de mercancía de venta directa.
- `admin/recetas.html` — Tandas de cocina, planificador y recetario con descuento por gramos.
- `admin/usuarios.html` — Roles y claves de acceso.
- `admin/ajustes.html` — Datos del comercio, impresora fiscal SENIAT, puntos de venta y respaldos.
- `mobile/index.html` — Vista móvil para dueño (servidor local).

## 2. Hojas de Estilo (`assets/css/`) — 3 Archivos Consolidados

1. `assets/css/tokens.css` — Variables semánticas Light Apple + Sidebar Navy `#09131F`, espaciado, tipografía, curvas de movimiento y reset base.
2. `assets/css/app.css` — Componentes, botones, tablas, modales, barra lateral en 3 estados, paleta de comandos `Ctrl+K`, drawer rápido de producto, estado vacío (`.empty-state`) e impresión de etiquetas (`#barcodePrintRoot`). Sin `backdrop-filter` ni efectos aurora para mantener 60 fps en Windows 7 / Chromium 108/109.
3. `assets/css/pos.css` — Layout de 3 columnas de Caja (`pos.html`), tarjetas de 9 familias (`Víveres` en posición #4), modal de cobro/vuelto multimoneda e impresión térmica unificada de 80 mm / 58 mm (`@media print`).

## 3. Módulos JavaScript (`assets/js/`) — 3 Capas Claras (0 CDNs)

- `assets/js/core/`: `config.js`, `tax.js`, `rates.js`, `change.js`, `permissions.js`, `auth.js`, `api-client.js`, `code-structure.js`.
- `assets/js/ui/`: `icons.js`, `ui.js`, `sidenav.js`, `keys.js`, `view-transitions.js`.
- `assets/js/modules/`: `pos-engine.js`, `product-drawer.js`, `barcode-engine.js`, `barcode-printer.js`, `closures.js`.

## 4. Documentación Histórica

Los planes de estabilización y rediseños anteriores se conservan en [`docs/archivo/`](archivo/).
