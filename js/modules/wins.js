// ============================================================
// Freedom OS — Wins
// File: js/modules/wins.js
// Depends: kernel/core.js, kernel/utils.js, kernel/ui.js, kernel/events.js, kernel/router.js
// Provides: wins module (route: wins)
// Last Updated: 2026-05-08
// ============================================================
//
// CONNECTION CONTRACT:
// - This module registers itself via FreedomOS.registerModule()
// - It expects FreedomOS.state to be initialized (see DATA SCHEMA)
// - It emits events via FreedomOS.emit() and listens via FreedomOS.on()
// - It uses FreedomOS.mutate() for ALL state changes (triggers persist)
// - It renders via module render() returning HTML string
//
// DO NOT MODIFY:
// - The kernel API signatures
// - The data schema shapes
// - The CSS variable names
// - The route names
// ============================================================

(function() {
  'use strict';

  const MODULE_NAME = 'wins';
  const ROUTE_NAME = 'wins';
  const CATEGORIES = ['Revenue', 'Viral', 'Milestone', 'Personal', 'Launch', 'Other'];

  let uiState = {
    categoryFilter: '',
    refreshListener: null
  };

  // ─── Helpers ───

  function getWins() {
    return FreedomOS.get('wins') || [];
  }

  function getProjects() {
    return FreedomOS.get('projects') || [];
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(str) {
    if (FreedomOS.escapeHtml) return FreedomOS.escapeHtml(str);
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCategoryColor(cat) {
    var map = {
      'Revenue': 'var(--color-primary)',
      'Viral': 'var(--color-secondary)',
      'Milestone': 'var(--color-info)',
      'Personal': 'var(--color-warning)',
      'Launch': 'var(--color-success)',
      'Other': 'var(--color-text-muted)'
    };
    return map[cat] || 'var(--color-text-muted)';
  }

  function filterWins(wins) {
    if (!uiState.categoryFilter) return wins;
    return wins.filter(function(w) { return w.category === uiState.categoryFilter; });
  }

  function renderWinCard(win, index) {
    var hasImage = win.image && win.image.length > 0;
    var catColor = getCategoryColor(win.category);
    var projectName = win.projectId ? (getProjects().find(function(p) { return p.id === win.projectId; }) || {}).name || '' : '';

    return '<div class="win-card ' + (hasImage ? 'win-card-image win-card--featured' : '') + '" data-id="' + win.id + '" style="border-left: 4px solid ' + catColor + '; animation-delay: ' + (index * 60) + 'ms; break-inside: avoid;">' +
      (hasImage ? '<div class="win-image-wrap"><img src="' + win.image + '" alt="" loading="lazy"></div>' : '') +
      '<div class="win-content">' +
        '<div class="win-header">' +
          '<span class="win-category" style="color: ' + catColor + '; border-color: ' + catColor + ';">' + escapeHtml(win.category || 'Other') + '</span>' +
          '<span class="win-date">' + formatDate(win.date) + '</span>' +
        '</div>' +
        '<h3 class="win-title">' + escapeHtml(win.title) + '</h3>' +
        '<p class="win-desc">' + escapeHtml(win.description || '') + '</p>' +
        (projectName ? '<div class="win-project">' + escapeHtml(projectName) + '</div>' : '') +
      '</div>' +
      '<div class="win-actions">' +
        '<button class="btn-icon win-delete" data-id="' + win.id + '" aria-label="Delete">🗑</button>' +
      '</div>' +
    '</div>';
  }

  function renderAddModal() {
    return '<div class="modal-overlay active" id="wins-modal">' +
      '<div class="modal">' +
        '<div class="modal-header">' +
          '<h3>Add Win</h3>' +
          '<button class="btn-icon modal-close" id="wins-modal-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="form-group"><label>Title</label><input type="text" class="form-input" id="wins-modal-title" placeholder="What did you achieve?"></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Category</label><select class="form-select" id="wins-modal-category">' +
              CATEGORIES.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-group"><label>Date</label><input type="date" class="form-input" id="wins-modal-date" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
          '</div>' +
          '<div class="form-group"><label>Description</label><textarea class="form-textarea" id="wins-modal-desc" rows="4" placeholder="Tell the story..."></textarea></div>' +
          '<div class="form-group"><label>Image (max 2MB)</label><input type="file" class="form-input" id="wins-modal-image" accept="image/*"><div class="image-preview" id="wins-image-preview"></div></div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-secondary" id="wins-modal-cancel">Cancel</button>' +
          '<button class="btn btn-primary" id="wins-modal-save">Save Win</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function triggerConfetti() {
    var container = document.createElement('div');
    container.className = 'confetti-container';
    var colors = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-info)'];
    for (var i = 0; i < 30; i++) {
      var conf = document.createElement('div');
      conf.className = 'confetti-piece';
      conf.style.left = Math.random() * 100 + 'vw';
      conf.style.background = colors[Math.floor(Math.random() * colors.length)];
      conf.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
      conf.style.animationDelay = (Math.random() * 0.5) + 's';
      container.appendChild(conf);
    }
    document.body.appendChild(container);
    setTimeout(function() {
      if (container.parentNode) container.parentNode.removeChild(container);
    }, 4000);
  }

  // ─── Module ───

  var module = {
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'utils', 'ui', 'events'],

    init: function() {
      uiState.refreshListener = FreedomOS.on('state:changed', function() {
        if (FreedomOS.currentRoute === ROUTE_NAME) {
          var content = document.getElementById('content');
          if (content) {
            content.innerHTML = module.render();
            module.onMount(content);
          }
        }
      });
    },

    render: function(params) {
      var wins = getWins();
      var filtered = filterWins(wins);

      var emptyState = '';
      if (wins.length === 0) {
        emptyState = '<div class="wins-empty">' +
          '<div class="empty-icon" style="color: var(--color-primary); opacity: 0.2;">' +
            '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">' +
              '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
            '</svg>' +
          '</div>' +
          '<h2>No wins recorded yet. Go get one.</h2>' +
          '<button class="btn btn-primary btn-lg" id="wins-add-first">Log Your First Win</button>' +
        '</div>';
      }

      var masonryContent = '';
      if (filtered.length > 0) {
        masonryContent = '<div class="wins-masonry">' +
          filtered.map(function(w, i) { return renderWinCard(w, i); }).join('') +
        '</div>';
      } else if (wins.length > 0) {
        masonryContent = '<div class="empty-state">' +
          '<div class="empty-icon">🔍</div><h3>No wins in this category</h3></div>';
      }

      return '<div class="view-wins">' +
        '<div class="view-header">' +
          '<h2>Wins Wall</h2>' +
          '<button class="btn btn-primary" id="wins-add-btn">+ Add Win</button>' +
        '</div>' +
        '<div class="wins-filters">' +
          '<button class="filter-btn ' + (!uiState.categoryFilter ? 'active' : '') + '" data-cat="">All</button>' +
          CATEGORIES.map(function(c) {
            return '<button class="filter-btn ' + (uiState.categoryFilter === c ? 'active' : '') + '" data-cat="' + c + '" style="--cat-color: ' + getCategoryColor(c) + ';">' + c + '</button>';
          }).join('') +
        '</div>' +
        masonryContent +
        emptyState +
      '</div>';
    },

    onMount: function(container) {
      var self = this;

      // Category filters
      container.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          uiState.categoryFilter = this.dataset.cat;
          var content = document.getElementById('content');
          if (content) {
            content.innerHTML = module.render();
            module.onMount(content);
          }
        });
      });

      // Add win
      var addBtn = container.querySelector('#wins-add-btn');
      if (addBtn) addBtn.addEventListener('click', openAddModal);
      var addFirstBtn = container.querySelector('#wins-add-first');
      if (addFirstBtn) addFirstBtn.addEventListener('click', openAddModal);

      // Delete
      container.querySelectorAll('.win-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = this.dataset.id;
          FreedomOS.confirm('Remove this win?', function() {
            var wins = getWins();
            FreedomOS.mutate('wins', wins.filter(function(w) { return w.id !== id; }));
          });
        });
      });

      // Card expand (detail view)
      container.querySelectorAll('.win-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
          if (e.target.closest('.win-delete')) return;
          this.classList.toggle('expanded');
        });
      });

      function openAddModal() {
        var modalHtml = renderAddModal();
        var wrap = document.createElement('div');
        wrap.innerHTML = modalHtml;
        document.body.appendChild(wrap.firstElementChild);

        var overlay = document.getElementById('wins-modal');
        function closeModal() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        var imgInput = overlay.querySelector('#wins-modal-image');
        var imgPreview = overlay.querySelector('#wins-image-preview');
        var imageBase64 = '';

        if (imgInput) {
          imgInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              FreedomOS.toast('Image must be under 2MB', 'error', 3000);
              imgInput.value = '';
              return;
            }
            var reader = new FileReader();
            reader.onload = function(ev) {
              imageBase64 = ev.target.result;
              imgPreview.innerHTML = '<img src="' + imageBase64 + '" style="max-height:120px;border-radius:var(--radius-md);">';
            };
            reader.readAsDataURL(file);
          });
        }

        overlay.querySelector('#wins-modal-close').addEventListener('click', closeModal);
        overlay.querySelector('#wins-modal-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        overlay.querySelector('#wins-modal-save').addEventListener('click', function() {
          var title = (overlay.querySelector('#wins-modal-title') || {}).value.trim();
          if (!title) {
            FreedomOS.toast('Title is required', 'error', 3000);
            return;
          }
          var wins = getWins();
          wins.push({
            id: FreedomOS.generateId(),
            title: title,
            category: (overlay.querySelector('#wins-modal-category') || {}).value || 'Other',
            date: (overlay.querySelector('#wins-modal-date') || {}).value || new Date().toISOString().split('T')[0],
            description: (overlay.querySelector('#wins-modal-desc') || {}).value.trim(),
            image: imageBase64 || null,
            projectId: ''
          });
          FreedomOS.mutate('wins', wins);
          triggerConfetti();
          closeModal();
        });
      }
    },

    onUnmount: function(container) {
      if (uiState.refreshListener) {
        uiState.refreshListener();
        uiState.refreshListener = null;
      }
      var modal = document.getElementById('wins-modal');
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      var confetti = document.querySelector('.confetti-container');
      if (confetti && confetti.parentNode) confetti.parentNode.removeChild(confetti);
    }
  };

  FreedomOS.registerModule(module);
})();