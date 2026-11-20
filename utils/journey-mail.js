/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY MAIL — the workspace's sending address for the Customer Journey: a
   Gmail address, connected on Google's own sign-in page (OAuth).
   CUSTOMER_JOURNEY_CHANGES Part 2, 2026-11-19; routes/journey-mail.js.

   ONE ADDRESS PER WORKSPACE (workspace_mail), connected by an owner or admin.
   The person signs in at Google; the CRM never sees a password. What Google
   hands back, a refresh token, is sealed before it is stored (AES-256-GCM,
   the Cal.com key's sealing in utils/calcom.js) and never leaves the server.

   SEND ONLY. Three things are asked of Google: openid and email, to learn
   which address signed in, and gmail.send, to send as that address. The CRM
   cannot read the mailbox. (Gmail's own "which address is this" call,
   users.getProfile, is not allowed with gmail.send alone — hence the two
   sign-in scopes.)

   SETUP (Google Cloud console, once per server). The Google client is the one
   the mailbox connection on hold would use (utils/gmail.js): the same two
   lines in .env, one more redirect address.
     1. a project with the Gmail API switched on
     2. the OAuth consent screen, user type External, published "In
        production" — in "Testing" a sign-in stops working after seven days
     3. an OAuth client of type "Web application" whose authorised redirect
        URI is <public origin>/api/journey/mail/google/callback
        (the origin: utils/base-url.js)
     4. GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET in .env

   THE STATE  Google hands `state` back unchanged. It is signed here (HMAC
     under SESSION_SECRET) and names the person, the workspace and an expiry,
     so a callback is accepted only for the person who started it. Its
     signature has this flow's own prefix: a state made for another Google
     flow of the CRM is no good here.

   THE ADDRESS  comes from the ID token that Google's token endpoint returns
     together with the tokens (claims email, email_verified). Its signature
     is not checked: it arrives directly from Google over HTTPS, in answer to
     this server's own request with the client secret — the case Google's
     OpenID Connect documentation exempts.

   SENDING  accessToken() trades the refresh token for a short-lived access
     token ('gone' when Google no longer accepts it: the person removed the
     CRM's access, so the address has to be connected again). buildMessage()
     writes one RFC 2822 message, plain text and HTML side by side; send()
     posts it, base64url, to Gmail's users.messages.send.

   GOOGLE'S LIMITS (Part 17, 2026-11-20; utils/journey-sends.js keeps the
     CRM's own limits and the pause)  A refusal that means "too much" is told
     apart from every other one: code 'limited' — HTTP 429, or 403 with one of
     Google's rate reasons — with the time Google names for trying again
     (retryAt), when it names one. Who gets it must stop asking Google.

   ONE-CLICK UNSUBSCRIBE (Part 17)  buildMessage() adds the two headers mail
     programs look for — List-Unsubscribe with the contact's own link, and
     List-Unsubscribe-Post: List-Unsubscribe=One-Click (RFC 8058) — when it is
     handed an https address. Never for http or for none: the mail program
     POSTs to that address, and only https is one it may trust.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { sealKey, openKey } = require('./calcom');

const AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SEND_URL   = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send';
const SCOPES = ['openid', 'email', SCOPE_SEND];
const STATE_TTL_MS = 10 * 60 * 1000;   // the time a person has on Google's pages
const TIMEOUT_MS   = 15_000;

// code: 'unreachable' (no answer from Google) | 'rejected' (Google answered with an error) |
//       'gone' (Google no longer accepts the saved sign-in: connect the address again) |
//       'limited' (Google says "too much": its sending limit or a rate limit — retryAt is the time it names for
//                  trying again, a Date, or null when it names none)
class MailError extends Error {
  constructor(code, message, retryAt = null) { super(message); this.name = 'MailError'; this.code = code; this.retryAt = retryAt; }
}

function config() {
  const id     = String(process.env.GOOGLE_MAIL_CLIENT_ID || '').trim();
  const secret = String(process.env.GOOGLE_MAIL_CLIENT_SECRET || '').trim();
  return id && secret ? { id, secret } : null;
}
const isConfigured = () => !!config();

// ── the state ───────────────────────────────────────────────────────────────
function stateSig(payload) {
  const secret = process.env.SESSION_SECRET || 'change-me-in-production';
  return crypto.createHmac('sha256', secret).update('journey-mail-state:' + payload).digest('base64url');
}

// "<userId>.<workspaceId>.<expires ms>.<nonce>.<signature>"
function signState({ userId, workspaceId }, now = Date.now()) {
  const payload = [userId, workspaceId, now + STATE_TTL_MS, crypto.randomBytes(9).toString('base64url')].join('.');
  return payload + '.' + stateSig(payload);
}

// True only for a state this server signed for this flow, not expired, for this person in this workspace.
function checkState(state, { userId, workspaceId }, now = Date.now()) {
  const parts = typeof state === 'string' ? state.split('.') : [];
  if (parts.length !== 5) return false;
  const want = Buffer.from(stateSig(parts.slice(0, 4).join('.')));
  const got  = Buffer.from(parts[4]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
  const [uid, wid, expires] = parts;
  return uid === String(userId) && wid === String(workspaceId) && Number(expires) > now;
}

// ── Google ──────────────────────────────────────────────────────────────────
// prompt=consent: Google sends a refresh token only on a consent, and connecting again needs a new one.
function authUrl({ redirectUri, state }) {
  const c = config();
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', state,
  });
  return `${AUTH_URL}?${q}`;
}

// Does Google's refusal mean "too much"? 429 always. 403 only with one of the reasons Google gives for a limit —
// never with one like domainPolicy or insufficientPermissions, which no waiting puts right.
const RATE_REASONS = ['ratelimitexceeded', 'userratelimitexceeded', 'dailylimitexceeded'];
function isLimit(status, json) {
  if (status === 429) return true;
  if (status !== 403) return false;
  const e = json && json.error && typeof json.error === 'object' ? json.error : {};
  const named = [...(Array.isArray(e.errors) ? e.errors : []), ...(Array.isArray(e.details) ? e.details : [])];
  return e.status === 'RESOURCE_EXHAUSTED' || named.some(d => RATE_REASONS.includes(String((d && d.reason) || '').toLowerCase().replace(/_/g, '')));
}
// The time Google names for trying again, or null: the Retry-After header (seconds, or a date), else the time in its
// own words ("User-rate limit exceeded.  Retry after 2026-11-20T18:01:06.151Z (Mail sending)").
function retryTime(res, words, now = Date.now()) {
  const header = res && res.headers && typeof res.headers.get === 'function' ? String(res.headers.get('retry-after') || '').trim() : '';
  if (/^\d{1,8}$/.test(header)) return new Date(now + Number(header) * 1000);
  const inWords = /retry after\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2}))/i.exec(String(words || ''));
  const named = [header, inWords ? inWords[1] : ''].map(v => (v ? Date.parse(v) : NaN)).find(Number.isFinite);
  return named === undefined ? null : new Date(named);
}

