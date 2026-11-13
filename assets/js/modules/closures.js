/* ==========================================================================
   MI-TIENDA-POS — modules/closures.js (Cuadre del Día, Conciliación y Reportes)
   ========================================================================== */
let currentCierreTab = 'DIARIO';
let currentCierreStep = 1;
let activeStep3Tab = 'ventas';

function esc(str) {
  if (window.MTP && typeof MTP.escapeHtml === 'function') return MTP.escapeHtml(str);
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalDateIso(dateObj) {
  if (window.MTP && typeof MTP.getLocalDateIso === 'function') return MTP.getLocalDateIso(dateObj);
  const ms = dateObj instanceof Date ? dateObj.getTime() : Date.now();
  return new Date(ms - 4 * 3600000).toISOString().slice(0, 10);
}

function getLocalMonthIso(dateObj) {
  if (window.MTP && typeof MTP.getLocalMonthIso === 'function') return MTP.getLocalMonthIso(dateObj);
  return getLocalDateIso(dateObj).slice(0, 7);
}

function getLocalYear(dateObj) {
  return Number(getLocalDateIso(dateObj).slice(0, 4)) || new Date().getFullYear();
}

function formatVetTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  }
}

function formatVetDateTime(dateObj) {
  try {
    return (dateObj || new Date()).toLocaleString('es-VE', { timeZone: 'America/Caracas' });
  } catch (_) {
    return (dateObj || new Date()).toLocaleString('es-VE');
  }
}

function getPuntoTerminalStats(termId) {
  const state = (window.MTP && MTP.state) ? MTP.state : {};
  const terms = state.posTerminals || [];
  const defaultTermId = (terms[0] && terms[0].id) ? terms[0].id : 'term-bancamiga';
  const out = { txCount: 0, totalBs: 0, totalUsd: 0 };
  (state.sales || []).forEach(s => {
    if (!s || s.voided) return;
    (s.payments || []).forEach(p => {
      if (!p || p.method !== 'Punto de Venta' || p.batchClosed) return;
      const pTermId = p.terminalId || defaultTermId;
      if (pTermId !== termId) return;
      out.txCount += 1;
      out.totalBs += Number(p.amountBs || 0);
      out.totalUsd += Number(p.amountUsd || 0);
    });
  });
  return out;
}

// Denominaciones reales venezolanas para la conciliación
const DENOM_USD = [100, 50, 20, 10, 5, 2, 1];
const DENOM_BS  = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.25, 0.10];

// Almacena lo contado físicamente por el cajero
let countedDenoms = {};

/* ========================================================================
   SELECTOR DE AÑO DINÁMICO (actual - 5 a actual + 1)
   ======================================================================== */
function populateYearSelect() {
  const ySel = document.getElementById('annualYearSelect');
  if (!ySel) return;
  const currentYear = getLocalYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 1;
  const currentVal = ySel.value || String(currentYear);
  ySel.innerHTML = '';
  for (let y = endYear; y >= startYear; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (String(y) === String(currentVal)) {
      opt.selected = true;
    }
    ySel.appendChild(opt);
  }
}

/* ========================================================================
   CAMBIO DE PESTAÑA PRINCIPAL (DIARIO, MENSUAL, ANUAL)
   ======================================================================== */
function switchCierreTab(tab) {
  currentCierreTab = tab;
  document.getElementById('tabBtnDiario').classList.toggle('active', tab === 'DIARIO');
  document.getElementById('tabBtnMensual').classList.toggle('active', tab === 'MENSUAL');
  document.getElementById('tabBtnAnual').classList.toggle('active', tab === 'ANUAL');

  document.getElementById('paneDiario').classList.toggle('active', tab === 'DIARIO');
  document.getElementById('paneMensual').classList.toggle('active', tab === 'MENSUAL');
  document.getElementById('paneAnual').classList.toggle('active', tab === 'ANUAL');

  // Control unificado de fecha
  const cDiario = document.getElementById('ctrlDiarioDate');
  const cMensual = document.getElementById('ctrlMensualDate');
  const cAnual = document.getElementById('ctrlAnualDate');
  const btnMain = document.getElementById('btnMainCierreAction');

  if (cDiario) cDiario.style.display = (tab === 'DIARIO') ? 'flex' : 'none';
  if (cMensual) cMensual.style.display = (tab === 'MENSUAL') ? 'flex' : 'none';
  if (cAnual) cAnual.style.display = (tab === 'ANUAL') ? 'flex' : 'none';

  if (btnMain) {
    if (tab === 'DIARIO') {
      btnMain.innerHTML = '🔒 Cerrar el Día y Guardar Acta';
      btnMain.style.display = '';
    } else if (tab === 'MENSUAL') {
      btnMain.innerHTML = '🔒 Guardar Acta Mensual';
      btnMain.style.display = '';
    } else {
      btnMain.innerHTML = '📄 Ver Resumen Anual';
      btnMain.style.display = '';
    }
  }

  if (tab === 'DIARIO') renderCierrePage();
  else if (tab === 'MENSUAL') renderMonthlyPane();
  else if (tab === 'ANUAL') renderAnnualPane();
}

function triggerCurrentCierreAction() {
  if (currentCierreTab === 'DIARIO') {
    openDailyClosureModal();
  } else if (currentCierreTab === 'MENSUAL') {
    saveMonthlyClosureAction();
  } else if (currentCierreTab === 'ANUAL') {
    openClosureReportModal('ANUAL');
  }
}

function setTodayFilter() {
  const inp = document.getElementById('dailyDateInput');
  if (inp) inp.value = getLocalDateIso();
  countedDenoms = {};
  renderCierrePage();
}

function onUnifiedDateChange() {
  countedDenoms = {};
  renderCierrePage();
}

/* ========================================================================
   PASOS DEL CIERRE DIARIO (PASO 1, PASO 2, PASO 3)
   ======================================================================== */
function switchCierreStep(step) {
  currentCierreStep = step;
  [1, 2, 3].forEach(s => {
    const btn = document.getElementById('cierreStepBtn' + s);
    const pane = document.getElementById('cierreStepPane' + s);
    const isActive = (s === step);
    if (btn) btn.classList.toggle('active', isActive);
    if (pane) pane.classList.toggle('active', isActive);
  });
}

/* ========================================================================
   PESTAÑAS INTERNAS DE PASO 3 (VENTAS, ACTAS, PUNTOS, PAGOS MÓVILES, GASTOS)
   ======================================================================== */
function switchStep3Tab(tabKey) {
  activeStep3Tab = tabKey;
  const tabs = ['ventas', 'actas', 'puntos', 'pagos-moviles', 'gastos'];
  const map = {
    'ventas': { btn: 'subtabBtnVentas', pane: 'subpaneVentas' },
    'actas': { btn: 'subtabBtnActas', pane: 'subpaneActas' },
    'puntos': { btn: 'subtabBtnPuntos', pane: 'subpanePuntos' },
    'pagos-moviles': { btn: 'subtabBtnPagosMoviles', pane: 'subpanePagosMoviles' },
    'gastos': { btn: 'subtabBtnGastos', pane: 'subpaneGastos' }
  };

  tabs.forEach(t => {
    const isCur = (t === tabKey);
    const b = document.getElementById(map[t].btn);
    const p = document.getElementById(map[t].pane);
    if (b) b.classList.toggle('active', isCur);
    if (p) p.classList.toggle('active', isCur);
  });
}

/* ========================================================================
   CONCILIACIÓN POR DENOMINACIÓN (USD Y BS)
   ======================================================================== */
function countUsdBills(d, stats) {
  if (!stats || !stats.sales) return 0;
  let count = 0;

  // 1. Pagos recibidos en USD
  stats.sales.forEach(s => {
    if (!s || s.voided) return;
    (s.payments || []).forEach(p => {
      const isUsd = (p.method === 'Efectivo USD' || (p.method && p.method.includes('USD') && !p.method.includes('Zelle')));
      if (!isUsd) return;

      if (p.bill && p.bill !== 'Exacto') {
        const num = Number(String(p.bill).replace(/[^0-9.]/g, ''));
        if (num === d) count += 1;
      } else {
        // Descomposición greedy de montos directos
        let rem = Math.floor(Number(p.amountUsd) || 0);
        for (let i = 0; i < DENOM_USD.length; i++) {
          const denom = DENOM_USD[i];
          const n = Math.floor(rem / denom);
          if (n > 0) {
            if (denom === d) count += n;
            rem -= n * denom;
          }
        }
      }
    });

    // 2. Vueltos dados en efectivo USD (restan de la gaveta)
    if (s.changeGiven && s.changeGiven.usdCashGiven > 0) {
      let rem = Math.floor(Number(s.changeGiven.usdCashGiven) || 0);
      for (let i = 0; i < DENOM_USD.length; i++) {
        const denom = DENOM_USD[i];
        const n = Math.floor(rem / denom);
        if (n > 0) {
          if (denom === d) count -= n;
          rem -= n * denom;
        }
      }
    }
  });

  // 3. Gastos pagados en efectivo USD
  (stats.expenses || []).forEach(e => {
    if (e.paymentSource === 'Efectivo USD') {
      let rem = Math.floor(Number(e.amountUsd) || 0);
      for (let i = 0; i < DENOM_USD.length; i++) {
        const denom = DENOM_USD[i];
        const n = Math.floor(rem / denom);
        if (n > 0) {
          if (denom === d) count -= n;
          rem -= n * denom;
        }
      }
    }
  });

  return Math.max(0, count);
}

function countBsCoins(d, stats) {
  if (!stats || !stats.sales) return 0;
  let count = 0;

  // 1. Pagos recibidos en Bs
  stats.sales.forEach(s => {
    if (!s || s.voided) return;
    (s.payments || []).forEach(p => {
      const isBs = (p.method === 'Efectivo Bs' || (p.method && p.method.includes('Efectivo') && p.amountBs > 0 && !p.method.includes('USD')));
      if (!isBs) return;

      if (p.bill && p.bill !== 'Exacto') {
        const num = Number(String(p.bill).replace(/[^0-9.]/g, ''));
        if (num === d) count += 1;
      } else if (window.MTPChange && window.MTPChange.breakDownBs) {
        const breakdown = window.MTPChange.breakDownBs(p.amountBs);
        breakdown.forEach(b => {
          if (b.denom === d) count += b.count;
        });
      }
    });

    // 2. Vueltos dados en Bs efectivo
    if (s.changeGiven && s.changeGiven.bsCashGiven > 0 && window.MTPChange && window.MTPChange.breakDownBs) {
      const breakdown = window.MTPChange.breakDownBs(s.changeGiven.bsCashGiven);
      breakdown.forEach(b => {
        if (b.denom === d) count -= b.count;
      });
    }
  });

  // 3. Gastos pagados en efectivo Bs
  (stats.expenses || []).forEach(e => {
    if (e.paymentSource === 'Efectivo Bs' && window.MTPChange && window.MTPChange.breakDownBs) {
      const breakdown = window.MTPChange.breakDownBs(e.amountBs);
      breakdown.forEach(b => {
        if (b.denom === d) count -= b.count;
      });
    }
  });

  return Math.max(0, count);
}

