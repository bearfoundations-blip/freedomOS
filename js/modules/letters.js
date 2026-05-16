// ============================================================
// Freedom OS — Letters
// File: js/modules/letters.js
// Depends: kernel/core.js, kernel/ui.js, kernel/utils.js, kernel/events.js
// Provides: letters module (route: letters)
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
  name: 'letters',
  routes: ['letters'],
  requires: [],

  _draftKey: 'freedomos_letters_draft',
  _listeners: [],
  _intervals: [],
  _draftTimer: null,
  _saveIndicator: null,

  init: function() {
    // One-time setup
  },

  render: function(params) {
    const letters = FreedomOS.get('letters') || [];
    const now = new Date();
    const draft = this._loadDraft();

    let listHtml = '';
    if (letters.length === 0) {
      listHtml = this._renderEmptyState();
    } else {
      const sorted = [...letters].sort((a, b) => new Date(a.unlockDate) - new Date(b.unlockDate));
      listHtml = `<div class="letters-list">` + sorted.map((letter, idx) => this._renderLetterCard(letter, now, idx)).join('') + `</div>`;
    }

    return `
      <div class="view-letters">
        <div class="view-header">
          <h1 class="view-title">Letters to Future Self</h1>
          <p class="view-subtitle">Write messages that unlock when the time is right</p>
        </div>

        <div class="letters-compose card">
          <div class="card-header">
            <h2 class="card-title">Compose Letter</h2>
            <span class="save-indicator" id="letters-save-indicator"></span>
          </div>
          <div class="compose-form">
            <div class="form-group">
              <label class="form-label">Title</label>
              <input type="text" id="letter-title" class="form-input form-input--borderless" placeholder="e.g., Dear Future Me..." value="${FreedomOS.escapeHtml(draft.title || '')}" maxlength="100">
            </div>
            <div class="form-group">
              <label class="form-label">Content</label>
              <textarea id="letter-content" class="form-textarea form-input--borderless" placeholder="Write your thoughts, goals, predictions, or reminders..." rows="6" maxlength="5000">${FreedomOS.escapeHtml(draft.content || '')}</textarea>
              <div class="char-count"><span id="letter-char-count">${(draft.content || '').length}</span> / 5000</div>
            </div>
            <div class="form-group">
              <label class="form-label">Unlock Date</label>
              <input type="date" id="letter-unlock-date" class="form-input" value="${draft.unlockDate || ''}">
            </div>
            <div class="form-actions">
              <button id="btn-save-letter" class="btn btn-primary">Seal Letter</button>
              <button id="btn-clear-draft" class="btn btn-secondary">Clear Draft</button>
            </div>
          </div>
        </div>

        <div class="letters-section">
          <h2 class="section-title">Your Letters</h2>
          ${listHtml}
        </div>
      </div>
    `;
  },

  onMount: function(container) {
    const self = this;
    const titleInput = container.querySelector('#letter-title');
    const contentInput = container.querySelector('#letter-content');
    const dateInput = container.querySelector('#letter-unlock-date');
    const charCount = container.querySelector('#letter-char-count');
    const saveIndicator = container.querySelector('#letters-save-indicator');
    self._saveIndicator = saveIndicator;

    // Character count with color thresholds
    const updateCharCount = function() {
      const len = (contentInput.value || '').length;
      if (charCount) {
        charCount.textContent = len;
        if (len >= 5000) {
          charCount.style.color = 'var(--color-danger)';
        } else if (len >= 4500) {
          charCount.style.color = 'var(--color-warning)';
        } else {
          charCount.style.color = '';
        }
      }
    };
    contentInput.addEventListener('input', updateCharCount);
    self._listeners.push({ el: contentInput, type: 'input', fn: updateCharCount });

    // Auto-save draft
    const autoSaveDraft = function() {
      self._saveDraft({
        title: titleInput.value,
        content: contentInput.value,
        unlockDate: dateInput.value
      });
      if (saveIndicator) {
        saveIndicator.textContent = 'Saved';
        saveIndicator.classList.add('saved');
        setTimeout(function() {
          saveIndicator.textContent = '';
          saveIndicator.classList.remove('saved');
        }, 2000);
      }
    };

    const onInputAutoSave = function() {
      if (saveIndicator) {
        saveIndicator.textContent = 'Saving...';
        saveIndicator.classList.remove('saved');
      }
      if (self._draftTimer) clearTimeout(self._draftTimer);
      self._draftTimer = setTimeout(autoSaveDraft, 1000);
    };

    [titleInput, contentInput, dateInput].forEach(function(el) {
      el.addEventListener('input', onInputAutoSave);
      self._listeners.push({ el: el, type: 'input', fn: onInputAutoSave });
    });

    // Save letter with seal animation
    const btnSave = container.querySelector('#btn-save-letter');
    const doSave = function() {
      const newLetter = {
        id: FreedomOS.generateId(),
        title: titleInput.value.trim(),
        content: contentInput.value.trim(),
        unlockDate: dateInput.value,
        createdAt: new Date().toISOString(),
        isUnlocked: false
      };

      const letters = FreedomOS.get('letters') || [];
      letters.push(newLetter);
      FreedomOS.mutate('letters', letters);

      // Clear draft
      self._clearDraft();
      titleInput.value = '';
      contentInput.value = '';
      dateInput.value = '';
      if (charCount) {
        charCount.textContent = '0';
        charCount.style.color = '';
      }

      FreedomOS.toast('Letter sealed for the future', 'success', 3000);
      FreedomOS.emit('letters:added', newLetter);
      FreedomOS.navigate('letters');
    };

    const onSave = function() {
      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      const unlockDate = dateInput.value;

      if (!title) {
        FreedomOS.toast('Please enter a title', 'error', 3000);
        titleInput.focus();
        return;
      }
      if (!content) {
        FreedomOS.toast('Please write some content', 'error', 3000);
        contentInput.focus();
        return;
      }
      if (!unlockDate) {
        FreedomOS.toast('Please select an unlock date', 'error', 3000);
        dateInput.focus();
        return;
      }
      if (new Date(unlockDate) <= new Date()) {
        FreedomOS.toast('Unlock date must be in the future', 'error', 3000);
        dateInput.focus();
        return;
      }

      // Seal animation
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:9999;opacity:0;transition:opacity 0.3s ease;';
      overlay.innerHTML = '<div class="seal-lock" style="color:var(--color-primary);transform:scale(0.5);transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        overlay.querySelector('.seal-lock').style.transform = 'scale(1.3)';
      });
      setTimeout(function() {
        overlay.style.opacity = '0';
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          doSave();
        }, 300);
      }, 600);
    };
    btnSave.addEventListener('click', onSave);
    self._listeners.push({ el: btnSave, type: 'click', fn: onSave });

    // Clear draft
    const btnClear = container.querySelector('#btn-clear-draft');
    const onClear = function() {
      FreedomOS.confirm('Clear your draft?', function() {
        self._clearDraft();
        titleInput.value = '';
        contentInput.value = '';
        dateInput.value = '';
        if (charCount) {
          charCount.textContent = '0';
          charCount.style.color = '';
        }
        if (saveIndicator) saveIndicator.textContent = '';
      });
    };
    btnClear.addEventListener('click', onClear);
    self._listeners.push({ el: btnClear, type: 'click', fn: onClear });

    // Delete letter handlers
    const deleteBtns = container.querySelectorAll('.btn-delete-letter');
    deleteBtns.forEach(function(btn) {
      const onDelete = function() {
        const id = btn.dataset.id;
        const letter = (FreedomOS.get('letters') || []).find(function(l) { return l.id === id; });
        if (!letter) return;
        const isUnlocked = new Date(letter.unlockDate) <= new Date();
        const msg = isUnlocked ? 'This letter is unlocked. Are you sure you want to delete it?' : 'Delete this sealed letter?';
        FreedomOS.confirm(msg, function() {
          const letters = (FreedomOS.get('letters') || []).filter(function(l) { return l.id !== id; });
          FreedomOS.mutate('letters', letters);
          FreedomOS.toast('Letter deleted', 'info', 2000);
          FreedomOS.navigate('letters');
        });
      };
      btn.addEventListener('click', onDelete);
      self._listeners.push({ el: btn, type: 'click', fn: onDelete });
    });

    // Countdown update interval
    const updateCountdowns = function() {
      const now = new Date();
      const counters = container.querySelectorAll('.countdown-timer');
      counters.forEach(function(el) {
        const unlock = new Date(el.dataset.unlock);
        const diff = unlock - now;
        if (diff <= 0) {
          el.textContent = 'Unlocked!';
          el.classList.add('unlocked');
          const card = el.closest('.letter-card');
          if (card) {
            card.classList.remove('locked');
            card.classList.add('unlocked');
          }
        } else {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          el.textContent = days + 'd ' + hours + 'h ' + mins + 'm';
        }
      });
    };
    updateCountdowns();
    const countdownInterval = setInterval(updateCountdowns, 60000);
    self._intervals.push(countdownInterval);
  },

  onUnmount: function(container) {
    // Clean up listeners
    this._listeners.forEach(function(item) {
      item.el.removeEventListener(item.type, item.fn);
    });
    this._listeners = [];

    // Clear intervals
    this._intervals.forEach(function(id) { clearInterval(id); });
    this._intervals = [];

    if (this._draftTimer) {
      clearTimeout(this._draftTimer);
      this._draftTimer = null;
    }
  },

  _renderLetterCard: function(letter, now, index) {
    const unlockDate = new Date(letter.unlockDate);
    const isUnlocked = unlockDate <= now;
    const created = new Date(letter.createdAt);
    const delay = index * 50;

    if (isUnlocked) {
      return `
        <div class="letter-card unlocked" style="animation-delay:${delay}ms">
          <div class="letter-header">
            <div class="letter-meta">
              <h3 class="letter-title">${FreedomOS.escapeHtml(letter.title)}</h3>
              <span class="letter-status unlocked">Unlocked</span>
            </div>
            <div class="letter-actions">
              <button class="btn btn-icon btn-delete-letter" data-id="${letter.id}" aria-label="Delete letter">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
          <div class="letter-content">
            <p>${FreedomOS.escapeHtml(letter.content).replace(/\n/g, '<br>')}</p>
          </div>
          <div class="letter-footer">
            <span class="letter-date">Created ${created.toLocaleDateString()}</span>
            <span class="letter-date">Unlocked ${unlockDate.toLocaleDateString()}</span>
          </div>
        </div>
      `;
    } else {
      const diff = unlockDate - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `
        <div class="letter-card locked" style="animation-delay:${delay}ms">
          <div class="letter-header">
            <div class="letter-meta">
              <h3 class="letter-title">${FreedomOS.escapeHtml(letter.title)}</h3>
              <span class="letter-status locked">Locked</span>
            </div>
            <div class="letter-actions">
              <button class="btn btn-icon btn-delete-letter" data-id="${letter.id}" aria-label="Delete letter">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
          <div class="letter-locked-body">
            <div class="lock-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <p class="locked-text">This letter is sealed until <strong>${unlockDate.toLocaleDateString()}</strong></p>
            <div class="countdown-timer" data-unlock="${letter.unlockDate}">${days}d ${hours}h ${mins}m</div>
          </div>
          <div class="letter-footer">
            <span class="letter-date">Created ${created.toLocaleDateString()}</span>
          </div>
        </div>
      `;
    }
  },

  _renderEmptyState: function() {
    return `
      <div class="empty-state">
        <div class="empty-icon pulse">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
        </div>
        <h3 class="empty-title">No letters yet</h3>
        <p class="empty-text">Write a letter to your future self. It will stay locked until the date you choose.</p>
        <div class="example-letter card">
          <div class="example-header">
            <span class="example-tag">Example</span>
            <span class="example-date">Unlocks in 90 days</span>
          </div>
          <h4 class="example-title">Dear Future Me</h4>
          <p class="example-body">Remember why you started. The late nights, the doubts, the small wins — they all compound. Trust the process.</p>
        </div>
      </div>
    `;
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