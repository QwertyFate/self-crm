// ROUTE tests for DELETE /api/pipelines/:id (PIPELINE_DELETE_CHANGES, 2026-11-24): a pipeline is deleted only while
// no deal is in it. Until then the route deleted the pipeline with every deal in it (deals.pipeline_id is ON DELETE
// CASCADE); now it counts first, with the pipeline's row held, and refuses.
//
// The real route on a throwaway server; the database is a stand-in with a connect() of its own, so the test sees the
// transaction: what is asked, in which order, on which connection. That the held row really keeps a deal made in
// the same moment from being deleted is shown on a real Postgres (the log names the harness).
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const state = { pipelines: [], deals: [], seq: [], broken: null };
const run = where => async (sql, p) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.seq.push([where, t, p]);
  if (state.broken && state.broken(t)) throw new Error('the database is away');
  if (where === 'pool') throw new Error(`the pool itself is asked nothing: ${t}`);
  if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] };
  if (t === 'SELECT id FROM pipelines WHERE id=$1 AND workspace_id=$2 FOR UPDATE') return { rows: state.pipelines.filter(x => x.id === p[0] && x.workspace_id === p[1]).map(x => ({ id: x.id })) };
  if (t === 'SELECT COUNT(*)::int AS n FROM deals WHERE pipeline_id=$1') return { rows: [{ n: state.deals.filter(d => d.pipeline_id === p[0]).length }] };
  if (t === 'DELETE FROM pipelines WHERE id=$1 AND workspace_id=$2') { state.pipelines = state.pipelines.filter(x => !(x.id === p[0] && x.workspace_id === p[1])); return { rows: [], rowCount: 1 }; }
  throw new Error(`a statement nobody expected: ${t}`);
};
const pool = { query: run('pool'), connect: async () => { state.seq.push(['connect']); return { query: run('client'), release: () => state.seq.push(['release']) }; } };
const steps = () => state.seq.map(s => (s[0] === 'client' ? s[1].split(' ').slice(0, 4).join(' ') : s[0]));
const del = async (id, user) => { const server = await serve({ '/api/pipelines': loadRoute('pipelines.js', { pool, user }) }); try { return await server.request('DELETE', `/api/pipelines/${id}`); } finally { await server.close(); } };
beforeEach(() => Object.assign(state, { seq: [], broken: null, pipelines: [{ id: 3, workspace_id: 7 }, { id: 4, workspace_id: 7 }, { id: 9, workspace_id: 8 }], deals: [{ id: 1, pipeline_id: 4 }, { id: 2, pipeline_id: 4 }, { id: 5, pipeline_id: 9 }] }));

describe('DELETE /api/pipelines/:id: only an empty pipeline is deleted', () => {
  test('no deal in it: deleted — held, counted, deleted, committed, on one connection that is given back', async () => {
    const r = await del(3);
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    assert.deepEqual(state.pipelines.map(p => p.id), [4, 9]);
    assert.deepEqual(steps(), ['connect', 'BEGIN', 'SELECT id FROM pipelines', 'SELECT COUNT(*)::int AS n', 'DELETE FROM pipelines WHERE', 'COMMIT', 'release']);
    assert.deepEqual(state.seq.filter(s => s[0] === 'client' && s[2]).map(s => s[2]), [[3, 7], [3], [3, 7]], 'the pipeline as a number, and always with the workspace of who asks');
  });
  test('deals in it: refused with how many, and nothing is deleted — not the pipeline, not a deal', async () => {
    const r = await del(4);
    assert.deepEqual([r.status, r.body], [409, { error: 'This pipeline still has 2 deals. Move or delete them first.', code: 'has_deals', deals: 2 }]);
    assert.deepEqual([state.pipelines.length, state.deals.length], [3, 3]);
    assert.deepEqual(steps(), ['connect', 'BEGIN', 'SELECT id FROM pipelines', 'SELECT COUNT(*)::int AS n', 'ROLLBACK', 'release']);
    assert.equal(state.seq.some(s => /^DELETE/.test(s[1] || '')), false, 'no DELETE is asked at all');
    state.deals = [{ id: 1, pipeline_id: 4 }]; state.seq = [];
    assert.equal((await del(4)).body.error, 'This pipeline still has 1 deal. Move or delete them first.');
  });
  test('another workspace\'s pipeline is not there: 404, its deals are not even counted', async () => {
    const r = await del(9);
    assert.deepEqual([r.status, r.body, state.pipelines.length], [404, { error: 'Not found' }, 3]);
    assert.deepEqual(steps(), ['connect', 'BEGIN', 'SELECT id FROM pipelines', 'ROLLBACK', 'release']);
    assert.equal((await del(9, { id: 2, workspaceId: 8, role: 'owner' })).status, 409, 'its own workspace is told about its deal');
  });
  test('what is no id never reaches the database', async () => {
    for (const id of ['abc', '0', '-3', '1.5', '3;DROP', '99999999999', '%20']) {
      state.seq = [];
      assert.deepEqual([(await del(id)).status, state.seq.length], [404, 0], id);
    }
  });
  test('the database away: rolled back, the connection given back, the pipeline still there', async () => {
    const realError = console.error; console.error = () => {};
    try {
      state.broken = t => /^SELECT COUNT/.test(t);
      assert.equal((await del(3)).status, 500);
      assert.deepEqual([steps().slice(-2), state.pipelines.length], [['ROLLBACK', 'release'], 3]);
      state.seq = []; state.broken = t => /^DELETE/.test(t);
      assert.equal((await del(3)).status, 500);
      assert.deepEqual(steps().slice(-2), ['ROLLBACK', 'release']);
    } finally { console.error = realError; }
  });
});

describe('the settings screen and its words', () => {
  const settings = read('public/js/settings.js'), core = read('public/js/core.js');
  test('the question no longer promises to delete deals, in either language', () => {
    assert.doesNotMatch(core, /Delete this pipeline and all its deals|Diese Pipeline und alle ihre Deals löschen/);
    for (const key of ['stg_delete_pipeline_confirm', 'stg_pipeline_has_deal', 'stg_pipeline_has_deals', 'stg_pipeline_not_deleted']) assert.equal((core.match(new RegExp(`\\b${key}:'`, 'g')) || []).length, 2, `${key} in English and in German`);
    assert.match(core, /stg_pipeline_has_deals:'This pipeline still has \{n\} deals\. Move or delete them first\.'/);
    assert.match(core, /stg_pipeline_has_deals:'In dieser Pipeline liegen noch \{n\} Deals\. Erst verschieben oder löschen\.'/);
  });
  test('a refusal keeps the pipeline in the list and says how many deals are in it', () => {
    const fn = settings.slice(settings.indexOf('async function deletePipeline(id) {'), settings.indexOf('async function addPipelineStage('));
    assert.ok(fn.indexOf('res?.code === \'has_deals\'') < fn.indexOf('pipelines = pipelines.filter('), 'refused: the list is not touched');
    assert.match(fn, /if \(res\?\.code === 'has_deals'\) \{ alert\(Number\(res\.deals\) === 1 \? t\('stg_pipeline_has_deal'\) : tf\('stg_pipeline_has_deals', \{ n: Number\(res\.deals\) \|\| 0 \}\)\); return; \}/);
    assert.match(fn, /if \(!res \|\| res\.error\) \{ alert\(t\('stg_pipeline_not_deleted'\)\); return; \}/);
  });
});
