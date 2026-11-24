// ROUTE tests for /api/admin/assistant (ASSISTANT_CHANGES Part 1, 2026-11-24): the admin console's assistant —
// routes/admin-assistant.js with the real loop of utils/assistant.js behind it.
//
// The real route runs on a throwaway server. The database is a stand-in that knows the route's statements — every
// one of them, exactly — and keeps conversations and proposals as rows. Claude is a stand-in: the SDK client the
// route asks for answers from a script and writes down every request. What Claude may look up
// (utils/assistant-tools.js), what it is told (utils/assistant-prompt.js), what checks and makes a workflow
// (utils/journey-create.js) and the workflows' record (utils/journey-log.js) are stand-ins too, with the interfaces
// the contract names: this file is about what the ROUTE does with them. The journey's own `boxes`
// (routes/journey.js) are the real ones. Nothing leaves the machine.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve, inject } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
const COLS = 'id, chat_id, workspace_id, workspace_name, name, asked, explain, spec, view, notes, status, flow_id, created_at, made_at, undone_at';
const shown = p => Object.fromEntries(COLS.split(', ').map(k => [k, p[k]]));
const state = { chats: [], proposals: [], workspaces: [], owners: [], flows: [], sql: [], clock: 1000, broken: null, script: [], asked: [], reads: [], checks: [], creates: [], removes: [], record: [], check: null, create: null, remove: null, read: null };
const KNOWN = [];   // every statement the stand-in answers: held against the route's own text at the end
const on = (sql, fn) => { KNOWN.push(sql); return [sql, fn]; };
const STATEMENTS = new Map([
  on('SELECT id, title, updated_at FROM assistant_chats ORDER BY updated_at DESC, id DESC LIMIT 20', () => ({ rows: [...state.chats].sort((a, b) => b.updated_at - a.updated_at || b.id - a.id).slice(0, 20).map(c => ({ id: c.id, title: c.title, updated_at: c.updated_at })) })),
  on("UPDATE assistant_chats SET busy_at = NOW() WHERE id = $1 AND (busy_at IS NULL OR busy_at < NOW() - INTERVAL '5 minutes') RETURNING id, messages", p => {
    const c = state.chats.find(x => x.id === p[0] && (x.busy_at === null || x.busy_at < state.clock - 300));
    if (!c) return { rows: [] };
    c.busy_at = state.clock; return { rows: [{ id: c.id, messages: JSON.parse(JSON.stringify(c.messages)) }] };
  }),
  on('SELECT id FROM assistant_chats WHERE id = $1', p => ({ rows: state.chats.filter(c => c.id === p[0]).map(c => ({ id: c.id })) })),
  on('INSERT INTO assistant_chats (title, busy_at) VALUES ($1, NOW()) RETURNING id', p => { const c = { id: 100 + state.chats.length, title: p[0], messages: [], busy_at: state.clock, updated_at: state.clock }; state.chats.push(c); return { rows: [{ id: c.id }] }; }),
  on('UPDATE assistant_chats SET messages = $2::jsonb, busy_at = NULL, updated_at = NOW() WHERE id = $1', p => { const c = state.chats.find(x => x.id === p[0]); Object.assign(c, { messages: JSON.parse(p[1]), busy_at: null, updated_at: state.clock }); return { rows: [], rowCount: 1 }; }),
  on('UPDATE assistant_chats SET busy_at = NULL WHERE id = $1', p => { const c = state.chats.find(x => x.id === p[0]); if (c) c.busy_at = null; return { rows: [], rowCount: c ? 1 : 0 }; }),
  on('SELECT id, title, messages FROM assistant_chats WHERE id = $1', p => ({ rows: state.chats.filter(c => c.id === p[0]).map(c => ({ id: c.id, title: c.title, messages: c.messages })) })),
  on('SELECT id, name FROM workspaces WHERE id = $1', p => ({ rows: state.workspaces.filter(w => w.id === p[0]) })),
  on("SELECT timezone FROM users WHERE workspace_id = $1 AND role = 'owner' ORDER BY id LIMIT 1", p => ({ rows: state.owners.filter(o => o.workspace_id === p[0]).slice(0, 1).map(o => ({ timezone: o.timezone })) })),
  on('INSERT INTO assistant_proposals (chat_id, workspace_id, workspace_name, name, asked, explain, spec, view, notes) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb) RETURNING id', p => {
    const row = { id: 500 + state.proposals.length, chat_id: p[0], workspace_id: p[1], workspace_name: p[2], name: p[3], asked: p[4], explain: p[5], spec: JSON.parse(p[6]), view: JSON.parse(p[7]), notes: JSON.parse(p[8]),
      status: 'proposed', flow_id: null, flow_updated_at: null, created_at: `T${state.clock}`, made_at: null, undone_at: null };
    state.proposals.push(row); return { rows: [{ id: row.id }] };
  }),
  on(`SELECT ${COLS} FROM assistant_proposals WHERE id = ANY($1::int[]) ORDER BY id`, p => ({ rows: state.proposals.filter(x => p[0].includes(x.id)).sort((a, b) => a.id - b.id).map(shown) })),
  on(`SELECT ${COLS} FROM assistant_proposals WHERE chat_id = $1 ORDER BY id`, p => ({ rows: state.proposals.filter(x => x.chat_id === p[0]).sort((a, b) => a.id - b.id).map(shown) })),
  on(`SELECT ${COLS} FROM assistant_proposals ORDER BY id DESC LIMIT 50`, () => ({ rows: [...state.proposals].sort((a, b) => b.id - a.id).slice(0, 50).map(shown) })),
  on(`UPDATE assistant_proposals SET status = 'created' WHERE id = $1 AND status IN ('proposed','undone') RETURNING ${COLS}`, p => {
    const x = state.proposals.find(r => r.id === p[0] && ['proposed', 'undone'].includes(r.status));
    if (!x) return { rows: [] };
    x.status = 'created'; return { rows: [shown(x)] };
  }),
  on('SELECT id FROM assistant_proposals WHERE id = $1', p => ({ rows: state.proposals.filter(x => x.id === p[0]).map(x => ({ id: x.id })) })),
  on("UPDATE assistant_proposals SET status = $2 WHERE id = $1 AND status = 'created'", p => { const x = state.proposals.find(r => r.id === p[0] && r.status === 'created'); if (x) x.status = p[1]; return { rows: [], rowCount: x ? 1 : 0 }; }),
  on(`UPDATE assistant_proposals SET flow_id = $2, flow_updated_at = $3, made_at = NOW(), undone_at = NULL WHERE id = $1 RETURNING ${COLS}`, p => {
    const x = state.proposals.find(r => r.id === p[0]); Object.assign(x, { flow_id: p[1], flow_updated_at: p[2], made_at: `T${state.clock}`, undone_at: null }); return { rows: [shown(x)] };
  }),
  on('SELECT id, status, workspace_id, name, flow_id, flow_updated_at FROM assistant_proposals WHERE id = $1', p => ({ rows: state.proposals.filter(x => x.id === p[0]).map(x => ({ id: x.id, status: x.status, workspace_id: x.workspace_id, name: x.name, flow_id: x.flow_id, flow_updated_at: x.flow_updated_at })) })),
  on('SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', p => ({ rows: state.flows.filter(f => f.id === p[0] && f.workspace_id === p[1]).map(f => ({ id: f.id })) })),
  on(`UPDATE assistant_proposals SET status = 'undone', undone_at = NOW() WHERE id = $1 RETURNING ${COLS}`, p => { const x = state.proposals.find(r => r.id === p[0]); Object.assign(x, { status: 'undone', undone_at: `T${state.clock}` }); return { rows: [shown(x)] }; }),
]);
const pool = { query: async (sql, p) => {
  const t = flat(sql);
  state.sql.push({ sql: t, params: p });
  if (state.broken && state.broken(t)) throw new Error('the database is away');
  if (!STATEMENTS.has(t)) throw new Error(`a statement nobody expected: ${t}`);
  return STATEMENTS.get(t)(p || []);
} };

// What the route is handed by the other files, as the contract names it.
const TOOLS = [{ name: 'list_workspaces' }, { name: 'workspace_setup' }, { name: 'read_workflow' }, { name: 'propose_workflow' }].map(t => ({ ...t, description: `the ${t.name} tool`, input_schema: { type: 'object', properties: {} } }));
inject('utils/assistant-tools.js', { READ_TOOLS: TOOLS.slice(0, 3), PROPOSE_TOOL: TOOLS[3], TOOLS,
  runRead: async (db, name, input) => { state.reads.push({ db, name, input }); return state.read(name, input); },
  summary: (name, input, data) => `Looked at ${name} ${JSON.stringify(input)} (${Array.isArray(data) ? data.length : 1})` });
