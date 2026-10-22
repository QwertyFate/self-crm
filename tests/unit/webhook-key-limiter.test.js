// UNIT: the inbound lead webhook's per-key limit counts each workspace's webhook address on its own.
//
// WHY. server.js mounts the limiter with app.use('/api/integrations/receive', …). At that point Express has not
// matched the route's ":key" yet, so req.params.key is undefined and every request fell into one bucket ("unknown"):
// all workspaces together shared 120 lead deliveries a minute, and one busy workspace (or one flood) locked every
// other workspace's forms out. Senders like Make or Zapier come from shared addresses, so the per-IP limit does not
// separate workspaces either. Found in the full review of 2026-10-22 (LOGIN_LANDING_CHANGES Part 44).
// The limiter here is the one in server.js (its source evaluated with the real express-rate-limit), mounted the way
// server.js mounts it.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { read } = require('../helpers/client-fn');

const src = read('server.js');
const block = src.slice(src.indexOf('const webhookKeyLimiter = rateLimit({'), src.indexOf('// Cal.com\'s booking receiver'));
const makeLimiter = () => new Function('rateLimit', `${block}\nreturn webhookKeyLimiter;`)(rateLimit);

async function serve() {
  const app = express();
  app.use('/api/integrations/receive', makeLimiter());   // as server.js mounts it, before the router has matched :key
  app.post('/api/integrations/receive/:key', (req, res) => res.json({ ok: true }));
  const s = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const base = `http://127.0.0.1:${s.address().port}`;
  return { post: key => fetch(`${base}/api/integrations/receive/${key}`, { method: 'POST' }).then(r => r.status), close: () => new Promise(r => s.close(r)) };
}

describe('server.js webhookKeyLimiter', () => {
  test('is mounted on the receive prefix, after the per-IP limit', () => {
    assert.match(src, /app\.use\('\/api\/integrations\/receive', webhookIpLimiter, webhookKeyLimiter\);/);
  });
  test('120 a minute per webhook address: the 121st to one workspace is refused, another workspace still gets through', async () => {
    const srv = await serve();
    try {
      for (let i = 0; i < 120; i++) assert.equal(await srv.post('busyworkspacekey'), 200, `delivery ${i + 1}`);
      assert.equal(await srv.post('busyworkspacekey'), 429, 'the busy one is limited');
      assert.equal(await srv.post('otherworkspacekey'), 200, 'another workspace\'s leads are not blocked by it');
    } finally { await srv.close(); }
  });
});
