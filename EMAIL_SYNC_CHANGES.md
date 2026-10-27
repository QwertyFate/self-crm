# Email sync — change log

Append-only. Each part adds a section at the bottom; nothing above it is changed.

Branch `v2.3.1`. The working tree already held the user's own uncommitted work when Part 1 started: the Workflows preview (`public/js/workflows.js` new; edits in `public/js/core.js`, `public/js/auth.js`, `public/index.html`, `public/style.css`, `public/admin.html`, `routes/admin.js`, `utils/features.js`). Those changes are not part of this log; where Part 1 edits the same files, only the lines named below are Part 1's.

---

## Part 1 — Connect a Google mailbox (2026-10-22)

### Decisions this part is built on (user, 2026-10-22)

1. Synced emails are seen by **the whole team**.
2. Mail from someone who is not a contact is **ignored**.
3. Two tables. Asked: "does the mailboxes table include the emails or just the credentials?" Answer: the mailbox table (`email_accounts`) holds **only the connection** (address, provider, sealed token, granted scopes, status). The emails get their own table in Part 2.
4. Disconnecting a mailbox **deletes the emails taken from it** (Part 2: the emails table will reference `email_accounts` with `ON DELETE CASCADE`).
5. Customers use **both Google and Microsoft**.
6. **Google first**, Microsoft after.

### What this part does

Each person can connect their own Google mailbox under **Settings → My preferences → E-Mail**. That is all. Nothing is read from the mailbox yet (Part 2), and the card says so.

The flow: "Mit Google verbinden" → the tab goes to `/api/mailbox/google/start` → Google's consent screen (read + send Gmail) → back to `/api/mailbox/google/callback` → the server exchanges the code, reads the address from Gmail, stores the refresh token sealed → the tab lands on `/?mailbox=connected` and opens My preferences with a toast.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `db.js` | 729–747 | new table `email_accounts` (after the Notetaker ALTERs) |
| `utils/gmail.js` | 1–125 (new) | Google OAuth: consent URL, signed state, code exchange, Gmail profile, revoke, token sealing |
| `routes/mailbox.js` | 1–103 (new) | `GET /api/mailbox`, `GET /google/start`, `GET /google/callback`, `DELETE /` |
| `server.js` | 246 | mount `/api/mailbox` |
| `.env.example` | 72–79 | `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET` with the redirect URI to register |
| `public/index.html` | 831–835 | the E-Mail card in the My preferences pane, after Notifications |
| `public/index.html` | 1957 | `<script src="js/mailbox.js">` after settings.js |
| `public/js/mailbox.js` | 1–81 (new) | the card: load, render, connect (navigation), disconnect, the return word |
| `public/js/auth.js` | 64 | `init()` keeps the `?mailbox=` word before `showApp()` clears the address |
| `public/js/settings.js` | 82, 91 | `/api/mailbox` joins the one Promise.all batch (`mailboxRow`) |
| `public/js/settings.js` | 115 | `loadMailboxCard(mailboxRow)` after `loadNotifPrefs()`, before the tab switch |
| `public/js/core.js` | 255–265 | 16 English keys (`set_mailbox`, `hint_mailbox`, `mb_*`) |
| `public/js/core.js` | 740–750 | the same 16 keys in German, impersonal |
| `tests/routes/mailbox.test.js` | 1–229 (new) | 18 route tests over a fake pool and a fake Google |
| `tests/unit/mailbox-schema.test.js` | 1–36 (new) | 2 schema tests |
| `tests/client/mailbox-ui.test.js` | 1–141 (new) | 11 client tests (markup, wiring, strings, the card in a sandbox) |

### db.js 729–747 (added)

```js
  // Email (routes/mailbox.js, utils/gmail.js; EMAIL_SYNC_CHANGES Part 1): ONE connected mailbox per person per
  // workspace. The connection only, never the mail itself: ...
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id                   SERIAL PRIMARY KEY,
      workspace_id         INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider             TEXT NOT NULL,
      email_address        TEXT NOT NULL,
      refresh_token_sealed TEXT NOT NULL,
      scopes               TEXT,
      connected_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      last_error           TEXT,
      UNIQUE (workspace_id, user_id)
    )
  `);
