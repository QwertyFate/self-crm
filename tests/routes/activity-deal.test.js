// ROUTE tests: a note can be BOUND to one deal, and the list can be narrowed
// to one deal or one contact.
//
// An activity hangs off a contact; activities.deal_id records the deal it was
// composed on (NULL = a contact-level note: logged from the contact page, or
// older than the column). Two optional, independent filters on GET /:
//
//   ?deal_id=N     "this deal's notes": bound to N, PLUS the contact-level
//                  notes (NULL deal) of N's contact — a note about the person
//                  belongs with every deal of theirs. What it hides is only the
//                  notes bound to the contact's OTHER deals.
//   ?contact_id=N  everything on that contact, whichever deal (or none) each
//                  note was logged on — the deal detail's DEFAULT view, "all
//                  together", with each row labelled by its bound deal
// Display prefers the bound deal and falls back to the derived one.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

describe('db.js: activities.deal_id', () => {
  const db = read('db.js');
  test('additive, nullable, and the deal\'s deletion unbinds rather than deletes the note', () => {
    assert.match(db, /ALTER TABLE activities ADD COLUMN IF NOT EXISTS deal_id\s+INTEGER REFERENCES deals\(id\) ON DELETE SET NULL/);
    // scoped to THIS column — deal_objects legitimately has a NOT NULL deal_id
    assert.doesNotMatch(db, /ALTER TABLE activities ADD COLUMN IF NOT EXISTS deal_id\s+INTEGER NOT NULL/);
  });
});

function recording(answer = () => null) {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); const r = answer(sql, params); if (r) return r; if (/INSERT INTO/.test(sql)) return { rows: [{ id: 9 }] }; return { rows: [] }; } };
  return { pool, calls };
}
const find = (calls, re) => calls.find(c => re.test(c.sql));

describe('POST /api/activities binds a deal', () => {
  test('with deal_id: the deal is verified IN THIS WORKSPACE, then bound', async () => {
    const r = recording(sql => /SELECT contact_id FROM deals/.test(sql) ? { rows: [{ contact_id: 42 }] } : null);
    const s = await serve({ '/api/activities': loadRoute('activities.js', { pool: r.pool }) });
    try {
      const res = await s.request('POST', '/api/activities', { type: 'note', content: 'On the deal', deal_id: 5, contact_id: 42 });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const chk = find(r.calls, /SELECT contact_id FROM deals WHERE id=\$1 AND workspace_id=\$2/);
      assert.ok(chk, 'tenancy check on the deal'); assert.deepEqual(chk.params, [5, 7]);
      const ins = find(r.calls, /INSERT INTO activities/);
      assert.match(ins.sql, /deal_id/); assert.ok(ins.params.includes(5));
    } finally { await s.close(); }
  });
  test('a deal from another workspace is refused and nothing is written', async () => {
    const r = recording(sql => /SELECT contact_id FROM deals/.test(sql) ? { rows: [] } : null);
    const s = await serve({ '/api/activities': loadRoute('activities.js', { pool: r.pool }) });
    try {
      const res = await s.request('POST', '/api/activities', { type: 'note', content: 'x', deal_id: 999 });
      assert.equal(res.status, 400);
      assert.ok(!find(r.calls, /INSERT INTO activities/));
    } finally { await s.close(); }
  });
  test('with a deal and no contact, the contact is derived from the deal', async () => {
    const r = recording(sql => /SELECT contact_id FROM deals/.test(sql) ? { rows: [{ contact_id: 42 }] } : null);
    const s = await serve({ '/api/activities': loadRoute('activities.js', { pool: r.pool }) });
    try {
      await s.request('POST', '/api/activities', { type: 'call', content: 'x', deal_id: 5 });
      const ins = find(r.calls, /INSERT INTO activities/);
      assert.ok(ins.params.includes(42), 'contact_id taken from the deal'); assert.ok(ins.params.includes(5));
    } finally { await s.close(); }
  });
  test('without deal_id a note is stored unbound (NULL) — the contact-level note, as before', async () => {
    const r = recording();
    const s = await serve({ '/api/activities': loadRoute('activities.js', { pool: r.pool }) });
    try {
      const res = await s.request('POST', '/api/activities', { type: 'note', content: 'contact note', contact_id: 42 });
      assert.equal(res.status, 201);
      assert.ok(!find(r.calls, /SELECT contact_id FROM deals/), 'no deal check when no deal');
      const ins = find(r.calls, /INSERT INTO activities/);
      assert.match(ins.sql, /deal_id/); assert.ok(ins.params.includes(null));
    } finally { await s.close(); }
  });
});

