# Cal.com integration — change log

Append-only. New work goes at the bottom as a new part. Earlier parts are never edited.

---

## Part 1 — 2026-10-13: Step 1, the connection in Settings (pieces 1–3)

**Request.** "i would like to connect my calendar with cal.com and also add to cal.com from my deal."
After the plan was discussed step by step, the decisions: **one workspace, one Cal.com connection**
(a personal Cal.com account's API key; team accounts later), **only the owner or an admin connects
it**, **every member sees everything that is connected**; later steps: cancelled bookings stay
visible as cancelled unless a user deletes them, an unknown email creates the contact and a deal
and is logged, the booking button goes on the deal and on the contact. Built one piece at a time on
branch `v2.2.2`: the client module, then the table and routes, then the Settings tab.

### What it does

- **Settings → Integrations → Cal.com** (a sixth tab in its own group, with a calendar icon in the
  rail). Owners and admins paste the account's API key (Cal.com: Settings, Developer, API keys).
  The server checks it against Cal.com's profile endpoint, fetches the account's event types, and
  shows the card as connected: account (name, email), username, time zone, who connected it and when,
  and a picker for the event type that bookings from a deal or a contact will use (Step 3). Refresh
  re-reads the event types; Disconnect asks first, then removes the row. Members see the same card
  read-only: the status badge, the account, the chosen event type as a read-only field, and a hint
  that only owners and admins can change it.
- **The key never comes back.** It is sent once, sealed at rest with AES-256-GCM under a key derived
  from `CALCOM_ENCRYPTION_KEY` (or `SESSION_SECRET` when unset), and no answer of any route carries
  it; the field in the browser is emptied before the answer is even looked at. A rotated server
  secret makes the stored key unreadable; the routes then answer 409 "connect Cal.com again".
- **Minted at connect, kept across reconnects:** `receive_token` (names the public receiver for
  Cal.com's booking webhooks, Step 2) and `webhook_secret` (will sign them). Reconnecting with
  another key replaces the account and the sealed key and keeps a still-valid event-type choice.
- **Cal.com facts used** (checked against cal.com/docs on 2026-10-13): `GET /v2/me` returns id,
  username, email, name, timeZone; `GET /v2/event-types` needs `cal-api-version: 2026-06-12` and
  with only the key returns the account's own types (id, slug, title, lengthInMinutes, hidden,
  ownerId). Every call: `Authorization: Bearer cal_…`, 10 s timeout. A self-hosted Cal.com can be
  pointed at with `CALCOM_API_URL`.
- **Status mapping:** Cal.com 401/403 → our 400 "Cal.com rejected the key: …"; Cal.com unreachable or
  timed out → 502; any other Cal.com error → 502 with its message (and on refresh remembered in
  `last_error`); a key not shaped like `cal_…` → 400 before Cal.com is asked; member on a write → 403
  "Owner or admin only"; not connected on PATCH/refresh → 404.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `utils/calcom.js` | 1–149 | **New.** 1–27 header; 31–33 constants (`DEFAULT_API_URL`, `VERSION_EVENT_TYPES` 2026-06-12, `TIMEOUT_MS`); 35–42 `CalError` (status 0 = not reached); 44–46 `apiUrl()` (env override); 50–52 `isApiKeyShaped`; 56–61 `messageOf` (Cal.com's error shapes); 65–85 `calFetch` (bearer, version header, query, JSON body, AbortController timeout, CalError on non-2xx); 88–98 `getMe`; 101–113 `listEventTypes` (normalised, rows without an id dropped); 116–144 the seal: `sealingKey` (sha256 of the secret), `sealKey` (12-byte iv, GCM tag, `v1.iv.tag.ct` base64url), `openKey` (format check, then "cannot be opened with this server secret"); 146–149 exports. |
| `db.js` | 406–427 | **New table** `workspace_calcom` after the `workspace_webhook` ALTER: `workspace_id UNIQUE`, `api_key_sealed`, the five `cal_*` account columns, `event_types JSONB`, `event_type_id`, `receive_token UNIQUE`, `webhook_secret`, `webhook_id`, `connected_by`, `connected_at`, `updated_at`, `last_error`; with the comment that explains each. |
| `routes/integrations.js` | 34–40, 42–50 | Header: the Cal.com paragraph and the five endpoints; why `requireAuth` is applied per route (the public receiver of Step 2 will share the prefix). |
| | 60 | `const calcom = require('../utils/calcom')`. |
| | 290–426 | **New block.** 295–299 `canManageCal`, `requireManageCal` (403 "Owner or admin only", the Engine's wording); 301–310 `loadCalRow` (joins the connecting user's name); 312–326 `calView` + `calAnswer` (never the sealed key, the token or the secret; `event_types` only for a manager); 329–333 `pickEventType` (keep, else first visible, else first); 336–343 `calFailure` (the status mapping above); 345–349 `GET /calcom`; 351–382 `POST /calcom/connect` (shape check, `getMe` + `listEventTypes`, upsert `ON CONFLICT (workspace_id) DO UPDATE` that leaves `receive_token` and `webhook_secret` alone, `connected_at=NOW()`, `last_error=NULL`); 384–395 `PATCH /calcom` (`event_type_id` must be in the stored list); 397–418 `POST /calcom/refresh` (`openKey` → 409 on failure, Cal.com error → `last_error`); 420–425 `DELETE /calcom`. |
| `public/index.html` | 1101–1102 | The rail: a second separator and the Cal.com tab. |
| | 1330–1381 | **New pane** `#intg-pane-calcom`: one card `#cal-card` (header with the status badge `#cal-status`; hint; read-only hint `#cal-readonly-hint`; the connect section `#cal-connect-section` with the password field `#cal-key`; the member line `#cal-none`; the account section with `#cal-facts`; the event-type section with the select `#cal-event-type` and the read-only field `#cal-type-readonly`; one actions row `#cal-actions` with the connect, refresh and disconnect buttons, each shown by the script, and the message pill `#cal-msg`). |
| `public/js/core.js` | 509–521 (en), 942–954 (de) | 33 keys: `intg_tab_calcom`, `intg_pane_calcom`, `intg_pane_calcom_hint`, `cal_title`, `cal_status_none/connected`, `cal_hint`, `cal_readonly_hint`, `cal_key_label/hint/ph`, `cal_btn_connect`, `cal_key_required`, `cal_none`, `cal_account_label`, `cal_fact_account/username/timezone/connected_by`, `cal_connected_by_on`, `cal_event_type_label/hint`, `cal_minutes`, `cal_hidden_tag`, `cal_no_event_types`, `cal_btn_refresh/disconnect`, `cal_confirm_disconnect`, `cal_connected_ok`, `cal_disconnected_ok`, `cal_saved`, `cal_refreshed`, `cal_err_generic`. German impersonal; "Terminart (in Cal.com: Event Type)". |
| `public/js/integrations.js` | 42–50 | Header: the function map's `calcom` line and the paragraph "3. CAL.COM". |
| | 254 | `loadIntegrations` calls `loadCalcomSettings()` after the rail is switched (the design test pins the first two statements). |
| | 805–920 | **New block.** `calcomData`; `loadCalcomSettings` (GET); `calTypeLabel` ("30 Minuten (30 Min.)", a tag when Cal.com hides the type); `renderCalcom` (every section and button follows `connected` and `can_manage`; the account as a compact table; the picker for managers, the read-only field for members; dates in the current language); `showCalMsg`; `connectCalcom` (the field is emptied before the answer is read); `saveCalcomEventType` (PATCH on change); `refreshCalcomEventTypes`; `disconnectCalcom` (`ui.confirm`, then DELETE). |
| `public/style.css` | 1611 | The rail icon for the tab: `.settings-tab[data-tab="calcom"]::before`, a calendar, in section 21 next to the other five. |
| `tests/unit/calcom.test.js` | 1–165 | **New, 13 tests:** seal round trip and format, tamper / foreign secret / junk, the dedicated env key, the key shape; `getMe` and `listEventTypes` headers and normalisation, an answer without data, `calFetch` query / body / trimmed key / `CALCOM_API_URL`; Cal.com's error shapes, no network, a timeout (aborted), a key-shaped check before any network. |
| `tests/routes/calcom-settings.test.js` | 1–211 | **New, 10 tests** over a fake pool and a fake api.cal.com: status for member and owner; member 403 and shape 400 before Cal.com; Cal.com 401 → 400 and unreachable → 502 with nothing written; the connect (headers, the sealed key that opens to the key, the token and secret, the first visible type, nothing secret in the answer); the member's read-only view; the reconnect (account replaced, token and secret kept, choice kept); PATCH (403 / 404 / 400 / hidden type allowed); refresh (opened key on the wire, a vanished choice re-picked; `last_error`; rotated secret → 409); DELETE (403; the row goes). |
| `tests/unit/calcom-schema.test.js` | 1–34 | **New, 2 tests:** the table's columns and guards; its place between `workspace_webhook` and `user_workspaces`. |
| `tests/client/calcom-settings.test.js` | 1–85 | **New, 6 tests:** the rail (second separator + tab); the pane's anatomy and ids; every key on the pane and in the script in both languages, German impersonal; the script's five routes and nothing else, `renderCalcom`'s state logic, connect / disconnect / save behaviour; the rail icon in the stylesheet. |
| `tests/client/integrations-design.test.js` | 20, 27, 32–36, 39–40, 54–56, 77 | The page's design pins extended from five tabs to six: `INTG_TABS` gains `calcom`; "six tabs in three groups" with the second separator between Deliveries and Cal.com; six panes; `#cal-card` last in the card order; three message pills. |
| `readmedev.md` | §4 `/api/integrations` | The Cal.com route table and the two env rows (`CALCOM_ENCRYPTION_KEY`, `CALCOM_API_URL`). |

### Verification

- Piece 1: `node --test tests/unit/calcom.test.js` → **13 pass**. Piece 2: the route test, the schema
  test and the existing schema suite → **51 pass**. Piece 3: the new client test with the i18n sweep,
  the Integrations design test and the Engine UI test → **66 pass** after the design pins were
  honoured (the message pill in the actions row, a read-only input instead of a hint for a
  runtime-filled value, a rail icon per tab, the load order of the page); `npm run test:client` →
  **820 pass**.
- `npm test` → **1289 tests, 1289 pass, 0 fail.** (The eight nodemailer failures reported in the
  landing-page part no longer occur: `node_modules/nodemailer` is present now.)
- `node --check` on `utils/calcom.js`, `routes/integrations.js`, `db.js`, `public/js/core.js`,
  `public/js/integrations.js` OK.
- Not run: the app itself and a real Cal.com account (no server is started here). First thing to try
  in the browser: Settings → Integrations → Cal.com as an owner, paste a key, see the account and the
  event types; then as a member, see the same read-only.

### Left for the next steps

- Step 2: register the webhook at connect (`POST /v2/webhooks` with `subscriberUrl` =
  `<APP_URL>/api/integrations/calcom/receive/<receive_token>`, the three booking triggers and
  `webhook_secret`), the public receiver verifying `x-cal-signature-256`, bookings as activities keyed
  by booking uid, the unknown-email rule, cancelled kept visible, the webhook deleted on disconnect.
- Step 3: the booking dialog on the deal and the contact (slots, `POST /v2/bookings`).
- The hint in the card still names Step 3's booking in the future tense of the product ("a meeting
  can be booked from a deal or a contact"); it reads true once Step 3 ships.

## Part 2 — 2026-10-13: Step 2, bookings into the CRM (pieces 1–4)

**Request.** "ok lets do it" on the Step 2 plan: Cal.com reports every booking it hosts; the CRM turns
it into an entry on the calendar, the contact and the deal; reschedules move it, cancellations mark
it. Decisions carried in: a cancelled booking stays visible as cancelled until someone deletes it; an
unknown attendee creates the contact and a deal, then logs; the host's email names the owner. The one
open question, a new "Termin" (meeting) activity type or reuse "call", went to the new type.

**A decision superseded.** `tests/client/activities-port.test.js` recorded that the generic "meeting"
type of the reference design was declined when the Activities page was ported ("meeting is not
ported"). Your go on the Cal.com plan supersedes that: the type exists now, for bookings and for
meetings logged by hand. The pin was rewritten to say so; the memory note too.

### What it does

- **A booking becomes one activity** of type `meeting`, source `calcom`, with Cal.com's title, the
  start as the host's date and time, the host's zone stamped (the connection's zone when the host has
  none), owned by the CRM user whose email is the host's (else by whoever connected Cal.com). The
  booking's id is kept on the row, so a repeated delivery lands on the same row, a reschedule moves it
  by the old id and gives it the new one, and a cancellation marks it (`cancelled_at`) without removing it.
- **Who it belongs to.** Our own metadata first (a booking made from the CRM, Step 3, names the contact
  and the deal), else the attendee's email; an unknown email creates the contact (assigned like a lead)
  and a deal in the lead webhook's pipeline and stage, else the first pipeline's first stage, else no
  deal. The Engine hears `kunde.angelegt` for a new contact, as for a lead.
- **The receiver** `POST /api/integrations/calcom/receive/:token` is public: the token minted in Step 1
  names the workspace, and every delivery must carry Cal.com's HMAC-SHA256 over the raw body in
  `x-cal-signature-256`. server.js hands this path the raw bytes (`express.raw` before the global json
  parser) and gives it the same two rate limits as the lead receiver. Unsigned or wrongly signed: 401,
  logged. Triggers other than created / rescheduled / cancelled: 200, ignored. Every delivery is
  logged in `webhook_logs` with `source 'calcom'`; the lead log now filters on `source 'lead'`.
- **The webhook registers itself.** At connect the CRM registers a user webhook on the account with
  the receiver's public address (`APP_BASE_URL` or `BASE_URL`, else the request's own origin) and the
  workspace secret, and remembers Cal.com's id. Reconnecting the same account keeps it; another account
  has the old one removed with the old key and a new one made with the new key; disconnect removes it.
  A refusal never breaks the connection: the card says "not registered, why", and a button retries
  (`POST /calcom/register-webhook`, which removes a stale one first so there is never two).
- **Shown everywhere an activity is shown.** "Termin" is the fifth type in the Activities page (filter,
  composer, breakdown), the deal and contact timelines, and the calendar (legend, filter, violet like
  the timeline style that already existed), with the sprite's calendar icon. A cancelled booking is
  struck through on the calendar with "Abgesagt" in front, and carries a red "Abgesagt" badge in the
  Activities page and both timelines; a "Cal.com" badge names the source in the Activities page.
- **The card** (Settings → Integrations → Cal.com) gains a "Buchungs-Webhook" row (registered, or why
  not, with the hint that the CRM must be reachable from the internet), the register button while the
  webhook is missing, and "Letzte Buchungen": the last 30 deliveries with what was booked, moved or
  cancelled, the date and time, and whether a contact or a deal was created.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `db.js` | 432–439 | `activities.calcom_uid`, `activities.cancelled_at`, the partial unique index `idx_activities_calcom_uid (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL`, `webhook_logs.source DEFAULT 'lead'`. |
| | 498, 657 | The type CHECK gains `'meeting'`; the source CHECK gains `'calcom'` (both re-declared DROP-then-ADD as before). |
| `utils/calcom.js` | 28–36, 43 | Header: the webhook; `WEBHOOK_TRIGGERS`. |
| | 129–146 | `createWebhook` (POST /v2/webhooks: subscriberUrl, the three triggers, active, secret; the id as a string) and `deleteWebhook` (404 counts as done). |
| | 173–244 | The mapping: `signBody`, `verifySignature` (constant time, `sha256=` prefix tolerated), `parseBooking` (the three triggers, host and customer with lower-cased emails, our `upgrads_deal_id` / `upgrads_contact_id` metadata read back, anything else ignored), `wallClock` (Intl in the host's zone, an unknown zone falls back to Europe/Berlin and says so), `bookingToActivity`. |
| `routes/integrations.js` | 50–53, 64 | Header lines; `baseUrl` required. |
| | 150 | `GET /logs` filters `source='lead'`. |
| | 339–359 | `calReceiveUrl`, `calRegisterWebhook` (never throws; writes `webhook_id` or `last_error`). |
| | 392–398, 414–417 | Connect: the other account's webhook removed with the old key; the same account keeps its webhook; else register. |
| | 457–470 | `POST /calcom/register-webhook` (owner/admin; 404 not connected; 409 unreadable key; 502 with the card's state when Cal.com refuses). |
| | 472–484 | `DELETE /calcom` removes the webhook at Cal.com first, best effort. |
| | 486–636 | **The receiver block:** `calLog`, `calOwnerFor`, `calContactFor` (metadata → email → create contact + deal), `GET /calcom/logs` (30, source calcom), `POST /calcom/receive/:token` (token → workspace, signature over the raw bytes, parse, cancelled / rescheduled / created with `ON CONFLICT (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL`, the log row, the answer). |
| `server.js` | 121–127 | `calcomTokenLimiter` (120 / min per receiver path). |
| | 141–144 | `express.raw({ type: '*/*', limit: '1mb' })` on the receiver path, before the global `express.json()`. |
| | 204 | The two limits mounted on the receiver path before the router. |
| `routes/activities.js` | 134, 189 | `a.cancelled_at` in the list and the single read. |
| | 171, 208 | POST and PATCH accept `meeting`. |
| `routes/calendar.js` | 59, 85, 113, 137 | Both queries: `cancelled_at` and `source` in the activity half, `NULL::timestamptz` and `'user'` in the task half. |
| `public/js/core.js` | 1262 | `ICON_ALIAS.meeting = 'calendar'`. |
| | 114–115, 153 (en); 551–552, 590 (de) | `act_meeting` (Meeting / Termin), `act_verb_meeting`, `act_ph_meeting`, `act_cancelled` (Cancelled / Abgesagt), `src_calcom`. |
| | 522–525 (en), 959–962 (de) | `cal_fact_webhook`, `cal_webhook_on/off`, `cal_btn_register`, `cal_registered_ok`, `cal_webhook_hint`, `cal_log_title/hint/none`, `cal_log_BOOKING_CREATED/RESCHEDULED/CANCELLED`, `cal_log_new_contact/new_deal`. |
| `public/js/objects.js` | 582 | `ACT_TYPES` gains `meeting`. |
| | 761 | The Activities row: the "Abgesagt" badge and the "Cal.com" badge. |
| `public/js/detail-views.js` | 61 | `DV_ACT_TYPES` gains meeting (icon calendar). |
| | 340, 616 | The deal and contact timeline heads: the "Abgesagt" badge. |
| `public/js/calendar.js` | 70 | `CAL_TYPES` gains meeting (violet). |
| | 172–173, 235, 291 | Month cell, week block and upcoming list: struck through when cancelled, the word in the title. |
| | 435 | `cancelled: !!e.cancelled_at` on every mapped entry. |
| `public/style.css` | 1034–1035, 1106 | `.cal-ev.meeting`, `.cal-ev.cancelled`, `.cal-bar.meeting, .cal-dot.meeting`. (`.tl-ic.meeting` already existed from the reference port.) |
| `public/index.html` | 1372–1378 | The "Letzte Buchungen" section `#cal-log-section` / `#cal-log`. |
| | 1382 | The register button `#cal-register-btn` in the actions row. |
| `public/js/integrations.js` | 43–44 | Function map. |
| | 841–844, 853 | `renderCalcom`: the register button while the webhook is missing, the log section, the webhook fact row; `loadCalcomLogs()` once connected. |
| | 917–954 | `registerCalcomWebhook`, `loadCalcomLogs` (the lead log's classes). |
| `tests/unit/calcom.test.js` | 167–273 | **+8 tests:** the signature (prefix, case, body, secret, truncation, junk), `parseBooking` (created, the customer among attendees, rescheduled, cancelled, ignored and junk), `wallClock` (Berlin summer and winter, Tokyo, New York, an unknown zone, garbage), `bookingToActivity`; `createWebhook` / `deleteWebhook`. |
| `tests/routes/calcom-receive.test.js` | 1–251 | **New, 12 tests**, served like server.js (raw before json): unknown token; three bad signatures logged; the raw-bytes proof (a pretty-printed body verifies here and fails through a re-serialising parser); ignored triggers; no uid; created with a known contact and host (params, SQL, log); our metadata; an unknown attendee with the lead settings; without them and without any pipeline; an unknown host; the same delivery twice; rescheduled (moved, or created); cancelled (marked and kept, found false the second time); server.js and the two log routes pinned. |
| `tests/routes/calcom-settings.test.js` | 182–219 and the connect / reconnect / delete tests | **+5 tests:** the webhook registered at connect (receiver URL at the request origin, the secret, the triggers, the id kept); Cal.com refusing, the card's state and the retry; a retry removing the stale one first; the same account keeping its webhook; a blank env falling back; `APP_BASE_URL`; 404 when not connected; disconnect removing the webhook; reconnecting another account deleting with the old key and creating with the new. |
| `tests/client/calcom-settings.test.js` | 90–122 and the pane / script pins | **+3 tests** ("the meeting type"): the API allow-lists and reads, the client lists and styles and keys, the cancelled mark in every view; the actions row with the register button, the log section, the seven routes, the webhook fact row. |
| `tests/client/activities-port.test.js` | 117–124, 189–190, 195, 204, 322 | The type pins now list five types; the "meeting is not ported" assertion replaced by the reason it is. |
| `tests/unit/db-engine-schema.test.js` | 135, 138 | The source CHECK lists user, engine, calcom. |
| `readmedev.md` | §4 `/api/integrations/calcom` | The three new routes and the raw-body note. |

### Verification

- Piece 1: unit + schema suites → 46 pass after the source pin was updated. Piece 2: the receiver suite
  with the settings, server and schema suites → **60 pass**. Piece 3: the Cal.com suites → **55 pass**
  (after repairing one assertion my edit script had corrupted with a `$`` ` replacement pattern).
  Piece 4: `npm run test:client` → **823 pass**; calendar, activities and Cal.com route suites → 74 pass.
- `npm test` → **1322 tests, 1322 pass, 0 fail.**
- Not run: the app, a real Cal.com account, a real delivery. To try: connect as an owner; the card
  shows "Buchungs-Webhook: registriert" when the CRM is reachable from the internet (else "nicht
  registriert" with the reason and the button); book a slot on the account; the entry appears on the
  calendar, the contact and the deal within seconds, and in "Letzte Buchungen"; reschedule and cancel
  it in Cal.com and watch the entry move, then turn red and struck through.

### Left for the next steps

- Step 3: the booking dialog on the deal and the contact (slots, `POST /v2/bookings` with
  `upgrads_deal_id` / `upgrads_contact_id` in the metadata, the entry written at once).
- Editing a Cal.com entry's date in the CRM does not reschedule it in Cal.com; deleting it in the CRM
  does not cancel it there. Both are one-way for now and would be a later step.

## Part 3 — 2026-10-13: Step 3, booking from the deal and the contact (pieces 1–3)

**Request.** "awesome lets do it also this button only appears when cal.com is connected right?" on
the Step 3 plan, with the three recommendations taken as agreed: everyone in the workspace may book
(the host is always the connected account), one optional note that goes into the invitation, and
Cal.com's own message when an event type asks more questions than name and email.

### What it does

- **The button.** "Termin buchen" sits with Anrufen, E-Mail and WhatsApp on the deal and on the
  contact. It appears only while Cal.com is connected and an event type is chosen (the status is
  fetched with the view and cached for a minute); without Cal.com both views look exactly as before.
  On the deal it is disabled without a contact, on the contact without an email, with the same hints
  the other buttons use. A contact without an email who is reached through the button gets a small
  dialog saying the invitation needs one, with a button to the contact form.
- **The dialog.** The event type (the one from Settings preselected, the account's others to pick
  from), the free slots of seven days as chips in the viewer's own zone, "Frühere Tage" (never before
  today) and "Spätere Tage", a note field, and "Buchen", enabled once a slot is picked. A refusal
  from Cal.com (a slot taken meanwhile) shows under the slots; the dialog stays open to pick another.
- **The booking.** The server books at Cal.com with the contact as attendee in the booker's zone and
  language, our ids in the metadata (`upgrads_workspace_id`, `upgrads_contact_id`, `upgrads_deal_id`)
  and the note in Cal.com's notes field. Cal.com sends the invitations. The server then writes the
  "Termin" entry at once on the same row the webhook will land on (same booking id), in the host's
  wall clock and zone, owned by the booker and linked to the deal and the contact, and logs it under
  "Letzte Buchungen" as "Aus dem CRM gebucht". The view refreshes and a toast names the time.
- **Members see the event types now.** The status answer carries the account's event-type list for
  everyone (a member picks one when booking); the key, token and secret stay hidden as before.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `utils/calcom.js` | 23–24, 48–49 | Header; `VERSION_SLOTS` 2024-09-04, `VERSION_BOOKINGS` 2026-02-25. |
| | 151–156 | The small readers (`str`, `lowerEmail`, `posInt`, `isoOrNull`) hoisted above the booking section that now shares them with the webhook section. |
| | 158–201 | `getSlots` (GET /v2/slots with the event type, the range, the zone and `format=range`; the answer per date as ISO instants, junk dropped) and `createBooking` (POST /v2/bookings with the attendee defaulted to Europe/Berlin and German, metadata only when given, the note as `bookingFieldsResponses.notes`, `lengthInMinutes` only when given; the answer normalised; no uid is a CalError). |
| `routes/integrations.js` | 53–54 | Header: the two routes. |
| | 316–330 | `calView`: the event-type list and `can_manage` for everyone. |
| | 642–742 | **New block:** `calDateOnly`, `calAddDays`, `calOpenConnection` (404 / 409), `calEventTypeFor`; `GET /calcom/slots` (`from` today in the viewer's zone or a given day, `days` 1–14, `event_type_id` from the stored list; Cal.com failures mapped as elsewhere); `POST /calcom/book` (the checks in order: event type, start, deal of this workspace, contact of this workspace, the contact's email; Cal.com's 4xx → 409 "did not accept the booking", 0 → 502; the insert with `ON CONFLICT … DO UPDATE SET … created_by=EXCLUDED.created_by, deal_id=COALESCE(EXCLUDED.deal_id, activities.deal_id)`; the log row with trigger `BOOKED_FROM_CRM`; 201 with the activity and the booking). |
| `public/js/detail-views.js` | 154–236 | **New block** before `openDealForm`: `dvCalcomCache` / `dvCalcomStatus` (one fetch a minute), `dvCalcomReady`, `dvBookButton` (nothing without Cal.com), `dvIsoDateIn`, `dvAddDays`, `openCalcomBooking` (the no-email dialog; the booking dialog with its state `B`, `render`, `load`, the delegated handlers, the post and the refresh). |
| | 314, 317, 367, 617 | The deal view: the status joins the first fetch, `S.calcom`, the button after WhatsApp (disabled without a contact), `A.book` reloading the timeline after. |
| | 677–679, 792, 860 | The contact view: the status joins the first fetch (before the documents fetch, which its own test keeps last), `S.calcom`, the button after WhatsApp (disabled without an email), `A.book` re-reading the contact after. |
| `public/js/core.js` | 525–529 (en), 966–970 (de) | `cal_log_BOOKED_FROM_CRM` and the nineteen `cal_book_*` keys (button, title with {name}, type, zone line with {zone} and {host}, range with {from} and {to}, earlier / later, loading, none per day, none per week, note and its placeholder, submit, booking, pick first, done with {when}, no email, open contact). |
| `public/style.css` | 1107–1113 | `.cal-book-zone`, `.cal-book-nav`, `.cal-book-days` (auto-fill columns of 150 px), `.cal-book-day`, `.cal-book-dayhead`, `.cal-book-err`; the slot chips reuse `.chip` / `.chip.on`. |
| `tests/unit/calcom.test.js` | 275–298 | **+2 tests:** `getSlots` (headers, query, normalisation, an array instead of an object) and `createBooking` (headers, the body with and without the optional parts, the normalised answer, no uid). |
| `tests/routes/calcom-booking.test.js` | 1–147 | **New, 7 tests** served as a member in America/New_York: slots (404 when not connected; the chosen type, the zone, today for seven days, the answer per day; from / days clamped / a hidden type / 400 / 502); book from a deal (Cal.com's body, the insert's params in the host's zone and the ON CONFLICT clause, the answer, the log); from a contact in English without a note; the six refusals before Cal.com is asked; Cal.com refusing (409, nothing written), unreachable (502), a rotated secret (409), not connected (404); the same booking twice re-owned by the booker. |
| `tests/routes/calcom-settings.test.js` | 130, 150–153, 161 | Members see the event-type list. |
| `tests/client/calcom-settings.test.js` | 124–161 | **+3 tests** ("booking from a deal or a contact"): the cache, the gate, the button and the no-email path; both views' first fetch, button placement and handlers; the dialog's parts, the slots URL, the zone formatting, the chips, the navigation floor, the post body, the close / toast / refresh order, escaping, the keys, the styles. |
| `readmedev.md` | §4 `/api/integrations/calcom` | The two routes. |

### Verification

- Piece 1 + 2: the Cal.com unit and route suites → **64 pass**. Piece 3: `npm run test:client` →
  **826 pass** (one existing pin, the Documents tab's "loaded in the same Promise.all", decided where
  the status fetch sits in the contact view's first fetch).
- `npm test` → **1334 tests, 1334 pass, 0 fail.**
- Not run: the app and a real booking. To try: open a deal whose contact has an email, press
  "Termin buchen", pick a slot, Buchen. The entry appears in the deal's timeline at once; the customer
  and the host get Cal.com's invitation; the card's "Letzte Buchungen" shows "Aus dem CRM gebucht",
  and a moment later Cal.com's own delivery ("Gebucht") lands on the same entry. Open the same deal
  as a member: the button is there too. On a contact without an email: the button is disabled with
  the hint.

### Left for later

- Cancelling or rescheduling from the CRM (today both happen in Cal.com and flow back).
- Team accounts (Step 5 of the original plan) and the prefilled booking link (Step 4) were not asked
  for yet.

## Part 4 — 2026-10-13: the booking dialog as date and time dropdowns, with a conflict check

**Request.** "for booking a meeting instead of listing everything can we do it dropdown of dates,
then dropdown of time also check if there is conflict". Taken as: the seven-day grid of slot chips
goes; a date dropdown, then a time dropdown; and before booking, a check against the CRM's own
calendar, which Cal.com cannot see (Cal.com's free slots already exclude the host's Cal.com and
Google conflicts). A conflict warns and lets you book anyway or pick another time; it does not block.

### What it does

- **Date, then time.** The dialog offers the event type, then a "Datum" dropdown with fourteen days
  (the days with free times enabled and counted, "3 freie Zeiten"; the others visible but disabled),
  the first free day preselected, then an "Uhrzeit" dropdown with that day's slots as "14:00 bis
  14:30" in the viewer's zone. "Frühere Tage" / "Spätere Tage" move the fourteen-day window, never
  before today. The dialog is medium-sized now; the two dropdowns sit side by side, stacked on a phone.
- **The conflict check.** Picking a time reads the CRM calendar for that day (plus the neighbours, for
  zone shifts) and looks for timed entries of the booker and of the host, the CRM user whose email is
  the connected account's, converted to the viewer's clock. A CRM entry has no length, so it counts as
  thirty minutes, as the calendar draws it. All-day entries, cancelled bookings, done tasks and other
  people's entries do not collide. A hit shows a red box: "Konflikt: um 14:00 steht bereits
  Besichtigung Hafenstraße (Mara Kühn) im Kalender." with the hint that Cal.com does not see CRM
  entries; the button then reads "Trotzdem buchen". While the calendar is read the button waits.
- **The host's CRM user** comes with the status answer (`host_user_id`), resolved by email in the
  workspace, so the check covers the host even when someone else books.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `public/js/detail-views.js` | 154–163 | The block comment: date, time, the conflict check. |
| | 181–186 | `dvZonedParts` (an instant as a zone's date and time). |
| | 187–277 | `openCalcomBooking` **rewritten**: state `B` with `days: 14`, `date`, `conflicts`, `checking`; `render` (type select, the fourteen-day window, the date and time dropdowns, the conflict box, the note); `load` (the first free day preselected); `checkConflicts` (the calendar around the day, the booker and the host, the viewer's clock, thirty-minute entries, a stale pick ignored); the handlers for date and time; the button's label and disabling. |
| `routes/integrations.js` | 309–313 | `loadCalRow` joins the host's CRM user by email (`h.id AS host_user_id`). |
| | 328 | `calView.host_user_id`. |
| `public/js/core.js` | 530–531 (en), 973–974 (de) | `cal_book_date`, `cal_book_date_ph`, `cal_book_time`, `cal_book_time_ph`, `cal_book_one_time`, `cal_book_n_times`, `cal_book_checking`, `cal_book_conflict` ({time}, {title}, {who}), `cal_book_conflict_hint`, `cal_book_anyway`. |
| `public/style.css` | 1107–1113 | `.cal-book-pick` (two columns, one on a phone) and `.cal-book-conflict` replace the chip grid's three rules. |
| `tests/routes/calcom-settings.test.js` | 27, 153 | The fake pool asserts the host join and hands back `host_user_id`; the connect test pins it in the answer. |
| `tests/client/calcom-settings.test.js` | 146–169 | The dialog test rewritten: the medium modal, the state, the slots URL, the preselected day, the date dropdown with disabled days, the time dropdown, the zone formatting, the window floor, the time handler running the check, the two people, the calendar fetch, the exclusions, the viewer's clock, the thirty minutes, "Trotzdem buchen", the post, the close order, no chip grid, the keys, the styles, the status field. |

### Verification

- `npm run test:client` → **826 pass**; the Cal.com route suites → **39 pass**; `npm test` →
  **1334 tests, 1334 pass, 0 fail.**
- Not run: the app. To try: "Termin buchen" on a deal; pick a day in the dropdown, then a time; log a
  call with a time on the same contact at that hour first and watch the red box appear and the button
  turn into "Trotzdem buchen"; pick another time and it clears.

## Part 5 — 2026-10-13: the 12-hour clock beside every time in the booking dialog

**Request.** "in the time slot can you add pm or am so that the user wouldnt be confused". Done as
both forms side by side, so neither a 24-hour nor a 12-hour reader has to convert.

### What it shows
- A slot in the "Uhrzeit" dropdown reads "14:00 bis 14:30 (2:00 PM)" (English: "14:00 to 14:30
  (2:00 PM)"). The 24-hour part follows the interface's locale as before; the bracket is the same
  instant on a 12-hour clock in the viewer's zone.
- The conflict line reads "Konflikt: um 14:00 (2:00 PM) steht bereits …", and the toast after booking
  "Gebucht: Mo, 20. Okt, 14:00 (2:00 PM). Cal.com schickt die Einladung."

### Files and lines
| File | Lines | Change |
|---|---|---|
| `public/js/detail-views.js` | 202–204 | `fmtAmPm` (an instant as "2:00 PM" in the viewer's zone) and `ampmOf` (a stored "HH:MM" as "2:00 PM"). |
| | 222 | The time dropdown's option uses the new key `cal_book_slot` with `{from}`, `{to}` and `{ampm}`. |
| | 258 | The conflict entry's time carries the bracket. |
| | 274 | The toast's time carries the bracket. |
| `public/js/core.js` | 531 (en), 974 (de) | `cal_book_slot`: '{from} to {to} ({ampm})' / '{from} bis {to} ({ampm})'. |
| `tests/client/calcom-settings.test.js` | 154–159, 171 | Pins for the two formatters, the slot label, the conflict line, the toast and the key in both languages. |

### Verification
- Checked by hand in Node with the same calls: 12:00 UTC on 20 October in Europe/Berlin formats as
  "14:00 (2:00 PM)"; a stored "00:30" formats as "12:30 AM".
- `npm run test:client` → **826 pass**; `npm test` → **1334 tests, 1334 pass, 0 fail.**

## Part 6 — 2026-10-13: where the meeting happens (Cal Video, Google Meet, Zoom, in person, …)

**Request.** "can we add a choice of google meet, zoom or cal in there?" and, on the question
whether Cal.com allows it, "review cal.com if its possible to choose these apps".

**Reviewed against Cal.com's API reference (2026-10-13).** Yes. `POST /v2/bookings` takes a
`location` object; for a video app it is `{type: "integration", integration: "google-meet" | "zoom"
| "cal-video" | "office365-video" | …}`, for the organizer's address, link or phone `{type: "address"}`,
`{type: "link"}`, `{type: "phone"}` (Cal.com fills in the value). The event type's `locations` array
(`GET /v2/event-types`) lists what the type offers; Cal.com accepts only those. So the choice exists
exactly when the host has installed the app in Cal.com and added it to the event type as a location
option. The booking's answer names the place in `location` (a meeting link for a video app).

### What it does

- **A "Wo" dropdown** in the booking dialog, between the event type and the zone line, listing the
  chosen event type's locations by name: Cal Video, Google Meet, Zoom, Microsoft Teams (and other
  apps by their id), "Vor Ort: <Adresse>", "Link des Gastgebers", "Telefonat". The first is
  preselected; switching the event type resets it. An event type with nothing to choose shows no
  dropdown and Cal.com uses the type's default. Locations the attendee would have to name (their
  phone, their address) are not offered from the CRM.
- **The chosen place goes with the booking.** The server checks it against the event type's stored
  locations (400 "Choose one of the event type's locations" otherwise) and passes the booking shape
  to Cal.com, which creates the Meet or Zoom link.
- **The link lands in the entry.** The activity's text gets the meeting link on a second line, from
  the booking's answer when booked in the CRM and from the webhook's `metadata.videoCallUrl` (or a
  link in `location`) when booked elsewhere, so both paths write the same text. The timeline shows
  it as text (activity text is not linkified); the invitation carries it as a link anyway.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `utils/calcom.js` | 131 | `listEventTypes` keeps `locations` (normalised). |
| | 158 | `urlOrNull`. |
| | 160–191 | `LOCATION_TYPES`, `normaliseLocations` (only the fields the dialog and the booking need; junk dropped), `bookingLocationFor` (the booking shape for one of a type's locations, null when not on the list or attendee-named). |
| | 220, 230–231 | `createBooking`: `location` in the body; the answer's `location` and `meetingUrl` (a link in `location`, else the older `meetingUrl`). |
| | 306 | `parseBooking.meetingUrl` from the webhook. |
| | 330 | `bookingToActivity`: the link on the second line. |
| `routes/integrations.js` | 712–716, 724 | `POST /calcom/book`: the location validated against the type and passed on. |
| | 735, 749 | The entry gets the link; the answer names the place. |
| `public/js/detail-views.js` | 200, 212–215, 234–235, 271, 279–280 | `B.loc`; `placesOf`, `APPS`, `placeLabel`, `placeOf`; the "Wo" dropdown; the handlers; the place in the post. |
| `public/js/core.js` | 531 (en), 974 (de) | `cal_book_where`, `cal_loc_address` ({address}), `cal_loc_address_plain`, `cal_loc_link`, `cal_loc_phone`. |
| `tests/unit/calcom.test.js` | 300–330 and three pins | **+3 tests** (locations normalised; `bookingLocationFor`; the location sent, the link read from the answer, from the webhook, and written on the second line); the list / activity / booking pins updated for `locations` and the link line. |
| `tests/routes/calcom-booking.test.js` | 15, 119–134 and two pins | The type with three locations; **+1 test** (a chosen location to Cal.com, an address by type, one not on the type → 400 before Cal.com, none → no field; the link in the entry). |
| `tests/routes/calcom-settings.test.js` | 16–19 | The types carry `locations`. |
| `tests/routes/calcom-receive.test.js` | two pins | The link line from the webhook's metadata. |
| `tests/client/calcom-settings.test.js` | 170–177 and two pins | The places filter, the app names, the dropdown, the handlers, the place in the post, the keys. |

### Verification
- `npm run test:client` → **826 pass**; `npm test` → **1338 tests, 1338 pass, 0 fail.**
- Not run: a real booking with Google Meet. To try: in Cal.com install Google Meet (or Zoom), add it
  to the event type's locations, press "Terminarten aktualisieren" on the Cal.com card so the CRM
  reads the new locations, then "Termin buchen": the "Wo" dropdown lists it; after booking, the
  entry's second line is the Meet link, and the invitation carries it.

## Part 7 — 2026-10-13: the booking dialog laid out in the system's own rhythm (with /frontend-design)

**Request.** "in the UI of booking a meeting can you make it prettier because everything seems to be
clustered into one space there is no spacing".

**Why it clustered.** The dialog rendered everything into one block without the pieces the app's
forms are built from: `.field-row` for a pair of fields, `.label` for a field's label, `.help` for a
hint, and the modal body's 16 px rhythm between groups. Its labels were unstyled and every control sat
flush against the next.

### The layout now
- **A first line in the hint style** says what will happen: "Die Einladung geht an jana.weber@example.de."
- **What** — Terminart and Wo side by side in a field row (Wo only when the type offers a choice).
- **When** — a header row with the fourteen-day window on the left ("Mo, 20. Okt bis So, 2. Nov", bold,
  secondary colour) and its two buttons on the right; under it Datum and Uhrzeit side by side; under
  those, the hint "Zeiten in Europe/Berlin. Gastgeber: Mara Kühn." The date dropdown stays in place
  while the slots load (its only option reads "Freie Zeiten werden geladen"), so nothing jumps.
- **The conflict box**, when there is one.
- **The note.**
- **The one accent**: once a time is picked, a summary row in the brand tint with the calendar icon:
  "Mo, 20. Okt, 14:00 bis 14:30 (2:00 PM)" in bold, and under it "Google Meet, mit Jana Weber". It is
  what "Buchen" will do, said once; everything else stays quiet.
- Groups are 20 px apart, a group's rows 12 px; on a phone the pairs stack.

### Files and lines
| File | Lines | Change |
|---|---|---|
| `public/js/detail-views.js` | 219–241 | `render` rewritten: the `field` helper (label in the system's style), `what`, the `when` group with `nav` (range left, buttons right), `dateSel` (loading and empty states inside the dropdown), `timeSel`, the hint, `conflict`, `note`, `summary`, the order of the parts. The host div carries `class="cal-book"`. |
| `public/js/core.js` | 531 (en), 974 (de) | `cal_book_invite_to` ({email}), `cal_book_with` ({name}). |
| `public/style.css` | 1107–1121 | `.cal-book`, `.cal-book-sec`, `.cal-book-nav`, `.cal-book-range`, `.cal-book-navbtns`, `.cal-book-conflict`, `.cal-book-summary` (+ its icon, lines), `.cal-book-err`, the phone rule for `.cal-book .field-row`; `.cal-book-pick` and `.cal-book-zone` removed. |
| `tests/client/calcom-settings.test.js` | 147, 151–159, 173, 181–182 | The pins: the host class, the date dropdown's three states, the field helper, the what and when groups, the header row, the summary, the order, the two keys, the stylesheet rules present and the one-off rules gone. |

### Verification
- `npm run test:client` → **826 pass**; `npm test` → **1338 tests, 1338 pass, 0 fail.**
- Not rendered here. To look at: "Termin buchen" on a deal; the groups and their spacing; pick a time
  and see the summary row appear above the buttons; narrow the window to a phone width and see the
  pairs stack.

## Part 8 — 2026-10-13: a month calendar for the date

**Request.** "for choosing date can we do a calendar instead of per week".

### What it shows
- In the "When" group, under the month's name with two arrow buttons on the right, a seven-column
  month grid, Monday first, with the weekday heads in the interface language. A day with free times
  is tinted and clickable and says in its label how many ("3 freie Zeiten"); past days and days without
  free times are shown quiet and disabled; today is outlined; the chosen day is filled. The first
  bookable day of the month is preselected, and choosing a day hands the focus to the time dropdown.
- The arrows move by month, never before the current one; each month is read from Cal.com in one call.
  A month with nothing free says so under the grid.
- Everything else (the event type and place, the time dropdown with both clocks, the conflict check,
  the note, the summary row) is unchanged.

### Files and lines
| File | Lines | Change |
|---|---|---|
| `public/js/detail-views.js` | 158–159 | The block comment. |
| | 201 | The state: `month` instead of the fourteen-day window. |
| | 209–218 | `monthTitle`, `daysInMonth`, `addMonths`, `lead` (blanks before the 1st, Monday first), `dows` (weekday heads), `monthDays`, `bookable`. |
| | 236–243 | `render`: the month head with its arrows, the day cells, the grid with the empty-month line; the time dropdown stays. |
| | 256–263 | `load`: the whole month in one read; the first bookable day preselected. |
| | 289–290 | The arrow and day handlers (the fourteen-day handler is gone). |
| `routes/integrations.js` | 53, 678 | `GET /calcom/slots` allows up to 42 days, a month's grid. |
| `public/js/core.js` | 526–528 (en), 969–971 (de) | `cal_book_month_prev`, `cal_book_month_next`, `cal_book_none_month`; `cal_book_range`, `cal_book_prev`, `cal_book_next`, `cal_book_date_ph`, `cal_book_none_day`, `cal_book_none_week` removed. |
| `public/style.css` | 1121–1133 | `.cal-book-month`, `.cal-book-dows` / `.cal-book-grid` (seven columns), `.cal-book-dayb` with `.is-blank`, `:disabled`, `.is-free` (+ hover), `.is-today`, `.is-on`, `:focus-visible`. |
| `tests/routes/calcom-booking.test.js` | 92–95 | The clamp pin: 42 days. |
| `tests/client/calcom-settings.test.js` | 146–160, 166, the key list, the stylesheet list | The month state, the one-read URL, the preselected day, Monday first, `bookable`, the weekday heads, the day button's classes and label, the grid and its empty line, the day handler, the month head and arrows, the arrow handler, no dropdown or window left; the keys; the grid's rules. |

### Verification
- `npm run test:client` → **826 pass**; `npm test` → **1338 tests, 1338 pass, 0 fail.**
- Not rendered here. To look at: "Termin buchen"; the month grid with the tinted free days; click one,
  pick a time; the arrows to next month and back.

## Part 9 — 2026-10-13: a stale copy of the event types re-reads itself

**Request.** "all i can see is event type … 30 min meeting or secret meeting or 15 mins meeting", no
"Where" dropdown. Cause: the event types stored at connect time predate Part 6, so they carry no
`locations`, and the dropdown has nothing to show. Cal.com's list call does return `locations`
(checked against the `EventTypeOutput_2026_06_12` schema), so a fresh read is all that is needed.

### What it does
- `GET /api/integrations/calcom` notices a stored copy whose event types have no `locations` array and
  re-reads them from Cal.com once, for whoever asks (a member too), storing the fresh list and keeping
  the chosen event type when it still exists. A copy that already carries locations is left alone; if
  Cal.com cannot be reached the old copy stands and the answer is still 200. So opening the booking
  dialog after the upgrade is enough; "Refresh event types" on the card still exists for later changes.

### Files and lines
| File | Lines | Change |
|---|---|---|
| `routes/integrations.js` | 378–397 | `calRefreshStaleTypes` and its use in `GET /calcom`. |
| `tests/routes/calcom-settings.test.js` | 105–121 | **+1 test**: a stale copy is re-read once with the stored key, a current one is not, a failing Cal.com keeps the copy. |

### Verification
- `npm test` → **1339 tests, 1339 pass, 0 fail.**

## Part 10 — 2026-10-13: the dialog re-reads the event types on every open

**Request.** "but in the crm it still just cal.com there is no google meet". "Where" listing only
Cal Video means the event type's own Location list in Cal.com has only Cal Video; installing Google
Meet in the account does not add it to an event type. That half is a Cal.com setting. The CRM half:
a change in Cal.com needed "Refresh event types" to show up, which is easy to forget.

### What it does
- `GET /api/integrations/calcom?fresh=1` re-reads the event types from Cal.com before answering (for
  anyone, best effort; the chosen type stays when it still exists). Without `fresh` the status answers
  from the stored copy as before, except a copy without locations (Part 9).
- The booking dialog opens at once from the cached status and asks for a fresh read in the
  background; when it arrives, the "Event type" and "Where" dropdowns re-render with what Cal.com now
  has, without touching a day or time already picked. A location added in Cal.com therefore shows on
  the next open of the dialog, no button needed. "Refresh event types" on the card stays for the
  Settings view itself.

### Files and lines
| File | Lines | Change |
|---|---|---|
| `routes/integrations.js` | 46, 378–399 | `calRefreshStaleTypes(wid, row, force)`; `GET /calcom` passes `force` from `?fresh=1`. |
| `public/js/detail-views.js` | 165–172 | `dvCalcomStatus(fresh)`: a fresh read bypasses the one-minute cache and asks the server for one. |
| | 197–198, 308–315 | `cal` and `types` can change; after the first render the dialog refreshes them in the background and re-renders. |
| `tests/routes/calcom-settings.test.js` | 70, 121–130 | `ROW_LIKE`; **+1 test**: `?fresh=1` re-reads a current copy too, keeps the chosen type; without it a current copy is left alone. |
| `tests/client/calcom-settings.test.js` | the status and dialog pins | The `fresh` parameter and URL; the background read after the first render; the route's `force`. |

### Verification
- `npm run test:client` → **826 pass**; `npm test` → **1340 tests, 1340 pass, 0 fail.**

## Part 11 — 2026-10-13: cancel and move a booked meeting from the CRM

**Request.** "everyone can cancel, but it should be reask again if delete button or suspend meeting
is clicked just to make sure also lets add rescheduling on meeting or booking when clicked a
meeting on the activity on the edit deal view and also in calendar". Taken as: everyone may cancel
and move; both ask before acting; the actions live where a meeting entry is seen: the deal's
activity timeline, the contact's, the Activities page and the calendar's entry detail.

**Cal.com, checked.** `POST /v2/bookings/{uid}/cancel` (optional `cancellationReason`) and
`POST /v2/bookings/{uid}/reschedule` (`start`, optional `reschedulingReason`), both with
`cal-api-version 2026-02-25`; a reschedule makes a NEW booking with a new uid and names the old one
in `rescheduledFromUid`; `GET /v2/slots` takes `bookingUidToReschedule` so the booking's own slot
counts as free.

### What it does

- **A live meeting** is an entry from Cal.com with a booking id that is not cancelled. In the deal and
  contact timelines it gets two icon buttons before edit and delete: move and cancel. The Activities
  page kebab gets "Reschedule" and "Cancel meeting" above Delete. The calendar's entry detail shows a
  "Cal.com" badge, a "Cancelled" badge when it applies, and two footer buttons on a live meeting.
- **Cancel asks first:** a small dialog "Cancel this meeting?" with the consequence ("The booking is
  cancelled in Cal.com and Jana Weber is informed. The entry stays in the CRM, marked as cancelled.")
  and an optional reason the customer sees. Confirming cancels at Cal.com and marks the entry; the
  entry stays, as decided in Step 2. A booking Cal.com no longer knows is marked all the same.
- **Move** opens the booking dialog in reschedule mode: the booking's own event type and its current
  time are shown read-only, the month calendar and the time dropdown work as for a new booking, the
  booking's own slot counts as free, the meeting being moved is not its own conflict, an optional
  reason goes to the customer, and "Move" sends the new start to Cal.com. The entry takes the new
  booking id, title, time and link at once; Cal.com's later webhook lands on the same row.
- **Delete asks first and warns:** deleting a live meeting shows "This meeting is booked in Cal.com.
  Deleting the entry here does not cancel it there: the slot stays taken and the customer keeps the
  invitation." with three ways out: Cancel (abort), "Delete here only", or "Cancel meeting" (which
  then asks its own question with the reason). Anything that is not a live meeting deletes as before,
  with the existing confirmation.
- Both actions are logged under "Recent bookings" as "Cancelled from the CRM" / "Moved from the CRM".
- The booking's event type is now kept on the entry (`calcom_event_type_id`), from the webhook and from
  a booking made in the CRM, so a move asks Cal.com for the right slots.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `db.js` | 438 | `activities.calcom_event_type_id`. |
| `utils/calcom.js` | 25–26, 196–197, 230–277, 335 | Header; `getSlots` takes `bookingUidToReschedule`; `normaliseBooking` (shared; `rescheduledFromUid`, `cancellationReason`), `cancelBooking` (404 counts as cancelled, `gone`), `rescheduleBooking` (the old uid remembered); `parseBooking.eventTypeId`. |
| `routes/integrations.js` | 53–56 | Header. |
| | 647–652 | The receiver stores the booking's event type (kept on conflict when the delivery has none). |
| | 699–708 | `GET /calcom/slots?reschedule_uid=` (must be one of ours, else 404). |
| | 764–772 | `POST /calcom/book` stores the event type; the answer carries it. |
| | 783–862 | **New block:** `calMeetingEntry` (400 no id, 404 not a Cal.com meeting of this workspace, 409 already cancelled), `POST /calcom/cancel`, `POST /calcom/reschedule` (both: Cal.com's 4xx → 409, 0 → 502; the log row). |
| `routes/activities.js`, `routes/contacts.js`, `routes/calendar.js` | 134, 189; 191; 59, 85, 113, 137 | Every activity read carries `calcom_uid` and `calcom_event_type_id` (the contact's activities also `cancelled_at`). |
| `public/js/detail-views.js` | 188–227 | **New block:** `dvIsLiveMeeting`, `cancelCalcomMeeting` (the confirmation with the reason), `dvDeleteActivityGuarded` (the warning with its two ways out, else the view's own path), `dvMeetingButtons`. |
| | 229–320 | `openCalcomBooking` in reschedule mode: no email needed, the type and the current time read-only, the own slot free, itself no conflict, the reason field, "Move", the toast. |
| | 552, 699–708, 713 | The deal view: the buttons, `delAct` guarded, `reschedAct`, `cancelAct`, the handlers. |
| | 834, 995–999 | The contact view: the buttons, `act-del` guarded, `act-resched`, `act-meeting-cancel`. |
| `public/js/objects.js` | 814–818, 822–836 | The kebab's two items; `deleteActivity` guarded. |
| `public/js/calendar.js` | 490–491, 511–519 | The detail's badges, footer buttons and handlers (reload after). |
| `public/js/core.js` | 532–535 (en), 979–982 (de) | `cal_resched_*` (8), `cal_cancel_*` (6), `cal_del_*` (3), the two log keys. |
| `tests/unit/calcom.test.js` | 338–372 and one pin | **+3 tests** (cancel, reschedule, slots with the uid and the event type read). |
| `tests/routes/calcom-meeting.test.js` | 1–125 | **New, 6 tests**: what qualifies; cancel (Cal.com's body, the mark, the log; gone; 409; 502); reschedule (the new uid, time, link, log; 400 / 409 / 404; refusal leaves the entry); the reschedule slots (uid passed; a foreign uid 404). |
| `tests/routes/calcom-booking.test.js`, `tests/routes/calcom-receive.test.js` | pins | The tenth insert parameter and `calcom_event_type_id` in the answer. |
| `tests/client/calcom-settings.test.js` | 203–246 and seven pins | **+3 tests**: the meeting block (live meeting, buttons, the cancel confirmation, the guard), the reschedule mode, the four views' wiring and the keys. |
| `tests/client/activities-port.test.js` | 43–44 | The sandbox stubs the two helpers so the kebab and delete tests keep their plain path. |

### Verification
- The Cal.com unit and route suites → **60 pass** (one fake-pool fix on the way: the entry handed back
  as a snapshot, as Postgres does, so the log could keep the old uid).
- `npm run test:client` → **829 pass**; `npm test` → **1352 tests, 1352 pass, 0 fail.**
- Not run: a real cancel or move. To try: on a deal with a booked meeting, the two new icons on the
  entry; "Cancel meeting" asks and marks; "Reschedule" opens the calendar with the booking's own slot
  free; the trash icon on a live meeting shows the warning with its three choices; the same from the
  Activities page kebab and from the calendar's entry detail.

## Part 12 — 2026-10-14: the meeting link one click away; the assignee is told and invited

**Request.** "When creating a meeting I want the meeting activity to have all the information including
the link for the Google Meet, Cal.com or whatever link to the meeting; it should also send the assignee
of the deal or contact so that we know it is there." After the plan: the structured storage is "not
necessary, it's just for having the Google Meet link readily clickable in the CRM; do the tell the
assignee."

**Two pieces.**
- **The link, one click away.** Every activity text now renders its web addresses as links that open in
  a new tab (`dvActHtml` → `dvLinkify`, on escaped text, closing punctuation left outside), so a
  meeting's link is clickable in the deal timeline, the contact timeline, the deal's overview, the
  Activities page and the calendar detail. A live Cal.com meeting with a link also gets a button under
  its entry, named after the app ("Google Meet beitreten", "Zoom beitreten", "Cal Video beitreten";
  "Link zum Termin öffnen" for a host nobody knows), first in the calendar detail's footer. A click on
  a link inside a note follows the link instead of opening the editor. On the server, the receiver now
  reads the link from both places Cal.com puts it (`metadata.videoCallUrl` and `videoCallData.url`,
  the latter being where a Google Meet link lands once the calendar event exists), so the webhook that
  follows a booking fills the link in reliably. Nothing new is stored.
- **The assignee is told, and invited.** The assignee of the deal (else of the contact) gets one bell
  notification whenever a meeting is booked, moved or cancelled: from the CRM's own routes with the
  actor skipped (they did it themselves), and from the webhook for what happened on Cal.com's page (a
  NEW booking only when its row is new, a move only when the old uid still stood, a cancellation only
  when it hit a live row), so nobody is told twice. The notification carries the meeting's own title,
  the time on the assignee's clock with their zone, and where it happens; it sits under the
  "Activities" preference; clicking it opens the deal, or the contact. When a meeting is booked from
  the CRM, the assignee also rides along as a Cal.com guest, so Cal.com sends them the invitation with
  the link and it lands in their own calendar; never the host (already there), never the attendee; an
  event type that refuses guests gets the booking without them and the bell still rings.

### Files
| File | Lines | What |
|---|---|---|
| `utils/calcom.js` (432 lines) | 214, 224–225 | `createBooking` takes `guests` (trimmed, lower-cased, empties dropped; the field only when there are any). |
| | 347–350 | `parseBooking`: the link from `metadata.videoCallUrl`, then `videoCallData.url`, then `location`; the place text as `location`. |
| | 354–384 | **New:** `MEETING_APPS` + `meetingApp(url)` (the app by its host), `INTEGRATION_NAMES` + `placeLabel({url, location})` (where a meeting happens, in words), `meetingLinkOf(content)`. |
| | 404–416 | **New:** `utcFromWallClock(date, time, zone)`, the inverse of `wallClock` (two corrections, DST-safe; null on bad input). |
| | 429–430 | Exports. |
| `notifications.js` (115 lines) | 10–15, 70–86, 115 | **New:** `notifyUser(workspaceId, actorId, userId, msg)`: one person; skips the actor; honours the category preference; actorId may be null; swallows errors, answers true/false. |
| `tests/helpers/load-route.js` | 42–45 | The default stub knows `notifyUser` too. |
| `routes/integrations.js` (930 lines) | 60–65 | Header: how the assignee is told once. |
| | 76 | `notifyUser` required. |
| | 551–585 | **New:** `calAssigneeOf` (the deal's assignee, else the contact's) and `calTellAssignee` (the bell: kind, title, the time on the assignee's clock via `utcFromWallClock` + `wallClock`, the place via `placeLabel`; never throws; answers the user id told). |
| | 663–666 | The receiver, BOOKING_CANCELLED: the UPDATE also returns content and the wall clock; a row still live is announced as cancelled. |
| | 679–680 | BOOKING_RESCHEDULED: a row found by the old uid is announced as moved. |
| | 700, 704–706 | BOOKING_CREATED: `RETURNING id, (xmax = 0) AS inserted`; only a new row is announced as booked (a booking the CRM made was announced by `/calcom/book`). |
| | 779, 785 | `/calcom/book` reads `assigned_to` with the deal and the contact. |
| | 796–827 | The guest (never the host or the attendee), `make(guests)`, `refused(err)`, the one retry without guests when Cal.com's 4xx mentions guests. |
| | 839–846 | The assignee told; `guest`, `guest_dropped`, `told` in the log; the answer carries `booking.guests` and `told`. |
| | 863 | `calMeetingEntry` also reads the entry's wall clock. |
| | 888, 919 | `/calcom/cancel` and `/calcom/reschedule` tell the assignee; `told` in the log and the answer. |
| `public/js/detail-views.js` (1239 lines) | 81–84 | `dvActHtml` links its addresses; **new** `dvLinkify`. |
| | 230–253 | **New block:** `dvMeetingLink`, `DV_MEETING_APPS`, `dvMeetingApp`, `dvJoinButton(a, cls)`, `dvJoinRow(a)`. |
| | 582, 864 | The deal timeline and the contact timeline: the join row under the text. |
| | 807, 808, 1060, 1061 | A click or double click on a link inside a note follows the link, in both views. |
| `public/js/objects.js` (850 lines) | 765 | The Activities page row: the join row. |
| `public/js/calendar.js` (563 lines) | 509, 511 | The detail's note through `dvActHtml` (its links clickable); the join button first in the footer, as a primary button. |
| `public/js/notifications.js` (166 lines) | 37–39, 42–46, 91, 108 | The three meeting kinds with icons; `NOTIF_KINDS` + `notifKind` (the translated line above the title); a contact notification opens the contact. |
| `public/js/core.js` | 341, 538 (en); 791, 988 (de) | `notif_meeting_booked/moved/cancelled`, `cal_join` ("{app} beitreten"), `cal_join_link`. |
| `public/style.css` | 2708–2709, 2224 | `.dv-join-row`, `.dv-join .ic`, `.notif-kind`. |
| `tests/unit/calcom.test.js` | the last describe, 3 tests | `videoCallData.url`, `location`, `guests`; `meetingApp`, `placeLabel`, `meetingLinkOf`; `utcFromWallClock` as the inverse of `wallClock`. |
| `tests/unit/notify-user.test.js` | **New, 6 tests** | The real module over a fake pool: the row and its columns; the actor skipped; unknown user / other workspace; the preference; null actor; a failing query swallowed; `notify()` untouched. |
| `tests/routes/calcom-booking.test.js` | 9 tests (+1), the fakes | Assignees on deals, contacts and users in the fake; the fake Cal.com answers a sequence; a recording `notifyUser`; the first test pins the guest and the bell; **new:** the host as assignee (told, not invited), the booker as assignee (invited, not told), the contact's assignee, nobody responsible, the retry without guests, a refused slot not retried. |
| `tests/routes/calcom-receive.test.js` | 20 tests (+5), the fakes | `inserted` from the fake insert; **new describe:** a new booking told (contact's assignee, deal's assignee via our metadata, the Google Meet link from `videoCallData`); twice tells once and a CRM-made booking's webhook tells nobody; a move on Cal.com's page vs one the CRM made; a cancellation on Cal.com's page vs one the CRM made or an unknown one; an unknown attendee's new deal told to the lead webhook's assignee. |
| `tests/routes/calcom-meeting.test.js` | 6 tests, the fakes and two pins | The entry's wall clock in the fake; cancel tells the assignee on their clock (Manila) with the link's app; reschedule tells of the new time and link. |
| `tests/client/calcom-settings.test.js` | the last describe, 4 tests, and one pin | `dvMeetingApp` / `dvJoinButton` / `dvJoinRow` run in a sandbox; every view's markup; the click guards; the bell's kinds, icons, routing and keys; the server-side pins (both link fields, the guest rule, six `calTellAssignee` calls, `xmax = 0`). |
| `tests/client/activities-notes.test.js` | one test | A link in a note is clickable; stored markup is still stripped first. |
| `tests/client/activities-port.test.js` | the sandbox | Stubs `dvJoinRow` / `dvJoinButton`. |

### Verification
- `npm test` → **1385 pass, 0 fail** (was 1365). `npm run test:client` → **843 pass, 0 fail** (was 838).
- The seven test files that carry this part, run against a mirror of the app as committed (HEAD,
  `git archive`, `TEST_APP_ROOT`): every file fails there (the mirror has none of today's uncommitted
  Cal.com work, so the failure covers the whole integration, not this part alone). What is specific to
  this part has no counterpart in the previous code: the recorded `notifyUser` calls, the `guests`
  field in Cal.com's body, the join button and the linkified text.
- Reasoned through, not run against Cal.com: the guest list is Cal.com's own `guests` field (the create
  booking schema); `(xmax = 0)` is Postgres's way to tell an inserted row from an updated one after
  `ON CONFLICT DO UPDATE`; the two-pass `utcFromWallClock` lands on a real instant through a DST gap
  (pinned).

### Please try
- Book a meeting from a deal whose assignee is someone else: they get the bell "Termin gebucht" with the
  time on their own clock and, if the event type allows guests, Cal.com's invitation; under the entry
  the "Google Meet beitreten" button appears as soon as the webhook has delivered the link.
- Move and cancel it from the CRM: the bell says "Termin verschoben" / "Termin abgesagt".
- Have a customer book on the Cal.com page: the assignee of the matched contact (or the lead webhook's
  default assignee for a new contact) is told.

## Part 13 — 2026-10-14: a setup guide on the Cal.com tab, in the Make guide's clothes

**Request.** "Right now API key is better, right? Can we have a guide to connect it? … like how Make does it
on their guide." (OAuth via "Continue with Cal.com" was researched first: possible, but every CRM host must
be registered on an OAuth client that a Cal.com admin has to approve, so the key stays for now.)

**What was built.** The Cal.com card gets the same guide panel the Platforms tab draws for Make, Zapier and
n8n: an inline mark, the title "So wird Cal.com verbunden" over "Einrichtungsanleitung", seven numbered
steps with the labels of Cal.com's own menus in bold, and a closing note. The steps: log in with the
account whose calendar the team uses; Settings → Developer → API keys → New, name it, "Never expires",
Create (Cal.com's current flow, checked against its docs); copy at once, shown only once, starts with
`cal_live_`; paste and Connect (encrypted at rest, never shown again; the webhook registers itself in the
same step); pick the event type; for Google Meet or Zoom connect the app in Cal.com and add it to the
event type's Location, then refresh the event types; check the webhook line under Connected account and
press Register webhook if the CRM was not reachable. The panel is open while nothing is connected and
folds to its header once connected, with a button that opens it again. Shown to owners and admins (the
people who can connect). German impersonal; Cal.com's labels quoted in the page's language, since
Cal.com's UI is localised.

### Files
| File | Lines | What |
|---|---|---|
| `public/index.html` | 1354–1357 | `#cal-guide-section` with the `intg-guide-panel` `#cal-guide-panel`, right after the key field. |
| `public/js/integrations.js` | 826–857 | **New:** `CAL_GUIDE` (the mark, seven step keys, the note key), `calGuideOpen`, `renderCalcomGuide(connected)` (the Make guide's header, the fold button, the steps inserted as dictionary strings with markup), `toggleCalcomGuide()`. |
| | 877–878 | `renderCalcom` shows the section to managers and renders the guide before the disconnected early return. |
| `public/js/core.js` | 518–526 (en), 977–985 (de) | `cal_guide_title/show/hide`, `cal_guide_step1…7`, `cal_guide_note`. |
| `public/style.css` | 1697, 1742 | `.intg-guide-toggle` (the button at the header's right edge); `.intg-guide-note` shares the Platforms note's rule. |
| `tests/client/calcom-settings.test.js` | the last describe, 1 test | The panel's place; the renderer's anatomy and fold logic; the toggle; the keys in both languages, impersonal, with the words that matter (the menu path and the expiry switch in bold, the `cal_live_` prefix, shown once, Connect, Google Meet, Register webhook) and no markup beyond strong and code. |

### Verification
- `node --test tests/client/calcom-settings.test.js` → the runner reports **20 pass, 0 fail** (its count
  groups the describes); `npm run test:client` → **844 pass, 0 fail**; the i18n sweep and the Integrations
  design test pass unchanged. The server is untouched.
- Baseline: the same test file run against a full copy of the working tree with the panel's three lines
  removed from `index.html` (`TEST_APP_ROOT`): **19 pass, 1 fail**, the failure being the new guide
  test at the panel's place (not ok 1 - the panel sits in the card right after the key fi…); the working tree passes.
- Not run in a browser: open Integrations → Cal.com as an owner before connecting (the guide open under the
  key field), connect (it folds to its header), press "Anleitung anzeigen", switch the language.
