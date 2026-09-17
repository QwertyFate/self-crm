# CRM — Code Audit & Remediation Plans

**Date:** 2026-09-16
**Scope:** whole tree, read-only audit
**Method:** static read across `routes/`, `server.js`, `db.js`, `utils/`, `public/js/`, plus fake-pool / jsdom probes of the live route code (no database, app never started)
**Severity:** Critical = data loss / exfiltration / auth bypass · High = cross-tenant leak · Medium = same class, narrower surface · Low = correctness/cosmetic
**Status:** *open* unless marked. Items fixed earlier this session (Parts 1–19) are logged in `ADMIN_SECURITY_FIX.md` and not repeated here except where a sibling remains.

This document is the forward-looking plan. `ADMIN_SECURITY_FIX.md` remains the append-only record of what has already shipped.

---

## Severity table

| ID | Area | Severity | Finding | Status |
|---|---|---|---|---|
| C1 | analytics | **Critical** | Authenticated SQL injection via `value_field` interpolated into SQL | open |
| C2 | deals | **High** | Cross-workspace leak: unscoped joins + unvalidated body ids (Part 16 class) | open |
| C3a | auth | **Critical** | `forgot-password` returns the reset token in the response body (S-01) | open |
| C3b | activities UI | **Critical** | Stored XSS: note content rendered raw (S-02) | open |
| C3c | repo | **High** | `crm.db` and `newfile.env` tracked in git (S-03) | open |
| M1 | tasks | Medium | Unscoped joins; `assigned_to`/`parent_id`/… unvalidated; subtask query unscoped; status unvalidated | open |
| M2 | objects | Medium | `/:id/contacts` links a body `contact_id` with no ownership check; unscoped joins | open |
| M3 | activities / activity-comments / calendar | Medium | Unscoped `contacts`/`users` joins | open |
| L1 | contacts import | Low | Row whose UPDATE matches nothing counted in neither `imported` nor `skipped` | open |
| L2 | workspace | Low | Member removal nulls `contacts.assigned_to` but not `deals`/`tasks` | open |

Verified **not** bugs: the `${filter}` / `${cursor}` / `${placeholders}` builders (placeholder numbers only, never user data); reset-token entropy, single-use and 1h expiry; bcrypt usage; the analytics `PERIODS` whitelist for `trunc`/`interval`/`step`.

---

## C1 — Authenticated SQL injection in analytics **(Critical)**

**Location:** `routes/analytics.js:165` and `:195` (read), `:210` (write).

**What's wrong:** `value_field` is stored by any authenticated member via `PATCH /api/analytics/config` with no validation:
```js
const { won_stage_ids = [], lost_stage_ids = [], value_field = null } = req.body;
await pool.query(`UPDATE workspaces SET analytics_config = analytics_config || $1::jsonb WHERE id=$2`, [JSON.stringify({ …, value_field }), req.workspaceId]);
```
then interpolated raw into SQL on read:
```js
if (valueField) valExpr = `(custom_data->>'${valueField}')::numeric`;
```
This is the only user-controlled value in the codebase that reaches SQL unparameterized. (`p.trunc/interval/step` on the same lines come from the server-side `PERIODS` whitelist and are safe.)

**Impact:** The read queries pass a parameter array, so they are single-statement — no `DROP`. But a payload like `x')::numeric,(SELECT …) …` enables **error-based extraction**: coercing a `SELECT password_hash FROM users` subquery to `numeric` raises an error whose text contains the value. A member of any workspace can read arbitrary tables, including other workspaces' users and password hashes. Cross-tenant, authenticated, high-value.

**Remediation plan:** validate on write and whitelist on read.
- Write (`:210`): reject a `value_field` that is not `'value'` and not a `field_key` in this workspace's `deal_fields`. `SELECT 1 FROM deal_fields WHERE workspace_id=$1 AND field_key=$2`.
- Read (`:163-165`): keep `valExpr = 'value'` for the builtin; for a custom field, resolve it against the same `deal_fields` set and, only if present, build the expression from the **validated** key (still safer to also pass it as a parameter where the JSON path allows). Never interpolate the raw request value.

**Verification:** fake-pool harness — an authed member `PATCH`es `value_field: "x')::numeric,(SELECT 1)--"` → 400; a real `field_key` → stored and the read renders; assert no query string contains the quote payload. Baseline against current code shows the payload reaching the query.

**Constraints:** `db.js` untouched; no schema change needed (`deal_fields` already exists).

---

## C2 — Deals cross-workspace leak **(High)**

**Location:** `routes/deals.js:30-33` and `:50-53` (joins), `:72` (INSERT), `:90` (UPDATE).