describe('GET /api/activities: the bound deal, the fallback, and the two filters', () => {
  let s, calls;
  before(async () => { const r = recording(); calls = r.calls; s = await serve({ '/api/activities': loadRoute('activities.js', { pool: r.pool }) }); });
  after(async () => { await s.close(); });
  const stmt = () => find(calls, /FROM activities a/);

  test('each row carries bound_deal_id, and deal_id/deal_title prefer the bound deal over the derived one', async () => {
    calls.length = 0;
    await s.request('GET', '/api/activities');
    const q = stmt().sql;
    assert.match(q, /a\.deal_id AS bound_deal_id/);
    assert.match(q, /COALESCE\(db\.id, d\.id\) AS deal_id, COALESCE\(db\.title, d\.title\) AS deal_title/);
    assert.match(q, /LEFT JOIN deals db ON db\.id = a\.deal_id/);
    assert.match(q, /LEFT JOIN LATERAL/, 'the derived fallback is still there for unbound notes');
  });
  test('the two filters are independent and both optional', async () => {
    calls.length = 0;
    await s.request('GET', '/api/activities');
    assert.match(stmt().sql, /AND \(\$2::int IS NULL OR a\.deal_id = \$2 OR \(a\.deal_id IS NULL AND a\.contact_id = \(SELECT contact_id FROM deals WHERE id = \$2 AND workspace_id = \$1\)\)\)\s+AND \(\$3::int IS NULL OR a\.contact_id = \$3\)/);
    assert.deepEqual(stmt().params, [7, null, null], 'no filter: nothing bound, everything in the workspace');
  });
  test('?deal_id=5 is "this deal\'s notes": bound to 5, PLUS the contact-level notes of 5\'s contact', async () => {
    calls.length = 0;
    const res = await s.request('GET', '/api/activities?deal_id=5');
    assert.equal(res.status, 200);
    assert.deepEqual(stmt().params, [7, 5, null]);
    assert.match(stmt().sql, /a\.deal_id = \$2 OR \(a\.deal_id IS NULL AND a\.contact_id = \(SELECT contact_id FROM deals WHERE id = \$2 AND workspace_id = \$1\)\)/,
      'a note about the person belongs with every deal of theirs; only notes bound to OTHER deals are excluded');
  });
  test('?contact_id=42 is the whole history: every note on that contact, bound anywhere or not', async () => {
    calls.length = 0;
    const res = await s.request('GET', '/api/activities?contact_id=42');
    assert.equal(res.status, 200);
    assert.deepEqual(stmt().params, [7, null, 42]);
  });
  test('a non-numeric filter is a 400, not a silent "show everything"', async () => {
    for (const q of ['deal_id=abc', 'contact_id=abc']) {
      calls.length = 0;
      const res = await s.request('GET', '/api/activities?' + q);
      assert.equal(res.status, 400, q);
      assert.ok(!stmt(), 'no query ran for ' + q);
    }
  });
});

describe('the other readers prefer the bound deal too', () => {
  test('GET /api/calendar: the activity half of both unions joins the bound deal and COALESCEs', async () => {
    const r = recording();
    const s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool: r.pool }) });
    try {
      await s.request('GET', '/api/calendar?start=2026-10-01&end=2026-10-31');
      await s.request('GET', '/api/calendar/today');
      for (const c of r.calls.filter(c => /UNION ALL/.test(c.sql))) {
        assert.match(c.sql, /LEFT JOIN deals db ON db\.id = a\.deal_id/);
        assert.match(c.sql, /COALESCE\(db\.id, d\.id\) AS deal_id, COALESCE\(db\.title, d\.title\) AS deal_title/);
      }
      assert.equal(r.calls.filter(c => /UNION ALL/.test(c.sql)).length, 2);
    } finally { await s.close(); }
  });
  test('GET /api/contacts/:id: the contact timeline knows which deal each bound note belongs to', async () => {
    const r = recording(sql => /WHERE c\.id = \$1 AND c\.workspace_id = \$2/.test(sql) ? { rows: [{ id: 42, name: 'Anna' }] } : null);
    const s = await serve({ '/api/contacts': loadRoute('contacts.js', { pool: r.pool }) });
    try {
      await s.request('GET', '/api/contacts/42');
      const q = find(r.calls, /FROM activities a/)?.sql;
      assert.ok(q, 'the contact route loads its activities');
      assert.match(q, /a\.deal_id/); assert.match(q, /db\.title AS deal_title/); assert.match(q, /LEFT JOIN deals db ON db\.id = a\.deal_id/);
    } finally { await s.close(); }
  });
});
