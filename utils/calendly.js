/* ═══════════════════════════════════════════════════════════════════════════
   CALENDLY — the client for api.calendly.com (CALENDLY_CHANGES Part 1).

   One workspace holds one Calendly connection: the personal access token of
   a Calendly account, pasted by an owner or admin (Integrations → Calendly,
   routes/calendly.js). This module is the only place that talks to Calendly.
   The token is sealed at rest exactly as the Cal.com key is: sealKey() and
   openKey() of utils/calcom.js, used by the routes.

   THE CALLS  (developer.calendly.com/api-docs, checked 2026-11-12)
     getMe(token)                    GET /users/me       the account: uri, organization, name, email, slug,
                                                         schedulingUrl, timezone (scope users:read)
     listEventTypes(token, userUri)  GET /event_types    the account's active event types, every page
                                                         (scope event_types:read)
     createInvitee(token, { eventType, start, name, email, timezone, utmSource })   POST /invitees: a booking
     cancelEvent(token, eventUri, { reason })           POST /scheduled_events/:uuid/cancellation
     listAvailableTimes(token, { eventType, start, end })   GET /event_type_available_times, the free start
                                                         times of an event type (scope event_types:read)
   Every call sends Authorization: Bearer <token>, gives up after 10 s, and
   throws a CalendlyError carrying Calendly's HTTP status (0 when Calendly
   could not be reached at all), its message and, for a token that lacks a
   permission, the scopes Calendly names (403 "Insufficient scope",
   required_scopes). The routes map that to their own status codes; nothing
   here answers HTTP.

   THE WEBHOOK  (Part 2)
     createWebhook(token, { url, organization, user, signingKey })   POST /webhook_subscriptions, scope 'user',
                                                                     events invitee.created + invitee.canceled
     deleteWebhook(token, uri)                                       DELETE /webhook_subscriptions/:uuid
   Calendly POSTs every booking of the account to the workspace's receiver, signed:
       Calendly-Webhook-Signature: t=<unix seconds>,v1=<hex>
       v1 = HMAC-SHA256(signing key, t + "." + raw body)
   verifySignature() checks that in constant time and refuses a timestamp more than ten minutes off (a replay).
   parseInvitee() reads the two events this app handles into the shape the Cal.com receiver's helpers know
   (uid, title, start, organizer, attendee, meetingUrl, location) and reports anything else as ignored. A booking
   is named by its INVITEE URI: a reschedule is a NEW invitee whose old_invitee names the one before, announced by
   an invitee.canceled with rescheduled: true (which is not a cancellation). inviteeToActivity() is the row the
   receiver writes (type 'meeting').

   Calendly names every resource by its URI
   (https://api.calendly.com/event_types/AAAA…), not by a number: the URIs
   are kept as they come and sent back as they are.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { wallClock, FALLBACK_ZONE } = require('./calcom');   // a UTC instant as a zone's wall clock, as every dated row is kept

const DEFAULT_API_URL = 'https://api.calendly.com';
const WEBHOOK_EVENTS   = ['invitee.created', 'invitee.canceled'];   // what the receiver handles
const SIGNATURE_TOLERANCE_S = 600;   // a signed delivery older or newer than this is a replay (or a very wrong clock)
const TIMEOUT_MS      = 10000;
const PAGE_SIZE       = 100;   // Calendly's largest page
const MAX_PAGES       = 5;     // 500 event types: more than any account here has; the loop must end

class CalendlyError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name   = 'CalendlyError';
    this.status = status;        // Calendly's HTTP status; 0 = not reached / timed out / no token
    this.body   = body ?? null;  // Calendly's parsed answer, when there was one
    this.scopes = Array.isArray(body?.required_scopes) ? body.required_scopes.filter(s => typeof s === 'string').slice(0, 20) : [];
  }
}

function apiUrl() {
  return String(process.env.CALENDLY_API_URL || DEFAULT_API_URL).trim().replace(/\/+$/, '');
}

// A personal access token is one long word. A shape check only: whether the token is real is
// Calendly's answer to getMe().
function isTokenShaped(s) {
  return typeof s === 'string' && /^\S{20,4000}$/.test(s.trim());
}

// Calendly's errors are { title, message, details? }. `details` names what was wrong ("location: is required"),
// which the bare message ("The supplied parameters are invalid.") does not, so it rides along.
function messageOf(body, status) {
  const m = body?.message ?? body?.title;
  const details = (Array.isArray(body?.details) ? body.details : [])
    .map(d => [d?.parameter, d?.message].filter(x => typeof x === 'string' && x.trim()).join(': ')).filter(Boolean).slice(0, 5).join('; ');
  if (typeof m === 'string' && m.trim()) return (m.trim() + (details ? ` (${details})` : '')).slice(0, 300);
  return details ? details.slice(0, 300) : `Calendly answered HTTP ${status}`;
}

// One request to Calendly. `query` becomes the query string; `body` is sent as JSON.
async function clyFetch(token, path, { method = 'GET', body, query, timeoutMs = TIMEOUT_MS } = {}) {
  if (!isTokenShaped(token)) throw new CalendlyError(0, 'A Calendly access token is required');
  const url = new URL(apiUrl() + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const ctl   = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await globalThis.fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
  } catch (err) {
    throw new CalendlyError(0, err?.name === 'AbortError' ? 'Calendly did not answer in time' : 'Calendly could not be reached');
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try { json = await res.json(); } catch { /* no JSON body */ }
  if (!res.ok) throw new CalendlyError(res.status, messageOf(json, res.status), json);
  return json;
}

