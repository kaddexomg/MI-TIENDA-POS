# 06 — HARDWARE: LECTOR DE CÓDIGOS, PUERTOS, MÁQUINA FISCAL Y TERMINALES

> 🟡 Riesgo medio. Archivos: `assets/js/barcode-engine.js`, `assets/js/config.js`, `assets/js/pos-engine.js`, `server/api.js`, `server/journal.js`, `admin/ajustes.html`, `assets/js/api-client.js`

---

## 1. Lector de códigos de barras

### 1.1 Problemas

| # | Problema | Ubicación |
|---|---|---|
| L1 | El buffer USB **se escribe dentro de los campos de monto** si el foco está en un input numérico | `barcode-engine.js:12-37` |
| L2 | `window.BarcodeDetector` **no existe** en Chromium 109 → la cámara no escanea nada | `barcode-engine.js:147-165` |
| L3 | El modal de cámara usa clases CSS **inexistentes** (`.modal-head`, `.form-control`, `.btn-primary`) | `barcode-engine.js:57-97` |
| L4 | Código no encontrado → búsqueda silenciosa, sin aviso | `pos-engine.js:1176-1178` |
| L5 | Sin debounce: la cámara puede leer dos veces el mismo código | `barcode-engine.js:151-162` |

### 1.2 Guarda de campos (L1)

```js
  // assets/js/barcode-engine.js — reemplazar el bloque de captura de teclas

  const NUMERIC_INPUT_IDS = ['payAmountUsd', 'payAmountBs', 'posScannerInput'];

  function isBusyField(el) {
    if (!el) return false;
    if (el.id === 'posScannerInput') return false;          // este SÍ es para escanear
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      // Si hay texto acumulado, es un escaneo: se entrega.
      if (buffer.length >= 4) {
        e.preventDefault();                      // ← faltaba: el Enter contaminaba el monto
        const code = buffer; buffer = '';
        triggerScan(code);
        return;
      }
    }
    // Si el foco está en un campo de captura de datos, NO se acumula el buffer.
    if (isBusyField(document.activeElement)) {
      if (buffer.length) showHint('⚠ Quite el foco del campo para escanear');
      return;
    }
    // ... resto de la captura ...
  }
```

### 1.3 Cámara (L2, L3)

**Decisión**: no prometer cámara si no hay decoder. Tres opciones, en orden de preferencia:

| Opción | Qué implica |
|---|---|
| **A (recomendada)** | Cargar `assets/js/vendor/jsQR.min.js` **offline** (~40 KB, MIT) y decodificar los frames del `<video>` a mano. Funciona en Chromium 109. |
| B | Quitar el botón "Cámara" y dejar: Lector USB + entrada manual + **código corto** (ya existe `findByCodeOrBarcode`) + generador de códigos propios (`generateBarcodeSvg`, `barcode-engine.js:189`). |
| C | Detectar `window.BarcodeDetector` y usar la cámara **solo** si existe, mostrando "Cámara no disponible en este equipo" si no. |

Mínimo obligatorio para la opción C (si no se implementa A):

```js
  function cameraAvailable() {
    return typeof window.BarcodeDetector === 'function';
  }
  // En el botón:
  // <button class="btn btn-secondary btn-sm" onclick="window.MTPBarcode.openCameraScannerModal()" id="btnCam">
  // Disabled si !cameraAvailable(), con title "Cámara no disponible en este equipo"
```

### 1.4 Modal de cámara con las clases correctas (L3)

```html
        <div class="modal-hd"><h3>📷 Escanear con la cámara</h3>
          <button class="btn btn-secondary btn-sm" onclick="window.MTPBarcode.closeCameraScannerModal()">✕</button></div>
        <div class="modal-bd">
          <video id="bcVideo" playsinline style="width:100%;max-height:280px;background:#000;border-radius:8px"></video>
          <div class="form-group" style="margin-top:10px">
            <label>Código manual (si la cámara no lee)</label>
            <input id="bcManualInput" class="input" placeholder="Ej: 7591234567890">
          </div>
        </div>
        <div class="modal-ft">
          <button class="btn btn-secondary" onclick="window.MTPBarcode.closeCameraScannerModal()">Cerrar</button>
          <button class="btn btn-action" onclick="window.MTPBarcode.submitManualCode()">Buscar código</button>
        </div>
```

### 1.5 Aviso de código no encontrado (L4)

```js
  // assets/js/pos-engine.js — handleCodeOrSearchSubmit
  if (!found) {
    MTP.toast('Código no encontrado: ' + code + '. Se buscaró por nombre.', 'warn');
  }
```

---

## 2. Máquina fiscal y puertos COM

### 2.1 El problema real

**Un navegador no puede escribir a un puerto serie.** `fiscalConfig.port` (COM1..COM4 / IP) se guarda en Ajustes (`admin/ajustes.html:207-213`) y **no se usa para nada**. Además:

