// ============================================================
// Freedom OS — Stage Mode
// File: js/modules/stageMode.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js, kernel/timer.js
// Provides: Stage Mode module — cinematic fullscreen dashboard for filming
// Last Updated: 2026-05-10
// ============================================================

(function() {
  'use strict';

  const MODULE_NAME = 'stageMode';
  const ROUTE_NAME = 'stageMode';
  const TARGET_DATE = new Date('2029-05-21T00:00:00').getTime();

  let _listeners = [];
  let _intervals = [];
  let _timeouts = [];
  let _quoteIndex = 0;
  let _winIndex = 0;
  let _isRecording = false;

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

  function _escape(str) {
    return FreedomOS.escapeHtml(str || '');
  }

  function _formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString();
  }

  function _getProjects() {
    return FreedomOS.get('projects') || [];
  }

  function _getWins() {
    return FreedomOS.get('wins') || [];
  }

  function _getPlatforms() {
    var studio = FreedomOS.get('creatorStudio') || {};
    return studio.platforms || [];
  }

  function _getQuotes() {
    var settings = FreedomOS.get('settings') || {};
    return settings.stageModeQuotes || [];
  }

  function _getFinance() {
    return FreedomOS.get('finance') || {};
  }

  function _getDashboard() {
    return FreedomOS.get('dashboard') || {};
  }

  function _updateCountdown(container) {
    var now = Date.now();
    var diff = TARGET_DATE - now;

    if (diff <= 0) {
      var countdownContainer = container.querySelector('.countdown-container');
      if (countdownContainer) {
        countdownContainer.innerHTML = '<div class="sm-countdown-complete">TARGET REACHED</div>';
      }
      return;
    }

    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((diff % (1000 * 60)) / 1000);

    var dEl = container.querySelector('#sm-days');
    var hEl = container.querySelector('#sm-hours');
    var mEl = container.querySelector('#sm-minutes');
    var sEl = container.querySelector('#sm-seconds');

    if (dEl) dEl.textContent = String(days).padStart(3, '0');
    if (hEl) hEl.textContent = String(hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
    if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
  }

  function _rotateQuotes(container) {
    var quotes = _getQuotes();
    if (quotes.length === 0) return;

    var quoteEl = container.querySelector('.sm-quote-text');
    var authorEl = container.querySelector('.sm-quote-author');
    if (!quoteEl || !authorEl) return;

    quoteEl.classList.add('sm-quote-fade-out');

    var timeoutId = setTimeout(function() {
      _quoteIndex = (_quoteIndex + 1) % quotes.length;
      var q = quotes[_quoteIndex];
      quoteEl.textContent = '"' + (q.text || '') + '"';
      authorEl.textContent = '\u2014 ' + (q.author || 'Unknown');
      quoteEl.classList.remove('sm-quote-fade-out');
      quoteEl.classList.add('sm-quote-fade-in');

      var innerTimeout = setTimeout(function() {
        quoteEl.classList.remove('sm-quote-fade-in');
      }, 400);
      _timeouts.push(innerTimeout);
    }, 400);
    _timeouts.push(timeoutId);
  }

  function _rotateWins(container) {
    var wins = _getWins();
    if (wins.length === 0) return;

    var carousel = container.querySelector('.sm-win-carousel');
    if (!carousel) return;

    _winIndex = (_winIndex + 1) % wins.length;
    var win = wins[_winIndex];

    var html = '';
    if (win.image) {
      html += '<div class="sm-win-image"><img src="' + _escape(win.image) + '" alt=""></div>';
    }
    html += '<div class="sm-win-content">';
    html += '<div class="sm-win-category">' + _escape(win.category) + '</div>';
    html += '<div class="sm-win-title">' + _escape(win.title) + '</div>';
    if (win.description) {
      html += '<div class="sm-win-desc">' + _escape(win.description) + '</div>';
    }
    html += '<div class="sm-win-date">' + _escape(win.date) + '</div>';
    html += '</div>';

    carousel.innerHTML = html;
    carousel.classList.add('sm-win-flip');
    var timeoutId = setTimeout(function() {
      carousel.classList.remove('sm-win-flip');
    }, 600);
    _timeouts.push(timeoutId);
  }

  function _updateRevenueTicker(container) {
    var finance = _getFinance();
    var ledger = finance.ledger || [];
    var income = ledger.filter(function(l) { return l.type === 'income'; });

    var ticker = container.querySelector('.sm-ticker-track');
    if (!ticker) return;

    if (income.length === 0) {
      ticker.innerHTML = '<span class="sm-ticker-item">No revenue yet \u2014 go make some.</span>';
      return;
    }

    var recent = income.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    }).slice(0, 10);

    var html = '';
    recent.forEach(function(entry) {
      html += '<span class="sm-ticker-item"><span class="sm-ticker-project">' + _escape(entry.description || 'Revenue') + '</span><span class="sm-ticker-amount">' + FreedomOS.formatMoney(entry.amount) + '</span></span>';
      html += '<span class="sm-ticker-separator">\u2022</span>';
    });

    ticker.innerHTML = html;
  }

  function _toggleRecording(container) {
    _isRecording = !_isRecording;
    var wrapper = container.querySelector('.sm-wrapper');
    var recordBtn = container.querySelector('[data-action="toggle-recording"]');
    if (!wrapper) return;

    if (_isRecording) {
      wrapper.classList.add('sm-recording');
      if (recordBtn) recordBtn.classList.add('sm-recording-active');
      var existing = wrapper.querySelectorAll('.sm-recording-bracket');
      existing.forEach(function(el) { el.remove(); });

      var positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      positions.forEach(function(pos) {
        var bracket = document.createElement('div');
        bracket.className = 'sm-recording-bracket sm-recording-bracket-' + pos;
        wrapper.appendChild(bracket);
      });
    } else {
      wrapper.classList.remove('sm-recording');
      if (recordBtn) recordBtn.classList.remove('sm-recording-active');
      var brackets = wrapper.querySelectorAll('.sm-recording-bracket');
      brackets.forEach(function(el) { el.remove(); });
    }
  }

  function _handleKeydown(e) {
    if (e.key !== 'Escape') return;
    var modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay && !modalOverlay.classList.contains('hidden')) return;

    if (_isRecording) {
      var container = document.querySelector('.view-stageMode');
      if (container) _toggleRecording(container);
    } else {
      FreedomOS.navigate('dashboard');
    }
  }

  // --- Module Registration ---

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: [],

    init: function() {},

    render: function(params) {
      var projects = _getProjects();
      var activeProject = projects.find(function(p) { return p.status === 'active'; }) || projects[0];
      var quotes = _getQuotes();
      var firstQuote = quotes.length > 0 ? quotes[0] : { text: 'The best time to start was yesterday. The next best time is now.', author: 'Unknown' };
      var dashboard = _getDashboard();
      var operatorScore = dashboard.operatorScore || 0;

      var html = '<div class="view-stageMode">';
      html += '<div class="sm-wrapper">';
      html += '<div class="sm-bg-gradient"></div>';
      html += '<div class="sm-bg-mesh"></div>';

      html += '<div class="sm-top-bar">';
      html += '<div class="sm-operator-score"><span class="sm-score-label">Operator Score</span><span class="sm-score-value">' + operatorScore + '</span></div>';
      html += '</div>';

      html += '<div class="sm-center">';

      html += '<div class="countdown-container sm-countdown-massive sm-countdown-enter">';
      html += '<div class="countdown-unit"><div class="countdown-number" id="sm-days">000</div><div class="countdown-label">Days</div></div>';
      html += '<div class="countdown-separator">:</div>';
      html += '<div class="countdown-unit"><div class="countdown-number" id="sm-hours">00</div><div class="countdown-label">Hours</div></div>';
      html += '<div class="countdown-separator">:</div>';
      html += '<div class="countdown-unit"><div class="countdown-number" id="sm-minutes">00</div><div class="countdown-label">Minutes</div></div>';
      html += '<div class="countdown-separator">:</div>';
      html += '<div class="countdown-unit"><div class="countdown-number" id="sm-seconds">00</div><div class="countdown-label">Seconds</div></div>';
      html += '</div>';

      html += '<div class="sm-target-label">Freedom &mdash; May 21, 2029</div>';

      if (activeProject) {
        html += '<div class="sm-project-highlight">';
        html += '<div class="sm-project-label">Current Mission</div>';
        html += '<div class="sm-project-name">' + _escape(activeProject.name) + '</div>';
        if (activeProject.hypothesis) {
          html += '<div class="sm-project-hypothesis">' + _escape(activeProject.hypothesis) + '</div>';
        }
        html += '</div>';
      }

      html += '<div class="sm-quote"><div class="sm-quote-text">"' + _escape(firstQuote.text) + '"</div><div class="sm-quote-author">\u2014 ' + _escape(firstQuote.author) + '</div></div>';

      html += '</div>';

      html += '<div class="sm-bottom-bar">';
      html += '<div class="sm-controls">';
      html += '<button class="sm-btn sm-btn-record" data-action="toggle-recording" aria-label="Toggle recording mode">Record</button>';
      html += '<button class="sm-btn sm-btn-exit" data-action="exit-stage" aria-label="Exit stage mode"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg> Exit</button>';
      html += '</div>';
      html += '</div>';

      html += '</div>';
      html += '</div>';

      return html;
    },

    onMount: function(container) {
      document.body.classList.add('stage-mode-active');

      _updateCountdown(container);
      var countdownInterval = setInterval(function() {
        _updateCountdown(container);
      }, 1000);
      _intervals.push(countdownInterval);

      var quotes = _getQuotes();
      if (quotes.length > 1) {
        var quoteInterval = setInterval(function() {
          _rotateQuotes(container);
        }, 8000);
        _intervals.push(quoteInterval);
      }

      var recordBtn = container.querySelector('[data-action="toggle-recording"]');
      if (recordBtn) {
        _addListener(recordBtn, 'click', function() {
          _toggleRecording(container);
        });
      }

      var exitBtn = container.querySelector('[data-action="exit-stage"]');
      if (exitBtn) {
        _addListener(exitBtn, 'click', function() {
          FreedomOS.navigate('dashboard');
        });
      }

      _addListener(document, 'keydown', _handleKeydown);

      var countdownContainer = container.querySelector('.countdown-container');
      if (countdownContainer) {
        var enterTimeout = setTimeout(function() {
          countdownContainer.classList.remove('sm-countdown-enter');
        }, 500);
        _timeouts.push(enterTimeout);
      }

      var wrapper = container.querySelector('.sm-wrapper');
      if (wrapper) {
        wrapper.classList.add('sm-enter');
        var enterTimeout = setTimeout(function() {
          wrapper.classList.remove('sm-enter');
        }, 600);
        _timeouts.push(enterTimeout);
      }
    },

    onUnmount: function(container) {
      _clearListeners();
      _clearIntervals();
      _clearTimeouts();
      _isRecording = false;
      _quoteIndex = 0;
      _winIndex = 0;

      document.body.classList.remove('stage-mode-active');

      var brackets = document.querySelectorAll('.sm-recording-bracket');
      brackets.forEach(function(el) { el.remove(); });
    }
  });
})();