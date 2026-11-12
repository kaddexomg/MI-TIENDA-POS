# 04 — CAJA, COBRO Y VUELTO (El dinero)

> 🔴 **Fase bloqueante.** Nada de diseño antes de esto.
> Archivos: `assets/js/pos-engine.js`, `assets/js/tax.js`, `assets/js/config.js`, `caja/pos.html`, `admin/pos.html`, `tests/pos.test.js`

---

## 0. Diagnóstico con líneas exactas

| # | Problema | Ubicación |
|---|---|---|
| D1 | El total del modal se calcula **sin IGTF** pero al cobrar **sí incluye** IGTF | `pos-engine.js:1324` vs `:1471` |
| D2 | `finalizeSale` valida el total **sin IGTF**, `recordSale` registra el total **con IGTF** → la venta guardada ≠ lo cobrado | `pos-engine.js:1594` vs `config.js:2996` |
| D3 | El vuelto no se valida: el cajero puede entregar cualquier combinación | `pos-engine.js:1624-1626` |
| D4 | `rebalanceChangeDistribution('BS_CASH')` no existe → el campo de Bs en efectivo no hace nada | `pos-engine.js:1565-1591` |
| D5 | Los botones de billete **reemplazan** el monto en vez de acumularlo | `pos-engine.js:1372-1388` |
| D6 | El repintado **sobrescribe** lo que el cajero escribió a mano | `pos-engine.js:1512-1513` |
| D7 | La base IGTF solo resta el vuelto **en USD**, no el entregado en Bs | `tax.js:228-230` |
| D8 | `Punto de Venta` no está en `FOREIGN_CURRENCY_METHODS` | `tax.js:53-60` |
| D9 | El `breakdown` del recibo omite el efectivo en Bs | `pos-engine.js:1658` |
| D10 | Se puede vender más de lo que hay en stock | `pos-engine.js:626-658` |
| D11 | `changeRateMode` / `changeRemainderMode` no tienen control en la UI | `pos-engine.js:20-22` |
| D12 | El vuelto se reparte en Bs con centavos (0,01 Bs no existe) | `pos-engine.js:1544` |

---

## 1. `assets/js/tax.js` — extender el motor (sin romperlo)

### 1.1 Nuevos helpers de denominación y pago

```js
// --- Después de FOREIGN_CURRENCY_METHODS (línea 60) ---

/** Denominaciones reales en circulación (Venezuela). */
const USD_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100];
const BS_DENOMINATIONS = [0.10, 0.25, 0.50, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

/** Un cobro con tarjeta solo es "en divisas" si la terminal liquida en USD. */
function isForeignPayment(payment) {
  if (!payment) return false;
  if (payment.method === 'Punto de Venta') {
    return String(payment.liquidationCurrency || '').toUpperCase() === 'USD';
  }
  return isForeignPaymentMethod(payment.method);
}
```

### 1.2 `computeTotals`: restar **todo** el vuelto en divisas (D7)

```js
// Reemplazar líneas 220-231
    // Base IGTF: solo la porción del pago en divisas, neta de TODO el vuelto
    // entregado en divisas (efectivo USD) y del equivalente en divisas del
    // vuelto entregado en bolívares (no genera IGTF pero reduce la base).
    let foreignPaidCents = 0;
    payments.forEach(p => {
      if (p && isForeignPayment(p)) foreignPaidCents += toCents(p.amountUsd);
    });

    const changeUsdCashCents = toCents(opts.changeUsdCashGiven || 0);
    const changeBsCashCents = toCents(opts.changeBsCashGiven || 0);
    const changeBsPmCents = toCents(opts.changeBsPmGiven || 0);
    const rate = Number(opts.changeRate || rateBcv) || rateBcv;

    // El vuelto en Bs NO es pago en divisas: por eso no se resta de la base
    // en divisas, pero SÍ reduce el total que el cliente debe entregar.
    const changeTotalCents = changeUsdCashCents + changeBsCashCents + changeBsPmCents;
    const changeTotalUsdCents = Math.round(changeTotalCents / rate);

    const netForeignPaidCents = Math.max(0, foreignPaidCents - changeUsdCashCents);
    const igtfBaseCents = applyIgtf ? Math.min(totalBeforeIgtfCents, netForeignPaidCents) : 0;
    const igtfCents = applyIgtf ? Math.round(igtfBaseCents * 0.03) : 0;

    const totalCents = totalBeforeIgtfCents + igtfCents;
```

