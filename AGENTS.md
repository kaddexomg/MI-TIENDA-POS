# AGENTS.md — Contexto Maestro, Indexación Completa y Bitácora de MI-TIENDA-POS

> **Actualizado**: 1 de Noviembre de 2026 (`20:55 VET`) — **Versión 6 (Estabilización Integral v6)**
> **Cerebro del Proyecto**: Ver también [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md) y [PLAN_ESTABILIZACION_V6.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PLAN_ESTABILIZACION_V6.md)
> **Propósito**: Define las reglas de negocio gastronómicas y comerciales venezolanas, la indexación total del proyecto, la separación estricta de inventario (Ingredientes de Cocina vs. Mercancía de Venta Directa), la facturación con IVA 16% Venezolano e IGTF 3%, el menú simplificado de 5 opciones para el dueño, las 47 fotografías reales verificadas 100% offline y la suite de pruebas automatizadas.

---

## 1. Reglas de Negocio Inviolables: Cocina vs. Minimercado / Venta Directa

1. **Separación Estricta de Inventario (`Cocina` vs. `Minimercado`)**:
   - **Ingredientes Exclusivos de Cocina (`type: 'insumo'`, `sellable: false`)**:
     - Las **papas crudas, los aliños (cebolla, ajo, pimentón, cilantro, cebollín, ají dulce), carnes crudas para guisar/mechar/moler, pollo crudo para freír/guisar, harina de amasar en cocina, arroz de olla, queso/jamón de rellenar, cazón, chicharrón, aceite de freír y envases** **NO SE VENDEN SUELTOS AL PÚBLICO** en la pantalla de Caja.
     - Están obligatoriamente en el inventario de cocina (`kg`, `L`, `und`) porque de allí se descuentan los gramos exactos cuando se elaboran y venden los platos de comida.
   - **Productos de Venta Directa / Minimercado (`type: 'venta'`, `sellable: true`)**:
     - **Víveres Empaquetados (Posición #4 en Caja)**: Harina P.A.N. (Blanca / Amarilla 1Kg), Espagueti / Pasta Larga, Arroz Blanco Primor 1Kg, Margarina Mavesa 500g.
     - **Chucherías y Snacks**: Pepito Frito-Lay, Cheetos, Cheese Tris / Chiskesitos, Doritos, Galletas Samba / Savoy.
     - **Cigarros**: Cajetillas de 20 cigarros (Belmont, Consul) y cigarros detallados por unidad.
     - **Bebidas, Refrescos y Cervezas**: Frescolita, Coca-Cola, Malta Polar (personal 250ml y familiar 1.5L), Agua Mineral Nevada y **Cervezas** (Polar Pilsen, Zulia, Solera Verde, Six-Pack).
     - Se cargan al inventario y se venden mediante **Lector de Código de Barras USB, Cámara Web en Vivo o Código Corto**.
     - Se gestionan con calculadora de compra por **Bulto / Caja / Cartón** a unidades con cálculo automático de margen comercial en USD y Bs.

2. **Orden Oficial de las 9 Familias en Caja (Víveres en Posición #4)**:
   - `[1]` **Empanadas y Fritos** (`fritos`)
   - `[2]` **Arepas Venezolanas** (`arepas`)
   - `[3]` **Almuerzos y Platos** (`almuerzos`)
   - `[4]` **Víveres** (`viveres`) — *Ubicado inmediatamente después de la comida preparada como pilar del negocio*
   - `[5]` **Refrescos y Maltas** (`bebidas`)
   - `[6]` **Cafetería** (`cafeteria`)
   - `[7]` **Chucherías** (`chucherias`)
   - `[8]` **Cervezas** (`cervezas`)
   - `[9]` **Cigarros** (`cigarros`)

---

## 2. Motor Fiscal Venezolano (`assets/js/tax.js`): IVA 16%, Exentos e IGTF 3%

- **Cálculo en Centavos Enteros (`window.MTPTax`)**:
  - **Alícuota General (`G16` = 16%)**: Aplica a toda la comida preparada (empanadas, pastelitos, tequeños, papas rellenas, arepas, almuerzos, café) y a refrescos, maltas, cervezas, chucherías, cigarros y agua mineral embotellada (`pendingAccountantConfirmation: true`).
  - **Exentos (`E` = 0%, Art. 18 Ley de IVA)**: Víveres básicos de la cesta venezolana (`Harina P.A.N. Blanca`, `Harina P.A.N. Amarilla`, `Espagueti / Pasta`, `Arroz Blanco`, `Margarina Mavesa`).
  - **Modos de IVA (`ivaMode`)**:
    - `RECARGO` *(por defecto)*: El precio base del producto se suma al subtotal y se recarga `+16%` de IVA sobre la base gravada en el ticket, modal de cobro, calculadora de vuelto y recibo impreso.
    - `INCLUIDO`: Desglosa internamente la base imponible (`precio / 1.16`) y el IVA sin alterar el PVP final.
  - **IGTF 3% (`isContribuyenteEspecial`)**: Desactivado por defecto (`false`). Solo se cobra sobre pagos netos en divisas (`Efectivo USD` neto de vuelto en USD + `Zelle`) cuando el comercio está designado como Sujeto Pasivo Especial SENIAT.
  - **Sinceridad Fiscal**: Por defecto opera en modo `INTERNO` (*Nota de Despacho / Control Interno — SIN DERECHO A CRÉDITO FISCAL*). El modo de Máquina Fiscal Homologada (`FACTURA.TXT` para The Factory HKA / Bixolon / Aclas) solo se activa cuando existe un serial real configurado por el dueño (sin seriales ficticios quemados en código).

---

## 3. Sincronización Diaria de Tasas (BCV USD, Euro BCV y USDT Binance)

- **Conexión a API Diaria en Vivo (`assets/js/rates.js`)**:
  - Sincroniza automáticamente:
    1. 🏦 **Tasa Oficial BCV USD (Bs/$)**
    2. 💶 **Tasa Oficial BCV EURO (Bs/€)**
    3. 🟡 **Tasa USDT Binance P2P (Bs/$)**
- **Diferencia entre Tasas y Precio Sugerido**:
  - Calcula en tiempo real la diferencia porcentual entre **BCV USD ↔ Paralelo (USDT)** y **BCV USD ↔ Euro BCV** para sugerir precios que protejan la reposición de mercancía.

---

## 4. Índice Completo del Proyecto (`C:\Users\PC\Desktop\MI-TIENDA-POS`)

- **Raíz**:
  - [index.html](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/index.html) — Acceso por PIN (`Administrador` / `Encargado` / `Cajero`).
  - [AGENTS.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/AGENTS.md), [PROJECT_BRAIN.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PROJECT_BRAIN.md) y [PLAN_ESTABILIZACION_V6.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/PLAN_ESTABILIZACION_V6.md).
  - [INICIAR-POS.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-POS.bat), [INICIAR-ADMIN.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INICIAR-ADMIN.bat) e [INSTALADOR-WINDOWS-7.bat](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/INSTALADOR-WINDOWS-7.bat).
- **Estilos (`assets/css/`)**:
  - [assets/css/variables.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/variables.css) — Tokens de diseño y tipografía base `15px` legible para adulto mayor.
  - [assets/css/components.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/components.css) — Componentes UI reutilizables con botones de `34px` y celdas claras.
  - [assets/css/layout.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/layout.css) — Barra lateral de `218px` con las 5 opciones principales del dueño.
  - [assets/css/pos.css](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/css/pos.css) — Pantalla de Caja (`Zero-Scroll 100vh`), miniaturas reales `48x48px` (`.pos-card-thumb`) y pills `+IVA` / `Exento`.
- **Lógica JS (`assets/js/`)**:
  - [assets/js/tax.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/tax.js) — Motor puro de cálculo de IVA 16%, Exentos e IGTF 3% en centavos enteros.
  - [assets/js/config.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/config.js) — Estado central v6 (`mtp_store_v3`), migración automática `migrateToV6()`, catálogo con 47 imágenes reales locales, inventario separado (`insumo` vs `venta`), compras de cocina (`recordKitchenPurchase`) y detector de Pago Móvil usado.
  - [assets/js/rates.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/rates.js) — Motor multimoneda BCV USD / Euro / USDT Binance.
  - [assets/js/pos-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/pos-engine.js) — Motor de Caja con desglose de IVA en tiempo real, miniaturas de productos reales, Pago Móvil multicuenta y vueltos mixtos.
  - [assets/js/barcode-engine.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/barcode-engine.js) — Escáner por pistola USB y cámara web.
  - [assets/js/sidenav.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/sidenav.js) — Menú simplificado de 5 opciones principales + desplegable `"⚙️ Más opciones"`.
  - [assets/js/icons.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/icons.js) — Librería de iconos vectoriales SVG 100% offline.
- **Imágenes Reales (`assets/img/productos/`)**:
  - 47 fotografías reales optimizadas (`240x240` JPG `<25 KB`) y atribuidas en [assets/img/productos/CREDITOS.md](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/img/productos/CREDITOS.md).
- **Suite de Pruebas (`tests/`)**:
  - [tests/tax.test.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/tax.test.js) y [tests/run.js](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/tests/run.js).

---

## 5. ✅ BITÁCORA DE LO REALIZADO

1. **Estabilización V6 Completa (`PLAN_ESTABILIZACION_V6.md`)**:
   - **Fase 1 (IVA 16% + IGTF 3%)**: Motor fiscal exacto en centavos ([`assets/js/tax.js`](file:///C:/Users/PC/Desktop/MI-TIENDA-POS/assets/js/tax.js)) integrado en carrito, modal de cobro, calculadora de vuelto, registro de venta y recibo impreso.
   - **Fase 2 (Orden de Familias)**: **Víveres** promovido a la posición **#4 (`[4]`)** inmediatamente después de los almuerzos.
   - **Fase 3 (Lenguaje Simple para Dueño Mayor)**: Sustitución de jerga técnica (*Kardex, Merma, Conteo Ciego, Escandallo, RBAC*) por español cotidiano claro en todas las pantallas administrativas.
   - **Fase 4 (Menú Simplificado de 5 Opciones y Tipografía 15px)**: Barra lateral limpia con 5 opciones principales (*Vender, Lo que hay en la tienda, Compras y gastos, Cuadre del día, Precios y tasa del dólar*) y sección colapsable *Más opciones*.
   - **Fase 5 (47 Fotografías Reales Verificadas 100% Offline)**: Imágenes auténticas de cada variedad de empanada, arepa, pabellón, arroz chino, pollo broaster, tequeños, pastelitos, Harina P.A.N. blanca/amarilla, Arroz Primor, Mavesa, Frescolita, Malta Polar, Polar Pilsen, Zulia, Solera Verde, Pepito, Cheetos, Cheese Tris, Doritos y Samba.
   - **Fase 6 (Suite de Pruebas Automatizadas `tests/run.js`)**: Verificación automatizada de cálculos de IVA/IGTF, ventas mixtas, descuento de recetas, compras de cocina, detector anti-fraude de Pago Móvil y migración `v5 -> v6`.
