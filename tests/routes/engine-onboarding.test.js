// ROUTE tests for the Onboarding monitor data: GET /api/engine/status (every
// member, never creates the settings row) and GET /api/engine/onboarding
// (owners/admins): trigger-stage resolution per pipeline, the in_trigger flag,
// the latest vertrag.unterschrieben delivery, workspace scoping in the SQL.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const state = { engine: null };
// Trigger stages: pipeline 1 has two ticked (ids 5 at position 4 and 4 at position 3), pipeline 2 has none.
const TRIGGER_STAGES = [{ id: 4, pipeline_id: 1, name: 'Won' }, { id: 5, pipeline_id: 1, name: 'Contract Signed' }];   // already ordered by (pipeline_id, position)
const ROWS = [
  { deal_id: 17, deal_title: 'Landingpage Muster', deal_value: '2400', deal_created_at: '2026-09-20T08:00:00.000Z', pipeline_id: 1, pipeline_name: 'Sales', stage_id: 5, stage_name: 'Contract Signed', stage_color: '#22a',
    contact_id: 60, contact_name: 'Erika Muster', contact_company: 'Muster GmbH', onboarding_status: 'termin_gebucht', drive_ordner_id: '1AbC', akte_version: 3, status_since: '2026-10-01T10:00:00.000Z',
    delivery_id: 9, delivery_status: 'success', delivery_attempts: 1, delivery_status_code: 200, delivery_error: null, delivery_created_at: '2026-09-21T09:00:00.000Z', delivery_delivered_at: '2026-09-21T09:00:01.000Z' },
  { deal_id: 18, deal_title: 'Neuer Lead', deal_value: null, deal_created_at: '2026-10-05T08:00:00.000Z', pipeline_id: 1, pipeline_name: 'Sales', stage_id: 2, stage_name: 'Proposal', stage_color: '#fa0',
    contact_id: 61, contact_name: 'Max Beispiel', contact_company: null, onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, status_since: '2026-10-05T08:00:00.000Z',
    delivery_id: null, delivery_status: null, delivery_attempts: null, delivery_status_code: null, delivery_error: null, delivery_created_at: null, delivery_delivered_at: null },
  { deal_id: 19, deal_title: 'Ohne Kontakt', deal_value: null, deal_created_at: '2026-10-06T08:00:00.000Z', pipeline_id: 2, pipeline_name: 'Partner', stage_id: 9, stage_name: 'New', stage_color: '#888',
    contact_id: null, contact_name: null, contact_company: null, onboarding_status: null, drive_ordner_id: null, akte_version: null, status_since: null,
    delivery_id: null, delivery_status: null, delivery_attempts: null, delivery_status_code: null, delivery_error: null, delivery_created_at: null, delivery_delivered_at: null },
];

