// ROUTE tests: /api/journey — the Customer Journey's workflows (CUSTOMER_JOURNEY_CHANGES Parts 3–6).
//
// A workspace has workflows; a workflow is made of boxes, one action per box: a start (what sets it off and where it
// stops), then calls, emails, WhatsApp / SMS / task steps and deal moves, each with how long after the box before it
// it happens. The order is the lines (next_id). A workflow runs while it is switched on.
//
// Pinned: everyone in the workspace reads the workflows and never another workspace's; only owners and admins change
// anything; a new workflow has its start box; a new box goes in behind a box of the same workflow and takes over its
// line, or stands alone; deleting a box joins its neighbours and moves on the deals that wait at it; the start is
// never deleted, and is changed only while the workflow is off; a workflow is switched on only with a start that says
// what starts it, the deals already there written down first; a line never leads to a start, to itself or round in a
// circle; a box may name only stages and lead webhooks of the caller's workspace; the test email goes to the caller's
// own address with the step's own words; every refusal carries a code; who and where come from the session.
// Part 17 (2026-11-20): a step's test email is an email like any other — counted, refused while the address is paused
// (409 paused) or its day is full (409 limit, with the sending limit's own sentence), and Google's "limit" pauses the
// address. The limits themselves are tests/unit/journey-sends.test.js; their database is tests/helpers/fake-sends.js.
//
// What makes a workflow happen (utils/journey-run.js: taking deals in, the tick) talks to the database in ways a
// stand-in cannot answer faithfully; here its two calls are recorded, and it is checked on a real database instead.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve, inject } = require('../helpers/load-route');
const { createSends } = require('../helpers/fake-sends');
const { read } = require('../helpers/client-fn');

const ENV = { GOOGLE_MAIL_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret', APP_BASE_URL: 'https://crm.example.de', SESSION_SECRET: 'test-session-secret' };
const saved = {};
for (const k of [...Object.keys(ENV), 'BASE_URL', 'CALCOM_ENCRYPTION_KEY']) saved[k] = process.env[k];
Object.assign(process.env, ENV); delete process.env.BASE_URL; delete process.env.CALCOM_ENCRYPTION_KEY;
const mail = require('../../utils/journey-mail');
const realRun = require('../../utils/journey-run');

const WS = 7, OTHER = 8;
const STAGES = [{ id: 31, workspace_id: WS }, { id: 32, workspace_id: WS }, { id: 91, workspace_id: OTHER }];
const HOOKS = [{ id: 5, workspace_id: WS, name: 'Website form', webhook_key: 'secret-key-5' }, { id: 6, workspace_id: WS, name: 'Meta Ads', webhook_key: 'secret-key-6' }, { id: 9, workspace_id: OTHER, name: 'Theirs', webhook_key: 'k9' }];
const USERS = [{ id: 1, email: 'Olga@Firma.de', ws: [WS] }, { id: 3, email: 'mia@firma.de', ws: [WS] }];
// what the record reads when it is not handed in (Part 15): a person's name, a deal's title
const NAMES = { 1: 'Olga Owner', 2: 'Adam Admin', 3: 'Mia Member', 9: 'Otto Other' };
const DEALS = [{ id: 60, workspace_id: WS, title: 'Wohnung 3' }, { id: 61, workspace_id: WS, title: 'Haus am See' }, { id: 90, workspace_id: OTHER, title: 'Theirs' }];
const PIPELINES = [{ id: 3, workspace_id: WS }, { id: 90, workspace_id: OTHER }];
const FIELDS = [{ table: 'deal_fields', workspace_id: WS, field_key: 'finanzierung', type: 'text', name: 'Finanzierung' }, { table: 'deal_fields', workspace_id: WS, field_key: 'einzug', type: 'date', name: 'Einzug <am>' },
  { table: 'custom_fields', workspace_id: WS, field_key: 'kundenstatus', type: 'text', name: 'Kundenstatus' }, { table: 'deal_fields', workspace_id: OTHER, field_key: 'fremd', type: 'date', name: 'Fremd' }];
const state = { flows: [], nodes: [], runs: [], sender: null, nextFlow: 1, nextNode: 1, calls: [], engine: [], include: { run: { id: 1 } }, log: [], nextLog: 1, logBroken: false, mail: [], sends: [], told: [] };
// Part 17: the limits, the count and the pause of the sending address (the statements of utils/journey-sends.js).
// state.mail holds the connection's row beside state.sender, state.sends the counted emails, state.told who was told.
const limits = createSends({ get mail() { return state.mail; }, get sends() { return state.sends; },
  members: [{ user_id: 1, workspace_id: 7, role: 'owner' }, { user_id: 2, workspace_id: 7, role: 'admin' }, { user_id: 3, workspace_id: 7, role: 'member' }] });
const nodeView = ({ workspace_id, ...n }) => ({ ...n });
const run = async (sql, p = []) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.calls.push({ sql: t, params: p });
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(t)) return { rows: [] };
  const own = (list, wid) => list.filter(r => r.workspace_id === wid);
  const flowOf = (id, wid) => state.flows.find(f => f.id === id && f.workspace_id === wid);
  const nodeAt = (id, wid) => state.nodes.find(n => n.id === id && n.workspace_id === wid);
  if (t === 'SELECT id, name, active, updated_at FROM journey_flows WHERE workspace_id = $1 AND ($2::int IS NULL OR id = $2) ORDER BY id') {
    return { rows: own(state.flows, p[0]).filter(f => p[1] == null || f.id === p[1]).map(f => ({ id: f.id, name: f.name, active: f.active, updated_at: f.updated_at })) };
  }
  if (t === 'SELECT id, flow_id, kind, title, body, wait_minutes, config, next_id, x, y, else_id FROM journey_nodes WHERE workspace_id = $1 AND ($2::int IS NULL OR flow_id = $2) ORDER BY id') {
    return { rows: own(state.nodes, p[0]).filter(n => p[1] == null || n.flow_id === p[1]).map(nodeView) };
  }
  if (t === 'SELECT id, name FROM workspace_webhook WHERE workspace_id = $1 ORDER BY id') return { rows: own(HOOKS, p[0]).map(h => ({ id: h.id, name: h.name })) };
  if (t === 'SELECT COUNT(*)::int AS n FROM journey_flows WHERE workspace_id = $1') return { rows: [{ n: own(state.flows, p[0]).length }] };
  if (t === 'INSERT INTO journey_flows (workspace_id, name, created_by) VALUES ($1,$2,$3) RETURNING id') {
    const f = { id: state.nextFlow++, workspace_id: p[0], name: p[1], created_by: p[2], active: false, updated_at: 'T1' };
    state.flows.push(f); return { rows: [{ id: f.id }] };
  }
  if (t === "INSERT INTO journey_nodes (workspace_id, flow_id, kind, config) VALUES ($1,$2,'start',$3::jsonb)") {
    state.nodes.push({ id: state.nextNode++, workspace_id: p[0], flow_id: p[1], kind: 'start', title: '', body: '', wait_minutes: 0, config: JSON.parse(p[2]), next_id: null, x: null, y: null, else_id: null }); return { rows: [] };
  }
  if (t === "SELECT f.id, f.name, f.active, s.config FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.id = $1 AND f.workspace_id = $2") {
    const f = flowOf(p[0], p[1]); return { rows: f ? [{ id: f.id, name: f.name, active: f.active, config: state.nodes.find(n => n.flow_id === f.id && n.kind === 'start')?.config }] : [] };
  }
  // Part 15, the record. One statement writes an entry; a name that is not handed in is read in it — within the workspace.
  if (t.startsWith('INSERT INTO journey_log (workspace_id, flow_id, node_id, deal_id, kind, title, status, detail, event, flow_name, deal_title, actor_id, actor_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,')) {
    if (state.logBroken) throw new Error('the record is away');
    const [workspace_id, flow_id, node_id, deal_id, kind, title, status, detail, event, flowName, dealTitle, actor_id, actorName] = p;
    const e = { id: state.nextLog++, created_at: `T${state.nextLog - 1}`, workspace_id, flow_id, node_id, deal_id, kind, title, status, detail, event,
      flow_name: flowName ?? flowOf(flow_id, workspace_id)?.name ?? '', deal_title: dealTitle ?? DEALS.find(d => d.id === deal_id && d.workspace_id === workspace_id)?.title ?? '',
      actor_id, actor_name: actorName ?? NAMES[actor_id] ?? '' };
    state.log.push(e); return { rows: [{ id: e.id }] };
  }
  if (t.startsWith('SELECT l.id, l.created_at, l.event, l.flow_id, l.flow_name, l.deal_id, l.deal_title, l.kind, l.title, l.status, l.detail, l.actor_name FROM journey_log l WHERE l.workspace_id = $1')) {
    const [wid, flowId, dealId, events, q, before, limit] = p, has = (text, part) => String(text).toLowerCase().includes(String(part).toLowerCase());
    const rows = state.log.filter(e => e.workspace_id === wid && (flowId === null || e.flow_id === flowId) && (dealId === null || e.deal_id === dealId) && (events === null || events.includes(e.event))
      && (q === null || has(e.deal_title, q) || has(e.title, q) || has(e.flow_name, q)) && (before === null || e.id < before)).sort((a, b) => b.id - a.id).slice(0, limit);
    return { rows: rows.map(({ workspace_id, node_id, actor_id, ...e }) => e) };
  }
  if (t === 'UPDATE journey_flows SET active = true, activated_at = NOW(), updated_at = NOW() WHERE id = $1 AND workspace_id = $2') { const f = flowOf(p[0], p[1]); if (f) f.active = true; return { rows: [] }; }
  if (t === 'UPDATE journey_flows SET active = false, updated_at = NOW() WHERE id = $1 AND workspace_id = $2') { const f = flowOf(p[0], p[1]); if (f) f.active = false; return { rows: [] }; }
  if (t === 'UPDATE journey_flows SET name = $3, updated_at = NOW() WHERE id = $1 AND workspace_id = $2') { const f = flowOf(p[0], p[1]); if (f) f.name = p[2]; return { rows: [] }; }
  if (t === 'DELETE FROM journey_flows WHERE id = $1 AND workspace_id = $2 RETURNING name') {
    const i = state.flows.findIndex(x => x.id === p[0] && x.workspace_id === p[1]); if (i < 0) return { rowCount: 0, rows: [] };
    const [gone] = state.flows.splice(i, 1); state.nodes = state.nodes.filter(n => n.flow_id !== p[0]);   // its boxes go with it, as the database does
    for (const e of state.log) if (e.flow_id === p[0]) e.flow_id = null;                                   // … and its entries in the record stay, without it
    return { rowCount: 1, rows: [{ name: gone.name }] };
  }
  if (t === 'SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2 FOR UPDATE' || t === 'SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2') return { rows: flowOf(p[0], p[1]) ? [{ id: p[0] }] : [] };
  if (t === 'SELECT id, next_id FROM journey_nodes WHERE id = $1 AND flow_id = $2 AND workspace_id = $3') {
    return { rows: state.nodes.filter(n => n.id === p[0] && n.flow_id === p[1] && n.workspace_id === p[2]).map(n => ({ id: n.id, next_id: n.next_id })) };
  }
  if (t === 'SELECT COUNT(*)::int AS n FROM journey_nodes WHERE flow_id = $1 AND workspace_id = $2') return { rows: [{ n: state.nodes.filter(n => n.flow_id === p[0] && n.workspace_id === p[1]).length }] };
  if (t === 'INSERT INTO journey_nodes (workspace_id, flow_id, kind, title, body, wait_minutes, config, next_id) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id') {
    const n = { id: state.nextNode++, workspace_id: p[0], flow_id: p[1], kind: p[2], title: p[3], body: p[4], wait_minutes: p[5], config: JSON.parse(p[6]), next_id: p[7], x: null, y: null, else_id: null };
    state.nodes.push(n); return { rows: [{ id: n.id }] };
  }
  if (t === 'UPDATE journey_nodes SET next_id = $3 WHERE id = $1 AND workspace_id = $2') { const n = nodeAt(p[0], p[1]); if (n) n.next_id = p[2]; return { rows: [] }; }
  // Part 11: a branch box's second line
  if (t === 'UPDATE journey_nodes SET else_id = $3 WHERE id = $1 AND workspace_id = $2') { const n = nodeAt(p[0], p[1]); if (n) n.else_id = p[2]; return { rows: [] }; }
  if (t === "SELECT id, else_id AS next_id FROM journey_nodes WHERE id = $1 AND flow_id = $2 AND workspace_id = $3 AND kind = 'branch'") {
    return { rows: state.nodes.filter(n => n.id === p[0] && n.flow_id === p[1] && n.workspace_id === p[2] && n.kind === 'branch').map(n => ({ id: n.id, next_id: n.else_id ?? null })) };
  }
  if (t === 'UPDATE journey_nodes SET else_id = $3 WHERE else_id = $1 AND workspace_id = $2') { for (const n of state.nodes) if (n.else_id === p[0] && n.workspace_id === p[1]) n.else_id = p[2]; return { rows: [] }; }
  if (t === 'UPDATE journey_flows SET updated_at = NOW() WHERE id = $1 AND workspace_id = $2') return { rows: [] };
  if (t === 'SELECT n.id, n.kind, n.flow_id, n.next_id, n.title, n.body, n.config, f.active FROM journey_nodes n JOIN journey_flows f ON f.id = n.flow_id WHERE n.id = $1 AND n.workspace_id = $2') {
    const n = nodeAt(p[0], p[1]); return { rows: n ? [{ id: n.id, kind: n.kind, flow_id: n.flow_id, next_id: n.next_id, title: n.title, body: n.body, config: n.config, active: state.flows.find(f => f.id === n.flow_id).active }] : [] };
  }
  if (t === 'UPDATE journey_nodes SET title = $3, body = $4, wait_minutes = $5, config = $6::jsonb, updated_at = NOW() WHERE id = $1 AND workspace_id = $2') {
    const n = nodeAt(p[0], p[1]); if (n) Object.assign(n, { title: p[2], body: p[3], wait_minutes: p[4], config: JSON.parse(p[5]) }); return { rows: [] };
  }
  if (t === 'UPDATE journey_nodes SET x = $3, y = $4 WHERE id = $1 AND workspace_id = $2') { const n = nodeAt(p[0], p[1]); if (!n) return { rowCount: 0, rows: [] }; n.x = p[2]; n.y = p[3]; return { rowCount: 1, rows: [] }; }
  if (t === 'SELECT id, kind, next_id, else_id FROM journey_nodes WHERE flow_id = $1 AND workspace_id = $2') return { rows: state.nodes.filter(n => n.flow_id === p[0] && n.workspace_id === p[1]).map(n => ({ id: n.id, kind: n.kind, else_id: n.else_id ?? null, next_id: n.next_id })) };
  if (t === 'UPDATE journey_nodes SET next_id = $3 WHERE next_id = $1 AND workspace_id = $2') { for (const n of state.nodes) if (n.next_id === p[0] && n.workspace_id === p[1]) n.next_id = p[2]; return { rows: [] }; }
  if (t === 'UPDATE journey_runs SET node_id = $3 WHERE node_id = $1 AND workspace_id = $2') { for (const r of state.runs) if (r.node_id === p[0] && r.workspace_id === p[1]) r.node_id = p[2]; return { rows: [] }; }
  // a deal that waits at a deleted box: the box behind it with its wait, the rows that wait, and each row put on
  if (t === 'SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND workspace_id = $2') { const n = nodeAt(p[0], p[1]); return { rows: n ? [{ id: n.id, wait_minutes: n.wait_minutes, kind: n.kind, config: n.config }] : [] }; }
  if (t === "SELECT r.id, r.deal_id, r.due_at, r.updated_at, n.wait_minutes FROM journey_runs r JOIN journey_nodes n ON n.id = r.node_id WHERE r.node_id = $1 AND r.workspace_id = $2 AND r.status = 'waiting'") {
    return { rows: state.runs.filter(r => r.node_id === p[0] && r.workspace_id === p[1] && (r.status || 'waiting') === 'waiting').map(r => ({ id: r.id, deal_id: r.deal_id ?? null, due_at: r.due_at ?? null, updated_at: r.updated_at ?? null, wait_minutes: nodeAt(p[0], p[1]).wait_minutes })) };
  }
  if (t === 'UPDATE journey_runs SET node_id = $3, due_at = $4, updated_at = NOW() WHERE id = $1 AND workspace_id = $2') { const r = state.runs.find(x => x.id === p[0] && x.workspace_id === p[1]); Object.assign(r, { node_id: p[2], due_at: p[3] }); return { rows: [] }; }
  if (t === "UPDATE journey_runs SET status = 'done', node_id = NULL, due_at = NULL, updated_at = NOW() WHERE id = $1 AND workspace_id = $2") { const r = state.runs.find(x => x.id === p[0] && x.workspace_id === p[1]); Object.assign(r, { status: 'done', node_id: null, due_at: null }); return { rows: [] }; }
  if (t === 'DELETE FROM journey_nodes WHERE id = $1 AND workspace_id = $2') { state.nodes = state.nodes.filter(n => !(n.id === p[0] && n.workspace_id === p[1])); return { rows: [] }; }
  if (t === 'SELECT id FROM pipeline_stages WHERE workspace_id = $1 AND id = ANY($2::int[])') return { rows: STAGES.filter(s => s.workspace_id === p[0] && p[1].includes(s.id)).map(s => ({ id: s.id })) };
  if (t === 'SELECT id FROM workspace_webhook WHERE workspace_id = $1 AND id = ANY($2::int[])') return { rows: HOOKS.filter(h => h.workspace_id === p[0] && p[1].includes(h.id)).map(h => ({ id: h.id })) };
  // Part 9: what a start may name beside stages and lead webhooks — a pipeline, a field, another workflow
  if (t === 'SELECT id FROM pipelines WHERE workspace_id = $1 AND id = ANY($2::int[])') return { rows: PIPELINES.filter(x => x.workspace_id === p[0] && p[1].includes(x.id)).map(x => ({ id: x.id })) };
  // Part 14: which of the fields a text names are the workspace's own (utils/journey-vars.js)
  const named = /^SELECT field_key, name FROM (deal_fields|custom_fields) WHERE workspace_id = \$1 AND LOWER\(field_key\) = ANY\(\$2::text\[\]\)$/.exec(t);
  if (named) return { rows: FIELDS.filter(f => f.table === named[1] && f.workspace_id === p[0] && p[1].includes(f.field_key.toLowerCase())).map(f => ({ field_key: f.field_key, name: f.name })) };
  const fieldOf = /^SELECT type FROM (deal_fields|custom_fields) WHERE workspace_id = \$1 AND field_key = \$2$/.exec(t);
  if (fieldOf) return { rows: FIELDS.filter(f => f.table === fieldOf[1] && f.workspace_id === p[0] && f.field_key === p[1]).map(f => ({ type: f.type })) };
  if (t === "SELECT f.id, s.config FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.workspace_id = $1") {
    return { rows: own(state.flows, p[0]).map(f => ({ id: f.id, config: state.nodes.find(n => n.flow_id === f.id && n.kind === 'start')?.config ?? null })) };
  }
  if (t === 'SELECT status, COUNT(*)::int AS n FROM journey_runs WHERE flow_id = $1 AND workspace_id = $2 GROUP BY status') return { rows: [{ status: 'waiting', n: 2 }, { status: 'done', n: 5 }] };
  if (t.startsWith('SELECT r.deal_id, d.title AS deal_title, r.due_at, n.kind, n.title FROM journey_runs r JOIN deals d')) return { rows: [{ deal_id: 60, deal_title: 'Wohnung 3', due_at: '2026-11-20T09:00:00.000Z', kind: 'email', title: 'Second mail' }] };
  if (t.startsWith('SELECT l.deal_id, d.title AS deal_title, l.kind, l.title, l.status, l.detail, l.created_at FROM journey_log l')) return { rows: [{ deal_id: 60, deal_title: 'Wohnung 3', kind: 'email', title: 'Welcome', status: 'done', detail: 'lead@example.de', created_at: '2026-11-19T09:00:00.000Z' }] };
  if (t === 'SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1') return { rows: state.sender && p[0] === WS ? [state.sender] : [] };
  if (t === 'SELECT u.email FROM users u JOIN user_workspaces uw ON uw.user_id = u.id WHERE u.id = $1 AND uw.workspace_id = $2') return { rows: USERS.filter(u => u.id === p[0] && u.ws.includes(p[1])).map(u => ({ email: u.email })) };
  const known = limits.answer(t, p);
  if (known) return known;
  throw new Error(`unexpected statement: ${t}`);
};
const pool = { query: run, connect: async () => ({ query: run, release() {} }) };
const writes = () => state.calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

