'use strict';

/**
 * server/server.js
 * MI-TIENDA-POS v5.0.0
 * 
 * Servidor HTTP Local Híbrido:
 * - Sirve la Aplicación Web Estática (HTML, CSS, JS, SVG)
 * - Provee la API REST Local para Persistencia Transaccional Anti-Apagones
 * 
 * Compatible con Node.js v13.14.0+ (Windows 7 / 32 y 64 bits).
 * Sin módulos nativos compilados. Cero dependencias npm externas.
 * Sin operadores opcionales (?.) ni nullish (??).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const journal = require('./journal');
const stateManager = require('./state');
const api = require('./api');

const DEFAULT_PORT = 7070;
const PROJECT_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject'
};

/**
 * Sirve un archivo estático de forma segura y eficiente.
 */
function serveStaticFile(req, res, pathname) {
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (e) {
    decodedPath = pathname;
  }

  // Si la ruta raíz es '/' o '/login', servir index.html
  if (decodedPath === '/' || decodedPath === '' || decodedPath === '/login') {
    decodedPath = '/index.html';
  }

  // Redirecciones limpias para que las rutas relativas de CSS/JS funcionen siempre
  if (decodedPath === '/caja' || decodedPath === '/caja/' || decodedPath === '/caja/pos.html' || decodedPath === '/admin/pos.html' || decodedPath === '/admin/pos') {
    res.writeHead(302, { 'Location': '/pos.html' });
    res.end();
    return;
  }
  if (decodedPath === '/caja/index.html') {
    res.writeHead(302, { 'Location': '/pos.html?tickets=1' });
    res.end();
    return;
  }
  if (decodedPath === '/admin' || decodedPath === '/admin/') {
    res.writeHead(302, { 'Location': '/admin/index.html' });
    res.end();
    return;
  }

  // Prevenir Directory Traversal fuera de PROJECT_ROOT
  const safeRelativePath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PROJECT_ROOT, safeRelativePath);

  // Verificar que la ruta resultante esté dentro de PROJECT_ROOT
  if (filePath.indexOf(PROJECT_ROOT) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Prohibido: Acceso no permitido fuera del directorio del proyecto');
    return;
  }

  // Soporte de URLs limpias sin .html (ej. /admin/cierres -> /admin/cierres.html)
  if (!path.extname(filePath) && !fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  fs.stat(filePath, function (err, stats) {
    if (err) {
      // 404 No encontrado
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Archivo no encontrado: ' + decodedPath);
      return;
    }

    // Si es un directorio, buscar index.html o pos.html dentro
    if (stats.isDirectory()) {
      const dirIndex = path.join(filePath, 'index.html');
      const dirPos = path.join(filePath, 'pos.html');

      if (fs.existsSync(dirIndex)) {
        filePath = dirIndex;
      } else if (fs.existsSync(dirPos)) {
        filePath = dirPos;
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Directorio sin archivo índice');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', function (streamErr) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Error leyendo archivo: ' + streamErr.message);
    });
    stream.pipe(res);
  });
}

/**
 * Sirve las fotografías de producto guardadas por el dueño.
 * Viven fuera del proyecto (C:\MI-TIENDA-DATOS\media\productos) para que
 * sobrevivan a actualizaciones y no ensucien el repositorio.
 */
function serveProductMedia(req, res, pathname) {
  const MEDIA_PREFIX = '/media/productos/';
  let fileName = '';
  try {
    fileName = path.basename(decodeURIComponent(pathname.slice(MEDIA_PREFIX.length)));
  } catch (e) {
    fileName = '';
  }

  if (!/^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp|gif)$/i.test(fileName)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Foto no encontrada');
    return;
  }

  const filePath = path.join(journal.getDataDir(), 'media', 'productos', fileName);
  fs.stat(filePath, function (err, stats) {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Foto no encontrada');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * Crea e inicializa el servidor HTTP.
 */
function createServer() {
  // 1. Inicializar journal inmutable
  const journalInfo = journal.init();

  // 2. Materializar estado en memoria a partir de snapshot + replay
  const state = stateManager.init(journal);

  console.log('[MTP Server] Base de datos transaccional cargada con éxito.');
  console.log('[MTP Server] Ruta de almacenamiento: ' + journalInfo.dataDir);
  console.log('[MTP Server] Eventos previos registrados: ' + journalInfo.lastSeq);

  // 3. Crear despachador HTTP
  const server = http.createServer(function (req, res) {
    // Cabeceras de seguridad globales
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    const parsedUrl = url.parse(req.url, false);
    const pathname = parsedUrl.pathname || '/';

    // Despacho a API REST
    if (pathname === '/api' || pathname.indexOf('/api/') === 0) {
      api.handleApiRequest(req, res, journal, stateManager);
      return;
    }

    // Fotografías de producto guardadas fuera del proyecto
    if (pathname.indexOf('/media/productos/') === 0) {
      serveProductMedia(req, res, pathname);
      return;
    }

    // Manejo de peticiones preflight OPTIONS fuera de API si ocurriesen
    if (req.method === 'OPTIONS') {
      res.writeHead(204, api.buildCorsHeaders(req, { 'Access-Control-Max-Age': '86400' }));
      res.end();
      return;
    }

    // Despacho de Archivos Estáticos
    serveStaticFile(req, res, pathname);
  });

  return server;
}

/**
 * Inicia el servidor escuchando en el puerto configurado.
 */
function start(portToUse) {
  const port = portToUse || parseInt(process.env.PORT, 10) || DEFAULT_PORT;
  const server = createServer();

  server.listen(port, '0.0.0.0', function () {
    console.log('================================================================');
    console.log('  MI-TIENDA-POS v5.0.0 · Servidor Local + Journal Anti-Apagones');
    console.log('  Puerto de escucha : ' + port);
    console.log('  Acceso local Caja : http://localhost:' + port + '/pos.html');
    console.log('  Acceso local Admin: http://localhost:' + port + '/admin/index.html');
    console.log('  Acceso general    : http://localhost:' + port + '/index.html');
    console.log('  Directorio Datos  : ' + journal.getDataDir());
    console.log('================================================================');
  });

  // Manejo de apagado limpio
  function handleGracefulShutdown(signal) {
    console.log('\n[MTP Server] Señal de apagado recibida (' + signal + '). Guardando snapshot...');
    try {
      stateManager.saveSnapshot();
      journal.close();
      console.log('[MTP Server] Snapshot guardado y journal cerrado correctamente.');
    } catch (e) {
      console.error('[MTP Server] Error en apagado:', e.message);
    }
    process.exit(0);
  }

  process.on('SIGINT', function () { handleGracefulShutdown('SIGINT'); });
  process.on('SIGTERM', function () { handleGracefulShutdown('SIGTERM'); });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = {
  createServer: createServer,
  start: start,
  DEFAULT_PORT: DEFAULT_PORT
};
