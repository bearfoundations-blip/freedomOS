// ============================================================
// Freedom OS — Reviews
// File: js/modules/reviews.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js
// Provides: reviews module (route: reviews)
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
  name: 'reviews',
  routes: ['reviews'],
  requires: [],

  _draftKey: 'freedomos_reviews_draft',
  _listeners: [],
  _intervals: [],
  _autoSaveTimer: null,
  _beforeUnloadFn: null,
  _hasChanges: false,

  init: function() {
    // One-time setup
  },

  render: function(params) {
    const reviews = FreedomOS.get('reviews') || [];
    const wins = FreedomOS.get('wins') || [];
    const draft = this._loadDraft();
    const now = new Date();
    const weekStart = this._getWeekStart(now);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const existingReview = reviews.find(function(r) {
      return r.weekStart === weekStartStr;
    });

    const winCount = wins.filter(function(w) {
      const wd = new Date(w.date);
      return wd >= weekStart && wd <= now;
    }).length;

    const formData = existingReview ? existingReview : (draft.weekStart === weekStartStr ? draft : {});

    // Calculate streak
    const streak = this._calculateStreak(reviews);

    // Previous reviews (sorted desc)
    const prevReviews = [...reviews].sort(function(a, b) {
      return new Date(b.weekStart) - new Date(a.weekStart);
    });

    let prevHtml = '';
    if (prevReviews.length === 0) {
      prevHtml = `<div class="empty-state small">
        <div class="empty-icon" style="opacity:0.2;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
        </div>
        <p class="empty-text">Start your first weekly review.</p>
      </div>`;
    } else {
      prevHtml = `<div class="reviews-accordion">` + prevReviews.map(function(r, idx) {
        const rDate = new Date(r.weekStart);
        const rEnd = new Date(rDate);
        rEnd.setDate(rEnd.getDate() + 6);
        return `
          <div class="accordion-item" style="animation-delay:${idx * 50}ms">
            <button class="accordion-header" aria-expanded="false">
              <span class="accordion-week">Week of ${rDate.toLocaleDateString()}</span>
              <span class="accordion-score">Score: ${r.operatorScore}/10</span>
              <span class="accordion-chevron">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </span>
            </button>
            <div class="accordion-body hidden">
              <div class="review-detail-grid">
                <div class="review-detail">
                  <h4>What Worked</h4>
                  <p>${FreedomOS.escapeHtml(r.wins || '').replace(/\n/g, '<br>')}</p>
                </div>
                <div class="review-detail">
                  <h4>What Flopped</h4>
                  <p>${FreedomOS.escapeHtml(r.flops || '').replace(/\n/g, '<br>')}</p>
                </div>
                <div class="review-detail">
                  <h4>Next Week Focus</h4>
                  <p>${FreedomOS.escapeHtml(r.focus || '').replace(/\n/g, '<br>')}</p>
                </div>
                <div class="review-detail">
                  <h4>Metrics</h4>
                  <p>Operator Score: <strong>${r.operatorScore}/10</strong></p>
                  <p>Wins This Week: <strong>${r.winCount !== undefined ? r.winCount : '—'}</strong></p>
                </div>
              </div>
              <div class="review-actions">
                <button class="btn btn-secondary btn-export-review" data-id="${r.id}">Export as Markdown</button>
              </div>
            </div>
          </div>
        `;
      }).join('') + `</div>`;
    }

    // Weekly summary card
    const totalReviews = reviews.length;
    const avgScore = totalReviews > 0 ? (reviews.reduce(function(s, r) { return s + (r.operatorScore || 0); }, 0) / totalReviews).toFixed(1) : '—';

    return `
      <div class="view-reviews">
        <div class="view-header">
          <h1 class="view-title">Weekly Operator Review</h1>
          <p class="view-subtitle">Reflect. Learn. Iterate. Every Monday matters.</p>
        </div>

        <div class="reviews-summary-bar">
          <div class="summary-card">
            <span class="summary-value summary-value--mono">${streak}</span>
            <span class="summary-label summary-label--uppercase">Week Streak</span>
          </div>
          <div class="summary-card">
            <span class="summary-value summary-value--mono">${totalReviews}</span>
            <span class="summary-label summary-label--uppercase">Total Reviews</span>
          </div>
          <div class="summary-card">
            <span class="summary-value summary-value--mono">${avgScore}</span>
            <span class="summary-label summary-label--uppercase">Avg Score</span>
          </div>
          <div class="summary-card">
            <span class="summary-value summary-value--mono">${winCount}</span>
            <span class="summary-label summary-label--uppercase">Wins This Week</span>
          </div>
        </div>

        <div class="reviews-compose card">
          <div class="card-header">
            <h2 class="card-title">Week of ${weekStart.toLocaleDateString()} — ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString()}</h2>
            <span class="save-indicator" id="reviews-save-indicator">${existingReview ? 'Saved' : 'Draft'}</span>
          </div>
          <div class="compose-form">
            <input type="hidden" id="review-week-start" value="${weekStartStr}">
            <div class="form-group">
              <label class="form-label">What Worked</label>
              <textarea id="review-wins" class="form-textarea" placeholder="What went well this week? What experiments succeeded?" rows="4">${FreedomOS.escapeHtml(formData.wins || '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">What Flopped</label>
              <textarea id="review-flops" class="form-textarea" placeholder="What failed? What assumptions were wrong? Be honest." rows="4">${FreedomOS.escapeHtml(formData.flops || '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Next Week's Focus</label>
              <textarea id="review-focus" class="form-textarea" placeholder="What is the one thing that will move the needle next week?" rows="3">${FreedomOS.escapeHtml(formData.focus || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group half">
                <label class="form-label">Operator Score (1–10)</label>
                <div class="slider-group">
                  <input type="range" id="review-score" class="form-slider" min="1" max="10" step="1" value="${formData.operatorScore || 5}">
                  <span class="slider-value" id="slider-value-display">${formData.operatorScore || 5}</span>
                </div>
              </div>
              <div class="form-group half">
                <label class="form-label">Wins This Week</label>
                <input type="number" id="review-win-count" class="form-input" value="${winCount}" min="0" readonly>
              </div>
            </div>
            <div class="form-actions">
              <button id="btn-save-review" class="btn btn-primary">${existingReview ? 'Update Review' : 'Save Review'}</button>
            </div>
          </div>
        </div>

        <div class="reviews-section">
          <h2 class="section-title">Previous Reviews</h2>
          ${prevHtml}
        </div>
      </div>
    `;
  },

  onMount: function(container) {
    const self = this;
    const winsInput = container.querySelector('#review-wins');
    const flopsInput = container.querySelector('#review-flops');
    const focusInput = container.querySelector('#review-focus');
    const scoreInput = container.querySelector('#review-score');
    const scoreDisplay = container.querySelector('#slider-value-display');
    const weekStartInput = container.querySelector('#review-week-start');
    const saveIndicator = container.querySelector('#reviews-save-indicator');

    self._hasChanges = false;

    // Slider display
    const onScoreChange = function() {
      if (scoreDisplay) scoreDisplay.textContent = scoreInput.value;
      self._hasChanges = true;
    };
    scoreInput.addEventListener('input', onScoreChange);
    self._listeners.push({ el: scoreInput, type: 'input', fn: onScoreChange });

    // Track changes on textareas
    const markChanged = function() { self._hasChanges = true; };
    [winsInput, flopsInput, focusInput].forEach(function(el) {
      el.addEventListener('input', markChanged);
      self._listeners.push({ el: el, type: 'input', fn: markChanged });
    });

    // Debounced auto-save indicator (600ms) on textarea input
    const runAutoSave = function() {
      self._saveDraft({
        weekStart: weekStartInput.value,
        wins: winsInput.value,
        flops: flopsInput.value,
        focus: focusInput.value,
        operatorScore: parseInt(scoreInput.value, 10),
        winCount: parseInt(container.querySelector('#review-win-count').value || '0', 10)
      });
      if (saveIndicator) {
        saveIndicator.textContent = 'Saved';
        saveIndicator.classList.remove('save-indicator--saving');
        saveIndicator.classList.add('saved');
        setTimeout(function() {
          if (saveIndicator && saveIndicator.textContent === 'Saved') {
            saveIndicator.textContent = 'Draft';
            saveIndicator.classList.remove('saved');
          }
        }, 2000);
      }
      self._hasChanges = false;
    };

    const debouncedAutoSave = function() {
      self._hasChanges = true;
      if (saveIndicator) {
        saveIndicator.textContent = 'Saving...';
        saveIndicator.classList.add('save-indicator--saving');
        saveIndicator.classList.remove('saved');
      }
      if (self._autoSaveTimer) clearTimeout(self._autoSaveTimer);
      self._autoSaveTimer = setTimeout(runAutoSave, 600);
    };

    [winsInput, flopsInput, focusInput].forEach(function(el) {
      el.addEventListener('input', debouncedAutoSave);
      self._listeners.push({ el: el, type: 'input', fn: debouncedAutoSave });
    });

    // beforeunload handler
    self._beforeUnloadFn = function(e) {
      if (self._hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', self._beforeUnloadFn);

    // Save review
    const btnSave = container.querySelector('#btn-save-review');
    const onSave = function() {
      const weekStart = weekStartInput.value;
      const wins = winsInput.value.trim();
      const flops = flopsInput.value.trim();
      const focus = focusInput.value.trim();
      const score = parseInt(scoreInput.value, 10);
      const winCount = parseInt(container.querySelector('#review-win-count').value || '0', 10);

      if (!wins && !flops && !focus) {
        FreedomOS.toast('Please fill in at least one field', 'error', 3000);
        return;
      }

      const reviews = FreedomOS.get('reviews') || [];
      const existingIdx = reviews.findIndex(function(r) { return r.weekStart === weekStart; });

      const review = {
        id: existingIdx >= 0 ? reviews[existingIdx].id : FreedomOS.generateId(),
        weekStart: weekStart,
        wins: wins,
        flops: flops,
        focus: focus,
        operatorScore: score,
        winCount: winCount,
        createdAt: existingIdx >= 0 ? reviews[existingIdx].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        reviews[existingIdx] = review;
      } else {
        reviews.push(review);
      }

      FreedomOS.mutate('reviews', reviews);
      self._clearDraft();
      self._hasChanges = false;

      FreedomOS.toast('Review saved', 'success', 3000);
      FreedomOS.emit('reviews:saved', review);
      FreedomOS.navigate('reviews');
    };
    btnSave.addEventListener('click', onSave);
    self._listeners.push({ el: btnSave, type: 'click', fn: onSave });

    // Accordion toggle
    const accordionHeaders = container.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(function(header) {
      const onToggle = function() {
        const body = header.nextElementSibling;
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', !expanded);
        if (expanded) {
          body.classList.add('hidden');
        } else {
          body.classList.remove('hidden');
        }
      };
      header.addEventListener('click', onToggle);
      self._listeners.push({ el: header, type: 'click', fn: onToggle });
    });

    // Export markdown
    const exportBtns = container.querySelectorAll('.btn-export-review');
    exportBtns.forEach(function(btn) {
      const onExport = function() {
        const id = btn.dataset.id;
        const reviews = FreedomOS.get('reviews') || [];
        const r = reviews.find(function(x) { return x.id === id; });
        if (!r) return;
        const md = self._toMarkdown(r);
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'review-' + r.weekStart + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        FreedomOS.toast('Review exported', 'success', 2000);
      };
      btn.addEventListener('click', onExport);
      self._listeners.push({ el: btn, type: 'click', fn: onExport });
    });
  },

  onUnmount: function(container) {
    // Save any pending draft
    const weekStartInput = container.querySelector('#review-week-start');
    const winsInput = container.querySelector('#review-wins');
    const flopsInput = container.querySelector('#review-flops');
    const focusInput = container.querySelector('#review-focus');
    const scoreInput = container.querySelector('#review-score');
    if (weekStartInput && this._hasChanges) {
      this._saveDraft({
        weekStart: weekStartInput.value,
        wins: winsInput ? winsInput.value : '',
        flops: flopsInput ? flopsInput.value : '',
        focus: focusInput ? focusInput.value : '',
        operatorScore: scoreInput ? parseInt(scoreInput.value, 10) : 5,
        winCount: parseInt(container.querySelector('#review-win-count').value || '0', 10)
      });
    }

    // Clean up listeners
    this._listeners.forEach(function(item) {
      item.el.removeEventListener(item.type, item.fn);
    });
    this._listeners = [];

    // Clear intervals
    this._intervals.forEach(function(id) { clearInterval(id); });
    this._intervals = [];

    if (this._autoSaveTimer) {
      clearTimeout(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }

    if (this._beforeUnloadFn) {
      window.removeEventListener('beforeunload', this._beforeUnloadFn);
      this._beforeUnloadFn = null;
    }
  },

  _getWeekStart: function(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  },

  _calculateStreak: function(reviews) {
    if (reviews.length === 0) return 0;
    const sorted = [...reviews].sort(function(a, b) {
      return new Date(b.weekStart) - new Date(a.weekStart);
    });
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].weekStart);
      const curr = new Date(sorted[i].weekStart);
      const diffDays = (prev - curr) / (1000 * 60 * 60 * 24);
      if (diffDays >= 6 && diffDays <= 8) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  },

  _toMarkdown: function(r) {
    return '# Weekly Operator Review\n\n' +
      '**Week:** ' + r.weekStart + '\n\n' +
      '**Operator Score:** ' + r.operatorScore + '/10\n\n' +
      '**Wins This Week:** ' + (r.winCount !== undefined ? r.winCount : '—') + '\n\n' +
      '## What Worked\n\n' + (r.wins || '—') + '\n\n' +
      '## What Flopped\n\n' + (r.flops || '—') + '\n\n' +
      '## Next Week\'s Focus\n\n' + (r.focus || '—') + '\n';
  },

  _loadDraft: function() {
    try {
      const raw = localStorage.getItem(this._draftKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  _saveDraft: function(draft) {
    try {
      localStorage.setItem(this._draftKey, JSON.stringify(draft));
    } catch (e) {}
  },

  _clearDraft: function() {
    try {
      localStorage.removeItem(this._draftKey);
    } catch (e) {}
  }
});