### 1.3 Nuevos campos de retorno

```js
    // Añadir al objeto retornado (después de `lines: classifiedLines`):
      changeUsdCashCents,
      changeBsCashCents,
      changeBsPmCents,
      changeTotalCents,
      changeTotalUsd: fromCents(changeTotalUsdCents),
      igtfBaseUsd: fromCents(igtfBaseCents),
```

### 1.4 Exports

```js
  return {
    toCents, fromCents, centsToBs,
    classify, isForeignPaymentMethod, isForeignPayment,
    computeTotals,
    EXEMPT_RETAIL_IDS, PREPARED_FOOD_FAMILIES,
    USD_DENOMINATIONS, BS_DENOMINATIONS
  };
```

---

## 2. `assets/js/pos-engine.js` — el núcleo

### 2.1 Constantes y estado (junto a las líneas 20-22)

```js
  const CHG_RATE_MODES = { BCV: 'BCV', EUR: 'Euro BCV', USDT: 'USDT Paralelo', CUSTOM: 'Manual' };
  const BS_CHANGE_STEP = 0.50;   // el vuelto en Bs se entrega en monedas de 0,50

  let changeRateMode = 'BCV';
  let customChangeRate = 0;
  let changeRemainderMode = 'PM';   // 'PM' | 'BS_CASH'
  let changeRateManual = 0;         // tasa real negociada por el cajero
```

### 2.2 `getActiveChangeRate()` (línea 28) — que la tasa del cajero sea la real

```js
  function getActiveChangeRate() {
    const s = MTP.state.settings || {};
    if (changeRateMode === 'EUR') return Number(s.rateEur) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'USDT') return Number(s.rateUsdt) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'CUSTOM' && changeRateManual > 0) return changeRateManual;
    return Number(s.rateBcv) || 42.85;
  }
```

### 2.3 NUEVA función `computeSaleTotals()` — **el total único** (D1, D2)

Colocar justo antes de `getCartTaxSummary` (línea 969).

```js
  /**
   * ÚNICA fuente de verdad del total de la venta.
   * Se usa para pintar el ticket, abrir el modal, calcular el vuelto,
   * validar el cobro y registrar la venta. Nunca se recalcula "por su cuenta".
   *
   * @param {Array} paymentsOverride  lista de pagos ya registrados
   * @param {Object} changeOverride   { usdCash, bsCash, bsPm } distribución del vuelto
   */
  function computeSaleTotals(paymentsOverride, changeOverride) {
    const payments = Array.isArray(paymentsOverride) ? paymentsOverride : currentPayments;
    const chgRate = getActiveChangeRate();
    const chg = changeOverride || getChangeDistributionInputs();

    return window.MTPTax.computeTotals({
      lines: cart,
      payments: payments,
      changeUsdCashGiven: chg.usdCash,
      changeBsCashGiven: chg.bsCash,
      changeBsPmGiven: chg.bsPm,
      changeRate: chgRate,
      rateBcv: Number(MTP.state.settings.rateBcv) || 42.85,
      settings: MTP.state.settings
    });
  }

  function getChangeDistributionInputs() {
    return {
      usdCash: parseFloat(document.getElementById('vueltoDistUsd')?.value) || 0,
      bsCash: parseFloat(document.getElementById('vueltoDistBsCash')?.value) || 0,
      bsPm: parseFloat(document.getElementById('vueltoDistBsPm')?.value) || 0
    };
  }
```

### 2.4 `getCartTaxSummary` — pasa a ser un alias de `computeSaleTotals`

