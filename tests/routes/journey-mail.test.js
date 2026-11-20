// ROUTE tests for /api/journey/mail (CUSTOMER_JOURNEY_CHANGES Part 2, 2026-11-19): the workspace's sending address
// for the Customer Journey — a Gmail address, connected on Google's own sign-in page. The real route over a fake pool
// and a fake Google (globalThis.fetch).
//
// Pinned: one address per workspace, seen by everyone, connected / tested / disconnected by owners and admins only;
// the sign-in asks for sending only, with a signed state; the callback is accepted only with a state signed for this
// very person and workspace in this flow, before anything is sent to Google; the refresh token is sealed before it
// is stored and never appears in an answer; a refusal (denied, no send permission, no refresh token, no verified
// address, Google down) writes nothing and revokes nothing; the grant is revoked at Google only when no workspace
// uses the address any more; the test email goes from the connected address to the caller's own login address, with
// words fixed on the server.
// Part 17 (2026-11-20), the safeguards around sending: the answer's `sending` (the limits, what went out, a pause),
// saving the limits, lifting a pause, and the test email as an email like any other — counted, refused while the
// address is paused or its day is full, and pausing the address when Google says "limit". What a limit is and how
// a pause grows is tests/unit/journey-sends.test.js; the database's part of it is tests/helpers/fake-sends.js.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');
const { createSends } = require('../helpers/fake-sends');

const ENV = { GOOGLE_MAIL_CLIENT_ID: 'cid-123.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret', APP_BASE_URL: 'https://crm.example.de', SESSION_SECRET: 'test-session-secret' };
const saved = {};
for (const k of [...Object.keys(ENV), 'BASE_URL', 'CALCOM_ENCRYPTION_KEY']) saved[k] = process.env[k];
Object.assign(process.env, ENV); delete process.env.BASE_URL; delete process.env.CALCOM_ENCRYPTION_KEY;

const mail  = require('../../utils/journey-mail');
const gmail = require('../../utils/gmail');
const SEND = 'https://www.googleapis.com/auth/gmail.send';
const WS = 7, OTHER = 8;
const OWNER = { id: 1, workspaceId: WS, role: 'owner' }, ADMIN = { id: 2, workspaceId: WS, role: 'admin' }, MEMBER = { id: 3, workspaceId: WS, role: 'member' }, THEIRS = { id: 9, workspaceId: OTHER, role: 'owner' };

// ── the fake database: workspace_mail rows, and the people ──
const USERS = [{ id: 1, name: 'Olga Owner', email: 'Olga@Firma.de', ws: [WS] }, { id: 2, name: 'Adam Admin', email: 'adam@firma.de', ws: [WS] }, { id: 3, name: 'Mia Member', email: 'mia@firma.de', ws: [WS] },
  { id: 9, name: 'Theo Theirs', email: 'theo@andere.de', ws: [OTHER] }];
const db = { rows: [], log: [], users: USERS, sends: [], runs: [], broken: null };
// Part 17: the limits, the count and the pause — the statements of utils/journey-sends.js, over the same rows
const MEMBERS = [{ user_id: 1, workspace_id: WS, role: 'owner' }, { user_id: 2, workspace_id: WS, role: 'admin' }, { user_id: 3, workspace_id: WS, role: 'member' }, { user_id: 9, workspace_id: OTHER, role: 'owner' }];
const limits = createSends({ get mail() { return db.rows; }, get sends() { return db.sends; }, get runs() { return db.runs; }, members: MEMBERS });
const told = [];   // who the route told, and what
const pool = {
  query: async (sql, p = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    db.log.push({ sql: t, params: p });
    if (db.broken && db.broken.test(t)) throw new Error('the database is away');
    const known = limits.answer(t, p);
    if (known) return known;
    if (t === 'SELECT m.provider, m.email, m.connected_at, m.refresh_token_sealed, u.name AS connected_by_name FROM workspace_mail m LEFT JOIN users u ON u.id = m.connected_by WHERE m.workspace_id = $1') {
      return { rows: db.rows.filter(r => r.workspace_id === p[0]).map(r => ({ provider: r.provider, email: r.email, connected_at: r.connected_at, refresh_token_sealed: r.refresh_token_sealed,
        connected_by_name: db.users.find(u => u.id === r.connected_by)?.name ?? null })) };
    }
    if (t === 'SELECT 1 FROM workspace_mail WHERE email = $1 LIMIT 1') return { rows: db.rows.filter(r => r.email === p[0]).slice(0, 1).map(() => ({ '?column?': 1 })) };
    if (t === 'SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1') return { rows: db.rows.filter(r => r.workspace_id === p[0]).map(r => ({ email: r.email, refresh_token_sealed: r.refresh_token_sealed })) };
    if (t.startsWith("INSERT INTO workspace_mail (workspace_id, provider, email, refresh_token_sealed, connected_by) VALUES ($1,'google',$2,$3,$4) ON CONFLICT (workspace_id) DO UPDATE SET provider = 'google', email = EXCLUDED.email, refresh_token_sealed = EXCLUDED.refresh_token_sealed, connected_by = EXCLUDED.connected_by, connected_at = NOW()")) {
      // what the statement does not name stays as it was (ON CONFLICT … DO UPDATE): the limits and the pause of the row
      const row = { ...db.rows.find(r => r.workspace_id === p[0]), workspace_id: p[0], provider: 'google', email: p[1], refresh_token_sealed: p[2], connected_by: p[3], connected_at: '2026-11-19T09:00:00.000Z' };
      db.rows = db.rows.filter(r => r.workspace_id !== row.workspace_id).concat(row);
      return { rows: [], rowCount: 1 };
    }
    if (t === 'SELECT u.email FROM users u JOIN user_workspaces uw ON uw.user_id = u.id WHERE u.id = $1 AND uw.workspace_id = $2') {
      return { rows: db.users.filter(u => u.id === p[0] && u.ws.includes(p[1])).map(u => ({ email: u.email })) };
    }
    if (t === 'DELETE FROM workspace_mail WHERE workspace_id = $1 RETURNING email, refresh_token_sealed') {
      const gone = db.rows.filter(r => r.workspace_id === p[0]);
      db.rows = db.rows.filter(r => !gone.includes(r));
      return { rows: gone.map(r => ({ email: r.email, refresh_token_sealed: r.refresh_token_sealed })), rowCount: gone.length };
    }
    throw new Error('unexpected SQL: ' + t);
  },
};
const writes = () => db.log.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

