# 🧠 PROJECT_BRAIN.md — Cerebro Maestro, Índice Completo y Plan de Evolución de MI-TIENDA-POS

> **Última actualización**: 1 de Noviembre de 2026 (`13:30 VET`)
> **Estado Operativo**: Arquitectura Blindada para Windows 7 (Sin GPU / Bajos Recursos) — Sistema Híbrido Gastronómico y Minimercado con Facturación Rápida por Teclado, Calculadora Venezolana de Vueltos ($ + Bs Pago Móvil), Control Real de Gastos por Compra de Insumos, Calculadora de Bultos a Unidades y Control de Salida a Olla.
> **Propósito**: Servir como memoria central de ingeniería, indexando cada archivo, estructura de datos, lógica de negocio venezolana, historial de cambios aplicados y el **Plan Maestro de Modernización para Windows 7** (Instalador de escritorio, erradicación de emojis rotos mediante SVG nativo, flujo guiado de minimercado/cocina y humanización de interfaces).

---

## 1. 📋 RESUMEN EJECUTIVO: QUÉ SE HA REALIZADO Y QUÉ SE VA A REALIZAR

### ✅ 1.1. Lo que ya se ha realizado e implementado con éxito
1. **Facturación Rápida y Teclado Bruto en Caja**:
   - Atajos directos `F1` (Cursor a escáner de códigos), `F2` (Cobrar y entregar vuelto), `F3` (Poner ticket en espera / Multicuenta), `F4` (Imprimir comanda de cocina y nota de despacho), `1`-`9`/`0` (Acceso rápido a familias de productos).
2. **Sistema Antifraude de Pago Móvil & Extractor de SMS**:
   - Validación por los **últimos 4 a 6 dígitos** de la referencia en tiempo real.
   - Detección automática de referencias repetidas en el turno de hoy para evitar cobros fraudulentos.
   - Botón inteligente `Pegar SMS / WhatsApp` que analiza notificaciones bancarias (BDV, Banesco, Mercantil, Provincial, Bancamiga, BNC) y rellena automáticamente banco, referencia, teléfono y monto en Bs.
3. **Depuración del Ticket de Venta**:
   - Se removió cualquier botón o formulario de gastos del panel del ticket. El ticket es estrictamente para venta rápida.
4. **Lógica Real de Gastos del Negocio (`recordKitchenPurchase`)**:
   - Los gastos reales son las compras de insumos (aliños, papas, carnes, pollo, queso, gas, bolsas). Cada registro incrementa simultáneamente los kilogramos/litros del inventario de cocina y descuenta el efectivo o saldo bancario de la caja.
