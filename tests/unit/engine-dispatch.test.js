// UNIT tests for the delivery side of utils/engine.js: the bail-out rules, the
// exact request the Engine receives (briefing §5.1 envelope + raw-body HMAC),
// the no-contact rule, the retry schedule and bookkeeping in engine_deliveries,
// the DB-backed retry worker (claim, lease, inactive workspaces), and manual
// retry. A fake pool records the SQL; a stub replaces fetch.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { inject, ROOT } = require('../helpers/load-route');

const state = { settings: null, deal: null, calls: [], deliveryId: 101, claimed: [] };
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    // The claim statement's RETURNING subselects also read workspace_engine, so it must be matched first.
    if (sql.includes('WITH due AS'))                   return { rows: state.claimed.splice(0, params[0]) };
    if (sql.includes('FROM workspace_engine'))         return { rows: state.settings ? [state.settings] : [] };
    if (/^SELECT value FROM platform_settings WHERE key=\$1/.test(sql)) return { rows: state.controlsRow ? [{ value: state.controlsRow }] : [] };   // utils/engine-controls.js
    if (sql.includes('SELECT custom_data FROM deals')) return { rows: state.deal ? [state.deal] : [] };
    if (/^SELECT id, workspace_id, name, email, phone, company, contact_type,/.test(sql)) return { rows: state.contact ? [state.contact] : [] };   // utils/kunde.js COLUMNS
    if (/^SELECT id FROM contact_documents WHERE workspace_id=\$1 AND contact_id=\$2 AND typ='vertrag'/.test(sql)) return { rows: state.vertragDoc ? [state.vertragDoc] : [] };
    if (/FROM contact_documents d\s+JOIN contacts c/.test(sql))                                return { rows: state.docRow ? [state.docRow] : [] };
    if (sql.includes('INSERT INTO engine_deliveries')) return { rows: [{ id: state.deliveryId }] };
    if (sql.includes('UPDATE engine_deliveries'))      return { rowCount: 1, rows: [] };
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
const inserts  = () => state.calls.filter(c => c.sql.includes('INSERT INTO engine_deliveries'));
const updates  = () => state.calls.filter(c => c.sql.includes('UPDATE engine_deliveries') && !c.sql.includes('WITH due AS'));
const recorded = () => updates().filter(c => /SET attempts=\$1/.test(c.sql));     // recordAttempt rows
const verified = (c, secret = SECRET) => engine.verify(secret, c.init.body, c.init.headers['X-Upgrads-Signature']);
const secondsFromNow = d => (d.getTime() - Date.now()) / 1000;

const engineControls = require(path.join(ROOT, 'utils', 'engine-controls.js'));
beforeEach(() => { state.settings = { ...ACTIVE }; state.deal = { custom_data: {} }; state.vertragDoc = null; state.docRow = null; state.controlsRow = null; state.calls.length = 0; state.claimed = []; engineControls.resetCache(); engine.configure({ timeoutMs: 50 }); });
afterEach(() => { engine.resetConfig(); engine.stopRetryWorker(); });

