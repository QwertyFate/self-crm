// UNIT tests for utils/journey-log.js (CUSTOMER_JOURNEY_CHANGES Part 15, 2026-11-20): the whole record of what the
// workflows do — what an entry is, how it is written (and that writing it can never hold a workflow up), and how the
// record is read: newest first, a page at a time, narrowed by workflow, deal, kind of event and a text.
//
// The statements themselves — the names read in the INSERT, the search, the order — were answered by a real
// throwaway Postgres too (see the change log); here they are pinned, and everything around them is run.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const log = require('../../utils/journey-log');

function fakePool(answer = () => ({ rows: [{ id: 41 }] })) {
  const asked = [];
  return { asked, query: async (sql, params) => { asked.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); return answer(String(sql), params); } };
}
const quiet = async fn => { const said = [], real = console.error; console.error = (...a) => said.push(a.join(' ')); try { return [await fn(), said]; } finally { console.error = real; } };
const ENTRY = { workspaceId: 7, flowId: 2, nodeId: 3, dealId: 60, kind: 'email', title: 'Welcome', status: 'done', detail: 'lead@example.de', event: 'step' };

describe('what an entry is', () => {
  test('the six events, the three groups the page filters by, and what can be done to a workflow', () => {
    assert.deepEqual(log.EVENTS, ['step', 'retry', 'entered', 'ended', 'moved', 'flow']);
    assert.deepEqual(log.GROUPS, { steps: ['step', 'retry'], deals: ['entered', 'ended', 'moved'], flow: ['flow'] });
    assert.deepEqual(Object.values(log.GROUPS).flat().sort(), [...log.EVENTS].sort(), 'every event is in exactly one group');
    assert.deepEqual(log.FLOW_DETAILS, ['created', 'renamed', 'switched_on', 'switched_off', 'deleted', 'step_added', 'step_changed', 'step_deleted', 'line_changed', 'start_changed']);
    assert.deepEqual(log.BY_HAND, ['manual', 'restart']);
    assert.deepEqual([log.MAX_Q, log.MAX_LIMIT, log.DEFAULT_LIMIT], [100, 200, 50]);
  });
  test('as the statement\'s values: whose, where, what — and the names only when they are handed in', () => {
    assert.deepEqual(log.valuesOf(ENTRY), [7, 2, 3, 60, 'email', 'Welcome', 'done', 'lead@example.de', 'step', null, null, null, null]);
    assert.deepEqual(log.valuesOf({ ...ENTRY, flowName: 'Nurture', dealTitle: 'Wohnung 3', actorId: 1, actorName: 'Olga' }).slice(9), ['Nurture', 'Wohnung 3', 1, 'Olga']);
    assert.deepEqual(log.valuesOf({ workspaceId: 7, event: 'flow', detail: 'created', title: 'Nurture' }), [7, null, null, null, '', 'Nurture', '', 'created', 'flow', null, null, null, null], 'what an entry does not have is empty, never "undefined"');
    assert.deepEqual(log.valuesOf({ workspaceId: 7, event: 'entered', flowName: '', dealTitle: '' }).slice(9, 11), ['', ''], 'an empty name that IS handed in stays empty: it is not looked up');
  });
  test('an entry needs its workspace and one of the six events; ids are whole positive numbers or nothing', () => {
    for (const workspaceId of [undefined, null, 0, -1, 1.5, 'x', '7 OR 1=1']) assert.throws(() => log.valuesOf({ ...ENTRY, workspaceId }), /needs its workspace/, String(workspaceId));
    for (const event of [undefined, '', 'deleted', 'STEP', 'constructor', ['step']]) assert.throws(() => log.valuesOf({ ...ENTRY, event }), /no such event/, String(event));
    assert.throws(() => log.valuesOf(null), /needs its workspace/);
    assert.deepEqual(log.valuesOf({ ...ENTRY, flowId: '2', nodeId: 0, dealId: 'x', actorId: -4 }).slice(1, 4), [2, null, null]);
    assert.equal(log.valuesOf({ ...ENTRY, actorId: 2147483648 })[11], null, 'a number the column cannot hold is none');
  });
  test('texts are cut to what the record keeps; a detail that is empty is none', () => {
    const v = log.valuesOf({ ...ENTRY, title: 't'.repeat(500), detail: 'd'.repeat(500), flowName: 'f'.repeat(500), dealTitle: 'x'.repeat(500), actorName: 'a'.repeat(500), kind: 'k'.repeat(99), status: 's'.repeat(99) });
    assert.deepEqual([v[4].length, v[5].length, v[6].length, v[7].length, v[9].length, v[10].length, v[12].length], [40, 200, 40, 300, 200, 200, 200]);
    for (const detail of [undefined, null, '']) assert.equal(log.valuesOf({ ...ENTRY, detail })[7], null);
    assert.equal(log.valuesOf({ ...ENTRY, detail: 0 })[7], '0'); assert.equal(log.valuesOf({ ...ENTRY, title: null })[5], '');
  });
});

