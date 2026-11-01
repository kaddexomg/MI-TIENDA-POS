# AGENTS.md — Contexto Maestro, Indexación Completa y Bitácora de MI-TIENDA-POS

> **Actualizado**: 1 de Noviembre de 2026 (`13:30 VET`)
> **Cerebro del Proyecto**: Ver también [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md)
> **Propósito**: Define las reglas de negocio gastronómicas y comerciales venezolanas, la indexación total del proyecto, la separación estricta de inventario (Insumos de Cocina vs. Minimercado / Venta Directa), la sincronización multimoneda (BCV USD, Euro BCV, USDT Binance), el marco legal venezolano, el resumen de lo realizado y la hoja de ruta de lo que se va a realizar.

---

## 1. Reglas de Negocio Inviolables: Cocina vs. Minimercado / Venta Directa

1. **Separación Estricta de Inventario (`Cocina` vs. `Minimercado`)**:
   - **Insumos Exclusivos de Cocina (`type: 'insumo'`, `sellable: false`)**:
     - Las **papas crudas, los aliños (cebolla, ajo, pimentón, cilantro, cebollín, ají dulce), carnes crudas para guisar/mechar/moler, pollo crudo para freír/guisar, harina de amasar en cocina, arroz de olla, queso/jamón de rellenar, cazón, chicharrón, aceite de freír y envases** **NO SE VENDEN SUELTOS AL PÚBLICO** en la pantalla de Caja.
     - Están obligatoriamente en el inventario de cocina (`kg`, `L`, `und`) porque de allí se descuentan los gramos exactos cuando se elaboran y venden los platos de comida.
   - **Productos de Venta Directa / Minimercado (`type: 'venta'`, `sellable: true`)**:
     - **Víveres Empaquetados**: Harina P.A.N. (Blanca / Amarilla 1Kg), Espagueti / Pasta Larga, Pasta Corta, Arroz empaquetado 1Kg, Margarina Mavesa.
     - **Chucherías y Snacks**: Pepito Frito Lay, Pepito Familiar, Cheetos, Chiskesitos / Cheese Tris, Doritos, Papitas Ruffles/Natuchips, Galletas Oreo/Samba/Savoy.
     - **Cigarros**: Cajas/Cajetillas de 20 cigarros (Belmont, Consul) y cigarros detallados por unidad.
     - **Bebidas, Refrescos y Cervezas**: Frescolita, Coca-Cola, Pepsi, Chinotto, Golden, Hit, Malta Polar (personal/lata, 1.5L, 2L) y **Cervezas** (Polar Pilsen, Zulia, Solera Verde/Azul, Six-Pack).
     - Se cargan al inventario y se venden mediante **Lector de Código de Barras USB, Cámara Web en Vivo o Código Corto**.
     - Se gestionan con calculadora de compra por **Bulto / Caja / Cartón** a unidades con cálculo automático de margen comercial en USD y Bs.

2. **Agrupación por Familias en Caja (10 Categorías Maestras)**:
   - En lugar de saturar la pantalla con decenas de tarjetas sueltas, el POS agrupa los artículos por familia (*Empanadas Venezolanas, Pastelitos y Tequeños, Papas Rellenas, Almuerzos y Platos Fuertes, Cafetería, Pepitos y Chucherías, Refrescos y Maltas, Cervezas, Cigarros, Víveres*), desplegando sus variedades al seleccionar cada familia en una botonera táctil compacta.

---

## 2. Sincronización Diaria de Tasas (BCV USD, Euro BCV y USDT Binance)

- **Conexión a API Diaria en Vivo (`assets/js/rates.js`)**:
  - Sincroniza automáticamente:
    1. 🏦 **Tasa Oficial BCV USD (Bs/$)**
    2. 💶 **Tasa Oficial BCV EURO (Bs/€)**
    3. 🟡 **Tasa USDT Binance P2P (Bs/$)**
- **Cálculo de Brechas y Recomendador Antiperdida**:
  - Calcula en tiempo real la brecha porcentual entre **BCV USD ↔ USDT Binance**, **BCV USD ↔ Euro BCV** y **Euro BCV ↔ USDT Binance** para recomendar precios de reposición que protejan el capital.

---

## 3. Cuadre de Caja, Pago Móvil, Vueltos y Marco Legal Venezolano

- **Verificación de Pago Móvil y Distribución Exacta de Vueltos**:
  - Registro de Banco, Referencia (4–6 dígitos), Teléfono/Cédula y detector anti-fraude de referencias duplicadas en el turno.
  - Distribución de vuelto mixto especificando cuánto sale en **Efectivo USD ($)**, cuánto en **Efectivo Bs** y cuánto por **Pago Móvil (Bs)**.
