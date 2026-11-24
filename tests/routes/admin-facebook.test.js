// ROUTE tests for /api/admin/facebook (FACEBOOK_CHANGES Part 1, 2026-11-23): the platform's one Facebook connection,
// made in the admin console (routes/admin-facebook.js; Facebook's side is utils/facebook.js).
//
// Part 2: a Page of the connected account is given to a workspace and to one of its lead webhooks, and taken back.
// Part 3: giving a Page installs the app on it at Facebook first, taking it back (or disconnecting) takes the app off
// it again, and the console can see and register where Facebook is to tell this server of a new lead.
// Part 4: the list of Pages says, per Page, whether the app is really on it at Facebook right now, how many leads
// arrived and what became of the last one (facebook_leads).
//
// The real route runs on a throwaway server. The database is a stand-in that knows the statements the route asks —
// of platform_settings, and since Part 2 of facebook_pages, workspaces and workspace_webhook — and no others; Facebook is a stand-in too (global fetch is replaced for Facebook's
// addresses only — the requests to the test server itself go through). The console's session is one object per
// server, as a browser's session is one cookie: what "connect" keeps there is what the callback finds.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');
const { openKey } = require('../../utils/calcom');

const realFetch = globalThis.fetch, saved = {};
const ENV = ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_SCOPES', 'ADMIN_SECRET', 'APP_BASE_URL', 'BASE_URL'];
const state = { row: null, sql: [], asked: [], log: [], answers: {}, down: false, brokenDb: false, brokenSql: null, given: [], workspaces: [], hooks: [], leads: [] };
const WORKSPACES = () => [{ id: 7, name: 'Müller & Söhne' }, { id: 8, name: 'acme <b>' }, { id: 9, name: 'Leer' }];
const HOOKS = () => [{ id: 70, workspace_id: 7, name: 'Website', active: true }, { id: 71, workspace_id: 7, name: 'Facebook', active: false }, { id: 80, workspace_id: 8, name: 'Leads', active: true }];
const pool = { query: async (sql, p) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.sql.push({ sql: t, params: p });
  state.log.push('db ' + t.split(' ').slice(0, 3).join(' '));   // one line of what happened, database and Facebook in the order it happened
  if (state.brokenDb || (state.brokenSql && state.brokenSql.test(t))) throw new Error('the database is away');
  if (t === 'SELECT value FROM platform_settings WHERE key = $1') return { rows: state.row && p[0] === 'facebook' ? [{ value: state.row }] : [] };
  if (t === 'INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()') { assert.equal(p[0], 'facebook'); state.row = JSON.parse(p[1]); return { rows: [], rowCount: 1 }; }
  if (t === 'WITH taken AS (DELETE FROM facebook_pages) DELETE FROM platform_settings WHERE key = $1') { assert.equal(p[0], 'facebook'); state.row = null; state.given = []; return { rows: [], rowCount: 1 }; }
  // Part 2: the Pages given to workspaces, and what a Page can be given to
  if (t === 'SELECT p.page_id, p.page_name, p.workspace_id, w.name AS workspace_name, p.webhook_id, h.name AS webhook_name FROM facebook_pages p JOIN workspaces w ON w.id = p.workspace_id LEFT JOIN workspace_webhook h ON h.id = p.webhook_id ORDER BY lower(p.page_name), p.page_id') {
    return { rows: state.given.filter(g => state.workspaces.some(w => w.id === g.workspace_id)).map(g => ({ page_id: g.page_id, page_name: g.page_name, workspace_id: g.workspace_id, workspace_name: state.workspaces.find(w => w.id === g.workspace_id).name,
      webhook_id: g.webhook_id, webhook_name: (state.hooks.find(h => h.id === g.webhook_id) || {}).name ?? null })).sort((a, b) => a.page_name.toLowerCase().localeCompare(b.page_name.toLowerCase()) || a.page_id.localeCompare(b.page_id)) };
  }
  if (t === 'SELECT id, name FROM workspaces ORDER BY lower(name), id') return { rows: [...state.workspaces].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())) };
  if (t === 'SELECT id, workspace_id, name, active FROM workspace_webhook ORDER BY workspace_id, id') return { rows: state.hooks };
  if (t === 'SELECT h.id FROM workspace_webhook h JOIN workspaces w ON w.id = h.workspace_id WHERE h.id = $1 AND h.workspace_id = $2') return { rows: state.hooks.filter(h => h.id === p[0] && h.workspace_id === p[1] && state.workspaces.some(w => w.id === h.workspace_id)).map(h => ({ id: h.id })) };
  if (t === 'INSERT INTO facebook_pages (page_id, page_name, workspace_id, webhook_id, token) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (page_id) DO UPDATE SET page_name = $2, workspace_id = $3, webhook_id = $4, token = $5, updated_at = NOW()') {
    const row = { page_id: p[0], page_name: p[1], workspace_id: p[2], webhook_id: p[3], token: p[4] }, i = state.given.findIndex(g => g.page_id === p[0]);
    if (i < 0) state.given.push(row); else state.given[i] = row;
    return { rows: [], rowCount: 1 };
  }
  if (t === 'DELETE FROM facebook_pages WHERE page_id = $1 RETURNING token') { const gone = state.given.filter(g => g.page_id === p[0]); state.given = state.given.filter(g => g.page_id !== p[0]); return { rows: gone.map(g => ({ token: g.token })), rowCount: gone.length }; }
  if (t === 'SELECT page_id, token FROM facebook_pages') return { rows: state.given.map(g => ({ page_id: g.page_id, token: g.token })) };
  // Part 4: what became of each Page's leads — the counts per Page, and each Page's last lead (the newest; of two of the same moment the one with the greater id)
  if (t === "SELECT page_id, COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE status = 'done'))::int AS contacts, (COUNT(*) FILTER (WHERE status = 'failed'))::int AS waiting FROM facebook_leads GROUP BY page_id") {
    return { rows: [...new Set(state.leads.map(l => l.page_id))].map(id => { const of = state.leads.filter(l => l.page_id === id); return { page_id: id, total: of.length, contacts: of.filter(l => l.status === 'done').length, waiting: of.filter(l => l.status === 'failed').length }; }) };
  }
  if (t === 'SELECT DISTINCT ON (page_id) page_id, status, reason, detail, created_at FROM facebook_leads ORDER BY page_id, created_at DESC, leadgen_id DESC') {
    const newest = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.leadgen_id < b.leadgen_id ? 1 : -1);
    return { rows: state.noLast ? [] : [...new Set(state.leads.map(l => l.page_id))].sort().map(id => { const l = state.leads.filter(x => x.page_id === id).sort(newest)[0]; return { page_id: id, status: l.status, reason: l.reason, detail: l.detail, created_at: l.created_at }; }) };
  }
  throw new Error(`a statement nobody expected: ${t}`);
} };
// Facebook: answers by the path that is asked — for what is no GET by "<METHOD> <path>", and a Page's or the app's
// id may stand as "*" — everything else is the test server itself.
const fbAnswer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname !== 'graph.facebook.com') return realFetch(url, init);
  u.method = (init && init.method) || 'GET';
  state.asked.push(u);
  state.log.push(`fb ${u.method} ${u.pathname.replace(/^\/v\d+\.\d+/, '')}`);
  if (state.down) throw new Error('no route to host');
  const path = u.pathname.replace(/^\/v\d+\.\d+/, '') + (u.searchParams.get('grant_type') ? '#long' : ''), key = u.method === 'GET' ? path : `${u.method} ${path}`;
  const a = state.answers[key] ?? state.answers[key.replace(/\/\d+\//, '/*/')];
  return typeof a === 'function' ? a(u) : a || fbAnswer({ error: { message: `no answer set for ${key}`, code: 1 } }, 400);
};
const GOOD = () => ({ '/oauth/access_token': fbAnswer({ access_token: 'SHORT', expires_in: 3600 }), '/oauth/access_token#long': fbAnswer({ access_token: 'LONG-TOKEN', expires_in: 5184000 }),
  '/me': fbAnswer({ id: '77', name: 'Olga Owner' }), '/me/permissions': fbAnswer({ data: [{ permission: 'pages_show_list', status: 'granted' }, { permission: 'leads_retrieval', status: 'granted' }, { permission: 'ads_management', status: 'declined' }] }),
  '/me/accounts': fbAnswer({ data: [{ id: '100', name: 'Müller <b>Immobilien</b>', tasks: ['ADVERTISE', 'ANALYZE'], access_token: 'PAGE-TOKEN-100' }, { id: '200', name: 'Nur Lesen', tasks: ['ANALYZE'], access_token: 'PAGE-TOKEN-200' }] }),
  // Part 3: the app is installed on a Page and taken off it; where the app is registered for Pages
  'POST /*/subscribed_apps': fbAnswer({ success: true }), 'DELETE /*/subscribed_apps': fbAnswer({ success: true }),
  // Part 4: the apps Facebook has on a Page — this one among them, for its leads
  '/*/subscribed_apps': fbAnswer({ data: [{ id: '555', name: 'Another app', subscribed_fields: ['feed', 'leadgen'] }, { id: '1234567890', name: 'CRM', subscribed_fields: ['leadgen'] }] }),
  '/*/subscriptions': fbAnswer({ data: [] }), 'POST /*/subscriptions': fbAnswer({ success: true }) });

let admin, session, guest, guestSession;
function server(sess) {
  const withSession = (req, _res, next) => { req.session = sess; next(); };
  return serve({ '/': withSession, '/api/admin': loadRoute('admin-facebook.js', { pool }) });
}
// a request whose redirect is read, not followed — as the browser's address bar would show it
const go = async (srv, path) => { const res = await realFetch(srv.base + path, { redirect: 'manual' }); return { status: res.status, to: res.headers.get('location'), type: res.headers.get('content-type') || '' }; };
const connect = async (srv = admin) => new URL((await srv.request('POST', '/api/admin/facebook/connect', {})).body.url);

before(async () => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { META_APP_ID: '1234567890', META_APP_SECRET: 's3cret', ADMIN_SECRET: 'console-secret', APP_BASE_URL: 'https://crm.example.de/' });
  session = { isAdmin: true }; guestSession = {};
  admin = await server(session); guest = await server(guestSession);
});
after(async () => { await admin.close(); await guest.close(); globalThis.fetch = realFetch; for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => { Object.assign(state, { row: null, sql: [], asked: [], log: [], answers: GOOD(), down: false, brokenDb: false, brokenSql: null, noLast: false, given: [], workspaces: WORKSPACES(), hooks: HOOKS(), leads: [] }); delete session.facebookState; delete guestSession.facebookState; process.env.META_APP_ID = '1234567890'; process.env.META_APP_SECRET = 's3cret'; });

describe('who may', () => {
  test('only the platform console: no session and no secret is refused, and nothing is read or asked', async () => {
    for (const [m, path] of [['GET', '/api/admin/facebook'], ['POST', '/api/admin/facebook/connect'], ['GET', '/api/admin/facebook/pages'], ['DELETE', '/api/admin/facebook'],
      ['GET', '/api/admin/facebook/targets'], ['PUT', '/api/admin/facebook/pages/100'], ['DELETE', '/api/admin/facebook/pages/100'], ['GET', '/api/admin/facebook/receiver'], ['POST', '/api/admin/facebook/receiver']]) {
      const r = await guest.request(m, path, m === 'POST' || m === 'PUT' ? { workspace_id: 7, webhook_id: 70 } : undefined);
      assert.deepEqual([r.status, r.body.error], [401, 'Admin access required'], `${m} ${path}`);
    }
    assert.deepEqual([state.sql.length, state.asked.length], [0, 0]);
    assert.equal((await guest.request('GET', '/api/admin/facebook', undefined, { 'X-Admin-Secret': 'console-secret' })).status, 200, 'the secret in the request opens it, as for every console route');
    assert.equal((await guest.request('GET', '/api/admin/facebook', undefined, { 'X-Admin-Secret': 'wrong' })).status, 401);
  });
});

describe('the status', () => {
  test('not set up, set up and not connected, connected — never the token', async () => {
    process.env.META_APP_SECRET = '';
    assert.deepEqual((await admin.request('GET', '/api/admin/facebook')).body, { configured: false, redirect_uri: 'https://crm.example.de/api/admin/facebook/callback', version: 'v26.0',
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'leads_retrieval', 'ads_management'], connection: null });
    process.env.META_APP_SECRET = 's3cret';
    assert.deepEqual((await admin.request('GET', '/api/admin/facebook')).body.connection, null);
    assert.equal((await admin.request('GET', '/api/admin/facebook')).body.configured, true);
    state.row = { user_id: '77', name: 'Olga Owner', token: 'v1.sealed.token.x', expires_at: '2027-01-22T00:00:00.000Z', scopes: ['pages_show_list', 'leads_retrieval', 5], connected_at: '2026-11-23T10:00:00.000Z' };
    const r = await admin.request('GET', '/api/admin/facebook');
    assert.deepEqual(r.body.connection, { user_id: '77', name: 'Olga Owner', connected_at: '2026-11-23T10:00:00.000Z', expires_at: '2027-01-22T00:00:00.000Z', scopes: ['pages_show_list', 'leads_retrieval'],
      missing: ['pages_read_engagement', 'pages_manage_metadata', 'ads_management'] });
    assert.doesNotMatch(JSON.stringify(r.body), /sealed|token/i);
  });
  test('a row that holds no token is no connection; the address to register follows the server\'s public address', async () => {
    for (const row of [{}, { name: 'x' }, { token: '' }, { token: 5 }, 'x']) { state.row = row; assert.equal((await admin.request('GET', '/api/admin/facebook')).body.connection, null, JSON.stringify(row)); }
    delete process.env.APP_BASE_URL;
    const r = await admin.request('GET', '/api/admin/facebook');
    assert.match(r.body.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/api\/admin\/facebook\/callback$/, 'no public address named: the one the request came to');
    process.env.APP_BASE_URL = 'https://crm.example.de/';
  });
});

