// ROUTE test: GET /api/analytics/summary takes a window (?months=3|6|12) and returns the
// previous window's counterpart for the two metrics the data can honestly compare —
// deals created (new_deals) and the average size of that cohort (avg_deal_size).
// The won/open/rate numbers are current-stage snapshots and deliberately get no previous value.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const calls = [];
const pool = { query: async (sql, params) => {
  calls.push({ sql, params });
  if (/analytics_config/.test(sql))        return { rows: [{ analytics_config: { won_stage_ids: [1], lost_stage_ids: [2], value_field: 'value' } }] };
  if (/AS total_contacts/.test(sql))       return { rows: [{ total_contacts: '5' }] };
  if (/AS new_contacts/.test(sql))         return { rows: [{ new_contacts: '2' }] };
  if (/GROUP BY stage_id/.test(sql))       return { rows: [{ stage_id: 1, cnt: '2', val: '200' }, { stage_id: 3, cnt: '1', val: '50' }] };
  if (/AS new_deals/.test(sql))            return { rows: [{ new_deals: '7' }] };
  if (/AS prev_new_deals/.test(sql))       return { rows: [{ prev_new_deals: '4' }] };
  if (/ AS av\b/.test(sql))               return { rows: [{ av: '110' }] };   // the all-time average kept for the older cards
  if (/AS avg_deal_size/.test(sql))        return { rows: [{ avg_deal_size: '120' }] };
  if (/AS prev_avg_deal_size/.test(sql))   return { rows: [{ prev_avg_deal_size: '100' }] };
  if (/AS total_tasks/.test(sql))          return { rows: [{ total_tasks: '3', done_tasks: '1', overdue_tasks: '0' }] };
  if (/analytics_layout/.test(sql))        return { rows: [{ analytics_layout: {} }] };
  return { rows: [] };
} };

let server;
before(async () => { server = await serve({ '/api/analytics': loadRoute('analytics.js', { pool }) }); });
after(async () => { await server.close(); });

describe('GET /api/analytics/summary?months=', () => {
  test('reports the window it used and the previous-window counterparts', async () => {
    calls.length = 0;
    const r = await server.request('GET', '/api/analytics/summary?months=3');
    assert.equal(r.status, 200);
    assert.equal(r.body.period.months, 3);
    assert.ok(r.body.period.from && r.body.period.to, 'the window is reported so the page can label it');
    assert.equal(r.body.new_deals, 7);
    assert.equal(r.body.prev_new_deals, 4);
    assert.equal(r.body.avg_deal_size, 120);
    assert.equal(r.body.prev_avg_deal_size, 100);
  });
  test('the window is a parameter, never interpolated, and only 3 / 6 / 12 are honoured', async () => {
    for (const { q, want } of [{ q: '?months=12', want: 12 }, { q: '', want: 6 }, { q: '?months=99', want: 6 }, { q: "?months=1;DROP TABLE deals", want: 6 }]) {
      const r = await server.request('GET', '/api/analytics/summary' + q);
      assert.equal(r.body.period.months, want, q || '(default)');
    }
    const windowed = calls.filter(c => /AS new_deals|AS prev_new_deals|AS avg_deal_size|AS prev_avg_deal_size/.test(c.sql));
    assert.ok(windowed.length >= 4);
    for (const c of windowed) {
      assert.match(c.sql, /\$\d/, 'the month count reaches SQL as a bound parameter');
      assert.doesNotMatch(c.sql, /DROP TABLE/);
    }
  });
  test('the snapshot metrics still come back, with no invented previous value', async () => {
    const r = await server.request('GET', '/api/analytics/summary?months=6');
    assert.equal(r.body.won_deals, 2);
    assert.equal(r.body.open_deals, 1);
    assert.equal(r.body.win_rate, 100);
    for (const k of ['prev_won_value', 'prev_win_rate', 'prev_pipeline_value']) assert.equal(k in r.body, false, k + ' would be a guess');
  });
});

