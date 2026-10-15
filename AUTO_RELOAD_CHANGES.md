# Self-reloading tabs — change log

Append-only. New work goes at the bottom as a new part. Earlier parts are never edited.

---

## Part 1 — 2026-10-13: an open tab reloads itself when the app changes on the server

**Request.** "can we do it automatically instead of the user needed to refresh the page?" (after a
change to the client scripts had to be picked up with a manual reload).

### What it does
- **The server fingerprints its client files** once at start-up: a SHA-1 over `public/index.html`,
  `public/style.css` and `public/js/*.js` in a fixed order, twelve hex characters. A restart without
  client changes keeps the value, so nobody's tab reloads for nothing; a deploy that changes any of
  those files changes it. `GET /api/version` answers it uncached, right before the SPA catch-all, and
  every authenticated socket hears it on connect (`app:version`).
- **Every tab watches it.** At boot the tab learns the fingerprint it was loaded with, then checks
  again on every socket connect (so a server restart is noticed within a second or two, because the
  socket reconnects), when the tab comes back into view, and once a minute as a fallback.
- **A changed fingerprint reloads the tab by itself**, as soon as the tab is visible and quiet: nobody
  typing in a field and no dialog open. Until then a toast "Eine neue Version der App ist da." with a
  "Neu laden" button stays, and the quiet check repeats every ten seconds; coming back to a hidden
  tab triggers the reload too. The reload fetches fresh files because HTML, CSS and JS are already
  served with `no-store`.

### Files and lines
| File | Lines | Change |
|---|---|---|
| `utils/app-version.js` | 1–35 | **New:** `clientFiles(root)`, `computeVersion(root)`, `APP_VERSION`. |
| `server.js` | 46 | The fingerprint required. |
| | 222–224 | `GET /api/version` (no-store), before the catch-all. |
| | 275 | `socket.emit('app:version', APP_VERSION)` after the membership check. |
| `public/js/core.js` | 1236–1264 | The watch: `appIsQuiet`, `noteAppVersion`, `checkAppVersion`, `appReloadWhenQuiet`, `startAppVersionWatch`. |
| | 154 (en), 602 (de) | `app_update_ready`, `app_update_reload`. |
| `public/js/auth.js` | 59 | `init()` starts the watch first thing. |
| `public/js/chat.js` | 157 | The socket hands the server's fingerprint to the watch. |
| `tests/unit/app-version.test.js` | 1–56 | **New, 4 tests:** the file set and order, stability, what changes it and what does not, the live value; server.js's route before the catch-all and the emit after auth. |
| `tests/client/app-version.test.js` | 1–38 | **New, 4 tests:** the quiet rule, the first-value rule and the single trigger, the reload-or-toast rule, the three triggers and the two keys. |
| `readmedev.md` | §4 Non-API paths | `/api/version`. |

### Verification
- `npm run test:client` → **833 pass**; `npm test` → **1360 tests, 1360 pass, 0 fail.**
- Not run: a real deploy. To see it: with the app open in a tab, change any file under `public/js`
  (the dev server restarts), and watch the tab reload on its own; with a dialog open, the toast
  appears instead and the tab reloads once the dialog is closed.

## Part 2 — 2026-10-13: a self-reload keeps drafts and comes back to the same page

**Request.** "if im running it and another user does in the website in a different workspace would it
be a problem?" Looking at what a reload costs another user turned up two gaps, closed here.

### What it does
- **Drafts are never thrown away.** A tab is not "quiet" while any note field (`textarea`) or the chat
  field (`input.chat-input`) holds text, even when the focus has left it, so a half-written note or
  message on a deal, a contact, the Activities page or the chat is never lost to a reload; the toast
  offers the reload instead and the tab reloads once the text is sent or cleared.
- **The reload comes back to the page that was open.** Before reloading, the tab remembers the active
  sidebar page in its own `sessionStorage` for five minutes; `showApp()` opens that page again after
  the reload. Every other entry into the app, a login or a workspace switch, still lands on a fresh
  Deals page, as before (the value is validated against the page list and used once).
- The fingerprint is one per server, not per workspace or user: a deploy reaches every tab on that
  server. A local dev server and the hosted site each have their own, so nothing crosses between them.

### Files and lines
| File | Lines | Change |
|---|---|---|
| `public/js/core.js` | 1236–1263 | `APP_PAGES`; `appIsQuiet` with the draft rule; `appRememberPage`, `appRestorePage`, `appReloadNow` (used by the automatic reload and the toast). |
| `public/js/auth.js` | 135 | `showApp()`: `switchPage(appRestorePage() || 'deals')`. |
| `tests/client/app-version.test.js` | the quiet and reload tests, +1 test | The draft rule; remember / restore / use-once, the page list against the sidebar, `showApp`. |
| `tests/client/auth-reset.test.js` | the Deals-landing test | Reworded and re-pinned: Deals on every entry, the open page after a self-reload. |

### Verification
- `npm run test:client` → **834 pass**; `npm test` → **1361 tests, 1361 pass, 0 fail.**
