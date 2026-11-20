/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY VARS — the variables a workflow step's text can use
   (CUSTOMER_JOURNEY_CHANGES Part 14, 2026-11-19; utils/journey-run.js fills an
   email's subject and text and a task's / WhatsApp's / SMS's title and text
   with them, routes/journey.js the test email, public/js/journey.js offers
   them and shows a preview with the same sample values).

   THE SYNTAX
     {{name}}        the value; spaces inside the braces and capitals do not
                     matter
     {{name|text}}   the value — or `text` when there is none
                     ("Hello {{first_name|there}}")
   A name nobody knows stays exactly as it was typed, so a mistake is seen in
   the test email instead of leaving a hole. In an HTML email a value and a
   fallback are text: whatever a contact is called cannot become markup.

   THE VARIABLES (GROUPS; German names in ALIASES)
     contact   name, first_name (its first word), last_name (the rest), email,
               phone, company
     deal      deal (its title), deal_value (deals.value with German grouping,
               no currency sign), stage, pipeline (their names)
     owner     owner (the user the deal is assigned to), owner_first_name,
               owner_email — empty when nobody is assigned
     now       the moment the step happens (Part 18, 2026-11-20): date
               (dd.mm.yyyy), time (hh:mm), date_time (both), weekday and
               month (their German names), year — on the clock of whoever
               saved the step: routes/journey.js stamps that person's time
               zone into the step (config.tz), as it does for a Wait box; a
               step saved before, or a zone that is none, goes by
               Europe/Berlin. In the test email: the clock of who asks for it.
     other     workspace (its name), today (the same day as date),
               meeting_date / meeting_time (the next meeting of the
               deal — or of its contact where the entry names no deal — that is
               not cancelled and lies today or later), unsubscribe (the
               contact's "no more emails" link; an email puts it in itself —
               journey-run.js emailParts — everywhere else it is empty)

   THE WORKSPACE'S OWN FIELDS
     {{deal.<field_key>}}, {{contact.<field_key>}} (also {{kontakt.…}}): the
     value as text — a list joined with ", ", true / false as "ja" / "nein".
     A key that is no field of the workspace stays as typed. A key is always a
     value handed to the database, or looked up among the row's OWN keys; it
     is never part of a statement.

   ONLY WHAT A TEXT USES IS ASKED FOR: the next meeting is looked up when a
   text names it, the field lists when a text names a field. Everything else
   the engine's row already holds.

   Every function takes the pool; nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom = require('./calcom');   // wallClock: a day on a zone's clock

const ZONE = 'Europe/Berlin';   // the clock "today or later" goes by, and the day and time of a step that names no zone
// `now` (Part 18): the moment the step happens, on the clock of whoever saved the step — the route stamps that
// person's time zone into the step (config.tz), as it does for a Wait box. A step saved before goes by ZONE.
const GROUPS = {
  contact: ['name', 'first_name', 'last_name', 'email', 'phone', 'company'],
  deal:    ['deal', 'deal_value', 'stage', 'pipeline'],
  owner:   ['owner', 'owner_first_name', 'owner_email'],
  now:     ['date', 'time', 'date_time', 'weekday', 'month', 'year'],
  other:   ['workspace', 'today', 'meeting_date', 'meeting_time', 'unsubscribe'],
};
const NAMES = Object.values(GROUPS).flat();
const KINDS = ['email', 'whatsapp', 'sms', 'task'];   // the kinds of step whose title and text are filled
const ALIASES = { vorname: 'first_name', nachname: 'last_name', telefon: 'phone', firma: 'company', wert: 'deal_value', phase: 'stage', betreuer: 'owner',
  betreuer_vorname: 'owner_first_name', betreuer_email: 'owner_email', heute: 'today', termin_datum: 'meeting_date', termin_uhrzeit: 'meeting_time', abmelden: 'unsubscribe', unsubscribe_url: 'unsubscribe',
  datum: 'date', uhrzeit: 'time', datum_uhrzeit: 'date_time', wochentag: 'weekday', monat: 'month', jahr: 'year' };
const FIELD_PREFIXES = { 'deal.': 'deal', 'contact.': 'contact', 'kontakt.': 'contact' };
// Which of the keys a text names are fields of the workspace: one fixed statement for a deal's fields, one for a
// contact's. The keys are handed over as a value ($2), in small letters.
const FIELD_LISTS = {
  deal:    'SELECT field_key, name FROM deal_fields WHERE workspace_id = $1 AND LOWER(field_key) = ANY($2::text[])',
  contact: 'SELECT field_key, name FROM custom_fields WHERE workspace_id = $1 AND LOWER(field_key) = ANY($2::text[])',
};

