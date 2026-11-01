'use strict';

/**
 * server/journal.js
 * MI-TIENDA-POS v5.0.0
 * 
 * Gestor del Diario Transaccional Inmutable Append-Only (journal.ndjson)
 * y Motor de Respaldo Anti-Apagones.
 * 
 * Compatible con Node.js v13.14.0+ (CommonJS puro, sin dependencias externas).
 * Sin operadores opcionales (?.) ni nullish (??) para compatibilidad absoluta con Win7.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Directorio preferido en Windows: C:\MI-TIENDA-DATOS
const PRIMARY_DATA_DIR = 'C:\\MI-TIENDA-DATOS';
const FALLBACK_DATA_DIR = path.resolve(__dirname, '..', 'data');

let resolvedDataDir = null;
let journalPath = null;
let currentSeq = 0;
let journalFd = null;

/**
 * Genera un UUID v4 seguro compatible con Node 13
 */
function generateUuid() {
  const bytes = crypto.randomBytes(16);
  // Version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = bytes.toString('hex');
  return (
    hex.substring(0, 8) + '-' +
    hex.substring(8, 12) + '-' +
    hex.substring(12, 16) + '-' +
    hex.substring(16, 20) + '-' +
    hex.substring(20, 32)
  );
}

/**
 * Resuelve y verifica el directorio de datos con permisos de escritura.
 */
function resolveDataDir() {
  if (resolvedDataDir) {
    return resolvedDataDir;
  }

  // 1. Intentar PRIMARY_DATA_DIR (C:\MI-TIENDA-DATOS)
  try {
    if (!fs.existsSync(PRIMARY_DATA_DIR)) {
      fs.mkdirSync(PRIMARY_DATA_DIR, { recursive: true });
    }
    const testFile = path.join(PRIMARY_DATA_DIR, '.write_test_' + Date.now());
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    resolvedDataDir = PRIMARY_DATA_DIR;
    return resolvedDataDir;
  } catch (err) {
    // Si no se tienen permisos en C:\ o no estamos en Windows, usar fallback local
  }

  // 2. Fallback a ./data relativo a la raíz del proyecto
  try {
    if (!fs.existsSync(FALLBACK_DATA_DIR)) {
      fs.mkdirSync(FALLBACK_DATA_DIR, { recursive: true });
    }
    resolvedDataDir = FALLBACK_DATA_DIR;
    return resolvedDataDir;
  } catch (errFallback) {
    throw new Error('No se pudo inicializar ningún directorio de datos: ' + errFallback.message);
  }
}

/**
 * Obtiene o inicializa el descriptor de archivo para escritura append-only.
 */
function getFd() {
  if (journalFd === null) {
    if (!journalPath) {
      resolveDataDir();
      journalPath = path.join(resolvedDataDir, 'journal.ndjson');
    }
    journalFd = fs.openSync(journalPath, 'a');
  }
  return journalFd;
}

/**
 * Cierra el descriptor de archivo si está abierto.
 */
function closeFd() {
  if (journalFd !== null) {
    try {
      fs.closeSync(journalFd);
    } catch (e) {
      // ignore
    }
    journalFd = null;
  }
}

/**
 * Elimina recursivamente una carpeta y su contenido (compatible con Node 13).
 */
function removeDirRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath);
  for (let i = 0; i < entries.length; i++) {
    const entryPath = path.join(dirPath, entries[i]);
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      removeDirRecursive(entryPath);
    } else {
      fs.unlinkSync(entryPath);
    }
  }
  fs.rmdirSync(dirPath);
}

/**
 * Inicializa el sistema de Journal, escanea eventos previos y determina currentSeq.
 */
function init(customDataDir) {
  if (customDataDir) {
    resolvedDataDir = customDataDir;
    if (!fs.existsSync(resolvedDataDir)) {
      fs.mkdirSync(resolvedDataDir, { recursive: true });
    }
  } else {
    resolveDataDir();
  }

  journalPath = path.join(resolvedDataDir, 'journal.ndjson');
  currentSeq = 0;

  // Asegurar que exista carpeta de respaldos
  const respaldosDir = path.join(resolvedDataDir, 'respaldos');
  if (!fs.existsSync(respaldosDir)) {
    fs.mkdirSync(respaldosDir, { recursive: true });
  }

  // Si existe journal.ndjson, escanear la secuencia máxima
  if (fs.existsSync(journalPath)) {
    let rawContent = '';
    try {
      rawContent = fs.readFileSync(journalPath, 'utf8');
    } catch (readErr) {
      console.error('[Journal] Error al leer journal existente:', readErr.message);
    }

    if (rawContent) {
      const lines = rawContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (typeof ev.seq === 'number' && ev.seq > currentSeq) {
            currentSeq = ev.seq;
          }
        } catch (parseErr) {
          console.warn('[Journal] Línea corrupta en journal (descartada) en pos ' + i + ':', line);
        }
      }
    }
  }

  // Abrir descriptor para append
  getFd();

  return {
    dataDir: resolvedDataDir,
    journalPath: journalPath,
    lastSeq: currentSeq
  };
}

/**
 * Agrega un evento al diario con garantía fsync obligatoria.
 * 
 * @param {Object} eventData Objeto con type, payload, user, etc.
 * @returns {Object} Evento guardado con id, seq, ts, device, synced.
 */