const args = { workspaceId: 7, dealId: 17, contactId: 42, title: 'Maklersystem Landingpage', stageId: '5', timezone: 'Europe/Berlin' };

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
  test('one signed POST whose body is byte-for-byte the stored raw_body, in the briefing envelope', async () => {
    const f = stubFetch([response(200, 'ok')]); engine.configure({ fetch: f });
    const result = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.equal(url, ACTIVE.engine_url);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(Object.keys(init.headers).sort(), ['Content-Type', 'User-Agent', 'X-Upgrads-Event', 'X-Upgrads-Signature'], 'no timestamp header');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.headers['X-Upgrads-Event'], 'vertrag.unterschrieben');
    assert.match(init.headers['X-Upgrads-Signature'], /^[0-9a-f]{64}$/, 'plain lower-case hex');
    assert.match(init.headers['User-Agent'], /Upgrads-CRM/);
    assert.equal(typeof init.body, 'string');
    assert.ok(init.signal, 'an AbortSignal is attached for the timeout');

    const payload = JSON.parse(init.body);
    assert.deepEqual(Object.keys(payload), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(payload.event, 'vertrag.unterschrieben');
    assert.match(payload.event_id, /^[0-9a-f-]{36}$/);
    assert.match(payload.zeitpunkt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO 8601 UTC');
    assert.equal(payload.kunde_id, 42);
    assert.deepEqual(payload.daten, {
      vertrag_id: 17, produkt: 'Maklersystem Landingpage',
      unterschrieben_am: engine.dateInZone(new Date(), 'Europe/Berlin'),
      laufzeit_monate: null, dokument_url: null,
    });
    assert.equal('stage' in payload, false); assert.equal('timestamp' in payload, false);
    assert.deepEqual(verified(f.calls[0]), { ok: true }, 'signature verifies over the exact bytes sent');

    const ins = inserts();
    assert.equal(ins.length, 1);
    assert.deepEqual(ins[0].params.slice(0, 6), [7, 'vertrag.unterschrieben', payload.event_id, 17, 42, ACTIVE.engine_url]);
    assert.equal(ins[0].params[7], init.body, 'raw_body is the signed string');
    assert.doesNotMatch(ins[0].sql, /next_attempt_at/, 'the row starts with next_attempt_at NULL: the immediate attempt owns it');

    const up = recorded();
    assert.equal(up.length, 1);
    assert.deepEqual(up[0].params, [1, 200, null, 'success', true, null, 101]);
    assert.match(up[0].sql, /last_attempt_at=NOW\(\)/);
    assert.deepEqual(result, { id: 101, ok: true, status: 200, error: null, attempts: 1, delivery_status: 'success', next_attempt_at: null });
  });
  test('deal fields unterschrieben_am / laufzeit_monate are forwarded when present; nothing else leaks', async () => {
    state.deal = { custom_data: { unterschrieben_am: '2026-09-01', laufzeit_monate: '12', something_else: 'x' } };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    await engine.dispatchContractSigned(args);
    const d = JSON.parse(f.calls[0].init.body).daten;
    assert.equal(d.unterschrieben_am, '2026-09-01');
    assert.equal(d.laufzeit_monate, 12);
    assert.equal('something_else' in d, false);
  });
  test('unterschrieben_am follows the acting user\'s timezone when no deal field is set', async () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', undefined, 'Mars/Olympus']) {
      const f = stubFetch([response(200)]); engine.configure({ fetch: f });
      await engine.dispatchContractSigned({ ...args, timezone: tz });
      assert.equal(JSON.parse(f.calls[0].init.body).daten.unterschrieben_am, engine.dateInZone(new Date(), tz), String(tz));
    }
  });
  test('the deal lookup is workspace scoped; the stage name is no longer looked up', async () => {
    engine.configure({ fetch: stubFetch([response(204)]) });
    await engine.dispatchContractSigned(args);
    const q = state.calls.find(c => c.sql.includes('SELECT custom_data FROM deals'));
    assert.match(q.sql, /WHERE id=\$1 AND workspace_id=\$2/);
    assert.deepEqual(q.params, [17, 7]);
    assert.equal(state.calls.some(c => c.sql.includes('FROM pipeline_stages')), false);
  });
});

describe('a deal without a contact (no kunde_id)', () => {
  test('is logged as failed with the reason and never sent', async () => {
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned({ ...args, contactId: null });
    assert.equal(f.calls.length, 0, 'no HTTP request');
    assert.equal(inserts().length, 1, 'the event is still logged');
    assert.equal(inserts()[0].params[4], null);
    const up = updates();
    assert.equal(up.length, 1);
    assert.match(up[0].sql, /attempts=0/); assert.match(up[0].sql, /status='failed'/);
    assert.deepEqual(up[0].params, [engine.NO_CONTACT_ERROR, 101]);
    assert.deepEqual(r, { id: 101, ok: false, status: null, error: engine.NO_CONTACT_ERROR, attempts: 0, delivery_status: 'failed', next_attempt_at: null });
  });
});

