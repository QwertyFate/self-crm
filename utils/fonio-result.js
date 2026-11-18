/* ═══════════════════════════════════════════════════════════════════════════
   FONIO RESULT — what fonio sends after a call, read and turned into the
   note on the deal (FONIO_CHANGES Part 7). fonio's public API cannot fetch a
   call or its transcript (utils/fonio.js); fonio sends them by itself through
   an "HTTP Request" added to the assistant in fonio — Run "After the
   conversation", POST, the workspace's result link (routes/fonio.js
   /receive/:token). Its Body is JSON written in fonio with fonio's variables
   (fonio.info/en/developers/http-request and /integrations/zapier, read
   2026-11-09): {{conversationId}}, {{conversationLink}}, {{personNumber}},
   {{agentNumber}}, {{direction}}, {{startTimestamp}}, and from "Add Variable"
   Summary, Plain transcript and Duration. The context the CRM sent with the
   call (crm_call_id …) may be usable there too; fonio does not say.

   NAMES  The Body's names are whoever wrote it, so a few are read for each
   value (FIELDS), the first filled one wins. A value fonio left as its
   {{placeholder}} counts as empty. The contact's number is not read by name:
   every value that is a phone number other than the workspace's own fonio
   number is a candidate (fonio's own default Body calls the person's number
   "from").

   parseBody() reads the bytes as JSON; when that fails, once more with line
   breaks and tabs inside strings escaped, in case fonio puts a transcript
   into a JSON string as it is. null when it is still not a JSON object.

   A MEETING AGREED IN THE CALL (Part 28)  The Body may carry meeting_booked
   (yes / no), meeting_date and meeting_time, and meeting_email: variables of
   the workspace's own in fonio, filled by the assistant. readMeeting() reads
   them forgivingly (20.11.2026, "14 Uhr"); utils/fonio-meeting.js books it.

   HOW THE CALL ENDED (Part 33)  The Body may carry call_outcome, a variable of
   the workspace's own: answered, no_answer, voicemail or busy. readOutcome()
   reads it forgivingly (German words and near misses too) and returns null for
   anything it cannot be sure of, so nothing is guessed from the summary. The
   queue uses it to decide whether the call is tried again (utils/fonio-calls.js
   followUpAfterResult).

   A CALLBACK THE PERSON ASKED FOR (Part 35)  "No time now, call me this
   afternoon." The Body may carry callback_date and callback_time, variables of
   the workspace's own. readCallback() reads what the assistant wrote there —
   a date, "heute" / "tomorrow", a weekday, a clock time, a part of the day, or
   "in 2 hours" — and leaves everything that depends on today unresolved;
   utils/fonio-calls.js callbackInstant() makes the instant of it on the
   workspace's clock and callbackAfterResult() plans the call.

   WHAT CAME OUT OF THE CONVERSATION (Part 39)  The Body may carry lead_status,
   a variable of the workspace's own: interested, meeting_booked, callback,
   not_interested or wrong_person. readLeadStatus() reads it forgivingly and
   returns null for anything it cannot be sure of; utils/fonio-stage.js moves
   the deal by the workspace's table.

   resultNote() is the note's text, in German (the product's language; the
   Notetaker's notes are German by default too). Duration is shown as fonio
   sends it: its unit is not documented. The first line also says how the call
   ended when fonio said so.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fonio = require('./fonio');   // compactNumber, isE164

const FIELDS = {
  crmCallId:      ['crm_call_id', 'crmCallId'],
  conversationId: ['conversation_id', 'conversationId', 'id'],
  link:           ['conversation_link', 'conversationLink', 'link'],
  direction:      ['direction'],
  duration:       ['duration', 'call_duration', 'callDuration'],
  summary:        ['summary', 'conversation_summary', 'conversationSummary'],
  transcript:     ['transcript', 'plain_transcript', 'plainTranscript'],
  name:           ['caller_name', 'callerName', 'person_name', 'personName'],
  // a meeting the assistant agreed with the person in the call (Part 28): the workspace's own variables in fonio
  meetingBooked:  ['meeting_booked', 'meetingBooked', 'termin_gebucht'],
  meetingDate:    ['meeting_date', 'meetingDate', 'termin_datum'],
  meetingTime:    ['meeting_time', 'meetingTime', 'termin_uhrzeit'],
  meetingEmail:   ['meeting_email', 'meetingEmail'],
  // how the call ended, a variable of the workspace's own (Part 33)
  callOutcome:    ['call_outcome', 'callOutcome', 'call_status', 'callStatus', 'outcome', 'ergebnis'],
  // when the person asked to be called back (Part 35): the workspace's own variables in fonio
  callbackDate:   ['callback_date', 'callbackDate', 'rueckruf_datum'],
  callbackTime:   ['callback_time', 'callbackTime', 'rueckruf_uhrzeit'],
  // what came out of the conversation (Part 39): a variable of the workspace's own, one of LEAD_STATUSES
  leadStatus:     ['lead_status', 'leadStatus', 'lead_result', 'leadResult', 'gespraechsergebnis'],
};
const MAX_SUMMARY = 4000, MAX_TRANSCRIPT = 200000;
// What an AI writes into caller_name when the person never said their name (Part 15).
const NO_NAME = /^(unbekannt|unknown|nicht genannt|nicht bekannt|not given|not provided|none|null|n\/a|-+)$/i;
// A variable fonio did not fill ({{name}}), or a <value> of the CRM's suggested Body that was never replaced in fonio.
const PLACEHOLDER = /^(\{\{[^}]*\}\}|<[^<>]*>)$/;

const NOT_RECORDED = 'Keine Aufzeichnung: fonio hat weder eine Zusammenfassung noch ein Transkript mitgeschickt. '
  + 'Das ist so, wenn die Person die Aufzeichnung abgelehnt hat oder kein Gespräch zustande kam.';

const asObject = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

// Raw control characters inside JSON strings, escaped; everything outside strings untouched.
function escapeInStrings(s) {
  let out = '', inString = false, escaped = false;
  for (const ch of s) {
    if (!inString) { if (ch === '"') inString = true; out += ch; continue; }
    if (escaped) { escaped = false; out += ch; continue; }
    if (ch === '\\') escaped = true;
    else if (ch === '"') inString = false;
    else if (ch === '\n') { out += '\\n'; continue; }
    else if (ch === '\r') { out += '\\r'; continue; }
    else if (ch === '\t') { out += '\\t'; continue; }
    else if (ch < ' ') { out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'); continue; }
    out += ch;
  }
  return out;
}

function parseBody(raw) {
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return asObject(raw);   // a body another parser already read
  const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  try { return asObject(JSON.parse(s)); } catch { /* once more below */ }
  try { return asObject(JSON.parse(escapeInStrings(s))); } catch { return null; }
}

