/* ================================================================
   Relay chat client
   A hand-written WebSocket wrapper (reconnect + exponential backoff)
   speaking the small JSON protocol documented in src/constants/wsEvents.js.
   ================================================================ */
const $ = (id) => document.getElementById(id);

let me = null;
let socket = null;
let currentRoomId = null;
let rooms = [];
let backoff = 1000;              // ms; doubles up to 15s
let deliberateClose = false;

const pane = $('messagePane');

function toast(text, isError) {
  const m = $('msg');
  m.textContent = text;
  m.className = `small mt-2 ${isError ? 'text-danger' : 'text-success'}`;
  setTimeout(() => m.classList.add('d-none'), 3500);
}

function setConn(state) {
  const badge = $('connBadge');
  const map = {
    open: ['on', 'connected'],
    connecting: ['off', 'connecting…'],
    closed: ['off', 'reconnecting…'],
  };
  const [cls, label] = map[state];
  badge.className = `conn-badge ${cls}`;
  badge.textContent = label;
  const disabled = state !== 'open' || !currentRoomId;
  $('composerInput').disabled = disabled;
  $('sendBtn').disabled = disabled;
}

/* ---------------- socket ---------------- */

function connect() {
  setConn('connecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${proto}://${location.host}/ws`);

  socket.addEventListener('open', () => {
    backoff = 1000;
    setConn('open');
    if (currentRoomId) sendFrame({ type: 'join', roomId: currentRoomId });
  });

  socket.addEventListener('message', (e) => {
    let frame;
    try {
      frame = JSON.parse(e.data);
    } catch {
      return;
    }
    handleFrame(frame);
  });

  socket.addEventListener('close', () => {
    if (deliberateClose) return;
    setConn('closed');
    setTimeout(connect, backoff);           // exponential backoff, capped
    backoff = Math.min(backoff * 2, 15000);
  });

  socket.addEventListener('error', () => socket.close());
}

function sendFrame(frame) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

function handleFrame(frame) {
  switch (frame.type) {
    case 'ready':
      me = frame.user;
      break;
    case 'joined':
      renderMessages(frame.messages);
      renderOnline(frame.online);
      break;
    case 'message':
      if (frame.message.roomId === currentRoomId) appendMessage(frame.message, true);
      break;
    case 'removed':
      markRemoved(frame.messageId);
      break;
    case 'restored':
      if (frame.roomId === currentRoomId) replaceMessage(frame.message);
      break;
    case 'presence':
      if (frame.roomId === currentRoomId) renderOnline(frame.online);
      break;
    case 'error':
      toast(frame.message, true);
      break;
  }
}

/* ---------------- rendering ---------------- */

function messageNode(m) {
  const mine = me && m.userId === me.id;
  const el = document.createElement('div');
  el.className = `msg ${mine ? 'mine' : ''}`;
  el.dataset.id = m.id ?? '';
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Moderation affordance: your own messages, or any message if you're an admin.
  const canRemove = !m.removed && me && (mine || me.role === 'admin');
  el.innerHTML = `
    <div class="meta">${esc(m.userName)} · ${time}${
      canRemove ? ` <button class="del" data-remove="${m.id ?? ''}" title="Remove">×</button>` : ''
    }</div>
    <div class="bubble ${m.removed ? 'removed' : ''}">${
      m.removed ? 'message removed' : esc(m.body)
    }</div>`;
  return el;
}

function appendMessage(m, scroll) {
  const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120;
  pane.appendChild(messageNode(m));
  if (scroll && nearBottom) pane.scrollTop = pane.scrollHeight;
}

function renderMessages(list) {
  pane.innerHTML = '';
  if (!list.length) {
    pane.innerHTML = '<p class="text-soft text-center mt-5">No messages yet — say hello.</p>';
    return;
  }
  list.forEach((m) => pane.appendChild(messageNode(m)));
  pane.scrollTop = pane.scrollHeight;
}

function markRemoved(messageId) {
  const el = pane.querySelector(`.msg[data-id="${messageId}"]`);
  if (!el) return;
  const bubble = el.querySelector('.bubble');
  bubble.classList.add('removed');
  bubble.textContent = 'message removed';
  const del = el.querySelector('.del');
  if (del) del.remove();
}

function replaceMessage(m) {
  const el = pane.querySelector(`.msg[data-id="${m.id}"]`);
  if (el) el.replaceWith(messageNode(m));
}

function renderOnline(online) {
  $('onlineList').innerHTML = online
    .map((u) => `<span class="online-pill"><span class="online-dot"></span>${esc(u.name)}</span>`)
    .join('');
}

function renderRooms() {
  const list = $('roomList');
  const active = rooms.filter((r) => !r.isArchived);
  if (!active.length) {
    list.innerHTML = '<p class="text-soft small px-3">No rooms yet. Create one above.</p>';
    return;
  }
  list.innerHTML = active
    .map(
      (r) => `<div class="room-item ${r.id === currentRoomId ? 'active' : ''}" data-room="${r.id}">
        <span>${esc(r.name)}</span>
        <span class="count">${r.memberCount}${r.role === 'owner' ? ' · owner' : ''}</span>
      </div>`
    )
    .join('');
}

/* ---------------- actions ---------------- */

async function loadRooms() {
  const data = await API.request('/api/rooms');
  rooms = data.rooms;
  renderRooms();
  return rooms;
}

function openRoom(roomId) {
  if (currentRoomId === roomId) return;
  if (currentRoomId) sendFrame({ type: 'leave', roomId: currentRoomId });
  currentRoomId = roomId;

  const room = rooms.find((r) => r.id === roomId);
  $('roomTitle').textContent = room ? room.name : 'Room';
  $('roomSub').textContent = room ? `${room.memberCount} member${room.memberCount === 1 ? '' : 's'}` : '';
  $('roomActions').style.visibility = 'visible';
  pane.innerHTML = '<p class="text-soft text-center mt-5">Loading messages…</p>';

  renderRooms();
  setConn(socket && socket.readyState === WebSocket.OPEN ? 'open' : 'connecting');
  sendFrame({ type: 'join', roomId });
  $('composerInput').focus();
}

function sendMessage() {
  const input = $('composerInput');
  const body = input.value.trim();
  if (!body || !currentRoomId) return;
  sendFrame({ type: 'message', roomId: currentRoomId, body, clientId: Date.now() });
  input.value = '';
}

/* ---------------- events ---------------- */

$('roomList').addEventListener('click', (e) => {
  const item = e.target.closest('.room-item');
  if (item) openRoom(parseInt(item.dataset.room, 10));
});

$('sendBtn').addEventListener('click', sendMessage);
$('composerInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

pane.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  const id = btn.dataset.remove;
  if (!id || !confirm('Remove this message? Room owners and admins can restore it.')) return;
  try {
    await API.request(`/api/messages/${id}`, { method: 'DELETE' });
    // the broadcast will mark it removed for everyone, including us
  } catch (err) {
    toast(err.message, true);
  }
});