describe('the retry schedule (briefing §5.1: ≥ 5 attempts, increasing intervals, ~24 h)', () => {
  test('7 attempts: +1 min, +5 min, +30 min, +2 h, +6 h, +16 h; the last lands ≈ 24.6 h after the first', () => {
    assert.deepEqual(engine.RETRY_DELAYS_SEC, [60, 300, 1800, 7200, 21600, 57600]);
    assert.equal(engine.MAX_ATTEMPTS, 7);
    assert.ok(engine.MAX_ATTEMPTS >= 5);
    const total = engine.RETRY_DELAYS_SEC.reduce((a, b) => a + b, 0) / 3600;
    assert.ok(total > 22 && total < 26, `${total} h`);
    for (let n = 1; n <= 6; n++) assert.equal(engine.retryDelaySec(n), engine.RETRY_DELAYS_SEC[n - 1], `after failure ${n}`);
    assert.equal(engine.retryDelaySec(7), null, 'no eighth attempt');
    assert.equal(engine.retryDelaySec(0), null); assert.equal(engine.retryDelaySec(99), null); assert.equal(engine.retryDelaySec('2'), null);
  });
});

describe('the immediate attempt records and schedules, it never loops in-process', () => {
  test('500: one fetch, row pending, first retry scheduled ≈ 60 s out, last_attempt_at stamped', async () => {
    const f = stubFetch([response(500, 'boom'), response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 1, 'no second attempt in-process');
    const up = recorded();
    assert.equal(up.length, 1);
    assert.equal(up[0].params[0], 1);
    assert.equal(up[0].params[1], 500);
    assert.match(up[0].params[2], /HTTP 500 boom/);
    assert.equal(up[0].params[3], 'pending');
    assert.ok(up[0].params[5] instanceof Date);
    const s = secondsFromNow(up[0].params[5]);
    assert.ok(s > 55 && s <= 60, `next attempt in ${s}s`);
    assert.equal(r.ok, false); assert.equal(r.delivery_status, 'pending'); assert.equal(r.attempts, 1);
  });
  test('401 is a configuration error: failed at once, nothing scheduled', async () => {
    const f = stubFetch([response(401, 'bad signature')]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.deepEqual(recorded()[0].params.slice(3, 6), ['failed', false, null]);
    assert.equal(r.delivery_status, 'failed');
  });
  test('408, 429, a network error and a timeout are all retryable → pending', async () => {
    for (const script of [[response(408)], [response(429)], [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })]]) {
      state.calls.length = 0;
      engine.configure({ fetch: stubFetch(script) });
      const r = await engine.dispatchContractSigned(args);
      assert.equal(r.delivery_status, 'pending');
      assert.ok(recorded()[0].params[5] instanceof Date);
    }
    state.calls.length = 0;
    const hang = init => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
    engine.configure({ fetch: stubFetch([hang]), timeoutMs: 20 });
    const r = await engine.dispatchContractSigned(args);
    assert.match(recorded()[0].params[2], /timeout/i);
    assert.equal(r.delivery_status, 'pending');
  });
  test('a network error never rejects the outer promise', async () => {
    engine.configure({ fetch: stubFetch([Object.assign(new Error('x'))]) });
    await assert.doesNotReject(engine.dispatchContractSigned(args));
  });
});

