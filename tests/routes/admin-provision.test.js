// ROUTE tests for POST /api/admin/provision — the one-call tenant provisioner
// in routes/admin-provision.js.
//
// The fake pool records every statement the route issues, so each test asserts
// against what WOULD have been written: the workspace row, the custom_fields /
// deal_fields rows, the owner and the workspace_webhook row — plus the
// generated `integration` block in the
// response, which is the part the customer pastes into their form tool.
//
// platform_settings answers with no rows everywhere, so the route's hardcoded
// fallback defaults are what the tests see (same arrangement as
// default-contact-columns.test.js).
//
// On the owner's credential: the route issues ONE generated password and no
// password_resets token. The tests below pin that down, because a reset token
// is what used to make login flaky for an owner with two workspaces —
// reset-password updates one `users` row while login reads `WHERE email=$1`
// with no ORDER BY.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const APP_URL = 'https://crm.example.test';

// A pool that logs statements and answers the handful of SELECTs the route
// makes. `existingUser` makes the owner email look already-registered.
// `failOn` makes the matching statement throw, to test the rollback.
function makePool({ existingUser = null, failOn = null } = {}) {
  const log = [];
  let nextId = 100;

  async function query(sql, params) {
    log.push({ sql, params });
    if (failOn && failOn.test(sql)) throw Object.assign(new Error('boom'), { code: '42601' });

    if (/FROM platform_settings/.test(sql))                   return { rows: [] };
    if (/SELECT id, name, password_hash FROM users/.test(sql)) return { rows: existingUser ? [existingUser] : [] };
    if (/INSERT INTO workspaces/.test(sql))                   return { rows: [{ id: 9, name: params[0] }] };
    if (/INSERT INTO custom_fields/.test(sql) || /INSERT INTO deal_fields/.test(sql)) {
      return { rows: [{ id: nextId++, name: params[1], field_key: params[2], type: params[3], options: JSON.parse(params[4]) }] };
    }
    if (/INSERT INTO pipelines/.test(sql))                    return { rows: [{ id: 50, name: params[1] }] };
    if (/INSERT INTO pipeline_stages/.test(sql))              return { rows: [{ id: nextId++, name: params[2], color: params[3] }] };
    if (/INSERT INTO users/.test(sql)) {
      return { rows: [{ id: 77, name: params[1], email: params[2], role: params[4] }] };
    }
    return { rows: [] };
  }

  const client = { query, release: () => {} };
  return { log, connect: async () => client, query };
}

// `isAdmin` false drives the requireAdmin test; otherwise the caller is the
// platform admin, which is all the authorisation this route has.
function server(pool, { isAdmin = true } = {}) {
  const session = (req, _res, next) => { req.session = { isAdmin }; next(); };
  return serve({ '/': session, '/api/admin': loadRoute('admin-provision.js', { pool }) });
}

function stmts(log, re) { return log.filter(e => re.test(e.sql)); }
function one(log, re) {
  const hits = stmts(log, re);
  assert.equal(hits.length, 1, `expected exactly one statement matching ${re}, got ${hits.length}`);
  return hits[0];
}