$('createRoomBtn').addEventListener('click', async () => {
  const name = $('newRoomName').value.trim();
  if (!name) return;
  try {
    const room = await API.request('/api/rooms', { method: 'POST', body: { name } });
    $('newRoomName').value = '';
    await loadRooms();
    openRoom(room.id);
    toast(`Room “${room.name}” created.`);
  } catch (err) {
    toast(err.message, true);
  }
});

$('joinCodeBtn').addEventListener('click', async () => {
  const inviteCode = $('joinCode').value.trim();
  if (!inviteCode) return;
  try {
    const { room } = await API.request('/api/rooms/join', { method: 'POST', body: { inviteCode } });
    $('joinCode').value = '';
    await loadRooms();
    openRoom(room.id);
    toast(`Joined “${room.name}”.`);
  } catch (err) {
    toast(err.message, true);
  }
});

$('inviteBtn').addEventListener('click', async () => {
  if (!currentRoomId) return;
  try {
    const room = rooms.find((r) => r.id === currentRoomId);
    const { qr } = await API.request(`/api/rooms/${currentRoomId}/qr`);
    $('qrImg').src = qr;
    $('inviteLink').textContent = room.inviteUrl;
    bootstrap.Modal.getOrCreateInstance($('inviteModal')).show();
  } catch (err) {
    toast(err.message, true);
  }
});

$('copyInvite').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('inviteLink').textContent);
  $('copyInvite').textContent = 'Copied ✓';
  setTimeout(() => { $('copyInvite').textContent = 'Copy link'; }, 1500);
});

window.addEventListener('beforeunload', () => {
  deliberateClose = true;
  if (socket) socket.close();
});

/* ---------------- boot ---------------- */

(async () => {
  const user = await API.me();
  if (!user) return (window.location.href = '/login?next=/chat');
  me = user;

  connect();
  await loadRooms();

  // ?room=<id> deep link (used after joining via an invite)
  const wanted = parseInt(new URLSearchParams(location.search).get('room'), 10);
  if (wanted && rooms.some((r) => r.id === wanted)) openRoom(wanted);
})();
