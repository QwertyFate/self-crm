// ROUTE + UNIT tests: the Notetaker is off for this branch (NOTETAKER_CHANGES, 2026-10-27), commented out rather than
// deleted, so it comes back after the branch. Pinned: no table for it is created on any database; server.js mounts no
// result route and starts no link watch; routes/integrations.js stores and sends nothing (the switch is off), its link
// tick asks nothing, its health check says "not available" without asking the Notetaker; the dialog shows no box.
// The Notetaker's own suite (notetaker-booking.test.js) turns the switch on, so the code that comes back stays tested.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb } = require('../helpers/load-db');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const pool = createFakePool();
let integrations, srv;
const realFetch = globalThis.fetch;
const outside = [];   // requests that left this machine
before(async () => {
  globalThis.fetch = (url, opts) => { if (!String(url).startsWith('http://127.0.0.1:')) outside.push(String(url)); return realFetch(url, opts); };
  integrations = loadRoute('integrations.js', { pool });
  srv = await serve({ '/api/integrations': integrations });
});
after(async () => { globalThis.fetch = realFetch; await srv.close(); });

describe('the Notetaker is off for this branch', () => {
  test('the database: initDb() creates no notetaker_recordings (the definition stays in db.js, commented)', async () => {
    const dbPool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    await loadDb(read('db.js'), dbPool).initDb();
    assert.deepEqual(dbPool.filter(/notetaker_recordings/), []);
    const src = read('db.js'), open = src.indexOf('  /*\n  // The Notetaker (routes/integrations.js'), close = src.indexOf('  */\n', open);
    assert.ok(open > 0 && close > open, 'a /* */ block');
    const block = src.slice(open, close);
    for (const s of ['CREATE TABLE IF NOT EXISTS notetaker_recordings', 'ADD COLUMN IF NOT EXISTS callback_token', 'ADD COLUMN IF NOT EXISTS note_activity_id', 'ADD COLUMN IF NOT EXISTS finished_at']) assert.ok(block.includes(s), s);
    assert.ok(dbPool.some(/activities_source_check CHECK\(source IN \('user','engine','calcom','notetaker'\)\)/), 'the notes it already wrote stay valid');
  });
  test('server.js: the result route and the link watch are commented out, not deleted', () => {
    const server = read('server.js');
    const live = server.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(live, /\/api\/notetaker|startNotetakerLinkWatch|routes\/notetaker/);
    for (const l of ["// app.use('/api/notetaker/webhook', express.raw({ type: '*/*', limit: '5mb' }));", "// app.use('/api/notetaker/webhook', webhookIpLimiter, notetakerLinkLimiter);",
      "// app.use('/api/notetaker',     require('./routes/notetaker'));", '// integrations.startNotetakerLinkWatch();']) assert.ok(server.includes(l), l);
  });
  test('routes/integrations.js: one switch, off; nothing is stored or sent', () => {
    const src = read('routes/integrations.js');
    assert.match(src, /^let NOTETAKER_ON = false;$/m);
    for (const fn of ['notetakerSafe(wid, activityId) {', 'notetakerRequest(wid, activityId, userId, language) {']) assert.match(src, new RegExp(`async function ${fn.replace(/[()]/g, '\\$&')}\\n  if \\(!NOTETAKER_ON\\) return null;`), fn);
    assert.match(src, /const notetakerResult = body\.record === true \? await notetakerRequest\(/, 'a booking asking for a recording gets none (notetakerRequest answers null)');
  });
  test('the link tick asks nothing', async () => {
    pool.reset();
    assert.deepEqual(await integrations.notetakerLinkTick(), []);
    assert.deepEqual(pool.log, []);
  });
  test('the health check says "not available" without asking the Notetaker', async () => {
    outside.length = 0;
    const r = await srv.request('GET', '/api/integrations/notetaker/health?fresh=1');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { available: false, reason: 'error' });
    assert.deepEqual(outside, []);
  });
  test('the booking dialog shows no box, and the Notetaker\'s own suite turns the switch on', () => {
    assert.match(read('public/js/detail-views.js'), /^const DV_NOTETAKER_SHOWN = false;$/m);
    assert.match(read('tests/routes/notetaker-booking.test.js'), /integrations\.setNotetakerOn\(true\);/);
  });
});
