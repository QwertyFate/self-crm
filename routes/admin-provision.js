/* ═══════════════════════════════════════════════════════════════════════════
   /api/admin/provision — ONE CALL, ONE READY-TO-USE TENANT.

   The second router mounted at /api/admin (the first is routes/admin.js) and
   behind the same platform gate, middleware/admin-auth.js. No session user, no
   workspace, no invite code: the admin secret IS the authorisation, which is
   why this route may create a workspace out of nothing.

   WHY IT EXISTS  onboarding a customer by hand was five steps: mint a platform
   invite, send it, wait for them to sign up, let them add their custom fields,
   then walk them through the inbound webhook. This does all five, and hands
   back everything the customer needs — credentials AND a copy-pasteable
   webhook contract — in a single response.

   THE MINIMUM REQUEST   { "workspace_name": "Acme", "owner_email": "a@acme.io" }
   Everything else is optional: owner_name, contact_fields, deal_fields,
   create_deal, webhook_active.

   CREATE ONLY, BY DESIGN. This route takes no workspace id and issues no UPDATE
   and no DELETE — it cannot reach a workspace that already exists. The custom
   fields it accepts are SEEDS for the new workspace, not an admin editing API:
   once a workspace is live, its fields belong to its own members through
   /api/fields and /api/deal-fields (both requireAuth and workspace-scoped), and
   the platform admin has no cross-tenant field endpoint. A stray workspace_id
   in the body is ignored. Pinned by the "it can only ever create a NEW
   workspace" test in tests/routes/admin-provision.test.js.

   WHAT ONE CALL DOES, all inside a single transaction
     1. seed the workspace from platform_settings.default_contact_columns and
        .default_pipelines — the SAME defaults signup uses, so a provisioned
        workspace is indistinguishable from a self-served one.
     2. add the admin's own custom fields: contact_fields → custom_fields,
        deal_fields → deal_fields. field_key is slugged from the name when not
        given, and the type is checked against field-crud's VALID_TYPES, so
        these rows are exactly what /api/fields would have written.
     3. create the owner (role 'owner' in both `users` and `user_workspaces`).
     4. create the inbound webhook row with its key, its field_map already
        covering the custom contact fields, and a pipeline + first stage when
        create_deal is on.

   THE OWNER'S PASSWORD  one credential, nothing else: a generated password
   (generatePassword() below, ~93 bits) returned ONCE in this response. Nothing
   is emailed and the plaintext is never stored — only its bcrypt hash — so the
   admin must copy it before closing the tab. The owner logs in with
   owner_email + that password and is straight in.

   NO SET-PASSWORD TOKEN. An earlier version also minted a password_resets row
   and returned a ?reset= link. Two reasons it is gone, and only the second one
   still applies:
     - it used to be unsafe, because reset-password re-hashed a single users row
       while login reads `WHERE email=$1` unordered. THAT IS FIXED — the reset
       now covers every row of the email (routes/auth.js, locked in by
       tests/routes/reset-password-all-rows.test.js), so a link here would be
       correct again if you want one back.
     - one credential beats two. The owner has one thing to be sent and one way
       in, and the generated password is strong enough that a forced change is
       not the point. To change it they use Forgot password, which now works for
       a multi-workspace owner.

   AN EMAIL THAT ALREADY HAS AN ACCOUNT reuses that account's name and
   password_hash and is issued NO password at all (`existing_account: true`).
   That is the same invariant from the other side: one person owning several
   workspaces is one email with one password and a `users` row per workspace
   (see db.js on the identity model). Generating a fresh password for the
   second workspace would be exactly the divergence described above.

   ⚠ The app still has no change-password screen, so forgot-password →
     reset-password is the only way the owner can replace the password the admin
     has seen. That path is correct now, but it is a password RESET, not a
     change: it emails a link (or logs it when SMTP is unset). See readmedev.md §8.

   THE `integration` BLOCK is documentation generated from what was just
   written, not a static template: the URL carries the real key, the sample
   payload is built from the real field_map, and the curl is the sample payload
   shell-quoted. Hand it to the customer as-is.

   ⚠ ONE HONEST LIMITATION, also stated in integration.notes: the inbound
     webhook maps CONTACT fields only. deal_fields are created on the workspace
     for the board and the deal modal, but POST /api/integrations/receive/:key
     writes no deal custom_data — see routes/integrations.js, which inserts a
     deal with a title and nothing else.

   ENDPOINTS
     POST /provision        → 201 with the full tenant + integration doc
     GET  /provision/list   every workspace, its owner, its counts and its
                            webhook URL — what the console's Provisioning tab
                            renders. No passwords: only hashes are stored.
   ═══════════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const { pool }     = require('../db');
const requireAdmin = require('../middleware/admin-auth');
const { VALID_TYPES } = require('../middleware/field-crud');

// Mirrors signup's mode="create" (routes/auth.js) and POST /api/workspace.
// Used only when platform_settings has no override saved.
const FALLBACK_CONTACT_COLUMNS = [
  { key: 'company',     label: 'Company',    visible: true,  isCustom: false },
  { key: 'email',       label: 'Email',      visible: true,  isCustom: false },
  { key: 'phone',       label: 'Phone',      visible: true,  isCustom: false },
  { key: 'assigned_to', label: 'Assignee',   visible: true,  isCustom: false },
  { key: 'created_at',  label: 'Created At', visible: false, isCustom: false },
];
const FALLBACK_PIPELINES = [
  {
    name: 'Sales Pipeline',
    stages: [
      { name: 'New',         color: '#6b7280' },
      { name: 'Contacted',   color: '#3b82f6' },
      { name: 'Proposal',    color: '#f59e0b' },
      { name: 'Negotiation', color: '#8b5cf6' },
      { name: 'Won',         color: '#22c55e' },
      { name: 'Lost',        color: '#ef4444' },
    ],
  },
];

// The incoming payload keys the webhook's field_map points at for the four
// built-in contact fields. Same values as workspace_webhook.field_map's column
// default in db.js, so a provisioned webhook and a self-served one expect the
// same shape.
const BUILTIN_MAP = { name: 'full_name', email: 'email', phone: 'phone_number', company: 'company' };

const MAX_FIELDS_PER_OBJECT = 50;

// The generated password's alphabet and length: 56 characters with the
// look-alikes removed (no 0/O/o, no 1/l/I) because this credential is copied by
// hand and read out loud, and 16 of them is ~93 bits — far past anything
// brute-forceable through a bcrypt hash.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH   = 16;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrl() {
  return process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

// A password the admin can paste into an email and the owner can retype:
// crypto.randomInt is rejection-sampled by Node, so no modulo bias, and the
// groups of four are cosmetic (they are part of the password).
function generatePassword() {
  let out = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += PASSWORD_ALPHABET[crypto.randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
}

// "Deal Source" → "deal_source". Used when the admin gives a field a name but
// no field_key; the key is what the value is stored under in custom_data, so it
// has to be a stable identifier rather than a label.
function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Validate one `contact_fields` / `deal_fields` list into rows ready to insert.
 * Throws { status, error } — provisionError() below — on the first problem, so
 * a bad request is rejected before the transaction opens.
 */
