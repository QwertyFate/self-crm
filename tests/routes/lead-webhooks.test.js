// ROUTE tests: up to five named lead webhooks per workspace (LEAD_WEBHOOK_CHANGES Part 1; five since Part 6).
//
// The card's whole contract lives here: GET /settings lists them oldest first (and creates the first on first view),
// POST /settings adds one (409 past five, 409 on a name already used), PATCH/DELETE are scoped to one id — never to
// the workspace — and /logs names the webhook a lead came in through. The last one cannot be deleted, a legacy row
// keeps its key and settings, and Cal.com/Calendly keep using the OLDEST row for a booking that creates a contact.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve, inject } = require('../helpers/load-route');

const WID = 7;

// A fake Postgres that behaves like workspace_webhook for exactly the statements the route writes. The point is to
// see WHICH row an UPDATE touches: a WHERE that still said workspace_id would rewrite both here, as it would in prod.
function fakeDb(seed = []) {
  const state = { webhooks: seed.map(w => ({ ...w })), nextId: Math.max(0, ...seed.map(w => w.id)) + 1 };
  const find = (id, wid) => state.webhooks.find(w => w.id === id && w.workspace_id === wid);

  async function query(sql, params = []) {
    // GET /settings: the list, with the names of the pipeline and stage
    if (/^\s*SELECT w\.\*.*FROM workspace_webhook w/s.test(sql)) {
      return {
        rows: state.webhooks
          .filter(w => w.workspace_id === params[0])
          .sort((a, b) => a.id - b.id)
          .map(w => ({ ...w, pipeline_name: null, stage_name: null })),
      };
    }
    // GET /settings on a workspace that has none
    if (/INSERT INTO workspace_webhook \(workspace_id, webhook_key\)\s*SELECT \$1,\$2/s.test(sql)) {
      if (!state.webhooks.some(w => w.workspace_id === params[0])) {
        state.webhooks.push({ id: state.nextId++, workspace_id: params[0], webhook_key: params[1], name: 'Webhook 1',
          field_map: {}, create_deal: false, pipeline_id: null, stage_id: null, default_assignee_id: null, active: true });
      }
      return { rows: [] };
    }
    if (/^SELECT name FROM workspace_webhook WHERE workspace_id=\$1$/.test(sql)) {
      return { rows: state.webhooks.filter(w => w.workspace_id === params[0]).map(w => ({ name: w.name })) };
    }
    // POST /settings
    if (/^INSERT INTO workspace_webhook \(workspace_id, webhook_key, name\)/s.test(sql)) {
      const [wid, key, name, max] = params;
      if (state.webhooks.filter(w => w.workspace_id === wid).length >= max) return { rows: [] };
      const clash = state.webhooks.some(w => w.workspace_id === wid &&
        String(w.name).toLowerCase() === String(name).toLowerCase());
      if (clash) throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      const row = { id: state.nextId++, workspace_id: wid, webhook_key: key, name,
        field_map: {}, create_deal: false, pipeline_id: null, stage_id: null, default_assignee_id: null, active: true };
      state.webhooks.push(row);
      return { rows: [{ ...row }] };
    }

    // PATCH /settings/:id and the cached page's PATCH /settings
    if (/^UPDATE workspace_webhook SET /s.test(sql)) {
      const setPart = /^UPDATE workspace_webhook SET ([\s\S]*?)\s+WHERE/.exec(sql)[1];
      const sets = [...setPart.matchAll(/(\w+)=\$(\d+)/g)].map(m => ({ col: m[1], val: params[Number(m[2]) - 1] }));
      const where = /WHERE ([\s\S]*)$/.exec(sql)[1];

      let target;
      const scoped = /id=\$(\d+) AND workspace_id=\$(\d+)/.exec(where);
      if (scoped) {
        target = find(Number(params[Number(scoped[1]) - 1]), params[Number(scoped[2]) - 1]);
      } else if (/id = \(SELECT id FROM workspace_webhook WHERE workspace_id=\$(\d+) ORDER BY id ASC LIMIT 1\)/.test(where)) {
        const wid = Number(params[Number(/workspace_id=\$(\d+)/.exec(where)[1]) - 1]);
        target = state.webhooks.filter(w => w.workspace_id === wid).sort((a, b) => a.id - b.id)[0];
      }
      if (!target) return { rows: [] };

      const next = { ...target };
      for (const { col, val } of sets) next[col] = col === 'field_map' ? JSON.parse(val) : val;
      if (sets.some(s => s.col === 'name')) {
        const clash = state.webhooks.some(w => w.id !== target.id && w.workspace_id === target.workspace_id &&
          String(w.name).toLowerCase() === String(next.name).toLowerCase());
        if (clash) throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      }
      Object.assign(target, next);
      return { rows: [{ ...target }] };
    }
    if (/^SELECT id FROM workspace_webhook WHERE workspace_id=\$1 ORDER BY id ASC LIMIT 1$/.test(sql)) {
      const first = state.webhooks.filter(w => w.workspace_id === params[0]).sort((a, b) => a.id - b.id)[0];
      return { rows: first ? [{ id: first.id }] : [] };
    }
    if (/^SELECT id FROM workspace_webhook WHERE id=\$1 AND workspace_id=\$2$/.test(sql)) {
      const row = find(params[0], params[1]);
      return { rows: row ? [{ id: row.id }] : [] };
    }
    // DELETE keeps the last one
    if (/^DELETE FROM workspace_webhook/s.test(sql)) {
      const [id, wid] = params;
      if (state.webhooks.filter(w => w.workspace_id === wid).length <= 1) return { rows: [] };
      const row = find(id, wid);
      if (!row) return { rows: [] };
      state.webhooks = state.webhooks.filter(w => w !== row);
      return { rows: [{ id: row.id }] };
    }
    // GET /logs
    if (/FROM webhook_logs l/.test(sql)) {
      const filter = params[1];
      const rows = [
        { id: 2, status: 'success', webhook_id: 2, webhook_name: 'Facebook', captured: {}, payload: {}, created_at: '2026-11-16T10:00:00Z' },
        { id: 1, status: 'success', webhook_id: null, webhook_name: null, captured: {}, payload: {}, created_at: '2026-11-15T10:00:00Z' },
      ];
      return { rows: rows.filter(r => filter == null || r.webhook_id === filter) };
    }
    // the catalogs GET /settings also returns
    if (/FROM pipelines WHERE workspace_id=\$1 ORDER BY position/.test(sql)) return { rows: [{ id: 3, name: 'Sales' }] };
    if (/FROM pipeline_stages ps JOIN pipelines p/.test(sql)) return { rows: [{ id: 9, name: 'Neu', color: '#000', pipeline_name: 'Sales' }] };
    if (/FROM custom_fields WHERE workspace_id=\$1 ORDER BY position/.test(sql)) return { rows: [] };
    if (/FROM users u\s+JOIN user_workspaces uw/.test(sql)) return { rows: [{ id: 1, name: 'Ada' }] };

    throw new Error('unexpected query: ' + sql);
  }

  return { state, pool: { query } };
}

