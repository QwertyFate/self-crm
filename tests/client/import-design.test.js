// CLIENT (static) test: opening the CSV import modal from the Contacts page
// must load the pipeline list before populating the "create a deal" pipeline
// select — `pipelines` is only otherwise loaded by the Deals page, Settings'
// pipeline CRUD, or a couple of lazy-loaders elsewhere, so a user who opens
// Import from Contacts without ever visiting those first used to see
// "— No pipelines available —" even though pipelines exist.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const auth   = read('public/js/auth.js');
const imp    = read('public/js/admin-import.js');
const html   = read('public/index.html');
const count = (src, needle) => src.split(needle).length - 1;

describe('files parse', () => {
  test('files parse', () => {
    for (const f of ['public/js/auth.js', 'public/js/admin-import.js']) execFileSync('node', ['--check', path.join(ROOT, f)]);
  });
});

describe('opening the import modal ensures pipelines are loaded first', () => {
  test('auth.js defines ensurePipelines, matching the ensureStages/ensureFields/ensureMembers lazy-load pattern', () => {
    assert.match(auth, /async function ensurePipelines\(\) \{ if \(!pipelines\.length\) pipelines = await api\.get\('\/api\/pipelines'\); \}/);
  });
  test('openImportModal awaits ensurePipelines before loadImportPipelines runs', () => {
    const fn = sliceFn(imp, 'openImportModal', 'admin-import.js');
    assert.match(fn, /await Promise\.all\(\[ensureMembers\(\), ensurePipelines\(\)\]\);/);
    assert.match(fn, /loadImportPipelines\(\);/);
  });
});

describe('runImport shows a real error instead of "Successfully imported undefined contacts."', () => {
  test('index.html has an error-text element in the map step to show it in', () => {
    assert.equal(count(html, 'id="import-run-error"'), 1);
    const start = html.indexOf('id="import-step-map"');
    const end   = html.indexOf('id="import-run-error"');
    assert.ok(start !== -1 && start < end, 'the error element lives inside the map step');
  });
  test('runImport checks res.error and bails out before building the success message', () => {
    const fn = sliceFn(imp, 'runImport', 'admin-import.js');
    const errIdx = fn.search(/if \(res\.error\)/);
    const msgIdx = fn.search(/imp_done_(one|many)/);   // the translated "Successfully imported {n} contact(s)." message
    assert.ok(errIdx !== -1, 'checks res.error');
    assert.ok(errIdx < msgIdx, 'the check happens before the success message is built');
    assert.match(fn, /if \(res\.error\) \{[\s\S]*?return;/);
  });
});