// the engine's two calls, recorded; everything else of it is the real thing
const engine = { ...realRun, baseline: async (db, flow) => { state.engine.push(['baseline', flow]); return 0; }, include: async (db, what) => { state.engine.push(['include', what]); return state.include; } };

// a fake Google for the test email
const realFetch = globalThis.fetch;
let google = [];
function fakeGoogle(plan = {}) {
  google = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    const body = typeof init.body === 'string' ? (String(init.headers?.['Content-Type'] || '').includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : undefined;
    google.push({ url: u, body });
    const r = plan[u] || (u.includes('/token') ? { status: 200, body: { access_token: 'ya29.fresh' } } : { status: 200, body: { id: 'm1' } });
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

let owner, admin, member, other;
before(async () => {
  const notifications = { notify: () => {}, notifyUser: async (...a) => { state.told.push(a); return true; } };   // Part 17: who hears of a pause
  const as = (id, workspaceId, role) => { inject('utils/journey-run.js', engine); return serve({ '/api/journey': loadRoute('journey.js', { pool, user: { id, workspaceId, role }, notifications }) }); };
  owner = await as(1, WS, 'owner'); admin = await as(2, WS, 'admin'); member = await as(3, WS, 'member'); other = await as(9, OTHER, 'owner');
});
after(async () => {
  for (const s of [owner, admin, member, other]) await s.close();
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
beforeEach(() => { Object.assign(state, { flows: [], nodes: [], runs: [], sender: null, nextFlow: 1, nextNode: 1, calls: [], engine: [], include: { run: { id: 1 } }, log: [], nextLog: 1, logBroken: false, mail: [], sends: [], told: [] }); Object.assign(process.env, ENV); fakeGoogle(); });

const newFlow = (srv = owner, name = 'New lead') => srv.request('POST', '/api/journey/flows', { name });
const addBox = (flowId, body, srv = owner) => srv.request('POST', `/api/journey/flows/${flowId}/nodes`, body);
const put = (id, body, srv = owner) => srv.request('PUT', `/api/journey/nodes/${id}`, body);
const EMAIL = { kind: 'email', title: 'Welcome', body: 'Hello,\nthanks for asking.', wait_minutes: 0 };
// a workflow's boxes in the order of its lines
const chain = flow => { const by = new Map(flow.nodes.map(n => [n.id, n])), out = []; for (let n = flow.nodes.find(x => x.kind === 'start'); n; n = by.get(n.next_id)) out.push(n); return out; };
const START = { trigger: null, webhook_ids: null, stage_id: null, stop_stage_ids: [] };

describe('the list', () => {
  test('empty at first; the answer names the lead webhooks, the limits and whether the caller may change anything', async () => {
    assert.deepEqual((await owner.request('GET', '/api/journey')).body, { flows: [], webhooks: [{ id: 5, name: 'Website form' }, { id: 6, name: 'Meta Ads' }], can_manage: true, max_flows: 20, max_nodes: 60 });
    const m = await member.request('GET', '/api/journey');
    assert.equal(m.status, 200, 'every member reads the workflows');
    assert.equal(m.body.can_manage, false);
    assert.doesNotMatch(JSON.stringify(m.body), /secret-key/, 'a lead webhook is its id and its name, never its key');
  });
  test('every workflow of this workspace with its boxes and whether it runs; never another workspace\'s', async () => {
    await newFlow(owner, 'A'); await newFlow(other, 'Theirs'); await newFlow(owner, 'B');
    const r = await member.request('GET', '/api/journey');
    assert.deepEqual(r.body.flows.map(f => [f.name, f.active, f.nodes.length]), [['A', false, 1], ['B', false, 1]]);
    assert.deepEqual(Object.keys(r.body.flows[0]).sort(), ['active', 'id', 'name', 'nodes', 'updated_at']);
    assert.deepEqual(Object.keys(r.body.flows[0].nodes[0]).sort(), ['body', 'config', 'else_id', 'id', 'kind', 'next_id', 'title', 'wait_minutes', 'x', 'y']);
    assert.deepEqual((await other.request('GET', '/api/journey')).body.flows.map(f => f.name), ['Theirs']);
  });
});

describe('workflows', () => {
  test('a new workflow has its name and one box: an empty start; it is off', async () => {
    const r = await newFlow(owner, '  New lead from the website ');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.flow.name, r.body.flow.active], ['New lead from the website', false]);
    assert.deepEqual(r.body.flow.nodes, [{ id: 1, kind: 'start', title: '', body: '', wait_minutes: 0, config: START, next_id: null, x: null, y: null, else_id: null }]);
    assert.deepEqual([state.flows[0].workspace_id, state.flows[0].created_by], [WS, 1], 'the workspace and the author come from the session');
  });
  test('a name is needed, up to 80 characters; a member may not add one; at most 20 per workspace', async () => {
    for (const name of [undefined, '', '   ', 'n'.repeat(81), 5]) assert.deepEqual([(await owner.request('POST', '/api/journey/flows', { name })).body.code], ['name'], String(name));
    assert.deepEqual([(await newFlow(member)).status, writes().length], [403, 0]);
    for (let i = 0; i < 20; i++) state.flows.push({ id: state.nextFlow++, workspace_id: WS, name: 'f' + i });
    assert.equal((await newFlow()).body.code, 'limit');
    assert.equal((await newFlow(other)).status, 201, 'another workspace is not counted');
  });
  test('renamed and deleted by an owner or admin only, and only in the caller\'s own workspace', async () => {
    await newFlow();
    assert.equal((await admin.request('PUT', '/api/journey/flows/1', { name: ' Welcome ' })).body.flow.name, 'Welcome');
    for (const body of [{ name: '' }, {}, { active: 'yes' }, { name: 5 }]) assert.equal((await owner.request('PUT', '/api/journey/flows/1', body)).status, 400, JSON.stringify(body));
    assert.equal((await member.request('PUT', '/api/journey/flows/1', { name: 'x' })).status, 403);
    assert.deepEqual([(await other.request('PUT', '/api/journey/flows/1', { name: 'taken' })).status, state.flows[0].name], [404, 'Welcome']);
    assert.equal((await member.request('DELETE', '/api/journey/flows/1')).status, 403);
    assert.equal((await other.request('DELETE', '/api/journey/flows/1')).status, 404);
    assert.deepEqual((await owner.request('DELETE', '/api/journey/flows/1')).body, { success: true });
    assert.deepEqual([state.flows.length, state.nodes.length], [0, 0], 'its boxes go with it');
  });
});

describe('switching a workflow on and off', () => {
  const sw = (on, srv = owner) => srv.request('PUT', '/api/journey/flows/1', { active: on });
  test('not without a start that says what starts it', async () => {
    await newFlow();
    const r = await sw(true);
    assert.deepEqual([r.status, r.body.code, state.flows[0].active, state.engine.length], [400, 'start', false, 0]);
  });
  test('switched on: the deals already there are written down first, then it runs', async () => {
    await newFlow(); await put(1, { config: { trigger: 'stage', stage_id: 31 } });
    state.calls = [];
    const r = await sw(true);
    assert.deepEqual([r.status, r.body.flow.active], [200, true]);
    assert.deepEqual(state.engine, [['baseline', { id: 1, workspace_id: WS, config: { trigger: 'stage', webhook_ids: null, stage_id: 31, stop_stage_ids: [] } }]]);
    const order = state.calls.map(c => c.sql.split(' ').slice(0, 2).join(' '));
    assert.ok(order.indexOf('BEGIN') < order.indexOf('UPDATE journey_flows') && order.indexOf('UPDATE journey_flows') < order.indexOf('COMMIT'), 'in one piece');
  });
  test('switching on what is on, or off what is off, changes nothing; off stops it', async () => {
    await newFlow(); await put(1, { config: { trigger: 'lead' } });
    await sw(true); await sw(true);
    assert.equal(state.engine.length, 1, 'the deals already there are written down once');
    assert.equal((await sw(false)).body.flow.active, false);
    await sw(false);
    assert.equal(state.flows[0].active, false);
  });
  test('a stage that is gone cannot start a workflow; a member switches nothing', async () => {
    await newFlow();
    state.nodes[0].config = { ...START, trigger: 'stage', stage_id: 404 };
    assert.equal((await sw(true)).body.code, 'stage');
    await put(1, { config: { trigger: 'lead' } });
    assert.deepEqual([(await sw(true, member)).status, state.flows[0].active], [403, false]);
  });
  test('while it runs the start is not changed; the steps are', async () => {
    await newFlow(); await put(1, { config: { trigger: 'lead' } }); await addBox(1, { ...EMAIL, after_id: 1 }); await sw(true);
    const r = await put(1, { config: { trigger: 'stage', stage_id: 31 } });
    assert.deepEqual([r.status, r.body.code, state.nodes[0].config.trigger], [409, 'active', 'lead']);
    assert.equal((await put(2, { ...EMAIL, title: 'Changed' })).status, 200);
  });
});

describe('adding a box', () => {
  test('behind the start, and between two boxes: it takes over the line of the box it is put behind', async () => {
    await newFlow();
    await addBox(1, { ...EMAIL, title: 'first', after_id: 1 });
    await addBox(1, { ...EMAIL, title: 'third', after_id: 2 });
    const r = await addBox(1, { kind: 'call', title: 'second', wait_minutes: 5, after_id: 2 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(chain(r.body.flow).map(n => n.title), ['', 'first', 'second', 'third']);
    assert.equal(chain(r.body.flow)[2].wait_minutes, 5);
  });
  test('without a box to put it behind it stands alone, until a line is drawn to it', async () => {
    await newFlow();
    for (const after_id of [null, undefined]) {
      const r = await addBox(1, { ...EMAIL, after_id });
      assert.equal(r.status, 201);
    }
    assert.deepEqual(state.nodes.map(n => n.next_id), [null, null, null]);
  });
  test('every kind of action, and only those; a move names one stage of this workspace', async () => {
    await newFlow();
    for (const kind of ['call', 'email', 'whatsapp', 'sms', 'task']) assert.equal((await addBox(1, { kind, title: kind, after_id: 1 })).status, 201, kind);
    assert.equal((await addBox(1, { kind: 'move', config: { stage_id: 31, x: 1 }, after_id: 1 })).body.flow.nodes.at(-1).config.stage_id, 31);
    for (const kind of ['start', 'meeting', '', undefined, 5]) assert.equal((await addBox(1, { kind, title: 'x', after_id: 1 })).body.code, 'kind', String(kind));
    for (const config of [undefined, {}, { stage_id: '31' }, { stage_id: 91 }, { stage_id: 12345 }]) assert.equal((await addBox(1, { kind: 'move', config, after_id: 1 })).body.code, 'stage', JSON.stringify(config));
  });
  // Part 18: {{date}}, {{time}}, {{year}} … are said on the clock of whoever saved the step.
  test('a step whose texts are filled is kept with the zone of who saves it, never with one that was sent; the others keep none', async () => {
    const manila = await serve({ '/api/journey': loadRoute('journey.js', { pool, user: { id: 1, workspaceId: WS, role: 'owner', timezone: 'Asia/Manila' } }) });
    try {
      await newFlow();
      for (const kind of ['email', 'whatsapp', 'sms', 'task']) {
        const made = await manila.request('POST', '/api/journey/flows/1/nodes', { kind, title: kind, after_id: 1, config: { tz: 'Mars/Phobos', x: 1 } });
        assert.deepEqual(made.body.flow.nodes.find(n => n.id === made.body.flow.nodes.at(-1).id).config, { tz: 'Asia/Manila' }, kind);
      }
      const id = state.nodes.find(n => n.kind === 'email').id;
      assert.deepEqual((await put(id, { title: 'again', body: '', wait_minutes: 0, config: { tz: 'Mars/Phobos' } })).body.flow.nodes.find(n => n.id === id).config, { tz: 'Europe/Berlin' }, 'saved again by someone whose zone nobody knows: the default');
      assert.deepEqual((await manila.request('PUT', `/api/journey/nodes/${id}`, { title: 'again', body: '', wait_minutes: 0 })).body.flow.nodes.find(n => n.id === id).config, { tz: 'Asia/Manila' }, 'and again by the first: theirs');
      const call = await manila.request('POST', '/api/journey/flows/1/nodes', { kind: 'call', title: 'call', after_id: 1, config: { tz: 'Asia/Manila' } });
      assert.deepEqual(call.body.flow.nodes.at(-1).config, {}, 'a call says no day');
      const move = await manila.request('POST', '/api/journey/flows/1/nodes', { kind: 'move', after_id: 1, config: { stage_id: 31, tz: 'Asia/Manila' } });
      assert.deepEqual(move.body.flow.nodes.at(-1).config, { stage_id: 31 }, 'nor does a move');
    } finally { await manila.close(); }
    assert.deepEqual(require('../../utils/journey-vars').KINDS, ['email', 'whatsapp', 'sms', 'task']);
    assert.match(read('routes/journey.js'), /if \(vars\.KINDS\.includes\(kind\)\) config\.tz = typeof tz === 'string' && tz \? tz : triggers\.FALLBACK_ZONE;/);
  });
  // Part 19: the tick box "Add the unsubscribe line at the end" of an email step.
  test('an email\'s line at the end can be switched off only while its text holds the link itself', async () => {
    await newFlow();
    const kept = async (body, config) => { const r = await addBox(1, { kind: 'email', title: 'x', body, config, after_id: 1 }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.flow.nodes.find(n => n.id === state.nextNode - 1).config; };
    for (const name of ['unsubscribe', 'abmelden', 'unsubscribe_url', ' Unsubscribe_URL ', 'abmelden|x']) {
      assert.deepEqual(await kept(`<a href="{{${name}}}">x</a>`, { footer: false }), { tz: 'Europe/Berlin', footer: false }, name);
      assert.deepEqual(await kept(`<a href="{{${name}}}">x</a>`, { footer: true }), { tz: 'Europe/Berlin', footer: true }, name);
    }
    for (const body of ['<p>Hallo {{first_name}}</p>', '', 'Hallo {{unsubscribe_link}}', 'unsubscribe_url', '{unsubscribe}']) assert.deepEqual(await kept(body, { footer: false }), { tz: 'Europe/Berlin', footer: true }, `no link in "${body}": the line stays on, whatever was sent`);
    for (const config of [undefined, {}, { footer: 'false' }, { footer: 0 }, { footer: null }]) assert.deepEqual(await kept('<a href="{{unsubscribe}}">x</a>', config), { tz: 'Europe/Berlin' }, `${JSON.stringify(config)}: nothing said, nothing kept`);
    const id = state.nextNode - 1;
    assert.deepEqual((await put(id, { title: 'x', body: 'Hallo', wait_minutes: 0, config: { footer: false } })).body.flow.nodes.find(n => n.id === id).config, { tz: 'Europe/Berlin', footer: true }, 'the link was taken out of the text: the line is on again');
    assert.deepEqual((await put(id, { title: '{{unsubscribe}}', body: 'Hallo', wait_minutes: 0, config: { footer: false } })).body.flow.nodes.find(n => n.id === id).config, { tz: 'Europe/Berlin', footer: true }, 'a link in the subject is none');
    const task = await addBox(1, { kind: 'task', title: 'x', body: '{{unsubscribe}}', config: { footer: false }, after_id: 1 });
    assert.deepEqual(task.body.flow.nodes.find(n => n.id === state.nextNode - 1).config, { tz: 'Europe/Berlin' }, 'only an email has the line');
    assert.match(read('routes/journey.js'), /if \(kind === 'email' && typeof b\.config\?\.footer === 'boolean'\) config\.footer = b\.config\.footer \|\| !vars\.usedIn\(text\)\.has\('unsubscribe'\);/);
  });
  test('refused with a code, nothing written: no title, a title or text too long, a wait that is no whole number in range', async () => {
    await newFlow();
    const n = writes().length;
    for (const [patch, code] of [[{ title: undefined }, 'title'], [{ title: '  ' }, 'title'], [{ title: 't'.repeat(121) }, 'title'], [{ body: 'x'.repeat(20001) }, 'body'], [{ body: ['x'] }, 'body'],
      [{ wait_minutes: -1 }, 'wait'], [{ wait_minutes: 1.5 }, 'wait'], [{ wait_minutes: '60' }, 'wait'], [{ wait_minutes: 525601 }, 'wait']]) {
      assert.equal((await addBox(1, { ...EMAIL, after_id: 1, ...patch })).body.code, code, JSON.stringify(patch).slice(0, 40));
    }
    assert.equal(writes().length, n);
  });
  test('the box it is put behind must be a box of that very workflow; a member is refused; at most 60 boxes', async () => {
    await newFlow(owner, 'A'); await newFlow(owner, 'B'); await newFlow(other, 'Theirs');   // starts 1, 2, 3
    for (const after_id of ['1', 0, 2, 3, 999]) assert.equal((await addBox(1, { ...EMAIL, after_id })).body.code, 'after', String(after_id));
    assert.equal((await addBox(1, { ...EMAIL, after_id: 1 }, member)).status, 403);
    assert.equal((await addBox(1, { ...EMAIL, after_id: 1 }, other)).status, 404);
    assert.equal(state.nodes.length, 3);
    for (let i = 0; i < 59; i++) state.nodes.push({ id: state.nextNode++, workspace_id: WS, flow_id: 1, kind: 'task', title: 'n', body: '', wait_minutes: 0, config: {}, next_id: null });
    assert.equal((await addBox(1, { ...EMAIL, after_id: 1 })).body.code, 'nodes_limit');
  });
});

describe('changing a box', () => {
  test('an action box: its title, text and wait; its kind and its line stay', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 }); await addBox(1, { kind: 'task', title: 'after', after_id: 2 });
    const r = await put(2, { kind: 'call', title: ' Second mail ', body: '<p>B</p>', wait_minutes: 2880, next_id: null });
    assert.deepEqual(r.body.flow.nodes[1], { id: 2, kind: 'email', title: 'Second mail', body: '<p>B</p>', wait_minutes: 2880, config: { tz: 'Europe/Berlin' }, next_id: 3, x: null, y: null, else_id: null });
    for (const [patch, code] of [[{ title: '' }, 'title'], [{ wait_minutes: -5 }, 'wait'], [{ body: 5 }, 'body']]) assert.equal((await put(2, { ...EMAIL, ...patch })).body.code, code);
  });
  test('the start: a new lead (every one, or chosen lead webhooks), or a stage; what does not belong to the trigger is emptied', async () => {
    await newFlow();
    assert.deepEqual((await put(1, { config: { trigger: 'lead', webhook_ids: [6, 5, 6], stage_id: 31, stop_stage_ids: [32] } })).body.flow.nodes[0].config, { trigger: 'lead', webhook_ids: [6, 5], stage_id: null, stop_stage_ids: [32] });
    assert.deepEqual((await put(1, { config: { trigger: 'stage', stage_id: 31, webhook_ids: [5] } })).body.flow.nodes[0].config, { trigger: 'stage', webhook_ids: null, stage_id: 31, stop_stage_ids: [] });
    assert.deepEqual((await put(1, { config: { trigger: null } })).body.flow.nodes[0].config, START);
  });
  test('the start may name only this workspace\'s lead webhooks and stages', async () => {
    await newFlow();
    for (const [config, code] of [[{ trigger: 'lead', webhook_ids: [9] }, 'webhooks'], [{ trigger: 'lead', webhook_ids: ['5'] }, 'webhooks'], [{ trigger: 'lead', webhook_ids: Array.from({ length: 21 }, (_, i) => i + 1) }, 'webhooks'],
      [{ trigger: 'stage', stage_id: 91 }, 'stage'], [{ trigger: 'stage' }, 'stage'], [{ trigger: 'lead', stop_stage_ids: [91] }, 'stage'], [{ trigger: 'webhook' }, 'start']]) {
      assert.equal((await put(1, { config })).body.code, code, JSON.stringify(config).slice(0, 50));
    }
    for (const body of [{}, { config: null }, { config: [1] }]) assert.equal((await put(1, body)).body.code, 'start');
    assert.deepEqual(state.nodes[0].config, START, 'nothing was saved');
  });
  // Part 9: every start of utils/journey-triggers.js is saved through the same address
  test('every other start is saved with its own settings, and only those; any start can be limited to one pipeline', async () => {
    await newFlow();
    const saved = async config => (await put(1, { config })).body.flow.nodes[0].config;
    assert.deepEqual(await saved({ trigger: 'meeting_before', hours: 24, stage_id: 31, webhook_ids: [5], days: 9 }), { ...START, trigger: 'meeting_before', hours: 24 });
    assert.deepEqual(await saved({ trigger: 'deal_field', field_key: 'finanzierung', value: ' ja ' }), { ...START, trigger: 'deal_field', field_key: 'finanzierung', value: 'ja' });
    assert.deepEqual(await saved({ trigger: 'contact_field', field_key: 'kundenstatus' }), { ...START, trigger: 'contact_field', field_key: 'kundenstatus' });
    assert.deepEqual(await saved({ trigger: 'call_result', result: 'not_reached', pipeline_id: 3, stop_stage_ids: [32] }), { ...START, trigger: 'call_result', stop_stage_ids: [32], pipeline_id: 3, result: 'not_reached' });
    assert.deepEqual(await saved({ trigger: 'stage_days', stage_id: 31, days: 3 }), { ...START, trigger: 'stage_days', stage_id: 31, days: 3 });
    assert.deepEqual(await saved({ trigger: 'manual' }), { ...START, trigger: 'manual' });
    for (const trigger of Object.keys(require('../../utils/journey-triggers').TRIGGERS)) assert.ok(read('routes/journey.js').includes('triggers.checkStart(c, { tz })'), trigger);
  });
  test('a start with a time of day is kept with the zone of who saves it, never with one that was sent', async () => {
    const vienna = await serve({ '/api/journey': loadRoute('journey.js', { pool, user: { id: 1, workspaceId: WS, role: 'owner', timezone: 'Europe/Vienna' } }) });
    try {
      await newFlow(vienna);
      const r = await vienna.request('PUT', '/api/journey/nodes/1', { config: { trigger: 'date_field', field_key: 'einzug', offset_days: -7, at: '08:30', tz: 'Mars/Phobos' } });
      assert.deepEqual(r.body.flow.nodes[0].config, { ...START, trigger: 'date_field', field_key: 'einzug', offset_days: -7, at: '08:30', tz: 'Europe/Vienna' });
      const s = await put(1, { config: { trigger: 'schedule', stage_id: 31, weekdays: [5, 1], at: '09:00' } });
      assert.deepEqual(s.body.flow.nodes[0].config, { ...START, trigger: 'schedule', stage_id: 31, weekdays: [1, 5], at: '09:00', tz: 'Europe/Berlin' }, 'nobody\'s zone known: the default');
    } finally { await vienna.close(); }
  });
  test('what a start names must be this workspace\'s own: a pipeline, a field of the right kind, another workflow', async () => {
    await newFlow(); await newFlow(owner, 'Second'); await newFlow(other, 'Theirs');
    for (const [config, code] of [[{ trigger: 'manual', pipeline_id: 90 }, 'pipeline'], [{ trigger: 'manual', pipeline_id: '3' }, 'pipeline'],
      [{ trigger: 'deal_field', field_key: 'fremd' }, 'field'], [{ trigger: 'deal_field', field_key: 'kundenstatus' }, 'field'], [{ trigger: 'contact_field', field_key: 'finanzierung' }, 'field'],
      [{ trigger: 'date_field', field_key: 'finanzierung', at: '09:00' }, 'field'], [{ trigger: 'deal_field' }, 'field'],
      [{ trigger: 'flow_done', flow_id: 1 }, 'flow'], [{ trigger: 'flow_done', flow_id: 3 }, 'flow'], [{ trigger: 'flow_done', flow_id: 99 }, 'flow'], [{ trigger: 'flow_done' }, 'flow'],
      [{ trigger: 'meeting_before' }, 'start'], [{ trigger: 'meeting_before', hours: 9999 }, 'start'], [{ trigger: 'call_result', result: 'happy' }, 'start'], [{ trigger: 'schedule', stage_id: 31, weekdays: [], at: '09:00' }, 'start'],
      [{ trigger: 'date_field', field_key: 'einzug', at: '25:00' }, 'start'], [{ trigger: 'constructor' }, 'start']]) {
      const r = await put(1, { config });
      assert.deepEqual([r.status, r.body.code], [400, code], JSON.stringify(config).slice(0, 60));
    }
    assert.deepEqual(state.nodes[0].config, START, 'nothing was saved');
    assert.equal((await put(1, { config: { trigger: 'flow_done', flow_id: 2 } })).status, 200, 'the second workflow of this workspace');
  });
  test('two workflows cannot wait for each other', async () => {
    await newFlow(); await newFlow(owner, 'Second');
    assert.equal((await put(1, { config: { trigger: 'flow_done', flow_id: 2 } })).status, 200);
    const back = await put(2, { config: { trigger: 'flow_done', flow_id: 1 } });
    assert.deepEqual([back.status, back.body.code], [400, 'loop']);
    assert.deepEqual(state.nodes[1].config, START);
  });
  test('"only when added by hand" is a start: its workflow can be switched on; what a start names is asked again at that moment', async () => {
    await newFlow();
    await put(1, { config: { trigger: 'manual' } });
    assert.equal((await owner.request('PUT', '/api/journey/flows/1', { active: true })).body.flow.active, true);
    await newFlow(owner, 'Second');
    await put(2, { config: { trigger: 'deal_field', field_key: 'finanzierung' } });
    const gone = FIELDS.findIndex(f => f.field_key === 'finanzierung');
    const [kept] = FIELDS.splice(gone, 1);   // the field is deleted in Settings
    try {
      const r = await owner.request('PUT', '/api/journey/flows/2', { active: true });
      assert.deepEqual([r.status, r.body.code], [400, 'field']);
      assert.equal(state.flows[1].active, false);
      assert.ok(!state.engine.some(e => e[0] === 'baseline' && e[1].id === 2), 'nothing was written down for a workflow that was not switched on');
    } finally { FIELDS.splice(gone, 0, kept); }
  });
  // Part 10: a box that only takes time, and more ways a workflow ends
  test('a Wait box needs no title: its time is what it is — some time, or until a time of day on chosen days', async () => {
    await newFlow();
    const plain = await addBox(1, { kind: 'wait', after_id: 1, wait_minutes: 1440 });
    assert.equal(plain.status, 201);
    assert.deepEqual(chain(plain.body.flow).map(n => [n.kind, n.title, n.wait_minutes, n.config]), [['start', '', 0, START], ['wait', '', 1440, {}]]);
    const until = await put(2, { wait_minutes: 0, config: { until: '09:00', weekdays: [5, 1, 5], tz: 'Mars/Phobos' } });
    assert.deepEqual(until.body.flow.nodes[1].config, { until: '09:00', tz: 'Europe/Berlin', weekdays: [1, 5] }, 'the zone is the saver\'s (here nobody\'s: the default), never the one sent');
    assert.deepEqual((await put(2, { wait_minutes: 60, config: { until: '18:30', weekdays: [1, 2, 3, 4, 5, 6, 7] } })).body.flow.nodes[1].config, { until: '18:30', tz: 'Europe/Berlin' }, 'every day needs no list');
    assert.deepEqual((await put(2, { wait_minutes: 30, config: { weekdays: [1], tz: 'x', stage_id: 31 } })).body.flow.nodes[1].config, {}, 'days without a time, and what is no setting of a wait, are left out');
  });
  test('a wait of no time at all, a time that is none, or a day that is none is refused', async () => {
    await newFlow(); await addBox(1, { kind: 'wait', after_id: 1, wait_minutes: 60 });
    for (const body of [{ wait_minutes: 0 }, { wait_minutes: 0, config: {} }, { wait_minutes: 5, config: { until: '9:00' } }, { wait_minutes: 5, config: { until: '25:00' } }, { wait_minutes: 5, config: { until: 900 } },
      { wait_minutes: 5, config: { until: '09:00', weekdays: [0] } }, { wait_minutes: 5, config: { until: '09:00', weekdays: 'mon' } }, { wait_minutes: 5, config: { until: '09:00', weekdays: [1.5] } }]) {
      const r = await put(2, body);
      assert.deepEqual([r.status, r.body.code], [400, 'until'], JSON.stringify(body));
    }
    assert.equal((await put(2, { wait_minutes: -1 })).body.code, 'wait');
    assert.deepEqual([state.nodes[1].wait_minutes, state.nodes[1].config], [60, {}], 'nothing was saved');
    assert.equal((await addBox(1, { kind: 'wait', after_id: 1 })).body.code, 'until', 'a new one without any time');
  });
  test('where a workflow ends: several stages, or the stages it is meant for, and what else ends it — only this workspace\'s stages', async () => {
    await newFlow();
    const saved = async config => (await put(1, { config })).body.flow.nodes[0].config;
    assert.deepEqual(await saved({ trigger: 'manual', stop_stage_ids: [32, 31] }), { ...START, trigger: 'manual', stop_stage_ids: [32, 31] });
    assert.deepEqual(await saved({ trigger: 'manual', stay_stage_ids: [31, 32], stop_on: ['meeting', 'opt_out'] }), { ...START, trigger: 'manual', stay_stage_ids: [31, 32], stop_on: ['opt_out', 'meeting'] }, 'in the list\'s own order (Part 13)');
    for (const [config, code] of [[{ trigger: 'manual', stay_stage_ids: [31, 91] }, 'stage'], [{ trigger: 'manual', stay_stage_ids: 'x' }, 'stage'], [{ trigger: 'manual', stop_on: ['reply'] }, 'start'], [{ trigger: 'manual', stop_on: 'meeting' }, 'start']]) {
      assert.equal((await put(1, { config })).body.code, code, JSON.stringify(config));
    }
  });
  test('a member is refused; another workspace\'s box, or none, is "not found"', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    assert.equal((await put(2, { ...EMAIL, title: 'x' }, member)).status, 403);
    assert.deepEqual([(await put(2, { ...EMAIL, title: 'taken' }, other)).status, state.nodes[1].title], [404, 'Welcome']);
    for (const id of [99, 'abc', '0']) assert.equal((await put(id, EMAIL)).status, 404, String(id));
  });
});

// Part 13: many more rules for where a workflow ends (utils/journey-ends.js) — each switched on by itself in stop_on,
// those that have settings with them in stop_set. Saved with the start, through the start's own address.
describe('where a workflow ends: the other rules', () => {
  const ends = require('../../utils/journey-ends');
  const saved = async config => { const r = await put(1, { config }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.flow.nodes[0].config; };
  const refused = async config => { const r = await put(1, { config }); return [r.status, r.body.code]; };
  const SET = { urgency: { min_urgency: 3 }, field: { field_key: 'finanzierung', value: ' Ja ' }, contact_field: { field_key: 'kundenstatus' }, document: { doc_type: 'vertrag' },
    call_result: { results: ['not_reached', 'interested'] }, max_days: { days: 30 }, other_flow: { flow_id: 2 } };
  test('every rule can be switched on; the answer carries them in the list\'s own order, with the settings of those that have any', async () => {
    await newFlow(); await newFlow(owner, 'Second');   // workflows 1 and 2; their starts are boxes 1 and 2
    const c = await saved({ trigger: 'manual', stop_on: [...ends.STOP_ON].reverse(), stop_set: SET });
    assert.deepEqual(c, { ...START, trigger: 'manual', stop_on: ends.STOP_ON, stop_set: { ...SET, field: { field_key: 'finanzierung', value: 'Ja' }, call_result: { results: ['interested', 'not_reached'] } } });
    assert.deepEqual(state.nodes[0].config, c, 'what is answered is what was written');
    const listed = (await member.request('GET', '/api/journey')).body.flows[0].nodes[0].config;
    assert.deepEqual([listed.stop_on, listed.stop_set], [c.stop_on, c.stop_set], 'and everyone reads it back with the workflows');
  });
  test('one rule alone; rules without settings; settings of a rule that is off are left out', async () => {
    await newFlow();
    assert.deepEqual(await saved({ trigger: 'manual', stop_on: ['max_days'], stop_set: { max_days: { days: 14 }, urgency: { min_urgency: 9 } } }), { ...START, trigger: 'manual', stop_on: ['max_days'], stop_set: { max_days: { days: 14 } } });
    assert.deepEqual(await saved({ trigger: 'manual', stop_on: ['task_done', 'assigned', 'document'], stop_set: { max_days: { days: 14 } } }), { ...START, trigger: 'manual', stop_on: ['assigned', 'document', 'task_done'] });
    assert.deepEqual(await saved({ trigger: 'manual' }), { ...START, trigger: 'manual' }, 'saved again without them: they are gone');
  });
  test('both stage rules at once, together with the others', async () => {
    await newFlow();
    assert.deepEqual(await saved({ trigger: 'stage', stage_id: 31, stop_stage_ids: [32], stay_stage_ids: [31], stop_on: ['meeting_cancelled', 'call_inbound'] }),
      { ...START, trigger: 'stage', stage_id: 31, stop_stage_ids: [32], stay_stage_ids: [31], stop_on: ['call_inbound', 'meeting_cancelled'] });
  });
  test('refused with a code, and the start stays as it was: a rule that is none, or one without what it needs', async () => {
    await newFlow(); await newFlow(owner, 'Second');
    const before = await saved({ trigger: 'manual', stop_on: ['assigned'] });
    const cases = [
      [{ stop_on: ['reply'] }, 'start'], [{ stop_on: 'meeting' }, 'start'], [{ stop_on: ['meeting'], stop_set: 'x' }, 'start'], [{ stop_on: ['meeting'], stop_set: [] }, 'start'],
      [{ stop_on: ['urgency'] }, 'start'], [{ stop_on: ['urgency'], stop_set: { urgency: { min_urgency: 5 } } }, 'start'],
      [{ stop_on: ['max_days'] }, 'start'], [{ stop_on: ['max_days'], stop_set: { max_days: { days: 366 } } }, 'start'], [{ stop_on: ['max_days'], stop_set: { max_days: { days: '30' } } }, 'start'],
      [{ stop_on: ['call_result'] }, 'start'], [{ stop_on: ['call_result'], stop_set: { call_result: { results: [] } } }, 'start'], [{ stop_on: ['call_result'], stop_set: { call_result: { results: ['won'] } } }, 'start'],
      [{ stop_on: ['document'], stop_set: { document: { doc_type: 'rechnung' } } }, 'start'],
      [{ stop_on: ['field'], stop_set: { field: { field_key: 'finanzierung', value: 7 } } }, 'start'],
      [{ stop_on: ['field'] }, 'field'], [{ stop_on: ['field'], stop_set: { field: { field_key: 'two words' } } }, 'field'], [{ stop_on: ['contact_field'], stop_set: { contact_field: {} } }, 'field'],
      [{ stop_on: ['other_flow'] }, 'flow'], [{ stop_on: ['other_flow'], stop_set: { other_flow: { flow_id: '2' } } }, 'flow'],
    ];
    for (const [more, code] of cases) assert.deepEqual(await refused({ trigger: 'manual', ...more }), [400, code], JSON.stringify(more));
    assert.deepEqual(state.nodes[0].config, before, 'nothing was written');
  });
  test('what a rule names must be this workspace\'s own: a deal field, a contact field, another workflow — never the workflow itself', async () => {
    await newFlow(); await newFlow(owner, 'Second'); await newFlow(other, 'Theirs');   // workflows 1, 2 and — in another workspace — 3
    const field = field_key => ({ trigger: 'manual', stop_on: ['field'], stop_set: { field: { field_key } } });
    const contact = field_key => ({ trigger: 'manual', stop_on: ['contact_field'], stop_set: { contact_field: { field_key } } });
    const flow = flow_id => ({ trigger: 'manual', stop_on: ['other_flow'], stop_set: { other_flow: { flow_id } } });
    assert.equal((await saved(field('finanzierung'))).stop_set.field.field_key, 'finanzierung');
    assert.equal((await saved(contact('kundenstatus'))).stop_set.contact_field.field_key, 'kundenstatus');
    assert.equal((await saved(flow(2))).stop_set.other_flow.flow_id, 2);
    const before = JSON.stringify(state.nodes[0].config);
    for (const [config, code, why] of [[field('fremd'), 'field', 'another workspace\'s deal field'], [field('kundenstatus'), 'field', 'a contact field is no deal field'], [contact('finanzierung'), 'field', 'a deal field is no contact field'],
      [field("x';DROP--"), 'field', 'a key nobody has'], [flow(1), 'flow', 'the workflow itself'], [flow(3), 'flow', 'another workspace\'s workflow'], [flow(999), 'flow', 'none']]) {
      assert.deepEqual(await refused(config), [400, code], why);
    }
    assert.equal(JSON.stringify(state.nodes[0].config), before, 'nothing was written');
    const asked = state.calls.filter(c => /FROM (deal_fields|custom_fields) WHERE workspace_id = \$1 AND field_key = \$2/.test(c.sql));
    assert.ok(asked.length >= 5 && asked.every(c => c.params[0] === WS), 'the workspace of the session, and the key as a value');
    assert.ok(asked.some(c => c.params[1] === "x';DROP--"));
  });
  test('what a rule names is asked again when the workflow is switched on: gone since, it is not switched on', async () => {
    await newFlow(); await newFlow(owner, 'Second');
    await saved({ trigger: 'manual', stop_on: ['other_flow', 'contact_field'], stop_set: { other_flow: { flow_id: 2 }, contact_field: { field_key: 'kundenstatus' } } });
    const on = () => owner.request('PUT', '/api/journey/flows/1', { active: true });
    const gone = FIELDS.findIndex(f => f.field_key === 'kundenstatus');
    const [kept] = FIELDS.splice(gone, 1);   // the contact field is deleted in Settings
    try { const r = await on(); assert.deepEqual([r.status, r.body.code, state.flows[0].active], [400, 'field', false]); } finally { FIELDS.splice(gone, 0, kept); }
    await owner.request('DELETE', '/api/journey/flows/2');   // the other workflow is deleted
    const r = await on();
    assert.deepEqual([r.status, r.body.code, state.flows[0].active], [400, 'flow', false]);
    assert.ok(!state.engine.some(e => e[0] === 'baseline'), 'nothing was written down for a workflow that was not switched on');
    await saved({ trigger: 'manual', stop_on: ['contact_field'], stop_set: { contact_field: { field_key: 'kundenstatus' } } });
    assert.equal((await on()).body.flow.active, true, 'with what it names in place it is switched on');
  });
  test('a member changes none of it; another workspace\'s start is "not found"', async () => {
    await newFlow();
    const config = { trigger: 'manual', stop_on: ['assigned'] };
    assert.equal((await put(1, { config }, member)).status, 403);
    assert.equal((await put(1, { config }, other)).status, 404);
    assert.ok(!('stop_on' in state.nodes[0].config));
  });
  test('the lines that make it so', () => {
    const route = read('routes/journey.js'), start = read('utils/journey-triggers.js');
    assert.match(route, /return c \? triggers\.checkStart\(c, \{ tz \}\) : \{ code: 'start' \};/, 'the route adds nothing of its own to what a start may hold');
    assert.match(route, /const gone = await triggers\.foreignRefs\(pool, req\.workspaceId, id, config\);/);
    assert.match(start, /if \(ended\.code\) return \{ code: ended\.code \};\s+if \(ended\.stop_on\.length\) config\.stop_on = ended\.stop_on;\s+if \(Object\.keys\(ended\.stop_set\)\.length\) config\.stop_set = ended\.stop_set;/);
    for (const code of ['start', 'field', 'flow']) assert.match(route, new RegExp(`^  ${code}:\\s+\\[400, `, 'm'), `the refusal "${code}" has its sentence`);
  });
});

describe('the board: a box\'s place and its line', () => {
  const place = (id, body, srv = owner) => srv.request('PUT', `/api/journey/nodes/${id}/place`, body);
  const next = (id, next_id, srv = owner) => srv.request('PUT', `/api/journey/nodes/${id}/next`, { next_id });
  test('a place is kept as two whole numbers on the board; anything else is refused', async () => {
    await newFlow();
    assert.deepEqual((await place(1, { x: 420, y: 60 })).body, { success: true });
    assert.deepEqual([state.nodes[0].x, state.nodes[0].y], [420, 60]);
    for (const body of [{ x: -1, y: 0 }, { x: 1.5, y: 0 }, { x: '10', y: 0 }, { x: 0 }, { x: 20001, y: 0 }, {}]) assert.equal((await place(1, body)).body.code, 'place', JSON.stringify(body));
    assert.equal((await place(1, { x: 1, y: 1 }, member)).status, 403);
    assert.equal((await place(1, { x: 1, y: 1 }, other)).status, 404);
    assert.deepEqual([state.nodes[0].x, state.nodes[0].y], [420, 60]);
  });
  test('a line is drawn to another box of the same workflow, and taken away again', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, title: 'a', after_id: null }); await addBox(1, { ...EMAIL, title: 'b', after_id: null });
    assert.deepEqual(chain((await next(1, 3)).body.flow).map(n => n.title), ['', 'b']);
    assert.deepEqual(chain((await next(3, 2)).body.flow).map(n => n.title), ['', 'b', 'a']);
    assert.deepEqual(chain((await next(1, null)).body.flow).map(n => n.title), [''], 'taken away: the chain ends at the start');
  });
  test('never to the start, to the box itself, round in a circle, or into another workflow', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, title: 'a', after_id: 1 }); await addBox(1, { ...EMAIL, title: 'b', after_id: 2 });   // 1 → 2 → 3
    await newFlow(owner, 'B');   // start 4
    await addBox(1, { ...EMAIL, title: 'alone', after_id: null });   // 5: no line leads to it, so a line from it to the start would close no circle
    for (const [id, to] of [[2, 1], [5, 1], [2, 2], [3, 2], [3, 4], [2, 999], [2, '3'], [2, 0]]) {
      const r = await next(id, to);
      assert.deepEqual([r.status, r.body.code], [400, 'line'], `${id} → ${to}`);
    }
    assert.deepEqual(state.nodes.slice(0, 3).map(n => n.next_id), [2, 3, null], 'nothing changed');
    assert.equal((await next(2, 3, member)).status, 403);
    assert.equal((await next(2, 3, other)).status, 404);
  });
});