inject('utils/assistant-prompt.js', { SYSTEM: 'THE SYSTEM TEXT', REFERENCE: 'THE REFERENCE' });
inject('utils/journey-create.js', {
  check: async (db, wid, spec, opts) => { state.checks.push({ db, wid, spec, opts }); return state.check(wid, spec); },
  view: plan => ({ start: { label: 'Start', settings: plan.start, next: plan.next }, steps: plan.steps.map(s => ({ key: s.key, kind: s.kind, label: s.kind.toUpperCase(), title: s.title || '', body: '', wait_minutes: 0, settings: s.config || {}, next: s.next ?? null, else: null, routes: [] })) }),
  create: async (db, wid, spec, opts) => { state.creates.push({ db, wid, spec, opts }); return state.create(wid, spec, opts); },
  remove: async (db, wid, flowId, updatedAt) => { state.removes.push({ db, wid, flowId, updatedAt }); return state.remove(); },
});
inject('utils/journey-log.js', { record: async (db, entry) => { state.record.push({ db, entry }); return 1; } });
const assistant = require('../../utils/assistant');
const SDK = (() => { const A = require('@anthropic-ai/sdk'); return A.default || A; })();
const realClient = assistant.client;
// Claude: answers from state.script, one entry per request — a response, an Error to throw, or a function of the request.
const claude = { beta: { messages: { create: async req => {
  state.asked.push(JSON.parse(JSON.stringify(req)));
  const next = state.script.shift();
  if (!next) throw new Error('the script is at its end');
  const out = typeof next === 'function' ? await next(req) : next;
  if (out instanceof Error) throw out;
  return out;
} } } };
const text = t => ({ type: 'text', text: t });
const use = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });
const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
const turn = (stop_reason, ...content) => ({ id: 'msg', role: 'assistant', stop_reason, content });
const say = (...words) => turn('end_turn', ...words.map(text));
const SPEC = (more = {}) => ({ workspace_id: 7, name: ' Welcome new leads ', explain: 'Greets a new lead and reminds the assignee.',
  start: { config: { trigger: 'lead' }, next: 'mail1', explain: 'Starts when a lead comes in.' },
  steps: [{ key: 'mail1', kind: 'email', title: 'Welcome', body: 'Hallo', wait_minutes: 0, config: {}, next: 'task1', explain: 'Sends the welcome email.' }, { key: 'task1', kind: 'task', title: 'Call', next: null, explain: 'A task to call.' }],
  notes: ['Gmail is not connected in this workspace.'], ...more });
const planOf = spec => ({ start: spec.start.config, next: spec.start.next, steps: spec.steps });

const saved = {};
const ENV = ['ANTHROPIC_API_KEY', 'ASSISTANT_MODEL', 'ADMIN_SECRET'];
let admin, guest;
const server = sess => serve({ '/': (req, _res, next) => { req.session = sess; next(); }, '/api/admin': loadRoute('admin-assistant.js', { pool }) });
const ask = (body, srv = admin) => srv.request('POST', '/api/admin/assistant/ask', body);
const chat = id => state.chats.find(c => c.id === id);
const chatWith = (messages = [], more = {}) => { const c = { id: 40 + state.chats.length, title: 'Earlier', messages, busy_at: null, updated_at: 10, ...more }; state.chats.push(c); return c; };
const proposal = (more = {}) => { const p = { id: 500 + state.proposals.length, chat_id: null, workspace_id: 7, workspace_name: 'Müller & Söhne', name: 'Welcome new leads', asked: 'make it', explain: 'It greets.', spec: { name: 'Welcome new leads', start: { config: { trigger: 'lead' }, next: null, explain: 'S' }, steps: [] },
  view: { start: { label: 'Start', settings: { trigger: 'lead' }, next: null }, steps: [] }, notes: [], status: 'proposed', flow_id: null, flow_updated_at: null, created_at: 'T1', made_at: null, undone_at: null, ...more }; state.proposals.push(p); return p; };

before(async () => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ADMIN_SECRET = 'console-secret';
  assistant.client = () => claude;
  admin = await server({ isAdmin: true }); guest = await server({});
});
after(async () => { await admin.close(); await guest.close(); assistant.client = realClient; for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-KEY-123'; delete process.env.ASSISTANT_MODEL;
  Object.assign(state, { chats: [], proposals: [], sql: [], clock: 1000, broken: null, script: [], asked: [], reads: [], checks: [], creates: [], removes: [], record: [],
    workspaces: [{ id: 7, name: 'Müller & Söhne' }, { id: 8, name: 'acme' }], owners: [{ workspace_id: 7, timezone: 'Europe/Lisbon' }], flows: [{ id: 900, workspace_id: 7 }],
    read: () => ({ ok: true, data: [{ id: 7, name: 'Müller & Söhne' }] }), check: (wid, spec) => ({ ok: true, plan: planOf(spec) }),
    create: () => ({ ok: true, flowId: 900, updatedAt: '2026-11-24T10:00:00.123456Z' }), remove: () => true });
});

describe('who may', () => {
  test('every route is the console\'s: without its session nothing is answered and nothing is asked of the database or of Claude', async () => {
    for (const [method, path, body] of [['GET', '/api/admin/assistant'], ['POST', '/api/admin/assistant/ask', { chat_id: null, text: 'hi' }], ['GET', '/api/admin/assistant/chats/40'], ['GET', '/api/admin/assistant/proposals'],
      ['POST', '/api/admin/assistant/proposals/500/create', {}], ['POST', '/api/admin/assistant/proposals/500/undo', {}]]) {
      const r = await guest.request(method, path, body);
      assert.equal(r.status, 401, `${method} ${path}`);
    }
    assert.deepEqual([state.sql.length, state.asked.length], [0, 0]);
    const code = read('routes/admin-assistant.js').replace(/\/\*[\s\S]*?\*\//, '');
    const routes = [...code.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)', (\w+),/g)].map(m => `${m[1]} ${m[2]} ${m[3]}`);
    assert.deepEqual(routes, ['get /assistant requireAdmin', 'post /assistant/ask requireAdmin', 'get /assistant/chats/:id requireAdmin', 'get /assistant/proposals requireAdmin',
      'post /assistant/proposals/:id/create requireAdmin', 'post /assistant/proposals/:id/undo requireAdmin'], 'six routes, none without the gate, none that deletes');
    assert.equal((code.match(/router\.(get|post|put|patch|delete|use|all)\(/g) || []).length, 6);
  });
});

describe('GET /assistant', () => {
  test('set up or not, the model, how long an order may be, and the newest conversations — never the key', async () => {
    for (let i = 0; i < 23; i++) chatWith([], { title: `Chat ${i}`, updated_at: i === 3 ? 999 : i });
    const r = await admin.request('GET', '/api/admin/assistant');
    assert.deepEqual([r.status, r.body.configured, r.body.model, r.body.max_text, r.body.chats.length], [200, true, 'claude-opus-5-5', 4000, 20]);
    assert.deepEqual(r.body.chats.slice(0, 3), [{ id: 43, title: 'Chat 3', updated_at: 999 }, { id: 62, title: 'Chat 22', updated_at: 22 }, { id: 61, title: 'Chat 21', updated_at: 21 }]);
    assert.doesNotMatch(JSON.stringify(r.body), /sk-ant|KEY-123|messages/);
    process.env.ASSISTANT_MODEL = 'claude-sonnet-5-5';
    assert.equal((await admin.request('GET', '/api/admin/assistant')).body.model, 'claude-sonnet-5-5');
    process.env.ANTHROPIC_API_KEY = '';
    const off = await admin.request('GET', '/api/admin/assistant');
    assert.deepEqual([off.body.configured, off.body.model, off.body.chats.length], [false, 'claude-opus-5-5', 20], 'not set up: said, and the conversations of before can still be read');
  });
});

describe('POST /assistant/ask: what is refused before Claude is asked', () => {
  test('not set up; no text, too long a text; a conversation that is none', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    let r = await ask({ chat_id: null, text: 'hi' });
    assert.deepEqual([r.status, r.body], [503, { error: 'The assistant is not set up on this server: ANTHROPIC_API_KEY is missing.', code: 'not_configured' }]);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-KEY-123';
    for (const body of [{ chat_id: null }, { chat_id: null, text: '' }, { chat_id: null, text: '   \n ' }, { chat_id: null, text: 5 }, { chat_id: null, text: ['hi'] }, { chat_id: null, text: 'x'.repeat(4001) }, {}]) {
      r = await ask(body);
      assert.deepEqual([r.status, r.body.code], [400, 'text'], JSON.stringify(body).slice(0, 40));
    }
    for (const chat_id of ['40', 0, -1, 1.5, true, [40], { id: 40 }, 999]) {
      r = await ask({ chat_id, text: 'hi' });
      assert.deepEqual([r.status, r.body.code], [404, 'chat'], JSON.stringify(chat_id));
    }
    assert.equal(state.asked.length, 0, 'Claude was never asked');
    assert.deepEqual(state.sql.map(q => q.params), [[999], [999]], 'only a number is ever looked up');
    state.script = [say('ok')];
    assert.equal((await ask({ chat_id: null, text: 'x'.repeat(4000) })).status, 200, 'four thousand characters are still an order');
  });
});

describe('POST /assistant/ask: an order', () => {
  test('a new conversation: Claude is asked with what it is told, the four tools and the admin\'s text; the answer comes back and the conversation is kept', async () => {
    state.script = [turn('end_turn', thinking, text('There are two workspaces.'))];
    const r = await ask({ chat_id: null, text: '  Which   workspaces are\nthere? ' + 'x'.repeat(80) + '  ' });
    assert.deepEqual([r.status, r.body], [200, { chat_id: 100, reply: 'There are two workspaces.', looked_at: [], proposals: [] }]);
    assert.equal(state.asked.length, 1);
    const said = 'Which   workspaces are\nthere? ' + 'x'.repeat(80);
    assert.deepEqual([state.asked[0].model, state.asked[0].system[0].text, state.asked[0].tools, state.asked[0].messages], ['claude-opus-5-5', 'THE SYSTEM TEXT', TOOLS, [{ role: 'user', content: said }]]);
    const c = chat(100);
    assert.deepEqual([c.title, c.title.length, c.busy_at], [('Which workspaces are there? ' + 'x'.repeat(80)).slice(0, 60), 60, null], 'its title: the first sixty characters, on one line');
    assert.deepEqual(c.messages, [{ role: 'user', content: said }, { role: 'assistant', content: [thinking, text('There are two workspaces.')] }], 'kept exactly as it will be sent again — Claude\'s thinking block included');
    assert.doesNotMatch(JSON.stringify(r.body), /sk-ant|KEY-123/);
  });
  test('the model that is set is the one that is asked', async () => {
    process.env.ASSISTANT_MODEL = 'claude-sonnet-5-5';
    state.script = [say('ok')];
    await ask({ chat_id: null, text: 'hi' });
    assert.equal(state.asked[0].model, 'claude-sonnet-5-5');
  });
  test('a conversation goes on: what was said before is sent again, and the new order and its answer are added at the end', async () => {
    const before = [{ role: 'user', content: 'Which workspaces are there?' }, { role: 'assistant', content: [thinking, text('Two.')] }];
    const c = chatWith(JSON.parse(JSON.stringify(before)));
    state.script = [say('Müller & Söhne has three pipelines.')];
    const r = await ask({ chat_id: c.id, text: 'And their pipelines?' });
    assert.deepEqual([r.status, r.body.chat_id, r.body.reply], [200, c.id, 'Müller & Söhne has three pipelines.']);
    assert.deepEqual(state.asked[0].messages, [...before, { role: 'user', content: 'And their pipelines?' }]);
    assert.deepEqual(c.messages, [...before, { role: 'user', content: 'And their pipelines?' }, { role: 'assistant', content: [text('Müller & Söhne has three pipelines.')] }]);
    assert.deepEqual([c.title, c.busy_at, c.updated_at], ['Earlier', null, 1000], 'its title stays; it is free again');
    assert.equal(state.sql.some(q => /^INSERT INTO assistant_chats/.test(q.sql)), false);
  });
  test('a lookup: run with the pool and what Claude named, its answer goes back as JSON text, and the console is told what was looked at', async () => {
    state.script = [turn('tool_use', text('Let me look.'), use('tu_1', 'list_workspaces', {}), use('tu_2', 'workspace_setup', { workspace_id: 7 })), say('Done.')];
    state.read = name => ({ ok: true, data: name === 'list_workspaces' ? [{ id: 7, name: 'Müller & Söhne' }, { id: 8, name: 'acme' }] : { workspace: { id: 7 } } });
    const r = await ask({ chat_id: null, text: 'What is there?' });
    assert.deepEqual([r.body.reply, r.body.looked_at], ['Done.', ['Looked at list_workspaces {} (2)', 'Looked at workspace_setup {"workspace_id":7} (1)']]);
    assert.deepEqual(state.reads.map(x => [x.db === pool, x.name, x.input]), [[true, 'list_workspaces', {}], [true, 'workspace_setup', { workspace_id: 7 }]]);
    assert.deepEqual(state.asked[1].messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '[{"id":7,"name":"Müller & Söhne"},{"id":8,"name":"acme"}]' }, { type: 'tool_result', tool_use_id: 'tu_2', content: '{"workspace":{"id":7}}' }] });
    assert.equal(chat(100).messages.length, 4, 'the order, the calls, their answers, the reply');
  });
  test('a lookup that is refused, or fails, is said to Claude as a failed tool — and is nothing the console was "looking at"', async () => {
    state.script = [turn('tool_use', use('tu_1', 'workspace_setup', { workspace_id: 99 }), use('tu_2', 'delete_everything', {}), use('tu_3', 'read_workflow', {})), say('I could not.')];
    state.read = name => { if (name === 'read_workflow') throw new Error('the database is away (sk-ant-test-KEY-123)'); return { ok: false, error: name === 'delete_everything' ? 'There is no such tool.' : 'There is no workspace with that id.' }; };
    const logged = [], realError = console.error; console.error = (...a) => logged.push(a.join(' '));
    let r; try { r = await ask({ chat_id: null, text: 'Look at 99' }); } finally { console.error = realError; }
    assert.deepEqual([r.status, r.body.looked_at, r.body.reply], [200, [], 'I could not.']);
    assert.deepEqual(state.asked[1].messages[2].content, [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'There is no workspace with that id.', is_error: true }, { type: 'tool_result', tool_use_id: 'tu_2', content: 'There is no such tool.', is_error: true },
      { type: 'tool_result', tool_use_id: 'tu_3', content: 'The tool failed on this server.', is_error: true }]);
    assert.deepEqual([state.reads[1].name, logged.length], ['delete_everything', 1], 'a tool that does not exist is the lookups\' to refuse: nothing else can run it');
    assert.match(logged[0], /^assistant: a tool failed: read_workflow /);
    assert.doesNotMatch(JSON.stringify(r.body), /database is away|KEY-123/, 'what went wrong on this server is not told to the console');
  });
  test('a long answer of a lookup is cut at sixty thousand characters, and says so', async () => {
    state.script = [turn('tool_use', use('tu_1', 'read_workflow', {})), say('ok')];
    state.read = () => ({ ok: true, data: { body: 'x'.repeat(70000) } });
    await ask({ chat_id: null, text: 'read it' });
    const said = state.asked[1].messages[2].content[0].content;
    const note = '\n[cut: the answer was longer than 60000 characters]';
    assert.deepEqual([said.length, said.slice(0, 12), said.slice(60000)], [60000 + note.length, '{"body":"xxx', note]);
    state.script = [turn('tool_use', use('tu_1', 'read_workflow', {})), say('ok')]; state.asked = [];
    state.read = () => ({ ok: true, data: 'y'.repeat(59998) });
    await ask({ chat_id: null, text: 'read it' });
    assert.equal(state.asked[1].messages[2].content[0].content.length, 60000, 'exactly sixty thousand are not cut');
  });
});

