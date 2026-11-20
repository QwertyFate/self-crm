/* ═══════════════════════════════════════════════════════════════════════════
   VARIABLES IN A WORKFLOW STEP'S TEXTS — "Hello {{first_name}}"
   (CUSTOMER_JOURNEY_CHANGES Part 14, 2026-11-19; loaded after journey.js,
   whose step window shows what is built here; the server fills the same
   names when a step happens: utils/journey-vars.js).

   A VARIABLE is a name between two braces. When the step happens it is
   replaced by that contact's or deal's own value, so one text reads
   personally for everyone it goes to.

     {{first_name}}          the value
     {{ First_Name }}        the same: spaces and capitals do not count
     {{first_name|there}}    "there" when the value is empty
     {{vorname}}             the same value under its German name
     {{deal.<key>}}          one of the workspace's own deal fields
     {{contact.<key>}}       … or contact fields ({{kontakt.<key>}} too)

   A name the CRM does not know STAYS AS TYPED — in the sent text as well —
   so a typing mistake is seen, never silently emptied. The window says under
   the text which names those are; saving is not held back by it.

   WHERE  the subject and text of an email, and the title and text of a task,
   a WhatsApp and an SMS step (JOURNEY_VAR_KINDS). Not in a call step. The
   "no more emails" link ({{unsubscribe}}) exists in an email only.

   THE DAY AND THE TIME (Part 18, 2026-11-20)  {{date}}, {{time}},
   {{date_time}}, {{weekday}}, {{month}}, {{year}} say the moment the step
   happens, on the clock of whoever saved the step (the server stamps that
   person's time zone into the step). The line under the text names the zone;
   the preview shows the moment it is drawn, on the viewer's own clock.

   IN THE WINDOW  "Insert variable" opens the list — Contact, Deal, Person in
   charge, Date and time, Other, and the workspace's own fields by their names — and the
   choice goes in where the cursor is, in the field that was last in use
   (subject / title, or the text). The three most used stand beside it. In a
   German page the German name is put in where there is one.

   THE PREVIEW of an email (journey.js journeyPreviewHtml) fills every
   variable with a sample value; a workspace field shows its name in square
   brackets — the sample is the one the server's test email uses. A tick shows
   the same text for a contact about whom nothing is known, which is where a
   fallback ("|there") is seen. A value or a fallback is always text there,
   never markup.

   FUNCTION MAP  journeyVarWire, journeyVarBarHtml;
                 pure: journeyVarOf, journeyVarWord, journeyVarList,
                 journeyVarHas, journeyVarZone, journeyVarClock,
                 journeyVarSample, journeyVarFill, journeyVarUnknown,
                 journeyVarInsert
   ═══════════════════════════════════════════════════════════════════════════ */

// The variables by group, the German names for the same values, and what stands before one of the workspace's own
// fields — the server's GROUPS, ALIASES and FIELD_PREFIXES (utils/journey-vars.js).
const JOURNEY_VAR_GROUPS = { contact: ['name', 'first_name', 'last_name', 'email', 'phone', 'company'], deal: ['deal', 'deal_value', 'stage', 'pipeline'],
  owner: ['owner', 'owner_first_name', 'owner_email'], now: ['date', 'time', 'date_time', 'weekday', 'month', 'year'], other: ['workspace', 'today', 'meeting_date', 'meeting_time', 'unsubscribe'] };
const JOURNEY_VAR_ALIASES = { vorname: 'first_name', nachname: 'last_name', telefon: 'phone', firma: 'company', wert: 'deal_value', phase: 'stage', betreuer: 'owner',
  betreuer_vorname: 'owner_first_name', betreuer_email: 'owner_email', heute: 'today', termin_datum: 'meeting_date', termin_uhrzeit: 'meeting_time', abmelden: 'unsubscribe', unsubscribe_url: 'unsubscribe',
  datum: 'date', uhrzeit: 'time', datum_uhrzeit: 'date_time', wochentag: 'weekday', monat: 'month', jahr: 'year' };
