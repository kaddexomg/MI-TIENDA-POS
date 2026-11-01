/* ==========================================================================
   MI-TIENDA-POS — Motor POS v4 (Especial para PC Windows 7 + Realidad Venezolana)
   - Controles de Teclado Bruta Velocidad ([1]-[9]/[0], [+]/[-], F1, F2, F3, F4, F6)
   - Selector de Variedades Compacto con [-1] [+1] [+2] [+5] + Crear Nueva Variedad
   - Tickets en Espera / Multicuenta (F3)
   - Sistema Venezolano de Vueltos: Billetes Enteros $ + Pico en Bs (Pago Móvil / Efectivo Bs)
     con Selector de Tasa para el Vuelto (BCV / Euro / Paralelo USDT)
   ========================================================================== */
(function () {
  let cart = [];
  let activeCategory = 'GROUPS';
  let activeGroupModalId = null;
  let replacingCartId = null;
  let currentPayments = [];
  let changeRateMode = 'BCV'; // 'BCV' | 'EUR' | 'USDT' | 'CUSTOM'
  let customChangeRate = 0;
  let changeRemainderMode = 'PM'; // 'PM' (Pago Móvil Bs) | 'BS_CASH' (Efectivo Bs)
  let lastRenderedSale = null;

  function getActiveChangeRate() {
    const s = MTP.state.settings;
    if (changeRateMode === 'EUR') return Number(s.rateEur) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'USDT') return Number(s.rateUsdt) || Number(s.rateBcv) || 42.85;
    if (changeRateMode === 'CUSTOM' && customChangeRate > 0) return customChangeRate;
    return Number(s.rateBcv) || 42.85;
  }

  function initPOS() {
    if (!window.MTP) return;
    ensureVariantModalExists();
    ensureCheckoutModalUpgraded();
    renderShortcutsAndHeldBar();
    renderCategoryTabs();
    renderPosGrid();
    renderTicket();

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
          renderPosGrid('');
        }
      });
      scanInput.addEventListener('input', function () {
        renderPosGrid(scanInput.value.trim());
      });
    }

    if (window.MTPBarcode) {
      window.MTPBarcode.onBarcodeScan(function (code) {
        handleCodeOrSearchSubmit(code);
      });
    }

    // ATAJOS DE TECLADO BRUTA VELOCIDAD (Pensados para PC de Cobranzas Windows 7)
    document.addEventListener('keydown', function (e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F1') {
        e.preventDefault();
        if (scanInput) { scanInput.focus(); scanInput.select(); }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        openCheckoutModal();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        holdCurrentCart();
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        openQuickKitchenTicketPreview();
        return;
      }
      if (e.key === 'Escape') {
        cancelReplaceMode();
        closeAllModals();
        if (scanInput) scanInput.blur();
        return;
      }

      // Si el modal de cobro está abierto y presionan Enter (fuera de referencias)
      const chkModal = document.getElementById('posCheckoutModal');
      if (chkModal && chkModal.classList.contains('open')) {
        if (e.key === 'Enter' && document.activeElement?.id !== 'payRefInput') {
          const paid = getPaidTotalUsd();
          const tot = getCartTotalUsd();
          if (paid + 0.01 >= tot) {
            e.preventDefault();
            finalizeSale();
            return;
          }
        }
        return;
      }

      // Si el usuario está escribiendo texto en un input, no interceptar números
      if (isTyping) return;

      // Teclas + y - suben o bajan la cantidad del último producto del ticket
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

      // Teclas numéricas [1]-[9] y [0]
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;

        // A) Si el modal de variedades de una familia está abierto -> suma la variedad [1..9] al instante
        if (activeGroupModalId) {
          const items = MTP.getItemsForGroup(activeGroupModalId);
          if (items[idx]) {
            e.preventDefault();
            const it = items[idx];
            const delta = e.shiftKey ? -1 : 1;
            if (delta < 0) {
              adjustItemInCart(it, -1);
            } else if (it.kind === 'dish') {
              addOrReplaceDish(it.id, 1);
            } else {
              addOrReplaceInventory(it.id, 1);
            }
          }
          return;
        }

        // B) Si estamos en la pantalla principal -> abre la familia [1..9, 0]
        if (activeCategory === 'GROUPS') {
          const groups = MTP.POS_GROUPS || [];
          if (groups[idx]) {
            e.preventDefault();
            openGroupModal(groups[idx].id);
          }
        }
      }
    });

    window.addEventListener('mtp:state-updated', function () {
      renderShortcutsAndHeldBar();
      renderPosGrid(scanInput ? scanInput.value.trim() : '');
      renderTicket();
      if (activeGroupModalId) renderVariantModalItems(activeGroupModalId);
    });
  }

  function closeAllModals() {
    activeGroupModalId = null;
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    if (window.MTPBarcode && window.MTPBarcode.closeCameraScannerModal) {
      window.MTPBarcode.closeCameraScannerModal();
    }
  }

  /* ==========================================================================
     BARRA DE ATAJOS DE TECLADO + CUENTAS EN ESPERA / MULTICUENTA (F3)
     ========================================================================== */
  function renderShortcutsAndHeldBar() {
    const leftCol = document.querySelector('.pos-left-col');
    if (leftCol && !document.getElementById('posShortcutsStrip')) {
      const strip = document.createElement('div');
      strip.id = 'posShortcutsStrip';
      strip.className = 'pos-shortcuts-strip';
      leftCol.insertBefore(strip, leftCol.firstChild);
    }

    const stripEl = document.getElementById('posShortcutsStrip');
    if (stripEl) {
      const heldCount = (MTP.state.heldOrders || []).length;
      stripEl.innerHTML = `
        <div class="pos-sc-items">
          <span class="pos-sc-item" onclick="document.getElementById('posScannerInput')?.focus()"><span class="pos-sc-kbd">F1</span> Buscar/Código</span>
          <span class="pos-sc-item" onclick="window.MTPPos.openCheckoutModal()"><span class="pos-sc-kbd">F2</span> Cobrar/Vuelto</span>
          <span class="pos-sc-item" onclick="window.MTPPos.holdCurrentCart()"><span class="pos-sc-kbd">F3</span> Poner en Espera (${heldCount})</span>
          <span class="pos-sc-item" onclick="window.MTPPos.openQuickKitchenTicketPreview()"><span class="pos-sc-kbd">F4</span> Comanda</span>
          <span class="pos-sc-item"><span class="pos-sc-kbd">1-9 / 0</span> Abrir Familia / Sumar</span>
          <span class="pos-sc-item"><span class="pos-sc-kbd">+ / -</span> Cant.</span>
        </div>
      `;
    }

    // Barra de cuentas en espera arriba del ticket
    const ticketPanel = document.querySelector('.pos-ticket-panel');
    const customerBar = document.querySelector('.ticket-customer-bar');
    if (ticketPanel && customerBar && !document.getElementById('heldOrdersBar')) {
      const hBar = document.createElement('div');
      hBar.id = 'heldOrdersBar';
      hBar.className = 'held-orders-bar';
      ticketPanel.insertBefore(hBar, customerBar);
    }

    const hBarEl = document.getElementById('heldOrdersBar');
    if (hBarEl) {
      const held = MTP.state.heldOrders || [];
      const holdBtn = `<button class="btn btn-amber btn-sm" style="padding:2px 7px;font-size:10.5px;flex-shrink:0" onclick="window.MTPPos.holdCurrentCart()" title="Guardar cuenta actual en espera para atender a otro cliente (F3)">⏸ Espera (F3)</button>`;
      if (!held.length) {
        hBarEl.innerHTML = `${holdBtn} <span style="font-size:10.5px;color:#475569;font-weight:600">Sin cuentas en espera</span>`;
      } else {
        const pills = held.map((h, i) => {
          const tot = (h.items || []).reduce((a, b) => a + b.qty * b.priceUsd, 0);
          return `
            <span class="held-pill" onclick="window.MTPPos.restoreHeldOrder('${h.id}')" title="Clic para retomar esta cuenta">
              <span>🕒 ${h.customer} (${MTP.fmtUSD(tot)})</span>
            </span>
          `;
        }).join('');
        hBarEl.innerHTML = `${holdBtn} ${pills}`;
      }
    }
  }

  function holdCurrentCart() {
    if (!cart.length) {
      const held = MTP.state.heldOrders || [];
      if (held.length > 0) {
        restoreHeldOrder(held[0].id);
      } else {
        MTP.toast('Agrega productos al ticket antes de ponerlo en espera', 'warn');
      }
      return;
    }
    const customerInput = document.getElementById('posCustomerInput');
    const name = (customerInput && customerInput.value.trim()) || ('Cliente #' + ((MTP.state.heldOrders || []).length + 1));
    if (!Array.isArray(MTP.state.heldOrders)) MTP.state.heldOrders = [];
    MTP.state.heldOrders.unshift({
      id: 'HOLD-' + Date.now(),
      customer: name,
      createdAt: new Date().toISOString(),
      items: JSON.parse(JSON.stringify(cart))
    });
    cart = [];
    if (customerInput) customerInput.value = '';
    MTP.save();
    renderTicket();
    renderPosGrid();
    renderShortcutsAndHeldBar();
    MTP.toast(`Cuenta de "${name}" puesta en espera. Caja libre para el siguiente cliente.`);
  }

  function restoreHeldOrder(holdId) {
    const idx = (MTP.state.heldOrders || []).findIndex(h => h.id === holdId);
    if (idx === -1) return;
    const target = MTP.state.heldOrders[idx];

    // Si hay algo en el carrito actual, lo guardamos en espera automáticamente para no perderlo
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
    MTP.save();
    renderTicket();
    renderPosGrid();
    renderShortcutsAndHeldBar();
    MTP.toast(`Retomada cuenta: ${target.customer}`);
  }

  /* ==========================================================================
     MODAL DE SELECCIÓN DE VARIEDADES + CREACIÓN RÁPIDA EN CATEGORÍA
     ========================================================================== */
  function ensureVariantModalExists() {
    let modal = document.getElementById('posVariantModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'posVariantModal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeVariantModal();
      });
    }
    modal.innerHTML = `
      <div class="modal-box" style="max-width:820px">
        <div class="modal-hd" style="background:#0f172a;color:#fff;border-radius:12px 12px 0 0;padding:10px 14px">
          <div>
            <h3 id="posVariantModalTitle" style="color:#fff;font-size:15px;margin:0">Seleccionar Variedad</h3>
            <p id="posVariantModalSub" style="color:#cbd5e1;font-size:11px;margin:2px 0 0 0">Presiona las teclas [1] a [9] en el teclado o usa los botones [+1] [+2] [+5]</p>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button class="btn btn-amber btn-sm" onclick="window.MTPPos.toggleQuickNewVarietyBox()">+ Nueva Variedad</button>
            <span id="posVariantModalTicketInfo" class="badge badge-green" style="font-size:12px;padding:4px 9px">Total: $0.00</span>
            <button class="btn btn-sm" style="background:#10b981;color:#fff;border:none;font-weight:800" onclick="window.MTPPos.closeVariantModal()">✓ Listo (ESC)</button>
          </div>
        </div>

        <!-- Formulario Rápido para Agregar Nueva Variedad o Artículo en esta Categoría -->
        <div id="quickNewVarietyBox" style="display:none;background:#ecfdf5;border-bottom:2px solid #10b981;padding:10px 14px">
          <div style="font-size:12px;font-weight:800;color:#065f46;margin-bottom:6px">Agregar Nuevo Sabor / Producto en esta Categoría:</div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;align-items:end">
            <div class="form-group">
              <label>Nombre de la Variedad / Artículo</label>
              <input type="text" id="qnvName" class="input" placeholder="Ej: Empanada Pabellón / Pepsi 1.5L">
            </div>
            <div class="form-group">
              <label>Precio Venta ($)</label>
              <input type="number" step="0.05" id="qnvPrice" class="input" value="1.50" style="font-weight:900">
            </div>
            <div class="form-group">
              <label>Costo Base ($)</label>
              <input type="number" step="0.05" id="qnvCost" class="input" value="0.80">
            </div>
            <div class="form-group">
              <label>Stock Inicial</label>
              <input type="number" step="1" id="qnvStock" class="input" value="24">
            </div>
            <button class="btn btn-p" onclick="window.MTPPos.saveQuickNewVariety()">Guardar y Vender</button>
          </div>
        </div>

        <div class="modal-bd" style="padding:12px;max-height:74vh;overflow-y:auto;background:#f8fafc">
          <div class="variant-grid" id="posVariantModalGrid"></div>
        </div>
      </div>
    `;
  }

  function toggleQuickNewVarietyBox() {
    const box = document.getElementById('quickNewVarietyBox');
    if (!box) return;
    const isHidden = box.style.display === 'none';
    box.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      setTimeout(() => document.getElementById('qnvName')?.focus(), 40);
    }
  }

  function saveQuickNewVariety() {
    if (!activeGroupModalId) return;
    const name = document.getElementById('qnvName')?.value.trim();
    const priceUsd = parseFloat(document.getElementById('qnvPrice')?.value) || 1.00;
    const costUsd = parseFloat(document.getElementById('qnvCost')?.value) || 0.50;
    const stock = parseFloat(document.getElementById('qnvStock')?.value) || 24;

    if (!name) {
      MTP.toast('Escribe el nombre de la nueva variedad o artículo', 'warn');
      return;
    }

    const created = MTP.quickCreateItemInGroup({
      groupId: activeGroupModalId,
      name,
      priceUsd,
      costUsd,
      stock
    });

    if (created) {
      document.getElementById('qnvName').value = '';
      document.getElementById('quickNewVarietyBox').style.display = 'none';
      renderVariantModalItems(activeGroupModalId);
      renderPosGrid();
      MTP.toast(`¡Variedad "${name}" creada en esta categoría!`);
    }
  }

  function openGroupModal(groupId) {
    ensureVariantModalExists();
    activeGroupModalId = groupId;
    renderVariantModalItems(groupId);
    const modal = document.getElementById('posVariantModal');
    if (modal) modal.classList.add('open');
  }

  function closeVariantModal() {
    activeGroupModalId = null;
    const modal = document.getElementById('posVariantModal');
    if (modal) modal.classList.remove('open');
    const scanInput = document.getElementById('posScannerInput');
    renderPosGrid(scanInput ? scanInput.value.trim() : '');
  }

  function adjustItemInCart(it, delta) {
    const existing = cart.find(c => c.refId === it.id && (it.kind === 'dish' ? c.isDish : !c.isDish));
    if (!existing && delta > 0) {
      if (it.kind === 'dish') addOrReplaceDish(it.id, delta);
      else addOrReplaceInventory(it.id, delta);
      return;
    }
    if (existing) {
      changeCartQty(existing.cartId, delta);
      if (activeGroupModalId) renderVariantModalItems(activeGroupModalId);
    }
  }

  function renderVariantModalItems(groupId) {
    const group = (MTP.POS_GROUPS || []).find(g => g.id === groupId);
    const items = MTP.getItemsForGroup ? MTP.getItemsForGroup(groupId) : [];
    const titleEl = document.getElementById('posVariantModalTitle');
    const subEl = document.getElementById('posVariantModalSub');
    const infoEl = document.getElementById('posVariantModalTicketInfo');
    const gridEl = document.getElementById('posVariantModalGrid');
    if (!gridEl) return;

    const bcv = MTP.state.settings.rateBcv;
    if (group && titleEl) {
      titleEl.textContent = `${group.emoji} ${group.title}`;
      subEl.textContent = replacingCartId
        ? '🔄 MODO REEMPLAZO ACTIVO: Toca la variedad por la cual deseas cambiar el ítem del ticket'
        : `Atajo rápido: presiona [1] al [9] en tu teclado o toca [+1] [+2] [+5] para armar la cuenta rápido`;
    }
    if (infoEl) {
      infoEl.textContent = `Ticket: ${MTP.fmtUSD(getCartTotalUsd())} (${MTP.fmtBsRaw(getCartTotalUsd() * bcv)})`;
    }

    gridEl.innerHTML = items.map((it, idx) => {
      const inCartLine = cart.find(c => c.refId === it.id && (it.kind === 'dish' ? c.isDish : !c.isDish));
      const qtyInCart = inCartLine ? inCartLine.qty : 0;
      const bsPrice = (it.priceUsd * bcv).toFixed(2);
      const fallbackImg = MTP.getFallbackSvgDataUri(it.name, it.emoji);
      const kbdLabel = idx < 9 ? String(idx + 1) : (idx === 9 ? '0' : '•');
      const addFn1 = it.kind === 'dish'
        ? `window.MTPPos.addOrReplaceDish('${it.id}', 1)`
        : `window.MTPPos.addOrReplaceInventory('${it.id}', 1)`;
      const addFn2 = it.kind === 'dish'
        ? `window.MTPPos.addOrReplaceDish('${it.id}', 2)`
        : `window.MTPPos.addOrReplaceInventory('${it.id}', 2)`;
      const addFn5 = it.kind === 'dish'
        ? `window.MTPPos.addOrReplaceDish('${it.id}', 5)`
        : `window.MTPPos.addOrReplaceInventory('${it.id}', 5)`;
      const minusFn = inCartLine
        ? `window.MTPPos.changeCartQty('${inCartLine.cartId}', -1); window.MTPPos.refreshActiveVariantModal();`
        : '';

      return `
        <div class="variant-row-card ${qtyInCart > 0 ? 'in-cart' : ''}">
          <div class="variant-kbd-badge" onclick="${addFn1}" title="Atajo de teclado: Tecla ${kbdLabel}">${kbdLabel}</div>
          <img class="variant-item-img" src="${it.img || fallbackImg}" alt="${it.name}" onclick="${addFn1}" onerror="this.onerror=null;this.src='${fallbackImg}'">
          <div class="variant-item-info" onclick="${addFn1}">
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:1px">
              <span class="code-pill ${it.kind === 'dish' ? 'plu' : ''}" style="font-size:9px;padding:0 4px">#${it.code}</span>
              <span style="font-size:9.8px;color:#64748b;font-weight:700">${Math.round(it.stock)} ${it.unit}</span>
              ${qtyInCart > 0 ? `<span class="badge badge-green" style="font-size:10px;font-weight:900;padding:1px 6px">✓ ${qtyInCart} en orden</span>` : ''}
            </div>
            <div class="variant-item-name">${it.name}</div>
            <div class="variant-item-prices">
              <span class="usd">${MTP.fmtUSD(it.priceUsd)}</span>
              <span class="bs">${bsPrice} Bs</span>
            </div>
          </div>
          <div class="variant-quick-btns">
            ${qtyInCart > 0 ? `<button class="vq-btn minus" onclick="${minusFn}" title="Restar 1">−1</button>` : ''}
            <button class="vq-btn plus1" onclick="${addFn1}" title="Sumar 1">+1</button>
            ${!replacingCartId ? `
              <button class="vq-btn" onclick="${addFn2}" title="Sumar 2">+2</button>
              <button class="vq-btn" onclick="${addFn5}" title="Sumar 5">+5</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function refreshActiveVariantModal() {
    if (activeGroupModalId) renderVariantModalItems(activeGroupModalId);
  }

  function handleCodeOrSearchSubmit(rawCode) {
    const match = MTP.findByCodeOrBarcode(rawCode, false);
    if (match) {
      if (match.kind === 'dish') {
        addOrReplaceDish(match.item.id, 1);
        MTP.toast(`Agregado: ${match.item.name}`);
      } else if (match.kind === 'inventory') {
        addOrReplaceInventory(match.item.id, 1);
        MTP.toast(`Escaneado: ${match.item.name}`);
      }
      renderPosGrid('');
      return;
    }

    const q = rawCode.toLowerCase();
    const dishMatches = MTP.state.dishes.filter(d => d.name.toLowerCase().includes(q));
    const invMatches = MTP.state.inventory.filter(i => i.sellable && i.name.toLowerCase().includes(q));
    if (dishMatches.length === 1 && invMatches.length === 0) {
      addOrReplaceDish(dishMatches[0].id, 1);
      renderPosGrid('');
    } else if (invMatches.length === 1 && dishMatches.length === 0) {
      addOrReplaceInventory(invMatches[0].id, 1);
      renderPosGrid('');
    } else {
      MTP.toast(`Código "${rawCode}" no encontrado. Puedes crearlo en su categoría.`, 'warn');
    }
  }

  function renderCategoryTabs() {
    const wrap = document.getElementById('posCategoryTabs');
    if (!wrap) return;
    const cats = [
      { id: 'GROUPS',          label: 'Todas las Familias', kbd: 'ESC' },
      { id: 'grp:empanadas',   label: 'Empanadas', kbd: '1' },
      { id: 'grp:pastelitos',  label: 'Pastelitos/Tequeños', kbd: '2' },
      { id: 'grp:papas',       label: 'Papas Rellenas', kbd: '3' },
      { id: 'grp:almuerzos',   label: 'Almuerzos', kbd: '4' },
      { id: 'grp:cafe',        label: 'Cafetería', kbd: '5' },
      { id: 'grp:chucherias',  label: 'Pepitos/Chucherías', kbd: '6' },
      { id: 'grp:refrescos',   label: 'Refrescos/Malta', kbd: '7' },
      { id: 'grp:cervezas',    label: 'Cervezas', kbd: '8' },
      { id: 'grp:cigarros',    label: 'Cigarros', kbd: '9' },
      { id: 'grp:viveres',     label: 'Harina PAN/Víveres', kbd: '0' }
    ];

    wrap.innerHTML = cats.map(c => `
      <button class="pos-cat-btn ${activeCategory === c.id ? 'active' : ''}" onclick="window.MTPPos.setCategory('${c.id}')">
        <span class="cat-kbd-num">[${c.kbd}]</span>
        <span>${c.label}</span>
      </button>
    `).join('');
  }

  function setCategory(catId) {
    activeCategory = catId;
    renderCategoryTabs();
    const scanInput = document.getElementById('posScannerInput');
    renderPosGrid(scanInput ? scanInput.value.trim() : '');
  }

  function renderPosGrid(searchQuery = '') {
    const grid = document.getElementById('posItemsGrid');
    if (!grid) return;
    const q = String(searchQuery || '').toLowerCase();
    const bcv = MTP.state.settings.rateBcv;

    if (activeCategory === 'GROUPS' && !q) {
      const groups = MTP.POS_GROUPS || [];
      grid.innerHTML = groups.map((grp, idx) => {
        const items = MTP.getItemsForGroup ? MTP.getItemsForGroup(grp.id) : [];
        const minPrice = items.length ? Math.min(...items.map(i => Number(i.priceUsd) || 0)) : 0;
        const maxPrice = items.length ? Math.max(...items.map(i => Number(i.priceUsd) || 0)) : 0;
        const priceLabel = minPrice === maxPrice
          ? MTP.fmtUSD(minPrice)
          : `${MTP.fmtUSD(minPrice)} – ${MTP.fmtUSD(maxPrice)}`;
        const bsMinLabel = (minPrice * bcv).toFixed(2) + ' Bs';
        const fallbackImg = MTP.getFallbackSvgDataUri(grp.title, grp.emoji);
        const kbdKey = idx < 9 ? String(idx + 1) : '0';

        const qtyInTicket = cart.reduce((acc, c) => {
          const belongs = items.some(it => it.id === c.refId && (it.kind === 'dish' ? c.isDish : !c.isDish));
          return belongs ? acc + c.qty : acc;
        }, 0);

        return `
          <div class="pos-group-card" onclick="window.MTPPos.openGroupModal('${grp.id}')">
            <div class="pos-card-img-wrap">
              <img class="pos-card-img" src="${grp.img || fallbackImg}" alt="${grp.title}" onerror="this.onerror=null;this.src='${fallbackImg}'">
              <div class="pos-card-badges">
                <span class="pos-kbd-tag">Tecla [${kbdKey}]</span>
                ${qtyInTicket > 0
                  ? `<span class="badge badge-green" style="font-size:10px;font-weight:900;padding:2px 7px">✓ ${qtyInTicket} en orden</span>`
                  : `<span class="pos-group-count">${items.length} variedades</span>`
                }
              </div>
            </div>
            <div class="pos-card-body">
              <div class="pos-item-name">${grp.title}</div>
              <div style="font-size:10.5px;color:#64748b;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
                ${grp.subtitle}
              </div>
              <div class="pos-item-ft">
                <div>
                  <div class="pos-item-usd">${priceLabel}</div>
                  <div class="pos-item-bs">Desde ${bsMinLabel}</div>
                </div>
                <span class="btn btn-sm ${grp.kind === 'dish' ? 'btn-amber' : 'btn-p'}" style="padding:3px 7px;font-size:10.5px">Elegir [${kbdKey}]</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const targetGroup = activeCategory.startsWith('grp:') ? activeCategory.slice(4) : null;
    let cardsHtml = '';

    MTP.state.dishes.forEach(dish => {
      if (targetGroup && dish.group !== targetGroup) return;
      if (q && !dish.name.toLowerCase().includes(q) && !dish.code.toLowerCase().includes(q) && !dish.barcode.includes(q)) return;

      const maxPortions = MTP.calcDishMaxPortions(dish);
      const bsPrice = (dish.priceUsd * bcv).toFixed(2);
      const fallbackImg = MTP.getFallbackSvgDataUri(dish.name, dish.emoji);

      cardsHtml += `
        <div class="pos-item-card" onclick="window.MTPPos.addOrReplaceDish('${dish.id}', 1)">
          <div class="pos-card-img-wrap">
            <img class="pos-card-img" src="${dish.img || fallbackImg}" alt="${dish.name}" onerror="this.onerror=null;this.src='${fallbackImg}'">
            <div class="pos-card-badges">
              <span class="code-pill plu">#${dish.code}</span>
              <span class="badge badge-yellow" style="font-size:9.5px;padding:1px 5px">${maxPortions} disp</span>
            </div>
          </div>
          <div class="pos-card-body">
            <div class="pos-item-name">${dish.name}</div>
            <div class="pos-item-ft">
              <div>
                <div class="pos-item-usd">${MTP.fmtUSD(dish.priceUsd)}</div>
                <div class="pos-item-bs">${bsPrice} Bs</div>
              </div>
              <span class="btn btn-amber btn-sm" style="padding:3px 7px;font-size:10.5px">${replacingCartId ? '⇄ Cambiar' : '+1'}</span>
            </div>
          </div>
        </div>
      `;
    });

    MTP.state.inventory.forEach(item => {
      if (!item.sellable) return;
      if (targetGroup && item.group !== targetGroup) return;
      if (q && !item.name.toLowerCase().includes(q) && !item.code.toLowerCase().includes(q) && !item.barcode.includes(q) && !String(item.qrCode || '').toLowerCase().includes(q)) return;

      const bsPrice = (item.priceUsd * bcv).toFixed(2);
      const stockClass = item.stock <= item.minStock ? 'badge-red' : 'badge-green';
      const fallbackImg = MTP.getFallbackSvgDataUri(item.name, item.emoji);

      cardsHtml += `
        <div class="pos-item-card" onclick="window.MTPPos.addOrReplaceInventory('${item.id}', 1)">
          <div class="pos-card-img-wrap">
            <img class="pos-card-img" src="${item.img || fallbackImg}" alt="${item.name}" onerror="this.onerror=null;this.src='${fallbackImg}'">
            <div class="pos-card-badges">
              <span class="code-pill">#${item.code}</span>
              <span class="badge ${stockClass}" style="font-size:9.5px;padding:1px 5px">${Math.round(item.stock)} ${item.unit}</span>
            </div>
          </div>
          <div class="pos-card-body">
            <div class="pos-item-name">${item.name}</div>
            <div class="pos-item-ft">
              <div>
                <div class="pos-item-usd">${MTP.fmtUSD(item.priceUsd)}</div>
                <div class="pos-item-bs">${bsPrice} Bs</div>
              </div>
              <span class="btn btn-p btn-sm" style="padding:3px 7px;font-size:10.5px">${replacingCartId ? '⇄ Cambiar' : '+1'}</span>
            </div>
          </div>
        </div>
      `;
    });

    if (targetGroup) {
      cardsHtml += `
        <div class="pos-item-card" style="border:2px dashed #10b981;background:#f0fdf4;align-items:center;justify-content:center;padding:14px;text-align:center" onclick="window.MTPPos.openGroupModal('${targetGroup}');window.MTPPos.toggleQuickNewVarietyBox();">
          <div style="font-size:24px">➕</div>
          <strong style="font-size:12px;color:#065f46;margin-top:4px">Agregar Nueva Variedad / Producto Aquí</strong>
        </div>
      `;
    }

    if (!cardsHtml) {
      cardsHtml = `
        <div style="grid-column:1/-1;text-align:center;padding:24px;background:#fff;border-radius:10px;border:1px dashed var(--border)">
          <div style="font-size:24px;margin-bottom:4px">🔎</div>
          <strong>Sin resultados para "${searchQuery}"</strong>
          <div style="margin-top:6px">
            <button class="btn btn-sm btn-outline" onclick="window.MTPPos.setCategory('GROUPS')">Volver a Familias Agrupadas (ESC)</button>
          </div>
        </div>
      `;
    }

    grid.innerHTML = cardsHtml;
  }

  function addOrReplaceDish(dishId, qty = 1) {
    const dish = MTP.state.dishes.find(d => d.id === dishId);
    if (!dish) return;
    const addQty = Math.max(1, Number(qty) || 1);

    if (replacingCartId) {
      const idx = cart.findIndex(c => c.cartId === replacingCartId);
      if (idx !== -1) {
        const oldName = cart[idx].name;
        const keepQty = cart[idx].qty;
        cart[idx] = {
          cartId: cart[idx].cartId,
          refId: dish.id,
          code: dish.code,
          name: dish.name,
          isDish: true,
          unit: 'plato',
          qty: keepQty,
          priceUsd: Number(dish.priceUsd),
          note: cart[idx].note || ''
        };
        replacingCartId = null;
        updateReplaceBanner();
        renderTicket();
        closeVariantModal();
        MTP.toast(`Reemplazado "${oldName}" por "${dish.name}"`);
        return;
      }
      replacingCartId = null;
      updateReplaceBanner();
    }

    const existing = cart.find(c => c.refId === dish.id && c.isDish && !c.note);
    if (existing) {
      existing.qty += addQty;
    } else {
      cart.push({
        cartId: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        refId: dish.id,
        code: dish.code,
        name: dish.name,
        isDish: true,
        unit: 'plato',
        qty: addQty,
        priceUsd: Number(dish.priceUsd),
        note: ''
      });
    }
    renderTicket();
    if (activeGroupModalId) {
      renderVariantModalItems(activeGroupModalId);
    } else {
      const scanInput = document.getElementById('posScannerInput');
      renderPosGrid(scanInput ? scanInput.value.trim() : '');
    }
  }

  function addOrReplaceInventory(invId, qty = 1) {
    const item = MTP.getInsumoById(invId);
    if (!item || !item.sellable) return;
    const addQty = Math.max(1, Number(qty) || 1);

    if (replacingCartId) {
      const idx = cart.findIndex(c => c.cartId === replacingCartId);
      if (idx !== -1) {
        const oldName = cart[idx].name;
        const keepQty = cart[idx].qty;
        cart[idx] = {
          cartId: cart[idx].cartId,
          refId: item.id,
          code: item.code,
          name: item.name,
          isDish: false,
          unit: item.unit,
          qty: keepQty,
          priceUsd: Number(item.priceUsd),
          note: ''
        };
        replacingCartId = null;
        updateReplaceBanner();
        renderTicket();
        closeVariantModal();
        MTP.toast(`Reemplazado "${oldName}" por "${item.name}"`);
        return;
      }
      replacingCartId = null;
      updateReplaceBanner();
    }

    const existing = cart.find(c => c.refId === item.id && !c.isDish);
    if (existing) {
      existing.qty += addQty;
    } else {
      cart.push({
        cartId: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        refId: item.id,
        code: item.code,
        name: item.name,
        isDish: false,
        unit: item.unit,
        qty: addQty,
        priceUsd: Number(item.priceUsd),
        note: ''
      });
    }
    renderTicket();
    if (activeGroupModalId) {
      renderVariantModalItems(activeGroupModalId);
    } else {
      const scanInput = document.getElementById('posScannerInput');
      renderPosGrid(scanInput ? scanInput.value.trim() : '');
    }
  }

  function startReplaceLine(cartId) {
    if (replacingCartId === cartId) {
      cancelReplaceMode();
      return;
    }
    replacingCartId = cartId;
    updateReplaceBanner();
    renderTicket();
    renderPosGrid();
    MTP.toast('Modo Reemplazo activo: abre una familia o toca el nuevo plato/producto', 'warn');
  }

  function cancelReplaceMode() {
    replacingCartId = null;
    updateReplaceBanner();
    renderTicket();
    renderPosGrid();
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
      <span>🔄 Reemplazando: <strong>${line ? line.name : ''}</strong> — Selecciona el nuevo plato o producto</span>
      <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px" onclick="window.MTPPos.cancelReplaceMode()">Cancelar (ESC)</button>
    `;
  }

  function changeCartQty(cartId, delta) {
    const idx = cart.findIndex(c => c.cartId === cartId);
    if (idx === -1) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) {
      if (replacingCartId === cartId) replacingCartId = null;
      cart.splice(idx, 1);
      updateReplaceBanner();
    }
    renderTicket();
    renderPosGrid();
  }

  function editExactQty(cartId) {
    const line = cart.find(c => c.cartId === cartId);
    if (!line) return;
    const val = prompt(`Cantidad exacta para "${line.name}":`, String(line.qty));
    if (val === null) return;
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      line.qty = n;
      renderTicket();
      renderPosGrid();
    }
  }

  function removeCartLine(cartId) {
    if (replacingCartId === cartId) {
      replacingCartId = null;
      updateReplaceBanner();
    }
    cart = cart.filter(c => c.cartId !== cartId);
    renderTicket();
    renderPosGrid();
  }

  function addKitchenNote(cartId) {
    const line = cart.find(c => c.cartId === cartId);
    if (!line) return;
    const note = prompt(`Nota para "${line.name}" (Ej: Para llevar, Sin salsa, Bien frita):`, line.note || 'Para llevar');
    if (note !== null) {
      line.note = note.trim();
      renderTicket();
    }
  }

  function clearCart() {
    if (!cart.length) return;
    cart = [];
    replacingCartId = null;
    updateReplaceBanner();
    renderTicket();
    renderPosGrid();
    MTP.toast('Ticket vaciado', 'warn');
  }

  function getCartTotalUsd() {
    return cart.reduce((acc, item) => acc + (item.qty * item.priceUsd), 0);
  }

  function renderTicket() {
    const listEl = document.getElementById('posTicketItems');
    const totUsdEl = document.getElementById('posTotalUsd');
    const totBsEl = document.getElementById('posTotalBs');
    const countEl = document.getElementById('posTicketCount');
    if (!listEl) return;

    const bcv = MTP.state.settings.rateBcv;
    const totalUsd = getCartTotalUsd();
    const totalBs = totalUsd * bcv;

    if (totUsdEl) totUsdEl.textContent = MTP.fmtUSD(totalUsd);
    if (totBsEl) totBsEl.textContent = MTP.fmtBsRaw(totalBs);
    if (countEl) countEl.textContent = `${cart.reduce((a, b) => a + b.qty, 0)} ítems`;

    if (!cart.length) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:18px 10px;color:var(--txt-muted)">
          <div style="font-size:22px;margin-bottom:4px">⚡</div>
          <strong style="color:var(--txt-sec);font-size:12px">Listo para facturar</strong>
          <p style="font-size:10.5px;margin-top:3px">Presiona <strong>[1] a [9]</strong> en el teclado para abrir familias o escanea código de barras.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = cart.map(line => {
      const subUsd = line.qty * line.priceUsd;
      const subBs = subUsd * bcv;
      const isReplacing = replacingCartId === line.cartId;

      return `
        <div class="ticket-row" style="${isReplacing ? 'background:#fef3c7;border-left:3px solid #f59e0b;padding-left:6px' : ''}">
          <div class="ticket-row-info">
            <div class="ticket-row-title" title="${line.name}">
              <span class="code-pill ${line.isDish ? 'plu' : ''}" style="font-size:9.5px;padding:1px 4px">#${line.code}</span>
              <span>${line.name}</span>
            </div>
            <div class="ticket-row-sub">
              <span>${line.qty} × ${MTP.fmtUSD(line.priceUsd)}</span>
              <button class="ticket-mini-btn" onclick="window.MTPPos.startReplaceLine('${line.cartId}')" title="Cambiar por otro">⇄</button>
              <button class="ticket-mini-btn" onclick="window.MTPPos.editExactQty('${line.cartId}')" title="Cantidad exacta">Cant</button>
              <button class="ticket-mini-btn" onclick="window.MTPPos.addKitchenNote('${line.cartId}')" title="Nota cocina">📝</button>
            </div>
            ${line.note ? `<div class="ticket-row-note">📌 ${line.note}</div>` : ''}
          </div>
          <div class="ticket-qty-ctrl">
            <button class="qty-btn" onclick="window.MTPPos.changeCartQty('${line.cartId}', -1)">−</button>
            <span style="font-weight:800;font-size:11.5px;min-width:14px;text-align:center">${line.qty}</span>
            <button class="qty-btn" onclick="window.MTPPos.changeCartQty('${line.cartId}', 1)">+</button>
            <button class="qty-btn" style="color:var(--danger)" onclick="window.MTPPos.removeCartLine('${line.cartId}')" title="Eliminar">✕</button>
          </div>
          <div class="ticket-row-tot">
            <div style="font-weight:800;font-size:12px">${MTP.fmtUSD(subUsd)}</div>
            <div style="font-size:10px;color:var(--primary);font-weight:700">${subBs.toFixed(2)} Bs</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ==========================================================================
     REDISEÑO PROFUNDO DE COBRO Y VUELTOS (REALIDAD DE VENEZUELA)
     - Billetes físicos enteros ($1, $5, $10, $20, $50, $100) + Pago Mixto en 1 Clic
     - Tasa seleccionable para el vuelto en Bs (BCV / Euro / Paralelo USDT / Manual)
     - Selector directo de cuántos $ físicos das de la gaveta y el resto por Pago Móvil o Bs
     ========================================================================== */
  function ensureCheckoutModalUpgraded() {
    const modal = document.getElementById('posCheckoutModal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-box" style="max-width:760px">
        <div class="modal-hd" style="background:#0f172a;color:#fff;border-radius:12px 12px 0 0;padding:10px 16px">
          <div>
            <h3 style="color:#fff;margin:0;font-size:15px">💵 Cobro Rápido, Pago Mixto y Calculadora Venezolana de Vueltos</h3>
            <p style="color:#94a3b8;font-size:11px;margin:2px 0 0 0">Elige con qué billete o método paga el cliente y cómo entregas el vuelto ($ físico + Pago Móvil / Bs)</p>
          </div>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:none" onclick="document.getElementById('posCheckoutModal').classList.remove('open')">✕ (ESC)</button>
        </div>
        <div class="modal-bd" style="padding:12px 16px;max-height:82vh;overflow-y:auto">
          <!-- Totales de la Cuenta -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            <div style="background:#f8fafc;border:1.5px solid var(--border);padding:7px 11px;border-radius:8px">
              <span style="font-size:10px;font-weight:800;color:var(--txt-sec);text-transform:uppercase">Total Cuenta USD ($)</span>
              <div id="chkTotalUsd" style="font-size:20px;font-weight:900;font-family:var(--font-mono)">$0.00</div>
            </div>
            <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;padding:7px 11px;border-radius:8px">
              <span style="font-size:10px;font-weight:800;color:#065f46;text-transform:uppercase">Total en Bolívares (BCV)</span>
              <div id="chkTotalBs" style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:#059669">0,00 Bs</div>
            </div>
            <div style="background:#eff6ff;border:1.5px solid #bfdbfe;padding:7px 11px;border-radius:8px">
              <span style="font-size:10px;font-weight:800;color:#1e40af;text-transform:uppercase">Ref. Euro BCV / USDT</span>
              <div id="chkTotalAlt" style="font-size:12.5px;font-weight:800;font-family:var(--font-mono);color:#1e3a8a;margin-top:3px">€0.00 | 0,00 Bs</div>
            </div>
          </div>

          <!-- PASO 1: ¿Con qué billete o método paga el cliente? -->
          <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-bottom:6px">
              <span style="font-size:11px;font-weight:900;color:#0f172a">1️⃣ BILLETE USD RECIBIDO EN MANO (Calcula el vuelto al instante):</span>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="btn btn-p btn-sm" onclick="window.MTPPos.quickSetSingleBill('EXACT')">✅ Pago Exacto</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(1)">💵 $1</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(2)">💵 $2</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(5)">💵 $5</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(10)">💵 $10</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(20)">💵 $20</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(50)">💵 $50</button>
                <button class="btn btn-ghost btn-sm" style="font-weight:900" onclick="window.MTPPos.quickSetSingleBill(100)">💵 $100</button>
              </div>
            </div>

            <!-- Métodos de Pago -->
            <div class="pay-methods-grid">
              <button class="pay-method-btn active" data-method="Efectivo USD" onclick="window.MTPPos.selectPayMethod('Efectivo USD')">💵 Efectivo $</button>
              <button class="pay-method-btn" data-method="Pago Móvil" onclick="window.MTPPos.selectPayMethod('Pago Móvil')">📱 Pago Móvil</button>
              <button class="pay-method-btn" data-method="Punto de Venta" onclick="window.MTPPos.selectPayMethod('Punto de Venta')">💳 Punto / Bio</button>
              <button class="pay-method-btn" data-method="Efectivo Bs" onclick="window.MTPPos.selectPayMethod('Efectivo Bs')">🇻🇪 Efectivo Bs</button>
              <button class="pay-method-btn" data-method="Zelle / Transf" onclick="window.MTPPos.selectPayMethod('Zelle / Transf')">⚡ Zelle / USDT</button>
              <button class="pay-method-btn" data-method="Crédito / Vale" onclick="window.MTPPos.selectPayMethod('Crédito / Vale')">📝 Por Cobrar</button>
            </div>
            <input type="hidden" id="payMethodSelect" value="Efectivo USD">

            <!-- Datos extra y Validador Inteligente de Pago Móvil Recibido y C2P -->
            <div id="pagoMovilExtraFields" style="display:none;background:#eff6ff;border:1.5px solid #93c5fd;padding:9px;border-radius:8px;margin-bottom:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:11px;font-weight:900;color:#1e40af">📱 PAGO MÓVIL:</span>
                  <div class="tabs" style="display:inline-flex;margin:0;gap:3px">
                    <button type="button" id="btnPmModeP2p" class="btn btn-sm btn-p" style="padding:2px 7px;font-size:10px" onclick="window.MTPPos.switchPmMode('P2P')">P2P (Cliente Transfiere)</button>
                    <button type="button" id="btnPmModeC2p" class="btn btn-sm btn-ghost" style="padding:2px 7px;font-size:10px" onclick="window.MTPPos.switchPmMode('C2P')">⚡ C2P (Débito OTP)</button>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:10.5px;color:#1d4ed8;background:#dbeafe;border:1px solid #93c5fd" onclick="window.MTPPos.promptPastePagoMovilSms()">
                  📲 Pegar Notificación / SMS (Auto-llenar)
                </button>
              </div>

              <!-- P2P Subcontainer -->
              <div id="pmP2pContainer">
                <div style="display:grid;grid-template-columns:1.2fr 1fr 1.2fr 1fr;gap:6px;align-items:center">
                  <div class="form-group">
                    <label>📥 Cuenta Destino Negocio</label>
                    <select id="pmDestAccountSelect" class="select" style="padding:4px 6px;font-size:11px">
                      <!-- Dinámico -->
                    </select>
                  </div>
                  <div class="form-group">
                    <label>🏦 Banco Emisor</label>
                    <select id="pmBankSelect" class="select" style="padding:4px 6px;font-size:11px">
                      <option value="0102 - Venezuela">0102 - Banco de Venezuela</option>
                      <option value="0134 - Banesco">0134 - Banesco</option>
                      <option value="0105 - Mercantil">0105 - Mercantil</option>
                      <option value="0108 - Provincial">0108 - Provincial</option>
                      <option value="0191 - BNC">0191 - BNC</option>
                      <option value="0172 - Bancamiga">0172 - Bancamiga</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>📱 Teléfono / Cédula Cliente</label>
                    <input type="text" id="pmPhoneInput" class="input" style="padding:4px 6px;font-size:11px" placeholder="0412-1234567">
                  </div>
                  <div class="form-group">
                    <label>🛡️ Verificación en Banco</label>
                    <select id="pmVerifyStatusSelect" class="select" style="padding:4px 6px;font-size:11px;font-weight:800;color:#047857">
                      <option value="CONCILIADO">✔ CONFIRMADO EN BANCO</option>
                      <option value="PENDIENTE">⏳ PENDIENTE VERIFICAR</option>
                    </select>
                  </div>
                </div>
                <div style="margin-top:4px;display:flex;align-items:center;justify-content:space-between">
                  <div id="pmRefVerifyBadge" class="badge badge-yellow" style="font-size:10px;padding:3px 7px">
                    ⏳ Ingresa mín. 4 dígitos de referencia abajo
                  </div>
                  <span style="font-size:10px;color:#64748b">Si aún no se confirmó en la app bancaria, déjalo en 'PENDIENTE' para conciliarlo en Cierres.</span>
                </div>
              </div>

              <!-- C2P Subcontainer (Débito Directo con Clave Dinámica OTP) -->
              <div id="pmC2pContainer" style="display:none;background:#eff6ff;border:1px dashed #3b82f6;padding:7px;border-radius:6px;margin-top:4px">
                <div style="font-size:10.5px;color:#1e3a8a;font-weight:800;margin-bottom:5px">
                  ⚡ COBRO DIRECTO C2P: Solicita al cliente su Clave Dinámica generada en su banco y haz clic en debitar:
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr auto;gap:6px;align-items:end">
                  <div class="form-group">
                    <label>Banco del Cliente</label>
                    <select id="c2pBankSelect" class="select" style="padding:4px 6px;font-size:11px">
                      <option value="0102 - Venezuela">0102 - BDV</option>
                      <option value="0134 - Banesco">0134 - Banesco</option>
                      <option value="0105 - Mercantil">0105 - Mercantil</option>
                      <option value="0108 - Provincial">0108 - Provincial</option>
                      <option value="0191 - BNC">0191 - BNC</option>
                      <option value="0172 - Bancamiga">0172 - Bancamiga</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Cédula (V/E/J)</label>
                    <input type="text" id="c2pIdDocInput" class="input" style="padding:4px 6px;font-size:11px" placeholder="V-12345678">
                  </div>
                  <div class="form-group">
                    <label>Teléfono Cliente</label>
                    <input type="text" id="c2pPhoneInput" class="input" style="padding:4px 6px;font-size:11px" placeholder="04121234567">
                  </div>
                  <div class="form-group">
                    <label>Clave Dinámica (OTP)</label>
                    <input type="password" id="c2pOtpInput" class="input" maxlength="8" style="padding:4px 6px;font-size:11px;font-family:var(--font-mono);font-weight:900" placeholder="8 dígitos">
                  </div>
                  <button type="button" class="btn btn-blue btn-sm" style="padding:6px 10px;font-weight:800" onclick="window.MTPPos.executeC2pDirectPayment()">
                    ⚡ Debitar C2P
                  </button>
                </div>
              </div>
            </div>

            <!-- Datos extra y Auditoría de Punto de Venta / Biopago -->
            <div id="puntoVentaExtraFields" style="display:none;background:#f0fdf4;border:1.5px solid #86efac;padding:9px;border-radius:8px;margin-bottom:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px">
                <span style="font-size:11px;font-weight:900;color:#166534">💳 PUNTO DE VENTA / BIOPAGO (AUDITORÍA DE VOUCHER Y LOTE):</span>
                <span id="posSelectedTermInfo" class="badge badge-green" style="font-size:10px">Lote Activo: 0001</span>
              </div>
              <div style="display:grid;grid-template-columns:1.5fr 0.8fr 1.1fr 1fr;gap:6px;align-items:end">
                <div class="form-group">
                  <label>Terminal / Punto Físico</label>
                  <select id="puntoTerminalSelect" class="select" style="padding:4px 6px;font-size:11px" onchange="window.MTPPos.onTerminalSelected(this.value)">
                    <!-- Dinámico -->
                  </select>
                </div>
                <div class="form-group">
                  <label>N° Lote (Batch)</label>
                  <input type="text" id="puntoLoteInput" class="input" style="padding:4px 6px;font-size:11px;font-family:var(--font-mono);font-weight:800" placeholder="0001">
                </div>
                <div class="form-group">
                  <label>N° Aprobación / Voucher</label>
                  <input type="text" id="puntoVoucherInput" class="input" style="padding:4px 6px;font-size:11px;font-family:var(--font-mono);font-weight:900" placeholder="Ej: 049812"
                    oninput="if(this.value.trim().length>=3) document.getElementById('payRefInput').value = this.value.trim();">
                </div>
                <div class="form-group">
                  <label>Tipo Tarjeta</label>
                  <select id="puntoCardTypeSelect" class="select" style="padding:4px 6px;font-size:11px">
                    <option value="Débito TDD">Débito (TDD)</option>
                    <option value="Crédito TDC">Crédito (TDC)</option>
                    <option value="Biopago BDV">Biopago (Huella)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Inputs de Cobro -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1.3fr auto;gap:7px;align-items:end">
              <div class="form-group">
                <label>Monto Recibido ($)</label>
                <input type="number" step="0.01" id="payAmountUsd" class="input" style="font-weight:900;padding:6px"
                  oninput="window.MTPPos.syncPayInputsFromUsd(this.value)">
              </div>
              <div class="form-group">
                <label>Equivalente en Bs (BCV)</label>
                <input type="number" step="0.10" id="payAmountBs" class="input" style="font-weight:800;padding:6px"
                  oninput="window.MTPPos.syncPayInputsFromBs(this.value)">
              </div>
              <div class="form-group">
                <label>Últimos Dígitos de Referencia (o completa)</label>
                <input type="text" id="payRefInput" class="input" style="padding:6px;font-weight:800;font-family:var(--font-mono)" placeholder="Ej: ...4912 o 948210"
                  oninput="window.MTPPos.checkPagoMovilRefLive(this.value)">
              </div>
              <button class="btn btn-blue" style="padding:7px 11px" onclick="window.MTPPos.addCurrentPaymentLine()">➕ Sumar Pago</button>
            </div>

            <!-- Botones de Pago Mixto Rápido cuando falta completar la cuenta -->
            <div id="quickMixedPayBar" style="display:none;align-items:center;justify-content:space-between;background:#fef3c7;border:1px solid #f59e0b;padding:6px 10px;border-radius:6px;margin-top:7px;font-size:11.5px">
              <span id="quickMixedPayText" style="font-weight:800;color:#92400e">Falta cubrir: $0.00</span>
              <div style="display:flex;gap:5px">
                <button class="btn btn-sm btn-p" onclick="window.MTPPos.completeRemainingWith('Punto de Venta')">💳 Resto por Punto</button>
                <button class="btn btn-sm btn-blue" onclick="window.MTPPos.completeRemainingWith('Pago Móvil')">📱 Resto por Pago Móvil</button>
                <button class="btn btn-sm btn-ghost" onclick="window.MTPPos.completeRemainingWith('Efectivo Bs')">🇻🇪 Resto en Efectivo Bs</button>
              </div>
            </div>
          </div>

          <div id="chkPaymentsList" style="margin-bottom:8px"></div>

          <!-- PASO 2: CALCULADORA REALISTA VENEZOLANA DE VUELTO -->
          <div class="vuelto-panel">
            <!-- Selector de Tasa para Calcular el Vuelto en Bolívares -->
            <div class="vuelto-rate-bar">
              <span style="font-size:11px;font-weight:800;color:#cbd5e1">💱 Tasa para convertir el vuelto a Bolívares:</span>
              <div style="display:flex;gap:4px;flex-wrap:wrap" id="vueltoRateChips">
                <button type="button" class="vuelto-rate-chip active" data-rmode="BCV" onclick="window.MTPPos.setChangeRateMode('BCV')">🏦 BCV USD</button>
                <button type="button" class="vuelto-rate-chip" data-rmode="EUR" onclick="window.MTPPos.setChangeRateMode('EUR')">💶 Euro BCV</button>
                <button type="button" class="vuelto-rate-chip" data-rmode="USDT" onclick="window.MTPPos.setChangeRateMode('USDT')">🟡 Paralelo/USDT</button>
                <button type="button" class="vuelto-rate-chip" data-rmode="CUSTOM" onclick="window.MTPPos.setChangeRateMode('CUSTOM')">✏️ Otra Tasa</button>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <div id="vueltoStatusLabel" style="font-size:12px;font-weight:900;color:#a7f3d0">VUELTO TOTAL A DEVOLVER:</div>
              <span id="vueltoSquareBadge" class="badge badge-green" style="font-size:11px">✔ Cuenta cuadrada</span>
            </div>

            <div class="vuelto-grid">
              <div class="vuelto-card" id="vueltoCardUsd">
                <span>Total Vuelto en Dólares ($)</span>
                <strong id="vueltoUsdAmount">$0.00</strong>
              </div>
              <div class="vuelto-card" id="vueltoCardBs">
                <span id="vueltoCardBsLabel">Total Vuelto en Bolívares (a Tasa elegida)</span>
                <strong id="vueltoBsAmount">0,00 Bs</strong>
              </div>
            </div>

            <!-- Botonera Rápida: ¿Cuántos dólares en billete físico vas a sacar de la gaveta? -->
            <div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.18)">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">
                <span style="font-size:11px;color:#fbbf24;font-weight:800">2️⃣ ¿Cuántos Billetes USD ($) físicos vas a entregar de la gaveta? (El resto pasa a Bs automático):</span>
              </div>
              <div class="vuelto-bills-bar">
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.setPhysicalUsdChange(0)">📱 $0 (Todo en Bs / Pago Móvil)</button>
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.setPhysicalUsdChange('MAX_INT')">💵 Billetes $ Enteros + Pico en Bs</button>
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.addPhysicalUsdBill(1)">+$1</button>
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.addPhysicalUsdBill(2)">+$2</button>
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.addPhysicalUsdBill(5)">+$5</button>
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.addPhysicalUsdBill(10)">+$10</button>
                <button type="button" class="vuelto-bill-btn" onclick="window.MTPPos.addPhysicalUsdBill(20)">+$20</button>
                <button type="button" class="vuelto-bill-btn" style="color:#fca5a5" onclick="window.MTPPos.addPhysicalUsdBill(-1)">−$1</button>
              </div>

              <!-- 3 Cajas del Desglose Exacto del Vuelto -->
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px">
                <div style="background:#1e293b;padding:7px;border-radius:7px;border:1px solid #334155">
                  <span style="font-size:10px;color:#94a3b8;font-weight:800;display:block">💵 SALE EN BILLETES USD ($):</span>
                  <input type="number" step="1" min="0" id="vueltoDistUsd" class="input"
                    style="margin-top:3px;padding:5px 8px;background:#0f172a;color:#34d399;font-weight:900;font-size:14px;border-color:#475569"
                    oninput="window.MTPPos.rebalanceChangeDistribution('USD')">
                </div>
                <div style="background:#1e293b;padding:7px;border-radius:7px;border:1px solid #334155">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:10px;color:#fbbf24;font-weight:800">📱 SALE POR PAGO MÓVIL (BS):</span>
                    <button type="button" style="background:none;border:none;color:#60a5fa;font-size:9.5px;font-weight:800;cursor:pointer" onclick="window.MTPPos.switchRemainderBsTo('PM')">Usar PM</button>
                  </div>
                  <input type="number" step="0.1" min="0" id="vueltoDistBsPm" class="input"
                    style="margin-top:3px;padding:5px 8px;background:#0f172a;color:#fbbf24;font-weight:900;font-size:14px;border-color:#475569"
                    oninput="window.MTPPos.rebalanceChangeDistribution('BS_PM')">
                </div>
                <div style="background:#1e293b;padding:7px;border-radius:7px;border:1px solid #334155">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:10px;color:#cbd5e1;font-weight:800">🇻🇪 SALE EN EFECTIVO BS:</span>
                    <button type="button" style="background:none;border:none;color:#60a5fa;font-size:9.5px;font-weight:800;cursor:pointer" onclick="window.MTPPos.switchRemainderBsTo('BS_CASH')">Usar Efec. Bs</button>
                  </div>
                  <input type="number" step="0.5" min="0" id="vueltoDistBsCash" class="input"
                    style="margin-top:3px;padding:5px 8px;background:#0f172a;color:#fff;font-weight:900;font-size:14px;border-color:#475569"
                    oninput="window.MTPPos.rebalanceChangeDistribution('BS_CASH')">
                </div>
              </div>

              <!-- Nota opcional del Pago Móvil enviado como vuelto -->
              <div style="margin-top:6px;display:flex;align-items:center;gap:8px">
                <input type="text" id="vueltoPmDestNote" class="input"
                  style="padding:5px 9px;font-size:11.5px;background:#1e293b;color:#fff;border-color:#334155"
                  placeholder="📱 Opcional: Teléfono / Cédula / Banco al que se le envió el Pago Móvil de vuelto (Ej: 0414-0000000 Banesco Ref 1234)">
              </div>
            </div>
          </div>
        </div>
        <div class="modal-ft" style="padding:10px 16px">
          <button class="btn btn-ghost" onclick="document.getElementById('posCheckoutModal').classList.remove('open')">Cancelar (ESC)</button>
          <button class="btn btn-p btn-lg" onclick="window.MTPPos.finalizeSale()">✅ Confirmar Cobro y Descontar Inventario (Enter)</button>
        </div>
      </div>
    `;
  }

  function openCheckoutModal() {
    if (!cart.length) {
      MTP.toast('Agrega al menos un plato o producto antes de cobrar', 'warn');
      return;
    }
    ensureCheckoutModalUpgraded();
    currentPayments = [];
    changeRateMode = 'BCV';
    changeRemainderMode = 'PM';
    const modal = document.getElementById('posCheckoutModal');
    if (!modal) return;

    const totalUsd = getCartTotalUsd();
    const bcv = MTP.state.settings.rateBcv;
    const eur = MTP.state.settings.rateEur || bcv;
    const usdt = MTP.state.settings.rateUsdt || bcv;

    document.getElementById('chkTotalUsd').textContent = MTP.fmtUSD(totalUsd);
    document.getElementById('chkTotalBs').textContent = MTP.fmtBsRaw(totalUsd * bcv);
    const altEl = document.getElementById('chkTotalAlt');
    if (altEl) {
      const totalEur = eur > 0 ? (totalUsd * bcv) / eur : totalUsd;
      altEl.textContent = `€${totalEur.toFixed(2)} | Paralelo: ${(totalUsd * usdt).toFixed(2)} Bs`;
    }

    updateChangeRateChipsUI();
    selectPayMethod('Efectivo USD');
    renderPaymentsAndChange();
    modal.classList.add('open');
  }

  function setChangeRateMode(mode) {
    if (mode === 'CUSTOM') {
      const cur = getActiveChangeRate();
      const val = prompt('Ingresa la tasa en Bs/$ para calcular el vuelto:', String(cur.toFixed(2)));
      if (val === null) return;
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) {
        customChangeRate = n;
        changeRateMode = 'CUSTOM';
      }
    } else {
      changeRateMode = mode;
    }
    updateChangeRateChipsUI();
    renderPaymentsAndChange();
  }

  function updateChangeRateChipsUI() {
    const s = MTP.state.settings;
    document.querySelectorAll('#vueltoRateChips .vuelto-rate-chip').forEach(btn => {
      const m = btn.dataset.rmode;
      btn.classList.toggle('active', m === changeRateMode);
      if (m === 'BCV') btn.textContent = `🏦 BCV (${Number(s.rateBcv).toFixed(2)})`;
      if (m === 'EUR') btn.textContent = `💶 EUR (${Number(s.rateEur).toFixed(2)})`;
      if (m === 'USDT') btn.textContent = `🟡 USDT (${Number(s.rateUsdt).toFixed(2)})`;
      if (m === 'CUSTOM') btn.textContent = customChangeRate > 0 ? `✏️ Manual (${customChangeRate.toFixed(2)})` : '✏️ Otra Tasa';
    });
  }

  function populateCheckoutSelectors() {
    const termSelect = document.getElementById('puntoTerminalSelect');
    if (termSelect && !termSelect.children.length) {
      const terms = MTP.state.posTerminals || [];
      if (!terms.length) {
        termSelect.innerHTML = `<option value="term-pax">Bancamiga Pax A920 (0172 - Bancamiga)</option>`;
      } else {
        termSelect.innerHTML = terms.map(t => `<option value="${t.id}">${t.name} (${t.bank}) - Lote ${t.currentBatch || '0001'}</option>`).join('');
      }
      onTerminalSelected(termSelect.value);
    }

    const pmAccSelect = document.getElementById('pmDestAccountSelect');
    if (pmAccSelect && !pmAccSelect.children.length) {
      const accs = MTP.state.pagoMovilAccounts || [];
      if (!accs.length) {
        pmAccSelect.innerHTML = `<option value="acc-1">Banesco Comercio (0414-0000000 / J-50123456-0)</option>`;
      } else {
        pmAccSelect.innerHTML = accs.map(a => `<option value="${a.id}">${a.name} (${a.bank}) - ${a.phone}</option>`).join('');
      }
    }
  }

  function onTerminalSelected(termId) {
    const terms = MTP.state.posTerminals || [];
    const term = terms.find(t => t.id === termId) || terms[0];
    const loteInput = document.getElementById('puntoLoteInput');
    const infoBadge = document.getElementById('posSelectedTermInfo');
    if (term) {
      if (loteInput) loteInput.value = term.currentBatch || '0001';
      if (infoBadge) infoBadge.textContent = `${term.model || 'POS'} | Lote Activo: ${term.currentBatch || '0001'}`;
    }
  }

  function switchPmMode(mode) {
    const p2pCont = document.getElementById('pmP2pContainer');
    const c2pCont = document.getElementById('pmC2pContainer');
    const btnP2p = document.getElementById('btnPmModeP2p');
    const btnC2p = document.getElementById('btnPmModeC2p');
    if (mode === 'C2P') {
      if (p2pCont) p2pCont.style.display = 'none';
      if (c2pCont) c2pCont.style.display = 'block';
      if (btnP2p) { btnP2p.className = 'btn btn-sm btn-ghost'; }
      if (btnC2p) { btnC2p.className = 'btn btn-sm btn-p'; }
      setTimeout(() => document.getElementById('c2pOtpInput')?.focus(), 50);
    } else {
      if (p2pCont) p2pCont.style.display = 'block';
      if (c2pCont) c2pCont.style.display = 'none';
      if (btnP2p) { btnP2p.className = 'btn btn-sm btn-p'; }
      if (btnC2p) { btnC2p.className = 'btn btn-sm btn-ghost'; }
    }
  }

  function executeC2pDirectPayment() {
    const bank = document.getElementById('c2pBankSelect')?.value || '0102 - BDV';
    const idDoc = document.getElementById('c2pIdDocInput')?.value.trim();
    const phone = document.getElementById('c2pPhoneInput')?.value.trim();
    const otp = document.getElementById('c2pOtpInput')?.value.trim();
    const amountUsd = parseFloat(document.getElementById('payAmountUsd')?.value) || 0;
    const amountBs = parseFloat(document.getElementById('payAmountBs')?.value) || 0;

    const res = MTP.processC2pPayment({ bank, phone, idDoc, otp, amountBs, amountUsd });
    if (!res.success) {
      MTP.toast(res.error, 'err');
      return;
    }

    const destAccSelect = document.getElementById('pmDestAccountSelect');
    const destAccountName = destAccSelect ? destAccSelect.options[destAccSelect.selectedIndex]?.text : 'Cuenta Principal';
    const destAccountId = destAccSelect ? destAccSelect.value : '';

    currentPayments.push({
      id: 'p-c2p-' + Date.now(),
      method: 'Pago Móvil',
      subMethod: 'C2P Débito Directo',
      amountUsd: Number(amountUsd.toFixed(2)),
      amountBs: Number(amountBs.toFixed(2)),
      bank: res.bank,
      phone: res.phone,
      idDoc: res.idDoc,
      ref: res.reference,
      destAccountId,
      destAccountName,
      verifyStatus: 'CONCILIADO',
      verified: true
    });

    MTP.toast(`✔ Débito C2P exitoso: ${res.reference} por ${res.amountBs.toFixed(2)} Bs`, 'info');
    document.getElementById('c2pOtpInput').value = '';
    renderPaymentsAndChange();
  }

  function selectPayMethod(methodName) {
    const sel = document.getElementById('payMethodSelect');
    if (sel) sel.value = methodName;
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === methodName);
    });

    const pmFields = document.getElementById('pagoMovilExtraFields');
    if (pmFields) {
      pmFields.style.display = methodName === 'Pago Móvil' ? 'block' : 'none';
    }

    const puntoFields = document.getElementById('puntoVentaExtraFields');
    if (puntoFields) {
      puntoFields.style.display = methodName === 'Punto de Venta' ? 'block' : 'none';
    }

    populateCheckoutSelectors();

    const remainingUsd = Math.max(0, getCartTotalUsd() - getPaidTotalUsd());
    const bcv = MTP.state.settings.rateBcv;
    const uEl = document.getElementById('payAmountUsd');
    const bEl = document.getElementById('payAmountBs');
    if (uEl) uEl.value = remainingUsd.toFixed(2);
    if (bEl) bEl.value = (remainingUsd * bcv).toFixed(2);
  }

  function syncPayInputsFromUsd(usdVal) {
    const bcv = MTP.state.settings.rateBcv;
    const n = parseFloat(usdVal) || 0;
    const bEl = document.getElementById('payAmountBs');
    if (bEl) bEl.value = (n * bcv).toFixed(2);
  }

  function syncPayInputsFromBs(bsVal) {
    const bcv = MTP.state.settings.rateBcv;
    const n = parseFloat(bsVal) || 0;
    const uEl = document.getElementById('payAmountUsd');
    if (uEl) uEl.value = (bcv > 0 ? n / bcv : 0).toFixed(2);
  }

  function checkPagoMovilRefLive(refVal) {
    const badge = document.getElementById('pmRefVerifyBadge');
    if (!badge) return;
    const clean = String(refVal || '').trim();
    if (clean.length < 4) {
      badge.className = 'badge badge-yellow';
      badge.textContent = '⏳ Ingresa mín. 4 dígitos';
      return;
    }
    const found = MTP.findUsedPagoMovilRef ? MTP.findUsedPagoMovilRef(clean) : null;
    if (found) {
      badge.className = 'badge badge-red';
      badge.innerHTML = `🚨 REF REPETIDA HOY (Orden #${found.sale.orderNumber} - ${found.sale.customer})`;
    } else {
      badge.className = 'badge badge-green';
      badge.textContent = '✔ Referencia válida (Sin duplicado)';
    }
  }

  function promptPastePagoMovilSms() {
    const raw = prompt('Pega aquí el mensaje del SMS bancario, WhatsApp o notificación:');
    if (!raw) return;
    const parsed = MTP.parsePagoMovilSms ? MTP.parsePagoMovilSms(raw) : null;
    if (!parsed || (!parsed.reference && !parsed.amountBs)) {
      MTP.toast('No se detectó referencia o monto en el texto pegado', 'warn');
      return;
    }

    selectPayMethod('Pago Móvil');
    const bcv = MTP.state.settings.rateBcv;

    if (parsed.reference) {
      document.getElementById('payRefInput').value = parsed.reference;
      checkPagoMovilRefLive(parsed.reference);
    }
    if (parsed.amountBs > 0) {
      document.getElementById('payAmountBs').value = parsed.amountBs.toFixed(2);
      document.getElementById('payAmountUsd').value = (parsed.amountBs / bcv).toFixed(2);
    }
    if (parsed.bank) {
      const bSel = document.getElementById('pmBankSelect');
      if (bSel) {
        for (let i = 0; i < bSel.options.length; i++) {
          if (bSel.options[i].value.includes(parsed.bank) || parsed.bank.includes(bSel.options[i].value)) {
            bSel.selectedIndex = i;
            break;
          }
        }
      }
    }
    if (parsed.phone) {
      document.getElementById('pmPhoneInput').value = parsed.phone;
    }

    MTP.toast(`Pago Móvil detectado: Ref #${parsed.reference || '—'} por ${parsed.amountBs.toFixed(2)} Bs`);
  }

  // Cuando el cajero toca un billete rápido ($1, $5, $10, $20, $50, $100, Exacto)
  function quickSetSingleBill(billUsd) {
    const bcv = MTP.state.settings.rateBcv;
    const totalUsd = getCartTotalUsd();
    if (billUsd === 'EXACT') {
      const rem = Math.max(0, totalUsd - getPaidTotalUsd());
      const amount = rem > 0 ? rem : totalUsd;
      if (rem === 0) currentPayments = [];
      const method = document.getElementById('payMethodSelect')?.value || 'Efectivo USD';
      currentPayments.push({
        id: 'p-' + Date.now(),
        method,
        amountUsd: Number(amount.toFixed(2)),
        amountBs: Number((amount * bcv).toFixed(2)),
        ref: 'Pago Exacto',
        verified: true
      });
    } else {
      const n = Number(billUsd);
      // Si ya había un único billete y el cajero toca otro billete (ej. se equivocó entre $10 y $20), lo reemplaza si superaba la cuenta
      if (currentPayments.length === 1 && currentPayments[0].method === 'Efectivo USD' && currentPayments[0].amountUsd >= totalUsd) {
        currentPayments = [];
      }
      currentPayments.push({
        id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        method: 'Efectivo USD',
        amountUsd: Number(n.toFixed(2)),
        amountBs: Number((n * bcv).toFixed(2)),
        ref: `Billete $${n}`,
        verified: true
      });
    }
    renderPaymentsAndChange();
  }

  function completeRemainingWith(methodName) {
    const bcv = MTP.state.settings.rateBcv;
    const remUsd = Math.max(0, getCartTotalUsd() - getPaidTotalUsd());
    if (remUsd <= 0.009) return;

    if (methodName === 'Pago Móvil') {
      selectPayMethod('Pago Móvil');
      document.getElementById('payRefInput')?.focus();
      MTP.toast(`Ingresa los últimos 4 dígitos del Pago Móvil por ${(remUsd * bcv).toFixed(2)} Bs y pulsa Sumar Pago`, 'warn');
      return;
    }

    currentPayments.push({
      id: 'p-' + Date.now(),
      method: methodName,
      amountUsd: Number(remUsd.toFixed(2)),
      amountBs: Number((remUsd * bcv).toFixed(2)),
      ref: 'Resto exacto',
      verified: true
    });
    renderPaymentsAndChange();
  }

  function addCurrentPaymentLine() {
    const method = document.getElementById('payMethodSelect').value;
    const amountUsd = parseFloat(document.getElementById('payAmountUsd').value) || 0;
    const amountBs = parseFloat(document.getElementById('payAmountBs').value) || 0;
    let ref = document.getElementById('payRefInput').value.trim();

    if (amountUsd <= 0) {
      MTP.toast('Ingresa un monto mayor a 0', 'warn');
      return;
    }

    let extraData = {};

    if (method === 'Pago Móvil') {
      if (!ref || ref.length < 4) {
        MTP.toast('Para Pago Móvil ingresa al menos los últimos 4 dígitos de la referencia bancaria', 'err');
        return;
      }
      if (MTP.isPagoMovilRefUsed(ref)) {
        MTP.toast(`¡Alerta! La referencia de Pago Móvil #${ref} ya fue registrada en otro ticket hoy`, 'err');
        return;
      }
      const destAccSelect = document.getElementById('pmDestAccountSelect');
      const destAccountName = destAccSelect ? destAccSelect.options[destAccSelect.selectedIndex]?.text : 'Cuenta Principal';
      const destAccountId = destAccSelect ? destAccSelect.value : '';
      const verifyStatus = document.getElementById('pmVerifyStatusSelect')?.value || 'CONCILIADO';
      const bank = document.getElementById('pmBankSelect')?.value || '';
      const phone = document.getElementById('pmPhoneInput')?.value.trim() || '';

      extraData = {
        bank,
        phone,
        destAccountId,
        destAccountName,
        verifyStatus,
        verified: verifyStatus === 'CONCILIADO'
      };
    } else if (method === 'Punto de Venta') {
      const termSelect = document.getElementById('puntoTerminalSelect');
      const termId = termSelect ? termSelect.value : '';
      const termObj = (MTP.state.posTerminals || []).find(t => t.id === termId) || (MTP.state.posTerminals || [])[0];
      const lote = document.getElementById('puntoLoteInput')?.value.trim() || termObj?.currentBatch || '0001';
      const voucher = document.getElementById('puntoVoucherInput')?.value.trim() || ref;
      const cardType = document.getElementById('puntoCardTypeSelect')?.value || 'Débito TDD';

      if (!voucher || voucher.length < 3) {
        MTP.toast('Ingresa el N° de Aprobación / Voucher impreso por el Punto de Venta', 'warn');
        return;
      }

      ref = `Voucher #${voucher} (Lote ${lote})`;
      extraData = {
        terminalId: termObj ? termObj.id : 'term-default',
        terminalName: termObj ? termObj.name : 'Punto POS',
        bank: termObj ? termObj.bank : 'Banco Adquirente',
        lote,
        voucher,
        cardType,
        verified: true
      };
    }

    currentPayments.push(Object.assign({
      id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      method,
      amountUsd: Number(amountUsd.toFixed(2)),
      amountBs: Number(amountBs.toFixed(2)),
      ref: ref || method,
      verified: true
    }, extraData));

    document.getElementById('payRefInput').value = '';
    const vInput = document.getElementById('puntoVoucherInput');
    if (vInput) vInput.value = '';
    renderPaymentsAndChange();
  }

  function removePaymentLine(payId) {
    currentPayments = currentPayments.filter(p => p.id !== payId);
    renderPaymentsAndChange();
  }

  function getPaidTotalUsd() {
    return currentPayments.reduce((acc, p) => acc + p.amountUsd, 0);
  }

  function setPhysicalUsdChange(modeOrAmount) {
    const totalChangeUsd = Math.max(0, getPaidTotalUsd() - getCartTotalUsd());
    const distUsdEl = document.getElementById('vueltoDistUsd');
    if (!distUsdEl) return;

    if (modeOrAmount === 'MAX_INT') {
      // Máximo de billetes enteros de dólar (sin centavos, porque en Venezuela no circulan monedas de centavo USD)
      distUsdEl.value = String(Math.floor(totalChangeUsd + 0.001));
    } else {
      const v = Math.min(Math.floor(totalChangeUsd + 0.001), Math.max(0, Number(modeOrAmount) || 0));
      distUsdEl.value = String(v);
    }
    rebalanceChangeDistribution('USD');
  }

  function addPhysicalUsdBill(delta) {
    const totalChangeUsd = Math.max(0, getPaidTotalUsd() - getCartTotalUsd());
    const distUsdEl = document.getElementById('vueltoDistUsd');
    if (!distUsdEl) return;
    const cur = parseInt(distUsdEl.value, 10) || 0;
    const next = Math.min(Math.floor(totalChangeUsd + 0.001), Math.max(0, cur + delta));
    distUsdEl.value = String(next);
    rebalanceChangeDistribution('USD');
  }

  function switchRemainderBsTo(target) {
    changeRemainderMode = target; // 'PM' or 'BS_CASH'
    rebalanceChangeDistribution('USD');
  }

  function renderPaymentsAndChange() {
    const totalUsd = getCartTotalUsd();
    const paidUsd = getPaidTotalUsd();
    const bcv = MTP.state.settings.rateBcv;
    const chgRate = getActiveChangeRate();
    const diffUsd = paidUsd - totalUsd;

    const listEl = document.getElementById('chkPaymentsList');
    if (listEl) {
      if (!currentPayments.length) {
        listEl.innerHTML = `<div style="padding:7px;color:var(--txt-muted);font-size:11.5px;text-align:center;background:#fff;border:1px dashed var(--border);border-radius:7px">Toca arriba el billete recibido (<strong>$5, $10, $20, $50, Exacto</strong>) o suma el método de pago.</div>`;
      } else {
        listEl.innerHTML = currentPayments.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#fff;border:1px solid var(--border);border-radius:7px;margin-bottom:4px;font-size:12px">
            <div>
              <strong>${p.method}</strong>
              ${p.terminalName ? `<span class="badge badge-purple" style="font-size:10px;margin-left:4px">POS: ${p.terminalName} (Lote ${p.lote || '—'})</span>` : ''}
              ${p.cardType ? `<span class="badge badge-blue" style="font-size:10px;margin-left:2px">${p.cardType}</span>` : ''}
              ${p.destAccountName ? `<span class="badge badge-amber" style="font-size:10px;margin-left:4px">Cta: ${p.destAccountName}</span>` : ''}
              ${p.verifyStatus === 'PENDIENTE' 
                ? `<span class="badge badge-yellow" style="font-size:10px;margin-left:2px">⏳ PENDIENTE VERIFICAR</span>` 
                : `<span class="badge badge-green" style="font-size:10px;margin-left:2px">✔ ${p.ref}</span>`}
              ${p.bank ? `<span style="font-size:11px;color:var(--txt-sec)">(${p.bank} ${p.phone || ''})</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="text-align:right">
                <strong>${MTP.fmtUSD(p.amountUsd)}</strong>
                <span style="font-size:11px;color:var(--primary);font-weight:700;margin-left:4px">(${p.amountBs.toFixed(2)} Bs)</span>
              </div>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:1px 6px" onclick="window.MTPPos.removePaymentLine('${p.id}')">✕</button>
            </div>
          </div>
        `).join('');
      }
    }

    const remUsd = Math.max(0, totalUsd - paidUsd);
    const uEl = document.getElementById('payAmountUsd');
    const bEl = document.getElementById('payAmountBs');
    if (uEl) uEl.value = remUsd.toFixed(2);
    if (bEl) bEl.value = (remUsd * bcv).toFixed(2);

    // Barra de Pago Mixto Rápido cuando el cliente dio una parte (ej. $5) y falta otra parte
    const mixedBar = document.getElementById('quickMixedPayBar');
    const mixedTxt = document.getElementById('quickMixedPayText');
    if (mixedBar && mixedTxt) {
      if (paidUsd > 0 && remUsd > 0.009) {
        mixedBar.style.display = 'flex';
        mixedTxt.textContent = `⚡ Pago Mixto: Faltan cubrir ${MTP.fmtUSD(remUsd)} (${(remUsd * bcv).toFixed(2)} Bs):`;
      } else {
        mixedBar.style.display = 'none';
      }
    }

    const statusLabel = document.getElementById('vueltoStatusLabel');
    const changeUsdEl = document.getElementById('vueltoUsdAmount');
    const changeBsEl = document.getElementById('vueltoBsAmount');
    const cardBsLabel = document.getElementById('vueltoCardBsLabel');
    const card1 = document.getElementById('vueltoCardUsd');
    const card2 = document.getElementById('vueltoCardBs');
    const distUsdInput = document.getElementById('vueltoDistUsd');
    const distBsCashInput = document.getElementById('vueltoDistBsCash');
    const distBsPmInput = document.getElementById('vueltoDistBsPm');

    if (cardBsLabel) {
      cardBsLabel.textContent = `Equivalente Vuelto en Bs (Tasa ${chgRate.toFixed(2)} Bs/$)`;
    }

    if (diffUsd < -0.009) {
      const faltaUsd = Math.abs(diffUsd);
      const faltaBs = faltaUsd * bcv;
      if (statusLabel) statusLabel.innerHTML = `⏳ FALTA POR COBRAR AL CLIENTE:`;
      if (changeUsdEl) changeUsdEl.textContent = MTP.fmtUSD(faltaUsd);
      if (changeBsEl) changeBsEl.textContent = MTP.fmtBsRaw(faltaBs);
      if (card1) card1.classList.add('faltante');
      if (card2) card2.classList.add('faltante');
      if (distUsdInput) { distUsdInput.value = '0'; distBsCashInput.value = '0.00'; distBsPmInput.value = '0.00'; }
      updateChangeSquareBadge();
    } else if (diffUsd > 0.009) {
      const vueltoUsd = diffUsd;
      const vueltoBs = vueltoUsd * chgRate;
      if (statusLabel) statusLabel.innerHTML = `✅ VUELTO TOTAL A ENTREGAR AL CLIENTE:`;
      if (changeUsdEl) changeUsdEl.textContent = MTP.fmtUSD(vueltoUsd);
      if (changeBsEl) changeBsEl.textContent = MTP.fmtBsRaw(vueltoBs);
      if (card1) card1.classList.remove('faltante');
      if (card2) card2.classList.remove('faltante');

      // Por defecto en Venezuela: billetes enteros en USD ($) + los centavos/pico por Pago Móvil en Bs
      const wholeUsd = Math.floor(vueltoUsd + 0.001);
      const remBs = Math.max(0, (vueltoUsd - wholeUsd) * chgRate);
      if (distUsdInput) {
        distUsdInput.value = String(wholeUsd);
        if (changeRemainderMode === 'BS_CASH') {
          distBsCashInput.value = remBs.toFixed(2);
          distBsPmInput.value = '0.00';
        } else {
          distBsPmInput.value = remBs.toFixed(2);
          distBsCashInput.value = '0.00';
        }
      }
      updateChangeSquareBadge();
    } else {
      if (statusLabel) statusLabel.innerHTML = `✅ CUENTA CUADRADA AL CENTAVO (SIN VUELTO):`;
      if (changeUsdEl) changeUsdEl.textContent = '$0.00';
      if (changeBsEl) changeBsEl.textContent = '0,00 Bs';
      if (card1) card1.classList.remove('faltante');
      if (card2) card2.classList.remove('faltante');
      if (distUsdInput) { distUsdInput.value = '0'; distBsCashInput.value = '0.00'; distBsPmInput.value = '0.00'; }
      updateChangeSquareBadge();
    }
  }

  function rebalanceChangeDistribution(changedField) {
    const totalUsd = getCartTotalUsd();
    const paidUsd = getPaidTotalUsd();
    const chgRate = getActiveChangeRate();
    const totalChangeUsd = Math.max(0, paidUsd - totalUsd);

    const distUsdEl = document.getElementById('vueltoDistUsd');
    const distBsCashEl = document.getElementById('vueltoDistBsCash');
    const distBsPmEl = document.getElementById('vueltoDistBsPm');
    if (!distUsdEl || !distBsCashEl || !distBsPmEl) return;

    if (changedField === 'USD') {
      const usdGiven = Math.min(totalChangeUsd, Math.max(0, parseFloat(distUsdEl.value) || 0));
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * chgRate);
      if (changeRemainderMode === 'BS_CASH') {
        distBsCashEl.value = remBs.toFixed(2);
        distBsPmEl.value = '0.00';
      } else {
        distBsPmEl.value = remBs.toFixed(2);
        distBsCashEl.value = '0.00';
      }
    } else if (changedField === 'BS_PM') {
      const usdGiven = Math.max(0, parseFloat(distUsdEl.value) || 0);
      const pmBs = Math.max(0, parseFloat(distBsPmEl.value) || 0);
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * chgRate - pmBs);
      distBsCashEl.value = remBs.toFixed(2);
    } else if (changedField === 'BS_CASH') {
      const usdGiven = Math.max(0, parseFloat(distUsdEl.value) || 0);
      const cashBs = Math.max(0, parseFloat(distBsCashEl.value) || 0);
      const remBs = Math.max(0, (totalChangeUsd - usdGiven) * chgRate - cashBs);
      distBsPmEl.value = remBs.toFixed(2);
    }
    updateChangeSquareBadge();
  }

  function updateChangeSquareBadge() {
    const badge = document.getElementById('vueltoSquareBadge');
    if (!badge) return;
    const totalUsd = getCartTotalUsd();
    const paidUsd = getPaidTotalUsd();
    const chgRate = getActiveChangeRate();
    const totalChangeUsd = Math.max(0, paidUsd - totalUsd);

    if (paidUsd + 0.009 < totalUsd) {
      badge.className = 'badge badge-red';
      badge.textContent = `⏳ Falta cobrar ${MTP.fmtUSD(totalUsd - paidUsd)}`;
      return;
    }
    if (totalChangeUsd <= 0.009) {
      badge.className = 'badge badge-green';
      badge.textContent = '✔ Pago Exacto (Sin vuelto)';
      return;
    }

    const usdGiven = parseFloat(document.getElementById('vueltoDistUsd')?.value) || 0;
    const bsPmGiven = parseFloat(document.getElementById('vueltoDistBsPm')?.value) || 0;
    const bsCashGiven = parseFloat(document.getElementById('vueltoDistBsCash')?.value) || 0;
    const assignedUsd = usdGiven + (chgRate > 0 ? (bsPmGiven + bsCashGiven) / chgRate : 0);
    const diff = totalChangeUsd - assignedUsd;

    if (Math.abs(diff) <= 0.03) {
      badge.className = 'badge badge-green';
      badge.textContent = '✔ Vuelto cuadrado al centavo';
    } else if (diff > 0) {
      badge.className = 'badge badge-yellow';
      badge.textContent = `⚠️ Faltan asignar ${MTP.fmtUSD(diff)} (${(diff * chgRate).toFixed(2)} Bs)`;
    } else {
      badge.className = 'badge badge-red';
      badge.textContent = `🚨 Exceso de vuelto por ${MTP.fmtUSD(Math.abs(diff))}`;
    }
  }

  function finalizeSale() {
    const totalUsd = getCartTotalUsd();
    const bcv = MTP.state.settings.rateBcv;
    const chgRate = getActiveChangeRate();

    if (!currentPayments.length) {
      const method = document.getElementById('payMethodSelect').value || 'Efectivo USD';
      let ref = document.getElementById('payRefInput').value.trim();
      let extraData = {};

      if (method === 'Pago Móvil') {
        if (!ref || ref.length < 4) {
          MTP.toast('Ingresa los últimos dígitos de la referencia del Pago Móvil', 'err');
          return;
        }
        if (MTP.isPagoMovilRefUsed(ref)) {
          MTP.toast(`La referencia de Pago Móvil #${ref} ya fue usada hoy`, 'err');
          return;
        }
        const destAccSelect = document.getElementById('pmDestAccountSelect');
        extraData = {
          bank: document.getElementById('pmBankSelect')?.value || '',
          phone: document.getElementById('pmPhoneInput')?.value.trim() || '',
          destAccountId: destAccSelect ? destAccSelect.value : '',
          destAccountName: destAccSelect ? destAccSelect.options[destAccSelect.selectedIndex]?.text : 'Cuenta Principal',
          verifyStatus: document.getElementById('pmVerifyStatusSelect')?.value || 'CONCILIADO',
          verified: (document.getElementById('pmVerifyStatusSelect')?.value || 'CONCILIADO') === 'CONCILIADO'
        };
      } else if (method === 'Punto de Venta') {
        const termSelect = document.getElementById('puntoTerminalSelect');
        const termId = termSelect ? termSelect.value : '';
        const termObj = (MTP.state.posTerminals || []).find(t => t.id === termId) || (MTP.state.posTerminals || [])[0];
        const lote = document.getElementById('puntoLoteInput')?.value.trim() || termObj?.currentBatch || '0001';
        const voucher = document.getElementById('puntoVoucherInput')?.value.trim() || ref;
        const cardType = document.getElementById('puntoCardTypeSelect')?.value || 'Débito TDD';

        if (!voucher || voucher.length < 3) {
          MTP.toast('Ingresa el N° de Voucher / Aprobación del Punto de Venta', 'warn');
          return;
        }
        ref = `Voucher #${voucher} (Lote ${lote})`;
        extraData = {
          terminalId: termObj ? termObj.id : 'term-default',
          terminalName: termObj ? termObj.name : 'Punto POS',
          bank: termObj ? termObj.bank : 'Banco Adquirente',
          lote,
          voucher,
          cardType,
          verified: true
        };
      }

      const enteredUsd = parseFloat(document.getElementById('payAmountUsd').value) || totalUsd;
      currentPayments.push(Object.assign({
        id: 'p-auto',
        method,
        amountUsd: Number(enteredUsd.toFixed(2)),
        amountBs: Number((enteredUsd * bcv).toFixed(2)),
        ref: ref || 'Pago directo',
        verified: true
      }, extraData));
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
    const pmDestNote = document.getElementById('vueltoPmDestNote')?.value.trim() || '';

    const parts = [];
    if (usdCashGiven > 0) parts.push(`$${usdCashGiven.toFixed(2)} Efectivo USD`);
    if (bsPmGiven > 0) parts.push(`${bsPmGiven.toFixed(2)} Bs Pago Móvil${pmDestNote ? ' (' + pmDestNote + ')' : ''}`);
    if (bsCashGiven > 0) parts.push(`${bsCashGiven.toFixed(2)} Bs Efectivo`);
    const breakdown = parts.length ? parts.join(' + ') : 'Sin vuelto (Exacto)';

    const customerInput = document.getElementById('posCustomerInput');
    const customer = customerInput && customerInput.value.trim() ? customerInput.value.trim() : 'Mostrador Rápido';

    const recorded = MTP.recordSale({
      customer,
      cashier: location.pathname.includes('/caja/') ? 'Cajero Turno' : 'Admin / Caja',
      totalUsd,
      items: cart.map(c => ({
        refId: c.refId,
        code: c.code,
        name: c.name,
        qty: c.qty,
        unit: c.unit,
        priceUsd: c.priceUsd,
        subtotalUsd: Number((c.qty * c.priceUsd).toFixed(2)),
        isDish: c.isDish,
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
        pmDestNote,
        breakdown
      }
    });

    document.getElementById('posCheckoutModal').classList.remove('open');
    cart = [];
    replacingCartId = null;
    updateReplaceBanner();
    if (customerInput) customerInput.value = '';
    renderTicket();
    renderPosGrid();
    renderShortcutsAndHeldBar();

    MTP.toast(`¡Orden #${recorded.orderNumber} registrada! Inventario y gaveta actualizados.`);
    showPrintedTicketsModal(recorded);
  }

  function openQuickKitchenTicketPreview() {
    if (!cart.length) {
      MTP.toast('El ticket está vacío', 'warn');
      return;
    }
    const bcv = MTP.state.settings.rateBcv;
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
        note: c.note
      })),
      payments: [{ method: 'Por Cobrar', amountUsd: totalUsd, amountBs: totalUsd * bcv }],
      changeGiven: { totalChangeUsd: 0, totalChangeBs: 0, breakdown: '—' }
    };
    showPrintedTicketsModal(previewOrder);
  }

  function showPrintedTicketsModal(sale) {
    const modal = document.getElementById('posTicketPrintModal');
    if (!modal) return;

    const dishesOnly = sale.items.filter(i => i.isDish);
    const dateStr = new Date(sale.createdAt).toLocaleString('es-VE');

    const kitchenHtml = dishesOnly.length
      ? dishesOnly.map(d => `
          <div style="padding:5px 0;border-bottom:1px dashed #000">
            <div style="font-size:14px;font-weight:900">${d.qty}x [#${d.code}] ${d.name}</div>
            ${d.note ? `<div style="font-size:12px;font-weight:bold;background:#000;color:#fff;padding:2px 5px;margin-top:2px">NOTA: ${d.note}</div>` : ''}
          </div>
        `).join('')
      : `<div style="padding:10px 0;text-align:center;color:#475569">Solo productos de abasto/bebidas (Despacho por mostrador)</div>`;

    const itemsHtml = sale.items.map(i => `
      <div style="display:flex;justify-content:space-between;margin:3px 0">
        <span>${i.qty}x ${i.name.slice(0, 23)}</span>
        <strong>$${(i.qty * i.priceUsd).toFixed(2)}</strong>
      </div>
    `).join('');

    const paymentsHtml = (sale.payments || []).map(p => `
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span>${p.method} (${p.ref || ''}):</span>
        <span>$${Number(p.amountUsd).toFixed(2)} (${Number(p.amountBs).toFixed(2)} Bs)</span>
      </div>
    `).join('');

    const bcv = Number(sale.rateBcv || MTP.state.settings.rateBcv);
    const fiscal = sale.fiscalData || {
      fiscalInvoiceNumber: String(sale.orderNumber).padStart(8, '0'),
      controlNumber: '00-' + String(sale.orderNumber).padStart(8, '0'),
      serialNumber: MTP.state.settings.fiscalConfig?.serialNumber || 'Z4A2098124',
      reportZ: MTP.state.settings.fiscalConfig?.lastReportZ || 142,
      customerRif: sale.customerRif || 'V-00000000',
      taxExemptBs: 0,
      taxableBaseBs: sale.totalBs,
      ivaBs: sale.totalBs * 0.16,
      igtfBs: 0,
      totalBs: sale.totalBs,
      totalUsd: sale.totalUsd
    };

    const fiscalItemsHtml = sale.items.map(i => {
      const itemBs = (i.qty * i.priceUsd * bcv).toFixed(2);
      const taxTag = i.taxType === 'E' ? '(E)' : '(G 16%)';
      return `
        <div style="display:flex;justify-content:space-between;margin:2px 0;font-size:11px">
          <span>${i.qty}x ${i.name.slice(0, 22)} <strong>${taxTag}</strong></span>
          <strong>${itemBs} Bs</strong>
        </div>
      `;
    }).join('');

    document.getElementById('printModalContent').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px">
        <!-- TICKET 1: FACTURA FISCAL HOMOLOGADA (FORMATO LEGAL SENIAT) -->
        <div class="thermal-ticket" style="border:2px solid #0f172a;background:#fff">
          <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:5px;margin-bottom:5px">
            <div style="font-weight:900;font-size:13px">${MTP.state.settings.storeName}</div>
            <div style="font-size:10.5px;font-weight:bold">RIF: ${MTP.state.settings.rif}</div>
            <div style="font-size:9.5px;color:#334155">${MTP.state.settings.address} · Tel: ${MTP.state.settings.phone}</div>
            <div style="font-size:10px;background:#0f172a;color:#fff;padding:2px 4px;margin:3px 0;font-weight:bold">
              FACTURA FISCAL HOMOLOGADA
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:bold">
              <span>FACTURA: #${fiscal.fiscalInvoiceNumber}</span>
              <span>CONTROL: ${fiscal.controlNumber}</span>
            </div>
            <div style="font-size:10px;text-align:left;margin-top:3px">
              <div>FECHA: ${dateStr}</div>
              <div>CLIENTE: <strong>${sale.customer}</strong></div>
              <div>RIF / CI: <strong>${fiscal.customerRif || 'V-00000000'}</strong></div>
            </div>
          </div>

          <div style="margin-bottom:4px">
            ${fiscalItemsHtml}
          </div>

          <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;margin:5px 0;font-size:10.5px">
            <div style="display:flex;justify-content:space-between">
              <span>MONTO EXENTO (E):</span>
              <span>${Number(fiscal.taxExemptBs || 0).toFixed(2)} Bs</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span>BASE IMPONIBLE (G 16%):</span>
              <span>${Number(fiscal.taxableBaseBs || 0).toFixed(2)} Bs</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-weight:bold">
              <span>IVA (16.00%):</span>
              <span>${Number(fiscal.ivaBs || 0).toFixed(2)} Bs</span>
            </div>
            ${Number(fiscal.igtfBs || 0) > 0 ? `
              <div style="display:flex;justify-content:space-between;color:#1e40af;font-weight:bold">
                <span>PERCEPCIÓN IGTF (3% DIVISAS):</span>
                <span>${Number(fiscal.igtfBs).toFixed(2)} Bs</span>
              </div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;font-size:13.5px;font-weight:900;margin-top:3px;border-top:1px solid #000;padding-top:2px">
              <span>TOTAL A PAGAR:</span>
              <span>${Number(fiscal.totalBs || sale.totalBs).toFixed(2)} Bs</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#047857">
              <span>REF. DIVISAS:</span>
              <span>$${Number(fiscal.totalUsd || sale.totalUsd).toFixed(2)} (BCV: ${bcv.toFixed(2)} Bs/$)</span>
            </div>
          </div>

          <div style="text-align:center;font-size:9.5px;margin-top:4px">
            <div style="font-weight:900;letter-spacing:1px">[ SENIAT ]</div>
            <div>SERIAL FISCAL: <strong>${fiscal.serialNumber}</strong></div>
            <div>REPORTE Z N°: <strong>#${fiscal.reportZ}</strong></div>
            <div style="margin-top:6px;display:flex;gap:4px;justify-content:center">
              <button class="btn btn-p btn-sm" style="padding:2px 8px;font-size:10px" onclick="window.print()">🖨️ Imprimir Fiscal</button>
              <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:10px" onclick="MTP.downloadFiscalCommandFile(window.MTPPos.getLastRenderedSale())">📄 Descargar FACTURA.TXT</button>
            </div>
          </div>
        </div>

        <!-- TICKET 2: COMANDA DE COCINA / BARRA -->
        <div class="thermal-ticket">
          <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
            <div style="font-size:10.5px;font-weight:bold">COMANDA DE COCINA / BARRA</div>
            <div style="font-size:24px;font-weight:900">ORDEN #${sale.orderNumber}</div>
            <div style="font-size:11.5px">Cliente: <strong>${sale.customer}</strong></div>
          </div>
          ${kitchenHtml}
          <div style="text-align:center;margin-top:8px;font-size:10.5px;font-weight:bold">*** CONTROL DE DESPACHO COCINA ***</div>
        </div>

        <!-- TICKET 3: NOTA DE DESPACHO INTERNA -->
        <div class="thermal-ticket">
          <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px">
            <div style="font-weight:900;font-size:13.5px">${MTP.state.settings.storeName}</div>
            <div style="font-size:10px;background:#000;color:#fff;padding:2px 4px;margin:3px 0;font-weight:bold">NOTA DE DESPACHO · CONTROL INTERNO</div>
            <div style="font-size:10.5px">Orden #${sale.orderNumber} · ${dateStr}</div>
            <div style="font-size:10.5px">Cliente: ${sale.customer} · BCV: ${bcv.toFixed(2)} Bs/$</div>
          </div>
          ${itemsHtml}
          <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:5px 0;margin:6px 0">
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900">
              <span>TOTAL USD:</span>
              <span>${MTP.fmtUSD(sale.totalUsd)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900">
              <span>TOTAL BS:</span>
              <span>${MTP.fmtBsRaw(sale.totalBs)}</span>
            </div>
          </div>
          <div style="margin-bottom:5px">
            <div style="font-weight:bold;font-size:11px;margin-bottom:2px">PAGOS REGISTRADOS:</div>
            ${paymentsHtml}
          </div>
          <div style="background:#f1f5f9;padding:5px;border-radius:4px;font-size:11px">
            <div><strong>VUELTO:</strong> ${MTP.fmtUSD(sale.changeGiven.totalChangeUsd)} (${MTP.fmtBsRaw(sale.changeGiven.totalChangeBs)})</div>
            <div>Entrega: ${sale.changeGiven.breakdown}</div>
          </div>
          <div style="font-size:9.5px;text-align:center;margin-top:6px;color:#475569">
            Documento administrativo interno.
          </div>
        </div>
      </div>
    `;

    lastRenderedSale = sale;
    modal.classList.add('open');
  }

  window.MTPPos = {
    initPOS,
    setCategory,
    openGroupModal,
    closeVariantModal,
    toggleQuickNewVarietyBox,
    saveQuickNewVariety,
    refreshActiveVariantModal,
    holdCurrentCart,
    restoreHeldOrder,
    addOrReplaceDish,
    addOrReplaceInventory,
    startReplaceLine,
    cancelReplaceMode,
    changeCartQty,
    editExactQty,
    removeCartLine,
    addKitchenNote,
    clearCart,
    openCheckoutModal,
    setChangeRateMode,
    selectPayMethod,
    syncPayInputsFromUsd,
    syncPayInputsFromBs,
    checkPagoMovilRefLive,
    promptPastePagoMovilSms,
    quickSetSingleBill,
    completeRemainingWith,
    setPhysicalUsdChange,
    addPhysicalUsdBill,
    switchRemainderBsTo,
    addCurrentPaymentLine,
    removePaymentLine,
    rebalanceChangeDistribution,
    finalizeSale,
    openQuickKitchenTicketPreview,
    handleCodeOrSearchSubmit,
    onTerminalSelected,
    switchPmMode,
    executeC2pDirectPayment,
    populateCheckoutSelectors,
    getLastRenderedSale: () => lastRenderedSale
  };

  document.addEventListener('DOMContentLoaded', initPOS);
})();