async function call(url, init = {}) {
  let res;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch { throw new MailError('unreachable', 'Google could not be reached'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const words = String(json.error_description || json.error?.message || (typeof json.error === 'string' && json.error) || `HTTP ${res.status}`), said = words.slice(0, 200);
    if (isLimit(res.status, json)) throw new MailError('limited', said, retryTime(res, words));   // read from the whole text: the time may stand late in it
    throw new MailError(json.error === 'invalid_grant' ? 'gone' : 'rejected', said);
  }
  return json;
}
const form = fields => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

// What an ID token says, or null. Read only from a token that came straight from Google's token endpoint (header).
function idTokenClaims(idToken) {
  const part = typeof idToken === 'string' ? idToken.split('.')[1] : null;
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : null;
  } catch { return null; }
}

// The code Google's callback carries → { refreshToken, accessToken, scopes, email, emailVerified }.
async function exchangeCode(code, redirectUri) {
  const c = config();
  const json = await call(TOKEN_URL, form({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }));
  const claims = idTokenClaims(json.id_token) || {};
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  return {
    refreshToken:  json.refresh_token || null,
    accessToken:   json.access_token || null,
    scopes:        String(json.scope || '').split(/\s+/).filter(Boolean),
    email:         isAddress(email) ? email : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  };
}
const canSend = granted => Array.isArray(granted) && granted.includes(SCOPE_SEND);

