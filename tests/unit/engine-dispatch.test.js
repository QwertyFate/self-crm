// UNIT tests for the delivery side of utils/engine.js: the bail-out rules, the
// exact request the Engine receives, and the retry/backoff bookkeeping in the
// engine_deliveries log. A fake pool records the SQL; a stub replaces fetch.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { inject, ROOT } = require('../helpers/load-route');

const state = { settings: null, calls: [], deliveryId: 101 };
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    if (sql.includes('FROM workspace_engine'))      return { rows: state.settings ? [state.settings] : [] };
    if (sql.includes('FROM pipeline_stages'))       return { rows: [{ name: 'Contract Signed' }] };
    if (sql.includes('INSERT INTO engine_deliveries')) return { rows: [{ id: state.deliveryId }] };
    if (sql.includes('UPDATE engine_deliveries'))   return { rowCount: 1, rows: [] };
    return { rows: [] };
  },
};
inject('db.js', { pool });
delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
const engine = require(path.join(ROOT, 'utils', 'engine.js'));

const SECRET = 'c'.repeat(64);
const ACTIVE = { workspace_id: 7, engine_url: 'https://engine.example/hook', active: true, trigger_stage_ids: [5], webhook_secret: SECRET };

function response(status, text = '') {
  return { status, text: async () => text, headers: new Map() };
}
// A fetch stub that answers from a script of responses / errors and records every call.
function stubFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = script.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(init);
    return next;
  };
  fn.calls = calls;
  return fn;
}
const inserts = () => state.calls.filter(c => c.sql.includes('INSERT INTO engine_deliveries'));
const updates = () => state.calls.filter(c => c.sql.includes('UPDATE engine_deliveries'));

beforeEach(() => { state.settings = { ...ACTIVE }; state.calls.length = 0; engine.configure({ delays: [0, 0, 0], timeoutMs: 50 }); });
afterEach(() => engine.resetConfig());

const args = { workspaceId: 7, dealId: 17, contactId: 42, title: 'Solaranlage 10 kWp', stageId: '5' };

describe('dispatchContractSigned bails out', () => {
  for (const [name, patch] of [
    ['when the integration is inactive', { active: false }],
    ['when no Engine URL is set',        { engine_url: null }],
    ['when the stage is not a trigger',  { trigger_stage_ids: [3] }],
  ]) {
    test(name, async () => {
      state.settings = { ...ACTIVE, ...patch };
      const f = stubFetch([response(200)]); engine.configure({ fetch: f });
      assert.equal(await engine.dispatchContractSigned(args), null);
      assert.equal(f.calls.length, 0);
      assert.equal(inserts().length, 0);
    });
  }
  test('when the workspace has no settings row', async () => {
    state.settings = null;
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    assert.equal(await engine.dispatchContractSigned(args), null);
    assert.equal(f.calls.length, 0);
  });
});

describe('dispatchContractSigned happy path', () => {
  test('one signed POST whose body is byte-for-byte the stored raw_body', async () => {
    const f = stubFetch([response(200, 'ok')]); engine.configure({ fetch: f });
    const result = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.equal(url, ACTIVE.engine_url);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.headers['X-Upgrads-Event'], 'vertrag.unterschrieben');
    assert.match(init.headers['X-Upgrads-Timestamp'], /^\d{10}$/);
    assert.match(init.headers['User-Agent'], /Upgrads-CRM/);
    assert.equal(typeof init.body, 'string');
    assert.ok(init.signal, 'an AbortSignal is attached for the timeout');

    const payload = JSON.parse(init.body);
    assert.equal(payload.event, 'vertrag.unterschrieben');
    assert.equal(payload.kunde_id, 42);
    assert.equal(payload.vertrag_id, 17);
    assert.equal(payload.produkt, 'Solaranlage 10 kWp');
    assert.equal(payload.stage, 'Contract Signed');
    assert.match(payload.event_id, /^[0-9a-f-]{36}$/);
    assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);

    const ver = engine.verify(SECRET, init.headers['X-Upgrads-Timestamp'], init.body, init.headers['X-Upgrads-Signature']);
    assert.deepEqual(ver, { ok: true }, 'signature verifies over the exact bytes sent');

    const ins = inserts();
    assert.equal(ins.length, 1);
    assert.equal(ins[0].params[0], 7, 'workspace scoped');
    assert.equal(ins[0].params[1], 'vertrag.unterschrieben');
    assert.equal(ins[0].params[2], payload.event_id);
    assert.equal(ins[0].params[3], 17);
    assert.equal(ins[0].params[4], 42);
    assert.equal(ins[0].params[5], ACTIVE.engine_url);
    assert.equal(ins[0].params[7], init.body, 'raw_body is the signed string');

    const up = updates();
    assert.equal(up.length, 1);
    assert.equal(up[0].params[0], 1, 'attempts');
    assert.equal(up[0].params[1], 200, 'last_status_code');
    assert.equal(up[0].params[2], null, 'last_error');
    assert.equal(up[0].params[3], 'success', 'status');
    assert.equal(up[0].params.at(-1), 101, 'row id');
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.equal(result.id, 101);
  });
  test('the stage name lookup is workspace scoped', async () => {
    engine.configure({ fetch: stubFetch([response(204)]) });
    await engine.dispatchContractSigned(args);
    const q = state.calls.find(c => c.sql.includes('FROM pipeline_stages'));
    assert.match(q.sql, /workspace_id\s*=\s*\$2/);
    assert.deepEqual(q.params, [5, 7]);
  });
});