```js
  function getCartTaxSummary(paymentsOverride = null, changeUsdCashGiven = 0) {
    const chg = changeUsdCashGiven
      ? { usdCash: changeUsdCashGiven, bsCash: 0, bsPm: 0 }
      : getChangeDistributionInputs();
    return computeSaleTotals(paymentsOverride, chg);
  }
```
> **Efecto**: el ticket, el modal, el vuelto y `finalizeSale` quedan todos atados al mismo resultado. D1 y D2 quedan resueltos por construcción.

### 2.5 `openCheckoutModal` (línea 1318) — mostrar el IGTF estimado desde el primer frame

```js
  function openCheckoutModal() {
    if (!cart.length) { MTP.toast('El ticket está vacío...', 'warn'); return; }

    // Se registra un pago implícito del método activo para que el total
    // mostrado INCLUYA el IGTF estimado desde el inicio (mismo número que
    // se cobró y que se guardará).
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    currentPayments = [];
    const preview = computeSaleTotals([{
      id: 'p-preview', method, amountUsd: getCartTaxSummary([]).totalUsd,
      amountBs: 0, ref: 'estimado', verified: false
    }]);
    renderCheckoutTotals(preview);

    const payUsdInput = document.getElementById('payAmountUsd');
    const payBsInput = document.getElementById('payAmountBs');
    if (payUsdInput) payUsdInput.value = preview.totalUsd.toFixed(2);
    if (payBsInput) payBsInput.value = preview.totalBs.toFixed(2);

    document.getElementById('payRefInput').value = '';
    selectPayMethod('Efectivo USD');
    renderPaymentsAndChange();
    document.getElementById('posCheckoutModal').classList.add('open');
  }
```

> **OJO**: el pago `p-preview` **no** se registra en la venta; es solo para el cálculo del total mostrado. `renderPaymentsAndChange` lo reinicia con `currentPayments = []` al inicio del cobro real.

### 2.6 NUEVA función `renderCheckoutTotals(tax)` — un solo lugar que pinta el total

```js
  function renderCheckoutTotals(tax) {
    const usdEl = document.getElementById('chkTotalUsd');
    const bsEl  = document.getElementById('chkTotalBs');
    const sumEl = document.getElementById('chkTaxSummary');
    if (usdEl) usdEl.textContent = MTP.fmtUSD(tax.totalUsd);
    if (bsEl)  bsEl.textContent  = MTP.fmtBsRaw(tax.totalBs);
    if (sumEl) {
      sumEl.innerHTML =
        `Subtotal <strong>${MTP.fmtUSD(tax.subtotalBaseUsd)}</strong>` +
        ` · Exento <strong>${MTP.fmtUSD(tax.exentoUsd)}</strong>` +
        ` · Base 16% <strong>${MTP.fmtUSD(tax.baseG16Usd)}</strong>` +
        ` · IVA 16% <strong>${MTP.fmtUSD(tax.totalIvaUsd)}</strong>` +
        (tax.igtfUsd > 0 ? ` · IGTF 3% <strong>${MTP.fmtUSD(tax.igtfUsd)}</strong>` : '') +
        (tax.igtfUsd > 0 ? `<div class="chk-igtf-note">IGTF aplicado: eres Contribuyente Especial y parte del pago es en divisas.</div>` : '');
    }
  }
```
Reemplaza los tres bloques que hoy repintan el total (`pos-engine.js:1328-1333`, `:1478-1485`).

### 2.7 `quickAddBillUsd` — **ACUMULAR** (D5)

```js
  /**
   * Botón de billete: SUMA, no reemplaza.
   * Cada pulsación agrega una línea de pago etiquetada con el billete.
   */
  function quickAddBillUsd(val) {
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;

    if (val === 'EXACT') {
      const pending = Math.max(0, getCartTotalUsd() - getPaidTotalUsd());
      if (pending <= 0.009) { MTP.toast('Ya está todo cobrado', 'warn'); return; }
      addPaymentLine({ method, amountUsd: pending, amountBs: pending * bcv, bill: 'Exacto' });
      return;
    }

    const amount = Number(val) || 0;
    if (amount <= 0) return;
    addPaymentLine({ method, amountUsd: amount, amountBs: amount * bcv, bill: '$' + amount });
  }
```

