// UNIT — utils/open-signup.js: the decision table, and the two places that read it outside the
// routes: db.js (the first-run invite box is skipped when no code is needed — the invite row is
// still written) and server.js (the boot notice).
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { ROOT }   = require('../helpers/load-route');
const { loadDb } = require('../helpers/load-db');
const { openSignup } = require(path.join(ROOT, 'utils', 'open-signup.js'));

const saved = { OPEN_SIGNUP: process.env.OPEN_SIGNUP, DATABASE_URL: process.env.DATABASE_URL };
function env(vars) { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
after(() => env(saved));

describe('openSignup()', () => {
  const table = [
    [{ OPEN_SIGNUP: undefined, DATABASE_URL: undefined }, true,  'embedded, nothing said → open'],
    [{ OPEN_SIGNUP: '',        DATABASE_URL: undefined }, true,  'empty counts as unset'],
    [{ OPEN_SIGNUP: undefined, DATABASE_URL: 'postgres://x' }, false, 'a Postgres server → codes'],
    [{ OPEN_SIGNUP: 'false',   DATABASE_URL: undefined }, false, 'false wins over embedded'],
    [{ OPEN_SIGNUP: '0',       DATABASE_URL: undefined }, false, '0 is false'],
    [{ OPEN_SIGNUP: 'true',    DATABASE_URL: 'postgres://x' }, true, 'true wins over hosted'],
    [{ OPEN_SIGNUP: ' YES ',   DATABASE_URL: 'postgres://x' }, true, 'case and spaces do not matter'],
    [{ OPEN_SIGNUP: 'maybe',   DATABASE_URL: 'postgres://x' }, false, 'garbage falls back to the mode'],
  ];
  for (const [vars, expected, why] of table) test(why, () => { env(vars); assert.equal(openSignup(), expected); });
});

describe('db.js first-run invite', () => {
  const src = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  // A pool that makes initDb() see an empty database: both COUNT queries answer 0.
  function emptyDbPool() {
    const log = [];
    const pool = {
      log,
      query: async (sql, params) => {
        const text = String(sql).replace(/\s+/g, ' ').trim(); log.push({ sql: text, params });
        if (/COUNT\(\*\)::int AS n FROM (workspaces|platform_invites)/.test(text)) return { rows: [{ n: 0 }] };
        return { rows: [], rowCount: 0 };
      },
    };
    return pool;
  }
  async function run(vars) {
    env(vars);
    const pool = emptyDbPool();
    const lines = []; const orig = console.log; console.log = (...a) => lines.push(a.join(' '));
    try { await loadDb(src, pool).initDb(); } finally { console.log = orig; }
    return { lines, pool };
  }
  test('codes required → the invite row is written AND the box is printed', async () => {
    const { lines, pool } = await run({ OPEN_SIGNUP: 'false', DATABASE_URL: undefined });
    const ins = pool.log.find(e => /^INSERT INTO platform_invites \(code\)/.test(e.sql));
    assert.ok(ins); assert.match(ins.params[0], /^[0-9a-f]{32}$/);
    assert.ok(lines.some(l => /First-run platform invite code/.test(l)));
    assert.ok(lines.some(l => l.includes(ins.params[0])), 'the code itself is shown');
  });
  test('open signup → the invite row is still written, the box is not printed', async () => {
    const { lines, pool } = await run({ OPEN_SIGNUP: 'true', DATABASE_URL: undefined });
    assert.ok(pool.log.some(e => /^INSERT INTO platform_invites \(code\)/.test(e.sql)), 'kept for a later OPEN_SIGNUP=false');
    assert.equal(lines.some(l => /First-run platform invite code/.test(l)), false);
  });
  test('the guard is the shared helper, not a second reading of the environment', () => {
    assert.match(src, /require\('\.\/utils\/open-signup'\)/);
    assert.match(src, /if \(!openSignup\(\)\) \{\s*const bar = /);
    assert.doesNotMatch(src, /process\.env\.OPEN_SIGNUP/);
  });
});

describe('server.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  test('prints the open-signup notice, once, right before listening', () => {
    assert.match(src, /require\('\.\/utils\/open-signup'\)/);
    const notice = src.indexOf("if (openSignup()) console.log('Open signup:"), listen = src.indexOf('httpServer.listen(');
    assert.ok(notice > 0 && notice < listen);
    assert.match(src.slice(notice, listen), /OPEN_SIGNUP=false/, 'tells how to turn it off');
  });
});