function appendEvent(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    throw new Error('appendEvent requiere un objeto de evento válido');
  }
  if (!eventData.type || typeof eventData.type !== 'string') {
    throw new Error('appendEvent requiere una propiedad "type" válida');
  }

  currentSeq += 1;

  const eventRecord = {
    id: eventData.id || generateUuid(),
    seq: currentSeq,
    ts: eventData.ts || new Date().toISOString(),
    device: eventData.device || 'CAJA-01',
    user: eventData.user || 'sistema',
    type: eventData.type,
    payload: eventData.payload !== undefined ? eventData.payload : {},
    synced: eventData.synced === true
  };

  const line = JSON.stringify(eventRecord) + '\n';
  const buffer = Buffer.from(line, 'utf8');

  try {
    const fd = getFd();
    fs.writeSync(fd, buffer, 0, buffer.length);
    // FORZAR fsyncSync: garantía física de escritura en disco anti-apagones
    fs.fsyncSync(fd);
  } catch (writeErr) {
    // Si falla el descriptor, resetearlo y reintentar una vez
    closeFd();
    try {
      const retryFd = getFd();
      fs.writeSync(retryFd, buffer, 0, buffer.length);
      fs.fsyncSync(retryFd);
    } catch (retryErr) {
      currentSeq -= 1; // revertir contador si falló la persistencia física
      throw new Error('Error crítico al escribir en journal con fsync: ' + retryErr.message);
    }
  }

  return eventRecord;
}

/**
 * Lee todos los eventos desde un número de secuencia (seq > sinceSeq).
 * 
 * @param {number} sinceSeq Secuencia base (default: 0)
 * @returns {Array<Object>} Lista de eventos ordenados por seq ascendente.
 */
function readEventsSince(sinceSeq) {
  const minSeq = typeof sinceSeq === 'number' ? sinceSeq : 0;
  const events = [];

  if (!journalPath || !fs.existsSync(journalPath)) {
    return events;
  }

  // Cerramos momentáneamente para sincronizar lecturas si fuera necesario
  let content = '';
  try {
    content = fs.readFileSync(journalPath, 'utf8');
  } catch (err) {
    console.error('[Journal] Error leyendo eventos:', err.message);
    return events;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      if (typeof ev.seq === 'number' && ev.seq > minSeq) {
        events.push(ev);
      }
    } catch (e) {
      // Ignorar líneas corruptas al final por corte abrupto
    }
  }

  return events;
}

/**
 * Retorna la última secuencia registrada.
 */
function getLastSeq() {
  return currentSeq;
}

/**
 * Retorna la ruta al directorio de datos en uso.
 */
function getDataDir() {
  if (!resolvedDataDir) resolveDataDir();
  return resolvedDataDir;
}

/**
 * Retorna la ruta al archivo journal.ndjson.
 */
function getJournalPath() {
  if (!journalPath) {
    resolveDataDir();
    journalPath = path.join(resolvedDataDir, 'journal.ndjson');
  }
  return journalPath;
}

/**
 * Genera un respaldo diario en C:\MI-TIENDA-DATOS\respaldos\AAAA-MM-DD\
 * y purga respaldos con más de 30 días de antigüedad.
 */
function createDailyBackup() {
  const dataDir = getDataDir();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = year + '-' + month + '-' + day;

  const backupDir = path.join(dataDir, 'respaldos', dateStr);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Respaldar journal.ndjson si existe
  const currentJournal = getJournalPath();
  if (fs.existsSync(currentJournal)) {
    const destJournal = path.join(backupDir, 'journal.ndjson');
    fs.copyFileSync(currentJournal, destJournal);
  }

  // 2. Respaldar snapshot.json si existe
  const currentSnapshot = path.join(dataDir, 'snapshot.json');
  if (fs.existsSync(currentSnapshot)) {
    const destSnapshot = path.join(backupDir, 'snapshot.json');
    fs.copyFileSync(currentSnapshot, destSnapshot);
  }

  // 3. Purga de respaldos mayores a 30 días
  purgeOldBackups(path.join(dataDir, 'respaldos'), 30);

  return {
    ok: true,
    backupDir: backupDir,
    date: dateStr,
    timestamp: now.toISOString()
  };
}

/**
 * Elimina carpetas de respaldos que superen los maxDays días.
 */
function purgeOldBackups(respaldosRootDir, maxDays) {
  if (!fs.existsSync(respaldosRootDir)) return;

  const nowMs = Date.now();
  const maxAgeMs = (maxDays || 30) * 24 * 60 * 60 * 1000;

  try {
    const items = fs.readdirSync(respaldosRootDir);
    for (let i = 0; i < items.length; i++) {
      const folderName = items[i];
      // Verifica formato YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(folderName)) {
        const folderDate = new Date(folderName + 'T00:00:00Z');
        if (!isNaN(folderDate.getTime())) {
          const ageMs = nowMs - folderDate.getTime();
          if (ageMs > maxAgeMs) {
            const oldPath = path.join(respaldosRootDir, folderName);
            try {
              removeDirRecursive(oldPath);
              console.log('[Journal] Respaldo purgado (>30 días):', folderName);
            } catch (delErr) {
              console.warn('[Journal] Error purgando respaldo viejo:', oldPath, delErr.message);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Journal] Error al verificar purga de respaldos:', err.message);
  }
}

module.exports = {
  init: init,
  appendEvent: appendEvent,
  readEventsSince: readEventsSince,
  getLastSeq: getLastSeq,
  getDataDir: getDataDir,
  getJournalPath: getJournalPath,
  createDailyBackup: createDailyBackup,
  close: closeFd,
  generateUuid: generateUuid
};