// The first filled value under one of the names, as trimmed text ('' for none).
function pick(body, names) {
  for (const n of names) {
    const v = body[n];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v !== 'string') continue;
    const s = v.replace(/\r\n?/g, '\n').trim();
    if (s && !PLACEHOLDER.test(s)) return s;
  }
  return '';
}

// ── a meeting agreed in the call (Part 28) ──
const YES = /^(yes|ja|true|1|y|j|booked|gebucht)\b/i, NO = /^(no|nein|false|0|n|none|null|kein\w*|n\/a|-+)(?![a-z0-9])/i;
const pad = n => String(n).padStart(2, '0');
// A real calendar day as YYYY-MM-DD, or null.
function day(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}
// The day as an AI may write it: 2026-11-20 (also at the start of a date-time), 20.11.2026, 20.11.26, 20/11/2026.
function readDate(s) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s);
  if (m) return day(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d)/.exec(s);
  return m ? day(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) : null;
}
// The time as HH:MM: 14:00, 14.00, 9:30, "14 Uhr", "14:30 Uhr", "2:30 pm"; also the time of a date-time.
function readTime(s) {
  const t = s.replace(/^\d{4}-\d{1,2}-\d{1,2}[T ]/, '').trim();
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*(am|pm|uhr)?\b/i.exec(t);
  if (!m || (m[2] === undefined && !m[3] && !/^\d{1,2}$/.test(t))) return null;
  let h = +m[1]; const min = m[2] === undefined ? 0 : +m[2], half = (m[3] || '').toLowerCase();
  if (half === 'pm' && h < 12) h += 12;
  if (half === 'am' && h === 12) h = 0;
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}
// The meeting the result names: { date, time, email, said } (date and time null when they could not be read; said =
// what fonio wrote, for the note), or null when it names none. A plain "no" is none; with no yes/no at all, a
// readable date AND time count as a meeting.
function readMeeting(b) {
  const flag = pick(b, FIELDS.meetingBooked), rawDate = pick(b, FIELDS.meetingDate), rawTime = pick(b, FIELDS.meetingTime);
  if (NO.test(flag)) return null;
  const date = readDate(rawDate), time = readTime(rawTime) || (rawDate.length > 10 ? readTime(rawDate) : null);
  if (!YES.test(flag) && !(date && time)) return null;
  const email = pick(b, FIELDS.meetingEmail).toLowerCase().slice(0, 200);
  return { date, time, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null, said: [rawDate, rawTime].filter(Boolean).join(' ').slice(0, 80) || null };
}

