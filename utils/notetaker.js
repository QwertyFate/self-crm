/* ═══════════════════════════════════════════════════════════════════════════
   NOTETAKER — the client for the recording bot for Google Meet (2026-10-20).

   When a meeting is booked from the CRM on Google Meet with "Mit Notetaker
   aufzeichnen" ticked, the server asks the Notetaker service to send its bot
   into the meeting at the start (routes/integrations.js, notetakerSync):

     POST <NOTETAKER_URL>            default http://localhost:8000/crm/recordings
     Content-Type: application/json
     Authorization: Bearer <NOTETAKER_CRM_TOKEN>   only when that is set
     { meeting_url, callback_url, join_at, external_id, metadata,
       bot_name, max_minutes, include_notes, chat_message }

   join_at is the meeting's start as the host's wall clock WITH its offset
   ("2026-10-21T14:00:00+02:00"): the service refuses a time without a zone.
   external_id is "crm-meeting-<activity id>", so sending the same meeting again
   (a new time, a new link) updates the bot's job instead of booking a second one.

   The answers: 202 { job id, status: scheduled | queued }; 200 { updated: true }
   (an external_id sent before); 200 { duplicate: true } (a bot is already
   booked for the meeting); 400 (a bad link, a time without a zone, a callback
   that is not on localhost); 401 (a wrong token). send() never throws: a
   service that is down or silent is a failure with a plain reason.

   THE WAY BACK (Part 2). Each recorded meeting has its own secret result link,
   <NOTETAKER_CALLBACK_URL>/<48 hex> (default base http://localhost:<PORT>/api/
   notetaker/webhook), sent as callback_url. When the meeting is over and the
   transcript and notes are done, the Notetaker POSTs the result there by itself
   (recording.completed, or recording.failed), retrying for about 13 minutes;
   nobody in the CRM waits for it. routes/notetaker.js receives it and writes a
   note on the meeting's deal from resultNote(). With NOTETAKER_WEBHOOK_SECRET set
   (the same value as in the Notetaker's .env) each result must carry
   X-Notetaker-Signature: sha256=<HMAC-SHA256 of "<timestamp>.<raw body>">.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');

const DEFAULT_URL = 'http://localhost:8000/crm/recordings';
const TIMEOUT_MS  = 10000;
const BOT_NAME    = 'Notetaker';
const MAX_MINUTES = 120;
// What the bot writes in the meeting's chat when it joins, in the booking's language.
const CHAT = {
  de: 'Hallo, ich bin Notetaker. Dieses Meeting wird gemäß unserer Richtlinie zur Aufzeichnung von Meetings aufgezeichnet und transkribiert, um Notizen zu erstellen. Wenn Sie keine Aufzeichnung wünschen, kann der Host mich aus dem Meeting entfernen.',
  en: 'Hello, I am Notetaker. This meeting is being recorded and transcribed under our meeting recording policy to create notes. If you do not want to be recorded, the host can remove me from the meeting.',
};

// Read at call time, so a changed .env takes effect on the next restart without code changes.
function config() {
  const token = String(process.env.NOTETAKER_CRM_TOKEN || '').trim();
  return {
    url: String(process.env.NOTETAKER_URL || DEFAULT_URL).trim(),
    token: token || null,
    callbackUrl: String(process.env.NOTETAKER_CALLBACK_URL || `http://localhost:${process.env.PORT || 3000}/api/notetaker/webhook`).trim(),
    webhookSecret: String(process.env.NOTETAKER_WEBHOOK_SECRET || '').trim() || null,
  };
}

// A meeting's secret result link: 24 random bytes as hex, under the callback address.
function newCallbackToken() { return crypto.randomBytes(24).toString('hex'); }
function callbackUrlFor(token, cfg = config()) {
  const base = cfg.callbackUrl.replace(/\/+$/, '');
  return token ? `${base}/${token}` : base;
}

// A Google Meet link (https, meet.google.com, a meeting code), without any query; else null.
function meetUrlOf(url) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'meet.google.com' || !/^\/[a-z0-9][a-z0-9-]*$/i.test(u.pathname)) return null;
  return `https://meet.google.com${u.pathname}`;
}

// A UTC instant as a zone's wall clock with that zone's offset: 2026-10-21T14:00:00+02:00. null for a bad date or zone.
function isoWithOffset(iso, timeZone) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(d);
  } catch { return null; }
  const g = t => parts.find(p => p.type === t)?.value || '';
  const offset = g('timeZoneName').replace(/^GMT/, '') || '+00:00';   // "GMT+02:00" → "+02:00"; plain "GMT" is UTC
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}${offset}`;
}

function externalIdFor(activityId) { return `crm-meeting-${activityId}`; }

// The service's payload: the meeting, where to report back, when, our id and metadata, and the bot's defaults.
function payload({ meetingUrl, joinAt, externalId, metadata, language, callbackToken } = {}, cfg = config()) {
  return {
    meeting_url: meetingUrl,
    callback_url: callbackUrlFor(callbackToken, cfg),
    join_at: joinAt,
    external_id: externalId,
    metadata: metadata || {},
    bot_name: BOT_NAME,
    max_minutes: MAX_MINUTES,
    include_notes: true,
    chat_message: CHAT[language === 'en' ? 'en' : 'de'],
  };
}

// The reason in an error body: a string, or a list of problems ({ msg }), or an object, kept short.
function messageOf(b) {
  const m = b.error ?? b.detail ?? b.message;
  if (typeof m === 'string') return m.slice(0, 300);
  if (Array.isArray(m)) return m.map(x => (x && typeof x === 'object' ? x.msg || JSON.stringify(x) : String(x))).join('; ').slice(0, 300);
  if (m && typeof m === 'object') return JSON.stringify(m).slice(0, 300);
  return '';
}

// What an answer means: { ok, status, job_id } on success, { ok: false, status: 'failed', error } otherwise.
function interpret(http, body) {
  const b = body && typeof body === 'object' ? body : {};
  const jobId = [b.job_id, b.jobId, b.id].filter(v => v !== undefined && v !== null && v !== '').map(String)[0] || null;
  if (http === 202) return { ok: true, status: b.status === 'queued' ? 'queued' : 'scheduled', job_id: jobId };
  if (http === 200 && b.duplicate === true) return { ok: true, status: 'duplicate', job_id: jobId };
  if (http === 200 && b.updated === true) return { ok: true, status: 'updated', job_id: jobId };
  if (http >= 200 && http < 300) return { ok: true, status: b.status === 'queued' ? 'queued' : 'scheduled', job_id: jobId };
  const msg = messageOf(b);
  if (http === 401) return { ok: false, status: 'failed', job_id: null, error: 'The Notetaker refused the token (401)' };
  if (http === 400) return { ok: false, status: 'failed', job_id: null, error: msg ? `The Notetaker refused the request: ${msg}` : 'The Notetaker refused the request (400)' };
  return { ok: false, status: 'failed', job_id: null, error: msg ? `The Notetaker answered ${http}: ${msg}` : `The Notetaker answered ${http}` };
}

// One request to the service. Never throws: { http, ok, status, job_id, error? }.
async function send(body, cfg = config()) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(cfg.url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { http: res.status, ...interpret(res.status, json) };
  } catch (err) {
    return { http: 0, ok: false, status: 'failed', job_id: null, error: err && err.name === 'AbortError' ? 'The Notetaker did not answer within 10 seconds' : 'The Notetaker is not reachable' };
  } finally {
    clearTimeout(timer);
  }
}

// ── Is it there? (Part 3) ─────────────────────────────────────────────────────
// Asked before the booking dialog offers the box. The Notetaker has no health route, so the probe is its documented
// listing filtered to an id no meeting has: a JSON list back means it is up and accepts the CRM's token (the same
// check guards /crm/*). 401 is the token; any other answer (another server on that port, an error page, a 5xx) is an
// error; no connection or no answer within 3 seconds is unreachable. Never throws.
const HEALTH_TIMEOUT_MS = 3000;
const HEALTH_PROBE_ID   = 'crm-health-check';
async function health(cfg = config()) {
  let url;
  try { url = new URL(cfg.url); } catch { return { available: false, reason: 'error' }; }
  url.searchParams.set('external_id', HEALTH_PROBE_ID);
  const headers = cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { method: 'GET', headers, signal: ctrl.signal });
    if (res.status === 401) return { available: false, reason: 'token' };
    let body = null;
    try { body = await res.json(); } catch { /* not JSON: not the Notetaker */ }
    return res.ok && Array.isArray(body) ? { available: true } : { available: false, reason: 'error' };
  } catch {
    return { available: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// ── The result ────────────────────────────────────────────────────────────────

// The Notetaker's signature over the raw body (webhooks.py sign()): the timestamp within five minutes of now, then
// sha256=<HMAC-SHA256 of "<timestamp>.<raw body>"> compared in constant time.
const SIGNATURE_TOLERANCE_S = 300;
function verifySignature(raw, timestamp, signature, secret, nowMs = Date.now()) {
  const ts = String(timestamp ?? '');
  if (!secret || !/^\d{1,12}$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_S) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.`).update(raw).digest('hex'));
  const given = Buffer.from(String(signature ?? ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// The words around the notes, in the notes' language (German for German notes, else English); without notes, in the
// booking's language. The notes themselves are Claude's, in the language the meeting was held in.
const NOTE_WORDS = {
  de: { key_points: 'Wichtige Punkte', decisions: 'Entscheidungen', action_items: 'Aufgaben', open_questions: 'Offene Fragen', due: 'bis',
        no_notes: 'Notetaker hat das Meeting aufgenommen, aber keine Notizen geschrieben.', failed: 'Notetaker konnte das Meeting nicht aufnehmen.',
        reason: 'Grund', hint: 'Hinweis', unknown: 'unbekannt' },
  en: { key_points: 'Key points', decisions: 'Decisions', action_items: 'Action items', open_questions: 'Open questions', due: 'due',
        no_notes: 'Notetaker recorded the meeting but wrote no notes.', failed: 'Notetaker could not record the meeting.',
        reason: 'Reason', hint: 'Note', unknown: 'unknown' },
};
const MAX_NOTE = 20000, MAX_ITEMS = 50;
const text = (v, max = 500) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = v => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);

// The note the CRM writes from a result: { kind: completed | failed | ignored, content, title, reason }.
// completed: the notes' title, summary and lists (an empty list is left out), or why there are none; a partial
// recording says so at the end. failed: why there is no recording. Anything else is ignored.
function resultNote(body, fallbackLang) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = b.errors && typeof b.errors === 'object' ? b.errors : {};
  const fallback = fallbackLang === 'en' ? 'en' : 'de';
  if (b.event === 'recording.failed') {
    const L = NOTE_WORDS[fallback];
    const reason = text(errors.recording, 300) || text(b.status, 100) || L.unknown;
    return { kind: 'failed', title: null, reason, content: `${L.failed}\n${L.reason}: ${reason}` };
  }
  if (b.event !== 'recording.completed') return { kind: 'ignored', title: null, reason: null, content: '' };

  const n = b.notes && typeof b.notes === 'object' ? b.notes : null;
  const partial = text(errors.recording, 300);
  const title = n ? text(n.title, 200) : '';
  const summary = n ? String(typeof n.summary === 'string' ? n.summary : '').trim().slice(0, 4000) : '';
  const L = NOTE_WORDS[n && typeof n.language === 'string' ? (/^de/i.test(n.language) ? 'de' : 'en') : fallback];
  const sections = [];
  if (n) {
    const items = key => list(n[key]).map(x => text(x)).filter(Boolean);
    const actions = list(n.action_items).map(a => {
      if (typeof a === 'string') return text(a);
      if (!a || typeof a !== 'object' || !text(a.task)) return '';
      return text(a.task) + (text(a.owner, 100) ? ` (${text(a.owner, 100)})` : '') + (text(a.due, 100) ? `, ${L.due} ${text(a.due, 100)}` : '');
    }).filter(Boolean);
    for (const [key, lines] of [['key_points', items('key_points')], ['decisions', items('decisions')], ['action_items', actions], ['open_questions', items('open_questions')]]) {
      if (lines.length) sections.push(`${L[key]}\n${lines.map(l => '• ' + l).join('\n')}`);
    }
  }
  const parts = [title, summary, ...sections].filter(Boolean);
  if (!parts.length) {
    const reason = text(errors.notes, 300) || text(errors.transcript, 300) || L.unknown;
    parts.push(`${L.no_notes}\n${L.reason}: ${reason}`);
    if (partial) parts.push(`${L.hint}: ${partial}`);
    return { kind: 'completed', title: null, reason, content: parts.join('\n\n').slice(0, MAX_NOTE) };
  }
  if (partial) parts.push(`${L.hint}: ${partial}`);
  return { kind: 'completed', title: title || null, reason: null, content: parts.join('\n\n').slice(0, MAX_NOTE) };
}

module.exports = { config, meetUrlOf, isoWithOffset, externalIdFor, payload, interpret, send, health, newCallbackToken, callbackUrlFor, verifySignature, resultNote, CHAT, BOT_NAME, MAX_MINUTES, DEFAULT_URL };
