// ROUTE tests: the currency Analytics shows money in is the workspace's choice (2026-10-21).
// Before: public/js/analytics.js printed every amount with a hardcoded "$" while the deals board shows "€".
// Now analytics_config.currency (EUR, USD, GBP or CHF) is set in "Kennzahlen konfigurieren", saved by PATCH /config
// beside the won and lost stages and the value field, and refused when it is anything else. A PATCH without a
// currency leaves the saved one alone (the JSONB merge).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

let srv, written;
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT field_key FROM deal_fields')) return { rows: [{ field_key: 'budget' }] };
    if (q.startsWith('UPDATE workspaces SET analytics_config = analytics_config || $1::jsonb')) { written.push(JSON.parse(params[0])); return { rows: [] }; }
    return { rows: [] };
  },
};
before(async () => { srv = await serve({ '/api/analytics': loadRoute('analytics.js', { pool }) }); });
after(() => srv.close());

describe('PATCH /api/analytics/config: the currency', () => {
  test('each of EUR, USD, GBP and CHF is saved with the rest of the configuration', async () => {
    for (const currency of ['EUR', 'USD', 'GBP', 'CHF']) {
      written = [];
      const r = await srv.request('PATCH', '/api/analytics/config', { won_stage_ids: [1], lost_stage_ids: [2], value_field: 'value', currency });
      assert.equal(r.status, 200, currency);
      assert.deepEqual(written, [{ won_stage_ids: [1], lost_stage_ids: [2], value_field: 'value', currency }]);
    }
  });
  test('anything else is refused and nothing is written', async () => {
    for (const currency of ['XYZ', 'eur', '$', '', 42, null]) {
      written = [];
      const r = await srv.request('PATCH', '/api/analytics/config', { won_stage_ids: [], lost_stage_ids: [], value_field: null, currency });
      assert.equal(r.status, 400, String(currency));
      assert.match(r.body.error, /currency/i);
      assert.deepEqual(written, []);
    }
  });
  test('without a currency the saved one is left as it is (the merge does not touch the key)', async () => {
    written = [];
    const r = await srv.request('PATCH', '/api/analytics/config', { won_stage_ids: [1], lost_stage_ids: [], value_field: 'budget' });
    assert.equal(r.status, 200);
    assert.deepEqual(written, [{ won_stage_ids: [1], lost_stage_ids: [], value_field: 'budget' }]);
  });
});