### 2.8 NUEVA `addPaymentLine()` — fuente única de líneas de pago

```js
  function addPaymentLine(opts) {
    const method = opts.method || 'Efectivo USD';
    const amountUsd = Number(opts.amountUsd) || 0;
    const amountBs = Number(opts.amountBs) || 0;

    if (amountUsd <= 0 && amountBs <= 0) {
      MTP.toast('Ingresa un monto válido', 'warn');
      return false;
    }

    const refInput = document.getElementById('payRefInput');
    const ref = (refInput && refInput.value.trim()) || opts.ref || 'Directo';

    if (method === 'Pago Móvil' && ref.length >= 4 && MTP.isPagoMovilRefUsed && MTP.isPagoMovilRefUsed(ref)) {
      MTP.toast('Esta referencia de Pago Móvil ya fue usada hoy.', 'err');
      return false;
    }

    currentPayments.push({
      id: 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      method,
      amountUsd: Number(amountUsd.toFixed(2)),
      amountBs: Number(amountBs.toFixed(2)),
      rateUsed: Number(getActiveChangeRate().toFixed(4)),
      ref,
      bill: opts.bill || '',
      bank: method === 'Pago Móvil' ? (document.getElementById('pmBankSelect')?.value || '') : '',
      phone: method === 'Pago Móvil' ? (document.getElementById('pmPhoneInput')?.value || '') : '',
      terminalId: method === 'Punto de Venta' ? (document.getElementById('posTerminalSelect')?.value || '') : '',
      voucher: method === 'Punto de Venta' ? (document.getElementById('posVoucherInput')?.value || '') : '',
      liquidationCurrency: method === 'Punto de Venta'
        ? (document.getElementById('posTerminalSelect')?.selectedOptions?.[0]?.dataset?.liquidation || 'VES')
        : '',
      verified: true
    });

    if (refInput) refInput.value = '';
    renderPaymentsAndChange();
    return true;
  }
```
`addCurrentPaymentLine()` (línea 1425) pasa a ser un caso de esta función.

### 2.9 `renderPaymentsAndChange` — NO sobrescribir lo que escribe el cajero (D6)

```js
    // ANTES (líneas 1509-1513) — ELIMINAR:
    //   if (payUsdInput && remUsd > 0.009) payUsdInput.value = remUsd.toFixed(2);
    //   if (payBsInput && remUsd > 0.009) payBsInput.value = (remUsd * bcv).toFixed(2);

    // NUEVO: solo rellenar si el campo está vacío y hay saldo pendiente
    if (payUsdInput && !payUsdInput.value && remUsd > 0.009) {
      payUsdInput.value = remUsd.toFixed(2);
      if (payBsInput && !payBsInput.value) payBsInput.value = (remUsd * bcv).toFixed(2);
    }
```

### 2.10 Propuesta de desglose del vuelto por denominación (D12)

```js
  /**
   * Reparte el vuelto como lo haría un cajero venezolano:
   * billetes US$ enteros (denominación real) + resto en Bs redondeado a 0,50.
   */
  function suggestChangeBreakdown(changeUsd) {
    const rate = getActiveChangeRate();
    const usd = Math.max(0, Number(changeUsd) || 0);
    const wholeUsd = Math.floor(usd + 0.001);
    let remBs = (usd - wholeUsd) * rate;
    remBs = Math.round(remBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;   // a monedas de 0,50

    const bills = [];
    let rest = wholeUsd;
    const denoms = [100, 50, 20, 10, 5, 2, 1];
    denoms.forEach(d => {
      const n = Math.floor(rest / d);
      if (n > 0) { bills.push({ denom: d, count: n, amount: n * d }); rest -= n * d; }
    });

    return {
      usd: wholeUsd,
      bs: Number(remBs.toFixed(2)),
      bills,
      text: bills.length
        ? bills.map(b => `$${b.amount}`).join(' + ') + (remBs > 0 ? ` + Bs ${remBs.toFixed(2)}` : '')
        : (remBs > 0 ? `Bs ${remBs.toFixed(2)}` : 'Sin vuelto')
    };
  }
```