let pool, owner, member;
before(async () => {
  pool = createFakePool([
    { match: /^SELECT \* FROM workspace_engine WHERE workspace_id=\$1/, reply: () => ({ rows: state.engine ? [state.engine] : [] }) },
    { match: /^SELECT id, pipeline_id, name FROM pipeline_stages WHERE workspace_id=\$1 AND id = ANY/, reply: p => ({ rows: TRIGGER_STAGES.filter(s => p[1].includes(s.id)) }) },
    { match: /^SELECT d\.id AS deal_id/, reply: () => ({ rows: ROWS }) },
  ]);
  owner  = await serve({ '/api/engine': loadRoute('engine.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner' } }) });
  member = await serve({ '/api/engine': loadRoute('engine.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => { await owner.close(); await member.close(); });
beforeEach(() => { pool.reset(); state.engine = { id: 1, workspace_id: 7, engine_url: 'https://engine.example/hook', active: true, trigger_stage_ids: [5, 4], webhook_secret: 's' }; });

describe('GET /api/engine/status', () => {
  test('member: active flag and can_manage=false; no settings row is created', async () => {
    const r = await member.request('GET', '/api/engine/status');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { active: true, can_manage: false });
    assert.equal(pool.some(/INSERT INTO workspace_engine/), false);
  });
  test('owner: can_manage=true', async () => {
    const r = await owner.request('GET', '/api/engine/status');
    assert.deepEqual(r.body, { active: true, can_manage: true });
  });
  test('inactive when the row is missing, switched off, or has no URL', async () => {
    state.engine = null;
    assert.equal((await owner.request('GET', '/api/engine/status')).body.active, false);
    state.engine = { active: false, engine_url: 'https://e', trigger_stage_ids: [] };
    assert.equal((await owner.request('GET', '/api/engine/status')).body.active, false);
    state.engine = { active: true, engine_url: null, trigger_stage_ids: [] };
    assert.equal((await owner.request('GET', '/api/engine/status')).body.active, false);
    assert.equal(pool.some(/INSERT INTO workspace_engine/), false);
  });
});

describe('GET /api/engine/onboarding', () => {
  test('member -> 403 and no deal query', async () => {
    const r = await member.request('GET', '/api/engine/onboarding');
    assert.equal(r.status, 403);
    assert.equal(pool.some(/FROM deals/), false);
  });
  test('owner -> active, trigger ids, and one row per deal with the derived fields', async () => {
    const r = await owner.request('GET', '/api/engine/onboarding');
    assert.equal(r.status, 200);
    assert.equal(r.body.active, true);
    assert.deepEqual(r.body.trigger_stage_ids, [5, 4]);
    assert.equal(r.body.rows.length, 3);
    const [signed, lead, orphan] = r.body.rows;

    // deal 17: in a trigger stage, delivered, Engine status set
    assert.equal(signed.deal_id, 17); assert.equal(signed.in_trigger, true);
    assert.equal(signed.onboarding_status, 'termin_gebucht'); assert.equal(signed.drive_ordner_id, '1AbC'); assert.equal(signed.akte_version, 3);
    assert.deepEqual(signed.delivery, { id: 9, status: 'success', attempts: 1, last_status_code: 200, last_error: null, created_at: '2026-09-21T09:00:00.000Z', delivered_at: '2026-09-21T09:00:01.000Z' });

    // deal 18: not in a trigger stage, nothing sent, Engine default status
    assert.equal(lead.in_trigger, false); assert.equal(lead.delivery, null); assert.equal(lead.onboarding_status, 'kein_onboarding');

    // deal 19: no contact -> status and version are null (nothing to onboard), no trigger stage in its pipeline
    assert.equal(orphan.contact_id, null); assert.equal(orphan.onboarding_status, null); assert.equal(orphan.akte_version, null);
    assert.equal(orphan.trigger_stage_id, null);
  });
  test('trigger_stage_id is the FIRST trigger stage of the deal\'s own pipeline by position (ids 5 and 4 ticked -> 4)', async () => {
    const r = await owner.request('GET', '/api/engine/onboarding');
    assert.equal(r.body.rows[0].trigger_stage_id, 4); assert.equal(r.body.rows[0].trigger_stage_name, 'Won');
    assert.equal(r.body.rows[1].trigger_stage_id, 4); assert.equal(r.body.rows[1].trigger_stage_name, 'Won');
    assert.equal(r.body.rows[2].trigger_stage_name, null);
    const q = pool.find(/FROM pipeline_stages WHERE workspace_id=\$1 AND id = ANY/);
    assert.deepEqual(q.params, [7, [5, 4]]);
    assert.match(q.sql, /ORDER BY pipeline_id, position, id/);
  });
  test('no trigger stages configured: no stage lookup, every trigger_stage_id null, in_trigger false', async () => {
    state.engine.trigger_stage_ids = [];
    const r = await owner.request('GET', '/api/engine/onboarding');
    assert.equal(pool.some(/FROM pipeline_stages/), false);
    for (const row of r.body.rows) { assert.equal(row.trigger_stage_id, null); assert.equal(row.in_trigger, false); }
  });
  test('the deal query is scoped to the workspace on every join and picks the latest vertrag.unterschrieben delivery', async () => {
    await owner.request('GET', '/api/engine/onboarding');
    const q = pool.find(/^SELECT d\.id AS deal_id/);
    assert.deepEqual(q.params, [7]);
    assert.match(q.sql, /WHERE d\.workspace_id = \$1/);
    assert.match(q.sql, /JOIN pipelines p ON p\.id = d\.pipeline_id AND p\.workspace_id = d\.workspace_id/);
    assert.match(q.sql, /LEFT JOIN pipeline_stages ps ON ps\.id = d\.stage_id AND ps\.workspace_id = d\.workspace_id/);
    assert.match(q.sql, /LEFT JOIN contacts c ON c\.id = d\.contact_id AND c\.workspace_id = d\.workspace_id/);
    assert.match(q.sql, /e\.deal_id = d\.id AND e\.workspace_id = d\.workspace_id AND e\.event = 'vertrag\.unterschrieben' ORDER BY e\.created_at DESC LIMIT 1/);
  });
  test('works (empty, inactive) when the settings row does not exist yet, without creating it', async () => {
    state.engine = null;
    const r = await owner.request('GET', '/api/engine/onboarding');
    assert.equal(r.status, 200);
    assert.equal(r.body.active, false);
    assert.deepEqual(r.body.trigger_stage_ids, []);
    assert.equal(r.body.rows.length, 3);
    assert.equal(pool.some(/INSERT INTO workspace_engine/), false);
  });
});
