# CRM — Remediation Plan v2 (reviewer's revision)

**Date:** 2026-09-16
**Basis:** the 2026-09-16 audit (`C1–C3c`, `M1–M3`, `L1–L2`)
**Purpose:** the *how*, revised — three corrections to the audit, one missed sink, one missed
destructive pair, structural options, an explicit ship order, and a verification matrix naming
which proof each fix needs.
**Status:** *nothing here has been applied.* `ADMIN_SECURITY_FIX.md` remains the append-only
record of what has shipped (Parts 1–19).

---

## 0. Corrections to the audit (read first)

| # | Audit claim | Reality |
|---|---|---|
| 0.1 | **L2** "member removal nulls `contacts.assigned_to` but not `deals`/`tasks`" | **False positive — close L2.** `deals.assigned_to` (`db.js:111`) and `tasks.assigned_to` (`:278`) are `REFERENCES users(id) ON DELETE SET NULL`, and removal deletes the `users` row (`workspace.js:139`), so the FK already nulls both. **The real residual is the reverse:** `password_resets` (`:128`), `user_workspaces` (`:371`), `chat_messages` (`:388`), `chat_reads` (`:395`) are `ON DELETE CASCADE` → removing a member silently **deletes chat history**. Replaced by SR-9. |
| 0.2 | **C3c** "`.DS_store` lowercase — would not match `.DS_Store`" | Cosmetic here: `git check-ignore -v .DS_Store public/.DS_Store` shows both matched by `.gitignore:3`. Fix the case anyway; it is not why DS_Store files slip in. |
| 0.3 | **C3c** lists `ADMIN_SECURITY_FIX.md` among `.gitignore` contents | Misleading: the file is **tracked**, and ignore rules do not apply to tracked paths. `git rm --cached` it or drop the line. |
| 0.4 | **C1** names three sites | There is a **fourth**: `analytics.js:81` (`pipelineValExpr`, by-pipeline endpoint). One resolver fixes all four, but it must be in scope. |
| 0.5 | **M2** covers `POST /:id/contacts` only | The `DELETE`s are worse and missing: `objects.js:104,143` run unscoped, and the `:id` object is never checked against the workspace — a **cross-tenant destructive write**. See SR-4. |
| 0.6 | **C3a** "Dev: log the URL server-side" | Do **not** ship that. With no mailer, the vulnerable branch is the only branch that can run, and logging a live reset URL puts a working credential into the log pipeline. Disable the flow instead (SR-2). |

---

## SR-1 — C1, analytics SQL injection — fix the shape, don't just validate

**Audit:** validate `value_field` on write against `deal_fields`; whitelist on read; build the
expression from the validated key.

**Better:** parameterise the JSON path so the class disappears:

```sql
-- the field key arrives as a bound parameter; user data never enters the SQL text
CASE WHEN jsonb_typeof(custom_data -> $2) = 'number'
     THEN (custom_data ->> $2)::numeric ELSE NULL END
```

- All four sites (`analytics.js:81`, `:165`, `:195`, `:210`) go through one resolver.
- The `jsonb_typeof` guard also fixes a bug the audit leaves in place: choosing a **text** deal
  field as the value field currently raises `22P02` and the analytics page 500s.
- Because it is parameterised, **already-stored hostile configs become inert** — no cleanup
  migration, and "validate on read" becomes optional hardening rather than the control.

Keep write-side validation for a clear 400 (resolve against `deal_fields WHERE workspace_id=$1`
and require a numeric-ish type).

**Verify:** fake-pool baseline shows the payload in the query text; after the fix no query text
contains it and the request is 400. Add: a text field → `200` with a null/0 value, not a 500.

---

## SR-2 — C3a, reset flow with no mailer — disable it, don't patch it

**Why this is #1:** the token reaches the client only on the `!result.sent` branch
(`utils/mailer.js:18-21` → `routes/auth.js:357-360`), which is precisely the no-`SMTP_HOST` case.
With no mailer, that is the *only* branch that runs, so any anonymous caller who knows an email
receives a live reset token. A working mailer would have prevented the leak entirely.

**Better solution for a deployment with no mailer — remove the flow:**

1. `/forgot-password` stops generating and returning anything. Same neutral body on every path:
   `{ success: true, message: 'If that email exists, a reset link has been sent.' }`. Log only a
   fingerprint (`sha256(token).slice(0,12)`) and the user id — never the URL.
