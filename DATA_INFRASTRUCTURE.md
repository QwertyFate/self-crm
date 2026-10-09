# Data infrastructure

How this CRM stores and moves data. Written 2026-10-05 by reading the code, not from memory —
every claim below is checkable in the file named beside it.

---

## 1. The stack

| Layer | What it is | Where |
|---|---|---|
| Database | **PostgreSQL**, one `pg` connection pool | `db.js` |
| Server | Express + `express-session` (sessions stored **in Postgres** via `connect-pg-simple`) | `server.js` |
| Realtime | **socket.io**, rooms per workspace (`ws-<id>`) for chat and presence | `server.js:146-201` |
| File storage | **Supabase Storage**, bucket `task-attachments` (task attachments only) | `storage.js` |
| Email | **nodemailer** (SMTP), password resets and invites | `utils/mailer.js` |
| Outbound | HTTP deliveries to a per-workspace "engine" URL, with retries | `utils/engine.js`, `routes/engine.js` |
| Client | Vanilla JS, no build step: 17 classic `<script>` files sharing globals | `public/js/*.js` |
| Tests | `node:test`, no database needed — a fake pool is injected | `tests/` (34 files) |

There is **one** database connection, created once and exported:

```js
// db.js
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: … });
module.exports = { pool, initDb, seedDefaultPipeline };
```

Every route imports that same `pool`. There is no ORM, no query builder, and no repository
layer — routes write SQL directly.

---

## 2. How a request reaches the data

```
browser  →  api.get/post/put/patch/del        public/js/core.js
         →  express route                     routes/<thing>.js
         →  requireAuth                       middleware/auth.js
         →  pool.query(sql, params)           db.js
         →  PostgreSQL
```

`middleware/auth.js` is the gate, and it does the multi-tenancy work. On every request it
re-checks the session's user against `user_workspaces` and, only if that membership exists,
sets three things the routes rely on:

```js
req.userId      = req.session.userId;
req.workspaceId = membership.workspace_id;   // ← every query filters on this
req.userRole    = membership.role;           // 'owner' | 'admin' | 'member'
```

If the membership is gone, the session is destroyed and the request 401s. A route therefore
never trusts a workspace id from the client — it uses `req.workspaceId`.

**Parameters are always bound** (`$1`, `$2`, …), never interpolated. The one place a value is
spliced into SQL is the analytics value/field name, and that is matched against the
workspace's own `deal_fields` first — see `safeValueField` in `routes/analytics.js:20`, which
exists because a JSONB key cannot be a bind parameter.

---

## 3. Multi-tenancy

Almost every table carries `workspace_id` and every query filters on it.

- `user_workspaces (user_id, workspace_id, role)` is the join table — **a user can belong to
  several workspaces**, and the session's `workspaceId` picks which one is active.
- `users.workspace_id` still exists (the original home workspace) but membership is what
  authorises.
- Per-user rather than per-workspace: `notifications` (filtered by `user_id`),
  `chat_reads`, `password_resets`, and the user-preference columns on `users`.
- Deliberately cross-workspace: `platform_invites`, `platform_settings`, and `routes/platform.js`
  / `routes/admin.js`, which are the platform-operator surface.

Audited 2026-10-05: of 24 route files, 18 mention `workspace_id` directly. The other six are
not holes — `fields.js`, `deal-fields.js`, `object-fields.js` and `task-fields.js` are
one-liners delegating to `middleware/field-crud.js` (which filters by `req.workspaceId`),
`notifications.js` filters by `user_id`, and `platform.js` is cross-workspace by design.

---

## 4. Migrations

There is no migration tool and no versioned migration files. `initDb()` in `db.js` runs at
every server boot and is **idempotent**:

1. One `SCHEMA` string of `CREATE TABLE IF NOT EXISTS` statements (33 tables).
2. Then ~28 `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` lines for everything added since.