describe('the retry worker', () => {
  const claimedRow = (over = {}) => ({ id: 501, workspace_id: 7, event: 'vertrag.unterschrieben', raw_body: '{"event":"vertrag.unterschrieben","kunde_id":42}', attempts: 1, url: ACTIVE.engine_url, secret: SECRET, active: true, ...over });

  test('claimDue: one atomic statement — pending rows due now (or orphaned past the lease), FOR UPDATE SKIP LOCKED, lease bump, current card values', async () => {
    state.claimed = [claimedRow()];
    const rows = await engine.claimDue(20);
    assert.equal(rows.length, 1);
    const q = state.calls.find(c => c.sql.includes('WITH due AS'));
    assert.deepEqual(q.params, [20, engine.LEASE_SEC]);
    assert.match(q.sql, /status = 'pending'/);
    assert.match(q.sql, /COALESCE\(next_attempt_at, created_at \+ make_interval\(secs => \$2\)\) <= NOW\(\)/);
    assert.match(q.sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(q.sql, /SET next_attempt_at = NOW\(\) \+ make_interval\(secs => \$2\)/);
    assert.match(q.sql, /LIMIT \$1/);
    for (const col of ['engine_url', 'webhook_secret', 'active']) assert.match(q.sql, new RegExp(`SELECT w\\.${col}\\s+FROM workspace_engine w WHERE w\\.workspace_id = d\\.workspace_id`));
    assert.equal(engine.LEASE_SEC, 300);
  });
  test('runDue: each claimed row gets one attempt with its stored bytes, signed with the current secret; the outcome is recorded with attempts+1', async () => {
    const other = 'e'.repeat(64);
    state.claimed = [claimedRow({ id: 501, attempts: 1 }), claimedRow({ id: 502, attempts: 6, secret: other, url: 'https://new.example/hook' })];
    const f = stubFetch([response(200), response(503, 'still down')]); engine.configure({ fetch: f });
    const results = await engine.runDue({ limit: 20 });
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].init.body, '{"event":"vertrag.unterschrieben","kunde_id":42}');
    assert.deepEqual(verified(f.calls[0]), { ok: true });
    assert.equal(f.calls[1].url, 'https://new.example/hook', 'a changed URL applies to retries');
    assert.deepEqual(verified(f.calls[1], other), { ok: true }, 'a rotated secret applies to retries');
    const up = recorded();
    assert.deepEqual(up[0].params, [2, 200, null, 'success', true, null, 501]);
    assert.equal(up[1].params[0], 7, 'seventh attempt');
    assert.equal(up[1].params[3], 'failed', 'the schedule is exhausted: no eighth attempt');
    assert.equal(up[1].params[5], null);
    assert.equal(results.length, 2);
    assert.equal(results[0].delivery_status, 'success'); assert.equal(results[1].delivery_status, 'failed');
  });
  test('runDue: a transient failure with attempts left is re-scheduled on the schedule (attempt 3 → +30 min)', async () => {
    state.claimed = [claimedRow({ attempts: 2 })];
    engine.configure({ fetch: stubFetch([response(502)]) });
    await engine.runDue();
    const up = recorded()[0];
    assert.equal(up.params[0], 3); assert.equal(up.params[3], 'pending');
    const s = secondsFromNow(up.params[5]);
    assert.ok(s > 1795 && s <= 1800, `${s}s`);
  });
  test('runDue: a workspace whose integration is off (or has no URL) is postponed an hour without an attempt', async () => {
    state.claimed = [claimedRow({ id: 503, active: false }), claimedRow({ id: 504, url: null })];
    const f = stubFetch([response(200), response(200)]); engine.configure({ fetch: f });
    const results = await engine.runDue();
    assert.equal(f.calls.length, 0);
    const posts = updates().filter(c => /SET last_error=\$1, next_attempt_at = NOW\(\) \+ make_interval\(secs => \$2\)/.test(c.sql));
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[0].params, [engine.INACTIVE_ERROR, engine.POSTPONE_SEC, 503]);
    assert.deepEqual(posts[1].params, [engine.INACTIVE_ERROR, engine.POSTPONE_SEC, 504]);
    assert.equal(recorded().length, 0, 'attempts are not consumed');
    assert.ok(results.every(r => r.postponed && r.delivery_status === 'pending'));
  });
  test('runDue with nothing due returns [] after the single claim statement', async () => {
    const r = await engine.runDue();
    assert.deepEqual(r, []);
    assert.equal(state.calls.length, 1);
  });
  test('startRetryWorker ticks at once, then on the interval; stop() ends it; a second start returns the running worker', async () => {
    engine.configure({ fetch: stubFetch([]) });
    const w = engine.startRetryWorker({ intervalMs: 5, log: { error() {} } });
    assert.equal(engine.startRetryWorker({ intervalMs: 5 }), w, 'singleton while running');
    await new Promise(r => setTimeout(r, 40));
    const n = state.calls.filter(c => c.sql.includes('WITH due AS')).length;
    assert.ok(n >= 3, `ticked ${n} times`);
    w.stop();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(state.calls.filter(c => c.sql.includes('WITH due AS')).length, n, 'no ticks after stop');
    assert.notEqual(engine.startRetryWorker({ intervalMs: 5 }), w, 'can be started again after stop');
    engine.stopRetryWorker();
  });
  test('a tick that throws is logged and does not kill the worker', async () => {
    const errors = [];
    const broken = { ...pool, query: async (sql, params) => { if (sql.includes('WITH due AS')) throw new Error('db gone'); return pool.query(sql, params); } };
    inject('db.js', { pool: broken });
    delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
    const eng = require(path.join(ROOT, 'utils', 'engine.js'));
    const w = eng.startRetryWorker({ intervalMs: 5, log: { error: (...a) => errors.push(a.join(' ')) } });
    await new Promise(r => setTimeout(r, 25));
    w.stop();
    assert.ok(errors.length >= 2 && errors.every(e => /engine retry worker: db gone/.test(e)));
    inject('db.js', { pool }); delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
  });
});

