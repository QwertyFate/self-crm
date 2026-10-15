/* ═══════════════════════════════════════════════════════════════════════════
   CAL.COM — the client for api.cal.com (v2) and the sealing of its API key.

   One workspace holds one Cal.com connection: the API key of a personal
   Cal.com account, pasted by an owner or admin (Settings → Integrations →
   Cal.com, routes/integrations.js). This module is the only place that talks
   to Cal.com and the only place that knows how the key is stored.

   THE KEY AT REST  The key is needed as plain text on every call, so it
   cannot be hashed the way the Engine's API keys are. It is sealed with
   AES-256-GCM under a key derived from CALCOM_ENCRYPTION_KEY, or from
   SESSION_SECRET when that is not set, and stored as
       v1.<iv>.<tag>.<ciphertext>          (each part base64url)
   A row copied out of the database is useless without the server's secret;
   a changed secret makes openKey() throw, which the routes report as
   "connect again". The plain key never appears in a log line or an error.

   THE CALLS  (cal.com/docs/api-reference/v2, checked 2026-10-13)
     getMe(key)           GET /v2/me             the account: id, username, email, name, timeZone
     listEventTypes(key)  GET /v2/event-types    cal-api-version 2026-06-12; the account's own event types
     createWebhook(key, { subscriberUrl, secret, triggers })   POST /v2/webhooks, a user webhook
     deleteWebhook(key, id)                                   DELETE /v2/webhooks/:id
     getSlots(key, { eventTypeId, start, end, timeZone })      GET /v2/slots, cal-api-version 2024-09-04; free slots per day
     createBooking(key, { eventTypeId, start, attendee, … })   POST /v2/bookings, cal-api-version 2026-02-25 (Step 3)
     cancelBooking(key, uid, { reason })                       POST /v2/bookings/:uid/cancel
     rescheduleBooking(key, uid, { start, reason })             POST /v2/bookings/:uid/reschedule: a NEW booking, rescheduledFromUid = the old
   Every call sends Authorization: Bearer <key>, gives up after 10 s, and
   throws a CalError carrying Cal.com's HTTP status (0 when Cal.com could not
   be reached at all) and its message. The routes map that to their own
   status codes; nothing here answers HTTP.

   THE WEBHOOK  (Step 2) Cal.com POSTs every booking it hosts to the workspace's
   receiver, signed: x-cal-signature-256 = HMAC-SHA256(webhook_secret, raw body)
   as hex. verifySignature() checks that in constant time; parseBooking() reads
   the three triggers this app handles (BOOKING_CREATED / _RESCHEDULED /
   _CANCELLED: the booking sits under `payload`) and reports anything else as
   ignored; wallClock() turns the UTC start into the host's date and time, the
   way every dated row here carries the zone its time was typed in; and
   bookingToActivity() is the row the receiver writes (type 'meeting').

   Self-hosted Cal.com: set CALCOM_API_URL to its API base, ending in /v2.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

const DEFAULT_API_URL     = 'https://api.cal.com/v2';
const WEBHOOK_TRIGGERS    = ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'];   // what the receiver handles
const FALLBACK_ZONE       = 'Europe/Berlin';   // when neither the host nor the connection names a zone
const VERSION_EVENT_TYPES = '2026-06-12';
const VERSION_SLOTS       = '2024-09-04';
const VERSION_BOOKINGS    = '2026-02-25';
const TIMEOUT_MS          = 10000;

class CalError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name   = 'CalError';
    this.status = status;        // Cal.com's HTTP status; 0 = not reached / timed out / no key
    this.body   = body ?? null;  // Cal.com's parsed answer, when there was one
  }
}

function apiUrl() {
  return String(process.env.CALCOM_API_URL || DEFAULT_API_URL).trim().replace(/\/+$/, '');
}

// Cal.com API keys start with "cal_" (cal_live_…, cal_test_…). A shape check only:
// whether the key is real is Cal.com's answer to getMe().
function isApiKeyShaped(s) {
  return typeof s === 'string' && /^cal_[A-Za-z0-9_-]{8,}$/.test(s.trim());
}

// Cal.com answers { status: 'success', data } or { status: 'error', error: { message } };
// some errors arrive as { message } or { error: 'text' } or a message array.
function messageOf(body, status) {
  const m = body?.error?.message ?? body?.message ?? body?.error;
  if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 300);
  if (Array.isArray(m) && m.length)      return String(m[0]).slice(0, 300);
  return `Cal.com answered HTTP ${status}`;
}

// One request to Cal.com. `version` is the cal-api-version header the endpoint wants
// (each endpoint names its own); `query` becomes the query string; `body` is sent as JSON.
async function calFetch(apiKey, path, { method = 'GET', version, body, query, timeoutMs = TIMEOUT_MS } = {}) {
  if (!isApiKeyShaped(apiKey)) throw new CalError(0, 'A Cal.com API key is required');
  const url = new URL(apiUrl() + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' };
  if (version)           headers['cal-api-version'] = version;
  if (body !== undefined) headers['Content-Type']    = 'application/json';

  const ctl   = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await globalThis.fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
  } catch (err) {
    throw new CalError(0, err?.name === 'AbortError' ? 'Cal.com did not answer in time' : 'Cal.com could not be reached');
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try { json = await res.json(); } catch { /* no JSON body */ }
  if (!res.ok) throw new CalError(res.status, messageOf(json, res.status), json);
  return json;
}

