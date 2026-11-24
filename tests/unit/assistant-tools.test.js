// UNIT tests for utils/assistant-tools.js (ASSISTANT_CHANGES, 2026-11-24): what the admin console's assistant — a
// Claude the platform's admin gives orders to — may read, and the four tools it is told it has.
//
// The point of this file is the limit: the assistant LOOKS and PROPOSES, and there is nothing else it could do. So
// the tests read the file's own statements — each a SELECT, of a fixed list of tables, naming no column that is
// secret or personal, never a contact's or a deal's row — and run every tool against a stand-in database that knows
// exactly those statements and no others. The stand-in keeps rows WITH secrets in them (a lead webhook's key, a
// token, an email address): none of it may come out.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const tools = require('../../utils/assistant-tools');

const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
const SECRETS = /SECRET-KEY|TOKEN-|s3cret|olga@example\.de|\+49 151|sealed-/;
const state = { asked: [], broken: false, workspaces: [], users: [], memberships: [], pipelines: [], stages: [], dealFields: [], contactFields: [], hooks: [], mail: [], fonio: [], calcom: [], calendly: [], pages: [], flows: [], nodes: [], deals: {}, contacts: {} };
const of = (list, wid) => list.filter(r => r.workspace_id === wid);
const pool = { query: async (sql, p = []) => {
  const t = flat(sql);
  state.asked.push({ sql: t, params: p });
  if (state.broken) throw new Error('the database is away');
  if (t === 'SELECT w.id, w.name, (SELECT COUNT(*)::int FROM (SELECT u.id FROM users u WHERE u.workspace_id = w.id UNION SELECT uw.user_id FROM user_workspaces uw WHERE uw.workspace_id = w.id) m) AS members, (SELECT COUNT(*)::int FROM pipelines p WHERE p.workspace_id = w.id) AS pipelines, (SELECT COUNT(*)::int FROM deals d WHERE d.workspace_id = w.id) AS deals, (SELECT COUNT(*)::int FROM contacts c WHERE c.workspace_id = w.id) AS contacts, (SELECT COUNT(*)::int FROM journey_flows f WHERE f.workspace_id = w.id) AS workflows FROM workspaces w ORDER BY lower(w.name), w.id') {
    return { rows: [...state.workspaces].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id).map(w => ({ ...w,
      members: new Set([...of(state.users, w.id).map(u => u.id), ...of(state.memberships, w.id).map(m => m.user_id)]).size, pipelines: of(state.pipelines, w.id).length,
      deals: state.deals[w.id] || 0, contacts: state.contacts[w.id] || 0, workflows: of(state.flows, w.id).length })) };
  }
  if (t === 'SELECT id, name FROM workspaces WHERE id = $1') return { rows: state.workspaces.filter(w => w.id === p[0]) };
  if (t === 'SELECT id, name FROM pipelines WHERE workspace_id = $1 ORDER BY position, id') return { rows: of(state.pipelines, p[0]).sort((a, b) => a.position - b.position || a.id - b.id) };
  if (t === 'SELECT id, pipeline_id, name, position FROM pipeline_stages WHERE workspace_id = $1 ORDER BY pipeline_id, position, id') return { rows: of(state.stages, p[0]).sort((a, b) => a.pipeline_id - b.pipeline_id || a.position - b.position || a.id - b.id) };
  if (t === 'SELECT field_key, name, type, options FROM deal_fields WHERE workspace_id = $1 ORDER BY position, id') return { rows: of(state.dealFields, p[0]) };
  if (t === 'SELECT field_key, name, type, options FROM custom_fields WHERE workspace_id = $1 ORDER BY position, id') return { rows: of(state.contactFields, p[0]) };
  if (t === 'SELECT id, name, active, create_deal, pipeline_id FROM workspace_webhook WHERE workspace_id = $1 ORDER BY id') return { rows: of(state.hooks, p[0]) };
  if (t === 'SELECT u.id, u.name, COALESCE(uw.role, u.role) AS role FROM users u LEFT JOIN user_workspaces uw ON uw.user_id = u.id AND uw.workspace_id = $1 WHERE u.workspace_id = $1 OR uw.user_id IS NOT NULL ORDER BY lower(u.name), u.id') {
    const rows = state.users.map(u => ({ u, uw: state.memberships.find(m => m.user_id === u.id && m.workspace_id === p[0]) })).filter(({ u, uw }) => u.workspace_id === p[0] || uw);
    return { rows: rows.map(({ u, uw }) => ({ ...u, role: uw ? uw.role : u.role })).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id) };
  }
  if (t === 'SELECT EXISTS (SELECT 1 FROM workspace_mail m WHERE m.workspace_id = $1) AS gmail, EXISTS (SELECT 1 FROM workspace_fonio f WHERE f.workspace_id = $1) AS fonio, EXISTS (SELECT 1 FROM workspace_fonio f WHERE f.workspace_id = $1 AND f.active) AS fonio_on, EXISTS (SELECT 1 FROM workspace_calcom c WHERE c.workspace_id = $1) AS calcom, EXISTS (SELECT 1 FROM workspace_calendly c WHERE c.workspace_id = $1) AS calendly, (SELECT COUNT(*)::int FROM facebook_pages p WHERE p.workspace_id = $1) AS facebook_pages') {
    return { rows: [{ gmail: of(state.mail, p[0]).length > 0, fonio: of(state.fonio, p[0]).length > 0, fonio_on: of(state.fonio, p[0]).some(f => f.active), calcom: of(state.calcom, p[0]).length > 0, calendly: of(state.calendly, p[0]).length > 0, facebook_pages: of(state.pages, p[0]).length }] };
  }
  if (t === "SELECT f.id, f.name, f.active, s.config->>'trigger' AS start_trigger, (SELECT COUNT(*)::int FROM journey_nodes n WHERE n.flow_id = f.id AND n.kind <> 'start') AS boxes FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.workspace_id = $1 ORDER BY f.id") {
    return { rows: of(state.flows, p[0]).sort((a, b) => a.id - b.id).map(f => { const own = state.nodes.filter(n => n.flow_id === f.id), start = own.find(n => n.kind === 'start');
      return { ...f, start_trigger: start && start.config && start.config.trigger != null ? String(start.config.trigger) : null, boxes: own.filter(n => n.kind !== 'start').length }; }) };
  }
  if (t === 'SELECT id, name, active, updated_at FROM journey_flows WHERE workspace_id = $1 AND id = $2') return { rows: state.flows.filter(f => f.workspace_id === p[0] && f.id === p[1]) };
  if (t === 'SELECT id, kind, title, body, wait_minutes, config, next_id, x, y, else_id FROM journey_nodes WHERE workspace_id = $1 AND flow_id = $2 ORDER BY id') return { rows: state.nodes.filter(n => n.workspace_id === p[0] && n.flow_id === p[1]).sort((a, b) => a.id - b.id) };
  throw new Error(`a statement nobody expected: ${t}`);
} };