function renderDenominations(stats) {
  const tbody = document.querySelector('#tblDenominaciones tbody');
  if (!tbody) return;
  const rows = [];

  let sysTotalUsd = 0;
  DENOM_USD.forEach(d => {
    const sys = countUsdBills(d, stats);
    sysTotalUsd += (sys * d);
    const key = 'USD:' + d;
    const countedVal = (countedDenoms[key] !== undefined && countedDenoms[key] !== null) ? countedDenoms[key] : '';
    rows.push(`<tr>
      <td><span class="badge badge-green">US$</span></td>
      <td><strong>$${d}</strong></td>
      <td class="tabular-nums">${sys}</td>
      <td>
        <input class="input tabular-nums" type="number" min="0" data-denom="${key}"
          value="${countedVal}" placeholder="0" style="width:90px;font-weight:700;font-size:14px"
          oninput="onDenomInputChange(this, 'USD', ${d}, ${sys})">
      </td>
      <td class="denom-diff tabular-nums" data-for="${key}">—</td>
    </tr>`);
  });

  let sysTotalBs = 0;
  DENOM_BS.forEach(d => {
    const sys = countBsCoins(d, stats);
    sysTotalBs += (sys * d);
    const key = 'BS:' + d;
    const countedVal = (countedDenoms[key] !== undefined && countedDenoms[key] !== null) ? countedDenoms[key] : '';
    rows.push(`<tr>
      <td><span class="badge badge-yellow">Bs</span></td>
      <td><strong>Bs ${d.toFixed(2)}</strong></td>
      <td class="tabular-nums">${sys}</td>
      <td>
        <input class="input tabular-nums" type="number" min="0" step="1" data-denom="${key}"
          value="${esc(countedVal)}" placeholder="0" style="width:90px;font-weight:700;font-size:14px"
          oninput="onDenomInputChange(this, 'BS', ${d}, ${sys})">
      </td>
      <td class="denom-diff tabular-nums" data-for="${key}">—</td>
    </tr>`);
  });

  tbody.innerHTML = rows.join('');

  const expectedUsd = (stats && typeof stats.netDrawerUsd === 'number') ? stats.netDrawerUsd : sysTotalUsd;
  const expectedBs = (stats && typeof stats.netDrawerBs === 'number') ? stats.netDrawerBs : sysTotalBs;
  const usdDiffNote = expectedUsd - sysTotalUsd;
  const bsDiffNote = expectedBs - sysTotalBs;

  const elSysUsd = document.getElementById('denomSysTotalUsd');
  if (elSysUsd) {
    elSysUsd.innerHTML = `<strong>${MTP.fmtUSD(expectedUsd)}</strong>${
      Math.abs(usdDiffNote) >= 0.01
        ? `<div style="font-size:12px;color:var(--txt-3);font-weight:600">Billetes enteros: ${MTP.fmtUSD(sysTotalUsd)} · Fracción/centavos: ${usdDiffNote >= 0 ? '+' : ''}${MTP.fmtUSD(usdDiffNote)}</div>`
        : ''
    }`;
  }
  const elSysBs = document.getElementById('denomSysTotalBs');
  if (elSysBs) {
    elSysBs.innerHTML = `<strong>${MTP.fmtBsRaw(expectedBs)}</strong>${
      Math.abs(bsDiffNote) >= 0.01
        ? `<div style="font-size:12px;color:var(--txt-3);font-weight:600">Desglose piezas: ${MTP.fmtBsRaw(sysTotalBs)} · Ajuste/redondeo (0,50/0,05 Bs): ${bsDiffNote >= 0 ? '+' : ''}${MTP.fmtBsRaw(bsDiffNote)}</div>`
        : ''
    }`;
  }

  // Si había valores previos, actualizar las celdas de diferencia
  DENOM_USD.forEach(d => {
    const key = 'USD:' + d;
    const sys = countUsdBills(d, stats);
    updateDenomDiffCell(key, 'USD', d, sys);
  });
  DENOM_BS.forEach(d => {
    const key = 'BS:' + d;
    const sys = countBsCoins(d, stats);
    updateDenomDiffCell(key, 'BS', d, sys);
  });

  updateDenomSummary(stats);
}

function onDenomInputChange(input, currency, denom, sysCount) {
  const key = currency + ':' + denom;
  const valStr = input.value.trim();
  if (valStr === '') {
    delete countedDenoms[key];
  } else {
    countedDenoms[key] = parseFloat(valStr) || 0;
  }
  updateDenomDiffCell(key, currency, denom, sysCount);

  const dateInp = document.getElementById('dailyDateInput');
  const selectedDate = (dateInp && dateInp.value) ? dateInp.value : getLocalDateIso();
  const stats = MTP.getPeriodAnalytics('DAY', selectedDate);
  updateDenomSummary(stats);
}

function updateDenomDiffCell(key, currency, denom, sysCount) {
  const cell = document.querySelector(`.denom-diff[data-for="${key}"]`);
  if (!cell) return;
  if (countedDenoms[key] === undefined) {
    cell.textContent = '—';
    cell.style.color = '';
    return;
  }
  const counted = countedDenoms[key];
  const diff = counted - sysCount;
  if (Math.abs(diff) < 0.001) {
    cell.innerHTML = '<span style="color:#059669;font-weight:800">✔ Exacto (0)</span>';
  } else if (diff > 0) {
    const moneyDiff = currency === 'USD' ? MTP.fmtUSD(diff * denom) : MTP.fmtBsRaw(diff * denom);
    cell.innerHTML = `<span style="color:#2563eb;font-weight:800">+${diff} (${moneyDiff})</span>`;
  } else {
    const moneyDiff = currency === 'USD' ? MTP.fmtUSD(Math.abs(diff) * denom) : MTP.fmtBsRaw(Math.abs(diff) * denom);
    cell.innerHTML = `<span style="color:#dc2626;font-weight:800">${diff} (-${moneyDiff})</span>`;
  }
}

function updateDenomSummary(stats) {
  let countedUsdTotal = 0;
  let countedBsTotal = 0;
  let hasCountedUsd = false;
  let hasCountedBs = false;

  DENOM_USD.forEach(d => {
    const k = 'USD:' + d;
    if (countedDenoms[k] !== undefined) {
      hasCountedUsd = true;
      countedUsdTotal += (countedDenoms[k] * d);
    }
  });

  DENOM_BS.forEach(d => {
    const k = 'BS:' + d;
    if (countedDenoms[k] !== undefined) {
      hasCountedBs = true;
      countedBsTotal += (countedDenoms[k] * d);
    }
  });

  const elCountedUsd = document.getElementById('denomCountedTotalUsd');
  const elDiffUsd = document.getElementById('denomDiffTotalUsd');
  const elCountedBs = document.getElementById('denomCountedTotalBs');
  const elDiffBs = document.getElementById('denomDiffTotalBs');
  const badge = document.getElementById('denomSummaryBadge');

  const expectedUsd = stats.netDrawerUsd;
  const expectedBs = stats.netDrawerBs;

  if (elCountedUsd) elCountedUsd.textContent = hasCountedUsd ? MTP.fmtUSD(countedUsdTotal) : '—';
  if (elCountedBs) elCountedBs.textContent = hasCountedBs ? MTP.fmtBsRaw(countedBsTotal) : '—';

  const diffUsd = countedUsdTotal - expectedUsd;
  const diffBs = countedBsTotal - expectedBs;

  if (elDiffUsd) {
    if (!hasCountedUsd) {
      elDiffUsd.textContent = '—';
      elDiffUsd.style.color = '';
    } else if (Math.abs(diffUsd) < 0.05) {
      elDiffUsd.innerHTML = '<span style="color:#059669;font-weight:800">✔ $0.00</span>';
    } else {
      const sign = diffUsd > 0 ? '+' : '';
      elDiffUsd.innerHTML = `<span style="color:${diffUsd > 0 ? '#2563eb' : '#dc2626'};font-weight:800">${sign}${MTP.fmtUSD(diffUsd)}</span>`;
    }
  }

  if (elDiffBs) {
    if (!hasCountedBs) {
      elDiffBs.textContent = '—';
      elDiffBs.style.color = '';
    } else if (Math.abs(diffBs) < 0.50) {
      elDiffBs.innerHTML = '<span style="color:#059669;font-weight:800">✔ 0,00 Bs</span>';
    } else {
      const sign = diffBs > 0 ? '+' : '';
      elDiffBs.innerHTML = `<span style="color:${diffBs > 0 ? '#2563eb' : '#dc2626'};font-weight:800">${sign}${MTP.fmtBsRaw(diffBs)}</span>`;
    }
  }

  if (badge) {
    if (!hasCountedUsd && !hasCountedBs) {
      badge.className = 'badge badge-yellow';
      badge.textContent = 'Sin contar';
    } else {
      const usdOk = !hasCountedUsd || Math.abs(diffUsd) < 0.05;
      const bsOk = !hasCountedBs || Math.abs(diffBs) < 0.50;
      if (usdOk && bsOk) {
        badge.className = 'badge badge-green spring-pop';
        badge.textContent = '✔ Gaveta Cuadrada Exacta ($0.00)';
      } else {
        badge.className = 'badge badge-red';
        const parts = [];
        if (hasCountedUsd && Math.abs(diffUsd) >= 0.05) parts.push(`USD: ${diffUsd > 0 ? '+' : ''}${MTP.fmtUSD(diffUsd)}`);
        if (hasCountedBs && Math.abs(diffBs) >= 0.50) parts.push(`Bs: ${diffBs > 0 ? '+' : ''}${MTP.fmtBsRaw(diffBs)}`);
        badge.textContent = '⚠️ Diferencia: ' + parts.join(' · ');
      }
    }
  }
}

/* ========================================================================
   DESGLOSE DE COCINA VS TIENDA
   ======================================================================== */
