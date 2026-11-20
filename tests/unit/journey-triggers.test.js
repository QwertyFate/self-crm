// UNIT tests for utils/journey-triggers.js (CUSTOMER_JOURNEY_CHANGES Part 9, 2026-11-19): everything that can start
// a workflow — what a start is saved as, what it may name, when a change sets it off, and the moments on a clock.
//
// Pinned: a start is saved with its own settings only, each within its limits; a time of day is kept with the zone
// of who saved it, never with one that was sent; what a start names must be the workspace's own; two workflows can
// never wait for each other; a field's key is a value in every statement, never part of it; nothing from before a
// workflow was switched on starts it; a workflow that was never switched on, or whose start is none, asks nothing.
//
// What each start finds in the database is checked on a real database (the log names the run): its statements are
// joins and sub-queries a stand-in cannot answer faithfully. Here their guards are pinned.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../utils/journey-triggers');
const { read } = require('../helpers/client-fn');

const src = read('utils/journey-triggers.js');
const code = src.replace(/\/\*[\s\S]*?\*\//, '');   // without its header
const BASE = { webhook_ids: null, stage_id: null, stop_stage_ids: [] };
const ok = (raw, opts) => { const out = T.checkStart(raw, opts); assert.equal(out.code, undefined, `${JSON.stringify(raw)} → ${out.code}`); return out.config; };
const bad = (raw, code = 'start') => assert.deepEqual(T.checkStart(raw), { code }, JSON.stringify(raw));

describe('the starts there are', () => {
  test('29 of them, each in one of the seven categories', () => {
    assert.equal(Object.keys(T.TRIGGERS).length, 29);
    assert.deepEqual(T.CATEGORIES, ['deals', 'contacts', 'calls', 'meetings', 'tasks', 'time', 'other']);
    for (const [key, t] of Object.entries(T.TRIGGERS)) { assert.ok(T.CATEGORIES.includes(t.cat), key); assert.ok(Array.isArray(t.uses), key); }
    for (const cat of T.CATEGORIES) assert.ok(Object.values(T.TRIGGERS).some(t => t.cat === cat), `${cat} is not empty`);
  });
  test('a start is one of them by its own name only: nothing an object has by itself', () => {
    for (const key of Object.keys(T.TRIGGERS)) assert.equal(T.isTrigger(key), true, key);
    for (const key of ['', 'nope', 'constructor', 'toString', '__proto__', 'hasOwnProperty', null, undefined, 5, {}, ['lead']]) assert.equal(T.isTrigger(key), false, String(key));
    assert.deepEqual(T.usesOf('constructor'), []);
  });
  test('every start has a way to find its deals, and every setting a start uses is one the check knows', () => {
    const found = code.slice(code.indexOf('const FIND = {'), code.indexOf('// The deals a workflow\'s start takes in now'));
    for (const key of Object.keys(T.TRIGGERS)) assert.ok(new RegExp(`^  ${key}:`, 'm').test(found) || T.watches(key), `${key} is found by a statement or by watching`);
    const known = ['webhook_ids', 'stage_id', 'min_urgency', 'field_key', 'value', 'doc_type', 'result', 'hours', 'days', 'offset_days', 'at', 'weekdays', 'flow_id'];
    for (const [key, t] of Object.entries(T.TRIGGERS)) for (const f of t.uses) { assert.ok(known.includes(f), `${key}: ${f}`); assert.ok(code.includes(`has('${f}')`), `checkStart reads ${f}`); }
  });
});

describe('a start as it is saved', () => {
  test('nothing chosen yet is a start too', () => {
    assert.deepEqual(ok({}), { trigger: null, ...BASE });
    assert.deepEqual(ok({ trigger: null, webhook_ids: [5], stage_id: 31 }), { trigger: null, ...BASE }, 'settings without a start are left out');
  });
  test('the four fields every start has always had, and its own settings only', () => {
    assert.deepEqual(ok({ trigger: 'lead' }), { trigger: 'lead', ...BASE });
    assert.deepEqual(ok({ trigger: 'lead', webhook_ids: [6, 5, 5], stage_id: 31, hours: 5, field_key: 'x' }), { trigger: 'lead', webhook_ids: [6, 5], stage_id: null, stop_stage_ids: [] });
    assert.deepEqual(ok({ trigger: 'stage', stage_id: 31, webhook_ids: [5], stop_stage_ids: [32, 32] }), { trigger: 'stage', webhook_ids: null, stage_id: 31, stop_stage_ids: [32] });
    for (const plain of ['deal_manual', 'deal_import', 'deal_new', 'assigned', 'manual', 'call_inbound', 'meeting_booked', 'meeting_moved', 'meeting_cancelled', 'notetaker', 'task_done', 'task_overdue', 'opt_out', 'onboarding_done']) {
      assert.deepEqual(ok({ trigger: plain, stage_id: 31, hours: 3, days: 3, field_key: 'x', result: 'interested', flow_id: 2, at: '09:00' }), { trigger: plain, ...BASE }, plain);
    }
  });
  test('each start with what it needs', () => {
    assert.deepEqual(ok({ trigger: 'stage_left', stage_id: 31 }), { trigger: 'stage_left', webhook_ids: null, stage_id: 31, stop_stage_ids: [] });
    assert.deepEqual(ok({ trigger: 'urgency' }), { trigger: 'urgency', ...BASE });
    assert.deepEqual(ok({ trigger: 'urgency', min_urgency: 3 }), { trigger: 'urgency', ...BASE, min_urgency: 3 });
    assert.deepEqual(ok({ trigger: 'deal_field', field_key: 'finanzierung', value: '  Ja ' }), { trigger: 'deal_field', ...BASE, field_key: 'finanzierung', value: 'Ja' });
    assert.deepEqual(ok({ trigger: 'contact_field', field_key: 'status', value: '   ' }), { trigger: 'contact_field', ...BASE, field_key: 'status' }, 'an empty value is every change');
    assert.deepEqual(ok({ trigger: 'document' }), { trigger: 'document', ...BASE });
    assert.deepEqual(ok({ trigger: 'document', doc_type: 'vertrag' }), { trigger: 'document', ...BASE, doc_type: 'vertrag' });
    assert.deepEqual(ok({ trigger: 'call_result', result: 'not_reached' }), { trigger: 'call_result', ...BASE, result: 'not_reached' });
    assert.deepEqual(ok({ trigger: 'meeting_before', hours: 24 }), { trigger: 'meeting_before', ...BASE, hours: 24 });
    assert.deepEqual(ok({ trigger: 'meeting_after', hours: 2 }), { trigger: 'meeting_after', ...BASE, hours: 2 });
    assert.deepEqual(ok({ trigger: 'stage_days', stage_id: 31, days: 3 }), { trigger: 'stage_days', webhook_ids: null, stage_id: 31, stop_stage_ids: [], days: 3 });
    assert.deepEqual(ok({ trigger: 'quiet_days', days: 14 }), { trigger: 'quiet_days', ...BASE, days: 14 });
    assert.deepEqual(ok({ trigger: 'flow_done', flow_id: 7 }), { trigger: 'flow_done', ...BASE, flow_id: 7 });
  });
  test('any start can be limited to one pipeline; it is saved only when it is set', () => {
    assert.deepEqual(ok({ trigger: 'meeting_booked', pipeline_id: 3 }), { trigger: 'meeting_booked', ...BASE, pipeline_id: 3 });
    assert.equal('pipeline_id' in ok({ trigger: 'meeting_booked', pipeline_id: null }), false);
    for (const p of ['3', 0, -1, 1.5, [3], {}]) bad({ trigger: 'manual', pipeline_id: p }, 'pipeline');
  });
  test('a time of day is kept with the zone of who saves it — never one that was sent', () => {
    assert.deepEqual(ok({ trigger: 'date_field', field_key: 'einzug', at: '09:00', tz: 'Mars/Phobos' }, { tz: 'Europe/Vienna' }),
      { trigger: 'date_field', ...BASE, field_key: 'einzug', offset_days: 0, at: '09:00', tz: 'Europe/Vienna' });
    assert.equal(ok({ trigger: 'date_field', field_key: 'einzug', at: '23:59', offset_days: -7 }).tz, T.FALLBACK_ZONE, 'nobody\'s zone known: the default');
    assert.equal(ok({ trigger: 'date_field', field_key: 'einzug', at: '00:00', offset_days: 30 }).offset_days, 30);
    assert.deepEqual(ok({ trigger: 'schedule', stage_id: 31, weekdays: [5, 1, 5], at: '08:30' }, { tz: 'Europe/Berlin' }),
      { trigger: 'schedule', webhook_ids: null, stage_id: 31, stop_stage_ids: [], weekdays: [1, 5], at: '08:30', tz: 'Europe/Berlin' });
    assert.equal('tz' in ok({ trigger: 'stage', stage_id: 31, tz: 'Europe/Vienna' }, { tz: 'Europe/Vienna' }), false, 'a start without a time keeps no zone');
  });
  test('what is missing or cannot be is refused, with what it is', () => {
    bad(null); bad('x'); bad([]); bad({ trigger: 'nope' }); bad({ trigger: 'constructor' }); bad({ trigger: 5 });
    bad({ trigger: 'stage' }, 'stage'); bad({ trigger: 'stage', stage_id: '31' }, 'stage'); bad({ trigger: 'stage_days', days: 3 }, 'stage'); bad({ trigger: 'schedule', weekdays: [1], at: '09:00' }, 'stage');
    bad({ trigger: 'manual', stop_stage_ids: 'x' }, 'stage'); bad({ trigger: 'manual', stop_stage_ids: [0] }, 'stage');
    bad({ trigger: 'lead', webhook_ids: 'x' }, 'webhooks'); bad({ trigger: 'lead', webhook_ids: ['5'] }, 'webhooks'); bad({ trigger: 'lead', webhook_ids: Array.from({ length: 21 }, (_, i) => i + 1) }, 'webhooks');
    for (const m of [0, 5, '3', 1.5]) bad({ trigger: 'urgency', min_urgency: m });
    for (const k of [undefined, '', 'a b', 5, 'x'.repeat(121)]) bad({ trigger: 'deal_field', field_key: k }, 'field');
    bad({ trigger: 'deal_field', field_key: 'x', value: 5 }); bad({ trigger: 'deal_field', field_key: 'x', value: 'y'.repeat(T.MAX_VALUE + 1) });
    bad({ trigger: 'document', doc_type: 'rechnung' });
    bad({ trigger: 'call_result' }); bad({ trigger: 'call_result', result: 'happy' });
    for (const h of [undefined, 0, -1, 1.5, '24', T.MAX_HOURS + 1]) bad({ trigger: 'meeting_before', hours: h });
    for (const d of [undefined, 0, T.MAX_DAYS + 1, '3']) { bad({ trigger: 'quiet_days', days: d }); bad({ trigger: 'stage_days', stage_id: 31, days: d }); }
    for (const o of [1.5, '3', T.MAX_DAYS + 1, -T.MAX_DAYS - 1]) bad({ trigger: 'date_field', field_key: 'x', at: '09:00', offset_days: o });
    for (const at of [undefined, '9:00', '24:00', '09:60', 900, '09:00:00']) bad({ trigger: 'date_field', field_key: 'x', at });
    for (const w of [undefined, [], [0], [8], ['1'], 'mon']) bad({ trigger: 'schedule', stage_id: 31, at: '09:00', weekdays: w });
    for (const f of [undefined, 0, '7', -1]) bad({ trigger: 'flow_done', flow_id: f }, 'flow');
  });
});

// Part 10: where a workflow ends for a deal, saved with its start.
describe('where a workflow ends, as it is saved', () => {
  test('stages it stops in, stages it is meant for, and what else ends it — each only when it is set', () => {
    assert.deepEqual(ok({ trigger: 'manual', stop_stage_ids: [32, 31, 32] }), { trigger: 'manual', ...BASE, stop_stage_ids: [32, 31] });
    assert.deepEqual(ok({ trigger: 'manual', stay_stage_ids: [31, 32, 31] }), { trigger: 'manual', ...BASE, stay_stage_ids: [31, 32] });
    assert.deepEqual(ok({ trigger: 'manual', stop_on: ['meeting', 'opt_out', 'meeting'] }), { trigger: 'manual', ...BASE, stop_on: ['opt_out', 'meeting'] }, 'in the list\'s own order, each once');
    assert.deepEqual(ok({ trigger: 'manual', stay_stage_ids: [], stop_on: [] }), { trigger: 'manual', ...BASE });
    assert.deepEqual(ok({ trigger: 'manual', stop_stage_ids: [32], stay_stage_ids: [31, 33] }), { trigger: 'manual', ...BASE, stop_stage_ids: [32], stay_stage_ids: [31, 33] }, 'both stage rules at once');
    // Part 13: the list is utils/journey-ends.js's, handed on from here as before (its own tests: journey-ends.test.js)
    assert.equal(T.STOP_ON, require('../../utils/journey-ends').STOP_ON);
    for (const old of ['meeting', 'answered', 'opt_out']) assert.ok(T.STOP_ON.includes(old), old);
  });
  test('anything else is refused', () => {
    for (const s of ['x', [0], ['31'], [1.5], Array.from({ length: 21 }, (_, i) => i + 1)]) bad({ trigger: 'manual', stay_stage_ids: s }, 'stage');
    for (const on of ['meeting', ['reply'], ['constructor'], [5], {}]) bad({ trigger: 'manual', stop_on: on });
  });
  test('the stages a workflow is meant for must be the workspace\'s own, like the ones it stops in', async () => {
    assert.equal(await refs({ trigger: 'manual', stay_stage_ids: [31, 32] }), null);
    assert.equal(await refs({ trigger: 'manual', stay_stage_ids: [31, 91] }), 'stage');
  });
});

describe('the next moment a time of day comes', () => {
  const at = iso => new Date(iso).getTime(), iso = ms => new Date(ms).toISOString();
  test('today when it is still to come, else tomorrow — on the zone\'s clock', () => {
    assert.equal(iso(T.nextMoment(at('2026-11-19T07:00:00Z'), '09:00', 'Europe/Berlin')), '2026-11-19T08:00:00.000Z', '08:00 in Berlin → 09:00 the same day');
    assert.equal(iso(T.nextMoment(at('2026-11-19T08:00:00Z'), '09:00', 'Europe/Berlin')), '2026-11-19T08:00:00.000Z', 'at the very minute: now');
    assert.equal(iso(T.nextMoment(at('2026-11-19T09:00:00Z'), '09:00', 'Europe/Berlin')), '2026-11-20T08:00:00.000Z', '10:00 in Berlin → tomorrow');
    assert.equal(iso(T.nextMoment(at('2026-07-01T09:00:00Z'), '09:00', 'Europe/Berlin')), '2026-07-02T07:00:00.000Z', 'summer time');
  });
  test('only on the days that are named: a Friday evening waits for Monday', () => {
    assert.equal(iso(T.nextMoment(at('2026-11-20T18:00:00Z'), '09:00', 'Europe/Berlin', [1, 2, 3, 4, 5])), '2026-11-23T08:00:00.000Z');
    assert.equal(iso(T.nextMoment(at('2026-11-19T07:00:00Z'), '09:00', 'Europe/Berlin', [4])), '2026-11-19T08:00:00.000Z', 'Thursday, and it is Thursday');
    assert.equal(iso(T.nextMoment(at('2026-11-19T09:00:00Z'), '09:00', 'Europe/Berlin', [4])), '2026-11-26T08:00:00.000Z', 'the next Thursday');
    assert.equal(iso(T.nextMoment(at('2026-11-19T07:00:00Z'), '09:00', 'Europe/Berlin', [])), '2026-11-19T08:00:00.000Z', 'no day named: every day');
  });
  test('a time that is none is no moment', () => {
    for (const bad of ['9:00', '25:00', '', null, undefined, 900]) assert.equal(T.nextMoment(Date.now(), bad, 'Europe/Berlin'), null, String(bad));
    assert.equal(T.nextMoment(Date.now(), '09:00', 'Europe/Berlin', [9]), null, 'a day that is none');
  });
});

// a database that knows a few things of workspace 7
function fakeDb(flows = []) {
  const calls = [];
  const own = { pipeline_stages: [31, 32], workspace_webhook: [5, 6], pipelines: [3, 4] };
  const fields = { deal_fields: { finanzierung: 'text', einzug: 'date' }, custom_fields: { kundenstatus: 'text' } };
  return { calls, query: async (sql, p = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ sql: t, params: p });
    const ids = /^SELECT id FROM (pipeline_stages|workspace_webhook|pipelines) WHERE workspace_id = \$1 AND id = ANY\(\$2::int\[\]\)$/.exec(t);
    if (ids) return { rows: p[0] === 7 ? p[1].filter(id => own[ids[1]].includes(id)).map(id => ({ id })) : [] };
    const field = /^SELECT type FROM (deal_fields|custom_fields) WHERE workspace_id = \$1 AND field_key = \$2$/.exec(t);
    if (field) return { rows: p[0] === 7 && Object.hasOwn(fields[field[1]], p[1]) ? [{ type: fields[field[1]][p[1]] }] : [] };
    if (t === "SELECT f.id, s.config FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.workspace_id = $1") return { rows: p[0] === 7 ? flows : [] };
    throw new Error('unexpected statement: ' + t);
  } };
}
const refs = (config, flows, flowId = 1) => T.foreignRefs(fakeDb(flows), 7, flowId, { stop_stage_ids: [], ...config });

