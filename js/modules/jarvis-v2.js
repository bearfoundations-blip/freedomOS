// ============================================================
// Freedom OS — JARVIS Holographic AI v2.0
// File: js/modules/jarvis.js
// Depends: kernel/core.js, kernel/events.js, kernel/ui.js, kernel/utils.js, kernel/router.js
// Provides: Holographic file explorer + Groq-style chat that can log wins, people, projects
// Last Updated: 2026-05-19
// ============================================================
//
// CONNECTION CONTRACT:
// - Registers as FreedomOS module with route 'jarvis'
// - Uses FreedomOS.navigate() to open real modules from holographic folders
// - Can log wins, people, projects, dayLog entries via FreedomOS.mutate()
// - Emits 'jarvis:opened', 'jarvis:closed' for other modules to listen
//
// FILMING MODE: Press F during JARVIS view to toggle fullscreen cinematic mode
// ============================================================

(function() {
  'use strict';

  var MODULE_NAME = 'jarvis';
  var ROUTE_NAME = 'jarvis';
  var API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'freedomos.bearfoundations.workers.dev';

  // ---- STATE ----
  var _container = null;
  var _listeners = [];
  var _stateUnsub = null;
  var _isOpen = false;
  var _isCinematic = false;
  var _conversation = [];
  var _currentFolder = 'root';
  var _isAnimating = false;
  var _typingInterval = null;
  var _orbPulseInterval = null;

  // ---- HOLOGRAPHIC FILE SYSTEM (mirrors real FreedomOS modules) ----
  var _fileSystem = {
    root: {
      name: 'Freedom OS',
      breadcrumb: ['Freedom OS'],
      items: [
        { name: 'Dashboard', icon: '◈', meta: 'Mission Control', type: 'folder', id: 'dashboard', route: 'dashboard', color: '#00d4aa' },
        { name: 'Day Log', icon: '◉', meta: 'Daily Tracking', type: 'folder', id: 'dayLog', route: 'dayLog', color: '#7c3aed' },
        { name: 'Projects', icon: '◎', meta: 'Active Builds', type: 'folder', id: 'projects', route: 'projects', color: '#00d4aa' },
        { name: 'War Room', icon: '⚔', meta: 'Strategy Hub', type: 'folder', id: 'warRoom', route: 'warRoom', color: '#ef4444' },
        { name: 'Creator Studio', icon: '✎', meta: 'Content Engine', type: 'folder', id: 'creatorStudio', route: 'creatorStudio', color: '#7c3aed' },
        { name: 'Stage Mode', icon: '▣', meta: 'Focus View', type: 'folder', id: 'stageMode', route: 'stageMode', color: '#f59e0b' },
        { name: 'Finance', icon: '$', meta: 'Revenue & Burn', type: 'folder', id: 'finance', route: 'finance', color: '#00d4aa' },
        { name: 'People', icon: '♟', meta: 'Network & Contacts', type: 'folder', id: 'people', route: 'people', color: '#7c3aed' },
        { name: 'Wins', icon: '★', meta: 'Victory Wall', type: 'folder', id: 'wins', route: 'wins', color: '#f59e0b' },
        { name: 'Letters', icon: '✉', meta: 'Notes & Drafts', type: 'folder', id: 'letters', route: 'letters', color: '#00d4aa' },
        { name: 'Reviews', icon: '⚑', meta: 'Weekly Reviews', type: 'folder', id: 'reviews', route: 'reviews', color: '#7c3aed' },
        { name: 'Roadmap', icon: '▤', meta: 'Future Plans', type: 'folder', id: 'roadmap', route: 'roadmap', color: '#00d4aa' },
        { name: 'Stats', icon: '◉', meta: 'Analytics', type: 'folder', id: 'stats', route: 'stats', color: '#7c3aed' },
        { name: 'Analytics', icon: '◐', meta: 'Deep Data', type: 'folder', id: 'analytics', route: 'analytics', color: '#00d4aa' }
      ]
    },
    // Sub-folders for richer demo
    dashboard: {
      name: 'Dashboard',
      breadcrumb: ['Freedom OS', 'Dashboard'],
      items: [
        { name: 'Operator Score', icon: '📊', meta: 'Performance', type: 'file', content: 'Current Operator Score: <span class="holo-highlight">' + (_getOperatorScore()) + '/100</span><br>Habits: <span class="holo-highlight">' + (_getHabitCount()) + '</span> tracked<br>Active Projects: <span class="holo-highlight">' + (_getActiveProjects()) + '</span>' },
        { name: 'Countdown', icon: '⏱️', meta: 'Time to Freedom', type: 'file', content: _getCountdownHTML() },
        { name: 'Quick Stats', icon: '📈', meta: 'Live Metrics', type: 'file', content: 'Revenue This Month: <span class="holo-highlight">' + (_getRevenue()) + '</span><br>Current Streak: <span class="holo-highlight">' + (_getStreak()) + ' days</span><br>Wins This Week: <span class="holo-highlight">' + (_getWeeklyWins()) + '</span>' },
        { name: 'Habits.tracker', icon: '📋', meta: 'Daily Discipline', type: 'file' },
        { name: 'Intentions.list', icon: '🎯', meta: 'Today\'s Focus', type: 'file' }
      ]
    },
    finance: {
      name: 'Finance',
      breadcrumb: ['Freedom OS', 'Finance'],
      items: [
        { name: 'Revenue Tracker', icon: '💰', meta: 'Income Stream', type: 'file', content: 'Total Revenue: <span class="holo-highlight">' + (_getTotalRevenue()) + '</span><br>Monthly Target: <span class="holo-highlight">' + (_getMonthlyTarget()) + '</span><br>Progress: <span class="holo-highlight">' + (_getRevenueProgress()) + '%</span>' },
        { name: 'Burn Rate', icon: '🔥', meta: 'Monthly Spend', type: 'file', content: 'Current Burn: <span class="holo-highlight">' + (_getBurnRate()) + '/mo</span><br>Runway: <span class="holo-highlight">' + (_getRunway()) + ' months</span>' },
        { name: 'Ledger.csv', icon: '📄', meta: 'Transactions', type: 'file' },
        { name: 'Project P&L', icon: '📊', meta: 'Profit/Loss', type: 'folder', id: 'finance_projects' },
        { name: 'Monthly Targets', icon: '🎯', meta: 'Goals', type: 'file' }
      ]
    },
    wins: {
      name: 'Wins',
      breadcrumb: ['Freedom OS', 'Wins'],
      items: [
        { name: 'Revenue Wins', icon: '💵', meta: 'Money Made', type: 'file', content: _getWinsByCategory('Revenue') },
        { name: 'Viral Moments', icon: '🚀', meta: 'Content Hits', type: 'file', content: _getWinsByCategory('Viral') },
        { name: 'Milestones', icon: '🏆', meta: 'Big Achievements', type: 'file', content: _getWinsByCategory('Milestone') },
        { name: 'Personal Growth', icon: '🌱', meta: 'Self Development', type: 'file', content: _getWinsByCategory('Personal') },
        { name: 'Launches', icon: '🚀', meta: 'Shipped Products', type: 'file', content: _getWinsByCategory('Launch') }
      ]
    },
    people: {
      name: 'People',
      breadcrumb: ['Freedom OS', 'People'],
      items: [
        { name: 'Collaborators', icon: '🤝', meta: 'Partners', type: 'file', content: _getPeopleByCategory('collaborator') },
        { name: 'Clients', icon: '💼', meta: 'Customers', type: 'file', content: _getPeopleByCategory('client') },
        { name: 'Mentors', icon: '🧠', meta: 'Advisors', type: 'file', content: _getPeopleByCategory('mentor') },
        { name: 'Peers', icon: '👥', meta: 'Network', type: 'file', content: _getPeopleByCategory('peer') },
        { name: 'Follow-ups', icon: '📅', meta: 'Due Today', type: 'file', content: _getOverdueFollowups() }
      ]
    },
    projects: {
      name: 'Projects',
      breadcrumb: ['Freedom OS', 'Projects'],
      items: [
        { name: 'Active Builds', icon: '🔨', meta: 'In Progress', type: 'file', content: _getActiveProjectsList() },
        { name: 'Completed', icon: '✅', meta: 'Shipped', type: 'file', content: _getCompletedProjects() },
        { name: 'On Hold', icon: '⏸️', meta: 'Paused', type: 'file', content: _getOnHoldProjects() },
        { name: 'Hypotheses', icon: '🔬', meta: 'Experiments', type: 'file' }
      ]
    }
  };

  // ---- DATA HELPERS (pull from FreedomOS.state) ----
  function _getOperatorScore() {
    var state = FreedomOS.state || {};
    var habits = state.dashboard && state.dashboard.habits ? state.dashboard.habits : [];
    var wins = state.wins || [];
    var projects = state.projects || [];
    var habitDone = habits.filter(function(h) {
      if (!h.lastCompleted) return false;
      return h.lastCompleted === new Date().toISOString().split('T')[0];
    }).length;
    var habitScore = habits.length > 0 ? (habitDone / habits.length) : 0;
    var winScore = Math.min(wins.length / 10, 1);
    var projectScore = Math.min(projects.filter(function(p) { return p.status === 'active'; }).length / 3, 1);
    return Math.round((habitScore * 0.4 + winScore * 0.3 + projectScore * 0.3) * 100);
  }

  function _getHabitCount() { return ((FreedomOS.state || {}).dashboard || {}).habits ? FreedomOS.state.dashboard.habits.length : 0; }
  function _getActiveProjects() { return ((FreedomOS.state || {}).projects || []).filter(function(p) { return p.status === 'active'; }).length; }
  function _getStreak() { return ((FreedomOS.state || {}).dayLog || {}).streak || 0; }
  function _getWeeklyWins() {
    var oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return ((FreedomOS.state || {}).wins || []).filter(function(w) { return w.date && new Date(w.date) >= oneWeekAgo; }).length;
  }
  function _getRevenue() {
    var now = new Date(); var start = new Date(now.getFullYear(), now.getMonth(), 1);
    var ledger = ((FreedomOS.state || {}).finance || {}).ledger || [];
    return '$' + ledger.filter(function(e) { return e.type === 'income' && e.date && new Date(e.date) >= start; }).reduce(function(s, e) { return s + (e.amount || 0); }, 0).toLocaleString();
  }
  function _getTotalRevenue() {
    var ledger = ((FreedomOS.state || {}).finance || {}).ledger || [];
    return '$' + ledger.filter(function(e) { return e.type === 'income'; }).reduce(function(s, e) { return s + (e.amount || 0); }, 0).toLocaleString();
  }
  function _getMonthlyTarget() { return '$50,000'; } // Could pull from state
  function _getRevenueProgress() { return '67'; } // Could calculate
  function _getBurnRate() { return '$3,200'; }
  function _getRunway() { return '18'; }
  function _getCountdownHTML() {
    var target = new Date('2029-05-21T00:00:00');
    var diff = target - Date.now();
    if (diff <= 0) return '<span class="holo-highlight">TARGET REACHED</span>';
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return '<span class="holo-highlight">' + days + '</span> days <span class="holo-highlight">' + hours + '</span> hrs <span class="holo-highlight">' + minutes + '</span> min';
  }
  function _getWinsByCategory(cat) {
    var wins = ((FreedomOS.state || {}).wins || []).filter(function(w) { return w.category === cat; }).slice(0, 5);
    if (wins.length === 0) return 'No ' + cat.toLowerCase() + ' wins yet. Go get one.';
    return wins.map(function(w) { return '• <span class="holo-highlight">' + w.title + '</span> — ' + w.date; }).join('<br>');
  }
  function _getPeopleByCategory(cat) {
    var people = ((FreedomOS.state || {}).people || []).filter(function(p) { return p.category === cat; }).slice(0, 5);
    if (people.length === 0) return 'No ' + cat + 's yet. Network more.';
    return people.map(function(p) { return '• <span class="holo-highlight">' + p.name + '</span> — ' + (p.platform || ''); }).join('<br>');
  }
  function _getOverdueFollowups() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var people = ((FreedomOS.state || {}).people || []).filter(function(p) { return p.followUpDate && new Date(p.followUpDate) < today; }).slice(0, 5);
    if (people.length === 0) return 'All follow-ups are current. Great work.';
    return people.map(function(p) { return '⚠️ <span class="holo-highlight">' + p.name + '</span> — was due ' + p.followUpDate; }).join('<br>');
  }
  function _getActiveProjectsList() {
    var projects = ((FreedomOS.state || {}).projects || []).filter(function(p) { return p.status === 'active'; }).slice(0, 5);
    if (projects.length === 0) return 'No active projects. Start building.';
    return projects.map(function(p) { return '🔨 <span class="holo-highlight">' + p.name + '</span> — ' + (p.hypothesis || 'Building in public'); }).join('<br>');
  }
  function _getCompletedProjects() {
    var projects = ((FreedomOS.state || {}).projects || []).filter(function(p) { return p.status === 'completed'; }).slice(0, 5);
    if (projects.length === 0) return 'No completed projects yet.';
    return projects.map(function(p) { return '✅ <span class="holo-highlight">' + p.name + '</span>'; }).join('<br>');
  }
  function _getOnHoldProjects() {
    var projects = ((FreedomOS.state || {}).projects || []).filter(function(p) { return p.status === 'on-hold'; }).slice(0, 3);
    if (projects.length === 0) return 'No paused projects.';
    return projects.map(function(p) { return '⏸️ <span class="holo-highlight">' + p.name + '</span>'; }).join('<br>');
  }

  // ---- RENDER: MAIN JARVIS VIEW ----
  function _renderJarvisView() {
    return (
      '<div class="jarvis-holo-container' + (_isCinematic ? ' cinematic' : '') + '" id="jarvis-holo-container">' +
        '<div class="holo-bg-grid"></div>' +
        '<div class="holo-bg-orb"></div>' +
        '<div class="holo-scanlines"></div>' +

        // LEFT: Chat Panel (Groq style)
        '<div class="holo-chat-panel">' +
          '<div class="holo-chat-header">' +
            '<div class="holo-logo-orb">' +
              '<svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M16 2L4 9v14l12 7 12-7V9L16 2z" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="currentColor"/></svg>' +
            '</div>' +
            '<div class="holo-chat-title">' +
              '<h1>Freedom OS</h1>' +
              '<div class="holo-chat-subtitle">JARVIS v2.0 — Online</div>' +
            '</div>' +
            '<div class="holo-status-dot"></div>' +
          '</div>' +
          '<div class="holo-chat-messages" id="holo-chat-messages">' +
            '<div class="holo-message holo-message-ai" id="holo-welcome-msg">' +
              'Good afternoon. Freedom OS is operational. I\'m monitoring all systems. What would you like to explore today?' +
            '</div>' +
          '</div>' +
          '<div class="holo-chat-input-area">' +
            '<div class="holo-input-wrapper">' +
              '<input type="text" class="holo-chat-input" id="holo-chat-input" placeholder="Ask JARVIS anything..." autocomplete="off">' +
              '<button class="holo-send-btn" id="holo-send-btn">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="holo-input-hint">Press <kbd>Enter</kbd> to send · <kbd>F</kbd> for cinematic mode · <kbd>Esc</kbd> to close</div>' +
          '</div>' +
        '</div>' +

        // RIGHT: Holographic Explorer
        '<div class="holo-explorer-panel" id="holo-explorer-panel">' +
          '<div class="holo-explorer-header" id="holo-explorer-header">' +
            '<div class="holo-breadcrumb" id="holo-breadcrumb">' +
              '<span>Freedom OS</span>' +
              '<span class="holo-separator">/</span>' +
              '<span style="color: var(--color-text-muted);">Home</span>' +
            '</div>' +
          '</div>' +
          '<div class="holo-folder-grid" id="holo-folder-grid"></div>' +
          '<div id="holo-content-area"></div>' +
        '</div>' +

        // Cinematic toggle hint
        '<div class="holo-cinematic-hint" id="holo-cinematic-hint">Press <kbd>F</kbd> for fullscreen cinematic mode</div>' +
      '</div>'
    );
  }

  // ---- RENDER: FOLDER GRID ----
  function _renderFolders(folderId) {
    var data = _fileSystem[folderId] || _fileSystem.root;
    var grid = _container.querySelector('#holo-folder-grid');
    var contentArea = _container.querySelector('#holo-content-area');
    var header = _container.querySelector('#holo-explorer-header');
    var breadcrumb = _container.querySelector('#holo-breadcrumb');

    if (data.breadcrumb) {
      breadcrumb.innerHTML = data.breadcrumb.map(function(crumb, i) {
        return i === data.breadcrumb.length - 1
          ? '<span style="color: var(--color-text-muted);">' + crumb + '</span>'
          : '<span>' + crumb + '</span>' + (i < data.breadcrumb.length - 1 ? '<span class="holo-separator">/</span>' : '');
      }).join('');
    }

    contentArea.innerHTML = '';
    _currentFolder = folderId;

    grid.innerHTML = data.items.map(function(item, i) {
      var delay = i * 0.08;
      if (item.type === 'folder') {
        return (
          '<div class="holo-folder-item" data-folder-id="' + item.id + '" data-route="' + (item.route || '') + '" style="animation-delay: ' + delay + 's">' +
            '<div class="holo-folder-icon" style="color: ' + (item.color || 'var(--color-primary)') + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>' +
              '</svg>' +
            '</div>' +
            '<div class="holo-folder-name">' + item.name + '</div>' +
            '<div class="holo-folder-meta">' + item.meta + '</div>' +
            '<div class="holo-folder-glow" style="background: radial-gradient(circle, ' + (item.color || 'var(--color-primary)') + '20, transparent 70%)"></div>' +
          '</div>'
        );
      } else {
        return (
          '<div class="holo-folder-item holo-file-item" data-file-name="' + item.name + '" style="animation-delay: ' + delay + 's">' +
            '<div class="holo-folder-icon" style="font-size: 28px;">' + item.icon + '</div>' +
            '<div class="holo-folder-name">' + item.name + '</div>' +
            '<div class="holo-folder-meta">' + item.meta + '</div>' +
          '</div>'
        );
      }
    }).join('');

    // Attach click handlers
    grid.querySelectorAll('.holo-folder-item[data-folder-id]').forEach(function(el) {
      el.addEventListener('click', function() {
        var fid = this.dataset.folderId;
        var route = this.dataset.route;
        if (route && _fileSystem[fid] && _fileSystem[fid].items && _fileSystem[fid].items.length > 0) {
          _openFolder(fid);
        } else if (route) {
          // No sub-items, navigate directly to the module
          _addAIMessage('Opening <span class="holo-highlight">' + fid + '</span> module now...');
          setTimeout(function() { FreedomOS.navigate(route); }, 800);
        } else {
          _openFolder(fid);
        }
      });
    });

    grid.querySelectorAll('.holo-file-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var fname = this.dataset.fileName;
        var item = data.items.find(function(it) { return it.name === fname; });
        if (item && item.content) {
          _showFilePreview(item.name, item.content);
        } else {
          _showFilePreview(item.name, 'File opened. <span class="holo-highlight">Access granted.</span><br><br>Loading from Freedom OS secure storage...');
        }
      });
    });
  }

  // ---- FOLDER OPENING ANIMATION ----
  function _openFolder(folderId) {
    if (_isAnimating) return;
    _isAnimating = true;

    var overlay = document.createElement('div');
    overlay.className = 'holo-folder-opening active';
    overlay.innerHTML = (
      '<div class="holo-opening-glow"></div>' +
      '<div class="holo-opening-folder">' +
        '<div class="holo-folder-back"></div>' +
        '<div class="holo-folder-flap"></div>' +
      '</div>'
    );
    _container.appendChild(overlay);

    setTimeout(function() {
      overlay.remove();
      _renderFolders(folderId);
      _isAnimating = false;
    }, 900);
  }

  // ---- FILE PREVIEW ----
  function _showFilePreview(name, content) {
    var contentArea = _container.querySelector('#holo-content-area');
    contentArea.innerHTML = (
      '<div class="holo-content-preview">' +
        '<div class="holo-preview-header">' +
          '<span style="font-size: 20px;">📄</span>' +
          '<span class="holo-preview-title">' + name + '</span>' +
          '<button class="holo-preview-close" id="holo-preview-close">✕</button>' +
        '</div>' +
        '<div class="holo-preview-body">' + content + '</div>' +
      '</div>'
    );

    var closeBtn = contentArea.querySelector('#holo-preview-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        contentArea.innerHTML = '';
      });
    }
  }

  // ---- CHAT FUNCTIONS ----
  function _addUserMessage(text) {
    var container = _container.querySelector('#holo-chat-messages');
    var msg = document.createElement('div');
    msg.className = 'holo-message holo-message-user';
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    _conversation.push({ role: 'user', content: text });
  }

  function _addAIMessage(text, typewriter) {
    var container = _container.querySelector('#holo-chat-messages');
    var msg = document.createElement('div');
    msg.className = 'holo-message holo-message-ai';
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;

    if (typewriter !== false) {
      var i = 0;
      var fullText = text;
      msg.innerHTML = '<span class="holo-typing-cursor"></span>';

      if (_typingInterval) clearInterval(_typingInterval);
      _typingInterval = setInterval(function() {
        if (i < fullText.length) {
          msg.innerHTML = fullText.substring(0, i + 1) + '<span class="holo-typing-cursor"></span>';
          container.scrollTop = container.scrollHeight;
          i++;
        } else {
          clearInterval(_typingInterval);
          msg.innerHTML = fullText;
          container.scrollTop = container.scrollHeight;
        }
      }, 18);
    } else {
      msg.innerHTML = text;
      container.scrollTop = container.scrollHeight;
    }

    _conversation.push({ role: 'assistant', content: text.replace(/<<[^>]+>/g, '') });
  }

  // ---- AI RESPONSE LOGIC (with logging capabilities) ----
  function _handleAIResponse(userText) {
    var lower = userText.toLowerCase();
    var state = FreedomOS.state || {};

    // Pattern: "I just [got/made/landed/sold/closed] $X" → Log win
    var winMatch = userText.match(/(?:just\s+)?(?:got|made|landed|sold|closed|signed)\s+(?:a\s+)?(?:\$?\d+[kK]?|a\s+client|a\s+deal|a\s+sponsor)/i);
    if (winMatch || lower.includes('win') || lower.includes('money') || lower.includes('client') || lower.includes('deal')) {
      var amount = userText.match(/\$?(\d+[kK]?)/);
      var title = userText.replace(/^i\s+(just\s+)?/i, '').substring(0, 60);
      _addAIMessage('🎯 <span class="holo-highlight">Win detected!</span> I can log this to your Wins Wall.<br><br>' +
        'Title: <span class="holo-highlight">' + title + '</span><br>' +
        'Category: <span class="holo-highlight">Revenue</span><br><br>' +
        '<button class="holo-action-btn" data-action="log-win" data-title="' + FreedomOS.escapeHtml(title) + '" data-category="Revenue">✓ Log This Win</button>');
      return;
    }

    // Pattern: "I met [name]" or "New contact" → Log person
    var personMatch = userText.match(/met\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (personMatch || lower.includes('contact') || lower.includes('networking') || lower.includes('connection')) {
      var name = personMatch ? personMatch[1] : 'New Contact';
      var platform = lower.includes('twitter') || lower.includes('x') ? 'Twitter/X' :
                     lower.includes('linkedin') ? 'LinkedIn' :
                     lower.includes('instagram') ? 'Instagram' :
                     lower.includes('tiktok') ? 'TikTok' : 'Unknown';
      _addAIMessage('🤝 <span class="holo-highlight">Contact detected!</span> I can save this to your People list.<br><br>' +
        'Name: <span class="holo-highlight">' + name + '</span><br>' +
        'Platform: <span class="holo-highlight">' + platform + '</span><br><br>' +
        '<button class="holo-action-btn" data-action="log-person" data-name="' + FreedomOS.escapeHtml(name) + '" data-platform="' + platform + '">✓ Save Contact</button>');
      return;
    }

    // Pattern: "I learned" or "Read" or "Watched" → Log dayLog
    if (lower.includes('learned') || lower.includes('read ') || lower.includes('watched ') || lower.includes('tutorial') || lower.includes('course')) {
      _addAIMessage('📚 <span class="holo-highlight">Learning detected!</span> I can add this to today\'s Day Log.<br><br>' +
        '<button class="holo-action-btn" data-action="log-learned" data-content="' + FreedomOS.escapeHtml(userText) + '">✓ Log to DayLog</button>');
      return;
    }

    // Pattern: "Show me [module]" or "Open [module]"
    var moduleMap = {
      'dashboard': 'dashboard', 'day log': 'dayLog', 'daylog': 'dayLog',
      'projects': 'projects', 'war room': 'warRoom', 'warroom': 'warRoom',
      'creator studio': 'creatorStudio', 'creatorstudio': 'creatorStudio',
      'stage mode': 'stageMode', 'stagemode': 'stageMode',
      'finance': 'finance', 'people': 'people', 'wins': 'wins',
      'letters': 'letters', 'reviews': 'reviews', 'roadmap': 'roadmap',
      'stats': 'stats', 'analytics': 'analytics'
    };
    for (var key in moduleMap) {
      if (lower.includes(key) || lower.includes('open ' + key.split(' ')[0]) || lower.includes('show ' + key.split(' ')[0])) {
        var route = moduleMap[key];
        _addAIMessage('Accessing <span class="holo-highlight">' + key + '</span> module. Opening now...');
        setTimeout(function() { FreedomOS.navigate(route); }, 800);
        return;
      }
    }

    // Pattern: "Show me [folder]" in explorer
    var folderMap = {
      'revenue': 'finance', 'burn rate': 'finance', 'ledger': 'finance',
      'habits': 'dashboard', 'operator score': 'dashboard',
      'collaborators': 'people', 'clients': 'people', 'mentors': 'people',
      'active builds': 'projects', 'completed': 'projects'
    };
    for (var fkey in folderMap) {
      if (lower.includes(fkey)) {
        _addAIMessage('Opening <span class="holo-highlight">' + fkey + '</span> folder...');
        setTimeout(function() { _renderFolders(folderMap[fkey]); }, 600);
        return;
      }
    }

    // Default: Try API or give smart fallback
    _tryAPIResponse(userText);
  }

  function _tryAPIResponse(userText) {
    _addAIMessage('<span class="holo-typing-cursor"></span>', false);

    var manifest = null;
    try {
      var manifestRaw = localStorage.getItem('jarvis_manifest_cache');
      if (manifestRaw) manifest = JSON.parse(manifestRaw);
    } catch(e) {}

    fetch(API_BASE + '/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        currentFile: null,
        manifestVersion: manifest ? manifest.generated : null
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var container = _container.querySelector('#holo-chat-messages');
      var lastMsg = container.lastElementChild;
      if (lastMsg && lastMsg.classList.contains('holo-message-ai')) {
        lastMsg.remove();
      }

      var message = data.message || data.error || 'I\'m analyzing your request...';

      // Handle log suggestions from API
      if (data.log_suggestion) {
        var ls = data.log_suggestion;
        if (ls.type === 'win') {
          message += '<br><br><button class="holo-action-btn" data-action="log-win" data-title="' + FreedomOS.escapeHtml(ls.title || '') + '" data-category="' + (ls.category || 'Other') + '" data-description="' + FreedomOS.escapeHtml(ls.description || '') + '">✓ Log This Win</button>';
        } else if (ls.type === 'person') {
          message += '<br><br><button class="holo-action-btn" data-action="log-person" data-name="' + FreedomOS.escapeHtml(ls.name || '') + '" data-platform="' + (ls.platform || 'Unknown') + '" data-notes="' + FreedomOS.escapeHtml(ls.notes || '') + '">✓ Save Contact</button>';
        } else if (ls.type === 'learned') {
          message += '<br><br><button class="holo-action-btn" data-action="log-learned" data-content="' + FreedomOS.escapeHtml(ls.whatILearned || '') + '">✓ Log to DayLog</button>';
        }
      }

      _addAIMessage(message);
    })
    .catch(function(err) {
      var container = _container.querySelector('#holo-chat-messages');
      var lastMsg = container.lastElementChild;
      if (lastMsg && lastMsg.classList.contains('holo-message-ai')) {
        lastMsg.remove();
      }
      _addAIMessage('I\'m processing that. Freedom OS neural network is analyzing all available data sources. What would you like me to focus on?');
    });
  }

  // ---- ACTION HANDLERS (Log to FreedomOS state) ----
  function _handleLogWin(title, category, description) {
    var wins = FreedomOS.deepClone(FreedomOS.get('wins') || []);
    wins.push({
      id: FreedomOS.generateId(),
      title: title,
      category: category || 'Other',
      date: new Date().toISOString().split('T')[0],
      description: description || '',
      projectId: ''
    });
    FreedomOS.mutate('wins', wins);
    FreedomOS.toast('Win logged! 🎯', 'success');
    _addAIMessage('✅ Win logged to your <span class="holo-highlight">Wins Wall</span>. Keep stacking them.');
  }

  function _handleLogPerson(name, platform, notes) {
    var people = FreedomOS.deepClone(FreedomOS.get('people') || []);
    people.push({
      id: FreedomOS.generateId(),
      name: name,
      platform: platform || 'Unknown',
      category: 'peer',
      notes: notes || '',
      interactions: [],
      lastContact: new Date().toISOString().split('T')[0]
    });
    FreedomOS.mutate('people', people);
    FreedomOS.toast('Contact saved! 🤝', 'success');
    _addAIMessage('✅ Contact saved to <span class="holo-highlight">People</span>. Network = net worth.');
  }

  function _handleLogLearned(content) {
    var today = new Date().toISOString().split('T')[0];
    var logs = FreedomOS.deepClone(FreedomOS.get('dayLog.logs') || []);
    var todayLog = logs.find(function(l) { return l.date === today; });
    if (!todayLog) {
      todayLog = { date: today, whatILearned: '', ideas: '', wins: '', notes: '', tomorrowsFocus: '' };
      logs.push(todayLog);
    }
    todayLog.whatILearned = (todayLog.whatILearned ? todayLog.whatILearned + '\n\n' : '') + content;
    FreedomOS.mutate('dayLog.logs', logs);
    FreedomOS.toast('Learning logged! 📚', 'success');
    _addAIMessage('✅ Learning added to today\'s <span class="holo-highlight">Day Log</span>. Compound knowledge.');
  }

  // ---- CINEMATIC MODE ----
  function _toggleCinematic() {
    _isCinematic = !_isCinematic;
    var container = _container.querySelector('#jarvis-holo-container');
    if (container) {
      container.classList.toggle('cinematic', _isCinematic);
    }
    if (_isCinematic) {
      document.body.classList.add('jarvis-cinematic-active');
      document.getElementById('sidebar').style.display = 'none';
      document.getElementById('header').style.display = 'none';
    } else {
      document.body.classList.remove('jarvis-cinematic-active');
      document.getElementById('sidebar').style.display = '';
      document.getElementById('header').style.display = '';
    }
  }

  // ---- EVENT ATTACHMENT ----
  function _attachEvents() {
    var sendBtn = _container.querySelector('#holo-send-btn');
    var input = _container.querySelector('#holo-chat-input');

    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        if (input && input.value.trim()) {
          _addUserMessage(input.value.trim());
          _handleAIResponse(input.value.trim());
          input.value = '';
        }
      });
    }

    if (input) {
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          if (input.value.trim()) {
            _addUserMessage(input.value.trim());
            _handleAIResponse(input.value.trim());
            input.value = '';
          }
        }
      });
    }

    // Action buttons in chat
    _container.addEventListener('click', function(e) {
      var btn = e.target.closest('.holo-action-btn');
      if (!btn) return;

      var action = btn.dataset.action;
      if (action === 'log-win') {
        _handleLogWin(btn.dataset.title, btn.dataset.category, btn.dataset.description);
        btn.disabled = true;
        btn.textContent = '✓ Logged!';
      } else if (action === 'log-person') {
        _handleLogPerson(btn.dataset.name, btn.dataset.platform, btn.dataset.notes);
        btn.disabled = true;
        btn.textContent = '✓ Saved!';
      } else if (action === 'log-learned') {
        _handleLogLearned(btn.dataset.content);
        btn.disabled = true;
        btn.textContent = '✓ Logged!';
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if (FreedomOS.currentRoute !== ROUTE_NAME) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        _toggleCinematic();
      }
      if (e.key === 'Escape') {
        if (_isCinematic) {
          _toggleCinematic();
        } else {
          FreedomOS.navigate('dashboard');
        }
      }
    });
  }

  // ---- MODULE REGISTRATION ----
  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'ui', 'events', 'utils', 'router'],

    init: function() {
      FreedomOS.DEBUG && console.log('[JARVIS] Holographic module initialized.');
    },

    render: function(params) {
      return _renderJarvisView();
    },

    onMount: function(container) {
      _container = container;
      _isOpen = true;
      _currentFolder = 'root';
      _conversation = [];

      // Render initial folders
      _renderFolders('root');
      _attachEvents();

      // Orb pulse animation for chat header
      var orb = _container.querySelector('.holo-logo-orb');
      if (orb) {
        var pulse = 0;
        _orbPulseInterval = setInterval(function() {
          pulse = (pulse + 1) % 360;
          orb.style.boxShadow = '0 0 ' + (20 + Math.sin(pulse * 0.05) * 10) + 'px var(--color-primary-glow)';
        }, 50);
      }

      // Staggered entrance
      var panels = _container.querySelectorAll('.holo-chat-panel, .holo-explorer-panel');
      panels.forEach(function(p, i) {
        p.style.opacity = '0';
        p.style.transform = 'translateX(' + (i === 0 ? '-30px' : '30px') + ')';
        setTimeout(function() {
          p.style.transition = 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)';
          p.style.opacity = '1';
          p.style.transform = 'translateX(0)';
        }, i * 150);
      });

      // Hide cinematic hint after 4 seconds
      setTimeout(function() {
        var hint = _container.querySelector('#holo-cinematic-hint');
        if (hint) hint.style.opacity = '0';
      }, 4000);

      FreedomOS.emit('jarvis:opened');
    },

    onUnmount: function(container) {
      _isOpen = false;
      if (_typingInterval) clearInterval(_typingInterval);
      if (_orbPulseInterval) clearInterval(_orbPulseInterval);
      if (_isCinematic) {
        document.body.classList.remove('jarvis-cinematic-active');
        document.getElementById('sidebar').style.display = '';
        document.getElementById('header').style.display = '';
      }
      _container = null;
      FreedomOS.emit('jarvis:closed');
    }
  });

  // ---- GLOBAL SHORTCUT: Ctrl/Cmd + J opens JARVIS from anywhere ----
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault();
      if (FreedomOS.currentRoute === ROUTE_NAME) {
        FreedomOS.navigate('dashboard');
      } else {
        FreedomOS.navigate(ROUTE_NAME);
      }
    }
  });

})();/ /   f o r c e   r e b u i l d   0 5 / 2 0 / 2 0 2 6   0 0 : 2 4 : 5 9  
 / /   r e b u i l d  
 