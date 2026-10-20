# The break (the hidden game) in the CRM — change log

Append-only. Each part records every file and line touched. Never rewrite an earlier section.
The game itself started on the landing page; its history up to the shared file is in `LOGIN_LANDING_CHANGES.md` Parts 39–40.

---

## Part 1 — 2026-10-20: the team's high score board on the server

**Asked for.** "Add this feature inside the CRM too", with the plan's two choices answered: the way in is **both** a faint
four-square block at the bottom of the sidebar **and** a "Quick break" entry found by typing in the Ctrl+K search (read as
those two, since both stay hidden; the user menu would show it to everyone), and the scoreboard is **per workspace**
("it would be fun"). Built one piece at a time, as the user prefers for new app features: this part is the server only; the
game in the app is Part 2, after a go.

### What it does
- **`break_scores`**: one row per person and workspace, their best game (score, lines, level, when). Removed with the workspace
  or the user. A score is never negative.
- **`GET /api/break-scores`**: the ten best of the caller's workspace, best first, an equal score keeping the earlier one ahead
  (the same rule the game's own `brkRank` uses), with names, and the caller's row marked `mine` so the game highlights it.
  Only current members: someone who leaves drops off the board (the join on `user_workspaces`) but keeps the row, so it is
  back if they return.
- **`POST /api/break-scores`** `{ score, lines, level }` after a finished game: kept only if it beats the caller's best
  (`ON CONFLICT … DO UPDATE … WHERE break_scores.score < EXCLUDED.score`), then answers with the board, which is exactly what
  the game's store `save()` returns.
- **Trust:** the score comes from the browser, so the route accepts only whole numbers in range (score 1–10,000,000, lines
  0–100,000, level 1–10,000), takes who and where from the session (never from the body), and sits behind its own rate limit
  (30 requests a minute per IP). It is a game among colleagues, not a ledger.
- Every parameter is bound, including the board size (`LIMIT $3`); every query filters on `req.workspaceId`.

### Files
| File | Lines | What |
|---|---|---|
| `routes/break-scores.js` | new, 76 | Header (scope, trust, endpoints); `wholeIn`; `board()` (the ten best, members only, `mine`, `at` in ms); `GET /`; `POST /` (checks, the keep-the-best upsert, the board back). |
| `db.js` | 685–698 | `CREATE TABLE IF NOT EXISTS break_scores` in `initDb` after the Engine request log: `workspace_id` and `user_id` with `ON DELETE CASCADE`, `score CHECK (score >= 0)`, `lines`, `level`, `updated_at`, `PRIMARY KEY (workspace_id, user_id)`. Created at the next start (nodemon restarts on this change). |
| `server.js` | 137–143 | `breakScoresLimiter`: 60 s, 30 requests, the app's `{ error }` shape. |
| | 211–212 | `app.use('/api/break-scores', breakScoresLimiter);` then the router, after `/api/analytics`. |
| `readmedev.md` | 335 | The route table: `/api/break-scores`. |
| | ~733–742 | A `### /api/break-scores` section: what it is, the two endpoints, the ranges, the limit. |
| `DATA_INFRASTRUCTURE.md` | 150–154 | A "The break" group in "the tables, by domain" with `break_scores`. (The "33 tables" counts in this doc and the README were already behind before this part; not touched.) |
| `tests/routes/break-scores.test.js` | new, 100 lines, 7 tests | GET: members only, workspace-scoped, ordering, bound limit, `mine`, the params `[7, 1, 10]`, the answer's shape; POST: the keep-the-best upsert and its params, the board read after the write, session over body, twelve refused bodies with nothing written, the caps allowed; the table's columns and keys; the limiter before the router, after the session, before the catch-all. |

### Verification
- The new suite against the tree before the route existed: **fails** (the route file is missing, every test cancelled). After:
  **7 pass, 0 fail**.
- `npm test` → **1423 pass, 0 fail**.
- Not run against a real database (no server or database is started from here): the SQL is plain Postgres (`ON CONFLICT … DO
  UPDATE … WHERE`, `LIMIT $3`) and is pinned word for word by the tests; the table is created by `initDb` at the next start.

### Next: Part 2, the game in the app (waiting for the go)
- `index.html` loads `/break-game.css` and `/js/break-game.js`; the game's `brk_*` words go into the app's `TRANSLATIONS`
  (German and English, so the i18n sweep holds).
- A team store: `load` = `GET /api/break-scores`, `save` = `POST /api/break-scores` with score, lines, level; `scope: 'team'`.
- `brkOpen({ t, player: the signed-in user's name, store })`.
- The ways in: a faint four-square block at the bottom of the sidebar, and a "Quick break" entry in the Ctrl+K search.

---

## Part 2 — 2026-10-20: the game inside the CRM

**Asked for.** "go" for the second piece of the plan in Part 1: the shared game in the app, played under the signed-in
user's name, saved to the workspace's board, with the two hidden ways in.

### What it does
- **Two hidden ways in.** Four faint squares under the user button at the foot of the sidebar (30 % opacity in the sidebar's
  dim text, light sky when reached, a real labelled button: "Quick break" / "Kurze Pause"); and the Ctrl+K palette, where a
  "Kurze Pause" entry appears only when one of these is typed: pause, break, spiel, game, tetris, blocks, blöcke (four
  letters at least, so "pau" or "gam" find nothing). Choosing it opens the game instead of a page.
- **The same game as the landing page,** from `public/js/break-game.js` and `public/break-game.css`: hold, the next piece,
  the shadow, levels, the points pop, pause, the high score board. No second copy.
- **The team's board.** The opener passes the signed-in user's name as the player and a store over `/api/break-scores`
  (Part 1): the board shows the workspace's ten best ("The whole team's high scores."), a finished game is saved without
  asking (the server keeps only a person's best), and the player's row is highlighted. The store sends only score, lines
  and level; the name and the workspace come from the session on the server. A refusal (a bad number, the rate limit) is not
  taken for a board.
- **The app's words.** The game's 31 `brk_*` words are in `TRANSLATIONS`, German and English, identical to the landing page's,
  so the language switch and the i18n sweep both hold.
- **Keys stay with the game.** While the game is open its dialog stops key events from reaching the page, so the app's Ctrl+K
  and `/` (and any other page shortcut) stay quiet behind it; Escape still closes the dialog.
- **Fresh tabs.** `break-game.css` joins the client fingerprint (`utils/app-version.js`), so a change to the game's look
  reloads open tabs like any other client change.

### Files
| File | Lines | What |
|---|---|---|
| `public/js/core.js` | 46 | The header's list of shell helpers names `openBreak`. |
| | 97–104 (en), 564–571 (de) | The game's words, after the palette's. |
| | 1572 | The palette's `run`: an entry with an `action` runs it, any other switches page. |
| | 1580–1585 | The palette's input: `if (breakPaletteMatch(term)) list = list.concat([{ label: t('brk_title'), icon: 'keyboard', action: openBreak }]);` |
| | 1589–1607 | The break: `BREAK_WORDS`, `breakPaletteMatch`, `breakTeamStore` (GET / POST `/api/break-scores`, scope `team`), `openBreak` (closes any popover, `brkOpen` with `t`/`tf`, the user's name, the team store). |
| `public/index.html` | 10 | `break-game.css` after `style.css`. |
| | 371–372 | The sidebar's foot: the four-square button under the user button, `onclick="openBreak()"`, `data-i18n-aria="brk_title"`. |
| | 1923 | `js/break-game.js` right after `js/core.js` (`detail-views.js` stays last, as its test requires). |
| `public/style.css` | 646–650 | `.brk-egg` (faint, centred, 28 × 20), its lit state in `--sky-400` (light sky on the navy sidebar in both themes), the focus ring, the icon. |
| `utils/app-version.js` | 22 | `'break-game.css'` in the fingerprinted files. |
| `public/js/break-game.js` | 343 | `e.stopPropagation()` first in the dialog's key handler. |
| `tests/client/break-app.test.js` | new, 77 lines, 7 tests | The files and the fingerprint; the sidebar button and its look; the palette's hidden entry, `run` and the words (eight that open it, six that do not); the store against a fake `api` (GET, POST with only the numbers, a refusal rejected); `openBreak`; every word the game asks for in `TRANSLATIONS`, equal to the landing page's; the key handler stopping propagation. |

### Verification
- The new suite before the change: **0 / 7**. After: **7 pass**. `npm test` → **1430 pass, 0 fail**.
- Found while wiring: `detail-views.test.js` requires `detail-views.js` to be the last script, so the game loads right after
  `core.js`; two test-side extractions fixed (the helper already returns `const …`).
- The game's own behaviour with a player and a team store (saved without asking, the row marked by the server, the team's
  wording) is played in a sandbox by `tests/client/break-game.test.js` (Part 40 of `LOGIN_LANDING_CHANGES.md`).
- Not seen in a browser and not run against a database: the button in the sidebar (light and dark, the collapsed rail), the
  palette entry, a real save to `/api/break-scores`.

### Please look at in the browser
- Sign in. At the foot of the sidebar, under your name, find the faint four squares; click them. Play a game to the end: the
  board shows the team's ten best with your row highlighted. Close, press Ctrl+K and type "pause": "Kurze Pause" appears;
  Enter opens the game where you left it. Switch the language and reopen: the game speaks it. A colleague in the same
  workspace who plays sees the same board.