describe('writing', () => {
  test('one statement: the entry with the workflow\'s name, the deal\'s title and the person\'s name read in it — within the workspace', async () => {
    const pool = fakePool();
    assert.equal(await log.write(pool, ENTRY), 41);
    assert.equal(pool.asked.length, 1);
    assert.equal(pool.asked[0].sql, 'INSERT INTO journey_log (workspace_id, flow_id, node_id, deal_id, kind, title, status, detail, event, flow_name, deal_title, actor_id, actor_name) '
      + "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::text, (SELECT f.name FROM journey_flows f WHERE f.id = $2 AND f.workspace_id = $1), ''), "
      + "COALESCE($11::text, (SELECT d.title FROM deals d WHERE d.id = $4 AND d.workspace_id = $1), ''), $12, COALESCE($13::text, (SELECT u.name FROM users u WHERE u.id = $12), '')) RETURNING id");
    assert.deepEqual(pool.asked[0].params, log.valuesOf(ENTRY));
  });
  test('write() throws like any statement, and on an entry that is none without asking the database', async () => {
    await assert.rejects(log.write(fakePool(() => { throw new Error('the table is away'); }), ENTRY), /the table is away/);
    const pool = fakePool();
    await assert.rejects(log.write(pool, { ...ENTRY, event: 'nonsense' }), /no such event/);
    assert.equal(pool.asked.length, 0);
    assert.equal(await log.write(fakePool(() => ({ rows: [] })), ENTRY), null);
  });
  test('record() NEVER throws: what cannot be written is said in the server\'s log, and the caller goes on', async () => {
    const [id, said] = await quiet(() => log.record(fakePool(() => { throw new Error('the table is away'); }), ENTRY));
    assert.equal(id, null);
    assert.deepEqual(said, ['journey: an entry of the record could not be written: the table is away']);
    for (const bad of [null, undefined, {}, { workspaceId: 7 }, { ...ENTRY, event: 'x' }, { ...ENTRY, workspaceId: 'x' }]) {
      const [got, words] = await quiet(() => log.record(fakePool(), bad));
      assert.equal(got, null, JSON.stringify(bad)); assert.equal(words.length, 1);
    }
    const [fine, nothing] = await quiet(() => log.record(fakePool(), ENTRY));
    assert.deepEqual([fine, nothing], [41, []]);
    const [gone] = await quiet(() => log.record({ query: () => { throw new Error('not even a promise'); } }, ENTRY));
    assert.equal(gone, null, 'a pool that throws at once is caught as well');
  });
});

describe('what is asked for', () => {
  const ALL = { flowId: null, dealId: null, events: null, q: null, before: null, limit: 50 };
  test('nothing asked: everything, fifty at a time; an empty value is a value that is not there', () => {
    for (const q of [undefined, null, {}, [], 'x', 5]) assert.deepEqual(log.checkQuery(q), ALL, JSON.stringify(q));
    assert.deepEqual(log.checkQuery({ flow_id: '', deal_id: '', group: '', q: '', before: '', limit: '' }), ALL);
    assert.deepEqual(log.checkQuery({ something: 'else' }), ALL);
  });
  test('a workflow, a deal, the entry to go on from: ids as the address gives them', () => {
    assert.deepEqual(log.checkQuery({ flow_id: '12', deal_id: '60', before: '900' }), { ...ALL, flowId: 12, dealId: 60, before: 900 });
    for (const name of ['flow_id', 'deal_id', 'before']) {
      for (const bad of ['0', '-1', '1.5', 'x', '1e3', ' 5', '5 ', '05', '12345678901', '2147483648', '1 OR 1=1', ['1', '2'], { a: '1' }, 5, true]) {
        assert.deepEqual(log.checkQuery({ [name]: bad }), { code: 'history' }, `${name}=${JSON.stringify(bad)}`);
      }
    }
    assert.equal(log.checkQuery({ flow_id: '2147483647' }).flowId, 2147483647);
  });
  test('a group names its events; any other word is refused', () => {
    assert.deepEqual(log.checkQuery({ group: 'steps' }).events, ['step', 'retry']);
    assert.deepEqual(log.checkQuery({ group: 'deals' }).events, ['entered', 'ended', 'moved']);
    assert.deepEqual(log.checkQuery({ group: 'flow' }).events, ['flow']);
    for (const group of ['step', 'all', 'STEPS', 'constructor', 'toString', '__proto__', ['steps'], { a: 1 }]) assert.deepEqual(log.checkQuery({ group }), { code: 'history' }, JSON.stringify(group));
  });
  test('a text of up to 100 characters, its outer spaces gone; only spaces is no text', () => {
    assert.equal(log.checkQuery({ q: '  Wohnung 3 ' }).q, 'Wohnung 3');
    assert.equal(log.checkQuery({ q: '   ' }).q, null);
    assert.equal(log.checkQuery({ q: 'x'.repeat(100) }).q.length, 100);
    for (const q of ['x'.repeat(101), ['a'], { a: 'b' }, 5]) assert.deepEqual(log.checkQuery({ q }), { code: 'history' });
    assert.equal(log.checkQuery({ q: "%_'; DROP TABLE journey_log; --" }).q, "%_'; DROP TABLE journey_log; --", 'any characters: it is a value, and no pattern');
  });
  test('how many: 1 to 200', () => {
    assert.deepEqual([log.checkQuery({ limit: '1' }).limit, log.checkQuery({ limit: '200' }).limit, log.checkQuery({ limit: '75' }).limit], [1, 200, 75]);
    for (const limit of ['0', '201', '1000', '-5', '1.5', 'x', '050', ['5'], 5]) assert.deepEqual(log.checkQuery({ limit }), { code: 'history' }, JSON.stringify(limit));
  });
});

