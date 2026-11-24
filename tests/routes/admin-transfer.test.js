// ROUTE tests for GET /api/admin/workspaces/:id/export — the whole-workspace
// bundle the local CRM imports (routes/admin-transfer.js, utils/workspace-export.js).
//
// The fake pool answers every table with one marked row and records each
// statement, so the tests can pin what the export READS (every table it should,
// none it must not — the integration secrets above all), that it only reads, and
// that it reads inside one read-only snapshot. The bundle itself is unpacked with
// the same utils/tar.js reader the local CRM will use.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { loadRoute, serve } = require('../helpers/load-route');
const { readTar, collect } = require('../../utils/tar');
const { TABLES, LEFT_OUT, VERSION } = require('../../utils/workspace-export');
const { read } = require('../helpers/client-fn');

const WS_ID = 7;

// One row per table, marked with the table's name, as to_jsonb would hand it back.
// `failOn` makes the matching statement throw, to test the error path.
function makePool({ failOn = null } = {}) {
  const log = [];
  let released = 0;
  async function query(sql, params) {
    log.push({ sql, params });
    if (failOn && failOn.test(sql)) throw Object.assign(new Error('boom'), { code: '42P01' });
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
    if (/FROM workspaces t WHERE t\.id = \$1/.test(sql)) {
      return { rows: params[0] === WS_ID ? [{ r: { id: WS_ID, name: 'Müller & Söhne', whatsapp_template: 'Hallo {{name}}' } }] : [] };
    }
    if (/FROM users t/.test(sql)) {
      return { rows: [{ r: { id: 11, workspace_id: WS_ID, email: 'maria@acme.io', role: 'owner', password_hash: '$2b$10$abc' } }] };
    }
    if (/FROM tasks t/.test(sql)) {
      return { rows: [{ r: { id: 30, workspace_id: WS_ID, due_date: '2026-11-05', due_time: '14:30:00' } }] };
    }
    const table = /FROM (\w+) t/.exec(sql)[1];
    return { rows: [{ r: { table, workspace_id: WS_ID } }] };
  }
  const client = { query, release: () => { released++; } };
  return { log, connect: async () => client, query, get released() { return released; } };
}

function server(pool, { isAdmin = true } = {}) {
  const session = (req, _res, next) => { req.session = { isAdmin }; next(); };
  return serve({ '/': session, '/api/admin': loadRoute('admin-transfer.js', { pool }) });
}

