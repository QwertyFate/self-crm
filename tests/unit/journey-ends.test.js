// UNIT tests for utils/journey-ends.js (CUSTOMER_JOURNEY_CHANGES Part 13, 2026-11-19): everything that can end a
// workflow for a deal, beside its stage.
//
// What is saved with a start (checkEnds, through the start's own checkStart), what a rule may name (foreignEnds), and
// each rule's answer (reasonOf, through the engine's stopReason). The rules that look into the database are asked
// with stand-in pools here — their statements were answered by a real throwaway Postgres as well (see the change
// log) — and the statements that carry a guarantee are pinned, so a change to one of them is a deliberate one.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const E = require('../../utils/journey-ends');
const T = require('../../utils/journey-triggers');
const run = require('../../utils/journey-run');

const code = read('utils/journey-ends.js').replace(/\/\*[\s\S]*?\*\//, '');   // without its header
const BASE = { webhook_ids: null, stage_id: null, stop_stage_ids: [] };
const saved = more => T.checkStart({ trigger: 'manual', ...more });
const ok = more => { const r = saved(more); assert.ok(r.config, JSON.stringify(more) + ' → ' + JSON.stringify(r)); return r.config; };
const bad = (more, code_ = 'start') => assert.deepEqual(saved(more), { code: code_ }, JSON.stringify(more));

// a pool that answers each statement by the table it asks, and writes down what it was asked
function pool(answers = {}) {
  const asked = [];
  return { asked, query: async (sql, params) => {
    const t = String(sql).replace(/\s+/g, ' ').trim(), table = (/ FROM ([a-z_]+)/.exec(t) || [])[1];
    asked.push({ sql: t, params, table });
    const a = answers[table];
    return { rows: typeof a === 'function' ? a(t, params) : a || [] };
  } };
}
const NOW = new Date('2026-11-19T12:00:00Z');
const X = { workspace_id: 7, flow_id: 2, deal_id: 60, contact_id: 40, stage_id: 31, started_at: new Date('2026-11-19T08:00:00Z'), assigned_to: null, urgency: 0,
  deal_data: {}, contact_data: {}, onboarding_status: 'kein_onboarding', journey_opt_out: false };
const why = (config, more = {}, db = pool(), now = NOW) => run.stopReason(db, { ...X, ...more, start_config: config }, now);

describe('the rules there are', () => {
  test('fifteen, in the order they are saved and looked at; the three of before are among them', () => {
    assert.deepEqual(E.STOP_ON, ['assigned', 'urgency', 'field', 'contact_field', 'document', 'onboarding_done', 'opt_out', 'answered', 'call_result', 'call_inbound', 'meeting', 'meeting_cancelled', 'task_done', 'max_days', 'other_flow']);
    assert.equal(new Set(E.STOP_ON).size, 15);
    assert.equal(T.STOP_ON, E.STOP_ON, 'the start hands the same list on');
    assert.equal(T.STOP_CATEGORIES, E.STOP_CATEGORIES); assert.equal(T.STOP_USES, E.STOP_USES);
  });
  test('every rule is in exactly one category, and the categories hold nothing else', () => {
    assert.deepEqual(E.STOP_CATEGORIES, { deal: ['assigned', 'urgency', 'field'], contact: ['contact_field', 'document', 'onboarding_done', 'opt_out'], calls: ['answered', 'call_result', 'call_inbound'],
      meetings: ['meeting', 'meeting_cancelled'], tasks: ['task_done'], time: ['max_days'], other: ['other_flow'] });
    assert.deepEqual(Object.values(E.STOP_CATEGORIES).flat(), E.STOP_ON, 'the categories, one after the other, are the list');
  });
  test('the settings each rule has; a rule not named has none', () => {
    assert.deepEqual(E.STOP_USES, { urgency: ['min_urgency'], field: ['field_key', 'value'], contact_field: ['field_key', 'value'], document: ['doc_type'], call_result: ['results'], max_days: ['days'], other_flow: ['flow_id'] });
    for (const key of Object.keys(E.STOP_USES)) assert.ok(E.STOP_ON.includes(key), key);
  });
  test('every rule has its own word for why a workflow ended, and the words of before are kept', () => {
    assert.deepEqual(Object.keys(E.REASONS), E.STOP_ON);
    assert.equal(new Set(Object.values(E.REASONS)).size, 15, 'no two rules share a word');
    assert.deepEqual([E.REASONS.meeting, E.REASONS.answered, E.REASONS.opt_out], ['meeting_booked', 'call_answered', 'opted_out']);
    assert.deepEqual(Object.values(E.REASONS), ['deal_assigned', 'urgency_reached', 'field_set', 'contact_field_set', 'document_added', 'onboarding_done', 'opted_out', 'call_answered', 'call_result', 'call_inbound',
      'meeting_booked', 'meeting_cancelled', 'task_done', 'max_days', 'other_flow']);
    for (const word of ['stop_stage', 'left_stages']) assert.ok(!Object.values(E.REASONS).includes(word), 'the stage rules keep their own');
  });
  test('each rule is answered in exactly one of the two ways: from the row, or by asking the database', () => {
    const is = [...code.slice(code.indexOf('const IS = {'), code.indexOf('\n};', code.indexOf('const IS = {'))).matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]);
    const happened = [...code.slice(code.indexOf('const HAPPENED = {'), code.indexOf('\n};', code.indexOf('const HAPPENED = {'))).matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]);
    assert.deepEqual(is, ['assigned', 'urgency', 'field', 'contact_field', 'onboarding_done', 'opt_out', 'max_days']);
    assert.deepEqual(happened, ['answered', 'call_result', 'call_inbound', 'meeting', 'meeting_cancelled', 'document', 'task_done', 'other_flow']);
    assert.deepEqual([...is, ...happened].sort(), [...E.STOP_ON].sort());
  });
});