describe('top open deals, and the value field that reaches SQL', () => {
  const calls2 = [];
  const pool2 = { query: async (sql, params) => {
    calls2.push({ sql, params });
    if (/analytics_config/.test(sql) && /SELECT/.test(sql)) return { rows: [{ analytics_config: { won_stage_ids: [1], lost_stage_ids: [2], value_field: "value'); DROP TABLE deals; --" } }] };
    if (/FROM deal_fields/.test(sql))        return { rows: [{ field_key: 'budget', name: 'Budget', type: 'number' }] };
    if (/AS total_contacts/.test(sql))       return { rows: [{ total_contacts: '1' }] };
    if (/AS new_contacts/.test(sql))         return { rows: [{ new_contacts: '0' }] };
    if (/GROUP BY stage_id/.test(sql))       return { rows: [] };
    if (/AS new_deals/.test(sql))            return { rows: [{ new_deals: '0' }] };
    if (/AS prev_new_deals/.test(sql))       return { rows: [{ prev_new_deals: '0' }] };
    if (/AS total_tasks/.test(sql))          return { rows: [{ total_tasks: '0', done_tasks: '0', overdue_tasks: '0' }] };
    if (/analytics_layout/.test(sql))        return { rows: [{ analytics_layout: {} }] };
    if (/top_open/.test(sql) || /LIMIT 8/.test(sql)) return { rows: [{ id: 9, title: 'Big one', val: '900', contact_name: 'Anna', contact_company: 'Berg', stage_name: 'Proposal', stage_color: '#f00', assigned_to_name: 'Mo' }] };
    return { rows: [] };
  } };
  let s2;
  before(async () => { s2 = await serve({ '/api/analytics': loadRoute('analytics.js', { pool: pool2 }) }); });
  after(async () => { await s2.close(); });

  test('the summary carries the largest open deals with what the card needs to draw a row', async () => {
    const r = await s2.request('GET', '/api/analytics/summary');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.top_open_deals));
    assert.deepEqual(r.body.top_open_deals[0], { id: 9, title: 'Big one', value: 900, contact_name: 'Anna', contact_company: 'Berg', stage_name: 'Proposal', stage_color: '#f00', assigned_to_name: 'Mo' });
    const q = calls2.find(c => /LIMIT 8/.test(c.sql));
    assert.ok(q, 'the query asks for the top 8');
    assert.match(q.sql, /NOT \(d\.stage_id = ANY\(\$\d::int\[\]\)\)/, 'won and lost stages are excluded as bound ids');
    assert.match(q.sql, /ORDER BY val DESC NULLS LAST/);
  });
  test('a value_field that is not one of this workspace\'s deal fields never reaches SQL', async () => {
    const r = await s2.request('GET', '/api/analytics/summary');
    assert.equal(r.status, 200, 'a bad stored value is ignored, not fatal');
    for (const c of calls2) assert.doesNotMatch(c.sql, /DROP TABLE/, c.sql.slice(0, 60));
    assert.equal(r.body.pipeline_value, null, 'with no usable value field the money metrics are simply unset');
  });
  test('PATCH /config refuses a value field this workspace does not have', async () => {
    const bad = await s2.request('PATCH', '/api/analytics/config', { value_field: "x')::numeric--", won_stage_ids: [], lost_stage_ids: [] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /value field/i);
    const ok = await s2.request('PATCH', '/api/analytics/config', { value_field: 'budget', won_stage_ids: [1], lost_stage_ids: [] });
    assert.equal(ok.status, 200);
    const okNull = await s2.request('PATCH', '/api/analytics/config', { value_field: null, won_stage_ids: [], lost_stage_ids: [] });
    assert.equal(okNull.status, 200, 'clearing it stays allowed');
  });
});

describe('deals by owner', () => {
  const calls3 = [];
  const pool3 = { query: async (sql, params) => {
    calls3.push({ sql, params });
    if (/analytics_config/.test(sql) && /SELECT/.test(sql)) return { rows: [{ analytics_config: { won_stage_ids: [1], lost_stage_ids: [2], value_field: 'value' } }] };
    if (/FROM deal_fields/.test(sql))      return { rows: [] };
    if (/AS total_contacts/.test(sql))     return { rows: [{ total_contacts: '0' }] };
    if (/AS new_contacts/.test(sql))       return { rows: [{ new_contacts: '0' }] };
    if (/GROUP BY stage_id/.test(sql))     return { rows: [] };
    if (/AS new_deals/.test(sql))          return { rows: [{ new_deals: '0' }] };
    if (/AS prev_new_deals/.test(sql))     return { rows: [{ prev_new_deals: '0' }] };
    if (/ AS av\b/.test(sql))              return { rows: [{ av: null }] };
    if (/AS avg_deal_size/.test(sql))      return { rows: [{ avg_deal_size: null, n: '0' }] };
    if (/AS prev_avg_deal_size/.test(sql)) return { rows: [{ prev_avg_deal_size: null }] };
    if (/AS total_tasks/.test(sql))        return { rows: [{ total_tasks: '0', done_tasks: '0', overdue_tasks: '0' }] };
    if (/analytics_layout/.test(sql))      return { rows: [{ analytics_layout: {} }] };
    if (/FROM user_workspaces/.test(sql))  return { rows: [{ id: 3, name: 'Mo Said', cnt: '5', won_count: '2', lost_count: '1', val: '700' }, { id: 4, name: 'Ada L', cnt: '0', won_count: '0', lost_count: '0', val: '0' }] };
    return { rows: [] };
  } };
  let s3;
  before(async () => { s3 = await serve({ '/api/analytics': loadRoute('analytics.js', { pool: pool3 }) }); });
  after(async () => { await s3.close(); });

  test('every member of the workspace comes back, with the window applied and open derived', async () => {
    const r = await s3.request('GET', '/api/analytics/summary?months=3');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.by_owner[0], { id: 3, name: 'Mo Said', deals: 5, open: 2, won: 2, lost: 1, value: 700 });
    assert.deepEqual(r.body.by_owner[1], { id: 4, name: 'Ada L', deals: 0, open: 0, won: 0, lost: 0, value: 0 });
    const q = calls3.find(c => /FROM user_workspaces/.test(c.sql));
    assert.match(q.sql, /LEFT JOIN deals/, 'a member with no deals still appears, like the reference');
    assert.match(q.sql, /FILTER \(WHERE d\.stage_id = ANY\(\$\d::int\[\]\)\)/);
    assert.match(q.sql, /\|\| ' months'\)::interval/, 'counts only deals created in the window');
  });
});