const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

// The account behind the token. Used to validate a pasted token and to show "connected as".
// Calendly's docs write a zone as "America/New York": the space is put back to the IANA underscore.
async function getMe(token) {
  const json = await clyFetch(token, '/users/me');
  const d = json?.resource || {};
  if (!str(d.uri)) throw new CalendlyError(0, 'Calendly answered without the account');
  const zone = str(d.timezone);
  return {
    uri:           str(d.uri),
    organization:  str(d.current_organization),
    name:          str(d.name),
    email:         str(d.email),
    slug:          str(d.slug),
    schedulingUrl: str(d.scheduling_url),
    timezone:      zone ? zone.replace(/ /g, '_') : null,
  };
}

// The places an event type offers, as the booking dialog will need them: Calendly's kind
// (google_conference, zoom_conference, physical, …) and its text, when it has one.
function normaliseLocations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(l => l && typeof l.kind === 'string' && l.kind)
    .map(l => (str(l.location) ? { kind: l.kind, location: str(l.location).slice(0, 300) } : { kind: l.kind }));
}

// The account's active event types, as the settings picker and the booking dialog need them.
// `secret` is Calendly's word for a type that is hidden from the account's booking page.
async function listEventTypes(token, userUri) {
  const out = [];
  let pageToken = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await clyFetch(token, '/event_types', { query: { user: userUri, active: 'true', count: PAGE_SIZE, page_token: pageToken } });
    for (const e of (Array.isArray(json?.collection) ? json.collection : [])) {
      if (!str(e?.uri) || e.deleted_at) continue;
      out.push({
        uri:           str(e.uri),
        name:          str(e.name) || '',
        slug:          str(e.slug),
        duration:      Number.isFinite(e.duration) && e.duration > 0 ? Math.round(e.duration) : null,
        schedulingUrl: str(e.scheduling_url),
        kind:          str(e.kind),
        poolingType:   str(e.pooling_type),
        secret:        e.secret === true,
        locations:     normaliseLocations(e.locations),
      });
    }
    pageToken = str(json?.pagination?.next_page_token);
    if (!pageToken) break;
  }
  return out;
}

// The free start times of an event type between two instants (at most a week apart, the start not in the
// past), as ISO strings in Calendly's order. Read only; the booking dialog will offer them (Part 3).
async function listAvailableTimes(token, { eventType, start, end }) {
  const json = await clyFetch(token, '/event_type_available_times', { query: { event_type: eventType, start_time: start, end_time: end } });
  return (Array.isArray(json?.collection) ? json.collection : [])
    .filter(s => s && (s.status === undefined || s.status === 'available') && str(s.start_time))
    .map(s => str(s.start_time));
}