// The account behind the key. Used to validate a pasted key and to show "connected as".
async function getMe(apiKey) {
  const json = await calFetch(apiKey, '/me');
  const d = json?.data || {};
  return {
    id:       d.id       ?? null,
    username: d.username ?? null,
    email:    d.email    ?? null,
    name:     d.name     ?? null,
    timeZone: d.timeZone ?? null,
  };
}

// The account's event types, as the booking dialog and the settings picker need them.
async function listEventTypes(apiKey) {
  const json = await calFetch(apiKey, '/event-types', { version: VERSION_EVENT_TYPES });
  const list = Array.isArray(json?.data) ? json.data : [];
  return list
    .map(e => ({
      id:              e.id,
      slug:            e.slug ?? null,
      title:           e.title ?? '',
      lengthInMinutes: Number.isFinite(e.lengthInMinutes) ? e.lengthInMinutes : null,
      hidden:          e.hidden === true,
      ownerId:         e.ownerId ?? null,
      locations:       normaliseLocations(e.locations),
    }))
    .filter(e => Number.isInteger(e.id));
}

// Register the booking webhook on the account: Cal.com will POST to subscriberUrl, signing
// the body with `secret`. The webhook belongs to the key's user; the id comes back as a string.
async function createWebhook(apiKey, { subscriberUrl, secret, triggers = WEBHOOK_TRIGGERS }) {
  const json = await calFetch(apiKey, '/webhooks', { method: 'POST', body: { subscriberUrl, triggers, active: true, secret } });
  const d = json?.data || {};
  if (d.id === undefined || d.id === null) throw new CalError(0, 'Cal.com created the webhook without an id');
  return { id: String(d.id), subscriberUrl: d.subscriberUrl ?? subscriberUrl, active: d.active !== false };
}

// Remove a webhook by id. 404 (already gone) counts as done.
async function deleteWebhook(apiKey, id) {
  try { await calFetch(apiKey, '/webhooks/' + encodeURIComponent(String(id)), { method: 'DELETE' }); }
  catch (err) { if (!(err instanceof CalError && err.status === 404)) throw err; }
  return true;
}