describe('deleting a box', () => {
  const del = (id, srv = owner) => srv.request('DELETE', `/api/journey/nodes/${id}`);
  test('the box before it is joined to the box after it, and a deal that waits at it goes on to that box', async () => {
    await newFlow();
    await addBox(1, { ...EMAIL, title: 'a', after_id: 1 }); await addBox(1, { ...EMAIL, title: 'b', after_id: 2 }); await addBox(1, { ...EMAIL, title: 'c', after_id: 3 });
    state.runs = [{ id: 1, workspace_id: WS, node_id: 3 }, { id: 2, workspace_id: WS, node_id: 2 }];
    const r = await del(3);
    assert.deepEqual(chain(r.body.flow).map(n => n.title), ['', 'a', 'c']);
    assert.deepEqual(state.runs.map(x => x.node_id), [4, 2]);
    assert.deepEqual(chain((await del(4)).body.flow).map(n => n.title), ['', 'a'], 'the last box: the line simply ends');
  });
  // Found by the bug hunt of 2026-11-19: the row kept the deleted box's time, so the box behind it happened early.
  test('a deal that waited at a deleted box gets the next box at THAT box\'s time: the deleted wait no longer counts, the next one does', async () => {
    await newFlow();
    await addBox(1, { ...EMAIL, title: 'a', wait_minutes: 60, after_id: 1 }); await addBox(1, { ...EMAIL, title: 'b', wait_minutes: 120, after_id: 2 });   // start → a (60 min) → b (120 min)
    const reached = Date.parse('2026-11-19T08:00:00Z');   // when the deal reached box a
    state.runs = [{ id: 1, workspace_id: WS, node_id: 2, status: 'waiting', due_at: new Date(reached + 60 * 60000) },
      { id: 2, workspace_id: WS, node_id: 2, status: 'working', due_at: new Date(reached + 60 * 60000) },   // its step is being done this moment
      { id: 3, workspace_id: OTHER, node_id: 2, status: 'waiting', due_at: new Date(reached) }];            // never another workspace's row
    await del(2);
    assert.deepEqual([state.runs[0].node_id, state.runs[0].due_at.toISOString()], [3, '2026-11-19T10:00:00.000Z'], 'two hours after it reached the deleted box — not one, and not three');
    assert.deepEqual([state.runs[1].node_id, state.runs[1].status], [3, 'working'], 'a row that is being worked on follows as it is');
    assert.deepEqual([state.runs[2].node_id, state.runs[2].due_at.toISOString()], [2, '2026-11-19T08:00:00.000Z']);
  });
  test('a wait that was made longer after the deal got there does not make the next box early: never before the row was last put somewhere', async () => {
    await newFlow();
    await addBox(1, { ...EMAIL, title: 'a', wait_minutes: 60, after_id: 1 }); await addBox(1, { ...EMAIL, title: 'b', wait_minutes: 120, after_id: 2 });
    const reached = Date.parse('2026-11-19T08:00:00Z');
    state.runs = [{ id: 1, workspace_id: WS, node_id: 2, status: 'waiting', due_at: new Date(reached + 60 * 60000), updated_at: new Date(reached) }];
    await put(2, { ...EMAIL, title: 'a', wait_minutes: 600 });   // the wait of box a, changed from 1 hour to 10 while the deal waits
    await del(2);
    assert.equal(state.runs[0].due_at.toISOString(), '2026-11-19T10:00:00.000Z', 'two hours after it really got there — not seven hours before that');
  });
  test('with no box behind the deleted one the workflow is done for a deal that waited there — at once, not when the old time comes', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, title: 'a', wait_minutes: 4320, after_id: 1 });
    state.runs = [{ id: 1, workspace_id: WS, node_id: 2, status: 'waiting', due_at: new Date('2026-11-22T08:00:00Z') }];
    await del(2);
    assert.deepEqual(state.runs[0], { id: 1, workspace_id: WS, node_id: null, status: 'done', due_at: null });
  });
  test('behind the deleted box a Wait box that holds on until a time of day still does', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, title: 'a', wait_minutes: 60, after_id: 1 });
    await addBox(1, { kind: 'wait', wait_minutes: 0, config: { until: '09:00' }, after_id: 2 });
    state.runs = [{ id: 1, workspace_id: WS, node_id: 2, status: 'waiting', due_at: new Date('2026-11-19T15:00:00Z') }];   // reached at 14:00 UTC
    await del(2);
    assert.equal(state.runs[0].due_at.toISOString(), '2026-11-20T08:00:00.000Z', 'the next 09:00 on the saver\'s clock (Berlin, winter) after it reached the deleted box');
  });
  test('the start is never deleted; a member is refused; another workspace\'s box is "not found" and stays', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    assert.deepEqual([(await del(1)).body.code, state.nodes.length], ['start_fixed', 2]);
    assert.equal((await del(2, member)).status, 403);
    assert.equal((await del(2, other)).status, 404);
    assert.equal(state.nodes.length, 2);
  });
});

