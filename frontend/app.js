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

async function populateOverview() {
  const totalEl = qs('#dash-total'), varEl = qs('#dash-var'), aiEl = qs('#dash-ai'), countEl = qs('#dash-risky-count');
  if (!(totalEl && varEl && aiEl && countEl)) return;
  try {
    const r = await fetch('/api/kpis');
    if (r.ok) {
      const k = await r.json();
      totalEl.textContent = (k.total / 1e7).toFixed(1) + ' Cr';
      varEl.textContent = (k.var / 1e7).toFixed(1) + ' Cr';
      aiEl.textContent = (k.aiSavings / 1e7).toFixed(1) + ' Cr';
      countEl.textContent = k.riskyCount;
      return;
    }
  } catch (e) { }
  if (!inventory.length) return;
  const totalLocked = inventory.reduce((s, r) => s + (r.locked_capital || r.lockedcapital || 0), 0);
  const risky = inventory.filter(r => r.label === 1);
  const totalRisk = risky.reduce((s, r) => s + (r.locked_capital || r.lockedcapital || 0), 0);
  const aiSavings = totalRisk * 0.27;
  totalEl.textContent = (totalLocked / 1e7).toFixed(1) + ' Cr';
  varEl.textContent = (totalRisk / 1e7).toFixed(1) + ' Cr';
  aiEl.textContent = (aiSavings / 1e7).toFixed(1) + ' Cr';
  countEl.textContent = risky.length;
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
    tbody.innerHTML = rows.map(r => {
      const lvl = ((r.dead_stock_risk || r.deadstockrisk) * 100).toFixed(0);
      let badgeClass = "badge-high";
      if (lvl >= 85) badgeClass = "badge-critical";
      else if (lvl <= 60) badgeClass = "badge-medium";
      return `<tr><td>B-${(r.product_id || r.productid).slice(1)}</td><td>${r.category || ''} ${(r.product_id || r.productid) || ''}</td><td><span class="badge ${badgeClass}">${lvl}%</span></td><td>₹${Math.round(r.locked_capital || r.lockedcapital || 0).toLocaleString()}</td><td>Demo Hub</td><td style="text-align:right;">↗</td></tr>`;
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
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const fd = new FormData(form);
      const payload = {
        identifier: fd.get('identifier') || '',
        daysinstock: Number(fd.get('daysinstock') || 0),
        stockqty: Number(fd.get('stockqty') || 0),
        weeklysales30d: Number(fd.get('weeklysales30d') || 0),
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
      toggle.textContent = user.name.charAt(0).toUpperCase();
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

document.addEventListener("DOMContentLoaded", async function () {
  await loadData();
  initActiveNav();
  initReveal();
  if (document.body.dataset.page === 'dashboard') {
    await populateOverview();
    await populateTopRisky();
  }
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
});