beforeEach(() => Object.assign(state, { asked: [], broken: false,
  workspaces: [{ id: 7, name: 'Müller Immobilien', miro_url: 'https://miro.example/s3cret' }, { id: 8, name: 'acme <b>' }, { id: 9, name: 'Leer' }],
  users: [{ id: 1, workspace_id: 7, name: 'Olga Owner', role: 'owner', email: 'olga@example.de', password_hash: 'sealed-hash', timezone: 'Europe/Berlin' }, { id: 2, workspace_id: 7, name: 'anna Agent', role: 'member', email: 'olga@example.de' },
    { id: 3, workspace_id: 8, name: 'Gast', role: 'owner', email: 'olga@example.de' }, { id: 4, workspace_id: 8, name: 'Other', role: 'owner' }],
  memberships: [{ user_id: 1, workspace_id: 7, role: 'owner' }, { user_id: 2, workspace_id: 7, role: 'admin' }, { user_id: 3, workspace_id: 7, role: 'member' }, { user_id: 3, workspace_id: 8, role: 'owner' }],
  pipelines: [{ id: 3, workspace_id: 7, name: 'Vertrieb', position: 1 }, { id: 4, workspace_id: 7, name: 'Akquise', position: 0 }, { id: 5, workspace_id: 8, name: 'Sales', position: 0 }],
  stages: [{ id: 31, workspace_id: 7, pipeline_id: 3, name: 'Kontaktiert', position: 1, color: '#fff' }, { id: 30, workspace_id: 7, pipeline_id: 3, name: 'Neu', position: 0 }, { id: 40, workspace_id: 7, pipeline_id: 4, name: 'Kalt', position: 0 }, { id: 50, workspace_id: 8, pipeline_id: 5, name: 'New', position: 0 }],
  dealFields: [{ workspace_id: 7, field_key: 'budget', name: 'Budget', type: 'number', options: [] }, { workspace_id: 7, field_key: 'art', name: 'Art', type: 'select', options: ['Kauf', 'Miete', 5, { label: 'x' }, null, 'L'.repeat(150)] }, { workspace_id: 8, field_key: 'other', name: 'Other', type: 'text', options: [] }],
  contactFields: [{ workspace_id: 7, field_key: 'email', name: 'Zweite Adresse', type: 'text', options: null }],
  hooks: [{ id: 12, workspace_id: 7, name: 'Website', active: true, create_deal: true, pipeline_id: 3, webhook_key: 'SECRET-KEY-12', field_map: { email: 'olga@example.de' }, sample: { phone: '+49 151 1' } }, { id: 13, workspace_id: 7, name: 'Facebook', active: false, create_deal: false, pipeline_id: null, webhook_key: 'SECRET-KEY-13' },
    { id: 20, workspace_id: 8, name: 'Leads', active: true, create_deal: true, pipeline_id: 5, webhook_key: 'SECRET-KEY-20' }],
  mail: [{ workspace_id: 7, email: 'olga@example.de', refresh_token_sealed: 'sealed-1' }], fonio: [{ workspace_id: 7, active: false, api_key_sealed: 'sealed-2', from_number: '+49 151 2', receive_token: 'TOKEN-F' }], calcom: [], calendly: [{ workspace_id: 7, token_sealed: 'sealed-3' }],
  pages: [{ workspace_id: 7, page_id: '100', token: 'TOKEN-P' }, { workspace_id: 7, page_id: '300', token: 'TOKEN-Q' }, { workspace_id: 8, page_id: '200', token: 'TOKEN-R' }],
  flows: [{ id: 60, workspace_id: 7, name: 'Begrüßung', active: true, updated_at: '2026-11-20T10:00:00.000Z', created_by: 1 }, { id: 61, workspace_id: 7, name: 'Leer', active: false, updated_at: '2026-11-21T10:00:00.000Z' }, { id: 70, workspace_id: 8, name: 'Theirs', active: false, updated_at: 'x' }],
  nodes: [{ id: 600, workspace_id: 7, flow_id: 60, kind: 'start', title: '', body: '', wait_minutes: 0, config: { trigger: 'lead', webhook_ids: [12], stage_id: null, stop_stage_ids: [31] }, next_id: 601, x: null, y: null, else_id: null, created_at: 'then' },
    { id: 601, workspace_id: 7, flow_id: 60, kind: 'email', title: 'Danke', body: 'Guten Tag {{first_name|}}', wait_minutes: 0, config: { tz: 'Europe/Berlin' }, next_id: 602, x: 10, y: 20, else_id: null },
    { id: 602, workspace_id: 7, flow_id: 60, kind: 'branch', title: '', body: '', wait_minutes: 2880, config: { test: 'has_phone' }, next_id: null, x: null, y: null, else_id: 601 },
    { id: 610, workspace_id: 7, flow_id: 61, kind: 'start', title: '', body: '', wait_minutes: 0, config: { trigger: null }, next_id: null, x: null, y: null, else_id: null },
    { id: 700, workspace_id: 8, flow_id: 70, kind: 'start', title: '', body: '', wait_minutes: 0, config: { trigger: 'manual' }, next_id: null, x: null, y: null, else_id: null }],
  deals: { 7: 41, 8: 3 }, contacts: { 7: 120 } }));