- `downloadFiscalCommandFile` (`config.js:4265`) **nunca se invoca** → el dueño nunca descarga la trama.
- `generateFiscalHkaCommand` (`config.js:4233`) **no incluye** número de comprobante, número de control ni serial, que sí se calculan en `config.js:3044-3047` → una HKA real rechazaría el archivo.
- La línea de IGTF de la trama va **sin importe** (`config.js:4256-4258`).
- `emitFiscalReportX/Z` (`config.js:4279-4291`) **anuncia "ejecutado exitosamente" sin máquina** y resucita el número ficticio `142`.

### 2.2 Solución: el `server/` local como puente

El proyecto ya tiene un servidor Node sin dependencias (`server/server.js`, `INICIAR-POS.bat:32` lo levanta en `http://localhost:7070`). Ese es el puente.

#### 2.2.1 `server/api.js` — nuevo endpoint

```js
  // POST /api/fiscal/print
  // body: { command: '<trama fiscal>', port: 'COM1', format: 'HKA' }
  function handleFiscalPrint(body, res) {
    const port = String(body.port || 'COM1');
    const command = String(body.command || '');
    if (!command) return sendJson(res, 400, { ok: false, error: 'Trama vacía' });

    // 1) Spooler de Windows (preferido: no requiere abrir el COM)
    const spoolDir = path.join(process.env.SystemRoot || 'C:\\Windows', 'Spool', 'MI-TIENDA-POS');
    try {
      fs.mkdirSync(spoolDir, { recursive: true });
      const file = path.join(spoolDir, 'FACTURA_' + Date.now() + '.TXT');
      fs.writeFileSync(file, command, 'utf8');
      return sendJson(res, 200, { ok: true, mode: 'SPOOLER', file: file });
    } catch (e) { /* sigue al modo COM */ }

    // 2) Puerto serie directo (requiere que el spooler no esté)
    //    NOTA: en Node puro no se puede abrir COM sin dependencia nativa.
    //    Se deja la ruta preparada y documentada para un agente con 'serialport'.
    return sendJson(res, 501, {
      ok: false,
      error: 'Impresora fiscal no disponible',
      hint: 'Se guardó la trama para envío manual en ' + spoolDir
    });
  }
```

#### 2.2.2 `assets/js/pos-engine.js` — enviar la trama

```js
  async function printFiscalCommand(sale) {
    const command = MTP.buildFiscalCommand && MTP.buildFiscalCommand(sale);
    if (!command) { MTP.toast('No hay trama fiscal para esta venta', 'warn'); return; }
    try {
      const r = await fetch((window.MTPApiClient && window.MTPApiClient.getBaseUrl?.() || 'http://localhost:7070') + '/api/fiscal/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command,
          port: (MTP.state.settings.fiscalConfig || {}).port || 'COM1',
          format: (MTP.state.settings.fiscalConfig || {}).brand || 'HKA'
        })
      });
      const data = await r.json();
      if (data.ok) MTP.toast('Trama enviada a la impresora fiscal (' + data.mode + ')');
      else MTP.toast('No se pudo imprimir: ' + (data.error || '') + '. Guardado en ' + (data.file || 'spooler'), 'warn');
    } catch (e) {
      MTP.toast('El servidor local está apagado. Se descargará la trama para envío manual.', 'warn');
      downloadFiscalCommandFile(sale);
    }
  }
```

#### 2.2.3 Completar la trama HKA (`config.js:4233`)

```js
  function generateFiscalHkaCommand(sale) {
    const fd = sale.fiscalData || {};
    const cfg = state.settings.fiscalConfig || {};
    const lines = [];

    // Cabecera con los datos que la máquina exige
    lines.push('HKA|' + (cfg.brand || 'THE_FACTORY_HKA') + '|' + (fd.serialNumber || '') +
               '|' + (fd.fiscalInvoiceNumber || '') + '|' + (fd.controlNumber || '') + '|' +
               (fd.reportZ || 0));

    // Items
    (sale.items || []).forEach(function (i) {
      lines.push('I|' + i.code + '|' + i.qty + '|' + i.unit + '|' + i.priceUsd + '|' + i.subtotalUsd + '|' + (i.taxType || 'G'));
    });

    // Totales
    lines.push('T|E|' + (fd.taxExemptUsd || 0));
    lines.push('T|G16|' + (fd.taxableBaseUsd || 0) + '|' + (fd.ivaUsd || 0));
    if (fd.igtfUsd > 0) lines.push('T|IGTF|' + (fd.igtfUsd || 0));   // ← con importe
    lines.push('T|TOTAL|' + (sale.totalUsd || 0) + '|' + (sale.totalBs || 0));

    // Pagos
    (sale.payments || []).forEach(function (p) {
      lines.push('P|' + p.method + '|' + (p.amountUsd || 0) + '|' + (p.amountBs || 0) + '|' + (p.ref || ''));
    });
    if (sale.changeGiven && sale.changeGiven.totalChangeUsd > 0) {
      lines.push('C|' + sale.changeGiven.totalChangeUsd + '|' + (sale.changeGiven.breakdown || ''));
    }

    lines.push('X');   // fin de trama
    return lines.join('\n') + '\n';
  }
```

