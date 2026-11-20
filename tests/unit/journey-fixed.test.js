// UNIT tests for utils/journey-fixed.js (CUSTOMER_JOURNEY_CHANGES Part 8, 2026-11-19): what the integrations do,
// drawn as workflows from the integrations' own settings.
//
// Pinned: a workflow exists only while its integration is set up; whether it runs is what the integration's own
// switch says (fonio's two only while fonio itself is on, and then they say why they cannot be switched on); a step
// the settings switched off is still there, marked off; a step names ids, never a key, a token or an address; the
// switch writes the integration's own column in the caller's workspace and nothing else, and a key that is none of
// the known ones writes nothing at all.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fixed = require('../../utils/journey-fixed');
const fonioCalls = require('../../utils/fonio-calls');
const { read } = require('../helpers/client-fn');

const src = read('utils/journey-fixed.js');
const FONIO = { active: true, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true, hours_on: true, hours_days: [5, 1, 2, 3, 4], hours_from: '09:00:00', hours_to: '18:00:00',
  follow_up: { enabled: true, no_answer: 120, voicemail: 1440, busy: 30, max_attempts: 2, callback: true }, book_meetings: true, only_webhooks: null, only_pipelines: null,
  stage_rules: { 3: { interested: { stage_id: 32, urgency: 3 }, not_reached: { stage_id: null, urgency: 1 } }, 4: { meeting_booked: { stage_id: 41, urgency: null } } } };
const HOOK = { id: 5, name: 'Website form', active: true, create_deal: true, pipeline_id: 3, stage_id: 31, assignee_name: 'Olga' };
const byKey = (list, key) => list.find(f => f.key === key);
const whats = flow => flow.steps.map(s => s.what);
const stepOf = (flow, what) => flow.steps.find(s => s.what === what);

describe('which workflows there are', () => {
  test('nothing set up: none', () => {
    assert.deepEqual(fixed.compose(), []);
    assert.deepEqual(fixed.compose({ fonio: null, webhooks: [], engine: null, calcom: null, calendly: null }), []);
  });
  test('fonio first, then one per lead webhook (oldest first), the Engine, Cal.com, Calendly', () => {
    const list = fixed.compose({ fonio: FONIO, webhooks: [HOOK, { ...HOOK, id: 6, name: 'Meta Ads' }], engine: { engine_url: 'https://engine.example.de', active: true, trigger_stage_ids: [32] },
      calcom: { existing_contacts_only: false }, calendly: { existing_contacts_only: true } });
    assert.deepEqual(list.map(f => f.key), ['fonio-webhook', 'fonio-manual', 'webhook-5', 'webhook-6', 'engine', 'calcom', 'calendly']);
    assert.deepEqual(list.map(f => f.source), ['fonio', 'fonio', 'webhook', 'webhook', 'engine', 'calcom', 'calendly']);
    for (const f of list) assert.deepEqual(Object.keys(f).filter(k => k !== 'webhook_id'), ['key', 'source', 'name', 'active', 'switchable', 'blocked', 'steps'], f.key);
    assert.deepEqual(list.map(f => f.name), [null, null, 'Website form', 'Meta Ads', null, null, null], 'only a lead webhook has a name of its own');
  });
  test('every step is { what, kind, off, … } and the first one is the start', () => {
    const list = fixed.compose({ fonio: FONIO, webhooks: [HOOK], engine: { engine_url: 'https://e.example.de', active: true, trigger_stage_ids: [32] }, calcom: {}, calendly: {} });
    for (const f of list) {
      assert.equal(f.steps[0].kind, 'start', f.key);
      for (const s of f.steps) { assert.equal(typeof s.what, 'string'); assert.equal(typeof s.kind, 'string'); assert.equal(typeof s.off, 'boolean', `${f.key} ${s.what}`); }
      assert.equal(f.steps.filter(s => s.kind === 'start').length, 1, f.key);
    }
  });
});

