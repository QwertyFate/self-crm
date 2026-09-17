# Tests — how they work, how to run them, how to add one

This folder is the automated test suite for the CRM. It uses **Node's built-in test runner** (`node:test`, part of Node 22) and **nothing else**: no jest, no mocha, no new dependency in `package.json`. The only line the app's `package.json` gained is the `test` script.

```
npm test                                   # everything
node --test tests/routes/deals.test.js     # one file
node --test --test-name-pattern "foreign contact_id" tests/routes/deals.test.js   # one test by name
```

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

## 2. The three kinds of test in this folder

| Folder | Tests what | Needs | Speed |
|---|---|---|---|
| `unit/` | One function at a time: `sanitizeNote`, `refCheck`, the chat limiter, the console-path check. Pure input → output. | nothing | milliseconds |
| `routes/` | A **real** route file (`routes/deals.js` etc.) over **real HTTP**, with the database replaced by a fake that records SQL. | `express` (already installed) | ~50 ms per file |
| `client/` | The **real** browser files (`public/js/*.js`, `public/index.html`) inside a fake browser. | `jsdom` (optional, `npm i -D jsdom`) | ~200 ms per file |

Without jsdom the `client/` suites print `# SKIP jsdom is not installed …` and the run still succeeds. Nothing in the app ever depends on jsdom.

---

## 3. How route tests work without a database

This is the part that usually looks like magic, so here it is step by step.

### 3.1 The fake pool (`helpers/fake-pool.js`)

Every route talks to Postgres through one object, the pool, and only ever calls `pool.query(sql, params)` (or `pool.connect()` then `client.query(...)` inside a transaction). The fake pool is an object with those same methods. When the route calls `query`, the fake:

1. **records** the SQL text and the bound parameters into `pool.log`, and
2. **answers** by checking a list of rules you gave it — the first rule whose regular expression matches the SQL text supplies the reply. No match → an empty result.

```js
const pool = createFakePool([
  { match: /^INSERT INTO deals/, reply: () => ({ rows: [{ id: 99 }], rowCount: 1 }) },
]);
```

So the test controls what "the database" says, and afterwards it can inspect what the route *asked*:

```js
pool.find(/^INSERT INTO deals/).params   // -> [7, 10, 10, 20, 30, 'T', null, 1, 0, '{}']
pool.some(/id = ANY/)                    // -> did the route run the ownership lookup at all?
```

That is how a test can prove "a foreign id was rejected **and nothing was written**": it checks the status code *and* that `pool.log` contains no INSERT.

### 3.2 Swapping the database in (`helpers/load-route.js`)

The route file starts with `const { pool } = require('../db')`. We do not edit that line. Instead we use a fact about Node: every module it loads is kept in a cache, `require.cache`, keyed by absolute file path, and `require` looks there first. `loadRoute()` puts our fake pool into that cache under the path of `db.js` **before** loading the route, so the route's own `require('../db')` receives the fake. The same trick replaces `middleware/auth.js` (so the test is "logged in" as user 1 in workspace 7 without a session cookie) and `notifications.js` (so no notification is actually sent).

Everything else the route requires — express, the utils, `sanitize-html` — is the genuine module. **The code under test is the code that ships.**

### 3.3 Real HTTP (`serve()`)

`serve()` mounts the router on a throwaway Express app listening on a random free port and returns `request(method, path, body)`. A route test therefore goes through JSON parsing, Express routing, the auth middleware and the error handler exactly as production traffic does. Only the pool is fake.

### 3.4 The trade-off you should know about

Rules match the **SQL text**. If you rewrite a query — rename a column, restructure a join — a rule may stop matching and the fake will return an empty result, and a test will fail. That failure is *informative* ("this test's idea of the SQL is stale"), not a sign the app is broken. Update the rule's regex and re-run. Keep rules short and anchored to the stable part of the statement (`/^INSERT INTO deals/`, `/id = ANY/`).

---

## 4. Reading the output

Each file runs in its own process; the runner prints one line per test and a summary:

```
ok 3 - PUT binds the same 11 parameters
not ok 4 - omitted ids are not validated ...
# tests 85
# pass 84
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

Read the `+ actual` / `- expected` pair first; nine times out of ten it tells you everything.

---

## 5. Adding a test

**A unit test** (a function with no I/O) — copy this into `tests/unit/<name>.test.js`:

```js
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { myFunction } = require('../../utils/my-module');

test('describes the behaviour in plain words', () => {
  assert.equal(myFunction('input'), 'expected output');
});
```

**A route test** — copy this into `tests/routes/<name>.test.js`:

```js
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

**Naming:** the test name is a sentence about behaviour ("a foreign id is rejected before anything is written"), not about code ("calls refCheck"). When it fails months from now, the name should tell the reader what promise was broken.

**One idea per test.** If a test checks four unrelated things, a failure in the first hides the other three. The suite uses `describe()` blocks to group related tests and a small `for` loop when the same check applies to several inputs (see `routes/deals.test.js`).

---

## 6. What is covered

| File | Proves |
|---|---|
| `unit/sanitize-note` | allow-list, `div→p`, `javascript:` links dropped, empty when only markup, null passthrough |
| `unit/workspace-refs` | `refCheck` rules; `dealRefs`/`taskRefs` bind only supplied ids in fixed slots; no query when nothing supplied; `allowedTaskStatuses` union |
| `unit/chat-rate-limit` | 6 allowed / 7th refused with `retryAfterMs`; window slides; per-user buckets; middleware 400 / 413 / 429 order |
| `unit/admin-console` | unset → disabled; valid path accepted; guessable or malformed → boot error |
| `routes/deals` | joins scoped; 7 foreign-id cases → 400 with no write; own ids → identical INSERT/UPDATE parameters; lookup bound only to supplied ids |
| `routes/objects` | 8 mismatched-ownership cases → 404 with no write; own links unchanged; 400 before any query |
| `routes/analytics` | injection payload never in SQL text; typed bind + type guard; text field never bare-cast; config allow-list; response key sets |
| `routes/activities` | note and comment sanitised on write; `div→p`; @mention still notifies; script-only → 400 |
| `routes/contacts-import` | counts from `RETURNING`; the two identities on every case; deleted-mid-import row counted as `unmatched`; key set; 2 001 rows → 413 |
| `routes/tasks` | joins and count subqueries scoped; subtask query scoped; 6 foreign refs → 400; status/priority validation; PUT without status → 400; own ids → 201 |
| `client/analytics-page` | page loads, 4 sections, survives revisit, honours stored order, drop moves once |
| `client/note-sanitizer` | control proves the old row executes; sanitised row does not; formatting kept |
| `client/task-statuses` | project → workspace → built-ins precedence |

Not covered here (they need a live Postgres): the `EXPLAIN` of the scoped task queries. That was done once on a throwaway local database during the review (change log, Part 26) and is not a regression risk unless the SQL changes — in which case the `routes/tasks` text checks fail first.

---

## 7. Gotchas

- **Each file is its own process.** State does not leak between files; it can leak between tests *within* a file, which is why every route file calls `pool.reset()` in `beforeEach`.
- **`node --test` runs files in parallel** by default. Tests that bind a port use port 0 (random free port) so they never collide.
- **The chat limiter starts a sweep timer.** It is `unref`'d so it never keeps the process alive; the tests also call `stop()` in `after` to be tidy.
- **`skip: null` still skips.** Node treats the presence of the `skip` key as the signal. `helpers/dom.js` exports `skipOpts` (`{ skip: reason }` or `{}`) for that reason.
- **Do not put secrets in tests.** Fixtures use ids like 7, 8, 100; nothing here reads `.env`.
