# Tests — how they work, how to run them, how to add one

This folder is the automated test suite for the CRM. It uses **Node's built-in test runner** (`node:test`, Node ≥ 22 — see `engines` in `package.json`) and **no test framework or extra dependency**. Server-side tests reuse packages the app already has (`express`); the database suite additionally needs `pg` (already installed) and `git` on the machine.

```
npm test               # everything (client suites skip without jsdom; the db suite skips without TEST_DATABASE_URL)
npm run test:unit      # tests/unit
npm run test:routes    # tests/routes
npm run test:client    # tests/client
npm run test:db        # tests/db  (real Postgres — see §7)
npm run test:baseline  # the migration test against the PRE-Stage-1 schema fixture: must fail the Stage 1 assertions
npm run test:serial    # everything, one file at a time (--test-concurrency=1) — for debugging port or ordering issues

node --test tests/routes/deals.test.js                                          # one file
node --test --test-name-pattern "foreign contact_id" tests/routes/deals.test.js  # tests whose name matches
```
`--test-name-pattern` matches against the test's own name; for a test inside a `describe`, the block name is a separate level, so `"foreign contact_id"` still finds `POST /api/deals with foreign contact_id -> 400, no write` even though it lives under `write side: …`.

---

## 1. What a test is

A test is a small function that does three things, always in this order:

1. **Arrange** — set up the situation (an input string, a fake database that will answer a query a certain way, a request body).
2. **Act** — call the real code you want to check (a function, or an HTTP route).
3. **Assert** — state what the result *must* be. If reality differs, the test fails and the runner prints both values.

Here is the whole idea in eight lines, from `tests/unit/sanitize-note.test.js`:

```js
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { sanitizeNote } = require('../../utils/sanitize-note');   // the REAL function from the app

test("the editor's <div> line breaks survive as paragraphs", () => {
  const out = sanitizeNote('<div>line1</div><div>line2</div>');   // act
  assert.equal(out, '<p>line1</p><p>line2</p>');                  // assert
});
```

`assert.equal(actual, expected)` throws if the two differ. The runner catches that, marks the test `not ok`, and shows exactly what came back versus what you expected. If nothing throws, the test is `ok`.

**Why it is worth having:** every fix made during the security review was first *proven broken* on the old code and then *proven fixed* on the new code by a check like this. These files are those checks, kept. From now on, if anyone changes a route and accidentally reintroduces one of the bugs, `npm test` says so in under a second, before a user ever sees it.

---

## 2. The four kinds of test in this folder

| Folder | Tests what | Needs | Speed |
|---|---|---|---|
| `unit/` | One function or middleware at a time: sanitiser, workspace guard, chat limiter, console-path check, API-key auth, idempotency, webhook engine, the DDL `initDb()` issues, `server.js` wiring (static). | nothing | milliseconds |
| `routes/` | A **real** route file (`routes/deals.js` etc.) over **real HTTP**, with the database replaced by a fake that records SQL. | `express` (already installed) | ~50 ms per file |
| `client/` | The **real** browser files (`public/js/*.js`, `public/index.html`, `private/admin.html`). Pure helpers (CSV parsing, sorting, formatting, i18n, …) are sliced out by name with `helpers/client-fn.js` and always run; static checks always run; only the parts that need a fake browser skip unless `jsdom` is installed. | nothing for the pure/static files; `jsdom` for the DOM parts (optional, `npm i -D jsdom`) | ~200 ms per file |
| `db/` | The Stage 1 migration on a **real PostgreSQL** database built from the pre-migration schema. | a throwaway local database + `pg` + `git`; explicit opt-in (§7) | seconds |

Without jsdom the DOM suites print `# SKIP jsdom is not installed …`; without `TEST_DATABASE_URL` the db suite prints its own `# SKIP` reason. The run still succeeds. Read the skip lines: a green run with skips is not full coverage.

---

## 3. How route tests work without a database

### 3.1 The fake pool (`helpers/fake-pool.js`)

Every route talks to Postgres through one object, the pool, and only ever calls `pool.query(sql, params)` (or `pool.connect()` then `client.query(...)` inside a transaction). The fake pool is an object with those same methods. When the route calls `query`, the fake:

