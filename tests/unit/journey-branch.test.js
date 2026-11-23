// UNIT tests for utils/journey-branch.js (CUSTOMER_JOURNEY_CHANGES Part 11, 2026-11-19): a workflow's branch box —
// the question it asks about a deal, and whether the answer is yes.
//
// What is saved (checkBranch), what a question may name (foreignRefs), and the answer for each question (holds). The
// two questions that look into the database — a meeting booked, a call that reached the person — are asked with a
// stand-in pool here and were answered by a real throwaway Postgres as well (see the change log).
//
// Part 20 (2026-11-23): the same question about a field of the deal's CONTACT, and for both field questions a
// comparison (config.op) — empty, is not, contains, does not contain, starts with, and four by size.
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
  deal_data: { finanzierung: 'Ja', budget: 250000, leer: '', nichts: null, flag: false },
  contact_data: { finanzierung: 'Genehmigt (Bank)', budget: '300.000 €', einzug: '2027-03-31', zimmer: '3,5', leer: ' ' }, contact_email: 'erika@example.de', contact_phone: '+49 151 1234567', journey_opt_out: false };
const yes = (config, more = {}, pool = fakePool()) => branch.holds(pool, { ...DEAL, ...more }, config);

describe('what is saved', () => {
  test('the fourteen questions, each kept with only what it uses', () => {
    assert.deepEqual(branch.TESTS, ['stage', 'meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned', 'urgency', 'field', 'contact_field', 'deal_owner', 'contact_owner', 'deal_age', 'contact_age']);
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
    const contact = fakePool([{ type: 'dropdown' }]);
    assert.equal(await branch.foreignRefs(contact, 7, { test: 'contact_field', field_key: "x'; DROP TABLE contacts; --" }), null);
    assert.deepEqual(contact.asked, [{ sql: 'SELECT type FROM custom_fields WHERE workspace_id = $1 AND field_key = $2', params: [7, "x'; DROP TABLE contacts; --"] }], 'a contact field is looked for among the contact fields');
    assert.equal(await branch.foreignRefs(fakePool([]), 7, { test: 'contact_field', field_key: 'gone' }), 'field');
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
    for (const config of [{ test: 'stage', stage_ids: [31] }, { test: 'opt_out' }, { test: 'has_email' }, { test: 'has_phone' }, { test: 'assigned' }, { test: 'urgency', min_urgency: 1 }, { test: 'field', field_key: 'finanzierung' },
      { test: 'contact_field', field_key: 'budget', op: 'gt', value: '1' }]) await yes(config, {}, pool);
    assert.equal(pool.asked.length, 0);
    for (const config of [{ test: 'weather' }, {}, null, undefined, { test: 'constructor' }]) assert.equal(await yes(config, {}, pool), false, JSON.stringify(config));
    assert.equal(pool.asked.length, 0);
  });
});

