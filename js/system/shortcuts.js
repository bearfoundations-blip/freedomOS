// ============================================================
// Freedom OS — Shortcuts
// File: js/system/shortcuts.js
// Depends: kernel/core.js, kernel/events.js, kernel/ui.js, kernel/router.js
// Provides: Keyboard shortcut reference overlay
// Last Updated: 2026-04-28
// ============================================================
// 
// CONNECTION CONTRACT:
// - This module registers itself via FreedomOS.registerModule()
// - It expects FreedomOS.state to be initialized (see DATA SCHEMA below)
// - It emits events via FreedomOS.emit() and listens via FreedomOS.on()
// - It uses FreedomOS.mutate() for ALL state changes (triggers persist)
// - It renders via FreedomOS.render() which returns HTML string
//
// DO NOT MODIFY:
// - The kernel API signatures
// - The data schema shapes
// - The CSS variable names
// - The route names
// ============================================================

(function() {
  'use strict';

  const MODULE_NAME = 'shortcuts';
  const ROUTE_NAME = 'shortcuts';

  let overlayEl = null;
  let keydownHandler = null;

  const SHORTCUT_GROUPS = [
    {
      name: 'Navigation',
      shortcuts: [
        { keys: ['G', 'D'], description: 'Go to Dashboard', action: () => FreedomOS.navigate('dashboard') },
        { keys: ['G', 'P'], description: 'Go to Projects', action: () => FreedomOS.navigate('projects') },
        { keys: ['G', 'S'], description: 'Go to Stage Mode', action: () => FreedomOS.navigate('stageMode') },
        { keys: ['G', 'W'], description: 'Go to War Room', action: () => FreedomOS.navigate('warRoom') },
        { keys: ['G', 'F'], description: 'Go to Finance', action: () => FreedomOS.navigate('finance') },
        { keys: ['G', 'C'], description: 'Go to Creator Studio', action: () => FreedomOS.navigate('creatorStudio') },
        { keys: ['G', 'R'], description: 'Go to Reviews', action: () => FreedomOS.navigate('reviews') },
        { keys: ['G', 'A'], description: 'Go to Analytics', action: () => FreedomOS.navigate('analytics') }
      ]
    },
    {
      name: 'Actions',
      shortcuts: [
        { keys: ['Ctrl', 'K'], description: 'Open Search', action: () => FreedomOS.emit('search:open') },
        { keys: ['Ctrl', 'N'], description: 'New Project', action: () => FreedomOS.navigate('projects', { action: 'new' }) },
        { keys: ['Ctrl', 'W'], description: 'Quick Capture', action: () => FreedomOS.emit('capture:open') },
        { keys: ['Ctrl', 'S'], description: 'Save Current', action: () => FreedomOS.emit('state:save') },
        { keys: ['?'], description: 'Show Shortcuts', action: () => openShortcuts() }
      ]
    },
    {
      name: 'Views',
      shortcuts: [
        { keys: ['Esc'], description: 'Close Overlay / Cancel', action: () => closeShortcuts() },
        { keys: ['Ctrl', '1'], description: 'Dashboard', action: () => FreedomOS.navigate('dashboard') },
        { keys: ['Ctrl', '2'], description: 'Projects', action: () => FreedomOS.navigate('projects') },
        { keys: ['Ctrl', '3'], description: 'War Room', action: () => FreedomOS.navigate('warRoom') },
        { keys: ['Ctrl', '4'], description: 'Creator Studio', action: () => FreedomOS.navigate('creatorStudio') },
        { keys: ['Ctrl', '5'], description: 'Finance', action: () => FreedomOS.navigate('finance') },
        { keys: ['Ctrl', '6'], description: 'People', action: () => FreedomOS.navigate('people') },
        { keys: ['Ctrl', '7'], description: 'Wins', action: () => FreedomOS.navigate('wins') },
        { keys: ['Ctrl', '8'], description: 'Stage Mode', action: () => FreedomOS.navigate('stageMode') }
      ]
    },
    {
      name: 'System',
      shortcuts: [
        { keys: ['Ctrl', 'Shift', 'S'], description: 'SOS Focus Mode', action: () => FreedomOS.emit('sos:open') },
        { keys: ['Ctrl', 'Shift', 'E'], description: 'Export Data', action: () => FreedomOS.emit('importExport:export') },
        { keys: ['Ctrl', '/'], description: 'Toggle Sidebar', action: () => document.body.classList.toggle('sidebar-collapsed') }
      ]
    }
  ];

  // Sequence tracking for multi-key shortcuts
  let keySequence = [];
  let sequenceTimeout = null;

  function renderKey(keys) {
    return keys.map(k => `
      <kbd style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 8px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-bottom-width: 2px;
        border-radius: var(--radius-sm);
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--color-text);
        box-shadow: var(--shadow-sm);
      ">${k}</kbd>
    `).join('<span style="color: var(--color-text-muted); margin: 0 4px;">+</span>');
  }

  function openShortcuts() {
    if (overlayEl && !overlayEl.classList.contains('hidden')) return;
    
    overlayEl = document.getElementById('shortcut-overlay');
    if (!overlayEl) return;
    
    overlayEl.classList.remove('hidden');
    
    let html = `
      <div class="shortcuts-backdrop" style="
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.85);
        backdrop-filter: blur(8px);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-xl);
      ">
        <div class="shortcuts-container" style="
          width: 100%;
          max-width: 720px;
          max-height: 85vh;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: shortcutsFadeIn 250ms ease;
        ">
          <div class="shortcuts-header" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-lg) var(--space-xl);
            border-bottom: 1px solid var(--color-border-subtle);
          ">
            <h2 style="
              margin: 0;
              font-family: var(--font-display);
              font-size: 1.4rem;
              font-weight: 700;
              color: var(--color-text);
              letter-spacing: -0.02em;
            ">Keyboard Shortcuts</h2>
            <button class="shortcuts-close" style="
              background: none;
              border: none;
              color: var(--color-text-muted);
              cursor: pointer;
              padding: var(--space-sm);
              border-radius: var(--radius-sm);
              transition: all var(--transition-fast);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="shortcuts-body" style="
            overflow-y: auto;
            padding: var(--space-lg) var(--space-xl);
          ">
    `;
    
    SHORTCUT_GROUPS.forEach((group, idx) => {
      html += `
        <div class="shortcuts-group" style="
          margin-bottom: ${idx < SHORTCUT_GROUPS.length - 1 ? 'var(--space-xl)' : '0'};
        ">
          <h3 style="
            margin: 0 0 var(--space-md) 0;
            font-family: var(--font-sans);
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--color-primary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
          ">${group.name}</h3>
          <div class="shortcuts-list" style="
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: var(--space-sm);
          ">
      `;
      
      group.shortcuts.forEach((shortcut, sIdx) => {
        html += `
          <div class="shortcut-row" 
               data-group="${idx}" 
               data-shortcut="${sIdx}"
               style="
                 display: flex;
                 align-items: center;
                 justify-content: space-between;
                 padding: var(--space-md);
                 border-radius: var(--radius-md);
                 cursor: pointer;
                 transition: all var(--transition-fast);
                 animation: shortcutStagger ${300 + sIdx * 50}ms ease both;
               " 
               onmouseover="this.style.background='var(--color-surface-elevated)'" 
               onmouseout="this.style.background='transparent'">
            <span style="
              color: var(--color-text-secondary);
              font-size: 0.9rem;
            ">${shortcut.description}</span>
            <span class="shortcut-keys" style="
              display: flex;
              align-items: center;
              gap: 2px;
              flex-shrink: 0;
              margin-left: var(--space-lg);
            ">${renderKey(shortcut.keys)}</span>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    });
    
    html += `
          </div>
          
          <div class="shortcuts-footer" style="
            padding: var(--space-md) var(--space-xl);
            border-top: 1px solid var(--color-border-subtle);
            color: var(--color-text-muted);
            font-size: 0.75rem;
            text-align: center;
          ">
            Press <kbd style="
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: var(--radius-sm);
              padding: 1px 6px;
              font-family: var(--font-mono);
              font-size: 0.75rem;
            ">Esc</kbd> to close
          </div>
        </div>
      </div>
      
      <style>
        @keyframes shortcutsFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes shortcutStagger {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .shortcuts-close:hover {
          color: var(--color-text) !important;
          background: var(--color-surface-elevated) !important;
        }
        .shortcut-row:hover .shortcut-keys kbd {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }
        .shortcuts-body::-webkit-scrollbar {
          width: 6px;
        }
        .shortcuts-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .shortcuts-body::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 3px;
        }
      </style>
    `;
    
    overlayEl.innerHTML = html;
    
    // Click handlers
    overlayEl.querySelector('.shortcuts-close').addEventListener('click', closeShortcuts);
    overlayEl.querySelector('.shortcuts-backdrop').addEventListener('click', function(e) {
      if (e.target === this) closeShortcuts();
    });
    
    // Shortcut row click handlers
    overlayEl.querySelectorAll('.shortcut-row').forEach(row => {
      row.addEventListener('click', function() {
        const groupIdx = parseInt(this.dataset.group);
        const shortcutIdx = parseInt(this.dataset.shortcut);
        const shortcut = SHORTCUT_GROUPS[groupIdx].shortcuts[shortcutIdx];
        if (shortcut.action) {
          closeShortcuts();
          setTimeout(() => shortcut.action(), 100);
        }
      });
    });
    
    keydownHandler = function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeShortcuts();
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }

  function closeShortcuts() {
    if (!overlayEl) return;
    
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    overlayEl = null;
  }

  // Global keyboard listener
  function onGlobalKeydown(e) {
    // ? key (Shift+/)
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault();
      openShortcuts();
      return;
    }
    
    // Sequence-based shortcuts (G then D, etc.)
    if (e.key === 'g' || e.key === 'G') {
      keySequence = ['G'];
      clearTimeout(sequenceTimeout);
      sequenceTimeout = setTimeout(() => { keySequence = []; }, 800);
      return;
    }
    
    if (keySequence.length > 0 && keySequence[0] === 'G') {
      const routeMap = {
        'd': 'dashboard', 'D': 'dashboard',
        'p': 'projects', 'P': 'projects',
        's': 'stageMode', 'S': 'stageMode',
        'w': 'warRoom', 'W': 'warRoom',
        'f': 'finance', 'F': 'finance',
        'c': 'creatorStudio', 'C': 'creatorStudio',
        'r': 'reviews', 'R': 'reviews',
        'a': 'analytics', 'A': 'analytics'
      };
      
      if (routeMap[e.key]) {
        e.preventDefault();
        FreedomOS.navigate(routeMap[e.key]);
        keySequence = [];
        clearTimeout(sequenceTimeout);
      }
    }
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'events', 'ui', 'router'],

    init: function() {
      document.addEventListener('keydown', onGlobalKeydown);
    },

    render: function(params) {
      return '';
    },

    onMount: function(container) {
      // Overlay-based, not a regular view
    },

    onUnmount: function(container) {
      closeShortcuts();
      keySequence = [];
      clearTimeout(sequenceTimeout);
    }
  });

})();