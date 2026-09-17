requireLogin();

document.getElementById('logoutBtn').onclick = () => {
  clearSession();
  window.location.href = 'login.html';
};

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const state = { page: 1, limit: 10, sort: 'customer_name', order: 'asc', month: currentMonthStr() };

const monthPicker = document.getElementById('monthPicker');
monthPicker.value = state.month;
monthPicker.addEventListener('change', () => {
  state.month = monthPicker.value;
  state.page = 1;
  loadBills();
});

document.getElementById('pageSize').addEventListener('change', (e) => {
  state.limit = parseInt(e.target.value, 10);
  state.page = 1;
  loadBills();
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
    loadBills();
  });
});

document.getElementById('prevPage').onclick = () => { if (state.page > 1) { state.page--; loadBills(); } };
document.getElementById('nextPage').onclick = () => { state.page++; loadBills(); };

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadBills() {
  const params = new URLSearchParams({
    month: state.month, page: state.page, limit: state.limit, sort: state.sort, order: state.order,
  });
  const res = await api(`/billing?${params}`);

  document.getElementById('billRows').innerHTML = res.data.map((b) => `
    <tr>
      <td>${escapeHtml(b.customer_name)}</td>
      <td>${escapeHtml(b.phone)}</td>
      <td>${escapeHtml(b.plan_name)}</td>
      <td>${b.deliveredDays} <span class="small">(${b.pausedDays} paused)</span></td>
      <td>${b.totalWeekdaysInMonth}</td>
      <td>₹${b.amount.toFixed(2)}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="small">No bills for this month.</td></tr>`;

  document.getElementById('totalRevenue').textContent = `Total for ${res.month}: ₹${res.totalRevenue.toFixed(2)}`;

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort);
    th.classList.toggle('asc', th.dataset.sort === state.sort && state.order === 'asc');
  });

  document.getElementById('pageInfo').textContent = `Page ${res.pagination.page} of ${res.pagination.totalPages || 1} (${res.pagination.total} subscriptions)`;
  document.getElementById('prevPage').disabled = res.pagination.page <= 1;
  document.getElementById('nextPage').disabled = res.pagination.page >= res.pagination.totalPages;
}

loadBills();