const LEGACY = {
  id: 1, workspace_id: WID, webhook_key: 'old-key', name: 'Webhook 1',
  field_map: { name: 'full_name' }, create_deal: true, pipeline_id: 3, stage_id: 9, default_assignee_id: 4, active: true,
};

describe('GET/POST /api/integrations/settings: the list and the cap', () => {
  let server, db;
  before(async () => {
    db = fakeDb([LEGACY]);
    server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: db.pool }) });
  });
  after(async () => { await server.close(); });

  test('a workspace with one webhook gets it back oldest first, untouched, and no second row is made', async () => {
    const r = await server.request('GET', '/api/integrations/settings');
    assert.equal(r.status, 200);
    assert.equal(r.body.max_webhooks, 5);
    assert.equal(r.body.webhooks.length, 1);
    assert.equal(r.body.webhooks[0].id, 1);
    assert.equal(r.body.webhooks[0].webhook_key, 'old-key', 'the key already in Zapier keeps working');
    assert.deepEqual(r.body.webhooks[0].field_map, { name: 'full_name' });
    assert.equal(r.body.webhooks[0].pipeline_id, 3);
    assert.equal(r.body.webhooks[0].default_assignee_id, 4);
    assert.equal(db.state.webhooks.length, 1, 'nothing was created');
  });

  test('a second webhook gets the first free name and its own key; the first keeps key, mapping and deal settings', async () => {
    const r = await server.request('POST', '/api/integrations/settings', {});
    assert.equal(r.status, 201);
    assert.equal(r.body.webhook.name, 'Webhook 2');
    assert.notEqual(r.body.webhook.webhook_key, 'old-key');
    assert.equal(r.body.webhook.active, true);

    const all = await server.request('GET', '/api/integrations/settings');
    assert.deepEqual(all.body.webhooks.map(w => w.name), ['Webhook 1', 'Webhook 2']);
    assert.equal(all.body.webhooks[0].webhook_key, 'old-key');
    assert.equal(all.body.webhooks[0].create_deal, true);
  });

  test('a name already in use is refused, case-blind', async () => {
    const r = await server.request('POST', '/api/integrations/settings', { name: 'webhook 1' });
    assert.equal(r.status, 409);
    assert.equal(r.body.reason, 'name_taken');
    assert.equal(db.state.webhooks.length, 2);
  });

  test('a blank name is filled in; the third webhook is accepted', async () => {
    const blank = await server.request('POST', '/api/integrations/settings', { name: '   ' });
    assert.equal(blank.status, 201);
    assert.equal(blank.body.webhook.name, 'Webhook 3');
  });

  test('a fourth and a fifth are accepted, each with the next free name and a key of its own', async () => {
    const fourth = await server.request('POST', '/api/integrations/settings', {});
    assert.equal(fourth.status, 201);
    assert.equal(fourth.body.webhook.name, 'Webhook 4');

    const fifth = await server.request('POST', '/api/integrations/settings', {});
    assert.equal(fifth.status, 201);
    assert.equal(fifth.body.webhook.name, 'Webhook 5');

    assert.equal(db.state.webhooks.length, 5);
    assert.equal(new Set(db.state.webhooks.map(w => w.webhook_key)).size, 5, 'five different keys');
    assert.equal(db.state.webhooks[0].webhook_key, 'old-key', 'the first one is untouched');
  });

  test('a sixth webhook is refused with 409 limit, and a too-long name is refused before any row is made', async () => {
    const r = await server.request('POST', '/api/integrations/settings', { name: 'One more' });
    assert.equal(r.status, 409);
    assert.equal(r.body.reason, 'limit');
    assert.match(r.body.error, /at most 5 lead webhooks/);
    assert.equal(db.state.webhooks.length, 5);

    const tooLong = await server.request('POST', '/api/integrations/settings', { name: 'x'.repeat(61) });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.reason, 'invalid_name');
    assert.equal(db.state.webhooks.length, 5);
  });
});

