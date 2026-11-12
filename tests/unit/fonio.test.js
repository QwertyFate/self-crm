// UNIT tests for utils/fonio.js (FONIO_CHANGES Parts 3–4): a contact's number made fonio-ready, the workspace's
// number starts, the calling hours (DST and another zone included), and outboundCall against a fake fonio — above all
// that a call is retried ONLY when fonio cannot have taken it, so no client is ever called twice.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fonio = require('../../utils/fonio');

describe('toInternational: the number fonio dials', () => {
  const cases = [
    ['0171 1234567', '+491711234567'],
    ['0171/123 45-67', '+491711234567'],
    ['+49 (0)30 123456', '+4930123456'],
    ['0049 30 123456', '+4930123456'],
    ['+43 1 234567', '+431234567'],
  ];
  for (const [raw, want] of cases) test(`${raw} → ${want}`, () => assert.equal(fonio.toInternational(raw, '+49'), want));
  test('another country code for a leading 0', () => assert.equal(fonio.toInternational('0612 345678', '+43'), '+43612345678'));
  for (const raw of ['', null, '1711234567', '+49 12', 'call me', '+0171234567']) {
    test(`${JSON.stringify(raw)} → null (cannot be told)`, () => assert.equal(fonio.toInternational(raw, '+49'), null));
  }
});

describe('number starts', () => {
  test('read like numbers: 0171 → +49171, 0049 → +49, 49 → +49, +43 stays', () => {
    assert.equal(fonio.prefixToInternational('0171', '+49'), '+49171');
    assert.equal(fonio.prefixToInternational('0049', '+49'), '+49');
    assert.equal(fonio.prefixToInternational('49', '+49'), '+49');
    assert.equal(fonio.prefixToInternational('+43', '+49'), '+43');
  });
  test('no starts: every number; with starts: only those', () => {
    assert.equal(fonio.numberAllowed('+491711234567', [], '+49'), true);
    assert.equal(fonio.numberAllowed('+491711234567', ['0171', '0160'], '+49'), true);
    assert.equal(fonio.numberAllowed('+4930123456', ['0171', '0160'], '+49'), false);
    assert.equal(fonio.numberAllowed('+431234567', ['+49'], '+49'), false);
  });
});

describe('nextCallTime: inside the calling hours', () => {
  const berlin = { hours_on: true, hours_days: [1, 2, 3, 4, 5], hours_from: '09:00', hours_to: '18:00', hours_tz: 'Europe/Berlin' };
  const at = iso => fonio.nextCallTime(new Date(iso), berlin).toISOString();
  test('inside the hours: that very moment', () => assert.equal(at('2026-11-04T09:00:00.000Z'), '2026-11-04T09:00:00.000Z'));   // Wed 10:00 Berlin
  test('before the hours: 09:00 the same day', () => assert.equal(at('2026-11-04T06:00:00.000Z'), '2026-11-04T08:00:00.000Z'));
  test('after the hours: 09:00 the next day', () => assert.equal(at('2026-11-04T17:30:00.000Z'), '2026-11-05T08:00:00.000Z'));
  test('18:00 exactly is already closed', () => assert.equal(at('2026-11-04T17:00:00.000Z'), '2026-11-05T08:00:00.000Z'));
  test('Friday evening and the weekend: Monday 09:00', () => {
    assert.equal(at('2026-11-06T18:00:00.000Z'), '2026-11-09T08:00:00.000Z');
    assert.equal(at('2026-11-07T11:00:00.000Z'), '2026-11-09T08:00:00.000Z');
  });
  test('over the switch to summer time: Monday 09:00 CEST is 07:00 UTC', () => {
    assert.equal(at('2026-03-27T18:00:00.000Z'), '2026-03-30T07:00:00.000Z');
  });
  test("another zone: 08:30 in Manila waits for 09:00 Manila", () => {
    const manila = { ...berlin, hours_tz: 'Asia/Manila' };
    assert.equal(fonio.nextCallTime(new Date('2026-11-04T00:30:00.000Z'), manila).toISOString(), '2026-11-04T01:00:00.000Z');
  });
  test("the database's HH:MM:SS works the same", () => {
    const db = { ...berlin, hours_from: '09:00:00', hours_to: '18:00:00' };
    assert.equal(fonio.nextCallTime(new Date('2026-11-04T06:00:00.000Z'), db).toISOString(), '2026-11-04T08:00:00.000Z');
  });
  test('hours off: any time; no day at all: null', () => {
    assert.equal(fonio.nextCallTime(new Date('2026-11-07T23:00:00.000Z'), { ...berlin, hours_on: false }).toISOString(), '2026-11-07T23:00:00.000Z');
    assert.equal(fonio.nextCallTime(new Date('2026-11-04T09:00:00.000Z'), { ...berlin, hours_days: [] }), null);
  });
});