describe('as they are saved with a start', () => {
  test('the rules that are switched on, in the list\'s own order, each once — and the settings of those that have any', () => {
    assert.deepEqual(ok({ stop_on: ['task_done', 'assigned', 'task_done'] }), { trigger: 'manual', ...BASE, stop_on: ['assigned', 'task_done'] });
    assert.deepEqual(ok({ stop_on: [...E.STOP_ON].reverse(), stop_set: { urgency: { min_urgency: 3 }, field: { field_key: 'budget' }, contact_field: { field_key: 'status', value: '  Kunde ' }, document: { doc_type: 'vertrag' },
      call_result: { results: ['not_reached', 'interested'] }, max_days: { days: 30 }, other_flow: { flow_id: 9 } } }),
    { trigger: 'manual', ...BASE, stop_on: E.STOP_ON, stop_set: { urgency: { min_urgency: 3 }, field: { field_key: 'budget' }, contact_field: { field_key: 'status', value: 'Kunde' }, document: { doc_type: 'vertrag' },
      call_result: { results: ['interested', 'not_reached'] }, max_days: { days: 30 }, other_flow: { flow_id: 9 } } });
  });
  test('only what a rule uses is kept, and nothing of a rule that is not switched on', () => {
    const c = ok({ stop_on: ['urgency', 'meeting'], stop_set: { urgency: { min_urgency: 2, days: 9, more: true }, max_days: { days: 30 }, meeting: { x: 1 }, field: { field_key: 'two words' }, other_flow: { flow_id: 'x' }, constructor: { a: 1 } } });
    assert.deepEqual(c.stop_set, { urgency: { min_urgency: 2 } }, 'settings of a rule that is off are left out — not refused, even when they could not be');
    assert.deepEqual(c.stop_on, ['urgency', 'meeting']);
    assert.ok(!('stop_set' in ok({ stop_on: ['meeting', 'assigned'], stop_set: { max_days: { days: 3 } } })), 'no rule with settings: nothing is saved for them');
    assert.ok(!('stop_on' in ok({ stop_on: [], stop_set: { max_days: { days: 3 } } })));
    assert.ok(!('stop_set' in ok({ stop_set: { max_days: { days: 3 } } })), 'settings without any rule switched on');
  });
  test('settings that may be left out: any value of a field, any kind of document', () => {
    assert.deepEqual(ok({ stop_on: ['field'], stop_set: { field: { field_key: 'budget', value: '   ' } } }).stop_set, { field: { field_key: 'budget' } });
    for (const value of [undefined, null, '']) assert.deepEqual(ok({ stop_on: ['contact_field'], stop_set: { contact_field: { field_key: 'status', value } } }).stop_set, { contact_field: { field_key: 'status' } });
    for (const set of [undefined, null, {}, { document: {} }, { document: { doc_type: null } }]) assert.ok(!('stop_set' in ok({ stop_on: ['document'], stop_set: set })), JSON.stringify(set));
    for (const doc_type of T.DOC_TYPES) assert.deepEqual(ok({ stop_on: ['document'], stop_set: { document: { doc_type } } }).stop_set, { document: { doc_type } });
  });
  test('a call\'s results: one or several of the start\'s own, each once, in their own order', () => {
    assert.deepEqual(ok({ stop_on: ['call_result'], stop_set: { call_result: { results: [...T.RESULTS].reverse() } } }).stop_set.call_result.results, T.RESULTS);
    assert.deepEqual(ok({ stop_on: ['call_result'], stop_set: { call_result: { results: ['callback', 'callback'] } } }).stop_set.call_result.results, ['callback']);
  });
  test('the bounds are the start\'s own: urgency 1 to 4, days 1 to 365, a value of up to 200 characters', () => {
    for (const n of [1, T.MAX_URGENCY]) assert.equal(ok({ stop_on: ['urgency'], stop_set: { urgency: { min_urgency: n } } }).stop_set.urgency.min_urgency, n);
    for (const n of [1, T.MAX_DAYS]) assert.equal(ok({ stop_on: ['max_days'], stop_set: { max_days: { days: n } } }).stop_set.max_days.days, n);
    assert.equal(ok({ stop_on: ['field'], stop_set: { field: { field_key: 'f', value: 'x'.repeat(T.MAX_VALUE) } } }).stop_set.field.value.length, 200);
    assert.match(read('utils/journey-triggers.js'), /const ended = ends\.checkEnds\(c, \{ DOC_TYPES, RESULTS, MAX_DAYS, MAX_URGENCY, MAX_VALUE \}\);/, 'handed in: one of each');
  });
  test('refused: a rule that is none, or the list or the settings in a shape they cannot have', () => {
    for (const stop_on of ['meeting', {}, ['reply'], ['constructor'], ['toString'], [5], [null], [['meeting']], ['meeting', 'x']]) bad({ stop_on });
    for (const stop_set of ['x', 5, [], [{ max_days: { days: 3 } }], true]) bad({ stop_on: ['meeting'], stop_set });
  });
  test('refused: a rule that is switched on without what it needs, or with something it cannot be', () => {
    for (const s of [undefined, {}, { min_urgency: 0 }, { min_urgency: 5 }, { min_urgency: '3' }, { min_urgency: 2.5 }, 'x', [3]]) bad({ stop_on: ['urgency'], stop_set: { urgency: s } });
    bad({ stop_on: ['urgency'] });
    for (const s of [undefined, {}, { days: 0 }, { days: 366 }, { days: '30' }, { days: 1.5 }, { days: -1 }]) bad({ stop_on: ['max_days'], stop_set: { max_days: s } });
    for (const s of [undefined, {}, { results: [] }, { results: 'interested' }, { results: ['won'] }, { results: ['interested', 'constructor'] }, { results: [5] }]) bad({ stop_on: ['call_result'], stop_set: { call_result: s } });
    for (const doc_type of ['rechnung', 5, 'constructor', '']) bad({ stop_on: ['document'], stop_set: { document: { doc_type } } });
    for (const key of ['field', 'contact_field']) {
      for (const value of [7, true, ['ja'], 'x'.repeat(201)]) bad({ stop_on: [key], stop_set: { [key]: { field_key: 'f', value } } });
    }
  });
  test('refused with its own code: a field key that is no key, another workflow that is no id', () => {
    for (const key of ['field', 'contact_field']) {
      for (const field_key of [undefined, '', 'two words', 7, 'x'.repeat(121), 'tab\there']) bad({ stop_on: [key], stop_set: { [key]: { field_key } } }, 'field');
      bad({ stop_on: [key] }, 'field');
    }
    for (const flow_id of [undefined, 0, -1, '9', 1.5, 1e10, null]) bad({ stop_on: ['other_flow'], stop_set: { other_flow: { flow_id } } }, 'flow');
    bad({ stop_on: ['other_flow'] }, 'flow');
  });
  test('settings a rule carries in the object\'s own names only: nothing an object has besides is read', () => {
    bad({ stop_on: ['urgency'], stop_set: Object.create({ urgency: { min_urgency: 3 } }) });
    assert.deepEqual(E.settingsOf({ stop_set: Object.create({ max_days: { days: 3 } }) }, 'max_days'), {});
    assert.deepEqual(E.settingsOf({ stop_set: { max_days: { days: 3 } } }, 'constructor'), {});
    assert.deepEqual(E.settingsOf({ stop_set: { max_days: [3] } }, 'max_days'), {});
    for (const c of [null, undefined, {}, { stop_set: 'x' }, { stop_set: [] }]) assert.deepEqual(E.settingsOf(c, 'max_days'), {});
    assert.deepEqual(E.rulesOf({ stop_on: ['task_done', 'weather', 'assigned', 'constructor'] }), ['assigned', 'task_done'], 'a rule this server does not know is not looked at');
    for (const c of [null, undefined, {}, { stop_on: 'meeting' }]) assert.deepEqual(E.rulesOf(c), []);
  });
  test('the stage rules are untouched, and both may be set together with any of these', () => {
    assert.deepEqual(ok({ stop_stage_ids: [32], stay_stage_ids: [31, 33], stop_on: ['max_days'], stop_set: { max_days: { days: 14 } } }),
      { trigger: 'manual', ...BASE, stop_stage_ids: [32], stay_stage_ids: [31, 33], stop_on: ['max_days'], stop_set: { max_days: { days: 14 } } });
    assert.deepEqual(T.checkStart({ trigger: 'stage', stage_id: 31, stop_on: ['assigned'] }).config.stop_on, ['assigned'], 'with every start');
    assert.deepEqual(T.checkStart({ trigger: null, stop_on: ['assigned'] }).config.stop_on, ['assigned'], 'and with a start that is not chosen yet');
  });
});

