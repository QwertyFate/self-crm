/* ═══════════════════════════════════════════════════════════════════════════
   FONIO — the client for fonio.ai, the AI phone assistant that calls a new
   deal's contact (FONIO_CHANGES). One connection per workspace: the table
   workspace_fonio, the settings in routes/fonio.js.

   WHAT FONIO'S PUBLIC API OFFERS (its OpenAPI 3 spec, read 2026-11-06 at
   https://app.fonio.ai/api/docs-json), base https://app.fonio.ai/api:
     POST /public/v1/test-api-key    { apiKey }
                                     → 200 { status: 'success', message }
     POST /public/v1/outbound_call   { apiKey, fromNumber, toNumber, context }
                                     toNumber must match ^\+\d+$; context is a
                                     free object the assistant can use
                                     → 200 { status: 'success' | 'error', message }
   The key may go in the Authorization header or as apiKey in the body. The
   body is used here, so no header scheme has to be guessed.
   The spec has no client or agent id: the fonio number (fromNumber) picks the
   assistant, the one assigned to that number for outbound calls in fonio.
   fonio's help page "Outbound API" (read 2026-11-09) does list an agentId,
   "the ID of the assistant that handles the conversation"; it is not sent
   here. There is no call id, no scheduling and no transcript in this API (the
   spec, read again 2026-11-09) — the CRM waits the delay itself, and a call's
   result comes back only when fonio sends it after the call (routes/fonio.js
   /receive, Part 7). Outbound calls need fonio's identity check (KYC) done
   for the company.

   testKey() never throws:
     { ok: true }
     { ok: false, reason: 'key' | 'refused' | 'unreachable', http, error }
   'key' is fonio saying no to the key; 'refused' any other answer (429, 5xx…):
   the key may be fine, but fonio would not answer now. The key is cut out of
   every error text, which is kept short.

   outboundCall() never throws either:
     { ok: true, message }
     { ok: false, retry, http, error }
   NEVER CALL A CLIENT TWICE. retry is true only when fonio cannot have taken
   the call: the connection was refused or the host not found before anything
   was sent, or fonio answered 429 / 503. A timeout, a cut connection or any
   other answer may mean the call is already ringing, so it is not retried —
   the history says 'failed' with fonio's words instead.

   NUMBERS  toInternational() makes a contact's number fonio-ready: "(0)" and
   what people type around digits go, 00 becomes +, a leading 0 becomes the
   workspace's country code; a number with neither + nor 0 in front is left
   alone (null) — there is no telling its country. numberAllowed() checks it
   against the workspace's number starts, read the same way ("0171" with +49
   is "+49171"); no starts means every number.

   CALLING HOURS  nextCallTime(from, settings) is the first instant at or after
   `from` inside the hours: hours_days (1 = Monday … 7 = Sunday) from
   hours_from to hours_to on the wall clock of hours_tz (utils/calcom.js
   converts, DST included). With hours_on false it is `from` itself.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom = require('./calcom');   // wallClock / utcFromWallClock: a zone's wall clock and back

const BASE = 'https://app.fonio.ai/api';
const TIMEOUT_MS = 10000;
const CALL_TIMEOUT_MS = 20000;

// What people type around a number: spaces, dashes, dots, slashes, brackets.
const compactNumber = value => String(value ?? '').replace(/[\s\-./()]/g, '');
// + and 7 to 15 digits, no leading 0 after the + — E.164, which fonio's ^\+\d+$ accepts.
const isE164 = value => typeof value === 'string' && /^\+[1-9]\d{6,14}$/.test(value);

// A number start as the workspace typed it ("+49", "0049", "0171", "49"), as an international start.
function prefixToInternational(prefix, countryCode) {
  const p = compactNumber(String(prefix ?? '').replace(/\(0\)/g, ''));
  if (!p) return '';
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('0')) return countryCode + p.slice(1);
  return '+' + p;
}

// A contact's number as fonio needs it (+ and digits), or null when it cannot be told.
function toInternational(raw, countryCode) {
  let n = compactNumber(String(raw ?? '').replace(/\(0\)/g, ''));
  if (!n) return null;
  if (n.startsWith('00')) n = '+' + n.slice(2);
  else if (n.startsWith('0')) n = countryCode + n.slice(1);
  else if (!n.startsWith('+')) return null;
  return isE164(n) ? n : null;
}

function numberAllowed(number, prefixes, countryCode) {
  const starts = (Array.isArray(prefixes) ? prefixes : []).map(p => prefixToInternational(p, countryCode)).filter(Boolean);
  return !starts.length || starts.some(s => number.startsWith(s));
}

// The first instant at or after `from` inside the calling hours (a Date), or null when no day is set.
function nextCallTime(from, s) {
  const start = new Date(from);
  if (!s.hours_on) return start;
  const days = new Set(Array.isArray(s.hours_days) ? s.hours_days : []);
  const hFrom = String(s.hours_from).slice(0, 5), hTo = String(s.hours_to).slice(0, 5);
  const here = calcom.wallClock(start.toISOString(), s.hours_tz);
  const [y, m, d] = here.date.split('-').map(Number);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    const iso = day.getUTCDay() || 7;   // Sunday is 0 in JavaScript, 7 here
    if (!days.has(iso)) continue;
    const date = day.toISOString().slice(0, 10);
    if (i === 0) {
      if (here.time < hFrom) return new Date(calcom.utcFromWallClock(date, hFrom, here.zone));
      if (here.time < hTo) return start;
      continue;
    }
    return new Date(calcom.utcFromWallClock(date, hFrom, here.zone));
  }
  return null;
}

function errorText(message, apiKey, fallback) {
  const text = typeof message === 'string' && message.trim() ? message.trim() : fallback;
  return (apiKey ? text.split(apiKey).join('…') : text).slice(0, 200);
}

// fonio's answer as it came, the key blanked wherever it is repeated, and nothing longer than 20,000 characters;
// null when it was not JSON or cannot be kept.
function withoutKey(body, apiKey) {
  if (body === null || body === undefined) return null;
  try {
    const text = JSON.stringify(body);
    if (text.length > 20000) return { cut: text.slice(0, 2000) };
    return JSON.parse(apiKey ? text.split(JSON.stringify(apiKey).slice(1, -1)).join('…') : text);
  } catch { return null; }
}

async function testKey(apiKey, { timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/public/v1/test-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apiKey }),
      signal: ctrl.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (res.ok && body?.status === 'success') return { ok: true };
    // a 200 that is not 'success', a 400 (the only field sent is the key), 401 or 403: the key is what fonio refused
    if (res.ok || res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'key', http: res.status, error: errorText(body?.message, apiKey, 'fonio did not accept the API key') };
    }
    return { ok: false, reason: 'refused', http: res.status, error: errorText(body?.message, apiKey, `fonio answered ${res.status}`) };
  } catch (err) {
    const late = err && err.name === 'AbortError';
    return { ok: false, reason: 'unreachable', http: 0, error: late ? `fonio did not answer within ${Math.round(timeoutMs / 1000)} seconds` : 'fonio could not be reached' };
  } finally {
    clearTimeout(timer);
  }
}

// Before anything was sent: these mean fonio never saw the request.
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

async function outboundCall(apiKey, { fromNumber, toNumber, context = {} }, { timeoutMs = CALL_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/public/v1/outbound_call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apiKey, fromNumber, toNumber, context }),
      signal: ctrl.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const answer = { http: res.status, body: withoutKey(body, apiKey) };   // kept with the call for the technical details
    if (res.ok && body?.status === 'success') return { ok: true, message: errorText(body?.message, apiKey, 'Call started'), answer };
    return {
      ok: false,
      retry: res.status === 429 || res.status === 503,
      http: res.status,
      error: errorText(body?.message, apiKey, res.ok ? 'fonio did not start the call' : `fonio answered ${res.status}`),
      answer,
    };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { ok: false, retry: false, http: 0, error: `fonio did not answer within ${Math.round(timeoutMs / 1000)} seconds; the call may have started` };
    }
    const code = err?.cause?.code || err?.code;
    return { ok: false, retry: NOT_SENT_CODES.has(code), http: 0, error: NOT_SENT_CODES.has(code) ? 'fonio could not be reached' : 'The connection to fonio broke; the call may have started' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  BASE, TIMEOUT_MS, CALL_TIMEOUT_MS, compactNumber, isE164, prefixToInternational, toInternational, numberAllowed,
  nextCallTime, testKey, outboundCall,
};