describe('fonio', () => {
  test('two workflows, one per trigger: what starts it, the call, the calls after it, and what the result does', () => {
    const [hook, manual] = fixed.compose({ fonio: FONIO, calcom: {} });
    assert.deepEqual(whats(hook), ['lead_webhook', 'fonio_call', 'fonio_retry', 'fonio_callback', 'fonio_note', 'fonio_meeting', 'fonio_stage']);
    assert.deepEqual(whats(manual), ['deal_manual', 'fonio_call', 'fonio_retry', 'fonio_callback', 'fonio_note', 'fonio_meeting', 'fonio_stage']);
    assert.deepEqual(hook.steps.slice(1), manual.steps.slice(1), 'after the start both are the same');
    assert.deepEqual(hook.steps[0], { what: 'lead_webhook', kind: 'start', off: false, webhook_ids: null, pipeline_ids: null });
    assert.deepEqual(manual.steps[0], { what: 'deal_manual', kind: 'start', off: false, pipeline_ids: null });
    assert.deepEqual(stepOf(hook, 'fonio_call'), { what: 'fonio_call', kind: 'call', off: false, wait_minutes: 5, hours: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } });
    assert.deepEqual(stepOf(hook, 'fonio_retry'), { what: 'fonio_retry', kind: 'call', off: false, max_attempts: 2, no_answer: 120, voicemail: 1440, busy: 30 });
    assert.deepEqual(stepOf(hook, 'fonio_callback'), { what: 'fonio_callback', kind: 'call', off: false });
    assert.deepEqual(stepOf(hook, 'fonio_note'), { what: 'fonio_note', kind: 'note', off: false });
    assert.deepEqual(stepOf(hook, 'fonio_meeting'), { what: 'fonio_meeting', kind: 'meeting', off: false, service: 'calcom' });
    assert.deepEqual(stepOf(hook, 'fonio_stage'), { what: 'fonio_stage', kind: 'move', off: false, lines: 3 });
  });
  test('each runs while fonio is on and its own trigger is; its switch is that trigger', () => {
    const on = fixed.compose({ fonio: FONIO });
    assert.deepEqual(on.map(f => [f.key, f.active, f.switchable, f.blocked]), [['fonio-webhook', true, true, null], ['fonio-manual', true, true, null]]);
    const one = fixed.compose({ fonio: { ...FONIO, on_deal_manual: false } });
    assert.deepEqual(one.map(f => [f.active, f.blocked]), [[true, null], [false, null]]);
    assert.deepEqual(fixed.FONIO_SWITCHES, { 'fonio-webhook': 'on_deal_webhook', 'fonio-manual': 'on_deal_manual' });
  });
  test('fonio itself switched off: both are off, whatever their triggers say, and say why they cannot be switched on', () => {
    const off = fixed.compose({ fonio: { ...FONIO, active: false } });
    assert.deepEqual(off.map(f => [f.active, f.switchable, f.blocked]), [[false, true, 'fonio_off'], [false, true, 'fonio_off']]);
  });
  test('who gets the call rides on the start: the lead webhooks for the lead trigger only, the pipelines for both', () => {
    const [hook, manual] = fixed.compose({ fonio: { ...FONIO, only_webhooks: [6, 5, 5], only_pipelines: ['3', 4] } });
    assert.deepEqual(hook.steps[0].webhook_ids, [6, 5]);
    assert.deepEqual(hook.steps[0].pipeline_ids, [3, 4]);
    assert.deepEqual(manual.steps[0], { what: 'deal_manual', kind: 'start', off: false, pipeline_ids: [3, 4] });
  });
  test('no calling hours: the call says so; the delay is the wait', () => {
    const [hook] = fixed.compose({ fonio: { ...FONIO, hours_on: false, delay_minutes: 0 } });
    assert.deepEqual(stepOf(hook, 'fonio_call'), { what: 'fonio_call', kind: 'call', off: false, wait_minutes: 0, hours: null });
  });
  test('trying again is read as fonio\'s own code reads it: off until saved, off with no further call, the defaults for what is missing', () => {
    const retry = follow_up => stepOf(fixed.compose({ fonio: { ...FONIO, follow_up } })[0], 'fonio_retry');
    assert.equal(retry({}).off, true, 'a row from before the card');
    assert.deepEqual(retry({}), { what: 'fonio_retry', kind: 'call', off: true, max_attempts: fonioCalls.FOLLOW_UP.max_attempts, no_answer: fonioCalls.FOLLOW_UP.no_answer,
      voicemail: fonioCalls.FOLLOW_UP.voicemail, busy: fonioCalls.FOLLOW_UP.busy });
    assert.equal(retry({ enabled: true, max_attempts: 0 }).off, true, 'switched on, with no further call');
    assert.equal(retry({ enabled: true, max_attempts: 1 }).off, false);
    assert.equal(retry({ enabled: true, max_attempts: 99, no_answer: -5 }).max_attempts, fonioCalls.FOLLOW_UP.max_attempts, 'a number that cannot be is the default');
    assert.deepEqual(retry(null), retry({}), 'no settings at all');
    assert.match(src, /fonioCalls\.followUpSettings\(f\)/, 'the same reader as the worker\'s');
  });
  test('a callback is on unless switched off, and independent of trying again', () => {
    const callback = follow_up => stepOf(fixed.compose({ fonio: { ...FONIO, follow_up } })[0], 'fonio_callback').off;
    assert.equal(callback({}), false);
    assert.equal(callback({ enabled: false, callback: true }), false);
    assert.equal(callback({ enabled: true, callback: false }), true);
  });
  test('a meeting is booked at Cal.com, else at Calendly, else nowhere; with booking switched off the step is off', () => {
    const meeting = more => stepOf(fixed.compose({ fonio: FONIO, ...more })[0], 'fonio_meeting');
    assert.equal(meeting({ calcom: {} }).service, 'calcom');
    assert.equal(meeting({ calendly: {} }).service, 'calendly');
    assert.equal(meeting({ calcom: {}, calendly: {} }).service, 'calcom', 'Cal.com first, as the booking itself asks');
    assert.deepEqual(meeting({}), { what: 'fonio_meeting', kind: 'meeting', off: false, service: null });
    assert.equal(stepOf(fixed.compose({ fonio: { ...FONIO, book_meetings: false }, calcom: {} })[0], 'fonio_meeting').off, true);
  });
  test('the deal after the call: as many lines as the table holds; an empty or broken table is a step that is off', () => {
    const stage = stage_rules => stepOf(fixed.compose({ fonio: { ...FONIO, stage_rules } })[0], 'fonio_stage');
    assert.deepEqual(stage({ 3: { interested: { stage_id: 32, urgency: null } } }), { what: 'fonio_stage', kind: 'move', off: false, lines: 1 });
    for (const empty of [{}, null, undefined, [], 'x', { 3: null }, { 3: {} }]) assert.deepEqual(stage(empty), { what: 'fonio_stage', kind: 'move', off: true, lines: 0 }, JSON.stringify(empty));
  });
  test('no fonio connection: no fonio workflow', () => {
    assert.deepEqual(fixed.compose({ fonio: null, webhooks: [HOOK] }).map(f => f.source), ['webhook']);
  });
});

