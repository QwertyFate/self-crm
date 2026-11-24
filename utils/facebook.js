/* ═══════════════════════════════════════════════════════════════════════════
   FACEBOOK — the platform's ONE Facebook connection, for lead ads
   (FACEBOOK_CHANGES Part 1, 2026-11-23; routes/admin-facebook.js, the
   "Facebook" tab of public/admin.html).

   ONE CONNECTION FOR THE WHOLE PLATFORM, made in the admin console by whoever
   runs the platform — not one per workspace. That person signs in at Facebook
   once; the Pages they can advertise on are then given to workspaces one by
   one (the parts that follow). The customers never sign in at Facebook.
   WHY: a Meta app that has not been through App Review can be given
   permissions only by people who have a role on the app (Meta's "standard
   access"). With one person signing in — one who has such a role — the
   connection needs no review.

   SETUP (Meta's developer console, once per server)
     1. an app with Facebook Login and the lead permissions available to it
     2. its "Valid OAuth Redirect URIs" hold
        <public origin>/api/admin/facebook/callback   (utils/base-url.js)
     3. META_APP_ID and META_APP_SECRET in .env
     optional: META_GRAPH_VERSION (default v26.0) and META_SCOPES (a comma
     list, default SCOPES below) — Meta's own pages do not agree on the exact
     list of permissions, and the login refuses a permission the app does not
     have, so the list can be set without a change of code.

   THE SIGN-IN (Meta: "Manually Build a Login Flow")
     the dialog          https://www.facebook.com/<v>/dialog/oauth
                         ?client_id&redirect_uri&state&scope&response_type=code
     back with ?code     → GET graph/<v>/oauth/access_token
                           (client_id, redirect_uri, client_secret, code)
                           — a short-lived token of the person
     made long-lived     → GET graph/<v>/oauth/access_token
                           (grant_type=fb_exchange_token, client_id,
                           client_secret, fb_exchange_token) — about 60 days
     `state` is a random word kept in the admin's own session and compared
     when Facebook hands it back: a callback counts only in the browser that
     started the sign-in.

   WHAT IS ASKED OF FACEBOOK AFTERWARDS
     me(token)           who signed in: { id, name }
     granted(token)      the permissions the person gave (GET /me/permissions)
     pages(token)        the Pages of the person (GET /me/accounts): id, name,
                         the tasks the person may do there (ADVERTISE is the
                         one lead ads need) and the Page's own token. A Page
                         token got with a long-lived token of the person has
                         no expiry date of its own.
   Every call carries `appsecret_proof` (the token signed with the app's
   secret), so a token alone, without this server's secret, is of no use.

   RECEIVING LEADS (Part 3, 2026-11-24; routes/facebook-receive.js is the
   address, utils/facebook-leads.js what becomes of a lead). Meta: "Webhooks
   for Leads", "Webhooks: Getting Started", the app's /subscriptions edge.
     Facebook tells this server "a lead arrived" — it does not send the
     answers. Two things have to be in place for that:
     1. THE APP knows where to tell it: one address for the whole app.
        receiver()                GET  graph/<v>/<app-id>/subscriptions — what
                                  the app has registered for Pages, or null
        registerReceiver(url)     POST the same edge (object=page,
                                  callback_url, fields=leadgen, verify_token)
        Both are asked with the APP's own token (<app-id>|<secret>). While
        registering, Facebook asks the address once (GET with hub.mode,
        hub.verify_token, hub.challenge) and wants the challenge back:
        verifyToken() is the word it has to name — made from the app's secret,
        so nothing more has to be set up — and verifyMatches() compares it.
        An app has ONE registration for Pages: registering replaces it.
     2. EACH PAGE has the app installed for its leads:
        subscribePage(id, token)    POST   graph/<v>/<page-id>/subscribed_apps
                                           (subscribed_fields=leadgen)
        unsubscribePage(id, token)  DELETE the same edge
        with the PAGE's own token.
        pageInstalled(id, token)    GET    the same edge: the apps Facebook has
                                           on the Page — true when this app is
                                           among them for the field leadgen
                                           (Part 4: "is it really receiving?")
     What then arrives is signed: X-Hub-Signature-256 is "sha256=" and the
     HMAC-SHA256 of the request's bytes under the app's secret —
     signatureMatches(raw, header). leadEvents(raw) reads who it is about:
       { object: 'page', entry: [{ id, changes: [{ field: 'leadgen',
         value: { leadgen_id, page_id, form_id, … } }] }] }
     and lead(leadgenId, pageToken) fetches the answers:
       { id, created_time, field_data: [{ name, values: [...] }], form_id,
         ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
         platform, is_organic }
     The ad's and the campaign's names need the right to read the ads; where
     Facebook refuses them, the lead is asked for again without them.

   THE TOKEN never leaves the server and is never part of an error: a refusal
   says Facebook's own words (error.message), nothing of the request. It is
   sealed before it is stored (routes/admin-facebook.js, the sealing of
   utils/calcom.js).

   ERRORS  FacebookError with code
     unreachable   Facebook did not answer
     gone          the token is no longer accepted (Facebook's error 190:
                   expired, the password changed, the app's access removed) —
                   the person has to connect again
     rejected      every other refusal, with Facebook's words
   and `transient`: true where Facebook says the same request may work later
   (its own is_transient, or an answer in the 500s).

   Nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');

const TIMEOUT_MS = 15000, DEFAULT_VERSION = 'v26.0', STATE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 100, MAX_PAGE_CALLS = 10;   // up to a thousand Pages are read
const LEAD_TIMEOUT_MS = 8000;                // a lead is fetched while Facebook waits for the answer to its message
const MAX_EVENTS = 1000;                     // Facebook puts at most a thousand changes into one message
// A lead's answers and where it came from; the second list needs the right to read the ads.
const LEAD_FIELDS = 'id,created_time,field_data,form_id,platform,is_organic';
const LEAD_AD_FIELDS = 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name';
// What Meta's "Webhooks for Leads" page lists for a CRM that receives leads.
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'leads_retrieval', 'ads_management'];

class FacebookError extends Error {
  constructor(code, message, transient = false) { super(message); this.name = 'FacebookError'; this.code = code; this.transient = transient; }
}

// The app this server signs in with, or null while .env does not name one.
function config() {
  const id = String(process.env.META_APP_ID || '').trim(), secret = String(process.env.META_APP_SECRET || '').trim();
  if (!/^\d{5,25}$/.test(id) || !secret) return null;
  const v = String(process.env.META_GRAPH_VERSION || '').trim();
  const asked = String(process.env.META_SCOPES || '').split(',').map(s => s.trim()).filter(s => /^[a-z_]{3,60}$/.test(s));
  return { id, secret, version: /^v\d{1,3}\.\d{1,2}$/.test(v) ? v : DEFAULT_VERSION, scopes: asked.length ? [...new Set(asked)] : SCOPES };
}
const isConfigured = () => !!config();

// ── the state ───────────────────────────────────────────────────────────────
// A random word for one sign-in, with when it stops counting: kept in the admin's session, sent to Facebook.
const newState = (now = Date.now()) => ({ value: crypto.randomBytes(24).toString('base64url'), expires: now + STATE_TTL_MS });
// True only for the word that was kept, not expired — compared in constant time.
function stateMatches(kept, given, now = Date.now()) {
  if (!kept || typeof kept.value !== 'string' || !kept.value || typeof given !== 'string' || !(Number(kept.expires) > now)) return false;
  const a = Buffer.from(kept.value), b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Facebook ────────────────────────────────────────────────────────────────
function authUrl({ redirectUri, state }) {
  const c = config();
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, state, scope: c.scopes.join(','), response_type: 'code' });
  return `https://www.facebook.com/${c.version}/dialog/oauth?${q}`;
}
const proofOf = (token, secret) => crypto.createHmac('sha256', secret).update(token).digest('hex');

// One request of the Graph API (a GET unless `method` says otherwise): `path` under the version, or a whole address
// Facebook itself handed out (a next page). What comes back is Facebook's JSON; a refusal is a FacebookError that
// says Facebook's words and nothing else.
async function call(path, query = {}, { method = 'GET', timeoutMs = TIMEOUT_MS } = {}) {
  const c = config();
  if (!c) throw new FacebookError('rejected', 'Facebook is not set up on this server');
  const url = /^https:\/\/graph\.facebook\.com\//.test(path) ? new URL(path) : new URL(`https://graph.facebook.com/${c.version}/${String(path).replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const token = url.searchParams.get('access_token');
  if (token) url.searchParams.set('appsecret_proof', proofOf(token, c.secret));
  let res;
  try { res = await fetch(url, { method, signal: AbortSignal.timeout(timeoutMs) }); }
  catch { throw new FacebookError('unreachable', 'Facebook could not be reached'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json && json.error)) {
    const e = (json && json.error) || {};
    const words = String((typeof e === 'object' && e.message) || (typeof e === 'string' && e) || `HTTP ${res.status}`).slice(0, 200);
    throw new FacebookError(Number(e.code) === 190 ? 'gone' : 'rejected', words, (typeof e === 'object' && e.is_transient === true) || res.status >= 500);
  }
  return json;
}

// The code Facebook handed back, traded for a long-lived token of the person: { token, expiresAt } (expiresAt null
// when Facebook names no time).
async function exchangeCode(code, redirectUri, now = Date.now()) {
  const c = config();
  const short = await call('oauth/access_token', { client_id: c.id, redirect_uri: redirectUri, client_secret: c.secret, code });
  if (typeof short.access_token !== 'string' || !short.access_token) throw new FacebookError('rejected', 'Facebook answered without a token');
  const long = await call('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: c.id, client_secret: c.secret, fb_exchange_token: short.access_token });
  if (typeof long.access_token !== 'string' || !long.access_token) throw new FacebookError('rejected', 'Facebook answered without a long-lived token');
  const seconds = Number(long.expires_in);
  return { token: long.access_token, expiresAt: Number.isFinite(seconds) && seconds > 0 ? new Date(now + seconds * 1000) : null };
}

// Who signed in.
async function me(token) {
  const j = await call('me', { fields: 'id,name', access_token: token });
  return { id: String(j.id || ''), name: String(j.name || '') };
}
// The permissions the person gave the app.
async function granted(token) {
  const j = await call('me/permissions', { access_token: token });
  return (Array.isArray(j.data) ? j.data : []).filter(p => p && p.status === 'granted' && typeof p.permission === 'string').map(p => p.permission);
}
// The Pages of the person: [{ id, name, tasks, token }] — every page of Facebook's answer, up to MAX_PAGE_CALLS.
async function pages(token) {
  const out = [];
  let next = null;
  for (let i = 0; i < MAX_PAGE_CALLS; i++) {
    const j = next ? await call(next) : await call('me/accounts', { fields: 'id,name,tasks,access_token', limit: String(PAGE_SIZE), access_token: token });
    for (const p of Array.isArray(j.data) ? j.data : []) {
      if (!p || !p.id) continue;
      out.push({ id: String(p.id), name: String(p.name || ''), tasks: Array.isArray(p.tasks) ? p.tasks.filter(t => typeof t === 'string') : [], token: typeof p.access_token === 'string' ? p.access_token : '' });
    }
    next = j.paging && typeof j.paging.next === 'string' && /^https:\/\/graph\.facebook\.com\//.test(j.paging.next) ? j.paging.next : null;
    if (!next) break;
  }
  return out;
}

// ── receiving leads (Part 3) ────────────────────────────────────────────────
const sameText = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// The word Facebook has to name when it asks the receiving address whether it is the right one: made from the
// app's secret, so it is the same after a restart and nothing has to be stored. null while .env names no app.
function verifyToken() {
  const c = config();
  return c ? crypto.createHmac('sha256', c.secret).update('facebook receiver: verify token').digest('hex').slice(0, 40) : null;
}
function verifyMatches(given) {
  const word = verifyToken();
  return !!word && typeof given === 'string' && sameText(word, given);
}
// True only for bytes signed with the app's secret: `header` is X-Hub-Signature-256, "sha256=" and 64 hex digits.
function signatureMatches(raw, header) {
  const c = config(), m = typeof header === 'string' ? /^sha256=([0-9a-f]{64})$/i.exec(header.trim()) : null;
  if (!c || !Buffer.isBuffer(raw) || !m) return false;
  return crypto.timingSafeEqual(crypto.createHmac('sha256', c.secret).update(raw).digest(), Buffer.from(m[1], 'hex'));
}

// An id of Facebook's as text: digits, or a number that a number can hold exactly. null for everything else.
const idOf = v => (typeof v === 'string' && /^\d{1,30}$/.test(v) ? v : typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : null);
// The leads a message of Facebook's is about: [{ leadgenId, pageId, formId }], each lead once — or null when the
// bytes are not a message about Pages. An id written as a bare number may be longer than a number can hold exactly
// (Meta's own example writes them so): a run of sixteen digits or more is read as text.
function leadEvents(raw) {
  const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : '';
  let j = null;
  for (const text of [s.replace(/([:[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"'), s]) {
    try { j = JSON.parse(text); break; } catch { /* the next reading */ }
  }
  if (!j || typeof j !== 'object' || j.object !== 'page' || !Array.isArray(j.entry)) return null;
  const out = [], seen = new Set();
  for (const e of j.entry) {
    for (const ch of e && typeof e === 'object' && Array.isArray(e.changes) ? e.changes : []) {
      if (!ch || ch.field !== 'leadgen' || !ch.value || typeof ch.value !== 'object') continue;
      const leadgenId = idOf(ch.value.leadgen_id), pageId = idOf(ch.value.page_id) || idOf(e.id);
      if (!leadgenId || !pageId || seen.has(leadgenId)) continue;
      seen.add(leadgenId);
      out.push({ leadgenId, pageId, formId: idOf(ch.value.form_id) });
      if (out.length >= MAX_EVENTS) return out;
    }
  }
  return out;
}