1. **records** the SQL text and the bound parameters into `pool.log`, and
2. **answers** by checking a list of rules you gave it — the first rule whose regular expression matches the SQL text supplies the reply. No match → an empty result.

```js
const pool = createFakePool([
  { match: /^INSERT INTO deals/, reply: () => ({ rows: [{ id: 99 }], rowCount: 1 }) },
]);
```

Afterwards the test inspects what the route *asked*:

```js
pool.find(/^INSERT INTO deals/).params   // -> [7, 10, 10, 20, 30, 'T', null, 1, 0, '{}']
pool.some(/id = ANY/)                    // -> did the route run the ownership lookup at all?
pool.writes()                            // -> every INSERT/UPDATE/DELETE that ran
pool.someParam(v => v === 'secret')      // -> was this value ever bound?
```

That is how a test can prove "a foreign id was rejected **and nothing was written**": it checks the status code *and* that `pool.writes()` is empty.

**Shared table models** (`helpers/fake-tables.js`): `idempotencyTable()` and `apiKeyRules(KEY)` return rules that behave like the real `idempotency_keys` (with its UNIQUE) and `api_keys` (hash lookup + usage stamp), so the several tests that need them do not each carry a copy.

### 3.2 Swapping the database in (`helpers/load-route.js`)

The route file starts with `const { pool } = require('../db')`. We do not edit that line. Instead we use a fact about Node: every module it loads is kept in a cache, `require.cache`, keyed by absolute file path, and `require` looks there first. `loadRoute()` puts our fake pool into that cache under the path of `db.js` **before** loading the route, so the route's own `require('../db')` receives the fake. The same trick replaces `middleware/auth.js` (so the test is "logged in" as user 1 in workspace 7 without a session cookie) and `notifications.js` (so no notification is actually sent). `inject()` returns a function that restores the previous cache entry.

Everything else the route requires — express, the utils, `sanitize-html` — is the genuine module. **The code under test is the code that ships.**

### 3.3 Real HTTP (`serve()`)

`serve()` mounts the router on a throwaway Express app listening on a random free port and returns `request(method, path, body, headers)`. A route test therefore goes through JSON parsing, Express routing, the auth middleware and the error handler exactly as production traffic does. Only the pool is fake.

### 3.4 The trade-off you should know about

Rules match the **SQL text**. If you rewrite a query — rename a column, restructure a join — a rule may stop matching and the fake will return an empty result, and a test will fail. That failure is *informative* ("this test's idea of the SQL is stale"), not a sign the app is broken. Update the rule and re-run. Keep rules **anchored to the stable prefix** of a statement (`/^INSERT INTO deals/`, `/FROM engine_webhook WHERE workspace_id/`), never to a whole clause or a specific `$n` position.

### 3.5 Unit-testing middleware directly (`helpers/fake-http.js`)

For a middleware you can skip HTTP entirely: `fakeReq({ headers, body, workspaceId })` gives an object with Express's `req.get()` semantics (case-insensitive headers); `fakeRes()` records `status()`, `json()`, `set()` and whether anything was sent. See `unit/engine-auth.test.js`.

---

## 4. Reading the output

Each file runs in its own process; the runner prints one line per test and a summary:

```
ok 3 - PUT binds the same 11 parameters
not ok 4 - omitted ids are not validated ...
# tests 176
# pass 175
# fail 1
```

A failure shows where and what:

```
not ok 1 - example: an assertion that is wrong on purpose
  location: '…/example.test.js:4:1'          <- the test
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + '<b>hi</b>'                              <- what the code returned
    - '<strong>hi</strong>'                    <- what the test expected
  stack: |-
    TestContext.<anonymous> (…/example.test.js:5:10)   <- the assert line
```

Read the `+ actual` / `- expected` pair first; nine times out of ten it tells you everything. If the failing assertion is about `pool.find(...)` being `undefined`, a rule regex no longer matches the SQL — see §3.4.

---

## 5. Adding a test

**A unit test** (a function with no I/O) — copy this into `tests/unit/<name>.test.js`:

```js
// UNIT tests for utils/my-module.js
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { myFunction } = require('../../utils/my-module');

test('describes the behaviour in plain words', () => {
  assert.equal(myFunction('input'), 'expected output');
});
```

