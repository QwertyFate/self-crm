/* ═══════════════════════════════════════════════════════════════════════════
   Calendar — the reference screen (reference/pro/src/screens/calendar.js):
   month and week views, an Upcoming list, Type/Person filters and a legend.

   An "event" here is an activity that has an event_date, and optionally an
   event_time (Part 30, DESIGN_PRO_CHANGES.md). Two deviations from the
   reference follow from the data: an activity has no duration, so a timed
   entry is drawn as a nominal 30-minute block; and an activity with a date
   but no time is an all-day entry, which the reference has no concept of, so
   the week view gives those their own strip above the hour grid.

   Part 31: the feed also carries tasks that have a due date. A task and an
   activity can share an id, so every entry is keyed by `uid` = kind-id, and a
   task opens the task drawer rather than the activity detail.
   ═══════════════════════════════════════════════════════════════════════════ */

const CAL_TYPES = [
  { id: 'note',     label: 'Note',     color: 'var(--info)'       },
  { id: 'call',     label: 'Call',     color: 'var(--success)'    },
  { id: 'email',    label: 'Email',    color: 'var(--violet-500)' },
  { id: 'whatsapp', label: 'WhatsApp', color: 'var(--warning)'    },
  { id: 'task',     label: 'Task',     color: 'var(--brand)'      },
];
const CAL_DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAL_H0 = 8, CAL_H1 = 19, CAL_HH = 48;   // the grid shows 08:00–20:00 unless events fall outside
const CAL_SLOT_MIN = 30;                      // no duration column, so a timed entry is a 30-minute block

let calViewDate    = new Date();
let calView        = calViewFromStorage();
let calEvents      = [];     // the range on screen
let calUpcoming    = [];     // today and the next 7 days
let calFilters     = { type: null, person: null };
let dayModal       = null;
let calDetailModal = null;

function calViewFromStorage() {
  try { return localStorage.getItem('calendarView') === 'week' ? 'week' : 'month'; } catch { return 'month'; }
}