// The app is installed on a Page for its leads / taken off it again — with the Page's own token.
const subscribePage = (pageId, pageToken) => call(`${pageId}/subscribed_apps`, { subscribed_fields: 'leadgen', access_token: pageToken }, { method: 'POST' });
const unsubscribePage = (pageId, pageToken) => call(`${pageId}/subscribed_apps`, { access_token: pageToken }, { method: 'DELETE' });

// Is the app on a Page for its leads, as Facebook has it now? Asked with the Page's own token.
async function pageInstalled(pageId, pageToken, { timeoutMs = LEAD_TIMEOUT_MS } = {}) {
  const c = config();
  if (!c) throw new FacebookError('rejected', 'Facebook is not set up on this server');
  const j = await call(`${pageId}/subscribed_apps`, { access_token: pageToken }, { timeoutMs });
  return (Array.isArray(j.data) ? j.data : []).some(a => a && String(a.id) === c.id && Array.isArray(a.subscribed_fields) && a.subscribed_fields.includes('leadgen'));
}

// One lead's answers, as Facebook has them. With the ad's and the campaign's names where the token may read them:
// a refusal of those is no refusal of the lead, which is then asked for as Facebook gives it by itself.
async function lead(leadgenId, pageToken, { timeoutMs = LEAD_TIMEOUT_MS } = {}) {
  let j;
  try { j = await call(leadgenId, { fields: `${LEAD_FIELDS},${LEAD_AD_FIELDS}`, access_token: pageToken }, { timeoutMs }); }
  catch (err) {
    if (!(err instanceof FacebookError) || err.code !== 'rejected' || err.transient) throw err;
    j = await call(leadgenId, { access_token: pageToken }, { timeoutMs });
  }
  if (!j || typeof j !== 'object' || !Array.isArray(j.field_data)) throw new FacebookError('rejected', 'Facebook answered without the lead\'s answers');
  return j;
}

