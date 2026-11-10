// ROUTE tests for fonio's result link (routes/fonio.js POST /receive/:token, FONIO_CHANGES Part 7, 2026-11-09). fonio's
// API cannot fetch a call or its transcript, so fonio sends them itself after each call to the workspace's secret link
// (an HTTP Request in fonio, Run "After the conversation"). The CRM finds the call it belongs to and writes one note on
// the call's deal and contact (source 'fonio', no author). Served the way server.js serves it (raw bytes, 1 MB) over
// a stateful fake pool. Pinned: the link alone decides the workspace; a call is found by crm_call_id, else by number
// (the newest sent call without a result in the last six hours), never another workspace's; one note per call and per
// conversation however often fonio delivers; inbound calls, unknown calls and calls whose contact and deal are gone are
// acknowledged and ignored; a body that is not JSON is a 400; every delivery is remembered without its values; the
// link and the last delivery reach owners and admins only; the wiring in server.js and db.js.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const { loadRoute, ROOT } = require('../helpers/load-route');

const WS = 7, OTHER_WS = 8;
const TOKEN = 'ab'.repeat(32), OTHER_TOKEN = 'cd'.repeat(32);
const OWN = '+4930123456';
const NOW = Date.now();
const ago = min => new Date(NOW - min * 60000).toISOString();

