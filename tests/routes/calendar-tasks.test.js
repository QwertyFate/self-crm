// A task with a due date belongs on the calendar too. The calendar feed is a union
// of scheduled activities and due tasks (Part 31) — before this, /api/calendar read
// only activities, so a task added on a deal never showed up anywhere on the page.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const ROWS = [
  { kind: 'activity', id: 5, type: 'call', title: 'Ring back', completed: false,
    event_date: '2026-10-07', event_time: '09:30', created_by: 1, created_by_name: 'Ada',
    contact_id: 2, contact_name: 'Bo', deal_id: 3, deal_title: 'Roof job', status: null, priority: null },
  { kind: 'task', id: 5, type: 'task', title: 'Send the quote', completed: true,
    event_date: '2026-10-08', event_time: null, created_by: 1, created_by_name: 'Ada',
    contact_id: 2, contact_name: 'Bo', deal_id: 3, deal_title: 'Roof job', status: 'done', priority: 'high' },
];

describe('GET /api/calendar unions activities and due tasks', () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: ROWS }; } };
  let s;
  before(async () => { s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool }) }); });
  after(async () => { await s.close(); });

  test('one query covering both tables, each row saying which it is', async () => {
    const r = await s.request('GET', '/api/calendar?start=2026-10-01&end=2026-10-31');
    assert.equal(r.status, 200);
    const q = calls[0].sql;
    assert.match(q, /UNION ALL/);
    assert.match(q, /'activity'\s+AS kind/);
    assert.match(q, /'task'\s+AS kind/);
    assert.match(q, /FROM tasks t/);
    assert.equal(r.body.length, 2);
  });
  test("a task's due date is its calendar date, and its due time its calendar time (Part 32)", async () => {
    const q = calls[0].sql;
    assert.match(q, /TO_CHAR\(t\.due_date, 'YYYY-MM-DD'\)\s+AS event_date/);
    assert.match(q, /TO_CHAR\(t\.due_time, 'HH24:MI'\)\s+AS event_time/,
      'a task was all-day only until it could carry a time of its own');
    assert.match(q, /t\.title\s+AS title/);
  });
  test("a task counts as done when its status is done, which is what the checkbox reflects", async () => {
    assert.match(calls[0].sql, /\(t\.status = 'done'\)\s+AS completed/);
  });
  test('it carries the deal and contact it hangs off, so the calendar can link to them', async () => {
    const q = calls[0].sql;
    assert.match(q, /LEFT JOIN deals\s+dt ON dt\.id = t\.deal_id/);
    assert.match(q, /LEFT JOIN contacts ct ON ct\.id = t\.contact_id/);
  });
  test('both halves are scoped to the workspace and the requested range', async () => {
    const q = calls[0].sql, p = calls[0].params;
    assert.equal((q.match(/workspace_id\s*=\s*\$1/g) || []).length, 2, 'activities and tasks both');
    assert.match(q, /t\.due_date\s+IS NOT NULL/);
    assert.match(q, /t\.due_date\s*>=\s*\$2::date/);
    assert.match(q, /t\.due_date\s*<=\s*\$3::date/);
    assert.deepEqual(p, [7, '2026-10-01', '2026-10-31']);
  });
  test("a task's person is who it is assigned to, which is who the Person filter matches", async () => {
    assert.match(calls[0].sql, /COALESCE\(t\.assigned_to, t\.created_by\) AS created_by/);
    assert.match(calls[0].sql, /LEFT JOIN users\s+ut ON ut\.id = COALESCE\(t\.assigned_to, t\.created_by\)/,
      'the avatar and the filter must agree on the same person');
  });
  test('the today feed unions them too', async () => {
    calls.length = 0;
    await s.request('GET', '/api/calendar/today');
    assert.match(calls[0].sql, /UNION ALL/);
    assert.match(calls[0].sql, /t\.due_date = CURRENT_DATE/);
  });
});
