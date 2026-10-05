// A task can carry a time of day as well as a due date, so a timed task lands on the
// calendar's hour grid instead of its all-day strip (Part 32).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

describe('the due_time column', () => {
  test('db.js adds it additively and nullable, next to the other task columns', () => {
    const db = read('db.js');
    assert.match(db, /ALTER TABLE tasks\s+ADD COLUMN IF NOT EXISTS due_time\s+TIME/);
    assert.doesNotMatch(db, /due_time\s+TIME NOT NULL/, 'a task without a time is still a whole-day task');
  });
});

describe('the tasks route reads and writes it', () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/INSERT INTO tasks/.test(sql)) return { rows: [{ id: 4 }] };
    if (/^\s*SELECT 1 FROM deals/.test(sql)) return { rows: [{ '1': 1 }] };
    if (/UPDATE tasks/.test(sql)) return { rows: [{ id: 4 }], rowCount: 1 };
    return { rows: [{ id: 4, title: 'Send the quote', due_date: '2026-10-08', due_time: '14:00' }] };
  } };
  let s;
  before(async () => { s = await serve({ '/api/tasks': loadRoute('tasks.js', { pool }) }); });
  after(async () => { await s.close(); });

  test('POST stores it, bound not spliced', async () => {
    const r = await s.request('POST', '/api/tasks', { title: 'Send the quote', due_date: '2026-10-08', due_time: '14:00' });
    assert.equal(r.status, 201);
    const ins = calls.find(c => /INSERT INTO tasks/.test(c.sql));
    assert.match(ins.sql, /due_time/);
    assert.ok(ins.params.includes('14:00'));
  });
  test('POST without one stores null', async () => {
    calls.length = 0;
    await s.request('POST', '/api/tasks', { title: 'No time' });
    const ins = calls.find(c => /INSERT INTO tasks/.test(c.sql));
    assert.ok(ins.params.includes(null));
  });
  test('PUT updates it, and can clear it', async () => {
    calls.length = 0;
    await s.request('PUT', '/api/tasks/4', { title: 'Send the quote', due_date: '2026-10-08', due_time: '14:00' });
    const up = calls.find(c => /UPDATE tasks/.test(c.sql));
    assert.match(up.sql, /due_time\s*=/);
    assert.ok(up.params.includes('14:00'));
    calls.length = 0;
    await s.request('PUT', '/api/tasks/4', { title: 'Send the quote', due_time: null });
    assert.ok(calls.find(c => /UPDATE tasks/.test(c.sql)).params.includes(null));
  });
  test('the reads hand it back as HH:MM, not a full time', async () => {
    calls.length = 0;
    await s.request('GET', '/api/tasks');
    assert.match(calls[0].sql, /TO_CHAR\(t\.due_time, 'HH24:MI'\)\s+AS due_time/);
    calls.length = 0;
    await s.request('GET', '/api/tasks/4');
    assert.match(calls[0].sql, /TO_CHAR\(t\.due_time, 'HH24:MI'\)\s+AS due_time/);
  });
});

describe('the calendar feed uses it', () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  let s;
  before(async () => { s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool }) }); });
  after(async () => { await s.close(); });

  test("a task's time is its calendar time, so a timed task is no longer all-day", async () => {
    await s.request('GET', '/api/calendar?start=2026-10-01&end=2026-10-31');
    assert.match(calls[0].sql, /TO_CHAR\(t\.due_time, 'HH24:MI'\)\s+AS event_time/);
    assert.doesNotMatch(calls[0].sql, /NULL\s+AS event_time/);
  });
  test('both halves still carry the long text, which the detail view shows', async () => {
    const q = calls[0].sql;
    assert.match(q, /a\.content\s+AS content/, 'aliasing content as title had left the activity detail empty');
    assert.match(q, /t\.description\s+AS content/);
  });
});