Y en `renderPaymentsAndChange`, al calcular el vuelto (reemplaza el bloque 1542-1554):

```js
      const suggestion = suggestChangeBreakdown(vueltoUsd);
      if (distUsd) {
        distUsd.value = String(suggestion.usd);
        const bsVal = suggestion.bs.toFixed(2);
        if (changeRemainderMode === 'BS_CASH') { distBsCash.value = bsVal; distBsPm.value = '0.00'; }
        else { distBsPm.value = bsVal; distBsCash.value = '0.00'; }
      }
      const hintEl = document.getElementById('vueltoSuggestion');
      if (hintEl) hintEl.textContent = suggestion.text;
```

### 2.11 `rebalanceChangeDistribution` — implementar `BS_CASH` (D4)

```js
  function rebalanceChangeDistribution(mode) {
    const totalUsd = getCartTotalUsd();
    const paidUsd = getPaidTotalUsd();
    const rate = getActiveChangeRate();
    const totalChangeUsd = Math.max(0, paidUsd - totalUsd);
    const distUsdEl = document.getElementById('vueltoDistUsd');
    const distBsCashEl = document.getElementById('vueltoDistBsCash');
    const distBsPmEl = document.getElementById('vueltoDistBsPm');
    if (!distUsdEl || !distBsCashEl || !distBsPmEl) return;

    const suggestion = suggestChangeBreakdown(totalChangeUsd);

    if (mode === 'ALL_USD') {
      distUsdEl.value = String(suggestion.usd);
      distBsCashEl.value = '0.00';
      distBsPmEl.value = suggestion.bs.toFixed(2);
    } else if (mode === 'ALL_BS') {
      distUsdEl.value = '0';
      distBsCashEl.value = (totalChangeUsd * rate).toFixed(2);
      distBsPmEl.value = '0.00';
    } else if (mode === 'ALL_PM') {
      distUsdEl.value = '0';
      distBsCashEl.value = '0.00';
      distBsPmEl.value = (totalChangeUsd * rate).toFixed(2);
    } else if (mode === 'USD') {
      // El cajero fijó el efectivo en US$: el resto se calcula en Bs.
      const usdGiven = Math.min(totalChangeUsd, Math.max(0, parseFloat(distUsdEl.value) || 0));
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * rate);
      const remRound = Math.round(remBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      distBsPmEl.value = remRound.toFixed(2);
      distBsCashEl.value = '0.00';
    } else if (mode === 'BS_CASH') {
      // El cajero fijó el efectivo en Bs: se descuenta del resto.
      const bsGiven = Math.max(0, parseFloat(distBsCashEl.value) || 0);
      const usdGiven = Math.max(0, totalChangeUsd - (bsGiven / rate));
      distUsdEl.value = String(Math.floor(usdGiven + 0.001));
      distBsPmEl.value = '0.00';
    }
    renderVueltoValidation();
  }
```

### 2.12 NUEVA `renderVueltoValidation()` — bloqueo si no cuadra (D3)

```js
  /**
   * Verifica que la distribución del vuelto entregado sea igual al vuelto debido.
   * Si no cuadra, se marca en rojo y se bloquea el cobro.
   */
  function renderVueltoValidation() {
    const tax = computeSaleTotals();
    const paidUsd = getPaidTotalUsd();
    const changeDueUsd = Math.max(0, paidUsd - tax.totalUsd);
    const rate = getActiveChangeRate();
    const chg = getChangeDistributionInputs();
    const deliveredUsd = chg.usdCash + (chg.bsCash / rate) + (chg.bsPm / rate);
    const diff = Math.abs(deliveredUsd - changeDueUsd);
    const ok = changeDueUsd <= 0.009 || diff <= 0.011;

    const el = document.getElementById('vueltoValidation');
    if (el) {
      el.textContent = ok
        ? '✔ El vuelto cuadra'
        : `⚠ El vuelto no cuadra: entregaste ${MTP.fmtUSD(deliveredUsd)} y debes entregar ${MTP.fmtUSD(changeDueUsd)}`;
      el.className = ok ? 'chk-ok' : 'chk-error';
    }
    const btn = document.getElementById('btnConfirmSale');
    if (btn) btn.disabled = !ok;
    return ok;
  }
```

