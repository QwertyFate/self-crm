// UNIT tests for utils/journey-branch.js (CUSTOMER_JOURNEY_CHANGES Part 11, 2026-11-19): a workflow's branch box —
// the question it asks about a deal, and whether the answer is yes.
//
// What is saved (checkBranch), what a question may name (foreignRefs), and the answer for each question (holds). The
// two questions that look into the database — a meeting booked, a call that reached the person — are asked with a
// stand-in pool here and were answered by a real throwaway Postgres as well (see the change log).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const branch = require('../../utils/journey-branch');

// a pool that answers with the rows it is given and writes down what it was asked
function fakePool(rows = []) {
  const asked = [];
  return { asked, query: async (sql, params) => { asked.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); return { rows }; } };
}
const DEAL = { workspace_id: 7, deal_id: 60, contact_id: 40, started_at: new Date('2026-11-19T08:00:00Z'), stage_id: 31, urgency: 2, assigned_to: 3,
  deal_data: { finanzierung: 'Ja', budget: 250000, leer: '', nichts: null, flag: false }, contact_email: 'erika@example.de', contact_phone: '+49 151 1234567', journey_opt_out: false };
const yes = (config, more = {}, pool = fakePool()) => branch.holds(pool, { ...DEAL, ...more }, config);

describe('what is saved', () => {
  test('the nine questions, each kept with only what it uses', () => {
    assert.deepEqual(branch.TESTS, ['stage', 'meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned', 'urgency', 'field']);
    for (const test of ['meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned']) {
      assert.deepEqual(branch.checkBranch({ test, stage_ids: [1], min_urgency: 2, field_key: 'x', value: 'y', more: true }), { config: { test } }, test);
    }
    assert.deepEqual(branch.checkBranch({ test: 'stage', stage_ids: [32, 31, 32], min_urgency: 2 }), { config: { test: 'stage', stage_ids: [32, 31] } }, 'a stage named twice is one');
    assert.deepEqual(branch.checkBranch({ test: 'urgency', min_urgency: 4, stage_ids: [1] }), { config: { test: 'urgency', min_urgency: 4 } });
    assert.deepEqual(branch.checkBranch({ test: 'field', field_key: 'finanzierung', value: '  Ja  ' }), { config: { test: 'field', field_key: 'finanzierung', value: 'Ja' } });
    for (const value of [undefined, null, '', '   ']) assert.deepEqual(branch.checkBranch({ test: 'field', field_key: 'finanzierung', value }), { config: { test: 'field', field_key: 'finanzierung' } }, 'no value: any value counts');
  });
  test('refused: no question, one that is none, or one without what it needs', () => {
    for (const raw of [undefined, null, 'meeting', ['meeting'], {}, { test: 5 }, { test: 'weather' }, { test: 'constructor' }, { test: 'toString' }, { test: ['stage'] }]) assert.deepEqual(branch.checkBranch(raw), { code: 'branch' }, JSON.stringify(raw));
    for (const stage_ids of [undefined, [], '31', [31, '32'], [0], [-1], [1.5], [1e10], Array.from({ length: 21 }, (_, i) => i + 1)]) assert.deepEqual(branch.checkBranch({ test: 'stage', stage_ids }), { code: 'stage' }, JSON.stringify(stage_ids));
    assert.equal(branch.checkBranch({ test: 'stage', stage_ids: Array.from({ length: 20 }, (_, i) => i + 1) }).config.stage_ids.length, 20, 'twenty are the most');
    for (const min_urgency of [undefined, 0, 5, 2.5, '3', null]) assert.deepEqual(branch.checkBranch({ test: 'urgency', min_urgency }), { code: 'branch' }, String(min_urgency));
    for (const field_key of [undefined, '', 'two words', 7, 'x'.repeat(121), 'tab\there']) assert.deepEqual(branch.checkBranch({ test: 'field', field_key }), { code: 'field' }, String(field_key));
    for (const value of [7, true, ['ja'], 'x'.repeat(201)]) assert.deepEqual(branch.checkBranch({ test: 'field', field_key: 'f', value }), { code: 'branch' }, String(value).slice(0, 20));
    assert.equal(branch.checkBranch({ test: 'field', field_key: 'f', value: 'x'.repeat(200) }).config.value.length, 200);
  });
  test('what a question names must be the workspace\'s own: every stage, and a deal field', async () => {
    const stages = fakePool([{ id: 31 }, { id: 32 }]);
    assert.equal(await branch.foreignRefs(stages, 7, { test: 'stage', stage_ids: [31, 32] }), null);
    assert.deepEqual(stages.asked, [{ sql: 'SELECT id FROM pipeline_stages WHERE workspace_id = $1 AND id = ANY($2::int[])', params: [7, [31, 32]] }]);
    assert.equal(await branch.foreignRefs(fakePool([{ id: 31 }]), 7, { test: 'stage', stage_ids: [31, 91] }), 'stage', 'one of them is not this workspace\'s');
    const field = fakePool([{ type: 'text' }]);
    assert.equal(await branch.foreignRefs(field, 7, { test: 'field', field_key: "x'; DROP TABLE deals; --" }), null);
    assert.deepEqual(field.asked, [{ sql: 'SELECT type FROM deal_fields WHERE workspace_id = $1 AND field_key = $2', params: [7, "x'; DROP TABLE deals; --"] }], 'the key is a value, never a part of what is asked');
    assert.equal(await branch.foreignRefs(fakePool([]), 7, { test: 'field', field_key: 'gone' }), 'field');
    const none = fakePool();
    for (const config of [{ test: 'meeting' }, { test: 'assigned' }, {}, null]) assert.equal(await branch.foreignRefs(none, 7, config), null);
    assert.equal(none.asked.length, 0, 'a question that names nothing asks the database nothing');
  });
});

