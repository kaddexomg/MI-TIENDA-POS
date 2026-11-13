'use strict';

/**
 * server/ai-advisor.js
 * MI-TIENDA-POS v8.1.0
 *
 * Motor Inteligente de Análisis de Costos, Precios, Inventario y Demanda.
 * Funciona 100% local/offline sin depender de llaves externas, evaluando:
 * - Salud de inventario (quiebres, días de cobertura, insumos de cocina y mercancía).
 * - Productos bajando en stock o cayendo en volumen de ventas.
 * - Costos reales (receta de cocina o bulto de mercancía) + brecha cambiaria BCV vs USDT/Euro.
 * - Mejor precio recomendado ($ y Bs) para proteger margen y reposición.
 *
 * Compatible con Node.js v13.14.0+ (sin ?. ni ??).
 */

function toNum(v, fallback) {
  var n = Number(v);
  return isNaN(n) || !isFinite(n) ? (fallback || 0) : n;
}

function roundUpNickel(usd) {
  if (!usd || usd <= 0) return 0;
  return Number((Math.ceil(usd * 20) / 20).toFixed(2));
}

function round2(n) {
  return Number(toNum(n, 0).toFixed(2));
}

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function buildInsumoMap(state) {
  var map = {};
  var list = Array.isArray(state.inventory) ? state.inventory : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id) {
      map[list[i].id] = list[i];
    }
  }
  return map;
}

function calcDishCostUsd(variant, insumoMap) {
  if (!variant) return 0;
  var recipe = Array.isArray(variant.recipe) ? variant.recipe : (Array.isArray(variant.ingredients) ? variant.ingredients : []);
  var total = 0;
  for (var i = 0; i < recipe.length; i++) {
    var rec = recipe[i];
    if (!rec) continue;
    var insId = rec.insumoId || rec.itemId;
    var ins = insId ? insumoMap[insId] : null;
    var unitCost = ins ? toNum(ins.costUsd, 0) : 0;
    var qty = toNum(rec.qty, 0);
    total += unitCost * qty;
  }
  if (total <= 0 && toNum(variant.costUsd, 0) > 0) {
    total = toNum(variant.costUsd, 0);
  }
  return round2(total);
}

function computeSalesMetrics(state, nowMs) {
  var sales = Array.isArray(state.sales) ? state.sales : [];
  var msDay = 24 * 60 * 60 * 1000;
  var VET_OFFSET_MS = 4 * 3600000;
  var todayStr = new Date(nowMs - VET_OFFSET_MS).toISOString().slice(0, 10);
  var sevenDaysAgo = nowMs - (7 * msDay);
  var fourteenDaysAgo = nowMs - (14 * msDay);

  var byRef = {};
  var todaySalesUsd = 0;
  var todayOrders = 0;
  var pendingPmCount = 0;
  var pendingPmBs = 0;

  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    if (!s || s.voided) continue;
    var createdStr = String(s.createdAt || s.ts || '').trim();
    var parsedTs = createdStr ? Date.parse(createdStr) : NaN;
    var ts = isNaN(parsedTs) ? nowMs : parsedTs;
    var saleDateStr = /^\d{4}-\d{2}-\d{2}$/.test(createdStr)
      ? createdStr
      : (!isNaN(parsedTs) ? new Date(parsedTs - VET_OFFSET_MS).toISOString().slice(0, 10) : '');

    var isToday = saleDateStr === todayStr;
    if (isToday) {
      todaySalesUsd += toNum(s.totalUsd, 0);
      todayOrders += 1;
    }

    if (Array.isArray(s.payments)) {
      for (var p = 0; p < s.payments.length; p++) {
        var pay = s.payments[p];
        if (pay && pay.method === 'Pago Móvil') {
          var isPending = pay.verifyStatus === 'PENDIENTE' || (pay.verified === false && pay.verifyStatus !== 'CONCILIADO' && pay.verifyStatus !== 'RECHAZADO');
          if (isPending) {
            pendingPmCount += 1;
            pendingPmBs += toNum(pay.amountBs, 0);
          }
        }
      }
    }

    if (Array.isArray(s.items)) {
      for (var j = 0; j < s.items.length; j++) {
        var it = s.items[j];
        if (!it) continue;
        var key = it.variantId || it.retailItemId || it.id || it.refId || it.productId || it.name;
        if (!key) continue;
        if (!byRef[key]) {
          byRef[key] = {
            key: key,
            name: it.name || key,
            qty7: 0,
            qtyPrev7: 0,
            qtyTotal: 0,
            revTotal: 0,
            lastSoldTs: 0
          };
        }
        var qty = toNum(it.qty || it.quantity, 1);
        var rev = toNum(it.lineTotalUsd, toNum(it.priceUsd, 0) * qty);
        byRef[key].qtyTotal += qty;
        byRef[key].revTotal += rev;
        if (ts > byRef[key].lastSoldTs) byRef[key].lastSoldTs = ts;
        if (ts >= sevenDaysAgo) {
          byRef[key].qty7 += qty;
        } else if (ts >= fourteenDaysAgo) {
          byRef[key].qtyPrev7 += qty;
        }
      }
    }
  }

  return {
    byRef: byRef,
    todaySalesUsd: round2(todaySalesUsd),
    todayOrders: todayOrders,
    pendingPmCount: pendingPmCount,
    pendingPmBs: round2(pendingPmBs)
  };
}

