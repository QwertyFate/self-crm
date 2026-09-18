// Static checks on server.js wiring for the Onboarding Engine. Reads the file;
// does not start the server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const idx = re => { const m = re.exec(src); return m ? m.index : -1; };

test('the engine API limiter is 300 requests per minute with the German error shape', () => {
  const m = /const engineApiLimiter = rateLimit\(\{([\s\S]*?)\}\);/.exec(src);
  assert.ok(m, 'engineApiLimiter defined');
  assert.match(m[1], /windowMs: 60 \* 1000, max: 300/);
  assert.match(m[1], /fehler: \{ code: 'zu_viele_anfragen'/);
});

test('the limiter is applied to /api/kunden before the engine router is mounted, and the router is mounted once', () => {
  const lim = idx(/app\.use\('\/api\/kunden',\s+engineApiLimiter\)/);
  const mount = idx(/app\.use\('\/api\/kunden',\s+require\('\.\/routes\/engine-api'\)\)/);
  assert.ok(lim > 0 && mount > 0 && lim < mount, `limiter at ${lim}, mount at ${mount}`);
  assert.equal((src.match(/require\('\.\/routes\/engine-api'\)/g) || []).length, 1);
});

test('the webhook worker starts inside the initDb().then chain, after listen', () => {
  const chain = /initDb\(\)[\s\S]*?\.catch\(/.exec(src)[0];
  assert.match(chain, /httpServer\.listen\(/);
  assert.match(chain, /startEngineWebhookWorker\(\)/);
  assert.ok(chain.indexOf('httpServer.listen(') < chain.indexOf('startEngineWebhookWorker()'));
});