// Book one start time of an event type for one invitee (the Scheduling API, scope scheduled_events:write).
// Calendly sends its own confirmation to `email`. `tracking.utm_source` rides along and comes back in the
// webhook's payload, so a booking the CRM made itself can be told from one made on Calendly's page (Part 3).
// `location` ({ kind, location? }) must be one the event type offers; bookingLocation() picks it.
async function createInvitee(token, { eventType, start, name, email, timezone, location, utmSource, timeoutMs }) {
  const body = { event_type: eventType, start_time: start, invitee: { name, email, timezone } };
  if (location) body.location = location;
  // Calendly wants every tracking key present once one is sent (it answers "tracking.utm_campaign: is missing"
  // otherwise, seen 2026-11-12): the ones the CRM has no use for go along empty, as Calendly's own payloads have them
  if (utmSource) body.tracking = { utm_campaign: null, utm_source: utmSource, utm_medium: null, utm_content: null, utm_term: null, salesforce_uuid: null };
  const json = await clyFetch(token, '/invitees', { method: 'POST', body, timeoutMs });
  const r = json?.resource || {};
  if (!str(r.uri)) throw new CalendlyError(0, 'Calendly booked without naming the booking');
  return { uri: str(r.uri), eventUri: str(r.event), cancelUrl: str(r.cancel_url), rescheduleUrl: str(r.reschedule_url) };
}

// The place to book an event type at: the first one it offers, in the shape POST /invitees takes. A place that
// is a text of the host's (physical, custom) is sent back as it is; one the invitee fills in (the number the host
// calls, "ask the invitee") gets `phone`. null when the type offers none, or is round robin (Calendly wants no
// location then).
function bookingLocation(type, phone) {
  if (!type || type.poolingType === 'round_robin') return null;
  const first = (Array.isArray(type.locations) ? type.locations : []).find(l => l && typeof l.kind === 'string' && l.kind);
  if (!first) return null;
  if (first.kind === 'physical' || first.kind === 'custom') return first.location ? { kind: first.kind, location: first.location } : { kind: first.kind };
  if (first.kind === 'outbound_call' || first.kind === 'ask_invitee') return { kind: first.kind, location: String(phone || '') };
  return { kind: first.kind };
}

// Cancel a scheduled event (scope scheduled_events:write). Already cancelled or gone counts as done.
async function cancelEvent(token, eventUri, { reason, timeoutMs } = {}) {
  const id = uuidOf(eventUri);
  if (!id) return true;
  try { await clyFetch(token, '/scheduled_events/' + encodeURIComponent(id) + '/cancellation', { method: 'POST', body: reason ? { reason: String(reason).slice(0, 300) } : {}, timeoutMs }); }
  catch (err) { if (!(err instanceof CalendlyError && (err.status === 404 || err.status === 403))) throw err; }
  return true;
}

