/**
 * Load a REAL route file with its three infrastructure dependencies swapped:
 *
 *   ../db               -> the fake pool you pass in
 *   ../middleware/auth  -> a stub that "logs in" the caller (user 1,
 *                          workspace 7 by default) without a real session
 *   ../notifications    -> a no-op `notify`
 *
 * How the swap works: Node keeps every module it has `require`d in a cache
 * (`require.cache`), keyed by the file's absolute path. If we put our own
 * entry into that cache BEFORE the route file is loaded, then when the route
 * runs `require('../db')` Node hands it our entry and never opens the real
 * `db.js` (which would try to connect to Postgres and fail).
 *
 * Everything the route requires that is NOT swapped — express, the utils, the
 * sanitiser — is the genuine module. So the code being tested is the exact
 * code that ships; only the database, the login check and notifications are
 * stand-ins.
 *
 * `loadRoute` re-injects all three on every call, so two servers with
 * different users can be built from the same file (see engine-settings.test.js).
 */
const path    = require('path');
const express = require('express');

// The app root (the parent of tests/). TEST_APP_ROOT points the same tests at a
// mirror of the app — used to run a test against a pre-fix copy of a route
// ("baseline first"): TEST_APP_ROOT=<mirror> NODE_PATH=<app>/node_modules node --test <file>
const ROOT = process.env.TEST_APP_ROOT ? path.resolve(process.env.TEST_APP_ROOT) : path.resolve(__dirname, '..', '..');

// Put `exportsObject` in the module cache under `relativeFile`. Returns a
// function that restores whatever was there before.
function inject(relativeFile, exportsObject) {
  const abs = path.join(ROOT, relativeFile);
  const previous = require.cache[abs];
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObject, children: [], paths: [] };
  return () => { if (previous) require.cache[abs] = previous; else delete require.cache[abs]; };
}

// `notifications`: pass a whole module object to use instead of the no-op stub
// (e.g. the REAL notifications.js bound to the fake pool, to test notifySystem).
function loadRoute(routeFile, { pool, user = { id: 1, workspaceId: 7, role: 'owner' }, notify = () => {}, notifications } = {}) {
  inject('db.js', { pool });
  inject('notifications.js', notifications || { notify });
  inject('middleware/auth.js', (req, _res, next) => {
    req.userId = user.id; req.workspaceId = user.workspaceId; req.userRole = user.role; next();
  });
  const abs = path.join(ROOT, 'routes', routeFile);
  delete require.cache[abs];            // drop any earlier copy so this one binds to *this* fake pool
  return require(abs);
}

/**
 * Mount one or more routers on a throwaway Express app on a random free port,
 * and return a tiny HTTP client. Tests then drive the route exactly as the
 * browser would: a real HTTP request, real JSON body parsing, real status
 * codes — the only thing replaced is what sits behind `require('../db')`.
 *
 *   const server = await serve({ '/api/deals': loadRoute('deals.js', { pool }) });
 *   const r = await server.request('POST', '/api/deals', { title: 'T' }, { 'Idempotency-Key': 'k' });
 *   // r = { status, body, headers }
 */
async function serve(mounts) {
  const app = express();
  app.use(express.json());
  for (const [prefix, router] of Object.entries(mounts)) app.use(prefix, router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));

  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, urlPath, body, headers = {}) {
    const res = await fetch(base + urlPath, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* body was not JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  }

  return {
    base, request,
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

module.exports = { loadRoute, serve, inject, ROOT };
