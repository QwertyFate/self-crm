# How each test works — file by file, test by test

`README.md` explains the ideas. This document walks through the actual code: for every file in `tests/`, what the setup does, and for every test, **what it feeds in**, **what the application code does with it**, **what is asserted**, and **why that assertion matters**. Read it next to the source; line references are to the test files as written.

---

## Part A — the helpers (shared plumbing)

### A.1 `helpers/fake-pool.js`

```js
function createFakePool(rules = []) {
  const log = [];
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
```
- `rules` is an array of `{ match: /regex/, reply: (params, sqlText) => result }`.
- `log` will hold one entry per statement the app runs.
- `norm` collapses all whitespace in the SQL to single spaces and trims it. The app writes SQL in multi-line template strings; normalising means a rule can be written as `/FROM deals d/` without worrying about newlines and indentation.

```js
  async function query(sql, params = []) {
    const text = norm(sql);
    log.push({ sql: text, params });
    for (const rule of rules) {
      if (rule.match.test(text)) return rule.reply(params, text) ?? { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }
```
- This is the method every route calls. It is `async` because the real `pg` method returns a promise and the routes `await` it.
- It records first, then answers. **First matching rule wins**, so order rules from most specific to most general.
- `reply` receives the bound parameters, which is how a rule can answer "return only the ids the route asked about" (see the deals test).
- If no rule matches, the reply is an empty result. That is deliberate: most statements a route runs (a `SELECT name FROM users`, a `COUNT(*)`) do not matter to a given test, and the empty default keeps rules short.

```js
  const client = { query, release() {} };
  return { query, connect: async () => client, log, reset(), find(re), some(re), filter(re) };
```
- `connect()` returns a "client" with the same `query` — routes that open a transaction (`const client = await pool.connect()`) get the same recorder. `release()` does nothing.
- `find/some/filter` search the log by regex on the SQL text. `reset()` empties it; route tests call it before every test so each test sees only its own statements.

### A.2 `helpers/load-route.js`

```js
const ROOT = path.resolve(__dirname, '..', '..');
function inject(relativeFile, exportsObject) {
  const abs = path.join(ROOT, relativeFile);
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObject, children: [], paths: [] };
}
```
- `ROOT` is the app root (the parent of `tests/`).
- `inject` writes a pre-made entry into Node's module cache. The shape `{ id, filename, loaded, exports, … }` is what Node itself stores after loading a file. When any module later does `require('../db')`, Node resolves that to the absolute path of `db.js`, sees an entry already in the cache, and returns its `exports` — our fake — without ever reading the file.

```js
function loadRoute(routeFile, { pool, user = { id: 1, workspaceId: 7, role: 'owner' }, notify = () => {} } = {}) {
  inject('db.js', { pool });
  inject('notifications.js', { notify });
  inject('middleware/auth.js', (req, _res, next) => { req.userId = user.id; req.workspaceId = user.workspaceId; req.userRole = user.role; next(); });
  const abs = path.join(ROOT, 'routes', routeFile);
  delete require.cache[abs];
  return require(abs);
}
```
- Three injections: the fake pool as `db.js`; a no-op `notify`; and a replacement auth middleware. The real `middleware/auth.js` reads the session cookie and 401s when absent; the stub simply stamps `req.userId = 1`, `req.workspaceId = 7` and calls `next()`. So every request in a route test is "logged in as user 1 of workspace 7" — that is the "caller" every fixture refers to.
- `delete require.cache[abs]` before `require` forces a fresh copy of the route file, so it binds to *this* fake pool rather than one from an earlier call.

```js
async function serve(mounts) {
  const app = express(); app.use(express.json());
  for (const [prefix, router] of Object.entries(mounts)) app.use(prefix, router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
```
- A tiny Express app, JSON body parsing on, the router mounted under its real prefix (`/api/deals`), and an error handler that turns a thrown error into a 500 with the message in `detail` (so a broken test shows *why* instead of a bare 500).
- `listen(0)` asks the OS for any free port, so tests can run in parallel without colliding.

```js
  async function request(method, urlPath, body) {
    const res = await fetch(base + urlPath, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
```
- Node's built-in `fetch`. `body === undefined` means "no body" (for GET/DELETE). The result is `{ status, body }`, which every route test asserts on.

### A.3 `helpers/dom.js`