// Part 20: a field of the deal's contact, and how a field is compared.
describe('a contact field, and the comparisons of both field questions', () => {
  const C = (field_key, op, value) => ({ test: 'contact_field', field_key, ...(op === undefined ? {} : { op }), ...(value === undefined ? {} : { value }) });
  const D = (field_key, op, value) => ({ ...C(field_key, op, value), test: 'field' });
  test('what is saved: the field, the comparison and its value — "any" and "is" as before, without a word for the comparison', () => {
    assert.deepEqual([branch.FIELD_TESTS, branch.OPS, branch.OPS_BARE, branch.OPS_SIZE],
      [['field', 'contact_field'], ['any', 'empty', 'is', 'is_not', 'contains', 'not_contains', 'starts', 'gt', 'gte', 'lt', 'lte'], ['any', 'empty'], ['gt', 'gte', 'lt', 'lte']]);
    for (const test of branch.FIELD_TESTS) {
      const kept = raw => branch.checkBranch({ test, field_key: 'f', stage_ids: [1], more: 1, ...raw });
      assert.deepEqual(kept({}), { config: { test, field_key: 'f' } });
      assert.deepEqual(kept({ value: ' Ja ' }), { config: { test, field_key: 'f', value: 'Ja' } }, 'no comparison named, a value: "is"');
      assert.deepEqual(kept({ op: 'any', value: 'x' }), { config: { test, field_key: 'f' } }, '"any" keeps no value');
      assert.deepEqual(kept({ op: 'is', value: 'x' }), { config: { test, field_key: 'f', value: 'x' } });
      assert.deepEqual(kept({ op: 'empty', value: 'x' }), { config: { test, field_key: 'f', op: 'empty' } });
      for (const op of ['is_not', 'contains', 'not_contains', 'starts']) assert.deepEqual(kept({ op, value: '  Bank ' }), { config: { test, field_key: 'f', op, value: 'Bank' } }, op);
      for (const op of branch.OPS_SIZE) {
        for (const value of ['250000', '300.000', '2,5', '31.12.2027', '2027-12-31']) assert.deepEqual(kept({ op, value }), { config: { test, field_key: 'f', op, value } }, `${op} ${value}`);
        for (const value of ['viel', '31.13.2027', '12abc']) assert.deepEqual(kept({ op, value }), { code: 'branch' }, `${op} ${value}: nothing with a size`);
      }
      for (const op of branch.OPS.filter(o => !branch.OPS_BARE.includes(o))) for (const value of [undefined, null, '', '   ']) assert.deepEqual(kept({ op, value }), { code: 'branch' }, `${op}: nothing to compare with`);
      for (const op of ['weather', 'constructor', 'toString', '', 5, ['is'], {}]) assert.deepEqual(kept({ op, value: 'x' }), { code: 'branch' }, String(op));
      assert.deepEqual(kept({ field_key: 'two words' }), { code: 'field' });
      assert.deepEqual(kept({ op: 'contains', value: 'x'.repeat(201) }), { code: 'branch' });
    }
  });
  test('a number: plain, with a comma or a point, with points every three digits, with a sign of money around it', () => {
    const cases = [['250000', 250000], ['2,5', 2.5], ['2.5', 2.5], ['-3', -3], ['007', 7], ['300.000', 300000], ['1.234.567', 1234567], ['300.000,50', 300000.5], ['1,234.56', 1234.56], ['1,234,567.5', 1234567.5],
      [' 300.000 € ', 300000], ['€ 5', 5], ['12 %', 12], ['250 000', 250000], ['1500 EUR', 1500], ['$20', 20], [250000, 250000]];
    for (const [text, n] of cases) assert.equal(branch.numOf(text), n, String(text));
    for (const text of ['', '  ', 'abc', '12abc', '1.5.', '12.34.567', '1.2.2027', '2027-03-31', '1,2,3', '.5', '5.', '--5', null, undefined, 'Infinity', '1e5']) assert.equal(branch.numOf(text), null, String(text));
  });
  test('a day: 2027-03-31 (a time behind it does not count) or 31.03.2027 — only a day there is', () => {
    for (const [text, day] of [['2027-03-31', '2027-03-31'], ['31.03.2027', '2027-03-31'], ['1.2.2027', '2027-02-01'], [' 2027-03-31 ', '2027-03-31'], ['2027-03-31T10:00:00Z', '2027-03-31'], ['2027-03-31 10:00', '2027-03-31'], ['29.02.2028', '2028-02-29']]) assert.equal(branch.dayOf(text), day, text);
    for (const text of ['', 'morgen', '2027-02-30', '31.13.2027', '29.02.2027', '2027-3-1', '31.03.27', '2027-03-31x', '0000-01-01', '300.000', null, undefined, 20270331]) assert.equal(branch.dayOf(text), null, String(text));
  });
  test('the contact\'s field is read from the contact, the deal\'s from the deal', async () => {
    assert.equal(await yes(C('einzug')), true); assert.equal(await yes(D('einzug')), false, 'the deal has no such field');
    assert.equal(await yes(C('flag')), false); assert.equal(await yes(D('flag')), true);
    assert.equal(await yes(C('finanzierung', 'is', 'genehmigt (bank)')), true); assert.equal(await yes(D('finanzierung', 'is', 'genehmigt (bank)')), false);
    assert.equal(await yes(D('finanzierung', undefined, 'ja')), true, 'a box saved before Part 20 is answered as before');
    for (const field_key of ['leer', 'gibtsnicht', 'constructor', '__proto__']) assert.equal(await yes(C(field_key)), false, field_key);
    for (const contact_data of [null, undefined, 'x', 7]) assert.equal(await yes(C('einzug'), { contact_data }), false, String(contact_data));
  });
  test('a deal without a contact answers every question about a contact field with no', async () => {
    for (const contact_id of [null, undefined, 0]) {
      for (const [op, value] of [['any'], ['empty'], ['is_not', 'x'], ['not_contains', 'x'], ['is', ''], ['lt', '5']]) assert.equal(await yes(C('einzug', op, value), { contact_id, contact_data: null }), false, `${op} ${contact_id}`);
    }
    assert.equal(await yes(C('gibtsnicht', 'empty')), true, 'with a contact, a field it does not have is empty');
    assert.equal(await yes(C('gibtsnicht', 'empty'), { contact_data: {} }), true, 'a contact with no fields at all is a contact');
    // found on the real database (2026-11-23): a deal that names a contact of another workspace has an id and no
    // contact — the engine reads nothing of it, and nothing is what the question is asked about
    for (const [op, value] of [['any'], ['empty'], ['is_not', 'x'], ['not_contains', 'x'], ['lte', '5']]) {
      for (const contact_data of [null, undefined, 'x', 7]) assert.equal(await yes(C('einzug', op, value), { contact_id: 40, contact_data }), false, `${op}: an id alone is no contact`);
    }
  });
  test('empty, is not, contains, does not contain, starts with — capitals and outer spaces never count', async () => {
    const asked = [
      ['finanzierung', 'empty', undefined, false], ['leer', 'empty', undefined, true], ['gibtsnicht', 'empty', undefined, true],
      ['finanzierung', 'is_not', 'abgelehnt', true], ['finanzierung', 'is_not', ' GENEHMIGT (bank) ', false], ['leer', 'is_not', 'abgelehnt', true],
      ['finanzierung', 'contains', 'BANK', true], ['finanzierung', 'contains', 'sparkasse', false], ['leer', 'contains', 'x', false],
      ['finanzierung', 'not_contains', 'sparkasse', true], ['finanzierung', 'not_contains', 'bank', false], ['leer', 'not_contains', 'x', true],
      ['finanzierung', 'starts', 'geneh', true], ['finanzierung', 'starts', 'bank', false], ['leer', 'starts', 'x', false],
    ];
    for (const [key, op, value, answer] of asked) assert.equal(await yes(C(key, op, value)), answer, `${key} ${op} ${value}`);
    for (const op of ['contains', 'not_contains', 'starts']) assert.equal(await yes(C('finanzierung', op, '  ')), false, `${op} with nothing to look for is no`);
  });
  test('by size: two numbers or two days; what is neither on both sides is no', async () => {
    const asked = [
      ['budget', 'gt', '250000', true], ['budget', 'gt', '300000', false], ['budget', 'gte', '300.000', true], ['budget', 'lt', '300000', false], ['budget', 'lt', '300.001', true], ['budget', 'lte', '300000,00', true],
      ['zimmer', 'gt', '3', true], ['zimmer', 'lt', '3.5', false], ['zimmer', 'lte', '3.5', true], ['zimmer', 'gte', '4', false],
      ['einzug', 'gt', '30.03.2027', true], ['einzug', 'gt', '2027-03-31', false], ['einzug', 'gte', '31.03.2027', true], ['einzug', 'lt', '01.04.2027', true], ['einzug', 'lte', '2027-03-30', false],
      ['finanzierung', 'gt', '1', false], ['finanzierung', 'lt', '1', false], ['leer', 'lt', '5', false], ['gibtsnicht', 'lte', '5', false],
      ['einzug', 'gt', '5', false], ['einzug', 'lt', '5', false], ['budget', 'lt', '31.12.2027', false], ['budget', 'gt', 'viel', false],
    ];
    for (const [key, op, value, answer] of asked) assert.equal(await yes(C(key, op, value)), answer, `${key} ${op} ${value}`);
    assert.equal(await yes(D('budget', 'gte', '250.000')), true, 'a deal field alike: a number kept as a number');
    assert.equal(await yes(D('budget', 'lt', '250000')), false);
  });
  test('a comparison this server does not know is answered with no', async () => {
    for (const op of ['weather', 'constructor', '', 5]) for (const config of [C('einzug', op, 'x'), D('finanzierung', op, 'Ja')]) assert.equal(await yes(config), false, String(op));
  });
});

