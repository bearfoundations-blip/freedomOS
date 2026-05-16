// ============================================================
// Freedom OS — Import/Export System
// File: js/system/importExport.js
// Depends: kernel/core.js, kernel/ui.js, kernel/events.js, kernel/utils.js
// Provides: Import/export module with backup/restore, auto-backup reminders,
//           storage usage indicator, and clear-all-data functionality.
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
  const MODULE_NAME = 'importExport';
  const ROUTE = 'importExport';
  const STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB localStorage limit
  const AUTO_BACKUP_KEY = 'freedom_os_last_backup';
  const AUTO_BACKUP_INTERVAL_DAYS = 30;

  // --- Module State ---
  let _container = null;
  let _listeners = [];
  let _importFileInput = null;
  let _pendingImportData = null;

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

  // --- Helper: Get localStorage usage ---
  function _getStorageUsage() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
      }
    }
    return total;
  }

  // --- Helper: Format bytes ---
  function _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // --- Helper: Check if auto-backup is due ---
  function _isAutoBackupDue() {
    const lastBackup = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!lastBackup) return true;
    const lastDate = new Date(lastBackup);
    const now = new Date();
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    return diffDays >= AUTO_BACKUP_INTERVAL_DAYS;
  }

  // --- Helper: Update auto-backup reminder ---
  function _updateBackupReminder() {
    const reminderEl = _container && _container.querySelector('.backup-reminder');
    if (!reminderEl) return;
    if (_isAutoBackupDue()) {
      reminderEl.textContent = '⚠️ Auto-backup overdue. Export your data now.';
      reminderEl.classList.add('overdue');
    } else {
      reminderEl.textContent = '✓ Auto-backup up to date.';
      reminderEl.classList.remove('overdue');
    }
  }

  // --- Export: Download entire state as JSON ---
  function _exportData() {
    const state = FreedomOS.state;
    const exportObj = {
      version: state.version || '2.0.0',
      exportedAt: new Date().toISOString(),
      data: FreedomOS.deepClone(state)
    };
    const jsonStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = 'freedom-os-backup-' + dateStr + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    localStorage.setItem(AUTO_BACKUP_KEY, new Date().toISOString());
    _updateBackupReminder();
    FreedomOS.toast('Backup exported successfully', 'success');
    FreedomOS.DEBUG && console.log('[ImportExport] Data exported.');
  }

  // --- Import: Validate schema ---
  function _validateImport(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid JSON structure.' };
    if (!data.version) return { valid: false, error: 'Missing version field.' };
    if (!data.data || typeof data.data !== 'object') return { valid: false, error: 'Missing data object.' };

    const requiredTopLevel = ['version', 'profile', 'dashboard', 'projects', 'creatorStudio', 'finance', 'people', 'wins', 'letters', 'reviews', 'roadmap', 'stats', 'settings', 'timer'];
    const missing = requiredTopLevel.filter(function(key) {
      return !(key in data.data);
    });
    if (missing.length > 0) {
      return { valid: false, error: 'Missing required fields: ' + missing.join(', ') };
    }
    return { valid: true };
  }

  // --- Import: Preview changes ---
  function _renderPreview(importData) {
    const current = FreedomOS.state;
    const incoming = importData.data;
    let html = '<div class="import-preview">';
    html += '<h3>Preview Changes</h3>';
    html += '<table class="preview-table">';
    html += '<thead><tr><th>Field</th><th>Current</th><th>Incoming</th></tr></thead>';
    html += '<tbody>';

    const fields = ['projects', 'people', 'wins', 'letters', 'reviews', 'finance', 'dashboard', 'creatorStudio', 'roadmap'];
    fields.forEach(function(field) {
      const curArr = Array.isArray(current[field]) ? current[field] : (current[field] && typeof current[field] === 'object' ? Object.keys(current[field]) : []);
      const incArr = Array.isArray(incoming[field]) ? incoming[field] : (incoming[field] && typeof incoming[field] === 'object' ? Object.keys(incoming[field]) : []);
      const curCount = Array.isArray(curArr) ? curArr.length : curArr;
      const incCount = Array.isArray(incArr) ? incArr.length : incArr;
      html += '<tr>';
      html += '<td>' + FreedomOS.escapeHtml(field) + '</td>';
      html += '<td>' + curCount + ' items</td>';
      html += '<td>' + incCount + ' items</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '<div class="import-actions">';
    html += '<button class="btn btn-primary" id="import-confirm-merge">Merge (Keep Current + Add Incoming)</button>';
    html += '<button class="btn btn-danger" id="import-confirm-replace">Replace (Overwrite Everything)</button>';
    html += '<button class="btn btn-secondary" id="import-cancel">Cancel</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // --- Import: Apply merge ---
  function _applyMerge(incoming) {
    const current = FreedomOS.state;
    const merged = FreedomOS.deepClone(current);

    // Merge arrays: deduplicate by id
    const arrayFields = ['projects', 'people', 'wins', 'letters', 'reviews', 'roadmap', 'finance.ledger', 'creatorStudio.platforms', 'creatorStudio.contentPipeline', 'creatorStudio.hooks', 'creatorStudio.scripts', 'dashboard.habits', 'dashboard.dailyIntentions'];
    arrayFields.forEach(function(field) {
      const curArr = FreedomOS.get(field) || [];
      const incArr = FreedomOS.get(field, incoming) || [];
      if (!Array.isArray(curArr) || !Array.isArray(incArr)) return;

      const idMap = {};
      curArr.forEach(function(item) {
        if (item && item.id) idMap[item.id] = item;
      });
      incArr.forEach(function(item) {
        if (item && item.id) {
          if (!idMap[item.id]) {
            curArr.push(item);
            idMap[item.id] = item;
          }
        } else {
          curArr.push(item);
        }
      });
      FreedomOS.mutate(field, curArr);
    });

    // Merge objects
    const objectFields = ['profile', 'finance.monthlyTargets', 'finance.runway', 'stats', 'settings', 'timer', 'dashboard.energy', 'dashboard.mood'];
    objectFields.forEach(function(field) {
      const incObj = FreedomOS.get(field, incoming);
      if (incObj && typeof incObj === 'object') {
        const curObj = FreedomOS.get(field) || {};
        FreedomOS.mutate(field, Object.assign({}, curObj, incObj));
      }
    });

    FreedomOS.toast('Data merged successfully', 'success');
    FreedomOS.DEBUG && console.log('[ImportExport] Data merged.');
  }

  // --- Import: Apply replace ---
  function _applyReplace(incoming) {
    Object.keys(incoming).forEach(function(key) {
      if (key !== 'version') {
        FreedomOS.mutate(key, FreedomOS.deepClone(incoming[key]));
      }
    });
    FreedomOS.toast('Data replaced successfully', 'success');
    FreedomOS.DEBUG && console.log('[ImportExport] Data replaced.');
  }

  // --- Import: Handle file upload ---
  function _handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const json = JSON.parse(e.target.result);
        const validation = _validateImport(json);
        if (!validation.valid) {
          FreedomOS.toast('Import failed: ' + validation.error, 'error');
          return;
        }
        _pendingImportData = json;
        const previewContainer = _container.querySelector('.import-preview-container');
        if (previewContainer) {
          previewContainer.innerHTML = _renderPreview(json);
          _attachPreviewListeners();
        }
      } catch (err) {
        FreedomOS.toast('Invalid JSON file.', 'error');
        FreedomOS.DEBUG && console.error('[ImportExport] Parse error:', err);
      }
    };
    reader.readAsText(file);
  }

  // --- Attach preview listeners ---
  function _attachPreviewListeners() {
    const mergeBtn = _container.querySelector('#import-confirm-merge');
    const replaceBtn = _container.querySelector('#import-confirm-replace');
    const cancelBtn = _container.querySelector('#import-cancel');

    if (mergeBtn) {
      _on(mergeBtn, 'click', function() {
        if (_pendingImportData) {
          _applyMerge(_pendingImportData.data);
          _pendingImportData = null;
          _renderImportSection();
        }
      });
    }
    if (replaceBtn) {
      _on(replaceBtn, 'click', function() {
        FreedomOS.confirm('This will overwrite ALL current data. Are you sure?', function() {
          if (_pendingImportData) {
            _applyReplace(_pendingImportData.data);
            _pendingImportData = null;
            _renderImportSection();
          }
        });
      });
    }
    if (cancelBtn) {
      _on(cancelBtn, 'click', function() {
        _pendingImportData = null;
        _renderImportSection();
      });
    }
  }

  // --- Clear all data ---
  function _clearAllData() {
    FreedomOS.confirm('This will permanently delete ALL data. This cannot be undone.', function() {
      FreedomOS.confirm('Are you absolutely sure? All projects, wins, letters, and settings will be lost.', function() {
        FreedomOS.confirm('FINAL WARNING: Type "DELETE" to confirm total data destruction.', function() {
          // Triple confirmed
          localStorage.clear();
          FreedomOS.resetState();
          FreedomOS.toast('All data cleared. Reloading...', 'success');
          setTimeout(function() {
            window.location.reload();
          }, 1500);
        }, null, 'DELETE');
      });
    });
  }

  // --- Render import section ---
  function _renderImportSection() {
    const container = _container.querySelector('.import-section');
    if (!container) return;
    container.innerHTML =
      '<div class="import-dropzone" id="import-dropzone" style="' +
      'border: 2px dashed var(--color-border); border-radius: var(--radius-lg); ' +
      'padding: var(--space-2xl) var(--space-xl); text-align: center; ' +
      'transition: all var(--transition-fast); cursor: pointer; ' +
      'background: var(--color-surface); margin-top: var(--space-md);' +
      '">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" style="margin-bottom: var(--space-md);">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
      '<polyline points="17 8 12 3 7 8"></polyline>' +
      '<line x1="12" y1="3" x2="12" y2="15"></line>' +
      '</svg>' +
      '<p style="color: var(--color-text-secondary); font-size: 0.95rem; margin: 0 0 4px 0; font-weight: 500;">Drag & drop your backup file here</p>' +
      '<p style="color: var(--color-text-muted); font-size: 0.8rem; margin: 0;">or click to browse</p>' +
      '<input type="file" id="import-file-input" accept=".json" style="display: none;">' +
      '</div>' +
      '<div class="import-preview-container" style="margin-top: var(--space-md);"></div>';
    
    const dropzone = container.querySelector('#import-dropzone');
    _importFileInput = container.querySelector('#import-file-input');
    
    if (dropzone) {
      _on(dropzone, 'click', function() {
        if (_importFileInput) _importFileInput.click();
      });
      _on(dropzone, 'dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.borderColor = 'var(--color-primary)';
        this.style.background = 'var(--color-surface-elevated)';
        this.style.transform = 'scale(1.01)';
      });
      _on(dropzone, 'dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.borderColor = 'var(--color-border)';
        this.style.background = 'var(--color-surface)';
        this.style.transform = 'scale(1)';
      });
      _on(dropzone, 'drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.borderColor = 'var(--color-border)';
        this.style.background = 'var(--color-surface)';
        this.style.transform = 'scale(1)';
        const file = e.dataTransfer.files[0];
        if (file) _handleFileUpload(file);
      });
    }
    
    if (_importFileInput) {
      _on(_importFileInput, 'change', function(e) {
        const file = e.target.files[0];
        if (file) _handleFileUpload(file);
      });
    }
  }

  // --- Render storage usage bar ---
  function _renderStorageBar() {
    const used = _getStorageUsage();
    const percent = Math.min((used / STORAGE_LIMIT) * 100, 100);
    const bar = _container && _container.querySelector('.storage-bar-fill');
    const text = _container && _container.querySelector('.storage-text');
    if (bar) {
      bar.style.width = percent + '%';
      if (percent > 90) bar.classList.add('danger');
      else if (percent > 70) bar.classList.add('warning');
    }
    if (text) {
      text.textContent = _formatBytes(used) + ' / ' + _formatBytes(STORAGE_LIMIT) + ' (' + Math.round(percent) + '%)';
    }
  }

  // --- Render main view ---
  function _renderView() {
    let html = '<div class="view-importExport">';
    html += '<div class="page-header"><h1>Import / Export</h1><p class="subtitle">Backup, restore, and manage your data.</p></div>';

    // Export Section
    html += '<section class="card export-section">';
    html += '<h2><span class="icon">↓</span> Export Data</h2>';
    html += '<p>Download a complete backup of all your Freedom OS data as a JSON file.</p>';
    html += '<button class="btn btn-primary" id="export-btn">Export Backup</button>';
    html += '<div class="backup-reminder"></div>';
    html += '</section>';

    // Import Section
    html += '<section class="card import-section">';
    html += '<h2><span class="icon">↑</span> Import Data</h2>';
    html += '<p>Restore from a previous backup. You can merge (keep current data and add new) or replace (overwrite everything).</p>';
    html += '<div class="import-dropzone" id="import-dropzone" style="' +
      'border: 2px dashed var(--color-border); border-radius: var(--radius-lg); ' +
      'padding: var(--space-2xl) var(--space-xl); text-align: center; ' +
      'transition: all var(--transition-fast); cursor: pointer; ' +
      'background: var(--color-surface); margin-top: var(--space-md);' +
      '">';
    html += '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" style="margin-bottom: var(--space-md);">';
    html += '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>';
    html += '<polyline points="17 8 12 3 7 8"></polyline>';
    html += '<line x1="12" y1="3" x2="12" y2="15"></line>';
    html += '</svg>';
    html += '<p style="color: var(--color-text-secondary); font-size: 0.95rem; margin: 0 0 var(--space-xs) 0; font-weight: 500;">Drag & drop your backup file here</p>';
    html += '<p style="color: var(--color-text-muted); font-size: 0.8rem; margin: 0;">or click to browse</p>';
    html += '<input type="file" id="import-file-input" accept=".json" style="display: none;">';
    html += '</div>';
    html += '<div class="import-preview-container" style="margin-top: var(--space-md);"></div>';
    html += '</section>';

    // Storage Usage
    html += '<section class="card storage-section">';
    html += '<h2><span class="icon">💾</span> Storage Usage</h2>';
    html += '<div class="storage-bar-container">';
    html += '<div class="storage-bar-track"><div class="storage-bar-fill"></div></div>';
    html += '<span class="storage-text">Calculating...</span>';
    html += '</div>';
    html += '</section>';

    // Danger Zone
    html += '<section class="card danger-zone">';
    html += '<h2><span class="icon">⚠️</span> Danger Zone</h2>';
    html += '<p>Permanently delete all data. This action cannot be undone.</p>';
    html += '<button class="btn btn-danger" id="clear-all-btn">Clear All Data</button>';
    html += '</section>';

    html += '</div>';
    return html;
  }

  // --- Module Registration ---
  FreedomOS.registerModule({
    name: MODULE_NAME,
    routes: [ROUTE],
    requires: ['core', 'ui', 'events', 'utils'],

    init: function() {
      FreedomOS.DEBUG && console.log('[ImportExport] Module initialized.');
    },

    render: function(params) {
      return _renderView();
    },

    onMount: function(container) {
      _container = container;
      _listeners = [];

      // Export button
      const exportBtn = container.querySelector('#export-btn');
      if (exportBtn) {
        _on(exportBtn, 'click', _exportData);
      }

      // Import dropzone
      const dropzone = container.querySelector('#import-dropzone');
      _importFileInput = container.querySelector('#import-file-input');
      
      if (dropzone) {
        _on(dropzone, 'click', function() {
          if (_importFileInput) _importFileInput.click();
        });
        _on(dropzone, 'dragover', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.style.borderColor = 'var(--color-primary)';
          this.style.background = 'var(--color-surface-elevated)';
          this.style.transform = 'scale(1.01)';
        });
        _on(dropzone, 'dragleave', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.style.borderColor = 'var(--color-border)';
          this.style.background = 'var(--color-surface)';
          this.style.transform = 'scale(1)';
        });
        _on(dropzone, 'drop', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.style.borderColor = 'var(--color-border)';
          this.style.background = 'var(--color-surface)';
          this.style.transform = 'scale(1)';
          const file = e.dataTransfer.files[0];
          if (file) _handleFileUpload(file);
        });
      }
      
      if (_importFileInput) {
        _on(_importFileInput, 'change', function(e) {
          const file = e.target.files[0];
          if (file) _handleFileUpload(file);
        });
      }

      // Clear all button
      const clearBtn = container.querySelector('#clear-all-btn');
      if (clearBtn) {
        _on(clearBtn, 'click', _clearAllData);
      }

      // Storage bar
      _renderStorageBar();
      _updateBackupReminder();
    },

    onUnmount: function(container) {
      _removeListeners();
      _container = null;
      _importFileInput = null;
      _pendingImportData = null;
    }
  });
    // --- Mobile convenience API (added for mobile integration) ---
  FreedomOS.openImportExport = function() {
    FreedomOS.navigate('importExport');
  };

  // Quick export without navigating to the view
  FreedomOS.quickExport = function() {
    _exportData();
  };

  // Auto-toast backup reminder on app launch
  FreedomOS.on('app:ready', function() {
    if (_isAutoBackupDue()) {
      setTimeout(function() {
        FreedomOS.toast('Backup overdue. Open Import/Export to save your data.', 'warning', 6000);
      }, 4000);
    }
  });

  // Keyboard shortcut: Cmd/Ctrl + Shift + E
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      _exportData();
    }
  });
})();