// small readers shared by the booking and webhook sections: a trimmed string or null, a lower-cased
// email, a positive integer, an ISO instant
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
const lowerEmail = v => { const s = str(v); return s ? s.toLowerCase() : null; };
const posInt = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const isoOrNull = v => { const s = str(v); if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const urlOrNull = v => { const s = str(v); return s && /^https?:\/\/\S+$/i.test(s) ? s : null; };

// Where a meeting of an event type can happen, as Cal.com lists it: a video app (cal-video,
// google-meet, zoom, office365-video, …), the organizer's address, link or phone, or something
// the attendee names. Only the fields the dialog and the booking need are kept.
const LOCATION_TYPES = ['integration', 'address', 'link', 'phone', 'attendeeAddress', 'attendeePhone', 'attendeeDefined', 'organizersDefaultApp'];
function normaliseLocations(list) {
  if (!Array.isArray(list)) return [];
  return list.map(l => {
    if (!l || typeof l !== 'object' || !LOCATION_TYPES.includes(l.type)) return null;
    const out = { type: l.type };
    if (l.type === 'integration') { if (!str(l.integration)) return null; out.integration = str(l.integration); }
    if (l.type === 'address' && str(l.address)) out.address = str(l.address);
    if (l.type === 'link' && str(l.link)) out.link = str(l.link);
    if (l.type === 'phone' && str(l.phone)) out.phone = str(l.phone);
    return out;
  }).filter(Boolean);
}

// The booking's location object for one of an event type's locations (what POST /v2/bookings
// takes): a video app names its integration, the organizer's address / link / phone are named by
// type alone (Cal.com fills in the value). null when the wanted one is not on the list.
function bookingLocationFor(locations, wanted) {
  if (!wanted || typeof wanted !== 'object') return null;
  const list = Array.isArray(locations) ? locations : [];
  const hit = list.find(l => l.type === wanted.type && (l.type !== 'integration' || l.integration === wanted.integration));
  if (!hit) return null;
  if (hit.type === 'integration') return { type: 'integration', integration: hit.integration };
  if (['address', 'link', 'phone', 'organizersDefaultApp'].includes(hit.type)) return { type: hit.type };
  return null;   // attendee-named locations need a text from the attendee: not offered from the CRM
}

// ── booking from the CRM (Step 3) ───────────────────────────────────────────
// The free slots of an event type between two dates, as { 'YYYY-MM-DD': [{ start, end }] }.
// Cal.com answers per date in the zone asked for; start and end come back as ISO strings
// (with that zone's offset). `start` / `end` are dates or UTC datetimes.
async function getSlots(apiKey, { eventTypeId, start, end, timeZone, bookingUidToReschedule }) {
  const json = await calFetch(apiKey, '/slots', { version: VERSION_SLOTS, query: { eventTypeId, start, end, timeZone, format: 'range', bookingUidToReschedule } });
  const data = json?.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : {};
  const days = {};
  for (const [date, list] of Object.entries(data)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(list)) continue;
    days[date] = list
      .map(s => (s && typeof s === 'object' ? { start: isoOrNull(s.start), end: isoOrNull(s.end) } : { start: isoOrNull(s), end: null }))
      .filter(s => s.start);
  }
  return days;
}

// Book a slot on an event type for one attendee. Cal.com sends the invitations itself.
// `notes` goes into the booking's default "notes" field, which both parties see; `metadata`
// is ours (the deal and contact ids the webhook reads back); `guests` are more emails Cal.com
// invites along (Part 12: the assignee of the deal or the contact). The answer is normalised to
// what the receiver's mapping needs plus the meeting link.
async function createBooking(apiKey, { eventTypeId, start, attendee, metadata, notes, lengthInMinutes, location, guests }) {
  const body = {
    start,
    eventTypeId,
    attendee: { name: attendee.name, email: attendee.email, timeZone: attendee.timeZone || FALLBACK_ZONE, language: attendee.language || 'de' },
  };
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) body.metadata = metadata;
  if (typeof notes === 'string' && notes.trim()) body.bookingFieldsResponses = { notes: notes.trim().slice(0, 1000) };
  if (Number.isInteger(lengthInMinutes) && lengthInMinutes > 0) body.lengthInMinutes = lengthInMinutes;
  if (location && typeof location === 'object' && str(location.type)) body.location = location;
  const guestList = Array.isArray(guests) ? guests.map(lowerEmail).filter(Boolean) : [];
  if (guestList.length) body.guests = guestList;
  const json = await calFetch(apiKey, '/bookings', { method: 'POST', version: VERSION_BOOKINGS, body });
  const d = json?.data || {};
  if (!str(d.uid)) throw new CalError(0, 'Cal.com created the booking without a uid');
  return normaliseBooking(d, eventTypeId);
}

