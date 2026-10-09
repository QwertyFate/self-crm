// UNIT tests for utils/engine-controls.js — the platform admin's two switches:
// defaults, merging over a stored row, the 10-second cache, validation and the
// write-through, and fail-open on a database error.
const { test, describe, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, ROOT } = require('../helpers/load-route');

const state = { row: null, fail: false };
let pool, controls;
before(() => {
  pool = createFakePool([
    { match: /^SELECT value FROM platform_settings WHERE key=\$1/, reply: () => { if (state.fail) throw new Error('db gone'); return { rows: state.row ? [{ value: state.row }] : [] }; } },
    { match: /^INSERT INTO platform_settings/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  inject('db.js', { pool });
  delete require.cache[path.join(ROOT, 'utils', 'engine-controls.js')];
  controls = require(path.join(ROOT, 'utils', 'engine-controls.js'));
});
const realNow = Date.now;
beforeEach(() => { pool.reset(); state.row = null; state.fail = false; controls.resetCache(); });
afterEach(() => { Date.now = realNow; });

describe('readControls', () => {
  test('no row → both switches on; the key is engine_controls', async () => {
    assert.deepEqual(await controls.readControls(), { api_enabled: true, webhooks_enabled: true });
    assert.deepEqual(pool.find(/platform_settings/).params, ['engine_controls']);
    assert.equal(controls.KEY, 'engine_controls');
  });
  test('a stored row merges over the defaults; a malformed value falls back to the defaults', async () => {
    state.row = { api_enabled: false };
    assert.deepEqual(await controls.readControls(), { api_enabled: false, webhooks_enabled: true });
    controls.resetCache(); state.row = 'garbage';
    assert.deepEqual(await controls.readControls(), { api_enabled: true, webhooks_enabled: true });
  });
  test('cached for CACHE_MS: the second read runs no query; fresh:true and an expired cache do', async () => {
    await controls.readControls(); await controls.readControls();
    assert.equal(pool.filter(/platform_settings/).length, 1);
    await controls.readControls({ fresh: true });
    assert.equal(pool.filter(/platform_settings/).length, 2);
    const t0 = realNow(); Date.now = () => t0 + controls.CACHE_MS + 1;
    await controls.readControls();
    assert.equal(pool.filter(/platform_settings/).length, 3);
    assert.equal(controls.CACHE_MS, 10_000);
  });
  test('a failing read never throws: defaults are answered and the failure is logged', async () => {
    state.fail = true;
    const errors = []; const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
    try { assert.deepEqual(await controls.readControls(), { api_enabled: true, webhooks_enabled: true }); }
    finally { console.error = orig; }
    assert.ok(errors.some(e => /engine controls read failed: db gone/.test(e)));
  });
});

describe('writeControls / validatePatch', () => {
  test('rejects a non-object, an empty patch, an unknown switch and a non-boolean — without writing', async () => {
    for (const bad of [null, 'x', [], {}, { foo: true }, { api_enabled: 'yes' }, { api_enabled: true, webhooks_enabled: 1 }]) {
      await assert.rejects(controls.writeControls(bad), e => e.status === 400 && /must be|Unknown|No switch/.test(e.message), JSON.stringify(bad));
    }
    assert.equal(pool.some(/INSERT/), false);
    assert.equal(controls.validatePatch({ api_enabled: false }), null);
    assert.equal(controls.validatePatch({ zzz: true }), 'Unknown switch: zzz');
  });
  test('merges over the stored row, writes with ON CONFLICT, and refreshes the cache at once', async () => {
    state.row = { api_enabled: true, webhooks_enabled: true };
    const next = await controls.writeControls({ webhooks_enabled: false });
    assert.deepEqual(next, { api_enabled: true, webhooks_enabled: false });
    const ins = pool.find(/^INSERT INTO platform_settings/);
    assert.match(ins.sql, /ON CONFLICT \(key\) DO UPDATE SET value=\$2, updated_at=NOW\(\)/);
    assert.deepEqual(ins.params, ['engine_controls', JSON.stringify({ api_enabled: true, webhooks_enabled: false })]);
    pool.reset();
    assert.deepEqual(await controls.readControls(), { api_enabled: true, webhooks_enabled: false });
    assert.equal(pool.some(/platform_settings/), false, 'served from the refreshed cache');
  });
});
