# Onboarding Engine — manual endpoint testing guide

Every endpoint created in Stages 1–5, with the exact parameters, headers, bodies, and the `curl` command to try it. Follow the sections in order: each one produces something the next needs (a session cookie → an API key and a webhook → a contact status → a delivery in the log).

Assumptions: the app runs locally at `http://localhost:3000` (`PORT` in `.env` otherwise), you have a workspace owner account, and `.env` has `SESSION_SECRET` set. Replace `<…>` placeholders. Keep a shell variable per secret so you never paste it twice.

```bash
BASE=http://localhost:3000
```

---

## 0. Prerequisites — a session cookie and a test receiver

### 0.1 Log in and keep the cookie (session-authenticated routes)

```bash
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"<owner email>","password":"<password>"}' \
  $BASE/api/auth/login
```
Expected: `200` with `{ "user": {…, "role": "owner"}, "workspace": {…} }`. `cookies.txt` now holds the session; pass `-b cookies.txt` on every session route below.

### 0.2 A receiver for the outgoing webhook

Any HTTPS/HTTP endpoint that returns 2xx works. Quick options:
- **webhook.site** — open the page, copy your unique URL. It shows every request with headers and body.
- **Local, no dependencies** (in a second terminal):
  ```bash
  node -e "require('http').createServer((q,s)=>{let b='';q.on('data',c=>b+=c).on('end',()=>{console.log(new Date().toISOString(),q.method,q.url);console.log(JSON.stringify(q.headers,null,1));console.log(b);s.writeHead(200);s.end('ok')})}).listen(4010,()=>console.log('receiver on :4010'))"
  ```
  Then use `http://localhost:4010/hook` as the target URL.

---

## 1. Settings routes — `/api/engine-settings/*` (session, **owner only**)

All bodies are JSON (`-H 'Content-Type: application/json'`). A member account gets `403 { "error": "Owner only" }` on every one of these.

### 1.1 `GET /api/engine-settings/webhook` — current webhook
No parameters.
```bash
curl -s -b cookies.txt $BASE/api/engine-settings/webhook
```
Expected first time: `{ "webhook": null, "available_events": ["vertrag.unterschrieben","test.ereignis"] }`.

### 1.2 `PUT /api/engine-settings/webhook` — create or update
| Field | Type | Rules |
|---|---|---|
| `url` | string | required; `http://` or `https://`; ≤ 2048 chars |
| `events` | string[] | each is `"*"` or one of `available_events`; `[]` also means all |
| `description` | string \| null | optional, ≤ 500 |
| `active` | boolean | default `true` |

```bash
curl -s -b cookies.txt -X PUT -H 'Content-Type: application/json' \
  -d '{"url":"http://localhost:4010/hook","events":["*"],"description":"Engine dev","active":true}' \
  $BASE/api/engine-settings/webhook
```
Expected on first call: `201` with `"secret": "<64 hex>"` **— copy it now; it is never shown again** — and `webhook.secret_hint` = its last 4 chars. Store it: `SECRET=<64 hex>`.
Second call with the same body: `200`, no `secret` field, row updated in place.
Negative checks: `"url":"ftp://x"` → `400 url must be an http(s) URL`; `"events":["nope"]` → `400`.

### 1.3 `POST /api/engine-settings/webhook/rotate-secret`
No body.
```bash
curl -s -b cookies.txt -X POST $BASE/api/engine-settings/webhook/rotate-secret
```
Expected: `200 { "webhook": {…}, "secret": "<new 64 hex>" }` (shown once). `404` if no webhook exists yet. Update `SECRET`.

### 1.4 `POST /api/engine-settings/webhook/test` — send `test.ereignis` now
No body.
```bash
curl -s -b cookies.txt -X POST $BASE/api/engine-settings/webhook/test
```
Expected: `200 { "event_id": "evt_…", "deliveries": [ { "id": 1, "status": "delivered", "response_status": 200, "error": null } ] }`. Your receiver prints the request. `400` if the webhook is inactive or not subscribed to `test.ereignis`/`*`.
Stop the receiver and call again → `"status": "failed", "error": "…ECONNREFUSED…"` (the worker retries it: see 1.6).

