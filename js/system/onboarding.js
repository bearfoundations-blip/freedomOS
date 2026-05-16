// ============================================================
// Freedom OS — Onboarding System
// File: js/system/onboarding.js
// Depends: kernel/core.js, kernel/ui.js, kernel/events.js, kernel/utils.js
// Provides: First-time user flow with step-by-step wizard, progress tracking,
//           skip option, and re-trigger capability.
// Last Updated: 2026-04-28
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

  // --- Constants ---
  const MODULE_NAME = 'onboarding';
  const ONBOARDING_COMPLETE_KEY = 'freedom_os_onboarding_complete';
  const TOTAL_STEPS = 6;

  // --- Module State ---
  let _container = null;
  let _listeners = [];
  let _currentStep = 1;
  let _overlayEl = null;

  // --- Helper: Attach event listener and track for cleanup ---
  function _on(element, event, handler, options) {
    element.addEventListener(event, handler, options);
    _listeners.push({ element, event, handler, options });
  }

  // --- Helper: Remove all tracked listeners ---
  function _removeListeners() {
    _listeners.forEach(function(item) {
      item.element.removeEventListener(item.event, item.handler, item.options);
    });
    _listeners = [];
  }

  // --- Helper: Check if onboarding is complete ---
  function _isOnboardingComplete() {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
  }

  // --- Helper: Mark onboarding complete ---
  function _markComplete() {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  }

  // --- Helper: Reset onboarding (for re-trigger) ---
  function _resetOnboarding() {
    localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    _currentStep = 1;
  }

  // --- Helper: Get step content ---
  function _getStepContent(step) {
    switch (step) {
      case 1:
        return {
          title: 'Welcome to Freedom OS',
          subtitle: 'Your personal operating system for building in public.',
          body: '<p>Freedom OS helps solo entrepreneurs and creators track experiments, content, finances, and progress toward financial freedom.</p>' +
                '<p>Over the next few steps, we\'ll set up your workspace.</p>',
          icon: '🚀'
        };
      case 2:
        return {
          title: 'Set Your Target Date',
          subtitle: 'When do you want to achieve freedom?',
          body: '<div class="form-group">' +
                '<label>Target Date</label>' +
                '<input type="date" id="onboarding-target-date" value="2029-04-20" class="input">' +
                '<p class="hint">This is your North Star. All planning works backward from this date.</p>' +
                '</div>',
          icon: '🎯'
        };
      case 3:
        return {
          title: 'Add Your First Project',
          subtitle: 'What experiment are you running?',
          body: '<div class="form-group">' +
                '<label>Project Name</label>' +
                '<input type="text" id="onboarding-project-name" placeholder="e.g., AI Automation Agency" class="input">' +
                '</div>' +
                '<div class="form-group">' +
                '<label>Business Model</label>' +
                '<select id="onboarding-project-model" class="input">' +
                '<option value="AI Automation">AI Automation</option>' +
                '<option value="Dropshipping">Dropshipping</option>' +
                '<option value="SaaS">SaaS</option>' +
                '<option value="Content">Content</option>' +
                '<option value="Agency">Agency</option>' +
                '<option value="E-commerce">E-commerce</option>' +
                '<option value="Info Product">Info Product</option>' +
                '<option value="Other">Other</option>' +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label>Hypothesis</label>' +
                '<input type="text" id="onboarding-project-hypothesis" placeholder="What do you believe will happen?" class="input">' +
                '</div>',
          icon: '⚗️'
        };
      case 4:
        return {
          title: 'Set Your First Habit',
          subtitle: 'What daily action moves the needle?',
          body: '<div class="form-group">' +
                '<label>Habit Name</label>' +
                '<input type="text" id="onboarding-habit-name" placeholder="e.g., Publish one piece of content" class="input">' +
                '</div>' +
                '<div class="form-group">' +
                '<label>Category</label>' +
                '<select id="onboarding-habit-category" class="input">' +
                '<option value="creation">Creation</option>' +
                '<option value="health">Health</option>' +
                '<option value="learning">Learning</option>' +
                '<option value="networking">Networking</option>' +
                '<option value="other">Other</option>' +
                '</select>' +
                '</div>',
          icon: '🔥'
        };
      case 5:
        return {
          title: 'Write to Your Future Self',
          subtitle: 'A letter unlocked on your target date.',
          body: '<div class="form-group">' +
                '<label>Letter Title</label>' +
                '<input type="text" id="onboarding-letter-title" placeholder="Dear Future Me" class="input">' +
                '</div>' +
                '<div class="form-group">' +
                '<label>Message</label>' +
                '<textarea id="onboarding-letter-content" rows="4" placeholder="What do you want to remember? What are you striving for?" class="input"></textarea>' +
                '</div>',
          icon: '✉️'
        };
      case 6:
        return {
          title: 'You\'re Ready',
          subtitle: 'Enter Freedom OS.',
          body: '<p>Your workspace is set up. Remember:</p>' +
                '<ul class="onboarding-list">' +
                '<li>Track every experiment with a kill date</li>' +
                '<li>Build in public — content is currency</li>' +
                '<li>Review weekly, iterate fast</li>' +
                '<li>Your target date is your compass</li>' +
                '</ul>' +
                '<p class="enter-text">Press Enter or click below to begin.</p>',
          icon: '🎉'
        };
      default:
        return { title: '', subtitle: '', body: '', icon: '' };
    }
  }

  // --- Helper: Save step data ---
  function _saveStepData(step) {
    switch (step) {
      case 2:
        const dateInput = _container.querySelector('#onboarding-target-date');
        if (dateInput && dateInput.value) {
          FreedomOS.mutate('profile.targetDate', dateInput.value);
        }
        break;
      case 3:
        const projName = _container.querySelector('#onboarding-project-name');
        const projModel = _container.querySelector('#onboarding-project-model');
        const projHypo = _container.querySelector('#onboarding-project-hypothesis');
        if (projName && projName.value.trim()) {
          const project = {
            id: FreedomOS.generateId(),
            name: projName.value.trim(),
            model: projModel ? projModel.value : 'Other',
            hypothesis: projHypo ? projHypo.value.trim() : '',
            killDate: '',
            status: 'active',
            finances: { revenue: 0, costs: 0, monthly: [] },
            milestones: [],
            contentPieces: [],
            files: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          const projects = FreedomOS.get('projects') || [];
          projects.push(project);
          FreedomOS.mutate('projects', projects);
        }
        break;
      case 4:
        const habitName = _container.querySelector('#onboarding-habit-name');
        const habitCat = _container.querySelector('#onboarding-habit-category');
        if (habitName && habitName.value.trim()) {
          const habit = {
            id: FreedomOS.generateId(),
            name: habitName.value.trim(),
            streak: 0,
            lastCompleted: null,
            category: habitCat ? habitCat.value : 'other'
          };
          const habits = FreedomOS.get('dashboard.habits') || [];
          habits.push(habit);
          FreedomOS.mutate('dashboard.habits', habits);
        }
        break;
      case 5:
        const letterTitle = _container.querySelector('#onboarding-letter-title');
        const letterContent = _container.querySelector('#onboarding-letter-content');
        if (letterContent && letterContent.value.trim()) {
          const letter = {
            id: FreedomOS.generateId(),
            title: letterTitle && letterTitle.value.trim() ? letterTitle.value.trim() : 'Letter to Future Self',
            content: letterContent.value.trim(),
            unlockDate: FreedomOS.get('profile.targetDate') || '2029-04-20',
            createdAt: new Date().toISOString(),
            isUnlocked: false
          };
          const letters = FreedomOS.get('letters') || [];
          letters.push(letter);
          FreedomOS.mutate('letters', letters);
        }
        break;
    }
  }

  // --- Helper: Render progress indicator ---
  function _renderProgress() {
    let html = '<div class="onboarding-progress" style="display: flex; align-items: center; justify-content: center; gap: var(--space-sm); margin-bottom: var(--space-xl);">';
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const isActive = i === _currentStep;
      const isCompleted = i < _currentStep;
      html += '<div class="progress-step ' + (isActive ? 'active' : '') + (isCompleted ? 'completed' : '') + '" style="display: flex; flex-direction: column; align-items: center; gap: var(--space-xs);">';
      html += '<div class="step-number" style="' +
        'width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; ' +
        'font-size: 0.8rem; font-weight: 600; transition: all var(--transition-fast); ' +
        (isActive ? 'background: var(--color-primary); color: var(--color-text-inverse); box-shadow: 0 0 12px var(--color-primary-glow);' :
         isCompleted ? 'background: var(--color-success); color: var(--color-text-inverse);' :
         'background: var(--color-surface-elevated); color: var(--color-text-muted); border: 1px solid var(--color-border);') +
        '">' + (isCompleted ? '✓' : i) + '</div>';
      html += '</div>';
      if (i < TOTAL_STEPS) {
        html += '<div class="progress-connector ' + (isCompleted ? 'completed' : '') + '" style="' +
          'width: 24px; height: 2px; border-radius: 1px; transition: all var(--transition-fast); ' +
          (isCompleted ? 'background: var(--color-success);' : 'background: var(--color-border);') +
          '"></div>';
      }
    }
    html += '</div>';
    return html;
  }

  // --- Helper: Render step content ---
  function _renderStep() {
    const content = _getStepContent(_currentStep);
    let html = '<div class="onboarding-step" data-step="' + _currentStep + '" style="animation: onboardingStepIn 350ms ease both;">';
    html += '<div class="step-icon" style="font-size: 3rem; text-align: center; margin-bottom: var(--space-md); animation: onboardingStepIn 350ms 50ms ease both;">' + content.icon + '</div>';
    html += '<h2 class="step-title" style="animation: onboardingStepIn 350ms 100ms ease both;">' + FreedomOS.escapeHtml(content.title) + '</h2>';
    html += '<p class="step-subtitle" style="animation: onboardingStepIn 350ms 150ms ease both;">' + FreedomOS.escapeHtml(content.subtitle) + '</p>';
    html += '<div class="step-body" style="animation: onboardingStepIn 350ms 200ms ease both;">' + content.body + '</div>';
    html += '</div>';
    return html;
  }

  // --- Helper: Render navigation buttons ---
  function _renderNav() {
    let html = '<div class="onboarding-nav" style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-xl); gap: var(--space-md);">';
    if (_currentStep > 1) {
      html += '<button class="btn btn-secondary" id="onboarding-prev" style="padding: var(--space-md) var(--space-lg); background: var(--color-surface-elevated); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: 500; cursor: pointer; transition: all var(--transition-fast);">Back</button>';
    } else {
      html += '<span></span>';
    }
    html += '<button class="btn btn-primary" id="onboarding-next" style="padding: var(--space-md) var(--space-xl); background: var(--color-primary); color: var(--color-text-inverse); border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: 600; cursor: pointer; transition: all var(--transition-fast); box-shadow: 0 0 20px rgba(0,0,0,0.2);">' + (_currentStep === TOTAL_STEPS ? 'Enter Freedom OS' : 'Next') + '</button>';
    html += '</div>';
    html += '<div class="onboarding-skip" style="text-align: center; margin-top: var(--space-md);">';
    html += '<button class="btn btn-text" id="onboarding-skip" style="background: transparent; color: var(--color-text-muted); border: none; font-family: var(--font-sans); font-size: 0.85rem; cursor: pointer; transition: all var(--transition-fast); padding: var(--space-sm);">Skip Setup</button>';
    html += '</div>';
    return html;
  }

  // --- Helper: Render full overlay ---
  function _renderOverlay() {
    let html = '<div class="onboarding-overlay-inner" style="' +
      'position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; ' +
      'padding: var(--space-xl); background: rgba(10, 10, 15, 0.92); backdrop-filter: blur(20px); ' +
      '-webkit-backdrop-filter: blur(20px); z-index: 300;' +
      '">';
    html += '<div class="onboarding-card" style="' +
      'width: 100%; max-width: 560px; background: rgba(25, 25, 35, 0.8); ' +
      'backdrop-filter: blur(24px) saturate(1.2); -webkit-backdrop-filter: blur(24px) saturate(1.2); ' +
      'border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-xl); ' +
      'padding: var(--space-2xl); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05); ' +
      'overflow: hidden; animation: onboardingFadeIn 400ms ease;' +
      '">';
    html += _renderProgress();
    html += '<div class="onboarding-content">';
    html += _renderStep();
    html += '</div>';
    html += _renderNav();
    html += '</div>';
    html += '</div>';
    html += '<style>';
    html += '@keyframes onboardingFadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }';
    html += '@keyframes onboardingStepIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }';
    html += '.onboarding-step .step-title { text-align: center; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--color-text); margin: 0 0 var(--space-sm) 0; letter-spacing: -0.02em; }';
    html += '.onboarding-step .step-subtitle { text-align: center; color: var(--color-text-secondary); font-size: 0.95rem; margin: 0 0 var(--space-lg) 0; }';
    html += '.onboarding-step .step-body { color: var(--color-text-secondary); line-height: 1.6; }';
    html += '.onboarding-step .step-body .form-group { margin-bottom: var(--space-md); }';
    html += '.onboarding-step .step-body label { display: block; color: var(--color-text-muted); font-size: 0.8rem; font-weight: 500; margin-bottom: var(--space-xs); text-transform: uppercase; letter-spacing: 0.05em; }';
    html += '.onboarding-step .step-body .input { width: 100%; padding: var(--space-md); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); font-family: var(--font-sans); font-size: 0.95rem; outline: none; transition: all var(--transition-fast); }';
    html += '.onboarding-step .step-body .input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-glow); }';
    html += '.onboarding-step .step-body .hint { color: var(--color-text-muted); font-size: 0.8rem; margin-top: var(--space-xs); }';
    html += '.onboarding-step .step-body .onboarding-list { list-style: none; padding: 0; margin: var(--space-md) 0; }';
    html += '.onboarding-step .step-body .onboarding-list li { padding: var(--space-sm) 0; padding-left: var(--space-lg); position: relative; color: var(--color-text-secondary); }';
    html += '.onboarding-step .step-body .onboarding-list li::before { content: "\\2192"; position: absolute; left: 0; color: var(--color-primary); }';
    html += '.onboarding-step .step-body .enter-text { text-align: center; color: var(--color-primary); font-weight: 600; margin-top: var(--space-lg); }';
    html += '</style>';
    return html;
  }

  // --- Helper: Update view ---
  function _updateView() {
    if (!_container) return;
    const contentArea = _container.querySelector('.onboarding-content');
    const progressArea = _container.querySelector('.onboarding-progress');
    const navArea = _container.querySelector('.onboarding-nav');
    const skipArea = _container.querySelector('.onboarding-skip');

    if (contentArea) contentArea.innerHTML = _renderStep();
    if (progressArea) progressArea.outerHTML = _renderProgress();
    if (navArea) navArea.outerHTML = _renderNav();
    if (skipArea) skipArea.outerHTML = '<div class="onboarding-skip" style="text-align: center; margin-top: var(--space-md);"><button class="btn btn-text" id="onboarding-skip" style="background: transparent; color: var(--color-text-muted); border: none; font-family: var(--font-sans); font-size: 0.85rem; cursor: pointer; transition: all var(--transition-fast); padding: var(--space-sm);">Skip Setup</button></div>';

    _attachNavListeners();
  }

  // --- Helper: Attach navigation listeners ---
  function _attachNavListeners() {
    const prevBtn = _container.querySelector('#onboarding-prev');
    const nextBtn = _container.querySelector('#onboarding-next');
    const skipBtn = _container.querySelector('#onboarding-skip');

    if (prevBtn) {
      _on(prevBtn, 'click', function() {
        if (_currentStep > 1) {
          _currentStep--;
          _updateView();
        }
      });
    }

    if (nextBtn) {
      _on(nextBtn, 'click', function() {
        _saveStepData(_currentStep);
        if (_currentStep < TOTAL_STEPS) {
          _currentStep++;
          _updateView();
        } else {
          _finishOnboarding();
        }
      });
    }

    if (skipBtn) {
      _on(skipBtn, 'click', function() {
        FreedomOS.confirm('Skip setup? You can configure everything later in Settings.', function() {
          _finishOnboarding();
        });
      });
    }
  }

  // --- Helper: Finish onboarding ---
  function _finishOnboarding() {
    _markComplete();
    if (_overlayEl) {
      _overlayEl.classList.add('fade-out');
      setTimeout(function() {
        _overlayEl.style.display = 'none';
        FreedomOS.navigate('dashboard');
      }, 400);
    } else {
      FreedomOS.navigate('dashboard');
    }
  }

  // --- Helper: Show onboarding overlay ---
  function _showOnboarding() {
    _overlayEl = document.getElementById('onboarding-overlay');
    if (!_overlayEl) return;
    _overlayEl.innerHTML = _renderOverlay();
    _overlayEl.classList.remove('hidden');
    _container = _overlayEl.querySelector('.onboarding-card');
    _attachNavListeners();

    // Enter key to advance
    _on(document, 'keydown', function(e) {
      if (e.key === 'Enter' && _currentStep === TOTAL_STEPS) {
        _finishOnboarding();
      }
    });
  }

  // --- Public: Trigger onboarding manually ---
  function trigger() {
    _resetOnboarding();
    _showOnboarding();
  }

  // --- Module Registration ---
  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [],
    requires: ['core', 'ui', 'events', 'utils'],

    init: function() {
      FreedomOS.DEBUG && console.log('[Onboarding] Module initialized.');
      // Check first visit
      if (!_isOnboardingComplete()) {
        setTimeout(function() {
          _showOnboarding();
        }, 500);
      }
    },

    render: function(params) {
      return '';
    },

    onMount: function(container) {
      // This module doesn't use standard routing
    },

    onUnmount: function(container) {
      _removeListeners();
      _container = null;
      _overlayEl = null;
    },

    // Expose trigger for manual re-run
    trigger: trigger
  });
})();