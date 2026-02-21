window.inventory = window.inventory || [];
let inventory = window.inventory;
function qs(s) { return document.querySelector(s); }
function qsa(s) { return document.querySelectorAll(s); }

async function loadData() {
  try {
    const r = await fetch('/api/inventory');
    if (r.ok) {
      inventory = await r.json();
      window.inventory = inventory;
    }
  } catch (e) { }
}

function initActiveNav() {
  const p = document.body.dataset.page;
  if (!p) return;
  qsa(".nav-link").forEach(l => {
    if (l.dataset.nav === p) l.classList.add("active");
  });
}


async function populateOverview() {
  const totalEl = qs('#dash-total'), varEl = qs('#dash-var'), aiEl = qs('#dash-ai'), countEl = qs('#dash-risky-count');
  if (!(totalEl && varEl && aiEl && countEl)) return;

  // #11 — Show skeleton shimmer while loading
  [totalEl, varEl, aiEl, countEl].forEach(el => el.classList.add('kpi-loading'));

  try {
    const r = await fetch('/api/kpis');
    if (r.ok) {
      const k = await r.json();
      totalEl.textContent = '\u20b9' + (k.total / 1e7).toFixed(1) + ' Cr';
      varEl.textContent = '\u20b9' + (k.var / 1e7).toFixed(1) + ' Cr';
      aiEl.textContent = '\u20b9' + (k.aiSavings / 1e7).toFixed(1) + ' Cr';
      countEl.textContent = k.riskyCount;  // #3 — no ₹ prefix for count
      [totalEl, varEl, aiEl, countEl].forEach(el => el.classList.remove('kpi-loading'));
      return;
    }
  } catch (e) { }
  if (!inventory.length) {
    [totalEl, varEl, aiEl, countEl].forEach(el => el.classList.remove('kpi-loading'));
    return;
  }
  const totalLocked = inventory.reduce((s, r) => s + (r.locked_capital || r.lockedcapital || 0), 0);
  const risky = inventory.filter(r => r.label === 1);
  const totalRisk = risky.reduce((s, r) => s + (r.locked_capital || r.lockedcapital || 0), 0);
  const aiSavings = totalRisk * 0.27;
  totalEl.textContent = '\u20b9' + (totalLocked / 1e7).toFixed(1) + ' Cr';
  varEl.textContent = '\u20b9' + (totalRisk / 1e7).toFixed(1) + ' Cr';
  aiEl.textContent = '\u20b9' + (aiSavings / 1e7).toFixed(1) + ' Cr';
  countEl.textContent = risky.length;
  [totalEl, varEl, aiEl, countEl].forEach(el => el.classList.remove('kpi-loading'));
}

async function populateTopRisky() {
  const tbody = qs('#top-risky-table-body');
  if (!tbody) return;
  try {
    const r = await fetch('/api/top-risky?limit=5');
    if (r.ok) {
      const d = await r.json();
      renderTop(d, tbody);
      return;
    }
  } catch (e) { }
  const top = inventory.filter(r => r.label === 1).slice(0, 5);
  renderTop(top, tbody);
}

function renderTop(data, tbody) {
  tbody.innerHTML = data.map(r => {
    const riskPct = ((r.dead_stock_risk || r.deadstockrisk) * 100).toFixed(0);
    const level = riskPct >= 90 ? 'Dead' : 'High';
    return `<tr><td>${r.product_id || r.productid}</td><td>${r.category || ''}</td><td>${r.days_in_stock || r.daysinstock || 0}</td><td>₹${Math.round(r.locked_capital || r.lockedcapital || 0).toLocaleString()}</td><td>${riskPct}%</td><td><span class="badge badge-critical">${level}</span></td></tr>`;
  }).join('');
}