describe('a lead webhook', () => {
  test('a lead arrives, the contact is created, a deal is created where the webhook says', () => {
    const [flow] = fixed.compose({ webhooks: [HOOK] });
    assert.deepEqual(flow, { key: 'webhook-5', source: 'webhook', webhook_id: 5, name: 'Website form', active: true, switchable: true, blocked: null, steps: [
      { what: 'lead_arrives', kind: 'start', off: false },
      { what: 'lead_contact', kind: 'contact', off: false, assignee_name: 'Olga' },
      { what: 'lead_deal', kind: 'deal', off: false, pipeline_id: 3, stage_id: 31 },
    ] });
  });
  test('its switch is the webhook\'s own', () => {
    assert.equal(fixed.compose({ webhooks: [{ ...HOOK, active: false }] })[0].active, false);
    assert.equal(fixed.compose({ webhooks: [{ ...HOOK, active: false }] })[0].blocked, null);
  });
  test('no stage chosen: the page looks the pipeline\'s first one up; no deal wanted, or no pipeline: the step is off and names nothing', () => {
    const deal = more => stepOf(fixed.compose({ webhooks: [{ ...HOOK, ...more }] })[0], 'lead_deal');
    assert.deepEqual(deal({ stage_id: null }), { what: 'lead_deal', kind: 'deal', off: false, pipeline_id: 3, stage_id: null });
    assert.deepEqual(deal({ create_deal: false }), { what: 'lead_deal', kind: 'deal', off: true, pipeline_id: null, stage_id: null });
    assert.deepEqual(deal({ pipeline_id: null }), { what: 'lead_deal', kind: 'deal', off: true, pipeline_id: null, stage_id: null }, 'as the receiver: no pipeline, no deal');
  });
  test('nobody assigned: no name', () => {
    assert.equal(stepOf(fixed.compose({ webhooks: [{ ...HOOK, assignee_name: null }] })[0], 'lead_contact').assignee_name, null);
  });
  test('the Engine is named only while it listens: switched on, with its URL', () => {
    const has = engine => whats(fixed.compose({ webhooks: [HOOK], engine })[0]).includes('lead_engine');
    assert.equal(has({ engine_url: 'https://e.example.de', active: true, trigger_stage_ids: [] }), true);
    assert.equal(has({ engine_url: 'https://e.example.de', active: false, trigger_stage_ids: [] }), false);
    assert.equal(has({ engine_url: null, active: true, trigger_stage_ids: [] }), false);
    assert.equal(has(null), false);
    assert.deepEqual(whats(fixed.compose({ webhooks: [HOOK], engine: { engine_url: 'https://e.example.de', active: true } })[0]), ['lead_arrives', 'lead_contact', 'lead_engine', 'lead_deal']);
  });
  test('fonio\'s call is named only when fonio would make it for this webhook\'s deal', () => {
    const call = (fonio, hook = HOOK) => stepOf(fixed.compose({ fonio, webhooks: [hook] }).find(f => f.source === 'webhook'), 'lead_fonio');
    assert.deepEqual(call(FONIO), { what: 'lead_fonio', kind: 'call', off: false, wait_minutes: 5 });
    assert.equal(call({ ...FONIO, active: false }), undefined, 'fonio switched off');
    assert.equal(call({ ...FONIO, on_deal_webhook: false }), undefined, 'the lead trigger off');
    assert.equal(call({ ...FONIO, only_webhooks: [6] }), undefined, 'another lead webhook only');
    assert.ok(call({ ...FONIO, only_webhooks: [5, 6] }));
    assert.equal(call({ ...FONIO, only_pipelines: [4] }), undefined, 'another pipeline only');
    assert.ok(call({ ...FONIO, only_pipelines: [3] }));
    assert.equal(call(FONIO, { ...HOOK, create_deal: false }), undefined, 'no deal, no call');
    assert.equal(call(null), undefined);
    assert.match(src, /fonioCalls\.allowedBy\(fonio\.only_webhooks, w\.id\) && fonioCalls\.allowedBy\(fonio\.only_pipelines, w\.pipeline_id\)/, 'the lists are asked as the scheduler asks them');
    assert.equal(typeof fonioCalls.allowedBy, 'function');
  });
});

