// ============================================================
// Freedom OS — Utilities
// File: js/kernel/utils.js
// Depends: none
// Provides: generateId, formatMoney, formatDuration, escapeHtml,
//           debounce, throttle, deepClone, isEmpty
// Last Updated: 2026-04-29
// ============================================================
//
// CONNECTION CONTRACT:
// - This module initializes the FreedomOS namespace
// - All utility functions are attached directly to FreedomOS
// - No dependencies on other kernel files
//
// DO NOT MODIFY:
// - Function signatures
// - Behavior of core utilities
// ============================================================

(function() {
  'use strict';

  // Initialize global namespace
  window.FreedomOS = window.FreedomOS || {};

  /**
   * Generates a unique string ID using timestamp and random suffix.
   * @returns {string} Unique identifier
   */
  FreedomOS.generateId = function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  /**
   * Formats a number as currency string.
   * @param {number} amount - The monetary amount
   * @returns {string} Formatted currency string
   */
  FreedomOS.formatMoney = function(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  /**
   * Formats seconds into human-readable duration.
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration (e.g., "2h 15m")
   */
  FreedomOS.formatDuration = function(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return '0m';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
      return h + 'h ' + (m > 0 ? m + 'm' : '');
    }
    return m + 'm';
  };

  /**
   * Escapes HTML special characters to prevent XSS.
   * @param {string} str - Raw string
   * @returns {string} Escaped string safe for HTML insertion
   */
  FreedomOS.escapeHtml = function(str) {
    if (typeof str !== 'string') return '';
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
  };

  /**
   * Creates a debounced function that delays execution.
   * @param {Function} fn - Function to debounce
   * @param {number} ms - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  FreedomOS.debounce = function(fn, ms) {
    var timeout;
    return function() {
      var context = this;
      var args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        fn.apply(context, args);
      }, ms);
    };
  };

  /**
   * Creates a throttled function that limits execution rate.
   * @param {Function} fn - Function to throttle
   * @param {number} ms - Minimum interval in milliseconds
   * @returns {Function} Throttled function
   */
  FreedomOS.throttle = function(fn, ms) {
    var last = 0;
    return function() {
      var now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(this, arguments);
      }
    };
  };

  /**
   * Creates a deep clone of an object using JSON serialization.
   * @param {Object} obj - Object to clone
   * @returns {Object} Deep cloned copy
   */
  FreedomOS.deepClone = function(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return obj;
    }
  };

  /**
   * Checks if an object or array is empty.
   * @param {Object|Array} obj - Value to check
   * @returns {boolean} True if empty
   */
  FreedomOS.isEmpty = function(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return false;
  };

})();