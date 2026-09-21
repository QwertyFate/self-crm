// ROUTE tests for the PUBLIC inbound webhook POST /api/integrations/receive/:key
// (no session; the key is the credential). Fixture: key "k7" belongs to
// workspace 7 with a field map; "off" is an inactive key.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const HOOK = { id: 1, workspace_id: 7, webhook_key: 'k7', active: true, field_map: { name: 'full_name', email: 'email', phone: 'phone_number', company: 'company', budget: 'data.budget' }, create_deal: true, pipeline_id: 20, stage_id: 30, default_assignee_id: 1 };
const existing = new Map([['bob@x.de', { id: 55, name: 'Bob' }]]);
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /FROM workspace_webhook WHERE webhook_key=\$1 AND active=true/, reply: p => ({ rows: p[0] === 'k7' ? [HOOK] : [] }) },
    { match: /^SELECT id, name FROM contacts WHERE workspace_id=\$1 AND LOWER\(email\)=\$2/, reply: p => ({ rows: p[0] === 7 && existing.has(p[1]) ? [existing.get(p[1])] : [] }) },
    { match: /^UPDATE contacts SET name=\$1, phone=\$2/, reply: p => ({ rows: [{ id: p[4], name: p[0] }] }) },
    { match: /^INSERT INTO contacts/,     reply: p => ({ rows: [{ id: 88, name: p[1] }] }) },
    { match: /^INSERT INTO deals/,        reply: () => ({ rows: [{ id: 501 }] }) },
    { match: /^INSERT INTO webhook_logs/, reply: () => ({ rows: [] }) },
  ]);
  server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());
const post = (key, body) => server.request('POST', `/api/integrations/receive/${key}`, body);

describe('POST /receive/:key', () => {
  test('unknown or inactive key -> 404 with no writes', async () => {
    for (const k of ['nope', 'off']) {
      const r = await post(k, { full_name: 'A', email: 'a@x.de' });
      assert.equal(r.status, 404, k);
    }
    assert.equal(pool.writes().length, 0);
  });
  test('neither name nor email in the mapped payload -> 422, logged to webhook_logs, no contact', async () => {
    const r = await post('k7', { something: 'else' });
    assert.equal(r.status, 422);
    const log = pool.find(/^INSERT INTO webhook_logs/);
    assert.ok(log, 'logged');
    assert.equal(log.params[0], 7);
    assert.equal(pool.some(/^INSERT INTO contacts/), false);
  });
  test("a new lead -> contact created in the KEY's workspace, email lower-cased, custom field captured via dot path, deal created in the hook's pipeline", async () => {
    const r = await post('k7', { full_name: 'Erika Muster', email: 'Erika@Muster.DE', phone_number: '+49', company: 'M GmbH', data: { budget: '5000' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, contact_id: 88, deal_id: 501 });
    const c = pool.find(/^INSERT INTO contacts/).params;
    assert.equal(c[0], 7, 'workspace comes from the key, never the payload');
    assert.equal(c[2], 'erika@muster.de');
    assert.equal(c[5], JSON.stringify({ budget: '5000' }));
    assert.equal(c[6], 1, 'default assignee from the hook');
    const d = pool.find(/^INSERT INTO deals/).params;
    assert.deepEqual(d.slice(0, 4), [7, 88, 20, 30]);
  });
  test('an existing email -> the existing contact is updated (no duplicate), scoped to the workspace', async () => {
    const r = await post('k7', { full_name: 'Bob Neu', email: 'BOB@x.de' });
    assert.equal(r.status, 200);
    assert.equal(r.body.contact_id, 55, 'the existing row');
    assert.equal(pool.some(/^INSERT INTO contacts/), false);
    const u = pool.find(/^UPDATE contacts SET name=\$1, phone=\$2/).params;
    assert.equal(u[0], 'Bob Neu');
    assert.deepEqual(u.slice(4), [55, 7]);
  });
});
