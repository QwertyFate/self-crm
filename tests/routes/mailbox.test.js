// ROUTE tests for /api/mailbox (EMAIL_SYNC_CHANGES Part 1, 2026-10-22): a person connects their own
// Google mailbox. The real route over a fake pool and a fake Google (globalThis.fetch). Pinned: the
// consent URL asks for both Gmail scopes, offline, with a signed state; the callback is accepted only
// with a state signed for this very person and workspace, before anything is sent to Google; the
// refresh token is sealed before it is bound and never appears in an answer; a refusal (denied,
// scopes, no refresh token, Google down, address taken) writes nothing and revokes nothing; a
// disconnect deletes only the caller's row and revokes at Google only when no workspace still uses
// the address.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const ENV = { GOOGLE_MAIL_CLIENT_ID: 'cid-123.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret', APP_BASE_URL: 'https://crm.example.de', SESSION_SECRET: 'test-session-secret' };
const saved = {};
for (const k of [...Object.keys(ENV), 'BASE_URL', 'CALCOM_ENCRYPTION_KEY']) saved[k] = process.env[k];
Object.assign(process.env, ENV); delete process.env.BASE_URL; delete process.env.CALCOM_ENCRYPTION_KEY;

const gmail = require('../../utils/gmail');
const READ = 'https://www.googleapis.com/auth/gmail.readonly', SEND = 'https://www.googleapis.com/auth/gmail.send';
const ME = { id: 1, workspaceId: 7, role: 'member' };

// ── the fake database: email_accounts rows ──
const db = { rows: [], log: [] };
const pool = {
  query: async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    db.log.push({ sql: text, params });
    if (text.startsWith('SELECT provider, email_address, connected_at, last_error FROM email_accounts')) {
      return { rows: db.rows.filter(r => r.workspace_id === params[0] && r.user_id === params[1]).map(({ provider, email_address, connected_at, last_error }) => ({ provider, email_address, connected_at, last_error })) };
    }
    if (text.startsWith('SELECT 1 FROM email_accounts WHERE workspace_id=$1 AND LOWER(email_address)=$2 AND user_id<>$3')) {
      return { rows: db.rows.filter(r => r.workspace_id === params[0] && r.email_address.toLowerCase() === params[1] && r.user_id !== params[2]).map(() => ({ '?column?': 1 })) };
    }
    if (text.startsWith('INSERT INTO email_accounts')) {
      const row = { workspace_id: params[0], user_id: params[1], provider: 'google', email_address: params[2], refresh_token_sealed: params[3], scopes: params[4], connected_at: '2026-10-22T09:00:00.000Z', last_error: null };
      db.rows = db.rows.filter(r => !(r.workspace_id === row.workspace_id && r.user_id === row.user_id)).concat(row);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('DELETE FROM email_accounts WHERE workspace_id=$1 AND user_id=$2')) {
      const gone = db.rows.filter(r => r.workspace_id === params[0] && r.user_id === params[1]);
      db.rows = db.rows.filter(r => !gone.includes(r));
      return { rows: gone.map(r => ({ email_address: r.email_address, refresh_token_sealed: r.refresh_token_sealed })), rowCount: gone.length };
    }
    if (text.startsWith('SELECT 1 FROM email_accounts WHERE LOWER(email_address)=LOWER($1)')) {
      return { rows: db.rows.filter(r => r.email_address.toLowerCase() === String(params[0]).toLowerCase()).slice(0, 1).map(() => ({ '?column?': 1 })) };
    }
    throw new Error('unexpected SQL: ' + text);
  },
};

