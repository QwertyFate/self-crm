# Onboarding Engine — Postman examples and what each endpoint is for

Import `postman/UPGRADS_Onboarding_Engine.postman_collection.json` (Postman → Import → File). It contains every endpoint below as a ready request with headers, body, a test script that checks the response, and scripts that **carry values forward** (the webhook secret, the API key, an idempotency key, a delivery id) so you can run the folders top to bottom without copying anything by hand.

## 1. Before you start

Set the collection variables (click the collection → Variables):

| Variable | Set to |
|---|---|
| `base_url` | `http://localhost:3000` (or your host) |
| `owner_email`, `owner_password` | a workspace **owner** — the settings routes are owner-only |
| `contact_id` | the id of any contact in that workspace (open it in the CRM; the id is in `GET /api/contacts`) |
| `webhook_url` | where the CRM should send events — for a first test, a fresh URL from https://webhook.site so you can see the incoming requests |

Leave `api_key`, `webhook_secret`, `idempotency_key`, `delivery_id`, `key_id` empty; the scripts fill them.

**Run order:** folder 0 → 1 (skip the DELETE) → 2 → 3 → 4 → then the DELETE in folder 1. Or use *Run collection* and untick the DELETE.

## 2. The two directions, and which credential each uses

```
CRM ──(webhook, signed with the SECRET)──▶ Engine      "vertrag.unterschrieben": start the pipeline
CRM ◀──(REST, authenticated with the API KEY)── Engine   read master data, report progress
```

- The **secret** (from `PUT /webhook`) is used by the CRM to sign what it sends; the engine uses it to verify.
- The **API key** (from `POST /api-keys`) is used by the engine to call the CRM.
Each is shown exactly once. The collection stores them in variables; in production, paste them into the engine's configuration.

---

## 3. Folder 0 — login

### `POST /api/auth/login`
**Use in the engine:** none — it is how you, the operator, get a session for the owner-only settings routes. Postman keeps the cookie.

```
POST {{base_url}}/api/auth/login
Content-Type: application/json

{ "email": "{{owner_email}}", "password": "{{owner_password}}" }
```
Expected `200`, `user.role` = `"owner"`.

---

## 4. Folder 1 — settings (owner, session cookie)

### `GET /api/engine-settings/webhook`
**Use in the engine:** tells you whether the CRM knows where to send events, and which events exist.
```
GET {{base_url}}/api/engine-settings/webhook
```
First time: `{ "webhook": null, "available_events": ["vertrag.unterschrieben","test.ereignis"] }`. After setup: the webhook with `secret_hint` (last 4 chars) — never the secret.

### `PUT /api/engine-settings/webhook`  — create/update, **secret shown once**
**Use in the engine:** registers the engine's inbound URL. From now on the CRM POSTs signed events there.
```
PUT {{base_url}}/api/engine-settings/webhook
Content-Type: application/json

{ "url": "{{webhook_url}}", "events": ["*"], "description": "Onboarding Engine (dev)", "active": true }
```
| Field | Meaning |
|---|---|
| `url` | the engine endpoint; http(s), ≤ 2048 |
| `events` | `["*"]` = everything, or a list from `available_events`; `[]` also means everything |
| `description` | free text |
| `active` | switch deliveries on/off without deleting the config |

First call → `201` and `"secret": "<64 hex>"` (script saves it to `webhook_secret`). Later calls → `200`, update in place, no secret.

### `POST /api/engine-settings/webhook/rotate-secret`
**Use in the engine:** credential rotation. New secret shown once; the old one stops validating immediately — update the engine right after.
```
POST {{base_url}}/api/engine-settings/webhook/rotate-secret
```

### `POST /api/engine-settings/webhook/test`
**Use in the engine:** connectivity check before real events. Sends `test.ereignis` **synchronously** and reports the result.
```
POST {{base_url}}/api/engine-settings/webhook/test
```
`200 { "event_id": "evt_…", "deliveries": [ { "id": 3, "status": "delivered", "response_status": 200, "error": null } ] }`. On webhook.site you will see the request with these headers:
```
X-Upgrads-Event: test.ereignis
X-Upgrads-Event-Id: evt_…
X-Upgrads-Delivery: 3
X-Upgrads-Timestamp: 1758…
X-Upgrads-Signature: sha256=<hmac of the raw body with {{webhook_secret}}>
```
`400` if the webhook is inactive or not subscribed to `test.ereignis`/`*`.

