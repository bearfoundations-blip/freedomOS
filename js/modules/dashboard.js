// ============================================================
// Freedom OS — Dashboard (POLISHED — ATMOSPHERE + GLOW + SPACING FIX)
// File: js/modules/dashboard.js
// Depends: js/kernel/core.js, js/kernel/events.js, js/kernel/ui.js, js/kernel/utils.js
// Provides: Premium dashboard with brand identity, proper spacing, TikTok-ready visuals
// Last Updated: 2026-05-10
// ============================================================

(function() {
  'use strict';

  var MODULE_NAME = 'dashboard';
  var ROUTE_NAME = 'dashboard';
  var EVT_STATE_CHANGED = 'state:changed';

  // ---- HARDCODED TARGET DATE ----
  var TARGET_DATE = '2029-05-21';

  var HABIT_CATEGORIES = ['Health', 'Work', 'Learning', 'Creative', 'Other'];
  var INTENTION_PRIORITIES = ['low', 'medium', 'high'];

  var _listeners = [];
  var _debouncers = {};
  var _stateUnsub = null;
  var _currentQuoteIndex = null;
  var _countdownInterval = null;

  // ---- BRAND LOGO SVG ----
  var BRAND_LOGO_SVG = '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 2L4 9v14l12 7 12-7V9L16 2z" stroke="url(#brandGrad)" stroke-width="2" stroke-linejoin="round" fill="none"/><path d="M16 2v28M4 9l12 7 12-7" stroke="url(#brandGrad)" stroke-width="1.5" stroke-linejoin="round" fill="none"/><circle cx="16" cy="16" r="3" fill="url(#brandGrad)"/><defs><linearGradient id="brandGrad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="#00d4aa"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs></svg>';

  // ---- DATE HELPERS ----
  function _todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function _isToday(dateStr) {
    if (!dateStr) return false;
    return dateStr === _todayStr();
  }

  function _isYesterday(dateStr) {
    if (!dateStr) return false;
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dateStr === d.toISOString().split('T')[0];
  }

  function _getMonthStart(offset) {
    var d = new Date();
    d.setMonth(d.getMonth() + offset);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _getMonthEnd(offset) {
    var d = new Date();
    d.setMonth(d.getMonth() + offset + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // ---- HABIT STATUS ----
  function _getHabitStatus(habit) {
    if (!habit || !habit.lastCompleted) {
      return { streak: 0, doneToday: false, canContinue: false };
    }
    var doneToday = _isToday(habit.lastCompleted);
    var canContinue = doneToday || _isYesterday(habit.lastCompleted);
    return {
      streak: canContinue ? (habit.streak || 0) : 0,
      doneToday: doneToday,
      canContinue: canContinue
    };
  }

  // ---- SCORE CALCULATION ----
  function _calculateOperatorScore(state) {
    var habits = state.dashboard.habits || [];
    var wins = state.wins || [];
    var reviews = state.reviews || [];
    var projects = state.projects || [];

    var habitScore = habits.length > 0
      ? habits.filter(function(h) { return _getHabitStatus(h).doneToday; }).length / habits.length
      : 0;

    var oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    var weeklyWins = wins.filter(function(w) {
      return w.date && new Date(w.date) >= oneWeekAgo;
    }).length;
    var winScore = Math.min(weeklyWins / 5, 1);

    var hasRecentReview = reviews.some(function(r) {
      return r.weekStart && new Date(r.weekStart) >= oneWeekAgo;
    });
    var reviewScore = hasRecentReview ? 1 : 0;

    var activeProjects = projects.filter(function(p) { return p.status === 'active'; }).length;
    var projectScore = Math.min(activeProjects / 3, 1);

    var raw = (habitScore * 0.3) + (winScore * 0.2) + (reviewScore * 0.2) + (projectScore * 0.3);
    return {
      total: Math.round(raw * 100),
      habits: Math.round(habitScore * 100),
      wins: Math.round(winScore * 100),
      reviews: Math.round(reviewScore * 100),
      projects: Math.round(projectScore * 100)
    };
  }

  // ---- DATA GETTERS ----
  function _getCurrentMonthRevenue(state) {
    var start = _getMonthStart(0);
    var end = _getMonthEnd(0);
    return (state.finance.ledger || []).reduce(function(sum, entry) {
      if (!entry || entry.type !== 'income' || !entry.date) return sum;
      var d = new Date(entry.date);
      return d >= start && d <= end ? sum + (entry.amount || 0) : sum;
    }, 0);
  }

  function _getActiveProjectsCount(state) {
    return (state.projects || []).filter(function(p) { return p.status === 'active'; }).length;
  }

  function _getCurrentStreak(state) {
    var habits = state.dashboard.habits || [];
    if (habits.length === 0) return 0;
    var streaks = habits.map(function(h) { return _getHabitStatus(h).streak; });
    return Math.max.apply(null, streaks.concat([0]));
  }

  function _getRecentWins(state) {
    return (state.wins || [])
      .filter(function(w) { return w.date; })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); })
      .slice(0, 3);
  }

  function _getUpcomingFollowUps(state) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return (state.people || [])
      .filter(function(p) { return p.followUpDate && new Date(p.followUpDate) >= today; })
      .sort(function(a, b) { return new Date(a.followUpDate) - new Date(b.followUpDate); })
      .slice(0, 5);
  }

  // ---- DEBOUNCED SAVE ----
  function _debouncedSave(key, path, value) {
    if (_debouncers[key]) {
      clearTimeout(_debouncers[key]);
    }
    _debouncers[key] = setTimeout(function() {
      FreedomOS.mutate(path, value);
      delete _debouncers[key];
    }, 600);
  }

  // ---- COUNTDOWN CALCULATION ----
  function _getCountdownValues() {
    var now = new Date();
    var target = new Date(TARGET_DATE + 'T00:00:00');
    var diff = target - now;

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      expired: false
    };
  }

  // ============================================================
  // KEY STATS BAR — clean horizontal stat row (replaces ticker in hero)
  // ============================================================
  function _renderKeyStats(state) {
    var score = _calculateOperatorScore(state);
    var ap = _getActiveProjectsCount(state);
    var streak = _getCurrentStreak(state);

    var oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    var weeklyWins = (state.wins || []).filter(function(w) {
      return w.date && new Date(w.date) >= oneWeekAgo;
    }).length;

    var stats = [
      { icon: '🚀', label: 'Active', value: ap + ' Projects', id: 'stat-active' },
      { icon: '⚡', label: 'Score', value: score.total + '/100', id: 'stat-score' },
      { icon: '🔥', label: 'Streak', value: streak + ' Days', id: 'stat-streak' },
      { icon: '📈', label: 'Wins', value: weeklyWins + ' This Week', id: 'stat-wins' }
    ];

    var html = stats.map(function(s) {
      return (
        '<div class="key-stat-pill" id="' + s.id + '">' +
          '<span class="key-stat-icon">' + s.icon + '</span>' +
          '<span class="key-stat-label">' + FreedomOS.escapeHtml(s.label) + '</span>' +
          '<span class="key-stat-separator">:</span>' +
          '<span class="key-stat-value">' + FreedomOS.escapeHtml(s.value) + '</span>' +
        '</div>'
      );
    }).join('');

    return '<div class="key-stats-bar">' + html + '</div>';
  }

  // ---- RENDER: HERO SECTION (COUNTDOWN FIX) ----
  function _renderHero(state) {
    var cd = _getCountdownValues();

    var quotes = state.settings && state.settings.stageModeQuotes ? state.settings.stageModeQuotes : [];
    var quote;
    if (quotes.length > 0) {
      if (_currentQuoteIndex === null) {
        _currentQuoteIndex = Math.floor(Math.random() * quotes.length);
      }
      quote = quotes[_currentQuoteIndex];
    } else {
      quote = { text: 'The best time to start was yesterday. The next best time is now.', author: 'Unknown' };
    }

    var activeProject = (state.projects || []).find(function(p) { return p.status === 'active'; });
    var missionText = activeProject ? activeProject.name : 'Freedom OS';
    var missionSub = activeProject ? (activeProject.hypothesis || 'Building in public') : 'Your mission starts here';

    // Countdown HTML — explicitly built to avoid merge errors
    var countdownHtml = '';
    countdownHtml += '<div class="countdown-display">';
    countdownHtml +=   '<div class="countdown-unit">';
    countdownHtml +=     '<span class="countdown-number" id="cd-days">' + cd.days + '</span>';
    countdownHtml +=     '<span class="countdown-label">Days</span>';
    countdownHtml +=   '</div>';
    countdownHtml +=   '<span class="countdown-separator">:</span>';
    countdownHtml +=   '<div class="countdown-unit">';
    countdownHtml +=     '<span class="countdown-number" id="cd-hours">' + String(cd.hours).padStart(2, '0') + '</span>';
    countdownHtml +=     '<span class="countdown-label">Hours</span>';
    countdownHtml +=   '</div>';
    countdownHtml +=   '<span class="countdown-separator">:</span>';
    countdownHtml +=   '<div class="countdown-unit">';
    countdownHtml +=     '<span class="countdown-number" id="cd-minutes">' + String(cd.minutes).padStart(2, '0') + '</span>';
    countdownHtml +=     '<span class="countdown-label">Minutes</span>';
    countdownHtml +=   '</div>';
    countdownHtml +=   '<span class="countdown-separator">:</span>';
    countdownHtml +=   '<div class="countdown-unit">';
    countdownHtml +=     '<span class="countdown-number" id="cd-seconds">' + String(cd.seconds).padStart(2, '0') + '</span>';
    countdownHtml +=     '<span class="countdown-label">Seconds</span>';
    countdownHtml +=   '</div>';
    countdownHtml += '</div>';

    return (
      '<div class="dashboard-hero">' +
        '<div class="hero-top">' +
          '<div class="hero-brand">' +
            '<div class="brand-mark">' + BRAND_LOGO_SVG + '<span class="brand-text">Freedom OS</span></div>' +
          '</div>' +
          '<div class="hero-target">Target: ' + TARGET_DATE + '</div>' +
        '</div>' +
        '<div class="countdown-wrapper">' +
          countdownHtml +
          '<div class="countdown-mission">' +
            '<div class="countdown-mission-label">Current Mission</div>' +
            '<div class="countdown-mission-text">' + FreedomOS.escapeHtml(missionText) + '</div>' +
            '<p style="color: var(--color-text-secondary); margin-top: var(--space-sm); font-size: 0.9375rem;">' + FreedomOS.escapeHtml(missionSub) + '</p>' +
          '</div>' +
          _renderKeyStats(state) +
        '</div>' +
        '<div class="hero-quote">' +
          '<p class="quote-text">' + FreedomOS.escapeHtml(quote.text) + '</p>' +
          '<p class="quote-author">' + FreedomOS.escapeHtml(quote.author || 'Unknown') + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  // ---- LIVE COUNTDOWN UPDATE (BULLETPROOF) ----
  function _updateCountdownDOM() {
    var cd = _getCountdownValues();
    var daysEl = document.getElementById('cd-days');
    var hoursEl = document.getElementById('cd-hours');
    var minutesEl = document.getElementById('cd-minutes');
    var secondsEl = document.getElementById('cd-seconds');

    if (daysEl) daysEl.textContent = cd.days;
    if (hoursEl) hoursEl.textContent = String(cd.hours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(cd.minutes).padStart(2, '0');
    if (secondsEl) secondsEl.textContent = String(cd.seconds).padStart(2, '0');
  }

  function _startCountdown() {
    _stopCountdown();
    _updateCountdownDOM(); // Immediate update — no blank flash
    _countdownInterval = setInterval(_updateCountdownDOM, 1000);
  }

  function _stopCountdown() {
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }
  }

  // ---- RENDER: OPERATOR SCORE ----
  function _renderOperatorScore(scoreObj) {
    var color = scoreObj.total >= 80 ? 'var(--color-success)' : scoreObj.total >= 50 ? 'var(--color-primary)' : 'var(--color-warning)';
    var factors = [
      { name: 'Habits', value: scoreObj.habits },
      { name: 'Wins', value: scoreObj.wins },
      { name: 'Reviews', value: scoreObj.reviews },
      { name: 'Projects', value: scoreObj.projects }
    ];

    var factorsHtml = '';
    factors.forEach(function(f) {
      var factorClass = f.value < 50 ? 'factor-fill-low' : f.value < 80 ? 'factor-fill-mid' : 'factor-fill-high';
      factorsHtml += (
        '<div class="score-factor">' +
          '<div class="factor-header">' +
            '<span class="factor-name">' + f.name + '</span>' +
            '<span class="factor-value">' + f.value + '%</span>' +
          '</div>' +
          '<div class="factor-bar-track">' +
            '<div class="factor-bar-fill ' + factorClass + '" style="width:' + f.value + '%"></div>' +
          '</div>' +
        '</div>'
      );
    });

    return (
      '<div class="operator-score-section">' +
        '<div class="score-header-row">' +
          '<h2 class="score-title">Operator Score</h2>' +
          '<div class="score-badge-large">' + scoreObj.total + '<span>/100</span></div>' +
        '</div>' +
        '<div class="score-main-bar">' +
          '<div class="score-main-fill" style="width:' + scoreObj.total + '%;background:' + color + '"></div>' +
        '</div>' +
        '<div class="score-factors">' + factorsHtml + '</div>' +
      '</div>'
    );
  }

  // ---- RENDER: QUICK STATS ----
  function _renderQuickStats(state) {
    var revenue = _getCurrentMonthRevenue(state);
    var activeProjects = _getActiveProjectsCount(state);
    var streak = _getCurrentStreak(state);

    return (
      '<div class="quick-stats-section">' +
        '<div class="quick-stat-card">' +
          '<div class="stat-icon-wrap">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' +
          '</div>' +
          '<div class="stat-body">' +
            '<span class="stat-number primary">' + FreedomOS.formatMoney(revenue) + '</span>' +
            '<span class="stat-description">Revenue This Month</span>' +
          '</div>' +
        '</div>' +
        '<div class="quick-stat-card">' +
          '<div class="stat-icon-wrap">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>' +
          '</div>' +
          '<div class="stat-body">' +
            '<span class="stat-number success">' + activeProjects + '</span>' +
            '<span class="stat-description">Active Projects</span>' +
          '</div>' +
        '</div>' +
        '<div class="quick-stat-card">' +
          '<div class="stat-icon-wrap">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
          '</div>' +
          '<div class="stat-body">' +
            '<span class="stat-number primary">' + streak + '</span>' +
            '<span class="stat-description">Current Streak</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ---- RENDER: DAY LOG PREVIEW ----
  function _renderDayLogPreview(state) {
    var todayStr = new Date().toISOString().split('T')[0];
    var logs = state.dayLog && state.dayLog.logs ? state.dayLog.logs : [];
    var todayLog = logs.find(function(l) { return l.date === todayStr; });
    var completion = 0;
    var hasContent = false;
    var previewText = 'Start your daily log to track learning, ideas, and wins.';
    var streak = state.dayLog && state.dayLog.streak ? state.dayLog.streak : 0;

    if (todayLog) {
      var sections = ['whatILearned', 'ideas', 'notes', 'wins', 'tomorrowsFocus'];
      var filled = sections.filter(function(key) {
        return todayLog[key] && todayLog[key].trim().length > 0;
      }).length;
      completion = Math.round((filled / sections.length) * 100);
      hasContent = filled > 0;

      var firstFilled = sections.find(function(key) {
        return todayLog[key] && todayLog[key].trim().length > 0;
      });
      if (firstFilled) {
        previewText = todayLog[firstFilled].substring(0, 80) + '...';
      }
    }

    var completionColor = completion >= 80 ? 'var(--color-success)' : completion >= 40 ? 'var(--color-primary)' : 'var(--color-warning)';
    var streakBadge = streak > 0 ? '<span class="daylog-preview-streak">🔥 ' + streak + '</span>' : '';

    return (
      '<div class="dashboard-section-card daylog-preview-card" data-action="navigate-daylog">' +
        '<div class="section-card-header">' +
          '<h3 class="section-card-title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' +
            'Today\'s Log' +
          '</h3>' +
          streakBadge +
        '</div>' +
        '<div class="daylog-preview-body">' +
          '<div class="daylog-preview-ring">' +
            '<svg viewBox="0 0 36 36">' +
              '<path class="completion-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />' +
              '<path class="completion-ring-fill" stroke-dasharray="' + completion + ', 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" style="stroke:' + completionColor + '" />' +
            '</svg>' +
            '<span class="completion-text">' + completion + '%</span>' +
          '</div>' +
          '<div class="daylog-preview-info">' +
            '<p class="daylog-preview-text">' + FreedomOS.escapeHtml(previewText) + '</p>' +
            '<span class="daylog-preview-cta">' + (hasContent ? 'Continue Log →' : 'Start Today\'s Log →') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ---- RENDER: HABITS ----
  function _renderHabits(habits) {
    if (!habits || habits.length === 0) {
      return (
        '<div class="dashboard-section-card habits-section">' +
          '<div class="section-card-header">' +
            '<h3 class="section-card-title">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' +
              'Habits' +
            '</h3>' +
            '<button class="section-card-action" data-action="add-habit" aria-label="Add habit">+</button>' +
          '</div>' +
          '<div class="empty-state-compact">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1" opacity="0.3"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' +
            '<p>No habits tracked yet. Build discipline by tracking daily habits.</p>' +
            '<button class="btn btn-secondary" data-action="add-habit">Add First Habit</button>' +
          '</div>' +
        '</div>'
      );
    }

    var habitsHtml = '';
    habits.forEach(function(habit, index) {
      var status = _getHabitStatus(habit);
      var doneClass = status.doneToday ? 'done' : '';
      var streakClass = status.streak >= 7 ? 'hot' : '';
      habitsHtml += (
        '<div class="habit-row ' + doneClass + '" data-habit-id="' + habit.id + '">' +
          '<button class="habit-check-btn ' + (status.doneToday ? 'checked' : '') + '" data-action="toggle-habit" data-habit-id="' + habit.id + '" aria-label="' + (status.doneToday ? 'Mark incomplete' : 'Mark complete') + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</button>' +
          '<div class="habit-info">' +
            '<span class="habit-name">' + FreedomOS.escapeHtml(habit.name) + '</span>' +
            '<span class="habit-category-tag">' + FreedomOS.escapeHtml(habit.category || 'Other') + '</span>' +
          '</div>' +
          '<div class="habit-streak-badge ' + streakClass + '">' +
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-1.5 4-1.5 6.5S11 13 12 13s1.5-2 1.5-4.5S12 2 12 2z"/><path d="M12 13c-3 0-5.5 2.5-5.5 5.5S9 24 12 24s5.5-5 5.5-5.5S15 13 12 13z"/></svg>' +
            status.streak +
          '</div>' +
          '<button class="habit-delete-btn" data-action="delete-habit" data-habit-id="' + habit.id + '" aria-label="Delete habit">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>'
      );
    });

    return (
      '<div class="dashboard-section-card habits-section">' +
        '<div class="section-card-header">' +
          '<h3 class="section-card-title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' +
            'Habits' +
          '</h3>' +
          '<button class="section-card-action" data-action="add-habit" aria-label="Add habit">+</button>' +
        '</div>' +
        '<div class="habits-list stagger-children">' + habitsHtml + '</div>' +
      '</div>'
    );
  }


  // ---- RENDER: INTENTIONS ----
  function _renderIntentions(intentions) {
    if (!intentions || intentions.length === 0) {
      return (
        '<div class="dashboard-section-card intentions-section">' +
          '<div class="section-card-header">' +
            '<h3 class="section-card-title">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><path d="M9 5a2 2 0 012-2h2a2 2 0 012 2"/><path d="M12 12h.01"/></svg>' +
              'Daily Intentions' +
            '</h3>' +
            '<button class="section-card-action" data-action="add-intention" aria-label="Add intention">+</button>' +
          '</div>' +
          '<div class="empty-state-compact">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1" opacity="0.3"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/><polygon points="12,6 18,10 18,14 12,18 6,14 6,10"/></svg>' +
            '<p>No intentions set for today. Set 1-3 priorities to stay focused.</p>' +
            '<button class="btn btn-secondary" data-action="add-intention">Add Intention</button>' +
          '</div>' +
        '</div>'
      );
    }

    var intentionsHtml = '';
    intentions.forEach(function(intention) {
      var priorityClass = 'priority-' + (intention.priority || 'medium');
      var completedClass = intention.completed ? 'completed' : '';
      intentionsHtml += (
        '<div class="intention-row ' + priorityClass + ' ' + completedClass + '" data-intention-id="' + intention.id + '">' +
          '<button class="intention-check-btn ' + (intention.completed ? 'checked' : '') + '" data-action="toggle-intention" data-intention-id="' + intention.id + '" aria-label="' + (intention.completed ? 'Mark incomplete' : 'Mark complete') + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</button>' +
          '<div class="intention-content">' +
            '<span class="intention-text">' + FreedomOS.escapeHtml(intention.text) + '</span>' +
            '<span class="intention-priority-badge ' + priorityClass + '">' + (intention.priority || 'medium') + '</span>' +
          '</div>' +
          '<button class="intention-delete-btn" data-action="delete-intention" data-intention-id="' + intention.id + '" aria-label="Delete intention">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>'
      );
    });

    return (
      '<div class="dashboard-section-card intentions-section">' +
        '<div class="section-card-header">' +
          '<h3 class="section-card-title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><path d="M9 5a2 2 0 012-2h2a2 2 0 012 2"/><path d="M12 12h.01"/></svg>' +
            'Daily Intentions' +
          '</h3>' +
          '<button class="section-card-action" data-action="add-intention" aria-label="Add intention">+</button>' +
        '</div>' +
        '<div class="intentions-list stagger-children">' + intentionsHtml + '</div>' +
      '</div>'
    );
  }

  // ---- RENDER: RECENT WINS ----
  function _renderRecentWins(wins) {
    if (!wins || wins.length === 0) {
      return (
        '<div class="dashboard-section-card wins-section">' +
          '<div class="section-card-header">' +
            '<h3 class="section-card-title">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
              'Recent Wins' +
            '</h3>' +
            '<a href="#" class="link-text" data-action="navigate-wins" style="font-size: 0.875rem; color: var(--color-primary); text-decoration: none;">View All →</a>' +
          '</div>' +
          '<div class="empty-state-compact">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1" opacity="0.3"><path d="M12 2l10 10-10 10L2 12z"/><path d="M12 7l5 5-5 5-5-5z"/></svg>' +
            '<p>No wins recorded yet. Go get one.</p>' +
            '<button class="btn btn-secondary btn-sm" data-action="navigate-wins">Record a Win</button>' +
          '</div>' +
        '</div>'
      );
    }

    var categoryColors = {
      'Revenue': 'var(--color-primary)',
      'Viral': 'var(--color-secondary)',
      'Milestone': 'var(--color-info)',
      'Personal': 'var(--color-warning)',
      'Launch': 'var(--color-success)',
      'Other': 'var(--color-text-muted)'
    };

    var winsHtml = '';
    wins.forEach(function(win) {
      var color = categoryColors[win.category] || categoryColors['Other'];
      winsHtml += (
        '<div class="win-preview-item" style="--win-color:' + color + '" data-action="navigate-wins">' +
          '<div class="win-preview-content">' +
            '<h4 class="win-preview-title">' + FreedomOS.escapeHtml(win.title) + '</h4>' +
            '<div class="win-preview-meta">' +
              '<span class="win-preview-category" style="color:' + color + '">' + (win.category || 'Other') + '</span>' +
              '<span class="win-preview-date">' + new Date(win.date).toLocaleDateString() + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    });

    return (
      '<div class="dashboard-section-card wins-section">' +
        '<div class="section-card-header">' +
          '<h3 class="section-card-title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
            'Recent Wins' +
          '</h3>' +
          '<a href="#" class="link-text" data-action="navigate-wins" style="font-size: 0.875rem; color: var(--color-primary); text-decoration: none;">View All →</a>' +
        '</div>' +
        '<div class="wins-preview-list stagger-children">' + winsHtml + '</div>' +
      '</div>'
    );
  }

  // ---- RENDER: FOLLOW-UPS ----
  function _renderFollowUps(people) {
    if (!people || people.length === 0) {
      return (
        '<div class="dashboard-section-card followups-section">' +
          '<div class="section-card-header">' +
            '<h3 class="section-card-title">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' +
              'Follow-ups' +
            '</h3>' +
            '<a href="#" class="link-text" data-action="navigate-people" style="font-size: 0.875rem; color: var(--color-primary); text-decoration: none;">View All →</a>' +
          '</div>' +
          '<div class="empty-state-compact">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1" opacity="0.3"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8l-7 11M12 8l7 11M5 19h14"/></svg>' +
            '<p>No upcoming follow-ups. Add contacts to track relationships.</p>' +
            '<button class="btn btn-secondary btn-sm" data-action="navigate-people">Add Contact</button>' +
          '</div>' +
        '</div>'
      );
    }

    var peopleHtml = '';
    people.forEach(function(person) {
      var daysUntil = Math.ceil((new Date(person.followUpDate) - new Date()) / (1000 * 60 * 60 * 24));
      var urgencyClass = daysUntil <= 1 ? 'urgent' : daysUntil <= 3 ? 'soon' : 'later';
      var daysClass = daysUntil <= 1 ? 'urgent' : daysUntil <= 3 ? 'soon' : '';
      peopleHtml += (
        '<div class="followup-item ' + urgencyClass + '">' +
          '<div class="followup-avatar">' + (person.name ? person.name.charAt(0).toUpperCase() : '?') + '</div>' +
          '<div class="followup-info">' +
            '<span class="followup-name">' + FreedomOS.escapeHtml(person.name) + '</span>' +
            '<span class="followup-platform">' + FreedomOS.escapeHtml(person.platform || '') + '</span>' +
          '</div>' +
          '<div class="followup-meta">' +
            '<span class="followup-days ' + daysClass + '">' + daysUntil + 'd</span>' +
            '<span class="followup-date-label">' + new Date(person.followUpDate).toLocaleDateString() + '</span>' +
          '</div>' +
        '</div>'
      );
    });

    return (
      '<div class="dashboard-section-card followups-section">' +
        '<div class="section-card-header">' +
          '<h3 class="section-card-title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' +
            'Follow-ups' +
          '</h3>' +
          '<a href="#" class="link-text" data-action="navigate-people" style="font-size: 0.875rem; color: var(--color-primary); text-decoration: none;">View All →</a>' +
        '</div>' +
        '<div class="followups-list stagger-children">' + peopleHtml + '</div>' +
      '</div>'
    );
  }

  // ---- MAIN RENDER ----
  function _renderContent(state) {
    var scoreObj = _calculateOperatorScore(state);
    var habits = state.dashboard.habits || [];
    var intentions = state.dashboard.dailyIntentions || [];
    var recentWins = _getRecentWins(state);
    var followUps = _getUpcomingFollowUps(state);

    return (
      _renderHero(state) +
      _renderOperatorScore(scoreObj) +
      _renderQuickStats(state) +
      '<div class="dashboard-main-grid">' +
        '<div class="dashboard-col primary">' +
          _renderDayLogPreview(state) +
          _renderHabits(habits) +
          _renderIntentions(intentions) +
        '</div>' +
        '<div class="dashboard-col secondary">' +
          _renderRecentWins(recentWins) +
          _renderFollowUps(followUps) +
        '</div>' +
      '</div>'
    );
  }

  // ---- ACTION HANDLERS ----
  function _handleAddHabit() {
    FreedomOS.prompt('Habit name:', '', function(name) {
      if (!name || !name.trim()) return;
      FreedomOS.prompt('Category:', 'Health', function(category) {
        var validCat = HABIT_CATEGORIES.indexOf(category) >= 0 ? category : 'Other';
        var habits = FreedomOS.deepClone(FreedomOS.get('dashboard.habits') || []);
        habits.push({
          id: FreedomOS.generateId(),
          name: name.trim(),
          streak: 0,
          lastCompleted: null,
          category: validCat
        });
        FreedomOS.mutate('dashboard.habits', habits);
        FreedomOS.toast('Habit added', 'success');
      });
    });
  }

  function _handleToggleHabit(habitId) {
    var habits = FreedomOS.deepClone(FreedomOS.get('dashboard.habits') || []);
    var habit = null;
    for (var i = 0; i < habits.length; i++) {
      if (habits[i].id === habitId) { habit = habits[i]; break; }
    }
    if (!habit) return;

    var status = _getHabitStatus(habit);
    if (status.doneToday) {
      habit.lastCompleted = null;
      habit.streak = Math.max(0, (habit.streak || 0) - 1);
    } else {
      if (_isYesterday(habit.lastCompleted)) {
        habit.streak = (habit.streak || 0) + 1;
      } else {
        habit.streak = 1;
      }
      habit.lastCompleted = _todayStr();
    }
    FreedomOS.mutate('dashboard.habits', habits);
  }

  function _handleDeleteHabit(habitId) {
    FreedomOS.confirm('Delete this habit?', function() {
      var habits = FreedomOS.deepClone(FreedomOS.get('dashboard.habits') || []);
      var filtered = [];
      for (var i = 0; i < habits.length; i++) {
        if (habits[i].id !== habitId) filtered.push(habits[i]);
      }
      FreedomOS.mutate('dashboard.habits', filtered);
      FreedomOS.toast('Habit deleted', 'info');
    });
  }

  function _handleAddIntention() {
    FreedomOS.prompt('Intention:', '', function(text) {
      if (!text || !text.trim()) return;
      FreedomOS.prompt('Priority (low/medium/high):', 'medium', function(priority) {
        var validPriority = INTENTION_PRIORITIES.indexOf(priority) >= 0 ? priority : 'medium';
        var intentions = FreedomOS.deepClone(FreedomOS.get('dashboard.dailyIntentions') || []);
        intentions.push({
          id: FreedomOS.generateId(),
          text: text.trim(),
          completed: false,
          priority: validPriority
        });
        FreedomOS.mutate('dashboard.dailyIntentions', intentions);
        FreedomOS.toast('Intention added', 'success');
      });
    });
  }

  function _handleToggleIntention(intentionId) {
    var intentions = FreedomOS.deepClone(FreedomOS.get('dashboard.dailyIntentions') || []);
    var intention = null;
    for (var i = 0; i < intentions.length; i++) {
      if (intentions[i].id === intentionId) { intention = intentions[i]; break; }
    }
    if (!intention) return;
    intention.completed = !intention.completed;
    FreedomOS.mutate('dashboard.dailyIntentions', intentions);
  }

  function _handleDeleteIntention(intentionId) {
    FreedomOS.confirm('Delete this intention?', function() {
      var intentions = FreedomOS.deepClone(FreedomOS.get('dashboard.dailyIntentions') || []);
      var filtered = [];
      for (var i = 0; i < intentions.length; i++) {
        if (intentions[i].id !== intentionId) filtered.push(intentions[i]);
      }
      FreedomOS.mutate('dashboard.dailyIntentions', filtered);
      FreedomOS.toast('Intention deleted', 'info');
    });
  }

  // ---- MODULE REGISTRATION ----
  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: [],

    init: function() {},

    render: function(params) {
      return '<div class="view-dashboard">' + _renderContent(FreedomOS.state) + '</div>';
    },

    onMount: function(container) {
      var root = container.querySelector('.view-dashboard');
      if (!root) return;

      // Start the live countdown — immediate + interval
      _startCountdown();

      // Staggered entrance animation
      var cards = container.querySelectorAll('.dashboard-section-card, .operator-score-section, .quick-stat-card');
      cards.forEach(function(card, i) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(function() {
          card.style.transition = 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, i * 80);
      });

      // Number counting animation
      var animateNumber = function(el, targetStr, duration) {
        var isMoney = targetStr.indexOf('$') >= 0;
        var targetNum = parseFloat(targetStr.replace(/[^0-9.-]/g, ''));
        if (isNaN(targetNum)) return;

        var start = null;
        var step = function(timestamp) {
          if (!start) start = timestamp;
          var progress = Math.min((timestamp - start) / duration, 1);
          var easeOut = 1 - Math.pow(1 - progress, 3);
          var current = targetNum * easeOut;

          if (isMoney) {
            el.textContent = '$' + Math.round(current).toLocaleString();
          } else {
            el.textContent = Math.round(current);
          }

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.textContent = targetStr;
          }
        };
        requestAnimationFrame(step);
      };

      var statNumbers = container.querySelectorAll('.stat-number');
      statNumbers.forEach(function(el) {
        var targetStr = el.textContent;
        animateNumber(el, targetStr, 1200);
      });

      // Click delegation
      var clickHandler = function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;

        var action = btn.dataset.action;
        switch (action) {
          case 'add-habit': _handleAddHabit(); break;
          case 'toggle-habit': _handleToggleHabit(btn.dataset.habitId); break;
          case 'delete-habit': _handleDeleteHabit(btn.dataset.habitId); break;
          case 'add-intention': _handleAddIntention(); break;
          case 'toggle-intention': _handleToggleIntention(btn.dataset.intentionId); break;
          case 'delete-intention': _handleDeleteIntention(btn.dataset.intentionId); break;
          case 'navigate-wins': e.preventDefault(); FreedomOS.navigate('wins'); break;
          case 'navigate-people': e.preventDefault(); FreedomOS.navigate('people'); break;
          case 'navigate-daylog': e.preventDefault(); FreedomOS.navigate('dayLog'); break;
        }
      };
      root.addEventListener('click', clickHandler);
      _listeners.push({ el: root, type: 'click', fn: clickHandler });

      // Input delegation
      var inputHandler = function(e) {
        var input = e.target.closest('[data-action]');
        if (!input) return;

        var action = input.dataset.action;
        var value = input.value;
        switch (action) {
          case 'energy-change':
            _debouncedSave('energy', 'dashboard.energy.level', parseInt(value, 10));
            var ev = document.getElementById('energy-value');
            if (ev) ev.textContent = value + '/10';
            break;
          case 'energy-notes':
            _debouncedSave('energy-notes', 'dashboard.energy.notes', value);
            break;
          case 'mood-change':
            _debouncedSave('mood', 'dashboard.mood.score', parseInt(value, 10));
            var mv = document.getElementById('mood-value');
            if (mv) mv.textContent = value + '/10';
            break;
          case 'mood-label':
            _debouncedSave('mood-label', 'dashboard.mood.label', value);
            break;
        }
      };
      root.addEventListener('input', inputHandler);
      _listeners.push({ el: root, type: 'input', fn: inputHandler });

      // State change re-render (skip if user is typing)
      var stateHandler = function() {
        if (FreedomOS.currentRoute !== ROUTE_NAME) return;
        var activeEl = document.activeElement;
        if (activeEl && /INPUT|TEXTAREA|SELECT/.test(activeEl.tagName)) return;
        if (!root) return;
        root.innerHTML = _renderContent(FreedomOS.state);
        _startCountdown();
      };
      _stateUnsub = FreedomOS.on(EVT_STATE_CHANGED, stateHandler);
    },

    onUnmount: function(container) {
      _stopCountdown();

      _listeners.forEach(function(l) {
        l.el.removeEventListener(l.type, l.fn);
      });
      _listeners = [];

      if (_stateUnsub) {
        _stateUnsub();
        _stateUnsub = null;
      }

      Object.keys(_debouncers).forEach(function(key) {
        clearTimeout(_debouncers[key]);
      });
      _debouncers = {};
    }
  });
})();