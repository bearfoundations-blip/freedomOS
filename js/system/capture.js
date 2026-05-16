// ============================================================
// Freedom OS — Capture
// File: js/system/capture.js
// Depends: kernel/core.js, kernel/events.js, kernel/ui.js, kernel/router.js
// Provides: Quick capture modal for ideas, tasks, wins, expenses
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

  const MODULE_NAME = 'capture';
  const ROUTE_NAME = 'capture';

  let overlayEl = null;
  let keydownHandler = null;
  let recentCaptures = [];

  function detectType(text) {
    text = text.toLowerCase();
    if (text.includes('$') || text.includes('cost') || text.includes('spent') || text.includes('paid')) {
      return 'expense';
    }
    if (text.includes('win') || text.includes('landed') || text.includes('closed') || text.includes('achieved')) {
      return 'win';
    }
    if (text.includes('todo') || text.includes('task') || text.includes('need to') || text.includes('must')) {
      return 'task';
    }
    return 'idea';
  }

  function getTypeIcon(type) {
    const icons = {
      idea: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>',
      task: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path></svg>',
      win: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 000-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0012 0V2z"></path></svg>',
      expense: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"></path></svg>'
    };
    return icons[type] || icons.idea;
  }

  function getTypeColor(type) {
    const colors = {
      idea: 'var(--color-info)',
      task: 'var(--color-primary)',
      win: 'var(--color-success)',
      expense: 'var(--color-danger)'
    };
    return colors[type] || 'var(--color-text-muted)';
  }

  function getProjects() {
    return FreedomOS.get('projects') || [];
  }

  function saveCapture(text, type, projectId) {
    if (!text || !text.trim()) return;
    
    const capture = {
      id: FreedomOS.generateId(),
      text: text.trim(),
      type: type,
      projectId: projectId || null,
      createdAt: new Date().toISOString()
    };
    
    recentCaptures.unshift(capture);
    if (recentCaptures.length > 10) recentCaptures.pop();
    
    // Route to appropriate module based on type
    switch (type) {
      case 'win':
        const win = {
          id: FreedomOS.generateId(),
          title: text.trim(),
          category: 'Other',
          date: new Date().toISOString(),
          description: '',
          image: null,
          projectId: projectId || null
        };
        const wins = FreedomOS.get('wins') || [];
        wins.unshift(win);
        FreedomOS.mutate('wins', wins);
        FreedomOS.toast('Win captured!', 'success');
        break;
        
      case 'expense':
        const expense = {
          id: FreedomOS.generateId(),
          projectId: projectId || null,
          type: 'expense',
          amount: 0,
          category: 'Other',
          date: new Date().toISOString(),
          description: text.trim()
        };
        const ledger = FreedomOS.get('finance.ledger') || [];
        ledger.unshift(expense);
        FreedomOS.mutate('finance.ledger', ledger);
        FreedomOS.toast('Expense captured!', 'info');
        break;
        
      case 'task':
        // Add as daily intention
        const intention = {
          id: FreedomOS.generateId(),
          text: text.trim(),
          completed: false,
          priority: 'medium'
        };
        const intentions = FreedomOS.get('dashboard.dailyIntentions') || [];
        intentions.unshift(intention);
        FreedomOS.mutate('dashboard.dailyIntentions', intentions);
        FreedomOS.toast('Task captured!', 'info');
        break;
        
      case 'idea':
      default:
        // Save as a note in creator studio hooks
        const hook = {
          id: FreedomOS.generateId(),
          text: text.trim(),
          used: false,
          performance: null
        };
        const hooks = FreedomOS.get('creatorStudio.hooks') || [];
        hooks.unshift(hook);
        FreedomOS.mutate('creatorStudio.hooks', hooks);
        FreedomOS.toast('Idea captured!', 'success');
        break;
    }
    
    FreedomOS.emit('capture:saved', capture);
  }

  function renderRecentCaptures() {
    const listEl = document.getElementById('capture-recent-list');
    if (!listEl) return;
    
    if (recentCaptures.length === 0) {
      listEl.innerHTML = `
        <div style="
          text-align: center;
          padding: var(--space-xl);
          color: var(--color-text-muted);
          font-size: 0.85rem;
        ">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: var(--space-md); opacity: 0.5;">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          <p>No recent captures</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    recentCaptures.forEach((cap, idx) => {
      html += `
        <div style="
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md);
          border-radius: var(--radius-md);
          background: var(--color-surface);
          border: 1px solid var(--color-border-subtle);
          margin-bottom: var(--space-sm);
          animation: captureStagger ${200 + idx * 50}ms ease both;
        ">
          <div style="color: ${getTypeColor(cap.type)}; flex-shrink: 0;">
            ${getTypeIcon(cap.type)}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="
              color: var(--color-text);
              font-size: 0.9rem;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">${FreedomOS.escapeHtml(cap.text)}</div>
            <div style="
              color: var(--color-text-muted);
              font-size: 0.75rem;
              margin-top: 2px;
            ">
              ${cap.type.charAt(0).toUpperCase() + cap.type.slice(1)} • ${new Date(cap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      `;
    });
    
    listEl.innerHTML = html;
  }

  function openCapture() {
    if (overlayEl && !overlayEl.classList.contains('hidden')) return;
    
    overlayEl = document.getElementById('capture-overlay');
    if (!overlayEl) return;
    
    const projects = getProjects();
    
    overlayEl.classList.remove('hidden');
    overlayEl.innerHTML = `
      <div class="capture-backdrop" style="
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.8);
        backdrop-filter: blur(6px);
        z-index: 100;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 20vh;
      ">
        <div class="capture-container" style="
          width: 100%;
          max-width: 560px;
          margin: 0 var(--space-md);
          background: rgba(25, 25, 35, 0.8);
          backdrop-filter: blur(20px) saturate(1.2);
          -webkit-backdrop-filter: blur(20px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.05);
          overflow: hidden;
          animation: captureSlideIn 250ms ease;
        ">
          <!-- Header -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-lg) var(--space-xl);
            border-bottom: 1px solid var(--color-border-subtle);
          ">
            <h2 style="
              margin: 0;
              font-family: var(--font-display);
              font-size: 1.2rem;
              font-weight: 700;
              color: var(--color-text);
            ">Quick Capture</h2>
            <button id="capture-close" style="
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <!-- Input area -->
          <div style="padding: var(--space-lg) var(--space-xl);">
            <textarea id="capture-input" 
                      placeholder="What's on your mind? (idea, task, win, expense...)"
                      style="
                        width: 100%;
                        min-height: 100px;
                        background: var(--color-bg);
                        border: 1px solid var(--color-border);
                        border-radius: var(--radius-md);
                        padding: var(--space-md);
                        color: var(--color-text);
                        font-family: var(--font-sans);
                        font-size: 1rem;
                        line-height: 1.5;
                        resize: vertical;
                        outline: none;
                        transition: all var(--transition-fast);
                      "></textarea>
            
            <!-- Type detection -->
            <div id="capture-type-detect" style="
              display: flex;
              align-items: center;
              gap: var(--space-sm);
              margin-top: var(--space-md);
              padding: var(--space-sm) var(--space-md);
              background: var(--color-surface-elevated);
              border-radius: var(--radius-sm);
              font-size: 0.85rem;
            ">
              <span style="color: var(--color-text-muted);">Detected:</span>
              <span id="capture-type-badge" style="
                display: inline-flex;
                align-items: center;
                gap: var(--space-xs);
                padding: 2px 10px;
                border-radius: var(--radius-sm);
                background: var(--color-info);
                color: var(--color-text-inverse);
                font-weight: 500;
                font-size: 0.8rem;
              ">
                ${getTypeIcon('idea')}
                Idea
              </span>
            </div>
            
            <!-- Project selector -->
            <div style="margin-top: var(--space-md);">
              <label style="
                display: block;
                color: var(--color-text-muted);
                font-size: 0.8rem;
                margin-bottom: var(--space-sm);
                font-weight: 500;
              ">Assign to project (optional)</label>
              <select id="capture-project" style="
                width: 100%;
                padding: var(--space-md);
                background: var(--color-bg);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-md);
                color: var(--color-text);
                font-family: var(--font-sans);
                font-size: 0.9rem;
                outline: none;
                cursor: pointer;
              ">
                <option value="">No project</option>
                ${projects.map(p => `<option value="${p.id}">${FreedomOS.escapeHtml(p.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          
          <!-- Actions -->
          <div style="
            display: flex;
            gap: var(--space-md);
            padding: var(--space-md) var(--space-xl) var(--space-xl);
          ">
            <button id="capture-save" style="
              flex: 1;
              padding: var(--space-md);
              background: var(--color-primary);
              color: var(--color-text-inverse);
              border: none;
              border-radius: var(--radius-md);
              font-family: var(--font-sans);
              font-weight: 600;
              font-size: 0.95rem;
              cursor: pointer;
              transition: all var(--transition-fast);
            ">Save Capture</button>
            <button id="capture-dismiss" style="
              padding: var(--space-md) var(--space-xl);
              background: transparent;
              color: var(--color-text-secondary);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-md);
              font-family: var(--font-sans);
              font-weight: 500;
              font-size: 0.9rem;
              cursor: pointer;
              transition: all var(--transition-fast);
            ">Dismiss</button>
          </div> 
        </div>
      </div>
    `;
    
    // Attach event listeners
    const captureInput = document.getElementById('capture-input');
    const captureSave = document.getElementById('capture-save');
    const captureDismiss = document.getElementById('capture-dismiss');
    const captureClose = document.getElementById('capture-close');
    
    if (captureInput) {
      captureInput.focus();
      captureInput.addEventListener('input', function() {
        const type = detectType(this.value);
        const badge = document.getElementById('capture-type-badge');
        if (badge) {
          badge.style.background = getTypeColor(type);
          badge.innerHTML = getTypeIcon(type) + ' ' + type.charAt(0).toUpperCase() + type.slice(1);
          badge.dataset.type = type;
        }
      });
      captureInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (captureSave) captureSave.click();
        }
      });
    }
    
    if (captureSave) {
      captureSave.addEventListener('click', function() {
        const input = document.getElementById('capture-input');
        const projectSelect = document.getElementById('capture-project');
        const typeBadge = document.getElementById('capture-type-badge');
        if (input && input.value.trim()) {
          const type = typeBadge && typeBadge.dataset.type ? typeBadge.dataset.type : detectType(input.value);
          saveCapture(input.value.trim(), type, projectSelect ? projectSelect.value : null);
          input.value = '';
          if (typeBadge) {
            typeBadge.style.background = getTypeColor('idea');
            typeBadge.innerHTML = getTypeIcon('idea') + ' Idea';
            typeBadge.dataset.type = 'idea';
          }
        }
      });
    }
    
    if (captureDismiss) {
      captureDismiss.addEventListener('click', closeCapture);
    }
    
    if (captureClose) {
      captureClose.addEventListener('click', closeCapture);
    }
    
    // Click backdrop to close
    overlayEl.querySelector('.capture-backdrop').addEventListener('click', function(e) {
      if (e.target === this) closeCapture();
    });
    
    keydownHandler = function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCapture();
      }
    };
    document.addEventListener('keydown', keydownHandler);
    
    FreedomOS.emit('capture:opened');
  }

  function closeCapture() {
    if (!overlayEl) return;
    
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    overlayEl = null;
    
    FreedomOS.emit('capture:closed');
  }

  function onGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (overlayEl && !overlayEl.classList.contains('hidden')) {
        closeCapture();
      } else {
        openCapture();
      }
    }
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'events', 'ui', 'router'],

    init: function() {
      document.addEventListener('keydown', onGlobalKeydown);
      FreedomOS.on('capture:open', openCapture);
    },

    render: function(params) {
      return '';
    },

    onMount: function(container) {
      // Overlay-based module
    },

    onUnmount: function(container) {
      closeCapture();
    }
  });

})();