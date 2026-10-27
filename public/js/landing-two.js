'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   /landingpagetwo — "Das CRM, das mit anpackt." (LOGIN_LANDING_CHANGES Part 48, 2026-10-22).

   The second landing page, rebuilt to sell and to be played with. Three working pieces,
   every one of them honest to the code (the rules are named beside each function):

   1. The hero board. The app's Deals board with sample data, live: leads drop into the
      first stage by themselves (the inbound address makes a deal titled with the person's
      name, no value, no owner), the bell rings for a booked meeting and for Notetaker's
      notes (the two things the app rings the bell for), and a numbered list beside it says
      what happened without anyone typing. The visitor drags any card (or taps it for the
      stage menu); a move answers with the app's toast and Undo. Won is the team's move:
      nothing moves a card to Won by itself, and when one lands there the Upgrads Engine
      answers (Zugestellt, then its first status).
   2. The five jobs. Five numbered panels, one open at a time, that walk one deal (Jonas
      Becker) through what Upgrads does: the lead arrives from a source; the meeting is
      booked with the app's conflict rule; Notetaker's note lands, written exactly as
      utils/notetaker.js resultNote() writes it; the win with Undo; the Engine's statuses
      in the order of routes/engine-api.js. "Alles zeigen" plays all five.
   3. The rest of the day. Tabs for tasks (tick with Undo, quick add with Enter), the week,
      the team chat, the win rate (won / (won + lost), moved by the deal won above) and
      the list the team names itself (Settings, "Bezeichnung für Objekte").

   PI_I18N  every word, German and English. The markup carries the German values, so the
            page reads right before the script runs. pi_app_* are the app's own words
            (pinned to public/js/core.js TRANSLATIONS by the tests); pi_s_* are sample data
            inside the screens.
   The state of each piece is a pure value changed by pure functions (piBoardMove,
   piHeroEvent, piJobAct, piDayAct, …); the DOM layer below them only draws (textContent
   only, no markup strings) and schedules the few delayed answers through piLater.
   The request at the end: GET /api/landing/status says whether a request can land in the
   Upgrads team's CRM (routes/landing.js); POST /api/landing/ask, else the mail app opens
   with the request filled in (team@upgrads.de).
   ═══════════════════════════════════════════════════════════════════════════ */