Tries `require('jsdom')`. If it throws, `unavailable` holds a message and `skipOpts` is `{ skip: unavailable }`; otherwise `skipOpts` is `{}`. Client suites pass `skipOpts` to `describe()`. Node's runner skips a suite when the `skip` key is present (even if `null`), which is why the helper builds the object conditionally.

---

## Part B — unit tests

### B.1 `unit/sanitize-note.test.js` — `sanitizeNote(html)`

The function under test is the server-side note sanitiser (`utils/sanitize-note.js`): `sanitize-html` with an allow-list of `b i u strong em a br p ul ol li`, `href` only on `a`, only `http/https/mailto`, and `div` transformed to `p`.

| Test | Input | What the code does | Assertion | Why |
|---|---|---|---|---|
| strips script/img/handlers, keeps formatting | the exact payload from the security report: a `<p>` with `<b>`, a good link, a `javascript:` link, `<img onerror>`, `<script>` | Walks the HTML; drops `img` and `script` (and the script's text); drops the `href` on the `javascript:` link but keeps the `<a>`; keeps `<p>`, `<b>`, the https link | `assert.equal` against the exact expected string, then a `doesNotMatch` for `onerror|<img|<script|javascript:` | Two independent ways of saying "the dangerous parts are gone and the safe parts are intact". The exact-string check would also catch an accidental change to the allow-list. |
| `<div>` lines survive as paragraphs | `<div>line1</div><div>line2</div>` | `transformTags: { div: 'p' }` renames each `div` | equals `<p>line1</p><p>line2</p>` | The editor emits a `div` per Enter; without this transform every note would collapse into one paragraph. |
| lists kept; `span` reduced to text | a `ul/li/i/u`, a styled `span`, `strong`, `em`, `br` | allowed tags kept; `span` is not in the list so the tag is removed and its text kept; `<br>` is serialised as `<br />` | exact string | Pins the boundary of the allow-list. |
| only http/https/mailto keep `href` | `mailto:` link; `ftp:` link; protocol-relative `//evil.test` | `allowedSchemes` + `allowProtocolRelative:false` | `mailto` keeps its href; the other two become bare `<a>` | Protocol-relative URLs are a classic bypass; this proves it is closed. |
| only-markup → empty string | just an `<img onerror>`; just a `<script>` | everything is removed | `''` | The route treats an empty result as "no content" and returns 400; this is the function-level half of that behaviour. |
| null/undefined pass through | `null`, `undefined` | the guard `if (html == null) return html` | returned unchanged | The PATCH route needs to tell "not supplied" from "supplied and empty"; the sanitiser must not turn `undefined` into `''`. |

### B.2 `unit/workspace-refs.test.js` — the shared cross-workspace guard

**`refCheck(refs, ids)`** is pure: `refs` is an object of Sets (`{ contacts: Set, members: Set, … }`), `ids` is the request body. It walks a fixed field list and returns the first error message, or `null`.

| Test | Setup | Assertion | Why |
|---|---|---|---|
| every id in the workspace → null | `refs` with contact 10, member 1, stage 30; body with exactly those | `null` | The happy path. |
| names the first foreign field | body with contact 11 / assignee 2 | the two exact messages | The message text is what the client shows; the deals and tasks tests match on its prefix. |
| falsy id is "not provided" | `contact_id: null, assigned_to: 0, stage_id: ''` | `null` | Mirrors the routes' `x || null` semantics: an empty select is not an error. |
| checked only when `refs` has the set | `refs` with only `stages`+`members` (the contacts path), body with `pipeline_id: 999` | `null` | This is what lets one function serve contacts, deals and tasks: each caller supplies only the sets it cares about. |
| string ids compare numerically | `contact_id: '10'` | `null` | Request bodies from forms carry strings; the Set holds numbers. |

**`dealRefs(pool, wid, ids)`** runs one `UNION ALL` query with `id = ANY($n::int[])` per table and builds the Sets.

| Test | Fake rule | Assertion | Why |
|---|---|---|---|
| binds only supplied ids in fixed slots | rule matches `/id = ANY/` and answers `pipeline 20` | `pool.log.length === 1`; params exactly `[7, [], [20], [], []]`; `refs.pipelines.has(20)`; `refs.contacts.size === 0` | Proves one round trip, and that unsupplied tables get an empty array (the DB does no work for them). Slot order is `[workspace, contacts, pipelines, stages, members]`. |
| no query when nothing supplied | none | `pool.log.length === 0` | A deal save with no ids costs nothing extra. |
| non-integer id is not looked up | none | `pool.log.length === 0` and `refCheck` returns the contact message | `'abc'` would have been a Postgres cast error (500); now it is a 400 with a message. |

**`taskRefs`** — same idea, seven slots `[workspace, tasks, projects, lists, users, deals, contacts]`; the test binds a parent and an assignee and checks both the slots and that `refCheck` reads the result.

**`allowedTaskStatuses(pool, wid, projectId)`** — one query that unions the workspace's `task_statuses` JSON keys with the project's rows. The test's fake returns `backlog` and `qa`; the assertion is the sorted union with the four built-ins (`done, in_progress, in_review, todo`), and that the bind was `[7, 20]`. The second test checks a `null` project binds `[7, null]` (the SQL's `$2::int` compares to nothing, so no project rows).