- **Deslinde de Facturación Homologada SENIAT**:
  - Los comprobantes emitidos son estrictamente **Notas de Despacho / Control Interno (SIN VALIDEZ DE CRÉDITO FISCAL)**, desligados de máquinas fiscales homologadas pero con control contable interno completo.

---

## 4. Índice Completo del Proyecto (`C:\Users\PC\Desktop\MI-TIENDA-POS`)

- **Raíz**:
  - [index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/index.html) — Selector de rol (`Administrador` / `Cajero`).
  - [AGENTS.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/AGENTS.md) y [AGENTS.MD.txt](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/AGENTS.MD.txt) — Reglas y contexto de agentes.
  - [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md) — Cerebro e indexación técnica completa del proyecto.
  - [INICIAR-POS.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-POS.bat) e [INICIAR-ADMIN.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-ADMIN.bat) — Lanzadores para Windows 7.
- **Estilos (`assets/css/`)**:
  - [assets/css/variables.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/variables.css) — Tokens de diseño y fuentes legibles.
  - [assets/css/components.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/components.css) — Componentes UI reutilizables (tablas, modales, botones).
  - [assets/css/layout.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/layout.css) — Estructura de barra lateral y contenedor principal.
  - [assets/css/pos.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/pos.css) — Pantalla de Caja (`Zero-Scroll 100vh`), familias y ticket limpio.
- **Lógica JS (`assets/js/`)**:
  - [assets/js/config.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/config.js) — Estado central (`mtp_store_v3`), IndexedDB, inventario separado (`insumo` vs `venta`), compras de cocina (`recordKitchenPurchase`), detector de Pago Móvil usado y analizador de SMS bancarios.
  - [assets/js/rates.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/rates.js) — Motor multimoneda BCV USD / Euro / USDT Binance.
  - [assets/js/pos-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/pos-engine.js) — Motor de Caja, atajos F1-F4, ticket en espera / multicuenta, Pago Móvil y vueltos.
  - [assets/js/barcode-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/barcode-engine.js) — Escáner por pistola USB y cámara web.
  - [assets/js/sidenav.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/sidenav.js) — Barra de navegación lateral de 1 clic.
- **Vistas Admin (`admin/`)**:
  - [admin/index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/index.html) (Dashboard SVG nativo), [admin/pos.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/pos.html), [admin/inventario.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/inventario.html), [admin/recetas.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/recetas.html), [admin/productos.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/productos.html), [admin/precios.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/precios.html), [admin/cierres.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/cierres.html), [admin/facturas.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/facturas.html), [admin/ajustes.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/admin/ajustes.html).
- **Vistas Cajero (`caja/`)**:
  - [caja/pos.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/caja/pos.html), [caja/index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/caja/index.html).

---

## 5. ✅ BITÁCORA DE LO REALIZADO Y LO QUE SE VA A REALIZAR