function normaliseFields(input, label) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw provisionError(400, `${label} must be an array`);
  if (input.length > MAX_FIELDS_PER_OBJECT) {
    throw provisionError(400, `${label} cannot have more than ${MAX_FIELDS_PER_OBJECT} fields`);
  }

  const out  = [];
  const seen = new Set();

  input.forEach((raw, i) => {
    const at = `${label}[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw provisionError(400, `${at} must be an object`);

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) throw provisionError(400, `${at}.name is required`);

    const field_key = raw.field_key ? slugify(raw.field_key) : slugify(name);
    if (!field_key) throw provisionError(400, `${at}.field_key could not be derived from "${name}" — give an explicit field_key`);
    if (seen.has(field_key)) throw provisionError(400, `${at}.field_key "${field_key}" is used twice in ${label}`);
    seen.add(field_key);

    const type = raw.type === undefined ? 'text' : raw.type;
    if (!VALID_TYPES.includes(type)) {
      throw provisionError(400, `${at}.type "${type}" is not valid. Use one of: ${VALID_TYPES.join(', ')}`);
    }

    let options = [];
    if (raw.options !== undefined) {
      if (!Array.isArray(raw.options)) throw provisionError(400, `${at}.options must be an array`);
      options = raw.options.map(o => String(o));
    }
    if (type === 'dropdown' && options.length === 0) {
      throw provisionError(400, `${at} is a dropdown, so options must list at least one choice`);
    }

    out.push({ name, field_key, type, options, position: i });
  });

  return out;
}

function provisionError(status, error) {
  const e = new Error(error);
  e.status = status;
  e.expose = true;
  return e;
}

// A plausible value for the sample payload, so the customer can see the shape
// AND fire the sample curl to get a real contact in the workspace.
function sampleValueFor(type, options) {
  switch (type) {
    case 'email':    return 'jane@example.com';
    case 'phone':    return '+49 151 23456789';
    case 'number':   return 42;
    case 'date':     return new Date().toISOString().slice(0, 10);
    case 'url':      return 'https://example.com';
    case 'dropdown': return options?.[0] ?? 'Option A';
    default:         return 'Sample value';
  }
}

function sampleBuiltin(crmKey) {
  return { name: 'Jane Doe', email: 'jane@example.com', phone: '+49 151 23456789', company: 'Example GmbH' }[crmKey];
}

// Wrap a JSON body in single quotes for a copy-pasteable shell command. A
// single quote inside the JSON (a dropdown option like "O'Brien") would end the
// quoted string, so close / escape / reopen it the POSIX way.
function shellSingleQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * The `integration` block: everything the customer pastes into their form tool,
 * derived from the rows that were just written.
 */
function buildIntegrationDoc({ webhookKey, fieldMap, contactFields, dealFields, createDeal, pipeline, stage, active }) {
  const url = `${baseUrl()}/api/integrations/receive/${webhookKey}`;

  const samplePayload = {};
  for (const [crmKey, incomingKey] of Object.entries(fieldMap)) {
    if (crmKey in BUILTIN_MAP) {
      samplePayload[incomingKey] = sampleBuiltin(crmKey);
    } else {
      const field = contactFields.find(f => f.field_key === crmKey);
      samplePayload[incomingKey] = sampleValueFor(field?.type, field?.options);
    }
  }

  const sampleBody = JSON.stringify(samplePayload, null, 2);

  const notes = [
    'The key in the URL is the only secret — there is no header or token. Treat the URL itself as a credential.',
    'A contact is matched and updated BY EMAIL. A payload with no email always creates a new contact.',
    'At least one of the mapped name or email fields must arrive with a value, or the delivery is rejected with 422.',
    'Any mapped field that is not name / email / phone / company is stored on the contact under custom_data.',
    'Nested payloads work: set a field_map value to a dotted path such as "data.contact.email".',
    'Every delivery is logged. The owner sees the last 50 under Settings → Integrations (GET /api/integrations/logs).',
    'The owner can change the mapping, rotate the key or switch the webhook off at any time via Settings → Integrations.',
  ];
  if (dealFields.length) {
    notes.push(
      `The ${dealFields.length} custom deal field(s) created here are available on the deal board and modal, but the inbound ` +
      'webhook does not fill them: an auto-created deal gets a title, pipeline and stage only. Set those values in the app ' +
      'or through PUT /api/deals/:id.'
    );
  }
  if (!active) notes.push('This webhook was provisioned INACTIVE: deliveries get 404 until the owner activates it.');

  return {
    webhook_key:  webhookKey,
    webhook_url:  url,
    method:       'POST',
    content_type: 'application/json',
    auth:         'none — the key in the URL identifies the workspace',
    active,
    field_map:    fieldMap,
    field_map_direction: 'CRM field (key) ← your payload key (value)',
    creates_deal: createDeal,
    pipeline:     pipeline ? { id: pipeline.id, name: pipeline.name } : null,
    stage:        stage    ? { id: stage.id,    name: stage.name }    : null,
    sample_payload: samplePayload,
    sample_curl: `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d ${shellSingleQuote(sampleBody)}`,
    success_response: { success: true, contact_id: 123, deal_id: createDeal ? 456 : null },
    error_responses: [
      { status: 404, when: 'the key is wrong or the webhook is inactive', body: { error: 'Webhook not found or inactive' } },
      { status: 422, when: 'neither a name nor an email could be mapped out of the payload', body: { error: 'Payload rejected: the webhook must include at least a name or email. Check your field mapping.' } },
      { status: 429, when: 'a rate limit was hit', body: { error: 'Webhook rate limit exceeded. Maximum 120 requests per minute per key.' } },
    ],
    rate_limits: { per_key: '120 requests per minute', per_ip: '120 requests per 15 minutes' },
    logs_endpoint:     '/api/integrations/logs',
    settings_endpoint: '/api/integrations/settings',
    notes,
  };
}

router.post('/provision', requireAdmin, async (req, res, next) => {
  try {
    const {
      workspace_name,
      owner_email,
      owner_name,
      contact_fields,
      deal_fields,
      create_deal,
      webhook_active,
    } = req.body || {};

    // ── validate everything before opening a transaction ──────────────────
    const wsName = typeof workspace_name === 'string' ? workspace_name.trim() : '';
    if (!wsName) return res.status(400).json({ error: 'workspace_name is required' });
    if (wsName.length > 120) return res.status(400).json({ error: 'workspace_name cannot be longer than 120 characters' });

    const email = typeof owner_email === 'string' ? owner_email.toLowerCase().trim() : '';
    if (!email) return res.status(400).json({ error: 'owner_email is required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'owner_email is not a valid email address' });

    if (create_deal !== undefined && typeof create_deal !== 'boolean') {
      return res.status(400).json({ error: 'create_deal must be a boolean' });
    }
    if (webhook_active !== undefined && typeof webhook_active !== 'boolean') {
      return res.status(400).json({ error: 'webhook_active must be a boolean' });
    }

    let contactFields, dealFields;
    try {
      contactFields = normaliseFields(contact_fields, 'contact_fields');
      dealFields    = normaliseFields(deal_fields,    'deal_fields');
    } catch (e) {
      if (e.expose) return res.status(e.status).json({ error: e.message });
      throw e;
    }

    // A provisioned workspace is meant to be integration-ready, so inbound
    // leads land on the board unless the admin says otherwise. (The
    // workspace_webhook column default is false, for webhooks created by the
    // owner opening the settings page.)
    const createDeal    = create_deal === undefined ? true : create_deal;
    const webhookActive = webhook_active === undefined ? true : webhook_active;

    // A custom contact field_key must not collide with a built-in contact
    // column, or the webhook's field_map would have two meanings for one key
    // and the receive route would treat it as built-in (see its BUILTIN set).
    const RESERVED = new Set(['name', 'first_name', 'last_name', 'email', 'phone', 'company',
                              'assigned_to', 'created_at', 'updated_at', 'id', 'contact_type']);
    const reserved = contactFields.find(f => RESERVED.has(f.field_key));
    if (reserved) {
      return res.status(400).json({
        error: `contact_fields field_key "${reserved.field_key}" is a built-in contact field. Choose another key.`,
      });
    }

    // ── does this person already have an account? ─────────────────────────
    // The identity model is one `users` row per workspace sharing an email and
    // a password hash, so an existing email is NOT an error here: it means this
    // owner is getting another workspace. Reuse their credentials.
    const { rows: [existingUser] } = await pool.query(
      'SELECT id, name, password_hash FROM users WHERE email=$1 ORDER BY id ASC LIMIT 1',
      [email]
    );

    const ownerName = (typeof owner_name === 'string' && owner_name.trim())
      || existingUser?.name
      || email.split('@')[0];

    // An existing account keeps its hash and is issued nothing: every `users`
    // row for one email must hold the SAME hash, or login (which picks an
    // unspecified row) becomes a coin flip.
    let generatedPassword = null;
    let passwordHash;
    if (existingUser) {
      passwordHash = existingUser.password_hash;
    } else {
      generatedPassword = generatePassword();
      passwordHash      = bcrypt.hashSync(generatedPassword, 10);
    }

    // ── one transaction: workspace, fields, owner, webhook ────────────────
    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');

      let defaultContactColumns = FALLBACK_CONTACT_COLUMNS;
      let defaultPipelines      = FALLBACK_PIPELINES;
      const [colRes, pipeRes] = await Promise.all([
        client.query('SELECT value FROM platform_settings WHERE key=$1', ['default_contact_columns']),
        client.query('SELECT value FROM platform_settings WHERE key=$1', ['default_pipelines']),
      ]);
      if (colRes.rows[0]) defaultContactColumns = colRes.rows[0].value;
      if (pipeRes.rows[0]) defaultPipelines     = pipeRes.rows[0].value;

      // provisioned_at marks this as an admin-provisioned tenant rather than a
      // self-served signup, which is what GET /provision/list reports on.
      const { rows: [ws] } = await client.query(
        'INSERT INTO workspaces (name, contact_columns, provisioned_at) VALUES ($1, $2, NOW()) RETURNING id, name, provisioned_at',
        [wsName, JSON.stringify((defaultContactColumns || []).filter(c => !c.isCustom))]
      );

      // Custom contact fields come from two places: the platform defaults
      // (columns flagged isCustom) and this request. Platform ones go first so
      // the admin's own fields keep the order they were sent in.
      const platformCustom = (defaultContactColumns || []).filter(c => c.isCustom);
      let contactPosition = 0;
      const createdContactFields = [];

      for (const field of platformCustom) {
        const { rows: [row] } = await client.query(
          'INSERT INTO custom_fields (workspace_id, name, field_key, type, options, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, field_key, type, options',
          [ws.id, field.name || field.label || field.key, field.key, field.type || 'text', JSON.stringify(field.options || []), contactPosition++]
        );
        createdContactFields.push({ ...row, source: 'platform_default' });
      }

      for (const field of contactFields) {
        const { rows: [row] } = await client.query(
          'INSERT INTO custom_fields (workspace_id, name, field_key, type, options, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, field_key, type, options',
          [ws.id, field.name, field.field_key, field.type, JSON.stringify(field.options), contactPosition++]
        );
        createdContactFields.push({ ...row, source: 'request' });
      }

      const createdDealFields = [];
      for (let i = 0; i < dealFields.length; i++) {
        const field = dealFields[i];
        const { rows: [row] } = await client.query(
          'INSERT INTO deal_fields (workspace_id, name, field_key, type, options, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, field_key, type, options',
          [ws.id, field.name, field.field_key, field.type, JSON.stringify(field.options), i]
        );
        createdDealFields.push(row);
      }

      const createdPipelines = [];
      for (let p = 0; p < (defaultPipelines || []).length; p++) {
        const pipeline = defaultPipelines[p];
        const { rows: [row] } = await client.query(
          'INSERT INTO pipelines (workspace_id, name, position) VALUES ($1,$2,0) RETURNING id, name',
          [ws.id, pipeline.name]
        );
        const stages = [];
        for (let i = 0; i < (pipeline.stages || []).length; i++) {
          const stage = pipeline.stages[i];
          const { rows: [s] } = await client.query(
            'INSERT INTO pipeline_stages (workspace_id, pipeline_id, name, color, position) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, color',
            [ws.id, row.id, stage.name, stage.color, i]
          );
          stages.push(s);
        }
        createdPipelines.push({ ...row, stages });
      }

      const { rows: [owner] } = await client.query(
        'INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role',
        [ws.id, ownerName, email, passwordHash, 'owner']
      );
      await client.query(
        'INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [owner.id, ws.id, 'owner']
      );

      // The webhook's deal target: the first seeded pipeline and its first
      // stage. Set explicitly rather than relying on the receive route's
      // first-stage fallback, so the integration doc can name the stage.
      const targetPipeline = createDeal ? (createdPipelines[0] || null) : null;
      const targetStage    = targetPipeline ? (targetPipeline.stages[0] || null) : null;

      const fieldMap = { ...BUILTIN_MAP };
      for (const f of createdContactFields) fieldMap[f.field_key] = f.field_key;

      const webhookKey = crypto.randomBytes(20).toString('hex');
      await client.query(
        `INSERT INTO workspace_webhook
           (workspace_id, webhook_key, field_map, create_deal, pipeline_id, stage_id, default_assignee_id, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          ws.id,
          webhookKey,
          JSON.stringify(fieldMap),
          createDeal && !!targetPipeline,
          targetPipeline?.id || null,
          targetStage?.id || null,
          owner.id,                 // unassigned leads would otherwise have no owner
          webhookActive,
        ]
      );

      await client.query('COMMIT');

      result = {
        workspace: { id: ws.id, name: ws.name, provisioned_at: ws.provisioned_at },
        owner: {
          id:    owner.id,
          name:  owner.name,
          email: owner.email,
          role:  owner.role,
          existing_account: !!existingUser,
          // Shown exactly once — nothing is emailed and only the bcrypt hash is stored.
          password: generatedPassword,
          credentials_note: existingUser
            ? 'This email already had an account, so it keeps its existing password. No new credentials were issued — send them to the login page and they pick this workspace from the picker.'
            : 'Shown once only, and not recoverable: copy it before closing this response. The owner signs in with their email and this password.',
        },
        login_url: baseUrl(),
        pipelines: createdPipelines,
        custom_fields: { contact: createdContactFields, deal: createdDealFields },
        integration: buildIntegrationDoc({
          webhookKey,
          fieldMap,
          contactFields: createdContactFields,
          dealFields:    createdDealFields,
          createDeal:    createDeal && !!targetPipeline,
          pipeline:      targetPipeline,
          stage:         targetStage,
          active:        webhookActive,
        }),
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json(result);
  } catch (e) {
    // A duplicate field_key inside one workspace is the one error worth
    // translating: everything else is a genuine 500.
    if (e.code === '23505') {
      return res.status(400).json({ error: 'A field key collided with one the platform defaults already create. Choose different field_key values.' });
    }
    next(e);
  }
});