**`TASK_PRIORITIES`** — pinned to the four values the UI's `<option>`s use.

### B.3 `unit/chat-rate-limit.test.js` — the chat limiter

The factory takes a `now` function. The tests pass `() => t` and change `t` by hand: **the test owns the clock**, so nothing sleeps and nothing is flaky.

```js
let t = 1_000_000;
const limiter = createChatRateLimiter({ windowMs: 10_000, max: 6, now: () => t });
after(() => limiter.stop());
```

| Test | Steps | Assertion | Why |
|---|---|---|---|
| six allowed, seventh refused | call `check('alice')` six times, then a seventh | first six `allowed: true`; seventh `allowed: false` with `retryAfterMs === 10_000` | With `t` frozen, the oldest stamp is exactly `windowMs` from expiring, so the retry time is the full window. |
| window slides | `t += 10_001`; `check('alice')` | `allowed: true` | The oldest stamp has aged out, so there is room for one more. The implementation prunes stamps `<= t - windowMs`. |
| independent buckets | six for `bob`, then one more for `bob`, then one for `carol` | bob refused, carol allowed | Keyed by user id. |
| `sweep()` forgets idle users | `t += 60_000; limiter.sweep()` | `size() === 0` | The interval that runs in production calls the same `sweep`; this proves memory does not grow forever. |

The middleware half builds a **fake `req`/`res`**: `res.status(c)` stores the code and returns `res` so `.json(b)` can chain, exactly like Express. `next` sets a flag.

| Test | Body / user | Assertion | Why |
|---|---|---|---|
| non-string or empty → 400 before quota | `12345`, `'   '`, `{}` | `code === 400` | The old route crashed with `.trim is not a function` on a number (a 500). Doing validation first also means garbage never spends a user's quota. |
| > 1100 → 413; 1001–1100 → 400 | `'x'.repeat(1101)`; `'x'.repeat(1001)` | 413; then 400 with `Maximum 1000 characters` | Two-tier check: a coarse guard for grossly oversized bodies, the business rule just above it. |
| valid pass; seventh → 429 | six `'hi'` for user `u-429`, then one more | six `nextCalled`; then `429`, `retryAfterMs` is a number, `limit === 6` | This is the real singleton bucket (`chatLimiter`) that `server.js` and `routes/chat.js` share — a unique user id per test keeps tests from interfering. |

### B.4 `unit/admin-console.test.js` — `resolveAdminConsolePath`

Three tests: blank/undefined → `null` (console disabled); a valid 20-char segment accepted and trimmed; and a loop over seven bad values (`/admin`, `/adminconsole`, no leading slash, trailing slash, nested segment, a query string, 129 chars) each asserting `assert.throws` with the explanatory message. The loop passes the bad value as the assertion message so a failure names which one slipped through.

---

## Part C — route tests

Every route test has the same skeleton:

```js
before(async () => { pool = createFakePool([...rules]); server = await serve({ '/api/x': loadRoute('x.js', { pool }) }); });
after(() => server.close());
beforeEach(() => pool.reset());
```
`before` runs once per file (build the fake, start the server), `after` closes the port, `beforeEach` clears the SQL recording so assertions like "no write happened" are about *this* test only.

### C.1 `routes/deals.test.js`

**Fixture.** Workspace 7 owns contact 10, pipeline 20, stage 30, user 1. Workspace 8 owns 11, 21, 31, 2. The caller is workspace 7 (from the auth stub).

