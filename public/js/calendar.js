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
/* ENTRY POINT  renderCalendar(), called by switchPage('calendar').
   It fetches GET /api/calendar?start=&end= for the visible range, normalises
   the rows (calNormalize) and paints one of three views.

   STATE  calView ('month' | 'week' | 'upcoming', remembered in localStorage),
   calViewDate (the anchor date), calEvents (the fetched rows), calFilters
   (type + person chips). visibleCalEvents() applies the filters.

   EVERY ENTRY IS BORROWED. The calendar owns no table: a row is either an
   activity with an event_date or a task with a due_date, and `kind` says
   which. Editing therefore goes back to the owning route —
   PATCH /api/activities/:id for an activity, PATCH /api/tasks/:id/status for a
   task — which is what toggleCalendarDone() dispatches on. An activity and a
   task can share an id, so entries are keyed by kind+id (calFindEvent).

   "TODAY" IS THE USER'S CLOCK, NOT THE BROWSER'S. calToday() is
   nowInTimezone(currentTimezone()) (clock.js) — the picked timezone from
   Settings. Everything derived from now flows through it: the today cell,
   the Upcoming card's Today/Tomorrow grouping and its 8-day fetch window, the
   week view's now-line, the detail's Today/Past badge, and the default date
   for "Add event". The view anchor calViewDate is resolved from it on first
   render rather than from new Date() at script load. Stored values are naive
   DATE/TIME, so nothing is converted on save.

   EVERY ROW IS SHOWN ON THE VIEWER'S CLOCK. A row carries event_tz, the zone
   its time was typed in; calNormalize() converts it to currentTimezone() via
   toViewerClock() (clock.js) before anything renders, and the two fetches are
   padded by two days because the server filters on the stored date. All-day
   rows are dates and are not converted.

   FUNCTION MAP
     dates      calPad, calIso, calAddDays, calWeekStart, calMins, calHHMM,
                calToday, calLocale, calDow, calFmtDay, calDateFromIso,
                calendarRange, calendarLabel
     nav        setCalendarView, calViewFromStorage, calendarGoToday,
                calendarStep, calendarPrevMonth, calendarNextMonth,
                switchPageCalendar
     render     renderCalendar, renderCalendarBody, calendarMonthView,
                calendarWeekView, calendarUpcoming, calLanes, calEvButton,
                calWeekEvButton,
                renderCalendarToolbar
     filters    visibleCalEvents, calOnDay, calChip, openCalendarChip,
                clearCalendarFilters
     entries    calNormalize, calTypeOf, calTypeLabel, calTitleOf, calFindEvent, stripHtml,
                openCalendarEntry, openCalendarEvent, openCalendarEventDetail,
                openDayModal, openCalMoreMenu, toggleCalendarDone,
                toggleActivityComplete, calendarAddOn, calendarAddAtTime */

// `key` is the dictionary key of the type's label — read it through calTypeLabel().
const CAL_TYPES = [
  { id: 'note',     key: 'act_note',     color: 'var(--info)'       },
  { id: 'call',     key: 'act_call',     color: 'var(--success)'    },
  { id: 'email',    key: 'act_email',    color: 'var(--violet-500)' },
  { id: 'whatsapp', key: 'act_whatsapp', color: 'var(--warning)'    },
  { id: 'task',     key: 'new_task',     color: 'var(--brand)'      },
];
const CAL_H0 = 8, CAL_H1 = 19, CAL_HH = 48;   // the grid shows 08:00–20:00 unless events fall outside
const CAL_SLOT_MIN = 30;                      // no duration column, so a timed entry is a 30-minute block