describe('GET /api/integrations/settings: first view', () => {
  test('a workspace with no webhook gets its first one, named "Webhook 1", with a key', async () => {
    const db = fakeDb([]);
    const server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: db.pool }) });
    try {
      const r = await server.request('GET', '/api/integrations/settings');
      assert.equal(r.status, 200);
      assert.equal(r.body.webhooks.length, 1);
      assert.equal(r.body.webhooks[0].name, 'Webhook 1');
      assert.equal(r.body.webhooks[0].active, true);
      assert.match(r.body.webhooks[0].webhook_key, /^[0-9a-f]{40}$/);
    } finally { await server.close(); }
  });
});

describe('PATCH/DELETE /api/integrations/settings/:id: one webhook at a time', () => {
  let server, db;
  before(async () => {
    db = fakeDb([
      LEGACY,
      { ...LEGACY, id: 2, webhook_key: 'second-key', name: 'Facebook', field_map: {}, create_deal: false, pipeline_id: 5, stage_id: null },
    ]);
    server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: db.pool }) });
  });
  after(async () => { await server.close(); });

  test('a save touches only the webhook it names', async () => {
    const r = await server.request('PATCH', '/api/integrations/settings/2', {
      field_map: { email: 'mail' }, create_deal: true, pipeline_id: 5, stage_id: 11,
      default_assignee_id: 3, active: false,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.webhook.active, false);

    assert.deepEqual(db.state.webhooks.find(w => w.id === 2).field_map, { email: 'mail' });
    assert.equal(db.state.webhooks.find(w => w.id === 2).active, false);
    assert.equal(db.state.webhooks.find(w => w.id === 2).stage_id, 11);

    const first = db.state.webhooks.find(w => w.id === 1);
    assert.deepEqual(first.field_map, { name: 'full_name' }, 'the other webhook keeps its mapping');
    assert.equal(first.active, true, 'and stays on');
    assert.equal(first.pipeline_id, 3);
  });

  test('a rename touches only the name and is refused when another webhook has it', async () => {
    const ok = await server.request('PATCH', '/api/integrations/settings/2', { name: '  Meta   leads  ' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.webhook.name, 'Meta leads', 'whitespace collapsed');

    const clash = await server.request('PATCH', '/api/integrations/settings/1', { name: 'meta LEADS' });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.reason, 'name_taken');
    assert.equal(db.state.webhooks.find(w => w.id === 1).name, 'Webhook 1');

    const blank = await server.request('PATCH', '/api/integrations/settings/1', { name: '   ' });
    assert.equal(blank.status, 400);
    assert.equal(blank.body.reason, 'invalid_name');
  });

  test('an unknown id is 404 and a non-numeric one is 400', async () => {
    assert.equal((await server.request('PATCH', '/api/integrations/settings/99', { active: false })).status, 404);
    assert.equal((await server.request('PATCH', '/api/integrations/settings/abc', { active: false })).status, 400);
    assert.equal((await server.request('DELETE', '/api/integrations/settings/99')).status, 404);
    assert.equal((await server.request('POST', '/api/integrations/settings/99/regenerate-key', {})).status, 404);
  });

  test('a new key is minted for one webhook only', async () => {
    const r = await server.request('POST', '/api/integrations/settings/2/regenerate-key', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.webhook_id, 2);
    assert.match(r.body.webhook_key, /^[0-9a-f]{40}$/);
    assert.equal(db.state.webhooks.find(w => w.id === 1).webhook_key, 'old-key');
    assert.equal(db.state.webhooks.find(w => w.id === 2).webhook_key, r.body.webhook_key);
  });

  test('the last webhook cannot be deleted; the others can', async () => {
    const one = await server.request('DELETE', '/api/integrations/settings/2');
    assert.equal(one.status, 200);
    assert.equal(db.state.webhooks.length, 1);

    const last = await server.request('DELETE', '/api/integrations/settings/1');
    assert.equal(last.status, 409);
    assert.equal(last.body.reason, 'last_webhook');
    assert.equal(db.state.webhooks.length, 1, 'the workspace always keeps an address');
  });
});

