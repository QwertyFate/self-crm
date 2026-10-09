// ROUTE tests: an auto-created deal's title is the bare contact name — no
// "Lead: " / "Deal: " prefix — for both places a deal gets created without a
// human typing a title: the CSV import (routes/contacts.js POST /import) and
// the inbound lead-capture webhook (routes/integrations.js POST /receive/:key).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

describe('POST /api/contacts/import: auto-created deal title', () => {
  let server;
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql)) return {};
      if (/INSERT INTO contacts/.test(sql)) return { rows: [{ id: 42 }] };
      if (/INSERT INTO deals/.test(sql)) return { rows: [] };
      throw new Error('unexpected query: ' + sql);
    },
    release: () => {},
  };
  const pool = { connect: async () => client };

  before(async () => { server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) }); });
  after(async () => { await server.close(); });

  test('the deal INSERT carries the contact name as-is, with no prefix', async () => {
    calls.length = 0;
    const r = await server.request('POST', '/api/contacts/import', {
      contacts: [{ name: 'Jordan Blake', custom_data: {} }],
      newFields: [],
      createDeals: true,
      createDealsForNew: true,
      createDealsForUpdated: false,
      pipelineId: 3,
      stageId: 9,
      defaultAssigneeId: null,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.deals_created, 1);
    const dealInsert = calls.find(c => /INSERT INTO deals/.test(c.sql));
    assert.ok(dealInsert, 'a deal was inserted');
    const title = dealInsert.params.at(-1);
    assert.equal(title, 'Jordan Blake');
    assert.doesNotMatch(title, /^Lead:|^Deal:/i);
  });
});

describe('POST /api/integrations/receive/:key: auto-created deal title', () => {
  let server;
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/FROM workspace_webhook/.test(sql)) {
        return { rows: [{ workspace_id: 7, active: true, create_deal: true, pipeline_id: 3, stage_id: 9, field_map: { name: 'full_name' }, default_assignee_id: null }] };
      }
      if (/INSERT INTO contacts/.test(sql)) return { rows: [{ id: 55, name: 'Priya Shah' }] };
      if (/INSERT INTO deals/.test(sql)) return { rows: [{ id: 1 }] };
      if (/INSERT INTO webhook_logs/.test(sql)) return { rows: [] };
      throw new Error('unexpected query: ' + sql);
    },
  };

  before(async () => { server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool }) }); });
  after(async () => { await server.close(); });

  test('the deal INSERT carries the captured contact name as-is, with no prefix', async () => {
    calls.length = 0;
    const r = await server.request('POST', '/api/integrations/receive/some-key', { full_name: 'Priya Shah' });
    assert.equal(r.status, 200);
    assert.equal(r.body.deal_id, 1);
    const dealInsert = calls.find(c => /INSERT INTO deals/.test(c.sql));
    assert.ok(dealInsert, 'a deal was inserted');
    const title = dealInsert.params.at(-1);
    assert.equal(title, 'Priya Shah');
    assert.doesNotMatch(title, /^Lead:|^Deal:/i);
  });
});