```js
await pool.query(SCHEMA);
await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TIME`);
```

**Consequences worth knowing:**

- Adding a column means appending one `ALTER` line. Existing rows get `NULL` or the stated
  default; nothing is backfilled unless you write that separately.
- **A new column only exists after a server restart.** That is the usual reason a new field
  "doesn't save" right after a change.
- Nothing is ever dropped or renamed automatically. Removing a feature leaves its columns in
  place unless you write a migration by hand — e.g. the `stages` table and `contacts.stage_id`
  are kept, with a comment, after contact stages were removed from the product.
- Column order in the live table reflects when each was added, not the order in `SCHEMA`.

---

## 5. The tables, by domain

33 tables. `ws` below means the table has a `workspace_id`.

### Identity and tenancy
| Table | Purpose |
|---|---|
| `workspaces` | The tenant. Also carries a lot of per-workspace config (see below). |
| `users` | ws · name, email, `password_hash` (bcrypt), `role`, plus per-user UI prefs |
| `user_workspaces` | user ↔ workspace membership with a `role` — the authorisation record |
| `invite_codes` | ws · workspace invite codes, with the `role` they grant |
| `password_resets` | single-use tokens with `expires_at` |
| `platform_invites` | codes that create a whole new workspace |
| `platform_settings` | key/value JSONB for platform-wide defaults |

### CRM core
| Table | Purpose |
|---|---|
| `contacts` | ws · name, email, phone, company, `assigned_to`, `contact_type` (contact\|supplier), `custom_data` JSONB |
| `pipelines` | ws · ordered deal pipelines |
| `pipeline_stages` | ws · stages within a pipeline (`pipeline_id`, `name`, `color`, `position`) |
| `deals` | ws · `contact_id`, `pipeline_id`, `stage_id`, title, `value`, `urgency`, `supplier_id`, `custom_data` |
| `activities` | ws · `contact_id`, type (note\|call\|email\|whatsapp), `content`, and the scheduling fields `event_date` / `event_time` / `completed` |
| `activity_comments` | ws · threaded comments on an activity (`parent_id`) |
| `stages` | **dead** — contact stages, removed from the product, kept so old rows survive |

### Tasks
| Table | Purpose |
|---|---|
| `tasks` | ws · title, description, `status`, `priority`, `assigned_to`, `due_date`, `due_time`, `parent_id` (subtasks), `project_id`, `list_id`, `deal_id`, `contact_id`, `custom_data` |
| `task_projects` / `task_lists` | ws · project → list grouping |
| `task_project_statuses` | per-project status columns (key, label, color, position) |
| `task_attachments` | ws · file metadata; the bytes live in Supabase (`storage_path`, `file_url`) |

### Listings / objects
| Table | Purpose |
|---|---|
| `objects` | ws · the generic record type (workspace-renamable, default "Listings") |
| `object_contacts` | object ↔ contact |
| `deal_objects` | deal ↔ object |

### Custom fields
Four identical tables — `custom_fields` (contacts), `deal_fields`, `task_fields`,
`object_fields` — each `ws · name, field_key, type, options JSONB, position`. They define
fields; the **values** live in the owning row's `custom_data` JSONB under `field_key`. All four
are served by one generic router, `middleware/field-crud.js`.

### Messaging and notifications
| Table | Purpose |
|---|---|
| `chat_messages` | ws · team chat, broadcast over socket.io |
| `chat_reads` | per user per workspace `last_read_at` |
| `notifications` | ws · `user_id`, `actor_id`, type, category, `entity_type`/`entity_id`, `read` |

### Integrations
| Table | Purpose |
|---|---|
| `workspace_webhook` | ws · inbound webhook: `webhook_key`, `field_map`, and whether to auto-create a deal (`create_deal`, `pipeline_id`, `stage_id`, `default_assignee_id`) |
| `webhook_logs` | ws · every inbound payload with its status and resulting contact/deal |
| `workspace_engine` | ws · outbound engine URL, `trigger_stage_ids`, `webhook_secret` |
| `engine_deliveries` | ws · outbound delivery queue with `attempts`, `next_attempt_at`, `last_error` |

### Config on `workspaces`
Rather than a settings table, per-workspace config sits in JSONB columns on `workspaces`:
`analytics_config` (won/lost stage ids, nominated value field), `contact_columns`,
`deal_kanban_fields`, `kanban_fields`, `object_columns`, `object_name`, `supplier_name`,
`task_statuses`, `whatsapp_template`, `miro_url`. Per-user equivalents sit on `users`:
`analytics_layout`, `column_widths`, `deal_columns`, `notification_prefs`, `timezone`.

---

## 6. Patterns to follow when adding data

- **New field on an existing thing?** Prefer a custom field (`*_fields` + `custom_data`) if it
  is user-defined. Add a real column only when the server must query or sort by it.
- **New column:** append one `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `initDb`, make it
  nullable or give it a default, and never backfill silently. Say so in the change log.
