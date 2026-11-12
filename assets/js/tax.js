/* ==========================================================================
   MI-TIENDA-POS — Motor Fiscal y de Impuestos Venezolano (v6)
   - Funciones puras en centavos enteros (sin errores de punto flotante)
   - Ley de IVA Venezuela:
     * Alícuota General (G16): 16% (comidas preparadas, bebidas, snacks, cigarros)
     * Alícuota Reducida (R8): 8%
     * Exento (E): 0% (Art. 18 Ley IVA: harina de maíz precocida, arroz, pasta, margarina)
   - IGTF (3%): Solo si el comercio es Contribuyente Especial, únicamente sobre
     la porción efectivamente pagada en divisas (neta de vuelto en divisas),
     calculada sobre la base que incluye el IVA.
   - Modos de precio:
     * 'RECARGO' (por defecto): Precio de catálogo + 16% IVA al facturar/cobrar
     * 'INCLUIDO': Precio de catálogo ya incluye IVA (desglosa base = precio / 1.16)
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MTPTax = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EXEMPT_RETAIL_IDS = new Set([
    'prod-harina-pan',
    'prod-harina-pan-amarilla',
    'prod-espagueti',
    'prod-arroz-empaque',
    'prod-mavesa',
    'inv-harina-pan-blanca',
    'inv-harina-pan-amarilla',
    'inv-pasta-larga',
    'inv-arroz-blanco',
    'inv-margarina-mavesa'
  ]);

  const WATER_RETAIL_IDS = new Set([
    'prod-agua-mineral',
    'inv-agua-500'
  ]);

  const PREPARED_FOOD_FAMILIES = new Set([
    'fritos',
    'arepas',
    'almuerzos',
    'cafeteria',
    'empanadas',
    'pastelitos',
    'papas',
    'cafe'
  ]);

  const FOREIGN_CURRENCY_METHODS = new Set([
    'Efectivo USD',
    'Zelle / Transf',
    'Zelle',
    'USDT',
    'Binance',
    'Divisas'
  ]);

  /* Denominaciones reales en circulación (Venezuela) — para el vuelto y el cuadre */
  const USD_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100];
  const BS_DENOMINATIONS = [0.10, 0.25, 0.50, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

  function toCents(amount) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100);
  }

  function fromCents(cents) {
    const num = Number(cents);
    if (!Number.isFinite(num)) return 0;
    return Number((Math.round(num) / 100).toFixed(2));
  }

  function centsToBs(cents, rateBcv) {
    const rate = Number(rateBcv);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Number(((Math.round(cents) * rate) / 100).toFixed(2));
  }

  /**
   * Clasifica cualquier producto, variante o línea de carrito en:
   * - 'G16': Gravado Alícuota General 16%
   * - 'R8':  Gravado Alícuota Reducida 8%
   * - 'E':   Exento 0% (Art. 18 Ley de IVA)
   */
  function classify(item) {
    if (!item || typeof item !== 'object') return 'G16';

    const refId = String(item.refId || item.variantId || item.id || '');
    const familyId = String(item.familyId || item.group || '').toLowerCase();
    const isPreparedDish = Boolean(
      item.isDish ||
      item.isVariant ||
      item.productId ||
      refId.startsWith('var-') ||
      PREPARED_FOOD_FAMILIES.has(familyId)
    );

    // Regla legal: Comida preparada / restaurante siempre grava 16% (G16)
    if (isPreparedDish) {
      if (item.iva === 'R8') return 'R8';
      return 'G16';
    }

    // Agua mineral queda gravada G16 por defecto hasta confirmación del contador
    if (WATER_RETAIL_IDS.has(refId) && item.iva !== 'E') {
      return 'G16';
    }

    // Si ya tiene el campo unificado v6 ('G16' | 'R8' | 'E')
    if (item.iva === 'E' || item.iva === 'R8' || item.iva === 'G16') {
      return item.iva;
    }

    // Víveres básicos exentos según Art. 18 Ley del IVA
    if (EXEMPT_RETAIL_IDS.has(refId)) {
      return 'E';
    }

    // Compatibilidad con campos anteriores (ivaType / taxExempt) en mercancía
    if (item.taxExempt === true) return 'E';
    if (item.ivaType === 'R' || item.ivaType === 'R8') return 'R8';
    if (item.ivaType === 'E' && familyId === 'viveres') return 'E';

    return 'G16';
  }

  function isForeignPaymentMethod(method) {
    if (!method) return false;
    const m = String(method).trim();
    if (FOREIGN_CURRENCY_METHODS.has(m)) return true;
    const lower = m.toLowerCase();
    return lower.includes('usd') || lower.includes('zelle') || lower.includes('usdt') || lower.includes('divisa');
  }

  /**
   * Un cobro con tarjeta (Punto de Venta) SOLO cuenta como pago en divisas
   * cuando la terminal liquida en USD. Si liquida en bolívares no genera IGTF.
   */
  function isForeignPayment(payment) {
    if (!payment) return false;
    if (payment.method === 'Punto de Venta') {
      const liq = String(payment.liquidationCurrency || '').toUpperCase();
      return liq === 'USD' || liq === 'DIVISAS';
    }
    return isForeignPaymentMethod(payment.method);
  }

  /**
   * Calcula todos los subtotales, bases imponibles, IVA (16% y 8%), IGTF (3%)
   * y totales en USD y Bolívares usando aritmética entera en centavos.
   */
  function computeTotals(params) {
    const opts = params || {};
    const lines = Array.isArray(opts.lines) ? opts.lines : [];
    const payments = Array.isArray(opts.payments) ? opts.payments : [];
    const settings = opts.settings || {};
    const fiscalCfg = settings.fiscalConfig || {};

    const rateBcv = Number(opts.rateBcv || settings.rateBcv || 42.85);
    const ivaMode = String(opts.ivaMode || settings.ivaMode || fiscalCfg.ivaMode || 'RECARGO').toUpperCase();
    const rateGeneralPct = Number(opts.taxRateGeneral || fiscalCfg.taxRateGeneral || 16);
    const rateReducedPct = Number(opts.taxRateReduced || fiscalCfg.taxRateReduced || 8);

    const isContribuyenteEspecial = Boolean(
      opts.isContribuyenteEspecial !== undefined
        ? opts.isContribuyenteEspecial
        : (settings.isContribuyenteEspecial !== undefined
            ? settings.isContribuyenteEspecial
            : fiscalCfg.isContribuyenteEspecial === true)
    );

    const applyIgtf = isContribuyenteEspecial &&
      settings.applyIgtf !== false &&
      fiscalCfg.applyIgtf3 !== false;

    let rawExentoCents = 0;
    let rawG16Cents = 0;
    let rawR8Cents = 0;

    const classifiedLines = lines.map(line => {
      const qty = Number(line.qty || 0);
      const unitCents = toCents(line.priceUsd);
      const lineCents = Math.round(qty * unitCents);
      const iva = classify(line);

      if (iva === 'E') {
        rawExentoCents += lineCents;
      } else if (iva === 'R8') {
        rawR8Cents += lineCents;
      } else {
        rawG16Cents += lineCents;
      }

      return {
        refId: line.refId || line.id || '',
        name: line.name || '',
        qty,
        unitCents,
        lineCents,
        lineUsd: fromCents(lineCents),
        iva,
        taxType: iva === 'E' ? 'E' : (iva === 'R8' ? 'R' : 'G')
      };
    });

    let exentoCents = rawExentoCents;
    let baseG16Cents = 0;
    let iva16Cents = 0;
    let baseR8Cents = 0;
    let iva8Cents = 0;

    if (ivaMode === 'INCLUIDO') {
      baseG16Cents = Math.round(rawG16Cents / (1 + rateGeneralPct / 100));
      iva16Cents = rawG16Cents - baseG16Cents;

      baseR8Cents = Math.round(rawR8Cents / (1 + rateReducedPct / 100));
      iva8Cents = rawR8Cents - baseR8Cents;
    } else {
      // Modo RECARGO (por defecto): el precio de catálogo es base y se suma el IVA
      baseG16Cents = rawG16Cents;
      iva16Cents = Math.round(baseG16Cents * (rateGeneralPct / 100));

      baseR8Cents = rawR8Cents;
      iva8Cents = Math.round(baseR8Cents * (rateReducedPct / 100));
    }

    const subtotalCatalogCents = rawExentoCents + rawG16Cents + rawR8Cents;
    const subtotalBaseCents = exentoCents + baseG16Cents + baseR8Cents;
    const totalIvaCents = iva16Cents + iva8Cents;
    const totalBeforeIgtfCents = subtotalBaseCents + totalIvaCents;

    // Base IGTF 3%: solo la porción del pago en divisas, neta del vuelto
    // entregado en efectivo USD. El vuelto en Bolívares NO es pago en divisas,
    // por eso no resta de esta base (pero sí del total que el cliente debe).
    let foreignPaidCents = 0;
    payments.forEach(p => {
      if (p && isForeignPayment(p)) foreignPaidCents += toCents(p.amountUsd);
    });

    const changeUsdCashCents = toCents(opts.changeUsdCashGiven || 0);   // en USD
    const changeBsCashCents = toCents(opts.changeBsCashGiven || 0);     // en Bs
    const changeBsPmCents = toCents(opts.changeBsPmGiven || 0);         // en Bs
    const changeRate = Number(opts.changeRate || rateBcv) || rateBcv;

    // Total del vuelto: se unifican las tres monedas sin mezclar unidades.
    //   changeTotalBsCents  → el vuelto completo expresado en Bs (centavos)
    //   changeTotalUsdCents → el vuelto completo expresado en USD (centavos)
    //   (changeUsdCashCents viene en centavos de USD; x tasa = centavos de Bs)
    const changeTotalBsCents = changeBsCashCents + changeBsPmCents +
      Math.round(changeUsdCashCents * changeRate);
    const changeTotalUsdCents = Math.round(changeTotalBsCents / changeRate);
    const changeTotalCents = changeTotalUsdCents;

    const netForeignPaidCents = Math.max(0, foreignPaidCents - changeUsdCashCents);
    const igtfBaseCents = applyIgtf ? Math.min(totalBeforeIgtfCents, netForeignPaidCents) : 0;
    const igtfCents = applyIgtf ? Math.round(igtfBaseCents * 0.03) : 0;

    const totalCents = totalBeforeIgtfCents + igtfCents;

    return {
      ivaMode,
      isContribuyenteEspecial,
      applyIgtf,
      rateBcv,
      rateGeneralPct,
      rateReducedPct,

      // Valores exactos en centavos enteros
      subtotalCatalogCents,
      subtotalBaseCents,
      exentoCents,
      baseG16Cents,
      iva16Cents,
      baseR8Cents,
      iva8Cents,
      totalIvaCents,
      totalBeforeIgtfCents,
      igtfBaseCents,
      igtfCents,
      totalCents,

      // Valores en USD (2 decimales)
      subtotalCatalogUsd: fromCents(subtotalCatalogCents),
      subtotalBaseUsd: fromCents(subtotalBaseCents),
      exentoUsd: fromCents(exentoCents),
      baseG16Usd: fromCents(baseG16Cents),
      iva16Usd: fromCents(iva16Cents),
      baseR8Usd: fromCents(baseR8Cents),
      iva8Usd: fromCents(iva8Cents),
      totalIvaUsd: fromCents(totalIvaCents),
      totalBeforeIgtfUsd: fromCents(totalBeforeIgtfCents),
      igtfBaseUsd: fromCents(igtfBaseCents),
      igtfUsd: fromCents(igtfCents),
      totalUsd: fromCents(totalCents),

      // Valores en Bolívares a tasa oficial BCV (2 decimales)
      subtotalBaseBs: centsToBs(subtotalBaseCents, rateBcv),
      exentoBs: centsToBs(exentoCents, rateBcv),
      baseG16Bs: centsToBs(baseG16Cents, rateBcv),
      iva16Bs: centsToBs(iva16Cents, rateBcv),
      baseR8Bs: centsToBs(baseR8Cents, rateBcv),
      iva8Bs: centsToBs(iva8Cents, rateBcv),
      totalIvaBs: centsToBs(totalIvaCents, rateBcv),
      totalBeforeIgtfBs: centsToBs(totalBeforeIgtfCents, rateBcv),
      igtfBs: centsToBs(igtfCents, rateBcv),
      totalBs: centsToBs(totalCents, rateBcv),

      // Vuelto (para validar y para auditar el cuadre de gaveta)
      changeUsdCashCents: changeUsdCashCents,
      changeBsCashCents: changeBsCashCents,
      changeBsPmCents: changeBsPmCents,
      changeTotalCents: changeTotalCents,
      changeTotalUsd: fromCents(changeTotalUsdCents),
      changeTotalBs: fromCents(changeTotalBsCents),

      lines: classifiedLines
    };
  }

  return {
    toCents,
    fromCents,
    centsToBs,
    classify,
    isForeignPaymentMethod,
    isForeignPayment,
    computeTotals,
    EXEMPT_RETAIL_IDS,
    PREPARED_FOOD_FAMILIES,
    USD_DENOMINATIONS,
    BS_DENOMINATIONS
  };
});
