const $ = (id) => document.getElementById(id);
Chart.defaults.color = '#98a2c3';
Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';
let platformChart = null;

function toast(text, isError) {
  const m = $('msg');
  m.textContent = text;
  m.className = `small ${isError ? 'text-danger' : 'text-success'}`;
  setTimeout(() => m.classList.add('d-none'), 3500);
}

(async () => {
  const user = await API.me();
  if (!user) return (window.location.href = '/login?next=/admin');
  if (user.role !== 'admin') return (window.location.href = '/chat');
  loadOverview();
  loadRooms();
  loadUsers();
  loadMessages();
  loadLogs();
  // live counters (sockets, buffers) refresh on their own
  setInterval(loadOverview, 15000);
})();

document.querySelectorAll('#adminTabs .nav-link').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#adminTabs .nav-link').forEach((t) => t.classList.toggle('active', t === tab));
    ['rooms', 'users', 'messages', 'logs'].forEach((name) =>
      $(`tab-${name}`).classList.toggle('d-none', name !== tab.dataset.tab)
    );
  });
});

async function loadOverview() {
  const o = await API.request('/api/admin/overview');
  $('oMsgs').textContent = o.totalMessages;
  $('oToday').textContent = o.messagesToday;
  $('oRooms').textContent = o.totalRooms;
  $('oUsers').textContent = o.totalUsers;
  $('oConns').textContent = o.live.openConnections;
  $('oBuffers').textContent = o.live.buffers.activeRoomBuffers;

  const byDay = new Map(o.last30Days.map((d) => [String(d.day).slice(0, 10), d.messages]));
  const labels = [];
  const values = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(iso.slice(5));
    values.push(byDay.get(iso) || 0);
  }
  if (platformChart) platformChart.destroy();
  platformChart = new Chart($('platformChart'), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: 'rgba(56, 189, 248, 0.55)', borderRadius: 3 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

let roomTimer = null;
$('roomSearch').addEventListener('input', () => {
  clearTimeout(roomTimer);
  roomTimer = setTimeout(loadRooms, 300);
});
$('showArchived').addEventListener('change', loadRooms);

async function loadRooms() {
  const q = encodeURIComponent($('roomSearch').value.trim());
  const arch = $('showArchived').checked ? '&includeArchived=1' : '';
  const { rooms } = await API.request(`/api/admin/rooms?q=${q}${arch}`);
  $('adminRoomsBody').innerHTML = rooms.length ? rooms.map((r) => {
    const status = r.is_archived
      ? '<span class="badge badge-mut">archived</span>'
      : '<span class="badge badge-on">active</span>';
    const action = r.is_archived
      ? `<button class="btn btn-outline-glass btn-sm" data-act="roomRestore" data-id="${r.id}">Restore</button>`
      : `<button class="btn btn-outline-glass btn-sm text-danger" data-act="roomArchive" data-id="${r.id}">Archive</button>`;
    return `<tr>
      <td>${esc(r.name)}</td>
      <td class="mono small">${esc(r.owner_email)}</td>
      <td>${r.member_count}</td>
      <td>${r.message_count}</td>
      <td>${status}</td>
      <td class="text-end">${action}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="text-soft">No rooms found.</td></tr>';
}

async function loadUsers() {
  const { users } = await API.request('/api/admin/users');
  $('adminUsersBody').innerHTML = users.map((u) => {
    const locked = u.locked_until && new Date(u.locked_until) > new Date();
    const status = !u.is_active
      ? '<span class="badge badge-off">disabled</span>'
      : locked
        ? '<span class="badge badge-mut">locked</span>'
        : '<span class="badge badge-on">active</span>';
    return `<tr>
      <td>${esc(u.name)}</td>
      <td class="mono small">${esc(u.email)}</td>
      <td>${u.message_count}</td>
      <td>${status}</td>
      <td class="text-soft small">${new Date(u.created_at).toLocaleDateString()}</td>
      <td class="text-end" style="white-space:nowrap">
        ${locked ? `<button class="btn btn-outline-glass btn-sm" data-act="unlock" data-id="${u.id}">Unlock</button>` : ''}
        <button class="btn btn-outline-glass btn-sm" data-act="userToggle" data-id="${u.id}" data-on="${u.is_active}">${u.is_active ? 'Deactivate' : 'Activate'}</button>
      </td>
    </tr>`;
  }).join('');
}

let msgTimer = null;
$('msgSearch').addEventListener('input', () => {
  clearTimeout(msgTimer);
  msgTimer = setTimeout(loadMessages, 300);
});

async function loadMessages() {
  const q = encodeURIComponent($('msgSearch').value.trim());
  const { messages } = await API.request(`/api/admin/messages?q=${q}`);
  $('adminMsgsBody').innerHTML = messages.length ? messages.map((m) => {
    const status = m.is_deleted
      ? '<span class="badge badge-mut">removed</span>'
      : '<span class="badge badge-on">visible</span>';
    const action = m.is_deleted
      ? `<button class="btn btn-outline-glass btn-sm" data-act="msgRestore" data-id="${m.id}">Restore</button>`
      : `<button class="btn btn-outline-glass btn-sm text-danger" data-act="msgRemove" data-id="${m.id}">Remove</button>`;
    return `<tr>
      <td class="text-soft small" style="white-space:nowrap">${new Date(m.created_at).toLocaleString()}</td>
      <td>${esc(m.room_name)}</td>
      <td class="small">${esc(m.user_name)}</td>
      <td class="small" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.body)}</td>
      <td>${status}</td>
      <td class="text-end">${action}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="text-soft">No messages found.</td></tr>';
}

async function loadLogs() {
  const { logs } = await API.request('/api/admin/logs');
  $('adminLogsBody').innerHTML = logs.length ? logs.map((g) => `<tr>
    <td class="text-soft small" style="white-space:nowrap">${new Date(g.created_at).toLocaleString()}</td>
    <td class="mono small">${esc(g.admin_email)}</td>
    <td><span class="mono small">${esc(g.action)}</span></td>
    <td class="small">${esc(g.target_type || '')} ${esc(g.target_id || '')}</td>
    <td class="text-soft small">${esc(g.details || '')}</td>
  </tr>`).join('') : '<tr><td colspan="5" class="text-soft">No admin actions logged yet.</td></tr>';
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  try {
    if (act === 'roomArchive') {
      if (!confirm('Archive this room?')) return;
      await API.request(`/api/admin/rooms/${id}/archive`, { method: 'PATCH' });
    } else if (act === 'roomRestore') {
      await API.request(`/api/admin/rooms/${id}/restore`, { method: 'PATCH' });
    } else if (act === 'userToggle') {
      const activating = btn.dataset.on !== 'true';
      if (!activating && !confirm('Deactivate this user? Their live connections will be closed.')) return;
      await API.request(`/api/admin/users/${id}`, { method: 'PATCH', body: { isActive: activating } });
      loadUsers();
      loadLogs();
      return toast('Saved.');
    } else if (act === 'unlock') {
      await API.request(`/api/admin/users/${id}/unlock`, { method: 'PATCH' });
      loadUsers();
      loadLogs();
      return toast('User unlocked.');
    } else if (act === 'msgRemove') {
      if (!confirm('Remove this message? It stays restorable.')) return;
      await API.request(`/api/admin/messages/${id}`, { method: 'DELETE' });
      loadMessages();
      loadLogs();
      return toast('Message removed.');
    } else if (act === 'msgRestore') {
      await API.request(`/api/admin/messages/${id}/restore`, { method: 'PATCH' });
      loadMessages();
      loadLogs();
      return toast('Message restored.');
    } else {
      return;
    }
    toast('Saved.');
    loadRooms();
    loadOverview();
    loadLogs();
  } catch (err) {
    toast(err.message, true);
  }
});