// ── a callback the person asked for (Part 35) ──
// A word of its own in a sentence: \b does not know ä, ö, ü, ß, so the neighbours are named.
const word = alts => new RegExp(`(?<![a-zäöüß0-9])(?:${alts})(?![a-zäöüß0-9])`, 'i');
// The hour that stands for a part of the day when the person named no exact time (the workspace's choice, 2026-11-17).
const DAY_PARTS = [
  [word('vormittags?|morgens|am morgen|heute morgen|morgen früh|in der früh|morning'), '10:00'],
  [word('mittags?|midday|noon|lunchtime'), '12:00'],
  [word('nachmittags?|afternoon'), '15:00'],
  [word('abends?|evening|tonight'), '18:00'],
];
const WEEKDAYS = [['montags?|mondays?', 1], ['dienstags?|tuesdays?', 2], ['mittwochs?|wednesdays?', 3], ['donnerstags?|thursdays?', 4], ['freitags?|fridays?', 5], ['samstags?|sonnabends?|saturdays?', 6], ['sonntags?|sundays?', 7]]
  .map(([alts, n]) => [word(alts), n]);
const COUNT_WORDS = { ein: 1, eine: 1, einer: 1, einem: 1, a: 1, an: 1, one: 1, zwei: 2, two: 2, drei: 3, three: 3, vier: 4, four: 4 };
const countOf = s => (/^\d+$/.test(s) ? +s : COUNT_WORDS[s.toLowerCase()] || 0);
// "in 30 Minuten", "in einer Stunde", "in 2 hours", "in einer halben Stunde", "in half an hour" → minutes; else null.
function minutesFromNow(text) {
  if (/(?<![a-zäöüß])in\s+(?:einer\s+halben\s+stunde|half\s+an\s+hour)/i.test(text)) return 30;
  const m = /(?<![a-zäöüß])in\s+(\d{1,3}|[a-z]+)\s*(min\w*|std\w*|stunden?|hours?|h)(?![a-zäöüß])/i.exec(text);
  if (!m) return null;
  const n = countOf(m[1]);
  const minutes = /^min/i.test(m[2]) ? n : n * 60;
  return minutes >= 1 && minutes <= 14 * 24 * 60 ? minutes : null;
}
// "in 2 Tagen", "in three days" → the days from today; else null.
function daysFromNow(text) {
  const m = /(?<![a-zäöüß])in\s+(\d{1,2}|[a-z]+)\s*(tag(?:en|e)?|days?)(?![a-zäöüß])/i.exec(text);
  const n = m ? countOf(m[1]) : 0;
  return n >= 1 && n <= 14 ? n : null;
}
// A clock time anywhere in a sentence: "15:30", "15.30 Uhr", "15 Uhr", "3 pm", "um 3", "at 3". An hour from 1 to 6
// that is not marked as the morning's is the afternoon's: nobody asks to be called at three at night.
function clockIn(text, morning) {
  const m = /(?<![\d.:])(\d{1,2})[:.](\d{2})(?::\d{2}(?:\.\d+)?)?(?!\d|[.:]\d)\s*(am|pm)?/i.exec(text)
    || /(?<![\d.:])(\d{1,2})()\s*(uhr|am|pm|h)(?![a-zäöüß])/i.exec(text)
    || /(?<![a-zäöüß])(?:um|gegen|ab|at|around|by)\s+(\d{1,2})()()(?![\d.:])/i.exec(text)
    || /^(\d{1,2})()()$/.exec(text.trim());
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0, mark = (m[3] || '').toLowerCase();
  if (h > 23 || min > 59) return null;
  if (mark === 'pm' && h < 12) h += 12;
  else if (mark === 'am' && h === 12) h = 0;
  else if (mark !== 'am' && !morning && h >= 1 && h <= 6) h += 12;
  return `${pad(h)}:${pad(min)}`;
}
// What the result says about a callback: null when it names none (empty, a plain "no"); { unreadable: true, said }
// when it names one this cannot read ("later"); else { day, time, minutes, said }:
//   minutes  from now ("in 2 hours"), or null
//   day      { date: 'YYYY-MM-DD' } | { offset: n } (0 today, 1 tomorrow, … "in 3 days") | { weekday: 1–7 } | null
//   time     'HH:MM': the clock time, else the hour of the part of the day named, else null
// `said` is what fonio wrote, for the note. Both fields are read as one sentence, so "morgen 15 Uhr" in one of them
// is understood too.
function readCallback(body) {
  const b = asObject(body) || {};
  const rawDate = pick(b, FIELDS.callbackDate), rawTime = pick(b, FIELDS.callbackTime);
  const said = [rawDate, rawTime].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 80);
  if (!said || [rawDate, rawTime].filter(Boolean).every(s => NO.test(s))) return null;
  const minutes = minutesFromNow(said);
  if (minutes) return { day: null, time: null, minutes, said };
  const date = readDate(rawDate) || readDate(rawTime);
  // the sentence without its date, so "20.11." is not taken for a time ("15.30." is no date: there is no month 30)
  const text = said.replace(/\d{4}-\d{1,2}-\d{1,2}[T ]?/g, ' ')
    .replace(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})?(?!\d)/g, (all, d, mo) => (+d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12 ? ' ' : all));
  const part = DAY_PARTS.find(([re]) => re.test(text));
  const iso = /^\d{4}-\d{1,2}-\d{1,2}[T ]\d/.test(rawDate) ? readTime(rawDate) : null;   // a date-time in the date field
  const morning = !!part && part[1] === '10:00';
  // the time field alone is tried too: a bare "18" there is an hour, in a sentence it could be anything
  const time = iso || clockIn(text, morning) || clockIn(rawTime, morning) || (part ? part[1] : null);
  const inDays = daysFromNow(text);
  let day = null;
  if (date) day = { date };
  else if (inDays) day = { offset: inDays };
  else if (word('heute|today|tonight|this morning|this afternoon|this evening').test(text)) day = { offset: 0 };
  else if (word('übermorgen|uebermorgen|day after tomorrow').test(text)) day = { offset: 2 };
  else if (word('morgen|tomorrow').test(text.replace(word('am morgen'), ' '))) day = { offset: 1 };   // "am Morgen" is the morning, not tomorrow
  else { const w = WEEKDAYS.find(([re]) => re.test(text)); if (w) day = { weekday: w[1] }; }
  return day || time ? { day, time, minutes: null, said } : { unreadable: true, said };
}

