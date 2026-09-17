// ROUTE tests for the object link endpoints: both ends of a link must belong
// to the caller's workspace. Fixture: workspace 7 owns object 40, deal 50,
// contact 60; workspace 8 owns 41, 51, 61. Caller is workspace 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWNER = { objects: { 40: 7, 41: 8 }, deals: { 50: 7, 51: 8 }, contacts: { 60: 7, 61: 8 } };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /EXISTS \(SELECT 1 FROM objects WHERE id=\$1 AND workspace_id=\$3\) AS obj, EXISTS \(SELECT 1 FROM (deals|contacts) WHERE id=\$2 AND workspace_id=\$3\) AS linked/,
      reply: (p, sql) => {
        const table = /FROM (deals|contacts) WHERE id=\$2/.exec(sql)[1];
        return { rows: [{ obj: OWNER.objects[p[0]] === p[2], linked: OWNER[table][p[1]] === p[2] }] };
      } },
    { match: /^(INSERT INTO|DELETE FROM) (deal_objects|object_contacts)/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/objects': loadRoute('objects.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

const writes = () => pool.filter(/^(INSERT INTO|DELETE FROM) (deal_objects|object_contacts)/);

describe('mismatched ownership -> 404, nothing written', () => {
  for (const [method, url, body, why, msg] of [
    ['DELETE', '/api/objects/40/deals/51',    undefined,          'foreign deal on own object',    'Deal not found'],
    ['DELETE', '/api/objects/41/deals/50',    undefined,          'foreign object, own deal',      'Not found'],
    ['DELETE', '/api/objects/40/contacts/61', undefined,          'foreign contact on own object', 'Contact not found'],
    ['DELETE', '/api/objects/41/contacts/60', undefined,          'foreign object, own contact',   'Not found'],
    ['POST',   '/api/objects/40/contacts',    { contact_id: 61 }, 'attach a foreign contact',      'Contact not found'],
    ['POST',   '/api/objects/41/contacts',    { contact_id: 60 }, 'attach to a foreign object',    'Not found'],
    ['POST',   '/api/objects/41/deals',       { deal_id: 50 },    'own deal onto a foreign object','Not found'],
    ['POST',   '/api/objects/40/deals',       { deal_id: 51 },    'a foreign deal',                'Deal not found'],
  ]) {
    test(`${method} ${url} (${why})`, async () => {
      const r = await server.request(method, url, body);
      assert.equal(r.status, 404);
      assert.equal(r.body.error, msg);
      assert.equal(writes().length, 0);
    });
  }
});

describe('own object + own linked row: accepted with the original write', () => {
  for (const [method, url, body, status, sqlRe, params] of [
    ['POST',   '/api/objects/40/deals',       { deal_id: 50 },    201, /^INSERT INTO deal_objects/,    [50, '40']],
    ['DELETE', '/api/objects/40/deals/50',    undefined,          200, /^DELETE FROM deal_objects/,    ['50', '40']],
    ['POST',   '/api/objects/40/contacts',    { contact_id: 60 }, 201, /^INSERT INTO object_contacts/, ['40', 60]],
    ['DELETE', '/api/objects/40/contacts/60', undefined,          200, /^DELETE FROM object_contacts/, ['40', '60']],
  ]) {
    test(`${method} ${url}`, async () => {
      const r = await server.request(method, url, body);
      assert.equal(r.status, status);
      assert.deepEqual(r.body, { success: true });
      assert.deepEqual(pool.find(sqlRe).params, params);
    });
  }
});

test('a missing body id -> 400 before any query runs', async () => {
  const r = await server.request('POST', '/api/objects/40/deals', {});
  assert.equal(r.status, 400);
  assert.equal(pool.log.length, 0);
});
