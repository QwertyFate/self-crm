// UNIT tests for utils/engine-webhook.js. The engine is built through its
// factory with a fake pool (two in-memory tables), a fake fetch, a fixed clock
// and fixed randomness — no database, no network, no waiting.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createFakePool } = require('../helpers/fake-pool');
const { createEngineWebhookEngine, signBody, BACKOFF_MINUTES, MAX_ATTEMPTS, STATUS } = require('../../utils/engine-webhook');

// ---- in-memory model of engine_webhook + engine_webhook_deliveries
const hooks = [];               // { id, workspace_id, url, secret, events, active }
const deliveries = new Map();   // id -> row
let nextId = 1;
const NOW = new Date('2026-09-17T10:00:00Z');

function makePool() {
  return createFakePool([
    { match: /^SELECT id FROM engine_webhook WHERE workspace_id = \$1 AND active = true/, reply: p => ({
        rows: hooks.filter(h => h.workspace_id === p[0] && h.active && (h.events.length === 0 || h.events.includes(p[1]) || h.events.includes('*'))).map(h => ({ id: h.id })) }) },
    { match: /^INSERT INTO engine_webhook_deliveries/, reply: p => {
        const ids = p[0].map(webhook_id => { const id = nextId++; deliveries.set(id, { id, webhook_id, workspace_id: p[1], event: p[2], payload: JSON.parse(p[3]), contact_id: p[4], status: 'pending', attempts: 0, next_attempt_at: new Date(0) }); return { id }; });
        return { rows: ids }; } },
    { match: /^WITH due AS/, reply: (p, sql) => {
        const ids = /id = ANY/.test(sql) ? p[1] : null;
        const due = [...deliveries.values()].filter(d => ['pending', 'failed'].includes(d.status) && d.next_attempt_at <= new Date() && (!ids || ids.includes(d.id))).slice(0, p[0]);
        return { rows: due.map(d => { d.attempts += 1; d.last_attempt_at = new Date(); d.next_attempt_at = new Date(Date.now() + 5 * 60_000); const h = hooks.find(x => x.id === d.webhook_id) || {}; return { id: d.id, webhook_id: d.webhook_id, workspace_id: d.workspace_id, event: d.event, payload: d.payload, attempts: d.attempts, url: h.url, secret: h.secret, active: h.active }; }) }; } },
    { match: /^UPDATE engine_webhook_deliveries SET status='delivered'/, reply: p => { Object.assign(deliveries.get(p[0]), { status: 'delivered', response_status: p[1], response_body: p[2], delivered_at: new Date(), next_attempt_at: null }); return { rowCount: 1 }; } },
    { match: /^UPDATE engine_webhook_deliveries SET status='failed'/,    reply: p => { Object.assign(deliveries.get(p[0]), { status: 'failed', response_status: p[1], response_body: p[2], error: p[3], retryInMinutes: p[4], next_attempt_at: new Date(Date.now() + p[4] * 60_000) }); return { rowCount: 1 }; } },
    { match: /^UPDATE engine_webhook_deliveries SET status='dead'/,      reply: p => { Object.assign(deliveries.get(p[0]), { status: 'dead', response_status: p[1], response_body: p[2], error: p[3], next_attempt_at: null }); return { rowCount: 1 }; } },
  ]);
}

// A scriptable fetch: `script.next` decides the outcome of the next call.
function makeFetch() {
  const calls = [];
  const script = { next: { status: 200, body: 'ok' } };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const n = script.next;
    if (n instanceof Error) throw n;
    if (n.hang) return new Promise(resolve => { script.release = () => resolve({ ok: true, status: 200, text: async () => '' }); });   // held until the test releases it (overlap-guard test)
    return { ok: n.status >= 200 && n.status < 300, status: n.status, text: async () => n.body ?? '' };
  };
  return { fetch, calls, script };
}

function build() {
  const pool = makePool();
  const f = makeFetch();
  const engine = createEngineWebhookEngine({ pool, fetch: f.fetch, now: () => NOW, random: () => Buffer.from('00112233445566778899aabbccddeeff', 'hex'), timeoutMs: 1234, log: { log() {}, error() {} } });
  return { pool, engine, ...f };
}

beforeEach(() => { hooks.length = 0; deliveries.clear(); nextId = 1;
  hooks.push({ id: 1, workspace_id: 7, url: 'https://engine.test/a', secret: 's1', events: ['*'], active: true },
             { id: 2, workspace_id: 7, url: 'https://engine.test/b', secret: 's2', events: ['kunde.aktualisiert'], active: true },
             { id: 3, workspace_id: 7, url: 'https://engine.test/c', secret: 's3', events: ['kunde.aktualisiert'], active: false },
             { id: 4, workspace_id: 7, url: 'https://engine.test/d', secret: 's4', events: ['anderes.ereignis'], active: true },
             { id: 5, workspace_id: 8, url: 'https://engine.test/e', secret: 's5', events: [], active: true }); });

