requireLogin();

document.getElementById('logoutBtn').onclick = () => {
  clearSession();
  window.location.href = '/login.html';
};

const state = { page: 1, limit: 10, sort: 'name', order: 'asc', search: '', status: '' };

const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const pageSizeSel = document.getElementById('pageSize');
const rowsBody = document.getElementById('customerRows');
const pageInfo = document.getElementById('pageInfo');

document.getElementById('clockDate').value = todayStr();
document.getElementById('clockForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = document.getElementById('clockResult');
  try {
    const date = document.getElementById('clockDate').value;
    const response = await api('/clock', { method: 'POST', body: JSON.stringify({ date }) });
    result.textContent = `${response.notifications.length} delivery notification(s) queued for ${date}.`;
  } catch (error) {
    result.textContent = error.message;
  }
});

document.getElementById('importForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = document.getElementById('importResult');
  try {
    const customers = JSON.parse(document.getElementById('importJson').value);
    const report = await api('/import/customers', { method: 'POST', body: JSON.stringify({ customers }) });
    result.textContent = `Imported ${report.imported.length}; deduped ${report.deduped.length}; rejected ${report.rejected.length}.`;
    event.target.reset();
    loadCustomers();
  } catch (error) {
    result.textContent = error.message;
  }
});

let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    loadCustomers();
  }, 300);
});

statusFilter.addEventListener('change', () => {
  state.status = statusFilter.value;
  state.page = 1;
  loadCustomers();
});

pageSizeSel.addEventListener('change', () => {
  state.limit = parseInt(pageSizeSel.value, 10);
  state.page = 1;
  loadCustomers();
});

document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (state.sort === field) {
      state.order = state.order === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort = field;
      state.order = 'asc';
    }
    loadCustomers();
  });
});

document.getElementById('prevPage').onclick = () => {
  if (state.page > 1) { state.page--; loadCustomers(); }
};
document.getElementById('nextPage').onclick = () => {
  state.page++; loadCustomers();
};

document.getElementById('addCustomerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('addError');
  errBox.innerHTML = '';
  try {
    const name = document.getElementById('cName').value;
    const phone = document.getElementById('cPhone').value;
    const address = document.getElementById('cAddress').value;
    await api('/customers', { method: 'POST', body: JSON.stringify({ name, phone, address }) });
    e.target.reset();
    loadCustomers();
  } catch (err) {
    errBox.innerHTML = `<div class="error">${err.message}</div>`;
  }
});

function statusLabel(s) {
  return { active: 'Active', paused: 'Paused', cancelled: 'Cancelled', no_subscription: 'No plan' }[s] || s;
}

async function loadCustomers() {
  const params = new URLSearchParams({
    page: state.page, limit: state.limit, sort: state.sort, order: state.order,
    search: state.search, status: state.status,
  });
  const res = await api(`/customers?${params}`);

  rowsBody.innerHTML = res.data.map((c) => `
    <tr>
      <td><button class="link" onclick="openCustomer(${c.id})">${escapeHtml(c.name)}</button></td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${c.plan_name ? escapeHtml(c.plan_name) : '<span class="small">—</span>'}</td>
      <td><span class="status-pill status-${c.status}">${statusLabel(c.status)}</span></td>
      <td>
        <button class="secondary" onclick="openCustomer(${c.id})">View</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="small">No customers found.</td></tr>`;

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort);
    th.classList.toggle('asc', th.dataset.sort === state.sort && state.order === 'asc');
  });

  pageInfo.textContent = `Page ${res.pagination.page} of ${res.pagination.totalPages || 1} (${res.pagination.total} customers)`;
  document.getElementById('prevPage').disabled = res.pagination.page <= 1;
  document.getElementById('nextPage').disabled = res.pagination.page >= res.pagination.totalPages;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- customer detail ----------
let plansCache = null;

async function loadPlans() {
  if (!plansCache) plansCache = await api('/plans');
  return plansCache;
}