### `GET /api/engine-settings/webhook/deliveries?limit=20`
**Use in the engine:** the ops log — did the engine receive each event? `status` is `pending` → `delivered`, or `failed` (will be retried: 1 m, 5 m, 30 m, 2 h, 6 h, 12 h) → `dead` after 7 attempts.
```
GET {{base_url}}/api/engine-settings/webhook/deliveries?limit=20
```
The script saves the first `failed`/`dead` id into `delivery_id` for the retry request.

### `POST /api/engine-settings/webhook/deliveries/{{delivery_id}}/retry`
**Use in the engine:** operator recovery after the engine was down — resend now instead of waiting for the backoff. A `dead` row gets one more attempt.
```
POST {{base_url}}/api/engine-settings/webhook/deliveries/{{delivery_id}}/retry
```
`200 { "id", "status", "response_status", "error" }`; `404` if the delivery is already delivered. To get a failed one: put an unreachable `webhook_url`, send the test event, then fix the URL and retry.

### `POST /api/engine-settings/api-keys`  — **key shown once**
**Use in the engine:** mints the credential the engine uses to call the CRM (folder 2).
```
POST {{base_url}}/api/engine-settings/api-keys
Content-Type: application/json

{ "name": "Onboarding Engine (dev)" }
```
`201 { "id": 1, "name": …, "key_prefix": "upg_live_ab", "key": "upg_live_<32 hex>", … }`. The script saves `key` into `api_key` and `id` into `key_id`. The CRM stores only a SHA-256 hash.

### `GET /api/engine-settings/api-keys`
**Use in the engine:** inventory — which keys exist, when each was last used by the engine, which are revoked. Never returns key material.
```
GET {{base_url}}/api/engine-settings/api-keys
```

### `DELETE /api/engine-settings/api-keys/{{key_id}}`  — run last
**Use in the engine:** revoke a leaked or retired key. The next engine call with it gets `401`.
```
DELETE {{base_url}}/api/engine-settings/api-keys/{{key_id}}
```
`200 { "success": true }`; again or a foreign id → `404`.

---

## 5. Folder 2 — the engine API (what the **engine** calls; Bearer `{{api_key}}`)

The folder has `Authorization: Bearer {{api_key}}` set at folder level. Errors are always `{ "fehler": { "code", "nachricht" } }`. Rate limit: 300 requests/minute per IP.

### `GET /api/kunden/{{contact_id}}`
**Use in the engine:** after `vertrag.unterschrieben` arrives with a `kunde_id`, the engine fetches the client's master data to pre-fill the onboarding form, create the Google Drive folder and the Akte.
```
GET {{base_url}}/api/kunden/{{contact_id}}
Authorization: Bearer {{api_key}}
```
```json
{ "kunde_id": 60, "firma": "Muster GmbH", "ansprechpartner": "Erika Muster", "email": "erika@muster.de", "telefon": "+49 30 1", "kontakt_typ": "contact",
  "adresse": { "strasse": "Musterstr. 1", "plz": "01067", "ort": "Dresden" },
  "rechtsform": "GmbH", "ust_id": "DE123456789", "handelsregisternummer": "HRB 1", "webseite": null, "quelle": "Empfehlung",
  "onboarding_status": "formular_versendet", "drive_ordner_id": null, "akte_version": 0,
  "erstellt_am": "2026-09-01T08:00:00.000Z", "aktualisiert_am": "2026-09-18T09:12:00.000Z" }
```
Always these 17 keys; missing data is `null`. `404 nicht_gefunden` for another workspace's contact.

### `PATCH /api/kunden/{{contact_id}}/status`  — idempotent
**Use in the engine:** the engine's progress report. At each pipeline step it sets the next status, and optionally the Drive folder it created:

| Engine step | `onboarding_status` to send |
|---|---|
| client submitted the form | `formular_ausgefuellt` |
| appointment scheduled | `termin_gebucht` |
| recording is available | `call_erfolgt` |
| briefing.md created, open questions sent | `briefing_fertig` |
| all open questions resolved | `onboarding_abgeschlossen` |

```
PATCH {{base_url}}/api/kunden/{{contact_id}}/status
Authorization: Bearer {{api_key}}
Content-Type: application/json
Idempotency-Key: {{idempotency_key}}        ← a fresh GUID per logical request (pre-request script)

{ "onboarding_status": "formular_ausgefuellt", "drive_ordner_id": "1AbCdEfGhIjKlMnOpQrStUvWxYz" }
```
`200` with the same 17-key view, updated. `drive_ordner_id`: omit to leave unchanged, send `null` to clear. The CRM badge changes immediately; **no webhook is sent back** for this (loop guard).

