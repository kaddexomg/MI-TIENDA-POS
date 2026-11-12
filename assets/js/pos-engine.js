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
  let changeRateMode = 'BCV'; // 'BCV' | 'EUR' | 'USDT' | 'CUSTOM'
  let customChangeRate = 0;
  let changeRemainderMode = 'PM'; // 'PM' (Pago Móvil Bs) | 'BS_CASH' (Efectivo Bs)
  let changeRateManual = 0;     // tasa real negociada por el cajero en el momento
  let lastRenderedSale = null;
  const BS_CHANGE_STEP = 0.50; // el vuelto en Bs se entrega en monedas de 0,50

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
    renderPaymentsAndChange();
  }

  function initPOS() {
    if (!window.MTP) return;

    // Seleccionar familia inicial válida
    const families = getFamiliesList();
    if (families.length && !families.some(f => f.id === activeFamilyId)) {
      activeFamilyId = families[0].id;
    }

    renderTopRatePill();
    renderFamiliesNav();
    renderMultiplierGroup();
    renderBestsellersBar();
    renderProductsCol();
    renderTicket();
    renderShortcutsAndHeldBar();
    setupEventListeners();
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

    const families = getFamiliesList();
    nav.innerHTML = families.map((fam, idx) => {
      const isActive = fam.id === activeFamilyId;
      const count = getFamilyItemCount(fam.id);
      const keyLabel = fam.key || String(idx + 1);
      const color = fam.color || '#64748b';

      return `
        <button type="button" class="pos-family-nav-btn ${isActive ? 'active' : ''}"
          style="--fam-color: ${color}"
          onclick="window.MTPPos.setActiveFamily('${fam.id}')"
          data-fam-id="${fam.id}"
          title="Presiona [${keyLabel}] o clic para abrir ${fam.name}">
          <div class="pos-fam-top">
            <span class="pos-fam-key">${keyLabel}</span>
            <span class="pos-fam-count">${count} ítems</span>
          </div>
          <div class="pos-fam-name">${fam.name}</div>
        </button>
      `;
    }).join('');
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
    renderFamiliesNav();
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
        data-mult="${m}" onclick="window.MTPPos.setMultiplier(${m})">
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

    // Lista de ítems más pedidos del día en caja venezolana
    const topSeeds = [
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

    const chips = topSeeds.map(s => {
      let price = s.defaultPrice;
      let targetId = s.id;
      if (s.kind === 'variant' && Array.isArray(MTP.state.variants)) {
        const v = MTP.state.variants.find(x => x.id === s.id || String(x.code) === s.code);
        if (v) { price = Number(v.priceUsd) || price; targetId = v.id; }
      } else if (s.kind === 'retail' && Array.isArray(MTP.state.inventory)) {
        const r = MTP.state.inventory.find(x => x.id === s.id || String(x.code) === s.code);
        if (r) { price = Number(r.priceUsd) || price; targetId = r.id; }
      }

      const clickFn = s.kind === 'variant'
        ? `window.MTPPos.addVariantQuick('${targetId}')`
        : `window.MTPPos.addRetailQuick('${targetId}')`;

      return `
        <button type="button" class="pos-chip-btn" onclick="${clickFn}" title="Agregar 1 toque: ${s.name}">
          <span>${s.name}</span>
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
      return;
    }

    // MODO FAMILIA SELECCIONADA
    const products = MTP.getProductsByFamily ? MTP.getProductsByFamily(activeFamilyId) : [];
    const retailItems = MTP.getDirectRetailItems ? MTP.getDirectRetailItems(activeFamilyId) : [];

    let html = '';

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
          const imgSrc = v.img || prod.img || '../assets/img/productos/empanadas.jpg';

          return `
            <div class="pos-flavor-card ${qtyInCart > 0 ? 'in-cart' : ''}"
              onclick="window.MTPPos.addVariantQuick('${v.id}')"
              title="${v.name} · #${v.code} (+IVA 16%)">
              <button type="button" class="pos-card-edit-btn"
                onclick="event.stopPropagation(); window.MTPProductDrawer && window.MTPProductDrawer.open({ mode: 'edit', id: '${v.id}' })"
                title="Editar plato en 5 segundos">✏️</button>
              <div class="pos-card-row">
                <img class="pos-card-thumb" src="${imgSrc}" alt="${cleanName}" loading="lazy"
                  onerror="this.style.display='none'">
                <div class="pos-card-main">
                  <div class="pos-btn-top">
                    <span class="pos-btn-plu">#${v.code}</span>
                    ${qtyInCart > 0 ? `
                      <div class="pos-btn-stepper" onclick="event.stopPropagation()">
                        <button type="button" class="pos-step-btn minus" onclick="window.MTPPos.stepVariantQty('${v.id}', -1, event)" title="Restar 1">−</button>
                        <span class="pos-step-num">${qtyInCart}</span>
                        <button type="button" class="pos-step-btn plus" onclick="window.MTPPos.stepVariantQty('${v.id}', 1, event)" title="Sumar 1">+</button>
                      </div>
                    ` : ''}
                  </div>
                  <div class="pos-btn-name">${cleanName}</div>
                </div>
              </div>
              <div class="pos-btn-bottom">
                <div class="pos-btn-prices">
                  <span class="pos-btn-usd">${MTP.fmtUSD(v.priceUsd)}</span>
                  <span class="pos-btn-bs">${bsPrice} Bs</span>
                </div>
                ${hasMods && qtyInCart > 0 ? `
                  <button type="button" class="pos-btn-mod-tag" onclick="event.stopPropagation(); window.MTPPos.openModifiersForRef('${v.id}')" title="Personalizar masa y extras">
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
              <span class="pos-section-title">${prod.name}</span>
              <span class="pos-section-subtitle">${prod.subtitle || ''} · ${priceRange}</span>
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
          ? `<div class="pos-card-thumb-ico" title="Cigarros">${window.MTPIcons ? window.MTPIcons.get('bolt', 20) : '🚬'}</div>`
          : `<img class="pos-card-thumb" src="${item.img || '../assets/img/productos/viveres.jpg'}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">`;

        return `
          <div class="pos-retail-card ${qtyInCart > 0 ? 'in-cart' : ''}"
            onclick="window.MTPPos.addRetailQuick('${item.id}')"
            title="${item.name} · #${item.code} (${isExempt ? 'Exento de IVA' : '+IVA 16%'})">
            <button type="button" class="pos-card-edit-btn"
              onclick="event.stopPropagation(); window.MTPProductDrawer && window.MTPProductDrawer.open({ mode: 'edit', id: '${item.id}' })"
              title="Editar producto en 5 segundos">✏️</button>
            <div class="pos-card-row">
              ${thumbHtml}
              <div class="pos-card-main">
                <div class="pos-btn-top">
                  <span class="pos-btn-plu">#${item.code}</span>
                  <span class="pos-stock-pill ${stockClass}">${Math.round(item.stock || 0)} ${item.unit || 'und'}</span>
                  ${qtyInCart > 0 ? `
                    <div class="pos-btn-stepper" onclick="event.stopPropagation()">
                      <button type="button" class="pos-step-btn minus" onclick="window.MTPPos.stepRetailQty('${item.id}', -1, event)" title="Restar 1">−</button>
                      <span class="pos-step-num">${qtyInCart}</span>
                      <button type="button" class="pos-step-btn plus" onclick="window.MTPPos.stepRetailQty('${item.id}', 1, event)" title="Sumar 1">+</button>
                    </div>
                  ` : ''}
                </div>
                <div class="pos-btn-name">${item.name}</div>
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

    if (!matchingVariants.length && !matchingRetail.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:26px 10px;background:#fff;border-radius:8px;border:1px dashed var(--border)">
          <div style="font-size:22px;margin-bottom:4px">🔍</div>
          <strong>Sin resultados para "${query}"</strong>
          <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
            <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('posScannerInput').value='';window.MTPPos.renderProductsCol('');">
              Limpiar búsqueda (ESC)
            </button>
            <button type="button" class="btn btn-sm btn-action" onclick="window.MTPProductDrawer && window.MTPProductDrawer.open({ mode: 'create', defaultFamilyId: (window.MTPPos && window.MTPPos.getActiveFamilyId) ? window.MTPPos.getActiveFamilyId() : 'fritos' })">
              + Crear producto ahora
            </button>
          </div>
        </div>
      `;
      return;
    }

    const cards = [];

    matchingVariants.forEach(v => {
      const qtyInCart = getCartQtyForRef(v.id, true);
      const bsPrice = (v.priceUsd * bcv).toFixed(2);
      const imgSrc = v.img || '../assets/img/productos/empanadas.jpg';
      cards.push(`
        <div class="pos-flavor-card ${qtyInCart > 0 ? 'in-cart' : ''}"
          onclick="window.MTPPos.addVariantQuick('${v.id}')">
          <button type="button" class="pos-card-edit-btn"
            onclick="event.stopPropagation(); window.MTPProductDrawer && window.MTPProductDrawer.open({ mode: 'edit', id: '${v.id}' })"
            title="Editar plato en 5 segundos">✏️</button>
          <div class="pos-card-row">
            <img class="pos-card-thumb" src="${imgSrc}" alt="${v.name}" loading="lazy" onerror="this.style.display='none'">
            <div class="pos-card-main">
              <div class="pos-btn-top">
                <span class="pos-btn-plu">#${v.code}</span>
                <span class="badge badge-amber" style="font-size:9px;padding:0 4px">Cocina</span>
                ${qtyInCart > 0 ? `
                  <div class="pos-btn-stepper" onclick="event.stopPropagation()">
                    <button type="button" class="pos-step-btn minus" onclick="window.MTPPos.stepVariantQty('${v.id}', -1, event)">−</button>
                    <span class="pos-step-num">${qtyInCart}</span>
                    <button type="button" class="pos-step-btn plus" onclick="window.MTPPos.stepVariantQty('${v.id}', 1, event)">+</button>
                  </div>
                ` : ''}
              </div>
              <div class="pos-btn-name">${v.name}</div>
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
        ? `<div class="pos-card-thumb-ico">${window.MTPIcons ? window.MTPIcons.get('bolt', 20) : '🚬'}</div>`
        : `<img class="pos-card-thumb" src="${i.img || '../assets/img/productos/viveres.jpg'}" alt="${i.name}" loading="lazy" onerror="this.style.display='none'">`;

      cards.push(`
        <div class="pos-retail-card ${qtyInCart > 0 ? 'in-cart' : ''}"
          onclick="window.MTPPos.addRetailQuick('${i.id}')">
          <button type="button" class="pos-card-edit-btn"
            onclick="event.stopPropagation(); window.MTPProductDrawer && window.MTPProductDrawer.open({ mode: 'edit', id: '${i.id}' })"
            title="Editar producto en 5 segundos">✏️</button>
          <div class="pos-card-row">
            ${thumbHtml}
            <div class="pos-card-main">
              <div class="pos-btn-top">
                <span class="pos-btn-plu">#${i.code}</span>
                <span class="pos-stock-pill ${stockClass}">${Math.round(i.stock || 0)} ${i.unit || 'und'}</span>
                ${qtyInCart > 0 ? `
                  <div class="pos-btn-stepper" onclick="event.stopPropagation()">
                    <button type="button" class="pos-step-btn minus" onclick="window.MTPPos.stepRetailQty('${i.id}', -1, event)">−</button>
                    <span class="pos-step-num">${qtyInCart}</span>
                    <button type="button" class="pos-step-btn plus" onclick="window.MTPPos.stepRetailQty('${i.id}', 1, event)">+</button>
                  </div>
                ` : ''}
              </div>
              <div class="pos-btn-name">${i.name}</div>
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
          <span class="pos-section-title" style="color:#065f46">Resultados de búsqueda: "${query}"</span>
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

    renderTicket();
    renderProductsCol();
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

    const existing = cart.find(c => c.refId === item.id && !c.isDish && !c.note);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push(createCartLineFromRetail(item, qty));
    }

    // Guarda de existencias: no se puede vender más de lo que hay en el anaquel.
    const stock = Number(item.stock || 0);
    const inCart = cart.filter(c => c.refId === item.id).reduce((a, c) => a + c.qty, 0);
    if (stock > 0 && inCart > stock) {
      MTP.toast(`Solo hay ${stock} de "${item.name}". Se ajustó la cantidad.`, 'err');
      const line = cart.find(c => c.refId === item.id && !c.isDish && !c.note);
      if (line) line.qty = stock;
    }

    closeModifiersDrawer();
    renderTicket();
    renderProductsCol();
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
      const isRadio = g.max === 1;
      const optionsHtml = (g.options || []).map(opt => {
        const isSelected = (line.selectedModifiers || []).some(m => m.id === opt.id);
        const priceTag = opt.priceUsd > 0 ? ` (+${MTP.fmtUSD(opt.priceUsd)})` : '';
        return `
          <button type="button" class="mod-opt-btn ${isSelected ? 'active' : ''}"
            onclick="window.MTPPos.toggleModifierOption('${cartId}', '${g.id}', '${opt.id}')">
            ${opt.name}${priceTag}
          </button>
        `;
      }).join('');

      return `
        <div class="pos-mod-group">
          <span class="pos-mod-label">${g.name}:</span>
          ${optionsHtml}
        </div>
      `;
    }).join('');

    drawer.innerHTML = `
      <div class="pos-mod-hd">
        <span class="pos-mod-title">⚙ Opciones / Extras para: <strong>${line.name}</strong></span>
        <button type="button" class="pos-mod-close-btn" onclick="window.MTPPos.closeModifiersDrawer()">
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
    if (taxBoxEl) {
      if (!cart.length) {
        taxBoxEl.style.display = 'none';
      } else {
        taxBoxEl.style.display = 'block';
        const modeLabel = tax.ivaMode === 'INCLUIDO' ? 'IVA 16% (incluido)' : 'IVA 16% (+recargo)';
        taxBoxEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#475569">
            <span>Subtotal (Exento: ${MTP.fmtUSD(tax.exentoUsd)} · Gravado: ${MTP.fmtUSD(tax.baseG16Usd)})</span>
            <strong style="font-family:var(--font-mono)">${MTP.fmtUSD(tax.subtotalBaseUsd)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#0f172a;margin-top:2px">
            <span>${modeLabel}:</span>
            <strong style="font-family:var(--font-mono);color:#b45309">+${MTP.fmtUSD(tax.totalIvaUsd)} (${tax.totalIvaBs.toFixed(2)} Bs)</strong>
          </div>
        `;
      }
    }

    if (!cart.length) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:36px 12px;color:#64748b;font-size:12px">
          <div style="font-size:26px;margin-bottom:6px">🛒</div>
          <strong>Orden vacía</strong>
          <p style="margin:4px 0 0 0;font-size:11px">
            Toca un sabor o escanea un código para facturar rápido.
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
              <span class="code-pill ${c.isDish ? 'plu' : ''}" style="font-size:9px;padding:0 3px">#${c.code}</span>
              <span>${c.name}</span>
            </div>
            ${hasMods ? `<div class="ticket-row-mods">⚙ ${modsLabel}</div>` : ''}
            <div class="ticket-row-sub">
              <span>${MTP.fmtUSD(c.priceUsd)} c/u</span>
              ${canHaveMods ? `<button type="button" class="ticket-mini-btn" onclick="window.MTPPos.openModifiersDrawer('${c.cartId}')">⚙ Extras</button>` : ''}
              <button type="button" class="ticket-mini-btn" onclick="window.MTPPos.addKitchenNote('${c.cartId}')" title="Nota de cocina">📝 Nota</button>
              <button type="button" class="ticket-mini-btn" onclick="window.MTPPos.startReplaceLine('${c.cartId}')" title="Reemplazar ítem">⇄</button>
            </div>
            ${c.note ? `<div class="ticket-row-note">NOTA: ${c.note}</div>` : ''}
          </div>

          <div class="ticket-qty-ctrl">
            <button type="button" class="qty-btn" onclick="window.MTPPos.changeCartQty('${c.cartId}', -1)" title="Restar 1">−</button>
            <span style="font-family:var(--font-mono);font-weight:900;font-size:12.5px;min-width:18px;text-align:center">${c.qty}</span>
            <button type="button" class="qty-btn" onclick="window.MTPPos.changeCartQty('${c.cartId}', 1)" title="Sumar 1">+</button>
          </div>

          <div class="ticket-row-tot">
            <div style="font-family:var(--font-mono);font-size:12px;font-weight:900;color:#0f172a">${MTP.fmtUSD(lineSubUsd)}</div>
            <div style="font-family:var(--font-mono);font-size:9.5px;font-weight:700;color:#059669">${lineSubBs.toFixed(2)} Bs</div>
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger);padding:0 4px;font-size:10px;line-height:1"
              onclick="window.MTPPos.removeCartLine('${c.cartId}')" title="Eliminar renglón">✕</button>
          </div>
        </div>
      `;
    }).join('');

    renderShortcutsAndHeldBar();
  }

  function changeCartQty(cartId, delta) {
    const idx = cart.findIndex(c => c.cartId === cartId);
    if (idx === -1) return;
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
    const note = prompt(`Nota de cocina para "${line.name}" (ej: Sin salsa, Bien tostada, Para llevar):`, line.note || '');
    if (note !== null) {
      line.note = note.trim();
      renderTicket();
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
      <span>🔄 MODO REEMPLAZO ACTIVO: Selecciona el nuevo ítem para reemplazar <strong>"${line ? line.name : ''}"</strong></span>
      <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px" onclick="window.MTPPos.cancelReplaceMode()">Cancelar (ESC)</button>
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
        <span class="held-pill" onclick="window.MTPPos.restoreHeldOrder('${h.id}')" title="Clic para retomar esta cuenta">
          <span>🕒 ${h.customer} (${MTP.fmtUSD(tot)})</span>
        </span>
      `;
    }).join('');

    barEl.innerHTML = `
      <span style="font-size:10.5px;font-weight:800;color:#1e40af">Espera:</span>
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
    if (scanInput) {
      scanInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = scanInput.value.trim();
          if (val) {
            handleCodeOrSearchSubmit(val);
            scanInput.value = '';
          }
        } else if (e.key === 'Escape') {
          scanInput.value = '';
          scanInput.blur();
          renderProductsCol('');
        }
      });

      scanInput.addEventListener('input', function () {
        const val = scanInput.value.trim();
        // Si el usuario teclea '3*', preselecciona el multiplicador 3
        if (/^\d+\*$/.test(val)) {
          const m = parseInt(val, 10);
          if (!isNaN(m) && m > 0) setMultiplier(m);
          return;
        }
        renderProductsCol(val);
      });
    }

    if (window.MTPBarcode) {
      window.MTPBarcode.onBarcodeScan(function (code) {
        handleCodeOrSearchSubmit(code);
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

      // Escape: Cerrar modales, drawer o cancelar reemplazo
      if (e.key === 'Escape') {
        if (activeModifierCartId) { closeModifiersDrawer(); return; }
        if (replacingCartId) { cancelReplaceMode(); return; }
        closeAllModals();
        if (scanInput) { scanInput.value = ''; scanInput.blur(); renderProductsCol(''); }
        return;
      }

      // Si el modal de cobro está abierto y presionan Enter
      const chkModal = document.getElementById('posCheckoutModal');
      if (chkModal && chkModal.classList.contains('open')) {
        if (e.key === 'Enter' && document.activeElement?.id !== 'payRefInput') {
          const paid = getPaidTotalUsd();
          const tot = getCartTotalUsd();
          if (paid + 0.01 >= tot) {
            e.preventDefault();
            finalizeSale();
          }
        }
        return;
      }

      // Si el usuario está escribiendo texto, no interceptar
      if (isTyping) return;

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
        const families = getFamiliesList();
        const targetFam = families.find(f => String(f.key) === e.key) || families[parseInt(e.key, 10) - 1];
        if (targetFam) {
          e.preventDefault();
          setActiveFamily(targetFam.id);
        }
      }
    });

    window.addEventListener('mtp:state-updated', function () {
      renderTopRatePill();
      renderFamiliesNav();
      renderBestsellersBar();
      renderProductsCol(scanInput ? scanInput.value.trim() : '');
      renderTicket();
    });
  }

  function closeAllModals() {
    closeModifiersDrawer();
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    if (window.MTPBarcode && window.MTPBarcode.closeCameraScannerModal) {
      window.MTPBarcode.closeCameraScannerModal();
    }
  }

  /* ==========================================================================
     SISTEMA VENEZOLANO DE COBRO, PAGO MÓVIL Y CALCULADORA DE VUELTO (100% OPERATIVO)
     ========================================================================== */
  function openCheckoutModal() {
    if (!cart.length) {
      MTP.toast('El ticket está vacío. Agrega platos o mercancía antes de cobrar.', 'warn');
      return;
    }

    currentPayments = [];

    // Se previsualiza el total CON el IGTF estimado del método activo para que
    // el cajero vea desde el primer instante el número exacto que va a cobrar.
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const baseTax = computeSaleTotals([]);
    const previewTax = computeSaleTotals([{
      id: 'p-preview', method: method, amountUsd: baseTax.totalUsd,
      amountBs: baseTax.totalBs, ref: 'estimado', verified: false
    }]);
    renderCheckoutTotals(previewTax);

    const payUsdInput = document.getElementById('payAmountUsd');
    const payBsInput = document.getElementById('payAmountBs');
    if (payUsdInput) payUsdInput.value = previewTax.totalUsd.toFixed(2);
    if (payBsInput) payBsInput.value = previewTax.totalBs.toFixed(2);

    const refInput = document.getElementById('payRefInput');
    if (refInput) refInput.value = '';

    selectPayMethod('Efectivo USD');
    renderPaymentsAndChange();

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
    }

    const refInput = document.getElementById('payRefInput');
    if (refInput) {
      refInput.placeholder = (method === 'Pago Móvil')
        ? 'Ref (últimos 4-6 dígitos)'
        : (method === 'Punto de Venta' ? 'Nº Aprobación / Voucher' : 'Referencia o nota opcional');
    }
  }

  /**
   * Botón de billete: SUMA, no reemplaza.
   * Cada pulsación agrega una línea de pago etiquetada con el billete,
   * de modo que el cajero puede dar $20 y después $5 sin que se pierda nada.
   */
  function quickAddBillUsd(val) {
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;

    if (val === 'EXACT') {
      const pending = Math.max(0, computeSaleTotals().totalUsd - getPaidTotalUsd());
      if (pending <= 0.009) {
        MTP.toast('La cuenta ya está cobrada por completo.', 'warn');
        return;
      }
      addPaymentLine({ method, amountUsd: pending, amountBs: pending * bcv, bill: 'Exacto' });
      return;
    }

    const amount = Number(val) || 0;
    if (amount <= 0) return;
    addPaymentLine({ method, amountUsd: amount, amountBs: amount * bcv, bill: '$' + amount });
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
    const ref = (refInput && refInput.value.trim()) || opts.ref || 'Directo';

    if (method === 'Pago Móvil' && ref.length >= 4 && MTP.isPagoMovilRefUsed && MTP.isPagoMovilRefUsed(ref)) {
      MTP.toast('Esta referencia de Pago Móvil ya fue usada hoy.', 'err');
      return false;
    }

    const terminalSel = document.getElementById('posTerminalSelect');
    const liqOption = terminalSel && terminalSel.selectedOptions ? terminalSel.selectedOptions[0] : null;

    currentPayments.push({
      id: 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      method: method,
      amountUsd: Number(amountUsd.toFixed(2)),
      amountBs: Number(amountBs.toFixed(2)),
      rateUsed: Number(getActiveChangeRate().toFixed(4)),
      ref: ref,
      bill: opts.bill || '',
      bank: method === 'Pago Móvil' ? (document.getElementById('pmBankSelect')?.value || '') : '',
      phone: method === 'Pago Móvil' ? (document.getElementById('pmPhoneInput')?.value || '') : '',
      terminalId: method === 'Punto de Venta' ? (terminalSel?.value || '') : '',
      voucher: method === 'Punto de Venta' ? (document.getElementById('posVoucherInput')?.value || '') : '',
      batchNumber: method === 'Punto de Venta' ? (document.getElementById('posBatchInput')?.value || '') : '',
      liquidationCurrency: method === 'Punto de Venta'
        ? (liqOption ? (liqOption.dataset.liquidation || 'VES') : 'VES')
        : '',
      verified: true
    });

    if (refInput) refInput.value = '';
    renderPaymentsAndChange();
    return true;
  }

  function addCurrentPaymentLine() {
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const amountUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
    const amountBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;
    return addPaymentLine({ method, amountUsd, amountBs });
  }

  function removePaymentLine(payId) {
    currentPayments = currentPayments.filter(p => p.id !== payId);
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
    const tax = computeSaleTotals();
    const paidUsd = getPaidTotalUsd();
    const changeDueUsd = Math.max(0, paidUsd - tax.totalUsd);
    const rate = getActiveChangeRate();
    const chg = getChangeDistributionInputs();
    const deliveredUsd = chg.usdCash + (chg.bsCash / rate) + (chg.bsPm / rate);
    const diff = Math.abs(deliveredUsd - changeDueUsd);
    const ok = changeDueUsd <= 0.009 || diff <= 0.011;

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
    const tax = computeSaleTotals();
    const totalUsd = tax.totalUsd;
    const totalBs = tax.totalBs;
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
        listEl.innerHTML = currentPayments.map(p => `
          <div class="chk-pay-row">
            <div class="chk-pay-name">
              <strong>${p.method}${p.bill ? ' · ' + p.bill : ''}</strong>
              <span class="chk-pay-ref">${p.ref}</span>
            </div>
            <div class="chk-pay-amount">
              <strong>${MTP.fmtUSD(p.amountUsd)}</strong>
              <span>${p.amountBs.toFixed(2)} Bs</span>
              <button type="button" class="chk-pay-del" title="Quitar este pago" onclick="window.MTPPos.removePaymentLine('${p.id}')">✕</button>
            </div>
          </div>
        `).join('');
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
      if (distUsd) { distUsd.value = '0'; distBsCash.value = '0.00'; distBsPm.value = '0.00'; }
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
      if (distUsd) {
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
      if (distUsd) { distUsd.value = '0'; distBsCash.value = '0.00'; distBsPm.value = '0.00'; }
      const hintEl = document.getElementById('vueltoSuggestion');
      if (hintEl) hintEl.textContent = 'Sin vuelto';
    }

    renderVueltoValidation();
  }

  function rebalanceChangeDistribution(mode) {
    const totalUsd = computeSaleTotals().totalUsd;
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
      distUsdEl.value = '0';
      distBsCashEl.value = (totalChangeUsd * rate).toFixed(2);
      distBsPmEl.value = '0.00';
    } else if (mode === 'ALL_PM') {
      distUsdEl.value = '0';
      distBsCashEl.value = '0.00';
      distBsPmEl.value = (totalChangeUsd * rate).toFixed(2);
    } else if (mode === 'USD') {
      // El cajero fijó el efectivo en US$: el resto se calcula en Bs.
      const usdGiven = Math.min(totalChangeUsd, Math.max(0, parseFloat(distUsdEl.value) || 0));
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * rate);
      const remRound = Math.round(remBs / BS_CHANGE_STEP) * BS_CHANGE_STEP;
      distBsPmEl.value = remRound.toFixed(2);
      distBsCashEl.value = '0.00';
    } else if (mode === 'BS_CASH') {
      // El cajero fijó el efectivo en Bs: se descuenta del resto.
      const bsGiven = Math.max(0, parseFloat(distBsCashEl.value) || 0);
      const usdGiven = Math.max(0, totalChangeUsd - (bsGiven / rate));
      distUsdEl.value = String(Math.floor(usdGiven + 0.001));
      distBsPmEl.value = '0.00';
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
      const ok = addPaymentLine({
        method,
        amountUsd: enteredUsd > 0 ? enteredUsd : computeSaleTotals().totalUsd,
        amountBs: enteredBs > 0 ? enteredBs : 0,
        ref: document.getElementById('payRefInput')?.value.trim() || 'Pago Directo'
      });
      if (!ok) return;
    }

    // 2) TOTAL ÚNICO: el mismo número que se le mostró al cajero al abrir
    //    el modal es el que se valida, el que genera el vuelto y el que se
    //    guarda en la venta (antes estos tres eran cálculos distintos).
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

    const recorded = MTP.recordSale({
      customer,
      cashier: location.pathname.includes('/caja/') ? 'Cajero Turno' : 'Admin / Caja',
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
    if (!modal || !content) return;

    const dishesOnly = sale.items.filter(i => i.isDish);
    const hasDishes = dishesOnly.length > 0;
    const dateStr = new Date(sale.createdAt).toLocaleString('es-VE');
    const fd = sale.fiscalData || {};

    const kitchenHtml = dishesOnly.map(d => {
          const modStr = (d.selectedModifiers && d.selectedModifiers.length) ? ` (${d.selectedModifiers.map(m => m.name).join(', ')})` : '';
          return `
            <div style="padding:4px 0;border-bottom:1px dashed #000">
              <div style="font-size:13.5px;font-weight:900">${d.qty}x [#${d.code}] ${d.name}${modStr}</div>
              ${d.note ? `<div style="font-size:11px;font-weight:bold;background:#000;color:#fff;padding:1px 4px;margin-top:2px;display:inline-block">NOTA: ${d.note}</div>` : ''}
            </div>
          `;
    }).join('');

    const itemsHtml = sale.items.map(i => {
      const modStr = (i.selectedModifiers && i.selectedModifiers.length) ? ` [${i.selectedModifiers.map(m => m.name).join(', ')}]` : '';
      return `
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11.5px">
          <span>${i.qty}x ${i.name}${modStr}</span>
          <span style="font-family:monospace;font-weight:bold">${MTP.fmtUSD(i.subtotalUsd)}</span>
        </div>
      `;
    }).join('');

    // Detalle de pagos (imprescindible para el cuadre del día y para evidenciar
    // la base del IGTF).
    const paymentsHtml = (sale.payments || []).map(p => {
      let label = p.method || '';
      if (p.bill) label += ` (${p.bill})`;
      if (p.bank) label += ` ${p.bank}`;
      if (p.ref && p.ref !== 'Directo') label += ` Ref ${p.ref}`;
      return `
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span>${label}</span>
          <span style="font-family:monospace">${MTP.fmtUSD(p.amountUsd)}</span>
        </div>`;
    }).join('');

    // Rótulo fiscal DINÁMICO según el estado real de la máquina
    const fiscalLabel = fd.isFiscalValid
      ? 'COMPROBANTE FISCAL HOMOLOGADO'
      : 'NOTA DE ENTREGA · CONTROL INTERNO · NO ES FACTURA FISCAL';

    // La comanda de cocina SOLO se imprime si la venta tiene platos.
    const kitchenTicket = hasDishes ? `
        <div class="thermal-ticket">
          <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px">
            <h4 style="margin:0;font-size:15px;font-weight:900">🍳 COMANDA DE COCINA</h4>
            <div style="font-size:13px;font-weight:bold;margin-top:2px">ORDEN #${sale.orderNumber}</div>
            <div style="font-size:11px">${dateStr}</div>
            <div style="font-size:12px;font-weight:bold;margin-top:3px;background:#000;color:#fff;padding:2px">CLIENTE: ${sale.customer}</div>
          </div>
          <div>${kitchenHtml}</div>
          <div style="text-align:center;font-size:10.5px;margin-top:8px;font-weight:bold">*** DESPACHAR CALIENTE ***</div>
        </div>
    ` : '';

    content.innerHTML = `
      <div class="print-root">
        ${kitchenTicket}
        <div class="thermal-ticket">
          <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:5px;margin-bottom:6px">
            <h4 style="margin:0;font-size:14px;font-weight:bold">${fd.storeName || 'MI TIENDA POS'}</h4>
            <div style="font-size:10px;color:#333">${fd.storeAddress || ''}</div>
            <div style="font-size:10px;color:#333">RIF: ${fd.storeRif || ''}</div>
            ${fd.serialNumber ? `<div style="font-size:10px;color:#333">Serial: ${fd.serialNumber} · Comprobante: ${fd.fiscalInvoiceNumber} · Control: ${fd.controlNumber}</div>` : ''}
            <div style="font-size:10px;color:#333">${fiscalLabel}</div>
            <div style="font-size:11px;font-weight:bold;margin-top:3px">ORDEN #${sale.orderNumber} · ${sale.customer}</div>
            <div style="font-size:10px">${dateStr}</div>
          </div>
          <div style="border-bottom:1px dashed #000;padding-bottom:5px">${itemsHtml}</div>
          <div style="padding-top:5px;border-bottom:1px dashed #000;padding-bottom:5px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#333">
              <span>Monto Exento (E):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(sale.exentoUsd || (sale.fiscalData && sale.fiscalData.taxExemptUsd) || 0)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#333">
              <span>Base Imponible (G 16%):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(sale.baseG16Usd || (sale.fiscalData && sale.fiscalData.taxableBaseUsd) || sale.subtotalUsd || 0)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:bold;color:#000">
              <span>IVA (16%):</span>
              <span style="font-family:monospace">${MTP.fmtUSD(sale.ivaUsd || (sale.fiscalData && sale.fiscalData.ivaUsd) || 0)} (${((sale.ivaBs !== undefined ? sale.ivaBs : ((sale.ivaUsd || 0) * (sale.rateBcv || 42.85)))).toFixed(2)} Bs)</span>
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
                Vuelto entregado: ${sale.changeGiven.breakdown}
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

    modal.classList.add('open');
  }

  /* ==========================================================================
     EXPOSICIÓN GLOBAL EN WINDOW.MTPPos (COMPATIBILIDAD 100% GARANTIZADA)
     ========================================================================== */
  window.MTPPos = {
    // Inicialización y navegación
    initPOS,
    setActiveFamily,
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
    quickAddBillUsd,
    syncPayInputsFromUsd,
    syncPayInputsFromBs,
    addCurrentPaymentLine,
    addPaymentLine,
    removePaymentLine,
    checkPagoMovilRefLive,
    rebalanceChangeDistribution,
    renderVueltoValidation,
    suggestChangeBreakdown,
    setChangeRateMode,
    finalizeSale,
    getCartTaxSummary,
    getCartTotalUsd,
    computeSaleTotals,
    showPrintedTicketsModal,

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