async function openCustomer(id) {
  const c = await api(`/customers/${id}`);
  const plans = await loadPlans();
  const panel = document.getElementById('detailPanel');
  const content = document.getElementById('detailContent');
  document.getElementById('detailTitle').textContent = `${c.name} — ${c.phone}`;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });

  const activeSub = c.subscriptions.find((s) => s.status !== 'cancelled');

  let html = `<p class="small">${escapeHtml(c.address || 'No address on file')}</p>`;

  if (!activeSub) {
    html += `
      <h3>Subscribe to a plan</h3>
      <form id="subscribeForm" class="form-row">
        <div>
          <label for="planSelect">Plan</label>
          <select id="planSelect">
            ${plans.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ₹${p.price_per_month}/mo</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="startDate">Start date</label>
          <input type="date" id="startDate" value="${todayStr()}">
        </div>
        <div style="flex:0 0 auto;">
          <button class="primary" type="submit">Subscribe</button>
        </div>
      </form>
      <div id="subError"></div>
    `;
  } else {
    const isPaused = activeSub.status === 'paused';
    html += `
      <h3>Current subscription</h3>
      <p>${escapeHtml(activeSub.plan_name)} — ₹${activeSub.price_per_month}/mo, started ${activeSub.start_date}
        <span class="status-pill status-${activeSub.status}">${statusLabel(activeSub.status)}</span>
      </p>
      <div id="subActionError"></div>
      ${isPaused ? `
        <button class="primary" onclick="resumeSub(${activeSub.id}, ${id})">Resume delivery</button>
      ` : `
        <form id="pauseForm" class="form-row">
          <div>
            <label for="pauseStart">Pause from</label>
            <input type="date" id="pauseStart" value="${todayStr()}">
          </div>
          <div>
            <label for="pauseEnd">Resume on (optional)</label>
            <input type="date" id="pauseEnd">
          </div>
          <div>
            <label for="pauseReason">Reason</label>
            <input id="pauseReason" placeholder="Travel, festival…">
          </div>
          <div style="flex:0 0 auto;">
            <button class="primary warn" type="submit">Pause</button>
          </div>
        </form>
      `}
      <p style="margin-top:16px;"><a href="/billing.html?subscription_id=${activeSub.id}">View this subscription's bill →</a></p>

      <h3 style="margin-top:20px;">Pause history</h3>
      ${activeSub.pauses.length ? `
        <table>
          <thead><tr><th>From</th><th>To</th><th>Reason</th></tr></thead>
          <tbody>
            ${activeSub.pauses.map((p) => `<tr><td>${p.start_date}</td><td>${p.end_date || 'ongoing'}</td><td>${escapeHtml(p.reason || '—')}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : `<p class="small">No pauses recorded.</p>`}
    `;
  }

  content.innerHTML = html;

  const subscribeForm = document.getElementById('subscribeForm');
  if (subscribeForm) {
    subscribeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('subError');
      errBox.innerHTML = '';
      try {
        await api('/subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            customer_id: id,
            plan_id: document.getElementById('planSelect').value,
            start_date: document.getElementById('startDate').value,
          }),
        });
        openCustomer(id);
        loadCustomers();
      } catch (err) {
        errBox.innerHTML = `<div class="error">${err.message}</div>`;
      }
    });
  }

  const pauseForm = document.getElementById('pauseForm');
  if (pauseForm) {
    pauseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('subActionError');
      errBox.innerHTML = '';
      try {
        await api(`/subscriptions/${activeSub.id}/pause`, {
          method: 'POST',
          body: JSON.stringify({
            start_date: document.getElementById('pauseStart').value,
            end_date: document.getElementById('pauseEnd').value || null,
            reason: document.getElementById('pauseReason').value,
          }),
        });
        openCustomer(id);
        loadCustomers();
      } catch (err) {
        errBox.innerHTML = `<div class="error">${err.message}</div>`;
      }
    });
  }
}

async function resumeSub(subId, customerId) {
  try {
    await api(`/subscriptions/${subId}/resume`, { method: 'POST' });
    openCustomer(customerId);
    loadCustomers();
  } catch (err) {
    alert(err.message);
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

loadCustomers();