describe('the cached page\'s old paths still edit the first webhook', () => {
  test('PATCH /settings and POST /settings/regenerate-key act on the oldest row', async () => {
    const db = fakeDb([LEGACY, { ...LEGACY, id: 2, webhook_key: 'second-key', name: 'Facebook' }]);
    const server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: db.pool }) });
    try {
      const saved = await server.request('PATCH', '/api/integrations/settings', { active: false });
      assert.equal(saved.status, 200);
      assert.equal(db.state.webhooks.find(w => w.id === 1).active, false);
      assert.equal(db.state.webhooks.find(w => w.id === 2).active, true);

      const rotated = await server.request('POST', '/api/integrations/settings/regenerate-key', {});
      assert.equal(rotated.status, 200);
      assert.equal(db.state.webhooks.find(w => w.id === 1).webhook_key, rotated.body.webhook_key);
      assert.equal(db.state.webhooks.find(w => w.id === 2).webhook_key, 'second-key');
    } finally { await server.close(); }
  });
});

describe('GET /api/integrations/logs: which webhook a lead came in through', () => {
  let server;
  before(async () => {
    server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: fakeDb([LEGACY]).pool }) });
  });
  after(async () => { await server.close(); });

  test('every lead carries its webhook\'s name, and ?webhook_id= narrows the list', async () => {
    const all = await server.request('GET', '/api/integrations/logs');
    assert.equal(all.status, 200);
    assert.equal(all.body.logs.length, 2);
    assert.equal(all.body.logs[0].webhook_name, 'Facebook');

    const one = await server.request('GET', '/api/integrations/logs?webhook_id=2');
    assert.equal(one.body.logs.length, 1);
    assert.equal(one.body.logs[0].webhook_id, 2);

    const bad = await server.request('GET', '/api/integrations/logs?webhook_id=abc');
    assert.equal(bad.status, 400);
  });
});

