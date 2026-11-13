# MI-TIENDA-POS — Sistema POS Integral, Journal Anti-Apagones y Control Comercial

> **Versión**: 8.0.0 (Arquitectura Centralizada, Rediseño Apple Light & Instalador Nativo Windows 7 SP1)  
> **Compatibilidad**: Windows 7 SP1 (32 y 64 bits), Windows 8.1, Windows 10, Windows 11, Linux, macOS  
> **Requisitos Mínimos**: 2 GB de RAM, Procesador Dual-Core x86/x64, Pantalla 1024×768 o superior  
> **Entorno**: 100% Offline-Ready con persistencia dual (Journal transaccional append-only + LocalStorage hidratado) y shell nativo Electron 22 ia32 / Chromium 108.

---

## 1. ¿Qué es MI-TIENDA-POS?

**MI-TIENDA-POS** es un sistema de punto de venta, control de inventario y facturación legal diseñado específicamente para la realidad operativa y comercial de Venezuela. Resuelve de manera unificada las necesidades de negocios híbridos gastronómicos y comerciales:

1. **Restaurante / Comida Rápida Criolla**: Venta de empanadas, pastelitos andinos, tequeños, papas rellenas, arepas venezolanas, almuerzos (pabellón criollo, arroz chino, pollo frito) y cafetería.
2. **Minimercado / Abasto / Bodega**: Venta directa de víveres empaquetados (Harina P.A.N. blanca/amarilla, arroz Primor, pasta larga, margarina Mavesa), chucherías (Pepito, Cheetos, Cheese Tris, Doritos, Samba), refrescos, maltas, cervezas frías (Polar Pilsen, Zulia, Solera Verde) y cigarros.

El sistema está optimizado para funcionar con fluidez absoluta a **60 fps** en computadoras de oficina de bajos recursos (PCs de cobranza con Windows 7, procesadores modestos y 2 GB de RAM), erradicando el uso excesivo de GPU, filtros pesados y dependencias externas.

---

## 2. Reglas Maestras de Negocio e Identidad Operativa

### 2.1. Separación Estricta de Inventario (Cocina vs. Minimercado)
- **Insumos Exclusivos de Cocina (`type: 'insumo'`, `sellable: false`)**:
  - Las papas crudas, aliños (cebolla, ajo, pimentón, ají dulce, cilantro), carnes para mechar/moler, pollos crudos, harina de amasar, arroz de olla, aceite de freír y envases térmicos **NO se venden sueltos al público en la Caja**.
  - Su inventario se controla en kilogramos (`kg`), litros (`L`) o unidades (`und`). Al vender platos o empanadas, el sistema descuenta automáticamente los gramos exactos establecidos en la receta.
- **Productos de Venta Directa (`type: 'venta'`, `sellable: true`)**:
  - Harina P.A.N. de paquete, refrescos (Frescolita, Coca-Cola, Malta Polar), snacks, cervezas y cigarros.
  - Se identifican y cobran mediante **Lector de Código de Barras USB**, **Cámara Web en Vivo** o **Códigos Cortos**.

