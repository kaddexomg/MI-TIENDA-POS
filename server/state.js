'use strict';

/**
 * server/state.js
 * MI-TIENDA-POS v5.0.0
 * 
 * Gestor del Estado Materializado en Memoria y Snapshots Periódicos.
 * Reconstruye el estado a partir de snapshot.json + eventos posteriores del journal.
 * 
 * Compatible con Node.js v13.14.0+ (CommonJS puro, sin dependencias externas).
 * Sin operadores opcionales (?.) ni nullish (??) para compatibilidad absoluta con Win7.
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_INTERVAL_EVENTS = 50;

let journalRef = null;
let currentState = null;
let eventsSinceSnapshot = 0;
let lastAppliedSeq = 0;

/**
 * Estado base inicial predeterminado.
 */
function createDefaultState() {
  return {
    version: '8.0.0',
    settings: {
      storeName: 'MI TIENDA POS · Restaurante & Abasto',
      rif: 'J-50128940-1',
      phone: '0412-0000000',
      address: 'Mostrador Principal & Cocina Venezolana',
      rateBcv: 42.85,
      rateEur: 46.60,
      rateUsdt: 51.40,
      lastRateSync: '',
      fiscalMode: 'INTERNO'
    },
    inventory: [],
    insumos: [],
    dishes: [],
    families: [],
    products: [],
    variants: [],
    modifierGroups: [],
    retailItems: [],
    sales: [],
    expenses: [],
    purchases: [],
    invoices: [],
    kitchenBatches: [],
    wasteRecords: [],
    kardex: [],
    shifts: [],
    dailyClosures: [],
    monthlyClosures: [],
    batchClosures: [],
    heldOrders: [],
    users: [],
    posTerminals: [],
    pagoMovilAccounts: [],
    lastSeq: 0,
    updatedAt: new Date().toISOString()
  };
}

function syncUnifiedInventory(stateObj) {
  if (!stateObj || !Array.isArray(stateObj.inventory)) return;
  if (!Array.isArray(stateObj.insumos)) stateObj.insumos = [];
  if (!Array.isArray(stateObj.retailItems)) stateObj.retailItems = [];
  stateObj.insumos = stateObj.inventory.filter(function (i) {
    return i && (i.type === 'insumo' || !i.sellable);
  });
  stateObj.retailItems = stateObj.inventory.filter(function (i) {
    return i && (i.type === 'venta' || i.sellable === true);
  });
}

function adjustServerStock(stateObj, itemId, deltaQty) {
  if (!itemId || !stateObj || !Array.isArray(stateObj.inventory)) return null;
  for (let j = 0; j < stateObj.inventory.length; j++) {
    if (stateObj.inventory[j] && stateObj.inventory[j].id === itemId) {
      const prev = Number(stateObj.inventory[j].stock || 0);
      const next = Math.max(0, Number((prev + Number(deltaQty || 0)).toFixed(3)));
      stateObj.inventory[j].stock = next;
      return { item: stateObj.inventory[j], prev: prev, next: next, appliedDelta: Number((next - prev).toFixed(3)) };
    }
  }
  return null;
}

/**
 * Aplica una mutación de evento sobre el estado materializado en memoria.
 * 
 * @param {Object} event Evento del journal
 * @param {boolean} isReplay true si se está reconstruyendo desde snapshot
 */
