// ============================================================
// Freedom OS — UI Primitives (POLISHED)
// File: js/kernel/ui.js
// Depends: utils.js, events.js
// Provides: toast, modal, confirm, prompt
// Last Updated: 2026-05-10
// ============================================================

(function() {
  'use strict';

  if (typeof FreedomOS === 'undefined' || !FreedomOS.emit) {
    throw new Error('FreedomOS.ui requires utils.js and events.js to be loaded first.');
  }

  var _toastContainer = null;
  var _modalOverlay = null;
  var _modalKeyHandler = null;
  var _toastId = 0;

  function _initRefs() {
    _toastContainer = document.getElementById('toast-container');
    _modalOverlay = document.getElementById('modal-overlay');
  }

  FreedomOS.toast = function(message, type, duration) {
    if (!_toastContainer) _initRefs();
    if (!_toastContainer) return;
    type = type || 'info';
    duration = duration || 3000;

    var id = 'toast-' + (++_toastId);
    var toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast toast--' + type;
    toast.setAttribute('role', 'alert');
    toast.innerHTML =
      '<div class="toast__content">' + FreedomOS.escapeHtml(message) + '</div>' +
      '<div class="toast__progressbar">' +
        '<div class="toast__progressbar-fill" style="width: 100%; height: 2px; background: rgba(255,255,255,0.4);"></div>' +
      '</div>';

    _toastContainer.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('toast--visible');

    var fill = toast.querySelector('.toast__progressbar-fill');
    if (fill) {
      fill.style.transition = 'width ' + duration + 'ms linear';
      void fill.offsetWidth;
      fill.style.width = '0%';
    }

    setTimeout(function() {
      toast.classList.remove('toast--visible');
      setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  };

  FreedomOS.modal = function(options) {
    if (!_modalOverlay) _initRefs();
    if (!_modalOverlay) return;

    options = options || {};
    var title = options.title || '';
    var content = options.content || '';
    var confirmText = options.confirmText || 'Confirm';
    var cancelText = options.cancelText || 'Cancel';

    var triggerElement = document.activeElement;

    var modalHtml =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal__header">' +
          '<h3 class="modal__title">' + FreedomOS.escapeHtml(title) + '</h3>' +
          '<button class="modal__close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal__body">' + content + '</div>' +
        '<div class="modal__footer">' +
          '<button class="btn btn--secondary modal__cancel">' + FreedomOS.escapeHtml(cancelText) + '</button>' +
          '<button class="btn btn--primary modal__confirm">' + FreedomOS.escapeHtml(confirmText) + '</button>' +
        '</div>' +
      '</div>';

    _modalOverlay.innerHTML = modalHtml;
    _modalOverlay.classList.remove('hidden');

    var modal = _modalOverlay.querySelector('.modal');
    var closeBtn = modal.querySelector('.modal__close');
    var confirmBtn = modal.querySelector('.modal__confirm');
    var cancelBtn = modal.querySelector('.modal__cancel');

    function closeModal() {
      _modalOverlay.classList.add('hidden');
      _modalOverlay.innerHTML = '';
      if (_modalKeyHandler) {
        document.removeEventListener('keydown', _modalKeyHandler);
        _modalKeyHandler = null;
      }
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    }

    function onConfirm() {
      var shouldClose = true;
      if (typeof options.onConfirm === 'function') {
        shouldClose = options.onConfirm() !== false;
      }
      if (shouldClose) closeModal();
    }

    function onCancel() {
      if (typeof options.onCancel === 'function') options.onCancel();
      closeModal();
    }

    closeBtn.addEventListener('click', onCancel);
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);

    _modalKeyHandler = function(e) {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        var focusables = Array.prototype.slice.call(
          modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        );
        if (focusables.length === 0) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', _modalKeyHandler);

    var firstInput = modal.querySelector('input, textarea, select');
    if (firstInput) {
      firstInput.focus();
    } else {
      confirmBtn.focus();
    }
  };

  FreedomOS.confirm = function(message, onConfirm, onCancel) {
    FreedomOS.modal({
      title: 'Confirm',
      content: '<p>' + FreedomOS.escapeHtml(message) + '</p>',
      onConfirm: onConfirm,
      onCancel: onCancel,
      confirmText: 'Confirm',
      cancelText: 'Cancel'
    });
  };

  FreedomOS.prompt = function(message, defaultValue, onSubmit) {
    defaultValue = defaultValue || '';
    var inputId = 'prompt-input-' + FreedomOS.generateId();
    var content =
      '<p>' + FreedomOS.escapeHtml(message) + '</p>' +
      '<input type="text" id="' + inputId + '" class="input" value="' + FreedomOS.escapeHtml(defaultValue) + '" />';

    FreedomOS.modal({
      title: 'Input',
      content: content,
      onConfirm: function() {
        var input = document.getElementById(inputId);
        if (input && typeof onSubmit === 'function') {
          onSubmit(input.value);
        }
      },
      confirmText: 'Submit',
      cancelText: 'Cancel'
    });
  };

})();