// A fresh access token for a saved sign-in. 'gone': Google no longer accepts the refresh token.
async function accessToken(refreshToken) {
  const c = config();
  if (!c) throw new MailError('rejected', 'Google sign-in is not set up on this server');
  const json = await call(TOKEN_URL, form({ refresh_token: refreshToken, client_id: c.id, client_secret: c.secret, grant_type: 'refresh_token' }));
  if (!json.access_token) throw new MailError('rejected', 'Google sent no access token');
  return String(json.access_token);
}

// Ends the person's whole grant to this app at Google. Best effort: false when Google refused or
// was not reachable (the token may already be gone); the caller goes on either way.
async function revoke(token) {
  if (!token) return false;
  try { await call(REVOKE_URL, form({ token })); return true; }
  catch { return false; }
}

// ── the message ─────────────────────────────────────────────────────────────
// One address, nothing else: no name, no brackets, no second address, no line break, plain characters only (a
// header line carries no others as they are). What goes into From and To.
function isAddress(value) {
  return typeof value === 'string' && value.length <= 254 && /^[\x21-\x7e]+$/.test(value)
    && /^[^<>"(),;:\\@]+@[^<>"(),;:\\@]+\.[^<>"(),;:\\@]{2,}$/.test(value);
}

// A header's text on one line. Plain and short: as it is. Anything else as RFC 2047 words of at most 39 bytes —
// with "Subject: " in front that stays under the 78 characters a mail line should have — cut between characters,
// never inside one.
function headerText(value) {
  const s = String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
  if (/^[\x20-\x7e]*$/.test(s) && s.length <= 60 && !s.includes('=?')) return s;
  const words = [];
  let word = '';
  for (const ch of s) {
    if (word && Buffer.byteLength(word + ch, 'utf8') > 39) { words.push(word); word = ''; }
    word += ch;
  }
  if (word) words.push(word);
  return words.map(w => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}
const base64Lines = text => Buffer.from(String(text ?? ''), 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n');
const part = (type, text) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(text)}\r\n`;

// The two headers of a one-click unsubscribe (RFC 8058), or nothing. Only for an https address, and only for one
// that is nothing but an address: no blank, no line break, no bracket or comma that could end or extend the header.
function unsubscribeHeaders(url) {
  return typeof url === 'string' && /^https:\/\/[\x21-\x7e]{1,900}$/.test(url) && !/[<>,]/.test(url)
    ? `List-Unsubscribe: <${url}>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n` : '';
}

// { from, to, subject, text, html?, unsubscribe? } → the message as RFC 2822 text. With html: both versions, the mail
// program picks. unsubscribe: the recipient's own "no more emails" address — as headers only when it is https.
function buildMessage({ from, to, subject, text, html, unsubscribe }) {
  if (!isAddress(from)) throw new TypeError('The sender is not one email address');
  if (!isAddress(to)) throw new TypeError('The recipient is not one email address');
  const head = `From: ${from}\r\nTo: ${to}\r\nSubject: ${headerText(subject)}\r\n${unsubscribeHeaders(unsubscribe)}MIME-Version: 1.0\r\n`;
  if (typeof html !== 'string' || !html) return head + part('text/plain', text);
  const boundary = 'crm-' + crypto.randomBytes(12).toString('hex');   // the parts are base64, which has no "-": it cannot occur in them
  return `${head}Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
    + `--${boundary}\r\n${part('text/plain', text)}--${boundary}\r\n${part('text/html', html)}--${boundary}--\r\n`;
}

// Sends one message as the signed-in address → { id } as Gmail names it.
async function send(token, message) {
  const json = await call(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message, 'utf8').toString('base64url') }),
  });
  return { id: json.id ? String(json.id) : null };
}

module.exports = {
  SCOPES, SCOPE_SEND, MailError, isConfigured, signState, checkState, authUrl, exchangeCode, canSend, accessToken, revoke,
  isAddress, headerText, unsubscribeHeaders, buildMessage, send, sealToken: sealKey, openToken: openKey,
};
