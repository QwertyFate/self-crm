// ROUTE tests: /api/journey/fixed — the workflows of the integrations (CUSTOMER_JOURNEY_CHANGES Part 8, 2026-11-19).
//
// What fonio, the lead webhooks, the Upgrads Engine, Cal.com and Calendly do stands on the Workflows page as
// workflows nobody edits there; the switch of one is the integration's own switch.
//
// Pinned: everyone in the workspace reads them and never another workspace's; nothing secret is in the answer; only
// owners and admins switch; a switch changes the integration's own setting in the caller's workspace and the answer
// shows it; fonio's triggers cannot be switched on while fonio itself is off; Cal.com and Calendly have no switch;
// every refusal carries a code and writes nothing; who and where come from the session.
//
// The real utils/journey-fixed.js runs here over a stand-in database that keeps the five tables it reads. That the
// integrations' own pages then show the same is checked on a real database (the log names the run).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const WS = 7, OTHER = 8;
const fresh = () => ({
  fonio: [{ workspace_id: WS, active: true, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true, hours_on: true, hours_days: [1, 2, 3, 4, 5], hours_from: '09:00:00', hours_to: '18:00:00',
    follow_up: { enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, callback: true }, book_meetings: true, only_webhooks: null, only_pipelines: null, stage_rules: {},
    api_key_sealed: 'sealed-fonio-key', key_hint: 'k3y9', from_number: '+4930123456', receive_token: 'fonio-receive-token', saved_by: 1 }],
  webhooks: [
    { id: 5, workspace_id: WS, name: 'Website form', active: true, create_deal: true, pipeline_id: 3, stage_id: 31, default_assignee_id: 3, webhook_key: 'secret-key-5' },
    { id: 6, workspace_id: WS, name: 'Meta Ads', active: false, create_deal: false, pipeline_id: null, stage_id: null, default_assignee_id: null, webhook_key: 'secret-key-6' },
    { id: 9, workspace_id: OTHER, name: 'Theirs', active: true, create_deal: true, pipeline_id: 90, stage_id: 91, default_assignee_id: null, webhook_key: 'secret-key-9' },
  ],
  engine: [{ workspace_id: WS, engine_url: 'https://engine.example.de/hook', active: true, trigger_stage_ids: [32], webhook_secret: 'engine-secret' },
    { workspace_id: OTHER, engine_url: null, active: false, trigger_stage_ids: [], webhook_secret: 'their-secret' }],
  calcom: [{ workspace_id: WS, existing_contacts_only: false, api_key_sealed: 'sealed-cal-key', receive_token: 'cal-receive-token' }],
  calendly: [],
});
const MEMBERS = { 3: { name: 'Mia', ws: [WS] } };
let db = fresh(), calls = [];
const run = async (sql, p = []) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  calls.push({ sql: t, params: p });
  const own = (list, wid) => list.filter(r => r.workspace_id === wid);
  if (t.startsWith('SELECT active, delay_minutes, on_deal_manual, on_deal_webhook, hours_on, hours_days, hours_from, hours_to, follow_up, book_meetings, only_webhooks, only_pipelines, stage_rules FROM workspace_fonio WHERE workspace_id = $1')) {
    return { rows: own(db.fonio, p[0]).map(({ api_key_sealed, key_hint, from_number, receive_token, saved_by, workspace_id, ...shown }) => shown) };
  }
  if (t.startsWith('SELECT w.id, w.name, w.active, w.create_deal, w.pipeline_id, w.stage_id, u.name AS assignee_name FROM workspace_webhook w LEFT JOIN users u')) {
    return { rows: own(db.webhooks, p[0]).sort((a, b) => a.id - b.id).map(w => ({ id: w.id, name: w.name, active: w.active, create_deal: w.create_deal, pipeline_id: w.pipeline_id, stage_id: w.stage_id,
      assignee_name: MEMBERS[w.default_assignee_id]?.ws.includes(w.workspace_id) ? MEMBERS[w.default_assignee_id].name : null })) };
  }
  if (t === 'SELECT engine_url, active, trigger_stage_ids FROM workspace_engine WHERE workspace_id = $1') return { rows: own(db.engine, p[0]).map(e => ({ engine_url: e.engine_url, active: e.active, trigger_stage_ids: e.trigger_stage_ids })) };
  if (t === 'SELECT existing_contacts_only FROM workspace_calcom WHERE workspace_id = $1') return { rows: own(db.calcom, p[0]).map(c => ({ existing_contacts_only: c.existing_contacts_only })) };
  if (t === 'SELECT existing_contacts_only FROM workspace_calendly WHERE workspace_id = $1') return { rows: own(db.calendly, p[0]).map(c => ({ existing_contacts_only: c.existing_contacts_only })) };
  if (t === 'SELECT active FROM workspace_fonio WHERE workspace_id = $1') return { rows: own(db.fonio, p[0]).map(f => ({ active: f.active })) };
  const trigger = t.match(/^UPDATE workspace_fonio SET (on_deal_webhook|on_deal_manual) = \$2, saved_by = \$3, saved_at = NOW\(\) WHERE workspace_id = \$1 AND \(active OR NOT \$2\)$/);
  if (trigger) {
    const hit = own(db.fonio, p[0]).filter(f => f.active || !p[1]);
    for (const f of hit) { f[trigger[1]] = p[1]; f.saved_by = p[2]; }
    return { rows: [], rowCount: hit.length };
  }
  if (t === 'UPDATE workspace_webhook SET active = $3 WHERE id = $1 AND workspace_id = $2') {
    const hit = db.webhooks.filter(w => w.id === p[0] && w.workspace_id === p[1]);
    for (const w of hit) w.active = p[2];
    return { rows: [], rowCount: hit.length };
  }
  if (t === 'UPDATE workspace_engine SET active = $2, updated_at = NOW() WHERE workspace_id = $1 AND engine_url IS NOT NULL') {
    const hit = own(db.engine, p[0]).filter(e => e.engine_url);
    for (const e of hit) e.active = p[1];
    return { rows: [], rowCount: hit.length };
  }
  throw new Error(`unexpected statement: ${t}`);
};
const pool = { query: run };
const writes = () => calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

