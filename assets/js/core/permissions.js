/**
 * MI-TIENDA-POS — Matriz de Permisos y Control de Acceso Basado en Roles (RBAC)
 * Implementa PLAN_IMPLEMENTACION_V5 §3.2
 *
 * Roles disponibles:
 *  - admin     : Dueño / Administrador Principal (acceso total)
 *  - encargado : Supervisor de turno (caja + inventario/mermas/compras/reportes operativos)
 *  - cajero    : Operador de mostrador (ventas, cobros, gastos menores, corte ciego)
 */
(function (global) {
  'use strict';

  var ROLES = {
    ADMIN: 'admin',
    ENCARGADO: 'encargado',
    CAJERO: 'cajero'
  };

  var ROLE_LABELS = {
    admin: 'Administrador',
    encargado: 'Encargado de Turno',
    cajero: 'Cajero'
  };

  var ROLE_BADGES = {
    admin: { label: 'Administrador', cls: 'badge-danger', color: '#b91c1c' },
    encargado: { label: 'Encargado', cls: 'badge-blue', color: '#1d4ed8' },
    cajero: { label: 'Cajero', cls: 'badge-green', color: '#15803d' }
  };

  /**
   * Definición exhaustiva de acciones según PLAN_IMPLEMENTACION_V5 §3.2
   * directRoles: roles que pueden ejecutar directamente sin PIN supervisor
   * supervisorFallback: si un rol no está en directRoles, ¿puede desbloquearlo con PIN supervisor?
   */
  var ACTIONS_REGISTRY = {
    // --- Ventas y cobros ---
    'sale.create': {
      label: 'Crear venta / despachar',
      group: 'Ventas',
      directRoles: ['cajero', 'encargado', 'admin']
    },
    'sale.hold': {
      label: 'Poner ticket en espera / mesa',
      group: 'Ventas',
      directRoles: ['cajero', 'encargado', 'admin']
    },
    'payment.add': {
      label: 'Registrar pago / multimoneda',
      group: 'Ventas',
      directRoles: ['cajero', 'encargado', 'admin']
    },
    'sale.discount': {
      label: 'Aplicar descuento comercial',
      group: 'Ventas',
      directRoles: ['encargado', 'admin'],
      supervisorFallback: ['cajero'],
      conditional: function (role, context, settings) {
        var maxEncargado = (settings && typeof settings.maxDiscountPct === 'number') ? settings.maxDiscountPct : 15;
        var pct = context && typeof context.discountPct === 'number' ? context.discountPct : null;
        if (role === 'admin') return { allowed: true, needsSupervisor: false };
        if (role === 'encargado') {
          if (pct === null) return { allowed: true, needsSupervisor: false };
          if (pct <= maxEncargado) return { allowed: true, needsSupervisor: false };
          // Descuento mayor a maxDiscountPct requiere autorización de admin
          return { allowed: false, needsSupervisor: true, supervisorRole: 'admin', reason: 'Descuento mayor a ' + maxEncargado + '%' };
        }
        // Cajero siempre requiere supervisor (encargado o admin)
        return { allowed: false, needsSupervisor: true, supervisorRole: 'encargado', reason: 'Descuento comercial en ticket' };
      }
    },
    'sale.void_line_after_kitchen': {
      label: 'Anular ítem enviado a cocina',
      group: 'Ventas',
      directRoles: ['encargado', 'admin'],
      supervisorFallback: ['cajero'],
      reason: 'Anulación de comanda ya impresa o comandada a cocina'
    },
    'sale.void': {
      label: 'Anular venta completa / cancelar ticket',
      group: 'Ventas',
      directRoles: ['encargado', 'admin'],
      supervisorFallback: ['cajero'],
      reason: 'Cancelación / anulación total de venta'
    },

    // --- Turnos y gaveta ---
    'shift.open': {
      label: 'Apertura de turno de caja',
      group: 'Turnos',
      directRoles: ['cajero', 'encargado', 'admin']
    },
    'shift.close_blind': {
      label: 'Cierre ciego de caja (conteo físico)',
      group: 'Turnos',
      directRoles: ['cajero', 'encargado', 'admin']
    },
    'shift.view_expected': {
      label: 'Ver montos esperados en sistema antes del conteo',
      group: 'Turnos',
      directRoles: ['encargado', 'admin']
    },

    // --- Caja chica y gastos ---
    'expense.create': {
      label: 'Registrar gasto o compra de insumos',
      group: 'Gastos',
      directRoles: ['cajero', 'encargado', 'admin'],
      supervisorFallback: ['cajero'],
      conditional: function (role, context, settings) {
        var limitUsd = (settings && typeof settings.cashierExpenseLimitUsd === 'number') ? settings.cashierExpenseLimitUsd : 20;
        var amount = context && typeof context.amountUsd === 'number' ? context.amountUsd : null;
        if (role === 'admin' || role === 'encargado') return { allowed: true, needsSupervisor: false };
        if (role === 'cajero') {
          if (amount === null) return { allowed: true, needsSupervisor: false };
          if (amount <= limitUsd) return { allowed: true, needsSupervisor: false };
          return {
            allowed: false,
            needsSupervisor: true,
            supervisorRole: 'encargado',
            reason: 'Gasto de caja ($' + amount.toFixed(2) + ') supera el límite de $' + limitUsd.toFixed(2)
          };
        }
        return { allowed: false, needsSupervisor: false };
      }
    },

    // --- Inventario, compras y mermas ---
    'purchase.receive': {
      label: 'Recepción de compras multi-ítem a proveedores',
      group: 'Inventario',
      directRoles: ['encargado', 'admin']
    },
    'waste.record': {
      label: 'Registrar mermas, vencimientos y comida personal',
      group: 'Inventario',
      directRoles: ['encargado', 'admin']
    },
    'stock.audit_adjust': {
      label: 'Ajuste de inventario por auditoría física',
      group: 'Inventario',
      directRoles: ['admin']
    },

    // --- Configuración, precios y recetas ---
    'report.costs_margins': {
      label: 'Ver costos, márgenes de ganancia y rentabilidad',
      group: 'Reportes',
      directRoles: ['admin']
    },
    'catalog.edit': {
      label: 'Editar catálogo de productos y familias',
      group: 'Catálogo',
      directRoles: ['admin']
    },
    'price.edit': {
      label: 'Modificar precios de venta',
      group: 'Precios',
      directRoles: ['admin']
    },
    'rate.edit': {
      label: 'Modificar tasas de cambio (BCV, Euro, USDT)',
      group: 'Precios',
      directRoles: ['admin']
    },
    'recipe.edit': {
      label: 'Editar recetas y gramajes de cocina',
      group: 'Cocina',
      directRoles: ['admin']
    },
    'user.manage': {
      label: 'Crear y administrar usuarios y PINs',
      group: 'Seguridad',
      directRoles: ['admin']
    },
    'fiscal.configure': {
      label: 'Configurar modo e impresora fiscal',
      group: 'Fiscal',
      directRoles: ['admin']
    },

    // --- Impresora fiscal / Reportes ---
    'fiscal.report_x': {
      label: 'Emitir Reporte X de control diario',
      group: 'Fiscal',
      directRoles: ['cajero', 'encargado', 'admin']
    },
    'fiscal.report_z': {
      label: 'Emitir Reporte Z de cierre fiscal',
      group: 'Fiscal',
      directRoles: ['encargado', 'admin']
    }
  };

  /**
   * Extrae la cadena de rol normalizada ('admin', 'encargado', 'cajero')
   */
  function extractRole(userOrRole) {
    if (!userOrRole) return 'cajero';
    if (typeof userOrRole === 'string') return userOrRole.toLowerCase().trim();
    if (typeof userOrRole === 'object' && userOrRole.role) {
      return String(userOrRole.role).toLowerCase().trim();
    }
    return 'cajero';
  }

  function getSettings() {
    if (global.MTP && global.MTP.state && global.MTP.state.settings) {
      return global.MTP.state.settings;
    }
    return {
      maxDiscountPct: 15,
      cashierExpenseLimitUsd: 20
    };
  }

  /**
   * canDirectly(roleOrUser, action, context)
   * Devuelve true si el rol/usuario puede realizar la acción de inmediato
   * sin requerir clave de supervisor.
   */
  function canDirectly(roleOrUser, action, context) {
    var role = extractRole(roleOrUser);
    var act = ACTIONS_REGISTRY[action];
    if (!act) return false;

    if (typeof act.conditional === 'function') {
      var res = act.conditional(role, context, getSettings());
      return !!res.allowed;
    }

    return act.directRoles.indexOf(role) !== -1;
  }

  /**
   * requiresSupervisor(roleOrUser, action, context)
   * Devuelve true si la acción exige autorización por PIN de supervisor (Encargado o Admin).
   */
  function requiresSupervisor(roleOrUser, action, context) {
    var role = extractRole(roleOrUser);
    var act = ACTIONS_REGISTRY[action];
    if (!act) return false;

    if (typeof act.conditional === 'function') {
      var res = act.conditional(role, context, getSettings());
      return !!res.needsSupervisor;
    }

    if (act.supervisorFallback && act.supervisorFallback.indexOf(role) !== -1) {
      return true;
    }

    return false;
  }

  /**
   * can(userOrRole, action, context)
   * Alias estándar de canDirectly para evaluar permisos de un usuario.
   */
  function can(userOrRole, action, context) {
    return canDirectly(userOrRole, action, context);
  }

  /**
   * Retorna metadatos de la acción
   */
  function getActionMeta(action) {
    return ACTIONS_REGISTRY[action] || null;
  }

  /**
   * Retorna todas las acciones registradas
   */
  function getAllActions() {
    return ACTIONS_REGISTRY;
  }

  function getRoleLabel(role) {
    var r = extractRole(role);
    return ROLE_LABELS[r] || r;
  }

  function getRoleBadge(role) {
    var r = extractRole(role);
    return ROLE_BADGES[r] || { label: r, cls: 'badge-ghost', color: '#64748b' };
  }

  var MTPPermissions = {
    ROLES: ROLES,
    ROLE_LABELS: ROLE_LABELS,
    ROLE_BADGES: ROLE_BADGES,
    can: can,
    canDirectly: canDirectly,
    requiresSupervisor: requiresSupervisor,
    extractRole: extractRole,
    getActionMeta: getActionMeta,
    getAllActions: getAllActions,
    getRoleLabel: getRoleLabel,
    getRoleBadge: getRoleBadge
  };

  global.MTPPermissions = MTPPermissions;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MTPPermissions;
  }
})(typeof window !== 'undefined' ? window : global);
