/* Invite landing: /join/:code → join the room, then jump into the chat. */
const code = location.pathname.split('/').pop();
const status = document.getElementById('status');
const loginBtn = document.getElementById('loginBtn');

(async () => {
  const user = await API.me();
  if (!user) {
    status.textContent = 'Sign in (or create an account) to join this room.';
    loginBtn.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    loginBtn.classList.remove('d-none');
    return;
  }
  try {
    const { room } = await API.request('/api/rooms/join', {
      method: 'POST',
      body: { inviteCode: code },
    });
    status.textContent = `Joined “${room.name}” — opening chat…`;
    setTimeout(() => { window.location.href = `/chat?room=${room.id}`; }, 600);
  } catch (err) {
    status.textContent = err.message;
  }
})();