let owner, admin, member, other;
before(async () => {
  const as = (id, workspaceId, role) => serve({ '/api/journey/fixed': loadRoute('journey-fixed.js', { pool, user: { id, workspaceId, role } }) });
  owner = await as(1, WS, 'owner'); admin = await as(2, WS, 'admin'); member = await as(3, WS, 'member'); other = await as(9, OTHER, 'owner');
});
after(async () => { for (const s of [owner, admin, member, other]) await s.close(); });
beforeEach(() => { db = fresh(); calls = []; });

const list = (srv = owner) => srv.request('GET', '/api/journey/fixed');
const flip = (key, active, srv = owner) => srv.request('PUT', `/api/journey/fixed/${encodeURIComponent(key)}`, { active });
const byKey = (body, key) => body.fixed.find(f => f.key === key);

describe('the list', () => {
  test('everyone in the workspace reads what its integrations do; whether the caller may switch is said', async () => {
    const o = await list(owner);
    assert.equal(o.status, 200);
    assert.deepEqual(o.body.fixed.map(f => f.key), ['fonio-webhook', 'fonio-manual', 'webhook-5', 'webhook-6', 'engine', 'calcom']);
    assert.equal(o.body.can_manage, true);
    assert.equal((await list(admin)).body.can_manage, true);
    const m = await list(member);
    assert.equal(m.status, 200);
    assert.equal(m.body.can_manage, false);
    assert.deepEqual(m.body.fixed, o.body.fixed, 'a member sees the same workflows');
  });
  test('never another workspace\'s: its lead webhook is not listed, and an Engine without a URL is no workflow', async () => {
    const mine = await list(owner);
    assert.doesNotMatch(JSON.stringify(mine.body), /Theirs|webhook-9/);
    assert.deepEqual((await list(other)).body.fixed.map(f => f.key), ['webhook-9']);
  });
  test('nothing secret is in the answer: no key, no token, no number, no address', async () => {
    for (const srv of [owner, member]) {
      assert.doesNotMatch(JSON.stringify((await list(srv)).body), /secret|sealed|token|k3y9|\+4930|engine\.example/);
    }
  });
  test('reading writes nothing', async () => {
    await list(owner);
    assert.deepEqual(writes(), []);
    assert.ok(calls.every(c => c.params.length === 1 && c.params[0] === WS), 'every question carries the session\'s workspace');
  });
  test('what a workflow says is what the settings say: the assignee by name, the webhook that is off, the meeting at Cal.com', async () => {
    const { body } = await list();
    assert.equal(byKey(body, 'webhook-5').steps.find(s => s.what === 'lead_contact').assignee_name, 'Mia');
    assert.equal(byKey(body, 'webhook-6').active, false);
    assert.equal(byKey(body, 'webhook-6').steps.find(s => s.what === 'lead_deal').off, true);
    assert.equal(byKey(body, 'fonio-webhook').steps.find(s => s.what === 'fonio_meeting').service, 'calcom');
    assert.deepEqual(byKey(body, 'webhook-5').steps.map(s => s.what), ['lead_arrives', 'lead_contact', 'lead_engine', 'lead_deal', 'lead_fonio']);
  });
});

