/* Shared fetch helper. Auth rides in an HttpOnly cookie — this JS never sees
   or stores the token (nothing in localStorage). */
const API = {
  async request(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async me() {
    if (this._me !== undefined) return this._me;
    try {
      const { user } = await this.request('/api/auth/me');
      this._me = user;
    } catch {
      this._me = null;
    }
    return this._me;
  },

  async logout() {
    await this.request('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  },
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

async function renderNav() {
  const el = document.getElementById('navLinks');
  if (!el) return;
  const user = await API.me();
  if (!user) {
    el.innerHTML = '<a class="btn btn-outline-glass btn-sm" href="/login">Sign in</a>';
    return;
  }
  const roleLink = user.role === 'admin'
    ? '<a class="small" href="/admin">Admin</a>'
    : '<a class="small" href="/account">Account</a>';
  el.innerHTML = `
    <a class="small" href="/chat">Chat</a>
    <a class="small" href="/analytics">Analytics</a>
    ${roleLink}
    <span class="small text-soft d-none d-md-inline">${esc(user.name)}</span>
    <button class="btn btn-outline-glass btn-sm" id="navLogout">Sign out</button>`;
  document.getElementById('navLogout').addEventListener('click', () => API.logout());
}
renderNav();
