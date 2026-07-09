const $ = (id) => document.getElementById(id);
Chart.defaults.color = '#98a2c3';
Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';

let myChart = null;
let roomChart = null;

/** Fill a 30-day window so gaps render as zero instead of vanishing. */
function fill30(series, key = 'messages') {
  const byDay = new Map(series.map((d) => [String(d.day).slice(0, 10), d[key]]));
  const labels = [];
  const values = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(iso.slice(5));
    values.push(byDay.get(iso) || 0);
  }
  return { labels, values };
}

function lineChart(canvas, existing, series, label) {
  if (existing) existing.destroy();
  const { labels, values } = fill30(series);
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        fill: true,
        tension: 0.35,
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.12)',
        pointRadius: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

(async () => {
  const user = await API.me();
  if (!user) return (window.location.href = '/login?next=/analytics');

  const summary = await API.request('/api/analytics/summary');
  $('aTotal').textContent = summary.totalMessages;
  $('aToday').textContent = summary.messagesToday;
  myChart = lineChart($('myChart'), myChart, summary.last30Days, 'Messages');

  const { rooms } = await API.request('/api/rooms');
  const active = rooms.filter((r) => !r.isArchived);
  if (!active.length) return;

  $('roomEmpty').classList.add('d-none');
  $('roomChart').classList.remove('d-none');

  const sel = $('roomSelect');
  sel.innerHTML = active.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  sel.addEventListener('change', () => showRoom(sel.value));
  showRoom(sel.value);
})().catch((err) => console.error(err));

async function showRoom(roomId) {
  const s = await API.request(`/api/analytics/rooms/${roomId}`);
  roomChart = lineChart($('roomChart'), roomChart, s.last30Days, s.roomName);
}
