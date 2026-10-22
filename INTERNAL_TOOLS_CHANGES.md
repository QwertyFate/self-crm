# Internal tools — change log

Append-only. Each part names every file and line it touched.

## Part 1 — 2026-10-21: the server side of /internal-tools (settings + transcribe relay)

**Asked:** a separate route `/internal-tools` for the internal team, with a tab that sends an audio file (MP3 or any
other) to the Notetaker's `POST http://localhost:8000/crm/transcribe` (`-F file=@call.mp3`, optionally
`?format=text`), and settings for it.

**Decided with the user:** the admin secret is the password (the admin console's own login, nothing new); the settings
live inside the tool, not in the database; clips are under five minutes, so one waiting request is enough; nothing is
stored. The user's note: "this is just some extra tool for the internal team" — kept small.

**What the Notetaker does** (read in `fathomtest/notetaker/api.py:383`, not changed): multipart field `file`, any audio
or video format, `?language=de` forces a language, `?format=text` answers plain text, otherwise JSON `{ filename,
language, duration_seconds, seconds_taken, model, text, segments[{start,end,text}] }`; 413 over
`NOTETAKER_MAX_UPLOAD_MB` (500), 422 unreadable, 401 without the Bearer token when `NOTETAKER_CRM_TOKEN` is set. It
answers only when Whisper is done (about 1 minute per 2.3 minutes of audio).

### New: `routes/internal-tools.js` (152 lines)
- Lines 1–27: header (gate, no database, the two jobs).
- Line 36: `router.use(requireAdmin)` — `middleware/admin-auth.js`: the console's session (`POST /api/admin/login`) or
  `X-Admin-Secret`; ADMIN_SECRET unset → 503.
- Lines 44–71: the settings file (`INTERNAL_TOOLS_FILE`, default `data/internal-tools.json`, written via a temp file +
  rename, mode 600); `defaultUrl()` derives the transcribe address from `NOTETAKER_URL` (`…/recordings` →
  `…/transcribe`, else `<origin>/crm/transcribe`); `current()` falls back to `NOTETAKER_CRM_TOKEN`; `shown()` never
  returns the token, only where it comes from (`saved` / `env` / `none`).
- Line 73: `GET /settings`.
- Lines 75–92: `PUT /settings` — http(s) address, language empty or `/^[a-z]{2,3}$/`, `maxMb` an integer 1–500; the
  token kept when not sent, removed with `clearToken`; a refusal writes nothing.
- Lines 94–100: `POST /settings/check` — `utils/notetaker.js health()` on the Notetaker's recordings list next to the
  transcribe address, with the token → `{ ok }` or `{ ok:false, reason: token | unreachable | error }`.
- Lines 102–150: `POST /transcribe` — one at a time (429 `busy`); multer in memory with the saved cap
  (`defParamCharset: 'utf8'` so German file names survive); `no_file` / `empty` / `too_large` refused before anything
  is sent; the language picked for the file or the saved one; JSON always asked for (the page makes plain text from
  it); 5-minute wait (`AbortSignal.timeout`); the Notetaker's 401 → 502 `token`, 413 → 413 `too_large`, 422 → 422
  `unreadable` + detail, other → 502 `notetaker` + status, network → 502 `unreachable`, timeout → 504 `timeout`; the
  answer cut to `{ filename, language, duration_seconds, seconds_taken, text, segments }`.

### Changed
- `server.js:240` — `app.use('/api/internal-tools', require('./routes/internal-tools'));` after the session middleware
  (so the console's login counts), next to the landing routes.
- `.env.example:23–26` — the same secret opens the tools; `# INTERNAL_TOOLS_FILE=data/internal-tools.json`.
- `.gitignore:65–66` — `data/internal-tools.json` (it can hold the Notetaker's token).

### Tests: new `tests/routes/internal-tools.test.js` (207 lines, 14 tests)
Written first; failed (no route) before `routes/internal-tools.js` existed; 14/14 after. The gate (401 without or
with a wrong secret, 503 with ADMIN_SECRET unset, nothing sent, no file written); defaults and the `.env` fallback;
the token never echoed; save / keep / clear; the field checks writing nothing; the connection check's address, token
and three answers; the forwarded file (name, type, bytes, a German file name), language and token; the refusals before
sending; every Notetaker answer mapped; one at a time; the wiring (mount after the session, git-ignore, `.env.example`).

Full suite: 1545 of 1546 pass. The one failure is `tests/client/landing-page-two.test.js`, from the landing page
rebuild the user stopped mid-way (it still pins the previous page); unrelated to this part.

### Not yet (next piece, after the user's go)
The page itself: `GET /internal-tools` serving its own HTML (password form → `POST /api/admin/login`, then the tabs
"Transkribieren" and "Einstellungen"), German and English, its own static client tests.

## Part 2 — 2026-10-21: the page at /internal-tools

**Asked:** "yes" to the next piece: the page itself.

**What it is:** a plain working page in the app's own look (it borrows `card`, `tabs`, `seg`, `field`, `btn`,
`help`, `error-text` … from `style.css`, light and dark as the app keeps them). Locked first: the password is the
ADMIN_SECRET, through the admin console's own `POST /api/admin/login` (one shared session flag, so unlocking here also
unlocks `/adminconsole` and "Sperren" locks both). Then two tabs:
- **Transkribieren:** choose or drop a file (audio or video), the language (as in the settings / detect / German /
  English), "Transkribieren starten" with the elapsed time, then the transcript with the file name and "Deutsch, 1:01
  Audio, in 28 Sekunden transkribiert", "Nur Text" / "Mit Zeitmarken" (`[0:59] …` per segment), "Kopieren", "Als .txt
  herunterladen" (the audio's name with .txt). Covers both of the user's curl lines: the page asks for JSON and makes
  plain text from it.
- **Einstellungen:** the Notetaker's address, the token (a password field, never filled; the hint says whether one is
  saved, comes from `.env`, or none; "Gespeicherten Token entfernen" when saved), the default language, the largest
  file in MB; "Speichern"; "Verbindung prüfen" (only on saved values: "Erst speichern, dann prüfen.").
