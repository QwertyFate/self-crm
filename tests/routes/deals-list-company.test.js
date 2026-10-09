// ROUTE tests: the deal list and single-deal reads carry the contact's company
// (contact_company) so the Deals board and list can show "Name, Company".
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const calls = [];
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 1, title: 'Acme', contact_name: 'Anna', contact_company: 'Berg GmbH' }] }; } };

let server;
before(async () => { server = await serve({ '/api/deals': loadRoute('deals.js', { pool }) }); });
after(async () => { await server.close(); });

describe('GET /api/deals', () => {
  test('selects c.company AS contact_company next to contact_name, scoped to the workspace', async () => {
    calls.length = 0;
    const r = await server.request('GET', '/api/deals?pipeline_id=3');
    assert.equal(r.status, 200);
    assert.equal(r.body[0].contact_company, 'Berg GmbH');
    const { sql, params } = calls[0];
    assert.match(sql, /c\.name\s+AS contact_name/);
    assert.match(sql, /c\.company\s+AS contact_company/);
    assert.match(sql, /WHERE d\.workspace_id = \$1/);
    assert.deepEqual(params, [7, 3]);
  });
  test('GET /api/deals/:id carries it too', async () => {
    calls.length = 0;
    const r = await server.request('GET', '/api/deals/1');
    assert.equal(r.status, 200);
    assert.match(calls[0].sql, /c\.company\s+AS contact_company/);
  });
});