**The key rule** answers the ownership lookup the route runs (`dealRefs`):
```js
{ match: /FROM contacts WHERE workspace_id=\$1 AND id = ANY/, reply: p => {
    if (p[0] !== 7) return { rows: [] };
    const rows = [];
    p[1].forEach(id => OWN.contacts.includes(id)  && rows.push({ kind: 'contact',  id }));
    p[2].forEach(id => OWN.pipelines.includes(id) && rows.push({ kind: 'pipeline', id }));
    ...
    return { rows };
} }
```
- `p` is the parameter array the route bound: `[workspaceId, contactIds[], pipelineIds[], stageIds[], userIds[]]`.
- For each slot it returns a row only for ids that really belong to workspace 7. This is a faithful model of what Postgres would return for `WHERE workspace_id=$1 AND id = ANY($n)`: foreign ids simply produce no row.
- The route then builds Sets from those rows and `refCheck` sees the foreign id missing → 400.

Other rules: `INSERT INTO deals` → `{ id: 99 }` (so the route can respond `{ id: 99 }`); `UPDATE deals SET` → `rowCount: 1` (so PUT does not 404); `SELECT title FROM deals` (used by the stage-change notification); `FROM deals d` → one canned list row.

**Read side.**
```js
const scopedAliases = sql => ['c', 's', 'ps', 'u'].filter(a => sql.includes(`${a}.workspace_id = d.workspace_id`));
```
After `GET /api/deals`, the test finds the recorded list query and checks all four join aliases carry the workspace predicate. Same for `GET /:id`, plus `Array.isArray(r.body.objects)` to pin the detail shape. **Why:** this is the leak fix — a join without the predicate would pull another workspace's contact email/phone into the row.

**Write side** is a loop over seven `[method, url, body, field]` cases (five POST fields, one PUT, one PATCH-stage). Each generated test sends the body with one foreign id and asserts three things: `status === 400`; `error` starts with the field name (regex `^contact_id`); and `writes().length === 0`, where `writes()` filters the log for `INSERT INTO deals|UPDATE deals SET`. **Why the third:** a 400 alone could be sent *after* a write; the log proves ordering.

**Own ids.** POST with all valid ids → 201, body `{ id: 99 }`, and the INSERT's params are exactly `[7, 10, 10, 20, 30, 'T', null, 1, 0, '{}']` — the same ten values, same order, as before the fix (workspace, contact, supplier, pipeline, stage, title, value, assignee, urgency, custom_data JSON). PUT → eleven params ending in `'5', 7` (the URL id arrives as a string; the workspace from the session as a number). The third test sends only `title` + `pipeline_id`: the INSERT gets `null` for the omitted ids, and the lookup's params are `[7, [], [20], [], []]` — only the supplied id is looked up. The fourth sends `stage_id: null` to PATCH and asserts `pool.some(/id = ANY/) === false`: no lookup at all when there is nothing to check.

### C.2 `routes/objects.test.js`

**Fixture.** `OWNER` maps each id to its workspace: objects 40→7, 41→8; deals 50→7, 51→8; contacts 60→7, 61→8.

**The key rule** models the route's two-sided probe:
```js
{ match: /EXISTS \(SELECT 1 FROM objects WHERE id=\$1 AND workspace_id=\$3\) AS obj, EXISTS \(SELECT 1 FROM (deals|contacts) WHERE id=\$2 AND workspace_id=\$3\) AS linked/,
  reply: (p, sql) => {
    const table = /FROM (deals|contacts) WHERE id=\$2/.exec(sql)[1];
    return { rows: [{ obj: OWNER.objects[p[0]] === p[2], linked: OWNER[table][p[1]] === p[2] }] };
} }
```
- The route runs one statement returning two booleans, `obj` and `linked`. The fake computes them from the fixture: is the object's owner the caller's workspace (`p[2]`)? Is the linked row's?
- It reads which table the route asked about from the SQL text itself, so one rule serves both the deal and the contact endpoints.

**Mismatch loop** — eight cases covering every combination (foreign object with own row, own object with foreign row, for both deals and contacts, for both attach and detach). Each asserts 404, the exact message (`Not found` when the object is foreign, `Deal/Contact not found` when the linked row is), and zero link writes. The seventh case ("own deal onto a foreign object") is the one the old code got wrong even though it "checked".

**Own loop** — four cases assert the status (201 for attach, 200 for detach), `{ success: true }`, and the exact write params (`[50, '40']` etc. — note which ids arrive as strings from the URL and which as numbers from the body; the test pins that nothing was coerced).

