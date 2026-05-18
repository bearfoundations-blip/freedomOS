(function() {
  'use strict';

  var MODULE_NAME = 'jarvis';
  var ROUTE_NAME = 'jarvis';
  var API_BASE = '';

  var manifest = null;
  var layout = null;
  var currentFile = null;
  var isProcessing = false;
  var _container = null;

  function _createOrb() {
    if (document.getElementById('jarvis-orb')) return;

    var orb = document.createElement('button');
    orb.id = 'jarvis-orb';
    orb.className = 'jarvis-orb';
    orb.setAttribute('aria-label', 'Ask JARVIS');
    orb.innerHTML = '<span class="jarvis-orb-core">J</span><span class="jarvis-orb-ring"></span>';

    orb.addEventListener('click', function() {
      if (FreedomOS.currentRoute === ROUTE_NAME) {
        var input = document.getElementById('jv-input');
        if (input) input.focus();
      } else {
        FreedomOS.navigate(ROUTE_NAME);
      }
    });

    document.body.appendChild(orb);
  }

  function _renderFullView() {
    return (
      '<div class="view-jarvis">' +
        '<div class="jarvis-grid">' +
          '<aside class="jarvis-sidebar glass-panel">' +
            '<header class="panel-header">' +
              '<span>📁 Project</span>' +
              '<span id="jv-fileCount" class="file-meta">--</span>' +
            '</header>' +
            '<div class="jarvis-tree" id="jv-tree"></div>' +
            '<div class="jarvis-health" id="jv-health"></div>' +
          '</aside>' +
          '<main class="jarvis-editor glass-panel active">' +
            '<header class="code-toolbar">' +
              '<div class="code-path" id="jv-path"><span style="opacity:0.5">Select a file</span></div>' +
              '<div class="code-stats" id="jv-stats"></div>' +
            '</header>' +
            '<div class="code-scroll" id="jv-code"></div>' +
          '</main>' +
          '<aside class="jarvis-chat glass-panel">' +
            '<header class="panel-header">' +
              '<span>🤖 JARVIS</span>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
                '<select id="jv-ai-select" class="jarvis-select">' +
                  '<option value="groq">Groq (Fast)</option>' +
                  '<option value="openai">OpenAI (Smart)</option>' +
                  '<option value="ollama">Ollama (Local)</option>' +
                '</select>' +
                '<span style="font-size:10px;opacity:0.6">v2.0</span>' +
              '</div>' +
            '</header>' +
            '<div class="chat-history" id="jv-chat"></div>' +
            '<div class="action-log" id="jv-actions"></div>' +
            '<div class="chat-input-area">' +
              '<div class="input-wrapper">' +
                '<input type="text" id="jv-input" class="chat-input" placeholder="Ask JARVIS to optimize, refactor, or log a win..." autocomplete="off">' +
                '<button id="jv-send" class="send-btn">➤</button>' +
              '</div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
      '</div>'
    );
  }

  function _escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function _basicHighlight(code, ext) {
    if (ext === 'js') {
      code = code.replace(/\b(const|let|var|function|class|import|export|from|return|if|else|for|while|async|await|new|this|try|catch)\b/g, '<span class="syntax-keyword">$1</span>');
      code = code.replace(/(['"`])(.*?)\1/g, '<span class="syntax-string">$1$2$1</span>');
      code = code.replace(/\b([A-Za-z0-9_$]+)(?=\s*\()/g, '<span class="syntax-function">$1</span>');
      code = code.replace(/(\/\/.*$)/gm, '<span class="syntax-comment">$1</span>');
    }
    if (ext === 'css') {
      code = code.replace(/([A-Za-z-]+)(?=\s*:)/g, '<span class="syntax-keyword">$1</span>');
      code = code.replace(/(\/\*.*?\*\/)/g, '<span class="syntax-comment">$1</span>');
    }
    return code;
  }

  function _renderTree() {
    var tree = document.getElementById('jv-tree');
    if (!tree || !manifest || !manifest.files) return;

    tree.innerHTML = '';

    var groups = {
      css: { title: '🎨 Styles', files: [] },
      kernel: { title: '⚙️ Kernel', files: [] },
      modules: { title: '📦 Modules', files: [] },
      system: { title: '🔧 System', files: [] },
      root: { title: '📄 Root', files: [] }
    };

    manifest.files.forEach(function(f) {
      if (f.path.indexOf('css/') === 0) groups.css.files.push(f);
      else if (f.path.indexOf('js/kernel/') === 0) groups.kernel.files.push(f);
      else if (f.path.indexOf('js/modules/') === 0) groups.modules.files.push(f);
      else if (f.path.indexOf('js/system/') === 0) groups.system.files.push(f);
      else groups.root.files.push(f);
    });

    Object.keys(groups).forEach(function(key) {
      var sec = groups[key];
      if (!sec.files.length) return;

      var section = document.createElement('div');
      section.className = 'tree-section';

      var title = document.createElement('div');
      title.className = 'tree-section-title';
      title.textContent = sec.title;
      section.appendChild(title);

      sec.files.forEach(function(f) {
        var item = document.createElement('div');
        item.className = 'file-item type-' + f.type + (f.issues && f.issues.length ? ' has-issues' : '');
        item.dataset.path = f.path;

        var icon = f.type === 'stylesheet' ? '🎨' : f.type === 'core' ? '⚙️' : f.type === 'feature-module' ? '📦' : '🔧';
        item.innerHTML =
          '<span class="file-icon">' + icon + '</span>' +
          '<span class="file-name">' + f.path.split('/').pop() + '</span>' +
          '<span class="file-meta">' + f.lines + 'L' + (f.issues && f.issues.length ? ' · ' + f.issues.length + '⚠️' : '') + '</span>';

        item.addEventListener('click', function() { _loadFile(f.path); });
        section.appendChild(item);
      });

      tree.appendChild(section);
    });
  }

  function _loadFile(filePath) {
    currentFile = filePath;

    document.querySelectorAll('.file-item').forEach(function(el) { el.classList.remove('active'); });
    var active = document.querySelector('.file-item[data-path="' + filePath + '"]');
    if (active) active.classList.add('active');

    var pathEl = document.getElementById('jv-path');
    if (pathEl) pathEl.innerHTML = '<span style="color:var(--color-primary);font-weight:600">' + filePath + '</span>';

    fetch('/api/file?path=' + encodeURIComponent(filePath))
      .then(function(res) { return res.json(); })
      .then(function(data) {
        _renderCode(data.content, filePath);
        var stats = document.getElementById('jv-stats');
        if (stats) stats.textContent = data.content.split('\n').length + ' lines · ' + (data.content.length / 1024).toFixed(1) + 'KB';
      })
      .catch(function(e) {
        var code = document.getElementById('jv-code');
        if (code) code.innerHTML = '<span style="color:var(--color-danger)">Error: ' + e.message + '</span>';
      });
  }

  function _renderCode(content, filePath) {
    var ext = filePath.split('.').pop();
    var lines = content.split('\n');
    var container = document.getElementById('jv-code');
    if (!container) return;

    var html = '';
    lines.forEach(function(line, i) {
      var num = i + 1;
      var escaped = _escapeHtml(line);
      if (ext === 'js' || ext === 'css') escaped = _basicHighlight(escaped, ext);

      html += '<div class="line" data-line="' + num + '">' +
        '<span class="line-number">' + num + '</span>' +
        '<span class="line-content">' + (escaped || ' ') + '</span>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  function _addBubble(text, sender) {
    var history = document.getElementById('jv-chat');
    if (!history) return;

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-' + sender;

    if (sender === 'ai') {
      bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    } else if (sender === 'system') {
      bubble.className += ' chat-thinking';
      bubble.textContent = text;
    } else {
      bubble.textContent = text;
    }

    history.appendChild(bubble);
    history.scrollTop = history.scrollHeight;
    return bubble;
  }

  function _logAction(icon, text) {
    var log = document.getElementById('jv-actions');
    if (!log) return;
    var item = document.createElement('div');
    item.className = 'action-item';
    item.innerHTML = '<span>' + icon + '</span><span>' + text + '</span>';
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }

  function _handleLogSuggestion(suggestion) {
    if (!suggestion || !suggestion.type) return;

    var today = new Date().toISOString().split('T')[0];
    var message = '';
    var mutatePath = '';
    var data = null;

    switch (suggestion.type) {
      case 'win':
        message = 'Log this win: <strong>' + _escapeHtml(suggestion.title || 'Untitled') + '</strong>';
        mutatePath = 'wins';
        var wins = FreedomOS.deepClone(FreedomOS.get('wins') || []);
        wins.push({
          id: FreedomOS.generateId(),
          title: suggestion.title || 'Win',
          category: suggestion.category || 'Other',
          date: today,
          description: suggestion.description || ''
        });
        data = wins;
        break;

      case 'learned':
      case 'dayLog':
        message = 'Add to today\'s dayLog?';
        mutatePath = 'dayLog.logs';
        var logs = FreedomOS.deepClone(FreedomOS.get('dayLog.logs') || []);
        var existing = null;
        var existingIndex = -1;
        logs.forEach(function(l, idx) {
          if (l.date === today) { existing = l; existingIndex = idx; }
        });

        var entry = existing ? FreedomOS.deepClone(existing) : {
          date: today,
          whatILearned: '',
          ideas: '',
          wins: '',
          notes: '',
          tomorrowsFocus: ''
        };

        if (suggestion.whatILearned) entry.whatILearned = (entry.whatILearned ? entry.whatILearned + '\n\n' : '') + suggestion.whatILearned;
        if (suggestion.ideas) entry.ideas = (entry.ideas ? entry.ideas + '\n\n' : '') + suggestion.ideas;
        if (suggestion.wins) entry.wins = (entry.wins ? entry.wins + '\n\n' : '') + suggestion.wins;
        if (suggestion.notes) entry.notes = (entry.notes ? entry.notes + '\n\n' : '') + suggestion.notes;
        if (suggestion.tomorrowsFocus) entry.tomorrowsFocus = suggestion.tomorrowsFocus;

        if (existingIndex >= 0) logs[existingIndex] = entry;
        else logs.push(entry);
        data = logs;
        break;

      case 'project':
        message = 'Create project: <strong>' + _escapeHtml(suggestion.name || 'Untitled') + '</strong>';
        mutatePath = 'projects';
        var projects = FreedomOS.deepClone(FreedomOS.get('projects') || []);
        projects.push({
          id: FreedomOS.generateId(),
          name: suggestion.name || 'New Project',
          status: 'active',
          hypothesis: suggestion.hypothesis || '',
          created: today
        });
        data = projects;
        break;

      case 'person':
        message = 'Add contact: <strong>' + _escapeHtml(suggestion.name || 'Unknown') + '</strong>';
        mutatePath = 'people';
        var people = FreedomOS.deepClone(FreedomOS.get('people') || []);
        people.push({
          id: FreedomOS.generateId(),
          name: suggestion.name || '',
          platform: suggestion.platform || '',
          followUpDate: suggestion.followUpDate || '',
          notes: suggestion.notes || ''
        });
        data = people;
        break;

      default:
        return;
    }

    FreedomOS.confirm(message, function() {
      FreedomOS.mutate(mutatePath, data);
      FreedomOS.toast('Saved to ' + mutatePath, 'success');
      _addBubble('✅ Saved to Freedom OS', 'system');
    }, function() {
      _addBubble('❌ Discarded', 'system');
    });
  }

  function _sendMessage() {
    var input = document.getElementById('jv-input');
    var text = input.value.trim();
    if (!text || isProcessing) return;

    input.value = '';
    _addBubble(text, 'user');
    isProcessing = true;

    var thinking = _addBubble('Analyzing Freedom OS...', 'system');

    var providerEl = document.getElementById('jv-ai-select');
    var provider = providerEl ? providerEl.value : 'groq';

    fetch('/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        currentFile: currentFile,
        manifestVersion: manifest ? manifest.generated : null,
        provider: provider,
        mode: text.indexOf('optimize') >= 0 || text.indexOf('fix') >= 0 ? 'optimize' : 'chat'
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      thinking.remove();

      if (data.message) _addBubble(data.message, 'ai');
      if (data.log_suggestion) _handleLogSuggestion(data.log_suggestion);

      if (data.actions) {
        data.actions.forEach(function(action) {
          if (action.type === 'show_file') {
            _loadFile(action.path);
            _logAction('📂', 'Opened ' + action.path);
          } else if (action.type === 'highlight_range') {
            if (currentFile !== action.path) _loadFile(action.path);
            setTimeout(function() {
              for (var i = action.startLine; i <= action.endLine; i++) {
                var el = document.querySelector('[data-line="' + i + '"]');
                if (el) el.classList.add('highlight-range');
              }
            }, 300);
            _logAction('🔍', 'Lines ' + action.startLine + '-' + action.endLine);
          }
        });
      }

      if (data.css_suggestions) {
        data.css_suggestions.forEach(function(s) {
          _logAction('🎨', s.description);
        });
      }
    })
    .catch(function(e) {
      thinking.remove();
      _addBubble('⚠️ Error: ' + e.message, 'system');
    })
    .finally(function() {
      isProcessing = false;
    });
  }

  function _loadManifest() {
    Promise.all([
      fetch('/api/manifest').catch(function() { return null; }),
      fetch('/api/layout').catch(function() { return null; })
    ])
    .then(function(results) {
      return Promise.all(results.map(function(r) { return r ? r.json() : null; }));
    })
    .then(function(data) {
      manifest = data[0];
      layout = data[1];

      var count = document.getElementById('jv-fileCount');
      if (count && manifest && manifest.summary) count.textContent = manifest.summary.totalFiles + ' files';

      _renderTree();
      _renderHealth();

      var chat = document.getElementById('jv-chat');
      if (chat && chat.children.length === 0) {
        var msg = manifest && manifest.summary ?
          'JARVIS online. I see your ' + manifest.summary.totalFiles + '-file Freedom OS architecture. Ask me to optimize modules, fix brand issues, or log a win.' :
          'JARVIS online. Run `npm run scan` to index your codebase.';
        _addBubble(msg, 'ai');
      }
    });
  }

  function _renderHealth() {
    var health = document.getElementById('jv-health');
    if (!health || !manifest || !manifest.files) return;

    var filesWithIssues = manifest.files.filter(function(f) {
      return f.issues && f.issues.length > 0;
    });

    if (!filesWithIssues.length) {
      health.innerHTML = '<div class="health-good">✅ No issues</div>';
      return;
    }

    var html = '<div class="health-header">⚠️ Issues (' + filesWithIssues.reduce(function(a, f) { return a + f.issues.length; }, 0) + ')</div>';
    filesWithIssues.slice(0, 5).forEach(function(f) {
      html += '<div class="health-item" data-path="' + f.path + '">' +
        '<span class="health-file">' + f.path.split('/').pop() + '</span>' +
        '<span class="health-count">' + f.issues.length + '</span>' +
      '</div>';
    });
    health.innerHTML = html;

    health.querySelectorAll('.health-item').forEach(function(el) {
      el.addEventListener('click', function() {
        _loadFile(el.dataset.path);
        var input = document.getElementById('jv-input');
        if (input) input.value = 'Optimize ' + el.dataset.path;
      });
    });
  }

  function _onMount(container) {
    _container = container;

    var sendBtn = document.getElementById('jv-send');
    var input = document.getElementById('jv-input');

    if (sendBtn) sendBtn.addEventListener('click', _sendMessage);
    if (input) {
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') _sendMessage();
      });
    }

    _loadManifest();

    var cards = container.querySelectorAll('.glass-panel');
    cards.forEach(function(card, i) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(function() {
        card.style.transition = 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, i * 100);
    });
  }

  function _onUnmount(container) {
    _container = null;
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: [],

    init: function() {
      _createOrb();
    },

    render: function(params) {
      return _renderFullView();
    },

    onMount: function(container) {
      _onMount(container);
    },

    onUnmount: function(container) {
      _onUnmount(container);
    }
  });

  if (document.body) _createOrb();
  else document.addEventListener('DOMContentLoaded', _createOrb);

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
      e.preventDefault();
      if (FreedomOS.currentRoute === ROUTE_NAME) {
        var input = document.getElementById('jv-input');
        if (input) input.focus();
      } else {
        FreedomOS.navigate(ROUTE_NAME);
      }
    }
  });

  FreedomOS.on('view:enter', function() {
    if (!document.getElementById('jarvis-orb')) _createOrb();
  });

})();