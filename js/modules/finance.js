// ============================================================
// Freedom OS — Finance (POLISHED)
// File: js/modules/finance.js
// Depends: kernel/core.js, kernel/utils.js, kernel/ui.js, kernel/events.js, kernel/router.js
// Provides: finance module (route: finance)
// Last Updated: 2026-05-10
// ============================================================

(function() {
  'use strict';

  const MODULE_NAME = 'finance';
  const ROUTE_NAME = 'finance';
  const DEFAULT_CATEGORIES = ['Revenue', 'Ad Spend', 'Software', 'Contractors', 'Equipment', 'Education', 'Other'];

  let uiState = {
    filters: {
      projectId: '',
      type: '',
      dateFrom: '',
      dateTo: '',
      category: '',
      search: ''
    },
    sort: {
      column: 'date',
      direction: 'desc'
    },
    editingId: null,
    chartResizeHandler: null,
    refreshListener: null
  };

  function getLedger() {
    return FreedomOS.get('finance.ledger') || [];
  }

  function getProjects() {
    return FreedomOS.get('projects') || [];
  }

  function getMonthlyTargets() {
    return FreedomOS.get('finance.monthlyTargets') || [];
  }

  function getCustomCategories() {
    return FreedomOS.get('finance.customCategories') || [];
  }

  function getAllCategories() {
    const used = new Set(DEFAULT_CATEGORIES);
    getCustomCategories().forEach(c => used.add(c));
    getLedger().forEach(e => { if (e.category) used.add(e.category); });
    return Array.from(used).sort();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function parseAmount(val) {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  function escapeHtml(str) {
    if (FreedomOS.escapeHtml) return FreedomOS.escapeHtml(str);
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getProjectName(projectId) {
    const p = getProjects().find(function(x) { return x.id === projectId; });
    return p ? p.name : 'Uncategorized';
  }

  function calculateTotals(entries) {
    var income = 0, expense = 0;
    entries.forEach(function(e) {
      var amt = parseAmount(e.amount);
      if (e.type === 'income') income += amt;
      else expense += amt;
    });
    return { income: income, expense: expense, net: income - expense };
  }

  function calculateRunway() {
    var ledger = getLedger();
    var now = new Date();
    var threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    var totalIncome = 0, totalExpense = 0, recentExpense = 0;
    ledger.forEach(function(e) {
      var amt = parseAmount(e.amount);
      var d = new Date(e.date);
      if (e.type === 'income') totalIncome += amt;
      else totalExpense += amt;
      if (e.type === 'expense' && d >= threeMonthsAgo) recentExpense += amt;
    });

    var netBalance = totalIncome - totalExpense;
    var monthlyBurn = recentExpense / 3;
    if (monthlyBurn <= 0) return { months: Infinity, burnRate: 0 };
    return { months: netBalance / monthlyBurn, burnRate: monthlyBurn };
  }

  function getLast12MonthsData() {
    var ledger = getLedger();
    var months = [];
    var now = new Date();
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      months.push({ key: key, label: d.toLocaleDateString('en-US', { month: 'short' }), income: 0, expense: 0 });
    }
    ledger.forEach(function(e) {
      var mk = getMonthKey(e.date);
      months.forEach(function(m) {
        if (m.key === mk) {
          var amt = parseAmount(e.amount);
          if (e.type === 'income') m.income += amt;
          else m.expense += amt;
        }
      });
    });
    return months;
  }

  function filterEntries(entries) {
    return entries.filter(function(e) {
      if (uiState.filters.projectId && e.projectId !== uiState.filters.projectId) return false;
      if (uiState.filters.type && e.type !== uiState.filters.type) return false;
      if (uiState.filters.category && e.category !== uiState.filters.category) return false;
      if (uiState.filters.dateFrom && e.date < uiState.filters.dateFrom) return false;
      if (uiState.filters.dateTo && e.date > uiState.filters.dateTo) return false;
      if (uiState.filters.search) {
        var term = uiState.filters.search.toLowerCase();
        var text = ((e.description || '') + ' ' + (e.category || '') + ' ' + getProjectName(e.projectId)).toLowerCase();
        if (!text.includes(term)) return false;
      }
      return true;
    });
  }

  function sortEntries(entries) {
    var col = uiState.sort.column;
    var dir = uiState.sort.direction === 'asc' ? 1 : -1;
    return entries.slice().sort(function(a, b) {
      var av, bv;
      if (col === 'project') { av = getProjectName(a.projectId); bv = getProjectName(b.projectId); }
      else if (col === 'amount') { av = parseAmount(a.amount); bv = parseAmount(b.amount); }
      else if (col === 'date') { av = new Date(a.date || 0); bv = new Date(b.date || 0); }
      else { av = (a[col] || '').toString().toLowerCase(); bv = (b[col] || '').toString().toLowerCase(); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function drawChart(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    var width = rect.width;
    var height = rect.height;
    var padding = { top: 20, right: 20, bottom: 40, left: 50 };
    var chartW = width - padding.left - padding.right;
    var chartH = height - padding.top - padding.bottom;

    var data = getLast12MonthsData();
    var maxVal = Math.max.apply(null, data.map(function(d) { return Math.max(d.income, d.expense); }).concat([1]));

    ctx.clearRect(0, 0, width, height);

    var root = getComputedStyle(document.documentElement);
    var colorBorder = root.getPropertyValue('--color-border').trim() || '#2a2a3a';
    var colorTextMuted = root.getPropertyValue('--color-text-muted').trim() || '#5a5a6a';
    var colorPrimary = root.getPropertyValue('--color-primary').trim() || '#00d4aa';
    var colorDanger = root.getPropertyValue('--color-danger').trim() || '#ef4444';
    var colorTextSecondary = root.getPropertyValue('--color-text-secondary').trim() || '#8a8a9a';
    var fontMono = root.getPropertyValue('--font-mono').trim() || 'monospace';
    var fontSans = root.getPropertyValue('--font-sans').trim() || 'sans-serif';

    var steps = 5;
    for (var i = 0; i <= steps; i++) {
      var y = padding.top + chartH - (i / steps) * chartH;
      ctx.strokeStyle = colorBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      ctx.fillStyle = colorTextMuted;
      ctx.font = '11px ' + fontMono;
      ctx.textAlign = 'right';
      ctx.fillText('$' + Math.round((maxVal / steps) * i).toLocaleString(), padding.left - 8, y + 3);
    }

    var barGroupW = chartW / data.length;
    var barW = barGroupW * 0.35;
    data.forEach(function(d, idx) {
      var x = padding.left + idx * barGroupW + barGroupW / 2;
      var incomeH = (d.income / maxVal) * chartH;
      ctx.fillStyle = colorPrimary;
      ctx.fillRect(x - barW - 1, padding.top + chartH - incomeH, barW, incomeH);
      var expenseH = (d.expense / maxVal) * chartH;
      ctx.fillStyle = colorDanger;
      ctx.fillRect(x + 1, padding.top + chartH - expenseH, barW, expenseH);
      ctx.fillStyle = colorTextSecondary;
      ctx.font = '10px ' + fontSans;
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x, padding.top + chartH + 16);
    });

    var legendY = padding.top + chartH + 32;
    ctx.fillStyle = colorPrimary;
    ctx.fillRect(width / 2 - 60, legendY, 10, 10);
    ctx.fillStyle = colorTextSecondary;
    ctx.font = '11px ' + fontSans;
    ctx.textAlign = 'left';
    ctx.fillText('Revenue', width / 2 - 45, legendY + 9);
    ctx.fillStyle = colorDanger;
    ctx.fillRect(width / 2 + 10, legendY, 10, 10);
    ctx.fillText('Expenses', width / 2 + 25, legendY + 9);
  }

  function exportToCSV() {
    var entries = getLedger();
    var headers = ['Date', 'Project', 'Type', 'Category', 'Amount', 'Description'];
    var rows = entries.map(function(e) {
      return [
        e.date || '',
        getProjectName(e.projectId),
        e.type || '',
        e.category || '',
        e.amount || 0,
        (e.description || '').replace(/"/g, '""')
      ];
    });
    var csv = [headers.join(','), rows.map(function(r) { return r.map(function(v) { return '"' + v + '"'; }).join(','); }).join('\n')].join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'freedom-os-ledger.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    FreedomOS.toast('Ledger exported to CSV', 'success', 3000);
  }

  function importFromCSV(text) {
    var lines = text.trim().split('\n');
    if (lines.length < 2) return;
    var projects = getProjects();
    var newEntries = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      var values = [];
      var val = '', inQuotes = false;
      for (var j = 0; j < line.length; j++) {
        var ch = line[j];
        if (ch === '"') {
          if (line[j + 1] === '"') { val += '"'; j++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
          values.push(val.trim());
          val = '';
        } else {
          val += ch;
        }
      }
      values.push(val.trim());
      if (values.length >= 6) {
        var projectName = values[1];
        var project = projects.find(function(p) { return p.name === projectName; });
        newEntries.push({
          id: FreedomOS.generateId(),
          date: values[0] || new Date().toISOString().split('T')[0],
          projectId: project ? project.id : '',
          type: values[2] === 'income' ? 'income' : 'expense',
          category: values[3] || 'Other',
          amount: parseAmount(values[4]),
          description: values[5] || ''
        });
      }
    }
    if (newEntries.length > 0) {
      var current = getLedger();
      FreedomOS.mutate('finance.ledger', current.concat(newEntries));
      FreedomOS.toast('Imported ' + newEntries.length + ' entries', 'success', 3000);
    }
  }

  function renderSummaryCards() {
    var entries = getLedger();
    var totals = calculateTotals(entries);
    var runway = calculateRunway();
    var avg = (function() {
      var months = getLast12MonthsData();
      return {
        income: months.reduce(function(s, m) { return s + m.income; }, 0) / 12,
        expense: months.reduce(function(s, m) { return s + m.expense; }, 0) / 12
      };
    })();

    var netStr = FreedomOS.formatMoney(totals.net);
    var incomeStr = FreedomOS.formatMoney(totals.income);
    var expenseStr = FreedomOS.formatMoney(totals.expense);
    var runwayStr = runway.months === Infinity ? '∞' : runway.months.toFixed(1) + ' mo';
    var burnStr = FreedomOS.formatMoney(runway.burnRate) + '/mo';
    var avgIncStr = FreedomOS.formatMoney(avg.income) + '/mo';
    var avgExpStr = FreedomOS.formatMoney(avg.expense) + '/mo';

    return '<div class="finance-command-bar glass">' +
      '<div class="summary-card">' +
        '<div class="summary-value" style="color: var(--color-primary);">' + incomeStr + '</div>' +
        '<div class="summary-label">REVENUE</div>' +
      '</div>' +
      '<div class="summary-card">' +
        '<div class="summary-value" style="color: var(--color-danger);">' + expenseStr + '</div>' +
        '<div class="summary-label">EXPENSES</div>' +
      '</div>' +
      '<div class="summary-card">' +
        '<div class="summary-value" style="color: ' + (totals.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + netStr + '</div>' +
        '<div class="summary-label">NET</div>' +
      '</div>' +
      '<div class="summary-card">' +
        '<div class="summary-value">' + runwayStr + '</div>' +
        '<div class="summary-label">RUNWAY</div>' +
        '<div class="summary-sub">' + burnStr + ' burn</div>' +
      '</div>' +
      '<div class="summary-card">' +
        '<div class="summary-value" style="color: var(--color-primary);">' + avgIncStr + '</div>' +
        '<div class="summary-label">AVG REVENUE/MO</div>' +
      '</div>' +
      '<div class="summary-card">' +
        '<div class="summary-value" style="color: var(--color-danger);">' + avgExpStr + '</div>' +
        '<div class="summary-label">AVG EXPENSE/MO</div>' +
      '</div>' +
    '</div>';
  }

  function renderMonthlyTargets() {
    var targets = getMonthlyTargets();
    var now = new Date();
    var currentMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var currentTarget = targets.find(function(t) { return t.month === currentMonthKey; });
    if (!currentTarget) currentTarget = { month: currentMonthKey, revenueTarget: 0, expenseBudget: 0 };

    var ledger = getLedger();
    var currentIncome = ledger.filter(function(e) { return e.type === 'income' && getMonthKey(e.date) === currentMonthKey; })
      .reduce(function(s, e) { return s + parseAmount(e.amount); }, 0);
    var currentExpense = ledger.filter(function(e) { return e.type === 'expense' && getMonthKey(e.date) === currentMonthKey; })
      .reduce(function(s, e) { return s + parseAmount(e.amount); }, 0);

    var revPct = currentTarget.revenueTarget > 0 ? Math.min(100, (currentIncome / currentTarget.revenueTarget) * 100) : 0;
    var expPct = currentTarget.expenseBudget > 0 ? Math.min(100, (currentExpense / currentTarget.expenseBudget) * 100) : 0;

    return '<div class="finance-targets card">' +
      '<div class="card-header"><h3>Monthly Targets</h3><span class="text-muted">' + currentMonthKey + '</span></div>' +
      '<div class="card-body">' +
        '<div class="target-row">' +
          '<div class="target-info"><span>Revenue Goal</span><span class="target-amount">' + FreedomOS.formatMoney(currentTarget.revenueTarget) + '</span></div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width: ' + revPct + '%; background: var(--color-primary);"></div></div>' +
          '<div class="target-current">' + FreedomOS.formatMoney(currentIncome) + ' (' + Math.round(revPct) + '%)</div>' +
        '</div>' +
        '<div class="target-row">' +
          '<div class="target-info"><span>Expense Budget</span><span class="target-amount">' + FreedomOS.formatMoney(currentTarget.expenseBudget) + '</span></div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width: ' + expPct + '%; background: var(--color-danger);"></div></div>' +
          '<div class="target-current">' + FreedomOS.formatMoney(currentExpense) + ' (' + Math.round(expPct) + '%)</div>' +
        '</div>' +
        '<div class="target-form" style="margin-top: var(--space-md);">' +
          '<div class="form-row">' +
            '<input type="number" class="form-input" id="fin-rev-target" placeholder="Revenue target" value="' + (currentTarget.revenueTarget || '') + '">' +
            '<input type="number" class="form-input" id="fin-exp-budget" placeholder="Expense budget" value="' + (currentTarget.expenseBudget || '') + '">' +
            '<button class="btn btn-primary" id="fin-save-targets">Set Targets</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderProjectCards() {
    var projects = getProjects();
    if (projects.length === 0) return '';
    var cards = projects.map(function(p) {
      var ledger = getLedger().filter(function(e) { return e.projectId === p.id; });
      var totals = calculateTotals(ledger);
      var netStr = FreedomOS.formatMoney(totals.net);
      var statusColor = 'var(--status-' + (p.status || 'active') + ')';
      return '<div class="project-pll-card">' +
        '<div class="pll-bar" style="background: ' + statusColor + ';"></div>' +
        '<div class="pll-main">' +
          '<div class="pll-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="pll-model">' + escapeHtml(p.model || 'Other') + '</div>' +
        '</div>' +
        '<div class="pll-amount" style="color: ' + (totals.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + netStr + '</div>' +
        '<div class="pll-meta">' + ledger.length + ' transactions</div>' +
      '</div>';
    }).join('');
    return '<div class="finance-projects">' +
      '<h3>Project P&amp;L</h3>' +
      '<div class="project-pll-grid">' + cards + '</div>' +
    '</div>';
  }

  function renderLedgerTable() {
    var categories = getAllCategories();
    var projects = getProjects();
    var sortIndicator = function(col) {
      if (uiState.sort.column !== col) return '<span class="sort-icon">⇅</span>';
      return uiState.sort.direction === 'asc' ? '<span class="sort-icon active">↑</span>' : '<span class="sort-icon active">↓</span>';
    };

    return '<div class="finance-ledger card" id="fin-ledger-card">' +
      '<div class="card-header">' +
        '<h3>Ledger</h3>' +
        '<div class="header-actions">' +
          '<button class="btn btn-secondary" id="fin-export-csv">Export CSV</button>' +
          '<button class="btn btn-secondary" id="fin-import-csv-btn">Import CSV</button>' +
          '<input type="file" id="fin-import-file" accept=".csv" style="display:none;">' +
          '<button class="btn btn-primary" id="fin-add-entry">+ Add</button>' +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="ledger-filters">' +
          '<select class="form-select" id="fin-filter-project"><option value="">All Projects</option>' +
            projects.map(function(p) { return '<option value="' + p.id + '"' + (uiState.filters.projectId === p.id ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>'; }).join('') +
          '</select>' +
          '<select class="form-select" id="fin-filter-type"><option value="">All Types</option>' +
            '<option value="income"' + (uiState.filters.type === 'income' ? ' selected' : '') + '>Income</option>' +
            '<option value="expense"' + (uiState.filters.type === 'expense' ? ' selected' : '') + '>Expense</option>' +
          '</select>' +
          '<div class="filter-pills-scroll">' +
            '<button class="filter-pill' + (uiState.filters.category === '' ? ' active' : '') + '" data-cat="">All</button>' +
            categories.map(function(c) { return '<button class="filter-pill' + (uiState.filters.category === c ? ' active' : '') + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>'; }).join('') +
          '</div>' +
          '<input type="date" class="form-input" id="fin-filter-from" value="' + uiState.filters.dateFrom + '" placeholder="From">' +
          '<input type="date" class="form-input" id="fin-filter-to" value="' + uiState.filters.dateTo + '" placeholder="To">' +
          '<input type="text" class="form-input" id="fin-filter-search" value="' + escapeHtml(uiState.filters.search) + '" placeholder="Search...">' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th class="sortable" data-sort="date">Date ' + sortIndicator('date') + '</th>' +
              '<th class="sortable" data-sort="project">Project ' + sortIndicator('project') + '</th>' +
              '<th class="sortable" data-sort="type">Type ' + sortIndicator('type') + '</th>' +
              '<th class="sortable" data-sort="category">Category ' + sortIndicator('category') + '</th>' +
              '<th class="sortable" data-sort="amount">Amount ' + sortIndicator('amount') + '</th>' +
              '<th>Description</th>' +
              '<th></th>' +
            '</tr></thead>' +
            '<tbody id="fin-ledger-body">' + renderLedgerRows() + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderLedgerRows() {
    var entries = getLedger();
    entries = filterEntries(entries);
    entries = sortEntries(entries);

    if (entries.length === 0) {
      return '<tr><td colspan="7" class="empty-state-cell">' +
        '<div class="empty-state">' +
          '<div class="empty-icon">📊</div>' +
          '<p>No transactions found.</p>' +
          '<button class="btn btn-primary" id="fin-add-first">Add First Transaction</button>' +
        '</div>' +
      '</td></tr>';
    }

    return entries.map(function(e) {
      if (uiState.editingId === e.id) {
        return renderEditRow(e);
      }
      var amt = parseAmount(e.amount);
      var amtStr = FreedomOS.formatMoney(amt);
      var typeClass = e.type === 'income' ? 'type-income' : 'type-expense';
      var projectName = getProjectName(e.projectId);
      return '<tr class="ledger-row" data-id="' + e.id + '">' +
        '<td>' + formatDate(e.date) + '</td>' +
        '<td>' + escapeHtml(projectName) + '</td>' +
        '<td><span class="badge ' + typeClass + '">' + e.type + '</span></td>' +
        '<td>' + escapeHtml(e.category || 'Other') + '</td>' +
        '<td class="amount-cell" style="color: ' + (e.type === 'income' ? 'var(--color-primary)' : 'var(--color-danger)') + ';">' + (e.type === 'income' ? '+' : '-') + amtStr + '</td>' +
        '<td>' + escapeHtml(e.description || '') + '</td>' +
        '<td class="actions-cell">' +
          '<button class="btn-icon edit-btn" data-id="' + e.id + '" aria-label="Edit">✎</button>' +
          '<button class="btn-icon delete-btn" data-id="' + e.id + '" aria-label="Delete">🗑</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function renderEditRow(e) {
    var projects = getProjects();
    var categories = getAllCategories();
    var isNew = e.id === 'new';
    return '<tr class="ledger-row editing" data-id="' + e.id + '">' +
      '<td><input type="date" class="form-input" id="edit-date-' + e.id + '" value="' + (e.date || new Date().toISOString().split('T')[0]) + '"></td>' +
      '<td><select class="form-select" id="edit-project-' + e.id + '"><option value="">Select...</option>' +
        projects.map(function(p) { return '<option value="' + p.id + '"' + (e.projectId === p.id ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>'; }).join('') +
      '</select></td>' +
      '<td><select class="form-select" id="edit-type-' + e.id + '">' +
        '<option value="income"' + (e.type === 'income' ? ' selected' : '') + '>Income</option>' +
        '<option value="expense"' + (e.type === 'expense' ? ' selected' : '') + '>Expense</option>' +
      '</select></td>' +
      '<td><select class="form-select" id="edit-category-' + e.id + '">' +
        categories.map(function(c) { return '<option value="' + escapeHtml(c) + '"' + (e.category === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>'; }).join('') +
      '</select></td>' +
      '<td><input type="number" step="0.01" class="form-input" id="edit-amount-' + e.id + '" value="' + (e.amount || '') + '"></td>' +
      '<td><input type="text" class="form-input" id="edit-desc-' + e.id + '" value="' + escapeHtml(e.description || '') + '"></td>' +
      '<td class="actions-cell">' +
        '<button class="btn-icon save-btn" data-id="' + e.id + '">✓</button>' +
        '<button class="btn-icon cancel-btn" data-id="' + e.id + '">✕</button>' +
      '</td>' +
    '</tr>';
  }

  function renderCategoryManager() {
    var categories = getAllCategories();
    return '<div class="finance-categories card">' +
      '<div class="card-header"><h3>Categories</h3></div>' +
      '<div class="card-body">' +
        '<div class="category-list">' +
          categories.map(function(c) { return '<span class="badge badge-category">' + escapeHtml(c) + '</span>'; }).join('') +
        '</div>' +
        '<div class="category-add" style="margin-top: var(--space-md);">' +
          '<input type="text" class="form-input" id="fin-new-category" placeholder="New category name">' +
          '<button class="btn btn-secondary" id="fin-add-category">Add Category</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var module = {
    name: MODULE_NAME,
    routes: [ROUTE_NAME],
    requires: ['core', 'utils', 'ui', 'events'],

    init: function() {
      uiState.refreshListener = FreedomOS.on('state:changed', function() {
        if (FreedomOS.currentRoute === ROUTE_NAME) {
          var content = document.getElementById('content');
          if (content) {
            content.innerHTML = module.render();
            module.onMount(content);
          }
        }
      });
    },

    render: function(params) {
      return '<div class="view-finance">' +
        renderSummaryCards() +
        '<div class="finance-grid">' +
          '<div class="finance-main">' +
            renderMonthlyTargets() +
            '<div class="chart-card card">' +
              '<div class="card-header"><h3>12-Month Overview</h3></div>' +
              '<div class="card-body"><canvas id="fin-chart" class="chart-canvas chart-ghost"></canvas></div>' +
            '</div>' +
            renderLedgerTable() +
          '</div>' +
          '<div class="finance-side">' +
            renderProjectCards() +
            renderCategoryManager() +
          '</div>' +
        '</div>' +
      '</div>';
    },

    onMount: function(container) {
      var self = this;

      var canvas = container.querySelector('#fin-chart');
      if (canvas) {
        drawChart(canvas);
        uiState.chartResizeHandler = function() { drawChart(canvas); };
        window.addEventListener('resize', uiState.chartResizeHandler);
      }

      var summaryValues = container.querySelectorAll('.summary-value');
      summaryValues.forEach(function(el, i) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(function() {
          el.style.transition = 'opacity 300ms ease, transform 300ms ease';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, i * 80);
      });

      function refreshLedger() {
        var tbody = container.querySelector('#fin-ledger-body');
        if (tbody) tbody.innerHTML = renderLedgerRows();
        attachLedgerListeners();
        container.querySelectorAll('.sortable').forEach(function(th) {
          var col = th.dataset.sort;
          var indicator = col === uiState.sort.column
            ? (uiState.sort.direction === 'asc' ? '<span class="sort-icon active">↑</span>' : '<span class="sort-icon active">↓</span>')
            : '<span class="sort-icon">⇅</span>';
          th.innerHTML = th.textContent.replace(/[⇅↑↓]/g, '').trim() + ' ' + indicator;
        });
        container.querySelectorAll('.filter-pill').forEach(function(btn) {
          btn.classList.toggle('active', btn.dataset.cat === uiState.filters.category);
        });
      }

      var filterIds = ['fin-filter-project', 'fin-filter-type', 'fin-filter-from', 'fin-filter-to'];
      filterIds.forEach(function(id) {
        var el = container.querySelector('#' + id);
        if (el) el.addEventListener('change', onFilterChange);
      });
      var searchEl = container.querySelector('#fin-filter-search');
      if (searchEl) {
        searchEl.addEventListener('input', FreedomOS.debounce(onFilterChange, 300));
      }

      function onFilterChange() {
        uiState.filters.projectId = (container.querySelector('#fin-filter-project') || {}).value || '';
        uiState.filters.type = (container.querySelector('#fin-filter-type') || {}).value || '';
        uiState.filters.dateFrom = (container.querySelector('#fin-filter-from') || {}).value || '';
        uiState.filters.dateTo = (container.querySelector('#fin-filter-to') || {}).value || '';
        uiState.filters.search = (container.querySelector('#fin-filter-search') || {}).value || '';
        refreshLedger();
      }

      container.querySelectorAll('.filter-pill').forEach(function(btn) {
        btn.addEventListener('click', function() {
          uiState.filters.category = this.dataset.cat;
          refreshLedger();
        });
      });

      container.querySelectorAll('.sortable').forEach(function(th) {
        th.addEventListener('click', function() {
          var col = this.dataset.sort;
          if (uiState.sort.column === col) {
            uiState.sort.direction = uiState.sort.direction === 'asc' ? 'desc' : 'asc';
          } else {
            uiState.sort.column = col;
            uiState.sort.direction = 'desc';
          }
          refreshLedger();
        });
      });

      function attachLedgerListeners() {
        var tbody = container.querySelector('#fin-ledger-body');
        if (!tbody) return;

        tbody.querySelectorAll('.edit-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            uiState.editingId = this.dataset.id;
            refreshLedger();
          });
        });

        tbody.querySelectorAll('.delete-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var id = this.dataset.id;
            FreedomOS.confirm('Delete this transaction?', function() {
              var ledger = getLedger();
              FreedomOS.mutate('finance.ledger', ledger.filter(function(e) { return e.id !== id; }));
            });
          });
        });

        tbody.querySelectorAll('.save-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            saveEntry(this.dataset.id);
          });
        });

        tbody.querySelectorAll('.cancel-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            uiState.editingId = null;
            refreshLedger();
          });
        });

        var addFirst = tbody.querySelector('#fin-add-first');
        if (addFirst) {
          addFirst.addEventListener('click', function() {
            uiState.editingId = 'new';
            refreshLedger();
          });
        }
      }

      attachLedgerListeners();

      function saveEntry(id) {
        var isNew = id === 'new';
        var date = (container.querySelector('#edit-date-' + id) || {}).value || new Date().toISOString().split('T')[0];
        var projectId = (container.querySelector('#edit-project-' + id) || {}).value || '';
        var type = (container.querySelector('#edit-type-' + id) || {}).value || 'expense';
        var category = (container.querySelector('#edit-category-' + id) || {}).value || 'Other';
        var amount = parseFloat((container.querySelector('#edit-amount-' + id) || {}).value) || 0;
        var description = (container.querySelector('#edit-desc-' + id) || {}).value || '';

        var ledger = getLedger();
        if (isNew) {
          ledger.push({ id: FreedomOS.generateId(), projectId: projectId, type: type, amount: amount, category: category, date: date, description: description });
        } else {
          var idx = ledger.findIndex(function(e) { return e.id === id; });
          if (idx >= 0) {
            ledger[idx] = { id: id, projectId: projectId, type: type, amount: amount, category: category, date: date, description: description };
          }
        }
        uiState.editingId = null;
        FreedomOS.mutate('finance.ledger', ledger);
      }

      var addBtn = container.querySelector('#fin-add-entry');
      if (addBtn) {
        addBtn.addEventListener('click', function() {
          uiState.editingId = 'new';
          refreshLedger();
        });
      }

      var exportBtn = container.querySelector('#fin-export-csv');
      if (exportBtn) exportBtn.addEventListener('click', exportToCSV);

      var importBtn = container.querySelector('#fin-import-csv-btn');
      var importFile = container.querySelector('#fin-import-file');
      if (importBtn && importFile) {
        importBtn.addEventListener('click', function() { importFile.click(); });
        importFile.addEventListener('change', function(e) {
          var file = e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(ev) {
            importFromCSV(ev.target.result);
            importFile.value = '';
          };
          reader.readAsText(file);
        });
      }

      var addCatBtn = container.querySelector('#fin-add-category');
      if (addCatBtn) {
        addCatBtn.addEventListener('click', function() {
          var input = container.querySelector('#fin-new-category');
          var val = (input.value || '').trim();
          if (!val) return;
          var custom = getCustomCategories();
          if (!custom.includes(val)) {
            custom.push(val);
            FreedomOS.mutate('finance.customCategories', custom);
          }
          input.value = '';
        });
      }

      var saveTargetsBtn = container.querySelector('#fin-save-targets');
      if (saveTargetsBtn) {
        saveTargetsBtn.addEventListener('click', function() {
          var rev = parseFloat((container.querySelector('#fin-rev-target') || {}).value) || 0;
          var exp = parseFloat((container.querySelector('#fin-exp-budget') || {}).value) || 0;
          var now = new Date();
          var monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
          var targets = getMonthlyTargets();
          var idx = targets.findIndex(function(t) { return t.month === monthKey; });
          var newTarget = { month: monthKey, revenueTarget: rev, expenseBudget: exp };
          if (idx >= 0) targets[idx] = newTarget;
          else targets.push(newTarget);
          FreedomOS.mutate('finance.monthlyTargets', targets);
          FreedomOS.toast('Targets updated', 'success', 2000);
        });
      }
    },

    onUnmount: function(container) {
      if (uiState.chartResizeHandler) {
        window.removeEventListener('resize', uiState.chartResizeHandler);
        uiState.chartResizeHandler = null;
      }
      if (uiState.refreshListener) {
        uiState.refreshListener();
        uiState.refreshListener = null;
      }
      uiState.editingId = null;
    }
  };

  FreedomOS.registerModule(module);
})();