# The Notetaker (recording bot for Google Meet) — change log

Append-only. Each part records every file and line touched. Never rewrite an earlier section.

---

## Part 1 — 2026-10-20: "Mit Notetaker aufzeichnen" when booking a Google Meet from a deal

**Asked for.** "I have a recording bot for Meet; add a checkbox in the deal when creating a meeting with Google Meet."
The service's contract as given: `POST http://localhost:8000/crm/recordings`, `Content-Type: application/json`, and
`Authorization: Bearer <token>` only when `NOTETAKER_CRM_TOKEN` is set ("make it a default without it"); the sample
payload (meeting_url, callback_url, join_at with a zone, external_id, metadata, bot_name, max_minutes, include_notes,
chat_message); the answers 202 scheduled / queued with a job id, 200 updated (an external_id sent before), 200 duplicate
(a bot already booked), 400 (bad link, no zone, callback not on localhost), 401 (wrong token).

### How it works
- **The box.** In the Cal.com booking dialog (opened from a deal, and from a contact: it is the same dialog), a check
  "Mit Notetaker aufzeichnen" / "Record with Notetaker" appears under the type and the place, only when the place is Google
  Meet and only when booking (not when moving a meeting). Unticked until someone ticks it: recording people is a choice. A
  help line says what the bot does; the summary adds "mit Notetaker".
- **Why the send is not only at booking.** Cal.com often answers a Google Meet booking with just the app's name
  (`integrations:google:meet`); the real Meet link arrives with the BOOKING_CREATED webhook a moment later, on the same
  activity. So the request is remembered with the meeting (`notetaker_recordings`, one row per meeting, external_id
  `crm-meeting-<activity id>`), and one function, `notetakerSync`, sends the bot the first time a Meet link is known. It
  runs after the booking, after both webhooks that can change a meeting (created, rescheduled) and after a reschedule from
  the CRM. It sends again only when the link or the start changed (same external_id, so the service answers "updated");
  a redelivery that changes nothing sends nothing; a cancelled meeting is never sent; a failed send is tried again on the
  next delivery.