/**
 * GET /provision/list — every workspace with its owner and what it holds, newest
 * first. Feeds the "Provisioning" tab's table so an admin can see what has been
 * created without opening each tenant.
 *
 * `provisioned_at` separates tenants made by POST /provision from self-served
 * signups. It is NULL for every workspace that existed before the column, and
 * nothing is backfilled, so the UI shows those as "—" rather than guessing.
 *
 * The webhook key comes back so an admin can re-send a customer their
 * integration URL — the provisioning response is the only other place it
 * appears. The owner's PASSWORD is not here and cannot be: only its bcrypt hash
 * is ever stored.
 */
router.get('/provision/list', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.id,
             w.name,
             w.created_at,
             w.provisioned_at,
             o.name  AS owner_name,
             o.email AS owner_email,
             (SELECT COUNT(*)::int FROM users         u  WHERE u.workspace_id  = w.id) AS member_count,
             (SELECT COUNT(*)::int FROM custom_fields cf WHERE cf.workspace_id = w.id) AS contact_field_count,
             (SELECT COUNT(*)::int FROM deal_fields   df WHERE df.workspace_id = w.id) AS deal_field_count,
             (SELECT COUNT(*)::int FROM contacts      c  WHERE c.workspace_id  = w.id) AS contact_count,
             (SELECT COUNT(*)::int FROM deals         d  WHERE d.workspace_id  = w.id) AS deal_count,
             wh.webhook_key,
             wh.active AS webhook_active
      FROM workspaces w
      LEFT JOIN LATERAL (
        SELECT name, email FROM users
        WHERE workspace_id = w.id AND role = 'owner'
        ORDER BY id ASC LIMIT 1
      ) o ON TRUE
      LEFT JOIN workspace_webhook wh ON wh.workspace_id = w.id
      ORDER BY w.created_at DESC
    `);

    const base = baseUrl();
    res.json({
      base_url: base,
      workspaces: rows.map(r => ({
        ...r,
        provisioned:  !!r.provisioned_at,
        webhook_url:  r.webhook_key ? `${base}/api/integrations/receive/${r.webhook_key}` : null,
      })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
