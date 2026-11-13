/* ==========================================================================
   MI-TIENDA-POS — barcode-printer.js (v8)
   Generador e Impresor de Etiquetas de Código de Barras y Control de Cocina.
   - Code 128-B Vectorial 100% Offline (Zero-CDNs)
   - Formatos: Térmica 50x30mm, 58mm/80mm y Plancha Hoja
   - Control de Tanda de Cocina, Fecha/Hora, Precios Duales ($ y Bs) y Fiscalidad
   ========================================================================== */
(function (root) {
  'use strict';

  const CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];

  function escHtml(str) {
    if (root.MTP && typeof root.MTP.escapeHtml === 'function') {
      return root.MTP.escapeHtml(str);
    }
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Genera el código SVG de un código de barras Code 128-B
   */
  function generateBarcodeSvg(text, options = {}) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    const height = options.height || 42;
    const showText = options.showText !== false;
    const fontScale = options.fontSize || 10;

    let checksum = 104; // Start B
    const symbols = [104];

    for (let i = 0; i < raw.length; i++) {
      let code = raw.charCodeAt(i) - 32;
      if (code < 0 || code > 95) code = 0;
      symbols.push(code);
      checksum += code * (i + 1);
    }

    symbols.push(checksum % 103);
    symbols.push(106); // Stop

    let patternStr = '';
    for (const s of symbols) {
      patternStr += CODE128_PATTERNS[s] || '';
    }

    let x = 0;
    let rects = '';
    for (let i = 0; i < patternStr.length; i++) {
      const width = parseInt(patternStr[i], 10);
      const isBar = (i % 2 === 0);
      if (isBar) {
        rects += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000" />`;
      }
      x += width;
    }

    const totalWidth = x;
    const totalHeight = showText ? (height + 14) : height;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}"
        style="width:100%;max-width:${options.maxWidth || '220px'};height:auto;display:block;margin:0 auto">
        ${rects}
        ${showText ? `
          <text x="${totalWidth / 2}" y="${height + 11}" text-anchor="middle"
            font-family="monospace, sans-serif" font-size="${fontScale}" font-weight="800" fill="#000000" letter-spacing="1">
            ${escHtml(raw)}
          </text>
        ` : ''}
      </svg>
    `;
  }

  let currentModal = null;
  let selectedItem = null;
  let printQuantity = 1;
  let selectedFormat = '50x30'; // '50x30' | '58mm' | 'sheet'
  let selectedTanda = 'Tanda Mañana';

  function getAllCatalogItems() {
    if (!root.MTP || !root.MTP.state) return [];
    const state = root.MTP.state;
    const list = [];

    (state.variants || []).forEach(v => {
      list.push(Object.assign({}, v, { isDish: true, kind: 'variant' }));
    });

    (state.retailItems || []).forEach(r => {
      if (!list.some(x => x.id === r.id)) {
        list.push(Object.assign({}, r, { isRetail: true, kind: 'retail' }));
      }
    });

    (state.inventory || []).forEach(i => {
      if (i.sellable && !list.some(x => x.id === i.id)) {
        list.push(Object.assign({}, i, { isRetail: true, kind: 'retail' }));
      }
    });

    return list;
  }

  function renderLabelHtml(item, opts = {}) {
    if (!item) return '<div style="text-align:center;padding:20px;color:#94A3B8">Selecciona un producto</div>';

    const bcv = (root.MTP && root.MTP.state && root.MTP.state.settings && root.MTP.state.settings.rateBcv)
      ? Number(root.MTP.state.settings.rateBcv) : 42.85;
    const storeName = (root.MTP && root.MTP.state && root.MTP.state.settings && root.MTP.state.settings.storeName)
      ? root.MTP.state.settings.storeName : 'MI TIENDA POS';

    const codeFormatted = root.MTPCodes ? root.MTPCodes.formatItemCode(item) : (item.code || '00');
    const barcodeVal = item.barcode || (root.MTPCodes ? root.MTPCodes.generateStandardBarcode(item.code, item.familyId) : ('8800' + item.code));

    const priceUsd = Number(item.priceUsd) || 0;
    const priceBs = (priceUsd * bcv).toFixed(2);
    const isExempt = item.taxExempt || item.taxType === 'E' || item.iva === 'E';
    const taxLabel = isExempt ? 'EXENTO' : '+IVA 16%';

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    const tanda = opts.tanda || selectedTanda;
    const format = opts.format || selectedFormat;

    const barcodeSvg = generateBarcodeSvg(barcodeVal, {
      height: format === '50x30' ? 32 : 38,
      fontSize: 9,
      maxWidth: format === '50x30' ? '170px' : '200px'
    });

    return `
      <div class="barcode-print-label size-${format}" style="
        border:1px solid #CBD5E1;
        background:#FFFFFF;
        color:#0F172A;
        border-radius:6px;
        padding:8px 10px;
        font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        box-sizing:border-box;
        text-align:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.06);
        max-width:320px;
        margin:0 auto;
      ">
        <!-- CABECERA DE LA TIENDA -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #E2E8F0;padding-bottom:3px;margin-bottom:4px">
          <span style="font-size:9.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#475569">
            ${escHtml(storeName)}
          </span>
          <span style="font-size:9px;font-weight:700;color:#0F172A;background:#F1F5F9;padding:1px 5px;border-radius:4px;font-family:monospace">
            ${escHtml(codeFormatted)}
          </span>
        </div>

        <!-- NOMBRE DEL ALIMENTO / PRODUCTO -->
        <div style="font-size:13.5px;font-weight:900;line-height:1.2;color:#0F172A;margin:2px 0 4px 0;text-transform:uppercase">
          ${escHtml(item.name)}
        </div>

        <!-- CÓDIGO DE BARRAS VECTORIAL CODE 128 -->
        <div style="margin:2px 0;background:#FFFFFF;padding:2px 0">
          ${barcodeSvg}
        </div>

        <!-- PRECIOS EN DÓLARES Y BOLÍVARES -->
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 3px 0;padding-top:3px;border-top:1px dashed #CBD5E1">
          <div style="text-align:left">
            <span style="font-size:17px;font-weight:900;color:#059669;letter-spacing:-0.02em">
              $${priceUsd.toFixed(2)}
            </span>
            <span style="font-size:11px;font-weight:700;color:#475569;margin-left:4px">
              ${escHtml(priceBs)} Bs
            </span>
          </div>
          <span style="font-size:8.5px;font-weight:800;padding:1px 4px;border-radius:3px;background:${isExempt ? '#DCFCE7' : '#FEE2E2'};color:${isExempt ? '#166534' : '#991B1B'}">
            ${escHtml(taxLabel)}
          </span>
        </div>

        <!-- METADATOS DE CONTROL DE COCINA Y FRESCURA -->
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#64748B;font-weight:600;padding-top:2px">
          <span>🕒 ${escHtml(dateStr)} ${escHtml(timeStr)}</span>
          <span>🍳 ${escHtml(tanda)}</span>
        </div>
      </div>
    `;
  }

  function executePrint() {
    if (!selectedItem) {
      if (window.MTP) MTP.toast('Por favor selecciona un producto para imprimir', 'warn');
      return;
    }

    let rootDiv = document.getElementById('barcodePrintRoot');
    if (!rootDiv) {
      rootDiv = document.createElement('div');
      rootDiv.id = 'barcodePrintRoot';
      document.body.appendChild(rootDiv);
    }

    const singleLabelHtml = renderLabelHtml(selectedItem, { tanda: selectedTanda, format: selectedFormat });
    let fullPrintHtml = '';
    const qty = Math.max(1, parseInt(printQuantity, 10) || 1);

    for (let i = 0; i < qty; i++) {
      fullPrintHtml += singleLabelHtml;
    }

    rootDiv.innerHTML = fullPrintHtml;
    document.body.classList.remove('printing-receipt');
    document.body.classList.add('printing-barcodes');

    const cleanup = () => {
      document.body.classList.remove('printing-barcodes');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      if (root.MTPDesktop && typeof root.MTPDesktop.print === 'function') {
        Promise.resolve(root.MTPDesktop.print({ silent: false, printBackground: true }))
          .then((res) => {
            if (res && res.ok === false && res.error && res.error !== 'cancelled') {
              window.print();
            }
          })
          .catch(() => window.print())
          .finally(() => setTimeout(cleanup, 300));
      } else {
        window.print();
        setTimeout(cleanup, 1500);
      }
    }, 120);
  }

  function createPrinterModal() {
    const items = getAllCatalogItems();
    const optionsHtml = items.map(it => {
      const formattedCode = root.MTPCodes ? root.MTPCodes.formatItemCode(it) : it.code;
      const isSelected = selectedItem && (selectedItem.id === it.id);
      return `
        <option value="${escHtml(it.id)}" ${isSelected ? 'selected' : ''}>
          [${escHtml(formattedCode)}] ${escHtml(it.name)} — $${(Number(it.priceUsd) || 0).toFixed(2)} (${it.isDish ? 'Cocina' : 'Mostrador'})
        </option>
      `;
    }).join('');

    return `
      <div class="modal-backdrop open" id="barcodePrinterModal" role="dialog" aria-modal="true">
        <div class="modal-box" style="max-width:680px">
          <div class="modal-hd" style="background:#0F172A;color:#FFFFFF;border-radius:12px 12px 0 0;padding:14px 18px">
            <div>
              <h3 style="color:#FFFFFF;margin:0;font-size:16px;display:flex;align-items:center;gap:8px">
                🏷️ Impresora de Etiquetas y Códigos de Control
              </h3>
              <p style="color:#94A3B8;font-size:12px;margin:3px 0 0 0">
                Rotulado térmico de alimentos preparados, tandas de cocina y mercancía de mostrador
              </p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btnLabelModalClose" aria-label="Cerrar">✕</button>
          </div>

          <div class="modal-bd" style="padding:18px">
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px">
              <!-- COLUMNA 1: CONTROLES DE ETIQUETA -->
              <div style="display:flex;flex-direction:column;gap:12px">
                <div class="form-group">
                  <label for="labelItemSelect">1. Seleccionar Producto o Alimento *</label>
                  <select id="labelItemSelect" class="select" style="font-size:13.5px;font-weight:700">
                    <option value="">-- Elige un producto --</option>
                    ${optionsHtml}
                  </select>
                </div>

                <div class="form-group">
                  <label>2. Formato de Etiqueta</label>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                    <button type="button" class="btn ${selectedFormat === '50x30' ? 'btn-primary' : 'btn-secondary'} btn-sm"
                      id="btnFormat50x30">
                      🏷️ Térmica 50x30mm
                    </button>
                    <button type="button" class="btn ${selectedFormat === '58mm' ? 'btn-primary' : 'btn-secondary'} btn-sm"
                      id="btnFormat58mm">
                      🧾 Ticketera 58/80mm
                    </button>
                  </div>
                </div>

                <div class="form-group">
                  <label for="labelQuantity">3. Cantidad de Etiquetas a Imprimir</label>
                  <div style="display:flex;gap:6px;align-items:center">
                    <input type="number" min="1" max="500" id="labelQuantity" class="input" value="${printQuantity}"
                      style="width:90px;font-size:16px;font-weight:900;text-align:center">
                    <div style="display:flex;gap:4px">
                      <button type="button" class="btn btn-secondary btn-sm" data-label-qty="1">1</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-label-qty="5">5</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-label-qty="10">10</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-label-qty="20">20</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-label-qty="50">50</button>
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label for="labelTandaSelect">4. Control de Tanda / Frescura</label>
                  <select id="labelTandaSelect" class="select" style="font-weight:600">
                    <option value="Tanda Mañana" ${selectedTanda === 'Tanda Mañana' ? 'selected' : ''}>🌅 Tanda Mañana (Desayuno)</option>
                    <option value="Tanda Tarde" ${selectedTanda === 'Tanda Tarde' ? 'selected' : ''}>☀️ Tanda Tarde (Almuerzos)</option>
                    <option value="Tanda Noche" ${selectedTanda === 'Tanda Noche' ? 'selected' : ''}>🌙 Tanda Noche (Cena)</option>
                    <option value="Producción de Hoy" ${selectedTanda === 'Producción de Hoy' ? 'selected' : ''}>📅 Producción del Día</option>
                  </select>
                </div>
              </div>

              <!-- COLUMNA 2: VISTA PREVIA EN VIVO -->
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <span style="font-size:12px;font-weight:700;color:#64748B;margin-bottom:8px">VISTA PREVIA REAL</span>
                <div id="labelLivePreview">
                  ${renderLabelHtml(selectedItem)}
                </div>
              </div>
            </div>
          </div>

          <div class="modal-ft" style="padding:14px 18px;background:#F8FAFC;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;color:#64748B;font-weight:600">
              Imprime directo en cualquier impresora térmica USB o estándar
            </span>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn btn-secondary" id="btnCancelPrinter">Cerrar</button>
              <button type="button" class="btn btn-action" id="btnPrintSubmit" style="height:40px;min-width:180px;font-weight:800">
                🖨️ Imprimir (${printQuantity} etiquetas)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function setupPrinterEvents(modal) {
    const itemSelect = modal.querySelector('#labelItemSelect');
    const qtyInput = modal.querySelector('#labelQuantity');
    const tandaSelect = modal.querySelector('#labelTandaSelect');
    const previewWrap = modal.querySelector('#labelLivePreview');
    const btnPrint = modal.querySelector('#btnPrintSubmit');
    const btnCancel = modal.querySelector('#btnCancelPrinter');
    const btnClose = modal.querySelector('#btnLabelModalClose');

    const btnFormat50x30 = modal.querySelector('#btnFormat50x30');
    const btnFormat58mm = modal.querySelector('#btnFormat58mm');

    function updatePreview() {
      previewWrap.innerHTML = renderLabelHtml(selectedItem, { tanda: selectedTanda, format: selectedFormat });
      btnPrint.textContent = `🖨️ Imprimir (${printQuantity} etiqueta${printQuantity > 1 ? 's' : ''})`;
    }

    itemSelect.addEventListener('change', () => {
      const val = itemSelect.value;
      const items = getAllCatalogItems();
      selectedItem = items.find(x => x.id === val) || null;
      updatePreview();
    });

    qtyInput.addEventListener('input', () => {
      printQuantity = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      btnPrint.textContent = `🖨️ Imprimir (${printQuantity} etiqueta${printQuantity > 1 ? 's' : ''})`;
    });

    modal.querySelectorAll('[data-label-qty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = parseInt(btn.getAttribute('data-label-qty'), 10) || 1;
        setQty(q);
      });
    });

    tandaSelect.addEventListener('change', () => {
      selectedTanda = tandaSelect.value;
      updatePreview();
    });

    btnFormat50x30.addEventListener('click', () => {
      selectedFormat = '50x30';
      btnFormat50x30.className = 'btn btn-primary btn-sm';
      btnFormat58mm.className = 'btn btn-secondary btn-sm';
      updatePreview();
    });

    btnFormat58mm.addEventListener('click', () => {
      selectedFormat = '58mm';
      btnFormat58mm.className = 'btn btn-primary btn-sm';
      btnFormat50x30.className = 'btn btn-secondary btn-sm';
      updatePreview();
    });

    function closeModal() {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      currentModal = null;
    }

    btnCancel.addEventListener('click', closeModal);
    btnClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    btnPrint.addEventListener('click', () => {
      executePrint();
    });
  }

  function open(options = {}) {
    if (currentModal && currentModal.parentNode) {
      currentModal.parentNode.removeChild(currentModal);
    }

    const items = getAllCatalogItems();
    if (options.item) {
      selectedItem = options.item;
    } else if (options.itemId) {
      selectedItem = items.find(x => x.id === options.itemId) || null;
    } else if (items.length > 0) {
      selectedItem = items[0];
    }

    printQuantity = options.defaultQty || 1;
    selectedTanda = options.defaultTanda || 'Tanda Mañana';
    selectedFormat = options.format || '50x30';

    const div = document.createElement('div');
    div.innerHTML = createPrinterModal();
    const modal = div.firstElementChild;
    document.body.appendChild(modal);
    currentModal = modal;

    setupPrinterEvents(modal);
  }

  function setQty(n) {
    printQuantity = n;
    const input = document.getElementById('labelQuantity');
    if (input) {
      input.value = n;
      input.dispatchEvent(new Event('input'));
    }
  }

  root.MTPBarcodePrinter = {
    open,
    setQty,
    generateBarcodeSvg,
    renderLabelHtml
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MTPBarcodePrinter;
  }

})(typeof window !== 'undefined' ? window : this);