describe('signBody', () => {
  test('is HMAC-SHA256 hex over the exact bytes, verifiable with crypto', () => {
    const body = '{"a":1}';
    assert.equal(signBody('geheim', body), crypto.createHmac('sha256', 'geheim').update(body).digest('hex'));
    assert.notEqual(signBody('geheim', body), signBody('anders', body));
  });
});

describe('emitEngineEvent', () => {
  test('creates one delivery per active, subscribed webhook of that workspace, with the payload contract', async () => {
    const { engine } = build();
    const r = await engine.emitEngineEvent(7, 'kunde.aktualisiert', { kundeId: 60, daten: { onboarding_status: 'termin_gebucht' } });
    assert.equal(r.eventId, 'evt_00112233445566778899aabbccddeeff');
    assert.deepEqual(r.deliveryIds, [1, 2]);                                   // hooks 1 ('*') and 2 (subscribed); 3 inactive, 4 other event, 5 other workspace
    const row = deliveries.get(1);
    assert.equal(row.contact_id, 60);
    assert.deepEqual(row.payload, { event_id: r.eventId, event: 'kunde.aktualisiert', workspace_id: 7, kunde_id: 60, daten: { onboarding_status: 'termin_gebucht' }, zeitpunkt: NOW.toISOString() });
  });
  test('no subscriber -> no INSERT, empty deliveryIds', async () => {
    const { engine, pool } = build();
    const r = await engine.emitEngineEvent(9, 'kunde.aktualisiert', { daten: {} });   // workspace 9 has no webhooks
    assert.deepEqual(r.deliveryIds, []);
    assert.equal(pool.some(/^INSERT/), false);
  });
  test('sync dispatch: POSTs the JSON body with the six headers, and the signature verifies against the body', async () => {
    const { engine, calls } = build();
    await engine.emitEngineEvent(7, 'kunde.aktualisiert', { kundeId: 60, daten: { x: 1 } }, { sync: true });
    assert.equal(calls.length, 2);
    const { url, init } = calls[0];
    assert.equal(url, 'https://engine.test/a');
    assert.equal(init.method, 'POST');
    const h = init.headers;
    assert.equal(h['Content-Type'], 'application/json');
    assert.equal(h['X-Upgrads-Event'], 'kunde.aktualisiert');
    assert.equal(h['X-Upgrads-Event-Id'], 'evt_00112233445566778899aabbccddeeff');
    assert.equal(h['X-Upgrads-Delivery'], '1');
    assert.equal(h['X-Upgrads-Timestamp'], String(Math.floor(NOW.getTime() / 1000)));
    assert.equal(h['X-Upgrads-Signature'], 'sha256=' + crypto.createHmac('sha256', 's1').update(init.body).digest('hex'));
    assert.equal(JSON.parse(init.body).kunde_id, 60);
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(deliveries.get(1).status, 'delivered');
  });
  test('rejects a missing workspace or event', async () => {
    const { engine } = build();
    await assert.rejects(engine.emitEngineEvent(null, 'x'), /erforderlich/);
    await assert.rejects(engine.emitEngineEvent(7, ''), /erforderlich/);
  });
});

describe('delivery outcomes', () => {
  // Emit with sync:true so the immediate (first) attempt has completed before we look.
  async function emitOne(engine) { hooks.splice(1); return (await engine.emitEngineEvent(7, 'kunde.aktualisiert', { kundeId: 60, daten: {} }, { sync: true })).deliveryIds[0]; }

  test('2xx -> delivered: response captured, delivered_at set, no further attempts', async () => {
    const { engine, script } = build(); script.next = { status: 204, body: '' };
    const id = await emitOne(engine);
    const d = deliveries.get(id);
    assert.equal(d.status, 'delivered'); assert.equal(d.response_status, 204); assert.ok(d.delivered_at); assert.equal(d.next_attempt_at, null); assert.equal(d.attempts, 1);
  });
  test('5xx -> failed with the first backoff (1 minute), error "HTTP 500", body kept', async () => {
    const { engine, script } = build(); script.next = { status: 500, body: 'kaputt' };
    const id = await emitOne(engine);
    const d = deliveries.get(id);
    assert.equal(d.status, 'failed'); assert.equal(d.error, 'HTTP 500'); assert.equal(d.response_body, 'kaputt'); assert.equal(d.retryInMinutes, 1); assert.equal(d.attempts, 1);
  });
  test('network error -> failed with the message', async () => {
    const { engine, script } = build(); script.next = new Error('ECONNREFUSED');
    const id = await emitOne(engine);
    assert.equal(deliveries.get(id).status, 'failed'); assert.equal(deliveries.get(id).error, 'ECONNREFUSED');
  });
  test('timeout -> failed with a Timeout message naming the limit', async () => {
    const { engine, script } = build(); const e = new Error('aborted'); e.name = 'TimeoutError'; script.next = e;
    const id = await emitOne(engine);
    assert.equal(deliveries.get(id).error, 'Timeout nach 1234 ms');
  });
  test('the backoff table: failure n schedules BACKOFF_MINUTES[n-1]; the 7th failure is dead', async () => {
    const { engine, script } = build(); script.next = { status: 503, body: '' };
    const id = await emitOne(engine);                            // attempt 1 done by the immediate dispatch
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      if (n > 1) { deliveries.get(id).next_attempt_at = new Date(0); await engine.attemptDeliveries([id]); }   // make it due, retry
      const d = deliveries.get(id);
      assert.equal(d.attempts, n);
      if (n < MAX_ATTEMPTS) { assert.equal(d.status, 'failed'); assert.equal(d.retryInMinutes, BACKOFF_MINUTES[n - 1], `delay after failure ${n}`); }
      else { assert.equal(d.status, 'dead'); assert.equal(d.next_attempt_at, null); }
    }
    assert.deepEqual(BACKOFF_MINUTES, [1, 5, 30, 120, 360, 720]);   // ≈ 21 h across 7 attempts
  });
  test('a webhook deactivated before delivery -> dead, "Webhook inaktiv", no fetch', async () => {
    const { engine, calls } = build();
    // A pending row that was queued while the hook was active, then the hook is switched off.
    deliveries.set(50, { id: 50, webhook_id: 1, workspace_id: 7, event: 'e', payload: { event_id: 'evt_x' }, status: 'pending', attempts: 0, next_attempt_at: new Date(0) });
    hooks[0].active = false;
    await engine.attemptDeliveries([50]);
    assert.equal(deliveries.get(50).status, 'dead'); assert.equal(deliveries.get(50).error, 'Webhook inaktiv'); assert.equal(calls.length, 0);
  });
});

