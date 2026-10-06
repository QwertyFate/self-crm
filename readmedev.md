# readmedev.md — Internal Developer Guide

**Upgrads CRM** — a multi-tenant CRM: contacts and suppliers, a drag-and-drop deal pipeline,
tasks with projects/lists, listings ("objects"), activities, calendar, team chat, analytics,
and inbound + outbound integrations. One Express process, one Postgres database, and a
**no-build-step vanilla-JS frontend**.

Welcome aboard. This file is the *engineering* companion to [README.md](README.md): the README
tells you what the product does and how to boot it; this one tells you how the code is wired,
names **every route and path**, and shows how they intertwine. Read [README.md](README.md)
Part 3 first if you have not — it is the five-minute version. Come back here when you need the map.

Related docs: [DATA_INFRASTRUCTURE.md](DATA_INFRASTRUCTURE.md) (tables, migrations, tenancy),
[ENGINE_INTEGRATION.md](ENGINE_INTEGRATION.md) (the outbound Engine contract, gitignored/local).

---

## Contents

1. [Developer Overview](#1-developer-overview)
2. [Environment & Local Setup](#2-environment--local-setup)
3. [Directory Map](#3-directory-map)
4. [The API surface — every route](#4-the-api-surface--every-route)
5. [How it all intertwines](#5-how-it-all-intertwines)
6. [Developer Workflows](#6-developer-workflows)
7. [Git & PR Standards](#7-git--pr-standards)
8. [First Ticket Starter Guide](#8-first-ticket-starter-guide)
9. [Where every function lives](#9-where-every-function-lives)

---

## 1. Developer Overview

### What this codebase is

A single Node process serves both the API and the UI. There is **no bundler, no framework, no
transpiler, no client router**. `public/index.html` is the entire app shell — every page is a
`<section class="page">` inside it, and `switchPage()` toggles which one is `.active`. The
server's catch-all `app.get('*')` returns that same HTML for any non-API URL, so deep links
like `/deals` do not exist: the client always boots at Deals.

Why it matters day to day: you can edit a file in `public/js/` and hit reload. No watch task,
no HMR, no build output to keep in sync. The flip side is that there is no module system in
the browser — every `public/js/*.js` file shares one global scope and is loaded in a fixed
order by `<script>` tags, so **load order is dependency order** (see [§3](#3-directory-map)).

### The stack

| Layer | What we use | Notes |
|---|---|---|
| Runtime | Node >= 22 | `--env-file=.env`, native `node --test`, native `fetch` |
| HTTP | Express 4 | `helmet`, `express-rate-limit`, `express-session` + `connect-pg-simple` |
| Database | PostgreSQL (`pg` Pool) | Plain SQL. No ORM, no query builder, no migration tool |
| Realtime | socket.io 4 | Team chat + presence only; shares the Express session |
| Files | Supabase Storage | Task attachments only; optional |
| Email | nodemailer (SMTP) | Password resets; optional — logs the link to stdout if unset |
| Frontend | Vanilla JS, one CSS file | No build step |
| Tests | `node:test` + `node:assert/strict` | No database required; see [§6](#6-developer-workflows) |

### Request lifecycle

```text
browser
  │  GET /  ────────────────────────────────►  express.static → public/index.html
  │                                             (HTML/CSS/JS served no-cache, assets 1h)
  │  fetch('/api/...')  (api.get/post/... in public/js/core.js, cookies included)
  ▼
server.js
  ├─ helmet (CSP only when NODE_ENV=production)
  ├─ rate limiters on /api/auth/login|signup|forgot-password|reset-password
  │                 and /api/integrations/receive (per IP + per webhook key)
  ├─ express.json()      ← 10 MB only for /api/contacts/import, 100 kb everywhere else
  ├─ express-session     ← cookie → row in the `session` table (auto-created)
  ├─ express.static      ← public/
  ├─ app.use('/api/<x>', routes/<x>.js)
  │     └─ middleware/auth.js  ──►  req.userId / req.workspaceId / req.userRole
  │           └─ handler: plain SQL via pool.query, always filtered on req.workspaceId
  ├─ GET /adminconsole   → public/admin.html
  ├─ GET *               → public/index.html        (client-side "routing")
  └─ error handler       → 413 for entity.too.large, else 500 {error:'Internal server error'}
```

### The five invariants

Break any of these and the review will bounce.

1. **Tenancy flows through `req.workspaceId`, never the client.**
   [middleware/auth.js](middleware/auth.js) re-reads `user_workspaces` on *every* request and
   sets `req.userId`, `req.workspaceId`, `req.userRole`. If the membership row is gone the
   session is destroyed and the request 401s. Every query filters on `req.workspaceId`.
2. **SQL parameters are bound (`$1`, `$2`), never interpolated.** The single sanctioned
   exception is the analytics value field, which is matched against the workspace's own
   `deal_fields` by `safeValueField()` first, because a JSONB key cannot be a bind parameter.
   Do not add a second exception.
3. **One `users` row per (workspace, email).** Multi-workspace membership is *not* one user in
   many workspaces — it is several `users` rows sharing an email and password hash, tied
   together by `user_workspaces`. Switching workspace **changes `req.session.userId`** to the
   other row's id. Any code that assumes "my user id is stable across workspaces" is wrong.
4. **The schema is applied at boot, not migrated.** `initDb()` in [db.js](db.js) runs the whole
   `SCHEMA` plus every `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on each start. It is idempotent
   and never backfills. A new column only exists **after a restart** — that is the usual reason
   a new field "doesn't save".
5. **UI is verified with static client tests, not a browser.** `tests/client/` slices functions
   out of `public/js` and runs them in a sandbox. Do not reach for a headless browser.

### Roles

`owner` > `admin` > `member`, stored twice: `users.role` (displayed) and `user_workspaces.role`
(**the one that authorises**, read by the auth middleware). `PATCH /api/workspace/members/:id/role`
writes both in one transaction — if you ever add another writer, keep them in step.

---

## 2. Environment & Local Setup

### Prerequisites

- **Node >= 22** (`node --version`) — the code uses `--env-file`, native `node --test`, and global `fetch`.
- **PostgreSQL** you can reach. Local, Docker, or hosted.
- Optional: a Supabase project (task attachments) and SMTP credentials (password-reset mail).
  Everything else works without them.

### Bootstrap, step by step

```bash
git clone <this repo>
cd crm
npm install            # ~11 runtime deps, nodemon is the only dev dep
cp .env.example .env   # the file MUST be named .env — both scripts pass --env-file=.env
```

Need a database? One line:

```bash
docker run --name crm-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=crm \
  -p 5432:5432 -d postgres:16
```

Fill in `.env`. There is no `.env.local` in this project — `.env` is the one file, and
`.gitignore` ignores `*.env` with an exception for `.env.example`. Minimum to boot:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/crm
DATABASE_SSL=false            # ONLY "false" disables TLS; any other value enables it
SESSION_SECRET=<long random>  # changing this logs everyone out
PORT=3000
NODE_ENV=development          # CSP is disabled unless this is "production"
```

Then start it:

```bash
npm run dev      # nodemon + --env-file=.env
npm start        # plain node
```

**There is no migration command.** `initDb()` creates every table and column at boot.

### The full environment matrix

Every variable the code actually reads (grep `process.env`), grouped by what breaks without it:

| Variable | Read in | Required? | Without it |
|---|---|---|---|
| `DATABASE_URL` | [db.js](db.js) | **yes** | `Database init failed:` and `process.exit(1)` |
| `DATABASE_SSL` | [db.js](db.js) | no | SSL on (`rejectUnauthorized:false`); set exactly `false` for local |
| `SESSION_SECRET` | [server.js](server.js) | **yes in prod** | Falls back to `change-me-in-production` |
| `PORT` | [server.js](server.js) | no | 3000 |
| `NODE_ENV` | [server.js](server.js) | no | CSP disabled unless `production` |
| `ADMIN_SECRET` | [routes/admin.js](routes/admin.js) | for admin console | `POST /api/admin/login` → 503 (the intended "off") |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | [storage.js](storage.js) | for attachments | Upload throws a clear error; rest of app fine |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | [utils/mailer.js](utils/mailer.js) | for email | Reset link is `console.log`ged and returned in the JSON response |
| `APP_URL` | [routes/integrations.js](routes/integrations.js) | no | Webhook URL shown in the UI has no base |
| `BASE_URL` | [routes/auth.js](routes/auth.js) | no | Reset links fall back to `http://localhost:$PORT` |
| `ENGINE_ALLOW_PRIVATE_URLS` | [routes/engine.js](routes/engine.js) | dev only | `=1` lets the Engine URL point at localhost/private IPs (SSRF guard off) |
| `TEST_APP_ROOT` | [tests/helpers/load-route.js](tests/helpers/load-route.js) | no | Points the tests at a mirror of the app, for baseline-first runs |

### Verify your setup

1. `CRM running at http://localhost:3000` is the only line you should see on boot.
2. `curl -i http://localhost:3000/api/auth/me` → `200` with `{"user":null}` (or your session).
3. `npm test` → **464 passing, 0 failing across 35 files** (as of 2026-10-05). This needs **no
   database**; a failure on a clean clone is a real break, not your environment.
4. Open <http://localhost:3000> → the login/signup card.
5. **Get an account.** Signup always needs a code. On a brand-new database `initDb()` prints a
   first-run **platform invite code** in a box on stdout — use it with *Create a workspace* and
   you become the owner with a seeded pipeline. Lost it? Set `ADMIN_SECRET`, restart, open
   `/adminconsole`, log in with the secret and issue yourself another.

---

## 3. Directory Map

```text
server.js            Express app: helmet/CSP, rate limiters, body limits, session store,
                     static files, ALL route mounts, /adminconsole, catch-all, error handler,
                     and the socket.io server (chat + presence) at the bottom.
db.js                The pg Pool, the SCHEMA string, initDb() (= the migration system),
                     seedDefaultPipeline(), and the first-run platform invite code.
notifications.js     notify()  — fan-out to every other member, respecting notification_prefs
                     notifySystem() — fan-out to everyone (see §8: it has a real bug)
storage.js           Supabase Storage upload/delete, bucket "task-attachments"

middleware/
  auth.js            session → req.userId / req.workspaceId / req.userRole / req.userTimezone. Read it.
  admin-auth.js      requireAdmin — the session.isAdmin gate, shared by the two /api/admin routers
  field-crud.js      createFieldRouter(table) — ONE router behind all four custom-field tables,
                     and VALID_TYPES, the custom-field type whitelist
  reorder.js         reorderItems() — transactional position rewrite, used by stage reordering

utils/
  engine.js          Outbound "Upgrads Engine": payload, HMAC signing, delivery + retry, drain()
  features.js        Platform feature flags, stored in platform_settings under key "features"
  mailer.js          SMTP transport; no SMTP_HOST → logs the reset link instead of sending

routes/              25 files, each mounted at /api/<name> in server.js. See §4.
                     (admin.js and admin-provision.js both mount at /api/admin.)

public/
  index.html         The ENTIRE app shell: every page, every modal, the SVG icon sprite,
                     and the <script> tags whose ORDER is the dependency order.
  admin.html         The standalone platform admin console (served at /adminconsole).
                     Two tabs: Platform Defaults and Provisioning. Has its own inline
                     <script> and its own esc() — it does not load core.js.
  style.css          One stylesheet for everything
  fonts/, images/    inter-latin-wght.woff2, logo.png
  js/                17 files, one global scope, loaded in this order:
      core.js          state globals, TRANSLATIONS + t()/tf(), api.*, loader, esc/icon/avatar,
                       the ui.* primitives (popover, menu, select, modal, drawer, confirm,
                       toast), shell helpers, command palette.  EVERYTHING depends on this.
      auth.js          init(), login/signup/reset, workspace picker + switching, switchPage()
                       (the "router"), resetClientState(), ensureX() caches
      deals.js         Deals page: board, list, summary, filters, drag & drop
      contacts.js      Contacts/Suppliers table: columns, inline edit, filters, bulk select
      objects.js       Listings ("objects"), the Miro board page, AND the Activities page
      settings.js      Settings tabs: pipelines, custom fields, columns, invites, members
      modals.js        The small shared modals (contact, activity) + closeSidePanel()
      tasks.js         Tasks page: projects, lists, list/kanban views, due-date helpers
      notifications.js Bell panel, polling, preferences
      calendar.js      Calendar page: month/week/upcoming over /api/calendar
      clock.js         Top-bar clock + the timezone preference, and nowInTimezone():
                       "now" on the user's picked clock — what the calendar's today
                       and task overdue run on; and toViewerClock() / wallClockInZone() /
                       instantOf(): a stored time (typed in one member's zone) shown on
                       another member's clock
      analytics.js     Analytics page: KPI cards, funnel, trends, drag-to-reorder layout
      integrations.js  Integrations page: inbound webhook + Engine settings/deliveries
      chat.js          socket.io client, chat panel and chat page, unread badge
      guide.js         The product tour (gated by the platform feature flag)
      admin-import.js  CSV import wizard + the in-app admin screen (?admin) + CSV export
      detail-views.js  The big one: deal form/detail drawer, contact detail panel,
                       task form/drawer. Loaded LAST because it uses everything above.

tests/
  helpers/load-route.js  Loads a REAL route with db.js / notifications.js / middleware/auth.js
                         swapped out of require.cache, and serves it on a random port.
  helpers/client-fn.js   Slices one function out of a public/js file and evals it in a sandbox.
  routes/                10 files — SQL and behaviour, with a fake pool
  client/                22 files — static + sandboxed assertions over public/js and index.html
  unit/                  3 files — pure units (engine signing/dispatch, import body limit)

reference/pro/         Design reference the UI was ported from. GITIGNORED, read-only, not shipped.
*_CHANGES.md           Append-only per-feature change logs. Gitignored, local review records.
```

### Load-order gotchas in `public/js`

- `core.js` first, `detail-views.js` last. A function defined in `detail-views.js` cannot be
  called at *parse* time by an earlier file, but can be called later from a click handler —
  which is why the inline `onclick="openDealModal(...)"` attributes in `index.html` work.
- `chat.js` must load **after** `/socket.io/socket.io.js`; that script tag sits between them.
- Globals are declared with `let` in `core.js` and mutated everywhere. `resetClientState()` in
  [public/js/auth.js](public/js/auth.js) is the single place that returns them all to boot
  state — **if you add a new global, add it there too**, or the next user to log in in the same
  tab sees the previous user's data.

---

## 4. The API surface — every route

Everything lives under `/api`. Unless the table says otherwise, a route is **mounted behind
`requireAuth`** (`router.use(requireAuth)` at the top of the file), returns JSON, and scopes
every query to `req.workspaceId`.

Conventions in the tables: **Auth** = who may call it. `session` = any logged-in user,
`member` = any member of the current workspace, `owner`/`admin` = role-gated,
`public` = no session needed.

### Mount table (`server.js`)

| Prefix | File | Notes |
|---|---|---|
| `/api/auth` | [routes/auth.js](routes/auth.js) | No router-level guard; each handler checks `req.session` itself |
| `/api/admin` | [routes/admin.js](routes/admin.js) | Gated by `req.session.isAdmin`, **not** by workspace auth |
| `/api/platform` | [routes/platform.js](routes/platform.js) | |
| `/api/contacts` | [routes/contacts.js](routes/contacts.js) | `/import` gets a 10 MB body limit in `server.js` |
| `/api/fields` | [routes/fields.js](routes/fields.js) | → `createFieldRouter('custom_fields')` |
| `/api/activities` | [routes/activities.js](routes/activities.js) | |
| `/api/activity-comments` | [routes/activity-comments.js](routes/activity-comments.js) | |
| `/api/calendar` | [routes/calendar.js](routes/calendar.js) | Read-only union of activities + tasks |
| `/api/invites` | [routes/invites.js](routes/invites.js) | Workspace invite codes |
| `/api/workspace` | [routes/workspace.js](routes/workspace.js) | Members + all workspace config |
| `/api/pipelines` | [routes/pipelines.js](routes/pipelines.js) | Pipelines **and** their stages |
| `/api/deals` | [routes/deals.js](routes/deals.js) | Fires the Engine on stage changes |
| `/api/deal-fields` | [routes/deal-fields.js](routes/deal-fields.js) | → `createFieldRouter('deal_fields')` |
| `/api/objects` | [routes/objects.js](routes/objects.js) | "Listings"; the label is per-workspace |
| `/api/object-fields` | [routes/object-fields.js](routes/object-fields.js) | → `createFieldRouter('object_fields')` |
| `/api/tasks` | [routes/tasks.js](routes/tasks.js) | |
| `/api/task-fields` | [routes/task-fields.js](routes/task-fields.js) | → `createFieldRouter('task_fields')` |
| `/api/task-projects` | [routes/task-projects.js](routes/task-projects.js) | Projects, lists, per-project statuses |
| `/api/notifications` | [routes/notifications.js](routes/notifications.js) | |
| `/api/chat` | [routes/chat.js](routes/chat.js) | REST half of chat; socket.io is the live half |
| `/api/analytics` | [routes/analytics.js](routes/analytics.js) | |
| `/api/tasks` *(2nd mount)* | [routes/task-attachments.js](routes/task-attachments.js) | Same prefix, deeper paths — see note below |
| `/api/integrations` | [routes/integrations.js](routes/integrations.js) | `/receive/:key` is public + rate limited |
| `/api/engine` | [routes/engine.js](routes/engine.js) | Outbound Engine settings and log |

> **Two routers on `/api/tasks`.** `tasks.js` is mounted first and only declares one- and
> two-segment paths (`/`, `/:id`, `/:id/status`), so `/api/tasks/7/attachments` falls through to
> `task-attachments.js`. If you ever add `/:id/:something` to `tasks.js`, you will shadow the
> attachment routes. Keep attachment paths three segments deep.

### Non-API paths

| Path | Serves |
|---|---|
| `/` and **any** unmatched GET (`app.get('*')`) | `public/index.html` |
| `/adminconsole` | `public/admin.html` (the standalone console) |
| `/?admin` | Still `index.html`; `init()` in `public/js/auth.js` shows the in-app admin screen |
| `/?reset=<token>` | `index.html`; `init()` opens the password-reset form |
| `/js/*.js`, `/style.css`, `/images/*`, `/fonts/*` | `express.static`. HTML/CSS/JS are `no-store`; other assets `max-age=3600` |
| `/socket.io/socket.io.js`, `/socket.io/*` | socket.io client + transport |

### `/api/auth` — session, signup, workspaces

No `requireAuth` here; each handler inspects `req.session` itself.

| Method | Path | Auth | Body / query | Does |
|---|---|---|---|---|
| GET | `/me` | public | — | `{user, workspace, workspaces[]}`, or `{user:null}` when logged out or the row vanished (session destroyed) |
| POST | `/login` | public, **5 / 15 min / IP** | `{email, password}` | One membership → logs in. Several → `{needs_workspace_picker:true, workspaces}` with only `session.userId` set |
| POST | `/select-workspace` | session | `{workspace_id}` | Finishes a picker login: re-resolves the `users` row **by email + workspace** and swaps `session.userId` |
| POST | `/switch-workspace` | session | `{workspace_id}` | Same swap, from inside the app |
| GET | `/my-workspaces` | session | — | `{workspaces, active_workspace_id}` |
| POST | `/signup` | public, **5 / h / IP** | `{name,email,password,mode}` + (`workspace_name`,`platform_invite_code`) or `invite_code` | `mode:'create'` consumes a **platform** invite, creates workspace + seeded pipelines + owner. `mode:'join'` consumes a **workspace** invite, role from the code. Both in one transaction |
| POST | `/logout` | public | — | Destroys the session |
| POST | `/forgot-password` | public, **3 / h / IP** | `{email}` | Always 200 (no account enumeration). With SMTP → mail; without → the URL comes back in the JSON and is logged |
| POST | `/reset-password` | public, **3 / h / IP** | `{token, password}` | Single-use token, 1 h expiry |
| PATCH | `/preferences` | session | `{column_widths?, deal_columns?, timezone?}` | Per-user UI prefs on `users`. Timezone validated via `Intl.DateTimeFormat` |
| POST | `/create-workspace` | session | `{workspace_name, platform_invite_code}` | New workspace for an existing user: clones their name/email/**password hash** into a new `users` row, seeds a pipeline, switches the session to it |
| POST | `/join-workspace` | session | `{invite_code}` | Same, via a workspace invite |

### `/api/admin` — the platform console

A **separate** authentication scheme: `POST /login` compares a plaintext `ADMIN_SECRET` and sets
`req.session.isAdmin`. Nothing here is workspace-scoped; it is cross-tenant by design.

| Method | Path | Auth | Does |
|---|---|---|---|
| GET | `/me` | public | `{isAdmin}` |
| POST | `/login` | public | `{secret}`. **503** when `ADMIN_SECRET` is unset — the intended "off" state |
| POST | `/logout` | public | Clears the flag |
| GET / POST | `/invites` | admin | List / mint platform invite codes (16 random bytes) |
| DELETE | `/invites/:id` | admin | Only while unused |
| GET / PATCH | `/defaults` | admin | `platform_settings.default_contact_columns` and `default_pipelines` — what every **new** workspace is seeded with |
| GET / PATCH | `/features` | admin | `platform_settings.features`; currently just `{tourEnabled}` |
| GET | `/stats` | admin | Global counts: workspaces, users, contacts, deals |
| POST | `/provision` | admin | **One-shot tenant creation.** [routes/admin-provision.js](routes/admin-provision.js) — see below |
| GET | `/provision/list` | admin | Every workspace with its owner, counts and webhook URL — what the console's Provisioning tab renders. Carries no passwords or hashes |

Two UIs talk to this: `public/admin.html` (`/me`, `/login`, `/logout`, `/defaults`, `/features`,
`/stats`, `/provision`, `/provision/list`) and the in-app `?admin` screen in
`public/js/admin-import.js` (`/me`, `/login`, `/logout`, `/invites`).

`admin.html` has **two tabs**: "Platform Defaults" (stats, contact columns, pipelines, the tour
flag) and "Provisioning" (the create form, the one-time credentials panel, and the
workspace/owner table). `showAdminTab()` toggles them; the provisioning tab loads its list on
first open. Covered by
[tests/client/admin-provisioning.test.js](tests/client/admin-provisioning.test.js) — markup,
`buildProvisionPayload`, and the HTML-escaping of workspace/owner names in the table.

Two routers are mounted at `/api/admin`: [routes/admin.js](routes/admin.js) (everything above) and
[routes/admin-provision.js](routes/admin-provision.js) (`/provision`). They share the gate,
[middleware/admin-auth.js](middleware/admin-auth.js).

#### `POST /api/admin/provision` — a ready-to-use tenant in one call

No invite code is involved: the admin secret is the authorisation, so this route creates a
workspace from nothing. **The minimum request is two fields.**

**It is create-only.** There is no `workspace_id` parameter, and the route issues no `UPDATE` and
no `DELETE` — it cannot reach an existing workspace, and a stray `workspace_id` in the body is
ignored. `contact_fields` / `deal_fields` are **seeds for the new workspace**, not an admin editing
API: once a workspace is live its fields belong to its own members via `/api/fields` and
`/api/deal-fields` (both `requireAuth`, workspace-scoped). There is deliberately no cross-tenant
field endpoint for the platform admin.

```jsonc
{
  "workspace_name": "Acme Corp",            // required
  "owner_email":    "maria@acmecorp.com",   // required
  "owner_name":     "Maria Schmidt",        // optional — defaults to the email local part
  "contact_fields": [                       // optional → custom_fields
    { "name": "Lead Source", "type": "dropdown", "options": ["Google Ads", "Referral"] },
    { "name": "LinkedIn",    "type": "url" }
  ],
  "deal_fields": [                          // optional → deal_fields
    { "name": "Contract Start", "type": "date" },
    { "name": "Seats", "field_key": "seat_count", "type": "number" }
  ],
  "create_deal":    true,                   // optional, default TRUE  (webhook also opens a deal)
  "webhook_active": true                    // optional, default true
}
```

One transaction does all of it: seed the workspace from `platform_settings` (the same defaults
signup uses), insert the custom fields, create the owner (`users` + `user_workspaces`, role
`owner`), and create the `workspace_webhook` row with its key, a `field_map` that already covers
the custom contact fields, the owner as `default_assignee_id`, and the first pipeline + first
stage when `create_deal` is on.

`field_key` is slugged from `name` when not given (`"Lead Source"` → `lead_source`); `type`
defaults to `text` and is checked against `VALID_TYPES` in
[middleware/field-crud.js](middleware/field-crud.js), so these rows are identical to what
`POST /api/fields` would have written. A `dropdown` must carry `options`. A contact `field_key`
that collides with a built-in column (`email`, `company`, …) is a **400** — the webhook's
`field_map` cannot hold two meanings for one key.

**The owner's password.** One credential and nothing else: `owner.password`, 16 characters in
four readable groups (`myUe-knsn-pUKE-tRvm`) drawn from a 56-character alphabet with the
look-alikes removed — ~93 bits. It appears **once**, in this response; nothing is emailed and only
the bcrypt hash is stored, so copy it before closing the response. The owner signs in at
`login_url` with `owner_email` + that password.

An email that **already has an account** reuses that account's name and `password_hash` and is
issued **no** password (`owner.existing_account: true`). Since they now have two workspaces,
`POST /api/auth/login` answers `needs_workspace_picker: true` and the client finishes through
`POST /api/auth/select-workspace`.

Generating a *fresh* password for a second workspace would split the hashes across that email's
rows, which is why `existing_account` issues nothing at all.

**There is no set-password token**, by choice rather than by necessity. An earlier version minted a
`password_resets` row and returned a `?reset=` link. It was unsafe at the time — `reset-password`
re-hashed a single `users` row while `login` reads `WHERE email = $1` with no `ORDER BY`, so a
two-workspace owner ended up with one row on each hash. **That is fixed**: the reset now covers
every row of the email (see §8), so a link here would be correct again if you want one. It stays
out because one credential beats two.

⚠ The app still has **no change-password screen**, so `forgot-password` → `reset-password` remains
the only way the owner can replace a password the admin has seen. That path is correct now, but it
is a reset (it emails a link, or logs it when SMTP is unset), not a change.

**The response** is the tenant plus an `integration` block generated from the rows just written —
`webhook_url` with the real key, `field_map`, `sample_payload` keyed by the incoming keys,
`sample_curl` (shell-quoted and runnable), `success_response`, `error_responses`, `rate_limits`
and `notes`. Hand that block to the customer as-is.

A provisioned workspace is stamped with `workspaces.provisioned_at` (a nullable column added at
the end of `initDb()`), which is how `/provision/list` and the console tell a provisioned tenant
from a self-served signup. Nothing is backfilled, so workspaces that predate the column read as
"unknown" rather than being guessed at.

⚠ The inbound webhook maps **contact** fields only. `deal_fields` are created for the board and
the deal modal, but `POST /api/integrations/receive/:key` inserts a deal with a title, pipeline
and stage and no `custom_data` — `integration.notes` says so in the response.

Tested by [tests/routes/admin-provision.test.js](tests/routes/admin-provision.test.js) (18 cases:
the gate, the full happy path, custom fields, an existing owner, `create_deal:false`, the
mid-transaction rollback, and twelve rejected bodies).

### `/api/platform`

| Method | Path | Auth | Does |
|---|---|---|---|
| GET | `/features` | member | The same flags, readable by any logged-in user. `public/js/guide.js` uses it to decide whether the tour exists |

### `/api/contacts`

Contacts and suppliers are the **same table**, separated by `contact_type` (`'contact'` \| `'supplier'`).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/?contact_type=&contact_id=` | member | Joins the assignee and computes `last_activity_at` as a correlated `MAX(activities.created_at)` |
| POST | `/import` | member | **10 MB body limit** (set in `server.js`). One transaction: creates missing `custom_fields`, upserts rows by email, optionally creates a deal per row. Returns `{imported, deals_created}` |
| GET | `/:id` | member | The contact **plus** its activities, newest first |
| POST | `/` | member | 409 if the email already exists in this workspace. Fires a `contacts` notification |
| PUT | `/:id` | member | Full replace; `contact_type` is `COALESCE`d so it survives an omitted field |
| DELETE | `/:id` | member | |
| POST | `/bulk/delete` | member | `{contactIds:[...]}` — placeholders built from the array length, still parameterised |

### `/api/fields`, `/api/deal-fields`, `/api/task-fields`, `/api/object-fields`

All four are the *same* router, produced by `createFieldRouter(table)` in
[middleware/field-crud.js](middleware/field-crud.js). Change it once, fix it everywhere.

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Ordered by `position, id` |
| POST | `/` | `{name, field_key, type, options[]}`. `type` must be one of `text, email, phone, number, dropdown, date, url`. Duplicate `field_key` → 400 (Postgres `23505`) |
| PUT | `/:id` | Partial: only the keys you send are updated |
| DELETE | `/:id` | Deletes the *definition*. The values stay behind in each row's `custom_data` JSONB |

### `/api/activities` and `/api/activity-comments`

**Timezone.** `POST` stamps `event_tz` from `req.userTimezone`; `PATCH` re-stamps it only when a
date or time was actually sent (a bare `completed` tick must not relabel a time it did not touch —
that is the `event_tz = CASE WHEN $10 THEN $11 ELSE event_tz END`). The Calendar converts it for
each viewer. Only the Calendar and the activity form consume `event_date`/`event_time` — the
Activities page and the contact detail never render them — so the `GET` statements here were
deliberately left alone. NULL `event_tz` is read as `Europe/Berlin`.

**A note can be bound to one deal** (`activities.deal_id`, nullable, `ON DELETE SET NULL`). A note
composed on the deal detail — or with the modal's Deal picker — is bound to that deal; one logged
from the contact page is a *contact-level* note (`NULL`). `POST` verifies the deal is in this
workspace and, given a deal but no contact, takes the deal's contact.

**Two optional, independent filters on `GET /`.** `?deal_id=N` is *"this deal's notes"*: the notes
bound to N **plus** the contact-level notes (`NULL` deal) of N's contact — a note about the person
belongs with every deal of theirs; the only notes it hides are those bound to the contact's *other*
deals. `?contact_id=N` is everything on that contact, whichever deal (or none) each note was logged
on. The **deal detail shows the contact's whole history by default** — "all together", each row
labelled with the deal it was logged on — and its "This deal only" chip switches to the deal filter;
the Activities page's Deal chip is the same filter. A deal with no contact can only have bound
notes, so the deal detail always uses `?deal_id=` for it. A non-numeric filter is a `400`.

For display every row carries `bound_deal_id`, plus `deal_id`/`deal_title` that **prefer the bound
deal and fall back to the derived one** — the contact's most recently updated deal, the identical
`LEFT JOIN LATERAL` the calendar uses, so the Activities page and the calendar detail agree.
`GET /api/contacts/:id` returns `deal_id`/`deal_title` on each activity so the contact timeline can
badge bound notes. `tests/routes/activity-deal.test.js`, `tests/routes/activities-links.test.js`.

| Method | Path | Notes |
|---|---|---|
| GET | `/activities` | Newest 200 for the workspace, with contact and author names |
| POST | `/activities` | `{contact_id, type, content, event_date?, event_time?}`. `type ∈ note, call, email, whatsapp`. Scans `content` for `@mentions` and inserts notification rows |
| GET | `/activities/:id` | |
| PATCH | `/activities/:id` | Partial via `COALESCE`. Sending `event_date: null` **clears** the date (same for `event_time`) — that is the `CASE WHEN $7 THEN NULL` trick in the SQL |
| DELETE | `/activities/:id` | |
| GET | `/activity-comments?activity_id=` | Returns a **tree**: roots with nested `children[]`, assembled in JS |
| POST | `/activity-comments` | `{activity_id, parent_id?, content}`; mention-scans too, returns the created row joined with its author |
| DELETE | `/activity-comments/:id` | |

> The two mention scanners are **not** the same code. `activities.js` matches loosely (prefix
> and per-word), `activity-comments.js` matches `LOWER(name) = ANY(...)` exactly. If you touch
> mentions, touch both and say so in the PR.

### `/api/calendar`

**Every row carries `event_tz`** (`a.event_tz` / `t.due_tz`, at the same position in both halves
of the `UNION` — Postgres requires it). The client converts to the viewer's zone in
`calNormalize()` before anything renders, and because the server filters on the *stored* date
while a conversion can move a row by up to two days, the Calendar fetches its windows padded by
two days each side and lets `calOnDay()` (reading the converted date) decide what is on screen.

Read-only. Each row carries `kind` (`'activity'` \| `'task'`) because an activity and a task can
share an id.

| Method | Path | Notes |
|---|---|---|
| GET | `/?start=YYYY-MM-DD&end=YYYY-MM-DD` | 400 without both. `UNION ALL` of activities with an `event_date` and tasks with a `due_date`; times come back as `HH:MI`, `NULL` meaning all-day |
| GET | `/today` | The same union pinned to `CURRENT_DATE`. ⚠ **Uncalled** — nothing in `public/js` or on the server requests it — and `CURRENT_DATE` is the *database server's* clock, not the user's picked timezone. The Calendar page gets "today" from the client (`calToday()`, see §8) and fetches `GET /?start=&end=` over its own 8-day window instead. If this ever gains a caller, compute the date in `users.timezone` or take a `?date=` from the client |

### `/api/invites` — workspace invite codes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | owner, admin | With creator and consumer names |
| POST | `/` | owner, admin | `{role}` — `member` or `admin`. **Only an owner may mint an `admin` code** |
| DELETE | `/:id` | owner, admin | Unused codes only; an admin can only revoke `member` codes |

### `/api/workspace`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/` | member | Create another workspace with a platform invite. Copies the creator's real `password_hash` into the new `users` row — one email, one password, a row per workspace. **This is the route the UI's "+ Add workspace → Create" calls**; the equivalent twin `POST /api/auth/create-workspace` has no caller. It used to write the literal `'placeholder'` here; see [§8](#8-first-ticket-starter-guide) |
| GET | `/members` | member | `users` rows of this workspace |
| DELETE | `/members/:id` | **owner** | Not yourself, not the owner; nulls their contact assignments first |
| PATCH | `/members/:id/role` | **owner** | `{role:'member'\|'admin'}`; updates `users.role` **and** `user_workspaces.role` in one transaction |
| PATCH | `/name` | **owner** | |
| DELETE | `/` | **owner** | Deletes the workspace and its data explicitly, table by table. Refuses if it is your only workspace |
| PATCH | `/contact-columns` | member | `{columns:[...]}` → `workspaces.contact_columns` |
| PATCH | `/object-columns` | member | `{columns:[...]}` |
| PATCH | `/task-statuses` | member | `{statuses:[{key,label,color}]}`, non-empty |
| PATCH | `/kanban-fields` | member | `{fields:[...]}` → `workspaces.kanban_fields` |
| PATCH | `/supplier-name` | **owner** | The label for `contact_type='supplier'` |
| PATCH | `/object-name` | **owner** | The label for objects ("Listings") |
| PATCH | `/miro-url` | member | Embed URL for the Board page; `null` hides the nav item |
| PATCH | `/whatsapp-template` | member | Template with `{{name}}`-style vars, used by `waLink()` |

### `/api/pipelines` — pipelines *and* stages

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Each pipeline with its stages pre-aggregated via `json_agg`, ordered by `position` |
| POST | `/` | Creates the pipeline **and** the six default stages in one transaction. Duplicate name → 400 |
| PUT | `/:id` / DELETE `/:id` | Rename / delete (stages cascade; deals cascade with the pipeline) |
| POST | `/:id/stages` | Appends at `MAX(position)+1` |
| PUT | `/:id/stages/:sid` | Name + colour |
| PATCH | `/:id/stages/reorder` | `{ids:[...]}` → `reorderItems()`, one transaction, position = array index |
| DELETE | `/:id/stages/:sid` | Deals in that stage keep existing with `stage_id = NULL` (FK is `ON DELETE SET NULL`) |
| PATCH | `/deal-kanban-fields` | `{fields:[...]}` → `workspaces.deal_kanban_fields`. **No client calls this today** — the Deals board reads the column but nothing writes it. Leave it or wire it up deliberately |

### `/api/deals`

| Method | Path | Notes |
|---|---|---|
| GET | `/?pipeline_id=&contact_id=` | Flattens contact, supplier, stage (name+colour) and assignee into each row |
| GET | `/:id` | Plus the linked `objects[]` |
| POST | `/` | Requires `title` and `pipeline_id`. `urgency` clamped to 0–4. Notifies, and **fires the Engine** if the initial stage is a trigger stage |
| PUT | `/:id` | Full update. Reads the row first, and fires the Engine only when the stage actually **changed** |
| PATCH | `/:id/stage` | What drag & drop calls. Same before/after comparison |
| PATCH | `/:id/urgency` | `{urgency}` 0–4 |
| DELETE | `/:id` | |
| GET / POST | `/:id/objects` | Link listings to a deal (`deal_objects` join table) |
| DELETE | `/:id/objects/:objectId` | |

### `/api/objects` — "Listings"

| Method | Path | Notes |
|---|---|---|
| GET | `/` | |
| GET | `/:id` | Plus `deals[]` (with stage + pipeline) and `contacts[]` |
| POST / PUT / DELETE | `/`, `/:id` | `{name, custom_data}` |
| POST | `/:id/deals` | `{deal_id}`; verifies the deal belongs to this workspace first |
| DELETE | `/:id/deals/:dealId` | |
| GET / POST | `/:id/contacts` | `object_contacts` join table |
| DELETE | `/:id/contacts/:contactId` | |

### `/api/tasks` (+ attachments)

**Timezone.** `due_date`/`due_time` are stored exactly as typed, and `POST` / `PUT` stamp
`due_tz` — the zone the saving member was in — from `req.userTimezone` (`middleware/auth.js`
reads `users.timezone`), never from the body. The client shows every row on the viewer's own
clock (`taskDueShown()` → `toViewerClock()` in `public/js/clock.js`), so a Berlin member's 19:30 is
a Manila member's 01:30 next day and overdue is judged on the same instant by everyone. A NULL
`due_tz` predates the column and is read as `Europe/Berlin`. All-day tasks are dates and are not
converted. `tests/routes/timezone-stamp.test.js`, `tests/client/timezone-conversion.test.js`.

| Method | Path | Notes |
|---|---|---|
| GET | `/?list_id=` | Adds `subtask_count` / `subtask_done`, deal + contact titles, and `due_time` as `HH:MI` |
| GET | `/:id` | Plus `subtasks[]` |
| POST | `/` | `deal_id` / `contact_id` are verified against this workspace before insert. Subtasks (`parent_id`) do **not** notify |
| PUT | `/:id` | Full update (note the deliberate `$14` and `$15` at the end — `due_time` and then `due_tz` were appended later). Re-stamps `due_tz` with the editor's zone, which is the zone the edited time now means |
| PATCH | `/:id/status` | What kanban drag & drop calls |
| DELETE | `/:id` | Subtasks cascade |
| GET | `/:taskId/attachments` | |
| POST | `/:taskId/attachments` | **multipart**, field name `file`, 10 MB cap via multer memory storage → Supabase → row in `task_attachments`. Oversize → 400 |
| DELETE | `/:taskId/attachments/:id` | Removes the object from Supabase, then the row |

### `/api/task-projects`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Projects with `lists[]` and `statuses[]` pre-aggregated; a project with no stored statuses gets the four defaults synthesised in JS |
| POST | `/` | Case-insensitive unique name. Creates the four default statuses **and** a first list called "Tasks" |
| PUT / DELETE | `/:id` | |
| POST | `/:id/lists` | Case-insensitive unique within the project |
| PUT / DELETE | `/lists/:listId` | Note the path shape: `lists` is a literal segment, so it never collides with `/:id` |
| GET | `/:id/statuses` | Falls back to the defaults when empty |
| PUT | `/:id/statuses` | `{statuses:[...]}` — **delete-then-reinsert**, position = array index |

### `/api/notifications`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | member | Newest 50 **for `req.userId`** plus an `unread` count |
| PATCH | `/:id/read` | member | |
| PATCH | `/read-all` | member | |
| DELETE | `/clear` | member | Deletes only the ones already read |
| PATCH | `/preferences` | member | `{prefs:{contacts,deals,tasks,objects,activities}}` → `users.notification_prefs`, honoured by `notify()` |
| POST | `/announce` | **owner** | Workspace-wide system notice. ⚠️ Broken for workspaces with more than one member — see [§8](#8-first-ticket-starter-guide) |

### `/api/chat`

| Method | Path | Notes |
|---|---|---|
| GET | `/messages?before=<id>` | Newest 50, reversed to chronological order; `before` paginates backwards |
| GET | `/unread` | Count since `chat_reads.last_read_at` |
| POST | `/messages` | REST fallback for sending; also marks the sender read |
| PATCH | `/read` | Upserts `chat_reads` |

**socket.io** (set up at the bottom of `server.js`) is the live half. It reuses the Express
session via `io.engine.use(sessionMiddleware)`, disconnects anyone without a valid
`user_workspaces` row, and joins the socket to the room `ws-<workspaceId>`.

| Direction | Event | Payload |
|---|---|---|
| client → server | `chat_message` | the message string (ignored if empty or > 2000 chars) |
| server → room | `new_message` | `{id, content, created_at, user_id, user_name}` |
| server → room | `online_users` | `[{id, name}]`, emitted on every connect and disconnect |

Presence is an **in-memory `Map`** in the process. It does not survive a restart and does not
work across multiple instances — relevant the day we scale out.

### `/api/analytics`

| Method | Path | Notes |
|---|---|---|
| GET | `/summary?months=3\|6\|12&pipeline_id=` | The whole Analytics page in one response: counts, win rate, pipeline/won value, new-vs-previous-period deltas, task counts, `top_open_deals`, `by_owner`, `funnel`, `win_rate_trend`, `by_pipeline`, `all_stages`, `deal_fields`, the workspace `config` and the user's `layout`. `months` is whitelisted; anything else becomes 6 |
| PATCH | `/layout` | Per-user card order / hidden cards / section order / trend config, merged into `users.analytics_layout` with `||` |
| GET | `/trend?period=week\|month\|year` | `generate_series` buckets so empty days still appear |
| PATCH | `/config` | Per-workspace `{won_stage_ids, lost_stage_ids, value_field}`, merged into `workspaces.analytics_config`. `value_field` must exist in this workspace's `deal_fields` or it is rejected |

> Analytics is the only place that splices a name into SQL (`custom_data->>'<field>'`). It is
> guarded by `safeValueField()`. Read that function before you touch this file.

### `/api/integrations` — inbound webhook

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/settings` | member | **Creates** the `workspace_webhook` row with a fresh key on first view, and returns the pipelines, stages, custom fields and members the mapping UI needs |
| PATCH | `/settings` | member | `{field_map, create_deal, pipeline_id, stage_id, default_assignee_id, active}` |
| POST | `/settings/regenerate-key` | member | New 20-byte key; the old URL stops working immediately |
| GET | `/logs` | member | Last 50 `webhook_logs` rows |
| POST | `/receive/:key` | **public** | **120 / 15 min per IP** and **120 / min per key** (both in `server.js`). Resolves the key → workspace, maps the payload through `field_map` (dot paths supported), upserts the contact by email, optionally creates a deal, and always writes a `webhook_logs` row. 404 unknown/inactive key, 422 when neither name nor email could be mapped |

> Note the role gap: `/settings` and `/settings/regenerate-key` are **member**-level. Any member
> can repoint or rotate the inbound webhook. If that is wrong for us, it is a one-line fix
> mirroring `requireManage` in `routes/engine.js` — raise it rather than silently changing it.

### `/api/engine` — outbound "Upgrads Engine"

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/settings` | member | Creates the row on first view, pre-selecting the Analytics "won" stages as triggers. **The secret is only included for owner/admin**; members get `null` and `can_manage:false` |
| PATCH | `/settings` | owner, admin | `{engine_url, active, trigger_stage_ids}`. URL must be http(s) and **public** — an SSRF guard rejects localhost, `.local`, `.internal`, and private/loopback/link-local IPv4+IPv6 unless `ENGINE_ALLOW_PRIVATE_URLS=1`. Trigger ids are intersected with this workspace's real stages |
| POST | `/settings/regenerate-secret` | owner, admin | |
| GET | `/deliveries` | member | Last 50 attempts with status, attempt count and last error |
| POST | `/test-event` | owner, admin | Sends one `test.ping`, single attempt, awaited so the UI can show the result |

---

## 5. How it all intertwines

Six flows worth having in your head. Each one crosses files, and each one is where bugs hide.

### 5.1 Login → workspace → every subsequent request

```text
POST /api/auth/login
   ├─ one membership  → session.userId + session.workspaceId set → {user, workspace}
   └─ several         → session.userId ONLY → {needs_workspace_picker, workspaces}
                          └─ POST /api/auth/select-workspace {workspace_id}
                               └─ re-resolves the users row BY EMAIL + workspace_id
                                  and REPLACES session.userId with that row's id
                         ↓
public/js/auth.js init() → GET /api/auth/me → currentUser / currentWorkspace / kanbanFields /
                           contactColumns / dealColumns / objectColumns  → showApp()
                         ↓
showApp() → switchPage('deals') → loadDeals() → GET /api/pipelines, /api/deal-fields, /api/deals
         → initChatSocket() (socket.io handshake reuses the same session cookie)
         → startNotifPolling(), startClock(), maybeStartGuide()
                         ↓
every later fetch → middleware/auth.js re-reads user_workspaces → req.workspaceId
```

The thing to remember: **`session.userId` is workspace-scoped.** `switchWorkspace()` in
`public/js/auth.js` calls `POST /api/auth/switch-workspace`, which swaps the id, and the client
then calls `resetClientState()` + reloads. Anything cached client-side across that boundary is a
cross-tenant leak waiting to happen.

### 5.2 Moving a deal → the Engine

```text
drag a card  (public/js/deals.js → moveDealToStage)
   → PATCH /api/deals/:id/stage
       routes/deals.js
         ├─ SELECT stage_id, contact_id, title   (the "before" row)
         ├─ UPDATE deals SET stage_id
         ├─ notify(...)                          → notifications.js → notification rows
         └─ if stageNum(new) !== stageNum(before)
              └─ fireEngine() → utils/engine.js dispatchContractSigned()   [fire and forget]
                    ├─ getSettings(workspace)   → workspace_engine
                    ├─ bail unless active && engine_url && stage ∈ trigger_stage_ids
                    ├─ build payload  { event:'vertrag.unterschrieben', event_id, timestamp,
                    │                   kunde_id, vertrag_id, produkt, stage }
                    ├─ INSERT engine_deliveries (raw_body = the EXACT string sent)
                    └─ deliver(): up to 3 attempts, delays [0, 5s, 30s], 10 s timeout,
                         signed  X-Upgrads-Signature: sha256=HMAC(secret, "<ts>.<rawBody>")
                         every attempt UPDATEs the delivery row
   → GET /api/engine/deliveries renders exactly those rows on the Integrations page
```

`POST /api/deals` and `PUT /api/deals/:id` go through the same `fireEngine()` helper. The raw
body is stored and signed as one string on purpose: Postgres reorders JSONB keys, so a payload
rebuilt from the column would not match the signature.

### 5.3 An inbound lead becomes a contact (and maybe a deal)

```text
external form  → POST /api/integrations/receive/<webhook_key>     (public, rate limited twice)
   routes/integrations.js
     ├─ workspace_webhook WHERE webhook_key AND active       → 404 if not found
     ├─ pick() maps payload through field_map (supports "a.b.c" dot paths)
     ├─ neither name nor email? → log status='error' + 422
     ├─ unmapped keys → custom_data; what was dropped is recorded under captured._skipped
     ├─ email known?  UPDATE contacts   : INSERT contacts (assigned_to = default_assignee_id)
     ├─ create_deal && pipeline_id → INSERT deals (stage = configured, else the first stage)
     └─ INSERT webhook_logs (payload + captured + ids)        → GET /api/integrations/logs
```

The same "fall back to the pipeline's first stage" rule lives in `POST /api/contacts/import`.
If you change one, change both — they are the two bulk entry points for deals.

### 5.4 Calendar = activities ∪ tasks

`GET /api/calendar` is a `UNION ALL`, so **the Calendar page has no table of its own**. An entry
is editable only through the route that owns it:

```text
calendar.js renders a row with kind='activity'  → PATCH /api/activities/:id   (completed, date, time)
                               kind='task'      → PATCH /api/tasks/:id/status (done / not done)
```

Both halves filter on `workspace_id = $1`; `tests/routes/calendar-tasks.test.js` asserts exactly
that, because a missing filter in one half of a union is invisible in the UI.

### 5.5 Custom fields

One mechanism, four tables, no schema change per field:

```text
settings.js  ──POST /api/{fields|deal-fields|task-fields|object-fields}──► middleware/field-crud.js
                                                                              └─ {table} row
                                                                                 (name, field_key, type, options)
record save  ──PUT /api/contacts/:id  { custom_data: { <field_key>: value } } ──► contacts.custom_data JSONB
render       ──GET definitions + GET records ──► renderFieldInput() / the table renderers
```

Deleting a definition does **not** delete the values. Analytics can aggregate a numeric custom
field, which is the only reason `safeValueField()` exists.

### 5.6 Notifications and chat

```text
contacts/deals/tasks routes ──notify(workspaceId, actorId, {...})──► notifications.js
      └─ SELECT users WHERE workspace_id AND id != actor, filtered by notification_prefs[category]
         └─ one multi-row INSERT into notifications
activities / activity-comments ──@mention scan──► their own INSERTs (type 'mention')
public/js/notifications.js ──polls GET /api/notifications──► bell badge + panel
      └─ clicking one routes to the deal or contact it points at (entity_type / entity_id)

chat:  socket 'chat_message' → INSERT chat_messages + upsert chat_reads
                             → io.to('ws-<id>').emit('new_message')
       REST GET /api/chat/messages is the history/pagination path; /unread drives the badge
```

---

## 6. Developer Workflows

### Running the app

```bash
npm run dev     # nodemon, restarts on server-side changes
npm start       # plain node
```

Client-side changes need **no restart** — just reload; HTML/CSS/JS are served `no-store`.
Server-side changes (including anything in `initDb`) **do**.

### Tests

```bash
npm test             # everything: 35 files, 464 tests, no database needed
npm run test:routes  # tests/routes — route SQL + behaviour against a fake pool
npm run test:client  # tests/client — static + sandboxed assertions over public/js
npm run test:unit    # tests/unit — pure units
node --test tests/routes/calendar-tasks.test.js          # one file
node --test --test-name-pattern "summary strip" tests/client/deals-design.test.js
```

**Route tests** ([tests/helpers/load-route.js](tests/helpers/load-route.js)): the real route file
is loaded with `db.js`, `notifications.js` and `middleware/auth.js` replaced in
`require.cache`, then mounted on a throwaway Express app on a random port. You supply a `pool`
whose `query` returns canned rows and assert on **the SQL and the bound parameters** — which is
how workspace isolation is enforced in CI. Default fake user: `{id:1, workspaceId:7, role:'owner'}`.

```js
const calls = [];
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
const s = await serve({ '/api/calendar': loadRoute('calendar.js', { pool }) });
const r = await s.request('GET', '/api/calendar?start=2026-10-01&end=2026-10-31');
```

**Client tests** ([tests/helpers/client-fn.js](tests/helpers/client-fn.js)): `sliceFn()` pulls one
function's source out of a `public/js` file (failing loudly if it was renamed), and `loadFns()`
evaluates a set of them in one sandbox with fake state you can mutate via `__set()`.

```js
const F = loadFns('public/js/deals.js', ['visibleDeals'], {
  state: { deals: [], dealsUI: { q: '', stage: null, cf: {}, sel: [] } },
  extra: `const esc = s => String(s ?? ''); const t = k => k;`,
});
```

Static assertions over `index.html` and `style.css` in the same files are deliberate: they are
how we catch a renamed class or a dropped container without opening a browser.

### Linting, formatting, types

There are **none configured**. Match the surrounding style: aligned `const` blocks in server
files, compact helpers in `public/js`, and comments that explain *why*, not *what*. The closest
thing to a lint pass is `node --check <file>`, which the client test suites run for you.

### "Migrations"

There is no migration tool and no `migrations/` folder. [db.js](db.js) is it:

- **New column** → append one `ALTER TABLE … ADD COLUMN IF NOT EXISTS` inside `initDb()`,
  nullable or with a default. Nothing is backfilled unless you write that yourself.
- **New table** → add it to the `SCHEMA` string (or an `initDb` block if it needs to run after
  another one), always with `workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`.
- **Changing a CHECK constraint** → the existing pattern is `DROP CONSTRAINT IF EXISTS` then
  `ADD CONSTRAINT`, wrapped in a `try/catch` that rethrows anything but `42710`.
- **Never** edit a statement that already shipped — existing databases have already run it. Add
  a new one.
- Restart the server to apply. `npm test` will not catch a missing restart; the UI will, by
  silently not saving your new field.

### Debugging checklist

| Symptom | Look at |
|---|---|
| `Database init failed:` then exit | `DATABASE_URL`, `DATABASE_SSL`, is Postgres up |
| Every API call 401s | `user_workspaces` row missing for `(session.userId, session.workspaceId)` — the middleware destroys the session on purpose |
| A new field never saves | You added the column but did not restart; or you added it to `SCHEMA` instead of an `ALTER` (SCHEMA only runs `CREATE TABLE IF NOT EXISTS`) |
| 413 on import | More than 10 MB of CSV rows; the error handler turns `entity.too.large` into a friendly 413 |
| Engine delivery stuck `pending` | Retrying — `attempts`, `last_error` and `next_attempt_at` on the row say where it is. Only 5xx/408/429/network errors retry |
| Engine URL rejected | SSRF guard. For a local Engine set `ENGINE_ALLOW_PRIVATE_URLS=1` |
| Chat silent, badge stuck | socket handshake needs the session cookie; check the browser console for `connect_error`, and that `user_workspaces` still has you |
| Something off by one day | `new Date('2026-10-05')` is **UTC midnight**. Build dates from local parts; read dates back with `TO_CHAR(...)` |

---

## 7. Git & PR Standards

### Branches

Branch off `main`:

```text
feature/<short-name>     new behaviour
fix/<short-name>         bug fix
chore/<short-name>       deps, tooling, docs-only
```

Short, lowercase, hyphenated — `fix/deals-summary-strip`, not `fix/JIRA-123-the-thing-with-the-bar`.

### Commits

- Imperative mood, one logical change per commit: *"Show the deal summary strip in list view"*.
- Subject under ~72 chars; body explains **why** when the diff cannot.
- Do not mix a refactor and a behaviour change in one commit. Reviewers cannot see the bug
  through the noise, and neither can `git bisect`.

### Before you open the PR

1. `npm test` is green (464/464 today — if your change adds tests, the number goes up, never down).
2. The server boots clean: exactly `CRM running at http://localhost:3000`.
3. You clicked through the page you touched, in both light and dark theme if it was UI.
4. For a bug fix: **a test that fails before your change and passes after**. Say so in the PR,
   and paste the before/after output. This is non-negotiable for anything touching auth, roles,
   workspace scoping, or money.
5. `node --check` on any `public/js` file you edited (the client suites do this, but do it early).

### PR description

Three headings, always:

- **What changed** — the user-visible behaviour, then the mechanism.
- **Why** — the bug, the ticket, the decision. Link it.
- **How I verified it** — the exact commands and their output. "Tested locally" is not verification.

Call out explicitly: new environment variables, anything added to `initDb()` (it needs a deploy
restart), new `public/js` globals (they need a line in `resetClientState()`), and any change to
role checks.

### Review guidelines

As a reviewer, the five things worth blocking on:

1. A query that does not filter on `req.workspaceId`.
2. A value interpolated into SQL instead of bound.
3. A role check that reads a role from the request body instead of `req.userRole`.
4. A behaviour change with no test, or a test that would also pass before the change.
5. A client global added without a matching reset in `resetClientState()`.

Everything else — naming, structure, taste — is a comment, not a block. Be quick: a same-day
review on a small PR beats a thorough one on a week-old branch.

### Change logs

The repo keeps **append-only** markdown change logs per feature in the project root
(`DESIGN_PRO_CHANGES.md`, `SETTINGS_UI_CHANGES.md`, …), each part naming every file and line
touched and how it was verified. They are **gitignored** — local review records, not shipped
docs. New work goes at the bottom as a new part; earlier sections are never rewritten.

---

## 8. First Ticket Starter Guide

### Read these, in this order (about an hour)

1. **[middleware/auth.js](middleware/auth.js)** — 25 lines, and the reason the app is safely
   multi-tenant. Everything else assumes it.
2. **[server.js](server.js)** — every mount, every limiter, the CSP, and the socket handler in
   one readable file. Skim top to bottom once.
3. **[routes/contacts.js](routes/contacts.js)** — the most representative route: plain SQL,
   `req.workspaceId` everywhere, custom fields through `custom_data`, a notification, a bulk op,
   and a transaction (`/import`) all in one file.
4. **[public/js/core.js](public/js/core.js)** — `api.*`, `ui.*`, `esc`, `icon`, `t`/`tf`, the
   loader. Every other client file builds on these; nothing in `public/js` makes sense first.
5. **[tests/helpers/load-route.js](tests/helpers/load-route.js)** + any file in `tests/routes/` —
   so you know how to prove your change before you write it.

Then pick one page and follow it end to end. Deals is the richest:
`public/js/deals.js` → `routes/deals.js` → `utils/engine.js`.

### Good first tickets, roughly by blast radius

**Warm-up (client only, static tests):**
- Add a column to a list view: a key in the workspace's `*_columns` config plus a branch in the
  table renderer. `effectiveContactColumns()` / `effectiveDealColumns()` show the pattern.
- Add a translation key. Both `en` and `de` blocks in `core.js` — `tests/client/deals-design.test.js`
  has a test that asserts every Deals key exists in both languages. Copy that test for your page.

**Real but contained (one route + one test):**
- **Fix `POST /api/notifications/announce`.** `notifySystem()` in
  [notifications.js](notifications.js) builds its `VALUES` list with a stride of 6 placeholders
  per row but pushes only 4 params per row, so for two members it generates
  `($1,$2,…,$3,$4),($7,$8,…,$9,$10)` against 8 parameters. Postgres rejects it, the `try/catch`
  swallows the error, and the owner sees success while nobody gets the notice. Verified with a
  4-line script; works only for a single-member workspace today. Fix the stride to 4, then add a
  route test — `load-route.js` accepts the *real* `notifications.js` bound to a fake pool
  (the `notifications` option) precisely so this can be tested.
- Add a field type to [middleware/field-crud.js](middleware/field-crud.js) — one router, four
  tables, immediate payoff across Contacts, Deals, Tasks and Listings.
- Write a route test for an endpoint that has none. `tests/routes/` has ten examples;
  `routes/objects.js` and `routes/task-projects.js` have **no route tests at all** today (their
  *pages* are covered by client tests, which say nothing about the SQL).

**Worth a design conversation first:**
- The member-level role gap on `/api/integrations/settings` (any member can rotate the inbound
  webhook key). Mirror `requireManage` from `routes/engine.js` — but agree the policy first.
- `PATCH /api/pipelines/deal-kanban-fields` has no caller; `workspaces.deal_kanban_fields` is
  read by the Deals board but never written. Either wire a Settings control to it or remove it.

### Fixed — kept here because the reasoning is load-bearing

- **`reset-password` re-hashes the whole email, not one row** (2026-10-05).
  [routes/auth.js](routes/auth.js) used to run `UPDATE users SET password_hash=$1 WHERE id=$2`,
  changing the password of exactly ONE of a user's rows. With login's unordered
  `WHERE email = $1`, their new password then worked or failed depending on heap order — and since
  there is no change-password screen, `forgot-password` → `reset-password` is the only way any
  password changes, so every multi-workspace user hit it the first time they used it. It now runs:

  ```sql
  UPDATE users SET password_hash=$1 WHERE email=(SELECT email FROM users WHERE id=$2)
  ```

  which matches the "one email, one password, a row per workspace" invariant that
  `POST /api/auth/create-workspace` already relies on by cloning the hash, and repairs
  `'placeholder'` rows as a side effect. [tests/routes/reset-password-all-rows.test.js](tests/routes/reset-password-all-rows.test.js)
  locks it in: five cases, two of which fail against the old one-row statement. **Do not narrow
  this back to `WHERE id`** — that is the bug, not a tightening.

- **The `password_hash = 'placeholder'` row** (2026-10-05). `POST /api/workspace` — the route the
  UI's "+ Add workspace → Create" actually calls — used to insert the literal string
  `'placeholder'` as the new `users` row's hash, while its uncalled twin
  `POST /api/auth/create-workspace` copied the real one. Nobody could log in *with* that row
  (`bcrypt.compareSync(x, 'placeholder')` is always `false`), so it was not a weak password but an
  unusable one, and the risk was **account lockout**: `POST /api/auth/login` reads
  `SELECT * FROM users WHERE email = $1` with no `ORDER BY` and no `LIMIT`, then checks the
  password against whichever row came back first, so one placeholder row among a user's rows could
  refuse them their own correct password depending on heap order. It now copies
  `currentUser.password_hash`, and [tests/routes/workspace-password-hash.test.js](tests/routes/workspace-password-hash.test.js)
  asserts both that the stored hash is the real one and that `bcrypt.compareSync` against it
  succeeds — two cases that fail against the old `'placeholder'` literal.

  ⚠ **Rows written before this fix are still in the database.** They are repaired the first time
  that user runs a password reset (the email-wide `UPDATE` above), but not before. To repair them
  all at once:

  ```sql
  UPDATE users u SET password_hash = g.password_hash
  FROM (SELECT DISTINCT ON (email) email, password_hash
          FROM users WHERE password_hash <> 'placeholder'
         ORDER BY email, id ASC) g
  WHERE u.password_hash = 'placeholder' AND u.email = g.email;
  -- then: SELECT COUNT(*) FROM users WHERE password_hash = 'placeholder';
  -- any remainder is an email with no good row — those users must reset.
  ```

  This has NOT been run and is not wired into `initDb()`; it rewrites credential data, so it is a
  deliberate operator action.

### Known-dead things — do not "fix" them

- **`stages` table and `contacts.stage_id`.** Contact stages were removed from the product. Both
  are kept so old rows survive (labelled in [db.js](db.js)); nothing reads them, and no new
  workspace gets a contact "Stage" column — `tests/routes/default-contact-columns.test.js` locks
  that in.
- **`users.workspace_id`.** The original single-workspace home. `user_workspaces` is what
  actually authorises. Note that `notifications.js` still fans out using `users.workspace_id`;
  that works because a `users` row belongs to exactly one workspace, but do not read it as the
  membership table.
- **`reference/pro/`.** The design source the UI was ported from. Gitignored, read-only.

### Traps that have bitten people here

| Trap | What to do instead |
|---|---|
| `new Date('2026-10-05')` | UTC midnight → off-by-a-day in any timezone east of London. Build from local parts; see `taskDueAt()` in `public/js/tasks.js` |
| Reading a `DATE` column via `SELECT t.*` | The server-side twin of the row above, and it **has** bitten: node-pg returns a `DATE` as a JS `Date` at *local* midnight, and `res.json` emits it in UTC — one day early on any server east of UTC. Read every `DATE` as `TO_CHAR(col, 'YYYY-MM-DD')`. The calendar route did; `routes/tasks.js` didn't, so a task opened *from* the calendar showed one day less than the calendar. Only two `DATE` columns exist (`tasks.due_date`, `activities.event_date`) and both are now wrapped everywhere. Guard: `tests/routes/task-date-serialisation.test.js` |
| `new Date()` for "today" or "now" in `public/js` | That is the **browser's** clock. The user picked a timezone in Settings (`users.timezone`), and at 23:00 Berlin a browser at UTC+8 is already on tomorrow — so "Today" in the calendar's Upcoming card, the highlighted cell, the now-line and task overdue all drifted. Use `nowInTimezone(currentTimezone())` from `clock.js`; `calToday()` and `taskIsOverdue()`'s default already do. Stored dates and times are naive wall-clock values — convert nothing on save. Guard: `tests/client/calendar-timezone.test.js` |
| Showing a stored `due_time`/`event_time` as-is | That digit string was typed in **someone's** zone — `due_tz`/`event_tz` says whose. Shown raw, a Berlin member's 19:30 is a Manila member's 19:30 (six hours early), lands on the wrong day at the boundary and reads as overdue before it is due. Always go through `toViewerClock()` (or `taskDueShown()` / `dvDue()`), and bind `req.userTimezone || 'Europe/Berlin'` on every write. All-day values are dates: never convert them. Guard: `tests/client/timezone-conversion.test.js`, `tests/routes/timezone-stamp.test.js` |
| An empty `<input type="date">` that "looks filled" | Safari and the macOS picker paint an *empty* date input as today's date in grey. A user sees today, submits, and the value is `''` — the task saved with **no due date**, and only re-picking today made it stick. Never trust what a date input appears to show: gate the value on an explicit control (the create forms' "Set a due date" tick box, `due_on`, off by default) and **prefill real values** when it is switched on (`dvDefaultDue()`: today on the viewer's clock, +3 h, next quarter hour). Guard: `tests/client/task-form-due.test.js` |
| The `hidden` **attribute** on an element with a `display` rule | The browser's own `[hidden] { display: none }` is a UA rule; **any** author `display` — `.field-row { display: grid }` — beats it, so `el.hidden = true` did nothing and a "hidden" date row stayed visible and usable. Hide with the `.hidden` **class** (`display: none !important`, the house convention), and note `style.css` now ends with a global `[hidden] { display: none !important }` so the attribute cannot lose this way again. Static source tests cannot see the cascade — this one reached the user. Guard: `tests/client/task-form-due.test.js` |
| Rendering a stored activity note with `esc(a.content)` — or by *trusting* it | Notes are stored as **escaped text with `<br>`** (all four writers now; the modal used to store raw text, and the server stores whatever it is sent). `esc()` again shows `<br>` and `&amp;` literally (the Activities page bug). Trusting a string "because it contains a tag" is an XSS — a raw `<img onerror>` satisfies that test. Render every note with `dvActHtml()`: plain text first (`dvActText`), **then** `esc`, then newline → `<br>`. Search and CSV export read `dvActText` too. Guard: `tests/client/activities-notes.test.js` |
| Adding a column and not restarting | `initDb()` only runs at boot. Restart, then retest |
| Adding a `public/js` global | Add it to `resetClientState()` in `public/js/auth.js` or it leaks across logins in the same tab |
| Renaming a `public/js` function | `sliceFn()` fails loudly in the client tests. That is the feature; update the test |
| Trusting a workspace id from the body | Only `req.workspaceId` |
| Reaching for a headless browser | Use the static client tests — see `tests/client/` |
| Interpolating into SQL | Bind it. The only exception is `safeValueField()` in analytics |

### Getting help

- Data model, table by table: [DATA_INFRASTRUCTURE.md](DATA_INFRASTRUCTURE.md)
- Product and operator view: [README.md](README.md)
- Outbound contract: [ENGINE_INTEGRATION.md](ENGINE_INTEGRATION.md) (local, gitignored)
- Recent feature history: the `*_CHANGES.md` logs in the project root (local, gitignored)
- Anything else: ask early in the team channel. A five-minute question beats a day of archaeology,
  and if the answer was not obvious from this file, that is a bug in this file — fix it in your PR.

---

## 9. Where every function lives

This guide stops at the architecture on purpose. The function-by-function
detail lives **in the files themselves**: every one of the 51 source files now
opens with a header block that explains what the file owns, how you get into
it, what it reads and writes, and a FUNCTION MAP grouping its functions by
concern. Documentation next to the code stays true far longer than a central
index, and `git blame` shows you when it last changed.

**So: to understand any file, open it and read the top 30 lines first.**

### The map of maps

| Read this header | When you need |
|---|---|
| [middleware/auth.js](middleware/auth.js) | the tenancy rule — read this one first, always |
| [server.js](server.js) | the middleware order, every route mount, socket.io |
| [db.js](db.js) | the schema, how to add a column or table, what is dead |
| [public/js/core.js](public/js/core.js) | `api.*`, `ui.*`, `esc`, `t`, the shared globals |
| [public/js/auth.js](public/js/auth.js) | `init()`, `switchPage()`, workspace switching, `resetClientState()` |
| [public/js/detail-views.js](public/js/detail-views.js) | the deal / contact / task drawers |
| [middleware/field-crud.js](middleware/field-crud.js) | custom fields — one router, four tables |
| [utils/engine.js](utils/engine.js) | outbound deliveries, signing, retries |

### By area

| Area | Server | Client |
|---|---|---|
| Auth, workspaces | [routes/auth.js](routes/auth.js), [routes/workspace.js](routes/workspace.js), [routes/invites.js](routes/invites.js) | [auth.js](public/js/auth.js) |
| Deals | [routes/deals.js](routes/deals.js), [routes/pipelines.js](routes/pipelines.js) | [deals.js](public/js/deals.js), [detail-views.js](public/js/detail-views.js) |
| Contacts, suppliers | [routes/contacts.js](routes/contacts.js) | [contacts.js](public/js/contacts.js), [modals.js](public/js/modals.js), [admin-import.js](public/js/admin-import.js) |
| Tasks | [routes/tasks.js](routes/tasks.js), [routes/task-projects.js](routes/task-projects.js), [routes/task-attachments.js](routes/task-attachments.js) | [tasks.js](public/js/tasks.js), [detail-views.js](public/js/detail-views.js) |
| Listings, Board, Activities | [routes/objects.js](routes/objects.js), [routes/activities.js](routes/activities.js), [routes/activity-comments.js](routes/activity-comments.js) | [objects.js](public/js/objects.js) |
| Calendar | [routes/calendar.js](routes/calendar.js) | [calendar.js](public/js/calendar.js) |
| Analytics | [routes/analytics.js](routes/analytics.js) | [analytics.js](public/js/analytics.js) |
| Chat | [routes/chat.js](routes/chat.js) + socket.io in [server.js](server.js) | [chat.js](public/js/chat.js) |
| Notifications | [routes/notifications.js](routes/notifications.js), [notifications.js](notifications.js) | [notifications.js](public/js/notifications.js) |
| Integrations | [routes/integrations.js](routes/integrations.js), [routes/engine.js](routes/engine.js), [utils/engine.js](utils/engine.js) | [integrations.js](public/js/integrations.js) |
| Settings | [routes/workspace.js](routes/workspace.js), the four field routers | [settings.js](public/js/settings.js), [clock.js](public/js/clock.js) |
| Platform admin | [routes/admin.js](routes/admin.js), [routes/platform.js](routes/platform.js), [utils/features.js](utils/features.js) | [admin-import.js](public/js/admin-import.js), `public/admin.html` |
| Product tour | [routes/platform.js](routes/platform.js) | [guide.js](public/js/guide.js) |

### Finding a function fast

```bash
grep -rn "^\(async \)\?function myFunction" public/js routes middleware utils   # the definition
grep -rn "myFunction(" public/js routes                                           # every caller
grep -rn "myFunction" public/index.html                                           # inline handlers
```

A client function may also be wired from an inline `onclick=` in
`public/index.html`, which `grep` over `public/js` alone will not show you —
check there before assuming a function is dead.