describe('the four tools, and no others', () => {
  test('three that read and one that proposes — in this order, each with what it is for and what it takes', () => {
    assert.deepEqual(tools.TOOLS.map(t => t.name), ['list_workspaces', 'workspace_setup', 'read_workflow', 'propose_workflow']);
    assert.deepEqual(tools.READ_TOOLS.map(t => t.name), ['list_workspaces', 'workspace_setup', 'read_workflow']);
    assert.equal(tools.PROPOSE_TOOL.name, 'propose_workflow');
    assert.deepEqual(tools.TOOLS, [...tools.READ_TOOLS, tools.PROPOSE_TOOL]);
    for (const t of tools.TOOLS) {
      assert.deepEqual(Object.keys(t), ['name', 'description', 'input_schema'], `${t.name}: nothing but what Claude is told of a tool (no "strict", no type of Anthropic's own)`);
      assert.ok(t.description.length > 150, `${t.name} says when to call it and what comes back`);
      assert.equal(t.input_schema.type, 'object');
    }
    assert.doesNotMatch(tools.TOOLS.map(t => t.name).join(' '), /delete|remove|update|change|edit|create|switch|activate|run|sql|query/i, 'no tool is named after anything but looking and proposing');
  });
  test('what the reading tools take: nothing, a workspace, a workspace and one of its workflows — and nothing beside it', () => {
    const [list, setup, flow] = tools.READ_TOOLS.map(t => t.input_schema);
    assert.deepEqual(list, { type: 'object', properties: {}, additionalProperties: false });
    assert.deepEqual([Object.keys(setup.properties), setup.required, setup.additionalProperties], [['workspace_id'], ['workspace_id'], false]);
    assert.deepEqual([Object.keys(flow.properties), flow.required, flow.additionalProperties], [['workspace_id', 'flow_id'], ['workspace_id', 'flow_id'], false]);
    for (const p of [setup.properties.workspace_id, flow.properties.workspace_id, flow.properties.flow_id]) assert.equal(p.type, 'integer');
  });
  test('proposing takes the workflow as it is written — the workspace, a name, why, the start, the steps by key, and notes', () => {
    const s = tools.PROPOSE_TOOL.input_schema;
    assert.deepEqual(Object.keys(s.properties), ['workspace_id', 'name', 'explain', 'start', 'steps', 'notes']);
    assert.deepEqual(s.required, ['workspace_id', 'name', 'explain', 'start', 'steps']);
    assert.deepEqual([Object.keys(s.properties.start.properties), s.properties.start.required], [['config', 'next', 'explain'], ['config', 'next']]);
    const step = s.properties.steps.items;
    assert.deepEqual(Object.keys(step.properties), ['key', 'kind', 'title', 'body', 'wait_minutes', 'config', 'next', 'else', 'routes', 'explain']);
    assert.deepEqual(step.required, ['key', 'kind']);
    assert.deepEqual([Object.keys(step.properties.routes.items.properties), step.properties.routes.items.required], [['name', 'when', 'next'], ['next']]);
    for (const line of [s.properties.start.properties.next, step.properties.next, step.properties.else, step.properties.routes.items.properties.next]) assert.deepEqual(line.type, ['string', 'null'], 'a line names a step, or nowhere');
    assert.deepEqual(step.properties.routes.items.properties.when.type, ['object', 'null']);
    assert.deepEqual([s.properties.notes.type, s.properties.notes.items], ['array', { type: 'string' }]);
    // a box's settings are free-form: the journey's own checks say what they may be, not the schema
    for (const free of [s.properties.start.properties.config, step.properties.config]) assert.deepEqual(Object.keys(free), ['type', 'description']);
    assert.equal('additionalProperties' in s, false, 'not strict: nothing here promises a shape the checks do not make');
  });
  test('every field Claude fills in says what it is', () => {
    const walk = (schema, path) => {
      for (const [k, p] of Object.entries(schema.properties || {})) {
        assert.ok(typeof p.description === 'string' && p.description.length > 20, `${path}${k} has no description`);
        walk(p, `${path}${k}.`);
        if (p.items && p.items.properties) walk(p.items, `${path}${k}[].`);
      }
    };
    for (const t of tools.TOOLS) walk(t.input_schema, `${t.name}.`);
  });
  test('the kinds of step and the limits are the journey\'s own', () => {
    const journey = read('routes/journey.js');
    const actions = JSON.parse(/const ACTIONS = (\[[^\]]+\]);/.exec(journey)[1].replace(/'/g, '"'));
    assert.deepEqual(tools.KINDS, actions);
    assert.deepEqual(tools.PROPOSE_TOOL.input_schema.properties.steps.items.properties.kind.enum, actions);
    const limits = /const MAX_FLOWS = (\d+), MAX_NODES = (\d+), MAX_NAME = (\d+), MAX_TITLE = (\d+), MAX_BODY = (\d+), MAX_WAIT = 365 \* 24 \* 60,/.exec(journey).slice(1).map(Number);
    assert.deepEqual(tools.LIMITS, { workflows_max: limits[0], boxes_max: limits[1] });
    const s = tools.PROPOSE_TOOL.input_schema.properties, step = s.steps.items.properties;
    assert.match(s.name.description, new RegExp(`1 to ${limits[2]} characters`));
    assert.match(step.title.description, new RegExp(`Up to ${limits[3]} characters`));
    assert.match(step.body.description, new RegExp(`Up to ${limits[4]} characters`));
    assert.match(step.wait_minutes.description, new RegExp(`at most ${365 * 24 * 60}\\b`));
    const routes = require('../../utils/journey-router');
    assert.match(step.routes.description, new RegExp(`1 to ${routes.MAX_ROUTES} routes`));
    assert.match(step.routes.items.properties.name.description, new RegExp(`up to ${routes.MAX_NAME} characters`));
    assert.match(step.key.description, /a small letter, then up to 29 small letters, digits or underscores/);
  });
  test('proposing says what it is: checked, shown with a "Create" button, nothing written, switched off', () => {
    const d = tools.PROPOSE_TOOL.description;
    for (const said of [/Nothing is written into the workspace by this call/, /only once the admin presses that button/, /switched off/, /problems they are all handed back at once/, /workspace_setup first/]) assert.match(d, said);
  });
});

describe('the statements: SELECTs of structure, and nothing else', () => {
  const file = read('utils/assistant-tools.js'), code = file.replace(/\/\*[\s\S]*?\*\//, '');
  const block = code.slice(code.indexOf('const SQL = {'), code.indexOf('\n};', code.indexOf('const SQL = {')) + 3), rest = code.replace(block, '');
  const ALLOWED = ['workspaces', 'users', 'user_workspaces', 'pipelines', 'pipeline_stages', 'deal_fields', 'custom_fields', 'workspace_webhook', 'workspace_mail', 'workspace_fonio', 'workspace_calcom', 'workspace_calendly', 'facebook_pages', 'journey_flows', 'journey_nodes'];
  const COUNTED = ['deals', 'contacts'];   // rows about people: how many, and nothing of any one
  test('every statement begins with SELECT and changes nothing', () => {
    assert.deepEqual(Object.keys(tools.SQL), ['workspaces', 'workspace', 'pipelines', 'stages', 'dealFields', 'contactFields', 'webhooks', 'members', 'connected', 'flows', 'flow', 'nodes']);
    for (const [name, sql] of Object.entries(tools.SQL)) {
      assert.match(flat(sql), /^SELECT /, name);
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|COPY|CALL|DO|SET|LOCK|RETURNING|INTO|FOR UPDATE)\b/i, name);
      assert.doesNotMatch(sql, /;|--|\/\*/, `${name}: one statement, no comment`);
    }
  });
  test('only the listed tables are read; a contact and a deal are only counted, in the list of workspaces', () => {
    const named = new Set();
    for (const sql of Object.values(tools.SQL)) for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)) named.add(m[1]);
    assert.deepEqual([...named].sort(), [...ALLOWED, ...COUNTED].sort());
    for (const [name, sql] of Object.entries(tools.SQL)) {
      for (const table of COUNTED) {
        const uses = (sql.match(new RegExp(`\\b${table}\\b`, 'g')) || []).length;
        if (name !== 'workspaces') { assert.equal(uses, 0, `${name} names ${table}`); continue; }
        assert.equal(uses, 2, 'once as the table, once as what the count is called');
        assert.match(flat(sql), new RegExp(`\\(SELECT COUNT\\(\\*\\)::int FROM ${table} [a-z] WHERE [a-z]\\.workspace_id = w\\.id\\) AS ${table}`));
      }
      assert.doesNotMatch(sql, /\b(activities|notes|tasks|webhook_logs|fonio_calls|fonio_other_calls|contact_documents|chat_messages|journey_runs|journey_log|journey_sends|email_accounts|api_keys|platform_settings|session|facebook_leads|notetaker_recordings)\b/, name);
    }
  });
  test('no statement names a column that is secret or personal — a key, a token, a hash, an address, a number, what a lead sent', () => {
    for (const [name, sql] of Object.entries(tools.SQL)) {
      assert.doesNotMatch(sql, /webhook_key|token|secret|password|api_key|sealed|email|phone|hash|field_map|sample|custom_data|from_number|number_prefixes|\*(?!\)::int)/i, name);
      assert.doesNotMatch(sql, /SELECT\s+(?:[a-z]+\.)?\*/i, `${name}: every column is named`);
    }
    assert.match(flat(tools.SQL.members), /^SELECT u\.id, u\.name, COALESCE\(uw\.role, u\.role\) AS role FROM users u /, 'of a member: an id, a name, a role');
    assert.match(flat(tools.SQL.webhooks), /^SELECT id, name, active, create_deal, pipeline_id FROM workspace_webhook /, 'of a lead webhook: never its key, its mapping or its sample');
    assert.match(flat(tools.SQL.connected), /^SELECT EXISTS \(SELECT 1 FROM workspace_mail /, 'of a connection: that it is there');
  });
  test('a workspace and a workflow are parameters of a statement, never part of one — and no statement stands anywhere else in the file', () => {
    assert.doesNotMatch(block, /\$\{/, 'no statement is put together');
    for (const [name, sql] of Object.entries(tools.SQL)) if (name !== 'workspaces') assert.match(sql, /workspace_id = \$1|WHERE id = \$1/, `${name} is one workspace's`);
    assert.deepEqual([...new Set([...rest.matchAll(/\.query\(([^,)]+)/g)].map(m => m[1].trim()))].sort(), ['SQL.flow', 'SQL.nodes', 'SQL.workspace', 'SQL.workspaces', 'sql']);
    assert.match(rest, /const ask = async sql => \(await pool\.query\(sql, \[wid\]\)\)\.rows;/, '"sql" is one of the list, asked for one workspace');
    assert.deepEqual([...rest.matchAll(/await ask\(([^)]+)\)/g)].map(m => m[1]), ['SQL.pipelines', 'SQL.stages', 'SQL.dealFields', 'SQL.contactFields', 'SQL.webhooks', 'SQL.members', 'SQL.connected', 'SQL.flows']);
    assert.doesNotMatch(rest, /\b(INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM|SELECT [^'"`\n]* FROM)\b/, 'outside the list there is no statement');
  });
  test('it opens no database and writes no log: the pool is handed in', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), []);
    assert.doesNotMatch(code, /console\.|process\.env|fetch\(/);
    assert.deepEqual(Object.keys(tools).sort(), ['KINDS', 'LIMITS', 'PROPOSE_TOOL', 'READ_TOOLS', 'SQL', 'TOOLS', 'runRead', 'summary']);
  });
  test('whatever is asked, and however often: only statements of the list reach the database', async () => {
    for (const [name, input] of [['list_workspaces', {}], ['workspace_setup', { workspace_id: 7 }], ['workspace_setup', { workspace_id: 999 }], ['read_workflow', { workspace_id: 7, flow_id: 60 }], ['read_workflow', { workspace_id: 7, flow_id: 999 }],
      ['propose_workflow', { workspace_id: 7 }], ['delete_workflow', { workspace_id: 7, flow_id: 60 }], ['workspace_setup', { workspace_id: '7; DROP TABLE deals' }]]) await tools.runRead(pool, name, input);
    const known = new Set(Object.values(tools.SQL).map(flat));
    assert.ok(state.asked.length >= 13);
    for (const q of state.asked) { assert.ok(known.has(q.sql), q.sql); assert.match(q.sql, /^SELECT /); }
    assert.doesNotMatch(JSON.stringify(state.asked), /DROP/);
  });
});

