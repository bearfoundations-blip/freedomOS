// ============================================================
// Freedom OS — Projects
// File: js/modules/projects.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js, kernel/router.js
// Provides: projects module (project list, CRUD, filters, search, swipe)
// Last Updated: 2026-05-10
// ============================================================

(function() {
  'use strict';

  const MODULE_NAME = 'projects';
  const ROUTE_NAME = 'projects';

  const PROJECT_MODELS = ['AI Automation','Dropshipping','SaaS','Content','Agency','E-commerce','Info Product','Other'];
  const PROJECT_STATUSES = ['active','killed','pivoted','scaled','paused'];
  const STATUS_COLORS = { active:'var(--status-active)', killed:'var(--status-killed)', pivoted:'var(--status-pivoted)', scaled:'var(--status-scaled)', paused:'var(--status-paused)' };

  let _unsubscribers = [];
  let _searchDebounce = null;
  let _editingProjectId = null;

  function _getProjects() { return FreedomOS.get('projects') || []; }

  function _formatDaysRemaining(killDate) {
    if (!killDate) return '—';
    var diff = new Date(killDate) - new Date();
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    return days + 'd left';
  }

  function _getProjectProgress(project) {
    if (!project.milestones || project.milestones.length === 0) return 0;
    var completed = project.milestones.filter(function(m) { return m.status === 'completed'; }).length;
    return Math.round((completed / project.milestones.length) * 100);
  }

  function _renderProjectCard(project) {
    var progress = _getProjectProgress(project);
    var daysRemaining = _formatDaysRemaining(project.killDate);
    var revenue = project.finances ? project.finances.revenue : 0;
    var statusColor = STATUS_COLORS[project.status] || 'var(--color-text-muted)';

    return (
      '<div class="project-card glow-card reveal-scale" data-project-id="' + FreedomOS.escapeHtml(project.id) + '" style="border-left: 3px solid ' + statusColor + '">' +
        '<div class="project-card-header">' +
          '<h3 class="project-card-name">' + FreedomOS.escapeHtml(project.name) + '</h3>' +
          '<div class="project-card-badges">' +
            '<span class="badge badge-model">' + FreedomOS.escapeHtml(project.model) + '</span>' +
            '<span class="badge badge-status" style="background: ' + statusColor + '20; color: ' + statusColor + '; border: 1px solid ' + statusColor + '40">' + FreedomOS.escapeHtml(project.status) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="project-card-meta">' +
          '<span class="project-card-days">' + FreedomOS.escapeHtml(daysRemaining) + '</span>' +
          '<span class="project-card-revenue">' + FreedomOS.formatMoney(revenue) + '</span>' +
        '</div>' +
        '<div class="project-card-progress">' +
          '<div class="progress-bar-track">' +
            '<div class="progress-bar-fill" style="width: ' + progress + '%; background: ' + statusColor + '"></div>' +
          '</div>' +
          '<span class="progress-bar-label">' + progress + '%</span>' +
        '</div>' +
        '<div class="project-card-actions">' +
          '<button class="btn btn-icon btn-duplicate" data-action="duplicate" data-id="' + FreedomOS.escapeHtml(project.id) + '" aria-label="Duplicate project">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
          '</button>' +
          '<button class="btn btn-icon btn-archive" data-action="archive" data-id="' + FreedomOS.escapeHtml(project.id) + '" aria-label="Archive project">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>' +
          '</button>' +
        '</div>' +
        '<div class="project-card-hover-actions">' +
          '<button class="btn btn-icon btn-edit" data-action="edit" data-id="' + FreedomOS.escapeHtml(project.id) + '" aria-label="Edit project">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
          '</button>' +
          '<button class="btn btn-icon btn-archive" data-action="archive" data-id="' + FreedomOS.escapeHtml(project.id) + '" aria-label="Archive project">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderProjectsList(projects) {
    if (projects.length === 0) {
      return (
        '<div class="empty-state">' +
          '<div class="empty-state-icon">' +
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>' +
          '</div>' +
          '<h3 class="empty-state-title">No projects yet</h3>' +
          '<p class="empty-state-desc">Create your first experiment to start tracking.</p>' +
          '<button class="btn btn-primary btn-add-first magnetic-hover" data-action="new-project">Create Project</button>' +
        '</div>'
      );
    }

    var gridHtml = '<div class="projects-grid stagger-reveal">';
    projects.forEach(function(p, i) {
      gridHtml += '<div class="project-card-wrapper">' + _renderProjectCard(p) + '</div>';
    });
    gridHtml += '</div>';
    return gridHtml;
  }

  function _renderFilters() {
    var modelOptions = '';
    PROJECT_MODELS.forEach(function(m) {
      modelOptions += '<option value="' + m + '">' + m + '</option>';
    });

    var statusOptions = '';
    PROJECT_STATUSES.forEach(function(s) {
      statusOptions += '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    });

    return (
      '<div class="projects-toolbar reveal-up" data-reveal-delay="80">' +
        '<div class="projects-search" style="flex-grow: 1; width: 50%;">' +
          '<input type="text" class="input input-search" id="project-search" placeholder="Search projects..." autocomplete="off">' +
        '</div>' +
        '<div class="projects-filters">' +
          '<select class="select select-filter" id="filter-status" style="width: auto; min-width: 0;"><option value="">All Statuses</option>' + statusOptions + '</select>' +
          '<select class="select select-filter" id="filter-model" style="width: auto; min-width: 0;"><option value="">All Models</option>' + modelOptions + '</select>' +
          '<select class="select select-sort" id="sort-projects" style="width: auto; min-width: 0;">' +
            '<option value="name">Sort by Name</option>' +
            '<option value="date">Sort by Date</option>' +
            '<option value="revenue">Sort by Revenue</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary btn-create magnetic-hover" data-action="new-project">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
          'New Project' +
        '</button>' +
      '</div>'
    );
  }

  function _buildModalContent(project) {
    var p = project || {};
    _editingProjectId = p.id || null;

    var modelOptions = '';
    PROJECT_MODELS.forEach(function(m) {
      modelOptions += '<option value="' + m + '"' + (p.model === m ? ' selected' : '') + '>' + m + '</option>';
    });

    var statusOptions = '';
    PROJECT_STATUSES.forEach(function(s) {
      statusOptions += '<option value="' + s + '"' + (p.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    });

    return (
      '<div class="form">' +
        '<div class="form-group">' +
          '<label class="form-label" for="project-name">Name *</label>' +
          '<input type="text" class="input" id="project-name" value="' + FreedomOS.escapeHtml(p.name || '') + '" placeholder="Project name">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="project-model">Business Model</label>' +
          '<select class="select" id="project-model">' + modelOptions + '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="project-hypothesis">Hypothesis</label>' +
          '<textarea class="input input-textarea" id="project-hypothesis" rows="3" placeholder="What are you testing?">' + FreedomOS.escapeHtml(p.hypothesis || '') + '</textarea>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="project-killDate">Kill Date</label>' +
          '<input type="date" class="input" id="project-killDate" value="' + FreedomOS.escapeHtml(p.killDate || '') + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="project-status">Status</label>' +
          '<select class="select" id="project-status">' + statusOptions + '</select>' +
        '</div>' +
      '</div>'
    );
  }

  function _getFilteredProjects() {
    var projects = _getProjects();
    var searchEl = document.getElementById('project-search');
    var statusEl = document.getElementById('filter-status');
    var modelEl = document.getElementById('filter-model');
    var sortEl = document.getElementById('sort-projects');

    var search = searchEl ? searchEl.value.toLowerCase().trim() : '';
    var status = statusEl ? statusEl.value : '';
    var model = modelEl ? modelEl.value : '';
    var sort = sortEl ? sortEl.value : 'name';

    if (search) {
      projects = projects.filter(function(p) {
        return (p.name && p.name.toLowerCase().includes(search)) ||
               (p.hypothesis && p.hypothesis.toLowerCase().includes(search));
      });
    }
    if (status) projects = projects.filter(function(p) { return p.status === status; });
    if (model) projects = projects.filter(function(p) { return p.model === model; });

    projects.sort(function(a, b) {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'date') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sort === 'revenue') {
        var revA = (a.finances && a.finances.revenue) || 0;
        var revB = (b.finances && b.finances.revenue) || 0;
        return revB - revA;
      }
      return 0;
    });

    return projects;
  }

  function _refreshGrid() {
    var gridContainer = document.getElementById('projects-grid-container');
    if (!gridContainer) return;
    gridContainer.innerHTML = _renderProjectsList(_getFilteredProjects());
    FreedomOS.animate.initView(gridContainer);
  }

  function _saveFromModal() {
    var modalOverlay = document.getElementById('modal-overlay');
    var container = modalOverlay && !modalOverlay.classList.contains('hidden') ? modalOverlay : document;

    var nameEl = container.querySelector('#project-name');
    var modelEl = container.querySelector('#project-model');
    var hypothesisEl = container.querySelector('#project-hypothesis');
    var killDateEl = container.querySelector('#project-killDate');
    var statusEl = container.querySelector('#project-status');

    if (!nameEl) {
      FreedomOS.toast('Form not found. Try again.', 'error');
      return false;
    }

    var name = nameEl.value.trim();
    if (!name) {
      FreedomOS.toast('Project name is required', 'error');
      nameEl.focus();
      return false;
    }

    var projectData = {
      name: name,
      model: modelEl ? modelEl.value : PROJECT_MODELS[0],
      hypothesis: hypothesisEl ? hypothesisEl.value.trim() : '',
      killDate: killDateEl ? killDateEl.value : '',
      status: statusEl ? statusEl.value : 'active'
    };

    if (_editingProjectId) {
      var projects = _getProjects();
      var idx = projects.findIndex(function(p) { return p.id === _editingProjectId; });
      if (idx !== -1) {
        projects[idx] = Object.assign({}, projects[idx], projectData, { updatedAt: new Date().toISOString() });
        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('Project updated', 'success');
      }
      _editingProjectId = null;
    } else {
      var newProject = Object.assign({}, projectData, {
        id: FreedomOS.generateId(),
        finances: { revenue: 0, costs: 0, monthly: [] },
        milestones: [],
        contentPieces: [],
        files: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      var projects = _getProjects();
      projects.push(newProject);
      FreedomOS.mutate('projects', projects);
      FreedomOS.toast('Project created', 'success');
    }

    _refreshGrid();
    return true;
  }

  function _openModal(project) {
    var isEdit = !!project;
    var content = _buildModalContent(project);

    FreedomOS.modal({
      title: isEdit ? 'Edit Project' : 'New Project',
      content: content,
      confirmText: isEdit ? 'Save Changes' : 'Create Project',
      cancelText: 'Cancel',
      onConfirm: _saveFromModal
    });
  }

  function _duplicateProject(id) {
    var projects = _getProjects();
    var original = projects.find(function(p) { return p.id === id; });
    if (!original) return;

    var copy = FreedomOS.deepClone(original);
    copy.id = FreedomOS.generateId();
    copy.name = copy.name + ' (Copy)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    copy.status = 'active';

    projects.push(copy);
    FreedomOS.mutate('projects', projects);
    FreedomOS.toast('Project duplicated', 'success');
    _refreshGrid();
  }

  function _archiveProject(id) {
    FreedomOS.confirm('Archive this project?', function() {
      var projects = _getProjects();
      var idx = projects.findIndex(function(p) { return p.id === id; });
      if (idx !== -1) {
        projects[idx].status = 'killed';
        projects[idx].updatedAt = new Date().toISOString();
        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('Project archived', 'warning');
        _refreshGrid();
      }
    });
  }

  function _handleAction(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      case 'new-project':
        _openModal();
        break;
      case 'edit':
        if (id) {
          var projects = _getProjects();
          var project = projects.find(function(p) { return p.id === id; });
          if (project) _openModal(project);
        }
        break;
      case 'duplicate':
        if (id) _duplicateProject(id);
        break;
      case 'archive':
        if (id) _archiveProject(id);
        break;
    }
  }

  function _handleCardClick(e) {
    var card = e.target.closest('.project-card');
    if (!card) return;
    if (e.target.closest('.btn-icon') || e.target.closest('.project-card-actions') || e.target.closest('.project-card-hover-actions')) return;
    var id = card.dataset.projectId;
    if (id) FreedomOS.navigate('warRoom', { projectId: id });
  }

  function _attachListeners(container) {
    container.addEventListener('click', _handleAction);
    container.addEventListener('click', _handleCardClick);

    var searchEl = document.getElementById('project-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(_refreshGrid, 200);
      });
    }

    ['filter-status', 'filter-model', 'sort-projects'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', _refreshGrid);
    });
  }

  function _attachSwipeHandlers(container) {
    container.querySelectorAll('.project-card').forEach(function(card) {
      var startX = 0, currentX = 0, isDragging = false;

      function onTouchStart(e) {
        startX = e.touches[0].clientX;
        isDragging = true;
        card.style.transition = 'none';
      }
      function onTouchMove(e) {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        var diff = currentX - startX;
        if (diff < 0) card.style.transform = 'translateX(' + diff + 'px)';
      }
      function onTouchEnd() {
        if (!isDragging) return;
        isDragging = false;
        var diff = currentX - startX;
        card.style.transition = 'transform var(--transition-base)';
        if (diff < -100) {
          card.style.transform = 'translateX(-120%)';
          setTimeout(function() {
            var id = card.dataset.projectId;
            if (id) _archiveProject(id);
          }, 250);
        } else {
          card.style.transform = 'translateX(0)';
        }
      }

      card.addEventListener('touchstart', onTouchStart, { passive: true });
      card.addEventListener('touchmove', onTouchMove, { passive: true });
      card.addEventListener('touchend', onTouchEnd);
      card.addEventListener('touchcancel', onTouchEnd);

      card._swipeCleanup = function() {
        card.removeEventListener('touchstart', onTouchStart);
        card.removeEventListener('touchmove', onTouchMove);
        card.removeEventListener('touchend', onTouchEnd);
        card.removeEventListener('touchcancel', onTouchEnd);
      };
    });
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'ui', 'utils', 'events', 'router'],

    init: function() {},

    render: function(params) {
      return (
        '<div class="view-projects">' +
          '<div class="view-header reveal-up">' +
            '<h1 class="view-title">Projects</h1>' +
            '<p class="view-subtitle">Experiments & Business Models</p>' +
          '</div>' +
          _renderFilters() +
          '<div id="projects-grid-container" class="projects-grid-container">' +
            _renderProjectsList(_getProjects()) +
          '</div>' +
        '</div>'
      );
    },

    onMount: function(container) {
      _attachListeners(container);
      _attachSwipeHandlers(container);
      FreedomOS.animate.initView(container);

      var unsub = FreedomOS.on('state:changed', function(data) {
        if (data && data.path && data.path.startsWith('projects')) {
          _refreshGrid();
        }
      });
      _unsubscribers.push(unsub);
    },

    onUnmount: function(container) {
      _unsubscribers.forEach(function(fn) { fn(); });
      _unsubscribers = [];
      clearTimeout(_searchDebounce);
      _editingProjectId = null;

      if (container) {
        container.querySelectorAll('.project-card').forEach(function(card) {
          if (card._swipeCleanup) card._swipeCleanup();
        });
      }
    }
  });
})();