function renderKitchenVsRetailCard(containerId, stats) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const famHtml = (stats.kitchenByFamily || []).map(f => `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:700;color:#92400e">${esc(f.name)}</span>
      <strong class="tabular-nums" style="color:#78350f">${f.qty} platos (${MTP.fmtUSD(f.salesUsd)})</strong>
    </div>
  `).join('');

  const ingHtml = (stats.kitchenIngredientsUsed || []).length
    ? stats.kitchenIngredientsUsed.map(i => `
        <span class="badge badge-yellow tabular-nums" style="font-size:12px;padding:3px 8px">
          ${esc(i.name)}: <strong>-${MTP.fmtWeight(i.qtyUsed, i.unit)}</strong> (${MTP.fmtUSD(i.costUsd)})
        </span>
      `).join(' ')
    : '<span style="color:#64748b;font-size:12.5px">Sin consumo de ingredientes registrado en este período.</span>';

  el.innerHTML = `
    <div class="grid-2" style="margin-bottom:10px">
      <div style="background:#f8fafc;border:1px solid var(--line);border-left:4px solid #f59e0b;border-radius:6px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="font-size:14px;color:#0f172a">🥟 1. Comida Preparada al Día (Cocina)</strong>
          <span class="badge badge-yellow tabular-nums">${stats.kitchenPreparedQty} platos preparados</span>
        </div>
        <div style="font-size:13px;color:var(--txt-2);margin-bottom:8px">
          Ventas Cocina (sin IVA): <strong>${MTP.fmtUSD(stats.kitchenSalesUsd)}</strong> ·
          Costo Ingredientes Usados: <strong class="money-out">-${MTP.fmtUSD(stats.kitchenCostUsd)}</strong> ·
          Ganancia Cocina: <strong class="money-in">+${MTP.fmtUSD(stats.kitchenProfitUsd)}</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${famHtml}
        </div>
      </div>

      <div style="background:#f8fafc;border:1px solid var(--line);border-left:4px solid #2563eb;border-radius:6px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="font-size:14px;color:#0f172a">🛒 2. Mercancía Empaquetada (Víveres, Bebidas, Snacks)</strong>
          <span class="badge badge-blue tabular-nums">${stats.retailSoldQty} unidades vendidas</span>
        </div>
        <div style="font-size:13px;color:var(--txt-2);margin-bottom:8px">
          Ventas Mostrador (sin IVA): <strong>${MTP.fmtUSD(stats.retailSalesUsd)}</strong> ·
          Costo Mercancía: <strong class="money-out">-${MTP.fmtUSD(stats.retailCostUsd)}</strong> ·
          Ganancia Mostrador: <strong class="money-in">+${MTP.fmtUSD(stats.retailProfitUsd)}</strong>
        </div>
        <div style="font-size:12.5px;color:#334155">
          ${(stats.retailItemsList || []).slice(0, 5).map(r => `<div>• <strong>${r.qty}x</strong> ${esc(r.name)} (${MTP.fmtUSD(r.salesUsd)})</div>`).join('') || 'Sin mercancía empaquetada vendida en este período.'}
        </div>
      </div>
    </div>
    <div style="padding-top:8px;border-top:1px dashed var(--line);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <strong style="font-size:12.5px">🍲 Kilos / Gramos de Ingredientes de Cocina consumidos por la comida preparada:</strong>
      ${ingHtml}
    </div>
  `;
}

/* ========================================================================
   RENDER PRINCIPAL DE LA PÁGINA (CIERRE DIARIO)
   ======================================================================== */