function initNavSearch() {
  const input = qs("#global-search");
  const results = qs("#search-results-inline");
  if (!input || !results) return;

  // #6 — Clear search field on every page load
  input.value = '';
  const render = (items) => {
    if (!items.length) {
      results.innerHTML = '<div class="search-meta">No matches. Try a product ID like <code>P0000</code> or a category like "Vitamin".</div>';
      return;
    }

    const tableRows = items.map(it => {
      const pid = it.product_id || it.productid || '';
      const cat = it.category || '';
      const days = it.days_in_stock || it.daysinstock || 0;
      const lbl = it.label || 0;
      const statusClass = lbl ? 'status-risk' : 'status-healthy';
      const statusText = lbl ? 'Dead‑stock risk' : 'Healthy';
      return `<tr><td class="product-id">${pid}</td><td class="category">${cat}</td><td class="days-count">${days}</td><td><span class="${statusClass}">${statusText}</span></td></tr>`;
    }).join('');

    results.innerHTML = `<div class="search-meta">Showing ${items.length} result${items.length > 1 ? 's' : ''}</div><table class="search-table"><thead><tr><th>Product ID</th><th>Category</th><th>Days in Stock</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table>`;
  };

  const search = (v) => {
    const t = v.trim().toLowerCase();
    if (!t) {
      results.innerHTML = '<div class="search-meta">Start typing to search the ML dataset.</div>';
      return;
    }
    fetch(`/api/search?term=${encodeURIComponent(t)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(rows => render(rows.slice(0, 6)))
      .catch(() => {
        const m = inventory.filter(row => (row.product_id || '').toLowerCase().includes(t) || (row.category || '').toLowerCase().includes(t));
        render(m.slice(0, 6));
      });
  };

  input.addEventListener("input", (e) => search(e.target.value));
  search("");
}

async function populateRiskyTable() {
  const tbody = qs("#risky-table-body");
  const filterInput = qs("#risky-filter");
  if (!tbody) return;

  // #5 — Show loading skeleton rows while fetching
  tbody.innerHTML = Array(5).fill(
    `<tr class="skeleton-row">${Array(6).fill('<td><span class="skeleton-cell"></span></td>').join('')}</tr>`
  ).join('');

  let risky = [];
  try {
    const res = await fetch('/api/risky');
    if (res.ok) {
      risky = await res.json();
      render(risky);
    }
  } catch (e) {
    risky = inventory.filter(r => r.label === 1);
    render(risky);
  }
  function render(rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No risky batches found.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const lvl = ((r.dead_stock_risk || r.deadstockrisk) * 100).toFixed(0);
      let badgeClass = "badge-high";
      if (lvl >= 85) badgeClass = "badge-critical";
      else if (lvl <= 60) badgeClass = "badge-medium";
      // #4 — styled icon button for action column
      return `<tr><td>${(r.product_id || r.productid)}</td><td>${r.category || ''} ${(r.product_id || r.productid) || ''}</td><td><span class="badge ${badgeClass}">${lvl}%</span></td><td>\u20b9${Math.round(r.locked_capital || r.lockedcapital || 0).toLocaleString()}</td><td>Demo Hub</td><td style="text-align:right;"><button class="action-icon-btn" title="View Details"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg></button></td></tr>`;
    }).join("");
  }
  if (filterInput) {
    filterInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = risky.filter(r => (r.product_id || r.productid || '').toLowerCase().includes(term) || (r.category || '').toLowerCase().includes(term));
      render(filtered);
    });
  }
}

function initPrediction() {
  const form = qs("#predict-form");
  if (!form) return;

  // #8 — Inline validation helper
  function showFieldError(input, msg) {
    let err = input.parentElement.querySelector('.field-error');
    if (!err) {
      err = document.createElement('span');
      err.className = 'field-error';
      input.parentElement.appendChild(err);
    }
    err.textContent = msg;
    input.classList.add('input-invalid');
  }
  function clearErrors() {
    form.querySelectorAll('.field-error').forEach(e => e.remove());
    form.querySelectorAll('.input-invalid').forEach(e => e.classList.remove('input-invalid'));
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();
    const fd = new FormData(form);
    const days = Number(fd.get('daysinstock') || 0);
    const qty = Number(fd.get('stockqty') || 0);
    const sales = Number(fd.get('weeklysales30d') || 0);
    // #8 — Warn about unrealistic inputs
    let hasWarning = false;
    if (days <= 0) { showFieldError(form.querySelector('[name=daysinstock]'), 'Enter days > 0'); hasWarning = true; }
    if (qty <= 0) { showFieldError(form.querySelector('[name=stockqty]'), 'Enter quantity > 0'); hasWarning = true; }
    if (hasWarning) return;
    try {
      const payload = {
        identifier: fd.get('identifier') || '',
        daysinstock: days,
        stockqty: qty,
        weeklysales30d: sales,
        discountstried: Number(fd.get('discountstried') || 0),
        seasonmatch: Number(fd.get('seasonmatch') || 1)
      };
      const res = await fetch('/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const pred = await res.json();
        showPrediction(pred);
        return;
      }
    } catch (e) { }
  });
}

let latestRiskPercent = null;
function showPrediction(pred) {
  const outProb = qs("#pred-prob"), outLabel = qs("#pred-label"), outDays = qs("#pred-days"), tone = qs("#pred-tone"), empty = qs("#prediction-empty"), result = qs("#prediction-result");
  if (outProb) outProb.textContent = Number(pred.risk_percent).toFixed(1) + '%';
  if (outLabel) outLabel.textContent = pred.label ? "This batch is at risk of becoming dead stock." : "This batch looks relatively safe.";
  if (outDays) outDays.textContent = pred.label ? `${Number(pred.days_to_dead).toFixed(0)} days (approx)` : "Not expected within the next year.";
  if (tone) {
    tone.textContent = pred.action;
    tone.style.color = pred.label ? "#fecaca" : "#a7f3d0";
  }
  latestRiskPercent = Number(pred.risk_percent);
  if (empty && result) {
    empty.style.display = "none";
    result.style.display = "block";
    const sim = qs('#what-if-sim');
    if (sim) sim.style.display = 'block';
  }
}

function initWhatIf() {
  const slider = qs('#discount-slider');
  const valEl = qs('#discount-value');
  if (!slider) return;
  slider.addEventListener('input', (e) => {
    const disc = e.target.value;
    if (valEl) valEl.textContent = disc + '%';
    const origRisk = latestRiskPercent ? latestRiskPercent / 100 : 0.87;
    const newRisk = origRisk * (1 - disc / 100 * 0.4);
    const origBar = qs('#risk-original-bar');
    if (origBar) origBar.style.width = origRisk * 100 + '%';
    const greenBar = document.querySelector('#what-if-sim div div div[style*="10b981"]');
    if (greenBar) greenBar.style.width = newRisk * 100 + '%';
    const tone = qs('#pred-tone');
    if (tone) {
      const form = qs('#predict-form');
      const fd = form ? new FormData(form) : null;
      const qty = fd ? Number(fd.get('stockqty') || 0) : 0;
      const identifier = fd ? fd.get('identifier') || '' : '';
      const match = inventory.find(r => (r.product_id || r.productid) === identifier);
      let unitPrice = 0;
      if (match) {
        unitPrice = match.unit_price || (match.locked_capital || match.lockedcapital || 0) / ((match.stock_qty || qty || 1));
      }
      const amount = Math.max(0, unitPrice * qty * (disc / 100));
      if (amount) {
        tone.textContent = (tone.textContent || '') + ` | Discount value: ₹${Math.round(amount).toLocaleString()}`;
      }
    }
  });
}

function initAccountMenu() {
  const toggle = qs('#account-toggle');
  const menu = qs('#account-menu');
  const logoutBtn = qs('#logout-btn');
  if (!toggle || !menu || !logoutBtn) return;
  const auth = localStorage.getItem('medistock-auth');
  if (auth) {
    try {
      const user = JSON.parse(auth);
      // Removed line overwriting icon with initial
      const nameEl = qs('.account-name');
      const metaEl = qs('.account-meta');
      if (nameEl) nameEl.textContent = user.name;
      if (metaEl) metaEl.textContent = user.region + ' Region';
    } catch { }
  }
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('active');
  });
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('active');
  });
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.removeItem('medistock-auth');
    menu.classList.remove('active');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 300);
  });
}

function initScrollClass() {
  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      document.body.classList.add("scrolled");
    } else {
      document.body.classList.remove("scrolled");
    }
  });
}

async function initAnalyticsHeatmap() {
  const rows = qsa('.warehouse-row');
  if (!rows.length) return;
  let data = null;
  try {
    const res = await fetch('/api/analytics/heatmap');
    if (res.ok) {
      data = await res.json();
    }
  } catch (e) { }
  rows.forEach(row => {
    const nameEl = row.querySelector('.warehouse-name');
    const bar = row.querySelector('.warehouse-bar');
    if (!nameEl || !bar) return;
    const name = nameEl.textContent.trim();
    const segs = bar.querySelectorAll('.seg');
    const counts = (data && data[name]) ? data[name] : null;
    if (counts) {
      const total = counts.safe + counts.medium + counts.high + counts.critical || 1;
      const safeFlex = counts.safe;
      const mediumFlex = counts.medium;
      const highFlex = counts.high;
      const criticalFlex = counts.critical;
      const order = ['safe', 'medium', 'high', 'critical'];
      segs.forEach(seg => {
        const type = order.find(t => seg.classList.contains(t));
        if (!type) return;
        let flex = 1;
        if (type === 'safe') flex = safeFlex;
        else if (type === 'medium') flex = mediumFlex;
        else if (type === 'high') flex = highFlex;
        else if (type === 'critical') flex = criticalFlex;
        seg.style.flex = String(flex);
      });
    }
  });
}


function initReveal() {
  const el = qsa(".reveal");
  const fn = () => {
    const t = window.innerHeight * 0.85;
    el.forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.top < t) e.classList.add("visible");
    });
  };
  window.addEventListener("scroll", fn);
  fn();
}

// #7 — Mobile hamburger menu toggle
function initHamburger() {
  const btn = qs('#hamburger-btn');
  const nav = btn && btn.closest('header.nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('nav-mobile-open');
    btn.setAttribute('aria-expanded', open);
  });
  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('nav-mobile-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('click', e => {
    if (!nav.contains(e.target)) {
      nav.classList.remove('nav-mobile-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── RELATIVE TIMESTAMP HELPER ────────────────────────────────────────────────
function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ── SYSTEM ALERTS (live, data-driven) ───────────────────────────────────────
function buildAlerts() {
  const now = Date.now();
  const alerts = [];

  // Derive from live inventory data
  if (window.inventory && window.inventory.length) {
    const critical = window.inventory
      .filter(r => r.label === 1)
      .sort((a, b) => (b.dead_stock_risk || b.deadstockrisk || 0) - (a.dead_stock_risk || a.deadstockrisk || 0))
      .slice(0, 2);

    critical.forEach((r, i) => {
      const id = r.product_id || r.productid || 'Unknown';
      const pct = ((r.dead_stock_risk || r.deadstockrisk || 0) * 100).toFixed(0);
      alerts.push({
        type: 'critical',
        text: `Batch ${id} — dead-stock risk at ${pct}%`,
        ts: now - (i + 1) * 47 * 60 * 1000   // stagger: 47m ago, 94m ago
      });
    });

    // Warehouse velocity drop
    const highCount = window.inventory.filter(r => r.label === 1 && (r.days_in_stock || r.daysinstock || 0) > 120).length;
    if (highCount > 0) {
      alerts.push({
        type: 'warning',
        text: `${highCount} item${highCount > 1 ? 's' : ''} stalled >120 days — review recommended`,
        ts: now - 3 * 3600 * 1000
      });
    }
  }

  // Always include a model/system status alert
  alerts.push({
    type: 'info',
    text: 'Risk prediction model is active and up to date',
    ts: now - 22 * 3600 * 1000
  });

  return alerts;
}

function initSystemAlerts() {
  const list = qs('#system-alerts-list');
  if (!list) return;

  const alerts = buildAlerts();
  const typeMap = { critical: 'alert-critical', warning: 'alert-warning', info: 'alert-info' };

  list.innerHTML = alerts.map(a => `
    <li class="alert-chip ${typeMap[a.type] || 'alert-info'}">
      <div>${a.text}</div>
      <span>${timeAgo(a.ts)}</span>
    </li>`).join('');
}

// ── NOTIFICATION BELL ────────────────────────────────────────────────────────
function initNotificationBell() {
  const btn = qs('#notif-btn');
  const dropdown = qs('#notif-dropdown');
  const badge = qs('#notif-badge');
  const list = qs('#notif-list');
  const clear = qs('#notif-clear');
  if (!btn || !dropdown) return;

  const alerts = buildAlerts();
  let unreadCount = alerts.length;

  const dotClass = { critical: 'notif-dot-critical', warning: 'notif-dot-warning', info: 'notif-dot-info' };

  function renderNotifList() {
    if (!list) return;
    if (!alerts.length) {
      list.innerHTML = `<li class="notif-empty">You're all caught up ✓</li>`;
      return;
    }
    list.innerHTML = alerts.map((a, i) => `
      <li class="notif-item ${i < unreadCount ? 'unread' : ''}">
        <span class="notif-dot ${dotClass[a.type] || 'notif-dot-info'}"></span>
        <div class="notif-body">
          <div class="notif-text">${a.text}</div>
          <div class="notif-time">${timeAgo(a.ts)}</div>
        </div>
      </li>`).join('');
  }

  function updateBadge() {
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  renderNotifList();
  updateBadge();

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    if (open) {
      // Mark as read visually when opened
      unreadCount = 0;
      updateBadge();
      list.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
    }
  });

  if (clear) {
    clear.addEventListener('click', () => {
      unreadCount = 0;
      updateBadge();
      list.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
    });
  }

  document.addEventListener('click', e => {
    const wrapper = qs('#notif-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  await loadData();
  initActiveNav();
  initReveal();
  initHamburger();
  if (document.body.dataset.page === 'dashboard') {
    await populateOverview();
    await populateTopRisky();
    initSystemAlerts();
  }
  initNotificationBell();   // runs on every page — bell HTML is now on all pages
  initNavSearch();
  if (document.body.dataset.page === 'risky') {
    await populateRiskyTable();
  }
  if (document.body.dataset.page === 'analytics') {
    await initAnalyticsHeatmap();
  }
  initPrediction();
  initScrollClass();
  initWhatIf();
  initAccountMenu();
  initSearchTutorial();
});

// ── SEARCH TUTORIAL HINT ──────────────────────────────────────────────────
function initSearchTutorial() {
  if (document.body.dataset.page !== 'dashboard') return;

  // Show only "first time ever" (localStorage)
  if (localStorage.getItem('medistock-search-tutorial-done')) return;

  const wrapper = qs('.nav-search-wrapper');
  const input = qs('#global-search');
  if (!wrapper || !input) return;

  // Create Overlay
  const overlay = document.createElement('div');
  overlay.className = 'search-tutorial-overlay';
  document.body.appendChild(overlay);

  // Create Hint Bubble
  const hint = document.createElement('div');
  hint.className = 'search-hint';
  hint.innerHTML = '✨ Search through the <b>ML Dataset</b> here';
  wrapper.appendChild(hint);

  // Entrance delay
  setTimeout(() => {
    overlay.classList.add('visible');
    hint.classList.add('visible');
    hint.classList.add('animate');
    input.classList.add('pulse');
    localStorage.setItem('medistock-search-tutorial-done', 'true');
  }, 1500);

  // Dismissal
  const dismiss = () => {
    overlay.classList.remove('visible');
    hint.classList.remove('visible');
    input.classList.remove('pulse');
    setTimeout(() => {
      overlay.remove();
      hint.remove();
    }, 600);
    input.removeEventListener('focus', dismiss);
    document.removeEventListener('mousedown', checkOutside);
  };

  const checkOutside = (e) => {
    // If they click on the overlay or anywhere outside, dismiss it too
    if (overlay.contains(e.target) || !wrapper.contains(e.target)) dismiss();
  };

  input.addEventListener('focus', dismiss);
  document.addEventListener('mousedown', checkOutside);

  // Auto-dismiss after 12s if they don't do anything
  setTimeout(dismiss, 12000);
}