**What's wrong:** the list/detail queries join on raw ids with no workspace scoping:
```sql
LEFT JOIN contacts c ON c.id = d.contact_id
LEFT JOIN contacts s ON s.id = d.supplier_id
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
LEFT JOIN users u ON u.id = d.assigned_to
```
and `POST`/`PUT` write `contact_id`, `supplier_id`, `pipeline_id`, `stage_id`, `assigned_to` straight from the body. Foreign keys are global, so a foreign id is accepted and then rendered back — and deals expose `contact_email` and `contact_phone`, so the leak is richer than contacts was.

**Impact:** exactly the class Part 16 closed for contacts. A member writes a guessed `contact_id`/`assigned_to` and reads another workspace's contact email, phone, or user name from their own deal list. Id oracle.

**Remediation plan:** the Part 16 pattern, reused.
- Scope every join: `… AND c.workspace_id = d.workspace_id`, same for `s`, `ps` (via its pipeline/workspace), `u`.
- On write, validate each supplied id against the workspace before insert/update — a `workspaceRefs`-style prefetch (contacts, pipeline_stages, members) or per-id `SELECT 1 … WHERE id=$1 AND workspace_id=$2`, rejecting with 400.

**Verification:** a harness mirroring `contacts-refs-test.js` — foreign `contact_id`/`stage_id`/`assigned_to` → 400, zero writes; own ids → 201; joins emit the scoped form. Baseline against current `deals.js` shows the foreign row written and rendered.

**Constraints:** `db.js` untouched.

---

## C3a — Reset token returned in the response (S-01) **(Critical)**

**Location:** `routes/auth.js:360`.

**What's wrong:** when SMTP is unconfigured, `forgot-password` returns the reset URL in the body:
```js
res.json({ success: true, resetUrl, message: 'Email not configured. Copy the link below.' });
```

**Impact:** unauthenticated account takeover — anyone who knows an email gets that account's reset link directly. Also a user-enumeration oracle (known email returns a token, unknown returns a generic message).

**Remediation plan:** never let the token cross the response boundary. Dev: log the URL server-side. Prod (`NODE_ENV==='production'`): 503 "reset temporarily unavailable". Return the **same** `{ success: true, message: 'If that email exists, a reset link has been sent.' }` on both the known and unknown branches so the oracle closes too. Optional same-patch hardening: hash the token at rest; destroy the user's other sessions on successful reset.

**Verification:** unit/HTTP harness — response body never contains `resetUrl`/token; known and unknown emails return byte-identical bodies.

**Constraints:** none; one route.

---

## C3b — Stored XSS in notes (S-02) **(Critical)**

**Location:** render `public/js/modals.js:373, 419, 823, 937` (`${activity.content}` / `${a.content}` into `innerHTML`); store `routes/activities.js`, `routes/activity-comments.js` (no sanitization). Production CSP allows `'unsafe-inline'` (`server.js:49`).

**What's wrong:** note content is a `contenteditable` posted as raw HTML, stored verbatim, re-rendered via `innerHTML`. `<script>` won't run via innerHTML, but `onerror=`/`onclick=` payloads do, and CSP permits inline script.

**Impact:** a member plants a note; any colleague (including an owner) who opens the record runs the attacker's script same-origin in an authenticated session — read all data, mint invites, rewrite webhook config.

**Remediation plan:** sanitize server-side on write (the boundary that also repairs existing rows on next edit) with `isomorphic-dompurify` or `sanitize-html`, an allowlist of formatting tags/attrs, in `activities.js` POST/PUT and `activity-comments.js`. Then plan removal of `'unsafe-inline'` from `scriptSrc` as a follow-up (requires converting the inline `onclick`/`onkeydown` handlers in `modals.js` to `addEventListener` first).

**Verification:** POST a note with `<img src=x onerror=alert(1)>` → stored value has the handler stripped; a plain formatted note survives.

**Constraints:** adds a dependency; larger than the others. `db.js` untouched.

---

## C3c — Committed database / stray files (S-03) **(High)**

**Location:** `git ls-files` → `crm.db`, `newfile.env` tracked. `.gitignore` has `node_modules`, `.env`, `.DS_store` (lowercase typo — would not match `.DS_Store`), and `ADMIN_SECURITY_FIX.md`.

**What's wrong:** `crm.db` is a committed SQLite artifact that (per the original audit) held real emails and bcrypt hashes; `newfile.env` is a tracked stray.

**Impact:** anyone with repo read access has that data and those hashes offline.

**Remediation plan:** `.gitignore` gets `crm.db`, `crm.db-*`, `*.env` (keep `!.env.example`), and the `.DS_store` → `.DS_Store` fix. Then `git rm --cached crm.db newfile.env`, and a history purge (`git filter-repo`) since the data is already in history. **Git operations are the user's** — this section documents the commands; it does not run them. Rotate any credentials/accounts exposed in the committed db.