**Why the Idempotency-Key matters:** if the engine's request times out and it retries, the second request must not apply twice. The collection's next request sends the *same* key and body → `200`, same body, header `Idempotent-Replayed: true`, no second write. Same key with a *different* body → `422 idempotency_key_konflikt` (folder 4).

---

## 6. Folder 3 — the manual trigger (what the **CRM user** does; session)

### `POST /api/contacts/{{contact_id}}/onboarding/start`
**Use in the engine:** **this is the start signal.** A CRM user marks the contract as signed (the "Onboarding starten" button on the contact). The CRM sets the contact to `formular_versendet` and emits `vertrag.unterschrieben` to the webhook. The engine's pipeline begins here: fetch master data (folder 2 GET), send the form, then report each step (folder 2 PATCH).
```
POST {{base_url}}/api/contacts/{{contact_id}}/onboarding/start
```
`201 { "success": true, "onboarding_status": "formular_versendet", "event_id": "evt_…", "deliveries": 1 }`.
What the engine receives at `webhook_url`:
```json
{ "event_id": "evt_…", "event": "vertrag.unterschrieben", "workspace_id": 1, "kunde_id": 60,
  "daten": { "vertrag_id": "manuell_60_1758186720000", "quelle": "manuell", "ausgeloest_von": 1,
             "onboarding_status": "formular_versendet",
             "kunde": { "name": "Erika Muster", "email": "erika@muster.de", "firma": "Muster GmbH" } },
  "zeitpunkt": "2026-09-18T09:12:00.000Z" }
```
`vertrag_id` is a fallback id (`manuell_<kunde_id>_<unix ms>`) because there is no e-signature system yet; `quelle: "manuell"` says so. The engine should dedupe on `event_id` (a retry after a timeout can deliver twice). `deliveries: 0` means no active webhook subscribes — the status still changes.

---

## 7. Folder 4 — error shapes you should expect

| Request | Response |
|---|---|
| `GET /api/kunden/:id` with no key, a wrong key, a revoked key, or `Authorization: Basic …` | `401 { fehler: { code: "nicht_authentifiziert" } }` + `WWW-Authenticate: Bearer` — identical for all, nothing enumerable |
| `PATCH …/status` without `Idempotency-Key` | `400 idempotency_key_fehlt` |
| `PATCH …/status` with `"bogus"` | `422 ungueltiger_status`, message lists the seven allowed values |
| `PATCH …/status` reusing a key with a different body | `422 idempotency_key_konflikt` |
| `GET /api/kunden/abc` | `400 ungueltige_id` |
| `PUT /webhook` with `ftp://…` | `400 { error: "url must be an http(s) URL" }` (settings routes use the CRM's `{ error }` shape) |
| any settings route as a non-owner | `403 { error: "Owner only" }` |
| > 300 engine calls in a minute from one IP | `429 { fehler: { code: "zu_viele_anfragen" } }` |

---

## 8. Verifying the signature on the engine side

In Postman you can check a delivery's signature with a small script on a request to your receiver, or on the engine:
```js
const crypto = require('crypto');
const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBodyBytes).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.get('X-Upgrads-Signature')))) return res.status(401).end();
```
It must be computed over the **raw body bytes** exactly as received, not over re-serialised JSON.

## 9. Endpoint index

| Folder | Method | Path | Who calls it | Role in the engine flow |
|---|---|---|---|---|
| 1 | GET | `/api/engine-settings/webhook` | operator | see current webhook config |
| 1 | PUT | `/api/engine-settings/webhook` | operator | register the engine's inbound URL; get the signing secret (once) |
| 1 | POST | `/api/engine-settings/webhook/rotate-secret` | operator | rotate the signing secret |
| 1 | POST | `/api/engine-settings/webhook/test` | operator | connectivity check (`test.ereignis`) |
| 1 | GET | `/api/engine-settings/webhook/deliveries` | operator | delivery log / audit |
| 1 | POST | `/api/engine-settings/webhook/deliveries/:id/retry` | operator | resend a failed/dead delivery now |
| 1 | POST | `/api/engine-settings/api-keys` | operator | mint the engine's API key (once) |
| 1 | GET | `/api/engine-settings/api-keys` | operator | key inventory |
| 1 | DELETE | `/api/engine-settings/api-keys/:id` | operator | revoke a key |
| 2 | GET | `/api/kunden/:id` | **engine** | fetch client master data after the start signal |
| 2 | PATCH | `/api/kunden/:id/status` | **engine** | report each pipeline step back (idempotent) |
| 3 | POST | `/api/contacts/:id/onboarding/start` | CRM user | the start signal → `vertrag.unterschrieben` webhook |