**Missing id** — `POST /40/deals` with `{}` → 400 and `pool.log.length === 0`: validation happens before the probe.

### C.3 `routes/analytics.test.js`

**Fixture.** `db.config` is what the route reads as the workspace's `analytics_config`; `db.dealFields` is the set of real deal field keys. Ten rules answer every statistic query with zeros so `/summary` can assemble its response.

| Test | Setup | What the route does | Assertion | Why |
|---|---|---|---|---|
| payload only in params | `db.config = { value_field: "x')::numeric,(SELECT 1)--" }`; GET summary and trend | builds `CASE WHEN jsonb_typeof(custom_data -> $2::text) …` and binds the field key | `textHas(PAYLOAD) === false`; `paramsHas(PAYLOAD) === true` | The injection fix in one line: the attacker's string is *data* bound to `$2`, never part of the SQL. On the old code the first assertion failed. |
| typed bind + guard + string branch | `value_field: 'revenue'` | as above | the `SUM(` query matches `jsonb_typeof(custom_data -> $2::text) = 'number'` and the `= 'string' AND … ~` branch; no literal `->>'revenue'`; `'revenue'` in params | Pins the exact shape that (a) casts only real numbers, (b) also accepts numeric-looking strings — how the deal form stores custom values. |
| text field never bare-cast | `value_field: 'notes'` | same query | 200, and no statement contains `(custom_data ->> $2)::numeric` *without* `jsonb_typeof` | A free-text field used to 500 the page; the guard makes it NULL. |
| PATCH allow-list | `dealFields = {'revenue'}` | route checks `SELECT 1 FROM deal_fields WHERE … field_key=$2` | payload → 400; `revenue`, `value`, `null` → 200 | Write-side protection so a bad value never gets stored. |
| key sets unchanged | `value_field: 'value'` | full summary and trend | the exact sorted key lists | The client destructures these; the fix must not change the contract. |

### C.4 `routes/activities.test.js`

Mounts two routers (`activities` and `activity-comments`) on one server. Rules: `INSERT INTO activities` → `{ id: 1 }`; `UPDATE activities SET` → `{ id: 5 }`; the actor lookup → `Alice`; the workspace users list → `Justin Cap` (id 2) so a mention can match; the activity lookup used by the mention pass; notifications insert; and for comments, the insert stores `p[3]` (the content) in `db.lastComment` so the follow-up `SELECT … WHERE ac.id = $1` can echo it back the way Postgres would.

| Test | Sends | Assertion | Why |
|---|---|---|---|
| POST note sanitised | the report payload as `content` | 201, `{ id: 1 }`, and the INSERT's 4th param equals `CLEAN` | The stored value, not the response, is what protects colleagues. |
| PATCH note | same to `/5` | 200, `{ success: true, id: 5 }`, UPDATE's 2nd param is `CLEAN` | Same for edits. |
| POST comment | same as a comment | 201, INSERT param clean, and the returned row's `content` is `CLEAN` | The returned row is what the UI appends immediately. |
| `div` → `p` | `<div>line1</div><div>line2</div>` | stored `<p>line1</p><p>line2</p>` | Route-level confirmation of the sanitiser option. |
| mention still fires | `<b>@justin</b> ping` | a `INSERT INTO notifications` was recorded, `params[1] === 2` (the mentioned user), title matches `mentioned you in a note` | Sanitising must not break the pre-existing mention scanner (it strips tags itself; the sanitised text still contains `@justin`). |
| script-only → 400 | `<script>alert(1)</script>` | 400; no `INSERT INTO activities` | A note with no surviving content is rejected, not stored empty. |

### C.5 `routes/contacts-import.test.js`

The most involved fake, because the import runs inside a transaction and issues ~10 different statements. The interesting rules:

```js
{ match: /SELECT id, email FROM contacts WHERE workspace_id=\$1 AND LOWER\(email\) = ANY/,
  reply: p => ({ rows: p[1].filter(e => db.existing.has(e)).map(e => ({ id: db.existing.get(e), email: e })) }) },
```
- The **prefetch**. `db.existing` maps lower-cased email → id. The route asks for all emails in the file at once (`= ANY($2)`); the fake returns those that exist. This models the *earlier* snapshot.

