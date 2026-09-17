# Before / After Review — the CRM before this session vs. now

This document compares the application as it was **before any Claude-assisted work** with the application **as it is in the working tree today**, and says what those differences mean: what a normal user sees, what an operator has to do differently, whether the database changed, whether the way data is read and written changed, and what was gained and what was given up.

It is a companion to `ADMIN_SECURITY_FIX.md`, which is the append-only, part-by-part change log (Parts 1–28) recording *what was edited, where, and how it was verified*. This document does not repeat those diffs; it explains the resulting *difference in the product*. Where a claim comes from a specific part, the part number is given so it can be checked.

---

## 1. How to read this — the baseline and the method

**Who this is for.** The developer who will merge `dbpoolfix` into the working branch and deploy it. Sections 3-bis, 5-bis and 10 are written for that person: how to click through and confirm each UI difference, what to look for in the database and the read-only SQL to look with, and what to tell users.

**Baseline: the branch `dealcontacttasksync`.** This is the latest working branch. Its tip is commit `5e9d187` ("fix errors", 2026-09-10). The local branch and both remote copies (`origin/dealcontacttasksync`, `copy/dealcontacttasksync`) point at that same commit. The branch was used **read-only**: every "before" fact below comes from `git diff dealcontacttasksync` or `git show dealcontacttasksync:<file>`. It was never checked out and nothing on it was edited.

