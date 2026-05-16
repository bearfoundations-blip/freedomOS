// ============================================================
// Freedom OS — Search
// File: js/system/search.js
// Depends: kernel/core.js, kernel/events.js, kernel/ui.js, kernel/router.js
// Provides: Global search overlay with fuzzy matching, keyboard navigation
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

  // Constants
  const MODULE_NAME = 'search';
  const ROUTE_NAME = 'search';
  const EVENT_OPEN = 'search:open';
  const EVENT_CLOSE = 'search:close';
  const EVENT_RESULT_SELECT = 'search:resultSelect';
  const DEBOUNCE_MS = 150;
  const MAX_RESULTS_PER_CATEGORY = 5;

  // DOM references
  let overlayEl = null;
  let inputEl = null;
  let resultsEl = null;
  let selectedIndex = -1;
  let currentResults = [];
  let searchTimeout = null;
  let keydownHandler = null;

  // Category configuration
  const CATEGORIES = {
    projects: {
      label: 'Projects',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
      route: 'projects',
      getItems: () => FreedomOS.get('projects') || [],
      getText: (item) => item.name + ' ' + (item.hypothesis || '') + ' ' + (item.model || ''),
      getSubtitle: (item) => item.model + ' • ' + item.status,
      getId: (item) => item.id
    },
    people: {
      label: 'People',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      route: 'people',
      getItems: () => FreedomOS.get('people') || [],
      getText: (item) => item.name + ' ' + (item.handle || '') + ' ' + (item.platform || ''),
      getSubtitle: (item) => (item.platform || 'Unknown') + ' • ' + (item.category || 'Other'),
      getId: (item) => item.id
    },
    wins: {
      label: 'Wins',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>',
      route: 'wins',
      getItems: () => FreedomOS.get('wins') || [],
      getText: (item) => item.title + ' ' + (item.description || ''),
      getSubtitle: (item) => (item.category || 'Other') + ' • ' + (item.date ? new Date(item.date).toLocaleDateString() : ''),
      getId: (item) => item.id
    },
    content: {
      label: 'Content',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
      route: 'creatorStudio',
      getItems: () => {
        const studio = FreedomOS.get('creatorStudio') || {};
        return (studio.contentPipeline || []).concat(studio.hooks || []).concat(studio.scripts || []);
      },
      getText: (item) => (item.hook || item.title || item.text || '') + ' ' + (item.script || item.content || ''),
      getSubtitle: (item) => (item.platform || 'Content') + ' • ' + (item.status || 'Draft'),
      getId: (item) => item.id
    },
    reviews: {
      label: 'Reviews',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
      route: 'reviews',
      getItems: () => FreedomOS.get('reviews') || [],
      getText: (item) => (item.focus || '') + ' ' + (item.wins || []).join(' ') + ' ' + (item.flops || []).join(' '),
      getSubtitle: (item) => 'Week of ' + (item.weekStart ? new Date(item.weekStart).toLocaleDateString() : ''),
      getId: (item) => item.id
    },
    letters: {
      label: 'Letters',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
      route: 'letters',
      getItems: () => FreedomOS.get('letters') || [],
      getText: (item) => item.title + ' ' + (item.content || ''),
      getSubtitle: (item) => 'Unlocks: ' + (item.unlockDate ? new Date(item.unlockDate).toLocaleDateString() : 'Never'),
      getId: (item) => item.id
    }
  };

  // Fuzzy match scoring
  function fuzzyScore(query, text) {
    if (!query || !text) return 0;
    query = query.toLowerCase();
    text = text.toLowerCase();
    
    if (text === query) return 100;
    if (text.startsWith(query)) return 80;
    if (text.includes(query)) return 60;
    
    // Fuzzy matching
    let queryIdx = 0;
    let textIdx = 0;
    let score = 0;
    let consecutive = 0;
    
    while (queryIdx < query.length && textIdx < text.length) {
      if (query[queryIdx] === text[textIdx]) {
        score += 10 + consecutive * 5;
        consecutive++;
        queryIdx++;
      } else {
        consecutive = 0;
      }
      textIdx++;
    }
    
    if (queryIdx < query.length) return 0; // Not all chars matched
    return Math.min(score, 55);
  }

  function performSearch(query) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    query = query.trim();
    const results = [];
    
    Object.keys(CATEGORIES).forEach(catKey => {
      const cat = CATEGORIES[catKey];
      const items = cat.getItems();
      const scored = items.map(item => {
        const text = cat.getText(item);
        const score = fuzzyScore(query, text);
        return { item, score, category: catKey };
      }).filter(s => s.score > 0);
      
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, MAX_RESULTS_PER_CATEGORY);
      
      if (top.length > 0) {
        results.push({
          category: catKey,
          label: cat.label,
          icon: cat.icon,
          items: top
        });
      }
    });
    
    return results;
  }

  function renderEmptyInitial() {
    if (!resultsEl) return;
    resultsEl.innerHTML = `
      <div class="search-empty-initial" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-2xl) var(--space-lg);
        text-align: center;
        animation: searchFadeIn 300ms ease;
      ">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-text-muted); margin-bottom: var(--space-md); opacity: 0.4;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p style="color: var(--color-text-secondary); font-size: 0.95rem; margin: 0;">Start typing to search...</p>
      </div>
    `;
  }

  function renderResults(results) {
    if (!resultsEl) return;
    
    if (results.length === 0) {
      resultsEl.innerHTML = `
        <div class="search-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-text-muted); margin-bottom: var(--space-md);">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <p style="color: var(--color-text-secondary); font-size: 0.95rem;">No results found</p>
          <p style="color: var(--color-text-muted); font-size: 0.8rem; margin-top: var(--space-xs);">Try a different search term</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    let globalIndex = 0;
    
    results.forEach((group, groupIdx) => {
      html += `
        <div class="search-category" style="margin-bottom: var(--space-md);">
          <div class="search-category-header" style="
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-sm) var(--space-md);
            color: var(--color-text-muted);
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          ">
            ${group.icon}
            ${group.label}
          </div>
      `;
      
      group.items.forEach((scored, itemIdx) => {
        const cat = CATEGORIES[group.category];
        const isSelected = globalIndex === selectedIndex;
        
        html += `
          <div class="search-result ${isSelected ? 'search-result-selected' : ''}" 
               data-index="${globalIndex}" 
               data-category="${group.category}" 
               data-id="${cat.getId(scored.item)}"
               style="
                 display: flex;
                 align-items: center;
                 gap: var(--space-md);
                 padding: var(--space-md);
                 margin: 0 var(--space-sm);
                 border-radius: var(--radius-md);
                 cursor: pointer;
                 transition: all var(--transition-fast);
                 ${isSelected ? 'background: var(--color-surface-elevated); box-shadow: 0 0 0 1px var(--color-border);' : ''}
               ">
            <div class="search-result-icon" style="
              width: 36px;
              height: 36px;
              border-radius: var(--radius-sm);
              background: var(--color-surface);
              display: flex;
              align-items: center;
              justify-content: center;
              color: var(--color-primary);
              flex-shrink: 0;
            ">
              ${group.icon}
            </div>
            <div class="search-result-content" style="flex: 1; min-width: 0;">
              <div class="search-result-title" style="
                color: var(--color-text);
                font-weight: 500;
                font-size: 0.9rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">
                ${FreedomOS.escapeHtml(scored.item.name || scored.item.title || scored.item.hook || scored.item.text || 'Untitled')}
              </div>
              <div class="search-result-subtitle" style="
                color: var(--color-text-secondary);
                font-size: 0.8rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">
                ${FreedomOS.escapeHtml(cat.getSubtitle(scored.item))}
              </div>
            </div>
            <div class="search-result-arrow" style="
              color: var(--color-text-muted);
              opacity: ${isSelected ? 1 : 0};
              transition: opacity var(--transition-fast);
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        `;
        
        globalIndex++;
      });
      
      html += '</div>';
    });
    
    resultsEl.innerHTML = html;
    
    // Attach click handlers
    resultsEl.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', function() {
        const category = this.dataset.category;
        const id = this.dataset.id;
        selectResult(category, id);
      });
    });
  }

  function selectResult(category, id) {
    const cat = CATEGORIES[category];
    if (!cat) return;
    
    FreedomOS.navigate(cat.route, { highlightId: id });
    closeSearch();
    FreedomOS.emit(EVENT_RESULT_SELECT, { category, id });
  }

  function updateSelection(newIndex) {
    const maxIndex = currentResults.reduce((sum, g) => sum + g.items.length, 0) - 1;
    
    if (newIndex < 0) newIndex = maxIndex;
    if (newIndex > maxIndex) newIndex = 0;
    
    selectedIndex = newIndex;
    renderResults(currentResults);
    
    // Scroll selected into view
    const selectedEl = resultsEl.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function onInput() {
    const query = inputEl.value;
    
    clearTimeout(searchTimeout);
    
    if (!query || query.trim().length === 0) {
      currentResults = [];
      selectedIndex = -1;
      renderEmptyInitial();
      return;
    }
    
    searchTimeout = setTimeout(() => {
      currentResults = performSearch(query);
      selectedIndex = currentResults.length > 0 ? 0 : -1;
      renderResults(currentResults);
    }, DEBOUNCE_MS);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateSelection(selectedIndex + 1);
      return;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateSelection(selectedIndex - 1);
      return;
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && currentResults.length > 0) {
        let idx = 0;
        for (const group of currentResults) {
          for (const item of group.items) {
            if (idx === selectedIndex) {
              const cat = CATEGORIES[group.category];
              selectResult(group.category, cat.getId(item.item));
              return;
            }
            idx++;
          }
        }
      }
      return;
    }
  }

  function openSearch() {
    overlayEl = document.getElementById('search-overlay');
    if (!overlayEl) return;
    
    overlayEl.classList.remove('hidden');
    overlayEl.innerHTML = `
      <div class="search-backdrop" style="
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.85);
        backdrop-filter: blur(8px);
        z-index: 100;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 15vh;
      ">
        <div class="search-container" style="
          width: 100%;
          max-width: 640px;
          margin: 0 var(--space-md);
          background: rgba(25, 25, 35, 0.8);
          backdrop-filter: blur(24px) saturate(1.2);
          -webkit-backdrop-filter: blur(24px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg), 0 0 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
          overflow: hidden;
          animation: searchSlideIn 250ms ease;
        ">
          <div class="search-input-wrap" style="
            display: flex;
            align-items: center;
            gap: var(--space-md);
            padding: var(--space-md) var(--space-lg);
            border-bottom: 1px solid var(--color-border-subtle);
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-text-muted); flex-shrink: 0;">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" 
                   id="search-input" 
                   placeholder="Search projects, people, wins, content..." 
                   autocomplete="off"
                   style="
                     flex: 1;
                     background: transparent;
                     border: none;
                     color: var(--color-text);
                     font-size: 1rem;
                     outline: none;
                     font-family: var(--font-sans);
                   ">
            <kbd style="
              background: var(--color-surface-elevated);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-sm);
              padding: 2px 8px;
              font-size: 0.75rem;
              color: var(--color-text-muted);
              font-family: var(--font-mono);
            ">ESC</kbd>
          </div>
          <div id="search-results" style="
            max-height: 50vh;
            overflow-y: auto;
            padding: var(--space-md) 0;
          "></div>
          <div class="search-footer" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-sm) var(--space-lg);
            border-top: 1px solid var(--color-border-subtle);
            color: var(--color-text-muted);
            font-size: 0.75rem;
          ">
            <span>
              <kbd style="background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 1px 6px; font-family: var(--font-mono);">↑↓</kbd> to navigate
              <kbd style="background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 1px 6px; font-family: var(--font-mono); margin-left: var(--space-sm);">↵</kbd> to select
            </span>
            <span>${Object.keys(CATEGORIES).length} categories</span>
          </div>
        </div>
      </div>
      <style>
        @keyframes searchSlideIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .search-result:hover {
          background: var(--color-surface-elevated) !important;
        }
        .search-result-selected {
          background: var(--color-surface-elevated) !important;
          box-shadow: 0 0 0 1px var(--color-border) !important;
        }
        .search-result-selected .search-result-arrow {
          opacity: 1 !important;
          color: var(--color-primary);
        }
        #search-results::-webkit-scrollbar {
          width: 6px;
        }
        #search-results::-webkit-scrollbar-track {
          background: transparent;
        }
        #search-results::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 3px;
        }
        @keyframes searchFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      </style>
    `;
    
    inputEl = document.getElementById('search-input');
    resultsEl = document.getElementById('search-results');
    
    inputEl.focus();
    inputEl.addEventListener('input', onInput);
    renderEmptyInitial();
    
    keydownHandler = onKeydown;
    document.addEventListener('keydown', keydownHandler);
    
    // Click backdrop to close
    overlayEl.querySelector('.search-backdrop').addEventListener('click', function(e) {
      if (e.target === this) closeSearch();
    });
    
    FreedomOS.emit(EVENT_OPEN);
  }

  function closeSearch() {
    if (!overlayEl) return;
    
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    
    clearTimeout(searchTimeout);
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    overlayEl = null;
    inputEl = null;
    resultsEl = null;
    selectedIndex = -1;
    currentResults = [];
    
    FreedomOS.emit(EVENT_CLOSE);
  }

  // Global keyboard shortcut listener
  function onGlobalKeydown(e) {
    // Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (overlayEl && !overlayEl.classList.contains('hidden')) {
        closeSearch();
      } else {
        openSearch();
      }
    }
  }

  // Module registration
  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'events', 'ui', 'router'],

    init: function() {
      document.addEventListener('keydown', onGlobalKeydown);
      
      // Listen for open event from other modules
      FreedomOS.on(EVENT_OPEN, openSearch);
      FreedomOS.on(EVENT_CLOSE, closeSearch);
    },

    render: function(params) {
      return '';
    },

    onMount: function(container) {
      // Search is an overlay, not a regular view
    },

    onUnmount: function(container) {
      closeSearch();
    }
  });

})();