describe('the gate accepts the secret in the request (no session)', () => {
  test('GET …/provision/list with X-Admin-Secret and no session → 200', async () => {
    const saved = process.env.ADMIN_SECRET; process.env.ADMIN_SECRET = 'top-secret';
    const q = async (sql) => (/FROM workspaces/.test(sql) ? { rows: [] } : { rows: [] });
    const s = await server({ connect: async () => ({ query: q, release() {} }), query: q }, { isAdmin: false });
    try {
      const r = await s.request('GET', '/api/admin/provision/list', undefined, { 'x-admin-secret': 'top-secret' });   // undefined: a GET has no body
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const bad = await s.request('GET', '/api/admin/provision/list', undefined, { 'x-admin-secret': 'wrong' });
      assert.equal(bad.status, 401);
    } finally { await s.close(); if (saved === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = saved; }
  });
});

describe('GET /api/admin/provision/list', () => {
  const dbRow = {
    id: 7, name: 'Acme', created_at: '2026-10-01T10:00:00Z', provisioned_at: '2026-10-01T10:00:00Z',
    owner_name: 'Maria', owner_email: 'maria@acme.io', member_count: 3,
    contact_field_count: 2, deal_field_count: 1, contact_count: 40, deal_count: 5,
    webhook_key: 'abc123', webhook_active: true,
  };

  function listPool(rows) {
    const q = async (sql) => (/FROM workspaces/.test(sql) ? { rows } : { rows: [] });
    return { connect: async () => ({ query: q, release() {} }), query: q };
  }

  test('requires the admin session', async () => {
    const s = await server(listPool([]), { isAdmin: false });
    try {
      const r = await s.request('GET', '/api/admin/provision/list');
      assert.equal(r.status, 401);
    } finally { await s.close(); }
  });

  test('derives provisioned and webhook_url from the row', async () => {
    process.env.APP_URL = APP_URL;
    const s = await server(listPool([dbRow]));
    try {
      const r = await s.request('GET', '/api/admin/provision/list');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.base_url, APP_URL);
      const w = r.body.workspaces[0];
      assert.equal(w.provisioned, true, 'provisioned_at present → provisioned');
      assert.equal(w.webhook_url, `${APP_URL}/api/integrations/receive/abc123`);
      assert.equal(w.owner_email, 'maria@acme.io');
      assert.equal(w.member_count, 3);
    } finally { await s.close(); }
  });

  test('a pre-existing workspace is not claimed as provisioned, and no webhook means no URL', async () => {
    const s = await server(listPool([{ ...dbRow, provisioned_at: null, webhook_key: null, webhook_active: null }]));
    try {
      const r = await s.request('GET', '/api/admin/provision/list');
      const w = r.body.workspaces[0];
      assert.equal(w.provisioned, false, 'nothing was backfilled, so NULL must not read as provisioned');
      assert.equal(w.webhook_url, null, 'no key → no URL rather than a broken one');
    } finally { await s.close(); }
  });

  test('never returns a password or a hash', async () => {
    const s = await server(listPool([dbRow]));
    try {
      const r = await s.request('GET', '/api/admin/provision/list');
      const body = JSON.stringify(r.body);
      assert.doesNotMatch(body, /password/i, 'the list must not carry credentials');
      assert.doesNotMatch(body, /\$2[aby]\$/, 'nor a bcrypt hash');
    } finally { await s.close(); }
  });
});