### 5.1. Lo Realizado
1. **Atajos de Teclado Rápido**: F1 (cursor al escáner), F2 (cobrar/vueltos), F3 (ticket en espera), F4 (comanda/impresión).
2. **Validación Antifraude de Pago Móvil**: Comprobación de últimos 4-6 dígitos en tiempo real y detector de duplicados en el día.
3. **Analizador de SMS / WhatsApp**: Pega la notificación bancaria y rellena banco, referencia, teléfono y monto en Bs.
4. **Ticket de Caja Limpio**: Eliminación de registros de gastos del ticket para mantenerlo enfocado en ventas.
5. **Gastos Reales por Insumos**: Cada compra de aliños, papas, carnes o verduras suma kg a cocina y resta dinero físico de gaveta.
6. **Calculadora Bulto a Unidades**: En `admin/inventario.html`, calcula costo y margen por unidad desde el costo del bulto.
7. **Control de Producción Matutina ("Salida a Olla")**: En `admin/recetas.html`, seguimiento de masa y guisos entregados vs. piezas obtenidas.
8. **Gráficos Dinámicos SVG Ligeros**: En `admin/index.html`, métricas de ventas y flujo de caja con cero sobrecarga en Win7.
9. **Librería de Iconos Vectoriales SVG Nativos ([`assets/js/icons.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/icons.js))**:
   - Iconografía pura estilo JJ Paper / Lucide que erradica por completo los glifos rotos (`□`) en Windows 7 y funciona 100% offline. Integrado en todas las vistas de `admin/`, `caja/` y la raíz.
10. **Motor Central Kardex Inmutable y Auditoría Total (`assets/js/config.js`)**:
   - Libro mayor de movimientos (`state.kardex`) con trazabilidad completa de cada gramo o unidad entrante o saliente: `COMPRA`, `VENTA`, `MERMA`, `CONSUMO_PERSONAL`, `PRODUCCION_COCINA` y `AJUSTE_AUDITORIA`.
11. **Recepción Formal de Mercancía / Factura Multi-Ítem a Proveedores**:
   - Modal y motor para cargar facturas/notas de entrega con múltiples renglones (bultos a unidades), proveedores registrados (`state.suppliers`) y sincronización automática del desembolso de dinero de la gaveta de caja (Efectivo USD/Bs o Pago Móvil).
12. **Centro de Control de Mermas, Vencimientos y Autoconsumo**:
   - Registro y valorización monetaria de alimentos dañados, comida quemada o comidas de personal, descontando del inventario real y asentando en Kardex.
13. **Auditoría por Conteo Físico Ciego**:
   - Comparador de existencia física real vs. sistema, con cálculo de faltante/sobrante en unidades y dinero, y ajuste atómico con justificación.
14. **Optimización de Alta Densidad Visual de Pantallas Administrativas (Cero Zoom Excesivo)**:
   - Rediseño de escala de escritorio (`12px` base, padding reducido a la mitad, tarjetas compactas, `.grid-2`, `.form-row`) en `inventario.html`, `productos.html`, `cierres.html`, `recetas.html`, `index.html`, `ajustes.html` y `facturas.html`. Todo el contenido entra cómodamente en monitores de oficina Windows 7 (1024x768 / 1366x768) sin scroll vertical tosco ni sensación de agobio.
15. **Conexión, Control de Lotes y Vouchers de Puntos de Venta (Pax / Verifone / Biopago)**:
   - Identificación de terminales adquirentes (`state.posTerminals`), auditoría de lotes (`currentBatch`), registro del comprobante de voucher (`N° de Aprobación`) y conciliador de Cierre de Lote (`closeTerminalBatch`) con cálculo de faltante/sobrante en `admin/cierres.html`.
16. **Validación Avanzada de Pago Móvil Multicuenta y Cobro Directo C2P con OTP**:
   - Selección de cuentas bancarias receptoras del negocio (`state.pagoMovilAccounts`), ciclo de confirmación (`CONFIRMADO EN BANCO` vs `PENDIENTE DE VERIFICACIÓN` vs `RECHAZADO`), prevención de capturas falsas con cambio de estado atómico y cobro directo C2P (`processC2pPayment`) con banco, teléfono, cédula y clave dinámica OTP.
17. **Instalador de Escritorio Windows 7 y Repositorio Oficial GitHub**:
   - Creación de `INSTALADOR-WINDOWS-7.bat`, configuración de carpetas seguras `C:\MI-TIENDA-DATOS\`, manual `INSTALACION-WINDOWS7.md` y sincronización con GitHub `kaddexomg/MI-TIENDA-POS`.
18. **Módulo de Máquinas Fiscales Homologadas SENIAT (Providencias 0141 y 0071)**:
   - Formato fiscal oficial en ticket con alícuotas de IVA (Exento `(E)` vs Gravado 16% `(G)`), percepción legal de IGTF 3% en pagos con divisas en efectivo/Zelle, generación de trama fiscal The Factory HKA / Bixolon / Aclas (`FACTURA.TXT`), emisión de Reporte X y Reporte Z diario, y panel de configuración fiscal en `admin/ajustes.html`.
19. **Paquete P2: Autenticación, Roles, PINs y Control de Acceso (RBAC)**:
   - Pantalla de acceso por PIN táctil/físico en `index.html` con detección de usuario, dot-indicators y selección de destino para encargados y administradores.
   - Motor criptográfico puro SHA-256 con salt en `assets/js/auth.js` (100% offline y compatible con Windows 7).
   - Usuarios semilla con hash seguro: `admin` (PIN 123456), `cajero` (PIN 1234), `encargado` (PIN 2244) y detector de PIN de fábrica.
   - Matriz oficial de permisos RBAC en `assets/js/permissions.js` según PLAN_IMPLEMENTACION_V5 §3.2 (`can`, `canDirectly`, `requiresSupervisor`).
   - Modal 🔑 de Supervisor para autorizaciones en caliente (descuentos, anulaciones y gastos superiores al límite de caja).
   - Bloqueo automático por inactividad (5 min configurables) con retorno seguro a login.
   - Protección estricta de rutas (`MTPAuth.guardRoute`) en todas las vistas administrativas y de caja.
   - Panel de administración de usuarios en `admin/usuarios.html` con directorio, cambio de PIN, visor de matriz RBAC y kardex de auditoría de seguridad.
   - Barra lateral `assets/js/sidenav.js` actualizada con identificación de usuario, badge de rol, botón de cierre de sesión y bloqueo de acceso al panel admin para rol cajero.

### 5.2. Lo que se va a realizar (Próximos Pasos Windows 7)
1. **Persistencia Transaccional con Respaldo en Disco**:
   - Exportación automática a archivo JSON espejo en disco ante cada movimiento para blindaje anti-apagones.