describe('claim and worker', () => {
  test('the claim is atomic: FOR UPDATE SKIP LOCKED, due predicate, lease bump; id filter only when ids are given', async () => {
    const { engine, pool } = build();
    await engine.claimDue({ limit: 5 });
    const s = pool.find(/^WITH due AS/).sql;
    assert.match(s, /FOR UPDATE SKIP LOCKED/);
    assert.match(s, /status IN \('pending','failed'\) AND next_attempt_at <= NOW\(\)/);
    assert.match(s, /attempts = d\.attempts \+ 1/);
    assert.match(s, /next_attempt_at = NOW\(\) \+ INTERVAL '5 minutes'/);
    assert.doesNotMatch(s, /id = ANY/);
    assert.deepEqual(pool.find(/^WITH due AS/).params, [5]);
    pool.reset();
    await engine.claimDue({ limit: 2, ids: [9, 10] });
    assert.match(pool.find(/^WITH due AS/).sql, /AND id = ANY\(\$2::int\[\]\)/);
    assert.deepEqual(pool.find(/^WITH due AS/).params, [2, [9, 10]]);
  });
  test('runWorkerOnce processes only due rows and reports a summary', async () => {
    const { engine, script } = build(); script.next = new Error('down');
    hooks.splice(1);
    const { deliveryIds: [a] } = await engine.emitEngineEvent(7, 'kunde.aktualisiert', { daten: {} }, { sync: true });   // first attempt fails -> failed, due in 1 min
    const { deliveryIds: [b] } = await engine.emitEngineEvent(7, 'kunde.aktualisiert', { daten: {} }, { sync: true });
    deliveries.get(a).next_attempt_at = new Date(0);            // a is due, b is not
    script.next = { status: 200, body: 'ok' };
    const summary = await engine.runWorkerOnce({ batch: 10 });
    assert.deepEqual(summary, { claimed: 1, delivered: 1, failed: 0, dead: 0 });
    assert.equal(deliveries.get(a).status, 'delivered');
    assert.equal(deliveries.get(b).status, 'failed');
  });
  test('overlap guard: a tick that starts while the previous one is still running is skipped', async () => {
    const { engine, script } = build(); script.next = { hang: true };
    hooks.splice(1);
    deliveries.set(99, { id: 99, webhook_id: 1, workspace_id: 7, event: 'e', payload: {}, status: 'pending', attempts: 0, next_attempt_at: new Date(0) });
    const first = engine.runWorkerOnce();                       // hangs on fetch
    await new Promise(r => setTimeout(r, 5));
    assert.equal(engine.isRunning(), true);
    assert.deepEqual(await engine.runWorkerOnce(), { skipped: true });
    script.release();                                           // let the first tick finish
    await first;
    assert.equal(engine.isRunning(), false);
  });
  test('startEngineWebhookWorker returns stop/runWorkerOnce, unrefs its interval, and is idempotent', () => {
    const { engine } = build();
    const w1 = engine.startEngineWebhookWorker({ intervalMs: 60_000 });
    const w2 = engine.startEngineWebhookWorker({ intervalMs: 60_000 });
    assert.equal(typeof w1.stop, 'function'); assert.equal(w1.runWorkerOnce, engine.runWorkerOnce); assert.equal(w2.stop, w1.stop);
    w1.stop();
  });
});

test('the module exports the Stage 1 status words (success = delivered, gave up = dead)', () => {
  assert.deepEqual(STATUS, { PENDING: 'pending', DELIVERED: 'delivered', FAILED: 'failed', DEAD: 'dead' });
});
