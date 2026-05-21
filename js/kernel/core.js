// ============================================================
// Freedom OS — Core Kernel
// File: js/kernel/core.js
// Depends: utils.js, events.js, ui.js, router.js, timer.js
// Provides: state, mutate, get, set, loadState, resetState, init,
//           registerModule, getModule, modules, viewMap
// Version: 2.0.1-unified
// ============================================================
//
// CONNECTION CONTRACT:
// - All state changes go through FreedomOS.mutate()
// - State persisted to localStorage via debounced _persist()
// - Emits 'state:changed' on every mutation
//
// DO NOT MODIFY:
// - Data schema shapes
// - API signatures  
// - localStorage key name
// ============================================================

(function() {
  'use strict';

  // ===== DEFENSIVE: Check dependencies with helpful errors =====
  var requiredDeps = ['emit', 'toast', 'debounce', 'deepClone', 'escapeHtml', 'confirm', 'generateId'];
  var missing = [];
  for (var i = 0; i < requiredDeps.length; i++) {
    if (typeof FreedomOS === 'undefined' || !FreedomOS[requiredDeps[i]]) {
      missing.push(requiredDeps[i]);
    }
  }
  if (missing.length > 0) {
    throw new Error('FreedomOS.core requires these from utils.js/ui.js first: ' + missing.join(', '));
  }

  /** @private @const {string} */
  var _STORAGE_KEY = 'freedomos_state_v2';

  /**
   * Default application state shape.
   * @private @const {Object}
   */
  var _defaultState = {
    version: '2.0.1',

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
      runway: { months: 0, burnRate: 0 },
      cashOnHand: 0
    },

    people: [],

    wins: [],

    letters: [],

    reviews: [],

    roadmap: {
      quarters: []
    },

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
    },

    dayLog: {
      logs: [],
      streak: 0,
      lastLogDate: null,
      dailyPrompts: [
        'What did you learn about money today?',
        'What assumption did you challenge?',
        'What would you do differently tomorrow?',
        'What connection did you make between two ideas?',
        'What skill did you practice today?',
        'What content idea came to you?',
        'What did you teach someone (or yourself)?',
        'What problem did you solve?',
        'What trend did you notice in your industry?',
        'What would your future self thank you for?',
        'What did you read or watch that changed your perspective?',
        'What habit are you building and how is it going?',
        'What fear did you face today?',
        'What win are you not giving yourself credit for?',
        'What system or process did you improve?',
        'What did you learn about yourself?',
        'What opportunity did you spot that others missed?',
        'What would you do with an extra 4 hours today?',
        'What mistake taught you the most?',
        'What are you avoiding that you should tackle?',
        'What relationship did you invest in?',
        'What boundary did you set or respect?',
        'What made you feel most alive today?',
        'What did you create today?',
        'What question do you need answered?',
        'What are you grateful for right now?',
        'What is the one thing that moved the needle?',
        'What did you learn from someone younger?',
        'What did you learn from someone older?',
        'What are you most excited to work on tomorrow?',
        'What is your biggest insight from this month so far?'
      ]
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

  // ============================================================
  // ===== FULL APPLICATION BOOTSTRAP (single init) =====
  // ============================================================

  FreedomOS.init = function() {
    FreedomOS.DEBUG = false;
    FreedomOS.modules = FreedomOS.modules || {};
    FreedomOS.viewMap = FreedomOS.viewMap || {};

    // Load state first
    FreedomOS.loadState();

    // ===== 1. BUILD SIDEBAR =====
    var sidebar = document.getElementById('sidebar');
    if (sidebar) {
      var navHtml = '';
      var viewRoutes = ['jarvis','dashboard','dayLog','projects','warRoom','creatorStudio','stageMode','finance','people','wins','letters','reviews','roadmap','stats','analytics'];
      var icons = {
        jarvis: '◆',
        dashboard: '◈', dayLog: '◉', projects: '◎', warRoom: '⚔', creatorStudio: '✎',
        stageMode: '▣', finance: '$', people: '♟', wins: '★',
        letters: '✉', reviews: '⚑', roadmap: '▤', stats: '◉', analytics: '◐'
      };

      viewRoutes.forEach(function(route) {
        var mod = FreedomOS.getModule(FreedomOS.viewMap[route]);
        if (!mod) return;
        var label = route.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); });
        navHtml += '<a href="#' + route + '" class="nav-item" data-route="' + route + '" onclick="FreedomOS.navigate(\'' + route + '\'); return false;">' +
          '<span class="nav-icon">' + (icons[route] || '•') + '</span>' +
          '<span class="nav-label">' + label + '</span></a>';
      });

      // Preserve existing sidebar structure if present, otherwise build fresh
      var existingNav = sidebar.querySelector('.sidebar-nav');
      if (existingNav) {
        existingNav.innerHTML = navHtml;
      } else {
        sidebar.innerHTML =
          '<div class="sidebar-header"><div class="sidebar-brand"><div class="brand-icon">◈</div><div class="brand-text">Freedom OS</div></div></div>' +
          '<nav class="sidebar-nav">' + navHtml + '</nav>' +
          '<div class="sidebar-footer"><div class="target-date">Target: 2029-05-21</div></div>';
      }
    }

    // ===== 2. BUILD HEADER =====
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

    // ===== 3. BOOT ROUTER (defensive) =====
    if (FreedomOS.router && typeof FreedomOS.router.init === 'function') {
      FreedomOS.router.init();
    } else {
      console.warn('[FreedomOS] Router not available. Navigation may be limited.');
    }

    // ===== 4. BOOT TIMER (defensive) =====
    if (FreedomOS.timer && typeof FreedomOS.timer.init === 'function') {
      FreedomOS.timer.init();
    }

    // ===== 5. NAVIGATE TO DEFAULT =====
    if (typeof FreedomOS.navigate === 'function') {
      var route = FreedomOS.currentRoute || 'dashboard';
      if (!window.location.hash) {
        FreedomOS.navigate(route);
      } else {
        FreedomOS.navigate(window.location.hash.replace('#', ''));
      }
    }

    // ===== 6. VIEW LIFECYCLE =====
    FreedomOS.on('view:enter', function(data) {
      var title = document.getElementById('page-title');
      if (title) title.textContent = data.route.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); });

      // Highlight active nav
      document.querySelectorAll('.nav-item').forEach(function(el) {
        el.classList.toggle('active', el.dataset.route === data.route);
      });

      // Stage Mode: hide chrome
      if (data.route === 'stageMode') {
        document.body.classList.add('stage-mode-active');
        var sb = document.getElementById('sidebar');
        var hd = document.getElementById('header');
        if (sb) sb.style.display = 'none';
        if (hd) hd.style.display = 'none';
      } else {
        document.body.classList.remove('stage-mode-active');
        var sb2 = document.getElementById('sidebar');
        var hd2 = document.getElementById('header');
        if (sb2) sb2.style.display = '';
        if (hd2) hd2.style.display = '';
      }

      // JARVIS view
      if (data.route === 'jarvis') {
        document.body.classList.add('jarvis-view-active');
      } else {
        document.body.classList.remove('jarvis-view-active');
      }
    });

    FreedomOS.on('view:leave', function(data) {
      if (data.route === 'stageMode') {
        document.body.classList.remove('stage-mode-active');
        var sb = document.getElementById('sidebar');
        var hd = document.getElementById('header');
        if (sb) sb.style.display = '';
        if (hd) hd.style.display = '';
      }
      if (data.route === 'jarvis') {
        document.body.classList.remove('jarvis-view-active');
        var sb2 = document.getElementById('sidebar');
        var hd2 = document.getElementById('header');
        if (sb2) sb2.style.display = '';
        if (hd2) hd2.style.display = '';
      }
    });

    // ===== 7. HEADER TIMER =====
    function _formatTime(seconds) {
      var h = Math.floor(seconds / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = seconds % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function _updateHeaderTimer() {
      var el = document.getElementById('header-timer');
      if (!el) return;

      // Priority 1: Active project timer
      if (FreedomOS.timer && FreedomOS.timer.isRunning && FreedomOS.timer.isRunning()) {
        el.textContent = _formatTime(FreedomOS.timer.getElapsed ? FreedomOS.timer.getElapsed() : 0);
        el.classList.add('timer-active');
        return;
      }

      // Priority 2: Countdown to target date
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

      el.textContent = 
        String(days).padStart(3, '0') + ':' +
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
    }

    setInterval(_updateHeaderTimer, 1000);
    _updateHeaderTimer();
    FreedomOS.on('timer:tick', _updateHeaderTimer);

    // ===== 8. JARVIS GLOBAL SHORTCUT =====
    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        if (FreedomOS.currentRoute === 'jarvis') {
          FreedomOS.navigate('dashboard');
        } else {
          FreedomOS.navigate('jarvis');
        }
      }
    });

    // ===== 9. APP READY =====
    FreedomOS.emit('app:ready');
  };

})();