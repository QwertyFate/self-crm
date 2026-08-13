// ── CALENDAR ────────────────────────────────────────────────
let calViewDate = new Date(); // first day of currently displayed month
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

  // Load events for this month
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  calEvents = await api.get(`/api/calendar?start=${start}&end=${end}`);

  // Normalize each event's date to YYYY-MM-DD (handles Date objects and ISO timestamps)
  calEvents = calEvents.map(e => ({
    ...e,
    event_date: String(e.event_date || '').slice(0, 10),
  }));

  // Build grid: Sunday-first
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Weekday headers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = `<div class="calendar-weekdays">${weekdays.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}</div>`;

  // Empty cells before first day
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="calendar-cell calendar-empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = calEvents.filter(e => e.event_date === dateStr);
    const isToday = dateStr === todayStr;

    cells += `
      <div class="calendar-cell${isToday ? ' today' : ''}">
        <div class="calendar-day-num">${day}</div>
        <div class="calendar-events">
          ${dayEvents.map(e => `
            <div class="calendar-event type-${e.type}" onclick="openCalendarEvent(${e.id})"
                 title="${esc(e.contact_name || '')} — ${esc(stripHtml(e.content || '').slice(0, 80))}">
              ${_timelineIcons[e.type] || '📝'}
              <span class="calendar-event-label">
                ${e.contact_name ? esc(e.contact_name) + ': ' : ''}${esc(stripHtml(e.content || '').slice(0, 40))}
              </span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // Fill remaining cells
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remaining; i++) cells += '<div class="calendar-cell calendar-empty"></div>';

  grid.innerHTML = html + cells;
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

function openCalendarEvent(activityId) {
  // Open the deal modal for the event's linked contact
  const ev = calEvents.find(e => e.id === activityId);
  if (!ev) return;
  if (ev.deal_id) {
    openDealModal(ev.deal_id);
  }
}