describe('retryDelivery (manual, from the Sent events card)', () => {
  const row = { id: 77, event: 'vertrag.unterschrieben', raw_body: '{"event":"vertrag.unterschrieben","kunde_id":42}', attempts: 7 };
  test('takes the lease, then one counted attempt with the stored bytes; success is recorded as attempt 8', async () => {
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const r = await engine.retryDelivery(row, ACTIVE);
    const lease = updates()[0];
    assert.match(lease.sql, /SET status='pending', next_attempt_at = NOW\(\) \+ make_interval\(secs => \$1\)/);
    assert.deepEqual(lease.params, [engine.LEASE_SEC, 77]);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].init.body, row.raw_body);
    assert.deepEqual(verified(f.calls[0]), { ok: true });
    assert.deepEqual(recorded()[0].params, [8, 200, null, 'success', true, null, 77]);
    assert.equal(r.delivery_status, 'success'); assert.equal(r.attempts, 8);
  });
  test('a transient failure past the schedule stays failed; with attempts left it re-enters the schedule', async () => {
    engine.configure({ fetch: stubFetch([response(503)]) });
    let r = await engine.retryDelivery(row, ACTIVE);
    assert.equal(r.delivery_status, 'failed'); assert.equal(r.next_attempt_at, null);
    engine.configure({ fetch: stubFetch([response(503)]) });
    r = await engine.retryDelivery({ ...row, attempts: 1 }, ACTIVE);
    assert.equal(r.delivery_status, 'pending');
    assert.ok(secondsFromNow(r.next_attempt_at) > 295, 'attempt 2 → +5 min');
  });
});