### 1.5 `GET /api/engine-settings/webhook/deliveries?limit=50` — delivery log
| Query | Type | Rules |
|---|---|---|
| `limit` | integer | optional, 1–200, default 50 |
```bash
curl -s -b cookies.txt "$BASE/api/engine-settings/webhook/deliveries?limit=10"
```
Expected: array, newest first: `id, event, status (pending|delivered|failed|dead), attempts, response_status, error, created_at, last_attempt_at, delivered_at`.

### 1.6 `POST /api/engine-settings/webhook/deliveries/:id/retry` — manual retry
| Param | Rules |
|---|---|
| `:id` | integer; the row must be `failed` or `dead` and belong to your workspace |
```bash
curl -s -b cookies.txt -X POST $BASE/api/engine-settings/webhook/deliveries/2/retry
```
Expected: `200 { "id": 2, "status": "delivered"|"failed"|"dead", "response_status": …, "error": … }`. `404 Delivery not found or not retryable` for a delivered row or another workspace's row. A `dead` row is re-armed with `attempts` clamped to 6, so it gets exactly one more attempt.

### 1.7 `GET /api/engine-settings/api-keys` — list keys
```bash
curl -s -b cookies.txt $BASE/api/engine-settings/api-keys
```
Expected: array of `id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at` — never the hash, never the key.

### 1.8 `POST /api/engine-settings/api-keys` — create a key (shown once)
| Field | Type | Rules |
|---|---|---|
| `name` | string | required, ≤ 100 |
```bash
curl -s -b cookies.txt -X POST -H 'Content-Type: application/json' -d '{"name":"Engine dev"}' $BASE/api/engine-settings/api-keys
```
Expected: `201 { "id": 1, "name": "Engine dev", "key_prefix": "upg_live_abc", "key": "upg_live_<32 hex>", … }`. **Copy `key` now.** `KEY=upg_live_…`. Missing name → `400 Name required`.

### 1.9 `DELETE /api/engine-settings/api-keys/:id` — revoke
```bash
curl -s -b cookies.txt -X DELETE $BASE/api/engine-settings/api-keys/1
```
Expected: `200 { "success": true }`; the key is rejected from now on (2.1). Second call or foreign id → `404 Not found`.

---

## 2. Engine API — `/api/kunden/*` (**API key**, no session, 300 req/min per IP)

Authentication: `Authorization: Bearer $KEY` (or header `X-API-Key: $KEY`). Every error is `{ "fehler": { "code", "nachricht" } }`.

### 2.1 Authentication checks
```bash
curl -s -i $BASE/api/kunden/1                                   # no key
curl -s -i -H 'Authorization: Bearer upg_live_wrong' $BASE/api/kunden/1
curl -s -i -H "Authorization: Basic $KEY" $BASE/api/kunden/1    # wrong scheme
```
Expected for all three: `401`, header `WWW-Authenticate: Bearer`, body `{"fehler":{"code":"nicht_authentifiziert","nachricht":"API-Schlüssel fehlt oder ist ungültig."}}`. The message is identical for missing, unknown, revoked and expired keys on purpose.

### 2.2 `GET /api/kunden/:id` — client master data
| Param | Rules |
|---|---|
| `:id` | integer contact id in the key's workspace |
```bash
curl -s -H "Authorization: Bearer $KEY" $BASE/api/kunden/<contact id>
```
Expected `200`:
```json
{ "kunde_id": 60, "firma": "Muster GmbH", "ansprechpartner": "Erika Muster", "email": "…", "telefon": "…", "kontakt_typ": "contact",
  "adresse": { "strasse": null, "plz": null, "ort": null },
  "rechtsform": null, "ust_id": null, "handelsregisternummer": null, "webseite": null, "quelle": null,
  "onboarding_status": "kein_onboarding", "drive_ordner_id": null, "akte_version": 0,
  "erstellt_am": "…", "aktualisiert_am": "…" }
```
Always these 17 keys; empty columns are `null`. `/api/kunden/abc` → `400 ungueltige_id`; a contact from another workspace or a nonexistent id → `404 nicht_gefunden` (indistinguishable by design).

