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
    version: '5.0.0',
    settings: {
      storeName: 'MI TIENDA POS · Restaurante & Abasto',
      rif: 'J-50128940-1',
      phone: '0412-0000000',
      address: 'Mostrador Principal & Cocina Venezolana',
      rateBcv: 42.85,
      rateEur: 46.60,
      rateUsdt: 51.40,
      lastRateSync: new Date().toISOString(),
      fiscalMode: 'INTERNO'
    },
    inventory: [],
    dishes: [],
    families: [],
    products: [],
    variants: [],
    modifierGroups: [],
    retailItems: [],
    sales: [],
    expenses: [],
    purchases: [],
    wasteRecords: [],
    kardex: [],
    shifts: [],
    heldOrders: [],
    users: [],
    posTerminals: [],
    pagoMovilAccounts: [],
    lastSeq: 0,
    updatedAt: new Date().toISOString()
  };
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

      // Descontar inventario si viene items
      if (Array.isArray(sale.items)) {
        for (let i = 0; i < sale.items.length; i++) {
          const item = sale.items[i];
          const qty = Number(item.quantity || item.qty || 1);
          const itemId = item.id || item.productId || item.retailItemId;

          // Descontar de retailItems o inventory si coincide
          if (itemId) {
            for (let j = 0; j < currentState.inventory.length; j++) {
              if (currentState.inventory[j].id === itemId) {
                const prev = Number(currentState.inventory[j].stock || 0);
                currentState.inventory[j].stock = Math.max(0, prev - qty);
                break;
              }
            }
          }

          // Asentar Kardex de venta
          currentState.kardex.push({
            id: 'kdx_' + event.seq + '_' + i,
            seq: event.seq,
            type: 'VENTA',
            itemId: itemId || 'prod_desconocido',
            itemName: item.name || 'Producto vendido',
            qty: -qty,
            unit: item.unit || 'und',
            docRef: sale.saleNumber || sale.id,
            user: eventUser,
            ts: eventTs
          });
        }
      }
      break;
    }

    case 'SALE_VOIDED': {
      const saleId = payload.saleId || payload.id;
      for (let i = 0; i < currentState.sales.length; i++) {
        if (currentState.sales[i].id === saleId) {
          currentState.sales[i].voided = true;
          currentState.sales[i].voidReason = payload.reason || 'Anulación de venta';
          currentState.sales[i].voidedAt = eventTs;
          currentState.sales[i].voidedBy = eventUser;

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
      currentState.expenses.push(expense);
      break;
    }

    case 'PURCHASE_RECEIVED': {
      const purchase = Object.assign({}, payload);
      purchase.id = purchase.id || event.id;
      purchase.seq = event.seq;
      purchase.ts = purchase.ts || eventTs;
      purchase.user = eventUser;
      currentState.purchases.push(purchase);

      // Si incluye renglones de mercancía, sumar al stock
      if (Array.isArray(purchase.items)) {
        for (let i = 0; i < purchase.items.length; i++) {
          const item = purchase.items[i];
          const qty = Number(item.quantity || item.qty || 0);
          const itemId = item.id || item.productId;

          if (itemId) {
            for (let j = 0; j < currentState.inventory.length; j++) {
              if (currentState.inventory[j].id === itemId) {
                const prev = Number(currentState.inventory[j].stock || 0);
                currentState.inventory[j].stock = prev + qty;
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
            docRef: purchase.invoiceNo || purchase.id,
            user: eventUser,
            ts: eventTs
          });
        }
      }
      break;
    }

    case 'WASTE_RECORDED': {
      const waste = Object.assign({}, payload);
      waste.id = waste.id || event.id;
      waste.seq = event.seq;
      waste.ts = waste.ts || eventTs;
      waste.user = eventUser;
      currentState.wasteRecords.push(waste);

      const wasteQty = Number(waste.quantity || waste.qty || 0);
      if (waste.itemId) {
        for (let j = 0; j < currentState.inventory.length; j++) {
          if (currentState.inventory[j].id === waste.itemId) {
            const prev = Number(currentState.inventory[j].stock || 0);
            currentState.inventory[j].stock = Math.max(0, prev - wasteQty);
            break;
          }
        }
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
        for (let j = 0; j < currentState.inventory.length; j++) {
          if (currentState.inventory[j].id === itemId) {
            currentState.inventory[j].stock = newStock;
            break;
          }
        }
      }

      currentState.kardex.push({
        id: 'kdx_audit_' + event.seq,
        seq: event.seq,
        type: 'AJUSTE_AUDITORIA',
        itemId: itemId,
        itemName: adj.itemName || 'Ajuste de inventario',
        qty: diff,
        unit: adj.unit || 'und',
        reason: adj.justification || 'Auditoría física ciega',
        user: eventUser,
        ts: eventTs
      });
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
      // Actualizar catálogos si vienen en el payload
      if (Array.isArray(payload.families)) currentState.families = payload.families;
      if (Array.isArray(payload.products)) currentState.products = payload.products;
      if (Array.isArray(payload.variants)) currentState.variants = payload.variants;
      if (Array.isArray(payload.modifierGroups)) currentState.modifierGroups = payload.modifierGroups;
      if (Array.isArray(payload.retailItems)) currentState.retailItems = payload.retailItems;
      if (Array.isArray(payload.inventory)) currentState.inventory = payload.inventory;
      if (Array.isArray(payload.dishes)) currentState.dishes = payload.dishes;
      break;
    }

    case 'USER_CHANGED': {
      if (Array.isArray(payload.users)) {
        currentState.users = payload.users;
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
    version: '5.0.0',
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
