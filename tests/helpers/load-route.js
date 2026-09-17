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
 */
const path    = require('path');
const express = require('express');

const ROOT = path.resolve(__dirname, '..', '..');   // the app root (the parent of tests/)

function inject(relativeFile, exportsObject) {
  const abs = path.join(ROOT, relativeFile);
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObject, children: [], paths: [] };
}

function loadRoute(routeFile, { pool, user = { id: 1, workspaceId: 7, role: 'owner' }, notify = () => {} } = {}) {
  inject('db.js', { pool });
  inject('notifications.js', { notify });
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
 */
async function serve(mounts) {
  const app = express();
  app.use(express.json());
  for (const [prefix, router] of Object.entries(mounts)) app.use(prefix, router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));

  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, urlPath, body) {
    const res = await fetch(base + urlPath, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* body was not JSON */ }
    return { status: res.status, body: json };
  }

  return { base, request, close: () => new Promise(resolve => server.close(resolve)) };
}

module.exports = { loadRoute, serve, inject, ROOT };
