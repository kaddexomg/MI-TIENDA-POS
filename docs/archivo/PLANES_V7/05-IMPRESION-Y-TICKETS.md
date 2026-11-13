# 05 — IMPRESIÓN, TICKETS Y COMANDA DE COCINA

> 🟢 Riesgo bajo. Archivos: `assets/css/pos.css`, `assets/js/pos-engine.js`, `assets/js/config.js`

---

## 1. El problema

`window.print()` imprime **la pantalla de caja completa** (3 columnas) con **dos tickets lado a lado** en un `grid-template-columns: 1fr 1fr` (`pos-engine.js:1740`). En una impresora térmica de 80 mm sale una comanda y una nota de entrega comprimidas, con saltos de página y con los botones de la interfaz.

Además:
- La **vista previa F4** muestra `Base Imponible $0.00` e `IVA (16%) $0.00` porque arma el objeto sin esos campos (`pos-engine.js:1685-1706`).
- El recibo **no imprime el detalle de los pagos** (método, banco, referencia) — sin eso el cuadre del día no se puede auditar ni evidenciar la base IGTF.
- El rótulo "(SIN VALIDEZ DE CRÉDITO FISCAL)" es un **literal fijo** (`pos-engine.js:1758`) aunque la máquina esté homologada.
- Se imprime **comanda** incluso en ventas solo de minimercado.

---

## 2. `assets/css/pos.css` — reglas de impresión (NUEVO bloque al final)

```css
  /* ==========================================================================
     IMPRESIÓN — Ticket térmico 80mm y comanda de cocina
     ========================================================================== */
  @page { size: 80mm auto; margin: 3mm; }

  @media print {
    .admin-aside, .admin-topbar, .pos-layout-3col, .pos-aside,
    .modal-box, .modal-hd, .modal-ft, .v7-palette-backdrop,
    .menu-fab, .no-print, .btn, button {
      display: none !important;
    }

    body, html { background: #fff !important; height: auto !important; overflow: visible !important; }

    .print-root { display: block !important; }

    .thermal-ticket {
      width: 72mm !important;
      margin: 0 auto 6mm !important;
      padding: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      background: #fff !important;
      color: #000 !important;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 11pt !important;
      line-height: 1.35;
      page-break-inside: avoid;
      page-break-after: always;
    }
    .thermal-ticket:last-child { page-break-after: auto; }

    .ticket-line { display: flex; justify-content: space-between; gap: 8px; }
    .ticket-total { font-size: 14pt; font-weight: 800; border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
    .ticket-center { text-align: center; }
    .ticket-muted { font-size: 9pt; }
  }
```

---

## 3. `assets/js/pos-engine.js` — tickets

### 3.1 Un ticket por página, en flujo de bloque

```js
  // ANTES (línea ~1740)
  // ticketsGrid.style.gridTemplateColumns = '1fr 1fr';

  // DESPUÉS
  ticketsGrid.style.gridTemplateColumns = '1fr';   // uno debajo del otro
  ticketsGrid.style.display = 'block';
```

### 3.2 Imprimir solo si hay platos (comanda)

```js
  function showPrintedTicketsModal(sale) {
    const hasDishes = (sale.items || []).some(function (i) { return i.isDish || i.isVariant; });
    const tickets = [];
    if (hasDishes) tickets.push(buildKitchenTicket(sale));   // comanda
    tickets.push(buildDeliveryNote(sale));                     // nota de entrega
    // ...
  }
```

### 3.3 La nota de entrega debe incluir los pagos