describe('reading', () => {
  const rowsOf = n => Array.from({ length: n }, (_, i) => ({ id: 100 - i }));
  test('one statement of this workspace, newest first; every value handed to it, none part of it', async () => {
    const pool = fakePool(() => ({ rows: rowsOf(3) }));
    const out = await log.history(pool, 7, { flow_id: '2', deal_id: '60', group: 'deals', q: ' Wohnung ', before: '500', limit: '10' });
    assert.deepEqual(out, { entries: rowsOf(3), more: false });
    assert.equal(pool.asked.length, 1);
    assert.equal(pool.asked[0].sql, 'SELECT l.id, l.created_at, l.event, l.flow_id, l.flow_name, l.deal_id, l.deal_title, l.kind, l.title, l.status, l.detail, l.actor_name FROM journey_log l '
      + 'WHERE l.workspace_id = $1 AND ($2::int IS NULL OR l.flow_id = $2) AND ($3::int IS NULL OR l.deal_id = $3) AND ($4::text[] IS NULL OR l.event = ANY($4::text[])) '
      + 'AND ($5::text IS NULL OR POSITION(LOWER($5) IN LOWER(l.deal_title)) > 0 OR POSITION(LOWER($5) IN LOWER(l.title)) > 0 OR POSITION(LOWER($5) IN LOWER(l.flow_name)) > 0) '
      + 'AND ($6::int IS NULL OR l.id < $6) ORDER BY l.id DESC LIMIT $7');
    assert.deepEqual(pool.asked[0].params, [7, 2, 60, ['entered', 'ended', 'moved'], 'Wohnung', 500, 11]);
    assert.doesNotMatch(pool.asked[0].sql, /LIKE|\$\{/, 'the text is looked for as it is: no pattern a % or _ could change');
  });
  test('one entry more than asked for is read, to know whether older ones exist; it is not handed out', async () => {
    const more = await log.history(fakePool(() => ({ rows: rowsOf(11) })), 7, { limit: '10' });
    assert.deepEqual([more.entries.length, more.more, more.entries.at(-1).id], [10, true, 91]);
    const exact = await log.history(fakePool(() => ({ rows: rowsOf(10) })), 7, { limit: '10' });
    assert.deepEqual([exact.entries.length, exact.more], [10, false]);
    const none = await log.history(fakePool(() => ({ rows: [] })), 7, {});
    assert.deepEqual(none, { entries: [], more: false });
    const all = fakePool(() => ({ rows: [] }));
    await log.history(all, 7, undefined);
    assert.deepEqual(all.asked[0].params, [7, null, null, null, null, null, 51]);
  });
  test('what is asked for badly is refused before the database is asked anything', async () => {
    const pool = fakePool();
    for (const query of [{ flow_id: 'x' }, { group: 'everything' }, { limit: '0' }, { q: 'x'.repeat(101) }, { before: '-1' }, { deal_id: ['1', '2'] }]) assert.deepEqual(await log.history(pool, 7, query), { code: 'history' });
    assert.equal(pool.asked.length, 0);
  });
});

describe('how it is built', () => {
  const code = read('utils/journey-log.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens nothing itself: the pool is handed in', () => {
    assert.doesNotMatch(code, /require\(/);
    assert.deepEqual(Object.keys(log).sort(), ['BY_HAND', 'DEFAULT_LIMIT', 'EVENTS', 'FLOW_DETAILS', 'GROUPS', 'MAX_LIMIT', 'MAX_Q', 'checkQuery', 'history', 'record', 'valuesOf', 'write']);
  });
  test('its two statements carry the workspace, and nothing is put into either', () => {
    const statements = [...code.matchAll(/`([^`]*(?:INSERT INTO|SELECT l\.id)[^`]*)`/g)].map(m => m[1]);
    assert.equal(statements.length, 2);
    // ${held}: the one piece a caller's scope() may add to the reading (which entries a person may see); '' without one
    for (const s of statements) { assert.doesNotMatch(s, /\$\{(?!held\})/, s.slice(0, 60)); assert.match(s, /workspace_id = \$1|VALUES \(\$1,/, s.slice(0, 60)); }
    assert.equal(code.split('${held}').length - 1, 1);
    assert.match(code, /const held = scope \? scope\(params\) : '';/);
    assert.match(code, /async function record\(db, e\) \{\s+try \{ return await write\(db, e\); \}\s+catch \(err\) \{ console\.error\('journey: an entry of the record could not be written:', err\?\.message \|\| err\); return null; \}\s+\}/);
  });
});
