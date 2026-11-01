/**
 * MI-TIENDA-POS — Módulo Central de Autenticación, Usuarios y Roles (MTPAuth)
 * Implementa PLAN_IMPLEMENTACION_V5 §3 (Roles, accesos, PIN y Supervisor)
 *
 * Características:
 *  - Criptografía pura SHA-256 con salt (100% offline, Windows 7 / Chrome 109 nativo)
 *  - Usuarios semilla: admin (123456), cajero (1234), encargado (2244)
 *  - Bloqueo por inactividad automático (5 min configurables)
 *  - Modal 🔑 de Autorización por Supervisor (Admin / Encargado)
 *  - Protección de rutas y redirecciones inteligentes
 */
(function (global) {
  'use strict';

  var USERS_STORAGE_KEY = 'mtp_users_v5';
  var SESSION_STORAGE_KEY = 'mtp_session_v5';
  var AUDIT_STORAGE_KEY = 'mtp_auth_audit_v5';

  /* ==========================================================================
     1. Algoritmo Criptográfico SHA-256 Puro en JavaScript (Offline & Win7 Safe)
     ========================================================================== */
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256Pure(ascii) {
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var i, j;
    var result = '';
    var words = [];
    var asciiBitLength = ascii.length * 8;
    var hash = [];
    var k = [];
    var primeCounter = 0;
    var isComposite = {};

    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = true;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';

    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return ''; // no ascii
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;

    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0
          );
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j >= 0; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  function hashPin(pin, salt) {
    if (!pin) return '';
    var input = String(salt || 'mtp_salt_default') + ':' + String(pin).trim();
    return sha256Pure(input);
  }

  function generateSalt() {
    return 's_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  /* ==========================================================================
     2. Usuarios Semilla según PLAN_IMPLEMENTACION_V5 §3
     ========================================================================== */
  var DEFAULT_USERS = [
    {
      id: 'u_admin',
      username: 'admin',
      name: 'Administrador Principal',
      role: 'admin',
      salt: 'mtp_salt_admin_2026',
      pinHash: hashPin('123456', 'mtp_salt_admin_2026'),
      isDefaultPin: true,
      active: true,
      createdAt: '2026-11-01T08:00:00.000Z'
    },
    {
      id: 'u_caja',
      username: 'cajero',
      name: 'Cajero Principal',
      role: 'cajero',
      salt: 'mtp_salt_caja_2026',
      pinHash: hashPin('1234', 'mtp_salt_caja_2026'),
      isDefaultPin: true,
      active: true,
      createdAt: '2026-11-01T08:00:00.000Z'
    },
    {
      id: 'u_encargado',
      username: 'encargado',
      name: 'Encargado de Turno',
      role: 'encargado',
      salt: 'mtp_salt_encargado_2026',
      pinHash: hashPin('2244', 'mtp_salt_encargado_2026'),
      isDefaultPin: true,
      active: true,
      createdAt: '2026-11-01T08:00:00.000Z'
    }
  ];

  /* ==========================================================================
     3. Almacenamiento y Recuperación de Usuarios
     ========================================================================== */
  function loadUsers() {
    try {
      var raw = localStorage.getItem(USERS_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    // Si no existen usuarios, inicializar con la semilla
    saveUsers(DEFAULT_USERS);
    return DEFAULT_USERS.slice();
  }

  function saveUsers(usersList) {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersList));
    } catch (e) {
      console.error('Error guardando usuarios MTP:', e);
    }
  }

  function getUsers() {
    return loadUsers().map(function (u) {
      return {
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        isDefaultPin: !!u.isDefaultPin,
        active: u.active !== false,
        createdAt: u.createdAt
      };
    });
  }

  function getUserById(id) {
    var users = loadUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === id) return users[i];
    }
    return null;
  }

  function getUserByUsername(username) {
    var users = loadUsers();
    var needle = String(username || '').toLowerCase().trim();
    for (var i = 0; i < users.length; i++) {
      if (users[i].username.toLowerCase() === needle) return users[i];
    }
    return null;
  }

  function saveUser(userData) {
    var users = loadUsers();
    var isNew = !userData.id;
    var id = userData.id || ('u_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5));
    var username = String(userData.username || '').toLowerCase().trim();
    var name = String(userData.name || '').trim();
    var role = String(userData.role || 'cajero').toLowerCase().trim();
    var active = userData.active !== false;

    if (!username || !name) {
      return { success: false, error: 'Nombre y usuario son obligatorios' };
    }

    // Verificar duplicados de username
    for (var i = 0; i < users.length; i++) {
      if (users[i].id !== id && users[i].username.toLowerCase() === username) {
        return { success: false, error: 'El nombre de usuario ya está en uso' };
      }
    }

    var existing = null;
    var index = -1;
    for (var j = 0; j < users.length; j++) {
      if (users[j].id === id) {
        existing = users[j];
        index = j;
        break;
      }
    }

    var userObj = existing ? Object.assign({}, existing) : {
      id: id,
      createdAt: new Date().toISOString()
    };

    userObj.username = username;
    userObj.name = name;
    userObj.role = role;
    userObj.active = active;

    if (userData.pin) {
      var pinStr = String(userData.pin).trim();
      var minLen = (role === 'admin') ? 6 : 4;
      if (pinStr.length < minLen) {
        return { success: false, error: 'El PIN para rol ' + role + ' debe tener mínimo ' + minLen + ' dígitos' };
      }
      userObj.salt = generateSalt();
      userObj.pinHash = hashPin(pinStr, userObj.salt);
      userObj.isDefaultPin = false;
    } else if (isNew) {
      return { success: false, error: 'El PIN es obligatorio para nuevos usuarios' };
    }

    if (index >= 0) {
      users[index] = userObj;
    } else {
      users.push(userObj);
    }

    saveUsers(users);
    recordAudit('USER_SAVED', { userId: id, username: username, role: role, isNew: isNew });
    return { success: true, user: userObj };
  }

  function deleteUser(id) {
    var users = loadUsers();
    var target = null;
    var index = -1;
    var adminCount = 0;

    for (var i = 0; i < users.length; i++) {
      if (users[i].role === 'admin' && users[i].active !== false) {
        adminCount++;
      }
      if (users[i].id === id) {
        target = users[i];
        index = i;
      }
    }

    if (!target) return { success: false, error: 'Usuario no encontrado' };
    if (target.role === 'admin' && adminCount <= 1) {
      return { success: false, error: 'No es posible eliminar al único Administrador activo' };
    }

    users.splice(index, 1);
    saveUsers(users);
    recordAudit('USER_DELETED', { userId: id, username: target.username });
    return { success: true };
  }

  function setUserPin(id, newPin) {
    var users = loadUsers();
    var target = null;
    var index = -1;

    for (var i = 0; i < users.length; i++) {
      if (users[i].id === id) {
        target = users[i];
        index = i;
        break;
      }
    }

    if (!target) return { success: false, error: 'Usuario no encontrado' };

    var pinStr = String(newPin || '').trim();
    var minLen = (target.role === 'admin') ? 6 : 4;
    if (pinStr.length < minLen) {
      return { success: false, error: 'El nuevo PIN debe tener al menos ' + minLen + ' dígitos' };
    }

    target.salt = generateSalt();
    target.pinHash = hashPin(pinStr, target.salt);
    target.isDefaultPin = false;
    users[index] = target;
    saveUsers(users);

    // Si es el usuario actual, actualizar sesión
    var cur = getCurrentUser();
    if (cur && cur.id === id) {
      cur.isDefaultPin = false;
      saveSessionUser(cur);
    }

    recordAudit('PIN_CHANGED', { userId: id, username: target.username });
    return { success: true };
  }

  function resetToSeedUsers() {
    saveUsers(DEFAULT_USERS);
    return { success: true };
  }

  /* ==========================================================================
     4. Auditoría de Seguridad Local
     ========================================================================== */
  function recordAudit(action, details) {
    try {
      var raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      list.unshift({
        id: 'aud_' + Date.now().toString(36),
        action: action,
        details: details || {},
        timestamp: new Date().toISOString(),
        actor: getCurrentUser() ? getCurrentUser().username : 'sistema'
      });
      // Guardar últimos 100 registros
      if (list.length > 100) list = list.slice(0, 100);
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function getAuditLog() {
    try {
      var raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  /* ==========================================================================
     5. Manejo de Sesión Activa
     ========================================================================== */
  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (session && session.user && session.user.id) {
        return session;
      }
    } catch (_) {}
    return null;
  }

  function saveSessionUser(user) {
    try {
      var session = getSession() || {};
      session.user = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        isDefaultPin: !!user.isDefaultPin
      };
      session.loginAt = session.loginAt || new Date().toISOString();
      session.lastActiveAt = Date.now();
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

      // Sincronizar en el estado de MTP si está presente
      if (global.MTP && global.MTP.state) {
        global.MTP.state.currentUser = session.user;
      }
    } catch (e) {
      console.error('Error guardando sesión:', e);
    }
  }

  function getCurrentUser() {
    var s = getSession();
    return s ? s.user : null;
  }

  function isAuthenticated() {
    return !!getCurrentUser();
  }

  function hasRole(requiredRole) {
    var cur = getCurrentUser();
    if (!cur) return false;
    if (cur.role === 'admin') return true; // Admin tiene todos los roles
    if (Array.isArray(requiredRole)) {
      return requiredRole.indexOf(cur.role) !== -1;
    }
    return cur.role === requiredRole;
  }

  function login(username, pin) {
    var user = getUserByUsername(username);
    if (!user || user.active === false) {
      return { success: false, error: 'Usuario no encontrado o inactivo' };
    }

    var expectedHash = hashPin(pin, user.salt);
    if (expectedHash !== user.pinHash) {
      return { success: false, error: 'PIN incorrecto' };
    }

    saveSessionUser(user);
    recordAudit('LOGIN_SUCCESS', { userId: user.id, username: user.username, method: 'username_pin' });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mtp:auth-login', { detail: { user: user } }));
      window.dispatchEvent(new CustomEvent('mtp:state-updated'));
    }

    return { success: true, user: user };
  }

  /**
   * loginByPin(pin, optionalUserId)
   * Permite ingreso ultra-rápido escribiendo solo el PIN en la pantalla táctil o física.
   */
  function loginByPin(pin, optionalUserId) {
    var pinStr = String(pin || '').trim();
    if (!pinStr) return { success: false, error: 'Ingrese el PIN' };

    var users = loadUsers().filter(function (u) { return u.active !== false; });

    if (optionalUserId) {
      var targeted = users.filter(function (u) { return u.id === optionalUserId; })[0];
      if (!targeted) return { success: false, error: 'Usuario no encontrado' };
      var h = hashPin(pinStr, targeted.salt);
      if (h === targeted.pinHash) {
        saveSessionUser(targeted);
        recordAudit('LOGIN_SUCCESS', { userId: targeted.id, username: targeted.username, method: 'pin_target' });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mtp:auth-login', { detail: { user: targeted } }));
          window.dispatchEvent(new CustomEvent('mtp:state-updated'));
        }
        return { success: true, user: targeted };
      }
      return { success: false, error: 'PIN incorrecto' };
    }

    // Si no se especificó usuario, buscar coincidencias en todos los usuarios activos
    var matched = [];
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (hashPin(pinStr, u.salt) === u.pinHash) {
        matched.push(u);
      }
    }

    if (matched.length === 1) {
      saveSessionUser(matched[0]);
      recordAudit('LOGIN_SUCCESS', { userId: matched[0].id, username: matched[0].username, method: 'pin_auto' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mtp:auth-login', { detail: { user: matched[0] } }));
        window.dispatchEvent(new CustomEvent('mtp:state-updated'));
      }
      return { success: true, user: matched[0] };
    } else if (matched.length > 1) {
      // Si por casualidad dos usuarios tienen el mismo PIN, iniciar con el primero o pedir elegir
      saveSessionUser(matched[0]);
      return { success: true, user: matched[0], note: 'Múltiples coincidencias' };
    }

    return { success: false, error: 'PIN incorrecto' };
  }

  function getRelativeIndexPath() {
    if (typeof window === 'undefined') return 'index.html';
    var path = window.location.pathname.replace(/\\/g, '/');
    if (path.indexOf('/admin/') !== -1 || path.indexOf('/caja/') !== -1) {
      return '../index.html';
    }
    return 'index.html';
  }

  function logout(options) {
    options = options || {};
    var cur = getCurrentUser();
    if (cur) {
      recordAudit('LOGOUT', { userId: cur.id, username: cur.username, reason: options.locked ? 'idle_lock' : 'manual' });
    }

    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}

    if (global.MTP && global.MTP.state) {
      global.MTP.state.currentUser = null;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mtp:auth-logout', { detail: { options: options } }));
    }

    if (options.redirect !== false && typeof window !== 'undefined') {
      var target = getRelativeIndexPath();
      if (options.locked) {
        target += '?locked=1';
      } else {
        target += '?logout=1';
      }
      window.location.href = target;
    }
  }

  /* ==========================================================================
     6. Bloqueo Automático por Inactividad (Default 5 min)
     ========================================================================== */
  var idleTimerInterval = null;
  var lastActivityTimestamp = Date.now();

  function touchActivity() {
    lastActivityTimestamp = Date.now();
    var session = getSession();
    if (session) {
      session.lastActiveAt = lastActivityTimestamp;
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch (_) {}
    }
  }

  function initIdleTimer() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    var events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    var throttleTimer = null;

    events.forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (!throttleTimer) {
          throttleTimer = setTimeout(function () {
            throttleTimer = null;
            touchActivity();
          }, 3000); // Throttled a 3 s para no saturar
        }
      }, { passive: true });
    });

    if (idleTimerInterval) clearInterval(idleTimerInterval);

    idleTimerInterval = setInterval(function () {
      if (!isAuthenticated()) return;

      var idleLimitMin = 5;
      if (global.MTP && global.MTP.state && global.MTP.state.settings && global.MTP.state.settings.idleLockMin) {
        idleLimitMin = Number(global.MTP.state.settings.idleLockMin) || 5;
      }

      var maxIdleMs = idleLimitMin * 60 * 1000;
      var elapsed = Date.now() - lastActivityTimestamp;

      if (elapsed > maxIdleMs) {
        console.warn('Sesión bloqueada por inactividad tras', idleLimitMin, 'minutos.');
        logout({ locked: true });
      }
    }, 15000); // Evaluar cada 15 segundos
  }

  /* ==========================================================================
     7. Modal 🔑 de Autorización de Supervisor (Encargado / Admin)
     ========================================================================== */
  function ensureSupervisorModal() {
    var existing = document.getElementById('mtpSupervisorModal');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'mtpSupervisorModal';
    modal.className = 'modal-backdrop';
    modal.style.zIndex = '99999';

    modal.innerHTML = `
      <div class="modal-box" style="max-width:390px;background:#ffffff;border:1.5px solid #0F2A3D;border-radius:12px;box-shadow:0 12px 35px rgba(0,0,0,0.35);padding:0;overflow:hidden">
        <div style="background:#0F2A3D;color:#ffffff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px;line-height:1">🔑</span>
            <div>
              <h3 style="margin:0;font-size:13.5px;font-weight:900;color:#ffffff;letter-spacing:-0.01em">AUTORIZACIÓN DE SUPERVISOR</h3>
              <div style="font-size:10.5px;color:#94a3b8">Requiere Encargado o Administrador</div>
            </div>
          </div>
          <button type="button" id="mtpSuperCloseBtn" style="background:transparent;border:none;color:#cbd5e1;font-size:16px;cursor:pointer;padding:2px 6px">✕</button>
        </div>

        <div style="padding:16px 18px">
          <!-- Motivo de la solicitud -->
          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:7px;padding:8px 10px;margin-bottom:12px">
            <div style="font-size:10px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:0.04em">ACCIÓN A AUTORIZAR</div>
            <div id="mtpSuperReasonTxt" style="font-size:12px;font-weight:800;color:#78350f;margin-top:2px">—</div>
          </div>

          <div style="margin-bottom:12px">
            <label style="display:block;font-size:11px;font-weight:800;color:#334155;margin-bottom:5px">PIN de Supervisor (4 o 6 dígitos):</label>
            <input type="password" id="mtpSuperPinInput" maxlength="6" inputmode="numeric" autocomplete="off"
              style="width:100%;height:40px;font-size:22px;letter-spacing:10px;text-align:center;font-weight:900;border:2px solid #0F2A3D;border-radius:8px;outline:none;background:#f8fafc"
              placeholder="••••">
            <div id="mtpSuperError" style="display:none;color:#b91c1c;font-size:11px;font-weight:800;margin-top:5px;text-align:center"></div>
          </div>

          <!-- Teclado Numérico Táctil Compacto -->
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin-bottom:14px">
            <button type="button" class="mtp-kpad-btn" data-val="1">1</button>
            <button type="button" class="mtp-kpad-btn" data-val="2">2</button>
            <button type="button" class="mtp-kpad-btn" data-val="3">3</button>
            <button type="button" class="mtp-kpad-btn" data-val="4">4</button>
            <button type="button" class="mtp-kpad-btn" data-val="5">5</button>
            <button type="button" class="mtp-kpad-btn" data-val="6">6</button>
            <button type="button" class="mtp-kpad-btn" data-val="7">7</button>
            <button type="button" class="mtp-kpad-btn" data-val="8">8</button>
            <button type="button" class="mtp-kpad-btn" data-val="9">9</button>
            <button type="button" class="mtp-kpad-btn" data-val="clear" style="background:#fee2e2;color:#991b1b">Borrar</button>
            <button type="button" class="mtp-kpad-btn" data-val="0">0</button>
            <button type="button" class="mtp-kpad-btn" data-val="back" style="background:#e2e8f0;color:#334155">⌫</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1.3fr;gap:8px">
            <button type="button" id="mtpSuperCancelBtn" class="btn btn-ghost" style="height:34px;font-weight:700">Cancelar</button>
            <button type="button" id="mtpSuperSubmitBtn" class="btn btn-p" style="height:34px;background:#0F2A3D;color:#ffffff;font-weight:900">✔ Autorizar</button>
          </div>
        </div>
      </div>
    `;

    // Estilos inline de los botones del keypad
    var style = document.createElement('style');
    style.textContent = `
      .mtp-kpad-btn {
        height: 38px;
        font-size: 16px;
        font-weight: 800;
        background: #f1f5f9;
        color: #0f172a;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.1s ease;
      }
      .mtp-kpad-btn:active {
        background: #cbd5e1;
        transform: translateY(1px);
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);

    return modal;
  }

  /**
   * requestSupervisorPin(action, reason, onSuccess, onCancel)
   * Despliega el modal pidiendo la autorización de un Encargado o Admin.
   */
  function requestSupervisorPin(action, reason, onSuccess, onCancel) {
    if (typeof document === 'undefined') return;
    var modal = ensureSupervisorModal();

    var reasonEl = document.getElementById('mtpSuperReasonTxt');
    var pinInput = document.getElementById('mtpSuperPinInput');
    var errorEl = document.getElementById('mtpSuperError');
    var submitBtn = document.getElementById('mtpSuperSubmitBtn');
    var cancelBtn = document.getElementById('mtpSuperCancelBtn');
    var closeBtn = document.getElementById('mtpSuperCloseBtn');

    if (reasonEl) reasonEl.textContent = reason || action || 'Acción que requiere autorización';
    if (pinInput) {
      pinInput.value = '';
      setTimeout(function () { pinInput.focus(); }, 60);
    }
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    modal.classList.add('open');

    function cleanup() {
      modal.classList.remove('open');
      if (pinInput) pinInput.value = '';
    }

    function doVerify() {
      var pin = (pinInput ? pinInput.value : '').trim();
      if (!pin) {
        showError('Ingrese el PIN de supervisor');
        return;
      }

      var users = loadUsers().filter(function (u) { return u.active !== false; });
      var validSupervisor = null;

      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        if (hashPin(pin, u.salt) === u.pinHash) {
          // El usuario que autoriza debe ser encargado o admin
          if (u.role === 'admin' || u.role === 'encargado') {
            // Si la acción exige específicamente admin (ej: catalog.edit o maxDiscount superado)
            if (global.MTPPermissions && typeof global.MTPPermissions.canDirectly === 'function') {
              if (global.MTPPermissions.canDirectly(u.role, action)) {
                validSupervisor = u;
                break;
              }
            } else {
              validSupervisor = u;
              break;
            }
          }
        }
      }

      if (validSupervisor) {
        cleanup();
        recordAudit('SUPERVISOR_AUTH_GRANTED', {
          action: action,
          reason: reason,
          supervisorId: validSupervisor.id,
          supervisorRole: validSupervisor.role,
          supervisorName: validSupervisor.name
        });
        if (typeof onSuccess === 'function') {
          onSuccess({
            supervisor: validSupervisor,
            action: action,
            reason: reason,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        showError('PIN inválido o usuario sin nivel de supervisor');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }
    }

    function showError(msg) {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }
    }

    submitBtn.onclick = doVerify;
    cancelBtn.onclick = function () {
      cleanup();
      if (typeof onCancel === 'function') onCancel();
    };
    closeBtn.onclick = function () {
      cleanup();
      if (typeof onCancel === 'function') onCancel();
    };

    pinInput.onkeydown = function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doVerify();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        if (typeof onCancel === 'function') onCancel();
      }
    };

    // Botonera táctil
    var padBtns = modal.querySelectorAll('.mtp-kpad-btn');
    padBtns.forEach(function (btn) {
      btn.onclick = function () {
        var val = btn.getAttribute('data-val');
        if (val === 'clear') {
          pinInput.value = '';
        } else if (val === 'back') {
          pinInput.value = pinInput.value.slice(0, -1);
        } else {
          if (pinInput.value.length < 6) {
            pinInput.value += val;
          }
        }
        if (errorEl) errorEl.style.display = 'none';
        pinInput.focus();
      };
    });
  }

  /* ==========================================================================
     8. Protección de Rutas (Route Guarding)
     ========================================================================== */
  function guardRoute(requiredRole) {
    if (typeof window === 'undefined') return true;

    var path = window.location.pathname.replace(/\\/g, '/');
    var isRoot = path.endsWith('/index.html') || path.endsWith('/') || (!path.includes('/admin/') && !path.includes('/caja/'));

    // En index.html de la raíz no se protege
    if (isRoot && !path.includes('/admin/') && !path.includes('/caja/')) {
      return true;
    }

    var user = getCurrentUser();

    // 1. Sin sesión: redirigir inmediatamente a index.html
    if (!user) {
      console.warn('Acceso denegado: sin sesión activa. Redirigiendo a login...');
      var target = getRelativeIndexPath() + '?redirect=' + encodeURIComponent(window.location.href);
      window.location.href = target;
      return false;
    }

    var role = user.role;
    var isAdminRoute = path.includes('/admin/');
    var isCajaRoute = path.includes('/caja/');

    // 2. Un cajero NO puede abrir rutas de /admin/
    if (isAdminRoute && role === 'cajero') {
      alert('Acceso restringido: El rol Cajero no tiene acceso al Panel Administrador.');
      window.location.href = '../caja/pos.html';
      return false;
    }

    // 3. Vistas restringidas exclusivamente al Administrador
    if (isAdminRoute && role === 'encargado') {
      var adminOnlyPages = ['usuarios.html', 'ajustes.html', 'recetas.html', 'precios.html'];
      var pageName = path.split('/').pop().toLowerCase();
      if (adminOnlyPages.indexOf(pageName) !== -1) {
        alert('Acceso restringido: Esta sección requiere rol de Administrador.');
        window.location.href = 'index.html';
        return false;
      }
    }

    // 4. Si se especificó un rol obligatorio explícito
    if (requiredRole && !hasRole(requiredRole)) {
      alert('Se requiere rol: ' + requiredRole);
      window.location.href = getRelativeIndexPath();
      return false;
    }

    return true;
  }

  function guardCurrentPage() {
    guardRoute();
  }

  /* ==========================================================================
     9. Inicialización de Entorno
     ========================================================================== */
  function init() {
    loadUsers();
    initIdleTimer();
    // Inyectar usuario actual en MTP si ya cargó
    if (global.MTP && global.MTP.state) {
      global.MTP.state.currentUser = getCurrentUser();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  var MTPAuth = {
    init: init,
    hashPin: hashPin,
    sha256: sha256Pure,
    getUsers: getUsers,
    getUserById: getUserById,
    getUserByUsername: getUserByUsername,
    saveUser: saveUser,
    deleteUser: deleteUser,
    setUserPin: setUserPin,
    resetToSeedUsers: resetToSeedUsers,
    getAuditLog: getAuditLog,
    login: login,
    loginByPin: loginByPin,
    logout: logout,
    getCurrentUser: getCurrentUser,
    isAuthenticated: isAuthenticated,
    hasRole: hasRole,
    requestSupervisorPin: requestSupervisorPin,
    guardRoute: guardRoute,
    guardCurrentPage: guardCurrentPage
  };

  global.MTPAuth = MTPAuth;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MTPAuth;
  }
})(typeof window !== 'undefined' ? window : global);