// A booking as Cal.com answers it, reduced to what the entry and the dialog need.
function normaliseBooking(d, eventTypeId) {
  return {
    uid:         str(d.uid),
    title:       str(d.title),
    start:       isoOrNull(d.start),
    end:         isoOrNull(d.end),
    status:      str(d.status),
    location:    str(d.location),
    meetingUrl:  urlOrNull(d.location) || urlOrNull(d.meetingUrl),   // Cal.com: `location` is the meeting place or link; meetingUrl is the older field
    eventTypeId: Number.isInteger(d.eventTypeId) ? d.eventTypeId : (Number.isInteger(eventTypeId) ? eventTypeId : null),
    duration:    Number.isFinite(d.duration) ? d.duration : null,
    rescheduledFromUid: str(d.rescheduledFromUid),
    cancellationReason: str(d.cancellationReason),
    hosts:       Array.isArray(d.hosts) ? d.hosts.map(h => ({ name: str(h?.name), email: lowerEmail(h?.email), timeZone: str(h?.timeZone) })) : [],
    attendees:   Array.isArray(d.attendees) ? d.attendees.map(a => ({ name: str(a?.name), email: lowerEmail(a?.email), timeZone: str(a?.timeZone) })) : [],
  };
}

// Cancel a booking. Cal.com tells the attendee as it does for any cancellation; the reason is
// shown to them when given. A booking Cal.com no longer knows (404) counts as cancelled.
async function cancelBooking(apiKey, uid, { reason } = {}) {
  const body = {};
  if (typeof reason === 'string' && reason.trim()) body.cancellationReason = reason.trim().slice(0, 500);
  try {
    const json = await calFetch(apiKey, '/bookings/' + encodeURIComponent(String(uid)) + '/cancel', { method: 'POST', version: VERSION_BOOKINGS, body });
    const d = json?.data || {};
    return { uid: str(d.uid) || String(uid), status: str(d.status) || 'cancelled', cancellationReason: str(d.cancellationReason), gone: false };
  } catch (err) {
    if (err instanceof CalError && err.status === 404) return { uid: String(uid), status: 'cancelled', cancellationReason: null, gone: true };
    throw err;
  }
}

// Move a booking to a new start. Cal.com makes a NEW booking (new uid) and marks the old one; the
// answer names the old one in rescheduledFromUid. The attendee is told as for any reschedule.
async function rescheduleBooking(apiKey, uid, { start, reason }) {
  const body = { start };
  if (typeof reason === 'string' && reason.trim()) body.reschedulingReason = reason.trim().slice(0, 500);
  const json = await calFetch(apiKey, '/bookings/' + encodeURIComponent(String(uid)) + '/reschedule', { method: 'POST', version: VERSION_BOOKINGS, body });
  const d = json?.data || {};
  if (!str(d.uid)) throw new CalError(0, 'Cal.com rescheduled the booking without a uid');
  const b = normaliseBooking(d, null);
  if (!b.rescheduledFromUid) b.rescheduledFromUid = String(uid);
  return b;
}

// ── the key at rest ─────────────────────────────────────────────────────────
function sealingKey() {
  const secret = process.env.CALCOM_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'change-me-in-production';
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}
const b64u = buf => buf.toString('base64url');

function sealKey(plain) {
  if (typeof plain !== 'string' || !plain) throw new TypeError('Nothing to seal');
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sealingKey(), iv);
  const ct     = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', b64u(iv), b64u(cipher.getAuthTag()), b64u(ct)].join('.');
}

