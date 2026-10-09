// UNIT tests for the pure parts of utils/engine.js: the HMAC recipe the Engine
// team verifies against, the payload shape, and the trigger-stage check.
// db.js is replaced by an empty fake so requiring the module never touches Postgres.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path   = require('path');
const { inject, ROOT } = require('../helpers/load-route');

inject('db.js', { pool: { query: async () => ({ rows: [] }) } });
delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
const engine = require(path.join(ROOT, 'utils', 'engine.js'));

const SECRET = 'a'.repeat(64);

describe('sign / verify', () => {
  test('sign is sha256= + hex HMAC over "<timestamp>.<rawBody>"', () => {
    const body = '{"event":"vertrag.unterschrieben","vertrag_id":17}';
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`1700000000.${body}`).digest('hex');
    assert.equal(engine.sign(SECRET, 1700000000, body), expected);
    assert.equal(engine.sign(SECRET, '1700000000', body), expected, 'string and numeric timestamps sign the same');
  });
  test('verify accepts a fresh, correct signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = '{"a":1}';
    const r = engine.verify(SECRET, ts, body, engine.sign(SECRET, ts, body));
    assert.deepEqual(r, { ok: true });
  });
  test('verify rejects a tampered body, a wrong secret, a wrong-length header and an old timestamp', () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = '{"a":1}';
    const sig = engine.sign(SECRET, ts, body);
    assert.equal(engine.verify(SECRET, ts, '{"a":2}', sig).ok, false, 'tampered body');
    assert.equal(engine.verify('b'.repeat(64), ts, body, sig).ok, false, 'wrong secret');
    assert.equal(engine.verify(SECRET, ts, body, 'sha256=abc').ok, false, 'short header does not throw');
    assert.equal(engine.verify(SECRET, ts, body, '').ok, false, 'empty header');
    assert.equal(engine.verify(SECRET, ts, body, null).ok, false, 'missing header');
    const old = ts - 600;
    const r = engine.verify(SECRET, old, body, engine.sign(SECRET, old, body));
    assert.equal(r.ok, false, 'timestamp older than the tolerance');
    assert.match(r.reason, /timestamp/);
    const ok = engine.verify(SECRET, old, body, engine.sign(SECRET, old, body), { now: () => old * 1000 + 1000 });
    assert.equal(ok.ok, true, 'same signature is fine when "now" is close to the timestamp');
  });
  test('verify rejects a non-numeric timestamp', () => {
    assert.equal(engine.verify(SECRET, 'yesterday', '{}', 'sha256=x').ok, false);
  });
});

describe('buildContractSignedPayload', () => {
  test('exact keys, in the documented order, and JSON.stringify gives the documented string', () => {
    const p = engine.buildContractSignedPayload({
      eventId: '7d0f0000-0000-4000-8000-000000000000', timestamp: '2026-09-28T09:15:00.000Z',
      contactId: 42, dealId: 17, title: 'Solaranlage 10 kWp', stageName: 'Contract Signed',
    });
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'timestamp', 'kunde_id', 'vertrag_id', 'produkt', 'stage']);
    assert.equal(JSON.stringify(p),
      '{"event":"vertrag.unterschrieben","event_id":"7d0f0000-0000-4000-8000-000000000000","timestamp":"2026-09-28T09:15:00.000Z","kunde_id":42,"vertrag_id":17,"produkt":"Solaranlage 10 kWp","stage":"Contract Signed"}');
  });
  test('a deal without a contact sends kunde_id null, never undefined', () => {
    const p = engine.buildContractSignedPayload({ eventId: 'e', timestamp: 't', contactId: null, dealId: 1, title: 'X', stageName: 'S' });
    assert.equal(p.kunde_id, null);
    assert.match(JSON.stringify(p), /"kunde_id":null/);
  });
});

describe('isTriggerStage', () => {
  test('numeric compare: "5" and 5 both match [5]; nothing matches an empty list', () => {
    const s = { trigger_stage_ids: [5, '9'] };
    assert.equal(engine.isTriggerStage(s, 5), true);
    assert.equal(engine.isTriggerStage(s, '5'), true);
    assert.equal(engine.isTriggerStage(s, 9), true);
    assert.equal(engine.isTriggerStage(s, 3), false);
    assert.equal(engine.isTriggerStage({ trigger_stage_ids: [] }, 5), false);
  });
  test('null, undefined, 0 and NaN never trigger; a missing settings row never triggers', () => {
    const s = { trigger_stage_ids: [5] };
    for (const v of [null, undefined, 0, '0', 'abc', NaN]) assert.equal(engine.isTriggerStage(s, v), false, String(v));
    assert.equal(engine.isTriggerStage(null, 5), false);
    assert.equal(engine.isTriggerStage({}, 5), false);
  });
});