describe('POST /api/integrations/receive/:key: the log names the webhook', () => {
  test('a lead is logged against the row whose key was called', async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM workspace_webhook WHERE webhook_key=\$1 AND active=true/.test(sql)) {
          return { rows: [{ id: 5, workspace_id: WID, webhook_key: 'k5', name: 'Facebook', field_map: { name: 'full_name' }, create_deal: false }] };
        }
        if (/INSERT INTO contacts/.test(sql)) return { rows: [{ id: 55, name: 'Priya Shah' }] };
        if (/INSERT INTO webhook_logs/.test(sql)) return { rows: [] };
        throw new Error('unexpected query: ' + sql);
      },
    };
    const server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool }) });
    try {
      const r = await server.request('POST', '/api/integrations/receive/k5', { full_name: 'Priya Shah' });
      assert.equal(r.status, 200);
      const log = calls.find(c => /INSERT INTO webhook_logs/.test(c.sql));
      assert.match(log.sql, /webhook_id/);
      assert.ok(log.params.includes(5), 'the webhook id is written on the log');
    } finally { await server.close(); }
  });
});

describe('calContactFor: a booking that creates a contact uses the OLDEST webhook', () => {
  test('its pipeline, stage and assignee, and the query asks for the first row', async () => {
    const sqls = [];
    const pool = {
      query: async (sql, params) => {
        sqls.push(sql);
        if (/FROM contacts WHERE workspace_id=\$1 AND lower\(email\)=\$2/.test(sql)) return { rows: [] };
        if (/FROM workspace_webhook WHERE workspace_id=\$1/.test(sql)) {
          return { rows: [{ pipeline_id: 3, stage_id: 9, default_assignee_id: 4 }] };
        }
        if (/INSERT INTO contacts/.test(sql)) return { rows: [{ id: 60, name: 'Gast' }] };
        if (/INSERT INTO deals/.test(sql)) return { rows: [{ id: 70 }] };
        throw new Error('unexpected query: ' + sql);
      },
    };
    const router = loadRoute('integrations.js', { pool });
    const out = await router.booking.contactFor(WID, { attendee: { name: 'Gast', email: 'gast@example.com' } }, {});

    const whSql = sqls.find(s => /FROM workspace_webhook/.test(s));
    assert.match(whSql, /ORDER BY id ASC LIMIT 1/);
    assert.equal(out.createdContact, true);
    assert.equal(out.createdDealId, 70);
  });
});