describe('POST /assistant/ask: a proposal', () => {
  test('checked by the journey\'s own rules on the clock of the workspace\'s owner — and kept as a row, nothing else', async () => {
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('I proposed it.')];
    const r = await ask({ chat_id: null, text: 'Welcome new leads in Müller' });
    assert.equal(r.status, 200);
    assert.equal(state.checks.length, 1);
    const c = state.checks[0];
    assert.deepEqual([c.db === pool, c.wid, c.opts.tz, Object.keys(c.opts).sort()], [true, 7, 'Europe/Lisbon', ['boxes', 'tz']]);
    assert.deepEqual([typeof c.opts.boxes.actionOf, typeof c.opts.boxes.startOf, typeof c.opts.boxes.foreignRefs, c.opts.boxes.MAX_FLOWS], ['function', 'function', 'function', 20], 'the journey\'s own checks: routes/journey.js `boxes`');
    assert.deepEqual(c.spec, { name: ' Welcome new leads ', explain: 'Greets a new lead and reminds the assignee.', start: SPEC().start, steps: SPEC().steps }, 'the workflow as Claude wrote it — not the workspace id, not the notes');
    assert.deepEqual(state.proposals, [{ id: 500, chat_id: 100, workspace_id: 7, workspace_name: 'Müller & Söhne', name: 'Welcome new leads', asked: 'Welcome new leads in Müller', explain: 'Greets a new lead and reminds the assignee.', spec: c.spec,
      view: { start: { label: 'Start', settings: { trigger: 'lead' }, next: 'mail1' }, steps: [{ key: 'mail1', kind: 'email', label: 'EMAIL', title: 'Welcome', body: '', wait_minutes: 0, settings: {}, next: 'task1', else: null, routes: [] },
        { key: 'task1', kind: 'task', label: 'TASK', title: 'Call', body: '', wait_minutes: 0, settings: {}, next: null, else: null, routes: [] }] },
      notes: ['Gmail is not connected in this workspace.'], status: 'proposed', flow_id: null, flow_updated_at: null, created_at: 'T1000', made_at: null, undone_at: null }]);
    assert.deepEqual(state.asked[1].messages[2].content, [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'Proposal 500 is shown to the admin with a Create button. Nothing is written into the workspace until they press it.' }]);
    assert.deepEqual([state.creates.length, state.removes.length, state.record.length], [0, 0, 0], 'no workflow is made by an order');
    assert.deepEqual(state.sql.filter(q => /^(INSERT|UPDATE|DELETE)/.test(q.sql)).map(q => q.sql.split(' ').slice(0, 3).join(' ')), ['INSERT INTO assistant_chats', 'INSERT INTO assistant_proposals', 'UPDATE assistant_chats SET']);
  });
  test('the answer names the proposal as the console shows it: the row, and each box with the sentence Claude wrote for it', async () => {
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('I proposed it.')];
    const r = await ask({ chat_id: null, text: 'Welcome new leads' });
    assert.deepEqual(r.body.proposals, [{ id: 500, chat_id: 100, workspace_id: 7, workspace_name: 'Müller & Söhne', name: 'Welcome new leads', asked: 'Welcome new leads', explain: 'Greets a new lead and reminds the assignee.', status: 'proposed', flow_id: null,
      created_at: 'T1000', made_at: null, undone_at: null, notes: ['Gmail is not connected in this workspace.'],
      start: { label: 'Start', settings: { trigger: 'lead' }, next: 'mail1', explain: 'Starts when a lead comes in.' },
      steps: [{ key: 'mail1', kind: 'email', label: 'EMAIL', title: 'Welcome', body: '', wait_minutes: 0, settings: {}, next: 'task1', else: null, routes: [], explain: 'Sends the welcome email.' },
        { key: 'task1', kind: 'task', label: 'TASK', title: 'Call', body: '', wait_minutes: 0, settings: {}, next: null, else: null, routes: [], explain: 'A task to call.' }] }]);
    assert.doesNotMatch(JSON.stringify(r.body), /flow_updated_at|"spec"|"view"/, 'what is only this server\'s is not told');
  });
  test('the owner has no zone, or there is no owner: the zone every legacy row has', async () => {
    for (const owners of [[], [{ workspace_id: 7, timezone: '' }], [{ workspace_id: 7, timezone: null }], [{ workspace_id: 8, timezone: 'Asia/Manila' }]]) {
      state.owners = owners; state.checks = []; state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('ok')];
      await ask({ chat_id: null, text: 'go' });
      assert.equal(state.checks[0].opts.tz, 'Europe/Berlin', JSON.stringify(owners));
    }
  });
  test('problems go back to Claude, every one of them, and nothing is kept', async () => {
    state.check = () => ({ ok: false, problems: [{ where: 'start', code: 'start', message: 'The start names what starts the workflow, with everything that start needs' }, { where: 'mail1', code: 'title', message: 'A box needs a title of up to 120 characters' }] });
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('I could not get it right.')];
    const r = await ask({ chat_id: null, text: 'go' });
    assert.deepEqual([r.body.proposals, state.proposals.length], [[], 0]);
    assert.deepEqual(state.asked[1].messages[2].content, [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: true,
      content: 'The proposal was not accepted, and nothing was kept. Problems:\n- start: The start names what starts the workflow, with everything that start needs (start)\n- mail1: A box needs a title of up to 120 characters (title)\nCorrect every one of them and propose again.' }]);
  });
  test('a workspace that is none is refused before anything is checked', async () => {
    for (const workspace_id of [99, '7', 0, null, undefined, 7.5, [7]]) {
      state.checks = []; state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC({ workspace_id }))), say('ok')]; state.asked = [];
      await ask({ chat_id: null, text: 'go' });
      assert.deepEqual(state.asked[1].messages[2].content, [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'There is no workspace with that id. Look the workspace up with list_workspaces first.', is_error: true }], JSON.stringify(workspace_id));
      assert.deepEqual([state.checks.length, state.proposals.length], [0, 0]);
    }
    for (const input of [null, 'x', [SPEC()]]) {
      state.script = [turn('tool_use', use('tu_1', 'propose_workflow', input)), say('ok')]; state.asked = [];
      await ask({ chat_id: null, text: 'go' });
      assert.equal(state.asked[1].messages[2].content[0].is_error, true, JSON.stringify(input));
    }
  });
  test('the notes are kept as short texts, twenty at most; what is no text is left out', async () => {
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC({ notes: [' one ', '', 5, null, { a: 1 }, 'n'.repeat(600), ...Array.from({ length: 30 }, (_, i) => `note ${i}`)] }))), say('ok')];
    await ask({ chat_id: null, text: 'go' });
    const notes = state.proposals[0].notes;
    assert.deepEqual([notes.length, notes[0], notes[1].length, notes[2], notes[19]], [20, 'one', 500, 'note 0', 'note 17']);
    for (const bad of ['a note', undefined, { 0: 'x' }]) {
      state.proposals = []; state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC({ notes: bad }))), say('ok')];
      await ask({ chat_id: null, text: 'go' });
      assert.deepEqual(state.proposals[0].notes, [], JSON.stringify(bad));
    }
  });
  test('at most five proposals an order: the sixth is refused', async () => {
    state.script = [turn('tool_use', ...Array.from({ length: 7 }, (_, i) => use(`tu_${i}`, 'propose_workflow', SPEC({ name: `Flow ${i}` })))), say('Seven asked, five made.')];
    const r = await ask({ chat_id: null, text: 'seven of them' });
    assert.deepEqual([state.proposals.length, r.body.proposals.map(p => p.name), state.checks.length], [5, ['Flow 0', 'Flow 1', 'Flow 2', 'Flow 3', 'Flow 4'], 5]);
    const results = state.asked[1].messages[2].content;
    assert.deepEqual(results.slice(5), [5, 6].map(i => ({ type: 'tool_result', tool_use_id: `tu_${i}`, content: 'No more than 5 proposals in one request. Tell the admin what is still open.', is_error: true })));
    assert.equal(new Set(state.proposals.map(p => p.chat_id)).size, 1, 'all of one conversation, which was made once');
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('ok')];
    assert.equal((await ask({ chat_id: 100, text: 'one more' })).body.proposals.length, 1, 'the next order has five of its own');
  });
  test('a proposal that cannot be written (the database) is a failed tool; the order goes on', async () => {
    state.broken = t => /^INSERT INTO assistant_proposals/.test(t);
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('It could not be kept.')];
    const realError = console.error; console.error = () => {};
    let r; try { r = await ask({ chat_id: null, text: 'go' }); } finally { console.error = realError; }
    assert.deepEqual([r.status, r.body.reply, r.body.proposals], [200, 'It could not be kept.', []]);
    assert.deepEqual(state.asked[1].messages[2].content[0], { type: 'tool_result', tool_use_id: 'tu_1', content: 'The tool failed on this server.', is_error: true });
  });
});

