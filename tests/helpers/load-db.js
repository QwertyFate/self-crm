/**
 * Evaluate a db.js SOURCE STRING as a CommonJS module with `pg` swapped for
 * whatever pool you pass in. Used by the migration tests so they can load
 *   - the current db.js (from disk), or
 *   - a previous version (e.g. `git show HEAD:db.js`) for a baseline run,
 * and point either at a recording fake pool (unit test) or a real pool on a
 * throwaway database (integration test).
 *
 * db.js only requires 'pg' and 'crypto'; every other name falls through to the
 * real `require`.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function loadDb(source, pool) {
  const fakePg = { Pool: function Pool() { return pool; } };
  const req = name => (name === 'pg' ? fakePg : require(name));
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', source)(req, mod, mod.exports, ROOT, path.join(ROOT, 'db.js'));
  return mod.exports;   // { pool, initDb, seedDefaultStages, seedDefaultPipeline }
}

module.exports = { loadDb, ROOT };