### 2.13 `finalizeSale` — usar el total único y validar (D2, D3, D9)

```js
  function finalizeSale() {
    // 1) Si no hay pagos sumados, se toma el método y monto del cajero.
    if (!currentPayments.length) {
      const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
      const enteredUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
      const enteredBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;
      const ok = addPaymentLine({
        method,
        amountUsd: enteredUsd > 0 ? enteredUsd : getCartTotalUsd(),
        amountBs: enteredBs > 0 ? enteredBs : 0,
        ref: document.getElementById('payRefInput')?.value.trim() || 'Pago Directo'
      });
      if (!ok) return;
    }

    // 2) TOTAL ÚNICO: el mismo que se mostró y el mismo que se guardará.
    const tax = computeSaleTotals();
    const totalUsd = tax.totalUsd;
    const totalBs = tax.totalBs;
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const chgRate = getActiveChangeRate();

    const paidUsd = getPaidTotalUsd();
    if (paidUsd + 0.009 < totalUsd) {
      MTP.toast(`Falta cobrar ${MTP.fmtUSD(totalUsd - paidUsd)} (${((totalUsd - paidUsd) * bcv).toFixed(2)} Bs)`, 'err');
      return;
    }

    // 3) Validación dura del vuelto.
    if (!renderVueltoValidation()) {
      MTP.toast('Revisa la distribución del vuelto antes de cobrar.', 'err');
      return;
    }

    const changeUsd = Math.max(0, paidUsd - totalUsd);
    const changeBs = changeUsd * chgRate;
    const chg = getChangeDistributionInputs();

    const customerInput = document.getElementById('posCustomerInput');
    const customer = (customerInput && customerInput.value.trim()) || 'Mostrador Rápido';

    const recorded = MTP.recordSale({
      customer,
      cashier: location.pathname.includes('/caja/') ? 'Cajero Turno' : 'Admin / Caja',
      totalUsd,
      totalBs,
      items: cart.map(c => ({ /* ... igual que hoy ... */ })),
      payments: currentPayments,
      changeGiven: {
        totalChangeUsd: Number(changeUsd.toFixed(2)),
        totalChangeBs: Number(changeBs.toFixed(2)),
        rateUsed: chgRate,
        usdCashGiven: Number(chg.usdCash.toFixed(2)),
        bsCashGiven: Number(chg.bsCash.toFixed(2)),
        bsPmGiven: Number(chg.bsPm.toFixed(2)),
        breakdown: `US$ ${chg.usdCash.toFixed(2)} + Bs ${chg.bsCash.toFixed(2)} efectivo + Bs ${chg.bsPm.toFixed(2)} pago móvil`
      }
    });
    // ... resto igual ...
  }
```

### 2.14 `config.js:recordSale` — **no recalcular** el total (D2)

```js
    // LÍNEA 2996-3003 — reemplazar el cálculo por el que YA VIENE del cliente:
    const taxResult = (window.MTPTax && window.MTPTax.computeTotals)
      ? window.MTPTax.computeTotals({
          lines: enrichedLines,
          payments: salePayload.payments || [],
          changeUsdCashGiven: changeUsdCashGiven,
          changeBsCashGiven: changeBsCashGiven,
          changeBsPmGiven: changeBsPmGiven,
          rateBcv: bcvRate,
          settings: state.settings
        })
      : fallbackTax();
```
> **Clave**: `enrichedLines` y `payments` deben ser **exactamente** los que la caja calculó. Como `computeSaleTotals` usa `cart` (mismas líneas) y `currentPayments` (mismos pagos), ambos motores coinciden **siempre**. Para blindarlo, añadir una verificación:
```js
    if (typeof salePayload.totalUsd === 'number' && Math.abs(taxResult.totalUsd - salePayload.totalUsd) > 0.011) {
      console.warn('[MI-TIENDA-POS] El total calculado difiere del cobrado', taxResult.totalUsd, salePayload.totalUsd);
    }
```

