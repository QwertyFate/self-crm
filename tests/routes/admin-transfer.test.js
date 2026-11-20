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