describe('pipeline funnel', () => {
  const calls4 = [];
  const stages = [
    { id: 10, name: 'New', color: '#aaa', position: 0 },
    { id: 11, name: 'Proposal', color: '#bbb', position: 1 },
    { id: 12, name: 'Won', color: '#0f0', position: 2 },
    { id: 13, name: 'Lost', color: '#f00', position: 3 },
  ];
  const pool4 = { query: async (sql, params) => {
    calls4.push({ sql, params });
    if (/analytics_config/.test(sql) && /SELECT/.test(sql)) return { rows: [{ analytics_config: { won_stage_ids: [12], lost_stage_ids: [13], value_field: 'value' } }] };
    if (/FROM deal_fields/.test(sql))      return { rows: [] };
    if (/AS total_contacts/.test(sql))     return { rows: [{ total_contacts: '0' }] };
    if (/AS new_contacts/.test(sql))       return { rows: [{ new_contacts: '0' }] };
    if (/GROUP BY stage_id/.test(sql) && /created_at/.test(sql)) return { rows: [{ stage_id: 10, cnt: '2' }, { stage_id: 11, cnt: '3' }, { stage_id: 12, cnt: '5' }, { stage_id: 13, cnt: '4' }] };
    if (/GROUP BY d\.stage_id/.test(sql))  return { rows: [{ stage_id: 10, cnt: '1', val: '100' }, { stage_id: 11, cnt: '2', val: '250' }] };
    if (/GROUP BY stage_id/.test(sql))     return { rows: [] };
    if (/FROM pipelines/.test(sql) && /LIMIT 1/.test(sql)) return { rows: [{ id: 7, name: 'Sales' }] };
    if (/FROM pipeline_stages/.test(sql) && /pipeline_id=\$2/.test(sql)) return { rows: stages };
    if (/FROM pipeline_stages/.test(sql)) return { rows: [] };
    if (/AS new_deals/.test(sql))          return { rows: [{ new_deals: '0' }] };
    if (/AS prev_new_deals/.test(sql))     return { rows: [{ prev_new_deals: '0' }] };
    if (/ AS av\b/.test(sql))              return { rows: [{ av: null }] };
    if (/AS avg_deal_size/.test(sql))      return { rows: [{ avg_deal_size: null, n: '0' }] };
    if (/AS prev_avg_deal_size/.test(sql)) return { rows: [{ prev_avg_deal_size: null }] };
    if (/AS total_tasks/.test(sql))        return { rows: [{ total_tasks: '0', done_tasks: '0', overdue_tasks: '0' }] };
    if (/analytics_layout/.test(sql))      return { rows: [{ analytics_layout: {} }] };
    if (/FROM user_workspaces/.test(sql))  return { rows: [] };
    return { rows: [] };
  } };
  let s4;
  before(async () => { s4 = await serve({ '/api/analytics': loadRoute('analytics.js', { pool: pool4 }) }); });
  after(async () => { await s4.close(); });

  test('one row per non-lost stage, reached counted as a suffix of the pipeline order', async () => {
    const r = await s4.request('GET', '/api/analytics/summary');
    assert.equal(r.status, 200);
    const f = r.body.funnel;
    assert.equal(f.pipeline_name, 'Sales');
    assert.deepEqual(f.rows.map(x => x.name), ['New', 'Proposal', 'Won'], 'the lost stage is its own bucket, not a funnel row');
    // cohort: New 2, Proposal 3, Won 5, Lost 4 → reached New = 2+3+5 +4 lost = 14, Proposal = 8, Won = 5
    assert.deepEqual(f.rows.map(x => x.reached), [14, 8, 5]);
    // in-stage and value come from where deals sit now, not from the window
    assert.deepEqual(f.rows.map(x => x.in_stage), [1, 2, 0]);
    assert.deepEqual(f.rows.map(x => x.value), [100, 250, 0]);
    assert.deepEqual(f.lost, { name: 'Lost', color: '#f00', deals: 4, value: 0, base: 14 });
  });
  test('it scopes to one pipeline, defaults to the first, and takes ?pipeline_id', async () => {
    const q = calls4.find(c => /FROM pipelines/.test(c.sql) && /LIMIT 1/.test(c.sql));
    assert.ok(q, 'the default pipeline is looked up, not guessed');
    calls4.length = 0;
    await s4.request('GET', '/api/analytics/summary?pipeline_id=42');
    const st = calls4.find(c => /FROM pipeline_stages/.test(c.sql) && /pipeline_id=\$2/.test(c.sql));
    assert.ok(st.params.includes(42), 'the requested pipeline is used, as a bound parameter');
  });
});