describe('the switch', () => {
  test('a trigger of fonio\'s: off and on again; the answer is every workflow as it is afterwards; the save is signed by the caller', async () => {
    const off = await flip('fonio-webhook', false, admin);
    assert.equal(off.status, 200);
    assert.deepEqual(Object.keys(off.body), ['fixed']);
    assert.equal(byKey(off.body, 'fonio-webhook').active, false);
    assert.equal(byKey(off.body, 'fonio-manual').active, true, 'the other trigger is its own switch');
    assert.equal(db.fonio[0].on_deal_webhook, false);
    assert.equal(db.fonio[0].active, true, 'fonio\'s main switch is not touched');
    assert.equal(db.fonio[0].saved_by, 2);
    assert.equal(byKey(off.body, 'webhook-5').steps.some(s => s.what === 'lead_fonio'), false, 'the lead webhook\'s workflow no longer names the call');
    const on = await flip('fonio-webhook', true);
    assert.equal(byKey(on.body, 'fonio-webhook').active, true);
    assert.equal(db.fonio[0].on_deal_webhook, true);
    assert.equal(db.fonio[0].saved_by, 1);
  });
  test('fonio itself switched off: 409 fonio_off, nothing written; the workflows say why', async () => {
    db.fonio[0].active = false; db.fonio[0].on_deal_manual = false;
    const r = await flip('fonio-manual', true);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'fonio_off');
    assert.deepEqual(writes(), []);
    assert.equal(db.fonio[0].on_deal_manual, false);
    assert.deepEqual((await list()).body.fixed.filter(f => f.source === 'fonio').map(f => [f.active, f.blocked]), [[false, 'fonio_off'], [false, 'fonio_off']]);
  });
  test('a lead webhook: its own switch, by its id in the key', async () => {
    const r = await flip('webhook-6', true);
    assert.equal(r.status, 200);
    assert.equal(byKey(r.body, 'webhook-6').active, true);
    assert.equal(db.webhooks.find(w => w.id === 6).active, true);
    assert.equal(db.webhooks.find(w => w.id === 5).active, true, 'the other one is left alone');
    assert.equal((await flip('webhook-5', false)).status, 200);
    assert.equal(db.webhooks.find(w => w.id === 5).active, false);
  });
  test('a lead webhook of another workspace is not found, and stays as it was', async () => {
    const r = await flip('webhook-9', false);
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 'not_found');
    assert.equal(db.webhooks.find(w => w.id === 9).active, true);
  });
  test('the Engine: its own switch; an Engine without its URL is no workflow and cannot be switched on', async () => {
    const r = await flip('engine', false);
    assert.equal(r.status, 200);
    assert.equal(byKey(r.body, 'engine').active, false);
    assert.equal(db.engine[0].active, false);
    assert.equal(byKey(r.body, 'webhook-5').steps.some(s => s.what === 'lead_engine'), false, 'a lead no longer names the Engine');
    const theirs = await flip('engine', true, other);
    assert.equal(theirs.status, 404);
    assert.equal(db.engine[1].active, false);
  });
  test('Cal.com and Calendly have no switch: 400 no_switch, nothing asked of the database', async () => {
    for (const key of ['calcom', 'calendly']) {
      calls = [];
      const r = await flip(key, false);
      assert.equal(r.status, 400);
      assert.equal(r.body.code, 'no_switch');
      assert.deepEqual(calls, []);
    }
  });
  test('only owners and admins switch: a member gets 403 and nothing is asked of the database', async () => {
    for (const key of ['fonio-webhook', 'webhook-5', 'engine']) {
      calls = [];
      const r = await flip(key, false, member);
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'forbidden');
      assert.deepEqual(calls, []);
    }
    assert.equal(db.fonio[0].on_deal_webhook, true);
    assert.equal(db.webhooks.find(w => w.id === 5).active, true);
    assert.equal(db.engine[0].active, true);
  });
  test('active must be true or false: anything else is refused before the database is asked', async () => {
    for (const active of [undefined, null, 'true', 1, 0, [], {}]) {
      calls = [];
      const r = await owner.request('PUT', '/api/journey/fixed/webhook-5', active === undefined ? {} : { active });
      assert.equal(r.status, 400, JSON.stringify(active));
      assert.equal(r.body.code, 'active');
      assert.deepEqual(calls, []);
    }
  });
  test('a key that is no workflow is not found and writes nothing', async () => {
    for (const key of ['nothing', 'fonio', 'webhook-0', 'webhook-5x', 'constructor', '__proto__', 'webhook-5 OR 1=1']) {
      calls = [];
      const r = await flip(key, true);
      assert.equal(r.status, 404, key);
      assert.equal(r.body.code, 'not_found');
      assert.deepEqual(writes(), []);
    }
  });
  test('who and where come from the session: a workspace named in the body or the address changes nothing', async () => {
    const r = await owner.request('PUT', '/api/journey/fixed/webhook-9?workspace_id=8', { active: false, workspace_id: OTHER, workspaceId: OTHER, user_id: 99 });
    assert.equal(r.status, 404);
    assert.equal(db.webhooks.find(w => w.id === 9).active, true);
    await owner.request('PUT', '/api/journey/fixed/fonio-manual', { active: false, user_id: 99, saved_by: 99 });
    assert.equal(db.fonio[0].saved_by, 1);
  });
});

