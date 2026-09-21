// UNIT (static) tests for server.js wiring of the Onboarding Engine. Reads the
// file; never starts the server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const find = (re, what) => { const m = re.exec(src); assert.ok(m, `${what} not found in server.js`); return m; };

test('the engine API limiter is 300 requests per minute with the German error shape', () => {
  const [, body] = find(/const engineApiLimiter = rateLimit\(\{([\s\S]*?)\}\);/, 'engineApiLimiter');
  assert.match(body, /windowMs:\s*60 \* 1000,\s*max:\s*300/);
  assert.match(body, /fehler:\s*\{\s*code:\s*'zu_viele_anfragen'/);
});

test('the limiter is applied to /api/kunden before the engine router is mounted, and the router is mounted once', () => {
  const lim   = find(/app\.use\('\/api\/kunden',\s*engineApiLimiter\)/, 'limiter mount').index;
  const mount = find(/app\.use\('\/api\/kunden',\s*require\('\.\/routes\/engine-api'\)\)/, 'router mount').index;
  assert.ok(lim < mount, `limiter (${lim}) must precede the mount (${mount})`);
  assert.equal((src.match(/require\('\.\/routes\/engine-api'\)/g) || []).length, 1);
});

test('the webhook worker starts inside the initDb().then chain, after listen', () => {
  const [chain] = find(/initDb\(\)[\s\S]*?\.catch\(/, 'initDb().then chain');
  assert.match(chain, /httpServer\.listen\(/);
  assert.match(chain, /startEngineWebhookWorker\(\)/);
  assert.ok(chain.indexOf('httpServer.listen(') < chain.indexOf('startEngineWebhookWorker()'), 'listen before worker');
});