// Two leads with the same new email at the same moment become ONE contact (FACEBOOK_CHANGES Part 3b, 2026-11-24):
// "is there a contact with this email?" and the insert that follows are one step per workspace and email, held by a
// lock of the database's own. Here the pool has a connect() of its own, so the test sees how the step is bracketed;
// that the lock really holds two requests apart is shown on a real Postgres (the log names the harness).
describe('POST /api/integrations/receive/:key: looking for the email and inserting are one locked step', () => {
  function lockedDb({ known = null, failInsert = false, deal = false } = {}) {
    const seq = [];
    const hook = { id: 5, workspace_id: WID, webhook_key: 'k5', name: 'Facebook', field_map: { name: 'full_name', email: 'email', phone: 'phone' }, create_deal: deal, pipeline_id: deal ? 3 : null, stage_id: deal ? 30 : null, active: true };
    const pool = {
      query: async (sql, params) => {
        const t = String(sql).replace(/\s+/g, ' ').trim();
        seq.push(['pool', t, params]);
        if (/FROM workspace_webhook WHERE webhook_key=\$1 AND active=true/.test(t)) return { rows: [hook] };
        if (/INSERT INTO webhook_logs/.test(t)) return { rows: [] };
        if (/^INSERT INTO deals/.test(t)) return { rows: [{ id: 77 }] };
        if (/fonio/.test(t)) return { rows: [] };   // fonio is not connected here
        if (/contacts/.test(t) && !/engine|kunde/i.test(t)) throw new Error('a contact statement outside the locked step: ' + t);
        throw new Error('the Engine is not set up here');   // whatever the Engine asks first ends its telling
      },
      connect: async () => { seq.push(['connect']); return {
        query: async (sql, params) => {
          const t = String(sql).replace(/\s+/g, ' ').trim();
          seq.push(['client', t, params]);
          if (/^SELECT id, name, email, phone, company, contact_type FROM contacts WHERE workspace_id=\$1 AND email=\$2$/.test(t)) return { rows: known ? [known] : [] };
          if (/^INSERT INTO contacts/.test(t)) { if (failInsert) throw new Error('disk full'); return { rows: [{ id: 55, name: params[1] }] }; }
          if (/^UPDATE contacts SET name=\$1/.test(t)) return { rows: [{ id: known.id, name: params[0] }] };
          if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK' || t === 'SELECT pg_advisory_xact_lock($1::int, hashtext($2))') return { rows: [] };
          throw new Error('unexpected on the client: ' + t);
        },
        release: () => seq.push(['release']),
      }; },
    };
    return { pool, seq };
  }
  const steps = seq => seq.filter(s => s[0] !== 'pool').map(s => (s[0] === 'client' ? s[1].split(' ').slice(0, 3).join(' ') : s[0]));
  // The Engine is a stand-in that writes down when it is told (seq, when one is handed in): the real one would ask a
  // pool of its own, which this test could not see.
  const post = async (pool, body, seq = null) => {
    const restore = inject('utils/engine.js', { dispatchContactCreated: async a => { if (seq) seq.push(['engine', 'created', a]); }, dispatchContactUpdated: async a => { if (seq) seq.push(['engine', 'updated', a]); } });
    const server = await serve({ '/api/integrations': loadRoute('integrations.js', { pool }) });
    try { return await server.request('POST', '/api/integrations/receive/k5', body); } finally { await server.close(); restore(); }
  };

  test('a new email: begin, the lock for this workspace and this email, look, insert, commit — on one connection, which is given back', async () => {
    const { pool, seq } = lockedDb();
    const r = await post(pool, { full_name: 'Priya Shah', email: ' Priya@Example.DE ' });
    assert.deepEqual([r.status, r.body], [200, { success: true, contact_id: 55, deal_id: null }]);
    assert.deepEqual(steps(seq), ['connect', 'BEGIN', 'SELECT pg_advisory_xact_lock($1::int, hashtext($2))', 'SELECT id, name,', 'INSERT INTO contacts', 'COMMIT', 'release']);
    assert.deepEqual(seq.find(s => /pg_advisory_xact_lock/.test(s[1] || ''))[2], [WID, 'priya@example.de'], 'the lock is this workspace\'s and this email\'s, as it is stored');
    assert.equal(seq.filter(s => s[0] === 'connect').length, 1);
  });
  test('a known email: found and updated inside the same step', async () => {
    const { pool, seq } = lockedDb({ known: { id: 40, name: 'Priya', email: 'priya@example.de', phone: '030', company: null, contact_type: 'contact' } });
    const r = await post(pool, { full_name: 'Priya Shah', email: 'priya@example.de' });
    assert.deepEqual([r.status, r.body.contact_id], [200, 40]);
    assert.deepEqual(steps(seq), ['connect', 'BEGIN', 'SELECT pg_advisory_xact_lock($1::int, hashtext($2))', 'SELECT id, name,', 'UPDATE contacts SET', 'COMMIT', 'release']);
  });
  test('the Engine is told only after the step is written, the log is written after it too', async () => {
    const { pool, seq } = lockedDb();
    await post(pool, { full_name: 'Priya Shah', email: 'priya@example.de' });
    const iCommit = seq.findIndex(s => s[1] === 'COMMIT'), iRelease = seq.findIndex(s => s[0] === 'release');
    const after = seq.map((s, i) => [s, i]).filter(([s]) => s[0] === 'pool' && !/FROM workspace_webhook WHERE webhook_key/.test(s[1]));
    assert.ok(after.length >= 1 && after.every(([, i]) => i > iCommit && i > iRelease), 'nothing else is asked of the database while the lock is held');
    assert.ok(after.some(([s]) => /INSERT INTO webhook_logs/.test(s[1])));
  });
  test('the Engine hears of a new contact, and of a known one that changed, only once the step is written and the connection given back', async () => {
    const fresh = lockedDb();
    await post(fresh.pool, { full_name: 'Priya Shah', email: 'priya@example.de' }, fresh.seq);
    const at = (seq, kind) => seq.findIndex(s => s[0] === kind);
    assert.deepEqual(fresh.seq.filter(s => s[0] === 'engine'), [['engine', 'created', { workspaceId: WID, contactId: 55 }]]);
    assert.ok(at(fresh.seq, 'engine') > at(fresh.seq, 'release'), 'told inside the step, the Engine would look for a contact that is not written yet');
    const changed = lockedDb({ known: { id: 40, name: 'Priya', email: 'priya@example.de', phone: '030', company: null, contact_type: 'contact' } });
    await post(changed.pool, { full_name: 'Priya', email: 'priya@example.de', phone: '0171' }, changed.seq);
    const told = changed.seq.filter(s => s[0] === 'engine');
    assert.deepEqual([told.length, told[0][1], told[0][2].contactId, told[0][2].changed.length > 0], [1, 'updated', 40, true]);
    assert.ok(at(changed.seq, 'engine') > at(changed.seq, 'release'));
  });
  test('a known email with another name: the deal that is made carries the name as it is now', async () => {
    const { pool, seq } = lockedDb({ deal: true, known: { id: 40, name: 'Priya', email: 'priya@example.de', phone: null, company: null, contact_type: 'contact' } });
    const r = await post(pool, { full_name: 'Priya Shah', email: 'priya@example.de' });
    assert.deepEqual([r.status, r.body], [200, { success: true, contact_id: 40, deal_id: 77 }]);
    const deal = seq.find(s => s[0] === 'pool' && /^INSERT INTO deals/.test(s[1]));
    assert.deepEqual(deal[2], [WID, 40, 3, 30, 'Priya Shah']);
  });
  test('the insert fails: rolled back, the connection given back, and the delivery says so', async () => {
    const { pool, seq } = lockedDb({ failInsert: true });
    const logged = [];
    const realError = console.error; console.error = (...a) => logged.push(a);
    let r; try { r = await post(pool, { full_name: 'Priya Shah', email: 'priya@example.de' }); } finally { console.error = realError; }
    assert.equal(r.status, 500);
    assert.deepEqual(steps(seq), ['connect', 'BEGIN', 'SELECT pg_advisory_xact_lock($1::int, hashtext($2))', 'SELECT id, name,', 'INSERT INTO contacts', 'ROLLBACK', 'release']);
    assert.equal(seq.some(s => s[0] === 'pool' && /INSERT INTO webhook_logs/.test(s[1])), false, 'no success is logged');
    assert.deepEqual([logged.length, logged[0][0], logged[0][1].message], [1, 'Webhook error:', 'disk full'], 'the error that goes on is the database\'s own');
  });
  test('a lead without an email takes no lock: there is nothing to look for', async () => {
    const seq = [];
    const pool = { query: async (sql, params) => { seq.push(String(sql)); if (/FROM workspace_webhook WHERE webhook_key=\$1 AND active=true/.test(sql)) return { rows: [{ id: 5, workspace_id: WID, field_map: { name: 'full_name' }, create_deal: false, active: true }] };
      if (/INSERT INTO contacts/.test(sql)) { assert.equal(params[2], null); return { rows: [{ id: 56, name: 'Priya' }] }; } if (/INSERT INTO webhook_logs/.test(sql)) return { rows: [] }; throw new Error('no'); },
      connect: async () => { throw new Error('no connection is taken'); } };
    const r = await post(pool, { full_name: 'Priya' });
    assert.deepEqual([r.status, r.body.contact_id], [200, 56]);
  });
  test('the helper gives a fake pool a connect() only when it has none, and answers only a transaction\'s own statements itself', async () => {
    const { withConnect } = require('../helpers/load-route');
    const asked = [], plain = { query: async sql => { asked.push(sql); return { rows: [{ n: 1 }] }; } };
    const client = await withConnect(plain).connect();
    for (const sql of ['BEGIN', 'COMMIT', 'ROLLBACK', 'SELECT pg_advisory_xact_lock($1::int, hashtext($2))']) assert.deepEqual(await client.query(sql), { rows: [], rowCount: 0 });
    assert.deepEqual([await client.query('SELECT 1'), asked], [{ rows: [{ n: 1 }] }, ['SELECT 1']]);
    const own = async () => 'mine', kept = { query: async () => ({ rows: [] }), connect: own };
    assert.equal(withConnect(kept).connect, own);
  });
});
