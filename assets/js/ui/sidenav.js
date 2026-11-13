/* ==========================================================================
   MI-TIENDA-POS — Navegación Lateral Sencilla & Profesional v7
   - Navegación directa, limpia y sin parches visuales
   - Cero botones flotantes que tapen la vista
   - Compras rápidas de insumos conectadas a cocina y gaveta
   ========================================================================== */
(function () {
  const COLLAPSE_KEY = 'mtp_sidebar_collapsed';
  const MORE_KEY = 'mtp_sidebar_more_open';

  function initSidebarState() {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved === '1') {
        document.body.classList.add('aside-collapsed');
      } else {
        document.body.classList.remove('aside-collapsed');
      }
    } catch (_) {}
  }

  function toggleSidebarCollapse() {
    const isCollapsed = document.body.classList.toggle('aside-collapsed');
    try {
      localStorage.setItem(COLLAPSE_KEY, isCollapsed ? '1' : '0');
    } catch (_) {}
    renderSidebar();
  }

  function toggleMoreOptions() {
    const wrap = document.getElementById('asideMoreLinksWrap');
    const chevron = document.getElementById('asideMoreChevron');
    const isOpening = wrap ? wrap.style.display === 'none' : false;
    if (wrap) wrap.style.display = isOpening ? 'flex' : 'none';
    if (chevron) chevron.textContent = isOpening ? '▾' : '▸';
    try {
      localStorage.setItem(MORE_KEY, isOpening ? '1' : '0');
    } catch (_) {}
  }

  /* MODAL RÁPIDO DE COMPRAS DE COCINA Y GASTOS OPERATIVOS CON PRESENCIA LUMÍNICA */
  function ensureQuickExpenseModal() {
    if (document.getElementById('globalExpenseModal')) return;
    const modal = document.createElement('div');
    modal.id = 'globalExpenseModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:580px;border:1px solid #E2E8F0;box-shadow:0 20px 44px rgba(15,23,42,0.16)">
        <div class="modal-hd" style="background:#FFFFFF;color:#0F172A;border-radius:16px 16px 0 0;padding:14px 18px;border-bottom:1px solid #E2E8F0">
          <div>
            <h3 style="color:#0F172A;margin:0;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px">
              ${window.MTPIcons ? window.MTPIcons.get('kitchen', { size: 18 }) : '🍲'} Registrar Compra de Cocina o Gasto
            </h3>
            <p style="color:#64748B;font-size:12.5px;margin:3px 0 0 0;font-weight:500">Suma kilos a cocina y descuenta el pago del dinero en gaveta</p>
          </div>
          <button class="btn btn-secondary btn-sm" style="width:36px;height:36px;padding:0;font-size:14px" onclick="window.MTPSidebar.closeExpenseModal()">✕</button>
        </div>
        <div class="modal-bd" style="padding:16px">
          <div style="margin-bottom:12px;background:#F8FAFC;padding:10px 12px;border-radius:8px;border:1px solid #E2E8F0">
            <span style="font-size:12px;font-weight:800;color:#0F172A;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.03em">⚡ Compras frecuentes de 1 solo toque:</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillKitchenPreset('ins-alinos', 5, 12.00, 'Compra 5kg aliños frescos para guisos')">🧅 Aliños (5 kg · $12)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillKitchenPreset('ins-papa', 25, 33.75, 'Saco de papa 25kg para empanadas/comida')">🥔 Saco Papa (25 kg · $33.75)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillKitchenPreset('ins-carne-mechada', 5, 34.00, '5kg carne para mechar/guisar')">🥩 Carne Res (5 kg · $34)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillKitchenPreset('ins-queso-cocina', 3, 16.20, '3kg queso blanco llanero para relleno')">🧀 Queso (3 kg · $16.20)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillKitchenPreset('ins-pollo-cocina', 5, 18.00, '5kg pollo crudo para desmechar/broaster')">🍗 Pollo (5 kg · $18)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillKitchenPreset('ins-aceite-cocina', 6, 12.90, '6 litros aceite vegetal de freír')">🛢️ Aceite (6 L · $12.90)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillServicePreset('Gas / Bombona', 'Recarga de bombona de gas para cocina', 10.00)">🔥 Gas ($10)</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-weight:700" onclick="window.MTPSidebar.fillServicePreset('Hielo / Bolsas', 'Bolsas de hielo y bolsas despacho', 3.00)">🧊 Hielo ($3)</button>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
              <label style="font-weight:800;color:#0F172A">1. ¿Qué se está comprando o pagando?</label>
              <select id="gExpItemSelect" class="select" style="font-weight:700;font-size:13.5px;height:44px" onchange="window.MTPSidebar.onItemSelectChange()">
                <optgroup id="gExpKitchenGroup" label="🍲 Ingredientes de Cocina (suman kilos o litros al stock)">
                  <option value="ins-alinos">🧅 Aliños Frescos (Cebolla, Ajo, Pimentón)</option>
                </optgroup>
                <optgroup label="💸 Servicios y gastos del día (salida de dinero)">
                  <option value="SERV_GAS">🔥 Recarga Bombona de Gas / Agua Potable</option>
                  <option value="SERV_HIELO">🧊 Bolsas de Hielo para Cavas y Bolsas</option>
                  <option value="SERV_FLETE">🛵 Flete / Carrera de Motorizado para Compras</option>
                  <option value="SERV_PERSONAL">👤 Pago de Jornal / Turno a Ayudante</option>
                  <option value="SERV_OTRO">💵 Retiro de Caja Chica / Otros Gastos</option>
                </optgroup>
              </select>
            </div>

            <div class="form-group" id="gExpQtyWrap">
              <label id="gExpQtyLabel" style="font-weight:800">Cantidad Comprada (Kg o Litros)</label>
              <input type="number" step="0.5" id="gExpQty" class="input" value="5" style="font-weight:900;font-size:15px;height:40px" oninput="window.MTPSidebar.recalcUnitCostNotice()">
            </div>

            <div class="form-group">
              <label style="font-weight:800">¿De dónde salió el dinero?</label>
              <select id="gExpSource" class="select" style="font-weight:800;font-size:13px;height:40px">
                <option value="Efectivo USD">💵 Efectivo USD ($) - Gaveta</option>
                <option value="Pago Móvil">📲 Pago Móvil - Banco Bs</option>
                <option value="Efectivo Bs">🇻🇪 Efectivo Bolívares - Gaveta</option>
                <option value="Caja Externa Admin">💼 Dinero Propio del Dueño (No toca gaveta)</option>
              </select>
            </div>

            <div class="form-group">
              <label style="font-weight:800">Total en Dólares ($)</label>
              <input type="number" step="0.10" id="gExpUsd" class="input" placeholder="Ej: 12.00" style="font-weight:900;font-size:16px;height:40px;color:#0F172A"
                oninput="window.MTPSidebar.syncExpBs(this.value); window.MTPSidebar.recalcUnitCostNotice();">
            </div>

            <div class="form-group">
              <label style="font-weight:800">Equivalente en Bolívares (BCV)</label>
              <input type="number" step="0.5" id="gExpBs" class="input" placeholder="Ej: 514.20" style="font-weight:900;font-size:16px;height:40px;color:#059669"
                oninput="window.MTPSidebar.syncExpUsd(this.value); window.MTPSidebar.recalcUnitCostNotice();">
            </div>

            <div class="form-group" style="grid-column:1/-1">
              <label style="font-weight:800">Detalle / Proveedor (Opcional)</label>
              <input type="text" id="gExpDesc" class="input" placeholder="Ej: Comprado en el mercado municipal..." style="height:38px">
            </div>
          </div>

          <div id="gExpActionNotice" style="margin-top:12px;padding:10px 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;font-size:12.5px;color:#065f46;font-weight:700"></div>
        </div>
        <div class="modal-ft" style="padding:12px 16px;background:#F8FAFC;border-top:1px solid #E2E8F0">
          <button class="btn btn-secondary" onclick="window.MTPSidebar.closeExpenseModal()">Cancelar</button>
          <button class="btn btn-action" style="min-width:200px;font-weight:900" onclick="window.MTPSidebar.submitQuickExpense()">📥 Guardar Compra o Gasto</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeExpenseModal();
    });
  }

  function escTxt(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function populateExpenseKitchenOptions() {
    const grp = document.getElementById('gExpKitchenGroup');
    if (!grp || !window.MTP) return;
    const insumos = typeof MTP.getKitchenInsumos === 'function'
      ? MTP.getKitchenInsumos()
      : (MTP.state.inventory || []).filter(i => i && (i.type === 'insumo' || !i.sellable));
    if (!insumos.length) return;
    const prevVal = document.getElementById('gExpItemSelect') ? document.getElementById('gExpItemSelect').value : '';
    grp.innerHTML = insumos.map(i =>
      `<option value="${escTxt(i.id)}">${escTxt(i.emoji || '🍲')} ${escTxt(i.name)} (Stock: ${Number(i.stock || 0)} ${escTxt(i.unit || 'kg')})</option>`
    ).join('');
    if (prevVal && document.getElementById('gExpItemSelect')) {
      document.getElementById('gExpItemSelect').value = prevVal;
    }
  }

  function openExpenseModal() {
    ensureQuickExpenseModal();
    populateExpenseKitchenOptions();
    const modal = document.getElementById('globalExpenseModal');
    if (!modal) return;
    onItemSelectChange();
    modal.classList.add('open');
    setTimeout(() => {
      const el = document.getElementById('gExpUsd');
      if (el) el.focus();
    }, 40);
  }

  function closeExpenseModal() {
    const modal = document.getElementById('globalExpenseModal');
    if (modal) modal.classList.remove('open');
  }

  function onItemSelectChange() {
    const val = document.getElementById('gExpItemSelect')?.value || '';
    const isService = val.startsWith('SERV_');
    const qtyWrap = document.getElementById('gExpQtyWrap');
    const qtyLabel = document.getElementById('gExpQtyLabel');
    if (qtyWrap) qtyWrap.style.display = isService ? 'none' : 'block';

    if (!isService && val && window.MTP) {
      const ins = MTP.getInsumoById(val);
      if (qtyLabel && ins) qtyLabel.textContent = `Cantidad Comprada (${ins.unit.toUpperCase()})`;
    }
    recalcUnitCostNotice();
  }

  function fillKitchenPreset(insumoId, qty, usd, desc) {
    ensureQuickExpenseModal();
    const bcv = window.MTP?.state?.settings?.rateBcv || 42.85;
    document.getElementById('gExpItemSelect').value = insumoId;
    document.getElementById('gExpQty').value = qty;
    document.getElementById('gExpUsd').value = Number(usd).toFixed(2);
    document.getElementById('gExpBs').value = (Number(usd) * bcv).toFixed(2);
    document.getElementById('gExpDesc').value = desc || '';
    onItemSelectChange();
  }

  function fillServicePreset(cat, desc, usd) {
    ensureQuickExpenseModal();
    const bcv = window.MTP?.state?.settings?.rateBcv || 42.85;
    let servVal = 'SERV_OTRO';
    if (cat.includes('Gas')) servVal = 'SERV_GAS';
    else if (cat.includes('Hielo')) servVal = 'SERV_HIELO';
    else if (cat.includes('Flete')) servVal = 'SERV_FLETE';
    else if (cat.includes('Personal')) servVal = 'SERV_PERSONAL';

    document.getElementById('gExpItemSelect').value = servVal;
    document.getElementById('gExpUsd').value = Number(usd).toFixed(2);
    document.getElementById('gExpBs').value = (Number(usd) * bcv).toFixed(2);
    document.getElementById('gExpDesc').value = desc || '';
    onItemSelectChange();
  }

  function recalcUnitCostNotice() {
    const val = document.getElementById('gExpItemSelect')?.value || '';
    const isService = val.startsWith('SERV_');
    const notice = document.getElementById('gExpActionNotice');
    if (!notice || !window.MTP) return;

    const usd = parseFloat(document.getElementById('gExpUsd')?.value) || 0;
    const source = document.getElementById('gExpSource')?.value || 'Efectivo USD';

    if (isService) {
      notice.style.background = '#fef2f2';
      notice.style.borderColor = '#fca5a5';
      notice.style.color = '#991b1b';
      notice.innerHTML = `💸 Salida directa de <strong>${MTP.fmtUSD(usd)}</strong> de ${source}. Descuenta de la ganancia y del cuadre de caja.`;
    } else {
      const ins = MTP.getInsumoById(val);
      const qty = parseFloat(document.getElementById('gExpQty')?.value) || 1;
      const unitCost = qty > 0 ? (usd / qty) : 0;
      notice.style.background = '#f0fdf4';
      notice.style.borderColor = '#bbf7d0';
      notice.style.color = '#065f46';
      notice.innerHTML = `📥 Sumará <strong>+${qty} ${ins ? ins.unit : 'kg'}</strong> al almacén de cocina de <em>"${ins ? ins.name : ''}"</em> (Costo: $${unitCost.toFixed(2)}/${ins ? ins.unit : 'kg'}) y restará <strong>${MTP.fmtUSD(usd)}</strong> de ${source}.`;
    }
  }

  function syncExpBs(usdVal) {
    const bcv = window.MTP?.state?.settings?.rateBcv || 42.85;
    const u = parseFloat(usdVal) || 0;
    document.getElementById('gExpBs').value = (u * bcv).toFixed(2);
  }

  function syncExpUsd(bsVal) {
    const bcv = window.MTP?.state?.settings?.rateBcv || 42.85;
    const b = parseFloat(bsVal) || 0;
    document.getElementById('gExpUsd').value = (bcv > 0 ? b / bcv : 0).toFixed(2);
  }

  function submitQuickExpense() {
    const itemVal = document.getElementById('gExpItemSelect').value;
    const isService = itemVal.startsWith('SERV_');
    const source = document.getElementById('gExpSource').value;
    const bcv = (window.MTP && MTP.state && MTP.state.settings && Number(MTP.state.settings.rateBcv)) || 42.85;
    let usd = parseFloat(document.getElementById('gExpUsd').value) || 0;
    let bs = parseFloat(document.getElementById('gExpBs').value) || 0;
    const desc = document.getElementById('gExpDesc').value.trim();

    if (usd <= 0 && bs > 0 && bcv > 0) {
      usd = Number((bs / bcv).toFixed(2));
    } else if (bs <= 0 && usd > 0) {
      bs = Number((usd * bcv).toFixed(2));
    }

    if (usd <= 0) {
      MTP.toast('Ingresa un monto pagado mayor a $0.00', 'warn');
      return;
    }

    const curUser = window.MTPAuth ? window.MTPAuth.getCurrentUser() : null;
    const reqSuper = window.MTPPermissions ? window.MTPPermissions.requiresSupervisor(curUser, 'expense.create', { amountUsd: usd }) : false;

    if (reqSuper && window.MTPAuth) {
      window.MTPAuth.requestSupervisorPin(
        'expense.create',
        `Gasto de $${usd.toFixed(2)} supera el límite permitido para cajero`,
        function (authData) {
          doProcessExpense(authData.supervisor.name);
        }
      );
      return;
    }

    doProcessExpense();

    function doProcessExpense(supervisorName) {
      const respName = supervisorName
        ? `${curUser ? curUser.name : 'Cajero'} (Autorizado por ${supervisorName})`
        : (curUser ? curUser.name : 'Administrador');

      if (!isService) {
        const qty = parseFloat(document.getElementById('gExpQty').value) || 1;
        const res = MTP.recordKitchenPurchase({
          insumoId: itemVal,
          qty,
          totalCostUsd: usd,
          totalCostBs: bs,
          amountBs: bs,
          paymentSource: source,
          supplier: 'Mercado / Compra Cocina',
          notes: desc || 'Compra rápida de cocina',
          responsible: respName
        });
        if (res) {
          closeExpenseModal();
          MTP.toast(`¡Sumados +${res.qty} ${res.insumo.unit} a ${res.insumo.name} y descontados ${MTP.fmtUSD(usd)} de ${source}!`);
        }
      } else {
        let cat = 'Gasto Operativo';
        if (itemVal === 'SERV_GAS') cat = 'Gas / Servicios';
        else if (itemVal === 'SERV_HIELO') cat = 'Insumos Menores (Hielo / Bolsas)';
        else if (itemVal === 'SERV_FLETE') cat = 'Flete / Transporte';
        else if (itemVal === 'SERV_PERSONAL') cat = 'Personal / Ayudante';

        MTP.recordExpense({
          category: cat,
          description: desc || cat,
          paymentSource: source,
          amountUsd: usd,
          amountBs: bs,
          responsible: respName
        });
        closeExpenseModal();
        MTP.toast(`Gasto de ${MTP.fmtUSD(usd)} registrado en ${source}`);
      }
    }
  }

  function getAssetBase() {
    const p = location.pathname.replace(/\\/g, '/');
    return /\/(admin|caja|mobile)(\/|$)/i.test(p) ? '../' : '';
  }

  /* LIMPIAR ARTEFACTOS INVASIVOS DE VERSIONES PREVIAS Y ASEGURAR FAVICON */
  function cleanupArtifacts() {
    const oldFab = document.getElementById('menuFab');
    if (oldFab) oldFab.remove();
    const oldHome = document.querySelector('.topbar-home-btn');
    if (oldHome) oldHome.remove();
    if (document.head && !document.querySelector('link[rel="icon"]')) {
      const ico = document.createElement('link');
      ico.rel = 'icon';
      ico.type = 'image/png';
      ico.href = getAssetBase() + 'assets/img/brand-icon-64.png';
      document.head.appendChild(ico);
    }
  }

  /* RENDERIZADO DE LA NAVEGACIÓN LATERAL DIRECTA Y ELEGANTE */
  function renderSidebar() {
    cleanupArtifacts();
    if (!window.MTP) return;
    const aside = document.getElementById('adminAside');
    if (!aside) return;

    const path = location.pathname.replace(/\\/g, '/');
    const inAdminDir = /\/admin(\/|$)/i.test(path);
    const assetBase = getAssetBase();
    const adminBase = inAdminDir ? '' : (assetBase + 'admin/');
    const posHref = assetBase + 'pos.html';
    const indexHref = assetBase + 'index.html';
    const currentFile = (path.split('/').pop() || 'index.html').toLowerCase();
    const isCollapsed = document.body.classList.contains('aside-collapsed');

    const currentUser = window.MTPAuth ? window.MTPAuth.getCurrentUser() : null;
    const userRole = currentUser ? currentUser.role : (inAdminDir ? 'admin' : 'cajero');
    const isCaja = userRole === 'cajero';
    const isSupervisorOrAdmin = !currentUser || userRole === 'admin' || userRole === 'encargado';
    const isAdminUser = !currentUser || userRole === 'admin';

    if (isCaja && inAdminDir) {
      window.location.replace(posHref);
      return;
    }

    const lowStockCount = MTP.state.inventory.filter(i => Number(i.stock) <= Number(i.minStock)).length;
    const heldCount = (MTP.state.heldOrders || []).length;

    function getIco(key) {
      if (window.MTPIcons && typeof window.MTPIcons.get === 'function') {
        return window.MTPIcons.get(key, { size: 17 });
      }
      return '';
    }

    // 5 OPCIONES PRINCIPALES PARA EL DUEÑO (CON IDENTIDAD CROMÁTICA VIBRANTE)
    const ADMIN_MAIN_LINKS = [
      { href: posHref,                    iconKey: 'pos',        theme: 'theme-pos',     label: 'Vender',                  badge: heldCount ? `${heldCount} esp` : 'F2', badgeClass: heldCount ? 'badge-amber' : 'badge-kbd' },
      { href: adminBase + 'inventario.html', iconKey: 'package',    theme: 'theme-inv',     label: 'Lo que hay en la tienda', badge: lowStockCount ? `${lowStockCount} bajo` : '', badgeClass: 'badge-red' },
      { href: adminBase + 'facturas.html',   iconKey: 'fileText',   theme: 'theme-gastos',  label: 'Compras y gastos' },
      { href: adminBase + 'cierres.html',    iconKey: 'calculator', theme: 'theme-cierres', label: 'Cuadre del día' },
      { href: adminBase + 'precios.html',    iconKey: 'dollar',     theme: 'theme-precios', label: 'Precios y tasa del dólar' }
    ];

    // OPCIONES AVANZADAS BAJO "MÁS OPCIONES" (ocultar páginas exclusivas si es encargado)
    const ADMIN_MORE_LINKS = [
      { href: adminBase + 'productos.html',  iconKey: 'barcode',    theme: 'theme-productos', label: 'Platos y productos' },
      { href: adminBase + 'recetas.html',    iconKey: 'kitchen',    theme: 'theme-cocina',    label: 'Recetas de cocina' },
      { action: 'printLabels',               iconKey: 'barcode',    theme: 'theme-etiquetas', label: 'Imprimir Etiquetas (opcional)' }
    ];
    if (isAdminUser) {
      ADMIN_MORE_LINKS.push(
        { href: adminBase + 'usuarios.html', iconKey: 'users',    theme: 'theme-usuarios', label: 'Usuarios y claves' },
        { href: adminBase + 'ajustes.html',  iconKey: 'settings', theme: 'theme-ajustes',  label: 'Ajustes y respaldos' }
      );
    }

    const CAJA_LINKS = [
      { href: posHref,              iconKey: 'pos',     theme: 'theme-pos',     label: 'Vender en Caja',           badge: heldCount ? `${heldCount} esp` : 'F2', badgeClass: heldCount ? 'badge-amber' : 'badge-kbd' },
      { action: 'openTodayTickets', iconKey: 'receipt', theme: 'theme-cierres', label: 'Tickets y Cuadre del Turno' }
    ];

    const bcv = Number(MTP.state.settings.rateBcv || 42.85).toFixed(2);
    const eur = Number(MTP.state.settings.rateEur || 46.60).toFixed(2);
    const usdt = Number(MTP.state.settings.rateUsdt || 51.40).toFixed(2);
    const gap = (((usdt / bcv) - 1) * 100).toFixed(1);

    function renderLinkItem(item) {
      const icoHtml = getIco(item.iconKey || 'barcode') || '•';
      const badgeHtml = item.badge
        ? `<span class="aside-badge ${item.badgeClass || ''}">${item.badge}</span>`
        : '';

      if (item.action === 'printLabels') {
        return `
          <a href="#" class="aside-link ${escTxt(item.theme || '')}" onclick="window.MTPBarcodePrinter && window.MTPBarcodePrinter.open(); return false;" title="${escTxt(item.label)}">
            <span class="aside-link-left">
              <span class="aside-ico-box" style="width:28px;height:28px;border-radius:8px;">
                ${icoHtml}
              </span>
              <span class="aside-link-label">${escTxt(item.label)}</span>
            </span>
            ${badgeHtml}
          </a>
        `;
      }

      if (item.action === 'openTodayTickets') {
        return `
          <a href="${escTxt(posHref)}?tickets=1" class="aside-link ${escTxt(item.theme || '')}" onclick="if(window.MTPPos && window.MTPPos.openTodayTicketsModal){window.MTPPos.openTodayTicketsModal();return false;}" title="${escTxt(item.label)}">
            <span class="aside-link-left">
              <span class="aside-ico-box" style="width:28px;height:28px;border-radius:8px;">
                ${icoHtml}
              </span>
              <span class="aside-link-label">${escTxt(item.label)}</span>
            </span>
            ${badgeHtml}
          </a>
        `;
      }

      const targetFile = item.href ? item.href.split('/').pop().toLowerCase() : '';
      const targetInAdmin = item.href ? item.href.indexOf('admin/') !== -1 || (inAdminDir && !item.href.startsWith('..')) : false;
      const isActive = (inAdminDir === targetInAdmin) && targetFile === currentFile;

      return `
        <a href="${escTxt(item.href || '#')}" class="aside-link ${escTxt(item.theme || '')} ${isActive ? 'active' : ''}" title="${escTxt(item.label)}">
          <span class="aside-link-left">
            <span class="aside-ico-box" style="width:28px;height:28px;border-radius:8px;">
              ${icoHtml}
            </span>
            <span class="aside-link-label">${escTxt(item.label)}</span>
          </span>
          ${badgeHtml}
        </a>
      `;
    }

    const isOnMorePage = inAdminDir && ADMIN_MORE_LINKS.some(m => m.href && m.href.split('/').pop().toLowerCase() === currentFile);
    const moreOpenSaved = localStorage.getItem(MORE_KEY) === '1';
    const showMoreOpen = isOnMorePage || moreOpenSaved || isCollapsed;

    let linksHtml = '';
    if (isCaja) {
      linksHtml = CAJA_LINKS.map(renderLinkItem).join('');
    } else {
      linksHtml = ADMIN_MAIN_LINKS.map(renderLinkItem).join('');
      if (isSupervisorOrAdmin) {
        linksHtml += `
          <button type="button" class="aside-more-btn" onclick="window.MTPSidebar.toggleMoreOptions()">
            <span class="aside-more-btn-label">
              ${getIco('settings')}
              <span>⚙️ Más opciones</span>
            </span>
            <span id="asideMoreChevron" class="aside-chevron">${showMoreOpen ? '▾' : '▸'}</span>
          </button>
          <div id="asideMoreLinksWrap" class="aside-more-wrap" style="display:${showMoreOpen ? 'flex' : 'none'};">
            ${ADMIN_MORE_LINKS.map(renderLinkItem).join('')}
          </div>
        `;
      }
    }

    const boltIco = window.MTPIcons ? window.MTPIcons.get('bolt', { size: 16, color: '#f59e0b' }) : '⚡';
    const plusIco = window.MTPIcons ? window.MTPIcons.get('plus', { size: 14, color: '#ffffff' }) : '+';
    const userIco = getIco('user') || '👤';
    const logoutIco = getIco('logout') || '🔒';

    const userName = currentUser ? currentUser.name : (isCaja ? 'Cajero Turno' : 'Administrador');
    const roleLabel = window.MTPPermissions ? window.MTPPermissions.getRoleLabel(userRole) : (userRole === 'admin' ? 'Administrador' : (userRole === 'encargado' ? 'Encargado' : 'Cajero'));

    const cfg = (MTP.state && MTP.state.settings) ? MTP.state.settings : {};
    const storeName = (cfg.storeName || '').trim() || 'MI TIENDA POS';
    const storeRif = (cfg.rif || '').trim();
    const storeSub = storeRif ? (isCaja ? `CAJA • ${storeRif}` : storeRif) : (isCaja ? 'TERMINAL DE CAJA' : 'RESTAURANTE & ABASTO');

    aside.innerHTML = `
      <div class="aside-brand" ${isCollapsed ? 'onclick="window.MTPSidebar.toggleSidebarCollapse()"' : ''} title="${isCollapsed ? 'Clic para desplegar menú completo (Ctrl+B)' : ''}">
        <div class="aside-brand-left">
          <div class="aside-logo" title="${escTxt(storeName)} (MI TIENDA POS)" style="padding:0;overflow:hidden;background:#0B1120">
            <img src="${assetBase}assets/img/brand-icon-64.png" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">
          </div>
          <div class="aside-brand-txt">
            <strong>${escTxt(storeName)}</strong>
            <span>${escTxt(storeSub)}</span>
          </div>
        </div>
        <button type="button" class="aside-collapse-btn ${isCollapsed ? 'collapsed' : ''}" onclick="event.stopPropagation(); window.MTPSidebar.toggleSidebarCollapse()" title="${isCollapsed ? 'Desplegar Menú Completo (Ctrl+B)' : 'Plegar Menú (Ctrl+B)'}">
          ${isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      <!-- Widget Compacto de Tasas Oficiales y Paralelo -->
      <div class="aside-rates-card" onclick="window.MTPRates && window.MTPRates.openQuickRateModal()" title="Clic para actualizar tasas de cambio">
        <div class="aside-rate-item">
          <span class="aside-rate-lbl">BCV USD</span>
          <strong class="aside-rate-val green">${bcv}</strong>
        </div>
        <div class="aside-rate-item">
          <span class="aside-rate-lbl">EUR BCV</span>
          <strong class="aside-rate-val blue">${eur}</strong>
        </div>
        <div class="aside-rate-item">
          <span class="aside-rate-lbl">USDT (+${gap}%)</span>
          <strong class="aside-rate-val amber">${usdt}</strong>
        </div>
      </div>

      <!-- Botón de Gasto / Compra Rápida de Cocina -->
      <div class="aside-expense-action">
        <button class="aside-expense-btn" onclick="window.MTPSidebar.openExpenseModal()" title="Registrar compras de mercado (aliños, papas, carnes) o salidas de dinero">
          <span class="aside-expense-ico">${plusIco}</span>
          <span class="aside-expense-label">Compra o gasto rápido</span>
        </button>
      </div>

      <!-- Navegación Principal -->
      <nav class="aside-nav">
        ${linksHtml}
      </nav>

      <!-- Pie de Navegación: Usuario Activo y Salir -->
      <div class="aside-ft">
        <div class="aside-user-card">
          <div class="aside-user-avatar" title="${escTxt(userName)} (${escTxt(roleLabel)})">
            ${userIco}
          </div>
          <div class="aside-user-info">
            <span class="aside-user-name">${escTxt(userName)}</span>
            <span class="aside-user-badge role-${escTxt(userRole)}">${escTxt(roleLabel)}</span>
          </div>
          <button type="button" class="aside-logout-btn" onclick="window.MTPAuth ? window.MTPAuth.logout() : window.location.href='${escTxt(indexHref)}'" title="Bloquear / Cerrar Sesión">
            ${logoutIco}
          </button>
        </div>
      </div>
    `;

    // Actualizar píldora de tasa en Topbar
    const topRateEl = document.getElementById('topRatePill');
    if (topRateEl) {
      topRateEl.innerHTML = `<span class="top-dot green"></span> BCV: <strong>${bcv}</strong> · USDT: <strong>${usdt}</strong> <span class="top-edit">✎</span>`;
      topRateEl.onclick = () => window.MTPRates && window.MTPRates.openQuickRateModal();
    }

    // Backdrop móvil (<900px) + cierre por Esc y enlace de menú
    let backdrop = document.getElementById('sidebarBackdrop');
    if (!backdrop && typeof document.createElement === 'function' && document.body && typeof document.body.appendChild === 'function') {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebarBackdrop';
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
      if (typeof backdrop.addEventListener === 'function') {
        backdrop.addEventListener('click', () => {
          aside.classList.remove('open');
          backdrop.classList.remove('open');
        });
      }
    }

    const menuBtn = document.getElementById('menuToggleBtn');
    if (menuBtn && !menuBtn._bound && typeof menuBtn.addEventListener === 'function') {
      menuBtn._bound = true;
      menuBtn.addEventListener('click', () => {
        const isOpen = aside.classList.toggle('open');
        const bd = document.getElementById('sidebarBackdrop');
        if (bd) bd.classList.toggle('open', isOpen);
      });
    }

    if (typeof aside.querySelectorAll === 'function') {
      aside.querySelectorAll('.aside-link[href]').forEach(link => {
        link.addEventListener('click', (e) => {
          const href = link.getAttribute('href') || '';
          if (isCaja && href.indexOf('admin/') !== -1) {
            e.preventDefault();
            window.location.href = posHref;
            return;
          }
          aside.classList.remove('open');
          const bd = document.getElementById('sidebarBackdrop');
          if (bd) bd.classList.remove('open');
        });
      });
    }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebarCollapse();
      return;
    }
    if (e.key === 'Escape') {
      const aside = document.getElementById('adminAside');
      const bd = document.getElementById('sidebarBackdrop');
      if (aside && aside.classList.contains('open')) {
        aside.classList.remove('open');
        if (bd) bd.classList.remove('open');
      }
    }
  });

  window.MTPSidebar = {
    toggleSidebarCollapse,
    toggleMoreOptions,
    openExpenseModal,
    closeExpenseModal,
    onItemSelectChange,
    fillKitchenPreset,
    fillServicePreset,
    recalcUnitCostNotice,
    syncExpBs,
    syncExpUsd,
    submitQuickExpense,
    renderSidebar
  };

  initSidebarState();
  document.addEventListener('DOMContentLoaded', function () {
    if (window.MTPAuth && typeof window.MTPAuth.guardCurrentPage === 'function') {
      window.MTPAuth.guardCurrentPage();
    }
    renderSidebar();
  });
  window.addEventListener('mtp:state-updated', renderSidebar);
  window.addEventListener('mtp:auth-login', renderSidebar);
  window.addEventListener('mtp:auth-logout', renderSidebar);
})();