describe('the route file', () => {
  const route = read('routes/journey-fixed.js'), server = read('server.js');
  test('every address needs a login; the switch asks the role before anything else', () => {
    assert.match(route, /^router\.use\(requireAuth\);$/m);
    const put = route.slice(route.indexOf("router.put('/:key'"));
    assert.ok(put.indexOf("if (!canManage(req.userRole)) return refuse(res, 'forbidden');") < put.indexOf('journeyFixed.setActive('));
    assert.match(put, /journeyFixed\.setActive\(pool, \{ workspaceId: req\.workspaceId, key: req\.params\.key, active, userId: req\.userId \}\)/);
  });
  test('every refusal has its code', () => {
    const codes = [...route.slice(route.indexOf('const ERRORS = {'), route.indexOf('const refuse')).matchAll(/^\s+([a-z_]+):\s+\[/gm)].map(m => m[1]);
    assert.deepEqual(codes.sort(), ['active', 'fonio_off', 'forbidden', 'no_switch', 'not_found']);
    const util = read('utils/journey-fixed.js');
    for (const code of [...util.matchAll(/\{ code: '([a-z_]+)' \}/g)].map(m => m[1])) assert.ok(codes.includes(code), `the utility's ${code}`);
  });
  test('mounted ahead of the workflows\' own router, which would only pass it on', () => {
    assert.match(server, /^app\.use\('\/api\/journey\/fixed', require\('\.\/routes\/journey-fixed'\)\);/m);
    assert.ok(server.indexOf("app.use('/api/journey/fixed'") < server.indexOf("app.use('/api/journey',"));
  });
});