describe('list_workspaces: every workspace with how much is in it', () => {
  test('by name; a member is counted once, whether at home there or a guest; deals and contacts are numbers', async () => {
    const out = await tools.runRead(pool, 'list_workspaces', {});
    assert.deepEqual(out, { ok: true, data: [
      { id: 8, name: 'acme <b>', members: 2, pipelines: 1, deals: 3, contacts: 0, workflows: 1 },
      { id: 9, name: 'Leer', members: 0, pipelines: 0, deals: 0, contacts: 0, workflows: 0 },
      { id: 7, name: 'Müller Immobilien', members: 3, pipelines: 2, deals: 41, contacts: 120, workflows: 2 }] });
    assert.deepEqual([state.asked.length, state.asked[0].params], [1, []]);
    assert.doesNotMatch(JSON.stringify(out), SECRETS);
  });
  test('whatever is sent along is not looked at', async () => {
    for (const input of [null, undefined, 'x', [], { workspace_id: 7 }]) assert.equal((await tools.runRead(pool, 'list_workspaces', input)).data.length, 3);
  });
});

describe('workspace_setup: one workspace\'s structure', () => {
  test('pipelines with their stages in order, fields, lead webhooks, members, what is connected, workflows, limits', async () => {
    const out = await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 });
    assert.deepEqual(out, { ok: true, data: {
      workspace: { id: 7, name: 'Müller Immobilien' },
      pipelines: [{ id: 4, name: 'Akquise', stages: [{ id: 40, name: 'Kalt', position: 0 }] }, { id: 3, name: 'Vertrieb', stages: [{ id: 30, name: 'Neu', position: 0 }, { id: 31, name: 'Kontaktiert', position: 1 }] }],
      deal_fields: [{ key: 'budget', label: 'Budget', type: 'number' }, { key: 'art', label: 'Art', type: 'select', options: ['Kauf', 'Miete', '5', 'L'.repeat(100)] }],
      contact_fields: [{ key: 'email', label: 'Zweite Adresse', type: 'text' }],
      lead_webhooks: [{ id: 12, name: 'Website', active: true, makes_deals: true, pipeline_id: 3 }, { id: 13, name: 'Facebook', active: false, makes_deals: false, pipeline_id: null }],
      members: [{ id: 2, name: 'anna Agent', role: 'admin' }, { id: 3, name: 'Gast', role: 'member' }, { id: 1, name: 'Olga Owner', role: 'owner' }],
      connected: { gmail: true, fonio: true, fonio_on: false, calcom: false, calendly: true, facebook_pages: 2 },
      workflows: [{ id: 60, name: 'Begrüßung', active: true, trigger: 'lead', boxes: 2 }, { id: 61, name: 'Leer', active: false, trigger: null, boxes: 0 }],
      limits: { workflows_max: 20, boxes_max: 60 } } });
    assert.ok(state.asked.every(q => q.params.length === 1 && q.params[0] === 7), 'every statement is asked for that workspace, as a parameter');
    assert.equal(state.asked.length, 9);
  });
  test('a lead webhook: whether it is switched on and whether it makes deals are two things, each said as it is', async () => {
    state.hooks = [{ id: 12, workspace_id: 7, name: 'On, no deals', active: true, create_deal: false, pipeline_id: null }, { id: 13, workspace_id: 7, name: 'Off, makes deals', active: false, create_deal: true, pipeline_id: 3 },
      { id: 14, workspace_id: 7, name: 'Both', active: true, create_deal: true, pipeline_id: 3 }, { id: 15, workspace_id: 7, name: 'Neither', active: false, create_deal: false, pipeline_id: null }];
    const { data } = await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 });
    assert.deepEqual(data.lead_webhooks.map(h => [h.name, h.active, h.makes_deals]), [['On, no deals', true, false], ['Off, makes deals', false, true], ['Both', true, true], ['Neither', false, false]]);
  });
  test('nothing secret or personal comes out, though the rows hold it: no key of a lead webhook, no token, no address, no number', async () => {
    const text = JSON.stringify(await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 }));
    assert.doesNotMatch(text, SECRETS);
    assert.doesNotMatch(text, /webhook_key|field_map|sample|password|timezone|miro|color|refresh|"email":|created_by/);
    assert.match(JSON.stringify(state), SECRETS, 'the stand-in does hold them');
  });
  test('a role is the membership\'s where there is one, the user\'s own otherwise; a guest of the workspace is a member of it', async () => {
    state.memberships = state.memberships.filter(m => m.user_id !== 2);
    const { data } = await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 });
    assert.deepEqual(data.members.map(m => [m.id, m.role]), [[2, 'member'], [3, 'member'], [1, 'owner']]);
    const other = (await tools.runRead(pool, 'workspace_setup', { workspace_id: 8 })).data;
    assert.deepEqual(other.members.map(m => m.id), [3, 4], 'another workspace: its own people, and nothing of the first');
    assert.deepEqual([other.pipelines.map(p => p.id), other.lead_webhooks.map(h => h.id), other.workflows.map(f => [f.id, f.trigger]), other.connected], [[5], [20], [[70, 'manual']],
      { gmail: false, fonio: false, fonio_on: false, calcom: false, calendly: false, facebook_pages: 1 }]);
  });
  test('fonio connected is not fonio switched on — a call step needs both, and both are said', async () => {
    state.fonio[0].active = true;
    assert.deepEqual((await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 })).data.connected.fonio_on, true);
    state.fonio = [];
    const c = (await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 })).data.connected;
    assert.deepEqual([c.fonio, c.fonio_on], [false, false]);
  });
  test('an empty workspace is all there, with nothing in it', async () => {
    assert.deepEqual((await tools.runRead(pool, 'workspace_setup', { workspace_id: 9 })).data, { workspace: { id: 9, name: 'Leer' }, pipelines: [], deal_fields: [], contact_fields: [], lead_webhooks: [], members: [],
      connected: { gmail: false, fonio: false, fonio_on: false, calcom: false, calendly: false, facebook_pages: 0 }, workflows: [], limits: { workflows_max: 20, boxes_max: 60 } });
  });
  test('a field\'s choices: texts and numbers only, at most fifty of a hundred characters', async () => {
    state.dealFields = [{ workspace_id: 7, field_key: 'many', name: 'Many', type: 'select', options: Array.from({ length: 80 }, (_, i) => `o${i}`) }, { workspace_id: 7, field_key: 'odd', name: 'Odd', type: 'select', options: 'Kauf' }, { workspace_id: 7, field_key: 'none', name: 'None', type: 'select', options: [{}, [], true] }];
    const fields = (await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 })).data.deal_fields;
    assert.deepEqual([fields[0].options.length, fields[0].options[49], 'options' in fields[1], 'options' in fields[2]], [50, 'o49', false, false]);
  });
  test('the limits handed out are a copy: nothing a caller does to them changes the next answer', async () => {
    const first = (await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 })).data;
    first.limits.workflows_max = 999;
    assert.equal((await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 })).data.limits.workflows_max, 20);
  });
  test('a workspace there is not: said, with where to look — and only the one question was asked', async () => {
    assert.deepEqual(await tools.runRead(pool, 'workspace_setup', { workspace_id: 999 }), { ok: false, error: 'There is no workspace with that id. list_workspaces shows the ones there are.' });
    assert.deepEqual(state.asked.map(q => q.sql), ['SELECT id, name FROM workspaces WHERE id = $1']);
  });
  test('what is no id never reaches the database', async () => {
    for (const workspace_id of ['7', 7.5, 0, -7, null, undefined, [7], { id: 7 }, '7; DROP TABLE deals', 2147483647, NaN, true]) {
      assert.deepEqual(await tools.runRead(pool, 'workspace_setup', { workspace_id }), { ok: false, error: 'workspace_id must be the id of a workspace: a whole number above 0, as list_workspaces gives it.' }, String(workspace_id));
    }
    for (const input of [null, undefined, 'x', 7, [{ workspace_id: 7 }]]) assert.equal((await tools.runRead(pool, 'workspace_setup', input)).ok, false);
    assert.equal(state.asked.length, 0);
    assert.equal((await tools.runRead(pool, 'workspace_setup', { workspace_id: 2147483646 })).ok, false, 'the largest id there can be is asked for, and is not there');
    assert.equal(state.asked.length, 1);
  });
});

