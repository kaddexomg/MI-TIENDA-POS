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
  let remoteSse = null;
  let remotePollTimer = null;
  let remoteBridgeStarted = false;
  let lastRemoteScanSeq = 0;
  const seenRemoteScanIds = new Set();
  let remoteScanCount = 0;
  let lastRemoteScanSummary = '';

  function parseScanMultiplier(rawCode) {
    const clean = String(rawCode || '').trim();
    if (!clean) return { raw: '', code: '', qty: 1 };
    const starIdx = clean.indexOf('*');
    if (starIdx > 0) {
      const mult = parseInt(clean.slice(0, starIdx), 10);
      const rest = clean.slice(starIdx + 1).trim();
      if (!isNaN(mult) && mult > 0 && mult <= 999 && rest) {
        return { raw: clean, code: rest, qty: mult };
      }
    }
    return { raw: clean, code: clean, qty: 1 };
  }

  function resolveApiBaseUrl() {
    if (typeof window === 'undefined') return '';
    if (window.MTPApiClient && typeof window.MTPApiClient.getActiveBaseUrl === 'function') {
      const u = window.MTPApiClient.getActiveBaseUrl();
      if (u) return String(u).replace(/\/+$/, '');
    }
    if (window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      return String(window.location.origin).replace(/\/+$/, '');
    }
    return 'http://127.0.0.1:7070';
  }

  function resolveApiToken() {
    if (typeof window === 'undefined') return '';
    if (window.MTPApiClient && typeof window.MTPApiClient.getAuthToken === 'function') {
      const t = window.MTPApiClient.getAuthToken();
      if (t) return t;
    }
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mtp_api_token')) {
        return sessionStorage.getItem('mtp_api_token') || '';
      }
      if (typeof localStorage !== 'undefined' && localStorage.getItem('mtp_api_token')) {
        return localStorage.getItem('mtp_api_token') || '';
      }
    } catch (_) {}
    return '';
  }

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
    const parsed = parseScanMultiplier(clean);
    const lookupCode = parsed.code || clean;

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
      const match = window.MTP.findByCodeOrBarcode(lookupCode, false);
      if (match) found = true;
    }
    if (!found && typeof window !== 'undefined' && window.MTP && window.MTP.state) {
      const qLower = lookupCode.toLowerCase();
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
      window.MTP.toast('Código no encontrado: ' + lookupCode + '. Puede buscarlo por nombre.', 'warn');
    }
  }

  function onBarcodeScan(callback) {
    if (typeof callback === 'function') {
      listeners.push(callback);
    }
  }

  function escHtml(str) {
    if (typeof window !== 'undefined' && window.MTP && typeof window.MTP.escapeHtml === 'function') {
      return window.MTP.escapeHtml(str);
    }
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function handleDetected(codeStr) {
    const clean = String(codeStr || '').trim();
    if (!clean) return;
    const cb = currentCallback;
    closeCameraScannerModal();
    if (typeof cb === 'function') {
      cb(clean);
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
        <div class="modal-bd" style="max-height:78vh;overflow-y:auto">
          ${!hasDetector ? `
            <div class="alert alert-warn" style="margin-bottom:12px;padding:10px 12px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:8px;font-size:13px;line-height:1.4">
              <strong>⚠ Cámara no disponible en este equipo</strong><br>
              Este navegador no cuenta con detección nativa de códigos (BarcodeDetector no disponible). Use su pistola USB, el teléfono como lector inalámbrico o escriba el código abajo.
            </div>
          ` : ''}

          <div style="position:relative;background:#0f172a;border-radius:12px;overflow:hidden;height:210px;display:flex;align-items:center;justify-content:center;border:2px solid #10b981">
            <video id="mtpCameraVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
            <div style="position:absolute;inset:25px 45px;border:2px dashed rgba(16,185,129,0.85);border-radius:10px;pointer-events:none;box-shadow:0 0 0 9999px rgba(15,23,42,0.38)"></div>
            <div id="mtpCameraStatus" style="position:absolute;bottom:8px;left:10px;right:10px;background:rgba(15,23,42,0.85);color:#a7f3d0;font-size:0.75rem;padding:5px 10px;border-radius:6px;text-align:center;font-weight:700">
              ${hasDetector ? 'Iniciando cámara para escanear código de barras EAN-13 / QR...' : 'Cámara no disponible en este equipo (use pistola USB o teléfono)'}
            </div>
          </div>

          <div id="mtpPhoneBridgeCard" style="margin-top:12px;padding:12px;border-radius:12px;background:#f0fdf4;border:1.5px solid #86efac">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <div style="font-size:13px;font-weight:800;color:#065f46;display:flex;align-items:center;gap:6px">
                📱 Usar Teléfono como Pistola Lectora Inalámbrica
              </div>
              <span id="mtpPhoneBridgeCounter" style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#dcfce7;color:#166534">
                Recibidos: ${remoteScanCount}
              </span>
            </div>
            <div style="font-size:12px;color:#14532d;line-height:1.4;margin-bottom:8px">
              Abre este enlace en el navegador de tu teléfono (o desde la app Android 📷 Escáner POS) para enviar códigos directo a esta caja en vivo:
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <input type="text" id="mtpPhoneBridgeUrl" readonly value="Cargando enlace del servidor..." class="input" style="font-family:monospace;font-size:12px;font-weight:700;flex:1;min-width:190px;background:#ffffff;color:#0f172a;padding:6px 8px">
              <button type="button" class="btn btn-secondary btn-sm" id="mtpPhoneCopyBtn">📋 Copiar</button>
              <button type="button" class="btn btn-primary btn-sm" id="mtpPhoneOpenBtn">↗️ Abrir</button>
            </div>
            <div style="display:flex;gap:12px;align-items:center;margin-top:10px;flex-wrap:wrap">
              <div id="mtpPhoneQrBox" style="background:#ffffff;border-radius:10px;padding:6px;border:1px solid #bbf7d0;line-height:0;flex-shrink:0"></div>
              <div style="font-size:12px;color:#14532d;line-height:1.55;flex:1;min-width:180px">
                <strong>Conecta el teléfono en 2 pasos:</strong><br>
                1️⃣ Abre la cámara del teléfono y apunta a este QR.<br>
                2️⃣ La primera vez acepta el certificado de seguridad. Listo: cada lectura llega aquí al instante, a la Caja o al Inventario según la pantalla abierta.
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:#166534;font-weight:700">
              <span>Clave enlace: <strong id="mtpPhonePairCode" style="font-family:monospace;letter-spacing:1px">------</strong></span>
              <span id="mtpPhoneLastScan">${lastRemoteScanSummary ? ('Último: ' + escHtml(lastRemoteScanSummary)) : 'Esperando lecturas del teléfono...'}</span>
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
            <div style="font-size:12px;font-weight:800;color:var(--txt-3,#64748b);text-transform:uppercase;margin-bottom:6px">
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
    loadPhoneBridgeInfo(modal);
    startRemoteScannerBridge();
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
        <text x="${totalW / 2}" y="${h + 12}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#0f172a">${escHtml(str)}</text>
      </svg>
    `;
  }

  function updateBridgeModalUi() {
    if (typeof document === 'undefined') return;
    const countEl = document.getElementById('mtpPhoneBridgeCounter');
    if (countEl) countEl.textContent = 'Recibidos: ' + remoteScanCount;
    const lastEl = document.getElementById('mtpPhoneLastScan');
    if (lastEl && lastRemoteScanSummary) {
      lastEl.textContent = 'Último: ' + lastRemoteScanSummary;
    }
  }

  function loadPhoneBridgeInfo(modal) {
    if (!modal || typeof fetch !== 'function') return;
    const urlInput = modal.querySelector('#mtpPhoneBridgeUrl');
    const pairEl = modal.querySelector('#mtpPhonePairCode');
    const copyBtn = modal.querySelector('#mtpPhoneCopyBtn');
    const openBtn = modal.querySelector('#mtpPhoneOpenBtn');
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) return;

    const tok = resolveApiToken();
    const headers = tok ? { Authorization: 'Bearer ' + tok } : {};
    fetch(baseUrl + '/api/v1/scanner/info?_t=' + Date.now(), { method: 'GET', headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) return;
        const bestUrl = (data.lanHttpsScannerUrls && data.lanHttpsScannerUrls[0]) || data.httpsScannerUrl ||
          (data.lanScannerUrls && data.lanScannerUrls[0]) || data.scannerUrl || (baseUrl + '/escaner');
        if (urlInput) urlInput.value = bestUrl;
        if (pairEl) pairEl.textContent = data.pairCode || 'PIN';
        const qrBox = modal.querySelector('#mtpPhoneQrBox');
        if (qrBox && typeof window !== 'undefined' && window.MTPQR && typeof window.MTPQR.svg === 'function') {
          qrBox.innerHTML = window.MTPQR.svg(bestUrl, 148);
        }
        if (copyBtn) {
          copyBtn.onclick = function () {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(bestUrl).then(function () {
                if (window.MTP && typeof window.MTP.toast === 'function') {
                  window.MTP.toast('Enlace del escáner copiado al portapapeles.', 'ok');
                }
              }).catch(function () {
                if (urlInput) { urlInput.select(); document.execCommand && document.execCommand('copy'); }
              });
            } else if (urlInput) {
              urlInput.select();
              if (document.execCommand) document.execCommand('copy');
            }
          };
        }
        if (openBtn) {
          openBtn.onclick = function () {
            if (typeof window !== 'undefined' && typeof window.open === 'function') {
              window.open(bestUrl, '_blank', 'noopener');
            }
          };
        }
      })
      .catch(function () {
        if (urlInput) urlInput.value = baseUrl + '/escaner';
      });
  }

  function findOpenBarcodeField() {
    if (typeof document === 'undefined') return null;
    const candidateIds = ['drawerBarcode', 'invEditBarcode', 'invBarcodeInput', 'bcManualInput'];
    const activeEl = document.activeElement;
    for (let i = 0; i < candidateIds.length; i++) {
      const el = document.getElementById(candidateIds[i]);
      if (!el) continue;
      if (activeEl === el) return el;
      const openWrap = typeof el.closest === 'function'
        ? el.closest('.open, .modal-backdrop.open, .drawer.open, .sheet-backdrop.open, .drawer-backdrop.open')
        : null;
      if (openWrap) return el;
    }
    return null;
  }

  function dispatchInputEvents(el) {
    if (!el || typeof document === 'undefined') return;
    try {
      if (typeof Event === 'function') {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_) {}
  }

  function handleRemoteScan(scanObj) {
    if (!scanObj || typeof scanObj !== 'object') return false;
    const rawCode = String(scanObj.code || '').trim();
    if (!rawCode) return false;
    const mode = String(scanObj.mode || 'POS_ADD').trim().toUpperCase();
    if (mode === 'LOOKUP') return false;

    const seq = typeof scanObj.seq === 'number' ? scanObj.seq : 0;
    const id = scanObj.id ? String(scanObj.id) : '';
    if (id && seenRemoteScanIds.has(id)) return false;
    if (seq > 0 && seq <= lastRemoteScanSeq) return false;

    if (id) {
      seenRemoteScanIds.add(id);
      if (seenRemoteScanIds.size > 200) {
        const firstId = seenRemoteScanIds.values().next().value;
        if (firstId) seenRemoteScanIds.delete(firstId);
      }
    }
    if (seq > lastRemoteScanSeq) lastRemoteScanSeq = seq;

    const parsed = parseScanMultiplier(rawCode);
    const cleanCode = parsed.code || rawCode;
    const qty = Math.max(1, parseInt(scanObj.qty, 10) || parsed.qty || 1);
    const dispatchCode = qty > 1 ? (qty + '*' + cleanCode) : cleanCode;

    remoteScanCount += 1;
    lastRemoteScanSummary = (qty > 1 ? (qty + '× ') : '') + cleanCode +
      (scanObj.match && scanObj.match.name ? (' — ' + scanObj.match.name) : '');
    updateBridgeModalUi();

    if (typeof document !== 'undefined') {
      const camModal = document.getElementById('mtpCameraScannerModal');
      if (camModal && camModal.classList && camModal.classList.contains('open') && typeof currentCallback === 'function') {
        handleDetected(cleanCode);
        return true;
      }

      const openField = findOpenBarcodeField();
      if (openField) {
        openField.value = cleanCode;
        dispatchInputEvents(openField);
        if (openField.focus) openField.focus();
        if (typeof window !== 'undefined' && window.MTP && typeof window.MTP.toast === 'function') {
          window.MTP.toast('📱 Código recibido en campo: ' + cleanCode, 'ok');
        }
        return true;
      }
    }

    // En modo INVENTORY_FILL la pantalla de Inventario reacciona al evento
    // (abre "Llegó mercancía" o suma al conteo); no se dispara el flujo de Caja.
    if (mode !== 'INVENTORY_FILL') {
      triggerScan(dispatchCode);
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('mtp:remote-barcode', { detail: scanObj }));
      } catch (_) {}
    }
    return true;
  }

  function pollRemoteScansOnce() {
    if (typeof fetch !== 'function') return Promise.resolve();
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) return Promise.resolve();
    const tok = resolveApiToken();
    const headers = tok ? { Authorization: 'Bearer ' + tok } : {};
    const url = baseUrl + '/api/v1/scanner/poll?sinceSeq=' + encodeURIComponent(String(lastRemoteScanSeq)) + '&_t=' + Date.now();
    return fetch(url, { method: 'GET', headers: headers, cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) return;
        if (Array.isArray(data.scans)) {
          for (let i = 0; i < data.scans.length; i++) {
            handleRemoteScan(data.scans[i]);
          }
        }
        if (typeof data.lastSeq === 'number' && data.lastSeq > lastRemoteScanSeq && (!data.scans || data.scans.length === 0)) {
          lastRemoteScanSeq = data.lastSeq;
        }
      })
      .catch(function () {});
  }

  function connectRemoteScannerSse(baseUrl, tok) {
    if (typeof EventSource !== 'function' || !baseUrl) return;
    if (remoteSse) {
      try { remoteSse.close(); } catch (_) {}
      remoteSse = null;
    }
    let streamUrl = baseUrl + '/api/v1/scanner/stream';
    const qs = [];
    if (tok) qs.push('token=' + encodeURIComponent(tok));
    if (lastRemoteScanSeq > 0) qs.push('sinceSeq=' + encodeURIComponent(String(lastRemoteScanSeq)));
    if (qs.length > 0) streamUrl += '?' + qs.join('&');

    try {
      remoteSse = new EventSource(streamUrl);
      remoteSse.addEventListener('scanner_ready', function (e) {
        try {
          const info = JSON.parse(e.data);
          if (info && typeof info.lastScanSeq === 'number' && lastRemoteScanSeq === 0) {
            lastRemoteScanSeq = info.lastScanSeq;
          }
        } catch (_) {}
      });
      remoteSse.addEventListener('barcode_scan', function (e) {
        try {
          const scanObj = JSON.parse(e.data);
          handleRemoteScan(scanObj);
        } catch (_) {}
      });
      remoteSse.addEventListener('scanner_context', function (e) {
        try {
          const ctx = JSON.parse(e.data);
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('mtp:scanner-context', { detail: ctx }));
          }
        } catch (_) {}
      });
      remoteSse.onerror = function () {
        if (remoteSse) {
          try { remoteSse.close(); } catch (_) {}
          remoteSse = null;
        }
      };
    } catch (_) {}
  }

  function syncScannerBaselineAndConnect() {
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) return;
    const tok = resolveApiToken();
    const headers = tok ? { Authorization: 'Bearer ' + tok } : {};
    if (typeof fetch !== 'function') {
      connectRemoteScannerSse(baseUrl, tok);
      return;
    }
    fetch(baseUrl + '/api/v1/scanner/info?_t=' + Date.now(), { method: 'GET', headers: headers, cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && typeof data.lastScanSeq === 'number' && data.lastScanSeq > lastRemoteScanSeq) {
          lastRemoteScanSeq = data.lastScanSeq;
        }
      })
      .catch(function () {})
      .then(function () {
        if (remoteBridgeStarted && !remoteSse) {
          connectRemoteScannerSse(baseUrl, resolveApiToken());
        }
      });
  }

  function startRemoteScannerBridge() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__MTP_IS_SCANNER_APP__) return;
    if (window.location && window.location.pathname && /scanner\.html|\/escaner/i.test(window.location.pathname)) return;
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) return;

    if (!remoteBridgeStarted) {
      remoteBridgeStarted = true;
      syncScannerBaselineAndConnect();
    } else if (!remoteSse) {
      connectRemoteScannerSse(baseUrl, resolveApiToken());
    }

    if (!remotePollTimer) {
      remotePollTimer = setInterval(function () {
        if (!remoteSse || remoteSse.readyState !== 1) {
          pollRemoteScansOnce();
          const curBase = resolveApiBaseUrl();
          const curTok = resolveApiToken();
          if (curBase) connectRemoteScannerSse(curBase, curTok);
        }
      }, 2800);
    }
  }

  function stopRemoteScannerBridge() {
    if (remoteSse) {
      try { remoteSse.close(); } catch (_) {}
      remoteSse = null;
    }
    if (remotePollTimer) {
      clearInterval(remotePollTimer);
      remotePollTimer = null;
    }
    remoteBridgeStarted = false;
  }

  /* Contexto de pantalla activa: la PC le dice al servidor qué pantalla tiene
     abierta (Caja / Inventario / Gastos) para que el escáner del teléfono en
     modo AUTOMÁTICO enrute cada lectura al lugar correcto. Heartbeat 20 s. */
  let screenAnnounceTimer = null;
  let announcedScreen = '';
  let announcedLabel = '';

  function detectScreenFromLocation() {
    if (typeof window === 'undefined' || !window.location) return '';
    const p = String(window.location.pathname || '').toLowerCase();
    if (/pos\.html$|\/caja\//.test(p)) return 'pos';
    if (/inventario/.test(p)) return 'inventario';
    if (/facturas|gastos/.test(p)) return 'gastos';
    return '';
  }

  function announceScreen(screen, label) {
    const s = String(screen || detectScreenFromLocation() || '').trim().toLowerCase();
    if (!s) return;
    announcedScreen = s;
    if (label) announcedLabel = String(label);
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl || typeof fetch !== 'function') return;
    const send = function () {
      const tok = resolveApiToken();
      const headers = { 'Content-Type': 'application/json' };
      if (tok) headers.Authorization = 'Bearer ' + tok;
      try {
        fetch(baseUrl + '/api/v1/scanner/context', {
          method: 'POST',
          headers: headers,
          cache: 'no-store',
          body: JSON.stringify({
            screen: announcedScreen,
            label: announcedLabel,
            page: (typeof window !== 'undefined' && window.location) ? window.location.pathname : ''
          })
        }).catch(function () {});
      } catch (_) {}
    };
    send();
    if (!screenAnnounceTimer && typeof setInterval === 'function') {
      screenAnnounceTimer = setInterval(send, 20000);
    }
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const bootBridge = function () {
      setTimeout(function () {
        startRemoteScannerBridge();
        announceScreen();
      }, 250);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootBridge);
    } else {
      bootBridge();
    }
    window.addEventListener('mtp:api-online', function () {
      startRemoteScannerBridge();
      announceScreen();
    });
  }

  return {
    isBusyField: isBusyField,
    cameraAvailable: cameraAvailable,
    onBarcodeScan: onBarcodeScan,
    triggerScan: triggerScan,
    parseScanMultiplier: parseScanMultiplier,
    handleRemoteScan: handleRemoteScan,
    startRemoteScannerBridge: startRemoteScannerBridge,
    stopRemoteScannerBridge: stopRemoteScannerBridge,
    announceScreen: announceScreen,
    openCameraScannerModal: openCameraScannerModal,
    closeCameraScannerModal: closeCameraScannerModal,
    submitManualCode: submitManualCode,
    generateBarcodeSvg: generateBarcodeSvg
  };
});