// ── the fake Google: `plan` maps a URL to { status, body }, { throw: true }, or a function of what was sent ──
const realFetch = globalThis.fetch;
let google = [];
function fakeGoogle(plan) {
  google = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    const sent = typeof init.body === 'string' ? (String(init.headers?.['Content-Type'] || '').includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : undefined;
    const call = { url: u, method: init.method || 'GET', headers: init.headers || {}, body: sent };
    google.push(call);
    let r = plan[u] || { status: 404, body: { error: 'not_found' } };
    if (typeof r === 'function') r = r(call);
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const TOKEN = 'https://oauth2.googleapis.com/token', REVOKE = 'https://oauth2.googleapis.com/revoke', SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const idToken = claims => ['eyJhbGciOiJSUzI1NiJ9', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const signIn = (email = 'News@Firma.de', extra = {}) => ({ status: 200, body: { access_token: 'ya29.first', refresh_token: '1//refresh-plain', scope: `openid https://www.googleapis.com/auth/userinfo.email ${SEND}`,
  token_type: 'Bearer', expires_in: 3599, id_token: idToken({ sub: '1', email, email_verified: true }), ...extra } });
// the token address answers a sign-in (authorization_code) and a later refresh (refresh_token) differently
const tokenUrl = (first = signIn()) => call => (call.body.grant_type === 'refresh_token' ? { status: 200, body: { access_token: 'ya29.fresh', expires_in: 3599 } } : first);
const happy = () => ({ [TOKEN]: tokenUrl(), [SEND_URL]: { status: 200, body: { id: 'msg-1' } }, [REVOKE]: { status: 200, body: {} } });
const callsTo = url => google.filter(c => c.url === url);

let owner, admin, member, other;
before(async () => {
  const notifications = { notify: () => {}, notifyUser: async (...a) => { told.push(a); return true; } };   // Part 17: who hears of a pause
  const as = user => serve({ '/api/journey/mail': loadRoute('journey-mail.js', { pool, user, notifications }) });
  owner = await as(OWNER); admin = await as(ADMIN); member = await as(MEMBER); other = await as(THEIRS);
});
after(async () => {
  for (const s of [owner, admin, member, other]) await s.close();
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
beforeEach(() => { db.rows = []; db.log = []; db.users = USERS; db.sends = []; db.runs = []; db.broken = null; told.length = 0; limits.asked.length = 0; fakeGoogle(happy()); Object.assign(process.env, ENV); });

// A navigation: the redirect is read, not followed.
const nav = (srv, path) => realFetch(srv.base + path, { redirect: 'manual' }).then(r => ({ status: r.status, location: r.headers.get('location') }));
const stateFor = who => mail.signState({ userId: who.id, workspaceId: who.workspaceId });
const callback = (srv, who, query = {}) => nav(srv, '/api/journey/mail/google/callback?' + new URLSearchParams({ code: '4/code', state: stateFor(who), ...query }));
const connect = async (srv = owner, who = OWNER, email) => { if (email) fakeGoogle({ ...happy(), [TOKEN]: tokenUrl(signIn(email)) }); return callback(srv, who); };
const CONNECTION = { provider: 'google', email: 'news@firma.de', connected_at: '2026-11-19T09:00:00.000Z', connected_by_name: 'Olga Owner' };

describe('what the page is told', () => {
  test('nothing connected: whether Google sign-in is set up, and whether the caller may connect', async () => {
    // (`sending` since Part 17: null while no address is connected)
    assert.deepEqual((await owner.request('GET', '/api/journey/mail')).body, { configured: true, can_manage: true, connection: null, sending: null });
    assert.deepEqual((await admin.request('GET', '/api/journey/mail')).body, { configured: true, can_manage: true, connection: null, sending: null });
    const m = await member.request('GET', '/api/journey/mail');
    assert.equal(m.status, 200, 'everyone may ask');
    assert.deepEqual(m.body, { configured: true, can_manage: false, connection: null, sending: null });
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    assert.equal((await owner.request('GET', '/api/journey/mail')).body.configured, false);
  });
  test('connected: the address, since when and by whom — for everyone in the workspace, and never the token', async () => {
    await connect();
    for (const srv of [owner, member]) {
      const r = await srv.request('GET', '/api/journey/mail');
      assert.deepEqual(r.body.connection, CONNECTION);
      assert.doesNotMatch(JSON.stringify(r.body), /refresh|sealed|token|1\/\//i);
    }
    assert.equal((await other.request('GET', '/api/journey/mail')).body.connection, null, 'another workspace sees nothing of it');
  });
  test('the person who connected it has left: the address stays, without a name', async () => {
    await connect();
    db.users = USERS.filter(u => u.id !== 1);
    assert.equal((await member.request('GET', '/api/journey/mail')).body.connection.connected_by_name, null);
  });
});

describe('the way to Google\'s sign-in page', () => {
  test('an owner or admin is sent to Google: sending only, offline, with a state signed for this person and workspace', async () => {
    const r = await nav(owner, '/api/journey/mail/google/start');
    assert.equal(r.status, 302);
    const url = new URL(r.location);
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    const q = Object.fromEntries(url.searchParams);
    assert.equal(q.scope, `openid email ${SEND}`);
    assert.equal(q.redirect_uri, 'https://crm.example.de/api/journey/mail/google/callback');
    assert.deepEqual([q.client_id, q.response_type, q.access_type, q.prompt], [ENV.GOOGLE_MAIL_CLIENT_ID, 'code', 'offline', 'consent']);
    assert.equal(mail.checkState(q.state, { userId: 1, workspaceId: WS }), true);
    assert.equal(mail.checkState(q.state, { userId: 2, workspaceId: WS }), false);
    assert.equal((await nav(admin, '/api/journey/mail/google/start')).location.startsWith('https://accounts.google.com/'), true);
    assert.equal(google.length, 0, 'nothing is asked of Google yet');
  });
  test('a member is sent back with the reason; so is everyone while Google sign-in is not set up', async () => {
    assert.deepEqual(await nav(member, '/api/journey/mail/google/start'), { status: 302, location: '/?journey_mail=forbidden' });
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    assert.deepEqual(await nav(owner, '/api/journey/mail/google/start'), { status: 302, location: '/?journey_mail=not_configured' });
  });
});

describe('coming back from Google', () => {
  test('the sign-in is saved for the workspace: the address in lower case, the refresh token sealed, who connected it', async () => {
    assert.deepEqual(await connect(), { status: 302, location: '/?journey_mail=connected' });
    assert.equal(db.rows.length, 1);
    const [row] = db.rows;
    assert.deepEqual([row.workspace_id, row.provider, row.email, row.connected_by], [WS, 'google', 'news@firma.de', 1]);
    assert.doesNotMatch(row.refresh_token_sealed, /refresh-plain/, 'not readable at rest');
    assert.equal(mail.openToken(row.refresh_token_sealed), '1//refresh-plain');
    const [asked] = callsTo(TOKEN);
    assert.deepEqual(asked.body, { code: '4/code', client_id: ENV.GOOGLE_MAIL_CLIENT_ID, client_secret: ENV.GOOGLE_MAIL_CLIENT_SECRET, redirect_uri: 'https://crm.example.de/api/journey/mail/google/callback', grant_type: 'authorization_code' });
    assert.equal(callsTo(REVOKE).length, 0);
  });
  test('an admin may connect too; the workspace and the person come from the session', async () => {
    assert.equal((await callback(admin, ADMIN, { workspace_id: String(OTHER), user_id: '9' })).location, '/?journey_mail=connected');
    assert.deepEqual([db.rows[0].workspace_id, db.rows[0].connected_by], [WS, 2]);
  });
  test('a member is refused before anything is sent to Google', async () => {
    assert.equal((await callback(member, MEMBER)).location, '/?journey_mail=forbidden');
    assert.deepEqual([google.length, db.rows.length], [0, 0]);
  });
  test('a state that is not this person\'s, this workspace\'s, this flow\'s, or is too old: refused before anything is sent to Google', async () => {
    const old = mail.signState({ userId: 1, workspaceId: WS }, Date.now() - 11 * 60 * 1000);
    for (const state of [stateFor(ADMIN), stateFor(THEIRS), old, gmail.signState({ userId: 1, workspaceId: WS }), 'made.up.1.2.3', '']) {
      const r = await nav(owner, '/api/journey/mail/google/callback?' + new URLSearchParams({ code: '4/code', state }));
      assert.deepEqual(r, { status: 302, location: '/?journey_mail=expired' }, state.slice(0, 20));
    }
    assert.equal((await nav(owner, '/api/journey/mail/google/callback?code=4/code')).location, '/?journey_mail=expired', 'no state at all');
    assert.deepEqual([google.length, db.rows.length], [0, 0]);
  });
  test('"Cancel" on Google\'s page, or no code: nothing is asked, nothing saved', async () => {
    assert.equal((await nav(owner, '/api/journey/mail/google/callback?' + new URLSearchParams({ error: 'access_denied', state: stateFor(OWNER) }))).location, '/?journey_mail=denied');
    assert.equal((await nav(owner, '/api/journey/mail/google/callback?' + new URLSearchParams({ state: stateFor(OWNER) }))).location, '/?journey_mail=denied');
    assert.deepEqual([google.length, db.rows.length], [0, 0]);
  });
  test('"send email" left unticked on Google\'s page: said so, nothing saved, nothing revoked', async () => {
    fakeGoogle({ ...happy(), [TOKEN]: tokenUrl(signIn('news@firma.de', { scope: 'openid https://www.googleapis.com/auth/userinfo.email' })) });
    assert.equal((await callback(owner, OWNER)).location, '/?journey_mail=scopes');
    assert.deepEqual([db.rows.length, callsTo(REVOKE).length], [0, 0]);
  });
  test('no refresh token, no address, an address Google has not verified, a refusal, an outage: "failed", nothing saved, nothing revoked', async () => {
    const cases = [signIn('news@firma.de', { refresh_token: undefined }), signIn('news@firma.de', { id_token: undefined }), signIn('news@firma.de', { id_token: idToken({ email: 'news@firma.de', email_verified: false }) }),
      signIn('Name <a@b.de>'), { status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } }, { throw: true }];
    for (const first of cases) {
      fakeGoogle({ ...happy(), [TOKEN]: tokenUrl(first) });
      assert.equal((await callback(owner, OWNER)).location, '/?journey_mail=failed');
      assert.deepEqual([db.rows.length, callsTo(REVOKE).length], [0, 0]);
    }
  });
  test('while Google sign-in is not set up nothing is accepted', async () => {
    const state = stateFor(OWNER);
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    assert.equal((await nav(owner, '/api/journey/mail/google/callback?' + new URLSearchParams({ code: 'c', state }))).location, '/?journey_mail=not_configured');
    assert.equal(google.length, 0);
  });
});

describe('connecting again', () => {
  test('the same address: the new sign-in takes the old one\'s place and nothing is revoked (it is the same grant)', async () => {
    await connect();
    const first = db.rows[0].refresh_token_sealed;
    fakeGoogle({ ...happy(), [TOKEN]: tokenUrl(signIn('NEWS@firma.de', { refresh_token: '1//second' })) });
    assert.equal((await callback(admin, ADMIN)).location, '/?journey_mail=connected');
    assert.equal(db.rows.length, 1, 'still one address for the workspace');
    assert.notEqual(db.rows[0].refresh_token_sealed, first);
    assert.equal(mail.openToken(db.rows[0].refresh_token_sealed), '1//second');
    assert.equal(db.rows[0].connected_by, 2);
    assert.equal(callsTo(REVOKE).length, 0);
  });
  test('another address: it takes the place, and the old one\'s grant is ended at Google', async () => {
    await connect();
    await connect(owner, OWNER, 'info@firma.de');
    assert.deepEqual(db.rows.map(r => r.email), ['info@firma.de']);
    assert.deepEqual(callsTo(REVOKE).map(c => c.body), [{ token: '1//refresh-plain' }]);
  });
  test('…unless another workspace still sends with the old address', async () => {
    await connect();
    await connect(other, THEIRS);   // the same address, connected in the other workspace too
    await connect(owner, OWNER, 'info@firma.de');
    assert.deepEqual(db.rows.map(r => [r.workspace_id, r.email]).sort(), [[WS, 'info@firma.de'], [OTHER, 'news@firma.de']]);
    assert.equal(callsTo(REVOKE).length, 0);
  });
});

describe('the test email', () => {
  const message = () => Buffer.from(callsTo(SEND_URL)[0].body.raw, 'base64url').toString('utf8');
  const partOf = (msg, type) => Buffer.from(msg.match(new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]*?)\\r\\n--`))[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  const subject = msg => msg.match(/^Subject: (.*(?:\r\n .*)*)/m)[1].replace(/\r\n /g, '').replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));

  test('goes from the connected address to the caller\'s own login address, with a fresh access token', async () => {
    await connect();
    fakeGoogle(happy());
    const r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { success: true, to: 'olga@firma.de' });
    assert.deepEqual(google.map(c => c.url), [TOKEN, SEND_URL]);
    assert.equal(callsTo(TOKEN)[0].body.refresh_token, '1//refresh-plain');
    assert.equal(callsTo(TOKEN)[0].body.grant_type, 'refresh_token');
    assert.equal(callsTo(SEND_URL)[0].headers.Authorization, 'Bearer ya29.fresh');
    const msg = message();
    assert.match(msg, /^From: news@firma\.de\r\nTo: olga@firma\.de\r\nSubject: /);
    assert.equal(subject(msg), 'Test: Die E-Mail-Verbindung des CRM funktioniert', 'German unless English is asked for');
    assert.match(partOf(msg, 'text/plain'), /über die verbundene Adresse news@firma\.de gesendet/);
    assert.match(partOf(msg, 'text/html'), /<p style="[^"]*">Diese Test-E-Mail wurde vom CRM über die verbundene Adresse news@firma\.de gesendet\.<\/p>/);
    assert.deepEqual(writes().filter(c => !c.sql.startsWith('INSERT')), [], 'a test changes nothing');
    assert.deepEqual(writes().map(c => c.sql.split(' (')[0]), ['INSERT INTO workspace_mail', 'INSERT INTO journey_sends'], '…but that it is counted (Part 17)');
  });
  test('in English when the page is in English; an admin gets it at the admin\'s own address', async () => {
    await connect();
    fakeGoogle(happy());
    const r = await admin.request('POST', '/api/journey/mail/test', { lang: 'en' });
    assert.deepEqual(r.body, { success: true, to: 'adam@firma.de' });
    const msg = message();
    assert.match(msg, /^From: news@firma\.de\r\nTo: adam@firma\.de\r\n/);
    assert.equal(subject(msg), 'Test: the CRM\'s email connection works');
    assert.match(partOf(msg, 'text/html'), /The connection works/);
  });
  test('its words are the server\'s: a recipient, a subject or a text in the request change nothing', async () => {
    await connect();
    fakeGoogle(happy());
    await owner.request('POST', '/api/journey/mail/test', { to: 'victim@example.de', subject: 'Buy now', text: 'spam', html: '<b>spam</b>', from: 'ceo@firma.de', lang: 'xx' });
    const msg = message();
    assert.match(msg, /^From: news@firma\.de\r\nTo: olga@firma\.de\r\n/);
    assert.equal(subject(msg), 'Test: Die E-Mail-Verbindung des CRM funktioniert');
    assert.doesNotMatch(msg + partOf(msg, 'text/plain') + partOf(msg, 'text/html'), /victim|spam|Buy now|ceo@/);
  });
  test('a member is refused, and nothing is asked of Google', async () => {
    await connect();
    fakeGoogle(happy());
    const r = await member.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code], [403, 'forbidden']);
    assert.equal(google.length, 0);
  });
  test('nothing connected: said so, nothing asked of Google', async () => {
    const r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code], [409, 'not_connected']);
    assert.equal(google.length, 0);
  });
  test('Google no longer accepts the sign-in: "gone", so the page can ask for a new sign-in', async () => {
    await connect();
    fakeGoogle({ ...happy(), [TOKEN]: { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } });
    const r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code], [409, 'gone']);
    assert.equal(callsTo(SEND_URL).length, 0);
    assert.equal(db.rows.length, 1, 'the address stays shown until someone signs in again or disconnects');
  });
  test('Gmail refuses the email: Google\'s own words come along; an outage is told apart', async () => {
    await connect();
    fakeGoogle({ ...happy(), [SEND_URL]: { status: 400, body: { error: { code: 400, message: 'Mail service not enabled', status: 'FAILED_PRECONDITION' } } } });
    let r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code, r.body.detail], [502, 'rejected', 'Mail service not enabled']);
    fakeGoogle({ ...happy(), [SEND_URL]: { throw: true } });
    r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code, r.body.detail], [502, 'unreachable', undefined]);
  });
  test('a sign-in sealed under another server secret cannot be opened: "gone", nothing asked of Google', async () => {
    await connect();
    process.env.SESSION_SECRET = 'a-new-secret';
    fakeGoogle(happy());
    const r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code], [409, 'gone']);
    assert.equal(google.length, 0);
  });
  test('a caller whose own address is no address gets no test', async () => {
    await connect();
    db.users = USERS.map(u => (u.id === 1 ? { ...u, email: 'not an address' } : u));
    fakeGoogle(happy());
    const r = await owner.request('POST', '/api/journey/mail/test', {});
    assert.deepEqual([r.status, r.body.code], [409, 'no_address']);
    assert.equal(google.length, 0);
  });
  test('no answer ever carries the token', async () => {
    await connect();
    for (const plan of [happy(), { ...happy(), [SEND_URL]: { status: 403, body: { error: { message: 'no' } } } }]) {
      fakeGoogle(plan);
      const r = await owner.request('POST', '/api/journey/mail/test', {});
      assert.doesNotMatch(JSON.stringify(r.body), /refresh|sealed|ya29|1\/\//i);
    }
  });
});

// ── Part 17: the safeguards around sending ──────────────────────────────────
// (the route works on the real clock: times are given from now)
const SENDING = { kind: 'workspace', google_day: 2000, limits: { day: 1500, hour: 150, person: 3 }, defaults: { day: 1500, hour: 150, person: 3 }, max: { day: 2000, hour: 2000, person: 20 },
  sent: { day: 0, hour: 0 }, paused_until: null, pause_reason: null, pause_detail: null };
const whole = (srv = owner) => srv.request('GET', '/api/journey/mail').then(r => r.body);
const sending = (srv = owner) => whole(srv).then(b => b.sending);
const rowOf = wid => db.rows.find(r => r.workspace_id === wid);
const fromNow = minutes => new Date(Date.now() + minutes * 60000);
const mailed = (n, minutes, extra = {}) => Array.from({ length: n }, () => ({ workspace_id: WS, from_email: 'news@firma.de', contact_id: null, kind: 'step', sent_at: fromNow(minutes), ...extra }));
const pausedRow = (row, minutes, extra = {}) => Object.assign(row, { paused_until: fromNow(minutes), pause_reason: 'google_limit', pause_detail: 'User-rate limit exceeded.', pause_count: 2, ...extra });
const waitingRun = (id, wid, held, minutes) => ({ id, workspace_id: wid, flow_id: 2, status: 'waiting', held, due_at: fromNow(minutes) });
const limit429 = until => ({ status: 429, body: { error: { code: 429, message: `User-rate limit exceeded.  Retry after ${until.toISOString()} (Mail sending)`, errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }] } } });
const quiet = async fn => { const words = [], real = console.error; console.error = (...a) => words.push(a.join(' ')); try { return [await fn(), words]; } finally { console.error = real; } };

describe('what the page is told about sending', () => {
  test('connected: the kind of address, Google\'s own limit, what holds now, the defaults, the most that may be set, what went out, no pause — for everyone in the workspace', async () => {
    await connect();
    assert.deepEqual(await sending(), SENDING);
    assert.deepEqual(await sending(member), SENDING, 'a member sees it too');
    assert.equal(await sending(other), null, 'another workspace has no connection: nothing');
    assert.deepEqual(Object.keys(await whole()), ['configured', 'can_manage', 'connection', 'sending']);
  });
  test('a gmail.com address is a personal one: Google\'s 500, and the CRM\'s 400 a day and 40 an hour', async () => {
    await connect(owner, OWNER, 'Max.Muster@Gmail.com');
    const s = await sending();
    assert.deepEqual([s.kind, s.google_day, s.limits, s.defaults, s.max], ['personal', 500, { day: 400, hour: 40, person: 3 }, { day: 400, hour: 40, person: 3 }, { day: 500, hour: 500, person: 20 }]);
  });
  test('what went out: from this address in the last 24 hours and in the last 60 minutes — whichever workspace sent, test emails too', async () => {
    await connect();
    db.sends = [...mailed(3, -10), ...mailed(2, -300), ...mailed(1, -30 * 60), ...mailed(1, -20, { kind: 'test' }), ...mailed(2, -40, { workspace_id: OTHER }), ...mailed(4, -5, { from_email: 'other@firma.de' })];
    assert.deepEqual((await sending()).sent, { day: 8, hour: 6 });
  });
  test('a pause: until when — as a time a page can read —, why, and Google\'s own words; a pause that is over is none', async () => {
    await connect();
    const until = pausedRow(rowOf(WS), 90).paused_until;
    const s = await sending();
    assert.deepEqual([s.paused_until, s.pause_reason, s.pause_detail], [until.toISOString(), 'google_limit', 'User-rate limit exceeded.']);
    pausedRow(rowOf(WS), -1);
    const over = await sending();
    assert.deepEqual([over.paused_until, over.pause_reason, over.pause_detail], [null, null, null]);
  });
  test('the address is one address: a second workspace that sends with it shares the count and the pause, and has limits of its own', async () => {
    await connect(); await connect(other, THEIRS);
    rowOf(WS).limit_day = 100;
    db.sends = mailed(7, -10);
    const until = pausedRow(rowOf(WS), 60).paused_until;   // Google refused an email of workspace 7
    const theirs = await sending(other);
    assert.deepEqual([theirs.sent, theirs.limits.day, theirs.paused_until], [{ day: 7, hour: 7 }, 1500, until.toISOString()]);
    assert.equal((await sending()).limits.day, 100);
  });
  test('never the token, and nothing the page has no use for', async () => {
    await connect();
    pausedRow(rowOf(WS), 60);
    const body = await whole();
    assert.deepEqual(Object.keys(body.sending), ['kind', 'google_day', 'limits', 'defaults', 'max', 'sent', 'paused_until', 'pause_reason', 'pause_detail']);
    assert.doesNotMatch(JSON.stringify(body), /refresh|sealed|token|1\/\/|pause_count|"from"/i);
  });
});

describe('saving the limits', () => {
  const save = (body, srv = owner) => srv.request('PUT', '/api/journey/mail/limits', body);
  const saved = (wid = WS) => [rowOf(wid).limit_day ?? null, rowOf(wid).limit_hour ?? null, rowOf(wid).limit_person ?? null];
  test('an owner sets the three numbers of the workspace\'s connection, and gets back what GET answers', async () => {
    await connect();
    const r = await save({ day: 800, hour: 60, person: 5 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, await whole());
    assert.deepEqual([r.body.sending.limits, r.body.sending.defaults, r.body.sending.max], [{ day: 800, hour: 60, person: 5 }, SENDING.defaults, SENDING.max]);
    assert.deepEqual(saved(), [800, 60, 5]);
  });
  test('null for one of them is "the default" — an admin may save too', async () => {
    await connect();
    await save({ day: 800, hour: 60, person: 5 });
    const r = await save({ day: null, hour: 100, person: null }, admin);
    assert.deepEqual([r.status, r.body.sending.limits, r.body.can_manage], [200, { day: 1500, hour: 100, person: 3 }, true]);
    assert.deepEqual(saved(), [null, 100, null]);
    assert.deepEqual((await save({ day: null, hour: null, person: null })).body.sending.limits, SENDING.limits);
    assert.deepEqual((await save({ day: 2000, hour: 2000, person: 20 })).body.sending.limits, { day: 2000, hour: 2000, person: 20 }, 'up to what Google allows a Workspace address');
  });
  test('anything else is refused with 400 "limits", and nothing is saved', async () => {
    await connect();
    await save({ day: 800, hour: 60, person: 5 });
    db.log = [];
    for (const body of [{ day: 2001, hour: 60, person: 5 }, { day: 0, hour: 60, person: 5 }, { day: 800, hour: 801, person: 5 }, { day: null, hour: 1501, person: 5 }, { day: 800, hour: 60, person: 21 }, { day: 800, hour: 60, person: 0 },
      { day: 1.5, hour: 60, person: 5 }, { day: 'many', hour: 60, person: 5 }, { day: 800, hour: 60 }, { hour: 60, person: 5 }, {}, { day: true, hour: 60, person: 5 }, { day: [800], hour: 60, person: 5 }, { day: -5, hour: null, person: null }]) {
      const r = await save(body);
      assert.deepEqual([r.status, r.body.code], [400, 'limits'], JSON.stringify(body));
    }
    assert.deepEqual(saved(), [800, 60, 5]);
    assert.deepEqual(writes(), []);
  });
  test('a personal address may have at most what Google allows a personal address', async () => {
    await connect(owner, OWNER, 'max@gmail.com');
    assert.equal((await save({ day: 501, hour: null, person: null })).body.code, 'limits');
    assert.deepEqual((await save({ day: 500, hour: 500, person: null })).body.sending.limits, { day: 500, hour: 500, person: 3 });
  });
  test('a member is refused; with nothing connected there is nothing to set', async () => {
    assert.deepEqual([(await save({ day: 800, hour: 60, person: 5 })).status, (await save({ day: 800, hour: 60, person: 5 })).body.code], [409, 'not_connected']);
    await connect();
    const r = await save({ day: 800, hour: 60, person: 5 }, member);
    assert.deepEqual([r.status, r.body.code], [403, 'forbidden']);
    assert.deepEqual(saved(), [null, null, null]);
  });
  test('the workspace is the session\'s: a workspace named in the request changes nothing, and another workspace\'s connection keeps its own numbers', async () => {
    await connect(); await connect(other, THEIRS);
    await save({ day: 50, hour: 5, person: 1, workspace_id: OTHER, email: 'theo@andere.de' });
    assert.deepEqual([saved(WS), saved(OTHER)], [[50, 5, 1], [null, null, null]]);
    assert.equal((await sending(other)).limits.day, 1500);
  });
  test('the emails of this workspace that wait for a limit are looked at again at once: with more room they go sooner', async () => {
    await connect(); await connect(other, THEIRS);
    db.runs = [waitingRun(1, WS, 'limit_day', 600), waitingRun(2, WS, 'limit_hour', 50), waitingRun(3, WS, 'paused', 90), waitingRun(4, OTHER, 'limit_day', 600)];
    const before = Date.now();
    await save({ day: 1900, hour: 300, person: 3 });
    const due = id => db.runs.find(r => r.id === id).due_at.getTime();
    assert.ok(due(1) <= Date.now() && due(1) >= before && due(2) <= Date.now(), 'due now');
    assert.ok(due(3) > Date.now() + 80 * 60000, 'who waits for a pause is not waiting for a limit');
    assert.ok(due(4) > Date.now() + 590 * 60000, 'another workspace\'s emails wait for its own limits');
  });
});

describe('lifting a pause', () => {
  const resume = (srv = owner) => srv.request('POST', '/api/journey/mail/resume', {});
  test('"Send again now": the pause of the address ends at once — in every workspace that sends with it — and the emails that waited for it are due', async () => {
    await connect(); await connect(other, THEIRS);
    db.rows.forEach(r => pausedRow(r, 120));
    db.runs = [waitingRun(1, WS, 'paused', 120), waitingRun(2, OTHER, 'paused', 120), waitingRun(3, WS, 'limit_day', 600)];
    assert.equal(typeof (await sending()).paused_until, 'string');
    const r = await resume();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.sending.paused_until, r.body.sending.pause_reason, r.body.sending.pause_detail], [null, null, null]);
    assert.deepEqual(r.body, await whole());
    assert.equal((await sending(other)).paused_until, null, 'the other workspace\'s too: it is one mailbox');
    assert.deepEqual(db.rows.map(x => [x.paused_until, x.pause_reason, x.pause_detail, x.pause_count]), [[null, null, null, 2], [null, null, null, 2]], 'how often Google said no stays known');
    const due = id => db.runs.find(x => x.id === id).due_at.getTime();
    assert.ok(due(1) <= Date.now() && due(2) <= Date.now(), 'due now');
    assert.ok(due(3) > Date.now() + 590 * 60000);
  });
  test('an admin may; a member may not; with nothing connected there is nothing to lift; nothing paused: nothing changes', async () => {
    assert.deepEqual([(await resume()).status, (await resume()).body.code], [409, 'not_connected']);
    await connect();
    fakeGoogle(happy());
    pausedRow(rowOf(WS), 120);
    const m = await resume(member);
    assert.deepEqual([m.status, m.body.code], [403, 'forbidden']);
    assert.ok(rowOf(WS).paused_until > new Date(), 'still paused');
    assert.equal((await resume(admin)).body.sending.paused_until, null);
    const again = await resume();
    assert.deepEqual([again.status, again.body.sending.paused_until], [200, null]);
    assert.equal(google.length, 0, 'Google is asked nothing by any of it');
  });
});

describe('the test email is an email like any other', () => {
  const test_ = (srv = owner) => srv.request('POST', '/api/journey/mail/test', {});
  test('it is counted: for the address, as a test, with no contact — and the page sees it', async () => {
    await connect();
    const before = Date.now();
    assert.equal((await test_()).status, 200);
    assert.equal(db.sends.length, 1);
    const [{ sent_at, ...row }] = db.sends;
    assert.deepEqual(row, { workspace_id: WS, from_email: 'news@firma.de', contact_id: null, kind: 'test' });
    assert.ok(sent_at.getTime() >= before && sent_at.getTime() <= Date.now());
    assert.deepEqual((await sending()).sent, { day: 1, hour: 1 });
  });
  test('while sending is paused it is refused — 409 "paused", with what Google said — and Google is asked nothing', async () => {
    await connect();
    pausedRow(rowOf(WS), 60);
    fakeGoogle(happy());
    const r = await test_();
    assert.deepEqual([r.status, r.body.code, r.body.detail], [409, 'paused', 'User-rate limit exceeded.']);
    assert.deepEqual([google.length, db.sends.length], [0, 0]);
    pausedRow(rowOf(WS), -1);
    assert.equal((await test_()).status, 200, 'a pause that is over keeps nothing back');
  });
  test('while the day is full it is refused — 409 "limit" — and Google is asked nothing; a full hour keeps a test email not back', async () => {
    await connect();
    rowOf(WS).limit_day = 3;
    db.sends = mailed(3, -120);
    fakeGoogle(happy());
    const r = await test_();
    assert.deepEqual([r.status, r.body.code, r.body.detail], [409, 'limit', undefined]);
    assert.deepEqual([google.length, db.sends.length], [0, 3]);
    Object.assign(rowOf(WS), { limit_day: 50, limit_hour: 2 });
    db.sends = mailed(2, -5);
    assert.equal((await test_()).status, 200);
    assert.equal(db.sends.length, 3, 'and it counts');
  });
  test('GOOGLE SAYS "LIMIT" to it: the address is paused until the time Google names, the owner and the admin are told, the answer is "paused" with Google\'s words — and the next one asks Google nothing', async () => {
    await connect(); await connect(other, THEIRS);
    const until = fromNow(20);
    fakeGoogle({ ...happy(), [SEND_URL]: limit429(until) });
    const r = await test_();
    assert.deepEqual([r.status, r.body.code, r.body.detail], [409, 'paused', `User-rate limit exceeded.  Retry after ${until.toISOString()} (Mail sending)`]);
    assert.deepEqual(db.rows.map(x => [x.workspace_id, x.paused_until.toISOString(), x.pause_reason, x.pause_count]), [[WS, until.toISOString(), 'google_limit', 1], [OTHER, until.toISOString(), 'google_limit', 1]], 'every workspace that sends with the address');
    assert.deepEqual(told.map(a => [a[0], a[1], a[2], a[3].type]), [[WS, null, 1, 'journey_mail_paused'], [WS, null, 2, 'journey_mail_paused'], [OTHER, null, 9, 'journey_mail_paused']], 'the owners and the admin — not the member');
    assert.match(told[0][3].title, /^Workflow emails paused: news@firma\.de$/);
    assert.equal(db.sends.length, 0, 'an email Google refused is not counted');
    assert.equal((await sending()).paused_until, until.toISOString());
    const again = await test_();
    assert.deepEqual([again.status, again.body.code], [409, 'paused']);
    assert.equal((await test_(other)).body.code, 'paused', 'nor from the other workspace');
    assert.equal(callsTo(SEND_URL).length, 1, 'Google was asked once');
    assert.equal(told.length, 3, 'and nobody is told twice');
  });
  test('403 with one of Google\'s rate reasons pauses as well — for an hour, as Google names no time; any other refusal pauses nothing', async () => {
    await connect();
    fakeGoogle({ ...happy(), [SEND_URL]: { status: 403, body: { error: { code: 403, message: 'User Rate Limit Exceeded', errors: [{ domain: 'usageLimits', reason: 'userRateLimitExceeded' }] } } } });
    const before = Date.now(), r = await test_();
    assert.deepEqual([r.status, r.body.code, r.body.detail], [409, 'paused', 'User Rate Limit Exceeded']);
    const span = rowOf(WS).paused_until.getTime() - before;
    assert.ok(span >= 3600000 && span < 3600000 + 5000, 'an hour');
    pausedRow(rowOf(WS), -1, { pause_count: 0 });
    told.length = 0;
    fakeGoogle({ ...happy(), [SEND_URL]: { status: 403, body: { error: { code: 403, message: 'The domain administrators have disabled Gmail apps.', errors: [{ domain: 'global', reason: 'domainPolicy' }] } } } });
    const no = await test_();
    assert.deepEqual([no.status, no.body.code, no.body.detail], [502, 'rejected', 'The domain administrators have disabled Gmail apps.']);
    assert.ok(rowOf(WS).paused_until < new Date(), 'no new pause');
    assert.equal(told.length, 0);
  });
  test('the first test email that goes out after a pause ends the doubling', async () => {
    await connect();
    pausedRow(rowOf(WS), -1, { pause_count: 3 });
    fakeGoogle(happy());
    assert.equal((await test_()).status, 200);
    assert.deepEqual([rowOf(WS).paused_until, rowOf(WS).pause_reason, rowOf(WS).pause_detail, rowOf(WS).pause_count], [null, null, null, 0]);
  });
  test('limits that cannot be asked: nothing is sent; a count that cannot be written: the email is out, and the answer says so', async () => {
    await connect();
    fakeGoogle(happy());
    db.broken = /^SELECT m\.email, m\.limit_day/;
    const no = await test_();
    assert.equal(no.status, 500);
    assert.equal(google.length, 0, 'Google is not asked unasked');
    db.broken = /^INSERT INTO journey_sends/;
    const [r, words] = await quiet(() => test_());
    assert.deepEqual([r.status, r.body], [200, { success: true, to: 'olga@firma.de' }]);
    assert.ok(words.some(w => /a sent test email could not be counted: the database is away/.test(w)));
  });
});

describe('the limits and the pause belong to the address that is connected', () => {
  test('the same address signed in again keeps its limits and its pause', async () => {
    await connect();
    Object.assign(pausedRow(rowOf(WS), 60), { limit_day: 800, limit_hour: 60, limit_person: 5 });
    fakeGoogle({ ...happy(), [TOKEN]: tokenUrl(signIn('NEWS@firma.de', { refresh_token: '1//second' })) });
    assert.equal((await callback(admin, ADMIN)).location, '/?journey_mail=connected');
    const s = await sending();
    assert.deepEqual([s.limits, s.pause_reason], [{ day: 800, hour: 60, person: 5 }, 'google_limit']);
    assert.ok(!limits.asked.includes('forget'));
  });
  test('another address starts with the defaults for its kind: the old one\'s limits and pause are not its own', async () => {
    await connect();
    Object.assign(pausedRow(rowOf(WS), 60), { limit_day: 1800, limit_hour: 600, limit_person: 5 });
    await connect(owner, OWNER, 'max@gmail.com');
    assert.deepEqual([rowOf(WS).email, rowOf(WS).limit_day, rowOf(WS).limit_hour, rowOf(WS).limit_person, rowOf(WS).paused_until, rowOf(WS).pause_count], ['max@gmail.com', null, null, null, null, 0]);
    const s = await sending();
    assert.deepEqual([s.kind, s.limits, s.paused_until], ['personal', { day: 400, hour: 40, person: 3 }, null]);
    assert.ok(db.log.findIndex(c => c.sql.startsWith('INSERT INTO workspace_mail') && c.params[1] === 'max@gmail.com') < db.log.findIndex(c => c.sql.startsWith('UPDATE workspace_mail SET limit_day = NULL')), 'once the new address is saved');
  });
});

describe('disconnecting', () => {
  test('an owner or admin removes the workspace\'s address, and its grant is ended at Google', async () => {
    await connect();
    fakeGoogle(happy());
    const r = await admin.request('DELETE', '/api/journey/mail');
    assert.deepEqual(r.body, { configured: true, can_manage: true, connection: null, sending: null });
    assert.equal(db.rows.length, 0);
    assert.deepEqual(callsTo(REVOKE).map(c => c.body), [{ token: '1//refresh-plain' }]);
  });
  test('the grant stays when another workspace still sends with the address; only this workspace\'s row goes', async () => {
    await connect(); await connect(other, THEIRS);
    fakeGoogle(happy());
    await owner.request('DELETE', '/api/journey/mail');
    assert.deepEqual(db.rows.map(r => r.workspace_id), [OTHER]);
    assert.equal(callsTo(REVOKE).length, 0);
  });
  test('a member is refused and nothing changes', async () => {
    await connect();
    fakeGoogle(happy());
    const r = await member.request('DELETE', '/api/journey/mail');
    assert.deepEqual([r.status, r.body.code], [403, 'forbidden']);
    assert.deepEqual([db.rows.length, google.length], [1, 0]);
  });
  test('nothing connected: nothing happens, and the answer says so', async () => {
    const r = await owner.request('DELETE', '/api/journey/mail');
    assert.deepEqual([r.status, r.body.connection], [200, null]);
    assert.equal(google.length, 0);
  });
  test('Google refusing or being away does not keep the address connected', async () => {
    for (const revoke of [{ status: 400, body: { error: 'invalid_token' } }, { throw: true }]) {
      await connect();
      fakeGoogle({ ...happy(), [REVOKE]: revoke });
      assert.equal((await owner.request('DELETE', '/api/journey/mail')).status, 200);
      assert.equal(db.rows.length, 0);
    }
  });
});

describe('wiring', () => {
  const route = read('routes/journey-mail.js'), code = route.replace(/\/\*[\s\S]*?\*\//, '');   // the code without its header
  test('server.js mounts it before the journey\'s own router; every request goes through the login check', () => {
    const server = read('server.js');
    assert.match(server, /^app\.use\('\/api\/journey\/mail',\s+require\('\.\/routes\/journey-mail'\)\);/m);
    assert.ok(server.indexOf("app.use('/api/journey/mail'") < server.indexOf("app.use('/api/journey',"));
    assert.match(code, /^router\.use\(requireAuth\);$/m);
  });
  test('the three things only an owner or admin may do are guarded; the token is never put into an answer', () => {
    assert.match(code, /router\.post\('\/test', requireManage,/);
    assert.match(code, /router\.delete\('\/', requireManage,/);
    assert.equal(code.split("if (!canManage(req.userRole)) return back(res, 'forbidden');").length - 1, 2, 'the two navigations say it with a word, not a JSON error');
    const answer = code.slice(code.indexOf('function answer('), code.indexOf('// An address this workspace has let go of'));
    assert.doesNotMatch(answer, /refresh_token_sealed|token/);
  });
  test('every statement that reads or writes a row names the session\'s workspace', () => {
    const statements = [...code.matchAll(/pool\.query\(\s*(?:`([^`]*)`|'([^']*)')/g)].map(m => (m[1] || m[2]).replace(/\s+/g, ' '));
    assert.equal(statements.length, 6);
    const across = statements.filter(s => !/workspace_id = \$\d|VALUES \(\$1/.test(s));
    assert.deepEqual(across, ['SELECT 1 FROM workspace_mail WHERE email = $1 LIMIT 1'], 'only the question "does any workspace still use this address", which reads nothing out');
    assert.doesNotMatch(code, /req\.(body|query|params)\.workspace/);
  });
  // Part 17
  test('saving limits and lifting a pause are an owner\'s or admin\'s; the route\'s refusals are the ones the page has sentences for', () => {
    assert.match(code, /router\.put\('\/limits', requireManage,/);
    assert.match(code, /router\.post\('\/resume', requireManage,/);
    const codes = [...route.slice(route.indexOf('const ERRORS = {'), route.indexOf('const refuse')).matchAll(/^\s+([a-z_]+):\s+\[(\d+),/gm)].map(m => `${m[1]} ${m[2]}`);
    assert.deepEqual(codes, ['forbidden 403', 'not_connected 409', 'no_address 409', 'gone 409', 'rejected 502', 'unreachable 502', 'limits 400', 'paused 409', 'limit 409']);
  });
  test('a test email asks the limits before Google, pauses the address on Google\'s "limit", and is counted once it is out; the route itself keeps no statement about limits', () => {
    const test_ = code.slice(code.indexOf("router.post('/test'"), code.indexOf("router.delete('/'"));
    assert.match(test_, /const now = new Date\(\), door = await sends\.gate\(pool, \{ workspaceId: req\.workspaceId, now, test: true \}\);\s+if \(!door\.state\) return refuse\(res, 'not_connected'\);\s+if \(!door\.ok\) return refuse\(res, door\.why === 'paused' \? 'paused' : 'limit', door\.state\.pause_detail\);/);
    assert.ok(test_.indexOf('sends.gate(') < test_.indexOf('mail.accessToken(') && test_.indexOf('mail.send(') < test_.indexOf('sends.sent('), 'asked first, counted last');
    assert.match(test_, /if \(err\.code === 'limited'\) \{[^}]*await sends\.pause\(pool, \{ from: row\.email, now, retryAt: err\.retryAt, detail: err\.message, tell: \{ notifyUser \} \}\);\s+return refuse\(res, 'paused', err\.message\);\s+\}/);
    assert.match(test_, /await sends\.sent\(pool, \{ workspaceId: req\.workspaceId, from: row\.email, kind: 'test', now, state: door\.state \}\)\s+\.catch\(/);
    assert.match(code, /if \(old && old\.email !== tokens\.email\) \{[^}]*await sends\.forget\(pool, req\.workspaceId\);[^}]*await dropGrant\(old\);\s+\}/);
    assert.match(code, /sending: row \? sends\.sendingOf\(await sends\.read\(pool, req\.workspaceId\)\) : null,/);
    assert.doesNotMatch(code, /journey_sends|limit_day|paused_until|pause_count/, 'every statement about limits is utils/journey-sends.js');
  });
  test('db.js keeps one address per workspace, which goes with the workspace; the token column says it is sealed', () => {
    const db = read('db.js');
    const table = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS workspace_mail ('), db.indexOf(')\n  `);', db.indexOf('CREATE TABLE IF NOT EXISTS workspace_mail (')));
    assert.match(table, /workspace_id\s+INTEGER PRIMARY KEY REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(table, /refresh_token_sealed TEXT NOT NULL/);
    assert.match(table, /connected_by\s+INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
    assert.doesNotMatch(table, /password/i);
  });
});