describe('outboundCall: one request, retried only when fonio cannot have taken it', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const KEY = 'fonio_live_0123456789abcdef';
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const call = opts => fonio.outboundCall(KEY, { fromNumber: '+4930123456', toNumber: '+491711234567', context: { name: 'Erika' } }, opts);

  test('sends apiKey, fromNumber, toNumber and context in the body to outbound_call', async () => {
    let seen;
    globalThis.fetch = async (url, init) => { seen = { url, init }; return reply(200, { status: 'success', message: 'Call initiated' })(); };
    assert.deepEqual(await call(), { ok: true, message: 'Call initiated', answer: { http: 200, body: { status: 'success', message: 'Call initiated' } } });
    assert.equal(seen.url, 'https://app.fonio.ai/api/public/v1/outbound_call');
    assert.equal(seen.init.method, 'POST');
    assert.deepEqual(JSON.parse(seen.init.body), { apiKey: KEY, fromNumber: '+4930123456', toNumber: '+491711234567', context: { name: 'Erika' } });
  });
  test("fonio's answer is handed back as it came (Part 18): the status, the body, the key blanked, a huge body cut", async () => {
    globalThis.fetch = reply(400, { message: `Invalid key ${KEY}`, details: { apiKey: KEY, more: [1, 2] } });
    assert.deepEqual((await call()).answer, { http: 400, body: { message: 'Invalid key …', details: { apiKey: '…', more: [1, 2] } } });
    globalThis.fetch = async () => new Response('<html>busy</html>', { status: 503 });
    assert.deepEqual((await call()).answer, { http: 503, body: null });
    globalThis.fetch = reply(200, { status: 'success', blob: 'x'.repeat(30000) });
    const big = (await call()).answer.body;
    assert.deepEqual(Object.keys(big), ['cut']);
    assert.equal(big.cut.length, 2000);
  });
  const cases = [
    ['200 with status error', 200, { status: 'error', message: 'KYC not completed' }, false],
    ['400', 400, { message: 'Invalid toNumber' }, false],
    ['500', 500, {}, false],
    ['502', 502, {}, false],
    ['429', 429, { message: 'Too many calls' }, true],
    ['503', 503, {}, true],
  ];
  for (const [name, status, body, retry] of cases) {
    test(`fonio answers ${name}: not ok, retry ${retry}`, async () => {
      globalThis.fetch = reply(status, body);
      const r = await call();
      assert.equal(r.ok, false);
      assert.equal(r.retry, retry);
      if (body.message) assert.equal(r.error, body.message);
    });
  }
  test('refused before anything was sent (ECONNREFUSED): retry', async () => {
    globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
    const r = await call();
    assert.equal(r.retry, true);
  });
  test('a broken connection (ECONNRESET): no retry, the call may have started', async () => {
    globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); };
    const r = await call();
    assert.equal(r.retry, false);
    assert.match(r.error, /may have started/);
  });
  test('no answer in time: no retry, the call may have started', async () => {
    globalThis.fetch = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const r = await call({ timeoutMs: 20 });
    assert.equal(r.retry, false);
    assert.match(r.error, /may have started/);
  });
  test("fonio's words never carry the key back", async () => {
    globalThis.fetch = reply(401, { message: `Key ${KEY} invalid` });
    const r = await call();
    assert.ok(!r.error.includes(KEY));
  });
});