**A route test** — copy this into `tests/routes/<name>.test.js`:

```js
// ROUTE tests for routes/things.js
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

let pool, server;
before(async () => {
  pool = createFakePool([
    { match: /^INSERT INTO things/, reply: () => ({ rows: [{ id: 1 }], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/things': loadRoute('things.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());       // start every test with an empty recording

test('POST creates a thing', async () => {
  const r = await server.request('POST', '/api/things', { name: 'x' });
  assert.equal(r.status, 201);
  assert.deepEqual(pool.find(/^INSERT INTO things/).params, [7, 'x']);
});
```

**House rules**
- Header comment: `// <KIND> tests for <subject>` (UNIT / ROUTE / CLIENT / DATABASE).
- The test name is a sentence about behaviour ("a foreign id is rejected before anything is written"), not about code ("calls refCheck").
- Group with `describe()` when a file has more than four tests; use a `for` loop when the same check applies to several inputs.
- One assertion per line, and give bare status checks a message (`assert.equal(r.status, 400, 'foreign id')`) so a failure names the case.
- Success paths: status **and** `deepEqual` on the body. Failure paths: status and the error code.
- Shared fixtures go in `helpers/`, not copied between files.

---

## 6. What is covered

| File | Proves |
|---|---|
| `unit/sanitize-note` | allow-list, `div→p`, `javascript:` links dropped, empty when only markup, null passthrough |
| `unit/workspace-refs` | `refCheck` rules; `dealRefs`/`taskRefs` bind only supplied ids; no query when nothing supplied; `allowedTaskStatuses` union |
| `unit/chat-rate-limit` | 6 allowed / 7th refused with retry time; window slides; per-user buckets; middleware 400 / 413 / 429 order |
| `unit/admin-console` | unset → disabled; valid path accepted; guessable or malformed → boot error |
| `unit/engine-auth` | 401 shape + `WWW-Authenticate`; only the SHA-256 of the key is bound; revoked/expiry clauses; Bearer and `X-API-Key`; scopes default; usage stamp throttled and non-fatal; DB error → `next(err)` |
| `unit/idempotency` | 400 shapes; 401 without workspace; first request reserves/runs/stores; identical retry replays; 4xx stored; different payload → 422; in-flight → 409; INSERT race → 409; handler throw releases; expired row reruns; stable request hash |
| `unit/engine-webhook` | HMAC signature; fan-out to subscribed hooks with the payload contract; all delivery outcomes; the full backoff table to `dead`; `FOR UPDATE SKIP LOCKED` claim with lease; worker summary, overlap guard, start/stop |
| `unit/db-migrations` | `initDb()` is additive; the 11 contact columns, CHECK and index; the 4 engine tables and indexes; all pre-Stage-1 tables still created (`test:baseline` proves the assertions fail on the old schema); the `engine_webhook` legacy fix-up probes before the CREATE, issues nothing on a normal database, and on the old shape copies → drops deliveries → drops the old table → creates both, in order |
| `unit/server-wiring` | engine limiter 300/min before the mount; worker starts after listen |
| `routes/deals` | joins scoped; 7 foreign-id cases → 400 with no write; own ids → identical INSERT/UPDATE parameters; lookup bound only to supplied ids |
| `routes/objects` | 8 mismatched-ownership cases → 404 with no write; own links unchanged; 400 before any query |
| `routes/analytics` | injection payload never in SQL text; typed bind + type guard; text field never bare-cast; config allow-list; response key sets |
| `routes/activities` | note and comment sanitised on write; `div→p`; @mention still notifies; script-only → 400 |
| `routes/contacts-import` | counts from `RETURNING`; the two identities on every case; deleted-mid-import row counted as `unmatched`; key set; 2 001 rows → 413 |
| `routes/contacts-onboarding` | trigger sets `formular_versendet`, emits `vertrag.unterschrieben` with fallback data, notifies; foreign → 404 no emit; webhook failure does not roll back |
| `routes/tasks` | joins and count subqueries scoped; subtask query scoped; 6 foreign refs → 400; status/priority validation; PUT without status → 400 |
| `routes/engine-api` | 401 without key; German 17-key view; foreign workspace → 404; PATCH validation, drive field semantics, replay, stored 404 replayed; no webhook from the engine API |
| `routes/engine-middleware` | engineAuth + runIdempotent composed over HTTP |
| `routes/engine-settings` | member → 403 on all nine routes; secret shown once and hinted after; rotate; test event; deliveries scoped; retry re-arms a dead row; key shown once, hash-only storage, revoke |
| `routes/task-projects-statuses` | foreign project → 404 with no read/write on the statuses table; own → keyed on the verified id; non-array → 400 |
| `routes/deals-objects` | foreign deal / foreign object × link / unlink → 404 with zero writes; own → original params; GET joins objects on the workspace |
| `routes/pipelines-stages` | foreign pipeline → 404, no probe, no INSERT; own → next position, probe and INSERT scoped |
| `routes/integrations-settings` | foreign pipeline / stage / assignee → 400 naming the field, no UPDATE; stage must belong to the pipeline; all own → UPDATE binds the seven values |
| `unit/notify-system` | one INSERT with a tuple per user, placeholder count = bound values; no users → no INSERT; announce owner-only |
| `routes/workspace-delete` | owner of two workspaces → 200, every DELETE bound to this workspace; owner of one → 400; member → 403 |
| `unit/require-auth` | no session → 401 with no query; no membership → 401 **and** session destroyed; member → `req.userId/workspaceId/userRole` from the membership row; DB error → `next(err)` |
| `routes/auth-workspace-switch` | select/switch-workspace: no session → 401; a workspace without a `users` row for the caller's email → 403 and the session untouched; own → session rebound to that row and its role (no carry-over) |
| `routes/workspace-members` | member → 403; self → 400; foreign user id → 404 with nothing deleted; own member → contacts unassigned + user deleted, both scoped, in one transaction |
| `routes/contacts-crud` | list joins scoped; foreign stage / assignee → 400, no INSERT; duplicate email (any case) → 409; foreign contact on PUT / PATCH stage / DELETE → 404 with the scoped statement; bulk delete deletes only own ids and reports that count; empty → 400 |
| `routes/field-crud` | the factory behind the four `*-fields` routers: list scoped; type allow-list; duplicate key → 400; position = max+1; foreign field on PUT / DELETE → 404; exactly four hard-coded table names |
| `routes/integrations-receive` | public inbound webhook: unknown/inactive key → 404 with no write; no name and no email → 422 logged; new lead created in the key's workspace with lower-cased email, dot-path custom field, hook assignee and deal; existing email → scoped UPDATE, no duplicate |
| `routes/chat-http` | messages scoped with `before` cursor and chronological order; unread count per caller; non-string/empty → 400; store trimmed under caller + workspace and bump the read cursor; read upsert |
| `routes/notifications` | list, read, read-all, clear and preferences all bound to the caller's `user_id` |
| `unit/reorder` | positions 0..n-1 in the given order, each UPDATE carrying the caller's WHERE clause, BEGIN/COMMIT; failure → ROLLBACK and rethrow |
| `routes/admin-login` | array-wrapped secret → 401 (no coercion); wrong/empty → 401 without regeneration; correct → session regenerated before `isAdmin` (planted state gone); secret unset → 503; invites 401 without `isAdmin`; logout destroys the session |
| `client/csv-import` (pure) | delimiter sniffing incl. ties and first non-blank line; quoted fields, `""` escape, CRLF, blank lines, trailing empty field; `toFieldKey` slug; header auto-map for English and German aliases, custom field by name or key, unknown → skip |
| `client/core-helpers` (pure) | `buildPageNumbers` windows and the U+2026 gap; `waLink` digits-only URL, default and workspace templates, string contact; `esc` escapes `& < > "` (not `'`, pinned); `fmtDate` |
| `client/contacts-helpers` (pure) | `effectiveContactColumns` defaults, saved order/visibility, unknown keys dropped, new columns appended; `sortContacts` returns the same array without a key, case-insensitive text, numeric custom fields, dates, desc, no mutation |
| `client/analytics-helpers` (pure) | `fmt` / `fmtCurrency` thresholds; `buildStatOrder` default, saved order, unknown ids, value-dependent cards, hidden flags; inherited names like `constructor` are dropped (own-property lookup) |
| `client/tasks-helpers` (pure) | `buildSubtaskMap` grouping and order; `fmtSize` B/KB/MB |
| `client/i18n` (static) | two locales, non-empty values; key parity both ways; every `data-i18n` key in the **whole** page exists in both; `t()` falls back current → en → key |
| `client/import-modal-layout` (static) | the Import-CSV modal keeps the app-wide shape: one `.modal-body` holding the three steps, no action bar inside a step, the map/done footers as hidden siblings of the body with the original buttons; the real `showImportStep` toggles step + footer together |
| `client/onboarding-page` (pure + static) | the Onboarding page helpers: six steps in order, `n/6` progress, filtering (drops `kein_onboarding`/unknown, pill, search over null-safe name/company/email, newest first, no mutation), counts; nav item, section ids, script order, `switchPage` / `setLanguage` branches |
| `client/deal-onboarding` (static) | deal-editor Start-Onboarding button hidden for new deals and toggled in `openDealModal`; `startOnboardingFromDeal` reads the live contact select, refuses without a contact, delegates to `requestOnboardingStart`, keeps the modal open; badge in the deal's contact panel; the POST literal exists once in `contacts.js` |
| `routes/contacts-onboarding-status` | manual status PATCH: bad id / unknown status → 400 no query; foreign → 404 no UPDATE; own → scoped UPDATE, one `onboarding.status_geaendert` event with `vorher`, notification; webhook failure → 200 with `deliveries: 0`; unchanged → no event |
| `routes/workspace-onboarding-trigger` | owner-only; integers only; a stage of another workspace → 400 and no UPDATE; own → deduplicated sorted JSON list; empty → off without lookup |
| `unit/onboarding-statuses` | one shared status list, required by both routes, re-exported by engine-api; all six workspace SELECTs in `routes/auth.js` carry `onboarding_trigger_stage_ids` |
| `client/onboarding-trigger` (pure + static) | `shouldPromptOnboarding` decision table (enter → ask; between trigger stages / same / leaving / cleared → no; string ids; no config → never); settings card + save; `dealDrop` captures the previous stage before the optimistic update and asks after the PATCH; `saveDeal` asks; no re-ask for onboarded contacts; confirmed start |
| `client/onboarding-status-select` (pure + static) | seven options in order, current selected, handler with id + context; unknown status selects nothing; used in detail / deal panel / Onboarding page; `changeOnboardingStatus` endpoint and per-context refresh |
| `unit/google-drive` | folder link/id parsing (seven accepted shapes, eleven rejected); `describeFile` for Google's and our row shape (preview/open URLs only from a validated id); the API-key client: request params + timeout signal, pagination, `maxPages`, 60 s cache, 404 → `not_public`, 403 → `upstream`, timeout, no network for a bad id, not configured |
| `unit/drive-sync` | `syncContact`: unknown contact; no folder → rows deleted, count 0, no Google; success → delete-not-in-list, one multi-row upsert (placeholders = values, bad ids and empty names skipped), contact stamped, BEGIN…COMMIT in order; Google failure → rows kept + error code; empty folder; `syncDue` query and sequential order; worker idle without a key, tick / overlap / stop |
| `routes/contacts-drive` | `PATCH /:id/drive-folder` validation, foreign 404, link → bare id + immediate sync summary, failure still 200, clearing syncs without a key; `GET /:id/drive-files` from the table only, stored link normalised, stored error, `configured`; `POST /:id/drive-sync` 503/404/400, sync now, failure → 200 with `sync_error` and cached rows |
| `routes/engine-api-drive-sync` | the engine's status PATCH with `drive_ordner_id` answers before the background sync resolves and kicks exactly one sync; without it none |
| `client/drive-ui` (pure + static) | status line precedence; file row = icon + whole name (escaped, no size/date), Preview carries url + name as data attributes, previewable vs open-only; section with / without folder and with an untrusted stored value (Files window button, no embed popup); script order; both views render the section and load the stored list; load/sync endpoints; the in-page preview popup (modal + empty iframe, Google hosts only, Close unloads); save PATCHes and re-renders per context |
| `client/drive-window` (pure + static) | the files window: en/de dictionary parity; `?contact`/`?file` validation; folders-first name/date sort + search without mutation; tile escaping with the validated id only and no inline JS; status precedence; iframe source Google-only; `drive.html` wiring (stylesheet, script, 18 ids, no inline script, frame hidden); `openDriveWindow` validates ids, row Preview delegates, old popups gone; CSP unchanged |
| `client/settings-layout` (static) | the Settings page: eight tabs in order, one pane each, General gone; Workspace tab hidden for members; every card in its expected pane and order; no inline spacing in the section; bodies/actions anatomy with each message beside its button; wide/danger cards; the CSS primitives and fixed rhythm; `settings.js` empty states and role-based default tab; the Appearance toggle sync; the tour's tabs exist |
| `client/field-key` (pure + static) | admin-console `generateFieldKey` and app `toFieldKey` agree on words, digits, whitespace and punctuation (`Ust-ID` → `ust_id` in both); all seven slugifier copies (app ×6, admin console ×1) use the same rule and the old delete-punctuation regex is gone |
| `client/ui-onboarding` | cards' ids present; every card i18n key in both dictionaries; handlers defined; seven German labels; badge/column/trigger wired; (jsdom) badge renders |
| `client/analytics-page` (jsdom) | page loads, 4 sections, survives revisit, honours stored order, drop moves once |
| `client/note-sanitizer` (jsdom) | control proves the old row executes; sanitised row does not; formatting kept |
| `client/task-statuses` (jsdom) | project → workspace → built-ins precedence |
| `db/onboarding-schema` (real Postgres) | rows survive the migration with defaults; idempotent; columns/tables/CHECK/indexes exist; CHECK enforced; uniques enforced; delivery defaults; **legacy fix-up**: a database holding the old-branch `engine_webhook` (`api_key`, `event`, `target_url`) gets the current table, its rows copied to `engine_webhook_legacy`, the deliveries FK on the new table, and the `emitEngineEvent` subscriber query runs (`DB_FILE=<copy>` runs a baseline) |

