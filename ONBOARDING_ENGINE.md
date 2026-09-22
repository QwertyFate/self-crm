# UPGRADS Onboarding Engine — CRM integration log

Append-only, stage by stage. Each stage records what changed, where, the decisions behind it, and the proof.

---

## Stage 1 — Schema (`db.js`, `initDb()` lines 422–522)

**What.** Additive migrations only — `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and the file's existing drop-then-add pattern for a CHECK constraint (tolerating error `42710`). No existing table, column, default or constraint is altered; existing rows keep every value. `initDb()` remains safe to run on every start.

### Decisions
- **German names for the new contact fields** (the users are German); the engine tables use English like every other table, since only code reads them. Infrastructure columns (`id`, `workspace_id`, `created_at`) stay as elsewhere.
- **API keys are stored hashed, shown once**: `key_hash` (SHA-256, UNIQUE) plus `key_prefix` for display. A leaked database cannot be used to call the API. Stage 2 generates and compares them.
- **`engine_webhook` is a separate table** from the existing `workspace_webhook`, which is the *inbound* lead-capture hook; this one is *outbound* to the engine.
- `plz` is `TEXT` (German postal codes have leading zeros). `akte_version` is an `INTEGER` counter starting at 0.

### Contacts — 11 new columns
| Column | Type | Meaning |
|---|---|---|
| `onboarding_status` | `TEXT NOT NULL DEFAULT 'kein_onboarding'` + CHECK | dropdown, see below |
| `drive_ordner_id` | `TEXT` | Google Drive folder id |
| `akte_version` | `INTEGER NOT NULL DEFAULT 0` | client-file version counter |
| `rechtsform` / `ust_id` / `handelsregisternummer` | `TEXT` | legal form / VAT id / registration number |
| `webseite` / `quelle` | `TEXT` | website / source |
| `strasse` / `plz` / `ort` | `TEXT` | street / postal code / city |

`contacts_onboarding_status_check` allows exactly: `kein_onboarding` (default; no contract yet), `formular_versendet` (contract signed; form sent), `formular_ausgefuellt` (client submitted the form), `termin_gebucht` (appointment scheduled), `call_erfolgt` (recording available), `briefing_fertig` (briefing.md created; open questions sent), `onboarding_abgeschlossen` (all open questions resolved). Index `idx_contacts_onboarding_status (workspace_id, onboarding_status)`.

### New tables
| Table | Purpose | Notable columns |
|---|---|---|
| `api_keys` | engine API authentication | `name`, `key_prefix`, `key_hash UNIQUE`, `scopes JSONB`, `created_by`, `last_used_at`, `expires_at`, `revoked_at` |
| `engine_webhook` | outgoing webhook settings | `url`, `secret` (HMAC), `events JSONB`, `description`, `active`, `updated_at` |
| `engine_webhook_deliveries` | delivery log + retries | `webhook_id → engine_webhook CASCADE`, `event`, `payload JSONB`, `contact_id`, `status` CHECK (`pending / delivered / failed / dead`), `attempts`, `next_attempt_at`, `last_attempt_at`, `response_status`, `response_body`, `error`, `delivered_at`; indexes `(status, next_attempt_at)`, `(workspace_id, created_at DESC)` |
| `idempotency_keys` | request idempotency | `key`, `request_hash`, `response_status`, `response_body JSONB`, `expires_at DEFAULT NOW() + 24h`; `UNIQUE (workspace_id, key)`; index on `expires_at` |

All four carry `workspace_id … REFERENCES workspaces(id) ON DELETE CASCADE`.

### Tests (in `tests/`, run by `npm test`)
**`tests/unit/db-migrations.test.js`** — unit test of `initDb()` with `pg` swapped for the recording fake pool (`tests/helpers/load-db.js` evaluates any `db.js` source with a given pool). Baseline = the committed `db.js`:
```
BASELINE (pre-change db.js)                                       LIVE
  ok   additive: no destructive statement; only DROP CONSTRAINT IF EXISTS;   ok
       every CREATE/ADD COLUMN guarded; all 31 previous tables still created
  FAIL contacts: 11 columns / types / CHECK order / index  (5 tests)   ok
  FAIL engine tables: created, CASCADE, hash-only keys, retry fields,  ok
       status CHECK, (workspace,key) UNIQUE, 24h default, 4 indexes (6 tests)
  4/15                                                               15/15