- Every answer the server can give has its own sentence; a 401 or 503 at any point locks the page again with the
  reason. German and English (the app's `lang` key, saved only on a pick). Nothing from the server or a file name is
  written as HTML.

### New
- `public/internal-tools.html` (129 lines) — head: `noindex`, `style.css` then `internal-tools.css`, one script in the
  head (no defer, so the theme is set before the first paint); the bar (brand, DE/EN, "Sperren"); the gate form
  (`#it-gate`); the tools (`#it-tools`, hidden): tablist, `#it-panel-tr` (drop zone with a focusable hidden file input,
  language, start, status; the result card `#it-result`), `#it-panel-set` (the settings form).
- `public/internal-tools.css` (44 lines) — layout only, prefix `it-`, the app's tokens, no hex; the drop zone; the
  transcript `pre`; one breakpoint (600 px).
- `public/js/internal-tools.js` (429 lines) — `IT_I18N` (lines 10–142, de/en); the theme as core.js keeps it (lines
  144–150); pure helpers `itWord`, `itFill`, `itClock`, `itTranscript`, `itTxtName`, `itMb`, `itMeta`, `itLangField`,
  `itError` (lines 155–187); the page: `itApi` (195), `itSay` / `itFail` (205–215), `itSetLang` (217), the gate
  `itShowGate` / `itShowTools` / `itUnlock` / `itLockNow` (231–262), `itTab` with arrow keys (264), transcribe
  `itShowFile` / `itPick` / `itTranscribe` / `itShowResult` / `itCopy` / `itDownload` (275–339), settings
  `itShowToken` / `itFillSettings` / `itDirty` / `itLoadSettings` / `itSaveSettings` / `itCheck` (341–389), `itInit`
  (391).

### Changed
- `server.js:26` — the header's route list names `/internal-tools`.
- `server.js:258–260` — `app.get('/internal-tools', …)` serving `public/internal-tools.html`, before the catch-all.
- `readmedev.md:81` — the route map line for `GET /internal-tools`.

### Tests: new `tests/client/internal-tools.test.js` (183 lines, 22 tests)
Written first; failed (no page) before the files existed. The route and the document (head, locked first, the app's
`[hidden] … !important` kept, the tab pattern); the words (same keys, markup equal to German, no dead or unknown keys,
impersonal, translated, no em dash or middle dot); the helpers (clock, transcript plain and timed, the .txt name, size
and meta in both languages, the language sent with a file, every server answer's sentence and which ones lock); the
calls (login / me / logout, the settings body, the token only when typed, check only when saved, the file under
"file", the language only when picked; no `innerHTML` anywhere, one timer; the `lang` and `theme` keys); every id
exists; the stylesheet (the borrowed components exist in `style.css`, every own class used and ruled, scoped, no hex,
the file input focusable, never `display: none`).

Three first-run failures, all fixed: two were slips in the test (a key with a capital letter, `it_err_maxMb`, missed by
the key pattern; the page's own `it` class counted as borrowed), one a real slip (a class `it-result` with no rule,
removed from the markup).

### Verified end to end in jsdom (one-off, not in the suite; jsdom borrowed from crmclone2)
The real page with a fake server, 17 steps: locked on load; "Falsches Passwort." and the field emptied; unlocked with
the settings filled and the `.env` token hint; "Bitte zuerst eine Datei auswählen."; a picked file named with its size;
the request (file name, `language` empty for "detect"); "Fertig.", the title, the meta line, a transcript holding
`<b>` shown as text; timestamps; "Die Datei ist größer als 50 MB." with no language sent for "as in the settings";
English throughout; the tabs; "Erst speichern, dann prüfen."; saving (token trimmed, size as a number) with the hint
switching to "gespeichert" and the clear box shown; the check's token answer; a bad address refused; an expired session
back to the gate with the reason; "Sperren"; a second visit with the session already in going straight to the tools,
dark when the system is.
This run caught one real bug the static tests had pinned in the wrong form: the settings form was read as `f.url`,
`f.token` … (a browser shortcut jsdom lacks and a fragile one); now `f.elements.url` …, and the suite forbids the
shortcut.

Not checked here (no browser on this machine, per the standing rule): dragging a file onto the drop zone, the
clipboard, the actual .txt download.

Full suite: 1567 of 1568 pass; the one failure is still `tests/client/landing-page-two.test.js` (the stopped landing
page rebuild).

## Part 3 — 2026-10-21: separate from the CRM, at a fixed secret path

**Asked:** "this tool doesnt have any relative to the crm this is a separate just in a secret route". Choices the user
made: a **fixed** secret path in the code (not from .env); the password stays the **ADMIN_SECRET's value but not
shared** with the admin console (no CRM session either); its **own look**; its **own Notetaker settings** (no fallback
to the CRM's `NOTETAKER_*`). The CRM docs keep their mention (not chosen for removal).

**What changed:** the tool moved into its own folder and is mounted once. Nothing of it is in `public/` any more, so
without the path there is nothing to find. It uses no CRM session, login, database, setting, stylesheet, font or image.

### Removed (Parts 1–2's files; never committed)
- `routes/internal-tools.js`, `public/internal-tools.html`, `public/internal-tools.css`, `public/js/internal-tools.js`.

### New
- `internal-tools/index.js` (195 lines) — one Express router:
  - `GET /` the page (redirects to the trailing slash so the page's relative links stay under the path),
    `tools.css` / `tools.js` from `internal-tools/page/`, all `Cache-Control: no-store`.
  - `/api/*` behind its own gate: `X-Tools-Secret` compared in constant time with ADMIN_SECRET (unset → 503 `off`,
    wrong → 401 `password`); the admin console's `X-Admin-Secret` and session are NOT accepted. Wrong passwords
    limited: 20 per 15 minutes per IP (`express-rate-limit`, only 401s count) → 429 `too_many`.
  - `POST /api/unlock` (204), `GET|PUT /api/settings`, `POST /api/settings/check`, `POST /api/transcribe` — as in
    Part 1, except: defaults are its own (`http://localhost:8000/crm/transcribe`, 50 MB, no token; the CRM's
    `NOTETAKER_URL` / `NOTETAKER_CRM_TOKEN` are not read); the token shows as `saved` / `none` only; the connection
    check is its own small probe (no `utils/notetaker.js`).
- `internal-tools/page/index.html` (129 lines) — same two tabs as Part 2; `noindex`, `no-referrer` (the path stays out
  of other sites' logs), a blank favicon (no request for the CRM's), one stylesheet and one deferred script by relative
  links; no link back to the CRM; "Nur für das Team."
- `internal-tools/page/tools.css` (125 lines) — its own plain look: system font, neutral greys, one blue accent, light
  or dark from the system (`prefers-color-scheme`); own reset incl. `html.it-root [hidden] { display: none !important; }`;
  card, buttons, toggles, tabs, fields, drop zone, transcript. Hex only as `--it-*` tokens on `html.it-root`.
- `internal-tools/page/tools.js` (422 lines) — Part 2's script, changed: every call relative (`api/…`) with the
  password in `X-Tools-Secret`; the password kept only in the tab's memory (`itSecret`), set on a right answer,
  forgotten on "Sperren", a 401, a 503 or 429 `too_many`; reloading asks again; the language remembered under its own
  key `internal-tools-lang`; no theme code (the CSS follows the system); no `.env` hint for the token; new sentences
  `it_err_too_many`, `it_err_expired` reworded ("Das Passwort gilt nicht mehr.").

### Changed
- `server.js:182–186` — `const INTERNAL_TOOLS_PATH = '/abec51839ff2263df763d138';` and
  `app.use(INTERNAL_TOOLS_PATH, require('./internal-tools'));`, placed after `express.json()` and **before the CRM's
  session middleware**, so its requests never read or write the CRM's sessions (or their table). The Part 1–2 lines
  (`/api/internal-tools` mount, `GET /internal-tools`) are gone.
- `server.js:26` — the header's route list names `INTERNAL_TOOLS_PATH`.
- `readmedev.md:81` — the route map line now describes the secret path by its constant name (the value is only in
  `server.js`).
- `.env.example:23–27` — ADMIN_SECRET's value is also the tools' password; unlocking them opens nothing else;
  `# INTERNAL_TOOLS_FILE=data/internal-tools.json`.
- `.gitignore:65` — the comment names `internal-tools/index.js`.

### Tests
- `tests/routes/internal-tools.test.js` (250 lines, 19 tests, rewritten): the page only under the path (redirect,
  page, files, no-store) and none of its files in `public/`; the password (missing, wrong and the console's header all
  401, nothing sent or written; 204 when right; 503 without ADMIN_SECRET; 20 wrong → 429, right ones never counted);
  the settings ignore the CRM's `NOTETAKER_*`; save / keep / clear; field checks; the connection check (ok, token,
  not the Notetaker, unreachable); the transcription cases of Part 1; wiring (a 24-hex fixed path, mounted once, before
  the session and the catch-all, after the JSON parser, no `/internal-tools` left; the module requires nothing of the
  CRM; the page asks nothing of the CRM).
  **Mutation checks** (each change made by hand, the suite run, the file restored from a copy): accepting the
  console's `X-Admin-Secret` → 1 failure; counting right passwords toward the limit → 10 failures. The second first
  hung (the "one at a time" test waited without bound for a request the limiter blocked); that wait now gives up after
  2 s with a failure.
- `tests/client/internal-tools.test.js` (186 lines, 20 tests, rewritten for `internal-tools/page/`): the document
  (relative links only, one stylesheet, `no-referrer`); words (no "CRM", "Upgrads" or ".env" in them); the helpers incl.
  `too_many`; the calls (relative, with the password, no `/api/admin` or `/api/auth`); the password only in memory (no
  sessionStorage, cookie or IndexedDB; localStorage only for `internal-tools-lang`); its own stylesheet (every class its
  own and ruled, scoped, hex only as `--it-*` tokens, dark from the system, no `var()` from anywhere else).

### Verified end to end (one-off, jsdom borrowed from crmclone2)
The real page in jsdom against the real router on a real port, only the Notetaker faked, with the CRM's
`NOTETAKER_URL` and `NOTETAKER_CRM_TOKEN` deliberately set: locked on load with no request made; "Falsches Passwort.";
unlocked, the settings showing the tool's own defaults and "Kein Token" (the CRM's values ignored); a transcription
reached the fake Notetaker with the German file name and no token; a transcript containing `<img … onerror>` shown as
text, no element created; the token saved to the file; the check sent `Bearer nt-tok` to `…/crm/recordings`; all six
API calls after unlocking carried the password; after "Sperren" a call without it got 401. (The harness's first run
failed at the upload because jsdom's `File` has no `.text()`; read with `FileReader` instead. Not a page bug.)

Not checked without a browser: dragging a file onto the drop zone, the clipboard, the .txt download.

Full suite: 1570 of 1571 pass; the one failure is still `tests/client/landing-page-two.test.js` (the stopped landing
page rebuild).

## Part 4 — 2026-10-21: the settings removed

**Asked:** "what are these setting i think it kinda confused the user instead of helping them is this really
necessary?" Checked the Notetaker's own `.env` (`fathomtest/.env`): no `NOTETAKER_CRM_TOKEN`, no
`NOTETAKER_MAX_UPLOAD_MB`, host and port at their defaults (127.0.0.1:8000). So every setting sat at a value nobody
would change: the address (always localhost:8000), the token (not required), the default language (the upload has its
own choice), the size cap (a five-minute clip is about 5 MB as MP3, at most about 50 MB as WAV), the connection check
(a failed transcription already says the Notetaker cannot be reached). The user: "yes i think for now delete the
settings".

**Now:** one screen after unlocking: choose or drop a file, the language (Automatisch erkennen first, Deutsch,
Englisch), "Transkribieren starten", the transcript (plain or with timestamps, copy, .txt). The Notetaker is at
`http://localhost:8000/crm/transcribe` without a token; only if that ever changes, two optional `.env` lines (never
shown on the page). The file cap is a fixed 100 MB. No settings file was ever written on this machine (`data/` does
not exist), so nothing to delete on disk.

### Changed
- `internal-tools/index.js` (rewritten, 140 lines) — removed the settings file (`fs`, `INTERNAL_TOOLS_FILE`,
  `readSaved` / `writeSaved` / `current` / `shown`), `GET|PUT /api/settings`, `POST /api/settings/check` and its probe.
  Added `notetaker()`: `INTERNAL_TOOLS_TRANSCRIBE_URL` (default `http://localhost:8000/crm/transcribe`) and
  `INTERNAL_TOOLS_TRANSCRIBE_TOKEN` (default none); a broken address → 500 `config`, nothing sent. `MAX_MB = 100`, one
  multer instance. The language: none or empty → detect; a code passed on; anything else 400. New: a 404 for anything
  else under the secret path (API and page), so nothing there ever falls through to the CRM.
- `internal-tools/page/index.html` — the tablist and the settings panel removed; the transcribe form is the screen
  (heading "Audio transkribieren"); the language list without "Wie in den Einstellungen".
- `internal-tools/page/tools.js` (293 lines) — removed the tab code, the settings code (`itShowToken`,
  `itFillSettings`, `itDirty`, `itLoadSettings`, `itSaveSettings`, `itCheck`, `itLoaded`) and `itLangField`; `itApi`
  takes no body; the language is sent only when one is picked; after unlocking the file field has the focus. Words: 25
  settings/tab keys removed from both languages, `it_tr_t` added, `it_err_token` and `it_err_unreachable` no longer
  point to the settings ("Der Notetaker ist nicht erreichbar. Läuft er?").
- `internal-tools/page/tools.css` (118 lines) — the tab, field-row, check-box and url/number field rules removed.
- `.env.example:23–28` — `# INTERNAL_TOOLS_FILE=…` replaced by `# INTERNAL_TOOLS_TRANSCRIBE_URL=http://localhost:8000/crm/transcribe`
  and `# INTERNAL_TOOLS_TRANSCRIBE_TOKEN=`, "only if that ever changes".
- `.gitignore` — the `data/internal-tools.json` entry and its comment removed (the file ends as before Part 1).
- `readmedev.md:81` — "no settings, no database".

### Tests
- `tests/routes/internal-tools.test.js` (21 tests, rewritten): as Part 3, plus: anything else under the path is a
  404 from the tool and nothing reaches what is mounted after it; the settings routes answer 404; the CRM's
  `NOTETAKER_*` never read; the two `.env` lines used (trimmed); a broken address → 500, nothing sent; no settings file
  code left; the language rules; a real upload of 100 MB + 1 byte → 413 `too_large` (`maxMb: 100`), nothing sent;
  `.env.example` and `.gitignore` without the settings file.
- `tests/client/internal-tools.test.js` (18 tests): one screen (two forms only, the language list, no tabs or
  settings words, no `api/settings`); the error sentences for `language` and `config` fall back to the general one;
  `api/unlock` with the password; the language only when picked; the focus after unlocking.
- Verified once more in jsdom, the real page against the real router (only the Notetaker faked, the CRM's
  `NOTETAKER_*` set on purpose): locked, wrong password, unlocked (one call), a transcription with the German file
  name to `localhost:8000` without a token, the hostile transcript shown as text, one screen with the three languages,
  "Englisch" picked → `?language=en`, every call with the password, 401 after "Sperren".

Full suite: 1570 of 1571 pass; the one failure is still `tests/client/landing-page-two.test.js` (the stopped landing
page rebuild).
