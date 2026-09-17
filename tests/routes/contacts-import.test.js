// ROUTE tests for the contacts import: counts come from what the database
// actually wrote, and they reconcile. The fake pool simulates a contact being
// deleted between the prefetch and the write (ids in `db.deleted` are returned
// by the prefetch but match nothing in the batch UPDATE) — exactly the
// READ COMMITTED window the real database has.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const db = { existing: new Map(), deleted: new Set(), insertShort: 0, nextId: 1000 };
const reset = o => Object.assign(db, { existing: new Map(), deleted: new Set(), insertShort: 0, nextId: 1000 }, o);
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/,        reply: () => ({ rows: [], rowCount: 0 }) },
    { match: /SELECT 'stage' AS kind/,                    reply: () => ({ rows: [{ kind: 'user', id: 1 }] }) },
    { match: /SELECT id FROM pipelines WHERE id=\$1/,     reply: p => ({ rows: [{ id: Number(p[0]) }] }) },
    { match: /pipeline_stages WHERE id=\$1 AND pipeline_id/, reply: p => ({ rows: [{ id: Number(p[0]) }] }) },
    { match: /FROM pipeline_stages WHERE pipeline_id=\$1/, reply: () => ({ rows: [{ id: 55 }] }) },
    { match: /MAX\(position\)/,                           reply: () => ({ rows: [{ m: 0 }] }) },
    // prefetch by lower-cased email: sees every existing row (earlier snapshot)
    { match: /SELECT id, email FROM contacts WHERE workspace_id=\$1 AND LOWER\(email\) = ANY/,
      reply: p => ({ rows: p[1].filter(e => db.existing.has(e)).map(e => ({ id: db.existing.get(e), email: e })) }) },
    // legacy per-row lookup: also sees the row
    { match: /SELECT id FROM contacts WHERE workspace_id=\$1 AND LOWER\(email\)=\$2/,
      reply: p => ({ rows: db.existing.has(p[1]) ? [{ id: db.existing.get(p[1]) }] : [] }) },
    // batch UPDATE: deleted ids match nothing; RETURNING lists only the survivors
    { match: /^UPDATE contacts c SET/,
      reply: (p, sql) => { const alive = p[1].filter(id => !db.deleted.has(id)); return { rows: /RETURNING c\.id/.test(sql) ? alive.map(id => ({ id })) : [], rowCount: alive.length }; } },
    // legacy UPDATE: rowCount 0 for a deleted row
    { match: /^UPDATE contacts SET name=\$1/,             reply: p => ({ rows: [], rowCount: db.deleted.has(p[6]) ? 0 : 1 }) },
    // INSERT ... RETURNING: `insertShort` lets a test simulate fewer rows coming back than were sent
    { match: /^INSERT INTO contacts/,
      reply: p => { const n = Math.max(0, (Array.isArray(p[1]) ? p[1].length : 1) - db.insertShort); return { rows: Array.from({ length: n }, () => ({ id: db.nextId++ })), rowCount: n }; } },
    { match: /^INSERT INTO deals/,                        reply: p => ({ rows: [], rowCount: Array.isArray(p[3]) ? p[3].length : 1 }) },
  ]);
  server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); reset(); });

const imp = body => server.request('POST', '/api/contacts/import', body);
const dealIds = () => (pool.find(/^INSERT INTO deals .* SELECT/)?.params[3] || []).slice().sort();

// The two identities every response must satisfy.
function assertIdentities(body, submitted) {
  assert.equal(submitted, body.imported + body.skipped + body.unmatched, `submitted = imported + skipped + unmatched (${JSON.stringify(body)})`);
  assert.equal(body.imported, body.created + body.updated, `imported = created + updated (${JSON.stringify(body)})`);
}

test('a contact deleted between prefetch and UPDATE is not imported, not handed to the deals statement, and is counted as unmatched', async () => {
  reset({ existing: new Map([['a@x.com', 500], ['b@x.com', 501]]), deleted: new Set([501]) });
  const r = await imp({ contacts: [{ name: 'A', email: 'a@x.com' }, { name: 'B', email: 'b@x.com' }], createDealsForUpdated: true, pipelineId: 9 });
  assert.equal(r.status, 201);
  assert.equal(r.body.imported, 1);
  assert.equal(r.body.unmatched, 1);
  assert.deepEqual(dealIds(), [500]);
  assertIdentities(r.body, 2);
});

test('legacy path (duplicate email in the file): UPDATE matched 0 -> not imported, no legacy deal INSERT', async () => {
  reset({ existing: new Map([['d@x.com', 500]]), deleted: new Set([500]) });
  const r = await imp({ contacts: [{ name: 'D1', email: 'd@x.com' }, { name: 'D2', email: 'd@x.com' }], createDealsForUpdated: true, pipelineId: 9 });
  assert.equal(r.body.imported, 0);
  assert.equal(r.body.deals_created, 0);
  assert.equal(pool.filter(/^INSERT INTO deals .* VALUES/).length, 0);
  assertIdentities(r.body, 2);
});

test('the insert count is what RETURNING gave back, not what was sent', async () => {
  reset({ insertShort: 1 });
  const r = await imp({ contacts: [{ name: 'n1' }, { name: 'n2' }, { name: 'n3' }] });
  assert.equal(r.body.imported, 2);
  assertIdentities(r.body, 3);
});

test('nothing deleted: 3 updates + 2 inserts -> imported 5, deals for all five, unmatched 0', async () => {
  reset({ existing: new Map([['a@x.com', 500], ['b@x.com', 501], ['c@x.com', 502]]) });
  const r = await imp({ contacts: [{ name: 'A', email: 'a@x.com' }, { name: 'B', email: 'b@x.com' }, { name: 'C', email: 'c@x.com' }, { name: 'N1' }, { name: 'N2' }], createDealsForNew: true, createDealsForUpdated: true, pipelineId: 9 });
  assert.equal(r.body.imported, 5);
  assert.equal(r.body.deals_created, 5);
  assert.deepEqual(dealIds(), [1000, 1001, 500, 501, 502]);
  assert.deepEqual(Object.keys(r.body), ['imported', 'deals_created', 'created', 'updated', 'skipped', 'unmatched']);
  assert.equal(r.body.unmatched, 0);
  assertIdentities(r.body, 5);
});

test('mixed run: 5 submitted, one deleted mid-import, one nameless -> every number accounted for', async () => {
  reset({ existing: new Map([['a@x.com', 500], ['b@x.com', 501]]), deleted: new Set([501]) });
  const r = await imp({ contacts: [{ name: 'A', email: 'a@x.com' }, { name: 'B', email: 'b@x.com' }, { name: 'N1' }, { name: 'N2' }, { email: 'noname@x.com' }] });
  assert.deepEqual({ imported: r.body.imported, created: r.body.created, updated: r.body.updated, skipped: r.body.skipped, unmatched: r.body.unmatched },
                   { imported: 3, created: 2, updated: 1, skipped: 1, unmatched: 1 });
  assertIdentities(r.body, 5);
});

test('more than 2000 rows -> 413 before any query', async () => {
  const r = await imp({ contacts: Array.from({ length: 2001 }, (_, i) => ({ name: `n${i}` })) });
  assert.equal(r.status, 413);
  assert.equal(pool.log.length, 0);
});
