// UNIT tests for the CSV import body-size fix. server.js is a side-effecting
// entrypoint (connects to Postgres, starts the HTTP+socket.io server at module
// load time) so it can't be required directly in a test; instead this pins
// the exact two pieces of its source, and separately proves — with a fresh,
// isolated Express app — that the underlying mechanism those two lines rely
// on (a route-scoped express.json() with a larger limit, mounted before the
// app-wide one; body-parser skips re-parsing a request whose body it already
// read) genuinely works. A real CSV import exceeding the old 100kb default
// (e.g. ~500kb) used to be rejected with a bare "Internal server error"; now
// it's accepted up to 10mb on that one route, and every other route keeps the
// smaller default.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const express = require('express');

const serverSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

describe('server.js: the import route gets a larger body limit before the global one applies', () => {
  test('the route-scoped express.json({ limit }) is mounted on /api/contacts/import, before the app-wide express.json()', () => {
    const routeIdx  = serverSrc.indexOf("app.use('/api/contacts/import', express.json(");
    const globalIdx = serverSrc.indexOf('app.use(express.json());');
    assert.ok(routeIdx !== -1, 'route-scoped json() middleware is present');
    assert.ok(globalIdx !== -1, 'the app-wide json() middleware is present');
    assert.ok(routeIdx < globalIdx, 'the route-scoped one must be registered first, or body-parser never sees the larger limit');
    const line = serverSrc.slice(routeIdx, serverSrc.indexOf('\n', routeIdx));
    assert.match(line, /limit:\s*['"]10mb['"]/);
  });
  test('the generic error handler reports a clear, non-500 message for a too-large request instead of masking it', () => {
    const handler = serverSrc.slice(serverSrc.indexOf('app.use((err, req, res, next) => {'));
    assert.match(handler, /err\.type === 'entity\.too\.large'/);
    assert.match(handler, /res\.status\(413\)/);
    assert.doesNotMatch(handler.match(/res\.status\(413\)\.json\(\{[^}]*\}\)/)[0], /Internal server error/);
  });
});

describe('the mechanism itself: route-scoped json() limit + app-wide fallback, same shape as server.js', () => {
  let server, base;
  before(async () => {
    const app = express();
    // Mirrors server.js's two lines exactly (see the test above for the pin on the real file).
    app.use('/api/contacts/import', express.json({ limit: '10mb' }));
    app.use(express.json());
    app.post('/api/contacts/import', (req, res) => res.json({ ok: true, bytes: JSON.stringify(req.body).length }));
    app.post('/api/other', (req, res) => res.json({ ok: true, bytes: JSON.stringify(req.body).length }));
    app.use((err, req, res, next) => {
      if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too large' });
      res.status(500).json({ error: 'internal' });
    });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(resolve => server.close(resolve)));

  test('a body well over the 100kb default (but under 10mb) is accepted on the import route', async () => {
    const body = JSON.stringify({ rows: 'x'.repeat(300000) }); // ~300KB
    const r = await fetch(`${base}/api/contacts/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(r.status, 200);
  });
  test('the same oversized body is still rejected on a route with no scoped override', async () => {
    const body = JSON.stringify({ rows: 'x'.repeat(300000) });
    const r = await fetch(`${base}/api/other`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(r.status, 413);
    assert.equal((await r.json()).error, 'too large');
  });
});