- **New table:** add it to `SCHEMA`, give it `workspace_id` with
  `REFERENCES workspaces(id) ON DELETE CASCADE`, and filter every query by `req.workspaceId`.
- **Deleting data:** foreign keys already express the intent — `ON DELETE CASCADE` for things
  that cannot outlive their parent, `ON DELETE SET NULL` for links (e.g. `deals.contact_id`).
- **Dates and times:** `DATE` and `TIME` columns are separate on purpose (`activities.event_date`
  / `event_time`, `tasks.due_date` / `due_time`). Read them back formatted —
  `TO_CHAR(col, 'YYYY-MM-DD')` / `TO_CHAR(col, 'HH24:MI')` — so the client gets `09:30`, not
  `09:30:00`, and never has to parse a timestamp. **Build dates from local parts in JS**:
  `new Date('2026-10-05')` is UTC midnight and has caused real off-by-a-day bugs here.

---

## 7. Testing the data layer without a database

`tests/helpers/load-route.js` loads a route file with fakes injected for `db.js`,
`notifications.js` and `middleware/auth.js`. A test supplies a `pool` whose `query` returns
canned rows and asserts on the SQL and the bound parameters:

```js
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [...] }; } };
const s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool }) });
```

The default fake user is `{ id: 1, workspaceId: 7, role: 'owner' }`. This is why tests assert
things like "both halves of the union filter on `workspace_id = $1`" — the SQL itself is the
thing under test. Client code is tested the same way, statically: `tests/helpers/client-fn.js`
slices a function out of a `public/js` file and evaluates it in a sandbox.

`npm test` runs all 34 files (456 tests as of 2026-10-05) and needs no database, no server and
no browser.

---

## 8. Housekeeping from this audit

Done on 2026-10-05:

1. **Deleted the stale SQLite database.** `crm.db` / `-shm` / `-wal` were leftovers from before
   the Postgres migration — no code references SQLite — and held 3 workspaces, 4 users (with
   bcrypt password hashes), 5 contacts, 4 activities and 18 contact stages. Removed from the
   working tree and added to `.gitignore`; a JSON export was taken and then **deleted at the
   owner's instruction**, so no copy of that data remains outside git.
   ⚠️ **If those files were ever committed, `.gitignore` does not remove them from history.**
   The hashes and contact details would still be in past commits — the only remaining copy.
   Purging them means rewriting history (`git filter-repo` or similar) and force-pushing, and
   those four users' passwords should be rotated. That is a git operation, so it is yours.
2. **Dropped `better-sqlite3`** from `dependencies` — nothing required it, and it pulled a
   native build into every install. `package-lock.json` is now out of sync: run
   `npm install` once to update it.
3. **Deleted `newfile.env`** (it contained only the word `test`), and `.gitignore` now ignores
   `*.env` rather than just `.env`, so no stray env file can be committed by accident.
4. **Added `.env.example`** listing all 18 variables the code reads, grouped by what breaks
   without them, with no values. Note the admin console is gated by **`ADMIN_SECRET`** — unset,
   those routes return 503, which is the intended "off" state.
5. **This file** is the repo's first tracked documentation. Every other `.md` here is a
   gitignored change log.

Still open:

6. **There is no README** — how to run, required env vars, how to test.
7. **`stages` / `contacts.stage_id` are intentionally dead** (contact stages were removed, rows
   deliberately kept). Labelled in `db.js`; decide at some point whether to drop them.

## 9. Where things live

```
db.js                     the pool, SCHEMA, initDb (all migrations), seedDefaultPipeline
server.js                 express app, session store, socket.io, route mounts, error handler
storage.js                Supabase upload/delete for task attachments
notifications.js          creating notification rows + pushing them
middleware/auth.js        session → req.userId / req.workspaceId / req.userRole
middleware/field-crud.js  the one router behind all four custom-field tables
middleware/reorder.js     shared position/reordering endpoint logic
utils/engine.js           outbound engine deliveries and retries
utils/features.js         feature flags
utils/mailer.js           SMTP
routes/*.js               24 route files, one per API surface
public/js/*.js            17 client files; core.js holds the shared helpers and ui.* primitives
tests/{routes,client,unit,helpers}
```