// How the call ended, as the assistant wrote it (Part 33): 'answered', 'no_answer', 'voicemail', 'busy', or null when
// fonio said nothing this can be sure of (nothing is guessed from a summary). The order matters: "unanswered" holds
// "answer", "nicht erreicht" holds "erreicht", so the refusals are read before the answer.
const OUTCOME_WORDS = { answered: 'angenommen', no_answer: 'nicht abgenommen', voicemail: 'Mailbox', busy: 'besetzt' };
const OUTCOME_PATTERNS = [
  ['voicemail', /voicemail|voice_mail|voice_message|mailbox|answering_machine|anrufbeantworter|sprachnachricht/],
  ['busy', /busy|engaged|besetzt/],
  ['no_answer', /no_answer|noanswer|unanswered|not_answered|did_not_answer|no_response|no_reply|not_reached|unreachable|declined|missed|keine_antwort|nicht_abgenommen|nicht_erreicht|niemand/],
  ['answered', /answer|accepted|connected|completed|success|reached|angenommen|abgenommen|erreicht|ja$|yes$|true$/],
];
function readOutcome(body) {
  const raw = pick(asObject(body) || {}, FIELDS.callOutcome).toLowerCase();
  if (!raw) return null;
  const s = raw.replace(/[\s\-–/]+/g, '_').replace(/^_+|_+$/g, '');
  for (const [outcome, re] of OUTCOME_PATTERNS) if (re.test(s)) return outcome;
  return null;
}

// Every top-level value that is an international phone number, but the workspace's own fonio number.
function numbersIn(body, ownNumber) {
  const own = fonio.compactNumber(ownNumber);
  const out = new Set();
  for (const v of Object.values(body)) {
    if (typeof v !== 'string' || v.length > 40) continue;
    let n = fonio.compactNumber(v);
    if (n.startsWith('00')) n = '+' + n.slice(2);
    if (fonio.isE164(n) && n !== own) out.add(n);
  }
  return [...out].slice(0, 5);
}