describe('win rate per month', () => {
  const pool5 = { query: async (sql, params) => {
    if (/analytics_config/.test(sql) && /SELECT/.test(sql)) return { rows: [{ analytics_config: { won_stage_ids: [12], lost_stage_ids: [13], value_field: 'value' } }] };
    if (/FROM deal_fields/.test(sql))      return { rows: [] };
    if (/AS total_contacts/.test(sql))     return { rows: [{ total_contacts: '0' }] };
    if (/AS new_contacts/.test(sql))       return { rows: [{ new_contacts: '0' }] };
    if (/date_trunc\('month'/.test(sql) && /AS ym/.test(sql)) {
      const now = new Date(), ym = n => { const d = new Date(now.getFullYear(), now.getMonth() - n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
      return { rows: [
        { ym: ym(5), created: '10', won: '3', lost: '1' },   // 3 of 4 decided → 75 %
        { ym: ym(3), created: '4',  won: '0', lost: '0' },   // nothing decided → no point
        { ym: ym(0), created: '6',  won: '1', lost: '3' },   // 1 of 4 decided → 25 %
      ] };
    }
    if (/GROUP BY stage_id/.test(sql))     return { rows: [] };
    if (/GROUP BY d\.stage_id/.test(sql))  return { rows: [] };
    if (/FROM pipelines/.test(sql))        return { rows: [] };
    if (/FROM pipeline_stages/.test(sql))  return { rows: [] };
    if (/AS new_deals/.test(sql))          return { rows: [{ new_deals: '0' }] };
    if (/AS prev_new_deals/.test(sql))     return { rows: [{ prev_new_deals: '0' }] };
    if (/ AS av\b/.test(sql))              return { rows: [{ av: null }] };
    if (/AS avg_deal_size/.test(sql))      return { rows: [{ avg_deal_size: null, n: '0' }] };
    if (/AS prev_avg_deal_size/.test(sql)) return { rows: [{ prev_avg_deal_size: null }] };
    if (/AS total_tasks/.test(sql))        return { rows: [{ total_tasks: '0', done_tasks: '0', overdue_tasks: '0' }] };
    if (/analytics_layout/.test(sql))      return { rows: [{ analytics_layout: {} }] };
    if (/FROM user_workspaces/.test(sql))  return { rows: [] };
    return { rows: [] };
  } };
  let s5;
  before(async () => { s5 = await serve({ '/api/analytics': loadRoute('analytics.js', { pool: pool5 }) }); });
  after(async () => { await s5.close(); });

  test('one bucket per month in the window, empty months filled in, newest last', async () => {
    const r = await s5.request('GET', '/api/analytics/summary?months=6');
    assert.equal(r.status, 200);
    const t = r.body.win_rate_trend;
    assert.equal(t.length, 6, 'six months asked for, six buckets back');
    const now = new Date();
    assert.equal(t[5].ym, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, 'the current month is last');
    assert.deepEqual(t.map(m => m.created), [10, 0, 4, 0, 0, 6], 'months with no deals are present as zeros, not missing');
  });
  test('the rate is won over decided, and is null — not zero — when nothing was decided', async () => {
    const t = (await s5.request('GET', '/api/analytics/summary?months=6')).body.win_rate_trend;
    assert.deepEqual(t.map(m => m.decided), [4, 0, 0, 0, 0, 4]);
    assert.deepEqual(t.map(m => m.rate), [75, null, null, null, null, 25], 'a month with nothing closed has no win rate to report');
    assert.equal(t[0].won, 3); assert.equal(t[0].lost, 1);
  });
  test('the window is honoured', async () => {
    const t = (await s5.request('GET', '/api/analytics/summary?months=3')).body.win_rate_trend;
    assert.equal(t.length, 3);
  });
});
