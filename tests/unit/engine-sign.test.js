// UNIT tests for the pure parts of utils/engine.js: the HMAC recipe the Engine
// team verifies against (briefing §5.1: HMAC-SHA256 over the raw body, header
// X-Upgrads-Signature), the envelope/payload shape, the date and contract-detail
// helpers, and the trigger-stage check. db.js is replaced by an empty fake so
// requiring the module never touches Postgres.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { inject, ROOT } = require('../helpers/load-route');

inject('db.js', { pool: { query: async () => ({ rows: [] }) } });
delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
const engine = require(path.join(ROOT, 'utils', 'engine.js'));

const SECRET = 'a'.repeat(64);
const BODY   = '{"event":"vertrag.unterschrieben","event_id":"e1","zeitpunkt":"2026-09-01T14:23:11.000Z","kunde_id":42,"daten":{"vertrag_id":17}}';

describe('sign / verify (briefing §5.1)', () => {
  test('sign is the lower-case hex HMAC-SHA256 of the raw body alone — no timestamp, no prefix', () => {
    const expected = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    assert.equal(engine.sign(SECRET, BODY), expected);
    assert.match(engine.sign(SECRET, BODY), /^[0-9a-f]{64}$/);
    assert.equal(engine.sign(SECRET, Buffer.from(BODY, 'utf8')), expected, 'a Buffer body signs like the string');
    assert.equal(engine.sign.length, 2, 'two parameters: secret and body');
  });
  test('verify accepts the correct signature, also upper-case hex and surrounding whitespace', () => {
    const sig = engine.sign(SECRET, BODY);
    assert.deepEqual(engine.verify(SECRET, BODY, sig), { ok: true });
    assert.deepEqual(engine.verify(SECRET, BODY, sig.toUpperCase()), { ok: true });
    assert.deepEqual(engine.verify(SECRET, BODY, ` ${sig}\n`), { ok: true });
  });
  test('verify rejects a tampered body, a wrong secret, a prefixed value, a short / empty / missing header', () => {
    const sig = engine.sign(SECRET, BODY);
    assert.equal(engine.verify(SECRET, BODY.replace('42', '43'), sig).ok, false, 'tampered body');
    assert.equal(engine.verify('b'.repeat(64), BODY, sig).ok, false, 'wrong secret');
    assert.equal(engine.verify(SECRET, BODY, 'sha256=' + sig).ok, false, 'the old sha256= prefix is not accepted');
    assert.equal(engine.verify(SECRET, BODY, 'abc').ok, false, 'short header does not throw');
    assert.equal(engine.verify(SECRET, BODY, '').ok, false, 'empty header');
    assert.equal(engine.verify(SECRET, BODY, null).ok, false, 'missing header');
    assert.equal(engine.verify(SECRET, BODY, undefined).ok, false, 'undefined header');
  });
  test('the verifier snippet published in ENGINE_INTEGRATION.md §3 accepts what sign() produces and rejects tampering', t => {
    const md = path.join(ROOT, 'ENGINE_INTEGRATION.md');
    if (!fs.existsSync(md)) return t.skip('ENGINE_INTEGRATION.md is gitignored and absent in this checkout');
    const src = fs.readFileSync(md, 'utf8');
    // the js fence that contains the verifier (no other fence may open in between)
    const m = src.match(/```js\n((?:(?!```)[\s\S])*?function verify\(secret, req, rawBody\)[\s\S]*?)```/);
    assert.ok(m, 'the snippet exists in the contract document');
    const verifyFromDoc = new Function('require', `${m[1]}\nreturn verify;`)(require);
    const req = { headers: { 'x-upgrads-signature': engine.sign(SECRET, BODY) } };
    assert.equal(verifyFromDoc(SECRET, req, BODY), true);
    assert.equal(verifyFromDoc(SECRET, req, Buffer.from(BODY)), true, 'the Engine may pass the raw Buffer');
    assert.equal(verifyFromDoc(SECRET, req, BODY + ' '), false, 'one extra byte breaks it');
    assert.equal(verifyFromDoc('x'.repeat(64), req, BODY), false, 'wrong secret');
    assert.equal(verifyFromDoc(SECRET, { headers: {} }, BODY), false, 'missing header');
    assert.doesNotMatch(m[1], /x-upgrads-timestamp|Date\.now/, 'the published recipe has no timestamp component');
  });
});

describe('buildContractSignedPayload (briefing §5.1 example)', () => {
  test('exact envelope and daten keys, in the documented order; JSON.stringify gives the documented string', () => {
    const p = engine.buildContractSignedPayload({
      eventId: '7d0f0000-0000-4000-8000-000000000000', zeitpunkt: '2026-09-01T14:23:11.000Z',
      contactId: 42, dealId: 17, title: 'Maklersystem Landingpage', unterschriebenAm: '2026-09-01', laufzeitMonate: 12, dokumentUrl: null,
    });
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.deepEqual(Object.keys(p.daten), ['vertrag_id', 'produkt', 'unterschrieben_am', 'laufzeit_monate', 'dokument_url']);
    assert.equal(JSON.stringify(p),
      '{"event":"vertrag.unterschrieben","event_id":"7d0f0000-0000-4000-8000-000000000000","zeitpunkt":"2026-09-01T14:23:11.000Z","kunde_id":42,'
      + '"daten":{"vertrag_id":17,"produkt":"Maklersystem Landingpage","unterschrieben_am":"2026-09-01","laufzeit_monate":12,"dokument_url":null}}');
    assert.equal('timestamp' in p, false); assert.equal('stage' in p, false); assert.equal('vertrag_id' in p, false, 'contract fields live under daten');
  });
  test('missing optionals are null, never undefined (they must survive JSON.stringify)', () => {
    const p = engine.buildContractSignedPayload({ eventId: 'e', zeitpunkt: 't', contactId: null, dealId: 1, title: undefined });
    assert.equal(p.kunde_id, null);
    assert.deepEqual(p.daten, { vertrag_id: 1, produkt: '', unterschrieben_am: null, laufzeit_monate: null, dokument_url: null });
    assert.match(JSON.stringify(p), /"kunde_id":null/);
    assert.doesNotMatch(JSON.stringify(p), /undefined/);
  });
  test('the test event uses the same envelope', () => {
    const p = engine.buildTestPayload({ eventId: 'e', zeitpunkt: 't', workspaceId: 7 });
    assert.deepEqual(p, { event: 'test.ping', event_id: 'e', zeitpunkt: 't', kunde_id: null, daten: { workspace_id: 7 } });
  });
});

describe('dateInZone', () => {
  const late = '2026-10-09T23:30:00.000Z';   // 01:30 next day in Berlin, 09:30 same day in Honolulu
  test('formats the calendar date of the instant in the given zone as YYYY-MM-DD', () => {
    assert.equal(engine.dateInZone(late, 'Europe/Berlin'), '2026-10-10');
    assert.equal(engine.dateInZone(late, 'UTC'), '2026-10-09');
    assert.equal(engine.dateInZone(late, 'Pacific/Honolulu'), '2026-10-09');
    assert.equal(engine.dateInZone(new Date(late), 'Asia/Tokyo'), '2026-10-10');
  });
  test('an unknown or missing zone falls back to Europe/Berlin (the app default)', () => {
    assert.equal(engine.dateInZone(late, 'Mars/Olympus'), '2026-10-10');
    assert.equal(engine.dateInZone(late, undefined), '2026-10-10');
    assert.equal(engine.dateInZone(late, null), '2026-10-10');
    assert.equal(engine.DEFAULT_TZ, 'Europe/Berlin');
  });
});

describe('contractDetails — forwarded only when a deal field holds a usable value (briefing §4: no guessing)', () => {
  test('ISO date and positive integer months are forwarded; numbers as strings are accepted', () => {
    assert.deepEqual(engine.contractDetails({ unterschrieben_am: '2026-09-01', laufzeit_monate: 12 }), { unterschrieben_am: '2026-09-01', laufzeit_monate: 12 });
    assert.deepEqual(engine.contractDetails({ unterschrieben_am: ' 2026-09-01 ', laufzeit_monate: '24' }), { unterschrieben_am: '2026-09-01', laufzeit_monate: 24 });
  });
  test('anything else is null', () => {
    for (const cd of [null, undefined, 'x', [], {}, { unterschrieben_am: '01.09.2026', laufzeit_monate: 0 }, { unterschrieben_am: 20260901, laufzeit_monate: -3 },
      { laufzeit_monate: 1.5 }, { laufzeit_monate: '' }, { laufzeit_monate: true }, { laufzeit_monate: 'zwölf' }, { unterschrieben_am: '2026-09-01T10:00:00Z' }]) {
      assert.deepEqual(engine.contractDetails(cd), { unterschrieben_am: null, laufzeit_monate: null }, JSON.stringify(cd));
    }
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
