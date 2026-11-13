/* ==========================================================================
   MI-TIENDA-POS — product-drawer.js (v8)
   Apple-Style Product Sheet Drawer para creación, edición, pausado y
   eliminación de productos en 5 segundos sin abandonar la pantalla de venta.
   Diseñado según principios Apple WWDC, Emil Kowalski e Impeccable.
   ========================================================================== */
(function (root) {
  'use strict';

  const LOCAL_PRODUCT_IMAGES = [
    { file: 'empanadas.jpg', name: 'Empanadas Variadas' },
    { file: 'empanada_queso.jpg', name: 'Empanada de Queso' },
    { file: 'empanada_mechada.jpg', name: 'Empanada Mechada' },
    { file: 'empanada_pabellon.jpg', name: 'Empanada Pabellón' },
    { file: 'empanada_domino.jpg', name: 'Empanada Dominó' },
    { file: 'empanada_pelua.jpg', name: 'Empanada Pelúa' },
    { file: 'pastelitos.jpg', name: 'Pastelitos' },
    { file: 'tequenos.jpg', name: 'Tequeños' },
    { file: 'papa_rellena.jpg', name: 'Papa Rellena' },
    { file: 'arepas.jpg', name: 'Arepas Variadas' },
    { file: 'arepa_reina.jpg', name: 'Arepa Reina Pepiada' },
    { file: 'arepa_pelua.jpg', name: 'Arepa Pelúa' },
    { file: 'arepa_catira.jpg', name: 'Arepa Catira' },
    { file: 'arepa_domino.jpg', name: 'Arepa Dominó' },
    { file: 'arepa_mechada.jpg', name: 'Arepa Mechada' },
    { file: 'arepa_queso.jpg', name: 'Arepa Queso' },
    { file: 'arepa_jamon_queso.jpg', name: 'Arepa Jamón y Queso' },
    { file: 'arepa_viuda.jpg', name: 'Arepa Viuda' },
    { file: 'pabellon.jpg', name: 'Pabellón Criollo' },
    { file: 'arroz_chino.jpg', name: 'Arroz Chino Venezolano' },
    { file: 'pollo_frito.jpg', name: 'Pollo Frito Broaster' },
    { file: 'cafe.jpg', name: 'Café Guayoyo / Negro' },
    { file: 'cafe_leche.jpg', name: 'Café con Leche' },
    { file: 'harina_pan_blanca.jpg', name: 'Harina P.A.N. Blanca' },
    { file: 'harina_pan_amarilla.jpg', name: 'Harina P.A.N. Amarilla' },
    { file: 'arroz_primor.jpg', name: 'Arroz Primor' },
    { file: 'margarina_mavesa.jpg', name: 'Margarina Mavesa' },
    { file: 'espagueti.jpg', name: 'Espagueti / Pasta' },
    { file: 'viveres.jpg', name: 'Víveres Generales' },
    { file: 'malta_personal.jpg', name: 'Malta Polar Personal' },
    { file: 'malta_familiar.jpg', name: 'Malta Polar Familiar' },
    { file: 'refrescos.jpg', name: 'Refrescos' },
    { file: 'frescolita.jpg', name: 'Frescolita' },
    { file: 'cocacola.jpg', name: 'Coca-Cola' },
    { file: 'agua_nevada.jpg', name: 'Agua Mineral Nevada' },
    { file: 'polar_pilsen.jpg', name: 'Polar Pilsen' },
    { file: 'cerveza_zulia.jpg', name: 'Cerveza Zulia' },
    { file: 'solera_verde.jpg', name: 'Solera Verde' },
    { file: 'sixpack_polar.jpg', name: 'Sixpack Polar' },
    { file: 'cervezas.jpg', name: 'Cervezas Variadas' },
    { file: 'pepito.jpg', name: 'Pepito Frito-Lay' },
    { file: 'cheese_tris.jpg', name: 'Cheese Tris' },
    { file: 'cheetos.jpg', name: 'Cheetos' },
    { file: 'doritos.jpg', name: 'Doritos' },
    { file: 'samba_savoy.jpg', name: 'Samba Fresa Savoy' },
    { file: 'chucherias.jpg', name: 'Chucherías Variadas' },
    { file: 'cigarros.jpg', name: 'Cigarros' }
  ];

  const FAMILIES = [
    { id: 'fritos', name: 'Fritos', full: 'Empanadas y Fritos', emoji: '🥟', type: 'cocina' },
    { id: 'arepas', name: 'Arepas', full: 'Arepas Venezolanas', emoji: '🫓', type: 'cocina' },
    { id: 'almuerzos', name: 'Almuerzos', full: 'Almuerzos y Platos', emoji: '🍲', type: 'cocina' },
    { id: 'viveres', name: 'Víveres', full: 'Víveres de Despensa', emoji: '🌾', type: 'venta', defaultExempt: true },
    { id: 'bebidas', name: 'Refrescos', full: 'Refrescos y Maltas', emoji: '🥤', type: 'venta' },
    { id: 'cafeteria', name: 'Cafetería', full: 'Cafetería Recién Colada', emoji: '☕', type: 'cocina' },
    { id: 'chucherias', name: 'Chucherías', full: 'Chucherías y Snacks', emoji: '🍫', type: 'venta' },
    { id: 'cervezas', name: 'Cervezas', full: 'Cervezas Frías', emoji: '🍺', type: 'venta' },
    { id: 'cigarros', name: 'Cigarros', full: 'Cigarros y Tabaco', emoji: '🚬', type: 'venta' }
  ];

  let currentBackdrop = null;
  let currentOptions = null;
  let activeItem = null;
  let activeWasKitchen = false;
  let selectedType = 'cocina'; // 'cocina' | 'venta'
  let selectedFamilyId = 'fritos';
  let selectedImg = '';
  let selectedTaxType = 'G'; // 'G' | 'E'

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

  function canManageProducts() {
    if (!root.MTPAuth) return true;
    const user = typeof root.MTPAuth.getCurrentUser === 'function' ? root.MTPAuth.getCurrentUser() : null;
    if (!user) return false;
    if (user.role === 'cajero') return false;
    if (typeof root.MTPAuth.can === 'function' && root.MTPAuth.can('manage_products')) {
      return true;
    }
    return user.role === 'admin' || user.role === 'encargado';
  }

  function getImgBasePath() {
    const p = (typeof location !== 'undefined' && location.pathname) ? location.pathname.replace(/\\/g, '/') : '';
    if (p.includes('/admin/') || p.includes('/caja/')) return '../assets/img/productos/';
    return 'assets/img/productos/';
  }

  function resolveDrawerImg(src) {
    if (root.MTP && typeof root.MTP.resolveImgPath === 'function') {
      return root.MTP.resolveImgPath(src, 'assets/img/productos/empanadas.jpg');
    }
    const filename = String(src || 'empanadas.jpg').split('/').pop();
    return getImgBasePath() + filename;
  }

  function getBcvRate() {
    if (root.MTP && root.MTP.state && root.MTP.state.settings) {
      return Number(root.MTP.state.settings.rateBcv) || 42.85;
    }
    return 42.85;
  }

  function createDrawerMarkup() {
    const bcv = getBcvRate();
    const basePath = getImgBasePath();

    const familyChips = FAMILIES.map(f => `
      <button type="button" class="apple-family-chip ${f.id === selectedFamilyId ? 'active' : ''}"
        data-family="${escHtml(f.id)}" data-type="${escHtml(f.type)}" data-exempt="${!!f.defaultExempt}">
        <span style="font-size:16px">${f.emoji}</span>
        <span>${escHtml(f.name)}</span>
      </button>
    `).join('');

    const photoOptions = LOCAL_PRODUCT_IMAGES.map(img => {
      const fullPath = basePath + img.file;
      const selName = selectedImg ? selectedImg.split('/').pop() : '';
      return `
        <img class="apple-photo-option ${img.file === selName ? 'selected' : ''}"
          src="${escHtml(fullPath)}" alt="${escHtml(img.name)}" title="${escHtml(img.name)}"
          data-src="${escHtml(fullPath)}" loading="lazy">
      `;
    }).join('');

    return `
      <div class="apple-sheet-backdrop" id="appleSheetBackdrop" role="dialog" aria-modal="true" aria-labelledby="appleSheetTitle">
        <div class="apple-sheet-drawer" id="appleSheetDrawer">
          <!-- CABECERA APPLE -->
          <div class="apple-sheet-header">
            <div>
              <h2 class="apple-sheet-title" id="appleSheetTitle">
                <span id="appleSheetTitleIcon">✨</span>
                <span id="appleSheetTitleText">Nuevo Producto</span>
              </h2>
              <div class="apple-sheet-subtitle">Gestión rápida en 5 segundos sin perder la venta</div>
            </div>
            <button type="button" class="apple-sheet-close-btn" id="appleSheetCloseBtn" aria-label="Cerrar panel">✕</button>
          </div>

          <!-- CUERPO DESLIZANTE -->
          <form class="apple-sheet-body" id="appleSheetForm">
            <!-- CONTROL SEGMENTADO: COCINA VS MOSTRADOR -->
            <div class="apple-sheet-segmented" role="tablist">
              <button type="button" class="apple-segmented-btn ${selectedType === 'cocina' ? 'active' : ''}"
                id="segTypeCocina" data-type="cocina">
                🍳 Plato de Cocina
              </button>
              <button type="button" class="apple-segmented-btn ${selectedType === 'venta' ? 'active' : ''}"
                id="segTypeVenta" data-type="venta">
                📦 Mercancía / Víveres
              </button>
            </div>

            <!-- NOMBRE DEL PRODUCTO -->
            <div class="form-group">
              <label for="drawerProdName">Nombre del Producto / Sabor *</label>
              <input type="text" id="drawerProdName" class="input" style="font-size:15px;font-weight:700"
                placeholder="Ej: Empanada Mechada, Harina P.A.N., Malta Polar..." required>
            </div>

            <!-- SELECTOR DE FAMILIA (9 OPCIONES CLARAS) -->
            <div class="form-group">
              <label>Familia / Categoría Oficial</label>
              <div class="apple-family-selector" id="drawerFamilySelector">
                ${familyChips}
              </div>
            </div>

            <!-- PRECIOS Y TASA BCV EN VIVO -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-group">
                <label for="drawerPriceUsd">Precio de Venta ($ USD) *</label>
                <div style="position:relative">
                  <span style="position:absolute;left:10px;top:9px;font-weight:800;color:#64748B">$</span>
                  <input type="number" step="0.05" min="0" id="drawerPriceUsd" class="input"
                    style="padding-left:26px;font-size:16px;font-weight:800;font-variant-numeric:tabular-nums"
                    placeholder="1.50" required>
                </div>
                <div id="drawerPriceBsCalc" style="font-size:12px;color:#059669;font-weight:700;margin-top:4px">
                  ≈ 0.00 Bs (a tasa ${bcv.toFixed(2)})
                </div>
              </div>

              <div class="form-group">
                <label for="drawerCostUsd">Costo Estimado ($ USD)</label>
                <div style="position:relative">
                  <span style="position:absolute;left:10px;top:9px;font-weight:800;color:#64748B">$</span>
                  <input type="number" step="0.05" min="0" id="drawerCostUsd" class="input"
                    style="padding-left:26px;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums"
                    placeholder="0.75">
                </div>
                <div id="drawerMarginCalc" style="font-size:12px;color:#64748B;font-weight:600;margin-top:4px">
                  Margen: —
                </div>
              </div>
            </div>

            <!-- ALÍCUOTA FISCAL VENEZOLANA -->
            <div class="form-group">
              <label>Tratamiento Fiscal SENIAT (IVA)</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <button type="button" class="btn ${selectedTaxType === 'G' ? 'btn-primary' : 'btn-secondary'}"
                  id="btnTaxG16" style="height:36px;font-size:12px;font-weight:700">
                  🔴 Alícuota General (+16%)
                </button>
                <button type="button" class="btn ${selectedTaxType === 'E' ? 'btn-primary' : 'btn-secondary'}"
                  id="btnTaxExempt" style="height:36px;font-size:12px;font-weight:700">
                  🟢 Exento (Art. 18 Víveres)
                </button>
              </div>
              <div id="drawerTaxAdvisor" style="margin-top:6px;padding:7px 10px;border-radius:8px;font-size:12px;line-height:1.35;background:#F8FAFC;border:1px solid #CBD5E1;color:#334155"></div>
            </div>

            <!-- CAMPOS EXCLUSIVOS DE MERCANCÍA DE MOSTRADOR -->
            <div id="drawerRetailFields" style="display:${selectedType === 'venta' ? 'block' : 'none'};">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group">
                  <label for="drawerStock">Inventario Inicial (Unidades)</label>
                  <input type="number" min="0" id="drawerStock" class="input" value="24"
                    style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">
                </div>
                <div class="form-group">
                  <label for="drawerMinStock">Stock Mínimo (Alerta)</label>
                  <input type="number" min="0" id="drawerMinStock" class="input" value="6"
                    style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">
                </div>
              </div>
            </div>

            <!-- CÓDIGOS Y BARRAS -->
            <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px">
              <div class="form-group">
                <label for="drawerCode">PLU / Código</label>
                <input type="text" id="drawerCode" class="input" placeholder="Ej: 105"
                  style="font-family:var(--font-mono);font-weight:800;font-size:13px">
              </div>
              <div class="form-group">
                <label for="drawerBarcode">Código de Barras</label>
                <div style="display:flex;gap:6px">
                  <input type="text" id="drawerBarcode" class="input" placeholder="8800105"
                    style="font-family:var(--font-mono);font-size:13px;flex:1">
                  <button type="button" class="btn btn-secondary btn-sm" id="btnGenBarcode" title="Generar código aleatorio">
                    🎲
                  </button>
                </div>
              </div>
            </div>

            <!-- SELECTOR VISUAL DE FOTO (47 FOTOS REALES) -->
            <div class="form-group">
              <label>Fotografía Real del Producto</label>
              <div class="apple-photo-preview-wrap">
                <img id="drawerPhotoPreview" class="apple-photo-preview-img"
                  src="${escHtml(selectedImg || (basePath + 'empanadas.jpg'))}" alt="Vista previa">
                <div style="flex:1;min-width:0">
                  <strong style="font-size:12.5px;display:block" id="drawerPhotoName">Selecciona una imagen abajo</strong>
                  <span style="font-size:12px;color:#64748B">47 fotos reales verificadas 100% offline</span>
                </div>
              </div>

              <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
                <button type="button" class="btn btn-secondary btn-sm" id="btnDrawerWebPhoto"
                  title="La IA arma la búsqueda y trae fotos reales de internet">
                  🌐 Buscar foto en internet
                </button>
                <span style="font-size:11.5px;color:#64748B">o elige una de las 47 fotos offline</span>
              </div>

              <div class="apple-photo-grid" id="drawerPhotoGrid" style="margin-top:8px">
                ${photoOptions}
              </div>
            </div>

            <!-- ESTADO ACTIVO / PAUSADO -->
            <div style="display:flex;align-items:center;justify-content:space-between;background:#F8FAFC;padding:12px 14px;border-radius:10px;border:1px solid #E2E8F0">
              <div>
                <strong style="font-size:13px;color:#0F172A;display:block" id="drawerActiveLabel">🟢 Activo para la Venta</strong>
                <span style="font-size:12px;color:#64748B">Si está pausado no aparecerá en caja</span>
              </div>
              <input type="checkbox" id="drawerActiveToggle" checked style="width:20px;height:20px;cursor:pointer">
            </div>
          </form>

          <!-- PIE DE ACCIONES APPLE -->
          <div class="apple-sheet-footer">
            <div style="display:flex;gap:6px" id="drawerSecondaryActions">
              <button type="button" class="btn btn-danger btn-sm" id="btnDrawerDelete" style="display:none" title="Eliminar producto permanentemente">
                🗑️ Eliminar
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btnDrawerPause" style="display:none" title="Pausar o reanudar">
                ⏸️ Pausar
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btnDrawerPrintLabel" style="display:none" title="Imprimir etiqueta y código de barras">
                🏷️ Etiqueta
              </button>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn btn-secondary" id="btnDrawerCancel">Cancelar</button>
              <button type="button" class="btn btn-action" id="btnDrawerSave" style="min-width:140px;height:40px;font-weight:800">
                💾 Guardar en 1 Clic
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function setupEvents(backdrop) {
    const bcv = getBcvRate();
    const basePath = getImgBasePath();

    const drawer = backdrop.querySelector('#appleSheetDrawer');
    const form = backdrop.querySelector('#appleSheetForm');
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
    const closeBtn = backdrop.querySelector('#appleSheetCloseBtn');
    const cancelBtn = backdrop.querySelector('#btnDrawerCancel');
    const saveBtn = backdrop.querySelector('#btnDrawerSave');
    const deleteBtn = backdrop.querySelector('#btnDrawerDelete');
    const pauseBtn = backdrop.querySelector('#btnDrawerPause');
    const genBarcodeBtn = backdrop.querySelector('#btnGenBarcode');

    const segCocina = backdrop.querySelector('#segTypeCocina');
    const segVenta = backdrop.querySelector('#segTypeVenta');
    const retailFields = backdrop.querySelector('#drawerRetailFields');

    const priceUsdInput = backdrop.querySelector('#drawerPriceUsd');
    const costUsdInput = backdrop.querySelector('#drawerCostUsd');
    const priceBsCalc = backdrop.querySelector('#drawerPriceBsCalc');
    const marginCalc = backdrop.querySelector('#drawerMarginCalc');

    const btnTaxG16 = backdrop.querySelector('#btnTaxG16');
    const btnTaxExempt = backdrop.querySelector('#btnTaxExempt');

    const activeToggle = backdrop.querySelector('#drawerActiveToggle');
    const activeLabel = backdrop.querySelector('#drawerActiveLabel');

    function updateCalculations() {
      const p = Number(priceUsdInput.value) || 0;
      const c = Number(costUsdInput.value) || 0;
      const bs = (p * bcv).toFixed(2);
      priceBsCalc.textContent = `≈ ${bs} Bs (a tasa ${bcv.toFixed(2)})`;

      if (p > 0 && c > 0) {
        const marginPct = Math.round(((p - c) / p) * 100);
        const profit = (p - c).toFixed(2);
        marginCalc.textContent = `Ganancia: +$${profit} (${marginPct}%)`;
        marginCalc.style.color = marginPct >= 30 ? '#059669' : '#D97706';
      } else {
        marginCalc.textContent = 'Margen: —';
        marginCalc.style.color = '#64748B';
      }
    }

    priceUsdInput.addEventListener('input', updateCalculations);
    costUsdInput.addEventListener('input', updateCalculations);

    function updateTaxButtonsState() {
      const isKitchen = selectedType === 'cocina';
      if (isKitchen && selectedTaxType === 'E') {
        selectedTaxType = 'G';
      }
      if (btnTaxG16) {
        btnTaxG16.className = 'btn ' + (selectedTaxType === 'G' ? 'btn-primary' : 'btn-secondary');
      }
      if (btnTaxExempt) {
        btnTaxExempt.disabled = isKitchen;
        btnTaxExempt.style.opacity = isKitchen ? '0.45' : '1';
        btnTaxExempt.style.cursor = isKitchen ? 'not-allowed' : 'pointer';
        btnTaxExempt.title = isKitchen ? 'Los platos preparados de cocina llevan IVA 16%' : '';
        btnTaxExempt.className = 'btn ' + (!isKitchen && selectedTaxType === 'E' ? 'btn-primary' : 'btn-secondary');
      }
    }

    function setType(type) {
      selectedType = type === 'venta' ? 'venta' : 'cocina';
      segCocina.classList.toggle('active', selectedType === 'cocina');
      segVenta.classList.toggle('active', selectedType === 'venta');
      retailFields.style.display = selectedType === 'venta' ? 'block' : 'none';

      // Auto-cambiar familia si no coincide
      const curFam = FAMILIES.find(f => f.id === selectedFamilyId);
      if (curFam && curFam.type !== selectedType) {
        const firstMatching = FAMILIES.find(f => f.type === selectedType);
        if (firstMatching) setFamily(firstMatching.id);
      }
      if (selectedType === 'cocina') {
        selectedTaxType = 'G';
      }
      updateTaxButtonsState();
      updateTaxAdvisor();
    }

    segCocina.addEventListener('click', () => setType('cocina'));
    segVenta.addEventListener('click', () => setType('venta'));

    function setFamily(familyId) {
      selectedFamilyId = familyId;
      const chips = backdrop.querySelectorAll('.apple-family-chip');
      chips.forEach(c => {
        const isSelected = c.getAttribute('data-family') === familyId;
        c.classList.toggle('active', isSelected);
      });

      const famObj = FAMILIES.find(f => f.id === familyId);
      if (famObj) {
        if (famObj.type === 'cocina') {
          setTaxType('G');
        } else if (famObj.defaultExempt) {
          setTaxType('E');
        } else {
          setTaxType('G');
        }

        // Sugerir imagen por defecto de la familia si no tiene una seleccionada
        if (!selectedImg || selectedImg.endsWith('empanadas.jpg') || selectedImg.endsWith('viveres.jpg')) {
          const defaultPic = famObj.id === 'arepas' ? 'arepas.jpg'
            : famObj.id === 'almuerzos' ? 'pabellon.jpg'
            : famObj.id === 'viveres' ? 'harina_pan_blanca.jpg'
            : famObj.id === 'bebidas' ? 'malta_personal.jpg'
            : famObj.id === 'cafeteria' ? 'cafe.jpg'
            : famObj.id === 'chucherias' ? 'pepito.jpg'
            : famObj.id === 'cervezas' ? 'polar_pilsen.jpg'
            : famObj.id === 'cigarros' ? 'cigarros.jpg'
            : 'empanadas.jpg';
          selectPhoto(basePath + defaultPic);
        }
      }
    }

    const familyChips = backdrop.querySelectorAll('.apple-family-chip');
    familyChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const fId = chip.getAttribute('data-family');
        const fType = chip.getAttribute('data-type');
        setType(fType);
        setFamily(fId);
      });
    });

    function updateTaxAdvisor() {
      const adv = backdrop.querySelector('#drawerTaxAdvisor');
      if (!adv) return;
      const prodName = backdrop.querySelector('#drawerProdName') ? backdrop.querySelector('#drawerProdName').value : '';
      if (root.MTPTax && typeof root.MTPTax.explainTax === 'function') {
        const info = root.MTPTax.explainTax(selectedFamilyId, prodName);
        const matchesUser = (info.code === 'E' && selectedTaxType === 'E') || (info.code !== 'E' && selectedTaxType === 'G');
        adv.style.background = info.code === 'E' ? '#ECFDF5' : '#FFFBEB';
        adv.style.borderColor = info.code === 'E' ? '#A7F3D0' : '#FDE68A';
        adv.style.color = info.code === 'E' ? '#065F46' : '#92400E';
        adv.innerHTML = '<strong>Sugerencia SENIAT (' + escHtml(info.article) + '): ' + escHtml(info.label) + '</strong><br>' +
          escHtml(info.reason) + (matchesUser ? '' : ' <em style="text-decoration:underline">(Actualmente marcaste otra opción arriba)</em>');
      }
    }

    function setTaxType(taxType) {
      if (selectedType === 'cocina' && taxType === 'E') {
        selectedTaxType = 'G';
        if (root.MTP && root.MTP.toast) {
          root.MTP.toast('Los platos preparados de cocina siempre llevan IVA 16%.', 'warn');
        }
      } else {
        selectedTaxType = taxType === 'E' ? 'E' : 'G';
      }
      updateTaxButtonsState();
      updateTaxAdvisor();
    }

    btnTaxG16.addEventListener('click', () => setTaxType('G'));
    btnTaxExempt.addEventListener('click', () => setTaxType('E'));
    updateTaxAdvisor();

    function selectPhoto(src) {
      const raw = String(src || '');
      const isRootAbsolute = raw.charAt(0) === '/';
      const resolved = isRootAbsolute ? raw : resolveDrawerImg(raw);
      const filename = raw.split('/').pop() || 'empanadas.jpg';
      selectedImg = isRootAbsolute ? raw : ('assets/img/productos/' + filename);
      const preview = backdrop.querySelector('#drawerPhotoPreview');
      const photoName = backdrop.querySelector('#drawerPhotoName');
      preview.src = resolved;

      const match = LOCAL_PRODUCT_IMAGES.find(x => x.file === filename);
      photoName.textContent = match ? match.name : (isRootAbsolute ? 'Foto guardada en la caja' : filename);

      const opts = backdrop.querySelectorAll('.apple-photo-option');
      opts.forEach(opt => {
        const optFile = String(opt.getAttribute('data-src') || '').split('/').pop();
        opt.classList.toggle('selected', !isRootAbsolute && optFile === filename);
      });
    }

    const photoOptions = backdrop.querySelectorAll('.apple-photo-option');
    photoOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        selectPhoto(opt.getAttribute('data-src'));
      });
    });

    // Buscar una foto real en internet (IA + Bing/DuckDuckGo)
    const webPhotoBtn = backdrop.querySelector('#btnDrawerWebPhoto');
    if (webPhotoBtn) {
      webPhotoBtn.addEventListener('click', () => {
        if (!root.MTPPhotoStudio || typeof root.MTPPhotoStudio.open !== 'function') {
          if (root.MTP && root.MTP.toast) {
            root.MTP.toast('El buscador de fotos no está disponible en esta pantalla.', 'warn');
          }
          return;
        }
        const currentName = backdrop.querySelector('#drawerProdName').value.trim();
        root.MTPPhotoStudio.open({
          name: currentName,
          familyId: selectedFamilyId,
          onPick: function (pickedPath) {
            selectPhoto(pickedPath);
            if (root.MTP && root.MTP.toast) {
              root.MTP.toast('📸 Foto lista. Guarda el producto para aplicarla.');
            }
          }
        });
      });
    }

    const printLabelBtn = backdrop.querySelector('#btnDrawerPrintLabel');
    if (printLabelBtn) {
      printLabelBtn.addEventListener('click', () => {
        if (!activeItem) return;
        if (root.MTPBarcodePrinter) {
          root.MTPBarcodePrinter.open({ item: activeItem });
        }
      });
    }

    genBarcodeBtn.addEventListener('click', () => {
      const name = backdrop.querySelector('#drawerProdName').value;
      if (root.MTPCodes && root.MTPCodes.suggestNextCode) {
        const suggestion = root.MTPCodes.suggestNextCode(selectedFamilyId, name);
        backdrop.querySelector('#drawerCode').value = suggestion.formattedCode;
        backdrop.querySelector('#drawerBarcode').value = root.MTPCodes.generateStandardBarcode(suggestion.number, selectedFamilyId);
      } else {
        const randomCode = String(Math.floor(100 + Math.random() * 900));
        backdrop.querySelector('#drawerCode').value = randomCode;
        backdrop.querySelector('#drawerBarcode').value = '759000' + randomCode;
      }
    });

    const prodNameInput = backdrop.querySelector('#drawerProdName');
    prodNameInput.addEventListener('input', () => {
      updateTaxAdvisor();
    });
    prodNameInput.addEventListener('blur', () => {
      updateTaxAdvisor();
      if (!activeItem && root.MTPCodes && root.MTPCodes.suggestNextCode) {
        const curCode = backdrop.querySelector('#drawerCode').value.trim();
        if (!curCode) {
          const suggestion = root.MTPCodes.suggestNextCode(selectedFamilyId, prodNameInput.value);
          backdrop.querySelector('#drawerCode').value = suggestion.formattedCode;
          backdrop.querySelector('#drawerBarcode').value = root.MTPCodes.generateStandardBarcode(suggestion.number, selectedFamilyId);
        }
      }
    });

    activeToggle.addEventListener('change', () => {
      activeLabel.textContent = activeToggle.checked ? '🟢 Activo para la Venta' : '⏸️ Pausado (Agotado)';
      activeLabel.style.color = activeToggle.checked ? '#0F172A' : '#DC2626';
    });

    // Cerrar
    function closeDrawer() {
      backdrop.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        currentBackdrop = null;
      }, 260);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
      }
    }
    document.addEventListener('keydown', onKey);

    closeBtn.addEventListener('click', closeDrawer);
    cancelBtn.addEventListener('click', closeDrawer);

    // Clic fuera del drawer
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDrawer();
    });

    // Guardar
    saveBtn.addEventListener('click', () => {
      const name = backdrop.querySelector('#drawerProdName').value.trim();
      const priceUsd = Number(priceUsdInput.value);
      const costUsd = Number(costUsdInput.value) || 0;
      const code = backdrop.querySelector('#drawerCode').value.trim();
      const barcode = backdrop.querySelector('#drawerBarcode').value.trim();
      const stock = Number(backdrop.querySelector('#drawerStock').value) || 0;
      const minStock = Number(backdrop.querySelector('#drawerMinStock').value) || 5;
      const active = activeToggle.checked;

      if (!name) {
        if (root.MTPUI && root.MTPUI.confirmDialog) {
          root.MTPUI.confirmDialog('Por favor escribe el nombre del producto antes de guardar.', {
            title: 'Campo Requerido',
            okText: 'Entendido',
            cancelText: 'Cerrar'
          });
        } else if (root.MTP && root.MTP.toast) {
          root.MTP.toast('Por favor escribe el nombre del producto.', 'warn');
        }
        backdrop.querySelector('#drawerProdName').focus();
        return;
      }

      if (priceUsd <= 0 || isNaN(priceUsd)) {
        if (root.MTPUI && root.MTPUI.confirmDialog) {
          root.MTPUI.confirmDialog('El precio de venta en USD debe ser mayor a $0.00.', {
            title: 'Precio Inválido',
            okText: 'Corregir',
            cancelText: 'Cerrar'
          });
        } else if (root.MTP && root.MTP.toast) {
          root.MTP.toast('El precio en USD debe ser mayor a 0.', 'warn');
        }
        priceUsdInput.focus();
        return;
      }

      const finalCode = String(code || Math.floor(100 + Math.random() * 900)).trim();
      const finalBarcode = String(barcode || ('8800' + finalCode)).trim();
      const isNowKitchen = selectedType === 'cocina';
      const finalTaxType = isNowKitchen ? 'G' : (selectedTaxType === 'E' ? 'E' : 'G');
      const oldId = (activeItem && activeItem.id) ? String(activeItem.id) : null;
      const typeChanged = Boolean(oldId && (activeWasKitchen !== isNowKitchen));
      const nextId = typeChanged
        ? ((isNowKitchen ? 'var-quick-' : 'prod-quick-') + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
        : oldId;

      const payload = {
        id: nextId,
        name,
        familyId: selectedFamilyId,
        type: selectedType,
        priceUsd,
        costUsd,
        taxType: finalTaxType,
        taxExempt: finalTaxType === 'E',
        code: finalCode,
        barcode: finalBarcode,
        stock,
        minStock,
        active,
        img: selectedImg || (basePath + 'empanadas.jpg')
      };

      if (root.MTP && root.MTP.quickSaveItem) {
        const res = root.MTP.quickSaveItem(payload);
        if (res.success) {
          if (typeChanged && oldId && root.MTP.deleteProduct) {
            root.MTP.deleteProduct(oldId);
          }
          if (root.MTP.toast) {
            root.MTP.toast(`✅ "${name}" guardado exitosamente (${root.MTP.fmtUSD(priceUsd)})`);
          }

          if (currentOptions && typeof currentOptions.onSaved === 'function') {
            currentOptions.onSaved(res.item);
          }

          // Si estamos en la pantalla de caja, refrescar el catálogo en vivo
          if (root.MTPPos && typeof root.MTPPos.renderProductsCol === 'function') {
            root.MTPPos.renderProductsCol();
          }

          closeDrawer();
        } else if (root.MTP && root.MTP.toast) {
          root.MTP.toast('Error al guardar: ' + (res.error || 'Desconocido'), 'err');
        }
      }
    });

    // Botón Pausar / Reanudar
    pauseBtn.addEventListener('click', () => {
      if (!activeItem || !activeItem.id) return;
      const nextState = !activeToggle.checked;
      activeToggle.checked = nextState;
      activeToggle.dispatchEvent(new Event('change'));

      if (root.MTP && root.MTP.toggleProductAvailability) {
        root.MTP.toggleProductAvailability(activeItem.id, nextState);
        if (root.MTP.toast) {
          root.MTP.toast(nextState ? `▶️ "${activeItem.name}" reanudado` : `⏸️ "${activeItem.name}" pausado (agotado)`);
        }
        if (root.MTPPos && typeof root.MTPPos.renderProductsCol === 'function') {
          root.MTPPos.renderProductsCol();
        }
      }
    });

    // Botón Eliminar
    deleteBtn.addEventListener('click', () => {
      if (!activeItem || !activeItem.id) return;

      const doDelete = () => {
        if (root.MTP && root.MTP.deleteProduct) {
          root.MTP.deleteProduct(activeItem.id);
          if (root.MTP.toast) {
            root.MTP.toast(`🗑️ "${activeItem.name}" eliminado del catálogo`);
          }
          if (currentOptions && typeof currentOptions.onDeleted === 'function') {
            currentOptions.onDeleted(activeItem.id);
          }
          if (root.MTPPos && typeof root.MTPPos.renderProductsCol === 'function') {
            root.MTPPos.renderProductsCol();
          }
          closeDrawer();
        }
      };

      if (root.MTPUI && root.MTPUI.confirmDialog) {
        root.MTPUI.confirmDialog(
          `¿Estás seguro de que deseas eliminar permanentemente "${activeItem.name}"? Esta acción no se puede deshacer.`,
          {
            title: '¿Eliminar este producto?',
            okText: 'Eliminar definitivamente',
            cancelText: 'Cancelar',
            danger: true
          }
        ).then(ok => {
          if (ok) doDelete();
        });
      } else {
        doDelete();
      }
    });

    return {
      setType,
      setFamily,
      setTaxType,
      selectPhoto,
      close: closeDrawer
    };
  }

  function open(options = {}) {
    if (!canManageProducts()) {
      if (root.MTP && root.MTP.toast) {
        root.MTP.toast('⛔ Solo Administrador o Encargado pueden gestionar productos.', 'err');
      }
      return false;
    }

    currentOptions = options;
    const isEdit = options.mode === 'edit';
    activeItem = null;
    activeWasKitchen = false;

    if (isEdit) {
      if (options.item) {
        activeItem = options.item;
      } else if (options.id && root.MTP && root.MTP.getItemById) {
        activeItem = root.MTP.getItemById(options.id);
      }
    }

    if (currentBackdrop && currentBackdrop.parentNode) {
      currentBackdrop.parentNode.removeChild(currentBackdrop);
    }

    // Configurar estados iniciales
    if (activeItem) {
      const famId = activeItem.familyId || activeItem.group || 'fritos';
      const isKitchen = Boolean(
        activeItem.isDish || activeItem.isVariant || activeItem.kind === 'variant' ||
        (activeItem.type !== 'venta' && ['fritos', 'arepas', 'almuerzos', 'cafeteria'].includes(famId))
      );
      activeWasKitchen = isKitchen;
      selectedType = isKitchen ? 'cocina' : 'venta';
      selectedFamilyId = famId;
      selectedTaxType = isKitchen ? 'G' : ((activeItem.taxExempt || activeItem.taxType === 'E' || activeItem.iva === 'E') ? 'E' : 'G');
      selectedImg = activeItem.img || '';
    } else {
      selectedFamilyId = options.defaultFamilyId || 'fritos';
      const famObj = FAMILIES.find(f => f.id === selectedFamilyId);
      selectedType = famObj ? famObj.type : 'cocina';
      selectedTaxType = (famObj && famObj.defaultExempt) ? 'E' : 'G';
      selectedImg = '';
    }

    const div = document.createElement('div');
    div.innerHTML = createDrawerMarkup();
    const backdrop = div.firstElementChild;
    document.body.appendChild(backdrop);
    currentBackdrop = backdrop;

    const handlers = setupEvents(backdrop);

    // Rellenar datos si es edición
    if (activeItem) {
      backdrop.querySelector('#appleSheetTitleIcon').textContent = '✏️';
      backdrop.querySelector('#appleSheetTitleText').textContent = 'Editar Producto';
      backdrop.querySelector('#btnDrawerSave').textContent = '💾 Guardar Cambios';
      backdrop.querySelector('#drawerProdName').value = activeItem.name || '';
      backdrop.querySelector('#drawerPriceUsd').value = activeItem.priceUsd || '';
      backdrop.querySelector('#drawerCostUsd').value = activeItem.costUsd || '';
      backdrop.querySelector('#drawerCode').value = activeItem.code || '';
      backdrop.querySelector('#drawerBarcode').value = activeItem.barcode || '';
      backdrop.querySelector('#drawerStock').value = activeItem.stock !== undefined ? activeItem.stock : 20;
      backdrop.querySelector('#drawerMinStock').value = activeItem.minStock !== undefined ? activeItem.minStock : 5;

      const isAct = activeItem.active !== false;
      const activeToggle = backdrop.querySelector('#drawerActiveToggle');
      const activeLabel = backdrop.querySelector('#drawerActiveLabel');
      activeToggle.checked = isAct;
      activeLabel.textContent = isAct ? '🟢 Activo para la Venta' : '⏸️ Pausado (Agotado)';
      activeLabel.style.color = isAct ? '#0F172A' : '#DC2626';

      backdrop.querySelector('#btnDrawerDelete').style.display = 'inline-flex';
      backdrop.querySelector('#btnDrawerPause').style.display = 'inline-flex';
      backdrop.querySelector('#btnDrawerPause').textContent = isAct ? '⏸️ Pausar' : '▶️ Reanudar';
      backdrop.querySelector('#btnDrawerPrintLabel').style.display = 'inline-flex';

      const initialTaxType = selectedTaxType;
      handlers.setType(selectedType);
      handlers.setFamily(selectedFamilyId);
      handlers.setTaxType(initialTaxType);
      if (selectedImg) handlers.selectPhoto(selectedImg);

      backdrop.querySelector('#drawerPriceUsd').dispatchEvent(new Event('input'));
    } else {
      const initialTaxType = selectedTaxType;
      handlers.setType(selectedType);
      handlers.setFamily(selectedFamilyId);
      handlers.setTaxType(initialTaxType);

      if (root.MTPCodes && root.MTPCodes.suggestNextCode) {
        const suggestion = root.MTPCodes.suggestNextCode(selectedFamilyId);
        backdrop.querySelector('#drawerCode').value = suggestion.formattedCode;
        backdrop.querySelector('#drawerBarcode').value = root.MTPCodes.generateStandardBarcode(suggestion.number, selectedFamilyId);
      }
    }

    // Animación suave de entrada (WWDC spring)
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      const nameInput = backdrop.querySelector('#drawerProdName');
      if (nameInput) setTimeout(() => nameInput.focus(), 120);
    });
  }

  root.MTPProductDrawer = {
    open,
    LOCAL_PRODUCT_IMAGES,
    FAMILIES
  };

})(typeof window !== 'undefined' ? window : this);