describe('dispatchContactCreated / dispatchContactUpdated (kunde.angelegt / kunde.aktualisiert)', () => {
  const CONTACT = { id: 60, workspace_id: 7, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact',
    onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, rechtsform: 'GmbH', ust_id: null, handelsregisternummer: null, webseite: null, quelle: 'Empfehlung',
    strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden', created_at: '2026-10-09T08:00:00.000Z', updated_at: '2026-10-09T09:00:00.000Z' };
  beforeEach(() => { state.contact = { ...CONTACT }; });

  test('created: the envelope with the master data + erstellt_am, signed, logged against the contact; no trigger stage needed', async () => {
    state.settings = { ...ACTIVE, trigger_stage_ids: [] };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContactCreated({ workspaceId: 7, contactId: 60 });
    assert.equal(f.calls.length, 1);
    const p = JSON.parse(f.calls[0].init.body);
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(p.event, 'kunde.angelegt'); assert.equal(p.kunde_id, 60);
    assert.deepEqual(p.daten, {
      firma: 'Muster GmbH', ansprechpartner: 'Erika Muster', email: 'erika@muster.de', telefon: '+49 30 1', kontakt_typ: 'contact',
      adresse: { strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden' }, rechtsform: 'GmbH', ust_id: null, handelsregisternummer: null, webseite: null, quelle: 'Empfehlung',
      erstellt_am: '2026-10-09T08:00:00.000Z',
    });
    assert.equal('onboarding_status' in p.daten, false, 'the Engine\'s own fields are not echoed back');
    assert.equal(f.calls[0].init.headers['X-Upgrads-Event'], 'kunde.angelegt');
    assert.deepEqual(verified(f.calls[0]), { ok: true });
    assert.deepEqual(inserts()[0].params.slice(0, 6), [7, 'kunde.angelegt', p.event_id, null, 60, ACTIVE.engine_url]);
    assert.deepEqual(state.calls.find(c => /^SELECT id, workspace_id, name/.test(c.sql)).params, [60, 7]);
    assert.equal(r.delivery_status, 'success');
  });
  test('updated: geaendert (a copy) and aktualisiert_am; an empty change list sends nothing and runs no query', async () => {
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const changed = ['email', 'telefon'];
    await engine.dispatchContactUpdated({ workspaceId: 7, contactId: 60, changed });
    const p = JSON.parse(f.calls[0].init.body);
    assert.equal(p.event, 'kunde.aktualisiert');
    assert.deepEqual(Object.keys(p.daten).slice(-2), ['geaendert', 'aktualisiert_am']);
    assert.deepEqual(p.daten.geaendert, ['email', 'telefon']); assert.notEqual(p.daten.geaendert, changed);
    assert.equal(p.daten.aktualisiert_am, '2026-10-09T09:00:00.000Z');
    state.calls.length = 0;
    assert.equal(await engine.dispatchContactUpdated({ workspaceId: 7, contactId: 60, changed: [] }), null);
    assert.equal(await engine.dispatchContactUpdated({ workspaceId: 7, contactId: 60 }), null);
    assert.equal(state.calls.length, 0);
    assert.equal(f.calls.length, 1);
  });
  test('silence for: a supplier, a missing contact, another workspace, an inactive integration, a bad id, an unknown event', async () => {
    const f = stubFetch([response(200), response(200), response(200), response(200), response(200), response(200)]); engine.configure({ fetch: f });
    state.contact = { ...CONTACT, contact_type: 'supplier' };
    assert.equal(await engine.dispatchContactCreated({ workspaceId: 7, contactId: 60 }), null);
    state.contact = null;
    assert.equal(await engine.dispatchContactCreated({ workspaceId: 7, contactId: 60 }), null);
    state.contact = { ...CONTACT };
    state.settings = { ...ACTIVE, active: false };
    assert.equal(await engine.dispatchContactCreated({ workspaceId: 7, contactId: 60 }), null);
    state.settings = { ...ACTIVE };
    assert.equal(await engine.dispatchContactCreated({ workspaceId: 7, contactId: 'abc' }), null);
    assert.equal(await engine.dispatchContactCreated({ workspaceId: 7, contactId: 0 }), null);
    assert.equal(await engine.dispatchContactEvent({ workspaceId: 7, contactId: 60, event: 'kunde.geloescht' }), null);
    assert.equal(f.calls.length, 0); assert.equal(inserts().length, 0);
  });
  test('a transient failure follows the same retry bookkeeping as the contract event', async () => {
    engine.configure({ fetch: stubFetch([response(503)]) });
    const r = await engine.dispatchContactCreated({ workspaceId: 7, contactId: 60 });
    assert.equal(r.delivery_status, 'pending'); assert.equal(r.attempts, 1);
    assert.ok(secondsFromNow(r.next_attempt_at) > 55);
  });
});

describe('dokument_url on vertrag.unterschrieben (the newest contract document, this deal\'s preferred)', () => {
  test('with a base URL and a vertrag document: absolute Engine download URL; the lookup is scoped and ranks this deal first', async () => {
    state.vertragDoc = { id: 9 };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    await engine.dispatchContractSigned({ ...args, baseUrl: 'https://crm.example/' });
    assert.equal(JSON.parse(f.calls[0].init.body).daten.dokument_url, 'https://crm.example/api/dokumente/9/download');
    const q = state.calls.find(c => c.sql.includes('FROM contact_documents'));
    assert.deepEqual(q.params, [7, 42, 17]);
    assert.match(q.sql, /typ='vertrag'/); assert.match(q.sql, /ORDER BY \(deal_id = \$3\) DESC NULLS LAST, created_at DESC LIMIT 1/);
  });
  test('no document → null; no base URL → null and no lookup at all', async () => {
    let f = stubFetch([response(200)]); engine.configure({ fetch: f });
    await engine.dispatchContractSigned({ ...args, baseUrl: 'https://crm.example' });
    assert.equal(JSON.parse(f.calls[0].init.body).daten.dokument_url, null);
    state.calls.length = 0; state.vertragDoc = { id: 9 };
    f = stubFetch([response(200)]); engine.configure({ fetch: f });
    await engine.dispatchContractSigned(args);
    assert.equal(JSON.parse(f.calls[0].init.body).daten.dokument_url, null);
    assert.equal(state.calls.some(c => c.sql.includes('FROM contact_documents')), false);
  });
});

describe('dispatchDocumentAdded (dokument.hinzugefuegt)', () => {
  const ROW = { id: 9, contact_id: 60, deal_id: 17, typ: 'vertrag', file_name: 'Vertrag.pdf', file_type: 'application/pdf', file_size: 13, created_at: '2026-10-09T10:00:00.000Z', contact_type: 'contact' };
  test('envelope + §5.2 view + vertrag_id, logged against the contact and the deal, signed', async () => {
    state.docRow = { ...ROW };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 9, baseUrl: 'https://crm.example' });
    const p = JSON.parse(f.calls[0].init.body);
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(p.event, 'dokument.hinzugefuegt'); assert.equal(p.kunde_id, 60);
    assert.deepEqual(p.daten, { id: 9, typ: 'vertrag', dateiname: 'Vertrag.pdf', mimetype: 'application/pdf', groesse: 13, erstellt_am: '2026-10-09T10:00:00.000Z', download_url: 'https://crm.example/api/dokumente/9/download', vertrag_id: 17 });
    assert.equal(f.calls[0].init.headers['X-Upgrads-Event'], 'dokument.hinzugefuegt');
    assert.deepEqual(verified(f.calls[0]), { ok: true });
    assert.deepEqual(inserts()[0].params.slice(0, 6), [7, 'dokument.hinzugefuegt', p.event_id, 17, 60, ACTIVE.engine_url]);
    assert.deepEqual(state.calls.find(c => /FROM contact_documents d/.test(c.sql)).params, [9, 7]);
    assert.equal(r.delivery_status, 'success');
  });
  test('without a deal link vertrag_id is null and the log has no deal; without a base URL download_url is null', async () => {
    state.docRow = { ...ROW, deal_id: null };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 9 });
    const p = JSON.parse(f.calls[0].init.body);
    assert.equal(p.daten.vertrag_id, null); assert.equal(p.daten.download_url, null);
    assert.equal(inserts()[0].params[3], null);
  });
  test('silence for a supplier\'s document, a missing document, an inactive integration, a bad id', async () => {
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    state.docRow = { ...ROW, contact_type: 'supplier' };
    assert.equal(await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 9, baseUrl: 'x' }), null);
    state.docRow = null;
    assert.equal(await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 9, baseUrl: 'x' }), null);
    state.docRow = { ...ROW }; state.settings = { ...ACTIVE, active: false };
    assert.equal(await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 9, baseUrl: 'x' }), null);
    state.settings = { ...ACTIVE };
    assert.equal(await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 'x', baseUrl: 'x' }), null);
    assert.equal(f.calls.length, 0); assert.equal(inserts().length, 0);
  });
});

