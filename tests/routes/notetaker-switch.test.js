// ROUTE + UNIT tests: the Notetaker's switches (NOTETAKER_CHANGES, 2026-10-27). It was off for a branch (commented
// out, not deleted) and is on again. Pinned: initDb() creates notetaker_recordings with its three later columns;
// server.js mounts the result route with its raw body and limit, and starts the link watch after initDb(); the server
// switch and the dialog's switch are on. "Coming soon" was on from 2026-11-05 (NOTETAKER_AI_CHANGES Part 10) and is
// off again since 2026-11-06 (Part 11). So a freshly loaded route (nobody set the switches):
// - asks the Notetaker in its health check, and answers 'soon' without asking once coming soon is switched on;
// - looks for waiting requests in its link tick.
// The email sync's table stays commented (on hold).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb } = require('../helpers/load-db');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NT_URL = 'http://notetaker.test/crm/recordings';
const pool = createFakePool();
const realFetch = globalThis.fetch;
const asked = [];   // requests to the Notetaker
const saved = { NOTETAKER_URL: process.env.NOTETAKER_URL, NOTETAKER_CRM_TOKEN: process.env.NOTETAKER_CRM_TOKEN };
let integrations, srv;
before(async () => {
  process.env.NOTETAKER_URL = NT_URL; delete process.env.NOTETAKER_CRM_TOKEN;
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(NT_URL)) { asked.push(String(url)); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    return realFetch(url, opts);
  };
  integrations = loadRoute('integrations.js', { pool });   // the switch left at its default
  srv = await serve({ '/api/integrations': integrations });
});
after(async () => {
  globalThis.fetch = realFetch; await srv.close();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe('the Notetaker is on', () => {
  test('the database: initDb() creates notetaker_recordings and its three later columns; the email table stays commented', async () => {
    const dbPool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    await loadDb(read('db.js'), dbPool).initDb();
    assert.equal(dbPool.filter(/CREATE TABLE IF NOT EXISTS notetaker_recordings \(/).length, 1);
    for (const col of ['callback_token', 'note_activity_id', 'finished_at']) assert.ok(dbPool.some(new RegExp(`ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS ${col} `)), col);
    const create = dbPool.log.findIndex(e => /CREATE TABLE IF NOT EXISTS notetaker_recordings/.test(e.sql));
    assert.ok(dbPool.log.findIndex(e => /ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS callback_token/.test(e.sql)) > create, 'the columns after the table');
    assert.deepEqual(dbPool.filter(/email_accounts/), [], 'email sync is still on hold');
  });
  test('server.js: the result route (raw body, limit, mount) is live, and the link watch starts after initDb()', () => {
    const server = read('server.js');
    const live = server.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.match(live, /^app\.use\('\/api\/notetaker\/webhook', express\.raw\(\{ type: '\*\/\*', limit: '5mb' \}\)\);$/m);
    assert.match(live, /^app\.use\('\/api\/notetaker\/webhook', webhookIpLimiter, notetakerLinkLimiter\);\napp\.use\('\/api\/notetaker',\s+require\('\.\/routes\/notetaker'\)\);/m);
    assert.ok(live.indexOf("express.raw({ type: '*/*', limit: '5mb' })") < live.indexOf('app.use(express.json());'), 'the raw body is kept before json() reads it');
    assert.ok(live.indexOf('integrations.startNotetakerLinkWatch();') > live.indexOf('initDb()'), 'the watch starts once the database is ready');
    assert.doesNotMatch(server, /Notetaker is off for this branch/);
  });
  test('both switches are on', () => {
    assert.match(read('routes/integrations.js'), /^let NOTETAKER_ON = true;$/m);
    assert.match(read('public/js/detail-views.js'), /^const DV_NOTETAKER_SHOWN = true;$/m);
  });
  test('coming soon is off again (Part 11)', () => {
    assert.match(read('routes/integrations.js'), /^let NOTETAKER_SOON = false;$/m);
  });
  test('a freshly loaded route asks the Notetaker in its health check', async () => {
    asked.length = 0;
    const r = await srv.request('GET', '/api/integrations/notetaker/health?fresh=1');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { available: true });
    assert.equal(asked.length, 1); assert.match(asked[0], /^http:\/\/notetaker\.test\/crm\/recordings\?external_id=/);
  });
  test('coming soon switched on: the health check answers "soon" and does not ask the Notetaker', async () => {
    integrations.setNotetakerSoon(true);
    try {
      asked.length = 0;
      const r = await srv.request('GET', '/api/integrations/notetaker/health?fresh=1');
      assert.equal(r.status, 200); assert.deepEqual(r.body, { available: false, reason: 'soon' });
      assert.equal(asked.length, 0);
    } finally { integrations.setNotetakerSoon(false); }
  });
  test('a freshly loaded route looks for requests waiting for their Meet link', async () => {
    pool.reset();
    assert.deepEqual(await integrations.notetakerLinkTick(), []);
    assert.ok(pool.some(/FROM notetaker_recordings n JOIN activities a/), 'the tick queried the waiting requests');
  });
});