---

## 7. Database tests (`tests/db/`)

These run against a **real** PostgreSQL and **wipe it** (`DROP SCHEMA public CASCADE`). They therefore run only when all three hold, and otherwise skip with the reason printed:

1. `TEST_DATABASE_URL` is set,
2. its host is `localhost` / `127.0.0.1` / `::1` (a remote URL is refused), and
3. `ALLOW_DESTRUCTIVE_DB_TEST=1` is set.

```bash
createdb crm_stage1
ALLOW_DESTRUCTIVE_DB_TEST=1 TEST_DATABASE_URL=postgres://localhost/crm_stage1 npm run test:db
dropdb crm_stage1
```
The "before" schema comes from `tests/fixtures/db.pre-stage1.js` (the committed `db.js` from before Stage 1), so the test really migrates an older database forward. `helpers/load-db.js` evaluates any `db.js` source with `pg` swapped for a pool you choose — the same trick lets `unit/db-migrations` capture the DDL with a fake pool, and `test:baseline` run it against the fixture.

---

## 8. Gotchas

- **Each file is its own process.** State does not leak between files; it can leak between tests *within* a file, which is why route files call `pool.reset()` in `beforeEach` (or build a fresh pool per test, as `unit/engine-webhook` does).
- **`node --test` runs files in parallel** by default. Tests that bind a port use port 0 (random free port) so they never collide. Use `npm run test:serial` when debugging.
- **The chat limiter and the webhook worker start timers.** They are `unref`'d so they never keep the process alive; the tests also call `stop()` in `after` to be tidy.
- **`skip: null` still skips.** Node treats the presence of the `skip` key as the signal. Use `skipUnless(cond, reason)` from `helpers/skip.js`, which returns `{}` when the condition holds.
- **Do not put secrets in tests.** Fixtures use ids like 7, 8, 100; nothing here reads `.env`.
- **Client helpers are sliced by name.** `helpers/client-fn.js` finds `function NAME(` in the real browser file and evaluates that text. Renaming or removing the function makes the test fail with "found 0 times", never silently pass; a slice that is not valid JavaScript fails with a `SyntaxError` from `new Function`. State the function reads (`fields`, `sortKey`, `currentWorkspace`, …) is declared as `let` in the same evaluated script and changed through `F.__set(name, value)`.