describe('the platform switch webhooks_enabled (utils/engine-controls.js)', () => {
  const postponed = () => updates().filter(c => /SET last_error=\$1, next_attempt_at = NOW\(\) \+ make_interval\(secs => \$2\)/.test(c.sql));
  test('off: a contract event is recorded, then QUEUED (postponed an hour with the reason) — no HTTP, attempts untouched', async () => {
    state.controlsRow = { webhooks_enabled: false };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const r = await engine.dispatchContractSigned(args);
    assert.equal(f.calls.length, 0);
    assert.equal(inserts().length, 1, 'the event is kept');
    assert.deepEqual(postponed()[0].params, [engine.WEBHOOKS_DISABLED_ERROR, engine.POSTPONE_SEC, 101]);
    assert.equal(recorded().length, 0, 'no attempt consumed');
    assert.deepEqual(r, { id: 101, ok: false, postponed: true, error: engine.WEBHOOKS_DISABLED_ERROR, delivery_status: 'pending' });
    assert.match(engine.WEBHOOKS_DISABLED_ERROR, /platform administrator/);
  });
  test('off: contact and document events are queued the same way; the worker postpones claimed rows without a request', async () => {
    state.controlsRow = { webhooks_enabled: false };
    const f = stubFetch([response(200), response(200), response(200)]); engine.configure({ fetch: f });
    state.contact = { id: 60, workspace_id: 7, name: 'E', contact_type: 'contact' };
    await engine.dispatchContactCreated({ workspaceId: 7, contactId: 60 });
    state.docRow = { id: 9, contact_id: 60, deal_id: null, typ: 'vertrag', file_name: 'a.pdf', file_type: 'application/pdf', file_size: 1, created_at: 'c', contact_type: 'contact' };
    await engine.dispatchDocumentAdded({ workspaceId: 7, documentId: 9, baseUrl: 'https://x' });
    state.claimed = [{ id: 501, workspace_id: 7, event: 'vertrag.unterschrieben', raw_body: '{}', attempts: 1, url: ACTIVE.engine_url, secret: SECRET, active: true }];
    const results = await engine.runDue();
    assert.equal(f.calls.length, 0);
    assert.equal(postponed().length, 3);
    assert.ok(results[0].postponed && results[0].delivery_status === 'pending');
  });
  test('off: a test ping is refused outright (failed with the reason), not queued', async () => {
    state.controlsRow = { webhooks_enabled: false };
    const f = stubFetch([response(200)]); engine.configure({ fetch: f });
    const r = await engine.sendTestEvent(7);
    assert.equal(f.calls.length, 0);
    assert.equal(r.delivery_status, 'failed'); assert.equal(r.error, engine.WEBHOOKS_DISABLED_ERROR);
    assert.match(updates()[0].sql, /status='failed'/);
  });
  test('on again (cache reset): the same event goes out; a failing switch read means enabled', async () => {
    state.controlsRow = { webhooks_enabled: true };
    let f = stubFetch([response(200)]); engine.configure({ fetch: f });
    assert.equal((await engine.dispatchContractSigned(args)).delivery_status, 'success');
    assert.equal(f.calls.length, 1);
    assert.equal(await engine.webhooksEnabled(), true);
  });
});