describe('POST /assistant/ask: one request at a time for a conversation', () => {
  test('while an order runs the conversation is taken: a second one is told to wait, and nothing of it is added', async () => {
    const c = chatWith([]);
    let second = null;
    state.script = [async () => { second = await ask({ chat_id: c.id, text: 'me too' }); return say('first'); }];
    const first = await ask({ chat_id: c.id, text: 'first order' });
    assert.deepEqual([second.status, second.body], [409, { error: 'The assistant is still working on this conversation. Wait for its answer.', code: 'busy' }]);
    assert.deepEqual([first.status, state.asked.length, c.messages.map(m => m.role), c.busy_at], [200, 1, ['user', 'assistant'], null]);
    state.script = [say('second')];
    assert.equal((await ask({ chat_id: c.id, text: 'now' })).status, 200, 'free again once the first one ended');
  });
  test('a conversation left taken by a request that died is free again after five minutes, not before', async () => {
    const c = chatWith([], { busy_at: 700 });
    state.clock = 1000;
    assert.equal((await ask({ chat_id: c.id, text: 'hi' })).body.code, 'busy', 'exactly five minutes: still taken');
    state.clock = 1001; state.script = [say('ok')];
    assert.equal((await ask({ chat_id: c.id, text: 'hi' })).status, 200);
  });
  test('whatever ends an order, the conversation is free again', async () => {
    const c = chatWith([]);
    const realError = console.error; console.error = () => {};
    try {
      state.script = [new TypeError('something nobody thought of')];
      assert.equal((await ask({ chat_id: c.id, text: 'hi' })).status, 500);
      assert.equal(c.busy_at, null, 'after an error of this server');
      state.script = [say('ok')]; state.broken = t => /^UPDATE assistant_chats SET messages/.test(t);
      assert.equal((await ask({ chat_id: c.id, text: 'hi' })).status, 500, 'the conversation could not be saved');
      assert.deepEqual([c.busy_at, c.messages], [null, []]);
    } finally { console.error = realError; }
  });
});

describe('POST /assistant/ask: when Claude\'s side fails', () => {
  const body = message => ({ type: 'error', error: { type: 'x', message } });
  test('each failure has its code and its sentence — and the key is in none of them', async () => {
    const cases = [
      [new SDK.AuthenticationError(401, body('invalid x-api-key sk-ant-test-KEY-123'), undefined, new Headers()), 'key', 'Anthropic does not accept the API key of this server.'],
      [new SDK.RateLimitError(429, body('slow'), undefined, new Headers()), 'rate', 'Anthropic is limiting requests at the moment. Try again in a minute.'],
      [new SDK.APIConnectionError({ message: 'Connection error.' }), 'unreachable', 'Anthropic could not be reached.'],
      [turn('refusal'), 'declined', 'The assistant declined this request.'],
      [turn('max_tokens', text('half')), 'too_long', 'The assistant did not come to an end: too many steps, or too long an answer. Ask for less at once.'],
      [new SDK.BadRequestError(400, body('prompt is too long <b> sk-ant-test-KEY-123'), undefined, new Headers()), 'rejected', 'Anthropic refused the request. prompt is too long <b> [key]'],
    ];
    for (const [answer, code, error] of cases) {
      state.script = [answer]; state.chats = [];
      const r = await ask({ chat_id: null, text: 'hi' });
      assert.deepEqual([r.status, r.body], [502, { error, code }], code);
      assert.doesNotMatch(JSON.stringify(r.body), /KEY-123/);
      assert.equal(state.chats.length, 0, 'an order that brought nothing begins no conversation');
    }
  });
  test('an order that brought no answer at all is not kept: the conversation is as it was, and free', async () => {
    const before = [{ role: 'user', content: 'a' }, { role: 'assistant', content: [text('b')] }];
    const c = chatWith(JSON.parse(JSON.stringify(before)));
    state.script = [turn('refusal')];
    const r = await ask({ chat_id: c.id, text: 'something that is declined' });
    assert.deepEqual([r.status, r.body.code, r.body.chat_id, c.messages, c.busy_at, c.updated_at], [502, 'declined', undefined, before, null, 10]);
    state.script = [say('ok')];
    await ask({ chat_id: c.id, text: 'another order' });
    assert.deepEqual(state.asked[1].messages.map(m => m.content).slice(-1), ['another order'], 'the declined text is not sent along with the next order');
    assert.equal(state.asked[1].messages.length, 3);
  });
  test('a failure after tools ran keeps what is whole: the conversation ends on the tools\' answers, never on calls without them', async () => {
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC()), use('tu_2', 'list_workspaces', {})), new SDK.APIConnectionError({ message: 'Connection error.' })];
    const r = await ask({ chat_id: null, text: 'Welcome new leads' });
    assert.deepEqual([r.status, r.body], [502, { error: 'Anthropic could not be reached.', code: 'unreachable', chat_id: 100 }], 'the conversation that was kept is named, so the console can go on in it');
    const c = chat(100);
    assert.deepEqual([c.messages.map(m => m.role), c.messages[2].content.map(b => b.type), c.busy_at], [['user', 'assistant', 'user'], ['tool_result', 'tool_result'], null]);
    assert.equal(state.proposals.length, 1, 'the proposal that was made stays, and is in "What the assistant made"');
    state.script = [say('Here I am again.')];
    const next = await ask({ chat_id: 100, text: 'go on' });
    assert.deepEqual([next.status, state.asked[2].messages.map(m => m.role)], [200, ['user', 'assistant', 'user', 'user']]);
  });
  test('too many steps: what ran is kept, with every answer', async () => {
    state.script = Array.from({ length: 12 }, (_, i) => turn('tool_use', use(`tu_${i}`, 'list_workspaces', {})));
    const r = await ask({ chat_id: null, text: 'look for ever' });
    assert.deepEqual([r.status, r.body.code, r.body.chat_id, state.asked.length, chat(100).messages.length, chat(100).messages.at(-1).role], [502, 'too_long', 100, 12, 25, 'user']);
  });
});

