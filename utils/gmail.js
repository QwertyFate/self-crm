/* ═══════════════════════════════════════════════════════════════════════════
   GMAIL — a person's Google mailbox, connected with Google's login (OAuth).
   EMAIL_SYNC_CHANGES Part 1, 2026-10-22: the connection only; nothing is read yet.

   SETUP (Google Cloud console, once per server)
     1. a project with the Gmail API switched on
     2. the OAuth consent screen, user type External so customers can connect too.
        Until Google has verified the app, at most 100 people can connect and each
        sees an "unverified app" screen once. Internal works only for the people
        of the project's own Google Workspace.
     3. an OAuth client of type "Web application" whose authorised redirect URI is
        <public origin>/api/mailbox/google/callback (the origin: utils/base-url.js)
     4. GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET in .env

   SCOPES  gmail.readonly (reading, Part 2) and gmail.send (sending, Part 4). Both are
     asked for at connect so nobody is sent back to Google later; Google lets a person
     untick either, and a connect without both is refused.

   THE STATE  Google hands `state` back unchanged. It is signed here (HMAC under
     SESSION_SECRET) and names the person, the workspace and an expiry, so a callback
     is accepted only for the person who started it: nobody can make someone else's
     CRM account connect a mailbox of their choosing.

   THE TOKEN AT REST  the refresh token is sealed with the Cal.com key's AES-256-GCM
     (utils/calcom.js sealKey/openKey) and never leaves the server.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { sealKey, openKey } = require('./calcom');

const AUTH_URL    = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL   = 'https://oauth2.googleapis.com/token';
const REVOKE_URL  = 'https://oauth2.googleapis.com/revoke';
const PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const STATE_TTL_MS = 10 * 60 * 1000;   // the time a person has on Google's screens
const TIMEOUT_MS   = 15_000;

// code: 'unreachable' (no answer from Google) | 'rejected' (Google answered with an error)
class GmailError extends Error {
  constructor(code, message) { super(message); this.name = 'GmailError'; this.code = code; }
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
  return crypto.createHmac('sha256', secret).update('mailbox-state:' + payload).digest('base64url');
}

// "<userId>.<workspaceId>.<expires ms>.<nonce>.<signature>"
function signState({ userId, workspaceId }, now = Date.now()) {
  const payload = [userId, workspaceId, now + STATE_TTL_MS, crypto.randomBytes(9).toString('base64url')].join('.');
  return payload + '.' + stateSig(payload);
}

// True only for a state this server signed, not expired, for this person in this workspace.
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
// prompt=consent: Google sends a refresh token only on a consent, and a reconnect needs a new one.
function authUrl({ redirectUri, state }) {
  const c = config();
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `${AUTH_URL}?${q}`;
}

async function call(url, init = {}) {
  let res;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch { throw new GmailError('unreachable', 'Google could not be reached'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GmailError('rejected', String(json.error_description || json.error?.message || json.error || `HTTP ${res.status}`).slice(0, 200));
  return json;
}
const form = fields => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

// The code Google's callback carries → { refreshToken, accessToken, scopes }.
async function exchangeCode(code, redirectUri) {
  const c = config();
  const json = await call(TOKEN_URL, form({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }));
  return {
    refreshToken: json.refresh_token || null,
    accessToken:  json.access_token || null,
    scopes:       String(json.scope || '').split(/\s+/).filter(Boolean),
  };
}
const hasAllScopes = granted => SCOPES.every(s => granted.includes(s));

// The mailbox's own address, as Gmail reports it.
async function profile(accessToken) {
  const json = await call(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!json.emailAddress) throw new GmailError('rejected', 'Gmail sent no address');
  return { emailAddress: String(json.emailAddress).trim().toLowerCase() };
}

// Ends the person's whole grant to this app at Google. Best effort: false when Google refused or
// was not reachable (the token may already be gone); the caller goes on either way.
async function revoke(token) {
  if (!token) return false;
  try { await call(REVOKE_URL, form({ token })); return true; }
  catch { return false; }
}

module.exports = {
  SCOPES, GmailError, isConfigured, signState, checkState, authUrl, exchangeCode, hasAllScopes, profile, revoke,
  sealToken: sealKey, openToken: openKey,
};
