// ROUTE tests: tasks.due_date must leave /api/tasks as the string 'YYYY-MM-DD',
// never as a raw Postgres DATE.
//
// THE BUG THIS PINS. `due_date` is a DATE column. node-postgres parses a DATE
// into a JavaScript Date at LOCAL MIDNIGHT, and res.json() then serialises that
// with toISOString(), which is UTC. On any server east of UTC, local midnight
// on the 6th is still the 5th in UTC — so the client's `.slice(0, 10)` reads
// one day early. The calendar was right all along because routes/calendar.js
// reads the same column as TO_CHAR(t.due_date, 'YYYY-MM-DD'); the task drawer
// (opened by clicking a calendar entry) reads it from /api/tasks/:id, which
// used SELECT t.* and let the raw DATE through. Reported as: "on the calendar
// the date is right, open the task and it is one day less".
//
// Two kinds of test. The SQL-shape tests are the regression guard: the fake
// pool cannot run SQL, so they assert the three SELECTs wrap the column — they
// fail against the pre-fix route. The mechanism test is deterministic proof of
// WHY, built with Date.UTC so it does not itself depend on the machine's TZ
// (the exact trap readmedev §8 warns about).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const WRAPPED = /TO_CHAR\(t\.due_date,\s*'YYYY-MM-DD'\)\s+AS\s+due_date/;

describe('the mechanism (deterministic, TZ-independent)', () => {
  test('a local-midnight Date east of UTC serialises to the PREVIOUS day', () => {
    // What node-pg hands back for DATE '2026-10-06' on a UTC+2 server is the
    // instant 2026-10-05T22:00:00Z. Build that instant explicitly.
    const asPgWouldReturnInBerlin = new Date(Date.UTC(2026, 9, 5, 22, 0, 0));
    const overTheWire = JSON.parse(JSON.stringify({ due_date: asPgWouldReturnInBerlin })).due_date;
    assert.equal(overTheWire.slice(0, 10), '2026-10-05', 'the day the client would show');
    assert.notEqual(overTheWire.slice(0, 10), '2026-10-06', 'which is not the day that was stored');
  });

  test('the TO_CHAR string passes through res.json untouched', () => {
    assert.equal(JSON.parse(JSON.stringify({ due_date: '2026-10-06' })).due_date, '2026-10-06');
  });
});

describe('every tasks SELECT reads due_date through TO_CHAR', () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    // whatever the route selects, give it a task row back
    return { rows: [{ id: 4, title: 'Send the quote', due_date: '2026-10-06', due_time: '14:00', parent_id: null }], rowCount: 1 };
  } };
  let s;
  before(async () => { s = await serve({ '/api/tasks': loadRoute('tasks.js', { pool }) }); });
  after(async () => { await s.close(); });

  function sqlFor(re) {
    const hit = calls.find(c => re.test(c.sql));
    assert.ok(hit, `expected a statement matching ${re}`);
    return hit.sql;
  }

  test('GET / (the list) — this is what the Tasks page and the overdue labels read', async () => {
    calls.length = 0;
    const r = await s.request('GET', '/api/tasks');
    assert.equal(r.status, 200);
    const sql = sqlFor(/FROM tasks t\s+LEFT JOIN users u\s+ON u\.id = t\.assigned_to\s+LEFT JOIN users cu/);
    assert.match(sql, WRAPPED, 'the list query must wrap due_date — a raw DATE loses a day east of UTC');
  });

  test('GET /:id (the task itself) — this is what the calendar click opens', async () => {
    calls.length = 0;
    const r = await s.request('GET', '/api/tasks/4');
    assert.equal(r.status, 200);
    const sql = sqlFor(/WHERE t\.id = \$1 AND t\.workspace_id = \$2/);
    assert.match(sql, WRAPPED, 'the single-task query must wrap due_date');
  });

  test('GET /:id (its subtasks)', async () => {
    calls.length = 0;
    await s.request('GET', '/api/tasks/4');
    const sql = sqlFor(/WHERE t\.parent_id = \$1/);
    assert.match(sql, WRAPPED, 'the subtasks query must wrap due_date');
  });

  test('due_time keeps its own TO_CHAR (HH24:MI) alongside — the fix must not displace it', async () => {
    calls.length = 0;
    await s.request('GET', '/api/tasks/4');
    for (const c of calls) {
      if (/SELECT t\.\*/.test(c.sql)) assert.match(c.sql, /TO_CHAR\(t\.due_time,\s*'HH24:MI'\)\s+AS\s+due_time/);
    }
  });

  test("the alias wins over t.*'s copy, so the row carries the string", async () => {
    // SELECT t.*, TO_CHAR(...) AS due_date names due_date twice; node-pg keeps
    // the LAST one. due_time already relies on exactly this — same guarantee.
    calls.length = 0;
    const r = await s.request('GET', '/api/tasks/4');
    assert.equal(r.body.due_date, '2026-10-06');
    assert.match(String(r.body.due_date), /^\d{4}-\d{2}-\d{2}$/, 'a bare date string, no time, no Z');
  });
});