describe('GET /assistant/chats/:id', () => {
  test('a conversation to read again: what the admin wrote, and for each order the assistant\'s last words with its proposals', async () => {
    state.script = [turn('tool_use', text('Let me look.'), use('tu_1', 'list_workspaces', {})), turn('tool_use', use('tu_2', 'propose_workflow', SPEC()), use('tu_3', 'propose_workflow', SPEC({ workspace_id: 99 }))), say('I proposed "Welcome new leads".', 'Press Create.')];
    await ask({ chat_id: null, text: 'Welcome new leads in Müller' });
    state.script = [say('It sends one email.')];
    await ask({ chat_id: 100, text: 'What does it do?' });
    const r = await admin.request('GET', '/api/admin/assistant/chats/100');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.chat.id, r.body.chat.title, r.body.chat.entries.map(e => [e.role, e.text, e.proposals.map(p => p.id)])], [100, 'Welcome new leads in Müller', [['you', 'Welcome new leads in Müller', []],
      ['assistant', 'I proposed "Welcome new leads".\n\nPress Create.', [500]], ['you', 'What does it do?', []], ['assistant', 'It sends one email.', []]]]);
    assert.equal(r.body.chat.entries[1].proposals[0].steps[0].explain, 'Sends the welcome email.', 'a proposal as everywhere else');
    assert.doesNotMatch(JSON.stringify(r.body), /tool_use|tool_result|signature|THE SYSTEM TEXT/, 'not the conversation as Claude is sent it');
  });
  test('a proposal shows as it is now; one of another conversation, or one a tool result only names, is not attached', async () => {
    const c = chatWith([{ role: 'user', content: 'go' }, { role: 'assistant', content: [use('tu_1', 'propose_workflow', {}), use('tu_2', 'x', {})] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'Proposal 500 is shown to the admin with a Create button.' }, { type: 'tool_result', tool_use_id: 'tu_2', content: 'Proposal 501 is shown to the admin', is_error: true },
        { type: 'tool_result', tool_use_id: 'tu_3', content: 'Proposal 502 is shown to the admin with a Create button.' }, { type: 'tool_result', tool_use_id: 'tu_4', content: 'About Proposal 500 is shown to the admin' }] }]);
    proposal({ chat_id: c.id, status: 'created', flow_id: 900 }); proposal({ chat_id: c.id }); proposal({ chat_id: 999 });
    const r = await admin.request('GET', `/api/admin/assistant/chats/${c.id}`);
    assert.deepEqual(r.body.chat.entries.map(e => [e.role, e.text, e.proposals.map(p => [p.id, p.status])]), [['you', 'go', []], ['assistant', '', [[500, 'created']]]]);
  });
  test('entries of an odd conversation are read without an error; a conversation that is none: said', async () => {
    const c = chatWith([null, 'x', { role: 'user' }, { role: 'user', content: [text('as blocks'), text('two')] }, { role: 'assistant', content: 'plain' }, { role: 'system', content: 'x' }, { role: 'assistant', content: [text('  '), null] }]);
    const r = await admin.request('GET', `/api/admin/assistant/chats/${c.id}`);
    assert.deepEqual(r.body.chat.entries, [{ role: 'you', text: 'as blocks\n\ntwo', proposals: [] }, { role: 'assistant', text: '', proposals: [] }]);
    c.messages = 'not a list';
    assert.deepEqual((await admin.request('GET', `/api/admin/assistant/chats/${c.id}`)).body.chat.entries, []);
    for (const id of ['999', 'abc', '0', '40x', '1e3']) {
      const none = await admin.request('GET', `/api/admin/assistant/chats/${id}`);
      assert.deepEqual([none.status, none.body.code], [404, 'chat'], id);
    }
    assert.deepEqual(state.sql.filter(q => q.params && q.params[0] === 999).length, 1, 'only a number is looked up');
  });
});

describe('GET /assistant/proposals', () => {
  test('what the assistant made, the newest first, fifty at most', async () => {
    for (let i = 0; i < 53; i++) proposal({ name: `Flow ${i}`, status: i % 2 ? 'created' : 'proposed' });
    const r = await admin.request('GET', '/api/admin/assistant/proposals');
    assert.deepEqual([r.status, r.body.proposals.length, r.body.proposals[0].id, r.body.proposals[0].name, r.body.proposals[49].id], [200, 50, 552, 'Flow 52', 503]);
    assert.deepEqual(Object.keys(r.body.proposals[0]).sort(), ['asked', 'chat_id', 'created_at', 'explain', 'flow_id', 'id', 'made_at', 'name', 'notes', 'start', 'status', 'steps', 'undone_at', 'workspace_id', 'workspace_name']);
  });
  test('a row that is not whole is still shown', async () => {
    proposal({ spec: null, view: null, notes: 'x' }); proposal({ spec: { steps: 'x', start: null }, view: { start: 'x', steps: [null, { key: 'a', kind: 'task' }] }, notes: [1, 'ok'] });
    const r = await admin.request('GET', '/api/admin/assistant/proposals');
    assert.deepEqual(r.body.proposals.map(p => [p.start, p.steps, p.notes]), [[{ explain: '' }, [{ key: 'a', kind: 'task', explain: '' }], ['ok']], [{ explain: '' }, [], []]]);
  });
});

describe('POST /assistant/proposals/:id/create', () => {
  const create = (id, srv = admin) => srv.request('POST', `/api/admin/assistant/proposals/${id}/create`, {});
  test('the workflow is made in the proposal\'s workspace through the maker — checked again there, with the journey\'s own rules — and the row says so', async () => {
    const p = proposal();
    const r = await create(p.id);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.proposal.id, r.body.proposal.status, r.body.proposal.flow_id, r.body.proposal.made_at, r.body.proposal.undone_at], [500, 'created', 900, 'T1000', null]);
    assert.equal(state.creates.length, 1);
    const c = state.creates[0];
    assert.deepEqual([c.db === pool, c.wid, c.spec, c.opts.tz, Object.keys(c.opts).sort(), typeof c.opts.boxes.actionOf], [true, 7, p.spec, 'Europe/Lisbon', ['boxes', 'record', 'tz'], 'function']);
    assert.deepEqual([p.status, p.flow_id, p.flow_updated_at], ['created', 900, '2026-11-24T10:00:00.123456Z'], 'the workflow\'s time as it was written is kept: "Undo" goes by it');
    assert.doesNotMatch(JSON.stringify(r.body), /flow_updated_at/);
    assert.equal(state.asked.length, 0, 'Claude has no part in it');
  });
  test('the record of the workflows gets its "created" — by nobody of the workspace', async () => {
    const p = proposal();
    state.create = async (wid, spec, opts) => { await opts.record({ flowId: 900, flowName: 'Welcome new leads', title: 'Welcome new leads' }); return { ok: true, flowId: 900, updatedAt: 'U' }; };
    await create(p.id);
    assert.deepEqual(state.record.map(x => [x.db === pool, x.entry]), [[true, { workspaceId: 7, event: 'flow', actorId: null, detail: 'created', flowId: 900, flowName: 'Welcome new leads', title: 'Welcome new leads' }]]);
  });
  test('two clicks make one workflow: the row is claimed first', async () => {
    const p = proposal();
    let second = null;
    state.create = async () => { second = await create(p.id); return { ok: true, flowId: 900, updatedAt: 'U' }; };
    const first = await create(p.id);
    assert.deepEqual([first.status, second.status, second.body, state.creates.length], [200, 409, { error: 'This workflow was already created.', code: 'state' }, 1]);
    assert.deepEqual([(await create(p.id)).body.code, state.creates.length], ['state', 1], 'and a later click neither');
  });
  test('a proposal that is none', async () => {
    for (const id of ['999', 'abc', '0', '5x']) {
      const r = await create(id);
      assert.deepEqual([r.status, r.body], [404, { error: 'That proposal does not exist.', code: 'not_found' }], id);
    }
    assert.equal(state.creates.length, 0);
  });
  test('what the maker refuses is said, and the proposal is as it was: the workspace gone, twenty workflows, a proposal that no longer fits', async () => {
    const cases = [[() => ({ ok: false, code: 'workspace' }), 'workspace', { error: 'The workspace no longer exists.', code: 'workspace' }], [() => ({ ok: false, code: 'limit' }), 'limit', { error: 'The workspace already has 20 workflows.', code: 'limit' }],
      [() => ({ ok: false, problems: [{ where: 'ask1', code: 'stage', message: 'The stage is not one of this workspace' }, { where: 'start', code: 'webhooks', message: 'A lead webhook in the list is not one of this workspace' }] }), 'invalid',
        { error: 'The proposal no longer fits the workspace.', code: 'invalid', problems: ['ask1: The stage is not one of this workspace', 'start: A lead webhook in the list is not one of this workspace'] }]];
    for (const was of ['proposed', 'undone']) {
      for (const [answer, code, body] of cases) {
        state.proposals = []; state.create = answer;
        const p = proposal({ status: was, undone_at: was === 'undone' ? 'T5' : null, flow_id: was === 'undone' ? 800 : null });
        const r = await create(p.id);
        assert.deepEqual([r.status, r.body, p.status, p.made_at], [409, body, was, null], `${was} ${code}`);
      }
    }
  });
  test('a proposal whose workspace was deleted: said, the maker is not asked, and it stays a proposal', async () => {
    const p = proposal({ workspace_id: null });
    const r = await create(p.id);
    assert.deepEqual([r.status, r.body.code, state.creates.length, p.status], [409, 'workspace', 0, 'proposed']);
  });
  test('the maker fails (this server): an error, and the proposal is put back so it can be pressed again', async () => {
    const realError = console.error; console.error = () => {};
    try {
      for (const was of ['proposed', 'undone']) {
        state.proposals = []; state.create = async () => { throw new Error('deadlock detected'); };
        const p = proposal({ status: was, undone_at: was === 'undone' ? 'T5' : null });
        assert.deepEqual([(await create(p.id)).status, p.status, p.flow_id], [500, was, null], was);
        state.create = () => ({ ok: true, flowId: 901, updatedAt: 'U' });
        assert.equal((await create(p.id)).status, 200);
      }
      // the owner's zone cannot be read: the same
      state.proposals = []; state.creates = []; state.broken = t => /FROM users/.test(t);
      const p = proposal();
      assert.deepEqual([(await create(p.id)).status, p.status, state.creates.length], [500, 'proposed', 0]);
    } finally { console.error = realError; }
  });
  test('the workflow is made but the row cannot be written: the workflow is taken away again — by what the maker answered — the proposal is as it was, and the error goes on', async () => {
    const WRITE = t => t.startsWith('UPDATE assistant_proposals SET flow_id = $2, flow_updated_at = $3');
    for (const was of ['proposed', 'undone']) {
      Object.assign(state, { proposals: [], creates: [], removes: [], sql: [], broken: WRITE });
      state.create = () => ({ ok: true, flowId: 931, updatedAt: '2026-11-24T11:00:00.654321Z' });
      const p = proposal({ status: was, undone_at: was === 'undone' ? 'T5' : null, flow_id: was === 'undone' ? 800 : null, flow_updated_at: was === 'undone' ? 'OLD' : null });
      const r = await create(p.id);
      assert.deepEqual([r.status, r.body.error, r.body.detail], [500, 'Internal server error', 'the database is away'], `${was}: the error that happened is the one passed on`);
      assert.deepEqual(state.removes.map(x => [x.db === pool, x.wid, x.flowId, x.updatedAt]), [[true, 7, 931, '2026-11-24T11:00:00.654321Z']], `${was}: the workflow just made, by the time it was written at`);
      assert.deepEqual([p.status, p.flow_id, p.flow_updated_at, p.made_at], [was, was === 'undone' ? 800 : null, was === 'undone' ? 'OLD' : null, null], `${was}: the row never says "created" for a workflow that is not there`);
      // in this order: claimed, made, the write that failed, taken away, put back
      const order = [state.sql.findIndex(q => q.sql.startsWith("UPDATE assistant_proposals SET status = 'created'")), state.sql.findIndex(q => WRITE(q.sql)), state.sql.findIndex(q => q.sql === "UPDATE assistant_proposals SET status = $2 WHERE id = $1 AND status = 'created'")];
      assert.ok(order.every(i => i >= 0) && order[0] < order[1] && order[1] < order[2], order.join());
      assert.deepEqual(state.sql[order[2]].params, [p.id, was]);
      // and it can be pressed again
      state.broken = null; state.create = () => ({ ok: true, flowId: 932, updatedAt: 'U' });
      const again = await create(p.id);
      assert.deepEqual([again.status, again.body.proposal.status, again.body.proposal.flow_id, state.removes.length], [200, 'created', 932, 1], was);
    }
  });
  test('… and when even taking it away fails, the proposal is still put back and the first error is the one that goes on', async () => {
    state.broken = t => t.startsWith('UPDATE assistant_proposals SET flow_id = $2');
    state.remove = () => { throw new Error('the maker is away too'); };
    const p = proposal();
    const r = await create(p.id);
    assert.deepEqual([r.status, r.body.detail, p.status, state.removes.length], [500, 'the database is away', 'proposed', 1]);
    state.remove = () => false;   // or it answers that nothing was deleted: the same
    state.proposals = []; state.removes = [];
    const q = proposal();
    assert.deepEqual([(await create(q.id)).status, q.status, state.removes.length], [500, 'proposed', 1]);
  });
  test('a workflow that was made and written is never taken away by "Create"', async () => {
    const p = proposal();
    assert.equal((await create(p.id)).status, 200);
    assert.equal(state.removes.length, 0);
  });
});