```js
  function buildDeliveryNote(sale) {
    const fd = sale.fiscalData || {};
    const pay = sale.payments || [];
    const chg = sale.changeGiven || {};

    let html = '';
    html += '<div class="ticket-center"><strong>' + (fd.storeName || 'MI TIENDA POS') + '</strong><br>' +
            (fd.storeAddress || '') + '<br>RIF: ' + (fd.storeRif || '') + '</div>';
    html += '<hr>';
    html += '<div class="ticket-line"><span>Orden</span><span>' + (sale.orderNumber || '') + '</span></div>';
    html += '<div class="ticket-line"><span>Fecha</span><span>' + fmtDateTime(sale.createdAt) + '</span></div>';
    if (fd.serialNumber) {
      html += '<div class="ticket-line"><span>Serial</span><span>' + fd.serialNumber + '</span></div>';
      html += '<div class="ticket-line"><span>Comprobante</span><span>' + fd.fiscalInvoiceNumber + '</span></div>';
      html += '<div class="ticket-line"><span>Control</span><span>' + fd.controlNumber + '</span></div>';
    }
    html += '<hr>';

    // Ítems
    (sale.items || []).forEach(function (i) {
      html += '<div class="ticket-line"><span>' + esc(i.qty) + ' x ' + esc(i.name) + '</span><span>' + money(i.subtotalUsd) + '</span></div>';
    });
    html += '<hr>';

    // Fiscal
    html += '<div class="ticket-line"><span>Exento</span><span>' + money(fd.taxExemptUsd) + '</span></div>';
    html += '<div class="ticket-line"><span>Base imponible 16%</span><span>' + money(fd.taxableBaseUsd) + '</span></div>';
    html += '<div class="ticket-line"><span>IVA 16%</span><span>' + money(fd.ivaUsd) + '</span></div>';
    if (fd.igtfUsd > 0) {
      html += '<div class="ticket-line"><span>IGTF 3%</span><span>' + money(fd.igtfUsd) + '</span></div>';
    }
    html += '<div class="ticket-line ticket-total"><span>TOTAL</span><span>' + money(sale.totalUsd) + '</span></div>';
    html += '<div class="ticket-line"><span>Total en Bs (BCV)</span><span>' + moneyBs(sale.totalBs) + '</span></div>';

    // PAGOS — nuevo
    html += '<hr><div><strong>PAGOS:</strong></div>';
    pay.forEach(function (p) {
      let line = p.method;
      if (p.bill) line += ' (' + p.bill + ')';
      if (p.bank) line += ' ' + p.bank;
      if (p.ref) line += ' Ref ' + p.ref;
      html += '<div class="ticket-line"><span>' + esc(line) + '</span><span>' + money(p.amountUsd) + '</span></div>';
    });
    if (chg.totalChangeUsd > 0) {
      html += '<div class="ticket-line"><span>Vuelto</span><span>' + money(chg.totalChangeUsd) + '</span></div>';
      html += '<div class="ticket-muted">Entregado: ' + esc(chg.breakdown || '') + '</div>';
    }

    // Rótulo fiscal DINÁMICO
    html += '<hr><div class="ticket-center ticket-muted">' +
            (fd.isFiscalValid
              ? 'COMPROBANTE FISCAL HOMOLOGADO'
              : 'NOTA DE ENTREGA - CONTROL INTERNO - NO ES FACTURA FISCAL') +
            '</div>';

    return '<div class="thermal-ticket">' + html + '</div>';
  }
```

### 3.4 Corregir la vista previa F4

```js
  function openQuickKitchenTicketPreview() {
    // ANTES: armaba el objeto sin los campos fiscales → la comanda salía en $0.00
    // DESPUÉS:
    const tax = computeSaleTotals();          // ← el total único de la fase 04
    const previewOrder = {
      orderNumber: MTP.state.settings.nextOrderNumber,
      createdAt: new Date().toISOString(),
      customer: (document.getElementById('posCustomerInput')?.value || '') || 'Orden / Cotización',
      rateBcv: tax.rateBcv,
      subtotalUsd: tax.subtotalBaseUsd,
      exentoUsd: tax.exentoUsd,
      baseG16Usd: tax.baseG16Usd,
      ivaUsd: tax.totalIvaUsd,
      ivaBs: tax.totalIvaBs,
      igtfUsd: tax.igtfUsd,
      igtfBs: tax.igtfBs,
      totalUsd: tax.totalUsd,
      totalBs: tax.totalBs,
      items: cart.map(...),
      payments: currentPayments,
      changeGiven: { ... }
    };
    // ...
  }
```

### 3.5 Botón "Reimprimir ticket"

En `caja/index.html` (lista del turno), cada fila de venta lleva un botón que llama:

```js
  function reprintSale(saleId) {
    const sale = MTP.state.sales.find(function (s) { return s.id === saleId; });
    if (!sale) { MTP.toast('No se encontró la venta', 'err'); return; }
    showPrintedTicketsModal(sale);
  }
```

### 3.6 "Descargar trama fiscal" visible

`config.js:4265` genera el archivo `FACTURA_FISCAL_ORD_*.TXT` pero **nadie lo llama**. Agregar en el modal de tickets:

```html
        <button class="btn btn-secondary btn-sm" onclick="window.MTPPos.downloadFiscalCommandFile(window.__currentSale)">
          ⬇ Descargar trama fiscal (TXT)
        </button>
```
y exponer `downloadFiscalCommandFile` en `window.MTPPos`.

---

## 4. Checklist de cierre de la fase 05

- [ ] `Ctrl+P` en la caja imprime **solo** los tickets, en 80 mm
- [ ] Comanda y nota salen **una por página**
- [ ] Una venta de solo minimercado imprime **1** ticket
- [ ] El ticket muestra Exento / Base 16% / IVA / IGTF / TOTAL
- [ ] El ticket muestra el **detalle de pagos** con banco y referencia
- [ ] El ticket muestra el vuelto y cómo se entregó
- [ ] La vista previa F4 ya no muestra `$0.00` en base imponible
- [ ] Con máquina fiscal configurada, el rótulo no dice "SIN VALIDEZ DE CRÉDITO FISCAL"
- [ ] "Reimprimir ticket" funciona desde el turno de Caja
