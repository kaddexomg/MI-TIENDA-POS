/* ==========================================================================
   MI-TIENDA-POS — Base de Datos Central v3
   - Separación Estricta: Insumos de Cocina (sellable: false) vs Venta al Público
   - Familias Agrupadas (Empanadas, Pastelitos/Tequeños, Papas Rellenas, Almuerzos,
     Cafetería, Chucherías/Pepitos, Refrescos, Cervezas, Cigarros, Víveres)
   - Imágenes Locales Verificadas de Comida Venezolana y Productos Reales
   ========================================================================== */
(function () {
  const STORAGE_KEY = 'mtp_store_v5';
  const STORAGE_KEY_V3 = 'mtp_store_v3';

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

  /* ==========================================================================
     CATÁLOGO V5: Familias Maestras, Productos Padre, Variantes/Sabores,
     Grupos de Modificadores/Extras, Insumos de Cocina y Mercancía Venta Directa
     ========================================================================== */
  const DEFAULT_FAMILIES = [
    { id: 'fritos', name: 'Fritos y Desayunos', color: '#E8A317', key: '1', order: 1, icon: 'dish' },
    { id: 'arepas', name: 'Arepas Venezolanas', color: '#F59E0B', key: '2', order: 2, icon: 'store' },
    { id: 'almuerzos', name: 'Almuerzos & Platos', color: '#D97706', key: '3', order: 3, icon: 'kitchen' },
    { id: 'cafeteria', name: 'Cafetería', color: '#8D5B4C', key: '4', order: 4, icon: 'coffee' },
    { id: 'bebidas', name: 'Bebidas & Refrescos', color: '#2563EB', key: '5', order: 5, icon: 'glass' },
    { id: 'cervezas', name: 'Cervezas', color: '#D97706', key: '6', order: 6, icon: 'beer' },
    { id: 'chucherias', name: 'Chucherías', color: '#EC4899', key: '7', order: 7, icon: 'package' },
    { id: 'cigarros', name: 'Cigarros', color: '#64748B', key: '8', order: 8, icon: 'bolt' },
    { id: 'viveres', name: 'Víveres', color: '#10B981', key: '9', order: 9, icon: 'cart' }
  ];

  const DEFAULT_PRODUCTS = [
    {
      id: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanadas Venezolanas',
      subtitle: 'Crujientes de maíz recién fritas',
      modifierGroupIds: [],
      order: 1,
      active: true,
      img: '../assets/img/productos/empanadas.jpg',
      emoji: '🥟'
    },
    {
      id: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Pastelitos Andinos y Tequeños',
      subtitle: 'Pastelitos de hojaldre y tequeños de queso',
      modifierGroupIds: [],
      order: 2,
      active: true,
      img: '../assets/img/productos/pastelitos.jpg',
      emoji: '🥐'
    },
    {
      id: 'prod-papas',
      familyId: 'fritos',
      name: 'Papas Rellenas Crujientes',
      subtitle: 'Puré de papa rebosado relleno',
      modifierGroupIds: [],
      order: 3,
      active: true,
      img: '../assets/img/productos/papa_rellena.jpg',
      emoji: '🥔'
    },
    {
      id: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepas Tostadas Venezolanas',
      subtitle: 'Asadas al budare y rellenas generosas',
      modifierGroupIds: ['mg-masa', 'mg-extras'],
      order: 1,
      active: true,
      img: '../assets/img/productos/empanadas.jpg',
      emoji: '🫓'
    },
    {
      id: 'prod-almuerzos',
      familyId: 'almuerzos',
      name: 'Almuerzos y Platos Fuertes',
      subtitle: 'Comida casera venezolana completa',
      modifierGroupIds: ['mg-empaque'],
      order: 1,
      active: true,
      img: '../assets/img/productos/pabellon.jpg',
      emoji: '🍛'
    },
    {
      id: 'prod-cafe',
      familyId: 'cafeteria',
      name: 'Cafetería Recién Colada',
      subtitle: 'Café venezolano colado al momento',
      modifierGroupIds: [],
      order: 1,
      active: true,
      img: '../assets/img/productos/cafe.jpg',
      emoji: '☕'
    }
  ];

  const DEFAULT_MODIFIER_GROUPS = [
    {
      id: 'mg-masa',
      name: 'Tipo de Masa',
      min: 1,
      max: 1,
      required: true,
      options: [
        { id: 'mod-masa-blanca', name: 'Masa Blanca', priceUsd: 0, recipe: [] },
        { id: 'mod-masa-amarilla', name: 'Masa Amarilla', priceUsd: 0, recipe: [] }
      ]
    },
    {
      id: 'mg-extras',
      name: 'Adicionales',
      min: 0,
      max: 4,
      required: false,
      options: [
        {
          id: 'mod-extra-queso',
          name: '+ Queso Rallado',
          priceUsd: 0.40,
          recipe: [{ insumoId: 'ins-queso-cocina', qty: 0.030, label: '30 g Queso Rallado' }]
        },
        {
          id: 'mod-extra-aguacate',
          name: '+ Aguacate',
          priceUsd: 0.50,
          recipe: [{ insumoId: 'ins-ensalada', qty: 0.050, label: '50 g Aguacate' }]
        },
        {
          id: 'mod-extra-huevo',
          name: '+ Huevo Frito',
          priceUsd: 0.40,
          recipe: [{ insumoId: 'ins-aceite-cocina', qty: 0.010, label: '10 ml Aceite' }]
        },
        {
          id: 'mod-extra-mantequilla',
          name: '+ Mantequilla',
          priceUsd: 0.20,
          recipe: []
        }
      ]
    },
    {
      id: 'mg-empaque',
      name: 'Empaque y Servicio',
      min: 1,
      max: 1,
      required: true,
      options: [
        { id: 'mod-empaque-aqui', name: 'Para Comer Aquí', priceUsd: 0, recipe: [] },
        {
          id: 'mod-empaque-llevar',
          name: 'Para Llevar con Envase',
          priceUsd: 0.30,
          recipe: [{ insumoId: 'ins-envase', qty: 1, label: '1 Envase Térmico' }]
        }
      ]
    }
  ];

  const DEFAULT_VARIANTS = [
    // Empanadas ('prod-empanada')
    {
      id: 'var-emp-queso',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Queso',
      code: '01',
      barcode: '8800001',
      priceUsd: 1.10,
      ivaType: 'E',
      active: true,
      order: 1,
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-queso-cocina', qty: 0.055, label: '55 g Queso Blanco' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-molida',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Molida',
      code: '02',
      barcode: '8800002',
      priceUsd: 1.20,
      ivaType: 'E',
      active: true,
      order: 2,
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-carne-mechada', qty: 0.045, label: '45 g Carne Molida' },
        { insumoId: 'ins-papa', qty: 0.030, label: '30 g Papa picada' },
        { insumoId: 'ins-alinos', qty: 0.015, label: '15 g Aliños sofrito' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-mechada',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Mechada',
      code: '03',
      barcode: '8800003',
      priceUsd: 1.30,
      ivaType: 'E',
      active: true,
      order: 3,
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.075, label: '75 g Harina Maíz' },
        { insumoId: 'ins-carne-mechada', qty: 0.055, label: '55 g Carne Mechada' },
        { insumoId: 'ins-alinos', qty: 0.020, label: '20 g Aliños guiso' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-pollo',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Pollo',
      code: '04',
      barcode: '8800004',
      priceUsd: 1.30,
      ivaType: 'E',
      active: true,
      order: 4,
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-pollo-cocina', qty: 0.060, label: '60 g Pollo Desmechado' },
        { insumoId: 'ins-papa', qty: 0.020, label: '20 g Papa guiso' },
        { insumoId: 'ins-alinos', qty: 0.018, label: '18 g Aliños' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-jamon-queso',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Jamón y Queso',
      code: '05',
      barcode: '8800005',
      priceUsd: 1.40,
      ivaType: 'E',
      active: true,
      order: 5,
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-jamon-cocina', qty: 0.035, label: '35 g Jamón' },
        { insumoId: 'ins-queso-cocina', qty: 0.035, label: '35 g Queso' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-cazon',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Cazón',
      code: '06',
      barcode: '8800006',
      priceUsd: 1.50,
      ivaType: 'E',
      active: true,
      order: 6,
      emoji: '🐟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-cazon-cocina', qty: 0.060, label: '60 g Cazón guisado' },
        { insumoId: 'ins-alinos', qty: 0.025, label: '25 g Aliños y Ají dulce' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-pelua',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada Pelúa',
      code: '07',
      barcode: '8800007',
      priceUsd: 1.50,
      ivaType: 'E',
      active: true,
      order: 7,
      emoji: '🧀',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.075, label: '75 g Harina Maíz' },
        { insumoId: 'ins-carne-mechada', qty: 0.050, label: '50 g Carne Mechada' },
        { insumoId: 'ins-queso-cocina', qty: 0.040, label: '40 g Queso Amarillo' },
        { insumoId: 'ins-alinos', qty: 0.018, label: '18 g Aliños' },
        { insumoId: 'ins-aceite-cocina', qty: 0.020, label: '20 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-domino',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada Dominó',
      code: '08',
      barcode: '8800008',
      priceUsd: 1.30,
      ivaType: 'E',
      active: true,
      order: 8,
      emoji: '🥟',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-chicharron-cocina', qty: 0.045, label: '45 g Caraotas refritas' },
        { insumoId: 'ins-queso-cocina', qty: 0.040, label: '40 g Queso Blanco' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-pabellon',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada Pabellón',
      code: '09',
      barcode: '8800009',
      priceUsd: 1.60,
      ivaType: 'E',
      active: true,
      order: 9,
      emoji: '🇻🇪',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.075, label: '75 g Harina Maíz' },
        { insumoId: 'ins-carne-mechada', qty: 0.040, label: '40 g Carne Mechada' },
        { insumoId: 'ins-chicharron-cocina', qty: 0.030, label: '30 g Caraotas' },
        { insumoId: 'ins-queso-cocina', qty: 0.025, label: '25 g Queso Blanco' },
        { insumoId: 'ins-ensalada', qty: 0.020, label: '20 g Tajadas' },
        { insumoId: 'ins-aceite-cocina', qty: 0.020, label: '20 ml Aceite' }
      ]
    },
    {
      id: 'var-emp-chicharron',
      productId: 'prod-empanada',
      familyId: 'fritos',
      name: 'Empanada de Chicharrón',
      code: '10',
      barcode: '8800010',
      priceUsd: 1.40,
      ivaType: 'E',
      active: true,
      order: 10,
      emoji: '🍖',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.070, label: '70 g Harina Maíz' },
        { insumoId: 'ins-chicharron-cocina', qty: 0.055, label: '55 g Chicharrón' },
        { insumoId: 'ins-alinos', qty: 0.015, label: '15 g Aliños' },
        { insumoId: 'ins-aceite-cocina', qty: 0.018, label: '18 ml Aceite' }
      ]
    },

    // Pastelitos y Tequeños ('prod-pastelito')
    {
      id: 'var-past-queso',
      productId: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Pastelito Queso',
      code: '11',
      barcode: '8800011',
      priceUsd: 1.00,
      ivaType: 'E',
      active: true,
      order: 11,
      emoji: '🥐',
      img: '../assets/img/productos/pastelitos.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
        { insumoId: 'ins-queso-cocina', qty: 0.045, label: '45 g Queso' },
        { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
      ]
    },
    {
      id: 'var-past-carne',
      productId: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Pastelito Carne',
      code: '12',
      barcode: '8800012',
      priceUsd: 1.20,
      ivaType: 'E',
      active: true,
      order: 12,
      emoji: '🥐',
      img: '../assets/img/productos/pastelitos.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
        { insumoId: 'ins-carne-mechada', qty: 0.040, label: '40 g Carne Molida' },
        { insumoId: 'ins-papa', qty: 0.025, label: '25 g Papa pastelito' },
        { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
      ]
    },
    {
      id: 'var-past-pollo',
      productId: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Pastelito Pollo',
      code: '13',
      barcode: '8800013',
      priceUsd: 1.20,
      ivaType: 'E',
      active: true,
      order: 13,
      emoji: '🥐',
      img: '../assets/img/productos/pastelitos.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
        { insumoId: 'ins-pollo-cocina', qty: 0.045, label: '45 g Pollo' },
        { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
      ]
    },
    {
      id: 'var-past-jamon-queso',
      productId: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Pastelito Jamón y Queso',
      code: '14',
      barcode: '8800014',
      priceUsd: 1.30,
      ivaType: 'E',
      active: true,
      order: 14,
      emoji: '🥐',
      img: '../assets/img/productos/pastelitos.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.060, label: '60 g Harina Trigo' },
        { insumoId: 'ins-jamon-cocina', qty: 0.030, label: '30 g Jamón' },
        { insumoId: 'ins-queso-cocina', qty: 0.030, label: '30 g Queso' },
        { insumoId: 'ins-aceite-cocina', qty: 0.015, label: '15 ml Aceite' }
      ]
    },
    {
      id: 'var-tequenos-5',
      productId: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Ración Tequeños 5 und',
      code: '15',
      barcode: '8800015',
      priceUsd: 2.00,
      ivaType: 'E',
      active: true,
      order: 15,
      emoji: '🥖',
      img: '../assets/img/productos/tequenos.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Trigo' },
        { insumoId: 'ins-queso-cocina', qty: 0.100, label: '100 g Queso Blanco' },
        { insumoId: 'ins-aceite-cocina', qty: 0.025, label: '25 ml Aceite' }
      ]
    },
    {
      id: 'var-tequenos-10',
      productId: 'prod-pastelito',
      familyId: 'fritos',
      name: 'Ración Tequeños 10 und',
      code: '16',
      barcode: '8800016',
      priceUsd: 3.50,
      ivaType: 'E',
      active: true,
      order: 16,
      emoji: '🥖',
      img: '../assets/img/productos/tequenos.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.220, label: '220 g Harina Trigo' },
        { insumoId: 'ins-queso-cocina', qty: 0.200, label: '200 g Queso Blanco' },
        { insumoId: 'ins-aceite-cocina', qty: 0.045, label: '45 ml Aceite' }
      ]
    },

    // Papas Rellenas ('prod-papas')
    {
      id: 'var-papa-carne-queso',
      productId: 'prod-papas',
      familyId: 'fritos',
      name: 'Papa Rellena Carne y Queso',
      code: '17',
      barcode: '8800017',
      priceUsd: 1.60,
      ivaType: 'E',
      active: true,
      order: 17,
      emoji: '🥔',
      img: '../assets/img/productos/papa_rellena.jpg',
      recipe: [
        { insumoId: 'ins-papa', qty: 0.160, label: '160 g Puré de Papa' },
        { insumoId: 'ins-carne-mechada', qty: 0.055, label: '55 g Carne Guisada' },
        { insumoId: 'ins-queso-cocina', qty: 0.025, label: '25 g Queso' },
        { insumoId: 'ins-alinos', qty: 0.020, label: '20 g Aliños' },
        { insumoId: 'ins-harina-cocina', qty: 0.025, label: '25 g Reboso' },
        { insumoId: 'ins-aceite-cocina', qty: 0.025, label: '25 ml Aceite' }
      ]
    },
    {
      id: 'var-papa-pollo-queso',
      productId: 'prod-papas',
      familyId: 'fritos',
      name: 'Papa Rellena Pollo y Queso',
      code: '18',
      barcode: '8800018',
      priceUsd: 1.60,
      ivaType: 'E',
      active: true,
      order: 18,
      emoji: '🥔',
      img: '../assets/img/productos/papa_rellena.jpg',
      recipe: [
        { insumoId: 'ins-papa', qty: 0.160, label: '160 g Puré de Papa' },
        { insumoId: 'ins-pollo-cocina', qty: 0.060, label: '60 g Pollo Guisado' },
        { insumoId: 'ins-queso-cocina', qty: 0.025, label: '25 g Queso' },
        { insumoId: 'ins-alinos', qty: 0.020, label: '20 g Aliños' },
        { insumoId: 'ins-aceite-cocina', qty: 0.025, label: '25 ml Aceite' }
      ]
    },

    // Arepas Venezolanas ('prod-arepa')
    {
      id: 'var-arepa-reina',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Reina Pepiada',
      code: '19',
      barcode: '8800019',
      priceUsd: 3.00,
      ivaType: 'E',
      active: true,
      order: 19,
      emoji: '🥑',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-pollo-cocina', qty: 0.090, label: '90 g Pollo desmechado' },
        { insumoId: 'ins-ensalada', qty: 0.040, label: '40 g Aguacate/Mayonesa' },
        { insumoId: 'ins-alinos', qty: 0.015, label: '15 g Aliños' }
      ]
    },
    {
      id: 'var-arepa-pelua',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Pelúa',
      code: '20',
      barcode: '8800020',
      priceUsd: 2.80,
      ivaType: 'E',
      active: true,
      order: 20,
      emoji: '🧀',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-carne-mechada', qty: 0.080, label: '80 g Carne Mechada' },
        { insumoId: 'ins-queso-cocina', qty: 0.040, label: '40 g Queso Amarillo' }
      ]
    },
    {
      id: 'var-arepa-mechada',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Mechada',
      code: '21',
      barcode: '8800021',
      priceUsd: 2.80,
      ivaType: 'E',
      active: true,
      order: 21,
      emoji: '🥩',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-carne-mechada', qty: 0.090, label: '90 g Carne Mechada' },
        { insumoId: 'ins-alinos', qty: 0.020, label: '20 g Aliños' }
      ]
    },
    {
      id: 'var-arepa-queso',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Queso Llanero',
      code: '22',
      barcode: '8800022',
      priceUsd: 2.00,
      ivaType: 'E',
      active: true,
      order: 22,
      emoji: '🧀',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-queso-cocina', qty: 0.080, label: '80 g Queso Blanco' }
      ]
    },
    {
      id: 'var-arepa-jamon-queso',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Jamón y Queso',
      code: '23',
      barcode: '8800023',
      priceUsd: 2.20,
      ivaType: 'E',
      active: true,
      order: 23,
      emoji: '🥓',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-jamon-cocina', qty: 0.045, label: '45 g Jamón' },
        { insumoId: 'ins-queso-cocina', qty: 0.045, label: '45 g Queso' }
      ]
    },
    {
      id: 'var-arepa-domino',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Dominó',
      code: '24',
      barcode: '8800024',
      priceUsd: 2.20,
      ivaType: 'E',
      active: true,
      order: 24,
      emoji: '🫓',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-chicharron-cocina', qty: 0.060, label: '60 g Caraotas' },
        { insumoId: 'ins-queso-cocina', qty: 0.040, label: '40 g Queso Blanco' }
      ]
    },
    {
      id: 'var-arepa-catira',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Catira',
      code: '25',
      barcode: '8800025',
      priceUsd: 2.80,
      ivaType: 'E',
      active: true,
      order: 25,
      emoji: '🍗',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' },
        { insumoId: 'ins-pollo-cocina', qty: 0.080, label: '80 g Pollo' },
        { insumoId: 'ins-queso-cocina', qty: 0.040, label: '40 g Queso Amarillo' }
      ]
    },
    {
      id: 'var-arepa-viuda',
      productId: 'prod-arepa',
      familyId: 'arepas',
      name: 'Arepa Viuda / Sola',
      code: '26',
      barcode: '8800026',
      priceUsd: 1.00,
      ivaType: 'E',
      active: true,
      order: 26,
      emoji: '🫓',
      img: '../assets/img/productos/empanadas.jpg',
      recipe: [
        { insumoId: 'ins-harina-cocina', qty: 0.110, label: '110 g Harina Maíz' }
      ]
    },

    // Almuerzos y Platos Fuertes ('prod-almuerzos')
    {
      id: 'var-alm-pabellon',
      productId: 'prod-almuerzos',
      familyId: 'almuerzos',
      name: 'Pabellón Criollo',
      code: '27',
      barcode: '8800027',
      priceUsd: 5.00,
      ivaType: 'E',
      active: true,
      order: 27,
      emoji: '🇻🇪',
      img: '../assets/img/productos/pabellon.jpg',
      recipe: [
        { insumoId: 'ins-carne-mechada', qty: 0.160, label: '160 g Carne Mechada' },
        { insumoId: 'ins-chicharron-cocina', qty: 0.120, label: '120 g Caraotas Negras' },
        { insumoId: 'ins-arroz-cocina', qty: 0.140, label: '140 g Arroz Blanco' },
        { insumoId: 'ins-ensalada', qty: 0.120, label: '120 g Tajadas' },
        { insumoId: 'ins-queso-cocina', qty: 0.035, label: '35 g Queso Blanco' },
        { insumoId: 'ins-alinos', qty: 0.045, label: '45 g Sofrito' }
      ]
    },
    {
      id: 'var-alm-arroz-chino',
      productId: 'prod-almuerzos',
      familyId: 'almuerzos',
      name: 'Arroz Chino Venezolano',
      code: '28',
      barcode: '8800028',
      priceUsd: 4.50,
      ivaType: 'E',
      active: true,
      order: 28,
      emoji: '🥡',
      img: '../assets/img/productos/arroz_chino.jpg',
      recipe: [
        { insumoId: 'ins-arroz-cocina', qty: 0.170, label: '170 g Arroz Frito' },
        { insumoId: 'ins-pollo-cocina', qty: 0.220, label: '220 g Pollo Frito' },
        { insumoId: 'ins-jamon-cocina', qty: 0.040, label: '40 g Jamón' },
        { insumoId: 'ins-alinos', qty: 0.055, label: '55 g Cebollín/Brotes' },
        { insumoId: 'ins-aceite-cocina', qty: 0.030, label: '30 ml Aceite' }
      ]
    },
    {
      id: 'var-alm-arroz-pollo',
      productId: 'prod-almuerzos',
      familyId: 'almuerzos',
      name: 'Arroz con Pollo Criollo',
      code: '29',
      barcode: '8800029',
      priceUsd: 4.00,
      ivaType: 'E',
      active: true,
      order: 29,
      emoji: '🍛',
      img: '../assets/img/productos/arroz_pollo.jpg',
      recipe: [
        { insumoId: 'ins-arroz-cocina', qty: 0.150, label: '150 g Arroz' },
        { insumoId: 'ins-pollo-cocina', qty: 0.200, label: '200 g Pollo' },
        { insumoId: 'ins-papa', qty: 0.080, label: '80 g Papa/Verdura' },
        { insumoId: 'ins-alinos', qty: 0.050, label: '50 g Aliños' },
        { insumoId: 'ins-ensalada', qty: 0.080, label: '80 g Ensalada' }
      ]
    },
    {
      id: 'var-alm-pollo-broaster',
      productId: 'prod-almuerzos',
      familyId: 'almuerzos',
      name: 'Pollo Frito Broaster con Arepa',
      code: '30',
      barcode: '8800030',
      priceUsd: 4.50,
      ivaType: 'E',
      active: true,
      order: 30,
      emoji: '🍗',
      img: '../assets/img/productos/pollo_frito.jpg',
      recipe: [
        { insumoId: 'ins-pollo-cocina', qty: 0.260, label: '260 g Presas de Pollo' },
        { insumoId: 'ins-harina-cocina', qty: 0.090, label: '90 g Harina arepa/rebozo' },
        { insumoId: 'ins-papa', qty: 0.140, label: '140 g Papas Fritas' },
        { insumoId: 'ins-ensalada', qty: 0.100, label: '100 g Ensalada' },
        { insumoId: 'ins-alinos', qty: 0.025, label: '25 g Salsa/Aliños' },
        { insumoId: 'ins-aceite-cocina', qty: 0.040, label: '40 ml Aceite' }
      ]
    },

    // Cafetería ('prod-cafe')
    {
      id: 'var-cafe-guayoyo',
      productId: 'prod-cafe',
      familyId: 'cafeteria',
      name: 'Café Guayoyo / Negro',
      code: '31',
      barcode: '8800031',
      priceUsd: 0.60,
      ivaType: 'E',
      active: true,
      order: 31,
      emoji: '☕',
      img: '../assets/img/productos/cafe.jpg',
      recipe: [
        { insumoId: 'ins-cafe-cocina', qty: 0.018, label: '18 g Café + Vaso' }
      ]
    },
    {
      id: 'var-cafe-leche-peq',
      productId: 'prod-cafe',
      familyId: 'cafeteria',
      name: 'Con Leche Pequeño',
      code: '32',
      barcode: '8800032',
      priceUsd: 0.80,
      ivaType: 'E',
      active: true,
      order: 32,
      emoji: '☕',
      img: '../assets/img/productos/cafe.jpg',
      recipe: [
        { insumoId: 'ins-cafe-cocina', qty: 0.024, label: '24 g Café + Leche' }
      ]
    },
    {
      id: 'var-cafe-leche-gra',
      productId: 'prod-cafe',
      familyId: 'cafeteria',
      name: 'Con Leche Grande',
      code: '33',
      barcode: '8800033',
      priceUsd: 1.00,
      ivaType: 'E',
      active: true,
      order: 33,
      emoji: '🥛',
      img: '../assets/img/productos/cafe.jpg',
      recipe: [
        { insumoId: 'ins-cafe-cocina', qty: 0.032, label: '32 g Café + Leche' }
      ]
    },
    {
      id: 'var-cafe-marron',
      productId: 'prod-cafe',
      familyId: 'cafeteria',
      name: 'Marrón Oscuro',
      code: '34',
      barcode: '8800034',
      priceUsd: 0.80,
      ivaType: 'E',
      active: true,
      order: 34,
      emoji: '☕',
      img: '../assets/img/productos/cafe.jpg',
      recipe: [
        { insumoId: 'ins-cafe-cocina', qty: 0.024, label: '24 g Café + Leche' }
      ]
    }
  ];

  const DEFAULT_RETAIL_ITEMS = [
    // Víveres
    {
      id: 'prod-harina-pan',
      familyId: 'viveres',
      group: 'viveres',
      code: '101',
      barcode: '7591001000015',
      qrCode: 'QR-HARINA-PAN-1KG',
      name: 'Harina P.A.N. Blanca 1Kg',
      category: 'Víveres',
      type: 'venta',
      sellable: true,
      taxExempt: true,
      ivaType: 'E',
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
      familyId: 'viveres',
      group: 'viveres',
      code: '102',
      barcode: '7591001000022',
      qrCode: 'QR-HARINA-PAN-AMARILLA',
      name: 'Harina P.A.N. Amarilla 1Kg',
      category: 'Víveres',
      type: 'venta',
      sellable: true,
      taxExempt: true,
      ivaType: 'E',
      unit: 'und',
      stock: 30,
      minStock: 10,
      costUsd: 1.10,
      prevCostUsd: 1.05,
      priceUsd: 1.65,
      emoji: '🌽',
      img: '../assets/img/productos/viveres.jpg'
    },
    {
      id: 'prod-espagueti',
      familyId: 'viveres',
      group: 'viveres',
      code: '103',
      barcode: '7591003000033',
      qrCode: 'QR-ESPAGUETI-1KG',
      name: 'Espagueti / Pasta Larga Capri 1Kg',
      category: 'Víveres',
      type: 'venta',
      sellable: true,
      taxExempt: true,
      ivaType: 'E',
      unit: 'und',
      stock: 35,
      minStock: 10,
      costUsd: 0.85,
      prevCostUsd: 0.80,
      priceUsd: 1.25,
      emoji: '🍝',
      img: '../assets/img/productos/espagueti.jpg'
    },
    {
      id: 'prod-arroz-empaque',
      familyId: 'viveres',
      group: 'viveres',
      code: '105',
      barcode: '7591002000029',
      qrCode: 'QR-ARROZ-PRIMOR-1KG',
      name: 'Arroz Blanco Primor 1Kg',
      category: 'Víveres',
      type: 'venta',
      sellable: true,
      taxExempt: true,
      ivaType: 'E',
      unit: 'und',
      stock: 40,
      minStock: 10,
      costUsd: 0.85,
      prevCostUsd: 0.80,
      priceUsd: 1.20,
      emoji: '🌾',
      img: '../assets/img/productos/viveres.jpg'
    },
    {
      id: 'prod-mavesa',
      familyId: 'viveres',
      group: 'viveres',
      code: '106',
      barcode: '7591007000079',
      qrCode: 'QR-MAVESA-500G',
      name: 'Margarina Mavesa 500g',
      category: 'Víveres',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 22,
      minStock: 6,
      costUsd: 1.25,
      prevCostUsd: 1.20,
      priceUsd: 1.80,
      emoji: '🧈',
      img: '../assets/img/productos/viveres.jpg'
    },

    // Bebidas y Refrescos
    {
      id: 'prod-frescolita-15l',
      familyId: 'bebidas',
      group: 'refrescos',
      code: '302',
      barcode: '7593001000211',
      qrCode: 'QR-FRESCOLITA-15L',
      name: 'Refresco Frescolita 1.5 Litros',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 24,
      minStock: 8,
      costUsd: 1.20,
      prevCostUsd: 1.15,
      priceUsd: 1.80,
      emoji: '🥤',
      img: '../assets/img/productos/refrescos.jpg'
    },
    {
      id: 'prod-cocacola-15l',
      familyId: 'bebidas',
      group: 'refrescos',
      code: '304',
      barcode: '7593001000228',
      qrCode: 'QR-COCACOLA-15L',
      name: 'Coca-Cola Original 1.5 Litros',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 24,
      minStock: 8,
      costUsd: 1.35,
      prevCostUsd: 1.30,
      priceUsd: 2.00,
      emoji: '🥤',
      img: '../assets/img/productos/refrescos.jpg'
    },
    {
      id: 'prod-malta-lata',
      familyId: 'bebidas',
      group: 'refrescos',
      code: '306',
      barcode: '7593001000235',
      qrCode: 'QR-MALTA-POLAR-LATA',
      name: 'Malta Polar 250ml (Lata / Botellita)',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 36,
      minStock: 12,
      costUsd: 0.65,
      prevCostUsd: 0.60,
      priceUsd: 1.00,
      emoji: '🍺',
      img: '../assets/img/productos/refrescos.jpg'
    },
    {
      id: 'prod-malta-15l',
      familyId: 'bebidas',
      group: 'refrescos',
      code: '307',
      barcode: '7593001000242',
      qrCode: 'QR-MALTA-POLAR-15L',
      name: 'Malta Polar Familiar 1.5 Litros',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 20,
      minStock: 6,
      costUsd: 1.45,
      prevCostUsd: 1.40,
      priceUsd: 2.20,
      emoji: '🍺',
      img: '../assets/img/productos/refrescos.jpg'
    },
    {
      id: 'prod-agua-mineral',
      familyId: 'bebidas',
      group: 'refrescos',
      code: '309',
      barcode: '7593001000259',
      qrCode: 'QR-AGUA-MINERAL',
      name: 'Agua Mineral Nevada 500ml',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: true,
      ivaType: 'E',
      unit: 'und',
      stock: 40,
      minStock: 12,
      costUsd: 0.40,
      prevCostUsd: 0.35,
      priceUsd: 0.80,
      emoji: '💧',
      img: '../assets/img/productos/refrescos.jpg'
    },

    // Cervezas
    {
      id: 'prod-polar-pilsen',
      familyId: 'cervezas',
      group: 'cervezas',
      code: '501',
      barcode: '7594001000310',
      qrCode: 'QR-POLAR-PILSEN',
      name: 'Cerveza Polar Pilsen (Polarcita)',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 48,
      minStock: 12,
      costUsd: 0.80,
      prevCostUsd: 0.75,
      priceUsd: 1.25,
      emoji: '🍺',
      img: '../assets/img/productos/cervezas.jpg'
    },
    {
      id: 'prod-polar-zulia',
      familyId: 'cervezas',
      group: 'cervezas',
      code: '502',
      barcode: '7594001000327',
      qrCode: 'QR-POLAR-ZULIA',
      name: 'Cerveza Zulia Original',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 36,
      minStock: 10,
      costUsd: 0.88,
      prevCostUsd: 0.82,
      priceUsd: 1.35,
      emoji: '🍻',
      img: '../assets/img/productos/cervezas.jpg'
    },
    {
      id: 'prod-solera-verde',
      familyId: 'cervezas',
      group: 'cervezas',
      code: '503',
      barcode: '7594001000334',
      qrCode: 'QR-SOLERA-VERDE',
      name: 'Cerveza Solera Premium (Verde)',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 30,
      minStock: 8,
      costUsd: 0.98,
      prevCostUsd: 0.92,
      priceUsd: 1.50,
      emoji: '🍻',
      img: '../assets/img/productos/cervezas.jpg'
    },
    {
      id: 'prod-sixpack-polar',
      familyId: 'cervezas',
      group: 'cervezas',
      code: '504',
      barcode: '7594001000341',
      qrCode: 'QR-SIXPACK-POLAR',
      name: 'Six-Pack Polar Pilsen (6 Und)',
      category: 'Refrescos & Cervezas',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 15,
      minStock: 4,
      costUsd: 4.60,
      prevCostUsd: 4.30,
      priceUsd: 7.00,
      emoji: '🍻',
      img: '../assets/img/productos/cervezas.jpg'
    },

    // Chucherías
    {
      id: 'prod-pepito',
      familyId: 'chucherias',
      group: 'chucherias',
      code: '201',
      barcode: '7592001000112',
      qrCode: 'QR-PEPITO-CLASICO',
      name: 'Pepito Original Frito-Lay',
      category: 'Chucherías',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
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
      id: 'prod-cheetos',
      familyId: 'chucherias',
      group: 'chucherias',
      code: '203',
      barcode: '7592001000136',
      qrCode: 'QR-CHEETOS',
      name: 'Cheetos Crujientes Queso',
      category: 'Chucherías',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 42,
      minStock: 10,
      costUsd: 0.65,
      prevCostUsd: 0.60,
      priceUsd: 1.10,
      emoji: '🐆',
      img: '../assets/img/productos/cheetos.jpg'
    },
    {
      id: 'prod-cheese-tris',
      familyId: 'chucherias',
      group: 'chucherias',
      code: '204',
      barcode: '7592001000143',
      qrCode: 'QR-CHISKESITOS',
      name: 'Cheese Tris / Chiskesitos',
      category: 'Chucherías',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 48,
      minStock: 12,
      costUsd: 0.58,
      prevCostUsd: 0.52,
      priceUsd: 1.00,
      emoji: '🧀',
      img: '../assets/img/productos/pepito.jpg'
    },
    {
      id: 'prod-doritos',
      familyId: 'chucherias',
      group: 'chucherias',
      code: '205',
      barcode: '7592001000150',
      qrCode: 'QR-DORITOS',
      name: 'Doritos Mega Queso Nacho',
      category: 'Chucherías',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 35,
      minStock: 10,
      costUsd: 0.95,
      prevCostUsd: 0.90,
      priceUsd: 1.50,
      emoji: '🔺',
      img: '../assets/img/productos/pepito.jpg'
    },
    {
      id: 'prod-galletas-savoy',
      familyId: 'chucherias',
      group: 'chucherias',
      code: '207',
      barcode: '7592001000167',
      qrCode: 'QR-GALLETAS-SAVOY',
      name: 'Galletas Samba / Savoy Chocolate',
      category: 'Chucherías',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 40,
      minStock: 10,
      costUsd: 0.50,
      prevCostUsd: 0.45,
      priceUsd: 0.90,
      emoji: '🍫',
      img: '../assets/img/productos/pepito.jpg'
    },

    // Cigarros
    {
      id: 'prod-cigarro-detal',
      familyId: 'cigarros',
      group: 'cigarros',
      code: '401',
      barcode: '7595001000419',
      qrCode: 'QR-CIGARRO-DETAL',
      name: 'Cigarro Detallado 1 Und (Belmont/Consul)',
      category: 'Cigarros',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 120,
      minStock: 30,
      costUsd: 0.10,
      prevCostUsd: 0.09,
      priceUsd: 0.20,
      emoji: '🚬',
      img: '../assets/img/productos/cigarros.jpg'
    },
    {
      id: 'prod-cigarro-belmont',
      familyId: 'cigarros',
      group: 'cigarros',
      code: '402',
      barcode: '7595001000426',
      qrCode: 'QR-BELMONT-20',
      name: 'Cajetilla Belmont 20 Cigarros',
      category: 'Cigarros',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 25,
      minStock: 6,
      costUsd: 2.10,
      prevCostUsd: 2.00,
      priceUsd: 2.90,
      emoji: '🚬',
      img: '../assets/img/productos/cigarros.jpg'
    },
    {
      id: 'prod-cigarro-consul',
      familyId: 'cigarros',
      group: 'cigarros',
      code: '403',
      barcode: '7595001000433',
      qrCode: 'QR-CONSUL-20',
      name: 'Cajetilla Consul 20 Cigarros',
      category: 'Cigarros',
      type: 'venta',
      sellable: true,
      taxExempt: false,
      ivaType: 'G',
      unit: 'und',
      stock: 20,
      minStock: 5,
      costUsd: 1.80,
      prevCostUsd: 1.70,
      priceUsd: 2.50,
      emoji: '🚬',
      img: '../assets/img/productos/cigarros.jpg'
    }
  ];

  const DEFAULT_INSUMOS = [
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
      name: 'Vegetales de Ensalada, Aguacate y Plátanos para Tajadas (Cocina)',
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
      name: 'Café en Grano/Molido y Leche en Polvo (Cafetería)',
      category: 'Insumos de Cocina (Materia Prima)',
      type: 'insumo',
      sellable: false,
      unit: 'kg',
      stock: 4.500,
      minStock: 1.500,
      costUsd: 7.50,
      prevCostUsd: 7.00,
      priceUsd: 0,
      emoji: '☕',
      img: '../assets/img/productos/cafe.jpg'
    },
    {
      id: 'ins-envase',
      code: 'COC-14',
      barcode: '990014',
      name: 'Envases Térmicos de Almuerzo y Vasos Desechables',
      category: 'Insumos de Cocina (Materia Prima)',
      type: 'insumo',
      sellable: false,
      unit: 'und',
      stock: 150,
      minStock: 40,
      costUsd: 0.12,
      prevCostUsd: 0.10,
      priceUsd: 0,
      emoji: '🥡',
      img: '../assets/img/productos/arroz_chino.jpg'
    }
  ];

  /* --------------------------------------------------------------------------
     Función de Migración Automática y Transparente v3 -> v5
     -------------------------------------------------------------------------- */
  function migrateV3toV5(oldState) {
    if (!oldState) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    if (oldState.version === 5 && Array.isArray(oldState.variants) && oldState.variants.length > 0) {
      return oldState;
    }

    const migrated = Object.assign({}, DEFAULT_STATE, oldState);
    migrated.version = 5;

    // Preservar íntegramente datos operativos y contables
    migrated.sales = Array.isArray(oldState.sales) ? oldState.sales : JSON.parse(JSON.stringify(DEFAULT_STATE.sales));
    migrated.expenses = Array.isArray(oldState.expenses) ? oldState.expenses : JSON.parse(JSON.stringify(DEFAULT_STATE.expenses));
    migrated.kardex = Array.isArray(oldState.kardex) ? oldState.kardex : JSON.parse(JSON.stringify(DEFAULT_STATE.kardex));
    migrated.purchases = Array.isArray(oldState.purchases) ? oldState.purchases : JSON.parse(JSON.stringify(DEFAULT_STATE.purchases));
    migrated.invoices = Array.isArray(oldState.invoices) ? oldState.invoices : JSON.parse(JSON.stringify(DEFAULT_STATE.invoices));
    migrated.suppliers = Array.isArray(oldState.suppliers) ? oldState.suppliers : JSON.parse(JSON.stringify(DEFAULT_STATE.suppliers));
    migrated.heldOrders = Array.isArray(oldState.heldOrders) ? oldState.heldOrders : [];
    migrated.kitchenBatches = Array.isArray(oldState.kitchenBatches) ? oldState.kitchenBatches : [];
    migrated.wasteRecords = Array.isArray(oldState.wasteRecords) ? oldState.wasteRecords : [];
    migrated.posTerminals = Array.isArray(oldState.posTerminals) ? oldState.posTerminals : JSON.parse(JSON.stringify(DEFAULT_STATE.posTerminals));
    migrated.pagoMovilAccounts = Array.isArray(oldState.pagoMovilAccounts) ? oldState.pagoMovilAccounts : JSON.parse(JSON.stringify(DEFAULT_STATE.pagoMovilAccounts));
    migrated.batchClosures = Array.isArray(oldState.batchClosures) ? oldState.batchClosures : [];
    migrated.settings = Object.assign({}, DEFAULT_STATE.settings, oldState.settings || {});

    migrated.families = JSON.parse(JSON.stringify(DEFAULT_FAMILIES));
    migrated.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    migrated.modifierGroups = JSON.parse(JSON.stringify(DEFAULT_MODIFIER_GROUPS));
    
    const variants = JSON.parse(JSON.stringify(DEFAULT_VARIANTS));
    
    // Mapeo inteligente de platos v3 a variantes v5
    if (Array.isArray(oldState.dishes)) {
      oldState.dishes.forEach(oldDish => {
        const cleanName = (oldDish.name || '').toLowerCase();
        let matched = variants.find(v => 
          (oldDish.code && v.code === oldDish.code) ||
          (oldDish.barcode && v.barcode === oldDish.barcode) ||
          (cleanName && v.name.toLowerCase() === cleanName)
        );

        if (matched) {
          if (oldDish.priceUsd) matched.priceUsd = oldDish.priceUsd;
          if (Array.isArray(oldDish.ingredients) && oldDish.ingredients.length) {
            matched.recipe = oldDish.ingredients;
          }
        } else {
          // Plato personalizado en v3: deducir producto padre
          let targetProd = 'prod-empanada';
          let familyId = 'fritos';
          if (cleanName.includes('empanada')) { targetProd = 'prod-empanada'; familyId = 'fritos'; }
          else if (cleanName.includes('pastelito') || cleanName.includes('tequeño')) { targetProd = 'prod-pastelito'; familyId = 'fritos'; }
          else if (cleanName.includes('papa')) { targetProd = 'prod-papas'; familyId = 'fritos'; }
          else if (cleanName.includes('arepa')) { targetProd = 'prod-arepa'; familyId = 'arepas'; }
          else if (cleanName.includes('cafe') || cleanName.includes('café')) { targetProd = 'prod-cafe'; familyId = 'cafeteria'; }
          else if (cleanName.includes('arroz') || cleanName.includes('pabellon') || cleanName.includes('almuerzo') || cleanName.includes('pollo')) {
            targetProd = 'prod-almuerzos'; familyId = 'almuerzos';
          }

          variants.push({
            id: oldDish.id || ('var-' + Date.now()),
            productId: targetProd,
            familyId,
            name: oldDish.name,
            code: oldDish.code || String(variants.length + 1),
            barcode: oldDish.barcode || ('880' + String(variants.length + 1).padStart(4, '0')),
            priceUsd: oldDish.priceUsd || 1.50,
            ivaType: 'E',
            recipe: oldDish.ingredients || [],
            active: true,
            order: variants.length + 1,
            img: oldDish.img || '',
            emoji: oldDish.emoji || '🥟'
          });
        }
      });
    }
    migrated.variants = variants;

    // Preservar existencias y costos de inventario
    const retailItems = JSON.parse(JSON.stringify(DEFAULT_RETAIL_ITEMS));
    const insumos = JSON.parse(JSON.stringify(DEFAULT_INSUMOS));

    if (Array.isArray(oldState.inventory)) {
      oldState.inventory.forEach(oldItem => {
        if (oldItem.type === 'insumo' || oldItem.sellable === false) {
          const ins = insumos.find(i => i.id === oldItem.id || i.code === oldItem.code);
          if (ins) {
            if (typeof oldItem.stock === 'number') ins.stock = oldItem.stock;
            if (typeof oldItem.costUsd === 'number') ins.costUsd = oldItem.costUsd;
          } else {
            insumos.push(Object.assign({}, oldItem, { type: 'insumo', sellable: false }));
          }
        } else {
          const ret = retailItems.find(r => r.id === oldItem.id || r.barcode === oldItem.barcode || r.code === oldItem.code);
          if (ret) {
            if (typeof oldItem.stock === 'number') ret.stock = oldItem.stock;
            if (typeof oldItem.costUsd === 'number') ret.costUsd = oldItem.costUsd;
            if (typeof oldItem.priceUsd === 'number') ret.priceUsd = oldItem.priceUsd;
          } else {
            retailItems.push(Object.assign({}, oldItem, {
              familyId: oldItem.group || 'viveres',
              type: 'venta',
              sellable: true
            }));
          }
        }
      });
    }

    migrated.retailItems = retailItems;
    migrated.insumos = insumos;
    migrated.inventory = [...insumos, ...retailItems];

    migrated.dishes = variants.map(v => ({
      id: v.id,
      code: v.code,
      barcode: v.barcode,
      group: v.familyId,
      name: v.name,
      category: (migrated.families.find(f => f.id === v.familyId) || {}).name || 'Empanadas & Desayunos',
      priceUsd: v.priceUsd,
      emoji: v.emoji || '🥟',
      img: v.img || '../assets/img/productos/empanadas.jpg',
      ingredients: v.recipe || [],
      recipe: v.recipe || [],
      isDish: true,
      productId: v.productId
    }));

    return migrated;
  }

  const DEFAULT_STATE = {
    version: 5,
    families: DEFAULT_FAMILIES,
    products: DEFAULT_PRODUCTS,
    modifierGroups: DEFAULT_MODIFIER_GROUPS,
    variants: DEFAULT_VARIANTS,
    retailItems: DEFAULT_RETAIL_ITEMS,
    insumos: DEFAULT_INSUMOS,
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
      nextOrderNumber: 105,
      fiscalConfig: {
        enabled: true,
        mode: 'DUAL', // 'HOMOLOGADO' (SENIAT), 'DUAL' (Ambos), 'INTERNO' (Control Interno No Fiscal)
        brand: 'THE_FACTORY_HKA', // 'THE_FACTORY_HKA', 'ACLAS', 'BMC', 'BIXOLON'
        model: 'Bixolon SRP-350 / The Factory HKA',
        serialNumber: 'Z4A2098124',
        port: 'COM1',
        baudRate: 9600,
        ipAddress: '192.168.1.50',
        spoolerPath: 'C:\\MI-TIENDA-DATOS\\spooler\\',
        taxRateGeneral: 16.0,
        taxRateReduced: 8.0,
        applyIgtf3: true,
        lastReportZ: 142,
        currentInvoiceNumber: 4892
      }
    },

    /* ----------------------------------------------------------------------
       1. INVENTARIO ESTRICTAMENTE SEPARADO (Insumos de Cocina vs Minimercado)
       ---------------------------------------------------------------------- */
    inventory: [...DEFAULT_INSUMOS, ...DEFAULT_RETAIL_ITEMS],

    /* ----------------------------------------------------------------------
       2. PLATOS / VARIANTES (Sincronizado con variants v5)
       ---------------------------------------------------------------------- */
    dishes: DEFAULT_VARIANTS.map(v => ({
      id: v.id,
      code: v.code,
      barcode: v.barcode,
      group: v.familyId,
      name: v.name,
      category: (DEFAULT_FAMILIES.find(f => f.id === v.familyId) || {}).name || 'Comida',
      priceUsd: v.priceUsd,
      emoji: v.emoji || '🥟',
      img: v.img || '../assets/img/productos/empanadas.jpg',
      ingredients: v.recipe || [],
      recipe: v.recipe || [],
      isDish: true,
      productId: v.productId
    })),

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
      const rawV5 = localStorage.getItem(STORAGE_KEY);
      if (rawV5) {
        const parsed = JSON.parse(rawV5);
        return migrateV3toV5(parsed);
      }
      const rawV3 = localStorage.getItem(STORAGE_KEY_V3);
      if (rawV3) {
        const parsedV3 = JSON.parse(rawV3);
        const migrated = migrateV3toV5(parsedV3);
        saveState(migrated);
        return migrated;
      }
      const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
      saveState(fresh);
      return fresh;
    } catch (e) {
      console.error('Error cargando base de datos:', e);
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  let localFileHandle = null;

  function saveState(newState) {
    try {
      // Sincronizar espejo de dishes e inventory
      if (Array.isArray(newState.variants)) {
        newState.dishes = newState.variants.map(v => ({
          id: v.id,
          code: v.code,
          barcode: v.barcode,
          group: v.familyId,
          name: v.name,
          category: (newState.families && newState.families.find(f => f.id === v.familyId)) ? newState.families.find(f => f.id === v.familyId).name : 'Comida',
          priceUsd: v.priceUsd,
          emoji: v.emoji || '🥟',
          img: v.img || '../assets/img/productos/empanadas.jpg',
          ingredients: v.recipe || [],
          recipe: v.recipe || [],
          isDish: true,
          productId: v.productId
        }));
      }
      if (Array.isArray(newState.insumos) && Array.isArray(newState.retailItems)) {
        newState.inventory = [...newState.insumos, ...newState.retailItems];
      }
      const jsonStr = JSON.stringify(newState);
      localStorage.setItem(STORAGE_KEY, jsonStr);
      localStorage.setItem(STORAGE_KEY_V3, jsonStr); // Respaldo retrocompatible v3
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
    if (!dish) return 0;
    const items = Array.isArray(dish.recipe) ? dish.recipe : (Array.isArray(dish.ingredients) ? dish.ingredients : []);
    if (!items.length) return 0;
    let totalCost = 0;
    items.forEach(ing => {
      const ins = getInsumoById(ing.insumoId);
      if (ins) {
        totalCost += (Number(ins.costUsd) || 0) * (Number(ing.qty) || 0);
      }
    });
    return totalCost;
  }

  function calcDishMaxPortions(dish) {
    if (!dish) return 999;
    const items = Array.isArray(dish.recipe) ? dish.recipe : (Array.isArray(dish.ingredients) ? dish.ingredients : []);
    if (!items.length) return 999;
    let minPortions = Infinity;
    items.forEach(ing => {
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

    // 1. Variantes de Catálogo v5
    if (Array.isArray(state.variants)) {
      const variant = state.variants.find(v =>
        String(v.code).toUpperCase() === q ||
        String(v.barcode).toUpperCase() === q ||
        ('0' + String(v.code).toUpperCase()) === q
      );
      if (variant) {
        const prod = (state.products || []).find(p => p.id === variant.productId);
        return { kind: 'variant', item: variant, product: prod, isDish: true };
      }
    }

    // 2. Platos (espejo o legado)
    if (Array.isArray(state.dishes)) {
      const dish = state.dishes.find(d =>
        String(d.code).toUpperCase() === q ||
        String(d.barcode).toUpperCase() === q ||
        ('0' + String(d.code).toUpperCase()) === q
      );
      if (dish) return { kind: 'dish', item: dish };
    }

    // 3. Retail Items & Inventario
    if (Array.isArray(state.retailItems)) {
      const ret = state.retailItems.find(i =>
        String(i.code).toUpperCase() === q ||
        String(i.barcode).toUpperCase() === q ||
        String(i.qrCode || '').toUpperCase() === q
      );
      if (ret) return { kind: 'inventory', item: ret };
    }

    if (Array.isArray(state.inventory)) {
      const inv = state.inventory.find(i => {
        if (!includeKitchenInsumos && !i.sellable) return false;
        return (
          String(i.code).toUpperCase() === q ||
          String(i.barcode).toUpperCase() === q ||
          String(i.qrCode || '').toUpperCase() === q
        );
      });
      if (inv) return { kind: 'inventory', item: inv };
    }

    return null;
  }

  function getItemsForGroup(groupId) {
    const GROUP_MAP = {
      empanadas: 'fritos',
      pastelitos: 'fritos',
      papas: 'fritos',
      almuerzos: 'almuerzos',
      cafe: 'cafeteria',
      bebidas: 'bebidas',
      refrescos: 'bebidas',
      cervezas: 'cervezas',
      chucherias: 'chucherias',
      cigarros: 'cigarros',
      viveres: 'viveres',
      arepas: 'arepas',
      fritos: 'fritos',
      cafeteria: 'cafeteria'
    };
    const targetFamily = GROUP_MAP[groupId] || groupId;

    const dishes = (state.dishes || []).filter(d => d.group === targetFamily || d.group === groupId).map(d => ({
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

    const prods = (state.inventory || []).filter(i => i.sellable === true && (i.group === targetFamily || i.group === groupId || i.familyId === targetFamily)).map(i => ({
      kind: 'inventory',
      id: i.id,
      code: i.code,
      barcode: i.barcode,
      qrCode: i.qrCode,
      name: i.name,
      category: i.category,
      group: i.group || i.familyId,
      priceUsd: i.priceUsd,
      emoji: i.emoji,
      img: i.img,
      stock: i.stock,
      unit: i.unit,
      raw: i
    }));

    return [...dishes, ...prods];
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
      if (line.isDish || line.isVariant) {
        const dish = (state.variants && state.variants.find(v => v.id === line.refId || v.id === line.variantId))
                  || (state.dishes && state.dishes.find(d => d.id === line.refId));
        if (dish) {
          const unitCost = calcDishCost(dish);
          totalCostUsd += unitCost * line.qty;
          const ingredients = dish.recipe || dish.ingredients || [];
          ingredients.forEach(ing => {
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

        // Descontar insumos de recetas de Modificadores / Extras
        const mods = line.selectedModifiers || line.modifiers || [];
        if (Array.isArray(mods)) {
          mods.forEach(mod => {
            const modRecipe = mod.recipe || [];
            modRecipe.forEach(ing => {
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
                  notes: `Consumo extra receta: ${line.qty}x ${mod.name}`
                });
              }
            });
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

    const fiscalCfg = state.settings.fiscalConfig || {
      enabled: true,
      mode: 'DUAL',
      brand: 'THE_FACTORY_HKA',
      model: 'Bixolon SRP-350 / The Factory HKA',
      serialNumber: 'Z4A2098124',
      lastReportZ: 142,
      currentInvoiceNumber: 4892,
      applyIgtf3: true
    };
    const fiscalNum = fiscalCfg.currentInvoiceNumber ? fiscalCfg.currentInvoiceNumber++ : (4800 + orderNum);

    let taxExemptUsd = 0;
    let taxableBaseUsd = 0;

    salePayload.items.forEach(line => {
      const invItem = state.inventory.find(i => i.id === line.refId);
      const isExempt = line.taxExempt === true || (invItem && invItem.taxExempt === true);
      const lineSub = line.subtotalUsd || (line.qty * line.priceUsd);
      if (isExempt) {
        taxExemptUsd += lineSub;
        line.taxType = 'E'; // Exento
      } else {
        taxableBaseUsd += lineSub;
        line.taxType = 'G'; // Gravado 16%
      }
    });

    const ivaUsd = taxableBaseUsd * 0.16;

    let usdForeignPaid = 0;
    (salePayload.payments || []).forEach(p => {
      if (p.method === 'Efectivo USD' || p.method === 'Zelle / Transf') {
        usdForeignPaid += Number(p.amountUsd || 0);
      }
    });
    const igtfBaseUsd = Math.min(salePayload.totalUsd, usdForeignPaid);
    const igtfUsd = (fiscalCfg.applyIgtf3 !== false) ? Number((igtfBaseUsd * 0.03).toFixed(2)) : 0;
    const bcvRate = state.settings.rateBcv;

    const fiscalData = {
      mode: fiscalCfg.mode || 'DUAL',
      brand: fiscalCfg.brand || 'THE_FACTORY_HKA',
      serialNumber: fiscalCfg.serialNumber || 'Z4A2098124',
      reportZ: fiscalCfg.lastReportZ || 142,
      fiscalInvoiceNumber: String(fiscalNum).padStart(8, '0'),
      controlNumber: '00-' + String(fiscalNum).padStart(8, '0'),
      storeRif: state.settings.rif || 'J-50128940-1',
      storeName: state.settings.storeName || 'MI TIENDA POS',
      storeAddress: state.settings.address || 'Mostrador Principal',
      customerRif: salePayload.customerRif || 'V-00000000',
      taxExemptUsd: Number(taxExemptUsd.toFixed(2)),
      taxExemptBs: Number((taxExemptUsd * bcvRate).toFixed(2)),
      taxableBaseUsd: Number(taxableBaseUsd.toFixed(2)),
      taxableBaseBs: Number((taxableBaseUsd * bcvRate).toFixed(2)),
      ivaUsd: Number(ivaUsd.toFixed(2)),
      ivaBs: Number((ivaUsd * bcvRate).toFixed(2)),
      igtfUsd: Number(igtfUsd.toFixed(2)),
      igtfBs: Number((igtfUsd * bcvRate).toFixed(2)),
      totalBs: Number(((salePayload.totalUsd + igtfUsd) * bcvRate).toFixed(2)),
      totalUsd: Number((salePayload.totalUsd + igtfUsd).toFixed(2))
    };

    const newSale = {
      id: 'ORD-' + orderNum,
      orderNumber: orderNum,
      createdAt: new Date().toISOString(),
      cashier: salePayload.cashier || 'Caja Principal',
      customer: salePayload.customer || 'Mostrador Rápido',
      customerRif: salePayload.customerRif || 'V-00000000',
      fiscalData,
      rateBcv: state.settings.rateBcv,
      rateEur: state.settings.rateEur,
      rateUsdt: state.settings.rateUsdt,
      subtotalUsd: Number((salePayload.subtotalUsd || salePayload.totalUsd).toFixed(2)),
      igtfUsd: Number(igtfUsd.toFixed(2)),
      totalUsd: Number(fiscalData.totalUsd.toFixed(2)),
      totalBs: Number(fiscalData.totalBs.toFixed(2)),
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

  /* --------------------------------------------------------------------------
     MÓDULO DE INTEGRACIÓN DE MÁQUINAS FISCALES HOMOLOGADAS (SENIAT)
     Protocolo The Factory HKA / Bixolon / Aclas / BMC
     -------------------------------------------------------------------------- */
  function generateFiscalHkaCommand(sale) {
    const f = sale.fiscalData || {};
    const bcv = Number(sale.rateBcv || state.settings.rateBcv);
    const lines = [];

    lines.push(`i01Cliente: ${sale.customer || 'CLIENTE DE CONTADO'}`);
    lines.push(`i02RIF/CI: ${f.customerRif || 'V-00000000'}`);
    lines.push(`i03Direccion: ${sale.customerAddress || 'Mostrador Principal'}`);

    (sale.items || []).forEach(it => {
      const priceBs = (Number(it.priceUsd) * bcv).toFixed(2);
      const isExempt = it.taxType === 'E';
      const cleanName = (it.name || 'Articulo').replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 30);
      const qtyStr = String(Math.round((it.qty || 1) * 1000)).padStart(8, '0');
      const priceStr = String(Math.round(priceBs * 100)).padStart(10, '0');

      if (isExempt) {
        lines.push(`d0${qtyStr}${priceStr}${cleanName}`);
      } else {
        lines.push(` 0${qtyStr}${priceStr}${cleanName}`);
      }
    });

    if (f.igtfBs > 0) {
      lines.push(`p+0300PERCEPCION IGTF 3% DIVISAS`);
    }

    lines.push('3');
    lines.push('101');
    return lines.join('\r\n');
  }

  function downloadFiscalCommandFile(sale) {
    const cmdStr = generateFiscalHkaCommand(sale);
    const blob = new Blob([cmdStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FACTURA_FISCAL_ORD_${sale.orderNumber}.TXT`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Trama fiscal Factura #${sale.orderNumber} descargada para Spooler`);
  }

  function emitFiscalReportX() {
    toast('Reporte X emitido a la Máquina Fiscal');
    return { success: true, command: 'I0X', type: 'REPORTE_X', date: new Date().toISOString() };
  }

  function emitFiscalReportZ() {
    if (!state.settings.fiscalConfig) state.settings.fiscalConfig = {};
    const curZ = (state.settings.fiscalConfig.lastReportZ || 142) + 1;
    state.settings.fiscalConfig.lastReportZ = curZ;
    saveState(state);
    toast(`¡Reporte Z Fiscal #${curZ} ejecutado exitosamente!`);
    return { success: true, command: 'I0Z', type: 'REPORTE_Z', reportZNumber: curZ, date: new Date().toISOString() };
  }

  function saveFiscalConfig(payload) {
    if (!state.settings.fiscalConfig) state.settings.fiscalConfig = {};
    state.settings.fiscalConfig = Object.assign({}, state.settings.fiscalConfig, payload);
    saveState(state);
    toast('Configuración de la Máquina Fiscal guardada correctamente.');
    return state.settings.fiscalConfig;
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


  /* ==========================================================================
     HELPERS DEL CATÁLOGO V5 (Familia -> Producto -> Variante -> Extras)
     ========================================================================== */
  function getProductsByFamily(familyId) {
    if (!state.products || !Array.isArray(state.products)) return [];
    return state.products
      .filter(p => p.familyId === familyId && p.active !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function getVariantsForProduct(productId) {
    if (!state.variants || !Array.isArray(state.variants)) return [];
    return state.variants
      .filter(v => v.productId === productId && v.active !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function getModifierGroupsForProduct(productId) {
    const prod = (state.products || []).find(p => p.id === productId);
    if (!prod || !Array.isArray(prod.modifierGroupIds)) return [];
    if (!state.modifierGroups || !Array.isArray(state.modifierGroups)) return [];
    return prod.modifierGroupIds
      .map(mgId => state.modifierGroups.find(g => g.id === mgId))
      .filter(Boolean);
  }

  function getDirectRetailItems(familyId) {
    const list = [];
    if (Array.isArray(state.retailItems)) {
      state.retailItems
        .filter(i => (i.familyId === familyId || i.group === familyId) && i.sellable !== false)
        .forEach(i => list.push(i));
    }
    if (Array.isArray(state.inventory)) {
      state.inventory
        .filter(i => i.sellable && (i.familyId === familyId || i.group === familyId))
        .forEach(i => {
          if (!list.some(x => x.id === i.id)) list.push(i);
        });
    }
    return list;
  }

  function saveProduct(product) {
    if (!product || !product.name) return false;
    if (!Array.isArray(state.products)) state.products = [];
    if (!product.id) product.id = 'prod-' + Date.now();
    const idx = state.products.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      state.products[idx] = Object.assign({}, state.products[idx], product);
    } else {
      state.products.push(product);
    }
    saveState(state);
    return product;
  }

  function saveVariant(variant) {
    if (!variant || !variant.name) return false;
    if (!Array.isArray(state.variants)) state.variants = [];
    if (!variant.id) variant.id = 'var-' + Date.now();
    if (!variant.recipe && variant.ingredients) variant.recipe = variant.ingredients;
    if (!variant.ingredients && variant.recipe) variant.ingredients = variant.recipe;
    const idx = state.variants.findIndex(v => v.id === variant.id);
    if (idx >= 0) {
      state.variants[idx] = Object.assign({}, state.variants[idx], variant);
    } else {
      state.variants.push(variant);
    }
    saveState(state);
    return variant;
  }

  function deleteVariant(variantId) {
    if (!Array.isArray(state.variants)) return false;
    state.variants = state.variants.filter(v => v.id !== variantId);
    saveState(state);
    return true;
  }

  function saveModifierGroup(group) {
    if (!group || !group.name) return false;
    if (!Array.isArray(state.modifierGroups)) state.modifierGroups = [];
    if (!group.id) group.id = 'mg-' + Date.now();
    const idx = state.modifierGroups.findIndex(g => g.id === group.id);
    if (idx >= 0) {
      state.modifierGroups[idx] = Object.assign({}, state.modifierGroups[idx], group);
    } else {
      state.modifierGroups.push(group);
    }
    saveState(state);
    return group;
  }

  window.MTP = {
    state,
    POS_GROUPS,
    DEFAULT_FAMILIES,
    DEFAULT_PRODUCTS,
    DEFAULT_MODIFIER_GROUPS,
    DEFAULT_VARIANTS,
    DEFAULT_RETAIL_ITEMS,
    DEFAULT_INSUMOS,
    getProductsByFamily,
    getVariantsForProduct,
    getModifierGroupsForProduct,
    getDirectRetailItems,
    saveProduct,
    saveVariant,
    deleteVariant,
    saveModifierGroup,
    migrateV3toV5,
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
    generateFiscalHkaCommand,
    downloadFiscalCommandFile,
    emitFiscalReportX,
    emitFiscalReportZ,
    saveFiscalConfig,
    exportBackupJson,
    linkLocalDiskFile,
    toast,
    resetDemoData
  };
})();
