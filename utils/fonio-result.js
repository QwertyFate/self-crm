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

   resultNote() is the note's text, in German (the product's language; the
   Notetaker's notes are German by default too). Duration is shown as fonio
   sends it: its unit is not documented.
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
};
const MAX_SUMMARY = 4000, MAX_TRANSCRIPT = 200000;
// A variable fonio did not fill ({{name}}), or a <value> of the CRM's suggested Body that was never replaced in fonio.
const PLACEHOLDER = /^(\{\{[^}]*\}\}|<[^<>]*>)$/;

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

function readResult(body, ownNumber) {
  const b = asObject(body) || {};
  const id = pick(b, FIELDS.crmCallId);
  const link = pick(b, FIELDS.link);
  const direction = pick(b, FIELDS.direction).toLowerCase().slice(0, 20);
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
  };
}

// The body's field names, for the settings page to show what fonio sends (never the values).
const fieldNames = body => Object.keys(asObject(body) || {}).slice(0, 30).map(k => k.slice(0, 60));

const cut = (s, max, marker) => (s.length > max ? `${s.slice(0, max)}\n… (${marker})` : s);

function resultNote(r) {
  const parts = ['fonio-Anruf' + (r.duration ? ` · Dauer ${r.duration}` : '')];
  if (r.summary) parts.push(`Zusammenfassung\n${cut(r.summary, MAX_SUMMARY, 'gekürzt')}`);
  if (r.transcript) parts.push(`Transkript\n${cut(r.transcript, MAX_TRANSCRIPT, 'Transkript gekürzt')}`);
  if (!r.summary && !r.transcript) parts.push('fonio hat weder eine Zusammenfassung noch ein Transkript mitgeschickt.');
  if (r.link) parts.push(`Gespräch in fonio: ${r.link}`);
  return parts.join('\n\n');
}

module.exports = { FIELDS, MAX_SUMMARY, MAX_TRANSCRIPT, parseBody, readResult, fieldNames, resultNote };