let calViewDate    = null;   // the user's "today", resolved on first render — see renderCalendar()
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
// Now, on the clock of the timezone the user picked — NOT the browser's. See the header.
function calToday() { return nowInTimezone(currentTimezone()); }
function calLocale() { return currentLang === 'de' ? 'de-DE' : 'en-GB'; }
// Mon…Sun / Mo…So from Intl (1 Jan 2024 was a Monday); a trailing dot is dropped so the header reads the same everywhere.
function calDow() { return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(calLocale(), { weekday: 'short' }).replace(/\.$/, '')); }
function calFmtDay(dateStr, opts) { return calDateFromIso(dateStr).toLocaleDateString(calLocale(), opts); }
function calDateFromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN);
}
function calTypeOf(id) { return CAL_TYPES.find(x => x.id === id) || CAL_TYPES[0]; }
function calTypeLabel(id) { return t(calTypeOf(id).key); }
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
  return text || calTypeLabel(e.type);
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
  if (calView === 'month') return calViewDate.toLocaleDateString(calLocale(), { month: 'long', year: 'numeric' });
  const s = calWeekStart(calViewDate), e = calAddDays(s, 6);
  const f = d => d.toLocaleDateString(calLocale(), { day: 'numeric', month: 'short' });
  return tf('cal_week_range', { from: f(s), to: f(e), year: e.getFullYear() });
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
  const when = e.event_time ? e.event_time : t('cal_all_day');
  return `<button class="cal-ev ${e.type}${e.completed ? ' done' : ''}" data-ev="${e.uid}" onclick="event.stopPropagation();openCalendarEntry('${e.uid}')"
    title="${esc(calTypeLabel(e.type))}: ${esc(who + title)}${e.event_time ? ', ' + esc(e.event_time) : ''}"
    aria-label="${esc(calTypeLabel(e.type))}: ${esc(who + title)}, ${esc(when)}, ${esc(calFmtDay(e.event_date, { weekday: 'long', day: 'numeric', month: 'long' }))}">${
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
        aria-label="${esc(tf('cal_add_on_date', { date: calFmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long' }) }))}"${iso === todayIso ? ' aria-current="date"' : ''}>${d.getDate()}</button>${
        d.getDate() === 1 ? `<span class="cal-mon">${d.toLocaleDateString(calLocale(), { month: 'short' })}</span>` : ''}</div>
      ${shown.map(calEvButton).join('')}${more ? `<button class="cal-more" data-more="${iso}" aria-haspopup="menu" onclick="event.stopPropagation();openCalMoreMenu(this, '${iso}')">${esc(tf('cal_n_more', { n: more }))}</button>` : ''}</div>`;
  }
  return `<div class="cal-grid cal-month">${calDow().map(d => `<div class="cal-dow">${esc(d)}</div>`).join('')}${cells}</div>`;
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