### 2.3 `PATCH /api/kunden/:id/status` — set onboarding status (idempotent)
Headers: `Authorization`, `Content-Type: application/json`, **`Idempotency-Key: <unique per logical request, ≤ 255 chars>`**.
| Field | Type | Rules |
|---|---|---|
| `onboarding_status` | string | required; one of `kein_onboarding, formular_versendet, formular_ausgefuellt, termin_gebucht, call_erfolgt, briefing_fertig, onboarding_abgeschlossen` |
| `drive_ordner_id` | string \| null | optional; ≤ 255; only written when the key is present; `null` clears it |

```bash
IDK=$(uuidgen)
curl -s -i -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -H "Idempotency-Key: $IDK" \
  -X PATCH -d '{"onboarding_status":"termin_gebucht","drive_ordner_id":"1AbCdEf"}' \
  $BASE/api/kunden/<contact id>/status
```
Expected: `200` with the same 17-key view, `onboarding_status` and `drive_ordner_id` updated. Then verify in the CRM: the contact's badge reads **Termin gebucht**, and the CRM did **not** send a webhook for this change (check 1.5 — no new delivery), which is the loop guard.

Idempotency checks (same `$IDK`):
```bash
# identical retry -> 200, same body, header Idempotent-Replayed: true, no second UPDATE
curl -s -i -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -H "Idempotency-Key: $IDK" -X PATCH -d '{"onboarding_status":"termin_gebucht","drive_ordner_id":"1AbCdEf"}' $BASE/api/kunden/<id>/status | grep -iE "^HTTP|idempotent"
# same key, different body -> 422 idempotency_key_konflikt
curl -s -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -H "Idempotency-Key: $IDK" -X PATCH -d '{"onboarding_status":"call_erfolgt"}' $BASE/api/kunden/<id>/status
# no key header -> 400 idempotency_key_fehlt
curl -s -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -X PATCH -d '{"onboarding_status":"call_erfolgt"}' $BASE/api/kunden/<id>/status
# unknown status -> 422 ungueltiger_status (message lists the seven)
curl -s -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" -X PATCH -d '{"onboarding_status":"bogus"}' $BASE/api/kunden/<id>/status
# drive_ordner_id too long -> 422 ungueltige_daten
curl -s -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" -X PATCH -d "{\"onboarding_status\":\"call_erfolgt\",\"drive_ordner_id\":\"$(printf 'x%.0s' {1..300})\"}" $BASE/api/kunden/<id>/status
```
Stored replays keep their status code: a 404 or 422 obtained with a key is replayed with the same key.

### 2.4 Rate limit
```bash
for i in $(seq 1 305); do curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY" $BASE/api/kunden/<id>; done | sort | uniq -c
```
Expected: ~300 × `200`, the rest `429` with `{"fehler":{"code":"zu_viele_anfragen",…}}` and `RateLimit-*` headers. Window: 60 s per IP.

---

## 3. Manual trigger — `POST /api/contacts/:id/onboarding/start` (session, any member)

| Param | Rules |
|---|---|
| `:id` | integer contact id in your workspace |
No body.
```bash
curl -s -b cookies.txt -X POST $BASE/api/contacts/<contact id>/onboarding/start
```
Expected: `201 { "success": true, "onboarding_status": "formular_versendet", "event_id": "evt_…", "deliveries": 1 }` (`deliveries: 0` when no active webhook subscribes to `vertrag.unterschrieben` or `*` — the status still changes).
Then check:
- your receiver got a POST with headers `X-Upgrads-Event: vertrag.unterschrieben`, `X-Upgrads-Event-Id`, `X-Upgrads-Delivery`, `X-Upgrads-Timestamp`, `X-Upgrads-Signature: sha256=…`, and body
  ```json
  { "event_id": "evt_…", "event": "vertrag.unterschrieben", "workspace_id": 1, "kunde_id": 60,
    "daten": { "vertrag_id": "manuell_60_1726…", "quelle": "manuell", "ausgeloest_von": 1, "onboarding_status": "formular_versendet", "kunde": { "name": "…", "email": "…", "firma": "…" } },
    "zeitpunkt": "…" }
  ```
