# Local (embedded) mode — change log

Append-only. Each part names every file and line it touched. Line numbers are as of the end of
that part.

---

## Part 1 — 2026-10-09 — plug-and-play: no .env, no Postgres install, no Supabase

**Goal.** Hand the CRM to another computer and have `npm install` + `npm run dev` be the whole
setup. With no `DATABASE_URL`, Postgres runs inside the Node process (PGlite, WebAssembly) and
writes to `data/pgdata`; uploaded files go to `data/files`; the session secret and the key that
signs document links are generated once into `data/secrets.json`. With `DATABASE_URL` set,
nothing changes. SQLite was ruled out: 503 Postgres-specific statements (RETURNING, ON CONFLICT,
`::` casts, FILTER, LATERAL, INTERVAL, TIMESTAMPTZ/JSONB) would have had to be rewritten and the
fake-pool tests could not have caught the breakage.

**How it works.** `embedded.start(pool)` boots PGlite, opens a Postgres-wire-protocol server
(pglite-socket) on 127.0.0.1 at a free port and writes that port into `pool.options`; the `pg`
driver, every route, connect-pg-simple and `initDb()` are untouched, so types (dates, bigints as
strings, jsonb) and error codes (23505) arrive exactly as from hosted Postgres. The pool is
capped at ONE connection because PGlite is single-connection and the socket forwards wire
messages one at a time (two connections could interleave one statement's Parse/Bind with
another's). Consequence: no `pool.query` may run while a transaction's `client` is held — one
such call existed and is fixed below; a test now scans for the pattern. PGlite does not lock its
folder against a second process (measured), so a lock file refuses a second start while the
recorded pid is alive; a stale lock is taken over.

**Verification (not eyeballed).** `tests/unit/embedded-mode.test.js` boots the real PGlite +
socket + the real `pg` Pool built from db.js's own config + the real `initDb()` on an empty temp
folder, then checks tables, the first-run invite code, types, 23505, a transaction, parallel
queries, connect-pg-simple's table, secrets.json (mode 0600), the lock (refusal + stale
takeover), persistence across a restart and a clean stop. Full suite after this part:
`# pass 1310 # fail 0` across 90 files (was 1255 across 85). No server was started.

