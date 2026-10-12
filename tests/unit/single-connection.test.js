// SINGLE CONNECTION — what embedded mode (db.js: `max: 1` when DATABASE_URL is unset) demands
// of every transaction in the codebase, pinned statically.
//
// THE DEADLOCK. With one client in the pool, `const client = await pool.connect()` takes it.
// Any `pool.query(...)` executed before `client.release()` then waits for a free client — the
// one this very code holds — and the request hangs forever, taking every later request with it
// (they queue behind it). routes/auth.js had exactly one such call (the workspace SELECT after
// COMMIT in POST /create-workspace, fixed 2026-10-09 to client.query). This scan keeps it at zero.
//
// Also here: the two pool configs db.js can build, read by loading db.js with a capturing `pg`.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { ROOT }   = require('../helpers/load-route');
const { loadDb } = require('../helpers/load-db');

function walk(dir) {
  const abs = path.join(ROOT, dir);
  return fs.existsSync(abs) ? fs.readdirSync(abs).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)) : [];
}
const FILES = ['server.js', 'db.js', 'notifications.js', ...walk('routes'), ...walk('middleware'), ...walk('utils')];

describe('no pool.* call while a transaction client is held', () => {
  let blocks = 0;
  for (const rel of FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    let i = 0;
    while ((i = src.indexOf('pool.connect()', i)) !== -1) {
      const end = src.indexOf('client.release()', i);
      assert.ok(end > i, `${rel}: pool.connect() at offset ${i} without a client.release() after it`);
      const block = src.slice(i + 'pool.connect()'.length, end);
      const line = src.slice(0, i).split('\n').length;
      test(`${rel}:${line} holds its client without touching the pool`, () => {
        assert.doesNotMatch(block, /\bpool\.(query|connect)\s*\(/, `${rel}:${line}: pool.* inside a held transaction — use client.query, or release first`);
      });
      blocks++;
      i = end;
    }
  }
  test('the scan saw the transactions it exists for', () => {
    assert.ok(blocks >= 10, `${blocks} transaction blocks`);
  });
  test('POST /api/auth/create-workspace reads the new workspace through the transaction client', () => {
    const auth = fs.readFileSync(path.join(ROOT, 'routes', 'auth.js'), 'utf8');
    const re = kind => new RegExp(`req\\.session\\.userRole\\s*=\\s*'owner';[\\s\\S]{0,500}?await ${kind}\\.query\\(\\s*'SELECT id, name, kanban_fields`);
    assert.match(auth, re('client'));
    assert.doesNotMatch(auth, re('pool'));
  });
});

describe('db.js pool config', () => {
  const src = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  function configWith(env) {
    const saved = { url: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL };
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    try { let cfg; loadDb(src, c => { cfg = c; return { query: async () => ({ rows: [] }) }; }); return cfg; }
    finally {
      if (saved.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.url;
      if (saved.ssl === undefined) delete process.env.DATABASE_SSL; else process.env.DATABASE_SSL = saved.ssl;
    }
  }
  test('no DATABASE_URL → embedded: loopback, port 0 until embedded.start() sets it, no TLS, ONE connection', () => {
    const cfg = configWith({ DATABASE_URL: undefined, DATABASE_SSL: undefined });
    assert.deepEqual(cfg, { host: '127.0.0.1', port: 0, user: 'postgres', database: 'postgres', ssl: false, max: 1 });
  });
  test('an empty DATABASE_URL counts as unset', () => {
    assert.equal(configWith({ DATABASE_URL: '', DATABASE_SSL: undefined }).max, 1);
  });
  test('DATABASE_URL set → the connection string, TLS on by default, no connection cap', () => {
    const cfg = configWith({ DATABASE_URL: 'postgres://u:p@db.example:5432/crm', DATABASE_SSL: undefined });
    assert.equal(cfg.connectionString, 'postgres://u:p@db.example:5432/crm');
    assert.deepEqual(cfg.ssl, { rejectUnauthorized: false });
    assert.equal('max' in cfg, false);
  });
  test('DATABASE_URL set + DATABASE_SSL=false → plain TCP (a local Postgres)', () => {
    assert.equal(configWith({ DATABASE_URL: 'postgres://u@localhost:5432/crm', DATABASE_SSL: 'false' }).ssl, false);
  });
});
