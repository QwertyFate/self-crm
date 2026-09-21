/**
 * A stand-in for the `pg` connection pool.
 *
 * Every route talks to the database through exactly two calls:
 *   pool.query(sql, params)            — a one-off statement
 *   pool.connect() -> client.query()   — a statement inside a transaction
 *
 * This object offers those same methods, but instead of reaching Postgres it:
 *   1. records every statement it is asked to run, in `pool.log`, and
 *   2. answers from a list of rules you give it: the FIRST rule whose regex
 *      matches the (whitespace-normalised) SQL text returns the reply. If no
 *      rule matches, it returns an empty result `{ rows: [], rowCount: 0 }`.
 *
 * So a test can say "when the route runs `INSERT INTO deals`, pretend the
 * database returned id 99", run the route, then read back the exact SQL and
 * the exact bound parameters the route produced — all without a database.
 *
 *   const pool = createFakePool([
 *     { match: /^INSERT INTO deals/, reply: () => ({ rows: [{ id: 99 }], rowCount: 1 }) },
 *   ]);
 *   ... exercise the route ...
 *   pool.find(/^INSERT INTO deals/).params   // -> the values the route bound
 *
 * `reply` receives (params, sqlText) so a rule can answer based on what was
 * bound (e.g. "return the rows whose id is in the array the route passed").
 * Keep `match` anchored to the stable prefix of a statement (`/^INSERT INTO x/`,
 * `/FROM x WHERE workspace_id/`), not to a whole clause — see README §3.4.
 */
function createFakePool(rules = []) {
  const log = [];
  const norm = s => String(s).replace(/\s+/g, ' ').trim();

  async function query(sql, params = []) {
    const text = norm(sql);
    log.push({ sql: text, params });
    for (const rule of rules) {
      if (rule.match.test(text)) return rule.reply(params, text) ?? { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  const client = { query, release() {} };

  return {
    query,
    connect: async () => client,
    log,
    reset()          { log.length = 0; },                                    // call between tests to clear the recording
    find(re)         { return log.find(e => re.test(e.sql)); },              // first matching statement, or undefined
    some(re)         { return log.some(e => re.test(e.sql)); },              // was any statement like this run?
    filter(re)       { return log.filter(e => re.test(e.sql)); },            // all matching statements
    writes(re = /^(INSERT INTO|UPDATE|DELETE FROM)\b/) { return log.filter(e => re.test(e.sql)); },   // every write (or those matching re)
    someParam(pred)  { return log.some(e => e.params.some(pred)); },        // was a value like this ever bound?
  };
}

module.exports = { createFakePool };