describe('what a start names must be the workspace\'s own', () => {
  test('stages, also the one it stops in; lead webhooks; the pipeline', async () => {
    assert.equal(await refs({ trigger: 'stage', stage_id: 31, stop_stage_ids: [32] }), null);
    assert.equal(await refs({ trigger: 'stage', stage_id: 91 }), 'stage');
    assert.equal(await refs({ trigger: 'manual', stop_stage_ids: [31, 91] }), 'stage');
    assert.equal(await refs({ trigger: 'lead', webhook_ids: [5, 6] }), null);
    assert.equal(await refs({ trigger: 'lead', webhook_ids: [5, 9] }), 'webhooks');
    assert.equal(await refs({ trigger: 'lead', webhook_ids: null }), null);
    assert.equal(await refs({ trigger: 'manual', pipeline_id: 4 }), null);
    assert.equal(await refs({ trigger: 'manual', pipeline_id: 90 }), 'pipeline');
  });
  test('a deal field for a deal start, a contact field for a contact start, a field that holds a date for a date start', async () => {
    assert.equal(await refs({ trigger: 'deal_field', field_key: 'finanzierung' }), null);
    assert.equal(await refs({ trigger: 'deal_field', field_key: 'kundenstatus' }), 'field');
    assert.equal(await refs({ trigger: 'contact_field', field_key: 'kundenstatus' }), null);
    assert.equal(await refs({ trigger: 'contact_field', field_key: 'finanzierung' }), 'field');
    assert.equal(await refs({ trigger: 'date_field', field_key: 'einzug' }), null);
    assert.equal(await refs({ trigger: 'date_field', field_key: 'finanzierung' }), 'field', 'not a date');
    assert.equal(await refs({ trigger: 'deal_field', field_key: 'toString' }), 'field', 'no name an object has by itself is a field');
  });
  test('the field\'s key goes to the database as a value', async () => {
    const db = fakeDb();
    await T.foreignRefs(db, 7, 1, { trigger: 'deal_field', field_key: `x' OR '1'='1`, stop_stage_ids: [] });
    const asked = db.calls.find(c => c.sql.startsWith('SELECT type FROM deal_fields'));
    assert.deepEqual(asked.params, [7, `x' OR '1'='1`]);
    assert.doesNotMatch(asked.sql, /OR '1'/);
  });
  test('another workflow: one of this workspace, not itself, and never one that waits for this one — directly or through others', async () => {
    const start = (id, config) => ({ id, config });
    const flows = [start(1, { trigger: 'manual' }), start(2, { trigger: 'manual' }), start(3, { trigger: 'flow_done', flow_id: 1 }), start(4, { trigger: 'flow_done', flow_id: 3 }), start(5, null)];
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 2 }, flows), null);
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 1 }, flows), 'flow', 'itself');
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 99 }, flows), 'flow', 'not there');
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 3 }, flows), 'loop', '3 waits for 1');
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 4 }, flows), 'loop', '4 waits for 3, which waits for 1');
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 5 }, flows), null, 'a workflow whose start is empty waits for nothing');
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 1 }, flows, 2), null, 'seen from workflow 2');
    // a circle that is already there (two workflows of before) does not hang the check
    const circle = [start(1, { trigger: 'manual' }), start(2, { trigger: 'flow_done', flow_id: 3 }), start(3, { trigger: 'flow_done', flow_id: 2 })];
    assert.equal(await refs({ trigger: 'flow_done', flow_id: 2 }, circle), null);
  });
  test('a start that names nothing asks the database nothing', async () => {
    const db = fakeDb();
    assert.equal(await T.foreignRefs(db, 7, 1, { trigger: 'meeting_booked', stop_stage_ids: [] }), null);
    assert.deepEqual(db.calls, []);
  });
});

