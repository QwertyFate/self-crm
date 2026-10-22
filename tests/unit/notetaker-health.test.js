// UNIT tests for the Notetaker health check (utils/notetaker.js health(), Part 3, 2026-10-21). Before the booking
// dialog offers "Mit Notetaker aufzeichnen", the CRM asks the Notetaker whether it is there and accepts the CRM's
// token. The Notetaker has no health route, so the probe is its documented listing, filtered to an id no meeting
// has: GET <NOTETAKER_URL>?external_id=crm-health-check. A JSON list back means up and the token accepted; 401 is the
// token; anything else (another server on the port, an error page, a 5xx) is an error; no answer within 3 seconds or
// no connection is unreachable. Never throws.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const nt = require(path.join(ROOT, 'utils', 'notetaker.js'));

const ENV = ['NOTETAKER_URL', 'NOTETAKER_CRM_TOKEN'];
const saved = {};
const realFetch = globalThis.fetch;
let seen;
beforeEach(() => { seen = []; for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { globalThis.fetch = realFetch; for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
const answer = (status, body, raw) => { globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return new Response(raw ?? JSON.stringify(body), { status }); }; };

describe('asking the Notetaker', () => {
  test('a GET of its listing, filtered to an id no meeting has; no token header without a token', async () => {
    answer(200, []);
    assert.deepEqual(await nt.health(), { available: true });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'http://localhost:8000/crm/recordings?external_id=crm-health-check');
    assert.equal(seen[0].init.method, 'GET');
    assert.deepEqual(seen[0].init.headers, {});
    assert.ok(seen[0].init.signal, 'it can be cut off');
  });
  test('the token goes along when set; NOTETAKER_URL moves the probe with it', async () => {
    process.env.NOTETAKER_CRM_TOKEN = 'tok_1'; process.env.NOTETAKER_URL = 'http://localhost:8100/crm/recordings';
    answer(200, []);
    await nt.health();
    assert.equal(seen[0].url, 'http://localhost:8100/crm/recordings?external_id=crm-health-check');
    assert.deepEqual(seen[0].init.headers, { Authorization: 'Bearer tok_1' });
  });
});

describe('reading the answer', () => {
  test('401 is the token', async () => {
    answer(401, { detail: 'missing or wrong Authorization: Bearer token' });
    assert.deepEqual(await nt.health(), { available: false, reason: 'token' });
  });
  test('a 5xx, a 404, or a 200 that is not a list (another server on that port) is an error', async () => {
    for (const [status, body, raw] of [[500, { detail: 'boom' }], [404, { detail: 'Not Found' }], [200, null, '<html>hello</html>'], [200, { ok: true }]]) {
      answer(status, body, raw);
      assert.deepEqual(await nt.health(), { available: false, reason: 'error' }, `${status} ${raw || JSON.stringify(body)}`);
    }
  });
  test('no connection, or no answer in time, is unreachable; never a throw', async () => {
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.deepEqual(await nt.health(), { available: false, reason: 'unreachable' });
    globalThis.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    assert.deepEqual(await nt.health(), { available: false, reason: 'unreachable' });
  });
  test('a broken NOTETAKER_URL is an error without any request', async () => {
    process.env.NOTETAKER_URL = 'not a url';
    answer(200, []);
    assert.deepEqual(await nt.health(), { available: false, reason: 'error' });
    assert.equal(seen.length, 0);
  });
});
