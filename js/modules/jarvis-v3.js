/**
 * JARVIS v3 — Freedom OS Holographic AI Assistant
 * js/modules/jarvis-v3.js
 *
 * Unified build integrating:
 *   - Part A: State Management (localStorage persistence)
 *   - Part B: API Layer (Groq via Vercel Edge Function)
 *   - Part C: UI Controller (rendering, animation, interaction)
 *   - Part D: Action Engine (direct state manipulation)
 *   - Part E: Scanner Integration (live state reading)
 *   - Part F: Code Diff Viewer (baby-proof animation)
 *   - Part G: Module Registration
 *
 * Vanilla JS, IIFE, 'use strict'
 * All state via FreedomOS.mutate / localStorage
 * All DOM via scoped querySelector inside module root
 */
(function () {
  'use strict';

  /* ============================================================
     PART A — STATE MANAGEMENT (localStorage Persistence)
     ============================================================ */

  var JARVIS_STORAGE_KEY = 'jarvis_v3_state';

  var _loadState = function () {
    try {
      var raw = localStorage.getItem(JARVIS_STORAGE_KEY);
      if (!raw) return _defaultState();
      var parsed = JSON.parse(raw);
      var def = _defaultState();
      return {
        conversations:         parsed.conversations         || def.conversations,
        currentConversationId: parsed.currentConversationId || def.currentConversationId,
        preferences:           Object.assign({}, def.preferences, parsed.preferences || {}),
        codeHistory:           parsed.codeHistory           || def.codeHistory,
        kbCache:               parsed.kbCache               || def.kbCache
      };
    } catch (e) {
      console.warn('[JARVIS] State load failed, resetting.', e);
      return _defaultState();
    }
  };

  var _defaultState = function () {
    return {
      conversations: [],
      currentConversationId: null,
      preferences: {
        autoSuggest:     true,
        soundEnabled:    false,
        cinematicOnOpen: false
      },
      codeHistory: [],
      kbCache: null
    };
  };

  var _jarvisState = _loadState();

  var _saveState = function () {
    try {
      localStorage.setItem(JARVIS_STORAGE_KEY, JSON.stringify(_jarvisState));
    } catch (e) {
      console.warn('[JARVIS] State save failed.', e);
    }
  };

  /* ── Conversation helpers ──────────────────────────────────── */

  var _newConversation = function () {
    var id = FreedomOS.generateId();
    var conv = {
      id:        id,
      title:     'New conversation',
      messages:  [],
      timestamp: Date.now()
    };
    _jarvisState.conversations.unshift(conv);
    _jarvisState.currentConversationId = id;
    _saveState();
    return conv;
  };

  var _currentConversation = function () {
    if (!_jarvisState.currentConversationId) return null;
    return _jarvisState.conversations.find(function (c) {
      return c.id === _jarvisState.currentConversationId;
    }) || null;
  };

  var _ensureConversation = function () {
    var conv = _currentConversation();
    if (!conv) conv = _newConversation();
    return conv;
  };

  var _appendMessage = function (role, content, extras) {
    var conv = _ensureConversation();
    var msg = Object.assign({
      id:        FreedomOS.generateId(),
      role:      role,
      content:   content,
      timestamp: Date.now()
    }, extras || {});
    conv.messages.push(msg);
    if (role === 'user' && conv.messages.filter(function (m) { return m.role === 'user'; }).length === 1) {
      conv.title = content.slice(0, 48) + (content.length > 48 ? '…' : '');
    }
    _saveState();
    return msg;
  };

  var _addCodeHistory = function (entry) {
    var record = Object.assign({
      id: FreedomOS.generateId(),
      timestamp: Date.now(),
      applied: false
    }, entry);
    _jarvisState.codeHistory.unshift(record);
    if (_jarvisState.codeHistory.length > 50) _jarvisState.codeHistory.length = 50;
    _saveState();
    return record;
  };


  /* ============================================================
     PART E — SCANNER INTEGRATION (Live State Reading)
     ============================================================ */

  var _scanner = (function () {
    'use strict';

    var _today = function () {
      var d = new Date();
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    };

    var _daysAgo = function (n) {
      var d = new Date();
      d.setDate(d.getDate() - n);
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    };

    var _parseDate = function (str) {
      if (!str) return null;
      var parts = String(str).split('-');
      if (parts.length !== 3) return null;
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    };

    var _daysBetween = function (a, b) {
      var da = _parseDate(a), db = _parseDate(b);
      if (!da || !db) return 0;
      return Math.round((db - da) / 86400000);
    };

    var _isoWeek = function (dateStr) {
      var d = _parseDate(dateStr);
      if (!d) return 0;
      var jan4 = new Date(d.getFullYear(), 0, 4);
      var startOfWeek1 = new Date(jan4);
      startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
      return Math.floor(((d - startOfWeek1) / 86400000 + 0.5) / 7) + 1;
    };

    var _weekStart = function () {
      var d = new Date();
      var day = d.getDay();
      var diff = (day === 0) ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    };

    var _monthStart = function () {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    };

    var _s = function () { return FreedomOS.state || {}; };
    var _get = function (path) {
      try { return FreedomOS.get(path); } catch (_) { return undefined; }
    };
    var _arr = function (path) {
      var v = _get(path);
      return Array.isArray(v) ? v : [];
    };
    var _num = function (path, fallback) {
      var v = _get(path);
      var n = parseFloat(v);
      return isNaN(n) ? (fallback || 0) : n;
    };

    var _financeSummary = function (ledger, sinceDate, untilDate) {
      sinceDate = sinceDate || '1970-01-01';
      untilDate = untilDate || _today();
      var income = 0, expenses = 0, investment = 0;
      ledger.forEach(function (entry) {
        var d = entry.date || '';
        if (d < sinceDate || d > untilDate) return;
        var amount = parseFloat(entry.amount) || 0;
        if (entry.type === 'income')     income     += amount;
        if (entry.type === 'expense')    expenses   += amount;
        if (entry.type === 'investment') investment += amount;
      });
      return { income: income, expenses: expenses, investment: investment, profit: income - expenses - investment, total: income };
    };

    var _calcRunway = function (ledger, cashOnHand) {
      var thirtyDaysAgo = _daysAgo(30);
      var recentExpenses = ledger
        .filter(function (e) {
          return (e.type === 'expense' || e.type === 'investment') && (e.date || '') >= thirtyDaysAgo;
        })
        .reduce(function (sum, e) { return sum + (parseFloat(e.amount) || 0); }, 0);
      var dailyBurn = recentExpenses / 30;
      if (dailyBurn <= 0) return Infinity;
      return Math.floor(cashOnHand / dailyBurn);
    };

    var _calcOperatorScore = function (state) {
      var score = 0;
      var habits = Array.isArray(state.dashboard && state.dashboard.habits) ? state.dashboard.habits : [];
      var activeHabits = habits.filter(function (h) { return h.lastCompleted >= _daysAgo(7); });
      if (habits.length > 0) {
        var avgStreak = activeHabits.reduce(function (s, h) { return s + (h.streak || 0); }, 0) / habits.length;
        score += Math.min(30, Math.round(avgStreak * 2));
      }
      var wins = Array.isArray(state.wins) ? state.wins : [];
      var wkStart = _weekStart();
      var weekWins = wins.filter(function (w) { return (w.date || '') >= wkStart; }).length;
      score += Math.min(25, weekWins * 4);
      var logs = Array.isArray(state.dayLog && state.dayLog.logs) ? state.dayLog.logs : [];
      var logStreak = 0;
      var checkDate = _today();
      for (var i = 0; i < 30; i++) {
        var hasLog = logs.some(function (l) { return l.date === checkDate && l.whatILearned; });
        if (hasLog) { logStreak++; checkDate = _daysAgo(i + 1); } else break;
      }
      score += Math.min(25, logStreak * 4);
      var pipeline = Array.isArray(state.creatorStudio && state.creatorStudio.pipeline) ? state.creatorStudio.pipeline : [];
      var activeContent = pipeline.filter(function (p) {
        return p.status !== 'idea' && (p.created || '') >= wkStart;
      }).length;
      score += Math.min(20, activeContent * 5);
      return Math.min(100, score);
    };

    var getSummary = function () {
      var state = _s();
      var today = _today();
      var wkStart = _weekStart();
      var mStart = _monthStart();
      var projects = _arr('projects');
      var activeProjects = projects.filter(function (p) { return p.status === 'active'; });
      var shippedCount = projects.filter(function (p) { return p.status === 'shipped'; }).length;
      var wins = _arr('wins');
      var weeklyWins = wins.filter(function (w) { return (w.date || '') >= wkStart; });
      var todayWins = wins.filter(function (w) { return (w.date || '') === today; });
      var winsByCategory = wins.reduce(function (acc, w) {
        var cat = w.category || 'Other';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});
      var ledger = _arr('finance.ledger');
      var mtdFinance = _financeSummary(ledger, mStart, today);
      var allTimeIncome = _financeSummary(ledger).income;
      var cashOnHand = _num('finance.cashOnHand', 0);
      var dailyBurn = (function () {
        var last30Exp = ledger
          .filter(function (e) { return (e.type === 'expense' || e.type === 'investment') && (e.date || '') >= _daysAgo(30); })
          .reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
        return Math.round(last30Exp / 30 * 100) / 100;
      }());
      var runway = _calcRunway(ledger, cashOnHand);
      var habits = Array.isArray(state.dashboard && state.dashboard.habits) ? state.dashboard.habits : [];
      var habitsCompletedToday = habits.filter(function (h) { return h.lastCompleted === today; });
      var topStreak = habits.reduce(function (max, h) { return Math.max(max, h.streak || 0); }, 0);
      var habitCompletionRate = habits.length > 0 ? Math.round(habitsCompletedToday.length / habits.length * 100) : 0;
      var logs = Array.isArray(state.dayLog && state.dayLog.logs) ? state.dayLog.logs : [];
      var dayLogStreak = 0;
      for (var i = 0; i < 60; i++) {
        var checkDay = _daysAgo(i);
        if (logs.some(function (l) { return l.date === checkDay && l.whatILearned; })) {
          dayLogStreak++;
        } else { break; }
      }
      var loggedToday = logs.some(function (l) { return l.date === today; });
      var people = _arr('people');
      var overdueFollowups = people.filter(function (p) { return p.followUpDate && p.followUpDate <= today; });
      var followupsDueSoon = people.filter(function (p) {
        var due = p.followUpDate;
        return due && due > today && due <= _daysAgo(-7);
      });
      var pipeline = Array.isArray(state.creatorStudio && state.creatorStudio.pipeline) ? state.creatorStudio.pipeline : [];
      var pipelineByStatus = pipeline.reduce(function (acc, p) {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {});
      var liveCount = pipelineByStatus.live || 0;
      var editingCount = pipelineByStatus.editing || 0;
      var ideaCount = pipelineByStatus.idea || 0;
      var totalViews = pipeline.reduce(function (s, p) { return s + (p.views || 0); }, 0);
      var operatorScore = _calcOperatorScore(state);

      return {
        today: today,
        weekStart: wkStart,
        activeProjects: activeProjects.length,
        shippedProjects: shippedCount,
        projectNames: activeProjects.map(function (p) { return p.name; }),
        totalWins: wins.length,
        weeklyWins: weeklyWins.length,
        todayWins: todayWins.length,
        winsByCategory: winsByCategory,
        lastWin: wins[0] ? { title: wins[0].title, date: wins[0].date } : null,
        revenue: mtdFinance.income,
        expenses: mtdFinance.expenses,
        profit: mtdFinance.profit,
        allTimeRevenue: allTimeIncome,
        cashOnHand: cashOnHand,
        burnRate: dailyBurn,
        runway: runway === Infinity ? null : runway,
        habitsTotal: habits.length,
        habitsDoneToday: habitsCompletedToday.length,
        habitCompletionPct: habitCompletionRate,
        topStreak: topStreak,
        dayLogStreak: dayLogStreak,
        loggedToday: loggedToday,
        totalContacts: people.length,
        overdueFollowups: overdueFollowups.length,
        followupsDueSoon: followupsDueSoon.length,
        pipelineTotal: pipeline.length,
        pipelineLive: liveCount,
        pipelineEditing: editingCount,
        pipelineIdeas: ideaCount,
        totalViews: totalViews,
        operatorScore: operatorScore
      };
    };

    var getProjectDetails = function (projectId) {
      var projects = _arr('projects');
      var project = projects.find(function (p) { return p.id === projectId; });
      if (!project) return null;
      var ledger = _arr('finance.ledger');
      var projectLedger = ledger.filter(function (e) { return e.projectId === projectId; });
      var pFinance = _financeSummary(projectLedger);
      var pipeline = _arr('creatorStudio.pipeline');
      var projectContent = pipeline.filter(function (c) {
        return c.projectId === projectId || (project.name && (c.title || '').toLowerCase().includes(project.name.toLowerCase()));
      });
      var daysAlive = project.created ? _daysBetween(project.created, _today()) : 0;
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        hypothesis: project.hypothesis,
        model: project.model,
        created: project.created,
        daysAlive: daysAlive,
        revenue: pFinance.income,
        expenses: pFinance.expenses,
        profit: pFinance.profit,
        contentCount: projectContent.length,
        contentLive: projectContent.filter(function (c) { return c.status === 'live'; }).length,
        totalViews: projectContent.reduce(function (s, c) { return s + (c.views || 0); }, 0)
      };
    };

    var getPersonDetails = function (personId) {
      var people = _arr('people');
      var person = people.find(function (p) { return p.id === personId; });
      if (!person) return null;
      var today = _today();
      var isOverdue = person.followUpDate && person.followUpDate <= today;
      var daysUntilFU = person.followUpDate ? _daysBetween(today, person.followUpDate) : null;
      var daysSinceAdded = person.createdAt ? _daysBetween(person.createdAt, today) : null;
      return {
        id: person.id,
        name: person.name,
        platform: person.platform,
        category: person.category,
        followUpDate: person.followUpDate,
        followUpOverdue: isOverdue,
        daysUntilFollowUp: daysUntilFU,
        daysSinceAdded: daysSinceAdded,
        notes: person.notes,
        createdAt: person.createdAt
      };
    };

    var getFinanceSummary = function () {
      var ledger = _arr('finance.ledger');
      var today = _today();
      var cashOnHand = _num('finance.cashOnHand', 0);
      var allTime = _financeSummary(ledger);
      var mtd = _financeSummary(ledger, _monthStart(), today);
      var last30 = _financeSummary(ledger, _daysAgo(30), today);
      var last7 = _financeSummary(ledger, _daysAgo(7), today);
      var projects = _arr('projects');
      var perProject = projects.map(function (p) {
        var pEntries = ledger.filter(function (e) { return e.projectId === p.id; });
        var pFin = _financeSummary(pEntries);
        return { id: p.id, name: p.name, revenue: pFin.income, profit: pFin.profit };
      }).filter(function (p) { return p.revenue > 0; }).sort(function (a, b) { return b.revenue - a.revenue; });
      var incomeEntries = ledger.filter(function (e) { return e.type === 'income'; });
      var incomeByNote = incomeEntries.reduce(function (acc, e) {
        var key = (e.note || 'Other').split(' ')[0];
        acc[key] = (acc[key] || 0) + (parseFloat(e.amount) || 0);
        return acc;
      }, {});
      var lastMonthStart = (function () {
        var d = new Date();
        d.setMonth(d.getMonth() - 1, 1);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
      }());
      var lastMonthEnd = (function () {
        var d = new Date();
        d.setDate(0);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }());
      var lastMonth = _financeSummary(ledger, lastMonthStart, lastMonthEnd);
      var momGrowth = lastMonth.income > 0 ? Math.round((mtd.income - lastMonth.income) / lastMonth.income * 100) : null;
      return {
        allTime: allTime,
        mtd: mtd,
        last30: last30,
        last7: last7,
        cashOnHand: cashOnHand,
        runway: _calcRunway(ledger, cashOnHand),
        dailyBurn: last30.expenses / 30,
        perProject: perProject,
        incomeByNote: incomeByNote,
        momGrowth: momGrowth,
        transactionCount: ledger.length
      };
    };

    var getContentPipeline = function () {
      var pipeline = _arr('creatorStudio.pipeline');
      var today = _today();
      var wkStart = _weekStart();
      var byStatus = { idea: [], scripted: [], filming: [], editing: [], scheduled: [], live: [] };
      pipeline.forEach(function (p) {
        var bucket = byStatus[p.status];
        if (bucket) bucket.push(p);
      });
      var byPlatform = pipeline.reduce(function (acc, p) {
        var plat = p.platform || 'Other';
        acc[plat] = (acc[plat] || 0) + 1;
        return acc;
      }, {});
      var liveContent = byStatus.live;
      var totalViews = liveContent.reduce(function (s, p) { return s + (p.views || 0); }, 0);
      var avgRetention = liveContent.length > 0 ? Math.round(liveContent.reduce(function (s, p) { return s + (p.retention || 0); }, 0) / liveContent.length) : 0;
      var topPiece = liveContent.sort(function (a, b) { return (b.views || 0) - (a.views || 0); })[0] || null;
      var publishedThisWeek = pipeline.filter(function (p) { return p.status === 'live' && (p.created || '') >= wkStart; }).length;
      var stale = pipeline.filter(function (p) { return (p.status === 'editing' || p.status === 'filming') && p.created && _daysBetween(p.created, today) >= 7; });
      var hooksAvailable = byStatus.idea.filter(function (p) { return p.hook; }).length;
      return {
        total: pipeline.length,
        byStatus: {
          idea: byStatus.idea.length,
          scripted: byStatus.scripted.length,
          filming: byStatus.filming.length,
          editing: byStatus.editing.length,
          scheduled: byStatus.scheduled.length,
          live: byStatus.live.length
        },
        byPlatform: byPlatform,
        totalViews: totalViews,
        avgRetention: avgRetention,
        topPiece: topPiece ? { id: topPiece.id, title: topPiece.title, platform: topPiece.platform, views: topPiece.views, retention: topPiece.retention } : null,
        publishedThisWeek: publishedThisWeek,
        stalePieces: stale.length,
        hooksAvailable: hooksAvailable,
        readyToFilm: byStatus.scripted.length,
        readyToPost: byStatus.editing.length + byStatus.scheduled.length
      };
    };

    var getDayLogSummary = function () {
      var logs = _arr('dayLog.logs');
      var today = _today();
      var sorted = logs.slice().sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; });
      var streak = 0;
      for (var i = 0; i < 60; i++) {
        var d = _daysAgo(i);
        if (sorted.some(function (l) { return l.date === d && l.whatILearned; })) { streak++; } else { break; }
      }
      var last7 = [];
      for (var j = 0; j < 7; j++) {
        var day = _daysAgo(j);
        var entry = sorted.find(function (l) { return l.date === day; });
        last7.push({ date: day, logged: !!entry, preview: entry && entry.whatILearned ? entry.whatILearned.slice(0, 80) + (entry.whatILearned.length > 80 ? '…' : '') : null });
      }
      var allText = sorted.slice(0, 14).map(function (l) { return (l.whatILearned || '') + ' ' + (l.ideas || ''); }).join(' ').toLowerCase();
      var wordFreq = {};
      var stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','it','i','my','was','that','this','be','have','had','from','not','by','as','we','are','has','so','do','did','can','if','up','its','been','their','they','will','would','could','should','then','what','when','how']);
      allText.split(/\W+/).forEach(function (w) {
        if (w.length > 3 && !stopWords.has(w)) {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
        }
      });
      var themes = Object.keys(wordFreq).filter(function (w) { return wordFreq[w] > 1; }).sort(function (a, b) { return wordFreq[b] - wordFreq[a]; }).slice(0, 5);
      return { totalEntries: sorted.length, streak: streak, loggedToday: sorted.some(function (l) { return l.date === today && l.whatILearned; }), last7: last7, themes: themes };
    };

    var getPeopleOverview = function () {
      var people = _arr('people');
      var today = _today();
      var week = _daysAgo(-7);
      var overdue = people.filter(function (p) { return p.followUpDate && p.followUpDate <= today; });
      var dueSoon = people.filter(function (p) { return p.followUpDate && p.followUpDate > today && p.followUpDate <= week; });
      var noFollowUp = people.filter(function (p) { return !p.followUpDate; });
      var byCategory = people.reduce(function (acc, p) {
        var cat = p.category || 'Other';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});
      var byPlatform = people.reduce(function (acc, p) {
        var plat = p.platform || 'Unknown';
        acc[plat] = (acc[plat] || 0) + 1;
        return acc;
      }, {});
      return {
        total: people.length,
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
        noFollowUpCount: noFollowUp.length,
        overdue: overdue.map(function (p) { return { id: p.id, name: p.name, followUpDate: p.followUpDate, platform: p.platform }; }),
        dueSoon: dueSoon.map(function (p) { return { id: p.id, name: p.name, followUpDate: p.followUpDate, platform: p.platform }; }),
        byCategory: byCategory,
        byPlatform: byPlatform,
        sponsorCount: byCategory['Sponsor'] || 0,
        mentorCount: byCategory['Mentor'] || 0
      };
    };

    var getHabitReport = function () {
      var habits = _arr('dashboard.habits');
      var today = _today();
      var doneToday = habits.filter(function (h) { return h.lastCompleted === today; });
      var missedToday = habits.filter(function (h) { return h.lastCompleted !== today; });
      var sorted = habits.slice().sort(function (a, b) { return (b.streak || 0) - (a.streak || 0); });
      var best = sorted[0] || null;
      var worst = sorted[sorted.length - 1] || null;
      var atRisk = habits.filter(function (h) { return h.lastCompleted && h.lastCompleted < _daysAgo(1); });
      var avgCompletionRate = habits.length > 0 ? Math.round(habits.reduce(function (s, h) { return s + Math.min(1, (h.streak || 0) / 7); }, 0) / habits.length * 100) : 0;
      var byCategory = habits.reduce(function (acc, h) {
        var cat = h.category || 'Other';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});
      return {
        total: habits.length,
        doneToday: doneToday.length,
        missedToday: missedToday.length,
        completionPct: habits.length > 0 ? Math.round(doneToday.length / habits.length * 100) : 0,
        avgCompletionRate: avgCompletionRate,
        topStreak: best ? { name: best.name, streak: best.streak } : null,
        weakestHabit: worst ? { name: worst.name, streak: worst.streak } : null,
        atRisk: atRisk.map(function (h) { return { name: h.name, lastCompleted: h.lastCompleted }; }),
        byCategory: byCategory
      };
    };

    var getContextForJarvis = function () {
      var summary = getSummary();
      var finance = getFinanceSummary();
      var content = getContentPipeline();
      var people = getPeopleOverview();
      var habits = getHabitReport();
      var daylog = getDayLogSummary();
      return {
        route: FreedomOS.currentRoute || 'dashboard',
        operatorScore: summary.operatorScore,
        wins: { today: summary.todayWins, week: summary.weeklyWins, total: summary.totalWins },
        revenue: { mtd: finance.mtd.income, profit: finance.mtd.profit, runway: finance.runway },
        projects: { active: summary.activeProjects, names: summary.projectNames },
        habits: { doneToday: habits.doneToday, total: habits.total, topStreak: summary.topStreak },
        content: { readyToPost: content.readyToPost, live: content.byStatus.live, stalePieces: content.stalePieces },
        people: { overdue: people.overdueCount, dueSoon: people.dueSoonCount },
        dayLog: { streak: daylog.streak, loggedToday: daylog.loggedToday },
        alerts: (function () {
          var a = [];
          if (people.overdueCount > 0) a.push(people.overdueCount + ' overdue follow-up(s)');
          if (content.stalePieces > 0) a.push(content.stalePieces + ' stale content piece(s)');
          if (!daylog.loggedToday) a.push('Day log not filled yet');
          if (habits.missedToday > 0) a.push(habits.missedToday + ' habit(s) not done today');
          if (finance.runway !== null && finance.runway < 30) a.push('Runway under 30 days (' + finance.runway + 'd)');
          return a;
        }())
      };
    };

    return {
      getSummary: getSummary,
      getProjectDetails: getProjectDetails,
      getPersonDetails: getPersonDetails,
      getFinanceSummary: getFinanceSummary,
      getContentPipeline: getContentPipeline,
      getDayLogSummary: getDayLogSummary,
      getPeopleOverview: getPeopleOverview,
      getHabitReport: getHabitReport,
      getContextForJarvis: getContextForJarvis
    };
  }());


  /* ============================================================
     PART B — API LAYER (Groq via Vercel Edge Function)
     ============================================================ */

  var API_URL = window.location.origin.includes('localhost')
    ? 'http://localhost:3000/api/jarvis'
    : window.location.origin + '/api/jarvis';

  var _sessionId = FreedomOS.generateId();
  var _apiHistory = [];
  var _MAX_HISTORY = 20;

  var _callAI = async function (message, context) {
    _apiHistory.push({ role: 'user', content: message });
    if (_apiHistory.length > _MAX_HISTORY) {
      _apiHistory.splice(0, _apiHistory.length - _MAX_HISTORY);
    }

    var stateSnapshot = {};
    try {
      var s = FreedomOS.state;
      stateSnapshot = {
        currentRoute: FreedomOS.currentRoute || null,
        wins:         (s.wins         || []).slice(0, 10),
        projects:     (s.projects     || []).slice(0, 10),
        people:       (s.people       || []).slice(0, 5),
        habits:       ((s.dashboard && s.dashboard.habits) || []).slice(0, 10),
        ledger:       ((s.finance && s.finance.ledger)     || []).slice(0, 5),
        pipeline:     ((s.creatorStudio && s.creatorStudio.pipeline) || []).slice(0, 5),
        todayLog:     (function () {
          var today = new Date().toISOString().slice(0, 10);
          var logs  = (s.dayLog && s.dayLog.logs) || [];
          return logs.find(function (l) { return l.date === today; }) || null;
        }()),
        jarvisPrefs:  (_jarvisState && _jarvisState.preferences) || {}
      };
    } catch (snapErr) {
      console.warn('[JARVIS] State snapshot failed:', snapErr);
    }

    var fullContext = Object.assign({}, stateSnapshot, context || {});
    try {
      fullContext.scanner = _scanner.getContextForJarvis();
    } catch (_) {}

    var response;
    try {
      response = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:   message,
          sessionId: _sessionId,
          context:   fullContext,
          history:   _apiHistory.slice(0, -1)
        })
      });
    } catch (networkErr) {
      console.error('[JARVIS] Network error:', networkErr);
      _apiHistory.pop();
      throw new Error('Network unreachable — check your connection.');
    }

    var data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error('[JARVIS] Response parse failed, status:', response.status);
      _apiHistory.pop();
      throw new Error('Bad response from server (status ' + response.status + ').');
    }

    if (!response.ok) {
      var serverMsg = (data && data.message) || ('Server error ' + response.status);
      console.error('[JARVIS] API error:', serverMsg);
      _apiHistory.pop();
      throw new Error(serverMsg);
    }

    var aiContent = data.message || '';
    _apiHistory.push({ role: 'assistant', content: aiContent });
    if (_apiHistory.length > _MAX_HISTORY) {
      _apiHistory.splice(0, _apiHistory.length - _MAX_HISTORY);
    }

    try {
      var conv = _ensureConversation();
      _appendMessage('user', message);
      _appendMessage('ai', aiContent, {
        actions:       data.actions       || [],
        logSuggestion: data.log_suggestion || null,
        provider:      data._provider     || null,
        model:         data._model        || null
      });
    } catch (persistErr) {
      console.warn('[JARVIS] Conversation persist failed:', persistErr);
    }

    return {
      message:        aiContent,
      actions:        Array.isArray(data.actions)  ? data.actions  : [],
      log_suggestion: data.log_suggestion           || null,
      _provider:      data._provider               || null,
      _model:         data._model                  || null
    };
  };

  /* ============================================================
     PART D — ACTION ENGINE (Direct State Manipulation)
     ============================================================ */

  var _actions = (function () {
    'use strict';

    var _list = function (path) {
      return FreedomOS.deepClone(FreedomOS.get(path) || []);
    };
    var _today = function () {
      return new Date().toISOString().split('T')[0];
    };
    var _clip = function (s, maxLen) {
      s = String(s || '');
      return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
    };
    var _require = function (data, keys) {
      for (var i = 0; i < keys.length; i++) {
        if (!data || data[keys[i]] === undefined || data[keys[i]] === '') {
          return 'Missing required field: ' + keys[i];
        }
      }
      return null;
    };
    var _err = function (action, msg) {
      console.warn('[JARVIS:' + action + ']', msg);
      FreedomOS.toast('JARVIS: ' + msg, 'error');
    };

    var WIN_CATEGORIES = ['Revenue', 'Viral', 'Milestone', 'Personal', 'Launch', 'Other'];
    var _normalizeWinCategory = function (raw) {
      if (!raw) return 'Other';
      var match = WIN_CATEGORIES.find(function (c) { return c.toLowerCase() === String(raw).toLowerCase(); });
      return match || 'Other';
    };

    var log_win = function (data) {
      var err = _require(data, ['title']);
      if (err) { _err('log_win', err); return; }
      var wins = _list('wins');
      var win = {
        id:          FreedomOS.generateId(),
        title:       _clip(data.title, 120),
        category:    _normalizeWinCategory(data.category),
        date:        data.date || _today(),
        description: _clip(data.description || '', 500)
      };
      wins.unshift(win);
      FreedomOS.mutate('wins', wins);
      FreedomOS.toast('Win logged: ' + win.title, 'success');
      FreedomOS.emit('jarvis:win_logged', win);
    };

    var PERSON_CATEGORIES = ['Collab', 'Mentor', 'Fan', 'Sponsor', 'Contact', 'Lead', 'Other'];
    var log_person = function (data) {
      var err = _require(data, ['name']);
      if (err) { _err('log_person', err); return; }
      var people = _list('people');
      var existing = people.find(function (p) {
        return p.name.toLowerCase() === String(data.name).toLowerCase() &&
               (!data.platform || (p.platform || '').toLowerCase() === String(data.platform).toLowerCase());
      });
      if (existing) {
        if (data.platform)      existing.platform      = data.platform;
        if (data.category)      existing.category      = data.category;
        if (data.followUpDate)  existing.followUpDate  = data.followUpDate;
        if (data.notes)         existing.notes         = existing.notes ? existing.notes + '\n' + data.notes : data.notes;
        existing.updatedAt = _today();
        FreedomOS.mutate('people', people);
        FreedomOS.toast('Contact updated: ' + existing.name, 'info');
        FreedomOS.emit('jarvis:person_logged', existing);
        return;
      }
      var categoryVal = PERSON_CATEGORIES.includes(data.category) ? data.category : 'Contact';
      var person = {
        id:           FreedomOS.generateId(),
        name:         _clip(data.name, 80),
        platform:     data.platform    || '',
        category:     categoryVal,
        followUpDate: data.followUpDate || null,
        notes:        _clip(data.notes  || '', 600),
        createdAt:    _today()
      };
      people.unshift(person);
      FreedomOS.mutate('people', people);
      FreedomOS.toast('Person logged: ' + person.name, 'success');
      FreedomOS.emit('jarvis:person_logged', person);
    };

    var log_learned = function (data) {
      var err = _require(data, ['content']);
      if (err) { _err('log_learned', err); return; }
      var today = _today();
      var logs = _list('dayLog.logs');
      var entry = logs.find(function (l) { return l.date === today; });
      if (!entry) {
        entry = { date: today, whatILearned: '', ideas: '', wins: '', notes: '', tomorrowsFocus: '' };
        logs.unshift(entry);
      }
      var bullet = '• ' + _clip(data.content, 400);
      entry.whatILearned = entry.whatILearned ? entry.whatILearned + '\n' + bullet : bullet;
      if (data.ideas) {
        var ideaBullet = '• ' + _clip(data.ideas, 400);
        entry.ideas = entry.ideas ? entry.ideas + '\n' + ideaBullet : ideaBullet;
      }
      if (data.tomorrowsFocus) {
        entry.tomorrowsFocus = _clip(data.tomorrowsFocus, 200);
      }
      FreedomOS.mutate('dayLog.logs', logs);
      FreedomOS.toast('Learning logged.', 'success');
      FreedomOS.emit('jarvis:learning_logged', { date: today, content: data.content });
    };

    var PROJECT_STATUSES = ['active', 'paused', 'shipped', 'killed'];
    var start_project = function (data) {
      var err = _require(data, ['name']);
      if (err) { _err('start_project', err); return; }
      var projects = _list('projects');
      var dup = projects.find(function (p) { return p.name.toLowerCase() === String(data.name).toLowerCase(); });
      if (dup) {
        FreedomOS.toast('Project "' + data.name + '" already exists.', 'warning');
        return;
      }
      var status = PROJECT_STATUSES.includes(data.status) ? data.status : 'active';
      var project = {
        id:          FreedomOS.generateId(),
        name:        _clip(data.name, 80),
        status:      status,
        hypothesis:  _clip(data.hypothesis || '', 400),
        model:       _clip(data.model      || '', 200),
        created:     _today()
      };
      projects.unshift(project);
      FreedomOS.mutate('projects', projects);
      FreedomOS.toast('Project started: ' + project.name, 'success');
      FreedomOS.emit('jarvis:project_started', project);
    };

    var FINANCE_TYPES = ['income', 'expense', 'investment'];
    var log_finance = function (data) {
      var err = _require(data, ['type', 'amount']);
      if (err) { _err('log_finance', err); return; }
      var amount = parseFloat(data.amount);
      if (isNaN(amount) || amount <= 0) {
        _err('log_finance', 'Amount must be a positive number.');
        return;
      }
      var type = FINANCE_TYPES.includes(data.type) ? data.type : 'expense';
      var ledger = _list('finance.ledger');
      var entry = {
        id:        FreedomOS.generateId(),
        type:      type,
        amount:    amount,
        date:      data.date || _today(),
        note:      _clip(data.note || '', 200),
        projectId: data.projectId || null
      };
      ledger.unshift(entry);
      FreedomOS.mutate('finance.ledger', ledger);
      var label = type === 'income' ? '+ ' : '− ';
      FreedomOS.toast(label + FreedomOS.formatMoney(amount) + ' logged.', 'success');
      FreedomOS.emit('jarvis:finance_logged', entry);
    };

    var CONTENT_STATUSES  = ['idea', 'scripted', 'filming', 'editing', 'scheduled', 'live'];
    var CONTENT_PLATFORMS = ['TikTok', 'YouTube', 'Instagram', 'Twitter', 'LinkedIn', 'Other'];
    var log_content = function (data) {
      var err = _require(data, ['title']);
      if (err) { _err('log_content', err); return; }
      var pipeline = _list('creatorStudio.pipeline');
      var status   = CONTENT_STATUSES.includes(data.status)   ? data.status   : 'idea';
      var platform = CONTENT_PLATFORMS.includes(data.platform) ? data.platform : 'TikTok';
      var piece = {
        id:        FreedomOS.generateId(),
        title:     _clip(data.title,   120),
        platform:  platform,
        status:    status,
        hook:      _clip(data.hook   || '', 280),
        script:    _clip(data.script || '', 2000),
        views:     0,
        retention: 0,
        created:   _today()
      };
      pipeline.unshift(piece);
      FreedomOS.mutate('creatorStudio.pipeline', pipeline);
      FreedomOS.toast('Content idea logged: ' + piece.title, 'success');
      FreedomOS.emit('jarvis:content_logged', piece);
    };

    var navigate = function (data) {
      var err = _require(data, ['route']);
      if (err) { _err('navigate', err); return; }
      var route = String(data.route).replace(/^\/+/, '');
      setTimeout(function () {
        FreedomOS.navigate(route);
        FreedomOS.emit('jarvis:navigated', { route: route });
      }, 350);
    };

    var show_file = function (data) {
      var err = _require(data, ['path']);
      if (err) { _err('show_file', err); return; }
      var path = String(data.path);
      var ext  = data.ext || path.split('.').pop().toLowerCase();
      if (window.FreedomOS.JARVIS && FreedomOS.JARVIS.ui) {
        FreedomOS.JARVIS.ui.switchTab('files');
      }
      var parts = path.replace(/^\/+/, '').split('/');
      var fileName = parts.pop();
      var folderPath = '/' + parts.join('/');
      if (folderPath === '/') folderPath = '/';
      setTimeout(function () {
        if (window.FreedomOS.JARVIS && FreedomOS.JARVIS.ui) {
          FreedomOS.JARVIS.ui.renderExplorer(folderPath);
        }
        if (data.code) {
          setTimeout(function () {
            if (window.FreedomOS.JARVIS && FreedomOS.JARVIS.ui) {
              FreedomOS.JARVIS.ui.showFilePreview({ name: fileName, path: path, ext: ext, code: data.code });
            }
          }, 300);
        }
      }, 250);
      FreedomOS.emit('jarvis:file_shown', { path: path });
    };

    var highlight_code = function (data) {
      var err = _require(data, ['path']);
      if (err) { _err('highlight_code', err); return; }
      var steps;
      if (Array.isArray(data.steps) && data.steps.length) {
        steps = data.steps;
      } else {
        steps = [{
          op:   data.op || 'modify',
          path: data.path,
          code: data.replacement || data.code || '',
          diff: _buildSimpleDiff(data.replacement || data.code || '', data.startLine, data.endLine)
        }];
      }
      if (window.FreedomOS.JARVIS && FreedomOS.JARVIS.ui) {
        FreedomOS.JARVIS.ui.switchTab('chat');
      }
      setTimeout(function () {
        if (window.FreedomOS.JARVIS && FreedomOS.JARVIS.ui) {
          FreedomOS.JARVIS.ui.addAIMessage('Here\'s the change for `' + data.path + '`:', { codeSteps: steps });
        }
      }, 200);
      var historyEntry = {
        id:          FreedomOS.generateId(),
        description: 'Edit: ' + data.path,
        steps:       steps,
        timestamp:   Date.now(),
        applied:     false
      };
      if (window._jarvisState) {
        _jarvisState.codeHistory.unshift(historyEntry);
        if (_jarvisState.codeHistory.length > 50) _jarvisState.codeHistory.length = 50;
        _saveState();
      }
      FreedomOS.emit('jarvis:code_highlighted', { path: data.path, steps: steps });
    };

    var _buildSimpleDiff = function (code, startLine, endLine) {
      if (!code) return [];
      var lines = code.split('\n');
      return lines.map(function (_, i) {
        var lineNum = i + 1;
        if (startLine && endLine) {
          return (lineNum >= startLine && lineNum <= endLine) ? { line: lineNum, type: 'highlight' } : null;
        }
        return lines[i].trim() ? { line: lineNum, type: 'add' } : null;
      }).filter(Boolean);
    };

    var update_habit = function (data) {
      if (!data || (!data.id && !data.name)) {
        _err('update_habit', 'Provide habit id or name.');
        return;
      }
      var habits = _list('dashboard.habits');
      var habit = data.id
        ? habits.find(function (h) { return h.id === data.id; })
        : habits.find(function (h) { return h.name.toLowerCase() === String(data.name).toLowerCase(); });
      if (!habit) {
        FreedomOS.toast('Habit not found: ' + (data.name || data.id), 'warning');
        return;
      }
      var today = _today();
      if (habit.lastCompleted === today) {
        FreedomOS.toast(habit.name + ' already done today.', 'info');
        return;
      }
      habit.lastCompleted = today;
      habit.streak = (habit.streak || 0) + 1;
      FreedomOS.mutate('dashboard.habits', habits);
      FreedomOS.toast(habit.name + ' ✓ streak: ' + habit.streak, 'success');
      FreedomOS.emit('jarvis:habit_updated', habit);
    };

    var add_roadmap_milestone = function (data) {
      var err = _require(data, ['milestone']);
      if (err) { _err('add_roadmap_milestone', err); return; }
      var err2 = _require(data.milestone, ['title']);
      if (err2) { _err('add_roadmap_milestone', err2); return; }
      var quarters = _list('roadmap.quarters');
      var quarter = data.quarterId
        ? quarters.find(function (q) { return q.id === data.quarterId; })
        : data.quarterTitle
          ? quarters.find(function (q) { return q.title.toLowerCase().includes(String(data.quarterTitle).toLowerCase()); })
          : quarters[0];
      if (!quarter) {
        _err('add_roadmap_milestone', 'Quarter not found.');
        return;
      }
      if (!Array.isArray(quarter.milestones)) quarter.milestones = [];
      quarter.milestones.push({
        id:          FreedomOS.generateId(),
        title:       _clip(data.milestone.title,       120),
        description: _clip(data.milestone.description || '', 400),
        done:        false,
        addedAt:     _today()
      });
      FreedomOS.mutate('roadmap.quarters', quarters);
      FreedomOS.toast('Milestone added to ' + quarter.title, 'success');
      FreedomOS.emit('jarvis:milestone_added', { quarter: quarter, milestone: data.milestone });
    };

    var write_letter = function (data) {
      var err = _require(data, ['title', 'content']);
      if (err) { _err('write_letter', err); return; }
      var letters = _list('letters');
      var letter = {
        id:         FreedomOS.generateId(),
        title:      _clip(data.title,   120),
        content:    _clip(data.content, 5000),
        unlockDate: data.unlockDate || null,
        createdAt:  _today()
      };
      letters.unshift(letter);
      FreedomOS.mutate('letters', letters);
      FreedomOS.toast('Letter saved: ' + letter.title, 'success');
      FreedomOS.emit('jarvis:letter_written', letter);
    };

    var dispatch = function (type, payload) {
      payload = payload || {};
      var handler = _actions[type];
      if (typeof handler !== 'function') {
        console.warn('[JARVIS:dispatch] Unknown action type:', type);
        FreedomOS.emit('jarvis:unknown_action', { type: type, payload: payload });
        return;
      }
      try {
        handler(payload);
      } catch (e) {
        console.error('[JARVIS:dispatch] Action "' + type + '" threw:', e);
        FreedomOS.toast('Action failed: ' + type, 'error');
      }
    };

    var _actions = {
      log_win:               log_win,
      log_person:            log_person,
      log_learned:           log_learned,
      start_project:         start_project,
      navigate:              navigate,
      show_file:             show_file,
      highlight_code:        highlight_code,
      log_finance:           log_finance,
      log_content:           log_content,
      update_habit:          update_habit,
      add_roadmap_milestone: add_roadmap_milestone,
      write_letter:          write_letter,
      dispatch: dispatch
    };

    return _actions;
  }());


  /* ============================================================
     PART C — UI CONTROLLER
     ============================================================ */

  var _ui = (function () {
    'use strict';

    var ORB_ID       = 'jarvis-orb';
    var PANEL_ID     = 'jarvis-panel';
    var BACKDROP_ID  = 'jarvis-backdrop';
    var ROOT_ID      = 'jarvis-root';
    var MESSAGES_ID  = 'jarvis-messages';
    var INPUT_ID     = 'jarvis-input';
    var SEND_ID      = 'jarvis-send-btn';
    var CONTENT_ID   = 'jarvis-tab-content';
    var TABS_ID      = 'jarvis-tabs';
    var CINEMATIC_ID = 'jarvis-cinematic';
    var LINE_STAGGER_MS  = 50;
    var STEP_AUTO_ADV_MS = 3200;
    var FILE_OPEN_MS     = 600;

    var _panelOpen     = false;
    var _cinematicMode = false;
    var _activeTab     = 'chat';
    var _isStreaming   = false;
    var _explorerPath  = '/';
    var _stepTimers    = [];

    var _q = function (sel) {
      var root = document.getElementById(ROOT_ID);
      return (root || document).querySelector(sel);
    };
    var _qAll = function (sel) {
      var root = document.getElementById(ROOT_ID);
      return Array.from((root || document).querySelectorAll(sel));
    };
    var _esc = function (s) { return FreedomOS.escapeHtml(String(s || '')); };
    var _formatTime = function (ts) {
      var d = new Date(ts || Date.now());
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    var _relTime = function (ts) {
      var diff = Date.now() - (ts || 0);
      if (diff < 60000)    return 'just now';
      if (diff < 3600000)  return Math.floor(diff / 60000)   + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      return Math.floor(diff / 86400000) + 'd ago';
    };
    var _inject = function (parent, html) {
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var el = tmp.firstElementChild;
      if (el) parent.appendChild(el);
      return el;
    };
    var _retriggerAnimation = function (el, cls) {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };

    /* ── SVG Atoms ───────────────────────────────────────────── */
    var SVG = {
      hexOrb: [
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">',
          '<polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5"',
            ' stroke="currentColor" stroke-width="1.5" fill="none"/>',
          '<circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.85"/>',
        '</svg>'
      ].join(''),
      close: [
        '<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">',
          '<path d="M1 1l12 12M13 1L1 13" stroke="currentColor"',
            ' stroke-width="1.5" stroke-linecap="round"/>',
        '</svg>'
      ].join(''),
      send: [
        '<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">',
          '<path d="M1 13L13 7 1 1v5l8 1-8 1v5z" fill="currentColor"/>',
        '</svg>'
      ].join(''),
      folder: function (color) {
        var c = color || 'var(--color-text-muted)';
        return [
          '<svg width="36" height="30" viewBox="0 0 36 30" fill="none">',
            '<rect x="2" y="8" width="32" height="20" rx="2"',
              ' fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)"',
              ' stroke-width="1"/>',
            '<path d="M2 8h14l2-4h16v4" fill="' + c + '" opacity="0.85"/>',
            '<path d="M2 8h14l2-4h16" stroke="' + c + '"',
              ' stroke-width="0.8" fill="none"/>',
          '</svg>'
        ].join('');
      },
      file: function (ext) {
        var colors = { js: '#f59e0b', css: '#3b82f6', html: '#f97316', json: '#a78bfa', md: '#94a3b8', ts: '#3b82f6' };
        var c = colors[ext] || 'var(--color-text-muted)';
        return [
          '<svg width="18" height="22" viewBox="0 0 18 22" fill="none">',
            '<path d="M3 1h8l4 4v16H3V1z" stroke="' + c + '"',
              ' stroke-width="1.2" fill="none"/>',
            '<path d="M11 1v4h4" stroke="' + c + '" stroke-width="1.2" fill="none"/>',
            '<text x="3" y="17" font-size="5" fill="' + c + '"',
              ' font-family="monospace" font-weight="700">',
              (ext || '').toUpperCase().slice(0, 3),
            '</text>',
          '</svg>'
        ].join('');
      },
      statusDot: '<div class="jarvis-status-dot" title="Online"></div>'
    };

    /* ── File Tree (extensible via FreedomOS.JARVIS.tree) ────── */
    var TREE = {
      '/': [
        { name: 'js',     type: 'folder', color: '#f59e0b', id: '/js'     },
        { name: 'css',    type: 'folder', color: '#3b82f6', id: '/css'    },
        { name: 'api',    type: 'folder', color: '#a78bfa', id: '/api'    },
        { name: 'assets', type: 'folder', color: '#f43f5e', id: '/assets' },
        { name: 'index.html', type: 'file', ext: 'html'                 }
      ],
      '/js': [
        { name: 'modules',  type: 'folder', color: '#f59e0b', id: '/js/modules' },
        { name: 'kernel.js', type: 'file', ext: 'js' }
      ],
      '/js/modules': [
        { name: 'dashboard.js',  type: 'file', ext: 'js' },
        { name: 'wins.js',       type: 'file', ext: 'js' },
        { name: 'daylog.js',     type: 'file', ext: 'js' },
        { name: 'projects.js',   type: 'file', ext: 'js' },
        { name: 'people.js',     type: 'file', ext: 'js' },
        { name: 'finance.js',    type: 'file', ext: 'js' },
        { name: 'creator.js',    type: 'file', ext: 'js' },
        { name: 'jarvis-v3.js',  type: 'file', ext: 'js' }
      ],
      '/css': [
        { name: 'base.css',       type: 'file', ext: 'css' },
        { name: 'layout.css',     type: 'file', ext: 'css' },
        { name: 'components.css', type: 'file', ext: 'css' },
        { name: 'jarvis.css',     type: 'file', ext: 'css' }
      ],
      '/api': [
        { name: 'jarvis.js', type: 'file', ext: 'js' }
      ],
      '/assets': []
    };

    /* ── Syntax Highlighter ──────────────────────────────────── */
    var _highlight = function (rawLine, ext) {
      var s = _esc(rawLine);
      if (ext === 'js' || ext === 'ts' || ext === 'mjs') {
        s = s.replace(/(\/\/[^\n]*)/g, '<span class="jarvis-tok-comment">$1</span>');
        s = s.replace(/\b(const|let|var|function|return|if|else|for|while|do|class|new|this|import|export|default|async|await|typeof|instanceof|switch|case|break|continue|throw|try|catch|finally|of|in|from|null|undefined|true|false|void|delete|yield)\b/g,
          '<span class="jarvis-tok-keyword">$1</span>');
        s = s.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g,
          '<span class="jarvis-tok-string">$1</span>');
        s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="jarvis-tok-number">$1</span>');
        s = s.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, '<span class="jarvis-tok-prop">$1</span>');
      } else if (ext === 'css') {
        s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="jarvis-tok-comment">$1</span>');
        s = s.replace(/([.#]?[\w-]+)(\s*\{)/g, '<span class="jarvis-tok-keyword">$1</span>$2');
        s = s.replace(/([\w-]+)(\s*:)/g, '<span class="jarvis-tok-fn">$1</span>$2');
        s = s.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, '<span class="jarvis-tok-string">$1</span>');
        s = s.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="jarvis-tok-number">$1</span>');
      } else if (ext === 'html') {
        s = s.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="jarvis-tok-keyword">$2</span>');
        s = s.replace(/([\w-]+)(=&quot;)/g, '<span class="jarvis-tok-fn">$1</span>$2');
        s = s.replace(/(&amp;lt;!--[\s\S]*?--&amp;gt;)/g, '<span class="jarvis-tok-comment">$1</span>');
      } else if (ext === 'json') {
        s = s.replace(/"((?:[^"\\]|\\.)*)"\s*:/g, '"<span class="jarvis-tok-fn">$1</span>":');
        s = s.replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="jarvis-tok-string">$1</span>');
        s = s.replace(/\b(true|false|null)\b/g, '<span class="jarvis-tok-keyword">$1</span>');
        s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="jarvis-tok-number">$1</span>');
      }
      return s || '&nbsp;';
    };

    /* ============================================================
       1. renderOrb()
       ============================================================ */
    var renderOrb = function () {
      if (document.getElementById(ORB_ID)) return;
      var btn = document.createElement('button');
      btn.id            = ORB_ID;
      btn.className     = 'jarvis-orb';
      btn.setAttribute('aria-label', 'Open JARVIS');
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.innerHTML     = '<span class="jarvis-orb-icon">' + SVG.hexOrb + '</span>';
      btn.addEventListener('click', function () {
        _panelOpen ? _closePanel() : renderPanel();
      });
      document.body.appendChild(btn);
    };

    /* ============================================================
       2. renderPanel()
       ============================================================ */
    var renderPanel = function () {
      if (_panelOpen) return;
      _panelOpen = true;
      var orb = document.getElementById(ORB_ID);
      if (orb) orb.classList.add('hidden');
      var root = document.createElement('div');
      root.id  = ROOT_ID;
      root.innerHTML = _shellHTML();
      document.body.appendChild(root);
      _q('#' + BACKDROP_ID).addEventListener('click', function (e) {
        if (e.target.id === BACKDROP_ID) _closePanel();
      });
      _q('#jarvis-close-btn').addEventListener('click', _closePanel);
      _q('#' + SEND_ID).addEventListener('click', _onSend);
      _bindInputEvents();
      _bindTabEvents();
      _bindMessageAreaEvents();
      document.addEventListener('keydown', _onKeyDown);
      _switchTab('chat', true);
      FreedomOS.emit('jarvis:opened', {});
    };

    var _shellHTML = function () {
      return [
        '<div class="jarvis-backdrop" id="' + BACKDROP_ID + '"></div>',
        '<div class="jarvis-panel" id="' + PANEL_ID + '"',
          ' role="dialog" aria-label="JARVIS Assistant" aria-modal="true" tabindex="-1">',
          '<div class="jarvis-drag-handle"></div>',
          '<div class="jarvis-header">',
            '<div class="jarvis-header-row">',
              '<div class="jarvis-header-orb">',
                '<span class="jarvis-header-orb-icon">' + SVG.hexOrb + '</span>',
              '</div>',
              '<div class="jarvis-header-text">',
                '<div class="jarvis-header-title">JARVIS</div>',
                '<div class="jarvis-header-subtitle">FREEDOM OS v3 · OPERATOR MODE</div>',
              '</div>',
              SVG.statusDot,
              '<button class="jarvis-close-btn" id="jarvis-close-btn" aria-label="Close">',
                '<span class="jarvis-close-btn-icon">' + SVG.close + '</span>',
              '</button>',
            '</div>',
          '</div>',
          '<div class="jarvis-tabs" id="' + TABS_ID + '">',
            _tabBtn('chat',    'Chat',    true),
            _tabBtn('files',   'Files',   false),
            _tabBtn('history', 'History', false),
          '</div>',
          '<div class="jarvis-tab-content" id="' + CONTENT_ID + '"></div>',
        '</div>'
      ].join('');
    };

    var _tabBtn = function (id, label, active) {
      return [
        '<button class="jarvis-tab' + (active ? ' active' : '') + '"',
          ' data-tab="' + id + '">',
          label,
        '</button>'
      ].join('');
    };

    var _closePanel = function () {
      if (!_panelOpen) return;
      if (_cinematicMode) _exitCinematic();
      _stepTimers.forEach(clearTimeout);
      _stepTimers = [];
      var panel    = _q('#' + PANEL_ID);
      var backdrop = _q('#' + BACKDROP_ID);
      if (panel)    panel.classList.add('closing');
      if (backdrop) backdrop.classList.add('closing');
      setTimeout(function () {
        var root = document.getElementById(ROOT_ID);
        if (root) root.remove();
        _panelOpen  = false;
        _activeTab  = 'chat';
        document.removeEventListener('keydown', _onKeyDown);
        var orb = document.getElementById(ORB_ID);
        if (orb) orb.classList.remove('hidden');
        FreedomOS.emit('jarvis:closed', {});
      }, 300);
    };

    /* ============================================================
       3. addUserMessage(text)
       ============================================================ */
    var addUserMessage = function (text) {
      var container = _ensureMessagesContainer();
      _removeEmpty(container);
      var id  = FreedomOS.generateId();
      var now = Date.now();
      var html = [
        '<div class="jarvis-msg user" data-id="' + id + '">',
          '<span class="jarvis-msg-label">YOU</span>',
          '<div class="jarvis-msg-bubble">',
            _esc(text),
          '</div>',
          '<span class="jarvis-msg-time">' + _formatTime(now) + '</span>',
        '</div>'
      ].join('');
      var el = _inject(container, html);
      _scrollBottom(true);
      return el;
    };

    /* ============================================================
       4. addAIMessage(text, extras)
       ============================================================ */
    var addAIMessage = function (text, extras) {
      var container = _ensureMessagesContainer();
      _removeEmpty(container);
      extras = extras || {};
      var id  = FreedomOS.generateId();
      var now = Date.now();
      var shell = [
        '<div class="jarvis-msg ai" data-id="' + id + '">',
          '<span class="jarvis-msg-label">JARVIS</span>',
          '<div class="jarvis-msg-bubble">',
            '<span class="jarvis-msg-text" id="jarvis-msg-text-' + id + '"></span>',
            '<span id="jarvis-msg-cursor-' + id + '" class="jarvis-msg-cursor"></span>',
            '<div class="jarvis-msg-diff-slot" id="jarvis-msg-diff-' + id + '"></div>',
            '<div class="jarvis-msg-actions-slot" id="jarvis-msg-actions-' + id + '"></div>',
          '</div>',
          '<span class="jarvis-msg-time">' + _formatTime(now) + '</span>',
        '</div>'
      ].join('');
      var msgEl = _inject(container, shell);
      if (extras.stream) {
        return {
          el: msgEl,
          resolve: function (finalText, finalExtras) {
            _finaliseAIMessage(id, finalText, finalExtras || {});
          }
        };
      }
      _animateText(
        document.getElementById('jarvis-msg-text-' + id),
        document.getElementById('jarvis-msg-cursor-' + id),
        text,
        function onDone() {
          _finaliseAIMessage(id, text, extras);
        }
      );
      _scrollBottom(true);
      return { el: msgEl };
    };

    var _animateText = function (textEl, cursorEl, text, onDone) {
      if (!textEl) { if (onDone) onDone(); return; }
      var chars   = text.split('');
      var total   = chars.length;
      var charMs  = Math.min(8, Math.floor(600 / Math.max(total, 1)));
      var i       = 0;
      var buffer  = '';
      var tick = function () {
        var batch = total > 200 ? 6 : total > 80 ? 3 : 1;
        for (var b = 0; b < batch && i < total; b++, i++) {
          buffer += chars[i];
        }
        textEl.innerHTML = _formatAIText(buffer);
        if (i < total) {
          setTimeout(tick, charMs);
        } else {
          if (cursorEl) cursorEl.remove();
          if (onDone) onDone();
        }
      };
      setTimeout(tick, 40);
    };

    var _finaliseAIMessage = function (id, text, extras) {
      var textEl    = document.getElementById('jarvis-msg-text-' + id);
      var cursorEl  = document.getElementById('jarvis-msg-cursor-' + id);
      var diffSlot  = document.getElementById('jarvis-msg-diff-' + id);
      var actSlot   = document.getElementById('jarvis-msg-actions-' + id);
      if (textEl)   textEl.innerHTML = _formatAIText(text);
      if (cursorEl) cursorEl.remove();
      if (diffSlot && Array.isArray(extras.codeSteps) && extras.codeSteps.length) {
        var diffHTML = extras.codeSteps.map(function (step, i) {
          return renderCodeStep(step, i, extras.codeSteps.length);
        }).join('');
        diffSlot.innerHTML = '<div class="jarvis-diff-container">' + diffHTML + '</div>';
        _scheduleDiffStepHighlight(diffSlot, 0);
      }
      if (actSlot) {
        var pillsHTML = '';
        if (Array.isArray(extras.actions) && extras.actions.length) {
          pillsHTML += '<div class="jarvis-msg-actions">' +
            extras.actions.map(function (a) {
              return [
                '<button class="jarvis-action-btn"',
                  ' data-action="' + _esc(JSON.stringify(a)) + '">',
                  _esc(_actionLabel(a.type)),
                '</button>'
              ].join('');
            }).join('') +
          '</div>';
        }
        if (extras.logSuggestion) {
          var ls = extras.logSuggestion;
          pillsHTML += [
            '<div class="jarvis-log-pill"',
              ' data-suggestion="' + _esc(JSON.stringify(ls)) + '">',
              '<span class="jarvis-log-pill-dot"></span>',
              'LOG ' + (ls.type || '').replace(/_/g, ' ').toUpperCase(),
            '</div>'
          ].join('');
        }
        actSlot.innerHTML = pillsHTML;
      }
      _scrollBottom(true);
    };

    /* ============================================================
       5. Typing indicator
       ============================================================ */
    var showTypingIndicator = function () {
      var container = _ensureMessagesContainer();
      if (container.querySelector('.jarvis-typing-msg')) return;
      var html = [
        '<div class="jarvis-msg ai jarvis-typing-msg">',
          '<span class="jarvis-msg-label">JARVIS</span>',
          '<div class="jarvis-typing-indicator">',
            '<div class="jarvis-typing-dot"></div>',
            '<div class="jarvis-typing-dot"></div>',
            '<div class="jarvis-typing-dot"></div>',
          '</div>',
        '</div>'
      ].join('');
      _inject(container, html);
      _scrollBottom(true);
    };

    var hideTypingIndicator = function () {
      var el = _q('.jarvis-typing-msg');
      if (el) el.remove();
    };

    /* ============================================================
       6. renderExplorer(folderId)
       ============================================================ */
    var renderExplorer = function (folderId) {
      _explorerPath = folderId || '/';
      var items     = TREE[_explorerPath] || [];
      var segments = _explorerPath.split('/').filter(Boolean);
      var crumbHTML = '<span class="jarvis-breadcrumb-segment" data-path="/">/</span>';
      var built = '';
      segments.forEach(function (seg) {
        built += '/' + seg;
        var p = built;
        crumbHTML += '<span class="jarvis-breadcrumb-sep">›</span>';
        crumbHTML += [
          '<span class="jarvis-breadcrumb-segment',
            (p === _explorerPath ? ' active' : ''),
            '" data-path="' + p + '">',
            _esc(seg),
          '</span>'
        ].join('');
      });
      var cardsHTML = items.length
        ? items.map(_explorerCard).join('')
        : '<div class="jarvis-empty" style="grid-column:1/-1;padding:24px;"><div class="jarvis-empty-title">Empty</div></div>';
      var html = [
        '<div class="jarvis-explorer">',
          '<div class="jarvis-breadcrumb" id="jarvis-breadcrumb">' + crumbHTML + '</div>',
          '<div class="jarvis-explorer-grid" id="jarvis-explorer-grid">' + cardsHTML + '</div>',
        '</div>'
      ].join('');
      var content = document.getElementById(CONTENT_ID);
      if (content) {
        content.innerHTML = html;
        _retriggerAnimation(_q('#jarvis-explorer-grid'), 'animating');
        _bindExplorerEvents(content);
      }
      return html;
    };

    var _explorerCard = function (item) {
      if (item.type === 'folder') {
        return [
          '<div class="jarvis-explorer-card" data-type="folder"',
            ' data-id="' + (item.id || '') + '" data-name="' + _esc(item.name) + '">',
            '<div class="jarvis-folder-icon">',
              SVG.folder(item.color),
            '</div>',
            '<span class="jarvis-explorer-label">' + _esc(item.name) + '</span>',
          '</div>'
        ].join('');
      }
      return [
        '<div class="jarvis-explorer-card" data-type="file"',
          ' data-name="' + _esc(item.name) + '" data-ext="' + _esc(item.ext || '') + '">',
          '<div class="jarvis-file-icon">' + SVG.file(item.ext) + '</div>',
          '<span class="jarvis-explorer-label">' + _esc(item.name) + '</span>',
          '<span class="jarvis-explorer-meta jarvis-file-ext ' + _esc(item.ext || '') + '">',
            (item.ext || '').toUpperCase(),
          '</span>',
        '</div>'
      ].join('');
    };

    var _bindExplorerEvents = function (root) {
      root.addEventListener('click', function (e) {
        var card = e.target.closest('.jarvis-explorer-card');
        if (card) {
          if (card.dataset.type === 'folder') {
            openFolder(card.dataset.id || ('/' + card.dataset.name));
          } else {
            showFilePreview({
              name: card.dataset.name,
              ext:  card.dataset.ext,
              path: _explorerPath + '/' + card.dataset.name
            });
          }
          return;
        }
        var seg = e.target.closest('.jarvis-breadcrumb-segment');
        if (seg && seg.dataset.path) {
          renderExplorer(seg.dataset.path);
        }
      });
    };

    /* ============================================================
       7. openFolder(folderId)
       ============================================================ */
    var openFolder = function (folderId) {
      var grid = _q('#jarvis-explorer-grid');
      if (!grid) { renderExplorer(folderId); return; }
      grid.style.transition = 'transform 280ms ease, opacity 280ms ease';
      grid.style.transform  = 'scale(1.04)';
      grid.style.opacity    = '0';
      setTimeout(function () {
        renderExplorer(folderId);
        var newGrid = _q('#jarvis-explorer-grid');
        if (newGrid) _retriggerAnimation(newGrid, 'animating');
      }, 280);
    };

    /* ============================================================
       8. showFilePreview(fileData)
       ============================================================ */
    var showFilePreview = function (fileData) {
      fileData = fileData || {};
      var path = fileData.path || fileData.name || 'untitled';
      var ext  = fileData.ext  || path.split('.').pop().toLowerCase();
      var code = fileData.code || '// ' + path + '\n// Select a file to preview its contents.';
      var content = document.getElementById(CONTENT_ID);
      if (!content) return;
      content.innerHTML = [
        '<div class="jarvis-explorer" style="height:100%;">',
          '<div class="jarvis-breadcrumb">',
            '<span class="jarvis-breadcrumb-segment" id="jarvis-preview-back"',
              ' data-path="' + _esc(_explorerPath) + '" style="cursor:pointer;">← Back</span>',
            '<span class="jarvis-breadcrumb-sep">›</span>',
            '<span class="jarvis-breadcrumb-segment active">' + _esc(path) + '</span>',
          '</div>',
          '<div id="jarvis-file-preview-area" style="flex:1;overflow:auto;padding:16px;">',
            '<div class="jarvis-diff-code" id="jarvis-preview-code" style="animation:none;">',
              '<div class="jarvis-code-lines" id="jarvis-preview-lines"></div>',
            '</div>',
          '</div>',
        '</div>'
      ].join('');
      var backBtn = _q('#jarvis-preview-back');
      if (backBtn) backBtn.addEventListener('click', function () {
        renderExplorer(_explorerPath);
      });
      animateFileOpen(path, function () {
        var linesContainer = _q('#jarvis-preview-lines');
        if (linesContainer) {
          animateCodeLines(code, linesContainer, ext);
        }
      });
    };

    /* ============================================================
       9. renderCodeStep(step, index, total)
       ============================================================ */
    var renderCodeStep = function (step, index, total) {
      step  = step  || {};
      total = total || 1;
      var op     = step.op   || 'modify';
      var path   = step.path || 'unknown';
      var code   = step.code || '';
      var diff   = step.diff || [];
      var ext    = path.split('.').pop().toLowerCase();
      var lines  = code.split('\n');
      var linesHTML = lines.map(function (line, i) {
        var lineNum  = i + 1;
        var diffInfo = diff.find(function (d) { return d.line === lineNum; });
        var lineType = diffInfo ? diffInfo.type : '';
        return [
          '<div class="jarvis-code-line ' + lineType + '">',
            '<span class="jarvis-line-num">' + lineNum + '</span>',
            '<span class="jarvis-line-content">' + _highlight(line, ext) + '</span>',
          '</div>'
        ].join('');
      }).join('');
      var dots = '';
      if (total > 1) {
        for (var d = 0; d < total; d++) {
          var cls = d === index ? 'active' : (d < index ? 'done' : '');
          dots += '<div class="jarvis-diff-progress-dot ' + cls + '"></div>';
        }
      }
      var btns = [
        '<button class="jarvis-diff-btn copy"    data-step="' + index + '">COPY</button>',
        op === 'modify'
          ? '<button class="jarvis-diff-btn show-in-file" data-step="' + index + '">SHOW IN FILE</button>'
          : '<button class="jarvis-diff-btn preview"      data-step="' + index + '">PREVIEW</button>',
        '<button class="jarvis-diff-btn apply"   data-step="' + index + '">APPLY</button>'
      ].join('');
      return [
        '<div class="jarvis-diff-step" data-step-index="' + index + '" data-op="' + op + '" data-path="' + _esc(path) + '">',
          '<div class="jarvis-diff-step-header">',
            '<span class="jarvis-diff-step-number">STEP ' + (index + 1) + '</span>',
            '<span class="jarvis-diff-step-op ' + op + '">' + op.toUpperCase() + '</span>',
            '<span class="jarvis-diff-step-path">' + _esc(path) + '</span>',
            '<div class="jarvis-diff-file-icon with-glow">' + SVG.file(ext) + '</div>',
          '</div>',
          '<div class="jarvis-diff-code" data-step="' + index + '">',
            '<div class="jarvis-code-lines">' + linesHTML + '</div>',
          '</div>',
          '<div class="jarvis-diff-actions">' + btns + '</div>',
          total > 1 ? '<div class="jarvis-diff-progress">' + dots + '</div>' : '',
        '</div>'
      ].join('');
    };

    /* ============================================================
       10. animateFileOpen(filePath, callback)
       ============================================================ */
    var animateFileOpen = function (filePath, callback) {
      var target = _q('#jarvis-preview-code') || _qAll('.jarvis-diff-code').slice(-1)[0];
      if (!target) {
        if (callback) callback();
        return;
      }
      target.style.animation = 'none';
      void target.offsetWidth;
      target.style.animation = '';
      target.classList.add('jarvis-file-open-trigger');
      var iconEl = target.previousElementSibling && target.previousElementSibling.querySelector('.jarvis-diff-file-icon');
      if (iconEl) {
        iconEl.classList.add('with-glow');
        setTimeout(function () { iconEl.classList.remove('with-glow'); }, 1800);
      }
      setTimeout(function () {
        target.classList.remove('jarvis-file-open-trigger');
        if (callback) callback();
      }, FILE_OPEN_MS);
    };

    /* ============================================================
       11. animateCodeLines(code, container, ext)
       ============================================================ */
    var animateCodeLines = function (code, container, ext) {
      if (!container) return;
      container.innerHTML = '';
      ext = ext || 'js';
      var lines = (code || '').split('\n');
      lines.forEach(function (line, i) {
        var row = document.createElement('div');
        row.className = 'jarvis-code-line';
        row.style.animationDelay = (i * LINE_STAGGER_MS) + 'ms';
        row.innerHTML = [
          '<span class="jarvis-line-num">' + (i + 1) + '</span>',
          '<span class="jarvis-line-content">' + _highlight(line, ext) + '</span>'
        ].join('');
        container.appendChild(row);
      });
      var codeBlock = container.closest('.jarvis-diff-code') || container.closest('#jarvis-file-preview-area');
      if (codeBlock) {
        var totalMs = lines.length * LINE_STAGGER_MS + 200;
        setTimeout(function () {
          codeBlock.scrollTop = codeBlock.scrollHeight;
        }, totalMs);
      }
    };

    var _scheduleDiffStepHighlight = function (diffContainer, stepIndex) {
      var steps = diffContainer.querySelectorAll('.jarvis-diff-step');
      if (!steps.length) return;
      var currentStep = steps[stepIndex];
      if (currentStep) {
        var codeBlock = currentStep.querySelector('.jarvis-diff-code');
        if (codeBlock) {
          codeBlock.style.animation = 'none';
          void codeBlock.offsetWidth;
          codeBlock.style.animation = '';
        }
      }
      if (stepIndex < steps.length - 1) {
        var timer = setTimeout(function () {
          if (currentStep) currentStep.style.opacity = '0.5';
          var next = steps[stepIndex + 1];
          if (next) {
            next.style.opacity = '1';
            next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          _scheduleDiffStepHighlight(diffContainer, stepIndex + 1);
        }, STEP_AUTO_ADV_MS);
        _stepTimers.push(timer);
      }
    };

    /* ============================================================
       12. toggleCinematic()
       ============================================================ */
    var toggleCinematic = function () {
      _cinematicMode ? _exitCinematic() : _enterCinematic();
    };

    var _enterCinematic = function () {
      if (_cinematicMode || !_panelOpen) return;
      _cinematicMode = true;
      var panel = document.getElementById(PANEL_ID);
      var root  = document.getElementById(ROOT_ID);
      if (!panel || !root) return;
      var wrap = document.createElement('div');
      wrap.id  = CINEMATIC_ID;
      wrap.className = 'jarvis-cinematic';
      var bg = document.createElement('div');
      bg.className = 'jarvis-cinematic-bg';
      var hint = document.createElement('div');
      hint.className   = 'jarvis-cinematic-hint';
      hint.textContent = 'F · ESC to exit cinematic';
      root.insertBefore(wrap, panel);
      wrap.appendChild(bg);
      wrap.appendChild(panel);
      wrap.appendChild(hint);
      FreedomOS.emit('jarvis:cinematic_enter', {});
    };

    var _exitCinematic = function () {
      if (!_cinematicMode) return;
      _cinematicMode = false;
      var wrap  = document.getElementById(CINEMATIC_ID);
      var panel = document.getElementById(PANEL_ID);
      var root  = document.getElementById(ROOT_ID);
      if (wrap && panel && root) {
        root.appendChild(panel);
        wrap.remove();
      }
      FreedomOS.emit('jarvis:cinematic_exit', {});
    };

    /* ============================================================
       PRIVATE — INPUT / KEYBOARD / TAB / MESSAGE EVENTS
       ============================================================ */
    var _onSend = function () {
      if (_isStreaming) return;
      var input = _q('#' + INPUT_ID);
      if (!input) return;
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = 'auto';
      addUserMessage(text);
      showTypingIndicator();
      _isStreaming = true;
      _setInputLocked(true);
      _callAI(text, null)
        .then(function (data) {
          _isStreaming = false;
          hideTypingIndicator();
          addAIMessage(data.message, {
            actions:       data.actions,
            logSuggestion: data.log_suggestion,
            codeSteps:     data.codeSteps || null
          });
          _setInputLocked(false);
          _focusInput();
        })
        .catch(function (err) {
          _isStreaming = false;
          hideTypingIndicator();
          addAIMessage('Signal lost. ' + (err.message || 'Try again.'));
          _setInputLocked(false);
          FreedomOS.toast('JARVIS unreachable.', 'error');
        });
    };

    var _bindInputEvents = function () {
      var input   = _q('#' + INPUT_ID);
      var sendBtn = _q('#' + SEND_ID);
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _onSend();
          }
        });
        input.addEventListener('input', function () {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
      }
      if (sendBtn) sendBtn.addEventListener('click', _onSend);
    };

    var _bindTabEvents = function () {
      var tabs = _q('#' + TABS_ID);
      if (!tabs) return;
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.jarvis-tab');
        if (btn && btn.dataset.tab !== _activeTab) {
          _switchTab(btn.dataset.tab, false);
        }
      });
    };

    var _bindMessageAreaEvents = function () {
      var content = document.getElementById(CONTENT_ID);
      if (!content) return;
      content.addEventListener('click', function (e) {
        var actionBtn = e.target.closest('.jarvis-action-btn');
        if (actionBtn) {
          try {
            var action = JSON.parse(actionBtn.dataset.action || '{}');
            FreedomOS.emit('jarvis:action', action);
          } catch (_) {}
          return;
        }
        var pill = e.target.closest('.jarvis-log-pill');
        if (pill) {
          try {
            var suggestion = JSON.parse(pill.dataset.suggestion || '{}');
            FreedomOS.emit('jarvis:log_suggestion', suggestion);
          } catch (_) {}
          return;
        }
        var diffBtn = e.target.closest('.jarvis-diff-btn');
        if (diffBtn) {
          _handleDiffBtn(diffBtn);
          return;
        }
        var histItem = e.target.closest('.jarvis-history-item');
        if (histItem && histItem.dataset.convId) {
          FreedomOS.emit('jarvis:load_conversation', { id: histItem.dataset.convId });
          _switchTab('chat', false);
          return;
        }
      });
    };

    var _onKeyDown = function (e) {
      if (!_panelOpen) return;
      if (e.key === 'Escape') {
        _cinematicMode ? _exitCinematic() : _closePanel();
        return;
      }
      var isTyping = document.activeElement &&
        (document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.tagName === 'INPUT');
      if ((e.key === 'f' || e.key === 'F') && !isTyping) {
        e.preventDefault();
        toggleCinematic();
      }
    };

    /* ============================================================
       PRIVATE — TAB SWITCHING
       ============================================================ */
    var _switchTab = function (tab, skipAnim) {
      _activeTab = tab;
      _qAll('.jarvis-tab').forEach(function (btn) {
        var active = btn.dataset.tab === tab;
        btn.classList.toggle('active', active);
      });
      var content = document.getElementById(CONTENT_ID);
      if (!content) return;
      if (!skipAnim) {
        content.style.opacity = '0';
        content.style.transform = 'translateY(4px)';
      }
      setTimeout(function () {
        if (tab === 'chat') {
          content.innerHTML = _chatTabHTML();
          _bindInputEvents();
          _bindMessageAreaEvents();
          _scrollBottom(false);
        } else if (tab === 'files') {
          renderExplorer(_explorerPath);
        } else if (tab === 'history') {
          content.innerHTML = _historyTabHTML();
          _bindMessageAreaEvents();
        }
        content.style.transition = 'opacity 200ms ease, transform 200ms ease';
        content.style.opacity    = '1';
        content.style.transform  = 'translateY(0)';
      }, skipAnim ? 0 : 120);
    };

    var _chatTabHTML = function () {
      var conv = _currentConversation ? _currentConversation() : null;
      var msgs = (conv && conv.messages) ? conv.messages : [];
      var msgsHTML = msgs.length
        ? msgs.map(_renderPersistedMessage).join('')
        : [
            '<div class="jarvis-empty">',
              '<span class="jarvis-empty-icon">' + SVG.hexOrb + '</span>',
              '<div class="jarvis-empty-title">JARVIS Online</div>',
              '<div class="jarvis-empty-sub">Mission control ready.<br>What are we building?</div>',
            '</div>'
          ].join('');
      return [
        '<div class="jarvis-messages" id="' + MESSAGES_ID + '">' + msgsHTML + '</div>',
        '<div class="jarvis-input-area">',
          '<div class="jarvis-input-row">',
            '<textarea class="jarvis-input" id="' + INPUT_ID + '"',
              ' placeholder="Talk to JARVIS…" rows="1"',
              ' aria-label="Message JARVIS"></textarea>',
            '<button class="jarvis-send-btn" id="' + SEND_ID + '" aria-label="Send">',
              '<span class="jarvis-send-icon">' + SVG.send + '</span>',
            '</button>',
          '</div>',
        '</div>'
      ].join('');
    };

    var _historyTabHTML = function () {
      var convs = (_jarvisState && _jarvisState.conversations) ? _jarvisState.conversations : [];
      if (!convs.length) {
        return '<div class="jarvis-empty" style="flex:1;"><div class="jarvis-empty-title">No history yet</div></div>';
      }
      var currentId = _jarvisState.currentConversationId;
      return '<div style="flex:1;overflow-y:auto;">' +
        convs.map(function (c) {
          var active = c.id === currentId;
          return [
            '<div class="jarvis-history-item" data-conv-id="' + c.id + '"',
              ' style="padding:12px 16px;cursor:pointer;',
              'border-bottom:1px solid rgba(255,255,255,0.04);',
              'border-left:2px solid ' + (active ? 'var(--color-primary)' : 'transparent') + ';',
              (active ? 'background:rgba(0,212,170,0.05);' : '') + '">',
              '<div style="font-size:12px;color:var(--color-text);margin-bottom:3px;">',
                _esc(c.title),
              '</div>',
              '<div style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);">',
                (c.messages ? c.messages.length : 0) + ' msgs · ' + _relTime(c.timestamp),
              '</div>',
            '</div>'
          ].join('');
        }).join('') +
      '</div>';
    };

    var _renderPersistedMessage = function (msg) {
      if (msg.role === 'user') {
        return [
          '<div class="jarvis-msg user" data-id="' + msg.id + '">',
            '<span class="jarvis-msg-label">YOU</span>',
            '<div class="jarvis-msg-bubble">' + _esc(msg.content) + '</div>',
            '<span class="jarvis-msg-time">' + _formatTime(msg.timestamp) + '</span>',
          '</div>'
        ].join('');
      }
      var codeHtml = Array.isArray(msg.codeSteps) && msg.codeSteps.length
        ? '<div class="jarvis-diff-container">' +
            msg.codeSteps.map(function (s, i) { return renderCodeStep(s, i, msg.codeSteps.length); }).join('') +
          '</div>'
        : '';
      var actHtml = Array.isArray(msg.actions) && msg.actions.length
        ? '<div class="jarvis-msg-actions">' +
            msg.actions.map(function (a) {
              return '<button class="jarvis-action-btn" data-action="' + _esc(JSON.stringify(a)) + '">' +
                _esc(_actionLabel(a.type)) + '</button>';
            }).join('') +
          '</div>'
        : '';
      var pillHtml = msg.logSuggestion
        ? '<div class="jarvis-log-pill" data-suggestion="' + _esc(JSON.stringify(msg.logSuggestion)) + '">' +
            '<span class="jarvis-log-pill-dot"></span>' +
            'LOG ' + (msg.logSuggestion.type || '').replace(/_/g, ' ').toUpperCase() +
          '</div>'
        : '';
      return [
        '<div class="jarvis-msg ai" data-id="' + msg.id + '">',
          '<span class="jarvis-msg-label">JARVIS</span>',
          '<div class="jarvis-msg-bubble">',
            '<span class="jarvis-msg-text">' + _formatAIText(msg.content) + '</span>',
            codeHtml, actHtml, pillHtml,
          '</div>',
          '<span class="jarvis-msg-time">' + _formatTime(msg.timestamp) + '</span>',
        '</div>'
      ].join('');
    };

    /* ============================================================
       PRIVATE — DIFF BUTTON HANDLERS
       ============================================================ */
    var _handleDiffBtn = function (btn) {
      var stepEl = btn.closest('.jarvis-diff-step');
      if (!stepEl) return;
      var path    = stepEl.dataset.path || '';
      var stepIdx = parseInt(stepEl.dataset.stepIndex, 10) || 0;
      var lines   = stepEl.querySelectorAll('.jarvis-line-content');
      var code    = Array.from(lines).map(function (l) { return l.textContent; }).join('\n');
      if (btn.classList.contains('copy')) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code)
            .then(function () { FreedomOS.toast('Code copied.', 'success'); })
            .catch(function () { FreedomOS.toast('Copy failed.', 'error'); });
        } else {
          FreedomOS.toast('Clipboard not available.', 'warning');
        }
        return;
      }
      if (btn.classList.contains('preview') || btn.classList.contains('show-in-file')) {
        FreedomOS.emit('jarvis:show_file', { path: path, stepIndex: stepIdx });
        FreedomOS.toast('Opening: ' + path, 'info');
        return;
      }
      if (btn.classList.contains('apply')) {
        FreedomOS.confirm('Apply this change to your project?').then(function (ok) {
          if (!ok) return;
          stepEl.style.borderColor = 'rgba(0,212,170,0.5)';
          stepEl.style.background  = 'rgba(0,212,170,0.04)';
          btn.textContent  = '✓ APPLIED';
          btn.disabled     = true;
          btn.style.opacity = '0.6';
          FreedomOS.toast('Change applied.', 'success');
          FreedomOS.emit('jarvis:code_applied', { path: path, stepIndex: stepIdx });
        }).catch(function () {});
      }
    };

    /* ============================================================
       PRIVATE — MISC HELPERS
       ============================================================ */
    var _ensureMessagesContainer = function () {
      var el = document.getElementById(MESSAGES_ID);
      if (el) return el;
      if (_panelOpen) _switchTab('chat', true);
      return document.getElementById(MESSAGES_ID);
    };
    var _removeEmpty = function (container) {
      if (!container) return;
      var emp = container.querySelector('.jarvis-empty');
      if (emp) emp.remove();
    };
    var _setInputLocked = function (locked) {
      var input   = _q('#' + INPUT_ID);
      var sendBtn = _q('#' + SEND_ID);
      if (input)   input.disabled   = locked;
      if (sendBtn) sendBtn.disabled = locked;
    };
    var _focusInput = function () {
      var input = _q('#' + INPUT_ID);
      if (input) input.focus();
    };
    var _scrollBottom = function (smooth) {
      var container = document.getElementById(MESSAGES_ID);
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    };
    var _formatAIText = function (text) {
      var s = _esc(text);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/`([^`]+)`/g,
        '<code style="font-family:var(--font-mono);font-size:.9em;color:var(--color-primary)">$1</code>');
      s = s.replace(/\n/g, '<br>');
      return s;
    };
    var _actionLabel = function (type) {
      var labels = {
        navigate:      '→ Navigate',
        log_win:       '+ Log Win',
        log_person:    '+ Log Person',
        log_learned:   '+ Log Learning',
        start_project: '+ Start Project',
        show_file:     '⊞ Show File',
        highlight_code:'⌥ View Code'
      };
      return labels[type] || type;
    };

    /* ============================================================
       PUBLIC API
       ============================================================ */
    return {
      renderOrb:   renderOrb,
      renderPanel: renderPanel,
      closePanel:  _closePanel,
      addUserMessage:       addUserMessage,
      addAIMessage:         addAIMessage,
      showTypingIndicator:  showTypingIndicator,
      hideTypingIndicator:  hideTypingIndicator,
      renderExplorer:  renderExplorer,
      openFolder:      openFolder,
      showFilePreview: showFilePreview,
      renderCodeStep:    renderCodeStep,
      animateFileOpen:   animateFileOpen,
      animateCodeLines:  animateCodeLines,
      toggleCinematic: toggleCinematic,
      isPanelOpen:      function () { return _panelOpen; },
      isCinematic:      function () { return _cinematicMode; },
      isStreaming:       function () { return _isStreaming; },
      setExplorerTree:  function (path, items) { TREE[path] = items; },
      switchTab:        function (tab) { _switchTab(tab, false); }
    };
  }());


  /* ============================================================
     PART G — MODULE REGISTRATION & BOOT
     ============================================================ */

  FreedomOS.registerModule({
    name: 'jarvis',
    routes: ['jarvis'],

    render: function () {
      return '<div class="jarvis-view">' +
        '<div class="jarvis-view-header">' +
        '<h1>JARVIS Mission Control</h1>' +
        '<p class="jarvis-subtitle">Operator Score: ' + _scanner.getSummary().operatorScore +
        ' | ' + _scanner.getSummary().dayLogStreak + ' day log streak</p>' +
        '</div>' +
        '<div class="jarvis-view-content">' +
        '<div class="jarvis-stats-grid">' +
        '<div class="jarvis-stat-card">' +
        '<div class="stat-value">' + _scanner.getSummary().activeProjects + '</div>' +
        '<div class="stat-label">Active Projects</div>' +
        '</div>' +
        '<div class="jarvis-stat-card">' +
        '<div class="stat-value">' + _scanner.getSummary().totalWins + '</div>' +
        '<div class="stat-label">Total Wins</div>' +
        '</div>' +
        '<div class="jarvis-stat-card">' +
        '<div class="stat-value">' + FreedomOS.formatMoney(_scanner.getSummary().revenue) + '</div>' +
        '<div class="stat-label">MTD Revenue</div>' +
        '</div>' +
        '<div class="jarvis-stat-card">' +
        '<div class="stat-value">' + _scanner.getSummary().topStreak + '</div>' +
        '<div class="stat-label">Top Habit Streak</div>' +
        '</div>' +
        '</div>' +
        '<div class="jarvis-quick-actions">' +
        '<h3>Quick Actions</h3>' +
        '<button class="jarvis-quick-btn" data-action="log_win">🎯 Log Win</button>' +
        '<button class="jarvis-quick-btn" data-action="log_person">🤝 Save Contact</button>' +
        '<button class="jarvis-quick-btn" data-action="log_learned">📚 Log Learning</button>' +
        '<button class="jarvis-quick-btn" data-action="start_project">🚀 New Project</button>' +
        '</div>' +
        '<div class="jarvis-conversations">' +
        '<h3>Conversations</h3>' +
        _jarvisState.conversations.map(function(c) {
          return '<div class="jarvis-conv-item" data-id="' + c.id + '">' +
            '<div class="conv-title">' + c.title + '</div>' +
            '<div class="conv-meta">' + c.messages.length + ' messages · ' +
            new Date(c.timestamp).toLocaleDateString() + '</div>' +
            '</div>';
        }).join('') +
        '</div>' +
        '</div>' +
        '</div>';
    },

    onMount: function () {
      /* Mount the floating orb */
      _ui.renderOrb();

      /* Wire quick action buttons in the full-page view */
      document.querySelectorAll('.jarvis-quick-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var actionType = this.dataset.action;
          var data = {};
          switch(actionType) {
            case 'log_win':
              data = { title: 'Quick Win', category: 'Other', description: '' };
              break;
            case 'log_person':
              data = { name: 'New Contact', platform: '', category: 'Contact' };
              break;
            case 'log_learned':
              data = { content: 'New learning entry' };
              break;
            case 'start_project':
              data = { name: 'New Project', model: 'Other', hypothesis: '' };
              break;
          }
          _actions[actionType](data);
        });
      });

      /* Wire conversation items to open the panel */
      document.querySelectorAll('.jarvis-conv-item').forEach(function(item) {
        item.addEventListener('click', function() {
          _jarvisState.currentConversationId = this.dataset.id;
          _saveState();
          _ui.renderPanel();
        });
      });

      /* Global keyboard shortcut: Cmd/Ctrl+Shift+J toggles JARVIS panel */
      document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'J') {
          e.preventDefault();
          _ui.isPanelOpen() ? _ui.closePanel() : _ui.renderPanel();
        }
      });

      /* Listen for action events from the UI */
      FreedomOS.on('jarvis:action', function(action) {
        if (action && action.type && _actions[action.type]) {
          _actions[action.type](action.payload || {});
        }
      });

      /* Listen for log suggestion events */
      FreedomOS.on('jarvis:log_suggestion', function(suggestion) {
        if (suggestion && suggestion.type && _actions[suggestion.type]) {
          _actions[suggestion.type](suggestion.data || {});
        }
      });

      /* Listen for load_conversation events */
      FreedomOS.on('jarvis:load_conversation', function(data) {
        if (data && data.id) {
          _jarvisState.currentConversationId = data.id;
          _saveState();
          if (_ui.isPanelOpen()) {
            _ui.switchTab('chat');
          }
        }
      });

      /* Quick capture integration */
      FreedomOS.on('jarvis:quick_capture', function() {
        if (!_ui.isPanelOpen()) {
          _ui.renderPanel();
        }
        setTimeout(function() {
          var input = document.getElementById('jarvis-input');
          if (input) {
            input.value = 'capture ';
            input.focus();
          }
        }, 300);
      });

      /* Expose public API on FreedomOS namespace */
      FreedomOS.JARVIS = {
        open:    function() { _ui.renderPanel(); },
        close:   function() { _ui.closePanel(); },
        send:    function(msg) {
          if (!_ui.isPanelOpen()) _ui.renderPanel();
          setTimeout(function() {
            var input = document.getElementById('jarvis-input');
            if (input) {
              input.value = msg;
              input.dispatchEvent(new Event('input'));
              /* Trigger send via the UI's internal handler */
              var sendBtn = document.getElementById('jarvis-send-btn');
              if (sendBtn) sendBtn.click();
            }
          }, 400);
        },
        cinematic: {
          enter: function() { if (!_ui.isCinematic()) _ui.toggleCinematic(); },
          exit:  function() { if (_ui.isCinematic()) _ui.toggleCinematic(); }
        },
        getState:  function() { return FreedomOS.deepClone(_jarvisState); },
        newChat:   function() {
          _newConversation();
          if (_ui.isPanelOpen() && _ui.isPanelOpen()) _ui.switchTab('chat');
        },
        clearHistory: function() {
          _jarvisState.conversations = [];
          _jarvisState.currentConversationId = null;
          _saveState();
          if (_ui.isPanelOpen()) _ui.switchTab('chat');
          FreedomOS.toast('Chat history cleared.', 'info');
        },
        ui: _ui,
        scanner: _scanner,
        actions: _actions
      };

      FreedomOS.emit('jarvis:ready', { version: 'v3', module: 'jarvis' });
    },

    onUnmount: function () {
      /* Clean up */
      _ui.closePanel();
      var orb = document.getElementById('jarvis-orb');
      if (orb) orb.remove();
      delete FreedomOS.JARVIS;
    }
  });

  /* ============================================================
     AUTO-BOOT: Mount orb after DOM ready if not already mounted
     ============================================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        if (!document.getElementById('jarvis-orb')) {
          _ui.renderOrb();
        }
      }, 500);
    });
  } else {
    setTimeout(function() {
      if (!document.getElementById('jarvis-orb')) {
        _ui.renderOrb();
      }
    }, 500);
  }

})();