2. Remove the `resetUrl` return and the `forgot-link-box` UI that displays it
   (`public/js/auth.js`, `public/index.html`), so there is nothing to leak and no enumeration
   oracle.
3. **Provide recovery out-of-band instead:** generate the reset link from the platform admin
   console (authenticated, audited, no email required) and hand it over directly. Strictly better
   than both the current behaviour and an SMTP dependency.
4. If `/forgot-password` must stay enabled for a future mailer, gate it: take the `resetUrl`
   branch only when `NODE_ENV !== 'production'` **and** the caller is local, and return 503 in
   production when no transport exists.

**Keep regardless — orthogonal, and needed whenever a reset does happen:**

```sql
-- one email can own several identity rows (14 users rows / 4 emails in the DB I can see)
UPDATE users SET password_hash=$1
 WHERE lower(email) = (SELECT lower(email) FROM users WHERE id=$2);

DELETE FROM password_resets
 WHERE user_id IN (SELECT id FROM users WHERE lower(email) = (SELECT lower(email) FROM users WHERE id=$2));

DELETE FROM session WHERE sess->>'userId' = ANY($3::text[]);   -- ids as text; no int cast on jsonb
```

Plus: store reset tokens **hashed** (`sha256`) and compare on lookup.

**Verify:** the body never contains `resetUrl` or a token for known **or** unknown emails; both
branches return byte-identical bodies; the reset link is reachable only via the admin console.

---

## SR-3 — C2, deals cross-workspace refs — one shared validator, not a fourth copy

**Audit:** "the Part 16 pattern, reused" — per-route scoped joins plus per-id ownership checks.

**Better:** Part 16's `workspaceRefs`/`refCheck` already exist inside `routes/contacts.js:15-34`.
Copying them into `deals.js`, `tasks.js`, `objects.js` and three more files is exactly how the
*next* route gets missed. Extract once:

```
utils/workspace-refs.js
  workspaceRefs(q, workspaceId)   // lazily builds only the sets the caller asks for
  refCheck(refs, { stage_id, assigned_to, contact_id, pipeline_id, … })
  class RefRejected extends Error { status = 400 }
  refsMiddleware(kinds)           // express factory; throws RefRejected -> 400
```

`contacts.js` imports it instead of owning it; every other route gets the same guarantees free.

**Two layers, cheapest first:**

- **Layer 1 — read scoping (no DDL, mechanical).** Add
  `AND <joined>.workspace_id = <row>.workspace_id` to every unscoped join:
  `deals.js:30-33,50-53`, `tasks.js:25-28,42-44,52`, `objects.js:33-35,42,118`,
  `activities.js`, `activity-comments.js`, `calendar.js`. This stops the **leak** even for rows
  already poisoned — `contacts.js` is the working model.
- **Layer 2 — write validation** via `refsMiddleware` on the POST/PUT of those routes.

**Structural option (Phase 2, DDL + data cleanup):** composite FKs make cross-workspace
references impossible rather than merely rejected in N places —
`CREATE UNIQUE INDEX ON contacts (workspace_id, id)`, then
`deals.contact_id -> contacts(workspace_id, id)`. End state, not this pass; `db.js` needs
explicit approval.

**Also missed by the audit:** validate `req.params.id` (the object) in `objects.js`.

---

## SR-4 — objects.js destructive deletes (new — not in the audit)

```js
objects.js:104  DELETE FROM deal_objects    WHERE deal_id=$1 AND object_id=$2   // no ownership check
objects.js:143  DELETE FROM object_contacts WHERE object_id=$1 AND contact_id=$2 // no ownership check
```

A member can detach **another workspace's** deal/contact links by guessing ids, and can attach
their own rows to a foreign object (the `:id` object is never checked either). A cross-tenant
*write*, so rate this **High**, not Medium.

**Fix:** resolve the object (`SELECT 1 FROM objects WHERE id=$1 AND workspace_id=$2`) and the
linked row's workspace before mutating; 404 on mismatch. Reuse `refsMiddleware` / the shared
helper rather than writing a third ad-hoc check.

**Verify:** a foreign object id in the path, or a foreign `contact_id`/`deal_id` in the body →
404 and the link row is untouched; own ids → 201/200.

---

## SR-5 — C3b, stored XSS — write-side sanitising does not repair existing payloads