```

Purely additive: `CREATE TABLE IF NOT EXISTS`, nothing existing is altered.

### utils/gmail.js (new)

- `authUrl()` — `https://accounts.google.com/o/oauth2/v2/auth` with `gmail.readonly` + `gmail.send`, `access_type=offline`, `prompt=consent` (Google only sends a refresh token on a consent), `include_granted_scopes=true`, the state.
- `signState()` / `checkState()` — `<userId>.<workspaceId>.<expires>.<nonce>.<HMAC-SHA256 under SESSION_SECRET>`, valid 10 minutes, compared with `timingSafeEqual`. A callback is accepted only for the person and workspace that started it, so nobody can make another CRM user connect a mailbox of their choosing.
- `exchangeCode()` — POST to `https://oauth2.googleapis.com/token`; `profile()` — `GET gmail/v1/users/me/profile` for the address (lower-cased); `revoke()` — POST to `https://oauth2.googleapis.com/revoke`, best effort.
- `sealToken` / `openToken` — the Cal.com key's AES-256-GCM (`utils/calcom.js` `sealKey`/`openKey`, key from `CALCOM_ENCRYPTION_KEY`, else `SESSION_SECRET`).
- Every Google call has a 15 s timeout; a failure is a `GmailError` (`unreachable` | `rejected`).

### routes/mailbox.js (new)

- All four routes behind `requireAuth`; every query filters on `req.workspaceId` **and** `req.userId`.
- The callback always ends in a 302 to `/?mailbox=<word>`: `connected | denied | expired | scopes | taken | failed | not_configured`. Order: not set up → state check (before anything is sent to Google) → Google's `error` / no code → exchange → both scopes? → refresh token? → address → taken? → upsert.
- **Taken:** an address another person in the same workspace already connected is refused (the same mail would be read twice).
- **No revoke on a refusal:** Google's revoke ends the person's whole grant, which a teammate (same address) or another workspace may be using.
- **Disconnect:** deletes the caller's row, then revokes at Google only when no row in any workspace still has that address. A refused revoke or an unopenable token (older server secret) still disconnects.

### public/js/auth.js 64 (added)

```js
  mailboxKeepReturn(params);   // mailbox.js: back from Google's consent screen, before showApp() clears the address
```

`showApp()` is unchanged: the way back to Settings is the existing self-reload memory. `connectGoogleMailbox()` calls `appRememberPage()` before it navigates, so `appRestorePage()` returns `settings` when the person comes back within its 5 minutes. A later return lands on Deals; the toast is then said when Settings is next opened.

### public/js/settings.js 82, 91, 115 (changed)

```js
  const [fieldRows, ..., inviteRows, mailboxRow] = await Promise.all([
    ...
    canManageInvites ? api.get('/api/invites') : null,
    api.get('/api/mailbox'),
  ]);
  ...
  loadNotifPrefs();
  loadMailboxCard(mailboxRow);   // mailbox.js: the E-Mail card under My preferences
  switchSettingsTab(currentSettingsTab);
```

### The card's states (public/js/mailbox.js)

| State | Members | Owners and admins |
|---|---|---|
| Google login not set up on the server | card hidden | "Google login is not set up on this server yet. It needs GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET." |
| Set up, nothing connected | "Connect with Google" button | same |
| Connected | address, "Connected on <date>", last problem if any, "Reading the emails is the next step and is not switched on yet.", Disconnect | same |

### Setup outside the code (the user, once)