describe('what a rule names must be the workspace\'s own', () => {
  const refs = (config, answers, flowId = 1) => { const db = pool(answers); return E.foreignEnds(db, 7, flowId, config).then(code_ => ({ code: code_, asked: db.asked })); };
  test('a deal field for "a deal field has a value", a contact field for "a contact field has a value"', async () => {
    const config = { stop_on: ['field', 'contact_field'], stop_set: { field: { field_key: 'budget' }, contact_field: { field_key: "x'; DROP TABLE contacts; --" } } };
    const both = await refs(config, { deal_fields: [{ type: 'text' }], custom_fields: [{ type: 'text' }] });
    assert.equal(both.code, null);
    assert.deepEqual(both.asked.map(c => [c.sql, c.params]), [['SELECT type FROM deal_fields WHERE workspace_id = $1 AND field_key = $2', [7, 'budget']],
      ['SELECT type FROM custom_fields WHERE workspace_id = $1 AND field_key = $2', [7, "x'; DROP TABLE contacts; --"]]], 'the key is a value, never a part of what is asked');
    assert.equal((await refs(config, { deal_fields: [], custom_fields: [{ type: 'text' }] })).code, 'field', 'a contact field is no deal field');
    assert.equal((await refs(config, { deal_fields: [{ type: 'text' }], custom_fields: [] })).code, 'field');
  });
  test('another workflow of this workspace, never the workflow itself', async () => {
    const config = { stop_on: ['other_flow'], stop_set: { other_flow: { flow_id: 9 } } };
    const there = await refs(config, { journey_flows: [{ id: 9 }] });
    assert.equal(there.code, null);
    assert.deepEqual(there.asked.map(c => [c.sql, c.params]), [['SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', [9, 7]]]);
    assert.equal((await refs(config, { journey_flows: [] })).code, 'flow', 'gone, or another workspace\'s');
    const self = await refs(config, { journey_flows: [{ id: 9 }] }, 9);
    assert.deepEqual([self.code, self.asked.length], ['flow', 0], 'a workflow cannot end on itself');
    assert.equal((await refs({ stop_on: ['other_flow'] }, { journey_flows: [{ id: 9 }] })).code, 'flow', 'switched on without one');
  });
  test('a rule that names nothing, or one that is not switched on, asks the database nothing', async () => {
    const quiet = await refs({ stop_on: ['assigned', 'urgency', 'document', 'onboarding_done', 'opt_out', 'answered', 'call_result', 'call_inbound', 'meeting', 'meeting_cancelled', 'task_done', 'max_days'],
      stop_set: { field: { field_key: 'budget' }, other_flow: { flow_id: 9 } } }, {});
    assert.deepEqual([quiet.code, quiet.asked.length], [null, 0]);
    for (const c of [null, undefined, {}, { stop_on: 'field' }]) assert.equal((await refs(c, {})).code, null);
  });
  test('the start asks it with everything else it names — when it is saved, and again when it is switched on', async () => {
    const src = read('utils/journey-triggers.js');
    assert.match(src, /return ends\.foreignEnds\(db, wid, flowId, c\);/);
    const db = pool({ pipeline_stages: [], deal_fields: [] });
    assert.equal(await T.foreignRefs(db, 7, 1, { trigger: 'manual', stop_stage_ids: [], stop_on: ['field'], stop_set: { field: { field_key: 'gone' } } }), 'field');
    assert.equal(await T.foreignRefs(pool({ deal_fields: [{ type: 'text' }] }), 7, 1, { trigger: 'manual', stop_stage_ids: [], stop_on: ['field'], stop_set: { field: { field_key: 'budget' } } }), null);
  });
});

