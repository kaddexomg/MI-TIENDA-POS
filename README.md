# MI-TIENDA-POS — Sistema POS Híbrido, Kardex Inmutable y Control Operativo

> **Versión**: 7.0 (Rediseño de Experiencia, Dinero y Navegación)
> **Compatibilidad**: Windows 7 (32/64 bit), Windows 10, Windows 11, Linux, macOS  
> **Requisitos Mínimos**: 2 GB de RAM, Procesador Dual-Core, Pantalla 1024×768 o superior  
> **Entorno**: 100% Offline-Ready (Sin servidores locales pesados, sin Node.js o Python en ejecución, Modo `--app` de Chromium/Chrome/Edge)

---

## 1. ¿Qué es MI-TIENDA-POS?

**MI-TIENDA-POS** es un sistema de punto de venta y gestión contable-operativa diseñado a la medida de la realidad comercial venezolana. Resuelve la complejidad de negocios híbridos que operan simultáneamente como:

1. **Restaurante / Comida Rápida Criolla**: Venta de empanadas, pastelitos andinos, tequeños, papas rellenas, pabellón criollo, arroz chino, pollo frito y cafetería.
2. **Minimercado / Abasto / Bodega**: Venta directa de víveres empaquetados (Harina P.A.N., arroz, pasta, margarina), chucherías (Pepito, Cheetos, galletas), refrescos, maltas, cervezas bien frías y cigarros por cajetilla o detallados.

El sistema fue concebido para funcionar con fluidez absoluta en **computadoras de oficina de bajos recursos** (como PCs de cobranza con Windows 7, procesadores modestos y 2 GB de RAM), erradicando el sobrecalentamiento, consumo excesivo de GPU o glifos no soportados (`□`).

---

## 2. Reglas Maestras de Negocio

### 2.1. Separación Estricta de Inventario (Cocina vs. Minimercado)
- **Insumos Exclusivos de Cocina (`type: 'insumo'`, `sellable: false`)**:
  - Las papas crudas, carnes para mechar/moler, pollos crudos, aliños (cebolla, ajo, pimentón, ají dulce, cilantro), harina de amasar, arroz de olla, aceite de freír y envases térmicos **NO aparecen a la venta suelta en la Caja**.
  - Su inventario se controla en kilogramos (`kg`) o litros (`L`). Al vender empanadas o platos, el sistema descuenta automáticamente los gramos exactos establecidos en la receta.
- **Productos de Venta Directa (`type: 'venta'`, `sellable: true`)**:
  - Harina P.A.N. de paquete, refrescos (Frescolita, Coca-Cola, Malta), snacks, cervezas (Polar Pilsen, Zulia) y cigarros.
  - Se identifican y cobran mediante **Lector de Código de Barras USB**, **Cámara Web en Vivo** o **Códigos Cortos**.

### 2.2. Motor Multimoneda y Protección Antiperdida
El sistema sincroniza y administra 3 tasas cambiarias en vivo:
1. **Banco Central de Venezuela (BCV USD)**: Tasa legal para facturación en bolívares.
2. **Euro Oficial BCV (EUR)**: Tasa oficial europea.
3. **USDT Binance P2P (Paralelo)**: Tasa real del mercado de reposición de inventario.

El motor calcula en tiempo real la **brecha cambiaria** entre BCV y USDT, recomendando precios de venta en divisas para garantizar que al reponer la mercancía no se sufra descapitalización.

### 2.3. Cuadre de Gaveta, Pago Móvil y Vueltos
- **Doble Moneda en Gaveta**: Seguimiento independiente de Efectivo USD ($), Efectivo Bolívares (Bs), Saldo de Banco por Pago Móvil y Lotes de Punto de Venta.
- **Detector Antifraude de Pago Móvil**: Comprobación obligatoria de los últimos 4 a 6 dígitos de la referencia, con alerta de duplicidad en el turno.
- **Analizador de Mensajes SMS / WhatsApp**: Permite pegar la notificación bancaria del cliente y extrae de forma instantánea el banco, la referencia y el monto pagado.
- **Distribución de Vueltos Mixtos**: Desglosa exactamente cuánto se devuelve en billetes físicos USD ($), bolívares en efectivo o transferencia por Pago Móvil.

