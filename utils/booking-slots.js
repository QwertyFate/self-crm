/* ═══════════════════════════════════════════════════════════════════════════
   BOOKING SLOTS — the free times of the workspace's booking service, read for
   fonio's assistant (FONIO_CHANGES Part 29).

   A meeting the assistant agrees in a call is booked at Cal.com or Calendly
   afterwards (utils/fonio-meeting.js), which only works when that time is
   free. So every call the CRM starts carries the next free times as context:
   the same times the service's own booking page offers for the event type
   chosen on its card.

     freeSlots(pool, wid, from)   → { service: 'calcom' | 'calendly', zone, slots: [ms, …] } ascending, from `from`
                                    on; null when no service is connected, no event type is chosen, the stored key
                                    cannot be opened, or the service does not answer in time. Never throws.
     slotsText(slots, zone)       → the times as one line for a prompt, on the zone's clock:
                                    "Do 20.11.2026: 09:00, 09:30; Fr 21.11.2026: 14:00"
     slotsJson(slots, zone)       → the same as a JSON list: ["2026-11-20 09:00", …]
     todayText(now, zone)         → "Donnerstag, 12.11.2026": the assistant must know today to name a day

   READ ONLY: nothing is booked here and nobody is invited. Cal.com answers
   /v2/slots for the whole range at once; Calendly's
   /event_type_available_times is asked a week at a time from a minute after
   now (it refuses a start in the past), the second week only when the first
   has nothing. The lookup gives up after TIMEOUT_MS: a call never waits long
   for its context.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom   = require('./calcom');
const calendly = require('./calendly');

const DAYS       = 14;
const TIMEOUT_MS = 5000;
const DAY_MS     = 24 * 60 * 60000;
const MAX_DAYS_SAID  = 5;   // days with a free time that go into the prompt
const MAX_TIMES_A_DAY = 8;

async function calcomSlots(row, from) {
  if (!row.event_type_id) return null;
  const days = await calcom.getSlots(calcom.openKey(row.api_key_sealed), { eventTypeId: row.event_type_id, start: new Date(from).toISOString(), end: new Date(from + DAYS * DAY_MS).toISOString(), timeZone: 'UTC' });
  return Object.values(days).flat().map(s => Date.parse(s.start));
}

async function calendlySlots(row, from) {
  if (!row.event_type_uri) return null;
  const token = calcom.openKey(row.token_sealed);
  for (let start = from + 60000; start < from + DAYS * DAY_MS; start += 7 * DAY_MS) {
    const list = await calendly.listAvailableTimes(token, { eventType: row.event_type_uri, start: new Date(start).toISOString(), end: new Date(Math.min(start + 7 * DAY_MS, from + DAYS * DAY_MS)).toISOString() });
    if (list.length) return list.map(s => Date.parse(s));
  }
  return [];
}

async function lookUp(pool, wid, from) {
  const { rows: [cal] } = await pool.query('SELECT api_key_sealed, event_type_id, cal_timezone FROM workspace_calcom WHERE workspace_id = $1', [wid]);
  const { rows: [cly] } = cal ? { rows: [] } : await pool.query('SELECT token_sealed, event_type_uri, cly_timezone FROM workspace_calendly WHERE workspace_id = $1', [wid]);
  if (!cal && !cly) return null;
  const times = cal ? await calcomSlots(cal, from) : await calendlySlots(cly, from);
  if (!times) return null;
  return {
    service: cal ? 'calcom' : 'calendly', zone: (cal ? cal.cal_timezone : cly.cly_timezone) || calcom.FALLBACK_ZONE,
    slots: [...new Set(times.filter(t => Number.isFinite(t) && t >= from))].sort((a, b) => a - b),
  };
}

async function freeSlots(pool, wid, from = Date.now(), { timeoutMs = TIMEOUT_MS } = {}) {
  let timer;
  try {
    return await Promise.race([
      lookUp(pool, wid, new Date(from).getTime()),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// The first days that have a free time, each with its first times, on the zone's clock: [{ date, times: ['09:00', …] }].
function byDay(slots, zone) {
  const days = [];
  for (const s of slots) {
    const wc = calcom.wallClock(new Date(s).toISOString(), zone);
    let d = days.find(x => x.date === wc.date);
    if (!d) { if (days.length === MAX_DAYS_SAID) break; d = { date: wc.date, times: [] }; days.push(d); }
    if (d.times.length < MAX_TIMES_A_DAY && !d.times.includes(wc.time)) d.times.push(wc.time);
  }
  return days;
}
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const weekday = date => WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
const german  = date => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;

function slotsText(slots, zone) {
  return byDay(slots, zone).map(d => `${weekday(d.date).slice(0, 2)} ${german(d.date)}: ${d.times.join(', ')}`).join('; ');
}
function slotsJson(slots, zone) {
  return JSON.stringify(byDay(slots, zone).flatMap(d => d.times.map(t => `${d.date} ${t}`)));
}
function todayText(now, zone) {
  const wc = calcom.wallClock(new Date(now).toISOString(), zone);
  return `${weekday(wc.date)}, ${german(wc.date)}`;
}

module.exports = { freeSlots, slotsText, slotsJson, todayText, byDay, DAYS, TIMEOUT_MS, MAX_DAYS_SAID, MAX_TIMES_A_DAY };
