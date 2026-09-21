/**
 * Minimal stand-ins for Express's req and res, for unit-testing middleware
 * directly (no HTTP, no Express).
 *
 *   const req = fakeReq({ headers: { Authorization: 'Bearer x' }, workspaceId: 7 });
 *   const res = fakeRes();
 *   await middleware(req, res, next);
 *   res.code, res.body, res.headers['www-authenticate'], res.sent
 *
 * fakeReq: header lookup is case-insensitive like Express's req.get(); any
 * extra properties (workspaceId, userId, params, …) are copied onto the object.
 * fakeRes: status() and set() are chainable like Express; json() records the
 * body and marks the response as sent.
 */
function fakeReq({ headers = {}, method = 'POST', url = '/', body, ...extra } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, url, originalUrl: url, body, get: name => h[String(name).toLowerCase()], ...extra };
}

function fakeRes() {
  return {
    code: 200, body: undefined, headers: {}, sent: false,
    status(c) { this.code = c; return this; },
    json(b)   { this.body = b; this.sent = true; return this; },
    set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
  };
}

module.exports = { fakeReq, fakeRes };
