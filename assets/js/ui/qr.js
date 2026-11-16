/* ==========================================================================
   MI-TIENDA-POS — MTPQR: Generador de códigos QR 100% offline
   Wrapper ligero sobre assets/js/vendor/qrcode.js (Kazuhiko Arase, MIT).
   Uso: MTPQR.svg('https://...', 180) -> string SVG listo para innerHTML.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../vendor/qrcode.js'));
  } else {
    root.MTPQR = factory(root.qrcode);
  }
})(typeof self !== 'undefined' ? self : this, function (qrcodeLib) {
  'use strict';

  function buildMatrix(text) {
    if (!qrcodeLib) return null;
    const clean = String(text || '');
    if (!clean) return null;
    // typeNumber 0 = automático; nivel M = buen equilibrio tamaño/robustez
    for (let t = 1; t <= 20; t++) {
      try {
        const qr = qrcodeLib(t, 'M');
        qr.addData(clean);
        qr.make();
        const n = qr.getModuleCount();
        const rows = [];
        for (let r = 0; r < n; r++) {
          const row = [];
          for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
          rows.push(row);
        }
        return rows;
      } catch (e) {
        // overflow de capacidad: probar siguiente versión
      }
    }
    return null;
  }

  function svg(text, sizePx) {
    const rows = buildMatrix(text);
    if (!rows) return '';
    const size = Math.max(80, parseInt(sizePx, 10) || 180);
    const n = rows.length;
    const quiet = 4; // zona de silencio estándar
    const total = n + quiet * 2;
    const cell = size / total;
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (rows[r][c]) {
          const x = ((c + quiet) * cell).toFixed(2);
          const y = ((r + quiet) * cell).toFixed(2);
          const w = (cell + 0.3).toFixed(2); // leve solape para evitar líneas blancas al escalar
          path += 'M' + x + ' ' + y + 'h' + w + 'v' + w + 'h-' + w + 'z';
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="Código QR del enlace del escáner">' +
      '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
      '<path d="' + path + '" fill="#0f172a"/>' +
      '</svg>';
  }

  return { svg: svg, matrix: buildMatrix };
});
