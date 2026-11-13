/* ==========================================================================
   MI-TIENDA-POS — code-structure.js (v8.1)
   Estructuración Jerárquica y Subformatos Cortos SIN GUION por Categoría:
   - Alimentos Preparados: EM (Empanadas), PAS (Pastelitos), TEQ (Tequeños),
     PAP (Papas), MAN (Mandocas), AR (Arepas), AL (Almuerzos), CA (Cafetería)
   - Minimercado / Despensa: VIV (Víveres), BEB (Bebidas), CHU (Chucherías),
     CER (Cervezas), CIG (Cigarros)
   ========================================================================== */
(function (root) {
  'use strict';

  const FAMILY_DEFINITIONS = {
    fritos: {
      id: 'fritos',
      name: 'Empanadas y Fritos',
      category: 'Alimentos Preparados',
      defaultPrefix: 'EM',
      subformats: [
        { prefix: 'EM',  label: 'Empanadas', match: /empanada/i, start: 1 },
        { prefix: 'PAS', label: 'Pastelitos', match: /pastelito/i, start: 1 },
        { prefix: 'TEQ', label: 'Tequeños', match: /teque/i, start: 1 },
        { prefix: 'PAP', label: 'Papas Rellenas', match: /papa/i, start: 1 },
        { prefix: 'MAN', label: 'Mandocas', match: /mandoca/i, start: 1 }
      ]
    },
    arepas: {
      id: 'arepas',
      name: 'Arepas Venezolanas',
      category: 'Alimentos Preparados',
      defaultPrefix: 'AR',
      subformats: [
        { prefix: 'AR', label: 'Arepas', match: /.*/i, start: 1 }
      ]
    },
    almuerzos: {
      id: 'almuerzos',
      name: 'Almuerzos y Platos',
      category: 'Alimentos Preparados',
      defaultPrefix: 'AL',
      subformats: [
        { prefix: 'AL', label: 'Almuerzos', match: /.*/i, start: 1 }
      ]
    },
    viveres: {
      id: 'viveres',
      name: 'Víveres de Despensa',
      category: 'Víveres y Mostrador',
      defaultPrefix: 'VIV',
      subformats: [
        { prefix: 'VIV', label: 'Víveres', match: /.*/i, start: 101 }
      ]
    },
    bebidas: {
      id: 'bebidas',
      name: 'Refrescos y Maltas',
      category: 'Bebidas y Líquidos',
      defaultPrefix: 'BEB',
      subformats: [
        { prefix: 'BEB', label: 'Bebidas', match: /.*/i, start: 301 }
      ]
    },
    cafeteria: {
      id: 'cafeteria',
      name: 'Cafetería Recién Colada',
      category: 'Alimentos Preparados',
      defaultPrefix: 'CA',
      subformats: [
        { prefix: 'CA', label: 'Café', match: /.*/i, start: 1 }
      ]
    },
    chucherias: {
      id: 'chucherias',
      name: 'Chucherías y Snacks',
      category: 'Víveres y Mostrador',
      defaultPrefix: 'CHU',
      subformats: [
        { prefix: 'CHU', label: 'Snacks', match: /.*/i, start: 201 }
      ]
    },
    cervezas: {
      id: 'cervezas',
      name: 'Cervezas Frías',
      category: 'Bebidas y Líquidos',
      defaultPrefix: 'CER',
      subformats: [
        { prefix: 'CER', label: 'Cervezas', match: /.*/i, start: 501 }
      ]
    },
    cigarros: {
      id: 'cigarros',
      name: 'Cigarros',
      category: 'Víveres y Mostrador',
      defaultPrefix: 'CIG',
      subformats: [
        { prefix: 'CIG', label: 'Cigarros', match: /.*/i, start: 401 }
      ]
    }
  };

  /**
   * Obtiene el prefijo adecuado para una familia y nombre de producto
   */
  function getPrefixFor(familyId, name = '') {
    const fam = FAMILY_DEFINITIONS[familyId];
    if (!fam) return 'ART';
    if (Array.isArray(fam.subformats)) {
      for (const sf of fam.subformats) {
        if (sf.match && sf.match.test(name)) {
          return sf.prefix;
        }
      }
    }
    return fam.defaultPrefix || 'ART';
  }

  /**
   * Formatea el código de un producto en su representación canónica corta sin guion (ej. EM01, PAS01, VIV101)
   */
  function formatItemCode(item) {
    if (!item) return '00';
    const rawCode = String(item.code || '').trim();
    if (!rawCode) return '00';

    // Si ya tiene un prefijo alfabético (ej: EM01, PAS01, EMP-01 -> EMP01), devolver limpio en mayúsculas sin guion
    if (/^[A-Z]{2,4}-?\d+$/i.test(rawCode)) {
      return rawCode.replace(/-/g, '').toUpperCase();
    }

    const famId = item.familyId || item.group || '';
    const prefix = getPrefixFor(famId, item.name || '');
    const num = parseInt(rawCode, 10);

    if (!isNaN(num)) {
      // Códigos menores a 100 van con 2 dígitos (01..99), mayores van directos
      const pad = num < 100 ? String(num).padStart(2, '0') : String(num);
      return prefix + pad;
    }

    return prefix + rawCode.toUpperCase();
  }

  /**
   * Sugiere el siguiente código numérico o estructurado para un nuevo producto en una categoría
   */
  function suggestNextCode(familyId, name = '') {
    const prefix = getPrefixFor(familyId, name);
    const fam = FAMILY_DEFINITIONS[familyId];
    let startNum = 1;

    if (fam && Array.isArray(fam.subformats)) {
      const matchSf = fam.subformats.find(sf => sf.prefix === prefix);
      if (matchSf && matchSf.start) {
        startNum = matchSf.start;
      }
    }

    // Buscar todos los números existentes en el catálogo con este prefijo o en esta familia
    const existingNums = [];
    if (root.MTP && root.MTP.state) {
      const state = root.MTP.state;
      const allItems = [
        ...(state.variants || []),
        ...(state.retailItems || []),
        ...(state.inventory || [])
      ];

      allItems.forEach(it => {
        const c = String(it.code || '');
        if (c.startsWith(prefix)) {
          const n = parseInt(c.slice(prefix.length), 10);
          if (!isNaN(n)) existingNums.push(n);
        } else if (it.familyId === familyId || it.group === familyId) {
          const n = parseInt(c, 10);
          if (!isNaN(n)) existingNums.push(n);
        }
      });
    }

    let nextNum = startNum;
    if (existingNums.length > 0) {
      const max = Math.max(...existingNums);
      nextNum = Math.max(startNum, max + 1);
    }

    const pad = nextNum < 100 ? String(nextNum).padStart(2, '0') : String(nextNum);
    return {
      prefix,
      number: nextNum,
      formattedCode: prefix + pad,
      codeOnly: pad
    };
  }

  /**
   * Genera un código de barras estándar escaneable para un producto
   */
  function generateStandardBarcode(code, familyId) {
    const clean = String(code || '').replace(/[^a-zA-Z0-9]/g, '');
    const numOnly = String(code || '').replace(/\D/g, '');
    if (numOnly.length >= 7) {
      return numOnly;
    }

    const famCodeMap = {
      fritos: '10',
      arepas: '20',
      almuerzos: '30',
      viveres: '40',
      bebidas: '50',
      cafeteria: '60',
      chucherias: '70',
      cervezas: '80',
      cigarros: '90'
    };

    const famCode = famCodeMap[familyId] || '00';
    const padded = String(numOnly || Math.floor(100 + Math.random() * 900)).padStart(5, '0');
    return `759${famCode}${padded}`;
  }

  root.MTPCodes = {
    FAMILY_DEFINITIONS,
    getPrefixFor,
    formatItemCode,
    suggestNextCode,
    generateStandardBarcode
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MTPCodes;
  }

})(typeof window !== 'undefined' ? window : this);
