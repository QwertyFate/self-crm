// UNIT tests for middleware/engine-gate.js: the 503 while the platform admin has
// the API off (fail-open on a controls error), and the body-error shaping that
// keeps a malformed or oversized Engine request from becoming a crash or a
// browser-style { error }.
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { inject, ROOT } = require('../helpers/load-route');

const state = { controls: { api_enabled: true, webhooks_enabled: true }, throwOnRead: false };
let gate;
before(() => {
  inject('utils/engine-controls.js', { readControls: async () => { if (state.throwOnRead) throw new Error('db gone'); return state.controls; } });
  delete require.cache[path.join(ROOT, 'middleware', 'engine-gate.js')];
  gate = require(path.join(ROOT, 'middleware', 'engine-gate.js'));
});
beforeEach(() => { state.controls = { api_enabled: true, webhooks_enabled: true }; state.throwOnRead = false; });

function fakeRes() { return { code: 200, body: undefined, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, set(k, v) { this.headers[k.toLowerCase()] = v; return this; } }; }

describe('engineGate', () => {
  test('API on → next()', async () => {
    let called = false; const res = fakeRes();
    await gate({}, res, () => { called = true; });
    assert.equal(called, true); assert.equal(res.body, undefined);
  });
  test('API off → 503 api_deaktiviert with Retry-After, handler never runs', async () => {
    state.controls = { api_enabled: false, webhooks_enabled: true };
    let called = false; const res = fakeRes();
    await gate({}, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.code, 503);
    assert.deepEqual(res.body, gate.DISABLED);
    assert.equal(res.body.fehler.code, 'api_deaktiviert');
    assert.equal(res.headers['retry-after'], '600');
  });
  test('webhooks off alone does not gate the API', async () => {
    state.controls = { api_enabled: true, webhooks_enabled: false };
    let called = false; await gate({}, fakeRes(), () => { called = true; });
    assert.equal(called, true);
  });
  test('a failing controls read lets the request through (the gate never takes the API down by itself) and logs', async () => {
    state.throwOnRead = true;
    const errors = []; const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
    let called = false;
    try { await gate({}, fakeRes(), () => { called = true; }); } finally { console.error = orig; }
    assert.equal(called, true);
    assert.ok(errors.some(e => /engine gate: db gone/.test(e)));
  });
});

describe('engineBodyErrors', () => {
  const run = err => { const res = fakeRes(); let nexted = false; gate.engineBodyErrors(err, {}, res, () => { nexted = true; }); return { res, nexted }; };
  test('malformed JSON → 400 ungueltige_daten', () => {
    const { res } = run(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 }));
    assert.equal(res.code, 400); assert.equal(res.body.fehler.code, 'ungueltige_daten');
  });
  test('body over the limit → 413 anfrage_zu_gross', () => {
    const { res } = run(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }));
    assert.equal(res.code, 413); assert.equal(res.body.fehler.code, 'anfrage_zu_gross');
  });
  test('another exposed 4xx keeps its status with the fehler shape; anything else is a 500 serverfehler without internals (logged)', () => {
    const a = run(Object.assign(new Error('Unsupported charset "X"'), { status: 415, expose: true }));
    assert.equal(a.res.code, 415); assert.equal(a.res.body.fehler.code, 'ungueltige_daten'); assert.match(a.res.body.fehler.nachricht, /charset/);
    const errors = []; const orig = console.error; console.error = (...a) => errors.push(String(a[1] && a[1].message || a[0]));
    let b; try { b = run(new Error('secret internal path /var/x')); } finally { console.error = orig; }
    assert.equal(b.res.code, 500); assert.equal(b.res.body.fehler.code, 'serverfehler');
    assert.doesNotMatch(JSON.stringify(b.res.body), /\/var\/x/);
    assert.ok(errors.length >= 1);
  });
  test('no error → next()', () => { assert.equal(run(null).nexted, true); });
});