// ── the fake Google: `plan` maps a URL prefix to { status, body } or { throw: true } ──
const realFetch = globalThis.fetch;
let google = [];
function fakeGoogle(plan) {
  google = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    google.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: typeof init.body === 'string' ? Object.fromEntries(new URLSearchParams(init.body)) : undefined });
    const k = Object.keys(plan).find(p => u.startsWith(p));
    const r = k ? plan[k] : { status: 404, body: { error: 'not_found' } };
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const TOKEN = 'https://oauth2.googleapis.com/token', PROFILE = 'https://gmail.googleapis.com/gmail/v1/users/me/profile', REVOKE = 'https://oauth2.googleapis.com/revoke';
const tokenOk = (extra = {}) => ({ status: 200, body: { access_token: 'ya29.access', refresh_token: '1//refresh-plain', scope: `${READ} ${SEND}`, token_type: 'Bearer', expires_in: 3599, ...extra } });
const happy = () => ({ [TOKEN]: tokenOk(), [PROFILE]: { status: 200, body: { emailAddress: 'Mara@Example.de', historyId: '123' } }, [REVOKE]: { status: 200, body: {} } });

let server;
before(async () => { server = await serve({ '/api/mailbox': loadRoute('mailbox.js', { pool, user: ME }) }); });
after(async () => { await server.close(); globalThis.fetch = realFetch; for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
beforeEach(() => { db.rows = []; db.log = []; fakeGoogle(happy()); Object.assign(process.env, ENV); });

// A navigation: the redirect is read, not followed.
async function nav(path) {
  const r = await realFetch(server.base + path, { redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location') };
}
const cb = q => nav('/api/mailbox/google/callback?' + new URLSearchParams(q));
const goodState = () => gmail.signState({ userId: ME.id, workspaceId: ME.workspaceId });
const wrote = () => db.log.some(e => e.sql.startsWith('INSERT INTO email_accounts'));

describe('GET /api/mailbox', () => {
  test('not set up: configured false, no account', async () => {
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    const r = await server.request('GET', '/api/mailbox');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { configured: false, account: null });
  });
  test('the caller\'s own row, filtered on workspace and user, without the token', async () => {
    db.rows = [{ workspace_id: 7, user_id: 1, provider: 'google', email_address: 'mara@example.de', refresh_token_sealed: gmail.sealToken('1//refresh-plain'), scopes: READ, connected_at: '2026-10-22T09:00:00.000Z', last_error: null },
               { workspace_id: 7, user_id: 2, provider: 'google', email_address: 'olaf@example.de', refresh_token_sealed: 'x', scopes: READ, connected_at: null, last_error: null }];
    const r = await server.request('GET', '/api/mailbox');
    assert.deepEqual(r.body, { configured: true, account: { provider: 'google', email_address: 'mara@example.de', connected_at: '2026-10-22T09:00:00.000Z', last_error: null } });
    assert.deepEqual(db.log[0].params, [7, 1]);
    assert.doesNotMatch(JSON.stringify(r.body), /refresh|v1\./);
  });
});

describe('GET /api/mailbox/google/start', () => {
  test('302 to Google\'s consent screen: both scopes, offline, consent, the callback on the public origin, a state for this person', async () => {
    const r = await nav('/api/mailbox/google/start');
    assert.equal(r.status, 302);
    const u = new URL(r.location);
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    const q = Object.fromEntries(u.searchParams);
    assert.equal(q.client_id, ENV.GOOGLE_MAIL_CLIENT_ID);
    assert.equal(q.redirect_uri, 'https://crm.example.de/api/mailbox/google/callback');
    assert.equal(q.response_type, 'code');
    assert.deepEqual(q.scope.split(' '), [READ, SEND]);
    assert.equal(q.access_type, 'offline'); assert.equal(q.prompt, 'consent');
    assert.ok(gmail.checkState(q.state, { userId: 1, workspaceId: 7 }), 'signed for user 1 in workspace 7');
    assert.ok(!gmail.checkState(q.state, { userId: 2, workspaceId: 7 }), 'not for anyone else');
    assert.ok(!q.client_secret, 'the secret never goes to the browser');
    assert.equal(google.length, 0);
  });
  test('not set up: back to the app with not_configured', async () => {
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    assert.deepEqual(await nav('/api/mailbox/google/start'), { status: 302, location: '/?mailbox=not_configured' });
  });
});

describe('GET /api/mailbox/google/callback', () => {
  test('connected: the code is exchanged, the address read, the refresh token sealed and stored for this person', async () => {
    const r = await cb({ code: '4/abc', state: goodState(), scope: `${READ} ${SEND}` });
    assert.deepEqual(r, { status: 302, location: '/?mailbox=connected' });
    const [tok, prof] = google;
    assert.equal(tok.url, TOKEN); assert.equal(tok.method, 'POST');
    assert.deepEqual(tok.body, { code: '4/abc', client_id: ENV.GOOGLE_MAIL_CLIENT_ID, client_secret: 'g-secret', redirect_uri: 'https://crm.example.de/api/mailbox/google/callback', grant_type: 'authorization_code' });
    assert.equal(prof.url, PROFILE); assert.equal(prof.headers.Authorization, 'Bearer ya29.access');
    const ins = db.log.find(e => e.sql.startsWith('INSERT INTO email_accounts'));
    assert.match(ins.sql, /ON CONFLICT \(workspace_id, user_id\) DO UPDATE/);
    assert.deepEqual(ins.params.slice(0, 3), [7, 1, 'mara@example.de'], 'the address lower-cased');
    assert.notEqual(ins.params[3], '1//refresh-plain'); assert.doesNotMatch(ins.params[3], /refresh-plain/);
    assert.equal(gmail.openToken(ins.params[3]), '1//refresh-plain', 'sealed, and opens again');
    assert.equal(ins.params[4], `${READ} ${SEND}`);
    assert.ok(!google.some(g => g.url === REVOKE));
  });
  test('a state that is forged, for someone else, for another workspace, expired or missing: expired, and Google is never asked', async () => {
    const s = goodState();
    const forged = s.slice(0, -2) + (s.endsWith('A') ? 'BB' : 'AA');
    const other = gmail.signState({ userId: 2, workspaceId: 7 });
    const otherWs = gmail.signState({ userId: 1, workspaceId: 8 });
    const old = gmail.signState({ userId: 1, workspaceId: 7 }, Date.now() - 11 * 60 * 1000);
    for (const state of [forged, other, otherWs, old, '', 'a.b.c']) {
      assert.deepEqual(await cb({ code: '4/abc', state }), { status: 302, location: '/?mailbox=expired' }, state);
    }
    assert.deepEqual(await nav('/api/mailbox/google/callback?code=4/abc'), { status: 302, location: '/?mailbox=expired' });
    assert.equal(google.length, 0); assert.ok(!wrote());
  });
  test('Cancel on Google\'s screen (error=access_denied, no code): denied, nothing sent or written', async () => {
    assert.deepEqual(await cb({ error: 'access_denied', state: goodState() }), { status: 302, location: '/?mailbox=denied' });
    assert.equal(google.length, 0); assert.ok(!wrote());
  });
  test('a scope unticked: scopes, nothing written, nothing revoked', async () => {
    fakeGoogle({ ...happy(), [TOKEN]: tokenOk({ scope: READ }) });
    assert.deepEqual(await cb({ code: '4/abc', state: goodState() }), { status: 302, location: '/?mailbox=scopes' });
    assert.ok(!wrote()); assert.ok(!google.some(g => g.url === REVOKE || g.url === PROFILE));
  });
  test('no refresh token from Google: failed, nothing written', async () => {
    fakeGoogle({ ...happy(), [TOKEN]: tokenOk({ refresh_token: undefined }) });
    assert.deepEqual(await cb({ code: '4/abc', state: goodState() }), { status: 302, location: '/?mailbox=failed' });
    assert.ok(!wrote());
  });
  test('Google refuses the code, or cannot be reached: failed, nothing written', async () => {
    fakeGoogle({ ...happy(), [TOKEN]: { status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } } });
    assert.deepEqual(await cb({ code: '4/abc', state: goodState() }), { status: 302, location: '/?mailbox=failed' });
    fakeGoogle({ ...happy(), [PROFILE]: { throw: true } });
    assert.deepEqual(await cb({ code: '4/abc', state: goodState() }), { status: 302, location: '/?mailbox=failed' });
    assert.ok(!wrote());
  });
  test('an address a teammate already connected in this workspace: taken, nothing written, the teammate\'s grant untouched', async () => {
    db.rows = [{ workspace_id: 7, user_id: 2, provider: 'google', email_address: 'mara@example.de', refresh_token_sealed: 'x', scopes: READ, connected_at: null, last_error: null }];
    assert.deepEqual(await cb({ code: '4/abc', state: goodState() }), { status: 302, location: '/?mailbox=taken' });
    assert.ok(!wrote()); assert.ok(!google.some(g => g.url === REVOKE));
    assert.deepEqual(db.log.find(e => /user_id<>\$3/.test(e.sql)).params, [7, 'mara@example.de', 1]);
  });
  test('not set up: not_configured before anything else', async () => {
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    assert.deepEqual(await cb({ code: '4/abc', state: goodState() }), { status: 302, location: '/?mailbox=not_configured' });
    assert.equal(google.length, 0);
  });
});

describe('DELETE /api/mailbox', () => {
  const mine = () => ({ workspace_id: 7, user_id: 1, provider: 'google', email_address: 'mara@example.de', refresh_token_sealed: gmail.sealToken('1//refresh-plain'), scopes: READ, connected_at: null, last_error: null });
  test('deletes the caller\'s row only and revokes the grant at Google with the opened token', async () => {
    db.rows = [mine(), { ...mine(), user_id: 2, email_address: 'olaf@example.de' }];
    const r = await server.request('DELETE', '/api/mailbox');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { configured: true, account: null });
    assert.deepEqual(db.log[0].params, [7, 1]);
    assert.deepEqual(db.rows.map(x => x.user_id), [2], 'the teammate\'s mailbox stays');
    const rev = google.filter(g => g.url === REVOKE);
    assert.equal(rev.length, 1); assert.deepEqual(rev[0].body, { token: '1//refresh-plain' });
  });
  test('the same address still connected in another workspace: no revoke, that connection keeps working', async () => {
    db.rows = [mine(), { ...mine(), workspace_id: 9 }];
    assert.equal((await server.request('DELETE', '/api/mailbox')).status, 200);
    assert.equal(db.rows.length, 1);
    assert.ok(!google.some(g => g.url === REVOKE));
  });
  test('Google refuses the revoke or the token cannot be opened: still disconnected', async () => {
    db.rows = [mine()];
    fakeGoogle({ [REVOKE]: { status: 400, body: { error: 'invalid_token' } } });
    assert.equal((await server.request('DELETE', '/api/mailbox')).status, 200);
    db.rows = [{ ...mine(), refresh_token_sealed: 'v1.not.a.token' }];
    assert.equal((await server.request('DELETE', '/api/mailbox')).status, 200);
    assert.equal(db.rows.length, 0);
  });
  test('nothing connected: 200, nothing sent to Google', async () => {
    assert.equal((await server.request('DELETE', '/api/mailbox')).status, 200);
    assert.equal(google.length, 0);
  });
});

describe('utils/gmail.js state', () => {
  test('signed under SESSION_SECRET: another server secret does not accept it', () => {
    const s = goodState();
    assert.ok(gmail.checkState(s, { userId: 1, workspaceId: 7 }));
    process.env.SESSION_SECRET = 'another-secret';
    assert.ok(!gmail.checkState(s, { userId: 1, workspaceId: 7 }));
  });
  test('valid for ten minutes', () => {
    const now = Date.now(), s = gmail.signState({ userId: 1, workspaceId: 7 }, now);
    assert.ok(gmail.checkState(s, { userId: 1, workspaceId: 7 }, now + 9 * 60 * 1000));
    assert.ok(!gmail.checkState(s, { userId: 1, workspaceId: 7 }, now + 10 * 60 * 1000 + 1));
  });
});
