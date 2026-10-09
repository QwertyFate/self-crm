// CLIENT (static) tests: the admin console's fourth tab, "Engine API" — the
// Upgrads Engine integration walkthrough (webhooks out, REST in) with copyable
// requests on the console's own host. Pinned to the real API: the OpenAPI
// document's paths, the route's status values, the code's event names and error
// codes, and the published verifier snippet.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { read } = require('../helpers/client-fn');
const { ROOT, inject } = require('../helpers/load-route');

const html   = read('public/admin.html');
const panel  = html.slice(html.indexOf('<div id="tab-engine"'), html.indexOf('<!-- /#tab-engine -->'));
const inline = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));
const openapi = JSON.parse(read('docs/openapi.json'));
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('the tab', () => {
  test('a fourth tab button after API Tutorial, a hidden panel, and showAdminTab knows it (and fills the host spans)', () => {
    assert.match(html, /id="tabbtn-tutorial"[^>]*>API Tutorial<\/button>\s*<button class="admin-tab"\s+id="tabbtn-engine"\s+onclick="showAdminTab\('engine'\)">Engine API<\/button>/);
    assert.match(html, /<div id="tab-engine" class="hidden">/);
    assert.ok(panel.length > 6000, 'the panel has content');
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine'\]\)/);
    assert.match(inline, /if \(name === 'tutorial' \|\| name === 'engine'\) fillTutorialHost\(\);/);
    assert.match(html, /#tab-tutorial code, #tab-engine code \{/, 'inline code styling covers the new tab');
  });
  test('every host is a filled placeholder, so every request is copy-and-run', () => {
    assert.ok([...panel.matchAll(/<span class="tut-host">https:\/\/YOUR-HOST<\/span>/g)].length >= 8);
    assert.doesNotMatch(panel.replace(/<span class="tut-host">https:\/\/YOUR-HOST<\/span>/g, ''), /YOUR-HOST/);
  });
  test('the nine snippets, in walkthrough order, each with a copy button; every handler in the panel is defined', () => {
    const blocks = [...panel.matchAll(/<pre class="prov-curl" id="(eng-[\w-]+)">/g)].map(m => m[1]);
    assert.deepEqual(blocks, ['eng-get', 'eng-kunde', 'eng-status', 'eng-patch', 'eng-patch-response', 'eng-docs', 'eng-note', 'eng-event', 'eng-verify']);
    for (const id of blocks) assert.match(panel, new RegExp(`onclick="copyProvText\\(document\\.getElementById\\('${id}'\\)\\.textContent, this\\)"`), id);
    for (const m of panel.matchAll(/onclick="(\w+)\(/g)) assert.match(inline, new RegExp(`function\\s+${m[1]}\\s*\\(`), m[1]);
  });
});

describe('the content matches the API', () => {
  test('every path of the OpenAPI document is walked through (with example ids), and the document itself is named', () => {
    const expect = Object.keys(openapi.paths).map(p => p.replace('{kunde_id}', '42').replace('{dokument_id}', '9'));
    for (const p of expect) assert.ok(panel.includes(p), `path ${p}`);
    assert.match(panel, /GET \/api\/kunden\/openapi\.json/);
  });
  test('the seven onboarding statuses, in the briefing\'s order, each with its meaning', () => {
    inject('db.js', { pool: { query: async () => ({ rows: [] }) } }); delete require.cache[path.join(ROOT, 'routes', 'engine-api.js')];
    const { ONBOARDING_STATUSES } = require(path.join(ROOT, 'routes', 'engine-api.js'));
    const listed = [...panel.matchAll(/<tr><td><code>([a-z_]+)<\/code><\/td><td>[^<]+<\/td><\/tr>/g)].map(m => m[1]).filter(s => ONBOARDING_STATUSES.includes(s));
    assert.deepEqual(listed, ONBOARDING_STATUSES);
  });
  test('the five events, the envelope, the plain-hex raw-body signature and the retry schedule', () => {
    const engine = require(path.join(ROOT, 'utils', 'engine.js'));
    for (const e of [engine.EVENT_CONTRACT_SIGNED, engine.EVENT_CONTACT_CREATED, engine.EVENT_CONTACT_UPDATED, engine.EVENT_DOCUMENT_ADDED, engine.EVENT_TEST]) assert.match(panel, new RegExp(`<code>${e.replace('.', '\\.')}</code>`), e);
    for (const k of ['"event"', '"event_id"', '"zeitpunkt"', '"kunde_id"', '"daten"']) assert.ok(panel.includes(k), k);
    assert.match(panel, /X-Upgrads-Signature: [0-9a-f…]+\s+← lower-case hex HMAC-SHA256\(secret, raw body\); no prefix, no timestamp/);
    assert.match(panel, /identical on every retry/);
    assert.match(panel, /7 attempts — immediately, then \+1 min, \+5 min, \+30 min, \+2 h, \+6 h, \+16 h \(≈ 24\.6 h\)/);
    assert.deepEqual(engine.RETRY_DELAYS_SEC, [60, 300, 1800, 7200, 21600, 57600], 'the schedule the text describes');
  });
  test('the verifier snippet is the one published in ENGINE_INTEGRATION.md (HTML-decoded)', t => {
    const md = path.join(ROOT, 'ENGINE_INTEGRATION.md');
    if (!fs.existsSync(md)) return t.skip('ENGINE_INTEGRATION.md is gitignored and absent in this checkout');
    const fromDoc = fs.readFileSync(md, 'utf8').match(/```js\n((?:(?!```)[\s\S])*?function verify\(secret, req, rawBody\)[\s\S]*?)```/)[1].trim();
    const fromPanel = decode(panel.match(/id="eng-verify">([\s\S]*?)<\/pre>/)[1]).trim();
    assert.equal(fromPanel, fromDoc);
  });
  test('every error code of the OpenAPI Fehler enum is in the errors table; the rate limit and the two id facts are stated', () => {
    const codes = openapi.components.schemas.Fehler.properties.fehler.properties.code.enum;
    const errors = panel.slice(panel.indexOf('Errors, limits, ids'));
    for (const c of codes) assert.match(errors, new RegExp(`<code>${c}</code>`), c);
    for (const st of ['400', '401', '404', '409', '422', '429', '500']) assert.match(errors, new RegExp(`<td><code>${st}</code></td>`), st);
    assert.match(panel, /300 requests per minute per IP/);
    assert.match(panel, /Ids are integers/); assert.match(panel, /ISO 8601 in UTC/);
  });
  test('the facts people get wrong are stated: keys are per workspace and not created here, shown once; fill-empty-only; private bucket; BASE_URL; no mailbox; Akte in Drive', () => {
    assert.match(panel, /Keys are per workspace and are not created here/);
    assert.match(panel, /shown <strong>once<\/strong>/);
    assert.match(panel, /<strong>never overwrites<\/strong>/);
    assert.match(panel, /<strong>private<\/strong> Supabase bucket <code>contact-documents<\/code>/);
    assert.match(panel, /<code>BASE_URL<\/code>/);
    assert.match(panel, /the CRM has no mailbox/);
    assert.match(panel, /lives in Google Drive/);
    const kunde = require(path.join(ROOT, 'utils', 'kunde.js'));
    for (const typ of kunde.DOCUMENT_TYPES) assert.match(panel, new RegExp(`<code>${typ}</code>`), typ);
    for (const typ of Object.values(kunde.NOTE_TYPES)) assert.match(panel, new RegExp(`<code>${typ}</code>`), typ);
  });
});