function openKey(sealed) {
  const parts = typeof sealed === 'string' ? sealed.split('.') : [];
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Sealed key is not in a known format');
  const [iv, tag, ct] = parts.slice(1).map(p => Buffer.from(p, 'base64url'));
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', sealingKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Sealed key cannot be opened with this server secret');
  }
}

// ── the webhook: a booking → one activity ───────────────────────────────────
function signBody(secret, rawBody) { return crypto.createHmac('sha256', String(secret)).update(rawBody).digest('hex'); }

// Constant-time check of Cal.com's signature header against the raw body. A missing header, a
// missing secret, or hex of the wrong length is simply false: the receiver answers 401.
function verifySignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string' || !header.trim()) return false;
  const expected = Buffer.from(signBody(secret, rawBody), 'hex');
  const given    = Buffer.from(header.trim().replace(/^sha256=/i, ''), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}


// What the receiver needs from a webhook body. The three booking triggers carry the booking
// under `payload`; any other trigger comes back as { trigger: null, ignored: <its name> }.
// The customer is the first attendee who is not the host; the host is `organizer`.
// Our own metadata (set when a booking is made from a deal or a contact, Step 3) is read
// back as dealId / contactId; Cal.com adds keys of its own there, which are left alone.
function parseBooking(body) {
  const trigger = str(body?.triggerEvent);
  if (!WEBHOOK_TRIGGERS.includes(trigger)) return { trigger: null, ignored: trigger };
  const p = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const person = x => (x && typeof x === 'object' ? { name: str(x.name), email: lowerEmail(x.email), timeZone: str(x.timeZone) } : null);
  const organizer = person(p.organizer);
  const attendees = (Array.isArray(p.attendees) ? p.attendees.map(person) : []).filter(a => a && (a.email || a.name));
  const attendee  = attendees.find(a => !organizer?.email || a.email !== organizer.email) || attendees[0] || null;
  const metadata  = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
  return {
    trigger,
    uid:           str(p.uid),
    rescheduleUid: str(p.rescheduleUid),
    eventTypeId:   Number.isInteger(p.eventTypeId) ? p.eventTypeId : null,
    title:         str(p.title) || str(p.eventTitle),
    start:         isoOrNull(p.startTime),
    end:           isoOrNull(p.endTime),
    organizer, attendee, attendees,
    metadata,
    dealId:    posInt(metadata.upgrads_deal_id),
    contactId: posInt(metadata.upgrads_contact_id),
    cancellationReason: str(p.cancellationReason),
    // the video link, when the meeting has one: Cal.com puts it in metadata.videoCallUrl, in
    // videoCallData.url (Google Meet, once the calendar event exists), or in location itself
    meetingUrl: urlOrNull(p.metadata?.videoCallUrl) || urlOrNull(p.videoCallData?.url) || urlOrNull(p.location),
    location:   str(p.location),   // the place as Cal.com names it: a link, 'integrations:google:meet', an address
  };
}