### 2.4. Marco Legal Venezolano, Impresoras Fiscales SENIAT y Facturación Dual
El sistema cuenta con una arquitectura de **Facturación Dual Conforme a la Ley**:
1. **Modalidad Fiscal Homologada (SENIAT Providencias 0141 y 0071)**:
   - **Formato Fiscal Legal**: Genera facturas con Razón Social, RIF, Dirección Fiscal, Serial de la Máquina Fiscal, Número Consecutivo de Factura y Número de Control.
   - **Desglose de Alícuotas de IVA**: Separación estricta entre ítems **Exentos `(E)`** (harina, arroz, alimentos básicos) y **Gravados 16% `(G)`** (comida de restaurante, refrescos, snacks, cervezas).
   - **Percepción de IGTF 3% en Divisas**: Cálculo automático del 3% de IGTF sobre los pagos recibidos en divisas en efectivo ($) o Zelle, expresado en Bs según la tasa oficial BCV.
   - **Conexión de Máquinas Fiscales**: Protocolo The Factory HKA (Bixolon SRP-350 / 812), Aclas (PP9 / PP1F3) y BMC (Spark). Genera y descarga la trama fiscal oficial (`FACTURA.TXT`) para el spooler de Windows (`COM1`/`COM2`/USB).
   - **Reportes Obligatorios**: Emisión de **Reporte X** (corte parcial) y **Reporte Z** (cierre diario de memoria fiscal con transmisión al SENIAT).
2. **Modalidad Control Interno / Comandas de Cocina**:
   - Para negocios en transición o control de despacho interno en cocina/barra sin impacto fiscal.

### 2.5. Conexión de Puntos de Venta (POS) y Cierre de Lotes
- **Terminales Físicos Autónomos (Pax A920, Verifone Vx520, Biopago BDV)**: Cada terminal se registra en el sistema con su banco adquirente y número de lote activo.
- **Trazabilidad por Voucher**: Al cobrar con tarjeta de débito o crédito, el cajero registra el N° de Aprobación/Voucher impreso por el punto y el tipo de tarjeta (TDD / TDC / Biopago).
- **Cierre de Lote con Cotejo en Vivo**: Al finalizar el turno o jornada, el cajero imprime el comprobante de cierre de lote en el punto físico y transcribe los bolívares y operaciones. El sistema compara automáticamente contra las ventas registradas, alertando si existe faltante o sobrante de vouchers.

### 2.6. Validación Anti-Fraude de Pago Móvil y Cobro Directo C2P
- **Multicuenta de Destino**: Registro y selección de las cuentas bancarias receptoras del negocio (Banesco, BDV, Bancamiga, etc.).
- **Ciclo de Verificación**: Estados `CONFIRMADO EN BANCO` vs `PENDIENTE DE VERIFICACIÓN` para evitar fraudes por capturas falsas.
- **Detector Anti-Duplicados**: Alerta instantánea en rojo si una referencia ya fue ingresada en otra orden del día.
- **Lector Inteligente de SMS**: Auto-llenado de banco, referencia y monto pegando el texto bancario.
- **Débito Directo C2P**: Procesamiento de cobro inmediato solicitando al cliente su Banco, Cédula, Teléfono y Clave Dinámica OTP de 8 dígitos.

---

## 3. Características Técnicas

- **Kardex Inmutable**: Cada movimiento de inventario (`COMPRA`, `VENTA`, `MERMA`, `CONSUMO_PERSONAL`, `PRODUCCION_COCINA`, `AJUSTE_AUDITORIA`) queda registrado con fecha, hora, responsable, cantidad anterior, cantidad movida y balance resultante.
- **Recepción Formal de Facturas Multi-Ítem**: Carga de notas de entrega o facturas de proveedores con desglose de múltiples renglones y actualización directa de gaveta.
- **Calculadora de Bulto a Unidades**: Conversión inmediata del costo por bulto, fardo, caja o saco al costo y margen por unidad o kilo.
- **Auditoría por Conteo Físico Ciego**: Herramienta de cotejo entre la existencia física en estante y la teórica del sistema, con valorización monetaria de faltantes/sobrantes.
- **Iconos Vectoriales SVG Nativos**: 100% offline, sin dependencias de fuentes externas o emojis que puedan fallar en versiones antiguas de Windows.
- **Diseño Ultra Compacto de Alta Densidad**: Adaptado para monitores estándar (1024×768 / 1366×768) con visibilidad total sin necesidad de desplazamientos toscos.

---

## 4. Estructura del Proyecto