describe('when a change sets a workflow off', () => {
  const f = T.fires;
  test('a deal leaves the stage: it was there and is not any more', () => {
    assert.equal(f('stage_left', '31', '32', { stage_id: 31 }), true);
    assert.equal(f('stage_left', '31', '0', { stage_id: 31 }), true, 'to no stage at all');
    assert.equal(f('stage_left', '32', '31', { stage_id: 31 }), false, 'arriving is not leaving');
    assert.equal(f('stage_left', '32', '33', { stage_id: 31 }), false);
  });
  test('assigned: to a person, also from one to another; not to nobody', () => {
    assert.equal(f('assigned', '0', '3'), true); assert.equal(f('assigned', '3', '4'), true); assert.equal(f('assigned', '3', '0'), false);
  });
  test('urgency: every change, or only when it rises to the level from below it', () => {
    assert.equal(f('urgency', '1', '2', {}), true); assert.equal(f('urgency', '4', '0', {}), true);
    assert.equal(f('urgency', '2', '3', { min_urgency: 3 }), true); assert.equal(f('urgency', '0', '4', { min_urgency: 3 }), true);
    assert.equal(f('urgency', '1', '2', { min_urgency: 3 }), false); assert.equal(f('urgency', '3', '4', { min_urgency: 3 }), false, 'it was there already');
    assert.equal(f('urgency', '4', '3', { min_urgency: 3 }), false); assert.equal(f('urgency', '4', '1', { min_urgency: 3 }), false);
  });
  test('a field: every change, or only when it becomes the value — whatever the capitals and the spaces around it', () => {
    for (const trigger of ['deal_field', 'contact_field']) {
      assert.equal(f(trigger, '', 'x', {}), true); assert.equal(f(trigger, 'x', '', {}), true);
      assert.equal(f(trigger, 'nein', ' JA ', { value: 'ja' }), true); assert.equal(f(trigger, 'ja', 'nein', { value: 'ja' }), false); assert.equal(f(trigger, '', 'jaja', { value: 'ja' }), false);
    }
  });
  test('"no more emails", the onboarding, a task: only the change to the state that is meant', () => {
    assert.equal(f('opt_out', '0', '1'), true); assert.equal(f('opt_out', '1', '0'), false);
    assert.equal(f('onboarding_done', 'call_erfolgt', 'onboarding_abgeschlossen'), true); assert.equal(f('onboarding_done', 'kein_onboarding', 'termin_gebucht'), false);
    assert.equal(f('task_done', '0', '1'), true); assert.equal(f('task_done', '1', '0'), false, 'reopened');
    assert.equal(f('meeting_moved', '2026-12-01 10:00', '2026-12-02 10:00'), true);
    assert.equal(f('stage_days', '31', '32', { stage_id: 31 }), false, 'the stage is only remembered: the days are counted');
    assert.equal(f('lead', 'a', 'b'), false, 'a start that watches nothing');
    assert.equal(f('constructor', 'a', 'b'), false);
  });
  test('the starts that watch are the ones the CRM keeps no history for', () => {
    assert.deepEqual(Object.keys(T.TRIGGERS).filter(T.watches).sort(), ['assigned', 'contact_field', 'deal_field', 'meeting_moved', 'onboarding_done', 'opt_out', 'stage_days', 'stage_left', 'task_done', 'urgency']);
  });
});

