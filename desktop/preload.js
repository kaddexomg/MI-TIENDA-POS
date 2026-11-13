'use strict';

/**
 * desktop/preload.js
 * MI-TIENDA-POS v8.0.0
 *
 * Puente seguro (contextIsolation: true) entre el entorno nativo Electron 22
 * y la interfaz web servida en http://127.0.0.1:<puerto>.
 *
 * Funciones:
 *  1. Expone window.MTPDesktop (impresión nativa silenciosa/diálogo, versión,
 *     carpeta de respaldos, estado del carrito para confirmación de cierre).
 *  2. Mantiene continuidad transparente de localStorage entre puertos efímeros
 *     de localhost mediante respaldo atómico en MTP_DATA_DIR/desktop-localstorage.json.
 */

const { contextBridge, ipcRenderer } = require('electron');

let cachedMeta = null;
function getMetaSync() {
  if (!cachedMeta) {
    try {
      cachedMeta = ipcRenderer.sendSync('mtp:get-meta') || {};
    } catch (_) {
      cachedMeta = { appVersion: '8.0.0', dataDir: '', backupsDir: '', port: 0 };
    }
  }
  return cachedMeta;
}

function isLocalAppOrigin() {
  try {
    return (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.protocol === 'http:' &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    );
  } catch (_) {
    return false;
  }
}

function captureLocalStorageSnapshot() {
  const out = {};
  try {
    if (typeof window === 'undefined' || !window.localStorage) return out;
    const len = window.localStorage.length;
    for (let i = 0; i < len; i++) {
      const k = window.localStorage.key(i);
      if (k !== null && k !== undefined) {
        const v = window.localStorage.getItem(k);
        if (v !== null) out[k] = v;
      }
    }
  } catch (_) {
    // Ignorar errores de acceso en orígenes no válidos
  }
  return out;
}

function hydrateLocalStorageIfNeeded() {
  if (!isLocalAppOrigin()) return;
  try {
    const res = ipcRenderer.sendSync('mtp:storage-hydrate');
    if (!res || !res.shouldApply || !res.data || typeof res.data !== 'object') return;
    if (typeof window !== 'undefined' && window.localStorage && window.localStorage.length === 0) {
      const keys = Object.keys(res.data);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        try {
          window.localStorage.setItem(k, String(res.data[k]));
        } catch (_) {
          // Ignorar límite de cuota por clave
        }
      }
    }
  } catch (_) {
    // Nunca bloquear arranque de la UI si falla la hidratación
  }
}

let lastSavedSnapshotJson = '';

function flushLocalStorageSnapshot(syncMode) {
  if (!isLocalAppOrigin()) return;
  try {
    const snap = captureLocalStorageSnapshot();
    const json = JSON.stringify(snap);
    if (json === lastSavedSnapshotJson) return;
    lastSavedSnapshotJson = json;
    if (syncMode) {
      ipcRenderer.sendSync('mtp:storage-save-sync', snap);
    } else {
      ipcRenderer.send('mtp:storage-save', snap);
    }
  } catch (_) {
    // Ignorar errores transitorios al cerrar
  }
}

// Hidratar ANTES de que los scripts de la página (config.js, auth.js) lean localStorage
hydrateLocalStorageIfNeeded();

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', function () {
    lastSavedSnapshotJson = JSON.stringify(captureLocalStorageSnapshot());
  });

  const storageSyncInterval = setInterval(function () {
    flushLocalStorageSnapshot(false);
  }, 2000);
  if (storageSyncInterval.unref) storageSyncInterval.unref();

  window.addEventListener('pagehide', function () {
    flushLocalStorageSnapshot(true);
  });

  window.addEventListener('beforeunload', function () {
    flushLocalStorageSnapshot(true);
  });
}

const meta = getMetaSync();

contextBridge.exposeInMainWorld('MTPDesktop', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  appVersion: meta.appVersion || '8.0.0',

  getVersion: function () {
    return getMetaSync().appVersion || '8.0.0';
  },

  getInfo: function () {
    return ipcRenderer.invoke('mtp:get-info');
  },

  print: function (options) {
    return ipcRenderer.invoke('mtp:print', options && typeof options === 'object' ? options : {});
  },

  getPrinters: function () {
    return ipcRenderer.invoke('mtp:get-printers');
  },

  openBackupsFolder: function () {
    return ipcRenderer.invoke('mtp:open-backups');
  },

  openDataFolder: function () {
    return ipcRenderer.invoke('mtp:open-data');
  },

  setCartState: function (cartState) {
    const payload = cartState && typeof cartState === 'object'
      ? {
          hasItems: Boolean(cartState.hasItems),
          count: Number(cartState.count || 0),
          totalUsd: Number(cartState.totalUsd || 0)
        }
      : { hasItems: Boolean(cartState), count: 0, totalUsd: 0 };
    try {
      ipcRenderer.send('mtp:cart-state', payload);
    } catch (_) {}
    return payload;
  },

  syncStorageNow: function () {
    flushLocalStorageSnapshot(true);
    return true;
  },

  requestClose: function () {
    return ipcRenderer.invoke('mtp:request-close');
  }
});