1. Google Cloud console, in a project owned by the upgrads.de Google Workspace: switch on the **Gmail API**.
2. **OAuth consent screen**: user type **External** (customers connect too), app name, support email, privacy policy URL, add the two scopes `gmail.readonly` and `gmail.send`, set the publishing status to **In production**. Until Google has verified the app: at most 100 people can connect, each sees "Google hasn't verified this app" once. (Testing status instead would make every connection expire after 7 days.)
3. **Credentials → OAuth client ID → Web application**, authorised redirect URI `<public origin>/api/mailbox/google/callback`, the origin being `APP_BASE_URL` (else `BASE_URL`).
4. `.env`: `GOOGLE_MAIL_CLIENT_ID=…`, `GOOGLE_MAIL_CLIENT_SECRET=…`, restart.
5. For customers beyond 100 users, or without the warning: Google's verification of the app, which for the Gmail read scope includes a yearly security assessment.

### Verification

- `npm test`: **1704 passing, 0 failing** (1673 before this part + 31 new).
- New tests: `tests/routes/mailbox.test.js` (18), `tests/unit/mailbox-schema.test.js` (2), `tests/client/mailbox-ui.test.js` (11).
- The tests were shown to fail on broken code. With `checkState` accepting anything, 5 tests failed; with the disconnect's `user_id` filter removed, 4 failed. Both files were restored from a copy and compared byte for byte (`cmp`), then the suite passed again.
- Not checked in a browser (standing rule: static and sandboxed tests only) and not against the real Google: that needs the user's Google Cloud client.

### Left for later parts

- **Part 2:** reading Inbox and Sent (only mail with known contacts), the `emails` table with `ON DELETE CASCADE` to `email_accounts`, a background job in the engine-retry-worker pattern. The "not switched on yet" line on the card goes then.
- A person removed from a workspace keeps their `email_accounts` row (the user row still exists). Part 2's reader must only read mailboxes whose owner is still a member (join `user_workspaces`).
- Part 3 the E-Mails tab on contact and deal; Part 4 sending and replying; then Microsoft login.

## 2026-10-27: email sync on hold, hidden and kept out of every database

**Asked:** "for the email sync can you hide it or delete it for now it needs to be built after some urgent features"
and "the new tables for the db should not be triggered in the production database so make sure it is commented".

**Hidden, not deleted.** Part 1 was never committed, so deleting it could not be undone. It stays in the code, behind
two switches, and its table is commented out.

- `server.js` lines 246–249: `const EMAIL_SYNC_ON = false;`. The line `if (EMAIL_SYNC_ON) app.use('/api/mailbox', …)`
  keeps `/api/mailbox` unmounted, so nobody can start a Google connection.
- `public/js/mailbox.js` lines 19–21: `const MAILBOX_SHOWN = false;`.
- `public/js/settings.js`:
  - line 91: `MAILBOX_SHOWN ? api.get('/api/mailbox') : null`, so Settings does not ask for the mailbox;
  - line 115: `if (MAILBOX_SHOWN) loadMailboxCard(mailboxRow);`, so the E-Mail card stays hidden for everyone, owners
    and admins included.
- `db.js` lines 729–752: the `CREATE TABLE IF NOT EXISTS email_accounts` block sits inside `/* */`, so `initDb()` no
  longer creates the table on any database. Nothing else uses the table: only `routes/mailbox.js`, which is not
  mounted.
  - A local database that already ran Part 1 keeps its empty table; nothing reads it.
  - The other two new tables of this line, `break_scores` and `notetaker_recordings` (both from the v2.3 commits),
    stay. The break game's team board and the Notetaker link watch use them.

**To bring it back:** remove the `/* */` in `db.js`, and set `EMAIL_SYNC_ON` and `MAILBOX_SHOWN` to `true`.
`routes/mailbox.js`, `utils/gmail.js`, the route tests and the Google settings in `.env.example` are untouched.

**Tests:**
- `tests/client/mailbox-ui.test.js`: a new test pins both switches off; two assertions were updated to the guarded
  lines.
- `tests/unit/mailbox-schema.test.js`: rewritten. `initDb()` sends no SQL touching `email_accounts`, and the commented
  definition is still complete in `db.js`.
- `npm test`: 1669 of 1669 pass.
- The server was not started.
