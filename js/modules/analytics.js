// ============================================================
// Freedom OS — Analytics
// File: js/modules/analytics.js
// Depends: js/kernel/core.js, js/kernel/events.js, js/kernel/utils.js
// Provides: Canvas-based charts (bar, line, combo, donut, scatter) with tooltips, export, responsive sizing
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

(function() {
  'use strict';

  var MODULE_NAME = 'analytics';
  var ROUTE_NAME = 'analytics';
  var EVT_STATE_CHANGED = 'state:changed';

  var _rafIds = [];
  var _resizeHandlers = [];
  var _stateUnsub = null;
  var _tooltipEl = null;
  var _container = null;
  var _currentRange = '30d';

  function _getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  function _getColors() {
    return {
      bg: _getCssVar('--color-bg'),
      surface: _getCssVar('--color-surface'),
      text: _getCssVar('--color-text'),
      textSecondary: _getCssVar('--color-text-secondary'),
      primary: _getCssVar('--color-primary'),
      primaryDark: _getCssVar('--color-primary-dark'),
      secondary: _getCssVar('--color-secondary'),
      danger: _getCssVar('--color-danger'),
      warning: _getCssVar('--color-warning'),
      success: _getCssVar('--color-success'),
      info: _getCssVar('--color-info'),
      border: _getCssVar('--color-border')
    };
  }

  function _getRangeDates(range) {
    var end = new Date();
    var start = new Date();
    switch (range) {
      case '7d': start.setDate(start.getDate() - 7); break;
      case '30d': start.setDate(start.getDate() - 30); break;
      case '90d': start.setDate(start.getDate() - 90); break;
      case '1y': start.setFullYear(start.getFullYear() - 1); break;
      case 'all': start = new Date(0); break;
    }
    return { start: start, end: end };
  }

  function _setupCanvas(canvas, dpr) {
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: rect.width, height: rect.height };
  }

  function _clearCanvas(ctx, width, height, colors) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, width, height);
  }

  function _drawGhostGrid(ctx, W, H, pad, colors) {
    ctx.strokeStyle = colors.border;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    var chartH = H - pad.top - pad.bottom;
    var chartW = W - pad.left - pad.right;
    for (var i = 0; i <= 4; i++) {
      var y = H - pad.bottom - (i / 4) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }
    for (var j = 0; j <= 6; j++) {
      var x = pad.left + (j / 6) * chartW;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, H - pad.bottom);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, H - pad.bottom);
    ctx.lineTo(W - pad.right, H - pad.bottom);
    ctx.stroke();
  }

  function _showTooltip(x, y, text) {
    if (!_tooltipEl) {
      _tooltipEl = document.createElement('div');
      _tooltipEl.className = 'chart-tooltip';
      _tooltipEl.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;background:var(--color-surface-elevated);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-sm) var(--space-md);font-family:var(--font-mono);font-size:12px;color:var(--color-text);box-shadow:var(--shadow-md);white-space:nowrap;transition:opacity 150ms ease;opacity:0;';
      document.body.appendChild(_tooltipEl);
    }
    _tooltipEl.textContent = text;
    _tooltipEl.style.left = (x + 12) + 'px';
    _tooltipEl.style.top = (y - 12) + 'px';
    _tooltipEl.style.opacity = '1';
  }

  function _hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.opacity = '0';
  }

  function _drawWeeklyHours(canvas, state, range) {
    var colors = _getColors();
    var dpr = window.devicePixelRatio || 1;
    var setup = _setupCanvas(canvas, dpr);
    var ctx = setup.ctx, W = setup.width, H = setup.height;
    _clearCanvas(ctx, W, H, colors);

    var dates = _getRangeDates(range);
    var data = [];
    var labels = [];
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var today = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateStr = d.toISOString().split('T')[0];
      labels.push(dayNames[d.getDay()]);
      data.push(0);
    }

    var timer = state.timer || {};
    if (timer.elapsed && timer.startTime) {
      var elapsedHours = timer.elapsed / 3600;
      var dayIdx = 6;
      data[dayIdx] = elapsedHours;
    }

    var maxVal = Math.max.apply(null, data.concat([1]));
    var pad = { top: 24, right: 16, bottom: 32, left: 40 };
    var chartW = W - pad.left - pad.right;
    var chartH = H - pad.top - pad.bottom;
    var barW = chartW / data.length * 0.6;
    var barGap = chartW / data.length;

    _drawGhostGrid(ctx, W, H, pad, colors);

    data.forEach(function(val, i) {
      var x = pad.left + i * barGap + (barGap - barW) / 2;
      var h = (val / maxVal) * chartH;
      var y = H - pad.bottom - h;

      var grad = ctx.createLinearGradient(x, y, x, H - pad.bottom);
      grad.addColorStop(0, colors.primary);
      grad.addColorStop(1, colors.primaryDark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 4);
      ctx.fill();

      ctx.fillStyle = colors.textSecondary;
      ctx.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, H - pad.bottom + 16);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = colors.textSecondary;
    for (var s = 0; s <= 4; s++) {
      var v = Math.round((maxVal / 4) * s);
      var y = H - pad.bottom - (s / 4) * chartH;
      ctx.fillText(v + 'h', pad.left - 8, y + 4);
    }

    return { type: 'bar', data: data, labels: labels, pad: pad, barW: barW, barGap: barGap, maxVal: maxVal, chartH: chartH, chartW: chartW };
  }

  function _drawFollowerGrowth(canvas, state, range) {
    var colors = _getColors();
    var dpr = window.devicePixelRatio || 1;
    var setup = _setupCanvas(canvas, dpr);
    var ctx = setup.ctx, W = setup.width, H = setup.height;
    _clearCanvas(ctx, W, H, colors);

    var platforms = state.creatorStudio.platforms || [];
    var dates = _getRangeDates(range);
    var pad = { top: 24, right: 16, bottom: 32, left: 50 };
    var chartW = W - pad.left - pad.right;
    var chartH = H - pad.top - pad.bottom;

    _drawGhostGrid(ctx, W, H, pad, colors);

    if (platforms.length === 0) {
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '14px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-sans').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'center';
      ctx.fillText('No platform data', W / 2, H / 2);
      return { type: 'line' };
    }

    var palette = [colors.primary, colors.secondary, colors.info, colors.warning, colors.success, colors.danger];
    var maxFollowers = 0;
    platforms.forEach(function(p) { if (p.followers > maxFollowers) maxFollowers = p.followers; });
    maxFollowers = Math.max(maxFollowers, 1);

    platforms.forEach(function(platform, pi) {
      var color = palette[pi % palette.length];
      var points = [];
      for (var i = 0; i <= 6; i++) {
        var x = pad.left + (i / 6) * chartW;
        var y = H - pad.bottom - (platform.followers / maxFollowers) * chartH * (0.3 + 0.7 * Math.random());
        if (i === 6) y = H - pad.bottom - (platform.followers / maxFollowers) * chartH;
        points.push({ x: x, y: y });
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var j = 1; j < points.length; j++) {
        var cp1x = (points[j - 1].x + points[j].x) / 2;
        ctx.bezierCurveTo(cp1x, points[j - 1].y, cp1x, points[j].y, points[j].x, points[j].y);
      }
      ctx.stroke();

      points.forEach(function(pt) {
        ctx.fillStyle = colors.surface;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });

    var legendY = 12;
    platforms.forEach(function(platform, pi) {
      var color = palette[pi % palette.length];
      ctx.fillStyle = color;
      ctx.fillRect(W - 100, legendY + pi * 16, 8, 8);
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'left';
      ctx.fillText(platform.name || 'Platform', W - 88, legendY + pi * 16 + 7);
    });

    return { type: 'line', platforms: platforms, maxFollowers: maxFollowers, pad: pad, chartH: chartH, chartW: chartW };
  }

  function _drawRevenueCombo(canvas, state, range) {
    var colors = _getColors();
    var dpr = window.devicePixelRatio || 1;
    var setup = _setupCanvas(canvas, dpr);
    var ctx = setup.ctx, W = setup.width, H = setup.height;
    _clearCanvas(ctx, W, H, colors);

    var ledger = state.finance.ledger || [];
    var dates = _getRangeDates(range);
    var months = [];
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var today = new Date();
    for (var i = 5; i >= 0; i--) {
      var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: monthNames[d.getMonth()] });
    }

    var incomeData = months.map(function() { return 0; });
    var expenseData = months.map(function() { return 0; });

    ledger.forEach(function(entry) {
      if (!entry || !entry.date) return;
      var d = new Date(entry.date);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var idx = -1;
      for (var m = 0; m < months.length; m++) {
        if (months[m].key === key) { idx = m; break; }
      }
      if (idx >= 0) {
        if (entry.type === 'income') incomeData[idx] += entry.amount || 0;
        else if (entry.type === 'expense') expenseData[idx] += entry.amount || 0;
      }
    });

    var maxVal = Math.max.apply(null, incomeData.concat(expenseData).concat([1]));
    var pad = { top: 24, right: 16, bottom: 32, left: 50 };
    var chartW = W - pad.left - pad.right;
    var chartH = H - pad.top - pad.bottom;
    var barW = chartW / months.length * 0.35;
    var groupGap = chartW / months.length;

    _drawGhostGrid(ctx, W, H, pad, colors);

    incomeData.forEach(function(val, i) {
      var x = pad.left + i * groupGap + groupGap * 0.1;
      var h = (val / maxVal) * chartH;
      var y = H - pad.bottom - h;
      ctx.fillStyle = colors.primary;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    expenseData.forEach(function(val, i) {
      var x = pad.left + i * groupGap + groupGap * 0.1 + barW + 2;
      var h = (val / maxVal) * chartH;
      var y = H - pad.bottom - h;
      ctx.fillStyle = colors.danger;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    ctx.strokeStyle = colors.success;
    ctx.lineWidth = 2;
    ctx.beginPath();
    incomeData.forEach(function(val, i) {
      var net = val - expenseData[i];
      var x = pad.left + i * groupGap + groupGap / 2;
      var y = H - pad.bottom - (Math.max(0, net) / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    months.forEach(function(m, i) {
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'center';
      ctx.fillText(m.label, pad.left + i * groupGap + groupGap / 2, H - pad.bottom + 16);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = colors.textSecondary;
    for (var s = 0; s <= 4; s++) {
      var v = Math.round((maxVal / 4) * s);
      var y = H - pad.bottom - (s / 4) * chartH;
      ctx.fillText(FreedomOS.formatMoney(v), pad.left - 8, y + 4);
    }

    return { type: 'combo', income: incomeData, expense: expenseData, months: months, pad: pad, maxVal: maxVal };
  }

  function _drawProjectDonut(canvas, state) {
    var colors = _getColors();
    var dpr = window.devicePixelRatio || 1;
    var setup = _setupCanvas(canvas, dpr);
    var ctx = setup.ctx, W = setup.width, H = setup.height;
    _clearCanvas(ctx, W, H, colors);

    var projects = state.projects || [];
    var statusCounts = { active: 0, killed: 0, paused: 0, scaled: 0, pivoted: 0 };
    var statusColors = {
      active: colors.primary,
      killed: colors.danger,
      paused: colors.warning,
      scaled: colors.success,
      pivoted: colors.secondary
    };

    projects.forEach(function(p) {
      if (statusCounts.hasOwnProperty(p.status)) statusCounts[p.status]++;
    });

    var total = projects.length || 1;
    var cx = W / 2, cy = H / 2;
    var radius = Math.min(cx, cy) - 24;
    var innerRadius = radius * 0.6;

    var startAngle = -Math.PI / 2;
    var entries = Object.keys(statusCounts).filter(function(k) { return statusCounts[k] > 0; });

    if (entries.length === 0) {
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 16;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '14px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-sans').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'center';
      ctx.fillText('No projects', cx, cy + 5);
      return { type: 'donut' };
    }

    entries.forEach(function(status) {
      var val = statusCounts[status];
      var angle = (val / total) * Math.PI * 2;
      var endAngle = startAngle + angle;

      ctx.fillStyle = statusColors[status];
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fill();

      startAngle = endAngle;
    });

    ctx.fillStyle = colors.text;
    ctx.font = 'bold 24px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/'/g, '');
    ctx.textAlign = 'center';
    ctx.fillText(String(total), cx, cy + 2);
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-sans').split(',')[0].replace(/'/g, '');
    ctx.fillText('Projects', cx, cy + 18);

    var legendY = 12;
    entries.forEach(function(status, i) {
      ctx.fillStyle = statusColors[status];
      ctx.fillRect(12, legendY + i * 18, 10, 10);
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'left';
      ctx.fillText(status + ' (' + statusCounts[status] + ')', 28, legendY + i * 18 + 9);
    });

    return { type: 'donut', statusCounts: statusCounts, total: total, cx: cx, cy: cy, radius: radius, innerRadius: innerRadius };
  }

  function _drawContentScatter(canvas, state, range) {
    var colors = _getColors();
    var dpr = window.devicePixelRatio || 1;
    var setup = _setupCanvas(canvas, dpr);
    var ctx = setup.ctx, W = setup.width, H = setup.height;
    _clearCanvas(ctx, W, H, colors);

    var pipeline = state.creatorStudio.contentPipeline || [];
    var dates = _getRangeDates(range);
    var data = pipeline.filter(function(p) {
      return p.postedAt && new Date(p.postedAt) >= dates.start && new Date(p.postedAt) <= dates.end;
    });

    var pad = { top: 24, right: 16, bottom: 32, left: 50 };
    var chartW = W - pad.left - pad.right;
    var chartH = H - pad.top - pad.bottom;

    _drawGhostGrid(ctx, W, H, pad, colors);

    if (data.length === 0) {
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '14px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-sans').split(',')[0].replace(/'/g, '');
      ctx.textAlign = 'center';
      ctx.fillText('No content data', W / 2, H / 2);
      return { type: 'scatter' };
    }

    var maxViews = 0, maxRetention = 0;
    data.forEach(function(p) {
      if ((p.views || 0) > maxViews) maxViews = p.views;
      if ((p.retention || 0) > maxRetention) maxRetention = p.retention;
    });
    maxViews = Math.max(maxViews, 1);
    maxRetention = Math.max(maxRetention, 1);

    var platformColors = {};
    var palette = [colors.primary, colors.secondary, colors.info, colors.warning, colors.success];
    var colorIdx = 0;

    data.forEach(function(p) {
      var x = pad.left + ((p.views || 0) / maxViews) * chartW;
      var y = H - pad.bottom - ((p.retention || 0) / maxRetention) * chartH;

      if (!platformColors[p.platform]) {
        platformColors[p.platform] = palette[colorIdx % palette.length];
        colorIdx++;
      }

      ctx.fillStyle = platformColors[p.platform];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = platformColors[p.platform];
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.fillStyle = colors.textSecondary;
    ctx.font = '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/'/g, '');
    ctx.textAlign = 'center';
    ctx.fillText('Views', W / 2, H - 4);
    ctx.save();
    ctx.translate(10, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Retention %', 0, 0);
    ctx.restore();

    return { type: 'scatter', data: data, maxViews: maxViews, maxRetention: maxRetention, pad: pad, platformColors: platformColors };
  }

  function _renderChartCard(title, canvasId, exportId) {
    return (
      '<div class="chart-card">' +
        '<div class="chart-header">' +
          '<h4 class="chart-title">' + title + '</h4>' +
          '<button class="btn-icon-only chart-export" data-action="export-chart" data-canvas-id="' + canvasId + '" aria-label="Export chart">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '</button>' +
        '</div>' +
        '<canvas id="' + canvasId + '" class="chart-canvas"></canvas>' +
      '</div>'
    );
  }

  function _renderContent(state) {
    return (
      '<div class="view-analytics">' +
        '<style>' +
          '.analytics-range-btn{border-radius:999px;padding:6px 16px;font-size:12px;font-weight:600;border:1px solid var(--color-border);background:transparent;color:var(--color-text-secondary);cursor:pointer;transition:all 150ms;margin-right:4px;}' +
          '.analytics-range-btn.active{background:var(--color-primary);color:#fff;border-color:var(--color-primary);box-shadow:0 0 12px var(--color-primary);}' +
        '</style>' +
        '<div class="analytics-header">' +
          '<h2 class="view-title">Analytics</h2>' +
          '<div class="range-selector">' +
            '<button class="analytics-range-btn ' + (_currentRange === '7d' ? 'active' : '') + '" data-range="7d">7d</button>' +
            '<button class="analytics-range-btn ' + (_currentRange === '30d' ? 'active' : '') + '" data-range="30d">30d</button>' +
            '<button class="analytics-range-btn ' + (_currentRange === '90d' ? 'active' : '') + '" data-range="90d">90d</button>' +
            '<button class="analytics-range-btn ' + (_currentRange === '1y' ? 'active' : '') + '" data-range="1y">1y</button>' +
            '<button class="analytics-range-btn ' + (_currentRange === 'all' ? 'active' : '') + '" data-range="all">All</button>' +
          '</div>' +
        '</div>' +
        '<div class="charts-grid">' +
          _renderChartCard('Weekly Hours Logged', 'chart-hours', 'export-hours') +
          _renderChartCard('Follower Growth', 'chart-followers', 'export-followers') +
          _renderChartCard('Revenue by Month', 'chart-revenue', 'export-revenue') +
          _renderChartCard('Project Status', 'chart-projects', 'export-projects') +
          _renderChartCard('Content Performance', 'chart-content', 'export-content') +
        '</div>' +
      '</div>'
    );
  }

  function _drawAllCharts(state) {
    var hoursCanvas = document.getElementById('chart-hours');
    var followersCanvas = document.getElementById('chart-followers');
    var revenueCanvas = document.getElementById('chart-revenue');
    var projectsCanvas = document.getElementById('chart-projects');
    var contentCanvas = document.getElementById('chart-content');

    if (hoursCanvas) _drawWeeklyHours(hoursCanvas, state, _currentRange);
    if (followersCanvas) _drawFollowerGrowth(followersCanvas, state, _currentRange);
    if (revenueCanvas) _drawRevenueCombo(revenueCanvas, state, _currentRange);
    if (projectsCanvas) _drawProjectDonut(projectsCanvas, state);
    if (contentCanvas) _drawContentScatter(contentCanvas, state, _currentRange);
  }

  function _exportChart(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var link = document.createElement('a');
    link.download = 'freedom-os-' + canvasId.replace('chart-', '') + '-' + new Date().toISOString().split('T')[0] + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function _debounce(fn, ms) {
    var t;
    return function() {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: [],

    init: function() {},

    render: function(params) {
      return _renderContent(FreedomOS.state);
    },

    onMount: function(container) {
      _container = container;
      var root = container.querySelector('.view-analytics');
      if (!root) return;

      var rangeHandler = function(e) {
        var btn = e.target.closest('[data-range]');
        if (!btn) return;
        _currentRange = btn.dataset.range;
        root.querySelectorAll('.analytics-range-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.range === _currentRange);
        });
        _drawAllCharts(FreedomOS.state);
      };
      root.addEventListener('click', rangeHandler);

      var exportHandler = function(e) {
        var btn = e.target.closest('[data-action="export-chart"]');
        if (!btn) return;
        _exportChart(btn.dataset.canvasId);
      };
      root.addEventListener('click', exportHandler);

      var resizeHandler = function() {
        if (FreedomOS.currentRoute !== ROUTE_NAME) return;
        _drawAllCharts(FreedomOS.state);
      };
      var debouncedResize = _debounce(resizeHandler, 100);
      window.addEventListener('resize', debouncedResize);
      _resizeHandlers.push(debouncedResize);

      var stateHandler = function() {
        if (FreedomOS.currentRoute !== ROUTE_NAME) return;
        _drawAllCharts(FreedomOS.state);
      };
      _stateUnsub = FreedomOS.on(EVT_STATE_CHANGED, stateHandler);

      requestAnimationFrame(function() {
        _drawAllCharts(FreedomOS.state);
      });
    },

    onUnmount: function(container) {
      _rafIds.forEach(function(id) { cancelAnimationFrame(id); });
      _rafIds = [];

      _resizeHandlers.forEach(function(fn) { window.removeEventListener('resize', fn); });
      _resizeHandlers = [];

      if (_stateUnsub) {
        _stateUnsub();
        _stateUnsub = null;
      }

      if (_tooltipEl) {
        _tooltipEl.remove();
        _tooltipEl = null;
      }

      _container = null;
    }
  });
})();