describe('the sign-in begins', () => {
  test('the console is sent to Facebook\'s dialog with a word that is kept in its session', async () => {
    const url = await connect();
    assert.equal(url.origin + url.pathname, 'https://www.facebook.com/v26.0/dialog/oauth');
    assert.deepEqual([url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'), url.searchParams.get('response_type')], ['1234567890', 'https://crm.example.de/api/admin/facebook/callback', 'code']);
    assert.equal(url.searchParams.get('state'), session.facebookState.value);
    assert.ok(session.facebookState.expires > Date.now() + 9 * 60000 && session.facebookState.expires <= Date.now() + 10 * 60000);
    assert.doesNotMatch(String(url), /s3cret/);
    const again = await connect();
    assert.notEqual(again.searchParams.get('state'), url.searchParams.get('state'), 'a new word each time');
    assert.equal(state.asked.length, 0, 'Facebook is not asked anything yet');
  });
  test('it needs the console\'s session to keep the word in: the secret in a request alone is told so', async () => {
    const bare = await serve({ '/api/admin': loadRoute('admin-facebook.js', { pool }) });   // no session at all, as for a script
    try {
      const r = await bare.request('POST', '/api/admin/facebook/connect', {}, { 'X-Admin-Secret': 'console-secret' });
      assert.deepEqual([r.status, r.body.code], [400, 'session']);
      assert.match(r.body.error, /log in to the console first/);
      assert.equal((await bare.request('GET', '/api/admin/facebook', undefined, { 'X-Admin-Secret': 'console-secret' })).status, 200, 'reading the status needs none');
    } finally { await bare.close(); }
  });
  test('refused while the server is not set up', async () => {
    process.env.META_APP_ID = '';
    const r = await admin.request('POST', '/api/admin/facebook/connect', {});
    assert.deepEqual([r.status, r.body.code], [503, 'not_configured']);
    assert.equal(session.facebookState, undefined);
  });
});

describe('Facebook sends the person back', () => {
  test('with a code and the word: the token is traded, sealed and kept with who it is and what was given — and the console says "connected"', async () => {
    const url = await connect();
    const r = await go(admin, `/api/admin/facebook/callback?code=C0DE&state=${url.searchParams.get('state')}`);
    assert.deepEqual([r.status, r.to], [302, '/adminconsole?facebook=connected']);
    assert.deepEqual(state.asked.map(u => u.pathname.replace('/v26.0', '') + (u.searchParams.get('grant_type') ? '#long' : '')), ['/oauth/access_token', '/oauth/access_token#long', '/me', '/me/permissions']);
    assert.deepEqual([state.asked[0].searchParams.get('code'), state.asked[0].searchParams.get('redirect_uri'), state.asked[0].searchParams.get('client_secret')], ['C0DE', 'https://crm.example.de/api/admin/facebook/callback', 's3cret']);
    assert.equal(state.asked[2].searchParams.get('access_token'), 'LONG-TOKEN', 'the long-lived token is the one that is used');
    assert.deepEqual([state.row.user_id, state.row.name, state.row.scopes], ['77', 'Olga Owner', ['pages_show_list', 'leads_retrieval']]);
    assert.match(state.row.token, /^v1\./); assert.doesNotMatch(JSON.stringify(state.row), /LONG-TOKEN|SHORT/, 'the token is sealed before it is kept');
    assert.equal(openKey(state.row.token), 'LONG-TOKEN', 'and can be opened with this server\'s secret');
    assert.ok(Math.abs(new Date(state.row.expires_at) - (Date.now() + 5184000000)) < 60000); assert.ok(Math.abs(new Date(state.row.connected_at) - Date.now()) < 60000);
    assert.equal(session.facebookState, undefined, 'the word counted once');
    assert.equal((await go(admin, `/api/admin/facebook/callback?code=C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=state', 'the same address a second time is no sign-in');
  });
  test('connecting again replaces what was kept', async () => {
    state.row = { user_id: '1', name: 'Before', token: 'v1.old', scopes: [], connected_at: '2026-01-01T00:00:00.000Z' };
    const url = await connect();
    await go(admin, `/api/admin/facebook/callback?code=C&state=${url.searchParams.get('state')}`);
    assert.deepEqual([state.row.user_id, state.row.name, openKey(state.row.token)], ['77', 'Olga Owner', 'LONG-TOKEN']);
  });
  test('without the word, with another one, or too late: nothing is asked of Facebook and nothing is kept', async () => {
    assert.equal((await go(admin, '/api/admin/facebook/callback?code=C0DE&state=guessed')).to, '/adminconsole?facebook=state', 'no sign-in was started');
    const url = await connect();
    assert.equal((await go(admin, '/api/admin/facebook/callback?code=C0DE&state=another')).to, '/adminconsole?facebook=state');
    assert.equal(session.facebookState, undefined, 'a wrong word uses the kept one up');
    const late = await connect();
    session.facebookState.expires = Date.now() - 1;
    assert.equal((await go(admin, `/api/admin/facebook/callback?code=C0DE&state=${late.searchParams.get('state')}`)).to, '/adminconsole?facebook=state');
    assert.equal((await go(admin, '/api/admin/facebook/callback?code=C0DE')).to, '/adminconsole?facebook=state');
    assert.deepEqual([state.asked.length, state.row, url.searchParams.get('state').length > 20], [0, null, true]);
  });
  test('only in the console\'s own session: without it the browser is sent to log in, and the secret in a header does not stand in', async () => {
    const url = await connect();
    guestSession.facebookState = { ...session.facebookState };
    const r = await go(guest, `/api/admin/facebook/callback?code=C0DE&state=${url.searchParams.get('state')}`);
    assert.deepEqual([r.status, r.to], [302, '/adminconsole?facebook=login']);
    const res = await realFetch(`${guest.base}/api/admin/facebook/callback?code=C0DE&state=${url.searchParams.get('state')}`, { redirect: 'manual', headers: { 'X-Admin-Secret': 'console-secret' } });
    assert.equal(res.headers.get('location'), '/adminconsole?facebook=login');
    assert.deepEqual([state.asked.length, state.row], [0, null]);
  });
  test('the person cancelled at Facebook, or no code came: said, nothing kept', async () => {
    let url = await connect();
    assert.equal((await go(admin, `/api/admin/facebook/callback?error=access_denied&error_reason=user_denied&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=denied');
    url = await connect();
    assert.equal((await go(admin, `/api/admin/facebook/callback?state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=failed');
    url = await connect();
    assert.equal((await go(admin, `/api/admin/facebook/callback?code=a&code=b&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=failed', 'a code twice is no code');
    url = await connect();
    assert.equal((await go(admin, `/api/admin/facebook/callback?error=access_denied&code=C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=denied', 'an error is an error, whatever stands beside it');
    assert.deepEqual([state.asked.length, state.row], [0, null]);
  });
  test('Facebook refuses the code, or does not answer: said, nothing kept — and the server\'s log holds no code and no token', async () => {
    const words = [], real = console.error; console.error = (...a) => words.push(a.join(' '));
    try {
      let url = await connect();
      state.answers['/oauth/access_token'] = fbAnswer({ error: { message: 'This authorization code has been used.', code: 100 } }, 400);
      assert.equal((await go(admin, `/api/admin/facebook/callback?code=S3CRET-C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=failed');
      url = await connect(); state.answers = GOOD(); state.down = true;
      assert.equal((await go(admin, `/api/admin/facebook/callback?code=S3CRET-C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=unreachable');
      url = await connect(); state.down = false; state.answers = GOOD(); state.answers['/me'] = fbAnswer({ error: { message: 'Error validating access token', code: 190 } }, 400);
      assert.equal((await go(admin, `/api/admin/facebook/callback?code=S3CRET-C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=failed');
      url = await connect(); state.answers = GOOD(); state.brokenDb = true;
      assert.equal((await go(admin, `/api/admin/facebook/callback?code=S3CRET-C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=failed', 'a token that cannot be kept is no connection');
    } finally { console.error = real; }
    assert.equal(state.row, null);
    assert.equal(words.length, 4);
    assert.match(words[0], /^facebook: connecting failed: rejected: This authorization code has been used\.$/);
    assert.doesNotMatch(words.join('\n'), /S3CRET-C0DE|LONG-TOKEN|SHORT|s3cret/);
  });
  test('the server was un-set-up between the two steps: "failed", Facebook is not asked, and the log stays quiet', async () => {
    const url = await connect();
    process.env.META_APP_SECRET = '';
    const words = [], real = console.error; console.error = (...a) => words.push(a.join(' '));
    try { assert.equal((await go(admin, `/api/admin/facebook/callback?code=C0DE&state=${url.searchParams.get('state')}`)).to, '/adminconsole?facebook=failed'); }
    finally { console.error = real; }
    assert.deepEqual([state.asked.length, state.row, words], [0, null, []]);
  });
  test('something nobody thought of still ends in the console: the browser is never left waiting', async () => {
    const url = await connect();
    Object.defineProperty(session, 'facebookState', { configurable: true, get() { throw new Error('a session that cannot be read'); } });
    const words = [], real = console.error; console.error = (...a) => words.push(a.join(' '));
    let r;
    try { r = await Promise.race([go(admin, `/api/admin/facebook/callback?code=C0DE&state=${url.searchParams.get('state')}`), new Promise(res => setTimeout(() => res({ to: 'NO ANSWER' }), 3000))]); }
    finally { console.error = real; delete session.facebookState; }
    assert.equal(r.to, '/adminconsole?facebook=failed');
    assert.deepEqual([state.asked.length, state.row, words.length], [0, null, 1]);
  });
  test('it never answers with JSON: it is a page the browser is sent to', async () => {
    const url = await connect();
    const r = await go(admin, `/api/admin/facebook/callback?code=C&state=${url.searchParams.get('state')}`);
    assert.equal(r.status, 302); assert.doesNotMatch(r.type, /json/);
  });
});

describe('the Pages', () => {
  const connected = () => { state.row = { user_id: '77', name: 'Olga Owner', token: require('../../utils/calcom').sealKey('LONG-TOKEN'), scopes: ['pages_show_list'], connected_at: '2026-11-23T10:00:00.000Z' }; };
  test('asked of Facebook with the kept token; told to the console without any token', async () => {
    connected();
    const r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { pages: [{ id: '100', name: 'Müller <b>Immobilien</b>', can_advertise: true, tasks: ['ADVERTISE', 'ANALYZE'], assigned: null, installed: null, installed_note: null, leads: null },
      { id: '200', name: 'Nur Lesen', can_advertise: false, tasks: ['ANALYZE'], assigned: null, installed: null, installed_note: null, leads: null }], lost: [] });
    assert.doesNotMatch(JSON.stringify(r.body), /PAGE-TOKEN|LONG-TOKEN/);
    assert.deepEqual([state.asked.length, state.asked[0].pathname, state.asked[0].searchParams.get('access_token')], [1, '/v26.0/me/accounts', 'LONG-TOKEN']);
  });
  test('not connected, not set up, the token no longer accepted, Facebook away, Facebook\'s own refusal', async () => {
    let r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([r.status, r.body.code], [409, 'not_connected']);
    assert.equal(state.asked.length, 0);
    connected(); process.env.META_APP_ID = '';
    r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([r.status, r.body.code], [503, 'not_configured']);
    process.env.META_APP_ID = '1234567890';
    state.answers['/me/accounts'] = fbAnswer({ error: { message: 'Error validating access token: The session has been invalidated because the user changed their password', code: 190 } }, 400);
    r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([r.status, r.body.code, r.body.error], [409, 'gone', 'Facebook no longer accepts the connection. Connect again.']);
    state.down = true;
    r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([r.status, r.body.code], [502, 'unreachable']);
    state.down = false; state.answers['/me/accounts'] = fbAnswer({ error: { message: '(#200) Requires pages_show_list permission', code: 200 } }, 403);
    r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([r.status, r.body.code, r.body.error], [502, 'rejected', 'Facebook refused the request. (#200) Requires pages_show_list permission']);
    assert.ok(state.row, 'none of this forgets the connection');
  });
  test('a kept token this server cannot open (another server\'s secret) is no connection: connect again', async () => {
    state.row = { user_id: '77', name: 'x', token: 'v1.AAAA.BBBB.CCCC', scopes: [] };
    const r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([r.status, r.body.code], [409, 'gone']);
    assert.equal(state.asked.length, 0);
  });
});

// Part 2: a Page is given to a workspace and to one of its lead webhooks.
describe('giving a Page to a workspace (Part 2)', () => {
  const { sealKey } = require('../../utils/calcom');
  const connected = () => { state.row = { user_id: '77', name: 'Olga Owner', token: sealKey('LONG-TOKEN'), scopes: ['pages_show_list'], connected_at: '2026-11-23T10:00:00.000Z' }; };
  const give = (pageId, body, srv = admin) => srv.request('PUT', `/api/admin/facebook/pages/${pageId}`, body);
  test('what a Page can be given to: every workspace with its lead webhooks — also one that has none', async () => {
    const r = await admin.request('GET', '/api/admin/facebook/targets');
    assert.deepEqual([r.status, r.body], [200, { workspaces: [{ id: 8, name: 'acme <b>', webhooks: [{ id: 80, name: 'Leads', active: true }] }, { id: 9, name: 'Leer', webhooks: [] },
      { id: 7, name: 'Müller & Söhne', webhooks: [{ id: 70, name: 'Website', active: true }, { id: 71, name: 'Facebook', active: false }] }] }]);
    assert.doesNotMatch(JSON.stringify(r.body), /webhook_key|field_map/, 'a lead webhook\'s address and mapping are not this list\'s to tell');
    assert.equal(state.asked.length, 0, 'Facebook is not asked');
  });
  test('given: the Page\'s name and its own token — sealed — are taken from Facebook\'s answer, never from the request', async () => {
    connected();
    const r = await give('100', { workspace_id: 7, webhook_id: 71, page_name: 'typed', token: 'typed-token' });
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    assert.equal(state.given.length, 1);
    const g = state.given[0];
    assert.deepEqual([g.page_id, g.page_name, g.workspace_id, g.webhook_id], ['100', 'Müller <b>Immobilien</b>', 7, 71]);
    assert.match(g.token, /^v1\./); assert.equal(openKey(g.token), 'PAGE-TOKEN-100'); assert.doesNotMatch(JSON.stringify(g), /PAGE-TOKEN|typed/);
    assert.doesNotMatch(JSON.stringify(r.body), /token/i);
    assert.deepEqual(state.asked.map(u => `${u.method} ${u.pathname}`), ['GET /v26.0/me/accounts', 'POST /v26.0/100/subscribed_apps'], 'asked of Facebook: the account\'s Pages, then to install the app on this one (Part 3)');
  });
  test('the list of Pages then says where each was given to; given again, a Page moves — it is never in two workspaces', async () => {
    connected();
    await give('100', { workspace_id: 7, webhook_id: 70 });
    let r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual(r.body.pages.map(p => [p.id, p.assigned]), [['100', { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: 70, webhook_name: 'Website' }], ['200', null]]);
    assert.deepEqual(r.body.lost, []);
    assert.doesNotMatch(JSON.stringify(r.body), /PAGE-TOKEN|v1\./);
    await give('100', { workspace_id: 8, webhook_id: 80 });
    r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual([state.given.length, r.body.pages[0].assigned.workspace_name, r.body.pages[0].assigned.webhook_name], [1, 'acme <b>', 'Leads']);
  });
  test('refused, and nothing written: no such workspace, a lead webhook of another workspace, no webhook, ids that are no ids', async () => {
    connected();
    const cases = [[{ workspace_id: 7, webhook_id: 80 }, 'another workspace\'s webhook'], [{ workspace_id: 99, webhook_id: 70 }, 'no such workspace'], [{ workspace_id: 9, webhook_id: 70 }, 'a workspace without that webhook'],
      [{ workspace_id: 7 }, 'no webhook'], [{ webhook_id: 70 }, 'no workspace'], [{}, 'nothing'], [undefined, 'no body'], [{ workspace_id: '7', webhook_id: '70' }, 'numbers as text'],
      [{ workspace_id: 7.5, webhook_id: 70 }, 'half a workspace'], [{ workspace_id: 0, webhook_id: 70 }, 'zero'], [{ workspace_id: -7, webhook_id: 70 }, 'negative'], [{ workspace_id: [7], webhook_id: 70 }, 'a list']];
    for (const [body, why] of cases) {
      const r = await give('100', body);
      assert.deepEqual([r.status, r.body.code], [400, 'target'], why);
    }
    assert.deepEqual([state.given, state.asked.length], [[], 0], 'Facebook is not even asked');
    // what is no id at all never reaches the database: a real one would stumble over half a number or one too large
    const noIds = [{ workspace_id: 7 }, { webhook_id: 70 }, {}, { workspace_id: '7', webhook_id: '70' }, { workspace_id: 7.5, webhook_id: 70 }, { workspace_id: 7, webhook_id: 70.5 }, { workspace_id: 0, webhook_id: 70 }, { workspace_id: 7, webhook_id: 0 },
      { workspace_id: -7, webhook_id: 70 }, { workspace_id: 7, webhook_id: -70 }, { workspace_id: 2147483647, webhook_id: 70 }, { workspace_id: 7, webhook_id: 2147483648 }, { workspace_id: [7], webhook_id: 70 }, { workspace_id: null, webhook_id: 70 }, { workspace_id: true, webhook_id: 70 }];
    for (const body of noIds) {
      state.sql = [];
      const r = await give('100', body);
      assert.deepEqual([r.status, r.body.code, state.sql.length], [400, 'target', 0], JSON.stringify(body));
    }
    state.sql = [];
    assert.equal((await give('100', { workspace_id: 2147483646, webhook_id: 70 })).body.code, 'target', 'the largest number a workspace can have is asked for, and is no workspace here');
    assert.equal(state.sql.length, 1);
  });
  test('refused: a Page that is not the account\'s, one it may not advertise on, an id that is no Page id', async () => {
    connected();
    let r = await give('999', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code], [404, 'page']);
    r = await give('200', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code, r.body.error], [409, 'no_advertise', 'The connected Facebook account may not advertise on this Page, so its leads cannot be read.']);
    state.answers['/me/accounts'] = fbAnswer({ data: [{ id: '100', name: 'Ohne Token', tasks: ['ADVERTISE'] }] });
    r = await give('100', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code], [409, 'no_advertise'], 'a Page Facebook hands out without a token cannot be read');
    for (const id of ['abc', '10 0', '1'.repeat(31), '100;DROP', '-1', '100abc', 'abc100', '1.5', ' 100']) {
      state.sql = []; state.asked = [];
      r = await give(encodeURIComponent(id), { workspace_id: 7, webhook_id: 70 });
      assert.deepEqual([r.status, r.body.code, state.sql.length, state.asked.length], [404, 'page', 0, 0], `${id}: refused before the database or Facebook is asked`);
    }
    state.sql = []; state.asked = [];
    assert.equal((await give('1'.repeat(30), { workspace_id: 7, webhook_id: 70 })).body.code, 'page', 'thirty digits are an id — just not one of this account\'s Pages');
    assert.equal(state.asked.length, 1);
    assert.deepEqual(state.given, []);
  });
  test('refused while nothing is connected, or Facebook does not answer — what was given before stays', async () => {
    let r = await give('100', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code], [409, 'not_connected']);
    connected(); await give('100', { workspace_id: 7, webhook_id: 70 });
    state.down = true;
    r = await give('100', { workspace_id: 8, webhook_id: 80 });
    assert.deepEqual([r.status, r.body.code, state.given[0].workspace_id], [502, 'unreachable', 7]);
    state.down = false; state.answers['/me/accounts'] = fbAnswer({ error: { message: 'Session expired', code: 190 } }, 400);
    r = await give('100', { workspace_id: 8, webhook_id: 80 });
    assert.deepEqual([r.status, r.body.code, state.given[0].workspace_id], [409, 'gone', 7]);
  });
  test('taken back: only that Page; a Page that was not given is no error; an id that is none is refused', async () => {
    connected();
    state.given = [{ page_id: '100', page_name: 'a', workspace_id: 7, webhook_id: 70, token: 'v1.p' }, { page_id: '300', page_name: 'b', workspace_id: 8, webhook_id: 80, token: 'v1.q' }];
    let r = await admin.request('DELETE', '/api/admin/facebook/pages/100');
    assert.deepEqual([r.status, r.body.success, state.given.map(g => g.page_id)], [200, true, ['300']]);
    r = await admin.request('DELETE', '/api/admin/facebook/pages/100');
    assert.deepEqual([r.status, r.body], [200, { success: true, unsubscribed: false }], 'a Page that was not given: nothing to take off at Facebook');
    state.sql = [];
    r = await admin.request('DELETE', '/api/admin/facebook/pages/abc');
    assert.deepEqual([r.status, r.body.code, state.given.length, state.sql.length], [404, 'page', 1, 0]);
    assert.equal(state.asked.length, 0, 'none of these asks anything of Facebook: a token that cannot be opened, a Page that was not given, an id that is none');
    assert.ok(state.row, 'and the connection stays');
  });
  test('a Page that was given but is no longer the account\'s is listed apart; one whose lead webhook was deleted says so', async () => {
    connected();
    state.given = [{ page_id: '300', page_name: 'Weg', workspace_id: 8, webhook_id: 80, token: 'v1.q' }, { page_id: '100', page_name: 'alt', workspace_id: 7, webhook_id: null, token: 'v1.p' }];
    const r = await admin.request('GET', '/api/admin/facebook/pages');
    assert.deepEqual(r.body.lost, [{ id: '300', name: 'Weg', assigned: { workspace_id: 8, workspace_name: 'acme <b>', webhook_id: 80, webhook_name: 'Leads' }, leads: null }]);
    assert.deepEqual(r.body.pages[0].assigned, { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: null, webhook_name: null });
    assert.deepEqual(r.body.pages[0].name, 'Müller <b>Immobilien</b>', 'the name is Facebook\'s of now, not the one kept when it was given');
  });
});

// Part 3: the app is installed on a Page when it is given and taken off it again; where Facebook tells this server
// of a new lead.
describe('receiving leads (Part 3)', () => {
  const { sealKey } = require('../../utils/calcom');
  const fb = require('../../utils/facebook');
  const connected = () => { state.row = { user_id: '77', name: 'Olga Owner', token: sealKey('LONG-TOKEN'), scopes: ['pages_show_list'], connected_at: '2026-11-23T10:00:00.000Z' }; };
  const give = (pageId, body) => admin.request('PUT', `/api/admin/facebook/pages/${pageId}`, body);
  const sub = method => state.asked.filter(u => u.method === method && /\/subscribed_apps$/.test(u.pathname));
  const HERE = 'https://crm.example.de/api/integrations/facebook/receive';
  const registeredAt = (more = {}) => fbAnswer({ data: [{ object: 'user', callback_url: 'https://other.example/u', fields: [{ name: 'leadgen' }], active: true }, { object: 'page', callback_url: HERE, fields: [{ name: 'feed', version: 'v26.0' }, { name: 'leadgen', version: 'v26.0' }], active: true, ...more }] });

  test('giving a Page installs the app on it first — with the Page\'s own token, for its leads — and only then is it written', async () => {
    connected();
    const r = await give('100', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    const [asked] = sub('POST');
    assert.deepEqual([sub('POST').length, asked.pathname, asked.searchParams.get('subscribed_fields'), asked.searchParams.get('access_token')], [1, '/v26.0/100/subscribed_apps', 'leadgen', 'PAGE-TOKEN-100']);
    assert.equal(asked.searchParams.get('appsecret_proof'), require('crypto').createHmac('sha256', 's3cret').update('PAGE-TOKEN-100').digest('hex'));
    const at = line => state.log.indexOf(line);
    assert.ok(at('fb GET /me/accounts') >= 0 && at('fb GET /me/accounts') < at('fb POST /100/subscribed_apps') && at('fb POST /100/subscribed_apps') < at('db INSERT INTO facebook_pages'), state.log.join(' | '));
    assert.equal(state.given.length, 1);
  });
  test('Facebook refuses to install the app: said with its words, and nothing is written — a Page that was given before stays where it was', async () => {
    connected();
    state.answers['POST /*/subscribed_apps'] = fbAnswer({ error: { message: '(#200) To subscribe to the leadgen field, one of these permissions is needed: leads_retrieval', code: 200 } }, 403);
    let r = await give('100', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code, r.body.error], [502, 'subscribe', 'Facebook did not install the app on this Page, so its leads would not arrive. (#200) To subscribe to the leadgen field, one of these permissions is needed: leads_retrieval']);
    assert.deepEqual([state.given, state.sql.filter(c => /INSERT INTO facebook_pages/.test(c.sql)).length], [[], 0]);
    assert.doesNotMatch(JSON.stringify(r.body), /PAGE-TOKEN|LONG-TOKEN|s3cret/);
    state.answers['POST /*/subscribed_apps'] = fbAnswer({ error: { message: 'Error validating access token', code: 190 } }, 400);
    r = await give('100', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code, state.given.length], [409, 'gone', 0]);
    state.answers['POST /*/subscribed_apps'] = () => { throw new Error('no route to host'); };
    r = await give('100', { workspace_id: 7, webhook_id: 70 });
    assert.deepEqual([r.status, r.body.code, state.given.length], [502, 'unreachable', 0]);
    state.answers = GOOD(); await give('100', { workspace_id: 7, webhook_id: 70 });
    state.answers['POST /*/subscribed_apps'] = fbAnswer({ error: { message: 'No.', code: 100 } }, 400);
    r = await give('100', { workspace_id: 8, webhook_id: 80 });
    assert.deepEqual([r.body.code, state.given.length, state.given[0].workspace_id, state.given[0].webhook_id], ['subscribe', 1, 7, 70]);
  });
  test('what goes wrong on this server while installing is this server\'s error, not a refusal of Facebook\'s — and nothing is written', async () => {
    connected();
    const real = fb.subscribePage;
    fb.subscribePage = async () => { throw new TypeError('something nobody thought of'); };
    try {
      const r = await give('100', { workspace_id: 7, webhook_id: 70 });
      assert.deepEqual([r.status, r.body.code, state.given.length], [500, undefined, 0]);
      assert.equal(r.body.detail, 'something nobody thought of', 'the error that is passed on is the one that happened');
    } finally { fb.subscribePage = real; }
  });
  test('a Page that cannot be given is not installed on either: Facebook is asked for nothing more than the list', async () => {
    connected();
    for (const [id, body] of [['200', { workspace_id: 7, webhook_id: 70 }], ['999', { workspace_id: 7, webhook_id: 70 }], ['100', { workspace_id: 7, webhook_id: 80 }], ['abc', { workspace_id: 7, webhook_id: 70 }]]) await give(id, body);
    assert.deepEqual([sub('POST').length, state.given.length], [0, 0]);
  });
  test('taken back: the row goes first, then the app is taken off the Page with the Page\'s own token as it was kept', async () => {
    connected();
    state.given = [{ page_id: '100', page_name: 'a', workspace_id: 7, webhook_id: 70, token: sealKey('KEPT-PAGE-TOKEN') }, { page_id: '300', page_name: 'b', workspace_id: 8, webhook_id: 80, token: sealKey('OTHER') }];
    const r = await admin.request('DELETE', '/api/admin/facebook/pages/100');
    assert.deepEqual([r.status, r.body, state.given.map(g => g.page_id)], [200, { success: true, unsubscribed: true }, ['300']]);
    assert.deepEqual(state.asked.map(u => [u.method, u.pathname, u.searchParams.get('access_token')]), [['DELETE', '/v26.0/100/subscribed_apps', 'KEPT-PAGE-TOKEN']], 'asked once, of that Page only, with no list of Pages read first');
    assert.deepEqual(state.log, ['db DELETE FROM facebook_pages', 'fb DELETE /100/subscribed_apps']);
    assert.doesNotMatch(JSON.stringify(r.body), /TOKEN|v1\./);
  });
  test('taken back all the same when Facebook refuses, is away, the token cannot be opened, or the server is no longer set up — only not confirmed', async () => {
    const one = () => { state.given = [{ page_id: '100', page_name: 'a', workspace_id: 7, webhook_id: 70, token: sealKey('KEPT-PAGE-TOKEN') }]; state.asked = []; };
    const back = async why => { const r = await admin.request('DELETE', '/api/admin/facebook/pages/100'); assert.deepEqual([r.status, r.body, state.given], [200, { success: true, unsubscribed: false }, []], why); };
    one(); state.answers['DELETE /*/subscribed_apps'] = fbAnswer({ error: { message: '(#200) No.', code: 200 } }, 403); await back('refused'); assert.equal(state.asked.length, 1);
    one(); state.answers['DELETE /*/subscribed_apps'] = fbAnswer({ error: { message: 'Session expired', code: 190 } }, 400); await back('the token no longer accepted'); assert.equal(state.asked.length, 1);
    one(); state.down = true; await back('Facebook away'); state.down = false;
    one(); state.given[0].token = 'v1.AAAA.BBBB.CCCC'; await back('a token of another server\'s secret'); assert.equal(state.asked.length, 0);
    one(); state.given[0].token = null; await back('no token at all'); assert.equal(state.asked.length, 0);
    one(); process.env.META_APP_SECRET = ''; await back('not set up'); assert.equal(state.asked.length, 0, 'without the app nothing can be asked');
  });
  test('disconnecting takes the app off every Page that was given — each with its own token — after the one statement that forgets it all', async () => {
    connected();
    state.given = [{ page_id: '100', page_name: 'a', workspace_id: 7, webhook_id: 70, token: sealKey('TOKEN-A') }, { page_id: '300', page_name: 'b', workspace_id: 8, webhook_id: 80, token: sealKey('TOKEN-B') }, { page_id: '400', page_name: 'c', workspace_id: 8, webhook_id: null, token: 'v1.cannot.be.opened' },
      { page_id: '12/../me', page_name: 'd', workspace_id: 8, webhook_id: null, token: sealKey('TOKEN-D') }];   // an id that is no Page id never becomes part of an address
    const r = await admin.request('DELETE', '/api/admin/facebook');
    assert.deepEqual([r.status, r.body, state.row, state.given], [200, { success: true }, null, []]);
    assert.deepEqual(state.asked.map(u => [u.method, u.pathname, u.searchParams.get('access_token')]).sort(), [['DELETE', '/v26.0/100/subscribed_apps', 'TOKEN-A'], ['DELETE', '/v26.0/300/subscribed_apps', 'TOKEN-B']]);
    assert.deepEqual(state.log.slice(0, 2), ['db SELECT page_id, token', 'db WITH taken AS'], 'read first, then forgotten in one statement; Facebook is asked only afterwards');
    assert.equal(state.sql.filter(c => /DELETE/.test(c.sql)).length, 1);
  });
  test('disconnecting does not depend on Facebook: refused or away, the connection and every Page are gone all the same', async () => {
    for (const fail of [() => { state.answers['DELETE /*/subscribed_apps'] = fbAnswer({ error: { message: 'No.', code: 100 } }, 400); }, () => { state.down = true; }, () => { state.answers['DELETE /*/subscribed_apps'] = u => (u.pathname.includes('/100/') ? fbAnswer({ error: { message: 'No.', code: 100 } }, 400) : fbAnswer({ success: true })); }]) {
      connected(); state.down = false; state.answers = GOOD(); state.asked = [];
      state.given = [{ page_id: '100', page_name: 'a', workspace_id: 7, webhook_id: 70, token: sealKey('TOKEN-A') }, { page_id: '300', page_name: 'b', workspace_id: 8, webhook_id: 80, token: sealKey('TOKEN-B') }];
      fail();
      const r = await admin.request('DELETE', '/api/admin/facebook');
      assert.deepEqual([r.status, r.body, state.row, state.given, state.asked.length], [200, { success: true }, null, [], 2]);
    }
    state.down = false;
  });

  test('the receiver: this server\'s address and the word Facebook has to name — and "registered" only for exactly this address, active, with leadgen', async () => {
    state.answers['/*/subscriptions'] = registeredAt();
    const r = await admin.request('GET', '/api/admin/facebook/receiver');
    assert.deepEqual([r.status, r.body], [200, { callback_url: HERE, verify_token: fb.verifyToken(), registered: true, elsewhere: null, error: null }]);
    assert.match(r.body.verify_token, /^[0-9a-f]{40}$/);
    assert.deepEqual(state.asked.map(u => [u.method, u.pathname, u.searchParams.get('access_token')]), [['GET', '/v26.0/1234567890/subscriptions', '1234567890|s3cret']], 'asked with the app\'s own token');
    assert.deepEqual([state.sql.length, state.row], [0, null], 'no account has to be connected, and nothing is read here');
    assert.doesNotMatch(JSON.stringify(r.body), /s3cret|1234567890\|/, 'the app\'s token and secret stay on the server: the word shown is neither');
  });
  test('the receiver: not registered, registered elsewhere, switched off, without leadgen', async () => {
    const ask = async () => (await admin.request('GET', '/api/admin/facebook/receiver')).body;
    assert.deepEqual([(await ask()).registered, (await ask()).elsewhere, (await ask()).error], [false, null, null], 'the app is registered for nothing');
    state.answers['/*/subscriptions'] = fbAnswer({ data: [{ object: 'user', callback_url: HERE, fields: [{ name: 'leadgen' }], active: true }] });
    assert.deepEqual([(await ask()).registered, (await ask()).elsewhere], [false, null], 'registered for people, not for Pages');
    state.answers['/*/subscriptions'] = registeredAt({ callback_url: 'https://old.example.de/api/integrations/facebook/receive' });
    assert.deepEqual([(await ask()).registered, (await ask()).elsewhere], [false, 'https://old.example.de/api/integrations/facebook/receive']);
    for (const near of [HERE + '/', HERE.replace('https:', 'http:'), HERE + '?x=1', HERE.toUpperCase()]) {
      state.answers['/*/subscriptions'] = registeredAt({ callback_url: near });
      assert.deepEqual([(await ask()).registered, (await ask()).elsewhere], [false, near], near);
    }
    state.answers['/*/subscriptions'] = registeredAt({ active: false });
    assert.deepEqual([(await ask()).registered, (await ask()).elsewhere], [false, null], 'switched off at Facebook');
    state.answers['/*/subscriptions'] = registeredAt({ callback_url: '' });
    assert.deepEqual([(await ask()).registered, (await ask()).elsewhere], [false, null], 'registered for Pages without an address: not here, and nowhere else to name');
    state.answers['/*/subscriptions'] = registeredAt({ fields: [{ name: 'feed' }] });
    assert.deepEqual([(await ask()).registered, (await ask()).elsewhere], [false, null], 'registered here, but not for leads');
    state.answers['/*/subscriptions'] = registeredAt({ fields: ['leadgen'] });
    assert.equal((await ask()).registered, true, 'the fields as bare names');
  });
  test('the receiver: Facebook cannot be asked — the address and the word are told all the same, with why the rest is not known', async () => {
    state.down = true;
    let r = await admin.request('GET', '/api/admin/facebook/receiver');
    assert.deepEqual([r.status, r.body], [200, { callback_url: HERE, verify_token: fb.verifyToken(), registered: null, elsewhere: null, error: 'Facebook could not be reached.' }]);
    state.down = false; state.answers['/*/subscriptions'] = fbAnswer({ error: { message: 'Error validating application. Invalid application secret', code: 101 } }, 400);
    r = await admin.request('GET', '/api/admin/facebook/receiver');
    assert.deepEqual([r.status, r.body.registered, r.body.error], [200, null, 'Error validating application. Invalid application secret']);
    state.answers['/*/subscriptions'] = fbAnswer({ error: { message: 'Invalid OAuth access token.', code: 190 } }, 400);
    r = await admin.request('GET', '/api/admin/facebook/receiver');
    assert.deepEqual([r.status, r.body.registered, r.body.error], [200, null, 'Invalid OAuth access token.']);
    process.env.META_APP_ID = ''; state.asked = [];
    r = await admin.request('GET', '/api/admin/facebook/receiver');
    assert.deepEqual([r.status, r.body.code, state.asked.length], [503, 'not_configured', 0]);
  });
  test('the receiver follows the server\'s public address', async () => {
    delete process.env.APP_BASE_URL;
    try { assert.match((await admin.request('GET', '/api/admin/facebook/receiver')).body.callback_url, /^http:\/\/127\.0\.0\.1:\d+\/api\/integrations\/facebook\/receive$/); }
    finally { process.env.APP_BASE_URL = 'https://crm.example.de/'; }
  });
  test('registering: the app is told this address for the leads of Pages, with the word Facebook has to name', async () => {
    const r = await admin.request('POST', '/api/admin/facebook/receiver', {});
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    assert.equal(state.asked.length, 1);
    const u = state.asked[0];
    assert.deepEqual([u.method, u.pathname], ['POST', '/v26.0/1234567890/subscriptions']);
    assert.deepEqual([u.searchParams.get('object'), u.searchParams.get('callback_url'), u.searchParams.get('fields'), u.searchParams.get('verify_token'), u.searchParams.get('access_token')], ['page', HERE, 'leadgen', fb.verifyToken(), '1234567890|s3cret']);
    assert.deepEqual([state.sql.length, state.row], [0, null], 'nothing is kept here: whether it is registered is asked of Facebook each time');
  });
  test('registering refused — with Facebook\'s words — Facebook away, the server not set up', async () => {
    state.answers['POST /*/subscriptions'] = fbAnswer({ error: { message: '(#2200) Callback verification failed with the following errors: HTTP Status Code = 404', code: 2200 } }, 400);
    let r = await admin.request('POST', '/api/admin/facebook/receiver', {});
    assert.deepEqual([r.status, r.body.code, r.body.error], [502, 'receiver', 'Facebook did not accept the receiving address. (#2200) Callback verification failed with the following errors: HTTP Status Code = 404']);
    assert.doesNotMatch(JSON.stringify(r.body), /s3cret|1234567890\|/);
    state.answers['POST /*/subscriptions'] = fbAnswer({ error: { message: 'Invalid OAuth access token.', code: 190 } }, 400);
    r = await admin.request('POST', '/api/admin/facebook/receiver', {});
    assert.deepEqual([r.status, r.body.code, r.body.error], [502, 'receiver', 'Facebook did not accept the receiving address. Invalid OAuth access token.'], 'no account is in play here: "connect again" would be the wrong advice');
    state.down = true;
    r = await admin.request('POST', '/api/admin/facebook/receiver', {});
    assert.deepEqual([r.status, r.body.code], [502, 'unreachable']);
    state.down = false; process.env.META_APP_SECRET = ''; state.asked = [];
    r = await admin.request('POST', '/api/admin/facebook/receiver', {});
    assert.deepEqual([r.status, r.body.code, state.asked.length], [503, 'not_configured', 0]);
  });
  test('what goes wrong on this server while asking about the receiver is this server\'s error', async () => {
    const real = [fb.receiver, fb.registerReceiver];
    fb.receiver = async () => { throw new TypeError('x'); }; fb.registerReceiver = async () => { throw new TypeError('y'); };
    try {
      assert.equal((await admin.request('GET', '/api/admin/facebook/receiver')).status, 500);
      assert.equal((await admin.request('POST', '/api/admin/facebook/receiver', {})).status, 500);
    } finally { [fb.receiver, fb.registerReceiver] = real; }
  });
});

describe('disconnecting', () => {
  test('the connection is forgotten here — and every Page is taken back with it; afterwards the status says "not connected"', async () => {
    state.row = { user_id: '77', name: 'Olga Owner', token: 'v1.x', scopes: [] };
    state.given = [{ page_id: '100', page_name: 'a', workspace_id: 7, webhook_id: 70, token: 'v1.p' }, { page_id: '300', page_name: 'b', workspace_id: 8, webhook_id: 80, token: 'v1.q' }];
    const r = await admin.request('DELETE', '/api/admin/facebook');
    assert.deepEqual([r.status, r.body, state.row, state.given], [200, { success: true }, null, []]);
    assert.equal(state.sql.filter(c => /DELETE/.test(c.sql)).length, 1, 'in one statement: no Page stays given under a connection that is gone');
    assert.equal((await admin.request('GET', '/api/admin/facebook')).body.connection, null);
    assert.equal((await admin.request('DELETE', '/api/admin/facebook')).status, 200, 'nothing to forget is no error');
    assert.equal(state.asked.length, 0);
  });
});

// Part 4: per Page — is the app really on it at Facebook, how many leads arrived, what became of the last one.
describe('Part 4: is a given Page really receiving?', () => {
  const { sealKey } = require('../../utils/calcom');
  const crypto = require('crypto');
  const connected = () => { state.row = { user_id: '77', name: 'Olga Owner', token: sealKey('LONG-TOKEN'), scopes: ['pages_show_list'], connected_at: '2026-11-23T10:00:00.000Z' }; };
  // a Page as it was given: the token that is KEPT is not the one Facebook hands out with the list today
  const kept = (page_id, over = {}) => ({ page_id, page_name: 'P' + page_id, workspace_id: 7, webhook_id: 70, token: sealKey(`KEPT-TOKEN-${page_id}`), ...over });
  const pages = () => admin.request('GET', '/api/admin/facebook/pages');
  const apps = (...list) => fbAnswer({ data: list });
  const subs = () => state.asked.filter(u => /\/subscribed_apps$/.test(u.pathname));
  const MINE = { id: '1234567890', name: 'CRM', subscribed_fields: ['leadgen'] };
  const page = (r, id) => r.body.pages.find(p => p.id === id);

  test('the app is on the Page for its leads: installed — asked with the Page\'s own KEPT token, signed, after the account\'s Pages', async () => {
    connected(); state.given = [kept('100')];
    const r = await pages();
    assert.equal(r.status, 200);
    assert.deepEqual([page(r, '100').installed, page(r, '100').installed_note], [true, null]);
    assert.deepEqual(state.asked.map(u => `${u.method} ${u.pathname}`), ['GET /v26.0/me/accounts', 'GET /v26.0/100/subscribed_apps']);
    assert.deepEqual(Object.fromEntries(subs()[0].searchParams), { access_token: 'KEPT-TOKEN-100', appsecret_proof: crypto.createHmac('sha256', 's3cret').update('KEPT-TOKEN-100').digest('hex') },
      'the token its leads are fetched with — not the account\'s, and not the one Facebook lists today');
    assert.doesNotMatch(JSON.stringify(r.body), /KEPT-TOKEN|PAGE-TOKEN|LONG-TOKEN|v1\./, 'no token in the answer');
    for (const list of [[MINE], [{ ...MINE, id: 1234567890 }], [{ id: '555', subscribed_fields: ['leadgen'] }, null, 'x', { ...MINE, subscribed_fields: ['feed', 'leadgen'] }]]) {
      state.answers['/*/subscribed_apps'] = apps(...list);
      assert.equal(page(await pages(), '100').installed, true, JSON.stringify(list));
    }
  });
  test('not installed: no app on the Page, only another app, this app but not for leads', async () => {
    connected(); state.given = [kept('100')];
    for (const answer of [apps(), apps({ id: '555', name: 'Another app', subscribed_fields: ['leadgen'] }), apps({ ...MINE, subscribed_fields: ['feed'] }), apps({ id: '1234567890', name: 'CRM' }), apps({ ...MINE, subscribed_fields: 'leadgen' }),
      apps({ ...MINE, id: '12345678901' }), fbAnswer({}), fbAnswer({ data: 'x' })]) {
      state.answers['/*/subscribed_apps'] = answer;
      const p = page(await pages(), '100');
      assert.deepEqual([p.installed, p.installed_note], [false, null], JSON.stringify(await answer.json()));
    }
  });
  test('could not be checked — each with why, and the list of Pages stands all the same', async () => {
    connected(); state.given = [kept('100')];
    const cases = [
      [fbAnswer({ error: { message: 'Error validating access token: Session has expired', code: 190 } }, 400), 'Facebook no longer accepts the Page\'s token. Save the Page again.'],
      [() => { throw new Error('no route to host'); }, 'Facebook could not be reached.'],
      [fbAnswer({ error: { message: '(#200) Requires <b>pages_manage_metadata</b> permission', code: 200 } }, 403), '(#200) Requires <b>pages_manage_metadata</b> permission'],
      [fbAnswer({ error: { message: 'An unknown error occurred', code: 1 } }, 500), 'An unknown error occurred'],
    ];
    for (const [answer, note] of cases) {
      state.answers['/*/subscribed_apps'] = answer;
      const r = await pages();
      assert.deepEqual([r.status, page(r, '100').installed, page(r, '100').installed_note], [200, null, note], note);
      assert.deepEqual(r.body.pages.map(p => p.id), ['100', '200'], 'the rest of the list is told');
      assert.deepEqual(page(r, '100').assigned, { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: 70, webhook_name: 'Website' });
    }
  });
  test('a kept token this server cannot open: said, and Facebook is never asked with it', async () => {
    connected();
    for (const token of ['v1.AAAA.BBBB.CCCC', 'not sealed at all', '']) {
      state.given = [kept('100', { token })]; state.asked = [];
      const r = await pages();
      assert.deepEqual([r.status, page(r, '100').installed, page(r, '100').installed_note], [200, null, 'The Page\'s token cannot be opened on this server. Save the Page again.'], token);
      assert.equal(subs().length, 0);
      if (token) assert.doesNotMatch(JSON.stringify(r.body), new RegExp(token.replace(/\./g, '\\.')));
    }
  });
  test('only given Pages that are still the account\'s are asked — each with its own token, each with its own answer', async () => {
    connected();
    state.given = [kept('100'), kept('200', { workspace_id: 8, webhook_id: 80 }), kept('300')];   // 300 is no longer one of the account's Pages
    state.answers['/100/subscribed_apps'] = apps(MINE); state.answers['/200/subscribed_apps'] = apps();
    state.answers['/300/subscribed_apps'] = () => { throw new Error('a lost Page is not asked'); };
    const r = await pages();
    assert.deepEqual(subs().map(u => [u.pathname, u.searchParams.get('access_token')]).sort(), [['/v26.0/100/subscribed_apps', 'KEPT-TOKEN-100'], ['/v26.0/200/subscribed_apps', 'KEPT-TOKEN-200']]);
    assert.deepEqual(r.body.pages.map(p => [p.id, p.installed, p.installed_note]), [['100', true, null], ['200', false, null]]);
    assert.deepEqual(r.body.lost.map(l => [l.id, Object.keys(l)]), [['300', ['id', 'name', 'assigned', 'leads']]], 'a lost Page carries its leads and nothing about the app');
  });
  test('a Page that is given to nobody is not asked: nothing is known, and nothing is said', async () => {
    connected(); state.given = [kept('100')];
    const r = await pages();
    assert.deepEqual([page(r, '200').assigned, page(r, '200').installed, page(r, '200').installed_note], [null, null, null]);
    assert.deepEqual(subs().map(u => u.pathname), ['/v26.0/100/subscribed_apps']);
    state.given = []; state.asked = [];
    assert.deepEqual((await pages()).body.pages.map(p => [p.installed, p.installed_note]), [[null, null], [null, null]]);
    assert.equal(subs().length, 0);
  });
  test('all the Pages are asked at the same time, not one after the other', async () => {
    connected(); state.given = [kept('100'), kept('200')];
    const waiting = [];
    state.answers['/*/subscribed_apps'] = () => new Promise(resolve => waiting.push(() => resolve(apps(MINE))));
    const answer = pages();
    for (let i = 0; i < 200 && waiting.length < 2; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(waiting.length, 2, 'the second Page is asked while the first has not answered');
    waiting.forEach(go => go());
    assert.deepEqual((await answer).body.pages.map(p => p.installed), [true, true]);
  });
  test('nothing of this is asked when the list itself is refused', async () => {
    state.given = [kept('100')];
    assert.equal((await pages()).body.code, 'not_connected');
    connected(); state.answers['/me/accounts'] = fbAnswer({ error: { message: 'no', code: 190 } }, 400);
    assert.equal((await pages()).body.code, 'gone');
    assert.deepEqual([subs().length, state.sql.filter(q => /facebook_leads|FROM facebook_pages/.test(q.sql)).length], [0, 0]);
  });
});

describe('Part 4: a Page\'s leads', () => {
  const { sealKey } = require('../../utils/calcom');
  const connected = () => { state.row = { user_id: '77', name: 'Olga Owner', token: sealKey('LONG-TOKEN'), scopes: ['pages_show_list'], connected_at: '2026-11-23T10:00:00.000Z' }; };
  const kept = (page_id, over = {}) => ({ page_id, page_name: 'P' + page_id, workspace_id: 7, webhook_id: 70, token: sealKey(`KEPT-TOKEN-${page_id}`), ...over });
  const lead = (leadgen_id, page_id, status, created_at, reason = null, detail = null) => ({ leadgen_id, page_id, status, reason, detail, created_at });
  const pages = () => admin.request('GET', '/api/admin/facebook/pages');
  const page = (r, id) => r.body.pages.find(p => p.id === id);

  test('none arrived: null — for a given Page, for one that is not, for a lost one', async () => {
    connected(); state.given = [kept('100'), kept('300')];
    const r = await pages();
    assert.deepEqual([page(r, '100').leads, page(r, '200').leads, r.body.lost[0].leads], [null, null, null]);
  });
  test('how many arrived, how many are contacts, how many Facebook sends again — and the last one, with what became of it', async () => {
    connected(); state.given = [kept('100')];
    state.leads = [lead('1', '100', 'done', '2026-11-20T10:00:00.000Z'), lead('2', '100', 'failed', '2026-11-24T10:00:00.000Z', 'unreachable', 'Facebook could not be reached'),
      lead('3', '100', 'skipped', '2026-11-22T10:00:00.000Z', 'unmapped'), lead('4', '100', 'done', '2026-11-21T10:00:00.000Z'), lead('5', '100', 'test', '2026-11-19T10:00:00.000Z'), lead('6', '100', 'failed', '2026-11-18T10:00:00.000Z', 'gone', 'x')];
    const r = await pages();
    assert.deepEqual(page(r, '100').leads, { total: 6, contacts: 2, waiting: 2, last: { status: 'failed', reason: 'unreachable', detail: 'Facebook could not be reached', at: '2026-11-24T10:00:00.000Z' } });
    assert.equal(page(r, '200').leads, null, 'another Page\'s leads are not this one\'s');
  });
  test('the last one is the newest; of two of the same moment, the one with the greater id; an empty reason or detail is none', async () => {
    connected(); state.given = [kept('100')];
    state.leads = [lead('31', '100', 'done', '2026-11-24T10:00:00.000Z', '', ''), lead('32', '100', 'skipped', '2026-11-24T10:00:00.000Z', 'off', ''), lead('30', '100', 'done', '2026-11-24T09:59:59.000Z')];
    assert.deepEqual(page(await pages(), '100').leads, { total: 3, contacts: 2, waiting: 0, last: { status: 'skipped', reason: 'off', detail: null, at: '2026-11-24T10:00:00.000Z' } });
    state.leads = [lead('33', '100', 'done', '2026-11-25T10:00:00.000Z', '', '')];
    assert.deepEqual(page(await pages(), '100').leads.last, { status: 'done', reason: null, detail: null, at: '2026-11-25T10:00:00.000Z' });
    assert.ok(state.sql.some(q => q.sql === 'SELECT DISTINCT ON (page_id) page_id, status, reason, detail, created_at FROM facebook_leads ORDER BY page_id, created_at DESC, leadgen_id DESC' && q.params === undefined), 'asked of the whole table, with nothing put into it');
  });
  test('a Page that is given to nobody still shows the leads that arrived for it; a lost Page too', async () => {
    connected(); state.given = [kept('300', { page_name: 'Weg' })];
    state.leads = [lead('7', '200', 'skipped', '2026-11-24T08:00:00.000Z', 'no_page'), lead('8', '300', 'done', '2026-11-23T08:00:00.000Z'), lead('9', '300', 'skipped', '2026-11-24T08:00:00.000Z', 'rejected', 'Unsupported get request. <b>'),
      lead('10', '999', 'skipped', '2026-11-24T08:00:00.000Z', 'no_page')];   // a Page nobody here knows: in no row of the answer
    const r = await pages();
    assert.deepEqual([page(r, '200').assigned, page(r, '200').installed, page(r, '200').leads], [null, null, { total: 1, contacts: 0, waiting: 0, last: { status: 'skipped', reason: 'no_page', detail: null, at: '2026-11-24T08:00:00.000Z' } }]);
    assert.deepEqual(r.body.lost, [{ id: '300', name: 'Weg', assigned: { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: 70, webhook_name: 'Website' },
      leads: { total: 2, contacts: 1, waiting: 0, last: { status: 'skipped', reason: 'rejected', detail: 'Unsupported get request. <b>', at: '2026-11-24T08:00:00.000Z' } } }]);
    assert.equal(page(r, '100').leads, null);
    assert.doesNotMatch(JSON.stringify(r.body), /999/);
  });
  test('counts without a last lead (the two questions are not one moment): the counts stand, the last is none', async () => {
    connected(); state.given = [kept('100')]; state.leads = [lead('1', '100', 'done', '2026-11-20T10:00:00.000Z')]; state.noLast = true;
    assert.deepEqual(page(await pages(), '100').leads, { total: 1, contacts: 1, waiting: 0, last: null });
  });
  test('no token and nothing of a lead but what became of it is told', async () => {
    connected(); state.given = [kept('100')]; state.leads = [{ ...lead('77001', '100', 'done', '2026-11-20T10:00:00.000Z'), contact_id: 4242, deal_id: 4343, workspace_id: 7, form_id: '12' }];
    const r = await pages();
    assert.deepEqual(Object.keys(page(r, '100')), ['id', 'name', 'can_advertise', 'tasks', 'assigned', 'installed', 'installed_note', 'leads']);
    assert.deepEqual([Object.keys(page(r, '100').leads), Object.keys(page(r, '100').leads.last)], [['total', 'contacts', 'waiting', 'last'], ['status', 'reason', 'detail', 'at']]);
    assert.doesNotMatch(JSON.stringify(r.body), /KEPT-TOKEN|PAGE-TOKEN|LONG-TOKEN|v1\.|77001|4242|4343/);
  });
  test('the database away for the leads, or for the kept tokens: an error, not half a list', async () => {
    connected(); state.given = [kept('100')];
    for (const broken of [/COUNT\(\*\)::int AS total/, /SELECT DISTINCT ON \(page_id\)/, /^SELECT page_id, token FROM facebook_pages$/]) {
      state.brokenSql = broken;
      const r = await pages();
      assert.deepEqual([r.status, r.body.error, r.body.pages], [500, 'Internal server error', undefined], String(broken));
    }
    state.brokenSql = null;
    assert.equal((await pages()).status, 200);
  });
});

describe('the lines that make it so', () => {
  const code = read('routes/admin-facebook.js'), wiring = read('server.js');
  test('mounted with the console\'s other routers; only platform_settings is touched, always by its key', () => {
    assert.match(wiring, /app\.use\('\/api\/admin',\s+require\('\.\/routes\/admin-facebook'\)\);/);
    const statements = [...code.matchAll(/pool\.query\(\s*(?:'([^']+)'|`([^`]+)`)/g)].map(m => m[1] || m[2]);
    assert.equal(statements.length, 13);
    for (const s of statements) {
      assert.doesNotMatch(s, /\$\{/, 'nothing is put into a statement: ' + s.slice(0, 50));
      assert.deepEqual([...s.matchAll(/(?:FROM|INTO|JOIN)\s+(\w+)/g)].map(m => m[1]).filter(t => !['platform_settings', 'facebook_pages', 'workspaces', 'workspace_webhook', 'taken', 'facebook_leads'].includes(t)), [], s.slice(0, 50));
    }
    assert.equal(statements.filter(s => /platform_settings/.test(s)).length, 3); for (const s of statements.filter(x => /platform_settings/.test(x))) assert.match(s, /key = \$1|VALUES \(\$1, \$2/);
  });
  test('every route but the callback is behind requireAdmin; the callback asks for the session itself', () => {
    assert.equal((code.match(/router\.(get|post|put|delete)\('\/facebook[^']*', requireAdmin,/g) || []).length, 9);
    assert.equal((code.match(/router\.(get|post|put|delete)\(/g) || []).length, 10, 'ten routes: nine behind requireAdmin, and the callback');
    assert.match(code, /router\.get\('\/facebook\/callback', async \(req, res\) => \{\s+try \{\s+if \(!req\.session \|\| !req\.session\.isAdmin\) return back\(res, 'login'\);/, 'the whole of it stands inside one try: a browser is never left without an answer');
    assert.match(code, /delete req\.session\.facebookState;\s+\/\/ a word counts once\s+if \(!facebook\.stateMatches\(kept, req\.query\.state\)\) return back\(res, 'state'\);/);
    assert.match(code, /token: sealKey\(token\)/);
  });
  test('Part 3: the app is installed before the Page is written; taking back deletes first; the receiver\'s address is this server\'s own', () => {
    assert.ok(code.indexOf('await facebook.subscribePage(pageId, page.token)') > 0 && code.indexOf('await facebook.subscribePage(pageId, page.token)') < code.indexOf('INSERT INTO facebook_pages'));
    assert.match(code, /pool\.query\('DELETE FROM facebook_pages WHERE page_id = \$1 RETURNING token', \[pageId\]\);\s+res\.json\(\{ success: true, unsubscribed: row \? await unsubscribe\(pageId, row\.token\) : false \}\);/);
    assert.match(code, /const receiveUrl = req => `\$\{baseUrl\(req\)\}\/api\/integrations\/facebook\/receive`;/);
    assert.match(code, /await Promise\.allSettled\(given\.map\(g => unsubscribe\(g\.page_id, g\.token\)\)\);/);
  });
  test('Part 4: the leads are read with two statements nothing is put into; a kept token is opened before Facebook is asked, and only for Pages still the account\'s', () => {
    assert.match(code, /SELECT page_id, COUNT\(\*\)::int AS total, \(COUNT\(\*\) FILTER \(WHERE status = 'done'\)\)::int AS contacts, \(COUNT\(\*\) FILTER \(WHERE status = 'failed'\)\)::int AS waiting\s+FROM facebook_leads GROUP BY page_id/);
    assert.match(code, /'SELECT DISTINCT ON \(page_id\) page_id, status, reason, detail, created_at FROM facebook_leads ORDER BY page_id, created_at DESC, leadgen_id DESC'/);
    assert.match(code, /const asked = kept\.filter\(k => got\.list\.some\(p => p\.id === k\.page_id\)\);\s+const states = new Map\(\(await Promise\.all\(asked\.map\(k => installedOn\(k\.page_id, k\.token\)\)\)\)\.map\(\(s, i\) => \[asked\[i\]\.page_id, s\]\)\);/);
    const fn = code.slice(code.indexOf('async function installedOn('), code.indexOf('// The Pages of the connected person'));
    assert.ok(fn.indexOf('openKey(sealed)') > 0 && fn.indexOf('openKey(sealed)') < fn.indexOf('facebook.pageInstalled(pageId, token)'));
    assert.match(fn, /if \(!isFacebooks\(err\)\) throw err;/, 'what is no refusal of Facebook\'s is an error, not "could not be checked"');
    assert.doesNotMatch(code.slice(code.indexOf("router.get('/facebook/pages'"), code.indexOf("router.get('/facebook/targets'")), /token: /, 'no token is put into the answer');
  });
  test('the table of Pages given to workspaces: one row per Page, gone with its workspace, kept when its lead webhook goes, never without a token', () => {
    const db = read('db.js');
    assert.match(db, /CREATE TABLE IF NOT EXISTS facebook_pages \(\s+page_id\s+TEXT PRIMARY KEY,\s+page_name\s+TEXT NOT NULL DEFAULT '',\s+workspace_id INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE,\s+webhook_id\s+INTEGER REFERENCES workspace_webhook\(id\) ON DELETE SET NULL,\s+token\s+TEXT NOT NULL,\s+created_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\),\s+updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)\s+\)/);
    assert.match(db, /CREATE INDEX IF NOT EXISTS facebook_pages_workspace_idx ON facebook_pages \(workspace_id\)/);
    assert.ok(db.indexOf('CREATE TABLE IF NOT EXISTS workspace_webhook') < db.indexOf('CREATE TABLE IF NOT EXISTS facebook_pages'), 'made after the table it points at');
    assert.equal(require('../../utils/workspace-export').LEFT_OUT.facebook_pages, 'secret', 'the export leaves it out: it holds a sealed token of this install');
    assert.match(code, /SELECT p\.page_id, p\.page_name, p\.workspace_id, w\.name AS workspace_name, p\.webhook_id, h\.name AS webhook_name\s+FROM facebook_pages p JOIN workspaces w ON w\.id = p\.workspace_id LEFT JOIN workspace_webhook h ON h\.id = p\.webhook_id/, 'the list of given Pages never reads a token');
  });
  test('the env example names what the server needs', () => {
    const env = read('.env.example');
    for (const name of ['META_APP_ID=', 'META_APP_SECRET=', 'META_GRAPH_VERSION=', 'META_SCOPES=']) assert.match(env, new RegExp(`^# ${name}$`, 'm'), name);
    assert.match(env, /<public origin>\/api\/admin\/facebook\/callback/);
  });
});