```
**`tests/db/onboarding-schema.pg.test.js`** — real PostgreSQL 16, skipped unless `TEST_DATABASE_URL` is set (run here on a throwaway local `crm_stage1`, then dropped; Supabase untouched): builds the *previous* schema from `git show HEAD:db.js`, inserts a workspace and two contacts with real values, runs the *new* `initDb()`:
```
ok  existing rows survive with every original value; new columns hold their defaults
ok  initDb() is idempotent: a second run succeeds
ok  11 columns, 4 tables, CHECK constraint, 4 indexes exist (information_schema / pg_constraint / pg_indexes)
ok  CHECK rejects 'bogus' (23514) and accepts all seven statuses
ok  api_keys.key_hash and idempotency_keys (workspace_id, key) reject duplicates (23505); expires_at ≈ +24h
ok  a delivery row defaults to pending / 0 attempts and refuses an unknown status
6/6
```
Whole suite: `npm test` → 100 tests, 100 pass (client suites and the pg suite report SKIP with their reason). `node --check db.js` passes.

### Files
| File | Change |
|---|---|
| `db.js` | +103 / −0 — Stage 1 block at lines 422–522 inside `initDb()` |
| `tests/helpers/load-db.js` | new — evaluate a `db.js` source with `pg` swapped |
| `tests/unit/db-migrations.test.js` | new — 15 unit assertions on the DDL `initDb()` issues |
| `tests/db/onboarding-schema.pg.test.js` | new — 6 real-Postgres migration checks (skips without `TEST_DATABASE_URL`) |

Not in this stage: routes, API-key generation/verification, webhook dispatch, UI dropdown. Those are Stage 2+.

---

## Stage 2a — API-key authentication + idempotency middleware

**What.** The two pieces every engine endpoint sits behind. No routes yet, no schema change, `db.js` untouched. Error bodies use the engine's German shape `{ "fehler": { "code": "…", "nachricht": "…" } }`.

### `middleware/engine-auth.js` (75 lines) — `engineAuth(req, res, next)`
| Aspect | Behaviour |
|---|---|
| Key source | `Authorization: Bearer <key>`; fallback header `X-API-Key`. Anything else → 401. |
| Lookup | `SELECT id, workspace_id, scopes FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`, with `$1 = sha256(key)`. The plain key never reaches the database; the DB matches digests, so there is no secret comparison in application code and no timing surface. |
| Success | `req.workspaceId`, `req.apiKeyId`, `req.apiScopes` (array; `[]` when the row has none), `req.apiAuth = true`; then `next()`. |
| Usage stamp | `UPDATE api_keys SET last_used_at=NOW() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '1 minute')` — fire-and-forget, throttled to once a minute per key, a failure is logged and never fails the request. |
| Failure | `401 { fehler: { code: 'nicht_authentifiziert', nachricht: 'API-Schlüssel fehlt oder ist ungültig.' } }` + `WWW-Authenticate: Bearer`. One message for missing, malformed, unknown, revoked and expired keys — nothing enumerable. |
| DB error | `next(err)` → the existing error middleware. |
Exports: the middleware (default), `hashKey`, `UNAUTHORIZED`.

### `utils/idempotency.js` (107 lines) — `runIdempotent(req, res, fn)`
Usage: `router.post('/x', engineAuth, (req, res, next) => runIdempotent(req, res, handler).catch(next))`. Must run after `engineAuth` (keys are scoped to `req.workspaceId`; without it → 401).

| Step | Behaviour |
|---|---|
| Header | `Idempotency-Key` missing/blank → `400 idempotency_key_fehlt`; over 255 chars → `400 idempotency_key_ungueltig`. |
| Fingerprint | `request_hash = sha256(method + ' ' + originalUrl + ' ' + stableJson(body))`, keys sorted recursively, so `{a,b}` and `{b,a}` are the same request. |
| Known key, same payload, finished | **replay**: `Idempotent-Replayed: true`, stored status + body; handler not called. Stored for 2xx *and* 4xx so a retry always gets the same answer. |
| Known key, different payload | `422 idempotency_key_konflikt`. |
| Known key, first request still running (`response_status` NULL) | `409 anfrage_in_bearbeitung`. |
| Known key, expired | row deleted, treated as new. |
| New key | `INSERT` reservation; a `23505` (a twin won the race on `UNIQUE (workspace_id, key)`) → 409. |
| Run | `fn(req, res)` with `res.status`/`res.json` wrapped to capture what the handler sends — handlers keep the codebase's normal `res.status(201).json({...})` style; a returned `{ status, body }` is also accepted. Then `UPDATE … SET response_status, response_body`. |
| Handler throws | reservation deleted (the client may retry with the same key); the error propagates to `.catch(next)`. |
| Persist failure after the response was sent | logged, never turned into a 500 on an already-sent response. |
Exports: `runIdempotent`, `requestHash`, `stableJson`, `MAX_KEY_LENGTH`. No sweep of expired rows in this stage (index exists; a later cron).

### Tests (run by `npm test`)
- `tests/unit/engine-auth.test.js` — 9: 401 shape + `WWW-Authenticate` with no query; only the SHA-256 of the presented key is bound; SQL carries the revoked/expiry clauses; non-Bearer scheme → 401 without a query; Bearer → `next()` with all four `req` fields and the throttled usage stamp; `X-API-Key` accepted; scopes default `[]`; a failing stamp does not fail the request; a lookup DB error → `next(err)`.
- `tests/unit/idempotency.test.js` — 13, against an in-memory model of the table (incl. the UNIQUE): 400 shapes; 401 without workspace; first request reserves/runs once/stores/sends; identical retry replays with the header and no handler call; 4xx stored and replayed; different payload → 422; in-flight → 409; INSERT 23505 → 409; handler throw releases the reservation; expired row runs fresh; returned `{status, body}` captured; `requestHash` stable under key order, distinct by method/path/body.
- `tests/routes/engine-middleware.test.js` — 4, the two composed around a write handler over real HTTP: 401 without key; 400 without idempotency key; first call runs in the key's workspace and the identical retry is replayed with `handlerCalls === 1`; different payload → 422.
One harness correction during the run: a `workspaceId: undefined` fixture took the default parameter (7); the test now passes `null`.

```
npm test   tests 126  pass 126  fail 0
```

### Files
| File | Change |
|---|---|
| `middleware/engine-auth.js` | new (75 lines) |
| `utils/idempotency.js` | new (107 lines) |
| `tests/unit/engine-auth.test.js`, `tests/unit/idempotency.test.js`, `tests/routes/engine-middleware.test.js` | new |

`db.js`, `server.js`, `routes/*` unchanged in this stage. Not yet wired into `server.js` — that happens with the first engine route (Stage 2b).

---

## Stage 2b — Outgoing webhook engine (`utils/engine-webhook.js`, 239 lines)

**What.** Events are emitted to every active, subscribed `engine_webhook` of a workspace, signed with the webhook's secret, delivered immediately, and retried by a background worker that claims rows atomically. **Status words are Stage 1's:** success = `delivered`, gave up = `dead` (user's decision; no schema change, `db.js` untouched).

### Contract for the receiver
Body (JSON): `{ "event_id": "evt_<32 hex>", "event": "<name>", "workspace_id": 7, "kunde_id": 60|null, "daten": {…}, "zeitpunkt": "<ISO-8601>" }`.
Headers: `Content-Type: application/json`, `User-Agent: UPGRADS-CRM-Webhook/1`, `X-Upgrads-Signature: sha256=<hex>`, `X-Upgrads-Event`, `X-Upgrads-Event-Id`, `X-Upgrads-Delivery` (row id), `X-Upgrads-Timestamp` (unix seconds).
Verification on the engine side (Node):
```js
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBodyBytes).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.get('X-Upgrads-Signature')))) reject();
```
The signature is over the **exact bytes sent**; it is recomputed at every attempt because JSONB may reorder keys between retries. A 2xx response is success; anything else is retried. Duplicates are possible after a timeout on the receiver's side — dedupe on `event_id`.

### `emitEngineEvent(workspaceId, event, { kundeId, daten }, { sync })` (line 151)
1. `event_id = 'evt_' + 16 random bytes hex`; payload as above.
2. Subscribers: `active = true AND (events = '[]' OR events ? $event OR events ? '*')` — an empty list means every event.
3. One `engine_webhook_deliveries` row per subscriber in a single `INSERT … SELECT FROM unnest($1::int[]) RETURNING id` (`contact_id = kundeId`).
4. Immediate attempt through the same atomic claim as the worker, filtered by id. **Not awaited by default** — the caller's request never waits on a third party; `{ sync: true }` awaits it (tests, scripts). Returns `{ eventId, deliveryIds }`; no subscribers → `deliveryIds: []`, nothing inserted.

### Atomic claim — `claimDue({ limit, ids })` (line 49)
`WITH due AS (SELECT id … WHERE status IN ('pending','failed') AND next_attempt_at <= NOW() [AND id = ANY($2)] ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE … SET attempts = attempts + 1, last_attempt_at = NOW(), next_attempt_at = NOW() + INTERVAL '5 minutes' … RETURNING …` plus the webhook's `url`, `secret`, `active` via subselects. `SKIP LOCKED` means two workers, or a worker and an immediate dispatch, never take the same row; the 5-minute bump is a **lease**, so a row whose worker died becomes due again by itself.

### Outcomes — `attemptDelivery(row)` (line 108)
| Result | Row becomes |
|---|---|
| 2xx | `delivered`; `response_status`, `response_body` (≤ 2 000 chars), `delivered_at`, `next_attempt_at = NULL` |
| non-2xx / network error / timeout (10 s, `AbortSignal.timeout`) | `failed`, `error` = `HTTP <n>` / message / `Timeout nach 10000 ms`; `next_attempt_at = NOW() + BACKOFF_MINUTES[attempts−1]` |
| 7th failure | `dead` (gave up) |
| webhook deactivated meanwhile | `dead`, `Webhook inaktiv`, no request made |

`BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720]` → attempts at ~0, 1 m, 6 m, 36 m, 2.6 h, 8.6 h, 20.6 h: **7 attempts over ≈ 21 h**. `MAX_ATTEMPTS = 7`.

### Worker — `startEngineWebhookWorker({ intervalMs = 30_000, batch = 20 })` (line 214)
`setInterval` (unref'd: never keeps the process alive) → `runWorkerOnce()`: claim up to `batch` due rows, deliver sequentially, log one summary line when anything was processed. Overlap guard: a tick that starts while the previous one is still running returns `{ skipped: true }`. Idempotent (a second start returns the same handle). Returns `{ stop, runWorkerOnce }`.
**Wired in `server.js:309`**, inside the existing `initDb().then(listen)` chain, so it starts only when the server actually starts; merely requiring the module (tests, scripts) opens no DB connection — the default engine binds to the real pool lazily.

### Design notes
- Factory with injectable `pool`, `fetch`, `now`, `random`, `timeoutMs`, `log` (same pattern as `utils/chat-rate-limit.js`); default exports delegate to a lazily created instance.
- No sweep of old delivery rows in this stage (the `(workspace_id, created_at DESC)` index serves the log view; pruning is a later cron).
- Not yet emitted from anywhere: the first call site is the Stage 3 contact-status route.

### Tests — `tests/unit/engine-webhook.test.js` (16, fake pool modelling both tables, scriptable fetch, fixed clock and randomness)
signature verifiable with `crypto`; fan-out exactly to the active subscribed hooks of that workspace (wildcard, exact match; inactive / other event / other workspace excluded) with the payload contract; no subscriber → no INSERT; sync dispatch sends the six headers and a body whose signature verifies; missing workspace/event rejected; 2xx → delivered with response captured; 5xx → failed with the 1-minute first delay, `HTTP 500`, body kept; network error and timeout messages; the full backoff table across 7 attempts ending in `dead`; deactivated hook → `dead` without a request; claim SQL (`FOR UPDATE SKIP LOCKED`, due predicate, lease bump, id filter only when ids given); worker processes only due rows with a summary; overlap guard; start/stop/unref/idempotent; status constants.
Three harness corrections during the run (fixture wildcard made "no subscriber" wrong; two tests raced the background dispatch — now `sync: true` / seeded rows). No code change resulted.

```
npm test   tests 142  pass 142  fail 0
```

### Files
| File | Change |
|---|---|
| `utils/engine-webhook.js` | new (239 lines) |
| `server.js` | +1 (line 309: start the worker after listen) |
| `tests/unit/engine-webhook.test.js` | new (16 tests) |

`db.js`, `routes/*`, `middleware/*` unchanged in this stage.

---

## Stage 3 — Engine API endpoints (`routes/engine-api.js`, 108 lines; mounted at `/api/kunden`, `server.js:171`)

**What.** The first two endpoints the Onboarding Engine calls. Both sit behind `engineAuth` (API key → `req.workspaceId`); every query is scoped to that workspace. No session, no CSRF: the API key is the credential. No schema change; `db.js` untouched.

**Loop prevention.** `routes/engine-api.js` does **not** require `utils/engine-webhook.js` and never calls `emitEngineEvent`: a status set *by* the engine must not be echoed back *to* the engine. Outbound events will be emitted only from CRM-user actions. A test asserts this statically (no such require/identifier in the source) and at runtime (the module is not loaded, the webhook tables are never touched).

### `GET /api/kunden/:id`
`SELECT … FROM contacts WHERE id=$1 AND workspace_id=$2` → 200 with the German view; a contact of another workspace is indistinguishable from a nonexistent one (404).
```json
{ "kunde_id": 60, "firma": "Muster GmbH", "ansprechpartner": "Erika Muster", "email": "erika@muster.de", "telefon": "+49 30 1", "kontakt_typ": "contact",
  "adresse": { "strasse": "Musterstr. 1", "plz": "01067", "ort": "Dresden" },
  "rechtsform": "GmbH", "ust_id": "DE123456789", "handelsregisternummer": "HRB 1", "webseite": null, "quelle": "Empfehlung",
  "onboarding_status": "kein_onboarding", "drive_ordner_id": null, "akte_version": 0,
  "erstellt_am": "2026-09-01T08:00:00.000Z", "aktualisiert_am": "2026-09-10T08:00:00.000Z" }
```
Empty columns are `null`, never absent — the key set is stable (17 keys, `adresse` grouped).

### `PATCH /api/kunden/:id/status`
Headers: `Authorization: Bearer <key>`, `Idempotency-Key: <unique per logical request>`. Body: `{ "onboarding_status": "<one of 7>", "drive_ordner_id"?: "<Drive folder id>" | null }`.
`UPDATE contacts SET onboarding_status=$1, updated_at=NOW()[, drive_ordner_id=$2] WHERE id=$n AND workspace_id=$n RETURNING …` → 200 with the same view. `drive_ordner_id` is written only when the key is present in the body; present with `null` clears it; absent leaves it untouched. `akte_version` is not changed here.

### Error codes (all `{ "fehler": { "code", "nachricht" } }`)
| Status | code | When |
|---|---|---|
| 400 | `ungueltige_id` | `:id` is not all digits (no 500 on `/abc`) |
| 400 | `idempotency_key_fehlt` / `idempotency_key_ungueltig` | PATCH without the header / over 255 chars |
| 401 | `nicht_authentifiziert` | missing, unknown, revoked or expired key (+ `WWW-Authenticate: Bearer`) |
| 404 | `nicht_gefunden` | no such contact **in this workspace** |
| 409 | `anfrage_in_bearbeitung` | the first request with this key is still running |
| 422 | `ungueltiger_status` | status not one of the seven (the message lists them) |
| 422 | `ungueltige_daten` | `drive_ordner_id` not a string/null or over 255 chars |
| 422 | `idempotency_key_konflikt` | same key reused with a different body |
A retry with the same key and body returns the stored answer — 200 **or** the stored 404/422 — with `Idempotent-Replayed: true` and no second write.

### Tests — `tests/routes/engine-api.test.js` (11, real router behind the real `engineAuth` + `runIdempotent`, over HTTP, fake pool)
401 on both routes with no contact query; GET: exact 17-key set, grouped address, nulls, bind `[60, 7]`; foreign workspace → 404 with the scoped SQL; `/abc` → 400. PATCH: no key → 400 and no UPDATE; `bogus` → 422 naming all seven, no UPDATE; each of the seven → 200; `drive_ordner_id` set / untouched / cleared / refused (SET clause and params asserted); replay → identical body, header, exactly one UPDATE; foreign contact → 404, and the 404 replays. Loop prevention: no webhook SQL, module not loaded, no `emitEngineEvent` in the source.
One harness correction: a "not in the SET clause" regex had matched the column in `RETURNING`; it now targets `drive_ordner_id = $`.

```
npm test   tests 153  pass 153  fail 0
```

### Files
| File | Change |
|---|---|
| `routes/engine-api.js` | new (108 lines) — `ONBOARDING_STATUSES` and `kundeView` exported |
| `server.js` | +1 (line 171: mount at `/api/kunden`) |
| `tests/routes/engine-api.test.js` | new (11 tests) |

`db.js`, `middleware/*`, `utils/*` unchanged in this stage. Still open for a later stage: scope enforcement (`req.apiScopes` is set but not yet checked), API-key creation UI/route, the outbound `emitEngineEvent` call site in `routes/contacts.js`, and the status dropdown in the contact form.

---

## Stage 4 — Manual onboarding trigger + engine API rate limiter

**What.** The first CRM-side action that talks *to* the engine, and the last `server.js` wiring item. No schema change; `db.js` untouched.

**Already in place (not redone).** Two of the three requested `server.js` items were done in earlier stages: the webhook worker starts inside the `initDb().then(listen)` chain (Stage 2b, now line 318) and `routes/engine-api.js` is mounted at `/api/kunden` (Stage 3, now line 179). Only the rate limiter is new here.

### `POST /api/contacts/:id/onboarding/start` (`routes/contacts.js:419`, session-authenticated like the rest of the file)
1. `:id` must be all digits → `400 { error: 'Invalid id' }` (this router's English shape).
2. `UPDATE contacts SET onboarding_status='formular_versendet', updated_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING …` → 0 rows: `404 { error: 'Not found' }`.
3. `emitEngineEvent(workspaceId, 'vertrag.unterschrieben', { kundeId, daten })` with fallback contract data:
   ```json
   { "vertrag_id": "manuell_<id>_<unix ms>", "quelle": "manuell", "ausgeloest_von": <user id>,
     "onboarding_status": "formular_versendet", "kunde": { "name", "email", "firma" } }
   ```
   The status change is the source of truth: if the webhook insert fails, it is logged and the response reports `deliveries: 0` — the status is **not** rolled back.
4. `notify(...)` "Onboarding gestartet: <name>" (same helper as the other contact writes).
5. `201 { success: true, onboarding_status: 'formular_versendet', event_id, deliveries }` — `deliveries` is the number of webhook rows created (0 when no engine webhook is configured yet).

**Decision.** Re-triggering is allowed: calling it on a contact already further along resets it to `formular_versendet` (the spec says "sets"; no guard). Say so if a guard is wanted.

`routes/contacts.js` now requires `utils/engine-webhook.js` (line 11) — the CRM-user side is where outbound events belong; `routes/engine-api.js` stays webhook-free (Stage 3's loop rule, still asserted by its test).

### `server.js` — `engineApiLimiter` (line 120, applied at line 178 before the mount)
300 requests per minute per IP (the Part 2 Cloudflare trust list decides the IP), `standardHeaders`, message `{ fehler: { code: 'zu_viele_anfragen', nachricht: 'Zu viele Anfragen. Bitte später erneut versuchen.' } }`.

### Tests
- `tests/routes/contacts-onboarding.test.js` (4; engine swapped for a recording stub): 201 + UPDATE binds `[60, 7]` + emit called once with the exact event/kundeId/daten (`vertrag_id` matches `manuell_60_<13 digits>`) + notification; foreign contact → 404 and no emit; `/abc` → 400, no query, no emit; emit throwing → still 201 with `deliveries: 0` and the status kept.
- `tests/unit/server-wiring.test.js` (3, static): limiter is 300/60 s with the German shape; limiter `app.use` precedes the single engine-router mount; worker start is inside the `initDb().then` chain after `listen`.
```
npm test   tests 160  pass 160  fail 0
```

### Files
| File | Change |
|---|---|
| `routes/contacts.js` | +45 — require (line 11), `POST /:id/onboarding/start` (line 419) |
| `server.js` | +8 — `engineApiLimiter` (120–125), `app.use('/api/kunden', engineApiLimiter)` (178) |
| `tests/routes/contacts-onboarding.test.js`, `tests/unit/server-wiring.test.js` | new |

Still open: an `engine_webhook` row has to exist for anything to be delivered — there is no route or UI yet to create webhooks or API keys (that is the next stage); scope enforcement; the status dropdown in the contact form; a "Start onboarding" button calling this endpoint.

---

## Stage 5 — Settings UI (outgoing webhook, API keys) and the contact trigger

**What.** The screens that make the integration usable: a workspace owner configures the outgoing webhook, mints and revokes API keys, watches and retries deliveries, sends a test event; any member starts onboarding from a contact and sees its status. **The UI needed endpoints that did not exist** (nothing could create an `engine_webhook` or `api_keys` row), so this stage adds one session-authenticated route file. No schema change; `db.js` untouched.

### Decisions
- **Owner-only** for every settings route (`req.userRole !== 'owner' → 403 'Owner only'`, the same rule as workspace member management). Members see the cards read-only with a hint.
- **One webhook per workspace in the UI.** The schema allows more; the UI manages the first row.
- **Show once.** The webhook secret (on create and on rotate) and the API key (on create) are returned in that one response and displayed in a highlighted box; later reads show only the secret's last four characters / the key's 12-character prefix. API keys are stored only as a SHA-256 hash.
- **Status labels are German in both UI languages** (business terms): Kein Onboarding, Formular versendet, Formular ausgefüllt, Termin gebucht, Call erfolgt, Briefing fertig, Onboarding abgeschlossen.
- **Manual retry re-arms a dead row** with `attempts = LEAST(attempts, 6)` so it gets one more attempt with a valid backoff, then is attempted immediately.
- **Re-trigger** from the detail view is allowed (Stage 4); the confirm text warns that the status will be reset when the contact is already in onboarding.

### `routes/engine-settings.js` (157 lines; `server.js:168` → `/api/engine-settings`)
| Method & path | Does |
|---|---|
| `GET /webhook` | `{ webhook: {id,url,events,description,active,secret_hint,…} \| null, available_events }` |
| `PUT /webhook` | validates url (http/https, ≤ 2048) and events (`*` or known names); creates with a fresh 32-byte secret (**returned once**, 201) or updates (200) |
| `POST /webhook/rotate-secret` | new secret, stored, returned once; 404 when none |
| `POST /webhook/test` | `emitEngineEvent(…, 'test.ereignis', …, { sync: true })` → `{ event_id, deliveries:[{id,status,response_status,error}] }`; 400 when no active webhook subscribes |
| `GET /webhook/deliveries?limit=` | last N (≤ 200), workspace-scoped |
| `POST /webhook/deliveries/:id/retry` | re-arm (`failed`/`dead` only, attempts clamped) then `attemptDeliveries([id])` → outcome |
| `GET /api-keys` | list without the hash |
| `POST /api-keys { name }` | `upg_live_<32 hex>`, hash stored, prefix = first 12 chars, **key returned once** |
| `DELETE /api-keys/:id` | `revoked_at = NOW()` (row kept for audit); 404 if foreign/already revoked |
`AVAILABLE_EVENTS = ['vertrag.unterschrieben', 'test.ereignis']`. `utils/engine-webhook.js` now also exports `attemptDeliveries` (+1 line) for the manual retry.

### Client
- **`public/index.html`** (+47, lines 948–1000): two `settings-card`s on the Integrations page — `#eng-webhook-card` (URL, Active, Description, event checkboxes incl. "All events (*)", secret hint + Rotate, one-time reveal box with Copy, Save, Send test event, delivery log with per-row Retry) and `#eng-keys-card` (name + Create, one-time reveal box, key list with Revoke). All text via `data-i18n`.
- **`public/js/integrations.js`** (+140): `loadEngineSettings()` (called from `loadIntegrations`), `engSaveWebhook`, `engRotateSecret`, `engSendTest`, `engLoadDeliveries`, `engRetryDelivery`, `engLoadKeys`, `engCreateKey`, `engRevokeKey`, `engCopy`; inputs and buttons disabled for non-owners; every dynamic string through `esc()`.
- **`public/js/core.js`** (+33): `col_onboarding`, `lbl_onboarding`, `btn_start_onboarding`, `onb_confirm*`, the seven `onb_*` labels, and ~30 `eng_*` keys in both `en` and `de`.
- **`public/js/contacts.js`** (+33): `ONBOARDING_STATUS_META` (seven keys, colours), `onboardingBadge()` (stage-badge markup, German label, unknown → Kein Onboarding), an optional table column `onboarding_status` (off by default, enable in column settings), `startOnboarding(id, currentStatus)` → confirm → `POST /api/contacts/:id/onboarding/start` → refresh list and detail.
- **`public/js/modals.js`** (+2): the detail view shows an "Onboarding" row with the badge and a primary **Start Onboarding / Onboarding starten** button.

### Tests
- `tests/routes/engine-settings.test.js` (9): member → 403 on all nine routes with no query; GET null + events; create returns a 64-hex secret once and the INSERT bound it, next GET shows only the hint; update in place, bad url / unknown event → 400; rotate stores a new secret, 404 when none; test emits `test.ereignis` with `sync`; deliveries scoped and limited, retry clamps attempts and attempts once, foreign → 404; key create returns `upg_live_<32 hex>` once and stores only the sha256 with a 12-char prefix (the plain key never bound), list omits it; missing name → 400; revoke, double revoke / foreign → 404.
- `tests/unit/ui-onboarding.test.js` (6): all 20 `eng-*` ids present; every `data-i18n` key used by the cards exists in **both** dictionaries; every `eng*` handler the markup calls is defined and `loadEngineSettings()` is wired; the seven labels are German in both dictionaries; `contacts.js` defines badge/meta (exactly seven)/column/`startOnboarding` with the right URL; `modals.js` shows badge and button; with jsdom: the badge renders the German label with its colour and falls back safely for unknown input.
One harness correction (a fake-pool regex anchored on the wrong part of the GET column list).
```
npm test   tests 175  pass 175  fail 0
```

### Files
| File | Change |
|---|---|
| `routes/engine-settings.js` | new (157) |
| `server.js` | +1 (mount, line 168) |
| `utils/engine-webhook.js` | +1 (export `attemptDeliveries`) |
| `public/index.html`, `public/js/integrations.js`, `public/js/core.js`, `public/js/contacts.js`, `public/js/modals.js` | +47 / +140 / +33 / +33 / +2 |
| `tests/routes/engine-settings.test.js`, `tests/unit/ui-onboarding.test.js` | new |

---

## Where things stand after Stage 5

**Complete, end to end:** schema (1) → API-key auth + idempotency (2a) → signed outgoing webhooks with retries (2b) → engine API `GET /api/kunden/:id`, `PATCH …/status` (3) → manual trigger `POST /api/contacts/:id/onboarding/start` + engine rate limit (4) → settings UI, API keys, delivery log, contact badge and button (5). `db.js` changed only in Stage 1; every stage was verified with a failing baseline first; `npm test` runs 175 checks with no new dependency.

**To go live:** an owner opens Integrations, saves the webhook URL (copies the secret to the engine), creates an API key (copies it to the engine), sends a test event, then starts onboarding on a contact.

**Still open (small):** scope enforcement on API keys (`req.apiScopes` is set, not checked); pruning of old delivery and idempotency rows (indexes exist; a cron); an `akte_version` bump policy; a `test.ereignis` handler on the engine side.

---

## UI: Onboarding page and deal button (Part 41)

- **Sidebar → Onboarding**: every contact whose `onboarding_status` is not `kein_onboarding`, with the stage badge, a six-segment progress bar (`n/6` in the order `formular_versendet → … → onboarding_abgeschlossen`), assignee and the last change (`contacts.updated_at`). Pills filter by step, the search box matches name / company / email, the name opens the contact detail (which has the *Start Onboarding* button). Data comes from `GET /api/contacts`; there is no extra endpoint. Code: `public/js/onboarding.js`.
- **Deal editor → Start Onboarding** (header, next to "＋ Task", existing deals only): starts onboarding for the contact currently selected in the deal; the deal's contact panel shows the stage badge and updates in place. Same confirm and the same `POST /api/contacts/:id/onboarding/start` as the contact detail, via the shared `requestOnboardingStart()` in `public/js/contacts.js`.

---

## Manual status change and stage trigger (Part 42)

**`PATCH /api/contacts/:id/onboarding-status`** (session, any member) `{ "onboarding_status": "<one of the seven>" }` → `200 { success, onboarding_status, vorher, event_id, deliveries }`. Used by the status dropdown next to the badge in the contact detail, the deal editor's contact panel and the Onboarding page. When the value changes, the engine receives:

```json
{ "event_id": "evt_…", "event": "onboarding.status_geaendert", "workspace_id": 1, "kunde_id": 60,
  "daten": { "onboarding_status": "termin_gebucht", "vorher": "formular_versendet", "quelle": "manuell", "ausgeloest_von": 1,
             "kunde": { "name": "…", "email": "…", "firma": "…" } },
  "zeitpunkt": "…" }
```
`AVAILABLE_EVENTS` is now `vertrag.unterschrieben`, `onboarding.status_geaendert`, `test.ereignis`. A status set **by** the engine (`PATCH /api/kunden/:id/status`) is never echoed back. The seven statuses live once in `utils/onboarding-statuses.js`.

**Stage trigger.** `workspaces.onboarding_trigger_stage_ids` (JSONB list of `pipeline_stages.id`), set by the owner in Settings → Deals → *Onboarding trigger* via `PATCH /api/workspace/onboarding-trigger { stage_ids }`. When a deal **enters** one of those stages (kanban drop or deal form) and its contact is not yet in onboarding, the CRM asks whether to start onboarding; yes → the same `POST /api/contacts/:id/onboarding/start` as the button (one confirm only). Moving between two trigger stages, re-saving the same stage or an already-onboarded contact never asks.

---

## Google Drive folder on contact and deal (Part 44)

`contacts.drive_ordner_id` may hold a **bare folder id or a full Drive folder link** (`…/drive/folders/<id>`, `…/open?id=<id>`); the UI normalises either at read time, and `PATCH /api/contacts/:id/drive-folder { drive_ordner_id }` (session) stores the bare id from whatever a user pastes. The engine keeps setting the field through `PATCH /api/kunden/:id/status`.

Folders are shared **"Anyone with the link"**. The contact detail, the deal editor's contact panel and the Onboarding page show the folder; the first two embed Google's folder view (`https://drive.google.com/embeddedfolderview?id=<id>#list`), where clicking a file opens Google's own preview (images, PDF, Word/Excel/PowerPoint, Google Docs). A *Popup* button opens the same view in a separate window. No API key, no server-side listing; the production CSP allows `drive.google.com` in `frameSrc`.

---

## Drive file sync (Part 45)

The CRM reads each contact's public Drive folder (`contacts.drive_ordner_id`, bare id or full link — the engine may send either) through the Drive API with one server-side key and keeps the files in **`contact_drive_files`** (`workspace_id`, `contact_id`, `file_id`, `name`, `mime_type`, `size`, `modified_at`, `synced_at`, unique per contact+file). The contact carries `drive_synced_at`, `drive_sync_error` (`not_public` | `timeout` | `upstream` | `not_configured` | null) and `drive_file_count`.

**When it syncs:** on `PATCH /api/contacts/:id/drive-folder` (right after saving), on `POST /api/contacts/:id/drive-sync` (Sync button, 20/min per IP), in the background after the engine's `PATCH /api/kunden/:id/status` sets `drive_ordner_id` (the engine never waits on Google), and by a worker every `DRIVE_SYNC_INTERVAL_MIN` (15) minutes for contacts older than `DRIVE_SYNC_MAX_AGE_MIN` (60). A Drive failure keeps the previous rows and stores the error code.

**Endpoints (session):** `GET /api/contacts/:id/drive-files` → `{ folder_id, folder_url, embed_url, synced_at, sync_error, configured, files: [{ id, name, mime_type, size, modified_at, kind, is_folder, previewable, preview_url, open_url }] }` from the table only; `POST /api/contacts/:id/drive-sync` → the same shape after re-reading the folder (503 `drive_not_configured` without a key; a Drive failure is 200 with `sync_error`).

**Setup (developer, once):** Google Cloud Console → enable *Google Drive API* → Credentials → API key restricted to the Drive API → `GOOGLE_API_KEY=` in `.env`. The key identifies the app for quota; it grants no access of its own and works for public folders owned by any Google account, so one key serves every workspace. Without it the folder link and the embedded view still work; only the stored list is off.

**Files window (Part 46).** `/drive.html?contact=<id>[&file=<id>]` — a same-origin page the CRM opens in its own window: the contact's synced files as icon tiles with search, Icons/List, Sync, and a preview pane that frames Google's viewer for the selected file. Uses the endpoints above; nothing new server-side.