const PI_I18N = {
  de: {
    pi_crm: 'CRM', pi_nav: 'Seiten', pi_nav_jobs: 'Ablauf', pi_nav_day: 'Funktionen', pi_nav_faq: 'Fragen', pi_lang: 'Sprache', pi_login: 'Anmelden', pi_request: 'Zugang anfragen',
    pi_h1: 'Das CRM, das mit anpackt.',
    pi_sub: 'Leads tragen sich selbst ein, Termine landen im Deal, Gesprächsnotizen kommen nach. Das Team verkauft.',
    pi_try: 'Selbst ausprobieren', pi_for1: 'Für Vertriebsteams', pi_for2: 'Deutsch und Englisch', pi_for3: 'Nur auf Einladung',
    pi_stage_aria: 'Upgrads mit Beispieldaten: das Deals-Board zum Ausprobieren',
    pi_feed_t: 'Erledigt, ohne Abtippen', pi_feed_empty: 'Gleich kommt der erste Lead.',
    pi_feed_lead_d: '{name}, über {src}', pi_feed_meet_d: '{deal}, {when}, über Cal.com', pi_feed_note_d: '{deal}, aus dem Google Meet',
    pi_feed_won_d: '{deal}, von Hand', pi_feed_engine_d: '{deal}, an die Upgrads Engine', pi_feed_form_d: '{deal}, gemeldet von der Upgrads Engine',
    pi_hint: 'Karten lassen sich ziehen. Gewonnen bleibt ein Zug des Teams.', pi_close: 'Schließen',
    pi_with_t: 'Arbeitet mit',
    pi_src_form: 'Website-Formular', pi_src_make: 'Make', pi_src_zapier: 'Zapier', pi_src_n8n: 'n8n', pi_src_cal: 'Cal.com', pi_src_meet: 'Google Meet', pi_src_csv: 'CSV-Import',
    pi_jobs_t: 'So packt Upgrads mit an.', pi_jobs_count: '{n} von 5 ausprobiert', pi_jobs_play: 'Alles zeigen', pi_jobs_again: 'Von vorn', pi_goto: 'Zu Schritt {n}',
    pi_j1_t: 'Die Anfrage trägt sich ein.', pi_j1_d: 'Aus dem Website-Formular oder über Make, Zapier und n8n. Kontakt und Deal liegen bereit.', pi_j1_do: 'Eine Quelle antippen:', pi_log_empty: 'Noch keine Leads.',
    pi_j2_t: 'Der Termin wird im Deal gebucht.', pi_j2_d: 'Nur offene Zeiten aus Cal.com, mit Blick in den Teamkalender. Die Einladung schickt Cal.com.', pi_need_lead: 'Zuerst kommt der Lead.',
    pi_j3_t: 'Die Notizen kommen nach.', pi_j3_d: 'Notetaker nimmt das Google Meet auf und legt die Notizen in den Deal.', pi_j3_live: 'Aufnahme läuft', pi_j3_end: 'Gespräch beenden', pi_need_rec: 'Erst den Termin mit Notetaker buchen.', pi_j3_meet: 'Erstgespräch mit {name}',
    pi_j4_t: 'Gewonnen ist ein Zug.', pi_j4_d: 'Den macht das Team, auf dem Board oder im Deal. Rückgängig inklusive.', pi_j4_btn: 'Nach Gewonnen verschieben',
    pi_j5_t: 'Das Onboarding läuft weiter.', pi_j5_d: 'Nach dem Abschluss übernimmt die Upgrads Engine und meldet jeden Schritt zurück.', pi_need_won: 'Erst den Deal gewinnen.', pi_j5_note: 'Onboarding-Formular an {name} versendet.',
    pi_day_t: 'Und der Rest vom Vertriebstag.', pi_tab_list: 'Eigene Liste',
    pi_day_tasks: 'Mit Uhrzeit im Kalender. Ein Haken, erledigt.', pi_day_cal: 'Gebuchte Termine und Aufgaben mit Uhrzeit, in einer Woche.', pi_day_chat: 'Ein Raum fürs ganze Team. Wer online ist, steht oben.',
    pi_day_an: 'Die Abschlussquote rechnet mit den eigenen Phasen.', pi_day_list: 'Die Liste heißt, wie das Team arbeitet.', pi_send: 'Senden',
    pi_faq_t: 'Fragen',
    pi_q1: 'Wer bekommt Zugang?', pi_a1: 'Eingeladene Teams. Das Upgrads-Team richtet den Arbeitsbereich ein, weitere Mitglieder kommen per Code dazu.',
    pi_q2: 'Muss noch etwas abgetippt werden?', pi_a2: 'Anfragen, Cal.com-Buchungen und Notetaker-Notizen nicht. Bestehende Kontakte kommen per CSV-Datei herein.',
    pi_q3: 'Schreibt Upgrads den Kunden?', pi_a3: 'Nein. Die Einladung schickt Cal.com, Anruf, E-Mail und WhatsApp öffnen die eigenen Apps.',
    pi_q4: 'Was sind Notetaker und die Upgrads Engine?', pi_a4: 'Zwei Dienste von Upgrads. Notetaker nimmt Google-Meet-Termine auf, die Engine übernimmt das Onboarding nach dem Abschluss.',
    pi_c_t: 'Bereit für ein CRM, das mit anpackt?',
    pi_c_d: 'Name und E-Mail genügen. Die Anfrage landet als Lead im CRM des Upgrads-Teams.',
    pi_c_d_mail: 'Name und E-Mail genügen. Die Anfrage geht per Mail an das Upgrads-Team.',
    pi_f_name: 'Name', pi_f_email: 'E-Mail', pi_f_company: 'Firma (optional)', pi_f_err: 'Bitte einen Namen und eine E-Mail-Adresse eintragen.',
    pi_f_send_mail: 'Per Mail anfragen', pi_f_sending: 'Wird gesendet …', pi_f_privacy: 'Die Angaben dienen nur dieser Anfrage.', pi_privacy: 'Datenschutz',
    pi_done_crm: 'Angekommen. Die Antwort kommt vom Upgrads-Team.', pi_done_mail: 'Das Mailprogramm ist offen, die Anfrage steht schon drin.',
    pi_mail_subject: 'Anfrage zu Upgrads CRM', pi_mail_company: 'Firma',
    pi_foot: 'Upgrads CRM für Vertriebsteams', pi_fiction: 'Namen und Zahlen in den Bildschirmen sind erfunden.', pi_legal: 'Rechtliches', pi_imprint: 'Impressum',
    // inside the screens: sample data
    pi_s_pipe: 'Vertrieb', pi_s_st0: 'Neu', pi_s_st1: 'Kontaktiert', pi_s_st2: 'Angebot', pi_s_st3: 'Verhandlung', pi_s_st4: 'Gewonnen',
    pi_s_when: 'Di., 14:00', pi_s_type: 'Erstgespräch', pi_s_ev_callback: 'Rückruf Lena Hoffmann', pi_s_ev_contract: 'Vertrag Optik Brandt prüfen',
    pi_s_task1: 'Angebot an Jonas Becker schicken', pi_s_task2: 'Rückruf Lena Hoffmann', pi_s_task3: 'Vertrag Optik Brandt prüfen',
    pi_s_msg1: 'Praxis Neumann hat für Dienstag gebucht.', pi_s_msg2: 'Super, ich bereite das Angebot vor.', pi_s_msg3: 'Danke, ist notiert.',
    pi_s_l1: 'Immobilien', pi_s_l2: 'Praxen', pi_s_l3: 'Fahrzeuge',
    // inside the screens: the app's own words (pinned to TRANSLATIONS)
    pi_app_ws: 'Arbeitsbereich', pi_app_tools: 'Werkzeuge', pi_app_deals: 'Deals', pi_app_contacts: 'Kontakte', pi_app_tasks: 'Aufgaben', pi_app_chat: 'Team-Chat', pi_app_calendar: 'Kalender',
    pi_app_analytics: 'Analysen', pi_app_onboarding: 'Onboarding', pi_app_integrations: 'Integrationen', pi_app_search: 'Zu einer Seite springen…', pi_app_new: 'Neu', pi_app_notifications: 'Benachrichtigungen',
    pi_app_moved: 'Verschoben nach {s}', pi_app_undo: 'Rückgängig', pi_app_move: 'In Phase verschieben', pi_app_urg3: 'Hoch', pi_app_stage: 'Phase',
    pi_app_leads_t: 'Empfangene Leads', pi_app_lead: 'Lead empfangen', pi_app_now: 'Gerade eben', pi_app_by: 'von {name}', pi_app_meeting: 'Termin', pi_app_note: 'Notiz',
    pi_app_booked: 'Termin gebucht', pi_app_nt_done: 'Notetaker-Notizen sind da',
    pi_app_book_title: 'Termin mit {name} buchen', pi_app_invite_to: 'Die Einladung geht an {email}.', pi_app_type: 'Terminart', pi_app_minutes: '{n} Min.', pi_app_where: 'Wo',
    pi_app_n_times: '{n} freie Zeiten', pi_app_slot: '{from} bis {to} ({ampm})', pi_app_zone: 'Zeiten in {zone}. Gastgeber: {host}.',
    pi_app_conflict: 'Konflikt: um {time} steht bereits {title} ({who}) im Kalender.', pi_app_conflict_hint: 'Cal.com kennt die Aufgaben und Einträge dieses CRM nicht. Trotzdem buchen oder eine andere Zeit wählen.',
    pi_app_anyway: 'Trotzdem buchen', pi_app_submit: 'Buchen', pi_app_booking: 'Wird gebucht', pi_app_done: 'Gebucht: {when}. Cal.com schickt die Einladung.',
    pi_app_record: 'Mit Notetaker aufzeichnen', pi_app_rec_checking: 'Es wird geprüft, ob Notetaker bereit ist …', pi_app_rec_scheduled: 'Notetaker ist zum Start des Meetings eingeplant.',
    pi_app_rec_short: 'mit Notetaker', pi_app_with: 'mit {name}', pi_app_join: '{app} beitreten',
    pi_app_pending: 'Ausstehend', pi_app_delivered: 'Zugestellt',
    pi_app_col_deal: 'Deal', pi_app_col_customer: 'Kunde', pi_app_col_status: 'Engine-Status', pi_app_col_delivery: 'Webhook',
    pi_app_st_formular_versendet: 'Formular versendet', pi_app_st_formular_ausgefuellt: 'Formular ausgefüllt', pi_app_st_termin_gebucht: 'Termin gebucht',
    pi_app_st_call_erfolgt: 'Call erfolgt', pi_app_st_briefing_fertig: 'Briefing fertig', pi_app_st_onboarding_abgeschlossen: 'Abgeschlossen', pi_app_st_kein_onboarding: 'Kein Onboarding',
    pi_app_tk_all: 'Alle Aufgaben', pi_app_tk_mine: 'Meine Aufgaben', pi_app_tk_add: 'Aufgabe hinzufügen', pi_app_tk_enter: 'Enter drücken zum Hinzufügen', pi_app_tk_added: 'Aufgabe hinzugefügt zu {g}',
    pi_app_tk_done: 'Aufgabe erledigt', pi_app_tk_reopened: 'Aufgabe wieder geöffnet', pi_app_due_today: 'Heute fällig um {time}', pi_app_overdue: '{n} Tage überfällig', pi_app_tomorrow: 'Morgen',
    pi_app_week: 'Woche', pi_app_chat_ph: 'Nachricht an dein Team…', pi_app_online: 'Online:',
    pi_app_an_open: 'Offene Pipeline', pi_app_an_won: 'Gewonnener Wert', pi_app_an_rate: 'Abschlussquote', pi_app_an_new: 'Neue Deals', pi_app_an_snapshot: 'Aktueller Stand', pi_app_an_wl: '{w} gewonnen, {l} verloren',
    pi_app_obj_name: 'Bezeichnung für Objekte', pi_app_obj_add: '{name} hinzufügen', pi_app_obj_default: 'Objekte', pi_app_obj_hint: 'Jedes Feld wird zu einer Spalte in {name} und zu einer Eigenschaft jedes Eintrags.',
  },
  en: {
    pi_crm: 'CRM', pi_nav: 'Pages', pi_nav_jobs: 'How it works', pi_nav_day: 'Features', pi_nav_faq: 'Questions', pi_lang: 'Language', pi_login: 'Sign in', pi_request: 'Request access',
    pi_h1: 'The CRM that pitches in.',
    pi_sub: 'Leads enter themselves, meetings land on the deal, call notes follow. The team gets to sell.',
    pi_try: 'Try it yourself', pi_for1: 'For sales teams', pi_for2: 'German and English', pi_for3: 'By invitation only',
    pi_stage_aria: 'Upgrads with sample data: the deals board to try out',
    pi_feed_t: 'Done, without typing', pi_feed_empty: 'The first lead is on its way.',
    pi_feed_lead_d: '{name}, via {src}', pi_feed_meet_d: '{deal}, {when}, via Cal.com', pi_feed_note_d: '{deal}, from the Google Meet',
    pi_feed_won_d: '{deal}, by hand', pi_feed_engine_d: '{deal}, to the Upgrads Engine', pi_feed_form_d: '{deal}, reported by the Upgrads Engine',
    pi_hint: 'Cards can be dragged. Winning stays the team\'s move.', pi_close: 'Close',
    pi_with_t: 'Works with',
    pi_src_form: 'Website form', pi_src_make: 'Make', pi_src_zapier: 'Zapier', pi_src_n8n: 'n8n', pi_src_cal: 'Cal.com', pi_src_meet: 'Google Meet', pi_src_csv: 'CSV import',
    pi_jobs_t: 'How Upgrads pitches in.', pi_jobs_count: '{n} of 5 tried', pi_jobs_play: 'Show me everything', pi_jobs_again: 'Start over', pi_goto: 'Go to step {n}',
    pi_j1_t: 'The enquiry files itself.', pi_j1_d: 'From the website form or via Make, Zapier and n8n. Contact and deal are ready.', pi_j1_do: 'Tap a source:', pi_log_empty: 'No leads yet.',
    pi_j2_t: 'Meetings are booked in the deal.', pi_j2_d: 'Only open times from Cal.com, checked against the team calendar. Cal.com sends the invitation.', pi_need_lead: 'The lead comes first.',
    pi_j3_t: 'The notes follow.', pi_j3_d: 'Notetaker records the Google Meet and puts the notes on the deal.', pi_j3_live: 'Recording', pi_j3_end: 'End the call', pi_need_rec: 'Book the meeting with Notetaker first.', pi_j3_meet: 'First call with {name}',
    pi_j4_t: 'Winning is one move.', pi_j4_d: 'The team makes it, on the board or in the deal. Undo included.', pi_j4_btn: 'Move to Won',
    pi_j5_t: 'Onboarding carries on.', pi_j5_d: 'After the win the Upgrads Engine takes over and reports each step back.', pi_need_won: 'Win the deal first.', pi_j5_note: 'Onboarding form sent to {name}.',
    pi_day_t: 'And the rest of the sales day.', pi_tab_list: 'A list of its own',
    pi_day_tasks: 'With a time on the calendar. One tick, done.', pi_day_cal: 'Booked meetings and timed tasks, in one week.', pi_day_chat: 'One room for the team. Who is online shows on top.',
    pi_day_an: 'The win rate counts with the team\'s own stages.', pi_day_list: 'The list is named the way the team works.', pi_send: 'Send',
    pi_faq_t: 'Questions',
    pi_q1: 'Who gets access?', pi_a1: 'Invited teams. The Upgrads team sets up the workspace, and more members join with a code.',
    pi_q2: 'Does anything still need typing in?', pi_a2: 'Not enquiries, Cal.com bookings or Notetaker notes. Existing contacts come in from a CSV file.',
    pi_q3: 'Does Upgrads write to customers?', pi_a3: 'No. Cal.com sends the invitation, and call, email and WhatsApp open the team\'s own apps.',
    pi_q4: 'What are Notetaker and the Upgrads Engine?', pi_a4: 'Two Upgrads services. Notetaker records Google Meet calls, the Engine takes over onboarding after the win.',
    pi_c_t: 'Ready for a CRM that pitches in?',
    pi_c_d: 'A name and an email are enough. The request lands as a lead in the Upgrads team\'s CRM.',
    pi_c_d_mail: 'A name and an email are enough. The request goes to the Upgrads team by email.',
    pi_f_name: 'Name', pi_f_email: 'Email', pi_f_company: 'Company (optional)', pi_f_err: 'Please enter a name and an email address.',
    pi_f_send_mail: 'Request by email', pi_f_sending: 'Sending …', pi_f_privacy: 'The details are used for this request only.', pi_privacy: 'Privacy',
    pi_done_crm: 'Arrived. The Upgrads team will reply.', pi_done_mail: 'The mail app is open with the request filled in.',
    pi_mail_subject: 'Request about Upgrads CRM', pi_mail_company: 'Company',
    pi_foot: 'Upgrads CRM for sales teams', pi_fiction: 'Names and numbers in the screens are made up.', pi_legal: 'Legal', pi_imprint: 'Legal notice',
    pi_s_pipe: 'Sales', pi_s_st0: 'New', pi_s_st1: 'Contacted', pi_s_st2: 'Proposal', pi_s_st3: 'Negotiation', pi_s_st4: 'Won',
    pi_s_when: 'Tue, 14:00', pi_s_type: 'First call', pi_s_ev_callback: 'Call back Lena Hoffmann', pi_s_ev_contract: 'Check the Optik Brandt contract',
    pi_s_task1: 'Send the proposal to Jonas Becker', pi_s_task2: 'Call back Lena Hoffmann', pi_s_task3: 'Check the Optik Brandt contract',
    pi_s_msg1: 'Praxis Neumann booked for Tuesday.', pi_s_msg2: 'Great, I\'ll prepare the proposal.', pi_s_msg3: 'Thanks, noted.',
    pi_s_l1: 'Properties', pi_s_l2: 'Practices', pi_s_l3: 'Vehicles',
    pi_app_ws: 'Workspace', pi_app_tools: 'Tools', pi_app_deals: 'Deals', pi_app_contacts: 'Contacts', pi_app_tasks: 'Tasks', pi_app_chat: 'Team Chat', pi_app_calendar: 'Calendar',
    pi_app_analytics: 'Analytics', pi_app_onboarding: 'Onboarding', pi_app_integrations: 'Integrations', pi_app_search: 'Go to a page…', pi_app_new: 'New', pi_app_notifications: 'Notifications',
    pi_app_moved: 'Moved to {s}', pi_app_undo: 'Undo', pi_app_move: 'Move to stage', pi_app_urg3: 'High', pi_app_stage: 'Stage',
    pi_app_leads_t: 'Received leads', pi_app_lead: 'Lead received', pi_app_now: 'Just now', pi_app_by: 'by {name}', pi_app_meeting: 'Meeting', pi_app_note: 'Note',
    pi_app_booked: 'Meeting booked', pi_app_nt_done: 'Notetaker notes are in',
    pi_app_book_title: 'Book a meeting with {name}', pi_app_invite_to: 'The invitation goes to {email}.', pi_app_type: 'Event type', pi_app_minutes: '{n} min', pi_app_where: 'Where',
    pi_app_n_times: '{n} free times', pi_app_slot: '{from} to {to} ({ampm})', pi_app_zone: 'Times in {zone}. Host: {host}.',
    pi_app_conflict: 'Conflict: {time} {title} ({who}) is already on the calendar.', pi_app_conflict_hint: 'Cal.com does not see the tasks and entries of this CRM. Book anyway, or pick another time.',
    pi_app_anyway: 'Book anyway', pi_app_submit: 'Book', pi_app_booking: 'Booking', pi_app_done: 'Booked: {when}. Cal.com sends the invitation.',
    pi_app_record: 'Record with Notetaker', pi_app_rec_checking: 'Checking whether Notetaker is ready…', pi_app_rec_scheduled: 'Notetaker is booked for the start of the meeting.',
    pi_app_rec_short: 'with Notetaker', pi_app_with: 'with {name}', pi_app_join: 'Join {app}',
    pi_app_pending: 'Pending', pi_app_delivered: 'Delivered',
    pi_app_col_deal: 'Deal', pi_app_col_customer: 'Customer', pi_app_col_status: 'Engine status', pi_app_col_delivery: 'Webhook',
    pi_app_st_formular_versendet: 'Form sent', pi_app_st_formular_ausgefuellt: 'Form completed', pi_app_st_termin_gebucht: 'Appointment booked',
    pi_app_st_call_erfolgt: 'Call done', pi_app_st_briefing_fertig: 'Briefing ready', pi_app_st_onboarding_abgeschlossen: 'Completed', pi_app_st_kein_onboarding: 'No onboarding',
    pi_app_tk_all: 'All tasks', pi_app_tk_mine: 'My tasks', pi_app_tk_add: 'Add task', pi_app_tk_enter: 'Press Enter to add', pi_app_tk_added: 'Task added to {g}',
    pi_app_tk_done: 'Task completed', pi_app_tk_reopened: 'Task reopened', pi_app_due_today: 'Due today at {time}', pi_app_overdue: '{n} days overdue', pi_app_tomorrow: 'Tomorrow',
    pi_app_week: 'Week', pi_app_chat_ph: 'Message your team...', pi_app_online: 'Online:',
    pi_app_an_open: 'Open pipeline', pi_app_an_won: 'Won value', pi_app_an_rate: 'Win rate', pi_app_an_new: 'New deals', pi_app_an_snapshot: 'Current snapshot', pi_app_an_wl: '{w} won, {l} lost',
    pi_app_obj_name: 'Name for listings', pi_app_obj_add: 'Add {name}', pi_app_obj_default: 'Listings', pi_app_obj_hint: 'Each field becomes a column in {name} and a property on every item.',
  },
};

