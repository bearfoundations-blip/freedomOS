// ============================================================
// Freedom OS — Roadmap
// File: js/modules/roadmap.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js
// Provides: roadmap module (route: roadmap)
// Last Updated: 2026-05-08
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

FreedomOS.registerModule({
  name: 'roadmap',
  routes: ['roadmap'],
  requires: [],

  _listeners: [],
  _intervals: [],
  _modalOpen: false,

  init: function() {
    const roadmap = FreedomOS.get('roadmap') || [];
    if (roadmap.length === 0) {
      this._initDefaultRoadmap();
    }
  },

  render: function(params) {
    const roadmap = FreedomOS.get('roadmap') || [];
    const projects = FreedomOS.get('projects') || [];
    const now = new Date();
    const targetDate = new Date('2029-04-20');

    const years = ['Y1', 'Y2', 'Y3'];
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentQ = this._getCurrentQuarter(now);

    const completed = roadmap.filter(function(r) { return r.status === 'completed'; }).length;
    const total = roadmap.length || 12;
    const overallPct = Math.round((completed / total) * 100);
    const daysLeft = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));

    const statusDotColor = {
      planned: 'var(--color-text-secondary)',
      'in-progress': 'var(--color-info)',
      completed: 'var(--color-success)',
      delayed: 'var(--color-danger)'
    };

    let gridHtml = '';
    years.forEach(function(year, yIdx) {
      gridHtml += `<div class="roadmap-year-row">`;
      quarters.forEach(function(q, qIdx) {
        const qKey = year + q;
        const item = roadmap.find(function(r) { return r.quarter === qKey; }) || {
          quarter: qKey,
          title: '',
          description: '',
          status: 'planned',
          projects: [],
          milestones: []
        };
        const isCurrent = qKey === currentQ;
        const statusClass = 'status-' + item.status;
        const milestoneCount = (item.milestones || []).length;
        const completedMilestones = (item.milestones || []).filter(function(m) { return m.completed; }).length;
        const progress = milestoneCount > 0 ? Math.round((completedMilestones / milestoneCount) * 100) : (item.status === 'completed' ? 100 : 0);
        const dotColor = statusDotColor[item.status] || statusDotColor.planned;

        gridHtml += `
          <div class="roadmap-quarter ${statusClass} ${isCurrent ? 'current' : ''}" data-quarter="${qKey}" style="animation-delay:${(yIdx * 4 + qIdx) * 50}ms">
            <div class="quarter-header">
              <span class="quarter-label">
                <span class="status-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle;box-shadow:0 0 6px ${dotColor};"></span>
                ${qKey}
              </span>
              <span class="quarter-status-badge">${item.status}</span>
            </div>
            <h3 class="quarter-title">${FreedomOS.escapeHtml(item.title || 'Untitled')}</h3>
            <p class="quarter-desc">${FreedomOS.escapeHtml(item.description || 'No description').substring(0, 80)}${(item.description || '').length > 80 ? '...' : ''}</p>
            <div class="quarter-progress">
              <div class="progress-bar" style="height:10px;border-radius:999px;background:var(--color-border);overflow:hidden;position:relative;">
                <div class="progress-fill" style="width:${progress}%;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--color-primary),var(--color-secondary));position:relative;">
                  <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent);animation:roadmap-shimmer 2s infinite;"></div>
                </div>
              </div>
              <span class="progress-text">${progress}%</span>
            </div>
            <div class="quarter-meta">
              <span class="meta-item">${(item.projects || []).length} projects</span>
              <span class="meta-item">${milestoneCount} milestones</span>
            </div>
            ${isCurrent ? '<div class="current-indicator">Current</div>' : ''}
          </div>
        `;
      });
      gridHtml += `</div>`;
    });

    return `
      <style>@keyframes roadmap-shimmer{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}</style>
      <div class="view-roadmap">
        <div class="view-header">
          <h1 class="view-title">3-Year Roadmap</h1>
          <p class="view-subtitle">${daysLeft} days until April 20, 2029</p>
        </div>

        <div class="roadmap-overview card">
          <div class="overview-progress">
            <div class="progress-bar large" style="height:12px;border-radius:999px;background:var(--color-border);overflow:hidden;position:relative;">
              <div class="progress-fill" style="width:${overallPct}%;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--color-primary),var(--color-secondary));position:relative;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent);animation:roadmap-shimmer 2s infinite;"></div>
              </div>
            </div>
            <span class="progress-label">${overallPct}% to Freedom</span>
          </div>
          <div class="overview-stats">
            <div class="stat-item">
              <span class="stat-value">${completed}</span>
              <span class="stat-label">Completed</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${roadmap.filter(function(r){return r.status==='in-progress';}).length}</span>
              <span class="stat-label">In Progress</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${roadmap.filter(function(r){return r.status==='delayed';}).length}</span>
              <span class="stat-label">Delayed</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${total - completed}</span>
              <span class="stat-label">Remaining</span>
            </div>
          </div>
        </div>

        <div class="roadmap-timeline">
          <div class="timeline-line"></div>
          ${gridHtml}
        </div>
      </div>

      <!-- Edit Modal -->
      <div id="roadmap-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Edit Quarter</h3>
            <button class="btn btn-icon modal-close" aria-label="Close modal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="modal-quarter-key">
            <div class="form-group">
              <label class="form-label">Title</label>
              <input type="text" id="modal-title" class="form-input" maxlength="100">
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea id="modal-desc" class="form-textarea" rows="3" maxlength="500"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select id="modal-status" class="form-select">
                <option value="planned">Planned</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="delayed">Delayed</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Associated Projects</label>
              <div class="project-selector" id="modal-project-list">
                ${projects.map(function(p) {
                  return `<label class="project-checkbox"><input type="checkbox" value="${p.id}"><span>${FreedomOS.escapeHtml(p.name)}</span></label>`;
                }).join('')}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Milestones</label>
              <div class="milestones-list" id="modal-milestones"></div>
              <div class="milestone-add-row">
                <input type="text" id="modal-new-milestone" class="form-input" placeholder="Add milestone...">
                <button id="btn-add-milestone" class="btn btn-secondary">Add</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button id="btn-save-quarter" class="btn btn-primary">Save Quarter</button>
          </div>
        </div>
      </div>
    `;
  },

  onMount: function(container) {
    const self = this;
    const modal = container.querySelector('#roadmap-modal');
    const modalBackdrop = modal.querySelector('.modal-backdrop');
    const modalClose = modal.querySelector('.modal-close');
    const quarterEls = container.querySelectorAll('.roadmap-quarter');

    quarterEls.forEach(function(el) {
      const onClick = function() {
        const qKey = el.dataset.quarter;
        self._openModal(qKey, modal, container);
      };
      el.addEventListener('click', onClick);
      self._listeners.push({ el: el, type: 'click', fn: onClick });
    });

    const closeModal = function() {
      modal.classList.add('hidden');
      self._modalOpen = false;
    };
    modalBackdrop.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    self._listeners.push({ el: modalBackdrop, type: 'click', fn: closeModal });
    self._listeners.push({ el: modalClose, type: 'click', fn: closeModal });

    const btnAddMilestone = modal.querySelector('#btn-add-milestone');
    const onAddMilestone = function() {
      const input = modal.querySelector('#modal-new-milestone');
      const text = input.value.trim();
      if (!text) return;
      const list = modal.querySelector('#modal-milestones');
      const id = FreedomOS.generateId();
      const item = document.createElement('div');
      item.className = 'milestone-item';
      item.dataset.id = id;
      item.innerHTML = `
        <input type="checkbox" class="milestone-check">
        <span class="milestone-text">${FreedomOS.escapeHtml(text)}</span>
        <button class="btn btn-icon btn-remove-milestone" aria-label="Remove milestone">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
      list.appendChild(item);
      input.value = '';

      const removeBtn = item.querySelector('.btn-remove-milestone');
      const onRemove = function() { item.remove(); };
      removeBtn.addEventListener('click', onRemove);
      self._listeners.push({ el: removeBtn, type: 'click', fn: onRemove });
    };
    btnAddMilestone.addEventListener('click', onAddMilestone);
    self._listeners.push({ el: btnAddMilestone, type: 'click', fn: onAddMilestone });

    const btnSave = modal.querySelector('#btn-save-quarter');
    const onSave = function() {
      const qKey = modal.querySelector('#modal-quarter-key').value;
      const title = modal.querySelector('#modal-title').value.trim();
      const description = modal.querySelector('#modal-desc').value.trim();
      const status = modal.querySelector('#modal-status').value;

      const projectChecks = modal.querySelectorAll('#modal-project-list input[type="checkbox"]:checked');
      const projectIds = Array.from(projectChecks).map(function(cb) { return cb.value; });

      const milestoneEls = modal.querySelectorAll('.milestone-item');
      const milestones = Array.from(milestoneEls).map(function(el) {
        return {
          id: el.dataset.id,
          text: el.querySelector('.milestone-text').textContent,
          completed: el.querySelector('.milestone-check').checked
        };
      });

      const roadmap = FreedomOS.get('roadmap') || [];
      const idx = roadmap.findIndex(function(r) { return r.quarter === qKey; });

      const quarter = {
        quarter: qKey,
        title: title,
        description: description,
        status: status,
        projects: projectIds,
        milestones: milestones
      };

      if (idx >= 0) {
        quarter.id = roadmap[idx].id;
        roadmap[idx] = quarter;
      } else {
        quarter.id = FreedomOS.generateId();
        roadmap.push(quarter);
      }

      FreedomOS.mutate('roadmap', roadmap);
      FreedomOS.toast('Quarter updated', 'success', 2000);
      FreedomOS.emit('roadmap:updated', quarter);
      closeModal();
      FreedomOS.navigate('roadmap');
    };
    btnSave.addEventListener('click', onSave);
    self._listeners.push({ el: btnSave, type: 'click', fn: onSave });
  },

  onUnmount: function(container) {
    this._listeners.forEach(function(item) {
      item.el.removeEventListener(item.type, item.fn);
    });
    this._listeners = [];
    this._intervals.forEach(function(id) { clearInterval(id); });
    this._intervals = [];
    this._modalOpen = false;
  },

  _getCurrentQuarter: function(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const baseYear = 2026;
    const yearOffset = year - baseYear + 1;
    if (yearOffset < 1 || yearOffset > 3) return null;
    const q = Math.floor(month / 3) + 1;
    return 'Y' + yearOffset + 'Q' + q;
  },

  _initDefaultRoadmap: function() {
    const defaults = [];
    const years = ['Y1', 'Y2', 'Y3'];
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    years.forEach(function(y) {
      quarters.forEach(function(q) {
        defaults.push({
          id: FreedomOS.generateId(),
          quarter: y + q,
          title: '',
          description: '',
          status: 'planned',
          projects: [],
          milestones: []
        });
      });
    });
    FreedomOS.mutate('roadmap', defaults);
  },

  _openModal: function(qKey, modal, container) {
    const roadmap = FreedomOS.get('roadmap') || [];
    const item = roadmap.find(function(r) { return r.quarter === qKey; }) || {
      quarter: qKey,
      title: '',
      description: '',
      status: 'planned',
      projects: [],
      milestones: []
    };

    modal.querySelector('#modal-quarter-key').value = qKey;
    modal.querySelector('#modal-title').value = item.title || '';
    modal.querySelector('#modal-desc').value = item.description || '';
    modal.querySelector('#modal-status').value = item.status || 'planned';

    const projectChecks = modal.querySelectorAll('#modal-project-list input[type="checkbox"]');
    projectChecks.forEach(function(cb) {
      cb.checked = (item.projects || []).indexOf(cb.value) !== -1;
    });

    const list = modal.querySelector('#modal-milestones');
    list.innerHTML = '';
    const self = this;
    (item.milestones || []).forEach(function(m) {
      const el = document.createElement('div');
      el.className = 'milestone-item';
      el.dataset.id = m.id || FreedomOS.generateId();
      el.innerHTML = `
        <input type="checkbox" class="milestone-check" ${m.completed ? 'checked' : ''}>
        <span class="milestone-text">${FreedomOS.escapeHtml(m.text)}</span>
        <button class="btn btn-icon btn-remove-milestone" aria-label="Remove milestone">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
      list.appendChild(el);
      const removeBtn = el.querySelector('.btn-remove-milestone');
      const onRemove = function() { el.remove(); };
      removeBtn.addEventListener('click', onRemove);
      self._listeners.push({ el: removeBtn, type: 'click', fn: onRemove });
    });

    modal.classList.remove('hidden');
    this._modalOpen = true;
  }
});