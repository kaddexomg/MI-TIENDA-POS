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

  /** Navegación fluida hacia una URL con animación de salida */
  function navigateTo(url) {
    if (!url || url === '#' || url.startsWith('javascript:')) return;

    if (REDUCED_MOTION) {
      window.location.href = url;
      return;
    }

    // Si el navegador soporta View Transitions API de manera nativa:
    if (document.startViewTransition) {
      try {
        document.startViewTransition(() => {
          window.location.href = url;
        });
        return;
      } catch (_) {}
    }

    // Fallback: salida animada rápida (160ms) acelerada por GPU
    const mainWrap = document.querySelector('.admin-main') || document.body;
    mainWrap.classList.add('mtp-page-exiting');

    setTimeout(() => {
      window.location.href = url;
    }, 160);
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

      // No interceptar si el link tiene data-no-transition o es modal
      if (link.dataset.noTransition !== undefined) return;

      // Verificar si es enlace interno relativo (ej: index.html, pos.html, ../admin/...)
      const isInternal = !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//');
      if (!isInternal) return;

      e.preventDefault();
      navigateTo(href);
    }, true);
  }

  /** Aplica animación de entrada al cargar la página */
  function setupPageEntrance() {
    if (REDUCED_MOTION) return;
    const mainWrap = document.querySelector('.admin-main') || document.body;
    mainWrap.classList.add('mtp-page-entering');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mainWrap.classList.remove('mtp-page-entering');
      });
    });
  }

  // Inicializar al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupLinkInterception();
      setupPageEntrance();
    });
  } else {
    setupLinkInterception();
    setupPageEntrance();
  }

  window.MTPNavigate = navigateTo;
})();