let piLang = 'de';
function piWord(k, lang) { const L = lang || piLang; return (PI_I18N[L] || PI_I18N.de)[k] ?? PI_I18N.de[k] ?? k; }
function piFill(k, vars, lang) { return piWord(k, lang).replace(/\{(\w+)\}/g, (m, v) => (vars && v in vars ? String(vars[v]) : m)); }

// ── formats, as the app writes them ───────────────────────────────────────────
// Card values: public/js/deals.js fmtEUR (de-DE in both languages, no decimals); "—" for none.
function piEuro(n) { return n == null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }
// Analytics money: public/js/analytics.js fmtCurrency (the page's language, compact from a thousand up).
function piMoney(n, lang) {
  const big = Math.abs(n) >= 1000;
  return new Intl.NumberFormat(piLocale(lang), { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol', notation: big ? 'compact' : 'standard', minimumFractionDigits: 0, maximumFractionDigits: big ? 1 : 0 }).format(n);
}
function piLocale(lang) { return (lang || piLang) === 'en' ? 'en-GB' : 'de-DE'; }
// The booking dialog's clocks (public/js/detail-views.js openCalcomBooking): the wall clock is written as UTC so no
// zone can shift it; the day at noon, the time 24-hour in the page's language and 12-hour in en-US beside it.
function piMin(hhmm) { return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)); }
function piHhmm(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
function piUtc(iso, hhmm) { return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)))); }
function piTime(iso, hhmm, lang) { return piUtc(iso, hhmm).toLocaleTimeString(piLocale(lang), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); }
function piAmPm(iso, hhmm) { return piUtc(iso, hhmm).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }); }
function piDayLabel(iso, lang) { return piUtc(iso, '12:00').toLocaleDateString(piLocale(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
function piSlotLabel(iso, hhmm, lang) { return piFill('pi_app_slot', { from: piTime(iso, hhmm, lang), to: piTime(iso, piHhmm(piMin(hhmm) + PI_MEET_LEN), lang), ampm: piAmPm(iso, hhmm) }, lang); }
// The toast after booking: `${fmtWhen(start)} (${fmtAmPm(start)})` inside cal_book_done.
function piWhen(iso, hhmm, lang) { return `${piUtc(iso, hhmm).toLocaleString(piLocale(lang), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} (${piAmPm(iso, hhmm)})`; }

// ── the sample team and data (names are the same in both languages) ──────────
const PI_TEAM = { AW: 'Anna Weiß', TK: 'Tim Krüger', MS: 'Mira Sommer' };
const PI_ME = 'AW';
const PI_STAGES = ['pi_s_st0', 'pi_s_st1', 'pi_s_st2', 'pi_s_st3', 'pi_s_st4'];
const PI_WON = 4;   // Gewonnen: the demo pipeline's won stage and the Engine's trigger stage

// ═══ 1 · the hero board ═══════════════════════════════════════════════════════
const PI_BOARD_SEED = [
  { id: 'b1', title: 'Café Lindner', who: 'Ella Lindner, Café Lindner', value: 3200, stage: 0, owner: 'TK', urg: 0 },
  { id: 'b2', title: 'Studio Falk', who: 'Ben Falk, Studio Falk', value: 6800, stage: 1, owner: 'AW', urg: 0 },
  { id: 'b3', title: 'Hof & Söhne', who: 'Karl Hof, Hof & Söhne', value: 9500, stage: 1, owner: 'TK', urg: 0 },
  { id: 'b4', title: 'Praxis Neumann', who: 'Lena Neumann, Praxis Neumann', value: 12400, stage: 2, owner: 'AW', urg: 0 },
  { id: 'b5', title: 'Kanzlei Roth', who: 'Eva Roth, Kanzlei Roth', value: 18000, stage: 3, owner: 'TK', urg: 3 },
  { id: 'b6', title: 'Optik Brandt', who: 'Jan Brandt, Optik Brandt', value: 7900, stage: 4, owner: 'AW', urg: 0 },
];
// What arrives by itself, in this order: two leads through the inbound address, the bell for the booked meeting
// (routes/integrations.js calTellAssignee) and for Notetaker's notes (routes/notetaker.js). Nothing here moves a card.
const PI_HERO_SCRIPT = [
  { at: 1400, kind: 'lead', id: 'b7', name: 'Jonas Becker', company: 'Becker Haustechnik', src: 'pi_src_form' },
  { at: 4400, kind: 'meeting', deal: 'b4' },
  { at: 7400, kind: 'note', deal: 'b4' },
  { at: 10400, kind: 'lead', id: 'b8', name: 'Mira Schulz', company: 'Schulz Design', src: 'pi_src_zapier' },
];

function piBoardInitial() { return { cards: PI_BOARD_SEED.map(c => ({ ...c })), feed: [], bell: 0, ring: null, last: null, told: [] }; }
function piBoardCard(s, id) { return s.cards.find(c => c.id === id) || null; }
function piBoardCount(s, stage) { return s.cards.filter(c => c.stage === stage).length; }
// The 3 px bar under a column head: the column's value over the value of all deals (public/js/deals.js renderDealsBoard).
function piBoardShare(s, stage) {
  const sum = list => list.reduce((a, c) => a + (c.value || 0), 0);
  const all = sum(s.cards);
  return all ? sum(s.cards.filter(c => c.stage === stage)) / all : 0;
}
// A lead from the inbound address becomes a contact and a deal titled with the person's name, in the first stage,
// with no value and no owner (routes/integrations.js /receive/:key). The two bells go to the deal's people.
function piHeroEvent(s, ev) {
  if (ev.kind === 'lead') {
    if (piBoardCard(s, ev.id)) return s;
    const card = { id: ev.id, title: ev.name, who: `${ev.name}, ${ev.company}`, value: null, stage: 0, owner: null, urg: 0, fresh: true };
    return { ...s, cards: [...s.cards, card], feed: [...s.feed, { n: 1, kind: 'lead', name: ev.name, src: ev.src }] };
  }
  if (ev.kind === 'meeting' || ev.kind === 'note') {
    const deal = piBoardCard(s, ev.deal); if (!deal) return s;
    return { ...s, bell: s.bell + 1, ring: { kind: ev.kind, deal: deal.title }, feed: [...s.feed, { n: ev.kind === 'meeting' ? 2 : 3, kind: ev.kind, deal: deal.title }] };
  }
  if (ev.kind === 'delivered' || ev.kind === 'form') {
    const deal = piBoardCard(s, ev.deal); if (!deal) return s;
    return { ...s, feed: [...s.feed, { n: 5, kind: ev.kind, deal: deal.title }] };
  }
  return s;
}
// A move by hand: the card changes column at once and the toast offers Undo (public/js/deals.js moveDealToStage).
// Into the won stage the Engine is told (routes/deals.js fireEngine): once per card on this page.
function piBoardMove(s, id, stage) {
  const c = piBoardCard(s, id);
  if (!c || !Number.isInteger(stage) || stage < 0 || stage >= PI_STAGES.length || c.stage === stage) return s;
  const won = stage === PI_WON;
  return {
    ...s,
    cards: s.cards.map(x => (x.id === id ? { ...x, stage, fresh: false } : x)),
    feed: won ? [...s.feed, { n: 4, kind: 'won', deal: c.title }] : s.feed,
    told: won && !s.told.includes(id) ? [...s.told, id] : s.told,
    last: { id, from: c.stage, to: stage },
  };
}
function piBoardUndo(s) {
  if (!s.last) return s;
  const { id, from } = s.last;
  return { ...s, cards: s.cards.map(x => (x.id === id ? { ...x, stage: from } : x)), last: null };
}
function piFeedTitle(item, lang) {
  return { lead: () => piWord('pi_app_lead', lang), meeting: () => piWord('pi_app_booked', lang), note: () => piWord('pi_app_nt_done', lang),
    won: () => piFill('pi_app_moved', { s: piWord(PI_STAGES[PI_WON], lang) }, lang), delivered: () => piWord('pi_app_delivered', lang),
    form: () => piWord('pi_app_st_formular_versendet', lang) }[item.kind]();
}
function piFeedDetail(item, lang) {
  if (item.kind === 'lead') return piFill('pi_feed_lead_d', { name: item.name, src: piWord(item.src, lang) }, lang);
  const key = { meeting: 'pi_feed_meet_d', note: 'pi_feed_note_d', won: 'pi_feed_won_d', delivered: 'pi_feed_engine_d', form: 'pi_feed_form_d' }[item.kind];
  return piFill(key, { deal: item.deal, when: piWord('pi_s_when', lang) }, lang);
}

// ═══ 2 · the five jobs ════════════════════════════════════════════════════════
const PI_LEADS = [
  { name: 'Jonas Becker', company: 'Becker Haustechnik', email: 'jonas@becker-haustechnik.de' },
  { name: 'Mira Schulz', company: 'Schulz Design', email: 'mira@schulz-design.de' },
  { name: 'Paul Albers', company: 'Albers Logistik', email: 'p.albers@albers-logistik.de' },
  { name: 'Lea Wolff', company: 'Wolff Immobilien', email: 'lea@wolff-immobilien.de' },
];
const PI_SOURCES = ['pi_src_form', 'pi_src_make', 'pi_src_zapier', 'pi_src_n8n'];
const PI_ZONE = 'Europe/Berlin', PI_MEET_LEN = 30, PI_DEAL_VALUE = 9600;
// Cal.com's open times for the week (only days with times can be picked, like the dialog's month grid).
const PI_DAYS = [
  { iso: '2026-10-26', slots: ['09:00', '13:00', '16:00'] },
  { iso: '2026-10-27', slots: ['10:00', '11:00', '14:00', '15:30'] },
  { iso: '2026-10-28', slots: [] },
  { iso: '2026-10-29', slots: ['09:30', '15:00'] },
  { iso: '2026-10-30', slots: ['10:00', '11:30', '14:00'] },
];
// What already stands in the CRM calendar of the booker (the host): the conflict check reads these, every entry
// counting as 30 minutes, and warns without blocking (public/js/detail-views.js checkConflicts).
const PI_CRM_ENTRIES = [
  { iso: '2026-10-27', at: '11:15', key: 'pi_s_ev_callback', who: 'AW' },
  { iso: '2026-10-29', at: '15:00', key: 'pi_s_ev_contract', who: 'AW' },
];
function piClash(iso, hhmm) {
  const a = piMin(hhmm);
  return PI_CRM_ENTRIES.filter(e => e.iso === iso && a < piMin(e.at) + 30 && piMin(e.at) < a + PI_MEET_LEN);
}
// The warning's words: the entry's clock time with the 12-hour time beside it, its title, whose it is.
function piClashText(e, lang) { return piFill('pi_app_conflict', { time: `${e.at} (${piAmPm(e.iso, e.at)})`, title: piWord(e.key, lang), who: PI_TEAM[e.who] }, lang); }
// The Engine's statuses after the hand-over, in the order of routes/engine-api.js (kein_onboarding is the start).
const PI_ENGINE = ['formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];
// The notes Notetaker sends back for the sample call, and the words utils/notetaker.js resultNote() writes them with.
const PI_NOTES = {
  de: { title: 'Erstgespräch Becker Haustechnik', summary: 'Jonas Becker sucht ein CRM für vier Leute im Vertrieb. Start im November.',
    key_points: ['Vier Nutzer, Start im November', 'Anfragen kommen heute per E-Mail'], decisions: ['Angebot mit zwölf Monaten Laufzeit'],
    action_items: [{ task: 'Angebot schicken', owner: 'Anna Weiß', due: 'Fr., 30. Okt.' }], open_questions: ['Wer pflegt heute die Kundendaten?'], language: 'de' },
  en: { title: 'First call Becker Haustechnik', summary: 'Jonas Becker is looking for a CRM for four people in sales. Start in November.',
    key_points: ['Four users, start in November', 'Enquiries arrive by email today'], decisions: ['Proposal with a twelve-month term'],
    action_items: [{ task: 'Send the proposal', owner: 'Anna Weiß', due: 'Fri 30 Oct' }], open_questions: ['Who keeps the customer data today?'], language: 'en' },
};
const PI_NOTE_WORDS = {
  de: { key_points: 'Wichtige Punkte', decisions: 'Entscheidungen', action_items: 'Aufgaben', open_questions: 'Offene Fragen', due: 'bis' },
  en: { key_points: 'Key points', decisions: 'Decisions', action_items: 'Action items', open_questions: 'Open questions', due: 'due' },
};
function piNoteText(lang) {
  const n = PI_NOTES[lang === 'en' ? 'en' : 'de'], L = PI_NOTE_WORDS[n.language];
  const actions = n.action_items.map(a => a.task + (a.owner ? ` (${a.owner})` : '') + (a.due ? `, ${L.due} ${a.due}` : ''));
  const sections = [['key_points', n.key_points], ['decisions', n.decisions], ['action_items', actions], ['open_questions', n.open_questions]]
    .filter(([, lines]) => lines.length).map(([k, lines]) => `${L[k]}\n${lines.map(l => '• ' + l).join('\n')}`);
  return [n.title, n.summary, ...sections].join('\n\n');
}

function piJobsInitial() {
  return { open: 1, leads: [], day: PI_DAYS[0].iso, slot: null, nt: 'idle', rec: false, booked: false, note: false, stage: 3, prev: null, delivery: null, step: 0, tried: [false, false, false, false, false] };
}
function piTried(s, n) { const t = s.tried.slice(); t[n - 1] = true; return t; }
function piJobAct(s, a) {
  switch (a && a.type) {
    case 'open': return Number.isInteger(a.n) && a.n >= 1 && a.n <= 5 ? { ...s, open: a.n } : s;
    case 'lead': {
      if (s.leads.length >= PI_LEADS.length) return s;
      const src = PI_SOURCES.includes(a.src) ? a.src : PI_SOURCES[0];
      return { ...s, leads: [...s.leads, { ...PI_LEADS[s.leads.length], src }], tried: piTried(s, 1) };
    }
    case 'day': {
      const d = PI_DAYS.find(x => x.iso === a.iso);
      return d && d.slots.length && !s.booked ? { ...s, day: d.iso, slot: null } : s;
    }
    case 'slot': {
      const d = PI_DAYS.find(x => x.iso === s.day);
      return d && d.slots.includes(a.slot) && !s.booked ? { ...s, slot: a.slot } : s;
    }
    case 'nt-check': return s.nt === 'idle' ? { ...s, nt: 'checking' } : s;
    case 'nt-ok': return s.nt === 'checking' ? { ...s, nt: 'ok' } : s;
    // The box only counts once Notetaker answered and the place is Google Meet (the only place here).
    case 'rec': return s.nt === 'ok' && !s.booked ? { ...s, rec: !!a.on } : s;
    case 'book': return s.leads.length && s.slot && !s.booked ? { ...s, booked: true, tried: piTried(s, 2) } : s;
    case 'end': return s.booked && s.rec && !s.note ? { ...s, note: true, tried: piTried(s, 3) } : s;
    case 'move': {
      if (!s.leads.length || !Number.isInteger(a.stage) || a.stage < 0 || a.stage >= PI_STAGES.length || a.stage === s.stage) return s;
      const won = a.stage === PI_WON;
      return { ...s, prev: s.stage, stage: a.stage, delivery: won && !s.delivery ? 'pending' : s.delivery, tried: won ? piTried(s, 4) : s.tried };
    }
    case 'undo': return s.prev == null ? s : { ...s, stage: s.prev, prev: null };
    // One answer from the Engine at a time: the delivery arrives, then each status it reports back.
    case 'engine': {
      if (s.delivery === 'pending') return { ...s, delivery: 'success' };
      if (s.delivery === 'success' && s.step < PI_ENGINE.length) {
        const step = s.step + 1;
        return { ...s, step, tried: step === PI_ENGINE.length ? piTried(s, 5) : s.tried };
      }
      return s;
    }
    case 'reset': return piJobsInitial();
    default: return s;
  }
}
function piJobsTried(s) { return s.tried.filter(Boolean).length; }

// ═══ 3 · the rest of the day ══════════════════════════════════════════════════
const PI_TABS = ['tasks', 'cal', 'chat', 'an', 'list'];
const PI_AN_BASE = { open: 64100, won: 48300, wonN: 8, lostN: 4, newN: 14 };
function piWinRate(won, lost) { return won + lost ? Math.round((won / (won + lost)) * 100) : null; }
function piDayInitial() {
  return {
    tab: 'tasks', scope: 'all', last: null,
    tasks: [
      { id: 't1', key: 'pi_s_task1', due: 'today', at: '14:00', who: 'AW', done: false },
      { id: 't2', key: 'pi_s_task2', due: 'late', days: 2, who: 'AW', done: false },
      { id: 't3', key: 'pi_s_task3', due: 'tomorrow', who: 'TK', done: false },
    ],
    chat: [{ who: 'TK', key: 'pi_s_msg1', at: '09:12' }, { who: 'MS', key: 'pi_s_msg2', at: '09:14' }], replied: false,
    list: '',
  };
}
function piClean(v, max) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function piDayAct(s, a) {
  switch (a && a.type) {
    case 'tab': return PI_TABS.includes(a.tab) ? { ...s, tab: a.tab } : s;
    case 'scope': return a.scope === 'all' || a.scope === 'mine' ? { ...s, scope: a.scope } : s;
    // The tick: done and back, with Undo (public/js/tasks.js toggleTaskDone + patchTasks).
    case 'tick': {
      const t = s.tasks.find(x => x.id === a.id); if (!t) return s;
      return { ...s, tasks: s.tasks.map(x => (x.id === a.id ? { ...x, done: !x.done } : x)), last: { id: a.id, done: t.done } };
    }
    case 'undo': return s.last ? { ...s, tasks: s.tasks.map(x => (x.id === s.last.id ? { ...x, done: s.last.done } : x)), last: null } : s;
    // Quick add: Enter adds the row, assigned to the one who typed it (public/js/tasks.js quickAddTask).
    case 'add': {
      const text = piClean(a.text, 120); if (!text) return s;
      return { ...s, tasks: [...s.tasks, { id: `t${s.tasks.length + 1}`, text, due: 'none', who: PI_ME, done: false }] };
    }
    case 'say': {
      const text = piClean(a.text, 2000); if (!text) return s;
      return { ...s, chat: [...s.chat, { who: PI_ME, text, at: a.at || '09:30' }] };
    }
    case 'reply': return s.replied ? s : { ...s, replied: true, chat: [...s.chat, { who: 'TK', key: 'pi_s_msg3', at: a.at || '09:31' }] };
    case 'list': return { ...s, list: piClean(a.name, 40) };
    default: return s;
  }
}
function piDayTasks(s) { return s.scope === 'mine' ? s.tasks.filter(t => t.who === PI_ME) : s.tasks; }
function piAnalytics(wonDeal) {
  const b = PI_AN_BASE, plus = wonDeal ? 1 : 0;
  return { open: b.open - (wonDeal ? PI_DEAL_VALUE : 0), won: b.won + (wonDeal ? PI_DEAL_VALUE : 0), wonN: b.wonN + plus, lostN: b.lostN, newN: b.newN, rate: piWinRate(b.wonN + plus, b.lostN) };
}
function piListName(s, lang) { return s.list || piWord('pi_app_obj_default', lang); }

// ═══ the DOM layer ════════════════════════════════════════════════════════════
let piBoard = piBoardInitial(), piJobs = piJobsInitial(), piDay = piDayInitial();
let piHeroAt = 0, piHeroSeen = false, piStill = false, piMoveFor = null, piPlaying = false;
const piTimers = [];
function piLater(fn, ms, group) { const t = { group, id: 0 }; t.id = setTimeout(() => { piTimers.splice(piTimers.indexOf(t), 1); fn(); }, ms); piTimers.push(t); }
function piCancel(group) { for (const t of piTimers.filter(x => x.group === group)) { clearTimeout(t.id); piTimers.splice(piTimers.indexOf(t), 1); } }
function piEl(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
function piId(id) { return document.getElementById(id); }
function piAvatar(who) { const a = piEl('span', `pi-av pi-av-${who}`, who); a.title = PI_TEAM[who]; return a; }
function piNowClock() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

// A toast like the app's: the text, an optional Undo, gone after 4.2 s.
function piToast(areaId, text, undo) {
  const area = piId(areaId), t = piEl('div', 'pi-toast');
  t.setAttribute('role', 'status');
  t.append(piEl('span', 'pi-toast-t', text));
  if (undo) {
    const b = piEl('button', 'pi-toast-u', piWord('pi_app_undo')); b.type = 'button';
    b.addEventListener('click', () => { t.remove(); undo(); });
    t.append(b);
  }
  area.replaceChildren(t);
  piLater(() => t.remove(), 4200, 'toast-' + areaId);
}
// A small packet that flies from one element to another (the lead on its way in); skipped without motion.
function piFly(from, to) {
  if (piStill || !from || !to || typeof from.animate !== 'function') return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), dot = piEl('span', 'pi-packet');
  dot.setAttribute('aria-hidden', 'true');
  document.body.append(dot);
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + 24, y1 = b.top + 20;
  dot.animate([{ transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 48}px) scale(1)`, offset: 0.5 }, { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.3,.7,.2,1)' }).onfinish = () => dot.remove();
}

// ── drag, shared by the hero board and the board in job 4 ──────────────────────
// A mouse or pen drags after 6 px; a finger drags only sideways, so a vertical swipe still scrolls the page
// (touch-action: pan-y on the cards). A press without a drag is a click (the stage menu or nothing).
function piDrag(root, onDrop) {
  let d = null;
  const colAt = (x, y) => [...root.querySelectorAll('[data-col]')].find(c => { const r = c.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || null;
  const mark = col => root.querySelectorAll('[data-col]').forEach(c => c.classList.toggle('is-target', c === col));
  const end = () => { if (!d) return; d.card.classList.remove('is-lifted'); d.card.style.removeProperty('transform'); root.classList.remove('is-dragging'); mark(null); };
  root.addEventListener('pointerdown', e => {
    const card = e.target.closest('[data-drag]');
    if (!card || e.button > 0) return;
    d = { card, id: card.dataset.drag, x: e.clientX, y: e.clientY, pid: e.pointerId, on: false, touch: e.pointerType === 'touch' };
  });
  root.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.hypot(dx, dy) < 6) return;
      if (d.touch && Math.abs(dy) > Math.abs(dx)) { d = null; return; }
      d.on = true;
      try { d.card.setPointerCapture(d.pid); } catch (err) { /* already released */ }
      d.card.classList.add('is-lifted'); root.classList.add('is-dragging');
    }
    e.preventDefault();
    d.card.style.transform = `translate(${dx}px, ${dy}px)`;
    mark(colAt(e.clientX, e.clientY));
  });
  root.addEventListener('pointerup', e => {
    if (!d || e.pointerId !== d.pid) return;
    const was = d, col = was.on ? colAt(e.clientX, e.clientY) : null;
    end(); d = null;
    if (was.on) {
      was.card.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
      if (col) onDrop(was.id, Number(col.dataset.col));
    }
  });
  root.addEventListener('pointercancel', () => { end(); d = null; });
}

// ── 1 · the hero board ────────────────────────────────────────────────────────
// still: a card that only shows (job 1's first stage), not one to move.
function piCardEl(c, still) {
  const b = piEl(still ? 'div' : 'button', 'pi-card' + (c.urg ? ` pi-urg-${c.urg}` : '') + (c.fresh ? ' is-new' : ''));
  if (!still) { b.type = 'button'; b.dataset.drag = c.id; b.dataset.card = c.id; }
  b.setAttribute('aria-label', `${c.title}, ${piEuro(c.value)}, ${piWord('pi_app_stage')} ${piWord(PI_STAGES[c.stage])}`);
  const foot = piEl('span', 'pi-card-f');
  foot.append(piEl('span', c.value == null ? 'pi-card-v is-none' : 'pi-card-v', piEuro(c.value)));
  if (c.urg === 3) foot.append(piEl('span', 'pi-badge pi-badge-high', piWord('pi_app_urg3')));
  if (c.owner) foot.append(piAvatar(c.owner));
  b.append(piEl('span', 'pi-card-t', c.title), piEl('span', 'pi-card-m', c.who), foot);
  return b;
}
function piRenderBoard() {
  const root = piId('pi-board');
  root.querySelectorAll('[data-col]').forEach(col => {
    const i = Number(col.dataset.col);
    col.querySelector('.pi-col-n').textContent = String(piBoardCount(piBoard, i));
    col.querySelector('.pi-col-bar').style.setProperty('--pi-share', String(piBoardShare(piBoard, i)));
    col.querySelector('.pi-col-list').replaceChildren(...piBoard.cards.filter(c => c.stage === i).map(c => piCardEl(c)));
  });
  if (piBoard.cards.some(c => c.fresh)) piBoard = { ...piBoard, cards: piBoard.cards.map(c => ({ ...c, fresh: false })) };
  const n = piId('pi-bell-n');
  n.hidden = !piBoard.bell; n.textContent = String(piBoard.bell);
}
function piRenderFeed() {
  const list = piId('pi-feed-list');
  piId('pi-feed-empty').hidden = piBoard.feed.length > 0;
  list.replaceChildren(...piBoard.feed.slice().reverse().slice(0, 6).map((item, i) => {
    const li = piEl('li', 'pi-feed-i' + (i === 0 ? ' is-new' : ''));
    const b = piEl('button', `pi-feed-b pi-c-${item.n}`); b.type = 'button'; b.dataset.go = String(item.n);
    b.append(piEl('span', 'pi-feed-n', String(item.n)));
    const txt = piEl('span', 'pi-feed-x');
    txt.append(piEl('span', 'pi-feed-k', piFeedTitle(item)), piEl('span', 'pi-feed-d', piFeedDetail(item)));
    b.append(txt, piEl('span', 'pi-feed-w', piWord('pi_app_now')));
    li.append(b);
    return li;
  }));
}
function piRing() {
  const r = piBoard.ring; if (!r) return;
  const pop = piId('pi-bell-pop');
  piId('pi-bell-k').textContent = piWord(r.kind === 'meeting' ? 'pi_app_booked' : 'pi_app_nt_done');
  piId('pi-bell-d').textContent = r.kind === 'meeting' ? `${r.deal}, ${piWord('pi_s_when')}` : r.deal;
  pop.hidden = false; piId('pi-bell').classList.add('is-ringing');
  piCancel('bell');
  piLater(() => { pop.hidden = true; piId('pi-bell').classList.remove('is-ringing'); }, 2800, 'bell');
}
function piHeroApply(ev) { piBoard = piHeroEvent(piBoard, ev); piRenderBoard(); piRenderFeed(); if (ev.kind === 'meeting' || ev.kind === 'note') piRing(); }
function piHeroRun() {
  if (!piHeroSeen || document.hidden || piHeroAt >= PI_HERO_SCRIPT.length) return;
  const ev = PI_HERO_SCRIPT[piHeroAt], since = piHeroAt ? PI_HERO_SCRIPT[piHeroAt - 1].at : 0;
  piLater(() => { piHeroAt++; piHeroApply(ev); piHeroRun(); }, ev.at - since, 'hero');
}
function piHeroMove(id, stage) {
  const before = piBoard;
  piBoard = piBoardMove(piBoard, id, stage);
  if (piBoard === before) return;
  piCloseMove();
  piRenderBoard(); piRenderFeed();
  const card = piId('pi-board').querySelector(`[data-card="${id}"]`); if (card) card.classList.add('is-moved');
  piToast('pi-board-toast', piFill('pi_app_moved', { s: piWord(PI_STAGES[stage]) }), () => { piBoard = piBoardUndo(piBoard); piRenderBoard(); });
  if (stage === PI_WON && !before.told.includes(id)) {
    piLater(() => piHeroApply({ kind: 'delivered', deal: id }), 1000, 'engine-' + id);
    piLater(() => piHeroApply({ kind: 'form', deal: id }), 2600, 'engine-' + id);
  }
}
function piOpenMove(card) {
  const c = piBoardCard(piBoard, card.dataset.card); if (!c) return;
  const menu = piId('pi-move'), win = piId('pi-window');
  piMoveFor = c.id;
  const list = piId('pi-move-list');
  list.replaceChildren(...PI_STAGES.map((k, i) => {
    const b = piEl('button', `pi-move-b pi-st-${i}`, piWord(k)); b.type = 'button'; b.dataset.to = String(i);
    b.disabled = i === c.stage; return b;
  }));
  const r = card.getBoundingClientRect(), w = win.getBoundingClientRect();
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(r.left - w.left, w.width - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.min(r.bottom - w.top + 6, w.height - menu.offsetHeight - 8)}px`;
  const first = list.querySelector('button:not(:disabled)'); if (first) first.focus();
}
function piCloseMove(refocus) {
  const menu = piId('pi-move'); if (menu.hidden) return;
  menu.hidden = true;
  if (refocus && piMoveFor) { const card = piId('pi-board').querySelector(`[data-card="${piMoveFor}"]`); if (card) card.focus(); }
  piMoveFor = null;
}

// ── 2 · the five jobs ─────────────────────────────────────────────────────────
function piJobsDo(a) {
  const before = piJobs;
  piJobs = piJobAct(piJobs, a);
  if (piJobs === before) return;
  piRenderJobs(); piRenderDay();
  // the delayed answers: Notetaker's health check, the Engine's delivery and its statuses
  if (piJobs.open === 2 && piJobs.leads.length && piJobs.nt === 'idle') piJobsDo({ type: 'nt-check' });
  if (piJobs.nt === 'checking' && before.nt !== 'checking') piLater(() => piJobsDo({ type: 'nt-ok' }), 900, 'jobs');
  if (piJobs.delivery !== before.delivery || piJobs.step !== before.step) {
    if (piJobs.delivery === 'pending' || (piJobs.delivery === 'success' && piJobs.step < PI_ENGINE.length)) piLater(() => piJobsDo({ type: 'engine' }), piJobs.delivery === 'pending' ? 1000 : 1100, 'engine');
  }
}
function piJobsOpen(n, scroll) {
  piJobsDo({ type: 'open', n });
  if (scroll) piId('pi-jobs').scrollIntoView({ behavior: piStill ? 'auto' : 'smooth', block: 'start' });
}
function piTimelineItem(kind, by, text, extra) {
  const li = piEl('li', `pi-tl-i pi-tl-${kind}`);
  const head = piEl('p', 'pi-tl-h');
  head.append(piEl('b', null, piWord(kind === 'meeting' ? 'pi_app_meeting' : 'pi_app_note')), piEl('span', null, piFill('pi_app_by', { name: by })), piEl('span', null, piWord('pi_app_now')));
  li.append(head, piEl('p', 'pi-tl-x', text));
  if (extra) li.append(extra);
  return li;
}
function piRenderJobs() {
  const s = piJobs, lead = s.leads[0] || null;
  document.querySelectorAll('.pi-job').forEach(job => {
    const n = Number(job.dataset.job), open = n === s.open, body = job.querySelector('.pi-job-b');
    job.classList.toggle('is-open', open);
    job.classList.toggle('is-done', s.tried[n - 1]);
    job.querySelector('.pi-job-h').setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  });
  piId('pi-count').textContent = piFill('pi_jobs_count', { n: piJobsTried(s) });
  piId('pi-again').hidden = !piJobsTried(s);
  piId('pi-play').disabled = piPlaying;

  // 1 · the lead
  piId('pi-log-empty').hidden = s.leads.length > 0;
  piId('pi-log').replaceChildren(...s.leads.slice().reverse().map(l => {
    const li = piEl('li', 'pi-log-i');
    const top = piEl('p', 'pi-log-top');
    top.append(piEl('span', 'pi-pill pi-pill-ok', piWord('pi_app_lead')), piEl('span', 'pi-log-w', piWord('pi_app_now')), piEl('b', null, l.name));
    const chips = piEl('p', 'pi-log-chips');
    chips.append(piEl('span', 'pi-chip', `name: ${l.name}`), piEl('span', 'pi-chip', `email: ${l.email}`), piEl('span', 'pi-chip', `company: ${l.company}`));
    li.append(top, chips);
    return li;
  }));
  piId('pi-new-n').textContent = String(s.leads.length);
  piId('pi-new').replaceChildren(...s.leads.map(l => piCardEl({ id: 'j-' + l.email, title: l.name, who: `${l.name}, ${l.company}`, value: null, stage: 0, owner: null, urg: 0 }, true)));

  // 2 · the meeting
  const need2 = !lead;
  piId('pi-need-2').hidden = !need2; piId('pi-book-ui').hidden = need2;
  if (lead) {
    piId('pi-book-title').textContent = piFill('pi_app_book_title', { name: lead.name });
    piId('pi-book-to').textContent = piFill('pi_app_invite_to', { email: lead.email });
  }
  piId('pi-book-type').textContent = `${piWord('pi_s_type')}, ${piFill('pi_app_minutes', { n: PI_MEET_LEN })}`;
  piId('pi-days').replaceChildren(...PI_DAYS.map(d => {
    const b = piEl('button', 'pi-dpick' + (d.iso === s.day ? ' is-on' : '')); b.type = 'button'; b.dataset.day = d.iso;
    b.disabled = !d.slots.length || s.booked;
    b.setAttribute('aria-pressed', String(d.iso === s.day));
    b.title = piFill('pi_app_n_times', { n: d.slots.length });
    b.append(piEl('span', 'pi-dpick-d', piDayLabel(d.iso)), piEl('span', 'pi-dpick-n', String(d.slots.length)));
    return b;
  }));
  const day = PI_DAYS.find(d => d.iso === s.day);
  piId('pi-slots').replaceChildren(...day.slots.map(h => {
    const b = piEl('button', 'pi-slot' + (h === s.slot ? ' is-on' : '') + (piClash(day.iso, h).length ? ' is-clash' : ''), piSlotLabel(day.iso, h)); b.type = 'button'; b.dataset.slot = h;
    b.disabled = s.booked; b.setAttribute('aria-pressed', String(h === s.slot));
    return b;
  }));
  piId('pi-zone').textContent = piFill('pi_app_zone', { zone: PI_ZONE, host: PI_TEAM[PI_ME] });
  const clash = s.slot ? piClash(s.day, s.slot) : [];
  piId('pi-clash').hidden = !clash.length || s.booked;
  if (clash.length) piId('pi-clash-t').textContent = piClashText(clash[0]);
  const rec = piId('pi-rec');
  rec.disabled = s.nt !== 'ok' || s.booked; rec.checked = s.rec;
  piId('pi-rec-s').textContent = s.nt === 'ok' ? '' : piWord('pi_app_rec_checking');
  piId('pi-rec-s').hidden = s.nt === 'ok';
  piId('pi-sum').hidden = !s.slot;
  if (s.slot && lead) {
    piId('pi-sum-t').textContent = `${piDayLabel(s.day)}, ${piSlotLabel(s.day, s.slot)}`;
    piId('pi-sum-d').textContent = [piWord('pi_src_meet'), s.rec ? piWord('pi_app_rec_short') : '', piFill('pi_app_with', { name: lead.name })].filter(Boolean).join(', ');
  }
  const book = piId('pi-book');
  book.hidden = s.booked;
  if (!book.classList.contains('is-busy')) book.textContent = piWord(clash.length ? 'pi_app_anyway' : 'pi_app_submit');
  book.disabled = !s.slot || book.classList.contains('is-busy');
  piId('pi-booked').hidden = !s.booked;
  if (s.booked) {
    piId('pi-booked-t').textContent = piFill('pi_app_done', { when: piWhen(s.day, s.slot) });
    piId('pi-booked-rec').hidden = !s.rec;
  }

  // the deal's history, newest first, in jobs 3 and 5
  const history = () => {
    const items = [];
    if (s.booked && lead) items.push(piTimelineItem('meeting', PI_TEAM[PI_ME], piFill('pi_j3_meet', { name: lead.name }), piEl('span', 'pi-join', piFill('pi_app_join', { app: piWord('pi_src_meet') }))));
    if (s.note) items.push(piTimelineItem('note', 'Notetaker', piNoteText(piLang)));
    if (s.step > 0 && lead) items.push(piTimelineItem('engine', 'Upgrads Engine', piFill('pi_j5_note', { name: lead.name })));
    return items.reverse();
  };
  for (const id of ['pi-tl', 'pi-tl-5']) { const list = piId(id); list.replaceChildren(...history()); list.parentElement.hidden = !list.children.length; }

  // 3 · the call
  const need3 = !(s.booked && s.rec);
  piId('pi-need-3').hidden = !need3 || s.note; piId('pi-call').hidden = need3 && !s.note;
  piId('pi-need-3-t').textContent = piWord(lead ? 'pi_need_rec' : 'pi_need_lead');
  piId('pi-need-3-b').textContent = piFill('pi_goto', { n: lead ? 2 : 1 }); piId('pi-need-3-b').dataset.goto = lead ? '2' : '1';
  piId('pi-call').classList.toggle('is-ended', s.note);
  if (lead) piId('pi-call-t').textContent = piFill('pi_j3_meet', { name: lead.name });
  piId('pi-end').disabled = s.note;

  // 4 · the win
  const need4 = !lead;
  piId('pi-need-4').hidden = !need4; piId('pi-win-ui').hidden = need4;
  piId('pi-steps').querySelectorAll('[data-to]').forEach(b => {
    const i = Number(b.dataset.to);
    b.classList.toggle('is-past', i < s.stage); b.classList.toggle('is-now', i === s.stage);
    b.setAttribute('aria-current', i === s.stage ? 'step' : 'false');
  });
  const winRoot = piId('pi-win');
  winRoot.querySelectorAll('[data-col]').forEach(col => {
    const i = Number(col.dataset.col), here = s.stage === i || (i === 3 && s.stage < 3);
    col.querySelector('.pi-col-list').replaceChildren(...(lead && here ? [piCardEl({ id: 'jw', title: lead.name, who: `${lead.name}, ${lead.company}`, value: PI_DEAL_VALUE, stage: s.stage, owner: PI_ME, urg: 0 })] : []));
  });
  piId('pi-win-btn').disabled = s.stage === PI_WON;

  // 5 · the onboarding
  const need5 = !s.delivery;
  piId('pi-need-5').hidden = !need5; piId('pi-onb-ui').hidden = need5;
  piId('pi-need-5-t').textContent = piWord(lead ? 'pi_need_won' : 'pi_need_lead');
  piId('pi-need-5-b').textContent = piFill('pi_goto', { n: lead ? 4 : 1 }); piId('pi-need-5-b').dataset.goto = lead ? '4' : '1';
  if (lead) { piId('pi-onb-deal').textContent = lead.name; piId('pi-onb-kunde').textContent = lead.company; }
  const status = s.step ? PI_ENGINE[s.step - 1] : 'kein_onboarding';
  piId('pi-onb-status').textContent = piWord('pi_app_st_' + status);
  piId('pi-onb-status').classList.toggle('is-done', s.step === PI_ENGINE.length);
  piId('pi-onb-del').textContent = piWord(s.delivery === 'success' ? 'pi_app_delivered' : 'pi_app_pending');
  piId('pi-onb-del').classList.toggle('is-ok', s.delivery === 'success');
  piId('pi-ladder').querySelectorAll('[data-st]').forEach((li, i) => { li.classList.toggle('is-done', i < s.step); li.classList.toggle('is-now', i === s.step - 1); });
  document.querySelectorAll('[data-goto]').forEach(b => { b.textContent = piFill('pi_goto', { n: b.dataset.goto }); });
}
// "Alles zeigen": the five jobs played one after another by the same actions a hand would send.
function piPlay() {
  if (piPlaying) return;
  piPlaying = true; piCancel('play'); piRenderJobs();
  const lead = () => piJobs.leads.length;
  const steps = [
    [0, () => piJobsOpen(1)], [700, () => { if (!lead()) { piFly(document.querySelector('.pi-src'), piId('pi-log')); piJobsDo({ type: 'lead', src: 'pi_src_form' }); } }],
    [1600, () => piJobsOpen(2)], [1300, () => piJobsDo({ type: 'day', iso: '2026-10-27' })], [700, () => piJobsDo({ type: 'slot', slot: '11:00' })],
    [1500, () => piJobsDo({ type: 'slot', slot: '14:00' })], [900, () => piJobsDo({ type: 'rec', on: true })], [900, () => piBook()],
    [1900, () => piJobsOpen(3)], [1400, () => piJobsDo({ type: 'end' })],
    [2200, () => piJobsOpen(4)], [1100, () => piJobsMoveWon()],
    [1800, () => piJobsOpen(5)], [600, () => { piPlaying = false; piRenderJobs(); }],
  ];
  let at = 0;
  for (const [wait, fn] of steps) { at += wait; piLater(fn, at, 'play'); }
}
function piBook() {
  const b = piId('pi-book');
  if (b.disabled || b.classList.contains('is-busy')) return;
  b.classList.add('is-busy'); b.disabled = true; b.textContent = piWord('pi_app_booking');
  piLater(() => { b.classList.remove('is-busy'); piJobsDo({ type: 'book' }); }, 700, 'jobs');
}
function piJobsMove(stage) {
  const before = piJobs.stage;
  piJobsDo({ type: 'move', stage });
  if (piJobs.stage === before) return;
  piToast('pi-win-toast', piFill('pi_app_moved', { s: piWord(PI_STAGES[stage]) }), () => piJobsDo({ type: 'undo' }));
}
function piJobsMoveWon() { piJobsMove(PI_WON); }

// ── 3 · the rest of the day ───────────────────────────────────────────────────
function piDayDo(a) { const before = piDay; piDay = piDayAct(piDay, a); if (piDay !== before) piRenderDay(); }
function piRenderDay() {
  const s = piDay;
  document.querySelectorAll('.pi-tab').forEach(t => { const on = t.dataset.tab === s.tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('.pi-panel').forEach(p => { p.hidden = p.dataset.panel !== s.tab; });
  // tasks
  piId('pi-scope-all').setAttribute('aria-pressed', String(s.scope === 'all'));
  piId('pi-scope-mine').setAttribute('aria-pressed', String(s.scope === 'mine'));
  piId('pi-tasks').replaceChildren(...piDayTasks(s).map(t => {
    const li = piEl('li', 'pi-task' + (t.done ? ' is-done' : ''));
    const tick = piEl('button', 'pi-tick'); tick.type = 'button'; tick.dataset.tick = t.id;
    tick.setAttribute('aria-pressed', String(t.done)); tick.setAttribute('aria-label', t.key ? piWord(t.key) : t.text);
    const due = t.due === 'today' ? piFill('pi_app_due_today', { time: t.at }) : t.due === 'late' ? piFill('pi_app_overdue', { n: t.days }) : t.due === 'tomorrow' ? piWord('pi_app_tomorrow') : '';
    const txt = piEl('span', 'pi-task-x');
    txt.append(piEl('span', 'pi-task-t', t.key ? piWord(t.key) : t.text));
    if (due) txt.append(piEl('span', 'pi-task-due' + (t.due === 'late' && !t.done ? ' is-late' : ''), due));
    li.append(tick, txt, piAvatar(t.who));
    return li;
  }));
  // the week: Monday to Friday, 08:00 to 18:00; the booked meeting appears once job 2 booked it
  const events = [
    { iso: '2026-10-26', at: '14:00', text: piWord('pi_s_task1'), kind: 'task' },
    ...PI_CRM_ENTRIES.map(e => ({ iso: e.iso, at: e.at, text: piWord(e.key), kind: e.key === 'pi_s_ev_callback' ? 'call' : 'task' })),
  ];
  if (piJobs.booked && piJobs.leads[0]) events.push({ iso: piJobs.day, at: piJobs.slot, text: piFill('pi_j3_meet', { name: piJobs.leads[0].name }), kind: 'meeting' });
  piId('pi-week').querySelectorAll('[data-wday]').forEach(col => {
    col.querySelector('.pi-wday-h').textContent = piDayLabel(col.dataset.wday);
    col.querySelector('.pi-wday-b').replaceChildren(...events.filter(e => e.iso === col.dataset.wday).map(e => {
      const ev = piEl('span', `pi-ev pi-ev-${e.kind}`);
      ev.style.setProperty('--pi-at', String((piMin(e.at) - 480) / 600));
      ev.append(piEl('b', null, piTime(e.iso, e.at)), piEl('span', null, e.text));
      return ev;
    }));
  });
  // chat
  piId('pi-msgs').replaceChildren(...s.chat.map(m => {
    const li = piEl('li', 'pi-msg' + (m.who === PI_ME ? ' is-me' : ''));
    const head = piEl('p', 'pi-msg-h');
    head.append(piEl('b', null, PI_TEAM[m.who]), piEl('span', null, m.at));
    li.append(piAvatar(m.who), head, piEl('p', 'pi-msg-x', m.key ? piWord(m.key) : m.text));
    return li;
  }));
  // analytics
  const an = piAnalytics(piJobs.stage === PI_WON);
  piId('pi-an-open').textContent = piMoney(an.open); piId('pi-an-won').textContent = piMoney(an.won);
  piId('pi-an-rate').textContent = `${an.rate} %`; piId('pi-an-wl').textContent = piFill('pi_app_an_wl', { w: an.wonN, l: an.lostN });
  piId('pi-an-new').textContent = String(an.newN);
  piId('pi-an-gauge').style.setProperty('--pi-rate', String(an.rate / 100));
  // the list's own name
  const name = piListName(s);
  piId('pi-list-nav').textContent = name; piId('pi-list-h').textContent = name;
  piId('pi-list-add').textContent = piFill('pi_app_obj_add', { name });
  piId('pi-list-hint').textContent = piFill('pi_app_obj_hint', { name });
  document.querySelectorAll('.pi-preset').forEach(b => b.setAttribute('aria-pressed', String(piWord(b.dataset.i18n) === s.list)));
}

// ── the words ─────────────────────────────────────────────────────────────────
function piSetLang(l, save) {
  piLang = l === 'en' ? 'en' : 'de';
  document.documentElement.lang = piLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = piWord(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', piWord(el.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-ph]').forEach(el => el.setAttribute('placeholder', piWord(el.dataset.i18nPh)));
  document.querySelectorAll('.pi-lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === piLang)));
  if (save) { try { localStorage.setItem('lang', piLang); } catch (e) { /* private mode */ } }
  piRenderBoard(); piRenderFeed(); piRenderJobs(); piRenderDay(); piAskRender();
}

// ── the request ───────────────────────────────────────────────────────────────
let piReady = false;     // the server can deliver a request into the team's CRM (GET /api/landing/status)
let piAskState = 'form'; // form | busy | crm | mail

function piAskRender() {
  const sent = piAskState === 'crm' || piAskState === 'mail';
  piId('pi-ask-form').hidden = sent;
  const done = piId('pi-ask-done');
  done.hidden = !sent;
  if (sent) done.textContent = piWord(piAskState === 'crm' ? 'pi_done_crm' : 'pi_done_mail');
  const lead = piId('pi-c-d');
  lead.dataset.i18n = piReady ? 'pi_c_d' : 'pi_c_d_mail';
  lead.textContent = piWord(lead.dataset.i18n);
  const send = piId('pi-ask-send');
  send.disabled = piAskState === 'busy';
  send.textContent = piWord(piAskState === 'busy' ? 'pi_f_sending' : piReady ? 'pi_request' : 'pi_f_send_mail');
}
function piAskValues() {
  const f = piId('pi-ask-form');
  return { name: piClean(f.elements.name.value, 120), email: piClean(f.elements.email.value, 254), company: piClean(f.elements.company.value, 120) };
}
function piAskOk(v) { return v.name.length >= 2 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v.email); }
function piAskMailto(v) {
  const body = [`${piWord('pi_f_name')}: ${v.name}`, `${piWord('pi_f_email')}: ${v.email}`].concat(v.company ? [`${piWord('pi_mail_company')}: ${v.company}`] : []).join('\n');
  return `mailto:team@upgrads.de?subject=${encodeURIComponent(piWord('pi_mail_subject'))}&body=${encodeURIComponent(body)}`;
}
async function piAsk(e) {
  e.preventDefault();
  if (piAskState === 'busy') return;
  const v = piAskValues(), err = piId('pi-ask-err');
  err.hidden = piAskOk(v);
  if (!piAskOk(v)) { piId(v.name.length >= 2 ? 'pi-ask-email' : 'pi-ask-name').focus(); return; }
  piAskState = 'busy'; piAskRender();
  let ok = false;
  if (piReady) {
    try {
      const r = await fetch('/api/landing/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, lang: piLang, website: piId('pi-website').value }) });
      ok = r.ok;
    } catch (err2) { ok = false; }
  }
  piAskState = ok ? 'crm' : 'mail';
  if (!ok) window.location.href = piAskMailto(v);
  piAskRender();
  piId('pi-ask-done').focus();
}

// ── the start ─────────────────────────────────────────────────────────────────
function piWire() {
  // the hero board: drag, the stage menu, the feed's numbers leading to the jobs
  const board = piId('pi-board');
  piDrag(board, piHeroMove);
  board.addEventListener('click', e => { const card = e.target.closest('[data-card]'); if (card) piOpenMove(card); });
  piId('pi-move-list').addEventListener('click', e => { const b = e.target.closest('[data-to]'); if (b && piMoveFor) piHeroMove(piMoveFor, Number(b.dataset.to)); });
  piId('pi-move-x').addEventListener('click', () => piCloseMove(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') piCloseMove(true); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#pi-move') && !e.target.closest('[data-card]')) piCloseMove(false); });
  piId('pi-feed-list').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) piJobsOpen(Number(b.dataset.go), true); });

  // the jobs
  document.querySelectorAll('.pi-job-h').forEach(h => h.addEventListener('click', () => piJobsOpen(Number(h.closest('.pi-job').dataset.job))));
  piId('pi-row').addEventListener('keydown', e => {
    if (!e.target.classList.contains('pi-job-h') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const n = Math.min(5, Math.max(1, piJobs.open + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)));
    piJobsOpen(n); piId('pi-jh-' + n).focus();
  });
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => piJobsOpen(Number(b.dataset.goto))));
  document.querySelectorAll('.pi-src').forEach(b => b.addEventListener('click', () => { piFly(b, piId('pi-log')); piJobsDo({ type: 'lead', src: b.dataset.src }); }));
  piId('pi-days').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) piJobsDo({ type: 'day', iso: b.dataset.day }); });
  piId('pi-slots').addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (b) piJobsDo({ type: 'slot', slot: b.dataset.slot }); });
  piId('pi-rec').addEventListener('change', e => piJobsDo({ type: 'rec', on: e.target.checked }));
  piId('pi-book').addEventListener('click', piBook);
  piId('pi-end').addEventListener('click', () => piJobsDo({ type: 'end' }));
  piId('pi-win-btn').addEventListener('click', piJobsMoveWon);
  piId('pi-steps').addEventListener('click', e => { const b = e.target.closest('[data-to]'); if (b) piJobsMove(Number(b.dataset.to)); });
  piDrag(piId('pi-win'), (id, col) => piJobsMove(col));
  piId('pi-play').addEventListener('click', piPlay);
  piId('pi-again').addEventListener('click', () => { piCancel('play'); piCancel('engine'); piCancel('jobs'); piPlaying = false; piJobsDo({ type: 'reset' }); piRenderDay(); });

  // the day
  const tabs = [...document.querySelectorAll('.pi-tab')];
  tabs.forEach(t => t.addEventListener('click', () => piDayDo({ type: 'tab', tab: t.dataset.tab })));
  piId('pi-tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = PI_TABS.indexOf(piDay.tab), n = e.key === 'Home' ? 0 : e.key === 'End' ? PI_TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : PI_TABS.length - 1)) % PI_TABS.length;
    piDayDo({ type: 'tab', tab: PI_TABS[n] }); tabs[n].focus();
  });
  piId('pi-scope-all').addEventListener('click', () => piDayDo({ type: 'scope', scope: 'all' }));
  piId('pi-scope-mine').addEventListener('click', () => piDayDo({ type: 'scope', scope: 'mine' }));
  piId('pi-tasks').addEventListener('click', e => {
    const b = e.target.closest('[data-tick]'); if (!b) return;
    piDayDo({ type: 'tick', id: b.dataset.tick });
    const t = piDay.tasks.find(x => x.id === b.dataset.tick);
    piToast('pi-day-toast', piWord(t.done ? 'pi_app_tk_done' : 'pi_app_tk_reopened'), () => piDayDo({ type: 'undo' }));
  });
  piId('pi-quick').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const n = piDay.tasks.length;
    piDayDo({ type: 'add', text: e.target.value });
    if (piDay.tasks.length > n) { e.target.value = ''; piToast('pi-day-toast', piFill('pi_app_tk_added', { g: piWord('pi_app_tk_all') })); }
  });
  piId('pi-chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = piId('pi-chat-in'), n = piDay.chat.length;
    piDayDo({ type: 'say', text: input.value, at: piNowClock() });
    if (piDay.chat.length > n) { input.value = ''; if (!piDay.replied) piLater(() => piDayDo({ type: 'reply', at: piNowClock() }), 1600, 'chat'); }
  });
  piId('pi-list-in').addEventListener('input', e => piDayDo({ type: 'list', name: e.target.value }));
  document.querySelectorAll('.pi-preset').forEach(b => b.addEventListener('click', () => { const v = piWord(b.dataset.i18n); piId('pi-list-in').value = v; piDayDo({ type: 'list', name: v }); }));

  // the words and the request
  document.querySelectorAll('.pi-lang-btn').forEach(b => b.addEventListener('click', () => piSetLang(b.dataset.lang, true)));
  piId('pi-ask-form').addEventListener('submit', piAsk);
}

async function piInit() {
  piStill = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let lang = 'de';
  try { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'de') lang = l; } catch (e) { /* private mode */ }
  piWire();
  // Without motion the board starts where the arrivals end; with motion they arrive once the board is seen,
  // and wait while the tab is hidden.
  if (piStill) { for (const ev of PI_HERO_SCRIPT) piBoard = piHeroEvent(piBoard, ev); piHeroAt = PI_HERO_SCRIPT.length; piBoard = { ...piBoard, ring: null }; }
  piSetLang(lang, false);
  if (!piStill) {
    const start = () => { if (!piHeroSeen) { piHeroSeen = true; piHeroRun(); } };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => { if (entries.some(en => en.isIntersecting)) { start(); io.disconnect(); } }, { threshold: 0.25 });
      io.observe(piId('pi-window'));
    } else start();
    document.addEventListener('visibilitychange', () => { if (document.hidden) piCancel('hero'); else piHeroRun(); });
  }
  try {
    const r = await fetch('/api/landing/status');
    piReady = r.ok && (await r.json()).ready === true;
  } catch (e) { piReady = false; }
  piAskRender();
}

document.addEventListener('DOMContentLoaded', piInit);
