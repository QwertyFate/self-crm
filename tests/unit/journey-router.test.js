// UNIT tests for utils/journey-router.js (CUSTOMER_JOURNEY_CHANGES Part 23, 2026-11-23): a workflow's router box —
// several routes out, each with its own question, and a deal goes down every route whose answer is yes.
//
// What is saved (checkRouter: the routes, their ids, and that a line is never taken from what is sent), what the
// questions may name (foreignRefs), the lines (lines, setLine, relink) and which routes a deal goes down (taken).
// How the engine sends a deal down several routes at once is tests/unit/journey-run.test.js and, on real rows,
// the change log's Postgres run.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const routes = require('../../utils/journey-router');
const branch = require('../../utils/journey-branch');

function fakePool(rows = []) {
  const asked = [];
  return { asked, query: async (sql, params) => { asked.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); return { rows }; } };
}
const SAVED = { routes: [{ id: 1, name: 'Phone', when: { test: 'has_phone' }, next_id: 40 }, { id: 2, name: '', when: null, next_id: null }, { id: 5, name: 'Big', when: { test: 'field', field_key: 'budget', op: 'gt', value: '500000' }, next_id: 41 }] };
const DEAL = { stage_id: 31, assigned_to: 3, contact_id: 40, contact_data: {}, contact_phone: '+49 151 1', contact_email: '', deal_data: { budget: '600.000' } };

