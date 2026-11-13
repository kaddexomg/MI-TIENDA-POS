/* ==========================================================================
   MI-TIENDA-POS — view-transitions.js
   Motor de Transición Fluida entre Vistas y Secciones (Apple Motion / Emil Kowalski)
   - Transiciones suaves entre Pantalla de Caja (POS), Dashboard (Mi Día),
     Inventario, Cierres y demás módulos del sistema
   - Elimina el parpadeo blanco y saltos bruscos entre páginas
   - Usa View Transitions API nativa si existe; fallback acelerado por hardware GPU
   - Respeta estrictamente prefers-reduced-motion
   ========================================================================== */
(function () {
  'use strict';

  const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navigating = false;

  /** Navegación ligera <=140ms (solo opacidad) con limpieza limpia para botón Atrás */
  function navigateTo(url) {
    if (!url || url === '#' || url.startsWith('javascript:') || navigating) return;
    navigating = true;
    if (REDUCED_MOTION) {
      window.location.href = url;
      return;
    }
    const target = document.querySelector('.admin-main') || document.body;
    target.classList.add('mtp-page-exiting');
    window.setTimeout(function () {
      window.location.href = url;
    }, 90);
  }

  /** Intercepta clics en enlaces internos para aplicar la transición */
  function setupLinkInterception() {
    document.addEventListener('click', function (e) {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.dataset.noTransition !== undefined) return;

      const isInternal = !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//');
      if (!isInternal) return;

      e.preventDefault();
      navigateTo(href);
    }, true);
  }

  /** Aplica animación de entrada (fade/slide 140ms max) al cargar la página */
  function setupPageEntrance() {
    navigating = false;
    const target = document.querySelector('.admin-main') || document.body;
    target.classList.remove('mtp-page-exiting');
    if (REDUCED_MOTION) return;

    target.classList.add('mtp-page-entering');
    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      target.classList.remove('mtp-page-entering');
    }
    if (typeof target.addEventListener === 'function') {
      target.addEventListener('animationend', cleanup, { once: true });
    }
    if (typeof window.setTimeout === 'function') {
      window.setTimeout(cleanup, 160);
    } else if (typeof setTimeout === 'function') {
      setTimeout(cleanup, 160);
    }
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', setupPageEntrance);
  }

  // Inicializar al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setupLinkInterception();
      setupPageEntrance();
    });
  } else {
    setupLinkInterception();
    setupPageEntrance();
  }

  window.MTPNavigate = navigateTo;
})();
