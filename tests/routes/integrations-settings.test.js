// ROUTE tests for PATCH /api/integrations/settings — the pipeline, stage and
// default assignee stored here are applied to every lead the PUBLIC webhook
// receives later, so they must belong to the caller's workspace. Fixture:
// workspace 7 owns pipeline 20 (stage 30), user 1; workspace 8 owns pipeline
// 21 (stage 31), user 2. Caller is 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWN = { pipelines: [20], stages: [30], users: [1] };
const STAGE_PIPELINE = { 30: 20, 31: 21 };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /FROM contacts WHERE workspace_id=\$1 AND id = ANY/, reply: p => {   // the dealRefs lookup
        if (p[0] !== 7) return { rows: [] };
        const rows = [];
        p[2].forEach(id => OWN.pipelines.includes(id) && rows.push({ kind: 'pipeline', id }));
        p[3].forEach(id => OWN.stages.includes(id)    && rows.push({ kind: 'stage',    id }));
        p[4].forEach(id => OWN.users.includes(id)     && rows.push({ kind: 'user',     id }));
        return { rows };
      } },
    { match: /^SELECT 1 FROM pipeline_stages WHERE id=\$1 AND pipeline_id=\$2 AND workspace_id=\$3/, reply: p => ({ rows: STAGE_PIPELINE[p[0]] === p[1] && p[2] === 7 ? [{}] : [] }) },
    { match: /^UPDATE workspace_webhook/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

const patch = body => server.request('PATCH', '/api/integrations/settings', body);
const updates = () => pool.filter(/^UPDATE workspace_webhook/);

describe('foreign references are refused before anything is stored', () => {
  test("another workspace's pipeline -> 400 naming pipeline_id, no UPDATE", async () => {
    const r = await patch({ pipeline_id: 21 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /^pipeline_id/);
    assert.equal(updates().length, 0);
  });
  test("another workspace's user as default assignee -> 400 naming default_assignee_id, no UPDATE", async () => {
    const r = await patch({ default_assignee_id: 2 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /^default_assignee_id/);
    assert.equal(updates().length, 0);
  });
  test('a stage that belongs to a different pipeline -> 400, no UPDATE', async () => {
    const r = await patch({ pipeline_id: 20, stage_id: 31 });
    assert.equal(r.status, 400);
    assert.equal(updates().length, 0);
  });
});

describe('own references', () => {
  test('own pipeline, its stage and own user -> 200; the UPDATE binds all seven values', async () => {
    const r = await patch({ field_map: { name: 'n' }, create_deal: true, pipeline_id: 20, stage_id: 30, default_assignee_id: 1, active: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    assert.deepEqual(updates()[0].params, [JSON.stringify({ name: 'n' }), true, 20, 30, 1, true, 7]);
  });
  test('clearing everything (nulls) -> 200 with no ownership lookup at all', async () => {
    const r = await patch({ pipeline_id: null, stage_id: null, default_assignee_id: null, create_deal: false });
    assert.equal(r.status, 200);
    assert.equal(pool.some(/id = ANY/), false);
    assert.deepEqual(updates()[0].params.slice(2, 5), [null, null, null]);
  });
});
