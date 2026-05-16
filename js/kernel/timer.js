// ============================================================
// Freedom OS — Timer
// File: js/kernel/timer.js
// Depends: utils.js, events.js, core.js
// Provides: timer.start, timer.stop, timer.isRunning,
//           timer.getCurrentProjectId, timer.getElapsed, timer.init
// Last Updated: 2026-04-29
// ============================================================
//
// CONNECTION CONTRACT:
// - Timer state syncs with FreedomOS.state.timer
// - Emits 'timer:tick' every second while running
// - Restores active timer on page reload
//
// DO NOT MODIFY:
// - API signatures
// - State sync behavior
// ============================================================

(function() {
  'use strict';

  if (typeof FreedomOS === 'undefined' || !FreedomOS.emit || !FreedomOS.mutate) {
    throw new Error('FreedomOS.timer requires utils.js, events.js, and core.js to be loaded first.');
  }

  /** @private @type {number|null} */
  var _intervalId = null;
  /** @private @type {number} */
  var _elapsed = 0;
  /** @private @type {string|null} */
  var _projectId = null;
  /** @private @type {number} */
  var _startTime = 0;

  /**
   * Updates the elapsed time and emits tick event.
   * @private
   */
  function _tick() {
    if (_startTime > 0) {
      _elapsed = Math.floor((Date.now() - _startTime) / 1000);
    }
    FreedomOS.emit('timer:tick', {
      projectId: _projectId,
      elapsed: _elapsed
    });
  }

  /**
   * Syncs timer state to global state.
   * @private
   */
  function _syncState() {
    FreedomOS.mutate('timer.isRunning', _intervalId !== null);
    FreedomOS.mutate('timer.projectId', _projectId);
    FreedomOS.mutate('timer.startTime', _startTime);
    FreedomOS.mutate('timer.elapsed', _elapsed);
  }

  /**
   * Starts tracking time for a project.
   * @param {string} projectId - Project ID to track
   */
  function _start(projectId) {
    if (_intervalId !== null) {
      _stop();
    }
    _projectId = projectId;
    _startTime = Date.now();
    _elapsed = 0;
    _intervalId = setInterval(_tick, 1000);
    _syncState();
    _tick();
  }

  /**
   * Stops the active timer.
   */
  function _stop() {
    if (_intervalId !== null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    _elapsed = _startTime > 0 ? Math.floor((Date.now() - _startTime) / 1000) : 0;
    _projectId = null;
    _startTime = 0;
    _syncState();
  }

  /**
   * Checks if timer is currently running.
   * @returns {boolean}
   */
  function _isRunning() {
    return _intervalId !== null;
  }

  /**
   * Gets the current project ID being tracked.
   * @returns {string|null}
   */
  function _getCurrentProjectId() {
    return _projectId;
  }

  /**
   * Gets elapsed seconds for active timer.
   * @returns {number}
   */
  function _getElapsed() {
    if (_intervalId !== null && _startTime > 0) {
      return Math.floor((Date.now() - _startTime) / 1000);
    }
    return _elapsed;
  }

  /**
   * Restores timer from state if it was running on last session.
   * @private
   */
  function _restore() {
    var timerState = FreedomOS.get('timer');
    if (timerState && timerState.isRunning && timerState.projectId && timerState.startTime) {
      _projectId = timerState.projectId;
      _startTime = timerState.startTime;
      _elapsed = Math.floor((Date.now() - _startTime) / 1000);
      _intervalId = setInterval(_tick, 1000);
      _tick();
    }
  }

  /**
   * Initializes the timer subsystem.
   */
  function _init() {
    _restore();
  }

  /** @public */
  FreedomOS.timer = {
    start: _start,
    stop: _stop,
    isRunning: _isRunning,
    getCurrentProjectId: _getCurrentProjectId,
    getElapsed: _getElapsed,
    init: _init
  };

})();