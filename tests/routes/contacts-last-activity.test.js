// ROUTE test: the contact list carries last_activity_at (newest activity per
// contact) so the Contacts toolbar's "Last contact" chip (Today / Last 7 days /
// Last 30 days / Older than 30 days / Never) has something to filter on.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const calls = [];
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 1, name: 'Anna', last_activity_at: '2026-10-01T10:00:00.000Z' }] }; } };

let server;
before(async () => { server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) }); });
after(async () => { await server.close(); });

describe('GET /api/contacts', () => {
  test('selects the newest activity timestamp per contact as last_activity_at, scoped to the workspace', async () => {
    calls.length = 0;
    const r = await server.request('GET', '/api/contacts?contact_type=contact');
    assert.equal(r.status, 200);
    assert.equal(r.body[0].last_activity_at, '2026-10-01T10:00:00.000Z');
    const { sql, params } = calls[0];
    assert.match(sql, /\(SELECT MAX\(a\.created_at\) FROM activities a WHERE a\.contact_id = c\.id\) AS last_activity_at/);
    assert.match(sql, /WHERE c\.workspace_id = \$1/);
    assert.deepEqual(params, [7, 'contact']);
  });
});