**Audit:** sanitize server-side on write with a dependency, then (later) drop `'unsafe-inline'`
from `scriptSrc`.

**Three problems:**

1. "Also repairs existing rows on next edit" is not a repair. A payload planted today stays live
   until someone happens to re-save that note. **Sanitize on render too**, or run a one-off
   cleanup over existing `activities.content` / `activity_comments.content`.
2. It depends on a CSP that may not exist. The helmet block is gated on
   `NODE_ENV === 'production'` (`server.js:18-32`) and `NODE_ENV` appears nowhere in the repo or
   `.env`. Unset → **no CSP at all**, and the XSS has zero resistance. Set `NODE_ENV` on the host
   before treating CSP as a control (prerequisite P1).
3. Dependency choice: prefer **`sanitize-html`** (server-only, no DOM) over
   `isomorphic-dompurify` (pulls in jsdom — install weight and a Node-version constraint you do not
   need for a server-side strip).

**Better structural option:** the preview renderer already uses `white-space: pre-wrap`
(`public/js/modals.js:243`), so if notes need no bold/links, store and render **plain text** and
the class disappears without a dependency. Decide before adding one — converting later means
migrating stored HTML.

`esc()` (`public/js/core.js:194`) exists and is deliberately bypassed for note bodies; that
asymmetry is the bug.