const state = {};
function reset() {
  Object.assign(state, {
    calls: [], nextActivity: 500,
    conns: [
      { workspace_id: WS, from_number: OWN, receive_token: TOKEN, last_delivery: null },
      { workspace_id: OTHER_WS, from_number: '+4940999999', receive_token: OTHER_TOKEN, last_delivery: null },
    ],
    fonioCalls: [
      { id: 11, workspace_id: WS, contact_id: 5, deal_id: 12, status: 'sent', to_number: '+491711234567', sent_at: ago(400), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 12, workspace_id: WS, contact_id: 5, deal_id: 13, status: 'sent', to_number: '+491711234567', sent_at: ago(3), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 13, workspace_id: WS, contact_id: 6, deal_id: 14, status: 'failed', to_number: '+491722222222', sent_at: null, result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 14, workspace_id: WS, contact_id: null, deal_id: null, status: 'sent', to_number: '+491733333333', sent_at: ago(2), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 21, workspace_id: OTHER_WS, contact_id: 30, deal_id: 31, status: 'sent', to_number: '+491744444444', sent_at: ago(1), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
    ],
    activities: [],
  });
}
const callOf = id => state.fonioCalls.find(c => c.id === id);
const fields = c => ({ id: c.id, contact_id: c.contact_id, deal_id: c.deal_id, result_at: c.result_at, note_activity_id: c.note_activity_id });

const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (q === 'SELECT workspace_id, from_number FROM workspace_fonio WHERE receive_token = $1') {
      const c = state.conns.find(x => x.receive_token === params[0]);
      return { rows: c ? [{ workspace_id: c.workspace_id, from_number: c.from_number }] : [] };
    }
    if (q === 'UPDATE workspace_fonio SET last_delivery = $2::jsonb WHERE workspace_id = $1') {
      state.conns.find(x => x.workspace_id === params[0]).last_delivery = JSON.parse(params[1]);
      return { rows: [], rowCount: 1 };
    }
    if (q === 'SELECT id, note_activity_id FROM fonio_calls WHERE workspace_id = $1 AND conversation_id = $2') {
      const c = state.fonioCalls.find(x => x.workspace_id === params[0] && x.conversation_id === params[1]);
      return { rows: c ? [{ id: c.id, note_activity_id: c.note_activity_id }] : [] };
    }
    if (q === "SELECT id, contact_id, deal_id, result_at, note_activity_id FROM fonio_calls WHERE id = $1 AND workspace_id = $2 AND status = 'sent'") {
      const c = state.fonioCalls.find(x => x.id === params[0] && x.workspace_id === params[1] && x.status === 'sent');
      return { rows: c ? [fields(c)] : [] };
    }
    if (q === "SELECT id, contact_id, deal_id, result_at, note_activity_id FROM fonio_calls WHERE workspace_id = $1 AND status = 'sent' AND result_at IS NULL AND to_number = ANY($2::text[]) AND sent_at > $3 ORDER BY sent_at DESC, id DESC LIMIT 1") {
      const since = new Date(params[2]).getTime();
      const c = state.fonioCalls
        .filter(x => x.workspace_id === params[0] && x.status === 'sent' && !x.result_at && params[1].includes(x.to_number) && x.sent_at && new Date(x.sent_at).getTime() > since)
        .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at) || b.id - a.id)[0];
      return { rows: c ? [fields(c)] : [] };
    }
    if (q === "WITH claim AS ( UPDATE fonio_calls SET result_at = NOW(), conversation_id = $2, conversation_link = $3, updated_at = NOW() WHERE id = $1 AND result_at IS NULL RETURNING workspace_id, contact_id, deal_id ) INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) SELECT workspace_id, contact_id, deal_id, 'note', $4::text, NULL, 'fonio' FROM claim RETURNING id") {
      const c = state.fonioCalls.find(x => x.id === params[0] && !x.result_at);
      if (!c) return { rows: [] };
      if (params[1] != null && state.fonioCalls.some(x => x !== c && x.workspace_id === c.workspace_id && x.conversation_id === params[1])) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "fonio_calls_one_conversation"'), { code: '23505' });
      }
      Object.assign(c, { result_at: new Date().toISOString(), conversation_id: params[1], conversation_link: params[2] });
      const a = { id: state.nextActivity++, workspace_id: c.workspace_id, contact_id: c.contact_id, deal_id: c.deal_id, type: 'note', content: params[3], created_by: null, source: 'fonio' };
      state.activities.push(a);
      return { rows: [{ id: a.id }] };
    }
    if (q === 'UPDATE fonio_calls SET note_activity_id = $1 WHERE id = $2') { callOf(params[1]).note_activity_id = params[0]; return { rows: [] }; }
    if (/FROM workspace_fonio f LEFT JOIN users u/.test(q)) {
      const c = state.conns.find(x => x.workspace_id === params[0]);
      return { rows: c ? [{ from_number: c.from_number, active: true, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true, country_code: '+49',
        number_prefixes: [], hours_on: true, hours_days: [1, 2, 3, 4, 5], hours_from: '09:00:00', hours_to: '18:00:00', hours_tz: 'Europe/Berlin',
        key_hint: 'wxyz', receive_token: c.receive_token, last_delivery: c.last_delivery, saved_by: 1, saved_at: '2026-11-09T09:00:00.000Z', saved_by_name: 'Olaf Owner' }] : [] };
    }
    throw new Error('unexpected query: ' + q);
  },
};

let base, server;
const envSaved = {};
function app(user) {
  const a = express();
  a.use('/api/integrations/fonio/receive', express.raw({ type: '*/*', limit: '1mb' }));   // as server.js
  a.use(express.json());
  a.use('/api/integrations/fonio', loadRoute('fonio.js', { pool, user }));
  a.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  return a;
}
let memberBase, memberServer;
before(async () => {
  for (const k of ['APP_BASE_URL', 'BASE_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  server = await new Promise(resolve => { const s = app({ id: 1, workspaceId: WS, role: 'owner' }).listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  memberServer = await new Promise(resolve => { const s = app({ id: 3, workspaceId: WS, role: 'member' }).listen(0, '127.0.0.1', () => resolve(s)); });
  memberBase = `http://127.0.0.1:${memberServer.address().port}`;
});
after(async () => {
  for (const s of [server, memberServer]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)); }
  for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; }
});
beforeEach(reset);

