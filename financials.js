/* ═══════════════════════════════════════════
   NEXORA FINANCIALS — Portal JS
   ═══════════════════════════════════════════ */

const API_BASE = 'https://nexora-api-sskg.onrender.com/api';

// ── State ──
let currentUser = null;
let currentPage = 'dashboard';
let contributorsCache = [];
let payoutsCache = [];

// ── Helpers ──
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function money(n) {
  const v = parseFloat(n || 0);
  return '$' + v.toFixed(2);
}
function num(n) {
  return parseInt(n || 0, 10).toLocaleString();
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function pillClass(status) {
  return String(status || '').toLowerCase().replace(/\s+/g, '_');
}
function initials(name) {
  return String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Fetch wrapper ──
async function api(path, options = {}) {
  const opts = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);

  const res = await fetch(API_BASE + path, opts);
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── Toast ──
function toast(msg, type = 'success') {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(60px)';
    el.style.transition = 'all 0.25s';
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

// ── Modal ──
function openModal({ title, body, footer, wide = false }) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal ${wide ? 'wide' : ''}" onclick="event.stopPropagation()">
        <div class="modal-head">
          <div class="modal-title">${title}</div>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>
  `;
}
function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── Loader HTML ──
function loaderHTML(text = 'Loading...') {
  return `<div class="loader"><div class="spinner"></div><div>${esc(text)}</div></div>`;
}
function emptyHTML(icon, title, sub) {
  return `
    <div class="empty">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${esc(title)}</div>
      ${sub ? `<div class="empty-sub">${esc(sub)}</div>` : ''}
    </div>
  `;
}

// ═══════════ AUTH ═══════════
async function bootSession() {
  try {
    const { user } = await api('/auth/me');
    const allowed = ['finance_admin', 'finance_manager', 'super_admin'];
    if (!allowed.includes(user.role)) {
      currentUser = null;
      return false;
    }
    currentUser = user;
    return true;
  } catch (e) {
    currentUser = null;
    return false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const flash = document.getElementById('loginFlash');
  flash.innerHTML = '';
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in...';

  try {
    await api('/auth/login', {
      method: 'POST',
      body: {
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      },
    });

    const ok = await bootSession();
    if (!ok) {
      flash.innerHTML = '<div class="flash flash-danger">Your account does not have finance access.</div>';
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Sign In';
      return;
    }

    showApp();
    toast('Welcome back, ' + (currentUser.full_name || '').split(' ')[0], 'success');
  } catch (err) {
    flash.innerHTML = `<div class="flash flash-danger">${esc(err.data?.error || err.message)}</div>`;
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Sign In';
  }
}

async function handleLogout() {
  if (!confirm('Sign out of the Financials portal?')) return;
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}

// ═══════════ APP SHELL ═══════════
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  document.getElementById('userName').textContent = currentUser.full_name || currentUser.email;
  document.getElementById('userRole').textContent = currentUser.role.replace(/_/g, ' ');
  document.getElementById('userAvatar').textContent = initials(currentUser.full_name || currentUser.email);

  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => {
      const page = el.dataset.page;
      if (page) navigateTo(page);
      if (window.innerWidth <= 900) toggleSidebar();
    };
  });

  navigateTo('dashboard');
  refreshPendingPayoutBadge();
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('show');
}

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  contributors: 'Contributors',
  ledger: 'Ledger',
  payouts: 'Payouts',
  reports: 'Revenue Reports',
  audit: 'Audit Logs',
  'revenue-config': 'Revenue Split Configuration',
  'contributor-detail': 'Contributor Detail',
};

function navigateTo(page, params = {}) {
  currentPage = page;
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const content = document.getElementById('content');
  content.innerHTML = loaderHTML();

  switch (page) {
    case 'dashboard':       renderDashboard(); break;
    case 'contributors':    renderContributors(); break;
    case 'contributor-detail': renderContributorDetail(params.id); break;
    case 'ledger':          renderLedgerPage(); break;
    case 'payouts':         renderPayouts(); break;
    case 'reports':         renderReports(); break;
    case 'audit':           renderAudit(); break;
    case 'revenue-config':  renderRevenueConfig(); break;
    default:                content.innerHTML = emptyHTML('❓', 'Page not found');
  }
  window.scrollTo({ top: 0 });
}

async function refreshPendingPayoutBadge() {
  try {
    const { payouts } = await api('/financials/payouts?status=pending');
    const badge = document.getElementById('pendingPayoutBadge');
    if (badge) badge.textContent = payouts.length;
  } catch (e) {}
}

// ═══════════ DASHBOARD ═══════════
async function renderDashboard() {
  const c = document.getElementById('content');
  try {
    const d = await api('/financials/dashboard');

    c.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi gold">
          <div class="kpi-label">Total Revenue</div>
          <div class="kpi-value">${money(d.total_revenue)}</div>
          <div class="kpi-sub">All completed course payments</div>
        </div>
        <div class="kpi green">
          <div class="kpi-label">Contributor Earnings</div>
          <div class="kpi-value">${money(d.contributor_earnings)}</div>
          <div class="kpi-sub">70% share (all time)</div>
        </div>
        <div class="kpi purple">
          <div class="kpi-label">Nexora Revenue</div>
          <div class="kpi-value">${money(d.nexora_revenue)}</div>
          <div class="kpi-sub">30% share (all time)</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Contributors</div>
          <div class="kpi-value">${num(d.contributor_count)}</div>
          <div class="kpi-sub">With ledger activity</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi amber">
          <div class="kpi-label">Pending Payouts</div>
          <div class="kpi-value">${money(d.pending_payouts.total)}</div>
          <div class="kpi-sub">${num(d.pending_payouts.count)} request(s) in queue</div>
        </div>
        <div class="kpi green">
          <div class="kpi-label">Paid Out</div>
          <div class="kpi-value">${money(d.paid_out.total)}</div>
          <div class="kpi-sub">${num(d.paid_out.count)} completed payout(s)</div>
        </div>
        <div class="kpi red">
          <div class="kpi-label">Failed / Rejected</div>
          <div class="kpi-value">${money(d.failed_payouts.total)}</div>
          <div class="kpi-sub">${num(d.failed_payouts.count)} problem(s)</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Default Split</div>
          <div class="kpi-value">${d.default_split.contributor}/${d.default_split.nexora}</div>
          <div class="kpi-sub">Contributor / Nexora</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Quick Actions</div>
        </div>
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="navigateTo('payouts')">Review Payouts</button>
          <button class="btn btn-outline" onclick="navigateTo('contributors')">View Contributors</button>
          <button class="btn btn-outline" onclick="navigateTo('reports')">Revenue Reports</button>
          <button class="btn btn-outline" onclick="navigateTo('audit')">Audit Logs</button>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = emptyHTML('⚠️', 'Failed to load dashboard', err.message);
  }
}

// ═══════════ CONTRIBUTORS ═══════════
async function renderContributors() {
  const c = document.getElementById('content');
  try {
    const { contributors } = await api('/financials/contributors');
    contributorsCache = contributors;

    const totals = contributors.reduce((acc, x) => ({
      available: acc.available + parseFloat(x.available_balance || 0),
      pending:   acc.pending   + parseFloat(x.pending_balance || 0),
      earned:    acc.earned    + parseFloat(x.total_earned || 0),
      paid:      acc.paid      + parseFloat(x.total_paid || 0),
    }), { available: 0, pending: 0, earned: 0, paid: 0 });

    c.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi green">
          <div class="kpi-label">Available to Pay</div>
          <div class="kpi-value">${money(totals.available)}</div>
        </div>
        <div class="kpi amber">
          <div class="kpi-label">Pending (Hold)</div>
          <div class="kpi-value">${money(totals.pending)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Total Earned</div>
          <div class="kpi-value">${money(totals.earned)}</div>
        </div>
        <div class="kpi purple">
          <div class="kpi-label">Total Paid</div>
          <div class="kpi-value">${money(totals.paid)}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Active Contributors (${contributors.length})</div>
          <input type="text" placeholder="🔍 Search name or email" oninput="filterContributors(this.value)"
                 style="padding:8px 14px;border:1.5px solid var(--border);border-radius:10px;font-family:inherit;min-width:220px">
        </div>
        <div class="panel-body tight">
          <div class="table-wrap">
            <table id="contribTable">
              <thead>
                <tr>
                  <th>Contributor</th>
                  <th>Email</th>
                  <th class="right">Available</th>
                  <th class="right">Pending</th>
                  <th class="right">Total Earned</th>
                  <th class="right">Total Paid</th>
                  <th class="right">Courses</th>
                  <th class="right">Open Payouts</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${contributors.length === 0
                  ? `<tr><td colspan="9">${emptyHTML('👥', 'No active contributors yet')}</td></tr>`
                  : contributors.map(renderContribRow).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = emptyHTML('⚠️', 'Failed to load contributors', err.message);
  }
}

function renderContribRow(u) {
  return `
    <tr data-search="${esc((u.full_name + ' ' + u.email).toLowerCase())}">
      <td><strong>${esc(u.full_name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td class="right mono" style="color:var(--green);font-weight:700">${money(u.available_balance)}</td>
      <td class="right mono" style="color:var(--amber);font-weight:600">${money(u.pending_balance)}</td>
      <td class="right mono">${money(u.total_earned)}</td>
      <td class="right mono">${money(u.total_paid)}</td>
      <td class="right">${num(u.course_count)}</td>
      <td class="right">${u.open_payouts > 0 ? `<span class="pill pending">${u.open_payouts}</span>` : '—'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn view" title="View" onclick="navigateTo('contributor-detail', { id: '${u.id}' })">👁️</button>
          ${currentUser.role !== 'finance_admin' && parseFloat(u.available_balance) > 0
            ? `<button class="icon-btn approve" title="Request payout" onclick="openPayoutRequestModal('${u.id}', '${esc(u.full_name)}', ${u.available_balance})">💸</button>`
            : ''}
        </div>
      </td>
    </tr>
  `;
}

function filterContributors(term) {
  const t = String(term || '').toLowerCase().trim();
  document.querySelectorAll('#contribTable tbody tr').forEach(tr => {
    const s = tr.getAttribute('data-search') || '';
    tr.style.display = !t || s.includes(t) ? '' : 'none';
  });
}

// ═══════════ CONTRIBUTOR DETAIL ═══════════
async function renderContributorDetail(id) {
  const c = document.getElementById('content');
  try {
    const [detail, ledgerResp] = await Promise.all([
      api('/financials/contributors/' + id),
      api('/financials/contributors/' + id + '/ledger?limit=100'),
    ]);

    const u = detail.contributor;
    const b = detail.balances;
    const entries = ledgerResp.entries;

    c.innerHTML = `
      <div style="margin-bottom:1.25rem">
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('contributors')">← Back to Contributors</button>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>${esc(u.full_name)}</div>
          ${currentUser.role !== 'finance_admin' && parseFloat(b.available_balance) > 0
            ? `<button class="btn btn-success btn-sm" onclick="openPayoutRequestModal('${u.id}', '${esc(u.full_name)}', ${b.available_balance})">💸 Request Payout</button>`
            : ''}
        </div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-bottom:1.25rem">
            <div><div class="kpi-label">Email</div><div>${esc(u.email)}</div></div>
            <div><div class="kpi-label">Phone</div><div>${esc(u.phone || '—')}</div></div>
            <div><div class="kpi-label">Country</div><div>${esc(u.country || '—')}</div></div>
            <div><div class="kpi-label">Joined</div><div>${fmtDate(u.created_at)}</div></div>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi green">
          <div class="kpi-label">Available</div>
          <div class="kpi-value">${money(b.available_balance)}</div>
        </div>
        <div class="kpi amber">
          <div class="kpi-label">Pending (Hold)</div>
          <div class="kpi-value">${money(b.pending_balance)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Total Earned</div>
          <div class="kpi-value">${money(b.total_earned)}</div>
        </div>
        <div class="kpi purple">
          <div class="kpi-label">Total Paid</div>
          <div class="kpi-value">${money(b.total_paid)}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Ledger (last 100 entries)</div>
        </div>
        <div class="panel-body tight">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Type</th>
                  <th>Course</th>
                  <th class="right">Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${entries.length === 0
                  ? `<tr><td colspan="6">${emptyHTML('📒', 'No ledger entries yet')}</td></tr>`
                  : entries.map(e => `
                    <tr>
                      <td class="mono">${esc(e.entry_ref)}</td>
                      <td><span class="pill ${e.entry_type.startsWith('payout') ? 'processing' : e.entry_type.includes('refund') ? 'rejected' : 'paid'}">${esc(e.entry_type.replace(/_/g, ' '))}</span></td>
                      <td>${esc(e.course_title || '—')}</td>
                      <td class="right mono">${money(e.amount)}</td>
                      <td>${e.is_pending ? '<span class="pill pending">Pending</span>' : '<span class="pill paid">Available</span>'}</td>
                      <td>${fmtDateTime(e.created_at)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${detail.payouts.length > 0 ? `
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><span class="dot"></span>Payout History</div>
          </div>
          <div class="panel-body tight">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th class="right">Amount</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  ${detail.payouts.map(p => `
                    <tr>
                      <td class="mono">${esc(p.payout_ref)}</td>
                      <td class="right mono">${money(p.amount)}</td>
                      <td><span class="pill ${pillClass(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span></td>
                      <td>${fmtDateTime(p.requested_at)}</td>
                      <td class="mono">${esc(p.payment_reference || '—')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  } catch (err) {
    c.innerHTML = emptyHTML('⚠️', 'Failed to load contributor', err.message);
  }
}

// ═══════════ LEDGER PAGE (global) ═══════════
async function renderLedgerPage() {
  const c = document.getElementById('content');
  try {
    // Reuse contributors — pick one to view ledger
    const { contributors } = await api('/financials/contributors');
    contributorsCache = contributors;

    c.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Select a contributor</div>
        </div>
        <div class="panel-body">
          <select onchange="if(this.value) navigateTo('contributor-detail', {id:this.value})"
                  style="padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;font-family:inherit;min-width:280px;font-size:0.95rem">
            <option value="">— Choose a contributor —</option>
            ${contributors.map(u => `<option value="${u.id}">${esc(u.full_name)} — ${money(u.available_balance)} available</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = emptyHTML('⚠️', 'Failed to load', err.message);
  }
}

// ═══════════ PAYOUTS ═══════════
async function renderPayouts() {
  const c = document.getElementById('content');
  const tabs = [
    { key: 'pending',       label: 'Pending' },
    { key: 'approved',      label: 'Approved' },
    { key: 'processing',    label: 'Processing' },
    { key: 'paid',          label: 'Paid' },
    { key: 'rejected',      label: 'Rejected' },
    { key: 'all',           label: 'All' },
  ];

  c.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><span class="dot"></span>Payout Requests</div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          ${tabs.map(t => `<button class="btn btn-outline btn-sm" data-ptab="${t.key}" onclick="loadPayoutsTab('${t.key}')">${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="panel-body tight" id="payoutsList">
        ${loaderHTML()}
      </div>
    </div>
  `;

  loadPayoutsTab('pending');
}

async function loadPayoutsTab(key) {
  document.querySelectorAll('[data-ptab]').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.ptab === key);
    b.classList.toggle('btn-outline', b.dataset.ptab !== key);
  });

  const box = document.getElementById('payoutsList');
  box.innerHTML = loaderHTML();

  try {
    const { payouts } = await api('/financials/payouts?status=' + key);
    payoutsCache = payouts;

    if (payouts.length === 0) {
      box.innerHTML = emptyHTML('💸', 'No payouts in this category');
      return;
    }

    box.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Contributor</th>
              <th class="right">Amount</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Destination</th>
              <th>Reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${payouts.map(p => `
              <tr>
                <td class="mono">${esc(p.payout_ref)}</td>
                <td><strong>${esc(p.contributor_name)}</strong><br><span style="font-size:0.78rem;color:var(--text-soft)">${esc(p.contributor_email)}</span></td>
                <td class="right mono" style="font-weight:700">${money(p.amount)}</td>
                <td><span class="pill ${pillClass(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span></td>
                <td>${fmtDateTime(p.requested_at)}</td>
                <td>${esc(p.destination_method || '—')}${p.destination_label ? '<br><span style="font-size:0.75rem;color:var(--text-soft)">' + esc(p.destination_label) + '</span>' : ''}</td>
                <td class="mono">${esc(p.payment_reference || '—')}</td>
                <td>
                  <div class="row-actions">
                    ${(p.status === 'pending' || p.status === 'under_review') && currentUser.role !== 'finance_admin'
                      ? `<button class="icon-btn approve" title="Approve" onclick="approvePayout(${p.id})">✓</button>
                         <button class="icon-btn reject" title="Reject" onclick="openRejectPayoutModal(${p.id})">✕</button>`
                      : ''}
                    ${(p.status === 'approved' || p.status === 'processing') && currentUser.role !== 'finance_admin'
                      ? `<button class="icon-btn paid" title="Mark as paid" onclick="openMarkPaidModal(${p.id})">💵</button>`
                      : ''}
                    <button class="icon-btn view" title="Details" onclick="viewPayoutDetail(${p.id})">👁️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    box.innerHTML = emptyHTML('⚠️', 'Failed to load payouts', err.message);
  }
}

function viewPayoutDetail(id) {
  const p = payoutsCache.find(x => x.id === id);
  if (!p) return;
  openModal({
    title: 'Payout Details — ' + esc(p.payout_ref),
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;font-size:0.9rem">
        <div><div class="kpi-label">Contributor</div><div>${esc(p.contributor_name)}</div></div>
        <div><div class="kpi-label">Email</div><div>${esc(p.contributor_email)}</div></div>
        <div><div class="kpi-label">Amount</div><div class="mono" style="font-weight:700">${money(p.amount)}</div></div>
        <div><div class="kpi-label">Currency</div><div>${esc(p.currency)}</div></div>
        <div><div class="kpi-label">Status</div><div><span class="pill ${pillClass(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span></div></div>
        <div><div class="kpi-label">Requested</div><div>${fmtDateTime(p.requested_at)}</div></div>
        <div><div class="kpi-label">Reviewed</div><div>${fmtDateTime(p.reviewed_at)}</div></div>
        <div><div class="kpi-label">Approved</div><div>${fmtDateTime(p.approved_at)}</div></div>
        <div><div class="kpi-label">Marked Paid</div><div>${fmtDateTime(p.marked_paid_at)}</div></div>
        <div><div class="kpi-label">Payment Reference</div><div class="mono">${esc(p.payment_reference || '—')}</div></div>
        <div><div class="kpi-label">Destination</div><div>${esc(p.destination_method || '—')} ${esc(p.destination_label || '')}</div></div>
      </div>
      ${p.notes ? `<div style="margin-top:1rem"><div class="kpi-label">Notes</div><div>${esc(p.notes)}</div></div>` : ''}
      ${p.rejection_reason ? `<div style="margin-top:1rem"><div class="kpi-label">Rejection Reason</div><div style="color:var(--red)">${esc(p.rejection_reason)}</div></div>` : ''}
    `,
    footer: `<button class="btn btn-outline" onclick="closeModal()">Close</button>`,
  });
}

// ── Actions on payouts ──
async function approvePayout(id) {
  if (!confirm('Approve this payout?')) return;
  try {
    await api('/financials/payouts/' + id + '/approve', { method: 'POST' });
    toast('Payout approved', 'success');
    loadPayoutsTab('pending');
    refreshPendingPayoutBadge();
  } catch (err) {
    toast(err.data?.error || err.message, 'error');
  }
}

function openRejectPayoutModal(id) {
  openModal({
    title: 'Reject Payout',
    body: `
      <div class="form-group">
        <label>Reason for rejection *</label>
        <textarea id="rejectReason" placeholder="Why is this payout being rejected?"></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmRejectPayout(${id})">Reject</button>
    `,
  });
}

async function confirmRejectPayout(id) {
  const reason = document.getElementById('rejectReason').value.trim();
  if (!reason) { toast('Reason is required', 'error'); return; }
  try {
    await api('/financials/payouts/' + id + '/reject', {
      method: 'POST',
      body: { reason },
    });
    toast('Payout rejected', 'warning');
    closeModal();
    loadPayoutsTab('pending');
    refreshPendingPayoutBadge();
  } catch (err) {
    toast(err.data?.error || err.message, 'error');
  }
}

function openMarkPaidModal(id) {
  openModal({
    title: 'Mark Payout as Paid',
    body: `
      <div class="form-group">
        <label>Payment Reference</label>
        <input type="text" id="markPaidRef" placeholder="e.g. M-Pesa receipt, bank ref, PayPal txn id">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="markPaidNotes" placeholder="Optional notes"></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="confirmMarkPaid(${id})">Mark as Paid</button>
    `,
  });
}

async function confirmMarkPaid(id) {
  const payment_reference = document.getElementById('markPaidRef').value.trim();
  const notes = document.getElementById('markPaidNotes').value.trim();
  try {
    await api('/financials/payouts/' + id + '/mark-paid', {
      method: 'POST',
      body: { payment_reference: payment_reference || null, notes: notes || null },
    });
    toast('Payout marked as paid', 'success');
    closeModal();
    loadPayoutsTab('approved');
  } catch (err) {
    toast(err.data?.error || err.message, 'error');
  }
}

// ── Create payout request ──
function openPayoutRequestModal(contributorId, name, availableBalance) {
  openModal({
    title: 'Request Payout — ' + esc(name),
    body: `
      <div class="flash flash-info" style="margin-bottom:1rem">
        Available balance: <strong>${money(availableBalance)}</strong>
      </div>
      <div class="form-group">
        <label>Amount (USD) *</label>
        <input type="number" id="newPayoutAmount" step="0.01" min="0.01" max="${availableBalance}"
               placeholder="0.00" value="${parseFloat(availableBalance).toFixed(2)}">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="newPayoutNotes" placeholder="Optional notes"></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitPayoutRequest('${contributorId}')">Create Request</button>
    `,
  });
}

async function submitPayoutRequest(contributorId) {
  const amount = parseFloat(document.getElementById('newPayoutAmount').value);
  const notes = document.getElementById('newPayoutNotes').value.trim();
  if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }

  try {
    await api('/financials/payouts', {
      method: 'POST',
      body: { contributor_id: contributorId, amount, notes: notes || null },
    });
    toast('Payout request created', 'success');
    closeModal();
    refreshPendingPayoutBadge();
    if (currentPage === 'payouts') loadPayoutsTab('pending');
  } catch (err) {
    toast(err.data?.error || err.message, 'error');
  }
}

// ═══════════ REPORTS ═══════════
async function renderReports() {
  const c = document.getElementById('content');
  try {
    const r = await api('/financials/reports/revenue');

    c.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Revenue by Month</div>
        </div>
        <div class="panel-body tight">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Month</th><th class="right">Nexora (30%)</th><th class="right">Contributors (70%)</th><th class="right">Total</th></tr>
              </thead>
              <tbody>
                ${r.by_month.length === 0
                  ? `<tr><td colspan="4">${emptyHTML('📈', 'No revenue yet')}</td></tr>`
                  : r.by_month.map(m => {
                    const n = parseFloat(m.nexora || 0);
                    const cb = parseFloat(m.contributor || 0);
                    return `<tr>
                      <td>${fmtDate(m.month)}</td>
                      <td class="right mono">${money(n)}</td>
                      <td class="right mono">${money(cb)}</td>
                      <td class="right mono" style="font-weight:700">${money(n + cb)}</td>
                    </tr>`;
                  }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Top Courses</div>
        </div>
        <div class="panel-body tight">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Course</th><th>Code</th><th class="right">Nexora</th><th class="right">Contributor</th></tr>
              </thead>
              <tbody>
                ${r.by_course.length === 0
                  ? `<tr><td colspan="4">${emptyHTML('📚', 'No course revenue yet')}</td></tr>`
                  : r.by_course.map(x => `
                    <tr>
                      <td><strong>${esc(x.title)}</strong></td>
                      <td class="mono">${esc(x.code || '—')}</td>
                      <td class="right mono">${money(x.nexora)}</td>
                      <td class="right mono">${money(x.contributor)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Top Contributors</div>
        </div>
        <div class="panel-body tight">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Contributor</th><th>Email</th><th class="right">Total Earned</th></tr>
              </thead>
              <tbody>
                ${r.by_contributor.length === 0
                  ? `<tr><td colspan="3">${emptyHTML('👤', 'No contributors yet')}</td></tr>`
                  : r.by_contributor.map(x => `
                    <tr>
                      <td><strong>${esc(x.full_name)}</strong></td>
                      <td>${esc(x.email)}</td>
                      <td class="right mono">${money(x.earned)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = emptyHTML('⚠️', 'Failed to load reports', err.message);
  }
}

// ═══════════ AUDIT ═══════════
async function renderAudit() {
  const c = document.getElementById('content');
  try {
    const { logs } = await api('/financials/audit-logs?limit=300');

    c.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="dot"></span>Audit Trail (${logs.length})</div>
        </div>
        <div class="panel-body tight">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th class="right">Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${logs.length === 0
                  ? `<tr><td colspan="6">${emptyHTML('🔍', 'No audit entries yet')}</td></tr>`
                  : logs.map(l => `
                    <tr>
                      <td>${fmtDateTime(l.created_at)}</td>
                      <td>
                        <strong>${esc(l.actor_name || '—')}</strong><br>
                        <span style="font-size:0.75rem;color:var(--text-soft)">${esc(l.actor_role || '')}</span>
                      </td>
                      <td class="mono">${esc(l.action)}</td>
                      <td class="mono">${esc(l.entity_type || '')}${l.entity_id ? ' #' + esc(l.entity_id) : ''}</td>
                      <td class="right mono">${l.amount != null ? money(l.amount) : '—'}</td>
                      <td style="max-width:300px;font-size:0.85rem">${esc(l.notes || '')}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = emptyHTML('⚠️', 'Failed to load audit logs', err.message);
  }
}

// ═══════════ REVENUE CONFIG ═══════════
async function renderRevenueConfig() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><span class="dot"></span>Default Revenue Split</div>
      </div>
      <div class="panel-body">
        <div class="flash flash-info" style="margin-bottom:1rem">
          The platform default is <strong>70% contributor / 30% Nexora</strong>.
          To override a specific course, use the endpoint below or the dashboard of your main admin site.
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Contributor %</label>
            <input type="number" value="70" disabled>
          </div>
          <div class="form-group">
            <label>Nexora %</label>
            <input type="number" value="30" disabled>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><span class="dot"></span>Override a Course Split</div>
      </div>
      <div class="panel-body">
        <div class="form-row">
          <div class="form-group">
            <label>Course ID (UUID)</label>
            <input type="text" id="cfgCourseId" placeholder="paste course UUID">
          </div>
          <div class="form-group">
            <label>&nbsp;</label>
            <button class="btn btn-primary" onclick="openOverrideSplitModal()">Configure</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openOverrideSplitModal() {
  const courseId = document.getElementById('cfgCourseId').value.trim();
  if (!courseId) { toast('Paste a course ID first', 'error'); return; }

  openModal({
    title: 'Override Split — ' + esc(courseId),
    body: `
      <div class="form-row">
        <div class="form-group">
          <label>Contributor %</label>
          <input type="number" id="ovContrib" value="70" min="0" max="100" step="1" oninput="syncOvSplit('c')">
        </div>
        <div class="form-group">
          <label>Nexora %</label>
          <input type="number" id="ovNexora" value="30" min="0" max="100" step="1" oninput="syncOvSplit('n')">
        </div>
      </div>
      <div class="form-group">
        <label>Reason</label>
        <textarea id="ovReason" placeholder="Why is this override needed?"></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitOverrideSplit('${courseId}')">Save Override</button>
    `,
  });
}

function syncOvSplit(source) {
  const c = parseInt(document.getElementById('ovContrib').value) || 0;
  const n = parseInt(document.getElementById('ovNexora').value) || 0;
  if (source === 'c') document.getElementById('ovNexora').value = Math.max(0, 100 - c);
  else               document.getElementById('ovContrib').value = Math.max(0, 100 - n);
}

async function submitOverrideSplit(courseId) {
  const contributor_share_percent = parseFloat(document.getElementById('ovContrib').value);
  const nexora_share_percent = parseFloat(document.getElementById('ovNexora').value);
  const override_reason = document.getElementById('ovReason').value.trim();

  if (contributor_share_percent + nexora_share_percent !== 100) {
    toast('Shares must sum to 100', 'error');
    return;
  }
  try {
    await api('/financials/revenue-config/course/' + courseId, {
      method: 'POST',
      body: { contributor_share_percent, nexora_share_percent, override_reason: override_reason || null },
    });
    toast('Override saved', 'success');
    closeModal();
  } catch (err) {
    toast(err.data?.error || err.message, 'error');
  }
}

// ═══════════ BOOT ═══════════
(async function boot() {
  const ok = await bootSession();
  if (ok) showApp();
})();
