/* ==========================================================================
   MI-TIENDA-POS — Motor de Lector de Código de Barras (USB + Cámara Web) v7
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MTPBarcode = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let buffer = '';
  let lastKeyTime = 0;
  const listeners = [];
  let activeStream = null;
  let scanInterval = null;
  let currentCallback = null;
  let lastDetectedCode = '';
  let lastDetectedTime = 0;

  /**
   * Determina si el elemento activo es un campo de captura de datos (input, textarea, select, editable)
   * donde el escáner no debe escribir accidentalmente.
   * El input principal de búsqueda 'posScannerInput' SÍ está habilitado para recibir lecturas.
   *
   * @param {HTMLElement|null} el
   * @returns {boolean}
   */
  function isBusyField(el) {
    if (!el) return false;
    if (el.id === 'posScannerInput') return false; // Este SÍ es para escanear
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  /**
   * Comprueba de manera honesta si la API nativa de BarcodeDetector está disponible.
   * En Chromium 109 / navegadores heredados no existe.
   *
   * @returns {boolean}
   */
  function cameraAvailable() {
    return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function';
  }

  /* 1. Escucha automática de pistola lectora de código de barras USB */
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (e) {
      const active = document.activeElement;
      if (active && active.id === 'posScannerInput') {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 85) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          e.preventDefault();
          const code = buffer.trim();
          buffer = '';
          triggerScan(code);
          return;
        }
        buffer = '';
        return;
      }

      // Si el foco está en un campo de captura (busy), NO acumular el buffer
      if (isBusyField(active)) {
        if (buffer.length) {
          buffer = '';
        }
        return;
      }

      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        buffer += e.key;
      }
    });
  }

  function triggerScan(code) {
    const clean = String(code || '').trim();
    if (!clean) return;

    listeners.forEach(function (fn) {
      try {
        fn(clean);
      } catch (err) {
        console.error(err);
      }
    });

    // Comprobación de existencia del producto en catálogo
    let found = false;
    if (typeof window !== 'undefined' && window.MTP && typeof window.MTP.findByCodeOrBarcode === 'function') {
      const match = window.MTP.findByCodeOrBarcode(clean, false);
      if (match) found = true;
    }
    if (!found && typeof window !== 'undefined' && window.MTP && window.MTP.state) {
      const qLower = clean.toLowerCase();
      const varMatches = (window.MTP.state.variants || []).filter(function (v) {
        return v.active !== false && v.name && v.name.toLowerCase().includes(qLower);
      });
      const retMatches = (window.MTP.state.inventory || []).filter(function (i) {
        return i.sellable && i.name && i.name.toLowerCase().includes(qLower);
      });
      if (varMatches.length === 1 || retMatches.length === 1) {
        found = true;
      }
    }

    if (!found && typeof window !== 'undefined' && window.MTP && typeof window.MTP.toast === 'function') {
      window.MTP.toast('Código no encontrado: ' + clean + '. Puede buscarlo por nombre.', 'warn');
    }
  }

  function onBarcodeScan(callback) {
    if (typeof callback === 'function') {
      listeners.push(callback);
    }
  }

  function handleDetected(codeStr) {
    const clean = String(codeStr || '').trim();
    if (!clean) return;
    closeCameraScannerModal();
    if (typeof currentCallback === 'function') {
      currentCallback(clean);
    } else {
      triggerScan(clean);
    }
  }

  function submitManualCode() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('mtpCameraScannerModal');
    if (!modal) return;
    const inp = modal.querySelector('#mtpManualBarcodeInput') || modal.querySelector('#bcManualInput');
    if (inp && inp.value) {
      const code = inp.value.trim();
      if (code) {
        handleDetected(code);
      }
    }
  }

  /* 2. Modal de Escáner por Cámara Web (getUserMedia + BarcodeDetector API) */
  async function openCameraScannerModal(customCallback) {
    if (typeof document === 'undefined') return;
    currentCallback = typeof customCallback === 'function' ? customCallback : null;

    const hasDetector = cameraAvailable();

    let modal = document.getElementById('mtpCameraScannerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mtpCameraScannerModal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);

      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeCameraScannerModal();
      });
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-hd">
          <h3 style="margin:0;font-size:16px;font-weight:800;color:var(--txt-1,#0f172a);display:flex;align-items:center;gap:8px">
            📷 Escanear con la cámara / Lector
          </h3>
          <button type="button" class="btn btn-secondary btn-sm" id="mtpCamCloseBtn">✕</button>
        </div>
        <div class="modal-bd">
          ${!hasDetector ? `
            <div class="alert alert-warn" style="margin-bottom:12px;padding:10px 12px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:8px;font-size:13px;line-height:1.4">
              <strong>⚠ Cámara no disponible en este equipo</strong><br>
              Este navegador no cuenta con detección nativa de códigos (BarcodeDetector no disponible). Use su pistola lectora USB o escriba el código abajo.
            </div>
          ` : ''}

          <div style="position:relative;background:#0f172a;border-radius:12px;overflow:hidden;height:230px;display:flex;align-items:center;justify-content:center;border:2px solid #10b981">
            <video id="mtpCameraVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
            <div style="position:absolute;inset:25px 45px;border:2px dashed rgba(16,185,129,0.85);border-radius:10px;pointer-events:none;box-shadow:0 0 0 9999px rgba(15,23,42,0.38)"></div>
            <div id="mtpCameraStatus" style="position:absolute;bottom:8px;left:10px;right:10px;background:rgba(15,23,42,0.85);color:#a7f3d0;font-size:0.75rem;padding:5px 10px;border-radius:6px;text-align:center;font-weight:700">
              ${hasDetector ? 'Iniciando cámara para escanear código de barras EAN-13 / QR...' : 'Cámara no disponible en este equipo (use pistola USB o código)'}
            </div>
          </div>

          <div class="form-group" style="margin-top:12px">
            <label style="font-size:12px;font-weight:700;color:var(--txt-1,#334155);display:block;margin-bottom:6px">
              🔫 O ingresa / dispara con Lector USB el Código de Barras:
            </label>
            <div style="display:flex;gap:6px">
              <input type="text" id="mtpManualBarcodeInput" class="input" placeholder="Ej: 7591001000015 (Harina PAN), 7592001000112 (Pepito)..." style="font-family:monospace;font-weight:700;flex:1">
            </div>
          </div>

          <div style="margin-top:12px">
            <div style="font-size:11px;font-weight:800;color:var(--txt-3,#64748b);text-transform:uppercase;margin-bottom:6px">
              ⚡ Prueba rápida de códigos venezolanos comunes (759):
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px" id="mtpQuickBarcodeSamples">
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7591001000015">🌽 Harina P.A.N. (7591001000015)</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7591003000033">🍝 Espagueti 1Kg (7591003000033)</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7592001000112">🧀 Pepito Original (7592001000112)</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7592001000136">🐆 Cheetos (7592001000136)</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7591005000044">🥤 Frescolita (7591005000044)</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7594001000310">🍻 Polar Pilsen (7594001000310)</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bcode="7593001000211">🚬 Belmont 20 (7593001000211)</button>
            </div>
          </div>
        </div>
        <div class="modal-ft" style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-secondary" id="mtpCamCloseFooterBtn">Cerrar</button>
          <button type="button" class="btn btn-action" id="mtpManualBarcodeBtn">Buscar código</button>
        </div>
      </div>
    `;

    const closeHeaderBtn = modal.querySelector('#mtpCamCloseBtn');
    if (closeHeaderBtn) closeHeaderBtn.onclick = closeCameraScannerModal;

    const closeFooterBtn = modal.querySelector('#mtpCamCloseFooterBtn');
    if (closeFooterBtn) closeFooterBtn.onclick = closeCameraScannerModal;

    const manualInp = modal.querySelector('#mtpManualBarcodeInput');
    const manualBtn = modal.querySelector('#mtpManualBarcodeBtn');
    if (manualBtn && manualInp) {
      manualBtn.onclick = function () {
        submitManualCode();
      };
      manualInp.onkeydown = function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitManualCode();
        }
      };
    }

    modal.querySelectorAll('#mtpQuickBarcodeSamples [data-bcode]').forEach(function (btn) {
      btn.onclick = function () {
        handleDetected(btn.getAttribute('data-bcode'));
      };
    });

    modal.classList.add('open');
    if (manualInp) {
      setTimeout(function () { manualInp.focus(); }, 100);
    }

    const video = modal.querySelector('#mtpCameraVideo');
    const statusEl = modal.querySelector('#mtpCameraStatus');

    if (hasDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false
        });
        if (video) video.srcObject = activeStream;
        if (statusEl) statusEl.textContent = '✅ Cámara activa: Apunta al código de barras o QR del producto';

        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'qr_code']
        });
        scanInterval = setInterval(async function () {
          if (video && video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              if (codes && codes.length > 0 && codes[0].rawValue) {
                const raw = String(codes[0].rawValue).trim();
                const now = Date.now();
                // Debounce de 2 segundos para evitar lecturas duplicadas continuas
                if (raw && (raw !== lastDetectedCode || (now - lastDetectedTime > 2000))) {
                  lastDetectedCode = raw;
                  lastDetectedTime = now;
                  handleDetected(raw);
                }
              }
            } catch (err) {
              // ignore frame error
            }
          }
        }, 280);
      } catch (err) {
        if (statusEl) statusEl.textContent = 'ℹ️ Cámara no detectada o sin permiso. Use el lector USB o el campo inferior.';
      }
    } else {
      if (statusEl) statusEl.textContent = 'Cámara no disponible en este equipo (use pistola USB o código)';
    }
  }

  function closeCameraScannerModal() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (activeStream) {
      activeStream.getTracks().forEach(function (t) { t.stop(); });
      activeStream = null;
    }
    currentCallback = null;
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('mtpCameraScannerModal');
      if (modal) {
        modal.classList.remove('open');
      }
    }
  }

  function generateBarcodeSvg(codeStr, height) {
    const h = height || 34;
    const str = String(codeStr || '000000');
    const bars = [2, 1, 1, 2];
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      bars.push(((ch >> 0) & 1) + 1);
      bars.push(((ch >> 1) & 1) + 1);
      bars.push(((ch >> 2) & 1) + 1);
      bars.push(((ch >> 3) & 1) + 1);
    }
    bars.push(2, 1, 2, 1);

    let x = 5;
    let rects = '';
    for (let i = 0; i < bars.length; i++) {
      const w = bars[i] * 1.5;
      if (i % 2 === 0) {
        rects += `<rect x="${x.toFixed(1)}" y="2" width="${w.toFixed(1)}" height="${h}" fill="#0f172a"/>`;
      }
      x += w;
    }
    const totalW = Math.ceil(x + 5);
    return `
      <svg viewBox="0 0 ${totalW} ${h + 15}" width="100%" height="${h + 15}" xmlns="http://www.w3.org/2000/svg" style="max-width:165px;display:block;margin:0 auto">
        <rect width="100%" height="100%" fill="#ffffff" rx="3"/>
        ${rects}
        <text x="${totalW / 2}" y="${h + 12}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#0f172a">${str}</text>
      </svg>
    `;
  }

  return {
    isBusyField: isBusyField,
    cameraAvailable: cameraAvailable,
    onBarcodeScan: onBarcodeScan,
    triggerScan: triggerScan,
    openCameraScannerModal: openCameraScannerModal,
    closeCameraScannerModal: closeCameraScannerModal,
    submitManualCode: submitManualCode,
    generateBarcodeSvg: generateBarcodeSvg
  };
});
