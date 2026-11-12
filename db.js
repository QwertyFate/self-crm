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

  // Cal.com (utils/calcom.js, routes/integrations.js /calcom): ONE connection per workspace, the
  // sealed API key of a personal Cal.com account. receive_token names the public receiver for
  // Cal.com's booking webhooks and webhook_secret signs them (both minted at connect, kept across
  // reconnects); webhook_id is Cal.com's id for the webhook once it is registered. event_types is
  // the account's list as last fetched; event_type_id the one bookings from a deal use.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_calcom (
      id              SERIAL PRIMARY KEY,
      workspace_id    INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      api_key_sealed  TEXT NOT NULL,
      cal_user_id     INTEGER,
      cal_username    TEXT,
      cal_email       TEXT,
      cal_name        TEXT,
      cal_timezone    TEXT,
      event_types     JSONB NOT NULL DEFAULT '[]',
      event_type_id   INTEGER,
      receive_token   TEXT NOT NULL UNIQUE,
      webhook_secret  TEXT NOT NULL,
      webhook_id      TEXT,
      connected_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      connected_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      last_error      TEXT
    )
  `);
  // A Cal.com booking is an activity of type 'meeting' with source 'calcom': calcom_uid is the
  // booking's id (a reschedule or a cancellation finds its entry by it; one entry per booking per
  // workspace), cancelled_at marks a cancelled booking that stays visible until someone deletes it.
  // webhook_logs.source tells a Cal.com delivery from a lead.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS calcom_uid   TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS calcom_event_type_id INTEGER`);   // the booking's event type: a reschedule asks for its slots
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_calcom_uid ON activities (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL`);
  await pool.query(`ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'lead'`);

  // Calendly (utils/calendly.js, routes/calendly.js; CALENDLY_CHANGES Part 1): ONE connection per workspace,
  // the sealed personal access token of a Calendly account. A workspace has Cal.com or Calendly, never both
  // (each connect route refuses while the other is connected). Calendly names everything by URI: user_uri and
  // org_uri are the account and its organization, event_type_uri the event type bookings from a deal use, and
  // event_types the account's active list as last fetched. receive_token and webhook_secret are minted at
  // connect and kept across reconnects for the booking webhook; webhook_uri is Calendly's name for it once
  // it is registered (Part 2).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_calendly (
      id              SERIAL PRIMARY KEY,
      workspace_id    INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      token_sealed    TEXT NOT NULL,
      user_uri        TEXT NOT NULL,
      org_uri         TEXT,
      cly_name        TEXT,
      cly_email       TEXT,
      cly_slug        TEXT,
      cly_timezone    TEXT,
      scheduling_url  TEXT,
      event_types     JSONB NOT NULL DEFAULT '[]',
      event_type_uri  TEXT,
      receive_token   TEXT NOT NULL UNIQUE,
      webhook_secret  TEXT NOT NULL,
      webhook_uri     TEXT,
      connected_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      connected_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      last_error      TEXT
    )
  `);
  // A Calendly booking is an activity of type 'meeting' with source 'calendly' (CALENDLY_CHANGES Part 2):
  // calendly_uri is the INVITEE's URI, Calendly's name for one person's booking (a cancellation finds its entry by
  // it, a reschedule renames it to the new invitee; one entry per booking per workspace); calendly_event_uri is the
  // scheduled event, which a cancellation from the CRM will name. cancelled_at marks a cancelled booking, as for Cal.com.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS calendly_uri       TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS calendly_event_uri TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_calendly_uri ON activities (workspace_id, calendly_uri) WHERE calendly_uri IS NOT NULL`);

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
    await pool.query(`ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK(type IN ('note','call','email','whatsapp','meeting'))`);
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
    await pool.query(`ALTER TABLE activities ADD CONSTRAINT activities_source_check CHECK(source IN ('user','engine','calcom','notetaker','fonio','calendly'))`);
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

  // The break's team board (routes/break-scores.js, public/js/break-game.js): one row per person and
  // workspace, their best game. Client-reported, checked and capped by the route; the board shows the
  // ten best of the workspace's current members.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS break_scores (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
      score        INTEGER NOT NULL CHECK (score >= 0),
      lines        INTEGER NOT NULL DEFAULT 0,
      level        INTEGER NOT NULL DEFAULT 1,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    )
  `);

  // The Notetaker (routes/integrations.js, utils/notetaker.js): a meeting booked on Google Meet with
  // "Mit Notetaker aufzeichnen" ticked. One row per meeting: the request, then what was last sent to the
  // service (the link, the start with its offset) and what it answered (status, job id, HTTP status, error).
  // status: waiting_link (no Meet link yet) | scheduled | queued | updated | duplicate | failed.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notetaker_recordings (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      activity_id  INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      external_id  TEXT NOT NULL UNIQUE,
      language     TEXT NOT NULL DEFAULT 'de',
      meeting_url  TEXT,
      join_at      TEXT,
      status       TEXT NOT NULL DEFAULT 'waiting_link',
      job_id       TEXT,
      http_status  INTEGER,
      error        TEXT,
      sent_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // The way back (Part 2, routes/notetaker.js): the meeting's secret result link (sent as callback_url), the note
  // written from the result, and when the result came. finished_at set = the result was handled; a redelivery
  // writes nothing. Status after the result: completed | recording_failed.
  await pool.query(`ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS callback_token   TEXT UNIQUE`);
  await pool.query(`ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS note_activity_id INTEGER`);
  await pool.query(`ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS finished_at      TIMESTAMPTZ`);
  // The Notetaker's summary AI (NOTETAKER_AI_CHANGES Part 1, 2026-11-05): ONE per workspace, so only one can ever be
  // used. provider: the AI, by the Notetaker's name for it (below); its API key sealed like the Cal.com key (utils/calcom.js);
  // key_hint the key's last four characters, so an owner can tell which key is saved. Without a row a meeting's note is
  // its transcript; with one, the booking dialog offers a summary (sent to the Notetaker with the booking).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_notetaker_ai (
      id             SERIAL PRIMARY KEY,
      workspace_id   INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      provider       TEXT NOT NULL,
      api_key_sealed TEXT NOT NULL,
      key_hint       TEXT,
      saved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      saved_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Synced with the Notetaker's booking field llm { provider, api_key, model } (Part 2): provider is its name for the AI
  // (claude | openai | gemini | deepseek); model is optional, NULL = the Notetaker's own default for that AI.
  await pool.query(`ALTER TABLE workspace_notetaker_ai ADD COLUMN IF NOT EXISTS model TEXT`);
  // The booking dialog's summary box (Part 6): ticked, the meeting asks for a summary by the saved AI; false (the
  // default, and every row from before) means the note is the transcript.
  await pool.query(`ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS summary BOOLEAN NOT NULL DEFAULT false`);
  // fonio.ai (FONIO_CHANGES Part 1, 2026-11-06; routes/fonio.js, utils/fonio.js): ONE connection per workspace. fonio
  // calls a new deal's contact delay_minutes after the deal is created — by hand (on_deal_manual) and/or through the
  // lead link (on_deal_webhook) — while active is on. api_key_sealed under the Cal.com sealing, key_hint its last four;
  // from_number the company's fonio number (+E.164), which picks the fonio assistant. A contact's number is made
  // international with country_code (a leading 0) and called only when it starts with one of number_prefixes ([] = any).
  // With hours_on, calls go out only on hours_days (1 = Monday … 7 = Sunday) from hours_from to hours_to, in hours_tz —
  // the zone of whoever last saved the hours (users.timezone), as for tasks and activities.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_fonio (
      id               SERIAL PRIMARY KEY,
      workspace_id     INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      api_key_sealed   TEXT NOT NULL,
      key_hint         TEXT,
      from_number      TEXT NOT NULL,
      active           BOOLEAN NOT NULL DEFAULT false,
      delay_minutes    INTEGER NOT NULL DEFAULT 5,
      on_deal_manual   BOOLEAN NOT NULL DEFAULT true,
      on_deal_webhook  BOOLEAN NOT NULL DEFAULT true,
      country_code     TEXT NOT NULL DEFAULT '+49',
      number_prefixes  JSONB NOT NULL DEFAULT '[]',
      hours_on         BOOLEAN NOT NULL DEFAULT true,
      hours_days       JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
      hours_from       TIME NOT NULL DEFAULT '09:00',
      hours_to         TIME NOT NULL DEFAULT '18:00',
      hours_tz         TEXT NOT NULL DEFAULT 'Europe/Berlin',
      saved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      saved_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // fonio's calls (FONIO_CHANGES Parts 3–5; utils/fonio-calls.js): the queue AND the history, one row per call.
  // trigger: deal_manual | deal_webhook. status: scheduled (waiting for due_at) → sending → sent | failed; or
  // skipped (never callable: reason no_contact, no_phone, bad_number, number_not_allowed, already_scheduled) or
  // cancelled (reason inactive, disconnected, by_user). raw_number is the contact's number as saved, to_number as
  // called; message is fonio's own answer. A row stuck in 'sending' (the process died mid-request) becomes failed
  // 'interrupted' and is never sent again: fonio may already be ringing.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fonio_calls (
      id            SERIAL PRIMARY KEY,
      workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      deal_id       INTEGER REFERENCES deals(id)    ON DELETE SET NULL,
      contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      trigger       TEXT NOT NULL CHECK (trigger IN ('deal_manual','deal_webhook')),
      status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sending','sent','failed','skipped','cancelled')),
      reason        TEXT,
      raw_number    TEXT,
      to_number     TEXT,
      message       TEXT,
      due_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at       TIMESTAMPTZ,
      attempts      INTEGER NOT NULL DEFAULT 0,
      cancelled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fonio_calls_due_idx ON fonio_calls (due_at) WHERE status = 'scheduled'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS fonio_calls_ws_idx ON fonio_calls (workspace_id, created_at DESC)`);
  // One waiting call per contact, even when two new deals for the same contact are scheduled at the same moment.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS fonio_calls_one_waiting ON fonio_calls (contact_id) WHERE status IN ('scheduled','sending')`);
  // fonio's result after a call (FONIO_CHANGES Part 7, 2026-11-09; routes/fonio.js /receive, utils/fonio-result.js).
  // receive_token names the workspace's public result link, filled for every row (old ones too) by the volatile
  // default: 64 hex characters from two random UUIDs. last_delivery is what the link last got: when, what came of it,
  // the body's field names (never the values). On a call: result_at when fonio's result arrived (one per call),
  // conversation_id / conversation_link fonio's own, note_activity_id the note it became. The unique index keeps one
  // conversation from becoming two notes, even when two deliveries of it are matched to different calls.
  await pool.query(`ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS receive_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`);
  await pool.query(`ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS last_delivery JSONB`);
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS result_at         TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS conversation_id   TEXT`);
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS conversation_link TEXT`);
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS note_activity_id  INTEGER REFERENCES activities(id) ON DELETE SET NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS fonio_calls_one_conversation ON fonio_calls (workspace_id, conversation_id) WHERE conversation_id IS NOT NULL`);
  // The workspace's own variables for the assistant's prompt in fonio (FONIO_CHANGES Part 13, 2026-11-10;
  // utils/fonio-calls.js checkVariables): [{ name, source }], each sent with every call as name → the source's value.
  await pool.query(`ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '[]'::jsonb`);
  // Conversations the CRM did not start (FONIO_CHANGES Part 15, 2026-11-11; utils/fonio-calls.js saveOther): an
  // incoming call, or an outgoing one that fits no row of fonio_calls. number is the person's (+E.164, NULL when
  // hidden), caller_name what fonio's Body gave as caller_name. contact_id is the contact with that number, deal_id
  // that contact's deal when it has exactly one; the note (note_activity_id) is on the contact, and on that deal.
  // Without a contact nothing is noted, so the row keeps the transcript itself until a contact is made from it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fonio_other_calls (
      id                SERIAL PRIMARY KEY,
      workspace_id      INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      direction         TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
      number            TEXT,
      caller_name       TEXT,
      contact_id        INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      deal_id           INTEGER REFERENCES deals(id)    ON DELETE SET NULL,
      conversation_id   TEXT,
      conversation_link TEXT,
      duration          TEXT,
      summary           TEXT,
      transcript        TEXT,
      note_activity_id  INTEGER REFERENCES activities(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fonio_other_calls_ws_idx ON fonio_other_calls (workspace_id, created_at DESC)`);
  // A call's technical record for owners and admins (FONIO_CHANGES Part 18, 2026-11-11): request is what the CRM sent
  // to fonio's outbound_call (the key replaced), response fonio's answer (HTTP status and body), result_body the Body
  // fonio sent after the call. NULL for calls from before.
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS request     JSONB`);
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS response    JSONB`);
  await pool.query(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS result_body JSONB`);
  await pool.query(`ALTER TABLE fonio_other_calls ADD COLUMN IF NOT EXISTS result_body JSONB`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS fonio_other_calls_one_conversation ON fonio_other_calls (workspace_id, conversation_id) WHERE conversation_id IS NOT NULL`);
  // The master CRM (MASTER_ACCESS_CHANGES Part 1, 2026-11-09; utils/master.js): one row per visit of a workspace
  // through the admin secret — the workspace, the owner row the visit acted as, when it began and ended, and from
  // where. The names are copied so a row outlives a deleted workspace or user (hence SET NULL, not CASCADE).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_access_log (
      id              SERIAL PRIMARY KEY,
      workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      workspace_name  TEXT,
      user_name       TEXT,
      entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at         TIMESTAMPTZ,
      ip              TEXT,
      user_agent      TEXT
    )
  `);
  // Email sync is on hold (2026-10-27): its table is NOT created, so no database (production included) gets it
  // until the feature is built. The definition stays here, commented; remove the /* */ to create it again
  // (with EMAIL_SYNC_ON in server.js and MAILBOX_SHOWN in public/js/mailbox.js).
  /*
  // Email (routes/mailbox.js, utils/gmail.js; EMAIL_SYNC_CHANGES Part 1): ONE connected mailbox per person per
  // workspace. The connection only, never the mail itself: the emails read from it get a table of their own,
  // removed together with the mailbox. provider is 'google' for now; refresh_token_sealed is Google's refresh
  // token under the Cal.com sealing (utils/calcom.js); scopes is what Google granted, space-separated.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id                   SERIAL PRIMARY KEY,
      workspace_id         INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider             TEXT NOT NULL,
      email_address        TEXT NOT NULL,
      refresh_token_sealed TEXT NOT NULL,
      scopes               TEXT,
      connected_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      last_error           TEXT,
      UNIQUE (workspace_id, user_id)
    )
  `);
  */

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
