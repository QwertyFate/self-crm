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
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    created_at    TIMESTAMPTZ DEFAULT NOW()
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
`;

const DEFAULT_STAGES = [
  ['Lead',        '#6b7280', 0],
  ['Qualified',   '#3b82f6', 1],
  ['Proposal',    '#f59e0b', 2],
  ['Negotiation', '#8b5cf6', 3],
  ['Won',         '#22c55e', 4],
  ['Lost',        '#ef4444', 5],
];

async function seedDefaultStages(workspaceId, client) {
  for (const [name, color, pos] of DEFAULT_STAGES) {
    await client.query(
      'INSERT INTO stages (workspace_id, name, color, position) VALUES ($1,$2,$3,$4)',
      [workspaceId, name, color, pos]
    );
  }
}

async function initDb() {
  await pool.query(SCHEMA);
  // Safe migrations for new columns on existing databases
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS contact_columns   JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deal_kanban_fields JSONB NOT NULL DEFAULT '["contact","value"]'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS column_widths JSONB NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deal_columns  JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS whatsapp_template TEXT NOT NULL DEFAULT 'Hi {{name}}, '`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS miro_url TEXT`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS object_name    TEXT NOT NULL DEFAULT 'Listings'`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS object_columns JSONB NOT NULL DEFAULT '[]'`);
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
  // Allow whatsapp as an activity type
  await pool.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check`);
  await pool.query(`ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK(type IN ('note','call','email','whatsapp'))`);

  // Print a first-run platform invite code if the database is empty
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

async function seedDefaultPipeline(workspaceId, client) {
  const { rows: [p] } = await client.query(
    'INSERT INTO pipelines (workspace_id, name, position) VALUES ($1,$2,0) RETURNING id',
    [workspaceId, 'Sales Pipeline']
  );
  for (const [name, color, pos] of DEFAULT_PIPELINE_STAGES) {
    await client.query(
      'INSERT INTO pipeline_stages (workspace_id, pipeline_id, name, color, position) VALUES ($1,$2,$3,$4,$5)',
      [workspaceId, p.id, name, color, pos]
    );
  }
}

module.exports = { pool, initDb, seedDefaultStages, seedDefaultPipeline };