describe('what is saved', () => {
  test('a new router: 1 to 6 routes, numbered from 1, each with its name, its question or none, and no line', () => {
    assert.deepEqual([routes.MAX_ROUTES, routes.MAX_NAME], [6, 60]);
    assert.deepEqual(routes.checkRouter({ routes: [{ name: '  Has  a phone ', when: { test: 'has_phone', stage_ids: [1] }, more: 1 }, {}, { name: 'Big', when: { test: 'field', field_key: 'budget', op: 'gt', value: ' 500000 ' } }], x: 1 }),
      { config: { routes: [{ id: 1, name: 'Has a phone', when: { test: 'has_phone' }, next_id: null }, { id: 2, name: '', when: null, next_id: null }, { id: 3, name: 'Big', when: { test: 'field', field_key: 'budget', op: 'gt', value: '500000' }, next_id: null }] } });
    assert.equal(routes.checkRouter({ routes: Array.from({ length: 6 }, () => ({})) }).config.routes.length, 6);
    assert.deepEqual(routes.checkRouter({ routes: [{ name: null, when: null }] }).config.routes, [{ id: 1, name: '', when: null, next_id: null }], 'one route is a router too: a gate');
    for (const name of ['x'.repeat(60)]) assert.equal(routes.checkRouter({ routes: [{ name }] }).config.routes[0].name.length, 60);
  });
  test('a route\'s question is kept exactly as a branch box keeps it — with the saver\'s clock where a day is compared', () => {
    const when = { test: 'deal_age', op: 'before', date: '2026-12-31', tz: 'Asia/Tokyo' };
    assert.deepEqual(routes.checkRouter({ routes: [{ when }] }, null, { tz: 'Europe/Vienna' }).config.routes[0].when, branch.checkBranch(when, { tz: 'Europe/Vienna' }).config);
    assert.equal(routes.checkRouter({ routes: [{ when }] }, null, { tz: 'Europe/Vienna' }).config.routes[0].when.tz, 'Europe/Vienna');
    for (const t of branch.TESTS.filter(k => !['stage', 'urgency', 'field', 'contact_field', ...branch.OWNER_TESTS, ...branch.AGE_TESTS].includes(k))) assert.deepEqual(routes.checkRouter({ routes: [{ when: { test: t } }] }).config.routes[0].when, { test: t });
  });
  test('refused: no list of routes, none, too many, a name that is no text or too long — and a question a branch box would refuse, with its code and which route', () => {
    for (const raw of [undefined, null, 'x', [], {}, { routes: null }, { routes: 'a' }, { routes: {} }, { routes: [] }, { routes: Array.from({ length: 7 }, () => ({})) }]) assert.deepEqual(routes.checkRouter(raw), { code: 'router' }, JSON.stringify(raw));
    for (const r of [null, 'a', 5, []]) assert.deepEqual(routes.checkRouter({ routes: [{}, r] }), { code: 'router', route: 1 }, JSON.stringify(r));
    for (const name of [5, ['a'], {}, true, 'x'.repeat(61)]) assert.deepEqual(routes.checkRouter({ routes: [{ name }] }), { code: 'router', route: 0 }, String(name).slice(0, 20));
    assert.deepEqual(routes.checkRouter({ routes: [{}, {}, { when: { test: 'weather' } }] }), { code: 'branch', route: 2 });
    assert.deepEqual(routes.checkRouter({ routes: [{ when: 'has_phone' }] }), { code: 'branch', route: 0 });
    for (const when of [0, '', false, [], 'x']) assert.deepEqual(routes.checkRouter({ routes: [{ when }] }), { code: 'branch', route: 0 }, `only nothing at all means "every deal": ${JSON.stringify(when)}`);
    assert.deepEqual(routes.checkRouter({ routes: [{ when: { test: 'stage', stage_ids: [] } }] }), { code: 'stage', route: 0 });
    assert.deepEqual(routes.checkRouter({ routes: [{}, { when: { test: 'field', field_key: 'two words' } }] }), { code: 'field', route: 1 });
    assert.deepEqual(routes.checkRouter({ routes: [{ when: { test: 'deal_owner', op: 'is', user_ids: [] } }] }), { code: 'user', route: 0 });
  });
  test('a saved router: a route sent with its id is that route and keeps its line; the others are new, numbered above every old one', () => {
    const out = routes.checkRouter({ routes: [{ id: 5, name: 'Big deals' }, { name: 'New' }, { id: 1, name: 'Phone', when: { test: 'has_email' } }, { id: 77, name: 'An id nobody has' }] }, SAVED).config.routes;
    assert.deepEqual(out, [{ id: 5, name: 'Big deals', when: null, next_id: 41 }, { id: 6, name: 'New', when: null, next_id: null }, { id: 1, name: 'Phone', when: { test: 'has_email' }, next_id: 40 }, { id: 7, name: 'An id nobody has', when: null, next_id: null }]);
    assert.deepEqual(routes.checkRouter({ routes: [{ id: 2 }] }, SAVED).config.routes, [{ id: 2, name: '', when: null, next_id: null }], 'the routes left out are gone, with their lines');
    assert.deepEqual(routes.checkRouter({ routes: [{ name: 'a' }] }, SAVED).config.routes[0].id, 6, 'a number that was a route\'s is not given to another while a higher one is saved');
  });
  test('a line is never taken from what is sent', () => {
    assert.deepEqual(routes.checkRouter({ routes: [{ next_id: 99 }, { id: 1, next_id: 99 }, { id: 2, next_id: 99 }] }, SAVED).config.routes.map(r => [r.id, r.next_id]), [[6, null], [1, 40], [2, null]]);
    assert.deepEqual(routes.checkRouter({ routes: [{ id: 1, next_id: null }] }, SAVED).config.routes[0].next_id, 40, 'nor taken away');
    assert.deepEqual(routes.checkRouter({ routes: [{ id: 1, next_id: 99 }] }, null).config.routes, [{ id: 1, name: '', when: null, next_id: null }], 'a new box has no saved routes: an id that is sent means nothing');
  });
  test('an id twice, an id that is no number, and what was saved in a shape nobody saves', () => {
    assert.deepEqual(routes.checkRouter({ routes: [{ id: 1 }, { id: 1 }] }, SAVED), { code: 'router', route: 1 });
    for (const id of ['1', 1.5, 0, -1, null, [1], {}]) assert.equal(routes.checkRouter({ routes: [{ id }] }, SAVED).config.routes[0].id, 6, `${JSON.stringify(id)} is no saved route: a new one`);
    for (const stored of [undefined, null, 'x', {}, { routes: 'a' }, { routes: [null, 'x'] }]) assert.deepEqual(routes.checkRouter({ routes: [{ id: 1 }, {}] }, stored).config.routes.map(r => r.id), [1, 2], JSON.stringify(stored));
    assert.deepEqual(routes.checkRouter({ routes: [{ id: 1 }] }, { routes: [{ id: 1, next_id: 'x' }] }).config.routes[0].next_id, null, 'a saved line that is no id leads nowhere');
    assert.deepEqual(routes.checkRouter({ routes: [{}] }, { routes: [{ id: 999, next_id: null }] }), { code: 'router' }, 'the numbers end at 999');
    assert.equal(routes.checkRouter({ routes: [{}] }, { routes: [{ id: 998, next_id: null }] }).config.routes[0].id, 999, '999 itself is a number');
  });
});

