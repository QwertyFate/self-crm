/* ═══════════════════════════════════════════════════════════════════════════
   DATABASE — the connection pool, the schema, and the migration system.

   THERE IS NO MIGRATION TOOL. initDb() runs on every boot and is the whole
   story. It is idempotent: CREATE TABLE IF NOT EXISTS for the base schema,
   then a long list of ALTER TABLE ... ADD COLUMN IF NOT EXISTS for everything
   added since. Nothing is ever backfilled.

   HOW TO CHANGE THE SCHEMA
     new column      append one ALTER TABLE ... ADD COLUMN IF NOT EXISTS at the
                     END of initDb(), nullable or with a default.
     new table       add it to SCHEMA (or as its own CREATE TABLE IF NOT EXISTS
                     inside initDb() when it must run after another one), with
                     workspace_id INTEGER NOT NULL REFERENCES workspaces(id)
                     ON DELETE CASCADE.
     changed CHECK   DROP CONSTRAINT IF EXISTS then ADD CONSTRAINT, inside a
                     try/catch that rethrows anything but error code 42710.
     NEVER edit a statement that already shipped — live databases have run it.
     Add a new one instead.
   A new column exists only AFTER A RESTART. That is the usual reason a new
   field "doesn't save" right after a change.

   TENANCY  almost every table has workspace_id with ON DELETE CASCADE, and
   every query in routes/ filters on it. The exceptions are deliberate:
   platform_invites and platform_settings are platform-wide, and password_resets
   hangs off a user.

   TWO THINGS THAT LOOK LIKE BUGS AND ARE NOT
     - the `stages` table and contacts.stage_id are DEAD. Contact stages were
       removed from the product; both are kept so old rows survive. Nothing
       reads them.
     - users.workspace_id is the user's single home workspace. Membership and
       authorisation live in user_workspaces; a person in three workspaces has
       three users rows sharing an email. The backfill INSERT near the bottom
       copies users.role into user_workspaces on every boot.

   ALSO HERE
     seedDefaultPipeline()  the pipeline + stages every new workspace gets,
                            overridable per platform via the admin console
                            (platform_settings.default_stages).
     first-run invite       with no workspaces and no platform invites, boot
                            prints a one-time platform invite code so the very
                            first account can be created.
   ═══════════════════════════════════════════════════════════════════════════ */