function applyEvent(event, isReplay) {
  if (!event || typeof event !== 'object') return currentState;
  if (!currentState) {
    currentState = createDefaultState();
  }

  const payload = event.payload || {};
  const eventType = event.type;
  const eventUser = event.user || 'sistema';
  const eventTs = event.ts || new Date().toISOString();

  switch (eventType) {
    case 'SALE_CREATED': {
      // Registrar venta
      const sale = Object.assign({}, payload);
      sale.id = sale.id || event.id;
      sale.seq = event.seq;
      sale.createdAt = sale.createdAt || eventTs;
      sale.createdBy = eventUser;

      // Evitar duplicados por id
      let existingIndex = -1;
      for (let i = 0; i < currentState.sales.length; i++) {
        if (currentState.sales[i].id === sale.id) {
          existingIndex = i;
          break;
        }
      }
      if (existingIndex >= 0) {
        currentState.sales[existingIndex] = sale;
      } else {
        currentState.sales.push(sale);
      }

      // Descontar inventario directo y recetas/modificadores de cocina de forma atómica
      const stockDeductions = [];
      if (Array.isArray(sale.items)) {
        for (let i = 0; i < sale.items.length; i++) {
          const item = sale.items[i];
          const qty = Number(item.quantity || item.qty || 1);
          const isExplicitDish = Boolean(item.isDish || item.isVariant || item.kind === 'dish' || item.type === 'dish');
          const isExplicitRetail = Boolean(item.retailItemId || item.kind === 'retail' || item.type === 'retail' || item.isDish === false);
          const itemId = item.retailItemId || (!isExplicitDish ? (item.refId || item.id || item.productId) : null);
          const variantId = item.variantId || (!isExplicitRetail ? (item.refId || item.id) : null);

          let deductedDirect = false;
          if (itemId) {
            const adjDirect = adjustServerStock(currentState, itemId, -qty);
            if (adjDirect) {
              deductedDirect = true;
              stockDeductions.push({ itemId: itemId, qty: Math.abs(adjDirect.appliedDelta) });
            }
          }

          // Si es plato de cocina con receta (en item.recipe, item.ingredients o en variants)
          let recipeList = Array.isArray(item.recipe) ? item.recipe : (Array.isArray(item.ingredients) ? item.ingredients : null);
          if (!recipeList && variantId && Array.isArray(currentState.variants)) {
            for (let vIdx = 0; vIdx < currentState.variants.length; vIdx++) {
              if (currentState.variants[vIdx] && currentState.variants[vIdx].id === variantId) {
                if (Array.isArray(currentState.variants[vIdx].recipe)) recipeList = currentState.variants[vIdx].recipe;
                else if (Array.isArray(currentState.variants[vIdx].ingredients)) recipeList = currentState.variants[vIdx].ingredients;
                break;
              }
            }
          }
          if (Array.isArray(recipeList)) {
            for (let rIdx = 0; rIdx < recipeList.length; rIdx++) {
              const rec = recipeList[rIdx];
              const insId = rec && (rec.insumoId || rec.itemId);
              const perUnit = Number(rec && rec.qty ? rec.qty : 0);
              if (insId && perUnit > 0) {
                const needQty = Number((perUnit * qty).toFixed(4));
                const adjRec = adjustServerStock(currentState, insId, -needQty);
                if (adjRec) {
                  stockDeductions.push({ itemId: insId, qty: Math.abs(adjRec.appliedDelta) });
                }
              }
            }
          }

          // Modificadores / extras (selectedModifiers o modifiers) con insumoId o recipe[]
          const itemMods = [].concat(
            Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [],
            Array.isArray(item.modifiers) ? item.modifiers : []
          );
          for (let mIdx = 0; mIdx < itemMods.length; mIdx++) {
            const mod = itemMods[mIdx];
            if (!mod) continue;
            const modInsId = mod.insumoId;
            const modQty = Number(mod.qty || 0);
            if (modInsId && modQty > 0) {
              const adjMod = adjustServerStock(currentState, modInsId, -(modQty * qty));
              if (adjMod) {
                stockDeductions.push({ itemId: modInsId, qty: Math.abs(adjMod.appliedDelta) });
              }
            }
            if (Array.isArray(mod.recipe)) {
              for (let mrIdx = 0; mrIdx < mod.recipe.length; mrIdx++) {
                const mr = mod.recipe[mrIdx];
                const mrInsId = mr && (mr.insumoId || mr.itemId);
                const mrQty = Number(mr && mr.qty ? mr.qty : 0);
                if (mrInsId && mrQty > 0) {
                  const adjMr = adjustServerStock(currentState, mrInsId, -Number((mrQty * qty).toFixed(4)));
                  if (adjMr) {
                    stockDeductions.push({ itemId: mrInsId, qty: Math.abs(adjMr.appliedDelta) });
                  }
                }
              }
            }
          }

          // Asentar Kardex de venta
          currentState.kardex.push({
            id: 'kdx_' + event.seq + '_' + i,
            seq: event.seq,
            type: 'VENTA',
            itemId: itemId || variantId || 'prod_desconocido',
            itemName: item.name || 'Producto vendido',
            qty: deductedDirect ? -qty : 0,
            unit: item.unit || 'und',
            docRef: sale.saleNumber || sale.id,
            user: eventUser,
            ts: eventTs
          });
        }
      }
      sale.stockDeductions = stockDeductions;
      syncUnifiedInventory(currentState);
      break;
    }

    case 'SALE_VOIDED': {
      const saleId = payload.saleId || payload.id;
      for (let i = 0; i < currentState.sales.length; i++) {
        if (currentState.sales[i].id === saleId && !currentState.sales[i].voided) {
          const targetSale = currentState.sales[i];
          targetSale.voided = true;
          targetSale.voidReason = payload.reason || 'Anulación de venta';
          targetSale.voidedAt = eventTs;
          targetSale.voidedBy = eventUser;

          // Reversar exactamente el stock descontado (directo + receta + modificadores)
          if (Array.isArray(targetSale.stockDeductions) && targetSale.stockDeductions.length > 0) {
            for (let dIdx = 0; dIdx < targetSale.stockDeductions.length; dIdx++) {
              const ded = targetSale.stockDeductions[dIdx];
              adjustServerStock(currentState, ded.itemId, Number(ded.qty || 0));
            }
          } else if (Array.isArray(targetSale.items)) {
            for (let k = 0; k < targetSale.items.length; k++) {
              const it = targetSale.items[k];
              const q = Number(it.quantity || it.qty || 1);
              const isDishIt = Boolean(it.isDish || it.isVariant || it.kind === 'dish' || it.type === 'dish');
              const isRetIt = Boolean(it.retailItemId || it.kind === 'retail' || it.type === 'retail' || it.isDish === false);
              const iid = it.retailItemId || (!isDishIt ? (it.refId || it.id || it.productId) : null);
              const vid = it.variantId || (!isRetIt ? (it.refId || it.id) : null);
              if (iid) adjustServerStock(currentState, iid, q);

              let recList = Array.isArray(it.recipe) ? it.recipe : (Array.isArray(it.ingredients) ? it.ingredients : null);
              if (!recList && vid && Array.isArray(currentState.variants)) {
                for (let vi = 0; vi < currentState.variants.length; vi++) {
                  if (currentState.variants[vi] && currentState.variants[vi].id === vid) {
                    recList = currentState.variants[vi].recipe || currentState.variants[vi].ingredients || null;
                    break;
                  }
                }
              }
              if (Array.isArray(recList)) {
                for (let ri = 0; ri < recList.length; ri++) {
                  const rItem = recList[ri];
                  const rId = rItem && (rItem.insumoId || rItem.itemId);
                  const rQty = Number(rItem && rItem.qty ? rItem.qty : 0);
                  if (rId && rQty > 0) adjustServerStock(currentState, rId, Number((rQty * q).toFixed(4)));
                }
              }

              const voidMods = [].concat(
                Array.isArray(it.selectedModifiers) ? it.selectedModifiers : [],
                Array.isArray(it.modifiers) ? it.modifiers : []
              );
              for (let mi = 0; mi < voidMods.length; mi++) {
                const vm = voidMods[mi];
                if (!vm) continue;
                if (vm.insumoId && Number(vm.qty || 0) > 0) {
                  adjustServerStock(currentState, vm.insumoId, Number(vm.qty) * q);
                }
                if (Array.isArray(vm.recipe)) {
                  for (let vmr = 0; vmr < vm.recipe.length; vmr++) {
                    const mr = vm.recipe[vmr];
                    const mrId = mr && (mr.insumoId || mr.itemId);
                    const mrQ = Number(mr && mr.qty ? mr.qty : 0);
                    if (mrId && mrQ > 0) adjustServerStock(currentState, mrId, Number((mrQ * q).toFixed(4)));
                  }
                }
              }
            }
          }
          syncUnifiedInventory(currentState);

          // Kardex de anulación
          currentState.kardex.push({
            id: 'kdx_anul_' + event.seq,
            seq: event.seq,
            type: 'VENTA_ANULADA',
            docRef: saleId,
            reason: payload.reason || '',
            user: eventUser,
            ts: eventTs
          });
          break;
        }
      }
      break;
    }

    case 'EXPENSE_CREATED': {
      const expense = Object.assign({}, payload);
      expense.id = expense.id || event.id;
      expense.seq = event.seq;
      expense.ts = expense.ts || eventTs;
      expense.user = eventUser;
      currentState.expenses.unshift(expense);
      break;
    }

    case 'EXPENSE_DELETED': {
      const expId = payload.id || payload.expId;
      if (expId && Array.isArray(currentState.expenses)) {
        currentState.expenses = currentState.expenses.filter(function (e) {
          return e && e.id !== expId;
        });
      }
      break;
    }

    case 'PURCHASE_RECEIVED': {
      const purchase = Object.assign({}, payload);
      purchase.id = purchase.id || event.id;
      purchase.seq = event.seq;
      purchase.ts = purchase.ts || eventTs;
      purchase.user = eventUser;
      currentState.purchases.unshift(purchase);

      // Si incluye renglones de mercancía, sumar al stock y actualizar costos
      if (Array.isArray(purchase.items)) {
        for (let i = 0; i < purchase.items.length; i++) {
          const item = purchase.items[i];
          const qty = Number(item.totalUnits || item.quantity || item.qty || 0);
          const itemId = item.itemId || item.insumoId || item.id || item.productId;
          const unitCost = Number(item.unitCostUsd || item.costUsd || 0);
          const newPrice = Number(item.newSalePriceUsd || 0);

          if (itemId) {
            for (let j = 0; j < currentState.inventory.length; j++) {
              if (currentState.inventory[j] && currentState.inventory[j].id === itemId) {
                const prev = Number(currentState.inventory[j].stock || 0);
                currentState.inventory[j].stock = Number((prev + qty).toFixed(3));
                if (unitCost > 0) {
                  currentState.inventory[j].prevCostUsd = currentState.inventory[j].costUsd;
                  currentState.inventory[j].costUsd = Number(unitCost.toFixed(2));
                }
                if (currentState.inventory[j].sellable && newPrice > 0) {
                  currentState.inventory[j].priceUsd = Number(newPrice.toFixed(2));
                }
                break;
              }
            }
          }

          currentState.kardex.push({
            id: 'kdx_compra_' + event.seq + '_' + i,
            seq: event.seq,
            type: 'COMPRA',
            itemId: itemId || 'insumo_compra',
            itemName: item.name || 'Compra a proveedor',
            qty: qty,
            unit: item.unit || 'und',
            docRef: purchase.docNumber || purchase.invoiceNo || purchase.id,
            user: eventUser,
            ts: eventTs
          });
        }
        syncUnifiedInventory(currentState);
      }
      break;
    }

    case 'WASTE_RECORDED': {
      const waste = Object.assign({}, payload);
      waste.id = waste.id || event.id;
      waste.seq = event.seq;
      waste.ts = waste.ts || eventTs;
      waste.user = eventUser;
      currentState.wasteRecords.unshift(waste);

      const wasteQty = Number(waste.quantity || waste.qty || 0);
      if (waste.itemId) {
        for (let j = 0; j < currentState.inventory.length; j++) {
          if (currentState.inventory[j] && currentState.inventory[j].id === waste.itemId) {
            const prev = Number(currentState.inventory[j].stock || 0);
            currentState.inventory[j].stock = Math.max(0, Number((prev - wasteQty).toFixed(3)));
            break;
          }
        }
        syncUnifiedInventory(currentState);
      }

      currentState.kardex.push({
        id: 'kdx_merma_' + event.seq,
        seq: event.seq,
        type: 'MERMA',
        itemId: waste.itemId || 'merma',
        itemName: waste.itemName || 'Alimento dañado / quemado',
        qty: -wasteQty,
        unit: waste.unit || 'und',
        reason: waste.reason || 'Merma',
        user: eventUser,
        ts: eventTs
      });
      break;
    }

    case 'STOCK_ADJUSTED': {
      const adj = payload;
      const itemId = adj.itemId || adj.id;
      const newStock = Number(adj.newStock !== undefined ? adj.newStock : adj.stock);
      const diff = Number(adj.difference || 0);

      if (itemId) {
        if (adj.newStock !== undefined || adj.stock !== undefined) {
          for (let j = 0; j < currentState.inventory.length; j++) {
            if (currentState.inventory[j].id === itemId) {
              currentState.inventory[j].stock = Math.max(0, newStock);
              break;
            }
          }
        } else if (adj.qty !== undefined) {
          adjustServerStock(currentState, itemId, Number(adj.qty));
        }
        syncUnifiedInventory(currentState);
      }

      currentState.kardex.push({
        id: 'kdx_audit_' + event.seq,
        seq: event.seq,
        type: adj.action || 'AJUSTE_AUDITORIA',
        itemId: itemId,
        itemName: adj.itemName || 'Ajuste de inventario',
        qty: diff || Number(adj.qty || 0),
        unit: adj.unit || 'und',
        reason: adj.justification || adj.reason || 'Auditoría física ciega',
        user: eventUser,
        ts: eventTs
      });
      break;
    }

    case 'BATCH_RECORDED': {
      if (!Array.isArray(currentState.kitchenBatches)) currentState.kitchenBatches = [];
      const srcBatch = (payload && payload.batch && typeof payload.batch === 'object') ? payload.batch : payload;
      if (srcBatch && (Array.isArray(srcBatch.insumosUsed) || srcBatch.dishName || srcBatch.date || srcBatch.id)) {
        const batch = Object.assign({}, srcBatch);
        batch.id = batch.id || ('TANDA-' + event.seq);
        currentState.kitchenBatches.unshift(batch);
        if (Array.isArray(batch.insumosUsed)) {
          for (let bIdx = 0; bIdx < batch.insumosUsed.length; bIdx++) {
            const u = batch.insumosUsed[bIdx];
            const uId = u && (u.insumoId || u.itemId || u.id);
            const uQty = Number(u && u.qty ? u.qty : 0);
            if (uId && uQty > 0) {
              adjustServerStock(currentState, uId, -uQty);
              currentState.kardex.push({
                id: 'kdx_tanda_' + event.seq + '_' + bIdx,
                seq: event.seq,
                type: 'TANDA_COCINA',
                itemId: uId,
                itemName: u.name || 'Insumo tanda',
                qty: -uQty,
                unit: u.unit || 'und',
                docRef: batch.id,
                user: eventUser,
                ts: eventTs
              });
            }
          }
          syncUnifiedInventory(currentState);
        }
      }
      break;
    }

    case 'INVOICE_PAID': {
      if (!Array.isArray(currentState.invoices)) currentState.invoices = [];
      const invId = payload.invoiceId || payload.id;
      const amount = Number(payload.amountUsd || payload.amount || 0);
      const payMethod = payload.method || payload.paymentSource || payload.paymentMethod || 'Efectivo USD';
      for (let idx = 0; idx < currentState.invoices.length; idx++) {
        const inv = currentState.invoices[idx];
        if (inv && inv.id === invId) {
          const total = Number(inv.totalUsd || 0);
          if (payload.paidUsd !== undefined && amount <= 0) {
            inv.paidUsd = Number(Number(payload.paidUsd).toFixed(2));
          } else {
            const nextPaid = Number(((Number(inv.paidUsd) || 0) + amount).toFixed(2));
            inv.paidUsd = total > 0 ? Math.min(total, nextPaid) : nextPaid;
          }
          inv.status = inv.paidUsd >= total - 0.01 ? 'pagada' : 'parcial';
          if (!Array.isArray(inv.payments)) inv.payments = [];
          if (amount > 0) {
            inv.payments.push({ amountUsd: amount, method: payMethod, ts: eventTs, user: eventUser });
          }
          break;
        }
      }
      break;
    }

    case 'CLOSURE_SAVED': {
      const scope = payload.scope || 'daily';
      if (scope === 'monthly') {
        if (!Array.isArray(currentState.monthlyClosures)) currentState.monthlyClosures = [];
        currentState.monthlyClosures.unshift(Object.assign({}, payload.closure || payload));
      } else if (scope === 'batch') {
        if (!Array.isArray(currentState.batchClosures)) currentState.batchClosures = [];
        const batchClosure = Object.assign({}, payload.closure || payload);
        currentState.batchClosures.unshift(batchClosure);
        const termId = payload.terminalId || batchClosure.terminalId;
        if (termId) {
          if (Array.isArray(currentState.sales)) {
            for (let si = 0; si < currentState.sales.length; si++) {
              const sObj = currentState.sales[si];
              if (!sObj || sObj.voided || !Array.isArray(sObj.payments)) continue;
              for (let pi = 0; pi < sObj.payments.length; pi++) {
                const pObj = sObj.payments[pi];
                if (pObj && pObj.method === 'Punto de Venta' && (pObj.terminalId === termId || !pObj.terminalId) && !pObj.batchClosed) {
                  pObj.batchClosed = true;
                  pObj.batchClosedId = 'LOTE-' + termId + '-' + (batchClosure.batchNumber || '0001');
                }
              }
            }
          }
          if (payload.nextBatch && Array.isArray(currentState.posTerminals)) {
            for (let ti = 0; ti < currentState.posTerminals.length; ti++) {
              if (currentState.posTerminals[ti] && currentState.posTerminals[ti].id === termId) {
                currentState.posTerminals[ti].currentBatch = payload.nextBatch;
                break;
              }
            }
          }
        }
      } else {
        if (!Array.isArray(currentState.dailyClosures)) currentState.dailyClosures = [];
        currentState.dailyClosures.unshift(Object.assign({}, payload.closure || payload));
      }
      break;
    }

    case 'ITEM_SAVED': {
      const it = payload.item || payload;
      if (it && it.id) {
        if (it.kind === 'variant') {
          let foundV = false;
          for (let vi = 0; vi < currentState.variants.length; vi++) {
            if (currentState.variants[vi].id === it.id) {
              currentState.variants[vi] = Object.assign({}, currentState.variants[vi], it);
              foundV = true;
              break;
            }
          }
          if (!foundV) currentState.variants.push(it);
        } else {
          let foundI = false;
          for (let ii = 0; ii < currentState.inventory.length; ii++) {
            if (currentState.inventory[ii].id === it.id) {
              currentState.inventory[ii] = Object.assign({}, currentState.inventory[ii], it);
              foundI = true;
              break;
            }
          }
          if (!foundI) currentState.inventory.push(it);
          syncUnifiedInventory(currentState);
        }
      }
      break;
    }

    case 'ITEM_DELETED': {
      const delId = payload.id || payload.itemId;
      if (delId) {
        currentState.inventory = (currentState.inventory || []).filter(function (i) { return i && i.id !== delId; });
        currentState.variants = (currentState.variants || []).filter(function (v) { return v && v.id !== delId; });
        currentState.dishes = (currentState.dishes || []).filter(function (d) { return d && d.id !== delId; });
        currentState.products = (currentState.products || []).filter(function (p) { return p && p.id !== delId; });
        syncUnifiedInventory(currentState);
      }
      break;
    }

    case 'BACKUP_IMPORTED':
    case 'STATE_SYNCED': {
      if (payload && payload.state && typeof payload.state === 'object') {
        const preservedSeq = lastAppliedSeq;
        currentState = Object.assign(createDefaultState(), payload.state);
        currentState.version = '8.0.0';
        currentState.lastSeq = preservedSeq;
        syncUnifiedInventory(currentState);
      }
      break;
    }

    case 'SHIFT_OPENED': {
      const shift = Object.assign({}, payload);
      shift.id = shift.id || event.id;
      shift.seq = event.seq;
      shift.openedAt = shift.openedAt || eventTs;
      shift.openedBy = eventUser;
      shift.status = 'OPEN';
      currentState.shifts.push(shift);
      break;
    }

    case 'SHIFT_CLOSED': {
      const shiftId = payload.shiftId || payload.id;
      for (let i = 0; i < currentState.shifts.length; i++) {
        if (currentState.shifts[i].id === shiftId || !currentState.shifts[i].closedAt) {
          currentState.shifts[i].status = 'CLOSED';
          currentState.shifts[i].closedAt = eventTs;
          currentState.shifts[i].closedBy = eventUser;
          currentState.shifts[i].closureSummary = payload;
          break;
        }
      }
      break;
    }

    case 'RATE_UPDATED': {
      if (payload.rateBcv !== undefined) currentState.settings.rateBcv = Number(payload.rateBcv);
      if (payload.rateEur !== undefined) currentState.settings.rateEur = Number(payload.rateEur);
      if (payload.rateUsdt !== undefined) currentState.settings.rateUsdt = Number(payload.rateUsdt);
      currentState.settings.lastRateSync = eventTs;
      break;
    }

    case 'CATALOG_CHANGED': {
      // Actualizar catálogos completos o deltas de precios desde Precios / Catálogo
      if (Array.isArray(payload.families)) currentState.families = payload.families;
      if (Array.isArray(payload.products)) currentState.products = payload.products;
      if (Array.isArray(payload.variants)) currentState.variants = payload.variants;
      if (Array.isArray(payload.modifierGroups)) currentState.modifierGroups = payload.modifierGroups;
      if (Array.isArray(payload.retailItems)) currentState.retailItems = payload.retailItems;
      if (Array.isArray(payload.inventory)) currentState.inventory = payload.inventory;
      if (Array.isArray(payload.dishes)) currentState.dishes = payload.dishes;

      function applyVariantPriceDelta(vId, priceVal) {
        if (!vId || priceVal === undefined) return;
        const pNum = Number(priceVal);
        if (!isFinite(pNum) || pNum < 0) return;
        if (Array.isArray(currentState.variants)) {
          for (let vi = 0; vi < currentState.variants.length; vi++) {
            if (currentState.variants[vi] && currentState.variants[vi].id === vId) {
              currentState.variants[vi].priceUsd = pNum;
            }
          }
        }
        if (Array.isArray(currentState.dishes)) {
          for (let di = 0; di < currentState.dishes.length; di++) {
            if (currentState.dishes[di] && currentState.dishes[di].id === vId) {
              currentState.dishes[di].priceUsd = pNum;
            }
          }
        }
      }

      function applyInventoryPriceDelta(iId, priceVal) {
        if (!iId || priceVal === undefined) return;
        const pNum = Number(priceVal);
        if (!isFinite(pNum) || pNum < 0) return;
        if (Array.isArray(currentState.inventory)) {
          for (let ii = 0; ii < currentState.inventory.length; ii++) {
            if (currentState.inventory[ii] && currentState.inventory[ii].id === iId) {
              currentState.inventory[ii].priceUsd = pNum;
            }
          }
        }
      }

      if (payload.kind === 'variant' && payload.id && payload.priceUsd !== undefined) {
        applyVariantPriceDelta(payload.id, payload.priceUsd);
      } else if (payload.kind === 'inventory' && payload.id && payload.priceUsd !== undefined) {
        applyInventoryPriceDelta(payload.id, payload.priceUsd);
      }
      if (Array.isArray(payload.dishUpdates)) {
        for (let du = 0; du < payload.dishUpdates.length; du++) {
          const dUpd = payload.dishUpdates[du];
          if (dUpd) applyVariantPriceDelta(dUpd.id || dUpd.variantId, dUpd.priceUsd);
        }
      }
      if (Array.isArray(payload.invUpdates)) {
        for (let iu = 0; iu < payload.invUpdates.length; iu++) {
          const iUpd = payload.invUpdates[iu];
          if (iUpd) applyInventoryPriceDelta(iUpd.id || iUpd.invId, iUpd.priceUsd);
        }
      }
      syncUnifiedInventory(currentState);
      break;
    }

    case 'USER_CHANGED': {
      if (Array.isArray(payload.users)) {
        currentState.users = payload.users;
      }
      break;
    }

    case 'PAGO_MOVIL_STATUS_CHANGED': {
      const targetSaleId = payload.saleId || payload.id;
      const targetRef = payload.paymentRef !== undefined ? String(payload.paymentRef) : '';
      const targetPayId = payload.paymentId ? String(payload.paymentId) : '';
      const newStatus = payload.newStatus || payload.verifyStatus || 'CONCILIADO';
      const reason = payload.reason || '';

      if (targetSaleId && Array.isArray(currentState.sales)) {
        for (let si = 0; si < currentState.sales.length; si++) {
          const saleObj = currentState.sales[si];
          if (!saleObj || saleObj.id !== targetSaleId || !Array.isArray(saleObj.payments)) continue;
          for (let pi = 0; pi < saleObj.payments.length; pi++) {
            const pObj = saleObj.payments[pi];
            if (!pObj || pObj.method !== 'Pago Móvil') continue;
            const refMatches = targetPayId
              ? (pObj.id === targetPayId)
              : (!targetRef || String(pObj.ref || '') === targetRef);
            if (refMatches) {
              pObj.verifyStatus = newStatus;
              pObj.verified = (newStatus === 'CONCILIADO');
              pObj.reviewNotes = reason;
              pObj.reviewedAt = eventTs;
              pObj.reviewedBy = eventUser;
              if (!targetPayId && targetRef) break;
            }
          }
          break;
        }
      }
      break;
    }

    case 'SETTINGS_UPDATED': {
      if (!currentState.settings || typeof currentState.settings !== 'object') {
        currentState.settings = {};
      }
      if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.posTerminals)) {
          currentState.posTerminals = payload.posTerminals;
        }
        if (Array.isArray(payload.pagoMovilAccounts)) {
          currentState.pagoMovilAccounts = payload.pagoMovilAccounts;
        }
        const settingsDelta = Object.assign({}, payload);
        delete settingsDelta.posTerminals;
        delete settingsDelta.pagoMovilAccounts;
        if (settingsDelta.fiscalConfig && typeof settingsDelta.fiscalConfig === 'object') {
          currentState.settings.fiscalConfig = Object.assign({}, currentState.settings.fiscalConfig || {}, settingsDelta.fiscalConfig);
          delete settingsDelta.fiscalConfig;
        }
        Object.assign(currentState.settings, settingsDelta);
      }
      break;
    }

    case 'FISCAL_DOC_ISSUED': {
      // Vincular datos fiscales emitidos por máquina homologada
      if (payload.saleId) {
        for (let i = 0; i < currentState.sales.length; i++) {
          if (currentState.sales[i].id === payload.saleId) {
            currentState.sales[i].fiscalInvoiceNo = payload.invoiceNo;
            currentState.sales[i].fiscalControlNo = payload.controlNo;
            currentState.sales[i].fiscalSerial = payload.serial;
            currentState.sales[i].fiscalZNo = payload.zNo;
            currentState.sales[i].fiscalIssuedAt = eventTs;
            break;
          }
        }
      }
      break;
    }

    default: {
      // Manejo de eventos personalizados o actualización de estado genérica
      if (payload && payload.stateUpdates && typeof payload.stateUpdates === 'object') {
        Object.assign(currentState, payload.stateUpdates);
      }
      break;
    }
  }

  lastAppliedSeq = event.seq || lastAppliedSeq;
  currentState.lastSeq = lastAppliedSeq;
  currentState.updatedAt = eventTs;

  // Si no estamos en modo replay de inicio, evaluar guardado de snapshot
  if (!isReplay) {
    eventsSinceSnapshot += 1;
    if (eventsSinceSnapshot >= SNAPSHOT_INTERVAL_EVENTS || eventType === 'SHIFT_CLOSED') {
      saveSnapshot();
    }
  }

  return currentState;
}