// fonio's delivery: a POST with the Body as written in fonio (an object, or raw text as fonio may send it).
const post = async (token, body, { type = 'application/json', at = base } = {}) => {
  const r = await fetch(`${at}/api/integrations/fonio/receive/${token}`, { method: 'POST', headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const RESULT = { crm_call_id: '12', conversation_id: 'conv-1', conversation_link: 'https://app.fonio.ai/conversations/conv-1', direction: 'outbound',
  duration: '125', summary: 'Termin am Freitag vereinbart.', transcript: 'Agent: Guten Tag\nKunde: Hallo', person_number: '+491711234567', agent_number: OWN };
const notes = () => state.activities;
const lastDelivery = (ws = WS) => state.conns.find(c => c.workspace_id === ws).last_delivery;

describe('a finished call', () => {
  test("the note lands on the call's deal and contact, as fonio's, in this workspace", async () => {
    const r = await post(TOKEN, RESULT);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, already: false, call_id: 12, activity_id: 500 });
    assert.equal(notes().length, 1);
    const n = notes()[0];
    assert.deepEqual({ ws: n.workspace_id, contact: n.contact_id, deal: n.deal_id, type: n.type, by: n.created_by, source: n.source }, { ws: WS, contact: 5, deal: 13, type: 'note', by: null, source: 'fonio' });
    assert.equal(n.content, 'fonio-Anruf · Dauer 125\n\nZusammenfassung\nTermin am Freitag vereinbart.\n\nTranskript\nAgent: Guten Tag\nKunde: Hallo\n\nGespräch in fonio: https://app.fonio.ai/conversations/conv-1');
    assert.equal(callOf(12).conversation_id, 'conv-1');
    assert.equal(callOf(12).conversation_link, 'https://app.fonio.ai/conversations/conv-1');
    assert.equal(callOf(12).note_activity_id, 500);
    assert.ok(callOf(12).result_at);
    assert.equal(callOf(11).result_at, null, 'the older call to the same number is untouched');
  });
  test('the delivery is remembered: when, the outcome, the call, the field names — never the values', async () => {
    await post(TOKEN, RESULT);
    const d = lastDelivery();
    assert.deepEqual({ outcome: d.outcome, call: d.call_id, fields: d.fields }, { outcome: 'noted', call: 12, fields: Object.keys(RESULT) });
    assert.ok(!Number.isNaN(Date.parse(d.at)));
    assert.doesNotMatch(JSON.stringify(d), /Termin|Guten Tag|\+49171/);
    assert.equal(lastDelivery(OTHER_WS), null);
  });
  test('without a filled crm_call_id the call is found by number: the newest sent call without a result', async () => {
    const r = await post(TOKEN, { conversationId: 'c-2', from: '+491711234567', to: OWN, crm_call_id: '{{crm_call_id}}', summary: 'S' });
    assert.equal(r.body.call_id, 12);
    const again = await post(TOKEN, { conversationId: 'c-3', from: '+491711234567', to: OWN, summary: 'S' });
    assert.deepEqual(again.body, { ignored: true, reason: 'no_match' }, 'the call 6+ hours ago is too old to be this one');
    assert.equal(notes().length, 1);
  });
  test('the number match covers six hours, not more', async () => {
    callOf(12).sent_at = ago(6 * 60 - 1);
    assert.equal((await post(TOKEN, { from: '+491711234567', summary: 'S' })).body.call_id, 12);
    reset(); callOf(12).sent_at = ago(6 * 60 + 1);
    assert.deepEqual((await post(TOKEN, { from: '+491711234567', summary: 'S' })).body, { ignored: true, reason: 'no_match' });
  });
  test('a raw transcript with line breaks inside the JSON string, sent as text, is still written', async () => {
    const raw = `{"crm_call_id": "12", "transcript": "Agent: Guten Tag\nKunde: Hallo"}`;
    const r = await post(TOKEN, raw, { type: 'text/plain' });
    assert.equal(r.status, 200);
    assert.ok(notes()[0].content.includes('Transkript\nAgent: Guten Tag\nKunde: Hallo'));
  });
});

describe('never twice', () => {
  test('fonio delivering the same result again: acknowledged, no second note', async () => {
    await post(TOKEN, RESULT);
    const r = await post(TOKEN, RESULT);
    assert.deepEqual(r.body, { success: true, already: true, call_id: 12, activity_id: 500 });
    assert.equal(notes().length, 1);
    assert.equal(lastDelivery().outcome, 'already');
  });
  test('the same call again under another conversation id: still one note per call', async () => {
    await post(TOKEN, RESULT);
    const r = await post(TOKEN, { ...RESULT, conversation_id: 'conv-other' });
    assert.deepEqual(r.body, { success: true, already: true, call_id: 12, activity_id: 500 }, 'recognised before any claim, with its note');
    assert.equal(callOf(12).conversation_id, 'conv-1');
    assert.equal(notes().length, 1);
  });
  test('the same conversation matched by number to an older call: refused by the conversation, no second note', async () => {
    callOf(11).sent_at = ago(30);
    const body = { conversation_id: 'conv-9', from: '+491711234567', summary: 'S' };
    assert.equal((await post(TOKEN, body)).body.call_id, 12);
    const r = await post(TOKEN, body);
    assert.deepEqual(r.body, { success: true, already: true, call_id: 12, activity_id: 500 });
    assert.equal(callOf(11).result_at, null);
    assert.equal(notes().length, 1);
  });
  test('two deliveries of one conversation at once, matched to different calls: the unique index lets one through', async () => {
    callOf(11).sent_at = ago(30);
    Object.assign(callOf(11), { conversation_id: 'conv-race', result_at: ago(0) });   // the other delivery's claim landed first
    const orig = pool.query;
    let first = true;
    pool.query = async (sql, params) => {   // the dedupe read runs before that claim committed
      if (first && /AND conversation_id = \$2$/.test(String(sql).replace(/\s+/g, ' ').trim())) { first = false; return { rows: [] }; }
      return orig(sql, params);
    };
    try {
      const r = await post(TOKEN, { conversation_id: 'conv-race', from: '+491711234567', summary: 'S' });
      assert.equal(r.status, 200);
      assert.equal(r.body.already, true);
      assert.equal(notes().length, 0);
      assert.equal(callOf(12).result_at, null, 'the losing claim wrote nothing');
    } finally { pool.query = orig; }
  });
});

describe('acknowledged and ignored', () => {
  test('an inbound call to the same assistant: no note, fonio told 200', async () => {
    const r = await post(TOKEN, { ...RESULT, direction: 'inbound' });
    assert.deepEqual(r.body, { ignored: true, reason: 'inbound' });
    assert.equal(notes().length, 0);
    assert.equal(callOf(12).result_at, null);
    assert.equal(lastDelivery().outcome, 'inbound');
  });
  test("another workspace's call is never matched, by id or by number", async () => {
    assert.deepEqual((await post(TOKEN, { crm_call_id: '21', from: '+491744444444', summary: 'S' })).body, { ignored: true, reason: 'no_match' });
    assert.equal(callOf(21).result_at, null);
    assert.equal(notes().length, 0);
  });
  test('a call that was not sent (failed) is not matched', async () => {
    assert.deepEqual((await post(TOKEN, { crm_call_id: '13', from: '+491722222222' })).body, { ignored: true, reason: 'no_match' });
  });
  test("a call whose contact and deal were deleted: nothing written", async () => {
    assert.deepEqual((await post(TOKEN, { crm_call_id: '14', summary: 'S' })).body, { ignored: true, reason: 'gone' });
    assert.equal(notes().length, 0);
    assert.equal(callOf(14).result_at, null);
  });
  test('a body with nothing to match: ignored', async () => {
    assert.deepEqual((await post(TOKEN, {})).body, { ignored: true, reason: 'no_match' });
  });
});

describe('refused', () => {
  test('an unknown or malformed link is a 404 and writes nothing; a malformed one never reaches the database', async () => {
    for (const t of ['AB'.repeat(32), 'ab'.repeat(31), `${'ab'.repeat(31)}g1`, `${TOKEN}0`]) {
      assert.equal((await post(t, RESULT)).status, 404, t);
    }
    assert.equal(state.calls.length, 0);
    assert.equal((await post('ef'.repeat(32), RESULT)).status, 404);
    assert.deepEqual(state.calls.map(c => c.sql), ['SELECT workspace_id, from_number FROM workspace_fonio WHERE receive_token = $1']);
    assert.equal(notes().length, 0);
  });
  test('a body that is not JSON: 400, remembered as such', async () => {
    const r = await post(TOKEN, 'summary=Hallo', { type: 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'Body is not JSON' });
    assert.deepEqual({ outcome: lastDelivery().outcome, fields: lastDelivery().fields }, { outcome: 'bad_json', fields: [] });
    assert.equal(notes().length, 0);
  });
  test("the other workspace's link writes into the other workspace only", async () => {
    const r = await post(OTHER_TOKEN, { crm_call_id: '21', summary: 'S' });
    assert.equal(r.body.call_id, 21);
    assert.equal(notes()[0].workspace_id, OTHER_WS);
    assert.equal(lastDelivery(WS), null);
  });
});

describe('the settings answer', () => {
  test('owners and admins get the link and the last delivery', async () => {
    await post(TOKEN, RESULT);
    const r = await (await fetch(`${base}/api/integrations/fonio`)).json();
    assert.equal(r.settings.receive_url, `${base}/api/integrations/fonio/receive/${TOKEN}`);
    assert.equal(r.settings.last_delivery.outcome, 'noted');
  });
  test('a member gets neither', async () => {
    const r = await (await fetch(`${memberBase}/api/integrations/fonio`)).json();
    assert.equal(r.configured, true);
    assert.equal('receive_url' in r.settings, false);
    assert.equal('last_delivery' in r.settings, false);
    assert.equal('key_hint' in r.settings, false);
  });
});

describe('the wiring', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  test('server.js: raw bytes up to 1 MB on the link, before json(); the webhook limits before the route', () => {
    const s = read('server.js');
    const iRaw = s.indexOf("app.use('/api/integrations/fonio/receive', express.raw({ type: '*/*', limit: '1mb' }));");
    const iJson = s.indexOf('app.use(express.json());');
    const iLimit = s.indexOf("app.use('/api/integrations/fonio/receive', webhookIpLimiter, fonioLinkLimiter);");
    const iRoute = s.indexOf("app.use('/api/integrations/fonio', require('./routes/fonio'));");
    assert.ok(iRaw > 0 && iRaw < iJson, 'raw before json');
    assert.ok(iLimit > 0 && iLimit < iRoute, 'limits before the route');
    assert.match(s, /const fonioLinkLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000, max: 60,[\s\S]*?keyGenerator: \(req\) => req\.path \|\| 'unknown',\s*\}\);/);
  });
  test('db.js: the link for every row, the last delivery, the result columns, one note per conversation, fonio as a source', () => {
    const db = read('db.js');
    assert.match(db, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS receive_token TEXT NOT NULL UNIQUE DEFAULT replace\(gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text, '-', ''\)/);
    assert.match(db, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS last_delivery JSONB/);
    for (const col of ['result_at\\s+TIMESTAMPTZ', 'conversation_id\\s+TEXT', 'conversation_link TEXT', 'note_activity_id\\s+INTEGER REFERENCES activities\\(id\\) ON DELETE SET NULL']) {
      assert.match(db, new RegExp(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS ${col}`), col);
    }
    assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS fonio_calls_one_conversation ON fonio_calls \(workspace_id, conversation_id\) WHERE conversation_id IS NOT NULL/);
    assert.ok(db.indexOf('ADD COLUMN IF NOT EXISTS receive_token') > db.indexOf('CREATE TABLE IF NOT EXISTS workspace_fonio'));
    assert.ok(db.indexOf('ADD COLUMN IF NOT EXISTS result_at') > db.indexOf('CREATE TABLE IF NOT EXISTS fonio_calls'));
    assert.match(db, /ADD CONSTRAINT activities_source_check CHECK\(source IN \('user','engine','calcom','notetaker','fonio'\)\)/);
  });
});