const { Pool } = require('pg');
const crypto   = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    kanban_fields JSONB NOT NULL DEFAULT '["company","email"]',
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, email)
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    code         TEXT NOT NULL UNIQUE,
    used         INTEGER NOT NULL DEFAULT 0,
    used_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );

  -- Contact stages were removed from the product (Part 19): nothing reads or writes this
  -- table or contacts.stage_id any more. Both are left in place so existing rows are not
  -- destroyed; drop them with a migration if you decide the old values are not worth keeping.
  CREATE TABLE IF NOT EXISTS stages (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#4f6ef7',
    position     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS custom_fields (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    field_key    TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'text',
    options      JSONB NOT NULL DEFAULT '[]',
    position     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(workspace_id, field_key)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    email        TEXT,
    phone        TEXT,
    company      TEXT,
    stage_id     INTEGER REFERENCES stages(id) ON DELETE SET NULL,
    assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    custom_data  JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS pipelines (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS pipeline_stages (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    pipeline_id  INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#4f6ef7',
    position     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(pipeline_id, name)
  );

  CREATE TABLE IF NOT EXISTS deal_fields (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    field_key    TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'text',
    options      JSONB NOT NULL DEFAULT '[]',
    position     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(workspace_id, field_key)
  );

  CREATE TABLE IF NOT EXISTS deals (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    pipeline_id  INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    stage_id     INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    value        NUMERIC,
    custom_data  JSONB NOT NULL DEFAULT '{}',
    assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS activities (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id   INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    type         TEXT NOT NULL CHECK(type IN ('note','call','email')),
    content      TEXT NOT NULL,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS platform_invites (
    id                   SERIAL PRIMARY KEY,
    code                 TEXT NOT NULL UNIQUE,
    used                 INTEGER NOT NULL DEFAULT 0,
    used_by_workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS platform_settings (
    id                SERIAL PRIMARY KEY,
    key               TEXT NOT NULL UNIQUE,
    value             JSONB NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  );
`;




async function initDb() {
  await pool.query(SCHEMA);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS contact_columns   JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deal_kanban_fields JSONB NOT NULL DEFAULT '["contact","value"]'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS column_widths JSONB NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deal_columns  JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS whatsapp_template TEXT NOT NULL DEFAULT 'Hi {{name}}, '`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS miro_url TEXT`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS object_name    TEXT NOT NULL DEFAULT 'Listings'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS object_columns JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS supplier_name   TEXT NOT NULL DEFAULT 'Suppliers'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{"contacts":true,"deals":true,"tasks":true,"objects":true,"activities":true}'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Berlin'`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_date DATE`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT false`);
  // A scheduled activity may also carry a time of day, which is what lets the Calendar's week
  // view place it on an hour grid. Nullable on purpose: an activity with a date and no time is
  // an all-day entry, and every activity that existed before this column is exactly that.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_time TIME`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_activities_event_date ON activities (workspace_id, event_date)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS analytics_layout JSONB NOT NULL DEFAULT '{}'`);
  // Workspace roles: invite codes carry the role the joiner will receive (member or admin).
  await pool.query(`ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`);
  try {
    await pool.query(`ALTER TABLE invite_codes DROP CONSTRAINT IF EXISTS invite_codes_role_check`);
    await pool.query(`ALTER TABLE invite_codes ADD CONSTRAINT invite_codes_role_check CHECK(role IN ('member','admin'))`);
  } catch (e) {
    if (e.code !== '42710') throw e;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
      actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type         TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'general',
      title        TEXT NOT NULL,
      body         TEXT,
      entity_type  TEXT,
      entity_id    INTEGER,
      read         BOOLEAN NOT NULL DEFAULT false,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS analytics_config JSONB NOT NULL DEFAULT '{"won_stage_ids":[],"lost_stage_ids":[]}'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS task_statuses  JSONB NOT NULL DEFAULT '[{"key":"todo","label":"Todo","color":"#94a3b8"},{"key":"in_progress","label":"In Progress","color":"#3b82f6"},{"key":"in_review","label":"In Review","color":"#f59e0b"},{"key":"done","label":"Done","color":"#22c55e"}]'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_fields (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      field_key    TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'text',
      options      JSONB NOT NULL DEFAULT '[]',
      position     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, field_key)
    )
  `);
  await pool.query(`ALTER TABLE contacts   ADD COLUMN IF NOT EXISTS contact_type   TEXT NOT NULL DEFAULT 'contact'`);
  await pool.query(`ALTER TABLE deals      ADD COLUMN IF NOT EXISTS supplier_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE deals      ADD COLUMN IF NOT EXISTS urgency        INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS objects (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      custom_data  JSONB NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS object_contacts (
      object_id  INTEGER NOT NULL REFERENCES objects(id)  ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (object_id, contact_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS object_fields (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      field_key    TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'text',
      options      JSONB NOT NULL DEFAULT '[]',
      position     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, field_key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deal_objects (
      deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      object_id  INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (deal_id, object_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      parent_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'todo',
      priority     TEXT NOT NULL DEFAULT 'medium',
      assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_date     DATE,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      custom_data  JSONB NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_projects (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      color        TEXT NOT NULL DEFAULT '#3b82f6',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_lists (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id   INTEGER NOT NULL REFERENCES task_projects(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_project_statuses (
      id         SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES task_projects(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      label      TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#94a3b8',
      position   INTEGER NOT NULL DEFAULT 0,
      UNIQUE(project_id, key)
    )
  `);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES task_projects(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS list_id    INTEGER REFERENCES task_lists(id)    ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deal_id    INTEGER REFERENCES deals(id)    ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL`);
  // A task may also be due at a time, not just on a day; that is what puts it on the
  // calendar's hour grid rather than its all-day strip. Nullable: a task without a time
  // is still a whole-day task, which is what every task before this column was.
  await pool.query(`ALTER TABLE tasks      ADD COLUMN IF NOT EXISTS due_time   TIME`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id           SERIAL PRIMARY KEY,
      task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      file_name    TEXT NOT NULL,
      file_size    INTEGER NOT NULL,
      file_type    TEXT NOT NULL DEFAULT '',
      file_url     TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_webhook (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      webhook_key  TEXT NOT NULL UNIQUE,
      field_map    JSONB NOT NULL DEFAULT '{"name":"full_name","email":"email","phone":"phone_number","company":"company"}',
      create_deal  BOOLEAN NOT NULL DEFAULT false,
      pipeline_id  INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
      stage_id     INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
      default_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      active       BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id             SERIAL PRIMARY KEY,
      workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      status         TEXT NOT NULL DEFAULT 'success',
      payload        JSONB,
      contact_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      deal_id        INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      error          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS captured JSONB NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE workspace_webhook ADD COLUMN IF NOT EXISTS default_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_workspaces (
      user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      role         TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
      joined_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, workspace_id)
    )
  `);
  // Widen the role CHECKs on existing databases to allow 'admin'. Must run before the
  // backfill below, which copies users.role into user_workspaces on every boot.
  try {
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('owner','admin','member'))`);
    await pool.query(`ALTER TABLE user_workspaces DROP CONSTRAINT IF EXISTS user_workspaces_role_check`);
    await pool.query(`ALTER TABLE user_workspaces ADD CONSTRAINT user_workspaces_role_check CHECK(role IN ('owner','admin','member'))`);
  } catch (e) {
    if (e.code !== '42710') throw e;
  }
  await pool.query(`
    INSERT INTO user_workspaces (user_id, workspace_id, role)
    SELECT id, workspace_id, role FROM users
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
      content      TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, workspace_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_comments (
      id           SERIAL PRIMARY KEY,
      activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      parent_id    INTEGER REFERENCES activity_comments(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      content      TEXT NOT NULL,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    await pool.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check`);
    await pool.query(`ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK(type IN ('note','call','email','whatsapp'))`);
  } catch (e) {
    if (e.code !== '42710') throw e;
  }

  // Upgrads Engine: per-workspace outgoing webhook settings and the delivery log (utils/engine.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_engine (
      id                SERIAL PRIMARY KEY,
      workspace_id      INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      engine_url        TEXT,
      active            BOOLEAN NOT NULL DEFAULT false,
      trigger_stage_ids JSONB NOT NULL DEFAULT '[]',
      webhook_secret    TEXT NOT NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_deliveries (
      id               SERIAL PRIMARY KEY,
      workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      event            TEXT NOT NULL,
      event_id         TEXT NOT NULL UNIQUE,
      deal_id          INTEGER REFERENCES deals(id)    ON DELETE SET NULL,
      contact_id       INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      url              TEXT NOT NULL,
      payload          JSONB NOT NULL,
      raw_body         TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','failed')),
      attempts         INTEGER NOT NULL DEFAULT 0,
      last_status_code INTEGER,
      last_error       TEXT,
      next_attempt_at  TIMESTAMPTZ,
      delivered_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS engine_deliveries_ws_created_idx ON engine_deliveries (workspace_id, created_at DESC)`);
  // Retry worker (utils/engine.js, briefing §5.1 "at least five attempts … ~24 hours"):
  // when the last attempt ran, and a partial index over the rows the worker polls
  // (pending, ordered by their due time). Additive; nothing is backfilled.
  await pool.query(`ALTER TABLE engine_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ`);
  await pool.query(`CREATE INDEX IF NOT EXISTS engine_deliveries_due_idx ON engine_deliveries (next_attempt_at) WHERE status = 'pending'`);

  // Marks a workspace created by POST /api/admin/provision, so the admin console
  // can tell a provisioned tenant from a self-served signup. NULL for every row
  // that existed before this column — nothing is backfilled, and "unknown" is the
  // honest answer for those.
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ`);

  // The timezone a task's due_time / an activity's event_time was ENTERED in, stamped by the
  // server from users.timezone (middleware/auth.js → req.userTimezone). due_date/due_time are
  // naive wall-clock values; with the zone beside them the row is an unambiguous instant and
  // the client shows it on each viewer's own clock. NULL = written before this column, read
  // as the default zone (Europe/Berlin) — nothing is backfilled.
  await pool.query(`ALTER TABLE tasks      ADD COLUMN IF NOT EXISTS due_tz   TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_tz TEXT`);

  // The deal a note was composed ON. NULL = a contact-level note (everything written before this
  // column, and notes logged from the contact page), which still shows on every deal of its
  // contact; a bound note shows only on its deal. ON DELETE SET NULL: deleting the deal unbinds
  // the note, it never deletes it.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS deal_id  INTEGER REFERENCES deals(id) ON DELETE SET NULL`);

  // ---------------------------------------------------------------------------
  // Onboarding Engine — client record fields and API tables (Developer Briefing
  // §5.3 status values, §5.4 linkage fields, §5.2 master data, §8 idempotency).
  // Everything here is additive (IF NOT EXISTS), so an existing database keeps
  // every row and this block is safe to re-run. Contact master-data columns
  // carry German names because they are the Engine's field names; the engine
  // tables use English like the rest of the schema.
  // ---------------------------------------------------------------------------
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS onboarding_status     TEXT NOT NULL DEFAULT 'kein_onboarding'`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS drive_ordner_id       TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS akte_version          INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rechtsform            TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ust_id                TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS handelsregisternummer TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS webseite              TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS quelle                TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strasse               TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS plz                   TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ort                   TEXT`);
  // Re-declared the same way as activities_type_check so the list can grow.
  // Existing rows already hold the default, so validation passes on a populated table.
  try {
    await pool.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_onboarding_status_check`);
    await pool.query(`ALTER TABLE contacts ADD CONSTRAINT contacts_onboarding_status_check CHECK(onboarding_status IN (
      'kein_onboarding','formular_versendet','formular_ausgefuellt','termin_gebucht',
      'call_erfolgt','briefing_fertig','onboarding_abgeschlossen'))`);
  } catch (e) {
    if (e.code !== '42710') throw e;
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_onboarding_status ON contacts (workspace_id, onboarding_status)`);

  // Engine API authentication (middleware/engine-auth.js). The plain key is shown
  // once at creation and only its SHA-256 hash is stored; key_prefix (first
  // characters) is for display in the Integrations card.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      key_prefix   TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      scopes       JSONB NOT NULL DEFAULT '[]',
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      last_used_at TIMESTAMPTZ,
      expires_at   TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Request idempotency for the Engine's write endpoints (utils/idempotency.js):
  // the same (workspace, Idempotency-Key) replays the stored response for 24 h.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id              SERIAL PRIMARY KEY,
      workspace_id    INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      key             TEXT NOT NULL,
      request_hash    TEXT NOT NULL,
      response_status INTEGER,
      response_body   JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      UNIQUE (workspace_id, key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys (expires_at)`);

  // Documents on a CUSTOMER (briefing §5.2 "dokumente", §5.1 dokument.hinzugefuegt):
  // contracts, call recordings, anything else — stored in a PRIVATE Supabase bucket
  // (storage.js) and reached only through time-limited signed URLs. deal_id links a
  // contract to the deal it belongs to (ON DELETE SET NULL keeps the file).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_documents (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      contact_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      deal_id      INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      typ          TEXT NOT NULL DEFAULT 'sonstiges' CHECK(typ IN ('vertrag','aufnahme','sonstiges')),
      file_name    TEXT NOT NULL,
      file_size    INTEGER NOT NULL,
      file_type    TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL,
      uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS contact_documents_contact_idx ON contact_documents (workspace_id, contact_id, created_at DESC)`);

  // Who wrote an activity: a user ('user', created_by set) or the Upgrads Engine
  // ('engine', created_by NULL — POST /api/kunden/:id/notizen and the conflict
  // notes of PATCH /api/kunden/:id). Rows from before this column are users'.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'`);
  try {
    await pool.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_source_check`);
    await pool.query(`ALTER TABLE activities ADD CONSTRAINT activities_source_check CHECK(source IN ('user','engine'))`);
  } catch (e) {
    if (e.code !== '42710') throw e;
  }

  // Request log of the Engine API (middleware/engine-request-log.js): one row per call
  // to /api/kunden and /api/dokumente — who (workspace, key), what (method, path), how
  // it went (status, fehler code, duration). No bodies. Read by the admin console's
  // Engine Monitor; rows older than 30 days are pruned when the monitor is opened.
  // workspace_id / api_key_id are NULL for calls that never authenticated.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_api_requests (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      api_key_id   INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
      method       TEXT NOT NULL,
      path         TEXT NOT NULL,
      status       INTEGER NOT NULL,
      duration_ms  INTEGER,
      fehler_code  TEXT,
      ip           TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS engine_api_requests_created_idx ON engine_api_requests (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS engine_api_requests_ws_idx ON engine_api_requests (workspace_id, created_at DESC)`);

  const { rows: [{ n: wsCount }] } = await pool.query('SELECT COUNT(*)::int AS n FROM workspaces');
  const { rows: [{ n: piCount }] } = await pool.query('SELECT COUNT(*)::int AS n FROM platform_invites');
  if (wsCount === 0 && piCount === 0) {
    const code = crypto.randomBytes(16).toString('hex');
    await pool.query('INSERT INTO platform_invites (code) VALUES ($1)', [code]);
    const bar = '─'.repeat(44);
    console.log(`\n┌${bar}┐`);
    console.log(`│  🚀  First-run platform invite code:         │`);
    console.log(`│  ${code}  │`);
    console.log(`│  Use this once to create the first workspace.│`);
    console.log(`└${bar}┘\n`);
  }
}

const DEFAULT_PIPELINE_STAGES = [
  ['New',         '#6b7280', 0],
  ['Contacted',   '#3b82f6', 1],
  ['Proposal',    '#f59e0b', 2],
  ['Negotiation', '#8b5cf6', 3],
  ['Won',         '#22c55e', 4],
  ['Lost',        '#ef4444', 5],
];

async function getAdminDefaultPipelineStages(client) {
  try {
    const { rows: [saved] } = await client.query('SELECT value FROM platform_settings WHERE key=$1', ['default_stages']);
    if (saved && saved.value?.dealStages) {
      return saved.value.dealStages;
    }
  } catch (e) {
  }
  return DEFAULT_PIPELINE_STAGES.map(([name, color, pos]) => ({ name, color, position: pos }));
}

async function getAdminPipelineName(client) {
  try {
    const { rows: [saved] } = await client.query('SELECT value FROM platform_settings WHERE key=$1', ['default_stages']);
    if (saved && saved.value?.pipelineName) {
      return saved.value.pipelineName;
    }
  } catch (e) {
  }
  return 'Sales Pipeline';
}

async function seedDefaultPipeline(workspaceId, client) {
  const pipelineName = await getAdminPipelineName(client);
  const { rows: [p] } = await client.query(
    'INSERT INTO pipelines (workspace_id, name, position) VALUES ($1,$2,0) RETURNING id',
    [workspaceId, pipelineName]
  );
  const stages = await getAdminDefaultPipelineStages(client);
  for (const stage of stages) {
    await client.query(
      'INSERT INTO pipeline_stages (workspace_id, pipeline_id, name, color, position) VALUES ($1,$2,$3,$4,$5)',
      [workspaceId, p.id, stage.name, stage.color, stage.position || 0]
    );
  }
}

module.exports = { pool, initDb, seedDefaultPipeline };