### New files
- `embedded.js` (190 lines) — data folder paths (`DATA_DIR`, default `./data`; override with
  `DATA_DIR`), `secrets()` / `sessionSecret()` / `fileKey()` (generated into `data/secrets.json`,
  mode 0600; `SESSION_SECRET` wins; falls back to the old constant only if the file cannot be
  written), `acquireLock()` / `releaseLock()` (`data/pgdata.lock`, pid + liveness check),
  `start(pool)` (PGlite on `data/pgdata`, pglite-socket on port 0, `pool.options.port` set,
  idempotent, lazy `require` of the WASM packages), `stop(pool)`, shutdown on
  SIGINT/SIGTERM/SIGUSR2 (nodemon's restart signal) that closes pool → socket → PGlite → lock.
- `routes/files.js` (87 lines) — serves the local backend. `GET /files/documents/*`: signed,
  sessionless (the Engine follows the 302 with no cookie); HMAC + expiry verified before any
  lookup; row looked up by `storage_path` for name/type; 403 bad/expired link, 404 otherwise.
  `GET /files/task-attachments/*`: `requireAuth`, first path segment must equal the caller's
  workspace (404, never 403), row looked up with `workspace_id`. No router-wide `requireAuth`
  on purpose. Headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, RFC 6266
  `Content-Disposition: inline` with the UTF-8 name.
- `nodemon.json` (3 lines) — `ignore: ["data/**", "logs/**"]`. Without it every PGlite write
  and the first-boot `secrets.json` would restart the dev server mid-write.
- `LOCAL_MODE_CHANGES.md` — this file.

### Rewritten
- `storage.js` (166 lines, was 96) — two backends chosen once at boot: `BACKEND = 'local'`
  unless both `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set (then the previous Supabase code,
  unchanged in behaviour; `@supabase/supabase-js` is now required lazily, lines 93–101).
  Local: files under `data/files/task-attachments|contact-documents/<ws>/<owner>/<ts>-<name>`,
  exclusive-create writes (line 79), `isSafeStoragePath` = exactly three `[A-Za-z0-9._-]`
  segments none of which is only dots (lines 52–58), `localPath` resolves and re-checks
  containment (lines 67–73), `signedDocumentUrl` → `/files/documents/<path>?exp=&sig=` with
  HMAC-SHA256 over `path\nexp` keyed by `embedded.fileKey()` (lines 84, 147–156),
  `verifySignedDocument` constant-time (lines 87–95). `uploadFile` returns
  `publicUrl = /files/task-attachments/<path>` locally (line 109). Same exported interface as
  before plus `BACKEND, LOCAL_DIRS, isSafeStoragePath, localAttachmentPath, localDocumentPath,
  verifySignedDocument` (lines 162–166).
- `.env.example` (67 lines) — header says no .env is needed and what embedded mode does
  (lines 1–11); `DATABASE_URL` / `DATABASE_SSL` commented out as the non-default, `DATA_DIR`
  added (lines 13–21); `SESSION_SECRET` documented as generated when unset (lines 24–25); file
  storage section describes the local default (lines 35–41). Every other variable unchanged.

### Edited
- `db.js` lines 49–66 — the pool: comment block (49–59), `const EMBEDDED =
  !process.env.DATABASE_URL` (60), embedded config `{ host: '127.0.0.1', port: 0, user:
  'postgres', database: 'postgres', ssl: false, max: 1 }` vs the previous connection-string
  config (61–66). Nothing else in db.js changed; `initDb()` is untouched.
- `server.js` line 52 — `const embedded = require('./embedded')`.
- `server.js` line 145 — session `secret: embedded.sessionSecret()` (was
  `process.env.SESSION_SECRET || 'change-me-in-production'`).
- `server.js` lines 205–206 — `app.use('/files', require('./routes/files'))`, after the
  `/api/dokumente` mounts, before `/adminconsole` and the catch-all.
- `server.js` lines 310–316 — boot chain now `embedded.start(pool).then(info => { …log…;
  return initDb(); })` ahead of the unchanged `.then(listen…)` / `.catch('Database init failed')`.
- `routes/auth.js` lines 519–521 — POST create-workspace: the workspace SELECT after COMMIT uses
  `client.query` instead of `pool.query` (the one call that would deadlock a one-connection pool),
  with a two-line comment.
- `routes/task-attachments.js` lines 9–20 — header comment: two backends, no longer "REQUIRES
  SUPABASE".
- `routes/contact-documents.js` lines 9–13 — header comment: local default, signed link from
  routes/files.js.
- `routes/engine-dokumente.js` lines 6–9 — header comment: 302 to `/files/documents/…` locally.
- `.gitignore` lines 65–66 — `data/`.
- `package.json` lines 18–19 — dependencies `@electric-sql/pglite ^0.5.8`,
  `@electric-sql/pglite-socket ^0.2.11` (pglite-socket pins pglite to an exact version; a test
  checks the installed pair). `package-lock.json` regenerated by `npm install` — the previous
  lock (2025-09-23) predated several dependencies; 49 stale packages left `node_modules`, all 13
  declared dependencies verified loadable.
- `README.md` lines 171, 173 (stack table), 186–188 (prerequisites), 199–234 (quickstart: start
  first, env file only for a Postgres server), 242–245 (verify step 1), 255–257 (test counts),
  259–263 (first account via the printed code), 385–396 (env table: nothing required, `DATA_DIR`
  row, `data/` ignored).
- `DATA_INFRASTRUCTURE.md` lines 12, 15 — Database and File storage rows of the stack table.

### Tests
- `tests/helpers/load-db.js` lines 9–12, 21 — `pool` may be a function receiving the config
  db.js builds (used to capture it and to build a real `pg` Pool from it). Backwards compatible.
- `tests/unit/embedded-mode.test.js` (168 lines, new) — the live boot described above.
- `tests/unit/single-connection.test.js` (79 lines, new) — scans server.js, db.js,
  notifications.js, routes/, middleware/, utils/ for `pool.query|connect` between
  `pool.connect()` and `client.release()` (13 blocks, 0 hits); pins the auth.js fix; checks the
  two db.js pool configs (unset / empty / set / set + `DATABASE_SSL=false`).
- `tests/unit/embedded-wiring.test.js` (75 lines, new) — server.js order (start → initDb →
  listen), `embedded.sessionSecret()`, `/files` before the catch-all, dependencies incl. the
  pglite/pglite-socket version pair, nodemon.json, .gitignore, .env.example, routes/files.js
  gates.
- `tests/unit/storage-local.test.js` (118 lines, new) — backend selection (Supabase client never
  loaded locally), file placement, hostile names, `isSafeStoragePath`, exclusive create, signed
  links (valid / stretched / other file / one char off / expired-but-correctly-signed), key from
  secrets.json, delete semantics.
- `tests/routes/files.test.js` (115 lines, new) — real HTTP against the route with the real local
  backend on a temp `DATA_DIR`: 200 with bytes/name/type/headers, 403 variants with no row
  lookup, 404 for no row / missing file, traversal (encoded and plain, sent verbatim via
  `http.request`) → 404 before any check, workspace mismatch → 404 before any lookup.

### Not done / to know
- The user's own checkout still has a `.env` with `DATABASE_URL` → Supabase; embedded mode
  starts only when that file is renamed or the variable removed.
- `ADMIN_SECRET` stays optional: the admin console is off without it; the first account comes
  from the invite code printed at first boot (already in db.js, lines 649–660).
- Existing Supabase-hosted rows (`task_attachments.file_url` = supabase.co URLs) are not
  migrated; embedded mode is for fresh databases.
- No server was started during this work (user preference); `npm run dev` with no `.env` is
  the remaining manual check.

---

## Part 2 — 2026-10-10 — open signup: no codes to create a workspace or add users

**Goal.** In the local, plug-and-play version nobody should need an invite code: anyone who can
reach the server creates a workspace, or joins an existing one, from the login screen. Hosted
installs (a `DATABASE_URL`) keep the codes.

**How it works.** One decision, `openSignup()` in `utils/open-signup.js`: `OPEN_SIGNUP=true` /
`false` wins; unset means open in embedded mode (no `DATABASE_URL`) and closed otherwise. Read at
call time. In open mode: 'create' asks for no platform code (a pasted one is ignored, nothing is
looked up or consumed); 'join' takes a `workspace_id` chosen from the new public
`GET /api/auth/signup-options` (id + name of every workspace; with a session, minus the caller's
own) and always makes a **member**. A workspace invite code still works in open mode and is the
way to arrive as admin. The same two helpers serve the logged-in `create-workspace` /
`join-workspace` and `POST /api/workspace`. The client fetches the options before the door
paints and whenever a workspace modal opens; code fields hide, a workspace `<select>` appears
for "join", `required` moves with it so a hidden input never blocks the form. The first-run
invite box in db.js is skipped in open mode (the row is still written); server.js prints an
"Open signup" notice instead.

**Verification.** `tests/routes/open-signup.test.js` drives routes/auth.js and
routes/workspace.js over real HTTP in both modes (31 cases); `tests/unit/open-signup.test.js`
pins the decision table and the db.js / server.js behaviour; `tests/client/open-signup-ui.test.js`
pins the markup, the auth.js branches and the dictionary (impersonal German). Full suite after
this part: `# pass 1355 # fail 0` across 93 files (was 1310 across 90). No server was started.

### New files
- `utils/open-signup.js` (20 lines) — `openSignup()`.
- `tests/routes/open-signup.test.js` (204 lines), `tests/unit/open-signup.test.js` (79 lines),
  `tests/client/open-signup-ui.test.js` (90 lines).

### Edited — server
- `routes/auth.js` lines 23–28 (header: OPEN SIGNUP paragraph), 31 (endpoint list), 69 (require),
  71–96 (`checkPlatformInvite`, `resolveJoinTarget`), 263–280 (`GET /signup-options`), 296–298
  (signup 'create' uses the helper instead of the inline code check), 366 (`UPDATE
  platform_invites` only when a code was used), 388–390 (signup 'join' resolves its target),
  396 (users row takes `workspaceId`), 399 (`UPDATE invite_codes` only when a code was used),
  405, 409 (user_workspaces / session take `workspaceId`), 524–526 (create-workspace), 551
  (its `UPDATE platform_invites` guarded), 582–584 (join-workspace), 592, 597, 602 (`workspaceId`
  replaces `invite.workspace_id`), 607 (`UPDATE invite_codes` guarded), 609, 615 (`workspaceId`).
- `routes/workspace.js` line 32 (header), 48 (require), 57–64 (POST /: the code check only when
  closed), 148 (`UPDATE platform_invites` guarded).
- `db.js` line 48 (require), 669–678 (first-run box only when closed; the row is always written).
- `server.js` line 53 (require), 319 (the boot notice, before `httpServer.listen`).

### Edited — client
- `public/js/auth.js` line 81 (`init` awaits `loadSignupOptions()` before `showAuth()`), 111
  (`showAuth` refreshes and re-toggles), 179–215 (`signupOptions`, `loadSignupOptions`,
  `fillWorkspaceSelect`, `applyJoinMode`), 217–233 (`toggleSignupMode`: open hides both code
  fields, shows the picker for join, swaps the subtitle key), 422–428 (`openJoinWorkspaceModal`
  async, applies the mode), 437 (`openCreateWorkspaceModal` hides `#cw-code-field`), 466
  (`showJoinWorkspace` applies the mode to the auth view), 484–490 (`handleJoinWorkspace` posts
  `workspace_id` or `invite_code`), 511–521 (`handleSignup`: client-side pick check, sends
  `workspace_id`), 621 (`resetClientState` resets `signupOptions`).
- `public/index.html` lines 226–232 (signup form: `#su-workspace-pick-field`, `#su-workspace-pick`,
  `#su-workspace-pick-empty`), 304–312 (auth join view: `data-join="code"` wrapper, new
  `data-join="pick"` field with `#join-ws-auth-pick`), 1372–1380 (in-app join modal: same, with
  `#join-ws-pick`), 1434 (`#cw-code-field`).
- `public/js/core.js` lines 284–287 (en) and 708–711 (de): `au_sub_signup_open`,
  `auth_pick_workspace`, `auth_pick_workspace_help`, `auth_no_workspaces_yet`,
  `auth_join_all_joined`, `auth_pick_required`, `au_sub_join_open`.

### Edited — tests, docs
- `tests/helpers/load-route.js` lines 42–45 — optional `db` module for a route (auth.js
  create-workspace needs `seedDefaultPipeline`, which the `{ pool }` default lacks — the one
  failure the first run showed, as a 500 "seedDefaultPipeline is not a function").
- `tests/helpers/load-db.js` lines 14–16, 23 — a relative `require` inside db.js (its new
  `./utils/open-signup`) resolves against the app root.
- `tests/unit/embedded-mode.test.js` line 30 — runs with `OPEN_SIGNUP=false`, since the invite box
  it checks is closed-mode behaviour.
- `.env.example` lines 29–33 — `OPEN_SIGNUP`.
- `README.md` lines 28–41 (Getting in: open signup vs codes), 122–123 (Inviting people),
  217–219 (quickstart: signup is open), 266 (test counts), 270–274 (verify step 5), 398 (env
  table row).

### To know
- Hosted / `DATABASE_URL` installs are unchanged unless `OPEN_SIGNUP=true` is set deliberately.
- Open signup is exactly as open as it sounds: anyone who can reach the server can create a
  workspace or join any existing one as a member. That is the point for a LAN-internal tool; it
  is not for a public URL.
- The admin console still works and still issues platform codes; they are simply not needed in
  open mode.

---

## Part 3 — 2026-10-12 — admin console without a secret, port 4001, storage wording

**Goal.** Three asks for the local build. (1) The admin console at `/adminconsole` showed an
"Admin Secret" password field that could never be satisfied without a `.env` (the API answered
503) — remove it. (2) File storage must be the Mac's own disk, nothing to install beyond `npm` —
it already is (Part 1: `data/files`), but the console's Engine tutorial still described Supabase
as the only place for documents; fix the wording. (3) Serve on port 4001 instead of 3000.

**How it works.** `utils/open-admin.js` — `openAdmin()`, the same shape as `openSignup()`:
`OPEN_ADMIN=true/false` wins, unset means open in embedded mode (no `DATABASE_URL`) and closed
otherwise. The gate in `middleware/admin-auth.js` passes everything when open (after still
scrubbing any `admin_secret` out of the body). `GET /api/admin/me` answers `{ isAdmin, open }`;
when open the console skips its login screen, hides Logout and shows a one-line notice saying how
to lock it again; `POST /api/admin/login` succeeds without a secret. Hosted installs are
unchanged. The default port is 4001 in every place a localhost URL is built; the production
LaunchDaemon now sets `PORT=3000` explicitly so the Mac mini does not move (a `.env` PORT still
overrides it).

**Verification.** `tests/unit/open-admin.test.js` — decision table, the gate in both modes, and
`/me` + `/login` over real HTTP open / closed-no-secret / closed-with-secret;
`tests/unit/default-port.test.js` — every fallback says 4001, README says 4001, the plist pins
3000; `tests/client/admin-open.test.js` — the console's `open` handling, the notice, the storage
wording. The three existing tests of the secret-gated console now opt into `OPEN_ADMIN=false`
(the test environment has no `DATABASE_URL`, so the default there is open, like the local
build). Full suite after this part: `# pass 1374 # fail 0` across 96 files (was 1355 across 93).
No server was started.

### New files
- `utils/open-admin.js` (21 lines) — `openAdmin()`.
- `tests/unit/open-admin.test.js` (87 lines), `tests/unit/default-port.test.js` (30 lines),
  `tests/client/admin-open.test.js` (27 lines).

### Edited
- `middleware/admin-auth.js` (54 lines, rewritten header) — lines 7–10 (way 0: open admin), 27
  (require), 36–40 (the secret is scrubbed from the body before any decision), 43 (`if
  (openAdmin()) return next()`), 44 (session), 46–50 (secret, unchanged).
- `routes/admin.js` lines 8–11 (header), 45 (require), 47–52 (`/me` answers `{ isAdmin, open }`),
  55 (`/login` succeeds without a secret when open; the closed path below is unchanged).
- `public/admin.html` lines 302–303 (the `#admin-open-notice` line, hidden by default), 666
  (Engine tutorial: documents live locally under `data/files` by default, Supabase optional —
  the `<strong>private</strong> Supabase bucket <code>contact-documents</code>` phrase the
  existing tutorial test pins is kept), 732 (documents section: local folder by default, signed
  link), 920–921 (`checkAdminStatus`: no Logout and the notice when `open`).
- Port: `server.js` line 58, `embedded.js` line 112 (the lock message's `lsof` hint),
  `routes/auth.js` line 448 (reset-link base), `routes/admin-provision.js` line 139 (login URL
  handed to a provisioned owner) — `process.env.PORT || 4001`.
- `deploy/com.upgrads.crm.plist` lines 29–31 (comment), 36–37 (`PORT` = `3000`). Validated with
  `plutil -lint`.
- `.env.example` line 27 (`PORT=4001`), 34–36 (`OPEN_ADMIN`), 65–66 (`APP_URL` / `BASE_URL`
  examples on 4001).
- `README.md` lines 167–174 (the platform admin console: open in the local build), 256, 264, 274
  (verify steps on 4001), 271 (test counts), 404 (env table: port 4001), 405 (env table:
  `ADMIN_SECRET`, `OPEN_ADMIN`).
- `readmedev.md` lines 147, 169, 181, 182, 185, 980 — 3000 → 4001. `deploy/README.md` keeps
  3000: that is production.
- `tests/unit/admin-auth.test.js` lines 24–25, `tests/routes/admin-engine.test.js` line 6,
  `tests/routes/admin-provision.test.js` line 21 — `OPEN_ADMIN=false`: they test the gate.

### Not changed, on purpose
- Provisioning a workspace from the console still generates the owner's first password and
  shows it once. That password is the owner's login credential, not a console password; without
  it the owner could not sign in. Say so if that is the one you meant and we will look at it
  separately (e.g. provisioning without an owner under open signup).
- The in-app `?admin` screen (invites only) reads the same `/api/admin/me` and opens the same way.
- The user's own machine still has the renamed env file (`.notenv`) with the Supabase settings;
  `.gitignore` does not cover that name.

---

## Part 4 — 2026-10-12 — end-to-end check of the local build; two things it found

**Ask.** "Double check everything saves when editing in the interface, make sure nothing is
broken including the team chat" — and add `.notenv` to `.gitignore`.

**How it was checked.** Static tests cannot prove that a PATCH lands in PGlite or that a chat
message travels through socket.io, so server.js gained a `start()`/`stop()` pair and
`tests/integration/app-smoke.test.js` boots the REAL app — the real routes, express-session on
connect-pg-simple, multer, storage, socket.io — on a random port against an embedded database in
a temp folder, exactly as `npm run dev` with no `.env` would, then drives the interface's save
paths over real HTTP with a real session cookie and the team chat through a real socket.io
client. Every write is followed by a read that proves it landed. Covered: open signup (create;
a second person joining by picking the workspace), contacts (create/edit/custom field), deals
(create/edit value/move stage), tasks (create with due date + time/edit/status), activities
(create/edit), workspace settings (name, WhatsApp template, contact columns), user preferences
(timezone, deal columns), roles (member refused, owner promotes), team chat (Ada sends, Bob
receives live, row stored, non-string payload ignored, read marker), documents (upload with an
umlaut name, list, 302 to the signed link, bytes back, file on disk under `DATA_DIR/files`,
delete), notifications fan-out, calendar, analytics summary, the open admin console and its
stats, and a clean stop (lock released, data folder intact). It leaves no process and no temp
folder behind; the repo's own `data/` is never touched. `node server.js` boots as before through
the `require.main` block.

**Found and fixed — umlauts in uploaded file names.** Browsers send the multipart `filename` as
raw UTF-8 bytes; multer 2.x decodes it as latin1 unless told otherwise, so "Vertrag Müller.pdf"
was stored and shown as "Vertrag MÃ¼ller.pdf" (the storage path was fine — `safeName` strips
non-ASCII anyway). Both upload routes now pass `defParamCharset: 'utf8'`. The smoke test failed
on exactly this before the change and passes after; `tests/unit/upload-filename-charset.test.js`
pins the option.

**Found, not changed — `PUT /api/tasks/:id` without `status`.** The update writes `status`
straight from the body; a request that omits it is a 500 (NOT NULL violation), where the create
route defaults to `'todo'`. The interface is not affected: both callers (`taskPutPayload` in
public/js/tasks.js, `payload()` in detail-views.js) always send the full task including status,
and the smoke test now sends it the same way. A COALESCE or a 400 would be the fix; left for the
one-at-a-time review list.

**Full suite after this part:** `# pass 1393 # fail 0` across 98 files (was 1374 across 96).

### New files
- `tests/integration/app-smoke.test.js` (251 lines) — the end-to-end check above.
- `tests/unit/upload-filename-charset.test.js` (25 lines).

### Edited
- `server.js` lines 144–146 (the session store is a named constant so `stop()` can close it),
  312–347 (`start(port)`: embedded → initDb → open-signup notice → listen → retry worker, returns
  the port; `stop()`: retry worker → connections → io/http → session store → embedded database;
  `if (require.main === module) start().catch(… process.exit(1))`; `module.exports = { app,
  httpServer, io, start, stop }`). Same boot order and messages as before.
- `routes/contact-documents.js` lines 36–39 — `defParamCharset: 'utf8'` with the why.
- `routes/task-attachments.js` line 38 — the same option.
- `.gitignore` lines 68–69 — `.notenv`.
- `package.json` lines 32–34 — devDependency `socket.io-client ^4.8.4` (tests only; `npm install`
  brings it, production `npm ci --omit=dev` does not). `package-lock.json` updated.
- `tests/unit/embedded-wiring.test.js` lines 17–22 — pins the new shape (`await
  embedded.start(pool)` before `await initDb()` before `httpServer.listen(`, the `require.main`
  block, the exports).
- `README.md` lines 271–275 — test counts, and what the smoke test is.

### Not covered, said plainly
- The browser itself: no DOM was driven (headless Chrome is not usable on this Mac). The client
  side is covered by the static tests in tests/client; the server side of every save by this part.
- A restart of the same server.js module in one process (embedded.js's state is per module
  instance) — persistence across a restart is proven in tests/unit/embedded-mode.test.js instead.

---

## Part 5 — 2026-10-12 — one-click backup: daily archive, console buttons, restore

**Ask.** A backup that nobody has to remember: a Download button in the admin console, a daily
archive written automatically while the app runs, a restore path, and an end-to-end test that
backs up, restores into a fresh folder and compares. Backups will mostly be driven by Claude from
the terminal, so the defaults had to be deterministic and scriptable.

**What one archive holds.** `crm-backup-<date>[-<time>].tar.gz`: `manifest.json` (format,
versions, counts), `pgdata.tar.gz` (PGlite's own dump of the data directory, stored as-is),
`secrets.json`, and every upload under `files/`. Database first, files second, so a document row
in the dump always has its file. The archive is sensitive (it holds the session key); the card and
the README say so. Any tar tool opens it (`tar -tzf`).

**How the snapshot stays consistent while the app runs — found while planning.** PGlite's
`dumpDataDir()` neither checkpoints nor takes the query mutex, and `query()` and
`runExclusive()` share one mutex that is not reentrant, so the obvious "CHECKPOINT inside
runExclusive" would deadlock (verified in the 0.5.8 bundle). The shape that works: CHECKPOINT
through the app's own pool (max 1: it queues behind every route statement and can never cut into
a wire exchange), then `db.runExclusive(() => db.dumpDataDir('gzip'))` so no statement runs during
the directory walk. The integration test takes a snapshot while 20 queries are in flight.

**Restore.** PGlite's `loadDataDir` refuses only when `pgdata/PG_VERSION` exists and never clears
the target, so a restore validates the whole archive first, compares the inner `PG_VERSION` with
the current one (`--force` overrides), moves `pgdata`, `files` and `secrets.json` aside as
`*.before-restore-<stamp>` (never deletes), extracts, loads the inner tar into a fresh `pgdata`
through PGlite and proves recovery with one query; a failure after the move puts everything back.
Command-line only (`npm run restore -- <file> [--yes] [--force]`), because the live database
cannot be replaced while the server has it open. Both scripts take `data/pgdata.lock` and refuse
with exit 2 while the CRM runs.

**Where.** `<repo>/backups` by default (`BACKUP_DIR` overrides): beside `data/`, deterministic for
scripts, visible in `ls`; not inside `data/` so the file scan never archives archives and wiping
`data/` keeps the backups. The daily archive is one per local calendar day while the app runs
(checked 10 s after boot and hourly), newest `BACKUP_KEEP` (14) kept, `BACKUPS=0` turns the timer
off; the console buttons and `npm run backup` still work then. Every scheduler tick is caught and
logged; a failure never reaches the process.

**Verification.** `tests/unit/tar.test.js` (header bytes, round trips incl. 0-byte, exact-block,
prefix-split and PAX long names, UTF-8 by byte length, chunking, truncation/zero-fill, gzip,
traversal refusal, containment; the system `tar` lists the same names), `tests/unit/backup.test.js`
(config, names, entries, BUSY, .part discipline, vanished file, listing, pruning, scheduler
decisions), `tests/integration/backup-restore.test.js` (real PGlite on folder A → archive with 20
queries in flight → restore into folder B with a refused version mismatch, a refused live lock, a
forced restore moving junk aside → B boots and holds the same rows, bytes and secrets; the daily
scheduler on a real database; pruning), `tests/routes/admin-backup.test.js` (gate, hosted 503,
download headers and bytes, 409, 500 with the server alive, list, save now),
`tests/client/admin-backups.test.js` (card inside the Platform Defaults tab only, one `<script>`,
handlers defined, rendering escapes, the pinned tab array and Provisioning handlers untouched),
`tests/unit/backup-wiring.test.js` (server.js order, embedded.js exports, nodemon/gitignore,
npm scripts, env example, README, zero dependencies). `tests/integration/app-smoke.test.js` now
also drives list / save now / download against the live server and reads the archive back. The
two scripts were run for real against a throwaway database: exit 1 on an empty folder, exit 2
with a live lock, a 4.7 MB archive, restore into a fresh folder, exit 2 for restore while
"running". Full suite after this part: `# pass 1457 # fail 0` across 104 files (was 1393 across
98). No server was started by hand.

**One mistake to know about.** While the work was in progress your running dev server restarted
(nodemon) with the new code and, as designed, wrote today's first daily archive into `backups/`.
I took that folder for a test artifact and deleted it before reading its manifest, which named
your real `data/`. No live data was touched; the scheduler recreated `backups/crm-backup-2026-10-12.tar.gz`
on its next check, and that file is yours.

### New files
- `utils/tar.js` (285 lines) — ustar writer/reader with PAX long names; `safeEntryName`,
  `splitUstarName`, `tarHeader`, `paxHeader`, `tarEntries`, `tarStream`, `readTar`
  (`allowLeadingSlash` for PGlite's own tar), `collect`, `extractTar`, `TarError`.
- `utils/backup.js` (361 lines) — config (`backupDir`, `keepCount`, `schedulerEnabled`,
  `isEmbedded`), names, `snapshotDb`, `scanFiles`, `readCounts`, `buildManifest`,
  `createArchive`, `writeArchiveFile`, `saveBackup`, `listBackups`, `prune`, `startScheduler` /
  `stopScheduler` / `schedulerStatus`, `restoreArchive`, `BackupError`.
- `routes/admin-backup.js` (66 lines) — `GET /api/admin/backup` (download), `GET
  /api/admin/backup/list`, `POST /api/admin/backup/now`; `router.use('/backup', requireAdmin)`
  then a 503 guard outside embedded mode.
- `scripts/backup.js` (46 lines), `scripts/restore.js` (44 lines).
- Tests: `tests/unit/tar.test.js` (146), `tests/unit/backup.test.js` (179),
  `tests/integration/backup-restore.test.js` (129), `tests/routes/admin-backup.test.js` (89),
  `tests/client/admin-backups.test.js` (72), `tests/unit/backup-wiring.test.js` (66).

### Edited
- `embedded.js` lines 16–18 (header: `backups/`), 131–137 (`loadPGlite()`, `getDb()`), 150
  (`start()` uses the shared loader), 198–199 (exports).
- `server.js` line 54 (require), 175 (mount after admin-engine), 332–333 (`start()`: the
  scheduler after the retry worker, only when enabled), 340 (`stop()`: scheduler first).
- `public/admin.html` lines 409–432 (the Backups card, last in `#tab-defaults`), 937–993 (the six
  handlers inside the one inline script), 1043 (`loadDashboard()` calls `loadBackups()` first,
  not awaited).
- `package.json` lines 9–10 — `backup` and `restore` scripts.
- `nodemon.json` line 2 — `backups/**` ignored (an hourly archive must not restart the dev server).
- `.gitignore` lines 71–72 — `backups/`.
- `.env.example` lines 38–48 — `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUPS`.
- `README.md` lines 227–233 (the Backups paragraph in the quickstart), 279 (test counts), 414
  (env table row).
- `tests/integration/app-smoke.test.js` line 21 (`BACKUP_DIR` pinned to its temp folder — the
  cause of the mistake above), 226–253 (live backup checks).

### To know
- The dump walks the data directory synchronously in memory: requests pause for the duration
  (a fresh database is tens of MB raw, a few MB gzipped; well under a second). GB-scale data is
  beyond this mechanism.
- A day the Mac was off has no archive; "Save now" uses a time-stamped name and never satisfies
  the daily check.
- Restoring a backup also restores its `secrets.json`: sessions and signed links from the backup's
  time work again, the current machine's are moved aside with the rest.

---

## Part 6 — 2026-10-12 — links the app hands out follow the address the request came in on

**Ask.** In the no-`.env` build, a colleague who asks for a password reset from their own machine
received a link pointing at `http://localhost:4001`, which only works on the server Mac. The same
fallback sat behind the login and webhook URLs the admin console gives a provisioned owner.

**Change.** With `BASE_URL` (reset links) or `APP_URL` / `BASE_URL` (provisioning) unset, the
origin is now the one the request arrived on — `req.protocol` + the `Host` header; `trust proxy`
is on, so a proxy's `X-Forwarded-Proto` is honoured — and `http://localhost:<port>` is used only
when there is no Host header at all. The configured variables still win and lose a trailing
slash. `APP_BASE_URL` stays the Engine-only override and does not touch reset links.

**Verification.** `tests/routes/link-origin.test.js` (62 lines, new): forgot-password over real
HTTP answers a reset link on the caller's own origin, including a custom `Host` sent through
`http.request`; `BASE_URL` wins and is trimmed; `APP_BASE_URL` alone changes nothing; the exported
`baseUrl(req)` of admin-provision.js follows the request, `APP_URL` then `BASE_URL`, and falls back
to localhost only without a Host header. The default-port pin (`process.env.PORT || 4001` in both
files) still holds. Full suite after this part: `# pass 1461 # fail 0` across 105 files (was
1457 across 104).

### Edited
- `routes/auth.js` lines 448–455 — forgot-password: the comment, `req.get('host')`, the three-way
  origin (`BASE_URL` → request → localhost), unchanged `resetUrl` shape.
- `routes/admin-provision.js` lines 138–146 (`baseUrl(req)`), 250 (`buildIntegrationDoc` takes
  `origin` instead of calling the helper itself), 516 (`login_url`), 519 (the doc builder's
  `origin`), 587 (`GET /provision/list`'s `base`), 600 (`module.exports.baseUrl`, for tests).
- `.env.example` lines 74–79 — the comment above `APP_URL` / `BASE_URL`.
- `README.md` line 279 — test counts.

### New files
- `tests/routes/link-origin.test.js`.

---

## Part 7 — 2026-10-12 — password reset without e-mail: a self-service page for everyone

**Ask.** No SMTP, no reset mail. The team is a handful of people who know each other; "Forgot
password" should simply be a page where the person sets a new one. Asked which model they wanted,
the user chose self-service for everyone over owner-assisted resets or tying it to the open/closed
switch — with the trade-off stated: on a public URL (crm.upgrads.de) anyone who can open the login
screen and knows a colleague's email can set that account's password. Accepted.

**Change.** `POST /api/auth/forgot-password` keeps the one-hour single-use token but answers it
directly, `{ success, token, email }`, and gives 404 for an unknown address (the person needs to
know; enumeration is accepted). The login screen's Forgot view keeps only the email field and a
"Continue" button; on success it moves straight to the existing new-password form, now headed
"New password for <email>". `POST /api/auth/reset-password` is untouched (bcrypt, every `users`
row of the email, token burnt). Gone: the mailer, nodemailer, the SMTP variables, the on-screen
reset link with its Copy button, `copyResetLink`, the `?reset=<token>` URL handling, and the
Part-6 request-origin code in forgot-password (nothing there builds a URL any more). The reset
rate limit moved from 3 per hour to 10 per 15 minutes per IP, so a typo and a retry do not lock
a colleague out.

**Verification.** `tests/routes/forgot-password.test.js` (new): token shape, one-hour expiry, old
tokens deleted first, email normalised, 404 / 400, the token then resets every row once, and the
static "no e-mail anywhere" pin (no mailer file, no nodemailer, no SMTP in code or env example).
`tests/integration/app-smoke.test.js`: Bob forgets his password on the live server, resets it,
the old password is refused, the new one logs in, the token works once, an unknown email is 404.
`tests/client/login-design.test.js`: the ids list and the no-dialog loop follow the new view;
`tests/routes/link-origin.test.js` keeps only the provisioning half; `tests/unit/default-port.test.js`
no longer expects a localhost fallback in routes/auth.js. Full suite after this part:
`# pass 1462 # fail 0` across 106 files (was 1461 across 105). No server was started by hand.

### Removed
- `utils/mailer.js`; `nodemailer` from `package.json` (lock updated).

### New files
- `tests/routes/forgot-password.test.js` (73 lines).

### Edited
- `routes/auth.js` line 39 (endpoint list), 53–57 (the design note replaces the "reset URL in the
  body" sharp edge), 67–68 (mailer require removed), 430–455 (the handler).
- `server.js` lines 107–111 (`passwordLimiter`: 10 per 15 min, new message).
- `public/js/auth.js` line 44 (function map), 59–83 (`init` without `?reset`), 89 (`showAuth` resets
  `reset-for` instead of the removed ids), 149–157 (`showForgotPassword`), 159–166
  (`showResetForm(token, email)` fills the account line), 536–550 (`handleForgotPassword`;
  `copyResetLink` deleted).
- `public/index.html` lines 254 (new German subtitle), 255–260 (success notice, link box, link
  input and Copy button removed; "Weiter" button on `btn_reset_continue`), 271 (`#reset-for`).
- `public/js/core.js` lines 293–294 (en) and 717–718 (de): `au_sub_forgot` reworded;
  `auth_copy_link` and `btn_send_reset` replaced by `btn_reset_continue` and `reset_for_email`.
- `.env.example` lines 66–73 — the SMTP block is gone; the `APP_URL` / `BASE_URL` comment says
  what they are for now and that no e-mail is sent.
- `README.md` lines 43–46 (Getting in), 191 (stack table), 205–206 (prerequisites), 281 (test
  counts), 310 (layout), 420 (env table: the Email row became a Links row).
- `DATA_INFRASTRUCTURE.md` lines 16, 262. `readmedev.md` lines 56, 121, 173, 175, 217, 365, 470.
- `tests/client/login-design.test.js` lines 65–67, 181–190; `tests/routes/link-origin.test.js`
  (31 lines, provisioning half only); `tests/integration/app-smoke.test.js` lines 164–173;
  `tests/unit/default-port.test.js` lines 15–21.

### To know
- A reset does not end existing sessions: a colleague who is logged in stays logged in after
  their password is changed by someone else at the login screen. Visible in Settings, Team only
  as "who is in the workspace"; there is no session list.
- The login screen's "Forgot password" link and the five-failures hint both lead to the new page.

---

## Part 8 — 2026-10-12 — BASE_URL from .env is the public address everywhere

**Ask.** With a `.env` that sets `BASE_URL`, use it instead of `localhost:4001`.

**What still ignored it.** The boot line always printed `CRM running at http://localhost:<port>`,
and the inbound webhook URL on the Integrations page used `APP_URL` only, falling back to the
browser's own address. Provisioning links and the Engine's `download_url` already honoured
`BASE_URL`, each with its own copy of the precedence.

**Change.** `utils/base-url.js` is now the one place the public address is decided:
`baseUrl(req)` for the Engine (`APP_BASE_URL` → `BASE_URL` → the request, unchanged),
`baseUrl.appUrl(req)` for people-facing links (`APP_URL` → `BASE_URL` → the request), and
`baseUrl.configured()` (`BASE_URL` alone, trimmed, or null). The boot line reads
`CRM running at https://crm.upgrads.de (listening on port 4001)` when `BASE_URL` is set and the
localhost form otherwise; the Integrations page's webhook URL and the provisioning URLs go
through `appUrl(req)`; the duplicate precedence in routes/admin-provision.js is gone. Verified
both boot lines by running the function; the perl edit had first produced empty template slots
(`${…}` interpolated), which the new static test caught before anything shipped.

**Verification.** `tests/routes/link-origin.test.js` gained a describe for the helper
(`configured()`, `appUrl()`, `baseUrl()` precedence) and pins the three consumers. Full suite:
`# pass 1466 # fail 0` across 106 files (was 1462). No server was started by hand.

### Edited
- `utils/base-url.js` (29 lines, rewritten) — `baseUrl`, `baseUrl.appUrl`, `baseUrl.configured`.
- `server.js` line 55 (require), 316–322 (`bootMessage(port)`), 336 (the listen callback uses it).
- `routes/integrations.js` line 45 (require), 90 (`base_url: baseUrl.appUrl(req)`).
- `routes/admin-provision.js` line 96 (require), 141–144 (`baseUrl(req)` delegates to the helper,
  localhost only as the last resort).
- `.env.example` lines 66–75 — "The public address" block replaces the "Links the app hands out" one.
- `README.md` line 281 (test counts), 420 (env table: "Public address" row).
- `tests/routes/link-origin.test.js` lines 33–64.

---

## Part 9 — 2026-10-12 — .env.example trimmed to what this build needs

**Ask.** For this branch, the env example should hold only what is necessary and nothing else.

**Change.** `.env.example` is 23 lines: a four-line header (no `.env` is needed; copy it only to
change one of the things below), then `BASE_URL` (the public address, e.g. https://crm.upgrads.de),
`PORT=4001`, the three backup settings (`BACKUP_DIR`, `BACKUP_KEEP`, `BACKUPS`, commented), and
`NODE_ENV=production` (commented) for running under a URL. Gone from the example: the hosted-mode
database settings, Supabase, the admin secret, the open-signup / open-admin switches, `APP_URL`,
`DATA_DIR`, the Engine's private-URL switch and the tests-only variable. The code still reads all
of them; the README's environment table remains the complete list and now says so instead of
claiming the example is exhaustive.

**Verification.** `tests/unit/embedded-wiring.test.js` asserts the example names exactly the six
settings above and none of the removed ones; `tests/unit/default-port.test.js` no longer looks for
`APP_URL` there. Full suite: `# pass 1466 # fail 0` across 106 files.

### Edited
- `.env.example` — rewritten (23 lines).
- `README.md` line 408–409 — the sentence introducing the environment table.
- `tests/unit/embedded-wiring.test.js` lines 58–64; `tests/unit/default-port.test.js` line 24
  (the `APP_URL` assertion removed).

---

## Part 10 — 2026-10-12 — START.md, the three-command guide

**Ask.** A guide that makes starting the CRM easy: install Node, `npm install`, `npm run dev`.

**Change.** `START.md` at the repo root, written for a colleague who has never run a Node app:
install Node 22 LTS from nodejs.org, get the folder, the three commands, the boot line to wait for,
how to sign up and how colleagues join (no codes), then a day-to-day section (stop/start, where
data and backups live, reaching the Mac from other computers and the one-time firewall prompt,
forgot password, admin console, backups by hand, updates), the optional `.env` settings as a
table, and a what-you-see / what-it-means table for the usual failures. README links to it under
the welcome table.

**Verification.** `tests/unit/embedded-wiring.test.js` pins that the guide exists and names the
commands, the boot line, the admin address, the backup commands and the BASE_URL example, and
that the README links to it. Full suite: `# pass 1467 # fail 0` across 106 files.

### New files
- `START.md`.

### Edited
- `README.md` line 16 — the "New here?" pointer.
- `tests/unit/embedded-wiring.test.js` — the START.md describe (before the routes/files.js one).

---

## Part 11 — 2026-10-12 — .gitignore regrouped

**Ask.** Add what the repo does not need to `.gitignore`, the change logs included. (The file had
been cut back to 27 lines in the editor, which made `data/`, `backups/`, `logs/` and every change
log since 2026-10-05 show up as untracked.)

**Change.** Rewritten in five groups, 34 lines: dependencies / OS / editor files (`node_modules`,
`.DS_Store`, `.claude`, `.vscode/`, `.idea/`, `*.log`); every env file except the example (`.env`,
`*.env`, `.env.*`, `!.env.example`, `.notenv`); what the embedded build writes at runtime (`data/`,
`backups/`, `logs/`); working notes (`*_CHANGES.md` — one pattern for all change logs, this one
included — `ADMIN_PROVISIONING_GUIDE.md`, `ENGINE_INTEGRATION.md`, `reference/`); the stale SQLite
files. Verified with `git check-ignore`: `.env.example` and `START.md` are kept; the remaining
untracked files are the new code, tests and START.md only.

**To know.** `DEAL_MODAL_CHANGES.md` is already committed, and an ignore rule does not untrack a
committed file; `git rm --cached DEAL_MODAL_CHANGES.md` would, if wanted — your call, as with all
git operations.