// ── where a meeting happens, in words (Part 12) ──────────────────────────────
// The app behind a meeting link, by its host; null for a host nobody knows.
const MEETING_APPS = [
  [/(^|\.)meet\.google\.com$/, 'Google Meet'], [/(^|\.)zoom\.(us|com)$/, 'Zoom'], [/teams\.(microsoft|live)\.com$/, 'Microsoft Teams'],
  [/(^|\.)cal\.com$/, 'Cal Video'], [/(^|\.)daily\.co$/, 'Cal Video'], [/(^|\.)whereby\.com$/, 'Whereby'], [/(^|\.)webex\.com$/, 'Webex'], [/jit\.si$|(^|\.)jitsi\./, 'Jitsi'],
];
function meetingApp(url) {
  let host;
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
  const hit = MEETING_APPS.find(([re]) => re.test(host));
  return hit ? hit[1] : null;
}
// Cal.com's integration names as people know them ('integrations:google:meet' → Google Meet).
const INTEGRATION_NAMES = { 'google:meet': 'Google Meet', 'google-meet': 'Google Meet', zoom: 'Zoom', daily: 'Cal Video', 'cal-video': 'Cal Video', 'office365:video': 'Microsoft Teams', 'office365-video': 'Microsoft Teams', whereby: 'Whereby', jitsi: 'Jitsi', webex: 'Webex' };
// Where a meeting happens, for a notification: the app behind the link, else Cal.com's integration
// by name, else the place text (an address, a phone number); null when nothing is known.
function placeLabel({ url, location } = {}) {
  const link = urlOrNull(url);
  if (link) return meetingApp(link) || link;
  const loc = str(location);
  if (!loc) return null;
  const m = /^integrations?:(.+)$/i.exec(loc);
  if (m) return INTEGRATION_NAMES[m[1].toLowerCase()] || m[1];
  if (urlOrNull(loc)) return meetingApp(loc) || loc;
  return loc;
}
// The meeting link inside an entry's text: Cal.com's title on the first line, the link on its own.
function meetingLinkOf(content) {
  const m = /https?:\/\/[^\s<]+/.exec(String(content || ''));
  return m ? m[0] : null;
}

// A UTC instant as the wall clock of a zone: { date: 'YYYY-MM-DD', time: 'HH:MM', zone }.
// An unknown zone falls back to the default zone and says so in `zone`.
function wallClock(iso, timeZone) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let parts, zone = str(timeZone) || FALLBACK_ZONE;
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  } catch {
    zone  = FALLBACK_ZONE;
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  }
  const g = t => parts.find(x => x.type === t)?.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}`, zone };
}

// The inverse of wallClock: a zone's wall clock ('YYYY-MM-DD', 'HH:MM') as a UTC instant, ISO.
// Two corrections settle the zone's offset, DST edges included; a bad date or time is null.
function utcFromWallClock(date, time, timeZone) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '')), t = /^(\d{2}):(\d{2})/.exec(String(time || '00:00'));
  if (!d || !t) return null;
  const want = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  if (Number.isNaN(want)) return null;
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const wc = wallClock(new Date(guess).toISOString(), timeZone);
    const got = Date.UTC(+wc.date.slice(0, 4), +wc.date.slice(5, 7) - 1, +wc.date.slice(8, 10), +wc.time.slice(0, 2), +wc.time.slice(3, 5));
    guess += want - got;
  }
  return new Date(guess).toISOString();
}

// The activity a booking becomes: type 'meeting', Cal.com's title (or "Termin mit <name>"),
// the start as the host's date and time with the host's zone stamped, the booking id kept.
function bookingToActivity(b, fallbackZone) {
  const wc = b.start ? wallClock(b.start, b.organizer?.timeZone || fallbackZone || FALLBACK_ZONE) : null;
  const content = (b.title || (b.attendee?.name ? `Termin mit ${b.attendee.name}` : 'Termin')) + (b.meetingUrl ? `\n${b.meetingUrl}` : '');
  return { type: 'meeting', content, event_date: wc ? wc.date : null, event_time: wc ? wc.time : null, event_tz: wc ? wc.zone : null, calcom_uid: b.uid };
}

module.exports = {
  CalError, isApiKeyShaped, apiUrl, calFetch, getMe, listEventTypes, createWebhook, deleteWebhook, getSlots, createBooking, cancelBooking, rescheduleBooking, normaliseBooking, sealKey, openKey,
  normaliseLocations, bookingLocationFor,
  signBody, verifySignature, parseBooking, wallClock, utcFromWallClock, bookingToActivity,
  meetingApp, placeLabel, meetingLinkOf,
  DEFAULT_API_URL, VERSION_EVENT_TYPES, VERSION_SLOTS, VERSION_BOOKINGS, TIMEOUT_MS, WEBHOOK_TRIGGERS, FALLBACK_ZONE, LOCATION_TYPES,
};