/* ---------- date and time helpers ---------- */
function calPad(n) { return String(n).padStart(2, '0'); }
function calIso(d) { return `${d.getFullYear()}-${calPad(d.getMonth() + 1)}-${calPad(d.getDate())}`; }
function calAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function calWeekStart(d) { return calAddDays(d, -((d.getDay() + 6) % 7)); }
function calMins(t) { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function calHHMM(m) { return `${calPad(Math.floor(m / 60) % 24)}:${calPad(m % 60)}`; }
function calToday() { return new Date(); }
function calFmtDay(dateStr, opts) { return calDateFromIso(dateStr).toLocaleDateString('en-GB', opts); }
function calDateFromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN);
}
function calTypeOf(id) { return CAL_TYPES.find(t => t.id === id) || CAL_TYPES[0]; }
// An entry is named by its own title: a task's title, an activity's note. Only a genuinely
// empty one falls back to its kind — a day of tasks all reading "Task" tells you nothing.
// Activity notes are stored with HTML in them, stripped here without needing the DOM.
function calTitleOf(e) {
  const text = String(e.title || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || calTypeOf(e.type).label;
}

/* ---------- data ---------- */
function visibleCalEvents(list = calEvents) {
  return list.filter(e =>
    (!calFilters.type   || e.type === calFilters.type) &&
    (!calFilters.person || String(e.created_by) === String(calFilters.person)));
}
function calOnDay(dateStr, list) {
  return visibleCalEvents(list).filter(e => e.event_date === dateStr)
    .sort((a, b) => calMins(a.event_time || '00:00') - calMins(b.event_time || '00:00') || a.id - b.id);
}
function calendarRange() {
  if (calView === 'week') {
    const s = calWeekStart(calViewDate);
    return [s, calAddDays(s, 6)];
  }
  const first = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), 1);
  const last  = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  // the month grid shows the days either side too, so fetch the whole visible block
  return [calAddDays(first, -((first.getDay() + 6) % 7)), calAddDays(last, (7 - ((last.getDay() + 6) % 7) - 1) % 7)];
}
function calendarLabel() {
  if (calView === 'month') return calViewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const s = calWeekStart(calViewDate), e = calAddDays(s, 6);
  const f = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(s)} to ${f(e)} ${e.getFullYear()}`;
}

/* ---------- navigation ---------- */
function switchPageCalendar() { renderCalendar(); }
function calendarGoToday() { calViewDate = calToday(); renderCalendar(); }
function calendarStep(dir) {
  calViewDate = calView === 'month'
    ? new Date(calViewDate.getFullYear(), calViewDate.getMonth() + dir, 1)
    : calAddDays(calViewDate, dir * 7);
  renderCalendar();
}
function calendarPrevMonth() { calendarStep(-1); }
function calendarNextMonth() { calendarStep(1); }
async function setCalendarView(view) {
  if (view !== 'month' && view !== 'week') return;
  calView = view;
  try { localStorage.setItem('calendarView', view); } catch {}
  document.querySelectorAll('#page-calendar [data-view]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  await renderCalendar();
}

/* ---------- month view ---------- */
function calEvButton(e) {
  const title = calTitleOf(e);
  const who = e.kind === 'task' ? '' : (e.contact_name ? `${e.contact_name}: ` : '');
  const when = e.event_time ? e.event_time : e.kind === 'task' ? 'due today' : 'all day';
  return `<button class="cal-ev ${e.type}${e.completed ? ' done' : ''}" data-ev="${e.uid}" onclick="event.stopPropagation();openCalendarEntry('${e.uid}')"
    title="${esc(calTypeOf(e.type).label)}: ${esc(who + title)}${e.event_time ? ', ' + esc(e.event_time) : ''}"
    aria-label="${esc(calTypeOf(e.type).label)}: ${esc(who + title)}, ${esc(when)}, ${esc(calFmtDay(e.event_date, { weekday: 'long', day: 'numeric', month: 'long' }))}">${
    e.event_time ? `<b>${esc(e.event_time)}</b>` : ''}${esc(who + title)}</button>`;
}

function calendarMonthView() {
  const first = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), 1);
  const lead  = (first.getDay() + 6) % 7;
  const days  = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const rows  = Math.ceil((lead + days) / 7);
  const start = calAddDays(first, -lead);
  const todayIso = calIso(calToday());
  let cells = '';
  for (let i = 0; i < rows * 7; i++) {
    const d = calAddDays(start, i), iso = calIso(d);
    const out = d.getMonth() !== first.getMonth();
    const evs = calOnDay(iso, calEvents);
    const shown = evs.length > 3 ? evs.slice(0, 2) : evs;
    const more = evs.length - shown.length;
    cells += `<div class="cal-cell${out ? ' out' : ''}${iso === todayIso ? ' today' : ''}" data-cell="${iso}" onclick="calendarAddOn(event, '${iso}')">
      <div class="cal-top"><button class="cal-day" data-addday="${iso}" onclick="event.stopPropagation();openActivityModal({ date: '${iso}' })"
        aria-label="Add on ${esc(calFmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}"${iso === todayIso ? ' aria-current="date"' : ''}>${d.getDate()}</button>${
        d.getDate() === 1 ? `<span class="cal-mon">${d.toLocaleDateString('en-GB', { month: 'short' })}</span>` : ''}</div>
      ${shown.map(calEvButton).join('')}${more ? `<button class="cal-more" data-more="${iso}" aria-haspopup="menu" onclick="event.stopPropagation();openCalMoreMenu(this, '${iso}')">+${more} more</button>` : ''}</div>`;
  }
  return `<div class="cal-grid cal-month">${CAL_DOW.map(d => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>`;
}

/* ---------- week view ---------- */
// Overlapping entries share the column: each gets a lane, and every entry in a
// cluster is drawn at 1/lanes width. Ported from the reference's layout().
function calLanes(list) {
  const items = list.map(e => {
    const s = calMins(e.event_time);
    return { ev: e, s, en: s + CAL_SLOT_MIN };
  }).sort((a, b) => a.s - b.s || b.en - a.en);
  const out = [];
  let cluster = [], cEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map(x => x.lane + 1));
    cluster.forEach(x => { x.lanes = n; out.push(x); });
    cluster = [];
  };
  items.forEach(it => {
    if (cluster.length && it.s >= cEnd) { flush(); cEnd = -1; }
    const used = cluster.filter(x => x.en > it.s).map(x => x.lane);
    let lane = 0; while (used.includes(lane)) lane++;
    it.lane = lane; cluster.push(it); cEnd = Math.max(cEnd, it.en);
  });
  flush();
  return out;
}

function calendarWeekView() {
  const start = calWeekStart(calViewDate), todayIso = calIso(calToday());
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = calAddDays(start, i), iso = calIso(d), evs = calOnDay(iso, calEvents);
    return { d, iso, timed: evs.filter(e => e.event_time), allDay: evs.filter(e => !e.event_time) };
  });
  let h0 = CAL_H0, h1 = CAL_H1;
  cols.forEach(c => c.timed.forEach(e => {
    const m = calMins(e.event_time);
    h0 = Math.min(h0, Math.floor(m / 60));
    h1 = Math.max(h1, Math.min(23, Math.floor((m + CAL_SLOT_MIN - 1) / 60)));
  }));
  const hours = h1 - h0 + 1;
  const now = calToday(), nowMin = now.getHours() * 60 + now.getMinutes();
  const anyAllDay = cols.some(c => c.allDay.length);

  const head = `<div class="cw-head"><div></div>${cols.map(c =>
    `<button class="cw-hd${c.iso === todayIso ? ' today' : ''}" data-addday="${c.iso}" onclick="openActivityModal({ date: '${c.iso}' })"
      aria-label="Add on ${esc(calFmtDay(c.iso, { weekday: 'long', day: 'numeric', month: 'long' }))}"><span>${CAL_DOW[(c.d.getDay() + 6) % 7]}</span><b>${c.d.getDate()}</b></button>`).join('')}</div>`;

  // An activity with a date but no time has no place on an hour grid, so it sits in its own strip.
  const allDayRow = anyAllDay ? `<div class="cw-allday"><div class="cw-allday-lbl">All day</div>${cols.map(c =>
    `<div class="cw-allday-col">${c.allDay.map(calEvButton).join('')}</div>`).join('')}</div>` : '';

  const body = `<div class="cw-body"><div class="cw-grid" style="--hh:${CAL_HH}px;height:${hours * CAL_HH}px">
    <div class="cw-gutter">${Array.from({ length: hours }, (_, i) => `<div class="cw-hr"><span>${calPad(h0 + i)}:00</span></div>`).join('')}</div>
    ${cols.map(c => `<div class="cw-col${c.iso === todayIso ? ' today' : ''}" data-col="${c.iso}" data-h0="${h0}"
      onclick="calendarAddAtTime(event, this)" role="group" aria-label="${esc(calFmtDay(c.iso, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      ${calLanes(c.timed).map(x => {
        const top = (x.s - h0 * 60) / 60 * CAL_HH;
        const hgt = Math.max(22, (x.en - x.s) / 60 * CAL_HH - 2);
        const w = 100 / x.lanes, e = x.ev, title = calTitleOf(e);
        return `<button class="cal-ev cal-wev ${e.type}${e.completed ? ' done' : ''}${hgt < 40 ? ' tight' : ''}" data-ev="${e.uid}"
          onclick="event.stopPropagation();openCalendarEntry('${e.uid}')"
          style="top:${top}px;height:${hgt}px;left:calc(${x.lane * w}% + 2px);width:calc(${w}% - 4px)"
          title="${esc(title)}, ${esc(e.event_time)}" aria-label="${esc(calTypeOf(e.type).label)}: ${esc(title)}, ${esc(e.event_time)}"><span class="t">${esc(title)}</span>${
          hgt >= 40 ? `<span class="m">${esc(e.event_time)}${e.contact_name ? ', ' + esc(e.contact_name) : ''}</span>` : ''}</button>`;
      }).join('')}
      ${c.iso === todayIso && nowMin >= h0 * 60 && nowMin < (h1 + 1) * 60
        ? `<div class="cw-now" style="top:${(nowMin - h0 * 60) / 60 * CAL_HH}px"></div>` : ''}</div>`).join('')}</div></div>`;

  return `<div class="cal-week">${head}${allDayRow}${body}</div>`;
}

/* ---------- upcoming ---------- */
function calendarUpcoming() {
  const todayIso = calIso(calToday());
  let html = '', n = 0;
  for (let i = 0; i <= 7; i++) {
    const iso = calIso(calAddDays(calToday(), i));
    const evs = calOnDay(iso, calUpcoming);
    if (!evs.length) continue;
    n += evs.length;
    const head = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : calFmtDay(iso, { weekday: 'long', day: 'numeric', month: 'short' });
    html += `<div class="cal-up-day">${esc(head)}</div>` + evs.map(e => `
      <button class="cal-up-item" data-ev="${e.uid}" onclick="openCalendarEntry('${e.uid}')">
        <span class="cal-bar ${e.type}"></span>
        <div class="grow" style="min-width:0"><div class="t truncate${e.completed ? ' done' : ''}">${esc(calTitleOf(e))}</div>
        <div class="m truncate">${e.event_time ? esc(e.event_time) : e.kind === 'task' ? 'Task, due' : 'All day'}${e.contact_name ? ', ' + esc(e.contact_name) : ''}</div></div>
        ${e.created_by_name ? avatar(e.created_by_name, 'sm') : ''}</button>`).join('');
  }
  const filtered = calFilters.type || calFilters.person;
  return `<aside class="card cal-up" aria-label="Upcoming">
    <div class="card-header"><div><div class="card-title">Upcoming</div>
      <div class="an-sub">Today and the next 7 days</div></div><span class="badge">${n}</span></div>
    <div class="cal-up-body">${n ? html : `<div class="empty">${icon('calendar')}<b>Nothing scheduled</b>
      <div>${filtered ? 'Nothing in the next 7 days matches the filters.' : 'Nothing scheduled in the next 7 days.'}</div>
      <button class="btn btn-secondary btn-sm" onclick="openActivityModal({ date: '${todayIso}' })">${icon('plus')}Add event</button></div>`}</div></aside>`;
}

/* ---------- toolbar: nav, label, filter chips, legend ---------- */
function calChip(key, label, text) {
  const on = calFilters[key] != null;
  return `<button class="chip${on ? ' on' : ''}" data-chip="${key}" aria-haspopup="menu" onclick="openCalendarChip('${key}', this)">${
    label}${on ? ': ' + esc(text) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function renderCalendarToolbar() {
  const bar = document.getElementById('calendar-toolbar');
  if (!bar) return;
  const person = members.find(m => String(m.id) === String(calFilters.person));
  const active = calFilters.type || calFilters.person;
  bar.innerHTML = `
    <div class="cal-nav">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="calendarStep(-1)" aria-label="Previous ${calView}">${icon('chevron-left')}</button>
      <button class="btn btn-secondary btn-sm btn-icon" onclick="calendarStep(1)" aria-label="Next ${calView}">${icon('chevron-right')}</button>
      <button class="btn btn-secondary btn-sm" onclick="calendarGoToday()">Today</button>
    </div>
    <h2 class="cal-label" id="calendar-label" aria-live="polite">${esc(calendarLabel())}</h2>
    <span class="toolbar-sep"></span>
    ${calChip('type', 'Type', calFilters.type ? calTypeOf(calFilters.type).label : '')}
    ${calChip('person', 'Person', person?.name || '')}
    ${active ? `<button class="btn btn-ghost btn-sm" onclick="clearCalendarFilters()">Clear filters</button>` : ''}
    <span class="grow"></span>
    <div class="cal-legend" aria-label="Legend">${CAL_TYPES.map(t =>
      `<span><i style="background:${t.color}"></i>${t.label}</span>`).join('')}</div>`;
}
function openCalendarChip(key, el) {
  const opts = key === 'type'
    ? CAL_TYPES.map(t => ({ value: t.id, label: t.label }))
    : members.map(m => ({ value: String(m.id), label: m.name }));
  ui.select(el, [{ value: null, label: 'All' }, ...opts], calFilters[key], v => {
    calFilters[key] = v;
    renderCalendarToolbar();
    renderCalendarBody();
  });
}
function clearCalendarFilters() {
  calFilters = { type: null, person: null };
  renderCalendarToolbar();
  renderCalendarBody();
}

/* ---------- add from the grid ---------- */
function calendarAddOn(ev, dateStr) {
  if (ev.target.closest('button')) return;
  openActivityModal({ date: dateStr });
}
function calendarAddAtTime(ev, col) {
  if (ev.target.closest('button')) return;
  const r = col.getBoundingClientRect(), h0 = Number(col.dataset.h0) || 0;
  const raw = h0 * 60 + (ev.clientY - r.top) / CAL_HH * 60;
  const snapped = Math.min(23 * 60 + 30, Math.max(0, Math.floor(raw / 30) * 30));
  openActivityModal({ date: col.dataset.col, time: calHHMM(snapped) });
}
function openCalMoreMenu(el, dateStr) {
  const evs = calOnDay(dateStr, calEvents);
  ui.menu(el, [
    { heading: calFmtDay(dateStr, { weekday: 'long', day: 'numeric', month: 'long' }) },
    ...evs.map(e => ({
      label: `${e.event_time ? e.event_time + '  ' : ''}${calTitleOf(e)}`,
      onSelect: () => openCalendarEntry(e.uid),
    })),
    { sep: true },
    { label: 'Show the whole day', icon: 'calendar', onSelect: () => openDayModal(dateStr) },
    { label: 'Add on this day', icon: 'plus', onSelect: () => openActivityModal({ date: dateStr }) },
  ]);
}

/* ---------- render ---------- */
function renderCalendarBody() {
  const grid = document.getElementById('calendar-grid');
  if (grid) grid.innerHTML = calView === 'month' ? calendarMonthView() : calendarWeekView();
  const up = document.getElementById('calendar-upcoming');
  if (up) up.innerHTML = calendarUpcoming();
  const sub = document.getElementById('calendar-page-sub');
  if (sub) {
    const [a, b] = calendarRange().map(calIso);
    const n = visibleCalEvents().filter(e => e.event_date >= a && e.event_date <= b).length;
    sub.textContent = `${n} ${n === 1 ? 'event' : 'events'} ${calView === 'month' ? 'in ' + calendarLabel() : 'this week'}`;
  }
}

async function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  await ensureMembers();
  const [from, to] = calendarRange();
  const upFrom = calToday(), upTo = calAddDays(upFrom, 7);
  const [range, soon] = await Promise.all([
    api.get(`/api/calendar?start=${calIso(from)}&end=${calIso(to)}`),
    api.get(`/api/calendar?start=${calIso(upFrom)}&end=${calIso(upTo)}`),
  ]);
  calEvents   = calNormalize(range);
  calUpcoming = calNormalize(soon);
  document.querySelectorAll('#page-calendar [data-view]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === calView)));
  renderCalendarToolbar();
  renderCalendarBody();
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

/* ---------- one event ---------- */
// An activity and a task can share an id, so entries are keyed by kind and id together.
function calNormalize(data) {
  return (Array.isArray(data) ? data : []).map(e => ({
    ...e,
    kind: e.kind || 'activity',
    uid: `${e.kind || 'activity'}-${e.id}`,
    event_date: String(e.event_date || '').slice(0, 10),
    event_time: e.event_time || null,
    completed: !!e.completed,
  }));
}
function calFindEvent(uid) {
  return calEvents.find(e => e.uid === uid) || calUpcoming.find(e => e.uid === uid) || null;
}

// One entry: a task belongs in the task drawer, an activity in the calendar's own detail.
function openCalendarEntry(uid) {
  const e = calFindEvent(uid);
  if (!e) { ui.toast('That entry is no longer here.'); return; }
  if (e.kind === 'task') {
    if (dayModal) { const m = dayModal; dayModal = null; m.close(); }
    openTaskDrawer(e.id, { onChange: () => renderCalendar() });
    return;
  }
  openCalendarEventDetail(uid);
}

// Done means different things to the two: a status on a task, a flag on an activity.
async function toggleCalendarDone(uid, done) {
  const e = calFindEvent(uid);
  if (!e) return;
  try {
    if (e.kind === 'task') {
      await api.patch(`/api/tasks/${e.id}/status`, { status: done ? 'done' : 'todo' });
    } else {
      await api.patch(`/api/activities/${e.id}`, { completed: done });
    }
    const mark = list => list.map(x => x.uid === uid ? { ...x, completed: done } : x);
    calEvents = mark(calEvents); calUpcoming = mark(calUpcoming);
    renderCalendarBody();
  } catch (err) {
    console.error('Error updating that entry:', err);
    ui.toast('That did not save. Try again.');
  }
}
function openCalendarEventDetail(uid) {
  const e = calFindEvent(uid);
  if (!e) { ui.toast('That entry is no longer here.'); return; }
  const t = calTypeOf(e.type);
  const todayIso = calIso(calToday());
  const rel = e.event_date === todayIso ? 'Today'
    : e.event_date === calIso(calAddDays(calToday(), 1)) ? 'Tomorrow'
    : e.event_date < todayIso ? 'Past' : 'Upcoming';
  if (calDetailModal) { const m = calDetailModal; calDetailModal = null; m.close(); }
  calDetailModal = ui.modal({
    title: calTitleOf(e).slice(0, 80), size: 'md',
    onClose: () => { calDetailModal = null; },
    body: `<div class="col" style="gap:14px">
      <div class="row" style="gap:8px">
        <span class="badge"><i class="cal-dot ${e.type}"></i>${t.label}</span>
        <span class="badge badge-outline">${rel}</span>
        ${e.completed ? '<span class="badge badge-success">Done</span>' : ''}
      </div>
      <dl class="kv" style="grid-template-columns:100px minmax(0,1fr);align-items:start">
        <dt>When</dt><dd>${esc(calFmtDay(e.event_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
          <div class="muted" style="font-weight:400">${e.event_time ? esc(e.event_time) : 'All day'}</div></dd>
        <dt>Contact</dt><dd>${e.contact_id
          ? `<a href="#" onclick="event.preventDefault();openContactDetail(${e.contact_id})">${esc(e.contact_name || 'Contact')}</a>`
          : '<span class="muted">Not set</span>'}</dd>
        <dt>Deal</dt><dd>${e.deal_id
          ? `<a href="#" onclick="event.preventDefault();openDealDetail(${e.deal_id})">${esc(e.deal_title || 'Deal')}</a>`
          : '<span class="muted">Not set</span>'}</dd>
        <dt>Added by</dt><dd>${e.created_by_name
          ? `<div class="row" style="gap:8px">${avatar(e.created_by_name, 'sm')}<span>${esc(e.created_by_name)}</span></div>`
          : '<span class="muted">Unknown</span>'}</dd>
      </dl>
      <label class="check"><input type="checkbox" ${e.completed ? 'checked' : ''}
        onchange="toggleCalendarDone('${e.uid}', this.checked)"><span>Mark as done</span></label>
      <div class="cal-note">${esc(stripHtml(e.content || '')) || '<span class="muted">No details.</span>'}</div>
    </div>`,
    footer: `<button class="btn btn-secondary" data-close>Close</button>`,
  });
}

// Kept for callers that only have an activity id.
async function toggleActivityComplete(activityId, completed) {
  return toggleCalendarDone(`activity-${activityId}`, completed);
}

// The whole day in one list — reached from a cell's "+N more" menu.
async function openDayModal(dateStr) {
  if (dayModal) { const m = dayModal; dayModal = null; m.close(); }
  const dayEvents = calOnDay(dateStr, calEvents);
  const dateLabel = calFmtDay(dateStr, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const items = dayEvents.length
    ? dayEvents.map(e => `
        <div class="day-event-item ${e.completed ? 'completed' : 'pending'}">
          <input type="checkbox" class="day-event-check" ${e.completed ? 'checked' : ''}
                 onchange="toggleCalendarDone('${e.uid}', this.checked)" />
          <div class="day-event-body">
            <div class="day-event-title">${e.event_time ? `<b>${esc(e.event_time)}</b> ` : ''}${esc(calTitleOf(e))}</div>
            <div class="day-event-content">${e.kind === 'task' ? 'Task' : calTypeOf(e.type).label}${e.contact_name ? ' · ' + esc(e.contact_name) : ''}${e.deal_title ? ' — ' + esc(e.deal_title) : ''}</div>
            <button class="btn btn-sm" onclick="openCalendarEntry('${e.uid}')">${icon('external')}Open</button>
          </div>
        </div>`).join('')
    : `<p class="day-events-empty">Nothing scheduled for this day.</p>`;

  dayModal = ui.modal({ title: dateLabel, size: 'md',
    body: `<div class="day-events-list" style="display:flex;flex-direction:column;gap:8px">${items}</div>`,
    footer: `<div class="legend grow"><span><i style="background:var(--success)"></i> Completed</span><span><i style="background:var(--danger)"></i> Not done yet</span></div>
      <button class="btn btn-secondary" onclick="openActivityModal({ date: '${dateStr}' })">${icon('plus')}Add</button>
      <button class="btn btn-secondary" data-close>Close</button>`,
    onClose: () => { dayModal = null; } });
}

function openCalendarEvent(activityId) {
  const ev = calFindEvent(`activity-${activityId}`);
  if (!ev) return;
  if (ev.deal_id) {
    if (dayModal) dayModal.close();
    openDealDetail(ev.deal_id);
  } else {
    openCalendarEntry(ev.uid);
  }
}