describe('POST /assistant/proposals/:id/undo, and "Create again"', () => {
  const undo = id => admin.request('POST', `/api/admin/assistant/proposals/${id}/undo`, {});
  const made = (more = {}) => proposal({ status: 'created', flow_id: 900, flow_updated_at: '2026-11-24T10:00:00.123456Z', made_at: 'T1', ...more });
  test('the workflow is taken away through the maker — by the time it was written, in its workspace — and the row and the record say so', async () => {
    const p = made();
    state.clock = 2000;
    const r = await undo(p.id);
    assert.deepEqual([r.status, r.body.proposal.status, r.body.proposal.undone_at, r.body.proposal.flow_id], [200, 'undone', 'T2000', 900]);
    assert.deepEqual(state.removes.map(x => [x.db === pool, x.wid, x.flowId, x.updatedAt]), [[true, 7, 900, '2026-11-24T10:00:00.123456Z']]);
    assert.deepEqual(state.record.map(x => x.entry), [{ workspaceId: 7, event: 'flow', actorId: null, flowId: null, flowName: 'Welcome new leads', title: 'Welcome new leads', detail: 'deleted' }], 'the entry the journey\'s own delete writes');
    assert.equal(state.asked.length, 0, 'Claude has no part in it');
  });
  test('a workflow that was switched on, has run or was changed is not taken away: said, and nothing changes', async () => {
    const p = made();
    state.remove = () => false;
    const r = await undo(p.id);
    assert.deepEqual([r.status, r.body], [409, { error: 'It was switched on, has run or was changed in the workspace. Remove it there.', code: 'changed' }]);
    assert.deepEqual([p.status, p.undone_at, state.record.length], ['created', null, 0]);
    // the maker took nothing away, so it is asked whether the workflow is still there — this one, in its workspace
    const asked = state.sql.filter(q => /journey_flows/.test(q.sql));
    assert.deepEqual(asked, [{ sql: 'SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', params: [900, 7] }]);
    assert.ok(state.sql.findIndex(q => /journey_flows/.test(q.sql)) > state.sql.findIndex(q => q.sql.startsWith('SELECT id, status, workspace_id, name, flow_id, flow_updated_at')), 'only after the maker was asked');
    assert.equal(state.removes.length, 1);
  });
  test('not taken away because it is no longer there at all (deleted in the workspace): there is nothing left to undo, the row says "undone" — and "Create again" works', async () => {
    const p = made();
    state.remove = () => false; state.flows = []; state.clock = 3000;
    const r = await undo(p.id);
    assert.deepEqual([r.status, Object.keys(r.body), r.body.proposal.id, r.body.proposal.status, r.body.proposal.undone_at, r.body.proposal.flow_id], [200, ['proposal'], p.id, 'undone', 'T3000', 900]);
    assert.deepEqual([p.status, p.undone_at], ['undone', 'T3000']);
    assert.equal(state.record.length, 0, 'whoever deleted it wrote the record: this click deleted nothing');
    assert.deepEqual(state.removes.map(x => [x.wid, x.flowId, x.updatedAt]), [[7, 900, '2026-11-24T10:00:00.123456Z']], 'the maker was asked first, once');
    assert.doesNotMatch(JSON.stringify(r.body), /flow_updated_at/);
    // a second undo finds nothing to undo; creating again makes it anew
    assert.deepEqual([(await undo(p.id)).status, (await undo(p.id)).body.code], [409, 'state']);
    state.create = () => ({ ok: true, flowId: 951, updatedAt: 'U3' });
    const again = await admin.request('POST', `/api/admin/assistant/proposals/${p.id}/create`, {});
    assert.deepEqual([again.status, again.body.proposal.status, again.body.proposal.flow_id, again.body.proposal.undone_at], [200, 'created', 951, null]);
  });
  test('"still there" is asked of the proposal\'s own workspace: a workflow of that number elsewhere is not this one', async () => {
    const p = made();
    state.remove = () => false; state.flows = [{ id: 900, workspace_id: 8 }, { id: 901, workspace_id: 7 }];
    assert.deepEqual([(await undo(p.id)).status, p.status], [200, 'undone']);
    state.proposals = []; state.flows = [{ id: 900, workspace_id: 7 }];
    const q = made();
    assert.deepEqual([(await undo(q.id)).body.code, q.status], ['changed', 'created']);
  });
  test('the database away while that is asked: an error, and the proposal stays "created"', async () => {
    const p = made();
    state.remove = () => false; state.broken = t => /journey_flows/.test(t);
    assert.deepEqual([(await undo(p.id)).status, p.status, p.undone_at], [500, 'created', null]);
  });
  test('nothing to undo: a proposal that was never made, one that is undone already, one without its workflow; none at all', async () => {
    for (const more of [{ status: 'proposed', flow_id: null }, { status: 'undone', flow_id: 900 }, { status: 'created', flow_id: null }]) {
      state.proposals = [];
      const p = proposal(more);
      const r = await undo(p.id);
      assert.deepEqual([r.status, r.body], [409, { error: 'There is nothing to undo: no workflow was made of this proposal.', code: 'state' }], JSON.stringify(more));
    }
    for (const id of ['999', 'abc', '0']) assert.deepEqual([(await undo(id)).status, (await undo(id)).body.code], [404, 'not_found'], id);
    const gone = made({ workspace_id: null });
    assert.deepEqual([(await undo(gone.id)).body.code, state.removes.length], ['workspace', 0], 'its workspace was deleted, and the workflow with it');
  });
  test('undone twice at once: the second finds nothing to take away', async () => {
    const p = made();
    let calls = 0;
    state.remove = () => ++calls === 1;
    const [a, b] = [await undo(p.id), await undo(p.id)];
    assert.deepEqual([a.status, b.status, b.body.code], [200, 409, 'state']);
  });
  test('"Create again" after an undo makes the workflow again, from the same proposal', async () => {
    const p = made();
    await undo(p.id);
    state.create = () => ({ ok: true, flowId: 950, updatedAt: 'U2' });
    const r = await admin.request('POST', `/api/admin/assistant/proposals/${p.id}/create`, {});
    assert.deepEqual([r.status, r.body.proposal.status, r.body.proposal.flow_id, r.body.proposal.undone_at, p.flow_updated_at], [200, 'created', 950, null, 'U2']);
    assert.deepEqual(state.creates[0].spec, p.spec);
    assert.equal((await undo(p.id)).status, 200, 'and it can be undone again');
    assert.deepEqual(state.removes.at(-1).flowId, 950);
  });
});

