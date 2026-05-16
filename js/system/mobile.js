// ============================================================
// Freedom OS — Mobile System
// File: js/system/mobile.js
// Depends: js/kernel/core.js, js/kernel/events.js, js/kernel/ui.js
// Provides: Mobile gestures, bottom nav, sidebar drawer,
//           PWA service worker, offline detection,
//           bottom sheet modals, haptic feedback,
//           touch optimizations, save indicator
// Last Updated: 2026-05-09
// ============================================================

(function() {
  'use strict';

  if (typeof FreedomOS === 'undefined') {
    throw new Error('FreedomOS.mobile requires the kernel to be loaded first.');
  }

  var MODULE_NAME = 'mobile';

  var SWIPE_THRESHOLD = 80;
  var SWIPE_EDGE_ZONE = 30;
  var DEBOUNCE_INPUT = 300;
  var THROTTLE_SCROLL = 100;
  var SAVE_INDICATOR_DURATION = 2000;

  var _touchStartX = 0;
  var _touchStartY = 0;
  var _touchEndX = 0;
  var _touchEndY = 0;
  var _isSwiping = false;
  var _sidebarOpen = false;
  var _saveTimeout = null;
  var _listeners = [];
  var _bottomSheetOpen = false;
  var _isMobile = false;

  var _sidebar = null;
  var _sidebarOverlay = null;
  var _sidebarClose = null;
  var _menuToggle = null;
  var _mobileNav = null;
  var _mobileHeader = null;
  var _offlineIndicator = null;
  var _saveIndicator = null;
  var _bottomSheetOverlay = null;
  var _bottomSheet = null;
  var _bottomSheetContent = null;
  var _bottomSheetBackdrop = null;

  function _initRefs() {
    _sidebar = document.getElementById('sidebar');
    _sidebarOverlay = document.getElementById('sidebar-overlay');
    _sidebarClose = document.getElementById('sidebar-close');
    _menuToggle = document.getElementById('mobile-menu-toggle');
    _mobileNav = document.getElementById('mobile-nav');
    _mobileHeader = document.getElementById('mobile-header');
    _offlineIndicator = document.getElementById('offline-indicator');
    _saveIndicator = document.getElementById('save-indicator');
    _bottomSheetOverlay = document.getElementById('bottom-sheet-overlay');
    _bottomSheet = document.getElementById('bottom-sheet');
    _bottomSheetContent = document.getElementById('bottom-sheet-content');
    _bottomSheetBackdrop = document.querySelector('.bottom-sheet-backdrop');
  }

  function _checkMobile() {
    _isMobile = window.innerWidth <= 768;
    return _isMobile;
  }

  function _openSidebar() {
    if (!_sidebar) return;
    _sidebar.classList.add('open');
    if (_sidebarOverlay) _sidebarOverlay.classList.add('active');
    document.body.classList.add('sidebar-open');
    _sidebarOpen = true;
    FreedomOS.emit('mobile:sidebar:open');
  }

  function _closeSidebar() {
    if (!_sidebar) return;
    _sidebar.classList.remove('open');
    if (_sidebarOverlay) _sidebarOverlay.classList.remove('active');
    document.body.classList.remove('sidebar-open');
    _sidebarOpen = false;
    FreedomOS.emit('mobile:sidebar:close');
  }

  function _toggleSidebar() {
    if (_sidebarOpen) _closeSidebar(); else _openSidebar();
  }

  function _onTouchStart(e) {
    if (!_isMobile) return;
    _touchStartX = e.changedTouches[0].screenX;
    _touchStartY = e.changedTouches[0].screenY;
    _isSwiping = false;
  }

  function _onTouchMove(e) {
    if (!_isMobile) return;
    var currentX = e.changedTouches[0].screenX;
    var currentY = e.changedTouches[0].screenY;
    var diffX = Math.abs(currentX - _touchStartX);
    var diffY = Math.abs(currentY - _touchStartY);
    if (diffX > diffY && diffX > 10) _isSwiping = true;
  }

  function _onTouchEnd(e) {
    if (!_isMobile || !_isSwiping) return;
    _touchEndX = e.changedTouches[0].screenX;
    _touchEndY = e.changedTouches[0].screenY;
    var diffX = _touchEndX - _touchStartX;
    var diffY = Math.abs(_touchEndY - _touchStartY);
    if (diffY > Math.abs(diffX)) return;
    if (diffX > SWIPE_THRESHOLD && _touchStartX < SWIPE_EDGE_ZONE && !_sidebarOpen) _openSidebar();
    if (diffX < -SWIPE_THRESHOLD && _sidebarOpen) _closeSidebar();
    _isSwiping = false;
  }

  function _updateBottomNav(route) {
    if (!_mobileNav) return;
    var items = _mobileNav.querySelectorAll('.mobile-nav-item');
    items.forEach(function(item) {
      item.classList.toggle('active', item.dataset.route === route);
    });
  }

  function _onNavClick(e) {
    var item = e.currentTarget;
    var route = item.dataset.route;
    if (!route) return;
    item.style.transform = 'scale(0.9)';
    setTimeout(function() { item.style.transform = ''; }, 100);
    if (route === 'capture') {
      FreedomOS.emit('capture:open');
      return;
    }
    if (typeof FreedomOS.navigate === 'function') FreedomOS.navigate(route);
  }

  FreedomOS.openBottomSheet = function(html, options) {
    options = options || {};
    if (!_bottomSheetOverlay || !_bottomSheetContent) return;
    _bottomSheetContent.innerHTML = html;
    _bottomSheetOverlay.classList.remove('hidden');
    void _bottomSheetOverlay.offsetWidth;
    _bottomSheetOverlay.classList.add('active');
    _bottomSheetOpen = true;
    document.body.style.overflow = 'hidden';
    FreedomOS.emit('mobile:bottomsheet:open');
    _bottomSheetOverlay._onCloseCallback = options.onClose;
  };

  FreedomOS.closeBottomSheet = function() {
    if (!_bottomSheetOverlay) return;
    _bottomSheetOverlay.classList.remove('active');
    _bottomSheetOpen = false;
    document.body.style.overflow = '';
    setTimeout(function() {
      _bottomSheetOverlay.classList.add('hidden');
      if (_bottomSheetContent) _bottomSheetContent.innerHTML = '';
      FreedomOS.emit('mobile:bottomsheet:close');
      if (typeof _bottomSheetOverlay._onCloseCallback === 'function') {
        _bottomSheetOverlay._onCloseCallback();
        _bottomSheetOverlay._onCloseCallback = null;
      }
    }, 300);
  };

  function _onBottomSheetBackdrop(e) {
    if (e.target === _bottomSheetBackdrop || e.target === _bottomSheetOverlay) {
      FreedomOS.closeBottomSheet();
    }
  }

  function _onBottomSheetTouch(e) {
    if (e.type === 'touchstart') {
      _bottomSheet._startY = e.touches[0].clientY;
      _bottomSheet._startScroll = _bottomSheet.scrollTop;
    } else if (e.type === 'touchmove') {
      var currentY = e.touches[0].clientY;
      var diff = currentY - _bottomSheet._startY;
      if (_bottomSheet._startScroll === 0 && diff > 60) {
        _bottomSheet.style.transform = 'translateY(' + (diff * 0.5) + 'px)';
        _bottomSheet.style.transition = 'none';
      }
    } else if (e.type === 'touchend') {
      var endY = e.changedTouches[0].clientY;
      var diff = endY - _bottomSheet._startY;
      _bottomSheet.style.transition = '';
      _bottomSheet.style.transform = '';
      if (_bottomSheet._startScroll === 0 && diff > 120) FreedomOS.closeBottomSheet();
    }
  }

  function _setOffline(isOffline) {
    if (!_offlineIndicator) return;
    if (isOffline) {
      _offlineIndicator.classList.remove('hidden');
      FreedomOS.toast('You are offline. Changes saved locally.', 'warning', 4000);
    } else {
      _offlineIndicator.classList.add('hidden');
      FreedomOS.toast('Back online.', 'success', 2000);
    }
  }

  function _showSaveIndicator() {
    if (!_saveIndicator) return;
    _saveIndicator.classList.remove('hidden');
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(function() {
      _saveIndicator.classList.add('hidden');
    }, SAVE_INDICATOR_DURATION);
  }

  function _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var swCode = [
      "var CACHE_NAME = 'freedomos-v1';",
      "var urlsToCache = [",
      "  '/', '/index.html',",
      "  '/css/base.css', '/css/layout.css', '/css/components.css', '/css/views.css', '/css/charts.css', '/css/mobile.css',",
      "  '/js/kernel/utils.js', '/js/kernel/events.js', '/js/kernel/ui.js', '/js/kernel/core.js', '/js/kernel/router.js', '/js/kernel/timer.js',",
      "  '/js/modules/dashboard.js', '/js/modules/projects.js', '/js/modules/warRoom.js', '/js/modules/creatorStudio.js',",
      "  '/js/modules/stageMode.js', '/js/modules/finance.js', '/js/modules/people.js', '/js/modules/wins.js',",
      "  '/js/modules/letters.js', '/js/modules/reviews.js', '/js/modules/roadmap.js', '/js/modules/stats.js', '/js/modules/analytics.js',",
      "  '/js/system/search.js', '/js/system/shortcuts.js', '/js/system/sos.js', '/js/system/capture.js',",
      "  '/js/system/onboarding.js', '/js/system/importExport.js', '/js/system/mobile.js'",
      "];",
      "self.addEventListener('install', function(event) {",
      "  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(urlsToCache); }));",
      "  self.skipWaiting();",
      "});",
      "self.addEventListener('activate', function(event) {",
      "  event.waitUntil(caches.keys().then(function(cacheNames) {",
      "    return Promise.all(cacheNames.map(function(cacheName) { if (cacheName !== CACHE_NAME) return caches.delete(cacheName); }));",
      "  }));",
      "  self.clients.claim();",
      "});",
      "self.addEventListener('fetch', function(event) {",
      "  event.respondWith(caches.match(event.request).then(function(response) {",
      "    if (response) return response;",
      "    return fetch(event.request).catch(function() {",
      "      if (event.request.mode === 'navigate') return caches.match('/index.html');",
      "    });",
      "  }));",
      "});"
    ].join('\n');

    var blob = new Blob([swCode], { type: 'application/javascript' });
    var swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl).then(function(registration) {
      if (FreedomOS.DEBUG) console.log('FreedomOS: Service Worker registered', registration.scope);
    }).catch(function(error) {
      if (FreedomOS.DEBUG) console.warn('FreedomOS: Service Worker registration failed', error);
    });
  }

  function _onResize() {
    var wasMobile = _isMobile;
    _checkMobile();
    if (wasMobile && !_isMobile && _sidebarOpen) _closeSidebar();
  }

  function _preventDoubleTapZoom(e) {
    if (e.target.closest('button, a, .nav-item, .mobile-nav-item')) {
      e.preventDefault();
      e.target.click();
    }
  }

  function _onRouteChange(data) {
    if (data && data.route) {
      _updateBottomNav(data.route);
      _closeSidebar();
    }
  }

  function _addHapticFeedback() {
    if (!_isMobile) return;
    var hapticElements = document.querySelectorAll(
      '.btn, .nav-item, .mobile-nav-item, .habit-row, .intention-row, ' +
      '.project-card, .person-card, .win-card, .letter-card, ' +
      '.habit-check-btn, .intention-check-btn, .section-card-action'
    );
    hapticElements.forEach(function(el) {
      el.addEventListener('touchstart', function() {
        this.style.transform = 'scale(0.97)';
        this.style.transition = 'transform 80ms ease';
      }, { passive: true });
      el.addEventListener('touchend', function() {
        this.style.transform = '';
        this.style.transition = '';
      }, { passive: true });
      el.addEventListener('touchcancel', function() {
        this.style.transform = '';
        this.style.transition = '';
      }, { passive: true });
    });
  }

  function _initScrollShadow() {
    var contentArea = document.getElementById('content');
    if (!contentArea || !_mobileHeader) return;
    var throttled = FreedomOS.throttle(function() {
      if (contentArea.scrollTop > 10) {
        _mobileHeader.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
        _mobileHeader.style.borderBottomColor = 'rgba(255,255,255,0.1)';
      } else {
        _mobileHeader.style.boxShadow = '';
        _mobileHeader.style.borderBottomColor = '';
      }
    }, THROTTLE_SCROLL);
    contentArea.addEventListener('scroll', throttled, { passive: true });
    _listeners.push({ el: contentArea, type: 'scroll', fn: throttled });
  }

  function _init() {
    _initRefs();
    _checkMobile();

    if (_menuToggle) {
      _menuToggle.addEventListener('click', _toggleSidebar);
      _listeners.push({ el: _menuToggle, type: 'click', fn: _toggleSidebar });
    }

    if (_sidebarClose) {
      _sidebarClose.addEventListener('click', _closeSidebar);
      _listeners.push({ el: _sidebarClose, type: 'click', fn: _closeSidebar });
    }

    if (_sidebarOverlay) {
      _sidebarOverlay.addEventListener('click', _closeSidebar);
      _listeners.push({ el: _sidebarOverlay, type: 'click', fn: _closeSidebar });
    }

    document.addEventListener('touchstart', _onTouchStart, { passive: true });
    document.addEventListener('touchmove', _onTouchMove, { passive: true });
    document.addEventListener('touchend', _onTouchEnd, { passive: true });
    _listeners.push(
      { el: document, type: 'touchstart', fn: _onTouchStart },
      { el: document, type: 'touchmove', fn: _onTouchMove },
      { el: document, type: 'touchend', fn: _onTouchEnd }
    );

    if (_mobileNav) {
      var navItems = _mobileNav.querySelectorAll('.mobile-nav-item');
      navItems.forEach(function(item) {
        item.addEventListener('click', _onNavClick);
        _listeners.push({ el: item, type: 'click', fn: _onNavClick });
      });
    }

    if (_bottomSheetOverlay) {
      _bottomSheetOverlay.addEventListener('click', _onBottomSheetBackdrop);
      _listeners.push({ el: _bottomSheetOverlay, type: 'click', fn: _onBottomSheetBackdrop });
    }

    if (_bottomSheet) {
      _bottomSheet.addEventListener('touchstart', _onBottomSheetTouch, { passive: true });
      _bottomSheet.addEventListener('touchmove', _onBottomSheetTouch, { passive: true });
      _bottomSheet.addEventListener('touchend', _onBottomSheetTouch, { passive: true });
      _listeners.push(
        { el: _bottomSheet, type: 'touchstart', fn: _onBottomSheetTouch },
        { el: _bottomSheet, type: 'touchmove', fn: _onBottomSheetTouch },
        { el: _bottomSheet, type: 'touchend', fn: _onBottomSheetTouch }
      );
    }

    window.addEventListener('online', function() { _setOffline(false); });
    window.addEventListener('offline', function() { _setOffline(true); });
    if (!navigator.onLine) _setOffline(true);

    FreedomOS.on('state:changed', function() { _showSaveIndicator(); });
    FreedomOS.on('view:enter', _onRouteChange);

    window.addEventListener('resize', _onResize);
    _listeners.push({ el: window, type: 'resize', fn: _onResize });

    document.addEventListener('touchend', _preventDoubleTapZoom, { passive: false });
    _listeners.push({ el: document, type: 'touchend', fn: _preventDoubleTapZoom });

    setTimeout(_addHapticFeedback, 500);
    FreedomOS.on('view:enter', function() { setTimeout(_addHapticFeedback, 100); });

    setTimeout(_initScrollShadow, 100);

    _registerServiceWorker();

    var hasSeenSwipeHint = localStorage.getItem('freedomos_swipe_hint');
    if (!hasSeenSwipeHint && _isMobile) {
      setTimeout(function() {
        document.body.classList.add('show-swipe-hint');
        setTimeout(function() {
          document.body.classList.remove('show-swipe-hint');
          localStorage.setItem('freedomos_swipe_hint', '1');
        }, 3000);
      }, 2000);
    }

    if (FreedomOS.DEBUG) console.log('FreedomOS.mobile initialized. Mobile mode:', _isMobile);
  }

  FreedomOS.mobile = {
    init: _init,
    isMobile: function() { return _isMobile; },
    openSidebar: _openSidebar,
    closeSidebar: _closeSidebar,
    openBottomSheet: FreedomOS.openBottomSheet,
    closeBottomSheet: FreedomOS.closeBottomSheet
  };

  FreedomOS.on('app:ready', function() { _init(); });
})();