```js
{ match: /^UPDATE contacts c SET/,
  reply: (p, sql) => { const alive = p[1].filter(id => !db.deleted.has(id)); return { rows: alive.map(id => ({ id })), rowCount: alive.length }; } },
```
- The **batch UPDATE**. `p[1]` is the array of ids the route wants to update. Ids in `db.deleted` are dropped — this is the READ COMMITTED window: the prefetch saw the row, but by the time of the write it is gone, so `RETURNING c.id` does not include it. The route counts only what came back.

```js
{ match: /^INSERT INTO contacts/,
  reply: p => { const n = Math.max(0, (Array.isArray(p[1]) ? p[1].length : 1) - db.insertShort); return { rows: Array.from({ length: n }, () => ({ id: db.nextId++ })), rowCount: n }; } },
```
- The **batch INSERT**. Returns one generated id per row sent (ids from 1000 up), minus `insertShort` — a knob one test uses to simulate `RETURNING` coming back short, proving the route counts what returned rather than what it sent.

`assertIdentities(body, submitted)` checks the two invariants every response must satisfy:
```
submitted === imported + skipped + unmatched
imported  === created  + updated
```

| Test | Fixture | Assertion | Why |
|---|---|---|---|
| deleted between prefetch and UPDATE | existing a→500, b→501; deleted 501; deals for updated | `imported 1`, `unmatched 1`, deals INSERT's id array is `[500]`, identities | The vanished row is neither counted nor handed to the deals statement, and it is accounted for. |
| legacy path | two rows with the same email `d@x.com` (so they go through the per-row path); 500 deleted | `imported 0`, `deals_created 0`, no `INSERT INTO deals … VALUES`, identities (2 = 0 + 0 + 2) | The per-row `UPDATE` returned `rowCount 0`; the route skips the deal and counts `unmatched`. |
| insert count from RETURNING | `insertShort: 1`, three nameless-email rows | `imported 2`, identities (3 = 2 + 0 + 1) | Count comes from the database's answer. |
| nothing deleted | three existing + two new, deals for both | `imported 5`, `deals_created 5`, deal ids `[1000, 1001, 500, 501, 502]`, response keys in exact order, `unmatched 0`, identities | The normal path is unchanged and the key set is pinned. |
| mixed run | two existing (one deleted), two new, one nameless row | `{ imported 3, created 2, updated 1, skipped 1, unmatched 1 }`, identities (5 = 3 + 1 + 1) | Every category at once. |
| 2 001 rows → 413 | an array of 2 001 rows | 413 and `pool.log.length === 0` | The cap is checked before the transaction opens. |

### C.6 `routes/tasks.test.js`

**Fixture.** Workspace 7 owns task 100 (in project 20, which has custom status `qa`), list 30, deal 50, contact 60, user 1. Workspace 8 owns 101, 21, 31, 51, 61, 2.