// What the server side's fault run found unpinned (ASSISTANT_CHANGES, "the server side's fault run"): each of these
// passed although a fault had been put into the route.
describe('found by the fault run', () => {
  const create = id => admin.request('POST', `/api/admin/assistant/proposals/${id}/create`, {});
  const undo = id => admin.request('POST', `/api/admin/assistant/proposals/${id}/undo`, {});
  const CARD = () => ({ spec: { name: 'Welcome new leads', start: { config: { trigger: 'lead' }, next: 'mail1', explain: 'Starts on a lead.' }, steps: [{ key: 'mail1', kind: 'email', title: 'Welcome', next: null, explain: 'Sends the welcome email.' }] },
    view: { start: { label: 'Start', settings: { trigger: 'lead' }, next: 'mail1' }, steps: [{ key: 'mail1', kind: 'email', label: 'Email', title: 'Welcome', body: 'Hallo', wait_minutes: 0, settings: {}, next: null, else: null, routes: [] }] } });
  const SHOWN = { start: { label: 'Start', settings: { trigger: 'lead' }, next: 'mail1', explain: 'Starts on a lead.' },
    steps: [{ key: 'mail1', kind: 'email', label: 'Email', title: 'Welcome', body: 'Hallo', wait_minutes: 0, settings: {}, next: null, else: null, routes: [], explain: 'Sends the welcome email.' }] };
  const isCard = (p, why) => {
    assert.deepEqual([p.start, p.steps], [SHOWN.start, SHOWN.steps], `${why}: the card, with each box and its sentence`);
    assert.deepEqual(['spec' in p, 'view' in p, 'flow_updated_at' in p], [false, false, false], `${why}: never the row as it is kept`);
  };
  test('what "Create" answers is the card the console draws — its start and steps — not the row', async () => {
    const p = proposal(CARD());
    const r = await create(p.id);
    assert.deepEqual([r.status, r.body.proposal.status], [200, 'created']);
    isCard(r.body.proposal, 'created');
  });
  test('… and so are both answers of "Undo": taken away, and no longer there', async () => {
    const taken = proposal({ ...CARD(), status: 'created', flow_id: 900, flow_updated_at: '2026-11-24T10:00:00.123456Z', made_at: 'T1' });
    const a = await undo(taken.id);
    assert.deepEqual([a.status, a.body.proposal.status], [200, 'undone']);
    isCard(a.body.proposal, 'undone');
    const gone = proposal({ ...CARD(), status: 'created', flow_id: 901, flow_updated_at: '2026-11-24T10:00:00.123456Z', made_at: 'T1' });
    state.remove = () => false; state.flows = [];
    const b = await undo(gone.id);
    assert.deepEqual([b.status, b.body.proposal.status], [200, 'undone']);
    isCard(b.body.proposal, 'gone');
  });
  test('a sentence Claude wrote for the admin is cut at two thousand characters: the workflow\'s, the start\'s and a step\'s — as kept and as shown', async () => {
    const long = `  ${'x'.repeat(2500)}  `;
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC({ explain: long, start: { config: { trigger: 'lead' }, next: 'mail1', explain: long }, steps: [{ key: 'mail1', kind: 'email', title: 'Welcome', next: null, explain: long }] }))), say('ok')];
    const r = await ask({ chat_id: null, text: 'go' });
    const shown = r.body.proposals[0];
    assert.deepEqual([state.proposals[0].explain.length, shown.explain.length, shown.start.explain.length, shown.steps[0].explain.length], [2000, 2000, 2000, 2000]);
    assert.deepEqual([shown.explain, shown.start.explain, shown.steps[0].explain], Array(3).fill('x'.repeat(2000)), 'the blanks around it do not count');
  });
  test('only a whole number of up to nine digits is ever looked up: for anything else in the address nothing is asked of the database', async () => {
    for (const id of ['999999999999', '9999999999', '1.5', '1e3', '-5', '+5', '5 ', '0x10', 'abc', '0', '05']) {
      for (const [method, path, code] of [['POST', `proposals/${encodeURIComponent(id)}/create`, 'not_found'], ['POST', `proposals/${encodeURIComponent(id)}/undo`, 'not_found'], ['GET', `chats/${encodeURIComponent(id)}`, 'chat']]) {
        state.sql = [];
        const r = await admin.request(method, `/api/admin/assistant/${path}`, method === 'POST' ? {} : undefined);
        assert.deepEqual([r.status, r.body.code, state.sql], [404, code, []], `${method} ${path}`);
      }
    }
    assert.deepEqual([state.creates.length, state.removes.length], [0, 0]);
    state.sql = [];
    assert.equal((await create('999999999')).status, 404, 'nine digits are a number that is looked up — and not there');
    assert.deepEqual(state.sql.map(q => q.params), [[999999999], [999999999]]);
  });
  test('a proposal\'s workspace is looked up only by a whole number: a text, a fraction or a negative number never reaches the database', async () => {
    for (const workspace_id of ['7', 1.5, -1, 0, 7.5, '7; DROP TABLE workspaces', 2147483647, true, [7], { id: 7 }]) {
      state.sql = []; state.asked = []; state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC({ workspace_id }))), say('ok')];
      await ask({ chat_id: null, text: 'go' });
      assert.deepEqual([state.asked[1].messages[2].content[0].is_error, state.asked[1].messages[2].content[0].content], [true, 'There is no workspace with that id. Look the workspace up with list_workspaces first.'], JSON.stringify(workspace_id));
      assert.deepEqual(state.sql.filter(q => /FROM workspaces/.test(q.sql)), [], `${JSON.stringify(workspace_id)}: nothing is asked about a workspace`);
    }
    assert.equal(state.proposals.length, 0);
  });
  test('a new conversation that a proposal began, and that then cannot be saved, is given back: the last thing asked frees it', async () => {
    state.script = [turn('tool_use', use('tu_1', 'propose_workflow', SPEC())), say('I proposed it.')];
    state.broken = t => /^UPDATE assistant_chats SET messages/.test(t);
    const realError = console.error; console.error = () => {};
    let r; try { r = await ask({ chat_id: null, text: 'Welcome new leads' }); } finally { console.error = realError; }
    assert.equal(r.status, 500);
    assert.deepEqual(state.sql.at(-1), { sql: 'UPDATE assistant_chats SET busy_at = NULL WHERE id = $1', params: [100] });
    assert.deepEqual([chat(100).busy_at, chat(100).messages], [null, []], 'free again, and nothing half is in it');
    // and so is one that began only with its saving
    state.chats = []; state.sql = []; state.script = [say('ok')];
    console.error = () => {};
    try { r = await ask({ chat_id: null, text: 'hi' }); } finally { console.error = realError; }
    assert.deepEqual([r.status, state.sql.at(-1), chat(100).busy_at], [500, { sql: 'UPDATE assistant_chats SET busy_at = NULL WHERE id = $1', params: [100] }, null]);
  });
  test('giving a conversation back can fail too: the order is still answered, and nothing is left unhandled', async () => {
    const c = chatWith([]);
    const unhandled = [], note = err => unhandled.push(err);
    process.on('unhandledRejection', note);
    let r;
    try {
      state.script = [turn('refusal')];
      state.broken = t => t === 'UPDATE assistant_chats SET busy_at = NULL WHERE id = $1';
      r = await ask({ chat_id: c.id, text: 'something that is declined' });
      await new Promise(done => setTimeout(done, 30));   // a rejection nobody handles is told a moment later
    } finally { process.off('unhandledRejection', note); }
    assert.deepEqual([r.status, r.body.code], [502, 'declined']);
    assert.deepEqual(state.sql.at(-1).sql, 'UPDATE assistant_chats SET busy_at = NULL WHERE id = $1', 'it was tried');
    assert.deepEqual(unhandled, []);
  });
  test('a paused turn and then a failure: what Claude had said so far is kept, and the conversation is named', async () => {
    state.script = [turn('pause_turn', text('Still working on it.')), new SDK.APIConnectionError({ message: 'Connection error.' })];
    const r = await ask({ chat_id: null, text: 'a long order' });
    assert.deepEqual([r.status, r.body.code, r.body.chat_id], [502, 'unreachable', 100]);
    assert.deepEqual([chat(100).messages.map(m => m.role), chat(100).messages[1].content, chat(100).busy_at], [['user', 'assistant'], [text('Still working on it.')], null]);
    // into a conversation that was there: one more than the admin's own text is enough to keep it
    const c = chatWith([{ role: 'user', content: 'a' }, { role: 'assistant', content: [text('b')] }]);
    state.script = [turn('pause_turn', text('Thinking.')), new SDK.RateLimitError(429, { type: 'error', error: { message: 'slow' } }, undefined, new Headers())];
    const again = await ask({ chat_id: c.id, text: 'go on' });
    assert.deepEqual([again.body.code, again.body.chat_id, c.messages.length, c.messages.at(-1).content], ['rate', c.id, 4, [text('Thinking.')]]);
  });
  test('read again: the assistant\'s words stay when a later turn of the same order holds only tool calls', async () => {
    const c = chatWith([{ role: 'user', content: 'Welcome new leads' }, { role: 'assistant', content: [text('I will look the workspace up first.'), use('tu_1', 'list_workspaces')] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '[]' }] }, { role: 'assistant', content: [use('tu_2', 'workspace_setup', { workspace_id: 7 })] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_2', content: '{}' }] }]);
    const r = await admin.request('GET', `/api/admin/assistant/chats/${c.id}`);
    assert.deepEqual(r.body.chat.entries, [{ role: 'you', text: 'Welcome new leads', proposals: [] }, { role: 'assistant', text: 'I will look the workspace up first.', proposals: [] }]);
    c.messages.push({ role: 'assistant', content: [text('   '), thinking] });
    assert.equal((await admin.request('GET', `/api/admin/assistant/chats/${c.id}`)).body.chat.entries[1].text, 'I will look the workspace up first.', 'nor does a turn of blanks take them away');
    c.messages.push({ role: 'assistant', content: [text('Here is the proposal.')] });
    assert.equal((await admin.request('GET', `/api/admin/assistant/chats/${c.id}`)).body.chat.entries[1].text, 'Here is the proposal.', 'later words are the answer');
  });
  test('read again: only text blocks are words — a block of another kind that carries a text is shown on neither side', async () => {
    const c = chatWith([{ role: 'user', content: [{ type: 'other', text: 'not what the admin wrote' }, text('What does it do?')] },
      { role: 'assistant', content: [{ type: 'other', text: 'not for the admin' }, { type: 'thinking', thinking: '', text: 'nor this', signature: 's' }, text('It sends one email.')] }]);
    const r = await admin.request('GET', `/api/admin/assistant/chats/${c.id}`);
    assert.deepEqual(r.body.chat.entries, [{ role: 'you', text: 'What does it do?', proposals: [] }, { role: 'assistant', text: 'It sends one email.', proposals: [] }]);
  });
  test('read again: a conversation that begins with a tool\'s answer — before the assistant said anything — is read without an error', async () => {
    const c = chatWith([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_0', content: 'Proposal 500 is shown to the admin with a Create button. Nothing is written into the workspace until they press it.' }] },
      { role: 'user', content: 'And now?' }, { role: 'assistant', content: [text('Now this.')] }]);
    proposal({ chat_id: c.id });
    const r = await admin.request('GET', `/api/admin/assistant/chats/${c.id}`);
    assert.deepEqual([r.status, r.body.chat.entries], [200, [{ role: 'you', text: 'And now?', proposals: [] }, { role: 'assistant', text: 'Now this.', proposals: [] }]]);
  });
});

