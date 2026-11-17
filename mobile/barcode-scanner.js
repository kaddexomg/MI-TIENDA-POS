/* ==========================================================================
   MI-TIENDA-POS — Escáner Móvil Híbrido de Código de Barras (v8.4)
   - Motor Nativo (BarcodeDetector) + Decodificador Puro JS 1D (EAN-13, EAN-8, Code-128)
   - Control de cámara trasera/frontal, linterna (torch), captura de foto y beep láser
   - Compatible con WebView Android, Chrome/Safari móvil y Node.js (tests)
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MTPMobileScanner = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------------
     1. TABLAS ESTÁNDAR EAN-13 / EAN-8 Y CODE-128 (ISO/IEC 15417 & GS1)
     ------------------------------------------------------------------------ */
  // L-codes y R-codes comparten exactamente las mismas longitudes de 4 elementos:
  // En L: [espacio, barra, espacio, barra]; en R: [barra, espacio, barra, espacio]
  var EAN_LR_PATTERNS = [
    [3, 2, 1, 1], // 0
    [2, 2, 2, 1], // 1
    [2, 1, 2, 2], // 2
    [1, 4, 1, 1], // 3
    [1, 1, 3, 2], // 4
    [1, 2, 3, 1], // 5
    [1, 1, 1, 4], // 6
    [1, 3, 1, 2], // 7
    [1, 2, 1, 3], // 8
    [3, 1, 1, 2]  // 9
  ];

  // G-codes (paridad par en lado izquierdo EAN-13): [espacio, barra, espacio, barra]
  var EAN_G_PATTERNS = [
    [1, 1, 2, 3], // 0
    [1, 2, 2, 2], // 1
    [2, 2, 1, 2], // 2
    [1, 1, 4, 1], // 3
    [2, 3, 1, 1], // 4
    [1, 3, 2, 1], // 5
    [4, 1, 1, 1], // 6
    [2, 1, 3, 1], // 7
    [3, 1, 2, 1], // 8
    [2, 1, 1, 3]  // 9
  ];

  var EAN13_PARITY_MAP = {
    'LLLLLL': '0',
    'LLGLGG': '1',
    'LLGGLG': '2',
    'LLGGGL': '3',
    'LGLLGG': '4',
    'LGGLLG': '5',
    'LGGGLL': '6',
    'LGLGLG': '7',
    'LGLGGL': '8',
    'LGGLGL': '9'
  };

  var CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];

  // Precalcular vectores numéricos y firmas borde-a-borde de Code-128
  var CODE128_NUMS = CODE128_PATTERNS.map(function (str) {
    var arr = [];
    for (var i = 0; i < str.length; i++) arr.push(parseInt(str.charAt(i), 10));
    return arr;
  });

  function computeEan13CheckDigit(digits12) {
    var clean = String(digits12 || '').replace(/\D/g, '');
    if (clean.length < 12) return null;
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      var d = parseInt(clean.charAt(i), 10);
      sum += d * (i % 2 === 0 ? 1 : 3);
    }
    return String((10 - (sum % 10)) % 10);
  }

  function isValidEan13(code) {
    if (!/^\d{13}$/.test(code)) return false;
    return computeEan13CheckDigit(code.slice(0, 12)) === code.charAt(12);
  }

  function computeEan8CheckDigit(digits7) {
    var clean = String(digits7 || '').replace(/\D/g, '');
    if (clean.length < 7) return null;
    var sum = 0;
    for (var i = 0; i < 7; i++) {
      var d = parseInt(clean.charAt(i), 10);
      sum += d * (i % 2 === 0 ? 3 : 1);
    }
    return String((10 - (sum % 10)) % 10);
  }

  function isValidEan8(code) {
    if (!/^\d{8}$/.test(code)) return false;
    return computeEan8CheckDigit(code.slice(0, 7)) === code.charAt(7);
  }

  /* ------------------------------------------------------------------------
     2. MOTOR PURO JS 1D (RUN-LENGTHS + EAN-13 + EAN-8 + CODE-128)
     ------------------------------------------------------------------------ */
  function matchPatternError(runs, offset, pattern, totalModules) {
    var len = pattern.length;
    var sum = 0;
    var i;
    for (i = 0; i < len; i++) {
      sum += runs[offset + i];
    }
    if (sum <= 0) return Infinity;

    var unit = sum / totalModules;
    var totalErr = 0;
    for (i = 0; i < len; i++) {
      var expected = pattern[i] * unit;
      var diff = Math.abs(runs[offset + i] - expected);
      if (diff > 0.65 * unit) return Infinity;
      totalErr += diff / unit;
    }

    // Comparación borde-a-borde (inmune a sangrado de tinta en papel térmico)
    for (i = 0; i < len - 1; i++) {
      var expEdge = (pattern[i] + pattern[i + 1]) * unit;
      var obsEdge = runs[offset + i] + runs[offset + i + 1];
      var edgeDiff = Math.abs(obsEdge - expEdge) / unit;
      if (edgeDiff > 0.55) return Infinity;
      totalErr += edgeDiff * 0.8;
    }
    return totalErr / len;
  }

  function isGuardPattern(runs, offset, widths) {
    var sum = 0;
    var i;
    for (i = 0; i < widths.length; i++) {
      if (runs[offset + i] <= 0) return 0;
      sum += runs[offset + i];
    }
    var avg = sum / widths.length;
    if (avg <= 0) return 0;
    for (i = 0; i < widths.length; i++) {
      var ratio = runs[offset + i] / avg;
      if (ratio < 0.45 || ratio > 1.75) return 0;
    }
    return avg;
  }

  function matchEanDigit(runs, offset, allowG) {
    var bestDigit = -1;
    var bestType = '';
    var bestErr = Infinity;
    var d;

    for (d = 0; d < 10; d++) {
      var errL = matchPatternError(runs, offset, EAN_LR_PATTERNS[d], 7);
      if (errL < bestErr) {
        bestErr = errL;
        bestDigit = d;
        bestType = 'L';
      }
      if (allowG) {
        var errG = matchPatternError(runs, offset, EAN_G_PATTERNS[d], 7);
        if (errG < bestErr) {
          bestErr = errG;
          bestDigit = d;
          bestType = 'G';
        }
      }
    }
    if (bestDigit === -1 || bestErr > 0.48) return null;
    return { digit: String(bestDigit), type: bestType, err: bestErr };
  }

  function decodeEan13FromRuns(runs, strictChecksum) {
    // runs siempre alterna [barra, espacio, barra, espacio, ...]
    // EAN-13 necesita: 3(guard) + 24(izq) + 5(centro) + 24(der) + 3(guard) = 59 elementos
    if (!runs || runs.length < 59) return null;
    var maxStart = runs.length - 59;

    for (var s = 0; s <= maxStart; s += 2) {
      var modW = isGuardPattern(runs, s, [1, 1, 1]);
      if (!modW) continue;
      // Verificar zona silenciosa previa (si existe espacio anterior)
      if (s > 0 && runs[s - 1] < modW * 2.2) continue;

      var centerIdx = s + 3 + 24;
      var cModW = isGuardPattern(runs, centerIdx, [1, 1, 1, 1, 1]);
      if (!cModW) continue;

      var endIdx = centerIdx + 5 + 24;
      var eModW = isGuardPattern(runs, endIdx, [1, 1, 1]);
      if (!eModW) continue;
      if (endIdx + 3 < runs.length && runs[endIdx + 3] < eModW * 2.2) continue;

      var leftDigits = '';
      var parityStr = '';
      var valid = true;
      var i;

      for (i = 0; i < 6; i++) {
        var mL = matchEanDigit(runs, s + 3 + i * 4, true);
        if (!mL) { valid = false; break; }
        leftDigits += mL.digit;
        parityStr += mL.type;
      }
      if (!valid) continue;

      var firstDigit = EAN13_PARITY_MAP[parityStr];
      if (!firstDigit) continue;

      var rightDigits = '';
      for (i = 0; i < 6; i++) {
        var mR = matchEanDigit(runs, centerIdx + 5 + i * 4, false);
        if (!mR) { valid = false; break; }
        rightDigits += mR.digit;
      }
      if (!valid) continue;

      var code13 = firstDigit + leftDigits + rightDigits;
      if (strictChecksum !== false && !isValidEan13(code13)) continue;
      return code13;
    }
    return null;
  }

  function decodeEan8FromRuns(runs, strictChecksum) {
    // EAN-8: 3 + 16 + 5 + 16 + 3 = 43 elementos
    if (!runs || runs.length < 43) return null;
    var maxStart = runs.length - 43;

    for (var s = 0; s <= maxStart; s += 2) {
      var modW = isGuardPattern(runs, s, [1, 1, 1]);
      if (!modW) continue;
      if (s > 0 && runs[s - 1] < modW * 2.2) continue;

      var centerIdx = s + 3 + 16;
      if (!isGuardPattern(runs, centerIdx, [1, 1, 1, 1, 1])) continue;

      var endIdx = centerIdx + 5 + 16;
      var eModW = isGuardPattern(runs, endIdx, [1, 1, 1]);
      if (!eModW) continue;
      if (endIdx + 3 < runs.length && runs[endIdx + 3] < eModW * 2.2) continue;

      var digits = '';
      var valid = true;
      var i;
      for (i = 0; i < 4; i++) {
        var mL = matchEanDigit(runs, s + 3 + i * 4, false);
        if (!mL) { valid = false; break; }
        digits += mL.digit;
      }
      if (!valid) continue;
      for (i = 0; i < 4; i++) {
        var mR = matchEanDigit(runs, centerIdx + 5 + i * 4, false);
        if (!mR) { valid = false; break; }
        digits += mR.digit;
      }
      if (!valid) continue;
      if (strictChecksum !== false && !isValidEan8(digits)) continue;
      return digits;
    }
    return null;
  }

  function matchCode128Symbol(runs, offset) {
    if (offset + 6 > runs.length) return -1;
    var bestSym = -1;
    var bestErr = Infinity;
    for (var s = 0; s <= 105; s++) {
      var err = matchPatternError(runs, offset, CODE128_NUMS[s], 11);
      if (err < bestErr) {
        bestErr = err;
        bestSym = s;
      }
    }
    return bestErr <= 0.48 ? bestSym : -1;
  }

  function isCode128Stop(runs, offset) {
    if (offset + 7 > runs.length) return false;
    var err = matchPatternError(runs, offset, CODE128_NUMS[106], 13);
    if (err > 0.52) return false;
    var sum = 0;
    for (var i = 0; i < 7; i++) sum += runs[offset + i];
    var modW = sum / 13;
    if (offset + 7 < runs.length && runs[offset + 7] < modW * 2.0) return false;
    return true;
  }

  function decodeCode128Symbols(symbols) {
    if (!symbols || symbols.length < 3) return null;
    var startSym = symbols[0];
    var setMode = '';
    if (startSym === 103) setMode = 'A';
    else if (startSym === 104) setMode = 'B';
    else if (startSym === 105) setMode = 'C';
    else return null;

    var checkSym = symbols[symbols.length - 1];
    var dataSyms = symbols.slice(1, symbols.length - 1);
    var checksum = startSym;
    for (var i = 0; i < dataSyms.length; i++) {
      checksum += (i + 1) * dataSyms[i];
    }
    if ((checksum % 103) !== checkSym) return null;

    var out = '';
    var shiftNext = false;
    for (var j = 0; j < dataSyms.length; j++) {
      var code = dataSyms[j];
      var activeSet = setMode;
      if (shiftNext) {
        activeSet = (setMode === 'A') ? 'B' : 'A';
        shiftNext = false;
      }

      if (activeSet === 'C') {
        if (code <= 99) {
          out += (code < 10 ? '0' + code : String(code));
        } else if (code === 100) {
          setMode = 'B';
        } else if (code === 101) {
          setMode = 'A';
        }
      } else if (activeSet === 'B') {
        if (code <= 95) {
          out += String.fromCharCode(code + 32);
        } else if (code === 98) {
          shiftNext = true;
        } else if (code === 99) {
          setMode = 'C';
        } else if (code === 101) {
          setMode = 'A';
        }
      } else if (activeSet === 'A') {
        if (code <= 63) {
          out += String.fromCharCode(code + 32);
        } else if (code <= 95) {
          out += String.fromCharCode(code - 64);
        } else if (code === 98) {
          shiftNext = true;
        } else if (code === 99) {
          setMode = 'C';
        } else if (code === 100) {
          setMode = 'B';
        }
      }
    }
    return out.length > 0 ? out : null;
  }

  function decodeCode128FromRuns(runs) {
    // Mínimo: Start(6) + Data(6) + Check(6) + Stop(7) = 25 elementos
    if (!runs || runs.length < 25) return null;
    for (var s = 0; s <= runs.length - 25; s += 2) {
      var startSym = matchCode128Symbol(runs, s);
      if (startSym !== 103 && startSym !== 104 && startSym !== 105) continue;

      var startSum = 0;
      for (var k = 0; k < 6; k++) startSum += runs[s + k];
      var modW = startSum / 11;
      if (s > 0 && runs[s - 1] < modW * 2.0) continue;

      var symbols = [startSym];
      var pos = s + 6;
      var foundStop = false;
      while (pos + 6 <= runs.length) {
        if (pos + 7 <= runs.length && isCode128Stop(runs, pos)) {
          foundStop = true;
          break;
        }
        var sym = matchCode128Symbol(runs, pos);
        if (sym === -1 || sym >= 103) break;
        symbols.push(sym);
        pos += 6;
        if (symbols.length > 64) break;
      }

      if (foundStop) {
        var text = decodeCode128Symbols(symbols);
        if (text) return text;
      }
    }
    return null;
  }

  function extractRunsFromRow(lum, width, useLocalAdaptive) {
    var minL = 255;
    var maxL = 0;
    var x;
    for (x = 0; x < width; x++) {
      var v = lum[x];
      if (v < minL) minL = v;
      if (v > maxL) maxL = v;
    }
    if (maxL - minL < 22) return null;

    var globalMid = (minL + maxL) * 0.5;
    var thresholds = null;

    if (useLocalAdaptive && width >= 64) {
      var numSegs = 16;
      var segW = width / numSegs;
      var segMin = new Array(numSegs);
      var segMax = new Array(numSegs);
      var k;
      for (k = 0; k < numSegs; k++) {
        var x0 = Math.floor(k * segW);
        var x1 = Math.min(width, Math.ceil((k + 1) * segW));
        var lo = 255;
        var hi = 0;
        for (x = x0; x < x1; x++) {
          if (lum[x] < lo) lo = lum[x];
          if (lum[x] > hi) hi = lum[x];
        }
        segMin[k] = lo;
        segMax[k] = hi;
      }
      thresholds = new Float32Array(width);
      for (x = 0; x < width; x++) {
        var segIdx = Math.min(numSegs - 1, Math.floor(x / segW));
        var sLo = segMin[segIdx];
        var sHi = segMax[segIdx];
        if (segIdx > 0) {
          if (segMin[segIdx - 1] < sLo) sLo = segMin[segIdx - 1];
          if (segMax[segIdx - 1] > sHi) sHi = segMax[segIdx - 1];
        }
        if (segIdx + 1 < numSegs) {
          if (segMin[segIdx + 1] < sLo) sLo = segMin[segIdx + 1];
          if (segMax[segIdx + 1] > sHi) sHi = segMax[segIdx + 1];
        }
        thresholds[x] = (sHi - sLo >= 20) ? ((sLo + sHi) * 0.5) : globalMid;
      }
    }

    var rawRuns = [];
    var firstIsBar = lum[0] < (thresholds ? thresholds[0] : globalMid);
    var currentIsBar = firstIsBar;
    var count = 1;

    for (x = 1; x < width; x++) {
      var th = thresholds ? thresholds[x] : globalMid;
      var isBar = lum[x] < th;
      if (isBar === currentIsBar) {
        count++;
      } else {
        rawRuns.push(count);
        currentIsBar = isBar;
        count = 1;
      }
    }
    rawRuns.push(count);

    // Asegurar que runs[0] siempre sea una barra negra (descartar margen blanco inicial)
    if (!firstIsBar) {
      rawRuns.shift();
    }
    if (rawRuns.length < 25) return null;
    return rawRuns;
  }

  function decodeScanlineRuns(runs, strictChecksum) {
    if (!runs || runs.length < 25) return null;
    // Probar dirección normal e invertida (código al revés 180°)
    var variants = [runs, runs.slice().reverse()];
    for (var v = 0; v < variants.length; v++) {
      var r = variants[v];
      // Si reverse dejó espacio en índice 0, alinear al inicio de barra
      if (r.length > 0 && v === 1 && (runs.length % 2 === 0)) {
        r = r.slice(1);
      }
      var c128 = decodeCode128FromRuns(r);
      if (c128) return { code: c128, format: 'code_128' };

      var e13 = decodeEan13FromRuns(r, strictChecksum);
      if (e13) return { code: e13, format: 'ean_13' };

      var e8 = decodeEan8FromRuns(r, strictChecksum);
      if (e8) return { code: e8, format: 'ean_8' };
    }
    return null;
  }

  function decodeScanline1D(lumRow, options) {
    if (!lumRow || !lumRow.length) return null;
    var strictChecksum = !options || options.strictChecksum !== false;
    var modes = [false, true];
    for (var m = 0; m < modes.length; m++) {
      var runs = extractRunsFromRow(lumRow, lumRow.length, modes[m]);
      if (!runs) continue;
      var hit = decodeScanlineRuns(runs, strictChecksum);
      if (hit) return hit;
    }
    return null;
  }

  function decodeImageData(imageData, options) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) return null;
    var opts = options || {};
    var width = imageData.width;
    var height = imageData.height;
    var data = imageData.data;

    // Escanear 15 bandas horizontales centradas alrededor del visor
    var bands = 15;
    var startY = Math.max(0, Math.floor(height * 0.15));
    var endY = Math.min(height - 1, Math.floor(height * 0.85));
    var stepY = Math.max(1, Math.floor((endY - startY) / bands));

    var lum = new Uint8Array(width);
    var order = [];
    var midY = Math.floor(height / 2);
    order.push(midY);
    for (var d = stepY; d <= Math.max(midY - startY, endY - midY); d += stepY) {
      if (midY - d >= startY) order.push(midY - d);
      if (midY + d <= endY) order.push(midY + d);
    }

    for (var i = 0; i < order.length; i++) {
      var y = order[i];
      var rowOffset = y * width * 4;
      for (var x = 0; x < width; x++) {
        var idx = rowOffset + x * 4;
        // Luminancia ITU-R BT.601
        lum[x] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      }
      var res = decodeScanline1D(lum, opts);
      if (res) {
        return opts.detailed ? res : res.code;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     3. GENERADOR SINTÉTICO DE IMÁGENES DE CÓDIGO DE BARRAS (PARA TESTS/PREVIEW)
     ------------------------------------------------------------------------ */
  function encodeEan13Modules(code) {
    var clean = String(code || '').replace(/\D/g, '');
    if (clean.length === 12) clean += computeEan13CheckDigit(clean);
    if (clean.length !== 13) return null;

    var first = clean.charAt(0);
    var parity = '';
    var keys = Object.keys(EAN13_PARITY_MAP);
    for (var k = 0; k < keys.length; k++) {
      if (EAN13_PARITY_MAP[keys[k]] === first) {
        parity = keys[k];
        break;
      }
    }
    if (!parity) return null;

    var mods = [];
    function pushRun(val, count) {
      for (var c = 0; c < count; c++) mods.push(val);
    }
    // Start guard: 101
    mods.push(1, 0, 1);
    var i;
    for (i = 0; i < 6; i++) {
      var dL = parseInt(clean.charAt(1 + i), 10);
      var pat = (parity.charAt(i) === 'G') ? EAN_G_PATTERNS[dL] : EAN_LR_PATTERNS[dL];
      pushRun(0, pat[0]);
      pushRun(1, pat[1]);
      pushRun(0, pat[2]);
      pushRun(1, pat[3]);
    }
    // Center guard: 01010
    mods.push(0, 1, 0, 1, 0);
    for (i = 0; i < 6; i++) {
      var dR = parseInt(clean.charAt(7 + i), 10);
      var patR = EAN_LR_PATTERNS[dR];
      pushRun(1, patR[0]);
      pushRun(0, patR[1]);
      pushRun(1, patR[2]);
      pushRun(0, patR[3]);
    }
    // End guard: 101
    mods.push(1, 0, 1);
    return mods;
  }

  function encodeCode128Modules(text) {
    var raw = String(text || '').trim();
    if (!raw) return null;
    var symbols = [104]; // Start B
    var checksum = 104;
    for (var i = 0; i < raw.length; i++) {
      var code = raw.charCodeAt(i) - 32;
      if (code < 0 || code > 95) code = 0;
      symbols.push(code);
      checksum += code * (i + 1);
    }
    symbols.push(checksum % 103);
    symbols.push(106);

    var mods = [];
    for (var s = 0; s < symbols.length; s++) {
      var pat = CODE128_PATTERNS[symbols[s]];
      for (var p = 0; p < pat.length; p++) {
        var w = parseInt(pat.charAt(p), 10);
        var isBar = (p % 2 === 0) ? 1 : 0;
        for (var r = 0; r < w; r++) mods.push(isBar);
      }
    }
    return mods;
  }

  function renderSyntheticBarcodeImageData(text, format, opts) {
    var o = opts || {};
    var fmt = String(format || 'CODE128').toUpperCase();
    var modWidth = Math.max(1, parseInt(o.moduleWidth || 3, 10));
    var quietModules = parseInt(o.quietZone || 12, 10);
    var height = parseInt(o.height || 60, 10);

    var mods = (fmt === 'EAN13' || fmt === 'EAN_13')
      ? encodeEan13Modules(text)
      : encodeCode128Modules(text);
    if (!mods) return null;

    var totalMods = quietModules * 2 + mods.length;
    var width = totalMods * modWidth;
    var data = new Uint8ClampedArray(width * height * 4);

    // Fondo blanco
    for (var p = 0; p < data.length; p += 4) {
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = 255;
    }

    for (var m = 0; m < mods.length; m++) {
      if (!mods[m]) continue;
      var xStart = (quietModules + m) * modWidth;
      for (var dx = 0; dx < modWidth; dx++) {
        var x = xStart + dx;
        for (var y = 6; y < height - 6; y++) {
          var idx = (y * width + x) * 4;
          data[idx] = 10;
          data[idx + 1] = 15;
          data[idx + 2] = 25;
          data[idx + 3] = 255;
        }
      }
    }

    return { width: width, height: height, data: data };
  }

  /* ------------------------------------------------------------------------
     4. CONTROL DE CÁMARA MÓVIL, LINTERNA, FOTOS Y BEEP DE PISTOLA LÁSER
     ------------------------------------------------------------------------ */
  var currentStream = null;
  var currentVideo = null;
  var currentInterval = null;
  var currentFacingMode = 'environment';
  var torchEnabled = false;
  var lastCode = '';
  var lastCodeAt = 0;
  var activeLockedCode = '';
  var missedFramesForLock = 0;
  var audioCtx = null;
  var audioUnlocked = false;
  var offscreenCanvas = null;
  var offscreenCtx = null;
  var nativeDetector = null;
  var lastStatusCb = null;
  var lastDetectCb = null;

  function unlockAudio() {
    try {
      if (typeof window === 'undefined') return;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(function () {});
      }
      if (!audioUnlocked && audioCtx.state === 'running') {
        var buf = audioCtx.createBuffer(1, 1, 22050);
        var src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        if (typeof src.start === 'function') src.start(0);
        audioUnlocked = true;
      }
    } catch (e) {}
  }

  if (typeof document !== 'undefined') {
    ['touchstart', 'pointerdown', 'click', 'keydown'].forEach(function (evName) {
      document.addEventListener(evName, unlockAudio, { passive: true, capture: true });
    });
  }

  function hasNativeDetector() {
    return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function';
  }

  function isCameraStreamSupported() {
    return typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';
  }

  function getNativeDetector() {
    if (!hasNativeDetector()) return null;
    if (nativeDetector) return nativeDetector;
    try {
      nativeDetector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
      });
    } catch (e) {
      try {
        nativeDetector = new window.BarcodeDetector();
      } catch (e2) {
        nativeDetector = null;
      }
    }
    return nativeDetector;
  }

  function playBeep(kind) {
    try {
      if (typeof window === 'undefined') return;
      unlockAudio();
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();

      var emitTone = function () {
        try {
          var now = audioCtx.currentTime;
          if (kind === 'err' || kind === 'warn') {
            [0, 0.11].forEach(function (offset) {
              var osc = audioCtx.createOscillator();
              var gain = audioCtx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(320, now + offset);
              gain.gain.setValueAtTime(0.12, now + offset);
              gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.085);
              osc.connect(gain);
              gain.connect(audioCtx.destination);
              osc.start(now + offset);
              osc.stop(now + offset + 0.09);
            });
          } else {
            // Pitido nítido tipo pistola láser de supermercado
            var oscOk = audioCtx.createOscillator();
            var gainOk = audioCtx.createGain();
            oscOk.type = 'triangle';
            oscOk.frequency.setValueAtTime(2150, now);
            oscOk.frequency.exponentialRampToValueAtTime(2650, now + 0.065);
            gainOk.gain.setValueAtTime(0.18, now);
            gainOk.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
            oscOk.connect(gainOk);
            gainOk.connect(audioCtx.destination);
            oscOk.start(now);
            oscOk.stop(now + 0.09);
          }
        } catch (innerErr) {}
      };

      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().then(emitTone).catch(function () {});
      } else {
        emitTone();
      }
    } catch (e) {}

    try {
      if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.vibrate === 'function') {
        window.AndroidBridge.vibrate(kind === 'err' ? 120 : 45);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(kind === 'err' ? [70, 50, 70] : 40);
      }
    } catch (e2) {}
  }

  function ensureCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (offscreenCanvas.width !== w) offscreenCanvas.width = w;
    if (offscreenCanvas.height !== h) offscreenCanvas.height = h;
    return offscreenCtx;
  }

  async function detectFromVideoFrame(videoEl) {
    if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return null;

    var detector = getNativeDetector();
    if (detector) {
      try {
        var nativeHits = await detector.detect(videoEl);
        if (nativeHits && nativeHits.length > 0 && nativeHits[0].rawValue) {
          return {
            code: String(nativeHits[0].rawValue).trim(),
            format: nativeHits[0].format || 'native'
          };
        }
      } catch (e) {}
    }

    // Fallback JS 1D sobre franja central del visor
    var vw = videoEl.videoWidth;
    var vh = videoEl.videoHeight;
    var targetW = Math.min(960, vw);
    var stripH = Math.max(48, Math.min(180, Math.floor(vh * 0.36)));
    var srcY = Math.max(0, Math.floor((vh - stripH) / 2));
    var ctx = ensureCanvas(targetW, stripH);
    if (!ctx) return null;

    ctx.drawImage(videoEl, 0, srcY, vw, stripH, 0, 0, targetW, stripH);
    var imgData = ctx.getImageData(0, 0, targetW, stripH);
    return decodeImageData(imgData, { detailed: true, strictChecksum: true });
  }

  function stopCamera() {
    if (currentInterval) {
      clearInterval(currentInterval);
      currentInterval = null;
    }
    if (currentStream) {
      try {
        currentStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      currentStream = null;
    }
    if (currentVideo) {
      try { currentVideo.srcObject = null; } catch (e2) {}
      currentVideo = null;
    }
    torchEnabled = false;
  }

  async function startCamera(videoOrOpts, onDetectArg, onStatusArg) {
    var opts = {};
    if (videoOrOpts && typeof videoOrOpts === 'object' && videoOrOpts.videoEl) {
      opts = videoOrOpts;
    } else {
      opts = { videoEl: videoOrOpts, onDetect: onDetectArg, onStatus: onStatusArg };
    }

    var videoEl = opts.videoEl;
    var onDetect = typeof opts.onDetect === 'function' ? opts.onDetect : function () {};
    var onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};
    var cooldownMs = Number(opts.cooldownMs || 1400);
    var intervalMs = Number(opts.intervalMs || 140);

    lastDetectCb = onDetect;
    lastStatusCb = onStatus;
    stopCamera();

    if (!videoEl) {
      onStatus({ ok: false, state: 'no-video', message: 'Visor de cámara no encontrado.' });
      return { ok: false, reason: 'no-video' };
    }

    if (!isCameraStreamSupported()) {
      onStatus({
        ok: false,
        state: 'insecure',
        message: 'El navegador bloqueó la cámara en vivo en HTTP. Usa "📸 Foto del código" o la app Android.'
      });
      return { ok: false, reason: 'no-getUserMedia' };
    }

    try {
      if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.ensureCameraPermission === 'function') {
        window.AndroidBridge.ensureCameraPermission();
      }
    } catch (permErr) {}

    onStatus({ ok: true, state: 'starting', message: 'Iniciando cámara...' });

    try {
      var constraints = {
        video: {
          facingMode: { ideal: opts.facingMode || currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      currentVideo = videoEl;
      videoEl.srcObject = currentStream;
      if (typeof videoEl.play === 'function') {
        await videoEl.play().catch(function () {});
      }

      var hasTorch = false;
      try {
        var track = currentStream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          var caps = track.getCapabilities();
          hasTorch = Boolean(caps && caps.torch);
        }
      } catch (eCap) {}

      onStatus({
        ok: true,
        state: 'active',
        hasTorch: hasTorch,
        nativeEngine: hasNativeDetector(),
        message: hasNativeDetector()
          ? 'Apunta al código de barras o QR'
          : 'Escáner 1D activo · Apunta horizontalmente al código'
      });

      var busy = false;
      currentInterval = setInterval(async function () {
        if (busy || !currentVideo || !currentStream) return;
        busy = true;
        try {
          var hit = await detectFromVideoFrame(currentVideo);
          var now = Date.now();
          if (hit && hit.code) {
            missedFramesForLock = 0;
            // Si el mismo código sigue frente a la cámara, NO volver a escanearlo hasta que salga del encuadre
            if (hit.code === activeLockedCode) {
              lastCodeAt = now;
            } else if (hit.code !== lastCode || (now - lastCodeAt) > cooldownMs) {
              activeLockedCode = hit.code;
              lastCode = hit.code;
              lastCodeAt = now;
              onDetect(hit.code, hit);
            }
          } else if (activeLockedCode) {
            missedFramesForLock += 1;
            // Requiere ~6 frames (~800ms) sin ver el código para desbloquear y permitir re-escanear si se vuelve a acercar
            if (missedFramesForLock >= 6 && (now - lastCodeAt) >= 700) {
              activeLockedCode = '';
              missedFramesForLock = 0;
            }
          }
        } catch (frameErr) {
        } finally {
          busy = false;
        }
      }, intervalMs);

      return { ok: true, hasTorch: hasTorch };
    } catch (err) {
      var msg = 'No se pudo abrir la cámara.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        msg = 'Permiso de cámara denegado. Habilítalo en los ajustes del navegador o Android.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'No se detectó cámara disponible en este dispositivo.';
      } else if (err && err.message) {
        msg = 'Cámara no disponible (' + err.message + '). Usa "📸 Foto del código".';
      }
      onStatus({ ok: false, state: 'error', message: msg });
      return { ok: false, reason: err && err.name ? err.name : 'error', message: msg };
    }
  }

  async function toggleTorch() {
    if (!currentStream) return false;
    var track = currentStream.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return false;
    try {
      var next = !torchEnabled;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      torchEnabled = next;
      return torchEnabled;
    } catch (e) {
      return false;
    }
  }

  async function switchCamera() {
    currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
    if (currentVideo && lastDetectCb) {
      return startCamera(currentVideo, lastDetectCb, lastStatusCb);
    }
    return { ok: false };
  }

  function decodeImageFile(file) {
    if (!file || typeof document === 'undefined') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = async function () {
        try {
          var detector = getNativeDetector();
          if (detector) {
            try {
              var hits = await detector.detect(img);
              if (hits && hits.length > 0 && hits[0].rawValue) {
                URL.revokeObjectURL(url);
                resolve({ code: String(hits[0].rawValue).trim(), format: hits[0].format || 'native' });
                return;
              }
            } catch (eNat) {}
          }

          var maxW = Math.min(1280, img.naturalWidth || img.width || 800);
          var ratio = maxW / Math.max(1, img.naturalWidth || img.width || maxW);
          var h = Math.max(40, Math.round((img.naturalHeight || img.height || 600) * ratio));
          var ctx = ensureCanvas(maxW, h);
          if (ctx) {
            ctx.drawImage(img, 0, 0, maxW, h);
            var imgData = ctx.getImageData(0, 0, maxW, h);
            var decoded = decodeImageData(imgData, { detailed: true, strictChecksum: true });
            if (decoded) {
              URL.revokeObjectURL(url);
              resolve(decoded);
              return;
            }
          }
        } catch (err) {}
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  function resetCooldown() {
    lastCode = '';
    lastCodeAt = 0;
    activeLockedCode = '';
    missedFramesForLock = 0;
  }

  return {
    hasNativeDetector: hasNativeDetector,
    isCameraStreamSupported: isCameraStreamSupported,
    computeEan13CheckDigit: computeEan13CheckDigit,
    isValidEan13: isValidEan13,
    computeEan8CheckDigit: computeEan8CheckDigit,
    isValidEan8: isValidEan8,
    decodeScanline1D: decodeScanline1D,
    decodeImageData: decodeImageData,
    renderSyntheticBarcodeImageData: renderSyntheticBarcodeImageData,
    startCamera: startCamera,
    stopCamera: stopCamera,
    toggleTorch: toggleTorch,
    switchCamera: switchCamera,
    decodeImageFile: decodeImageFile,
    playBeep: playBeep,
    resetCooldown: resetCooldown,
    isTorchOn: function () { return torchEnabled; }
  };
});