// One timed block on the week grid — the week twin of calEvButton. The time is
// in the visible text, like the month chip: every entry is a nominal 30-minute
// block (there is no duration column), which is 22px at CAL_HH=48, so a time
// that rendered only when hgt >= 40 never rendered at all and lived solely in
// the tooltip. The second line keeps the contact for a tall block.
function calWeekEvButton(x, h0) {
  const top = (x.s - h0 * 60) / 60 * CAL_HH;
  const hgt = Math.max(22, (x.en - x.s) / 60 * CAL_HH - 2);
  const w = 100 / x.lanes, e = x.ev, title = calTitleOf(e);
  return `<button class="cal-ev cal-wev ${e.type}${e.completed ? ' done' : ''}${hgt < 40 ? ' tight' : ''}" data-ev="${e.uid}"
    onclick="event.stopPropagation();openCalendarEntry('${e.uid}')"
    style="top:${top}px;height:${hgt}px;left:calc(${x.lane * w}% + 2px);width:calc(${w}% - 4px)"
    title="${esc(title)}, ${esc(e.event_time)}" aria-label="${esc(calTypeLabel(e.type))}: ${esc(title)}, ${esc(e.event_time)}"><span class="t"><b>${esc(e.event_time)}</b>${esc(title)}</span>${
    hgt >= 40 && e.contact_name ? `<span class="m">${esc(e.contact_name)}</span>` : ''}</button>`;
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
  const dow = calDow();

  const head = `<div class="cw-head"><div></div>${cols.map(c =>
    `<button class="cw-hd${c.iso === todayIso ? ' today' : ''}" data-addday="${c.iso}" onclick="openActivityModal({ date: '${c.iso}' })"
      aria-label="${esc(tf('cal_add_on_date', { date: calFmtDay(c.iso, { weekday: 'long', day: 'numeric', month: 'long' }) }))}"><span>${esc(dow[(c.d.getDay() + 6) % 7])}</span><b>${c.d.getDate()}</b></button>`).join('')}</div>`;

  // An activity with a date but no time has no place on an hour grid, so it sits in its own strip.
  const allDayRow = anyAllDay ? `<div class="cw-allday"><div class="cw-allday-lbl">${esc(t('cal_all_day'))}</div>${cols.map(c =>
    `<div class="cw-allday-col">${c.allDay.map(calEvButton).join('')}</div>`).join('')}</div>` : '';

  const body = `<div class="cw-body"><div class="cw-grid" style="--hh:${CAL_HH}px;height:${hours * CAL_HH}px">
    <div class="cw-gutter">${Array.from({ length: hours }, (_, i) => `<div class="cw-hr"><span>${calPad(h0 + i)}:00</span></div>`).join('')}</div>
    ${cols.map(c => `<div class="cw-col${c.iso === todayIso ? ' today' : ''}" data-col="${c.iso}" data-h0="${h0}"
      onclick="calendarAddAtTime(event, this)" role="group" aria-label="${esc(calFmtDay(c.iso, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      ${calLanes(c.timed).map(x => calWeekEvButton(x, h0)).join('')}
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
    const head = i === 0 ? t('today') : i === 1 ? t('tk_due_tomorrow') : calFmtDay(iso, { weekday: 'long', day: 'numeric', month: 'short' });
    html += `<div class="cal-up-day">${esc(head)}</div>` + evs.map(e => `
      <button class="cal-up-item" data-ev="${e.uid}" onclick="openCalendarEntry('${e.uid}')">
        <span class="cal-bar ${e.type}"></span>
        <div class="grow" style="min-width:0"><div class="t truncate${e.completed ? ' done' : ''}">${esc(calTitleOf(e))}</div>
        <div class="m truncate">${e.event_time ? esc(e.event_time) : esc(t('cal_all_day'))}${e.kind === 'task' ? ' · ' + esc(t('new_task')) : ''}${e.contact_name ? ', ' + esc(e.contact_name) : ''}</div></div>
        ${e.created_by_name ? avatar(e.created_by_name, 'sm') : ''}</button>`).join('');
  }
  const filtered = calFilters.type || calFilters.person;
  return `<aside class="card cal-up" aria-label="${esc(t('cal_upcoming'))}">
    <div class="card-header"><div><div class="card-title">${esc(t('cal_upcoming'))}</div>
      <div class="an-sub">${esc(t('cal_next_7_days'))}</div></div><span class="badge">${n}</span></div>
    <div class="cal-up-body">${n ? html : `<div class="empty">${icon('calendar')}<b>${esc(t('cal_nothing_scheduled'))}</b>
      <div>${esc(t(filtered ? 'cal_nothing_matches' : 'cal_nothing_next_7'))}</div>
      <button class="btn btn-secondary btn-sm" onclick="openActivityModal({ date: '${todayIso}' })">${icon('plus')}${esc(t('cal_add_event'))}</button></div>`}</div></aside>`;
}

