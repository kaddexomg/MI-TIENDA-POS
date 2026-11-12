/* ==========================================================================
   MI-TIENDA-POS — Motor de Vuelto (v7)
   - Funciones puras (sin DOM) para proponer el desglose del vuelto con
     DENOMINACIONES REALES de Venezuela.
   - Billetes US$: 1, 2, 5, 10, 20, 50, 100
   - Monedas/billetes Bs: 0,10 · 0,25 · 0,50 · 1 · 2 · 5 · 10 · 20 · 50 ·
     100 · 200 · 500 · 1000 · 2000
   - El resto en Bolívares se redondea a 0,50 Bs (en la práctica no hay
     centavos en circulación y el vuelto se entrega con monedas).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MTPChange = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USD_DENOMS = [100, 50, 20, 10, 5, 2, 1];
  const BS_DENOMS = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.25, 0.10];
  const DEFAULT_BS_STEP = 0.50;

  function round2(n) {
    return Number((Math.round((Number(n) || 0) * 100) / 100).toFixed(2));
  }

  /**
   * Propone cómo entregar un vuelto en dólares.
   *
   * @param {number} changeUsd  vuelto en dólares
   * @param {number} rate       tasa a la que se convierte el resto a Bs
   * @param {number} bsStep     redondeo del resto en Bs (0,50 por defecto)
   * @returns {{usd:number, bs:number, bills:Array, text:string}}
   */
  function breakDown(changeUsd, rate, bsStep) {
    const step = Number(bsStep) || DEFAULT_BS_STEP;
    const usd = Math.max(0, Number(changeUsd) || 0);
    const r = Number(rate) > 0 ? Number(rate) : 0;

    const wholeUsd = Math.floor(usd + 0.001);
    let remBs = r > 0 ? (usd - wholeUsd) * r : 0;
    remBs = Math.round(remBs / step) * step;
    if (remBs < 0) remBs = 0;

    const bills = [];
    let rest = wholeUsd;
    for (let i = 0; i < USD_DENOMS.length; i++) {
      const d = USD_DENOMS[i];
      const n = Math.floor(rest / d);
      if (n > 0) {
        bills.push({ denom: d, count: n, amount: n * d });
        rest -= n * d;
      }
    }

    let text = bills.map(function (b) { return '$' + b.amount; }).join(' + ');
    if (remBs > 0) text = text ? (text + ' + Bs ' + remBs.toFixed(2)) : ('Bs ' + remBs.toFixed(2));
    if (!text) text = 'Sin vuelto';

    return { usd: wholeUsd, bs: round2(remBs), bills: bills, text: text };
  }

  /**
   * Descompone una cantidad en Bolívares usando las denominaciones reales.
   * @param {number} amountBs
   * @returns {Array<{denom:number, count:number, amount:number}>}
   */
  function breakDownBs(amountBs) {
    let rest = Math.round((Number(amountBs) || 0) * 100) / 100;
    const out = [];
    for (let i = 0; i < BS_DENOMS.length; i++) {
      const d = BS_DENOMS[i];
      const unit = Math.round(d * 100);
      const have = Math.round(rest * 100);
      const n = Math.floor(have / unit);
      if (n > 0) {
        out.push({ denom: d, count: n, amount: round2(n * d) });
        rest = round2(rest - n * d);
      }
    }
    return out;
  }

  /**
   * Cuenta cuántos billetes de cada denominación hay en una lista de pagos.
   * @param {Array} payments  líneas de pago con { method, amountUsd, bill }
   * @returns {Object} { '5': 2, '20': 1 }
   */
  function countBills(payments) {
    const out = {};
    (payments || []).forEach(function (p) {
      if (!p || !p.bill) return;
      const n = Number(String(p.bill).replace(/[^0-9.]/g, ''));
      if (!n || n <= 0) return;
      const key = String(n);
      out[key] = (out[key] || 0) + (Number(p.amountUsd) >= n ? 1 : 0);
    });
    return out;
  }

  return {
    breakDown: breakDown,
    breakDownBs: breakDownBs,
    countBills: countBills,
    USD_DENOMS: USD_DENOMS,
    BS_DENOMS: BS_DENOMS,
    DEFAULT_BS_STEP: DEFAULT_BS_STEP
  };
});