```
MI-TIENDA-POS/
├── index.html                   # Selector visual de rol (Cajero / Administrador)
├── INICIAR-POS.bat              # Lanzador en modo aplicación para la Caja
├── INICIAR-ADMIN.bat            # Lanzador en modo aplicación para Administración
├── INSTALADOR-WINDOWS-7.bat     # Instalador automático de accesos directos
├── README.md                    # Manual completo del sistema (este archivo)
├── INSTALACION-WINDOWS7.md      # Guía detallada de instalación para Windows 7
├── AGENTS.md                    # Reglas maestras para agentes y desarrollo
├── PROJECT_BRAIN.md             # Índice arquitectónico del sistema
│
├── admin/                       # Módulos de Gestión Administrativa
│   ├── index.html               # Dashboard financiero con gráficos SVG nativos
│   ├── pos.html                 # Terminal de Caja con privilegios administrativos
│   ├── inventario.html          # Inventario maestro, Kardex, compras y mermas
│   ├── recetas.html             # Recetas de cocina y control de producción
│   ├── productos.html           # Catálogo con escáner de códigos de barras
│   ├── precios.html             # Precios recomendados y brechas cambiarias
│   ├── cierres.html             # Arqueo de gaveta y conciliación de Pago Móvil
│   ├── facturas.html            # Facturas de proveedores y cuentas por pagar
│   └── ajustes.html            # Configuración fiscal, datos y respaldos JSON
│
├── caja/                        # Módulos para el Personal de Caja
│   ├── pos.html                 # Pantalla táctil y de teclado para facturar rápido
│   └── index.html               # Historial de turnos y órdenes despachadas
│
└── assets/
    ├── css/
    │   ├── variables.css        # Paleta de colores, fuentes y tokens de diseño
    │   ├── components.css       # Botones, tablas, modales y formularios compactos
    │   ├── layout.css           # Barra lateral colapsable y barra superior
    │   └── pos.css              # Pantalla de caja Zero-Scroll 100vh
    ├── js/
    │   ├── icons.js             # Librería de iconos SVG nativos (reemplazo de emojis)
    │   ├── config.js            # Estado central, base de datos local y Kardex
    │   ├── rates.js             # Motor de tasas (BCV USD, Euro, USDT Binance)
    │   ├── pos-engine.js        # Lógica de venta, atajos F1-F4 y vueltos
    │   ├── barcode-engine.js    # Decodificación de códigos de barras (Pistola/Cámara)
    │   └── sidenav.js           # Barra lateral y modal de compras rápidas
    └── img/                     # Imágenes verificadas de comida y productos
```

---

## 5. Instalación y Puesta en Marcha

### Instalación Rápida en 1 Clic (Windows 7 / 10 / 11)

1. Descarga o clona el repositorio en tu computadora.
2. Haz doble clic sobre el archivo **`INSTALADOR-WINDOWS-7.bat`**.
3. El instalador:
   - Creará la carpeta de seguridad local `C:\MI-TIENDA-DATOS\respaldos\`.
   - Creará dos accesos directos en tu Escritorio:
     - **MI TIENDA - CAJA**: Abre directamente la pantalla de facturación para el cajero.
     - **MI TIENDA - ADMINISTRADOR**: Abre el panel administrativo con acceso a Kardex, inventario y cuadres.
4. ¡Listo! No requiere instalar servidores locales ni configurar bases de datos complejas.

---

## 6. Atajos de Teclado de Alta Velocidad

Diseñado para despachar filas de clientes en segundos utilizando exclusivamente el teclado numérico y las teclas de función:

| Tecla | Acción en el Sistema |
|---|---|
| **Ctrl + K** | **Abrir la paleta de comandos** (ir a cualquier pantalla o acción escribiendo) |
| **Ctrl + B** | Mostrar / ocultar el menú lateral (completo → en íconos → oculto) |
| **F1** | Enfocar el cursor en el buscador / escáner de códigos de barras |
| **F2** | Abrir la ventana de Cobro y cálculo de Vueltos |
| **F3** | Poner la cuenta actual en **Espera** (Multicuenta para atender al siguiente) |
| **F4** | Vista previa e impresión de Comanda de Cocina |
| **F6** | Registrar rápido de gastos operativos o compras menores de insumos |
| **F7** | Ir al Cuadre del día |
| **Esc** | Cerrar cualquier ventana emergente o cancelar modo reemplazo |
| **1 al 9, 0** | Abrir la familia correspondiente o seleccionar variedad en el modal |
| **+ / -** | Incrementar o disminuir la cantidad del último ítem añadido |

> **En la Caja**, los botones de billete **suman** (pulsar `$20` y luego `$5` = $25) y el sistema
> propone el vuelto con **denominaciones reales** (US$ 1-100 y Bs 0,10-2.000). Si la distribución
> del vuelto no cuadra, el botón **Confirmar Cobro se deshabilita**.

---

## 7. Respaldo y Persistencia de Datos

Los datos (inventario, ventas, recetas, movimientos de Kardex y compras) se almacenan localmente en el almacenamiento seguro del navegador (`IndexedDB` y `localStorage`).

Para garantizar la seguridad de la información ante fallas del disco duro:
1. **Descarga de Respaldo**: En `admin/ajustes.html`, pulsa **"Descargar Respaldo JSON"** para guardar una copia de seguridad en `C:\MI-TIENDA-DATOS\respaldos\` o en una memoria USB.
2. **Restauración**: En caso de formateo o cambio de equipo, pulsa **"Restaurar Respaldo JSON"** y selecciona tu archivo para recuperar todo en 1 segundo.

---

## 8. Licencia y Créditos

Desarrollado bajo licencia MIT. Creado con foco en la resiliencia operativa y la protección del comerciante gastronómico venezolano.