/* ---------- toolbar: nav, label, filter chips, legend ---------- */
function calChip(key, label, text) {
  const on = calFilters[key] != null;
  return `<button class="chip${on ? ' on' : ''}" data-chip="${key}" aria-haspopup="menu" onclick="openCalendarChip('${key}', this)">${
    esc(label)}${on ? ': ' + esc(text) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function renderCalendarToolbar() {
  const bar = document.getElementById('calendar-toolbar');
  if (!bar) return;
  const person = members.find(m => String(m.id) === String(calFilters.person));
  const active = calFilters.type || calFilters.person;
  bar.innerHTML = `
    <div class="cal-nav">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="calendarStep(-1)" aria-label="${esc(t(calView === 'month' ? 'cal_prev_month' : 'cal_prev_week'))}">${icon('chevron-left')}</button>
      <button class="btn btn-secondary btn-sm btn-icon" onclick="calendarStep(1)" aria-label="${esc(t(calView === 'month' ? 'cal_next_month' : 'cal_next_week'))}">${icon('chevron-right')}</button>
      <button class="btn btn-secondary btn-sm" onclick="calendarGoToday()">${esc(t('today'))}</button>
    </div>
    <h2 class="cal-label" id="calendar-label" aria-live="polite">${esc(calendarLabel())}</h2>
    <span class="toolbar-sep"></span>
    ${calChip('type', t('chip_type'), calFilters.type ? calTypeLabel(calFilters.type) : '')}
    ${calChip('person', t('chip_person'), person?.name || '')}
    ${active ? `<button class="btn btn-ghost btn-sm" onclick="clearCalendarFilters()">${esc(t('clear_filters'))}</button>` : ''}
    <span class="grow"></span>
    <div class="cal-legend" aria-label="${esc(t('cal_legend'))}">${CAL_TYPES.map(ty =>
      `<span><i style="background:${ty.color}"></i>${esc(t(ty.key))}</span>`).join('')}</div>`;
}
function openCalendarChip(key, el) {
  const opts = key === 'type'
    ? CAL_TYPES.map(ty => ({ value: ty.id, label: t(ty.key) }))
    : members.map(m => ({ value: String(m.id), label: m.name }));
  ui.select(el, [{ value: null, label: t('filter_all') }, ...opts], calFilters[key], v => {
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
    { label: t('cal_show_day'), icon: 'calendar', onSelect: () => openDayModal(dateStr) },
    { label: t('cal_add_on_day'), icon: 'plus', onSelect: () => openActivityModal({ date: dateStr }) },
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
    const key = calView === 'month' ? (n === 1 ? 'cal_events_in_one' : 'cal_events_in_many') : (n === 1 ? 'cal_events_week_one' : 'cal_events_week_many');
    sub.textContent = tf(key, { n, label: calendarLabel() });
  }
}

async function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  await ensureMembers();
  if (!calViewDate) calViewDate = calToday();
  const [from, to] = calendarRange();
  const upFrom = calToday(), upTo = calAddDays(upFrom, 7);
  const [range, soon] = await Promise.all([
    // The server filters by the STORED date; a conversion to the viewer's zone can
    // move a row by up to two days either way, so fetch wider and let calOnDay()
    // (which reads the converted date) decide what belongs on screen.
    api.get(`/api/calendar?start=${calIso(calAddDays(from, -2))}&end=${calIso(calAddDays(to, 2))}`),
    api.get(`/api/calendar?start=${calIso(calAddDays(upFrom, -2))}&end=${calIso(calAddDays(upTo, 2))}`),
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
// Every row is converted to the VIEWER's clock here, once, so the rest of the
// file never sees another member's wall-clock: event_date/event_time are what
// this viewer should see; stored_date/stored_time/event_tz keep what was typed
// and where. An all-day row (no time) is a date and is left alone.
function calNormalize(data) {
  return (Array.isArray(data) ? data : []).map(e => {
    const storedDate = String(e.event_date || '').slice(0, 10), storedTime = e.event_time || null;
    const shown = toViewerClock(storedDate, storedTime, e.event_tz);
    return {
      ...e,
      kind: e.kind || 'activity',
      uid: `${e.kind || 'activity'}-${e.id}`,
      event_date: shown.date,
      event_time: shown.time,
      stored_date: storedDate,
      stored_time: storedTime,
      event_tz: e.event_tz || null,
      completed: !!e.completed,
    };
  });
}
function calFindEvent(uid) {
  return calEvents.find(e => e.uid === uid) || calUpcoming.find(e => e.uid === uid) || null;
}

// One entry: a task belongs in the task drawer, an activity in the calendar's own detail.
function openCalendarEntry(uid) {
  const e = calFindEvent(uid);
  if (!e) { ui.toast(t('cal_gone')); return; }
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
    ui.toast(t('cal_err_save'));
  }
}
function openCalendarEventDetail(uid) {
  const e = calFindEvent(uid);
  if (!e) { ui.toast(t('cal_gone')); return; }
  const ty = calTypeOf(e.type);
  const todayIso = calIso(calToday());
  const rel = e.event_date === todayIso ? t('today')
    : e.event_date === calIso(calAddDays(calToday(), 1)) ? t('tk_due_tomorrow')
    : e.event_date < todayIso ? t('cal_past') : t('cal_upcoming');
  if (calDetailModal) { const m = calDetailModal; calDetailModal = null; m.close(); }
  calDetailModal = ui.modal({
    title: calTitleOf(e).slice(0, 80), size: 'md',
    onClose: () => { calDetailModal = null; },
    body: `<div class="col" style="gap:14px">
      <div class="row" style="gap:8px">
        <span class="badge"><i class="cal-dot ${e.type}"></i>${esc(t(ty.key))}</span>
        <span class="badge badge-outline">${esc(rel)}</span>
        ${e.completed ? `<span class="badge badge-success">${esc(t('tk_done'))}</span>` : ''}
      </div>
      <dl class="kv" style="grid-template-columns:100px minmax(0,1fr);align-items:start">
        <dt>${esc(t('cal_when'))}</dt><dd>${esc(calFmtDay(e.event_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
          <div class="muted" style="font-weight:400">${e.event_time ? esc(e.event_time) : esc(t('cal_all_day'))}${
            e.event_time && e.event_tz && e.event_tz !== currentTimezone() ? ` <span class="muted">${esc(tf('cal_entered_as', { time: e.stored_time, tz: e.event_tz }))}</span>` : ''}</div></dd>
        <dt>${esc(t('lbl_contact'))}</dt><dd>${e.contact_id
          ? `<a href="#" onclick="event.preventDefault();openContactDetail(${e.contact_id})">${esc(e.contact_name || t('lbl_contact'))}</a>`
          : `<span class="muted">${esc(t('not_set'))}</span>`}</dd>
        <dt>${esc(t('lbl_deal'))}</dt><dd>${e.deal_id
          ? `<a href="#" onclick="event.preventDefault();openDealDetail(${e.deal_id})">${esc(e.deal_title || t('lbl_deal'))}</a>`
          : `<span class="muted">${esc(t('not_set'))}</span>`}</dd>
        <dt>${esc(t('cal_added_by'))}</dt><dd>${e.created_by_name
          ? `<div class="row" style="gap:8px">${avatar(e.created_by_name, 'sm')}<span>${esc(e.created_by_name)}</span></div>`
          : `<span class="muted">${esc(t('cal_unknown'))}</span>`}</dd>
      </dl>
      <label class="check"><input type="checkbox" ${e.completed ? 'checked' : ''}
        onchange="toggleCalendarDone('${e.uid}', this.checked)"><span>${esc(t('cal_mark_done'))}</span></label>
      <div class="cal-note">${esc(stripHtml(e.content || '')) || `<span class="muted">${esc(t('cal_no_details'))}</span>`}</div>
    </div>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_close'))}</button>`,
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
            <div class="day-event-content">${esc(e.kind === 'task' ? t('new_task') : calTypeLabel(e.type))}${e.contact_name ? ' · ' + esc(e.contact_name) : ''}${e.deal_title ? ' — ' + esc(e.deal_title) : ''}</div>
            <button class="btn btn-sm" onclick="openCalendarEntry('${e.uid}')">${icon('external')}${esc(t('tk_open'))}</button>
          </div>
        </div>`).join('')
    : `<p class="day-events-empty">${esc(t('cal_nothing_this_day'))}</p>`;

  dayModal = ui.modal({ title: dateLabel, size: 'md',
    body: `<div class="day-events-list" style="display:flex;flex-direction:column;gap:8px">${items}</div>`,
    footer: `<div class="legend grow"><span><i style="background:var(--success)"></i> ${esc(t('tk_kpi_done'))}</span><span><i style="background:var(--danger)"></i> ${esc(t('cal_not_done'))}</span></div>
      <button class="btn btn-secondary" onclick="openActivityModal({ date: '${dateStr}' })">${icon('plus')}${esc(t('add_btn'))}</button>
      <button class="btn btn-secondary" data-close>${esc(t('btn_close'))}</button>`,
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