5. **Herramientas de Negocio**:
   - **Calculadora Bulto a Unidades** en [`admin/inventario.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/inventario.html): divide costo de bulto entre unidades y calcula margen ante la brecha USDT.
   - **Tandas de Producción de Cocina ("Salida a Olla / Batea")** en [`admin/recetas.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/recetas.html): audita kilogramos sacados en la mañana vs. empanadas o platos producidos.
   - **Dashboard con Gráficos Nativos en SVG** en [`admin/index.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/index.html): ventas por hora, desglose de cobros, rentabilidad Cocina vs. Abasto y arqueo físico neto en gaveta.
6. **Selector de Variedades Compacto**:
   - Modificación de `#posVariantModal` en [`assets/css/pos.css`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/pos.css) y [`assets/js/pos-engine.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/pos-engine.js) para renderizar miniaturas fijas de 40px y controles directos `+1/-1`.
7. **Lanzadores para Windows 7**:
   - Creación de `INICIAR-POS.bat` e `INICIAR-ADMIN.bat` en modo `--app` ligero.

---

### 🚀 1.2. Lo que se va a realizar (Plan Maestro de Modernización para Windows 7)
1. **Reemplazo Total de Emojis Rotos en Windows 7 por Iconos SVG Nativos**:
   - En Windows 7, la ausencia de fuentes emoji modernas provoca que caracteres como `💵`, `🛒`, `🍔`, `📷` se vean como cajas vacías (`□`).
   - Se implementará un set de iconos vectoriales SVG limpios y nítidos ([`assets/js/icons.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/icons.js)), idénticos al estándar gráfico de aplicaciones como JJ Paper.
2. **Instalador de Escritorio para Windows 7 (`INSTALADOR-WINDOWS-7.bat`)**:
   - Script automatizado que detecta el navegador, crea la carpeta protegida de almacenamiento local en `C:\MI-TIENDA-DATOS\` y genera dos accesos directos con iconos nativos en el Escritorio de Windows 7:
     - `MI TIENDA POS - Caja Rápida.lnk` (abre directamente `caja/pos.html` en ventana de escritorio sin barras de URL ni pestañas).
     - `MI TIENDA POS - Administración.lnk` (abre `admin/index.html`).
3. **Flujo Guiado de Introducción de Productos e Inventario Mixto (Comida vs. Minimercado)**:
   - Rediseño de [`admin/productos.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/productos.html) e [`admin/inventario.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/inventario.html) para permitir cargar fácilmente:
     - **Comida de Cocina (Platos / Recetas)**: sin código de barra, asignación a botonera táctil (#01-#24), escandallo de ingredientes.
     - **Mercancía de Minimercado (Víveres, Bebidas, Chucherías, Cigarros)**: lectura por pistola de código de barras, calculadora automática de bulto/caja a unidad, margen comercial y precio automático en USD y Bs (tasa BCV).
4. **Humanización de la Interfaz y Optimización de Pantallas Administrativas**:
   - Descartar el estilo visual rígido o "robótico" por un aspecto de software administrativo profesional de escritorio.
   - Optimización de pantalla completa sin scrolls innecesarios en todas las vistas:
     - [`admin/inventario.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/inventario.html)
     - [`admin/productos.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/productos.html)
     - [`admin/cierres.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/cierres.html)
     - [`admin/recetas.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/recetas.html)
     - [`admin/ajustes.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/ajustes.html)
     - [`admin/facturas.html`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/facturas.html)
5. **Persistencia Local Robusta con Respaldo Automático en Disco**:
   - `IndexedDB` transaccional con respaldo JSON espejo cada vez que se produce una venta o ajuste, garantizando cero pérdida de información ante cortes eléctricos.

---

## 2. 🗂️ ÍNDICE Y MAPEO COMPLETO DEL PROYECTO

Directorio base: `C:\Users\PC\Desktop\MI-TIENDA-POS\`

### 2.1. Documentos Centrales y Reglas
| Archivo | Función Técnica |
| :--- | :--- |
| [AGENTS.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/AGENTS.md) | Reglas maestras de negocio (Cocina vs. Venta directa, tasas multimoneda, Pago Móvil, deslinde SENIAT). |
| [AGENTS.MD.txt](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/AGENTS.MD.txt) | Respaldo en texto plano de las directrices maestras. |
| [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md) | Memoria técnica completa, indexación del código, estado actual y roadmap de trabajo. |

### 2.2. Lanzadores y Acceso de Usuario
| Archivo | Función Técnica |
| :--- | :--- |
| [index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/index.html) | Selector de rol (Administración vs. Caja) y visor de tasas oficiales en vivo. |
| [INICIAR-POS.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-POS.bat) | Lanzador en modo app ventana de escritorio para la Caja. |
| [INICIAR-ADMIN.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-ADMIN.bat) | Lanzador en modo app ventana de escritorio para Administración. |

### 2.3. Estilos de Diseño (`assets/css/`)
| Archivo | Función Técnica |
| :--- | :--- |
| [assets/css/variables.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/variables.css) | Tokens de colores, sombras nativas ligeras sin aceleración GPU forzada, tipografía de alta legibilidad. |
| [assets/css/components.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/components.css) | Botones, modales, tablas limpias con celdas compactas, inputs y tarjetas KPI. |
| [assets/css/layout.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/layout.css) | Estructura principal, barra de navegación colapsable (`Ctrl+B`) y barra superior de tasas. |
| [assets/css/pos.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/pos.css) | Interfaz de Caja: pantalla fija 100vh sin scroll horizontal, panel de ticket derecho, modal de cobro y calculadora de vueltos. |

### 2.4. Módulos de Lógica JavaScript (`assets/js/`)
| Archivo | Objeto Global | Función Técnica |
| :--- | :--- | :--- |
| [assets/js/config.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/config.js) | `window.MTP` | Estado reactivo, base de datos `mtp_store_v3` en `localStorage` + `IndexedDB`, Kardex inmutable, Puntos de Venta (`posTerminals`, `closeTerminalBatch`), Cuentas de Pago Móvil (`pagoMovilAccounts`, `updatePagoMovilStatus`, `processC2pPayment`), registro de gastos e insumos de cocina (`recordKitchenPurchase`), detector de Pago Móvil usado (`findUsedPagoMovilRef`) y analizador de SMS bancarios (`parsePagoMovilSms`). |
| [assets/js/rates.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/rates.js) | `window.MTPRates` | Motor de tasas BCV USD, Euro BCV y USDT Binance con cálculo de brechas cambiarias. |
| [assets/js/pos-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/pos-engine.js) | `window.MTPPos` | Motor de Caja: atajos `F1`-`F4`, multicuenta/espera, modal de cobro y vuelto mixto venezolano ($ + Bs), auditoría de vouchers de punto por lote, selector de cuentas receptoras de Pago Móvil y cobro directo C2P con token dinámico OTP. |
| [assets/js/barcode-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/barcode-engine.js) | `window.MTPBarcode` | Lector de código de barras USB y escáner por cámara web. |
| [assets/js/sidenav.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/sidenav.js) | `window.MTPSidebar` | Navegación lateral de 1 clic, colapso rápido y modal integrado de compras de insumos/gastos con soporte de iconos vectoriales nativos. |
| [assets/js/icons.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/icons.js) | `window.MTPIcons` | Biblioteca de iconos vectoriales SVG nativos para erradicar emojis rotos en Windows 7. 100% offline y ligero. |

### 2.5. Vistas de Administración (`admin/`)
| Archivo | Estado y Función |
| :--- | :--- |
| [admin/index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/index.html) | Dashboard con 2 gráficos SVG nativos (Ventas por hora, métodos de pago), arqueo neto de gaveta y compras del día. |
| [admin/pos.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/pos.html) | Terminal de Caja modo Administrador con selector rápido de familias y buscador. |
| [admin/inventario.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/inventario.html) | **Centro Integral de Control de Inventario**: Libro Mayor Kardex inmutable (`state.kardex`), Recepción de facturas multi-ítem a proveedores con impacto en gaveta, registro de mermas y auditoría por conteo físico real. |
| [admin/productos.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/productos.html) | Catálogo y registro de productos con escáner. Optimizado con grid 2 columnas y escala compacta. |
| [admin/recetas.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/recetas.html) | Escandallo de platos y control de Salida a Olla/Batea con tabla compacta y scroll inteligente. |
| [admin/precios.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/precios.html) | Monitor de tasas cambiarias, brechas porcentuales y recomendador anti-pérdida. |
| [admin/cierres.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/cierres.html) | Cuadre de caja diario: efectivo USD y Bs esperado vs. contado, conciliación de Pago Móvil y puntos de venta. Planilla contable compacta. |
| [admin/facturas.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/facturas.html) | Registro y consulta de notas de despacho / facturas emitidas. |
| [admin/ajustes.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/ajustes.html) | Configuración de tienda, RIF, copias de seguridad JSON e instrucciones para Windows 7. |

### 2.6. Vistas de Caja Mostrador (`caja/`)
| Archivo | Función |
| :--- | :--- |
| [caja/pos.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/caja/pos.html) | Terminal rápida de atención al cliente sin opciones administrativas sensibles. |
| [caja/index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/caja/index.html) | Resumen del turno del cajero y órdenes atendidas. |

---

## 3. 🛡️ REGLAS TÉCNICAS INVIOLABLES PARA WINDOWS 7
1. **Cero Servidores Pesados de Fondo**: No depender de MySQL, Apache, Docker ni Node.js en ejecución constante. Toda la reactividad y persistencia debe residir en el navegador local y archivos locales.
2. **Cero Emojis como Elementos Críticos de Interfaz**: Ningún botón, pestaña, título o columna de tabla dependerá de glifos unicode que Windows 7 dibuje como `□`. Todo icono debe ser SVG vectorial nativo.
3. **Persistencia Garantizada sin Pérdida por Apagones**: Cada evento de venta o gasto debe sincronizarse de inmediato en la base transaccional local.
4. **Flujo de Negocio Mixto Claro**: Un insumo de cocina crudo (cebolla, carne cruda, harina de amasar) nunca se vende como producto de mostrador; los productos empaquetados de minimercado (harina PAN empaquetada, refrescos, snacks, cigarros) se cargan con código de barras y cálculo de margen por bulto/caja.