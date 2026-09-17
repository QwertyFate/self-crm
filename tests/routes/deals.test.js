// ROUTE tests for routes/deals.js — the real router, over real HTTP, against
// a fake pool. Fixture: workspace 7 owns contact 10, pipeline 20, stage 30,
// user 1; workspace 8 owns 11, 21, 31, 2. The caller is user 1 in workspace 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWN = { contacts: [10], pipelines: [20], stages: [30], users: [1] };
const LIST_ROW = { id: 5, workspace_id: 7, contact_id: 10, supplier_id: null, pipeline_id: 20, stage_id: 30, title: 'T', value: null, assigned_to: 1, urgency: 0, custom_data: {}, created_at: 'x', updated_at: 'x', contact_name: 'A', contact_email: 'a@x', contact_phone: '1', supplier_name_val: null, stage_name: 'S', stage_color: '#000', assigned_to_name: 'U' };
const OWN_BODY = { title: 'T', contact_id: 10, supplier_id: 10, pipeline_id: 20, stage_id: 30, assigned_to: 1 };

let pool, server;
before(async () => {
  pool = createFakePool([
    // the ownership lookup: answer with the ids that really belong to workspace 7
    { match: /FROM contacts WHERE workspace_id=\$1 AND id = ANY/, reply: p => {
        if (p[0] !== 7) return { rows: [] };
        const rows = [];
        p[1].forEach(id => OWN.contacts.includes(id)  && rows.push({ kind: 'contact',  id }));
        p[2].forEach(id => OWN.pipelines.includes(id) && rows.push({ kind: 'pipeline', id }));
        p[3].forEach(id => OWN.stages.includes(id)    && rows.push({ kind: 'stage',    id }));
        p[4].forEach(id => OWN.users.includes(id)     && rows.push({ kind: 'user',     id }));
        return { rows };
      } },
    { match: /^INSERT INTO deals/,      reply: () => ({ rows: [{ id: 99 }], rowCount: 1 }) },
    { match: /^UPDATE deals SET/,       reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /SELECT title FROM deals/, reply: () => ({ rows: [{ title: 'T' }] }) },
    { match: /FROM deal_objects/,       reply: () => ({ rows: [] }) },
    { match: /FROM deals d/,            reply: () => ({ rows: [LIST_ROW] }) },
  ]);
  server = await serve({ '/api/deals': loadRoute('deals.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

const writes = () => pool.filter(/^(INSERT INTO deals|UPDATE deals SET)/);
const scopedAliases = sql => ['c', 's', 'ps', 'u'].filter(a => sql.includes(`${a}.workspace_id = d.workspace_id`));

describe("read side: every join is scoped to the deal's workspace", () => {
  test('GET /', async () => {
    const r = await server.request('GET', '/api/deals');
    assert.equal(r.status, 200);
    assert.deepEqual(scopedAliases(pool.find(/FROM deals d/).sql), ['c', 's', 'ps', 'u']);
  });
  test('GET /:id', async () => {
    const r = await server.request('GET', '/api/deals/5');
    assert.equal(r.status, 200);
    assert.deepEqual(scopedAliases(pool.find(/FROM deals d/).sql), ['c', 's', 'ps', 'u']);
    assert.ok(Array.isArray(r.body.objects));
  });
});

describe('write side: a foreign id is rejected before anything is written', () => {
  for (const [method, url, body, field] of [
    ['POST',  '/api/deals',         { ...OWN_BODY, contact_id: 11 },  'contact_id'],
    ['POST',  '/api/deals',         { ...OWN_BODY, supplier_id: 11 }, 'supplier_id'],
    ['POST',  '/api/deals',         { ...OWN_BODY, pipeline_id: 21 }, 'pipeline_id'],
    ['POST',  '/api/deals',         { ...OWN_BODY, stage_id: 31 },    'stage_id'],
    ['POST',  '/api/deals',         { ...OWN_BODY, assigned_to: 2 },  'assigned_to'],
    ['PUT',   '/api/deals/5',       { ...OWN_BODY, contact_id: 11 },  'contact_id'],
    ['PATCH', '/api/deals/5/stage', { stage_id: 31 },                 'stage_id'],
  ]) {
    test(`${method} ${url} with foreign ${field} -> 400, no write`, async () => {
      const r = await server.request(method, url, body);
      assert.equal(r.status, 400);
      assert.match(r.body.error, new RegExp(`^${field}`));
      assert.equal(writes().length, 0);
    });
  }
});

describe('own ids: accepted, and the writes are identical to before the fix', () => {
  test('POST binds the same 10 parameters in the same order', async () => {
    const r = await server.request('POST', '/api/deals', OWN_BODY);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 99 });
    assert.deepEqual(pool.find(/^INSERT INTO deals/).params, [7, 10, 10, 20, 30, 'T', null, 1, 0, '{}']);
  });
  test('PUT binds the same 11 parameters', async () => {
    const r = await server.request('PUT', '/api/deals/5', OWN_BODY);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    assert.deepEqual(pool.find(/^UPDATE deals SET/).params, [10, 10, 20, 30, 'T', null, 1, 0, '{}', '5', 7]);
  });
  test('omitted ids are not validated, still written as null, and the lookup binds only what was sent', async () => {
    const r = await server.request('POST', '/api/deals', { title: 'T', pipeline_id: 20 });
    assert.equal(r.status, 201);
    assert.deepEqual(pool.find(/^INSERT INTO deals/).params, [7, null, null, 20, null, 'T', null, 1, 0, '{}']);
    assert.deepEqual(pool.find(/id = ANY/).params, [7, [], [20], [], []]);
  });
  test('no lookup at all when no id is supplied', async () => {
    const r = await server.request('PATCH', '/api/deals/5/stage', { stage_id: null });
    assert.equal(r.status, 200);
    assert.equal(pool.some(/id = ANY/), false);
  });
});