// Part 11: a box that asks a question about the deal and has two lines out — "yes" (next_id) and "no" (else_id).
describe('a branch box', () => {
  const IF = { kind: 'branch', wait_minutes: 0, config: { test: 'meeting' } };
  const next = (id, body, srv = owner) => srv.request('PUT', `/api/journey/nodes/${id}/next`, body);
  const del = (id, srv = owner) => srv.request('DELETE', `/api/journey/nodes/${id}`);
  const lines = () => state.nodes.map(n => [n.id, n.next_id, n.else_id]);
  test('needs no title: its question is what it is — one of the known ones, kept with only what that question uses', async () => {
    await newFlow();
    const cases = [
      [{ test: 'meeting', stage_ids: [31], min_urgency: 2, field_key: 'finanzierung', x: 1 }, { test: 'meeting' }],
      [{ test: 'stage', stage_ids: [32, 31, 32] }, { test: 'stage', stage_ids: [32, 31] }],
      [{ test: 'urgency', min_urgency: 3 }, { test: 'urgency', min_urgency: 3 }],
      [{ test: 'field', field_key: 'finanzierung' }, { test: 'field', field_key: 'finanzierung' }],
      [{ test: 'field', field_key: 'finanzierung', value: '  Ja ' }, { test: 'field', field_key: 'finanzierung', value: 'Ja' }],
      [{ test: 'field', field_key: 'einzug', value: '   ' }, { test: 'field', field_key: 'einzug' }],
    ];
    for (const [config, kept] of cases) {
      const r = await addBox(1, { kind: 'branch', wait_minutes: 60, config, after_id: null });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const made = r.body.flow.nodes.at(-1);
      assert.deepEqual([made.kind, made.title, made.wait_minutes, made.config, made.else_id], ['branch', '', 60, kept, null], JSON.stringify(config));
    }
    for (const test of ['answered', 'opt_out', 'has_email', 'has_phone', 'assigned']) assert.equal((await addBox(1, { kind: 'branch', config: { test }, after_id: null })).status, 201, test);
    assert.equal((await addBox(1, { ...IF, title: 'Booked yet', after_id: null })).body.flow.nodes.at(-1).title, 'Booked yet', 'a name may be given to it');
  });
  test('refused with a code, nothing written: no question, an unknown one, or one without what it needs', async () => {
    await newFlow();
    const cases = [[undefined, 'branch'], [{}, 'branch'], [{ test: 'weather' }, 'branch'], [{ test: 'constructor' }, 'branch'], [{ test: ['meeting'] }, 'branch'], ['meeting', 'branch'],
      [{ test: 'stage' }, 'stage'], [{ test: 'stage', stage_ids: [] }, 'stage'], [{ test: 'stage', stage_ids: ['31'] }, 'stage'], [{ test: 'stage', stage_ids: Array.from({ length: 21 }, (_, i) => i + 1) }, 'stage'],
      [{ test: 'urgency' }, 'branch'], [{ test: 'urgency', min_urgency: 0 }, 'branch'], [{ test: 'urgency', min_urgency: 5 }, 'branch'], [{ test: 'urgency', min_urgency: '3' }, 'branch'],
      [{ test: 'field' }, 'field'], [{ test: 'field', field_key: 'two words' }, 'field'], [{ test: 'field', field_key: 'finanzierung', value: 7 }, 'branch'], [{ test: 'field', field_key: 'finanzierung', value: 'x'.repeat(201) }, 'branch']];
    for (const [config, code] of cases) {
      const r = await addBox(1, { kind: 'branch', config, after_id: 1 });
      assert.deepEqual([r.status, r.body.code], [400, code], JSON.stringify(config));
    }
    assert.equal(state.nodes.length, 1, 'only the start is there');
    assert.equal(writes().filter(c => /^INSERT INTO journey_nodes \(workspace_id, flow_id, kind, title/.test(c.sql)).length, 0);
  });
  test('what a question names must be this workspace\'s own: its stages, and one of its deal fields', async () => {
    await newFlow();
    for (const [config, code] of [[{ test: 'stage', stage_ids: [31, 91] }, 'stage'], [{ test: 'stage', stage_ids: [12345] }, 'stage'], [{ test: 'field', field_key: 'fremd' }, 'field'],
      [{ test: 'field', field_key: 'kundenstatus' }, 'field'], [{ test: 'field', field_key: "x'; DROP TABLE deals; --" }, 'field']]) {
      assert.equal((await addBox(1, { kind: 'branch', config, after_id: 1 })).body.code, code, JSON.stringify(config));
    }
    const asked = state.calls.filter(c => /FROM deal_fields WHERE workspace_id = \$1 AND field_key = \$2/.test(c.sql));
    assert.ok(asked.length >= 2 && asked.every(c => c.params[0] === WS), 'the field\'s key is a value of the question to the database, never a part of it');
    assert.equal(state.nodes.length, 1);
    // changing a branch box asks the same
    await addBox(1, { ...IF, after_id: 1 });
    assert.equal((await put(2, { config: { test: 'stage', stage_ids: [91] } })).body.code, 'stage');
    assert.equal((await put(2, { config: { test: 'weather' } })).body.code, 'branch');
    assert.deepEqual((await put(2, { wait_minutes: 1440, config: { test: 'stage', stage_ids: [31] } })).body.flow.nodes[1].config, { test: 'stage', stage_ids: [31] });
    assert.deepEqual([state.nodes[1].kind, state.nodes[1].wait_minutes], ['branch', 1440], 'its kind stays');
  });
  test('behind its "yes" line a new box takes over that line; behind its "no" line, the other one', async () => {
    await newFlow();
    await addBox(1, { ...IF, after_id: 1 });                                            // 2: the branch, behind the start
    await addBox(1, { ...EMAIL, title: 'yes', after_id: 2 });                           // 3
    await addBox(1, { ...EMAIL, title: 'no', after_id: 2, side: 'else' });              // 4
    assert.deepEqual(lines(), [[1, 2, null], [2, 3, 4], [3, null, null], [4, null, null]]);
    await addBox(1, { ...EMAIL, title: 'no, first', after_id: 2, side: 'else' });       // 5: between the branch and box 4
    await addBox(1, { ...EMAIL, title: 'yes, first', after_id: 2, side: 'next' });      // 6: any other side is the box's one line
    assert.deepEqual(lines(), [[1, 2, null], [2, 6, 5], [3, null, null], [4, null, null], [5, 4, null], [6, 3, null]]);
  });
  test('only a branch box has a "no" side: behind any other box that is refused', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    for (const after_id of [1, 2, 999]) {
      const r = await addBox(1, { ...EMAIL, title: 'x', after_id, side: 'else' });
      assert.deepEqual([r.status, r.body.code], [400, 'after'], String(after_id));
    }
    assert.equal(state.nodes.length, 2);
    await addBox(1, { ...IF, after_id: 2 });   // 3
    await newFlow(owner, 'B');                 // workflow 2, its start is box 4
    assert.equal((await addBox(2, { ...EMAIL, after_id: 3, side: 'else' })).body.code, 'after', 'a branch box of another workflow');
    assert.equal((await addBox(1, { ...EMAIL, after_id: 3, side: 'else' }, member)).status, 403);
  });
  test('each of its two lines is drawn and taken away by itself; no other box has a second one', async () => {
    await newFlow(); await addBox(1, { ...IF, after_id: 1 });                                   // 1 → 2 (branch)
    await addBox(1, { ...EMAIL, title: 'a', after_id: null }); await addBox(1, { ...EMAIL, title: 'b', after_id: null });   // 3, 4 alone
    assert.equal((await next(2, { next_id: 3 })).status, 200);
    const r = await next(2, { next_id: 4, side: 'else' });
    assert.equal(r.body.flow.nodes[1].else_id, 4, 'the answer carries the second line');
    assert.deepEqual(lines()[1], [2, 3, 4]);
    await next(2, { next_id: null, side: 'else' });
    assert.deepEqual(lines()[1], [2, 3, null], 'the "yes" line stays');
    await next(2, { next_id: 4, side: 'else' }); await next(2, { next_id: null });
    assert.deepEqual(lines()[1], [2, null, 4], 'and the other way round');
    for (const id of [1, 3]) assert.deepEqual([(await next(id, { next_id: 4, side: 'else' })).body.code, lines()[id - 1][2]], ['line', null], `box ${id} is no branch`);
    assert.equal((await next(2, { next_id: 3, side: 'else' }, member)).status, 403);
    assert.equal((await next(2, { next_id: 3, side: 'else' }, other)).status, 404);
  });
  test('no line may lead round in a circle — along "yes" or along "no"', async () => {
    await newFlow(); await addBox(1, { ...IF, after_id: 1 });                                  // 1 → 2 (branch)
    await addBox(1, { ...EMAIL, title: 'yes', after_id: 2 });                                  // 3
    await addBox(1, { ...EMAIL, title: 'no', after_id: 2, side: 'else' });                     // 4
    await addBox(1, { ...EMAIL, title: 'after no', after_id: 4 });                             // 5
    const before = JSON.stringify(lines());
    for (const [id, body, why] of [[5, { next_id: 2 }, 'back to the branch along its "no" side'], [3, { next_id: 2 }, 'back along its "yes" side'], [2, { next_id: 2, side: 'else' }, 'to itself'],
      [5, { next_id: 4 }, 'back within the "no" side'], [2, { next_id: 1, side: 'else' }, 'to the start'], [4, { next_id: 2 }, 'from the "no" side\'s first box']]) {
      const r = await next(id, body);
      assert.deepEqual([r.status, r.body.code], [400, 'line'], why);
    }
    assert.equal(JSON.stringify(lines()), before, 'nothing changed');
    assert.equal((await next(3, { next_id: 5 })).status, 200, 'the two sides may meet again in one box');
    assert.equal((await next(5, { next_id: 3 })).body.code, 'line', 'but then not lead back');
  });
  test('a deleted box is taken out of both kinds of line; deleting the branch box joins what was before it to its "yes" side', async () => {
    await newFlow(); await addBox(1, { ...IF, after_id: 1 });                                  // 2
    await addBox(1, { ...EMAIL, title: 'yes', after_id: 2 });                                  // 3
    await addBox(1, { ...EMAIL, title: 'no', after_id: 2, side: 'else' });                     // 4
    await addBox(1, { ...EMAIL, title: 'after no', after_id: 4 });                             // 5
    state.runs = [{ id: 1, workspace_id: WS, node_id: 4 }, { id: 2, workspace_id: WS, node_id: 2 }];
    await del(4);
    assert.deepEqual(lines(), [[1, 2, null], [2, 3, 5], [3, null, null], [5, null, null]], 'the "no" line now leads to what came after the deleted box');
    assert.equal(state.runs[0].node_id, 5, 'and a deal that waited at it goes on there');
    await del(5);
    assert.deepEqual(lines()[1], [2, 3, null], 'the last box of a side: that line simply ends');
    await del(2);
    assert.deepEqual(lines(), [[1, 3, null], [3, null, null]]);
    assert.equal(state.runs[1].node_id, 3, 'a deal that waited at the question goes on along what was "yes"');
  });
  test('the lines that make it so', () => {
    const code = read('routes/journey.js');
    assert.match(code, /const ACTIONS = \['call', 'email', 'whatsapp', 'sms', 'task', 'move', 'wait', 'branch'\];/);
    assert.match(code, /if \(elseSide && node\.kind !== 'branch'\) return refuse\(res, 'line'\);/);
    assert.match(code, /todo\.push\(byId\.get\(at\.next_id\), byId\.get\(at\.else_id\)\);/, 'the circle is looked for along both lines');
    assert.match(code, /if \(kind === 'branch'\) return branch\.foreignRefs\(db, wid, config\);/);
    assert.match(read('db.js'), /ALTER TABLE journey_nodes ADD COLUMN IF NOT EXISTS else_id INTEGER REFERENCES journey_nodes\(id\) ON DELETE SET NULL/);
  });
});