/**
 * Guarda el snapshot del estado atómicamente con fsync y renameSync.
 */
function saveSnapshot() {
  if (!journalRef || !currentState) return false;

  const dataDir = journalRef.getDataDir();
  const tmpPath = path.join(dataDir, 'snapshot.json.tmp');
  const finalPath = path.join(dataDir, 'snapshot.json');

  const snapshotData = {
    version: '8.0.0',
    lastSeq: lastAppliedSeq,
    timestamp: new Date().toISOString(),
    state: currentState
  };

  try {
    const jsonStr = JSON.stringify(snapshotData, null, 2);
    // Escribir con descriptor 'w' y forzar fsync antes de cerrar
    const fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, jsonStr, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Renombrado atómico en el sistema de archivos
    fs.renameSync(tmpPath, finalPath);
    eventsSinceSnapshot = 0;
    return true;
  } catch (err) {
    console.error('[State] Error al guardar snapshot atómico:', err.message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (e) {
      // ignore
    }
    return false;
  }
}

/**
 * Inicializa el estado cargando el último snapshot y reproduciendo eventos posteriores del journal.
 * 
 * @param {Object} journalInstance Instancia del módulo journal
 */
function init(journalInstance) {
  journalRef = journalInstance;
  eventsSinceSnapshot = 0;

  const dataDir = journalRef.getDataDir();
  const snapshotPath = path.join(dataDir, 'snapshot.json');

  let snapshotLoaded = false;
  let snapshotSeq = 0;

  if (fs.existsSync(snapshotPath)) {
    try {
      const raw = fs.readFileSync(snapshotPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.state && typeof parsed.lastSeq === 'number') {
        currentState = parsed.state;
        snapshotSeq = parsed.lastSeq;
        lastAppliedSeq = snapshotSeq;
        snapshotLoaded = true;
      }
    } catch (err) {
      console.warn('[State] No se pudo leer snapshot previo (se reconstruirá desde journal):', err.message);
    }
  }

  if (!snapshotLoaded) {
    currentState = createDefaultState();
    snapshotSeq = 0;
    lastAppliedSeq = 0;
  }

  // Leer y reproducir todos los eventos ocurridos DESPUÉS del snapshot
  const pendingEvents = journalRef.readEventsSince(snapshotSeq);
  for (let i = 0; i < pendingEvents.length; i++) {
    applyEvent(pendingEvents[i], true);
  }

  lastAppliedSeq = journalRef.getLastSeq();
  currentState.lastSeq = lastAppliedSeq;

  // Si no había snapshot y hay eventos o estado inicial, guardar snapshot base
  if (!snapshotLoaded) {
    saveSnapshot();
  }

  return currentState;
}

/**
 * Retorna el estado actual materializado en memoria.
 */
function getState() {
  if (!currentState) {
    currentState = createDefaultState();
  }
  return currentState;
}

/**
 * Retorna la última secuencia de evento aplicada al estado.
 */
function getLastSeq() {
  return lastAppliedSeq;
}

/**
 * Reemplaza o reinicia el estado.
 */
function resetState(newState) {
  currentState = newState || createDefaultState();
  currentState.lastSeq = lastAppliedSeq;
  saveSnapshot();
  return currentState;
}

module.exports = {
  init: init,
  applyEvent: applyEvent,
  getState: getState,
  getLastSeq: getLastSeq,
  saveSnapshot: saveSnapshot,
  resetState: resetState,
  createDefaultState: createDefaultState
};