describe('how the deal is when a step is due — no question to the database', () => {
  test('the deal is assigned to someone', async () => {
    assert.equal(await why({ stop_on: ['assigned'] }, { assigned_to: 3 }), 'deal_assigned');
    for (const assigned_to of [null, undefined, 0]) assert.equal(await why({ stop_on: ['assigned'] }, { assigned_to }), null);
  });
  test('its urgency is at least the level', async () => {
    const at = (min, urgency) => why({ stop_on: ['urgency'], stop_set: { urgency: { min_urgency: min } } }, { urgency });
    assert.deepEqual([await at(3, 2), await at(3, 3), await at(3, 4), await at(1, 0), await at(1, null)], [null, 'urgency_reached', 'urgency_reached', null, null]);
    for (const set of [undefined, {}, { urgency: {} }, { urgency: { min_urgency: 0 } }, { urgency: { min_urgency: '3' } }]) assert.equal(await why({ stop_on: ['urgency'], stop_set: set }, { urgency: 4 }), null, 'a rule without its level ends nothing: ' + JSON.stringify(set));
  });
  test('a deal field has a value — any, or the given one; capitals and outer spaces do not count', async () => {
    const f = (set, deal_data) => why({ stop_on: ['field'], stop_set: { field: set } }, { deal_data });
    assert.equal(await f({ field_key: 'finanzierung' }, { finanzierung: 'Ja' }), 'field_set');
    for (const data of [{}, { finanzierung: '' }, { finanzierung: '   ' }, { finanzierung: null }, { other: 'x' }, null, undefined, 'x']) assert.equal(await f({ field_key: 'finanzierung' }, data), null, JSON.stringify(data));
    for (const value of ['ja', ' JA ', 'Ja']) assert.equal(await f({ field_key: 'finanzierung', value }, { finanzierung: 'Ja' }), 'field_set', value);
    assert.equal(await f({ field_key: 'finanzierung', value: 'nein' }, { finanzierung: 'Ja' }), null);
    assert.equal(await f({ field_key: 'finanzierung', value: 'j' }, { finanzierung: 'Ja' }), null, 'the whole value, not a part of it');
    assert.equal(await f({ field_key: 'budget', value: '250000' }, { budget: 250000 }), 'field_set', 'a number is compared as it is written');
    for (const field_key of ['constructor', 'toString', '__proto__']) assert.equal(await f({ field_key }, { finanzierung: 'Ja' }), null, `only the deal's own fields: ${field_key}`);
    for (const set of [undefined, {}, { field_key: '' }, { field_key: 7 }]) assert.equal(await why({ stop_on: ['field'], stop_set: { field: set } }, { deal_data: { '': 'x', 7: 'x' } }), null, 'a rule without its field ends nothing');
  });
  test('a contact field has a value — looked for in the contact\'s fields, never in the deal\'s', async () => {
    const config = { stop_on: ['contact_field'], stop_set: { contact_field: { field_key: 'status', value: 'kunde' } } };
    assert.equal(await why(config, { contact_data: { status: 'Kunde' } }), 'contact_field_set');
    assert.equal(await why(config, { contact_data: { status: 'Lead' } }), null);
    assert.equal(await why(config, { deal_data: { status: 'Kunde' }, contact_data: {} }), null, 'the same key on the deal is another field');
    assert.equal(await why({ stop_on: ['field'], stop_set: { field: { field_key: 'status' } } }, { contact_data: { status: 'Kunde' }, deal_data: {} }), null, 'and the other way round');
    for (const contact_data of [null, undefined, 'x']) assert.equal(await why(config, { contact_data }), null, 'a deal without a contact has no contact fields');
  });
  test('the onboarding is completed — the word the start goes by; the contact pressed "no more emails"', async () => {
    assert.equal(E.ONBOARDING_DONE, 'onboarding_abgeschlossen');
    assert.equal(T.fires('onboarding_done', 'call_erfolgt', E.ONBOARDING_DONE), true, 'the start fires on the same word');
    assert.equal(await why({ stop_on: ['onboarding_done'] }, { onboarding_status: 'onboarding_abgeschlossen' }), 'onboarding_done');
    for (const onboarding_status of ['kein_onboarding', 'briefing_fertig', null, undefined, '']) assert.equal(await why({ stop_on: ['onboarding_done'] }, { onboarding_status }), null, String(onboarding_status));
    assert.equal(await why({ stop_on: ['opt_out'] }, { journey_opt_out: true }), 'opted_out');
    assert.equal(await why({ stop_on: ['opt_out'] }, { journey_opt_out: false }), null);
  });
  test('so many days in the workflow, by the tick\'s clock', async () => {
    const days = (n, now) => why({ stop_on: ['max_days'], stop_set: { max_days: { days: n } } }, {}, pool(), new Date(now));
    assert.equal(await days(1, '2026-11-20T07:59:59Z'), null, 'a second short of a day');
    assert.equal(await days(1, '2026-11-20T08:00:00Z'), 'max_days', 'the day is over');
    assert.equal(await days(30, '2026-12-19T07:59:00Z'), null); assert.equal(await days(30, '2026-12-19T08:00:00Z'), 'max_days');
    for (const set of [undefined, {}, { max_days: {} }, { max_days: { days: 0 } }, { max_days: { days: '1' } }]) assert.equal(await why({ stop_on: ['max_days'], stop_set: set }, {}, pool(), new Date('2030-01-01T00:00:00Z')), null, 'a rule without its days ends nothing');
    assert.equal(await why({ stop_on: ['max_days'], stop_set: { max_days: { days: 1 } } }, { started_at: null }, pool(), new Date('2030-01-01T00:00:00Z')), null);
    assert.match(read('utils/journey-run.js'), /const stop = await stopReason\(pool, x, now\);/, 'the engine hands its clock on');
  });
  test('none of these asks the database, and all of them are looked at before any rule that does', async () => {
    const db = pool();
    const config = { stop_on: E.STOP_ON.filter(k => !['other_flow'].includes(k)), stop_set: { urgency: { min_urgency: 4 }, field: { field_key: 'f' }, contact_field: { field_key: 'f' }, call_result: { results: ['interested'] }, max_days: { days: 365 } } };
    assert.equal(await why(config, { journey_opt_out: true }, db), 'opted_out');
    assert.deepEqual(db.asked, [], 'the row said it: nothing was asked');
    assert.equal(await why({ stop_on: ['meeting', 'max_days'], stop_set: { max_days: { days: 1 } } }, {}, pool({ activities: [{}] }), new Date('2026-12-01T00:00:00Z')), 'max_days', 'the days are over: the meeting is not even asked about');
    assert.equal(await why({ stop_on: ['assigned', 'opt_out'] }, { assigned_to: 3, journey_opt_out: true }), 'deal_assigned', 'two hold: the first of the list is the reason');
  });
});

