// ROUTE tests for PATCH /api/workspace/onboarding-trigger — the owner picks
// the pipeline stages that make the UI ask "start onboarding?". Owner-only,
// integers only, and every id must be a stage of THIS workspace.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWN_STAGES = new Set([30, 31, 32]);   // pipeline_stages of workspace 7; 40 belongs to workspace 8
let pool, owner, member;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT id FROM pipeline_stages WHERE workspace_id=\$1 AND id = ANY\(\$2::int\[\]\)/, reply: p => ({ rows: p[0] === 7 ? p[1].filter(id => OWN_STAGES.has(id)).map(id => ({ id })) : [] }) },
    { match: /^UPDATE workspaces SET onboarding_trigger_stage_ids=\$1 WHERE id=\$2/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  owner  = await serve({ '/api/workspace': loadRoute('workspace.js', { pool }) });
  member = await serve({ '/api/workspace': loadRoute('workspace.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => { await owner.close(); await member.close(); });
beforeEach(() => pool.reset());
const put = (srv, body) => srv.request('PATCH', '/api/workspace/onboarding-trigger', body);

describe('PATCH /api/workspace/onboarding-trigger', () => {
  test('member -> 403, no query', async () => {
    assert.equal((await put(member, { stage_ids: [30] })).status, 403);
    assert.equal(pool.log.length, 0);
  });
  test('not an array / non-integer / negative -> 400, no query', async () => {
    for (const body of [{}, { stage_ids: 'x' }, { stage_ids: ['30'] }, { stage_ids: [1.5] }, { stage_ids: [0] }, { stage_ids: [-3] }]) {
      assert.equal((await put(owner, body)).status, 400, JSON.stringify(body));
    }
    assert.equal(pool.log.length, 0);
  });
  test("a stage of another workspace -> 400 and no UPDATE (lookup bound to this workspace)", async () => {
    const r = await put(owner, { stage_ids: [30, 40] });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /another workspace/);
    assert.deepEqual(pool.find(/^SELECT id FROM pipeline_stages/).params, [7, [30, 40]]);
    assert.equal(pool.some(/^UPDATE/), false);
  });
  test('own stages -> 200, duplicates removed, sorted, UPDATE binds the JSON array and the workspace', async () => {
    const r = await put(owner, { stage_ids: [32, 30, 32] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, stage_ids: [30, 32] });
    assert.deepEqual(pool.find(/^UPDATE workspaces SET onboarding_trigger_stage_ids/).params, ['[30,32]', 7]);
  });
  test('an empty list switches the prompt off without a lookup', async () => {
    const r = await put(owner, { stage_ids: [] });
    assert.deepEqual(r.body, { success: true, stage_ids: [] });
    assert.equal(pool.some(/^SELECT/), false);
    assert.deepEqual(pool.find(/^UPDATE workspaces/).params, ['[]', 7]);
  });
});
