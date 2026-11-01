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
  let lastRenderedSale = null;

  /* ==========================================================================
     INICIALIZACIÓN DEL POS
     ========================================================================== */
  function getActiveChangeRate() {
    const s = (MTP && MTP.state && MTP.state.settings) || {};
    if (changeRateMode === 'EUR') return Number(s.rateEur) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'USDT') return Number(s.rateUsdt) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'CUSTOM' && customChangeRate > 0) return customChangeRate;
    return Number(s.rateBcv) || 42.85;
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

          return `
            <div class="pos-flavor-card ${qtyInCart > 0 ? 'in-cart' : ''}"
              onclick="window.MTPPos.addVariantQuick('${v.id}')"
              title="${v.name} · #${v.code}">
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
              <div class="pos-btn-bottom">
                <div class="pos-btn-prices">
                  <span class="pos-btn-usd">${MTP.fmtUSD(v.priceUsd)}</span>
                  <span class="pos-btn-bs">${bsPrice} Bs</span>
                </div>
                ${hasMods && qtyInCart > 0 ? `
                  <button type="button" class="pos-btn-mod-tag" onclick="event.stopPropagation(); window.MTPPos.openModifiersForRef('${v.id}')" title="Personalizar masa y extras">
                    ⚙ Extras
                  </button>
                ` : ''}
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

        return `
          <div class="pos-retail-card ${qtyInCart > 0 ? 'in-cart' : ''}"
            onclick="window.MTPPos.addRetailQuick('${item.id}')"
            title="${item.name} · #${item.code}">
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
            <div class="pos-btn-bottom">
              <div class="pos-btn-prices">
                <span class="pos-btn-usd">${MTP.fmtUSD(item.priceUsd)}</span>
                <span class="pos-btn-bs">${bsPrice} Bs</span>
              </div>
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
          <div style="margin-top:8px">
            <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('posScannerInput').value='';window.MTPPos.renderProductsCol('');">
              Limpiar búsqueda (ESC)
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
      cards.push(`
        <button type="button" class="pos-flavor-btn ${qtyInCart > 0 ? 'in-cart' : ''}"
          onclick="window.MTPPos.addVariantQuick('${v.id}')">
          <div class="pos-btn-top">
            <span class="pos-btn-plu">#${v.code}</span>
            <span class="badge badge-amber" style="font-size:9px;padding:0 4px">Cocina</span>
            ${qtyInCart > 0 ? `<span class="pos-btn-cart-badge">✓ ${qtyInCart}</span>` : ''}
          </div>
          <div class="pos-btn-name">${v.name}</div>
          <div class="pos-btn-bottom">
            <span class="pos-btn-usd">${MTP.fmtUSD(v.priceUsd)}</span>
            <span class="pos-btn-bs">${bsPrice} Bs</span>
          </div>
        </button>
      `);
    });

    matchingRetail.forEach(i => {
      const qtyInCart = getCartQtyForRef(i.id, false);
      const bsPrice = (i.priceUsd * bcv).toFixed(2);
      const isLow = (Number(i.stock) || 0) <= (Number(i.minStock) || 5);
      const stockClass = isLow ? 'pos-stock-low' : 'pos-stock-ok';

      cards.push(`
        <button type="button" class="pos-retail-btn ${qtyInCart > 0 ? 'in-cart' : ''}"
          onclick="window.MTPPos.addRetailQuick('${i.id}')">
          <div class="pos-btn-top">
            <span class="pos-btn-plu">#${i.code}</span>
            <span class="pos-stock-pill ${stockClass}">${Math.round(i.stock || 0)} ${i.unit || 'und'}</span>
            ${qtyInCart > 0 ? `<span class="pos-btn-cart-badge">✓ ${qtyInCart}</span>` : ''}
          </div>
          <div class="pos-btn-name">${i.name}</div>
          <div class="pos-btn-bottom">
            <span class="pos-btn-usd">${MTP.fmtUSD(i.priceUsd)}</span>
            <span class="pos-btn-bs">${bsPrice} Bs</span>
          </div>
        </button>
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
      code: variant.code,
      name: variant.name,
      isDish: true,
      isVariant: true,
      unit: 'plato',
      qty,
      basePriceUsd: basePrice,
      priceUsd: Number((basePrice + modsPrice).toFixed(2)),
      ivaType: variant.ivaType || 'E',
      selectedModifiers: mods,
      note: ''
    };
  }

  function createCartLineFromRetail(item, qty) {
    return {
      cartId: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      refId: item.id,
      code: item.code,
      barcode: item.barcode,
      name: item.name,
      isDish: false,
      isVariant: false,
      unit: item.unit || 'und',
      qty,
      basePriceUsd: Number(item.priceUsd) || 0,
      priceUsd: Number(item.priceUsd) || 0,
      ivaType: item.ivaType || 'G',
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
    if (!listEl) return;

    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const totalItems = cart.reduce((acc, c) => acc + c.qty, 0);
    const totalUsd = getCartTotalUsd();
    const totalBs = totalUsd * bcv;

    if (countEl) countEl.textContent = `${totalItems} ítem${totalItems === 1 ? '' : 's'}`;
    if (totUsdEl) totUsdEl.textContent = MTP.fmtUSD(totalUsd);
    if (totBsEl) totBsEl.textContent = MTP.fmtBsRaw(totalBs);

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

  function getCartTotalUsd() {
    return cart.reduce((acc, item) => acc + (item.qty * item.priceUsd), 0);
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

    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const totalUsd = getCartTotalUsd();
    const totalBs = totalUsd * bcv;

    document.getElementById('chkTotalUsd').textContent = MTP.fmtUSD(totalUsd);
    document.getElementById('chkTotalBs').textContent = MTP.fmtBsRaw(totalBs);

    currentPayments = [];
    const payUsdInput = document.getElementById('payAmountUsd');
    const payBsInput = document.getElementById('payAmountBs');
    if (payUsdInput) payUsdInput.value = totalUsd.toFixed(2);
    if (payBsInput) payBsInput.value = totalBs.toFixed(2);

    const refInput = document.getElementById('payRefInput');
    if (refInput) refInput.value = '';

    selectPayMethod('Efectivo USD');
    renderPaymentsAndChange();

    const modal = document.getElementById('posCheckoutModal');
    if (modal) modal.classList.add('open');
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

  function quickAddBillUsd(val) {
    const totalUsd = getCartTotalUsd();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const inputUsd = document.getElementById('payAmountUsd');
    const inputBs = document.getElementById('payAmountBs');
    if (!inputUsd || !inputBs) return;

    if (val === 'EXACT') {
      inputUsd.value = totalUsd.toFixed(2);
      inputBs.value = (totalUsd * bcv).toFixed(2);
    } else {
      const num = Number(val);
      inputUsd.value = num.toFixed(2);
      inputBs.value = (num * bcv).toFixed(2);
    }
    renderPaymentsAndChange();
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

  function addCurrentPaymentLine() {
    const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
    const amountUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
    const amountBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;
    let ref = document.getElementById('payRefInput')?.value.trim() || '';

    if (amountUsd <= 0 && amountBs <= 0) {
      MTP.toast('Ingresa un monto válido a registrar', 'warn');
      return;
    }

    if (method === 'Pago Móvil' && ref.length >= 4) {
      const isUsed = MTP.isPagoMovilRefUsed ? MTP.isPagoMovilRefUsed(ref) : false;
      if (isUsed) {
        MTP.toast('Esta referencia de Pago Móvil ya fue usada hoy.', 'err');
        return;
      }
    }

    currentPayments.push({
      id: 'p-' + Date.now(),
      method,
      amountUsd,
      amountBs,
      ref: ref || 'Directo',
      bank: (method === 'Pago Móvil') ? document.getElementById('pmBankSelect')?.value : '',
      phone: (method === 'Pago Móvil') ? document.getElementById('pmPhoneInput')?.value : '',
      verified: true
    });

    // Resetear campos
    const refInput = document.getElementById('payRefInput');
    if (refInput) refInput.value = '';
    renderPaymentsAndChange();
  }

  function removePaymentLine(payId) {
    currentPayments = currentPayments.filter(p => p.id !== payId);
    renderPaymentsAndChange();
  }

  function getPaidTotalUsd() {
    return currentPayments.reduce((acc, p) => acc + p.amountUsd, 0);
  }

  function renderPaymentsAndChange() {
    const totalUsd = getCartTotalUsd();
    const paidUsd = getPaidTotalUsd();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const chgRate = getActiveChangeRate();

    // Lista de pagos sumados
    const listEl = document.getElementById('chkPaymentsList');
    if (listEl) {
      if (!currentPayments.length) {
        listEl.innerHTML = `<div style="padding:6px;color:var(--txt-sec);font-size:11.5px;text-align:center;background:#fff;border:1px dashed var(--border);border-radius:6px">Toca un billete ($5, $10, $20, $50, Exacto) o suma un método de pago.</div>`;
      } else {
        listEl.innerHTML = currentPayments.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:#fff;border:1px solid var(--border);border-radius:6px;margin-bottom:3px;font-size:11.5px">
            <div>
              <strong>${p.method}</strong>
              <span style="color:#64748b;font-size:11px">(${p.ref})</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <strong>${MTP.fmtUSD(p.amountUsd)}</strong>
              <span style="font-size:10.5px;color:#059669;font-weight:700">(${p.amountBs.toFixed(2)} Bs)</span>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger);padding:0 4px" onclick="window.MTPPos.removePaymentLine('${p.id}')">✕</button>
            </div>
          </div>
        `).join('');
      }
    }

    const remUsd = Math.max(0, totalUsd - paidUsd);
    const payUsdInput = document.getElementById('payAmountUsd');
    const payBsInput = document.getElementById('payAmountBs');
    if (payUsdInput && remUsd > 0.009) payUsdInput.value = remUsd.toFixed(2);
    if (payBsInput && remUsd > 0.009) payBsInput.value = (remUsd * bcv).toFixed(2);

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

      // Distribución por defecto venezolana: Billetes USD enteros + centavos por Pago Móvil en Bs
      const wholeUsd = Math.floor(vueltoUsd + 0.001);
      const remBs = Math.max(0, (vueltoUsd - wholeUsd) * chgRate);
      if (distUsd) {
        distUsd.value = String(wholeUsd);
        if (changeRemainderMode === 'BS_CASH') {
          distBsCash.value = remBs.toFixed(2);
          distBsPm.value = '0.00';
        } else {
          distBsPm.value = remBs.toFixed(2);
          distBsCash.value = '0.00';
        }
      }
    } else {
      if (statusLabel) statusLabel.textContent = '✅ PAGO EXACTO (SIN VUELTO):';
      if (chgUsdEl) chgUsdEl.textContent = '$0.00';
      if (chgBsEl) chgBsEl.textContent = '0,00 Bs';
      if (cardUsd) cardUsd.classList.remove('faltante');
      if (cardBs) cardBs.classList.remove('faltante');
      if (distUsd) { distUsd.value = '0'; distBsCash.value = '0.00'; distBsPm.value = '0.00'; }
    }
  }

  function rebalanceChangeDistribution(mode) {
    const totalUsd = getCartTotalUsd();
    const paidUsd = getPaidTotalUsd();
    const chgRate = getActiveChangeRate();
    const totalChangeUsd = Math.max(0, paidUsd - totalUsd);

    const distUsdEl = document.getElementById('vueltoDistUsd');
    const distBsCashEl = document.getElementById('vueltoDistBsCash');
    const distBsPmEl = document.getElementById('vueltoDistBsPm');
    if (!distUsdEl || !distBsCashEl || !distBsPmEl) return;

    if (mode === 'ALL_USD') {
      distUsdEl.value = Math.floor(totalChangeUsd).toString();
      const rem = (totalChangeUsd - Math.floor(totalChangeUsd)) * chgRate;
      distBsPmEl.value = rem.toFixed(2);
      distBsCashEl.value = '0.00';
    } else if (mode === 'ALL_PM') {
      distUsdEl.value = '0';
      distBsCashEl.value = '0.00';
      distBsPmEl.value = (totalChangeUsd * chgRate).toFixed(2);
    } else if (mode === 'USD') {
      const usdGiven = Math.min(totalChangeUsd, Math.max(0, parseFloat(distUsdEl.value) || 0));
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * chgRate);
      distBsPmEl.value = remBs.toFixed(2);
      distBsCashEl.value = '0.00';
    }
  }

  function finalizeSale() {
    const totalUsd = getCartTotalUsd();
    const bcv = Number(MTP.state.settings.rateBcv) || 42.85;
    const chgRate = getActiveChangeRate();

    // Si no sumó pagos a la lista, asume el método activo con el monto del input
    if (!currentPayments.length) {
      const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
      const enteredUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || totalUsd;
      const ref = document.getElementById('payRefInput')?.value.trim() || 'Pago Directo';

      currentPayments.push({
        id: 'p-direct',
        method,
        amountUsd: enteredUsd,
        amountBs: enteredUsd * bcv,
        ref,
        bank: (method === 'Pago Móvil') ? document.getElementById('pmBankSelect')?.value : '',
        phone: (method === 'Pago Móvil') ? document.getElementById('pmPhoneInput')?.value : '',
        verified: true
      });
    }

    const paidUsd = getPaidTotalUsd();
    if (paidUsd + 0.01 < totalUsd) {
      MTP.toast(`Falta cobrar ${MTP.fmtUSD(totalUsd - paidUsd)} (${((totalUsd - paidUsd) * bcv).toFixed(2)} Bs)`, 'err');
      return;
    }

    const changeUsd = Math.max(0, paidUsd - totalUsd);
    const changeBs = changeUsd * chgRate;
    const usdCashGiven = parseFloat(document.getElementById('vueltoDistUsd')?.value) || 0;
    const bsCashGiven = parseFloat(document.getElementById('vueltoDistBsCash')?.value) || 0;
    const bsPmGiven = parseFloat(document.getElementById('vueltoDistBsPm')?.value) || 0;

    const customerInput = document.getElementById('posCustomerInput');
    const customer = (customerInput && customerInput.value.trim()) || 'Mostrador Rápido';

    const recorded = MTP.recordSale({
      customer,
      cashier: location.pathname.includes('/caja/') ? 'Cajero Turno' : 'Admin / Caja',
      totalUsd,
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
        usdCashGiven: Number(usdCashGiven.toFixed(2)),
        bsCashGiven: Number(bsCashGiven.toFixed(2)),
        bsPmGiven: Number(bsPmGiven.toFixed(2)),
        breakdown: `$${usdCashGiven.toFixed(2)} $ + ${bsPmGiven.toFixed(2)} Bs PM`
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
    const totalUsd = getCartTotalUsd();
    const customerInput = document.getElementById('posCustomerInput');
    const previewOrder = {
      orderNumber: MTP.state.settings.nextOrderNumber,
      createdAt: new Date().toISOString(),
      customer: (customerInput && customerInput.value.trim()) || 'Orden / Cotización',
      rateBcv: bcv,
      totalUsd,
      totalBs: totalUsd * bcv,
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
      payments: [{ method: 'Por Cobrar', amountUsd: totalUsd, amountBs: totalUsd * bcv }],
      changeGiven: { totalChangeUsd: 0, totalChangeBs: 0, breakdown: '—' }
    };
    showPrintedTicketsModal(previewOrder);
  }

  function showPrintedTicketsModal(sale) {
    const modal = document.getElementById('posTicketPrintModal');
    const content = document.getElementById('printModalContent');
    if (!modal || !content) return;

    const dishesOnly = sale.items.filter(i => i.isDish);
    const dateStr = new Date(sale.createdAt).toLocaleString('es-VE');

    const kitchenHtml = dishesOnly.length
      ? dishesOnly.map(d => {
          const modStr = (d.selectedModifiers && d.selectedModifiers.length) ? ` (${d.selectedModifiers.map(m => m.name).join(', ')})` : '';
          return `
            <div style="padding:4px 0;border-bottom:1px dashed #000">
              <div style="font-size:13.5px;font-weight:900">${d.qty}x [#${d.code}] ${d.name}${modStr}</div>
              ${d.note ? `<div style="font-size:11px;font-weight:bold;background:#000;color:#fff;padding:1px 4px;margin-top:2px;display:inline-block">NOTA: ${d.note}</div>` : ''}
            </div>
          `;
        }).join('')
      : `<div style="padding:8px 0;text-align:center;color:#64748b">Solo productos de minimercado (despacho directo de mostrador)</div>`;

    const itemsHtml = sale.items.map(i => {
      const modStr = (i.selectedModifiers && i.selectedModifiers.length) ? ` [${i.selectedModifiers.map(m => m.name).join(', ')}]` : '';
      return `
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11.5px">
          <span>${i.qty}x ${i.name}${modStr}</span>
          <span style="font-family:monospace;font-weight:bold">${MTP.fmtUSD(i.subtotalUsd)}</span>
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <!-- TICKET 1: COMANDA DE COCINA -->
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

        <!-- TICKET 2: NOTA DE ENTREGA / CONTROL INTERNO -->
        <div class="thermal-ticket">
          <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:5px;margin-bottom:6px">
            <h4 style="margin:0;font-size:14px;font-weight:bold">MI TIENDA POS</h4>
            <div style="font-size:10px;color:#333">NOTA DE ENTREGA · CONTROL INTERNO</div>
            <div style="font-size:9.5px;color:#666">(SIN VALIDEZ DE CRÉDITO FISCAL)</div>
            <div style="font-size:11px;font-weight:bold;margin-top:3px">ORDEN #${sale.orderNumber} · ${sale.customer}</div>
            <div style="font-size:10px">${dateStr}</div>
          </div>
          <div style="border-bottom:1px dashed #000;padding-bottom:5px">${itemsHtml}</div>
          <div style="padding-top:5px;border-bottom:1px dashed #000;padding-bottom:5px">
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900">
              <span>TOTAL USD:</span>
              <span style="font-family:monospace">${MTP.fmtUSD(sale.totalUsd)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:bold;color:#059669">
              <span>TOTAL BS (BCV):</span>
              <span style="font-family:monospace">${MTP.fmtBsRaw(sale.totalUsd * (sale.rateBcv || 42.85))}</span>
            </div>
            ${sale.changeGiven && sale.changeGiven.totalChangeUsd > 0 ? `
              <div style="font-size:10.5px;margin-top:3px;color:#1e40af">
                Vuelto entregado: ${sale.changeGiven.breakdown}
              </div>
            ` : ''}
          </div>
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
    removePaymentLine,
    checkPagoMovilRefLive,
    rebalanceChangeDistribution,
    finalizeSale,

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