#### 2.2.4 Reportes X/Z honestos (`config.js:4279`)

```js
  function emitFiscalReportX() {
    const cfg = state.settings.fiscalConfig || {};
    const machineReady = Boolean(cfg.enabled && cfg.serialNumber && cfg.port);
    if (!machineReady) {
      MTP.toast('Reporte X SIMULADO: no hay máquina fiscal conectada (falta serial o puerto).', 'warn');
      return false;
    }
    // ... enviar al servidor y mostrar el acuse real ...
  }

  function emitFiscalReportZ() {
    const cfg = state.settings.fiscalConfig || {};
    const machineReady = Boolean(cfg.enabled && cfg.serialNumber && cfg.port);
    if (!machineReady) {
      MTP.toast('Reporte Z SIMULADO: no hay máquina fiscal conectada.', 'warn');
      return false;
    }
    // ... y el número se toma de cfg.lastReportZ || 0, NUNCA 142
  }
```

> **Regla**: eliminar el literal `|| 142` (`config.js:4286`) y el serial ficticio `Z4A2098124` de cualquier comparación.

### 2.3 Terminales de punto de venta

`state.posTerminals` existe (`admin/ajustes.html:471-484`) pero el POS no la consulta: hoy es una etiqueta con un campo de texto libre.

```js
  // admin/ajustes.html — cada terminal gana un campo de liquidación
  // <select data-liquid="VES"> liquida en Bolívares </select>
  // <select data-liquid="USD"> liquida en Dólares </select>
```

En el modal de cobro, el método **"Punto de Venta"** debe mostrar un selector de terminal:

```html
        <div id="posTerminalFields" style="display:none">
          <div class="form-group">
            <label>Terminal</label>
            <select id="posTerminalSelect" class="select">
              <!-- se llena desde state.posTerminals -->
            </select>
          </div>
          <div class="form-group">
            <label>Nº de aprobación / voucher</label>
            <input id="posVoucherInput" class="input" placeholder="Ej: 004512">
          </div>
          <div class="form-group">
            <label>Lote</label>
            <input id="posBatchInput" class="input" placeholder="Ej: 000123">
          </div>
        </div>
```

Y el pago guarda `terminalId`, `voucher`, `batchNumber` y `liquidationCurrency` (ya contemplado en la fase 04, §2.8).

> **IGTF**: si la terminal liquida en USD, el cobro entra en la base de divisas (fase 04, §1.1 `isForeignPayment`).

---

## 4. Bitácora inmutable (dejar de depender solo del `localStorage`)

Hoy la venta solo existe en `localStorage` + espejo IndexedDB (`config.js:2542-2544`). El cajero puede editar el historial. El proyecto **ya tiene** `server/journal.js` (NDJSON append-only con `fsync`) y `assets/js/api-client.js` con **outbox** — pero el POS **nunca los llama**.

### 4.1 Conectar el outbox (en `config.js:recordSale`, al final)

```js
    // Después de guardar la venta en el estado local:
    if (window.MTPApiClient && window.MTPApiClient.emitEvent) {
      window.MTPApiClient.emitEvent('SALE_CREATED', {
        id: newSale.id,
        orderNumber: newSale.orderNumber,
        createdAt: newSale.createdAt,
        createdBy: newSale.createdBy,
        totalUsd: newSale.totalUsd,
        totalBs: newSale.totalBs,
        ivaUsd: newSale.ivaUsd,
        igtfUsd: newSale.igtfUsd,
        payments: newSale.payments,
        changeGiven: newSale.changeGiven,
        items: newSale.items
      });
    }
```

El `api-client.js` ya encola si el servidor está apagado y descarga cuando vuelve (`flushOutbox`).

### 4.2 Consecuencia

- El `localStorage` deja de ser la única fuente de verdad.
- El **cuadre del día** es auditable.
- Se puede montar el **respaldo automático** en `server/api.js:171` (`POST /api/backup`).

---

## 5. Checklist de cierre de la fase 06

- [ ] Con el foco en "Monto Recibido USD", el escáner **no** escribe en el campo
- [ ] El `Enter` del lector no dispara el formulario
- [ ] El botón "Cámara" está deshabilitado con un mensaje claro si no hay decoder
- [ ] El modal de cámara se ve con estilos correctos
- [ ] Un código inexistente muestra un aviso
- [ ] "Descargar trama fiscal" es accesible desde el ticket
- [ ] La trama HKA incluye comprobante, control, serial e importe de IGTF
- [ ] Sin máquina fiscal, el Reporte X/Z dice **"Simulado"** y nunca "142"
- [ ] El cobro con tarjeta guarda terminal, voucher, lote y moneda de liquidación
- [ ] Una venta con tarjeta liquidada en USD genera IGTF
- [ ] Con el servidor local apagado, el sistema **no se rompe** (solo avisa y encola)
