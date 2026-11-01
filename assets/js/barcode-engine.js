/* ==========================================================================
   MI-TIENDA-POS — Motor de Lector de Código de Barras (USB + Cámara Web)
   ========================================================================== */
(function () {
  let buffer = '';
  let lastKeyTime = 0;
  const listeners = [];
  let activeStream = null;
  let scanInterval = null;

  /* 1. Escucha automática de pistola lectora de código de barras USB */
  document.addEventListener('keydown', function (e) {
    const active = document.activeElement;
    const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

    if (isInput && active.id === 'posScannerInput') {
      return;
    }

    const now = Date.now();
    if (now - lastKeyTime > 85) {
      buffer = '';
    }
    lastKeyTime = now;

    if (e.key === 'Enter' && buffer.length >= 2) {
      if (!isInput) {
        e.preventDefault();
        const code = buffer.trim();
        buffer = '';
        triggerScan(code);
      }
      buffer = '';
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      buffer += e.key;
    }
  });

  function triggerScan(code) {
    listeners.forEach(fn => fn(code));
  }

  function onBarcodeScan(callback) {
    if (typeof callback === 'function') {
      listeners.push(callback);
    }
  }

  /* 2. Modal de Escáner por Cámara Web (getUserMedia + BarcodeDetector API) */
  async function openCameraScannerModal(customCallback) {
    let modal = document.getElementById('mtpCameraScannerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mtpCameraScannerModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:520px">
          <div class="modal-head">
            <h3>📷 Escáner de Cámara / Lector de Código de Barras</h3>
            <button class="btn btn-sm btn-outline" id="mtpCamCloseBtn">✕ Cerrar</button>
          </div>
          <div class="modal-body">
            <div style="position:relative;background:#0f172a;border-radius:12px;overflow:hidden;height:230px;display:flex;align-items:center;justify-content:center;border:2px solid #10b981">
              <video id="mtpCameraVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
              <div style="position:absolute;inset:25px 45px;border:2px dashed rgba(16,185,129,0.85);border-radius:10px;pointer-events:none;box-shadow:0 0 0 9999px rgba(15,23,42,0.38)"></div>
              <div id="mtpCameraStatus" style="position:absolute;bottom:8px;left:10px;right:10px;background:rgba(15,23,42,0.85);color:#a7f3d0;font-size:0.75rem;padding:5px 10px;border-radius:6px;text-align:center;font-weight:700">
                Iniciando cámara para escanear código de barras EAN-13 / QR...
              </div>
            </div>

            <div style="margin-top:12px;background:#f8fafc;padding:10px;border-radius:10px;border:1px solid #e2e8f0">
              <label style="font-size:0.74rem;font-weight:800;color:#334155;display:block;margin-bottom:5px">
                🔫 O ingresa / dispara con Lector USB el Código de Barras del empaque:
              </label>
              <div style="display:flex;gap:6px">
                <input type="text" id="mtpManualBarcodeInput" class="form-control" placeholder="Ej: 7591001000015 (Harina PAN), 7592001000112 (Pepito)..." style="font-family:monospace;font-weight:700">
                <button class="btn btn-primary btn-sm" id="mtpManualBarcodeBtn">Procesar</button>
              </div>
            </div>

            <div style="margin-top:10px">
              <div style="font-size:0.7rem;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:6px">
                ⚡ Prueba Rápida de Empaques Reales con Código de Barras Venezolano (759):
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:5px" id="mtpQuickBarcodeSamples">
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7591001000015">🌽 Harina P.A.N. (7591001000015)</button>
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7591003000033">🍝 Espagueti 1Kg (7591003000033)</button>
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7592001000112">🧀 Pepito Original (7592001000112)</button>
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7592001000136">🐆 Cheetos (7592001000136)</button>
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7591005000044">🥤 Frescolita (7591005000044)</button>
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7594001000310">🍻 Polar Pilsen (7594001000310)</button>
                <button type="button" class="btn btn-xs btn-outline" data-bcode="7593001000211">🚬 Belmont 20 (7593001000211)</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#mtpCamCloseBtn').addEventListener('click', closeCameraScannerModal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeCameraScannerModal();
      });
    }

    const handleDetected = function (codeStr) {
      const clean = String(codeStr || '').trim();
      if (!clean) return;
      closeCameraScannerModal();
      if (typeof customCallback === 'function') {
        customCallback(clean);
      } else {
        triggerScan(clean);
      }
    };

    const manualInp = modal.querySelector('#mtpManualBarcodeInput');
    const manualBtn = modal.querySelector('#mtpManualBarcodeBtn');
    manualInp.value = '';
    manualBtn.onclick = () => handleDetected(manualInp.value);
    manualInp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleDetected(manualInp.value);
      }
    };

    modal.querySelectorAll('#mtpQuickBarcodeSamples [data-bcode]').forEach(btn => {
      btn.onclick = () => handleDetected(btn.getAttribute('data-bcode'));
    });

    modal.classList.add('open');
    setTimeout(() => manualInp.focus(), 100);

    const video = modal.querySelector('#mtpCameraVideo');
    const statusEl = modal.querySelector('#mtpCameraStatus');

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false
        });
        video.srcObject = activeStream;
        statusEl.textContent = '✅ Cámara activa: Apunta al código de barras o QR del producto';

        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'qr_code']
          });
          scanInterval = setInterval(async () => {
            if (video.readyState >= 2) {
              try {
                const codes = await detector.detect(video);
                if (codes && codes.length > 0 && codes[0].rawValue) {
                  handleDetected(codes[0].rawValue);
                }
              } catch (err) {
                // ignore frame error
              }
            }
          }, 280);
        } else {
          statusEl.textContent = '📷 Cámara activa · Usa también tu lector USB o ingresa el código abajo';
        }
      } catch (err) {
        statusEl.textContent = 'ℹ️ Cámara no detectada o sin permiso. Usa el lector USB o el campo inferior.';
      }
    } else {
      statusEl.textContent = 'ℹ️ Usa tu lector de código de barras USB o escribe el código abajo.';
    }
  }

  function closeCameraScannerModal() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
    const modal = document.getElementById('mtpCameraScannerModal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  function generateBarcodeSvg(codeStr, height = 34) {
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
        rects += `<rect x="${x.toFixed(1)}" y="2" width="${w.toFixed(1)}" height="${height}" fill="#0f172a"/>`;
      }
      x += w;
    }
    const totalW = Math.ceil(x + 5);
    return `
      <svg viewBox="0 0 ${totalW} ${height + 15}" width="100%" height="${height + 15}" xmlns="http://www.w3.org/2000/svg" style="max-width:165px;display:block;margin:0 auto">
        <rect width="100%" height="100%" fill="#ffffff" rx="3"/>
        ${rects}
        <text x="${totalW / 2}" y="${height + 12}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#0f172a">${str}</text>
      </svg>
    `;
  }

  window.MTPBarcode = {
    onBarcodeScan,
    openCameraScannerModal,
    closeCameraScannerModal,
    generateBarcodeSvg
  };
})();