### 2.2. Orden Oficial de las 9 Familias en Caja
`[1]` **Empanadas y Fritos** · `[2]` **Arepas Venezolanas** · `[3]` **Almuerzos y Platos** · `[4]` **Víveres** · `[5]` **Refrescos y Maltas** · `[6]` **Cafetería** · `[7]` **Chucherías** · `[8]` **Cervezas** · `[9]` **Cigarros**.  
*(Víveres se ubica en la posición #4 como pilar de abasto del negocio).*

### 2.3. Motor Fiscal Venezolano (IVA 16%, Exentos Art. 18 e IGTF 3%)
- **Cálculo en Centavos Enteros**:
  - **Alícuota General (16%)**: Aplica a toda la comida preparada, refrescos, maltas, cervezas, chucherías y cigarros.
  - **Exentos (0%, Art. 18 Ley de IVA)**: Víveres básicos de la cesta venezolana (Harina P.A.N., arroz blanco, pasta, margarina).
  - **Modos de IVA**: Modo `RECARGO` (+16% sobre base gravada) o `INCLUIDO` (desglose de base imponible sin alterar PVP final).
  - **IGTF 3%**: Solo aplica sobre pagos netos en divisas (`Efectivo USD` neto de vuelto + `Zelle`) cuando el comercio está configurado como Sujeto Pasivo Especial SENIAT.
  - **Facturación Dual**: Modo Interno (Nota de entrega / Comanda de despacho) o Impresora Fiscal Homologada SENIAT (`FACTURA.TXT` para The Factory HKA / Bixolon / Aclas).

### 2.4. Tasas Diarias y Brecha de Reposición (BCV USD, Euro y USDT Binance)
Sincroniza y monitorea en tiempo real:
1. **Tasa Oficial BCV USD (Bs/$)**
2. **Tasa Oficial BCV EURO (Bs/€)**
3. **Tasa USDT Binance P2P (Bs/$)**
Calcula la brecha cambiaria en vivo para sugerir precios protegidos que impidan la descapitalización al reponer mercancía.

### 2.5. Gaveta, Denominaciones Reales y Vueltos Mixtos
- Los botones de billete en caja **suman** ($20 + $5 = $25) sin borrar lo escrito manualmente.
- Desglose inteligente de vueltos en **denominaciones reales**: billetes en US$ (1 a 100) y bolívares en efectivo (0,10 a 2.000 Bs) redondeados a 0,50 Bs.
- Si la distribución del vuelto no cuadra exactamente con el balance, el botón de confirmar cobro se deshabilita para proteger la gaveta.
- Detector anti-fraude de referencias de Pago Móvil con alerta en vivo ante duplicados del turno.

---

## 3. Resiliencia y Persistencia Anti-Apagones (Journal Transaccional)

Para proteger al comercio frente a cortes intempestivos de energía eléctrica:
- **Motor Append-Only**: Cada evento (`SALE_CREATED`, `EXPENSE_CREATED`, `STOCK_ADJUSTED`, `SHIFT_OPENED`, `SHIFT_CLOSED`) se escribe con `fsync` síncrono en `C:\MI-TIENDA-DATOS\journal.ndjson`.
- **Recuperación Automática**: Al reiniciar tras un apagón brusco, el sistema descarta cualquier línea incompleta o corrupta al final del archivo y reconstruye el estado exacto sin pérdida de ventas.
- **Snapshot y Respaldos Diarios**: Mantiene un `snapshot.json` materializado y genera respaldos automáticos en `C:\MI-TIENDA-DATOS\respaldos\`.

---

## 4. Estructura del Proyecto

```
MI-TIENDA-POS/
├── index.html                   # Selector seguro por PIN (Administrador / Encargado / Cajero)
├── pos.html                     # Terminal de Caja Unificada (3 columnas Zero-Scroll, 9 familias, cobro y vuelto)
├── README.md                    # Manual integral del sistema (este archivo)
├── AGENTS.md                    # Reglas de negocio e indexación técnica para agentes
│
├── admin/                       # Módulos de Gestión Administrativa
│   ├── index.html               # Resumen del negocio ("Mi día") con KPIs y gráficos horarios
│   ├── inventario.html          # Inventario separado (Cocina vs Mostrador), Kardex y conteo físico
│   ├── facturas.html            # Registro unificado de compras de mercancía y gastos de cocina
│   ├── cierres.html             # Cuadre del día y arqueo físico por billetes y monedas
│   ├── precios.html             # Brechas cambiarias BCV vs USDT y precios protegidos
│   ├── productos.html           # Catálogo general y modal de variantes de recetas
│   ├── recetas.html             # Tandas de cocina, planificador de olla y recetario
│   ├── usuarios.html            # Gestión de roles y claves PIN
│   └── ajustes.html             # Datos fiscales, puntos de venta e impresoras SENIAT
│
├── assets/
│   ├── css/                     # 3 Hojas de Estilo Consolidadas (Light Apple / Navy #09131F)
│   │   ├── tokens.css           # Variables semánticas, colores, tipografía tabular y movimiento
│   │   ├── app.css              # Componentes, botones táctiles, tablas, modales y barra lateral
│   │   └── pos.css              # Layout de 3 columnas de Caja, tarjetas, vuelto e impresión térmica
│   ├── js/                      # Arquitectura JavaScript Modular (0 CDNs, 100% offline)
│   │   ├── core/                # api-client.js, auth.js, change.js, code-structure.js,
│   │   │                        # config.js, permissions.js, rates.js, tax.js
│   │   ├── modules/             # barcode-engine.js, barcode-printer.js, closures.js,
│   │   │                        # pos-engine.js, product-drawer.js
│   │   └── ui/                  # icons.js (SVG nativos), keys.js (Ctrl+K), sidenav.js, ui.js, view-transitions.js
│   └── img/                     # 47 Fotografías reales optimizadas de productos locales
│
├── desktop/                     # Shell Nativo Todo-en-Uno (Electron 22.3.27 ia32 para Windows 7 SP1+)
│   ├── main.js                  # Proceso principal, servidor HTTP embebido y flags sin GPU
│   ├── preload.js               # Puente IPC seguro (window.MTPDesktop: impresión directa, datos)
│   ├── package.json             # Manifiesto de Electron
│   └── scripts/                 # pack-win7.js, verify-desktop.js, ensure-electron-binary.js
│
├── server/                      # Servidor HTTP local y Motor Journal
│   ├── server.js                # Servidor HTTP con puerto efímero y enrutamiento
│   ├── api.js                   # API REST v1 para eventos, estado y respaldos
│   ├── journal.js               # Persistencia transaccional append-only con fsync
│   └── state.js                 # Materialización de estado y cálculo de Kardex
│
├── tools/                       # Herramientas de Compilación y Validación
│   ├── build-win7-installer.ps1 # Compilación del instalador nativo con Inno Setup
│   ├── installer.iss            # Script de Inno Setup 6.7.3 (Windows 7 SP1 x86/x64)
│   ├── check-html.js            # Validador de balanceo de etiquetas HTML
│   └── check-scripts.js         # Validador de sintaxis de JavaScript en línea
│
└── tests/                       # Suite de Pruebas Automatizadas
    ├── run.js                   # Ejecutor principal de pruebas
    ├── tax.test.js              # Pruebas unitarias de impuestos (IVA/IGTF)
    ├── pos.test.js              # Pruebas del flujo de caja, cobro y vuelto
    ├── ui.test.js               # Pruebas de desglose de efectivo y helpers UI
    └── sync-integrity.test.js   # Pruebas de integridad de catálogo y respaldos
```

---

## 5. Instalación y Puesta en Marcha

### Opción A — Instalador Nativo para Windows 7 / 8.1 / 10 / 11 (Recomendada para Clientes)

1. Ejecuta el instalador oficial compilado:
   ```
   dist\Instalar-MI-TIENDA-POS.exe
   ```
2. El asistente de Inno Setup:
   - Instala la aplicación en la máquina del usuario (sin requerir permisos de Administrador ni UAC).
   - Crea automáticamente los accesos directos en el **Escritorio** y en el **Menú Inicio**.
   - Configura el directorio seguro de datos en `C:\MI-TIENDA-DATOS\` con subcarpeta de respaldos.
3. Al abrir la aplicación:
   - Se ejecuta el shell nativo todo-en-uno en 32 bits con Electron 22.3.27.
   - El servidor embebido y el Journal anti-apagones inician en milisegundos en segundo plano.
   - Se abre directamente la pantalla de inicio de sesión por PIN (`index.html`).

### Opción B — Compilar el Instalador desde el Código Fuente

Requisitos en la PC de desarrollo: **Node.js** (v16+) e **Inno Setup 6.7.3** (instalable vía `winget install --id JRSoftware.InnoSetup --version 6.7.3 --scope user`).

Ejecuta en PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File tools\build-win7-installer.ps1
```
El script empaqueta los recursos con `@electron/packager` y genera el ejecutable instalador en `dist\Instalar-MI-TIENDA-POS.exe`.

### Opción C — Modo Desarrollo y Servidor Web Local

Si deseas correr la aplicación directamente con Node.js en cualquier navegador:
```bash
# Iniciar el servidor local
node server/server.js

# Abrir en el navegador
# http://127.0.0.1:8080/ (o el puerto indicado en la consola)
```

---

## 6. Atajos de Teclado Globales

Diseñado para operar la caja a máxima velocidad con teclado convencional o numérico:

| Atajo | Acción en el Sistema |
|---|---|
| **Ctrl + K** | **Paleta de Comandos Global** (buscar cualquier pantalla, acción o producto al escribir) |
| **Ctrl + B** | Alternar barra lateral (completa → íconos → oculta) |
| **F1** | Enfocar buscador / lector de códigos de barras en Caja |
| **F2** | Abrir modal de **Cobro y Vueltos Mixtos** |
| **F3** | Poner cuenta actual en **Espera** (Multicuenta / Cola de atención) |
| **F4** | Impresión rápida de comanda térmica para cocina |
| **F6** | Registrar rápido de gastos o compras menores de insumos |
| **F7** | Abrir la pantalla de **Cuadre del Día / Arqueo** |
| **Esc** | Cerrar cualquier modal, diálogo o cancelar búsqueda |
| **1 al 9** | Seleccionar directamente la familia de productos en Caja |
| **+ / -** | Aumentar o disminuir la cantidad del último ítem agregado |

---

## 7. Ejecución de la Suite de Pruebas

Para verificar la integridad fiscal, la persistencia del journal y los componentes de UI:

```powershell
# Verificación de sintaxis y balanceo HTML
node tools/check-html.js
node tools/check-scripts.js

# Pruebas fiscales, de journal y de integración
node tests/tax.test.js
node server/test-journal.js
node tests/run.js

# Verificación de integración del shell desktop
npm --prefix desktop test

# Prueba rápida smoke-test del binario empaquetado
.\dist\MI-TIENDA-POS-win32-ia32\MI-TIENDA-POS.exe --smoke-test --start=pos
```

---

## 8. Licencia y Créditos

Desarrollado bajo licencia MIT. Creado con foco estricto en la resiliencia operativa, la protección patrimonial y la fluidez de trabajo del comerciante venezolano.
