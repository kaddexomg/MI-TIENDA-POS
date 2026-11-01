/* ==========================================================================
   MI-TIENDA-POS — Base de Datos Central v3
   - Separación Estricta: Insumos de Cocina (sellable: false) vs Venta al Público
   - Familias Agrupadas (Empanadas, Pastelitos/Tequeños, Papas Rellenas, Almuerzos,
     Cafetería, Chucherías/Pepitos, Refrescos, Cervezas, Cigarros, Víveres)
   - Imágenes Locales Verificadas de Comida Venezolana y Productos Reales
   ========================================================================== */
(function () {
  const STORAGE_KEY = 'mtp_store_v3';

  /* Familias Maestras para la Pantalla de Caja (Agrupación Limpia y Rápida) */
  const POS_GROUPS = [
    {
      id: 'empanadas',
      title: 'Empanadas Venezolanas',
      subtitle: 'Queso · Molida · Mechada · Pollo · Jamón/Queso · Cazón · Pelúa · Chicharrón · Dominó',
      kind: 'dish',
      category: 'Empanadas & Desayunos',
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg'
    },
    {
      id: 'pastelitos',
      title: 'Pastelitos Andinos y Tequeños',
      subtitle: 'Pastelito Queso · Carne · Pollo · Jamón y Queso · Ración de Tequeños',
      kind: 'dish',
      category: 'Empanadas & Desayunos',
      emoji: '🥐',
      img: '../assets/img/productos/pastelitos.jpg'
    },
    {
      id: 'papas',
      title: 'Papas Rellenas Crujientes',
      subtitle: 'Papa Rellena con Carne y Queso · Papa Rellena de Pollo y Queso',
      kind: 'dish',
      category: 'Empanadas & Desayunos',
      emoji: '🥔',
      img: '../assets/img/productos/papa_rellena.jpg'
    },
    {
      id: 'almuerzos',
      title: 'Almuerzos y Platos Fuertes',
      subtitle: 'Pabellón Criollo · Arroz Chino Venezolano · Arroz con Pollo · Pollo Frito con Arepa',
      kind: 'dish',
      category: 'Almuerzos & Platos',
      emoji: '🍛',
      img: '../assets/img/productos/pabellon.jpg'
    },
    {
      id: 'cafe',
      title: 'Cafetería Recién Colada',
      subtitle: 'Café Negro / Guayoyo · Café con Leche Pequeño · Café con Leche Grande',
      kind: 'dish',
      category: 'Cafetería',
      emoji: '☕',
      img: '../assets/img/productos/cafe.jpg'
    },
    {
      id: 'chucherias',
      title: 'Pepitos, Cheetos y Chucherías',
      subtitle: 'Pepito · Cheetos · Chiskesitos · Cheese Tris · Doritos · Papitas · Galletas',
      kind: 'inventory',
      category: 'Chucherías',
      emoji: '🧀',
      img: '../assets/img/productos/pepito.jpg'
    },
    {
      id: 'refrescos',
      title: 'Refrescos y Maltas',
      subtitle: 'Frescolita · Coca-Cola · Pepsi · Chinotto · Golden · Malta Polar (Personal / 1.5L / 2L)',
      kind: 'inventory',
      category: 'Refrescos & Cervezas',
      emoji: '🥤',
      img: '../assets/img/productos/refrescos.jpg'
    },
    {
      id: 'cervezas',
      title: 'Cervezas Bien Frías',
      subtitle: 'Polar Pilsen · Cerveza Zulia · Solera Verde · Solera Azul · Caja / Six-Pack',
      kind: 'inventory',
      category: 'Refrescos & Cervezas',
      emoji: '🍻',
      img: '../assets/img/productos/cervezas.jpg'
    },
    {
      id: 'cigarros',
      title: 'Cigarros (Detal y Cajetilla)',
      subtitle: 'Cigarro Detallado (1 und) · Cajetilla Belmont 20 · Cajetilla Consul 20',
      kind: 'inventory',
      category: 'Cigarros',
      emoji: '🚬',
      img: '../assets/img/productos/cigarros.jpg'
    },
    {
      id: 'viveres',
      title: 'Víveres Empaquetados',
      subtitle: 'Harina P.A.N. 1Kg · Espagueti 1Kg · Arroz 1Kg · Margarina Mavesa',
      kind: 'inventory',
      category: 'Víveres',
      emoji: '🌽',
      img: '../assets/img/productos/viveres.jpg'
    }
  ];

  const DEFAULT_STATE = {
    settings: {
      storeName: 'MI TIENDA POS · Restaurante & Abasto',
      rif: 'J-50128940-1',
      phone: '0412-0000000',
      address: 'Mostrador Principal & Cocina Venezolana',
      legalNotice: 'ORDEN DE DESPACHO / CONTROL INTERNO — DOCUMENTO NO FISCAL (SIN DERECHO A CRÉDITO FISCAL SEGÚN PROVIDENCIA SENIAT)',
      rateBcv: 42.85,
      rateEur: 46.60,
      rateUsdt: 51.40,
      applyIgtf: true,
      igtfPct: 3,
      lastRateSync: new Date().toISOString(),
      targetMarginPct: 42,
      nextOrderNumber: 105
    },

    /* ----------------------------------------------------------------------
       1. INVENTARIO ESTRICTAMENTE SEPARADO:
          A) type: 'insumo' (sellable: false) -> EXCLUSIVO DE COCINA (Papas, Aliños, Carne, Pollo, Harina cocina, Queso relleno)
          B) type: 'venta'  (sellable: true)  -> PRODUCTOS DE VENTA AL PÚBLICO (Víveres, Chucherías, Refrescos, Cervezas, Cigarros)
       ---------------------------------------------------------------------- */
    inventory: [
      // ====================================================================
      // A) INSUMOS EXCLUSIVOS DE COCINA (sellable: false -> NO SALEN EN CAJA)
      // ====================================================================
      {
        id: 'ins-papa',
        code: 'COC-01',
        barcode: '990001',
        name: 'Papa Cruda para Elaboración de Comida y Papas Rellenas',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 25.000,
        minStock: 8.000,
        costUsd: 1.35,
        prevCostUsd: 1.15,
        priceUsd: 0,
        emoji: '🥔',
        img: '../assets/img/productos/papa_rellena.jpg'
      },
      {
        id: 'ins-alinos',
        code: 'COC-02',
        barcode: '990002',
        name: 'Aliños Frescos (Cebolla, Ajo, Pimentón, Cilantro, Ají Dulce, Cebollín)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 8.500,
        minStock: 3.000,
        costUsd: 2.40,
        prevCostUsd: 2.00,
        priceUsd: 0,
        emoji: '🧅',
        img: '../assets/img/productos/pabellon.jpg'
      },
      {
        id: 'ins-harina-cocina',
        code: 'COC-03',
        barcode: '990003',
        name: 'Harina de Maíz/Trigo para Amasar en Cocina (Empanadas/Arepas/Pastelitos)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 22.000,
        minStock: 6.000,
        costUsd: 1.05,
        prevCostUsd: 1.05,
        priceUsd: 0,
        emoji: '🌾',
        img: '../assets/img/productos/viveres.jpg'
      },
      {
        id: 'ins-arroz-cocina',
        code: 'COC-04',
        barcode: '990004',
        name: 'Arroz en Saco para Cocinar (Pabellón / Arroz con Pollo / Arroz Chino)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 30.000,
        minStock: 8.000,
        costUsd: 1.15,
        prevCostUsd: 1.10,
        priceUsd: 0,
        emoji: '🍚',
        img: '../assets/img/productos/arroz_pollo.jpg'
      },
      {
        id: 'ins-carne-mechada',
        code: 'COC-05',
        barcode: '990005',
        name: 'Carne de Res Cruda para Mechar, Moler y Guisar (Cocina)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 16.500,
        minStock: 5.000,
        costUsd: 6.80,
        prevCostUsd: 6.30,
        priceUsd: 0,
        emoji: '🥩',
        img: '../assets/img/productos/pabellon.jpg'
      },
      {
        id: 'ins-pollo-cocina',
        code: 'COC-06',
        barcode: '990006',
        name: 'Pollo Crudo para Freír a la Broaster y Desmechar (Cocina)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 20.000,
        minStock: 6.000,
        costUsd: 3.60,
        prevCostUsd: 3.40,
        priceUsd: 0,
        emoji: '🍗',
        img: '../assets/img/productos/pollo_frito.jpg'
      },
      {
        id: 'ins-queso-cocina',
        code: 'COC-07',
        barcode: '990007',
        name: 'Queso Blanco Llanero y Queso Amarillo para Relleno en Cocina',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 12.400,
        minStock: 4.000,
        costUsd: 5.40,
        prevCostUsd: 4.90,
        priceUsd: 0,
        emoji: '🧀',
        img: '../assets/img/productos/tequenos.jpg'
      },
      {
        id: 'ins-jamon-cocina',
        code: 'COC-08',
        barcode: '990008',
        name: 'Jamón para Relleno de Empanadas, Pastelitos y Arroz Chino',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 6.800,
        minStock: 2.000,
        costUsd: 5.90,
        prevCostUsd: 5.90,
        priceUsd: 0,
        emoji: '🥓',
        img: '../assets/img/productos/pastelitos.jpg'
      },
      {
        id: 'ins-cazon-cocina',
        code: 'COC-09',
        barcode: '990009',
        name: 'Cazón / Pescado para Guiso de Empanadas',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 5.500,
        minStock: 2.000,
        costUsd: 5.20,
        prevCostUsd: 5.00,
        priceUsd: 0,
        emoji: '🐟',
        img: '../assets/img/productos/empanadas.jpg'
      },
      {
        id: 'ins-chicharron-cocina',
        code: 'COC-10',
        barcode: '990010',
        name: 'Chicharrón y Caraotas Negras para Relleno / Pabellón',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 6.800,
        minStock: 2.000,
        costUsd: 5.80,
        prevCostUsd: 5.40,
        priceUsd: 0,
        emoji: '🍖',
        img: '../assets/img/productos/empanadas.jpg'
      },
      {
        id: 'ins-ensalada',
        code: 'COC-11',
        barcode: '990011',
        name: 'Vegetales de Ensalada y Plátanos para Tajadas (Cocina)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 11.000,
        minStock: 3.000,
        costUsd: 1.40,
        prevCostUsd: 1.40,
        priceUsd: 0,
        emoji: '🥗',
        img: '../assets/img/productos/pabellon.jpg'
      },
      {
        id: 'ins-aceite-cocina',
        code: 'COC-12',
        barcode: '990012',
        name: 'Aceite Vegetal para Freír en Cocina (Litros)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'L',
        stock: 18.000,
        minStock: 5.000,
        costUsd: 2.15,
        prevCostUsd: 2.00,
        priceUsd: 0,
        emoji: '🫗',
        img: '../assets/img/productos/empanadas.jpg'
      },
      {
        id: 'ins-cafe-cocina',
        code: 'COC-13',
        barcode: '990013',
        name: 'Café Molido + Azúcar + Leche + Vasos (Insumo Cafetería)',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'kg',
        stock: 4.500,
        minStock: 1.000,
        costUsd: 8.50,
        prevCostUsd: 8.20,
        priceUsd: 0,
        emoji: '☕',
        img: '../assets/img/productos/cafe.jpg'
      },
      {
        id: 'ins-envase',
        code: 'COC-14',
        barcode: '990014',
        name: 'Envases Térmicos, Bolsas y Servilletas de Despacho',
        category: 'Insumos de Cocina (Materia Prima)',
        type: 'insumo',
        sellable: false,
        unit: 'und',
        stock: 220,
        minStock: 50,
        costUsd: 0.15,
        prevCostUsd: 0.15,
        priceUsd: 0,
        emoji: '🥡',
        img: '../assets/img/productos/arroz_chino.jpg'
      },

      // ====================================================================
      // B) PRODUCTOS DE VENTA AL PÚBLICO (sellable: true)
      // ====================================================================
      // --- VÍVERES (group: 'viveres') ---
      {
        id: 'prod-harina-pan',
        code: '101',
        barcode: '7591001000015',
        qrCode: 'QR-HARINA-PAN-1KG',
        group: 'viveres',
        name: 'Harina P.A.N. Blanca Precocida 1 Kg',
        category: 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: true,
        unit: 'und',
        stock: 48,
        minStock: 12,
        costUsd: 1.08,
        prevCostUsd: 1.02,
        priceUsd: 1.55,
        emoji: '🌽',
        img: '../assets/img/productos/viveres.jpg'
      },
      {
        id: 'prod-harina-pan-amarilla',
        code: '102',
        barcode: '7591001000022',
        qrCode: 'QR-HARINA-PAN-AMARILLA',
        group: 'viveres',
        name: 'Harina P.A.N. Amarilla 1 Kg',
        category: 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: true,
        unit: 'und',
        stock: 30,
        minStock: 10,
        costUsd: 1.10,
        prevCostUsd: 1.05,
        priceUsd: 1.60,
        emoji: '🌽',
        img: '../assets/img/productos/viveres.jpg'
      },
      {
        id: 'prod-espagueti',
        code: '103',
        barcode: '7591003000033',
        qrCode: 'QR-ESPAGUETI-1KG',
        group: 'viveres',
        name: 'Espagueti / Pasta Larga Capri 1 Kg',
        category: 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: true,
        unit: 'und',
        stock: 35,
        minStock: 10,
        costUsd: 1.42,
        prevCostUsd: 1.30,
        priceUsd: 2.10,
        emoji: '🍝',
        img: '../assets/img/productos/espagueti.jpg'
      },
      {
        id: 'prod-pasta-corta',
        code: '104',
        barcode: '7591003000040',
        qrCode: 'QR-PASTA-CORTA-1KG',
        group: 'viveres',
        name: 'Pasta Corta Pluma / Tornillo 1 Kg',
        category: 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: true,
        unit: 'und',
        stock: 28,
        minStock: 8,
        costUsd: 1.42,
        prevCostUsd: 1.30,
        priceUsd: 2.10,
        emoji: '🍝',
        img: '../assets/img/productos/espagueti.jpg'
      },
      {
        id: 'prod-arroz-empaque',
        code: '105',
        barcode: '7591002000029',
        qrCode: 'QR-ARROZ-PRIMOR-1KG',
        group: 'viveres',
        name: 'Arroz Blanco Primor Empaque 1 Kg',
        category: 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: true,
        unit: 'und',
        stock: 40,
        minStock: 10,
        costUsd: 1.20,
        prevCostUsd: 1.15,
        priceUsd: 1.80,
        emoji: '🌾',
        img: '../assets/img/productos/viveres.jpg'
      },
      {
        id: 'prod-mavesa',
        code: '106',
        barcode: '7591007000079',
        qrCode: 'QR-MAVESA-500G',
        group: 'viveres',
        name: 'Margarina Mavesa 500g',
        category: 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 22,
        minStock: 6,
        costUsd: 1.85,
        prevCostUsd: 1.85,
        priceUsd: 2.80,
        emoji: '🧈',
        img: '../assets/img/productos/viveres.jpg'
      },

      // --- CHUCHERÍAS Y PEPITOS (group: 'chucherias') ---
      {
        id: 'prod-pepito-peq',
        code: '201',
        barcode: '7592001000112',
        qrCode: 'QR-PEPITO-CLASICO',
        group: 'chucherias',
        name: 'Pepito Original Frito Lay (Paquete Mediano)',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 55,
        minStock: 15,
        costUsd: 0.55,
        prevCostUsd: 0.50,
        priceUsd: 0.95,
        emoji: '🧀',
        img: '../assets/img/productos/pepito.jpg'
      },
      {
        id: 'prod-pepito-gra',
        code: '202',
        barcode: '7592001000129',
        qrCode: 'QR-PEPITO-GRANDE',
        group: 'chucherias',
        name: 'Pepito Familiar Grande 120g',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 30,
        minStock: 8,
        costUsd: 1.35,
        prevCostUsd: 1.25,
        priceUsd: 2.10,
        emoji: '🧀',
        img: '../assets/img/productos/pepito.jpg'
      },
      {
        id: 'prod-cheetos',
        code: '203',
        barcode: '7592001000136',
        qrCode: 'QR-CHEETOS',
        group: 'chucherias',
        name: 'Cheetos Crujientes de Queso',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 42,
        minStock: 10,
        costUsd: 0.65,
        prevCostUsd: 0.60,
        priceUsd: 1.15,
        emoji: '🐆',
        img: '../assets/img/productos/cheetos.jpg'
      },
      {
        id: 'prod-chiskesitos',
        code: '204',
        barcode: '7592001000143',
        qrCode: 'QR-CHISKESITOS',
        group: 'chucherias',
        name: 'Chiskesitos / Cheese Tris Queso',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 48,
        minStock: 12,
        costUsd: 0.55,
        prevCostUsd: 0.50,
        priceUsd: 0.95,
        emoji: '🧀',
        img: '../assets/img/productos/pepito.jpg'
      },
      {
        id: 'prod-doritos',
        code: '205',
        barcode: '7592001000150',
        qrCode: 'QR-DORITOS',
        group: 'chucherias',
        name: 'Doritos Mega Queso Nacho',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 36,
        minStock: 10,
        costUsd: 0.85,
        prevCostUsd: 0.80,
        priceUsd: 1.45,
        emoji: '🔺',
        img: '../assets/img/productos/pepito.jpg'
      },
      {
        id: 'prod-papitas',
        code: '206',
        barcode: '7592001000167',
        qrCode: 'QR-PAPITAS-RUFFLES',
        group: 'chucherias',
        name: 'Papas Fritas Ruffles / Natuchips',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 32,
        minStock: 10,
        costUsd: 0.85,
        prevCostUsd: 0.85,
        priceUsd: 1.40,
        emoji: '🍟',
        img: '../assets/img/productos/pepito.jpg'
      },
      {
        id: 'prod-galletas',
        code: '207',
        barcode: '7592001000174',
        qrCode: 'QR-GALLETAS-OREO',
        group: 'chucherias',
        name: 'Galletas Oreo / Samba / Chocolate Savoy',
        category: 'Chucherías',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 44,
        minStock: 12,
        costUsd: 0.65,
        prevCostUsd: 0.60,
        priceUsd: 1.10,
        emoji: '🍪',
        img: '../assets/img/productos/pepito.jpg'
      },

      // --- CIGARROS (group: 'cigarros') ---
      {
        id: 'prod-cigarro-und',
        code: '301',
        barcode: '7593001000228',
        qrCode: 'QR-CIGARRO-DETAL',
        group: 'cigarros',
        name: 'Cigarro Detallado por Unidad (Belmont / Consul)',
        category: 'Cigarros',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 160,
        minStock: 40,
        costUsd: 0.10,
        prevCostUsd: 0.10,
        priceUsd: 0.20,
        emoji: '🚬',
        img: '../assets/img/productos/cigarros.jpg'
      },
      {
        id: 'prod-cigarro-belmont',
        code: '302',
        barcode: '7593001000211',
        qrCode: 'QR-CIGARROS-BELMONT',
        group: 'cigarros',
        name: 'Cajetilla Belmont 20 Cigarros',
        category: 'Cigarros',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 28,
        minStock: 8,
        costUsd: 1.90,
        prevCostUsd: 1.75,
        priceUsd: 2.90,
        emoji: '🚬',
        img: '../assets/img/productos/cigarros.jpg'
      },
      {
        id: 'prod-cigarro-consul',
        code: '303',
        barcode: '7593001000235',
        qrCode: 'QR-CIGARROS-CONSUL',
        group: 'cigarros',
        name: 'Cajetilla Consul / Universal 20 Cigarros',
        category: 'Cigarros',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 24,
        minStock: 6,
        costUsd: 1.60,
        prevCostUsd: 1.50,
        priceUsd: 2.50,
        emoji: '🚬',
        img: '../assets/img/productos/cigarros.jpg'
      },

      // --- REFRESCOS Y MALTAS (group: 'refrescos') ---
      {
        id: 'prod-frescolita-peq',
        code: '401',
        barcode: '7591005000044',
        qrCode: 'QR-FRESCOLITA-355',
        group: 'refrescos',
        name: 'Frescolita Personal / Lata 355ml',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 48,
        minStock: 12,
        costUsd: 0.65,
        prevCostUsd: 0.65,
        priceUsd: 1.10,
        emoji: '🥤',
        img: '../assets/img/productos/refrescos.jpg'
      },
      {
        id: 'prod-cocacola-peq',
        code: '402',
        barcode: '7591005000045',
        qrCode: 'QR-COCACOLA-355',
        group: 'refrescos',
        name: 'Coca-Cola Personal / Lata 355ml',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 60,
        minStock: 15,
        costUsd: 0.65,
        prevCostUsd: 0.65,
        priceUsd: 1.10,
        emoji: '🥤',
        img: '../assets/img/productos/refrescos.jpg'
      },
      {
        id: 'prod-pepsi-peq',
        code: '403',
        barcode: '7591005000046',
        qrCode: 'QR-PEPSI-355',
        group: 'refrescos',
        name: 'Pepsi / 7Up / Golden Personal 355ml',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 45,
        minStock: 12,
        costUsd: 0.60,
        prevCostUsd: 0.60,
        priceUsd: 1.00,
        emoji: '🥤',
        img: '../assets/img/productos/refrescos.jpg'
      },
      {
        id: 'prod-chinotto-peq',
        code: '404',
        barcode: '7591005000047',
        qrCode: 'QR-CHINOTTO-355',
        group: 'refrescos',
        name: 'Chinotto / Hit Sabores Personal 355ml',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 40,
        minStock: 10,
        costUsd: 0.65,
        prevCostUsd: 0.65,
        priceUsd: 1.10,
        emoji: '🍋',
        img: '../assets/img/productos/refrescos.jpg'
      },
      {
        id: 'prod-malta',
        code: '405',
        barcode: '7591005000068',
        qrCode: 'QR-MALTA-355ML',
        group: 'refrescos',
        name: 'Malta Polar Bien Fría 355ml',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 54,
        minStock: 12,
        costUsd: 0.68,
        prevCostUsd: 0.68,
        priceUsd: 1.15,
        emoji: '🍺',
        img: '../assets/img/productos/refrescos.jpg'
      },
      {
        id: 'prod-refresco-15',
        code: '406',
        barcode: '7591005000051',
        qrCode: 'QR-REFRESCO-15L',
        group: 'refrescos',
        name: 'Refresco Familiar 1.5L (Coca-Cola / Frescolita / Pepsi)',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 30,
        minStock: 8,
        costUsd: 1.45,
        prevCostUsd: 1.35,
        priceUsd: 2.25,
        emoji: '🍾',
        img: '../assets/img/productos/refrescos.jpg'
      },
      {
        id: 'prod-refresco-2l',
        code: '407',
        barcode: '7591005000058',
        qrCode: 'QR-REFRESCO-2L',
        group: 'refrescos',
        name: 'Refresco Jumbo 2 Litros (Coca-Cola / Frescolita / Chinotto)',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 24,
        minStock: 6,
        costUsd: 1.75,
        prevCostUsd: 1.65,
        priceUsd: 2.70,
        emoji: '🍾',
        img: '../assets/img/productos/refrescos.jpg'
      },

      // --- CERVEZAS (group: 'cervezas') ---
      {
        id: 'prod-cerveza-polar',
        code: '501',
        barcode: '7594001000310',
        qrCode: 'QR-CERVEZA-POLAR',
        group: 'cervezas',
        name: 'Cerveza Polar Pilsen (Botella / Lata Bien Fría)',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 96,
        minStock: 24,
        costUsd: 0.72,
        prevCostUsd: 0.68,
        priceUsd: 1.25,
        emoji: '🍻',
        img: '../assets/img/productos/cervezas.jpg'
      },
      {
        id: 'prod-cerveza-zulia',
        code: '502',
        barcode: '7594001000318',
        qrCode: 'QR-CERVEZA-ZULIA',
        group: 'cervezas',
        name: 'Cerveza Zulia Bien Fría (Unidad)',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 72,
        minStock: 18,
        costUsd: 0.75,
        prevCostUsd: 0.70,
        priceUsd: 1.30,
        emoji: '🍺',
        img: '../assets/img/productos/cervezas.jpg'
      },
      {
        id: 'prod-cerveza-solera',
        code: '503',
        barcode: '7594001000327',
        qrCode: 'QR-CERVEZA-SOLERA',
        group: 'cervezas',
        name: 'Cerveza Solera Verde / Azul (Unidad)',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 72,
        minStock: 18,
        costUsd: 0.85,
        prevCostUsd: 0.80,
        priceUsd: 1.45,
        emoji: '🍺',
        img: '../assets/img/productos/cervezas.jpg'
      },
      {
        id: 'prod-cerveza-sixpack',
        code: '504',
        barcode: '7594001000334',
        qrCode: 'QR-SIXPACK-POLAR',
        group: 'cervezas',
        name: 'Six-Pack (6 Cervezas Polar / Zulia)',
        category: 'Refrescos & Cervezas',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: 'und',
        stock: 16,
        minStock: 4,
        costUsd: 4.20,
        prevCostUsd: 4.00,
        priceUsd: 7.00,
        emoji: '🍻',
        img: '../assets/img/productos/cervezas.jpg'
      }
    ],

    /* ----------------------------------------------------------------------
       2. PLATOS DE COMIDA PREPARADA (Con Imágenes Reales Locales + Escandallo)
       ---------------------------------------------------------------------- */
    dishes: [
      // === FAMILIA 1: EMPANADAS VENEZOLANAS (group: 'empanadas') ===
      {
        id: 'dish-emp-queso',
        code: '01',
        barcode: '8800001',
        group: 'empanadas',
        name: 'Empanada de Queso Llanero',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.10,
        emoji: '🥟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-queso-cocina',  qty: 0.055, label: '55 g Queso Blanco' },
          { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-molida',
        code: '02',
        barcode: '8800002',
        group: 'empanadas',
        name: 'Empanada de Carne Molida con Papa y Aliños',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.20,
        emoji: '🥟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-carne-mechada', qty: 0.045, label: '45 g Carne Molida' },
          { insumoId: 'ins-papa',          qty: 0.030, label: '30 g Papa picada' },
          { insumoId: 'ins-alinos',        qty: 0.015, label: '15 g Aliños sofrito' },
          { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-mechada',
        code: '03',
        barcode: '8800003',
        group: 'empanadas',
        name: 'Empanada de Carne Mechada Criolla',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.30,
        emoji: '🥟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.075, label: '75 g Harina Maíz' },
          { insumoId: 'ins-carne-mechada', qty: 0.055, label: '55 g Carne Mechada' },
          { insumoId: 'ins-alinos',        qty: 0.020, label: '20 g Aliños guiso' },
          { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-pollo',
        code: '04',
        barcode: '8800004',
        group: 'empanadas',
        name: 'Empanada de Pollo Guisado',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.25,
        emoji: '🥟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-pollo-cocina',  qty: 0.060, label: '60 g Pollo Desmechado' },
          { insumoId: 'ins-papa',          qty: 0.020, label: '20 g Papa guiso' },
          { insumoId: 'ins-alinos',        qty: 0.018, label: '18 g Aliños' },
          { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-jamon-queso',
        code: '05',
        barcode: '8800005',
        group: 'empanadas',
        name: 'Empanada de Jamón con Queso',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.25,
        emoji: '🥟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-jamon-cocina',  qty: 0.035, label: '35 g Jamón' },
          { insumoId: 'ins-queso-cocina',  qty: 0.035, label: '35 g Queso' },
          { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-cazon',
        code: '06',
        barcode: '8800006',
        group: 'empanadas',
        name: 'Empanada de Cazón Margariteño',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.35,
        emoji: '🐟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-cazon-cocina',  qty: 0.060, label: '60 g Cazón guisado' },
          { insumoId: 'ins-alinos',        qty: 0.025, label: '25 g Aliños y Ají dulce' },
          { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-pelua',
        code: '07',
        barcode: '8800007',
        group: 'empanadas',
        name: 'Empanada Pelúa (Carne Mechada + Queso Amarillo)',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.50,
        emoji: '🧀',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.075, label: '75 g Harina Maíz' },
          { insumoId: 'ins-carne-mechada', qty: 0.050, label: '50 g Carne Mechada' },
          { insumoId: 'ins-queso-cocina',  qty: 0.040, label: '40 g Queso Amarillo' },
          { insumoId: 'ins-alinos',        qty: 0.018, label: '18 g Aliños' },
          { insumoId: 'ins-aceite-cocina', qty: 0.020, label: '20 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-chicharron',
        code: '08',
        barcode: '8800008',
        group: 'empanadas',
        name: 'Empanada de Chicharrón Crujiente',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.40,
        emoji: '🍖',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina',     qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-chicharron-cocina', qty: 0.055, label: '55 g Chicharrón' },
          { insumoId: 'ins-alinos',            qty: 0.015, label: '15 g Aliños' },
          { insumoId: 'ins-aceite-cocina',     qty: 0.018, label: '18 ml Aceite' }
        ]
      },
      {
        id: 'dish-emp-domino',
        code: '09',
        barcode: '8800009',
        group: 'empanadas',
        name: 'Empanada Dominó (Caraotas Negras con Queso Blanco)',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.25,
        emoji: '🥟',
        img: '../assets/img/productos/empanadas.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina',     qty: 0.070, label: '70 g Harina Maíz' },
          { insumoId: 'ins-chicharron-cocina', qty: 0.045, label: '45 g Caraotas refritas' },
          { insumoId: 'ins-queso-cocina',      qty: 0.040, label: '40 g Queso Blanco' },
          { insumoId: 'ins-aceite-cocina',     qty: 0.018, label: '18 ml Aceite' }
        ]
      },

      // === FAMILIA 2: PASTELITOS Y TEQUEÑOS (group: 'pastelitos') ===
      {
        id: 'dish-past-queso',
        code: '10',
        barcode: '8800010',
        group: 'pastelitos',
        name: 'Pastelito Andino de Queso',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.00,
        emoji: '🥐',
        img: '../assets/img/productos/pastelitos.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
          { insumoId: 'ins-queso-cocina',  qty: 0.045, label: '45 g Queso' },
          { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
        ]
      },
      {
        id: 'dish-past-carne',
        code: '11',
        barcode: '8800011',
        group: 'pastelitos',
        name: 'Pastelito Andino de Carne con Arroz/Papa',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.15,
        emoji: '🥐',
        img: '../assets/img/productos/pastelitos.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
          { insumoId: 'ins-carne-mechada', qty: 0.040, label: '40 g Carne Molida' },
          { insumoId: 'ins-papa',          qty: 0.025, label: '25 g Papa pastelito' },
          { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
        ]
      },
      {
        id: 'dish-past-pollo',
        code: '12',
        barcode: '8800012',
        group: 'pastelitos',
        name: 'Pastelito de Pollo Guisado',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.15,
        emoji: '🥐',
        img: '../assets/img/productos/pastelitos.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
          { insumoId: 'ins-pollo-cocina',  qty: 0.045, label: '45 g Pollo' },
          { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
        ]
      },
      {
        id: 'dish-past-pizza',
        code: '13',
        barcode: '8800013',
        group: 'pastelitos',
        name: 'Pastelito de Jamón y Queso (Pizza)',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.15,
        emoji: '🥐',
        img: '../assets/img/productos/pastelitos.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
          { insumoId: 'ins-jamon-cocina',  qty: 0.030, label: '30 g Jamón' },
          { insumoId: 'ins-queso-cocina',  qty: 0.030, label: '30 g Queso' },
          { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
        ]
      },
      {
        id: 'dish-tequenos',
        code: '14',
        barcode: '8800014',
        group: 'pastelitos',
        name: 'Tequeños Venezolanos de Queso (Ración 5 und)',
        category: 'Empanadas & Desayunos',
        priceUsd: 2.00,
        emoji: '🥖',
        img: '../assets/img/productos/tequenos.jpg',
        ingredients: [
          { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Trigo' },
          { insumoId: 'ins-queso-cocina',  qty: 0.100, label: '100 g Queso Blanco' },
          { insumoId: 'ins-aceite-cocina', qty: 0.025, label: '25 ml Aceite' }
        ]
      },

      // === FAMILIA 3: PAPAS RELLENAS (group: 'papas') ===
      {
        id: 'dish-papa-rellena',
        code: '15',
        barcode: '8800015',
        group: 'papas',
        name: 'Papa Rellena Especial con Carne y Queso',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.60,
        emoji: '🥔',
        img: '../assets/img/productos/papa_rellena.jpg',
        ingredients: [
          { insumoId: 'ins-papa',          qty: 0.160, label: '160 g Puré de Papa' },
          { insumoId: 'ins-carne-mechada', qty: 0.055, label: '55 g Carne Guisada' },
          { insumoId: 'ins-queso-cocina',  qty: 0.025, label: '25 g Queso' },
          { insumoId: 'ins-alinos',        qty: 0.020, label: '20 g Aliños' },
          { insumoId: 'ins-harina-cocina', qty: 0.025, label: '25 g Reboso' },
          { insumoId: 'ins-aceite-cocina', qty: 0.025, label: '25 ml Aceite' }
        ]
      },
      {
        id: 'dish-papa-pollo',
        code: '16',
        barcode: '8800016',
        group: 'papas',
        name: 'Papa Rellena de Pollo Guisado y Queso',
        category: 'Empanadas & Desayunos',
        priceUsd: 1.60,
        emoji: '🥔',
        img: '../assets/img/productos/papa_rellena.jpg',
        ingredients: [
          { insumoId: 'ins-papa',          qty: 0.160, label: '160 g Puré de Papa' },
          { insumoId: 'ins-pollo-cocina',  qty: 0.060, label: '60 g Pollo Guisado' },
          { insumoId: 'ins-queso-cocina',  qty: 0.025, label: '25 g Queso' },
          { insumoId: 'ins-alinos',        qty: 0.020, label: '20 g Aliños' },
          { insumoId: 'ins-aceite-cocina', qty: 0.025, label: '25 ml Aceite' }
        ]
      },

      // === FAMILIA 4: ALMUERZOS Y PLATOS FUERTES (group: 'almuerzos') ===
      {
        id: 'dish-pabellon',
        code: '17',
        barcode: '8800017',
        group: 'almuerzos',
        name: 'Pabellón Criollo Venezolano (Carne Mechada, Caraotas, Arroz y Tajadas)',
        category: 'Almuerzos & Platos',
        priceUsd: 5.00,
        emoji: '🇻🇪',
        img: '../assets/img/productos/pabellon.jpg',
        ingredients: [
          { insumoId: 'ins-carne-mechada',     qty: 0.160, label: '160 g Carne Mechada' },
          { insumoId: 'ins-chicharron-cocina', qty: 0.120, label: '120 g Caraotas Negras' },
          { insumoId: 'ins-arroz-cocina',      qty: 0.140, label: '140 g Arroz Blanco' },
          { insumoId: 'ins-ensalada',          qty: 0.120, label: '120 g Tajadas de Plátano' },
          { insumoId: 'ins-queso-cocina',      qty: 0.035, label: '35 g Queso Blanco' },
          { insumoId: 'ins-alinos',            qty: 0.045, label: '45 g Sofrito Criollo' },
          { insumoId: 'ins-envase',            qty: 1,     label: '1 Envase Almuerzo' }
        ]
      },
      {
        id: 'dish-arroz-chino',
        code: '18',
        barcode: '8800018',
        group: 'almuerzos',
        name: 'Arroz Chino Venezolano con Pollo Frito y Tajadas/Lumpias',
        category: 'Almuerzos & Platos',
        priceUsd: 5.00,
        emoji: '🥡',
        img: '../assets/img/productos/arroz_chino.jpg',
        ingredients: [
          { insumoId: 'ins-arroz-cocina',  qty: 0.170, label: '170 g Arroz Frito Venezolano' },
          { insumoId: 'ins-pollo-cocina',  qty: 0.220, label: '220 g Pollo Frito Crujiente' },
          { insumoId: 'ins-jamon-cocina',  qty: 0.040, label: '40 g Jamón picado' },
          { insumoId: 'ins-alinos',        qty: 0.055, label: '55 g Cebollín y Brotes' },
          { insumoId: 'ins-aceite-cocina', qty: 0.030, label: '30 ml Aceite' },
          { insumoId: 'ins-envase',        qty: 1,     label: '1 Envase Grande' }
        ]
      },
      {
        id: 'dish-arroz-pollo',
        code: '19',
        barcode: '8800019',
        group: 'almuerzos',
        name: 'Plato de Arroz con Pollo + Ensalada y Tajadas',
        category: 'Almuerzos & Platos',
        priceUsd: 4.00,
        emoji: '🍛',
        img: '../assets/img/productos/arroz_pollo.jpg',
        ingredients: [
          { insumoId: 'ins-arroz-cocina',  qty: 0.150, label: '150 g Arroz' },
          { insumoId: 'ins-pollo-cocina',  qty: 0.200, label: '200 g Pollo Desmechado' },
          { insumoId: 'ins-papa',          qty: 0.080, label: '80 g Papa/Verdura' },
          { insumoId: 'ins-alinos',        qty: 0.050, label: '50 g Aliños y Pimentón' },
          { insumoId: 'ins-ensalada',      qty: 0.080, label: '80 g Ensalada' },
          { insumoId: 'ins-envase',        qty: 1,     label: '1 Envase Térmico' }
        ]
      },
      {
        id: 'dish-pollo-frito-arepa',
        code: '20',
        barcode: '8800020',
        group: 'almuerzos',
        name: 'Pollo Frito Crujiente a la Broaster con Arepa, Papa y Ensalada',
        category: 'Almuerzos & Platos',
        priceUsd: 4.50,
        emoji: '🍗',
        img: '../assets/img/productos/pollo_frito.jpg',
        ingredients: [
          { insumoId: 'ins-pollo-cocina',  qty: 0.260, label: '260 g Presas de Pollo Frito' },
          { insumoId: 'ins-harina-cocina', qty: 0.090, label: '90 g Harina (Arepitas y Empanizado)' },
          { insumoId: 'ins-papa',          qty: 0.140, label: '140 g Papas Fritas' },
          { insumoId: 'ins-ensalada',      qty: 0.100, label: '100 g Ensalada Rayada' },
          { insumoId: 'ins-alinos',        qty: 0.025, label: '25 g Salsa de Ajo/Aliños' },
          { insumoId: 'ins-aceite-cocina', qty: 0.040, label: '40 ml Aceite fritura' },
          { insumoId: 'ins-envase',        qty: 1,     label: '1 Envase Térmico' }
        ]
      },
      {
        id: 'dish-alm-carne',
        code: '21',
        barcode: '8800021',
        group: 'almuerzos',
        name: 'Almuerzo Criollo de Carne Guisada con Papa y Arroz',
        category: 'Almuerzos & Platos',
        priceUsd: 4.50,
        emoji: '🍲',
        img: '../assets/img/productos/pabellon.jpg',
        ingredients: [
          { insumoId: 'ins-carne-mechada', qty: 0.180, label: '180 g Carne Guisada' },
          { insumoId: 'ins-arroz-cocina',  qty: 0.130, label: '130 g Arroz Blanco' },
          { insumoId: 'ins-papa',          qty: 0.150, label: '150 g Papa en guiso' },
          { insumoId: 'ins-alinos',        qty: 0.045, label: '45 g Aliños sofrito' },
          { insumoId: 'ins-ensalada',      qty: 0.080, label: '80 g Ensalada' },
          { insumoId: 'ins-envase',        qty: 1,     label: '1 Envase Térmico' }
        ]
      },

      // === FAMILIA 5: CAFETERÍA (group: 'cafe') ===
      {
        id: 'dish-cafe-negro',
        code: '22',
        barcode: '8800022',
        group: 'cafe',
        name: 'Café Negro / Guayoyo Recién Colado',
        category: 'Cafetería',
        priceUsd: 0.60,
        emoji: '☕',
        img: '../assets/img/productos/cafe.jpg',
        ingredients: [
          { insumoId: 'ins-cafe-cocina', qty: 0.018, label: '18 g Café + Azúcar + Vaso' }
        ]
      },
      {
        id: 'dish-cafe-leche-peq',
        code: '23',
        barcode: '8800023',
        group: 'cafe',
        name: 'Café con Leche Pequeño / Marrón',
        category: 'Cafetería',
        priceUsd: 0.80,
        emoji: '☕',
        img: '../assets/img/productos/cafe.jpg',
        ingredients: [
          { insumoId: 'ins-cafe-cocina', qty: 0.024, label: '24 g Café + Leche + Vaso' }
        ]
      },
      {
        id: 'dish-cafe-leche',
        code: '24',
        barcode: '8800024',
        group: 'cafe',
        name: 'Café con Leche Cremoso Grande',
        category: 'Cafetería',
        priceUsd: 1.00,
        emoji: '🥛',
        img: '../assets/img/productos/cafe.jpg',
        ingredients: [
          { insumoId: 'ins-cafe-cocina', qty: 0.032, label: '32 g Café + Leche + Azúcar + Vaso' }
        ]
      }
    ],

    /* ----------------------------------------------------------------------
       3. FACTURAS DE PROVEEDORES Y CUENTAS POR PAGAR
       ---------------------------------------------------------------------- */
    invoices: [
      {
        id: 'FAC-1001',
        number: '0004812',
        supplier: 'Verduras El Páramo (Papa, Aliños y Repollo para Cocina)',
        rif: 'J-31290411-0',
        date: '2026-10-31',
        dueDate: '2026-11-07',
        totalUsd: 64.50,
        paidUsd: 30.00,
        status: 'parcial',
        itemsSummary: '30 kg Papa Cocina ($1.35/kg), 10 kg Aliños Frescos ($2.40/kg)'
      },
      {
        id: 'FAC-1002',
        number: '0019204',
        supplier: 'Distribuidora Polar, Víveres y Chucherías C.A.',
        rif: 'J-40118290-3',
        date: '2026-10-30',
        dueDate: '2026-11-06',
        totalUsd: 185.00,
        paidUsd: 0.00,
        status: 'pendiente',
        itemsSummary: '2 Bultos Harina P.A.N., 1 Bulto Espagueti, 3 Cajas Cerveza Polar, Pepitos y Cigarros'
      }
    ],

    /* ----------------------------------------------------------------------
       4. HISTORIAL DE VENTAS Y CUADRE DE CAJA
       ---------------------------------------------------------------------- */
    sales: [
      {
        id: 'ORD-103',
        orderNumber: 103,
        createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
        cashier: 'Caja Principal',
        customer: 'Mostrador Rápido',
        rateBcv: 42.85,
        rateEur: 46.60,
        rateUsdt: 51.40,
        subtotalUsd: 8.55,
        igtfUsd: 0.26,
        totalUsd: 8.81,
        totalBs: 377.51,
        costUsd: 4.10,
        profitUsd: 4.71,
        items: [
          { name: 'Pabellón Criollo Venezolano (Carne Mechada, Caraotas, Arroz y Tajadas)', qty: 1, unit: 'plato', priceUsd: 5.00, subtotalUsd: 5.00, isDish: true },
          { name: 'Empanada Pelúa (Carne Mechada + Queso Amarillo)', qty: 1, unit: 'plato', priceUsd: 1.50, subtotalUsd: 1.50, isDish: true },
          { name: 'Frescolita Personal / Lata 355ml', qty: 1, unit: 'und', priceUsd: 1.10, subtotalUsd: 1.10, isDish: false },
          { name: 'Pepito Original Frito Lay (Paquete Mediano)', qty: 1, unit: 'und', priceUsd: 0.95, subtotalUsd: 0.95, isDish: false }
        ],
        payments: [
          { method: 'Efectivo USD', amountUsd: 10.00, amountBs: 428.50, ref: 'Billete $10', verified: true }
        ],
        changeGiven: {
          totalChangeUsd: 1.19,
          totalChangeBs: 50.99,
          usdCashGiven: 1.00,
          bsCashGiven: 0,
          bsPmGiven: 8.14,
          breakdown: '$1.00 Efectivo USD + 8.14 Bs Pago Móvil'
        }
      },
      {
        id: 'ORD-104',
        orderNumber: 104,
        createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        cashier: 'Caja Principal',
        customer: 'Mesa 1 / Desayuno',
        rateBcv: 42.85,
        rateEur: 46.60,
        rateUsdt: 51.40,
        subtotalUsd: 6.15,
        igtfUsd: 0,
        totalUsd: 6.15,
        totalBs: 263.53,
        costUsd: 2.95,
        profitUsd: 3.20,
        items: [
          { name: 'Empanada de Carne Mechada Criolla', qty: 2, unit: 'plato', priceUsd: 1.30, subtotalUsd: 2.60, isDish: true },
          { name: 'Papa Rellena Especial con Carne y Queso', qty: 1, unit: 'plato', priceUsd: 1.60, subtotalUsd: 1.60, isDish: true },
          { name: 'Harina P.A.N. Blanca Precocida 1 Kg', qty: 1, unit: 'und', priceUsd: 1.55, subtotalUsd: 1.55, isDish: false },
          { name: 'Cigarro Detallado por Unidad (Belmont / Consul)', qty: 2, unit: 'und', priceUsd: 0.20, subtotalUsd: 0.40, isDish: false }
        ],
        payments: [
          { method: 'Pago Móvil', amountUsd: 6.15, amountBs: 263.53, bank: '0102 - Venezuela', phone: '0412-5551920', ref: '948210', verified: true }
        ],
        changeGiven: {
          totalChangeUsd: 0,
          totalChangeBs: 0,
          usdCashGiven: 0,
          bsCashGiven: 0,
          bsPmGiven: 0,
          breakdown: 'Pago exacto verificado'
        }
      }
    ],

    /* ----------------------------------------------------------------------
       5. GASTOS OPERATIVOS, CAJA CHICA Y SALIDAS DE EFECTIVO
       ---------------------------------------------------------------------- */
    expenses: [
      {
        id: 'GAS-101',
        createdAt: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
        category: 'Insumos Menores / Hielo y Bolsas',
        description: 'Compra de 4 bolsas de hielo para cavas y 2 paquetes de bolsas plásticas',
        paymentSource: 'Efectivo USD',
        amountUsd: 4.50,
        amountBs: 192.83,
        rateUsed: 42.85,
        responsible: 'Caja Principal'
      },
      {
        id: 'GAS-102',
        createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
        category: 'Flete / Transporte',
        description: 'Pago de carrera motorizado búsqueda de verduras y aliños frescos',
        paymentSource: 'Pago Móvil',
        amountUsd: 3.00,
        amountBs: 128.55,
        rateUsed: 42.85,
        responsible: 'Administrador'
      }
    ],

    /* ----------------------------------------------------------------------
       6. TICKETS EN ESPERA / CUENTAS ABIERTAS EN MOSTRADOR (F3)
       ---------------------------------------------------------------------- */
    heldOrders: [
      {
        id: 'HOLD-1',
        customer: 'Mesa 2 (Familia esperando almuerzo)',
        createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        items: [
          {
            cartId: 'c-hold-1',
            refId: 'dish-emp-mechada',
            code: '03',
            name: 'Empanada de Carne Mechada Criolla',
            isDish: true,
            unit: 'plato',
            qty: 3,
            priceUsd: 1.30,
            note: 'Bien fritas'
          },
          {
            cartId: 'c-hold-2',
            refId: 'prod-malta',
            code: '405',
            name: 'Malta Polar Bien Fría 355ml',
            isDish: false,
            unit: 'und',
            qty: 2,
            priceUsd: 1.15,
            note: ''
          }
        ]
      }
    ],

    /* ----------------------------------------------------------------------
       7. TANDAS DE PRODUCCIÓN DE COCINA (CONTROL SALIDA A OLLA / BATEA)
       ---------------------------------------------------------------------- */
    kitchenBatches: [
      {
        id: 'TANDA-01',
        date: new Date().toISOString().slice(0, 10),
        shift: 'Mañana (Desayunos / Empanadas)',
        notes: 'Salida inicial para batea de empanadas y papas rellenas',
        insumosUsed: [
          { insumoId: 'ins-harina-cocina', name: 'Harina Maíz/Trigo Cocina', qty: 4.0, unit: 'kg', costUsd: 4.20 },
          { insumoId: 'ins-carne-mechada', name: 'Carne Mechada/Molida', qty: 2.0, unit: 'kg', costUsd: 13.60 },
          { insumoId: 'ins-queso-cocina', name: 'Queso Blanco/Amarillo', qty: 1.5, unit: 'kg', costUsd: 8.10 },
          { insumoId: 'ins-papa', name: 'Papa Cruda Cocina', qty: 2.5, unit: 'kg', costUsd: 3.38 }
        ],
        expectedPieces: 65,
        actualPieces: 64
      }
    ],

    /* ----------------------------------------------------------------------
       8. PROVEEDORES REGISTRADOS (COMPRAS Y RECEPCIÓN DE MERCANCÍA)
       ---------------------------------------------------------------------- */
    suppliers: [
      { id: 'prov-polar', name: 'Empresas Polar C.A. / Distribuidora Oriente', rif: 'J-00006543-0', phone: '0414-2223344', category: 'Harina PAN, Cervezas, Maltas, Pepsi' },
      { id: 'prov-verduras', name: 'Mayorista de Verduras y Aliños Frescos', rif: 'V-15889021-4', phone: '0424-7778899', category: 'Papas, Cebolla, Ají Dulce, Pimentón, Ajo' },
      { id: 'prov-carnes', name: 'Distribuidora Frigorífica Central Don Pedro', rif: 'J-31456789-0', phone: '0412-9990011', category: 'Carne de Res, Pollo Beneficiado, Cazón' },
      { id: 'prov-lacteos', name: 'Lácteos & Charcutería San Antonio', rif: 'J-40112233-5', phone: '0416-5554433', category: 'Queso Blanco Llanero, Jamón, Margarina' },
      { id: 'prov-snacks', name: 'Distribuidora Confitería & Snacks Venezolanos', rif: 'J-29887766-1', phone: '0414-1122334', category: 'Pepitos, Cheese Tris, Doritos, Galletas' }
    ],

    /* ----------------------------------------------------------------------
       9. RECEPCIONES Y COMPRAS MULTI-ÍTEM A PROVEEDORES
       ---------------------------------------------------------------------- */
    purchases: [
      {
        id: 'CMP-101',
        createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        docNumber: 'FAC-7820',
        supplier: 'Empresas Polar C.A. / Distribuidora Oriente',
        paymentMethod: 'Efectivo USD',
        totalUsd: 47.50,
        totalBs: 2035.38,
        itemsCount: 2,
        items: [
          {
            itemId: 'prod-harina-pan',
            name: 'Harina P.A.N. Blanca 1Kg',
            unit: 'und',
            packsCount: 1,
            unitsPerPack: 20,
            totalUnits: 20,
            packCostUsd: 21.60,
            unitCostUsd: 1.08,
            totalCostUsd: 21.60
          },
          {
            itemId: 'prod-cerveza-polar',
            name: 'Cerveza Polar Pilsen Terciada 330ml',
            unit: 'und',
            packsCount: 1,
            unitsPerPack: 36,
            totalUnits: 36,
            packCostUsd: 25.90,
            unitCostUsd: 0.72,
            totalCostUsd: 25.90
          }
        ],
        notes: 'Recepción de reposición matutina con factura legal de despacho',
        responsible: 'Administrador'
      }
    ],

    /* ----------------------------------------------------------------------
       10. REGISTRO FORMAL DE MERMAS, VENCIMIENTOS Y AUTOCONSUMO
       ---------------------------------------------------------------------- */
    wasteRecords: [
      {
        id: 'MRM-101',
        createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        itemId: 'ins-papa',
        itemCode: 'COC-01',
        itemName: 'Papa Cruda para Cocina',
        qty: 1.5,
        unit: 'kg',
        unitCostUsd: 1.35,
        totalCostUsd: 2.03,
        reason: 'Deterioro / Descomposición',
        responsible: 'Cocinero Turno Mañana',
        notes: 'Papas húmedas descartadas al lavar el saco'
      }
    ],

    /* ----------------------------------------------------------------------
       11. LIBRO MAYOR KARDEX: MOVIMIENTOS HISTÓRICOS INMUTABLES
       ---------------------------------------------------------------------- */
    kardex: [
      {
        id: 'KDX-001',
        timestamp: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
        itemId: 'prod-harina-pan',
        itemCode: 'PAN-01',
        itemName: 'Harina P.A.N. Blanca 1Kg',
        itemType: 'venta',
        action: 'COMPRA',
        qty: 20,
        unit: 'und',
        costUsd: 1.08,
        prevStock: 12.0,
        nextStock: 32.0,
        docRef: 'FAC-7820',
        supplier: 'Empresas Polar C.A. / Distribuidora Oriente',
        responsible: 'Administrador',
        notes: 'Entrada bulto 20 unidades'
      },
      {
        id: 'KDX-002',
        timestamp: new Date(Date.now() - 1000 * 60 * 190).toISOString(),
        itemId: 'prod-cerveza-polar',
        itemCode: 'CER-01',
        itemName: 'Cerveza Polar Pilsen Terciada 330ml',
        itemType: 'venta',
        action: 'COMPRA',
        qty: 36,
        unit: 'und',
        costUsd: 0.72,
        prevStock: 14.0,
        nextStock: 50.0,
        docRef: 'FAC-7820',
        supplier: 'Empresas Polar C.A. / Distribuidora Oriente',
        responsible: 'Administrador',
        notes: 'Entrada caja 36 botellas'
      },
      {
        id: 'KDX-003',
        timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        itemId: 'ins-papa',
        itemCode: 'COC-01',
        itemName: 'Papa Cruda para Cocina',
        itemType: 'insumo',
        action: 'MERMA',
        qty: -1.5,
        unit: 'kg',
        costUsd: 1.35,
        prevStock: 26.5,
        nextStock: 25.0,
        docRef: 'MRM-101',
        supplier: '',
        responsible: 'Cocinero Turno Mañana',
        notes: 'Papas húmedas descartadas al lavar saco'
      }
    ],

    /* ----------------------------------------------------------------------
       12. TERMINALES DE PUNTO DE VENTA (TARJETAS DÉBITO/CRÉDITO Y BIOPAGO)
       ---------------------------------------------------------------------- */
    posTerminals: [
      {
        id: 'term-bancamiga',
        name: 'Punto Bancamiga Pax A920',
        bank: '0172 - Bancamiga',
        currentBatch: '0014',
        model: 'Pax A920 SmartPOS 4G',
        status: 'ACTIVO'
      },
      {
        id: 'term-banesco',
        name: 'Punto Banesco Verifone Vx520',
        bank: '0134 - Banesco',
        currentBatch: '0038',
        model: 'Verifone Vx520 Dial/IP',
        status: 'ACTIVO'
      },
      {
        id: 'term-biopago',
        name: 'Biopago Banco de Venezuela (Huella/Cédula)',
        bank: '0102 - Venezuela',
        currentBatch: '0009',
        model: 'Biopago BDV USB',
        status: 'ACTIVO'
      }
    ],

    /* ----------------------------------------------------------------------
       13. CUENTAS BANCARIAS RECEPTORAS DE PAGO MÓVIL DEL NEGOCIO
       ---------------------------------------------------------------------- */
    pagoMovilAccounts: [
      {
        id: 'pm-banesco',
        name: 'Banesco Comercio (Cuenta Principal)',
        bank: '0134 - Banesco',
        phone: '0412-1234567',
        rif: 'J-50128940-1',
        holder: 'MI TIENDA POS C.A.',
        isDefault: true
      },
      {
        id: 'pm-bdv',
        name: 'Banco de Venezuela (Cuenta Recaudadora)',
        bank: '0102 - Venezuela',
        phone: '0414-9876543',
        rif: 'J-50128940-1',
        holder: 'MI TIENDA POS C.A.',
        isDefault: false
      },
      {
        id: 'pm-bancamiga',
        name: 'Bancamiga Pago Móvil Interbancario',
        bank: '0172 - Bancamiga',
        phone: '0424-5551122',
        rif: 'J-50128940-1',
        holder: 'MI TIENDA POS C.A.',
        isDefault: false
      }
    ],

    /* ----------------------------------------------------------------------
       14. CIERRES DE LOTE DE PUNTOS DE VENTA (AUDITORÍA FÍSICA VS SISTEMA)
       ---------------------------------------------------------------------- */
    batchClosures: [
      {
        id: 'LOTE-CLS-001',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        terminalId: 'term-bancamiga',
        terminalName: 'Punto Bancamiga Pax A920',
        bank: '0172 - Bancamiga',
        batchNumber: '0013',
        systemTxCount: 14,
        systemTotalBs: 1540.20,
        physicalTxCount: 14,
        physicalTotalBs: 1540.20,
        differenceBs: 0.00,
        status: 'CUADRADO',
        cashier: 'Cajero Turno Tarde',
        notes: 'Cierre de lote exacto sin descuadres'
      }
    ]
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATE));
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
      const parsed = JSON.parse(raw);
      const merged = Object.assign({}, DEFAULT_STATE, parsed);
      if (!Array.isArray(merged.expenses)) merged.expenses = JSON.parse(JSON.stringify(DEFAULT_STATE.expenses));
      if (!Array.isArray(merged.heldOrders)) merged.heldOrders = JSON.parse(JSON.stringify(DEFAULT_STATE.heldOrders));
      if (!Array.isArray(merged.kitchenBatches)) merged.kitchenBatches = JSON.parse(JSON.stringify(DEFAULT_STATE.kitchenBatches));
      if (!Array.isArray(merged.suppliers)) merged.suppliers = JSON.parse(JSON.stringify(DEFAULT_STATE.suppliers));
      if (!Array.isArray(merged.purchases)) merged.purchases = JSON.parse(JSON.stringify(DEFAULT_STATE.purchases));
      if (!Array.isArray(merged.wasteRecords)) merged.wasteRecords = JSON.parse(JSON.stringify(DEFAULT_STATE.wasteRecords));
      if (!Array.isArray(merged.kardex)) merged.kardex = JSON.parse(JSON.stringify(DEFAULT_STATE.kardex));
      if (!Array.isArray(merged.posTerminals)) merged.posTerminals = JSON.parse(JSON.stringify(DEFAULT_STATE.posTerminals));
      if (!Array.isArray(merged.pagoMovilAccounts)) merged.pagoMovilAccounts = JSON.parse(JSON.stringify(DEFAULT_STATE.pagoMovilAccounts));
      if (!Array.isArray(merged.batchClosures)) merged.batchClosures = JSON.parse(JSON.stringify(DEFAULT_STATE.batchClosures || []));
      return merged;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  let localFileHandle = null;

  function saveState(newState) {
    try {
      const jsonStr = JSON.stringify(newState);
      localStorage.setItem(STORAGE_KEY, jsonStr);
      // Espejo en IndexedDB para blindaje adicional en Windows 7
      try {
        if (window.indexedDB) {
          const req = window.indexedDB.open('MTP_LOCAL_DB', 1);
          req.onupgradeneeded = function (ev) {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
          };
          req.onsuccess = function (ev) {
            const db = ev.target.result;
            const tx = db.transaction('store', 'readwrite');
            tx.objectStore('store').put(jsonStr, 'mtp_backup_latest');
          };
        }
      } catch (_) {}
      // Si el usuario vinculó archivo físico en disco duro, autoguardar
      if (localFileHandle && localFileHandle.createWritable) {
        localFileHandle.createWritable().then(writable => {
          writable.write(jsonStr).then(() => writable.close());
        }).catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('mtp:state-updated', { detail: newState }));
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }

  const state = loadState();

  function getFallbackSvgDataUri(title, emoji) {
    const safeTitle = String(title || 'Producto').slice(0, 22).replace(/[<>&"']/g, '');
    const ico = emoji || '🍲';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#064e3b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#g)"/>
      <text x="160" y="95" text-anchor="middle" font-size="54">${ico}</text>
      <text x="160" y="148" text-anchor="middle" fill="#a7f3d0" font-family="sans-serif" font-size="14" font-weight="bold">${safeTitle}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function fmtUSD(val) {
    const n = Number(val) || 0;
    return '$' + n.toFixed(2);
  }

  function fmtBs(valUsd, customRate) {
    const rate = customRate || state.settings.rateBcv || 42.85;
    const bs = (Number(valUsd) || 0) * rate;
    return bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
  }

  function fmtEur(valUsd) {
    const bcv = state.settings.rateBcv || 42.85;
    const eur = state.settings.rateEur || 46.60;
    const valEur = eur > 0 ? ((Number(valUsd) || 0) * bcv) / eur : 0;
    return '€' + valEur.toFixed(2);
  }

  function fmtBsRaw(valBs) {
    const n = Number(valBs) || 0;
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
  }

  function fmtWeight(qty, unit) {
    const n = Number(qty) || 0;
    if (unit === 'kg') {
      if (n < 1 && n > 0) {
        return Math.round(n * 1000) + ' g (' + n.toFixed(3) + ' kg)';
      }
      return n.toFixed(2) + ' kg';
    }
    if (unit === 'L') return n.toFixed(2) + ' L';
    return Math.round(n) + ' ' + (unit || 'und');
  }

  function getInsumoById(id) {
    return state.inventory.find(i => i.id === id) || null;
  }

  function calcDishCost(dish) {
    if (!dish || !Array.isArray(dish.ingredients)) return 0;
    let totalCost = 0;
    dish.ingredients.forEach(ing => {
      const ins = getInsumoById(ing.insumoId);
      if (ins) {
        totalCost += (Number(ins.costUsd) || 0) * (Number(ing.qty) || 0);
      }
    });
    return totalCost;
  }

  function calcDishMaxPortions(dish) {
    if (!dish || !Array.isArray(dish.ingredients) || !dish.ingredients.length) return 999;
    let minPortions = Infinity;
    dish.ingredients.forEach(ing => {
      const ins = getInsumoById(ing.insumoId);
      if (ins && ing.qty > 0) {
        const possible = Math.floor((Number(ins.stock) || 0) / Number(ing.qty));
        if (possible < minPortions) minPortions = possible;
      }
    });
    return minPortions === Infinity ? 0 : Math.max(0, minPortions);
  }

  function getExchangeGapFactor() {
    const bcv = Number(state.settings.rateBcv) || 1;
    const usdt = Number(state.settings.rateUsdt) || bcv;
    return Math.max(1, usdt / bcv);
  }

  function getEurGapFactor() {
    const bcv = Number(state.settings.rateBcv) || 1;
    const eur = Number(state.settings.rateEur) || bcv;
    return Math.max(1, eur / bcv);
  }

  function calcRecommendedPriceUsd(costUsd, targetMarginPct) {
    const margin = (Number(targetMarginPct) || state.settings.targetMarginPct || 40) / 100;
    const basePrice = costUsd / Math.max(0.15, (1 - margin));
    const factor = getExchangeGapFactor();
    return basePrice * factor;
  }

  function findByCodeOrBarcode(query, includeKitchenInsumos = false) {
    const q = String(query || '').trim().toUpperCase();
    if (!q) return null;

    const dish = state.dishes.find(d =>
      String(d.code).toUpperCase() === q ||
      String(d.barcode).toUpperCase() === q ||
      ('0' + String(d.code).toUpperCase()) === q
    );
    if (dish) return { kind: 'dish', item: dish };

    const inv = state.inventory.find(i => {
      if (!includeKitchenInsumos && !i.sellable) return false;
      return (
        String(i.code).toUpperCase() === q ||
        String(i.barcode).toUpperCase() === q ||
        String(i.qrCode || '').toUpperCase() === q
      );
    });
    if (inv) return { kind: 'inventory', item: inv };

    return null;
  }

  function getItemsForGroup(groupId) {
    const dishes = state.dishes.filter(d => d.group === groupId).map(d => ({
      kind: 'dish',
      id: d.id,
      code: d.code,
      barcode: d.barcode,
      name: d.name,
      category: d.category,
      group: d.group,
      priceUsd: d.priceUsd,
      emoji: d.emoji,
      img: d.img,
      stock: calcDishMaxPortions(d),
      unit: 'plato',
      raw: d
    }));
    const prods = state.inventory.filter(i => i.sellable === true && i.group === groupId).map(i => ({
      kind: 'inventory',
      id: i.id,
      code: i.code,
      barcode: i.barcode,
      qrCode: i.qrCode,
      name: i.name,
      category: i.category,
      group: i.group,
      priceUsd: i.priceUsd,
      emoji: i.emoji,
      img: i.img,
      stock: i.stock,
      unit: i.unit,
      raw: i
    }));
    return dishes.concat(prods);
  }

  function findUsedPagoMovilRef(refStr) {
    const clean = String(refStr || '').trim().replace(/[^0-9a-zA-Z]/g, '');
    if (!clean || clean.length < 4) return null;
    for (const s of (state.sales || [])) {
      for (const p of (s.payments || [])) {
        if (p.method === 'Pago Móvil') {
          const stored = String(p.ref || '').trim().replace(/[^0-9a-zA-Z]/g, '');
          if (stored.length >= 4) {
            if (stored === clean || stored.endsWith(clean) || clean.endsWith(stored)) {
              return {
                sale: s,
                payment: p,
                matchedRef: stored,
                clean
              };
            }
          }
        }
      }
    }
    return null;
  }

  function isPagoMovilRefUsed(refStr) {
    return !!findUsedPagoMovilRef(refStr);
  }

  /* Parser inteligente de SMS / Notificación bancaria venezolana */
  function parsePagoMovilSms(text) {
    if (!text || typeof text !== 'string') return null;
    const str = text.trim();
    let ref = '';
    const refMatch = str.match(/(?:ref(?:erencia)?|nro|operaci[oó]n|num|doc)[\s.:#]*([0-9]{4,10})/i) ||
                     str.match(/\b([0-9]{6,8})\b/);
    if (refMatch) ref = refMatch[1];

    let amountBs = 0;
    const bsMatch = str.match(/(?:bs\.?|bol[ií]vares|monto:?)[\s]*([0-9]+(?:[.,][0-9]{1,2})?)/i) ||
                    str.match(/([0-9]+(?:[.,][0-9]{1,2})?)[\s]*(?:bs|ves)/i);
    if (bsMatch) {
      amountBs = parseFloat(bsMatch[1].replace(',', '.'));
    }

    let phone = '';
    const phoneMatch = str.match(/\b(04(?:12|14|24|16|26)[0-9]{7})\b/) ||
                       str.match(/\b(04\d{2}[-\s]?\d{7})\b/);
    if (phoneMatch) phone = phoneMatch[1].replace(/[-\s]/g, '');

    let bank = '';
    if (/venezuela|bdv|0102/i.test(str)) bank = '0102 - Venezuela';
    else if (/banesco|0134/i.test(str)) bank = '0134 - Banesco';
    else if (/mercantil|tpago|0105/i.test(str)) bank = '0105 - Mercantil';
    else if (/provincial|bbva|0108/i.test(str)) bank = '0108 - Provincial';
    else if (/bancamiga|0172/i.test(str)) bank = '0172 - Bancamiga';
    else if (/bnc|0191/i.test(str)) bank = '0191 - BNC';

    return {
      reference: ref,
      amountBs: isNaN(amountBs) ? 0 : amountBs,
      phone,
      bank,
      raw: str
    };
  }

  /* ==========================================================================
     MOTOR KARDEX & AUDITORÍA INMUTABLE DE MOVIMIENTOS
     - Entrada por Compra Proveedor (COMPRA)
     - Salida por Venta Mostrador (VENTA)
     - Salida por Merma / Vencimiento / Desperdicio (MERMA)
     - Salida por Consumo de Personal / Almuerzo Empleados (CONSUMO_PERSONAL)
     - Ajuste por Conteo Físico Real en Auditoría (AJUSTE_AUDITORIA)
     - Transformación de Cocina (PRODUCCION_COCINA / SALIDA_OLLA)
     ========================================================================== */
  function recordMovementInternal(payload) {
    if (!Array.isArray(state.kardex)) state.kardex = [];
    const item = getInsumoById(payload.itemId);
    const kId = 'KDX-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10);
    const prev = Number(payload.prevStock !== undefined ? payload.prevStock : (item ? item.stock : 0));
    const next = Number(payload.nextStock !== undefined ? payload.nextStock : (item ? item.stock : 0));
    const entry = {
      id: kId,
      timestamp: payload.timestamp || new Date().toISOString(),
      itemId: payload.itemId,
      itemCode: item ? item.code : (payload.itemCode || '—'),
      itemName: item ? item.name : (payload.itemName || 'Artículo'),
      itemType: item ? (item.sellable ? 'venta' : 'insumo') : (payload.itemType || 'general'),
      action: payload.action || 'MOVIMIENTO',
      qty: Number(Number(payload.qty || 0).toFixed(3)),
      unit: item ? item.unit : (payload.unit || 'und'),
      costUsd: Number(Number(payload.costUsd || (item ? item.costUsd : 0)).toFixed(4)),
      prevStock: Number(prev.toFixed(3)),
      nextStock: Number(next.toFixed(3)),
      docRef: payload.docRef || '—',
      supplier: payload.supplier || '',
      responsible: payload.responsible || 'Sistema',
      notes: payload.notes || ''
    };
    state.kardex.unshift(entry);
    if (state.kardex.length > 2500) state.kardex.length = 2500;
    return entry;
  }

  function recordSale(salePayload) {
    const orderNum = state.settings.nextOrderNumber++;
    let totalCostUsd = 0;

    salePayload.items.forEach(line => {
      if (line.isDish) {
        const dish = state.dishes.find(d => d.id === line.refId);
        if (dish) {
          const unitCost = calcDishCost(dish);
          totalCostUsd += unitCost * line.qty;
          dish.ingredients.forEach(ing => {
            const ins = getInsumoById(ing.insumoId);
            if (ins) {
              const prev = Number(ins.stock || 0);
              const deduct = Number((ing.qty * line.qty).toFixed(4));
              ins.stock = Math.max(0, Number((prev - deduct).toFixed(4)));
              recordMovementInternal({
                itemId: ins.id,
                action: 'VENTA',
                qty: -deduct,
                costUsd: ins.costUsd,
                prevStock: prev,
                nextStock: ins.stock,
                docRef: 'ORD-' + orderNum,
                responsible: salePayload.cashier || 'Caja Principal',
                notes: `Consumo receta: ${line.qty}x ${dish.name}`
              });
            }
          });
        }
      } else {
        const inv = getInsumoById(line.refId);
        if (inv) {
          totalCostUsd += (Number(inv.costUsd) || 0) * line.qty;
          const prev = Number(inv.stock || 0);
          inv.stock = Math.max(0, Number((prev - line.qty).toFixed(4)));
          recordMovementInternal({
            itemId: inv.id,
            action: 'VENTA',
            qty: -line.qty,
            costUsd: inv.costUsd,
            prevStock: prev,
            nextStock: inv.stock,
            docRef: 'ORD-' + orderNum,
            responsible: salePayload.cashier || 'Caja Principal',
            notes: `Venta mostrador POS (${line.qty} ${inv.unit})`
          });
        }
      }
    });

    const newSale = {
      id: 'ORD-' + orderNum,
      orderNumber: orderNum,
      createdAt: new Date().toISOString(),
      cashier: salePayload.cashier || 'Caja Principal',
      customer: salePayload.customer || 'Mostrador Rápido',
      rateBcv: state.settings.rateBcv,
      rateEur: state.settings.rateEur,
      rateUsdt: state.settings.rateUsdt,
      subtotalUsd: Number((salePayload.subtotalUsd || salePayload.totalUsd).toFixed(2)),
      igtfUsd: Number((salePayload.igtfUsd || 0).toFixed(2)),
      totalUsd: Number(salePayload.totalUsd.toFixed(2)),
      totalBs: Number((salePayload.totalUsd * state.settings.rateBcv).toFixed(2)),
      costUsd: Number(totalCostUsd.toFixed(2)),
      profitUsd: Number((salePayload.totalUsd - totalCostUsd).toFixed(2)),
      items: salePayload.items,
      payments: salePayload.payments || [],
      changeGiven: salePayload.changeGiven || {
        totalChangeUsd: 0,
        totalChangeBs: 0,
        usdCashGiven: 0,
        bsCashGiven: 0,
        bsPmGiven: 0,
        breakdown: 'Pago exacto'
      }
    };

    state.sales.unshift(newSale);
    saveState(state);
    return newSale;
  }

  /* Registrar Gasto Operativo / Salida de Caja Chica o Gaveta */
  function recordExpense(payload) {
    const bcv = state.settings.rateBcv || 42.85;
    const rateUsed = Number(payload.rateUsed) || bcv;
    const amountUsd = Number(payload.amountUsd) || 0;
    const amountBs = Number(payload.amountBs) || Number((amountUsd * rateUsed).toFixed(2));
    const exp = {
      id: 'GAS-' + Date.now().toString().slice(-5),
      createdAt: new Date().toISOString(),
      category: payload.category || 'Gasto Operativo',
      description: payload.description || 'Gasto registrado en turno',
      paymentSource: payload.paymentSource || 'Efectivo USD',
      amountUsd: Number(amountUsd.toFixed(2)),
      amountBs: Number(amountBs.toFixed(2)),
      rateUsed,
      responsible: payload.responsible || 'Caja / Admin'
    };
    if (!Array.isArray(state.expenses)) state.expenses = [];
    state.expenses.unshift(exp);
    saveState(state);
    return exp;
  }

  /* Compra Diaria de Insumos de Cocina (Aliños, Papas, Carnes, Pollo, Queso, Harina, etc.)
     Conecta la realidad: Suma los kilos a la cocina Y descuenta el dinero de la caja */
  function recordKitchenPurchase(payload) {
    const insumo = getInsumoById(payload.insumoId);
    if (!insumo) return null;

    const qty = Math.max(0.01, Number(payload.qty) || 1);
    const totalCostUsd = Math.max(0, Number(payload.totalCostUsd) || 0);
    const unitCost = qty > 0 && totalCostUsd > 0 ? Number((totalCostUsd / qty).toFixed(2)) : insumo.costUsd;

    const prevStock = Number(insumo.stock || 0);
    insumo.stock = Number((prevStock + qty).toFixed(3));
    if (unitCost > 0) {
      insumo.prevCostUsd = insumo.costUsd;
      insumo.costUsd = unitCost;
    }

    const docNum = payload.docNumber || ('REC-' + Date.now().toString().slice(-5));
    const desc = `Compra ${qty} ${insumo.unit} de ${insumo.name} ($${unitCost.toFixed(2)}/${insumo.unit})${payload.supplier ? ' - Prov: ' + payload.supplier : ''}`;

    recordMovementInternal({
      itemId: insumo.id,
      action: 'COMPRA',
      qty,
      costUsd: unitCost,
      prevStock,
      nextStock: insumo.stock,
      docRef: docNum,
      supplier: payload.supplier || 'Mercado Mayorista / Feria',
      responsible: payload.responsible || 'Caja / Cocina',
      notes: desc
    });

    recordExpense({
      category: 'Insumos de Cocina (Aliños / Carnes / Verduras)',
      description: desc,
      paymentSource: payload.paymentSource || 'Efectivo USD',
      amountUsd: totalCostUsd,
      responsible: payload.responsible || 'Caja / Cocina'
    });

    return { insumo, qty, totalCostUsd, unitCost };
  }

  function deleteExpense(expId) {
    if (!Array.isArray(state.expenses)) return;
    state.expenses = state.expenses.filter(e => e.id !== expId);
    saveState(state);
  }

  /* Calculadora de Entrada por Bulto / Caja / Cartón -> Unidad o Kilo */
  function addBulkStockEntry(payload) {
    const item = getInsumoById(payload.itemId);
    if (!item) return null;

    const packsCount = Math.max(0.01, Number(payload.packsCount) || 1);
    const unitsPerPack = Math.max(0.01, Number(payload.unitsPerPack) || 1);
    const totalUnitsAdded = Number((packsCount * unitsPerPack).toFixed(3));
    const packCostUsd = Number(payload.packCostUsd) || 0;
    const totalCostUsd = Number((packsCount * packCostUsd).toFixed(2));
    const unitCostUsd = totalUnitsAdded > 0 && packCostUsd > 0
      ? Number((totalCostUsd / totalUnitsAdded).toFixed(4))
      : item.costUsd;

    const prevStock = Number(item.stock || 0);
    item.prevCostUsd = item.costUsd;
    if (unitCostUsd > 0) {
      item.costUsd = Number(unitCostUsd.toFixed(2));
    }
    item.stock = Number((prevStock + totalUnitsAdded).toFixed(3));

    if (item.sellable && payload.newSalePriceUsd && Number(payload.newSalePriceUsd) > 0) {
      item.priceUsd = Number(Number(payload.newSalePriceUsd).toFixed(2));
    }

    const docNum = payload.docNumber || ('BLT-' + Date.now().toString().slice(-5));
    const supplier = payload.supplier || 'Distribuidor Mayorista';

    recordMovementInternal({
      itemId: item.id,
      action: 'COMPRA',
      qty: totalUnitsAdded,
      costUsd: unitCostUsd,
      prevStock,
      nextStock: item.stock,
      docRef: docNum,
      supplier,
      responsible: payload.responsible || 'Administrador',
      notes: `Entrada ${packsCount} bulto/caja (${totalUnitsAdded} ${item.unit})`
    });

    if (payload.registerAsExpense && totalCostUsd > 0) {
      recordExpense({
        category: 'Compra Mercancía / Insumos (Contado)',
        description: `Entrada ${packsCount} bulto/caja (${totalUnitsAdded} ${item.unit}) de ${item.name}`,
        paymentSource: payload.paymentSource || 'Efectivo USD',
        amountUsd: totalCostUsd,
        responsible: payload.responsible || 'Administrador'
      });
    } else {
      saveState(state);
    }

    return {
      item,
      totalUnitsAdded,
      unitCostUsd,
      totalCostUsd
    };
  }

  /* Recepción Formal Multi-Ítem a Proveedores (Factura / Nota de Entrega) */
  function recordMultiItemPurchase(payload) {
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
      toast('Debes agregar al menos un artículo a la compra', 'warn');
      return null;
    }

    const docNumber = String(payload.docNumber || ('FAC-' + Date.now().toString().slice(-5))).trim();
    const supplier = String(payload.supplier || 'Proveedor Mayorista').trim();
    const paymentMethod = payload.paymentMethod || 'Efectivo USD';
    const responsible = payload.responsible || 'Administrador';
    const notes = payload.notes || 'Recepción de mercancía multi-ítem';
    const bcv = Number(state.settings.rateBcv) || 42.85;

    let totalPurchaseUsd = 0;
    const processedItems = [];

    payload.items.forEach(line => {
      const item = getInsumoById(line.itemId);
      if (!item) return;

      const packs = Math.max(0.01, Number(line.packsCount) || 1);
      const unitsPerPack = Math.max(0.01, Number(line.unitsPerPack) || 1);
      const totalUnitsAdded = Number((packs * unitsPerPack).toFixed(3));
      const packCostUsd = Math.max(0, Number(line.packCostUsd) || 0);
      const lineCostUsd = Number((packs * packCostUsd).toFixed(2));
      const unitCostUsd = totalUnitsAdded > 0 && packCostUsd > 0
        ? Number((lineCostUsd / totalUnitsAdded).toFixed(4))
        : item.costUsd;

      const prevStock = Number(item.stock || 0);
      item.prevCostUsd = item.costUsd;
      if (unitCostUsd > 0) {
        item.costUsd = Number(unitCostUsd.toFixed(2));
      }
      item.stock = Number((prevStock + totalUnitsAdded).toFixed(3));

      if (item.sellable && line.newSalePriceUsd && Number(line.newSalePriceUsd) > 0) {
        item.priceUsd = Number(Number(line.newSalePriceUsd).toFixed(2));
      }

      totalPurchaseUsd += lineCostUsd;

      recordMovementInternal({
        itemId: item.id,
        action: 'COMPRA',
        qty: totalUnitsAdded,
        costUsd: unitCostUsd,
        prevStock,
        nextStock: item.stock,
        docRef: docNumber,
        supplier,
        responsible,
        notes: `Entrada compra multi-ítem (${packs} bultos = ${totalUnitsAdded} ${item.unit})`
      });

      processedItems.push({
        itemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        packsCount: packs,
        unitsPerPack,
        totalUnits: totalUnitsAdded,
        packCostUsd,
        unitCostUsd,
        totalCostUsd: lineCostUsd,
        newSalePriceUsd: item.priceUsd
      });
    });

    const purchaseRecord = {
      id: 'CMP-' + Date.now().toString().slice(-6),
      createdAt: new Date().toISOString(),
      docNumber,
      supplier,
      paymentMethod,
      totalUsd: Number(totalPurchaseUsd.toFixed(2)),
      totalBs: Number((totalPurchaseUsd * bcv).toFixed(2)),
      itemsCount: processedItems.length,
      items: processedItems,
      notes,
      responsible
    };

    if (!Array.isArray(state.purchases)) state.purchases = [];
    state.purchases.unshift(purchaseRecord);

    if (paymentMethod !== 'Crédito / Cuentas por Pagar' && paymentMethod !== 'NONE' && totalPurchaseUsd > 0) {
      recordExpense({
        category: 'Compra Mercancía / Proveedor',
        description: `Compra Doc ${docNumber} a ${supplier} (${processedItems.length} artículos)`,
        paymentSource: paymentMethod,
        amountUsd: totalPurchaseUsd,
        responsible
      });
    } else {
      saveState(state);
    }

    return purchaseRecord;
  }

  /* Registro Formal de Mermas, Vencimientos y Autoconsumo */
  function recordWaste(payload) {
    const item = getInsumoById(payload.itemId);
    if (!item) {
      toast('Artículo no encontrado', 'err');
      return null;
    }

    const qty = Math.max(0.01, Number(payload.qty) || 1);
    const reason = payload.reason || 'Deterioro / Descomposición';
    const isStaffMeal = payload.isStaffMeal || reason.toLowerCase().includes('personal') || reason.toLowerCase().includes('almuerzo');
    const actionType = isStaffMeal ? 'CONSUMO_PERSONAL' : 'MERMA';
    const responsible = payload.responsible || 'Responsable de Turno';
    const notes = payload.notes || '';

    const prevStock = Number(item.stock || 0);
    const nextStock = Number(Math.max(0, prevStock - qty).toFixed(3));
    item.stock = nextStock;

    const totalCostUsd = Number((qty * (Number(item.costUsd) || 0)).toFixed(2));
    const wasteId = 'MRM-' + Date.now().toString().slice(-5);

    const wasteEntry = {
      id: wasteId,
      createdAt: new Date().toISOString(),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      qty,
      unit: item.unit,
      unitCostUsd: item.costUsd,
      totalCostUsd,
      reason,
      responsible,
      notes
    };

    if (!Array.isArray(state.wasteRecords)) state.wasteRecords = [];
    state.wasteRecords.unshift(wasteEntry);

    recordMovementInternal({
      itemId: item.id,
      action: actionType,
      qty: -qty,
      costUsd: item.costUsd,
      prevStock,
      nextStock,
      docRef: wasteId,
      responsible,
      notes: `${reason}${notes ? ' - ' + notes : ''}`
    });

    saveState(state);
    return wasteEntry;
  }

  /* Ajuste de Inventario por Conteo Físico Real (Auditoría Ciega) */
  function recordAuditAdjustment(payload) {
    const item = getInsumoById(payload.itemId);
    if (!item) return null;

    const realStock = Math.max(0, Number(payload.realPhysicalStock) || 0);
    const prevStock = Number(item.stock || 0);
    const diff = Number((realStock - prevStock).toFixed(3));
    const responsible = payload.responsible || 'Auditor / Dueño';
    const reason = payload.reason || 'Ajuste de inventario por conteo físico';

    item.stock = realStock;

    recordMovementInternal({
      itemId: item.id,
      action: 'AJUSTE_AUDITORIA',
      qty: diff,
      costUsd: item.costUsd,
      prevStock,
      nextStock: realStock,
      docRef: 'AUD-' + Date.now().toString().slice(-5),
      responsible,
      notes: `${reason} (Diferencia: ${diff > 0 ? '+' : ''}${diff} ${item.unit})`
    });

    saveState(state);
    return { item, prevStock, realStock, diff };
  }

  /* Obtener Historial Kardex de un Ítem o de Todo el Negocio */
  function getKardexForItem(itemId, limit = 150) {
    if (!Array.isArray(state.kardex)) return [];
    if (!itemId || itemId === 'ALL') return state.kardex.slice(0, limit);
    return state.kardex.filter(k => k.itemId === itemId).slice(0, limit);
  }

  /* Crear Rápidamente una Nueva Variedad o Artículo dentro de una Categoría */
  function quickCreateItemInGroup(payload) {
    const grp = POS_GROUPS.find(g => g.id === payload.groupId) || POS_GROUPS[0];
    const isDish = payload.kind ? payload.kind === 'dish' : grp.kind === 'dish';
    const name = String(payload.name || '').trim();
    if (!name) return null;

    const priceUsd = Math.max(0.05, Number(payload.priceUsd) || 1.00);
    const costUsd = Math.max(0.01, Number(payload.costUsd) || Number((priceUsd * 0.55).toFixed(2)));

    if (isDish) {
      const nextNum = state.dishes.length + 1;
      const code = payload.code || String(nextNum).padStart(2, '0');
      const newDish = {
        id: 'dish-custom-' + Date.now(),
        code,
        barcode: payload.barcode || ('8800' + String(nextNum).padStart(3, '0')),
        group: grp.id,
        name,
        category: grp.category || 'Empanadas & Desayunos',
        priceUsd: Number(priceUsd.toFixed(2)),
        emoji: payload.emoji || grp.emoji || '🥟',
        img: payload.img || grp.img,
        ingredients: payload.ingredients || [
          { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Base Cocina' }
        ]
      };
      state.dishes.push(newDish);
      saveState(state);
      return { kind: 'dish', item: newDish };
    } else {
      const nextCode = String(600 + state.inventory.length);
      const code = payload.code || nextCode;
      const newProd = {
        id: 'prod-custom-' + Date.now(),
        code,
        barcode: payload.barcode || ('75999' + Date.now().toString().slice(-8)),
        qrCode: 'QR-' + code,
        group: grp.id,
        name,
        category: grp.category || 'Víveres',
        type: 'venta',
        sellable: true,
        taxExempt: false,
        unit: payload.unit || 'und',
        stock: Number(payload.stock) >= 0 ? Number(payload.stock) : 24,
        minStock: Number(payload.minStock) || 6,
        costUsd: Number(costUsd.toFixed(2)),
        prevCostUsd: Number(costUsd.toFixed(2)),
        priceUsd: Number(priceUsd.toFixed(2)),
        emoji: payload.emoji || grp.emoji || '🛒',
        img: payload.img || grp.img
      };
      state.inventory.push(newProd);
      saveState(state);
      return { kind: 'inventory', item: newProd };
    }
  }

  /* Análisis Exhaustivo de Ingresos, Costos, Gastos, Gaveta y Rentabilidad */
  function getFinancialAnalytics() {
    const bcv = Number(state.settings.rateBcv) || 42.85;
    const eur = Number(state.settings.rateEur) || 46.60;
    const usdt = Number(state.settings.rateUsdt) || 51.40;
    const sales = state.sales || [];
    const expenses = state.expenses || [];
    const invoices = state.invoices || [];

    let grossSalesUsd = 0;
    let totalCostOfGoodsUsd = 0;
    let grossProfitUsd = 0;
    let kitchenSalesUsd = 0;
    let kitchenCostUsd = 0;
    let retailSalesUsd = 0;
    let retailCostUsd = 0;

    let inUsdCash = 0, inBsCash = 0, inPmBs = 0, inPuntoBs = 0, inZelleUsd = 0;
    let outChangeUsdCash = 0, outChangeBsCash = 0, outChangePmBs = 0;

    const itemStatsMap = {};

    sales.forEach(s => {
      grossSalesUsd += Number(s.totalUsd || 0);
      totalCostOfGoodsUsd += Number(s.costUsd || 0);
      grossProfitUsd += Number(s.profitUsd || 0);

      outChangeUsdCash += Number(s.changeGiven?.usdCashGiven || 0);
      outChangeBsCash += Number(s.changeGiven?.bsCashGiven || 0);
      outChangePmBs += Number(s.changeGiven?.bsPmGiven || 0);

      (s.payments || []).forEach(p => {
        if (p.method === 'Efectivo USD') inUsdCash += Number(p.amountUsd || 0);
        else if (p.method === 'Efectivo Bs') inBsCash += Number(p.amountBs || 0);
        else if (p.method === 'Pago Móvil') inPmBs += Number(p.amountBs || 0);
        else if (p.method === 'Punto de Venta') inPuntoBs += Number(p.amountBs || 0);
        else if (p.method === 'Zelle / Transf') inZelleUsd += Number(p.amountUsd || 0);
      });

      (s.items || []).forEach(it => {
        const lineSub = Number(it.subtotalUsd || (it.qty * it.priceUsd) || 0);
        let unitCost = 0;
        if (it.isDish) {
          const d = state.dishes.find(x => x.id === it.refId || x.name === it.name);
          unitCost = d ? calcDishCost(d) : lineSub * 0.45;
          kitchenSalesUsd += lineSub;
          kitchenCostUsd += unitCost * it.qty;
        } else {
          const inv = state.inventory.find(x => x.id === it.refId || x.name === it.name);
          unitCost = inv ? Number(inv.costUsd || 0) : lineSub * 0.65;
          retailSalesUsd += lineSub;
          retailCostUsd += unitCost * it.qty;
        }
        const key = it.name;
        if (!itemStatsMap[key]) {
          itemStatsMap[key] = { name: it.name, isDish: !!it.isDish, qty: 0, revenueUsd: 0, profitUsd: 0 };
        }
        itemStatsMap[key].qty += Number(it.qty || 0);
        itemStatsMap[key].revenueUsd += lineSub;
        itemStatsMap[key].profitUsd += (lineSub - unitCost * it.qty);
      });
    });

    let totalExpensesUsd = 0;
    let expUsdCash = 0, expBsCash = 0, expPmBs = 0, expOtherUsd = 0;

    expenses.forEach(e => {
      const u = Number(e.amountUsd || 0);
      const b = Number(e.amountBs || (u * bcv));
      totalExpensesUsd += u;
      if (e.paymentSource === 'Efectivo USD') expUsdCash += u;
      else if (e.paymentSource === 'Efectivo Bs') expBsCash += b;
      else if (e.paymentSource === 'Pago Móvil') expPmBs += b;
      else expOtherUsd += u;
    });

    const netOperatingProfitUsd = grossProfitUsd - totalExpensesUsd;
    const gapFactor = Math.max(1, usdt / bcv);
    const realUsdtProfit = netOperatingProfitUsd / gapFactor;

    const netDrawerUsd = inUsdCash - outChangeUsdCash - expUsdCash;
    const netDrawerBs = inBsCash - outChangeBsCash - expBsCash;
    const netBankPmBs = inPmBs - outChangePmBs - expPmBs;

    const topItems = Object.values(itemStatsMap).sort((a, b) => b.revenueUsd - a.revenueUsd);
    const totalPendingInvoicesUsd = invoices.reduce((acc, f) => acc + Math.max(0, Number(f.totalUsd || 0) - Number(f.paidUsd || 0)), 0);

    // Auditoría detallada de Puntos de Venta (Terminales) y Pago Móvil (Conciliación)
    let pmConfirmedBs = 0;
    let pmPendingBs = 0;
    const pmByAccount = {};
    const puntoByTerminal = {};

    (state.posTerminals || []).forEach(term => {
      puntoByTerminal[term.id] = {
        terminalId: term.id,
        terminalName: term.name,
        bank: term.bank,
        currentBatch: term.currentBatch || '0001',
        txCount: 0,
        totalBs: 0,
        totalUsd: 0
      };
    });

    sales.forEach(s => {
      (s.payments || []).forEach(p => {
        if (p.method === 'Pago Móvil') {
          const isConf = p.verifyStatus === 'CONCILIADO' || (p.verified !== false && p.verifyStatus !== 'PENDIENTE');
          if (isConf) pmConfirmedBs += Number(p.amountBs || 0);
          else pmPendingBs += Number(p.amountBs || 0);

          const accName = p.destAccountName || 'Cuenta Principal';
          if (!pmByAccount[accName]) pmByAccount[accName] = { name: accName, totalBs: 0, count: 0 };
          pmByAccount[accName].totalBs += Number(p.amountBs || 0);
          pmByAccount[accName].count++;
        } else if (p.method === 'Punto de Venta') {
          const termId = p.terminalId || (state.posTerminals && state.posTerminals[0] ? state.posTerminals[0].id : 'term-bancamiga');
          if (!puntoByTerminal[termId]) {
            puntoByTerminal[termId] = {
              terminalId: termId,
              terminalName: p.terminalName || 'Punto POS',
              bank: p.bank || 'Banco Adquirente',
              currentBatch: p.lote || '0001',
              txCount: 0,
              totalBs: 0,
              totalUsd: 0
            };
          }
          puntoByTerminal[termId].txCount++;
          puntoByTerminal[termId].totalBs += Number(p.amountBs || 0);
          puntoByTerminal[termId].totalUsd += Number(p.amountUsd || 0);
        }
      });
    });

    return {
      bcv, eur, usdt, gapFactor,
      grossSalesUsd,
      totalCostOfGoodsUsd,
      grossProfitUsd,
      totalExpensesUsd,
      netOperatingProfitUsd,
      realUsdtProfit,
      kitchenSalesUsd,
      kitchenCostUsd,
      kitchenProfitUsd: kitchenSalesUsd - kitchenCostUsd,
      retailSalesUsd,
      retailCostUsd,
      retailProfitUsd: retailSalesUsd - retailCostUsd,
      inUsdCash, inBsCash, inPmBs, inPuntoBs, inZelleUsd,
      outChangeUsdCash, outChangeBsCash, outChangePmBs,
      expUsdCash, expBsCash, expPmBs, expOtherUsd,
      netDrawerUsd, netDrawerBs, netBankPmBs,
      pmConfirmedBs, pmPendingBs, pmByAccount,
      puntoByTerminal,
      posTerminals: state.posTerminals || [],
      pagoMovilAccounts: state.pagoMovilAccounts || [],
      batchClosures: state.batchClosures || [],
      topItems,
      totalPendingInvoicesUsd
    };
  }

  /* Cierre de Lote Formal de Punto de Venta (Conciliación Voucher vs Sistema) */
  function closeTerminalBatch(payload) {
    if (!Array.isArray(state.posTerminals)) state.posTerminals = [];
    const term = state.posTerminals.find(t => t.id === payload.terminalId);
    if (!term) return { success: false, error: 'Terminal no encontrado' };

    const batchNumber = term.currentBatch || '0001';
    let systemTotalBs = 0;
    let systemTxCount = 0;

    (state.sales || []).forEach(s => {
      (s.payments || []).forEach(p => {
        if (p.method === 'Punto de Venta' && (p.terminalId === term.id || !p.terminalId) && (!p.batchClosed)) {
          systemTotalBs += Number(p.amountBs || 0);
          systemTxCount++;
          p.batchClosed = true;
          p.batchClosedId = 'LOTE-' + term.id + '-' + batchNumber;
        }
      });
    });

    const physicalTotalBs = Math.max(0, Number(payload.physicalTotalBs) || 0);
    const physicalTxCount = Math.max(0, parseInt(payload.physicalTxCount, 10) || 0);
    const diffBs = Number((physicalTotalBs - systemTotalBs).toFixed(2));
    const status = Math.abs(diffBs) <= 0.05 ? 'CUADRADO' : (diffBs > 0 ? 'SOBRANTE' : 'FALTANTE');

    const closure = {
      id: 'LOTE-CLS-' + Date.now().toString().slice(-6),
      timestamp: new Date().toISOString(),
      terminalId: term.id,
      terminalName: term.name,
      bank: term.bank,
      batchNumber,
      systemTxCount,
      systemTotalBs: Number(systemTotalBs.toFixed(2)),
      physicalTxCount,
      physicalTotalBs: Number(physicalTotalBs.toFixed(2)),
      differenceBs: diffBs,
      status,
      cashier: payload.cashier || 'Cajero Turno',
      notes: payload.notes || ''
    };

    if (!Array.isArray(state.batchClosures)) state.batchClosures = [];
    state.batchClosures.unshift(closure);

    // Incrementar automáticamente el número de lote para el siguiente turno
    const nextBatchNum = (parseInt(batchNumber, 10) || 1) + 1;
    term.currentBatch = String(nextBatchNum).padStart(4, '0');

    saveState(state);
    return { success: true, closure, nextBatch: term.currentBatch };
  }

  /* Actualizar Estado de Conciliación de Pago Móvil (CONCILIADO / RECHAZADO) */
  function updatePagoMovilStatus(saleId, paymentRef, newStatus, reason) {
    const sale = (state.sales || []).find(s => s.id === saleId);
    if (!sale) return false;
    const payment = (sale.payments || []).find(p => p.method === 'Pago Móvil' && (p.ref === paymentRef || !paymentRef));
    if (!payment) return false;

    payment.verifyStatus = newStatus; // 'CONCILIADO' | 'PENDIENTE' | 'RECHAZADO'
    payment.verified = newStatus === 'CONCILIADO';
    payment.reviewNotes = reason || '';
    payment.reviewedAt = new Date().toISOString();

    saveState(state);
    return true;
  }

  /* Procesador de Cobro C2P (Comercio a Persona) con Token OTP */
  function processC2pPayment(payload) {
    const bank = payload.bank || '0102 - Venezuela';
    const phone = String(payload.phone || '').trim().replace(/[-\s]/g, '');
    const idDoc = String(payload.idDoc || '').trim().toUpperCase();
    const otp = String(payload.otp || '').trim();
    const amountBs = parseFloat(payload.amountBs) || 0;
    const amountUsd = parseFloat(payload.amountUsd) || 0;

    if (!phone || phone.length < 10) {
      return { success: false, error: 'Número de teléfono inválido (debe tener formato 0412/0414/0424...)' };
    }
    if (!idDoc || idDoc.length < 5) {
      return { success: false, error: 'Cédula / Documento de identidad requerido' };
    }
    if (!otp || otp.length < 6) {
      return { success: false, error: 'Token OTP inválido (mínimo 6 a 8 dígitos generados en la app bancaria)' };
    }
    if (amountBs <= 0) {
      return { success: false, error: 'Monto a debitar debe ser mayor a 0 Bs' };
    }

    const authCode = 'C2P-' + Math.floor(100000 + Math.random() * 900000);

    return {
      success: true,
      authCode,
      reference: authCode,
      bank,
      phone,
      idDoc,
      amountBs,
      amountUsd,
      message: 'Cobro C2P Aprobado Inmediatamente por el Banco emisor'
    };
  }

  function saveTerminal(termPayload) {
    if (!Array.isArray(state.posTerminals)) state.posTerminals = [];
    if (termPayload.id) {
      const idx = state.posTerminals.findIndex(t => t.id === termPayload.id);
      if (idx !== -1) {
        state.posTerminals[idx] = Object.assign({}, state.posTerminals[idx], termPayload);
        saveState(state);
        return state.posTerminals[idx];
      }
    }
    const newTerm = {
      id: 'term-' + Date.now(),
      name: termPayload.name || 'Punto de Venta POS',
      bank: termPayload.bank || '0134 - Banesco',
      currentBatch: termPayload.currentBatch || '0001',
      model: termPayload.model || 'Terminal POS',
      status: termPayload.status || 'ACTIVO'
    };
    state.posTerminals.push(newTerm);
    saveState(state);
    return newTerm;
  }

  function savePagoMovilAccount(accPayload) {
    if (!Array.isArray(state.pagoMovilAccounts)) state.pagoMovilAccounts = [];
    if (accPayload.id) {
      const idx = state.pagoMovilAccounts.findIndex(a => a.id === accPayload.id);
      if (idx !== -1) {
        state.pagoMovilAccounts[idx] = Object.assign({}, state.pagoMovilAccounts[idx], accPayload);
        saveState(state);
        return state.pagoMovilAccounts[idx];
      }
    }
    const newAcc = {
      id: 'pm-acc-' + Date.now(),
      name: accPayload.name || 'Cuenta Pago Móvil',
      bank: accPayload.bank || '0102 - Venezuela',
      phone: accPayload.phone || '',
      rif: accPayload.rif || state.settings.rif || '',
      holder: accPayload.holder || state.settings.storeName || '',
      isDefault: !!accPayload.isDefault
    };
    if (newAcc.isDefault) {
      state.pagoMovilAccounts.forEach(a => a.isDefault = false);
    }
    state.pagoMovilAccounts.push(newAcc);
    saveState(state);
    return newAcc;
  }
  }

  /* Exportar / Importar Base de Datos Local en Disco Duro (Para Windows 7) */
  function exportBackupJson() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `RESPALDO_MI_TIENDA_POS_${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Respaldo descargado en el disco duro de la PC');
  }

  async function linkLocalDiskFile() {
    if (window.showSaveFilePicker) {
      try {
        localFileHandle = await window.showSaveFilePicker({
          suggestedName: 'BASE_DATOS_MI_TIENDA_POS.json',
          types: [{ description: 'Base de Datos JSON', accept: { 'application/json': ['.json'] } }]
        });
        saveState(state);
        toast('¡Archivo físico en disco vinculado! Todo cambio se guardará directo en tu PC.');
        return true;
      } catch (e) {
        return false;
      }
    } else {
      exportBackupJson();
      return false;
    }
  }

  function toast(msg, type = 'ok') {
    let container = document.getElementById('mtpToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mtpToastContainer';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'mtp-toast ' + (type === 'warn' ? 'warn' : type === 'err' ? 'err' : '');
    const ico = type === 'warn' ? '⚠️' : type === 'err' ? '🚨' : '✅';
    el.innerHTML = `<span>${ico}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(() => el.remove(), 260);
    }, 3100);
  }

  function resetDemoData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATE));
    location.reload();
  }

  window.MTP = {
    state,
    POS_GROUPS,
    getItemsForGroup,
    save: () => saveState(state),
    getFallbackSvgDataUri,
    fmtUSD,
    fmtBs,
    fmtEur,
    fmtBsRaw,
    fmtWeight,
    getInsumoById,
    calcDishCost,
    calcDishMaxPortions,
    getExchangeGapFactor,
    getEurGapFactor,
    calcRecommendedPriceUsd,
    findByCodeOrBarcode,
    isPagoMovilRefUsed,
    findUsedPagoMovilRef,
    parsePagoMovilSms,
    recordSale,
    recordExpense,
    recordKitchenPurchase,
    deleteExpense,
    addBulkStockEntry,
    recordMultiItemPurchase,
    recordWaste,
    recordAuditAdjustment,
    getKardexForItem,
    recordMovement: (p) => { const r = recordMovementInternal(p); saveState(state); return r; },
    quickCreateItemInGroup,
    getFinancialAnalytics,
    closeTerminalBatch,
    updatePagoMovilStatus,
    processC2pPayment,
    saveTerminal,
    savePagoMovilAccount,
    exportBackupJson,
    linkLocalDiskFile,
    toast,
    resetDemoData
  };
})();
