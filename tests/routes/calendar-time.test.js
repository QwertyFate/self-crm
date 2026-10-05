// A scheduled activity can carry a time of day, so the Calendar's week view can
// place it on an hour grid (Part 30). The column is additive and nullable: an
// activity with a date and no time stays an all-day entry.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

describe('the event_time column', () => {
  test('db.js adds it additively, nullable, alongside event_date', () => {
    const db = read('db.js');
    assert.match(db, /ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_time TIME/);
    assert.doesNotMatch(db, /event_time TIME NOT NULL/, 'an existing activity has no time, so it must stay nullable');
  });
});

describe('GET /api/calendar carries the time and the owner', () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{
    id: 5, type: 'call', content: 'Ring back', completed: false, event_date: '2026-10-07',
    event_time: '09:30', created_by: 1, created_by_name: 'Ada', contact_name: 'Bo', contact_id: 2,
    deal_id: 3, deal_title: 'Roof job' }] }; } };
  let s;
  before(async () => { s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool }) }); });
  after(async () => { await s.close(); });

  test('the time comes back as HH:MM, not a full timestamp', async () => {
    const r = await s.request('GET', '/api/calendar?start=2026-10-01&end=2026-10-31');
    assert.equal(r.status, 200);
    const q = calls[0].sql;
    assert.match(q, /TO_CHAR\(a\.event_time, 'HH24:MI'\)\s+AS event_time/);
    assert.equal(r.body[0].event_time, '09:30');
  });
  test('and the person who scheduled it, for the Person filter', async () => {
    const q = calls[0].sql;
    assert.match(q, /a\.created_by/);
    assert.match(q, /AS created_by_name/);
  });
  test('the today feed carries them too', async () => {
    calls.length = 0;
    await s.request('GET', '/api/calendar/today');
    assert.match(calls[0].sql, /TO_CHAR\(a\.event_time, 'HH24:MI'\)\s+AS event_time/);
    assert.match(calls[0].sql, /AS created_by_name/);
  });
});

describe('writing a time through the activities route', () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/INSERT INTO activities/.test(sql)) return { rows: [{ id: 9 }] };
    if (/UPDATE activities/.test(sql))      return { rows: [{ id: 9 }], rowCount: 1 };
    return { rows: [{ name: 'Ada' }] };
  } };
  let s;
  before(async () => { s = await serve({ '/api/activities': loadRoute('activities.js', { pool }) }); });
  after(async () => { await s.close(); });

  test('POST stores the time next to the date', async () => {
    const r = await s.request('POST', '/api/activities', { type: 'call', content: 'Ring back', event_date: '2026-10-07', event_time: '09:30' });
    assert.equal(r.status, 201);
    const ins = calls.find(c => /INSERT INTO activities/.test(c.sql));
    assert.match(ins.sql, /event_time/);
    assert.ok(ins.params.includes('09:30'), 'the time is bound, never spliced');
  });
  test('POST without a time stores null, so the activity stays all-day', async () => {
    calls.length = 0;
    await s.request('POST', '/api/activities', { type: 'note', content: 'No time' });
    const ins = calls.find(c => /INSERT INTO activities/.test(c.sql));
    assert.ok(ins.params.includes(null));
  });
  test('PATCH can set a time, and clear it back to all-day', async () => {
    calls.length = 0;
    await s.request('PATCH', '/api/activities/9', { event_time: '14:00' });
    let up = calls.find(c => /UPDATE activities/.test(c.sql));
    assert.match(up.sql, /event_time\s*=/);
    assert.ok(up.params.includes('14:00'));

    calls.length = 0;
    const r = await s.request('PATCH', '/api/activities/9', { event_time: null });
    assert.equal(r.status, 200, 'a time on its own is a valid update');
    up = calls.find(c => /UPDATE activities/.test(c.sql));
    assert.match(up.sql, /event_time\s*=\s*CASE WHEN/, 'cleared explicitly, not COALESCEd back to the old value');
  });
});