describe('a moment on a zone\'s clock', () => {
  test('a day shifted, and its weekday (1 Monday … 7 Sunday)', () => {
    assert.equal(T.shiftDay('2026-11-19', 1), '2026-11-20'); assert.equal(T.shiftDay('2026-11-30', 1), '2026-12-01'); assert.equal(T.shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(T.shiftDay('2026-12-31', 1), '2027-01-01'); assert.equal(T.shiftDay('2026-11-19', 0), '2026-11-19'); assert.equal(T.shiftDay('2026-11-19', -365), '2025-11-19');
    assert.equal(T.weekdayOf('2026-11-19'), 4); assert.equal(T.weekdayOf('2026-11-22'), 7); assert.equal(T.weekdayOf('2026-11-23'), 1);
  });
  test('the latest day whose time has come: today from that time on, yesterday before — on the zone\'s clock, not the server\'s', () => {
    const at = iso => new Date(iso);
    assert.equal(T.dayReached(at('2026-11-19T08:30:00Z'), '09:00', 'Europe/Berlin'), '2026-11-19', '09:30 in Berlin');
    assert.equal(T.dayReached(at('2026-11-19T07:30:00Z'), '09:00', 'Europe/Berlin'), '2026-11-18', '08:30 in Berlin');
    assert.equal(T.dayReached(at('2026-11-19T23:30:00Z'), '00:00', 'Europe/Berlin'), '2026-11-20', 'past midnight in Berlin while it is still the 19th in UTC');
    assert.equal(T.dayReached(at('2026-11-19T08:30:00Z'), '09:00', 'America/New_York'), '2026-11-18', '03:30 in New York');
    assert.equal(T.dayReached(at('2026-11-19T08:30:00Z'), '09:00', 'Mars/Phobos'), '2026-11-19', 'an unknown zone falls back');
  });
  test('the first day whose time comes at or after a moment', () => {
    const at = iso => new Date(iso);
    assert.equal(T.dayFrom(at('2026-11-19T07:30:00Z'), '09:00', 'Europe/Berlin'), '2026-11-19', 'switched on at 08:30: today counts');
    assert.equal(T.dayFrom(at('2026-11-19T08:00:00Z'), '09:00', 'Europe/Berlin'), '2026-11-19', 'at the very minute');
    assert.equal(T.dayFrom(at('2026-11-19T08:30:00Z'), '09:00', 'Europe/Berlin'), '2026-11-20', 'switched on at 09:30: from tomorrow');
  });
});

describe('finding deals', () => {
  const flow = (config, more = {}) => ({ id: 1, workspace_id: 7, activated_at: new Date('2026-11-19T08:00:00Z'), config: { ...BASE, ...config }, ...more });
  const silent = () => { const calls = []; return { calls, query: async (sql, p) => { calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: p }); return { rows: [], rowCount: 0 }; } }; };
  test('a workflow that was never switched on, or whose start is none, asks the database nothing', async () => {
    for (const f of [flow({ trigger: 'lead' }, { activated_at: null }), flow({ trigger: null }), flow({ trigger: 'nope' }), flow({ trigger: 'constructor' }), { id: 1, workspace_id: 7, activated_at: new Date() }, null]) {
      const db = silent();
      assert.deepEqual(await T.find(db, f, new Date()), []);
      assert.deepEqual(db.calls, []);
    }
  });
  test('"only when added by hand" takes nothing in by itself', async () => {
    const db = silent();
    assert.deepEqual(await T.find(db, flow({ trigger: 'manual' }), new Date()), []);
    assert.deepEqual(db.calls, []);
  });
  test('every statement is asked with the workflow\'s workspace first; a start limited to a pipeline passes it on', async () => {
    const now = new Date('2026-11-20T12:00:00Z');   // the day after the switch-on: a time of day has come once since
    const starts = { lead: {}, deal_manual: {}, deal_import: {}, deal_new: {}, stage: { stage_id: 31 }, stage_left: { stage_id: 31 }, assigned: {}, urgency: {}, deal_field: { field_key: 'f' }, contact_field: { field_key: 'f' },
      document: {}, call_result: { result: 'interested' }, call_inbound: {}, meeting_booked: {}, meeting_moved: {}, meeting_cancelled: {}, meeting_before: { hours: 24 }, meeting_after: { hours: 2 }, notetaker: {},
      task_done: {}, task_overdue: {}, stage_days: { stage_id: 31, days: 3 }, quiet_days: { days: 5 }, date_field: { field_key: 'f', offset_days: 0, at: '00:00', tz: 'Europe/Berlin' },
      schedule: { stage_id: 31, weekdays: [1, 2, 3, 4, 5, 6, 7], at: '00:00', tz: 'Europe/Berlin' }, opt_out: {}, onboarding_done: {}, flow_done: { flow_id: 2 } };
    assert.deepEqual(Object.keys(starts).sort(), Object.keys(T.TRIGGERS).filter(k => k !== 'manual').sort(), 'every start is asked here');
    for (const [trigger, more] of Object.entries(starts)) {
      const db = silent();
      assert.deepEqual(await T.find(db, flow({ trigger, ...more, pipeline_id: 4 }), now), [], trigger);
      assert.ok(db.calls.length >= 1, `${trigger} asks`);
      for (const c of db.calls) { assert.equal(c.params[0], 7, `${trigger}: ${c.sql.slice(0, 60)}`); assert.match(c.sql, /workspace_id = \$1/, trigger); }
      assert.ok(!db.calls.some(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql)), `${trigger}: nothing found, nothing written`);
    }
  });
  test('nothing from before the workflow was switched on: each statement that looks at rows compares their time with it', () => {
    assert.match(code, /WHERE d\.workspace_id = \$1 AND d\.created_at >= \$5 AND \(\$3::int IS NULL OR d\.pipeline_id = \$3\)/);
    for (const guard of ['x.created_at >= $5', 'o.created_at >= $5', 'a.cancelled_at IS NULL AND a.created_at >= $5', 'a.cancelled_at >= $5', "a.source = 'notetaker' AND a.created_at >= $5", "x.status = 'done' AND x.updated_at >= $6",
      'f.result_at >= $2', 'last.at >= $6']) assert.ok(code.includes(guard), guard);
    assert.match(code, /if \(moment > at \|\| moment < since\) continue;/, 'a meeting\'s moment before the switch-on is left alone');
    assert.match(code, /if \(due === null \|\| due >= at \|\| due < since\) continue;/, 'a task that was overdue before is left alone');
  });
  test('a deal is taken in once per thing that happened: every statement leaves out what has its run already', () => {
    assert.match(code, /AND NOT EXISTS \(SELECT 1 FROM journey_runs r WHERE r\.flow_id = \$2 AND r\.deal_id = e\.deal_id AND r\.event_key = e\.key\)/);
    assert.match(code, /SELECT deal_id, event_key FROM journey_runs WHERE flow_id = \$1 AND event_key = ANY\(\$2::text\[\]\)/);
    assert.match(code, /key: `c\$\{r\.subject\}\.\$\{kept\.n\}\.\$\{round\}`/, 'a change\'s key names what changed: two tasks of one deal are two keys');
  });
  // Found by the bug hunt of 2026-11-19: baseline() starts the change counts again, so a key made of a count alone
  // came round again after a workflow was switched off and on, and the change was taken for one already seen.
  test('a key made of a count holds for one switching-on: after off and on the same count is another key', async () => {
    assert.match(code, /^const roundOf = flow => new Date\(flow\.activated_at\)\.getTime\(\);$/m, 'to the millisecond: no two switchings-on share one');
    assert.match(code, /const out = \[\], round = roundOf\(flow\);/);
    assert.match(code, /'s' \|\| w\.n \|\| '\.' \|\| \$8::text AS key FROM journey_watch w/, '"N days in a stage" counts the same way');
    assert.match(code, /new Date\(new Date\(now\)\.getTime\(\) - Number\(flow\.config\.days\) \* DAY_MS\), String\(roundOf\(flow\)\)\]\);/);
    // the same change, seen by the workflow switched on at two different times
    const keysAt = async activated_at => {
      const db = { query: async sql => {
        const t = String(sql).replace(/\s+/g, ' ');
        if (t.startsWith('WITH cur AS')) return { rows: [{ subject: '60', deal_id: 60, value: '3', was: '0', fresh: false }] };
        if (t.startsWith('INSERT INTO journey_watch')) return { rows: [{ n: 1 }] };
        if (t.startsWith('SELECT d.id FROM deals d')) return { rows: [{ id: 60 }] };
        return { rows: [] };   // no run has this key yet
      } };
      return (await T.find(db, { id: 1, workspace_id: 7, activated_at, config: { trigger: 'assigned' } }, new Date())).map(x => x.key);
    };
    const first = await keysAt(new Date('2026-11-19T08:00:00Z')), again = await keysAt(new Date('2026-11-19T09:00:00Z'));
    assert.deepEqual(first, ['c60.1.1795075200000']);
    assert.deepEqual(again, ['c60.1.1795078800000'], 'the first change after it was switched on again is not the first change of before');
    assert.notDeepEqual(await keysAt(new Date('2026-11-19T08:00:00.400Z')), first, 'nor when it is switched off and on within one second');
    assert.notDeepEqual(first, again);
  });
  test('another workflow finishing is told apart by when the deal began it: put through again by hand, it finishes again', () => {
    assert.match(code, /'f' \|\| x\.id \|\| '\.' \|\| FLOOR\(EXTRACT\(EPOCH FROM x\.started_at\) \* 1000\)::bigint AS key/);
    // (held = NULL since Part 17: what held the deal's email back is not said about its new start either)
    assert.match(read('utils/journey-run.js'), /UPDATE SET node_id = EXCLUDED\.node_id, status = EXCLUDED\.status, due_at = EXCLUDED\.due_at, reason = NULL, held = NULL, attempts = 0, started_at = NOW\(\), updated_at = NOW\(\)/, 'a restart begins anew');
  });
  // Found by the same hunt: 260 deals assigned in one go, 200 runs — the changes were written down as seen, then cut.
  test('no change that was written down as seen is dropped: one tick looks at as many as it takes in, and takes in all it found', async () => {
    const fn = code.slice(code.indexOf('async function changed('), code.indexOf('// ── a call\'s result'));
    assert.match(fn, /ORDER BY cur\.subject LIMIT \$\{ENROLL_LIMIT\}`/);
    const notYet = code.slice(code.indexOf('async function notYet('), code.indexOf('\n}\n', code.indexOf('async function notYet(')));
    assert.ok(notYet.length > 300 && notYet.length < 1500, 'the one function');
    assert.doesNotMatch(notYet, /\.slice\(/, 'nothing found is cut off');
    const many = Array.from({ length: 260 }, (_, i) => ({ subject: String(i + 1), deal_id: i + 1, value: '3', was: '0', fresh: false }));
    const db = { query: async (sql, p) => {
      const t = String(sql).replace(/\s+/g, ' ');
      if (t.startsWith('WITH cur AS')) return { rows: many };
      if (t.startsWith('INSERT INTO journey_watch')) return { rows: [{ n: 1 }] };
      if (t.startsWith('SELECT d.id FROM deals d')) return { rows: p[1].map(id => ({ id })) };
      return { rows: [] };
    } };
    assert.equal((await T.find(db, { id: 1, workspace_id: 7, activated_at: new Date(), config: { trigger: 'assigned' } }, new Date())).length, 260, 'whatever was written down as seen is taken in');
  });
  test('a change is written down before it is answered, so it is found once — and what is seen for the first time is no change', () => {
    const fn = code.slice(code.indexOf('async function changed('), code.indexOf('// ── a call\'s result'));
    assert.match(fn, /ON CONFLICT \(flow_id, subject\) DO UPDATE SET value = EXCLUDED\.value, n = journey_watch\.n \+ 1, since = NOW\(\)\s+WHERE journey_watch\.value IS DISTINCT FROM EXCLUDED\.value/);
    assert.match(fn, /if \(!kept \|\| r\.fresh \|\| !r\.deal_id\) continue;/);
    assert.ok(fn.indexOf('INSERT INTO journey_watch') < fn.indexOf('out.push('));
  });
  test('a field\'s key is a value in every statement, never part of it', () => {
    assert.doesNotMatch(code, /custom_data->>'\$\{|custom_data->>\$\{|custom_data->'\$\{/);
    assert.equal((code.match(/custom_data->>\$\d::text/g) || []).length, 5, 'the five places a field is read');
    assert.doesNotMatch(code, /::date\) (=|<|>|BETWEEN)|\(d\.custom_data->>\$5::text\)::date/, 'a date field is compared as text: a field can hold anything');
  });
  test('a booking is a booking: an appointment typed in by hand starts no meeting workflow', () => {
    assert.match(code, /const BOOKED = `a\.type = 'meeting' AND a\.source IN \('calcom','calendly'\)`;/);
    assert.equal((code.match(/\$\{BOOKED\}/g) || []).length, 4, 'booked, cancelled, moved, and the moments around a meeting');
  });
  test('a call\'s result is read with fonio\'s own reader, a minute after it came and not after a day', () => {
    const fn = code.slice(code.indexOf('async function callResults('), code.indexOf('// ── moments around a meeting'));
    assert.match(fn, /fonioResult\.readResult\(r\.result_body \|\| \{\}, r\.from_number\)/);
    assert.match(fn, /fonioStage\.eventOf\(\{ leadStatus: said\.leadStatus, meeting: !!said\.meeting, callback: !!r\.callback, outcome: said\.outcome \|\| r\.call_outcome \|\| null, retry: !!r\.retry \}\)/);
    assert.match(fn, /new Date\(at - DAY_MS\), new Date\(at - RESULT_WAIT_MS\), pipeOf\(flow\.config\)\]/);
    assert.equal(T.RESULT_WAIT_MS, 60000);
    assert.deepEqual(T.RESULTS, require('../../utils/fonio-stage').EVENTS);
  });
  // Found by the bug hunt of 2026-11-19: a call fonio never reported moved the deal as "not reached" (the stage
  // table), but a workflow that starts on "not reached" never started.
  test('"not reached" is also a call fonio never reported and will not try again — the stage table\'s own rule', async () => {
    const stage = require('../../utils/fonio-stage');
    assert.deepEqual([stage.UNREPORTED_MINUTES, stage.UNREPORTED_HOURS], [60, 24]);
    const now = new Date('2026-11-19T12:00:00Z'), since = new Date('2026-11-19T06:00:00Z');
    const run = async (result, silent) => {
      const asked = [];
      const db = { query: async (sql, p) => {
        const t = String(sql).replace(/\s+/g, ' ').trim();
        asked.push({ sql: t, params: p });
        if (/f\.result_at IS NULL/.test(t)) return { rows: silent };
        if (t.startsWith('SELECT d.id FROM deals d')) return { rows: p[1].map(id => ({ id })) };
        return { rows: [] };
      } };
      const found = await T.find(db, { id: 1, workspace_id: 7, activated_at: since, config: { trigger: 'call_result', result, pipeline_id: 3 } }, now);
      return { found, asked };
    };
    const off = { enabled: false }, twice = { enabled: true, max_attempts: 2 };
    const { found, asked } = await run('not_reached', [
      { id: 5, deal_id: 60, follow_up_no: 0, follow_up: off, active: true },      // no retries: not reached
      { id: 6, deal_id: 61, follow_up_no: 0, follow_up: twice, active: true },    // the retries will try again: left for them
      { id: 7, deal_id: 62, follow_up_no: 2, follow_up: twice, active: true },    // the last try: not reached
      { id: 8, deal_id: 63, follow_up_no: 0, follow_up: twice, active: false },   // fonio switched off: nothing tries again
      { id: 9, deal_id: null, follow_up_no: 0, follow_up: off, active: true },    // no deal to take in
    ]);
    assert.deepEqual(found, [{ dealId: 60, key: 'call5' }, { dealId: 62, key: 'call7' }, { dealId: 63, key: 'call8' }], 'the call\'s own key: a result that comes late does not start it twice');
    const q = asked.find(c => /f\.result_at IS NULL/.test(c.sql));
    assert.match(q.sql, /WHERE f\.workspace_id = \$1 AND f\.status = 'sent' AND f\.result_at IS NULL AND f\.follow_up_at IS NULL AND f\.sent_at IS NOT NULL AND f\.sent_at >= \$2 AND f\.sent_at < \$3 AND f\.sent_at > \$4 AND w\.last_delivery IS NOT NULL/);
    assert.deepEqual(q.params, [7, since, new Date('2026-11-19T11:00:00Z'), new Date('2026-11-18T12:00:00Z'), 3], 'sent since it was switched on, an hour ago at least, a day at most');
    for (const result of ['interested', 'not_interested', 'callback', 'meeting_booked', 'wrong_person']) {
      assert.ok(!(await run(result, [{ id: 5, deal_id: 60, follow_up_no: 0, follow_up: off, active: true }])).asked.some(c => /f\.result_at IS NULL/.test(c.sql)), `${result}: a call without a result says nothing about it`);
    }
  });
  // Found by the same hunt: a booking from the public page names no deal; with the workflow limited to one pipeline
  // and the contact's newest deal in another, nothing started.
  test('what names a contact and no deal counts for the contact\'s newest deal in the workflow\'s pipeline', async () => {
    assert.match(code, /const dealOf = \(x, pipe = '\$3'\) => `COALESCE\(\$\{x\}\.deal_id, \(SELECT MAX\(d2\.id\) FROM deals d2 WHERE d2\.contact_id = \$\{x\}\.contact_id AND d2\.workspace_id = \$\{x\}\.workspace_id AND \(\$\{pipe\}::int IS NULL OR d2\.pipeline_id = \$\{pipe\}\)\)\)`;/);
    assert.doesNotMatch(code, /SELECT MAX\(d2?\.id\) FROM deals d2? WHERE d2?\.contact_id = [a-z${}.]+ AND d2?\.workspace_id = [a-z${}.]+\)/, 'no "newest deal" without the pipeline');
    assert.match(code, /\$\{dealOf\('f', '\$5'\)\} AS deal_id, f\.result_body/); assert.match(code, /\$\{dealOf\('a', '\$4'\)\} AS deal_id, to_char\(a\.event_date/);
    // a start that watches a contact hands the pipeline to its statement, at switching on and at every look
    const rec = () => { const calls = []; return { calls, query: async (sql, p) => { calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: p }); return { rows: [], rowCount: 0 }; } }; };
    for (const [trigger, params] of [['opt_out', [7, 1, 3]], ['onboarding_done', [7, 1, 3]], ['meeting_moved', [7, 1, 3]], ['contact_field', [7, 1, 'kundenstatus', 3]]]) {
      const on = rec(), look = rec(), flow = { id: 1, workspace_id: 7, activated_at: new Date(), config: { trigger, field_key: 'kundenstatus', pipeline_id: 3 } };
      await T.baseline(on, flow); await T.find(look, flow, new Date());
      assert.deepEqual(on.calls[1].params, params, `${trigger}: switching on`); assert.deepEqual(look.calls[0].params, params, `${trigger}: looking`);
      const pipe = `$${params.length}`;
      assert.ok(look.calls[0].sql.includes(`(${pipe}::int IS NULL OR d${trigger === 'meeting_moved' ? '2' : ''}.pipeline_id = ${pipe})`), `${trigger}: the newest deal in that pipeline`);
      const all = rec();
      await T.find(all, { ...flow, config: { ...flow.config, pipeline_id: null } }, new Date());
      assert.equal(all.calls[0].params.at(-1), null, `${trigger}: no pipeline, every deal`);
    }
  });
});

describe('switching a workflow on', () => {
  const flow = config => ({ id: 1, workspace_id: 7, activated_at: new Date(), config: { ...BASE, ...config } });
  const rec = () => { const calls = []; return { calls, query: async (sql, p) => { calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: p }); return { rows: [], rowCount: 3 }; } }; };
  test('a stage start writes the deals in the stage down as old; a watching start forgets what it knew and remembers everything as it is now', async () => {
    const stage = rec();
    assert.equal(await T.baseline(stage, flow({ trigger: 'stage', stage_id: 31 })), 3);
    assert.equal(stage.calls.length, 1);
    assert.match(stage.calls[0].sql, /SELECT d\.workspace_id, \$2, d\.id, NULL, 'old', NULL FROM deals d WHERE d\.workspace_id = \$1 AND d\.stage_id = \$3 ON CONFLICT \(flow_id, deal_id, event_key\) DO NOTHING$/);
    assert.deepEqual(stage.calls[0].params, [7, 1, 31]);
    for (const trigger of Object.keys(T.TRIGGERS).filter(T.watches)) {
      const db = rec();
      await T.baseline(db, flow({ trigger, stage_id: 31, field_key: 'f' }));
      assert.deepEqual(db.calls.map(c => c.sql.slice(0, 31)), ['DELETE FROM journey_watch WHERE ', 'INSERT INTO journey_watch (flow_'].map(x => x.slice(0, 31)), trigger);
      assert.deepEqual(db.calls[0].params, [1]);
      assert.deepEqual(db.calls[1].params.slice(0, 2), [7, 1], trigger);
    }
  });
  test('every other start goes by the time: nothing is written', async () => {
    for (const trigger of Object.keys(T.TRIGGERS).filter(k => k !== 'stage' && !T.watches(k))) {
      const db = rec();
      assert.equal(await T.baseline(db, flow({ trigger })), 0, trigger);
      assert.deepEqual(db.calls, [], trigger);
    }
  });
});

describe('the file', () => {
  test('takes the pool; it requires neither the database nor the notifications itself', () => {
    assert.doesNotMatch(code, /require\('\.\.\/db'\)|require\('\.\.\/notifications'\)/);
  });
  test('where a deal came from is written when it is made: by a lead webhook, a booking, an import; by hand is the default', () => {
    assert.match(read('db.js'), /ALTER TABLE deals ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual'/);
    const intg = read('routes/integrations.js');
    assert.match(intg, /INSERT INTO deals \(workspace_id, contact_id, pipeline_id, stage_id, title, origin\)\s+VALUES \(\$1,\$2,\$3,\$4,\$5,'webhook'\) RETURNING id/);
    assert.match(intg, /INSERT INTO deals \(workspace_id, contact_id, pipeline_id, stage_id, title, origin\) VALUES \(\$1,\$2,\$3,\$4,\$5,'booking'\) RETURNING id/);
    assert.match(read('routes/contacts.js'), /INSERT INTO deals \(workspace_id, contact_id, pipeline_id, stage_id, title, origin\) VALUES \(\$1,\$2,\$3,\$4,\$5,'import'\)/);
    assert.doesNotMatch(read('routes/deals.js'), /origin/, 'a deal made by hand takes the default');
  });
  test('the tables: a run\'s key with its index, and what a watching start remembers', () => {
    const db = read('db.js');
    assert.match(db, /ALTER TABLE journey_runs ADD COLUMN IF NOT EXISTS event_key TEXT NOT NULL DEFAULT ''/);
    assert.match(db, /ALTER TABLE journey_runs DROP CONSTRAINT IF EXISTS journey_runs_flow_id_deal_id_key/);
    assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS journey_runs_once_idx ON journey_runs \(flow_id, deal_id, event_key\)/);
    assert.match(db, /CREATE TABLE IF NOT EXISTS journey_watch \(\s+flow_id\s+INTEGER NOT NULL REFERENCES journey_flows\(id\) ON DELETE CASCADE,\s+subject\s+TEXT NOT NULL,\s+value\s+TEXT,\s+n\s+INTEGER NOT NULL DEFAULT 0,\s+since\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\),\s+PRIMARY KEY \(flow_id, subject\)/);
    assert.ok(db.indexOf('DROP CONSTRAINT IF EXISTS journey_runs_flow_id_deal_id_key') < db.indexOf('journey_runs_once_idx'), 'the old rule goes before the new one comes');
  });
});
