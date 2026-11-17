# Plan de Implementación v8.5 — App Escáner Dedicada, Lector Bancario de Pago Móvil y Flujo Automercado

> **Estado**: Listo para implementar por cualquier desarrollador o agente sin contexto previo.  
> **Base actual**: `v8.4.0` (Node.js puro sin dependencias externas en `server/`, Frontend Vanilla JS en `assets/js/` y `mobile/`, Android nativo sin Gradle en `mobile/android-app/` compilado con `tools/build-mobile-apk.ps1` usando JDK 21 + Android SDK 35).

---

## 0. Lo que YA quedó corregido en esta versión (no repetir)
- **Sesión / PIN**: `TOKEN_TTL_MS` ampliado a 30 días en `server/api.js` y bloqueo por inactividad (`idleLockMin`) ajustado a 60 min (desactivable con `<= 0`) en `assets/js/core/auth.js`.
- **Sonido y anti-rebote del Escáner**: `unlockAudio()` al primer toque + pitido láser en `mobile/barcode-scanner.js` y `assets/js/modules/barcode-engine.js`. Bloqueo por presencia (`activeLockedCode`) para que un código sostenido frente a la cámara **no** se vuelva a escanear hasta que salga del encuadre (~800 ms / 6 cuadros).
- **Estudio de Fotos IA (`assets/js/modules/photo-studio.js`)**: Respaldo automático al servidor local (`127.0.0.1:7070` / origen local) y alineación de token por destino (`MTPApiClient.getAuthToken`).

---

## Fase 1 — Separación de Apps Móviles: Escáner por Defecto vs. Admin Dueño

### Objetivo
Evitar mezclar en una sola app el uso operativo de caja/almacén con el panel financiero del dueño.

### Entregables y archivos a modificar/crear
1. **Separación de carpetas web en `mobile/`**:
   - Mantener `mobile/scanner.html` + `mobile/barcode-scanner.js` como interfaz **por defecto** para el escáner (`/` o `/escaner` en el servidor).
   - Mantener `mobile/index.html` + `mobile/mobile.js` exclusivo para el panel **Admin** (`/admin-movil` o `/mobile/index.html`).
   - Eliminar/ocultar accesos administrativos desde la vista del Escáner cuando el usuario entre por `pairCode` o rol `Cajero`.

2. **Dos sabores de APK Android desde `mobile/android-app/`**:
   - **APK 1 — `MI-TIENDA-ESCANER.apk` (por defecto para personal/caja)**:
     - `applicationId` / `package`: `com.mitienda.scanner`
     - Nombre visible: `MI TIENDA ESCÁNER`
     - Pantalla inicial: `http://localhost/scanner.html` (solo cámara, pistola virtual, consulta rápida de precio y conteo).
     - Sin `MtpAlertService` de ventas/ganancias ni acceso a `mobile/index.html`.
   - **APK 2 — `MI-TIENDA-ADMIN.apk` (exclusivo para el dueño)**:
     - `applicationId` / `package`: `com.mitienda.admin`
     - Nombre visible: `MI TIENDA ADMIN`
     - Pantalla inicial: `http://localhost/index.html` (PIN de Administrador, Mi Día, Pago Móvil, Inventario, IA Costos, Control).
     - Incluye `MtpAlertService` y el servicio lector de Pago Móvil (Fase 2).

3. **Actualizar `tools/build-mobile-apk.ps1`**:
   - Añadir parámetro `-Flavor All | Admin | Scanner` (por defecto `All`).
   - Compilar `MI-TIENDA-ESCANER.apk` y `MI-TIENDA-ADMIN.apk` en la raíz del proyecto usando plantillas de `AndroidManifest` o reemplazo temporal en `build/` sin duplicar código fuente innecesariamente.

### Criterio de aceptación Fase 1
- Ambos APKs se instalan juntos en el mismo teléfono Android sin conflicto de paquete.
- Al abrir `MI-TIENDA-ESCANER.apk`, abre directo el escáner y no muestra datos financieros ni menú de dueño.

---

## Fase 2 — Lector Automático de Mensajes/Notificaciones Bancarias (Pago Móvil)

### Objetivo
Que la aplicación móvil del dueño (o un teléfono dedicado en caja) capture automáticamente las confirmaciones bancarias de Pago Móvil entrantes y las envíe al servidor para conciliar los cobros sin que el cajero tenga que revisar capturas manualmente.

### Arquitectura recomendada (Android `NotificationListenerService` + Respaldo SMS)
1. **Android Nativo (`mobile/android-app/src/com/mitienda/admin/`)**:
   - Crear `BankNotificationListenerService.java` extendiendo `android.service.notification.NotificationListenerService`.
   - Declarar en `AndroidManifest.xml` con permiso `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` e intent-filter `android.service.notification.NotificationListenerService`.
   - Exponer en `MainActivity.java` (`AndroidBridge`):
     - `isNotificationAccessEnabled()`: verifica si el usuario otorgó acceso a notificaciones (`Settings.Secure.ENABLED_NOTIFICATION_LISTENERS`).
     - `openNotificationAccessSettings()`: abre directo la pantalla de Android `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`.
     - `setBankListenerEnabled(boolean)` / `getBankListenerStatus()`.
   - *(Opcional secundario)*: Si el banco envía SMS y no notificación de app, evaluar `RECEIVE_SMS` solo si se distribuye fuera de Play Store (APK directo), manteniendo `NotificationListenerService` como vía principal porque funciona con SMS recibidos por la app de Mensajes, WhatsApp o notificaciones push del banco.