**Verification:** `git ls-files` shows neither file; `.gitignore` matches both.

**Constraints:** history rewrite must be coordinated with anyone holding a clone.

---

## M1 — tasks.js **(Medium)**

**Location:** joins `routes/tasks.js:25-28, 42-44, 52`; INSERT `:76`; subtask query `:49-54`; status `:126`.

**What's wrong:** joins on `users`/`deals`/`contacts` unscoped (C2 class); `assigned_to`, `parent_id`, `project_id`, `list_id` written from the body without workspace validation (the route *does* validate `deal_id`/`contact_id` at `:67-74`, so this is asymmetric); the subtask query `WHERE t.parent_id=$1` has **no workspace filter** (original audit Q-01), so a parented-across-workspaces task renders foreign rows; `PATCH /:id/status` writes `req.body.status` with no whitelist.

**Remediation plan:** scope every join to the task's workspace; extend the existing `deal_id`/`contact_id` ownership check to `assigned_to` (member of workspace), `parent_id`/`project_id`/`list_id` (belong to workspace); add `AND t.workspace_id=$2` to the subtask query; validate `status` against the workspace's `task_statuses` JSON (`workspace.js:223`, default set in `db.js:215`).

**Verification:** refs-style harness — foreign `assigned_to`/`parent_id` → 400; subtask query emits the scoped form; unknown status → 400.

**Constraints:** `db.js` untouched.

---

## M2 — objects.js **(Medium)**

**Location:** `routes/objects.js:132` (`POST /:id/contacts`), joins `:33-35, 42, 118`.

**What's wrong:** linking a deal to an object (`/:id/objects:92`) checks the deal belongs to the workspace, but linking a **contact** (`/:id/contacts:132`) inserts `object_contacts` with a body `contact_id` and no check — asymmetric. Joins unscoped.

**Remediation plan:** add the ownership check (`SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2`) before the insert, mirroring the deal path; scope the joins.

**Verification:** foreign `contact_id` → 404/400, no insert; own contact → 201.

**Constraints:** `db.js` untouched.

---

## M3 — activities / activity-comments / calendar **(Medium)**

**Location:** `activities.js:40,86-87,121`; `activity-comments.js:30,75,121`; `calendar.js:19,44`.

**What's wrong:** `contacts`/`users` joins on raw ids without workspace scoping — the read half of the C2 class. Lower value (author names, contact names) but the same leak.

**Remediation plan:** scope each join to the row's workspace (`AND u.workspace_id = a.workspace_id`, `AND c.workspace_id = a.workspace_id`).

**Verification:** each list query emits the scoped join form.

**Constraints:** `db.js` untouched.

---

## L1 — Import count residual **(Low)**

**Location:** `routes/contacts.js` batch update (`~214`) and legacy `rowCount===0` (`~276`).

**What's wrong:** a row whose `UPDATE` matches nothing because the contact was deleted between the prefetch and the write is counted in neither `imported` nor `skipped`, so `submitted === imported + skipped` does not hold. `imported === created + updated` still holds. Already flagged to the user.

**Remediation plan:** add an `unmatched` counter (`chunk.length - matched.length` in the batch path; the `rowCount===0 → continue` branch in the legacy path) and return it, or fold it into `skipped` with a reason field.

**Verification:** extend `contacts-counts-test.js` — a vanished row appears in `unmatched`; `imported + skipped + unmatched === submitted`.

**Constraints:** additive response field; `db.js` untouched.

---

## L2 — Dangling assignees on member removal **(Low)**

**Location:** `routes/workspace.js:138`.

**What's wrong:** removing a member nulls `contacts.assigned_to` but not `deals.assigned_to` or `tasks.assigned_to`, leaving ids that point at a removed user.

**Remediation plan:** add `UPDATE deals SET assigned_to=NULL …` and `UPDATE tasks SET assigned_to=NULL …` to the removal transaction, scoped to the workspace.

**Verification:** after removal, no `deals`/`tasks` row in the workspace references the removed id.

**Constraints:** within the existing transaction; `db.js` untouched.

---

## Suggested order

1. **C1** — highest impact, smallest change.
2. **C3a** — one line, unauthenticated severity.
3. **C2** — reuse the Part 16 pattern.
4. **M1 / M2 / M3** — one batch, same pattern.
5. **C3b** — needs a dependency and a CSP follow-up.
6. **C3c** — user's git operations.
7. **L1 / L2** — cleanup.

Each fix follows the established workflow: a fake-pool or jsdom harness with a **failing baseline first**, a change-log **Part N** appended to `ADMIN_SECURITY_FIX.md`, and `db.js` left untouched unless DDL is explicitly approved.