describe('the answer', () => {
  test('stage: the deal is in one of the named stages, as it is now', async () => {
    assert.equal(await yes({ test: 'stage', stage_ids: [31, 32] }), true);
    assert.equal(await yes({ test: 'stage', stage_ids: [32] }), false);
    assert.equal(await yes({ test: 'stage', stage_ids: ['31'] }, { stage_id: '31' }), true, 'ids as the database hands them over');
    for (const stage_id of [null, undefined, 0]) assert.equal(await yes({ test: 'stage', stage_ids: [31] }, { stage_id }), false, 'a deal in no stage is in none of them');
    assert.equal(await yes({ test: 'stage' }), false);
  });
  test('the contact: said "no more emails", has an email address, has a phone number', async () => {
    assert.equal(await yes({ test: 'opt_out' }), false); assert.equal(await yes({ test: 'opt_out' }, { journey_opt_out: true }), true);
    assert.equal(await yes({ test: 'has_email' }), true);
    for (const contact_email of [null, undefined, '', '   ', 'erika', 'erika@', 'erika@example', '@example.de']) assert.equal(await yes({ test: 'has_email' }, { contact_email }), false, String(contact_email));
    assert.equal(await yes({ test: 'has_email' }, { contact_email: '  erika@example.de ' }), true);
    assert.equal(await yes({ test: 'has_phone' }), true);
    for (const contact_phone of [null, undefined, '', '   ']) assert.equal(await yes({ test: 'has_phone' }, { contact_phone }), false, String(contact_phone));
  });
  test('the deal: assigned to someone, urgent enough', async () => {
    assert.equal(await yes({ test: 'assigned' }), true);
    for (const assigned_to of [null, undefined, 0]) assert.equal(await yes({ test: 'assigned' }, { assigned_to }), false);
    assert.deepEqual(await Promise.all([1, 2, 3, 4].map(min_urgency => yes({ test: 'urgency', min_urgency }))), [true, true, false, false], 'urgency 2: at least 1 and 2, not 3 or 4');
    assert.equal(await yes({ test: 'urgency', min_urgency: 1 }, { urgency: 0 }), false); assert.equal(await yes({ test: 'urgency', min_urgency: 1 }, { urgency: null }), false);
    assert.equal(await yes({ test: 'urgency', min_urgency: 4 }, { urgency: 4 }), true);
  });
  test('a deal field: any value, or this one — capitals and outer spaces do not count', async () => {
    assert.equal(await yes({ test: 'field', field_key: 'finanzierung' }), true);
    for (const field_key of ['leer', 'nichts', 'gibtsnicht']) assert.equal(await yes({ test: 'field', field_key }), false, field_key);
    assert.equal(await yes({ test: 'field', field_key: 'flag' }), true, '"false" is a value that was given');
    for (const value of ['Ja', 'ja', ' JA ']) assert.equal(await yes({ test: 'field', field_key: 'finanzierung', value }), true, value);
    assert.equal(await yes({ test: 'field', field_key: 'finanzierung', value: 'nein' }), false);
    assert.equal(await yes({ test: 'field', field_key: 'finanzierung', value: 'j' }), false, 'the whole value, not a part of it');
    assert.equal(await yes({ test: 'field', field_key: 'budget', value: '250000' }), true, 'a number is compared as it is written');
    assert.equal(await yes({ test: 'field', field_key: 'finanzierung' }, { deal_data: { finanzierung: '  ' } }), false, 'spaces are no value');
  });
  test('only the deal\'s own fields are looked into, and a deal without any has none', async () => {
    for (const field_key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(await yes({ test: 'field', field_key }), false, field_key);
    for (const deal_data of [null, undefined, 'x', 7]) assert.equal(await yes({ test: 'field', field_key: 'finanzierung' }, { deal_data }), false, String(deal_data));
  });
  test('a meeting booked, a call that reached the person: asked of the database, for the deal or its contact, since the deal entered', async () => {
    for (const [fn, text] of [['meetingSince', 'FROM activities a WHERE a.workspace_id = $1 AND a.type = \'meeting\' AND a.source IN (\'calcom\',\'calendly\') AND a.cancelled_at IS NULL AND a.created_at >= $4 AND (a.deal_id = $2 OR (a.deal_id IS NULL AND a.contact_id = $3)) LIMIT 1'],
      ['answeredSince', 'FROM fonio_calls f WHERE f.workspace_id = $1 AND f.call_outcome = \'answered\' AND f.result_at >= $4 AND (f.deal_id = $2 OR (f.deal_id IS NULL AND f.contact_id = $3)) LIMIT 1']]) {
      const found = fakePool([{ '?column?': 1 }]);
      assert.equal(await branch[fn](found, DEAL), true);
      assert.deepEqual(found.asked, [{ sql: `SELECT 1 ${text}`, params: [7, 60, 40, DEAL.started_at] }], fn);
      assert.equal(await branch[fn](fakePool([]), DEAL), false);
      const noContact = fakePool([]);
      await branch[fn](noContact, { ...DEAL, contact_id: undefined });
      assert.equal(noContact.asked[0].params[2], null, 'a deal without a contact asks for no contact, not for "undefined"');
    }
    const booked = fakePool([{}]), none = fakePool([]);
    assert.deepEqual([await yes({ test: 'meeting' }, {}, booked), await yes({ test: 'meeting' }, {}, none), await yes({ test: 'answered' }, {}, booked), await yes({ test: 'answered' }, {}, none)], [true, false, true, false]);
    assert.match(booked.asked[0].sql, /FROM activities a/); assert.match(booked.asked[1].sql, /FROM fonio_calls f/);
  });
  test('only those two ask the database; a question nobody knows is answered with no', async () => {
    const pool = fakePool([{}]);
    for (const config of [{ test: 'stage', stage_ids: [31] }, { test: 'opt_out' }, { test: 'has_email' }, { test: 'has_phone' }, { test: 'assigned' }, { test: 'urgency', min_urgency: 1 }, { test: 'field', field_key: 'finanzierung' }]) await yes(config, {}, pool);
    assert.equal(pool.asked.length, 0);
    for (const config of [{ test: 'weather' }, {}, null, undefined, { test: 'constructor' }]) assert.equal(await yes(config, {}, pool), false, JSON.stringify(config));
    assert.equal(pool.asked.length, 0);
  });
});

describe('how it is built', () => {
  const code = read('utils/journey-branch.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens nothing itself: the pool is handed in', () => {
    assert.doesNotMatch(code, /require\(/);
    assert.deepEqual(Object.keys(branch).sort(), ['MAX_STAGES', 'MAX_URGENCY', 'MAX_VALUE', 'TESTS', 'answeredSince', 'checkBranch', 'foreignRefs', 'holds', 'meetingSince']);
  });
  test('nothing typed by a person is put into a statement', () => {
    const statements = [...code.matchAll(/\.query\(\s*(?:`([^`]*)`|'([^']*)')/g)].map(m => m[1] || m[2]);
    assert.equal(statements.length, 4);
    for (const s of statements) { assert.doesNotMatch(s, /\$\{/, s.slice(0, 60)); assert.match(s, /workspace_id = \$1/, s.slice(0, 60)); }
  });
});