describe('read_workflow: one workflow with its boxes, as the Workflows page is given them', () => {
  test('the workflow and each box by its columns — and nothing else a row may carry', async () => {
    const out = await tools.runRead(pool, 'read_workflow', { workspace_id: 7, flow_id: 60 });
    assert.deepEqual(out, { ok: true, data: { id: 60, name: 'Begrüßung', active: true, updated_at: '2026-11-20T10:00:00.000Z', nodes: [
      { id: 600, kind: 'start', title: '', body: '', wait_minutes: 0, config: { trigger: 'lead', webhook_ids: [12], stage_id: null, stop_stage_ids: [31] }, next_id: 601, x: null, y: null, else_id: null },
      { id: 601, kind: 'email', title: 'Danke', body: 'Guten Tag {{first_name|}}', wait_minutes: 0, config: { tz: 'Europe/Berlin' }, next_id: 602, x: 10, y: 20, else_id: null },
      { id: 602, kind: 'branch', title: '', body: '', wait_minutes: 2880, config: { test: 'has_phone' }, next_id: null, x: null, y: null, else_id: 601 }] } });
    assert.deepEqual(state.asked.map(q => q.params), [[7, 60], [7, 60]]);
    // the same columns GET /api/journey reads (routes/journey.js), a box without its workflow's id
    const journey = read('routes/journey.js');
    assert.match(journey, /const FLOW_COLUMNS = 'id, name, active, updated_at';/);
    assert.match(journey, /const NODE_COLUMNS = 'id, flow_id, kind, title, body, wait_minutes, config, next_id, x, y, else_id';/);
    assert.deepEqual(Object.keys(out.data), ['id', 'name', 'active', 'updated_at', 'nodes']);
    assert.deepEqual(Object.keys(out.data.nodes[0]), ['id', 'kind', 'title', 'body', 'wait_minutes', 'config', 'next_id', 'x', 'y', 'else_id']);
  });
  test('a workflow of another workspace is no workflow of this one; nor is one there is not', async () => {
    for (const [workspace_id, flow_id] of [[7, 70], [8, 60], [7, 999], [999, 60]]) {
      assert.deepEqual(await tools.runRead(pool, 'read_workflow', { workspace_id, flow_id }), { ok: false, error: 'There is no such workflow in that workspace. workspace_setup lists the workspace\'s workflows.' }, `${workspace_id}/${flow_id}`);
    }
    assert.ok(state.asked.every(q => /FROM journey_flows/.test(q.sql)), 'no box is read for a workflow that is not there');
    assert.equal((await tools.runRead(pool, 'read_workflow', { workspace_id: 8, flow_id: 70 })).data.nodes.length, 1);
  });
  test('what is no id never reaches the database', async () => {
    for (const flow_id of ['60', 0, -1, 60.5, null, undefined, [60], '60 OR 1=1']) {
      assert.deepEqual(await tools.runRead(pool, 'read_workflow', { workspace_id: 7, flow_id }), { ok: false, error: 'flow_id must be the id of a workflow: a whole number above 0, as workspace_setup lists it.' }, String(flow_id));
    }
    assert.match((await tools.runRead(pool, 'read_workflow', { workspace_id: 'x', flow_id: 60 })).error, /^workspace_id must be/);
    assert.equal(state.asked.length, 0);
  });
});