**After: the working tree of the current branch `dbpoolfix`.** That branch is `dealcontacttasksync` plus two commits the user made during the session (`a1381ab` "fix security issues and chat limiter" and `d936bb8` "fix limiter on chat", both 2026-09-15, which bundle Parts 1–19 together with a few of the user's own edits) plus the still-uncommitted Parts 20–28. `dealcontacttasksync` has no commits that `dbpoolfix` lacks, so the comparison is one-directional: every difference is on this side.

**Method.** Three independent views were reconciled: (1) `git diff --name-status dealcontacttasksync` plus the untracked-file list (37 tracked entries + 4 new untracked files); (2) a mechanical diff of every `res.json(...)` shape in every route file, before vs. after, so the list of API response changes in §6 is complete rather than remembered; (3) the change log, for attribution and for the verification evidence behind each claim.

**What is *not* claimed.** A handful of differences in the working tree were made by the user, not by the session's parts. They are listed separately in §4.4 and are never described as fixes here. The change log itself records them as pre-existing or out-of-scope (log lines 19, 31, 119, 885).

---

## 2. One-page summary

| Measure | Before (`dealcontacttasksync`) | After (working tree) |
|---|---|---|
| Files that differ | — | 37 tracked (+3 681 / −3 634) + 4 untracked new |
| Of which is the user's own deletion of the dead `public/app.js` | — | −3 353 lines |
| Net change excluding that file and the change log | — | roughly +1 270 / −280 across 33 files |
| Database schema (`db.js`) | — | **byte-identical**; no migration, no column, no table |
| Dependencies added | — | 1: `sanitize-html@2.17.7` |
| New server modules | — | 6 under `utils/` |
| Env variables | `SESSION_SECRET` (optional, had a fallback), `ADMIN_SECRET` | `SESSION_SECRET` **required**, `ADMIN_SECRET`, `ADMIN_CONSOLE_PATH` (new) |
| API response shapes changed | — | 1 success shape (contacts import, additive), ~10 new error responses |
| Verification harnesses written | 0 | 31 (in the session scratchpad, **not in the repo** — see §8) |
| Real-database verification | — | Parts 26: real PostgreSQL 16 (throwaway local DB built from `db.js`, then dropped) |
| Data migration required at merge | — | **none** |
| Rows changed by the merge | — | **none** — every existing entry stays exactly as it is |
| Users forced to log in again | — | **only if `SESSION_SECRET` was never set on the host** (see §10.2); otherwise nobody notices |

**The ten headline differences**

1. **Analytics works.** Before, the Analytics page threw a `TypeError` on every visit; the section container was emptied on load and the win/loss code looked up a renamed id. Now all four sections render, survive revisits, and reorder correctly (Parts 21, 23).
2. **No authenticated SQL injection in analytics.** The configurable "value field" used to be spliced into SQL; it is now a bound parameter with a type guard and a write-side allow-list (Parts 20, 21).
3. **No cross-workspace data leaks through joins.** Deals, tasks, objects, activities, comments and the calendar joined `users`/`contacts`/`deals`/`stages` on raw ids; another workspace's contact name, email and phone could be read back through your own deal list. Every such join is now scoped to the row's workspace, and every id a client sends is checked against the caller's workspace before a write (Parts 16, 22, 24, 26).
4. **No stored XSS in notes.** Note and comment HTML is sanitised to a small allow-list on save, and sanitised again when rendered so rows saved before the fix are harmless (Part 25).
5. **The admin console is hidden and hardened.** It lives only at a secret path from the environment; login is constant-time, rate-limited per IP and globally, regenerates the session on success and destroys it on logout; the old `/?admin` screen and `/adminconsole` are gone (Parts 1–6).
6. **Chat cannot be flooded and no longer loses messages.** Six messages per ten seconds per user across socket and HTTP, a per-IP backstop before any database work, a 1 000-character cap, and a request/response send with acknowledgements so a throttled or failed message is put back in the box with a visible countdown (Parts 7–13).
7. **Contacts import is batched and honest.** A per-row loop of ~3 queries per contact became a prefetch plus multi-row `UPDATE`/`INSERT` per 500-row chunk with transaction timeouts; counts come from what the database actually wrote; emails match case-insensitively; and the response reconciles exactly (`submitted = imported + skipped + unmatched`) (Parts 14–19, 28).
8. **Task statuses and priorities are validated,** and the Tasks page now offers the workspace-level statuses configured in Settings, which it previously ignored (Parts 26, 27).
9. **Rate limits identify the real client behind Cloudflare.** `trust proxy` moved from a hop count to the Cloudflare CIDR list, which affects every limiter in the app, not only the admin one (Part 2).
10. **The server fails fast on bad configuration.** No `SESSION_SECRET` → refuses to start; a malformed `ADMIN_CONSOLE_PATH` → refuses to start; no `ADMIN_CONSOLE_PATH` → console disabled with a warning (Part 5, plus the user's own boot guard).

---

## 3. What a normal user will notice, screen by screen

### 3.1 Login and signup
- **Signup hint text changed.** The invite-code field used to say "Get a code from the admin panel (yoursite.com/?admin)". It now says "Ask your platform administrator for a code." The public hint that revealed the admin URL is gone.
- **The "Admin" link on the login card is gone.** It pointed at `/?admin`, which no longer exists.
- Login and signup regenerate the session id on success (this was already in the user's working tree before the session; the admin login was changed to match it in Part 1).
- Nothing else on these screens changed.

### 3.2 Team chat
- **Message length: 2 000 → 1 000 characters.** Before, the socket path silently dropped anything over 2 000 and the HTTP path had no limit at all. Now both paths reject over 1 000 with a visible message ("Message must be 1–1000 characters").
- **Sending is rate-limited: 6 messages per 10 seconds per user.** Socket sends and HTTP posts count against the same allowance. On the 7th message the send button greys out, a notice above the composer counts down ("Slow down — wait 4s"), and the text you typed is put back into the input rather than lost. When the countdown ends the button re-enables.
- **Failed sends are visible.** Before, a message that the server rejected or that hit a network problem vanished with no feedback. Now every send waits for an acknowledgement (5-second timeout); on timeout or server error the text is restored and a short notice explains ("Message not sent — connection timed out. Try again.").
- **A flood from one IP is stopped before it reaches the database:** 120 chat HTTP requests per minute per IP. A normal user never hits this.
- Message display, history, and the chat layout are unchanged. A small CSS addition styles the disabled button and the notice strip.

### 3.3 Contacts import (admin import page)
- **Bigger files are accepted, up to a cap.** The import route now parses bodies up to 2 MB (the global default of 100 kB choked at roughly 500 rows). There is a hard cap of **2 000 rows per import**; larger files get a clear error ("Too many rows. Maximum 2000 contacts per import.") and stay on the mapping step instead of failing silently.
- **Imports are much faster and gentler on the database.** See §6.2. The user-visible effect is that a 1 000-row import that used to issue about three thousand queries now issues about eight.
- **Email matching is case-insensitive.** Before, `Jane@Example.com` in the file did not match `jane@example.com` in the database and created a duplicate. Now it updates the existing contact. The same fix was applied to the inbound email integration.
- **The summary tells the truth, and says more.** Before: "Successfully imported N contacts. Created M deals." where N was the number of rows *sent*, not written. Now N is what the database actually wrote, and the summary adds, when relevant: "K rows skipped (no name)." and "J rows matched no contact and were skipped (deleted during import)." The numbers always reconcile.
- **A row that points at another workspace's stage or assignee is rejected** with a 400 naming the field, before anything is written (Part 16). Before, it was accepted and the foreign name leaked back into the contacts list.
- **Timeouts are surfaced.** If the database is busy or slow, the import now fails with a 503/504 and a plain message instead of hanging the request.

### 3.4 Analytics
- **The page loads.** Before, every visit produced `TypeError: null is not an object (evaluating 'section.style')` (and after the first fix, the same on the pipeline section). The root cause was a "clear stale data" line that destroyed the static section markup on every load. Now all four sections (stats, win/loss, by pipeline, trends) render on first visit and after navigating away and back.
- **Section drag-and-drop moves a section exactly once per drop.** Listeners are bound once; previously they would have accumulated (they never got the chance, since the page threw).
- **Custom numeric deal fields count again.** The deal form stores custom values as strings; an intermediate fix (Part 20) made the value sums ignore them. Part 21 accepts numeric-looking strings, so "Pipeline Value", "Won Value", "Avg" and the value trend reflect custom fields as before.
- **A text field configured as the value field no longer breaks the page.** Before, it caused a 500 from a failed numeric cast; now such rows count as null and the page shows "—".
- **"Configure Metrics" rejects a value field that is not `value` or one of the workspace's deal fields** (400). The UI only ever offered valid choices, so this is invisible unless the request is hand-crafted.

### 3.5 Tasks
- **The status list now includes what you configured in Settings.** Before, the Tasks page used a project's own statuses if the project had any, otherwise a hard-coded `Todo / In Progress / In Review / Done`, and silently ignored the workspace-level statuses editable in Settings. Now the order is: project statuses → workspace statuses → built-ins.
- **Unknown statuses and priorities are rejected.** Saving a task with a status key that is not in the workspace list, the task's project list, or the four built-ins returns "Invalid status" (400). Priority must be `low`, `medium`, `high` or `urgent`. The UI only offers valid values, so a normal user will not see this; a legacy task whose status key has since been removed from every list will need a valid status chosen before it can be saved through the full edit form (see §8).
- **A full-form save without a status is a clean 400** ("Invalid status") instead of the 500 it used to produce from the database's NOT NULL constraint.
- **Subtasks and counts are workspace-scoped.** Before, a task in another workspace whose `parent_id` pointed at your task appeared in your subtask list and was counted in "N subtasks". It no longer appears or counts.
- **Assignee, parent, project, list, deal and contact references are checked** before any write: a foreign id yields a 400 naming the field. Before, `assigned_to`, `parent_id`, `project_id` and `list_id` were written unchecked.

### 3.6 Deals
- **Foreign contact/supplier/stage/assignee ids are rejected** on create, edit, and stage change (400 naming the field). Before they were accepted.
- **The deal list and detail can no longer display another workspace's data.** If a deal row already points at a contact from another workspace (possible before the fix), its contact name, email and phone now render blank instead of leaking. Re-saving such a deal with that id returns 400.
- Everything else (columns, ordering, the kanban) is unchanged.

### 3.7 Objects
- **Linking or unlinking a deal or contact to/from an object requires that both belong to your workspace.** Before, a member could detach another workspace's links by guessing ids, attach a foreign contact, or link their own deal to a foreign object. Each now returns 404 with nothing written.
- **The object detail's linked-deal list is scoped** (stage, contact and pipeline names come only from the same workspace).

### 3.8 Notes and comments (activities)
- **What survives in a note:** bold, italic, underline, `strong`/`em`, links whose address starts with `http://`, `https://` or `mailto:`, line breaks, paragraphs, bulleted and numbered lists. The editor's own line breaks (which it emits as `<div>`) are preserved as paragraphs.
- **What is removed:** images (including pasted or embedded images), colours and any inline styling, `span`/`font`/table markup from content pasted out of Word or Google Docs, scripts, iframes, every event-handler attribute, and links with a `javascript:` address (the link text stays, the address is dropped).
- **Safari users:** Safari writes bold as a styled `span`, which the allow-list reduces to plain text. Chrome/Edge/Firefox emit `<b>`, which survives.
- **Notes saved before the fix are shown sanitised** by the same rules but are **not rewritten in the database** (your decision in Part 25). The original HTML stays in the row; only its rendering changed.
- A note that consists of nothing but disallowed markup (e.g. only a script) is rejected as "Content required" (400).
- **@mentions still work** exactly as before (the mention scanner already stripped tags).
- Comments are sanitised on save too. They were already rendered as plain text, so nothing visible changes for them.
- The activity preview on the deal timeline and the calendar day view now parse note HTML inertly (they used a live element before, which could execute an `<img onerror>` even off-screen).

### 3.9 Calendar
- The month and day views are unchanged except that the contact name shown next to an event now comes only from the same workspace (blank if the activity's contact id is foreign), and the text preview is parsed safely.

### 3.10 The platform admin console (operators only)
- **URL changed.** It is no longer at `/?admin` or `/adminconsole`, and its API is no longer at `/api/admin/...`. It is served only under the path set in `ADMIN_CONSOLE_PATH`, and its API beneath that path. Old bookmarks stop working. If the variable is empty the console does not exist at all.
- **The invite-code panel is inside the console** (it briefly disappeared when the old screen was removed and was restored into the console in Part 6): generate, copy, delete one-time codes.
- **Login behaviour:** 10 attempts per 15 minutes per IP and 30 per 15 minutes across all IPs; the secret is compared in constant time; a successful login issues a new session id; logging out destroys the session entirely rather than clearing a flag.

---

## 3-bis. Developer UI check — click through and confirm each difference

Run the "after" build locally or on staging with `SESSION_SECRET`, `ADMIN_SECRET` and `ADMIN_CONSOLE_PATH` set. Every row names the element or route to look at so the check is unambiguous. "Before" is the behaviour on `dealcontacttasksync`; if you want to see it, run that branch side by side. Rows marked **(2 WS)** need two workspaces: sign up a second workspace with a second invite code in an incognito window, note one id from it (a contact id, a task id, a stage id), and use that id from the first workspace.

### Login / signup

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| L1 | Signup form, invite-code field | Read the helper text under the field | "Get a code from the admin panel (yoursite.com/?admin)" | "Ask your platform administrator for a code." | The admin URL is not shown anywhere on the page |
| L2 | Login card, bottom | Look for an "Admin" link (gear icon) | Present, points to `/?admin` | Absent | No link |
| L3 | Browser | Open `/?admin` and `/adminconsole` | Admin login screen / console page | The normal app (SPA) — no admin screen | Nothing admin-related renders |
| L4 | Browser | Open the value of `ADMIN_CONSOLE_PATH` | 404 (path did not exist) | Console login page | Page title "Platform Admin" |
| L5 | DevTools → Application → Cookies | Log in, note the session cookie value, log in again | Same value kept (user login already regenerated; admin did not) | New value after every login, user and admin | Value changes on each successful login |

### Team chat

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| C1 | Chat page, `#chat-page-input` / `#chat-page-send` | Send 7 short messages within 10 s | All 7 delivered | 6 delivered; 7th is put back in the input; `#chat-page-send` is disabled; `#chat-rate-notice` shows "Slow down — wait Ns" counting down | Button re-enables when the countdown reaches 0 and the 7th text is still in the input |
| C2 | Same | Paste 1 001 characters and send | Silently dropped (socket) | Notice "Message must be 1–1000 characters."; text stays in the input | Notice appears, nothing delivered |
| C3 | Same | Paste exactly 1 000 characters and send | Delivered | Delivered | Delivered |
| C4 | DevTools → Network offline, then send | — | Message vanished | Notice "Message not sent — connection timed out. Try again." after 5 s; text restored | Text is back in the input |
| C5 | `curl`/DevTools: `POST /api/chat/messages` with `{"content": 12345}` | — | 500 (`.trim` on a number) | 400 "Message cannot be empty" | 400 |
| C6 | `POST /api/chat/messages` with 1 001 chars | — | 201, stored | 400 "Message too long. Maximum 1000 characters." | 400 |
| C7 | Send 6 via the page, then 1 via `POST /api/chat/messages` | — | 7 stored | 7th → 429 with `retryAfterMs` | 429 (socket and HTTP share one allowance) |

### Contacts import (admin import page)

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| I1 | Import → upload a CSV with 2 001 rows | Map columns, click Import | Accepted (and slow) | Alert "Too many rows. Maximum 2000 contacts per import."; you stay on the mapping step | 413, nothing imported |
| I2 | CSV with `Jane@Example.com` when `jane@example.com` already exists | Import | A second contact is created | The existing contact is updated (`updated` = 1, `created` = 0) | Contacts list still has one Jane |
| I3 | CSV with one row missing the name | Import | Counted as imported | `#import-done-text` ends with "1 row skipped (no name)." | Sentence present; contact count unchanged for that row |
| I4 | Import 1 000 rows while watching the DB (`pg_stat_activity` or Supabase logs) | — | ~3 000 statements | ~8 statements (`unnest` batches) | Order-of-magnitude fewer statements |
| I5 | **(2 WS)** CSV whose stage id belongs to the other workspace | Import | Accepted; the other workspace's stage name shows in the list | Alert "stage_id does not belong to this workspace"; nothing imported | 400, zero rows written |
| I6 | Delete a contact in another tab between mapping and clicking Import | Import a file that updates it | Counted as imported | "1 row matched no contact and was skipped (deleted during import)." | `imported + skipped + unmatched = rows in file` |

### Analytics

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| A1 | Analytics page | Open it, watch DevTools console | `TypeError: null is not an object (evaluating 'section.style')`; page partly blank | No error; four sections visible: `#analytics-sec-stats`, `#analytics-sec-winloss`, `#analytics-sec-pipeline`, `#analytics-sec-trends` | Console clean, 4 sections |
| A2 | Same | Go to Contacts, come back | Error again | Still 4 sections, numbers refreshed | 4 sections after revisit |
| A3 | Same | Drag the win/loss section above the stats section | — (page was broken) | Moves once and stays; reload keeps the order | Order persists |
| A4 | Configure Metrics → Value field = a custom *number* deal field | Save | Values summed (pre-session) / zero (Part 20 state) | Pipeline Value / Won Value / Avg / value trend reflect the custom field | Non-zero numbers |
| A5 | Configure Metrics → Value field = a custom *text* deal field | Save | 500 on `/api/analytics/summary` | Values show "—", no error | 200, dashes |
| A6 | `curl PATCH /api/analytics/config` with `value_field: "x')::numeric,(SELECT 1)--"` | — | Stored; next summary query text contains the payload | 400 "value_field must be \"value\" or a deal field key" | 400 |

### Tasks

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| T1 | Settings → Task statuses: add "Backlog" | Open a task that is not in a project, look at `#task-status` | Backlog absent (list ignored) | Backlog present | Option present |
| T2 | A project with its own statuses | Open one of its tasks | Project statuses | Project statuses (unchanged) | Project list still wins |
| T3 | `curl PATCH /api/tasks/:id/status` with `{"status":"bogus"}` | — | 200, stored | 400 "Invalid status" | 400; row unchanged |
| T4 | `curl PUT /api/tasks/:id` with a body lacking `status` | — | 500 (NOT NULL violation) | 400 "Invalid status" | 400 |
| T5 | `curl PUT /api/tasks/:id` with `"priority":"asap"` | — | 200, stored | 400 "Invalid priority" | 400 |
| T6 | **(2 WS)** Create a task in WS-B with `parent_id` = a WS-A task id (via `curl`, since the UI won't offer it) | Open the WS-A task | WS-B task listed under "Subtasks"; counted | Not listed; not counted; and the create itself is now refused with 400 "parent_id does not belong to this workspace" | Creation refused |
| T7 | **(2 WS)** `POST /api/tasks` with `assigned_to` = a WS-B user id | — | 201 | 400 "assigned_to is not a member of this workspace" | 400 |

### Deals

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| D1 | **(2 WS)** `POST /api/deals` with `contact_id` = a WS-B contact | — | 201; WS-B contact's name, email, phone appear in your deal list | 400 "contact_id does not belong to this workspace" | 400 |
| D2 | **(2 WS)** For a deal that *already* points at a WS-B contact (create it on the old branch, or by SQL) | Open Deals | Name/email/phone of the WS-B contact shown | Those columns blank | Blank |
| D3 | Deal kanban | Drag a card to another stage | Works | Works (stage id is now validated, same result) | Card moves |

### Objects

| # | Where | Do this | Where | Before | After |
|---|---|---|---|---|---|
| O1 | **(2 WS)** `DELETE /api/objects/:wsB_object/deals/:wsA_deal` | — | 200, link row deleted | 404 "Not found", nothing deleted | 404 |
| O2 | **(2 WS)** `POST /api/objects/:wsA_object/contacts` with a WS-B contact | — | 201, linked | 404 "Contact not found" | 404 |
| O3 | Object detail | Link your own deal and contact | Works | Works | Links appear |

### Notes and comments

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| N1 | Contact → add note → paste `<img src=x onerror=alert(1)>` into the editor as text via DevTools or `POST /api/activities` | Open the contact in another user's browser | `alert(1)` fires | Nothing fires; stored value has no `<img` | Stored content = `""` or the surrounding text only |
| N2 | Add a note with **bold**, *italic*, a bulleted list, a link | Reload | Kept | Kept | Formatting intact |
| N3 | Paste content from Word/Google Docs containing colour, font, an image | Save, reload | Colour/image kept | Text, bold/italic/lists/links only; image gone | No `<img>`/`<span>` in the rendered note |
| N4 | Safari: make text bold, save | Reload | Bold | Plain | (Known trade-off) |
| N5 | A note saved on the old branch containing `<img onerror>` (create one before switching) | Open it on the new build | Fires | Rendered harmless; row in the DB still has the original HTML | No execution; `SELECT content` unchanged |
| N6 | Note with `@name` | Save | Mention notification created | Same | Notification present |
| N7 | Deal timeline preview and Calendar day view for note N1 | Look | Could fire even off-screen | Text only | No execution |

### Calendar

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| K1 | Calendar month view | Open | Works | Works; contact name blank only if the activity's contact is foreign | Same view |

### Admin console (operator)

| # | Where | Do this | Before | After | Pass when |
|---|---|---|---|---|---|
| M1 | `ADMIN_CONSOLE_PATH` | Log in with the secret | Panel | Console with stats, workspaces and a "Platform Invite Codes" section | Invite section present |
| M2 | Console → Invite codes | Generate, copy, delete | Same actions existed at `/?admin` | Work inside the console | Code appears / disappears |
| M3 | Console login | Enter a wrong secret 11 times within 15 min | Unlimited | 11th → 429 "Too many admin login attempts…" | 429 |
| M4 | Console login, `curl` with `{"secret": ["<the real secret>"]}` | — | Array coerces to the string → login succeeds | 401 | 401 |
| M5 | Console → Log out, then press Back | — | Panel still shown (flag toggled, session kept) | Login form; API calls return 401 | Session gone |
| M6 | Start the server without `ADMIN_CONSOLE_PATH` | — | n/a | Log line "ADMIN_CONSOLE_PATH is not set — the platform admin console is disabled."; path 404 | Warning, no console |
| M7 | Start the server without `SESSION_SECRET` | — | Started with a hard-coded fallback | Exits with "FATAL: SESSION_SECRET is not set…" | Process exits |

## 4. What changed for the operator / deployer

### 4.1 Environment variables (see `.env.example`)

| Variable | Before | After |
|---|---|---|
| `SESSION_SECRET` | Optional; fell back to a hard-coded string | **Required.** Missing → the process exits at start with an explanatory message. Shorter than 32 characters → warning to rotate. (Boot guard added by the user; the fallback string is gone.) |
| `ADMIN_SECRET` | Enabled the admin panel at `/?admin` | Login secret for the console. Only compared as a string, constant-time. |
| `ADMIN_CONSOLE_PATH` | did not exist | **New.** The unguessable path the console and its API live under. Empty → console disabled (warning logged). Malformed (too short, bad characters, or something like `/admin`) → process exits at start. Generate with the command shown in `.env.example`. |
| `DATABASE_URL`, `DATABASE_SSL` | unchanged | unchanged |
| `NODE_ENV` | not set anywhere in the repo | still not set anywhere. **Helmet's Content-Security-Policy is only enabled when `NODE_ENV=production`.** Unless the host sets it, there is no CSP. This was reported in Part 25 and is an open item (§9). |

### 4.2 Startup and logging
- Two new fatal conditions at boot (missing `SESSION_SECRET`, malformed `ADMIN_CONSOLE_PATH`) and one warning (console disabled).
- The console path itself is never logged.

### 4.3 Proxy trust and rate limiting
- `app.set('trust proxy', 1)` (trust exactly one hop) became a list of trusted addresses: loopback plus Cloudflare's published IPv4/IPv6 ranges (fetched 2026-09-15). Express walks the forwarding chain and stops at the first address not in the list; that becomes the client IP. A request that reaches the origin directly cannot spoof its IP; a request through Cloudflare, with or without an intermediate load balancer or tunnel, resolves to the real client.
- This changes `req.ip` for **every** limiter in the app (user login, signup, password reset, webhooks, chat, admin) and `req.secure` for the session cookie. Part 2 tested six topologies; the hop count was wrong in three of them.
- **Maintenance note:** when Cloudflare changes its ranges, the list must be refreshed. A stale list fails loudly (everyone resolves to the edge IP and shares one bucket), never silently.
- New limiters: admin login (10/15 min per IP; 30/15 min global, successful requests not counted), chat HTTP (120/min per IP, applied before authentication), chat per-user (6/10 s, in memory, shared by socket and HTTP). The pre-existing login/signup/reset limiters are unchanged in their numbers.

### 4.4 Present in the "after" state but **made by the user**, not by the session's parts
- The `SESSION_SECRET` boot guard and `secure: 'auto'` on the session cookie (already in the working tree before Part 1).
- `utils/session.js` and the `regenerateSession` calls on user login/signup in `routes/auth.js` (pre-existing; the admin login reused them).
- Deletion of `public/app.js`, a 3 353-line dead bundle referenced by no HTML (flagged in Part 5, deleted by the user outside the parts).
- Untracking `crm.db-shm` and `crm.db-wal`; adding `ADMIN_SECURITY_FIX.md` to `.gitignore` (it is nevertheless tracked, having been committed first — see §9); `.claude/settings.local.json`.

### 4.5 Requirements
- **Node ≥ 22.12.0** is now required by `sanitize-html@2.17.7` (local is 22.19.0; the host must match).
- Deploy must set `SESSION_SECRET` and, to keep the console, `ADMIN_SECRET` + `ADMIN_CONSOLE_PATH`.

---

## 5. Schema and data — did anything change?

**No.**

- `db.js` is **byte-identical** to the baseline (`git diff --quiet dealcontacttasksync -- db.js` passes). No `CREATE TABLE`, `ALTER TABLE`, `ADD COLUMN` or `DROP` exists anywhere outside `db.js`. No migration was written. Every route reads and writes the same tables and columns it did before.
- **No row was rewritten by any part.** In particular, notes saved before the XSS fix keep their original HTML in the database; they are sanitised at render time only. The `unmatched` counter, the reconciled import counts, the scoped joins — all of these change what is *returned* or *rejected*, not what is stored.
- **Supabase was never queried by the verification work.** Every harness runs against a fake pool that records SQL, except Part 26, which built a **throwaway local PostgreSQL database** (`crm_verify_p26`) from the project's own `initDb()` to run the real router and a real `EXPLAIN`, then dropped it. The `.env` file's Supabase URL was never used by a harness.
- What *is* different about the data you will see: rows that legitimately or accidentally point across workspaces (a deal whose contact is in another workspace, a task whose parent is in another workspace) still exist unchanged, but they now render with blank names / are no longer listed as children, and re-saving them with the foreign id is refused. If such rows exist in production they are worth a one-off look (a `SELECT` joining on mismatched `workspace_id` would find them).

---

## 5-bis. Developer database check — what you will see, what it should be, and how to look

### 5-bis.1 Structure: identical

The merge creates no table, no column, no index, no constraint, and runs no migration. `db.js` is the same file; `initDb()` executes the same `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements it always did, all of which are no-ops on an existing database. The `session` table owned by `connect-pg-simple` is untouched.

For reference, this is the column inventory of a database built from today's `db.js` (the throwaway local build used to syntax-check the queries below). Run **Q9** against production and compare: the tables the app uses must match; extra tables in production (older leftovers, the `session` table) are expected and harmless.

| Table | Columns | Table | Columns | Table | Columns |
|---|---|---|---|---|---|
| activities | 9 | invite_codes | 7 | task_attachments | 10 |
| activity_comments | 7 | notifications | 12 | task_fields | 7 |
| chat_messages | 5 | object_contacts | 3 | task_lists | 6 |
| chat_reads | 3 | object_fields | 7 | task_project_statuses | 6 |
| contacts | 12 | objects | 6 | task_projects | 7 |
| custom_fields | 7 | password_resets | 6 | tasks | 17 |
| deal_fields | 7 | pipeline_stages | 6 | user_workspaces | 4 |
| deal_objects | 3 | pipelines | 5 | users | 12 |
| deals | 13 | platform_invites | 5 | webhook_logs | 9 |
| | | platform_settings | 4 | workspace_webhook | 10 |
| | | stages | 5 | workspaces | 13 |

31 tables. This is what `db.js` produces today, and — because `db.js` is identical to the baseline — what it produced before.

### 5-bis.2 Rows: nothing written or rewritten by the merge

| Data | What the merge does to existing rows |
|---|---|
| Contacts, deals, tasks, objects, activities (notes), comments, chat messages, invite codes, users, workspaces, settings, pipelines, stages, projects, lists, attachments | **Nothing.** Every row, every column value, every timestamp is as it was. |
| Notes/comments containing HTML the sanitiser would strip | **Kept as stored.** They are sanitised *when displayed*; the row is not modified. If the note is edited and saved again, the sanitised version is what gets written. |
| Contacts created by the old import with mixed-case duplicate emails | **Kept.** Both copies stay; future imports match case-insensitively and will update the first match. |
| Tasks whose `status` key is not in any list any more | **Kept.** They list and display normally; only a full-form save now requires a valid status. |
| Deals/tasks/links/activities that point across workspaces | **Kept.** They render with blank joined fields and are refused if re-saved with the foreign id. |
| Session rows | Kept; but see §10.2 about `SESSION_SECRET`. |

### 5-bis.3 What to look for, with read-only SQL

All queries are `SELECT` only. Run them in the Supabase SQL editor (or `psql`) **before** and **after** the merge; the results will be the same both times, because the merge changes no rows. Their purpose is to tell you *in advance* which existing rows will look or behave differently, so you can decide whether to say anything to users. **No `UPDATE` or `DELETE` is required or recommended by this merge.** Every query was syntax-checked against a database built from `db.js`.

**Q1 — deals pointing at another workspace's contact, supplier, stage, pipeline or assignee.** Non-empty result: those deals will show blank name/email/phone/stage/assignee in the list and detail, and re-saving one with the same id returns 400. Before the merge they displayed the other workspace's data. What to do: nothing is required; if you want them clean, edit the deal and pick an in-workspace value.

```sql
SELECT 'deal.contact_id' AS kind, d.id, d.workspace_id, c.workspace_id AS other_workspace FROM deals d JOIN contacts c ON c.id = d.contact_id WHERE c.workspace_id <> d.workspace_id
UNION ALL SELECT 'deal.supplier_id', d.id, d.workspace_id, s.workspace_id FROM deals d JOIN contacts s ON s.id = d.supplier_id WHERE s.workspace_id <> d.workspace_id
UNION ALL SELECT 'deal.stage_id', d.id, d.workspace_id, ps.workspace_id FROM deals d JOIN pipeline_stages ps ON ps.id = d.stage_id WHERE ps.workspace_id <> d.workspace_id
UNION ALL SELECT 'deal.pipeline_id', d.id, d.workspace_id, p.workspace_id FROM deals d JOIN pipelines p ON p.id = d.pipeline_id WHERE p.workspace_id <> d.workspace_id
UNION ALL SELECT 'deal.assigned_to', d.id, d.workspace_id, u.workspace_id FROM deals d JOIN users u ON u.id = d.assigned_to WHERE u.workspace_id <> d.workspace_id;
```

**Q2 — tasks pointing at another workspace's parent task, project, list, assignee, deal or contact.** Non-empty: a foreign parent means the task no longer appears in that parent's subtask list and is not counted; foreign assignee/deal/contact render blank; re-saving with the foreign id returns 400.

```sql
SELECT 'task.parent_id' AS kind, t.id, t.workspace_id, p.workspace_id AS other_workspace FROM tasks t JOIN tasks p ON p.id = t.parent_id WHERE p.workspace_id <> t.workspace_id
UNION ALL SELECT 'task.project_id', t.id, t.workspace_id, pr.workspace_id FROM tasks t JOIN task_projects pr ON pr.id = t.project_id WHERE pr.workspace_id <> t.workspace_id
UNION ALL SELECT 'task.list_id', t.id, t.workspace_id, l.workspace_id FROM tasks t JOIN task_lists l ON l.id = t.list_id WHERE l.workspace_id <> t.workspace_id
UNION ALL SELECT 'task.assigned_to', t.id, t.workspace_id, u.workspace_id FROM tasks t JOIN users u ON u.id = t.assigned_to WHERE u.workspace_id <> t.workspace_id
UNION ALL SELECT 'task.deal_id', t.id, t.workspace_id, d.workspace_id FROM tasks t JOIN deals d ON d.id = t.deal_id WHERE d.workspace_id <> t.workspace_id
UNION ALL SELECT 'task.contact_id', t.id, t.workspace_id, c.workspace_id FROM tasks t JOIN contacts c ON c.id = t.contact_id WHERE c.workspace_id <> t.workspace_id;
```

**Q3 — object links that cross workspaces.** Non-empty: those links still exist but the object detail no longer lists the foreign deal/contact, and they cannot be removed through the API by either side any more (the ownership check needs both ends in one workspace). If you want them gone, delete the link rows by SQL — the only case in this document where a manual write might be wanted, and only if Q3 returns rows.

```sql
SELECT 'deal_objects' AS kind, dobj.deal_id AS left_id, dobj.object_id AS right_id, d.workspace_id, o.workspace_id AS other_workspace FROM deal_objects dobj JOIN deals d ON d.id = dobj.deal_id JOIN objects o ON o.id = dobj.object_id WHERE d.workspace_id <> o.workspace_id
UNION ALL SELECT 'object_contacts', oc.contact_id, oc.object_id, c.workspace_id, o.workspace_id FROM object_contacts oc JOIN contacts c ON c.id = oc.contact_id JOIN objects o ON o.id = oc.object_id WHERE c.workspace_id <> o.workspace_id;
```

**Q4 — activities and comments whose contact or author is in another workspace.** Non-empty: contact name / author name render blank for those rows. Nothing else changes.

```sql
SELECT 'activity.contact_id' AS kind, a.id, a.workspace_id, c.workspace_id AS other_workspace FROM activities a JOIN contacts c ON c.id = a.contact_id WHERE c.workspace_id <> a.workspace_id
UNION ALL SELECT 'activity.created_by', a.id, a.workspace_id, u.workspace_id FROM activities a JOIN users u ON u.id = a.created_by WHERE u.workspace_id <> a.workspace_id
UNION ALL SELECT 'comment.created_by', ac.id, ac.workspace_id, u.workspace_id FROM activity_comments ac JOIN users u ON u.id = ac.created_by WHERE u.workspace_id <> ac.workspace_id
UNION ALL SELECT 'comment.activity_id', ac.id, ac.workspace_id, a.workspace_id FROM activity_comments ac JOIN activities a ON a.id = ac.activity_id WHERE a.workspace_id <> ac.workspace_id;
```

**Q5 — notes and comments that contain markup the sanitiser removes.** This is the query that tells you whether users will *see* a difference in their old notes. Non-empty: those notes will display without images/colours/pasted styling (text, bold, italic, underline, lists, links stay). `<div>` matches are harmless (they become paragraphs) but are included so you see the editor's own output too; if you only want the visible losses, drop `div` from the pattern. The rows themselves are not modified.

```sql
SELECT 'activity' AS kind, id, workspace_id, created_at, LEFT(content, 120) AS preview FROM activities WHERE content ~* '<(img|span|script|style|iframe|font|table|div)\b|\sstyle=|javascript:'
UNION ALL SELECT 'comment', id, workspace_id, created_at, LEFT(content, 120) FROM activity_comments WHERE content ~* '<(img|span|script|style|iframe|font|table|div)\b|\sstyle=|javascript:'
ORDER BY created_at DESC;
```

A count by kind of markup, if you want numbers for a release note:

```sql
SELECT SUM((content ~* '<img\b')::int) AS with_images, SUM((content ~* '<span\b|\sstyle=|<font\b')::int) AS with_styling, SUM((content ~* '<script\b|javascript:|\son[a-z]+=')::int) AS with_script_or_handlers, COUNT(*) AS total_notes FROM activities;
```

**Q6a — tasks whose status key is not in the workspace list, the task's project list, or the four built-ins.** Non-empty: those tasks display fine but a full-form save will ask for a valid status; a status change from the kanban/checkbox also has to be to a valid key. Nothing to do unless you want to pre-assign them a current status.

```sql
WITH allowed AS (
  SELECT w.id AS workspace_id, NULL::int AS project_id, s->>'key' AS key FROM workspaces w, jsonb_array_elements(w.task_statuses) s
  UNION ALL SELECT p.workspace_id, p.id, tps.key FROM task_project_statuses tps JOIN task_projects p ON p.id = tps.project_id
  UNION ALL SELECT w.id, NULL, k FROM workspaces w, unnest(ARRAY['todo','in_progress','in_review','done']) AS k
)
SELECT t.id, t.workspace_id, t.project_id, t.status FROM tasks t
WHERE NOT EXISTS (SELECT 1 FROM allowed a WHERE a.workspace_id = t.workspace_id AND (a.project_id IS NULL OR a.project_id = t.project_id) AND a.key = t.status);
```

**Q6b — tasks whose priority is outside `low / medium / high / urgent`.** Same consequence as Q6a for priority. The UI never offered anything else, so this should be empty.

```sql
SELECT id, workspace_id, priority FROM tasks WHERE priority NOT IN ('low','medium','high','urgent');
```

**Q7 — contacts whose emails differ only by case** (duplicates the old case-sensitive import created). Non-empty: nothing changes for them by itself; the next import that carries that email will update the *first* matching row. Merge them by hand if you like.

```sql
SELECT workspace_id, LOWER(email) AS email, COUNT(*) AS copies, array_agg(id ORDER BY id) AS ids FROM contacts WHERE email IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;
```

**Q8 — why analytics numbers may differ.** Q8a lists workspaces whose analytics value field is a custom deal field; Q8b shows that custom values are stored as strings (this is how the deal form saves them). On the old branch those strings were summed by a raw cast; now they are summed only when they look numeric, and non-numeric text counts as nothing instead of breaking the page. For workspaces in Q8a, expect the same totals as before unless some values were non-numeric text, in which case the old page errored and the new one shows a number.

```sql
SELECT id, name, analytics_config->>'value_field' AS value_field FROM workspaces WHERE analytics_config ? 'value_field' AND analytics_config->>'value_field' IS NOT NULL AND analytics_config->>'value_field' <> 'value';
SELECT d.id, d.workspace_id, kv.key, kv.value FROM deals d, jsonb_each(d.custom_data) kv WHERE jsonb_typeof(kv.value) = 'string' AND (kv.value #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' LIMIT 50;
```

**Q9 — column inventory** (compare with the reference table above).

```sql
SELECT table_name, COUNT(*) AS columns FROM information_schema.columns WHERE table_schema = 'public' GROUP BY 1 ORDER BY 1;
```

### 5-bis.4 How the app treats each finding after the merge

| Finding | Read (lists, detail) | Write (save again) | Displayed data |
|---|---|---|---|
| Q1/Q2/Q4 foreign reference | Row shown; joined fields blank | 400 naming the field, unless the foreign id is replaced | Other workspace's data no longer visible |
| Q3 foreign link | Not listed on the object | Cannot be removed via API by either side | Hidden |
| Q5 note with stripped markup | Shown sanitised | Saved sanitised (the stripped version becomes permanent only if the user edits the note) | Images/colours gone, text and basic formatting kept |
| Q6 orphan status / priority | Shown as is | Full-form save requires a valid value | Unchanged |
| Q7 case-duplicate emails | Both shown | Next import updates the first match | Unchanged |

## 6. How data is gathered and written now

### 6.1 Reads — the same sources, tighter filters
The application reads the same tables and columns as before. What changed is the **predicates**:

| Route / query | Before | After |
|---|---|---|
| Deals list & detail | `LEFT JOIN contacts/contacts/pipeline_stages/users ON id only` | every join `AND x.workspace_id = d.workspace_id` |
| Tasks list | joins on id; subtask counts `WHERE s.parent_id = t.id` | joins scoped; counts `AND s.workspace_id = t.workspace_id` |
| Tasks detail + subtasks | subtasks `WHERE t.parent_id = $1` (no workspace) | `AND t.workspace_id = $2`; user join scoped |
| Objects detail | deals joined to stages/contacts/pipelines on id | all three scoped to the deal's workspace |
| Activities list/detail, comments, calendar | `users`/`contacts` joins on id | scoped; the two mention lookups also filter the activity by workspace |
| Contacts list | stages/users joins on id (Part 16) | scoped |
| Analytics summary/trend | value field spliced into SQL text | `$2::text` bound parameter; `CASE WHEN jsonb_typeof(...)` guard; numeric-looking strings cast, other text → NULL |
| Analytics config (write) | any string stored as `value_field` | must be `value` or an existing `deal_fields.field_key` |
| Inbound email integration contact lookup | `email = $2` | `LOWER(email) = $2` |

The real `EXPLAIN` in Part 26 shows the planner applying `workspace_id = 7` on every joined scan and `(parent_id = 100) AND (workspace_id = 7)` on the subtask scan.

### 6.2 Writes — validation first, then the same statements

| Route | Before | After | Extra round trips per request |
|---|---|---|---|
| Deals create / edit / stage change | write straight from the body | one `dealRefs` lookup (only the ids supplied, `= ANY($n::int[])`) → 400 on any foreign id → same INSERT/UPDATE with identical parameters | +1 |
| Tasks create / edit | two separate checks (deal, contact), other ids unchecked; status/priority unchecked | one `taskRefs` lookup for all six ids, one `allowedTaskStatuses` lookup, priority allow-list → same INSERT/UPDATE | ≈ 0 (2 → 2 before the write) |
| Tasks status change | write straight | task's project looked up, status validated | +2 |
| Object link / unlink (4 endpoints) | write straight (one checked the deal only) | one two-sided `EXISTS` probe (object **and** linked row) → 404 | +1 (0 for the deal POST, which already had one) |
| Contacts create / edit / stage change | write straight | `workspaceRefs` prefetch (workspace's stages + members) → 400 on a foreign stage/assignee (Part 16) | +1 |
| Notes / comments create & edit | stored verbatim | sanitised in-process (no extra query); mention detection reads the sanitised text | 0 |
| Chat message (socket & HTTP) | validated length, inserted | validate → in-memory bucket → insert; a rejected message costs no query | 0 (fewer under flood) |
| Admin login | string compare, flag set | constant-time compare, session regenerated | 0 |

### 6.3 Contacts import — the largest change in *how*
Before: a `for` loop over rows; per row a `SELECT` by email, then an `UPDATE` or `INSERT`, then optionally a deal `INSERT` — about three queries per row, all inside one transaction with no timeouts. 1 000 rows ≈ 3 000 round trips on a free-tier pool.

After, in one transaction with `SET LOCAL statement_timeout = 30s`, `idle_in_transaction_session_timeout = 15s`, `lock_timeout = 5s`:
1. Reject > 2 000 rows (413) before touching the database. Rows without a name are counted as `skipped`.
2. One prefetch of the workspace's stages and members; every row's `stage_id`/`assigned_to` is checked → the whole import is rejected with a 400 naming the field if any is foreign.
3. One prefetch of existing contacts by lower-cased email.
4. Rows are partitioned: updates vs inserts. Rows whose email appears more than once *in the same file* go through the original per-row path at the end so the insert-then-update semantics of a duplicate are unchanged.
5. Per 500-row chunk: one multi-row `UPDATE … FROM unnest(...) RETURNING c.id` and one multi-row `INSERT … SELECT FROM unnest(...) RETURNING id`. Counts (`created`, `updated`) are what `RETURNING` gave back, not what was sent.
6. One `INSERT INTO deals … SELECT … WHERE id = ANY($4)` for every contact that should get a deal, using the ids that actually matched.
7. Response `{ imported, deals_created, created, updated, skipped, unmatched }`, where `unmatched` counts rows that matched no database row (a contact deleted between the prefetch and the write) so that `submitted = imported + skipped + unmatched` and `imported = created + updated` always hold.

1 000 rows ≈ 8 round trips. Column lists and value expressions are the original per-row statements' own; the schema is untouched.

---

## 7. Security posture — before → after

| Finding (audit id) | Attack before | After | Proof |
|---|---|---|---|
| Admin session fixation (Part 1) | A session id planted in the operator's browser became an admin session on login | Session regenerated *after* the secret is verified; logout destroys the session | `admin-session-test`, `admin-logout-test` |
| Admin brute force (Part 1, 4) | Unlimited attempts | 10 / 15 min per IP + 30 / 15 min global | `admin-session-test`, `ratelimit-bypass-test` |
| Timing / type confusion in secret compare (Part 3) | `secret !== adminSecret` leaks timing; an array wrapping the secret could coerce to it | sha-256 both sides + `timingSafeEqual`; strings only | `type-confusion-test` |
| Rate-limit bypass via `trust proxy = 1` (Part 2) | Spoof `X-Forwarded-For` behind Cloudflare and get a fresh bucket per guess | Cloudflare CIDR allow-list; the control column in the harness still demonstrates the old bypass | `ratelimit-bypass-test` (A1/B1 are the "before" controls and fail by design) |
| Admin console discoverable (Part 5) | `/?admin`, `/adminconsole`, `/api/admin` at fixed paths | Only under `ADMIN_CONSOLE_PATH`; disabled when unset | `admin-console-path-test` (26 checks) |
| Chat flood / DoS (Parts 7, 10, 11, 12) | Unlimited socket emits and HTTP posts, each hitting the DB | 6 / 10 s per user shared across paths; 120 / min per IP before auth; validate before spending quota | `chat-ratelimit`, `chat-http-limit`, `chat-ip-backstop`, `chat-quota-order`, `chat-spam` |
| Silent message loss (Parts 8, 9, 13) | Throttled or failed sends vanished | Acks; text restored; countdown | `chat-ack-server`, `chat-ack-client` |
| C1 — analytics SQL injection (Parts 20, 21) | Stored `value_field` payload reached query text | Bound `$2::text`; type guard; allow-list on write | `analytics-sqli-test` (payload found only in params) |
| C2 — deals cross-workspace (Part 22) | Point a deal at a foreign contact, read their email/phone | Scoped joins; ids validated | `deals-refs-test` |
| Contacts cross-workspace refs (Part 16) | Foreign stage/assignee accepted; names leaked in the list | Rejected; joins scoped | `contacts-refs-test` (20 checks) |
| M2 — object links (Part 24) | Detach/attach another workspace's links by id | Two-sided ownership probe, 404 | `objects-links-test` |
| M1/M3 — tasks, objects, activities, comments, calendar (Part 26) | Foreign subtasks listed; foreign refs written; unknown status/priority stored | Scoped; validated; allow-listed | `tasks-scope-pg-test` (real Postgres, with `EXPLAIN`), `scope-joins-test` |
| C3b — stored XSS in notes (Part 25) | `<img onerror>` in a note ran in every colleague's session | Allow-list sanitiser on write **and** on render | `notes-xss-test`, `note-render-xss-test` (control shows the old handler executing, then not) |
| L1 — import counters (Parts 17, 18, 28) | Counts from input; a deleted row mid-import counted nowhere | Counts from `RETURNING`; `unmatched`; identities pinned | `contacts-counts-test` (14 checks), `contacts-response-test` |

---

## 8. Advantages and disadvantages of the new state

### Advantages
- **Eleven security findings closed,** three of them critical (SQL injection, stored XSS, admin session fixation), each with a failing-baseline-then-passing proof, so the closure is demonstrated rather than asserted.
- **Two user-facing pages that were broken now work:** Analytics (threw on every visit) and the Tasks status picker (ignored Settings).
- **Import is an order of magnitude lighter on the database** and reports numbers that reconcile. On a free-tier pool this is the difference between a 1 000-row import competing with every other user for connections and one that barely registers.
- **Chat gives feedback instead of silently dropping messages,** and cannot be used to exhaust the database.
- **Misconfiguration fails at boot,** not at the first request that needs the secret.
- **No schema change, no data migration, no rewritten rows** — the whole change set is code; rolling back is a checkout.
- **Cross-workspace isolation is now enforced at the read *and* write layer,** so a future bug that writes a foreign id still cannot leak the foreign row's contents.
- **Rate limiting is correct behind Cloudflare** for every limiter, not only the ones added in this session.
- **One shared reference validator** (`utils/workspace-refs.js`) instead of per-route copies, so the next route gets the same rule for free.
- **A written audit, a remediation plan, and a 2 400-line change log** exist where before there was none.

### Disadvantages, trade-offs and risks
- **Extra database round trips on writes:** +1 on deal writes, object links, contact writes; +2 on a task status change. Each is a single small indexed lookup, but on a free-tier pool it is not zero. (Task create/edit is a wash: two old checks became two new ones.)
- **Stricter validation can break callers that were "working" by accident.** Any script, integration or older client that sends a foreign id, an unknown task status/priority, a full-form task save without a status, or an import over 2 000 rows now gets a 400/413 instead of a silent write. The task error messages for deal/contact also changed wording (`deal_id does not belong to this workspace` instead of `Deal not found in this workspace`).
- **Legacy tasks with an orphaned status key** (a key removed from every status list after the task was created) cannot be saved through the full edit form until a valid status is chosen. Reads, lists and kanban are unaffected.
- **Notes lose images and rich formatting.** Anything pasted from a document — colours, fonts, tables, embedded images — is reduced to text with bold/italic/underline/lists/links. This applies to the *display* of old notes too (the database still has the original). If anyone relied on images in notes, they will notice.
- **Safari bold becomes plain text** (Safari emits a styled `span`, not `<b>`).
- **Chat message limit halved** (2 000 → 1 000) and 6 messages / 10 s may feel tight to a very fast typist; the countdown makes it explicit.
- **Node ≥ 22.12 is now required** (for `sanitize-html`). Older hosts must upgrade.
- **Deployment needs two more environment variables** to keep the admin console, and the app refuses to start without `SESSION_SECRET`. A deploy that forgets them fails loudly (intended, but it is a change in behaviour).
- **The Cloudflare IP list is static** (fetched 2026-09-15) and needs refreshing when Cloudflare announces changes; the failure mode is loud (shared bucket), not silent.
- **Old admin bookmarks (`/?admin`, `/adminconsole`) stop working.**
- **Rows that already point across workspaces render blank** rather than showing the (leaked) foreign name; that is correct, but a user who had grown used to seeing a name there will see "—".
- **The 31 verification harnesses live in a temporary scratchpad directory, not in the repository.** They will not survive the machine's temp cleanup and are not run by CI. This is the biggest operational gap left by the session: the proof exists today and will evaporate.
- **Two harnesses show failures by design** (`ratelimit-bypass-test` A1/B1 are the "before" control columns; `chat-client-ratelimit` and `chat-pending-invariant` were retired in Part 13). Anyone running the suite cold needs to know that.
- **`unmatched` is a new response field.** Clients that validate response keys strictly (none of ours do) would need updating.

---

## 9. Still open (not done in this session)

| Id | What | Why it matters |
|---|---|---|
| SR-2 / C3a | The password-reset flow returns the reset token in the response (no mailer configured) | Anyone who can trigger a reset for an address can take the account. Highest-priority remaining item in the remediation plan. |
| SR-7 / C3c | `crm.db` and `newfile.env` are **still tracked in git** (only the `-shm`/`-wal` sidecars were untracked) | A committed SQLite database and an env file leak whatever they contain to everyone with repo access; the plan says rotate first, then untrack and rewrite history. |
| SR-9 | Member removal deletes chat history | Data loss on an ordinary admin action. |
| CSP | `NODE_ENV=production` is set nowhere in the repo; helmet's CSP is off unless the host sets it | The defence that would limit any future XSS is not active. One line in the host's environment (or `.env`). |
| Non-integer ids | Several `/:id` routes (objects, deals, tasks…) still 500 on a non-numeric id | Noise, not a leak; pre-existing. |
| Harnesses | 31 test files in `/private/tmp/.../scratchpad` | Copy into `test/` and add an `npm test` script before they are lost. |
| Change log ignored | `ADMIN_SECURITY_FIX.md` is both tracked and listed in `.gitignore` | Harmless today (tracked files ignore `.gitignore`), but confusing; decide which it should be. |

---

## 10. Merge impact — will users notice, and what should the developer say?

### 10.1 The guarantee

**Nothing is lost and nothing is changed in the database.** Every contact, deal, task, note, comment, object, chat message, invite code, pipeline, stage, project, list, attachment, setting and user is exactly as it was before the merge, byte for byte. There is no migration to run and nothing to back up specifically for this merge (a normal pre-deploy backup is still good practice). Rolling back is a checkout of the previous commit; there is no data step to undo.

### 10.2 The one deploy effect that can touch users: a single re-login

The old code accepted a missing `SESSION_SECRET` and fell back to a hard-coded string. The new code refuses to start without one. If the host **already had** `SESSION_SECRET` set, existing sessions keep working and nobody notices anything at deploy time. If the host **never set it** (and therefore ran on the fallback), setting a real secret now means every existing session cookie fails its signature check: **everyone is logged out once** and simply logs in again. No data is affected either way. Check the host's environment before deploying so you know which case you are in and can warn users if needed.

`secure: 'auto'` on the cookie (already in the tree before the session) and the new `trust proxy` list have no visible effect behind Cloudflare over HTTPS.

### 10.3 "Will users work as if nothing happened?"

For the everyday flow — open contacts, deals, tasks, calendar, objects; create, edit, move, delete their own records — **yes**. The screens, columns, buttons and workflows are the same. The differences a user can run into are listed below in two groups, each with the one-line explanation the developer can give. Nothing in the "looks missing" group is data loss; each is either a removed leak, a removed vector, or a removed public surface.

**New — things users will see that were not there before**

| What they see | Where | One-line explanation |
|---|---|---|
| A countdown "Slow down — wait Ns" and a greyed send button after many quick messages; their text stays in the box | Chat | Chat is limited to 6 messages per 10 seconds per person so one person cannot flood it; nothing you typed is lost. |
| "Message not sent — …" notices instead of silent failures | Chat | Chat now confirms every send and tells you when one did not go through. |
| Import summary sentences: "N rows skipped (no name)", "N rows matched no contact and were skipped (deleted during import)" | Contacts import | The import now reports exactly what was written; the numbers add up to the rows in your file. |
| The Analytics page works | Analytics | It used to error on load; that is fixed. |
| Workspace statuses from Settings appear in the task status list | Tasks | Statuses you define in Settings are now offered on tasks outside a project. |

**Looks missing — things users may think are gone**

| What they miss | Where | What actually happened / what to say |
|---|---|---|
| The "Admin" link on the login page and `/?admin` | Login | The platform admin console moved to a private address known only to the platform operator. Normal users never needed it; workspace admins still have their Settings. |
| Images, colours, fonts and pasted layout in notes | Notes | Notes keep bold, italic, underline, lists and links. Images and pasted styling are no longer shown because they were the way a malicious note could run code in colleagues' browsers. The original text of every note is intact. |
| Bold typed in Safari shows as plain text | Notes | Safari stores bold as a style, which is removed; use Chrome/Edge/Firefox for bold, or accept plain text. (Known limitation.) |
| Chat messages longer than 1 000 characters | Chat | The limit is now 1 000 characters (was 2 000 on one path and unlimited on the other). |
| Imports of more than 2 000 rows | Contacts import | Split the file; each import is capped at 2 000 rows so one upload cannot tie up the database. |
| A contact/assignee name that used to show on a deal or task now blank | Deals, Tasks | That name belonged to a different workspace and should never have been visible. Pick a value from your own workspace to fill it. |
| Saving a task says "Invalid status" | Tasks (rare) | The task had a status that no longer exists in your status list; choose a current one. |
| A deal/task/object link that "worked" with an id from another workspace now refused | API users only | Cross-workspace references are rejected by design. |

### 10.4 Ready-to-send "What's new" for end users

> **CRM update — what changed for you**
> Everything you have entered is exactly where it was; nothing was migrated or removed.
> - **Analytics** loads again and includes your custom deal value fields.
> - **Chat** now confirms every message. If you send more than six messages in ten seconds you'll see a short countdown and your text stays in the box. Messages are limited to 1 000 characters.
> - **Contact import** accepts larger files (up to 2 000 rows per upload), matches emails regardless of capitalisation, and the summary now reports exactly what was created, updated and skipped.
> - **Tasks** offer the statuses defined in Settings.
> - **Notes** keep bold, italic, underline, lists and links; pasted images and colours are no longer displayed, for security. The text of every existing note is unchanged.
> - The "Admin" link on the login page is gone; it was for the platform operator only.
> *(Add if applicable:)* You may be asked to log in once after the update.

### 10.5 Deploy notes for the developer

1. **Environment:** set `SESSION_SECRET` (32+ chars), `ADMIN_SECRET`, `ADMIN_CONSOLE_PATH` (generate both with the commands in `.env.example`). Decide on `NODE_ENV=production` (enables the CSP — recommended; see §9). Check whether `SESSION_SECRET` was already set (§10.2).
2. **Runtime:** Node ≥ 22.12. `npm install` (adds `sanitize-html`).
3. **Before switching traffic:** run Q1–Q9 read-only (§5-bis.3) and keep the output; it tells you what users may ask about.
4. **Switch, restart.** Expect at boot: no FATAL lines; possibly the "console disabled" warning if you chose not to set the path.
5. **Smoke test** with the rows in §3-bis you can do without a second workspace: L1–L4, C1–C2, I2–I3, A1–A2, T1, N2–N3, M1–M2.
6. **Tell users** using §10.4 (add the re-login line if §10.2 applies). Tell the platform operator the new console URL and that `/?admin` is retired.
7. **Calendar reminder:** refresh the Cloudflare IP ranges in `utils/trusted-proxies.js` when Cloudflare announces changes.
8. **Follow-ups not in this merge:** §9 (reset-token leak, tracked `crm.db`/`newfile.env`, member-removal chat history, moving the 31 harnesses into `test/`).

## Appendix A — File-by-file (baseline branch → working tree)

Status: **M** modified, **A** added, **D** deleted, **R** renamed, **U** untracked new file. "Part" refers to `ADMIN_SECURITY_FIX.md`; "user" means the change is the user's own (see §4.4).

| File | Status | + / − | Part(s) | What |
|---|---|---|---|---|
| `db.js` | unchanged | 0 / 0 | — | **Schema identical.** |
| `server.js` | M | +127 / − | 2, 5, 7, 10, 11, 13, 14; user | Boot guards; `trust proxy` list; admin/chat limiters; console mounted under the secret path; 2 MB parser for import; socket handler with acks and per-user bucket; `secure:'auto'` (user). |
| `routes/admin.js` | M | 55 | 1, 3, 4, 6 | Constant-time compare, session regenerate on login, destroy on logout, invite endpoints under the console. |
| `routes/auth.js` | M | +5 | user | `regenerateSession` on login/signup (pre-existing). |
| `routes/chat.js` | M | 9 | 10, 12 | Shared bucket middleware; string-only content; 1 000-char limit. |
| `routes/contacts.js` | M | +222 / −45 | 14–19, 28 | Batched import, caps, timeouts, lower-cased emails, cross-workspace guard, DB-derived counts, `unmatched`. |
| `routes/deals.js` | M | +23 / −8 | 22 | Scoped joins; `dealRefs` validation on create/edit/stage. |
| `routes/analytics.js` | M | +40 / −22 | 20, 21 | Parameterised value field; type guard; allow-list. |
| `routes/objects.js` | M | +28 / −8 | 24, 26 | Two-sided ownership on link endpoints; scoped joins. |
| `routes/tasks.js` | M | +40 / −32 | 26 | Scoped joins and counts; `taskRefs`; status/priority validation. |
| `routes/activities.js` | M | +15 / −9 | 25, 26 | Sanitise on save; scoped joins; mention lookup scoped. |
| `routes/activity-comments.js` | M | +12 / −8 | 25, 26 | Same. |
| `routes/calendar.js` | M | +2 / −2 | 26 | Scoped contact joins. |
| `routes/integrations.js` | M | +1 / −1 | 15 | `LOWER(email)` match. |
| `utils/admin-console.js` | A | +29 | 5 | Validates/normalises `ADMIN_CONSOLE_PATH`. |
| `utils/trusted-proxies.js` | A | +55 | 2 | Loopback + Cloudflare CIDRs for `trust proxy`. |
| `utils/chat-rate-limit.js` | A | +111 | 7, 10, 11, 12 | Sliding-window per-user bucket; middleware; constants. |
| `utils/session.js` | A | +15 | user | Promisified `regenerateSession` (pre-existing, reused). |
| `utils/workspace-refs.js` | U | +118 | 22, 26 | `workspaceRefs`, `dealRefs`, `taskRefs`, `refCheck`, `allowedTaskStatuses`, `TASK_PRIORITIES`. |
| `utils/sanitize-note.js` | U | +25 | 25 | `sanitizeNote` allow-list (`div→p`). |
| `private/admin.html` (from `public/admin.html`) | R | 88 | 5, 6 | Served only at the secret path; API base derived from it; invite-code section. |
| `public/index.html` | M | 53 | 5, 8, 13 | Admin screen and link removed; signup hint; chat send button id; rate notice element. |
| `public/js/auth.js` | M | −9 | 5 | `/?admin` handling removed. |
| `public/js/admin-import.js` | M | +49 / − | 5, 14, 18, 28 | Admin panel functions removed; error guard; `skipped` and `unmatched` sentences. |
| `public/js/chat.js` | M | 88 | 8, 9, 13 | Ack-based send; restore text; cooldown countdown; notices. |
| `public/js/analytics.js` | M | +14 / −4 | 21, 23 | Correct section id; no container clearing; guards; bind drag-drop once. |
| `public/js/core.js` | M | +33 | 25 | `sanitizeNoteHtml` (DOMParser, inert). |
| `public/js/modals.js` | M | +5 / −5 | 25 | Four note render sites sanitised; preview parses sanitised HTML. |
| `public/js/calendar.js` | M | +2 / −3 | 25 | `stripHtml` via DOMParser. |
| `public/js/tasks.js` | M | +7 / −2 | 27 | Status precedence: project → workspace → built-ins. |
| `public/style.css` | M | +15 | 8 | Disabled send button; rate-limit notice. |
| `public/app.js` | D | −3 353 | user | Dead bundle removed. |
| `.env.example` | M | 11 | 5 | New admin variables documented; empty placeholders. |
| `package.json` / `package-lock.json` | M | +1 / +232 | 25 | `sanitize-html@2.17.7`. |
| `.gitignore` | M | +1 | user | Adds the change log (which is nevertheless tracked). |
| `crm.db-shm`, `crm.db-wal` | D | — | user | Sidecars untracked; `crm.db` and `newfile.env` remain tracked (open). |
| `.claude/settings.local.json` | M | 3 | user | Tooling settings. |
| `ADMIN_SECURITY_FIX.md` | A | +2 411 | 1–28 | The change log. |
| `CODE_AUDIT.md` | U | 215 | audit | Findings C1–C3c, M1–M3, L1–L2 with plans. |
| `SECURITY_REMEDIATION_PLAN.md` | U | 618 | user | The user's SR-1…SR-9 plan (reviewer's revision). |

## Appendix B — API response changes, verbatim

Only these lines differ across every `res.json(...)` in every route (`<` before, `>` after):

```
routes/analytics.js
> res.status(400).json({ error: 'value_field must be "value" or a deal field key' })
routes/chat.js
> res.status(400).json({ error: `Message too long. Maximum ${CHAT_MAX_LENGTH} characters.` })
routes/contacts.js
< res.status(201).json({ imported: count, deals_created: dealsCreated })
> res.status(201).json({ imported: count, deals_created: dealsCreated, created, updated, skipped, unmatched })
> res.status(400).json({ error: badRef })
> res.status(413).json({ error: `Too many rows. Maximum ${MAX_IMPORT_ROWS} contacts per import.` })
routes/deals.js
> res.status(400).json({ error: badRef })
routes/objects.js
> res.status(404).json({ error: 'Contact not found' })
routes/tasks.js
< res.status(400).json({ error: 'Contact not found in this workspace' })
< res.status(400).json({ error: 'Deal not found in this workspace' })
> res.status(400).json({ error: 'Invalid priority' })
> res.status(400).json({ error: 'Invalid status' })
> res.status(400).json({ error: badRef })
```

Every success shape other than the contacts import is unchanged. The `badRef` messages are `"<field> does not belong to this workspace"` (`contact_id`, `supplier_id`, `pipeline_id`, `stage_id`, `parent_id`, `project_id`, `list_id`, `deal_id`) and `"assigned_to is not a member of this workspace"`.

## Appendix C — Verification harnesses (session scratchpad; not in the repo)

`admin-console-path`, `admin-import-summary`, `admin-invites-console`, `admin-logout`, `admin-session`, `analytics-sections`, `analytics-sqli`, `analytics-winloss`, `chat-ack-client`, `chat-ack-server`, `chat-client-ratelimit` (retired, Part 13), `chat-http-limit`, `chat-import-batch`, `chat-import-lowercase`, `chat-ip-backstop`, `chat-pending-invariant` (retired, Part 13), `chat-quota-order`, `chat-ratelimit`, `chat-spam`, `contacts-counts`, `contacts-refs`, `contacts-response`, `deals-refs`, `note-render-xss`, `notes-xss`, `objects-links`, `ratelimit-bypass` (A1/B1 are before-controls), `scope-joins`, `task-status-fallback`, `tasks-scope-pg` (real PostgreSQL), `type-confusion` — 31 files. Each was run against a pre-edit baseline copy first (failing) and then against the live code (passing); the outputs are quoted part by part in `ADMIN_SECURITY_FIX.md`.

## Appendix D — Quick reference used by the UI checklist (§3-bis)

**Element ids**

| Screen | Element | Id / selector |
|---|---|---|
| Chat | message input / send button / rate notice | `#chat-page-input` / `#chat-page-send` / `#chat-rate-notice` |
| Contacts import | done-step summary text | `#import-done-text` |
| Analytics | section containers | `#analytics-main-sections` › `#analytics-sec-stats`, `#analytics-sec-winloss`, `#analytics-sec-pipeline`, `#analytics-sec-trends` |
| Analytics | win/loss bar and legend; pipeline breakdown | `#analytics-winloss-bar`, `#analytics-winloss-legend`; `#analytics-by-pipeline` |
| Analytics | Configure Metrics modal, value-field select | `#analytics-config-modal`, `#analytics-value-field` |
| Tasks | status select, project select in the task form | `#task-status`, `#task-project` |
| Notes | note editor (modal), inline editor on the deal timeline | `#act-content-edit`, `.inline-edit-content` |
| Admin console | invite-code list | `#invites-list` (inside `private/admin.html`) |

**Routes touched by the checks**

| Method & path | Now returns on the checked condition |
|---|---|
| `POST /api/chat/messages` | 400 non-string/empty; 400 `> 1000` chars; 429 after 6 in 10 s (`retryAfterMs`); 429 after 120/min per IP |
| `POST /api/contacts/import` | 413 `> 2000` rows; 400 `stage_id` / `assigned_to` foreign; 503/504 on DB timeout; 201 `{imported, deals_created, created, updated, skipped, unmatched}` |
| `PATCH /api/analytics/config` | 400 unless `value_field` is `value` or a deal field key |
| `POST/PUT /api/tasks`, `PATCH /api/tasks/:id/status` | 400 `<field> does not belong to this workspace`; 400 `Invalid status`; 400 `Invalid priority` |
| `POST/PUT /api/deals`, `PATCH /api/deals/:id/stage` | 400 `<field> does not belong to this workspace` |
| `POST/DELETE /api/objects/:id/deals[/:dealId]`, `…/contacts[/:contactId]` | 404 `Not found` (object foreign) / `Deal not found` / `Contact not found` |
| `POST/PATCH /api/activities`, `POST /api/activity-comments` | content sanitised; 400 `Content required` if nothing survives |
| `<ADMIN_CONSOLE_PATH>/api/login` | 401 wrong or non-string secret; 429 after 10 per IP or 30 global in 15 min |
| `/?admin`, `/adminconsole`, `/api/admin/*` | no longer exist |

**Two-workspace setup for the (2 WS) rows:** generate a second invite code in the console, sign up a second workspace in an incognito window, create one contact, one task, one project and one stage there, note their ids from the network tab, then use those ids in requests made from the first workspace.