// The app's own token: what the app itself, not a person, asks Facebook with.
const appToken = c => `${c.id}|${c.secret}`;
// Where the app is registered to be told about Pages: { callback_url, fields, active } — or null when nowhere.
async function receiver() {
  const c = config();
  if (!c) throw new FacebookError('rejected', 'Facebook is not set up on this server');
  const j = await call(`${c.id}/subscriptions`, { access_token: appToken(c) });
  const page = (Array.isArray(j.data) ? j.data : []).find(x => x && x.object === 'page');
  if (!page) return null;
  const fields = (Array.isArray(page.fields) ? page.fields : []).map(f => (typeof f === 'string' ? f : f && f.name)).filter(f => typeof f === 'string');
  return { callback_url: String(page.callback_url || ''), fields, active: page.active !== false };
}
// The address is registered for "a lead arrived" on the app's Pages. Facebook asks the address once before it
// answers; an earlier registration of the app for Pages is replaced.
async function registerReceiver(callbackUrl) {
  const c = config();
  if (!c) throw new FacebookError('rejected', 'Facebook is not set up on this server');
  await call(`${c.id}/subscriptions`, { object: 'page', callback_url: callbackUrl, fields: 'leadgen', include_values: 'true', verify_token: verifyToken(), access_token: appToken(c) }, { method: 'POST' });
}

module.exports = {
  FacebookError, SCOPES, DEFAULT_VERSION, STATE_TTL_MS, PAGE_SIZE, MAX_PAGE_CALLS, LEAD_TIMEOUT_MS, MAX_EVENTS, LEAD_FIELDS, LEAD_AD_FIELDS,
  config, isConfigured, newState, stateMatches, authUrl, proofOf, call, exchangeCode, me, granted, pages,
  verifyToken, verifyMatches, signatureMatches, leadEvents, subscribePage, unsubscribePage, pageInstalled, lead, receiver, registerReceiver,
};