describe('what is no reading tool, and what the database throws', () => {
  test('a name that is none of the three is an error Claude can read — never a throw, and nothing is asked', async () => {
    for (const name of ['propose_workflow', 'delete_workflow', 'run_sql', '', null, undefined, 5, {}, 'x'.repeat(200)]) {
      const out = await tools.runRead(pool, name, { workspace_id: 7 });
      assert.equal(out.ok, false, String(name));
      assert.match(out.error, /^There is no tool called ".{0,40}" that reads\. The tools are: list_workspaces, workspace_setup, read_workflow\.$/);
    }
    assert.equal(state.asked.length, 0);
  });
  test('the database away is the server\'s to know: thrown on, not turned into an answer', async () => {
    state.broken = true;
    for (const [name, input] of [['list_workspaces', {}], ['workspace_setup', { workspace_id: 7 }], ['read_workflow', { workspace_id: 7, flow_id: 60 }]]) await assert.rejects(tools.runRead(pool, name, input), /the database is away/);
  });
});

describe('what a tool did, in one sentence for the console', () => {
  test('what was looked at, by its name', async () => {
    const list = (await tools.runRead(pool, 'list_workspaces', {})).data, setup = (await tools.runRead(pool, 'workspace_setup', { workspace_id: 7 })).data, flow = (await tools.runRead(pool, 'read_workflow', { workspace_id: 7, flow_id: 60 })).data;
    assert.equal(tools.summary('list_workspaces', {}, list), 'Looked at the list of workspaces (3)');
    assert.equal(tools.summary('workspace_setup', { workspace_id: 7 }, setup), 'Looked at the setup of "Müller Immobilien"');
    assert.equal(tools.summary('read_workflow', { workspace_id: 7, flow_id: 60 }, flow), 'Read the workflow "Begrüßung"');
    assert.equal(tools.summary('propose_workflow', { workspace_id: 7, name: '  Neue   Leads\nbegrüßen ' }, null), 'Proposed the workflow "Neue Leads begrüßen"');
  });
  test('what was looked for and not found, and what is no tool — always a sentence, never a throw', () => {
    assert.equal(tools.summary('list_workspaces', {}, null), 'Looked at the list of workspaces');
    assert.equal(tools.summary('workspace_setup', { workspace_id: 999 }, null), 'Looked for a workspace with the id 999 and found none');
    assert.equal(tools.summary('read_workflow', { workspace_id: 7, flow_id: 999 }, undefined), 'Looked for a workflow with the id 999 and found none');
    assert.equal(tools.summary('delete_everything', {}, null), 'Asked for "delete_everything", which there is not');
    for (const [name, input, data] of [[null, null, null], ['workspace_setup', null, {}], ['read_workflow', 'x', { name: 5 }], ['workspace_setup', { workspace_id: {} }, { workspace: null }], [undefined, undefined, undefined]]) assert.equal(typeof tools.summary(name, input, data), 'string');
  });
  test('a name is said as text of at most eighty characters on one line: it is other people\'s text', () => {
    const s = tools.summary('workspace_setup', { workspace_id: 8 }, { workspace: { name: `acme <b>\n\n${'x'.repeat(200)}` } });
    assert.match(s, /^Looked at the setup of "acme <b> x{71}"$/);
    assert.equal(tools.summary('read_workflow', {}, { name: 'a'.repeat(300) }).length, 'Read the workflow ""'.length + 80);
  });
});