function analyzeBusiness(state, options) {
  var opts = options || {};
  var nowMs = opts.nowMs || Date.now();
  var s = state || {};
  var settings = s.settings || {};

  var bcv = Math.max(1, toNum(settings.rateBcv, 42.85));
  var eur = Math.max(1, toNum(settings.rateEur, bcv * 1.08));
  var usdt = Math.max(1, toNum(settings.rateUsdt, bcv));
  var targetMarginPct = Math.min(80, Math.max(15, toNum(settings.targetMarginPct, 40)));

  var gapFactor = Math.max(1, usdt / bcv);
  var gapPct = round2((gapFactor - 1) * 100);
  var eurGapPct = round2(((eur / bcv) - 1) * 100);

  var insumoMap = buildInsumoMap(s);
  var metrics = computeSalesMetrics(s, nowMs);
  var inventory = Array.isArray(s.inventory) ? s.inventory : [];
  var variants = Array.isArray(s.variants) ? s.variants : [];

  var criticalItems = [];
  var fallingStockItems = [];
  var slowOrDeadItems = [];
  var pricingSuggestions = [];
  var fallingProducts = [];

  var healthyCount = 0;
  var totalTrackedInv = 0;

  // 1. Analizar Inventario (Insumos de cocina + Mercancía de venta directa)
  for (var i = 0; i < inventory.length; i++) {
    var item = inventory[i];
    if (!item || !item.id) continue;
    totalTrackedInv += 1;

    var stock = toNum(item.stock, 0);
    var minStock = Math.max(1, toNum(item.minStock, 5));
    var unit = item.unit || 'und';
    var saleStat = metrics.byRef[item.id] || null;
    var dailyVelocity = saleStat ? (saleStat.qty7 / 7) : 0;
    var daysRemaining = dailyVelocity > 0.05 ? round2(stock / dailyVelocity) : null;

    var ratio = stock / minStock;
    if (stock <= 0 || stock <= minStock) {
      criticalItems.push({
        id: item.id,
        code: item.code || '',
        name: item.name,
        type: item.type === 'insumo' ? 'insumo' : 'venta',
        stock: round2(stock),
        minStock: round2(minStock),
        unit: unit,
        daysRemaining: daysRemaining,
        severity: stock <= 0 ? 'AGOTADO' : 'CRITICO',
        action: stock <= 0 ? 'Reponer de inmediato' : 'Comprar reposición pronto'
      });
    } else {
      healthyCount += 1;
      if (ratio <= 1.6 || (daysRemaining !== null && daysRemaining <= 4)) {
        fallingStockItems.push({
          id: item.id,
          code: item.code || '',
          name: item.name,
          type: item.type === 'insumo' ? 'insumo' : 'venta',
          stock: round2(stock),
          minStock: round2(minStock),
          unit: unit,
          daysRemaining: daysRemaining,
          reason: daysRemaining !== null && daysRemaining <= 4
            ? ('Al ritmo actual alcanza para ~' + daysRemaining + ' días')
            : 'Se acerca al stock mínimo (' + round2(stock) + ' / ' + round2(minStock) + ' ' + unit + ')'
        });
      }
    }

    // Mercancía vendible: analizar rotación y precio óptimo
    var isSellable = item.sellable === true || item.type === 'venta';
    if (isSellable) {
      if (stock > 0 && (!saleStat || saleStat.qtyTotal === 0)) {
        slowOrDeadItems.push({
          id: item.id,
          name: item.name,
          stock: round2(stock),
          unit: unit,
          priceUsd: round2(item.priceUsd),
          reason: 'Tiene stock disponible pero no registra ventas recientes'
        });
      }

      var costUsd = toNum(item.costUsd, 0);
      var currentPrice = toNum(item.priceUsd, 0);
      if (costUsd > 0 || currentPrice > 0) {
        // Para mercancía empaquetada, proteger reposición ante brecha cambiaria ponderada (60% de la brecha)
        var effectiveGapFactor = 1 + ((gapFactor - 1) * 0.6);
        var replacementCostUsd = round2(costUsd * effectiveGapFactor);
        var marginPct = currentPrice > 0 ? round2(((currentPrice - costUsd) / currentPrice) * 100) : 0;
        var realMarginAfterGapPct = currentPrice > 0 ? round2(((currentPrice - replacementCostUsd) / currentPrice) * 100) : 0;

        var targetFactor = 1 - (targetMarginPct / 100);
        var rawRecommended = costUsd > 0
          ? (replacementCostUsd / Math.max(0.2, targetFactor))
          : currentPrice;
        var recommendedPriceUsd = roundUpNickel(rawRecommended);
        if (recommendedPriceUsd < currentPrice && realMarginAfterGapPct >= targetMarginPct - 3) {
          recommendedPriceUsd = round2(currentPrice);
        }

        var deltaUsd = round2(recommendedPriceUsd - currentPrice);
        var priority = 'OK';
        var reason = 'Margen saludable y competitivo.';

        if (currentPrice <= costUsd && costUsd > 0) {
          priority = 'URGENTE';
          reason = 'Pérdida directa: el precio ($' + round2(currentPrice) + ') no cubre el costo ($' + round2(costUsd) + ').';
        } else if (realMarginAfterGapPct < 18 && costUsd > 0) {
          priority = 'URGENTE';
          reason = 'Margen real bajo (' + realMarginAfterGapPct + '%) al descontar brecha BCV/USDT (' + gapPct + '%).';
        } else if (deltaUsd >= 0.05 && realMarginAfterGapPct < (targetMarginPct - 5)) {
          priority = 'AJUSTAR';
          reason = 'Margen por debajo de tu meta (' + targetMarginPct + '%). Subir +$' + deltaUsd + ' protege tu reposición.';
        } else if (marginPct > 65 && (!saleStat || saleStat.qty7 <= 1)) {
          priority = 'OPORTUNIDAD';
          var promoSuggested = roundUpNickel(costUsd / Math.max(0.3, 1 - ((targetMarginPct + 5) / 100)));
          if (promoSuggested > 0 && promoSuggested < currentPrice) {
            recommendedPriceUsd = promoSuggested;
            deltaUsd = round2(recommendedPriceUsd - currentPrice);
            reason = 'Margen alto (' + marginPct + '%) con baja rotación; podrías bajar a $' + recommendedPriceUsd + ' para mover inventario.';
          }
        }

        if (priority !== 'OK') {
          pricingSuggestions.push({
            kind: 'retail',
            id: item.id,
            code: item.code || '',
            name: item.name,
            iva: item.iva || (item.taxExempt ? 'E' : 'G16'),
            costUsd: round2(costUsd),
            replacementCostUsd: replacementCostUsd,
            currentPriceUsd: round2(currentPrice),
            currentPriceBs: round2(currentPrice * bcv),
            recommendedPriceUsd: recommendedPriceUsd,
            recommendedPriceBs: round2(recommendedPriceUsd * bcv),
            deltaUsd: deltaUsd,
            currentMarginPct: marginPct,
            realMarginPct: realMarginAfterGapPct,
            projectedMarginPct: recommendedPriceUsd > 0 ? round2(((recommendedPriceUsd - replacementCostUsd) / recommendedPriceUsd) * 100) : 0,
            priority: priority,
            reason: reason
          });
        }
      }
    }
  }

  // 2. Analizar Platos de Cocina (Recetas + Costo real de ingredientes)
  for (var v = 0; v < variants.length; v++) {
    var dish = variants[v];
    if (!dish || !dish.id || dish.available === false) continue;

    var dishCost = calcDishCostUsd(dish, insumoMap);
    var dishPrice = toNum(dish.priceUsd, 0);
    if (dishCost > 0) {
      var dishGapFactor = 1 + ((gapFactor - 1) * 0.45);
      var dishReplCost = round2(dishCost * dishGapFactor);
      var dishMargin = dishPrice > 0 ? round2(((dishPrice - dishCost) / dishPrice) * 100) : 0;
      var dishRealMargin = dishPrice > 0 ? round2(((dishPrice - dishReplCost) / dishPrice) * 100) : 0;
      var dishTarget = 1 - (Math.max(targetMarginPct, 42) / 100);
      var dishRecUsd = roundUpNickel(dishReplCost / Math.max(0.2, dishTarget));
      var dishDelta = round2(dishRecUsd - dishPrice);

      if (dishPrice <= dishCost || dishRealMargin < 22 || (dishDelta >= 0.10 && dishRealMargin < targetMarginPct - 4)) {
        pricingSuggestions.push({
          kind: 'variant',
          id: dish.id,
          code: dish.code || '',
          name: dish.name,
          iva: dish.iva || 'G16',
          costUsd: dishCost,
          replacementCostUsd: dishReplCost,
          currentPriceUsd: round2(dishPrice),
          currentPriceBs: round2(dishPrice * bcv),
          recommendedPriceUsd: dishRecUsd,
          recommendedPriceBs: round2(dishRecUsd * bcv),
          deltaUsd: dishDelta,
          currentMarginPct: dishMargin,
          realMarginPct: dishRealMargin,
          projectedMarginPct: dishRecUsd > 0 ? round2(((dishRecUsd - dishReplCost) / dishRecUsd) * 100) : 0,
          priority: dishPrice <= dishCost || dishRealMargin < 22 ? 'URGENTE' : 'AJUSTAR',
          reason: 'Costo de receta $' + dishCost + ' (reposición $' + dishReplCost + '). Ajuste sugerido para sostener margen de cocina.'
        });
      }
    }
  }

  // 3. Productos con caída en ventas (últimos 7 días vs 7 días anteriores)
  var refKeys = Object.keys(metrics.byRef);
  for (var k = 0; k < refKeys.length; k++) {
    var st = metrics.byRef[refKeys[k]];
    if (st.qtyPrev7 >= 2 && st.qty7 < st.qtyPrev7 * 0.7) {
      var dropPct = Math.round(((st.qtyPrev7 - st.qty7) / st.qtyPrev7) * 100);
      fallingProducts.push({
        id: st.key,
        name: st.name,
        qtyPrev7: st.qtyPrev7,
        qty7: st.qty7,
        dropPct: dropPct,
        reason: 'Bajó ' + dropPct + '% en demanda (' + st.qtyPrev7 + ' → ' + st.qty7 + ' und en 7 días)'
      });
    }
  }

  // Ordenar prioridades
  var prioWeight = { URGENTE: 0, AJUSTAR: 1, OPORTUNIDAD: 2, OK: 3 };
  pricingSuggestions.sort(function (a, b) {
    var wa = prioWeight[a.priority] !== undefined ? prioWeight[a.priority] : 9;
    var wb = prioWeight[b.priority] !== undefined ? prioWeight[b.priority] : 9;
    if (wa !== wb) return wa - wb;
    return Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd);
  });

  criticalItems.sort(function (a, b) {
    if (a.stock <= 0 && b.stock > 0) return -1;
    if (b.stock <= 0 && a.stock > 0) return 1;
    return (a.stock / a.minStock) - (b.stock / b.minStock);
  });

  fallingProducts.sort(function (a, b) {
    return b.dropPct - a.dropPct;
  });

  var stockCoveragePct = totalTrackedInv > 0 ? Math.round((healthyCount / totalTrackedInv) * 100) : 100;
  var urgentPrices = pricingSuggestions.filter(function (x) { return x.priority === 'URGENTE'; }).length;

  var healthScore = 100;
  healthScore -= Math.min(35, criticalItems.length * 6);
  healthScore -= Math.min(25, urgentPrices * 7);
  healthScore -= Math.min(15, Math.max(0, gapPct - 10) * 0.6);
  healthScore -= Math.min(10, metrics.pendingPmCount * 2);
  healthScore = Math.max(10, Math.round(healthScore));

  var statusLabel = healthScore >= 80 ? 'Saludable' : (healthScore >= 55 ? 'Atención Sugerida' : 'Acción Requerida');
  var headline = 'Inventario al ' + stockCoveragePct + '% de cobertura';
  if (criticalItems.length > 0) {
    headline = criticalItems.length + ' artículo(s) en stock crítico y ' + pricingSuggestions.length + ' precio(s) por optimizar.';
  } else if (pricingSuggestions.length > 0) {
    headline = 'Stock estable (' + stockCoveragePct + '%), pero tienes ' + pricingSuggestions.length + ' precios con oportunidad de mejora.';
  }

  var recommendations = [];
  if (metrics.pendingPmCount > 0) {
    recommendations.push({
      tag: 'PAGO MÓVIL',
      severity: 'warn',
      title: 'Tienes ' + metrics.pendingPmCount + ' Pago(s) Móvil(es) por confirmar',
      detail: 'Suman Bs ' + round2(metrics.pendingPmBs).toFixed(2) + '. Confírmalos desde la pestaña Pago Móvil para cuadrar el banco.'
    });
  }
  if (criticalItems.length > 0) {
    var topCrit = criticalItems.slice(0, 3).map(function (c) { return c.name + ' (' + c.stock + ' ' + c.unit + ')'; }).join(', ');
    recommendations.push({
      tag: 'INVENTARIO',
      severity: 'danger',
      title: criticalItems.length + ' producto(s) o ingrediente(s) en nivel crítico',
      detail: 'Prioridad de reposición: ' + topCrit + '.'
    });
  }
  if (pricingSuggestions.length > 0) {
    var topP = pricingSuggestions[0];
    recommendations.push({
      tag: 'COSTOS Y PRECIOS',
      severity: topP.priority === 'URGENTE' ? 'danger' : 'info',
      title: 'Ajuste recomendado en ' + pricingSuggestions.length + ' producto(s)',
      detail: 'Ejemplo: ' + topP.name + ' de $' + topP.currentPriceUsd.toFixed(2) + ' → $' + topP.recommendedPriceUsd.toFixed(2) + ' (' + topP.reason + ')'
    });
  }
  if (gapPct >= 8) {
    recommendations.push({
      tag: 'BRECHA CAMBIARIA',
      severity: 'warn',
      title: 'Brecha BCV ↔ USDT en ' + gapPct + '%',
      detail: 'BCV Bs ' + bcv.toFixed(2) + ' vs USDT Bs ' + usdt.toFixed(2) + '. La IA ya compensó este diferencial en tus precios sugeridos.'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      tag: 'TODO EN ORDEN',
      severity: 'ok',
      title: 'Tu inventario y márgenes están equilibrados',
      detail: 'Sin quiebres críticos ni precios por debajo del margen objetivo (' + targetMarginPct + '%).'
    });
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    summary: {
      healthScore: healthScore,
      statusLabel: statusLabel,
      headline: headline,
      bcv: bcv,
      eur: eur,
      usdt: usdt,
      gapPct: gapPct,
      eurGapPct: eurGapPct,
      targetMarginPct: targetMarginPct,
      todaySalesUsd: metrics.todaySalesUsd,
      todayOrders: metrics.todayOrders,
      pendingPmCount: metrics.pendingPmCount,
      pendingPmBs: metrics.pendingPmBs,
      stockCoveragePct: stockCoveragePct,
      criticalStockCount: criticalItems.length,
      fallingStockCount: fallingStockItems.length,
      fallingDemandCount: fallingProducts.length,
      pricingSuggestionsCount: pricingSuggestions.length,
      urgentPricesCount: urgentPrices
    },
    inventoryHealth: {
      criticalItems: criticalItems.slice(0, 25),
      fallingStockItems: fallingStockItems.slice(0, 20),
      slowOrDeadItems: slowOrDeadItems.slice(0, 15)
    },
    pricingSuggestions: pricingSuggestions.slice(0, 30),
    fallingProducts: fallingProducts.slice(0, 15),
    recommendations: recommendations
  };
}

