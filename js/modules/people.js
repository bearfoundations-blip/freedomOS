// ============================================================
// Freedom OS — People
// File: js/modules/people.js
// Depends: kernel/core.js, kernel/utils.js, kernel/ui.js, kernel/events.js, kernel/router.js
// Provides: people module (route: people)
// Last Updated: 2026-04-28
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

  const MODULE_NAME = 'people';
  const ROUTE_NAME = 'people';
  const CATEGORIES = ['collaborator', 'client', 'mentor', 'peer', 'other'];
  const INTERACTION_TYPES = ['call', 'email', 'meeting', 'dm'];

  let uiState = {
    search: '',
    categoryFilter: '',
    followUpFilter: '',
    refreshListener: null
  };

  // ─── Helpers ───

  function getPeople() {
    return FreedomOS.get('people') || [];
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

  function isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date(new Date().setHours(0, 0, 0, 0));
  }

  function isToday(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    var today = new Date();
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
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

  function getProjectName(projectId) {
    var p = getProjects().find(function(x) { return x.id === projectId; });
    return p ? p.name : '';
  }

  function filterPeople(people) {
    return people.filter(function(p) {
      if (uiState.categoryFilter && p.category !== uiState.categoryFilter) return false;
      if (uiState.followUpFilter) {
        if (uiState.followUpFilter === 'overdue' && !isOverdue(p.followUpDate)) return false;
        if (uiState.followUpFilter === 'today' && !isToday(p.followUpDate)) return false;
        if (uiState.followUpFilter === 'none' && p.followUpDate) return false;
      }
      if (uiState.search) {
        var term = uiState.search.toLowerCase();
        var text = ((p.name || '') + ' ' + (p.platform || '') + ' ' + (p.handle || '') + ' ' + (p.notes || '')).toLowerCase();
        if (!text.includes(term)) return false;
      }
      return true;
    });
  }

  function renderPersonCard(p, index) {
    var overdue = isOverdue(p.followUpDate);
    var today = isToday(p.followUpDate);
    var followUpClass = overdue ? 'overdue' : today ? 'today' : '';
    var followUpText = p.followUpDate ? formatDate(p.followUpDate) : 'No follow-up';
    var interactionCount = (p.interactions || []).length;
    var lastContact = p.lastContact ? formatDate(p.lastContact) : 'Never';
    var projectName = getProjectName(p.projectId);

    return '<div class="person-card ' + (p.category || 'other') + '" data-id="' + p.id + '" style="animation-delay: ' + (index * 50) + 'ms;">' +
      '<div class="person-header">' +
        '<div class="person-avatar">' + (p.name || '?').charAt(0).toUpperCase() + '</div>' +
        '<div class="person-meta">' +
          '<div class="person-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="person-platform">' + escapeHtml(p.platform || '') + (p.handle ? ' @' + escapeHtml(p.handle) : '') + '</div>' +
        '</div>' +
        '<span class="badge person-category ' + (p.category || 'other') + '">' + (p.category || 'other') + '</span>' +
      '</div>' +
      '<div class="person-body">' +
        '<div class="person-stat"><span class="stat-label">Last Contact</span><span class="stat-value">' + lastContact + '</span></div>' +
        '<div class="person-stat"><span class="stat-label">Follow-up</span><span class="stat-value ' + followUpClass + '">' + followUpText + '</span></div>' +
        '<div class="person-stat"><span class="stat-label">Interactions</span><span class="stat-value">' + interactionCount + '</span></div>' +
        (projectName ? '<div class="person-project">' + escapeHtml(projectName) + '</div>' : '') +
      '</div>' +
      '<div class="person-actions">' +
        '<button class="btn btn-sm btn-secondary view-btn" data-id="' + p.id + '">View</button>' +
        '<button class="btn btn-sm btn-primary interact-btn" data-id="' + p.id + '">+ Interaction</button>' +
      '</div>' +
    '</div>';
  }

  function renderPersonDetail(p) {
    var interactions = (p.interactions || []).slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var projectName = getProjectName(p.projectId);

    return '<div class="person-detail-overlay" id="people-detail-overlay">' +
      '<div class="person-detail-modal">' +
        '<div class="detail-header">' +
          '<div class="detail-avatar">' + (p.name || '?').charAt(0).toUpperCase() + '</div>' +
          '<div>' +
            '<h2>' + escapeHtml(p.name) + '</h2>' +
            '<div class="detail-sub">' + escapeHtml(p.platform || '') + (p.handle ? ' @' + escapeHtml(p.handle) : '') + '</div>' +
          '</div>' +
          '<button class="btn-icon detail-close" id="people-detail-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="detail-body">' +
          '<div class="detail-section">' +
            '<h4>Info</h4>' +
            '<div class="detail-info-grid">' +
              '<div><span>Category</span><span class="badge ' + (p.category || 'other') + '">' + (p.category || 'other') + '</span></div>' +
              '<div><span>URL</span><a href="' + escapeHtml(p.url || '#') + '" target="_blank" rel="noopener">' + escapeHtml(p.url || '—') + '</a></div>' +
              '<div><span>Follow-up</span><span class="' + (isOverdue(p.followUpDate) ? 'overdue' : '') + '">' + (p.followUpDate ? formatDate(p.followUpDate) : '—') + '</span></div>' +
              '<div><span>Notes</span><span>' + escapeHtml(p.notes || '—') + '</span></div>' +
              (projectName ? '<div><span>Project</span><span>' + escapeHtml(projectName) + '</span></div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="detail-section">' +
            '<h4>Interactions</h4>' +
            '<div class="interactions-timeline">' +
              (interactions.length === 0 ? '<p class="text-muted">No interactions yet.</p>' : interactions.map(function(intr, i) {
                return '<div class="timeline-item" style="animation-delay: ' + (i * 50) + 'ms;">' +
                  '<div class="timeline-dot"></div>' +
                  '<div class="timeline-content">' +
                    '<div class="timeline-header">' +
                      '<span class="timeline-type">' + intr.type + '</span>' +
                      '<span class="timeline-date">' + formatDate(intr.date) + '</span>' +
                    '</div>' +
                    '<p>' + escapeHtml(intr.notes || '') + '</p>' +
                  '</div>' +
                '</div>';
              }).join('')) +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="detail-footer">' +
          '<button class="btn btn-secondary" id="people-detail-edit">Edit</button>' +
          '<button class="btn btn-primary" id="people-detail-add-interaction">Add Interaction</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderAddEditModal(personId) {
    var person = personId ? getPeople().find(function(p) { return p.id === personId; }) : null;
    var projects = getProjects();

    return '<div class="modal-overlay active" id="people-modal">' +
      '<div class="modal">' +
        '<div class="modal-header">' +
          '<h3>' + (person ? 'Edit' : 'Add') + ' Contact</h3>' +
          '<button class="btn-icon modal-close" id="people-modal-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="form-group"><label>Name</label><input type="text" class="form-input" id="people-modal-name" value="' + (person ? escapeHtml(person.name) : '') + '"></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Platform</label><input type="text" class="form-input" id="people-modal-platform" value="' + (person ? escapeHtml(person.platform || '') : '') + '" placeholder="Twitter, LinkedIn, etc."></div>' +
            '<div class="form-group"><label>Handle</label><input type="text" class="form-input" id="people-modal-handle" value="' + (person ? escapeHtml(person.handle || '') : '') + '"></div>' +
          '</div>' +
          '<div class="form-group"><label>URL</label><input type="url" class="form-input" id="people-modal-url" value="' + (person ? escapeHtml(person.url || '') : '') + '"></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Category</label><select class="form-select" id="people-modal-category">' +
              CATEGORIES.map(function(c) { return '<option value="' + c + '"' + (person && person.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-group"><label>Follow-up Date</label><input type="date" class="form-input" id="people-modal-followup" value="' + (person ? person.followUpDate || '' : '') + '"></div>' +
          '</div>' +
          '<div class="form-group"><label>Notes</label><textarea class="form-textarea" id="people-modal-notes" rows="3">' + (person ? escapeHtml(person.notes || '') : '') + '</textarea></div>' +
          '<div class="form-group"><label>Associated Project</label><select class="form-select" id="people-modal-project"><option value="">None</option>' +
            projects.map(function(pr) { return '<option value="' + pr.id + '"' + (person && person.projectId === pr.id ? ' selected' : '') + '>' + escapeHtml(pr.name) + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-secondary" id="people-modal-cancel">Cancel</button>' +
          '<button class="btn btn-primary" id="people-modal-save" data-id="' + (personId || '') + '">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderInteractionModal(personId) {
    return '<div class="modal-overlay active" id="people-interaction-modal">' +
      '<div class="modal modal-sm">' +
        '<div class="modal-header">' +
          '<h3>Log Interaction</h3>' +
          '<button class="btn-icon modal-close" id="people-int-modal-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Type</label><select class="form-select" id="people-int-type">' +
              INTERACTION_TYPES.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-group"><label>Date</label><input type="date" class="form-input" id="people-int-date" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
          '</div>' +
          '<div class="form-group"><label>Notes</label><textarea class="form-textarea" id="people-int-notes" rows="3" placeholder="What happened?"></textarea></div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-secondary" id="people-int-cancel">Cancel</button>' +
          '<button class="btn btn-primary" id="people-int-save" data-person-id="' + personId + '">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function importFromCSV(text) {
    var lines = text.trim().split('\n');
    if (lines.length < 2) return;
    var newPeople = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      var values = [];
      var val = '', inQuotes = false;
      for (var j = 0; j < line.length; j++) {
        var ch = line[j];
        if (ch === '"') {
          if (line[j + 1] === '"') { val += '"'; j++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
          values.push(val.trim());
          val = '';
        } else {
          val += ch;
        }
      }
      values.push(val.trim());
      if (values.length >= 4) {
        newPeople.push({
          id: FreedomOS.generateId(),
          name: values[0] || 'Unknown',
          platform: values[1] || '',
          handle: values[2] || '',
          category: CATEGORIES.indexOf(values[3]) >= 0 ? values[3] : 'other',
          url: values[4] || '',
          notes: values[5] || '',
          lastContact: values[6] || '',
          followUpDate: values[7] || '',
          interactions: []
        });
      }
    }
    if (newPeople.length > 0) {
      var current = getPeople();
      FreedomOS.mutate('people', current.concat(newPeople));
      FreedomOS.toast('Imported ' + newPeople.length + ' contacts', 'success', 3000);
    }
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
      var people = getPeople();
      var filtered = filterPeople(people);

      var emptyState = '';
      if (people.length === 0) {
        emptyState = '<div class="empty-state">' +
          '<svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="#14b8a6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.2">' +
            '<circle cx="48" cy="28" r="6"/>' +
            '<circle cx="24" cy="56" r="6"/>' +
            '<circle cx="72" cy="56" r="6"/>' +
            '<circle cx="48" cy="80" r="6"/>' +
            '<path d="M48 34L24 50"/>' +
            '<path d="M48 34L72 50"/>' +
            '<path d="M48 34L48 74"/>' +
            '<path d="M24 56L72 56"/>' +
            '<path d="M24 56L48 74"/>' +
            '<path d="M72 56L48 74"/>' +
          '</svg>' +
          '<h3>No contacts yet</h3>' +
          '<p>Build your network.</p>' +
          '<button class="btn btn-primary" id="people-add-first">Add First Contact</button>' +
        '</div>';
      } else if (filtered.length === 0) {
        emptyState = '<div class="empty-state">' +
          '<div class="empty-icon">🔍</div>' +
          '<h3>No matches</h3>' +
          '<p>Try adjusting your filters.</p>' +
        '</div>';
      }

      return '<div class="view-people">' +
        '<div class="view-header">' +
          '<h2>People</h2>' +
          '<div class="header-actions">' +
            '<button class="btn btn-secondary" id="people-import-btn">Import CSV</button>' +
            '<input type="file" id="people-import-file" accept=".csv" style="display:none;">' +
            '<button class="btn btn-primary" id="people-add-btn">+ Add Contact</button>' +
          '</div>' +
        '</div>' +
        '<div class="people-toolbar">' +
          '<input type="text" class="form-input" id="people-search" placeholder="Search contacts..." value="' + escapeHtml(uiState.search) + '">' +
          '<select class="form-select" id="people-filter-category">' +
            '<option value="">All Categories</option>' +
            CATEGORIES.map(function(c) { return '<option value="' + c + '"' + (uiState.categoryFilter === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
          '</select>' +
          '<select class="form-select" id="people-filter-followup">' +
            '<option value="">All Follow-ups</option>' +
            '<option value="overdue"' + (uiState.followUpFilter === 'overdue' ? ' selected' : '') + '>Overdue</option>' +
            '<option value="today"' + (uiState.followUpFilter === 'today' ? ' selected' : '') + '>Today</option>' +
            '<option value="none"' + (uiState.followUpFilter === 'none' ? ' selected' : '') + '>No Follow-up</option>' +
          '</select>' +
        '</div>' +
        '<div class="people-grid">' +
          filtered.map(function(p, i) { return renderPersonCard(p, i); }).join('') +
        '</div>' +
        emptyState +
      '</div>';
    },

    onMount: function(container) {
      var self = this;

      function refreshGrid() {
        var people = getPeople();
        var filtered = filterPeople(people);
        var grid = container.querySelector('.people-grid');
        if (!grid) return;
        if (filtered.length === 0 && people.length > 0) {
          grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">' +
            '<div class="empty-icon">🔍</div><h3>No matches</h3><p>Try adjusting your filters.</p></div>';
        } else {
          grid.innerHTML = filtered.map(function(p, i) { return renderPersonCard(p, i); }).join('');
        }
        attachCardListeners(grid);
      }

      function attachCardListeners(scope) {
        scope.querySelectorAll('.view-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var person = getPeople().find(function(p) { return p.id === this.dataset.id; }.bind(this));
            if (person) openDetail(person);
          });
        });
        scope.querySelectorAll('.interact-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            openInteractionModal(this.dataset.id);
          });
        });
      }

      attachCardListeners(container);

      // Search
      var searchInput = container.querySelector('#people-search');
      if (searchInput) {
        searchInput.addEventListener('input', FreedomOS.debounce(function() {
          uiState.search = this.value;
          refreshGrid();
        }, 300));
      }

      // Filters
      var catFilter = container.querySelector('#people-filter-category');
      if (catFilter) {
        catFilter.addEventListener('change', function() {
          uiState.categoryFilter = this.value;
          refreshGrid();
        });
      }
      var fuFilter = container.querySelector('#people-filter-followup');
      if (fuFilter) {
        fuFilter.addEventListener('change', function() {
          uiState.followUpFilter = this.value;
          refreshGrid();
        });
      }

      // Add buttons
      var addBtn = container.querySelector('#people-add-btn');
      if (addBtn) addBtn.addEventListener('click', function() { openPersonModal(); });
      var addFirstBtn = container.querySelector('#people-add-first');
      if (addFirstBtn) addFirstBtn.addEventListener('click', function() { openPersonModal(); });

      // Import
      var importBtn = container.querySelector('#people-import-btn');
      var importFile = container.querySelector('#people-import-file');
      if (importBtn && importFile) {
        importBtn.addEventListener('click', function() { importFile.click(); });
        importFile.addEventListener('change', function(e) {
          var file = e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(ev) {
            importFromCSV(ev.target.result);
            importFile.value = '';
          };
          reader.readAsText(file);
        });
      }

      function openPersonModal(personId) {
        var modalHtml = renderAddEditModal(personId);
        var wrap = document.createElement('div');
        wrap.innerHTML = modalHtml;
        document.body.appendChild(wrap.firstElementChild);

        var overlay = document.getElementById('people-modal');
        function closeModal() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        overlay.querySelector('#people-modal-close').addEventListener('click', closeModal);
        overlay.querySelector('#people-modal-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        overlay.querySelector('#people-modal-save').addEventListener('click', function() {
          var id = this.dataset.id || FreedomOS.generateId();
          var name = (overlay.querySelector('#people-modal-name') || {}).value.trim();
          if (!name) {
            FreedomOS.toast('Name is required', 'error', 3000);
            return;
          }
          var people = getPeople();
          var idx = people.findIndex(function(p) { return p.id === id; });
          var newPerson = {
            id: id,
            name: name,
            platform: (overlay.querySelector('#people-modal-platform') || {}).value.trim(),
            handle: (overlay.querySelector('#people-modal-handle') || {}).value.trim(),
            url: (overlay.querySelector('#people-modal-url') || {}).value.trim(),
            category: (overlay.querySelector('#people-modal-category') || {}).value || 'other',
            followUpDate: (overlay.querySelector('#people-modal-followup') || {}).value || '',
            notes: (overlay.querySelector('#people-modal-notes') || {}).value.trim(),
            projectId: (overlay.querySelector('#people-modal-project') || {}).value || '',
            lastContact: idx >= 0 ? people[idx].lastContact : '',
            interactions: idx >= 0 ? (people[idx].interactions || []) : []
          };
          if (idx >= 0) people[idx] = newPerson;
          else people.push(newPerson);
          FreedomOS.mutate('people', people);
          closeModal();
        });
      }

      function openDetail(person) {
        var detailHtml = renderPersonDetail(person);
        var wrap = document.createElement('div');
        wrap.innerHTML = detailHtml;
        document.body.appendChild(wrap.firstElementChild);

        var overlay = document.getElementById('people-detail-overlay');
        function closeDetail() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        overlay.querySelector('#people-detail-close').addEventListener('click', closeDetail);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeDetail(); });

        overlay.querySelector('#people-detail-edit').addEventListener('click', function() {
          closeDetail();
          openPersonModal(person.id);
        });
        overlay.querySelector('#people-detail-add-interaction').addEventListener('click', function() {
          closeDetail();
          openInteractionModal(person.id);
        });
      }

      function openInteractionModal(personId) {
        var modalHtml = renderInteractionModal(personId);
        var wrap = document.createElement('div');
        wrap.innerHTML = modalHtml;
        document.body.appendChild(wrap.firstElementChild);

        var overlay = document.getElementById('people-interaction-modal');
        function closeModal() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        overlay.querySelector('#people-int-modal-close').addEventListener('click', closeModal);
        overlay.querySelector('#people-int-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        overlay.querySelector('#people-int-save').addEventListener('click', function() {
          var type = (overlay.querySelector('#people-int-type') || {}).value || 'call';
          var date = (overlay.querySelector('#people-int-date') || {}).value || new Date().toISOString().split('T')[0];
          var notes = (overlay.querySelector('#people-int-notes') || {}).value.trim();
          var people = getPeople();
          var person = people.find(function(p) { return p.id === personId; });
          if (!person) return;
          person.interactions = person.interactions || [];
          person.interactions.push({ type: type, date: date, notes: notes });
          person.lastContact = date;
          FreedomOS.mutate('people', people);
          closeModal();
        });
      }
    },

    onUnmount: function(container) {
      if (uiState.refreshListener) {
        uiState.refreshListener();
        uiState.refreshListener = null;
      }
      var modals = ['people-modal', 'people-detail-overlay', 'people-interaction-modal'];
      modals.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    }
  };

  FreedomOS.registerModule(module);
})();