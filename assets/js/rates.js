/* ==========================================================================
   MI-TIENDA-POS — API Diaria de Tasas: BCV USD, Euro BCV y USDT Binance P2P
   ========================================================================== */
(function () {
  async function syncOfficialRates(silent = true) {
    if (!window.MTP) return;
    let updatedAny = false;

    try {
      // 1. Consultar DolarAPI Venezuela (BCV Oficial y Paralelo/USDT Binance)
      const res = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const oficial = data.find(d => d.fuente === 'oficial');
          const paralelo = data.find(d => d.fuente === 'paralelo');
          if (oficial && Number(oficial.promedio) > 0) {
            MTP.state.settings.rateBcv = Number(Number(oficial.promedio).toFixed(2));
            updatedAny = true;
          }
          if (paralelo && Number(paralelo.promedio) > 0) {
            MTP.state.settings.rateUsdt = Number(Number(paralelo.promedio).toFixed(2));
            updatedAny = true;
          }
        }
      }
    } catch (e) {
      // Continuar con respaldo para Euro
    }

    try {
      // 2. Consultar tasa Euro BCV o paridad internacional EUR/USD × BCV
      const resEur = await fetch('https://open.er-api.com/v6/latest/USD');
      if (resEur.ok) {
        const fx = await resEur.json();
        if (fx && fx.rates && fx.rates.EUR) {
          const eurUsdRatio = 1 / Number(fx.rates.EUR);
          MTP.state.settings.rateEur = Number((MTP.state.settings.rateBcv * eurUsdRatio).toFixed(2));
          updatedAny = true;
        }
      }
    } catch (e) {
      if (!MTP.state.settings.rateEur) {
        MTP.state.settings.rateEur = Number((MTP.state.settings.rateBcv * 1.088).toFixed(2));
      }
    }

    if (updatedAny) {
      MTP.state.settings.lastRateSync = new Date().toISOString();
      MTP.save();
      if (!silent) {
        MTP.toast(`Tasas sincronizadas: BCV ${MTP.state.settings.rateBcv} | EUR ${MTP.state.settings.rateEur} | USDT ${MTP.state.settings.rateUsdt} Bs`, 'ok');
      }
    } else if (!silent) {
      MTP.toast('Usando última tasa guardada localmente', 'warn');
    }
  }

  function openQuickRateModal() {
    if (!window.MTP) return;
    let modal = document.getElementById('mtpQuickRateModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mtpQuickRateModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:520px">
          <div class="modal-hd">
            <h3>Control de Tasas (BCV USD · Euro BCV · USDT Binance)</h3>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('mtpQuickRateModal').classList.remove('open')">✕</button>
          </div>
          <div class="modal-bd">
            <div class="form-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
              <div class="form-group">
                <label>Dólar BCV (Bs/$)</label>
                <input type="number" step="0.01" id="qrInputBcv" class="input" style="font-size:17px;font-weight:900;color:#059669" oninput="window.MTPRates.previewGapsInModal()">
              </div>
              <div class="form-group">
                <label>Euro BCV (Bs/€)</label>
                <input type="number" step="0.01" id="qrInputEur" class="input" style="font-size:17px;font-weight:900;color:#2563eb" oninput="window.MTPRates.previewGapsInModal()">
              </div>
              <div class="form-group">
                <label>USDT Binance (Bs/$)</label>
                <input type="number" step="0.01" id="qrInputUsdt" class="input" style="font-size:17px;font-weight:900;color:#d97706" oninput="window.MTPRates.previewGapsInModal()">
              </div>
            </div>

            <div id="qrGapPreviewBox" style="background:#0f172a;color:#fff;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12.5px"></div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:10px 12px;font-size:12px;color:#065f46">
              <strong>Protección Antiperdida Activa:</strong> El sistema calcula la brecha entre BCV, Euro y USDT Binance para recomendarte el precio exacto en USD BCV y que jamás pierdas capital al reponer mercancía.
            </div>
          </div>
          <div class="modal-ft">
            <button class="btn btn-ghost" onclick="window.MTPRates.syncOfficialRates(false)">Sincronizar desde API Hoy</button>
            <button class="btn btn-p" onclick="window.MTPRates.saveQuickRates()">Guardar las 3 Tasas</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    document.getElementById('qrInputBcv').value = MTP.state.settings.rateBcv;
    document.getElementById('qrInputEur').value = MTP.state.settings.rateEur || Number((MTP.state.settings.rateBcv * 1.088).toFixed(2));
    document.getElementById('qrInputUsdt').value = MTP.state.settings.rateUsdt;
    previewGapsInModal();
    modal.classList.add('open');
  }

  function previewGapsInModal() {
    const bcv = parseFloat(document.getElementById('qrInputBcv')?.value) || 1;
    const eur = parseFloat(document.getElementById('qrInputEur')?.value) || 1;
    const usdt = parseFloat(document.getElementById('qrInputUsdt')?.value) || 1;

    const gapBcvUsdt = (((usdt / bcv) - 1) * 100).toFixed(2);
    const gapBcvEur = (((eur / bcv) - 1) * 100).toFixed(2);
    const gapEurUsdt = (((usdt / eur) - 1) * 100).toFixed(2);
    const factor = (usdt / bcv).toFixed(3);

    const box = document.getElementById('qrGapPreviewBox');
    if (box) {
      box.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
          <div style="background:rgba(255,255,255,0.08);padding:8px;border-radius:7px">
            <span style="color:#94a3b8;font-size:11px;display:block">Brecha BCV ↔ Binance</span>
            <strong style="color:#fbbf24;font-size:15px">+${gapBcvUsdt}% (×${factor})</strong>
          </div>
          <div style="background:rgba(255,255,255,0.08);padding:8px;border-radius:7px">
            <span style="color:#94a3b8;font-size:11px;display:block">Brecha BCV ↔ Euro</span>
            <strong style="color:#60a5fa;font-size:15px">+${gapBcvEur}%</strong>
          </div>
          <div style="background:rgba(255,255,255,0.08);padding:8px;border-radius:7px">
            <span style="color:#94a3b8;font-size:11px;display:block">Brecha Euro ↔ Binance</span>
            <strong style="color:#34d399;font-size:15px">${gapEurUsdt}%</strong>
          </div>
        </div>
      `;
    }
  }

  function saveQuickRates() {
    const bcv = parseFloat(document.getElementById('qrInputBcv').value);
    const eur = parseFloat(document.getElementById('qrInputEur').value);
    const usdt = parseFloat(document.getElementById('qrInputUsdt').value);
    if (bcv > 0) MTP.state.settings.rateBcv = Number(bcv.toFixed(2));
    if (eur > 0) MTP.state.settings.rateEur = Number(eur.toFixed(2));
    if (usdt > 0) MTP.state.settings.rateUsdt = Number(usdt.toFixed(2));
    MTP.state.settings.lastRateSync = new Date().toISOString();
    MTP.save();
    document.getElementById('mtpQuickRateModal').classList.remove('open');
    MTP.toast(`Tasas guardadas: BCV ${MTP.state.settings.rateBcv} | EUR ${MTP.state.settings.rateEur} | USDT ${MTP.state.settings.rateUsdt}`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncOfficialRates(true);
  });

  window.MTPRates = {
    syncOfficialRates,
    openQuickRateModal,
    previewGapsInModal,
    saveQuickRates
  };
})();