// {{ name }} or {{ name | fallback }} — anything but braces; the first bar parts the name from the fallback.
const PATTERN = /\{\{([^{}|]*)(?:\|([^{}]*))?\}\}/g;
const htmlText = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clean = v => (v === null || v === undefined ? '' : String(v).trim());

// What a name between the braces stands for: one of NAMES, 'deal.<key>' / 'contact.<key>' (the key in small
// letters), or null for nothing at all. Capitals and outer spaces do not matter; German names are the English ones.
function keyOf(raw) {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!name) return null;
  if (Object.hasOwn(ALIASES, name)) return ALIASES[name];
  for (const prefix of Object.keys(FIELD_PREFIXES)) {
    if (name.startsWith(prefix)) return `${FIELD_PREFIXES[prefix]}.${name.slice(prefix.length)}`;
  }
  return name;
}
// The keys the texts name: a Set of what keyOf answers.
function usedIn(texts) {
  const used = new Set();
  for (const text of Array.isArray(texts) ? texts : [texts]) {
    for (const m of String(text ?? '').matchAll(PATTERN)) { const key = keyOf(m[1]); if (key) used.add(key); }
  }
  return used;
}

// {{name}} → its value, {{name|text}} → the value or the text. `values` holds a key for everything that is known
// (keyOf's keys); a name that is not among its OWN keys stays as typed. asHtml: value and fallback as text in HTML.
function fill(template, values, asHtml) {
  const known = values && typeof values === 'object' ? values : {};
  return String(template ?? '').replace(PATTERN, (whole, raw, fallback) => {
    const key = keyOf(raw);
    if (key === null || !Object.hasOwn(known, key)) return whole;
    const value = clean(known[key]) ? String(known[key]) : clean(fallback);
    return asHtml ? htmlText(value) : value;
  });
}

// ── what a value looks like as text ─────────────────────────────────────────
const firstWord = name => clean(name).split(/\s+/)[0] || '';
const restWords = name => clean(name).split(/\s+/).slice(1).join(' ');
// A day 'YYYY-MM-DD' as dd.mm.yyyy.
const dayText = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
const todayOn = now => calcom.wallClock(new Date(now).toISOString(), ZONE).date;   // 'YYYY-MM-DD' on the clock above
// The moment `now` on a zone's clock, as the variables say it: the day ("20.11.2026"), the time ("14:30"), both,
// the weekday and the month by their German names — the language the automatic emails speak — and the year. A zone
// that is none is ZONE. {{today}} is the same day as {{date}}.
function clockValues(now, zone) {
  const at = new Date(now), clock = calcom.wallClock(at.toISOString(), typeof zone === 'string' && zone ? zone : ZONE);
  const named = part => new Intl.DateTimeFormat('de-DE', { timeZone: clock.zone, [part]: 'long' }).format(at);
  const date = dayText(clock.date);
  return { date, time: clock.time, date_time: `${date}, ${clock.time}`, weekday: named('weekday'), month: named('month'), year: clock.date.slice(0, 4), today: date };
}
// A deal's value with German grouping and no currency sign: "250.000", "1.250,50"; nothing for no value.
function valueText(v) {
  if (clean(v) === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e15) return '';
  const abs = Math.abs(n), [whole, cents] = (Number.isInteger(abs) ? String(abs) : abs.toFixed(2)).split('.');
  return (n < 0 ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (cents ? ',' + cents : '');
}
// What a field holds, as text: a list joined with ", ", true / false as "ja" / "nein", nothing as nothing.
function fieldText(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(', ');
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'object') return '';   // nothing a text could say
  return String(v).trim();
}

