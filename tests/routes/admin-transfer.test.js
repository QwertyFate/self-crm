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
const { TABLES } = require('../../utils/workspace-export');

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
      assert.equal(b.version, 1);
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