- **The payload,** exactly the sample's shape: the Meet link (query dropped), the callback, the start as the host's wall
  clock with its offset (`2026-10-21T14:00:00+02:00`, from the activity's date, time and zone), `crm-meeting-<id>`,
  metadata `{ workspace_id, activity_id, deal_id, contact_id, user_id }` (the CRM's ids as strings; user = who booked),
  bot_name "Notetaker", max_minutes 120, include_notes true, and the chat message: the sample's German text, or an English
  one when the booking was made in English.
- **Settings** (all optional, `.env.example`): `NOTETAKER_URL` (default `http://localhost:8000/crm/recordings`),
  `NOTETAKER_CRM_TOKEN` (no header while empty), `NOTETAKER_CALLBACK_URL` (default `http://localhost:<PORT>/api/notetaker/webhook`).
- **Never in the way.** The service down, silent (10 s) or refusing: the booking and the webhook still succeed; the reason
  is kept on the row (`status 'failed'`, HTTP status, error) and shown as one line after booking.
- **The answer after booking:** "Notetaker ist zum Start des Meetings eingeplant." (scheduled), "… geht jetzt ins Meeting."
  (queued), "… hat die neue Zeit." (updated), "Für dieses Meeting ist schon ein Notetaker gebucht." (duplicate),
  "… kommt dazu, sobald Cal.com den Meet-Link schickt." (waiting for the link), or "Notetaker nicht eingeplant: <reason>".

### Files
| File | Lines | What |
|---|---|---|
| `utils/notetaker.js` | new, 130 | `config()` (the three settings, read at call time), `meetUrlOf`, `isoWithOffset`, `externalIdFor`, `payload`, `interpret` (each answer), `send` (never throws; Bearer only with a token; 10 s timeout), the two chat messages. |
| `routes/integrations.js` | 75 | `require('../utils/notetaker')`. |
| | 639–689 | The Notetaker section: `NOTETAKER_SENT`, `isMeetLocation`, `notetakerSync` (read the request with its meeting, skip a cancelled one or one without a Meet link, the start with its offset, skip when nothing changed, send, keep the answer), `notetakerSafe` (never fails the caller), `notetakerRequest` (remember the box, then sync). |
| | 734–735 | Receiver, BOOKING_RESCHEDULED: sync after the move (the new time and link, same external_id). |
| | 762–763 | Receiver, BOOKING_CREATED (and redeliveries): sync, so a link that only arrives now sends the bot. |
| | 853–854 | Booking: `record: true` with any place but Google Meet is a 400 before Cal.com is asked. |
| | 900–908 | Booking: remember and sync after the entry is written; `notetaker` in the log and in the answer (null without the box). |
| | 982, 989 | Reschedule from the CRM: sync after the move; `notetaker` in the answer. |
| `db.js` | 700–725 | `notetaker_recordings` in `initDb`: workspace, `activity_id UNIQUE` (cascade with the meeting), `requested_by`, `external_id UNIQUE`, language, the last sent link and start, `status DEFAULT 'waiting_link'`, job id, HTTP status, error, timestamps. Created at the next start. |
| `.env.example` | 52–60 | The Notetaker block: the three settings, commented, with their defaults. |
| `public/js/detail-views.js` | 255–262 | `dvNotetakerToast`: the answer as one line. |
| | 278 | The dialog's state: `record: false`. |
| | 301–302 | `isMeet` (the integration `google-meet`). |
| | 316–317 | `rec`: the check and its help line, Google Meet and booking only. |
| | 334 | The summary: "mit Notetaker" when ticked. |
| | 339 | The box under the type and the place (`${what}${rec}${when}`). |
| | 373–374 | The place change redraws (so the box comes and goes); the box's change. |
| | 385 | The booking request: `record: !!(B.record && isMeet(place))`. |
| | 391 | After booking: `if (res.notetaker) dvNotetakerToast(res.notetaker);` |
| `public/js/core.js` | 551–552 (en), 1020–1021 (de) | `cal_book_record`, `cal_book_record_help`, `cal_book_record_short`, `cal_rec_scheduled / queued / updated / duplicate / waiting / failed`. |
| `tests/unit/notetaker.test.js` | new, 105 lines, 9 tests | Meet links accepted and refused; offsets (Berlin summer and winter, New York, UTC, Kolkata +05:30, bad zone); the payload equal to the sample; English chat; the callback from PORT and the setting; the address; each answer; Bearer only with a token; down, silent and non-JSON answers. |
| `tests/routes/notetaker-booking.test.js` | new, 213 lines, 9 tests | Booking with the box when Cal.com's answer has the link (the exact payload, the row, the answer); without a link (waits, the webhook sends, a redelivery does not); a moved meeting (same external_id, "updated"), a cancelled one (nothing); another place refused before Cal.com; without the box nothing anywhere; the service down (booking fine, failed kept, retried on the next delivery); the token header; the table; `.env.example`. |
| `tests/client/notetaker-ui.test.js` | new, 51 lines, 5 tests | The box unticked, Google Meet only, booking only, under type and place; the summary; the request; the answer line for each status; the words in both languages. |
| `tests/client/calcom-settings.test.js` | 150, 166, 186, 191, and the toast pin | Five pins of the existing dialog test updated for the box: the state line (`record: false`), the order (`${rec}`), the place change that now redraws, the request's `record`, the answer line after the booking toast. |

### Verification
- The three new suites against the code before the change: unit **fails at load** (no `utils/notetaker.js`), route **0 / 9**,
  dialog **0 / 5**. After: **9 / 9, 9 / 9, 5 / 5**. `npm test` → **1453 pass, 0 fail**.
- Not run against the real Notetaker or Cal.com from here (no server is started): the payload, the headers and the answers
  are pinned to the contract given; the Meet link's arrival is pinned to the webhook shape the receiver already reads
  (`videoCallData.url`).

### Not built yet (needs the user's answers)
- **The callback.** `callback_url` points at `/api/notetaker/webhook`, which does not exist yet, so the service's reports
  get a 404. Needed: what the service sends there (fields, when) and how it proves it is the Notetaker.
- **Cancelling the bot.** A cancelled meeting is never sent, but a bot already booked is not called off: the contract has no
  cancel call. Needed: the service's way to cancel by external_id, if it has one.
- **The status on the meeting.** The answer shows once after booking; the meeting entry itself does not show "recorded" yet.

---

## Part 2 — 2026-10-20: the notes come back by themselves and land on the deal

**Asked for.** "When getting a note that comes from the request, make it background work instead of the user waiting
for a response; include in the request a link that automatically adds the note to the specific deal that is having
the meeting."

**What the Notetaker already does** (read from its source, `fathomtest/notetaker/webhooks.py`, `api.py`, README "CRM
route"): when a job ends it POSTs one JSON document to the job's `callback_url` from a background thread, retrying after
5 s, 30 s, 2 min and 10 min; `event` is `recording.completed` (transcript and Claude's notes inline: title, language,
summary, key_points, decisions, action_items {task, owner, due}, open_questions; or their errors) or `recording.failed`
(no audio, with the reason); headers `X-Notetaker-Event`, `-Delivery`, `-Timestamp`, and `X-Notetaker-Signature:
sha256=<HMAC of "<timestamp>.<raw body>">` when `NOTETAKER_WEBHOOK_SECRET` is set in its .env; callback hosts limited to
localhost by default (a path after the host is fine). So the CRM does not poll: it only needs a link per meeting.

### How it works
- **The link.** Every recorded meeting gets its own secret result link, `<NOTETAKER_CALLBACK_URL>/<48 hex>`
  (`notetaker_recordings.callback_token`, made when the box is ticked), sent as `callback_url`. The link alone decides
  the workspace, the meeting, the deal and the contact; the metadata the Notetaker echoes back is never used for them.
- **The receiver,** `POST /api/notetaker/webhook/:token` (new `routes/notetaker.js`), public on purpose like the Cal.com
  receiver. A malformed link is a 404 before the database is asked; an unknown one a 404; with
  `NOTETAKER_WEBHOOK_SECRET` set in the CRM's .env (same value as the Notetaker's) the signature is required (five
  minutes' tolerance); a result naming another meeting's external_id is a 400; raw bytes up to 5 MB (the result carries
  the whole transcript), the inbound limit per IP and 30 a minute per link.
- **The note.** `recording.completed` → a note on the meeting's deal and contact: the notes' title, summary, and under
  "Wichtige Punkte / Entscheidungen / Aufgaben / Offene Fragen" (English headings for English notes) each list as
  bullets, action items as "task (owner), bis due"; empty lists left out; without notes, "Notetaker hat das Meeting
  aufgenommen, aber keine Notizen geschrieben. Grund: …"; a partial recording ends with "Hinweis: …".
  `recording.failed` → "Notetaker konnte das Meeting nicht aufnehmen. Grund: …". Other events: 200 `{ ignored: true }`.
  The transcript itself is not stored in the CRM.
- **Once only.** The first delivery claims the row (`finished_at`) in the same SQL statement that writes the note, so a
  retry or a redelivery is answered `{ already: true }` and writes nothing. A meeting whose result has come is never
  sent to the Notetaker again (a late Cal.com redelivery cannot book a second bot).
- **Who wrote it.** The note has no author and `source 'notetaker'` (the CHECK now allows it); the timelines sign it
  "Notetaker", the way Engine notes are signed "Upgrads Engine". Any member can edit or delete it, as any note.
- **Who is told.** The person who ticked the box gets one bell notification: "Notetaker-Notizen sind da" (📝) with the
  meeting's title and the notes' title, or "Notetaker konnte nicht aufnehmen" (⚠️) with the reason; it opens the deal,
  else the contact. Nobody waits on a screen; the bell is how they learn the notes are there.
- **Rows from Part 1** (booked before this change, without a link) get one on their next sync and are sent once more,
  so the Notetaker's job learns the link (it answers "updated").
- **Correction to Part 1's "not built yet":** the Notetaker does have a cancel call, `DELETE /crm/recordings/{id}`
  (cancels a scheduled bot, sends no callback). Calling it when a meeting is cancelled in the CRM is not built.

### Files
| File | Lines | What |
|---|---|---|
| `utils/notetaker.js` | 25–33 | Header: the way back. |
| | 37 | `require('crypto')`. |
| | 56 | `config().webhookSecret` from `NOTETAKER_WEBHOOK_SECRET` (null when empty). |
| | 60–66 | `newCallbackToken()` (24 random bytes as hex), `callbackUrlFor(token)` (the link under the callback address). |
| | 91, 94 | `payload()` takes `callbackToken`; `callback_url` is the meeting's link. |
| | 146–157 | `verifySignature(raw, timestamp, signature, secret)`: the Notetaker's scheme, five minutes, constant time. |
| | 159–213 | `NOTE_WORDS` (de / en), `resultNote(body, fallbackLang)`: the note text, kind and reason from a result. |
| | 215 | Exports. |
| `routes/notetaker.js` | new, 96 | The public receiver `POST /webhook/:token`: link check, signature, JSON, external_id, the claim-and-note statement, the note's id on the row, the bell for the booker. |
| `server.js` | 129–137 | `notetakerLinkLimiter` (30 a minute per link). |
| | 161–164 | Raw bytes up to 5 MB on `/api/notetaker/webhook`, before `express.json()`. |
| | 228–229 | The inbound IP limit and the link limit, then the router at `/api/notetaker`. |
| `db.js` | 658 | `activities_source_check` allows `'notetaker'`. |
| | 723–728 | `notetaker_recordings`: `callback_token TEXT UNIQUE`, `note_activity_id INTEGER`, `finished_at TIMESTAMPTZ` (ALTER … IF NOT EXISTS, so a table made by Part 1 gets them at the next start). |
| `routes/integrations.js` | 646–650 | Comment: the result link, no resend after the result, rows from before. |
| | 654 | The sync reads `callback_token`, `finished_at`. |
| | 662 | No send once the result has come. |
| | 668–675 | "Nothing changed" now also needs the link; a row without one gets it atomically (`COALESCE`). |
| | 679 | The payload carries the link. |
| | 690–695 | The booking's insert makes the link. |
| `routes/activities.js` | 139, 191 | The author label: `WHEN a.source = 'notetaker' THEN 'Notetaker'`. |
| `routes/contacts.js` | 194 | The same. |
| `public/js/notifications.js` | 40–41, 45 | Icons and kinds `notetaker_done` (📝), `notetaker_failed` (⚠️). |
| `public/js/core.js` | 350 (en), 820 (de) | `notif_notetaker_done`, `notif_notetaker_failed`. |
| `.env.example` | 56–64 | The callback line explains the per-meeting link; `NOTETAKER_WEBHOOK_SECRET` added (recommended). |
| `tests/unit/notetaker-callback.test.js` | new, 105 lines, 12 tests | The link; the request's callback_url; the secret setting; the signature (right, wrong secret, changed body, missing, stale, at the edge); the note (German, English headings, no notes with the reason, partial, failed, ignored events, odd shapes and the length cap). |
| `tests/routes/notetaker-webhook.test.js` | new, 202 lines, 17 tests | The note on the deal and contact from the link's meeting, never the body's ids; one note on redelivery; failed; contact-only meeting; booker gone; a 2 MB result; other events; unknown and malformed links (no query); another meeting's result; not JSON; the signature with the secret set; the wiring in server.js, the router public, db.js, the author label, the bell, `.env.example`. |
| `tests/routes/notetaker-booking.test.js` | 9–10, 62–70, 135–137, 141, 147, 196–215 | The fake pool knows the link; the booking makes one and sends it as callback_url; a Part 1 row gets one and is sent again once; no send after the result. |
| `tests/client/calcom-settings.test.js` | 288 | The bell kinds line now includes the Notetaker's two. |
| `tests/routes/engine-note-author.test.js` | 24–25 | The author label pin includes the Notetaker. |
| `tests/unit/db-engine-schema.test.js` | 135, 138 | The source CHECK pin includes `'notetaker'`. |

### Verification
- Before the change: `notetaker-callback.test.js` **0 / 12**, `notetaker-webhook.test.js` **fails at load** (no route).
  After: **12 / 12**, **17 / 17**; the booking suite **11 / 11**. `npm test` → **1484 pass, 0 fail**.
- The new SQL on a real Postgres (a throwaway cluster in the scratchpad, stopped and deleted after): the three ALTERs run
  twice without error; the link `COALESCE` keeps the first link; the claim-and-note statement writes the note once and
  nothing the second time; the note row is `source 'notetaker'`, no author, the meeting's deal and contact.
- A result signed by the Notetaker's own `webhooks.sign()` (its venv, Python) passes `verifySignature`; the same with
  another secret fails.
- Not run end to end against a live Notetaker and a live meeting (no server is started from here).

### Not built yet
- **Cancelling the bot** when the meeting is cancelled in the CRM or on Cal.com: `DELETE /crm/recordings/{job_id}`.
- **The meeting entry's own status** ("wird aufgezeichnet" / "Notizen da"): only the bell and the note say it.
- **Action items as CRM tasks:** they are bullets in the note.

---

## Part 3 — 2026-10-21: the box is offered only when the Notetaker is ready

**Asked for.** "Before having the checkbox for the recording bot in the meeting dialog, the CRM checks that the bot is
available and healthy, so that it won't receive an error which stops the CRM code from running."

**Already true before this part:** a Notetaker that is down or broken never stopped the CRM. `send()` never throws and
gives up after 10 seconds, every caller catches, and a booking always completes (the request is kept as `failed` and
tried again on the next Cal.com delivery). What was missing is not offering the box when the Notetaker cannot take it.

### How it works
- **The probe.** The Notetaker has no health route (its routes, read from `fathomtest/notetaker/api.py`: `/record`,
  `/recordings…`, `/crm/recordings…`). The CRM uses its documented listing, filtered to an id no meeting has:
  `GET <NOTETAKER_URL>?external_id=crm-health-check`, with `Authorization: Bearer <token>` when the CRM has one. A JSON
  list back = up and the token accepted (the same check guards every `/crm/*` call). 401 = the token. Any other answer
  (another server on that port, an HTML page, a 5xx, a 404) = error. No connection, or no answer in 3 seconds =
  unreachable. Never throws.
- **The route.** `GET /api/integrations/notetaker/health` (any signed-in member): `{ available: true }` or
  `{ available: false, reason: unreachable | token | error }`. The answer is kept 15 seconds, so opening dialogs does
  not hammer the Notetaker; `?fresh=1` asks at once.
- **The dialog.** The first time Google Meet is the place (on opening, after a type change, after a place change), the
  dialog asks quietly (no loading bar, never a throw). Meanwhile the box is greyed out with "Checking whether Notetaker
  is ready…". Yes: the box can be ticked, with the usual help line. No: the box stays greyed out and the line says why,
  "Notetaker is not reachable right now, so this meeting cannot be recorded." / "Notetaker refused the CRM's access
  token. An admin can check NOTETAKER_CRM_TOKEN." / "Notetaker reported a problem, so this meeting cannot be recorded.",
  with a "Check again" button. The booking only asks for a recording when the answer was yes; a no unticks the box.
- **What the probe cannot see:** whether the bot's Google login is still valid, whether the Whisper model is there,
  whether the Claude key works. Only the Notetaker knows those; a `GET /crm/health` in the Notetaker reporting them would
  let the CRM show them too. Not built (the Notetaker app was not changed).

### Files
| File | Lines | What |
|---|---|---|
| `utils/notetaker.js` | 146–172 | `health()`: the probe, its reading of the answer, 3 s timeout. |
| | 242 | Export `health`. |
| `routes/integrations.js` | 59 | Header: the endpoint. |
| | 701–717 | `GET /notetaker/health` (requireAuth), the 15 s cache, `?fresh=1`, never fails. |
| `public/js/detail-views.js` | 278 | The dialog's state: `nt: 'idle', ntWhy: ''`. |
| | 303–304 | `NT_DOWN`: the reason → its line. |
| | 318–324 | The box: greyed out unless the answer was yes; the line (help, checking, or why + Check again), announced politely. |
| | 341 | The summary's "with Notetaker" only after a yes. |
| | 345–346 | End of `render()`: ask the first time Google Meet is the place. |
| | 348–357 | `checkNotetaker(fresh)`. |
| | 394 | "Check again". |
| | 405 | The booking asks for a recording only after a yes. |
| `public/js/core.js` | 554 (en), 1025 (de) | `cal_rec_checking`, `cal_rec_down_unreachable`, `cal_rec_down_token`, `cal_rec_down_error`, `cal_rec_recheck`. |
| `public/style.css` | 499 | A greyed-out check: muted label, not-allowed cursor, half-opaque box. |
| `tests/unit/notetaker-health.test.js` | new, 63 lines, 6 tests | The probe's address, method, headers and timeout signal; the token and NOTETAKER_URL; 401; 5xx, 404, a non-list 200; no connection and timeout; a broken address without a request. |
| `tests/routes/notetaker-booking.test.js` | 86–94, 225–245 | The fake network counts probes; the route: available, the 15 s cache, `fresh=1`; unreachable and token; behind the login check. |
| `tests/client/notetaker-ui.test.js` | 1–5, 17–45, 49–52, 60–73 | The state, the greyed-out box and its three lines, Check again, when the dialog asks and how, the summary and the request after a yes, the five words in both languages, the greyed-out style. |
| `tests/client/calcom-settings.test.js` | 150, 191 | The dialog's state and request pins include the health answer. |

### Verification
- Before the change: health unit **0 / 6**; booking route **11 / 14** (the 3 health tests fail); dialog **1 / 7**.
  After: **6 / 6, 14 / 14, 7 / 7**. `npm test` → **1495 pass, 0 fail**.
- The real probe with the CRM's own .env against this Mac (the Notetaker was not running):
  `{"available":false,"reason":"unreachable"}` in 29 ms. Not tried against a running Notetaker (it was not started).

---

## Part 4 — 2026-10-21: the request stuck at "waiting_link"; the Meet link fetched from Cal.com

**Asked for.** "Before you send a request to the Notetaker, can we wait for the Cal.com Google Meet link so you can pass
it to the Notetaker? Right now it's stuck in waiting link because you sent a request to the Notetaker before Cal.com."

**What the database showed** (read-only): one request, meeting 41, `waiting_link`, never sent. Its entry already held
the Google Meet link, and the booking log shows the link was in Cal.com's answer at booking. No `BOOKING_CREATED`
webhook has reached the CRM since 2026-10-13. So the order was not the cause: the link was there.

**The cause.** node-postgres hands a `DATE` column back as a JavaScript `Date` (local midnight), and
`calcom.utcFromWallClock` read only `'YYYY-MM-DD'` text, so the sync found no start time and returned the row's own
status, `waiting_link`, the same word as for "no link yet". The suite's fake pool handed dates back as text, which hid
it. The same helper also lost the time in the assignee's bell when a meeting is cancelled from the CRM (Part 12); one
fix covers both.

### What changed
- **Dates as the database returns them.** `dayText()` turns the database's `Date` into its calendar day;
  `utcFromWallClock` accepts either.
- **Never a silent wait.** A start the Notetaker cannot use is now `failed` with "The meeting has no start time the
  Notetaker can use".
- **The Meet link, fetched.** `calcom.getBooking()` (GET `/v2/bookings/:uid`, cal-api-version 2026-02-25; the Meet
  link is in `location` once Cal.com has created it). A link watch in `routes/integrations.js`, started by `server.js`
  after the database is ready like the Engine's retry worker (a tick at once, then every 20 s, unref'd, never
  overlapping), looks after requests of the last three days:
  - `waiting_link` with the link already in the entry: sent.
  - `waiting_link` without it: Cal.com is asked; once `location` holds the Meet link, it is written into the entry
    (title, then the link, as the webhook would) and the bot is sent; past the start (+30 min) without a link: `failed`,
    "The Google Meet link never arrived from Cal.com".
  - `failed` because the Notetaker could not be reached (no HTTP answer): sent again each tick until the meeting starts,
    then left to rest (`http_status` cleared). Cal.com is not asked when the link is there.
  - Cancelled meetings are left alone; Cal.com being down just means another try next tick.
- **The webhook path stays** as it was; whichever brings the link first sends the bot, and the same external_id keeps
  it one bot.

### Files
| File | Lines | What |
|---|---|---|
| `utils/calcom.js` | 25 | Header: `getBooking`. |
| | 242 | `normaliseBooking`: `metadata.videoCallUrl` also counts as the link. |
| | 252–259 | `getBooking(key, uid)`. |
| | 413–421 | `dayText()`; `utcFromWallClock` takes the database's `Date`. |
| | exports | `getBooking`. |
| `routes/integrations.js` | 668–672 | The sync: an unusable start is a failure with its reason. |
| | 705–776 | The link watch: `notetakerLinkTick({ now, limit })`, `startNotetakerLinkWatch()`. |
| | 1100–1102 | Both on the router (server.js starts it; the suite drives a tick). |
| `server.js` | 55, 228, 357–360 | The router required once at the top, mounted, and the watch started after `initDb()`. |
| `tests/unit/calcom-booking-lookup.test.js` | new, 4 tests | A `Date` at local midnight equals its text (Manila, Berlin), an invalid one is null; `getBooking`: path, method, version, key, the link from `location`, the app name alone is no link, the older fields, a list, no booking, a 404. |
| `tests/routes/notetaker-booking.test.js` | header, 22–24, 74–103, 113, 116, 140–141, and the Part 4 block | The fake pool returns DATE as node-postgres does; the tick's queries; the Cal.com lookups counted; seven tests: sent at once with the database's dates, the watch fetching the link (twice, then sent once), a waiting request whose entry has the link, past the start without a link, Cal.com down and a cancelled meeting, the Notetaker unreachable then back (and past the start: left to rest), an unusable start; server.js starts the watch. |
| `tests/routes/calcom-receive.test.js` | 248 | The mount line pin follows server.js. |

### Verification
- Before the change, with the fake pool returning dates as the database does: the booking suite **7 / 21** (the seven
  booking tests from Parts 1–3 fail exactly as the live booking did: never sent), the lookup suite **0 / 4**. After:
  **22 / 22**, **4 / 4**; `npm test` → **1545 pass, 0 fail**.
- Against the live data (read-only): Cal.com's `GET /v2/bookings/<the stuck booking>` answers `accepted` with
  `location` = a `meet.google.com` link; the stuck request now computes a usable Meet link and
  `join_at 2026-10-21T19:30:00+08:00`. At the time of writing that meeting is about two hours away: once the server has
  restarted with this code, the watch's first tick sends it (or, if the Notetaker is not running, keeps trying until
  the meeting starts).

### Not built
- The cause of the missing webhooks (none since 2026-10-13): Cal.com must reach the CRM's public address
  (`BASE_URL`); on localhost it cannot. The watch makes the Notetaker independent of it; other webhook effects (bookings
  made on Cal.com's own page appearing in the CRM, moves and cancellations from there) still need it.

## 2026-10-26: the Notetaker hidden in the CRM

**Asked:** "can you hide the notetaker" (in the CRM, not on the landing page).

**Change:** `public/js/detail-views.js` gets a switch, `const DV_NOTETAKER_SHOWN = false;`, placed just above
`dvNotetakerToast`. While it is off:
- the booking dialog shows no "Mit Notetaker aufzeichnen" box (`const rec = DV_NOTETAKER_SHOWN && …`);
- the Notetaker health check never runs (`if (DV_NOTETAKER_SHOWN && … ) checkNotetaker(false)`);
- `B.record` stays false, so the booking request sends `record: false` and the summary never says "mit Notetaker".

What stays:
- notes the Notetaker already wrote stay on their deals;
- the server routes and the link watch are unchanged; with nothing booked for a recording, they have nothing to do;
- setting the switch to `true` brings everything back as it was.

**Tests:** `tests/client/notetaker-ui.test.js`.
- A new test pins that the switch is off.
- The two assertions on the box line and the health-check line now include the switch.
- `npm test`: 1668 of 1668 pass.

## 2026-10-27: the Notetaker switched off for this branch, server side too (commented out, not deleted)

**Asked:** "yes i think we should off it for now do not delete it just comment it out if possible because after this
branch we will bring it back". Hiding the box (2026-10-26) had left the server side running: the link watch queried
`notetaker_recordings` every 20 seconds, and recordings booked before the hide could still be sent or moved.

**Commented out:**
- `server.js`
  - line 177: the raw-body parser for `/api/notetaker/webhook`;
  - lines 252–253: the result route's limiter and its mount;
  - line 386: `integrations.startNotetakerLinkWatch();`.
  - Each has a note above it saying how to bring it back.
- `db.js` lines 700–732: the `notetaker_recordings` table and its three added columns sit inside `/* */`, so no
  database (production included) gets the table now. Kept:
  - the `'notetaker'` value in `activities_source_check`, because the notes the Notetaker already wrote need it;
  - the "Notetaker" author label in `routes/activities.js`.

**Switched off** (call sites in the Cal.com handlers would be fragile to comment out one by one):
`routes/integrations.js` line 657, `let NOTETAKER_ON = false;`.
- `notetakerSafe` (line 697) and `notetakerRequest` (line 703) answer `null`. Nothing is stored or sent at booking,
  and a meeting booked, moved or cancelled through Cal.com or the CRM tells the Notetaker nothing.
- `notetakerLinkTick` (line 724) asks nothing.
- `GET /notetaker/health` (line 794) answers `{ available: false }` without asking the Notetaker.
- `router.setNotetakerOn` (line 1113) lets the Notetaker's own suite turn it on.
- Together with `DV_NOTETAKER_SHOWN = false` (public/js/detail-views.js) the CRM shows and does nothing for the
  Notetaker. Notes it already wrote stay on their deals.

**To bring it back:**
1. remove the `/* */` in `db.js`;
2. uncomment the four lines in `server.js`;
3. set `NOTETAKER_ON = true` (routes/integrations.js) and `DV_NOTETAKER_SHOWN = true` (public/js/detail-views.js).
`routes/notetaker.js` and `utils/notetaker.js` are untouched. The internal tools app (audio transcription) is separate
and unchanged.

**Tests:**
- `tests/routes/notetaker-booking.test.js` line 151: turns the switch on, so the code that comes back stays tested.
  Without it, 16 of its tests failed, which shows the switch takes effect.
- `tests/routes/notetaker-off.test.js` (new, 65 lines, 6 tests):
  - `initDb()` creates no `notetaker_recordings`, while the commented definition is complete;
  - `server.js` has no live Notetaker line;
  - the switch is off and guards both helpers;
  - the link tick asks nothing;
  - the health check answers "not available" and nothing leaves the machine;
  - the dialog's switch is off.
- `npm test`: 1675 of 1675 pass.
- The server was not started.