describe('what the routes\' questions name', () => {
  test('each question is asked of the branch box\'s own check: the first that names something foreign says what', async () => {
    const config = { routes: [{ id: 1, when: null }, { id: 2, when: { test: 'stage', stage_ids: [31] } }, { id: 3, when: { test: 'field', field_key: 'budget' } }] };
    const all = { asked: [], query: async (sql, p) => { all.asked.push(String(sql).replace(/\s+/g, ' ').trim()); return { rows: /pipeline_stages/.test(sql) ? [{ id: 31 }] : [{ type: 'text' }] }; } };
    assert.equal(await routes.foreignRefs(all, 7, config), null);
    assert.deepEqual(all.asked, ['SELECT id FROM pipeline_stages WHERE workspace_id = $1 AND id = ANY($2::int[])', 'SELECT type FROM deal_fields WHERE workspace_id = $1 AND field_key = $2'], 'a route without a question asks nothing');
    assert.equal(await routes.foreignRefs(fakePool([]), 7, config), 'stage');
    assert.equal(await routes.foreignRefs(fakePool([]), 7, { routes: [{ id: 1, when: { test: 'deal_owner', op: 'is', user_ids: [9] } }] }), 'user');
    assert.equal(await routes.foreignRefs(fakePool([]), 7, { routes: [{ id: 1, when: { test: 'contact_field', field_key: 'x' } }] }), 'field');
    const none = fakePool([]);
    for (const config of [null, {}, { routes: [] }, { routes: [{ id: 1, when: null }, { id: 2, when: { test: 'has_phone' } }] }]) assert.equal(await routes.foreignRefs(none, 7, config), null);
    assert.equal(none.asked.length, 0);
  });
});

describe('the lines', () => {
  test('where the routes lead; one route\'s line set or taken away; a deleted box replaced by what stood behind it', () => {
    assert.deepEqual(routes.lines(SAVED), [40, 41]);
    for (const config of [null, undefined, {}, { routes: 'x' }, { routes: [{ id: 1, next_id: null }, { id: 2, next_id: 'x' }, null] }]) assert.deepEqual(routes.lines(config), []);
    assert.deepEqual(routes.setLine(SAVED, 2, 50).routes.map(r => r.next_id), [40, 50, 41]);
    assert.deepEqual(routes.setLine(SAVED, 1, null).routes.map(r => r.next_id), [null, null, 41]);
    assert.deepEqual(routes.setLine(SAVED, 1, 'x').routes[0].next_id, null, 'what is no id is no line');
    for (const id of [3, 0, '1', null, undefined]) assert.equal(routes.setLine(SAVED, id, 50), null, `no route ${id}`);
    assert.deepEqual(SAVED.routes.map(r => r.next_id), [40, null, 41], 'the saved config itself is not written into');
    assert.deepEqual(routes.setLine(SAVED, 2, 50).routes[0], SAVED.routes[0], 'the other routes stay what they were');
    const twice = { routes: [{ id: 1, next_id: 40 }, { id: 2, next_id: 40 }, { id: 3, next_id: 41 }] };
    assert.deepEqual(routes.relink(twice, 40, 60), { config: { routes: [{ id: 1, next_id: 60 }, { id: 2, next_id: 60 }, { id: 3, next_id: 41 }] }, changed: true });
    assert.deepEqual(routes.relink(twice, 41, null).config.routes.map(r => r.next_id), [40, 40, null], 'nothing stood behind it: the route leads nowhere');
    assert.deepEqual(routes.relink(twice, 40, 'x').config.routes.map(r => r.next_id), [null, null, 41], 'what is no id is no line');
    const same = routes.relink(twice, 99, 60);
    assert.equal(same.changed, false); assert.equal(same.config, twice, 'no route led there: nothing to write');
  });
});

