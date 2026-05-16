// ============================================================
// Freedom OS — Stats
// File: js/modules/stats.js
// Depends: js/kernel/core.js, js/kernel/events.js, js/kernel/utils.js
// Provides: Lifetime aggregate metrics with count-up animations, recalculated on each render
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

  var MODULE_NAME = 'stats';
  var ROUTE_NAME = 'stats';
  var EVT_STATE_CHANGED = 'state:changed';

  var _stateUnsub = null;
  var _animationFrameIds = [];

  function _calculateStats(state) {
    var projects = state.projects || [];
    var wins = state.wins || [];
    var people = state.people || [];
    var finance = state.finance || {};
    var ledger = finance.ledger || [];
    var creatorStudio = state.creatorStudio || {};
    var contentPipeline = creatorStudio.contentPipeline || [];
    var dashboard = state.dashboard || {};
    var habits = dashboard.habits || [];
    var reviews = state.reviews || [];
    var letters = state.letters || [];

    var totalProjects = projects.length;
    var succeeded = projects.filter(function(p) { return p.status === 'scaled'; }).length;
    var killed = projects.filter(function(p) { return p.status === 'killed'; }).length;

    var totalRevenue = ledger.reduce(function(sum, e) {
      return e.type === 'income' ? sum + (e.amount || 0) : sum;
    }, 0);

    var totalCosts = ledger.reduce(function(sum, e) {
      return e.type === 'expense' ? sum + (e.amount || 0) : sum;
    }, 0);

    var totalHours = 0;
    projects.forEach(function(p) {
      if (p.finances && p.finances.monthly) {
        p.finances.monthly.forEach(function(m) { totalHours += m.hours || 0; });
      }
    });

    var longestStreak = 0;
    habits.forEach(function(h) {
      if ((h.streak || 0) > longestStreak) longestStreak = h.streak;
    });

    var winCategories = {};
    wins.forEach(function(w) {
      var cat = w.category || 'Other';
      winCategories[cat] = (winCategories[cat] || 0) + 1;
    });

    var contentPieces = contentPipeline.length;
    var networkSize = people.length;

    var currentStreak = 0;
    var todayStr = new Date().toISOString().split('T')[0];
    habits.forEach(function(h) {
      if (h.lastCompleted === todayStr) currentStreak++;
    });

    return {
      totalProjects: totalProjects,
      succeeded: succeeded,
      killed: killed,
      totalRevenue: totalRevenue,
      totalCosts: totalCosts,
      totalHours: totalHours,
      longestStreak: longestStreak,
      currentStreak: currentStreak,
      winCount: wins.length,
      winCategories: winCategories,
      contentPieces: contentPieces,
      networkSize: networkSize,
      reviewCount: reviews.length,
      letterCount: letters.length
    };
  }

  function _animateValue(el, target, duration, formatter) {
    if (!el) return;
    var start = 0;
    var startTime = null;
    formatter = formatter || function(v) { return String(Math.round(v)); };

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = start + (target - start) * eased;
      el.textContent = formatter(current);
      if (progress < 1) {
        var id = requestAnimationFrame(step);
        _animationFrameIds.push(id);
      }
    }
    var id = requestAnimationFrame(step);
    _animationFrameIds.push(id);
  }

  function _renderBigStat(label, value, subtext, iconSvg, colorVar, formatter) {
    formatter = formatter || function(v) { return String(Math.round(v)); };
    return (
      '<div class="big-stat-card" style="text-align:center;padding:var(--space-lg);">' +
        '<div class="big-stat-icon" style="width:56px;height:56px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,' + colorVar + '22,' + colorVar + '44);color:' + colorVar + ';margin-bottom:var(--space-sm);box-shadow:0 4px 12px ' + colorVar + '22;">' +
          iconSvg +
        '</div>' +
        '<div class="big-stat-info">' +
          '<span class="big-stat-value" style="display:block;font-family:var(--font-mono);font-size:2rem;font-weight:700;line-height:1;margin-bottom:4px;" data-stat-target="' + value + '" data-formatter="' + (formatter.name || '') + '">' + formatter(value) + '</span>' +
          '<span class="big-stat-label" style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-secondary);font-weight:600;">' + label + '</span>' +
          (subtext ? '<span class="big-stat-subtext" style="display:block;font-size:11px;color:var(--color-text-secondary);margin-top:4px;">' + subtext + '</span>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function _renderWinCategories(categories) {
    var cats = Object.keys(categories);
    if (cats.length === 0) {
      return (
        '<div class="stats-section win-categories-section">' +
          '<h3 class="section-title">Wins by Category</h3>' +
          '<div class="empty-state compact"><p class="empty-state-text">No wins recorded yet. Every victory starts with showing up.</p></div>' +
        '</div>'
      );
    }

    var total = Object.values(categories).reduce(function(s, v) { return s + v; }, 0);
    var colors = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-info)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-danger)'];

    var barsHtml = '';
    cats.forEach(function(cat, i) {
      var pct = (categories[cat] / total * 100).toFixed(1);
      barsHtml += (
        '<div class="category-bar-row">' +
          '<div class="category-bar-label">' +
            '<span class="category-dot" style="background:' + colors[i % colors.length] + '"></span>' +
            '<span>' + FreedomOS.escapeHtml(cat) + '</span>' +
            '<span class="category-count">' + categories[cat] + '</span>' +
          '</div>' +
          '<div class="category-bar-track">' +
            '<div class="category-bar-fill" style="width:' + pct + '%;background:' + colors[i % colors.length] + '"></div>' +
          '</div>' +
        '</div>'
      );
    });

    return (
      '<div class="stats-section win-categories-section">' +
        '<h3 class="section-title">Wins by Category</h3>' +
        '<div class="category-bars">' + barsHtml + '</div>' +
      '</div>'
    );
  }

  function _renderProjectBreakdown(stats) {
    if (stats.totalProjects === 0) {
      return (
        '<div class="stats-section project-breakdown-section">' +
          '<h3 class="section-title">Project Breakdown</h3>' +
          '<div class="empty-state compact"><p class="empty-state-text">No projects yet. Start something today.</p></div>' +
        '</div>'
      );
    }

    var total = stats.totalProjects;
    var succeededPct = Math.round((stats.succeeded / total) * 100);
    var killedPct = Math.round((stats.killed / total) * 100);
    var otherPct = 100 - succeededPct - killedPct;

    return (
      '<div class="stats-section project-breakdown-section">' +
        '<h3 class="section-title">Project Breakdown</h3>' +
        '<div class="breakdown-grid">' +
          '<div class="breakdown-item">' +
            '<span class="breakdown-value" style="color:var(--color-success)">' + stats.succeeded + '</span>' +
            '<span class="breakdown-label">Succeeded</span>' +
            '<span class="breakdown-pct">' + succeededPct + '%</span>' +
          '</div>' +
          '<div class="breakdown-item">' +
            '<span class="breakdown-value" style="color:var(--color-danger)">' + stats.killed + '</span>' +
            '<span class="breakdown-label">Killed</span>' +
            '<span class="breakdown-pct">' + killedPct + '%</span>' +
          '</div>' +
          '<div class="breakdown-item">' +
            '<span class="breakdown-value" style="color:var(--color-text-secondary)">' + (stats.totalProjects - stats.succeeded - stats.killed) + '</span>' +
            '<span class="breakdown-label">In Progress</span>' +
            '<span class="breakdown-pct">' + otherPct + '%</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderContent(state) {
    var stats = _calculateStats(state);

    var icons = {
      projects: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
      revenue: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
      hours: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      streak: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      wins: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
      content: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
      network: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
      reviews: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
    };

    return (
      '<div class="view-stats">' +
        '<div class="stats-header">' +
          '<h2 class="view-title">Lifetime Stats</h2>' +
          '<p class="view-subtitle">Your operator journey, aggregated.</p>' +
        '</div>' +
        '<div class="big-stats-grid">' +
          _renderBigStat('Projects Attempted', stats.totalProjects, stats.totalProjects === 0 ? 'Start your first project' : stats.succeeded + ' succeeded', icons.projects, 'var(--color-primary)') +
          _renderBigStat('Total Revenue', stats.totalRevenue, stats.totalRevenue === 0 ? 'Revenue starts with action' : FreedomOS.formatMoney(stats.totalRevenue - stats.totalCosts) + ' net', icons.revenue, 'var(--color-success)', function(v) { return FreedomOS.formatMoney(v); }) +
          _renderBigStat('Hours Logged', stats.totalHours, stats.totalHours === 0 ? 'Time invested is time earned' : 'across all projects', icons.hours, 'var(--color-info)', function(v) { return FreedomOS.formatDuration(Math.round(v * 3600)); }) +
          _renderBigStat('Longest Streak', stats.longestStreak, stats.longestStreak === 0 ? 'Build the chain today' : 'consecutive days', icons.streak, 'var(--color-warning)') +
          _renderBigStat('Total Wins', stats.winCount, stats.winCount === 0 ? 'Record your first win' : 'recorded victories', icons.wins, 'var(--color-secondary)') +
          _renderBigStat('Content Pieces', stats.contentPieces, stats.contentPieces === 0 ? 'Create and publish' : 'created & published', icons.content, 'var(--color-primary)') +
          _renderBigStat('Network Size', stats.networkSize, stats.networkSize === 0 ? 'Your network is your net worth' : 'contacts tracked', icons.network, 'var(--color-info)') +
          _renderBigStat('Reviews Written', stats.reviewCount, stats.reviewCount === 0 ? 'Reflect to grow' : 'weekly retrospectives', icons.reviews, 'var(--color-secondary)') +
        '</div>' +
        '<div class="stats-detail-grid">' +
          _renderWinCategories(stats.winCategories) +
          _renderProjectBreakdown(stats) +
        '</div>' +
      '</div>'
    );
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
      var root = container.querySelector('.view-stats');
      if (!root) return;

      root.querySelectorAll('[data-stat-target]').forEach(function(el) {
        var target = parseFloat(el.dataset.statTarget) || 0;
        var formatterName = el.dataset.formatter;
        var formatter = function(v) { return String(Math.round(v)); };
        if (formatterName && FreedomOS.formatMoney && el.textContent.indexOf('$') >= 0) {
          formatter = function(v) { return FreedomOS.formatMoney(v); };
        }
        _animateValue(el, target, 1200, formatter);
      });

      root.querySelectorAll('.category-bar-fill').forEach(function(bar) {
        var targetWidth = bar.style.width;
        bar.style.width = '0%';
        requestAnimationFrame(function() {
          bar.style.width = targetWidth;
        });
      });

      var stateHandler = function() {
        if (FreedomOS.currentRoute !== ROUTE_NAME) return;
        var activeEl = document.activeElement;
        if (activeEl && /INPUT|TEXTAREA|SELECT/.test(activeEl.tagName)) return;
        if (!root) return;
        root.innerHTML = _renderContent(FreedomOS.state);
        root.querySelectorAll('[data-stat-target]').forEach(function(el) {
          var target = parseFloat(el.dataset.statTarget) || 0;
          _animateValue(el, target, 800);
        });
      };
      _stateUnsub = FreedomOS.on(EVT_STATE_CHANGED, stateHandler);
    },

    onUnmount: function(container) {
      _animationFrameIds.forEach(function(id) { cancelAnimationFrame(id); });
      _animationFrameIds = [];

      if (_stateUnsub) {
        _stateUnsub();
        _stateUnsub = null;
      }
    }
  });
})();