// Part 21 (2026-11-23): what every contact has — name, email, phone, company — asked like a field.
describe('a contact\'s name, email, phone and company', () => {
  const WHO = { contact_name: ' Erika Muster ', contact_email: 'Erika@Example.de', contact_phone: '+49 151 1234567', contact_company: 'Muster GmbH' };
  const B = (base, op, value) => ({ test: 'contact_field', base, ...(op === undefined ? {} : { op }), ...(value === undefined ? {} : { value }) });
  test('what is saved: the word for it instead of a field\'s key, with the comparison and its value', () => {
    assert.deepEqual(branch.CONTACT_BASE, ['name', 'email', 'phone', 'company']);
    for (const base of branch.CONTACT_BASE) {
      assert.deepEqual(branch.checkBranch({ ...B(base), field_key: 'email', stage_ids: [1] }), { config: { test: 'contact_field', base } }, 'a key sent beside it is not kept');
      assert.deepEqual(branch.checkBranch(B(base, 'contains', ' GmbH ')), { config: { test: 'contact_field', base, op: 'contains', value: 'GmbH' } });
      assert.deepEqual(branch.checkBranch(B(base, undefined, 'x')), { config: { test: 'contact_field', base, value: 'x' } });
      assert.deepEqual(branch.checkBranch(B(base, 'empty', 'x')), { config: { test: 'contact_field', base, op: 'empty' } });
      assert.deepEqual(branch.checkBranch(B(base, 'starts')), { code: 'branch' }, 'a comparison still needs its value');
    }
    for (const base of ['', 'city', 'constructor', 'toString', '__proto__', 'Name', 5, ['name'], {}, true]) assert.deepEqual(branch.checkBranch({ test: 'contact_field', base, field_key: 'f' }), { code: 'field' }, String(base));
    for (const base of [undefined, null]) assert.deepEqual(branch.checkBranch({ test: 'contact_field', base, field_key: 'f' }), { config: { test: 'contact_field', field_key: 'f' } }, 'none named: a field of the workspace');
    assert.deepEqual(branch.checkBranch({ test: 'field', base: 'company', field_key: 'f' }), { config: { test: 'field', field_key: 'f' } }, 'a deal has no such word: its key counts');
    assert.deepEqual(branch.checkBranch({ test: 'field', base: 'company' }), { code: 'field' });
  });
  test('it needs no looking up: the database is asked nothing', async () => {
    const pool = fakePool([]);
    for (const base of branch.CONTACT_BASE) assert.equal(await branch.foreignRefs(pool, 7, { test: 'contact_field', base }), null, base);
    assert.equal(pool.asked.length, 0);
    assert.equal(await branch.foreignRefs(pool, 7, { test: 'contact_field', field_key: 'email' }), 'field', 'a FIELD with the key "email" is looked up like any field');
    assert.equal(pool.asked.length, 1);
  });
  test('the answer is read from the contact itself, with every comparison', async () => {
    const asked = [
      ['name', 'any', undefined, true], ['name', 'is', 'erika muster', true], ['name', 'starts', 'Erika', true], ['name', 'contains', 'schmidt', false],
      ['email', 'is', 'erika@example.de', true], ['email', 'contains', '@EXAMPLE.', true], ['email', 'not_contains', 'gmail', true], ['email', 'is_not', 'erika@example.de', false], ['email', 'empty', undefined, false],
      ['phone', 'starts', '+49', true], ['phone', 'starts', '+43', false], ['phone', 'contains', '151', true], ['phone', 'gt', '5', false],
      ['company', 'contains', 'gmbh', true], ['company', 'is', 'Muster', false], ['company', 'is_not', 'Muster AG', true], ['company', 'empty', undefined, false],
    ];
    for (const [base, op, value, answer] of asked) assert.equal(await yes(B(base, op, value), WHO), answer, `${base} ${op} ${value}`);
    assert.equal(await yes(B('company', undefined, 'muster gmbh'), WHO), true, 'no comparison named, a value: "is"');
    assert.equal(await yes(B('company'), WHO), true, 'none named, no value: "any"');
    for (const contact_company of [null, undefined, '', '   ']) {
      assert.equal(await yes(B('company', 'empty'), { ...WHO, contact_company }), true, `no company: ${contact_company}`);
      assert.equal(await yes(B('company', 'any'), { ...WHO, contact_company }), false);
    }
    assert.equal(await yes(B('company', 'gte', '100'), { ...WHO, contact_company: '250' }), true, 'by size, where it is a number');
  });
  test('it is the contact\'s own, not a field that happens to have the same key', async () => {
    const more = { ...WHO, contact_data: { email: 'feld@example.de', company: 'Feld AG' }, deal_data: { company: 'Deal AG' } };
    assert.equal(await yes(B('email', 'is', 'erika@example.de'), more), true); assert.equal(await yes(B('email', 'is', 'feld@example.de'), more), false);
    assert.equal(await yes({ test: 'contact_field', field_key: 'email', value: 'feld@example.de' }, more), true, 'the field of that key is still asked by its key');
    assert.equal(await yes(B('company', 'is', 'Deal AG'), more), false);
  });
  test('no contact: no — and a word nobody knows: no', async () => {
    for (const contact_data of [null, undefined]) for (const [op, value] of [['any'], ['empty'], ['is_not', 'x'], ['not_contains', 'x']]) assert.equal(await yes(B('company', op, value), { ...WHO, contact_data }), false, `${op}`);
    for (const base of ['city', 'constructor', 'toString', '__proto__', '', 5]) for (const op of ['any', 'empty', 'is_not']) assert.equal(await yes(B(base, op, 'x'), WHO), false, `${base} ${op}`);
    const pool = fakePool([{}]);
    await yes(B('email', 'contains', 'x'), WHO, pool);
    assert.equal(pool.asked.length, 0, 'the database is not asked');
  });
});

