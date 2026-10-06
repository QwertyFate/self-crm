// ROUTE tests: every timed task and activity is stored WITH the timezone it was
// entered in, stamped by the server from users.timezone.
//
// WHY. due_date/due_time and event_date/event_time are naive wall-clock values.
// Without a zone, a Berlin member's "19:30" is shown to a Manila member as
// 19:30 on THEIR clock — six hours early — and at the date boundary it lands
// on the wrong day and reads as overdue before it is due. Storing the zone
// each value was typed in makes the row an unambiguous instant: the client
// converts it to the viewer's zone for display (tests/client/timezone-conversion.test.js).
//
// DESIGN. No save-side conversion: the member types in their own clock and the
// server records that clock's zone next to it. The zone comes from
// middleware/auth.js (req.userTimezone, read from users.timezone in the same
// per-request query that checks membership). A row with no zone — everything
// written before this — is read as the default zone, Europe/Berlin, which is
// what every user had effectively been using.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, inject, ROOT } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const DEFAULT_TZ = 'Europe/Berlin';

describe('db.js: the two zone columns, additive and nullable', () => {
  const db = read('db.js');
  test('tasks.due_tz', () => assert.match(db, /ALTER TABLE tasks\s+ADD COLUMN IF NOT EXISTS due_tz\s+TEXT/));
  test('activities.event_tz', () => assert.match(db, /ALTER TABLE activities\s+ADD COLUMN IF NOT EXISTS event_tz\s+TEXT/));
  test('neither is NOT NULL — legacy rows stay valid and are read as the default zone', () => {
    assert.doesNotMatch(db, /due_tz\s+TEXT NOT NULL/);
    assert.doesNotMatch(db, /event_tz\s+TEXT NOT NULL/);
  });
});

describe('middleware/auth.js supplies req.userTimezone from users.timezone', () => {
  // The REAL middleware, bound to a fake pool. loadRoute() is not called in this
  // describe, so the module cache still holds the genuine file.
  test('one query, joined to users; the zone lands on req', async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ role: 'member', workspace_id: 7, timezone: 'Asia/Manila' }] }; } };
    const restore = inject('db.js', { pool });
    const abs = path.join(ROOT, 'middleware', 'auth.js');
    delete require.cache[abs];
    try {
      const requireAuth = require(abs);
      const req = { session: { userId: 1, workspaceId: 7 } };
      let nextCalled = false;
      await requireAuth(req, { status: () => ({ json: () => {} }) }, () => { nextCalled = true; });
      assert.ok(nextCalled);
      assert.equal(req.userTimezone, 'Asia/Manila');
      assert.equal(req.workspaceId, 7); assert.equal(req.userRole, 'member');
      assert.equal(calls.length, 1, 'still a single query per request');
      assert.match(calls[0].sql, /JOIN users/i, 'the zone comes from the users table in the same statement');
      assert.match(calls[0].sql, /timezone/);
    } finally { restore(); delete require.cache[abs]; }
  });
  test('an account with no zone recorded gets the default, never undefined', async () => {
    const pool = { query: async () => ({ rows: [{ role: 'owner', workspace_id: 7, timezone: null }] }) };
    const restore = inject('db.js', { pool });
    const abs = path.join(ROOT, 'middleware', 'auth.js');
    delete require.cache[abs];
    try {
      const requireAuth = require(abs);
      const req = { session: { userId: 1, workspaceId: 7 } };
      await requireAuth(req, { status: () => ({ json: () => {} }) }, () => {});
      assert.equal(req.userTimezone, DEFAULT_TZ);
    } finally { restore(); delete require.cache[abs]; }
  });
});

function recordingPool(extra = () => null) {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    const r = extra(sql, params); if (r) return r;
    if (/INSERT INTO/.test(sql)) return { rows: [{ id: 4 }] };
    if (/^\s*SELECT 1 FROM/.test(sql)) return { rows: [{ '1': 1 }] };
    if (/UPDATE/.test(sql)) return { rows: [{ id: 4 }], rowCount: 1 };
    return { rows: [{ id: 4, title: 'T', due_date: '2026-10-06', due_time: '19:30', due_tz: 'Europe/Berlin' }] };
  } };
  return { pool, calls };
}
const stmt = (calls, re) => { const c = calls.find(x => re.test(x.sql)); assert.ok(c, `no statement matching ${re}`); return c; };

