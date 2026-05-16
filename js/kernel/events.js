// ============================================================
// Freedom OS — Event Bus
// File: js/kernel/events.js
// Depends: utils.js
// Provides: on, off, emit
// Last Updated: 2026-04-29
// ============================================================
//
// CONNECTION CONTRACT:
// - All module communication goes through this event bus
// - Standard events: 'state:changed', 'view:enter', 'view:leave', 'timer:tick'
//
// DO NOT MODIFY:
// - API signatures
// - Event emission behavior
// ============================================================

(function() {
  'use strict';

  if (typeof FreedomOS === 'undefined') {
    throw new Error('FreedomOS.events requires FreedomOS.utils to be loaded first.');
  }

  /** @private @type {Object.<string, Array<{fn: Function, ctx: *}>>} */
  var _events = {};

  /**
   * Subscribes to an event.
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   * @param {*} [context] - Optional `this` context
   * @returns {Function} Unsubscribe function
   */
  FreedomOS.on = function(event, callback, context) {
    if (typeof event !== 'string' || typeof callback !== 'function') return function() {};
    if (!_events[event]) _events[event] = [];
    var listener = { fn: callback, ctx: context };
    _events[event].push(listener);
    return function() {
      FreedomOS.off(event, callback);
    };
  };

  /**
   * Unsubscribes from an event.
   * @param {string} event - Event name
   * @param {Function} callback - Handler to remove
   */
  FreedomOS.off = function(event, callback) {
    if (typeof event !== 'string' || !_events[event]) return;
    _events[event] = _events[event].filter(function(l) {
      return l.fn !== callback;
    });
  };

  /**
   * Emits an event to all subscribers.
   * @param {string} event - Event name
   * @param {*} [data] - Data passed to callbacks
   */
  FreedomOS.emit = function(event, data) {
    if (typeof event !== 'string' || !_events[event]) return;
    _events[event].forEach(function(listener) {
      try {
        listener.fn.call(listener.ctx, data);
      } catch (e) {
        // Silently catch errors to prevent event bus collapse
      }
    });
  };

})();