2. **Parser de Bancos Venezolanos (`server/pagomovil-parser.js` + espejo ligero en Java o envío del texto crudo filtrado al servidor)**:
   - Enviar desde Android únicamente notificaciones cuyo título/paquete/texto coincida con palabras clave bancarias (`pago movil`, `pagomovil`, `recibido`, `abono`, `transferencia`, `bs`, `ref`, `banesco`, `mercantil`, `bdv`, `venezuela`, `provincial`, `bnc`, `bancamiga`) hacia `POST /api/v1/pagomovil/incoming`.
   - En `server/pagomovil-parser.js` extraer:
     - `amountBs` (número decimal, soportando formato venezolano `1.250,50` y `1250.50`).
     - `reference` (referencia numérica de 4 a 12 dígitos).
     - `phone` o `ci` si aparece en el mensaje.
     - `bankName` / `sourceApp`.
     - `rawText` y `receivedAt`.

3. **Conciliación en Servidor (`server/api.js` y `server/state.js`)**:
   - Endpoint `POST /api/v1/pagomovil/incoming` (autenticado con token Admin/Encargado o dispositivo autorizado).
   - Guardar en lista de abonos bancarios recibidos (`incomingBankPayments`) con deduplicación por `reference + amountBs`.
   - Si existe una venta/pago móvil pendiente o reciente con los últimos 4–6 dígitos de referencia y monto coincidente (tolerancia ±0.50 Bs), marcarlo automáticamente como **Conciliado (`VERIFIED`)** y emitir evento SSE `PAGO_MOVIL_VERIFIED` hacia Caja (`pos.html`) y Móvil (`mobile/index.html`).
   - En `mobile/index.html` (pestaña **Pago Móvil**), añadir tarjeta de estado del "Detector Bancario Automático" con botón para activar el permiso en Android y ver los últimos abonos capturados.

### Criterio de aceptación Fase 2
- Pruebas unitarias en `tests/` con mensajes reales de al menos 5 bancos venezolanos (Banesco, BDV, Mercantil, Provincial, BNC/Bancamiga) verificando extracción exacta de `amountBs` y `reference`.
- Al simular `POST /api/v1/pagomovil/incoming`, si hay un Pago Móvil pendiente con esa referencia y monto, cambia a `VERIFIED` y notifica por SSE.

---

## Fase 3 — Mejoras de Flujo Rápido Tipo Automercado Homologado

### Objetivo
Acercar la velocidad de carga de productos y cobro a los estándares de software venezolano homologado (Saint, Profit, Valery, A2) manteniendo la simplicidad visual.

### Tareas concretas
1. **Entrada Express al escanear código inexistente (`pos.html`, `admin/inventario.html`, `assets/js/modules/product-drawer.js`)**:
   - Cuando un usuario con rol `Administrador` o `Encargado` escanee un código de barras que **no existe** en catálogo, mostrar un toast con botón directo **"➕ Crear con este código"** (o abrir automáticamente el `MTPProductDrawer` en modo creación si está en Inventario/Productos) con el campo `barcode` ya rellenado.
   - Integrar dentro del mismo drawer la calculadora rápida de **Bulto / Caja** (`Costo del bulto ÷ Unidades = Costo unitario` + cálculo automático de precio con margen % en `$` y `Bs`).

2. **Cobro en 1 toque y cambio rápido de cantidad en Caja (`assets/js/modules/pos-engine.js`)**:
   - Al abrir el modal de cobro (`F2`), si el cajero selecciona un método rápido o presiona el botón de **Pago Exacto Bs / USD**, permitir confirmar inmediatamente con `Enter`.
   - Mantener barra personalizable de **"Teclas Calientes"** (hasta 12 productos frecuentes sin código de barras: empanadas, arepas, café, hielo, bolsas) en la parte superior de la grilla de Caja.

3. **Verificador de precios con 1 clic**:
   - Modo "Consultar Precio" accesible desde la barra del escáner (`pos.html` / `mobile/scanner.html`) que muestre precio en `$`, precio en `Bs` (con IVA incluido/recargo según configuración) y existencia actual en grande sin agregar al carrito.

---

## Fase 4 — Verificación Final Obligatoria

Antes de dar por cerrada cualquier fase, ejecutar y validar al 100%:
1. `node tests/run.js`
2. `node tools/check-scripts.js`
3. `node tools/check-html.js`
4. Si se modificó `mobile/` o `mobile/android-app/`, compilar con `powershell -ExecutionPolicy Bypass -File tools/build-mobile-apk.ps1` y verificar firma con `apksigner verify`.