// Part 22 (2026-11-23): who the deal or its contact is assigned to, and when it was created.
describe('who it is assigned to, and when it was created', () => {
  const NOW = new Date('2026-11-23T12:00:00Z');
  const ask = (config, more = {}) => branch.holds(fakePool(), { ...DEAL, contact_assigned_to: 4, deal_created_at: new Date('2026-10-24T12:00:00Z'), contact_created_at: '2026-11-22T12:00:00.000Z', ...more }, config, { now: NOW });
  test('what is saved: the way of asking with what it needs, and nothing else', () => {
    assert.deepEqual([branch.OWNER_TESTS, branch.OWNER_OPS, branch.AGE_TESTS, branch.AGE_OPS, branch.MAX_PEOPLE, branch.MAX_AGE],
      [['deal_owner', 'contact_owner'], ['is', 'is_not', 'nobody'], ['deal_age', 'contact_age'], ['older', 'newer', 'before', 'after'], 20, 5256000]);
    for (const test of branch.OWNER_TESTS) {
      assert.deepEqual(branch.checkBranch({ test, op: 'is', user_ids: [4, 3, 4], field_key: 'x', minutes: 5 }), { config: { test, op: 'is', user_ids: [4, 3] } });
      assert.deepEqual(branch.checkBranch({ test, op: 'is_not', user_ids: [3] }), { config: { test, op: 'is_not', user_ids: [3] } });
      assert.deepEqual(branch.checkBranch({ test, op: 'nobody', user_ids: [3] }), { config: { test, op: 'nobody' } });
      for (const op of [undefined, null, '', 'anybody', 'constructor', 5, ['is']]) assert.deepEqual(branch.checkBranch({ test, op, user_ids: [3] }), { code: 'branch' }, String(op));
      for (const user_ids of [undefined, null, [], '3', [3, '4'], [0], [-1], [1.5], [1e10], Array.from({ length: 21 }, (_, i) => i + 1)]) for (const op of ['is', 'is_not']) assert.deepEqual(branch.checkBranch({ test, op, user_ids }), { code: 'user' }, JSON.stringify(user_ids));
      assert.equal(branch.checkBranch({ test, op: 'is', user_ids: Array.from({ length: 20 }, (_, i) => i + 1) }).config.user_ids.length, 20);
    }
    for (const test of branch.AGE_TESTS) {
      assert.deepEqual(branch.checkBranch({ test, op: 'older', minutes: 43200, date: '2026-12-31', user_ids: [3] }, { tz: 'Europe/Berlin' }), { config: { test, op: 'older', minutes: 43200 } }, 'a length of time keeps no zone');
      assert.deepEqual(branch.checkBranch({ test, op: 'newer', minutes: 1 }), { config: { test, op: 'newer', minutes: 1 } });
      assert.deepEqual(branch.checkBranch({ test, op: 'before', date: '2026-12-31', minutes: 9, tz: 'Asia/Tokyo' }, { tz: 'Europe/Berlin' }), { config: { test, op: 'before', date: '2026-12-31', tz: 'Europe/Berlin' } }, 'the zone handed in, never the one sent');
      for (const tz of [undefined, null, '', 5]) assert.deepEqual(branch.checkBranch({ test, op: 'after', date: '2028-02-29', tz: 'Asia/Tokyo' }, { tz }), { config: { test, op: 'after', date: '2028-02-29', tz: 'UTC' } }, 'no zone handed in: UTC');
      assert.deepEqual(branch.checkBranch({ test, op: 'after', date: '2028-02-29' }).config.tz, 'UTC');
      for (const op of [undefined, '', 'between', 'toString', 7]) assert.deepEqual(branch.checkBranch({ test, op, minutes: 5, date: '2026-12-31' }), { code: 'branch' }, String(op));
      for (const minutes of [undefined, null, 0, -5, 1.5, '60', branch.MAX_AGE + 1, Infinity]) for (const op of ['older', 'newer']) assert.deepEqual(branch.checkBranch({ test, op, minutes }), { code: 'branch' }, String(minutes));
      assert.equal(branch.checkBranch({ test, op: 'older', minutes: branch.MAX_AGE }).config.minutes, branch.MAX_AGE);
      for (const date of [undefined, null, '', '2026-02-30', '31.12.2026', '2026-12-31T00:00', ' 2026-12-31', '2026-1-1', 20261231]) for (const op of ['before', 'after']) assert.deepEqual(branch.checkBranch({ test, op, date }), { code: 'branch' }, String(date));
    }
  });
  test('the people must be of the workspace: at home there, or a member of it — asked once, the ids as a value', async () => {
    const pool = fakePool([{ id: 3 }, { id: 4 }]);
    assert.equal(await branch.foreignRefs(pool, 7, { test: 'deal_owner', op: 'is', user_ids: [3, 4] }), null);
    assert.deepEqual(pool.asked, [{ sql: 'SELECT u.id FROM users u WHERE u.id = ANY($2::int[]) AND (u.workspace_id = $1 OR EXISTS (SELECT 1 FROM user_workspaces uw WHERE uw.user_id = u.id AND uw.workspace_id = $1))', params: [7, [3, 4]] }]);
    assert.equal(await branch.foreignRefs(fakePool([{ id: 3 }]), 7, { test: 'contact_owner', op: 'is_not', user_ids: [3, 99] }), 'user', 'one of them is not of this workspace');
    assert.equal(await branch.foreignRefs(fakePool([]), 7, { test: 'deal_owner', op: 'is', user_ids: [99] }), 'user');
    const none = fakePool([]);
    for (const config of [{ test: 'deal_owner', op: 'nobody' }, { test: 'contact_owner', op: 'nobody', user_ids: [99] }, { test: 'deal_age', op: 'older', minutes: 5 }, { test: 'contact_age', op: 'before', date: '2026-12-31' }]) assert.equal(await branch.foreignRefs(none, 7, config), null);
    assert.equal(none.asked.length, 0, 'a question that names nobody asks the database nothing');
  });
  test('the deal: assigned to one of them, to none of them, to nobody', async () => {
    const D = (op, user_ids) => ({ test: 'deal_owner', op, user_ids });   // DEAL.assigned_to is 3
    assert.deepEqual([await ask(D('is', [3])), await ask(D('is', [4, 3])), await ask(D('is', [4])), await ask(D('is', ['3']))], [true, true, false, true]);
    assert.deepEqual([await ask(D('is_not', [3])), await ask(D('is_not', [4, 5])), await ask(D('nobody'))], [false, true, false]);
    for (const assigned_to of [null, undefined, 0]) {
      assert.deepEqual([await ask(D('is', [3]), { assigned_to }), await ask(D('is_not', [3]), { assigned_to }), await ask(D('nobody'), { assigned_to })], [false, true, true], `assigned to nobody (${assigned_to}): none of them, and nobody`);
    }
    assert.equal(await ask(D('is', [3]), { assigned_to: '3' }), true, 'ids as the database hands them over');
    for (const assigned_to of [null, 0]) assert.equal(await ask(D('is', [0, null]), { assigned_to }), false, 'a list written by hand that holds "no one" does not make nobody one of them');
    for (const op of [undefined, 'anybody', 'constructor']) assert.equal(await ask(D(op, [3])), false, `an unknown way of asking is no: ${op}`);
    for (const user_ids of [undefined, null, 'x']) assert.deepEqual([await ask(D('is', user_ids)), await ask(D('is_not', user_ids))], [false, true], 'no list: nobody is in it');
    assert.equal(await ask(D('is', [3]), { contact_data: null, contact_id: null }), true, 'a deal needs no contact for it');
  });
  test('the contact: the same, read from the contact — and no contact is no', async () => {
    const C = (op, user_ids) => ({ test: 'contact_owner', op, user_ids });   // contact_assigned_to is 4, the deal's 3
    assert.deepEqual([await ask(C('is', [4])), await ask(C('is', [3])), await ask(C('is_not', [3])), await ask(C('is_not', [4])), await ask(C('nobody'))], [true, false, true, false, false]);
    assert.deepEqual([await ask(C('nobody'), { contact_assigned_to: null }), await ask(C('is_not', [4]), { contact_assigned_to: null })], [true, true]);
    for (const contact_data of [null, undefined, 'x']) for (const [op, ids] of [['is', [4]], ['is_not', [3]], ['nobody']]) assert.equal(await ask(C(op, ids), { contact_data, contact_assigned_to: null }), false, `${op}: no contact`);
  });
  test('older and newer: counted back from the moment the question is asked', async () => {
    const A = (op, minutes, test = 'deal_age') => ({ test, op, minutes });   // the deal is 30 days old to the minute, the contact one day
    assert.deepEqual([await ask(A('older', 43200)), await ask(A('older', 43201)), await ask(A('older', 43199)), await ask(A('newer', 43200)), await ask(A('newer', 43201))], [true, false, true, false, true], 'exactly as old counts as older');
    assert.deepEqual([await ask(A('older', 1440, 'contact_age')), await ask(A('newer', 1440, 'contact_age')), await ask(A('newer', 1441, 'contact_age')), await ask(A('older', 60, 'contact_age'))], [true, false, true, true], 'a time the database hands over as text');
    assert.deepEqual([await ask(A('newer', 5), { deal_created_at: new Date('2026-11-23T11:57:00Z') }), await ask(A('older', 5), { deal_created_at: new Date('2026-11-23T11:57:00Z') })], [true, false]);
    for (const deal_created_at of [null, undefined, '', 'gestern', NaN]) for (const op of ['older', 'newer', 'before', 'after']) assert.equal(await ask({ test: 'deal_age', op, minutes: 5, date: '2026-12-31' }, { deal_created_at }), false, `${op}: no moment (${deal_created_at})`);
    for (const minutes of [0, -5, undefined, 'x']) for (const op of ['older', 'newer']) assert.equal(await ask(A(op, minutes)), false, `${op} ${minutes}`);
    for (const op of [undefined, 'between', 'constructor']) assert.equal(await ask({ test: 'deal_age', op, minutes: 5, date: '2026-12-31' }), false, String(op));
    assert.equal(await branch.holds(fakePool(), { deal_created_at: new Date(Date.now() - 3600000) }, A('older', 30)), true, 'no moment handed in: now');
    for (const contact_data of [null, undefined]) for (const op of ['older', 'newer']) assert.equal(await ask(A(op, 5, 'contact_age'), { contact_data }), false, `${op}: no contact`);
  });
  test('before a day, on a day or later: the day on the clock of whoever saved the box', async () => {
    const late = { deal_created_at: new Date('2026-10-01T22:30:00Z'), contact_created_at: new Date('2026-10-01T22:30:00Z') };   // 2 October, 00:30 in Berlin
    const A = (op, date, tz, test = 'deal_age') => ({ test, op, date, tz });
    assert.deepEqual([await ask(A('before', '2026-10-02', 'Europe/Berlin'), late), await ask(A('after', '2026-10-02', 'Europe/Berlin'), late), await ask(A('before', '2026-10-03', 'Europe/Berlin'), late)], [false, true, true]);
    assert.deepEqual([await ask(A('before', '2026-10-02', 'UTC'), late), await ask(A('after', '2026-10-02', 'UTC'), late), await ask(A('after', '2026-10-01', 'UTC'), late)], [true, false, true]);
    assert.deepEqual([await ask(A('before', '2026-10-02', undefined), late), await ask(A('before', '2026-10-02', 'Mars/Olympus'), late)], [true, true], 'no zone, or one nobody knows: UTC');
    assert.deepEqual([await ask(A('after', '2026-10-02', 'Europe/Berlin', 'contact_age'), late), await ask(A('after', '2026-10-02', 'Europe/Berlin', 'contact_age'), { ...late, contact_data: null })], [true, false]);
    for (const date of [undefined, '', '2026-02-30', 'bald']) for (const op of ['before', 'after']) assert.equal(await ask(A(op, date, 'UTC'), late), false, `${op} ${date}`);
    assert.deepEqual([branch.dayIn('2026-10-01T22:30:00Z', 'Europe/Berlin'), branch.dayIn('2026-10-01T22:30:00Z', 'UTC'), branch.dayIn('2026-10-01T22:30:00Z'), branch.dayIn('2026-12-31T23:30:00Z', 'Asia/Manila'), branch.dayIn('2026-10-01T22:30:00Z', 'Mars/Olympus'), branch.dayIn('nie', 'UTC')],
      ['2026-10-02', '2026-10-01', '2026-10-01', '2027-01-01', '2026-10-01', null]);
  });
  test('none of the four asks the database', async () => {
    const pool = fakePool([{}]);
    for (const config of [{ test: 'deal_owner', op: 'is', user_ids: [3] }, { test: 'contact_owner', op: 'nobody' }, { test: 'deal_age', op: 'older', minutes: 5 }, { test: 'contact_age', op: 'after', date: '2026-01-01', tz: 'UTC' }]) await branch.holds(pool, { ...DEAL }, config, { now: NOW });
    assert.equal(pool.asked.length, 0);
  });
});

describe('how it is built', () => {
  const code = read('utils/journey-branch.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens nothing itself: the pool is handed in', () => {
    assert.doesNotMatch(code, /require\(/);
    assert.deepEqual(Object.keys(branch).sort(), ['AGE_OPS', 'AGE_TESTS', 'CONTACT_BASE', 'FIELD_TESTS', 'MAX_AGE', 'MAX_PEOPLE', 'MAX_STAGES', 'MAX_URGENCY', 'MAX_VALUE', 'OPS', 'OPS_BARE', 'OPS_SIZE', 'OWNER_OPS', 'OWNER_TESTS', 'TESTS', 'answeredSince', 'checkBranch', 'dayIn', 'dayOf', 'foreignRefs', 'holds', 'meetingSince', 'numOf']);
  });
  test('nothing typed by a person is put into a statement', () => {
    const statements = [...code.matchAll(/\.query\(\s*(?:`([^`]*)`|'([^']*)')/g)].map(m => m[1] || m[2]);
    assert.equal(statements.length, 6);
    for (const s of statements) { assert.doesNotMatch(s, /\$\{/, s.slice(0, 60)); assert.match(s, /workspace_id = \$1/, s.slice(0, 60)); }
  });
});