describe('POST /api/admin/provision', () => {
  test('the platform gate: no admin session → 401 and nothing is written', async () => {
    const pool = makePool();
    const s = await server(pool, { isAdmin: false });
    try {
      const r = await s.request('POST', '/api/admin/provision', { workspace_name: 'Acme', owner_email: 'a@acme.io' });
      assert.equal(r.status, 401);
      assert.equal(r.body.error, 'Admin access required');
      assert.equal(pool.log.length, 0, 'an unauthorised call must not touch the database');
    } finally { await s.close(); }
  });

  test('minimum body (workspace name + owner email) provisions a whole tenant', async () => {
    process.env.APP_URL = APP_URL;
    const pool = makePool();
    const s = await server(pool);
    try {
      const r = await s.request('POST', '/api/admin/provision', {
        workspace_name: '  Acme Corp  ', owner_email: 'Owner@Acme.IO  ',
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);

      // ── workspace, seeded from the platform defaults ────────────────────
      const ws = one(pool.log, /INSERT INTO workspaces/);
      assert.equal(ws.params[0], 'Acme Corp', 'workspace_name is trimmed');
      assert.deepEqual(JSON.parse(ws.params[1]).map(c => c.key),
        ['company', 'email', 'phone', 'assigned_to', 'created_at']);

      // ── owner: role owner in both tables, email normalised ──────────────
      const user = one(pool.log, /INSERT INTO users/);
      assert.equal(user.params[2], 'owner@acme.io', 'email is lowercased and trimmed');
      assert.equal(user.params[1], 'owner', 'owner_name defaults to the email local part');
      assert.equal(user.params[4], 'owner');
      assert.match(user.params[3], /^\$2[aby]\$/, 'only a bcrypt hash is stored');
      assert.equal(one(pool.log, /INSERT INTO user_workspaces/).params[2], 'owner');

      // ── the one credential: a generated password, returned once ─────────
      const pw = r.body.owner.password;
      assert.equal(r.body.owner.existing_account, false);
      assert.equal(typeof pw, 'string');
      assert.match(pw, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/,
        '16 characters in four readable groups');
      assert.equal(pw.replace(/-/g, '').length, 16);
      assert.ok(!/[0O1lI]/.test(pw), 'no look-alike characters — this gets retyped');
      assert.ok(!/^\$2[aby]\$/.test(pw), 'the response carries the plaintext, not the hash');
      assert.ok(require('bcryptjs').compareSync(pw, user.params[3]),
        'the returned password is the one that was hashed into the row — so it actually logs in');
      assert.equal(r.body.owner.set_password_url, undefined, 'no set-password link any more');
      assert.equal(stmts(pool.log, /INSERT INTO password_resets/).length, 0,
        'no reset token is minted: a per-row password UPDATE is what makes multi-workspace login flaky');

      // ── the pipeline every new workspace gets ───────────────────────────
      assert.equal(stmts(pool.log, /INSERT INTO pipeline_stages/).length, 6);
      assert.deepEqual(r.body.pipelines[0].stages.map(st => st.name),
        ['New', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost']);

      // ── the inbound webhook, ready to receive ───────────────────────────
      const wh = one(pool.log, /INSERT INTO workspace_webhook/);
      const [wsId, key, fieldMapJson, createDeal, pipelineId, stageId, assignee, active] = wh.params;
      assert.equal(wsId, 9);
      assert.match(key, /^[0-9a-f]{40}$/, 'a 20-byte hex key');
      assert.deepEqual(JSON.parse(fieldMapJson),
        { name: 'full_name', email: 'email', phone: 'phone_number', company: 'company' });
      assert.equal(createDeal, true, 'a provisioned webhook creates deals by default');
      assert.equal(pipelineId, 50);
      assert.equal(stageId, r.body.pipelines[0].stages[0].id, 'deals land in the FIRST stage');
      assert.equal(assignee, 77, 'inbound leads are assigned to the owner');
      assert.equal(active, true);

      // ── the integration doc handed to the customer ──────────────────────
      const integ = r.body.integration;
      assert.equal(integ.webhook_url, `${APP_URL}/api/integrations/receive/${key}`);
      assert.equal(integ.method, 'POST');
      assert.equal(integ.creates_deal, true);
      assert.equal(integ.stage.name, 'New');
      // the sample payload is keyed by the INCOMING keys of the real field_map
      assert.deepEqual(Object.keys(integ.sample_payload).sort(),
        ['company', 'email', 'full_name', 'phone_number']);
      assert.equal(integ.sample_payload.email, 'jane@example.com');
      assert.ok(integ.sample_curl.includes(integ.webhook_url), 'the curl targets the real URL');
      assert.ok(integ.sample_curl.includes('"full_name": "Jane Doe"'), 'the curl carries the sample body');
      assert.ok(integ.notes.length > 0);
    } finally { await s.close(); }
  });

  test('custom contact and deal fields are created and wired into the webhook', async () => {
    process.env.APP_URL = APP_URL;
    const pool = makePool();
    const s = await server(pool);
    try {
      const r = await s.request('POST', '/api/admin/provision', {
        workspace_name: 'Acme',
        owner_email: 'a@acme.io',
        owner_name: 'Ada Lovelace',
        contact_fields: [
          { name: 'LinkedIn Profile', type: 'url' },
          { name: 'Lead Source', type: 'dropdown', options: ['Ads', 'Referral'] },
        ],
        deal_fields: [
          { name: 'Contract Start', type: 'date' },
          { name: 'Seats', field_key: 'seat_count', type: 'number' },
        ],
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);

      // contact fields → custom_fields, keys slugged from the names, in order
      const cf = stmts(pool.log, /INSERT INTO custom_fields/);
      assert.equal(cf.length, 2);
      assert.deepEqual(cf.map(e => [e.params[2], e.params[3], e.params[5]]),
        [['linkedin_profile', 'url', 0], ['lead_source', 'dropdown', 1]]);
      assert.deepEqual(JSON.parse(cf[1].params[4]), ['Ads', 'Referral']);

      // deal fields → deal_fields, an explicit field_key wins over the name
      const df = stmts(pool.log, /INSERT INTO deal_fields/);
      assert.deepEqual(df.map(e => [e.params[2], e.params[3]]),
        [['contract_start', 'date'], ['seat_count', 'number']]);

      // the webhook maps the custom CONTACT fields; deal fields are not mappable
      const fieldMap = JSON.parse(one(pool.log, /INSERT INTO workspace_webhook/).params[2]);
      assert.deepEqual(fieldMap, {
        name: 'full_name', email: 'email', phone: 'phone_number', company: 'company',
        linkedin_profile: 'linkedin_profile', lead_source: 'lead_source',
      });
      assert.equal(fieldMap.contract_start, undefined, 'deal fields are NOT in the inbound map');

      // the sample payload gets a type-appropriate value for each custom field
      const sample = r.body.integration.sample_payload;
      assert.equal(sample.linkedin_profile, 'https://example.com');
      assert.equal(sample.lead_source, 'Ads', 'a dropdown samples its first option');

      assert.deepEqual(r.body.custom_fields.contact.map(f => f.field_key), ['linkedin_profile', 'lead_source']);
      assert.deepEqual(r.body.custom_fields.deal.map(f => f.field_key), ['contract_start', 'seat_count']);
      assert.ok(r.body.integration.notes.some(n => /custom deal field/.test(n)),
        'the response says out loud that the webhook does not fill deal fields');
      assert.equal(one(pool.log, /INSERT INTO users/).params[1], 'Ada Lovelace');
    } finally { await s.close(); }
  });

  test('an email that already has an account keeps its password and gets no new credentials', async () => {
    const pool = makePool({ existingUser: { id: 1, name: 'Ada', password_hash: '$2b$10$alreadyhashed' } });
    const s = await server(pool);
    try {
      const r = await s.request('POST', '/api/admin/provision', {
        workspace_name: 'Second Workspace', owner_email: 'ada@acme.io',
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);
      assert.equal(one(pool.log, /INSERT INTO users/).params[3], '$2b$10$alreadyhashed',
        'the existing hash is reused — one email, one password, a row per workspace');
      assert.equal(one(pool.log, /INSERT INTO users/).params[1], 'Ada', 'the existing name is reused');
      assert.equal(stmts(pool.log, /INSERT INTO password_resets/).length, 0, 'no token');
      assert.equal(r.body.owner.existing_account, true);
      assert.equal(r.body.owner.password, null,
        'no new password: every users row for one email must hold the SAME hash');
    } finally { await s.close(); }
  });

  test('it can only ever create a NEW workspace — never touch an existing one', async () => {
    // A DESIGN CONSTRAINT, not an accident: custom fields are seeded at
    // creation time only. An existing workspace's fields belong to that
    // workspace's own members via /api/fields and /api/deal-fields (both
    // requireAuth and workspace-scoped); the platform admin has no
    // cross-tenant field API. Two things keep that true, and this test pins
    // both: the route issues no UPDATE and no DELETE at all, and every row it
    // writes is scoped to the workspace it just created.
    const pool = makePool();
    const s = await server(pool);
    try {
      const r = await s.request('POST', '/api/admin/provision', {
        workspace_name: 'Fresh', owner_email: 'o@acme.io',
        contact_fields: [{ name: 'Lead Source', type: 'text' }],
        deal_fields:    [{ name: 'Seats', type: 'number' }],
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);

      assert.equal(stmts(pool.log, /\bUPDATE\b/).length, 0,
        'no UPDATE: this route cannot modify anything that already existed');
      assert.equal(stmts(pool.log, /\bDELETE\b/).length, 0, 'no DELETE either');

      const NEW_WS = 9;   // what the fake returns from INSERT INTO workspaces
      assert.equal(r.body.workspace.id, NEW_WS);

      // Every insert lands in the new workspace. `workspaces` itself has no
      // workspace_id column, and user_workspaces carries it second.
      for (const e of stmts(pool.log, /INSERT INTO/)) {
        if (/INSERT INTO workspaces/.test(e.sql)) continue;
        const idx = /INSERT INTO user_workspaces/.test(e.sql) ? 1 : 0;
        assert.equal(e.params[idx], NEW_WS,
          `${e.sql.slice(0, 48).replace(/\s+/g, ' ')} wrote to workspace ${e.params[idx]}, not the new one`);
      }

      // And the request body offers no way to name an existing workspace.
      const r2 = await s.request('POST', '/api/admin/provision', {
        workspace_id: 1, workspace_name: 'Fresh Two', owner_email: 'o2@acme.io',
      });
      assert.equal(r2.status, 201);
      assert.equal(r2.body.workspace.id, NEW_WS,
        'a stray workspace_id in the body is ignored — a new workspace is still created');
    } finally { await s.close(); }
  });

  test('each provisioning generates a different password', async () => {
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      const s = await server(makePool());
      try {
        const r = await s.request('POST', '/api/admin/provision', {
          workspace_name: `WS ${i}`, owner_email: `o${i}@acme.io`,
        });
        assert.equal(r.status, 201);
        seen.add(r.body.owner.password);
      } finally { await s.close(); }
    }
    assert.equal(seen.size, 5, 'five provisionings produced five distinct passwords');
  });

  test('create_deal:false leaves the webhook without a deal target', async () => {
    const pool = makePool();
    const s = await server(pool);
    try {
      const r = await s.request('POST', '/api/admin/provision', {
        workspace_name: 'Acme', owner_email: 'a@acme.io', create_deal: false, webhook_active: false,
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);
      const [, , , createDeal, pipelineId, stageId, , active] = one(pool.log, /INSERT INTO workspace_webhook/).params;
      assert.equal(createDeal, false);
      assert.equal(pipelineId, null);
      assert.equal(stageId, null);
      assert.equal(active, false);
      assert.equal(r.body.integration.pipeline, null);
      assert.ok(r.body.integration.notes.some(n => /INACTIVE/.test(n)), 'an inactive webhook says so');
      assert.equal(stmts(pool.log, /INSERT INTO pipelines/).length, 1,
        'the workspace still gets its default pipeline — only the webhook skips it');
    } finally { await s.close(); }
  });

  test('a failure mid-transaction rolls back and nothing is reported as created', async () => {
    const pool = makePool({ failOn: /INSERT INTO workspace_webhook/ });
    const s = await server(pool);
    try {
      const r = await s.request('POST', '/api/admin/provision', {
        workspace_name: 'Acme', owner_email: 'a@acme.io',
      });
      assert.equal(r.status, 500, 'the caller is not told a tenant exists');
      assert.equal(stmts(pool.log, /^ROLLBACK$/).length, 1, 'the transaction was rolled back');
      assert.equal(stmts(pool.log, /^COMMIT$/).length, 0, 'and never committed');
    } finally { await s.close(); }
  });

  describe('rejects a bad request before opening a transaction', () => {
    const cases = [
      ['workspace_name missing',       { owner_email: 'a@acme.io' },                                                        /workspace_name is required/],
      ['workspace_name blank',         { workspace_name: '   ', owner_email: 'a@acme.io' },                                 /workspace_name is required/],
      ['owner_email missing',          { workspace_name: 'Acme' },                                                          /owner_email is required/],
      ['owner_email malformed',        { workspace_name: 'Acme', owner_email: 'not-an-email' },                             /not a valid email/],
      ['contact_fields not an array',  { workspace_name: 'Acme', owner_email: 'a@acme.io', contact_fields: {} },             /must be an array/],
      ['a field with no name',         { workspace_name: 'Acme', owner_email: 'a@acme.io', deal_fields: [{ type: 'text' }] }, /deal_fields\[0\]\.name is required/],
      ['an unknown field type',        { workspace_name: 'Acme', owner_email: 'a@acme.io', contact_fields: [{ name: 'X', type: 'money' }] }, /is not valid/],
      ['a dropdown with no options',   { workspace_name: 'Acme', owner_email: 'a@acme.io', contact_fields: [{ name: 'Src', type: 'dropdown' }] }, /options must list at least one/],
      ['two fields, one key',          { workspace_name: 'Acme', owner_email: 'a@acme.io', deal_fields: [{ name: 'Seat Count' }, { name: 'seat count' }] }, /used twice/],
      ['a key that is a built-in',     { workspace_name: 'Acme', owner_email: 'a@acme.io', contact_fields: [{ name: 'Company' }] }, /built-in contact field/],
      ['a name that slugs to nothing', { workspace_name: 'Acme', owner_email: 'a@acme.io', contact_fields: [{ name: '!!!' }] }, /give an explicit field_key/],
      ['create_deal not a boolean',    { workspace_name: 'Acme', owner_email: 'a@acme.io', create_deal: 'yes' },             /create_deal must be a boolean/],
    ];

    for (const [label, body, expected] of cases) {
      test(label, async () => {
        const pool = makePool();
        const s = await server(pool);
        try {
          const r = await s.request('POST', '/api/admin/provision', body);
          assert.equal(r.status, 400, `expected 400, got ${r.status} ${JSON.stringify(r.body)}`);
          assert.match(r.body.error, expected);
          assert.equal(stmts(pool.log, /^BEGIN$/).length, 0, 'no transaction was opened');
          assert.equal(stmts(pool.log, /INSERT INTO/).length, 0, 'nothing was written');
        } finally { await s.close(); }
      });
    }
  });
});