The ownership rule is the six-slot version of the deals one; a small `kinds` table maps each slot index to its fixture set and its `kind` label. The `jsonb_array_elements` rule (the status query) returns `qa` only when the project id bound is 20. `SELECT project_id FROM tasks WHERE id=$1 AND workspace_id=$2` (used by PATCH-status to find the task's project) returns 20. `FROM tasks t` returns one canned row for the list, detail and subtask queries.

| Group | Test | Assertion | Why |
|---|---|---|---|
| read | list joins and counts scoped | the `subtask_count` query contains `u/cu/dl/ct.workspace_id = t.workspace_id` and exactly two `s.parent_id = t.id AND s.workspace_id = t.workspace_id` | The leak fix and the count fix, checked on the exact SQL the file ships. |
| read | subtask query carries the workspace | a statement matching `WHERE t.parent_id = $1 AND t.workspace_id = $2` exists with params `['100', 7]` | Before the fix the subtask query had one parameter and no workspace filter. |
| refs | six POST cases + one PUT | 400, error starts with the field, no INSERT/UPDATE | Same pattern as deals, six fields. |
| status | bogus on PUT and PATCH | 400, no write | Unknown keys are refused. |
| status | `qa` and `in_review` accepted | 200 | The union: the project's own key and a built-in. |
| status | PUT without status | 400 | Used to be a 500 from NOT NULL. |
| priority | `asap` → 400; absent → `medium` | 400; then 200 and the UPDATE's 4th param is `'medium'` | Fixed allow-list; sensible default. |
| own | POST | 201 `{ id: 99 }`; INSERT params slice `[7, null, 20, 30, 50, 60]` and `['todo', 'medium', 1]` | The write shape is unchanged (parent null because none was sent). |

---

## Part D — client tests (need jsdom)

All three follow one pattern: read the real file from `public/js/`, create a jsdom `window`, define the few globals the file expects (`api`, `esc`, sometimes `currentWorkspace`), evaluate the file's source inside that window with `w.eval(source)`, then call its functions.

### D.1 `client/analytics-page.test.js`

- Loads the **real `index.html`** so the four section elements exist with their real ids, and the **real `analytics.js`**.
- `w.api.get` is a stub that returns a summary fixture for `/api/analytics/summary` and a 7-point trend for anything else — the page code never knows it is not talking to the server.
- `settle()` waits 30 ms because `loadAnalytics()` fires `loadTrend()` without awaiting it.

| Test | Assertion | Why |
|---|---|---|
| loads and renders | sections `['stats','winloss','pipeline','trends']`; 1 pipeline row, 3 win/loss segments, 6 stat cards | The page used to throw on every visit because a "clear stale data" line destroyed the section markup. |
| second load keeps 4 sections | after two `loadAnalytics()` calls, still 4 | Revisiting the page must not lose or duplicate sections (the old clearing line lost them). |
| stored order drives DOM | layout `section_order: ['trends','pipeline','stats','winloss']` → children in that order | Reordering works because the nodes are moved, not rebuilt. |
| drop moves once | two loads, then synthetic `dragstart` on stats and `drop` on winloss → `['winloss','stats','pipeline','trends']` | Listeners are bound once per section; a double binding would apply the move twice and revert it. `dataTransfer` is attached to the synthetic event with `Object.defineProperty` because jsdom's `Event` has no such field. |

### D.2 `client/note-sanitizer.test.js`

- jsdom is created with `runScripts: 'dangerously'` so inline event-handler attributes are compiled into functions, as in a browser.
- `render()` sets `host.innerHTML` and then **dispatches an `error` event on every `<img>`** — a browser does that itself for `src=x`; jsdom does not load images, so the test fires the event the browser would.

| Test | Assertion | Why |
|---|---|---|
| control: raw old row executes | after `render(w, OLD_ROW)`, `w.pwned === 2` | Proves the test can detect execution at all. Without this, the next test could pass for the wrong reason. |
| sanitised row is inert | `render(w, w.sanitizeNoteHtml(OLD_ROW))` → `w.pwned === undefined`; output has no `img/script/onerror/javascript:`; equals `<b>bold</b><a>link</a><p>line</p>` | The render-side guard for rows saved before the server-side fix. |
| attributes stripped except allowed `href` | a link with `target` and `onclick` → only `href` remains; a styled `span` → text | Pins the client allow-list to match the server one. |

### D.3 `client/task-statuses.test.js`

- `tasks.js` declares its state with top-level `let` (`currentProject`, …) and relies on `currentWorkspace` from `core.js`. Because `let` bindings are not properties of `window`, the test evaluates **one combined script**: `let currentWorkspace = null;` + the real `tasks.js` + two tiny probe functions (`__set` to assign the two variables, `__keys` to call `getActiveTaskStatuses()` and return the keys). Everything in that one script shares a scope, so the probes can reach the file's private state.

| Test | `__set(project, workspace)` | `__keys()` | Why |
|---|---|---|---|
| no project | `null`, workspace with `backlog, shipped` | `backlog,shipped` | The Settings list is used — it was ignored before Part 27. |
| project wins | project with `qa`, same workspace | `qa` | Project statuses take precedence. |
| empty project list falls back | project with `statuses: []` | `backlog,shipped` | An empty list is "none", not "override with nothing". |
| nothing configured | `null, null` | `todo,in_progress,in_review,done` | Built-ins, and no throw when `currentWorkspace` is null. |

---

## Part E — reading a red run

1. Look at the first `not ok` line; the indented lines under it give `location` (file:line of the test) and the `+ actual / - expected` pair.
2. If the failing assertion is about `pool.find(...)` being `undefined`, a rule regex no longer matches the SQL — open the route, copy the current statement's stable prefix into the rule.
3. If the failing assertion is a status code, read `body.detail`: the `serve()` error handler puts the thrown error message there.
4. Run just that test with `--test-name-pattern` while fixing; run `npm test` before you finish.