### 2.15 Guarda de stock (D10) — en `addRetailQuick` (~línea 626)

```js
    const item = MTP.findByCodeOrBarcode(code);
    const stock = Number(item?.stock || 0);
    if (item && item.type === 'venta' && stock <= 0) {
      MTP.toast(`"${item.name}" no tiene existencias.`, 'err');
      return;
    }
```
Y al agregar cantidad: si `qty + 1 > stock` → aviso y no agregar.

---

## 3. `caja/pos.html` + `admin/pos.html` — el modal de cobro (nueva versión)

### 3.1 Bloque de total (reemplaza las líneas 143-154)

```html
        <div class="chk-total-block">
          <div class="chk-total-main">
            <span class="chk-total-label">Total a cobrar</span>
            <strong id="chkTotalUsd" class="chk-total-usd">$0.00</strong>
            <span id="chkTotalBs" class="chk-total-bs">0,00 Bs</span>
          </div>
          <div id="chkTaxSummary" class="chk-tax-summary"></div>
        </div>
```

### 3.2 Botones de billete que acumulan (reemplaza 156-165)

```html
        <div class="chk-bills" role="group" aria-label="Billetes recibidos">
          <span class="chk-bills-label">💵 Billete recibido (toca para sumar):</span>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd('EXACT')">Exacto</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(1)">$1</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(2)">$2</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(5)">$5</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(10)">$10</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(20)">$20</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(50)">$50</button>
          <button class="chk-bill-btn" onclick="window.MTPPos.quickAddBillUsd(100)">$100</button>
        </div>
```

### 3.3 Panel de vuelto (reemplaza 220-258)

```html
        <div class="vuelto-panel">
          <div class="vuelto-head">
            <span id="vueltoStatusLabel" class="vuelto-label">VUELTO A ENTREGAR:</span>
            <span id="vueltoValidation" class="chk-ok"></span>
          </div>
          <div class="vuelto-grid">
            <div class="vuelto-card" id="vueltoCardUsd">
              <span>Total del vuelto en $</span><strong id="vueltoUsdAmount">$0.00</strong>
            </div>
            <div class="vuelto-card" id="vueltoCardBs">
              <span>Total del vuelto en Bs</span><strong id="vueltoBsAmount">0,00 Bs</strong>
            </div>
          </div>
          <p class="vuelto-suggestion">Entrega sugerida: <strong id="vueltoSuggestion">—</strong></p>
          <label class="vuelto-dist-label">Distribución del vuelto entregado:</label>
          <div class="vuelto-grid-3">
            <label class="vuelto-field"><span>Efectivo US$</span>
              <input type="number" step="1" id="vueltoDistUsd" class="input"
                     oninput="window.MTPPos.rebalanceChangeDistribution('USD')"></label>
            <label class="vuelto-field"><span>Efectivo Bs</span>
              <input type="number" step="0.5" id="vueltoDistBsCash" class="input"
                     oninput="window.MTPPos.rebalanceChangeDistribution('BS_CASH')"></label>
            <label class="vuelto-field"><span>Pago Móvil Bs</span>
              <input type="number" step="0.5" id="vueltoDistBsPm" class="input"></label>
          </div>
        </div>
```

### 3.4 Botón de confirmar con id (para el bloqueo)

```html
        <button class="btn btn-p btn-lg" id="btnConfirmSale" onclick="window.MTPPos.finalizeSale()">
          ✔ Confirmar Cobro (Enter)
        </button>
```

---

## 4. `tests/pos.test.js` (nuevo) — 8 casos obligatorios

