// ROUTE test: /api/break-scores, the team's high score board for the break (the falling-block game in
// public/js/break-game.js). Per workspace: one row per person, their best game; the ten best with names, only for people
// still in the workspace; the caller's own row marked. The score comes from the browser, so it is checked (whole numbers
// in range) and capped, the session decides who and where (never the body), and the route is rate-limited in server.js.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const fs   = require('fs');
const path = require('path');

const ROWS = [
  { name: 'Mira Sahin', score: 4200, lines: 31, level: 4, updated_at: '2026-10-20T08:00:00.000Z', mine: false },
  { name: 'Anna Weiß', score: 1800, lines: 15, level: 2, updated_at: '2026-10-19T17:30:00.000Z', mine: true },
];

describe('/api/break-scores', () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: /FROM break_scores b/.test(sql) ? ROWS : [] }; } };
  let s;
  before(async () => { s = await serve({ '/api/break-scores': loadRoute('break-scores.js', { pool }) }); });
  after(async () => { await s.close(); });

  test('GET: the ten best of this workspace, current members only, best first, an equal score keeps the earlier one ahead', async () => {
    calls.length = 0;
    const r = await s.request('GET', '/api/break-scores');
    assert.equal(r.status, 200);
    const q = calls.find(c => /FROM break_scores b/.test(c.sql));
    assert.ok(q, 'no board statement');
    assert.match(q.sql, /JOIN user_workspaces uw ON uw\.user_id = b\.user_id AND uw\.workspace_id = b\.workspace_id/, 'someone who left the workspace drops off the board');
    assert.match(q.sql, /JOIN users u ON u\.id = b\.user_id/);
    assert.match(q.sql, /WHERE b\.workspace_id = \$1 AND b\.score > 0/);
    assert.match(q.sql, /ORDER BY b\.score DESC, b\.updated_at ASC/);
    assert.match(q.sql, /LIMIT \$3/, 'the size is bound, never interpolated');
    assert.match(q.sql, /\(b\.user_id = \$2\) AS mine/);
    assert.deepEqual(q.params, [7, 1, 10]);
  });
  test('GET answers what the game expects: name, score, lines, level, at (ms), mine', async () => {
    const r = await s.request('GET', '/api/break-scores');
    assert.deepEqual(r.body, [
      { name: 'Mira Sahin', score: 4200, lines: 31, level: 4, at: Date.parse('2026-10-20T08:00:00.000Z'), mine: false },
      { name: 'Anna Weiß', score: 1800, lines: 15, level: 2, at: Date.parse('2026-10-19T17:30:00.000Z'), mine: true },
    ]);
  });
  test('POST: a finished game is kept only if it beats the caller\'s best; the answer is the board', async () => {
    calls.length = 0;
    const r = await s.request('POST', '/api/break-scores', { score: 2500, lines: 20, level: 3 });
    assert.equal(r.status, 200);
    const ins = calls.find(c => /INSERT INTO break_scores/.test(c.sql));
    assert.ok(ins, 'no insert');
    assert.deepEqual(ins.params, [7, 1, 2500, 20, 3]);
    assert.match(ins.sql, /ON CONFLICT \(workspace_id, user_id\) DO UPDATE/);
    assert.match(ins.sql, /SET score = EXCLUDED\.score, lines = EXCLUDED\.lines, level = EXCLUDED\.level, updated_at = NOW\(\)/);
    assert.match(ins.sql, /WHERE break_scores\.score < EXCLUDED\.score/, 'a weaker game never overwrites the best');
    assert.ok(calls.findIndex(c => /FROM break_scores b/.test(c.sql)) > calls.indexOf(ins), 'the board is read after the write');
    assert.equal(r.body.length, 2);
  });
  test('POST: who and where come from the session, never from the body', async () => {
    calls.length = 0;
    await s.request('POST', '/api/break-scores', { score: 900, lines: 8, level: 1, workspace_id: 99, user_id: 42, name: 'Someone else' });
    const ins = calls.find(c => /INSERT INTO break_scores/.test(c.sql));
    assert.deepEqual(ins.params, [7, 1, 900, 8, 1]);
  });
  test('POST: anything but whole numbers in range is refused, and nothing is written', async () => {
    for (const body of [
      {}, { score: '900', lines: 8, level: 1 }, { score: 900.5, lines: 8, level: 1 }, { score: -5, lines: 8, level: 1 },
      { score: 0, lines: 0, level: 1 }, { score: 900, lines: -1, level: 1 }, { score: 900, lines: 8, level: 0 },
      { score: 10_000_001, lines: 8, level: 1 }, { score: 900, lines: 100_001, level: 1 }, { score: 900, lines: 8, level: 10_001 },
      { score: null, lines: 8, level: 1 }, { score: 900, lines: 8 },
    ]) {
      calls.length = 0;
      const r = await s.request('POST', '/api/break-scores', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(!calls.some(c => /INSERT/.test(c.sql)), `nothing written for ${JSON.stringify(body)}`);
    }
    calls.length = 0;
    const top = await s.request('POST', '/api/break-scores', { score: 10_000_000, lines: 100_000, level: 10_000 });
    assert.equal(top.status, 200, 'the caps themselves are allowed');
  });
});

describe('the table and the mount', () => {
  const db = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  test('one row per person and workspace, removed with either; a score is never negative', () => {
    const i = db.indexOf('CREATE TABLE IF NOT EXISTS break_scores'); assert.ok(i > 0, 'the table exists');
    const t = db.slice(i, db.indexOf(')\n  `);', i));
    assert.match(t, /workspace_id INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(t, /user_id\s+INTEGER NOT NULL REFERENCES users\(id\)\s+ON DELETE CASCADE/);
    assert.match(t, /score\s+INTEGER NOT NULL CHECK \(score >= 0\)/);
    assert.match(t, /PRIMARY KEY \(workspace_id, user_id\)/);
    assert.ok(i > db.indexOf('async function initDb()'), 'created at boot like every later table');
  });
  test('mounted behind its own rate limit, after the session, before the SPA catch-all', () => {
    const lim = server.indexOf("app.use('/api/break-scores', breakScoresLimiter);"), mount = server.indexOf("app.use('/api/break-scores', require('./routes/break-scores'));");
    assert.ok(lim > 0 && mount > lim, 'the limiter runs first');
    assert.ok(mount > server.indexOf('app.use(sessionMiddleware);'));
    assert.ok(mount < server.indexOf("app.get('*'"));
    assert.match(server, /const breakScoresLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000, max: 30,/);
  });
});
