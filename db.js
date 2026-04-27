const Database = require('better-sqlite3');
const crypto   = require('crypto');
const path     = require('path');

const db = new Database(path.join(__dirname, 'crm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kanban_fields TEXT NOT NULL DEFAULT '["company","email"]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    used INTEGER NOT NULL DEFAULT 0,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4f6ef7',
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE(workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    field_key TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    options TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE(workspace_id, field_key)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    stage_id INTEGER REFERENCES stages(id) ON DELETE SET NULL,
    custom_data TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('note','call','email')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Platform invite codes (controls who can create new workspaces)
db.exec(`
  CREATE TABLE IF NOT EXISTS platform_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    used INTEGER NOT NULL DEFAULT 0,
    used_by_workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: password_resets table
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: add assigned_to to contacts if not present
const contactCols = db.prepare('PRAGMA table_info(contacts)').all();
if (!contactCols.find(c => c.name === 'assigned_to')) {
  db.exec('ALTER TABLE contacts ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL');
}

// Migration: add created_by to activities if not present
const actCols = db.prepare('PRAGMA table_info(activities)').all();
if (!actCols.find(c => c.name === 'created_by')) {
  db.exec('ALTER TABLE activities ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
}

const DEFAULT_STAGES = [
  ['Lead', '#6b7280', 0],
  ['Qualified', '#3b82f6', 1],
  ['Proposal', '#f59e0b', 2],
  ['Negotiation', '#8b5cf6', 3],
  ['Won', '#22c55e', 4],
  ['Lost', '#ef4444', 5],
];

function seedDefaultStages(workspaceId) {
  const insert = db.prepare('INSERT INTO stages (workspace_id, name, color, position) VALUES (?, ?, ?, ?)');
  for (const [name, color, pos] of DEFAULT_STAGES) insert.run(workspaceId, name, color, pos);
}

// Auto-generate the first platform invite on a fresh database so the admin
// can sign up without needing an out-of-band code.
{
  const wsCount = db.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n;
  const piCount = db.prepare('SELECT COUNT(*) AS n FROM platform_invites').get().n;
  if (wsCount === 0 && piCount === 0) {
    const code = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO platform_invites (code) VALUES (?)').run(code);
    const bar = '─'.repeat(44);
    console.log(`\n┌${bar}┐`);
    console.log(`│  🚀  First-run platform invite code:         │`);
    console.log(`│  ${code}  │`);
    console.log(`│  Use this once to create the first workspace.│`);
    console.log(`└${bar}┘\n`);
  }
}

module.exports = { db, seedDefaultStages };
