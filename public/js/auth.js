const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const errorBox = document.getElementById('errorBox');

if (getToken()) window.location.href = '/dashboard.html';

tabLogin.onclick = () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  errorBox.innerHTML = '';
};

tabRegister.onclick = () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.style.display = 'block';
  loginForm.style.display = 'none';
  errorBox.innerHTML = '';
};

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.innerHTML = '';
  try {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setSession(data.token, data.owner);
    window.location.href = '/dashboard.html';
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${err.message}</div>`;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.innerHTML = '';
  try {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    setSession(data.token, data.owner);
    window.location.href = '/dashboard.html';
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${err.message}</div>`;
  }
});