const JOURNEY_VAR_PREFIXES = { 'deal.': 'deal', 'contact.': 'contact', 'kontakt.': 'contact' };
const JOURNEY_VAR_KINDS = ['email', 'whatsapp', 'sms', 'task'];   // the kinds of step whose texts are filled
const JOURNEY_VAR_QUICK = ['first_name', 'name', 'company'];      // one click away, beside "Insert variable"
// What each one is, in plain words, and the headings of the list.
const JOURNEY_VAR_GROUP_KEYS = { contact: 'jv_g_contact', deal: 'jv_g_deal', owner: 'jv_g_owner', now: 'jv_g_now', other: 'jv_g_other' };
const JOURNEY_VAR_KEYS = { name: 'jv_v_name', first_name: 'jv_v_first_name', last_name: 'jv_v_last_name', email: 'jv_v_email', phone: 'jv_v_phone', company: 'jv_v_company',
  deal: 'jv_v_deal', deal_value: 'jv_v_deal_value', stage: 'jv_v_stage', pipeline: 'jv_v_pipeline', owner: 'jv_v_owner', owner_first_name: 'jv_v_owner_first_name', owner_email: 'jv_v_owner_email',
  date: 'jv_v_date', time: 'jv_v_time', date_time: 'jv_v_date_time', weekday: 'jv_v_weekday', month: 'jv_v_month', year: 'jv_v_year',
  workspace: 'jv_v_workspace', today: 'jv_v_today', meeting_date: 'jv_v_meeting_date', meeting_time: 'jv_v_meeting_time', unsubscribe: 'jv_v_unsubscribe' };
// What the preview puts in their place: the values the server's test email uses (utils/journey-vars.js sampleValues),
// so the two read alike. The day of today and of the meeting are worked out when it is drawn: journeyVarSample.
const JOURNEY_VAR_SAMPLE = { name: 'Erika Musterfrau', first_name: 'Erika', last_name: 'Musterfrau', email: 'erika@example.de', phone: '+49 151 23456789', company: 'Muster GmbH',
  deal: 'Beispiel-Deal', deal_value: '250.000', stage: 'Erstgespräch', pipeline: 'Vertrieb', owner: 'Max Berater', owner_first_name: 'Max', owner_email: 'max@example.de',
  workspace: 'Muster Immobilien', meeting_time: '10:00', unsubscribe: '#' };

// What a name between the braces stands for, in a step of this kind: { name } — one of the list's — or
// { field, key, label } — one of the workspace's own fields ('deal' or 'contact') — or null: a name nobody knows.
function journeyVarOf(raw, kind = 'email') {
  const typed = String(raw ?? '').trim(), low = typed.toLowerCase();
  const name = Object.hasOwn(JOURNEY_VAR_ALIASES, low) ? JOURNEY_VAR_ALIASES[low] : low;
  if (Object.hasOwn(JOURNEY_VAR_KEYS, name)) return name === 'unsubscribe' && kind !== 'email' ? null : { name };   // the "no more emails" link is an email's
  const prefix = Object.keys(JOURNEY_VAR_PREFIXES).find(p => low.startsWith(p) && low.length > p.length);
  if (!prefix) return null;
  const side = JOURNEY_VAR_PREFIXES[prefix], key = low.slice(prefix.length);   // the key as it stands behind the dot: capitals do not count, a space does
  const field = (side === 'deal' ? journeyDealFields : journeyContactFields).find(f => f && String(f.field_key).toLowerCase() === key);
  return field ? { field: side, key: field.field_key, label: String(field.name || field.field_key) } : null;
}
// Whether a text of an email uses the variable `name` — under any of its names, with or without a fallback.
function journeyVarHas(text, name) {
  return [...String(text ?? '').matchAll(/\{\{([^{}]*)\}\}/g)].some(m => { const what = journeyVarOf(m[1].split('|')[0], 'email'); return !!what && what.name === name; });
}
// A variable as it is put into a text: under its German name in a German page, where it has one.
function journeyVarWord(name) {
  const german = currentLang === 'de' ? Object.keys(JOURNEY_VAR_ALIASES).find(a => JOURNEY_VAR_ALIASES[a] === name) : null;
  return `{{${german || name}}}`;
}
// What "Insert variable" offers in a step of this kind: [{ heading } | { label, insert }] — the groups in their
// order, then the workspace's own fields by their names. A field whose key could not stand between braces is left out.
function journeyVarList(kind) {
  const out = [];
  for (const group of Object.keys(JOURNEY_VAR_GROUPS)) {
    const names = JOURNEY_VAR_GROUPS[group].filter(n => journeyVarOf(n, kind));
    if (!names.length) continue;
    out.push({ heading: t(JOURNEY_VAR_GROUP_KEYS[group]) });
    for (const n of names) out.push({ label: t(JOURNEY_VAR_KEYS[n]), insert: journeyVarWord(n) });
  }
  const own = (fields, heading, prefix) => {
    const list = fields.filter(f => f && typeof f.field_key === 'string' && f.field_key && !/[{}|\s]/.test(f.field_key));
    if (!list.length) return;
    out.push({ heading: t(heading) });
    for (const f of list) out.push({ label: String(f.name || f.field_key), insert: `{{${prefix}.${f.field_key}}}` });
  };
  own(journeyDealFields, 'jv_g_deal_fields', 'deal');
  own(journeyContactFields, 'jv_g_contact_fields', currentLang === 'de' ? 'kontakt' : 'contact');   // both are in JOURNEY_VAR_PREFIXES
  return out;
}

