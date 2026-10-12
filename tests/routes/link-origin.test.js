// ROUTE tests — the origin of the URLs the admin console hands a provisioned owner (login_url,
// webhook_url, base_url). Without APP_URL / BASE_URL (the no-.env local build) they used to point
// at http://localhost:<port>, which only works on the server machine itself; they now take the
// address the request came in on, the configured variables still win, and localhost is only the
// fallback with no Host header. (Password-reset links no longer exist — see
// tests/routes/forgot-password.test.js: the reset is a page, not a link.)
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute } = require('../helpers/load-route');

const saved = {};
const env = vars => { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
before(() => { for (const k of ['BASE_URL', 'APP_URL', 'APP_BASE_URL', 'PORT']) saved[k] = process.env[k]; });
after(() => env(saved));
beforeEach(() => env({ BASE_URL: undefined, APP_URL: undefined, APP_BASE_URL: undefined, PORT: undefined }));

describe('routes/admin-provision.js baseUrl(req) — login_url, webhook_url, base_url', () => {
  const { baseUrl } = loadRoute('admin-provision.js', { pool: { query: async () => ({ rows: [] }) } });
  const req = (host, protocol = 'http') => ({ get: h => (h.toLowerCase() === 'host' ? host : undefined), protocol });
  test('the request origin when nothing is configured; localhost only without a Host header', () => {
    assert.equal(baseUrl(req('office-mac.local:4001')), 'http://office-mac.local:4001');
    assert.equal(baseUrl(req('crm.example.test', 'https')), 'https://crm.example.test');
    assert.equal(baseUrl(req(undefined)), 'http://localhost:4001');
    assert.equal(baseUrl(), 'http://localhost:4001');
    env({ PORT: '5555' }); assert.equal(baseUrl(), 'http://localhost:5555');
  });
  test('APP_URL, then BASE_URL, win over the request; trailing slashes trimmed', () => {
    env({ BASE_URL: 'https://base.example.test/' }); assert.equal(baseUrl(req('x:1')), 'https://base.example.test');
    env({ APP_URL: 'https://app.example.test//' }); assert.equal(baseUrl(req('x:1')), 'https://app.example.test');
  });
});

describe('utils/base-url.js — the one place the public address is decided', () => {
  const path = require('path');
  const { ROOT: R } = require('../helpers/load-route');
  const publicUrl = require(path.join(R, 'utils', 'base-url.js'));
  const req = (host, protocol = 'http') => ({ get: h => (h.toLowerCase() === 'host' ? host : undefined), protocol });
  test('configured(): BASE_URL from .env, trimmed, or null — APP_BASE_URL and APP_URL do not count here', () => {
    assert.equal(publicUrl.configured(), null);
    env({ BASE_URL: ' https://crm.upgrads.de/ ' }); assert.equal(publicUrl.configured(), 'https://crm.upgrads.de');
    env({ BASE_URL: undefined, APP_BASE_URL: 'https://engine.example.test', APP_URL: 'https://app.example.test' }); assert.equal(publicUrl.configured(), null);
  });
  test('appUrl(req): APP_URL, then BASE_URL, then the request; null with nothing known', () => {
    assert.equal(publicUrl.appUrl(req('office-mac.local:4001')), 'http://office-mac.local:4001');
    assert.equal(publicUrl.appUrl(req(undefined)), null); assert.equal(publicUrl.appUrl(), null);
    env({ BASE_URL: 'https://crm.upgrads.de/' }); assert.equal(publicUrl.appUrl(req('x:1')), 'https://crm.upgrads.de');
    env({ APP_URL: 'https://app.example.test' }); assert.equal(publicUrl.appUrl(req('x:1')), 'https://app.example.test');
  });
  test('baseUrl(req) for the Engine: APP_BASE_URL, then BASE_URL, then the request', () => {
    assert.equal(publicUrl(req('crm.local:4001')), 'http://crm.local:4001');
    env({ BASE_URL: 'https://crm.upgrads.de' }); assert.equal(publicUrl(req('x:1')), 'https://crm.upgrads.de');
    env({ APP_BASE_URL: 'https://engine-facing.example.test/' }); assert.equal(publicUrl(req('x:1')), 'https://engine-facing.example.test');
  });
  test('the three consumers use it: the boot message, the Integrations page, provisioning', () => {
    const fs = require('fs'); const read = rel => fs.readFileSync(path.join(R, rel), 'utf8');
    const server = read('server.js');
    assert.match(server, /const publicUrl\s*=\s*require\('\.\/utils\/base-url'\)/);
    assert.match(server, /function bootMessage\(port\) \{\s*const configured = publicUrl\.configured\(\);\s*return configured \? `CRM running at \$\{configured\} \(listening on port \$\{port\}\)` : `CRM running at http:\/\/localhost:\$\{port\}`;/);
    assert.match(server, /console\.log\(bootMessage\(httpServer\.address\(\)\.port\)\)/);
    assert.match(read('routes/integrations.js'), /base_url: baseUrl\.appUrl\(req\) \}\);/);
    assert.match(read('routes/admin-provision.js'), /return publicUrl\.appUrl\(req\) \|\| `http:\/\/localhost:\$\{process\.env\.PORT \|\| 4001\}`;/);
    assert.doesNotMatch(read('routes/integrations.js'), /process\.env\.APP_URL/, 'no second copy of the precedence');
  });
});