// ── the values for one deal ─────────────────────────────────────────────────
// Everything the engine's row says by itself. x: the row runOne read.
function rowValues(x, now = new Date()) {
  const r = x || {};
  const { today, ...clock } = clockValues(now, r.config && typeof r.config === 'object' ? r.config.tz : null);   // on the clock of whoever saved the step
  return {
    name: clean(r.contact_name), first_name: firstWord(r.contact_name), last_name: restWords(r.contact_name),
    email: clean(r.contact_email), phone: clean(r.contact_phone), company: clean(r.contact_company),
    deal: clean(r.deal_title), deal_value: valueText(r.deal_value), stage: clean(r.stage_name), pipeline: clean(r.pipeline_name),
    owner: clean(r.owner_name), owner_first_name: firstWord(r.owner_name), owner_email: clean(r.owner_email),
    ...clock,
    workspace: clean(r.workspace_name), today, meeting_date: '', meeting_time: '', unsubscribe: '',
  };
}
// The next meeting of the deal — or of its contact where the entry names no deal — that is not cancelled and lies
// today or later: { meeting_date, meeting_time }, both empty when there is none. The time is the entry's own clock.
async function nextMeeting(pool, x, now = new Date()) {
  const { rows: [m] } = await pool.query(
    `SELECT to_char(a.event_date, 'DD.MM.YYYY') AS day, to_char(a.event_time, 'HH24:MI') AS time
       FROM activities a
      WHERE a.workspace_id = $1 AND a.type = 'meeting' AND a.cancelled_at IS NULL AND a.event_date IS NOT NULL AND a.event_date >= $4::date
        AND (a.deal_id = $2 OR (a.deal_id IS NULL AND a.contact_id = $3))
      ORDER BY a.event_date, a.event_time NULLS LAST, a.id LIMIT 1`, [x.workspace_id, x.deal_id, x.contact_id || null, todayOn(now)]
  );
  return { meeting_date: m ? clean(m.day) : '', meeting_time: m ? clean(m.time) : '' };
}
// The workspace's fields among the keys the texts name: [{ of: 'deal' | 'contact', key, field_key, name }] — `key` as
// keyOf answers it ('deal.finanzierung'), `field_key` as the workspace wrote it. A key that is no field is not here.
async function fieldsNamed(pool, workspaceId, used) {
  const found = [];
  for (const of of Object.keys(FIELD_LISTS)) {
    const wanted = [...used].filter(k => k.startsWith(of + '.')).map(k => k.slice(of.length + 1)).filter(Boolean);   // "{{deal.}}" names no field
    if (!wanted.length) continue;
    const { rows } = await pool.query(FIELD_LISTS[of], [workspaceId, wanted]);
    for (const f of rows) found.push({ of, key: `${of}.${String(f.field_key).toLowerCase()}`, field_key: String(f.field_key), name: clean(f.name) });
  }
  return found;
}
// Every value the given texts can use, for one deal. Asks the database only for what the texts name: the next
// meeting, and which of the named fields are the workspace's. x: the row runOne read (with deal_data, contact_data).
async function valuesFor(pool, x, texts, now = new Date()) {
  const used = usedIn(texts), values = rowValues(x, now);
  if (used.has('meeting_date') || used.has('meeting_time')) Object.assign(values, await nextMeeting(pool, x, now));
  if ([...used].some(k => k.includes('.'))) {
    const data = { deal: x.deal_data, contact: x.contact_data };
    for (const f of await fieldsNamed(pool, x.workspace_id, used)) {
      const own = data[f.of] && typeof data[f.of] === 'object' && !Array.isArray(data[f.of]) ? data[f.of] : {};
      values[f.key] = fieldText(Object.hasOwn(own, f.field_key) ? own[f.field_key] : null);
    }
  }
  return values;
}

// ── sample values: the test email, and what the page's preview mirrors ──────
function sampleValues(now = new Date(), zone = ZONE) {
  const { today, ...clock } = clockValues(now, zone);   // the day and the time are real: the moment the test is sent, on the given clock
  const next = new Date(Date.parse(`${clock.year}-${today.slice(3, 5)}-${today.slice(0, 2)}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);   // the meeting: a week on
  return {
    name: 'Erika Musterfrau', first_name: 'Erika', last_name: 'Musterfrau', email: 'erika@example.de', phone: '+49 151 23456789', company: 'Muster GmbH',
    deal: 'Beispiel-Deal', deal_value: '250.000', stage: 'Erstgespräch', pipeline: 'Vertrieb',
    owner: 'Max Berater', owner_first_name: 'Max', owner_email: 'max@example.de',
    ...clock,
    workspace: 'Muster Immobilien', today, meeting_date: dayText(next), meeting_time: '10:00', unsubscribe: '',
  };
}
// The sample values for a step of this workspace: every variable, and for each of the workspace's fields the texts
// name its own name in brackets ("[Finanzierung]"). A field that is none stays as typed, as in a real email.
async function sampleFor(pool, workspaceId, texts, now = new Date(), zone = ZONE) {
  const used = usedIn(texts), values = sampleValues(now, zone);
  if ([...used].some(k => k.includes('.'))) for (const f of await fieldsNamed(pool, workspaceId, used)) values[f.key] = `[${f.name || f.field_key}]`;
  return values;
}

module.exports = { ZONE, GROUPS, NAMES, KINDS, ALIASES, FIELD_PREFIXES, clockValues, keyOf, usedIn, fill, valueText, fieldText, rowValues, nextMeeting, fieldsNamed, valuesFor, sampleValues, sampleFor };
