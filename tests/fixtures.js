/* ==========================================================================
   MI-TIENDA-POS — tests/fixtures.js
   Carritos de prueba canónicos y reutilizables para pruebas automatizadas.
   ========================================================================== */
'use strict';

const CARRT_2_EMPANADAS = [
  { refId: 'prod-empanada', name: 'Empanada Mechada', qty: 2, priceUsd: 1.30, isDish: true }
];

const CART_MIXTO = [
  { refId: 'prod-empanada', name: 'Empanada Mechada', qty: 2, priceUsd: 1.30, isDish: true },
  { refId: 'prod-malta-polar', name: 'Malta Polar', qty: 1, priceUsd: 0.80, type: 'venta' },
  { refId: 'prod-harina-pan', name: 'Harina P.A.N.', qty: 1, priceUsd: 1.20, type: 'venta' }
];

module.exports = {
  CARRT_2_EMPANADAS: CARRT_2_EMPANADAS,
  CART_2_EMPANADAS: CARRT_2_EMPANADAS,
  CART_MIXTO: CART_MIXTO,
  CARRITO_MIXTO: CART_MIXTO
};
