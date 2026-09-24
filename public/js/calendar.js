let calViewDate = new Date();
let calEvents = [];

function switchPageCalendar() {
  renderCalendar();
}

function calendarGoToday() {
  calViewDate = new Date();
  calViewDate.setDate(1);
  renderCalendar();
}

function calendarPrevMonth() {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() - 1, 1);
  renderCalendar();
}

function calendarNextMonth() {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 1);
  renderCalendar();
}

async function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('calendar-month-label');
  if (!grid || !label) return;

  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  label.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  const data = await api.get(`/api/calendar?start=${start}&end=${end}`);

  calEvents = Array.isArray(data) ? data.map(e => ({
    ...e,
    event_date: String(e.event_date || '').slice(0, 10),
    completed: !!e.completed,
  })) : [];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = `<div class="calendar-weekdays">${weekdays.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}</div>`;

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="calendar-cell calendar-empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = calEvents.filter(e => e.event_date === dateStr);
    const isToday = dateStr === todayStr;

    cells += `
      <div class="calendar-cell${isToday ? ' today' : ''} ${dayEvents.length ? 'has-events' : ''}" onclick="openDayModal('${dateStr}')">
        <div class="calendar-day-num">${day}</div>
        <div class="calendar-events" onclick="event.stopPropagation()">
          ${dayEvents.map(e => `
            <div class="calendar-event type-${e.type} ${e.completed ? 'completed' : 'pending'}" onclick="openDayModal('${dateStr}')"
                 title="${esc(e.contact_name || '')} — ${esc(stripHtml(e.content || '').slice(0, 80))}">
              <span class="calendar-event-label">
                ${e.contact_name ? esc(e.contact_name) + ': ' : ''}${esc(stripHtml(e.content || '').slice(0, 40))}
              </span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remaining; i++) cells += '<div class="calendar-cell calendar-empty"></div>';

  grid.innerHTML = html + cells;
}

function stripHtml(html) {
  // DOMParser is inert: a detached div.innerHTML would still load <img onerror>.
  return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
}

async function openDayModal(dateStr) {
  const dayEvents = calEvents.filter(e => e.event_date === dateStr);

  document.getElementById('day-events-modal')?.remove();

  const dateLabel = `${dateStr.slice(5, 7)}-${dateStr.slice(8, 10)}-${dateStr.slice(0, 4)}`;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'day-events-modal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const items = dayEvents.length
    ? dayEvents.map(e => `
        <div class="day-event-item ${e.completed ? 'completed' : 'pending'}">
          <input type="checkbox" class="day-event-check" ${e.completed ? 'checked' : ''}
                 onchange="toggleActivityComplete(${e.id}, this.checked)" />
          <div class="day-event-body">
            <div class="day-event-title">${esc(e.contact_name || 'Activity')}${e.deal_title ? ` — ${esc(e.deal_title)}` : ''}</div>
            <div class="day-event-content">${esc(stripHtml(e.content || '').slice(0, 200))}</div>
            ${e.deal_id ? `<button class="btn btn-sm" onclick="openCalendarEvent(${e.id})">Open Deal</button>` : ''}
          </div>
        </div>
      `).join('')
    : `<p class="day-events-empty">No notes scheduled for this day.</p>`;

  modal.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <h2>${dateLabel}</h2>
        <button class="close-btn" onclick="document.getElementById('day-events-modal')?.remove()">&times;</button>
      </div>
      <div class="day-events-list">
        ${items}
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:16px;align-items:center;font-size:12px;color:var(--muted)">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:3px;background:#22c55e;display:inline-block"></span> Completed</span>
        <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:3px;background:#ef4444;display:inline-block"></span> Not done yet</span>
      </div>
    </div>`;

  document.body.appendChild(modal);
}

async function toggleActivityComplete(activityId, completed) {
  try {
    await api.patch(`/api/activities/${activityId}`, { completed });
    calEvents = calEvents.map(ce => ce.id === activityId ? { ...ce, completed } : ce);
    renderCalendar();
    const ev = calEvents.find(e => e.id === activityId);
    if (ev) openDayModal(ev.event_date);
  } catch (e) {
    console.error('Error toggling completion:', e);
    alert('Error toggling completion');
  }
}

function openCalendarEvent(activityId) {
  const ev = calEvents.find(e => e.id === activityId);
  if (!ev) return;
  if (ev.deal_id) {
    document.getElementById('day-events-modal')?.remove();
    openDealModal(ev.deal_id);
  }
}