describe('retry and backoff', () => {
  test('500 then 200: two attempts, fresh signature each time, final success with attempts=2', async () => {
    const f = stubFetch([response(500, 'boom'), response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].init.body, f.calls[1].init.body, 'same bytes on every attempt');
    const up = updates();
    assert.equal(up.length, 2);
    assert.equal(up[0].params[3], 'pending', 'first attempt leaves the row pending');
    assert.match(up[0].params[2], /HTTP 500 boom/);
    assert.ok(up[0].params[5] instanceof Date, 'next_attempt_at is scheduled');
    assert.equal(up[1].params[3], 'success');
    assert.equal(up[1].params[5], null, 'no further attempt scheduled');
    assert.equal(r.attempts, 2);
    for (const c of f.calls) {
      assert.deepEqual(engine.verify(SECRET, c.init.headers['X-Upgrads-Timestamp'], c.init.body, c.init.headers['X-Upgrads-Signature']), { ok: true });
    }
  });
  test('three 503s: three attempts, then failed', async () => {
    const f = stubFetch([response(503), response(503), response(503)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 3);
    const last = updates().at(-1);
    assert.equal(last.params[0], 3);
    assert.equal(last.params[3], 'failed');
    assert.match(last.params[2], /HTTP 503/);
    assert.equal(r.ok, false);
  });
  test('a 401 is a configuration error: one attempt, failed immediately', async () => {
    const f = stubFetch([response(401, 'bad signature'), response(200)]); engine.configure({ fetch: f });
    await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 1);
    const last = updates().at(-1);
    assert.equal(last.params[3], 'failed');
    assert.equal(last.params[1], 401);
  });
  test('408 and 429 are retried', async () => {
    const f = stubFetch([response(408), response(429), response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 3);
    assert.equal(r.ok, true);
  });
  test('a timeout aborts the request, is logged, and is retried', async () => {
    const hang = init => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
    const f = stubFetch([hang, response(200)]); engine.configure({ fetch: f, timeoutMs: 20 });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 2);
    assert.match(updates()[0].params[2], /timeout/i);
    assert.equal(r.ok, true);
  });
  test('a network error never rejects the outer promise', async () => {
    const f = stubFetch([Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), Object.assign(new Error('x')), Object.assign(new Error('y'))]);
    engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 3);
    assert.equal(r.ok, false);
    assert.match(updates().at(-1).params[2], /ECONNREFUSED|x|y/);
    assert.equal(updates().at(-1).params[3], 'failed');
  });
  test('the backoff waits use the configured delays, not real time', async () => {
    const waits = [];
    const f = stubFetch([response(500), response(500), response(200)]);
    engine.configure({ fetch: f, delays: [0, 5000, 30000], wait: async ms => { waits.push(ms); } });
    await engine.dispatchContractSigned(args);
    assert.deepEqual(waits, [5000, 30000]);
  });
});

describe('sendTestEvent', () => {
  test('sends test.ping once, even on failure, and records the delivery', async () => {
    const f = stubFetch([response(500, 'nope'), response(200)]); engine.configure({ fetch: f });
    const r = await engine.sendTestEvent(7);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].init.headers['X-Upgrads-Event'], 'test.ping');
    const payload = JSON.parse(f.calls[0].init.body);
    assert.equal(payload.event, 'test.ping');
    assert.equal(payload.workspace_id, 7);
    assert.equal(inserts()[0].params[1], 'test.ping');
    assert.equal(updates().at(-1).params[3], 'failed');
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
  });
  test('does not require the integration to be active, but does require a URL', async () => {
    state.settings = { ...ACTIVE, active: false };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    assert.equal((await engine.sendTestEvent(7)).ok, true);
    state.settings = { ...ACTIVE, engine_url: null };
    await assert.rejects(() => engine.sendTestEvent(7), /Engine URL/);
  });
});

describe('drain', () => {
  test('waits for a fire-and-forget delivery that is still running', async () => {
    let release;
    const f = stubFetch([() => new Promise(res => { release = () => res(response(200)); })]);
    engine.configure({ fetch: f });
    const p = engine.dispatchContractSigned(args);       // not awaited, like the route does
    p.catch(() => {});
    await new Promise(r => setImmediate(r));
    assert.equal(f.calls.length, 1, 'request is in flight');
    setTimeout(() => release(), 5);
    await engine.drain();
    assert.equal(updates().at(-1).params[3], 'success');
  });
});
