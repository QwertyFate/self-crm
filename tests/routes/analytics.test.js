// ROUTE tests for routes/analytics.js: the configurable value field must
// travel as a bound parameter, never as query text (the SQL-injection fix).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const PAYLOAD = "x')::numeric,(SELECT 1)--";
const db = { config: {}, dealFields: new Set() };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /SELECT analytics_config FROM workspaces/,               reply: () => ({ rows: [{ analytics_config: db.config }] }) },
    { match: /SELECT field_key, name, type FROM deal_fields/,          reply: () => ({ rows: [...db.dealFields].map(k => ({ field_key: k, name: k, type: 'number' })) }) },
    { match: /SELECT 1 FROM deal_fields WHERE workspace_id=\$1 AND field_key=\$2/, reply: p => ({ rows: db.dealFields.has(p[1]) ? [{}] : [], rowCount: db.dealFields.has(p[1]) ? 1 : 0 }) },
    { match: /SELECT analytics_layout FROM users/,                    reply: () => ({ rows: [{ analytics_layout: {} }] }) },
    { match: /UPDATE workspaces SET analytics_config/,                reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /AS total_contacts/, reply: () => ({ rows: [{ total_contacts: 0 }] }) },
    { match: /AS new_contacts/,   reply: () => ({ rows: [{ new_contacts: 0 }] }) },
    { match: /AS new_deals/,      reply: () => ({ rows: [{ new_deals: 0 }] }) },
    { match: /AVG\(/,             reply: () => ({ rows: [{ av: null }] }) },
    { match: /total_tasks/,       reply: () => ({ rows: [{ total_tasks: 0, done_tasks: 0, overdue_tasks: 0 }] }) },
  ]);
  server = await serve({ '/api/analytics': loadRoute('analytics.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); db.config = {}; db.dealFields = new Set(); });

const textHas   = s => pool.log.some(e => e.sql.includes(s));
const paramsHas = s => pool.log.some(e => e.params.some(p => String(p).includes(s)));

test('an injection payload stored as value_field never reaches query text — it travels as a parameter', async () => {
  db.config = { value_field: PAYLOAD };
  await server.request('GET', '/api/analytics/summary');
  await server.request('GET', '/api/analytics/trend');
  assert.equal(textHas(PAYLOAD), false);
  assert.equal(paramsHas(PAYLOAD), true);
});

test('a custom field is read through a typed bind with a jsonb_typeof guard and a numeric-string branch', async () => {
  db.config = { value_field: 'revenue' };
  await server.request('GET', '/api/analytics/summary');
  const q = pool.find(/COALESCE\(SUM\(/).sql;
  assert.match(q, /jsonb_typeof\(custom_data -> \$2::text\) = 'number'/);
  assert.match(q, /= 'string' AND \(custom_data ->> \$2::text\) ~ /);
  assert.equal(textHas("->>'revenue'"), false);
  assert.equal(paramsHas('revenue'), true);
});

test('a text field never reaches a bare ::numeric cast (that used to be a 500)', async () => {
  db.config = { value_field: 'notes' };
  const r = await server.request('GET', '/api/analytics/summary');
  assert.equal(r.status, 200);
  const bare = pool.log.some(e => /\(custom_data ->> \$2(::text)?\)::numeric/.test(e.sql) && !/jsonb_typeof/.test(e.sql));
  assert.equal(bare, false);
});

describe('PATCH /config allow-list', () => {
  test('bad field -> 400; a real deal field, "value", and null -> 200', async () => {
    db.dealFields = new Set(['revenue']);
    assert.equal((await server.request('PATCH', '/api/analytics/config', { value_field: PAYLOAD })).status, 400);
    assert.equal((await server.request('PATCH', '/api/analytics/config', { value_field: 'revenue' })).status, 200);
    assert.equal((await server.request('PATCH', '/api/analytics/config', { value_field: 'value' })).status, 200);
    assert.equal((await server.request('PATCH', '/api/analytics/config', { value_field: null })).status, 200);
  });
});

test('response key sets are unchanged', async () => {
  db.config = { value_field: 'value' };
  const sum = await server.request('GET', '/api/analytics/summary');
  const tr  = await server.request('GET', '/api/analytics/trend');
  assert.deepEqual(Object.keys(sum.body).sort(), 'all_stages,avg_value,by_pipeline,config,deal_fields,done_tasks,layout,lost_deals,new_contacts,new_deals,open_deals,overdue_tasks,pipeline_value,total_contacts,total_deals,total_tasks,win_rate,won_deals,won_value'.split(','));
  assert.deepEqual(Object.keys(tr.body).sort(), ['contacts', 'deals', 'period', 'value_trend']);
});