**Verify:** POST a note containing `<img src=x onerror=alert(1)>` → the stored value has the
handler stripped and a plain formatted note survives; **and** re-render an existing payload
written before the fix (this is what the audit's plan would miss).

---

## SR-6 — M1/M2/M3 — one pass, two layers, two exceptions

Layer 1 (join scoping) across `tasks.js`, `objects.js`, `activities.js`, `activity-comments.js`,
`calendar.js` in a single mechanical pass; Layer 2 via `refsMiddleware`. Two route-specific items:

- **Subtask query** (`routes/tasks.js:49-54`): add `AND t.workspace_id = $2`, and the same
  predicate to the two count subqueries at `:22-23` as `AND s.workspace_id = t.workspace_id`.
- **Status:** `workspaces.task_statuses` is an array of **objects** `[{key,label,color}]`
  (`db.js:215`), so validity means "an element whose `key` equals the submitted status" — not a
  string-containment test. Reject unknown values on `PUT /:id` and `PATCH /:id/status`; add a
  `priority` allow-list at the same time.

Also apply `refCheck` to the `assigned_to` / `parent_id` / `project_id` / `list_id` fields that
`tasks.js` currently passes through unvalidated (`:76`) while validating `deal_id`/`contact_id`
(`:67-74`) — that asymmetry is the giveaway.

**Verify:** foreign `assigned_to` / `parent_id` / `stage_id` → 400 with zero writes; the subtask
query emits the scoped form (`EXPLAIN`); an unknown status → 400.

---

## SR-7 — C3c, committed data — rotate before you rewrite history

The audit's technical plan is right; the **ordering is wrong**. A history rewrite un-leaks
nothing (clones, forks, caches and GitHub's dangling objects keep the blobs reachable), so:

1. **Immediately:** treat `crm.db` as public. It holds a `users` table with **4 bcrypt hashes**,
   plus `password_resets`, `invite_codes`, `platform_invites` and `contacts` (verified with
   aggregate queries; no values printed). Force a password reset for those accounts, invalidate
   outstanding reset rows, rotate those invite codes. Same for anything in `newfile.env`.
2. `git rm --cached crm.db crm.db-shm crm.db-wal newfile.env`; drop the tracked
   `ADMIN_SECURITY_FIX.md` line from `.gitignore` (or untrack the file); correct the ignore set to
   `crm.db*`, `*.env` with `!.env.example`, and `.DS_Store`.
3. `git filter-repo` last, coordinated with every clone holder — recorded as hygiene, not as the
   mitigation.

**Verify:** `git ls-files` shows none of the four files; `git check-ignore -v` matches each of the
new patterns.

---

## SR-8 — L1, import counters — make the invariant explicit and loud

```
submitted === imported + skipped + unmatched
imported  === created + updated
```

Add an `unmatched` counter (`chunk.length - matched.length` in the batch path; the
`rowCount === 0 → continue` branch in the legacy path) and assert the identity in the harness.
Then **surface** it: a contact that vanished between prefetch and write is a concurrency signal,
not noise — one line in the import summary ("N rows matched no contact and were skipped") is worth
more than a silent counter.

---

## SR-9 — replaces L2 — member removal deletes chat history

Removal deletes the member's `users` row (`routes/workspace.js:139`). Per FK:

- `chat_messages.user_id` and `chat_reads.user_id` → `ON DELETE CASCADE`: **the member's messages
  and read state are deleted** from the workspace conversation.
- `password_resets.user_id` → `ON DELETE CASCADE`: fine (genuinely personal).
- `deals` / `tasks` / `contacts.assigned_to`, `activities.actor_id` → `SET NULL`: correct, nothing
  to do (this is why L2 is a false positive).

**Better:** conversation history belongs to the workspace, not the account → make
`chat_messages.user_id` nullable with `ON DELETE SET NULL` and render as "removed member" (or fall
back to the stored display name). Keep CASCADE only for genuinely personal rows.

If the DDL is not wanted now, the minimum is to **report** what removal will delete: today the
operator gets `{ success: true }` while a member's chat history disappears. Requires `db.js`
approval.

---

## Prerequisites

| # | Item | Needed by |
|---|---|---|
| P1 | `NODE_ENV=production` set on the host | C3b/SR-5 — CSP exists at all |
| P2 | `ADMIN_CONSOLE_PATH` + rotated `ADMIN_SECRET` (still 13 chars) in the host `.env` | console reachable; SR-2's out-of-band recovery |
| P3 | `db.js` pool `connectionTimeoutMillis` (still missing) | everything under load — the pool hangs instead of returning 503 |
| P4 | Decide sanitizer vs plain text for notes | SR-5 scope |

---

## Verification matrix — what proof each fix needs

| Fix | fake-pool | `EXPLAIN` (parses/plans, no writes) | real DB round trip |
|---|---|---|---|
| SR-1 analytics | ✅ baseline + after (no payload in query text) | — | recommended: one real PATCH + read on the test workspace |
| SR-2 reset | ✅ no token in body or logs; identical bodies both branches | — | ✅ known vs unknown email byte-identical |
| SR-3 deals | ⚠️ SQL text only | ✅ scoped joins + refs queries | ✅ foreign id → 400, **zero rows written** |
| SR-4 objects | ✅ 404 on foreign object | — | ✅ cross-tenant delete → 404, link intact |
| SR-5 XSS | jsdom render probe ✅ | — | ✅ POST payload → stored sanitized; re-render an **existing** payload |
| SR-6 tasks/objects/M3 | ⚠️ SQL text only | ✅ every changed statement | ✅ foreign refs → 400 |
| SR-9 removal | ✅ | — | ✅ throwaway member removed, chat rows survive |
| SR-8 counters | ✅ | — | ✅ include a row deleted mid-import |

**Rule for this plan:** a fake-pool harness may never be the *only* evidence for a change that
alters SQL. `EXPLAIN` with real parameter values costs nothing and catches the typo a fake pool
happily accepts.

---

## Ship order

| # | Work | Why here |
|---|---|---|
| 1 | **SR-2 (C3a)** | One file, *unauthenticated* takeover — and with no mailer it's a deletion, not a rewrite |
| 2 | **SR-1 (C1)** | Authenticated arbitrary-table read; four sinks, one resolver |
| 3 | **SR-3 (C2)** | Highest-impact cross-tenant leak left |
| 4 | **SR-4** | Cross-tenant destructive writes; tiny fix |
| 5 | **SR-5 (C3b)** | Needs P1 and P4 first |
| 6 | **SR-6 (M1/M2/M3)** | One mechanical pass, same pattern |
| 7 | **SR-7 (C3c)** | Your git operations; rotate first |
| 8 | **SR-8 / SR-9** | Cleanup plus the honest member-removal story |

---

## Tracked elsewhere (not security — don't lose them)

- `GET /api/contacts` and `GET /api/deals` still return unbounded result sets while the client
  paginates locally.
- `webhook_logs`: unbounded growth, no `(workspace_id, created_at)` index.
- No audit trail for admin / member / reset actions.
- Membership dual source of truth: `users.workspace_id` vs `user_workspaces` (5 drifting rows in
  the DB I can see), including `refCheck` reading the wrong source — Stage-0 convergence.
- `duplicates_in_file` promised in the Part 14 plan but absent from the import response.
- Chat's legacy ack shim in `server.js` has no removal date.

---

# Appendix A — Copy-paste prompts, one per fix

Each prompt is self-contained: paste it to Claude on its own, get a diff back, then move to the
next. They are written in plain language on purpose — if a prompt is hard to follow, that's a bug
in the prompt, not in you.

**How to use them:** one at a time, in the order below. Each one asks for a **failing baseline
first** (prove the problem before fixing it) and for the **diff at the end**. Keep `db.js` out of
every change unless the prompt says otherwise. And remember the rule from the verification
matrix: a fake-pool harness is *not* enough evidence for a change that alters SQL — ask for
`EXPLAIN` output on the new statements.

---

### Prompt — SR-2 (C3a) · turn off the reset-link leak · **do this first**

```
The password-reset flow is handing out account access. When SMTP isn't configured,
utils/mailer.js returns the reset URL (lines 18-21) and routes/auth.js sends it back in the
response body (lines 357-360). So anyone who knows an email address can request a reset and get a
working link. We have no working mailer, which means that's the only branch that ever runs.

Please:
1. Make POST /api/auth/forgot-password return the same neutral body on every path —
   { success: true, message: 'If that email exists, a reset link has been sent.' } — and never
   include the token or URL.
2. Remove the UI that displays the link (the forgot-link-box in public/index.html and whatever in
   public/js/auth.js fills it in), so there's nothing to leak and no way to tell whether an email
   is registered.
3. Log only a short fingerprint (first 12 chars of sha256 of the token) plus the user id. Never
   log the URL or the token.
4. Fix the reset itself while you're there: today it updates one users row, but one email can own
   several rows, so other rows keep the old password. Update them all by email, clear their
   password_resets rows, and destroy their sessions:
     UPDATE users SET password_hash=$1
      WHERE lower(email) = (SELECT lower(email) FROM users WHERE id=$2);
     DELETE FROM password_resets WHERE user_id IN (SELECT id FROM users WHERE lower(email) = (SELECT lower(email) FROM users WHERE id=$2));
     DELETE FROM session WHERE sess->>'userId' = ANY($3::text[]);   -- pass ids as strings
   Also store reset tokens hashed (sha256) instead of plain.

Don't touch db.js. Don't add SMTP. Don't change the reset form's token handling.

Verify: POST /forgot-password for a known email and for an unknown one — both responses must be
byte-identical and contain no token; grep the response and the log output for the token string to
show it isn't there; and show that a reset updates every row belonging to that email.

Show me the diff.
```

---

### Prompt — SR-1 (C1) · the analytics SQL injection

```
There's a SQL injection in routes/analytics.js. The value_field stored by PATCH /config (line
~210) gets pasted into SQL text in four places: line 81, line 165, line 195, and the write at 210.
It ends up as (custom_data->>'<whatever they sent>')::numeric, so a member can inject SQL and
read other tables through error messages.

Please stop building SQL out of that string. The fix is to pass the field key as a parameter —
Postgres accepts a text parameter on the -> and ->> operators — and to guard the cast so a
non-numeric field doesn't error:

  CASE WHEN jsonb_typeof(custom_data -> $n) = 'number'
       THEN (custom_data ->> $n)::numeric ELSE NULL END

Put that in one small resolver function in the same file and use it at all four sites, so there's
exactly one place to get it right. Keep a write-side check too — reject with 400 when the field
isn't 'value' and isn't a field_key belonging to this workspace (look it up in deal_fields) — but
the parameterisation is the real protection, so existing bad config rows become harmless.

Don't touch db.js. Don't change the response shape of the analytics endpoints.

Verify, with a failing baseline first:
- before: show the payload   x')::numeric,(SELECT 1)--   reaching the query text
- after: no query text contains that payload, and the request returns 400
- and: choosing a *text* deal field as the value field returns 200 with an empty/null value, not
  a 500 (this is broken today as well)

Show me the diff.
```

---

### Prompt — SR-3 (C2) · the deals cross-workspace leak

```
Deals leak and accept data across workspaces. In routes/deals.js the list and detail queries join
contacts, contacts-as-supplier, pipeline_stages and users on raw ids with no workspace check
(lines 30-33 and 50-53), and POST/PUT write contact_id, supplier_id, pipeline_id, stage_id and
assigned_to straight from the request body. So a member can point a deal at another workspace's
contact and then read that contact's email and phone back from their own deal list.

Two steps:
1. Scope every join — add AND <joined>.workspace_id = d.workspace_id (for pipeline_stages, scope
   through its pipeline's workspace_id).
2. Validate the ids before writing. Don't write a fresh copy of that logic: routes/contacts.js
   already has workspaceRefs/refCheck (lines 15-34, from the Part 16 work). Move those into
   utils/workspace-refs.js, import them from both files, and return 400 for a foreign id before
   anything is written.

Don't touch db.js. Don't change the response shapes.

Verify, baseline first:
- before: show a foreign contact_id being accepted and its email/phone rendered back
- after: foreign contact_id / stage_id / assigned_to → 400 with zero rows written; own ids → 201
- and: EXPLAIN the changed statements so we can see the SQL is valid and scoped. A fake-pool
  harness can't catch a SQL typo, so please include the EXPLAIN output.

Show me the diff.
```

---

### Prompt — SR-4 · the two unscoped deletes in objects.js

```
Two endpoints in routes/objects.js delete link rows without checking who owns them:
DELETE /:id/deals/:dealId (around line 104) and DELETE /:id/contacts/:contactId (around line 143).
Neither checks that the object in the URL belongs to my workspace, nor that the linked deal or
contact does — so a member can detach another workspace's links by guessing ids. The POST at line
132 has the same gap on contact_id, while the deal version at line 92 does it correctly.

Please make them consistent with the good one: resolve the object
(SELECT 1 FROM objects WHERE id=$1 AND workspace_id=$2) and check the linked row belongs to the
workspace too, then return 404 when anything doesn't match. Nothing should be inserted or deleted
on a mismatch.

Don't touch db.js.

Verify, baseline first:
- before: show a foreign object id (or foreign contact_id) succeeding
- after: foreign → 404 and the row is untouched; own ids → 201/200

Show me the diff.
```

---

### Prompt — SR-5 (C3b) · stored XSS in notes

```
Notes are saved as HTML and put back into the page with innerHTML, so someone can plant script
that runs inside a colleague's logged-in session. public/js/modals.js renders ${activity.content}
directly (lines 373 and 419), routes/activities.js:102 stores whatever is posted, and there's no
sanitizer anywhere in the project — even though an esc() helper exists at public/js/core.js:194
and simply isn't used here.

Please sanitize note content on the server when saving (routes/activities.js POST/PUT and
routes/activity-comments.js) with sanitize-html, and use it rather than isomorphic-dompurify
because the latter pulls in jsdom we don't need. Keep a small allow-list: b, i, u, strong, em, a
with href, br, p, ul, ol, li.

Two things that matter more than the library choice:
- Sanitizing only on write leaves notes that were saved before the fix still dangerous. Either
  sanitize again when rendering in modals.js, or give me a one-off SQL statement to clean the
  existing rows — tell me which you chose.
- The CSP that would otherwise limit the damage is only switched on when NODE_ENV=production
  (server.js:18-32). Tell me if that's set on the host, because if it isn't there's no CSP at all.

Don't touch db.js. Leave the mention detection working (activities.js:11 already strips tags
before matching).

Verify: post a note containing <img src=x onerror=alert(1)> and show the stored value has the
handler removed while normal formatting survives; and re-render a note saved before the fix to
show it's harmless now. Also tell me the exact dependency and version you added.

Show me the diff.
```

---

### Prompt — SR-6 (M1/M2/M3) · the same leak class in tasks, objects and activities

```
This is the same problem as the deals fix, in three more places. Please do them in one pass:

1. routes/tasks.js — the joins at lines 25-28, 42-44 and 52 don't filter by workspace. Add the
   workspace predicate to each. The subtask query at lines 49-54 is WHERE t.parent_id=$1 with no
   workspace filter, so it can render another workspace's tasks: add AND t.workspace_id=$2, and add
   AND s.workspace_id = t.workspace_id to the two count subqueries at lines 22-23.
2. routes/tasks.js — POST/PUT validate deal_id and contact_id (lines 67-74) but pass parent_id,
   project_id, list_id and assigned_to straight through. Validate them the same way, using the
   shared helper from the deals fix.
3. Status and priority are written with no validation at all (PUT /:id and PATCH /:id/status).
   The allowed statuses live in workspaces.task_statuses, which is an array of objects like
   {key, label, color} (db.js:215) — so a valid status is one whose key matches. Reject anything
   else with 400. Pick a fixed allow-list for priority too.
4. objects.js, activities.js, activity-comments.js and calendar.js — add the workspace predicate to
   every join that touches users or contacts.

Don't touch db.js. Keep all response shapes as they are.

Verify, baseline first:
- before: show a foreign assigned_to / parent_id being accepted, and a foreign task appearing in a
  subtask list
- after: foreign refs → 400 with no writes; an unknown status → 400
- and: EXPLAIN the subtask query so we can see the scoped SQL. A fake-pool harness can't catch a
  SQL typo.

Show me the diff.
```

---

### Prompt — SR-7 (C3c) · stop shipping the database file

```
A SQLite file with real data is committed to this repo: crm.db is tracked in git and contains a
users table with bcrypt password hashes, plus contacts, password_resets, invite_codes and
platform_invites. newfile.env is tracked too. I'll deal with the git history and the credential
rotation myself later — what I want from you now is the repo side, without touching history:

1. Update .gitignore to cover crm.db, crm.db-shm, crm.db-wal, *.env (with !.env.example), and fix
   the .DS_store line to .DS_Store.
2. Remove the ADMIN_SECURITY_FIX.md line from .gitignore — the file is tracked, so the ignore does
   nothing. Tell me which you'd recommend: keep the changelog tracked, or untrack it.
3. Run git rm --cached crm.db crm.db-shm crm.db-wal newfile.env so they stop being tracked, without
   deleting my local copies.
4. Don't commit anything. Show me the staged state and the exact commands you ran.
5. Separately, tell me what I need to rotate: how many user rows are in crm.db (a count, not the
   values), whether newfile.env contains anything live, and whether any invite codes or reset
   tokens in there look unused. Counts and ids only — don't print hashes, tokens or email
   addresses into the conversation.

Verify: git ls-files no longer lists those four files, git check-ignore -v matches each new
pattern, and git status shows the removals staged with nothing committed.

Show me the commands and their output, not just a summary.
```

---

### Prompt — SR-8 (L1) · the import counters don't add up

```
Small gap in the contacts import counters. If a contact is deleted between the prefetch and the
batch UPDATE, that row is counted nowhere, so the numbers don't reconcile: submitted != imported
+ skipped. Please add an `unmatched` counter — chunk.length - matched.length in the batch path,
and the rowCount === 0 branch in the legacy per-row path — include it in the response, and have
public/js/admin-import.js mention it in the summary when it isn't zero (something like "3 rows
matched no contact and were skipped"), because a row vanishing mid-import is worth telling the
user about.

Then extend the existing counts harness with the invariants:
  submitted === imported + skipped + unmatched
  imported  === created + updated

Don't touch db.js. Keep the existing response fields exactly as they are.

Verify: run the harness with a row deleted mid-import and show all three identities holding.

Show me the diff and the harness output.
```

---

### Prompt — SR-9 · member removal deletes chat history

```
Removing a member deletes their users row (routes/workspace.js:139), and some foreign keys
cascade, so their chat messages and read state disappear from the workspace conversation —
chat_messages.user_id and chat_reads.user_id are ON DELETE CASCADE (db.js:388 and :395). The
assigned_to columns on deals/tasks/contacts are ON DELETE SET NULL, so those are already fine
(the original audit was wrong about that part).

I'd like the conversation to survive a member removal: chat_messages.user_id becomes nullable with
ON DELETE SET NULL, and those messages render as a removed member (or we keep a stored display
name on the row). This needs a schema change, so don't make it in this pass. Instead:

1. Tell me the exact DDL, including what to do about existing rows where user_id is NOT NULL.
2. Tell me what the UI needs — where the sender name is rendered for chat messages.
3. List every other foreign key that would cascade when a member is removed, so I know what else
   silently disappears.
4. Until the schema change lands, make the member-removal response say what was removed, so the
   operator isn't shown a bare success while history is deleted.

Don't run DDL. Don't edit db.js. Just the plan and the list.

Show me the DDL, the UI notes and the cascade list.
```

---

## Using these

Work down the list in the order above. After each diff, the questions worth asking before moving on:

- Did the change touch anything the prompt said not to?
- Is there a **baseline** showing the problem existed before the fix?
- For anything SQL-shaped: is there `EXPLAIN` output, not just a passing harness?
- Could you re-run the proof yourself from what's in the diff?

When all nine are done, the only item from the audit left open is the `crm.db` **history** rewrite
(SR-7 step 3) plus the credential rotation — both of which are yours to run, not an agent's.






