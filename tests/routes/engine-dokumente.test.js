// ROUTE tests for routes/engine-dokumente.js — GET /api/dokumente/:id/download
// behind the real engineAuth: a time-limited signed link for the Engine
// (briefing §5.2 "Binary data; a time-limited link is acceptable").
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, inject, ROOT } = require('../helpers/load-route');

const KEY  = 'upg_live_00112233445566778899aabbccddeeff';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');
const state = { signFails: false };
const signed = [];
let pool, server;

before(async () => {
  inject('storage.js', { signedDocumentUrl: async (p, s) => { signed.push([p, s]); if (state.signFails) throw new Error('sign failed'); return `https://signed.example/${p}?exp=${s}`; } });
  pool = createFakePool([
    { match: /FROM api_keys WHERE key_hash = \$1/, reply: p => ({ rows: p[0] === HASH ? [{ id: 5, workspace_id: 7, scopes: [] }] : [] }) },
    { match: /^UPDATE api_keys SET last_used_at/,  reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /^SELECT storage_path FROM contact_documents WHERE id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: p[0] === 9 && p[1] === 7 ? [{ storage_path: '7/55/123-Vertrag.pdf' }] : [] }) },
  ]);
  server = await serve({ '/api/dokumente': loadRoute('engine-dokumente.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); signed.length = 0; state.signFails = false; });

const get = (p, headers = {}) => fetch(server.base + p, { headers, redirect: 'manual' });
const AUTH = { Authorization: `Bearer ${KEY}` };

test('no key → 401 nicht_authentifiziert, no lookup, no signing', async () => {
  const r = await get('/api/dokumente/9/download');
  assert.equal(r.status, 401);
  assert.equal((await r.json()).fehler.code, 'nicht_authentifiziert');
  assert.equal(pool.some(/contact_documents/), false); assert.equal(signed.length, 0);
});

test('own document → 302 to a signed URL valid 600 s, no caching; the lookup is workspace-scoped', async () => {
  const r = await get('/api/dokumente/9/download', AUTH);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://signed.example/7/55/123-Vertrag.pdf?exp=600');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(pool.find(/FROM contact_documents/).params, [9, 7]);
  assert.deepEqual(signed, [['7/55/123-Vertrag.pdf', 600]]);
});

test('unknown id or another workspace\'s document → 404 nicht_gefunden; non-numeric → 400; unknown path → JSON 404', async () => {
  let r = await get('/api/dokumente/10/download', AUTH);
  assert.equal(r.status, 404); assert.equal((await r.json()).fehler.code, 'nicht_gefunden');
  r = await get('/api/dokumente/abc/download', AUTH);
  assert.equal(r.status, 400); assert.equal((await r.json()).fehler.code, 'ungueltige_id');
  r = await get('/api/dokumente/9', AUTH);
  assert.equal(r.status, 404); assert.equal((await r.json()).fehler.code, 'nicht_gefunden');
  assert.equal(signed.length, 0);
});

test('a signing failure is a 500 in the fehler shape without internals', async () => {
  state.signFails = true;
  const r = await get('/api/dokumente/9/download', AUTH);
  assert.equal(r.status, 500);
  const body = await r.json();
  assert.equal(body.fehler.code, 'serverfehler');
  assert.doesNotMatch(JSON.stringify(body), /sign failed/);
});

test('the route never requires the webhook module (a read must not produce an event); server.js mounts it behind the limiter', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'engine-dokumente.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"][^'"]*utils\/engine['"]\)/);
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const iLimit = server.indexOf("app.use('/api/dokumente',     engineApiLimiter)");
  const iMount = server.indexOf("app.use('/api/dokumente',     require('./routes/engine-dokumente'))");
  assert.ok(iLimit > 0 && iMount > iLimit);
});
