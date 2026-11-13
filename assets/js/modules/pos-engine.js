/* ==========================================================================
   MI-TIENDA-POS — Motor POS v5 (Fast Touch POS Engine para Windows 7)
   - Arquitectura 3 Columnas Fijas (Zero-Scroll global 1366x768 / 1024x768)
   - Col 1: Familias maestras (~160px) con atajos directos [1]-[9]
   - Col 2: Toolbar + Multiplicador [1x][2x][3x][5x] + Más Vendidos + Cuadrícula de Sabores
   - Col 3: Ticket Activo (~340px) + Botón Gigante Ámbar (F2)
   - Cero imágenes pesadas en botones de venta para respuesta instantánea (<10ms)
   - Atajos de Teclado F1-F4, Multicuenta / Espera (F3), Modificadores integrados
   - Sistema Venezolano de Cobro y Vuelto ($ + Bs Pago Móvil / Efectivo) 100% operativo
   ========================================================================== */
(function () {
  'use strict';

  let cart = [];
  let activeFamilyId = 'fritos';
  let activeMultiplier = 1;
  let activeModifierCartId = null;
  let replacingCartId = null;
  let currentPayments = [];
  let pmBankProof = null; // comprobante verificado del SMS del banco (Pago Móvil)
  let changeRateMode = 'BCV'; // 'BCV' | 'EUR' | 'USDT' | 'CUSTOM'
  let customChangeRate = 0;
  let changeRemainderMode = 'PM'; // 'PM' (Pago Móvil Bs) | 'BS_CASH' (Efectivo Bs)
  let changeRateManual = 0;     // tasa real negociada por el cajero en el momento
  let lastRenderedSale = null;
  let activeOrderMode = 'comer_aqui'; // 'comer_aqui' | 'para_llevar' | 'delivery'
  let activeSectorFilter = 'all';     // 'all' | 'cocina' | 'bodega'
  let _posStateListenerAttached = false;
  let _posDelegatedAttached = false;
  let changeDistDirty = false;
  let selectedCardIdx = -1;

  function esc(str) {
    if (window.MTP && typeof window.MTP.escapeHtml === 'function') {
      return window.MTP.escapeHtml(str);
    }
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getLocalTodayIso() {
    if (window.MTP && typeof window.MTP.getLocalDateIso === 'function') {
      return window.MTP.getLocalDateIso();
    }
    return new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
  }

  function toLocalIso(isoOrDate) {
    if (window.MTP && typeof window.MTP.toLocalDateIso === 'function') {
      return window.MTP.toLocalDateIso(isoOrDate);
    }
    if (!isoOrDate) return '';
    const d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return String(isoOrDate).slice(0, 10);
    return new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10);
  }

  function canManageProducts() {
    if (!window.MTPAuth) return true;
    const user = typeof window.MTPAuth.getCurrentUser === 'function' ? window.MTPAuth.getCurrentUser() : null;
    if (!user) return false;
    if (user.role === 'cajero') return false;
    if (typeof window.MTPAuth.can === 'function' && window.MTPAuth.can('manage_products')) {
      return true;
    }
    return user.role === 'admin' || user.role === 'encargado';
  }

  function updateManageProductsVisibility() {
    const newBtn = document.getElementById('btnPosQuickNewProduct');
    if (newBtn) {
      newBtn.style.display = canManageProducts() ? '' : 'none';
    }
  }

  function resolvePosImg(src, fallback) {
    if (window.MTP && typeof window.MTP.resolveImgPath === 'function') {
      return window.MTP.resolveImgPath(src, fallback);
    }
    return src || fallback;
  }

  function applyPosStoreMeta() {
    if (!window.MTP || !MTP.state || !MTP.state.settings) return;
    const cfg = MTP.state.settings;
    const storeName = (cfg.storeName || '').trim();
    const rif = (cfg.rif || '').trim();
    const h2 = document.querySelector('.admin-topbar .topbar-title h2');
    const pEl = document.querySelector('.admin-topbar .topbar-title p');
    const curUser = window.MTPAuth && window.MTPAuth.getCurrentUser ? window.MTPAuth.getCurrentUser() : null;
    const isCajaRole = curUser && curUser.role === 'cajero';
    if (h2 && storeName) {
      h2.textContent = storeName + (isCajaRole ? ' — Caja Rápida' : ' — Caja y Cotizador');
      document.title = storeName + ' — Caja Rápida | MI TIENDA POS';
    }
    if (pEl && rif) {
      pEl.textContent = rif + ' • Comida Preparada · Víveres · Pago Móvil y Vueltos';
    }
  }

  function isOverlayBlockingScanner() {
    if (document.querySelector('.modal-backdrop.open, .modal.open, #appleSheetBackdrop.open, .v7-palette-backdrop, .v7-modal-backdrop')) {
      return true;
    }
    const active = document.activeElement;
    if (active && active.id !== 'posScannerInput') {
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    }
    return false;
  }

  function focusScannerInput(selectText) {
    if (isOverlayBlockingScanner()) return;
    const scanInput = document.getElementById('posScannerInput');
    if (!scanInput) return;
    try {
      scanInput.focus();
      if (selectText && typeof scanInput.select === 'function') scanInput.select();
    } catch (e) {}
  }

  function getCatalogCards() {
    const container = document.getElementById('posProductsContainer');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.pos-flavor-card, .pos-retail-card'));
  }

  function syncCatalogCardSelection(resetToFirst) {
    const cards = getCatalogCards();
    if (!cards.length) {
      selectedCardIdx = -1;
      return;
    }
    if (resetToFirst) {
      selectedCardIdx = 0;
    } else if (selectedCardIdx >= cards.length) {
      selectedCardIdx = cards.length - 1;
    }
    cards.forEach((card, idx) => {
      card.setAttribute('data-card-idx', String(idx));
      card.classList.toggle('kbd-selected', idx === selectedCardIdx);
    });
  }

  function computeGridColumns(cards) {
    if (!cards || cards.length < 2) return 1;
    const firstTop = cards[0].getBoundingClientRect().top;
    let cols = 0;
    for (let i = 0; i < cards.length; i++) {
      if (Math.abs(cards[i].getBoundingClientRect().top - firstTop) <= 8) cols++;
      else break;
    }
    return Math.max(1, cols);
  }

  function moveCatalogCardSelection(key) {
    const cards = getCatalogCards();
    if (!cards.length) return false;
    if (selectedCardIdx < 0 || selectedCardIdx >= cards.length) {
      selectedCardIdx = 0;
    } else {
      const cols = computeGridColumns(cards);
      if (key === 'ArrowRight') selectedCardIdx = (selectedCardIdx + 1) % cards.length;
      else if (key === 'ArrowLeft') selectedCardIdx = (selectedCardIdx - 1 + cards.length) % cards.length;
      else if (key === 'ArrowDown') selectedCardIdx = Math.min(cards.length - 1, selectedCardIdx + cols);
      else if (key === 'ArrowUp') selectedCardIdx = Math.max(0, selectedCardIdx - cols);
    }
    cards.forEach((card, idx) => {
      const active = idx === selectedCardIdx;
      card.classList.toggle('kbd-selected', active);
      if (active && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ block: 'nearest' });
      }
    });
    return true;
  }

  function activateSelectedCatalogCard() {
    const cards = getCatalogCards();
    if (!cards.length) return false;
    const idx = (selectedCardIdx >= 0 && selectedCardIdx < cards.length) ? selectedCardIdx : 0;
    const target = cards[idx];
    if (!target) return false;
    target.click();
    return true;
  }
  const KITCHEN_FAMILY_IDS = ['fritos', 'arepas', 'almuerzos', 'cafeteria'];
  const RETAIL_FAMILY_IDS = ['viveres', 'bebidas', 'chucherias', 'cervezas', 'cigarros'];
  const BS_CHANGE_STEP = 0.50; // el vuelto en Bs se entrega en monedas de 0,50

  function setSectorFilter(sector) {
    activeSectorFilter = (sector === 'cocina' || sector === 'bodega') ? sector : 'all';
    const visibleFams = getFilteredFamiliesList();
    if (visibleFams.length && !visibleFams.some(f => f.id === activeFamilyId)) {
      activeFamilyId = visibleFams[0].id;
    }
    renderFamiliesNav();
    renderProductsCol();
  }

  function getFilteredFamiliesList() {
    const families = getFamiliesList();
    if (activeSectorFilter === 'cocina') {
      return families.filter(f => KITCHEN_FAMILY_IDS.indexOf(f.id) !== -1);
    }
    if (activeSectorFilter === 'bodega') {
      return families.filter(f => RETAIL_FAMILY_IDS.indexOf(f.id) !== -1);
    }
    return families;
  }

  function setOrderMode(mode) {
    activeOrderMode = mode || 'comer_aqui';
    const btns = document.querySelectorAll('#posOrderModeBar .order-mode-btn');
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === activeOrderMode);
    });
  }

  function getOrderMode() {
    return activeOrderMode;
  }

  function flashCardTap(refId) {
    try {
      const safeId = String(refId || '').replace(/"/g, '\\"');
      const card = document.querySelector(`[data-ref-id="${safeId}"]`);
      if (card) {
        card.classList.remove('card-tap-glow');
        void card.offsetWidth;
        card.classList.add('card-tap-glow');
      }
    } catch (_) {}
  }

  /* ==========================================================================
     INICIALIZACIÓN DEL POS
     ========================================================================== */
  function getActiveChangeRate() {
    const s = (MTP && MTP.state && MTP.state.settings) || {};
    if (changeRateMode === 'EUR') return Number(s.rateEur) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'USDT') return Number(s.rateUsdt) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'CUSTOM' && changeRateManual > 0) return changeRateManual;
    if (changeRateMode === 'CUSTOM' && customChangeRate > 0) return customChangeRate;
    return Number(s.rateBcv) || 42.85;
  }

  /** Permite al cajero cambiar la tasa con la que se entrega el vuelto. */
  function setChangeRateMode(mode, manualRate) {
    changeRateMode = mode || 'BCV';
    if (manualRate !== undefined && manualRate !== null && Number(manualRate) > 0) {
      changeRateManual = Number(manualRate);
      changeRateMode = 'CUSTOM';
    }
    changeDistDirty = false;
    renderPaymentsAndChange();
  }

  function initPOS() {
    if (!window.MTP) return;

    // Seleccionar familia inicial válida
    const families = getFamiliesList();
    if (families.length && !families.some(f => f.id === activeFamilyId)) {
      activeFamilyId = families[0].id;
    }

    const scanIcoEl = document.getElementById('posScanIco');
    if (scanIcoEl) {
      const icoSvg = (window.MTPIcons && typeof window.MTPIcons.get === 'function')
        ? (window.MTPIcons.get('barcode', { size: 16 }) || window.MTPIcons.get('search', { size: 16 }))
        : '';
      scanIcoEl.innerHTML = icoSvg || '🔍';
    }

    applyPosStoreMeta();
    updateManageProductsVisibility();
    renderTopRatePill();
    renderFamiliesNav();
    renderMultiplierGroup();
    renderBestsellersBar();
    renderProductsCol();
    renderTicket();
    renderShortcutsAndHeldBar();
    setupEventListeners();

    if (typeof location !== 'undefined' && String(location.search || '').indexOf('tickets=1') !== -1) {
      setTimeout(() => openTodayTicketsModal(), 80);
    }

    setTimeout(() => focusScannerInput(false), 60);

    if (!_posStateListenerAttached) {
      _posStateListenerAttached = true;
      window.addEventListener('mtp:state-updated', function () {
        const scanInput = document.getElementById('posScannerInput');
        applyPosStoreMeta();
        updateManageProductsVisibility();
        renderTopRatePill();
        renderFamiliesNav();
        renderBestsellersBar();
        renderProductsCol(scanInput ? scanInput.value.trim() : '');
        renderTicket();
      });
    }
  }

  function renderTopRatePill() {
    const pill = document.getElementById('topRatePill');
    if (!pill || !window.MTP || !MTP.state || !MTP.state.settings) return;
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    pill.textContent = `BCV: ${bcv.toFixed(2)} Bs/$`;
  }

  function getFamiliesList() {
    if (MTP.state && Array.isArray(MTP.state.families) && MTP.state.families.length) {
      return MTP.state.families;
    }
    return MTP.DEFAULT_FAMILIES || [];
  }

  /* ==========================================================================
     COLUMNA 1: FAMILIAS MAESTRAS (LISTA VERTICAL ~160px)
     ========================================================================== */
  function renderFamiliesNav() {
    const nav = document.getElementById('posColFamilies');
    if (!nav) return;

    const sectorBar = `
      <div class="pos-sector-filter" role="tablist" aria-label="Filtrar negocio">
        <button type="button" class="pos-sector-btn ${activeSectorFilter === 'all' ? 'active' : ''}"
          data-sector="all" title="Mostrar todo el negocio">Todo</button>
        <button type="button" class="pos-sector-btn ${activeSectorFilter === 'cocina' ? 'active' : ''}"
          data-sector="cocina" title="Solo comida preparada">🍳 Comida</button>
        <button type="button" class="pos-sector-btn ${activeSectorFilter === 'bodega' ? 'active' : ''}"
          data-sector="bodega" title="Solo bodega / víveres">🛒 Bodega</button>
      </div>
    `;

    const families = getFilteredFamiliesList();
    const famButtons = families.map((fam, idx) => {
      const isActive = fam.id === activeFamilyId;
      const count = getFamilyItemCount(fam.id);
      const keyLabel = fam.key || String(idx + 1);
      const color = fam.color || '#64748b';

      return `
        <button type="button" class="pos-family-nav-btn ${isActive ? 'active' : ''}"
          style="--fam-color: ${esc(color)}"
          data-fam-id="${esc(fam.id)}"
          title="Presiona [${esc(keyLabel)}] o clic para abrir ${esc(fam.name)}">
          <div class="pos-fam-top">
            <span class="pos-fam-key">${esc(keyLabel)}</span>
            <span class="pos-fam-count">${count} ítems</span>
          </div>
          <div class="pos-fam-name">${esc(fam.name)}</div>
        </button>
      `;
    }).join('');

    nav.innerHTML = sectorBar +
      '<div class="pos-fam-hint">Atajos: teclas 1–9 · PgUp / PgDn</div>' +
      famButtons;
  }

  function getFamilyItemCount(familyId) {
    let count = 0;
    // Comida con variantes
    if (MTP.getProductsByFamily) {
      const prods = MTP.getProductsByFamily(familyId);
      prods.forEach(p => {
        const vars = MTP.getVariantsForProduct ? MTP.getVariantsForProduct(p.id) : [];
        count += vars.length;
      });
    }
    // Si no encontró por productos, busca variantes directas
    if (count === 0 && Array.isArray(MTP.state.variants)) {
      count += MTP.state.variants.filter(v => v.familyId === familyId && v.active !== false).length;
    }
    // Mercancía minimercado
    if (MTP.getDirectRetailItems) {
      count += MTP.getDirectRetailItems(familyId).length;
    }
    return count;
  }

  function setActiveFamily(familyId) {
    activeFamilyId = familyId;
    closeModifiersDrawer();
    const scanInput = document.getElementById('posScannerInput');
    if (scanInput) scanInput.value = '';
    const nav = document.getElementById('posColFamilies');
    const safeFamId = String(familyId || '').replace(/"/g, '\\"');
    const targetBtn = nav ? nav.querySelector(`.pos-family-nav-btn[data-fam-id="${safeFamId}"]`) : null;
    if (nav && targetBtn) {
      nav.querySelectorAll('.pos-family-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn === targetBtn);
      });
    } else {
      renderFamiliesNav();
    }
    renderProductsCol('');
  }

  /* ==========================================================================
     COLUMNA 2: TOOLBAR SUPERIOR & SELECTOR DE MULTIPLICADOR ([1x], [2x], [3x], [5x])
     ========================================================================== */
  function renderMultiplierGroup() {
    const group = document.getElementById('posMultiplierGroup');
    if (!group) return;
    const mults = [1, 2, 3, 5];
    group.innerHTML = mults.map(m => `
      <button type="button" class="pos-mult-btn ${activeMultiplier === m ? 'active' : ''}"
        data-mult="${m}">
        ${m}x
      </button>
    `).join('');
  }

  function setMultiplier(mult) {
    activeMultiplier = Math.max(1, parseInt(mult, 10) || 1);
    const btns = document.querySelectorAll('#posMultiplierGroup .pos-mult-btn');
    btns.forEach(btn => {
      const m = parseInt(btn.getAttribute('data-mult'), 10);
      btn.classList.toggle('active', m === activeMultiplier);
    });
  }

  function consumeMultiplier() {
    const m = activeMultiplier;
    if (activeMultiplier !== 1) {
      setMultiplier(1);
    }
    return m;
  }

  /* ==========================================================================
     COLUMNA 2: BARRA DE MÁS VENDIDOS (CHIPS DE 1 TOQUE)
     ========================================================================== */
  function renderBestsellersBar() {
    const bar = document.getElementById('posBestsellersBar');
    if (!bar) return;

    const dynamicList = (MTP && typeof MTP.getDynamicBestsellers === 'function')
      ? MTP.getDynamicBestsellers(10)
      : [];

    const fallbackSeeds = [
      { code: '03', name: 'Emp. Mechada', id: 'var-emp-mechada', kind: 'variant', defaultPrice: 1.30 },
      { code: '01', name: 'Emp. Queso', id: 'var-emp-queso', kind: 'variant', defaultPrice: 1.10 },
      { code: '11', name: 'Past. Queso', id: 'var-past-queso', kind: 'variant', defaultPrice: 1.00 },
      { code: '19', name: 'Reina Pepiada', id: 'var-arepa-reina', kind: 'variant', defaultPrice: 3.00 },
      { code: '306', name: 'Malta Polar', id: 'prod-malta-lata', kind: 'retail', defaultPrice: 1.00 },
      { code: '501', name: 'Polar Pilsen', id: 'prod-polar-pilsen', kind: 'retail', defaultPrice: 1.25 },
      { code: '101', name: 'Harina PAN', id: 'prod-harina-pan', kind: 'retail', defaultPrice: 1.55 },
      { code: '31', name: 'Café Guayoyo', id: 'var-cafe-guayoyo', kind: 'variant', defaultPrice: 0.60 },
      { code: '201', name: 'Pepito', id: 'prod-pepito', kind: 'retail', defaultPrice: 0.95 },
      { code: '27', name: 'Pabellón', id: 'var-alm-pabellon', kind: 'variant', defaultPrice: 5.00 }
    ];

    const merged = [];
    const seenIds = {};
    dynamicList.forEach(d => {
      if (d && d.id && !seenIds[d.id]) {
        seenIds[d.id] = true;
        merged.push({
          id: d.id,
          code: d.code || '',
          name: d.name,
          kind: d.kind === 'retail' ? 'retail' : 'variant',
          defaultPrice: Number(d.priceUsd) || 0
        });
      }
    });
    if (merged.length < 8) {
      fallbackSeeds.forEach(s => {
        if (merged.length >= 10 || seenIds[s.id]) return;
        const existsVar = s.kind === 'variant' && Array.isArray(MTP.state.variants)
          && MTP.state.variants.some(v => (v.id === s.id || String(v.code) === s.code) && v.active !== false);
        const existsRet = s.kind === 'retail' && Array.isArray(MTP.state.inventory)
          && MTP.state.inventory.some(r => (r.id === s.id || String(r.code) === s.code) && r.active !== false && r.sellable);
        if (existsVar || existsRet) {
          seenIds[s.id] = true;
          merged.push(s);
        }
      });
    }

    const chips = merged.map(s => {
      let price = s.defaultPrice;
      let targetId = s.id;
      if (s.kind === 'variant' && Array.isArray(MTP.state.variants)) {
        const v = MTP.state.variants.find(x => x.id === s.id || String(x.code) === s.code);
        if (v) { price = Number(v.priceUsd) || price; targetId = v.id; }
      } else if (s.kind === 'retail' && Array.isArray(MTP.state.inventory)) {
        const r = MTP.state.inventory.find(x => x.id === s.id || String(x.code) === s.code);
        if (r) { price = Number(r.priceUsd) || price; targetId = r.id; }
      }

      return `
        <button type="button" class="pos-chip-btn" data-bs-kind="${esc(s.kind)}" data-bs-id="${esc(targetId)}" title="Agregar 1 toque: ${esc(s.name)}">
          <span>${esc(s.name)}</span>
          <span class="pos-chip-price">${MTP.fmtUSD(price)}</span>
        </button>
      `;
    }).join('');

    bar.innerHTML = `
      <span class="pos-bs-label">⭐ Más Vendidos:</span>
      ${chips}
    `;
  }

  /* ==========================================================================
     COLUMNA 2: CUADRÍCULA DE PRODUCTOS Y SABORES (ZERO MODALES LENTOS)
     ========================================================================== */
  function renderProductsCol(searchQuery = '') {
    const container = document.getElementById('posProductsContainer');
    if (!container) return;

    const q = String(searchQuery || '').trim().toLowerCase();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;

    // MODO BÚSQUEDA GLOBAL (Si el cajero escribió en el buscador)
    if (q) {
      renderSearchResults(container, q, bcv);
      syncCatalogCardSelection(true);
      return;
    }

    // MODO FAMILIA SELECCIONADA
    const products = MTP.getProductsByFamily ? MTP.getProductsByFamily(activeFamilyId) : [];
    const retailItems = MTP.getDirectRetailItems ? MTP.getDirectRetailItems(activeFamilyId) : [];

    let html = '';

    const allowManage = canManageProducts();

    // 1. Grupos de Comida con Sabores (Empanadas, Pastelitos, Arepas, Almuerzos, Café)
    if (products.length > 0) {
      products.forEach(prod => {
        const variants = MTP.getVariantsForProduct ? MTP.getVariantsForProduct(prod.id) : [];
        if (!variants.length) return;

        const minPrice = Math.min(...variants.map(v => Number(v.priceUsd) || 0));
        const maxPrice = Math.max(...variants.map(v => Number(v.priceUsd) || 0));
        const priceRange = minPrice === maxPrice
          ? MTP.fmtUSD(minPrice)
          : `${MTP.fmtUSD(minPrice)} – ${MTP.fmtUSD(maxPrice)}`;

        const flavorButtons = variants.map(v => {
          const qtyInCart = getCartQtyForRef(v.id, true);
          const cleanName = cleanFlavorName(v.name);
          const bsPrice = (v.priceUsd * bcv).toFixed(2);
          const hasMods = prod.modifierGroupIds && prod.modifierGroupIds.length > 0;
          const imgSrc = resolvePosImg(v.img || prod.img, 'assets/img/productos/empanadas.jpg');
          const editBtnHtml = allowManage
            ? `<button type="button" class="pos-card-edit-btn" data-action="edit-product" data-id="${esc(v.id)}" title="Editar plato en 5 segundos">✏️</button>`
            : '';

          return `
            <div class="pos-flavor-card ${qtyInCart > 0 ? 'in-cart' : ''}"
              data-action="add-variant" data-ref-id="${esc(v.id)}"
              title="${esc(v.name)} · ${esc(v.code)} (+IVA 16%)">
              ${editBtnHtml}
              <div class="pos-card-row">
                <img class="pos-card-thumb" src="${esc(imgSrc)}" alt="${esc(cleanName)}" loading="lazy"
                  onerror="this.style.display='none'">
                <div class="pos-card-main">
                  <div class="pos-btn-top">
                    <span class="pos-btn-plu">${esc(v.code)}</span>
                    ${qtyInCart > 0 ? `
                      <div class="pos-btn-stepper">
                        <button type="button" class="pos-step-btn minus" data-action="step-variant" data-id="${esc(v.id)}" data-delta="-1" title="Restar 1">−</button>
                        <span class="pos-step-num">${qtyInCart}</span>
                        <button type="button" class="pos-step-btn plus" data-action="step-variant" data-id="${esc(v.id)}" data-delta="1" title="Sumar 1">+</button>
                      </div>
                    ` : ''}
                  </div>
                  <div class="pos-btn-name">${esc(cleanName)}</div>
                </div>
              </div>
              <div class="pos-btn-bottom">
                <div class="pos-btn-prices">
                  <span class="pos-btn-usd">${MTP.fmtUSD(v.priceUsd)}</span>
                  <span class="pos-btn-bs">${bsPrice} Bs</span>
                </div>
                ${hasMods && qtyInCart > 0 ? `
                  <button type="button" class="pos-btn-mod-tag" data-action="mods-ref" data-id="${esc(v.id)}" title="Personalizar masa y extras">
                    ⚙ Extras
                  </button>
                ` : '<span class="pos-tax-pill g16">+IVA</span>'}
              </div>
            </div>
          `;
        }).join('');

        html += `
          <div class="pos-product-section">
            <div class="pos-section-header">
              <span class="pos-section-title">${esc(prod.name)}</span>
              <span class="pos-section-subtitle">${esc(prod.subtitle || '')} · ${priceRange}</span>
            </div>
            <div class="pos-flavors-grid">
              ${flavorButtons}
            </div>
          </div>
        `;
      });
    }

    // 2. Artículos de Venta Directa / Minimercado (Harina PAN, Bebidas, Cervezas, Chucherías, Cigarros)
    if (retailItems.length > 0) {
      const retailButtons = retailItems.map(item => {
        const qtyInCart = getCartQtyForRef(item.id, false);
        const bsPrice = (item.priceUsd * bcv).toFixed(2);
        const isLow = (Number(item.stock) || 0) <= (Number(item.minStock) || 5);
        const stockClass = isLow ? 'pos-stock-low' : 'pos-stock-ok';
        const isCigarro = item.familyId === 'cigarros' || item.group === 'cigarros';
        const ivaClass = window.MTPTax ? window.MTPTax.classify(item) : (item.iva || (item.taxExempt ? 'E' : 'G16'));
        const isExempt = ivaClass === 'E';
        const thumbHtml = isCigarro
          ? `<div class="pos-card-thumb-ico" title="Cigarros">${window.MTPIcons ? window.MTPIcons.get('bolt', { size: 20 }) : '🚬'}</div>`
          : `<img class="pos-card-thumb" src="${esc(resolvePosImg(item.img, 'assets/img/productos/viveres.jpg'))}" alt="${esc(item.name)}" loading="lazy" onerror="this.style.display='none'">`;
        const editBtnHtml = allowManage
          ? `<button type="button" class="pos-card-edit-btn" data-action="edit-product" data-id="${esc(item.id)}" title="Editar producto en 5 segundos">✏️</button>`
          : '';

        return `
          <div class="pos-retail-card ${qtyInCart > 0 ? 'in-cart' : ''}"
            data-action="add-retail" data-ref-id="${esc(item.id)}"
            title="${esc(item.name)} · ${esc(item.code)} (${isExempt ? 'Exento de IVA' : '+IVA 16%'})">
            ${editBtnHtml}
            <div class="pos-card-row">
              ${thumbHtml}
              <div class="pos-card-main">
                <div class="pos-btn-top">
                  <span class="pos-btn-plu">${esc(item.code)}</span>
                  <span class="pos-stock-pill ${stockClass}">${Math.round(item.stock || 0)} ${esc(item.unit || 'und')}</span>
                  ${qtyInCart > 0 ? `
                    <div class="pos-btn-stepper">
                      <button type="button" class="pos-step-btn minus" data-action="step-retail" data-id="${esc(item.id)}" data-delta="-1" title="Restar 1">−</button>
                      <span class="pos-step-num">${qtyInCart}</span>
                      <button type="button" class="pos-step-btn plus" data-action="step-retail" data-id="${esc(item.id)}" data-delta="1" title="Sumar 1">+</button>
                    </div>
                  ` : ''}
                </div>
                <div class="pos-btn-name">${esc(item.name)}</div>
              </div>
            </div>
            <div class="pos-btn-bottom">
              <div class="pos-btn-prices">
                <span class="pos-btn-usd">${MTP.fmtUSD(item.priceUsd)}</span>
                <span class="pos-btn-bs">${bsPrice} Bs</span>
              </div>
              <span class="pos-tax-pill ${isExempt ? 'exento' : 'g16'}">${isExempt ? 'Exento' : '+IVA'}</span>
            </div>
          </div>
        `;
      }).join('');

      html += `
        <div class="pos-product-section">
          <div class="pos-section-header">
            <span class="pos-section-title">Mercancía de Venta Directa</span>
            <span class="pos-section-subtitle">Pistola USB / Código Corto · ${retailItems.length} productos</span>
          </div>
          <div class="pos-flavors-grid">
            ${retailButtons}
          </div>
        </div>
      `;
    }

    if (!html) {
      html = `
        <div style="text-align:center;padding:30px 10px;background:#fff;border-radius:8px;border:1px dashed var(--border)">
          <div style="font-size:24px;margin-bottom:6px">🍽️</div>
          <strong>No hay productos asignados a esta familia</strong>
          <p style="font-size:12px;color:var(--txt-sec);margin:4px 0 0 0">
            Puedes cargar productos en el menú de Administración.
          </p>
        </div>
      `;
    }

    container.innerHTML = html;
    syncCatalogCardSelection(false);
  }

  function cleanFlavorName(fullName) {
    if (!fullName) return '';
    return fullName
      .replace(/^Empanada (de |del )?/i, '')
      .replace(/^Pastelito (de )?/i, '')
      .replace(/^Arepa (de |la )?/i, '')
      .trim();
  }

  function getCartQtyForRef(refId, isDish) {
    return cart
      .filter(c => c.refId === refId && (isDish ? c.isDish : !c.isDish))
      .reduce((sum, c) => sum + c.qty, 0);
  }

  function renderSearchResults(container, query, bcv) {
    const matchingVariants = (MTP.state.variants || []).filter(v =>
      v.active !== false &&
      (v.name.toLowerCase().includes(query) ||
       String(v.code).toLowerCase().includes(query) ||
       String(v.barcode || '').toLowerCase().includes(query))
    );

    const matchingRetail = (MTP.state.inventory || []).filter(i =>
      i.sellable &&
      (i.name.toLowerCase().includes(query) ||
       String(i.code).toLowerCase().includes(query) ||
       String(i.barcode || '').toLowerCase().includes(query) ||
       String(i.qrCode || '').toLowerCase().includes(query))
    );

    const allowManage = canManageProducts();

    if (!matchingVariants.length && !matchingRetail.length) {
      const createBtnHtml = allowManage
        ? `<button type="button" class="btn btn-sm btn-action" data-action="create-product">+ Crear producto ahora</button>`
        : '';
      container.innerHTML = `
        <div style="text-align:center;padding:26px 10px;background:#fff;border-radius:8px;border:1px dashed var(--border)">
          <div style="font-size:22px;margin-bottom:4px">🔍</div>
          <strong>Sin resultados para "${esc(query)}"</strong>
          <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
            <button type="button" class="btn btn-sm btn-ghost" data-action="clear-search">
              Limpiar búsqueda (ESC)
            </button>
            ${createBtnHtml}
          </div>
        </div>
      `;
      return;
    }

    const cards = [];

    matchingVariants.forEach(v => {
      const qtyInCart = getCartQtyForRef(v.id, true);
      const bsPrice = (v.priceUsd * bcv).toFixed(2);
      const imgSrc = resolvePosImg(v.img, 'assets/img/productos/empanadas.jpg');
      const editBtnHtml = allowManage
        ? `<button type="button" class="pos-card-edit-btn" data-action="edit-product" data-id="${esc(v.id)}" title="Editar plato en 5 segundos">✏️</button>`
        : '';
      cards.push(`
        <div class="pos-flavor-card ${qtyInCart > 0 ? 'in-cart' : ''}"
          data-action="add-variant" data-ref-id="${esc(v.id)}">
          ${editBtnHtml}
          <div class="pos-card-row">
            <img class="pos-card-thumb" src="${esc(imgSrc)}" alt="${esc(v.name)}" loading="lazy" onerror="this.style.display='none'">
            <div class="pos-card-main">
              <div class="pos-btn-top">
                <span class="pos-btn-plu">${esc(v.code)}</span>
                <span class="badge badge-amber" style="font-size:12px;padding:0 5px">Cocina</span>
                ${qtyInCart > 0 ? `
                  <div class="pos-btn-stepper">
                    <button type="button" class="pos-step-btn minus" data-action="step-variant" data-id="${esc(v.id)}" data-delta="-1">−</button>
                    <span class="pos-step-num">${qtyInCart}</span>
                    <button type="button" class="pos-step-btn plus" data-action="step-variant" data-id="${esc(v.id)}" data-delta="1">+</button>
                  </div>
                ` : ''}
              </div>
              <div class="pos-btn-name">${esc(v.name)}</div>
            </div>
          </div>
          <div class="pos-btn-bottom">
            <div class="pos-btn-prices">
              <span class="pos-btn-usd">${MTP.fmtUSD(v.priceUsd)}</span>
              <span class="pos-btn-bs">${bsPrice} Bs</span>
            </div>
            <span class="pos-tax-pill g16">+IVA</span>
          </div>
        </div>
      `);
    });

    matchingRetail.forEach(i => {
      const qtyInCart = getCartQtyForRef(i.id, false);
      const bsPrice = (i.priceUsd * bcv).toFixed(2);
      const isLow = (Number(i.stock) || 0) <= (Number(i.minStock) || 5);
      const stockClass = isLow ? 'pos-stock-low' : 'pos-stock-ok';
      const isCigarro = i.familyId === 'cigarros' || i.group === 'cigarros';
      const ivaClass = window.MTPTax ? window.MTPTax.classify(i) : (i.iva || (i.taxExempt ? 'E' : 'G16'));
      const isExempt = ivaClass === 'E';
      const thumbHtml = isCigarro
        ? `<div class="pos-card-thumb-ico">${window.MTPIcons ? window.MTPIcons.get('bolt', { size: 20 }) : '🚬'}</div>`
        : `<img class="pos-card-thumb" src="${esc(resolvePosImg(i.img, 'assets/img/productos/viveres.jpg'))}" alt="${esc(i.name)}" loading="lazy" onerror="this.style.display='none'">`;
      const editBtnHtml = allowManage
        ? `<button type="button" class="pos-card-edit-btn" data-action="edit-product" data-id="${esc(i.id)}" title="Editar producto en 5 segundos">✏️</button>`
        : '';

      cards.push(`
        <div class="pos-retail-card ${qtyInCart > 0 ? 'in-cart' : ''}"
          data-action="add-retail" data-ref-id="${esc(i.id)}">
          ${editBtnHtml}
          <div class="pos-card-row">
            ${thumbHtml}
            <div class="pos-card-main">
              <div class="pos-btn-top">
                <span class="pos-btn-plu">${esc(i.code)}</span>
                <span class="pos-stock-pill ${stockClass}">${Math.round(i.stock || 0)} ${esc(i.unit || 'und')}</span>
                ${qtyInCart > 0 ? `
                  <div class="pos-btn-stepper">
                    <button type="button" class="pos-step-btn minus" data-action="step-retail" data-id="${esc(i.id)}" data-delta="-1">−</button>
                    <span class="pos-step-num">${qtyInCart}</span>
                    <button type="button" class="pos-step-btn plus" data-action="step-retail" data-id="${esc(i.id)}" data-delta="1">+</button>
                  </div>
                ` : ''}
              </div>
              <div class="pos-btn-name">${esc(i.name)}</div>
            </div>
          </div>
          <div class="pos-btn-bottom">
            <div class="pos-btn-prices">
              <span class="pos-btn-usd">${MTP.fmtUSD(i.priceUsd)}</span>
              <span class="pos-btn-bs">${bsPrice} Bs</span>
            </div>
            <span class="pos-tax-pill ${isExempt ? 'exento' : 'g16'}">${isExempt ? 'Exento' : '+IVA'}</span>
          </div>
        </div>
      `);
    });

    container.innerHTML = `
      <div class="pos-product-section">
        <div class="pos-section-header" style="background:#ecfdf5;border-color:#10b981">
          <span class="pos-section-title" style="color:#065f46">Resultados de búsqueda: "${esc(query)}"</span>
          <span class="pos-section-subtitle">${matchingVariants.length + matchingRetail.length} coincidencias</span>
        </div>
        <div class="pos-flavors-grid">
          ${cards.join('')}
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     AGREGAR ÍTEMS RÁPIDOS AL TICKET (1 TOQUE = INGRESA DE INMEDIATO)
     ========================================================================== */
  
  function stepVariantQty(variantId, delta, ev) {
    if (ev) ev.stopPropagation();
    if (delta > 0) {
      addVariantQuick(variantId, 1);
    } else {
      const idx = cart.findLastIndex ? cart.findLastIndex(c => c.refId === variantId && c.isDish) : -1;
      let targetIdx = idx;
      if (targetIdx === -1) {
        for (let i = cart.length - 1; i >= 0; i--) {
          if (cart[i].refId === variantId && cart[i].isDish) {
            targetIdx = i;
            break;
          }
        }
      }
      if (targetIdx !== -1) {
        changeCartQty(cart[targetIdx].cartId, -1);
      }
    }
    renderTicket();
    renderProductsCol();
  }

  function stepRetailQty(itemId, delta, ev) {
    if (ev) ev.stopPropagation();
    if (delta > 0) {
      addRetailQuick(itemId, 1);
    } else {
      let targetIdx = -1;
      for (let i = cart.length - 1; i >= 0; i--) {
        if (cart[i].refId === itemId && !cart[i].isDish) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx !== -1) {
        changeCartQty(cart[targetIdx].cartId, -1);
      }
    }
    renderTicket();
    renderProductsCol();
  }

  function openModifiersForRef(refId) {
    const line = cart.find(c => c.refId === refId);
    if (line) {
      openModifiersDrawer(line.cartId);
    }
  }

  function addVariantQuick(variantId, forcedQty = null) {
    const qty = forcedQty || consumeMultiplier();
    const variant = (MTP.state.variants || []).find(v => v.id === variantId)
                 || (MTP.state.dishes || []).find(d => d.id === variantId);
    if (!variant) return;

    // Si está en Modo Reemplazo (⇄ Reemplazar)
    if (replacingCartId) {
      const idx = cart.findIndex(c => c.cartId === replacingCartId);
      if (idx !== -1) {
        const oldName = cart[idx].name;
        cart[idx] = createCartLineFromVariant(variant, cart[idx].qty);
        replacingCartId = null;
        updateReplaceBanner();
        renderTicket();
        renderProductsCol();
        MTP.toast(`Reemplazado "${oldName}" por "${variant.name}"`);
        return;
      }
      replacingCartId = null;
      updateReplaceBanner();
    }

    // Grupos de modificadores por defecto
    const defaultMods = getDefaultModifiersForProduct(variant.productId);

    // Si ya existe en el ticket sin notas personalizadas y con los mismos modificadores
    const existing = cart.find(c =>
      c.refId === variant.id &&
      c.isDish &&
      !c.note &&
      areModifiersEqual(c.selectedModifiers, defaultMods)
    );

    let targetCartId = null;

    if (existing) {
      existing.qty += qty;
      targetCartId = existing.cartId;
    } else {
      const newLine = createCartLineFromVariant(variant, qty, defaultMods);
      cart.push(newLine);
      targetCartId = newLine.cartId;
    }

    // Si el producto tiene grupos de modificadores (como Arepas), despliega el panel inferior ágil
    // No abrir de golpe el drawer para evitar sobresaltos en pantalla.
    // El cajero puede tocar "⚙ Extras" en el botón o en el ticket cuando lo desee.
    const modGroups = MTP.getModifierGroupsForProduct ? MTP.getModifierGroupsForProduct(variant.productId) : [];
    if (!modGroups || !modGroups.length) {
      closeModifiersDrawer();
    }

    flashCardTap(variant.id);
    renderTicket();
    renderProductsCol();
    setTimeout(() => focusScannerInput(false), 20);
  }

  function addRetailQuick(itemId, forcedQty = null) {
    const qty = forcedQty || consumeMultiplier();
    const item = MTP.getInsumoById ? MTP.getInsumoById(itemId) : (MTP.state.inventory || []).find(i => i.id === itemId);
    if (!item || !item.sellable) return;

    // Si está en Modo Reemplazo (⇄ Reemplazar)
    if (replacingCartId) {
      const idx = cart.findIndex(c => c.cartId === replacingCartId);
      if (idx !== -1) {
        const oldName = cart[idx].name;
        cart[idx] = createCartLineFromRetail(item, cart[idx].qty);
        replacingCartId = null;
        updateReplaceBanner();
        renderTicket();
        renderProductsCol();
        MTP.toast(`Reemplazado "${oldName}" por "${item.name}"`);
        return;
      }
      replacingCartId = null;
      updateReplaceBanner();
    }

    // Guarda de existencias estricto: impide vender productos sin stock (stock <= 0) o sobrepasar anaquel
    const stock = Number(item.stock || 0);
    if (stock <= 0) {
      MTP.toast(`"${item.name}" está agotado (0 existencias). Registra llegada de mercancía primero.`, 'err');
      return;
    }

    const alreadyInCart = cart.filter(c => c.refId === item.id).reduce((a, c) => a + c.qty, 0);
    let addQty = qty;
    if (alreadyInCart + addQty > stock) {
      addQty = Math.max(0, Number((stock - alreadyInCart).toFixed(3)));
      if (addQty <= 0) {
        MTP.toast(`Ya llevas todas las ${stock} ${item.unit || 'und'} disponibles de "${item.name}".`, 'warn');
        return;
      }
      MTP.toast(`Solo quedaban ${addQty} ${item.unit || 'und'} disponibles de "${item.name}".`, 'warn');
    }

    const existing = cart.find(c => c.refId === item.id && !c.isDish && !c.note);
    if (existing) {
      existing.qty += addQty;
    } else {
      cart.push(createCartLineFromRetail(item, addQty));
    }

    closeModifiersDrawer();
    flashCardTap(item.id);
    renderTicket();
    renderProductsCol();
    setTimeout(() => focusScannerInput(false), 20);
  }

  function createCartLineFromVariant(variant, qty, mods = []) {
    const basePrice = Number(variant.priceUsd) || 0;
    const modsPrice = mods.reduce((sum, m) => sum + (Number(m.priceUsd) || 0), 0);
    return {
      cartId: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      refId: variant.id,
      variantId: variant.id,
      productId: variant.productId,
      familyId: variant.familyId || 'fritos',
      code: variant.code,
      name: variant.name,
      isDish: true,
      isVariant: true,
      unit: 'plato',
      qty,
      basePriceUsd: basePrice,
      priceUsd: Number((basePrice + modsPrice).toFixed(2)),
      iva: 'G16',
      ivaType: 'G',
      taxExempt: false,
      selectedModifiers: mods,
      note: ''
    };
  }

  function createCartLineFromRetail(item, qty) {
    const ivaClass = window.MTPTax ? window.MTPTax.classify(item) : (item.iva || (item.taxExempt ? 'E' : 'G16'));
    return {
      cartId: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      refId: item.id,
      familyId: item.familyId || item.group || 'viveres',
      code: item.code,
      barcode: item.barcode,
      name: item.name,
      isDish: false,
      isVariant: false,
      unit: item.unit || 'und',
      qty,
      basePriceUsd: Number(item.priceUsd) || 0,
      priceUsd: Number(item.priceUsd) || 0,
      iva: ivaClass,
      ivaType: ivaClass === 'E' ? 'E' : 'G',
      taxExempt: ivaClass === 'E',
      selectedModifiers: [],
      note: ''
    };
  }

  function getDefaultModifiersForProduct(productId) {
    if (!productId || !MTP.getModifierGroupsForProduct) return [];
    const groups = MTP.getModifierGroupsForProduct(productId);
    const defaults = [];
    groups.forEach(g => {
      if (g.required && Array.isArray(g.options) && g.options.length > 0) {
        defaults.push(Object.assign({}, g.options[0], { groupId: g.id }));
      }
    });
    return defaults;
  }

  function areModifiersEqual(modsA = [], modsB = []) {
    if (!Array.isArray(modsA) || !Array.isArray(modsB)) return false;
    if (modsA.length !== modsB.length) return false;
    const idsA = modsA.map(m => m.id).sort().join(',');
    const idsB = modsB.map(m => m.id).sort().join(',');
    return idsA === idsB;
  }

  /* ==========================================================================
     PANEL / DRAWER INTEGRADO DE MODIFICADORES (NO BLOQUEANTE)
     ========================================================================== */
  function openModifiersDrawer(cartId) {
    const drawer = document.getElementById('posModifiersDrawer');
    if (!drawer) return;

    const line = cart.find(c => c.cartId === cartId);
    if (!line || !line.productId) {
      closeModifiersDrawer();
      return;
    }

    const groups = MTP.getModifierGroupsForProduct ? MTP.getModifierGroupsForProduct(line.productId) : [];
    if (!groups || !groups.length) {
      closeModifiersDrawer();
      return;
    }

    activeModifierCartId = cartId;

    const groupsHtml = groups.map(g => {
      const optionsHtml = (g.options || []).map(opt => {
        const isSelected = (line.selectedModifiers || []).some(m => m.id === opt.id);
        const priceTag = opt.priceUsd > 0 ? ` (+${MTP.fmtUSD(opt.priceUsd)})` : '';
        return `
          <button type="button" class="mod-opt-btn ${isSelected ? 'active' : ''}"
            data-action="toggle-mod" data-cart-id="${esc(cartId)}" data-group-id="${esc(g.id)}" data-option-id="${esc(opt.id)}">
            ${esc(opt.name)}${priceTag}
          </button>
        `;
      }).join('');

      return `
        <div class="pos-mod-group">
          <span class="pos-mod-label">${esc(g.name)}:</span>
          ${optionsHtml}
        </div>
      `;
    }).join('');

    drawer.innerHTML = `
      <div class="pos-mod-hd">
        <span class="pos-mod-title">⚙ Opciones / Extras para: <strong>${esc(line.name)}</strong></span>
        <button type="button" class="pos-mod-close-btn" data-action="close-mods">
          ✓ Listo (ESC)
        </button>
      </div>
      <div class="pos-mod-body">
        ${groupsHtml}
      </div>
    `;

    drawer.style.display = 'flex';
  }

  function toggleModifierOption(cartId, groupId, optionId) {
    const line = cart.find(c => c.cartId === cartId);
    if (!line) return;

    const groups = MTP.getModifierGroupsForProduct ? MTP.getModifierGroupsForProduct(line.productId) : [];
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const option = (group.options || []).find(o => o.id === optionId);
    if (!option) return;

    if (!Array.isArray(line.selectedModifiers)) line.selectedModifiers = [];

    const existingIdx = line.selectedModifiers.findIndex(m => m.id === optionId);

    if (group.max === 1) {
      // Radio: quita cualquier otra opción de este grupo y pone la seleccionada
      line.selectedModifiers = line.selectedModifiers.filter(m => m.groupId !== groupId);
      line.selectedModifiers.push(Object.assign({}, option, { groupId }));
    } else {
      // Checkbox: toggle
      if (existingIdx !== -1) {
        line.selectedModifiers.splice(existingIdx, 1);
      } else {
        line.selectedModifiers.push(Object.assign({}, option, { groupId }));
      }
    }

    // Recalcular precio unitario del renglón
    const modsPrice = line.selectedModifiers.reduce((sum, m) => sum + (Number(m.priceUsd) || 0), 0);
    line.priceUsd = Number(((Number(line.basePriceUsd) || 0) + modsPrice).toFixed(2));

    renderTicket();
    openModifiersDrawer(cartId);
  }

  function closeModifiersDrawer() {
    activeModifierCartId = null;
    const drawer = document.getElementById('posModifiersDrawer');
    if (drawer) drawer.style.display = 'none';
  }

  /* ==========================================================================
     COLUMNA 3: TICKET DE ORDEN ACTIVA
     ========================================================================== */
  function renderTicket() {
    const listEl = document.getElementById('posTicketItems');
    const countEl = document.getElementById('posTicketCount');
    const totUsdEl = document.getElementById('posTotalUsd');
    const totBsEl = document.getElementById('posTotalBs');
    const taxBoxEl = document.getElementById('posTaxBreakdown');
    if (!listEl) return;

    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const totalItems = cart.reduce((acc, c) => acc + c.qty, 0);
    const tax = getCartTaxSummary([]);
    const totalUsd = tax.totalUsd;
    const totalBs = tax.totalBs;

    if (countEl) countEl.textContent = `${totalItems} producto${totalItems === 1 ? '' : 's'}`;
    if (totUsdEl) totUsdEl.textContent = MTP.fmtUSD(totalUsd);
    if (totBsEl) totBsEl.textContent = MTP.fmtBsRaw(totalBs);

    // Sincronizar botones de modalidad (Comer Aquí / Para Llevar / Delivery)
    const modeBtns = document.querySelectorAll('#posOrderModeBar .order-mode-btn');
    if (modeBtns.length) {
      modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === activeOrderMode);
      });
    }

    if (window.MTPDesktop && typeof window.MTPDesktop.setCartState === 'function') {
      try {
        window.MTPDesktop.setCartState({ hasItems: cart.length > 0, count: totalItems, totalUsd });
      } catch (_) {}
    }

    if (taxBoxEl) {
      if (!cart.length) {
        taxBoxEl.style.display = 'none';
      } else {
        taxBoxEl.style.display = 'block';
        const modeLabel = tax.ivaMode === 'INCLUIDO' ? 'IVA 16% (incluido)' : 'IVA 16% (+recargo)';
        taxBoxEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#334155">
            <span>Subtotal (<span style="color:#059669;font-weight:700">Exento: ${MTP.fmtUSD(tax.exentoUsd)}</span> · Gravado: ${MTP.fmtUSD(tax.baseG16Usd)})</span>
            <strong style="font-family:var(--font-mono);color:#0F172A">${MTP.fmtUSD(tax.subtotalBaseUsd)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#334155;margin-top:2px">
            <span>${esc(modeLabel)}:</span>
            <strong style="font-family:var(--font-mono);color:#B45309">+${MTP.fmtUSD(tax.totalIvaUsd)} (${tax.totalIvaBs.toFixed(2)} Bs)</strong>
          </div>
        `;
      }
    }

    if (!cart.length) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:36px 14px;color:#475569;font-size:13px">
          <div style="font-size:28px;margin-bottom:8px">🛒</div>
          <strong style="color:#0F172A;font-size:14px">Orden vacía</strong>
          <p style="margin:4px 0 0 0;font-size:12px;color:#64748B">
            Toca un producto o escanea un código de barras para facturar.
          </p>
        </div>
      `;
      renderShortcutsAndHeldBar();
      return;
    }

    listEl.innerHTML = cart.map(c => {
      const lineSubUsd = c.qty * c.priceUsd;
      const lineSubBs = lineSubUsd * bcv;
      const hasMods = Array.isArray(c.selectedModifiers) && c.selectedModifiers.length > 0;
      const modsLabel = hasMods ? c.selectedModifiers.map(m => m.name).join(', ') : '';
      const canHaveMods = c.isDish && c.productId && (MTP.getModifierGroupsForProduct ? MTP.getModifierGroupsForProduct(c.productId).length > 0 : false);

      return `
        <div class="ticket-row ${replacingCartId === c.cartId ? 'in-cart' : ''}">
          <div class="ticket-row-info">
            <div class="ticket-row-title">
              <span class="code-pill ${c.isDish ? 'plu' : ''}" style="font-size:12px;padding:0 4px">#${esc(c.code)}</span>
              <span>${esc(c.name)}</span>
            </div>
            ${hasMods ? `<div class="ticket-row-mods">⚙ ${esc(modsLabel)}</div>` : ''}
            <div class="ticket-row-sub">
              <span>${MTP.fmtUSD(c.priceUsd)} c/u</span>
              ${canHaveMods ? `<button type="button" class="ticket-mini-btn" data-action="mods" data-cart-id="${esc(c.cartId)}">⚙ Extras</button>` : ''}
              <button type="button" class="ticket-mini-btn" data-action="note" data-cart-id="${esc(c.cartId)}" title="Nota de cocina">📝 Nota</button>
              <button type="button" class="ticket-mini-btn" data-action="replace" data-cart-id="${esc(c.cartId)}" title="Reemplazar ítem">⇄</button>
            </div>
            ${c.note ? `<div class="ticket-row-note">NOTA: ${esc(c.note)}</div>` : ''}
          </div>

          <div class="ticket-qty-ctrl">
            <button type="button" class="qty-btn minus" data-action="qty" data-cart-id="${esc(c.cartId)}" data-delta="-1" title="Restar 1">−</button>
            <span style="font-family:var(--font-mono);font-weight:900;font-size:13px;min-width:20px;text-align:center;color:#0F172A">${c.qty}</span>
            <button type="button" class="qty-btn plus" data-action="qty" data-cart-id="${esc(c.cartId)}" data-delta="1" title="Sumar 1">+</button>
          </div>

          <div class="ticket-row-tot">
            <div style="font-family:var(--font-mono);font-size:12.5px;font-weight:900;color:#0f172a">${MTP.fmtUSD(lineSubUsd)}</div>
            <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:#059669">${lineSubBs.toFixed(2)} Bs</div>
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger);padding:0 4px;font-size:12px;line-height:1"
              data-action="remove" data-cart-id="${esc(c.cartId)}" title="Eliminar renglón">✕</button>
          </div>
        </div>
      `;
    }).join('');

    renderShortcutsAndHeldBar();
  }

  function changeCartQty(cartId, delta) {
    const idx = cart.findIndex(c => c.cartId === cartId);
    if (idx === -1) return;
    if (delta > 0 && !cart[idx].isDish) {
      const it = MTP.getInsumoById ? MTP.getInsumoById(cart[idx].refId) : null;
      const stock = it ? Number(it.stock || 0) : Infinity;
      const inCart = cart.filter(c => c.refId === cart[idx].refId).reduce((a, c) => a + c.qty, 0);
      if (inCart + delta > stock) {
        MTP.toast(`Máximo disponible en tienda: ${stock} ${it ? it.unit : 'und'} de "${cart[idx].name}".`, 'warn');
        return;
      }
    }
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) {
      if (replacingCartId === cartId) replacingCartId = null;
      if (activeModifierCartId === cartId) closeModifiersDrawer();
      cart.splice(idx, 1);
      updateReplaceBanner();
    }
    renderTicket();
    renderProductsCol();
  }

  function removeCartLine(cartId) {
    if (replacingCartId === cartId) replacingCartId = null;
    if (activeModifierCartId === cartId) closeModifiersDrawer();
    cart = cart.filter(c => c.cartId !== cartId);
    updateReplaceBanner();
    renderTicket();
    renderProductsCol();
  }

  function addKitchenNote(cartId) {
    const line = cart.find(c => c.cartId === cartId);
    if (!line) return;
    if (window.MTPUI && typeof window.MTPUI.promptDialog === 'function') {
      window.MTPUI.promptDialog(`Escribe una indicación especial para "${line.name}" (ej: Sin salsa, Bien tostada, Para llevar):`, {
        title: '📝 Nota para Cocina',
        defaultValue: line.note || '',
        placeholder: 'Sin cebolla / bien cocida...',
        okText: 'Guardar Nota'
      }).then(note => {
        if (note !== null && note !== undefined) {
          line.note = String(note).trim();
          renderTicket();
        }
      });
    }
  }

  function clearCart() {
    if (!cart.length) return;
    cart = [];
    replacingCartId = null;
    closeModifiersDrawer();
    updateReplaceBanner();
    const cust = document.getElementById('posCustomerInput');
    if (cust) cust.value = '';
    renderTicket();
    renderProductsCol();
    MTP.toast('Ticket vaciado', 'warn');
  }

  /**
   * ÚNICA fuente de verdad del total de la venta.
   * El ticket, el modal de cobro, el vuelto, la validación y el registro
   * usan TODOS esta misma función: por construcción el número que ve el
   * cajero es exactamente el que se cobra y el que se guarda.
   *
   * @param {Array|null} paymentsOverride  pagos ya registrados
   * @param {Object|null} changeOverride   { usdCash, bsCash, bsPm }
   */
  function computeSaleTotals(paymentsOverride, changeOverride) {
    const payments = Array.isArray(paymentsOverride) ? paymentsOverride : currentPayments;
    const chg = changeOverride || getChangeDistributionInputs();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;

    if (window.MTPTax && window.MTPTax.computeTotals) {
      return window.MTPTax.computeTotals({
        lines: cart,
        payments: payments,
        changeUsdCashGiven: chg.usdCash,
        changeBsCashGiven: chg.bsCash,
        changeBsPmGiven: chg.bsPm,
        changeRate: getActiveChangeRate(),
        rateBcv: bcv,
        settings: MTP.state.settings
      });
    }

    // Respaldo si el motor fiscal no está cargado (debe ser imposible en producción)
    const sub = cart.reduce((acc, item) => acc + (item.qty * item.priceUsd), 0);
    const total = Number((sub * 1.16).toFixed(2));
    return {
      subtotalBaseUsd: Number(sub.toFixed(2)),
      exentoUsd: 0,
      baseG16Usd: Number(sub.toFixed(2)),
      totalIvaUsd: Number((sub * 0.16).toFixed(2)),
      igtfUsd: 0,
      totalUsd: total,
      totalBs: Number((total * bcv).toFixed(2)),
      rateBcv: bcv
    };
  }

  /** Lee la distribución del vuelto que escribió el cajero. */
  function getChangeDistributionInputs() {
    return {
      usdCash: parseFloat(document.getElementById('vueltoDistUsd')?.value) || 0,
      bsCash: parseFloat(document.getElementById('vueltoDistBsCash')?.value) || 0,
      bsPm: parseFloat(document.getElementById('vueltoDistBsPm')?.value) || 0
    };
  }

  function getCartTaxSummary(paymentsOverride = null, changeUsdCashGiven = 0) {
    const chg = changeUsdCashGiven
      ? { usdCash: changeUsdCashGiven, bsCash: 0, bsPm: 0 }
      : getChangeDistributionInputs();
    return computeSaleTotals(paymentsOverride, chg);
  }

  function getCartTotalUsd() {
    return computeSaleTotals().totalUsd;
  }

  /* ==========================================================================
     MODO REEMPLAZO (⇄ Reemplazar renglón por otro plato o sabor)
     ========================================================================== */
  function startReplaceLine(cartId) {
    if (replacingCartId === cartId) {
      cancelReplaceMode();
      return;
    }
    replacingCartId = cartId;
    updateReplaceBanner();
    renderTicket();
    MTP.toast('Modo Reemplazo: toca el nuevo sabor o producto que entrará', 'warn');
  }

  function cancelReplaceMode() {
    replacingCartId = null;
    updateReplaceBanner();
    renderTicket();
  }

  function updateReplaceBanner() {
    const banner = document.getElementById('posReplaceBanner');
    if (!banner) return;
    if (!replacingCartId) {
      banner.style.display = 'none';
      return;
    }
    const line = cart.find(c => c.cartId === replacingCartId);
    banner.style.display = 'flex';
    banner.innerHTML = `
      <span>🔄 MODO REEMPLAZO ACTIVO: Selecciona el nuevo ítem para reemplazar <strong>"${esc(line ? line.name : '')}"</strong></span>
      <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:12px" data-action="cancel-replace">Cancelar (ESC)</button>
    `;
  }

  /* ==========================================================================
     CUENTAS EN ESPERA / MULTICUENTA (F3)
     ========================================================================== */
  function renderShortcutsAndHeldBar() {
    const barEl = document.getElementById('heldOrdersBar');
    if (!barEl) return;

    const held = (MTP.state && MTP.state.heldOrders) || [];
    if (!held.length) {
      barEl.style.display = 'none';
      return;
    }

    barEl.style.display = 'flex';
    const pills = held.map(h => {
      const tot = (h.items || []).reduce((a, b) => a + b.qty * b.priceUsd, 0);
      return `
        <span class="held-pill" data-hold-id="${esc(h.id)}" title="Clic para retomar esta cuenta">
          <span>🕒 ${esc(h.customer)} (${MTP.fmtUSD(tot)})</span>
        </span>
      `;
    }).join('');

    barEl.innerHTML = `
      <span style="font-size:12px;font-weight:800;color:#1e40af">Espera:</span>
      ${pills}
    `;
  }

  function holdCurrentCart() {
    if (!cart.length) {
      const held = (MTP.state && MTP.state.heldOrders) || [];
      if (held.length > 0) {
        restoreHeldOrder(held[0].id);
      } else {
        MTP.toast('Agrega productos al ticket antes de ponerlo en espera', 'warn');
      }
      return;
    }

    const customerInput = document.getElementById('posCustomerInput');
    const name = (customerInput && customerInput.value.trim()) || ('Mesa #' + (((MTP.state.heldOrders || []).length) + 1));
    if (!Array.isArray(MTP.state.heldOrders)) MTP.state.heldOrders = [];

    MTP.state.heldOrders.unshift({
      id: 'HOLD-' + Date.now(),
      customer: name,
      createdAt: new Date().toISOString(),
      items: JSON.parse(JSON.stringify(cart))
    });

    cart = [];
    if (customerInput) customerInput.value = '';
    closeModifiersDrawer();
    cancelReplaceMode();
    MTP.save();
    renderTicket();
    renderProductsCol();
    MTP.toast(`Cuenta de "${name}" guardada en espera (F3).`);
  }

  function restoreHeldOrder(holdId) {
    const idx = (MTP.state.heldOrders || []).findIndex(h => h.id === holdId);
    if (idx === -1) return;
    const target = MTP.state.heldOrders[idx];

    // Si había ítems en el carrito actual, se salvan en espera
    if (cart.length > 0) {
      const curCustomer = document.getElementById('posCustomerInput')?.value.trim() || 'Cuenta Previa';
      MTP.state.heldOrders.push({
        id: 'HOLD-' + Date.now(),
        customer: curCustomer,
        createdAt: new Date().toISOString(),
        items: JSON.parse(JSON.stringify(cart))
      });
    }

    MTP.state.heldOrders.splice(idx, 1);
    cart = target.items || [];
    const customerInput = document.getElementById('posCustomerInput');
    if (customerInput) customerInput.value = target.customer || '';

    closeModifiersDrawer();
    cancelReplaceMode();
    MTP.save();
    renderTicket();
    renderProductsCol();
    MTP.toast(`Retomada cuenta: ${target.customer}`);
  }

  /* ==========================================================================
     PROCESADOR DE ESCÁNER, TECLADO Y ATAJOS F1-F4
     ========================================================================== */
  function handleCodeOrSearchSubmit(rawInput, forcedQty = null) {
    const clean = String(rawInput || '').trim();
    if (!clean) return;

    let qty = forcedQty || consumeMultiplier();
    let query = clean;

    // Detectar sintaxis '3*01' o '2*malta'
    if (clean.includes('*')) {
      const parts = clean.split('*');
      const parsedMult = parseInt(parts[0], 10);
      if (!isNaN(parsedMult) && parsedMult > 0) {
        qty = parsedMult;
        query = parts.slice(1).join('*').trim();
      }
    }

    if (!query) {
      setMultiplier(qty);
      return;
    }

    const match = MTP.findByCodeOrBarcode ? MTP.findByCodeOrBarcode(query, false) : null;
    if (match) {
      if (match.kind === 'variant' || match.kind === 'dish') {
        addVariantQuick(match.item.id, qty);
        MTP.toast(`Agregado: ${match.item.name} (${qty}x)`);
      } else {
        addRetailQuick(match.item.id, qty);
        MTP.toast(`Agregado: ${match.item.name} (${qty}x)`);
      }
      renderProductsCol('');
      return;
    }

    // Coincidencia exacta única por nombre
    const qLower = query.toLowerCase();
    const varMatches = (MTP.state.variants || []).filter(v => v.active !== false && v.name.toLowerCase().includes(qLower));
    const retMatches = (MTP.state.inventory || []).filter(i => i.sellable && i.name.toLowerCase().includes(qLower));

    if (varMatches.length === 1 && retMatches.length === 0) {
      addVariantQuick(varMatches[0].id, qty);
      MTP.toast(`Agregado: ${varMatches[0].name} (${qty}x)`);
      renderProductsCol('');
    } else if (retMatches.length === 1 && varMatches.length === 0) {
      addRetailQuick(retMatches[0].id, qty);
      MTP.toast(`Agregado: ${retMatches[0].name} (${qty}x)`);
      renderProductsCol('');
    } else {
      renderProductsCol(query);
    }
  }

  function setupEventListeners() {
    const scanInput = document.getElementById('posScannerInput');
    let famKeyTimer = null;

    function switchFamilyByDigit(digit) {
      const list = getFamiliesList();
      if (!list || !list.length) return false;
      const targetFam = list.find(f => String(f.key) === String(digit)) || list[parseInt(digit, 10) - 1];
      if (!targetFam) return false;
      selectedCardIdx = -1;
      setActiveFamily(targetFam.id);
      if (scanInput) scanInput.value = '';
      focusScannerInput(false);
      if (MTP && typeof MTP.toast === 'function') {
        MTP.toast('Familia: ' + targetFam.name);
      }
      return true;
    }

    function cycleFamily(direction) {
      const list = getFilteredFamiliesList();
      if (!list || !list.length) return;
      let idx = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === activeFamilyId) { idx = i; break; }
      }
      if (idx < 0) idx = 0;
      const next = (idx + (direction >= 0 ? 1 : -1) + list.length) % list.length;
      selectedCardIdx = -1;
      setActiveFamily(list[next].id);
      if (scanInput) scanInput.value = '';
      focusScannerInput(false);
    }

    if (scanInput) {
      scanInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          moveCatalogCardSelection(e.key);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = scanInput.value.trim();
          // Un solo dígito (1-9) = cambiar de familia, no es un código de barras
          if (/^[1-9]$/.test(val)) {
            if (famKeyTimer) { clearTimeout(famKeyTimer); famKeyTimer = null; }
            switchFamilyByDigit(val);
            return;
          }
          if (val) {
            const exact = MTP.findByCodeOrBarcode ? MTP.findByCodeOrBarcode(val) : null;
            if (exact) {
              handleCodeOrSearchSubmit(val);
              scanInput.value = '';
              selectedCardIdx = -1;
              renderProductsCol('');
            } else if (activateSelectedCatalogCard()) {
              scanInput.value = '';
              selectedCardIdx = -1;
              renderProductsCol('');
            } else {
              handleCodeOrSearchSubmit(val);
              scanInput.value = '';
            }
          } else if (selectedCardIdx >= 0) {
            activateSelectedCatalogCard();
          }
          focusScannerInput(false);
        } else if (e.key === 'Escape') {
          if (famKeyTimer) { clearTimeout(famKeyTimer); famKeyTimer = null; }
          scanInput.value = '';
          selectedCardIdx = -1;
          renderProductsCol('');
          focusScannerInput(false);
        }
      });

      scanInput.addEventListener('input', function () {
        const val = scanInput.value.trim();

        if (famKeyTimer) { clearTimeout(famKeyTimer); famKeyTimer = null; }

        // Si el usuario teclea '3*', preselecciona el multiplicador 3
        if (/^\d+\*$/.test(val)) {
          const m = parseInt(val, 10);
          if (!isNaN(m) && m > 0) setMultiplier(m);
          scanInput.value = '';
          return;
        }

        // Un dígito solo en el lector: espera 420 ms. Si no llega nada más,
        // era el atajo de familia (el escáner real escribe todo en <50 ms).
        if (/^[1-9]$/.test(val)) {
          famKeyTimer = setTimeout(function () {
            famKeyTimer = null;
            if (scanInput && scanInput.value.trim() === val) {
              switchFamilyByDigit(val);
            }
          }, 420);
        }

        if (!val) selectedCardIdx = -1;
        renderProductsCol(val);
      });
    }

    if (!_posDelegatedAttached) {
      _posDelegatedAttached = true;

      const familiesNav = document.getElementById('posColFamilies');
      if (familiesNav) {
        familiesNav.addEventListener('click', function (e) {
          const secBtn = e.target.closest('.pos-sector-btn[data-sector]');
          if (secBtn) {
            setSectorFilter(secBtn.getAttribute('data-sector'));
            return;
          }
          const famBtn = e.target.closest('.pos-family-nav-btn[data-fam-id]');
          if (famBtn) {
            setActiveFamily(famBtn.getAttribute('data-fam-id'));
          }
        });
      }

      const multGroup = document.getElementById('posMultiplierGroup');
      if (multGroup) {
        multGroup.addEventListener('click', function (e) {
          const btn = e.target.closest('.pos-mult-btn[data-mult]');
          if (btn) setMultiplier(btn.getAttribute('data-mult'));
        });
      }

      const bsBar = document.getElementById('posBestsellersBar');
      if (bsBar) {
        bsBar.addEventListener('click', function (e) {
          const chip = e.target.closest('.pos-chip-btn[data-bs-id]');
          if (!chip) return;
          const kind = chip.getAttribute('data-bs-kind');
          const id = chip.getAttribute('data-bs-id');
          if (kind === 'variant') addVariantQuick(id);
          else addRetailQuick(id);
        });
      }

      const productsContainer = document.getElementById('posProductsContainer');
      if (productsContainer) {
        productsContainer.addEventListener('click', function (e) {
          const editBtn = e.target.closest('[data-action="edit-product"]');
          if (editBtn) {
            e.stopPropagation();
            if (canManageProducts() && window.MTPProductDrawer) {
              window.MTPProductDrawer.open({ mode: 'edit', id: editBtn.getAttribute('data-id') });
            }
            return;
          }
          const stepVarBtn = e.target.closest('[data-action="step-variant"]');
          if (stepVarBtn) {
            e.stopPropagation();
            stepVariantQty(stepVarBtn.getAttribute('data-id'), parseInt(stepVarBtn.getAttribute('data-delta'), 10), e);
            return;
          }
          const stepRetBtn = e.target.closest('[data-action="step-retail"]');
          if (stepRetBtn) {
            e.stopPropagation();
            stepRetailQty(stepRetBtn.getAttribute('data-id'), parseInt(stepRetBtn.getAttribute('data-delta'), 10), e);
            return;
          }
          const modsBtn = e.target.closest('[data-action="mods-ref"]');
          if (modsBtn) {
            e.stopPropagation();
            openModifiersForRef(modsBtn.getAttribute('data-id'));
            return;
          }
          if (e.target.closest('.pos-btn-stepper')) {
            e.stopPropagation();
            return;
          }
          const clearBtn = e.target.closest('[data-action="clear-search"]');
          if (clearBtn) {
            if (scanInput) scanInput.value = '';
            selectedCardIdx = -1;
            renderProductsCol('');
            focusScannerInput(false);
            return;
          }
          const createBtn = e.target.closest('[data-action="create-product"]');
          if (createBtn) {
            if (canManageProducts() && window.MTPProductDrawer) {
              window.MTPProductDrawer.open({ mode: 'create', defaultFamilyId: activeFamilyId });
            }
            return;
          }
          const varCard = e.target.closest('[data-action="add-variant"]');
          if (varCard) {
            addVariantQuick(varCard.getAttribute('data-ref-id'));
            return;
          }
          const retCard = e.target.closest('[data-action="add-retail"]');
          if (retCard) {
            addRetailQuick(retCard.getAttribute('data-ref-id'));
          }
        });
      }

      const modDrawer = document.getElementById('posModifiersDrawer');
      if (modDrawer) {
        modDrawer.addEventListener('click', function (e) {
          if (e.target.closest('[data-action="close-mods"]')) {
            closeModifiersDrawer();
            return;
          }
          const modBtn = e.target.closest('[data-action="toggle-mod"]');
          if (modBtn) {
            toggleModifierOption(
              modBtn.getAttribute('data-cart-id'),
              modBtn.getAttribute('data-group-id'),
              modBtn.getAttribute('data-option-id')
            );
          }
        });
      }

      const ticketList = document.getElementById('posTicketItems');
      if (ticketList) {
        ticketList.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-action][data-cart-id]');
          if (!btn) return;
          const act = btn.getAttribute('data-action');
          const cid = btn.getAttribute('data-cart-id');
          if (act === 'mods') openModifiersDrawer(cid);
          else if (act === 'note') addKitchenNote(cid);
          else if (act === 'replace') startReplaceLine(cid);
          else if (act === 'qty') changeCartQty(cid, parseInt(btn.getAttribute('data-delta'), 10));
          else if (act === 'remove') removeCartLine(cid);
        });
      }

      const replaceBanner = document.getElementById('posReplaceBanner');
      if (replaceBanner) {
        replaceBanner.addEventListener('click', function (e) {
          if (e.target.closest('[data-action="cancel-replace"]')) {
            cancelReplaceMode();
          }
        });
      }

      const heldBar = document.getElementById('heldOrdersBar');
      if (heldBar) {
        heldBar.addEventListener('click', function (e) {
          const pill = e.target.closest('.held-pill[data-hold-id]');
          if (pill) restoreHeldOrder(pill.getAttribute('data-hold-id'));
        });
      }

      const payList = document.getElementById('chkPaymentsList');
      if (payList) {
        payList.addEventListener('click', function (e) {
          const delBtn = e.target.closest('.chk-pay-del[data-pay-id]');
          if (delBtn) removePaymentLine(delBtn.getAttribute('data-pay-id'));
        });
      }

      const ticketsBody = document.getElementById('cajaTodayTicketsBody');
      if (ticketsBody) {
        ticketsBody.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-reprint-sale-id]');
          if (!btn) return;
          const sid = btn.getAttribute('data-reprint-sale-id');
          const sale = ((MTP.state && MTP.state.sales) || []).find(s => String(s.id) === String(sid));
          if (sale) showPrintedTicketsModal(sale);
        });
      }

      if (window.MTPBarcode) {
        window.MTPBarcode.onBarcodeScan(function (code) {
          handleCodeOrSearchSubmit(code);
          focusScannerInput(false);
        });
      }

      document.addEventListener('keydown', function (e) {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

        // F1: Foco al escáner
        if (e.key === 'F1') {
          e.preventDefault();
          if (scanInput) { scanInput.focus(); scanInput.select(); }
          return;
        }

        // F2: Cobrar
        if (e.key === 'F2') {
          e.preventDefault();
          openCheckoutModal();
          return;
        }

        // F3: Poner en espera / restaurar
        if (e.key === 'F3') {
          e.preventDefault();
          holdCurrentCart();
          return;
        }

        // F4: Comanda rápida
        if (e.key === 'F4') {
          e.preventDefault();
          openQuickKitchenTicketPreview();
          return;
        }

        // Alt+[1..9] o Ctrl+[1..9]: cambiar de familia incluso escribiendo en el buscador
        if ((e.altKey || e.ctrlKey) && !e.shiftKey && /^[1-9]$/.test(e.key) &&
            !document.querySelector('.modal-backdrop.open, .apple-sheet-backdrop.open')) {
          if (switchFamilyByDigit(e.key)) {
            e.preventDefault();
            return;
          }
        }

        // PgUp / PgDn: recorrer las familias sin usar el mouse
        if ((e.key === 'PageDown' || e.key === 'PageUp') &&
            !document.querySelector('.modal-backdrop.open, .apple-sheet-backdrop.open')) {
          e.preventDefault();
          cycleFamily(e.key === 'PageDown' ? 1 : -1);
          return;
        }

        // Escape: Cerrar modales, drawer o cancelar reemplazo
        if (e.key === 'Escape') {
          if (activeModifierCartId) { closeModifiersDrawer(); focusScannerInput(false); return; }
          if (replacingCartId) { cancelReplaceMode(); focusScannerInput(false); return; }
          closeAllModals();
          if (scanInput) {
            scanInput.value = '';
            selectedCardIdx = -1;
            renderProductsCol('');
          }
          setTimeout(() => focusScannerInput(false), 30);
          return;
        }

        // Si el modal de cobro está abierto y presionan Enter (soporta 1-click checkout)
        const chkModal = document.getElementById('posCheckoutModal');
        if (chkModal && chkModal.classList.contains('open')) {
          if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
            if (currentPayments.length > 0) {
              const paid = getPaidTotalUsd();
              const tot = computeSaleTotals().totalUsd;
              if (paid + 0.01 >= tot) {
                e.preventDefault();
                finalizeSale();
              }
            } else {
              const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
              const enteredUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
              const enteredBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;
              const effectiveUsd = enteredUsd > 0 ? enteredUsd : (enteredBs > 0 ? (enteredBs / bcv) : 0);
              const previewTot = computeCheckoutDisplayTax().totalUsd;
              if (effectiveUsd > 0 && effectiveUsd + 0.01 >= previewTot) {
                e.preventDefault();
                finalizeSale();
              }
            }
          }
          return;
        }

        // Si el usuario está escribiendo texto en otro campo, no interceptar
        if (isTyping) return;

        // Flechas de teclado y Enter para navegar productos fuera del input
        if (!isOverlayBlockingScanner()) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            moveCatalogCardSelection(e.key);
            return;
          }
          if (e.key === 'Enter' && selectedCardIdx >= 0) {
            e.preventDefault();
            activateSelectedCatalogCard();
            return;
          }
        }

        // Teclas + y - para el último renglón
        if ((e.key === '+' || e.key === '=') && cart.length > 0) {
          e.preventDefault();
          changeCartQty(cart[cart.length - 1].cartId, 1);
          return;
        }
        if (e.key === '-' && cart.length > 0) {
          e.preventDefault();
          changeCartQty(cart[cart.length - 1].cartId, -1);
          return;
        }

        // Teclas numéricas [1] al [9]: Selección directa de Familia Maestra
        if (/^[1-9]$/.test(e.key)) {
          if (switchFamilyByDigit(e.key)) {
            e.preventDefault();
          }
        }
      });
    }
  }

  function closeAllModals() {
    closeModifiersDrawer();
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    if (window.MTPBarcode && window.MTPBarcode.closeCameraScannerModal) {
      window.MTPBarcode.closeCameraScannerModal();
    }
    setTimeout(() => focusScannerInput(false), 30);
  }

  /* ==========================================================================
     SISTEMA VENEZOLANO DE COBRO, PAGO MÓVIL Y CALCULADORA DE VUELTO (100% OPERATIVO)
     ========================================================================== */
  function populatePosTerminals() {
    const sel = document.getElementById('posTerminalSelect');
    if (!sel) return;
    const prevVal = sel.value;
    const terminals = (MTP && MTP.state && Array.isArray(MTP.state.posTerminals))
      ? MTP.state.posTerminals.filter(t => t && t.status !== 'INACTIVO')
      : [];

    if (!terminals.length) {
      sel.innerHTML = '<option value="default" data-liquidation="VES" data-batch="001" data-name="Punto Principal">Punto Principal (Bs)</option>';
    } else {
      sel.innerHTML = terminals.map(t => {
        const liq = String(t.liquidationCurrency || 'VES').toUpperCase() === 'USD' ? 'USD' : 'VES';
        const liqTag = liq === 'USD' ? 'USD -> IGTF 3%' : 'Bs';
        const label = `${t.name || t.bank || t.id} (${liqTag})`;
        return `<option value="${esc(t.id)}" data-liquidation="${esc(liq)}" data-batch="${esc(t.currentBatch || '001')}" data-name="${esc(t.name || t.id)}">${esc(label)}</option>`;
      }).join('');
    }

    if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
      sel.value = prevVal;
    }

    const batchInput = document.getElementById('posBatchInput');
    const selectedOpt = sel.selectedOptions ? sel.selectedOptions[0] : null;
    if (batchInput && selectedOpt && !batchInput.value) {
      batchInput.value = selectedOpt.dataset.batch || '001';
    }
  }

  function buildPreviewPayment(method, amountUsd, amountBs) {
    let liq = '';
    if (method === 'Punto de Venta') {
      const termSel = document.getElementById('posTerminalSelect');
      const opt = termSel && termSel.selectedOptions ? termSel.selectedOptions[0] : null;
      liq = opt ? (opt.dataset.liquidation || 'VES') : 'VES';
    }
    return {
      id: 'p-preview',
      method: method || 'Efectivo USD',
      amountUsd: Number(amountUsd) || 0,
      amountBs: Number(amountBs) || 0,
      liquidationCurrency: liq,
      ref: '',
      verified: false
    };
  }

  function computeCheckoutDisplayTax() {
    if (currentPayments.length > 0) {
      return computeSaleTotals(currentPayments);
    }
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const baseTax = computeSaleTotals([]);
    return computeSaleTotals([buildPreviewPayment(method, baseTax.totalUsd, baseTax.totalBs)]);
  }

  function refreshCheckoutAmountSuggestion(tax) {
    const t = tax || computeCheckoutDisplayTax();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const remUsd = Math.max(0, t.totalUsd - getPaidTotalUsd());
    const payUsdInput = document.getElementById('payAmountUsd');
    const payBsInput = document.getElementById('payAmountBs');
    if (payUsdInput) payUsdInput.value = remUsd > 0.009 ? remUsd.toFixed(2) : '';
    if (payBsInput) payBsInput.value = remUsd > 0.009 ? (remUsd * bcv).toFixed(2) : '';
  }

  function openCheckoutModal() {
    if (!cart.length) {
      MTP.toast('El ticket está vacío. Agrega platos o mercancía antes de cobrar.', 'warn');
      return;
    }

    currentPayments = [];
    changeDistDirty = false;
    resetPagoMovilProof();

    const refInput = document.getElementById('payRefInput');
    if (refInput) refInput.value = '';
    const voucherInput = document.getElementById('posVoucherInput');
    if (voucherInput) voucherInput.value = '';
    const batchInput = document.getElementById('posBatchInput');
    if (batchInput) batchInput.value = '';

    populatePosTerminals();
    selectPayMethod('Efectivo USD');

    const modal = document.getElementById('posCheckoutModal');
    if (modal) modal.classList.add('open');
    const amountInput = document.getElementById('payAmountUsd');
    if (amountInput) amountInput.focus();
  }

  /**
   * Un solo lugar que pinta el total y el desglose fiscal del modal.
   * Evita que el ticket y el modal muestren números distintos.
   */
  function renderCheckoutTotals(tax) {
    const usdEl = document.getElementById('chkTotalUsd');
    const bsEl = document.getElementById('chkTotalBs');
    const sumEl = document.getElementById('chkTaxSummary');
    if (usdEl) usdEl.textContent = MTP.fmtUSD(tax.totalUsd);
    if (bsEl) bsEl.textContent = MTP.fmtBsRaw(tax.totalBs);
    if (sumEl) {
      sumEl.innerHTML =
        `Subtotal <strong>${MTP.fmtUSD(tax.subtotalBaseUsd)}</strong>` +
        ` · Exento <strong>${MTP.fmtUSD(tax.exentoUsd)}</strong>` +
        ` · Base 16% <strong>${MTP.fmtUSD(tax.baseG16Usd)}</strong>` +
        ` · IVA 16% <strong>${MTP.fmtUSD(tax.totalIvaUsd)}</strong>` +
        (tax.igtfUsd > 0 ? ` · IGTF 3% <strong>${MTP.fmtUSD(tax.igtfUsd)}</strong>` : '') +
        (tax.igtfUsd > 0
          ? `<div class="chk-igtf-note">IGTF aplicado: el negocio es Contribuyente Especial y parte del pago es en divisas.</div>`
          : '');
    }
  }

  function selectPayMethod(method) {
    const hidden = document.getElementById('payMethodSelect');
    if (hidden) hidden.value = method;

    document.querySelectorAll('.pay-methods-grid .pay-method-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-method') === method);
    });

    const pmFields = document.getElementById('pagoMovilExtraFields');
    if (pmFields) {
      pmFields.style.display = (method === 'Pago Móvil') ? 'grid' : 'none';
      if (method === 'Pago Móvil') {
        let hintEl = document.getElementById('pmActiveAccountHint');
        if (!hintEl) {
          hintEl = document.createElement('div');
          hintEl.id = 'pmActiveAccountHint';
          hintEl.style.cssText = 'grid-column:1/-1;background:#FFFFFF;border:1px solid #93C5FD;border-radius:7px;padding:6px 10px;font-size:12px;color:#1E3A8A;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap';
          pmFields.insertBefore(hintEl, pmFields.firstChild);
        }
        const accounts = (MTP.state && MTP.state.pagoMovilAccounts) ? MTP.state.pagoMovilAccounts : [];
        const activeAcc = accounts.find(a => a.status === 'ACTIVO') || accounts[0];
        if (activeAcc) {
          hintEl.innerHTML = '<span>📲 <strong>Cuenta receptora:</strong> ' + esc(activeAcc.bank) + ' · Tel <strong>' + esc(activeAcc.phone) + '</strong> · ' + esc(activeAcc.rif || '') + '</span><span style="font-size:12px;color:#1D4ED8;font-weight:700">Verificación anti-duplicado local</span>';
        } else {
          hintEl.innerHTML = '<span>📲 Configura tu cuenta Pago Móvil receptora en <strong>Ajustes</strong> para verla aquí.</span>';
        }
      }
    }

    const puntoFields = document.getElementById('puntoExtraFields');
    if (puntoFields) {
      puntoFields.style.display = (method === 'Punto de Venta') ? 'grid' : 'none';
      if (method === 'Punto de Venta') {
        populatePosTerminals();
      }
    }

    const refInput = document.getElementById('payRefInput');
    if (refInput) {
      refInput.placeholder = (method === 'Pago Móvil')
        ? 'Ref (últimos 4-6 dígitos)'
        : (method === 'Punto de Venta' ? 'Nº Aprobación / Voucher' : 'Referencia o nota opcional');
    }

    const previewTax = computeCheckoutDisplayTax();
    refreshCheckoutAmountSuggestion(previewTax);
    resetPagoMovilProof();
    renderPaymentsAndChange();
  }

  function onTerminalChange() {
    const termSel = document.getElementById('posTerminalSelect');
    const opt = termSel && termSel.selectedOptions ? termSel.selectedOptions[0] : null;
    const batchInput = document.getElementById('posBatchInput');
    if (batchInput && opt && opt.dataset.batch) {
      batchInput.value = opt.dataset.batch;
    }
    const previewTax = computeCheckoutDisplayTax();
    refreshCheckoutAmountSuggestion(previewTax);
    renderPaymentsAndChange();
  }

  /**
   * Botón de billete: SUMA, no reemplaza.
   * Cada pulsación agrega una línea de pago etiquetada con el billete,
   * de modo que el cajero puede dar $20 y después $5 sin que se pierda nada.
   */
  function quickAddBillUsd(val) {
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const rate = getActiveChangeRate();

    if (val === 'EXACT') {
      const targetTotal = currentPayments.length > 0
        ? computeSaleTotals().totalUsd
        : computeCheckoutDisplayTax().totalUsd;
      const pending = Math.max(0, targetTotal - getPaidTotalUsd());
      if (pending <= 0.009) {
        MTP.toast('La cuenta ya está cobrada por completo.', 'warn');
        return;
      }
      addPaymentLine({ method, amountUsd: pending, amountBs: pending * rate, bill: 'Exacto' });
      return;
    }

    const amount = Number(val) || 0;
    if (amount <= 0) return;
    addPaymentLine({ method, amountUsd: amount, amountBs: amount * rate, bill: '$' + amount });
  }

  function syncPayInputsFromUsd(val) {
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const usd = parseFloat(val) || 0;
    const inputBs = document.getElementById('payAmountBs');
    if (inputBs) inputBs.value = (usd * bcv).toFixed(2);
    renderPaymentsAndChange();
  }

  function syncPayInputsFromBs(val) {
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const bs = parseFloat(val) || 0;
    const inputUsd = document.getElementById('payAmountUsd');
    if (inputUsd) inputUsd.value = (bs / bcv).toFixed(2);
    renderPaymentsAndChange();
  }

  function checkPagoMovilRefLive(rawRef) {
    const badge = document.getElementById('pmRefVerifyBadge');
    if (!badge) return;
    const ref = String(rawRef || '').trim();
    if (ref.length < 4) {
      badge.className = 'badge badge-yellow';
      badge.textContent = '⏳ Mín 4 dígitos';
      return;
    }
    const isUsed = MTP.isPagoMovilRefUsed ? MTP.isPagoMovilRefUsed(ref) : false;
    if (isUsed) {
      badge.className = 'badge badge-red';
      badge.textContent = '⚠ Ref ya registrada hoy';
    } else {
      badge.className = 'badge badge-green';
      badge.textContent = '✓ Ref válida';
    }
  }

  /* ==========================================================================
     VERIFICACIÓN REAL DE PAGO MÓVIL CON EL SMS DEL BANCO
     No existe una API pública de los bancos venezolanos para consultar un
     pago. La prueba que SÍ vale es el mensaje que el banco emite cuando el
     dinero entra: aquí se pega (o llega desde el teléfono del dueño), se
     compara monto/referencia y queda guardado como comprobante de la venta.
     ========================================================================== */
  function simpleTextHash(text) {
    const s = String(text || '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    }
    return 'bp' + h.toString(36);
  }

  function isBankProofTextUsed(hash) {
    if (!hash) return false;
    const sales = (MTP.state && Array.isArray(MTP.state.sales)) ? MTP.state.sales : [];
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      if (!sale || sale.voided) continue;
      const pays = Array.isArray(sale.payments) ? sale.payments : [];
      for (let j = 0; j < pays.length; j++) {
        if (pays[j] && pays[j].bankProof && pays[j].bankProof.textHash === hash) return true;
      }
    }
    return false;
  }

  function setPmProofBadge(kind, text) {
    const badge = document.getElementById('pmBankProofBadge');
    if (!badge) return;
    badge.className = 'badge ' + (kind === 'ok' ? 'badge-green' : kind === 'err' ? 'badge-red' : 'badge-yellow');
    badge.textContent = text;
  }

  function resetPagoMovilProof() {
    pmBankProof = null;
    const input = document.getElementById('pmBankSmsInput');
    if (input) input.value = '';
    setPmProofBadge('idle', 'Sin comprobante');
  }

  function verifyPagoMovilSms() {
    const input = document.getElementById('pmBankSmsInput');
    const raw = input ? input.value.trim() : '';
    if (!raw) {
      MTP.toast('Pega primero el mensaje que te envió el banco.', 'warn');
      if (input) input.focus();
      return false;
    }

    const parsed = MTP.parsePagoMovilSms ? MTP.parsePagoMovilSms(raw) : null;
    if (!parsed) {
      setPmProofBadge('err', 'Mensaje no reconocido');
      MTP.toast('No pude leer ese mensaje. Copia el texto completo del SMS del banco.', 'warn');
      return false;
    }

    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const inputUsd = parseFloat((document.getElementById('payAmountUsd') || {}).value) || 0;
    const inputBs = parseFloat((document.getElementById('payAmountBs') || {}).value) || 0;
    const totalPreview = computeCheckoutDisplayTax();
    const expectedBs = inputBs > 0 ? inputBs : (inputUsd > 0 ? inputUsd * bcv : Number(totalPreview.totalBs) || 0);
    const bankBs = Number(parsed.amountBs) || 0;
    const tolerance = Math.max(1, expectedBs * 0.005);

    if (!bankBs) {
      setPmProofBadge('err', 'SMS sin monto legible');
      MTP.toast('El mensaje no trae un monto en Bs que pueda comparar.', 'warn');
      return false;
    }

    const textHash = simpleTextHash(raw);
    if (isBankProofTextUsed(textHash)) {
      setPmProofBadge('err', '⚠ Ese SMS ya fue usado');
      MTP.toast('Este mismo mensaje del banco ya se registró en otra venta.', 'err');
      return false;
    }

    const diff = Math.abs(bankBs - expectedBs);
    if (expectedBs > 0 && diff > tolerance) {
      pmBankProof = null;
      setPmProofBadge('err', 'Monto no coincide (banco Bs ' + bankBs.toFixed(2) + ')');
      MTP.toast('El banco reporta Bs ' + bankBs.toFixed(2) + ' y el cobro es Bs ' + expectedBs.toFixed(2) + '. Revisa antes de cobrar.', 'err');
      return false;
    }

    if (parsed.reference && MTP.isPagoMovilRefUsed && MTP.isPagoMovilRefUsed(parsed.reference)) {
      pmBankProof = null;
      setPmProofBadge('err', '⚠ Referencia ya cobrada');
      MTP.toast('La referencia ' + parsed.reference + ' ya aparece en otra venta.', 'err');
      return false;
    }

    pmBankProof = {
      status: 'MATCH',
      reference: parsed.reference || '',
      amountBs: Number(bankBs.toFixed(2)),
      expectedBs: Number(expectedBs.toFixed(2)),
      phone: parsed.phone || '',
      bank: parsed.bank || '',
      textHash: textHash,
      verifiedAt: new Date().toISOString(),
      raw: raw.slice(0, 240)
    };

    const refInput = document.getElementById('payRefInput');
    if (refInput && parsed.reference && !refInput.value.trim()) {
      refInput.value = parsed.reference;
      checkPagoMovilRefLive(parsed.reference);
    }

    setPmProofBadge('ok', '✅ Banco confirma Bs ' + bankBs.toFixed(2) + (parsed.reference ? ' · Ref ' + parsed.reference : ''));
    MTP.toast('Pago verificado con el mensaje del banco.', 'ok');
    return true;
  }

  /**
   * Fuente ÚNICA de líneas de pago. Todo (billete, pago móvil, tarjeta,
   * efectivo) entra por aquí para que el total, el vuelto y el registro
   *receban exactamente la misma información.
   */
  function addPaymentLine(opts) {
    opts = opts || {};
    const method = opts.method || 'Efectivo USD';
    const amountUsd = Number(opts.amountUsd) || 0;
    const amountBs = Number(opts.amountBs) || 0;

    if (amountUsd <= 0 && amountBs <= 0) {
      MTP.toast('Ingresa un monto válido a registrar', 'warn');
      return false;
    }

    const refInput = document.getElementById('payRefInput');
    const voucherInput = document.getElementById('posVoucherInput');
    const batchInput = document.getElementById('posBatchInput');
    const typedRef = refInput ? refInput.value.trim() : '';
    const optsRef = opts.ref !== undefined && opts.ref !== null ? String(opts.ref).trim() : '';
    const voucherVal = (method === 'Punto de Venta' && voucherInput) ? voucherInput.value.trim() : '';
    const batchVal = (method === 'Punto de Venta' && batchInput) ? batchInput.value.trim() : '';
    const rawRef = typedRef || optsRef || voucherVal;

    if (method === 'Pago Móvil') {
      if (!rawRef || rawRef.length < 4) {
        MTP.toast('Ingresa los últimos 4 a 6 dígitos de referencia del Pago Móvil.', 'warn');
        if (refInput) refInput.focus();
        return false;
      }
      if (MTP.isPagoMovilRefUsed && MTP.isPagoMovilRefUsed(rawRef)) {
        MTP.toast('Esta referencia de Pago Móvil ya fue usada hoy.', 'err');
        if (refInput) refInput.focus();
        return false;
      }
    }

    const terminalSel = document.getElementById('posTerminalSelect');
    const liqOption = terminalSel && terminalSel.selectedOptions ? terminalSel.selectedOptions[0] : null;
    const pmAccounts = (MTP.state && Array.isArray(MTP.state.pagoMovilAccounts)) ? MTP.state.pagoMovilAccounts : [];
    const activePmAcc = pmAccounts.find(a => a.status === 'ACTIVO') || pmAccounts[0] || null;
    const isPmMethod = method === 'Pago Móvil';
    const proof = (isPmMethod && pmBankProof && pmBankProof.status === 'MATCH') ? pmBankProof : null;
    const pmVerified = isPmMethod ? (opts.verified === true || !!proof) : true;
    const pmStatus = isPmMethod ? (opts.verifyStatus || (pmVerified ? 'CONCILIADO' : 'PENDIENTE')) : 'CONCILIADO';

    currentPayments.push({
      id: 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      method: method,
      amountUsd: Number(amountUsd.toFixed(2)),
      amountBs: Number(amountBs.toFixed(2)),
      rateUsed: Number(getActiveChangeRate().toFixed(4)),
      ref: rawRef,
      bill: opts.bill || '',
      bank: isPmMethod ? (document.getElementById('pmBankSelect')?.value || '') : '',
      phone: isPmMethod ? (document.getElementById('pmPhoneInput')?.value || '') : '',
      destAccountId: isPmMethod && activePmAcc ? activePmAcc.id : '',
      destAccountName: isPmMethod && activePmAcc ? activePmAcc.name : '',
      terminalId: method === 'Punto de Venta' ? (terminalSel?.value || '') : '',
      terminalName: method === 'Punto de Venta' && liqOption ? (liqOption.dataset.name || liqOption.textContent || '') : '',
      voucher: voucherVal,
      batchNumber: batchVal,
      lote: batchVal,
      liquidationCurrency: method === 'Punto de Venta'
        ? (liqOption ? (liqOption.dataset.liquidation || 'VES') : 'VES')
        : '',
      verifyStatus: pmStatus,
      verified: pmVerified,
      bankProof: proof || null
    });

    changeDistDirty = false;
    resetPagoMovilProof();
    if (refInput) refInput.value = '';
    if (voucherInput) voucherInput.value = '';
    const postTax = computeSaleTotals(currentPayments);
    refreshCheckoutAmountSuggestion(postTax);
    renderPaymentsAndChange();
    return true;
  }

  function addCurrentPaymentLine() {
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const rawUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
    const rawBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;
    const amountUsd = rawUsd > 0 ? rawUsd : (rawBs > 0 ? Number((rawBs / bcv).toFixed(2)) : 0);
    const amountBs = rawBs > 0 ? rawBs : (amountUsd > 0 ? Number((amountUsd * bcv).toFixed(2)) : 0);
    return addPaymentLine({ method, amountUsd, amountBs });
  }

  function removePaymentLine(payId) {
    currentPayments = currentPayments.filter(p => p.id !== payId);
    changeDistDirty = false;
    refreshCheckoutAmountSuggestion();
    renderPaymentsAndChange();
  }

  function getPaidTotalUsd() {
    return currentPayments.reduce((acc, p) => acc + p.amountUsd, 0);
  }

  /**
   * Propone cómo entregar el vuelto con DENOMINACIONES REALES:
   * billetes US$ enteros + resto en Bolívares redondeado a monedas de 0,50.
   */
  function suggestChangeBreakdown(changeUsd) {
    const rate = getActiveChangeRate();
    if (window.MTPChange && window.MTPChange.breakDown) {
      return window.MTPChange.breakDown(changeUsd, rate, BS_CHANGE_STEP);
    }
    const usd = Math.max(0, Number(changeUsd) || 0);
    const wholeUsd = Math.floor(usd + 0.001);
    let remBs = (usd - wholeUsd) * rate;
    remBs = Math.round(remBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;
    const bills = [];
    let rest = wholeUsd;
    [100, 50, 20, 10, 5, 2, 1].forEach(d => {
      const n = Math.floor(rest / d);
      if (n > 0) { bills.push({ denom: d, count: n, amount: n * d }); rest -= n * d; }
    });
    let text = bills.map(b => '$' + b.amount).join(' + ');
    if (remBs > 0) text = text ? (text + ' + Bs ' + remBs.toFixed(2)) : ('Bs ' + remBs.toFixed(2));
    return { usd: wholeUsd, bs: Number(remBs.toFixed(2)), bills: bills, text: text || 'Sin vuelto' };
  }

  /**
   * Verifica que la distribución del vuelto entregado sea igual al vuelto
   * debido. Si no cuadra, se avisa y se BLOQUEA el cobro.
   * @returns {boolean} true si cuadra
   */
  function renderVueltoValidation() {
    const tax = computeCheckoutDisplayTax();
    renderCheckoutTotals(tax);
    const paidUsd = getPaidTotalUsd();
    const changeDueUsd = Math.max(0, paidUsd - tax.totalUsd);
    const rate = getActiveChangeRate();
    const chg = getChangeDistributionInputs();
    const hasNeg = chg.usdCash < 0 || chg.bsCash < 0 || chg.bsPm < 0;
    const deliveredUsd = Math.max(0, chg.usdCash) + (Math.max(0, chg.bsCash) / rate) + (Math.max(0, chg.bsPm) / rate);
    const diff = Math.abs(deliveredUsd - changeDueUsd);
    const tolUsd = Math.max(0.015, (BS_CHANGE_STEP * 0.51) / rate);
    const ok = !hasNeg && (changeDueUsd <= 0.009 || diff <= tolUsd);

    const el = document.getElementById('vueltoValidation');
    if (el) {
      el.textContent = ok
        ? '✔ El vuelto cuadra'
        : `⚠ El vuelto no cuadra: entregaste ${MTP.fmtUSD(deliveredUsd)} y debes entregar ${MTP.fmtUSD(changeDueUsd)}`;
      el.className = ok ? 'chk-ok' : 'chk-error';
    }
    const btn = document.getElementById('btnConfirmSale');
    if (btn) btn.disabled = !ok;
    return ok;
  }

  function renderPaymentsAndChange() {
    const tax = computeCheckoutDisplayTax();
    const totalUsd = tax.totalUsd;
    const paidUsd = getPaidTotalUsd();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const chgRate = getActiveChangeRate();

    renderCheckoutTotals(tax);

    // Lista de pagos sumados
    const listEl = document.getElementById('chkPaymentsList');
    if (listEl) {
      if (!currentPayments.length) {
        listEl.innerHTML = `<div class="chk-empty">Toca un billete ($5, $10, $20, $50) o suma un método de pago.</div>`;
      } else {
        listEl.innerHTML = currentPayments.map(p => {
          const subDetails = [p.ref ? ('Ref: ' + p.ref) : '', p.terminalName || ''].filter(Boolean).join(' · ');
          return `
            <div class="chk-pay-row">
              <div class="chk-pay-name">
                <strong>${esc(p.method)}${p.bill ? ' · ' + esc(p.bill) : ''}</strong>
                ${subDetails ? `<span class="chk-pay-ref">${esc(subDetails)}</span>` : ''}
              </div>
              <div class="chk-pay-amount">
                <strong>${MTP.fmtUSD(p.amountUsd)}</strong>
                <span>${Number(p.amountBs || 0).toFixed(2)} Bs</span>
                <button type="button" class="chk-pay-del" title="Quitar este pago" data-pay-id="${esc(p.id)}">✕</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const remUsd = Math.max(0, totalUsd - paidUsd);
    const payUsdInput = document.getElementById('payAmountUsd');
    const payBsInput = document.getElementById('payAmountBs');
    // NO se sobrescribe lo que el cajero escribió: solo se rellena si está vacío.
    if (payUsdInput && !payUsdInput.value && remUsd > 0.009) {
      payUsdInput.value = remUsd.toFixed(2);
      if (payBsInput && !payBsInput.value) payBsInput.value = (remUsd * bcv).toFixed(2);
    }

    const diffUsd = paidUsd - totalUsd;
    const statusLabel = document.getElementById('vueltoStatusLabel');
    const chgUsdEl = document.getElementById('vueltoUsdAmount');
    const chgBsEl = document.getElementById('vueltoBsAmount');
    const cardUsd = document.getElementById('vueltoCardUsd');
    const cardBs = document.getElementById('vueltoCardBs');
    const distUsd = document.getElementById('vueltoDistUsd');
    const distBsCash = document.getElementById('vueltoDistBsCash');
    const distBsPm = document.getElementById('vueltoDistBsPm');

    if (diffUsd < -0.009) {
      const faltaUsd = Math.abs(diffUsd);
      if (statusLabel) statusLabel.textContent = '⏳ FALTA POR COBRAR:';
      if (chgUsdEl) chgUsdEl.textContent = MTP.fmtUSD(faltaUsd);
      if (chgBsEl) chgBsEl.textContent = MTP.fmtBsRaw(faltaUsd * bcv);
      if (cardUsd) cardUsd.classList.add('faltante');
      if (cardBs) cardBs.classList.add('faltante');
      if (!changeDistDirty && distUsd && distBsCash && distBsPm) {
        distUsd.value = '0';
        distBsCash.value = '0.00';
        distBsPm.value = '0.00';
      }
    } else if (diffUsd > 0.009) {
      const vueltoUsd = diffUsd;
      const vueltoBs = vueltoUsd * chgRate;
      if (statusLabel) statusLabel.textContent = '✅ VUELTO A ENTREGAR AL CLIENTE:';
      if (chgUsdEl) chgUsdEl.textContent = MTP.fmtUSD(vueltoUsd);
      if (chgBsEl) chgBsEl.textContent = MTP.fmtBsRaw(vueltoBs);
      if (cardUsd) cardUsd.classList.remove('faltante');
      if (cardBs) cardBs.classList.remove('faltante');

      // Distribución por defecto venezolana: billetes US$ reales + resto en Bs (0,50)
      const suggestion = suggestChangeBreakdown(vueltoUsd);
      if (!changeDistDirty && distUsd && distBsCash && distBsPm) {
        distUsd.value = String(suggestion.usd);
        const bsVal = suggestion.bs.toFixed(2);
        if (changeRemainderMode === 'BS_CASH') {
          distBsCash.value = bsVal;
          distBsPm.value = '0.00';
        } else {
          distBsPm.value = bsVal;
          distBsCash.value = '0.00';
        }
      }
      const hintEl = document.getElementById('vueltoSuggestion');
      if (hintEl) hintEl.textContent = suggestion.text;
    } else {
      if (statusLabel) statusLabel.textContent = '✅ PAGO EXACTO (SIN VUELTO):';
      if (chgUsdEl) chgUsdEl.textContent = MTP.fmtUSD(0);
      if (chgBsEl) chgBsEl.textContent = MTP.fmtBsRaw(0);
      if (cardUsd) cardUsd.classList.remove('faltante');
      if (cardBs) cardBs.classList.remove('faltante');
      if (!changeDistDirty && distUsd && distBsCash && distBsPm) {
        distUsd.value = '0';
        distBsCash.value = '0.00';
        distBsPm.value = '0.00';
      }
      const hintEl = document.getElementById('vueltoSuggestion');
      if (hintEl) hintEl.textContent = 'Sin vuelto';
    }

    renderVueltoValidation();
  }

  function rebalanceChangeDistribution(mode) {
    changeDistDirty = true;
    const totalUsd = computeCheckoutDisplayTax().totalUsd;
    const paidUsd = getPaidTotalUsd();
    const rate = getActiveChangeRate();
    const totalChangeUsd = Math.max(0, paidUsd - totalUsd);
    const distUsdEl = document.getElementById('vueltoDistUsd');
    const distBsCashEl = document.getElementById('vueltoDistBsCash');
    const distBsPmEl = document.getElementById('vueltoDistBsPm');
    if (!distUsdEl || !distBsCashEl || !distBsPmEl) return;

    const suggestion = suggestChangeBreakdown(totalChangeUsd);

    if (mode === 'ALL_USD') {
      distUsdEl.value = String(suggestion.usd);
      distBsCashEl.value = '0.00';
      distBsPmEl.value = suggestion.bs.toFixed(2);
    } else if (mode === 'ALL_BS') {
      const fullBs = Math.round((totalChangeUsd * rate) / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      distUsdEl.value = '0';
      distBsCashEl.value = fullBs.toFixed(2);
      distBsPmEl.value = '0.00';
    } else if (mode === 'ALL_PM') {
      const fullBs = Math.round((totalChangeUsd * rate) / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      distUsdEl.value = '0';
      distBsCashEl.value = '0.00';
      distBsPmEl.value = fullBs.toFixed(2);
    } else if (mode === 'USD') {
      // El cajero fijó el efectivo en US$: el resto se calcula en Bs.
      const usdGiven = Math.min(totalChangeUsd, Math.max(0, parseFloat(distUsdEl.value) || 0));
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * rate);
      const remRound = Math.round(remBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      if (changeRemainderMode === 'BS_CASH') {
        distBsCashEl.value = remRound.toFixed(2);
        distBsPmEl.value = '0.00';
      } else {
        distBsPmEl.value = remRound.toFixed(2);
        distBsCashEl.value = '0.00';
      }
    } else if (mode === 'BS_CASH') {
      // El cajero fijó el efectivo en Bs: reparte el resto en billetes US$ + Pago Móvil Bs (sin perder fracción).
      const bsGiven = Math.max(0, parseFloat(distBsCashEl.value) || 0);
      const remUsd = Math.max(0, totalChangeUsd - (bsGiven / rate));
      const wholeUsd = Math.floor(remUsd + 0.001);
      const remFracBs = Math.max(0, (remUsd - wholeUsd) * rate);
      const remFracRound = Math.round(remFracBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      distUsdEl.value = String(wholeUsd);
      distBsPmEl.value = remFracRound.toFixed(2);
    } else if (mode === 'BS_PM') {
      // El cajero fijó Pago Móvil en Bs: reparte el resto en billetes US$ + Efectivo Bs (sin perder fracción).
      const pmGiven = Math.max(0, parseFloat(distBsPmEl.value) || 0);
      const remUsd = Math.max(0, totalChangeUsd - (pmGiven / rate));
      const wholeUsd = Math.floor(remUsd + 0.001);
      const remFracBs = Math.max(0, (remUsd - wholeUsd) * rate);
      const remFracRound = Math.round(remFracBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      distUsdEl.value = String(wholeUsd);
      distBsCashEl.value = remFracRound.toFixed(2);
    }
    renderVueltoValidation();
  }

  function finalizeSale() {
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const chgRate = getActiveChangeRate();

    // 1) Si el cajero no sumó pagos a la lista, se toma el método y el monto
    //    que escribió en los campos (el importe exacto, no el saldo pendiente).
    if (!currentPayments.length) {
      const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
      const enteredUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
      const enteredBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;
      const previewTot = computeCheckoutDisplayTax().totalUsd;
      const amountUsd = enteredUsd > 0
        ? enteredUsd
        : (enteredBs > 0 ? Number((enteredBs / bcv).toFixed(2)) : previewTot);
      const amountBs = enteredBs > 0
        ? enteredBs
        : Number((amountUsd * bcv).toFixed(2));
      const ok = addPaymentLine({
        method,
        amountUsd,
        amountBs,
        ref: document.getElementById('payRefInput')?.value.trim() || ''
      });
      if (!ok) return;
    }

    // 2) TOTAL ÚNICO: el mismo número que se le mostró al cajero al abrir
    //    el modal es el que se valida, el que genera el vuelto y el que se
    //    guarda en la venta.
    const tax = computeSaleTotals();
    const totalUsd = tax.totalUsd;
    const totalBs = tax.totalBs;

    const paidUsd = getPaidTotalUsd();
    if (paidUsd + 0.009 < totalUsd) {
      MTP.toast(`Falta cobrar ${MTP.fmtUSD(totalUsd - paidUsd)} (${((totalUsd - paidUsd) * bcv).toFixed(2)} Bs)`, 'err');
      return;
    }

    // 3) Validación dura de la distribución del vuelto: si no cuadra, no se cobra.
    if (!renderVueltoValidation()) {
      MTP.toast('Revisa la distribución del vuelto antes de cobrar.', 'err');
      return;
    }

    const changeUsd = Math.max(0, paidUsd - totalUsd);
    const changeBs = changeUsd * chgRate;
    const chg = getChangeDistributionInputs();

    const customerInput = document.getElementById('posCustomerInput');
    const customer = (customerInput && customerInput.value.trim()) || 'Mostrador Rápido';

    const activeUser = window.MTPAuth && window.MTPAuth.getCurrentUser ? window.MTPAuth.getCurrentUser() : null;
    const cashierName = activeUser ? (activeUser.name || activeUser.username || 'Caja Turno') : 'Caja Turno';
    const recorded = MTP.recordSale({
      customer,
      orderMode: activeOrderMode,
      cashier: cashierName,
      subtotalUsd: tax.subtotalBaseUsd,
      exentoUsd: tax.exentoUsd,
      baseG16Usd: tax.baseG16Usd,
      ivaUsd: tax.totalIvaUsd,
      ivaBs: tax.totalIvaBs,
      igtfUsd: tax.igtfUsd,
      igtfBs: tax.igtfBs,
      totalUsd,
      totalBs,
      items: cart.map(c => ({
        refId: c.refId,
        variantId: c.variantId || c.refId,
        productId: c.productId,
        code: c.code,
        name: c.name,
        qty: c.qty,
        unit: c.unit,
        priceUsd: c.priceUsd,
        subtotalUsd: Number((c.qty * c.priceUsd).toFixed(2)),
        isDish: c.isDish,
        isVariant: c.isVariant,
        selectedModifiers: c.selectedModifiers || [],
        note: c.note || ''
      })),
      payments: currentPayments,
      changeGiven: {
        totalChangeUsd: Number(changeUsd.toFixed(2)),
        totalChangeBs: Number(changeBs.toFixed(2)),
        rateUsed: chgRate,
        usdCashGiven: Number(chg.usdCash.toFixed(2)),
        bsCashGiven: Number(chg.bsCash.toFixed(2)),
        bsPmGiven: Number(chg.bsPm.toFixed(2)),
        breakdown: `US$ ${chg.usdCash.toFixed(2)} + Bs ${chg.bsCash.toFixed(2)} efectivo + Bs ${chg.bsPm.toFixed(2)} pago móvil`
      }
    });

    document.getElementById('posCheckoutModal').classList.remove('open');
    cart = [];
    replacingCartId = null;
    closeModifiersDrawer();
    cancelReplaceMode();
    if (customerInput) customerInput.value = '';

    renderTicket();
    renderProductsCol();
    renderShortcutsAndHeldBar();

    MTP.toast(`¡Orden #${recorded.orderNumber} registrada con éxito!`);
    showPrintedTicketsModal(recorded);
  }

  function openQuickKitchenTicketPreview() {
    if (!cart.length) {
      MTP.toast('El ticket está vacío', 'warn');
      return;
    }
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    // Se usa el total ÚNICO para que la vista previa muestre los mismos
    // números (exento, base 16%, IVA) que se cobrarán y no $0.00.
    const tax = computeSaleTotals();
    const totalUsd = tax.totalUsd;
    const totalBs = tax.totalBs;
    const customerInput = document.getElementById('posCustomerInput');
    const previewOrder = {
      orderNumber: MTP.state.settings.nextOrderNumber,
      createdAt: new Date().toISOString(),
      customer: (customerInput && customerInput.value.trim()) || 'Orden / Cotización',
      orderMode: activeOrderMode,
      rateBcv: bcv,
      subtotalUsd: tax.subtotalBaseUsd,
      exentoUsd: tax.exentoUsd,
      baseG16Usd: tax.baseG16Usd,
      ivaUsd: tax.totalIvaUsd,
      ivaBs: tax.totalIvaBs,
      igtfUsd: tax.igtfUsd,
      igtfBs: tax.igtfBs,
      totalUsd,
      totalBs,
      items: cart.map(c => ({
        code: c.code,
        name: c.name,
        qty: c.qty,
        unit: c.unit,
        priceUsd: c.priceUsd,
        subtotalUsd: c.qty * c.priceUsd,
        isDish: c.isDish,
        selectedModifiers: c.selectedModifiers || [],
        note: c.note
      })),
      payments: currentPayments.length ? currentPayments
        : [{ method: 'Por Cobrar', amountUsd: totalUsd, amountBs: totalBs }],
      changeGiven: { totalChangeUsd: 0, totalChangeBs: 0, breakdown: '—' }
    };
    showPrintedTicketsModal(previewOrder);
  }

  function showPrintedTicketsModal(sale) {
    const modal = document.getElementById('posTicketPrintModal');
    const content = document.getElementById('printModalContent');
    if (!modal || !content || !sale) return;

    const dishesOnly = (sale.items || []).filter(i => i.isDish);
    const hasDishes = dishesOnly.length > 0;
    const dateStr = new Date(sale.createdAt || Date.now()).toLocaleString('es-VE');
    const fd = sale.fiscalData || {};
    const activeUser = window.MTPAuth && window.MTPAuth.getCurrentUser ? window.MTPAuth.getCurrentUser() : null;
    const cashierName = sale.cashier || (activeUser && (activeUser.name || activeUser.username)) || 'Caja Turno';

    const kitchenHtml = dishesOnly.map(d => {
      const modStr = (d.selectedModifiers && d.selectedModifiers.length)
        ? ` (${d.selectedModifiers.map(m => m.name).join(', ')})`
        : '';
      return `
        <div style="padding:4px 0;border-bottom:1px dashed #000">
          <div style="font-size:13.5px;font-weight:900">${d.qty}x [#${esc(d.code)}] ${esc(d.name)}${esc(modStr)}</div>
          ${d.note ? `<div style="font-size:11px;font-weight:bold;background:#000;color:#fff;padding:1px 4px;margin-top:2px;display:inline-block">NOTA: ${esc(d.note)}</div>` : ''}
        </div>
      `;
    }).join('');

    const itemsHtml = (sale.items || []).map(i => {
      const modStr = (i.selectedModifiers && i.selectedModifiers.length)
        ? ` [${i.selectedModifiers.map(m => m.name).join(', ')}]`
        : '';
      return `
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11.5px">
          <span>${i.qty}x ${esc(i.name)}${esc(modStr)}</span>
          <span style="font-family:monospace;font-weight:bold">${MTP.fmtUSD(i.subtotalUsd)}</span>
        </div>
      `;
    }).join('');

    // Detalle de pagos (imprescindible para el cuadre del día y para evidenciar la base del IGTF).
    const paymentsHtml = (sale.payments || []).map(p => {
      let label = p.method || '';
      if (p.bill) label += ` (${p.bill})`;
      if (p.bank) label += ` ${p.bank}`;
      if (p.terminalName) label += ` [${p.terminalName}]`;
      if (p.ref && p.ref !== 'Directo' && p.ref !== 'Pago Directo') label += ` Ref ${p.ref}`;
      return `
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span>${esc(label)}</span>
          <span style="font-family:monospace">${MTP.fmtUSD(p.amountUsd)}</span>
        </div>`;
    }).join('');

    const exentoVal = (sale.exentoUsd !== undefined && sale.exentoUsd !== null)
      ? Number(sale.exentoUsd)
      : (fd.taxExemptUsd !== undefined && fd.taxExemptUsd !== null ? Number(fd.taxExemptUsd) : 0);
    const baseG16Val = (sale.baseG16Usd !== undefined && sale.baseG16Usd !== null)
      ? Number(sale.baseG16Usd)
      : (fd.taxableBaseUsd !== undefined && fd.taxableBaseUsd !== null ? Number(fd.taxableBaseUsd) : 0);
    const ivaUsdVal = (sale.ivaUsd !== undefined && sale.ivaUsd !== null)
      ? Number(sale.ivaUsd)
      : (fd.ivaUsd !== undefined && fd.ivaUsd !== null ? Number(fd.ivaUsd) : 0);
    const ivaBsVal = (sale.ivaBs !== undefined && sale.ivaBs !== null)
      ? Number(sale.ivaBs)
      : (ivaUsdVal * (Number(sale.rateBcv) || 42.85));

    // Rótulo fiscal DINÁMICO según el estado real de la máquina
    const fiscalLabel = fd.isFiscalValid
      ? 'COMPROBANTE FISCAL HOMOLOGADO'
      : 'NOTA DE ENTREGA · CONTROL INTERNO · NO ES FACTURA FISCAL';

    const modeLabel = sale.orderMode === 'delivery'
      ? '🛵 DELIVERY'
      : (sale.orderMode === 'para_llevar' ? '🛍️ PARA LLEVAR' : '🍽️ COMER AQUÍ');

    const widthCls = (MTP.state && MTP.state.settings && MTP.state.settings.fiscalConfig && MTP.state.settings.fiscalConfig.thermalWidth === '58mm') ? ' width-58mm' : '';

    // La comanda de cocina SOLO se imprime si la venta tiene platos.
    const kitchenTicket = hasDishes ? `
        <div class="thermal-ticket${widthCls}">
          <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px">
            <h4 style="margin:0;font-size:15px;font-weight:900">🍳 COMANDA DE COCINA</h4>
            <div style="font-size:13px;font-weight:bold;margin-top:2px">ORDEN #${esc(sale.orderNumber)}</div>
            <div style="font-size:12px;font-weight:900;border:2px solid #000;padding:2px 4px;margin:4px 0">${modeLabel}</div>
            <div style="font-size:11px">${esc(dateStr)}</div>
            <div style="font-size:12px;font-weight:bold;margin-top:3px;background:#000;color:#fff;padding:2px">CLIENTE: ${esc(sale.customer)}</div>
          </div>
          <div>${kitchenHtml}</div>
          <div style="text-align:center;font-size:10.5px;margin-top:8px;font-weight:bold">*** DESPACHAR CALIENTE ***</div>
        </div>
    ` : '';

    content.innerHTML = `
      <div class="print-root">
        ${kitchenTicket}
        <div class="thermal-ticket${widthCls}">
          <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:5px;margin-bottom:6px">
            <h4 style="margin:0;font-size:14px;font-weight:bold">${esc(fd.storeName || (MTP.state.settings && MTP.state.settings.storeName) || 'MI TIENDA POS')}</h4>
            <div style="font-size:10px;color:#333">${esc(fd.storeAddress || (MTP.state.settings && MTP.state.settings.storeAddress) || '')}</div>
            <div style="font-size:10px;color:#333">RIF: ${esc(fd.storeRif || (MTP.state.settings && MTP.state.settings.rif) || '')}</div>
            ${fd.serialNumber ? `<div style="font-size:10px;color:#333">Serial: ${esc(fd.serialNumber)} · Comprobante: ${esc(fd.fiscalInvoiceNumber)} · Control: ${esc(fd.controlNumber)}</div>` : ''}
            <div style="font-size:10px;color:#333">${esc(fiscalLabel)}</div>
            <div style="font-size:11px;font-weight:bold;margin-top:3px">ORDEN #${esc(sale.orderNumber)} · ${esc(sale.customer)}</div>
            <div style="font-size:10px;color:#333">Cajero: ${esc(cashierName)} · ${esc(dateStr)}</div>
          </div>
          <div style="border-bottom:1px dashed #000;padding-bottom:5px">${itemsHtml}</div>
          <div style="padding-top:5px;border-bottom:1px dashed #000;padding-bottom:5px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#333">
              <span>Monto Exento (E):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(exentoVal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#333">
              <span>Base Imponible (G 16%):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(baseG16Val)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:bold;color:#000">
              <span>IVA (16%):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(ivaUsdVal)} (${ivaBsVal.toFixed(2)} Bs)</span>
            </div>
            ${sale.igtfUsd > 0 ? `
              <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#b45309">
                <span>IGTF (3% Divisas):</span>
                <span style="font-family:monospace">${MTP.fmtUSD(sale.igtfUsd)}</span>
              </div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;font-size:13.5px;font-weight:900;margin-top:3px;border-top:1px solid #000;padding-top:3px">
              <span>TOTAL A PAGAR ($):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(sale.totalUsd)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:#059669">
              <span>TOTAL EN BOLÍVARES (BCV):</span>
              <span style="font-family:monospace">${MTP.fmtBsRaw(sale.totalBs || (sale.totalUsd * (sale.rateBcv || 42.85)))}</span>
            </div>
            ${sale.changeGiven && sale.changeGiven.totalChangeUsd > 0 ? `
              <div style="font-size:10.5px;margin-top:3px;color:#1e40af">
                Vuelto entregado: ${esc(sale.changeGiven.breakdown)}
              </div>
            ` : ''}
          </div>
          ${paymentsHtml ? `<div style="padding-top:4px;border-bottom:1px dashed #000;padding-bottom:4px">
            <div style="font-size:11px;font-weight:900">PAGOS:</div>
            ${paymentsHtml}
          </div>` : ''}
          <div style="text-align:center;font-size:10px;margin-top:6px">
            ¡Gracias por su compra! Vuelva pronto.
          </div>
        </div>
      </div>
    `;

    lastRenderedSale = sale;
    modal.classList.add('open');
  }

  function printThermalTickets() {
    document.body.classList.remove('printing-barcodes');
    document.body.classList.add('printing-receipt');

    const cleanup = () => {
      document.body.classList.remove('printing-receipt');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      if (window.MTPDesktop && typeof window.MTPDesktop.print === 'function') {
        Promise.resolve(window.MTPDesktop.print({ silent: false, printBackground: true }))
          .then((res) => {
            if (res && res.ok === false && res.error && !/cancel/i.test(String(res.error))) {
              window.print();
            }
          })
          .catch(() => window.print())
          .finally(() => setTimeout(cleanup, 300));
      } else {
        window.print();
        setTimeout(cleanup, 1500);
      }
    }, 60);
  }

  function renderTodayTicketsModal() {
    const statsEl = document.getElementById('cajaTodayTicketsStats');
    const tbody = document.getElementById('cajaTodayTicketsBody');
    if (!statsEl || !tbody || !window.MTP || !MTP.state) return;

    const todayStr = getLocalTodayIso();
    const allSales = Array.isArray(MTP.state.sales) ? MTP.state.sales : [];
    const salesToShow = allSales.filter(s =>
      !s.voided && s.status !== 'ANULADA' && toLocalIso(s.createdAt) === todayStr
    );

    const bcv = Number((MTP.state.settings && MTP.state.settings.rateBcv) || 42.85);
    const totalUsd = salesToShow.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0);
    const totalChangeUsd = salesToShow.reduce((acc, s) => acc + Number((s.changeGiven && s.changeGiven.totalChangeUsd) || 0), 0);

    const receiptIco = window.MTPIcons ? MTPIcons.get('receipt', { size: 16 }) : '';
    const cashIco = window.MTPIcons ? MTPIcons.get('cash', { size: 16 }) : '';
    const refreshIco = window.MTPIcons ? MTPIcons.get('refresh', { size: 16 }) : '';

    statsEl.innerHTML = `
      <div class="stat-card tone-in">
        <div class="stat-ico green">${receiptIco}</div>
        <div>
          <div class="stat-n tabular-nums">${salesToShow.length} tickets</div>
          <div class="stat-l">Órdenes de Hoy (${esc(todayStr)})</div>
        </div>
      </div>
      <div class="stat-card tone-info">
        <div class="stat-ico blue">${cashIco}</div>
        <div>
          <div class="stat-n tabular-nums">${MTP.fmtUSD(totalUsd)}</div>
          <div class="stat-l">Total Facturado</div>
          <div class="stat-sub tabular-nums">${(totalUsd * bcv).toFixed(2)} Bs</div>
        </div>
      </div>
      <div class="stat-card tone-cash">
        <div class="stat-ico yellow">${refreshIco}</div>
        <div>
          <div class="stat-n tabular-nums">${MTP.fmtUSD(totalChangeUsd)}</div>
          <div class="stat-l">Vueltos Entregados</div>
          <div class="stat-sub tabular-nums">${(totalChangeUsd * bcv).toFixed(2)} Bs</div>
        </div>
      </div>
    `;

    if (!salesToShow.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><strong>Sin tickets registrados hoy</strong><span>Cuando cobres la primera orden de hoy aparecerá aquí con su método de pago y vuelto entregado.</span></div></td></tr>';
      return;
    }

    tbody.innerHTML = salesToShow.map(s => {
      const chg = s.changeGiven || {};
      const chgUsd = Number(chg.totalChangeUsd) || 0;
      const timeTxt = s.createdAt ? new Date(s.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
      const itemsHtml = (s.items || []).map(i => `<div>• <strong>${i.qty} ${esc(i.unit || 'und')}</strong> ${esc(i.name)}</div>`).join('');
      const paysHtml = (s.payments || []).map(p => `
        <div style="margin-bottom:2px">
          <span class="badge ${p.method === 'Pago Móvil' ? 'badge-blue' : (p.method === 'Punto de Venta' ? 'badge-green' : 'badge-yellow')}">
            ${esc(p.method)}: ${MTP.fmtUSD(p.amountUsd)} (${Number(p.amountBs || 0).toFixed(2)} Bs)
          </span>
          ${p.terminalName ? `<span class="badge badge-purple" style="font-size:12px">${esc(p.terminalName)}${(p.lote || p.batchNumber) ? ' (Lote ' + esc(p.lote || p.batchNumber) + ')' : ''}</span>` : ''}
          ${p.destAccountName ? `<span class="badge badge-amber" style="font-size:12px">${esc(p.destAccountName)}</span>` : ''}
          ${p.ref ? `<span class="code-pill" style="font-size:12px">Ref: ${esc(p.ref)}</span>` : ''}
        </div>
      `).join('');

      return `
        <tr>
          <td><span class="code-pill plu">#${esc(s.orderNumber || '—')}</span></td>
          <td>
            <strong>${esc(s.customer || 'Mostrador')}</strong>
            <div style="font-size:12px;color:var(--txt-muted)">${esc(timeTxt)}</div>
          </td>
          <td>${itemsHtml}</td>
          <td>
            <div class="price-dual">
              <span class="price-usd">${MTP.fmtUSD(s.totalUsd)}</span>
              <span class="price-bs">${MTP.fmtBsRaw(s.totalBs || (Number(s.totalUsd || 0) * bcv))}</span>
            </div>
          </td>
          <td>${paysHtml || '<span style="color:var(--txt-3)">—</span>'}</td>
          <td>
            <strong class="tabular-nums">${MTP.fmtUSD(chgUsd)}</strong>
            <div style="font-size:12px;color:var(--txt-sec)">${esc(chg.breakdown || 'Exacto')}</div>
          </td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" data-reprint-sale-id="${esc(s.id)}">🖨️ Reimprimir</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openTodayTicketsModal() {
    const modal = document.getElementById('cajaTodayTicketsModal');
    if (!modal) return;
    renderTodayTicketsModal();
    modal.classList.add('open');
  }

  /* ==========================================================================
     EXPOSICIÓN GLOBAL EN WINDOW.MTPPos (COMPATIBILIDAD 100% GARANTIZADA)
     ========================================================================== */
  window.MTPPos = {
    // Inicialización y navegación
    initPOS,
    setActiveFamily,
    setSectorFilter,
    getActiveFamilyId: () => activeFamilyId,
    setMultiplier,
    renderProductsCol,
    addVariantQuick,
    addRetailQuick,

    // Modificadores integrados
    openModifiersDrawer,
    stepVariantQty,
    stepRetailQty,
    openModifiersForRef,
    toggleModifierOption,
    closeModifiersDrawer,

    // Gestión del ticket
    setOrderMode,
    getOrderMode,
    changeCartQty,
    removeCartLine,
    addKitchenNote,
    startReplaceLine,
    cancelReplaceMode,
    clearCart,
    holdCurrentCart,
    restoreHeldOrder,
    openQuickKitchenTicketPreview,

    // Cobro y vueltos
    openCheckoutModal,
    selectPayMethod,
    onTerminalChange,
    quickAddBillUsd,
    syncPayInputsFromUsd,
    syncPayInputsFromBs,
    addCurrentPaymentLine,
    addPaymentLine,
    removePaymentLine,
    checkPagoMovilRefLive,
    verifyPagoMovilSms,
    resetPagoMovilProof,
    rebalanceChangeDistribution,
    renderVueltoValidation,
    suggestChangeBreakdown,
    setChangeRateMode,
    finalizeSale,
    getCartTaxSummary,
    getCartTotalUsd,
    computeSaleTotals,
    showPrintedTicketsModal,
    printThermalTickets,
    openTodayTicketsModal,

    // Métodos legados para compatibilidad
    addOrReplaceDish: (id, qty) => addVariantQuick(id, qty),
    addOrReplaceInventory: (id, qty) => addRetailQuick(id, qty),
    setCategory: (catId) => {
      const famId = catId.startsWith('grp:') ? catId.slice(4) : catId;
      setActiveFamily(famId);
    },
    openGroupModal: (groupId) => setActiveFamily(groupId),
    closeVariantModal: () => {},
    refreshActiveVariantModal: () => renderProductsCol()
  };

  // Inicializar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPOS);
  } else {
    initPOS();
  }
})();