- 1.5 shows the delivery as `delivered`;
- the contact's badge in the CRM reads **Formular versendet**.
Negative: `/api/contacts/abc/onboarding/start` → `400 Invalid id`; another workspace's id → `404 Not found`.
Calling it again on the same contact is allowed and resets the status to `formular_versendet` (the UI confirms first).

---

## 4. Verifying the webhook signature on the receiver

The signature is HMAC-SHA256 of the **exact raw body bytes**, hex, prefixed `sha256=`. With the body saved to `body.json` (byte-for-byte, e.g. from webhook.site "raw"):
```bash
printf 'sha256=%s\n' "$(openssl dgst -sha256 -hmac "$SECRET" -binary body.json | xxd -p -c 256)"
```
Must equal the `X-Upgrads-Signature` header. In Node on the engine side:
```js
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.get('X-Upgrads-Signature')));
```
Dedupe on `event_id`: after a receiver timeout the CRM retries, so the same event can arrive twice.

---

## 5. Retry behaviour (worker)

1. Stop the receiver, trigger 1.4 or 3 → delivery `failed`, `attempts: 1`, `error` names the connection failure.
2. The worker polls every 30 s and retries when `next_attempt_at` is due: 1 min, then 5, 30, 120, 360, 720 min after each failure — 7 attempts over ≈ 21 h, then `dead`.
3. Start the receiver again within the first minute → the next tick delivers it (`delivered`, `delivered_at` set). Or don't wait: 1.6 retries it immediately.
4. Watch the server log: `engine webhooks: {"claimed":1,"delivered":1,"failed":0,"dead":0}` per tick that did work.

---

## 6. Database checks (read-only, optional)

```sql
SELECT id, name, key_prefix, revoked_at, last_used_at FROM api_keys ORDER BY id;          -- key_hash is a sha256, never the key
SELECT id, url, events, active, RIGHT(secret, 4) AS hint FROM engine_webhook;
SELECT id, event, status, attempts, next_attempt_at, response_status, error FROM engine_webhook_deliveries ORDER BY id DESC LIMIT 20;
SELECT key, request_hash, response_status, expires_at FROM idempotency_keys ORDER BY created_at DESC LIMIT 20;
SELECT id, name, onboarding_status, drive_ordner_id, akte_version FROM contacts WHERE onboarding_status <> 'kein_onboarding';
```

---

## 7. Automated equivalent

Everything above is also covered by the test suite without a server or database: `npm test` (175 checks; the engine files are `tests/unit/engine-*.test.js`, `tests/unit/idempotency.test.js`, `tests/routes/engine-*.test.js`, `tests/routes/contacts-onboarding.test.js`, `tests/unit/ui-onboarding.test.js`). The Stage 1 migration can additionally be run against a throwaway database: `createdb crm_stage1 && TEST_DATABASE_URL=postgres://localhost/crm_stage1 npm test && dropdb crm_stage1`.

## Endpoint index

| # | Method | Path | Auth | Body / params |
|---|---|---|---|---|
| 1.1 | GET | `/api/engine-settings/webhook` | session, owner | — |
| 1.2 | PUT | `/api/engine-settings/webhook` | session, owner | `url, events[], description?, active?` |
| 1.3 | POST | `/api/engine-settings/webhook/rotate-secret` | session, owner | — |
| 1.4 | POST | `/api/engine-settings/webhook/test` | session, owner | — |
| 1.5 | GET | `/api/engine-settings/webhook/deliveries` | session, owner | `?limit=1..200` |
| 1.6 | POST | `/api/engine-settings/webhook/deliveries/:id/retry` | session, owner | `:id` |
| 1.7 | GET | `/api/engine-settings/api-keys` | session, owner | — |
| 1.8 | POST | `/api/engine-settings/api-keys` | session, owner | `name` |
| 1.9 | DELETE | `/api/engine-settings/api-keys/:id` | session, owner | `:id` |
| 2.2 | GET | `/api/kunden/:id` | API key | `:id` |
| 2.3 | PATCH | `/api/kunden/:id/status` | API key + `Idempotency-Key` | `onboarding_status, drive_ordner_id?` |
| 3 | POST | `/api/contacts/:id/onboarding/start` | session | `:id` |
