const $ = (id) => document.getElementById(id);

function toast(text, isError) {
  const m = $('msg');
  m.textContent = text;
  m.className = `small ${isError ? 'text-danger' : 'text-success'}`;
  setTimeout(() => m.classList.add('d-none'), 3500);
}

(async () => {
  const user = await API.me();
  if (!user) return (window.location.href = '/login?next=/account');
  $('whoami').textContent = `${user.name} · ${user.email}`;
  loadProfile();
  loadRooms();
})();

async function loadProfile() {
  try {
    const p = await API.request('/api/users/me');
    $('uToday').textContent = p.usage.messagesToday;
    $('uLimit').textContent = p.usage.dailyLimit;
    $('uTotal').textContent = p.usage.totalMessages;
    $('newName').value = p.name;
  } catch (err) {
    toast(err.message, true);
  }
}

async function loadRooms() {
  const body = $('roomsBody');
  try {
    const { rooms } = await API.request('/api/rooms');
    $('uRooms').textContent = rooms.filter((r) => !r.isArchived).length;
    if (!rooms.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-soft">No rooms yet — <a href="/chat">create one</a>.</td></tr>';
      return;
    }
    body.innerHTML = rooms.map((r) => {
      const status = r.isArchived
        ? '<span class="badge badge-mut">archived</span>'
        : '<span class="badge badge-on">active</span>';
      let actions = '';
      if (r.role === 'owner') {
        actions = r.isArchived
          ? `<button class="btn btn-outline-glass btn-sm" data-act="restore" data-id="${r.id}">Restore</button>`
          : `<button class="btn btn-outline-glass btn-sm" data-act="rename" data-id="${r.id}" data-name="${esc(r.name)}">Rename</button>
             <button class="btn btn-outline-glass btn-sm text-danger" data-act="archive" data-id="${r.id}">Archive</button>`;
      } else if (!r.isArchived) {
        actions = `<button class="btn btn-outline-glass btn-sm" data-act="leave" data-id="${r.id}">Leave</button>`;
      }
      return `<tr>
        <td>${r.isArchived ? esc(r.name) : `<a href="/chat?room=${r.id}">${esc(r.name)}</a>`}</td>
        <td><span class="badge ${r.role === 'owner' ? 'badge-on' : 'badge-mut'}">${esc(r.role)}</span></td>
        <td>${r.memberCount}</td>
        <td>${status}</td>
        <td class="text-end" style="white-space:nowrap">${actions}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="text-danger">${esc(err.message)}</td></tr>`;
  }
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  try {
    if (act === 'rename') {
      const name = prompt('New room name:', btn.dataset.name);
      if (!name) return;
      await API.request(`/api/rooms/${id}`, { method: 'PATCH', body: { name } });
      toast('Room renamed.');
    } else if (act === 'archive') {
      if (!confirm('Archive this room? Members lose access until you restore it.')) return;
      await API.request(`/api/rooms/${id}/archive`, { method: 'PATCH' });
      toast('Room archived (restorable).');
    } else if (act === 'restore') {
      await API.request(`/api/rooms/${id}/restore`, { method: 'PATCH' });
      toast('Room restored.');
    } else if (act === 'leave') {
      if (!confirm('Leave this room?')) return;
      await API.request(`/api/rooms/${id}/leave`, { method: 'POST' });
      toast('Left the room.');
    } else {
      return;
    }
    loadRooms();
  } catch (err) {
    toast(err.message, true);
  }
});

$('saveName').addEventListener('click', async () => {
  try {
    await API.request('/api/users/me', { method: 'PATCH', body: { name: $('newName').value } });
    toast('Name updated.');
  } catch (err) {
    toast(err.message, true);
  }
});

$('savePw').addEventListener('click', async () => {
  try {
    await API.request('/api/users/me/password', {
      method: 'PATCH',
      body: { currentPassword: $('curPw').value, newPassword: $('newPw').value },
    });
    $('curPw').value = '';
    $('newPw').value = '';
    toast('Password updated.');
  } catch (err) {
    toast(err.message, true);
  }
});
