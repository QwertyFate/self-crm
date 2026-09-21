// ROUTE tests for the contact CRUD endpoints in routes/contacts.js (the import
// and onboarding trigger have their own files). Fixture: workspace 7 owns
// stage 30 and user 1; workspace 8 owns stage 31 and user 2. Caller is 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWNED = new Set([10, 12]);   // contact ids in workspace 7
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /SELECT 'stage' AS kind, id FROM stages WHERE workspace_id=\$1/, reply: p => ({ rows: p[0] === 7 ? [{ kind: 'stage', id: 30 }, { kind: 'user', id: 1 }] : [] }) },
    { match: /^SELECT id FROM contacts WHERE workspace_id=\$1 AND LOWER\(email\)=\$2/, reply: p => ({ rows: p[1] === 'dup@x.de' ? [{ id: 99 }] : [] }) },
    { match: /^INSERT INTO contacts/,          reply: () => ({ rows: [{ id: 77 }] }) },
    { match: /^UPDATE contacts SET name=\$1/,  reply: p => ({ rows: [], rowCount: OWNED.has(Number(p[8])) && p[9] === 7 ? 1 : 0 }) },
    { match: /^UPDATE contacts SET stage_id=\$1/, reply: p => ({ rows: [], rowCount: OWNED.has(Number(p[1])) && p[2] === 7 ? 1 : 0 }) },
    { match: /^DELETE FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: [], rowCount: OWNED.has(Number(p[0])) && p[1] === 7 ? 1 : 0 }) },
    { match: /^DELETE FROM contacts WHERE id IN/, reply: p => ({ rows: [], rowCount: p.slice(1).filter(id => OWNED.has(Number(id))).length }) },
    { match: /FROM contacts c/, reply: () => ({ rows: [{ id: 10, name: 'A', stage_name: null, assigned_to_name: null }] }) },
  ]);
  server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

describe('GET /api/contacts', () => {
  test('list is workspace-scoped and its stage/assignee joins are scoped too', async () => {
    const r = await server.request('GET', '/api/contacts');
    assert.equal(r.status, 200);
    const q = pool.find(/FROM contacts c/);
    assert.match(q.sql, /s\.workspace_id = c\.workspace_id/);
    assert.match(q.sql, /u\.workspace_id = c\.workspace_id/);
    assert.match(q.sql, /WHERE c\.workspace_id = \$1/);
    assert.equal(q.params[0], 7);
  });
});

describe('POST / PUT / PATCH stage — foreign references refused', () => {
  test('POST with a foreign stage -> 400 naming stage_id, no INSERT', async () => {
    const r = await server.request('POST', '/api/contacts', { name: 'N', stage_id: 31 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /^stage_id/);
    assert.equal(pool.some(/^INSERT INTO contacts/), false);
  });
  test('POST with a foreign assignee -> 400 naming assigned_to, no INSERT', async () => {
    const r = await server.request('POST', '/api/contacts', { name: 'N', assigned_to: 2 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /^assigned_to/);
    assert.equal(pool.some(/^INSERT INTO contacts/), false);
  });
  test('POST with an email that already exists (any case) -> 409, no INSERT', async () => {
    const r = await server.request('POST', '/api/contacts', { name: 'N', email: 'DUP@x.de' });
    assert.equal(r.status, 409);
    assert.equal(pool.some(/^INSERT INTO contacts/), false);
  });
  test('POST own -> 201 {id}; email lower-cased; assignee defaults to the caller', async () => {
    const r = await server.request('POST', '/api/contacts', { name: 'N', email: 'New@X.de', stage_id: 30 });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 77 });
    const p = pool.find(/^INSERT INTO contacts/).params;
    assert.equal(p[0], 7);
    assert.equal(p[2], 'new@x.de');
    assert.equal(p[6], 1, 'assigned to the caller when not given');
  });
  test('PUT with a foreign stage -> 400, no UPDATE; PUT on a foreign contact -> 404', async () => {
    const a = await server.request('PUT', '/api/contacts/10', { name: 'N', stage_id: 31 });
    assert.equal(a.status, 400);
    assert.equal(pool.some(/^UPDATE contacts/), false);
    const b = await server.request('PUT', '/api/contacts/11', { name: 'N' });
    assert.equal(b.status, 404, 'contact 11 is not in workspace 7');
  });
  test('PATCH stage: foreign stage -> 400; foreign contact -> 404; own -> 200 with scoped UPDATE', async () => {
    assert.equal((await server.request('PATCH', '/api/contacts/10/stage', { stage_id: 31 })).status, 400, 'foreign stage');
    assert.equal((await server.request('PATCH', '/api/contacts/11/stage', { stage_id: 30 })).status, 404, 'foreign contact');
    pool.reset();
    const ok = await server.request('PATCH', '/api/contacts/10/stage', { stage_id: 30 });
    assert.equal(ok.status, 200);
    assert.deepEqual(pool.find(/^UPDATE contacts SET stage_id/).params, [30, '10', 7]);
  });
});

describe('DELETE and bulk delete — only rows of this workspace', () => {
  test("DELETE /:id on another workspace's contact -> 404 (the DELETE carries workspace_id)", async () => {
    const r = await server.request('DELETE', '/api/contacts/11');
    assert.equal(r.status, 404);
    assert.deepEqual(pool.find(/^DELETE FROM contacts WHERE id=\$1/).params, ['11', 7]);
  });
  test('DELETE /:id on an own contact -> 200', async () => {
    assert.equal((await server.request('DELETE', '/api/contacts/10')).status, 200);
  });
  test('bulk delete with mixed own + foreign ids deletes only the own ones and reports that count', async () => {
    const r = await server.request('POST', '/api/contacts/bulk/delete', { contactIds: [10, 11, 12, 13] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { deleted: 2 });
    const q = pool.find(/^DELETE FROM contacts WHERE id IN/);
    assert.match(q.sql, /AND workspace_id=\$1/);
    assert.deepEqual(q.params, [7, 10, 11, 12, 13]);
  });
  test('bulk delete with an empty or non-array body -> 400, no query', async () => {
    assert.equal((await server.request('POST', '/api/contacts/bulk/delete', { contactIds: [] })).status, 400);
    assert.equal((await server.request('POST', '/api/contacts/bulk/delete', { contactIds: 'x' })).status, 400);
    assert.equal(pool.log.length, 0);
  });
});