// ── the webhook (Part 2) ─────────────────────────────────────────────────────
// The last path segment of a Calendly URI: its uuid.
function uuidOf(uri) {
  const m = /\/([^/?#]+)\/?$/.exec(String(uri || ''));
  return m ? m[1] : null;
}

// Subscribe the workspace's receiver to the account's bookings. The subscription belongs to the
// token's user (scope 'user'); Calendly names it by URI.
async function createWebhook(token, { url, organization, user, signingKey, events = WEBHOOK_EVENTS }) {
  const json = await clyFetch(token, '/webhook_subscriptions', { method: 'POST', body: { url, events, organization, user, scope: 'user', signing_key: signingKey } });
  const uri = str(json?.resource?.uri);
  if (!uri) throw new CalendlyError(0, 'Calendly created the webhook without a URI');
  return { uri, state: str(json.resource.state) };
}

// Remove a subscription by its URI. 404 (already gone) counts as done.
async function deleteWebhook(token, uri) {
  const id = uuidOf(uri);
  if (!id) return true;
  try { await clyFetch(token, '/webhook_subscriptions/' + encodeURIComponent(id), { method: 'DELETE' }); }
  catch (err) { if (!(err instanceof CalendlyError && err.status === 404)) throw err; }
  return true;
}

function signBody(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', String(secret)).update(`${timestamp}.`).update(rawBody).digest('hex');
}
// The header a delivery signed now would carry (the tests' Calendly uses it).
function signatureHeader(secret, rawBody, now = Date.now()) {
  const t = Math.floor(new Date(now).getTime() / 1000);
  return `t=${t},v1=${signBody(secret, t, rawBody)}`;
}

// Constant-time check of Calendly's signature header against the raw body. A missing header, a
// missing secret, a timestamp too far from now or hex of the wrong length is simply false.
function verifySignature(rawBody, header, secret, now = Date.now()) {
  if (!secret || typeof header !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  if (!/^\d{1,12}$/.test(parts.t || '') || !/^[0-9a-f]{64}$/i.test(parts.v1 || '')) return false;
  if (Math.abs(Math.floor(new Date(now).getTime() / 1000) - Number(parts.t)) > SIGNATURE_TOLERANCE_S) return false;
  const expected = Buffer.from(signBody(secret, parts.t, rawBody), 'hex');
  const given    = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const lowerEmail = v => { const s = str(v); return s ? s.toLowerCase() : null; };
const isoOrNull  = v => { const s = str(v); if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const urlOrNull  = v => { const s = str(v); return s && /^https?:\/\/\S+$/i.test(s) ? s : null; };
// Calendly's location kinds as people know them, for a place without a link or a text of its own.
const LOCATION_NAMES = { google_conference: 'Google Meet', zoom_conference: 'Zoom', microsoft_teams_conference: 'Microsoft Teams', webex_conference: 'Webex', gotomeeting_conference: 'GoTo Meeting' };

// What the receiver needs from a webhook body, in the shape the Cal.com receiver's helpers take.
// Any other event comes back as { trigger: null, ignored: <its name> }. The customer is the invitee
// (`payload`); the host is the first member of the scheduled event.
function parseInvitee(body) {
  const event = str(body?.event);
  if (!WEBHOOK_EVENTS.includes(event)) return { trigger: null, ignored: event };
  const p  = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const ev = p.scheduled_event && typeof p.scheduled_event === 'object' ? p.scheduled_event : {};
  const host = Array.isArray(ev.event_memberships) ? ev.event_memberships.find(m => m && (m.user_email || m.user_name)) : null;
  const loc  = ev.location && typeof ev.location === 'object' ? ev.location : {};
  const name = str(p.name) || [str(p.first_name), str(p.last_name)].filter(Boolean).join(' ') || null;
  return {
    trigger:     event,
    uid:         str(p.uri),                       // the invitee: one booking by one person
    eventUri:    str(ev.uri) || str(p.event),      // the scheduled event (what a cancellation from the CRM will name)
    eventType:   str(ev.event_type),
    oldInvitee:  str(p.old_invitee),               // on a created: the booking this one replaces (a reschedule)
    rescheduled: p.rescheduled === true,           // on a canceled: replaced by a new booking, not cancelled
    title:       str(ev.name),
    start:       isoOrNull(ev.start_time),
    end:         isoOrNull(ev.end_time),
    organizer:   host ? { name: str(host.user_name), email: lowerEmail(host.user_email), timeZone: null } : null,
    attendee:    { name, email: lowerEmail(p.email), timeZone: str(p.timezone) },
    contactId: null, dealId: null,                 // a booking made from the CRM will name them (Part 3)
    cancellationReason: str(p.cancellation?.reason),
    cancelUrl:     urlOrNull(p.cancel_url),
    rescheduleUrl: urlOrNull(p.reschedule_url),
    meetingUrl:  urlOrNull(loc.join_url) || urlOrNull(loc.location),
    location:    str(loc.location) || LOCATION_NAMES[loc.type] || null,
  };
}

// The activity a booking becomes: type 'meeting', Calendly's event name with the customer (or
// "Termin mit <name>"), the start as the connected account's date and time with its zone stamped.
function inviteeToActivity(b, zone) {
  const wc = b.start ? wallClock(b.start, zone || FALLBACK_ZONE) : null;
  const who = b.attendee?.name || b.attendee?.email || null;
  const title = b.title ? (who ? `${b.title}: ${who}` : b.title) : (who ? `Termin mit ${who}` : 'Termin');
  return { type: 'meeting', content: title + (b.meetingUrl ? `\n${b.meetingUrl}` : ''), event_date: wc ? wc.date : null, event_time: wc ? wc.time : null, event_tz: wc ? wc.zone : null, calendly_uri: b.uid, calendly_event_uri: b.eventUri };
}

module.exports = {
  CalendlyError, isTokenShaped, getMe, listEventTypes, listAvailableTimes, createInvitee, bookingLocation, cancelEvent, normaliseLocations,
  uuidOf, createWebhook, deleteWebhook, signatureHeader, verifySignature, parseInvitee, inviteeToActivity,
  WEBHOOK_EVENTS, SIGNATURE_TOLERANCE_S,
};