describe('the Upgrads Engine', () => {
  test('exists once it has its URL; runs while it is switched on; starts in its trigger stages', () => {
    assert.deepEqual(fixed.compose({ engine: { engine_url: 'https://engine.example.de', active: true, trigger_stage_ids: [32, '41', 32, 0, 'x'] } }), [{ key: 'engine', source: 'engine', name: null, active: true,
      switchable: true, blocked: null, steps: [{ what: 'engine_stage', kind: 'start', off: false, stage_ids: [32, 41] }, { what: 'engine_handover', kind: 'engine', off: false }] }]);
    assert.equal(fixed.compose({ engine: { engine_url: 'https://engine.example.de', active: false, trigger_stage_ids: [] } })[0].active, false);
  });
  test('without a URL it is not set up: no workflow', () => {
    assert.deepEqual(fixed.compose({ engine: { engine_url: null, active: false, trigger_stage_ids: [32] } }), []);
    assert.deepEqual(fixed.compose({ engine: { engine_url: '', active: true, trigger_stage_ids: [32] } }), []);
  });
  test('its address never rides along', () => {
    assert.doesNotMatch(JSON.stringify(fixed.compose({ engine: { engine_url: 'https://engine.example.de/hook', active: true, trigger_stage_ids: [32], webhook_secret: 'engine-secret' } })), /engine\.example|engine-secret/);
  });
});

describe('Cal.com and Calendly', () => {
  test('happen while connected: no switch, always running', () => {
    const [cal] = fixed.compose({ calcom: { existing_contacts_only: false }, webhooks: [HOOK] }).filter(f => f.source === 'calcom');
    assert.deepEqual(cal, { key: 'calcom', source: 'calcom', name: null, active: true, switchable: false, blocked: null, steps: [
      { what: 'booking_arrives', kind: 'start', off: false },
      { what: 'booking_contact', kind: 'contact', off: false, known_only: false, pipeline_id: 3, stage_id: 31 },
      { what: 'booking_entry', kind: 'meeting', off: false },
      { what: 'booking_tell', kind: 'notify', off: false },
    ] });
    const [cly] = fixed.compose({ calendly: { existing_contacts_only: false } });
    assert.deepEqual([cly.key, cly.source, cly.active, cly.switchable], ['calendly', 'calendly', true, false]);
  });
  test('an unknown guest lands where the workspace\'s FIRST lead webhook puts its deals; without one, the page says "the first pipeline"', () => {
    const contact = webhooks => stepOf(fixed.compose({ calcom: {}, webhooks }).find(f => f.key === 'calcom'), 'booking_contact');
    assert.deepEqual(contact([{ ...HOOK, id: 5, pipeline_id: 3, stage_id: null }, { ...HOOK, id: 6, pipeline_id: 4, stage_id: 41 }]), { what: 'booking_contact', kind: 'contact', off: false, known_only: false, pipeline_id: 3, stage_id: null });
    assert.deepEqual(contact([{ ...HOOK, pipeline_id: null, stage_id: 31 }]), { what: 'booking_contact', kind: 'contact', off: false, known_only: false, pipeline_id: null, stage_id: null }, 'a stage without its pipeline is not used, as in the receiver');
    assert.deepEqual(contact([]), { what: 'booking_contact', kind: 'contact', off: false, known_only: false, pipeline_id: null, stage_id: null });
  });
  test('only contacts the workspace has: said, and no pipeline named', () => {
    assert.deepEqual(stepOf(fixed.compose({ calendly: { existing_contacts_only: true }, webhooks: [HOOK] }).find(f => f.key === 'calendly'), 'booking_contact'),
      { what: 'booking_contact', kind: 'contact', off: false, known_only: true });
  });
});