function answerQuestion(state, questionText) {
  var analysis = analyzeBusiness(state);
  var q = normalizeText(questionText);
  var sum = analysis.summary;

  if (!q) {
    return {
      answer: sum.headline + ' Índice de salud del negocio: ' + sum.healthScore + '/100.',
      analysis: analysis
    };
  }

  // Búsqueda directa de un producto mencionado en la pregunta
  var inv = Array.isArray(state && state.inventory) ? state.inventory : [];
  var vars = Array.isArray(state && state.variants) ? state.variants : [];
  var matchedPrice = null;
  for (var p = 0; p < analysis.pricingSuggestions.length; p++) {
    var ps = analysis.pricingSuggestions[p];
    if (q.indexOf(normalizeText(ps.name)) !== -1 || (ps.code && q.indexOf(normalizeText(ps.code)) !== -1)) {
      matchedPrice = ps;
      break;
    }
  }
  if (matchedPrice) {
    return {
      answer: '🔎 ' + matchedPrice.name + ': costo actual $' + matchedPrice.costUsd.toFixed(2) +
        ' (reposición ajustada $' + matchedPrice.replacementCostUsd.toFixed(2) + '). Precio actual $' +
        matchedPrice.currentPriceUsd.toFixed(2) + ' → Mejor precio sugerido: $' +
        matchedPrice.recommendedPriceUsd.toFixed(2) + ' (Bs ' + matchedPrice.recommendedPriceBs.toFixed(2) +
        ') para lograr ' + matchedPrice.projectedMarginPct + '% de margen. ' + matchedPrice.reason,
      matchedSuggestion: matchedPrice
    };
  }

  for (var i = 0; i < inv.length; i++) {
    var item = inv[i];
    if (item && item.name && item.name.length >= 4 && q.indexOf(normalizeText(item.name)) !== -1) {
      return {
        answer: '📦 ' + item.name + ': tienes ' + round2(item.stock) + ' ' + (item.unit || 'und') +
          ' (mínimo ' + round2(item.minStock || 5) + '). Costo: $' + round2(item.costUsd).toFixed(2) +
          (item.priceUsd ? ' · PVP actual: $' + round2(item.priceUsd).toFixed(2) + ' (Bs ' + round2(item.priceUsd * sum.bcv).toFixed(2) + ').' : ' (insumo de cocina).')
      };
    }
  }
  for (var v = 0; v < vars.length; v++) {
    var dish = vars[v];
    if (dish && dish.name && dish.name.length >= 4 && q.indexOf(normalizeText(dish.name)) !== -1) {
      var insMap = buildInsumoMap(state);
      var c = calcDishCostUsd(dish, insMap);
      var m = dish.priceUsd > 0 ? round2(((dish.priceUsd - c) / dish.priceUsd) * 100) : 0;
      return {
        answer: '🍽 ' + dish.name + ': costo de receta $' + c.toFixed(2) + ', PVP actual $' + round2(dish.priceUsd).toFixed(2) +
          ' (Bs ' + round2(dish.priceUsd * sum.bcv).toFixed(2) + '), margen nominal ' + m + '%.'
      };
    }
  }

  if (q.indexOf('inventario') !== -1 || q.indexOf('stock') !== -1 || q.indexOf('acab') !== -1 || q.indexOf('falta') !== -1) {
    var critList = analysis.inventoryHealth.criticalItems.slice(0, 4).map(function (c) {
      return c.name + ' (' + c.stock + ' ' + c.unit + ')';
    });
    var fallList = analysis.inventoryHealth.fallingStockItems.slice(0, 3).map(function (f) {
      return f.name + ' (' + f.reason + ')';
    });
    var msg = '📦 Inventario al ' + sum.stockCoveragePct + '% de cobertura. ';
    msg += critList.length ? ('Críticos ahora: ' + critList.join(', ') + '. ') : 'Sin artículos agotados. ';
    if (fallList.length) msg += 'Bajando rápido: ' + fallList.join('; ') + '.';
    return { answer: msg };
  }

  if (q.indexOf('precio') !== -1 || q.indexOf('costo') !== -1 || q.indexOf('margen') !== -1 || q.indexOf('subir') !== -1 || q.indexOf('dolar') !== -1 || q.indexOf('tasa') !== -1) {
    if (analysis.pricingSuggestions.length === 0) {
      return {
        answer: '💰 Todos tus precios cubren el margen objetivo (' + sum.targetMarginPct + '%) incluso considerando la brecha BCV/USDT (' + sum.gapPct + '%).'
      };
    }
    var topThree = analysis.pricingSuggestions.slice(0, 3).map(function (pItem) {
      return pItem.name + ' ($' + pItem.currentPriceUsd.toFixed(2) + ' → $' + pItem.recommendedPriceUsd.toFixed(2) + ')';
    });
    return {
      answer: '💡 Con brecha BCV/USDT en ' + sum.gapPct + '% y meta de ' + sum.targetMarginPct + '% de margen, te sugiero revisar ' +
        analysis.pricingSuggestions.length + ' productos. Prioritarios: ' + topThree.join(' · ') + '.'
    };
  }

  if (q.indexOf('bajando') !== -1 || q.indexOf('cae') !== -1 || q.indexOf('baja') !== -1 || q.indexOf('lento') !== -1) {
    if (analysis.fallingProducts.length > 0) {
      return {
        answer: '📉 Productos bajando en ventas (últimos 7 días): ' +
          analysis.fallingProducts.slice(0, 4).map(function (fp) { return fp.name + ' (-' + fp.dropPct + '%)'; }).join(', ') + '.'
      };
    }
    if (analysis.inventoryHealth.fallingStockItems.length > 0) {
      return {
        answer: '📉 Productos bajando en existencia física: ' +
          analysis.inventoryHealth.fallingStockItems.slice(0, 4).map(function (fs) { return fs.name + ' (' + fs.stock + ' ' + fs.unit + ')'; }).join(', ') + '.'
      };
    }
    return { answer: '📊 No detecto caídas bruscas de ventas ni de stock fuera de rango en los últimos días.' };
  }

  if (q.indexOf('pago') !== -1 || q.indexOf('movil') !== -1 || q.indexOf('banco') !== -1) {
    return {
      answer: sum.pendingPmCount > 0
        ? ('📲 Tienes ' + sum.pendingPmCount + ' Pago(s) Móvil(es) pendientes por confirmar por Bs ' + sum.pendingPmBs.toFixed(2) + '.')
        : '✅ Todos los Pagos Móviles registrados están conciliados.'
    };
  }

  return {
    answer: '🤖 Resumen IA (' + sum.statusLabel + ', ' + sum.healthScore + '/100): Hoy llevas $' +
      sum.todaySalesUsd.toFixed(2) + ' en ' + sum.todayOrders + ' orden(es). ' + sum.headline +
      (sum.pendingPmCount > 0 ? (' Además tienes ' + sum.pendingPmCount + ' Pago Móvil por verificar.') : '')
  };
}

module.exports = {
  analyzeBusiness: analyzeBusiness,
  answerQuestion: answerQuestion
};
