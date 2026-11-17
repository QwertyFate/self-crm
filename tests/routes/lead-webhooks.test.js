// ROUTE tests: up to three named lead webhooks per workspace (LEAD_WEBHOOK_CHANGES Part 1).
//
// The card's whole contract lives here: GET /settings lists them oldest first (and creates the first on first view),
// POST /settings adds one (409 past three, 409 on a name already used), PATCH/DELETE are scoped to one id — never to
// the workspace — and /logs names the webhook a lead came in through. The last one cannot be deleted, a legacy row
// keeps its key and settings, and Cal.com/Calendly keep using the OLDEST row for a booking that creates a contact.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

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
    assert.equal(r.body.max_webhooks, 3);
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

  test('a fourth webhook is refused with 409 limit, and a too-long name is refused before any row is made', async () => {
    const r = await server.request('POST', '/api/integrations/settings', { name: 'One more' });
    assert.equal(r.status, 409);
    assert.equal(r.body.reason, 'limit');
    assert.equal(db.state.webhooks.length, 3);

    const tooLong = await server.request('POST', '/api/integrations/settings', { name: 'x'.repeat(61) });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.reason, 'invalid_name');
    assert.equal(db.state.webhooks.length, 3);
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