// What came out of the conversation, as the assistant wrote it into lead_status (Part 39): one of LEAD_STATUSES, or
// null for anything this cannot be sure of — the deal is then left where it is (utils/fonio-stage.js). Read
// forgivingly: capitals, spaces and dashes, German words, near misses. The refusals come first ("not interested"
// holds "interested"), and a word that starts with a "no" is never read as one of the three good news.
const LEAD_STATUSES = ['interested', 'meeting_booked', 'callback', 'not_interested', 'wrong_person'];
const LEAD_STATUS_PATTERNS = [
  ['not_interested', /not_interested|no_interest|uninterested|kein_interesse|nicht_interessiert|kein_bedarf|abgelehnt|absage/],
  ['wrong_person', /wrong_(person|number|contact)|falsche_(person|nummer)|falscher_(ansprechpartner|kontakt)/],
  ['meeting_booked', /meeting|appointment|termin/],
  ['callback', /callback|call_back|call_again|r(ü|ue|u)ckruf|zur(ü|ue|u)ckrufen/],
  ['interested', /^(is_|ist_|hat_)?(interested|interest|interessiert|interesse)$/],
];
const NEGATED = /^(no|not|none|kein|keine|keinen|nicht|ohne)_/;
function readLeadStatus(body) {
  const raw = pick(asObject(body) || {}, FIELDS.leadStatus).toLowerCase();
  if (!raw) return null;
  const s = raw.replace(/[\s\-–/]+/g, '_').replace(/^[_.,;:!]+|[_.,;:!]+$/g, '');
  for (const [status, re] of LEAD_STATUS_PATTERNS.slice(0, 2)) if (re.test(s)) return status;
  if (NEGATED.test(s)) return null;
  for (const [status, re] of LEAD_STATUS_PATTERNS.slice(2)) if (re.test(s)) return status;
  return null;
}

function readResult(body, ownNumber) {
  const b = asObject(body) || {};
  const id = pick(b, FIELDS.crmCallId);
  const link = pick(b, FIELDS.link);
  const direction = pick(b, FIELDS.direction).toLowerCase().slice(0, 20);
  const name = pick(b, FIELDS.name).replace(/\s+/g, ' ').slice(0, 120);
  return {
    crmCallId:      /^[1-9]\d{0,9}$/.test(id) ? Number(id) : null,
    conversationId: pick(b, FIELDS.conversationId).slice(0, 200) || null,
    link:           /^https:\/\/\S{1,500}$/.test(link) ? link : null,
    direction,
    inbound:        /^in/.test(direction),   // inbound, incoming: a call the CRM did not start
    duration:       pick(b, FIELDS.duration).replace(/\s+/g, ' ').slice(0, 30),
    summary:        pick(b, FIELDS.summary),
    transcript:     pick(b, FIELDS.transcript),
    numbers:        numbersIn(b, ownNumber),
    name:           NO_NAME.test(name) ? '' : name,   // the caller's name as fonio's assistant understood it
    meeting:        readMeeting(b),                    // a meeting agreed in the call, or null (Part 28)
    outcome:        readOutcome(b),                    // answered, no_answer, voicemail, busy, or null (Part 33)
    callback:       readCallback(b),                   // when the person asked to be called back, or null (Part 35)
    leadStatus:     readLeadStatus(b),                 // what came out of the conversation, or null (Part 39)
  };
}

// The body's field names, for the settings page to show what fonio sends (never the values).
const fieldNames = body => Object.keys(asObject(body) || {}).slice(0, 30).map(k => k.slice(0, 60));

const cut = (s, max, marker) => (s.length > max ? `${s.slice(0, max)}\n… (${marker})` : s);

function resultNote(r) {
  const parts = [(r.inbound ? 'Eingehender fonio-Anruf' : 'fonio-Anruf')
    + (r.outcome && OUTCOME_WORDS[r.outcome] ? ` · ${OUTCOME_WORDS[r.outcome]}` : '')
    + (r.duration ? ` · Dauer ${r.duration}` : '')];
  if (r.summary) parts.push(`Zusammenfassung\n${cut(r.summary, MAX_SUMMARY, 'gekürzt')}`);
  if (r.transcript) parts.push(`Transkript\n${cut(r.transcript, MAX_TRANSCRIPT, 'Transkript gekürzt')}`);
  // nothing recorded: fonio keeps neither when the person declines the recording (its "Recording declined"), and has
  // neither when the call never became a conversation; fonio does not say which
  if (!r.summary && !r.transcript) parts.push(NOT_RECORDED);
  if (r.link) parts.push(`Gespräch in fonio: ${r.link}`);
  return parts.join('\n\n');
}

module.exports = { FIELDS, MAX_SUMMARY, MAX_TRANSCRIPT, NOT_RECORDED, OUTCOME_WORDS, DAY_PARTS, LEAD_STATUSES, parseBody, readResult, readOutcome, readMeeting, readCallback, readLeadStatus, readDate, readTime, fieldNames, resultNote };