function renderCierrePage() {
  const dateInp = document.getElementById('dailyDateInput');
  if (dateInp && !dateInp.value) {
    dateInp.value = getLocalDateIso();
  }
  const selectedDate = (dateInp && dateInp.value) ? dateInp.value : getLocalDateIso();
  const stats = MTP.getPeriodAnalytics('DAY', selectedDate);
  const bcv = stats.bcv;

  // Actualizar píldora BCV
  const pill = document.getElementById('topRatePill');
  if (pill) pill.textContent = 'BCV: ' + bcv.toFixed(2) + ' Bs';

  // ----------------------------------------------------------------------
  // PASO 1: ¿Cuánto vendí? (4 tarjetas KPI + desglose cocina vs tienda)
  // ----------------------------------------------------------------------
  const totalsGrid = document.getElementById('cierreTotalsGrid');
  if (totalsGrid) {
    if (window.MTPUI && window.MTPUI.statCard) {
      totalsGrid.innerHTML =
        MTPUI.statCard({
          label: 'Vendido (' + stats.ordersCount + ' órdenes)',
          value: MTP.fmtUSD(stats.grossSalesUsd),
          sub: MTP.fmtBsRaw(stats.grossSalesBs),
          tone: 'in'
        }) +
        MTPUI.statCard({
          label: 'IVA 16% del Día',
          value: MTP.fmtUSD(stats.ivaUsd),
          sub: 'Base: ' + MTP.fmtUSD(stats.baseG16Usd) + ' · Exento: ' + MTP.fmtUSD(stats.exentoUsd),
          tone: 'cash'
        }) +
        MTPUI.statCard({
          label: 'Compras y Gastos',
          value: '-' + MTP.fmtUSD(stats.totalExpensesUsd),
          sub: stats.expenses.length + ' salidas registradas',
          tone: 'out'
        }) +
        MTPUI.statCard({
          label: 'Ganancia Limpia (Sin IVA)',
          value: '+' + MTP.fmtUSD(stats.netOperatingProfitUsd),
          sub: '+' + MTP.fmtBsRaw(stats.netOperatingProfitUsd * bcv),
          tone: 'in'
        });
    } else {
      totalsGrid.innerHTML = `
        <div class="stat-card tone-in">
          <span class="stat-l">Vendido (${stats.ordersCount} órdenes)</span>
          <strong class="stat-n tabular-nums money-in">${MTP.fmtUSD(stats.grossSalesUsd)}</strong>
          <span class="stat-sub tabular-nums">${MTP.fmtBsRaw(stats.grossSalesBs)}</span>
        </div>
        <div class="stat-card tone-cash">
          <span class="stat-l">IVA 16% del Día</span>
          <strong class="stat-n tabular-nums" style="color:#b45309">${MTP.fmtUSD(stats.ivaUsd)}</strong>
          <span class="stat-sub tabular-nums">Base: ${MTP.fmtUSD(stats.baseG16Usd)} · Exento: ${MTP.fmtUSD(stats.exentoUsd)}</span>
        </div>
        <div class="stat-card tone-out">
          <span class="stat-l">Compras y Gastos</span>
          <strong class="stat-n tabular-nums money-out">-${MTP.fmtUSD(stats.totalExpensesUsd)}</strong>
          <span class="stat-sub tabular-nums">${stats.expenses.length} salidas registradas</span>
        </div>
        <div class="stat-card tone-in">
          <span class="stat-l">Ganancia Limpia (Sin IVA)</span>
          <strong class="stat-n tabular-nums money-bs">+${MTP.fmtUSD(stats.netOperatingProfitUsd)}</strong>
          <span class="stat-sub tabular-nums">+${MTP.fmtBsRaw(stats.netOperatingProfitUsd * bcv)}</span>
        </div>
      `;
    }
  }

  renderKitchenVsRetailCard('dailyKitchenVsRetailBox', stats);

  // ----------------------------------------------------------------------
  // PASO 2: ¿Cuánto hay? (Dinero en mano + Conciliación de gaveta)
  // ----------------------------------------------------------------------
  const drawerGrid = document.getElementById('netDrawerGrid');
  if (drawerGrid) {
    if (window.MTPUI && window.MTPUI.statCard) {
      drawerGrid.innerHTML =
        MTPUI.statCard({
          label: 'EFECTIVO USD EN GAVETA',
          value: MTP.fmtUSD(stats.netDrawerUsd),
          sub: 'Entró: $' + stats.inUsdCash.toFixed(2) + ' − Vueltos: $' + stats.outChangeUsdCash.toFixed(2) + ' − Gastos: $' + stats.expUsdCash.toFixed(2),
          tone: 'in'
        }) +
        MTPUI.statCard({
          label: 'EFECTIVO BS EN GAVETA',
          value: MTP.fmtBsRaw(stats.netDrawerBs),
          sub: 'Entró: ' + stats.inBsCash.toFixed(2) + ' Bs − Vueltos: ' + stats.outChangeBsCash.toFixed(2) + ' Bs',
          tone: 'cash'
        }) +
        MTPUI.statCard({
          label: 'SALDO NETO PAGO MÓVIL',
          value: MTP.fmtBsRaw(stats.netBankPmBs),
          sub: 'Entró: ' + stats.inPmBs.toFixed(2) + ' Bs − Vueltos PM: ' + stats.outChangePmBs.toFixed(2) + ' Bs',
          tone: 'info'
        }) +
        MTPUI.statCard({
          label: 'PUNTO DE VENTA / BIOPAGO',
          value: MTP.fmtBsRaw(stats.inPuntoBs),
          sub: 'Equiv: ' + MTP.fmtUSD(bcv > 0 ? stats.inPuntoBs / bcv : 0) + (stats.inZelleUsd > 0 ? ' · Zelle: ' + MTP.fmtUSD(stats.inZelleUsd) : ''),
          tone: 'default'
        });
    } else {
      drawerGrid.innerHTML = `
        <div class="stat-card tone-in">
          <span class="stat-l">EFECTIVO USD EN GAVETA</span>
          <strong class="stat-n tabular-nums money-in">${MTP.fmtUSD(stats.netDrawerUsd)}</strong>
          <span class="stat-sub tabular-nums">Entró: $${stats.inUsdCash.toFixed(2)} − Vueltos: $${stats.outChangeUsdCash.toFixed(2)} − Gastos: $${stats.expUsdCash.toFixed(2)}</span>
        </div>
        <div class="stat-card tone-cash">
          <span class="stat-l">EFECTIVO BS EN GAVETA</span>
          <strong class="stat-n tabular-nums money-bs">${MTP.fmtBsRaw(stats.netDrawerBs)}</strong>
          <span class="stat-sub tabular-nums">Entró: ${stats.inBsCash.toFixed(2)} Bs − Vueltos: ${stats.outChangeBsCash.toFixed(2)} Bs</span>
        </div>
        <div class="stat-card tone-info">
          <span class="stat-l">SALDO NETO PAGO MÓVIL</span>
          <strong class="stat-n tabular-nums" style="color:var(--info)">${MTP.fmtBsRaw(stats.netBankPmBs)}</strong>
          <span class="stat-sub tabular-nums">Entró: ${stats.inPmBs.toFixed(2)} Bs − Vueltos PM: ${stats.outChangePmBs.toFixed(2)} Bs</span>
        </div>
        <div class="stat-card">
          <span class="stat-l">PUNTO DE VENTA / BIOPAGO</span>
          <strong class="stat-n tabular-nums">${MTP.fmtBsRaw(stats.inPuntoBs)}</strong>
          <span class="stat-sub tabular-nums">Equiv: ${MTP.fmtUSD(bcv > 0 ? stats.inPuntoBs / bcv : 0)}${stats.inZelleUsd > 0 ? ' · Zelle: ' + MTP.fmtUSD(stats.inZelleUsd) : ''}</span>
        </div>
      `;
    }
  }

  renderDenominations(stats);

  // ----------------------------------------------------------------------
  // PASO 3: ¿Cuadra? (Tablas en pestañas internas)
  // ----------------------------------------------------------------------

  // 1. Ventas del día
  const salesTable = document.getElementById('cierreSalesTable');
  if (salesTable) {
    salesTable.innerHTML = stats.sales.length
      ? stats.sales.map(s => {
          const timeStr = formatVetTime(s.createdAt);
          const subUsd = s.subtotalUsd != null ? s.subtotalUsd : s.totalUsd;
          const ivaUsd = s.ivaUsd || (s.fiscalData && s.fiscalData.ivaUsd) || 0;
          return `
            <tr>
              <td><span class="code-pill plu">#${esc(s.orderNumber)}</span></td>
              <td>
                <strong>${esc(s.customer)}</strong>
                <div style="font-size:12px;color:var(--txt-3)">${esc(timeStr)} · ${esc(s.cashier)}</div>
              </td>
              <td>
                ${(s.items || []).map(i => `<div>• <strong>${i.qty}x</strong> ${esc(i.name)} (${MTP.fmtUSD(i.subtotalUsd || i.qty * i.priceUsd)})</div>`).join('')}
              </td>
              <td class="tabular-nums">
                <div>Base: ${MTP.fmtUSD(subUsd)}</div>
                <div style="font-size:12px;color:#b45309">+IVA 16%: ${MTP.fmtUSD(ivaUsd)}</div>
              </td>
              <td>
                <div class="price-dual">
                  <span class="price-usd tabular-nums">${MTP.fmtUSD(s.totalUsd)}</span>
                  <span class="price-bs tabular-nums">${MTP.fmtBsRaw(s.totalBs)}</span>
                </div>
              </td>
              <td style="font-size:12px">
                ${(s.payments || []).map(p => `<div><strong>${esc(p.method)}:</strong> ${MTP.fmtUSD(p.amountUsd)}${p.bill ? ' (' + esc(p.bill) + ')' : ''}</div>`).join('')}
              </td>
              <td style="font-size:12px">
                <strong class="tabular-nums">${MTP.fmtUSD(s.changeGiven?.totalChangeUsd || 0)}</strong>
                <div style="color:var(--txt-2);font-size:12px">${esc(s.changeGiven?.breakdown || 'Exacto')}</div>
              </td>
              <td><span class="badge badge-green tabular-nums">+${MTP.fmtUSD(s.profitUsd)}</span></td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="8" style="text-align:center;color:var(--txt-3);padding:14px">No hay ventas registradas en esta fecha</td></tr>';
  }

  // 2. Historial de cierres diarios guardados
  const dailyList = MTP.state.dailyClosures || [];
  const savedClosuresBody = document.getElementById('savedDailyClosuresBody');
  if (savedClosuresBody) {
    savedClosuresBody.innerHTML = dailyList.length
      ? dailyList.map(c => `
          <tr>
            <td>
              <strong>${esc(c.date)}</strong>
              <div style="font-size:12px;color:var(--txt-3)">${esc(c.id)} · ${esc(c.responsible)}</div>
            </td>
            <td class="tabular-nums">${c.ordersCount}</td>
            <td><span class="badge badge-yellow tabular-nums">${c.kitchenPreparedQty} platos (${MTP.fmtUSD(c.kitchenSalesUsd)})</span></td>
            <td><span class="badge badge-blue tabular-nums">${c.retailSoldQty} und (${MTP.fmtUSD(c.retailSalesUsd)})</span></td>
            <td class="tabular-nums">${MTP.fmtUSD(c.subtotalBaseUsd)} + ${MTP.fmtUSD(c.ivaUsd)} IVA</td>
            <td><strong class="money-in tabular-nums">${MTP.fmtUSD(c.grossSalesUsd)}</strong></td>
            <td><span class="money-out tabular-nums">-${MTP.fmtUSD(c.totalExpensesUsd)}</span></td>
            <td class="tabular-nums">
              Contado: <strong>${MTP.fmtUSD(c.countedDrawerUsd)}</strong>
              <div style="font-size:12px;color:${Math.abs(c.diffDrawerUsd) < 0.05 ? 'var(--money-in)' : 'var(--money-out)'}">
                ${Math.abs(c.diffDrawerUsd) < 0.05 ? '✔ Cuadrado' : ('Dif: ' + MTP.fmtUSD(c.diffDrawerUsd))}
              </div>
            </td>
            <td><span class="badge badge-green tabular-nums">+${MTP.fmtUSD(c.netOperatingProfitUsd)}</span></td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm" data-closure-date="${esc(c.date)}">📄 Resumen</button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="10" style="text-align:center;padding:14px;color:var(--txt-3)">Aún no has guardado ningún cierre diario. Haz clic en "🔒 Cerrar el Día y Guardar Acta".</td></tr>';
  }

  // 3. Terminales Punto de Venta (excluyendo ventas anuladas)
  const termGrid = document.getElementById('posTerminalsStatusGrid');
  const terminals = MTP.state.posTerminals || [];
  if (termGrid) {
    termGrid.innerHTML = terminals.map(t => {
      const tStats = getPuntoTerminalStats(t.id);
      return `
        <div class="kpi" style="display:block;border-left:3px solid var(--money-in)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <strong style="font-size:13px;color:var(--txt)">${esc(t.name)}</strong>
            <span class="badge badge-green tabular-nums">Lote: ${esc(t.currentBatch || '0001')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div>
              <div class="money-bs tabular-nums" style="font-size:15px;font-weight:var(--fw-bold)">${MTP.fmtBsRaw(tStats.totalBs)}</div>
              <div class="tabular-nums" style="font-size:12px;color:var(--txt-3)">${tStats.txCount} cobros (${MTP.fmtUSD(tStats.totalUsd)})</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-close-batch-term="${esc(t.id)}">Cerrar Punto</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Pagos Móviles del día
  const pmRows = [];
  let pmPendingCount = 0;
  stats.sales.forEach(s => {
    if (!s || s.voided) return;
    (s.payments || []).forEach(p => {
      if (p.method === 'Pago Móvil') {
        const rawStatus = p.verifyStatus || (p.verified === false ? 'PENDIENTE' : 'CONCILIADO');
        if (rawStatus === 'PENDIENTE') pmPendingCount++;
        pmRows.push({
          saleId: s.id,
          paymentId: p.id || '',
          orderNumber: s.orderNumber,
          customer: s.customer,
          time: formatVetTime(s.createdAt),
          destAccount: p.destAccountName || 'Cuenta Principal',
          bank: p.bank || 'Banco',
          phone: p.phone || '—',
          ref: p.ref || '—',
          amountBs: Number(p.amountBs || 0),
          amountUsd: Number(p.amountUsd || 0),
          verifyStatus: rawStatus,
          reviewNotes: p.reviewNotes || ''
        });
      }
    });
  });

  const pmPendingBadge = document.getElementById('pmPendingBadge');
  if (pmPendingBadge) {
    if (pmPendingCount > 0) {
      pmPendingBadge.className = 'badge badge-yellow';
      pmPendingBadge.textContent = pmPendingCount + ' por verificar';
    } else {
      pmPendingBadge.className = 'badge badge-green';
      pmPendingBadge.textContent = 'Todo conciliado';
    }
  }

  const pmTable = document.getElementById('pmVerificationTable');
  if (pmTable) {
    pmTable.innerHTML = pmRows.length
      ? pmRows.map(r => {
          const statusBadge = r.verifyStatus === 'CONCILIADO'
            ? '<span class="badge badge-green">✔ Verificado</span>'
            : (r.verifyStatus === 'RECHAZADO'
              ? '<span class="badge badge-red">⚠ Observado</span>'
              : '<span class="badge badge-yellow">⏳ Por Verificar</span>');
          return `
          <tr>
            <td><span class="code-pill plu">#${esc(r.orderNumber)}</span></td>
            <td><strong>${esc(r.customer)}</strong> <span style="font-size:12px;color:var(--txt-3)">(${esc(r.time)})</span></td>
            <td><span class="badge badge-blue">${esc(r.destAccount)}</span></td>
            <td>${esc(r.bank)}</td>
            <td>${esc(r.phone)}</td>
            <td><span class="code-pill">#${esc(r.ref)}</span></td>
            <td><strong class="money-bs tabular-nums">${MTP.fmtBsRaw(r.amountBs)}</strong></td>
            <td><strong class="tabular-nums">${MTP.fmtUSD(r.amountUsd)}</strong></td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                ${r.verifyStatus !== 'CONCILIADO'
                  ? `<button type="button" class="btn btn-primary btn-sm" data-pm-sale="${esc(r.saleId)}" data-pm-ref="${esc(r.ref)}" data-pm-id="${esc(r.paymentId)}" data-pm-status="CONCILIADO">✔ Confirmar</button>`
                  : ''}
                ${r.verifyStatus !== 'RECHAZADO'
                  ? `<button type="button" class="btn btn-secondary btn-sm" style="color:var(--money-out)" data-pm-sale="${esc(r.saleId)}" data-pm-ref="${esc(r.ref)}" data-pm-id="${esc(r.paymentId)}" data-pm-status="RECHAZADO">⚠</button>`
                  : `<button type="button" class="btn btn-secondary btn-sm" data-pm-sale="${esc(r.saleId)}" data-pm-ref="${esc(r.ref)}" data-pm-id="${esc(r.paymentId)}" data-pm-status="PENDIENTE">↺</button>`}
              </div>
            </td>
          </tr>
        `;
        }).join('')
      : '<tr><td colspan="10" style="text-align:center;color:var(--txt-3);padding:14px">Sin pagos móviles en esta fecha</td></tr>';
  }

  // 5. Gastos del día
  const expTable = document.getElementById('cierreExpensesTable');
  if (expTable) {
    expTable.innerHTML = stats.expenses.length
      ? stats.expenses.map(e => `
          <tr>
            <td>${esc(formatVetTime(e.createdAt))}</td>
            <td><span class="badge badge-yellow">${esc(e.category)}</span></td>
            <td style="font-weight:var(--fw-semibold)">${esc(e.description)}</td>
            <td><span class="badge badge-green">${esc(e.paymentSource)}</span></td>
            <td><strong class="money-out tabular-nums">-${MTP.fmtUSD(e.amountUsd)}</strong></td>
            <td><strong class="money-out tabular-nums">-${MTP.fmtBsRaw(e.amountBs)}</strong></td>
            <td>${esc(e.responsible)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--txt-3);padding:14px">Sin compras ni gastos en esta fecha</td></tr>';
  }
}

function verifyPmFromPc(saleId, paymentRef, paymentId, newStatus) {
  if (!window.MTP || typeof MTP.updatePagoMovilStatus !== 'function') return;
  const ok = MTP.updatePagoMovilStatus(saleId, paymentRef, newStatus, newStatus === 'CONCILIADO' ? 'Verificado desde PC' : 'Marcado para revisión en PC', paymentId);
  if (ok) {
    MTP.toast(newStatus === 'CONCILIADO' ? 'Pago Móvil confirmado en banco.' : 'Pago Móvil marcado para revisión.', newStatus === 'CONCILIADO' ? 'ok' : 'warn');
    renderCierrePage();
  }
}

/* ========================================================================
   MODAL Y ACCIÓN DE CIERRE DIARIO
   ======================================================================== */
function openDailyClosureModal() {
  const dateInp = document.getElementById('dailyDateInput');
  const selectedDate = (dateInp && dateInp.value) ? dateInp.value : getLocalDateIso();
  const stats = MTP.getPeriodAnalytics('DAY', selectedDate);

  // Si el cajero contó usando la tabla de denominaciones, usar ese total contado
  let countedUsdTotal = 0;
  let hasCountedUsd = false;
  DENOM_USD.forEach(d => {
    if (countedDenoms['USD:' + d] !== undefined) {
      hasCountedUsd = true;
      countedUsdTotal += (countedDenoms['USD:' + d] * d);
    }
  });

  let countedBsTotal = 0;
  let hasCountedBs = false;
  DENOM_BS.forEach(d => {
    if (countedDenoms['BS:' + d] !== undefined) {
      hasCountedBs = true;
      countedBsTotal += (countedDenoms['BS:' + d] * d);
    }
  });

  document.getElementById('dcCountedUsd').value = (hasCountedUsd ? countedUsdTotal : stats.netDrawerUsd).toFixed(2);
  document.getElementById('dcCountedBs').value = (hasCountedBs ? countedBsTotal : stats.netDrawerBs).toFixed(2);

  document.getElementById('dailyModalSummaryBox').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <div>📅 Fecha a cerrar: <strong>${esc(selectedDate)}</strong></div>
      <div>🧾 Órdenes cobradas: <strong>${stats.ordersCount}</strong></div>
      <div>🥟 Comida preparada hoy: <strong>${stats.kitchenPreparedQty} platos (${MTP.fmtUSD(stats.kitchenSalesUsd)})</strong></div>
      <div>🛒 Mercancía vendida hoy: <strong>${stats.retailSoldQty} und (${MTP.fmtUSD(stats.retailSalesUsd)})</strong></div>
      <div>💵 Subtotal + IVA 16%: <strong>${MTP.fmtUSD(stats.subtotalBaseUsd)} + ${MTP.fmtUSD(stats.ivaUsd)}</strong></div>
      <div>💰 Total Cobrado: <strong class="money-in">${MTP.fmtUSD(stats.grossSalesUsd)}</strong></div>
      <div>💵 Efectivo USD Esperado: <strong class="money-in">${MTP.fmtUSD(stats.netDrawerUsd)}</strong></div>
      <div>🏦 Pago Móvil Neto: <strong class="money-bs">${MTP.fmtBsRaw(stats.netBankPmBs)}</strong></div>
    </div>
  `;
  document.getElementById('dailyClosureModal').classList.add('open');
}

function confirmDailyClosureAction() {
  const dateInp = document.getElementById('dailyDateInput');
  const selectedDate = (dateInp && dateInp.value) ? dateInp.value : getLocalDateIso();
  const countedUsd = parseFloat(document.getElementById('dcCountedUsd').value) || 0;
  const countedBs = parseFloat(document.getElementById('dcCountedBs').value) || 0;
  const responsible = document.getElementById('dcResponsible').value.trim() || 'Dueño';
  const notes = document.getElementById('dcNotes').value.trim() || 'Cierre diario normal';

  const closure = MTP.performDailyClosure({
    date: selectedDate,
    countedUsd,
    countedBs,
    responsible,
    notes
  });

  document.getElementById('dailyClosureModal').classList.remove('open');
  MTP.toast(`¡Acta de Cierre Diario (${closure.date}) guardada con éxito!`);
  renderCierrePage();
  openClosureReportModal('DIARIO', closure.date);
}

/* ========================================================================
   PESTAÑA 2: CIERRE MENSUAL
   ======================================================================== */
function renderMonthlyPane() {
  const mInp = document.getElementById('monthlyMonthInput');
  if (mInp && !mInp.value) {
    mInp.value = getLocalMonthIso();
  }
  const selectedMonth = (mInp && mInp.value) ? mInp.value : getLocalMonthIso();
  const stats = MTP.getPeriodAnalytics('MONTH', selectedMonth);
  const bcv = stats.bcv;

  const monthlyGrid = document.getElementById('monthlyStatsGrid');
  if (monthlyGrid) {
    if (window.MTPUI && window.MTPUI.statCard) {
      monthlyGrid.innerHTML =
        MTPUI.statCard({
          label: 'Ventas Totales del Mes (' + stats.ordersCount + ' órdenes)',
          value: MTP.fmtUSD(stats.grossSalesUsd),
          sub: MTP.fmtBsRaw(stats.grossSalesBs),
          tone: 'in'
        }) +
        MTPUI.statCard({
          label: 'IVA 16% Acumulado del Mes',
          value: MTP.fmtUSD(stats.ivaUsd),
          sub: 'Base: ' + MTP.fmtUSD(stats.baseG16Usd) + ' · Exento: ' + MTP.fmtUSD(stats.exentoUsd),
          tone: 'cash'
        }) +
        MTPUI.statCard({
          label: 'Compras y Gastos del Mes',
          value: '-' + MTP.fmtUSD(stats.totalExpensesUsd),
          sub: 'Costo mercancía + recetas: ' + MTP.fmtUSD(stats.totalCostOfGoodsUsd),
          tone: 'out'
        }) +
        MTPUI.statCard({
          label: 'Ganancia Neta Limpia del Mes',
          value: '+' + MTP.fmtUSD(stats.netOperatingProfitUsd),
          sub: '+' + MTP.fmtBsRaw(stats.netOperatingProfitUsd * bcv),
          tone: 'in'
        });
    } else {
      monthlyGrid.innerHTML = `
        <div class="stat-card tone-in">
          <span class="stat-l">Ventas Totales del Mes (${stats.ordersCount} órdenes)</span>
          <strong class="stat-n tabular-nums money-in">${MTP.fmtUSD(stats.grossSalesUsd)}</strong>
          <span class="stat-sub tabular-nums">${MTP.fmtBsRaw(stats.grossSalesBs)}</span>
        </div>
        <div class="stat-card tone-cash">
          <span class="stat-l">IVA 16% Acumulado del Mes</span>
          <strong class="stat-n tabular-nums" style="color:#b45309">${MTP.fmtUSD(stats.ivaUsd)}</strong>
          <span class="stat-sub tabular-nums">Base: ${MTP.fmtUSD(stats.baseG16Usd)} · Exento: ${MTP.fmtUSD(stats.exentoUsd)}</span>
        </div>
        <div class="stat-card tone-out">
          <span class="stat-l">Compras y Gastos del Mes</span>
          <strong class="stat-n tabular-nums money-out">-${MTP.fmtUSD(stats.totalExpensesUsd)}</strong>
          <span class="stat-sub tabular-nums">Costo mercancía + recetas: ${MTP.fmtUSD(stats.totalCostOfGoodsUsd)}</span>
        </div>
        <div class="stat-card tone-in">
          <span class="stat-l">Ganancia Neta Limpia del Mes</span>
          <strong class="stat-n tabular-nums money-bs">+${MTP.fmtUSD(stats.netOperatingProfitUsd)}</strong>
          <span class="stat-sub tabular-nums">+${MTP.fmtBsRaw(stats.netOperatingProfitUsd * bcv)}</span>
        </div>
      `;
    }
  }

  renderKitchenVsRetailCard('monthlyKitchenVsRetailBox', stats);

  const daysTableBody = document.getElementById('monthlyDaysTableBody');
  if (daysTableBody) {
    daysTableBody.innerHTML = stats.daysList.length
      ? stats.daysList.map(d => `
          <tr>
            <td><strong>${d.date}</strong></td>
            <td class="tabular-nums">${d.ordersCount}</td>
            <td><span class="badge badge-yellow tabular-nums">${d.kitchenPreparedQty} platos</span></td>
            <td><span class="badge badge-blue tabular-nums">${d.retailSoldQty} und</span></td>
            <td class="tabular-nums">${MTP.fmtUSD(d.subtotalBaseUsd)}</td>
            <td class="tabular-nums" style="color:#b45309">${MTP.fmtUSD(d.ivaUsd)}</td>
            <td><strong class="money-in tabular-nums">${MTP.fmtUSD(d.grossSalesUsd)}</strong></td>
            <td><span class="money-out tabular-nums">-${MTP.fmtUSD(d.expensesUsd)}</span></td>
            <td><span class="badge badge-green tabular-nums">+${MTP.fmtUSD(d.netProfitUsd)}</span></td>
          </tr>
        `).join('')
      : '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--txt-3)">No hay movimientos registrados en este mes.</td></tr>';
  }

  const mClosures = MTP.state.monthlyClosures || [];
  const savedMonthlyBody = document.getElementById('savedMonthlyClosuresBody');
  if (savedMonthlyBody) {
    savedMonthlyBody.innerHTML = mClosures.length
      ? mClosures.map(c => `
          <tr>
            <td><strong>${esc(c.month)}</strong> <span style="font-size:12px;color:var(--txt-3)">(${esc(c.id)})</span></td>
            <td class="tabular-nums">${c.daysWorked} días</td>
            <td class="tabular-nums">${c.ordersCount}</td>
            <td><span class="badge badge-yellow tabular-nums">${c.kitchenPreparedQty} platos (${MTP.fmtUSD(c.kitchenSalesUsd)})</span></td>
            <td><span class="badge badge-blue tabular-nums">${c.retailSoldQty} und (${MTP.fmtUSD(c.retailSalesUsd)})</span></td>
            <td class="tabular-nums">${MTP.fmtUSD(c.ivaUsd)}</td>
            <td><strong class="money-in tabular-nums">${MTP.fmtUSD(c.grossSalesUsd)}</strong></td>
            <td><span class="money-out tabular-nums">-${MTP.fmtUSD(c.totalExpensesUsd)}</span></td>
            <td><span class="badge badge-green tabular-nums">+${MTP.fmtUSD(c.netOperatingProfitUsd)}</span></td>
          </tr>
        `).join('')
      : '<tr><td colspan="9" style="text-align:center;padding:14px;color:var(--txt-3)">Aún no se han guardado actas de cierre mensual.</td></tr>';
  }
}

function saveMonthlyClosureAction() {
  const mInp = document.getElementById('monthlyMonthInput');
  const selectedMonth = (mInp && mInp.value) ? mInp.value : getLocalMonthIso();
  const c = MTP.performMonthlyClosure({ month: selectedMonth });
  MTP.toast(`¡Cierre Mensual de ${c.month} guardado con éxito!`);
  renderMonthlyPane();
  openClosureReportModal('MENSUAL', c.month);
}

/* ========================================================================
   PESTAÑA 3: CIERRE ANUAL
   ======================================================================== */
function renderAnnualPane() {
  const ySel = document.getElementById('annualYearSelect');
  const selectedYear = (ySel && ySel.value) ? ySel.value : String(getLocalYear());
  const stats = MTP.getPeriodAnalytics('YEAR', selectedYear);
  const bcv = stats.bcv;

  const annualGrid = document.getElementById('annualStatsGrid');
  if (annualGrid) {
    if (window.MTPUI && window.MTPUI.statCard) {
      annualGrid.innerHTML =
        MTPUI.statCard({
          label: 'Ventas Acumuladas Año ' + selectedYear + ' (' + stats.ordersCount + ' órdenes)',
          value: MTP.fmtUSD(stats.grossSalesUsd),
          sub: MTP.fmtBsRaw(stats.grossSalesBs),
          tone: 'in'
        }) +
        MTPUI.statCard({
          label: 'IVA 16% Acumulado del Año',
          value: MTP.fmtUSD(stats.ivaUsd),
          sub: 'Base: ' + MTP.fmtUSD(stats.baseG16Usd) + ' · Exento: ' + MTP.fmtUSD(stats.exentoUsd),
          tone: 'cash'
        }) +
        MTPUI.statCard({
          label: 'Producción Cocina vs Mercancía Anual',
          value: stats.kitchenPreparedQty + ' platos / ' + stats.retailSoldQty + ' und',
          sub: 'Cocina: ' + MTP.fmtUSD(stats.kitchenSalesUsd) + ' · Tienda: ' + MTP.fmtUSD(stats.retailSalesUsd),
          tone: 'default'
        }) +
        MTPUI.statCard({
          label: 'Ganancia Neta Anual (' + selectedYear + ')',
          value: '+' + MTP.fmtUSD(stats.netOperatingProfitUsd),
          sub: 'Gastos descontados: -' + MTP.fmtUSD(stats.totalExpensesUsd),
          tone: 'in'
        });
    } else {
      annualGrid.innerHTML = `
        <div class="stat-card tone-in">
          <span class="stat-l">Ventas Acumuladas Año ${selectedYear} (${stats.ordersCount} órdenes)</span>
          <strong class="stat-n tabular-nums money-in">${MTP.fmtUSD(stats.grossSalesUsd)}</strong>
          <span class="stat-sub tabular-nums">${MTP.fmtBsRaw(stats.grossSalesBs)}</span>
        </div>
        <div class="stat-card tone-cash">
          <span class="stat-l">IVA 16% Acumulado del Año</span>
          <strong class="stat-n tabular-nums" style="color:#b45309">${MTP.fmtUSD(stats.ivaUsd)}</strong>
          <span class="stat-sub tabular-nums">Base: ${MTP.fmtUSD(stats.baseG16Usd)} · Exento: ${MTP.fmtUSD(stats.exentoUsd)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-l">Producción Cocina vs Mercancía Anual</span>
          <strong class="stat-n tabular-nums" style="color:#d97706">${stats.kitchenPreparedQty} platos / ${stats.retailSoldQty} und</strong>
          <span class="stat-sub tabular-nums">Cocina: ${MTP.fmtUSD(stats.kitchenSalesUsd)} · Tienda: ${MTP.fmtUSD(stats.retailSalesUsd)}</span>
        </div>
        <div class="stat-card tone-in">
          <span class="stat-l">Ganancia Neta Anual (${selectedYear})</span>
          <strong class="stat-n tabular-nums money-bs">+${MTP.fmtUSD(stats.netOperatingProfitUsd)}</strong>
          <span class="stat-sub tabular-nums">Gastos descontados: -${MTP.fmtUSD(stats.totalExpensesUsd)}</span>
        </div>
      `;
    }
  }

  const monthsTableBody = document.getElementById('annualMonthsTableBody');
  if (monthsTableBody) {
    monthsTableBody.innerHTML = (stats.monthsList || []).map(m => `
      <tr style="${m.ordersCount > 0 ? 'background:#ffffff' : 'color:var(--txt-3)'}">
        <td><strong>${m.monthName} ${selectedYear}</strong></td>
        <td class="tabular-nums">${m.ordersCount}</td>
        <td><span class="badge badge-yellow tabular-nums">${m.kitchenPreparedQty} platos</span></td>
        <td><span class="badge badge-blue tabular-nums">${m.retailSoldQty} und</span></td>
        <td class="tabular-nums">${MTP.fmtUSD(m.subtotalBaseUsd)}</td>
        <td class="tabular-nums" style="color:#b45309">${MTP.fmtUSD(m.ivaUsd)}</td>
        <td><strong class="money-in tabular-nums">${MTP.fmtUSD(m.grossSalesUsd)}</strong></td>
        <td><span class="money-out tabular-nums">-${MTP.fmtUSD(m.expensesUsd)}</span></td>
        <td><span class="badge ${m.netProfitUsd >= 0 ? 'badge-green' : 'badge-red'} tabular-nums">${m.netProfitUsd >= 0 ? '+' : ''}${MTP.fmtUSD(m.netProfitUsd)}</span></td>
      </tr>
    `).join('');
  }
}

/* ========================================================================
   CIERRE DE PUNTO DE VENTA
   ======================================================================== */
let activeBatchTerminal = null;

function openBatchClosureModal(termId) {
  const terms = MTP.state.posTerminals || [];
  const sel = document.getElementById('closeBatchTermSelect');
  if (sel) {
    sel.innerHTML = terms.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(t.bank)}) - Lote ${esc(t.currentBatch || '0001')}</option>`).join('');
    if (termId) sel.value = termId;
  }
  updateBatchModalPreview(sel ? sel.value : terms[0]?.id);
  document.getElementById('batchClosureModal').classList.add('open');
}

function updateBatchModalPreview(termId) {
  const terms = MTP.state.posTerminals || [];
  activeBatchTerminal = terms.find(t => t.id === termId) || terms[0];
  if (!activeBatchTerminal) return;

  const stats = getPuntoTerminalStats(activeBatchTerminal.id);

  document.getElementById('closeBatchNumInput').value = activeBatchTerminal.currentBatch || '0001';
  document.getElementById('closeBatchCountInput').value = stats.txCount;
  document.getElementById('closeBatchAmountBsInput').value = stats.totalBs.toFixed(2);
  document.getElementById('batchSysTotalBs').textContent = MTP.fmtBsRaw(stats.totalBs);
  document.getElementById('batchSysTxCount').textContent = stats.txCount;
  compareBatchClosureLive();
}

function compareBatchClosureLive() {
  if (!activeBatchTerminal) return;
  const stats = getPuntoTerminalStats(activeBatchTerminal.id);
  const physBs = parseFloat(document.getElementById('closeBatchAmountBsInput').value) || 0;
  const diffBs = physBs - stats.totalBs;

  const diffEl = document.getElementById('batchDiffBs');
  const badge = document.getElementById('batchStatusBadge');
  if (diffEl) diffEl.textContent = `${diffBs >= 0 ? '+' : ''}${diffBs.toFixed(2)} Bs`;

  if (badge) {
    if (Math.abs(diffBs) < 0.05) {
      badge.className = 'badge badge-green';
      badge.textContent = '✔ Cuadrado Exacto (0,00 Bs Diferencia)';
    } else if (diffBs > 0) {
      badge.className = 'badge badge-blue';
      badge.textContent = `Sobrante: +${diffBs.toFixed(2)} Bs`;
    } else {
      badge.className = 'badge badge-red';
      badge.textContent = `Faltante: ${diffBs.toFixed(2)} Bs`;
    }
  }
}

function confirmBatchClosure() {
  if (!activeBatchTerminal) return;
  const voucherTotalBs = parseFloat(document.getElementById('closeBatchAmountBsInput').value) || 0;
  const voucherTxCount = parseInt(document.getElementById('closeBatchCountInput').value, 10) || 0;
  const notes = document.getElementById('closeBatchNotesInput').value.trim();

  const res = MTP.closeTerminalBatch({
    terminalId: activeBatchTerminal.id,
    voucherTotalBs,
    voucherTxCount,
    closedBy: 'Administrador',
    notes
  });

  if (!res.success) {
    MTP.toast(res.error, 'err');
    return;
  }

  document.getElementById('batchClosureModal').classList.remove('open');
  MTP.toast(`¡Cierre de punto ${activeBatchTerminal.name} guardado!`);
  renderCierrePage();
}

/* ========================================================================
   GENERADOR DE ARCHIVO RESUMEN E IMPRESIÓN LIMPIA (DIARIO, MENSUAL, ANUAL)
   ======================================================================== */
let activeReportPeriodType = 'DIARIO';
let activeReportFilterVal = '';

function getActiveFilterForTab(tab, customFilter = '') {
  if (customFilter) return customFilter;
  if (tab === 'DIARIO') {
    const el = document.getElementById('dailyDateInput');
    return (el && el.value) ? el.value : getLocalDateIso();
  }
  if (tab === 'MENSUAL') {
    const el = document.getElementById('monthlyMonthInput');
    return (el && el.value) ? el.value : getLocalMonthIso();
  }
  if (tab === 'ANUAL') {
    const el = document.getElementById('annualYearSelect');
    return (el && el.value) ? el.value : String(getLocalYear());
  }
  return getLocalDateIso();
}

function buildClosureReportData(tab = 'DIARIO', customFilter = '') {
  const fVal = getActiveFilterForTab(tab, customFilter);
  const pType = tab === 'DIARIO' ? 'DAY' : (tab === 'MENSUAL' ? 'MONTH' : 'YEAR');
  const stats = MTP.getPeriodAnalytics(pType, fVal);
  const s = MTP.state.settings || {};
  const storeName = s.storeName || s.businessName || 'MI TIENDA POS';
  const storeRif = s.rif || 'V-00000000-0';
  const storeAddress = s.address || 'Mostrador Principal';

  let title = 'ACTA RESUMEN DE CIERRE DIARIO';
  let periodLabel = 'Fecha: ' + fVal;
  let fileSlug = 'CIERRE-DIARIO-' + fVal;

  if (tab === 'MENSUAL') {
    title = 'INFORME EJECUTIVO DE CIERRE MENSUAL';
    periodLabel = 'Mes: ' + fVal;
    fileSlug = 'CIERRE-MENSUAL-' + fVal;
  } else if (tab === 'ANUAL') {
    title = 'BALANCE EJECUTIVO DE CIERRE ANUAL';
    periodLabel = 'Año: ' + fVal;
    fileSlug = 'CIERRE-ANUAL-' + fVal;
  }

  const savedDaily = (MTP.state.dailyClosures || []).find(c => c.date === fVal);

  return {
    tab,
    fVal,
    title,
    periodLabel,
    fileSlug,
    storeName,
    storeRif,
    storeAddress,
    emittedAt: formatVetDateTime(new Date()),
    stats,
    savedDaily
  };
}

function buildClosureReportInnerHtml(data) {
  const st = data.stats;
  const bcv = st.bcv;

  const famRows = (st.kitchenByFamily || []).map(f => `
    <tr>
      <td style="padding:5px 8px;border-bottom:1px solid #cbd5e1">${esc(f.name)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #cbd5e1;text-align:right;font-weight:700">${f.qty} platos</td>
      <td style="padding:5px 8px;border-bottom:1px solid #cbd5e1;text-align:right;font-weight:700">${MTP.fmtUSD(f.salesUsd)}</td>
    </tr>
  `).join('');

  const ingRows = (st.kitchenIngredientsUsed || []).length
    ? st.kitchenIngredientsUsed.map(i => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0">${esc(i.name)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">-${MTP.fmtWeight(i.qtyUsed, i.unit)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${MTP.fmtUSD(i.costUsd)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#059669;font-weight:700">${MTP.fmtWeight(i.remainingStock, i.unit)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="padding:8px;text-align:center;color:#64748b">Sin consumo de ingredientes registrado en este período</td></tr>';

  const retailRows = (st.retailItemsList || []).length
    ? st.retailItemsList.map(r => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0">${esc(r.name)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${r.qty} und</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${MTP.fmtUSD(r.salesUsd)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding:8px;text-align:center;color:#64748b">Sin mercancía empaquetada vendida en este período</td></tr>';

  let periodBreakdownHtml = '';
  if (data.tab === 'MENSUAL' && st.daysList && st.daysList.length) {
    periodBreakdownHtml = `
      <div style="margin-top:16px">
        <h4 style="font-size:13px;text-transform:uppercase;background:#f1f5f9;padding:6px 10px;border-left:4px solid #0f2a3d;margin:0 0 8px 0">
          📅 Resumen Día por Día del Mes (${esc(data.fVal)})
        </h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
              <th style="padding:5px 8px;text-align:left">Fecha</th>
              <th style="padding:5px 8px;text-align:right">Órdenes</th>
              <th style="padding:5px 8px;text-align:right">Platos Cocina</th>
              <th style="padding:5px 8px;text-align:right">Mercancía</th>
              <th style="padding:5px 8px;text-align:right">Base + IVA 16%</th>
              <th style="padding:5px 8px;text-align:right">Total Cobrado</th>
              <th style="padding:5px 8px;text-align:right">Gastos</th>
              <th style="padding:5px 8px;text-align:right">Ganancia Neta</th>
            </tr>
          </thead>
          <tbody>
            ${st.daysList.map(d => `
              <tr>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:700">${esc(d.date)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${d.ordersCount}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${d.kitchenPreparedQty}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${d.retailSoldQty}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${MTP.fmtUSD(d.subtotalBaseUsd)} + ${MTP.fmtUSD(d.ivaUsd)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${MTP.fmtUSD(d.grossSalesUsd)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">-${MTP.fmtUSD(d.expensesUsd)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#15803d">+${MTP.fmtUSD(d.netProfitUsd)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (data.tab === 'ANUAL' && st.monthsList) {
    periodBreakdownHtml = `
      <div style="margin-top:16px">
        <h4 style="font-size:13px;text-transform:uppercase;background:#f1f5f9;padding:6px 10px;border-left:4px solid #0f2a3d;margin:0 0 8px 0">
          📊 Resumen Mes por Mes del Año (${esc(data.fVal)})
        </h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
              <th style="padding:5px 8px;text-align:left">Mes</th>
              <th style="padding:5px 8px;text-align:right">Órdenes</th>
              <th style="padding:5px 8px;text-align:right">Platos Cocina</th>
              <th style="padding:5px 8px;text-align:right">Mercancía</th>
              <th style="padding:5px 8px;text-align:right">IVA 16%</th>
              <th style="padding:5px 8px;text-align:right">Total Ventas</th>
              <th style="padding:5px 8px;text-align:right">Gastos</th>
              <th style="padding:5px 8px;text-align:right">Ganancia Neta</th>
            </tr>
          </thead>
          <tbody>
            ${st.monthsList.map(m => `
              <tr>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:700">${esc(m.monthName)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${m.ordersCount}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${m.kitchenPreparedQty}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${m.retailSoldQty}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${MTP.fmtUSD(m.ivaUsd)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${MTP.fmtUSD(m.grossSalesUsd)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">-${MTP.fmtUSD(m.expensesUsd)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#15803d">+${MTP.fmtUSD(m.netProfitUsd)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;line-height:1.4">
      <!-- CABECERA DEL REPORTE -->
      <div style="border-bottom:2px solid #0f2a3d;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="font-size:18px;font-weight:900;color:#0f2a3d">${esc(data.storeName)}</div>
          <div style="font-size:12px;color:#475569">RIF: ${esc(data.storeRif)} · ${esc(data.storeAddress)}</div>
          <div style="font-size:15px;font-weight:800;margin-top:6px;color:#b45309">${esc(data.title)}</div>
        </div>
        <div style="text-align:right;font-size:12px">
          <div style="font-size:14px;font-weight:800;color:#0f172a">${esc(data.periodLabel)}</div>
          <div>Emitido: ${esc(data.emittedAt)}</div>
          <div style="margin-top:3px;font-weight:700;color:#059669">Tasa BCV: ${bcv.toFixed(2)} Bs/$ · Euro: ${st.eur.toFixed(2)} Bs/€</div>
        </div>
      </div>

      <!-- 1. CUADRO RESUMEN FINANCIERO Y FISCAL -->
      <h4 style="font-size:13px;text-transform:uppercase;background:#f1f5f9;padding:6px 10px;border-left:4px solid #15803d;margin:0 0 8px 0">
        1. Resumen General de Ventas, IVA (16%) y Ganancia Limpia
      </h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
        <tbody>
          <tr>
            <td style="padding:5px 8px;border:1px solid #cbd5e1"><strong>Órdenes Cobradas:</strong> ${st.ordersCount} órdenes</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1"><strong>Ventas Exentas (0%):</strong> ${MTP.fmtUSD(st.exentoUsd)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1"><strong>Base Gravada (16%):</strong> ${MTP.fmtUSD(st.baseG16Usd)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1"><strong>IVA 16% Recaudado:</strong> ${MTP.fmtUSD(st.ivaUsd)} (${MTP.fmtBsRaw(st.ivaBs)})</td>
          </tr>
          <tr style="background:#f0fdf4">
            <td colspan="2" style="padding:7px 8px;border:1px solid #cbd5e1;font-size:14px">
              <strong>TOTAL COBRADO BRUTO:</strong> <span style="color:#15803d;font-weight:900">${MTP.fmtUSD(st.grossSalesUsd)}</span> (${MTP.fmtBsRaw(st.grossSalesBs)})
            </td>
            <td style="padding:7px 8px;border:1px solid #cbd5e1">
              <strong>Compras / Gastos:</strong> <span style="color:#b91c1c;font-weight:800">-${MTP.fmtUSD(st.totalExpensesUsd)}</span>
            </td>
            <td style="padding:7px 8px;border:1px solid #cbd5e1;font-size:14px">
              <strong>GANANCIA LIMPIA:</strong> <span style="color:#1d4ed8;font-weight:900">+${MTP.fmtUSD(st.netOperatingProfitUsd)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 2. CUADRE DE GAVETA Y BANCOS -->
      <h4 style="font-size:13px;text-transform:uppercase;background:#f1f5f9;padding:6px 10px;border-left:4px solid #1d4ed8;margin:0 0 8px 0">
        2. Dinero Neto en Gaveta y Cuentas Bancarias
      </h4>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:14px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left">Medio / Gaveta</th>
            <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">Entró</th>
            <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">Vueltos Dados</th>
            <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">Gastos Pagados</th>
            <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">Saldo Neto en Mano</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;font-weight:700">💵 Efectivo Dólares (USD)</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">${MTP.fmtUSD(st.inUsdCash)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">-${MTP.fmtUSD(st.outChangeUsdCash)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">-${MTP.fmtUSD(st.expUsdCash)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:900;color:#15803d">${MTP.fmtUSD(st.netDrawerUsd)}</td>
          </tr>
          <tr>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;font-weight:700">📲 Pago Móvil (Bs)</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">${MTP.fmtBsRaw(st.inPmBs)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">-${MTP.fmtBsRaw(st.outChangePmBs)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">-${MTP.fmtBsRaw(st.expPmBs)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:900;color:#1d4ed8">${MTP.fmtBsRaw(st.netBankPmBs)}</td>
          </tr>
          <tr>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;font-weight:700">💳 Punto de Venta / Biopago (Bs)</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">${MTP.fmtBsRaw(st.inPuntoBs)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">0.00 Bs</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">0.00 Bs</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:900">${MTP.fmtBsRaw(st.inPuntoBs)} (${MTP.fmtUSD(bcv > 0 ? st.inPuntoBs / bcv : 0)})</td>
          </tr>
          <tr>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;font-weight:700">🇻🇪 Efectivo Bolívares (Bs)</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">${MTP.fmtBsRaw(st.inBsCash)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">-${MTP.fmtBsRaw(st.outChangeBsCash)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right">-${MTP.fmtBsRaw(st.expBsCash)}</td>
            <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:900">${MTP.fmtBsRaw(st.netDrawerBs)}</td>
          </tr>
        </tbody>
      </table>

      <!-- 3. PRODUCCIÓN DIARIA DE COCINA VS MERCANCÍA EMPAQUETADA -->
      <h4 style="font-size:13px;text-transform:uppercase;background:#f1f5f9;padding:6px 10px;border-left:4px solid #f59e0b;margin:0 0 8px 0">
        3. Comida Preparada en Cocina (${st.kitchenPreparedQty} platos) vs. Mercancía Empaquetada (${st.retailSoldQty} und)
      </h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div style="border:1px solid #cbd5e1;border-radius:6px;padding:8px">
          <div style="font-weight:800;font-size:12.5px;margin-bottom:6px;color:#92400e">
            🥟 Platos Preparados en Cocina (Venta: ${MTP.fmtUSD(st.kitchenSalesUsd)} · Costo Receta: -${MTP.fmtUSD(st.kitchenCostUsd)})
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <tbody>${famRows}</tbody>
          </table>
        </div>
        <div style="border:1px solid #cbd5e1;border-radius:6px;padding:8px">
          <div style="font-weight:800;font-size:12.5px;margin-bottom:6px;color:#1e40af">
            🛒 Mercancía de Mostrador Vendida (Venta: ${MTP.fmtUSD(st.retailSalesUsd)} · Costo: -${MTP.fmtUSD(st.retailCostUsd)})
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <tbody>${retailRows}</tbody>
          </table>
        </div>
      </div>

      <!-- INGREDIENTES DE COCINA CONSUMIDOS POR LA COMIDA PREPARADA -->
      <div style="border:1px solid #cbd5e1;border-radius:6px;padding:8px;margin-bottom:14px">
        <div style="font-weight:800;font-size:12.5px;margin-bottom:6px">
          🍲 Ingredientes de Cocina Consumidos por los Platos Preparados
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #cbd5e1">
              <th style="padding:4px 8px;text-align:left">Ingrediente de Cocina</th>
              <th style="padding:4px 8px;text-align:right">Cantidad Usada</th>
              <th style="padding:4px 8px;text-align:right">Costo Consumido</th>
              <th style="padding:4px 8px;text-align:right">Queda en Almacén Cocina</th>
            </tr>
          </thead>
          <tbody>${ingRows}</tbody>
        </table>
      </div>

      ${periodBreakdownHtml}

      <!-- FIRMAS DE CONFORMIDAD -->
      <div style="margin-top:28px;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;font-size:12px;color:#334155">
        <div>
          <div style="border-top:1px solid #475569;padding-top:6px;margin-top:24px">
            <strong>Entregado por (Cajero / Encargado)</strong>
          </div>
        </div>
        <div>
          <div style="border-top:1px solid #475569;padding-top:6px;margin-top:24px">
            <strong>Recibido Conforme (Dueño / Administrador)</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openClosureReportModal(tab = 'DIARIO', customFilter = '') {
  activeReportPeriodType = tab || currentCierreTab || 'DIARIO';
  activeReportFilterVal = customFilter || '';
  const data = buildClosureReportData(activeReportPeriodType, activeReportFilterVal);
  document.getElementById('closureReportModalTitle').textContent = '📄 ' + data.title + ' (' + data.periodLabel + ')';
  document.getElementById('closureReportPreviewContainer').innerHTML = buildClosureReportInnerHtml(data);
  document.getElementById('closureReportModal').classList.add('open');
}

function buildStandaloneReportHtmlDocument(data) {
  const inner = buildClosureReportInnerHtml(data);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${esc(data.title)} - ${esc(data.fVal)}</title>
  <style>
@page { size: auto; margin: 12mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: #ffffff; margin: 0; padding: 16px; }
table { page-break-inside: auto; }
tr { page-break-inside: avoid; page-break-after: auto; }
  </style>
</head>
<body>
  ${inner}
</body>
</html>`;
}

function getOrCreateClosurePrintRoot() {
  let root = document.getElementById('closurePrintRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'closurePrintRoot';
    document.body.appendChild(root);
  }
  return root;
}

function runInlineClosurePrint(html, isThermal) {
  const root = getOrCreateClosurePrintRoot();
  root.classList.toggle('thermal-mode', Boolean(isThermal));
  root.innerHTML = html;

  document.body.classList.add('printing-closure');
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('printing-closure');
  };

  if (window.MTPDesktop && typeof window.MTPDesktop.print === 'function') {
    window.MTPDesktop.print({ silent: false, printBackground: true })
      .catch(() => {})
      .finally(cleanup);
    return;
  }

  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 15000);
  setTimeout(() => {
    try { window.print(); } catch (_) { cleanup(); }
  }, 50);
}

function printCleanClosureSheet() {
  const data = buildClosureReportData(activeReportPeriodType, activeReportFilterVal);
  runInlineClosurePrint(buildClosureReportInnerHtml(data), false);
}

function printThermalClosureTicket() {
  const data = buildClosureReportData(activeReportPeriodType, activeReportFilterVal);
  const st = data.stats;
  const ticketHtml = `
    <div style="font-family:'Consolas','Courier New',monospace;font-size:12px;color:#000;line-height:1.35">
      <div style="text-align:center;font-weight:bold;font-size:14px">${esc(data.storeName)}</div>
      <div style="text-align:center">RIF: ${esc(data.storeRif)}</div>
      <div style="text-align:center;font-weight:bold;margin-top:4px">${esc(data.title)}</div>
      <div style="text-align:center">${esc(data.periodLabel)}</div>
      <div style="text-align:center;font-size:12px">Emitido: ${esc(data.emittedAt)}</div>
      <div style="border-top:1px dashed #000;margin:5px 0"></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Ordenes cobradas:</span><span style="font-weight:bold">${st.ordersCount}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Platos Cocina:</span><span style="font-weight:bold">${st.kitchenPreparedQty} (${MTP.fmtUSD(st.kitchenSalesUsd)})</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Mercancia Tienda:</span><span style="font-weight:bold">${st.retailSoldQty} (${MTP.fmtUSD(st.retailSalesUsd)})</span></div>
      <div style="border-top:1px dashed #000;margin:5px 0"></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Exento (0%):</span><span>${MTP.fmtUSD(st.exentoUsd)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Base Gravada 16%:</span><span>${MTP.fmtUSD(st.baseG16Usd)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>IVA 16%:</span><span>${MTP.fmtUSD(st.ivaUsd)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0;font-weight:bold;font-size:13px"><span>TOTAL COBRADO:</span><span>${MTP.fmtUSD(st.grossSalesUsd)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Equiv. Bs (BCV ${st.bcv.toFixed(2)}):</span><span>${MTP.fmtBsRaw(st.grossSalesBs)}</span></div>
      <div style="border-top:1px dashed #000;margin:5px 0"></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Efectivo USD Neto:</span><span style="font-weight:bold">${MTP.fmtUSD(st.netDrawerUsd)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Efectivo Bs Neto:</span><span style="font-weight:bold">${MTP.fmtBsRaw(st.netDrawerBs)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Pago Movil Neto:</span><span style="font-weight:bold">${MTP.fmtBsRaw(st.netBankPmBs)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Punto de Venta:</span><span style="font-weight:bold">${MTP.fmtBsRaw(st.inPuntoBs)}</span></div>
      <div style="border-top:1px dashed #000;margin:5px 0"></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0"><span>Gastos Pagados:</span><span>-${MTP.fmtUSD(st.totalExpensesUsd)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:2px 0;font-weight:bold;font-size:13px"><span>GANANCIA LIMPIA:</span><span>+${MTP.fmtUSD(st.netOperatingProfitUsd)}</span></div>
      <div style="border-top:1px dashed #000;margin:5px 0"></div>
    </div>
  `;
  runInlineClosurePrint(ticketHtml, true);
}

function downloadClosureSummaryFile(tab = 'DIARIO', customFilter = '') {
  activeReportPeriodType = tab || currentCierreTab || 'DIARIO';
  activeReportFilterVal = customFilter || '';
  downloadCurrentReportHtml();
}

function downloadCurrentReportHtml() {
  const data = buildClosureReportData(activeReportPeriodType, activeReportFilterVal);
  const htmlContent = buildStandaloneReportHtmlDocument(data);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RESUMEN-${data.fileSlug}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  MTP.toast(`Archivo RESUMEN-${data.fileSlug}.html descargado`);
}

function downloadCurrentReportTxt() {
  const data = buildClosureReportData(activeReportPeriodType, activeReportFilterVal);
  const st = data.stats;
  const lines = [
    '============================================================',
    data.storeName + ' - RIF: ' + data.storeRif,
    data.title + ' (' + data.periodLabel + ')',
    'Emitido: ' + data.emittedAt + ' | Tasa BCV: ' + st.bcv.toFixed(2) + ' Bs/$',
    '============================================================',
    '',
    '1. RESUMEN DE VENTAS E IMPUESTOS (IVA 16%):',
    '   - Ordenes cobradas:       ' + st.ordersCount,
    '   - Ventas Exentas (0%):    ' + MTP.fmtUSD(st.exentoUsd),
    '   - Base Gravada (16%):     ' + MTP.fmtUSD(st.baseG16Usd),
    '   - IVA 16% Recaudado:      ' + MTP.fmtUSD(st.ivaUsd) + ' (' + MTP.fmtBsRaw(st.ivaBs) + ')',
    '   - TOTAL COBRADO BRUTO:    ' + MTP.fmtUSD(st.grossSalesUsd) + ' (' + MTP.fmtBsRaw(st.grossSalesBs) + ')',
    '   - Compras y Gastos:      -' + MTP.fmtUSD(st.totalExpensesUsd),
    '   - GANANCIA NETA LIMPIA:  +' + MTP.fmtUSD(st.netOperatingProfitUsd),
    '',
    '2. DINERO NETO EN MANO Y BANCOS:',
    '   - Efectivo USD en Gaveta: ' + MTP.fmtUSD(st.netDrawerUsd),
    '   - Efectivo Bs en Gaveta:  ' + MTP.fmtBsRaw(st.netDrawerBs),
    '   - Pago Movil Neto (Bs):   ' + MTP.fmtBsRaw(st.netBankPmBs),
    '   - Punto de Venta (Bs):    ' + MTP.fmtBsRaw(st.inPuntoBs),
    '   - Zelle / Transf (USD):   ' + MTP.fmtUSD(st.inZelleUsd),
    '',
    '3. COMIDA PREPARADA EN COCINA VS MERCANCIA EMPAQUETADA:',
    '   - Platos Preparados en Cocina: ' + st.kitchenPreparedQty + ' platos (' + MTP.fmtUSD(st.kitchenSalesUsd) + ')',
    '   - Mercancia Empaquetada:       ' + st.retailSoldQty + ' unidades (' + MTP.fmtUSD(st.retailSalesUsd) + ')',
    '',
    '4. INGREDIENTES DE COCINA CONSUMIDOS:',
    ...(st.kitchenIngredientsUsed.length
      ? st.kitchenIngredientsUsed.map(i => '   * ' + i.name + ': -' + MTP.fmtWeight(i.qtyUsed, i.unit) + ' (Quedan: ' + MTP.fmtWeight(i.remainingStock, i.unit) + ')')
      : ['   * Sin consumo de ingredientes registrado en este periodo']),
    '============================================================'
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RESUMEN-${data.fileSlug}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  MTP.toast(`Archivo RESUMEN-${data.fileSlug}.txt descargado`);
}

document.addEventListener('DOMContentLoaded', () => {
  const savedClosuresBody = document.getElementById('savedDailyClosuresBody');
  if (savedClosuresBody) {
    savedClosuresBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-closure-date]');
      if (!btn) return;
      openClosureReportModal('DIARIO', btn.dataset.closureDate || '');
    });
  }

  const termGrid = document.getElementById('posTerminalsStatusGrid');
  if (termGrid) {
    termGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-close-batch-term]');
      if (!btn) return;
      openBatchClosureModal(btn.dataset.closeBatchTerm || '');
    });
  }

  const pmTable = document.getElementById('pmVerificationTable');
  if (pmTable) {
    pmTable.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-pm-sale]');
      if (!btn) return;
      verifyPmFromPc(
        btn.dataset.pmSale || '',
        btn.dataset.pmRef || '',
        btn.dataset.pmId || '',
        btn.dataset.pmStatus || 'CONCILIADO'
      );
    });
  }

  populateYearSelect();
  renderCierrePage();
});

window.addEventListener('mtp:state-updated', () => {
  if (currentCierreTab === 'DIARIO') renderCierrePage();
  else if (currentCierreTab === 'MENSUAL') renderMonthlyPane();
  else if (currentCierreTab === 'ANUAL') renderAnnualPane();
});
