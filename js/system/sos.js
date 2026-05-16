// ============================================================
// Freedom OS — SOS
// File: js/system/sos.js
// Depends: kernel/core.js, kernel/events.js, kernel/ui.js, kernel/router.js
// Provides: Emergency focus overlay with countdown, breathing, contacts
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

  const MODULE_NAME = 'sos';
  const ROUTE_NAME = 'sos';

  let overlayEl = null;
  let timerInterval = null;
  let breathingInterval = null;
  let keydownHandler = null;
  let remainingSeconds = 25 * 60; // 25 min default
  let isRunning = false;
  let breathingPhase = 'inhale';

  const MOTIVATIONAL_QUOTES = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" }
  ];

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function getRandomQuote() {
    const idx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    return MOTIVATIONAL_QUOTES[idx];
  }

  function getEmergencyContacts() {
    const people = FreedomOS.get('people') || [];
    return people.filter(p => p.category === 'mentor' || p.category === 'collaborator').slice(0, 3);
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('sos-timer');
    if (timerEl) {
      timerEl.textContent = formatTime(remainingSeconds);
    }
  }

  function updateBreathing() {
    const circleEl = document.getElementById('sos-breathing-circle');
    const textEl = document.getElementById('sos-breathing-text');
    if (!circleEl || !textEl) return;
    
    if (breathingPhase === 'inhale') {
      circleEl.style.transform = 'scale(1.5)';
      circleEl.style.opacity = '0.8';
      textEl.textContent = 'Breathe In';
      breathingPhase = 'hold';
      setTimeout(() => {
        if (breathingPhase === 'hold') {
          circleEl.style.transform = 'scale(1.5)';
          textEl.textContent = 'Hold';
          breathingPhase = 'exhale';
          setTimeout(() => {
            if (breathingPhase === 'exhale') {
              circleEl.style.transform = 'scale(1)';
              circleEl.style.opacity = '0.4';
              textEl.textContent = 'Breathe Out';
              breathingPhase = 'inhale';
            }
          }, 2000);
        }
      }, 2000);
    }
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    
    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay();
      
      if (remainingSeconds <= 0) {
        stopTimer();
        FreedomOS.toast('Focus session complete!', 'success', 5000);
      }
    }, 1000);
    
    const btn = document.getElementById('sos-timer-toggle');
    if (btn) {
      btn.textContent = 'Pause';
      btn.style.background = 'var(--color-warning)';
    }
  }

  function stopTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    
    const btn = document.getElementById('sos-timer-toggle');
    if (btn) {
      btn.textContent = 'Start Focus';
      btn.style.background = 'var(--color-primary)';
    }
  }

  function resetTimer() {
    stopTimer();
    remainingSeconds = 25 * 60;
    updateTimerDisplay();
  }

  function openSOS() {
    if (overlayEl && !overlayEl.classList.contains('hidden')) return;
    
    overlayEl = document.getElementById('sos-overlay');
    if (!overlayEl) return;
    
    const quote = getRandomQuote();
    const contacts = getEmergencyContacts();
    
    overlayEl.classList.remove('hidden');
    overlayEl.innerHTML = `
      <div class="sos-backdrop" style="
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 200;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-xl);
        animation: sosFadeIn 400ms ease;
      ">
        <!-- Close button -->
        <button id="sos-close" style="
          position: absolute;
          top: var(--space-lg);
          right: var(--space-lg);
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-md);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
          z-index: 10;
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <!-- Main content -->
        <div class="sos-content" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 600px;
          width: 100%;
          background: rgba(30, 30, 40, 0.6);
          backdrop-filter: blur(24px) saturate(1.2);
          -webkit-backdrop-filter: blur(24px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-xl);
          padding: var(--space-2xl);
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
        ">
          <!-- Timer -->
          <div class="sos-timer-wrap" style="margin-bottom: var(--space-2xl);">
            <div id="sos-timer" style="
              font-family: var(--font-mono);
              font-size: clamp(4rem, 12vw, 7rem);
              font-weight: 700;
              color: var(--color-primary);
              text-shadow: 0 0 40px var(--color-primary-glow), 0 0 80px rgba(0, 212, 170, 0.1);
              letter-spacing: -0.03em;
              line-height: 1;
              tabular-nums;
            ">${formatTime(remainingSeconds)}</div>
            <div style="
              color: var(--color-text-muted);
              font-size: 0.9rem;
              margin-top: var(--space-sm);
            ">Focus Session</div>
          </div>
          
          <!-- Timer controls -->
          <div class="sos-controls" style="
            display: flex;
            gap: var(--space-md);
            margin-bottom: var(--space-2xl);
          ">
            <button id="sos-timer-toggle" style="
              padding: var(--space-md) var(--space-xl);
              background: var(--color-primary);
              color: var(--color-text-inverse);
              border: none;
              border-radius: var(--radius-md);
              font-family: var(--font-sans);
              font-weight: 600;
              font-size: 1rem;
              cursor: pointer;
              transition: all var(--transition-fast);
            ">Start Focus</button>
            <button id="sos-timer-reset" style="
              padding: var(--space-md) var(--space-xl);
              background: var(--color-surface-elevated);
              color: var(--color-text);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-md);
              font-family: var(--font-sans);
              font-weight: 500;
              font-size: 1rem;
              cursor: pointer;
              transition: all var(--transition-fast);
            ">Reset</button>
          </div>
          
          <!-- Breathing exercise -->
          <div class="sos-breathing" style="
            margin-bottom: var(--space-2xl);
            display: flex;
            flex-direction: column;
            align-items: center;
          ">
            <div id="sos-breathing-circle" style="
              width: 120px;
              height: 120px;
              border-radius: 50%;
              background: radial-gradient(circle, var(--color-primary) 0%, transparent 70%);
              opacity: 0.4;
              transition: all 4s ease-in-out;
              margin-bottom: var(--space-md);
            "></div>
            <div id="sos-breathing-text" style="
              color: var(--color-text-secondary);
              font-size: 0.9rem;
              letter-spacing: 0.1em;
              text-transform: uppercase;
            ">Ready</div>
          </div>
          
          <!-- Quote -->
          <div class="sos-quote" style="
            margin-bottom: var(--space-2xl);
            max-width: 480px;
          ">
            <p style="
              font-family: var(--font-display);
              font-size: 1.2rem;
              color: var(--color-text);
              line-height: 1.5;
              font-style: italic;
              margin: 0 0 var(--space-sm) 0;
            ">"${FreedomOS.escapeHtml(quote.text)}"</p>
            <p style="
              color: var(--color-text-muted);
              font-size: 0.85rem;
              margin: 0;
            ">— ${FreedomOS.escapeHtml(quote.author)}</p>
          </div>
          
          <!-- Distraction blocker reminder -->
          <div class="sos-blocker" style="
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            padding: var(--space-lg) var(--space-xl);
            margin-bottom: var(--space-xl);
            max-width: 400px;
            width: 100%;
          ">
            <div style="
              display: flex;
              align-items: center;
              gap: var(--space-md);
              margin-bottom: var(--space-sm);
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span style="
                color: var(--color-warning);
                font-weight: 600;
                font-size: 0.9rem;
              ">Stay Focused</span>
            </div>
            <p style="
              color: var(--color-text-secondary);
              font-size: 0.85rem;
              margin: 0;
              line-height: 1.5;
            ">Close distracting tabs. Put your phone away. You are in focus mode. Nothing else matters right now.</p>
          </div>
          
          <!-- Emergency contacts -->
          ${contacts.length > 0 ? `
            <div class="sos-contacts" style="
              margin-bottom: var(--space-xl);
              width: 100%;
              max-width: 400px;
            ">
              <h3 style="
                color: var(--color-text-muted);
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin: 0 0 var(--space-md) 0;
              ">Emergency Contacts</h3>
              <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                ${contacts.map(contact => `
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--space-md);
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                  ">
                    <div style="display: flex; align-items: center; gap: var(--space-md);">
                      <div style="
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: var(--color-secondary);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: var(--color-text-inverse);
                        font-weight: 600;
                        font-size: 0.85rem;
                      ">${(contact.name || '?').charAt(0).toUpperCase()}</div>
                      <div>
                        <div style="color: var(--color-text); font-weight: 500; font-size: 0.9rem;">${FreedomOS.escapeHtml(contact.name)}</div>
                        <div style="color: var(--color-text-muted); font-size: 0.8rem;">${FreedomOS.escapeHtml(contact.platform || '')}</div>
                      </div>
                    </div>
                    ${contact.url ? `
                      <a href="${FreedomOS.escapeHtml(contact.url)}" target="_blank" style="
                        color: var(--color-primary);
                        text-decoration: none;
                        font-size: 0.8rem;
                        padding: var(--space-xs) var(--space-sm);
                        border: 1px solid var(--color-border);
                        border-radius: var(--radius-sm);
                        transition: all var(--transition-fast);
                      " onmouseover="this.style.borderColor='var(--color-primary)'" onmouseout="this.style.borderColor='var(--color-border)'">Reach Out</a>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <!-- Get back to work -->
          <button id="sos-back-to-work" style="
            padding: var(--space-md) var(--space-2xl);
            background: var(--color-surface-elevated);
            color: var(--color-primary);
            border: 2px solid var(--color-primary);
            border-radius: var(--radius-md);
            font-family: var(--font-sans);
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
            transition: all var(--transition-fast);
            letter-spacing: 0.02em;
          ">
            Get Back to Work
          </button>
        </div>
      </div>
      
      <style>
        @keyframes sosFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        #sos-close:hover {
          color: var(--color-text) !important;
          background: var(--color-surface-elevated) !important;
        }
        #sos-timer-toggle:hover {
          filter: brightness(1.1);
          transform: scale(1.02);
        }
        #sos-timer-reset:hover {
          border-color: var(--color-text-secondary) !important;
        }
        #sos-back-to-work:hover {
          background: var(--color-primary) !important;
          color: var(--color-text-inverse) !important;
          box-shadow: var(--shadow-glow-primary);
        }
      </style>
    `;
    
    // Event handlers
    document.getElementById('sos-close').addEventListener('click', closeSOS);
    document.getElementById('sos-back-to-work').addEventListener('click', closeSOS);
    document.getElementById('sos-timer-toggle').addEventListener('click', function() {
      if (isRunning) {
        stopTimer();
      } else {
        startTimer();
      }
    });
    document.getElementById('sos-timer-reset').addEventListener('click', resetTimer);
    
    // Start breathing animation
    breathingInterval = setInterval(updateBreathing, 6000);
    updateBreathing();
    
    keydownHandler = function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSOS();
      }
    };
    document.addEventListener('keydown', keydownHandler);
    
    FreedomOS.emit('sos:opened');
  }

  function closeSOS() {
    stopTimer();
    
    if (breathingInterval) {
      clearInterval(breathingInterval);
      breathingInterval = null;
    }
    
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.innerHTML = '';
      overlayEl = null;
    }
    
    FreedomOS.emit('sos:closed');
  }

  function onGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      openSOS();
    }
  }

  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'events', 'ui', 'router'],

    init: function() {
      document.addEventListener('keydown', onGlobalKeydown);
      FreedomOS.on('sos:open', openSOS);
    },

    render: function(params) {
      return '';
    },

    onMount: function(container) {
      // Overlay-based module
    },

    onUnmount: function(container) {
      closeSOS();
    }
  });

})();