// Part 15: the whole record. Everything that is done to a workflow is an entry with who did it, written by the route
// after the change; what the engine writes (a deal entering, a step, the end) is journey-run.test.js. The record is
// read by everyone in the workspace, and stays when the workflow is deleted.
describe('the record', () => {
  const next = (id, body, srv = owner) => srv.request('PUT', `/api/journey/nodes/${id}/next`, body);
  const del = (id, srv = owner) => srv.request('DELETE', `/api/journey/nodes/${id}`);
  const flowPut = (id, body, srv = owner) => srv.request('PUT', `/api/journey/flows/${id}`, body);
  const history = (query = '', srv = member) => srv.request('GET', `/api/journey/history${query}`);
  const flowEntries = () => state.log.filter(e => e.event === 'flow').map(e => [e.detail, e.kind, e.title, e.flow_name, e.actor_name]);
  const quiet = async fn => { const words = [], real = console.error; console.error = (...a) => words.push(a.join(' ')); try { return [await fn(), words]; } finally { console.error = real; } };

  test('everything that is done to a workflow is an entry with who did it', async () => {
    await newFlow(owner, 'Nurture');                                                      // workflow 1, its start is box 1
    await put(1, { config: { trigger: 'manual' } }, admin);
    await addBox(1, { ...EMAIL, title: 'Welcome', after_id: 1 }, admin);                  // box 2
    await addBox(1, { kind: 'wait', wait_minutes: 60, after_id: null });                  // box 3, alone
    await put(2, { ...EMAIL, title: 'Welcome!' });
    await next(2, { next_id: 3 });
    await flowPut(1, { active: true });
    await flowPut(1, { active: false }, admin);
    await flowPut(1, { name: 'Nurture 2' });
    await del(3);
    assert.deepEqual(flowEntries(), [
      ['created', '', 'Nurture', 'Nurture', 'Olga Owner'],
      ['start_changed', 'start', '', 'Nurture', 'Adam Admin'],
      ['step_added', 'email', 'Welcome', 'Nurture', 'Adam Admin'],
      ['step_added', 'wait', '', 'Nurture', 'Olga Owner'],
      ['step_changed', 'email', 'Welcome!', 'Nurture', 'Olga Owner'],
      ['line_changed', 'email', 'Welcome!', 'Nurture', 'Olga Owner'],
      ['switched_on', '', 'Nurture', 'Nurture', 'Olga Owner'],
      ['switched_off', '', 'Nurture', 'Nurture', 'Adam Admin'],
      ['renamed', '', 'Nurture 2', 'Nurture 2', 'Olga Owner'],
      ['step_deleted', 'wait', '', 'Nurture 2', 'Olga Owner'],
    ]);
    assert.ok(state.log.every(e => e.workspace_id === WS && e.flow_id === 1 && e.deal_id === null && e.status === ''), 'of this workspace, of that workflow, of no deal');
    assert.deepEqual(state.log.map(e => e.actor_id), [1, 2, 2, 1, 1, 1, 1, 2, 1, 1]);
    assert.deepEqual([state.log[2].node_id, state.log[4].node_id, state.log[5].node_id, state.log[9].node_id], [2, 2, 2, null], 'a step that is gone is named by its kind and title: its id leads nowhere');
    for (const e of state.log) assert.ok(require('../../utils/journey-log').FLOW_DETAILS.includes(e.detail), e.detail);
  });
  test('what changes nothing is no entry: the same name again, on when it is on, a box\'s place, a refused change, a member\'s try', async () => {
    await newFlow(owner, 'Nurture'); await put(1, { config: { trigger: 'manual' } }); await addBox(1, { ...EMAIL, after_id: 1 }); await flowPut(1, { active: true });
    const before = state.log.length;
    await flowPut(1, { name: 'Nurture' });
    await flowPut(1, { active: true });
    await owner.request('PUT', '/api/journey/nodes/2/place', { x: 400, y: 80 });
    assert.equal((await addBox(1, { kind: 'email', title: '', after_id: 1 })).status, 400);
    assert.equal((await next(2, { next_id: 1 })).status, 400);
    assert.equal((await put(1, { config: { trigger: 'lead' } })).body.code, 'active');
    assert.equal((await addBox(1, { ...EMAIL, after_id: 1 }, member)).status, 403);
    assert.equal((await flowPut(1, { name: 'X' }, member)).status, 403);
    assert.equal((await del(2, other)).status, 404);
    assert.equal((await owner.request('DELETE', '/api/journey/flows/99')).status, 404);
    assert.equal(state.log.length, before);
    await flowPut(1, { name: 'Nurture B', active: false });
    assert.deepEqual(flowEntries().slice(-2).map(e => e[0]), ['switched_off', 'renamed'], 'two changes in one request are two entries');
  });
  test('deleting a workflow keeps its record: every entry stays, with the workflow\'s name and no workflow', async () => {
    await newFlow(owner, 'Nurture'); await addBox(1, { ...EMAIL, after_id: 1 }); await newFlow(owner, 'Other one');
    assert.deepEqual((await owner.request('DELETE', '/api/journey/flows/1', undefined)).body, { success: true });
    assert.deepEqual(state.log.map(e => [e.flow_id, e.flow_name, e.detail]), [[null, 'Nurture', 'created'], [null, 'Nurture', 'step_added'], [2, 'Other one', 'created'], [null, 'Nurture', 'deleted']]);
    assert.deepEqual([state.log[3].title, state.log[3].actor_name], ['Nurture', 'Olga Owner']);
    const r = await history('?q=nurture');
    assert.deepEqual(r.body.entries.map(e => e.detail), ['deleted', 'step_added', 'created'], 'and is still read, found by the name it had');
    assert.ok(read('routes/journey.js').includes("pool.query('DELETE FROM journey_flows WHERE id = $1 AND workspace_id = $2 RETURNING name'"));
  });
  test('a deleted step puts the deals that waited at it on: one entry per deal, and "through" where nothing stood behind it', async () => {
    await newFlow(owner, 'Nurture');
    await addBox(1, { ...EMAIL, title: 'a', wait_minutes: 60, after_id: 1 }); await addBox(1, { ...EMAIL, title: 'b', after_id: 2 });   // start → a → b
    state.runs = [{ id: 1, workspace_id: WS, node_id: 2, deal_id: 60, status: 'waiting', due_at: new Date('2026-11-20T09:00:00Z') },
      { id: 2, workspace_id: WS, node_id: 2, deal_id: 61, status: 'working' },          // its step is being done: it follows, and is no "waited there"
      { id: 3, workspace_id: OTHER, node_id: 2, deal_id: 90, status: 'waiting' }];      // never another workspace's
    state.log.length = 0;
    await del(2);
    assert.deepEqual(state.log.map(e => [e.event, e.detail, e.kind, e.title, e.deal_id, e.deal_title, e.status]),
      [['flow', 'step_deleted', 'email', 'a', null, '', ''], ['moved', 'step_deleted', 'email', 'a', 60, 'Wohnung 3', '']]);
    assert.deepEqual([state.log[1].flow_id, state.log[1].flow_name, state.log[1].actor_id], [1, 'Nurture', null], 'the deal was put on by the change, not by a person\'s hand on the deal');
    state.runs = [{ id: 4, workspace_id: WS, node_id: 3, deal_id: 61, status: 'waiting', due_at: new Date('2026-11-20T09:00:00Z') }];
    state.log.length = 0;
    await del(3);   // the last step: nothing stands behind it
    assert.deepEqual(state.log.map(e => [e.event, e.detail, e.status, e.deal_title]), [['flow', 'step_deleted', '', ''], ['moved', 'step_deleted', '', 'Haus am See'], ['ended', null, 'done', 'Haus am See']]);
  });
  test('the record never undoes a change: an entry that cannot be written is said in the server\'s log, and the change stands', async () => {
    state.logBroken = true;
    const [made, words] = await quiet(() => newFlow(owner, 'Nurture'));
    assert.equal(made.status, 201);
    assert.equal(state.flows.length, 1);
    assert.ok(words.some(w => /an entry of the record could not be written: the record is away/.test(w)));
    const [added] = await quiet(() => addBox(1, { ...EMAIL, after_id: 1 }));
    const [gone] = await quiet(() => del(2));
    const [off] = await quiet(() => owner.request('DELETE', '/api/journey/flows/1'));
    assert.deepEqual([added.status, gone.status, off.status, state.flows.length, state.log.length], [201, 200, 200, 0, 0]);
  });
  test('reading it: everyone in the workspace, newest first, each entry with exactly what the page shows', async () => {
    await newFlow(owner, 'Nurture'); await addBox(1, { ...EMAIL, title: 'Welcome', after_id: 1 }, admin);
    const r = await history();
    assert.equal(r.status, 200, 'a member reads it');
    assert.equal(r.body.more, false);
    assert.deepEqual(r.body.entries.map(e => e.detail), ['step_added', 'created']);
    assert.deepEqual(r.body.entries[0], { id: 2, created_at: 'T2', event: 'flow', flow_id: 1, flow_name: 'Nurture', deal_id: null, deal_title: '', kind: 'email', title: 'Welcome', status: '', detail: 'step_added', actor_name: 'Adam Admin' });
    assert.deepEqual((await history('', other)).body, { entries: [], more: false }, 'another workspace sees nothing of it');
    const asked = state.calls.filter(c => c.sql.startsWith('SELECT l.id, l.created_at, l.event'));
    assert.deepEqual(asked.map(c => c.params[0]), [WS, OTHER], 'the workspace comes from the session');
    assert.deepEqual((await history('?workspace_id=' + OTHER)).body.entries.length, 2, 'never from the address');
  });
  test('narrowed by workflow, deal, kind of event and a text; a page at a time', async () => {
    const log = require('../../utils/journey-log');
    await newFlow(owner, 'Nurture'); await newFlow(owner, 'After the viewing');
    const add = e => log.write(pool, { workspaceId: WS, ...e });
    await add({ flowId: 1, dealId: 60, event: 'entered', detail: 'lead' });
    await add({ flowId: 1, dealId: 60, event: 'step', kind: 'email', title: 'Welcome', status: 'done', detail: 'lead@example.de' });
    await add({ flowId: 1, dealId: 60, event: 'retry', kind: 'email', title: 'Second mail', status: 'retry', detail: 'unreachable' });
    await add({ flowId: 2, dealId: 61, event: 'entered', detail: 'manual', actorId: 3 });
    await add({ flowId: 1, dealId: 60, event: 'ended', status: 'stopped', detail: 'meeting_booked' });
    await add({ workspaceId: OTHER, dealId: 90, event: 'entered', detail: 'lead', flowName: 'Nurture' });   // another workspace's, with the same name
    const ids = async q => (await history(q)).body.entries.map(e => e.id);
    assert.deepEqual(await ids(''), [7, 6, 5, 4, 3, 2, 1]);
    assert.deepEqual(await ids('?flow_id=2'), [6, 2]);
    assert.deepEqual(await ids('?deal_id=60'), [7, 5, 4, 3]);
    assert.deepEqual(await ids('?group=steps'), [5, 4]); assert.deepEqual(await ids('?group=deals'), [7, 6, 3]); assert.deepEqual(await ids('?group=flow'), [2, 1]);
    assert.deepEqual(await ids('?q=WELCOME'), [4], 'a step\'s title, whatever the capitals');
    assert.deepEqual(await ids('?q=haus%20am'), [6], 'a deal\'s title'); assert.deepEqual(await ids('?q=viewing'), [6, 2], 'a workflow\'s name');
    assert.deepEqual(await ids('?flow_id=1&group=deals&q=wohnung'), [7, 3], 'all of them together');
    const page = await history('?limit=3');
    assert.deepEqual([page.body.entries.map(e => e.id), page.body.more], [[7, 6, 5], true]);
    const rest = await history('?limit=3&before=5');
    assert.deepEqual([rest.body.entries.map(e => e.id), rest.body.more], [[4, 3, 2], true]);
    const last = await history('?limit=3&before=2');
    assert.deepEqual([last.body.entries.map(e => e.id), last.body.more], [[1], false]);
    assert.equal((await history('?q=manual')).body.entries.length, 0, 'the text is looked for in names and titles, not in the engine\'s words');
  });
  test('what is asked for badly is refused with a code the page has a sentence for, and nothing is read', async () => {
    for (const q of ['?flow_id=x', '?deal_id=0', '?group=everything', '?limit=0', '?limit=201', '?before=-1', '?flow_id=1&flow_id=2', '?q=' + 'x'.repeat(101), '?flow_id=2147483648']) {
      const r = await history(q);
      assert.deepEqual([r.status, r.body.code], [400, 'history'], q);
    }
    assert.ok(!state.calls.some(c => c.sql.startsWith('SELECT l.id, l.created_at, l.event')));
    assert.equal((await history('?flow_id=&group=&q=&limit=&before=')).status, 200, 'an empty value is a value that is not there');
  });
  test('"Activity" still says what the steps did: steps only, the newest hundred', () => {
    const code = read('routes/journey.js');
    assert.match(code, /WHERE l\.flow_id = \$1 AND l\.workspace_id = \$2 AND l\.event = 'step' ORDER BY l\.id DESC LIMIT 100/);
  });
  test('the lines that make it so', () => {
    const code = read('routes/journey.js');
    assert.match(code, /^const note = \(req, entry\) => log\.record\(pool, \{ workspaceId: req\.workspaceId, event: 'flow', actorId: req\.userId, \.\.\.entry \}\);$/m, 'who and where from the session; record(), which never throws');
    assert.equal(code.split('await note(req, ').length - 1, 9, 'created, switched on, switched off, renamed, deleted, a step added, a step or the start changed, a line changed, a step deleted');
    assert.doesNotMatch(code, /log\.write\(/, 'the route only ever uses the writing that cannot undo a change');
    const inTogether = [...code.matchAll(/await together\(async db => \{[\s\S]*?\n\s+\}\);/g)].map(m => m[0]);
    assert.equal(inTogether.length, 4);
    for (const block of inTogether) assert.doesNotMatch(block, /note\(|log\.record\(/, 'never inside statements that stand or fall together: an entry is written after the change has happened');
    assert.match(code, /const out = await log\.history\(pool, req\.workspaceId, req\.query\);\s+if \(out\.code\) return refuse\(res, out\.code\);/);
    assert.match(code, /journeyRun\.include\(pool, \{ workspaceId: req\.workspaceId, flowId: id, dealId, actorId: req\.userId \}\)/);
    assert.match(read('server.js'), /app\.use\('\/api\/journey',\s+require\('\.\/routes\/journey'\)\);/);
  });
});

describe('a deal put into a workflow by hand', () => {
  const inc = (body, srv = member, flow = 1) => srv.request('POST', `/api/journey/flows/${flow}/include`, body);
  test('every member may; the workspace comes from the session, the deal and the workflow from the request', async () => {
    const r = await inc({ deal_id: 60, workspace_id: OTHER });
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    assert.deepEqual(state.engine, [['include', { workspaceId: WS, flowId: 1, dealId: 60, actorId: 3 }]], 'and who put it in, for the record');
  });
  test('what the engine refuses comes back with its code; a deal that is none is not passed on', async () => {
    state.include = { code: 'inactive' };
    assert.deepEqual([(await inc({ deal_id: 60 })).status, (await inc({ deal_id: 60 })).body.code], [409, 'inactive']);
    state.include = { code: 'deal' };
    assert.equal((await inc({ deal_id: 60 })).body.code, 'deal');
    state.engine = [];
    for (const deal_id of [undefined, '60', 0, 1.5]) assert.equal((await inc({ deal_id })).body.code, 'deal', String(deal_id));
    assert.deepEqual(state.engine, []);
  });
});

describe('what a workflow did', () => {
  test('who waits for which step and what the steps did, for everyone in the workspace', async () => {
    await newFlow();
    const r = await member.request('GET', '/api/journey/flows/1/activity');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.counts, { waiting: 2, done: 5 });
    assert.deepEqual(r.body.waiting, [{ deal_id: 60, deal_title: 'Wohnung 3', due_at: '2026-11-20T09:00:00.000Z', kind: 'email', title: 'Second mail' }]);
    assert.equal(r.body.log[0].detail, 'lead@example.de');
    assert.equal((await other.request('GET', '/api/journey/flows/1/activity')).status, 404, 'never another workspace\'s');
    assert.equal((await member.request('GET', '/api/journey/flows/abc/activity')).status, 404);
  });
});

describe('the test of an email step', () => {
  const send = (id, srv = owner, body = {}) => srv.request('POST', `/api/journey/nodes/${id}/test`, body);
  const message = () => Buffer.from(google.find(c => c.url === SEND_URL).body.raw, 'base64url').toString('utf8');
  const partOf = (msg, type) => Buffer.from(msg.match(new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]*?)\\r\\n--`))[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  const connect = (conn = {}) => { state.sender = { email: 'news@firma.de', refresh_token_sealed: mail.sealToken('1//refresh-plain') }; state.mail = [{ workspace_id: WS, email: 'news@firma.de', ...conn }]; };   // (conn: the connection's limits and pause, Part 17)
  // a subject as it reads: a header that holds an umlaut is sent as encoded words, folded over several lines
  const subjectOf = msg => { const raw = msg.match(/\r\nSubject: ((?:[^\r\n]|\r\n )*)\r\n/)[1]; const words = [...raw.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)];
    return words.length ? words.map(w => Buffer.from(w[1], 'base64').toString('utf8')).join('') : raw; };
  test('goes once from the connected address to the caller\'s own, with sample values and the subject marked', async () => {
    await newFlow(); await addBox(1, { kind: 'email', title: 'Hallo {{first_name}}', body: '<p>Guten Tag {{name}} von {{company}}, es geht um {{deal}}.</p>', after_id: 1 });
    connect();
    const r = await send(2, owner, { to: 'victim@example.de', subject: 'spam' });
    assert.deepEqual([r.status, r.body], [200, { success: true, to: 'olga@firma.de' }]);
    const msg = message();
    assert.match(msg, /^From: news@firma\.de\r\nTo: olga@firma\.de\r\nSubject: \[Test\] Hallo Erika\r\n/);
    assert.match(partOf(msg, 'text/html'), /<p>Guten Tag Erika Musterfrau von Muster GmbH, es geht um Beispiel-Deal\.<\/p>/);
    assert.match(partOf(msg, 'text/html'), /Keine weiteren E-Mails erhalten: <a href="https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/test"/);
    assert.match(partOf(msg, 'text/plain'), /Guten Tag Erika Musterfrau von Muster GmbH/);
    assert.doesNotMatch(msg, /victim|spam/);
  });
  // Part 14: every variable has a sample value in the test email, and the workspace's own fields say their names.
  test('every variable is filled with its sample; the caller\'s own address is the contact\'s; a fallback is not needed', async () => {
    const vars = require('../../utils/journey-vars');
    const names = [...vars.NAMES, ...Object.keys(vars.ALIASES)].filter(n => !['unsubscribe', 'abmelden', 'unsubscribe_url'].includes(n));
    await newFlow(); await addBox(1, { kind: 'email', title: '{{deal}} · {{wert}} · {{phase}}', body: names.map(n => `<i>${n}={{${n}|LEER}}</i>`).join('') + '<a href="{{abmelden}}">x</a>', after_id: 1 });
    connect();
    const asked = new Date();
    assert.equal((await send(2)).status, 200);
    // the day and the time are real (Part 18): had the minute turned during the request, the sample is the later one's
    const msg = message(), html = partOf(msg, 'text/html'), at = [asked, new Date()].find(d => html.includes(`<i>time=${vars.clockValues(d).time}</i>`)) || asked;
    const sample = { ...vars.sampleValues(at), email: 'olga@firma.de' };
    assert.equal(subjectOf(msg), '[Test] Beispiel-Deal · 250.000 · Erstgespräch');
    for (const n of vars.NAMES.filter(x => x !== 'unsubscribe')) assert.ok(html.includes(`<i>${n}=${sample[n]}</i>`), `${n}: ${sample[n]}`);
    for (const [de, en] of Object.entries(vars.ALIASES).filter(([, e]) => e !== 'unsubscribe')) assert.ok(html.includes(`<i>${de}=${sample[en]}</i>`), de);
    assert.doesNotMatch(html, /LEER|\{\{/, 'no sample is empty, nothing is left unfilled');
    assert.match(html, /<a href="https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/test">x<\/a>$/, 'the link is the test\'s own, placed where the text says');
    assert.equal(google.filter(c => c.url === SEND_URL).length, 1);
  });
  test('the test email has the line at the end as the step is set: with the text\'s own link only when asked for', async () => {
    const LINE = /Keine weiteren E-Mails erhalten: <a href="https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/test" style="[^"]*">abmelden<\/a><\/p>$/, OWN = '<p>Hi</p><a href="{{unsubscribe_url}}">Abmelden</a>';
    await newFlow();
    await addBox(1, { kind: 'email', title: 'a', body: OWN, config: { footer: true }, after_id: 1 });
    await addBox(1, { kind: 'email', title: 'b', body: OWN, config: { footer: false }, after_id: 1 });
    await addBox(1, { kind: 'email', title: 'c', body: '<p>Hi</p>', config: { footer: false }, after_id: 1 });
    connect();
    const htmlOf = async id => { google.length = 0; assert.equal((await send(id)).status, 200); return partOf(message(), 'text/html'); };
    const both = await htmlOf(2);
    assert.match(both, /^<p>Hi<\/p><a href="https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/test">Abmelden<\/a><p style="/); assert.match(both, LINE);
    assert.equal(await htmlOf(3), '<p>Hi</p><a href="https://crm.example.de/api/journey/unsubscribe/test">Abmelden</a>', 'switched off: the text\'s own link alone');
    assert.match(await htmlOf(4), LINE, 'no link in the text: the line, whatever was asked');
  });
  test('the day and the time in a test email are those of the moment, on the clock of who asks for it', async () => {
    const vars = require('../../utils/journey-vars');
    inject('utils/journey-run.js', engine);
    const far = await serve({ '/api/journey': loadRoute('journey.js', { pool, user: { id: 1, workspaceId: WS, role: 'owner', timezone: 'Pacific/Kiritimati' }, notifications: { notify: () => {}, notifyUser: async () => true } }) });
    try {
      await newFlow(); await addBox(1, { kind: 'email', title: 'Stand {{jahr}}', body: '<i>{{date_time}}|{{weekday}}|{{month}}|{{datum}}|{{uhrzeit}}|{{today}}</i>', after_id: 1 });
      connect();
      const asked = new Date();
      assert.equal((await send(2, far)).status, 200);
      const html = partOf(message(), 'text/html'), line = d => { const c = vars.clockValues(d, 'Pacific/Kiritimati'); return `<i>${c.date_time}|${c.weekday}|${c.month}|${c.date}|${c.time}|${c.today}</i>`; };
      assert.ok([asked, new Date()].some(d => html.includes(line(d))), html.slice(0, 200));
      assert.ok(![asked, new Date()].some(d => html.includes(`<i>${vars.clockValues(d, 'Europe/Berlin').date_time}|`)), 'fourteen hours ahead of London: never Berlin\'s clock');
      assert.match(subjectOf(message()), /^\[Test\] Stand 20\d\d$/);
    } finally { await far.close(); }
  });
  test('a field of the workspace says its own name in brackets — as text; a key that is no field of this workspace stays as typed', async () => {
    await newFlow();
    // the subject names a field the text does not: both are looked up
    await addBox(1, { kind: 'email', title: 'Zu {{deal.Finanzierung}}', body: '<p>{{deal.einzug}} / {{kontakt.kundenstatus}} / {{contact.kundenstatus|x}} / {{deal.fremd}} / {{deal.gibtsnicht|x}} / {{contact.finanzierung}}</p>', after_id: 1 });
    connect();
    assert.equal((await send(2)).status, 200);
    const msg = message();
    assert.equal(subjectOf(msg), '[Test] Zu [Finanzierung]');
    assert.equal(partOf(msg, 'text/html').split('</p>')[0], '<p>[Einzug &lt;am&gt;] / [Kundenstatus] / [Kundenstatus] / {{deal.fremd}} / {{deal.gibtsnicht|x}} / {{contact.finanzierung}}');
    const asked = state.calls.filter(c => /LOWER\(field_key\) = ANY/.test(c.sql));
    assert.deepEqual(asked.map(c => [c.sql.match(/FROM (\w+)/)[1], c.params]), [['deal_fields', [WS, ['finanzierung', 'einzug', 'fremd', 'gibtsnicht']]], ['custom_fields', [WS, ['kundenstatus', 'finanzierung']]]],
      'asked with the session\'s workspace, the keys as a value');
  });
  test('a text without a field asks for no field list', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, title: 'Hallo {{first_name}}', after_id: 1 });
    connect();
    await send(2);
    assert.ok(!state.calls.some(c => /LOWER\(field_key\)/.test(c.sql)));
  });
  test('refused: a step that is no email, no address connected, a member, another workspace', async () => {
    await newFlow(); await addBox(1, { kind: 'task', title: 'x', after_id: 1 }); await addBox(1, { ...EMAIL, after_id: 1 });
    connect();
    assert.equal((await send(2)).body.code, 'not_email');
    assert.equal((await send(3, member)).status, 403);
    assert.equal((await send(3, other)).status, 404);
    state.sender = null;
    assert.deepEqual([(await send(3)).status, (await send(3)).body.code], [409, 'not_connected']);
    assert.equal(google.length, 0);
  });
  test('what Google answers is told apart: the sign-in is gone, the email refused, Google away', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    connect();
    fakeGoogle({ 'https://oauth2.googleapis.com/token': { status: 400, body: { error: 'invalid_grant' } } });
    assert.equal((await send(2)).body.code, 'gone');
    fakeGoogle({ [SEND_URL]: { status: 400, body: { error: { message: 'Mail service not enabled' } } } });
    assert.deepEqual([(await send(2)).body.code, (await send(2)).body.detail], ['rejected', 'Mail service not enabled']);
    fakeGoogle({ [SEND_URL]: { throw: true } });
    assert.equal((await send(2)).body.code, 'unreachable');
  });
  // Part 17: a step's test email is an email like any other (the route works on the real clock: times are from now).
  const fromNow = minutes => new Date(Date.now() + minutes * 60000);
  const mailed = (n, minutes) => Array.from({ length: n }, () => ({ workspace_id: WS, from_email: 'news@firma.de', contact_id: null, kind: 'step', sent_at: fromNow(minutes) }));
  const sentToGoogle = () => google.filter(c => c.url === SEND_URL).length;
  test('it is counted: for the address, as a test, with no contact', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    connect();
    const before = Date.now();
    assert.equal((await send(2)).status, 200);
    assert.equal(state.sends.length, 1);
    const [{ sent_at, ...row }] = state.sends;
    assert.deepEqual(row, { workspace_id: WS, from_email: 'news@firma.de', contact_id: null, kind: 'test' });
    assert.ok(sent_at.getTime() >= before && sent_at.getTime() <= Date.now());
    assert.doesNotMatch(message(), /List-Unsubscribe/, 'no one-click header: its link is the test\'s own, not a contact\'s');
  });
  test('while sending from the address is paused it is refused — 409 "paused", with what Google said — and Google is asked nothing', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    connect({ paused_until: fromNow(60), pause_reason: 'google_limit', pause_detail: 'User-rate limit exceeded.', pause_count: 1 });
    const r = await send(2);
    assert.deepEqual([r.status, r.body.code, r.body.detail], [409, 'paused', 'User-rate limit exceeded.']);
    assert.deepEqual([google.length, state.sends.length], [0, 0]);
    connect({ paused_until: fromNow(-1), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 1 });
    assert.equal((await send(2)).status, 200, 'a pause that is over keeps nothing back');
    assert.equal(state.mail[0].pause_count, 0, 'and the email that went out ends the doubling');
  });
  test('while the address\'s day is full it is refused — 409 "limit", which to this request is the sending limit and says so — and Google is asked nothing', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    connect({ limit_day: 3 });
    state.sends = mailed(3, -120);
    const r = await send(2);
    assert.deepEqual([r.status, r.body], [409, { error: 'The daily sending limit of this address is reached', code: 'limit' }]);
    assert.deepEqual([google.length, state.sends.length], [0, 3]);
    connect({ limit_day: 50, limit_hour: 2 });
    state.sends = mailed(2, -5);
    assert.equal((await send(2)).status, 200, 'a full hour keeps a test email not back');
    assert.equal(state.sends.length, 3);
  });
  test('"limit" still is, to every other request, the number of workflows', async () => {
    for (let i = 0; i < 20; i++) assert.equal((await newFlow(owner, `W${i}`)).status, 201);
    const r = await newFlow(owner, 'one too many');
    assert.deepEqual([r.status, r.body.code, r.body.error], [409, 'limit', 'A workspace has at most 20 workflows']);
  });
  test('GOOGLE SAYS "LIMIT" to it: the address is paused until the time Google names, the owner and the admin are told, the answer is "paused" with Google\'s words — and the next one asks Google nothing', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    connect();
    const until = fromNow(20), words = `User-rate limit exceeded.  Retry after ${until.toISOString()} (Mail sending)`;
    fakeGoogle({ [SEND_URL]: { status: 429, body: { error: { code: 429, message: words, errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }] } } } });
    const r = await send(2);
    assert.deepEqual([r.status, r.body.code, r.body.detail], [409, 'paused', words]);
    assert.deepEqual([state.mail[0].paused_until.toISOString(), state.mail[0].pause_reason, state.mail[0].pause_detail, state.mail[0].pause_count], [until.toISOString(), 'google_limit', words, 1]);
    assert.deepEqual(state.told.map(a => [a[0], a[1], a[2], a[3].type]), [[WS, null, 1, 'journey_mail_paused'], [WS, null, 2, 'journey_mail_paused']], 'not the member');
    assert.equal(state.sends.length, 0, 'an email Google refused is not counted');
    const again = await send(2);
    assert.deepEqual([again.status, again.body.code], [409, 'paused']);
    assert.equal(sentToGoogle(), 1, 'Google was asked once');
    assert.equal(state.told.length, 2, 'and nobody is told twice');
  });
  test('a refusal of Google that is no limit pauses nothing', async () => {
    await newFlow(); await addBox(1, { ...EMAIL, after_id: 1 });
    connect();
    fakeGoogle({ [SEND_URL]: { status: 403, body: { error: { code: 403, message: 'The domain administrators have disabled Gmail apps.', errors: [{ domain: 'global', reason: 'domainPolicy' }] } } } });
    const r = await send(2);
    assert.deepEqual([r.status, r.body.code, r.body.detail], [502, 'rejected', 'The domain administrators have disabled Gmail apps.']);
    assert.deepEqual([state.mail[0].paused_until ?? null, state.told.length, state.sends.length], [null, 0, 0]);
  });
  test('the lines that make it so', () => {
    const code = read('routes/journey.js').replace(/\/\*[\s\S]*?\*\//, '');
    const test_ = code.slice(code.indexOf("router.post('/nodes/:id/test'"), code.indexOf("router.delete('/nodes/:id'"));
    assert.match(test_, /const door = await sends\.gate\(pool, \{ workspaceId: req\.workspaceId, now, test: true \}\);\s+if \(!door\.state\) return refuse\(res, 'not_connected'\);\s+if \(!door\.ok\) return door\.why === 'paused' \? refuse\(res, 'paused', door\.state\.pause_detail\) : res\.status\(409\)\.json\(\{ error: MAIL_LIMIT, code: 'limit' \}\);/);
    assert.ok(test_.indexOf('sends.gate(') < test_.indexOf('mail.accessToken(') && test_.indexOf('mail.send(') < test_.indexOf('sends.sent('), 'asked first, counted last');
    assert.match(test_, /if \(err\.code === 'limited'\) \{[^}]*await sends\.pause\(pool, \{ from: sender\.email, now, retryAt: err\.retryAt, detail: err\.message, tell: \{ notifyUser \} \}\);\s+return refuse\(res, 'paused', err\.message\);\s+\}/);
    assert.match(test_, /await sends\.sent\(pool, \{ workspaceId: req\.workspaceId, from: sender\.email, kind: 'test', now, state: door\.state \}\)\s+\.catch\(/);
    assert.match(code, /^  paused:\s+\[409, 'Sending from this address is paused'\],$/m);
    assert.match(code, /^  limit:\s+\[409, `A workspace has at most \$\{MAX_FLOWS\} workflows`\],$/m, 'the route\'s own "limit" is untouched');
    assert.match(code, /^const MAIL_LIMIT = 'The daily sending limit of this address is reached';$/m);
  });
});

describe('wiring', () => {
  const route = read('routes/journey.js'), code = route.replace(/\/\*[\s\S]*?\*\//, '');   // the code without its header
  test('server.js mounts the route behind the public "no more emails" link, and starts the worker', () => {
    const server = read('server.js');
    assert.match(server, /^app\.use\('\/api\/journey',\s+require\('\.\/routes\/journey'\)\);/m);
    assert.match(server, /^app\.use\('\/api\/journey\/unsubscribe', webhookIpLimiter, require\('\.\/routes\/journey-public'\)\);/m);
    assert.ok(server.indexOf("app.use('/api/journey/unsubscribe'") < server.indexOf("app.use('/api/journey',"));
    assert.match(server, /if \(process\.env\.JOURNEY_WORKER !== '0'\) require\('\.\/utils\/journey-run'\)\.startWorker\(pool, \{ tell: \{ notifyUser: require\('\.\/notifications'\)\.notifyUser, engine: require\('\.\/utils\/engine'\) \} \}\);/);
    assert.match(code, /^router\.use\(requireAuth\);$/m);
  });
  test('every change is owner/admin only; reading, the activity and putting a deal in are for everyone', () => {
    const routes = [...code.matchAll(/^router\.(get|post|put|delete)\('([^']+)', (requireManage, )?async/gm)].map(m => `${m[1]} ${m[2]}${m[3] ? ' *' : ''}`);
    assert.deepEqual(routes, ['get /', 'post /flows *', 'put /flows/:id *', 'delete /flows/:id *', 'get /flows/:id/activity', 'get /history', 'post /flows/:id/include', 'post /flows/:id/nodes *', 'put /nodes/:id *',
      'put /nodes/:id/place *', 'put /nodes/:id/next *', 'post /nodes/:id/test *', 'delete /nodes/:id *']);
  });
  test('every statement carries the workspace from the session; only fixed text is put into a statement', () => {
    const statements = [...code.matchAll(/\.query\(\s*(?:`([^`]*)`|'([^']*)')/g)].map(m => (m[1] || m[2]).replace(/\s+/g, ' ')).filter(s => !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(s));
    assert.ok(statements.length >= 28, String(statements.length));
    for (const s of statements) {
      assert.match(s, /workspace_id|VALUES \(\$1/, s.slice(0, 70));
      assert.doesNotMatch(s, /\$\{(?!FLOW_COLUMNS\}|NODE_COLUMNS\}|table\})/, s.slice(0, 70));
    }
    assert.doesNotMatch(code, /req\.(body|query|params)\.workspace/);
  });
  test('what belongs together is written together', () => {
    assert.equal(code.split('await together(async db =>').length - 1, 4, 'a new workflow with its start; switching on with the deals already there; a new box with its line; a deleted box with the join');
  });
  test('the public link: no login, the contact from a signed token only, and the same page for a link that is no good', () => {
    const pub = read('routes/journey-public.js').replace(/\/\*[\s\S]*?\*\//, '');
    assert.doesNotMatch(pub, /requireAuth/);
    assert.match(pub, /const contactId = journeyRun\.contactOfToken\(req\.params\.token\);\s+if \(contactId\) await pool\.query\('UPDATE contacts SET journey_opt_out = true WHERE id = \$1', \[contactId\]\);/);
    assert.match(pub, /res\.status\(200\)\.type\('html'\)/);
  });
  test('db.js: the tables of the workflows and of what runs, and what goes with what', () => {
    const db = read('db.js');
    const table = name => db.slice(db.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`), db.indexOf(')\n  `);', db.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`)));
    assert.match(table('journey_nodes'), /flow_id\s+INTEGER NOT NULL REFERENCES journey_flows\(id\) ON DELETE CASCADE/);
    assert.match(table('journey_nodes'), /next_id\s+INTEGER REFERENCES journey_nodes\(id\) ON DELETE SET NULL/);
    assert.match(table('journey_runs'), /deal_id\s+INTEGER NOT NULL REFERENCES deals\(id\) ON DELETE CASCADE/);
    assert.match(table('journey_runs'), /UNIQUE \(flow_id, deal_id\)/);
    assert.match(table('journey_log'), /flow_id\s+INTEGER NOT NULL REFERENCES journey_flows\(id\) ON DELETE CASCADE/);
    // Part 15: the shipped statement stays; what follows it makes the record outlive its workflow
    assert.ok(db.indexOf('ALTER TABLE journey_log ALTER COLUMN flow_id DROP NOT NULL') > db.indexOf('CREATE TABLE IF NOT EXISTS journey_log ('));
    assert.match(db, /ALTER TABLE journey_log DROP CONSTRAINT IF EXISTS journey_log_flow_id_fkey`\);\s+await pool\.query\(`ALTER TABLE journey_log ADD CONSTRAINT journey_log_flow_id_fkey FOREIGN KEY \(flow_id\) REFERENCES journey_flows\(id\) ON DELETE SET NULL`\);/);
    for (const add of ['journey_flows ADD COLUMN IF NOT EXISTS active       BOOLEAN NOT NULL DEFAULT false', 'journey_flows ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ', 'journey_nodes ADD COLUMN IF NOT EXISTS x INTEGER',
      'journey_nodes ADD COLUMN IF NOT EXISTS y INTEGER', 'contacts ADD COLUMN IF NOT EXISTS journey_opt_out BOOLEAN NOT NULL DEFAULT false']) assert.ok(db.includes(`ALTER TABLE ${add}`), add);
    assert.match(db, /activities_source_check CHECK\(source IN \('user','engine','calcom','notetaker','fonio','calendly','journey'\)\)/);
    assert.match(db, /fonio_calls_trigger_check CHECK \(trigger IN \('deal_manual','deal_webhook','follow_up','callback','journey','manual'\)\)/);
    assert.doesNotMatch(db, /CREATE TABLE IF NOT EXISTS journey_steps/);
  });
});