// The response as raw bytes (the test helper's request() parses JSON only).
async function download(s, id, headers = {}) {
  const res = await fetch(`${s.base}/api/admin/workspaces/${id}/export`, { headers });
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

async function unpack(gz) {
  const entries = [];
  for await (const e of readTar([zlib.gunzipSync(gz)])) entries.push({ name: e.name, data: await collect(e.body) });
  return entries;
}

describe('the gate', () => {
  test('no admin session and no secret → 401, nothing read', async () => {
    const pool = makePool();
    const s = await server(pool, { isAdmin: false });
    try {
      const { res } = await download(s, WS_ID);
      assert.equal(res.status, 401);
      assert.equal(pool.log.length, 0);
    } finally { await s.close(); }
  });

  test('X-Admin-Secret works without a session, as for every admin route', async () => {
    const saved = process.env.ADMIN_SECRET; process.env.ADMIN_SECRET = 'top-secret';
    const s = await server(makePool(), { isAdmin: false });
    try {
      assert.equal((await download(s, WS_ID, { 'x-admin-secret': 'top-secret' })).res.status, 200);
      assert.equal((await download(s, WS_ID, { 'x-admin-secret': 'wrong' })).res.status, 401);
    } finally { await s.close(); if (saved === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = saved; }
  });
});

describe('bad and unknown ids', () => {
  for (const bad of ['abc', '0', '-3', '1.5']) {
    test(`id "${bad}" → 400 before any query`, async () => {
      const pool = makePool();
      const s = await server(pool);
      try {
        const { res, bytes } = await download(s, bad);
        assert.equal(res.status, 400);
        assert.match(JSON.parse(bytes).error, /positive integer/);
        assert.equal(pool.log.length, 0);
      } finally { await s.close(); }
    });
  }

  test('a workspace that does not exist → 404, the snapshot is rolled back and nothing else read', async () => {
    const pool = makePool();
    const s = await server(pool);
    try {
      const { res, bytes } = await download(s, 999);
      assert.equal(res.status, 404);
      assert.equal(JSON.parse(bytes).error, 'Workspace not found.');
      assert.deepEqual(pool.log.map(e => e.sql.split(/\s/)[0]), ['BEGIN', 'SELECT', 'ROLLBACK']);
      assert.equal(pool.released, 1);
    } finally { await s.close(); }
  });
});

describe('the bundle', () => {
  test('a .tar.gz download that no cache may keep, named after the workspace', async () => {
    const s = await server(makePool());
    try {
      const { res } = await download(s, WS_ID);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/gzip');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.match(res.headers.get('content-disposition'),
        /^attachment; filename="upgrads-muller-sohne-7-\d{4}-\d{2}-\d{2}\.tar\.gz"$/);
    } finally { await s.close(); }
  });

  test('holds exactly workspace.json, with every table in import order and its counts', async () => {
    const s = await server(makePool());
    try {
      const entries = await unpack((await download(s, WS_ID)).bytes);
      assert.deepEqual(entries.map(e => e.name), ['workspace.json']);
      const b = JSON.parse(entries[0].data);
      assert.equal(b.format, 'upgrads-workspace');
      assert.equal(b.version, 2);
      assert.equal(VERSION, 2, 'version 2: version 1 plus the note templates, the workflows and fonio\'s calls');
      assert.equal(b.workspace_id, WS_ID);
      assert.equal(b.workspace_name, 'Müller & Söhne');
      assert.ok(!Number.isNaN(Date.parse(b.exported_at)));
      assert.deepEqual(Object.keys(b.tables), TABLES.map(([name]) => name));
      for (const [name, rows] of Object.entries(b.tables)) assert.equal(b.counts[name], rows.length, name);
      assert.equal(b.tables.workspaces[0].whatsapp_template, 'Hallo {{name}}', 'settings travel with the workspace row');
    } finally { await s.close(); }
  });

  test('members keep their password hash and role; dates stay plain strings', async () => {
    const s = await server(makePool());
    try {
      const b = JSON.parse((await unpack((await download(s, WS_ID)).bytes))[0].data);
      assert.deepEqual(b.tables.users[0], { id: 11, workspace_id: WS_ID, email: 'maria@acme.io', role: 'owner', password_hash: '$2b$10$abc' });
      assert.equal(b.tables.tasks[0].due_date, '2026-11-05');
      assert.equal(b.tables.tasks[0].due_time, '14:30:00');
    } finally { await s.close(); }
  });
});

describe('what it reads, and how', () => {
  async function exportLog() {
    const pool = makePool();
    const s = await server(pool);
    try { assert.equal((await download(s, WS_ID)).res.status, 200); } finally { await s.close(); }
    return pool;
  }

  test('one read-only snapshot: BEGIN REPEATABLE READ READ ONLY … COMMIT, client released', async () => {
    const pool = await exportLog();
    assert.equal(pool.log[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(pool.log.at(-1).sql, 'COMMIT');
    assert.equal(pool.released, 1);
  });

  test('every read is a SELECT bound to this workspace id; nothing is written', async () => {
    const pool = await exportLog();
    const reads = pool.log.slice(1, -1);
    assert.equal(reads.length, TABLES.length);
    for (const { sql, params } of reads) {
      assert.match(sql, /^SELECT to_jsonb\(t\) AS r FROM /);
      assert.deepEqual(params, [WS_ID]);
      assert.match(sql, /\$1/);
    }
    assert.ok(!pool.log.some(e => /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(e.sql)));
  });

  test('integration secrets, logs, chat and access tables are never read', async () => {
    const pool = await exportLog();
    const sql = pool.log.map(e => e.sql).join('\n');
    for (const t of ['workspace_webhook', 'workspace_calcom', 'workspace_engine', 'api_keys', 'webhook_logs',
                     'engine_deliveries', 'engine_api_requests', 'idempotency_keys', 'notetaker_recordings',
                     'workspace_notetaker_ai', 'notifications', 'chat_messages', 'chat_reads', 'break_scores',
                     'invite_codes', 'password_resets', 'stages']) {
      assert.doesNotMatch(sql, new RegExp(`(FROM|JOIN)\\s+${t}\\b`), `${t} must not be exported`);
    }
  });

  // Part 2 (2026-11-20): what was added to the CRM after the export was written — the workflows above all.
  test('the workflows travel whole: the workflows, their boxes, the deals in them and their record — with the note templates and fonio\'s calls', async () => {
    const pool = await exportLog();
    const read = pool.log.slice(1, -1).map(e => /FROM (\w+) t/.exec(e.sql)[1]);
    for (const t of ['note_templates', 'journey_flows', 'journey_nodes', 'journey_runs', 'journey_log', 'fonio_calls', 'fonio_other_calls']) {
      assert.equal(read.filter(x => x === t).length, 1, `${t} is read once`);
      assert.match(pool.log.find(e => new RegExp(`FROM ${t} t`).test(e.sql)).sql, new RegExp(`^SELECT to_jsonb\\(t\\) AS r FROM ${t} t WHERE t\\.workspace_id = \\$1 ORDER BY t\\.id$`), `${t}: every row of this workspace, whole`);
    }
    // in an order an importer can insert them in: what a row points to stands above it
    const at = t => read.indexOf(t);
    for (const [above, below] of [['users', 'note_templates'], ['journey_flows', 'journey_nodes'], ['journey_nodes', 'journey_runs'], ['deals', 'journey_runs'], ['journey_runs', 'journey_log'], ['users', 'journey_log'],
      ['activities', 'fonio_calls'], ['deals', 'fonio_calls'], ['contacts', 'fonio_other_calls'], ['activities', 'fonio_other_calls']]) {
      assert.ok(at(above) >= 0 && at(above) < at(below), `${above} before ${below}`);
    }
    assert.deepEqual(read.slice(0, 22), ['workspaces', 'users', 'user_workspaces', 'custom_fields', 'deal_fields', 'task_fields', 'object_fields', 'pipelines', 'pipeline_stages', 'contacts', 'deals', 'objects', 'object_contacts',
      'deal_objects', 'activities', 'activity_comments', 'task_projects', 'task_project_statuses', 'task_lists', 'tasks', 'task_attachments', 'contact_documents'], 'what version 1 held, in its order: a version 1 bundle is a version 2 bundle without the rest');
  });

  test('the connections of the newer integrations stay here too, and so does what a workflow rebuilds by itself', async () => {
    const pool = await exportLog();
    const sql = pool.log.map(e => e.sql).join('\n');
    for (const t of ['workspace_fonio', 'workspace_calendly', 'workspace_mail', 'email_accounts', 'journey_watch', 'master_access_log', 'platform_invites', 'platform_settings']) {
      assert.doesNotMatch(sql, new RegExp(`(FROM|JOIN)\\s+${t}\\b`), `${t} must not be exported`);
    }
  });

  // The export fell behind once: the workflows were built and nobody thought of it. This test is what tells next time.
  test('every table the schema creates is either in the bundle or named as left out, with why — none is in neither, none in both', () => {
    const schema = [...new Set([...read('db.js').matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+) \(/g)].map(m => m[1]))];
    const inBundle = TABLES.map(([name]) => name), leftOut = Object.keys(LEFT_OUT);
    assert.ok(schema.length >= 54, `the schema's tables (${schema.length})`);
    assert.deepEqual(schema.filter(t => !inBundle.includes(t) && !leftOut.includes(t)), [], 'a table in neither list: decide whether a copy of a workspace needs it, and put it in TABLES or in LEFT_OUT');
    assert.deepEqual(inBundle.filter(t => leftOut.includes(t)), [], 'a table cannot be both');
    assert.deepEqual([...inBundle, ...leftOut].filter(t => !schema.includes(t)), [], 'a name that is no table of the schema');
    assert.equal(new Set(inBundle).size, inBundle.length, 'no table is read twice');
    assert.deepEqual([...new Set(Object.values(LEFT_OUT))].sort(), ['access', 'chatter', 'dead', 'history', 'platform', 'rebuilt', 'secret'], 'each with one of the reasons the header explains');
    // whatever holds a key, a token or a sign-in of this install stays here: no table of the bundle has such a column,
    // whether the table was created with it or got it later (users.password_hash is the one thing meant to travel)
    const db = read('db.js');
    const columns = t => {
      const at = db.indexOf(`CREATE TABLE IF NOT EXISTS ${t} (`), made = db.slice(at, db.indexOf(')\n', at)).split('\n').slice(1).map(l => l.trim().split(/\s+/)[0]);
      const added = [...db.matchAll(new RegExp(`ALTER TABLE ${t}\\s+ADD COLUMN IF NOT EXISTS ([a-z_0-9]+)`, 'g'))].map(m => m[1]);
      return [...made, ...added];
    };
    const secretish = c => /sealed|token|secret|api_key|webhook_key|key_hash/.test(c);
    assert.ok(columns('deals').includes('origin') && columns('contacts').includes('journey_opt_out'), 'columns added later are seen');
    for (const t of inBundle) assert.deepEqual(columns(t).filter(secretish), [], `${t} is in the bundle and must hold no key, token or secret`);
    const holders = schema.filter(t => columns(t).some(secretish));
    assert.ok(holders.length >= 10 && ['workspace_fonio', 'workspace_mail', 'workspace_calendly', 'workspace_webhook'].every(t => holders.includes(t)), 'the check finds the tables that do hold them');
    for (const t of holders) assert.ok(['secret', 'access', 'history'].includes(LEFT_OUT[t]), `${t} holds a key or token and is left out`);
    for (const t of Object.keys(LEFT_OUT).filter(k => LEFT_OUT[k] === 'secret')) assert.ok(!inBundle.includes(t));
  });
  // CUSTOMER_JOURNEY_CHANGES Part 17: the emails counted against the sending address's limits are seven days of THIS
  // install's own sending — history, not something a copy of a workspace needs, and nothing that builds itself again.
  test('the counted emails of the sending address stay behind, as history; the reason an email waits travels with its row', () => {
    assert.equal(LEFT_OUT.journey_sends, 'history');
    assert.ok(!TABLES.some(([name]) => name === 'journey_sends'));
    assert.ok(TABLES.some(([name]) => name === 'journey_runs') && /ALTER TABLE journey_runs ADD COLUMN IF NOT EXISTS held TEXT/.test(read('db.js')), 'journey_runs.held is a plain word (limit_day, paused …): no key, no address');
  });
});

describe('a failing read', () => {
  test('→ 500 JSON (not half a file), rolled back, client released', async () => {
    const pool = makePool({ failOn: /FROM deals t/ });
    const s = await server(pool);
    try {
      const { res, bytes } = await download(s, WS_ID);
      assert.equal(res.status, 500);
      assert.match(res.headers.get('content-type'), /json/);
      assert.equal(JSON.parse(bytes).detail, 'boom');
      assert.equal(pool.log.at(-1).sql, 'ROLLBACK');
      assert.equal(pool.released, 1);
    } finally { await s.close(); }
  });
});

// ═══ THE WAY BACK (WORKSPACE_IMPORT_CHANGES Parts 1–2, 2026-11-24): the DATA of an export into a workspace that is here ═══
// POST /workspaces/:id/import/check (writes nothing), POST /workspaces/:id/import (adds, in one transaction),
// GET /workspaces/imports (the record). The real route and the real utils/workspace-import.js run on a throwaway
// server built for this address the way server.js builds it — the file's bytes kept by express.raw — over a stand-in
// database that knows the statements of the check and of the import and keeps what is inserted. An import only adds:
// the stand-in refuses every UPDATE and DELETE there could be.
const express = require('express');
const { tarStream } = require('../../utils/tar');
const exporter = require('../../utils/workspace-export');
const importer = require('../../utils/workspace-import');

const RAW_MOUNT = "app.use(/^\\/api\\/admin\\/workspaces\\/\\d+\\/import(?=\\/|$)/, express.raw({ type: '*/*', limit: '100mb' }));";
const RAW_PATH = /^\/api\/admin\/workspaces\/\d+\/import(?=\/|$)/;   // as server.js has it: the slash after "import" stays in the path
const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
const icol = (nullable, has_default = false, json = false) => ({ nullable, has_default, json });
const I_SCHEMA = {
  pipelines: { columns: { id: icol(false, true), workspace_id: icol(false), name: icol(false) }, refs: { workspace_id: 'workspaces' } },
  contacts: { columns: { id: icol(false, true), workspace_id: icol(false), name: icol(false), email: icol(true), assigned_to: icol(true), custom_data: icol(false, true, true) }, refs: { workspace_id: 'workspaces', assigned_to: 'users' } },
  deals: { columns: { id: icol(false, true), workspace_id: icol(false), contact_id: icol(true), pipeline_id: icol(false), title: icol(false) }, refs: { workspace_id: 'workspaces', contact_id: 'contacts', pipeline_id: 'pipelines' } },
  activities: { columns: { id: icol(false, true), workspace_id: icol(false), contact_id: icol(true), deal_id: icol(true), type: icol(false), content: icol(false), created_by: icol(true) }, refs: { workspace_id: 'workspaces', contact_id: 'contacts', deal_id: 'deals', created_by: 'users' } },
};
// The database: workspaces 7 ("Ziel") and 8 ("Läuft", with a workflow switched on); in 7 a contact with ada@example.de.
function importDb({ imports = [], importedBefore = false, failOn = null } = {}) {
  const log = [], inserted = [], state = { connects: 0, released: 0, nextId: 5000 };
  const answer = async (sql, params) => {
    const t = flat(sql);
    log.push({ sql: t, params });
    if (failOn && failOn.test(t)) throw new Error('boom');
    if (/^(UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/.test(t)) throw new Error(`an import only adds: ${t}`);
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] };
    if (t === 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE') return { rows: [7, 8].includes(params[0]) ? [{ id: params[0] }] : [] };
    if (t === 'SELECT id, name FROM workspaces WHERE id = $1') return { rows: params[0] === 7 ? [{ id: 7, name: 'Ziel' }] : params[0] === 8 ? [{ id: 8, name: 'Läuft' }] : [] };
    if (/^SELECT DISTINCT ON \(lower\(btrim\(email\)\)\) id, name, lower\(btrim\(email\)\) AS email FROM contacts WHERE workspace_id = \$1/.test(t)) return { rows: params[0] === 7 && params[1].includes('ada@example.de') ? [{ id: 900, name: 'Ada here', email: 'ada@example.de' }] : [] };
    if (/^SELECT field_key, type FROM (custom|deal)_fields WHERE workspace_id = \$1$/.test(t)) return { rows: [] };
    if (t === 'SELECT name FROM pipelines WHERE workspace_id = $1') return { rows: params[0] === 7 ? [{ name: 'Vertrieb' }] : [] };
    if (t === 'SELECT name FROM journey_flows WHERE workspace_id = $1 AND active = true ORDER BY id') return { rows: params[0] === 8 ? [{ name: 'Neue Leads' }] : [] };
    if (/^SELECT created_at FROM workspace_imports WHERE workspace_id = \$1 AND source_name = \$2 AND exported_at = \$3 ORDER BY id LIMIT 1$/.test(t)) return { rows: importedBefore ? [{ created_at: '2026-02-02T08:00:00.000Z' }] : [] };
    if (/FROM information_schema\.columns/.test(t)) return { rows: Object.entries(I_SCHEMA).flatMap(([table_name, s]) => Object.entries(s.columns).map(([column_name, c]) => ({ table_name, column_name, ...c }))) };
    if (/FROM pg_constraint/.test(t)) return { rows: Object.entries(I_SCHEMA).flatMap(([table_name, s]) => Object.entries(s.refs).map(([column_name, ref]) => ({ table_name, column_name, ref }))) };
    const data = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\) RETURNING id$/.exec(t);
    if (data && importer.DATA.includes(data[1])) { const id = state.nextId++; inserted.push({ table: data[1], id, row: Object.fromEntries(data[2].split(', ').map((c, i) => [c.replace(/"/g, ''), params[i]])) }); return { rows: [{ id }] }; }
    if (/^INSERT INTO workspace_imports \(workspace_id, workspace_name, file_name, source_name, exported_at, counts\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6::jsonb\) RETURNING id$/.test(t)) { inserted.push({ table: 'workspace_imports', id: 31, params }); return { rows: [{ id: 31 }] }; }
    if (t === 'SELECT id, workspace_id, workspace_name, file_name, source_name, exported_at, counts, created_at FROM workspace_imports ORDER BY id DESC LIMIT 50') return { rows: imports };
    throw new Error(`a statement nobody expected: ${t}`);
  };
  const client = { query: answer, release: () => { state.released++; } };
  return { log, inserted, state, query: answer, connect: async () => { state.connects++; return client; } };
}
// The app as server.js builds it for this address: the file's bytes first, then json for the rest.
async function importServer(pool, { isAdmin = true, raw = true } = {}) {
  const app = express();
  if (raw) app.use(RAW_PATH, express.raw({ type: '*/*', limit: '100mb' }));
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { isAdmin }; next(); });
  app.use('/api/admin', loadRoute('admin-transfer.js', { pool }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  const srv = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/admin`;
  const send = async (method, p, bytes, headers = {}) => { const res = await fetch(base + p, { method, headers: { ...(bytes ? { 'Content-Type': 'application/gzip' } : {}), ...headers }, body: bytes || undefined }); let body = null; try { body = await res.json(); } catch { /* none */ } return { status: res.status, body, cache: res.headers.get('cache-control') }; };
  return { send, check: (id, bytes, headers) => send('POST', `/workspaces/${id}/import/check`, bytes, headers), run: (id, bytes, headers) => send('POST', `/workspaces/${id}/import`, bytes, headers),
    close: () => new Promise(resolve => { srv.closeAllConnections?.(); srv.close(resolve); }) };
}
const I_BUNDLE = (tables = {}, more = {}) => ({ format: exporter.FORMAT, version: exporter.VERSION, exported_at: '2026-11-24T10:00:00.000Z', workspace_id: 5, workspace_name: 'Müller & Söhne', counts: {}, tables: { workspaces: [{ id: 5, name: 'Müller & Söhne' }], ...tables }, ...more });
async function gz(bundle) { const chunks = []; for await (const c of tarStream(exporter.bundleEntries(bundle))) chunks.push(c); return zlib.gzipSync(Buffer.concat(chunks)); }
const I_DATA = () => ({ pipelines: [{ id: 40, workspace_id: 5, name: 'Vertrieb' }],
  contacts: [{ id: 1, workspace_id: 5, name: 'Bo', email: 'bo@example.de', assigned_to: 11, custom_data: { a: 1 } }, { id: 2, workspace_id: 5, name: 'Ada', email: 'ADA@example.de', assigned_to: null, custom_data: {} }],
  deals: [{ id: 3, workspace_id: 5, contact_id: 2, pipeline_id: 40, title: 'Haus' }, { id: 4, workspace_id: 5, contact_id: 1, pipeline_id: 99, title: 'Ohne Pipeline' }],
  activities: [{ id: 7, workspace_id: 5, contact_id: 2, deal_id: 3, type: 'note', content: 'Notiz', created_by: 12 }],
  users: [{ id: 11, email: 'owner@example.de', password_hash: 'HASH-OF-A-PASSWORD' }], tasks: [{ id: 1 }, { id: 2 }] });

describe('the import\'s gate, and the file it needs', () => {
  test('without the console\'s session: 401 on all three addresses, and the database is asked nothing', async () => {
    const pool = importDb(), s = await importServer(pool, { isAdmin: false });
    try {
      const bytes = await gz(I_BUNDLE(I_DATA()));
      assert.deepEqual([(await s.check(7, bytes)).status, (await s.run(7, bytes)).status, (await s.send('GET', '/workspaces/imports')).status], [401, 401, 401]);
      assert.deepEqual([pool.log.length, pool.state.connects], [0, 0]);
    } finally { await s.close(); }
  });
  test('the workspace is named by a number in the address — anything else is refused before the file is opened', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const bytes = await gz(I_BUNDLE());
      for (const id of ['0', '-1', 'abc', '1.5', '7x', '12345678901', '7%20OR%201=1', '07']) {
        for (const r of [await s.check(id, bytes), await s.run(id, bytes)]) assert.deepEqual([r.status, r.body], [400, { error: 'Workspace id must be a positive integer.', code: 'id' }], id);
      }
      assert.equal(pool.log.length, 0);
    } finally { await s.close(); }
  });
  test('no file, and each kind of file that is no export: said with its code, nothing asked of the database', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const raw = async (name, text) => { const chunks = []; const body = Buffer.from(text); for await (const c of tarStream([{ name, size: body.length, body, mtime: 0 }])) chunks.push(c); return zlib.gzipSync(Buffer.concat(chunks)); };
      for (const [bytes, code, words] of [[null, 'file', 'Choose the export file (.tar.gz).'], [Buffer.from('plain text'), 'not_gzip', 'The file is not a .tar.gz as the export makes it.'],
        [await raw('other.json', '{}'), 'not_bundle', 'There is no workspace.json in the file.'], [await raw('workspace.json', '{"format":"x"}'), 'format', 'The file is not a workspace export of this CRM.'],
        [await gz(I_BUNDLE({}, { version: 99 })), 'version', `The export is of version 99; this install reads up to version ${VERSION}.`], [await gz({ ...I_BUNDLE(), tables: { workspaces: [] } }), 'shape', 'The export does not hold exactly one workspace.']]) {
        for (const r of [await s.check(7, bytes), await s.run(7, bytes)]) assert.deepEqual([r.status, r.body], [400, { error: words, code }], code);
      }
      assert.deepEqual([pool.log.length, pool.state.connects], [0, 0]);
    } finally { await s.close(); }
  });
  test('the file arrives as its bytes: that is why server.js keeps them on exactly these addresses, before json()', async () => {
    const s = read('server.js');
    assert.ok(s.includes(RAW_MOUNT), 'the mount as it is written');
    assert.ok(s.indexOf(RAW_MOUNT) > 0 && s.indexOf(RAW_MOUNT) < s.indexOf('app.use(express.json());'), 'the bytes are kept before json() could read the body away');
    for (const p of ['/api/admin/workspaces/7/import', '/api/admin/workspaces/7/import/check', '/api/admin/workspaces/1234567/import/']) assert.equal(RAW_PATH.test(p), true, p);
    for (const p of ['/api/admin/workspaces/7/export', '/api/admin/workspaces/import', '/api/admin/workspaces/7/imports', '/api/admin/workspaces/abc/import', '/api/admin/workspaces/imports', '/api/contacts/import', '/x/api/admin/workspaces/7/import']) assert.equal(RAW_PATH.test(p), false, p);
    const pool = importDb(), plain = await importServer(pool, { raw: false });
    try {
      const r = await plain.check(7, await gz(I_BUNDLE()));
      assert.deepEqual([r.status, r.body.code, pool.log.length], [400, 'file', 0], 'without that mount there are no bytes, and nothing happens');
    } finally { await plain.close(); }
    // the mount as server.js writes it, run: both addresses get the bytes. (A pattern that swallows the slash after
    // "import" matches …/import/check and is still not run for it by Express — the bytes would be gone, the check dead.)
    const line = s.split('\n').find(l => l.startsWith('app.use(/^\\/api\\/admin\\/workspaces'));
    const pattern = new RegExp(/^app\.use\(\/(.*)\/, express\.raw\(/.exec(line)[1]);
    assert.equal(String(pattern), String(RAW_PATH));
    const app = express();
    app.use(pattern, express.raw({ type: '*/*', limit: '100mb' }));
    app.use(express.json());
    app.post('/api/admin/workspaces/:id/import/check', (req, res) => res.json({ bytes: Buffer.isBuffer(req.body) ? req.body.length : null }));
    app.post('/api/admin/workspaces/:id/import', (req, res) => res.json({ bytes: Buffer.isBuffer(req.body) ? req.body.length : null }));
    app.post(['/api/admin/workspaces/:id/imports', '/api/admin/workspaces/imports', '/api/admin/workspaces/:id/export'], (req, res) => res.json({ bytes: Buffer.isBuffer(req.body) ? req.body.length : null, json: req.body }));
    const srv = await new Promise(resolve => { const x = app.listen(0, '127.0.0.1', () => resolve(x)); });
    try {
      for (const p of ['/api/admin/workspaces/5/import/check', '/api/admin/workspaces/5/import', '/api/admin/workspaces/1234567/import/check']) {
        const res = await fetch(`http://127.0.0.1:${srv.address().port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: Buffer.from('ten bytes!') });
        assert.deepEqual(await res.json(), { bytes: 10 }, p);
      }
      // every other address is not its business: a JSON body there is read as JSON, as everywhere else
      for (const p of ['/api/admin/workspaces/5/imports', '/api/admin/workspaces/imports', '/api/admin/workspaces/5/export']) {
        const res = await fetch(`http://127.0.0.1:${srv.address().port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
        assert.deepEqual(await res.json(), { bytes: null, json: { a: 1 } }, p);
      }
    } finally { srv.closeAllConnections?.(); await new Promise(resolve => srv.close(resolve)); }
  });
});

describe('POST /workspaces/:id/import/check: what an import would add — and nothing is written', () => {
  test('the answer: the file, the workspace it would go into, each kind counted, what is in the way', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const r = await s.check(7, await gz(I_BUNDLE(I_DATA())));
      assert.equal(r.status, 200);
      assert.deepEqual(Object.keys(r.body).sort(), ['blockers', 'can_import', 'file', 'into', 'not_included', 'pipelines', 'tables', 'unassigned', 'warnings']);
      assert.deepEqual([r.body.file, r.body.into, r.body.can_import, r.body.blockers, r.body.unassigned], [{ name: 'Müller & Söhne', exported_at: '2026-11-24T10:00:00.000Z', version: VERSION }, { id: 7, name: 'Ziel' }, true, [], 2]);
      assert.deepEqual(r.body.tables.filter(t => t.rows), [{ name: 'pipelines', rows: 1, adds: 1, here: 0, left_out: 0 }, { name: 'contacts', rows: 2, adds: 1, here: 1, left_out: 0 },
        { name: 'deals', rows: 2, adds: 1, here: 0, left_out: 1 }, { name: 'activities', rows: 1, adds: 1, here: 0, left_out: 0 }]);
      assert.deepEqual([r.body.pipelines, r.body.not_included], [[{ name: 'Vertrieb', as: 'Vertrieb (imported)' }], [{ name: 'users', rows: 1 }, { name: 'tasks', rows: 2 }]]);
      assert.equal(r.cache, 'no-store');
      assert.doesNotMatch(JSON.stringify(r.body), /HASH-OF-A-PASSWORD|bo@example\.de|Notiz|Haus/, 'no row of the file is in the answer');
    } finally { await s.close(); }
  });
  test('only SELECTs are asked, on the pool: no transaction is opened, no connection taken, nothing inserted', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      await s.check(7, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([pool.log.length, pool.state.connects, pool.inserted.length], [9, 0, 0]);
      for (const l of pool.log) assert.match(l.sql, /^SELECT /, l.sql);
      for (const l of pool.log.slice(0, 7)) assert.equal(l.params[0], 7, 'what is asked about a workspace is asked about the one in the address');
    } finally { await s.close(); }
  });
  test('something in the way: can_import false, with the reason — the counts are said all the same', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const r = await s.check(8, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([r.status, r.body.can_import, r.body.into, r.body.blockers.length], [200, false, { id: 8, name: 'Läuft' }, 1]);
      assert.match(r.body.blockers[0], /^1 workflow is switched on in this workspace \("Neue Leads"\)/);
      assert.equal(r.body.tables.find(t => t.name === 'contacts').adds, 2, 'in workspace 8 nobody has ada\'s address');
    } finally { await s.close(); }
    const again = importDb({ importedBefore: true }), s2 = await importServer(again);
    try {
      const r = await s2.check(7, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([r.body.can_import, r.body.blockers], [false, ['This file was imported into this workspace before (2026-02-02). A second time, every deal and note in it would be there twice.']]);
    } finally { await s2.close(); }
  });
  test('a workspace that is not there: 404; the database away: 500, nothing half said', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const r = await s.check(404, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([r.status, r.body, pool.log.length], [404, { error: 'Workspace not found.', code: 'workspace' }, 1]);
    } finally { await s.close(); }
    const down = importDb({ failOn: /FROM pipelines/ }), s2 = await importServer(down);
    try { assert.deepEqual([(await s2.check(7, await gz(I_BUNDLE(I_DATA())))).status, down.inserted.length], [500, 0]); } finally { await s2.close(); }
  });
});

describe('POST /workspaces/:id/import: the file\'s data is added — in one transaction, by INSERT only', () => {
  test('what was added is said as the check said it; the rows are in the workspace of the address, with ids of this database\'s own', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const bytes = await gz(I_BUNDLE(I_DATA()));
      const checked = (await s.check(7, bytes)).body;
      const r = await s.run(7, bytes, { 'X-File-Name': 'upgrads-muller-5-2026-11-24.tar.gz' });
      assert.equal(r.status, 200);
      assert.deepEqual(Object.keys(r.body).sort(), ['file', 'imported']);
      assert.deepEqual(Object.keys(r.body.imported).sort(), ['blockers', 'id', 'into', 'not_included', 'pipelines', 'tables', 'unassigned', 'warnings']);
      assert.deepEqual([r.body.file, r.body.imported.id, r.body.imported.into, r.body.imported.blockers], [checked.file, 31, { id: 7, name: 'Ziel' }, []]);
      for (const k of ['tables', 'unassigned', 'pipelines', 'not_included', 'warnings']) assert.deepEqual(r.body.imported[k], checked[k], `${k}: what the check said is what the import did`);
      assert.equal(r.cache, 'no-store');
      const rows = pool.inserted.filter(i => i.table !== 'workspace_imports');
      assert.deepEqual(rows.map(i => i.table), ['pipelines', 'contacts', 'deals', 'activities']);
      const [pipeline, bo, haus, notiz] = rows;
      assert.deepEqual([pipeline.row, bo.row, haus.row, notiz.row], [{ workspace_id: 7, name: 'Vertrieb (imported)' }, { workspace_id: 7, name: 'Bo', email: 'bo@example.de', assigned_to: null, custom_data: '{"a":1}' },
        { workspace_id: 7, contact_id: 900, pipeline_id: pipeline.id, title: 'Haus' }, { workspace_id: 7, contact_id: 900, deal_id: haus.id, type: 'note', content: 'Notiz', created_by: null }]);
      assert.doesNotMatch(JSON.stringify(r.body), /HASH-OF-A-PASSWORD|bo@example\.de|Notiz|Haus/, 'no row of the file is in the answer');
      assert.equal(pool.log.some(l => /users|password/i.test(l.sql)), false, 'no account is read or made');
    } finally { await s.close(); }
  });
  test('one connection, one transaction: begun, committed, given back — and the pool itself is asked nothing', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      await s.run(7, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([pool.state.connects, pool.state.released, pool.log[0].sql, pool.log[1].sql, pool.log.at(-2).sql.slice(0, 29), pool.log.at(-1).sql], [1, 1, 'BEGIN', 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE', 'INSERT INTO workspace_imports', 'COMMIT']);
      assert.equal(pool.log.filter(l => /^(UPDATE|DELETE)/.test(l.sql)).length, 0);
    } finally { await s.close(); }
  });
  test('the file\'s name for the record comes in a header: only plain characters of it are kept, two hundred at most; without it the record has none', async () => {
    for (const [given, kept] of [['upgrads-müller (1).tar.gz', 'upgrads-mller (1).tar.gz'], ['<script>alert(1)</script>.gz', 'scriptalert(1)script.gz'], ['a/../b\\c"d\'e;f', 'a..bcdef'], ['x'.repeat(300), 'x'.repeat(200)], [undefined, '']]) {
      const pool = importDb(), s = await importServer(pool);
      try {
        const r = await s.run(7, await gz(I_BUNDLE(I_DATA())), given === undefined ? {} : { 'X-File-Name': encodeURI(given) === given ? given : Buffer.from(given, 'utf8').toString('latin1') });
        assert.equal(r.status, 200, String(given));
        const name = pool.inserted.at(-1).params[2];
        assert.match(name, /^[\w.() -]{0,200}$/);
        if (given === undefined || /^[\x20-\x7e]*$/.test(given)) assert.equal(name, kept, String(given));
        assert.deepEqual(pool.inserted.at(-1).params.slice(0, 2).concat(pool.inserted.at(-1).params.slice(3, 5)), [7, 'Ziel', 'Müller & Söhne', '2026-11-24T10:00:00.000Z']);
      } finally { await s.close(); }
    }
  });
  test('something in the way: 409 with the reasons, "Nothing was written" — and nothing was: rolled back, no INSERT', async () => {
    for (const [id, db, words] of [[8, importDb(), /^1 workflow is switched on/], [7, importDb({ importedBefore: true }), /^This file was imported into this workspace before/]]) {
      const s = await importServer(db);
      try {
        const r = await s.run(id, await gz(I_BUNDLE(I_DATA())));
        assert.deepEqual([r.status, r.body.error, r.body.code, r.body.blockers.length], [409, 'This file cannot be imported into this workspace as things are. Nothing was written.', 'blocked', 1]);
        assert.match(r.body.blockers[0], words);
        assert.deepEqual([db.inserted.length, db.log.at(-1).sql, db.log.some(l => l.sql === 'COMMIT'), db.state.released], [0, 'ROLLBACK', false, 1]);
      } finally { await s.close(); }
    }
  });
  test('a workspace that is not there: 404, rolled back; a row the database refuses: 500, rolled back, no record kept, the connection given back', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      const r = await s.run(404, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([r.status, r.body, pool.log.map(l => l.sql), pool.state.released], [404, { error: 'Workspace not found.', code: 'workspace' }, ['BEGIN', 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE', 'ROLLBACK'], 1]);
    } finally { await s.close(); }
    const broken = importDb({ failOn: /^INSERT INTO deals/ }), s2 = await importServer(broken);
    try {
      const r = await s2.run(7, await gz(I_BUNDLE(I_DATA())));
      assert.deepEqual([r.status, r.body.detail, broken.log.at(-1).sql, broken.log.some(l => l.sql === 'COMMIT'), broken.inserted.some(i => i.table === 'workspace_imports'), broken.state.released], [500, 'boom', 'ROLLBACK', false, false, 1]);
    } finally { await s2.close(); }
  });
});

describe('GET /workspaces/imports: the record of what was brought in', () => {
  test('the newest fifty, as they are kept; one question, a SELECT', async () => {
    const rows = [{ id: 2, workspace_id: 7, workspace_name: 'Ziel', file_name: 'b.tar.gz', source_name: 'Müller & Söhne', exported_at: '2026-11-24T10:00:00.000Z', counts: { contacts: { adds: 1, here: 1, left_out: 0 } }, created_at: '2026-11-24T12:00:00.000Z' },
      { id: 1, workspace_id: null, workspace_name: 'Gelöscht', file_name: '', source_name: 'x', exported_at: null, counts: {}, created_at: '2026-11-23T12:00:00.000Z' }];
    const pool = importDb({ imports: rows }), s = await importServer(pool);
    try {
      const r = await s.send('GET', '/workspaces/imports');
      assert.deepEqual([r.status, r.body], [200, { imports: rows }]);
      assert.deepEqual(pool.log.map(l => l.sql), ['SELECT id, workspace_id, workspace_name, file_name, source_name, exported_at, counts, created_at FROM workspace_imports ORDER BY id DESC LIMIT 50']);
    } finally { await s.close(); }
  });
  test('"imports" is not taken for a workspace\'s id by the export: the two addresses stand apart', async () => {
    const pool = importDb(), s = await importServer(pool);
    try {
      assert.equal((await s.send('GET', '/workspaces/imports/export')).status, 400, 'the export of a workspace called "imports" is a bad id');
      assert.equal((await s.send('POST', '/workspaces/imports/import')).status, 400);
    } finally { await s.close(); }
  });
});

describe('the lines that make it so', () => {
  const code = read('routes/admin-transfer.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('all three addresses are behind the console\'s gate; the file is read by the one function both use', () => {
    assert.deepEqual([...code.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)', (\w+)/g)].map(m => `${m[1]} ${m[2]} ${m[3]}`), ['get /workspaces/:id/export requireAdmin', 'post /workspaces/:id/import/check requireAdmin', 'post /workspaces/:id/import requireAdmin', 'get /workspaces/imports requireAdmin']);
    assert.equal((code.match(/await fileOf\(req, res\)/g) || []).length, 2);
  });
  test('the route itself asks the database one thing — the record — and writes nothing: what is added is added by utils/workspace-import.js run(), nowhere else', () => {
    const asked = [...code.matchAll(/pool\.query\(\s*[`']([^`']*)/g)].map(m => m[1].trim());
    assert.deepEqual(asked, ['SELECT id, workspace_id, workspace_name, file_name, source_name, exported_at, counts, created_at FROM workspace_imports ORDER BY id DESC LIMIT 50']);
    assert.doesNotMatch(code.replace(/^\s*\/\/.*$/gm, ''), /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/, 'no such statement outside a comment');
    assert.equal((code.match(/importer\.run\(/g) || []).length, 1);
    assert.match(code, /const out = await importer\.run\(pool, got\.id, got\.bundle, \{ file: \{ name \} \}\);/);
    assert.match(code, /const name = String\(req\.get\('X-File-Name'\) \|\| ''\)\.replace\(\/\[\^\\w\.\(\) -\]\/g, ''\)\.slice\(0, 200\);/);
  });
  test('the record\'s table: the platform\'s, kept when the workspace goes, and not part of an export', () => {
    const db = read('db.js');
    const table = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS workspace_imports ('), db.indexOf('CREATE TABLE IF NOT EXISTS assistant_chats'));
    for (const line of ['id             SERIAL PRIMARY KEY,', 'workspace_id   INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,', "workspace_name TEXT NOT NULL DEFAULT '',", "file_name      TEXT NOT NULL DEFAULT '',", "source_name    TEXT NOT NULL DEFAULT '',",
      'exported_at    TEXT,', "counts         JSONB NOT NULL DEFAULT '{}',", 'created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()']) assert.ok(table.includes(`      ${line}\n`), line);
    assert.equal(LEFT_OUT.workspace_imports, 'platform');
  });
});
