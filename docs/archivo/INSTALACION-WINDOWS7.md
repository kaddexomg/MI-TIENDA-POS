# Guía de Instalación y Optimización para Windows 7

> **Objetivo**: Configurar **MI-TIENDA-POS** en una computadora de bajos recursos con Windows 7 (32 o 64 bits), optimizando el rendimiento, la memoria RAM y la experiencia de usuario tipo aplicación de escritorio nativa.

---

## 1. Requisitos del Sistema

- **Sistema Operativo**: Windows 7 Service Pack 1 (SP1) de 32 o 64 bits (también compatible con Windows 8.1, 10 y 11).
- **Procesador**: Intel Pentium 4 / Celeron / Dual Core a 1.6 GHz o superior.
- **Memoria RAM**: Mínimo 1 GB (2 GB recomendados).
- **Almacenamiento**: Menos de 50 MB de espacio libre en disco.
- **Navegador**: Google Chrome (versión 109 o anterior, la última compatible con Win7), Chromium, o Microsoft Edge (v109).

---

## 2. Instalación en 3 Pasos

### Paso 1: Ubicación de los Archivos
Coloca la carpeta del proyecto en una ruta permanente del equipo, preferiblemente:
```
C:\MI-TIENDA-POS\
```
o directamente en el escritorio del usuario:
```
C:\Users\PC\Desktop\MI-TIENDA-POS\
```

### Paso 2: Ejecutar el Instalador
1. Abre la carpeta `MI-TIENDA-POS`.
2. Haz clic derecho sobre `INSTALADOR-WINDOWS-7.bat` y selecciona **"Ejecutar como administrador"** (o doble clic normal).
3. El instalador creará automáticamente:
   - La carpeta `C:\MI-TIENDA-DATOS\respaldos\` para copias de seguridad locales.
   - El acceso directo **MI TIENDA - CAJA** en tu Escritorio.
   - El acceso directo **MI TIENDA - ADMINISTRADOR** en tu Escritorio.

### Paso 3: Configurar el Modo Aplicación (`--app`)
Los archivos `.bat` incluidos (`INICIAR-POS.bat` e `INICIAR-ADMIN.bat`) buscan automáticamente el ejecutable de Google Chrome o Microsoft Edge en tu sistema y lanzan la aplicación en **Modo Kiosco / App**:
- Sin barra de direcciones ni pestañas del navegador.
- Comportamiento idéntico al de un software de escritorio `.exe`.
- Cero consumo innecesario de GPU o memoria RAM.

---

## 3. Configuración de Hardware de Caja

### 3.1. Pistola Lectora de Código de Barras (USB)
1. Conecta la pistola lectora a cualquier puerto USB.
2. La pistola funciona en modo emulación de teclado (*Keyboard Wedge*).
3. En la pantalla de Caja, presiona la tecla **F1** para colocar el cursor en el buscador y dispara el lector hacia el código de barras del producto.
4. El sistema agregará el producto al ticket de forma instantánea.

### 3.2. Cámara Web para Lectura de Códigos
Si no cuentas con pistola física USB, puedes utilizar una cámara web:
1. Conecta la cámara web al equipo.
2. En la pantalla de Caja o Productos, haz clic en **"Cámara / Lector"**.
3. Concede los permisos de cámara en el navegador.
4. Apunta el código de barras o QR frente al lente; el lector decodificará el código automáticamente.

### 3.3. Impresora Térmica de Tickets / Comandas (58mm o 80mm)
1. Instala los controladores de tu impresora térmica USB (ej. POS-58, POS-80 o Xprinter).
2. Establécela como impresora predeterminada en Windows 7:
   - *Inicio → Dispositivos e Impresoras → Clic derecho en la impresora térmica → Establecer como predeterminada*.
3. En la configuración de impresión de Chrome/Edge:
   - Márgenes: **Ninguno**.
   - Opciones: Desmarcar "Encabezados y pies de página".
4. Al pulsar **F4** en la Caja, la comanda se imprimirá directamente con el formato térmico optimizado.

---

## 4. Rutina Diaria Recomendada para el Cajero

1. **Al iniciar el turno**:
   - Abrir **MI TIENDA - CAJA**.
   - Presionar **F2** o tocar las tasas de la barra lateral para verificar la tasa BCV del día.
2. **Durante la atención**:
   - Atender con números `1` al `9` para comidas y empanadas.
   - Atender con lector de barras o buscador `F1` para víveres y bebidas.
   - Presionar `F3` si un cliente se retrasa pagando para pasar al siguiente sin perder la cuenta.
   - Si pagan por Pago Móvil, copiar los últimos 4 dígitos o pegar el SMS en el verificador.
3. **Al finalizar el turno**:
   - Ingresar a **Órdenes y Cuadre Turno** (o ir al panel Admin en `admin/cierres.html`).
   - Imprimir o verificar el arqueo neto: cuánto dinero físico en USD ($), en Bolívares y en transferencias bancarias debe haber en la gaveta.
   - Exportar el respaldo del día en formato JSON a la carpeta `C:\MI-TIENDA-DATOS\respaldos\`.
