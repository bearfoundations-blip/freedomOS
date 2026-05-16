// ============================================================
// Freedom OS — War Room (POLISHED)
// File: js/modules/warRoom.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js, kernel/router.js
// Provides: warRoom module (deep-dive project workspace with tabs)
// Last Updated: 2026-05-10
// ============================================================

(function() {
  'use strict';

  const MODULE_NAME = 'warRoom';
  const ROUTES = ['warRoom', 'warRoom/:projectId'];

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'milestones', label: 'Milestones' },
    { id: 'content', label: 'Content' },
    { id: 'numbers', label: 'Numbers' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'files', label: 'Files' }
  ];

  const STATUS_COLORS = {
    active: 'var(--status-active)',
    killed: 'var(--status-killed)',
    pivoted: 'var(--status-pivoted)',
    scaled: 'var(--status-scaled)',
    paused: 'var(--status-paused)'
  };

  let _unsubscribers = [];
  let _intervals = [];
  let _fileReaders = [];
  let _currentTab = 'overview';
  let _currentProjectId = null;
  let _canvasResizeObserver = null;
  let _windowResizeHandler = null;

  function _getProject(id) {
    const projects = FreedomOS.get('projects') || [];
    return projects.find(function(p) { return p.id === id; });
  }

  function _getAllProjects() {
    return FreedomOS.get('projects') || [];
  }

  function _formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  }

  function _daysUntil(dateStr) {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function _renderTabNav() {
    let tabsHtml = '';
    TABS.forEach(function(tab) {
      const isActive = tab.id === _currentTab;
      tabsHtml += (
        '<button class="warroom-tab' + (isActive ? ' active' : '') + '" ' +
          'data-tab="' + tab.id + '" ' +
          'role="tab" ' +
          'aria-selected="' + isActive + '" ' +
          'aria-controls="tab-panel-' + tab.id + '">' +
          tab.label +
        '</button>'
      );
    });
    return '<nav class="warroom-tabs" role="tablist">' + tabsHtml + '</nav>';
  }

  function _renderProjectSelector() {
    const projects = _getAllProjects();
    let options = '<option value="">Choose a project...</option>';
    projects.forEach(function(p) {
      options += '<option value="' + FreedomOS.escapeHtml(p.id) + '">' + FreedomOS.escapeHtml(p.name) + '</option>';
    });
    return (
      '<div class="project-selector">' +
        '<label class="form-label" for="warroom-project-select">Select Project</label>' +
        '<select class="select select-large" id="warroom-project-select">' + options + '</select>' +
      '</div>'
    );
  }

  function _renderOverview(project) {
    const days = _daysUntil(project.killDate);
    const statusColor = STATUS_COLORS[project.status] || 'var(--color-text-muted)';
    const totalMilestones = project.milestones ? project.milestones.length : 0;
    const completedMilestones = project.milestones ? project.milestones.filter(function(m) { return m.status === 'completed'; }).length : 0;
    const revenue = project.finances ? project.finances.revenue : 0;
    const costs = project.finances ? project.finances.costs : 0;
    const profit = revenue - costs;
    const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    return (
      '<div class="tab-panel tab-overview" id="tab-panel-overview" role="tabpanel">' +
        '<div class="overview-meta-grid">' +
          '<div class="meta-item">' +
            '<span class="meta-label">Status</span>' +
            '<span class="meta-value" style="color: ' + statusColor + ';">' + FreedomOS.escapeHtml(project.status.toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="meta-item">' +
            '<span class="meta-label">Kill Date</span>' +
            '<span class="meta-value">' + (project.killDate ? FreedomOS.escapeHtml(project.killDate) : '—') + '</span>' +
            (days !== null ? '<span class="meta-sub">' + (days < 0 ? Math.abs(days) + ' days overdue' : days + ' days remaining') + '</span>' : '') +
          '</div>' +
          '<div class="meta-item">' +
            '<span class="meta-label">Revenue</span>' +
            '<span class="meta-value">' + FreedomOS.formatMoney(revenue) + '</span>' +
          '</div>' +
          '<div class="meta-item">' +
            '<span class="meta-label">Profit</span>' +
            '<span class="meta-value" style="color: ' + (profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + FreedomOS.formatMoney(profit) + '</span>' +
          '</div>' +
          '<div class="meta-item">' +
            '<span class="meta-label">Milestones</span>' +
            '<span class="meta-value">' + completedMilestones + ' / ' + totalMilestones + '</span>' +
            '<div class="mini-progress">' +
              '<div class="mini-progress-fill" style="width: ' + progress + '%;"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="warroom-section-card" style="margin-top: var(--space-xl);">' +
          '<div class="warroom-section-header">' +
            '<h3>Hypothesis</h3>' +
          '</div>' +
          '<div class="warroom-section-body">' +
            '<p>' + FreedomOS.escapeHtml(project.hypothesis || 'No hypothesis defined.') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="warroom-section-card" style="margin-top: var(--space-lg);">' +
          '<div class="warroom-section-header">' +
            '<h3>Model</h3>' +
          '</div>' +
          '<div class="warroom-section-body">' +
            '<span class="badge badge-large">' + FreedomOS.escapeHtml(project.model || '—') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderMilestones(project) {
    const milestones = project.milestones || [];
    let listHtml = '';
    milestones.forEach(function(m, i) {
      listHtml += (
        '<div class="milestone-item" style="animation-delay: ' + (i * 50) + 'ms">' +
          '<div class="milestone-status">' +
            '<input type="checkbox" class="milestone-check" data-id="' + FreedomOS.escapeHtml(m.id) + '"' + (m.status === 'completed' ? ' checked' : '') + '>' +
          '</div>' +
          '<div class="milestone-body">' +
            '<span class="milestone-title">' + FreedomOS.escapeHtml(m.title) + '</span>' +
            (m.deadline ? '<span class="milestone-deadline">' + FreedomOS.escapeHtml(m.deadline) + '</span>' : '') +
          '</div>' +
          '<button class="btn btn-icon btn-delete-milestone" data-id="' + FreedomOS.escapeHtml(m.id) + '" aria-label="Delete milestone">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
          '</button>' +
        '</div>'
      );
    });

    const completedCount = milestones.filter(function(m) { return m.status === 'completed'; }).length;
    const progress = milestones.length > 0 ? (completedCount / milestones.length * 100) : 0;

    return (
      '<div class="tab-panel tab-milestones" id="tab-panel-milestones" role="tabpanel">' +
        '<div class="milestones-header">' +
          '<button class="btn btn-primary btn-add-milestone" data-action="add-milestone">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
            'Add Milestone' +
          '</button>' +
        '</div>' +
        (milestones.length === 0 ? (
          '<div class="empty-state">' +
            '<div class="empty-state-icon">' +
              '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
            '</div>' +
            '<h3 class="empty-state-title">No milestones</h3>' +
            '<p class="empty-state-desc">Break your project into milestones to track progress.</p>' +
          '</div>'
        ) : (
          '<div class="milestones-list">' + listHtml + '</div>' +
          '<div class="milestones-progress">' +
            '<div class="progress-track">' +
              '<div class="progress-fill" style="width: ' + progress + '%"></div>' +
            '</div>' +
            '<span class="progress-label">' + completedCount + ' of ' + milestones.length + ' completed</span>' +
          '</div>'
        )) +
      '</div>'
    );
  }

  function _renderContent(project) {
    const pieces = project.contentPieces || [];
    let listHtml = '';
    pieces.forEach(function(c, i) {
      listHtml += (
        '<div class="content-item" style="animation-delay: ' + (i * 50) + 'ms">' +
          '<div class="content-main">' +
            '<span class="content-title">' + FreedomOS.escapeHtml(c.title || c.hook || 'Untitled') + '</span>' +
            '<span class="content-platform">' + FreedomOS.escapeHtml(c.platform || '—') + '</span>' +
          '</div>' +
          '<div class="content-metrics">' +
            (c.views !== undefined ? '<span class="metric">' + FreedomOS.escapeHtml(String(c.views)) + ' views</span>' : '') +
            (c.retention !== undefined ? '<span class="metric">' + FreedomOS.escapeHtml(String(c.retention)) + '% retention</span>' : '') +
          '</div>' +
          '<span class="content-status badge">' + FreedomOS.escapeHtml(c.status || 'draft') + '</span>' +
        '</div>'
      );
    });

    return (
      '<div class="tab-panel tab-content" id="tab-panel-content" role="tabpanel">' +
        '<div class="content-header">' +
          '<button class="btn btn-primary btn-add-content" data-action="add-content">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
            'Add Content' +
          '</button>' +
        '</div>' +
        (pieces.length === 0 ? (
          '<div class="empty-state">' +
            '<div class="empty-state-icon">' +
              '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' +
            '</div>' +
            '<h3 class="empty-state-title">No content pieces</h3>' +
            '<p class="empty-state-desc">Track your content pipeline here.</p>' +
          '</div>'
        ) : '<div class="content-list">' + listHtml + '</div>') +
      '</div>'
    );
  }

  function _renderNumbers(project) {
    const finances = project.finances || { revenue: 0, costs: 0, monthly: [] };
    const monthly = finances.monthly || [];
    const revenue = finances.revenue || 0;
    const costs = finances.costs || 0;
    const profit = revenue - costs;

    let tableRows = '';
    if (monthly.length === 0) {
      tableRows = '<tr><td colspan="4" class="table-empty">No monthly data</td></tr>';
    } else {
      monthly.forEach(function(m) {
        const mProfit = (m.revenue || 0) - (m.costs || 0);
        tableRows += (
          '<tr>' +
            '<td>' + FreedomOS.escapeHtml(m.month || '—') + '</td>' +
            '<td>' + FreedomOS.formatMoney(m.revenue || 0) + '</td>' +
            '<td>' + FreedomOS.formatMoney(m.costs || 0) + '</td>' +
            '<td style="color: ' + (mProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + '">' + FreedomOS.formatMoney(mProfit) + '</td>' +
          '</tr>'
        );
      });
    }

    return (
      '<div class="tab-panel tab-numbers" id="tab-panel-numbers" role="tabpanel">' +
        '<div class="numbers-summary">' +
          '<div class="number-card">' +
            '<span class="number-label">Total Revenue</span>' +
            '<span class="number-value">' + FreedomOS.formatMoney(revenue) + '</span>' +
          '</div>' +
          '<div class="number-card">' +
            '<span class="number-label">Total Costs</span>' +
            '<span class="number-value">' + FreedomOS.formatMoney(costs) + '</span>' +
          '</div>' +
          '<div class="number-card">' +
            '<span class="number-label">Profit / Loss</span>' +
            '<span class="number-value" style="color: ' + (profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + '">' + FreedomOS.formatMoney(profit) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="numbers-chart-section">' +
          '<h3 class="section-title">Monthly Breakdown</h3>' +
          '<div class="chart-container">' +
            '<canvas id="numbers-chart" class="chart-canvas"></canvas>' +
          '</div>' +
        '</div>' +
        '<div class="numbers-table-section">' +
          '<h3 class="section-title">Monthly Details</h3>' +
          '<table class="data-table">' +
            '<thead>' +
              '<tr><th>Month</th><th>Revenue</th><th>Costs</th><th>Profit</th></tr>' +
            '</thead>' +
            '<tbody>' + tableRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderAnalytics(project) {
    return (
      '<div class="tab-panel tab-analytics" id="tab-panel-analytics" role="tabpanel">' +
        '<div class="analytics-grid">' +
          '<div class="analytics-card">' +
            '<h4 class="analytics-title">Hours Logged</h4>' +
            '<div class="chart-container">' +
              '<canvas id="analytics-hours-chart" class="chart-canvas"></canvas>' +
            '</div>' +
          '</div>' +
          '<div class="analytics-card">' +
            '<h4 class="analytics-title">Revenue Trend</h4>' +
            '<div class="chart-container">' +
              '<canvas id="analytics-revenue-chart" class="chart-canvas"></canvas>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderFiles(project) {
    const files = project.files || [];
    let filesHtml = '';
    files.forEach(function(f, i) {
      const preview = (f.type && f.type.startsWith('image/')) ?
        '<img src="' + FreedomOS.escapeHtml(f.data) + '" alt="" class="file-thumb" loading="lazy">' :
        '<div class="file-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>';

      filesHtml += (
        '<div class="file-card" style="animation-delay: ' + (i * 50) + 'ms">' +
          '<div class="file-preview">' + preview + '</div>' +
          '<div class="file-info">' +
            '<span class="file-name">' + FreedomOS.escapeHtml(f.name) + '</span>' +
            '<span class="file-size">' + FreedomOS.escapeHtml(_formatFileSize(f.size)) + '</span>' +
          '</div>' +
          '<div class="file-actions">' +
            '<button class="btn btn-icon btn-preview-file" data-index="' + i + '" aria-label="Preview file">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
            '</button>' +
            '<button class="btn btn-icon btn-delete-file" data-index="' + i + '" aria-label="Delete file">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
            '</button>' +
          '</div>' +
        '</div>'
      );
    });

    return (
      '<div class="tab-panel tab-files" id="tab-panel-files" role="tabpanel">' +
        '<div class="files-header">' +
          '<div class="file-upload">' +
            '<input type="file" id="file-input" class="file-input" multiple>' +
            '<label for="file-input" class="btn btn-primary btn-upload">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
              'Upload File' +
            '</label>' +
          '</div>' +
        '</div>' +
        (files.length === 0 ? (
          '<div class="empty-state">' +
            '<div class="empty-state-icon">' +
              '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' +
            '</div>' +
            '<h3 class="empty-state-title">No files</h3>' +
            '<p class="empty-state-desc">Upload files up to 2MB. They are stored as Base64 in localStorage.</p>' +
          '</div>'
        ) : '<div class="files-grid">' + filesHtml + '</div>') +
      '</div>'
    );
  }

  function _formatFileSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function _renderTabContent(project) {
    switch (_currentTab) {
      case 'overview': return _renderOverview(project);
      case 'milestones': return _renderMilestones(project);
      case 'content': return _renderContent(project);
      case 'numbers': return _renderNumbers(project);
      case 'analytics': return _renderAnalytics(project);
      case 'files': return _renderFiles(project);
      default: return _renderOverview(project);
    }
  }

  function _render(projectId) {
    const project = projectId ? _getProject(projectId) : null;
    const hasProject = !!project;

    return (
      '<div class="view-warRoom">' +
        '<div class="view-header warroom-header">' +
          '<div class="warroom-title-area">' +
            '<h1 class="view-title">' + (hasProject ? FreedomOS.escapeHtml(project.name) : 'War Room') + '</h1>' +
            (hasProject ? '<span class="badge badge-status" style="background: ' + (STATUS_COLORS[project.status] || 'var(--color-text-muted)') + '20; color: ' + (STATUS_COLORS[project.status] || 'var(--color-text-muted)') + ';">' + FreedomOS.escapeHtml(project.status) + '</span>' : '') +
          '</div>' +
          (!hasProject ? _renderProjectSelector() : '') +
        '</div>' +
        (hasProject ? _renderTabNav() : '') +
        '<div class="warroom-body" style="transition: opacity 200ms ease;">' +
          (hasProject ? _renderTabContent(project) : (
            '<div class="empty-state empty-state-warroom">' +
              '<style>' +
                '@keyframes wireframe-spin {' +
                  '0% { transform: rotateY(0deg) rotateX(12deg); }' +
                  '100% { transform: rotateY(360deg) rotateX(12deg); }' +
                '}' +
                '.wireframe-cube-wrap { perspective: 500px; display: inline-block; }' +
                '.wireframe-cube { animation: wireframe-spin 10s linear infinite; transform-style: preserve-3d; display: block; }' +
              '</style>' +
              '<div class="wireframe-cube-wrap">' +
                '<svg class="wireframe-cube" width="80" height="80" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">' +
                  '<rect x="25" y="35" width="30" height="30" />' +
                  '<rect x="45" y="15" width="30" height="30" />' +
                  '<line x1="25" y1="35" x2="45" y2="15" />' +
                  '<line x1="55" y1="35" x2="75" y2="15" />' +
                  '<line x1="25" y1="65" x2="45" y2="45" />' +
                  '<line x1="55" y1="65" x2="75" y2="45" />' +
                '</svg>' +
              '</div>' +
              '<h3 class="empty-state-title" style="font-family: var(--font-display, var(--font-sans));">Select a project</h3>' +
              '<p class="empty-state-desc">Choose a project from the dropdown above to enter the War Room.</p>' +
            '</div>'
          )) +
        '</div>' +
      '</div>'
    );
  }

  function _drawNumbersChart(project) {
    const canvas = document.getElementById('numbers-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 32;

    ctx.clearRect(0, 0, width, height);

    const finances = project.finances || { monthly: [] };
    const monthly = finances.monthly || [];

    if (monthly.length === 0) {
      ctx.fillStyle = 'var(--color-text-muted)';
      ctx.font = '14px var(--font-sans)';
      ctx.textAlign = 'center';
      ctx.fillText('No monthly data', width / 2, height / 2);
      return;
    }

    const maxValue = Math.max.apply(null, monthly.map(function(m) { return Math.max(m.revenue || 0, m.costs || 0); }).concat([1]));
    const barWidth = ((width - padding * 2) / monthly.length) * 0.35;
    const groupGap = ((width - padding * 2) / monthly.length) * 0.3;
    const barGap = ((width - padding * 2) / monthly.length) * 0.05;

    monthly.forEach(function(m, i) {
      const groupX = padding + i * (barWidth * 2 + barGap + groupGap);
      const revHeight = ((m.revenue || 0) / maxValue) * (height - padding * 2);
      const costHeight = ((m.costs || 0) / maxValue) * (height - padding * 2);

      ctx.fillStyle = 'var(--color-success)';
      ctx.fillRect(groupX, height - padding - revHeight, barWidth, revHeight);

      ctx.fillStyle = 'var(--color-danger)';
      ctx.fillRect(groupX + barWidth + barGap, height - padding - costHeight, barWidth, costHeight);

      ctx.fillStyle = 'var(--color-text-secondary)';
      ctx.font = '10px var(--font-sans)';
      ctx.textAlign = 'center';
      ctx.fillText(m.month || '', groupX + barWidth, height - padding + 14);
    });
  }

  function _drawBarChart(canvasId, data, labels, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 32;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
      ctx.fillStyle = 'var(--color-text-muted)';
      ctx.font = '14px var(--font-sans)';
      ctx.textAlign = 'center';
      ctx.fillText('No data', width / 2, height / 2);
      return;
    }

    const maxValue = Math.max.apply(null, data.concat([1]));
    const barWidth = (chartWidth / data.length) * 0.6;
    const barGap = (chartWidth / data.length) * 0.4;

    data.forEach(function(value, i) {
      const barHeight = (value / maxValue) * chartHeight;
      const x = padding + i * (barWidth + barGap) + barGap / 2;
      const y = height - padding - barHeight;

      ctx.fillStyle = color || 'var(--color-primary)';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.globalAlpha = 1;

      if (labels && labels[i]) {
        ctx.fillStyle = 'var(--color-text-secondary)';
        ctx.font = '11px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barWidth / 2, height - padding + 16);
      }
    });
  }

  function _drawLineChart(canvasId, data, labels, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 32;

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
      ctx.fillStyle = 'var(--color-text-muted)';
      ctx.font = '14px var(--font-sans)';
      ctx.textAlign = 'center';
      ctx.fillText('No data', width / 2, height / 2);
      return;
    }

    const maxValue = Math.max.apply(null, data.concat([1]));
    const minValue = Math.min.apply(null, data.concat([0]));
    const range = maxValue - minValue || 1;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    ctx.strokeStyle = color || 'var(--color-primary)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach(function(value, i) {
      const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
      const y = height - padding - ((value - minValue) / range) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    ctx.lineTo(padding + chartWidth, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color || 'var(--color-primary)';
    ctx.fill();
    ctx.globalAlpha = 1;

    if (labels) {
      ctx.fillStyle = 'var(--color-text-secondary)';
      ctx.font = '11px var(--font-sans)';
      ctx.textAlign = 'center';
      labels.forEach(function(label, i) {
        const x = padding + (i / (labels.length - 1 || 1)) * chartWidth;
        ctx.fillText(label, x, height - padding + 16);
      });
    }
  }

  function _initCharts(project) {
    if (_currentTab === 'numbers') {
      _drawNumbersChart(project);
    } else if (_currentTab === 'analytics') {
      _drawBarChart('analytics-hours-chart', [], [], 'var(--color-primary)');
      const finances = project.finances || { monthly: [] };
      const monthly = finances.monthly || [];
      _drawLineChart('analytics-revenue-chart', monthly.map(function(m) { return m.revenue || 0; }), monthly.map(function(m) { return m.month || ''; }), 'var(--color-primary)');
    }
  }

  function _resizeCharts() {
    const project = _currentProjectId ? _getProject(_currentProjectId) : null;
    if (project) _initCharts(project);
  }

  function _switchTab(tabId) {
    if (_currentTab === tabId) return;

    _cleanupTabCanvas(_currentTab);
    _currentTab = tabId;

    const project = _currentProjectId ? _getProject(_currentProjectId) : null;
    if (!project) return;

    const body = document.querySelector('.warroom-body');
    if (body) {
      body.style.opacity = '0';
      setTimeout(function() {
        body.innerHTML = _renderTabContent(project);
        _attachTabListeners();
        _initCharts(project);
        body.style.opacity = '1';
      }, 200);
    }

    document.querySelectorAll('.warroom-tab').forEach(function(tab) {
      const isActive = tab.dataset.tab === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });
  }

  function _cleanupTabCanvas(tabId) {
    if (tabId === 'numbers') {
      const canvas = document.getElementById('numbers-chart');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else if (tabId === 'analytics') {
      ['analytics-hours-chart', 'analytics-revenue-chart'].forEach(function(id) {
        const canvas = document.getElementById(id);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    }
  }

  function _handleFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(function(file) {
      if (file.size > 2 * 1024 * 1024) {
        FreedomOS.toast('File too large (max 2MB): ' + file.name, 'error');
        return;
      }

      const reader = new FileReader();
      _fileReaders.push(reader);

      reader.onload = function(evt) {
        const projects = FreedomOS.get('projects') || [];
        const idx = projects.findIndex(function(p) { return p.id === _currentProjectId; });
        if (idx === -1) return;

        projects[idx].files = projects[idx].files || [];
        projects[idx].files.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: evt.target.result,
          uploadedAt: new Date().toISOString()
        });

        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('File uploaded', 'success');

        const rIdx = _fileReaders.indexOf(reader);
        if (rIdx !== -1) _fileReaders.splice(rIdx, 1);
      };

      reader.onerror = function() {
        FreedomOS.toast('Failed to read file: ' + file.name, 'error');
        const rIdx = _fileReaders.indexOf(reader);
        if (rIdx !== -1) _fileReaders.splice(rIdx, 1);
      };

      reader.readAsDataURL(file);
    });

    e.target.value = '';
  }

  function _deleteFile(index) {
    FreedomOS.confirm('Delete this file?', function() {
      const projects = FreedomOS.get('projects') || [];
      const idx = projects.findIndex(function(p) { return p.id === _currentProjectId; });
      if (idx !== -1) {
        projects[idx].files.splice(index, 1);
        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('File deleted', 'warning');
      }
    });
  }

  function _previewFile(index) {
    const project = _getProject(_currentProjectId);
    if (!project || !project.files || !project.files[index]) return;
    const file = project.files[index];

    FreedomOS.modal({
      title: FreedomOS.escapeHtml(file.name),
      content: (file.type && file.type.startsWith('image/')) ? 
        '<img src="' + FreedomOS.escapeHtml(file.data) + '" style="max-width:100%;border-radius:var(--radius-md);" alt="">' :
        '<p>Preview not available for this file type.</p>',
      confirmText: 'Close',
      onConfirm: function() {}
    });
  }

  function _addMilestone() {
    FreedomOS.prompt('Milestone title:', '', function(title) {
      if (!title || !title.trim()) return;
      const projects = FreedomOS.get('projects') || [];
      const idx = projects.findIndex(function(p) { return p.id === _currentProjectId; });
      if (idx !== -1) {
        projects[idx].milestones = projects[idx].milestones || [];
        projects[idx].milestones.push({
          id: FreedomOS.generateId(),
          title: title.trim(),
          status: 'pending',
          deadline: '',
          createdAt: new Date().toISOString()
        });
        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('Milestone added', 'success');
      }
    });
  }

  function _toggleMilestone(id) {
    const projects = FreedomOS.get('projects') || [];
    const pIdx = projects.findIndex(function(p) { return p.id === _currentProjectId; });
    if (pIdx === -1) return;

    const mIdx = projects[pIdx].milestones.findIndex(function(m) { return m.id === id; });
    if (mIdx === -1) return;

    const currentStatus = projects[pIdx].milestones[mIdx].status;
    projects[pIdx].milestones[mIdx].status = currentStatus === 'completed' ? 'pending' : 'completed';
    FreedomOS.mutate('projects', projects);
  }

  function _deleteMilestone(id) {
    FreedomOS.confirm('Delete this milestone?', function() {
      const projects = FreedomOS.get('projects') || [];
      const pIdx = projects.findIndex(function(p) { return p.id === _currentProjectId; });
      if (pIdx !== -1) {
        projects[pIdx].milestones = projects[pIdx].milestones.filter(function(m) { return m.id !== id; });
        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('Milestone deleted', 'warning');
      }
    });
  }

  function _addContent() {
    FreedomOS.prompt('Content title / hook:', '', function(title) {
      if (!title || !title.trim()) return;
      const projects = FreedomOS.get('projects') || [];
      const idx = projects.findIndex(function(p) { return p.id === _currentProjectId; });
      if (idx !== -1) {
        projects[idx].contentPieces = projects[idx].contentPieces || [];
        projects[idx].contentPieces.push({
          id: FreedomOS.generateId(),
          title: title.trim(),
          hook: title.trim(),
          platform: '',
          script: '',
          status: 'draft',
          retention: 0,
          views: 0,
          postedAt: ''
        });
        FreedomOS.mutate('projects', projects);
        FreedomOS.toast('Content piece added', 'success');
      }
    });
  }

  function _attachTabListeners() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', _handleFileUpload);
    }

    document.querySelectorAll('.btn-delete-file').forEach(function(btn) {
      btn.addEventListener('click', function() { _deleteFile(parseInt(this.dataset.index)); });
    });

    document.querySelectorAll('.btn-preview-file').forEach(function(btn) {
      btn.addEventListener('click', function() { _previewFile(parseInt(this.dataset.index)); });
    });

    document.querySelectorAll('.milestone-check').forEach(function(check) {
      check.addEventListener('change', function() { _toggleMilestone(this.dataset.id); });
    });

    document.querySelectorAll('.btn-delete-milestone').forEach(function(btn) {
      btn.addEventListener('click', function() { _deleteMilestone(this.dataset.id); });
    });

    document.querySelectorAll('.btn-add-milestone').forEach(function(btn) {
      btn.addEventListener('click', _addMilestone);
    });

    document.querySelectorAll('.btn-add-content').forEach(function(btn) {
      btn.addEventListener('click', _addContent);
    });
  }

  function _attachGlobalListeners() {
    document.querySelectorAll('.warroom-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        _switchTab(this.dataset.tab);
      });
    });

    const select = document.getElementById('warroom-project-select');
    if (select) {
      select.addEventListener('change', function() {
        if (this.value) {
          FreedomOS.navigate('warRoom/' + this.value);
        }
      });
    }
  }

  function _startCountdown() {
    const interval = setInterval(function() {
      if (_currentTab === 'overview' && _currentProjectId) {
        const project = _getProject(_currentProjectId);
        if (project) {
          const daysEl = document.querySelector('.overview-meta-grid .meta-item:nth-child(2) .meta-sub');
          if (daysEl && project.killDate) {
            const days = _daysUntil(project.killDate);
            daysEl.textContent = days !== null ? (days < 0 ? Math.abs(days) + ' days overdue' : days + ' days remaining') : '';
          }
        }
      }
    }, 60000);
    _intervals.push(interval);
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: ROUTES,
    requires: ['core', 'ui', 'utils', 'events', 'router'],

    init: function() {},

    render: function(params) {
      _currentProjectId = params && params.projectId ? params.projectId : null;
      _currentTab = 'overview';
      return _render(_currentProjectId);
    },

    onMount: function(container) {
      _attachGlobalListeners();
      _attachTabListeners();

      if (_currentProjectId) {
        const project = _getProject(_currentProjectId);
        if (project) {
          _initCharts(project);
        }
      }

      _startCountdown();

      if (window.ResizeObserver && _currentProjectId) {
        const chartContainers = container.querySelectorAll('.chart-container');
        if (chartContainers.length > 0) {
          _canvasResizeObserver = new ResizeObserver(FreedomOS.debounce(function() {
            _resizeCharts();
          }, 250));
          chartContainers.forEach(function(c) { _canvasResizeObserver.observe(c); });
        }
      }

      _windowResizeHandler = FreedomOS.debounce(function() {
        _resizeCharts();
      }, 100);
      window.addEventListener('resize', _windowResizeHandler);

      const unsub = FreedomOS.on('state:changed', function(data) {
        if (data && data.path && data.path.startsWith('projects')) {
          const body = document.querySelector('.warroom-body');
          if (body && _currentProjectId) {
            const project = _getProject(_currentProjectId);
            if (project) {
              body.innerHTML = _renderTabContent(project);
              _attachTabListeners();
              _initCharts(project);
            }
          }
        }
      });
      _unsubscribers.push(unsub);
    },

    onUnmount: function(container) {
      _unsubscribers.forEach(function(fn) { fn(); });
      _unsubscribers = [];

      _intervals.forEach(function(id) { clearInterval(id); });
      _intervals = [];

      _fileReaders.forEach(function(reader) {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      });
      _fileReaders = [];

      if (_canvasResizeObserver) {
        _canvasResizeObserver.disconnect();
        _canvasResizeObserver = null;
      }

      if (_windowResizeHandler) {
        window.removeEventListener('resize', _windowResizeHandler);
        _windowResizeHandler = null;
      }

      _cleanupTabCanvas(_currentTab);
      _currentProjectId = null;
      _currentTab = 'overview';
    }
  });
})();