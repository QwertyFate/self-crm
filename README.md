# Upgrads CRM

A multi-tenant CRM: contacts, a drag-and-drop deal pipeline, tasks, listings, team chat,
analytics, and inbound/outbound integrations. One Express server, PostgreSQL, and a
no-build-step vanilla-JS frontend.

**Welcome.** This README is written for everyone who touches the app, so it is split into
three parts. Read the one you need and skip the rest:

| You are… | Start at |
|---|---|
| Someone who uses the CRM day to day | [Part 1 — Using the CRM](#part-1--using-the-crm) |
| A workspace owner or admin setting things up | [Part 2 — Running a workspace](#part-2--running-a-workspace) |
| A developer or operator deploying and changing it | [Part 3 — For developers](#part-3--for-developers) |

Deeper reference lives in [DATA_INFRASTRUCTURE.md](DATA_INFRASTRUCTURE.md) (how data is
stored and moved) and [ENGINE_INTEGRATION.md](ENGINE_INTEGRATION.md) (the outbound Engine
contract).

---

# Part 1 — Using the CRM

## Getting in

Open the app URL and you will see **Log in / Sign up**.

There are exactly two ways to get an account, and both need a code — you cannot self-register
from nothing:

- **Join an existing team.** Sign up with a **workspace invite code** from your owner or admin.
  The code decides whether you land as an *admin* or a *member*, and each code works once.
- **Create a new workspace.** Sign up with a **platform invite code** (issued by whoever runs
  the platform) plus a workspace name. You become its **owner**.

Passwords must be at least 6 characters. Forgot it? **Forgot password** emails a single-use
reset link — if no email arrives, SMTP may not be configured on your server; ask your admin.

You can belong to **several workspaces** with a different role in each. The workspace name in
the sidebar opens a switcher; your session is always "in" exactly one workspace at a time, and
everything you see is scoped to it.

## The three roles

| Role | Can do |
|---|---|
| **Member** | Everything in the day-to-day CRM: contacts, deals, tasks, activities, chat, calendar, analytics |
| **Admin** | The above, plus workspace settings, team management, and inviting new **members** |
| **Owner** | The above, plus inviting **admins**, removing members, workspace-wide config, and deleting the workspace |

Your role comes from your membership in the current workspace, re-checked on every request. If
your membership is removed you are logged out immediately.

## What each page does

The sidebar, top to bottom:

- **Deals** — your pipeline. List view and a kanban **board** you drag cards across; a deal has
  a contact, pipeline, stage, value, urgency, optional supplier, and any custom fields your
  workspace defined.
- **Contacts** — people and companies. Name, email, phone, company, assignee, plus custom
  fields. A contact can be a **contact** or a **supplier** (the sidebar label for suppliers is
  renamable per workspace).
- **Suppliers** — the supplier-type contacts, on their own page.
- **Tasks** — tasks with subtasks, projects and lists, status columns you define per project,
  priority, assignee, due date and time, file attachments, and links to a deal or contact.
- **Team Chat** — realtime workspace chat with presence (who's online) and @mentions. Unread
  count sits on the sidebar badge.
- **Activities** — the log against a contact: notes, calls, emails, WhatsApp. Activities can be
  scheduled (date + time) and marked complete, and carry threaded comments.
- **Calendar** — month and week views of scheduled activities and task due dates.
- **Listings** — a generic record type for whatever your business tracks (properties, systems,
  units…). The name is renamable per workspace; records link to contacts and deals.
- **Board** — the kanban view of deals, plus an optional embedded Miro board.
- **Analytics** — pipeline and performance charts. Which stages count as *won* and *lost*, and
  which field is the value, are configured once in settings; your card layout is saved per user.
- **Integrations** — inbound lead webhook, platform setup guides, received-lead history, and the
  outbound Upgrads Engine (see Part 2).
- **Settings** — your preferences, and, for owners/admins, the workspace configuration.

## Handy things people miss

- **Ctrl/⌘ K** or **/** opens the command palette — type to jump to any page.
  **↑ ↓** to move, **Enter** to open, **Esc** to close.
- **Dark mode** toggles from the user menu and is remembered in your browser.
- **Language**: English and German (Deutsch), switched in *Settings → My preferences*.
- **Custom fields** appear everywhere the record does. Ask an admin to add one rather than
  overloading the notes field.
- **Timezone** is a personal preference — set it so due times and the calendar read correctly.
- **WhatsApp**: contacts with a phone number get a one-click WhatsApp link, using the message
  template your workspace configured.

---

# Part 2 — Running a workspace

Owner/admin territory. All of it lives under **Settings** and **Integrations**.

## Settings tabs

| Tab | What you set |
|---|---|
| **Workspace** (owner) | Workspace name, the renamable labels for Listings and Suppliers, deletion |
| **My preferences** | Language, theme, timezone, notification preferences — per user, not shared |
| **Contacts / Deals / Listings / Tasks** | Custom fields, which columns show in the table, and which fields appear on kanban cards |
| **Team** | Members and their roles, and invite codes |
| **Integrations** | Shortcut into the integrations surface below |

## Inviting people

*Settings → Team* creates an **invite code** carrying the role it grants. Codes are single-use.
Only the **owner** can mint an admin code; admins can invite members. Removing a member revokes
their access on their next request.

## Pipelines and stages

A workspace can have several pipelines, each with its own ordered, colour-coded stages. New
workspaces start from a default **Sales Pipeline** (New → Contacted → Proposal → Negotiation →
Won → Lost), or from whatever defaults the platform operator configured.

Set your **Won** and **Lost** stages in the analytics configuration — Analytics *and* the Engine
trigger both read from it.

## Inbound leads (webhook)

*Integrations → Lead webhook* gives you a unique URL to paste into Zapier, Make.com, Facebook
Lead Ads or anything else that can POST JSON.

1. Copy **your webhook URL**.
2. Under **Field mapping**, say which incoming JSON key fills which contact field. Dots work for
   nested keys (`data.email`).
3. Optionally tick **create a deal for every incoming lead**, and pick the pipeline, stage and
   default assignee.
4. Send a test from your tool; it shows up under **Recent leads** with the raw payload and what
   was taken from it — including which mapped keys were *not* found.

Regenerating the URL invalidates the old one — every tool sending to it must be updated.
Inbound requests are rate-limited (per IP and per key) and do **not** fire Engine events.

## Outbound (Upgrads Engine)

*Integrations → Upgrads Engine*, owners and admins only. The CRM POSTs a signed
`vertrag.unterschrieben` event to your Engine URL when a deal moves
*into* one of the trigger stages. Full contract, headers, signature scheme and retry behaviour:
[ENGINE_INTEGRATION.md](ENGINE_INTEGRATION.md).

Short version: enter a **public** https URL, tick the trigger stages, hand the **webhook
secret** to the Engine team, **Send test event**, then switch the card to **Active**. The
**Deliveries** tab shows every attempt, its status and the Engine's last response.

## The platform admin console

Separate from workspaces: a platform-operator surface at **`/adminconsole`**, which issues
platform invite codes (the ones that create whole new workspaces), sets platform-wide defaults,
toggles feature flags, and shows stats.

It is gated by the `ADMIN_SECRET` environment variable. **If `ADMIN_SECRET` is unset, the admin
API returns `503` — that is the intended "off" state**, so leave it unset on any deployment that
should not have a console.

---

# Part 3 — For developers

## The stack, honestly

| Layer | What it is |
|---|---|
| Runtime | Node **>= 22** (uses `node --env-file`, `node:test`) |
| Server | Express 4, `express-session` with sessions stored **in Postgres** (`connect-pg-simple`) |
| Database | PostgreSQL via `pg`, one pool. **No ORM, no query builder** — routes write SQL |
| Realtime | socket.io, one room per workspace (`ws-<id>`) for chat and presence |
| Files | Supabase Storage, bucket `task-attachments` (task attachments only) |
| Email | nodemailer / SMTP — password resets and invites |
| Frontend | **Vanilla JS, no build step.** 17 classic `<script>` files sharing globals |
| Tests | `node:test` — **no database, no server, no browser required** |

There is no bundler, no transpiler and no framework on the client. `public/index.html` loads
`public/js/*.js` in order and they share globals; `core.js` holds the shared helpers
(`api.*`, `ui.*`, `esc`, `icon`, the i18n `t()`). That is a deliberate constraint — match it
rather than introducing a build step.

## Prerequisites

- **Node >= 22** (`node --version`)
- **PostgreSQL** you can reach — local, Docker, or hosted
- Optional, only for the features that use them: a Supabase project (task attachments) and SMTP
  credentials (password-reset and invite emails)

## Quickstart

```bash
git clone <this repo>
cd crm
npm install
```

Create your env file — the file **must** be named exactly `.env`, because both `npm start` and
`npm run dev` pass `--env-file=.env`:

```bash
cp .env.example .env
```

Then fill in, at minimum:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/crm
DATABASE_SSL=false          # false only for a local Postgres without TLS
SESSION_SECRET=<long random string>
PORT=3000
NODE_ENV=development
```

Need a local database? One line:

```bash
docker run --name crm-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=crm -p 5432:5432 -d postgres:16
```

**There is no migration step.** `initDb()` in [db.js](db.js) runs at every boot and is
idempotent — it creates all 33 tables and applies every `ALTER TABLE … ADD COLUMN IF NOT
EXISTS`. Just start the server:

```bash
npm run dev     # nodemon
npm start       # plain node
```

### Verify your setup

1. **The server booted and the schema applied.** You should see exactly:
   ```
   CRM running at http://localhost:3000
   ```
   A `Database init failed:` line followed by exit code 1 means `DATABASE_URL` is wrong or
   Postgres is unreachable — nothing else will work until that line is clean.
2. **The API answers.** Unauthenticated, `/api/auth/me` is the cheapest probe:
   ```bash
   curl -i http://localhost:3000/api/auth/me
   ```
   A `200` or `401` JSON response both prove the app is up; a connection refused does not.
3. **The tests pass.**
   ```bash
   npm test
   ```
   Expect `# pass 458  # fail 0` across 35 files (counts as of 2026-10-05). This needs no
   database — if it fails on a clean clone, that is a real break, not your environment.
4. **The UI loads.** Open <http://localhost:3000> — you should get the login/signup card.
5. **Get an account.** Signup needs a code, so for a brand-new database: set `ADMIN_SECRET` in
   `.env`, restart, open `/adminconsole`, log in with that secret, and issue yourself a
   **platform invite code**. Then sign up with *Create a workspace* using that code — you become
   the owner, with a seeded default pipeline.

## Project layout

```
server.js                 express app, helmet + CSP, rate limiters, session store,
                          socket.io (chat + presence), route mounts, error handler
db.js                     the pool, SCHEMA, initDb (all migrations), seedDefaultPipeline
storage.js                Supabase upload/delete for task attachments
notifications.js          creating notification rows and pushing them

middleware/
  auth.js                 session → req.userId / req.workspaceId / req.userRole
  field-crud.js           the single router behind all four custom-field tables
  reorder.js              shared position/reordering endpoint logic

utils/
  engine.js               outbound Engine deliveries and retries
  features.js             platform feature flags (platform_settings → "features")
  mailer.js               SMTP

routes/                   24 files, one per API surface, mounted at /api/<name>
public/
  index.html              the whole app shell (one page, all views)
  admin.html              the platform admin console
  js/*.js                 17 client files; core.js holds the shared helpers
  style.css               one stylesheet
tests/
  routes/                 route SQL + behaviour, with a fake pool
  client/                 static assertions over public/js and index.html
  unit/                   pure units (engine signing/dispatch, body limits)
  helpers/                load-route.js and client-fn.js — read these first
```

### The two architectural rules that matter

**1. Multi-tenancy runs through `req.workspaceId`.** [middleware/auth.js](middleware/auth.js)
re-checks the session's user against `user_workspaces` on every request and sets:

```js
req.userId      = req.session.userId;
req.workspaceId = membership.workspace_id;   // ← every query filters on this
req.userRole    = membership.role;           // 'owner' | 'admin' | 'member'
```

A route **never** trusts a workspace id from the client. Every query filters on
`req.workspaceId`. A user can belong to several workspaces; the session picks the active one.

**2. Parameters are always bound** (`$1`, `$2`, …), never interpolated. The single exception is
the analytics value/field name, which is validated against the workspace's own `deal_fields`
first — see `safeValueField` in [routes/analytics.js](routes/analytics.js) — because a JSONB key
cannot be a bind parameter. Do not add a second exception.

## Common workflows

```bash
npm test            # everything — 35 files, no database needed
npm run test:routes # route tests only
npm run test:client # client/static tests only
npm run test:unit   # pure units only
```

There is no linter, formatter or type checker configured. **Match the surrounding style** —
aligned `const` blocks in server files, compact helpers in `public/js`, comments that explain
*why* rather than *what*.

### Testing without a database

[tests/helpers/load-route.js](tests/helpers/load-route.js) loads a route with `db.js`,
`notifications.js` and `middleware/auth.js` faked. You supply a `pool` whose `query` returns
canned rows, then assert on **the SQL and the bound parameters**:

```js
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
const s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool }) });
```

The default fake user is `{ id: 1, workspaceId: 7, role: 'owner' }`. This is why tests assert
things like "both halves of the union filter on `workspace_id = $1`" — the SQL *is* the thing
under test, and that is how workspace isolation is enforced in CI.

Client code is tested the same way, statically: [tests/helpers/client-fn.js](tests/helpers/client-fn.js)
slices one function out of a `public/js` file and evaluates it in a sandbox. **Do not reach for a
headless browser** — verify UI changes with these static client tests.

### Adding a field or a table

- **User-defined field?** Use a custom field — a row in `custom_fields` / `deal_fields` /
  `task_fields` / `object_fields`, with the value living in the owning row's `custom_data`
  JSONB under `field_key`. No schema change needed.
- **Server must query or sort by it?** Append one `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in
  `initDb`, nullable or with a default. Nothing is backfilled unless you write that yourself.
  ⚠️ **A new column only exists after a server restart** — that is the usual reason a new field
  "doesn't save" right after a change.
- **New table?** Add it to `SCHEMA` with `workspace_id REFERENCES workspaces(id) ON DELETE
  CASCADE`, and filter every query by `req.workspaceId`.
- **Dates and times** are deliberately separate `DATE` / `TIME` columns. Read them back
  formatted (`TO_CHAR(col,'YYYY-MM-DD')`, `TO_CHAR(col,'HH24:MI')`) so the client gets `09:30`,
  not `09:30:00`. Build dates from local parts in JS — `new Date('2026-10-05')` is UTC midnight
  and has caused real off-by-a-day bugs here.

### Submitting work

- Branch off `main`: `feature/<short-name>`, `fix/<short-name>`.
- Commits in the imperative mood, one logical change each.
- Before opening a PR: `npm test` green, the app boots clean, and you have clicked through the
  page you touched.
- PR description says **what changed, why, and how you verified it**. Prove behaviour changes
  with a test that fails before your change — especially anything touching auth, roles or
  workspace scoping.
- This repo keeps **append-only markdown change logs** per feature in the project root
  (`ADMIN_ROLE_CHANGES.md`, `SETTINGS_UI_CHANGES.md`, …), listing every file and line touched.
  New work goes at the bottom as a new part; earlier sections are never rewritten. They are
  gitignored — local review records, not shipped docs.

## Environment variables

Every variable the code actually reads is documented in [.env.example](.env.example), grouped by
what breaks without it. In short:

| Group | Variables | Without them |
|---|---|---|
| Database (required) | `DATABASE_URL`, `DATABASE_SSL` | Server exits at boot |
| Server (required) | `SESSION_SECRET`, `PORT`, `NODE_ENV` | Sessions insecure; CSP only applies when `NODE_ENV=production` |
| Admin console | `ADMIN_SECRET` | Admin routes return `503` — the intended "off" state |
| Attachments | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Uploading throws a clear error; rest of app fine |
| Email | `SMTP_*`, `APP_URL`, `BASE_URL` | Password-reset and invite emails are not sent |
| Engine (dev only) | `ENGINE_ALLOW_PRIVATE_URLS` | Deliveries to private/localhost URLs are refused |
| Tests | `TEST_APP_ROOT` | Normally unset |

`SESSION_SECRET` signs session cookies — changing it logs everyone out. Never commit `.env`;
`.gitignore` ignores `*.env`.

## Where to start — good first tasks

Read these four files, in this order, before picking anything up. Together they are the whole
mental model:

1. **[middleware/auth.js](middleware/auth.js)** — 25 lines, and the reason the app is safely
   multi-tenant.
2. **[server.js](server.js)** — every route mount, the rate limiters, the CSP, and the socket.io
   chat handler in one readable file.
3. **One route end to end** — [routes/contacts.js](routes/contacts.js) is representative: plain
   SQL, `req.workspaceId` on every query, custom fields via `custom_data`.
4. **[public/js/core.js](public/js/core.js)** — `api.*`, `ui.*`, `esc`, `icon`, `t()`. Every
   other client file builds on these.

Then, in increasing order of blast radius:

- Add a column to a list view (a `*_columns` config on `workspaces` plus the client renderer).
- Add a field type to [middleware/field-crud.js](middleware/field-crud.js) — one router, four
  tables, immediate payoff.
- Write a route test for an endpoint that has none; `tests/routes/` has nine examples and the
  helper does the hard part.

Two known-dead things, so you don't "fix" them: the `stages` table and `contacts.stage_id` are
intentionally kept after contact stages were removed from the product (labelled in `db.js`) — the
columns remain so old rows survive, but nothing reads them and no new workspace is seeded with a
contact Stage column (see `tests/routes/default-contact-columns.test.js`). And
`users.workspace_id` still exists as the original home workspace, while `user_workspaces` is what
actually authorises.

## Getting help

- **How data is stored and moved, table by table**: [DATA_INFRASTRUCTURE.md](DATA_INFRASTRUCTURE.md)
- **The Engine contract**: [ENGINE_INTEGRATION.md](ENGINE_INTEGRATION.md)
- **Recent feature history**: the `*_CHANGES.md` logs in the project root (gitignored, local)
- **Anything else**: ask in the team channel, and ask early — a five-minute question beats an
  afternoon spent guessing at a workspace-scoping rule. Nobody here expects you to have read all
  24 route files.

Welcome aboard. 🎉