describe('what happened since the deal entered — asked of the database, only when the start says so', () => {
  const HEAD = [7, 60, 40, X.started_at];
  test('each of these rules asks one thing, for the deal or its contact, since the deal entered', async () => {
    const cases = [
      ['answered', 'fonio_calls', 'call_answered', /^SELECT 1 FROM fonio_calls f WHERE f\.workspace_id = \$1 AND f\.call_outcome = 'answered' AND f\.result_at >= \$4 AND \(f\.deal_id = \$2 OR \(f\.deal_id IS NULL AND f\.contact_id = \$3\)\) LIMIT 1$/, HEAD],
      ['call_inbound', 'fonio_other_calls', 'call_inbound', /^SELECT 1 FROM fonio_other_calls o WHERE o\.workspace_id = \$1 AND o\.direction = 'inbound' AND o\.created_at >= \$4 AND \(o\.deal_id = \$2 OR \(o\.deal_id IS NULL AND o\.contact_id = \$3\)\) LIMIT 1$/, HEAD],
      ['meeting', 'activities', 'meeting_booked', /^SELECT 1 FROM activities a WHERE a\.workspace_id = \$1 AND a\.type = 'meeting' AND a\.source IN \('calcom','calendly'\) AND a\.cancelled_at IS NULL AND a\.created_at >= \$4 AND \(a\.deal_id = \$2 OR \(a\.deal_id IS NULL AND a\.contact_id = \$3\)\) LIMIT 1$/, HEAD],
      ['meeting_cancelled', 'activities', 'meeting_cancelled', /^SELECT 1 FROM activities a WHERE a\.workspace_id = \$1 AND a\.type = 'meeting' AND a\.source IN \('calcom','calendly'\) AND a\.cancelled_at >= \$4 AND \(a\.deal_id = \$2 OR \(a\.deal_id IS NULL AND a\.contact_id = \$3\)\) LIMIT 1$/, HEAD],
      ['document', 'contact_documents', 'document_added', /^SELECT 1 FROM contact_documents doc WHERE doc\.workspace_id = \$1 AND doc\.created_at >= \$4 AND \(doc\.deal_id = \$2 OR \(doc\.deal_id IS NULL AND doc\.contact_id = \$3\)\) AND \(\$5::text IS NULL OR doc\.typ = \$5\) LIMIT 1$/, [...HEAD, null]],
      ['task_done', 'tasks', 'task_done', /^SELECT 1 FROM tasks t WHERE t\.workspace_id = \$1 AND t\.deal_id = \$2 AND t\.updated_at >= \$3 AND t\.status = COALESCE\(\(SELECT s\.key FROM task_project_statuses s WHERE s\.project_id = t\.project_id ORDER BY s\.position DESC, s\.id DESC LIMIT 1\), 'done'\) LIMIT 1$/, [7, 60, X.started_at]],
    ];
    for (const [rule, table, reason, sql, params] of cases) {
      const hit = pool({ [table]: [{}] }), miss = pool();
      assert.equal(await why({ stop_on: [rule] }, {}, hit), reason, rule);
      assert.equal(await why({ stop_on: [rule] }, {}, miss), null, rule);
      assert.equal(hit.asked.length, 1, rule);
      assert.match(hit.asked[0].sql, sql, rule);
      assert.deepEqual(hit.asked[0].params, params, rule);
      const alone = pool();
      await why({ stop_on: [rule] }, { contact_id: undefined }, alone);
      if (params.length > 3) assert.equal(alone.asked[0].params[2], null, `${rule}: a deal without a contact asks for no contact, not for "undefined"`);
    }
  });
  test('a document of one kind, or any', async () => {
    const db = pool({ contact_documents: [{}] });
    await why({ stop_on: ['document'], stop_set: { document: { doc_type: 'vertrag' } } }, {}, db);
    assert.equal(db.asked[0].params[4], 'vertrag');
    for (const set of [undefined, {}, { document: {} }, { document: { doc_type: '' } }, { document: { doc_type: 7 } }]) {
      const any = pool();
      await why({ stop_on: ['document'], stop_set: set }, {}, any);
      assert.equal(any.asked[0].params[4], null, JSON.stringify(set));
    }
  });
  test('a task: in its project\'s last status now, and last changed since the deal entered — the start\'s own word for "completed"', () => {
    assert.match(code, /t\.updated_at >= \$3 AND \$\{require\('\.\/journey-triggers'\)\.DONE_TASK\} LIMIT 1`, \[x\.workspace_id, x\.deal_id, x\.started_at\]\)/);
    assert.equal(typeof T.DONE_TASK, 'string');
    assert.match(read('routes/tasks.js'), /UPDATE tasks SET status=\$1, updated_at=NOW\(\) WHERE id=\$2 AND workspace_id=\$3/, 'changing a task\'s status is what stamps it');
  });
  test('the deal was taken into another workflow after it entered this one; a deal only written down as "was there already" is no entry', async () => {
    const config = { stop_on: ['other_flow'], stop_set: { other_flow: { flow_id: 9 } } };
    const hit = pool({ journey_runs: [{}] });
    assert.equal(await why(config, {}, hit), 'other_flow');
    assert.match(hit.asked[0].sql, /^SELECT 1 FROM journey_runs r WHERE r\.workspace_id = \$1 AND r\.deal_id = \$2 AND r\.started_at >= \$3 AND r\.flow_id = \$4 AND r\.status <> 'old' LIMIT 1$/);
    assert.deepEqual(hit.asked[0].params, [7, 60, X.started_at, 9]);
    assert.equal(await why(config, {}, pool()), null);
    for (const set of [undefined, {}, { other_flow: {} }, { other_flow: { flow_id: 'x' } }, { other_flow: { flow_id: 0 } }]) {
      const db = pool({ journey_runs: [{}] });
      assert.deepEqual([await why({ stop_on: ['other_flow'], stop_set: set }, {}, db), db.asked.length], [null, 0], 'a rule without its workflow asks nothing and ends nothing');
    }
  });
  test('a start that names none of them asks nothing; one that names several asks until one holds, in the list\'s order', async () => {
    const quiet = pool({ activities: [{}], fonio_calls: [{}], tasks: [{}] });
    assert.equal(await why({ stop_stage_ids: [32], stop_on: ['assigned', 'opt_out'] }, {}, quiet), null);
    assert.deepEqual(quiet.asked, []);
    const several = pool({ activities: [{}] });
    assert.equal(await why({ stop_on: ['task_done', 'meeting_cancelled', 'meeting', 'answered', 'call_inbound'] }, {}, several), 'meeting_booked');
    assert.deepEqual(several.asked.map(c => c.table), ['fonio_calls', 'fonio_other_calls', 'activities'], 'answered, called in, then the meeting — and nothing after the one that held');
  });
  test('the stage rules come first, and a start from before these rules, or none at all, ends nothing', async () => {
    const db = pool({ activities: [{}] });
    assert.equal(await why({ stop_stage_ids: [31], stop_on: ['meeting', 'assigned'] }, { assigned_to: 3 }, db), 'stop_stage');
    assert.equal(await why({ stay_stage_ids: [32], stop_on: ['meeting', 'assigned'] }, { assigned_to: 3 }, db), 'left_stages');
    assert.equal(await why({ stop_stage_ids: [32], stay_stage_ids: [31] }, {}, db), null, 'both stage rules: in a stage it is meant for, not in one it stops in');
    assert.equal(await why({ stop_stage_ids: [31], stay_stage_ids: [31] }, {}, db), 'stop_stage');
    assert.deepEqual(db.asked, []);
    for (const c of [undefined, null, {}, { stop_on: 'meeting', stop_set: 'x' }, { stop_on: ['weather'] }]) assert.equal(await why(c, { assigned_to: 3 }), null, JSON.stringify(c));
  });
});

describe('a call\'s result', () => {
  const body = lead_status => ({ lead_status });
  const call = (id, more = {}) => ({ id, result_body: {}, call_outcome: null, from_number: null, callback: false, retry: false, ...more });
  const config = results => ({ stop_on: ['call_result'], stop_set: { call_result: { results } } });
  // the two statements are told apart by what they ask for: calls with a result, and calls fonio never reported
  const db = (reported = [], silent = []) => pool({ fonio_calls: t => (/f\.result_at IS NULL/.test(t) ? silent : reported) });
  test('one of the chosen results, read with fonio\'s own reader as the start reads it', async () => {
    assert.equal(await why(config(['interested']), {}, db([call(5, { result_body: body('interested') })])), 'call_result');
    assert.equal(await why(config(['not_interested']), {}, db([call(5, { result_body: body('interested') })])), null);
    assert.equal(await why(config(['not_interested', 'wrong_person']), {}, db([call(6, { result_body: body('interested') }), call(5, { result_body: body('wrong_person') })])), 'call_result', 'any call since then');
    assert.equal(await why(config(['callback']), {}, db([call(5, { callback: true })])), 'call_result', 'a callback booked for it');
    assert.equal(await why(config(['not_reached']), {}, db([call(5, { call_outcome: 'no_answer' })])), 'call_result');
    assert.equal(await why(config(['not_reached']), {}, db([call(5, { call_outcome: 'no_answer', retry: true })])), null, 'the retries will still try: not "not reached" yet');
    assert.equal(await why(config(['not_reached']), {}, db([call(5, { call_outcome: 'answered' })])), null);
    assert.match(code, /fonioResult\.readResult\(r\.result_body \|\| \{\}, r\.from_number\)/);
    assert.match(code, /fonioStage\.eventOf\(\{ leadStatus: said\.leadStatus, meeting: !!said\.meeting, callback: !!r\.callback, outcome: said\.outcome \|\| r\.call_outcome \|\| null, retry: !!r\.retry \}\)/);
    assert.match(read('utils/journey-triggers.js'), /fonioStage\.eventOf\(\{ leadStatus: said\.leadStatus, meeting: !!said\.meeting, callback: !!r\.callback, outcome: said\.outcome \|\| r\.call_outcome \|\| null, retry: !!r\.retry \}\)/, 'the very line of the start');
  });
  test('asked for the deal or its contact, since the deal entered, a minute after the result came', async () => {
    const d = db([call(5, { result_body: body('interested') })]);
    await why(config(['interested']), {}, d);
    assert.equal(d.asked.length, 1, 'no second question when "not reached" is not among the results');
    assert.match(d.asked[0].sql, /WHERE f\.workspace_id = \$1 AND f\.result_at >= \$4 AND f\.result_at <= \$5 AND \(f\.deal_id = \$2 OR \(f\.deal_id IS NULL AND f\.contact_id = \$3\)\) ORDER BY f\.id DESC LIMIT 50$/);
    assert.match(d.asked[0].sql, /EXISTS \(SELECT 1 FROM fonio_calls y WHERE y\.follow_up_of = f\.id AND y\.trigger = 'callback'\) AS callback, EXISTS \(SELECT 1 FROM fonio_calls y WHERE y\.follow_up_of = f\.id AND y\.trigger = 'follow_up'\) AS retry/);
    assert.deepEqual(d.asked[0].params, [7, 60, 40, X.started_at, new Date(NOW.getTime() - T.RESULT_WAIT_MS)]);
    assert.equal(E.CALLS_LOOKED_AT, 50);
  });
  test('"not reached" is also a call fonio never reported and will not try again — the stage table\'s own rule', async () => {
    const off = { enabled: false }, twice = { enabled: true, max_attempts: 2 };
    const silent = more => ({ id: 9, follow_up_no: 0, follow_up: off, active: true, ...more });
    const d = db([], [silent()]);
    assert.equal(await why(config(['not_reached']), {}, d), 'call_result');
    assert.equal(d.asked.length, 2);
    assert.match(d.asked[1].sql, /WHERE f\.workspace_id = \$1 AND f\.status = 'sent' AND f\.result_at IS NULL AND f\.follow_up_at IS NULL AND f\.sent_at IS NOT NULL AND f\.sent_at >= \$4 AND f\.sent_at < \$5 AND w\.last_delivery IS NOT NULL AND \(f\.deal_id = \$2 OR \(f\.deal_id IS NULL AND f\.contact_id = \$3\)\)/);
    assert.deepEqual(d.asked[1].params, [7, 60, 40, X.started_at, new Date('2026-11-19T11:00:00Z')], 'sent since the deal entered, and an hour ago at least');
    assert.equal(require('../../utils/fonio-stage').UNREPORTED_MINUTES, 60);
    assert.equal(await why(config(['not_reached']), {}, db([], [silent({ follow_up: twice })])), null, 'the retries will try again: left for them');
    assert.equal(await why(config(['not_reached']), {}, db([], [silent({ follow_up: twice, follow_up_no: 2 })])), 'call_result', 'the last try');
    assert.equal(await why(config(['not_reached']), {}, db([], [silent({ follow_up: twice, active: false })])), 'call_result', 'fonio switched off: nothing tries again');
    assert.equal(await why(config(['not_reached']), {}, db([], [])), null);
    assert.equal(await why(config(['interested', 'callback']), {}, db([], [silent()])), null, 'a call without a result says nothing about any other result');
  });
  test('a rule without its results asks nothing and ends nothing', async () => {
    for (const set of [undefined, {}, { call_result: {} }, { call_result: { results: [] } }, { call_result: { results: 'interested' } }]) {
      const d = db([call(5, { result_body: body('interested') })], [{ id: 9, follow_up_no: 0, follow_up: {}, active: true }]);
      assert.deepEqual([await why({ stop_on: ['call_result'], stop_set: set }, {}, d), d.asked.length], [null, 0], JSON.stringify(set));
    }
  });
});

describe('how it is built', () => {
  test('nothing typed by a person is put into a statement, and every statement carries the workspace', () => {
    const statements = [...code.matchAll(/`(SELECT[^`]*)`|'(SELECT[^']*)'/g)].map(m => m[1] || m[2]);
    assert.equal(statements.length, 10, 'three for what a rule names, seven for what happened');
    for (const s of statements) {
      assert.match(s, /workspace_id = \$[12]/, s.slice(0, 70));
      assert.doesNotMatch(s.replace(/\$\{FOR_DEAL\('[a-z]+'\)\}|\$\{CALLS_LOOKED_AT\}|\$\{require\('\.\/journey-triggers'\)\.DONE_TASK\}/g, ''), /\$\{/, s.slice(0, 70));
    }
    assert.match(code, /^const FOR_DEAL = a => `\(\$\{a\}\.deal_id = \$2 OR \(\$\{a\}\.deal_id IS NULL AND \$\{a\}\.contact_id = \$3\)\)`;$/m);
    assert.doesNotMatch(code, /custom_data|->>/, 'a field is never read by a statement here: the row\'s fields are looked into in code');
  });
  test('it opens nothing itself, and loads neither the start\'s file nor fonio\'s large one until they are needed', () => {
    const top = [...code.matchAll(/^const \w+\s+= require\('([^']+)'\)/gm)].map(m => m[1]);
    assert.deepEqual(top, ['./journey-branch', './fonio-result', './fonio-stage']);
    assert.doesNotMatch(code, /require\('\.\.\/db'\)|require\('\.\/db'\)|notifications/);
    assert.deepEqual(Object.keys(E).sort(), ['CALLS_LOOKED_AT', 'ONBOARDING_DONE', 'REASONS', 'STOP_CATEGORIES', 'STOP_ON', 'STOP_USES', 'checkEnds', 'foreignEnds', 'isRule', 'reasonOf', 'rulesOf', 'settingsOf']);
  });
  test('the questions a branch box asks too are asked of the branch box\'s file, so the two cannot answer differently', () => {
    for (const line of ["assigned:        x => branch.holds(null, x, { test: 'assigned' }),", "opt_out:         x => branch.holds(null, x, { test: 'opt_out' }),",
      'answered:          (pool, x) => branch.answeredSince(pool, x),', 'meeting:           (pool, x) => branch.meetingSince(pool, x),']) assert.ok(code.includes(line), line);
    assert.match(code, /branch\.holds\(null, x, \{ test: 'field', field_key: s\.field_key, value: s\.value \}\)/);
    assert.match(code, /branch\.holds\(null, \{ deal_data: x\.contact_data \}, \{ test: 'field', field_key: s\.field_key, value: s\.value \}\)/);
  });
  test('the engine reads what the rules look at, with the row it has in hand', () => {
    const engine = read('utils/journey-run.js');
    const one = engine.slice(engine.indexOf('async function runOne('), engine.indexOf('// ── taking deals in'));
    assert.match(one, /d\.stage_id, d\.contact_id, d\.assigned_to, d\.urgency, d\.custom_data AS deal_data,/);
    assert.match(one, /c\.journey_opt_out,\s+c\.custom_data AS contact_data, c\.onboarding_status\s+FROM journey_runs r/);
    assert.match(one, /SELECT r\.id, r\.workspace_id, r\.flow_id, r\.deal_id, r\.node_id, r\.started_at,/);
    assert.match(engine, /async function stopReason\(pool, x, now = new Date\(\)\) \{/);
  });
});