describe('sendTestEvent', () => {
  test('sends test.ping once in the same envelope; a failure is final (never handed to the worker)', async () => {
    const f = stubFetch([response(500, 'nope'), response(200)]); engine.configure({ fetch: f });
    const r = await engine.sendTestEvent(7);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].init.headers['X-Upgrads-Event'], 'test.ping');
    assert.deepEqual(verified(f.calls[0]), { ok: true });
    const payload = JSON.parse(f.calls[0].init.body);
    assert.deepEqual(Object.keys(payload), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(payload.kunde_id, null);
    assert.deepEqual(payload.daten, { workspace_id: 7 });
    assert.equal(inserts()[0].params[1], 'test.ping');
    assert.deepEqual(recorded()[0].params.slice(3, 6), ['failed', false, null], 'failed, nothing scheduled');
    assert.equal(r.ok, false); assert.equal(r.status, 500); assert.equal(r.delivery_status, 'failed');
  });
  test('does not require the integration to be active, but does require a URL', async () => {
    state.settings = { ...ACTIVE, active: false };
    engine.configure({ fetch: stubFetch([response(200)]) });
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
    await new Promise(r => setImmediate(r));
    assert.equal(f.calls.length, 1, 'request is in flight');
    setTimeout(() => release(), 5);
    await engine.drain();
    assert.equal(recorded().at(-1).params[3], 'success');
  });
});
