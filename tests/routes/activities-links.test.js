// ROUTE test: GET /api/activities tells the Activities page which deal an
// activity belongs to, so the page can link to it.
//
// An activity hangs off a CONTACT (activities.contact_id), not a deal. "Its
// deal" is derived: the contact's most recently updated deal in this workspace.
// routes/calendar.js already derives it that way (LEFT JOIN LATERAL … ORDER BY
// deals.updated_at DESC LIMIT 1); the list endpoint must use the identical rule
// so the calendar detail and the Activities page never disagree about which
// deal a note is about.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

describe('GET /api/activities carries deal_id and deal_title', () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  let s;
  before(async () => { s = await serve({ '/api/activities': loadRoute('activities.js', { pool }) }); });
  after(async () => { await s.close(); });

  test('the list statement selects the deal through the same lateral join the calendar uses', async () => {
    calls.length = 0;
    const r = await s.request('GET', '/api/activities');
    assert.equal(r.status, 200);
    const q = calls.find(c => /FROM activities a/.test(c.sql))?.sql;
    assert.ok(q, 'no activities list statement');
    // the derived deal is now the FALLBACK behind a bound one (tests/routes/activity-deal.test.js)
    assert.match(q, /COALESCE\(db\.id, d\.id\) AS deal_id, COALESCE\(db\.title, d\.title\) AS deal_title/);
    assert.match(q, /LEFT JOIN LATERAL/);
    assert.match(q, /deals\.contact_id = a\.contact_id AND deals\.workspace_id = a\.workspace_id/, 'the deal must belong to the same contact AND the same workspace');
    assert.match(q, /ORDER BY deals\.updated_at DESC LIMIT 1/, 'the most recently touched deal — the calendar\'s rule');
  });
  test('it is still a LEFT join and still tenant-scoped: an activity with no deal is not dropped', async () => {
    calls.length = 0;
    await s.request('GET', '/api/activities');
    const q = calls.find(c => /FROM activities a/.test(c.sql)).sql;
    assert.match(q, /\) d ON true/);
    assert.match(q, /WHERE a\.workspace_id = \$1/);
    assert.match(q, /c\.name AS contact_name/, 'the contact link needs the name too');
  });
});