describe('the lines that make it so', () => {
  const code = read('routes/admin-assistant.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('the statements of the route are these twenty and no others — none deletes, none writes a workspace\'s table, none sets `active`', () => {
    const inFile = [...code.matchAll(/(['`])((?:SELECT|INSERT|UPDATE|DELETE|WITH|ALTER|DROP|TRUNCATE)\b[\s\S]*?)\1[,)]/g)].map(m => flat(m[2]).replace(/\$\{PROPOSAL_COLUMNS\}/g, COLS));
    assert.deepEqual([...new Set(inFile)].sort(), [...KNOWN].sort());
    assert.equal(KNOWN.length, 20);
    // one of them stands in two places: "undone" is written by an undo that took the workflow away, and by one that found it gone
    const UNDONE = `UPDATE assistant_proposals SET status = 'undone', undone_at = NOW() WHERE id = $1 RETURNING ${COLS}`;
    assert.deepEqual(inFile.filter((s, i) => inFile.indexOf(s) !== i), [UNDONE]);
    assert.equal(inFile.length, 21);
    assert.equal((code.match(/pool\.query\(/g) || []).length, 21, 'every question to the database is one of them');
    const writes = inFile.filter(s => /^(INSERT|UPDATE|DELETE)/.test(s)).map(s => s.split(' ').slice(0, 3).join(' '));
    assert.deepEqual([...new Set(writes)].sort(), ['INSERT INTO assistant_chats', 'INSERT INTO assistant_proposals', 'UPDATE assistant_chats SET', 'UPDATE assistant_proposals SET']);
    assert.deepEqual([...new Set(inFile.flatMap(s => [...s.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/g)].map(m => m[1])))].sort(), ['assistant_chats', 'assistant_proposals', 'journey_flows', 'users', 'workspaces']);
    // the one thing asked of a workspace's own table: is a workflow still there — its id, nothing of what is in it
    assert.deepEqual(inFile.filter(s => /journey_|workspaces|users/.test(s)).sort(), ['SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', 'SELECT id, name FROM workspaces WHERE id = $1', "SELECT timezone FROM users WHERE workspace_id = $1 AND role = 'owner' ORDER BY id LIMIT 1"]);
    assert.equal((code.match(/journey_flows/g) || []).length, 1, 'named once, in that question');
    assert.doesNotMatch(code, /DELETE FROM|\bactive\b|journey_nodes|journey_runs|contacts|deals/);
    assert.doesNotMatch(read('utils/assistant.js').replace(/\/\*[\s\S]*?\*\//, ''), /SELECT |INSERT |UPDATE |DELETE /, 'Claude\'s side holds no statement at all');
  });
  test('a workflow is made and taken away only by the maker, and only by the two routes a click reaches', () => {
    assert.equal((code.match(/journeyCreate\.create\(/g) || []).length, 1);
    // taken away in two places: by "Undo", and by "Create" itself for the workflow it has just made and could not write down
    assert.equal((code.match(/journeyCreate\.remove\(/g) || []).length, 2);
    const createRoute = code.slice(code.indexOf("router.post('/assistant/proposals/:id/create'"), code.indexOf("router.post('/assistant/proposals/:id/undo'")), undoRoute = code.slice(code.indexOf("router.post('/assistant/proposals/:id/undo'"));
    assert.match(createRoute, /catch \(err\) \{\s+await journeyCreate\.remove\(pool, mine\.workspace_id, out\.flowId, out\.updatedAt\)\.catch\(\(\) => \{\}\);\s+throw err;\s+\}/, 'only what this very click made, and only inside the catch of the write that failed');
    assert.equal((createRoute.match(/journeyCreate\.remove\(/g) || []).length, 1);
    assert.match(undoRoute, /if \(!await journeyCreate\.remove\(pool, p\.workspace_id, p\.flow_id, p\.flow_updated_at\)\) \{/);
    assert.ok(createRoute.indexOf('journeyCreate.create(') < createRoute.indexOf('journeyCreate.remove('), 'never before it was made');
    const askRoute = code.slice(code.indexOf("router.post('/assistant/ask'"), code.indexOf('function entriesOf'));
    assert.doesNotMatch(askRoute, /journeyCreate\.(create|remove)|log\.record/, 'an order can check and propose — it cannot make');
    assert.match(askRoute, /journeyCreate\.check\(pool, workspace\.id, spec, \{ boxes, tz: await zoneOf\(workspace\.id\) \}\)/);
    assert.match(code, /const \{ boxes \}\s+= require\('\.\/journey'\);/);
    assert.match(code, /if \(name === tools\.PROPOSE_TOOL\.name\) return await propose\(input\);\s+const out = await tools\.runRead\(pool, name, input\);/, 'whatever is not the proposal is the lookups\' — there is no third thing a tool call can reach');
  });
  test('the key stays in utils/assistant.js: the route never reads it, and logs one line only', () => {
    assert.doesNotMatch(code, /\bc\.key\b|config\(\)\.key|apiKey|process\.env/);
    assert.equal((code.match(/console\.(error|log|warn)\(/g) || []).length, 1);
    assert.match(code, /assistant\.ask\(assistant\.client\(\), \{ model: c\.model, system: prompt\.SYSTEM, tools: tools\.TOOLS,/);
  });
  test('mounted with the console\'s other routers, and an order is limited: twenty in ten minutes', () => {
    const s = read('server.js');
    const iFb = s.indexOf("app.use('/api/admin',         require('./routes/admin-facebook'));"), iLimit = s.indexOf("app.use('/api/admin/assistant/ask', assistantAskLimiter);"), iMount = s.indexOf("app.use('/api/admin',         require('./routes/admin-assistant'));");
    assert.ok(iFb > 0 && iFb < iLimit && iLimit < iMount, 'the limiter stands before the router it limits');
    assert.match(s, /const assistantAskLimiter = rateLimit\(\{\s+windowMs: 10 \* 60 \* 1000, max: 20,/);
  });
  test('the two tables: the platform\'s own, outliving a workspace and a conversation, and left out of a workspace\'s export', () => {
    const db = read('db.js');
    const chats = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS assistant_chats ('), db.indexOf('CREATE TABLE IF NOT EXISTS assistant_proposals ('));
    for (const line of ['id         SERIAL PRIMARY KEY,', "title      TEXT NOT NULL DEFAULT '',", "messages   JSONB NOT NULL DEFAULT '[]',", 'busy_at    TIMESTAMPTZ,', 'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),', 'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()']) assert.ok(chats.includes(`      ${line}\n`), line);
    const proposals = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS assistant_proposals ('));
    for (const line of ['id              SERIAL PRIMARY KEY,', 'chat_id         INTEGER REFERENCES assistant_chats(id) ON DELETE SET NULL,', 'workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,', "workspace_name  TEXT NOT NULL DEFAULT '',", 'name            TEXT NOT NULL,',
      "asked           TEXT NOT NULL DEFAULT '',", "explain         TEXT NOT NULL DEFAULT '',", 'spec            JSONB NOT NULL,', "view            JSONB NOT NULL DEFAULT '{}',", "notes           JSONB NOT NULL DEFAULT '[]',", "status          TEXT NOT NULL DEFAULT 'proposed',",
      'flow_id         INTEGER,', 'flow_updated_at TEXT,', 'made_at         TIMESTAMPTZ,', 'undone_at       TIMESTAMPTZ,', 'created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()']) assert.ok(proposals.slice(0, 1200).includes(`      ${line}\n`), line);
    assert.ok(db.indexOf('CREATE TABLE IF NOT EXISTS assistant_chats') > db.indexOf('CREATE TABLE IF NOT EXISTS facebook_leads'), 'after the tables that were there');
    const { LEFT_OUT } = require('../../utils/workspace-export');
    assert.deepEqual([LEFT_OUT.assistant_chats, LEFT_OUT.assistant_proposals], ['platform', 'platform']);
    const env = read('.env.example');
    assert.match(env, /^# ANTHROPIC_API_KEY=$/m); assert.match(env, /^# ASSISTANT_MODEL=$/m);
    assert.doesNotMatch(env, /sk-ant-/);
  });
});