// The time zone the day and the time of a step go by: that of whoever saves it — the person at the page (clock.js),
// which the server stamps into the step when it is saved.
function journeyVarZone() {
  const zone = typeof currentTimezone === 'function' ? currentTimezone() : '';
  return typeof zone === 'string' && zone ? zone : 'Europe/Berlin';
}
// The moment `now` on a zone's clock, as the server says it (utils/journey-vars.js clockValues): the day, the time,
// both, the weekday and the month by their German names — the language the automatic emails speak — and the year.
function journeyVarClock(now = new Date(), zone = journeyVarZone()) {
  const at = new Date(now), parts = z => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(x => [x.type, x.value]));
  let used = zone, p;
  try { p = parts(used); } catch (e) { used = 'Europe/Berlin'; p = parts(used); }   // a zone the browser does not know
  const named = part => new Intl.DateTimeFormat('de-DE', { timeZone: used, [part]: 'long' }).format(at);
  const date = `${p.day}.${p.month}.${p.year}`, time = `${p.hour}:${p.minute}`;
  return { date, time, date_time: `${date}, ${time}`, weekday: named('weekday'), month: named('month'), year: p.year, today: date };
}
// The values the preview fills in: the sample, with the day and the time as they are right now on the zone's clock
// and a meeting a week on, as the server's test email has them. bare: a contact about whom nothing is known — only
// what always has a value stays (the day and the time, the workspace, the "no more emails" link), so that a
// fallback is seen.
function journeyVarSample(now = new Date(), bare = false, zone = journeyVarZone()) {
  const clock = journeyVarClock(now, zone), [d, m, y] = clock.date.split('.').map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);   // that day, safely inside it
  const day = ms => { const x = new Date(ms); return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${x.getUTCFullYear()}`; };
  const always = { ...clock, workspace: JOURNEY_VAR_SAMPLE.workspace, unsubscribe: JOURNEY_VAR_SAMPLE.unsubscribe };   // the day and the time are known for every contact
  if (bare) return { ...Object.fromEntries(Object.keys(JOURNEY_VAR_KEYS).map(k => [k, ''])), ...always };
  return { ...JOURNEY_VAR_SAMPLE, meeting_date: day(noon + 7 * 86400000), ...always };
}
// A text with its variables filled in from `values`. A workspace field shows its name in square brackets (fields:
// false — nothing, as for a contact about whom nothing is known). An empty value gives what stands behind the bar,
// or nothing. html: a value and a fallback become text in markup. A name nobody knows stays exactly as typed.
function journeyVarFill(text, values, { html = false, kind = 'email', fields = true } = {}) {
  return String(text ?? '').replace(/\{\{([^{}]*)\}\}/g, (whole, inner) => {
    const bar = inner.indexOf('|'), what = journeyVarOf(bar < 0 ? inner : inner.slice(0, bar), kind);
    if (!what) return whole;
    const value = what.name ? String(values[what.name] ?? '') : fields ? `[${what.label}]` : '';
    const shown = value.trim() ? value : bar < 0 ? '' : inner.slice(bar + 1).trim();
    return html ? esc(shown).replace(/'/g, '&#39;') : shown;   // as text in markup, whichever quotes an attribute around it uses
  });
}
// What stands between braces in these texts and is no variable in a step of this kind: each once, as it was typed.
function journeyVarUnknown(texts, kind) {
  const out = [];
  for (const text of texts) {
    for (const m of String(text ?? '').matchAll(/\{\{([^{}]*)\}\}/g)) {
      const bar = m[1].indexOf('|');
      if (!journeyVarOf(bar < 0 ? m[1] : m[1].slice(0, bar), kind) && !out.includes(m[0])) out.push(m[0]);
    }
  }
  return out;
}
// A variable goes in where the cursor is — in place of what is marked — and the cursor then stands behind it.
function journeyVarInsert(field, text) {
  const value = String(field.value ?? ''), at = Number.isInteger(field.selectionStart) ? field.selectionStart : value.length, to = Number.isInteger(field.selectionEnd) ? field.selectionEnd : at;
  field.value = value.slice(0, at) + text + value.slice(to);
  if (field.focus) field.focus();
  if (field.setSelectionRange) field.setSelectionRange(at + text.length, at + text.length);
}

// Under a step's text: "Insert variable" with the most used ones beside it, what a variable is — and the place where
// the window says which names between braces are none.
function journeyVarBarHtml(fid) {
  return `<div class="jr-ph"><button type="button" class="btn btn-secondary btn-sm" data-jv-menu aria-haspopup="menu">${icon('plus')}<span>${esc(t('jv_insert'))}</span></button>${
      JOURNEY_VAR_QUICK.map(n => `<button type="button" class="chip" data-jv-put="${esc(journeyVarWord(n))}" title="${esc(t(JOURNEY_VAR_KEYS[n]))}">${esc(journeyVarWord(n))}</button>`).join('')}</div>
    <p class="help">${esc(t('jv_help'))}</p>
    <p class="help">${esc(tf('jv_zone', { zone: journeyVarZone() }))}</p>
    <p class="jr-vars-note" id="${fid}-unknown" role="status" hidden></p>`;
}
// The variables at work in a step's window (w: what journeyWindow answered). A choice goes into the field that was
// last in use — the title (an email's subject) or the text; until one was, the text. redraw: what else follows a
// change of the texts (an email's preview).
function journeyVarWire(w, kind, redraw) {
  let last = 'text';
  const note = () => {
    const el = w.el('unknown'), names = journeyVarUnknown([w.el('title').value, w.el('text').value], kind);
    if (!el) return;
    el.textContent = names.length ? tf('jv_unknown', { names: names.join(', ') }) : '';
    el.hidden = !names.length;
  };
  const put = text => { journeyVarInsert(w.el(last), text); note(); if (redraw) redraw(); };   // a value set from here fires no "input": what follows one is done by hand
  on(w.m.el, 'focusin', 'input, textarea', (e, el) => { const part = String((el && el.id) || '').replace(/^.*-/, ''); if (part === 'title' || part === 'text') last = part; });
  on(w.m.el, 'click', '[data-jv-put]', (e, chip) => put(chip.dataset.jvPut));
  on(w.m.el, 'click', '[data-jv-menu]', (e, btn) => ui.menu(btn,
    journeyVarList(kind).map(it => (it.heading ? it : { label: it.label, hint: it.insert, onSelect: () => put(it.insert) })), { className: 'menu jr-vars-menu' }));
  on(w.m.el, 'input', 'input, textarea', note);
  note();
}