// ── reading and switching, over a recording pool ─────────────────────────────
function fakePool(rows = {}, rowCount = 1) {
  const calls = [];
  return { calls, query: async (sql, params = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ sql: t, params });
    if (t.startsWith('SELECT')) { const table = t.match(/FROM (workspace_[a-z]+)/)[1]; return { rows: rows[table] || [] }; }
    return { rows: [], rowCount };
  } };
}

describe('reading', () => {
  test('five questions, each about the caller\'s workspace only; what comes back is composed', async () => {
    const pool = fakePool({ workspace_fonio: [FONIO], workspace_webhook: [HOOK], workspace_engine: [{ engine_url: 'https://e.example.de', active: true, trigger_stage_ids: [32] }], workspace_calcom: [{ existing_contacts_only: false }] });
    const list = await fixed.read(pool, 7);
    assert.deepEqual(list.map(f => f.key), ['fonio-webhook', 'fonio-manual', 'webhook-5', 'engine', 'calcom']);
    assert.deepEqual(pool.calls.map(c => c.sql.match(/FROM (workspace_[a-z]+)/)[1]), ['workspace_fonio', 'workspace_webhook', 'workspace_engine', 'workspace_calcom', 'workspace_calendly']);
    for (const c of pool.calls) { assert.deepEqual(c.params, [7], c.sql); assert.match(c.sql, /workspace_id = \$1/); assert.match(c.sql, /^SELECT/); }
  });
  test('no key, token or secret is ever read', async () => {
    const pool = fakePool();
    assert.deepEqual(await fixed.read(pool, 7), []);
    for (const c of pool.calls) assert.doesNotMatch(c.sql, /\*|webhook_key|api_key|sealed|secret|token|field_map|sample|from_number|variables|last_delivery/, c.sql);
  });
  test('an assignee is named only while that person is a member of this workspace', async () => {
    const pool = fakePool();
    await fixed.read(pool, 7);
    const sql = pool.calls.find(c => /FROM workspace_webhook/.test(c.sql)).sql;
    assert.match(sql, /LEFT JOIN users u ON u\.id = w\.default_assignee_id AND EXISTS \(SELECT 1 FROM user_workspaces uw WHERE uw\.user_id = u\.id AND uw\.workspace_id = w\.workspace_id\)/);
    assert.match(sql, /ORDER BY w\.id$/, 'oldest first: the first one is the workspace\'s first lead webhook');
  });
});