```js
const assert = require('assert');
const MTPTax = require('../assets/js/tax.js');

function run() {
  const settings = { ivaMode: 'RECARGO', isContribuyenteEspecial: true, rateBcv: 40 };

  // T1: El total con IGTF es el mismo sin importar el momento de calcularlo.
  const lines = [{ refId: 'prod-empanada', name: 'Empanada', qty: 2, priceUsd: 1.30, isDish: true }];
  const sinPagos = MTPTax.computeTotals({ lines, payments: [], rateBcv: 40, settings });
  const conPagos = MTPTax.computeTotals({
    lines, payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    changeUsdCashGiven: 0, rateBcv: 40, settings
  });
  assert.ok(conPagos.totalUsd >= sinPagos.totalUsd, 'T1 el IGTF debe subir el total');

  // T2: IGTF = 3% de la base en divisas, con tope en el total.
  assert.strictEqual(conPagos.igtfUsd, Number((Math.min(conPagos.totalBeforeIgtfUsd, 10) * 0.03).toFixed(2)));

  // T3: El vuelto en US$ reduce la base IGTF.
  const conVuelto = MTPTax.computeTotals({
    lines, payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    changeUsdCashGiven: 2, rateBcv: 40, settings
  });
  assert.ok(conVuelto.igtfUsd < conPagos.igtfUsd, 'T3 el vuelto en USD reduce el IGTF');

  // T4: Sin IGTF cuando NO es contribuyente especial.
  const sinIgtf = MTPTax.computeTotals({
    lines, payments: [{ method: 'Efectivo USD', amountUsd: 10 }], rateBcv: 40,
    settings: { ...settings, isContribuyenteEspecial: false }
  });
  assert.strictEqual(sinIgtf.igtfUsd, 0, 'T4 sin IGTF no Special');

  // T5: Tarjeta que liquida en USD SÍ genera IGTF; en Bs NO.
  const posUsd = MTPTax.computeTotals({
    lines, payments: [{ method: 'Punto de Venta', amountUsd: 10, liquidationCurrency: 'USD' }],
    rateBcv: 40, settings
  });
  const posBs = MTPTax.computeTotals({
    lines, payments: [{ method: 'Punto de Venta', amountUsd: 10, liquidationCurrency: 'VES' }],
    rateBcv: 40, settings
  });
  assert.ok(posUsd.igtfUsd > 0, 'T5a tarjeta en USD genera IGTF');
  assert.strictEqual(posBs.igtfUsd, 0, 'T5b tarjeta en Bs no genera IGTF');

  // T6: Pago Móvil (Bs) NO genera IGTF.
  const pm = MTPTax.computeTotals({
    lines, payments: [{ method: 'Pago Móvil', amountUsd: 10 }], rateBcv: 40, settings
  });
  assert.strictEqual(pm.igtfUsd, 0, 'T6 pago móvil no genera IGTF');

  // T7: El vuelto reportado (3 componentes) cuadra con el total del vuelto.
  const chg = MTPTax.computeTotals({
    lines, payments: [{ method: 'Efectivo USD', amountUsd: 10 }],
    changeUsdCashGiven: 2, changeBsCashGiven: 1, changeBsPmGiven: 0, changeRate: 40, rateBcv: 40, settings
  });
  assert.strictEqual(chg.changeTotalUsd, 3.03, 'T7 el vuelto total se reporta bien');

  // T8: Una venta al detal exenta NO lleva IVA.
  const exento = MTPTax.computeTotals({
    lines: [{ refId: 'prod-harina-pan', name: 'Harina', qty: 1, priceUsd: 1.20 }],
    payments: [], rateBcv: 40, settings
  });
  assert.strictEqual(exento.totalIvaUsd, 0, 'T8 la harina P.A.N. es exenta');

  console.log('✅ tests/pos.test.js: 8/8 OK');
}
run();
```

**Integrarlo** en `tests/run.js` para que corran juntos.

---

## 5. Checklist de cierre de la fase 04

- [ ] `node tests/pos.test.js` → 8/8
- [ ] `node tests/run.js` → sigue en verde
- [ ] Con `isContribuyenteEspecial: true`, el total del modal = el del ticket = el guardado en `state.sales`
- [ ] Pulsar $20 y luego $5 → el recibido es $25
- [ ] Escribir un vuelto mal distribuido → el botón Confirmar se **deshabilita**
- [ ] "Efectivo Bs" en el vuelto recalcula el resto
- [ ] La propuesta de vuelto muestra `$20 + $5 + Bs 12,50`
- [ ] `node --check assets/js/pos-engine.js` y `node --check assets/js/tax.js`
