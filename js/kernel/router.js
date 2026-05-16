// ============================================================
// Freedom OS — Router
// File: js/kernel/router.js
// Depends: utils.js, events.js, core.js
// Provides: navigate, currentRoute, currentParams, viewMap, router.init
// Last Updated: 2026-04-29
// ============================================================
//
// CONNECTION CONTRACT:
// - Maps routes to modules via viewMap
// - Calls module render(), onMount(), onUnmount() lifecycle methods
// - Emits 'view:enter' and 'view:leave' events
//
// DO NOT MODIFY:
// - Route names
// - Lifecycle order
// ============================================================

(function() {
  'use strict';

  if (typeof FreedomOS === 'undefined' || !FreedomOS.emit || !FreedomOS.mutate) {
    throw new Error('FreedomOS.router requires utils.js, events.js, and core.js to be loaded first.');
  }

  /** @private @type {string} */
  var _currentRoute = '';
  /** @private @type {Object} */
  var _currentParams = {};
  /** @private @type {HTMLElement|null} */
  var _contentArea = null;
  /** @private @type {Object.<string, boolean>} */
  var _initializedModules = {};

  /**
   * Initializes DOM references.
   * @private
   */
  function _initRefs() {
    _contentArea = document.getElementById('content');
  }

  /**
   * Gets the default route.
   * @private
   * @returns {string}
   */
  function _getDefaultRoute() {
    return 'dashboard';
  }

  /**
   * Renders a view for the given route.
   * @private
   * @param {string} route - Route name
   * @param {Object} params - Route parameters
   */
  function _renderView(route, params) {
    if (!_contentArea) _initRefs();
    if (!_contentArea) return;

    var moduleName = FreedomOS.viewMap[route];
    if (!moduleName) {
      if (FreedomOS.DEBUG) {
        console.warn('FreedomOS: Unknown route "' + route + '". Redirecting to dashboard.');
      }
      FreedomOS.navigate(_getDefaultRoute());
      return;
    }

    var module = FreedomOS.getModule(moduleName);
    if (!module) {
      if (FreedomOS.DEBUG) {
        console.warn('FreedomOS: Module "' + moduleName + '" not found for route "' + route + '".');
      }
      _contentArea.innerHTML = '<div class="empty-state"><p>View not found.</p></div>';
      return;
    }

    // Leave current view
    if (_currentRoute) {
      FreedomOS.emit('view:leave', { route: _currentRoute, params: _currentParams });
      var prevModuleName = FreedomOS.viewMap[_currentRoute];
      if (prevModuleName) {
        var prevModule = FreedomOS.getModule(prevModuleName);
        if (prevModule && typeof prevModule.onUnmount === 'function') {
          prevModule.onUnmount(_contentArea);
        }
      }
      // Clear DOM only after onUnmount completes
      _contentArea.innerHTML = '';
    }

    _currentRoute = route;
    _currentParams = params || {};

    // Initialize module on first use
    if (typeof module.init === 'function' && !_initializedModules[moduleName]) {
      module.init();
      _initializedModules[moduleName] = true;
    }

    // Render new view
    var html = '';
    if (typeof module.render === 'function') {
      html = module.render(_currentParams);
    }
    _contentArea.innerHTML = html;

    // Mount new view
    if (typeof module.onMount === 'function') {
      module.onMount(_contentArea);
    }
    FreedomOS.emit('view:enter', { route: route, params: _currentParams });

    // Update public references
    FreedomOS.currentRoute = _currentRoute;
    FreedomOS.currentParams = _currentParams;
  }

  /**
   * Navigates to a route.
   * @param {string} route - Route name
   * @param {Object} [params] - Optional route parameters
   */
  FreedomOS.navigate = function(route, params) {
    if (typeof route !== 'string') return;
    _renderView(route, params);
  };

  /**
   * Initializes the router.
   */
  FreedomOS.router = {
    init: function() {
      FreedomOS.currentRoute = '';
      FreedomOS.currentParams = {};
    }
  };

})();