describe('the switch', () => {
  const writes = pool => pool.calls.filter(c => !c.sql.startsWith('SELECT'));
  test('a trigger of fonio\'s: its own column, in the caller\'s workspace, signed by the caller', async () => {
    for (const [key, column] of [['fonio-webhook', 'on_deal_webhook'], ['fonio-manual', 'on_deal_manual']]) {
      const pool = fakePool({ workspace_fonio: [{ active: true }] });
      assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key, active: false, userId: 2 }), { ok: true });
      assert.deepEqual(pool.calls[0], { sql: 'SELECT active FROM workspace_fonio WHERE workspace_id = $1', params: [7] });
      assert.deepEqual(writes(pool), [{ sql: `UPDATE workspace_fonio SET ${column} = $2, saved_by = $3, saved_at = NOW() WHERE workspace_id = $1 AND (active OR NOT $2)`, params: [7, false, 2] }]);
    }
  });
  test('fonio\'s main switch is never written from here', async () => {
    const pool = fakePool({ workspace_fonio: [{ active: true }] });
    await fixed.setActive(pool, { workspaceId: 7, key: 'fonio-webhook', active: true, userId: 2 });
    for (const w of writes(pool)) assert.doesNotMatch(w.sql, /SET active|, active =/);
  });
  test('fonio itself switched off: a trigger cannot be switched on (nothing written), but can be switched off', async () => {
    const on = fakePool({ workspace_fonio: [{ active: false }] });
    assert.deepEqual(await fixed.setActive(on, { workspaceId: 7, key: 'fonio-webhook', active: true, userId: 2 }), { code: 'fonio_off' });
    assert.deepEqual(writes(on), []);
    const off = fakePool({ workspace_fonio: [{ active: false }] });
    assert.deepEqual(await fixed.setActive(off, { workspaceId: 7, key: 'fonio-webhook', active: false, userId: 2 }), { ok: true });
    assert.equal(writes(off).length, 1);
  });
  test('fonio switched off between the question and the write: the statement itself switches nothing on', async () => {
    const pool = fakePool({ workspace_fonio: [{ active: true }] }, 0);
    assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key: 'fonio-manual', active: true, userId: 2 }), { code: 'fonio_off' });
  });
  test('no fonio connection: not found, nothing written', async () => {
    const pool = fakePool();
    assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key: 'fonio-webhook', active: true, userId: 2 }), { code: 'not_found' });
    assert.deepEqual(writes(pool), []);
  });
  test('a lead webhook: that webhook of this workspace; one of another workspace matches nothing', async () => {
    const pool = fakePool();
    assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key: 'webhook-5', active: false, userId: 2 }), { ok: true });
    assert.deepEqual(pool.calls, [{ sql: 'UPDATE workspace_webhook SET active = $3 WHERE id = $1 AND workspace_id = $2', params: [5, 7, false] }]);
    assert.deepEqual(await fixed.setActive(fakePool({}, 0), { workspaceId: 7, key: 'webhook-9', active: true, userId: 2 }), { code: 'not_found' });
  });
  test('the Engine: its own switch, and only while it has its URL', async () => {
    const pool = fakePool();
    assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key: 'engine', active: true, userId: 2 }), { ok: true });
    assert.deepEqual(pool.calls, [{ sql: 'UPDATE workspace_engine SET active = $2, updated_at = NOW() WHERE workspace_id = $1 AND engine_url IS NOT NULL', params: [7, true] }]);
    assert.deepEqual(await fixed.setActive(fakePool({}, 0), { workspaceId: 7, key: 'engine', active: true, userId: 2 }), { code: 'not_found' });
  });
  test('Cal.com and Calendly have no switch: nothing is asked, nothing written', async () => {
    for (const key of ['calcom', 'calendly']) {
      const pool = fakePool();
      assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key, active: false, userId: 2 }), { code: 'no_switch' });
      assert.deepEqual(pool.calls, []);
    }
  });
  test('a key that is none of them asks the database nothing — no name of an object\'s own makes a column', async () => {
    for (const key of ['', 'fonio', 'fonio-', 'webhook-', 'webhook-0', 'webhook-05', 'webhook-5x', 'webhook-5; DROP TABLE deals', 'webhook-12345678901', 'constructor', 'toString', '__proto__', 'hasOwnProperty', null, undefined, 5, {}, ['fonio-webhook']]) {
      const pool = fakePool({ workspace_fonio: [{ active: true }] });
      assert.deepEqual(await fixed.setActive(pool, { workspaceId: 7, key, active: true, userId: 2 }), { code: 'not_found' }, String(key));
      assert.deepEqual(pool.calls, [], String(key));
    }
  });
  test('the column in the statement comes from the two known names only', () => {
    assert.match(src, /Object\.hasOwn\(FONIO_SWITCHES, key\)/);
    assert.equal((src.match(/\$\{column\}/g) || []).length, 1, 'one place puts a name into a statement');
    assert.deepEqual(Object.values(fixed.FONIO_SWITCHES).sort(), ['on_deal_manual', 'on_deal_webhook']);
  });
});

describe('the utility', () => {
  test('takes the pool; it requires neither the database nor the notifications itself', () => {
    assert.doesNotMatch(src, /require\('\.\.\/db'\)|require\('\.\.\/notifications'\)/);
    assert.deepEqual(Object.keys(fixed).sort(), ['FONIO_SWITCHES', 'compose', 'read', 'setActive']);
  });
});
