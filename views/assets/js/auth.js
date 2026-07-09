const $ = (id) => document.getElementById(id);
let mode = 'login';

const nextUrl = new URLSearchParams(location.search).get('next') || null;
const landing = (user) => nextUrl || (user.role === 'admin' ? '/admin' : '/chat');

API.me().then((user) => { if (user) window.location.href = landing(user); });

document.querySelectorAll('#modeTabs .nav-link').forEach((tab) => {
  tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    document.querySelectorAll('#modeTabs .nav-link').forEach((t) => t.classList.toggle('active', t === tab));
    $('nameField').classList.toggle('d-none', mode !== 'register');
    $('pwHint').classList.toggle('d-none', mode !== 'register');
    $('submitBtn').textContent =
      mode === 'register' ? 'Create account' : mode === 'admin' ? 'Sign in as admin' : 'Sign in';
    $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('msg').classList.add('d-none');
  });
});

async function submit() {
  const body = { email: $('email').value.trim(), password: $('password').value };
  if (mode === 'register') body.name = $('name').value.trim();
  const endpoint =
    mode === 'register' ? '/api/auth/register'
    : mode === 'admin' ? '/api/auth/admin/login'
    : '/api/auth/login';

  const btn = $('submitBtn');
  btn.disabled = true;
  try {
    const { user } = await API.request(endpoint, { method: 'POST', body });
    window.location.href = landing(user);
  } catch (err) {
    $('msg').textContent = err.message;
    $('msg').classList.remove('d-none');
  } finally {
    btn.disabled = false;
  }
}

$('submitBtn').addEventListener('click', submit);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
