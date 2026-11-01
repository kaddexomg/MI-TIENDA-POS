/* ==========================================================================
   MI-TIENDA-POS — Navegación Lateral Sencilla + Compras de Insumos & Gastos Reales
   - Navegación directa de 1 clic sin menús recargados
   - Conexión real: compra de aliños, papas, carnes suma kilos a cocina y descuenta caja
   ========================================================================== */
(function () {
  const COLLAPSE_KEY = 'mtp_sidebar_collapsed';

  function initSidebarState() {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved === '1') {
        document.body.classList.add('aside-collapsed');
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

  /* MODAL INTELIGENTE DE COMPRAS REALES DE COCINA Y GASTOS OPERATIVOS */
  function ensureQuickExpenseModal() {
    if (document.getElementById('globalExpenseModal')) return;
    const modal = document.createElement('div');
    modal.id = 'globalExpenseModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:580px">
        <div class="modal-hd" style="background:#065f46;color:#fff;border-radius:12px 12px 0 0;padding:8px 12px">
          <div>
            <h3 style="color:#fff;margin:0;font-size:13.5px;display:flex;align-items:center;gap:6px">
              ${window.MTPIcons ? window.MTPIcons.get('kitchen', { size: 16 }) : ''} Registrar Compra de Insumos / Gastos de Caja
            </h3>
            <p style="color:#a7f3d0;font-size:10.5px;margin:2px 0 0 0">Compras de aliños, papas o carnes suman los kilos a cocina y descuentan de la gaveta</p>
          </div>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:none" onclick="window.MTPSidebar.closeExpenseModal()">✕ (ESC)</button>
        </div>
        <div class="modal-bd">
          <!-- Botonera de Insumos y Gastos Reales del Día a Día -->
          <div style="margin-bottom:8px">
            <span style="font-size:10.5px;font-weight:800;color:var(--txt-sec);display:block;margin-bottom:4px">Insumos Frecuentes de Cocina y Gastos del Día:</span>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillKitchenPreset('ins-alinos', 5, 12.00, 'Compra 5kg aliños frescos para guisos')">Aliños (5 kg · $12)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillKitchenPreset('ins-papa', 25, 33.75, 'Saco de papa 25kg para empanadas/comida')">Saco Papa (25 kg)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillKitchenPreset('ins-carne-mechada', 5, 34.00, '5kg carne para mechar/guisar')">Carne Res (5 kg · $34)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillKitchenPreset('ins-queso-cocina', 3, 16.20, '3kg queso blanco llanero para relleno')">Queso (3 kg)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillKitchenPreset('ins-pollo-cocina', 5, 18.00, '5kg pollo crudo para desmechar/broaster')">Pollo (5 kg)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillKitchenPreset('ins-aceite-cocina', 6, 12.90, '6 litros aceite vegetal de freír')">Aceite (6 L)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillServicePreset('Gas / Bombona', 'Recarga de bombona de gas para cocina', 10.00)">Gas ($10)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillServicePreset('Hielo / Bolsas', 'Bolsas de hielo para cavas y bolsas despacho', 3.00)">Hielo ($3)</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPSidebar.fillServicePreset('Flete / Motorizado', 'Pago carrera flete búsqueda de verduras', 2.50)">Flete ($2.50)</button>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
              <label>1. ¿Qué se está comprando o pagando?</label>
              <select id="gExpItemSelect" class="select" onchange="window.MTPSidebar.onItemSelectChange()">
                <optgroup label="Insumos que Entran al Almacén de Cocina (Suman Kilos/Litros)">
                  <option value="ins-alinos">Aliños Frescos (Cebolla, Ajo, Pimentón, Ají Dulce, Cilantro)</option>
                  <option value="ins-papa">Papa Cruda para Comida y Papas Rellenas</option>
                  <option value="ins-carne-mechada">Carne de Res Cruda (Mechar / Moler / Guisar)</option>
                  <option value="ins-pollo-cocina">Pollo Crudo (Broaster / Desmechar)</option>
                  <option value="ins-queso-cocina">Queso Blanco Llanero / Amarillo para Relleno</option>
                  <option value="ins-harina-cocina">Harina de Amasar en Cocina (Maíz / Trigo)</option>
                  <option value="ins-aceite-cocina">Aceite Vegetal para Freír en Cocina</option>
                  <option value="ins-arroz-cocina">Arroz en Saco para Cocina (Pabellón / Chino)</option>
                  <option value="ins-ensalada">Plátanos para Tajadas y Vegetales</option>
                  <option value="ins-envase">Envases Térmicos y Servilletas</option>
                </optgroup>
                <optgroup label="Gastos Operativos y Servicios (Solo Salida de Dinero)">
                  <option value="SERV_GAS">Recarga Bombona de Gas / Agua Potable</option>
                  <option value="SERV_HIELO">Bolsas de Hielo para Cavas y Bolsas Plásticas</option>
                  <option value="SERV_FLETE">Flete / Carrera de Motorizado para Compras</option>
                  <option value="SERV_PERSONAL">Pago de Jornal / Turno a Cocinero o Ayudante</option>
                  <option value="SERV_OTRO">Retiro de Caja Chica / Otros Gastos</option>
                </optgroup>
              </select>
            </div>

            <!-- Si es insumo de cocina, pide los kilos comprados -->
            <div class="form-group" id="gExpQtyWrap">
              <label id="gExpQtyLabel">Cantidad Comprada (Kg o Litros)</label>
              <input type="number" step="0.5" id="gExpQty" class="input" value="5" style="font-weight:900" oninput="window.MTPSidebar.recalcUnitCostNotice()">
            </div>

            <div class="form-group">
              <label>¿De dónde salió el dinero?</label>
              <select id="gExpSource" class="select" style="font-weight:800">
                <option value="Efectivo USD">Efectivo USD ($) - Gaveta</option>
                <option value="Pago Móvil">Pago Móvil - Cuenta Banco Bs</option>
                <option value="Efectivo Bs">Efectivo Bolívares - Gaveta</option>
                <option value="Caja Externa Admin">Dinero Propio del Dueño (No toca gaveta)</option>
              </select>
            </div>

            <div class="form-group">
              <label>Total Pagado en Dólares ($)</label>
              <input type="number" step="0.10" id="gExpUsd" class="input" placeholder="Ej: 12.00" style="font-weight:900;font-size:15px"
                oninput="window.MTPSidebar.syncExpBs(this.value); window.MTPSidebar.recalcUnitCostNotice();">
            </div>

            <div class="form-group">
              <label>Equivalente en Bolívares (Bs BCV)</label>
              <input type="number" step="0.5" id="gExpBs" class="input" placeholder="Ej: 514.20" style="font-weight:800;font-size:14px"
                oninput="window.MTPSidebar.syncExpUsd(this.value); window.MTPSidebar.recalcUnitCostNotice();">
            </div>

            <div class="form-group" style="grid-column:1/-1">
              <label>Detalle / Proveedor (Opcional)</label>
              <input type="text" id="gExpDesc" class="input" placeholder="Ej: Comprado en el mercado municipal...">
            </div>
          </div>

          <div id="gExpActionNotice" style="margin-top:8px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;font-size:11.5px;color:#065f46;font-weight:700"></div>
        </div>
        <div class="modal-ft">
          <button class="btn btn-ghost" onclick="window.MTPSidebar.closeExpenseModal()">Cancelar</button>
          <button class="btn btn-p" onclick="window.MTPSidebar.submitQuickExpense()">📥 Guardar Compra / Gasto y Actualizar Gaveta</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeExpenseModal();
    });
  }

  function openExpenseModal() {
    ensureQuickExpenseModal();
    const modal = document.getElementById('globalExpenseModal');
    if (!modal) return;
    onItemSelectChange();
    modal.classList.add('open');
    setTimeout(() => document.getElementById('gExpUsd')?.focus(), 40);
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

    if (!isService && val) {
      const ins = MTP.getInsumoById(val);
      if (qtyLabel && ins) qtyLabel.textContent = `Cantidad Comprada (${ins.unit.toUpperCase()})`;
    }
    recalcUnitCostNotice();
  }

  function fillKitchenPreset(insumoId, qty, usd, desc) {
    ensureQuickExpenseModal();
    const bcv = MTP.state.settings.rateBcv || 42.85;
    document.getElementById('gExpItemSelect').value = insumoId;
    document.getElementById('gExpQty').value = qty;
    document.getElementById('gExpUsd').value = Number(usd).toFixed(2);
    document.getElementById('gExpBs').value = (Number(usd) * bcv).toFixed(2);
    document.getElementById('gExpDesc').value = desc || '';
    onItemSelectChange();
  }

  function fillServicePreset(cat, desc, usd) {
    ensureQuickExpenseModal();
    const bcv = MTP.state.settings.rateBcv || 42.85;
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
    if (!notice) return;

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
      notice.innerHTML = `📥 Sumará <strong style="font-size:12.5px">+${qty} ${ins ? ins.unit : 'kg'}</strong> al almacén de cocina de <em>"${ins ? ins.name : ''}"</em> (Costo: $${unitCost.toFixed(2)}/${ins ? ins.unit : 'kg'}) y restará <strong>${MTP.fmtUSD(usd)}</strong> de ${source}.`;
    }
  }

  function syncExpBs(usdVal) {
    const bcv = MTP.state.settings.rateBcv || 42.85;
    const u = parseFloat(usdVal) || 0;
    document.getElementById('gExpBs').value = (u * bcv).toFixed(2);
  }

  function syncExpUsd(bsVal) {
    const bcv = MTP.state.settings.rateBcv || 42.85;
    const b = parseFloat(bsVal) || 0;
    document.getElementById('gExpUsd').value = (bcv > 0 ? b / bcv : 0).toFixed(2);
  }

  function submitQuickExpense() {
    const itemVal = document.getElementById('gExpItemSelect').value;
    const isService = itemVal.startsWith('SERV_');
    const source = document.getElementById('gExpSource').value;
    const usd = parseFloat(document.getElementById('gExpUsd').value) || 0;
    const bs = parseFloat(document.getElementById('gExpBs').value) || 0;
    const desc = document.getElementById('gExpDesc').value.trim();

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
        : (curUser ? curUser.name : (location.pathname.includes('/caja/') ? 'Cajero Turno' : 'Administrador'));

      if (!isService) {
        const qty = parseFloat(document.getElementById('gExpQty').value) || 1;
        const res = MTP.recordKitchenPurchase({
          insumoId: itemVal,
          qty,
          totalCostUsd: usd,
          paymentSource: source,
          supplier: desc ? (desc + (supervisorName ? ` · Aut: ${supervisorName}` : '')) : (supervisorName ? `Aut: ${supervisorName}` : '')
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

  /* RENDERIZADO DE LA NAVEGACIÓN LATERAL DIRECTA Y SENCILLA */
  function renderSidebar() {
    if (!window.MTP) return;
    const aside = document.getElementById('adminAside');
    if (!aside) return;

    const path = location.pathname.replace(/\\/g, '/');
    const isCaja = /\/caja(\/|$)/i.test(path);
    const currentFile = (path.split('/').pop() || 'index.html').toLowerCase();
    const isCollapsed = document.body.classList.contains('aside-collapsed');

    const lowStockCount = MTP.state.inventory.filter(i => Number(i.stock) <= Number(i.minStock)).length;
    const heldCount = (MTP.state.heldOrders || []).length;

    function getIco(key) {
      if (window.MTPIcons && typeof window.MTPIcons.get === 'function') {
        return window.MTPIcons.get(key, { size: 16 });
      }
      return '';
    }

    // NAVEGACIÓN COMPLETA Y DIRECTA (1 CLIC A CADA MÓDULO)
    const ADMIN_LINKS = [
      { href: 'pos.html',        iconKey: 'pos',        label: 'Caja Registradora',  badge: heldCount ? `${heldCount} esp` : 'F2', badgeClass: heldCount ? '' : 'kbd' },
      { href: 'inventario.html', iconKey: 'package',    label: 'Inventario & Kardex', badge: lowStockCount ? `${lowStockCount} bajo` : '' },
      { href: 'recetas.html',    iconKey: 'kitchen',    label: 'Cocina & Insumos' },
      { href: 'cierres.html',    iconKey: 'calculator', label: 'Cuadre de Gaveta' },
      { href: 'productos.html',  iconKey: 'barcode',    label: 'Catálogo & Códigos' },
      { href: 'precios.html',    iconKey: 'dollar',     label: 'Precios & Tasas' },
      { href: 'facturas.html',   iconKey: 'fileText',   label: 'Facturación & Historial' },
      { href: 'index.html',      iconKey: 'chart',      label: 'Dashboard & Finanzas' },
      { href: 'usuarios.html',   iconKey: 'users',      label: 'Usuarios & Permisos' },
      { href: 'ajustes.html',    iconKey: 'settings',   label: 'Ajustes & Respaldo' }
    ];

    const currentUser = window.MTPAuth ? window.MTPAuth.getCurrentUser() : null;
    const isSupervisorOrAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'encargado');

    const CAJA_LINKS = [
      { href: 'pos.html',   iconKey: 'pos',      label: 'Caja Mostrador (Facturar)', badge: heldCount ? `${heldCount} esp` : 'F2', badgeClass: heldCount ? '' : 'kbd' },
      { href: 'index.html', iconKey: 'receipt',  label: 'Órdenes y Cuadre Turno' }
    ];

    // Solo si el usuario en caja es Encargado o Admin se despliega el acceso directo al panel
    if (isSupervisorOrAdmin) {
      CAJA_LINKS.push({ href: '../admin/index.html', iconKey: 'settings', label: 'Ir a Panel Admin' });
    }

    const links = isCaja ? CAJA_LINKS : ADMIN_LINKS;
    const bcv = Number(MTP.state.settings.rateBcv || 42.85).toFixed(2);
    const eur = Number(MTP.state.settings.rateEur || 46.60).toFixed(2);
    const usdt = Number(MTP.state.settings.rateUsdt || 51.40).toFixed(2);
    const gap = (((usdt / bcv) - 1) * 100).toFixed(1);

    const linksHtml = links.map(item => {
      const targetFile = item.href.split('/').pop().toLowerCase();
      const isCross = item.href.startsWith('..');
      const isActive = !isCross && targetFile === currentFile;
      const badgeHtml = item.badge
        ? `<span class="aside-badge ${item.badgeClass || ''}">${item.badge}</span>`
        : '';
      const icoHtml = getIco(item.iconKey);
      return `
        <a href="${item.href}" class="aside-link ${isActive ? 'active' : ''}" title="${item.label}">
          <span class="aside-link-left">
            <span class="aside-ico">${icoHtml}</span>
            <span class="aside-link-label">${item.label}</span>
          </span>
          ${badgeHtml}
        </a>
      `;
    }).join('');

    const boltIco = window.MTPIcons ? window.MTPIcons.get('bolt', { size: 15, color: '#fbbf24' }) : '';
    const plusIco = window.MTPIcons ? window.MTPIcons.get('plus', { size: 13, color: '#fff' }) : '+';

    const userIco = getIco('user');
    const logoutIco = getIco('logout') || '🔒';
    const userName = currentUser ? currentUser.name : (isCaja ? 'Cajero Turno' : 'Administrador');
    const userRole = currentUser ? currentUser.role : (isCaja ? 'cajero' : 'admin');
    const roleLabel = window.MTPPermissions ? window.MTPPermissions.getRoleLabel(userRole) : (userRole === 'admin' ? 'Administrador' : (userRole === 'encargado' ? 'Encargado' : 'Cajero'));
    const roleColor = userRole === 'admin' ? '#f87171' : (userRole === 'encargado' ? '#60a5fa' : '#34d399');

    aside.innerHTML = `
      <div class="aside-brand">
        <div class="aside-brand-left">
          <div class="aside-logo" style="display:flex;align-items:center;justify-content:center;background:#1e293b;border-radius:6px;width:24px;height:24px">${boltIco}</div>
          <div class="aside-brand-txt">
            <strong>MI TIENDA <em>POS</em></strong>
            <span>${isCaja ? 'TERMINAL CAJA' : 'RESTAURANTE & ABASTO'}</span>
          </div>
        </div>
        <button class="aside-collapse-btn" onclick="window.MTPSidebar.toggleSidebarCollapse()" title="Colapsar menú (Ctrl+B)">
          ${isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      <div class="aside-rates-box" onclick="window.MTPRates && window.MTPRates.openQuickRateModal()" title="Clic para ajustar tasas">
        <div class="aside-rate-row">
          <span>BCV USD:</span>
          <strong>${bcv} Bs/$</strong>
        </div>
        <div class="aside-rate-row eur">
          <span>Euro BCV:</span>
          <strong>${eur} Bs/€</strong>
        </div>
        <div class="aside-rate-row usdt">
          <span>USDT P2P:</span>
          <strong>${usdt} (+${gap}%)</strong>
        </div>
      </div>

      <!-- Botón destacado de Compra de Insumos / Gastos Reales -->
      <div style="padding:3px 6px">
        <button class="btn btn-sm" style="width:100%;background:#065f46;color:#fff;border:none;font-weight:800;font-size:10.5px;padding:5px 6px;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="window.MTPSidebar.openExpenseModal()" title="Registrar compra de aliños, papas, carnes o gastos">
          <span>${plusIco}</span><span class="qtxt">Gasto / Insumos Cocina</span>
        </button>
      </div>

      <nav class="aside-nav" style="padding:2px 6px">
        ${linksHtml}
      </nav>

      <div class="aside-ft" style="display:flex;flex-direction:column;gap:5px;padding:6px 8px;background:#091622;border-top:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
            <span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;background:rgba(255,255,255,0.08);color:${roleColor};flex-shrink:0">
              ${userIco}
            </span>
            <div style="overflow:hidden">
              <div style="font-size:11px;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${userName}">
                ${userName}
              </div>
              <div style="font-size:9.5px;font-weight:700;color:${roleColor};display:flex;align-items:center;gap:3px">
                <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${roleColor}"></span>
                ${roleLabel}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.MTPAuth ? window.MTPAuth.logout() : window.location.href='../index.html'"
            title="Bloquear / Cerrar Sesión"
            style="padding:2px 5px;height:22px;background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:#fca5a5;flex-shrink:0">
            ${logoutIco}
          </button>
        </div>
        ${currentUser && currentUser.isDefaultPin ? `
          <a href="${isCaja ? '#' : 'usuarios.html'}" style="font-size:9px;color:#fbbf24;background:rgba(245,158,11,0.12);padding:2px 4px;border-radius:4px;border:1px solid rgba(245,158,11,0.25);text-align:center;display:block" title="PIN de fábrica activo. Te recomendamos cambiarlo en Usuarios.">
            ⚠️ PIN por defecto activo
          </a>
        ` : ''}
      </div>
    `;

    const topRateEl = document.getElementById('topRatePill');
    if (topRateEl) {
      topRateEl.innerHTML = `BCV: <strong>${bcv}</strong> · EUR: <strong>${eur}</strong> · USDT: <strong>${usdt}</strong> <span style="opacity:0.7;font-size:10px">✎</span>`;
      topRateEl.onclick = () => window.MTPRates && window.MTPRates.openQuickRateModal();
    }

    const menuBtn = document.getElementById('menuToggleBtn');
    if (menuBtn && !menuBtn._bound) {
      menuBtn._bound = true;
      menuBtn.addEventListener('click', () => aside.classList.toggle('open'));
    }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebarCollapse();
    }
  });

  window.MTPSidebar = {
    toggleSidebarCollapse,
    openExpenseModal,
    closeExpenseModal,
    onItemSelectChange,
    fillKitchenPreset,
    fillServicePreset,
    recalcUnitCostNotice,
    syncExpBs,
    syncExpUsd,
    submitQuickExpense
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