describe('POST/PUT /api/tasks stamp due_tz with the saving member\'s zone', () => {
  let s, calls;
  before(async () => {
    const r = recordingPool(); calls = r.calls;
    s = await serve({ '/api/tasks': loadRoute('tasks.js', { pool: r.pool, user: { id: 1, workspaceId: 7, role: 'owner', timezone: 'Asia/Manila' } }) });
  });
  after(async () => { await s.close(); });

  test('POST: the INSERT names due_tz and binds the member\'s zone', async () => {
    calls.length = 0;
    const r = await s.request('POST', '/api/tasks', { title: 'Call Anna', due_date: '2026-10-07', due_time: '02:00' });
    assert.equal(r.status, 201);
    const ins = stmt(calls, /INSERT INTO tasks/);
    assert.match(ins.sql, /due_tz/);
    assert.ok(ins.params.includes('Asia/Manila'), 'the zone is bound, from req.userTimezone — not from the body');
    // the wall-clock is stored exactly as typed: no conversion on save
    assert.ok(ins.params.includes('2026-10-07') && ins.params.includes('02:00'));
  });
  test('POST ignores a zone sent in the body — the server decides', async () => {
    calls.length = 0;
    await s.request('POST', '/api/tasks', { title: 'X', due_date: '2026-10-07', due_time: '02:00', due_tz: 'Etc/GMT-14' });
    const ins = stmt(calls, /INSERT INTO tasks/);
    assert.ok(!ins.params.includes('Etc/GMT-14'));
    assert.ok(ins.params.includes('Asia/Manila'));
  });
  test('PUT re-stamps it: the editor\'s clock is the one the edited time means', async () => {
    calls.length = 0;
    const r = await s.request('PUT', '/api/tasks/4', { title: 'Call Anna', due_date: '2026-10-07', due_time: '02:00' });
    assert.equal(r.status, 200);
    const up = stmt(calls, /UPDATE tasks/);
    assert.match(up.sql, /due_tz\s*=/);
    assert.ok(up.params.includes('Asia/Manila'));
  });
  test('an all-day task is stamped too (harmless, and a time can be added later)', async () => {
    calls.length = 0;
    await s.request('POST', '/api/tasks', { title: 'Whole day', due_date: '2026-10-07' });
    assert.ok(stmt(calls, /INSERT INTO tasks/).params.includes('Asia/Manila'));
  });
});

describe('without a zone on the request, tasks fall back to the default — the same meaning as a legacy row', () => {
  test('POST binds Europe/Berlin when req.userTimezone is undefined', async () => {
    const r = recordingPool();
    const s = await serve({ '/api/tasks': loadRoute('tasks.js', { pool: r.pool }) });   // default user: no timezone
    try {
      await s.request('POST', '/api/tasks', { title: 'T', due_date: '2026-10-07', due_time: '09:00' });
      assert.ok(stmt(r.calls, /INSERT INTO tasks/).params.includes(DEFAULT_TZ));
    } finally { await s.close(); }
  });
});

describe('POST/PATCH /api/activities stamp event_tz', () => {
  let s, calls;
  before(async () => {
    const r = recordingPool(); calls = r.calls;
    s = await serve({ '/api/activities': loadRoute('activities.js', { pool: r.pool, user: { id: 1, workspaceId: 7, role: 'owner', timezone: 'Asia/Manila' } }) });
  });
  after(async () => { await s.close(); });

  test('POST binds the zone next to the date and time', async () => {
    calls.length = 0;
    const r = await s.request('POST', '/api/activities', { type: 'call', content: 'Ring back', event_date: '2026-10-07', event_time: '02:00' });
    assert.equal(r.status, 201);
    const ins = stmt(calls, /INSERT INTO activities/);
    assert.match(ins.sql, /event_tz/);
    assert.ok(ins.params.includes('Asia/Manila'));
  });
  test('PATCH that changes the time re-stamps the zone', async () => {
    calls.length = 0;
    await s.request('PATCH', '/api/activities/9', { event_time: '14:00' });
    const up = stmt(calls, /UPDATE activities/);
    assert.match(up.sql, /event_tz\s*=/);
    assert.ok(up.params.includes('Asia/Manila'));
  });
  test('PATCH that only ticks "completed" must NOT rewrite the zone of a time it did not touch', async () => {
    calls.length = 0;
    await s.request('PATCH', '/api/activities/9', { completed: true });
    const up = stmt(calls, /UPDATE activities/);
    // the zone is set through a CASE on "was a date or time provided", bound false here
    assert.match(up.sql, /event_tz\s*=\s*CASE WHEN/);
    const i = up.params.indexOf('Asia/Manila');
    assert.ok(i >= 0, 'the zone is still bound (the CASE decides)');
    assert.ok(up.params.includes(false), 'the "date or time provided" flag is false');
  });
});

describe('GET /api/calendar hands the zone back with every row', () => {
  test('both halves of the UNION select it as event_tz, at the same position', async () => {
    const r = recordingPool();
    const s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool: r.pool }) });
    try {
      await s.request('GET', '/api/calendar?start=2026-10-01&end=2026-10-31');
      const q = stmt(r.calls, /UNION ALL/).sql;
      assert.match(q, /a\.event_tz\s+AS\s+event_tz/, 'activities half');
      assert.match(q, /t\.due_tz\s+AS\s+event_tz/, 'tasks half');
      // same column order in both halves or Postgres rejects the UNION: event_tz must
      // directly follow event_time in each
      for (const half of q.split(/UNION ALL/)) assert.match(half, /AS event_time,\s*\n?\s*(a\.event_tz|t\.due_tz)\s+AS event_tz/);
    } finally { await s.close(); }
  });
});
