const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function setSession(token, owner) {
  localStorage.setItem('token', token);
  localStorage.setItem('owner', JSON.stringify(owner));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('owner');
}

function requireLogin() {
  if (!getToken()) window.location.href = '/login.html';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearSession();
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
