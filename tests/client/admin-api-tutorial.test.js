// CLIENT (static) tests: the admin console's third tab, "API Tutorial" — the
// provisioning guide (ADMIN_PROVISIONING_GUIDE.md) inside the console, with
// copyable requests whose host is the console's own origin.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');

const html = read('public/admin.html');
const panel = html.slice(html.indexOf('<div id="tab-tutorial"'), html.indexOf('<!-- /#tab-tutorial -->'));
const inline = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));

describe('the tab', () => {
  test('a third tab button, after Provisioning, hidden panel, and showAdminTab knows it', () => {
    assert.match(html, /id="tabbtn-provisioning"[^>]*>Provisioning<\/button>\s*<button class="admin-tab"\s+id="tabbtn-tutorial"\s+onclick="showAdminTab\('tutorial'\)">API Tutorial<\/button>/);
    assert.match(html, /<div id="tab-tutorial" class="hidden">/);
    assert.ok(panel.length > 2000, 'the panel has content');
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine', 'monitor'\]\)/);   // the Engine API (Part 19) and Engine Monitor (Part 20) tabs join the list
    assert.match(inline, /if \(name === 'tutorial' \|\| name === 'engine'\) fillTutorialHost\(\);/);
  });
  test('the host placeholders are filled from the console\'s own origin, so every snippet is copy-and-run', () => {
    assert.match(inline, /function fillTutorialHost\(\)[\s\S]*?querySelectorAll\('\.tut-host'\)[\s\S]*?location\.origin/);
    assert.ok([...panel.matchAll(/<span class="tut-host">https:\/\/YOUR-HOST<\/span>/g)].length >= 4);
    assert.doesNotMatch(panel.replace(/<span class="tut-host">https:\/\/YOUR-HOST<\/span>/g, ''), /YOUR-HOST/, 'no bare placeholder outside the spans');
  });
});

describe('the content matches the API', () => {
  test('the walkthrough: log in, provision (minimal and full), what comes back, the list endpoint', () => {
    for (const re of [/POST \/api\/admin\/login/, /POST \/api\/admin\/provision/, /GET \/api\/admin\/provision\/list/,
      /"workspace_name": "Acme Corp"/, /"owner_email": "maria@acmecorp\.com"/, /"owner_name"/, /"contact_fields"/, /"deal_fields"/, /"create_deal"/, /"webhook_active"/,
      /"password": "Z5ri-jBxY-cQ3V-QJgV"/, /existing_account/, /login_url/, /webhook_url/, /field_map/, /sample_curl/]) assert.match(panel, re);
  });
  test('step 1 is the secret in the payload — one request — with the cookie login kept as the alternative', () => {
    assert.match(panel, /<h3 class="tut-h">1 · Authenticate: the admin secret goes in the payload<\/h3>/);
    assert.match(panel, /"admin_secret": "YOUR_ADMIN_SECRET",\n    "workspace_name": "Acme Corp"/, 'the minimal request carries the secret');
    assert.match(panel, /"admin_secret":   "YOUR_ADMIN_SECRET",      \/\/ required \(unless you sent the session cookie\)/, 'and so does the full one');
    assert.match(panel, /curl -H 'X-Admin-Secret: YOUR_ADMIN_SECRET' <span class="tut-host">https:\/\/YOUR-HOST<\/span>\/api\/admin\/provision\/list/, 'GETs use the header');
    assert.doesNotMatch(panel.match(/id="tut-minimal">([\s\S]*?)<\/pre>/)[1], /cookies\.txt/, 'the minimal request needs no cookie');
    assert.match(panel, /admin\/login/, 'the cookie route is still documented');
    assert.match(panel, /<td><code>401<\/code><\/td><td><code>admin_secret<\/code>/);
  });
  test('the facts people get wrong are stated: password shown once, deal fields not fillable by the webhook, create-only, the three error codes', () => {
    assert.match(panel, /Shown once/i); assert.match(panel, /not fillable|does <strong>not<\/strong> fill|cannot fill/i);
    assert.match(panel, /only create|can only create|existing workspace/i);
    for (const code of ['400', '401', '503']) assert.match(panel, new RegExp(`<td><code>${code}</code></td>`));
    assert.match(panel, /120 requests per minute/);
  });
  test('the field table lists exactly the route\'s types', () => {
    assert.match(panel, /<code>text<\/code>, <code>email<\/code>, <code>phone<\/code>, <code>number<\/code>, <code>dropdown<\/code>, <code>date<\/code>, <code>url<\/code>/);
    const types = read('middleware/field-crud.js').match(/VALID_TYPES\s*=\s*\[([^\]]+)\]/);
    assert.ok(types, 'VALID_TYPES in field-crud');
    for (const t of types[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''))) assert.match(panel, new RegExp(`<code>${t}</code>`), t);
  });
  test('every code block has a copy button wired to copyProvText, and every handler in the panel is defined', () => {
    const blocks = [...panel.matchAll(/<pre class="prov-curl" id="(tut-[\w-]+)">/g)].map(m => m[1]);
    assert.deepEqual(blocks, ['tut-login', 'tut-minimal', 'tut-full', 'tut-response', 'tut-list'], 'the five snippets, in walkthrough order');
    for (const id of blocks) assert.match(panel, new RegExp(`onclick="copyProvText\\(document\\.getElementById\\('${id}'\\)\\.textContent, this\\)"`), id);
    for (const m of panel.matchAll(/onclick="(\w+)\(/g)) assert.match(inline, new RegExp(`function\\s+${m[1]}\\s*\\(`), m[1]);
  });
});
