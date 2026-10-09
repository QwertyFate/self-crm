/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR CLOCK + the timezone preference behind it.
   ALSO nowInTimezone(): "now" on the user's picked clock. The calendar's
   today, its Upcoming card, its now-line and task overdue all run on it.
   AND toViewerClock() / wallClockInZone() / instantOf(): a stored due or
   event time (typed in one member's zone, due_tz/event_tz) shown on another
   member's clock. "True for anyone in the world": the row is an instant.

   A ticking clock in the sidebar, rendered in the user's own timezone
   (users.timezone, default Europe/Berlin). startClock() is called by showApp()
   and stopClock() by resetClientState(), so the interval never outlives a
   session.

   The timezone picker lives on the Settings page but is rendered here
   (renderTimezoneSetting), because this file owns COMMON_TIMEZONES and the
   formatting. Saving PATCHes /api/auth/preferences, which validates the zone
   with Intl.DateTimeFormat before storing it.

   FUNCTION MAP  currentTimezone, startClock, stopClock, updateClock,
                 renderTimezoneSetting, saveTimezoneSetting
   ═══════════════════════════════════════════════════════════════════════════ */

let clockTimer = null;
const COMMON_TIMEZONES = [
  { value: 'Europe/Berlin',              label: 'Berlin (Germany)' },
  { value: 'America/New_York',           label: 'New York (USA)' },
  { value: 'America/Los_Angeles',        label: 'Los Angeles (USA)' },
  { value: 'Europe/London',              label: 'London (UK)' },
  { value: 'Europe/Paris',               label: 'Paris (France)' },
  { value: 'Europe/Madrid',              label: 'Madrid (Spain)' },
  { value: 'Europe/Rome',                label: 'Rome (Italy)' },
  { value: 'Europe/Amsterdam',           label: 'Amsterdam (Netherlands)' },
  { value: 'Europe/Vienna',              label: 'Vienna (Austria)' },
  { value: 'Europe/Zurich',              label: 'Zurich (Switzerland)' },
  { value: 'Europe/Stockholm',           label: 'Stockholm (Sweden)' },
  { value: 'Europe/Warsaw',              label: 'Warsaw (Poland)' },
  { value: 'Europe/Athens',              label: 'Athens (Greece)' },
  { value: 'Europe/Lisbon',              label: 'Lisbon (Portugal)' },
  { value: 'Asia/Manila',                label: 'Manila (Philippines)' },
  { value: 'Asia/Taipei',                label: 'Taipei (Taiwan)' },
  { value: 'Asia/Tokyo',                 label: 'Tokyo (Japan)' },
  { value: 'Asia/Shanghai',              label: 'Shanghai (China)' },
  { value: 'Asia/Singapore',             label: 'Singapore' },
  { value: 'Asia/Dubai',                 label: 'Dubai (UAE)' },
  { value: 'Australia/Sydney',           label: 'Sydney (Australia)' },
  { value: 'UTC',                        label: 'UTC' },
];

// The zone used when none is known: a user who never picked one, and a stored
// due/event time written before its zone was recorded (due_tz / event_tz NULL).
const DEFAULT_TIMEZONE = 'Europe/Berlin';

function currentTimezone() {
  return currentUser?.timezone || DEFAULT_TIMEZONE;
}

// The current wall-clock moment in `tz`, returned as a Date whose LOCAL getters
// (getFullYear, getDate, getHours, …) give THOSE parts. That is the whole trick:
// code written against the browser's clock — calIso(), calAddDays(), "is this
// cell today", "is this task overdue" — reads the user's picked clock instead,
// without changing. Stored dates and times are naive wall-clock values, so
// nothing is converted on save; only things derived from "now" needed this.
// `at` is the instant to convert, a parameter so it can be tested without
// faking Date. An unknown zone name falls back to the instant as given.
function nowInTimezone(tz = currentTimezone(), at = new Date()) {
  try {
    const p = {};
    for (const part of new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at)) {
      if (part.type !== 'literal') p[part.type] = Number(part.value);
    }
    return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  } catch {
    return at;
  }
}

function pad2(n) { return String(n).padStart(2, '0'); }

// How far east of UTC `tz` sits at `instant`, in minutes (CEST = 120). Derived
// from nowInTimezone, so an unknown zone degrades to the browser's own offset.
function tzOffsetMinutes(tz, instant) {
  const w = nowInTimezone(tz, instant);
  return (Date.UTC(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), w.getMinutes(), w.getSeconds()) - instant.getTime()) / 60000;
}

// 'YYYY-MM-DD' + 'HH:MM', meant in `tz` → the instant. The inverse of
// nowInTimezone: pretend the wall-clock is UTC, shift by the zone's offset at
// that guess, then once more with the offset at the result — the second pass
// is what makes the DST edges come out right (an ambiguous hour resolves, a
// skipped one is pushed forward rather than lost).
function instantOf(date, time, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  const t = /^(\d{2}):(\d{2})/.exec(String(time || ''));
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0));
  try {
    const o1 = tzOffsetMinutes(tz, guess);
    let inst = new Date(guess.getTime() - o1 * 60000);
    const o2 = tzOffsetMinutes(tz, inst);
    if (o2 !== o1) inst = new Date(guess.getTime() - o2 * 60000);
    return inst;
  } catch {
    return guess;
  }
}

// A wall-clock typed in `fromTz`, read in `toTz`. The date can move — 19:30 in
// Berlin is 01:30 the next day in Manila. A value with NO time is a plain date
// (an all-day entry), not an instant, and comes back unchanged: "7 Oct" is
// 7 Oct for everyone.
function wallClockInZone(date, time, fromTz, toTz) {
  const d = String(date || '').slice(0, 10);
  if (!time) return { date: d, time: null };
  const inst = instantOf(d, time, fromTz);
  if (!inst) return { date: d, time: null };
  const w = nowInTimezone(toTz, inst);
  return { date: `${w.getFullYear()}-${pad2(w.getMonth() + 1)}-${pad2(w.getDate())}`, time: `${pad2(w.getHours())}:${pad2(w.getMinutes())}` };
}

// A stored row — the wall-clock a member typed plus the zone they were in
// (due_tz / event_tz; the default zone for a row written before that was
// recorded) — on THIS viewer's clock. Every renderer and every overdue check
// goes through this, so one member's 19:30 is another's 01:30, not 19:30.
function toViewerClock(date, time, tz) {
  return wallClockInZone(date, time, tz || DEFAULT_TIMEZONE, currentTimezone());
}

function startClock() {
  updateClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 1000);
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
}

function updateClock() {
  const el = document.getElementById('sidebar-clock');
  if (!el) return;
  const tz = currentTimezone();
  try {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: tz,
    });
  } catch {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
}

function renderTimezoneSetting() {
  const el = document.getElementById('timezone-select');
  if (!el) return;
  const current = currentTimezone();
  el.innerHTML = COMMON_TIMEZONES.map(tz => `
    <option value="${tz.value}" ${tz.value === current ? 'selected' : ''}>${esc(tz.label)}</option>
  `).join('');
}

async function saveTimezoneSetting() {
  const el = document.getElementById('timezone-select');
  if (!el) return;
  const timezone = el.value;
  const msgEl = document.getElementById('timezone-msg');
  const res = await api.patch('/api/auth/preferences', { timezone });
  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }
  if (currentUser) currentUser.timezone = timezone;
  updateClock();
  if (msgEl) { msgEl.textContent = 'Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}
