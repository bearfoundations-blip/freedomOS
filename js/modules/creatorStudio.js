// ============================================================
// Freedom OS — Creator Studio
// File: js/modules/creatorStudio.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js
// Provides: Creator Studio module — content pipeline, platforms, hooks, scripts, calendar, performance
// Last Updated: 2026-05-08
// ============================================================
//
// CONNECTION CONTRACT:
// - This module registers itself via FreedomOS.registerModule()
// - It expects FreedomOS.state to be initialized
// - It emits events via FreedomOS.emit() and listens via FreedomOS.on()
// - It uses FreedomOS.mutate() for ALL state changes
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

  const MODULE_NAME = 'creatorStudio';
  const ROUTE_NAME = 'creatorStudio';

  const PIPELINE_STATUSES = ['Idea', 'Writing', 'Recording', 'Editing', 'Posted'];
  const PLATFORM_OPTIONS = ['TikTok', 'YouTube', 'Twitter/X', 'Instagram', 'LinkedIn', 'Other'];

  let _listeners = [];
  let _intervals = [];
  let _timeouts = [];
  let _canvasCharts = [];

  function _addListener(element, event, handler) {
    element.addEventListener(event, handler);
    _listeners.push({ element: element, event: event, handler: handler });
  }

  function _clearListeners() {
    _listeners.forEach(function(l) {
      l.element.removeEventListener(l.event, l.handler);
    });
    _listeners = [];
  }

  function _clearIntervals() {
    _intervals.forEach(function(id) { clearInterval(id); });
    _intervals = [];
  }

  function _clearTimeouts() {
    _timeouts.forEach(function(id) { clearTimeout(id); });
    _timeouts = [];
  }

  function _destroyCharts() {
    _canvasCharts = [];
  }

  function _generateId() {
    return FreedomOS.generateId();
  }

  function _getCreatorStudio() {
    return FreedomOS.get('creatorStudio') || { platforms: [], contentPipeline: [], hooks: [], scripts: [] };
  }

  function _getProjects() {
    return FreedomOS.get('projects') || [];
  }

  function _escape(str) {
    return FreedomOS.escapeHtml(str || '');
  }

  function _formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString();
  }

  // --- Sub-renderers ---

  function _renderPipeline() {
    var studio = _getCreatorStudio();
    var pipeline = studio.contentPipeline || [];
    var projects = _getProjects();

    var html = '<div class="cs-section cs-pipeline">';
    html += '<div class="cs-section-header"><h2 class="cs-section-title">Content Pipeline</h2>';
    html += '<button class="btn btn-primary cs-add-btn" data-action="add-pipeline-item" aria-label="Add content piece">+ New Piece</button></div>';
    html += '<div class="cs-kanban">';

    PIPELINE_STATUSES.forEach(function(status) {
      var items = pipeline.filter(function(p) { return p.status === status; });
      html += '<div class="cs-kanban-col" data-status="' + _escape(status) + '">';
      html += '<div class="cs-kanban-header"><span class="cs-kanban-count">' + items.length + '</span><span class="cs-kanban-title">' + _escape(status) + '</span></div>';
      html += '<div class="cs-kanban-cards">';
      if (items.length === 0) {
        html += '<div class="cs-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg><p>No items in ' + _escape(status) + '</p></div>';
      } else {
        items.forEach(function(item) {
          var project = projects.find(function(p) { return p.id === item.projectId; });
          var projectName = project ? project.name : 'No project';
          html += '<div class="cs-card cs-pipeline-card" draggable="true" data-id="' + _escape(item.id) + '">';
          html += '<div class="cs-card-platform">' + _escape(item.platform) + '</div>';
          html += '<div class="cs-card-hook">' + _escape(item.hook) + '</div>';
          html += '<div class="cs-card-meta"><span class="cs-card-project">' + _escape(projectName) + '</span>';
          if (item.views) {
            html += '<span class="cs-card-views">' + _formatNumber(item.views) + ' views</span>';
          }
          html += '</div>';
          html += '<div class="cs-card-actions">';
          html += '<button class="cs-card-btn" data-action="edit-pipeline" data-id="' + _escape(item.id) + '" aria-label="Edit">Edit</button>';
          html += '<button class="cs-card-btn cs-card-btn-danger" data-action="delete-pipeline" data-id="' + _escape(item.id) + '" aria-label="Delete">&times;</button>';
          html += '</div>';
          html += '</div>';
        });
      }
      html += '</div></div>';
    });

    html += '</div></div>';
    return html;
  }

  function _renderPlatforms() {
    var studio = _getCreatorStudio();
    var platforms = studio.platforms || [];

    var html = '<div class="cs-section cs-platforms">';
    html += '<div class="cs-section-header"><h2 class="cs-section-title">Platforms</h2>';
    html += '<button class="btn btn-primary cs-add-btn" data-action="add-platform" aria-label="Add platform">+ Add Platform</button></div>';

    if (platforms.length === 0) {
      html += '<div class="cs-empty-state cs-empty-large"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg><h3>No platforms yet</h3><p>Track your social media presence and follower growth.</p><button class="btn btn-primary" data-action="add-platform">Add your first platform</button></div>';
      html += '<div class="cs-platforms-grid" style="margin-top:var(--space-lg);opacity:0.3;">';
      for (var wf = 0; wf < 3; wf++) {
        html += '<div class="cs-platform-card" style="border:2px dashed var(--color-border);background:transparent;min-height:160px;display:flex;align-items:center;justify-content:center;">';
        html += '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="cs-platforms-grid">';
      platforms.forEach(function(platform) {
        html += '<div class="cs-platform-card">';
        html += '<div class="cs-platform-header">';
        html += '<h3 class="cs-platform-name">' + _escape(platform.name) + '</h3>';
        html += '<div class="cs-platform-actions">';
        html += '<button class="cs-icon-btn" data-action="edit-platform" data-id="' + _escape(platform.name) + '" aria-label="Edit platform" style="width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--color-text-secondary);cursor:pointer;transition:background 150ms;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
        html += '<button class="cs-icon-btn cs-icon-btn-danger" data-action="delete-platform" data-id="' + _escape(platform.name) + '" aria-label="Delete platform" style="width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--color-danger);cursor:pointer;transition:background 150ms;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>';
        html += '</div></div>';
        html += '<div class="cs-platform-handle">' + _escape(platform.handle) + '</div>';
        if (platform.url) {
          html += '<a href="' + _escape(platform.url) + '" target="_blank" rel="noopener" class="cs-platform-link">' + _escape(platform.url) + '</a>';
        }
        html += '<div class="cs-platform-followers"><span class="cs-followers-number" style="font-family:var(--font-mono);font-size:1.5rem;font-weight:700;">' + _formatNumber(platform.followers) + '</span><span class="cs-followers-label">followers</span></div>';
        html += '<div class="cs-platform-chart"><canvas class="cs-follower-chart" data-platform="' + _escape(platform.name) + '" width="280" height="100"></canvas></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function _renderHooks() {
    var studio = _getCreatorStudio();
    var hooks = studio.hooks || [];

    var html = '<div class="cs-section cs-hooks">';
    html += '<div class="cs-section-header"><h2 class="cs-section-title">Hook Library</h2>';
    html += '<button class="btn btn-primary cs-add-btn" data-action="add-hook" aria-label="Add hook">+ Add Hook</button></div>';

    if (hooks.length === 0) {
      html += '<div class="cs-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg><p>No hooks saved yet. Save your best openers here.</p></div>';
    } else {
      html += '<div class="cs-hooks-grid">';
      hooks.forEach(function(hook) {
        var usedClass = hook.used ? 'cs-hook-used' : 'cs-hook-unused';
        var perf = hook.performance || 0;
        var perfStars = '';
        for (var i = 1; i <= 5; i++) {
          perfStars += '<span class="cs-star' + (i <= perf ? ' cs-star-filled' : '') + '">&#9733;</span>';
        }
        html += '<div class="cs-hook-card ' + usedClass + '">';
        html += '<div class="cs-hook-text">' + _escape(hook.text) + '</div>';
        html += '<div class="cs-hook-meta">';
        html += '<div class="cs-hook-performance" title="Performance rating">' + perfStars + '</div>';
        html += '<div class="cs-hook-status">' + (hook.used ? 'Used' : 'Unused') + '</div>';
        html += '</div>';
        html += '<div class="cs-hook-actions">';
        html += '<button class="cs-card-btn" data-action="toggle-hook-used" data-id="' + _escape(hook.id) + '">' + (hook.used ? 'Mark Unused' : 'Mark Used') + '</button>';
        html += '<button class="cs-card-btn" data-action="rate-hook" data-id="' + _escape(hook.id) + '">Rate</button>';
        html += '<button class="cs-card-btn cs-card-btn-danger" data-action="delete-hook" data-id="' + _escape(hook.id) + '">&times;</button>';
        html += '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function _renderScripts() {
    var studio = _getCreatorStudio();
    var scripts = studio.scripts || [];
    var projects = _getProjects();

    var html = '<div class="cs-section cs-scripts">';
    html += '<div class="cs-section-header"><h2 class="cs-section-title">Scripts</h2>';
    html += '<button class="btn btn-primary cs-add-btn" data-action="add-script" aria-label="Add script">+ New Script</button></div>';

    if (scripts.length === 0) {
      html += '<div class="cs-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg><p>No scripts yet. Write and store your content scripts here.</p></div>';
    } else {
      html += '<div class="cs-scripts-list">';
      scripts.forEach(function(script) {
        var project = projects.find(function(p) { return p.id === script.projectId; });
        var projectName = project ? project.name : 'Unassigned';
        var wordCount = script.content ? script.content.trim().split(/\s+/).length : 0;
        html += '<div class="cs-script-card">';
        html += '<div class="cs-script-header">';
        html += '<h3 class="cs-script-title">' + _escape(script.title) + '</h3>';
        html += '<span class="cs-script-project">' + _escape(projectName) + '</span>';
        html += '</div>';
        html += '<div class="cs-script-preview">' + _escape(script.content ? script.content.substring(0, 120) + (script.content.length > 120 ? '...' : '') : '') + '</div>';
        html += '<div class="cs-script-meta"><span class="cs-script-wc">' + wordCount + ' words</span><span class="cs-script-status">' + _escape(script.status || 'Draft') + '</span></div>';
        html += '<div class="cs-script-actions">';
        html += '<button class="cs-card-btn" data-action="edit-script" data-id="' + _escape(script.id) + '">Edit</button>';
        html += '<button class="cs-card-btn cs-card-btn-danger" data-action="delete-script" data-id="' + _escape(script.id) + '">&times;</button>';
        html += '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function _renderCalendar() {
    var studio = _getCreatorStudio();
    var pipeline = studio.contentPipeline || [];

    var today = new Date();
    var startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    var html = '<div class="cs-section cs-calendar">';
    html += '<div class="cs-section-header"><h2 class="cs-section-title">Content Calendar</h2></div>';
    html += '<div class="cs-calendar-grid">';

    for (var i = 0; i < 7; i++) {
      var date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      var dateStr = date.toISOString().split('T')[0];
      var isToday = date.toDateString() === today.toDateString();
      var dayItems = pipeline.filter(function(p) {
        return p.postedAt && p.postedAt.startsWith(dateStr);
      });

      html += '<div class="cs-calendar-day' + (isToday ? ' cs-calendar-today' : '') + '">';
      html += '<div class="cs-calendar-day-header"><span class="cs-day-name">' + days[i] + '</span><span class="cs-day-date">' + date.getDate() + '</span></div>';
      html += '<div class="cs-calendar-items">';
      if (dayItems.length === 0) {
        html += '<div class="cs-calendar-empty">&mdash;</div>';
      } else {
        dayItems.forEach(function(item) {
          html += '<div class="cs-calendar-item" data-id="' + _escape(item.id) + '">';
          html += '<span class="cs-cal-platform">' + _escape(item.platform) + '</span>';
          html += '<span class="cs-cal-hook">' + _escape(item.hook) + '</span>';
          html += '</div>';
        });
      }
      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  function _renderPerformance() {
    var studio = _getCreatorStudio();
    var pipeline = studio.contentPipeline || [];
    var postedItems = pipeline.filter(function(p) { return p.status === 'Posted' && (p.views || p.retention); });

    var html = '<div class="cs-section cs-performance">';
    html += '<div class="cs-section-header"><h2 class="cs-section-title">Performance</h2></div>';

    if (postedItems.length === 0) {
      html += '<div class="cs-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg><p>No performance data yet. Post content to see metrics here.</p></div>';
    } else {
      html += '<div class="cs-performance-grid">';
      postedItems.forEach(function(item) {
        html += '<div class="cs-perf-card">';
        html += '<div class="cs-perf-header"><span class="cs-perf-platform">' + _escape(item.platform) + '</span><span class="cs-perf-hook">' + _escape(item.hook) + '</span></div>';
        html += '<div class="cs-perf-metrics">';
        html += '<div class="cs-metric"><span class="cs-metric-value">' + _formatNumber(item.views || 0) + '</span><span class="cs-metric-label">Views</span></div>';
        html += '<div class="cs-metric"><span class="cs-metric-value">' + (item.retention || 0) + '%</span><span class="cs-metric-label">Retention</span></div>';
        html += '</div>';
        html += '<div class="cs-perf-actions"><button class="cs-card-btn" data-action="calc-retention" data-id="' + _escape(item.id) + '">Calculate Retention</button></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // --- Modals ---

  function _showPipelineModal(item) {
    var studio = _getCreatorStudio();
    var projects = _getProjects();
    var isEdit = !!item;

    var projectOptions = '<option value="">No project</option>';
    projects.forEach(function(p) {
      projectOptions += '<option value="' + _escape(p.id) + '"' + (item && item.projectId === p.id ? ' selected' : '') + '>' + _escape(p.name) + '</option>';
    });

    var platformOptions = '';
    PLATFORM_OPTIONS.forEach(function(p) {
      platformOptions += '<option value="' + _escape(p) + '"' + (item && item.platform === p ? ' selected' : '') + '>' + _escape(p) + '</option>';
    });

    var statusOptions = '';
    PIPELINE_STATUSES.forEach(function(s) {
      statusOptions += '<option value="' + _escape(s) + '"' + (item && item.status === s ? ' selected' : '') + '>' + _escape(s) + '</option>';
    });

    var content = '<div class="cs-form">' +
      '<div class="cs-form-group"><label>Hook / Title</label><input type="text" class="cs-input" id="cs-pipeline-hook" value="' + _escape(item ? item.hook : '') + '" placeholder="e.g., I quit my job and built this in 30 days"></div>' +
      '<div class="cs-form-row">' +
        '<div class="cs-form-group"><label>Platform</label><select class="cs-select" id="cs-pipeline-platform">' + platformOptions + '</select></div>' +
        '<div class="cs-form-group"><label>Status</label><select class="cs-select" id="cs-pipeline-status">' + statusOptions + '</select></div>' +
      '</div>' +
      '<div class="cs-form-group"><label>Project</label><select class="cs-select" id="cs-pipeline-project">' + projectOptions + '</select></div>' +
      '<div class="cs-form-group"><label>Script</label><textarea class="cs-textarea" id="cs-pipeline-script" rows="4" placeholder="Script or notes...">' + _escape(item ? item.script : '') + '</textarea></div>' +
      '<div class="cs-form-row">' +
        '<div class="cs-form-group"><label>Views</label><input type="number" class="cs-input" id="cs-pipeline-views" value="' + (item ? (item.views || '') : '') + '" placeholder="0"></div>' +
        '<div class="cs-form-group"><label>Retention %</label><input type="number" class="cs-input" id="cs-pipeline-retention" value="' + (item ? (item.retention || '') : '') + '" placeholder="0"></div>' +
      '</div>' +
    '</div>';

    FreedomOS.modal({
      title: isEdit ? 'Edit Content Piece' : 'New Content Piece',
      content: content,
      confirmText: 'Save',
      cancelText: 'Cancel',
      onConfirm: function() {
        var hook = document.getElementById('cs-pipeline-hook').value.trim();
        if (!hook) {
          FreedomOS.toast('Hook/title is required', 'error');
          return false;
        }

        var newItem = {
          id: item ? item.id : _generateId(),
          hook: hook,
          platform: document.getElementById('cs-pipeline-platform').value,
          status: document.getElementById('cs-pipeline-status').value,
          projectId: document.getElementById('cs-pipeline-project').value || null,
          script: document.getElementById('cs-pipeline-script').value,
          views: parseInt(document.getElementById('cs-pipeline-views').value) || 0,
          retention: parseInt(document.getElementById('cs-pipeline-retention').value) || 0,
          postedAt: document.getElementById('cs-pipeline-status').value === 'Posted' ? new Date().toISOString() : (item ? item.postedAt : null)
        };

        var pipeline = FreedomOS.deepClone(studio.contentPipeline || []);
        if (isEdit) {
          var idx = pipeline.findIndex(function(p) { return p.id === item.id; });
          if (idx !== -1) pipeline[idx] = newItem;
        } else {
          pipeline.push(newItem);
        }

        FreedomOS.mutate('creatorStudio.contentPipeline', pipeline);
        FreedomOS.toast(isEdit ? 'Content updated' : 'Content added', 'success');
        return true;
      }
    });
  }

  function _showPlatformModal(platform) {
    var isEdit = !!platform;
    var content = '<div class="cs-form">' +
      '<div class="cs-form-group"><label>Platform Name</label><input type="text" class="cs-input" id="cs-platform-name" value="' + _escape(platform ? platform.name : '') + '" placeholder="e.g., TikTok"></div>' +
      '<div class="cs-form-group"><label>Handle</label><input type="text" class="cs-input" id="cs-platform-handle" value="' + _escape(platform ? platform.handle : '') + '" placeholder="@username"></div>' +
      '<div class="cs-form-group"><label>Profile URL</label><input type="url" class="cs-input" id="cs-platform-url" value="' + _escape(platform ? platform.url : '') + '" placeholder="https://..."></div>' +
      '<div class="cs-form-group"><label>Current Followers</label><input type="number" class="cs-input" id="cs-platform-followers" value="' + (platform ? (platform.followers || '') : '') + '" placeholder="0"></div>' +
    '</div>';

    FreedomOS.modal({
      title: isEdit ? 'Edit Platform' : 'Add Platform',
      content: content,
      confirmText: 'Save',
      cancelText: 'Cancel',
      onConfirm: function() {
        var name = document.getElementById('cs-platform-name').value.trim();
        if (!name) {
          FreedomOS.toast('Platform name is required', 'error');
          return false;
        }

        var studio = _getCreatorStudio();
        var platforms = FreedomOS.deepClone(studio.platforms || []);

        if (isEdit) {
          var idx = platforms.findIndex(function(p) { return p.name === platform.name; });
          if (idx !== -1) {
            platforms[idx] = {
              name: name,
              handle: document.getElementById('cs-platform-handle').value.trim(),
              url: document.getElementById('cs-platform-url').value.trim(),
              followers: parseInt(document.getElementById('cs-platform-followers').value) || 0
            };
          }
        } else {
          if (platforms.find(function(p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
            FreedomOS.toast('Platform already exists', 'error');
            return false;
          }
          platforms.push({
            name: name,
            handle: document.getElementById('cs-platform-handle').value.trim(),
            url: document.getElementById('cs-platform-url').value.trim(),
            followers: parseInt(document.getElementById('cs-platform-followers').value) || 0
          });
        }

        FreedomOS.mutate('creatorStudio.platforms', platforms);
        FreedomOS.toast(isEdit ? 'Platform updated' : 'Platform added', 'success');
        return true;
      }
    });
  }

  function _showHookModal(hook) {
    var isEdit = !!hook;
    var content = '<div class="cs-form">' +
      '<div class="cs-form-group"><label>Hook Text</label><textarea class="cs-textarea" id="cs-hook-text" rows="3" placeholder="Write a compelling hook...">' + _escape(hook ? hook.text : '') + '</textarea></div>' +
      '<div class="cs-form-group"><label>Performance (1-5)</label><input type="number" class="cs-input" id="cs-hook-performance" min="1" max="5" value="' + (hook ? (hook.performance || 1) : 1) + '"></div>' +
    '</div>';

    FreedomOS.modal({
      title: isEdit ? 'Edit Hook' : 'Add Hook',
      content: content,
      confirmText: 'Save',
      cancelText: 'Cancel',
      onConfirm: function() {
        var text = document.getElementById('cs-hook-text').value.trim();
        if (!text) {
          FreedomOS.toast('Hook text is required', 'error');
          return false;
        }

        var studio = _getCreatorStudio();
        var hooks = FreedomOS.deepClone(studio.hooks || []);
        var perf = Math.min(5, Math.max(1, parseInt(document.getElementById('cs-hook-performance').value) || 1));

        if (isEdit) {
          var idx = hooks.findIndex(function(h) { return h.id === hook.id; });
          if (idx !== -1) {
            hooks[idx].text = text;
            hooks[idx].performance = perf;
          }
        } else {
          hooks.push({
            id: _generateId(),
            text: text,
            used: false,
            performance: perf
          });
        }

        FreedomOS.mutate('creatorStudio.hooks', hooks);
        FreedomOS.toast(isEdit ? 'Hook updated' : 'Hook added', 'success');
        return true;
      }
    });
  }

  function _showScriptModal(script) {
    var studio = _getCreatorStudio();
    var projects = _getProjects();
    var isEdit = !!script;

    var projectOptions = '<option value="">No project</option>';
    projects.forEach(function(p) {
      projectOptions += '<option value="' + _escape(p.id) + '"' + (script && script.projectId === p.id ? ' selected' : '') + '>' + _escape(p.name) + '</option>';
    });

    var content = '<div class="cs-form">' +
      '<div class="cs-form-group"><label>Title</label><input type="text" class="cs-input" id="cs-script-title" value="' + _escape(script ? script.title : '') + '" placeholder="Script title"></div>' +
      '<div class="cs-form-group"><label>Project</label><select class="cs-select" id="cs-script-project">' + projectOptions + '</select></div>' +
      '<div class="cs-form-group"><label>Content</label><textarea class="cs-textarea cs-script-editor" id="cs-script-content" rows="10" placeholder="Write your script here...">' + _escape(script ? script.content : '') + '</textarea><div class="cs-word-count" id="cs-script-wc">0 words</div></div>' +
      '<div class="cs-form-group"><label>Status</label><select class="cs-select" id="cs-script-status">' +
        '<option value="Draft"' + (script && script.status === 'Draft' ? ' selected' : '') + '>Draft</option>' +
        '<option value="Final"' + (script && script.status === 'Final' ? ' selected' : '') + '>Final</option>' +
        '<option value="Archived"' + (script && script.status === 'Archived' ? ' selected' : '') + '>Archived</option>' +
      '</select></div>' +
    '</div>';

    FreedomOS.modal({
      title: isEdit ? 'Edit Script' : 'New Script',
      content: content,
      confirmText: 'Save',
      cancelText: 'Cancel',
      onConfirm: function() {
        var title = document.getElementById('cs-script-title').value.trim();
        if (!title) {
          FreedomOS.toast('Title is required', 'error');
          return false;
        }

        var scripts = FreedomOS.deepClone(studio.scripts || []);
        var newScript = {
          id: script ? script.id : _generateId(),
          title: title,
          projectId: document.getElementById('cs-script-project').value || null,
          content: document.getElementById('cs-script-content').value,
          status: document.getElementById('cs-script-status').value,
          createdAt: script ? script.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (isEdit) {
          var idx = scripts.findIndex(function(s) { return s.id === script.id; });
          if (idx !== -1) scripts[idx] = newScript;
        } else {
          scripts.push(newScript);
        }

        FreedomOS.mutate('creatorStudio.scripts', scripts);
        FreedomOS.toast(isEdit ? 'Script updated' : 'Script saved', 'success');
        return true;
      },
      onMount: function() {
        var textarea = document.getElementById('cs-script-content');
        var wcDisplay = document.getElementById('cs-script-wc');
        function updateWC() {
          var text = textarea.value.trim();
          var count = text ? text.split(/\s+/).length : 0;
          wcDisplay.textContent = count + ' word' + (count !== 1 ? 's' : '');
        }
        textarea.addEventListener('input', updateWC);
        updateWC();
      }
    });
  }

  function _showRetentionModal(item) {
    var content = '<div class="cs-form">' +
      '<div class="cs-form-group"><label>Total Views</label><input type="number" class="cs-input" id="cs-ret-views" value="' + (item.views || 0) + '" placeholder="0"></div>' +
      '<div class="cs-form-group"><label>Average View Duration (seconds)</label><input type="number" class="cs-input" id="cs-ret-duration" placeholder="e.g., 45"></div>' +
      '<div class="cs-form-group"><label>Video Length (seconds)</label><input type="number" class="cs-input" id="cs-ret-length" placeholder="e.g., 60"></div>' +
      '<div class="cs-ret-result" id="cs-ret-result"></div>' +
    '</div>';

    FreedomOS.modal({
      title: 'Calculate Retention',
      content: content,
      confirmText: 'Save Result',
      cancelText: 'Cancel',
      onConfirm: function() {
        var duration = parseFloat(document.getElementById('cs-ret-duration').value);
        var length = parseFloat(document.getElementById('cs-ret-length').value);
        if (!duration || !length || length <= 0) {
          FreedomOS.toast('Enter valid duration and length', 'error');
          return false;
        }
        var retention = Math.min(100, Math.round((duration / length) * 100));
        var studio = _getCreatorStudio();
        var pipeline = FreedomOS.deepClone(studio.contentPipeline || []);
        var idx = pipeline.findIndex(function(p) { return p.id === item.id; });
        if (idx !== -1) {
          pipeline[idx].retention = retention;
          pipeline[idx].views = parseInt(document.getElementById('cs-ret-views').value) || 0;
          FreedomOS.mutate('creatorStudio.contentPipeline', pipeline);
          FreedomOS.toast('Retention saved: ' + retention + '%', 'success');
        }
        return true;
      },
      onMount: function() {
        var durationInput = document.getElementById('cs-ret-duration');
        var lengthInput = document.getElementById('cs-ret-length');
        var resultEl = document.getElementById('cs-ret-result');
        function calc() {
          var d = parseFloat(durationInput.value);
          var l = parseFloat(lengthInput.value);
          if (d && l && l > 0) {
            var pct = Math.min(100, Math.round((d / l) * 100));
            resultEl.textContent = 'Estimated Retention: ' + pct + '%';
          } else {
            resultEl.textContent = '';
          }
        }
        durationInput.addEventListener('input', calc);
        lengthInput.addEventListener('input', calc);
      }
    });
  }

  // --- Charts ---

  function _initFollowerCharts(container) {
    var canvases = container.querySelectorAll('.cs-follower-chart');
    canvases.forEach(function(canvas) {
      var platformName = canvas.getAttribute('data-platform');
      var studio = _getCreatorStudio();
      var platform = (studio.platforms || []).find(function(p) { return p.name === platformName; });
      if (!platform) return;

      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;

      var current = platform.followers || 0;
      var dataPoints = [];
      for (var i = 0; i < 7; i++) {
        dataPoints.push(Math.round(current * (0.5 + (i / 12))));
      }
      dataPoints[6] = current;

      var maxVal = Math.max.apply(null, dataPoints) || 1;
      var minVal = Math.min.apply(null, dataPoints) || 0;
      var range = maxVal - minVal || 1;

      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#00d4aa';
      ctx.lineWidth = 2;
      ctx.beginPath();

      dataPoints.forEach(function(val, i) {
        var x = (i / (dataPoints.length - 1)) * (w - 20) + 10;
        var y = h - 10 - ((val - minVal) / range) * (h - 20);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();

      ctx.lineTo(w - 10, h - 10);
      ctx.lineTo(10, h - 10);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 212, 170, 0.1)';
      ctx.fill();

      _canvasCharts.push(canvas);
    });
  }

  // --- Event handling ---

  function _handleAction(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');
    var studio = _getCreatorStudio();

    switch (action) {
      case 'add-pipeline-item':
        _showPipelineModal(null);
        break;
      case 'edit-pipeline': {
        var item = (studio.contentPipeline || []).find(function(p) { return p.id === id; });
        if (item) _showPipelineModal(item);
        break;
      }
      case 'delete-pipeline': {
        var item = (studio.contentPipeline || []).find(function(p) { return p.id === id; });
        if (!item) return;
        FreedomOS.confirm('Delete "' + item.hook + '"?', function() {
          var pipeline = (studio.contentPipeline || []).filter(function(p) { return p.id !== id; });
          FreedomOS.mutate('creatorStudio.contentPipeline', pipeline);
          FreedomOS.toast('Content piece deleted', 'success');
        });
        break;
      }
      case 'add-platform':
        _showPlatformModal(null);
        break;
      case 'edit-platform': {
        var platform = (studio.platforms || []).find(function(p) { return p.name === id; });
        if (platform) _showPlatformModal(platform);
        break;
      }
      case 'delete-platform': {
        FreedomOS.confirm('Delete platform "' + id + '"?', function() {
          var platforms = (studio.platforms || []).filter(function(p) { return p.name !== id; });
          FreedomOS.mutate('creatorStudio.platforms', platforms);
          FreedomOS.toast('Platform deleted', 'success');
        });
        break;
      }
      case 'add-hook':
        _showHookModal(null);
        break;
      case 'toggle-hook-used': {
        var hooks = FreedomOS.deepClone(studio.hooks || []);
        var idx = hooks.findIndex(function(h) { return h.id === id; });
        if (idx !== -1) {
          hooks[idx].used = !hooks[idx].used;
          FreedomOS.mutate('creatorStudio.hooks', hooks);
          FreedomOS.toast(hooks[idx].used ? 'Hook marked as used' : 'Hook marked as unused', 'success');
        }
        break;
      }
      case 'rate-hook': {
        var hook = (studio.hooks || []).find(function(h) { return h.id === id; });
        if (!hook) return;
        FreedomOS.prompt('Rate this hook 1-5:', hook.performance || 3, function(val) {
          var rating = parseInt(val);
          if (isNaN(rating) || rating < 1 || rating > 5) {
            FreedomOS.toast('Please enter a number 1-5', 'error');
            return;
          }
          var hooks = FreedomOS.deepClone(studio.hooks || []);
          var idx = hooks.findIndex(function(h) { return h.id === id; });
          if (idx !== -1) {
            hooks[idx].performance = rating;
            FreedomOS.mutate('creatorStudio.hooks', hooks);
            FreedomOS.toast('Rating updated', 'success');
          }
        });
        break;
      }
      case 'delete-hook': {
        FreedomOS.confirm('Delete this hook?', function() {
          var hooks = (studio.hooks || []).filter(function(h) { return h.id !== id; });
          FreedomOS.mutate('creatorStudio.hooks', hooks);
          FreedomOS.toast('Hook deleted', 'success');
        });
        break;
      }
      case 'add-script':
        _showScriptModal(null);
        break;
      case 'edit-script': {
        var script = (studio.scripts || []).find(function(s) { return s.id === id; });
        if (script) _showScriptModal(script);
        break;
      }
      case 'delete-script': {
        FreedomOS.confirm('Delete this script?', function() {
          var scripts = (studio.scripts || []).filter(function(s) { return s.id !== id; });
          FreedomOS.mutate('creatorStudio.scripts', scripts);
          FreedomOS.toast('Script deleted', 'success');
        });
        break;
      }
      case 'calc-retention': {
        var item = (studio.contentPipeline || []).find(function(p) { return p.id === id; });
        if (item) _showRetentionModal(item);
        break;
      }
    }
  }

  // --- Drag and drop ---

  function _initDragAndDrop(container) {
    var cards = container.querySelectorAll('.cs-pipeline-card');
    var cols = container.querySelectorAll('.cs-kanban-col');

    cards.forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
        card.classList.add('cs-dragging');
      });
      card.addEventListener('dragend', function() {
        card.classList.remove('cs-dragging');
      });
    });

    cols.forEach(function(col) {
      col.addEventListener('dragover', function(e) {
        e.preventDefault();
        col.classList.add('cs-drag-over');
      });
      col.addEventListener('dragleave', function() {
        col.classList.remove('cs-drag-over');
      });
      col.addEventListener('drop', function(e) {
        e.preventDefault();
        col.classList.remove('cs-drag-over');
        var itemId = e.dataTransfer.getData('text/plain');
        var newStatus = col.getAttribute('data-status');
        if (!itemId || !newStatus) return;

        var studio = _getCreatorStudio();
        var pipeline = FreedomOS.deepClone(studio.contentPipeline || []);
        var item = pipeline.find(function(p) { return p.id === itemId; });
        if (item && item.status !== newStatus) {
          item.status = newStatus;
          if (newStatus === 'Posted') {
            item.postedAt = new Date().toISOString();
          }
          FreedomOS.mutate('creatorStudio.contentPipeline', pipeline);
          FreedomOS.toast('Moved to ' + newStatus, 'success');
        }
      });
    });
  }

  // --- Module Registration ---

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: [],

    init: function() {
      var state = FreedomOS.state;
      if (!state.creatorStudio) {
        FreedomOS.mutate('creatorStudio', {
          platforms: [],
          contentPipeline: [],
          hooks: [],
          scripts: []
        });
      }
    },

    render: function(params) {
      var html = '<div class="view-creatorStudio">';
      html += '<div class="cs-header"><h1 class="cs-title">Creator Studio</h1><p class="cs-subtitle">Plan, create, and analyze your content</p></div>';
      html += '<div class="cs-tabs">';
      html += '<button class="cs-tab cs-tab-active" data-tab="pipeline">Pipeline</button>';
      html += '<button class="cs-tab" data-tab="platforms">Platforms</button>';
      html += '<button class="cs-tab" data-tab="hooks">Hooks</button>';
      html += '<button class="cs-tab" data-tab="scripts">Scripts</button>';
      html += '<button class="cs-tab" data-tab="calendar">Calendar</button>';
      html += '<button class="cs-tab" data-tab="performance">Performance</button>';
      html += '</div>';
      html += '<div class="cs-tab-content">';
      html += _renderPipeline();
      html += _renderPlatforms();
      html += _renderHooks();
      html += _renderScripts();
      html += _renderCalendar();
      html += _renderPerformance();
      html += '</div>';
      html += '</div>';
      return html;
    },

    onMount: function(container) {
      var tabs = container.querySelectorAll('.cs-tab');
      var sections = container.querySelectorAll('.cs-section');

      tabs.forEach(function(tab) {
        _addListener(tab, 'click', function() {
          var target = tab.getAttribute('data-tab');
          tabs.forEach(function(t) { t.classList.remove('cs-tab-active'); });
          tab.classList.add('cs-tab-active');
          sections.forEach(function(s) { s.classList.remove('cs-section-active'); });
          var targetSection = container.querySelector('.cs-' + target);
          if (targetSection) {
            targetSection.classList.add('cs-section-active');
            if (target === 'platforms') {
              _initFollowerCharts(container);
            }
          }
        });
      });

      if (sections.length > 0) {
        sections.forEach(function(s) { s.classList.remove('cs-section-active'); });
        var firstSection = container.querySelector('.cs-pipeline');
        if (firstSection) firstSection.classList.add('cs-section-active');
      }

      _addListener(container, 'click', _handleAction);
      _initDragAndDrop(container);
      _initFollowerCharts(container);
    },

    onUnmount: function(container) {
      _clearListeners();
      _clearIntervals();
      _clearTimeouts();
      _destroyCharts();
    }
  });
})();