describe('which routes a deal goes down', () => {
  test('every route whose question says yes, in their order — a route without a question always', async () => {
    assert.deepEqual(await routes.taken(fakePool(), DEAL, SAVED), [{ id: 1, no: 1, name: 'Phone', next_id: 40 }, { id: 2, no: 2, name: '', next_id: null }, { id: 5, no: 3, name: 'Big', next_id: 41 }],
      'each with its own number (id) and its place among the routes (no): the number on its foot');
    assert.deepEqual((await routes.taken(fakePool(), { ...DEAL, contact_phone: '' }, SAVED)).map(r => [r.id, r.no]), [[2, 2], [5, 3]], 'a route\'s place does not change with which routes say yes');
    assert.deepEqual((await routes.taken(fakePool(), DEAL, { routes: [SAVED.routes[2], SAVED.routes[0]] })).map(r => [r.id, r.no]), [[5, 1], [1, 2]], 'moved in the window: its place is where it stands now');
    assert.deepEqual((await routes.taken(fakePool(), { ...DEAL, contact_phone: '' }, SAVED)).map(r => r.id), [2, 5]);
    assert.deepEqual((await routes.taken(fakePool(), { ...DEAL, deal_data: { budget: '400.000' } }, SAVED)).map(r => r.id), [1, 2]);
    const asking = { routes: SAVED.routes.filter(r => r.when) };
    assert.deepEqual(await routes.taken(fakePool(), { ...DEAL, contact_phone: '', deal_data: {} }, asking), [], 'none says yes: the "otherwise" line is the engine\'s to take');
    for (const config of [null, undefined, {}, { routes: [] }, { routes: 'x' }]) assert.deepEqual(await routes.taken(fakePool(), DEAL, config), []);
  });
  test('the moment is handed on to the question, and so is the pool', async () => {
    const config = { routes: [{ id: 1, when: { test: 'deal_age', op: 'older', minutes: 60 } }, { id: 2, when: { test: 'meeting' } }] };
    const created = { ...DEAL, deal_created_at: new Date('2026-11-23T10:00:00Z'), workspace_id: 7, deal_id: 60, started_at: new Date('2026-11-23T10:00:00Z') };
    const pool = fakePool([{}]);
    assert.deepEqual((await routes.taken(pool, created, config, { now: new Date('2026-11-23T11:00:00Z') })).map(r => r.id), [1, 2]);
    assert.deepEqual((await routes.taken(fakePool([]), created, config, { now: new Date('2026-11-23T10:59:00Z') })).map(r => r.id), []);
    assert.match(pool.asked[0].sql, /FROM activities a/);
    assert.equal((await routes.taken(fakePool(), { ...DEAL, deal_data: {} }, { routes: [{ id: 1, when: { test: 'field', field_key: 'budget', op: 'weather' } }] })).length, 0, 'a question this server does not know: no');
  });
});

describe('how it is built', () => {
  const code = read('utils/journey-router.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens nothing itself, and asks the database nothing of its own', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['./journey-branch']);
    assert.doesNotMatch(code, /\.query\(/);
    assert.deepEqual(Object.keys(routes).sort(), ['MAX_NAME', 'MAX_ROUTES', 'MAX_ROUTE_ID', 'checkRouter', 'foreignRefs', 'lines', 'relink', 'setLine', 'taken']);
  });
});
