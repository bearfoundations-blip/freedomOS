// ============================================================
// Freedom OS — Core State Management
// File: js/kernel/core.js
// Depends: utils.js, events.js, ui.js
// Provides: state, mutate, get, set, loadState, resetState, init,
//           registerModule, getModule, modules, viewMap
// Last Updated: 2026-05-10
// ============================================================
//
// CONNECTION CONTRACT:
// - This module initializes the FreedomOS application state
// - All state changes go through FreedomOS.mutate()
// - State is persisted to localStorage via debounced _persist()
// - Emits 'state:changed' on every mutation
//
// DO NOT MODIFY:
// - Data schema shapes
// - API signatures
// - localStorage key name
// ============================================================

(function() {
  'use strict';

  if (typeof FreedomOS === 'undefined' || !FreedomOS.emit || !FreedomOS.toast) {
    throw new Error('FreedomOS.core requires utils.js, events.js, and ui.js to be loaded first.');
  }

  /** @private @const {string} */
  var _STORAGE_KEY = 'freedomos_state_v2';

  /**
   * Default application state shape.
   * @private @const {Object}
   */
  var _defaultState = {
    version: '2.0.0',

    profile: {
      name: '',
      targetDate: '2029-05-21',
      currency: 'USD',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },

    dashboard: {
      habits: [],
      energy: { level: 5, notes: '' },
      mood: { score: 5, label: '' },
      dailyIntentions: [],
      operatorScore: 0
    },

    projects: [],

    creatorStudio: {
      platforms: [],
      contentPipeline: [],
      hooks: [],
      scripts: []
    },

    finance: {
      ledger: [],
      monthlyTargets: [],
      runway: { months: 0, burnRate: 0 }
    },

    people: [],

    wins: [],

    letters: [],

    reviews: [],

    roadmap: [],

    stats: {
      totalProjects: 0,
      totalRevenue: 0,
      totalHours: 0,
      currentStreak: 0,
      longestStreak: 0,
      winCount: 0,
      letterCount: 0,
      reviewCount: 0
    },

    settings: {
      theme: 'dark',
      stageModeQuotes: [],
      notifications: true,
      autoSave: true
    },

    timer: {
      isRunning: false,
      projectId: null,
      startTime: null,
      elapsed: 0
    }
  };

  /** @private @type {Object} */
  var _state = {};

  /**
   * Persists current state to localStorage.
   * @private
   */
  function _persist() {
    try {
      var serialized = JSON.stringify(_state);
      localStorage.setItem(_STORAGE_KEY, serialized);
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        if (FreedomOS.DEBUG) {
          console.warn('FreedomOS: localStorage quota exceeded. State not persisted.');
        }
        FreedomOS.toast('Storage full. Export backup.', 'error', 5000);
      }
    }
  }

  /** @private @type {Function} */
  var _debouncedPersist = FreedomOS.debounce(_persist, 300);

  /**
   * Deep sets a value at a dot-notation path.
   * @private
   * @param {Object} obj - Target object
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   */
  function _setPath(obj, path, value) {
    var keys = path.split('.');
    var current = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      var key = keys[i];
      var nextKey = keys[i + 1];
      if (current[key] == null) {
        current[key] = /^\d+$/.test(nextKey) ? [] : {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Deep gets a value at a dot-notation path.
   * @private
   * @param {Object} obj - Source object
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path or undefined
   */
  function _getPath(obj, path) {
    var keys = path.split('.');
    var current = obj;
    for (var i = 0; i < keys.length; i++) {
      if (current == null) return undefined;
      current = current[keys[i]];
    }
    return current;
  }

  /**
   * Validates and migrates loaded state to match current schema.
   * @private
   * @param {Object} loaded - State from localStorage
   * @returns {Object} Migrated state
   */
  function _migrateState(loaded) {
    if (!loaded || typeof loaded !== 'object') {
      return FreedomOS.deepClone(_defaultState);
    }
    var migrated = FreedomOS.deepClone(_defaultState);
    function merge(target, source) {
      for (var key in source) {
        if (source.hasOwnProperty(key)) {
          if (target.hasOwnProperty(key) && typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            merge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      }
    }
    merge(migrated, loaded);
    migrated.version = _defaultState.version;
    return migrated;
  }

  /**
   * Loads state from localStorage or initializes with defaults.
   */
  FreedomOS.loadState = function() {
    try {
      var raw = localStorage.getItem(_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        _state = _migrateState(parsed);
      } else {
        _state = FreedomOS.deepClone(_defaultState);
        _persist();
      }
    } catch (e) {
      _state = FreedomOS.deepClone(_defaultState);
      _persist();
    }
    FreedomOS.state = _state;
  };

  /**
   * Mutates state at a dot-notation path and persists.
   * @param {string} path - Dot-notation path (e.g., 'projects.0.name')
   * @param {*} value - New value
   */
  FreedomOS.mutate = function(path, value) {
    if (typeof path !== 'string') return;
    _setPath(_state, path, value);
    _debouncedPersist();
    FreedomOS.emit('state:changed', { path: path, value: value });
  };

  /**
   * Safe deep getter for state values.
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path or undefined
   */
  FreedomOS.get = function(path) {
    if (typeof path !== 'string') return undefined;
    return _getPath(_state, path);
  };

  /**
   * Alias for mutate.
   * @param {string} path - Dot-notation path
   * @param {*} value - New value
   */
  FreedomOS.set = function(path, value) {
    FreedomOS.mutate(path, value);
  };

  /**
   * Resets state to default after confirmation.
   */
  FreedomOS.resetState = function() {
    FreedomOS.confirm(
      'Are you sure you want to reset all data? This cannot be undone.',
      function() {
        _state = FreedomOS.deepClone(_defaultState);
        FreedomOS.state = _state;
        _persist();
        FreedomOS.emit('state:changed', { path: '*', value: null });
        FreedomOS.toast('All data has been reset.', 'success');
      }
    );
  };

  /**
   * Registers a module configuration.
   * @param {Object} config - Module configuration
   */
  FreedomOS.registerModule = function(config) {
    if (!config || typeof config.name !== 'string') return;
    if (!FreedomOS.modules) FreedomOS.modules = {};

    if (FreedomOS.modules[config.name]) {
      if (FreedomOS.DEBUG) {
        console.warn('FreedomOS: Module "' + config.name + '" already registered. Overwriting.');
      }
    }

    // Check dependencies
    if (Array.isArray(config.requires)) {
      for (var i = 0; i < config.requires.length; i++) {
        if (!FreedomOS.getModule(config.requires[i])) {
          if (FreedomOS.DEBUG) {
            console.warn('FreedomOS: Module "' + config.name + '" requires "' + config.requires[i] + '" which is not yet registered.');
          }
        }
      }
    }

    FreedomOS.modules[config.name] = config;

    // Register routes
    if (Array.isArray(config.routes)) {
      if (!FreedomOS.viewMap) FreedomOS.viewMap = {};
      config.routes.forEach(function(route) {
        if (FreedomOS.viewMap[route] && FreedomOS.viewMap[route] !== config.name) {
          if (FreedomOS.DEBUG) {
            console.warn('FreedomOS: Route "' + route + '" already mapped to "' + FreedomOS.viewMap[route] + '". Reassigning to "' + config.name + '".');
          }
        }
        FreedomOS.viewMap[route] = config.name;
      });
    }
  };

  /**
   * Gets a registered module configuration.
   * @param {string} name - Module name
   * @returns {Object|undefined} Module config
   */
  FreedomOS.getModule = function(name) {
    return FreedomOS.modules ? FreedomOS.modules[name] : undefined;
  };

  /**
   * Initializes the FreedomOS kernel and bootstraps modules.
   */
  FreedomOS.init = function() {
    FreedomOS.DEBUG = false;
    FreedomOS.modules = FreedomOS.modules || {};
    FreedomOS.viewMap = FreedomOS.viewMap || {};
    FreedomOS.loadState();

    // Initialize router if available
    if (FreedomOS.router && typeof FreedomOS.router.init === 'function') {
      FreedomOS.router.init();
    }

    // Initialize timer if available
    if (FreedomOS.timer && typeof FreedomOS.timer.init === 'function') {
      FreedomOS.timer.init();
    }

    // Navigate to default route
    if (typeof FreedomOS.navigate === 'function') {
      var route = FreedomOS.currentRoute || 'dashboard';
      FreedomOS.navigate(route);
    }

    FreedomOS.emit('app:ready');
  };

})();

FreedomOS.init = function() {
  FreedomOS.DEBUG = false;
  FreedomOS.modules = FreedomOS.modules || {};
  FreedomOS.viewMap = FreedomOS.viewMap || {};
  FreedomOS.loadState();

  // Build sidebar — ONLY real views, not system overlays
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    var navHtml = '';
    var viewRoutes = ['dashboard','projects','warRoom','creatorStudio','stageMode','finance','people','wins','letters','reviews','roadmap','stats','analytics'];
    var icons = {
      dashboard: '◈', projects: '◎', warRoom: '⚔', creatorStudio: '✎',
      stageMode: '▣', finance: '$', people: '♟', wins: '★',
      letters: '✉', reviews: '⚑', roadmap: '▤', stats: '◉', analytics: '◐'
    };
    
    viewRoutes.forEach(function(route) {
      var mod = FreedomOS.getModule(FreedomOS.viewMap[route]);
      if (!mod) return; // Skip if module not registered
      var label = route.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); });
      navHtml += '<a href="#' + route + '" class="nav-item" data-route="' + route + '" onclick="FreedomOS.navigate(\'' + route + '\'); return false;">' +
        '<span class="nav-icon">' + (icons[route] || '•') + '</span>' +
        '<span class="nav-label">' + label + '</span></a>';
    });

    sidebar.innerHTML =
      '<div class="sidebar-brand"><div class="brand-icon">◈</div><div class="brand-text">Freedom OS</div></div>' +
      '<nav class="sidebar-nav">' + navHtml + '</nav>' +
      '<div class="sidebar-footer"><div class="target-date">Target: 2029-05-21</div></div>';
  }

  // Build header
  var header = document.getElementById('header');
  if (header) {
    header.innerHTML =
      '<div class="header-left">' +
        '<button class="sidebar-toggle" onclick="document.body.classList.toggle(\'sidebar-collapsed\')">☰</button>' +
        '<span class="header-title" id="page-title">Dashboard</span>' +
      '</div>' +
      '<div class="header-right">' +
        '<button class="header-btn" onclick="FreedomOS.navigate(\'stageMode\')">▣ Stage</button>' +
        '<div class="timer-widget" id="header-timer">00:00:00</div>' +
      '</div>';
  }

  // Boot router
  var defaultRoute = 'dashboard';
  if (!window.location.hash) {
    FreedomOS.navigate(defaultRoute);
  } else {
    FreedomOS.navigate(window.location.hash.replace('#', ''));
  }

  // Route change handler
  FreedomOS.on('view:enter', function(data) {
    var title = document.getElementById('page-title');
    if (title) title.textContent = data.route.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); });
    
    // Highlight active nav
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.route === data.route);
    });
    
    // Stage Mode: hide chrome, go fullscreen
    if (data.route === 'stageMode') {
      document.body.classList.add('stage-mode-active');
      document.getElementById('sidebar').style.display = 'none';
      document.getElementById('header').style.display = 'none';
      document.getElementById('app').style.display = 'block'; // Remove flex so stage can fill
    } else {
      document.body.classList.remove('stage-mode-active');
      document.getElementById('sidebar').style.display = '';
      document.getElementById('header').style.display = '';
      document.getElementById('app').style.display = '';
    }
  });

  // Also handle view:leave to restore chrome if leaving stage mode
  FreedomOS.on('view:leave', function(data) {
    if (data.route === 'stageMode') {
      document.body.classList.remove('stage-mode-active');
      document.getElementById('sidebar').style.display = '';
      document.getElementById('header').style.display = '';
      document.getElementById('app').style.display = '';
    }
  });

  // ============================================================
  // TIMER FIX — Restore + Header Display
  // ============================================================
  
  // 1. Restore timer from previous session (was missing from outer init)
  if (FreedomOS.timer && typeof FreedomOS.timer.init === 'function') {
    FreedomOS.timer.init();
  }

  // 2. Header timer: counts down to target date by default.
  //    If a project timer is started, it switches to elapsed time.
  function _formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function _updateHeaderTimer() {
    var el = document.getElementById('header-timer');
    if (!el) return;

    // Priority 1: Show active project timer elapsed time
    if (FreedomOS.timer && FreedomOS.timer.isRunning && FreedomOS.timer.isRunning()) {
      el.textContent = _formatTime(FreedomOS.timer.getElapsed());
      el.classList.add('timer-active');
      return;
    }

    // Priority 2: Countdown to target date (never gets stuck at 0)
    el.classList.remove('timer-active');
    var targetStr = FreedomOS.get('profile.targetDate') || '2029-05-21';
    var target = new Date(targetStr + 'T00:00:00').getTime();
    var diff = target - Date.now();

    if (diff <= 0) {
      el.textContent = 'TARGET REACHED';
      return;
    }

    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // Compact format: DDD:HH:MM:SS
    el.textContent = 
      String(days).padStart(3, '0') + ':' +
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0');
  }

  // Update immediately and every second
  setInterval(_updateHeaderTimer, 1000);
  _updateHeaderTimer();

  // Smooth update when project timer starts/stops via timer:tick events
  FreedomOS.on('timer:tick', _updateHeaderTimer);
  // ============================================================

  FreedomOS.emit('app:ready');
};