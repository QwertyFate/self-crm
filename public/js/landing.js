'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   /landingpage — the page script (LOGIN_LANDING_CHANGES Part 49, the redo). ASSEMBLED by the redo's assemble.js
   from src/core.js, src/flows-*.js and src/part-*.js; edit those, not this file.

   Every part on this page is one place of the CRM, zoomed in, which the visitor drives: the app's own markup, drawn
   by js/landing-ui.js (the app's render code, ported and loaded first) over a sample workspace, "Nordlicht
   Solar". Nothing changes by itself: every change answers a click, a key or a drag. Nothing leaves the page except
   the access request at the end.

   Parts
     words    KN_I18N (the page's copy, merged from the parts), KN_SAMPLE_EN (the sample data in English)
     core     the sample workspace and the server's rules, the frames, the layers, toasts, menus, confirms, the
              routing between parts, the events, the spine, the language, the theme, the request, the start
     flows    each page of the app the parts show: deals, Letzte Leads, the record, the booking, onboarding,
              contacts, tasks and the calendar, chat, analytics and settings
     parts    anfrage, termin, notiz, abschluss, day, engine: each registers itself with knPart (its pieces, its world, its section's controls)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── the page's words (de first) ───────────────────────────────────────────────
const KN_I18N = {
  de: {
    kn_crm: "CRM",
    kn_nav: "Seiten",
    kn_nav_how: "So funktioniert es",
    kn_nav_fit: "Voraussetzungen",
    kn_nav_faq: "Fragen",
    kn_lang: "Sprache",
    kn_login: "Anmelden",
    kn_request: "Zugang anfragen",
    kn_request_short: "Anfragen",
    kn_brand: "Upgrads CRM",
    kn_lang_to: "English",
    kn_dots: "Abschnitte",
    kn_dot_top: "Anfang",
    kn_dot_1: "Schritt 1: Anfrage",
    kn_dot_2: "Schritt 2: Termin",
    kn_dot_3: "Schritt 3: Notiz",
    kn_dot_4: "Schritt 4: Abschluss",
    kn_dot_day: "Der Vertriebstag",
    kn_dot_engine: "Upgrads Engine (optional)",
    kn_dot_start: "So geht’s los",
    kn_step: "Schritt {n} von 4",
    kn_step_done: "Schritt {n} von 4, ausprobiert",
    kn_cue1: "Tag 1",
    kn_cue2: "Tag 1, später",
    kn_cue3: "Am Tag des Termins",
    kn_cue4: "Drei Wochen später",
    kn_off: "In dieser Vorschau nicht enthalten",
    kn_again: "Von vorn",
    kn_fit_t: "Was es braucht und was es nicht kann.",
    kn_need_t: "Braucht",
    kn_need1_k: "Termine",
    kn_need1: "Cal.com-Konto per API-Schlüssel, sonst fehlen Terminbuchung und Notetaker.",
    kn_need2_k: "Notetaker",
    kn_need2: "Google Meet, im Deal gebucht. Aufnahme bis zu 120 Minuten, mit kostenlosem Google-Konto endet ein Meeting nach 60.",
    kn_need3_k: "Anfragen",
    kn_need3: "Website-Formular oder Automatisierung.",
    kn_need5_k: "Upgrads Engine (optional)",
    kn_need5: "Ein Google-Drive-Konto für die Kundenordner.",
    kn_not_t: "Nicht enthalten",
    kn_plan_t: "Noch nicht",
    kn_not1_k: "E-Mail",
    kn_not1: "Keine E-Mail-Synchronisierung.",
    kn_not2: "Notetaker bisher nur in Google Meet. Microsoft Teams und Outlook-Kalender folgen.",
    kn_not4_k: "Smartphone",
    kn_not4: "Keine Handy-App, läuft im Browser.",
    kn_not5_k: "Angebote",
    kn_not5: "Keine Angebote oder Rechnungen.",
    kn_start_t: "So geht’s los.",
    kn_st1_t: "Zugang anfragen",
    kn_st1_d: "Unten im Formular.",
    kn_st2_t: "Arbeitsbereich einrichten",
    kn_st2_d: "Vom Upgrads-Team, mit Pipelines und Feldern.",
    kn_st3_t: "Team einladen",
    kn_st3_d: "Per Einladungscode. Deutsch oder Englisch, frei wählbar.",
    kn_st4_t: "Quellen anschließen",
    kn_st4_d: "Formular, Automatisierung, Cal.com.",
    kn_faq_t: "Fragen vorab.",
    kn_q7: "Was kostet es?",
    kn_a7: "Ein festes Preismodell gibt es nicht. Der Preis wird pro Team vereinbart.",
    kn_q2: "Was nimmt Notetaker auf, wer willigt ein?",
    kn_a2: "Notetaker tritt einem Google Meet nur bei, wenn er beim Buchen aus dem Deal angehakt ist, und kündigt sich im Chat an. Die Einwilligung der Teilnehmenden holt das Team vorher ein. Ins CRM kommt nur die fertige Notiz, keine Aufnahme und kein Transkript.",
    kn_q3: "Schreibt das CRM den Kunden?",
    kn_a3: "Das CRM nicht. Einladungen verschickt Cal.com, das Onboarding-Formular die Upgrads Engine. Anruf, E-Mail und WhatsApp öffnen die Apps des Teams.",
    kn_q8: "Wer darf was?",
    kn_a8: "Inhaber und Admins laden das Team ein, verbinden Cal.com und steuern die Upgrads Engine samt Onboarding-Monitor. Nur der Inhaber ernennt Admins und entfernt Mitglieder. Alle sehen alle Deals und Kontakte.",
    kn_q4: "Wie kommen Kontakte hinein und heraus?",
    kn_a4: "Hinein per CSV-Datei mit deutschen oder englischen Spaltennamen, auf Wunsch mit einem Deal pro Zeile. Heraus ebenfalls als CSV, Kontakte wie Deals.",
    kn_c_t: "Upgrads CRM anfragen.",
    kn_c_d: "Name und E-Mail genügen. Unverbindlich, nur auf Einladung. Die Anfrage landet als Lead im CRM von Upgrads.",
    kn_c_d_mail: "Name und E-Mail genügen. Unverbindlich, nur auf Einladung.",
    kn_who: "Upgrads nutzt es selbst täglich. Ansprechpartner: Basilius Peetz.",
    kn_who_link: "Mehr auf upgrads.de",
    kn_free: "Oder",
    kn_next: "Danach klärt das Upgrads-Team, ob Upgrads CRM passt, und vereinbart den Preis.",
    kn_f_name: "Name",
    kn_f_email: "E-Mail",
    kn_f_company: "Firma (optional)",
    kn_f_send_mail: "Per Mail anfragen",
    kn_f_direct: "direkt an",
    kn_f_sending: "Wird gesendet …",
    kn_privacy: "Datenschutz",
    kn_done_crm: "Angekommen. Die Antwort geht an {email}.",
    kn_done_mail: "Noch nicht gesendet: im Mailprogramm auf Senden klicken.",
    kn_mail_subject: "Anfrage zu Upgrads CRM",
    kn_mail_company: "Firma",
    kn_mail_message: "Teamgröße und Werkzeuge",
    kn_foot: "Upgrads CRM für Vertriebsteams",
    kn_toc: "Inhalt",
    kn_legal: "Rechtliches",
    kn_imprint: "Impressum",
    kn_jump_tag: "In Schritt 3 öffnen",
    kn_f_err_name: "Bitte einen Namen eintragen, mindestens zwei Zeichen.",
    kn_f_err_email: "Bitte eine E-Mail-Adresse wie name@firma.de eintragen.",
    kn_f_fallback: "Öffnet sich kein Mailprogramm, den Text kopieren und an team@upgrads.de schicken.",
    kn_done_fail: "Die Anfrage ist nicht angekommen. Gesendet wurde nichts.",
    kn_done_unsure: "Die Anfrage ist möglicherweise nicht angekommen. Zur Sicherheit auch per Mail senden.",
    kn_f_fallback_fail: "Per Mail geht es trotzdem: im Mailprogramm öffnen oder den Text kopieren und an team@upgrads.de schicken. „Nochmal senden“ versucht es noch einmal.",
    kn_f_open_mail: "Im Mailprogramm öffnen",
    kn_f_retry: "Nochmal senden",
    kn_f_send_again: "Weitere Anfrage senden",
    kn_back: "Zurück zu Schritt {n}",
    kn_back_day: "Zurück zum Vertriebstag",
    kn_back_engine: "Zurück zur Upgrads Engine",
    kn_doc_title: "Upgrads CRM: Anfragen, Termine und Notizen im Deal",
    kn_meta_desc: "Upgrads CRM für Vertriebsteams: Anfragen aus Formularen, Cal.com-Termine und Notizen von Notetaker landen von selbst im Deal. Nur auf Einladung, eingerichtet vom Upgrads-Team.",
    kn_og_title: "Upgrads CRM: Anfrage, Termin und Notiz landen von selbst im Deal.",
    kn_og_desc: "Anfragen aus Formularen, Cal.com-Termine und Notizen von Notetaker landen von selbst im Deal.",
    kn_f_text: "Text der Anfrage",
    kn_f_copy: "Text kopieren",
    kn_f_copied: "Kopiert",
    kn_f_edit: "Angaben ändern",
    kn_f_steps: "Zur Vorschau",
    kn_sample_tag: "Beispieldaten",
    kn_mail_to: "An",
    kn_mail_subject_l: "Betreff",
    kn_f_message: "Teamgröße und Werkzeuge (optional)",
    kn_noscript: "Die Bildschirme der Seite brauchen JavaScript. Eine Anfrage geht auch direkt per Mail an",
    kn_skip1: "Weiter zu Schritt 1",
    kn_skip2: "Weiter zu Schritt 2",
    kn_skip3: "Weiter zu Schritt 3",
    kn_skip4: "Weiter zu Schritt 4",
    kn_skip5: "Weiter zum Vertriebstag",
    kn_skip6: "Weiter zum nächsten Abschnitt",
    kn_h1: "Anfrage, Termin und Notiz landen von selbst im Deal.",
    kn_sig_1: "Anfrage",
    kn_sig_2: "Termin",
    kn_sig_3: "Notiz",
    kn_sig_4: "Abschluss",
    kn_sig_deal: "Deal",
    kn_sig_cap: "In 4 Schritten ausprobieren",
    kn_sub: "Das CRM für Vertriebsteams: kein Abtippen dank Formularen, Cal.com (Terminbuchung) und Notetaker (Aufzeichnung in Google Meet). Microsoft Teams und Outlook-Kalender folgen.",
    kn_for3: "Neu, von der Upgrads GbR aus Landshut",
    kn_a_do: "Beispiel-Anfrage senden:",
    kn_a_hint: "Tipp: Die zweite Make-Anfrage kommt von Sabine Wolf, die schon als Kontakt im CRM ist. Das CRM erkennt sie an der E-Mail.",
    kn_src_form: "Website-Formular",
    kn_src_make: "Make",
    kn_src_zapier: "Zapier",
    kn_src_n8n: "n8n",
    kn_f_anfrage: "Upgrads CRM mit Beispieldaten: Empfangene Leads und das Deals-Board",
    kn_sample: "Echte Oberfläche, erfundene Beispieldaten. Getipptes bleibt im Browser.",
    kn_a_t: "Formular und Automatisierung legen den Deal an.",
    kn_a_reload: "Board neu laden",
    kn_a_next: "Der Deal erscheint beim nächsten Laden in „Neu“.",
    kn_a_live: "Neue Anfrage von {name} in Empfangene Leads.",
    kn_a_dup: "Sabine Wolf war schon im CRM: Der Kontakt ist aktualisiert, mit der neuen Telefonnummer, nicht doppelt angelegt. Die Anfrage wird trotzdem ein eigener Deal in „Neu“.",
    kn_a_dup_go: "In Kontakte ansehen",
    kn_src_why: "Aus dieser Quelle sind alle drei Beispiel-Anfragen da. „Von vorn“ setzt sie zurück.",
    kn_a_rest: "Eine ausgegraute Quelle hat alle drei Beispiele geschickt. „Von vorn“ setzt sie zurück.",
    kn_t_t: "Den Termin direkt im Deal buchen.",
    kn_t_tag: "Beispieldaten. Von selbst im Verlauf: Jonas Beckers Buchung über Cal.com bei Anna Weiß.",
    kn_t_do: "11:00 wählen: Das CRM meldet die Überschneidung.",
    kn_t_done: "Gebucht: Der Termin steht jetzt im Verlauf des Deals.",
    kn_t_nt: "Für die Notiz in Schritt 3 „Mit Notetaker aufzeichnen“ anhaken.",
    kn_f_termin: "Upgrads CRM mit Beispieldaten: der Buchungsdialog im Deal",
    kn_n_t: "Die Notiz steht nach dem Gespräch schon im Deal.",
    kn_n_tag: "Beispieldaten. Nur mit Notetaker von Upgrads: Er nimmt auf, ein KI-Modell schreibt die Notiz.",
    kn_n_do_own: "Die Notetaker-Meldung zu Jonas Becker öffnen.",
    kn_n_do: "Das gebuchte Gespräch mit Jonas Becker beenden, dann die Meldung öffnen.",
    kn_m_end: "Gespräch ist vorbei",
    kn_n_none: "Keine Notiz: Für diesen Deal ist kein Termin mit „Mit Notetaker aufzeichnen“ gebucht.",
    kn_n_off: "Kein Termin mit Notetaker",
    kn_n_rebook: "In Schritt 2 mit Notetaker buchen",
    kn_f_notiz: "Upgrads CRM mit Beispieldaten: die Meldungen und der Verlauf im Deal",
    kn_e_t: "Gewonnene Deals zählen in den Analysen mit.",
    kn_e_an: "Analysen ansehen",
    kn_e_see: "Das CRM zeigt, wie weit der Kunde ist, und seinen Drive-Ordner.",
    kn_e_do: "Jonas Becker auf „Gewonnen“ ziehen oder „Gewonnen“ im Kartenmenü wählen.",
    kn_e_do_touch: "Im Kartenmenü von Jonas Becker „Gewonnen“ wählen.",
    kn_e_done: "Erledigt: Gewonnener Wert und Abschlussquote daneben sind aktualisiert.",
    kn_f_abschluss: "Upgrads CRM mit Beispieldaten: das Board mit Gewonnener Wert und Abschlussquote",
    kn_e_opt_t: "Optional",
    kn_e_opt_why: "Zusatzdienst, fürs CRM nicht nötig",
    kn_e_opt: "Nach dem Abschluss übernimmt die Upgrads Engine und schickt dem Kunden das Onboarding-Formular.",
    kn_e_all: "Alle Schritte gemeldet",
    kn_e_rest: "Ein paar Tage später",
    kn_engine_t: "Die Übergabe startet von selbst.",
    kn_engine_wait: "Erst in Schritt 4 Jonas Becker gewinnen.",
    kn_f_engine: "Upgrads CRM mit Beispieldaten: der Onboarding-Monitor",
    kn_day_t: "Kontakte, Aufgaben, Termine und Zahlen an einem Ort.",
    kn_tab_contacts: "Kontakte",
    kn_tab_tasks: "Aufgaben",
    kn_tab_calendar: "Kalender",
    kn_tab_chat: "Team-Chat",
    kn_tab_analytics: "Analysen",
    kn_tab_settings: "Einstellungen",
    kn_day_contacts: "Kontakte mit Verlauf und eigenen Feldern.",
    kn_day_tasks: "Was ansteht, nach Projekt sortiert und mit Uhrzeit. Ein Haken, und es ist erledigt.",
    kn_day_calendar: "Die Woche auf einen Blick: gebuchte Termine und Aufgaben mit Uhrzeit.",
    kn_day_chat: "Kurze Absprachen im Team: ein Raum für alle, mit Blick darauf, wer online ist.",
    kn_day_analytics: "Für die Vertriebsleitung, ohne Nachfragen: offene Pipeline, gewonnener Wert, Abschlussquote, neue Deals und wer welche Deals hat.",
    kn_day_settings: "Hell oder dunkel und die Kontaktfelder, die das Team selbst anlegt.",
    kn_do_contacts: "Einen Namen öffnen, eine Zelle ändern.",
    kn_do_tasks: "Eine Aufgabe abhaken oder unter einem Projekt eine neue eintragen.",
    kn_do_calendar: "Mit den Pfeilen eine Woche vor oder zurück.",
    kn_do_calendar_next: "Der Termin steht nächste Woche: mit › vorblättern.",
    kn_do_chat: "Eine Nachricht schreiben und mit Enter senden.",
    kn_do_analytics: "Den Zeitraum wechseln: 3, 6 oder 12 Monate.",
    kn_do_settings: "Auf Dunkel stellen oder die Kontaktfelder ansehen.",
  },
  en: {
    kn_crm: "CRM",
    kn_nav: "Pages",
    kn_nav_how: "How it works",
    kn_nav_fit: "Requirements",
    kn_nav_faq: "Questions",
    kn_lang: "Language",
    kn_login: "Sign in",
    kn_request: "Request access",
    kn_request_short: "Request",
    kn_brand: "Upgrads CRM",
    kn_lang_to: "Deutsch",
    kn_dots: "Sections",
    kn_dot_top: "Top",
    kn_dot_1: "Step 1: Enquiry",
    kn_dot_2: "Step 2: Meeting",
    kn_dot_3: "Step 3: Note",
    kn_dot_4: "Step 4: Win",
    kn_dot_day: "The sales day",
    kn_dot_engine: "Upgrads Engine (optional)",
    kn_dot_start: "Getting started",
    kn_step: "Step {n} of 4",
    kn_step_done: "Step {n} of 4, tried",
    kn_cue1: "Day 1",
    kn_cue2: "Day 1, later",
    kn_cue3: "On the day of the call",
    kn_cue4: "Three weeks later",
    kn_off: "Not part of this preview",
    kn_again: "Start over",
    kn_fit_t: "What it needs and what it cannot do.",
    kn_need_t: "Needs",
    kn_need1_k: "Meetings",
    kn_need1: "A Cal.com account, connected by API key. Without it, booking and Notetaker are missing.",
    kn_need2_k: "Notetaker",
    kn_need2: "A Google Meet booked from the deal. Recording up to 120 minutes, and on a free Google account a meeting ends after 60.",
    kn_need3_k: "Enquiries",
    kn_need3: "A website form or an automation.",
    kn_need5_k: "Upgrads Engine (optional)",
    kn_need5: "A Google Drive account for the customer folders.",
    kn_not_t: "Not included",
    kn_plan_t: "Not yet",
    kn_not1_k: "Email",
    kn_not1: "No email sync.",
    kn_not2: "Notetaker only in Google Meet for now. Microsoft Teams and Outlook calendar are coming.",
    kn_not4_k: "Phone",
    kn_not4: "No phone app; it runs in the browser.",
    kn_not5_k: "Proposals",
    kn_not5: "No proposals or invoices.",
    kn_start_t: "Getting started.",
    kn_st1_t: "Request access",
    kn_st1_d: "In the form below.",
    kn_st2_t: "Set up the workspace",
    kn_st2_d: "By the Upgrads team, with pipelines and fields.",
    kn_st3_t: "Invite the team",
    kn_st3_d: "By invite code. German or English, your choice.",
    kn_st4_t: "Connect the sources",
    kn_st4_d: "Form, automation, Cal.com.",
    kn_faq_t: "Before you start.",
    kn_q7: "What does it cost?",
    kn_a7: "There is no fixed pricing model. The price is agreed per team.",
    kn_q2: "What does Notetaker record, and who consents?",
    kn_a2: "Notetaker joins a Google Meet only if it was ticked when the meeting was booked from the deal, and announces itself in the chat. The team asks the participants for consent beforehand. Only the finished note goes into the CRM, no recording and no transcript.",
    kn_q3: "Does the CRM write to customers?",
    kn_a3: "The CRM does not. Cal.com sends the invitations and the Upgrads Engine the onboarding form. Call, email and WhatsApp open the team's own apps.",
    kn_q8: "Who can do what?",
    kn_a8: "Owners and admins invite the team, connect Cal.com and run the Upgrads Engine with its onboarding monitor. Only the owner makes admins and removes members. Everyone sees every deal and contact.",
    kn_q4: "How do contacts get in and out?",
    kn_a4: "In from a CSV file with German or English column names, with a deal per row if wanted. Out as CSV too, contacts and deals alike.",
    kn_c_t: "Request Upgrads CRM.",
    kn_c_d: "A name and an email are enough. No commitment, by invitation only. The request lands as a lead in the Upgrads CRM.",
    kn_c_d_mail: "A name and an email are enough. No commitment, by invitation only.",
    kn_who: "Upgrads uses it every day. The contact is Basilius Peetz.",
    kn_who_link: "More on upgrads.de",
    kn_free: "Or",
    kn_next: "Then the Upgrads team checks whether Upgrads CRM fits and agrees the price.",
    kn_f_name: "Name",
    kn_f_email: "Email",
    kn_f_company: "Company (optional)",
    kn_f_send_mail: "Request by email",
    kn_f_direct: "write directly to",
    kn_f_sending: "Sending …",
    kn_privacy: "Privacy",
    kn_done_crm: "Received. The reply goes to {email}.",
    kn_done_mail: "Not sent yet: click Send in your mail app.",
    kn_mail_subject: "Request about Upgrads CRM",
    kn_mail_company: "Company",
    kn_mail_message: "Team size and tools",
    kn_foot: "Upgrads CRM for sales teams",
    kn_toc: "Contents",
    kn_legal: "Legal",
    kn_imprint: "Legal notice",
    kn_jump_tag: "Open in step 3",
    kn_f_err_name: "Please enter a name, at least two characters.",
    kn_f_err_email: "Please enter an email address like name@company.com.",
    kn_f_fallback: "If no mail app opens, copy the text and send it to team@upgrads.de.",
    kn_done_fail: "The request did not arrive. Nothing was sent.",
    kn_done_unsure: "The request may not have arrived. To be safe, send it by email too.",
    kn_f_fallback_fail: "It still works by email: open it in your mail app, or copy the text and send it to team@upgrads.de. “Send again” tries once more.",
    kn_f_open_mail: "Open in the mail app",
    kn_f_retry: "Send again",
    kn_f_send_again: "Send another request",
    kn_back: "Back to step {n}",
    kn_back_day: "Back to the sales day",
    kn_back_engine: "Back to the Upgrads Engine",
    kn_doc_title: "Upgrads CRM: enquiries, meetings and notes on the deal",
    kn_meta_desc: "Upgrads CRM for sales teams: form enquiries, Cal.com bookings and notes from Notetaker land on the deal by themselves. By invitation only, set up by the Upgrads team.",
    kn_og_title: "Upgrads CRM: enquiry, meeting and call note land on the deal by themselves.",
    kn_og_desc: "Form enquiries, Cal.com bookings and notes from Notetaker land on the deal by themselves.",
    kn_f_text: "Text of the request",
    kn_f_copy: "Copy the text",
    kn_f_copied: "Copied",
    kn_f_edit: "Change the details",
    kn_f_steps: "Back to the preview",
    kn_sample_tag: "Sample data",
    kn_mail_to: "To",
    kn_mail_subject_l: "Subject",
    kn_f_message: "Team size and tools (optional)",
    kn_noscript: "The page's screens need JavaScript. A request also works by email to",
    kn_skip1: "Skip to step 1",
    kn_skip2: "Skip to step 2",
    kn_skip3: "Skip to step 3",
    kn_skip4: "Skip to step 4",
    kn_skip5: "Skip to the sales day",
    kn_skip6: "Skip to the next section",
    kn_h1: "Enquiries, meetings, notes land on the deal for you.",
    kn_sig_1: "Enquiry",
    kn_sig_2: "Meeting",
    kn_sig_3: "Note",
    kn_sig_4: "Win",
    kn_sig_deal: "Deal",
    kn_sig_cap: "Try it in 4 steps",
    kn_sub: "The CRM for sales teams: no more retyping, thanks to forms, Cal.com (scheduling) and Notetaker (Google Meet recording). Microsoft Teams and Outlook calendar are coming.",
    kn_for3: "New, from Upgrads GbR in Landshut",
    kn_a_do: "Send a sample enquiry:",
    kn_a_hint: "Tip: the second Make enquiry comes from Sabine Wolf, who is already a contact. The CRM knows her by her email.",
    kn_src_form: "Website form",
    kn_src_make: "Make",
    kn_src_zapier: "Zapier",
    kn_src_n8n: "n8n",
    kn_f_anfrage: "Upgrads CRM with sample data: received leads and the deals board",
    kn_sample: "Real interface, made-up sample data. What you type stays in the browser.",
    kn_a_t: "Forms and automations create the deal.",
    kn_a_reload: "Reload the board",
    kn_a_next: "The deal appears in “New” on the next load.",
    kn_a_live: "New enquiry from {name} in Received leads.",
    kn_a_dup: "Sabine Wolf was already in the CRM: the contact is updated with the new phone number, not added twice. The enquiry still becomes a deal of its own in “New”.",
    kn_a_dup_go: "See it in Contacts",
    kn_src_why: "All three sample enquiries from this source are in. “Start over” resets them.",
    kn_a_rest: "A greyed-out source has sent all three samples. “Start over” resets them.",
    kn_t_t: "Book the meeting right from the deal.",
    kn_t_tag: "Sample data. Already in the timeline: Jonas Becker's own booking with Anna Weiß through Cal.com.",
    kn_t_do: "Pick 11:00: the CRM flags the clash.",
    kn_t_done: "Booked: the meeting is now on the deal's timeline.",
    kn_t_nt: "For the note in step 3, tick “Record with Notetaker”.",
    kn_f_termin: "Upgrads CRM with sample data: the booking dialog on the deal",
    kn_n_t: "After the call, the note is already on the deal.",
    kn_n_tag: "Sample data. Only with Notetaker by Upgrads: it records the call and an AI model writes the note.",
    kn_n_do_own: "Open Notetaker's notification about Jonas Becker.",
    kn_n_do: "End the booked call with Jonas Becker, then open the notification.",
    kn_m_end: "The call is over",
    kn_n_none: "No note: this deal has no meeting booked with “Record with Notetaker”.",
    kn_n_off: "No Notetaker meeting",
    kn_n_rebook: "Book with Notetaker in step 2",
    kn_f_notiz: "Upgrads CRM with sample data: the notifications and the deal's timeline",
    kn_e_t: "Once won, the deal counts in Analytics.",
    kn_e_an: "See Analytics",
    kn_e_see: "The CRM shows how far along the customer is, and their Drive folder.",
    kn_e_do: "Drag Jonas Becker to “Won” or choose “Won” in his card menu.",
    kn_e_do_touch: "Choose “Won” in Jonas Becker's card menu.",
    kn_e_done: "Done: the won value and win rate beside it are updated.",
    kn_f_abschluss: "Upgrads CRM with sample data: the board with won value and win rate",
    kn_e_opt_t: "Optional",
    kn_e_opt_why: "An add-on, not required",
    kn_e_opt: "After the win, the Upgrads Engine takes over and sends the customer the onboarding form.",
    kn_e_all: "Every step reported",
    kn_e_rest: "A few days later",
    kn_engine_t: "The hand-over starts by itself.",
    kn_engine_wait: "Win Jonas Becker in step 4 first.",
    kn_f_engine: "Upgrads CRM with sample data: the onboarding monitor",
    kn_day_t: "Contacts, tasks, meetings and numbers in one place.",
    kn_tab_contacts: "Contacts",
    kn_tab_tasks: "Tasks",
    kn_tab_calendar: "Calendar",
    kn_tab_chat: "Team Chat",
    kn_tab_analytics: "Analytics",
    kn_tab_settings: "Settings",
    kn_day_contacts: "Contacts with their history and the team's own fields.",
    kn_day_tasks: "What is due, by project and with a time. One tick and it is done.",
    kn_day_calendar: "The week at a glance: booked meetings and timed tasks.",
    kn_day_chat: "A quick word with the team: one room for everyone, showing who is online.",
    kn_day_analytics: "For the head of sales, without asking: open pipeline, won value, win rate, new deals and who has which deals.",
    kn_day_settings: "Light or dark, and the contact fields the team sets up itself.",
    kn_do_contacts: "Open a name, change a cell.",
    kn_do_tasks: "Tick a task off, or type a new one under a project.",
    kn_do_calendar: "Use the arrows to move a week ahead or back.",
    kn_do_calendar_next: "The meeting is next week: page ahead with ›.",
    kn_do_chat: "Write a message and press Enter.",
    kn_do_analytics: "Switch the period: 3, 6 or 12 months.",
    kn_do_settings: "Switch to dark, or look at the contact fields.",
  },
};

// The app words this script reaches only through a variable; the replica's assembly copies them into KR_WORDS with the rest.
const KR_EXTRA_KEYS = ['dv_filter_meeting', 'dv_all_types', 'chat_loading', 'msg_saved', 'moved_to', 'undo', 'deal_deleted', 'delete_deal_q', 'delete_deal_msg', 'btn_delete', 'unassigned', 'dv_owner_updated', 'dv_value_updated', 'dv_err_value_min', 'lbl_deal_value', 'dv_email_copied', 'dv_no_email', 'dv_phone_copied', 'dv_no_phone', 'dv_contact_gone'];

/* ═══ core: the words plumbing, the sample workspace, the frames, the events, the spine, the request ═════════════ */
// app-keys: dv_filter_meeting dv_all_types chat_loading msg_saved moved_to undo deal_deleted delete_deal_q delete_deal_msg btn_delete unassigned dv_owner_updated dv_value_updated dv_err_value_min lbl_deal_value dv_email_copied dv_no_email dv_phone_copied dv_no_phone dv_contact_gone

// ── the sample workspace in English ───────────────────────────────────────────
// The sample workspace is German. For an English visitor its own data reads in English, the way an English team's
// workspace would: every string the renderers get passes knL, which swaps an exact German sample text for its
// English one. Text a visitor types is never in the list, so it stays as typed.
const KN_SAMPLE_EN = {
  'Vertrieb': 'Sales', 'Neu': 'New', 'Kontaktiert': 'Contacted', 'Angebot': 'Proposal', 'Verhandlung': 'Negotiation', 'Gewonnen': 'Won', 'Verloren': 'Lost',
  'Flachdach Kühlhaus': 'Cold store flat roof', 'Solardach Druckerei': 'Print shop solar roof',
  'Carport-Solardach': 'Carport solar roof', 'Speicher-Nachrüstung': 'Battery retrofit', 'Energieberatung Q1': 'Energy consultation Q1',
  'PV-Anlage Lagerhalle': 'Warehouse PV system', 'Dachanlage Bürogebäude': 'Office roof system', 'Wartungsvertrag 2027': 'Service contract 2027',
  'Hallendach Nord': 'Hall roof north', 'Wallbox-Paket': 'Wallbox package',
  'Neukunden': 'New customers', 'Bestandskunden': 'Existing customers',
  'Angebot an Meier Logistik schicken': 'Send the proposal to Meier Logistik',
  'Speicher-Angebot für Wolf & Söhne kalkulieren': 'Price the battery offer for Wolf & Söhne',
  'Unterlagen für Lehmann Bau prüfen': 'Check the documents for Lehmann Bau',
  'Wartungstermin mit Fischer bestätigen': 'Confirm the service date with Fischer',
  'Präsentation für Q1 vorbereiten': 'Prepare the Q1 presentation',
  'Energieberatung nachfassen': 'Follow up on the energy consultation',
  'Vertrag an Praxis Dr. Albers senden': 'Send the contract to Praxis Dr. Albers',
  'Preise für Speicher einholen': 'Get battery prices', 'Angebot freigeben lassen': 'Get the proposal approved',
  'Rückruf: Speicher für die bestehende Anlage, Angebot bis Mittwoch.': 'Call back: battery for the existing system, proposal by Wednesday.',
  'Statikgutachten erhalten, das Angebot wird final abgestimmt.': 'Structural report received, the proposal is being finalised.',
  'Zwei Hallen, Dachflächen zusammen rund 2.400 m².': 'Two halls, about 2,400 m² of roof together.',
  'Fotos vom Carport geschickt, Maße folgen.': 'Sent photos of the carport, measurements to follow.',
  'Rückruf: möchte ein Angebot für die Lagerhalle, zwei Standorte.': 'Call back: wants a proposal for the warehouse, two sites.',
  'Rückruf Sabine Wolf': 'Call back Sabine Wolf',
  'Beratung zwischen Lena Hoffmann und Henrik Albers': 'Consultation between Lena Hoffmann and Henrik Albers',
  'Erstgespräch': 'Intro call', 'Beratung': 'Consultation',
  'Die Präsentation für Meier Logistik liegt im Drive.': 'The Meier Logistik presentation is in the Drive.',
  'Lehmann Bau will das Angebot bis Freitag.': 'Lehmann Bau wants the proposal by Friday.',
  'Ich rufe Frau Wolf morgen an.': 'I will call Ms Wolf tomorrow.',
  'Den Termin mit Praxis Dr. Albers übernehme ich.': 'I will take the meeting with Praxis Dr. Albers.',
  'Gesehen, ich melde mich gleich.': 'Seen it, I\'ll get back to you shortly.',
  'Branche': 'Industry', 'Handwerk': 'Trades', 'Gastronomie': 'Hospitality', 'Logistik': 'Logistics', 'Dachfläche (m²)': 'Roof area (m²)',
  'Baujahr': 'Year built', 'Adresse': 'Address',
};
function knSampleAdd(de, en) { if (de !== en) KN_SAMPLE_EN[de] = en; }
// Deep copy with the sample texts in the page's language (plain objects and arrays only; dates and the rest as they are).
function knL(v) {
  if (knLang === 'de') return v;
  if (typeof v === 'string') return Object.prototype.hasOwnProperty.call(KN_SAMPLE_EN, v) ? KN_SAMPLE_EN[v] : v;
  if (Array.isArray(v)) return v.map(knL);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = knL(v[k]);
    return o;
  }
  return v;
}

// ── the page's words ──────────────────────────────────────────────────────────
let knLang = 'de';
let KN_STILL = false;   // prefers-reduced-motion: reduce
const knId = id => document.getElementById(id);
function knWord(k) { return (KN_I18N[knLang] || KN_I18N.de)[k] ?? KN_I18N.de[k] ?? k; }
const knWordN = (k, n) => knWord(k).replace('{n}', String(n));
function knText(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; }
function knClean(v, max) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max); }

/* ═══ the sample workspace "Nordlicht Solar" ═══════════════════════════════════════════════════════════════ */
const KN_ZONE = 'Europe/Berlin';
const KN_WS = 'Nordlicht Solar';
const KN_ME = { id: 1, name: 'Anna Weiß', email: 'anna.weiss@nordlicht-solar.de', timezone: KN_ZONE };
const KN_MEMBERS = [KN_ME, { id: 2, name: 'Tim Krüger', email: 'tim.krueger@nordlicht-solar.de' }, { id: 3, name: 'Lena Hoffmann', email: 'lena.hoffmann@nordlicht-solar.de' }];
const KN_ONLINE = [{ id: 1, name: 'Anna Weiß' }, { id: 2, name: 'Tim Krüger' }];
const KN_WON = 15;
const KN_STAGES = [
  { id: 11, pipeline_id: 1, name: 'Neu', color: '#6b7280', position: 0 },
  { id: 12, pipeline_id: 1, name: 'Kontaktiert', color: '#3b82f6', position: 1 },
  { id: 13, pipeline_id: 1, name: 'Angebot', color: '#f59e0b', position: 2 },
  { id: 14, pipeline_id: 1, name: 'Verhandlung', color: '#8b5cf6', position: 3 },
  { id: 15, pipeline_id: 1, name: 'Gewonnen', color: '#22c55e', position: 4 },
  { id: 16, pipeline_id: 1, name: 'Verloren', color: '#ef4444', position: 5 },
];
const KN_LOST = 16;
const KN_PIPES = [{ id: 1, name: 'Vertrieb', position: 0, stages: KN_STAGES }];
const KN_PROJECTS = [{ id: 1, name: 'Vertrieb', color: '#3b82f6', lists: [{ id: 11, name: 'Neukunden' }, { id: 12, name: 'Bestandskunden' }], statuses: null }];
const KN_INTRO = { id: 101, title: 'Erstgespräch', lengthInMinutes: 30, locations: [{ type: 'integration', integration: 'google-meet' }, { type: 'phone' }] };
const KN_CAL = { event_type: KN_INTRO, event_types: [KN_INTRO, { id: 102, title: 'Beratung', lengthInMinutes: 60, locations: [{ type: 'integration', integration: 'google-meet' }] }],
  cal_name: 'Anna Weiß', cal_email: 'anna.weiss@nordlicht-solar.de', host_user_id: 1 };
const KN_CALCOM = { connected: true, calcom: { event_type: { id: 101 } } };
const KN_MEET = 'https://meet.google.com/kxv-pdmq-rta';
const KN_MEET_SELF = 'https://meet.google.com/wqd-hbnz-ufk';   // the booking the customer makes on Cal.com's page has its own
const KN_FIELDS = [{ id: 1, name: 'Branche', field_key: 'branche', type: 'dropdown', options: ['Handwerk', 'Gastronomie', 'Logistik'] },
  { id: 2, name: 'Website', field_key: 'website', type: 'url' }, { id: 3, name: 'Dachfläche (m²)', field_key: 'dachflaeche', type: 'number' }];
const KN_OBJ_FIELDS = [{ id: 11, name: 'Baujahr', field_key: 'baujahr', type: 'number' }, { id: 12, name: 'Adresse', field_key: 'adresse', type: 'text' }];
// [id, name, company, email, phone, updated days ago]
const KN_CONTACTS = [
  [61, 'Henrik Albers', 'Praxis Dr. Albers', 'h.albers@praxis-albers.de', '+49 40 3344 1200', 2],
  [62, 'Sabine Wolf', 'Wolf & Söhne KG', 's.wolf@wolf-soehne.de', '+49 171 5550182', 1],
  [63, 'Katrin Meier', 'Meier Logistik GmbH', 'k.meier@meier-logistik.de', '+49 421 778340', 5],
  [64, 'Markus Schneider', 'Schneider Transporte', 'm.schneider@schneider-transporte.de', '+49 511 9204410', 6],
  [65, 'Andreas Fischer', 'Fischer Haustechnik', 'a.fischer@fischer-haustechnik.de', '+49 30 66402210', 12],
  [66, 'Frank Lehmann', 'Lehmann Bau AG', 'f.lehmann@lehmann-bau.de', '+49 89 1203557', 4],
  [67, 'Carla Neumann', 'Neumann Metallbau', 'c.neumann@neumann-metallbau.de', '+49 231 880145', 3],
  [68, 'Ole Petersen', 'Autohaus Petersen', 'o.petersen@autohaus-petersen.de', '+49 461 33027', 16],
  [69, 'Nils Hartwig', 'Kühlhaus Hartwig', 'n.hartwig@kuehlhaus-hartwig.de', '+49 40 7781 330', 64],
  [71, 'Petra Lange', 'Druckerei Lange', 'p.lange@druckerei-lange.de', '+49 511 3349 20', 240],
];
// per contact: the owner, when it was added (days ago), the workspace's custom fields (Branche, Website, Dachfläche)
const KN_CT_EXTRA = {
  61: { owner: 3, added: 3, cf: { website: 'https://praxis-albers.de', dachflaeche: '180' } },
  62: { owner: 1, added: 8, cf: { branche: 'Handwerk', website: 'https://wolf-soehne.de', dachflaeche: '420' } },
  63: { owner: 2, added: 14, cf: { branche: 'Logistik', website: 'https://meier-logistik.de', dachflaeche: '2400' } },
  64: { owner: 1, added: 10, cf: { branche: 'Logistik' } },
  65: { owner: 3, added: 196, cf: { branche: 'Handwerk', website: 'https://fischer-haustechnik.de' } },
  66: { owner: 2, added: 22, cf: { branche: 'Handwerk', dachflaeche: '950' } },
  67: { owner: 2, added: 220, cf: { branche: 'Handwerk', dachflaeche: '1600' } },
  68: { owner: 1, added: 265, cf: { website: 'https://autohaus-petersen.de' } },
  69: { owner: 2, added: 72, cf: { branche: 'Logistik', dachflaeche: '1300' } },
  71: { owner: 3, added: 305, cf: { dachflaeche: '800' } },
};
// [id, title, contact, value, urgency, stage, owner, created days ago, updated days ago]
const KN_DEALS = [
  [101, 'Carport-Solardach', 61, '38000', 1, 11, 3, 2, 1], [105, 'Speicher-Nachrüstung', 62, '46000', 2, 12, 1, 6, 1],
  [99, 'Energieberatung Q1', 64, '4500', 0, 12, 1, 9, 6], [108, 'PV-Anlage Lagerhalle', 63, '365000', 3, 13, 2, 12, 3],
  [104, 'Dachanlage Bürogebäude', 66, '140000', 4, 14, 2, 20, 1], [107, 'Wartungsvertrag 2027', 65, '9800', 0, 15, 3, 190, 12],
  [95, 'Hallendach Nord', 67, '210000', 0, 15, 2, 215, 3], [93, 'Wallbox-Paket', 68, '18500', 0, 15, 1, 260, 16],
  [97, 'Flachdach Kühlhaus', 69, '165000', 0, 16, 2, 70, 64], [98, 'Solardach Druckerei', 71, '120000', 0, 16, 3, 300, 240],
];
// what each lead source sends (the webhook's captured fields), three people per source; the form's first is Jonas Becker
const KN_LEADS = {
  form: [{ name: 'Jonas Becker', email: 'jonas.becker@becker-logistik.de', phone: '+49 151 2345678', source: 'Website', company: 'Becker Logistik GmbH', custom: { branche: 'Logistik', website: 'https://becker-logistik.de', dachflaeche: '1200' } },
    { name: 'Hanna Vogt', email: 'h.vogt@vogt-baeckerei.de', phone: '+49 172 8830 412', source: 'Website', company: 'Bäckerei Vogt' },
    { name: 'Emre Yilmaz', email: 'e.yilmaz@yilmaz-kfz.de', source: 'Website', company: 'Yilmaz Kfz-Technik' }],
  make: [{ name: 'Mira Schulz', email: 'mira.schulz@schulz-dachtechnik.de', phone: '+49 160 4471903', source: 'Make', company: 'Schulz Dachtechnik' },
    { name: 'Sabine Wolf', email: 's.wolf@wolf-soehne.de', phone: '+49 171 5550199', source: 'Make', company: 'Wolf & Söhne KG', custom: { branche: 'Handwerk', website: 'https://wolf-soehne.de', dachflaeche: '420' } },   // (round 14) already in the CRM: updated, not added twice
    { name: 'Laura Kern', email: 'l.kern@kern-agrar.de', phone: '+49 151 6620 117', source: 'Make', company: 'Kern Agrar' }],
  zapier: [{ name: 'Paul Hartmann', email: 'paul@baeckerei-hartmann.de', source: 'Zapier', company: 'Bäckerei Hartmann' },
    { name: 'Sophie Richter', email: 's.richter@richter-hotel.de', phone: '+49 176 2290 348', source: 'Zapier', company: 'Hotel Richter' },
    { name: 'Daniel Koch', email: 'd.koch@koch-metall.de', source: 'Zapier', company: 'Koch Metallbau' }],
  n8n: [{ name: 'Lea Brandt', email: 'lea.brandt@hotel-brandt.de', phone: '+49 152 0938114', source: 'n8n', company: 'Hotel Brandt' },
    { name: 'Tobias Engel', email: 't.engel@engel-logistik.de', source: 'n8n', company: 'Engel Logistik' },
    { name: 'Clara Fuchs', email: 'c.fuchs@fuchs-pflege.de', phone: '+49 157 4410 905', source: 'n8n', company: 'Pflegedienst Fuchs' }],
};
const KN_ONB_STEPS = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];
const KN_DRIVE = '1p0Rk4VwYc8sJmT2aLqZx9bN3eHdF6uGi';
// The Notetaker's notes for the intro call, in the shape utils/notetaker.js resultNote writes them.
const KN_NOTE = {
  de: { title: 'PV-Anlage für die Lagerhalle in Hamburg', summary: 'Jonas Becker plant eine PV-Anlage auf der Lagerhalle in Hamburg, rund 1.200 m² Dachfläche. Ein Speicher ist gewünscht, die Wallboxen kommen später.',
    key: ['Dachfläche rund 1.200 m², Statik ist geprüft', 'Speicher gewünscht, etwa 200 kWh', 'Entscheidung bis Ende November'], dec: ['Angebot mit Speicher, ohne Wallboxen'],
    act: ['Angebot schicken (Anna Weiß), bis Freitag', 'Statikgutachten nachreichen (Jonas Becker)'], open: ['Ist eine Förderung über die KfW möglich?'],
    words: ['Wichtige Punkte', 'Entscheidungen', 'Aufgaben', 'Offene Fragen'] },
  en: { title: 'PV system for the warehouse in Hamburg', summary: 'Jonas Becker plans a PV system on the warehouse in Hamburg, about 1,200 m² of roof. He wants a battery; the wallboxes come later.',
    key: ['About 1,200 m² of roof, structural check done', 'Battery wanted, about 200 kWh', 'Decision by the end of November'], dec: ['Proposal with battery, without wallboxes'],
    act: ['Send the proposal (Anna Weiß), due Friday', 'Send the structural report (Jonas Becker)'], open: ['Is KfW funding possible?'],
    words: ['Key points', 'Decisions', 'Action items', 'Open questions'] },
};
// (round 13) the note's title names the booked event type ("Erstgespräch: …", "Beratung: …"), as Notetaker's notes
// title the call they come from; the body stays the sample's
function knNoteTitle(l, ty) { const T = ty || KN_INTRO; return `${l === 'de' ? T.title : KN_SAMPLE_EN[T.title] || T.title}: ${KN_NOTE[l].title}`; }
function knNoteText(l, ty) {
  const N = KN_NOTE[l], sec = (w, list) => `${w}\n${list.map(x => '• ' + x).join('\n')}`;
  return [knNoteTitle(l, ty), N.summary, sec(N.words[0], N.key), sec(N.words[1], N.dec), sec(N.words[2], N.act), sec(N.words[3], N.open)].join('\n\n');
}
for (const ty of KN_CAL.event_types) { knSampleAdd(knNoteText('de', ty), knNoteText('en', ty)); knSampleAdd(knNoteTitle('de', ty), knNoteTitle('en', ty)); }

// GET /api/analytics/summary from the same deals the board shows: open pipeline, won, lost, new in the window and before it
function knAnSummary(W, months) {
  const now = Date.now(), span = months * 30.44 * KN_DAY, val = d => Number(d.value) || 0, sum = l => l.reduce((a, d) => a + val(d), 0);
  const open = W.deals.filter(d => d.stage_id !== KN_WON && d.stage_id !== KN_LOST), won = W.deals.filter(d => d.stage_id === KN_WON), lost = W.deals.filter(d => d.stage_id === KN_LOST);
  const age = d => now - Date.parse(d.created_at), cur = W.deals.filter(d => age(d) < span), prev = W.deals.filter(d => age(d) >= span && age(d) < 2 * span);
  const avg = l => { const v = l.filter(d => d.value != null); return v.length ? Math.round(sum(v) / v.length) : 0; };
  const month0 = Date.parse(knAt(knIsoToday().slice(0, 8) + '01', '00:00'));   // date_trunc('month', NOW()), in the team's zone
  return { config: { value_field: 'value', currency: 'EUR', won_stage_ids: [KN_WON], lost_stage_ids: [KN_LOST] }, layout: {},
    pipeline_value: sum(open), open_deals: open.length, won_value: sum(won), won_deals: won.length, lost_deals: lost.length,
    win_rate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null,
    total_contacts: W.contacts.length, new_contacts: W.contacts.filter(c => Date.parse(c.created_at) >= month0).length, total_deals: W.deals.length,
    new_deals: cur.length, prev_new_deals: prev.length, avg_deal_size: avg(cur), prev_avg_deal_size: avg(prev), cohort_deals: cur.length,
    // routes/analytics.js:176-195 by_owner: every member, counted over the deals they own created in the window; most deals first, then by name
    by_owner: KN_MEMBERS.map(m => { const own = cur.filter(d => d.assigned_to === m.id), won = own.filter(d => d.stage_id === KN_WON).length, lost = own.filter(d => d.stage_id === KN_LOST).length;
      return { id: m.id, name: m.name, deals: own.length, open: own.length - won - lost, won, lost, value: sum(own) }; }).sort((a, b) => b.deals - a.deals || a.name.localeCompare(b.name)) };
}

// ── time ──
// (round 25) one time line for the story. Tag 1 is the visit itself (steps 1 and 2, the day); a later step has its own
// clock, moved forward instead of the past moved back: step 3 at its meeting, half an hour in (the sample's Beratung on
// the next working day at 14:00, or the meeting the visitor booked in step 2), step 4 and the Engine three weeks on. So
// Jonas Becker's enquiry has one date in every step. The app's renderers read the time through Date: while a frame
// builds its world, paints, or handles an event, Date reads that part's clock (KN_SHIFT, the world's shift), otherwise
// the visit's
const KN_DAY = 86400000;
const KN_DATE = Date;
let KN_SHIFT = 0;
function KnDate(...a) {
  if (!new.target) return new KN_DATE(KN_DATE.now() + KN_SHIFT).toString();
  return a.length ? new KN_DATE(...a) : new KN_DATE(KN_DATE.now() + KN_SHIFT);
}
KnDate.prototype = KN_DATE.prototype;
KnDate.now = () => KN_DATE.now() + KN_SHIFT;
KnDate.parse = KN_DATE.parse;
KnDate.UTC = KN_DATE.UTC;
globalThis.Date = KnDate;
// fn on a shift (ms); the shift before it comes back afterwards
function knClock(shift, fn) { const was = KN_SHIFT; KN_SHIFT = shift || 0; try { return fn(); } finally { KN_SHIFT = was; } }
// fn on a frame's clock
function knIn(F, fn) { return F && F.W ? knClock(F.W.shift, fn) : fn(); }
// a function whose first argument is a frame, run on that frame's clock
function knOnClock(fn) { return function (F, ...a) { return knIn(F, () => fn.call(this, F, ...a)); }; }
// a time on Tag 1, the visit: minutes before the visit's now, written from any part's world
const knT1 = (W, mins) => knAgo(0, mins + (W.shift || 0) / 60000);
// Tag 1's next working days (W.days of steps 1 and 2 and the day), whatever part asks
const knDays1 = () => knWorkdays(krBookingIsoDateIn(KN_ZONE, new KN_DATE(KN_DATE.now())), 4);
const knNow = () => new Date().toISOString();
const knAgo = (days, mins = 0) => new Date(Date.now() - days * KN_DAY - mins * 60000).toISOString();
const knIsoToday = () => krBookingIsoDateIn(KN_ZONE, new Date());
const knDow = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const knAt = (iso, hm) => krBookingInstantOf(iso, hm, KN_ZONE).toISOString();
function knWorkdays(from, n) { const out = []; let d = from; while (out.length < n) { d = krBookingAddDays(d, 1); if (knDow(d) % 6) out.push(d); } return out; }

// ── one part's world: the server's rows and the screen's own state ──
// The seed is the same in every part; a part's own start state is its world(W) hook (Jonas Becker's enquiry already
// in, a record open, a page loaded). Each part keeps its own world: what happens in one stays there unless knCarry
// brings it along to another part.
function knWorld(P) { const shift = P.clock ? P.clock() : 0; return knClock(shift, () => knWorldAt(P, shift)); }
function knWorldAt(P, shift) {
  const today = knIsoToday(), days = knWorkdays(today, 4);
  const times = [['09:30', '11:00', '14:00', '16:00'], ['10:00', '13:30', '15:00'], ['09:00', '11:30', '14:30'], ['10:30', '15:30']];
  const slots = {};
  days.forEach((d, i) => { slots[d] = times[i].map(hm => ({ start: knAt(d, hm) })); });
  const ago = (d, m = 0) => knAgo(d, m + shift / 60000);   // (round 27) the sample's own dates on the visit's clock: the same in every part
  const W = {
    kind: P.name, page: P.page || 'deals', today, days, slots, seq: 1000, shift,
    contacts: KN_CONTACTS.map(([id, name, company, email, phone, u]) => ({ id, name, company, email, phone, assigned_to: (KN_CT_EXTRA[id] || {}).owner || null, assigned_to_name: null,
      custom_data: (KN_CT_EXTRA[id] || {}).cf || {}, created_at: ago((KN_CT_EXTRA[id] || {}).added || 30, 200), updated_at: ago(u, 40) })),
    deals: KN_DEALS.map(([id, title, contact_id, value, urgency, stage_id, assigned_to, c, u]) => ({ id, title, contact_id, value, urgency, stage_id, assigned_to, created_at: ago(c, 90), updated_at: ago(u, 30) })),
    acts: [
      knAct(301, 62, 105, 'call', 'Rückruf: Speicher für die bestehende Anlage, Angebot bis Mittwoch.', ago(2, 50), 1),
      knAct(302, 66, 104, 'email', 'Statikgutachten erhalten, das Angebot wird final abgestimmt.', ago(1, 200), 2),
      knAct(303, 63, 108, 'note', 'Zwei Hallen, Dachflächen zusammen rund 2.400 m².', ago(5, 10), 2),
      knAct(304, 61, 101, 'whatsapp', 'Fotos vom Carport geschickt, Maße folgen.', ago(1, 120), 3),
      { ...knAct(401, 62, 105, 'call', 'Rückruf Sabine Wolf', ago(1, 30), 1), event_date: days[0], event_time: '11:15', event_tz: KN_ZONE },
      { ...knAct(402, 61, 101, 'meeting', 'Beratung zwischen Lena Hoffmann und Henrik Albers', ago(1, 300), 3), source: 'calcom', calcom_uid: 'kn402', calcom_event_type_id: 102, event_date: days[1], event_time: '10:00', event_tz: KN_ZONE },
    ],
    tasks: [
      knTask(201, 'Angebot an Meier Logistik schicken', 'in_progress', 'high', today, '14:00', 1, 108, 11),
      knTask(202, 'Speicher-Angebot für Wolf & Söhne kalkulieren', 'todo', 'high', today, '16:00', 1, 105, 11),
      knTask(203, 'Unterlagen für Lehmann Bau prüfen', 'todo', 'medium', krBookingAddDays(today, 1), null, 2, 104, 12),
      knTask(204, 'Wartungstermin mit Fischer bestätigen', 'todo', 'low', krBookingAddDays(today, -1), null, 3, 107, 12),
      knTask(205, 'Präsentation für Q1 vorbereiten', 'todo', 'medium', null, null, 1, null, 11),
      knTask(206, 'Energieberatung nachfassen', 'todo', 'medium', krBookingAddDays(today, 3), '10:00', 1, 99, 11),
      knTask(207, 'Vertrag an Praxis Dr. Albers senden', 'done', 'medium', krBookingAddDays(today, -1), null, 3, 101, 11),
      { ...knTask(211, 'Preise für Speicher einholen', 'done', 'medium', null, null, 1, 108, 11), parent_id: 201 },
      { ...knTask(212, 'Angebot freigeben lassen', 'todo', 'medium', null, null, 2, 108, 11), parent_id: 201 },
    ],
    logs: [
      { id: 501, status: 'success', payload: { name: 'Henrik Albers', email: 'h.albers@praxis-albers.de', phone: '+49 40 3344 1200', source: 'Website', company: 'Praxis Dr. Albers' }, captured: { name: 'Henrik Albers', email: 'h.albers@praxis-albers.de', phone: '+49 40 3344 1200', source: 'Website', company: 'Praxis Dr. Albers' }, error: null, created_at: knAgo(2, 95), contact_name: 'Henrik Albers', contact_id: 61, deal_id: 101 },
      { id: 503, status: 'success', payload: { name: 'Sabine Wolf', email: 's.wolf@wolf-soehne.de', source: 'Make', company: 'Wolf & Söhne KG' }, captured: { name: 'Sabine Wolf', email: 's.wolf@wolf-soehne.de', source: 'Make', company: 'Wolf & Söhne KG' }, error: null, created_at: knAgo(6, 20), contact_name: 'Sabine Wolf', contact_id: 62, deal_id: 105 },
    ],
    chat: knChatSeed(),
    onb: { 65: { status: 'onboarding_abgeschlossen', drive: KN_DRIVE.replace('p0', 'f4'), akte: 4 }, 67: { status: 'briefing_fertig', drive: KN_DRIVE, akte: 3 }, 68: { status: 'formular_ausgefuellt', drive: KN_DRIVE.replace('p0', 'h7'), akte: 1 } },   // (round 16 review) every Engine customer has its folder: the Engine makes it on kunde.angelegt (Briefing 2.1), before any win
    deliv: { 107: knDelivery('success', 12), 95: knDelivery('success', 9), 93: knDelivery('success', 17) },
    live: new Set(),
    bell: { open: false, items: [] },
    toasts: [], menu: null, record: null, booking: null, confirm: null, detail: null,
    logsShown: null, onbShown: null, onbFilter: 'all', busy: 0, replied: false,
    dealsUI: { summary: false, q: '', owner: null, urgency: null, stage: null, cf: {}, view: 'board', sort: { key: 'created_at', dir: -1 }, sel: [], dealColumns: [] },   // the app remembers "Übersicht ausblenden"; the parts start with it hidden
    tasksUI: { scope: 'all', sort: { key: 'due', dir: 1 }, filters: { q: '', assignee: null, priority: null, status: null, due: null }, collapsed: [], expanded: [], sel: [], closed: [], summary: true },
    calUI: { view: 'week', anchor: today, filters: { type: null, person: null } },
    df: null, cf: null,
    ct: { filters: {}, sortKey: null, sortDir: 'asc', page: 1, selectMode: false, selected: [], selectAll: false, activeRow: null, contactColumns: [] }, ctRec: null,
    anMonths: 6, anTables: new Set(), setTab: 'workspace', objectName: null, supplierName: null, wsName: KN_WS, used: { form: 0, make: 0, zapier: 0, n8n: 0 }, refreshes: 0,
  };
  knSlotsHeld(W);   // (round 18 review) before a part's world books anything: the free times as Cal.com would give them
  if (P.world) P.world(W);
  knEnter(W);
  return W;
}
// (round 18 review) Cal.com offers no time the connected account already holds (GET /calcom/slots): a Cal.com booking
// in the sample (402, Beratung, days[1] 10:00) takes its span out of the free times
function knSlotsHeld(W) {
  const len = id => ((KN_CAL.event_types.find(e => e.id === id) || KN_CAL.event_type).lengthInMinutes) * 60000, slot = KN_CAL.event_type.lengthInMinutes * 60000;
  for (const a of W.acts) {
    if (a.type !== 'meeting' || a.source !== 'calcom' || a.cancelled_at || !a.event_date || !a.event_time || !W.slots[a.event_date]) continue;
    const a0 = Date.parse(knAt(a.event_date, a.event_time)), a1 = a0 + len(a.calcom_event_type_id);
    W.slots[a.event_date] = W.slots[a.event_date].filter(sl => { const s0 = Date.parse(sl.start); return s0 + slot <= a0 || s0 >= a1; });
  }
}
// Jonas Becker's enquiry came in yesterday from the website form, the team has called him back since: the start of
// every part after the first (his deal 120 in the given stage)
// Jonas Becker's enquiry and the call back that followed it, at the point of his story a part shows: step 2 the same
// day (in two hours ago, called back 50 minutes ago), step 3 on the day of his intro call (both yesterday), step 4 three
// weeks on. [days, minutes] ago of the enquiry; the call back comes 70 minutes after it
// (round 25) on Tag 1 in every part: the enquiry two hours before the visit, the call back an hour before it
function knJonas(W, stageId) {
  knLeadArrive(W, 'form', 0, 0, 120 + (W.shift || 0) / 60000);
  knDeal(W, 120).stage_id = stageId;
  W.used.form = 1;
  W.acts.unshift(knAct(310, 70, 120, 'call', 'Rückruf: möchte ein Angebot für die Lagerhalle, zwei Standorte.', knT1(W, 60), 1));
}
function knAct(id, contact_id, deal_id, type, content, created_at, by) {
  const m = KN_MEMBERS.find(x => x.id === by);
  return { id, contact_id, type, content, created_at, source: null, calcom_uid: null, cancelled_at: null, bound_deal_id: deal_id, deal_id, deal_title: null,
    logged_by_name: m ? m.name : null, created_by: by, created_by_name: m ? m.name : null, contact_name: null };
}
function knTask(id, title, status, priority, due_date, due_time, assigned_to, deal_id, list_id) {
  return { id, title, description: null, status, priority, due_date, due_time, due_tz: KN_ZONE, project_id: 1, list_id, parent_id: null, assigned_to, deal_id, contact_id: null, custom_data: {} };
}
function knDelivery(status, days) { return { id: 900 + days, status, attempts: 1, last_status_code: status === 'success' ? 200 : null, last_error: null, created_at: knAgo(days, 5), delivered_at: status === 'success' ? knAgo(days, 4) : null }; }
function knChatSeed() {
  const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(16, 40, 0, 0);
  const ago = m => new Date(Date.now() - m * 60000).toISOString();
  return [
    { id: 1, user_id: 3, user_name: 'Lena Hoffmann', content: 'Die Präsentation für Meier Logistik liegt im Drive.', created_at: y.toISOString() },
    { id: 2, user_id: 2, user_name: 'Tim Krüger', content: 'Lehmann Bau will das Angebot bis Freitag.', created_at: ago(95) },
    { id: 3, user_id: 1, user_name: 'Anna Weiß', content: 'Ich rufe Frau Wolf morgen an.', created_at: ago(61) },
    { id: 4, user_id: 3, user_name: 'Lena Hoffmann', content: 'Den Termin mit Praxis Dr. Albers übernehme ich.', created_at: ago(24) },
  ];
}
// what a page loads when it is opened (switchPage → load…)
function knEnter(W) {
  if (W.page === 'integrations') W.logsShown = W.logs.slice();
  if (W.page === 'onboarding') W.onbShown = knOnbRows(W);
}
const knDeal = (W, id) => W.deals.find(d => d.id === id) || null;
const knContact = (W, id) => W.contacts.find(c => c.id === id) || null;
const knStage = id => KN_STAGES.find(s => s.id === id) || null;
const knMember = id => KN_MEMBERS.find(m => m.id === id) || null;

// ── the rows each renderer gets (the shapes the API sends) ──
function knDealRow(W, d) {
  const st = knStage(d.stage_id), c = knContact(W, d.contact_id), m = knMember(d.assigned_to);
  return { id: d.id, pipeline_id: 1, stage_id: d.stage_id, stage_name: st ? st.name : null, stage_color: st ? st.color : null, title: d.title, value: d.value, urgency: d.urgency || 0,
    contact_id: d.contact_id, contact_name: c ? c.name : null, contact_company: c ? c.company : null, assigned_to: d.assigned_to, assigned_to_name: m ? m.name : null,
    supplier_id: null, custom_data: {}, created_at: d.created_at, updated_at: d.updated_at, objects: [] };
}
function knActRows(W) {
  return W.acts.map(a => { const d = knDeal(W, a.deal_id), c = knContact(W, a.contact_id); return { ...a, deal_title: d ? d.title : null, contact_name: c ? c.name : null }; });
}
function knTaskRows(W) {
  return W.tasks.map(x => {
    const subs = W.tasks.filter(s => s.parent_id === x.id), d = knDeal(W, x.deal_id), m = knMember(x.assigned_to);
    return { ...x, assigned_to_name: m ? m.name : null, deal_title: d ? d.title : null, contact_name: null, subtask_count: subs.length, subtask_done: subs.filter(s => s.status === 'done').length };
  });
}
// GET /api/calendar: activities with a time and tasks with a due date, one list. Kept deviation: an activity's title is
// its first line; the server sends the whole text (routes/calendar.js:50), so the app shows a meeting's Meet link in it
function knCalRows(W) {
  const tasks = knTaskRows(W).filter(x => x.due_date && !x.parent_id).map(x => ({ kind: 'task', id: x.id, type: 'task', title: x.title, content: null, completed: x.status === 'done',
    event_date: x.due_date, event_time: x.due_time, event_tz: x.due_tz, created_by: x.assigned_to, created_by_name: x.assigned_to_name, contact_id: null, contact_name: null,
    deal_id: x.deal_id, deal_title: x.deal_title, status: x.status, priority: x.priority, cancelled_at: null, source: null, calcom_uid: null, calcom_event_type_id: null }));
  const acts = knActRows(W).filter(a => a.event_date).map(a => ({ kind: 'activity', id: a.id, type: a.type, title: String(a.content || '').split('\n')[0], content: a.content, completed: !!a.completed,
    event_date: a.event_date, event_time: a.event_time, event_tz: a.event_tz, created_by: a.created_by, created_by_name: a.created_by_name, contact_id: a.contact_id, contact_name: a.contact_name,
    deal_id: a.deal_id, deal_title: a.deal_title, status: null, priority: null, cancelled_at: a.cancelled_at, source: a.source, calcom_uid: a.calcom_uid, calcom_event_type_id: a.calcom_event_type_id || null }));
  return acts.concat(tasks);
}
// GET /api/engine/onboarding: every deal, the contact's Engine status, the newest delivery; newest contact change first
function knOnbRows(W) {
  const won = knStage(KN_WON);
  return W.deals.map(d => {
    const r = knDealRow(W, d), c = knContact(W, d.contact_id), on = (c && W.onb[c.id]) || {}, dv = W.deliv[d.id];
    return { deal_id: d.id, deal_title: d.title, deal_value: d.value, deal_created_at: d.created_at, pipeline_id: 1, pipeline_name: KN_PIPES[0].name,
      stage_id: d.stage_id, stage_name: r.stage_name, stage_color: r.stage_color, contact_id: c ? c.id : null, contact_name: c ? c.name : null, contact_company: c ? c.company : null,
      onboarding_status: c ? (on.status || 'kein_onboarding') : null, drive_ordner_id: on.drive || null, akte_version: c ? (on.akte || 0) : null, status_since: c ? c.updated_at : null,
      in_trigger: d.stage_id === KN_WON, trigger_stage_id: KN_WON, trigger_stage_name: won.name, delivery: dv ? { ...dv } : null };
  }).sort((a, b) => ((b.status_since ? Date.parse(b.status_since) : -Infinity) - (a.status_since ? Date.parse(a.status_since) : -Infinity)) || (Date.parse(b.deal_created_at) - Date.parse(a.deal_created_at)));
}

// ── what the server does ──
// POST /api/integrations/receive/:key: a contact (a known email updates it) and a deal in the first stage, and a log entry
function knLeadArrive(W, src, daysAgo = 0, i = 0, mins) {
  const L = KN_LEADS[src][i], at = knAgo(daysAgo, mins != null ? mins : daysAgo ? 120 : 0), jonas = src === 'form' && i === 0;
  let c = W.contacts.find(x => x.email === L.email);
  // (round 16) a known address, as routes/integrations.js:246-256 writes it now: nothing is emptied. The name, phone and
  // company kept when none is sent, a non-empty one replaces them; the custom fields merge (jsonb ||), a sent one wins
  if (c) {
    const sent = Object.fromEntries(Object.entries(L.custom || {}).filter(([, v]) => v != null && v !== ''));
    Object.assign(c, { name: L.name || c.name, phone: L.phone || c.phone, company: L.company || c.company, custom_data: { ...(c.custom_data || {}), ...sent }, updated_at: at });
  }
  else { c = { id: jonas ? 70 : ++W.seq, name: L.name, company: L.company || null, email: L.email, phone: L.phone || null, assigned_to: null, assigned_to_name: null, custom_data: { ...(L.custom || {}) }, created_at: at, updated_at: at }; W.contacts.push(c); }
  const d = { id: jonas && !knDeal(W, 120) ? 120 : ++W.seq, title: L.name, contact_id: c.id, value: null, urgency: 0, stage_id: 11, assigned_to: null, created_at: at, updated_at: at };
  W.deals.push(d);
  // what was captured, in JSONB's key order (shorter keys first, then by bytes), as Postgres hands it back
  const raw = {}; for (const k of ['name', 'email', 'phone', 'source', 'company']) if (L[k]) raw[k] = L[k];
  Object.assign(raw, L.custom || {});
  const captured = {}; for (const k of Object.keys(raw).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))) captured[k] = raw[k];
  W.logs.unshift({ id: ++W.seq, status: 'success', payload: { ...captured }, captured, error: null, created_at: at, contact_name: c.name, contact_id: c.id, deal_id: d.id });
  return d;
}
// PATCH /api/deals/:id/stage: into the Engine's stage the server sends vertrag.unterschrieben (a pending delivery)
function knSetStage(W, d, stageId) {
  const was = d.stage_id; d.stage_id = stageId;
  if (stageId === KN_WON && was !== KN_WON) { W.deliv[d.id] = { id: ++W.seq, status: 'pending', attempts: 0, last_status_code: null, last_error: null, created_at: knNow(), delivered_at: null }; W.live.add(d.id); }
}
// the Engine between two Aktualisieren: the delivery lands, then it reports n steps; a deal won again (a second
// vertrag.unterschrieben) never sets a status back that is further along
function knEngine(W, n = 1) {
  for (const id of W.live) {
    const d = knDeal(W, id), dv = W.deliv[id], c = d && knContact(W, d.contact_id);
    if (!dv || !c) continue;
    const on = W.onb[c.id] || (W.onb[c.id] = { status: 'kein_onboarding', drive: knDriveOf(c), akte: 0 });   // the folder from kunde.angelegt
    if (dv.status === 'pending') { Object.assign(dv, { status: 'success', attempts: 1, last_status_code: 200, delivered_at: knNow() }); if (KN_ONB_STEPS.indexOf(on.status) < 1) on.status = KN_ONB_STEPS[1]; c.updated_at = knNow(); continue; }
    const i = KN_ONB_STEPS.indexOf(on.status);
    if (i < 1 || i >= KN_ONB_STEPS.length - 1) continue;
    const j = Math.min(KN_ONB_STEPS.length - 1, i + n);
    on.status = KN_ONB_STEPS[j]; on.akte = (on.akte || 0) + 1;
    if (j >= 2 && c.id === 70 && !W.acts.some(a => a.source === 'engine' && a.contact_id === 70)) W.acts.unshift(knEngineNote(W, c));
    c.updated_at = knNow();
  }
}
// (round 16 review) a customer's Drive folder: the Engine creates it when the contact is created (kunde.angelegt, Briefing
// 2.1), so it is there before the win; Jonas Becker's is the one step 4 shows
function knDriveOf(c) { return c.id === 70 ? KN_DRIVE.replace('Rk4', 'Tq8') : KN_DRIVE.replace('Rk4', 'C' + c.id); }
// PATCH /api/kunden/:id with a phone number from the form that differs from the CRM's: nothing is overwritten, the
// note goes on the contact (no deal: it shows on his deal's timeline), source 'engine', no author (routes/engine-api.js)
function knEngineNote(W, c) {
  const content = `Upgrads Engine: abweichende Stammdaten erkannt – nicht überschrieben.\n• Telefon: CRM „${c.phone}“ / Engine „+49 40 5550123“`;
  knSampleAdd(content, `Upgrads Engine: differing master data detected – not overwritten.\n• Phone: CRM “${c.phone}” / Engine “+49 40 5550123”`);   // (round 14) English as well
  return { ...knAct(++W.seq, c.id, null, 'note', content, knNow(), null), source: 'engine', logged_by_name: 'Upgrads Engine', created_by_name: null };
}
// the booking (POST /api/integrations/calcom/book): Cal.com books the slot (it is no longer free, nor is any time it
// overlaps for the type's length) and names it "<type> zwischen <host> und <attendee>"; the server writes the meeting on
// the deal at once, with the Meet link when Cal.com already gave one (utils/calcom.js:439-443 bookingToActivity)
function knMeetingAdd(W, dealId, picked, meet, record, createdAt, type) {
  const d = knDeal(W, dealId), c = knContact(W, d.contact_id), ty = type || KN_INTRO, len = (ty.lengthInMinutes || 30) * 60000, at0 = Date.parse(picked);
  const de = `${ty.title} zwischen ${KN_ME.name} und ${c.name}`, en = `${KN_SAMPLE_EN[ty.title] || ty.title} between ${KN_ME.name} and ${c.name}`, link = meet ? `\n${meet === true ? KN_MEET : meet}` : '';
  knSampleAdd(de, en); knSampleAdd(de + link, en + link);
  const at = krBookingZonedParts(picked, KN_ZONE);
  if (W.slots[at.date]) W.slots[at.date] = W.slots[at.date].filter(sl => { const s0 = Date.parse(sl.start); return s0 + len <= at0 || s0 >= at0 + len; });
  const a = { ...knAct(++W.seq, c.id, d.id, 'meeting', de + link, createdAt || knNow(), KN_ME.id), source: 'calcom', calcom_uid: 'kn' + W.seq, calcom_event_type_id: ty.id,
    event_date: at.date, event_time: at.time, event_tz: KN_ZONE, record: !!record };
  W.acts.unshift(a);
  return a;
}
// POST /api/notetaker/webhook/:token (recording.completed): the note on the deal, the bell for the booker
function knNoteArrive(W) {
  const his = a => a.type === 'meeting' && a.source === 'calcom' && !a.cancelled_at && (a.deal_id === 120 || (a.deal_id == null && a.contact_id === 70));
  const m = W.acts.find(a => his(a) && a.record) || W.acts.find(his);   // (round 24) the meeting booked with Notetaker, not his own through the link
  if (!m || !m.record) return null;   // no meeting booked with "Mit Notetaker aufzeichnen": no bot, no note
  const ty = KN_CAL.event_types.find(x => x.id === m.calcom_event_type_id) || KN_INTRO;
  const a = { ...knAct(++W.seq, 70, 120, 'note', knNoteText('de', ty), knNow(), null), source: 'notetaker', logged_by_name: 'Notetaker' };
  W.acts.unshift(a);
  W.bell.items.unshift({ id: ++W.seq, workspace_id: 1, user_id: 1, actor_id: null, type: 'notetaker_done', category: 'activities', title: m ? String(m.content).split('\n')[0] : 'Notetaker',
    body: knNoteTitle('de', ty), entity_type: 'deal', entity_id: 120, read: false, created_at: knNow(), actor_name: null });
  return a;
}
function knRecState(id) { return { id, tab: 'activity', compose: { type: 'note', text: '', err: false }, only: false, filter: null }; }

/* ═══ parts and their frames ═══════════════════════════════════════════════════════════════════════════════ */
// Each part file registers itself with knPart(cfg), in page order. The cfg (see PLAN.md §3 for every field):
//   name, p          the part's name (its section kn-<name>, its frame kn-f-<name>, KN.<name>) and its id prefix
//   w, h, hm         the design size on wide screens (scaled up to the column) and the height on narrow screens;
//                    size(F) instead when it changes (the day's tabs)
//   page, pages      the page its world opens on, the pages its pieces show
//   home             the pages a click anywhere else leads here for (knRoute)
//   deal, contact    true: a deal (a contact) opened anywhere else leads here and is shown by showDeal / showContact
//   keep             the layers that are the part's piece (never closed by knQuiet, Esc or a scrim, never dimming it)
//   step             its stop on the spine, or none
//   world(W)         its own start state;  view(F) its pieces (knPiece);  after(F) after every render and reset
//   click/change/input/key(F, el|e, layer)   its own events first (true: handled)
//   afterPage(F), scroll(F, e), sync(F), reset(F), wire(), showDeal(T, id), showContact(T, id), saved(F)
const KN_PARTS = [];
function knPart(cfg) { KN_PARTS.push(cfg); return cfg; }
const KN_LAYERS = ['record', 'contact', 'form', 'detail', 'booking', 'confirm', 'toasts', 'menu'];
const KN = {};   // part name → frame
let knDark = false;

// ── what each page of the app brings: its screen, its events (flows-*.js register them) ──
const KN_MODS = {};          // page → { screen(F), click, change, input, key, after }
const KN_LAYER_MODS = {};    // layer → [{ on(F), paint(F), click, change, input, key, esc(F), scrim(F) }]
const KN_SUBMITS = [];       // [id suffix, fn]: the forms inside a frame
const KN_POINTER = [];       // [{ down, move, up, cancel }]: the board's drag
const KN_CONFIRM = {};       // confirm kind → { html(F, C), done(F, C) }
function knMod(page, m) { KN_MODS[page] = { ...(KN_MODS[page] || {}), ...m }; }
function knLayerMod(layer, m) { (KN_LAYER_MODS[layer] = KN_LAYER_MODS[layer] || []).push(m); }
function knLayerOwner(F, layer) { return (KN_LAYER_MODS[layer] || []).find(m => !m.on || m.on(F)) || null; }
function knSubmit(suffix, fn) { KN_SUBMITS.push([suffix, fn]); }

function knMount(P, lazy) {
  const host = knId(`kn-f-${P.name}`);
  if (!host) return null;
  host.innerHTML = `<div class="kn-stage"><div class="kr-frame"><div class="kr-app kn-cut-app"></div>${KN_LAYERS.map(l => `<div data-kn-layer="${l}"></div>`).join('')}</div></div>`;
  const stage = host.firstElementChild, root = stage.firstElementChild;
  const F = { part: P, kind: P.name, p: P.p, w: P.w, h: P.h, s: 1, host, stage, root, app: root.firstElementChild,
    layers: Object.fromEntries(KN_LAYERS.map(l => [l, root.querySelector(`[data-kn-layer="${l}"]`)])), timers: new Set(), run: 0, live: false, drag: null, noClick: false, W: null };
  KN[P.name] = F;
  F.W = knWorld(P);
  knWire(F);
  knScale(F);
  if ('ResizeObserver' in window) new ResizeObserver(() => knScale(F)).observe(host);
  F.lazy = true;
  if (!lazy) knWake(F);
  return F;
}
// the frame drawn the first time it is needed: on approach (knLazy), or when anything paints into it or leads to it
function knWake(F) {
  if (!F || !F.lazy) return;
  F.lazy = false;
  knRender(F);
  if (F.part.after) F.part.after(F);
  knOnLoad(F);
}
function knWakeAll() { for (const F of Object.values(KN)) knWake(F); }
function knLazy() {
  const rest = Object.values(KN).filter(F => F.lazy);
  if (!rest.length) return;
  if (!('IntersectionObserver' in window)) return knWakeAll();
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { const F = Object.values(KN).find(x => x.host === e.target); io.unobserve(e.target); knWake(F); } }, { rootMargin: '900px 0px' });
  for (const F of rest) io.observe(F.host);
}
// one zoom for every frame (round 12): the app at its own size, 1:1, as wide as its column; a column narrower than a
// part's design width shows the design scaled down. Tablets and phones: the app's own narrow layout at full size,
// exactly as wide as the frame (never wider: a phone never scrolls sideways)
const KN_MAX_S = 1;   // never zoomed up: the app's text keeps one size down the page
function knScale(F) {
  const z = F.part.size ? F.part.size(F) : F.part, cw = F.host.clientWidth, narrow = cw > 0 && cw < (F.part.narrowBelow || 1024);
  // a part with a zoom limit (maxS) grows its design width instead of zooming further, so its frame stays filled
  const grow = KN_MAX_S;
  F.w = narrow ? cw : grow && cw > 0 ? Math.round(cw / grow) : z.w;   // (round 14) the column's width: never scaled below 1:1
  F.h = narrow ? z.hm : z.h;
  F.s = (narrow ? 1 : Math.min(cw / F.w, KN_MAX_S)) || 1;
  F.x = narrow || !(cw > 0) ? 0 : Math.max(0, Math.round((cw - F.w * F.s) / 2));
  F.host.style.setProperty('--kn-x', String(F.x));
  F.narrow = narrow;
  F.host.classList.toggle('kn-narrow', narrow);   // the parts' narrow rules key on this (a container query cannot: the stage is the design width)
  F.host.style.setProperty('--kn-w', String(F.w));
  F.host.style.setProperty('--kn-h', String(F.h));
  F.host.style.setProperty('--kn-s', String(F.s));
}
function knLater(F, ms, fn) { const id = setTimeout(() => { F.timers.delete(id); knIn(F, fn); }, ms); F.timers.add(id); return id; }
// "Von vorn": the part's world as it started
function knReset(F) {
  F.lazy = false;
  F.run++;
  knIdle(F.part.name, true);
  for (const id of F.timers) clearTimeout(id);
  F.timers.clear();
  F.W = knWorld(F.part);
  knScale(F);
  knRender(F);
  if (F.part.after) F.part.after(F);
  if (F.part.reset) F.part.reset(F);
  knOnLoad(F);
}
// the dialogs a part opens by itself (on load, on Von vorn): open in the middle of the page, they never hold Tab
function knOnLoad(F) { F.onLoad = new Set(KN_ESC.filter(l => !!F.layers[l].firstElementChild)); }
const knQ = (F, sel) => F.root.querySelector(sel);
// focus only once the visitor works in this frame (a focus on load would scroll the page)
function knFocus(F, sel) { if (!F.live) return; const el = typeof sel === 'string' ? knQ(F, sel) : sel; if (el) el.focus({ preventScroll: true }); }
// a changed spot, briefly ringed so the eye finds it
function knFlash(F, sel) {
  const el = typeof sel === 'string' ? knQ(F, sel) : sel;
  if (!el) return;
  el.classList.remove('kn-flash', 'kn-flash-out');
  el.classList.add('kn-flash');
  knLater(F, 60, () => el.classList.add('kn-flash-out'));
  knLater(F, 2400, () => el.classList.remove('kn-flash', 'kn-flash-out'));
}

// ── painting: a frame is its pieces (the part's view) and the app's layers over them ──
// a piece: one place of the CRM on the app's own surface; data-kn-page tells the events which page's rules apply
function knPiece(page, html, cls) { return `<div class="kn-piece${cls ? ' ' + cls.split(' ').map(c => 'kn-piece-' + c).join(' ') : ''}" data-kn-page="${page}">${html}</div>`; }
// the app's whole screen for a page (its module's screen), to pick a piece from
function knScreen(F, page) { const M = KN_MODS[page || F.W.page]; return M && M.screen ? M.screen(F) : ''; }
function knPick(html, sel) { const tpl = document.createElement('template'); tpl.innerHTML = html; const el = tpl.content.querySelector(sel); return el ? el.outerHTML : ''; }
function knTrim(html, sels) { const tpl = document.createElement('template'); tpl.innerHTML = html; for (const s of sels || []) tpl.content.querySelectorAll(s).forEach(el => el.remove()); return tpl.innerHTML; }
const knShows = (F, page) => !!F.app.querySelector(`[data-kn-page="${page}"]`);
function knPaintApp(F) { F.app.innerHTML = `<main class="view kn-cut-view">${F.part.view ? F.part.view(F) : ''}</main>`; }
// a re-render keeps the scroll of whatever scrolls in it
const KN_SCROLLERS = ['.board', '.tk-scroll', '.tk-side', '.cw-body', '.chat-page-messages', '.table-wrap', '.page', '.kn-piece'];
function knPaintPage(F) {
  const view = knQ(F, 'main.view');
  if (!view) return knPaintApp(F);
  const keep = [];
  for (const s of KN_SCROLLERS) view.querySelectorAll(s).forEach((e, i) => keep.push([s, i, e.scrollLeft, e.scrollTop]));
  const top = view.scrollTop;
  view.innerHTML = F.part.view ? F.part.view(F) : '';
  view.scrollTop = top;
  for (const [s, i, l, tp] of keep) { const e = view.querySelectorAll(s)[i]; if (e) { e.scrollLeft = l; e.scrollTop = tp; } }
  knAfterPage(F);
}
function knAfterPage(F) {
  knInertify(F);
  for (const [pg, M] of Object.entries(KN_MODS)) if (M.after && knShows(F, pg)) M.after(F);
  if (F.part.afterPage) F.part.afterPage(F);
}
function knPaint(F, layer) {
  if (F.lazy) return knWake(F);   // not drawn yet: drawn whole, with this layer as the world has it
  const L = F.layers[layer];
  if (!L) return;
  if (layer === 'toasts') {   // (round 24) one .toasts live region per frame, only its children swapped, as the app keeps its one
    let box = L.firstElementChild && L.firstElementChild.classList && L.firstElementChild.classList.contains('toasts') ? L.firstElementChild : null;
    if (!box) { L.innerHTML = krToasts([]); box = L.firstElementChild; }
    const tpl = document.createElement('template');
    tpl.innerHTML = krToasts(F.W.toasts);
    const fresh = tpl.content && tpl.content.firstElementChild;
    if (box && fresh && box.replaceChildren) box.replaceChildren(...fresh.childNodes);
    else L.innerHTML = krToasts(F.W.toasts);   // a DOM without template contents: the region whole, as before
  }
  else if (layer === 'confirm') L.innerHTML = knConfirmHtml(F);
  else { const m = knLayerOwner(F, layer); L.innerHTML = (m && m.paint && m.paint(F)) || ''; if (m && m.after && L.firstElementChild) m.after(F, L); }
  if (F.onLoad && !L.firstElementChild) F.onLoad.delete(layer);   // closed: opened again, it is the visitor's
  knInertify(F);
  knDim(F);
  knFit(F);
}
// (round 14) phones: a part whose app markup can grow measures it after a paint and its frame follows (part.fit)
function knFit(F) { if (F && !F.lazy && F.part.fit) F.part.fit(F); }
// a dialog over the pieces: its scrim stays clear and the pieces under it dim, in their own shape (a layer that is the
// part's own piece does not count)
function knDim(F) {
  const keep = F.part.keep || [];
  const dim = ['record', 'contact', 'form', 'detail', 'booking', 'confirm'].some(l => !keep.includes(l) && !!F.layers[l].firstElementChild);
  F.root.classList.toggle('is-dim', dim);
  // (round 15) what a dialog dims is out of reach while it is open, as under the app's own dialog: it holds no tab stops
  for (const el of [F.app, ...keep.map(l => F.layers[l])]) if (el && el.toggleAttribute) el.toggleAttribute('inert', dim);
}
function knRender(F) {
  F.W.menu = null;
  F.layers.menu.innerHTML = '';
  knPaintApp(F);
  knAfterPage(F);
  for (const l of ['record', 'contact', 'form', 'detail', 'booking', 'confirm', 'toasts']) knPaint(F, l);
}
// the bell's panel and badge, wherever a part shows them
const knUnread = W => W.bell.items.filter(n => !n.read).length;
function knPaintBell(F) {
  const W = F.W, panel = knId(`${F.p}-notif-panel`), badge = knId(`${F.p}-notif-badge`), n = knUnread(W);
  const items = F.part.bellItems ? F.part.bellItems(F) : W.bell.items;   // (round 25) a part may show only the deal's own
  if (panel) panel.outerHTML = krBellPanel({ p: F.p, items: knL(items), open: W.bell.open });
  if (badge) { badge.textContent = n > 9 ? '9+' : String(n); badge.classList.toggle('hidden', n === 0); }
}

// ── toasts (core.js ui.toast: 4200 ms, at most 3, the oldest goes first) ──
function knToast(F, text, action, fn) {
  const W = F.W, x = { text, action: action || null, fn: fn || null };
  W.toasts.push(x);
  if (W.toasts.length > 3) W.toasts.shift();
  knPaint(F, 'toasts');
  knLater(F, 4200, () => { const i = F.W.toasts.indexOf(x); if (i >= 0) { F.W.toasts.splice(i, 1); knPaint(F, 'toasts'); } });
}
function knToastAct(F, i) { const x = F.W.toasts[i]; if (!x) return; F.W.toasts.splice(i, 1); knPaint(F, 'toasts'); if (x.fn) x.fn(); }

// ── what the preview leaves out: the app's controls it does not port are inert (no pointer, aria-disabled, out of the
// tab order; buttons dimmed), so a visitor meets no dead end; a menu's left-out item comes with inert: true. The few
// left (a note's text, which stays selectable; a toast's Öffnen) say so with the app's toast and the page's words (knOff).
// Flows add their own (KN_INERT.push). ──
const knOff = F => knToast(F, knWord('kn_off'));
const KN_OFF = [];   // controls left live that still answer "nicht enthalten": none since round 14. Every left-out control
                     // is inert instead, and a click or tap on it answers with the same toast (knClick), its tooltip kept
const KN_INERT = ['[data-kr="workspaces"]', '[data-kr="clock-tz"]', '[data-kr="add-event"]', '[data-addday]', '[data-more]', '[data-kr="new-task"]', '[data-kr="add-list"]',
  '[data-kr="new-project"]', '[data-kr="project-menu"]', '[data-kr="list-menu"]', '[data-kr="sort-menu"]', '[data-kr="view-board"][id$="task-view-kanban"]',
  '[data-kr="bulk-status"]', '[data-kr="bulk-owner"]', '[data-kr="bulk-priority"]', '[data-kr="bulk-due"]', '[data-kr="bulk-delete"]', '[data-kr="analytics-config"]', '[data-kr^="field-"]',
  '[data-kr^="object-field-"]',
  '.dv-join', '[data-cal-resched]', '[data-cal-cancel]',   // a sample Meet link opens nothing; moving and cancelling a booking is left out
  // the sample's links lead nowhere: WhatsApp, the dialer, mail and a Meet link written into an entry
  'a[href^="https://wa.me/"]', 'a[href^="tel:"]', 'a[href^="mailto:"]', 'a[href^="https://meet.google.com/"]'];
function knInert(el) {
  if (el.classList.contains('kn-inert')) return;
  el.classList.add('kn-inert');
  el.setAttribute('aria-disabled', 'true');
  el.setAttribute('tabindex', '-1');
  el.dataset.knTitle = 'kn_off';   // the tooltip says why, in the page's language (knSetLang follows data-kn-title)
  el.title = knWord('kn_off');
}
function knInertify(F) {
  for (const el of F.root.querySelectorAll(KN_INERT.join(', '))) knInert(el);
  // the app's own headings ("Empfangene Leads", a record's title, "Details") are a frame's content, not the page's
  // sections: in the page's outline they sit under the part's heading (level 3 and down), their look unchanged
  for (const h of F.root.querySelectorAll('h1, h2, h3, h4, h5, h6')) if (!h.hasAttribute('aria-level')) h.setAttribute('aria-level', String(Math.min(6, Math.max(3, Number(h.tagName[1]) + 1))));
  // a deal card outside the deal's home opens the deal in step 3 (knRouteDeal): its name says so after the app's own
  // ("Carport-Solardach, 38.000 €, In Schritt 3 öffnen"), and the page's tag shows it on hover and focus (data-kn-hint)
  if (!F.part.deal) for (const c of F.root.querySelectorAll('.dcard[data-id]')) {
    if (!('knLabel' in c.dataset)) c.dataset.knLabel = c.getAttribute('aria-label') || '';
    c.dataset.knHint = knWord('kn_jump_tag');
    c.setAttribute('aria-label', c.dataset.knLabel ? `${c.dataset.knLabel}, ${c.dataset.knHint}` : c.dataset.knHint);
  }
  // (round 13) on touch the tag shows on one card per board: Jonas Becker's where he is on it, else the first
  const one = F.root.querySelector('.dcard[data-kn-hint][data-id="120"]') || F.root.querySelector('.dcard[data-kn-hint]');
  for (const c of F.root.querySelectorAll('.dcard[data-kn-hint-one]')) if (c !== one) delete c.dataset.knHintOne;
  if (one) one.dataset.knHintOne = '';
}

// ── menus (core.js ui.popover + ui.menu): under the anchor, or above it when there is no room ──
function knMenuOpen(F, anchor, items, on, align) {
  F.W.menu = { items, on, anchor };
  F.layers.menu.innerHTML = krMenu({ p: F.p + 'm', items });
  const m = F.layers.menu.firstElementChild, fr = F.root.getBoundingClientRect(), ar = anchor.getBoundingClientRect(), s = F.s || 1;
  // an item the page leaves out comes with inert: true: shown, and inert like any other such control
  items.forEach((it, i) => { const b = it.inert && m.querySelector(`.menu-item[data-i="${i}"]`); if (b) knInert(b); });
  const ax = (ar.left - fr.left) / s, ay = (ar.top - fr.top) / s, aw = ar.width / s, ah = ar.height / s, mw = m.offsetWidth, mh = m.offsetHeight;
  const left = Math.max(8, Math.min(align === 'right' ? ax + aw - mw : ax, F.w - mw - 8));
  let top = ay + ah + 6;
  if (top + mh > F.h - 8) top = Math.max(8, ay - mh - 6);
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  knFocus(F, m.querySelector('.menu-item:not(.kn-inert)'));
}
// a popover with its own content (the contacts' text filter): pop holds what it answers to (input, rm)
function knPopOpen(F, anchor, html, pop, width) {
  F.W.menu = { items: [], on: null, anchor, pop };
  F.layers.menu.innerHTML = krMenu({ p: F.p + 'm', html, width });
  const m = F.layers.menu.firstElementChild, fr = F.root.getBoundingClientRect(), ar = anchor.getBoundingClientRect(), s = F.s || 1;
  // placed as ui.popover places it (core.js:1450-1454), the frame for the window: under the anchor, never past the
  // frame's right edge (a chip at the right of a 360 px phone), above the anchor when there is no room under it
  const ax = (ar.left - fr.left) / s, ay = (ar.top - fr.top) / s, ah = ar.height / s, mw = m.offsetWidth || width || 0, mh = m.offsetHeight;
  let top = ay + ah + 6;
  if (top + mh > F.h - 8) top = Math.max(8, ay - mh - 6);
  m.style.left = `${Math.max(8, Math.min(ax, F.w - mw - 8))}px`;
  m.style.top = `${top}px`;
  return m;
}
function knMenuClose(F, refocus) { const M = F.W.menu; F.W.menu = null; F.layers.menu.innerHTML = ''; if (refocus && M && M.anchor.isConnected) knFocus(F, M.anchor); }
function knMenuPick(F, i) { const M = F.W.menu; if (!M) return; const it = M.items[i]; knMenuClose(F, false); if (it && M.on) M.on(it); }
// ui.select: the options as a menu, the current one ticked
function knSelectItems(opts, cur, act) { return opts.map(o => ({ label: o.label, icon: o.icon, checked: o.value === cur, act, value: o.value })); }

// ── confirms (ui.confirm): each kind brings its dialog and its yes ──
function knConfirmOpen(F, C) { knMenuClose(F); F.W.confirm = C; knPaint(F, 'confirm'); knFocus(F, '[data-kn-layer="confirm"] [data-close]'); }
function knConfirmHtml(F) { const C = F.W.confirm, K = C && KN_CONFIRM[C.kind]; return K ? K.html(F, C) : ''; }
function knConfirmDone(F, yes) {
  const W = F.W, C = W.confirm;
  if (!C) { F.layers.confirm.innerHTML = ''; return; }
  W.confirm = null;
  knPaint(F, 'confirm');
  if (!yes) { if (C.back && C.back.isConnected) knFocus(F, C.back); return; }
  const K = KN_CONFIRM[C.kind];
  if (K && K.done) K.done(F, C);
}

/* ═══ routing: each place of the CRM is one part's; a click in another part leads to it ═════════════════════ */
function knHome(page) { const P = KN_PARTS.find(x => (x.home || []).includes(page)); return P ? KN[P.name] || null : null; }
// a page switch asked for inside a frame (a link in a piece): there when the part shows that page, else in its home
function knNav(F, page) {
  if ((F.part.pages || []).includes(page)) { if (F.W.page !== page) knGo(F, page); return; }
  knRoute(F, page);
}
// a routed page must be seen: whatever covers the target's pieces closes quietly (no toast, nothing saved)
function knQuiet(T) {
  T.run++;
  const keep = T.part.keep || [], W = T.W;
  W.menu = null; W.confirm = null;
  if (!keep.includes('record')) W.record = null;
  if (!keep.includes('contact')) W.ctRec = W.ctRec && W.ctRec.host === 'panel' ? W.ctRec : null;
  if (!keep.includes('form')) { W.df = null; W.cf = null; }
  if (!keep.includes('booking')) W.booking = null;
  W.detail = null;
  if (!keep.includes('bell')) W.bell.open = false;   // (round 27) step 3's bell is its piece: a jump into it keeps it open
  T.layers.menu.innerHTML = '';
  for (const l of ['record', 'contact', 'form', 'detail', 'booking', 'confirm']) knPaint(T, l);
}
// the landing page moves to the section whose part shows the page, and that part shows it
function knRoute(F, page) {
  const T = knHome(page);
  if (!T) return knOff(F);
  if (T === F) return knNav(F, page);
  knMenuClose(F);
  knQuiet(T);
  knGo(T, page);
  knShow(T, T.root.querySelector(`.kn-piece[data-kn-page="${page}"]`) || T.root.querySelector('.kn-piece'), F);
}
// the page moves to the target's section, its heading takes focus, and the piece that shows what was asked for is marked
function knShow(T, el, F) {
  knWake(T);
  const sec = knId(`kn-${T.part.name}`);
  if (!sec) return;
  (sec.closest('.kn-st') || sec).scrollIntoView({ behavior: KN_STILL ? 'auto' : 'smooth', block: 'start' });   // (round 26) the station
  const h = sec.querySelector('[data-kn-head][tabindex="-1"]');
  knBackOffer(h, F, T);
  if (h) h.focus({ preventScroll: true });
  knFlash(T, el);
}
// after a jump to another part, a small link before its heading leads back to the part the click came from (and gives
// it focus); the next jump moves it, a click on it removes it
// (round 22 review) a jump from the Engine's block leads back there, and says so
function knBackLabel(b) { const S = KN[b.dataset.from]; return S && S.part.step ? knWord('kn_back').replace('{n}', String(S.part.step)) : knWord(S && S.part.name === 'engine' ? 'kn_back_engine' : 'kn_back_day'); }
function knBackOffer(h, F, T) {
  let b = knId('kn-back');
  if (!b) {
    b = document.createElement('a');
    b.className = 'kn-a kn-back'; b.id = 'kn-back'; b.href = '#';
    b.addEventListener('click', e => {
      e.preventDefault();
      const S = KN[b.dataset.from], sec = S && knId(`kn-${S.part.name}`), T0 = KN[b.dataset.to];
      b.hidden = true;
      if (T0 && T0.part.back) knIn(T0, () => T0.part.back(T0));   // (round 25) step 3 shows Jonas Becker's record again
      if (!sec) return;
      (sec.closest('.kn-st') || sec).scrollIntoView({ behavior: KN_STILL ? 'auto' : 'smooth', block: 'start' });
      const sh = sec.querySelector('[data-kn-head][tabindex="-1"]');
      if (sh) sh.focus({ preventScroll: true });
    });
  }
  if (!h || !F) { b.hidden = true; return; }
  b.dataset.to = T ? T.part.name : '';
  b.dataset.from = F.part.name;
  b.textContent = knBackLabel(b);
  b.hidden = false;
  h.before(b);
}
// a deal opened anywhere (a card, a task, an onboarding row, a contact's deals) leads to the part that shows deals
// (cfg.deal), as the frame it came from has it
function knRouteDeal(F, id) {
  const P = KN_PARTS.find(x => x.deal), T = P && KN[P.name];
  if (!T) return knOff(F);
  knMenuClose(F);
  // (round 25) Jonas Becker's deal is the story's: the deal's home has its own history of it (the call, his own booking,
  // the Beratung and its note). A jump from an earlier step (1, 2, the day) shows that one as it is; from a later step
  // (4, the Engine) the deal comes as that step has it (won, its value and owner) and keeps the home's history
  const story = id === 120 && T !== F && !!knDeal(T.W, 120), later = story && (F.W.shift || 0) > (T.W.shift || 0);
  // (round 25 review) the won deal comes with its step's clock: step 3 shows it as step 4 sees it ("vor 3 Wochen"), and
  // "Zurück" gives step 3 back its own story and clock (part.back); a jump from anywhere else first does the same
  if (T !== F && T.part.story) T.part.story(T, later ? F : null);
  const did = T === F || (story && !later) ? id : knCarry(F.W, T.W, id, null, story).deal;
  if (T !== F) knQuiet(T);
  if (T.part.showDeal) T.part.showDeal(T, did); else { T.W.record = knRecState(did); knPaint(T, 'record'); }
  if (T !== F) knShow(T, T.root.querySelector('.kn-piece') || T.root.querySelector('[data-kn-layer="record"] .modal'), F);
}
// "Termin buchen" outside step 2 (a contact's record) leads to step 2 with that contact's newest deal and its booking
// dialog open, as the part it came from has them (knCarry); a contact without a deal has nothing to book on
function knRouteBook(F, contactId) {
  const T = KN.termin, W = F.W, d = W.deals.filter(x => x.contact_id === contactId).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!T || !d) return knOff(F);
  knMenuClose(F);
  const did = knCarry(W, T.W, d.id, null).deal;
  knQuiet(T);
  T.W.record = knRecState(did);
  knPaint(T, 'record');
  knBookOpen(T, true);
  knShow(T, T.root.querySelector('[data-kn-layer="booking"] .modal') || T.root.querySelector('[data-kn-layer="record"] .modal'), F);
}
// a contact opened anywhere else leads to the part that shows contacts (cfg.contact)
function knRouteContact(F, id) {
  const P = KN_PARTS.find(x => x.contact), T = P && KN[P.name];
  if (!T) return knOff(F);
  knMenuClose(F);
  const cid = T === F ? id : knCarry(F.W, T.W, null, id).contact;
  if (T !== F) knQuiet(T);
  if (T.part.showContact) T.part.showContact(T, cid);
  if (T !== F) knShow(T, T.root.querySelector('.kn-piece'), F);
}
// each part's workspace is its own: what moves to another part arrives as the part it came from has it. The seed (ids
// under 1000, Jonas Becker's 70 and 120 among them) is the same in every part and matches by id; what a part made
// itself matches by where it came from, and gets an id of the target's own
// keep: the target's own entries on the deal stay beside the source's (a later step's deal over the story's history)
function knCarry(S, T, dealId, contactId, keep) {
  const put = (list, x, patch) => {
    const key = x.kn_from || `${S.kind}:${x.id}`, seed = x.id < 1000 && !x.kn_from;
    const i = list.findIndex(y => (seed ? y.id === x.id : y.kn_from === key));
    const y = { ...x, ...patch, id: i >= 0 ? list[i].id : seed ? x.id : ++T.seq, kn_from: seed ? null : key };
    if (i >= 0) list[i] = y; else list.push(y);
    return y.id;
  };
  const d = dealId != null ? knDeal(S, dealId) : null, c = knContact(S, d ? d.contact_id : contactId);
  const cid = c ? put(T.contacts, c) : null, did = d ? put(T.deals, d, { contact_id: cid }) : null;
  const to = (v, from, id) => (v != null && v === from ? id : v);
  // what the target has on this deal or contact that the source does not (yesterday's call in another part's sample, an
  // entry of the target's own) goes: the history is the source's
  const mine = S.acts.filter(a => (d && a.deal_id === d.id) || (c && a.contact_id === c.id));
  const keys = new Set(mine.map(a => (a.id < 1000 && !a.kn_from ? `seed:${a.id}` : a.kn_from || `${S.kind}:${a.id}`)));
  if (!keep) T.acts = T.acts.filter(a => !((did != null && (a.deal_id === did || a.bound_deal_id === did)) || (cid != null && a.contact_id === cid)) || keys.has(a.id < 1000 && !a.kn_from ? `seed:${a.id}` : a.kn_from));
  for (const a of mine) put(T.acts, a, { contact_id: to(a.contact_id, c && c.id, cid), deal_id: to(a.deal_id, d && d.id, did), bound_deal_id: to(a.bound_deal_id, d && d.id, did) });
  for (const x of S.tasks) if (d && x.deal_id === d.id && !x.parent_id) put(T.tasks, x, { deal_id: did });
  return { deal: did, contact: cid };
}
// a part's page switch (the day's tabs): what switchPage does, loading the page again
function knGo(F, page) {
  const W = F.W;
  W.page = page;
  W.bell.open = false;
  if (page === 'deals' && W.ctRec && W.ctRec.host === 'panel') W.ctRec = null;   // auth.js:543: only Deals closes the contact's panel
  if (W.dealsUI.view === 'list') W.dealsUI.sel = [];
  knMenuClose(F);
  knEnter(W);
  if (F.part.size) knScale(F);
  knPaintApp(F);
  knAfterPage(F);
  if (F.part.sync) F.part.sync(F);
}

/* ═══ events: one delegated set per frame, handed to the part, then the layer's or the page's module ══════════ */
function knLayerOf(el) { const l = el.closest('[data-kn-layer]'); return l ? l.dataset.knLayer : 'app'; }
function knPageOf(F, el) { const p = el.closest('[data-kn-page]'); return p ? p.dataset.knPage : F.W.page; }
function knWire(F) {
  const R = F.root;
  if ('MutationObserver' in window) new MutationObserver(() => knInertify(F)).observe(R, { childList: true, subtree: true });   // every partial repaint
  R.addEventListener('click', e => knClick(F, e));   // knClick, knChange, knInput, knKey, knPointerDown: on the frame's clock (knOnClock)
  R.addEventListener('change', e => knChange(F, e));
  R.addEventListener('input', e => knInput(F, e));
  R.addEventListener('focusout', e => knIn(F, () => { const layer = knLayerOf(e.target), m = layer !== 'app' && knLayerOwner(F, layer); if (m && m.blur) m.blur(F, e.target); }));
  R.addEventListener('keydown', e => knKey(F, e));
  R.addEventListener('submit', e => knIn(F, () => {
    e.preventDefault();
    const id = e.target.id;
    for (const [suf, fn] of KN_SUBMITS) if (id === F.p + suf) return fn(F);
  }));
  R.addEventListener('mousedown', e => knIn(F, () => {
    if (!e.target.classList.contains('overlay')) return;   // the bare scrim closes its dialog
    const l = knLayerOf(e.target);
    if ((F.part.keep || []).includes(l)) return;
    if (l === 'confirm') return knConfirmDone(F, false);
    const m = knLayerOwner(F, l);
    if (m && m.scrim) m.scrim(F);
  }));
  R.addEventListener('pointerdown', e => { F.touch = e.pointerType === 'touch'; knPointerDown(F, e); });   // a touch has no tooltip
  R.addEventListener('pointermove', e => knIn(F, () => { for (const h of KN_POINTER) if (h.move) h.move(F, e); }));
  R.addEventListener('pointerup', e => knIn(F, () => { for (const h of KN_POINTER) if (h.up) h.up(F, e); }));
  R.addEventListener('pointercancel', e => knIn(F, () => { for (const h of KN_POINTER) if (h.cancel) h.cancel(F, e); }));
  R.addEventListener('scroll', e => knIn(F, () => { if (F.part.scroll) F.part.scroll(F, e); }), true);   // scroll does not bubble
}
function knClick(F, e) {
  const el = e.target, W = F.W;
  if (e.isTrusted) F.live = true;
  if (el.closest('a[href]')) e.preventDefault();   // every link in a frame is sample data: dialers, mail, Meet, Drive
  if (F.noClick) return;
  // left out, and shown as such (a link goes nowhere, a form is not sent): the toast says so on any click, the tooltip
  // before it
  if (el.closest('.kn-inert')) { e.preventDefault(); knOff(F); return; }
  const layer = knLayerOf(el);
  if (F.part.click && F.part.click(F, el, layer)) return;
  if (layer === 'toasts') { const b = el.closest('[data-kr-toast]'); if (b) knToastAct(F, Number(b.dataset.krToast)); return; }
  if (layer === 'menu') {
    if (W.menu && W.menu.pop && W.menu.pop.rm && el.closest('[data-rm]')) { const pop = W.menu.pop; knMenuClose(F); return pop.rm(F); }
    const b = el.closest('.menu-item[data-i]'); if (b) knMenuPick(F, Number(b.dataset.i)); return;
  }
  if (layer === 'confirm') { if (el.closest('[data-yes]')) knConfirmDone(F, true); else if (el.closest('[data-no], [data-close]')) knConfirmDone(F, false); return; }
  if (layer !== 'app') { const m = knLayerOwner(F, layer); if (m && m.click) m.click(F, el); return; }
  if (KN_OFF.length && el.closest(KN_OFF.join(', '))) return knOff(F);
  const M = KN_MODS[knPageOf(F, el)];
  if (M && M.click) M.click(F, el);
}
function knChange(F, e) {
  const el = e.target, layer = knLayerOf(el);
  if (F.part.change && F.part.change(F, el, layer)) return;
  if (layer !== 'app') { const m = knLayerOwner(F, layer); if (m && m.change) m.change(F, el); return; }
  const M = KN_MODS[knPageOf(F, el)];
  if (M && M.change) M.change(F, el);
}
function knInput(F, e) {
  const el = e.target, W = F.W, layer = knLayerOf(el);
  if (F.part.input && F.part.input(F, el, layer)) return;
  if (layer === 'menu') { if (W.menu && W.menu.pop && W.menu.pop.input) W.menu.pop.input(F, el); return; }
  if (layer !== 'app') { const m = knLayerOwner(F, layer); if (m && m.input) m.input(F, el); return; }
  const M = KN_MODS[knPageOf(F, el)];
  if (M && M.input) M.input(F, el);
}
function knKey(F, e) {
  const el = e.target, W = F.W, layer = knLayerOf(el);
  if (e.isTrusted && e.key !== 'Tab' && e.key !== 'Shift') F.live = true;
  if (F.part.key && F.part.key(F, e, layer)) return;
  if (layer === 'menu') {
    if (W.menu && W.menu.pop && e.key === 'Enter') { e.preventDefault(); return knMenuClose(F); }
    if (W.menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = [...F.layers.menu.querySelectorAll('.menu-item')], i = items.indexOf(document.activeElement);
      if (!items.length) return;
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
    return;
  }
  if (layer !== 'app') { const m = knLayerOwner(F, layer); if (m && m.key) m.key(F, e); return; }
  const M = KN_MODS[knPageOf(F, el)];
  if (M && M.key) M.key(F, e);
}
// the frame a key or a pointer belongs to
function knFrameOf(el) { const h = el && el.closest ? el.closest('.kn-frame') : null; return h ? Object.values(KN).find(F => F.host === h) || null : null; }
// Esc (the top layer only, never while a menu is open) and Tab kept inside a dialog the visitor opened, as core.js does
const KN_ESC = ['booking', 'confirm', 'detail', 'form', 'contact', 'record'];
function knDocKey(e) {
  const F = knFrameOf(e.target);
  if (!F) return;
  const W = F.W, keep = F.part.keep || [];
  if (e.key === 'Escape') {
    if (W.menu) return knMenuClose(F, true);
    for (const l of KN_ESC) {
      if (keep.includes(l) || !F.layers[l].firstElementChild) continue;
      if (l === 'confirm') return knConfirmDone(F, false);
      const m = knLayerOwner(F, l);
      if (m && m.esc && m.esc(F)) return;
    }
    return;
  }
  if (e.key !== 'Tab') return;
  const top = [...F.root.querySelectorAll('[data-kn-layer] .overlay .modal')].filter(m => !keep.includes(knLayerOf(m)) && !(F.onLoad && F.onLoad.has(knLayerOf(m)))).pop();
  if (!top) return;
  const f = [...top.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
// a press closes what a press outside closes (a menu, the bell's panel), then the drag may start
function knPointerDown(F, e) {
  const W = F.W;
  if (e.isTrusted) F.live = true;
  if (W.menu && !F.layers.menu.contains(e.target)) knMenuClose(F);
  if (W.bell.open && !e.target.closest(`#${F.p}-notif-panel, #${F.p}-notif-bell-btn`) && !(F.part.keep || []).includes('bell')) { W.bell.open = false; knPaintBell(F); }
  for (const h of KN_POINTER) if (h.down) h.down(F, e);
}

/* ═══ the spine: the deal's four steps down the page, reached by what the visitor does ═══════════════════════ */
const KN_DONE = new Set();
function knStep(n) {
  if (!n || KN_DONE.has(n)) return;
  KN_DONE.add(n);
  knStepSync();
}
// (round 24) a part that starts over without what made it done (step 3's note, wiped by a new booking in step 2) is
// no longer marked: the rail, the stop and the drawing's thread go back with it
function knStepUndo(n) {
  if (!KN_DONE.delete(n)) return;
  knStepSync();
}
function knStepSync() {
  const main = document.querySelector('main');
  if (main) main.dataset.knDone = [...KN_DONE].sort().join(' ');   // the rule above a stop reads the step before it
  document.querySelectorAll('.kn-stop[data-step]').forEach(s => {
    const n = Number(s.dataset.step), done = KN_DONE.has(n), sec = s.closest('[data-kn-part]'), vh = s.querySelector('.kn-vh');
    s.classList.toggle('is-done', done);
    if (sec) sec.classList.toggle('is-done', done);
    if (vh) vh.textContent = knWordN(done ? 'kn_step_done' : 'kn_step', n);
  });
  // (round 26) the station dots of the four steps: filled once their part is done (the stops above carry the words)
  document.querySelectorAll('.kn-dot[data-step]').forEach(d => d.classList.toggle('is-done', KN_DONE.has(Number(d.dataset.step))));
}

/* ═══ the page around the parts ═════════════════════════════════════════════════════════════════════════════ */
// every overlay and menu closed, without a sound: what a fresh page load would show (the part's own piece stays)
function knCalm(F) { knQuiet(F); knRender(F); if (F.part.after) F.part.after(F); }
// the app's theme lives on <html data-theme>, which only the frames read (the page has its own tokens)
function knSetTheme(dark) {
  knDark = !!dark;
  document.documentElement.setAttribute('data-theme', knDark ? 'dark' : '');
  for (const F of Object.values(KN)) { if (knShows(F, 'settings')) knPaintPage(F); if (F.part.saved) F.part.saved(F); }
}
function knSetLang(l, save) {
  const was = knLang;
  knLang = l === 'en' ? 'en' : 'de';
  for (const P of KN_PARTS) if (P.lang && KN[P.name]) P.lang(KN[P.name], was);
  currentLang = knLang;   // the replicas' language (landing-ui.js)
  document.documentElement.lang = knLang;
  document.title = knWord('kn_doc_title');
  document.querySelectorAll('meta[data-kn-meta]').forEach(m => m.setAttribute('content', knWord(m.dataset.knMeta)));
  const back = knId('kn-back');
  if (back) back.textContent = knBackLabel(back);
  document.querySelectorAll('[data-kn]').forEach(el => { el.textContent = knWord(el.dataset.kn); });
  document.querySelectorAll('[data-kn-aria]').forEach(el => el.setAttribute('aria-label', knWord(el.dataset.knAria)));
  document.querySelectorAll('[data-kn-title]').forEach(el => { el.title = knWord(el.dataset.knTitle); });
  // (round 26 review) one key, named for the language it switches to (its words: kn_lang_to), no pressed state
  const lb = knId('kn-lang');
  if (lb) { const to = knLang === 'de' ? 'en' : 'de'; lb.dataset.lang = to; lb.lang = to; }
  if (save) { try { localStorage.setItem('lang', knLang); } catch (e) { /* private mode */ } }
  for (const F of Object.values(KN)) { F.W.toasts = []; if (F.lazy) continue; knRender(F); if (F.part.sync) F.part.sync(F); }   // a toast in the old language goes
  knStepSync();
  knAskRender();
}

// ── the request ──
let knReady = false;      // the server can deliver a request into the team's CRM (GET /api/landing/status)
let knServer = false;     // what the status said, so a failed delivery can be sent again
let knAskState = 'form';  // form | busy | crm | mail | failed (the server did not take it: nothing was sent) | unsure (round 24: a timeout or a gateway error, it may have arrived)
let knAskSent = false;    // a request already arrived: a second one is named "Weitere Anfrage senden", never sent silently
function knAskRender() {
  const form = knId('kn-ask-form'), done = knId('kn-ask-done'), lead = knId('kn-c-d'), send = knId('kn-ask-send');
  if (!form) return;
  const sent = knAskState === 'crm' || knAskState === 'mail', failed = knAskState === 'failed' || knAskState === 'unsure';
  form.hidden = sent || failed;
  done.hidden = !sent && !failed;
  if (sent || failed) knId('kn-ask-done-t').textContent = knWord(knAskState === 'unsure' ? 'kn_done_unsure' : failed ? 'kn_done_fail' : knAskState === 'crm' ? 'kn_done_crm' : 'kn_done_mail').replace('{email}', knAskValues().email);
  // by mail, or after a failed delivery: no data lost. The request as text to copy, with the address, and the mail
  // app's link (opened only by the visitor); the form keeps what was typed
  knId('kn-ask-fallback').hidden = knAskState !== 'mail' && !failed;
  if (knAskState === 'mail' || failed) knId('kn-ask-text').value = knAskText(knAskValues());
  const fb = knId('kn-ask-fallback-t'), mail = knId('kn-ask-mail');
  fb.dataset.kn = knAskState === 'failed' ? 'kn_f_fallback_fail' : 'kn_f_fallback';   // (round 25) „Nochmal senden“ only where nothing was sent
  fb.textContent = knWord(fb.dataset.kn);
  mail.hidden = !failed && knAskState !== 'mail';
  knId('kn-ask-retry').hidden = knAskState !== 'failed' || !knServer;   // (round 25) a request that may have arrived is not sent again: it could arrive twice
  if (!mail.hidden) mail.href = knAskMailto(knAskValues());
  lead.dataset.kn = knReady ? 'kn_c_d' : 'kn_c_d_mail';
  lead.textContent = knWord(lead.dataset.kn);
  send.disabled = knAskState === 'busy';
  send.dataset.kn = knAskState === 'busy' ? 'kn_f_sending' : knAskSent ? 'kn_f_send_again' : knReady ? 'kn_request' : 'kn_f_send_mail';
  send.textContent = knWord(send.dataset.kn);
}
function knAskValues() {
  const f = knId('kn-ask-form');
  return { name: knClean(f.elements.name.value, 120), email: knClean(f.elements.email.value, 254), company: knClean(f.elements.company.value, 120), message: String(f.elements.message ? f.elements.message.value : '').trim().slice(0, 1000) };
}
// which field is wrong: a name of two characters at least, an address with a name, an @ and a domain
// an address: a name of 1 to 64 characters without a dot at either end or two in a row, an @, labels that are not empty, a
// top-level label of two characters at least
// (round 27) no lookbehind (Safari before 16.4 stops the whole script on one): the name's length by a lookahead, its last
// character not a dot
const KN_EMAIL = /^(?!\.)(?!.*\.\.)(?=[^\s@]{1,64}@)[^\s@]*[^\s@.]@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;
function knAskBad(v) { return { name: v.name.length < 2, email: !KN_EMAIL.test(v.email) }; }
function knAskOk(v) { const b = knAskBad(v); return !b.name && !b.email; }
function knAskBody(v) { return [`${knWord('kn_f_name')}: ${v.name}`, `${knWord('kn_f_email')}: ${v.email}`].concat(v.company ? [`${knWord('kn_mail_company')}: ${v.company}`] : []).join('\n') + (v.message ? `\n\n${knWord('kn_mail_message')}:\n${v.message}` : ''); }   // (round 15) the free text under its label
function knAskMailto(v) { return `mailto:team@upgrads.de?subject=${encodeURIComponent(knWord('kn_mail_subject'))}&body=${encodeURIComponent(knAskBody(v))}`; }
function knAskText(v) { return `${knWord('kn_mail_to')}: team@upgrads.de\n${knWord('kn_mail_subject_l')}: ${knWord('kn_mail_subject')}\n\n${knAskBody(v)}`; }
// each wrong field marked (aria-invalid) with its own message under it; the first one takes focus
function knAskMark(bad) {
  for (const k of ['name', 'email']) {
    const input = knId(`kn-ask-${k}`), err = knId(`kn-ask-${k}-err`);
    if (bad[k]) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    err.hidden = !bad[k];
  }
}
async function knAsk(e) {
  e.preventDefault();
  if (knAskState === 'busy') return;
  const v = knAskValues(), bad = knAskBad(v);
  knAskMark(bad);
  if (bad.name || bad.email) { knId(bad.name ? 'kn-ask-name' : 'kn-ask-email').focus(); return; }
  knAskState = 'busy';
  knAskRender();
  let ok = false, unsure = false;
  const tried = knReady;
  if (knReady) {
    // (round 24) a request that times out (15 s), loses its answer while online, or meets a gateway error (502, 504)
    // may still have reached the CRM: the page says so and does not claim nothing was sent; offline, or the server's own
    // answer (a 503 not_configured, a 4xx), nothing was sent
    const ac = typeof AbortController === 'function' ? new AbortController() : null, cut = ac ? setTimeout(() => ac.abort(), 15000) : 0;
    try {
      const r = await fetch('/api/landing/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, lang: knLang, website: knId('kn-website').value }), signal: ac ? ac.signal : undefined });
      ok = r.ok;
      unsure = !ok && [502, 504].includes(r.status);   // (round 24 review) a 503 is the server's „not configured“: definite
    } catch (err2) { ok = false; unsure = navigator.onLine !== false; }   // a timeout or a dropped answer while online may have arrived; offline, nothing left
    finally { if (cut) clearTimeout(cut); }
  }
  // the server did not take it: say so, and from here on the request goes by mail (the line above the form says that too)
  if (tried && !ok) { knReady = false; knAskState = unsure ? 'unsure' : 'failed'; knAskRender(); knId('kn-ask-done').focus(); return; }
  // without the server the request goes by mail: the visitor's click ("Per Mail anfragen") opens the mail app with the
  // request filled in, and the text to copy shows beside it in case no mail app opens ("Noch nicht gesendet.")
  knAskState = ok ? 'crm' : 'mail';
  if (ok) knAskSent = true;
  knAskRender();
  if (!ok) knAskOpenMail();
  knId('kn-ask-done').focus();
}
// the prepared mail, opened by the same click that asked for it (no await before it, so the click still counts)
function knAskOpenMail() { const a = knId('kn-ask-mail'); if (a && a.href) a.click(); }
// the status's answer: into the team's CRM when the server can take it. The form says "Per Mail anfragen" until then.
// It switches whether the form is in view or not (a #kn-ask link, a reload that keeps the scroll), but never while the
// visitor is at work in it: a field typed in or focused, a request being sent. Then it stays by mail for this visit
function knAskApply(ready) {
  knServer = ready;
  knReady = ready && knAskState === 'form' && !(knAskSeen() && knAskTouched());
  knAskRender();
}
function knAskTouched() {
  const f = knId('kn-ask-form');
  if (!f) return false;
  if (f.contains(document.activeElement)) return true;
  return ['name', 'email', 'company', 'message'].some(k => f.elements[k] && String(f.elements[k].value || '').trim() !== '');
}
function knAskSeen() {
  const f = knId('kn-ask-form');
  if (!f) return false;
  if (f.contains(document.activeElement)) return true;
  const r = f.getBoundingClientRect();
  return r.bottom > 0 && r.top < (window.innerHeight || 0);
}
// a marked field clears its mark once what is typed there is right
function knAskInput(e) {
  const k = e.target.name;
  if ((k !== 'name' && k !== 'email') || e.target.getAttribute('aria-invalid') !== 'true') return;
  if (!knAskBad(knAskValues())[k]) { e.target.removeAttribute('aria-invalid'); knId(`kn-ask-${k}-err`).hidden = true; }
}
// the copy: the clipboard where the browser allows it, else the text selected for Ctrl C
function knAskCopy() {
  const ta = knId('kn-ask-text'), btn = knId('kn-ask-copy');
  const said = () => { btn.textContent = knWord('kn_f_copied'); setTimeout(() => { btn.textContent = knWord('kn_f_copy'); }, 2000); };
  ta.select();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(said, () => {});
  else said();
}
// back to the form, with everything still in it
function knAskEdit() { knAskState = 'form'; knAskRender(); knId('kn-ask-name').focus(); }

// ── the start ──
// a part's "Von vorn" button beside its frame
function knResetButton(id, name, fn) { const b = knId(id); if (b) b.addEventListener('click', () => { if (KN[name]) knReset(KN[name]); if (fn) fn(); }); }
// (round 13) a part's "Von vorn" shows once the visitor has done something in the part, and goes again with the reset:
// on arrival no part offers one
function knIdle(name, on) { const r = knId(`kn-${name}-reset`); if (r) r.classList.toggle('kn-idle', on); }
function knIdleWire() {
  for (const P of KN_PARTS) {
    const host = knId(`kn-${P.name}`), r = knId(`kn-${P.name}-reset`);
    if (!host || !r) continue;
    knIdle(P.name, true);
    const wake = e => { if (!r.contains(e.target)) knIdle(P.name, false); };
    for (const type of ['click', 'input', 'change', 'pointerup']) host.addEventListener(type, wake);
    host.addEventListener('keydown', e => { if (/^(Enter| |Arrow|Home|End)/.test(e.key)) wake(e); });
  }
}
function knWirePage() {
  knIdleWire();
  document.addEventListener('keydown', knDocKey);
  document.addEventListener('pointerdown', e => { for (const F of Object.values(KN)) if (F.W.menu && !F.root.contains(e.target)) knMenuClose(F); });
  document.querySelectorAll('.kn-lang-btn').forEach(b => b.addEventListener('click', () => knSetLang(b.dataset.lang, true)));
  for (const P of KN_PARTS) if (P.wire) P.wire();
  const ask = knId('kn-ask-form');
  if (ask) { ask.addEventListener('submit', knAsk); ask.addEventListener('input', knAskInput); }
  const copy = knId('kn-ask-copy'), edit = knId('kn-ask-edit');
  if (copy) copy.addEventListener('click', knAskCopy);
  const retry = knId('kn-ask-retry');
  if (retry) retry.addEventListener('click', () => { knReady = knServer; knAskState = 'form'; knAsk({ preventDefault() {} }); });   // "Nochmal senden": the same request, to the server again
  if (edit) edit.addEventListener('click', knAskEdit);
}
// ── (round 26) the stations: real sections, the browser's own scrolling (snap by proximity, no wheel, key or touch
// handler of the page's own); the one that fills most of the screen is current: its panel fades in (is-on, kept once
// shown), its dot is aria-current="step", and the header's paper gradient comes in once the hero is half gone ──
function knStations() {
  const st = [...document.querySelectorAll('.kn-st')], dots = [...document.querySelectorAll('.kn-dot')];
  const dotOf = sec => dots.find(d => d.getAttribute('href') === `#${sec.id}`);
  const seen = new Map(st.map(s => [s, 0]));
  const mark = cur => {
    for (const d of dots) d.removeAttribute('aria-current');
    if (!cur) return;
    cur.classList.add('is-on');
    const d = dotOf(cur);
    if (d) d.setAttribute('aria-current', 'step');
  };
  const pick = () => { let best = null, r = 0; for (const [s, v] of seen) if (v > r) { r = v; best = s; } mark(best); };
  if (KN_STILL || !('IntersectionObserver' in window)) st.forEach(s => s.classList.add('is-on'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (seen.has(e.target)) seen.set(e.target, !e.isIntersecting ? 0 : e.intersectionRect && e.boundingClientRect ? e.intersectionRect.height / Math.max(1, Math.min(window.innerHeight, e.boundingClientRect.height)) : 1);
      pick();
    }, { threshold: [0, .15, .3, .45, .6, .75, .9, 1] });
    st.forEach(s => io.observe(s));
  } else mark(st[0]);
  // a dot moves the page to its station (the link's own jump without the script); focus stays on the dot, as theirs
  for (const d of dots) d.addEventListener('click', e => {
    const sec = knId(d.getAttribute('href').slice(1));
    if (!sec) return;
    e.preventDefault();
    sec.scrollIntoView({ behavior: KN_STILL ? 'auto' : 'smooth', block: 'start' });
  });
  const nav = () => document.documentElement.style.setProperty('--kn-navbg', window.scrollY > window.innerHeight * .5 ? '1' : '0');
  window.addEventListener('scroll', nav, { passive: true });
  nav();
}
// ── (round 26) the Upgrads mark (#kn-wm, fitted to public/images/logo.png in scratchpad/r26): drawn stroke by stroke
// once on load (the page's one moment that plays by itself: the arrow first, like their first letter, then U P G A D S,
// the pen at the tip), large in the hero, then docked over the header's brand link as the hero scrolls away: position
// linear, scale in log space. Reduced motion: docked and drawn, at once ──
const KN_MARK = { x: 54, y: 8, w: 884, h: 264, cap: 170 };   // its viewBox, and the cap band's centre (logo units)
const knEase = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);   // power1.inOut's feel, without a library
function knMark() {
  const wm = knId('kn-wm'), box = document.querySelector('.kn-brand-mark'), pen = knId('kn-pen');
  if (!wm || !box) return;
  const M = KN_MARK, strokes = [...wm.querySelectorAll('.kn-wm-s')], head = wm.querySelector('.kn-wm-head');
  const big = !KN_STILL;
  document.documentElement.classList.toggle('kn-big', big);
  let poses = null;
  const measure = () => {
    const r = box.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, port = W / Math.max(1, H) < .9;
    const sd = (r.width || 150) / M.w, docked = { s: sd, x: r.left - 0 * sd, y: r.top };
    // (round 26 review) the large pose fills the band between the header and the hero's card (its top at
    // max(40svh, 290px)), so the claim and the request stay above a 657 px window
    const card = document.querySelector('.kn-hero-card'), top = card ? card.getBoundingClientRect().top + window.scrollY : H * .37;
    const nav = port ? 64 : 72, band = Math.max(80, (top > nav ? top : Math.max(H * .37, 280)) - nav - 24);
    const wide = Math.min((port ? .86 : .66) * W, band * M.w / M.h), sb = wide / M.w;
    poses = { big: { s: sb, x: W / 2 - (M.w / 2) * sb, y: nav + 12 + (band - M.h * sb) / 2 }, docked };
  };
  const lerp = (a, b, u) => a + (b - a) * u;
  const place = () => {
    if (!poses) measure();
    const u = big ? Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * .6))) : 1, A = poses.big, B = poses.docked;
    const p = { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), u)) };
    wm.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.s})`;
    wm.dataset.pose = u >= 1 ? 'docked' : u <= 0 ? 'big' : 'between';
    knMarkPose = p;
  };
  let raf = 0;
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); }, { passive: true });
  window.addEventListener('resize', () => { poses = null; place(); });
  place();
  // the drawing: each stroke from dashoffset 1 to 0, at opacity 0 until it begins (a round cap would show a dot)
  const plan = [{ el: strokes[0], at: .4, len: 1.1 }].concat(strokes.slice(1).map((el, i) => ({ el, at: .9 + i * .28, len: .5 })));
  const draw = t => {
    let tip = null;
    for (const p of plan) {
      const k = Math.max(0, Math.min(1, (t - p.at) / p.len)), e = knEase(k);
      p.el.style.strokeDashoffset = String(1 - e);
      p.el.style.opacity = e > 0 ? '1' : '0';
      if (k > 0 && k < 1 && p.el.getTotalLength) { const L = p.el.getTotalLength(), q = p.el.getPointAtLength(e * L); tip = q; }
      if (p === plan[0] && head) head.style.opacity = String(Math.max(0, Math.min(1, (k - .72) / .28)));
    }
    if (pen) {
      if (tip && knMarkPose) { const P = knMarkPose; pen.style.opacity = '1'; pen.style.transform = `translate3d(${P.x + (tip.x - M.x) * P.s - 4}px, ${P.y + (tip.y - M.y) * P.s - 4}px, 0)`; }
      else pen.style.opacity = '0';
    }
  };
  const end = plan.reduce((m, p) => Math.max(m, p.at + p.len), 0);
  wm.dataset.drawn = '0';
  if (!big || !window.requestAnimationFrame) { draw(end); wm.dataset.drawn = '1'; return; }
  draw(0);
  const t0 = performance.now();
  const step = now => { const t = (now - t0) / 1000; draw(t); if (t < end) requestAnimationFrame(step); else { draw(end); wm.dataset.drawn = '1'; } };
  requestAnimationFrame(step);
}
let knMarkPose = null;
async function knInit() {
  // the status asked first and applied the moment it answers (not after the parts are drawn)
  const status = fetch('/api/landing/status').then(r => r.ok && r.json()).then(j => !!j && j.ready === true, () => false);
  status.then(knAskApply);
  KN_STILL = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let lang = 'de';
  try { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'de') lang = l; } catch (e) { /* private mode */ }
  knLang = lang;
  currentLang = lang;
  // part 1 (on the first screen) is drawn at once; the others when they come near (knLazy)
  KN_PARTS.forEach((P, i) => knMount(P, i > 0));
  knWirePage();
  knSetLang(lang, false);
  document.documentElement.classList.add('kn-js');   // (round 26) the stations' fades and the drawn mark exist only now
  knStations();
  knMark();
  knLazy();
  await status;
}
// (round 25) every way into a frame from outside its own events runs on that frame's clock: what one part's action
// paints in another (a jump, a follow, a language switch) reads the time of the part it paints
knPaint = knOnClock(knPaint); knPaintApp = knOnClock(knPaintApp); knPaintPage = knOnClock(knPaintPage); knPaintBell = knOnClock(knPaintBell);
knRender = knOnClock(knRender); knGo = knOnClock(knGo); knWake = knOnClock(knWake); knReset = knOnClock(knReset);
knClick = knOnClock(knClick); knChange = knOnClock(knChange); knInput = knOnClock(knInput); knKey = knOnClock(knKey); knPointerDown = knOnClock(knPointerDown);
knBookOpen = knOnClock(knBookOpen); knBookPaint = knOnClock(knBookPaint); knRecPaint = knOnClock(knRecPaint); knCtOpen = knOnClock(knCtOpen);
knOnbReload = knOnClock(knOnbReload); knBoardMove = knOnClock(knBoardMove);

/* ═══ flows: the Deals board, its kebab and its drag, the Deals list, the deal dialog (deals.js, detail-views.js openDealForm) ═══ */
// Owner: part 1 (anfrage). Part 5 (abschluss) shows the board too and reads these.

function knDealsO(F) {
  const W = F.W, U = W.dealsUI;
  return { p: F.p, pipelines: KN_PIPES, pipelineId: 1, deals: W.deals.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(d => knDealRow(W, d)),
    members: KN_MEMBERS, currentUser: KN_ME, dealFields: [], summary: U.summary, q: U.q, owner: U.owner, urgency: U.urgency, stage: U.stage, cf: U.cf, busy: W.busy > 0 };
}
// deals.js moveDealToStage: the card moves at once, the board is busy until the PATCH answers, then the toast with Rückgängig
function knBoardMove(F, id, stageId, undo) {
  const W = F.W, d = knDeal(W, id);
  if (!d || d.stage_id === stageId) return;
  const prev = d.stage_id;
  knSetStage(W, d, stageId);
  W.busy++;
  if (knShows(F, 'deals')) knPaintPage(F);
  knLater(F, 320, () => {
    W.busy = Math.max(0, W.busy - 1);
    const b = knId(`${F.p}-deals-board`);
    if (b && !W.busy) b.removeAttribute('aria-busy');
    if (!undo) knToast(F, tf('moved_to', { s: knL(knStage(stageId).name) || '' }), t('undo'), () => knBoardMove(F, id, prev, true));
    if (F.part.moved) F.part.moved(F, id, stageId, prev, !!undo);
  });
}
function knDealsClick(F, el) {
  const W = F.W, U = W.dealsUI;
  if (U.view === 'list' && knListClick(F, el)) return;
  const kebab = el.closest('[data-kr="kebab"]');
  if (kebab) {
    const id = Number((kebab.closest('.dcard') || {}).dataset?.id || kebab.dataset.kebab), row = knL(knDealRow(W, knDeal(W, id)));
    return knMenuOpen(F, kebab, krDealKebabItems({ deal: row, stages: knL(KN_STAGES) }), it => {
      if (it.act === 'open') knRecOpen(F, id);
      else if (it.act === 'move') knBoardMove(F, id, it.stageId);
      else if (it.act === 'urgency') knMenuOpen(F, kebab, krDealUrgencyItems(row), u => { knDeal(W, id).urgency = u.value; knPaintPage(F); });
      else if (it.act === 'delete') knConfirmOpen(F, { kind: 'delete', id, back: kebab });
    }, 'right');
  }
  const card = el.closest('.dcard[data-id]');
  if (card) return knRecOpen(F, Number(card.dataset.id));
  const jump = el.closest('[data-jump]');
  if (jump && U.view === 'list') { Object.assign(U, krFmListJump(knListO(F), Number(jump.dataset.jump))); return knPaintPage(F); }
  if (jump) { const col = knQ(F, `section.col-board[data-stage="${jump.dataset.jump}"]`), board = knId(`${F.p}-deals-board`); if (col && board) board.scrollLeft = col.offsetLeft - (board.clientWidth - col.offsetWidth) / 2; return; }
  const chip = el.closest('[data-chip]');
  if (chip) { const key = chip.dataset.chip; return knMenuOpen(F, chip, krDealsChipItems(knL(knDealsO(F)), key), it => { U[key] = it.value; knPaintPage(F); }); }
  const k = (el.closest('[data-kr]') || {}).dataset?.kr;
  if (k === 'add-deal') return knDfOpen(F, {});
  const add = el.closest('[data-add]');
  if (add) return knDfOpen(F, { pipelineId: 1, stageId: Number(add.dataset.add) });
  if (k === 'view-list' || k === 'view-board') { const v = k === 'view-list' ? 'list' : 'board'; if (U.view !== v) { U.view = v; U.sel = []; knPaintPage(F); } return; }
  if (k === 'clear-filters') { Object.assign(U, { q: '', owner: null, urgency: null, stage: null, cf: {} }); knPaintPage(F); }
  else if (k === 'toggle-summary') { U.summary = !U.summary; knPaintPage(F); }
  else if (k === 'more') knMenuOpen(F, el.closest('[data-kr]'), krDealsMoreItems().map(it => ({ ...it, inert: true })), () => {}, 'right');   // export and the pipelines' settings are left out
}
function knDealsInput(F, el) {
  if (el.dataset.kr !== 'search') return;
  F.W.dealsUI.q = el.value;
  clearTimeout(F.qT);
  const id = el.id;
  F.qT = setTimeout(() => { knPaintPage(F); const q = knId(id); if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); } }, 120);
}
function knDealsKey(F, e) {
  const el = e.target;
  if (el.classList.contains('dcard') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); knRecOpen(F, Number(el.dataset.id)); }
}

// ── the drag: the picture the browser draws under a dragged card, the column under the pointer, the edge scroll ──
function knDragDown(F, e) {
  const card = e.target.closest('.dcard[data-id]');
  if (!card || knLayerOf(card) !== 'app' || e.button !== 0 || e.pointerType === 'touch' || e.target.closest('[data-kr="kebab"]')) return;
  F.drag = { id: Number(card.dataset.id), card, x0: e.clientX, y0: e.clientY, pid: e.pointerId, on: false, col: null };
}
function knDragMove(F, e) {
  const D = F.drag;
  if (!D) return;
  const s = F.s || 1, fr = F.root.getBoundingClientRect();
  if (!D.on) {
    if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 6) return;
    D.on = true;
    const cr = D.card.getBoundingClientRect(), g = D.card.cloneNode(true);
    g.classList.add('kn-ghost');
    g.removeAttribute('data-id');
    g.style.width = `${D.card.offsetWidth}px`;
    D.dx = (e.clientX - cr.left) / s; D.dy = (e.clientY - cr.top) / s; D.g = g;
    F.root.appendChild(g);
    setTimeout(() => D.card.classList.add('dragging'), 0);
    try { F.root.setPointerCapture(D.pid); } catch (err) { /* the pointer is gone */ }
  }
  D.g.style.left = `${(e.clientX - fr.left) / s - D.dx}px`;
  D.g.style.top = `${(e.clientY - fr.top) / s - D.dy}px`;
  const under = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
  const col = under && under.closest ? under.closest('section.col-board[data-stage]') : null;
  if (col !== D.col) { if (D.col) D.col.classList.remove('drop'); if (col) col.classList.add('drop'); D.col = col; }
  const board = knId(`${F.p}-deals-board`);
  if (board) { const br = board.getBoundingClientRect(); board.scrollLeft += krDealEdgeScrollDelta(e.clientX, br.left, br.right) / s; }
}
function knDragEnd(F, col) {
  const D = F.drag;
  F.drag = null;
  if (!D || !D.on) return;
  if (D.g) D.g.remove();
  D.card.classList.remove('dragging');
  F.root.querySelectorAll('.col-board.drop').forEach(c => c.classList.remove('drop'));
  F.noClick = true;
  setTimeout(() => { F.noClick = false; }, 0);
  if (col) knBoardMove(F, D.id, Number(col.dataset.stage));
}
KN_POINTER.push({ down: knDragDown, move: knDragMove, up: F => { if (F.drag && F.drag.on) knDragEnd(F, F.drag.col); else F.drag = null; }, cancel: F => knDragEnd(F, null) });

// ── the deal dialog ("Deal hinzufügen", a column's +): the 1 s save lock, the 10 s submit guard, the check, the POST ──
function knDfO(F) {
  const W = F.W, D = W.df;
  return { p: F.p + 'f', pipelines: KN_PIPES, currentPipelineId: 1, pipelineId: D.pipelineId ?? null, stageId: D.stageId ?? null, contactId: D.contactId ?? null, deal: null,
    contacts: krCtFromApi(W.contacts.map(c => knCtRow(W, c))), suppliers: [], members: KN_MEMBERS, currentUser: KN_ME, dealFields: [], workspace: { supplier_name: W.supplierName },
    values: D.values, err: D.err, locked: D.locked, submitting: D.submitting, dealsPageActive: knShows(F, 'deals') };
}
function knDfOpen(F, opts) {
  const W = F.W;
  knMenuClose(F);
  W.cf = null;
  W.df = { pipelineId: opts.pipelineId ?? null, stageId: opts.stageId ?? null, contactId: opts.contactId ?? null, values: {}, err: {}, locked: false, submitting: false };
  knPaint(F, 'form');
  knFocus(F, `#${F.p}f-df-title`);
}
function knDfClose(F) { F.W.df = null; knPaint(F, 'form'); }
function knDfSubmit(F) {
  const W = F.W, D = W.df;
  if (!D || D.locked || D.submitting) return;
  const r = krFmDealSubmit(knDfO(F));
  Object.assign(D, { locked: true, submitting: true });
  knLater(F, 1000, () => { if (W.df === D) { D.locked = false; knDfFoot(F); } });
  knLater(F, 10000, () => { if (W.df === D) { D.submitting = false; knDfFoot(F); } });
  if (!r.request) { D.err = r.err; knPaint(F, 'form'); return knFocus(F, `#${F.p}f-df-${r.focus || 'title'}`); }
  D.err = {};
  const at = knNow(), res = { id: ++W.seq }, row = krFmDealRow(knDfO(F), r.request.body, res, at), d = krFmDealSaved(knDfO(F), res);
  W.deals.push({ id: row.id, title: row.title, contact_id: row.contact_id, value: row.value, urgency: row.urgency, stage_id: row.stage_id, assigned_to: row.assigned_to, created_at: at, updated_at: at });
  W.df = null;
  knPaint(F, 'form');
  if (d.reloadDeals && knShows(F, 'deals')) knPaintPage(F);
  knToast(F, d.toast.text, d.toast.action, d.toast.openDeal ? () => knRecOpen(F, d.toast.openDeal) : null);
}
function knDfFoot(F) { const foot = F.layers.form.querySelector('.modal-foot'); if (foot && F.W.df) foot.innerHTML = krFmDealFormFooter(knL(knDfO(F))); }
// typed values stay as strings, the way the form reports them; a pipeline change refills only the stage options
function knDfInput(F, el) {
  const D = F.W.df, name = el.getAttribute('name'), cf = el.dataset.cf;
  if (cf) { D.values.cf = { ...(D.values.cf || {}), [cf]: el.value }; return; }
  if (!name) return;
  D.values[name] = el.value;
  if (name === 'pipeline') { delete D.values.stage; const st = knId(`${F.p}f-df-stage`); if (st) st.innerHTML = krFmDealStageOptions(knL(knDfO(F))); }
  if ((name === 'title' || name === 'value') && D.err[name]) {
    delete D.err[name];
    el.removeAttribute('aria-invalid');
    const line = knId(`${F.p}f-df-${name}-err`);
    if (line) line.textContent = '';
  }
}
knLayerMod('form', { on: F => !!F.W.df, paint: F => krFmDealForm(knL(knDfO(F))), click: (F, el) => { if (el.closest('[data-close]')) knDfClose(F); },
  change: knDfInput, input: knDfInput, esc: F => { knDfClose(F); return true; }, scrim: knDfClose });
knSubmit('f-df', knDfSubmit);

// ── the Deals list (deals.js renderDealsList): sort, columns, select, the bulk bar ──
function knListO(F) {
  const U = F.W.dealsUI;
  return { ...knDealsO(F), p: F.p, sort: U.sort, sel: U.sel, dealColumns: U.dealColumns };
}
function knListParts(F) {
  const parts = krFmDealsListParts(knL(knListO(F))), p = F.p;
  for (const [id, html] of [['deals-bulkbar', parts.bulkbar], ['deals-thead', parts.thead], ['deals-tbody', parts.tbody], ['deals-list-foot', parts.foot]]) { const el = knId(`${p}-${id}`); if (el) el.innerHTML = html; }
}
// true when the click was the list's
function knListClick(F, el) {
  const W = F.W, U = W.dealsUI, o = knListO(F), h = el.closest('[data-kr]'), k = h ? h.dataset.kr : '';
  if (k === 'sort') { Object.assign(U, krFmSortDealsBy(o, h.dataset.sort)); knListParts(F); return true; }
  if (k === 'columns') { knMenuOpen(F, h, knL(krFmDealsColumnsItems(o)), it => { Object.assign(U, krFmToggleDealColumn(knListO(F), it.i)); knListParts(F); }, 'right'); return true; }
  if (k === 'bulk') {
    const arg = h.dataset.krArg;
    if (arg === 'clear') { U.sel = []; knListParts(F); return true; }
    if (arg === 'stage') {
      knMenuOpen(F, h, knL(krFmBulkStageItems(o)), it => {
        const r = krFmBulkMove(knListO(F), it.pipelineId, it.stageId);
        for (const row of r.deals || []) { const d = knDeal(W, row.id); if (d && d.stage_id !== row.stage_id) knSetStage(W, d, row.stage_id); }
        if (r.sel) U.sel = r.sel;
        knPaintPage(F);
        if (r.toast) knToast(F, r.toast.text, r.toast.action);
      });
      return true;
    }
    if (arg === 'delete') { knConfirmOpen(F, { kind: 'bulk-delete', ids: U.sel.slice(), back: h }); return true; }
  }
  if (el.closest('[data-kr="kebab"], .check')) return false;
  const row = el.closest('tr[data-kr="open-deal"]');
  if (row) { knRecOpen(F, Number(row.dataset.krId)); return true; }
  return false;
}
function knListChange(F, el) {
  const U = F.W.dealsUI, o = knListO(F);
  if (el.dataset.kr === 'select-all') { Object.assign(U, krFmToggleAllDeals(o, el.checked)); knListParts(F); return true; }
  if (el.dataset.kr === 'select-row') { Object.assign(U, krFmToggleDealSelected(o, Number(el.dataset.row), el.checked)); knListParts(F); return true; }
  return false;
}

// ── its confirms: one deal (the kebab's Löschen), several (the list's bulk bar) ──
KN_CONFIRM.delete = {
  html: F => krConfirm({ p: F.p + 'c', title: t('delete_deal_q'), message: t('delete_deal_msg'), confirmLabel: t('btn_delete'), danger: true }),
  done(F, C) {
    const W = F.W;
    W.deals = W.deals.filter(d => d.id !== C.id);
    if (W.record && W.record.id === C.id && !(F.part.keep || []).includes('record')) { W.record = null; knPaint(F, 'record'); }
    if (knShows(F, 'deals')) knPaintPage(F);
    knToast(F, t('deal_deleted'));
  },
};
KN_CONFIRM['bulk-delete'] = {
  html: (F, C) => krConfirm({ p: F.p + 'c', ...krFmDealsDeleteConfirm(C.ids) }),
  done(F, C) {
    const W = F.W, r = krFmDealsDeleted(knListO(F), C.ids);
    W.deals = W.deals.filter(d => !C.ids.includes(d.id));
    W.dealsUI.sel = r.sel;
    if (knShows(F, 'deals')) knPaintPage(F);
    knToast(F, r.toast.text, r.toast.action);
  },
};

knMod('deals', {
  screen: F => (F.W.dealsUI.view === 'list' ? krFmDealsListPage(knL(knListO(F))) : krDealsPage(knL(knDealsO(F)))),
  click: knDealsClick,
  change: (F, el) => { if (F.W.dealsUI.view === 'list') knListChange(F, el); },
  input: knDealsInput,
  key: knDealsKey,
});

/* ═══ flows: Letzte Leads (integrations.js loadIntgLogs, the Integrations page's activity card) ═══════════════ */
// Owner: part 1 (anfrage).

// Aktualisieren loads the list again: what arrived since shows on top, ringed
function knIntgRefresh(F) {
  const W = F.W, before = new Set((W.logsShown || []).map(l => l.id));
  W.logsShown = W.logs.slice();
  knPaintPage(F);
  const list = knId(`${F.p}-intg-logs`);
  W.logsShown.forEach((l, i) => { if (!before.has(l.id) && list) knFlash(F, list.children[i]); });
}
function knIntgClick(F, el) {
  const h = el.closest('[data-kr]');
  if (!h) return;
  const k = h.dataset.kr, arg = h.dataset.krArg;
  if (k === 'intg-logs-refresh') return knIntgRefresh(F);
  // integrations.js:533 "Rohdaten anzeigen": the entry's raw payload, shown and hidden in place
  if (k === 'intg-raw-toggle') { const raw = h.nextElementSibling; if (raw) raw.classList.toggle('hidden'); return; }
  if (k === 'intg-tab' && arg !== 'activity') knOff(F);
}
knMod('integrations', { screen: F => krIntegrationsPage(knL({ p: F.p, logs: F.W.logsShown || [] })), click: knIntgClick });

/* ═══ flows: the deal record (detail-views.js openDealDetail) and the bell's panel (notifications.js) ══════════ */
// Owner: the record agent (parts 2–4). The record is the record layer; a part whose piece it is lists 'record' in keep.
// What the preview leaves out says so (knOff): the "…" menu, linking a contact or supplier, objects, tasks, the full
// form, editing or deleting an entry, moving or cancelling a meeting, opening a Meet link.

const KN_REC_OFF = ['more', 'contact-menu', 'supplier-menu', 'object-add', 'object-rm', 'open-object', 'open-task', 'edit-full', 'task-add', 'task-cancel', 'goto-task',
  'act-edit', 'act-resched', 'act-meeting-cancel', 'act-del'];
// the record's controls left out are inert (the knOff below stays for what a keyboard could still reach)
KN_INERT.push(...KN_REC_OFF.map(a => `[data-kn-layer="record"] [data-act="${a}"]`), '[data-kn-layer="record"] [data-toggle]');
// A spot inside the record or a dialog brought into view by scrolling the box it scrolls in (its .modal-body), never
// the page: where 'start' puts its top near the box's top, else it moves only as far as needed. smooth: an answer to a
// click (and only with motion allowed); without it the jump is instant (a first paint, a language switch).
function knRecReveal(F, el, where, smooth) {
  const box = el && el.closest('.modal-body');
  if (!box) return;
  const s = F.s || 1, b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  const top = (r.top - b.top) / s + box.scrollTop, h = r.height / s, view = box.clientHeight;
  let to = box.scrollTop;
  if (where === 'start' || top < box.scrollTop) to = top - 16;
  else if (top + h > box.scrollTop + view) to = Math.min(top - 16, top + h - view + 16);
  box.style.scrollBehavior = smooth && !KN_STILL ? 'smooth' : 'auto';
  box.scrollTop = Math.max(0, to);
}
// the entry that just arrived on the timeline: it drops in (motion allowed) and is ringed
function knRecArrived(F, id, where) {
  const el = knQ(F, `[data-kn-layer="record"] .tl-item[data-aid="${id}"]`);
  if (!el) return null;
  el.classList.add('kn-new');
  knRecReveal(F, el, where, true);
  knFlash(F, el);
  return el;
}
// R.stale: entries that arrived after the record was opened; they show when it is opened again (no live update)
function knRecO(F) {
  const W = F.W, R = W.record, d = knDealRow(W, knDeal(W, R.id));
  return knL({ p: F.p + 'r', deal: d, contacts: W.contacts, suppliers: [], pipelines: KN_PIPES, activities: krRecActivitiesFor(knActRows(W).filter(a => !(R.stale && R.stale.includes(a.id))), d, R.only), tasks: knTaskRows(W),
    me: KN_ME, members: KN_MEMBERS, workspace: null, calcom: KN_CALCOM, tab: R.tab, compose: R.compose, thisDealOnly: R.only, filter: R.filter, edit: null, addTask: false });
}
// Jonas Becker's deal on the day of his intro call (parts 3 and 4): yesterday's call back, the meeting booked with
// Notetaker right after it, for half an hour ago
// (round 24) one story with step 2: on Tag 1 the enquiry at -120 min, the call back at -60, his own booking through
// the Cal.com link at -50 (an Erstgespräch, no Notetaker), the rep's Beratung booked from the deal with Notetaker at
// -40. (round 25) On step 3's clock, the meeting day: his Erstgespräch at 09:30 and the Beratung at 14:00 are over
function knRecMet(W) {
  knJonas(W, 12);
  const start = KN_NOTIZ_AT();
  const own = knMeetingAdd(W, 120, knJonasOwnAt(W), KN_MEET_SELF, false, knT1(W, 50));   // (round 24 review) the same time as step 2's
  Object.assign(own, { deal_id: null, bound_deal_id: null, created_by: KN_CAL.host_user_id, kn_seed: true });
  return knMeetingAdd(W, 120, start, true, true, knT1(W, 40), KN_CAL.event_types[1]);
}
// a deal opens where its part shows deals; anywhere else it leads there (knRouteDeal)
function knRecOpen(F, id) {
  if (!knDeal(F.W, id)) return;
  if (!F.part.deal) return knRouteDeal(F, id);
  knMenuClose(F);
  if (F.part.showDeal) return F.part.showDeal(F, id);
  F.W.record = knRecState(id);
  knPaint(F, 'record');
  knFocus(F, '[data-kn-layer="record"] .modal-head [data-close]');
}
// a part whose piece is the record keeps it open
function knRecClose(F) { if ((F.part.keep || []).includes('record')) return; F.W.record = null; knPaint(F, 'record'); }
function knRecPaint(F, parts) {
  if (!F.W.record) return;
  const o = knRecO(F);
  for (const part of parts) { const el = knId(`${F.p}r-dd-${part}`); if (el) el.innerHTML = krDealRecordPart(o, part); }
  const title = F.layers.record.querySelector('.modal-title');   // render() (detail-views.js:723): the window's title follows
  if (title) title.textContent = knL(knDeal(F.W, F.W.record.id).title);
  knFit(F);
}
function knRecStage(F, stageId) {
  const W = F.W, r = krRecMove(knRecO(F), stageId);
  if (!r) return;
  const d = knDeal(W, W.record.id), prev = d.stage_id;
  knSetStage(W, d, stageId);
  knRecPaint(F, ['top', 'head', 'main', 'side']);
  if (knShows(F, 'deals')) knPaintPage(F);   // dvRefreshDeals: the board behind the record follows
  if (F.part.staged) F.part.staged(F, d.id, stageId, prev);
  knLater(F, 260, () => knToast(F, r.toast, r.action, () => { if (F.W.record && F.W.record.id === d.id) knRecStage(F, prev); else { knSetStage(W, d, prev); } }));
}
function knRecSubmit(F) {
  const R = F.W.record;
  if (!R) return;
  const r = krRecSubmit(knRecO(F), ++F.W.seq);
  if (!r) return;
  const ta = `#${F.p}r-dd-compose-text`;
  if (r.error) { R.compose = { ...R.compose, err: true }; knRecPaint(F, ['main']); knFocus(F, ta); return; }
  F.W.acts.unshift({ ...r.entry, deal_title: null, contact_name: null, created_by: KN_ME.id, created_by_name: KN_ME.name });
  R.compose = { type: R.compose.type, text: '', err: false };
  knRecPaint(F, ['head', 'main']);
  knToast(F, r.toast);
  knFocus(F, ta);
  knRecArrived(F, r.entry.id);
}
// detail-views.js:524-533 commit: the change at once, the board follows, a toast with Rückgängig (which saves back, quietly)
function knRecCommit(F, patch, msg) {
  const W = F.W, d = W.record && knDeal(W, W.record.id);
  if (!d) return;
  const prev = {};
  Object.keys(patch).forEach(k => { prev[k] = d[k]; });
  Object.assign(d, patch);
  if (knShows(F, 'deals')) knPaintPage(F);
  knRecPaint(F, ['top', 'head', 'main', 'side']);
  if (F.part.committed) F.part.committed(F, patch, prev);
  if (msg) knToast(F, msg, t('undo'), () => knRecCommit(F, prev, null));
}
// detail-views.js:727-731 FIELDS: the title and the value edit in place (dvInlineEdit), each with its rule and toast
const KN_REC_FIELDS = {
  title: { label: () => t('lbl_deal_title'), size: 'title', type: 'text', get: d => d.title,
    parse: v => { v = v.trim(); return !v ? { error: t('dv_err_deal_title') } : v.length > 140 ? { error: t('dv_err_title_len') } : { v }; }, msg: () => t('dv_title_updated') },
  // the value compares as the API's numeric string (app finding C: the app saves an equal value again)
  value: { label: () => t('lbl_deal_value'), size: 'kpi', type: 'number', get: d => (d.value == null ? '' : d.value),
    parse: v => { if (String(v).trim() === '') return { v: null }; const n = Number(v); return !isFinite(n) || n < 0 ? { error: t('dv_err_value_min') } : { v: String(Math.round(n * 100) / 100) }; }, msg: () => t('dv_value_updated') },
};
// detail-views.js:137-152 dvInlineEdit: an input in place of the field; Enter or leaving it saves, Esc keeps; a refused
// value shows its message under the input (leaving it then drops the edit, as the app does)
function knRecInlineEdit(F, btn, key) {
  const W = F.W, d = knDeal(W, W.record.id), f = KN_REC_FIELDS[key];
  const wrap = document.createElement('span'); wrap.className = 'dd-ie-edit dd-w-' + f.size;
  const input = document.createElement('input'); input.className = 'input'; input.type = f.type; input.value = f.get(d) == null ? '' : knL(f.get(d)); input.setAttribute('aria-label', f.label()); input.autocomplete = 'off';
  if (f.type === 'number') { input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; }
  const err = document.createElement('span'); err.className = 'error-text'; err.setAttribute('role', 'alert');
  wrap.appendChild(input); wrap.appendChild(err); btn.replaceWith(wrap);
  input.focus({ preventScroll: true }); input.select();
  let done = false;
  const finish = (save, viaBlur) => {
    if (done) return;
    if (save) {
      const r = f.parse(input.value);
      if (r.error) { if (viaBlur) { done = true; return knRecPaint(F, ['top', 'head']); } err.textContent = r.error; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      done = true;
      if (r.v === (f.get(d) === '' ? null : f.get(d)) || (key === 'title' && r.v === knL(d.title))) return knRecPaint(F, ['top', 'head']);
      return knRecCommit(F, { [key]: r.v }, f.msg());
    }
    done = true; knRecPaint(F, ['top', 'head']);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
  input.addEventListener('blur', () => setTimeout(() => finish(true, true), 0));
  input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
  return input;
}
const knRecValueEdit = (F, btn) => knRecInlineEdit(F, btn, 'value');
// detail-views.js:734-738: the urgency as ui.select; the pick applies at once (PATCH /urgency) with "Dringlichkeit
// aktualisiert", no Rückgängig
function knRecUrgency(F, btn) {
  const W = F.W, d = knDeal(W, W.record.id), prev = d.urgency || 0;
  knMenuOpen(F, btn, krDealUrgencyItems(knL(knDealRow(W, d))), it => {
    if (it.value === prev) return;
    d.urgency = it.value;
    if (knShows(F, 'deals')) knPaintPage(F);
    knRecPaint(F, ['top', 'head', 'main', 'side']);
    if (F.part.committed) F.part.committed(F, { urgency: it.value }, { urgency: prev });
    knToast(F, t('dv_urgency_updated'));
  });
}
function knRecClick(F, el) {
  const W = F.W, R = W.record;
  if (el.closest('[data-close]')) return knRecClose(F);
  if (el.closest('.dv-join')) return knOff(F);   // the meeting link: a sample, it opens nothing
  const ie = el.closest('[data-ie]');
  if (ie && R) { const k = ie.dataset.ie; return KN_REC_FIELDS[k] ? knRecInlineEdit(F, ie, k) : k === 'urgency' ? knRecUrgency(F, ie) : knOff(F); }
  if (el.closest('[data-toggle]')) return knOff(F);
  // detail-views.js:844: a click on an entry's text opens its editor (not in the preview); one that ends a selection does nothing
  if (el.closest('[data-note]') && !el.closest('a')) { const sel = window.getSelection && window.getSelection(); return sel && String(sel) ? undefined : knOff(F); }
  const b = el.closest('[data-act]');
  if (!b || !R || b.disabled) return;
  const act = b.dataset.act, p = F.p + 'r';
  // detail-views.js:810 the owner's ui.select, :809 the stage's (it moves the deal as a step click does)
  if (act === 'owner') {
    const d = knDeal(W, R.id), opts = [{ value: null, label: t('unassigned') }, ...KN_MEMBERS.map(x => ({ value: x.id, label: x.name }))];
    return knMenuOpen(F, b, knSelectItems(opts, d.assigned_to ?? null, 'owner'), it => { if (it.value === (d.assigned_to ?? null)) return; knRecCommit(F, { assigned_to: it.value }, t('dv_owner_updated')); });
  }
  if (act === 'stage-menu') {
    const d = knDeal(W, R.id), opts = KN_STAGES.map(s => ({ value: s.id, label: knL(s.name) }));
    return knMenuOpen(F, b, knSelectItems(opts, d.stage_id, 'stage'), it => knRecStage(F, it.value));
  }
  if (act === 'open-contact') { knRecClose(F); return knCtOpen(F, Number(b.dataset.id)); }   // detail-views.js:824: the pop window closes, the contact opens
  if (KN_REC_OFF.includes(act)) return knOff(F);
  if (act === 'stage') return knRecStage(F, Number(b.dataset.stage));
  if (act === 'qa' || act === 'ctype') {
    R.compose = { ...R.compose, type: b.dataset.type, err: false };
    if (act === 'qa') R.tab = 'activity';
    knRecPaint(F, ['main']);
    return knFocus(F, act === 'qa' ? `#${p}-dd-compose-text` : `[data-act="ctype"][data-type="${b.dataset.type}"]`);
  }
  if (act === 'tab' || act === 'goto') { R.tab = b.dataset.tab; knRecPaint(F, ['main']); return knFocus(F, `#${p}-dd-main [data-act="tab"][data-tab="${R.tab}"]`); }
  if (act === 'tlonly') { R.only = !R.only; return knRecPaint(F, ['head', 'main']); }
  if (act === 'tlclear') { R.filter = null; return knRecPaint(F, ['main']); }
  if (act === 'tlfilter') {
    const opts = [{ value: null, label: t('dv_all_types') }, ...KR_REC_ACT_TYPES.map(x => ({ value: x.id, label: t(x.label), icon: x.icon }))];
    return knMenuOpen(F, b, knSelectItems(opts, R.filter, 'tlf'), it => { R.filter = it.value; knRecPaint(F, ['main']); });
  }
  if (act === 'book') return knBookOpen(F);
}
function knRecInput(F, el) {
  const R = F.W.record;
  if (!R || el.id !== `${F.p}r-dd-compose-text`) return;
  R.compose.text = el.value;
  if (R.compose.err) { R.compose.err = false; el.removeAttribute('aria-invalid'); const er = knId(`${F.p}r-dd-compose-err`); if (er) er.textContent = ''; }
}
function knRecKey(F, e) {
  if (F.W.record && e.target.id === `${F.p}r-dd-compose-text` && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); knRecSubmit(F); }
}
// The app's windows are aria-modal; on this page they are open in a frame from the start, and a screen reader would
// take everything else on the page for inert. So the frames' record and booking windows are plain dialogs.
function knNotModal(html) { return html.replace(' aria-modal="true"', ''); }
knLayerMod('record', { on: F => !!F.W.record, paint: F => knNotModal(krDealRecord(knRecO(F))), click: knRecClick, input: knRecInput, key: knRecKey,
  esc: F => { if ((F.part.keep || []).includes('record')) return false; knRecClose(F); return true; }, scrim: knRecClose });
knSubmit('r-dd-compose', knRecSubmit);

// ── the bell's panel (notifications.js): read all, clear, a row opens its deal ──
function knBellClick(F, el) {
  const W = F.W, h = el.closest('[data-kr]'), k = h ? h.dataset.kr : '';
  if (k === 'notif-toggle') { W.bell.open = !W.bell.open; return knPaintBell(F); }
  if (k === 'notif-read-all') { W.bell.items.forEach(n => { n.read = true; }); return knPaintBell(F); }
  if (k === 'notif-clear') { W.bell.items = W.bell.items.filter(n => !n.read); return knPaintBell(F); }
  if (k === 'notif-open') {
    const n = W.bell.items.find(x => x.id === Number(h.dataset.krId));
    if (!n) return;
    n.read = true;
    knPaintBell(F);
    if (F.part.notif) return F.part.notif(F, n);
    if (n.entity_type === 'deal') knRecOpen(F, n.entity_id);
  }
}
knMod('bell', { click: knBellClick });

/* ═══ flows: the Cal.com booking dialog (detail-views.js openCalcomBooking) ══════════════════════════════════ */
// Owner: the record agent (part 2). The dialog is the booking layer, opened from the record's "Termin buchen".
// The app, step by step (detail-views.js): the dialog opens on this month (:281) and loads its free times in one read
// (:362-370, GET /calcom/slots), the first free day preselected; the Notetaker box shows for a Google Meet place only and
// stays greyed out until the health check says it is there (:340, :353-361); a day click focuses the time (:399); a time
// is checked against the CRM calendar, the booker's and the host's timed entries counted as 30 minutes (:373-394); Buchen
// posts (:402-416, the one-second save lock of core.js:1376-1392), the server writes the entry at once
// (routes/integrations.js:937-1015), the dialog closes with the toast and the Notetaker's answer.

function knBookO(F) {
  const W = F.W, c = knContact(W, knDeal(W, W.record.id).contact_id);
  return knL({ p: F.p + 'b', contact: { name: c.name, email: c.email }, cal: KN_CAL, zone: KN_ZONE, todayIso: W.today, B: W.booking.B, reschedule: null, saveLocked: W.booking.locked });
}
function knBookLoaded(W) { const B = W.booking.B; B.loading = false; B.slots = W.slots; B.err = ''; B.date = krBookingFirstDay({ B, todayIso: W.today, cal: KN_CAL }); }
// the dialog is taller than a frame: what the app's focus would scroll to is brought into view inside it
function knBookReveal(F, sel, smooth) { const el = knQ(F, `[data-kn-layer="booking"] ${sel}`); if (el) knRecReveal(F, el.closest('.field, .cal-book-conflict') || el, 'nearest', smooth); }
// ready: open with the slots and the Notetaker check already in (a part that starts on the dialog)
// typeId: (round 20) the event type chosen before the first paint (the app's select, set as the rep would have it), so
// the dialog never shows one type and books another
function knBookOpen(F, ready, typeId) {
  const W = F.W;
  W.booking = { B: krBookingInitialState({ cal: KN_CAL, todayIso: W.today }), locked: false, run: 0 };
  const BK = W.booking, B = BK.B, p = F.p + 'b';
  if (typeId && KN_CAL.event_types.some(x => x.id === typeId)) B.typeId = typeId;
  if (ready) { knBookLoaded(W); B.nt = 'ok'; B.ntWhy = 'error'; knPaint(F, 'booking'); return knBookReveal(F, `#${p}-cal-book-time`); }
  if (krBookingWantsNotetakerCheck(knBookO(F))) B.nt = 'checking';
  knPaint(F, 'booking');
  knFocus(F, '[data-kn-layer="booking"] .modal-head [data-close]');
  knLater(F, 420, () => { if (W.booking !== BK) return; knBookLoaded(W); knBookPaint(F); knBookReveal(F, `#${p}-cal-book-time`, true); });
  if (B.nt === 'checking') knLater(F, 700, () => { if (W.booking !== BK) return; B.nt = 'ok'; B.ntWhy = 'error'; knBookPaint(F); });
}
function knBookPaint(F) {
  if (!F.W.booking) return;
  const o = knBookO(F), host = knId(`${F.p}b-cal-book`);
  if (!host) return knPaint(F, 'booking');
  host.innerHTML = krBookingBody(o);
  host.closest('.modal').querySelector('.modal-foot').innerHTML = krBookingFoot(o);
}
function knBookClose(F) { F.W.booking = null; knPaint(F, 'booking'); knFocus(F, `#${F.p}r-dd-root [data-act="book"]`); }
function knBookLoad(F) {
  const W = F.W, BK = W.booking, B = BK.B;
  Object.assign(B, { loading: true, date: '', picked: null, conflicts: [] });
  knBookPaint(F);
  knLater(F, 360, () => { if (W.booking !== BK) return; knBookLoaded(W); knBookPaint(F); });
}
// a picked time is checked against the CRM calendar (both people's entries), the newest pick deciding
function knBookTime(F, v) {
  const W = F.W, BK = W.booking, B = BK.B;
  Object.assign(B, { picked: v || null, conflicts: [], err: '' });
  if (!B.picked) return knBookPaint(F);
  B.checking = true;
  knBookPaint(F);
  const run = ++BK.run;
  knLater(F, 450, () => {
    if (W.booking !== BK || run !== BK.run) return;
    const o = knBookO(F), slot = krBookingSlotsOf(o, B.date).find(s => s.start === B.picked) || { start: B.picked };
    B.conflicts = krBookingConflicts({ pickedStart: B.picked, slotEnd: krBookingSlotEnd(o, slot), zone: KN_ZONE, people: [KN_ME.id, KN_CAL.host_user_id], rows: knL(knCalRows(W)) });
    B.checking = false;
    knBookPaint(F);
    if (B.conflicts.length) knBookReveal(F, '.cal-book-conflict', true);
    knTerminNudge(F);
  });
}
// POST /api/integrations/calcom/book: core's knMeetingAdd with the chosen type (its title, id and length)
function knBookAdd(W, dealId, picked, type, meet, record) { return knMeetingAdd(W, dealId, picked, meet, record, knNow(), type); }
function knBookGo(F) {
  const W = F.W, BK = W.booking, B = BK.B, o = knBookO(F);
  if (krBookingGo(o).disabled) return;
  BK.locked = true;
  Object.assign(B, { busy: true, err: '' });
  knBookPaint(F);
  knLater(F, 900, () => {
    if (W.booking !== BK) return;
    const place = krBookingPlaceOf(o), meet = krBookingIsMeet(place), rec = !!(B.record && B.nt === 'ok' && meet), type = KN_CAL.event_types.find(x => x.id === B.typeId) || KN_INTRO;
    W.booking = null;
    knPaint(F, 'booking');
    knToast(F, krBookingDoneText({ picked: B.picked, zone: KN_ZONE }));
    const nt = rec ? krNotetakerToastText({ status: 'scheduled' }) : null;
    if (nt) knToast(F, nt);
    const a = knBookAdd(W, W.record.id, B.picked, type, meet, rec);
    knRecPaint(F, ['head', 'main']);
    knRecArrived(F, a.id);
    knFocus(F, `#${F.p}r-dd-root [data-act="book"]`);
    if (F.part.booked) F.part.booked(F, a);
  });
}
function knBookClick(F, el) {
  const W = F.W, BK = W.booking, B = BK && BK.B, p = F.p + 'b';
  if (!B) return;
  if (el.closest('[data-close]')) return knBookClose(F);
  const day = el.closest('[data-day]');
  if (day) {
    if (day.disabled || !krBookingBookable(knBookO(F), day.dataset.day)) return;
    Object.assign(B, { date: day.dataset.day, picked: null, conflicts: [], err: '' });
    knBookPaint(F);
    knBookReveal(F, `#${p}-cal-book-time`, true);
    return knFocus(F, `#${p}-cal-book-time`);
  }
  const nav = el.closest('[data-mnav]');
  if (nav && !nav.disabled) { const m = krBookingAddMonths(B.month, Number(nav.dataset.mnav)); B.month = m < W.today.slice(0, 7) ? W.today.slice(0, 7) : m; return knBookLoad(F); }
  if (el.closest(`#${p}-cal-book-recheck`)) { B.nt = 'checking'; knBookPaint(F); return knLater(F, 600, () => { if (W.booking === BK) { B.nt = 'ok'; knBookPaint(F); } }); }
  if (el.closest(`#${p}-cal-book-go`)) return knBookGo(F);
}
function knBookChange(F, el) {
  const B = F.W.booking.B, p = F.p + 'b';
  if (el.id === `${p}-cal-book-time`) return knBookTime(F, el.value);
  if (el.id === `${p}-cal-book-type`) { B.typeId = Number(el.value); B.loc = 0; return knBookLoad(F); }
  if (el.id === `${p}-cal-book-where`) { B.loc = Number(el.value); return knBookPaint(F); }
  if (el.id === `${p}-cal-book-record`) { B.record = el.checked; knTerminNudge(F); return knBookPaint(F); }
}
knLayerMod('booking', { on: F => !!F.W.booking, paint: F => knNotModal(krBookingDialog(knBookO(F))), click: knBookClick, change: knBookChange,
  input: (F, el) => { if (el.id === `${F.p}b-cal-book-note`) F.W.booking.B.note = el.value; },
  esc: F => { if ((F.part.keep || []).includes('booking')) return false; knBookClose(F); return true; }, scrim: knBookClose });

/* ═══ flows: the Onboarding monitor (onboarding.js: rows, filter, Aktualisieren, Onboarding starten) ═════════ */
// Owner: part 5 (abschluss). The status belongs to the Engine (PATCH /api/kunden/:id/status, routes/engine-api.js 67);
// the CRM only kicks it off: a deal entering the trigger stage fires vertrag.unterschrieben (knSetStage in core, as
// routes/deals.js 183 does). What the CRM did is in the rows at once (knOnbRows: GET /api/engine/onboarding as it
// would answer now); what the Engine reports arrives with Aktualisieren (knOnbReport), one step each time.

// the rows the monitor shows (loadOnboarding): kept on the world so a row's button finds the row it was drawn from
function knOnbLoad(W) { W.onbShown = knOnbRows(W); return W.onbShown; }
// what the Engine has reported since the last Aktualisieren: one step for every deal it was told about (core's
// knEngine, which never sets a status back when a deal is won a second time)
function knOnbReport(W) { knEngine(W, 1); }
// loadOnboarding: the rows again, what changed ringed; first the Engine has sent n reports. (round 18) The monitor's
// own Aktualisieren brings the next one (n = 1), as the app's monitor shows a new report on its next load; "Alle
// Meldungen holen" is the shortcut for all that are left
function knOnbReload(F, n) {
  const W = F.W, key = r => `${r.onboarding_status}|${r.delivery && r.delivery.status}|${r.drive_ordner_id}`;
  const before = new Map((W.onbShown || []).map(r => [r.deal_id, key(r)]));
  for (let i = 0; i < n; i++) knOnbReport(W);
  knOnbLoad(W);
  knPaintPage(F);
  knOnbMark(F, W.onbShown.filter(r => before.get(r.deal_id) !== key(r)).map(r => r.deal_id));
}
// how far the Engine still has to go: the reports left for the deal furthest behind (a pending delivery: all six)
function knOnbLeft(W) {
  let left = 0;
  for (const id of W.live) {
    const d = knDeal(W, id), c = d && knContact(W, d.contact_id), dv = W.deliv[id], on = c && W.onb[c.id];
    const n = !dv ? 0 : dv.status === 'pending' ? KN_ONB_STEPS.length - 1 : KN_ONB_STEPS.length - 1 - Math.max(1, KN_ONB_STEPS.indexOf(on ? on.status : KN_ONB_STEPS[1]));
    left = Math.max(left, n);
  }
  return left;
}
// a row brought into the table's view (its own scroll only, never the page's)
function knOnbReveal(F, dealId) {
  const tr = knQ(F, `tr[data-deal="${dealId}"]`), wrap = tr && tr.closest('.table-wrap');
  if (!wrap) return;
  const head = wrap.querySelector('thead'), top = tr.offsetTop - (head ? head.offsetHeight : 0), bottom = tr.offsetTop + tr.offsetHeight;
  if (top < wrap.scrollTop) wrap.scrollTop = Math.max(0, top);
  else if (bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = bottom - wrap.clientHeight;
}
// the changed rows, ringed; the first one brought into view
function knOnbMark(F, ids) {
  ids.forEach((id, i) => { if (i === 0) knOnbReveal(F, id); knFlash(F, `tr[data-deal="${id}"]`); });
}

function knOnbClick(F, el) {
  const W = F.W;
  const h = el.closest('[data-kr]');
  if (!h) return;
  const k = h.dataset.kr, arg = h.dataset.krArg;
  if (k === 'onb-filter') { W.onbFilter = arg; return knPaintPage(F); }
  if (k === 'onb-refresh') return knOnbReload(F, 1);   // (round 18) one report per click
  if (k === 'onb-start') {
    const row = (W.onbShown || []).find(r => r.deal_id === Number(arg));
    if (krOnbCanStart(row)) knConfirmOpen(F, { kind: 'onb', row, back: h });
    return;
  }
  if (k === 'onb-open-deal') return knRecOpen(F, Number(arg));
  if (k === 'onb-open-contact') return knCtOpen(F, Number(arg));
}
KN_INERT.push('.onb-drive');   // the customer's Drive folder is not part of the preview
// "Onboarding starten": the confirm names the trigger stage; yes moves the deal there, which is the one trigger path
// (startOnboarding: PATCH /api/deals/:id/stage, the toast, then loadOnboarding)
KN_CONFIRM.onb = {
  html: (F, C) => krOnbConfirm({ p: F.p + 'c', row: knL(C.row) }),
  done(F, C) {
    const W = F.W, d = knDeal(W, C.row.deal_id);
    if (d) knSetStage(W, d, C.row.trigger_stage_id);
    knToast(F, knText(krOnbToast({ row: knL(C.row) })));
    knOnbLoad(W);
    if (knShows(F, 'onboarding') || knShows(F, 'deals')) knPaintPage(F);
    knOnbMark(F, [C.row.deal_id]);
    if (F.part.started) F.part.started(F, C.row.deal_id);
  },
};
knMod('onboarding', { screen: F => krOnboardingPage(knL({ p: F.p, rows: knOnbLoad(F.W), active: true, filter: F.W.onbFilter, now: Date.now() })), click: knOnbClick });

/* ═══ flows: Contacts (contacts.js + detail-views.js openContactDetail, ported as krCt*) and the contact dialog (modals.js) ═══ */
// Owner: the day agent (part 6, the Kontakte tab).

// Anna Weiß's column widths (users.column_widths, saved by dragging a column's edge)
const KN_CT_WIDTHS = { _name: 210, company: 190, email: 240, phone: 150, assigned_to: 140, created_at: 130, branche: 120, website: 210, dachflaeche: 140 };
// a menu's items with their labels in the page's language; the values stay the sample's own (a filter or a save
// compares them with the stored data)
const knLabels = items => items.map(it => (it.label != null ? { ...it, label: knL(it.label) } : it));
// every address of the workspace, the way routes/contacts.js compares them (lower case, trimmed)
const knCtEmails = W => W.contacts.map(c => ({ id: c.id, email: c.email ? String(c.email).toLowerCase().trim() : null }));
// the list cell or record field that just changed, briefly ringed
function knCtFlashCell(F, id, key) {
  const td = F.root.querySelector(`#${F.p}x-contacts-body td[data-kr-id="${id}"][data-kr-arg="${key}"]`);
  if (td) knFlash(F, td);
}
function knCtRow(W, c) {
  const m = knMember(c.assigned_to), on = W.onb[c.id] || {};
  return { id: c.id, workspace_id: 1, name: c.name, email: c.email, phone: c.phone, company: c.company, stage_id: null, assigned_to: c.assigned_to || null, assigned_to_name: m ? m.name : null,
    assigned_to_email: m ? m.email || null : null, custom_data: c.custom_data || {}, contact_type: 'contact', created_at: c.created_at, updated_at: c.updated_at, last_activity_at: null,
    onboarding_status: on.status || 'kein_onboarding', drive_ordner_id: on.drive || null, akte_version: on.akte || 0, rechtsform: null, ust_id: null, handelsregisternummer: null, webseite: null,
    quelle: null, strasse: null, plz: null, ort: null };
}
const KN_CT_FIELDS = KN_FIELDS.map((f, i) => ({ workspace_id: 1, options: [], position: i, ...f }));
// the Contacts page's o; with the record: GET /api/contacts/:id (+ activities), its deals, all tasks, the Cal.com status
function knCtO(F, withRecord) {
  const W = F.W, R = withRecord ? W.ctRec : null;
  const o = { p: F.p + 'x', now: Date.now(), contacts: krCtFromApi(W.contacts.map(c => knCtRow(W, c))), fields: KN_CT_FIELDS, members: KN_MEMBERS,
    currentUser: { ...KN_ME, column_widths: KN_CT_WIDTHS }, workspace: { whatsapp_template: null, task_statuses: null, supplier_name: null }, pipelines: KN_PIPES, ...W.ct, record: null };
  const c = R && knContact(W, R.id);
  if (c) {
    const acts = knActRows(W).filter(a => a.contact_id === c.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(a => ({ workspace_id: 1, completed: false, calcom_event_type_id: null, event_date: null, logged_by_email: null, ...a, source: a.source || 'user' }));
    o.record = { contact: { ...knCtRow(W, c), activities: acts }, deals: krCtDealsFor(W.deals.map(d => knDealRow(W, d)), c.id), tasks: knTaskRows(W), docs: [], calcom: KN_CALCOM,
      tab: R.tab, draft: R.draft, editAct: null };
  }
  return o;
}
// openContactDetail: the side panel on the Contacts page, else the pop window (detail-views.js:1000-1009); a part that
// does not show contacts leads to the one that does (knRouteContact)
function knCtOpen(F, id) {
  const W = F.W;
  if (!knContact(W, id)) return knToast(F, t('dv_contact_gone'));
  if (!F.part.contact) return knRouteContact(F, id);
  knMenuClose(F);
  if (W.page !== 'contacts' && (F.part.pages || []).includes('contacts')) knGo(F, 'contacts');
  const panel = knShows(F, 'contacts');
  W.ctRec = { id, host: panel ? 'panel' : 'modal', tab: 'overview', draft: { type: 'note', text: '', err: false, filter: 'all' } };
  if (panel) {
    W.ct.activeRow = id;
    const host = knId(`${F.p}x-contact-side-panel`);
    if (host) host.outerHTML = krCtRecord(knL(knCtO(F, true)));
    F.root.querySelectorAll(`#${F.p}x-contacts-body tr.side-panel-active`).forEach(r => r.classList.remove('side-panel-active'));
    const name = F.root.querySelector(`#${F.p}x-contacts-body [data-kr="open"][data-kr-id="${id}"]`);
    if (name && name.closest('tr')) name.closest('tr').classList.add('side-panel-active');
  } else {
    knPaint(F, 'contact');
    knFocus(F, '[data-kn-layer="contact"] .modal-head [data-close]');
  }
}
function knCtClose(F) {
  const W = F.W;
  if (!W.ctRec) return;
  if (W.ctRec.host === 'modal') { W.ctRec = null; return knPaint(F, 'contact'); }
  const panel = knId(`${F.p}x-contact-side-panel`);
  if (panel) panel.classList.add('hidden');   // the body stays inside the collapsed panel, as the app leaves it
  F.root.querySelectorAll(`#${F.p}x-contacts-body tr.side-panel-active`).forEach(r => r.classList.remove('side-panel-active'));
  W.ctRec = null; W.ct.activeRow = null;
  knFit(F);
}
// the whole record body again (the app has no parts for it)
function knCtRecPaint(F) {
  const W = F.W;
  if (!W.ctRec) return;
  const body = W.ctRec.host === 'panel' ? knId(`${F.p}x-side-panel-body`) : F.layers.contact.querySelector('.modal-body');
  if (body) body.innerHTML = krCtRecordBody(knL(knCtO(F, true)));
  knFit(F);
}
// filterContacts(): the selection empties and the list's hosts re-render; the panel is left as it is
function knCtFull(F, patch) {
  const W = F.W;
  Object.assign(W.ct, patch || {}, { selected: [], selectAll: false, activeRow: null });
  const parts = krCtParts(knL(knCtO(F, false))), p = F.p + 'x';
  const set = (id, html) => { const el = knId(`${p}-${id}`); if (el) el.innerHTML = html; };
  const sub = knId(`${p}-contacts-page-sub`);
  if (sub) sub.textContent = parts.sub;   // the app sets the sub line's text
  set('contacts-toolbar', parts.toolbar); set('contacts-bulkbar', parts.bulkbar); set('contacts-pagination', parts.pagination);
  const wrap = knId(`${p}-contacts-table-wrap`);
  if (wrap) wrap.innerHTML = parts.table;
  knCtKeys(F);
  knFit(F);
}
// what an inline edit or a record save changed, written back onto the sample contacts
function knCtWriteBack(W, rows) {
  for (const r of rows || []) {
    const c = knContact(W, r.id);
    if (c) Object.assign(c, { name: r.name, email: r.email, phone: r.phone, company: r.company, assigned_to: r.assigned_to ?? null, custom_data: r.custom_data || {} });
  }
}
// contacts.js:259-306 startInlineEdit: the cell becomes the editor; Enter / leaving it saves, Esc keeps.
// contacts.js:308-332 commitInlineEdit: the row changes at once, the PUT follows; an address another contact has is
// refused (routes/contacts.js:237-258, 409 email_taken): the row shows what is saved and the toast says why.
// (round 13) the app's contact names and editable cells take only the mouse (a <strong> and a <td> with a click); here
// they also take the keyboard, as the bell's rows do: in the tab order, a button to assistive tech, Enter or Space opens
// them, and the cell has focus again after Enter or Escape
function knCtKeys(F) {
  for (const el of F.root.querySelectorAll('.contacts-main .contact-name-link[data-kr="open"], .contacts-main .editable-cell[data-kr="cell-edit"]')) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
  }
}
function knCtListKey(F, e) {
  const el = e.target.closest && e.target.closest('.contact-name-link[data-kr="open"], .editable-cell[data-kr="cell-edit"]');
  if (!el || e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return false;
  e.preventDefault();
  el.click();
  return true;
}
function knCtCellEdit(F, td) {
  if (td.querySelector('input, select')) return;
  const o = knCtO(F, false), id = Number(td.dataset.krId), key = td.dataset.krArg, col = krCtColumns(o).find(c => c.key === key);
  const ed = col && krCtInlineEditor(o, id, key, col.type);
  if (!ed) return;
  const keep = td.innerHTML;
  td.innerHTML = ed.html;
  const el = td.firstElementChild;
  if (el.tagName === 'SELECT') for (const opt of el.options) opt.textContent = knL(opt.textContent);   // the options read in the page's language, their values stay
  if (ed.value != null) el.value = ed.value;   // a <select> keeps the option the markup marks selected
  el.focus({ preventScroll: true });
  if (ed.selectText && el.select) el.select();
  let done = false;
  const back = { on: false };   // Enter or Escape: the cell (or the new one, once saved) has focus again
  const restore = () => { if (done) return; done = true; td.innerHTML = keep; if (back.on) td.focus({ preventScroll: true }); };
  const commit = v => {
    if (done) return;
    done = true;
    if (key === 'email' && krFmContactEmailTaken(knCtEmails(F.W), v, id)) { knCtFull(F); return knToast(F, t('cf_err_email_taken')); }
    knCtWriteBack(F.W, krCtInlineCommit(o, id, key, col.type, v).contacts.filter(c => c.id === id));
    knCtFull(F);
    knCtFlashCell(F, id, key);
    if (back.on) knFocus(F, `.contacts-main .editable-cell[data-kr-id="${id}"][data-kr-arg="${key}"]`);
  };
  if (el.tagName === 'SELECT') {
    el.addEventListener('change', () => commit(col.type === 'assignee' ? (el.value ? parseInt(el.value, 10) : null) : (el.value || null)));
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); back.on = true; restore(); } });
    el.addEventListener('blur', () => setTimeout(restore, 0));
  } else {
    const was = String(ed.value == null ? '' : ed.value);   // origVal, as the input held it
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); back.on = true; el.blur(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back.on = true; restore(); } });
    el.addEventListener('blur', () => { const v = el.value.trim(); if (v === was) restore(); else commit(v || null); });
  }
}
// a chip: a menu for a choice column, the text popover (contacts.js:439-446) for a text column; typing filters, the toolbar stays
function knCtChip(F, chip) {
  const o = knCtO(F, false), key = chip.dataset.chip, items = krCtChipItems(o, key);
  if (items) return knMenuOpen(F, chip, knLabels(items), it => knCtFull(F, it.act === 'filter' ? krCtSetFilter(o, key, it.value) : krCtRemoveFilter(o, key)));
  const m = knPopOpen(F, chip, krCtTextFilterPop(knL(o), key), { key, input: knCtPopInput, rm: T => knCtFull(T, krCtRemoveFilter(knCtO(T, false), key)) }, 260);   // ui.popover with { width: 260 }
  const input = m.querySelector('input');
  if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); }
}
function knCtPopInput(F, el) {
  const W = F.W, key = W.menu.pop.key;
  clearTimeout(F.qT);
  F.qT = setTimeout(() => {
    Object.assign(W.ct, krCtSetFilter(knCtO(F, false), key, el.value), { selected: [], selectAll: false, activeRow: null });
    const parts = krCtParts(knL(knCtO(F, false))), p = F.p + 'x', set = (id, html) => { const x = knId(`${p}-${id}`); if (x) x.innerHTML = html; };
    set('contacts-page-sub', parts.sub); set('contacts-bulkbar', parts.bulkbar); set('contacts-pagination', parts.pagination);
    const wrap = knId(`${p}-contacts-table-wrap`); if (wrap) wrap.innerHTML = parts.table;
    knCtKeys(F);
  }, 140);
}
function knCtListClick(F, el) {
  const W = F.W, h = el.closest('[data-kr]'), k = h ? h.dataset.kr : '';
  if (k === 'open') return knCtOpen(F, Number(h.dataset.krId));
  if (k === 'close-panel') return knCtClose(F);
  if (k === 'cell-edit') { if (!el.closest('a, input, select')) knCtCellEdit(F, h); return; }
  const o = knCtO(F, false);
  if (k === 'sort') { if (el.closest('.col-resize-handle')) return; return knCtFull(F, krCtToggleSort(o, h.dataset.colKey)); }
  if (k === 'chip') return knCtChip(F, h);
  if (k === 'add-filter') return knMenuOpen(F, h, knLabels(krCtAddFilterItems(o)), it => {
    if (it.act === 'remove-filter') return knCtFull(F, krCtRemoveFilter(o, it.key));
    Object.assign(W.ct, krCtAddFilter(o, it.key));
    knCtFull(F);
    const chip = F.root.querySelector(`#${F.p}x-contacts-toolbar [data-chip="${it.key}"]`);
    if (chip) knCtChip(F, chip);   // the new chip's menu or popover opens at once
  }, 'right');
  if (k === 'clear-filters') return knCtFull(F, krCtClearFilters());
  if (k === 'select-mode') return knCtFull(F, krCtToggleSelectMode(o));
  if (k === 'columns') return knMenuOpen(F, h, knLabels(krCtColumnsItems(o)), it => knCtFull(F, krCtToggleColumn(o, it.i)), 'right');
  if (k === 'page') return knCtFull(F, krCtGoToPage(o, Number(h.dataset.krArg)));
  if (k === 'clear-selection') { Object.assign(W.ct, { selected: [], selectAll: false }); F.root.querySelectorAll(`#${F.p}x-contacts-body input[type="checkbox"], #${F.p}x-select-all-checkbox`).forEach(b => { b.checked = false; }); const bb = knId(`${F.p}x-contacts-bulkbar`); if (bb) bb.innerHTML = ''; return; }
  if (k === 'more') return knMenuOpen(F, h, knL(krCtMoreItems()).map(it => ({ ...it, inert: true })), () => {}, 'right');   // CSV import and export are left out
  if (k === 'add-contact') return knCfOpen(F);
}
function knCtListChange(F, el) {
  const W = F.W, o = knCtO(F, false), bb = () => { const b = knId(`${F.p}x-contacts-bulkbar`); if (b) b.innerHTML = krCtParts(knL(knCtO(F, false))).bulkbar; };
  if (el.dataset.kr === 'select-all') { Object.assign(W.ct, krCtToggleAll(o, el.checked)); F.root.querySelectorAll(`#${F.p}x-contacts-body [data-kr="select-row"]`).forEach(b => { b.checked = el.checked; }); return bb(); }
  if (el.dataset.kr === 'select-row') { Object.assign(W.ct, krCtToggleRow(o, Number(el.dataset.contactId), el.checked)); if (!el.checked) { const all = knId(`${F.p}x-select-all-checkbox`); if (all) all.checked = false; } return bb(); }
}
// the record's controls the preview leaves out (the forms, the task drawer, documents, the meeting dialogs, editing and
// deleting entries): inert in both hosts, the side panel and the pop window
const KN_CT_OFF = ['add-deal', 'add-task', 'doc-upload', 'doc-del', 'edit-all', 'act-edit', 'act-del', 'act-resched', 'act-meeting-cancel'];
KN_INERT.push(...KN_CT_OFF.flatMap(a => [`.contact-side-panel [data-act="${a}"]`, `[data-kn-layer="contact"] [data-act="${a}"]`]));
// the record (both hosts): tabs, the composer, the type filter, task ticks, the ⋯ menu, its deals
function knCtRecClick(F, el) {
  const W = F.W, R = W.ctRec;
  if (!R) return;
  if (el.closest('[data-close], [data-kr="close-panel"]')) return knCtClose(F);
  const at = el.closest('[data-atype]');
  if (at) { R.draft = { ...R.draft, type: at.dataset.atype }; knCtRecPaint(F); return knFocus(F, `#${F.p}x-ct-atext`); }
  const ed = el.closest('button[data-edit]');
  if (ed) return knCtFieldEdit(F, ed);
  if (el.closest('[data-note]') && !el.closest('a')) return knOff(F);   // detail-views.js:1101: a note's text opens its editor in the app
  const b = el.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'tab') { R.tab = b.dataset.tab; knCtRecPaint(F); return knFocus(F, `[data-act="tab"][data-tab="${R.tab}"]`); }
  if (act === 'open-deal') { const id = Number(b.dataset.id); knCtClose(F); return knRecOpen(F, id); }
  if (act === 'open-task' && F.part.name === 'day') return knTkDrOpen(F, Number(b.dataset.id), b);   // the task drawer over the record
  if (act === 'book') { knCtClose(F); return knRouteBook(F, R.id); }   // booking is step 2's: it leads there
  // deleting the contact is left out: its item is inert
  if (act === 'more') return knMenuOpen(F, b, knL(krCtRecordMoreItems(knCtO(F, true))).map(it => (it.act === 'delete' ? { ...it, inert: true } : it)), it => {
    const c = knContact(W, R.id);
    if (it.act === 'copy-email') knToast(F, t(c && c.email ? 'dv_email_copied' : 'dv_no_email'));
    else if (it.act === 'copy-phone') knToast(F, t(c && c.phone ? 'dv_phone_copied' : 'dv_no_phone'));
  }, 'right');
  knOff(F);   // what a keyboard could still reach of KN_CT_OFF
}
// detail-views.js:1020-1040 startEdit: the owner and a dropdown field pick from a menu (ui.select); any other field
// becomes an input in its place: Enter saves (a missing name or a malformed address is said under it), Esc keeps,
// leaving it saves what is valid. commit (:882-888): the record and the list show it, then the toast.
function knCtFieldEdit(F, btn) {
  const R = F.W.ctRec, key = btn.dataset.edit;
  if (!R) return;
  const o = knCtO(F, true), items = krCtRecordFieldItems(o, key);
  if (items) return knMenuOpen(F, btn, knLabels(items), it => knCtFieldDone(F, key, krCtRecordFieldSave(knCtO(F, true), key, it.value)));
  const html = krCtFieldEditor(o, key), dd = btn.closest('dd');
  if (!html || !dd) return;
  const keep = dd.innerHTML;
  dd.innerHTML = html;
  const inp = dd.querySelector('input'), err = dd.querySelector('.error-text');
  let done = false;
  inp.focus({ preventScroll: true });
  inp.select();
  const finish = (save, strict) => {
    if (done) return;
    if (!save) { done = true; dd.innerHTML = keep; return; }
    const r = krCtRecordFieldSave(knCtO(F, true), key, inp.value, strict);
    if (r.error) { inp.setAttribute('aria-invalid', 'true'); err.textContent = r.error; err.hidden = false; return; }
    done = true;
    if (r.unchanged) { dd.innerHTML = keep; if (r.toast) knToast(F, r.toast); return; }
    knCtFieldDone(F, key, r);
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
  inp.addEventListener('input', () => { inp.removeAttribute('aria-invalid'); err.hidden = true; });
  inp.addEventListener('blur', () => finish(true, false));
}
// the PUT's answer: 409 for an address another contact has (the record shows what is saved, the toast says why),
// else the contact as saved, the list again (dvRefreshContacts) and the record again, then the toast
function knCtFieldDone(F, key, r) {
  const W = F.W, R = W.ctRec, c = R && knContact(W, R.id);
  if (!c || r.unchanged) return;
  if ('email' in r.patch && krFmContactEmailTaken(knCtEmails(W), r.patch.email, c.id)) { knCtRecPaint(F); return knToast(F, t('cf_err_email_taken')); }
  Object.assign(c, r.patch, { updated_at: knNow() });
  if (knShows(F, 'contacts')) knCtFull(F);
  knCtRecPaint(F);
  knToast(F, r.toast);
  const box = F.root.querySelector(`${R.host === 'panel' ? `#${F.p}x-side-panel-body` : '[data-kn-layer="contact"]'} button[data-edit="${key}"]`);
  if (box) { knFlash(F, box); knFocus(F, box); }
}
function knCtRecChange(F, el) {
  const R = F.W.ctRec;
  if (!R) return;
  if (el.id === `${F.p}x-ct-afilter`) { R.draft = { ...R.draft, filter: el.value }; knCtRecPaint(F); return knFocus(F, `#${F.p}x-ct-afilter`); }
  if (el.dataset.taskToggle) { const id = Number(el.dataset.taskToggle), r = krCtRecordToggleTask(knCtO(F, true), id, el.checked), x = F.W.tasks.find(q => q.id === id); if (x) x.status = r.status; knCtRecPaint(F); return knToast(F, r.toast); }
}
function knCtRecInput(F, el) {
  const R = F.W.ctRec;
  if (!R || el.id !== `${F.p}x-ct-atext`) return;
  R.draft = { ...R.draft, text: el.value };
  if (R.draft.err && el.value.trim()) { R.draft.err = false; el.removeAttribute('aria-invalid'); const er = knId(`${F.p}x-ct-aerr`); if (er) er.hidden = true; }
}
function knCtRecKey(F, e) {
  if (F.W.ctRec && e.target.id === `${F.p}x-ct-atext` && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); knCtRecSubmit(F); }
}
function knCtRecSubmit(F) {
  const W = F.W, R = W.ctRec;
  if (!R) return;
  const r = krCtRecordLog(knCtO(F, true), ++W.seq);
  if (r.error) { R.draft = { ...R.draft, err: true }; knCtRecPaint(F); return knFocus(F, `#${F.p}x-ct-atext`); }
  W.acts.unshift({ ...r.entry, bound_deal_id: null, created_by_name: KN_ME.name });
  R.draft = { ...R.draft, text: '', err: false };
  knCtRecPaint(F);
  knToast(F, r.toast);
  knFocus(F, `#${F.p}x-ct-atext`);
}
// in the side panel the record is part of the page (the app layer); in the pop window it is the contact layer
const knInPanel = (F, el) => !!el.closest(`#${F.p}x-contact-side-panel`);
knMod('contacts', {
  screen: F => krCtPage(knL(knCtO(F, F.W.ctRec && F.W.ctRec.host === 'panel'))),
  click: (F, el) => (knInPanel(F, el) ? knCtRecClick(F, el) : knCtListClick(F, el)),
  change: (F, el) => (knInPanel(F, el) ? knCtRecChange(F, el) : knCtListChange(F, el)),
  input: (F, el) => {
    if (knInPanel(F, el)) return knCtRecInput(F, el);
    if (el.dataset.kr !== 'search') return;
    F.W.ct = { ...F.W.ct, ...krCtSearch(knCtO(F, false), el.value) };
    clearTimeout(F.qT);
    const id = el.id;
    F.qT = setTimeout(() => { knCtFull(F); const q = knId(id); if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); } }, 140);
  },
  key: (F, e) => { if (knInPanel(F, e.target)) return knCtRecKey(F, e); return knCtListKey(F, e); },
  after: F => knCtKeys(F),
});
knLayerMod('contact', { on: F => !!(F.W.ctRec && F.W.ctRec.host === 'modal'), paint: F => krCtRecordModal(knL(knCtO(F, true))), click: knCtRecClick, change: knCtRecChange, input: knCtRecInput, key: knCtRecKey,
  esc: F => { knCtClose(F); return true; }, scrim: knCtClose });
knSubmit('x-ct-compose', knCtRecSubmit);

// ── the contact dialog ("Kontakt hinzufügen"): the save lock, the browser's own check, the 10 s guard, the POST (a known email answers 409) ──
function knCfO(F) {
  const W = F.W, C = W.cf;
  return { p: F.p + 'g', contactType: 'contact', workspace: { supplier_name: W.supplierName }, fields: KN_CT_FIELDS, members: KN_MEMBERS, currentUser: KN_ME, contact: null,
    values: C.values, error: C.error, errorShown: C.errorShown, locked: C.locked, submitting: C.submitting, activePage: knShows(F, 'deals') ? 'deals' : 'contacts' };
}
function knCfOpen(F) {
  const W = F.W;
  knMenuClose(F);
  W.df = null;
  W.cf = { values: {}, error: null, errorShown: false, locked: false, submitting: false };
  knPaint(F, 'form');
  knFocus(F, `#${F.p}g-cf-name`);
}
function knCfClose(F) { F.W.cf = null; knPaint(F, 'form'); }
function knCfInput(F, el) {
  const C = F.W.cf, p = F.p + 'g';
  if (el.id && el.id.startsWith(`${p}-cfield-`)) { C.values.cf = { ...(C.values.cf || {}), [el.id.slice(`${p}-cfield-`.length)]: el.value }; return; }
  const k = { [`${p}-cf-name`]: 'name', [`${p}-cf-company`]: 'company', [`${p}-cf-email`]: 'email', [`${p}-cf-phone`]: 'phone', [`${p}-cf-assignee`]: 'assignee' }[el.id];
  if (k) C.values[k] = el.value;
}
function knCfSubmit(F) {
  const W = F.W, C = W.cf;
  if (!C || C.locked || C.submitting) return;
  const o = knCfO(F), bad = krFmContactInvalid(o);
  C.locked = true;
  knLater(F, 1000, () => { if (W.cf === C) C.locked = false; });
  if (bad) { const el = knId(bad.id); if (el) { el.focus({ preventScroll: true }); if (el.reportValidity) el.reportValidity(); } return; }
  C.submitting = true;
  knLater(F, 10000, () => { if (W.cf === C) { C.submitting = false; knPaint(F, 'form'); } });
  const req = krFmContactSubmit(o), all = W.contacts.map(c => ({ id: c.id, email: c.email ? String(c.email).toLowerCase().trim() : null }));
  const res = krFmContactEmailTaken(all, req.body.email) ? { error: 'email_taken', code: 'email_taken' } : { id: ++W.seq };
  const r = krFmContactSaved(o, res);
  if (!r.close) { Object.assign(C, { error: r.error, errorShown: true }); knPaint(F, 'form'); if (r.focus) knFocus(F, `#${r.focus}`); return; }
  const row = krFmContactRow(o, req.body, res, knNow());
  W.contacts.push({ id: row.id, name: row.name, company: row.company, email: row.email, phone: row.phone, assigned_to: row.assigned_to, custom_data: row.custom_data, created_at: row.created_at, updated_at: row.updated_at });
  W.cf = null;
  knPaint(F, 'form');
  if (knShows(F, 'contacts')) {
    knCtFull(F);   // loadContacts: newest first, the new contact on top
    const name = F.root.querySelector(`#${F.p}x-contacts-body [data-kr="open"][data-kr-id="${row.id}"]`), wrap = knId(`${F.p}x-contacts-table-wrap`);
    if (wrap) wrap.scrollTop = 0;
    if (name) { knFlash(F, name.closest('td')); knFocus(F, `#${F.p}x-list-add-btn`); }
  } else if (knShows(F, 'deals')) knPaintPage(F);
}
// the contact dialog ignores Esc, as in the app; its bare backdrop closes it (core.js:1397)
knLayerMod('form', { on: F => !!F.W.cf, paint: F => krFmContactModal(knL(knCfO(F))),
  click: (F, el) => { if (el.closest('[data-kr="contact-close"]') || el.classList.contains('modal-overlay')) knCfClose(F); },
  change: knCfInput, input: knCfInput, esc: () => true });
knSubmit('g-contact-form', knCfSubmit);

/* ═══ flows: Tasks (tasks.js) and the Calendar (calendar.js) ══════════════════════════════════════════════════ */
// Owner: the day agent (part 6, the Aufgaben and Kalender tabs).

function knTasksO(F) {
  const W = F.W, U = W.tasksUI;
  return knL({ p: F.p, now: new Date(), me: KN_ME, tasks: knTaskRows(W), projects: W.projects || KN_PROJECTS, statuses: null, members: KN_MEMBERS, scope: U.scope,
    selection: U.sel, collapsed: U.collapsed, expanded: U.expanded, closedProjects: U.closed, summary: U.summary, sort: U.sort, filters: U.filters });
}
function knCalO(F) {
  const W = F.W, U = W.calUI;
  return knL({ p: F.p, now: new Date(), me: KN_ME, view: U.view, anchor: U.anchor, rows: knCalRows(W), filters: U.filters, members: KN_MEMBERS });
}
const knToggle = (list, v) => (list.includes(v) ? list.filter(x => x !== v) : list.concat([v]));
function knTasksClick(F, el) {
  const W = F.W, U = W.tasksUI;
  const tick = el.closest('button.tk-done[data-toggle]');
  if (tick) {
    const id = Number(tick.dataset.toggle), r = krTaskTick(knTasksO(F), id), x = W.tasks.find(q => q.id === id);
    if (!r || !x) return;
    x.status = r.status;
    knPaintPage(F);
    return knToast(F, r.toast, r.action, () => { x.status = r.previous; if (knShows(F, 'tasks')) knPaintPage(F); });
  }
  const g = el.closest('button.tk-ghead[data-group]');
  if (g) { U.collapsed = knToggle(U.collapsed, g.dataset.group); knPaintPage(F); return knFocus(F, `button.tk-ghead[data-group="${g.dataset.group}"]`); }
  const sort = el.closest('[data-sort]');
  if (sort) { const key = sort.dataset.sort; U.sort = { key, dir: U.sort.key === key ? -U.sort.dir : 1 }; return knPaintPage(F); }
  const sc = el.closest('[data-scope]');
  if (sc) { const k = sc.dataset.scope; U.scope = k === 'project' || k === 'list' ? { kind: k, project: Number(sc.dataset.p), list: Number(sc.dataset.l) || null } : k; U.sel = []; return knPaintPage(F); }
  const pt = el.closest('[data-ptoggle]');
  if (pt) { U.closed = knToggle(U.closed, Number(pt.dataset.ptoggle)); return knPaintPage(F); }
  const kpi = el.closest('[data-kpi]');
  if (kpi) {
    const k = kpi.dataset.kpi;
    if (k === 'active' || k === 'done') U.filters = { ...U.filters, status: U.filters.status === k ? null : k, due: null };
    else U.filters = { ...U.filters, due: U.filters.due === k ? null : k, status: null };
    return knPaintPage(F);
  }
  const chip = el.closest('[data-kr^="chip-"]');   // tasks.js:349 tasksChip: id tasks-chip-<key>
  if (chip) { const key = chip.dataset.kr.slice(5); return knMenuOpen(F, chip, knSelectItems(krTasksChipOptions(knTasksO(F), key), U.filters[key], 'tchip'), it => { U.filters = { ...U.filters, [key]: it.value }; knPaintPage(F); }); }
  const k = (el.closest('[data-kr]') || {}).dataset?.kr;
  if (k === 'clear-filters') { U.filters = { q: '', assignee: null, priority: null, status: null, due: null }; return knPaintPage(F); }
  if (k === 'toggle-summary') { U.summary = !U.summary; return knPaintPage(F); }
  if (k === 'bulk-clear') { U.sel = []; return knPaintPage(F); }
  if (k === 'subtasks') { const tr = el.closest('tr[data-open]'); if (tr) { U.expanded = knToggle(U.expanded, Number(tr.dataset.open)); knPaintPage(F); } return; }
  if (k === 'open-deal') { const tr = el.closest('tr[data-open]'), x = tr && W.tasks.find(q => q.id === Number(tr.dataset.open)); if (x && x.deal_id) knRecOpen(F, x.deal_id); return; }
  const kebab = el.closest('[data-kebab]');
  if (kebab) return knTaskMenu(F, kebab, Number(kebab.dataset.kebab));
  // the title and a click on the row (tasks.js:427, onTaskRowClick 465-468: not on its box, its menu, a link or a button)
  // open the task drawer
  const title = el.closest('a.tk-title'), tr = el.closest('tr[data-open]');
  if (title && tr) return knTkDrOpen(F, Number(tr.dataset.open), title);
  if (tr && !el.closest('.check,[data-kebab],[data-toggle],a,button,input')) return knTkDrOpen(F, Number(tr.dataset.open), tr);
}
// tasks.js:635-646 openTaskKebab: the row's menu; each item does what the app's does
function knTaskMenu(F, anchor, id) {
  const W = F.W, U = W.tasksUI, x = W.tasks.find(q => q.id === id), menu = x && krTaskKebabItems(knTasksO(F), id);
  if (!menu) return;
  const items = menu;
  // patchTasks (tasks.js:583-604): the change at once, the toast with Rückgängig, which puts the old values back
  const patch = (p, label) => {
    const old = Object.fromEntries(Object.keys(p).map(k => [k, x[k]]));
    Object.assign(x, p); knPaintPage(F);
    knToast(F, label, t('undo'), () => { Object.assign(x, old); if (knShows(F, 'tasks')) knPaintPage(F); });
  };
  knMenuOpen(F, anchor, items, it => {
    if (it.act === 'open') return knTkDrOpen(F, id, anchor);
    if (it.act === 'toggle') { const r = krTaskTick(knTasksO(F), id); return patch({ status: r.status }, r.toast); }
    if (it.act === 'move') { if (x.status !== it.value) patch({ status: it.value }, krTaskMoveToast(knTasksO(F), id, it.value)); return; }
    if (it.act === 'priority') return patch({ priority: it.value }, krTaskPrioToast(it.value));
    if (it.act === 'delete') knConfirmOpen(F, { kind: 'task-delete', ids: [id], back: anchor });
  }, 'right');
}
// deleteTasks (tasks.js:619-633): the question, then the task and its subtasks gone, the toast (no Rückgängig)
KN_CONFIRM['task-delete'] = {
  html: (F, C) => krConfirm({ p: F.p + 'c', ...krTaskDeleteConfirm(C.ids.length) }),
  done(F, C) {
    const W = F.W, gone = new Set(C.ids);
    W.tasks = W.tasks.filter(x => !gone.has(x.id) && !gone.has(x.parent_id));
    W.tasksUI.sel = W.tasksUI.sel.filter(id => !gone.has(id));
    if (knShows(F, 'tasks')) knPaintPage(F);
    knToast(F, krTaskDeletedToast(C.ids.length));
  },
};
function knTasksChange(F, el) {
  const U = F.W.tasksUI;
  if (el.matches('input[data-all]')) {
    const K = krTkCtx(knTasksO(F)), ids = krTkVisible(K).filter(x => !x.parent_id).map(x => x.id);
    U.sel = el.checked ? ids : [];
    return knPaintPage(F);
  }
  if (el.matches('input[data-row]')) { U.sel = knToggle(U.sel, Number(el.dataset.row)); knPaintPage(F); }
}
// tasks.js:506 quickAddTask: the POST, the list again with the input empty and focused, then the toast whose Öffnen
// opens the task drawer (not in the preview: it says so)
function knTaskAdd(F, input) {
  const W = F.W, key = input.dataset.quickadd, r = krTaskQuickAdd(knTasksO(F), key, input.value);
  if (!r) return;
  const id = ++W.seq;
  W.tasks.push({ id, description: null, due_date: null, due_time: null, due_tz: KN_ZONE, parent_id: null, deal_id: null, contact_id: null, custom_data: {}, ...r.body });
  knPaintPage(F);
  const row = knQ(F, `tr[data-open="${id}"]`);
  if (row) knFlash(F, row.cells[1]);
  knFocus(F, `input.tk-addinput[data-quickadd="${key}"]`);
  knToast(F, r.toast, r.action, () => knTkDrOpen(F, id));   // the toast's Öffnen opens the new task's drawer
}
function knTasksInput(F, el) {
  if (el.dataset.kr !== 'search') return;
  F.W.tasksUI.filters = { ...F.W.tasksUI.filters, q: el.value };
  clearTimeout(F.qT);
  const id = el.id;
  F.qT = setTimeout(() => { knPaintPage(F); const q = knId(id); if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); } }, 120);
}
function knTasksKey(F, e) {
  const el = e.target;
  if (!el.matches || !el.matches('input.tk-addinput[data-quickadd]')) return;
  if (e.key === 'Enter') { e.preventDefault(); knTaskAdd(F, el); } else if (e.key === 'Escape') { el.value = ''; el.blur(); e.stopPropagation(); }
}
knMod('tasks', {
  screen: F => krTasksPage(knTasksO(F)), click: knTasksClick, change: knTasksChange, input: knTasksInput, key: knTasksKey,
  after: F => { const all = knQ(F, 'input[data-all]'); if (all) { const n = F.W.tasksUI.sel.length; all.indeterminate = n > 0 && !all.checked; } },
});

function knCalClick(F, el) {
  const W = F.W, U = W.calUI, o = knCalO(F);
  const v = el.closest('[data-view]');
  if (v) { U.view = v.dataset.view; return knPaintPage(F); }
  const chip = el.closest('[data-chip]');
  if (chip) { const key = chip.dataset.chip; return knMenuOpen(F, chip, knSelectItems(krCalendarChipOptions(o, key), U.filters[key], 'cchip'), it => { U.filters = { ...U.filters, [key]: it.value }; knPaintPage(F); }); }
  const k = (el.closest('[data-kr]') || {}).dataset?.kr;
  if (k === 'prev' || k === 'next') { U.anchor = krCalendarStep(o, k === 'prev' ? -1 : 1); knPaintPage(F); }
  else if (k === 'today') { U.anchor = krCalendarToday(o); knPaintPage(F); }
  else if (k === 'clear-filters') { U.filters = { type: null, person: null }; knPaintPage(F); }
  // calendar.js:444-452 openCalendarEntry: an activity opens its window, a task its drawer
  const ev = el.closest('[data-ev]');
  if (ev && /^task-\d+$/.test(ev.dataset.ev)) return knTkDrOpen(F, Number(ev.dataset.ev.slice(5)), ev);
  if (ev) knCalDetailOpen(F, ev.dataset.ev);
}
// calendar.js:473-514 openCalendarEventDetail, ported as krCalEventDetail: the window in the detail layer
function knCalDetailOpen(F, uid) {
  const d = krCalEventDetail(knCalO(F), uid);
  if (!d) return;
  knMenuClose(F);
  F.W.detail = { uid, back: knQ(F, `[data-ev="${uid}"]`) };
  knPaint(F, 'detail');
  knFocus(F, '[data-kn-layer="detail"] .modal-head [data-close]');
}
function knCalDetailClose(F) { const D = F.W.detail; F.W.detail = null; knPaint(F, 'detail'); if (D && D.back && D.back.isConnected) knFocus(F, D.back); }
function knCalDetailClick(F, el) {
  if (el.closest('[data-close]')) return knCalDetailClose(F);
  const h = el.closest('[data-kr]');
  if (!h) return;
  const id = Number(h.dataset.krId);
  if (h.dataset.kr === 'open-contact') { knCalDetailClose(F); return knCtOpen(F, id); }   // the contact's record (the Kontakte tab)
  if (h.dataset.kr === 'open-deal') { knCalDetailClose(F); return knRecOpen(F, id); }    // the deal's part, its timeline
}
// toggleCalendarDone (calendar.js:456-470): an activity's done flag; the calendar and the window show it
function knCalDetailChange(F, el) {
  if (el.dataset.kr !== 'cal-done' || !F.W.detail) return;
  const a = F.W.acts.find(x => `activity-${x.id}` === F.W.detail.uid);
  if (!a) return;
  a.completed = el.checked;
  if (knShows(F, 'calendar')) knPaintPage(F);
  knPaint(F, 'detail');
}
// ── the task drawer (detail-views.js:1178-1275 openTaskDrawer, ported as krTaskDrawer; its chrome is ui.drawer's,
// krDrawerWrap): the done box, the title (saved on blur, Enter; Escape puts it back), the fields saved on change with the
// app's toast, the description, the subtasks, delete with the app's question; it lies over the page in the detail layer ──
function knTkDrO(F, id) {
  const W = F.W, o = knTasksO(F);
  o.tasks = o.tasks.map(x => (x.id === id ? { ...x, subtasks: W.tasks.filter(s => s.parent_id === id).map(s => ({ ...s })) } : x));
  return Object.assign(o, { deals: W.deals.map(d => ({ id: d.id, title: knL(d.title), contact_id: d.contact_id })), contacts: W.contacts.map(c => ({ id: c.id, name: c.name })), taskFields: W.taskFields || [] });
}
function knTkDrOpen(F, id, back) {
  if (!F.W.tasks.find(x => x.id === id)) return;
  knMenuClose(F);
  F.W.detail = { kind: 'task', id, back: back || null };
  knPaint(F, 'detail');
  knFocus(F, '[data-kn-layer="detail"] .modal-head [data-close]');
}
function knTkDrClose(F) { const D = F.W.detail; F.W.detail = null; knPaint(F, 'detail'); if (D && D.back && D.back.isConnected) knFocus(F, D.back); }
function knTkDrRow(F) { return F.W.detail ? F.W.tasks.find(x => x.id === F.W.detail.id) : null; }
// the page behind follows (syncRow, dvRefreshTasks); the drawer is drawn again, the field that had focus keeps it
function knTkDrRepaint(F, drawer) {
  const a = document.activeElement, keep = drawer !== false && a && a.id && F.layers.detail.contains(a) ? a.id : null;
  if (drawer !== false) knPaint(F, 'detail');
  if (knShows(F, 'tasks') || knShows(F, 'calendar')) knPaintPage(F);
  if (keep) knFocus(F, `#${keep}`);
}
// save (detail-views.js:1214): the payload is the drawer's task, its due on the viewer's clock and zone, with the change
function knTkDrSave(F, patch, msg, drawer) {
  const id = F.W.detail.id, row = knTkDrRow(F), x = krTkDrTask(krTkCtx(knTkDrO(F, id)), id).x;
  Object.assign(row, { due_date: x.due_date ? krTkDvIso(x.due_date) : null, due_time: x.due_time || null, due_tz: x.due_tz }, patch);
  knTkDrRepaint(F, drawer);
  if (msg) knToast(F, msg);
}
function knTkDrSubAdd(F) {
  const W = F.W, id = W.detail.id, row = knTkDrRow(F), inp = knQ(F, `#${F.p}-tkd-sin`), v = inp ? inp.value.trim() : '';
  if (!v) { if (inp) inp.focus(); return; }
  const K = krTkCtx(knTkDrO(F, id));
  W.tasks.push({ id: ++W.seq, title: v, description: null, status: krTkDvFirstKey(K), priority: 'medium', due_date: null, due_time: null, due_tz: KN_ZONE, parent_id: id,
    project_id: row.project_id || null, list_id: row.list_id || null, assigned_to: null, deal_id: null, contact_id: null, custom_data: {} });
  knTkDrRepaint(F);
  knFocus(F, `#${F.p}-tkd-sin`);
}
const KN_TKDR_MSG = { status: 'dv_status_updated', priority: 'dv_priority_updated', assigned_to: 'dv_assignee_updated', due_date: 'dv_due_updated', due_time: 'dv_time_updated', description: 'dv_description_saved',
  project_id: 'tk_project_updated', list_id: 'dv_list_updated', deal_id: 'dv_deal_link_updated', contact_id: 'dv_contact_updated' };
KN_CONFIRM['task-drawer-delete'] = {
  html: F => krConfirm({ p: F.p + 'c', title: t('tk_delete_task_q'), message: t('dv_delete_task_msg'), confirmLabel: t('tk_delete_task'), danger: true }),
  done(F, C) {
    const W = F.W, id = C.ids[0];
    W.tasks = W.tasks.filter(x => x.id !== id && x.parent_id !== id);
    W.detail = null; knPaint(F, 'detail');
    if (knShows(F, 'tasks') || knShows(F, 'calendar')) knPaintPage(F);
    knToast(F, t('tk_deleted'));
  },
};
knLayerMod('detail', { on: F => !!F.W.detail && F.W.detail.kind === 'task',
  paint: F => { const d = krTaskDrawer(knTkDrO(F, F.W.detail.id), F.W.detail.id); return d ? knNotModal(krDrawerWrap({ p: F.p + 'v', title: d.title, width: d.width, body: d.body, footer: d.footer, cls: 'tk-drawer' })) : ''; },
  // after ui.drawer: the subtasks (paintSubs), the due note (dueNote) and the links (links), as the app fills them
  after(F, L) {
    const id = F.W.detail.id, o = knTkDrO(F, id), fid = `${F.p}-tkd`, q = s => L.querySelector(s), h = krTaskDrawerLinksHidden(o, id);
    const subs = q(`#${fid}-subs`), dl = q(`#${fid}-dl`), dea = q(`#${fid}-dea`), ca = q(`#${fid}-ca`);
    if (subs) subs.innerHTML = krTaskDrawerSubs(o, id);
    if (dl) dl.textContent = krTaskDrawerDueNote(o, id);
    if (dea) dea.hidden = h.dealHidden;
    if (ca) ca.hidden = h.contactHidden;
  },
  click(F, el) {
    const W = F.W, id = W.detail.id, row = knTkDrRow(F);
    if (!row || el.closest('[data-close]')) return knTkDrClose(F);
    const K = krTkCtx(knTkDrO(F, id));
    if (el.closest('[data-dtoggle]')) {
      const next = row.status === krTkDvDoneKey(K) ? krTkDvFirstKey(K) : krTkDvDoneKey(K);
      row.status = next; knTkDrRepaint(F);
      return knToast(F, next === krTkDvDoneKey(K) ? t('tk_completed') : t('tk_reopened'));
    }
    const op = el.closest('[data-open]');
    if (op) { const kind = op.dataset.open; knTkDrClose(F); if (kind === 'deal' && row.deal_id) return knRecOpen(F, row.deal_id); if (kind === 'contact' && row.contact_id) return knCtOpen(F, row.contact_id); return; }
    if (el.closest('[data-del]')) return knConfirmOpen(F, { kind: 'task-drawer-delete', ids: [id], back: el.closest('[data-del]') });
    const sd = el.closest('[data-subdel]');
    if (sd) { const sid = Number(sd.dataset.subdel); W.tasks = W.tasks.filter(x => x.id !== sid); knTkDrRepaint(F); knFocus(F, `#${F.p}-tkd-sin`); return knToast(F, t('dv_subtask_deleted')); }
    if (el.closest('[data-subadd]')) return knTkDrSubAdd(F);
  },
  change(F, el) {
    const W = F.W, id = W.detail.id, row = knTkDrRow(F);
    if (!row) return;
    const K = krTkCtx(knTkDrO(F, id));
    if (el.matches('[data-due-on]')) {
      if (el.checked) { const dd = krTkDvDefaultDue(K); return knTkDrSave(F, { due_date: dd.date, due_time: dd.time }, tf('dv_due_set', { d: krTkDvDue(K, dd.date, dd.time, K.tz) })); }
      return knTkDrSave(F, { due_date: null, due_time: null }, t('dv_due_removed'));
    }
    if (el.matches('[data-sub]')) {
      const s = W.tasks.find(x => x.id === Number(el.dataset.sub));
      if (s) { s.status = el.checked ? krTkDvDoneKey(K) : krTkDvFirstKey(K); knTkDrRepaint(F); knFocus(F, `[data-kn-layer="detail"] [data-sub="${s.id}"]`); }
      return;
    }
    if (!el.matches('[data-f]')) return;
    const k = el.dataset.f, v = el.value, patch = {};
    if (k.startsWith('cf:')) patch.custom_data = { ...(row.custom_data || {}), [k.slice(3)]: v };
    else if (k === 'assigned_to' || k === 'deal_id' || k === 'contact_id' || k === 'project_id' || k === 'list_id') patch[k] = v ? +v : null;
    else if (k === 'description') patch.description = v.trim();
    else patch[k] = v || null;
    if (k === 'due_date' && !v) patch.due_time = null;   // a time without a date is useless
    if (k === 'project_id') patch.list_id = ((K.projects.find(p => p.id === patch.project_id) || {}).lists || [])[0]?.id || null;
    if (k === 'deal_id' && patch.deal_id && !row.contact_id) { const d = K.deals.find(y => y.id === patch.deal_id); if (d && d.contact_id) patch.contact_id = d.contact_id; }
    knTkDrSave(F, patch, t(KN_TKDR_MSG[k] || 'msg_saved'), k === 'description' ? false : undefined);
  },
  input(F, el) { if (el.id === `${F.p}-tkd-t`) { el.removeAttribute('aria-invalid'); const er = knQ(F, `#${F.p}-tkd-te`); if (er) er.hidden = true; } },
  key(F, e) {
    const el = e.target;
    if (el.id === `${F.p}-tkd-t`) {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { e.stopPropagation(); el.value = knTkDrRow(F).title; el.blur(); }
      return;
    }
    if (el.id === `${F.p}-tkd-sin` && e.key === 'Enter') { e.preventDefault(); knTkDrSubAdd(F); }
  },
  // the title is saved when it loses focus; an empty one is put back and says why
  blur(F, el) {
    const row = knTkDrRow(F);
    if (!row || el.id !== `${F.p}-tkd-t`) return;
    const v = el.value.trim();
    if (!v) { el.value = row.title; el.setAttribute('aria-invalid', 'true'); const er = knQ(F, `#${F.p}-tkd-te`); if (er) { er.textContent = t('dv_err_title_empty'); er.hidden = false; } return; }
    if (v !== row.title) knTkDrSave(F, { title: v }, t('dv_title_saved'), false);
  },
  esc: F => { knTkDrClose(F); return true; }, scrim: knTkDrClose });
knLayerMod('detail', { on: F => !!F.W.detail && F.W.detail.kind !== 'task',
  paint: F => { const d = krCalEventDetail(knCalO(F), F.W.detail.uid); return d ? knNotModal(krModalWrap({ p: F.p + 'v', title: d.title, size: d.size, body: d.body, footer: d.footer })) : ''; },
  click: knCalDetailClick, change: knCalDetailChange, esc: F => { knCalDetailClose(F); return true; }, scrim: knCalDetailClose });
knMod('calendar', { screen: F => krCalendarPage(knCalO(F)), click: knCalClick });

/* ═══ flows: Team chat (chat.js), Analytics (analytics.js), Settings (settings.js, objects.js) ═════════════════ */
// Owner: the day agent (part 6, the Team-Chat, Analysen and Einstellungen tabs).

// ── team chat: the echo of new_message is what shows a sent line ──
function knChatAppend(F, msg) {
  const el = knId(`${F.p}-chat-page-messages`);
  if (!el) return;
  const empty = el.querySelector('.chat-empty');
  if (empty) empty.remove();
  const now = new Date().toISOString();
  el.insertAdjacentHTML('beforeend', krChatMessages(knL([msg]), { me: KN_ME, now, lastDate: krChatLastDate(el, now) }));
  knLater(F, 50, () => { el.scrollTop = el.scrollHeight; });
}
// chat.js:367 sendChatMessageFromPage: the trimmed line goes out and the input empties; server.js:297 chatMessageText
// drops a line over 2000 characters without a word, so nothing comes back for it. The first line a visitor sends gets
// one reply from a teammate, one that fits any first line (round 13): "Gesehen, ich melde mich gleich."
function knChatSend(F) {
  const W = F.W, input = knId(`${F.p}-chat-page-input`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  if (text.length > 2000) return;
  knLater(F, 60, () => {
    const msg = { id: ++W.seq, user_id: KN_ME.id, user_name: KN_ME.name, content: text, created_at: knNow() };
    W.chat.push(msg);
    if (knShows(F, 'chat')) knChatAppend(F, msg);
  });
  if (!W.replied) {
    W.replied = true;
    knLater(F, 1900, () => { const msg = { id: ++W.seq, user_id: 2, user_name: 'Tim Krüger', content: 'Gesehen, ich melde mich gleich.', created_at: knNow() }; W.chat.push(msg); if (knShows(F, 'chat')) knChatAppend(F, msg); });
  }
}
function knChatClick(F, el) {
  const W = F.W, k = (el.closest('[data-kr]') || {}).dataset?.kr;
  if (k === 'chat-send') return knChatSend(F);
  if (k === 'chat-refresh') {
    const box = knId(`${F.p}-chat-page-messages`);
    if (box) box.innerHTML = `<div class="chat-empty">${esc(t('chat_loading'))}</div>`;
    knLater(F, 300, () => { if (knShows(F, 'chat')) { knPaintPage(F); const b = knId(`${F.p}-chat-page-messages`); if (b) b.scrollTop = b.scrollHeight; } });
  }
}
knMod('chat', {
  screen: F => krChatPage(knL({ p: F.p, now: new Date().toISOString(), me: KN_ME, online: KN_ONLINE, messages: F.W.chat })),
  after: F => { const b = knId(`${F.p}-chat-page-messages`); if (b) b.scrollTop = b.scrollHeight; },   // loadChatPage: scrollChatPageBottom
  click: knChatClick,
  key: (F, e) => { if (e.target.id === `${F.p}-chat-page-input` && e.key === 'Enter') { e.preventDefault(); knChatSend(F); } },
});

// ── analytics: the period switch reloads the cards from the same deals ──
function knAnClick(F, el) {
  const W = F.W, per = el.closest('[data-period]'), tb = el.closest('[data-table]');
  // analytics.js:83-87 toggleAnalyticsTable: a card as a chart or a table
  if (tb) { const id = tb.dataset.table; if (W.anTables.has(id)) W.anTables.delete(id); else W.anTables.add(id); return knPaintPage(F); }
  if (!per) return;
  const n = Number(per.dataset.period);
  if (n === W.anMonths) return;
  F.root.querySelectorAll('[data-period]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.period) === n)));
  W.anMonths = n;
  knLater(F, 260, () => {   // loadAnalytics: the summary for the new window, then the sub line and the band
    if (!knShows(F, 'analytics')) return;
    knPaintPage(F);
    knFlash(F, `#${F.p}-analytics-period`);
    knFlash(F, '[data-stat-id="new_deals"] .kpi-value');   // the one card that counts the window (the others are snapshots)
  });
}
// the band, then Deals nach Zuständigkeit (analytics.js renderDealsByOwner), the card a head of sales reads
knMod('analytics', { screen: F => { const s = knAnSummary(F.W, F.W.anMonths);
  return krAnalyticsPage({ p: F.p, now: new Date(), months: F.W.anMonths, summary: s, config: KR_AN_FOUR_CELLS }) + `<div class="kn-an-owner">${krAnOwnerCard({ summary: s, months: F.W.anMonths, tables: F.W.anTables })}</div>`; }, click: knAnClick });

// ── settings: the tabs the preview has, the names, the language, the look ──
function knSetClick(F, el) {
  const W = F.W, k = (el.closest('[data-kr]') || {}).dataset?.kr;
  const tab = el.closest('.settings-tab[data-tab]');
  if (tab) { if (['workspace', 'preferences', 'contacts', 'objects'].includes(tab.dataset.tab)) { W.setTab = tab.dataset.tab; knPaintPage(F); } else knOff(F); return; }
  if (k === 'save-object-name') return knSaveName(F, 'object');
  if (k === 'save-supplier-name') return knSaveName(F, 'supplier');
  if (k === 'save-workspace-name') return knSaveName(F, 'workspace');
}
// objects.js / settings.js: the trimmed name saved, every label renamed, then "Gespeichert" for 2.5 s
function knSaveName(F, kind, value) {
  const W = F.W, input = knId(`${F.p}-${kind}-name-input`);
  const v = String(value != null ? value : input ? input.value : '').trim();
  if (!v) return;
  if (kind === 'object') W.objectName = v; else if (kind === 'supplier') W.supplierName = v; else W.wsName = v;
  knPaintPage(F);
  const msg = knId(`${F.p}-${kind}-name-msg`);
  if (msg) { msg.textContent = t('msg_saved'); msg.className = 'workspace-name-msg success'; knLater(F, 2500, () => msg.classList.add('hidden')); }
  if (kind === 'object') knFlash(F, `#${F.p}-settings-tab-objects`);   // updateObjectsNav: the rail's tab carries the new name
  if (F.part.saved) F.part.saved(F);
}
knMod('settings', {
  screen: F => { const W = F.W; return krSettingsPage(knL({ p: F.p, tab: W.setTab, role: 'owner', workspaceName: W.wsName, objectName: W.objectName, supplierName: W.supplierName,
    fields: KN_FIELDS, objectFields: KN_OBJ_FIELDS, lang: currentLang, dark: knDark })); },
  click: knSetClick,
  change: (F, el) => {
    if (el.name === 'language' && el.checked) return knSetLang(el.value, true);
    if (el.id === `${F.p}-pref-dark-toggle`) return knSetTheme(el.checked);
  },
});

/* ═══ part 1 · Anfrage (the hero): an enquiry arrives and becomes a deal in the first stage ═══════════════════
   The CRM behind it (reviewed before building):
     routes/integrations.js 172-300   POST /receive/:key: the contact (a known email updates it), the deal in the
                                      first stage with no value and no owner, a webhook_logs row with `captured`
     public/js/integrations.js 508-543 loadIntgLogs: the Letzte Leads card, loaded again by Aktualisieren
     public/js/deals.js 373-470       renderDealsBoard, dealCard, openDealKebab, moveDealToStage (toast, Rückgängig)
   Pieces: the board (krDealsPage, picked to #a-deals-board), the main piece, and beside it the narrower Letzte Leads card
   (krIntegrationsPage, picked to its .settings-card). A source button beside the frame is the form or automation posting: the entry shows on
   top of Letzte Leads and the card in Neu. The one compression: the app shows a new deal on the board's next load;
   here the source click stands for the post and the look that follows. A card opens its deal in the deal's part
   (knRouteDeal); the kebab, the drag and the column's + work as on the board. Spine: step 1 on the first enquiry.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
knPart({
  // beside its text on wide screens: the app at 1:1 in the column (never zoomed above it), the board scrolling sideways;
  // its narrow layout (the board, Letzte Leads under it) only below 600 px. On phones no scroll inside the page's
  // scroll: the board 360 px (its columns scroll, as the app's do), Letzte Leads as tall as its entries, the frame as
  // tall as both: measured once painted (knAnfrageFit), estimated before (knAnfrageLogsH; 888 for the two first leads).
  // Round 12: the board crop on phones 280 px (304 with the gap)
  name: 'anfrage', p: 'a', w: 600, h: 470, hm: 704, maxS: 1, narrowBelow: 600, step: 1,
  size(F) { return { w: 600, h: 470, hm: Math.ceil((264 + (F.logsH || knAnfrageLogsH(F.W))) / 8) * 8 }; },   // (round 15) phones: 240 px of board
  page: 'deals', pages: ['deals', 'integrations'], home: ['deals', 'integrations'],
  // both pieces loaded, as two open pages would be; the board keeps the deals it loaded (boardIds) until "Deals neu
  // laden": in the app a new lead shows on Deals only when the board loads again (auth.js:543; the receive route pushes
  // nothing), while Letzte Leads is what the visitor is looking at
  // (round 18) a result on arrival: Jonas Becker's enquiry from the website form came in two hours ago (as in step 2,
  // knJonas(W, 12, [0, 120]): before his own booking 50 minutes ago), on the board in Neu and on top of Letzte Leads (a
  // true state of the sample, not a change); the form sends the next person
  world(W) { knLeadArrive(W, 'form', 0, 0, 120); W.used.form = 1; W.logsShown = W.logs.slice(); W.boardIds = new Set(W.deals.map(d => d.id)); },
  view(F) {
    const W = F.W, p = F.p;
    const logs = knPick(krIntegrationsPage(knL({ p, logs: W.logsShown || [] })), '.settings-card');
    const o = knDealsO(F);
    if (W.boardIds) o.deals = o.deals.filter(d => W.boardIds.has(d.id));
    const board = knPick(krDealsPage(knL(o)), `#${p}-deals-board`);
    return `<div class="kn-cuts-a">${knPiece('deals', board, 'board')}${knPiece('integrations', logs, 'logs')}</div>`;   // the board first, Letzte Leads beside it
  },
  afterPage(F) { knAnfrageEdge(F); knAnfrageFit(F); },
  reset(F) {
    F.logsH = 0; knScale(F); knAnfrageFit(F); knAnfragePending(F);
    for (const id of ['kn-anfrage-dup', 'kn-anfrage-hint']) { const el = knId(id); if (el) el.hidden = true; }
    const live = knId('kn-anfrage-live'); if (live) live.textContent = '';
  },
  scroll(F, e) { if (e.target.id === `${F.p}-deals-board`) knAnfrageEdge(F); },
  wire() {
    document.querySelectorAll('.kn-src[data-src]').forEach(b => b.addEventListener('click', () => knAnfrageSend(b.dataset.src, b)));
    knResetButton('kn-anfrage-reset', 'anfrage', () => document.querySelectorAll('.kn-src[data-src]').forEach(b => knAnfrageRest(b, false)));
    const re = knId('kn-anfrage-reload');
    if (re) re.addEventListener('click', knAnfrageReload);
    // (round 14) the known address's contact, where the team sees it: Kontakte in the day, Sabine Wolf open
    const dup = knId('kn-anfrage-dup-go');
    if (dup) dup.addEventListener('click', e => { e.preventDefault(); if (KN.anfrage) knRouteContact(KN.anfrage, 62); });
  },
});
// Letzte Leads' height on a phone before it is painted, from the app's rules (style.css:1300-1311, 1784-1812): the
// card's header, hint and padding about 152 px; an entry about 104 px plus 23 px a captured field; 12 px between
function knAnfrageLogsH(W) {
  const logs = ((W && W.logsShown) || []).slice(0, 1);   // (round 15) phones show the newest entry only (part-anfrage.css)
  return 152 + logs.reduce((a, l) => a + 104 + 23 * Object.keys(l.captured || {}).length, 0);
}
// once painted on a phone, the card's real height sets the frame's (a browser lays it out; the estimate stays otherwise)
function knAnfrageFit(F) {
  const el = knQ(F, '.kn-piece-logs'), h = F.host.classList.contains('kn-narrow') && el ? el.offsetHeight : 0;
  if (h && h !== F.logsH) { F.logsH = h; knScale(F); }
}
// the board fades out at its right edge while more stages follow, and stops fading once it is scrolled to the end
function knAnfrageEdge(F) {
  const b = knId(`${F.p}-deals-board`), piece = b && b.closest('.kn-piece-board');
  if (piece) piece.classList.toggle('is-end', b.scrollLeft + b.clientWidth >= b.scrollWidth - 2);
}
// a source whose three sample people have all arrived rests, and says why in its tooltip (the line under the buttons
// went with the preview's other side notes); Von vorn wakes it
function knAnfrageRest(btn, rest) {
  btn.disabled = rest;
  if (rest) { btn.dataset.knTitle = 'kn_src_why'; btn.title = knWord('kn_src_why'); }
  else { delete btn.dataset.knTitle; btn.removeAttribute('title'); }
  // (round 27) and a visible line under the buttons while any source rests (a tooltip alone reaches no touch screen)
  const line = knId('kn-anfrage-rest');
  if (line) line.hidden = !document.querySelector('.kn-src:disabled');
}
// a source posts the next of its three people: Letzte Leads and the board show what the server made of it
function knAnfrageSend(src, btn) {
  const F = KN.anfrage;
  if (!F || btn.disabled) return;
  const W = F.W, i = W.used[src];
  if (i >= KN_LEADS[src].length) return;
  W.used[src] = i + 1;
  knAnfrageRest(btn, W.used[src] >= KN_LEADS[src].length);
  knQuiet(F);
  const known = W.contacts.some(c => c.email === KN_LEADS[src][i].email);   // (round 14) an address already in the CRM
  const d = knLeadArrive(W, src, 0, i);
  knDayLead(src, i);   // (round 14) the same delivery in the day's world: the contact is in Kontakte there too
  W.arrived = true;
  W.logsShown = W.logs.slice();
  F.logsH = 0;   // measured again once painted
  knScale(F);
  knPaintPage(F);
  const list = knId(`${F.p}-intg-logs`);
  if (list && list.firstElementChild) { const piece = list.closest('.kn-piece'); if (piece) piece.scrollTop = 0; knFlash(F, list.firstElementChild); }
  const b = knId('kn-anfrage-reload'), first = b && b.hidden;
  knAnfragePending(F);
  if (first && !b.hidden) knFlash(F, b);   // it appears with the first lead: ringed once (still under reduced motion)
  const c = knContact(W, d.contact_id), dup = knId('kn-anfrage-dup'), live = knId('kn-anfrage-live');
  if (dup && known && c.id === 62) dup.hidden = false;
  if (live) live.textContent = known && c.id === 62 ? knWord('kn_a_dup') : knWord('kn_a_live').replace('{name}', c.name);
  // (round 22) the Sabine Wolf demo as a second hint once a lead is in, until her enquiry has shown it
  const hint = knId('kn-anfrage-hint');
  if (hint) hint.hidden = (known && c.id === 62) || W.used.make >= 2;
  knStep(1);
}
// (round 14) "Board neu laden": unseen until a lead has arrived, then there, resting while the board holds every deal;
// the line beside it says where the deal will be, while one waits
function knAnfragePending(F) {
  const b = knId('kn-anfrage-reload'), next = knId('kn-anfrage-next');
  if (!b || !F) return;
  const waiting = F.W.deals.some(d => !F.W.boardIds.has(d.id));
  b.hidden = !F.W.arrived;
  b.disabled = !waiting;
  if (next) next.hidden = !waiting;
}
// the page's stand-in for opening Deals again: the board loads what the server holds now, the new cards marked
function knAnfrageReload() {
  const F = KN.anfrage;
  if (!F) return;
  const fresh = F.W.deals.filter(d => !F.W.boardIds.has(d.id)).map(d => d.id);
  F.W.boardIds = new Set(F.W.deals.map(d => d.id));
  knPaintPage(F);
  const board = knId(`${F.p}-deals-board`);
  if (board) board.scrollLeft = 0;   // the first stage, where they landed
  for (const id of fresh) { const card = knQ(F, `.dcard[data-id="${id}"]`); if (card) { card.classList.add('kn-new'); knFlash(F, card); } }
  knAnfragePending(F);
}

/* ═══ part 2 · Termin: the meeting booked on the deal, with Cal.com's open times and the clash check ═════════
   The CRM behind it (reviewed before building; notes in review-record.md):
     public/js/detail-views.js 267-417   openCalcomBooking: the month grid (:281 opens on this month, :362 one read for
                                         it, the first free day preselected), the time (:399 a day click focuses it), the
                                         clash check (:373-394), the place, the Notetaker box for Google Meet only and its
                                         health check (:340, :353), Buchen (:402-416) with the toast and the Notetaker's
     public/js/detail-views.js 170-181   answer (:261 dvNotetakerToast); dvCalcomStatus, dvBookButton
     routes/integrations.js 914, 937     GET /calcom/slots, POST /calcom/book: the entry written at once (Cal.com's title,
                                         the Meet link when known), the Notetaker request, the assignee told
     routes/calendar.js 44               the rows the clash check reads
     public/style.css 1117-1142          .cal-book*
   Piece: Jonas Becker's booking dialog over his record, which is cropped to its title row (with "Termin buchen") and
   its timeline, and dimmed while the dialog is open. Buchen closes the dialog as the app does: the toasts, the meeting
   on top of the timeline; the record's own "Termin buchen" opens the dialog again. Esc, Abbrechen and the scrim close
   it, as in the app. Spine: step 2 on a booking.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
knPart({
  // (round 15) the dialog's own width (part of page.css: 600 px), the desktop layout from 600 px
  name: 'termin', p: 't', w: 600, h: 620, hm: 640, narrowBelow: 600, step: 2,
  // (round 24) phones: the frame grows to the dialog's height (knTerminFit), so nothing scrolls inside it; (round 25) on
  // every width
  size(F) { return { w: 600, h: F.fitH || 620, hm: F.fitH || 640 }; },
  fit: knTerminFit,
  page: 'deals', pages: [], keep: ['record'],
  world(W) { knJonas(W, 12); knTerminSeed(W); W.record = knRecState(120); },   // the day his enquiry came in
  view: () => '',   // the record layer is the piece, the dialog is over it
  after(F) { knTerminOpen(F); knTerminSay(F); },
  // the dialog is open from the start, in the middle of a page: core's knDocKey holds Tab only in a dialog the visitor
  // opened, so Tab moves on through the page here; reopened with "Termin buchen" it holds Tab as the app does
  // a language switch paints the dialog again (at its top): the time comes back into view
  sync(F) { if (F.W.booking) knBookReveal(F, `#${F.p}b-cal-book-time`); },
  booked(F) { knStep(2); knTerminSay(F); knNotizFollow(); },
  reset(F) { const nt = knId('kn-termin-nt'); if (nt) nt.hidden = true; knTerminSay(F); knNotizFollow(); },
  wire() {
    knResetButton('kn-termin-reset', 'termin');
  },
});
// a time picked without Notetaker: the line beside the dialog says the note in step 3 needs it, and the checkbox is
// ringed once (the page's flash; nothing is ticked for the visitor). Ticked, the line goes
// (round 24) phones: the frame as tall as the booking dialog (its body let out of its scroller, part-termin.css), measured
// once painted
function knTerminFit(F) {
  const m = knQ(F, '[data-kn-layer="booking"] .modal') || knQ(F, '[data-kn-layer="record"] .dd-modal'), h = m ? Math.ceil(m.offsetTop + m.offsetHeight) : 0;
  if (h && h !== F.fitH) { F.fitH = h; knScale(F); }
}
function knTerminNudge(F) {
  const nt = knId('kn-termin-nt'), B = F.W.booking && F.W.booking.B;
  if (!nt || F.kind !== 'termin' || !B) return;
  const want = !!B.picked && !B.record && B.nt === 'ok';
  const was = nt.hidden;
  nt.hidden = !want;
  if (want && was) { const box = knQ(F, `#${F.p}b-cal-book-record`), row = box && (box.closest('label') || box); if (row) { knBookReveal(F, `#${F.p}b-cal-book-record`, true); knFlash(F, row); } }   // (round 24) brought into view inside the dialog
}
// (round 25) once booked, the instruction gives way to what the booking did (as step 3's line follows its note)
function knTerminSay(F) {
  const say = knId('kn-termin-do');
  if (!say || !F || !F.W) return;
  say.dataset.kn = F.W.acts.some(a => a.type === 'meeting' && a.source === 'calcom' && a.contact_id === 70 && !a.kn_seed && !a.cancelled_at) ? 'kn_t_done' : 'kn_t_do';
  say.textContent = knWord(say.dataset.kn);
}
// a booking the visitor made in step 2 (the sample's own, kn_seed, is not one: step 3 keeps its waiting note)
function knTerminBooked(W) { return W.acts.some(a => a.type === 'meeting' && a.source === 'calcom' && a.contact_id === 70 && !a.kn_seed); }
// (round 24 review) his own booking's time, the same in every part that shows it. (round 25) Tag 1's next working day
// at 09:30, its first free time: his Erstgespräch comes before any Beratung the rep books after it (step 3's at 14:00)
function knJonasOwnAt(W) { void W; return knAt(knDays1()[0], '09:30'); }
// (round 18) a result on arrival: Jonas Becker booked himself through the Cal.com link 50 minutes ago (the real "von
// selbst" case), on his contact as the signed webhook writes it (POST /calcom/receive/:token, routes/integrations.js:806-901: on his contact, owned by the host, no Notetaker), at
// knJonasOwnAt, which knMeetingAdd takes out of the free times; the rep's own booking with the 11:00 clash is the thing
// to try
function knTerminSeed(W) {
  const at = knJonasOwnAt(W);
  const a = knMeetingAdd(W, 120, at, KN_MEET_SELF, false, knT1(W, 50));
  Object.assign(a, { deal_id: null, bound_deal_id: null, created_by: KN_CAL.host_user_id, kn_seed: true });
}
// step 3 follows step 2: while its call has not been ended, it starts again from what step 2 now holds
function knNotizFollow() {
  knDayFollow();   // (round 14) the day's Kalender shows step 2's booking too
  const N = KN.notiz;
  // a note the visitor's own call brought stays; the sample's own note (round 13: in from the start) gives way
  if (!N || (!N.W.own && N.W.acts.some(a => a.source === 'notetaker'))) return;
  KN_NOTIZ_OWN = false;
  knReset(N);
  knStepUndo(3);   // (round 24) its note went with the reset: step 3 is no longer marked
}
// the dialog, open with the month's free times; on a month's last days the first free day lies in the next month,
// where the app would wait for the arrow: the dialog opens there
function knTerminOpen(F) {
  // (round 19) the rep books a Beratung (60 min): his own booking through the link is the Erstgespräch already in.
  // (round 20) the type is set before the first paint: it was set after it, so the select showed the Erstgespräch
  // until the first pick repainted the dialog
  knBookOpen(F, true, KN_CAL.event_types[1].id);
  const W = F.W, B = W.booking.B;
  if (B.date || !W.days.length) return;
  B.month = W.days[0].slice(0, 7);
  knBookLoaded(W);
  knPaint(F, 'booking');
  knBookReveal(F, `#${F.p}b-cal-book-time`);
}

/* ═══ part 3 · Notiz: after the call, the Notetaker's note is on the deal ════════════════════════════════════
   The CRM behind it (reviewed before building; notes in review-record.md):
     routes/notetaker.js 40-94               the webhook (recording.completed): one note per recording, no author,
                                             source 'notetaker'; the booker told with the bell (notetaker_done, title =
                                             the meeting's first line, body = the note's title, the deal as its entity)
     utils/notetaker.js 203-238 resultNote   the note: title, summary, then Wichtige Punkte, Entscheidungen, Aufgaben
                                             ("task (owner), bis due"), Offene Fragen, each "• " a line, parts by a blank line
     notifications.js notifyUser             one person, the actor skipped
     routes/notifications.js 37-49           the newest 50 and the unread count
     public/js/notifications.js 77-112       the bell's rows; onNotifClick marks it read, closes the panel, opens the deal
     public/js/detail-views.js 612-634, 754  the timeline (signed "von Notetaker", routes/activities.js:139), the
                                             composer (Strg+Enter, "{Typ} erfasst"), "Nur dieser Deal"
     public/style.css 2204-2240, 583-586     .notif-*, .tl-*
   Piece: the bell's panel beside the record's activity column. "Gespräch beenden" beside the frame is the call ending
   and the Notetaker delivering: its notification arrives in the panel (nothing arrives without it). A click on the
   row (or Enter on it) marks it read and opens the deal's timeline with the note on top. The panel is the piece, so
   it stays open where the app would close it. The composer works. Spine: step 3 when the note is shown.
   The deal's home (deal: true, since the redo's fix round folded part 4 Angebot away): a deal opened in any other part
   leads here, and the timeline shows that deal, where everything about it lands.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
knPart({
  // (round 13) cropped to the bell and the note's timeline: 560 high on wide screens, below a 768 px laptop screen; the
  // app's narrow layout only on phones (the record window scrolls, as the app's does)
  name: 'notiz', p: 'n', w: 540, h: 560, hm: 660, narrowBelow: 480, maxS: 1.3, step: 3,
  // (round 14) phones: the record window grows to its content (part-notiz.css lets its body out of its scroller), the
  // frame with it, so nothing scrolls inside the page's scroll; 660 until it is measured
  // (round 24) 760 high once the note is open (the row clicked), so it reads without a scroll inside the record
  size(F) { return { w: 540, h: knNotizOpen(F.W) ? 760 : 560, hm: F.fitH || 660 }; },
  fit: knNotizFit,
  page: 'deals', pages: [], keep: ['record', 'bell'], deal: true,
  // (round 25) step 3's clock: ten minutes after its meeting ended (the sample's Beratung on Tag 1's next working day,
  // 14:00 to 15:00, or the meeting step 2's visitor booked), so the bookings made on Tag 1 read as made then
  clock() {
    const m = knNotizMeet(), ty = m ? KN_CAL.event_types.find(x => x.id === m.calcom_event_type_id) || KN_INTRO : KN_CAL.event_types[1];
    return Date.parse(m ? knAt(m.event_date, m.event_time) : KN_NOTIZ_AT()) + (ty.lengthInMinutes + 10) * 60000 - KN_DATE.now();
  },
  // a deal opened elsewhere (a card's jump). (round 25) Jonas Becker's keeps this step's story (his meetings and the
  // note: knRouteDeal carries nothing for him); "Zurück" brings his record back as it was (back)
  // (round 25 review) a jump keeps the note behind its unread bell row, as on arrival, so the line stays true
  showDeal(T, id) {
    if (T.W.record && T.W.record.id === 120 && id !== 120 && !T.W.recordWas) T.W.recordWas = T.W.record;
    T.W.record = knRecState(id);
    const note = T.W.acts.find(a => a.source === 'notetaker' && a.deal_id === id);
    if (note && T.W.bell.items.some(n => n.entity_type === 'deal' && n.entity_id === id && !n.read)) T.W.record.stale = [note.id];
    knPaint(T, 'record'); knPaintBell(T); knNotizRows(T); knNotizSync(T);
  },
  // (round 25 review) before a jump: from a later step (from), this step's own story and clock are kept aside and the
  // step shows the deal on that step's clock; from an earlier one (null), a story kept aside comes back first
  story(T, from) {
    const W = T.W;
    if (from && !W.storyWas) W.storyWas = { shift: W.shift, record: W.record, seq: W.seq, ...JSON.parse(JSON.stringify({ deals: W.deals, contacts: W.contacts, acts: W.acts, tasks: W.tasks, bell: W.bell })) };
    else if (!from) return knNotizStory(T);
    if (from) W.shift = from.W.shift;
  },
  back(T) {
    const W = T.W, kept = !!W.storyWas, other = !!W.record && W.record.id !== 120;
    if (kept) knNotizStory(T);
    else if (other) { W.record = W.recordWas || knRecState(120); W.recordWas = null; }
    if (kept || other) { knPaint(T, 'record'); knPaintBell(T); knNotizRows(T); knNotizSync(T); }
  },
  // (round 25) the bell shows only what belongs to the deal shown: another deal (no note) leaves it empty
  bellItems(F) { const R = F.W.record; return F.W.bell.items.filter(n => !R || n.entity_type !== 'deal' || n.entity_id === R.id); },
  // yesterday's call back, the meeting booked with Notetaker right after it, for half an hour ago; the bell has
  // nothing new yet
  // the sample's own meeting, or, once the visitor has booked one in step 2, that booking (its type, its Meet link,
  // Notetaker on or off) with Jonas Becker's history as step 2 has it (knCarry)
  // (step 3's own "Von vorn" sets KN_NOTIZ_OWN: back to the sample's own Notetaker meeting, never a dead end; step 2's
  // next booking clears it again, knNotizFollow)
  // (round 13) the sample's own meeting is over and its note delivered: the bell holds the unread row, and the deal's
  // timeline, open from before, does not show the note until the row opens the deal again (the app has no live
  // update). One click is the gain. A meeting the visitor booked in step 2 still waits for "Gespräch beenden".
  world(W) {
    knRecMet(W);
    W.own = !knNotizMeet();
    if (!W.own) knCarry(KN.termin.W, W, 120, null);   // (round 25) its times as booked: this step's clock follows the meeting
    W.record = knRecState(120);
    W.bell.open = true;
    const note = W.own ? knNoteArrive(W) : null;
    if (note) W.record.stale = [note.id];
  },
  after(F) { knNotizSync(F); },
  view(F) { return knPiece('bell', krBellPanel({ p: F.p, items: knL(F.part.bellItems(F)), open: true }), 'bell'); },
  afterPage(F) { knNotizRows(F); },
  click(F, el) {
    if (el.closest('[data-kr="notif-toggle"]')) return true;   // the panel is the piece: it stays open
    if (!el.closest(`#${F.p}-notif-panel`)) return false;
    knBellClick(F, el);
    knNotizRows(F);
    knScale(F);   // (round 24) the frame grows with the opened note
    return true;
  },
  // a row is the app's clickable div; here it also takes the keyboard (Enter or Space opens it)
  key(F, e) {
    const row = e.target.closest && e.target.closest('.notif-item[data-kr="notif-open"]');
    if (!row || (e.key !== 'Enter' && e.key !== ' ')) return false;
    e.preventDefault();
    row.click();
    const panel = knQ(F, '[data-kn-layer="record"] .dd-panel');
    if (panel) panel.focus({ preventScroll: true });
    return true;
  },
  // the notification's row: the deal's timeline as it is now, the note on top
  notif(F, n) {
    if (n.entity_type !== 'deal') return;
    F.W.record = knRecState(n.entity_id);
    knPaint(F, 'record');
    const note = F.W.acts.find(a => a.source === 'notetaker' && a.deal_id === n.entity_id);
    if (note) knRecArrived(F, note.id, 'start');
    knStep(3);
    knNotizSync(F);
  },
  reset(F) { const live = knId('kn-notiz-live'); if (live) live.textContent = ''; knNotizSync(F); },
  wire() {
    const b = knId('kn-notiz-end'), again = knId('kn-notiz-rebook'), own = knId('kn-notiz-reset');
    if (b) b.addEventListener('click', () => knNotizEnd(b));
    if (again) again.addEventListener('click', knNotizRebook);
    if (own) own.addEventListener('click', () => { KN_NOTIZ_OWN = true; if (KN.notiz) knReset(KN.notiz); });
  },
});
let KN_NOTIZ_OWN = false;
// (round 25 review) step 3's own story and clock back, as they were before a later step's deal came in
function knNotizStory(T) {
  const W = T.W, S = W.storyWas;
  if (!S) return;
  Object.assign(W, { shift: S.shift, record: W.recordWas || S.record, seq: Math.max(W.seq, S.seq), deals: S.deals, contacts: S.contacts, acts: S.acts, tasks: S.tasks, bell: S.bell, storyWas: null, recordWas: null });
}
// the sample's Beratung: Tag 1's next working day at 14:00, after his own Erstgespräch at 09:30 (knJonasOwnAt)
const KN_NOTIZ_AT = () => knAt(knDays1()[0], '14:00');
// the meeting step 3 follows: the newest one the visitor booked in step 2, unless step 3's own "Von vorn" asked for the
// sample's own (KN_NOTIZ_OWN)
function knNotizMeet() {
  const T = KN.termin;
  return !KN_NOTIZ_OWN && T && T.W ? T.W.acts.find(a => a.type === 'meeting' && a.source === 'calcom' && a.contact_id === 70 && !a.kn_seed) || null : null;
}
// what "Gespräch beenden" can do for the deal shown: only Jonas Becker's meeting booked with Notetaker brings a note
// (knNoteArrive). Otherwise the button says why it rests ("Kein Termin mit Notetaker"), the line under it says it in
// full, and for Jonas Becker the way forward: step 2, the dialog open with "Mit Notetaker aufzeichnen" ticked
function knNotizCan(F) {
  const W = F.W, id = W.record && W.record.id;
  const his = a => a.type === 'meeting' && a.source === 'calcom' && !a.cancelled_at && (a.deal_id === 120 || (a.deal_id == null && a.contact_id === 70));
  const m = W.acts.find(a => his(a) && a.record) || W.acts.find(his);   // (round 24) the meeting with Notetaker first
  return { jonas: id === 120, rec: id === 120 && !!(m && m.record), done: W.acts.some(a => a.source === 'notetaker' && a.deal_id === 120) };
}
function knNotizSync(F) {
  const b = knId('kn-notiz-end'), why = knId('kn-notiz-why'), again = knId('kn-notiz-rebook'), say = knId('kn-notiz-do');
  if (!F || !b) return;
  const c = knNotizCan(F);
  // the sample's own note is in already: no call to end, the one line says to open the row. (round 25) Without a meeting
  // booked with Notetaker the line under it says why, and the resting button goes
  b.hidden = !!F.W.own || !(c.rec || c.done);
  if (say) {
    say.dataset.kn = F.W.own || c.done ? 'kn_n_do_own' : 'kn_n_do';
    say.textContent = knWord(say.dataset.kn);
    say.hidden = !c.jonas || (!c.rec && !c.done);   // (round 15) no Notetaker booking: no instruction to end a call; (round 21) another deal shown (a card's jump): no line about Jonas Becker's note
  }
  b.disabled = !c.rec || c.done;
  b.dataset.kn = c.rec || c.done ? 'kn_m_end' : 'kn_n_off';   // (round 22) „Gespräch ist vorbei“: the one click stands for the call ending
  b.textContent = knWord(b.dataset.kn);
  if (why) why.hidden = c.rec || c.done;
  if (again) again.hidden = !c.jonas || c.rec || c.done;
}
// the way forward from "Keine Notiz": step 2 starts over for Jonas Becker with the dialog open and Notetaker ticked;
// step 3 follows it (its own sample until the new booking), and the way back leads here
function knNotizRebook() {
  const T = KN.termin, N = KN.notiz;
  if (!T || !N) return;
  knReset(T);
  if (!T.W.booking) knBookOpen(T, true);
  if (T.W.booking) { T.W.booking.B.record = true; knBookPaint(T); }
  knShow(T, T.root.querySelector('[data-kn-layer="booking"] .modal') || T.root.querySelector('[data-kn-layer="record"] .modal'), N);
}
// (round 24) the record shows the Notetaker's note: a note on Jonas Becker's deal that is not held back as stale
function knNotizOpen(W) {
  const R = W.record;
  return !!R && R.id === 120 && W.acts.some(a => a.source === 'notetaker' && a.deal_id === 120 && !(R.stale && R.stale.includes(a.id)));
}
function knNotizFit(F) {
  if (!F.narrow) return;
  const m = knQ(F, '[data-kn-layer="record"] .dd-modal'), h = m ? Math.ceil(m.offsetTop + m.offsetHeight) : 0;
  if (h && h !== F.fitH) { F.fitH = h; knScale(F); }
}
function knNotizRows(F) {
  F.root.querySelectorAll(`#${F.p}-notif-panel .notif-item[data-kr="notif-open"]`).forEach(r => { r.tabIndex = 0; r.setAttribute('role', 'button'); });
}
// "Gespräch beenden": the Notetaker's result comes in (once: the first delivery claims the recording), the bell shows it
// (round 25) on step 3's clock: the note is written half an hour into the meeting
function knNotizEnd(btn) {
  const F = KN.notiz;
  if (!F || btn.disabled) return;
  knIn(F, () => knNotizEndIn(F, btn));
}
function knNotizEndIn(F, btn) {
  const keyed = document.activeElement === btn;
  btn.disabled = true;
  // no meeting booked with Notetaker on the deal shown (the button rests then, knNotizSync): nothing is recorded, and
  // the page says why
  const note = knNotizCan(F).rec ? knNoteArrive(F.W) : null;
  if (!note) {
    knToast(F, knWord('kn_n_none'));
    const live = knId('kn-notiz-live');
    if (live) live.textContent = knWord('kn_n_none');
    knNotizSync(F);
    return;
  }
  if (F.W.record) F.W.record.stale = (F.W.record.stale || []).concat(note.id);   // the open timeline stays as loaded
  F.W.bell.open = true;
  knPaintBell(F);
  knNotizRows(F);
  const row = knQ(F, `#${F.p}-notif-panel .notif-item[data-kr-id="${F.W.bell.items[0].id}"]`);
  if (row) { row.classList.add('kn-new'); knFlash(F, row); if (keyed) row.focus({ preventScroll: true }); }
  const live = knId('kn-notiz-live');
  if (live) live.textContent = t('notif_notetaker_done');
}

/* ═══ part 4 · Abschluss: the deal won, and the Upgrads Engine's onboarding reporting back ═══════════════════════
   The CRM behind it (reviewed before building; the notes with file:line are in review-abschluss.md):
     public/js/deals.js 373-470, 608-616  the board, dealCard, openDealKebab, moveDealToStage (toast, Rückgängig), the drag
     routes/deals.js 166-190              PATCH /:id/stage: a change INTO a trigger stage fires vertrag.unterschrieben
     utils/engine.js 348-399              dispatchContractSigned: a delivery row, pending until the Engine answers
     public/js/onboarding.js 39-159       the phase, the row, Aktualisieren (loadOnboarding), startOnboarding = the
                                          same stage move (one trigger path)
     routes/engine.js 186-266             GET /onboarding: every deal, the trigger stage, the newest delivery
     routes/engine-api.js 63-101          PATCH /api/kunden/:id/status: the Engine's steps (contacts.updated_at = Seit)
     Developer Briefing §5.3              the seven status values, kein_onboarding to onboarding_abgeschlossen
   Pieces: the board (krDealsPage picked to #e-deals-board), opened on Angebot | Verhandlung | Gewonnen, above the
   Onboarding monitor (krOnboardingPage without its filter row). Two pages of the app at once: what the CRM did is in
   both at once (the app shows it on the monitor's next load); what the Engine reports arrives with Aktualisieren, one
   step each time. A card or a row's deal leads to the deal's part, a row's customer to Kontakte.
   Spine: step 4 when a deal enters Gewonnen (the drag, the card's menu, or Onboarding starten).
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
knPart({
  // (round 22) the win alone: the board and, beside it, the app's two Analysen cards; the Upgrads Engine has its own
  // optional block after the day (part-engine.js), which the win here reaches as vertrag.unterschrieben
  // (round 15) cropped to the win: Verhandlung and Gewonnen; 540 high, phones as tall as their column
  name: 'abschluss', p: 'e', w: 960, h: 540, hm: 600, step: 4,
  clock: () => 21 * KN_DAY,   // (round 25) three weeks after Tag 1
  size(F) { return { w: 960, h: 540, hm: F.fitH || 600 }; },
  fit: knAbschlussFit,
  page: 'deals', pages: ['deals'], home: [],
  world(W) { knAbschlussWorld(W); },
  view(F) {
    const W = F.W, p = F.p;
    const board = knTrim(knPick(krDealsPage(knL(knDealsO(F))), `#${p}-deals-board`), KN_E_CUT_STAGES.map(s => `section.col-board[data-stage="${s}"]`));
    // (round 21) the win's effect in the frame: the app's Analysen cards Gewonnener Wert and Abschlussquote beside the
    // board (renderAnalyticsCards, each card on its own: the app's own one-cell layout), from the deals the board shows
    return `<div class="kn-cuts-e">${knPiece('deals', board, 'e-board')}${knPiece('analytics', knAbschlussCards(W), 'e-an')}</div>`;
  },
  after(F) { knAbschlussHome(F); knAbschlussSay(F); },
  sync(F) { knAbschlussHome(F); },   // a language switch draws the frame anew
  afterPage(F) { knAbschlussEdges(F); knAbschlussSay(F); },
  scroll(F, e) { if (e.target.id === `${F.p}-deals-board`) knAbschlussEdges(F); },
  moved(F, id, stageId, prev, undo) {
    if (stageId === KN_WON && !undo) knStep(4);
    knAbschlussMoved(F, id);
  },
  started(F, id) { knStep(4); knAbschlussMoved(F, id); },
  wire() {
    // (round 22) step 4 from its start: the day's Analysen and the Engine's workspace follow it
    knResetButton('kn-abschluss-reset', 'abschluss', () => { knDayWonFollow(); knEngineAgain(); });
    // (round 20) the heading's gain where it shows: the day's Analysen tab, which counts the win made here
    const an = knId('kn-abschluss-an');
    if (an) an.addEventListener('click', e => { e.preventDefault(); knDayShowAnalytics(KN.abschluss); });
  },
});
// (round 25) once Jonas Becker is won, the instruction gives way to what the win did; Rückgängig brings it back
function knAbschlussSay(F) {
  const an = knId('kn-abschluss-an'), p = an && an.closest('.kn-do'), d = F && F.W && knDeal(F.W, 120);
  if (!p || !d) return;
  const won = d.stage_id === KN_WON, done = p.querySelector('.kn-do-done');
  p.classList.toggle('is-done', won);
  if (done) done.hidden = !won;
}
// after the proposal: Jonas Becker's deal in Verhandlung, with its value and owner (step 4 and the Engine's block)
function knAbschlussWorld(W) {
  knJonas(W, 14);   // (round 25) his enquiry on Tag 1, three weeks before this part's clock
  W.onb[70] = { status: 'kein_onboarding', drive: knDriveOf(knContact(W, 70)), akte: 0 };   // (round 16 review) his folder since kunde.angelegt, before the win
  Object.assign(knDeal(W, 120), { value: '315000', assigned_to: KN_ME.id });
  knContact(W, 70).updated_at = knAgo(0, 35);   // his contact was edited this morning: the monitor lists him first
  knContact(W, 68).updated_at = knAgo(9, 40);   // the Engine's last word on the Wallbox deal, nine days ago (not stale)
  knOnbLoad(W);
}
// (round 21) the app's two Analysen cards for the deals step 4 holds (GET /api/analytics/summary: every deal's stage)
const KN_E_CARDS = ['won_value', 'win_rate'];
function knAbschlussCards(W) {
  const s = knAnSummary(W, W.anMonths);
  return KN_E_CARDS.map(id => krAnalyticsCards(s, krAnBuildStatOrder([id], KR_AN_DEFAULT_STAT_ORDER.filter(x => x !== id), s), W.anMonths)).join('');
}
// (round 20) a deal moved here is moved in the day's workspace too, so its Analysen count the win (knDayWon)
function knAbschlussMoved(F, id) {
  if (id == null) return;
  (F.W.knMoved || (F.W.knMoved = new Set())).add(id);
  knDayWonFollow();
  knEngineFollow(id);   // (round 22) the win reaches the Engine's block: its row pending
}
// (round 16) the monitor's count line ("2 im Onboarding · 1 abgeschlossen") counts rows the crop leaves out, so it goes
// with them; the app's title and Aktualisieren stay
// (round 15) the stages the win is not about, and the monitor's columns that do not show the hand-over (Kunde, Seit,
// Aktion: the customer is the deal's, the time is the row's, the start is the board's move): cut, as a close-up crops
const KN_E_CUT_STAGES = [11, 12, 13, 16];
const KN_E_CUT_COLS = [1, 4, 7];
// (round 17) phones: the frame as tall as its column (the board crop, the note, the monitor's row), measured once painted
function knAbschlussFit(F) {
  if (!F.narrow) return;
  const el = knQ(F, '.kn-cuts-e'), h = el ? Math.ceil(el.scrollHeight) : 0;
  if (h && h !== F.fitH) { F.fitH = h; knScale(F); }
}
function knAbschlussOnb(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const tr of tpl.content.querySelectorAll('table tr')) KN_E_CUT_COLS.forEach(i => { if (tr.children[i]) tr.children[i].hidden = true; });
  return tpl.innerHTML;
}
// the board opens on its later stages: from Angebot when Angebot to Gewonnen fit, else from Verhandlung (phones), with
// a sliver of the stage before it where there is room
function knAbschlussHome(F) {
  const b = knId(`${F.p}-deals-board`), col = s => b && b.querySelector(`section.col-board[data-stage="${s}"]`);
  const a = col(13), n = col(14), w = col(KN_WON);
  if (a && n && w) {
    const x = c => c.offsetLeft - b.firstElementChild.offsetLeft, all = x(w) + w.offsetWidth - x(a), fits = all <= b.clientWidth;
    const lead = Math.max(0, Math.min(32, b.clientWidth - (fits ? all : n.offsetWidth)));
    b.scrollLeft = Math.max(0, x(fits ? a : n) - lead);
  }
  knAbschlussEdges(F);
}
// each piece fades at an edge while more of it follows that way, over exactly what is cut there (the board's stage
// or the table's column that does not fit); a column that fits is never faded
function knAbschlussFade(el, cols) {
  if (!el || !cols.length) return;
  const l = el.scrollLeft, r = l + el.clientWidth, x0 = cols[0].offsetLeft;
  const fit = cols.map(c => [c.offsetLeft - x0, c.offsetLeft - x0 + c.offsetWidth]).filter(([a, b]) => a >= l - 1 && b <= r + 1);
  const fl = l <= 2 ? 0 : fit.length ? fit[0][0] - l : 24, fr = r >= el.scrollWidth - 2 ? 0 : fit.length ? r - fit[fit.length - 1][1] : 24;
  el.style.setProperty('--kn-fl', `${Math.max(0, Math.min(64, fl))}px`);
  el.style.setProperty('--kn-fr', `${Math.max(0, Math.min(96, fr))}px`);
}
function knAbschlussEdges(F) {
  const b = knId(`${F.p}-deals-board`), wrap = knQ(F, '.kn-piece-e-onb .table-wrap');   // the board (step 4), the monitor's table (the Engine's block)
  knAbschlussFade(b, b ? [...b.querySelectorAll('section.col-board')] : []);
  knAbschlussFade(wrap, wrap ? [...wrap.querySelectorAll('thead th')] : []);
}

/* ═══ part 5 · Der Rest des Vertriebstags: six pages of the CRM behind the page's own tabs, one piece each ══════
   The CRM behind it (reviewed before building; every finding with file:line in review-day.md):
     Kontakte       contacts.js 167-332 (table, single-click inline edit, the PUT, 409 email_taken), 344-534
                    (filters: chips, the text popover, Filter hinzufügen, Spalten), detail-views.js 869-1110
                    openContactDetail (side panel on this page, field editors, composer), modals.js 26-100
                    openContactModal / saveContact, routes/contacts.js 206-258
     Aufgaben       tasks.js 387-470 (groups by project in All, the row), 495-524 quickAddTask, 577-612 the tick
                    (optimistic PATCH, Rückgängig)
     Kalender       calendar.js 147-170 (‹ › Heute), 242 calendarWeekView, 373 renderCalendarBody, routes/calendar.js 44
     Team-Chat      chat.js 172-186 (new_message), 212-366 (presence, history, send), server.js 297 chatMessageText
     Analysen       analytics.js 55-75 (3M/6M/12M, setAnalyticsPeriod), 169-278 (summary, the band), routes/analytics.js 67
     Einstellungen  settings.js 63-157 (rail, panes), objects.js 494 saveObjectTypeName + 98 updateObjectsNav,
                    core.js 1206 applyTheme, routes/workspace.js 312
   Pieces (each the tab line's subject only, the app's page without the title that repeats the tab's name):
     Kontakte       the list with its toolbar, Kontakt hinzufügen (the dialog opens in place) and the record's side
                    panel; the sample team ordered its own fields first (Einstellungen → Kontakte → Spalten)
     Aufgaben       All tasks, grouped by project (Vertrieb, Service), with the tick and each group's add row
     Kalender       the week with ‹ › Heute and the label; no filter chips, no list of the next days
     Team-Chat      who is online, the room, the line to write; the first line gets one reply from Tim Krüger
     Analysen       the period switch and the band (Offene Pipeline, Gewonnener Wert, Abschlussquote, Neue Deals)
     Einstellungen  the rail cut to Arbeitsbereich, Meine Einstellungen, Kontakte and the list's own tab; the list
                    names, Darstellung, the fields; the row beside the frame renames the list and sets the look
   A deal opened here (a task's deal, a contact's deal) leads to its part (Angebot); a contact opened anywhere else
   leads here, to Kontakte, its record open (contact: true). Off the spine: the day is not a sequence.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const KN_TABS = ['contacts', 'tasks', 'calendar', 'chat', 'analytics', 'settings'];
// [design height, narrow height, narrow height on a phone (the app's one-column band below 760 px)] at one design
// width for every tab, so the zoom stays the same from tab to tab (1.2 at the column's 1152 px)
const KN_DAY_W = 960;
// [wide, narrow, phone]: Kontakte on narrow screens 640 (its list is the app's own scroller, .contacts-main overflow-y)
// (round 17) on a phone (the third value) every tab grows to its content from a lower floor, so the day is shorter there
const KN_DAY_SIZE = { contacts: [600, 600, 400], tasks: [560, 620, 400], calendar: [600, 680, 400], chat: [480, 560, 400], analytics: [560, 640, 960], settings: [520, 620, 400] };   // (round 27) each tab its own desktop height again, so Kontakte, the week, Analysen and Chat show without a scroller; the station grows   // (round 26 review) 400 on wide screens: the day's station inside 768 px   // (round 19) phones from 400
// the sample team's second task project (tasks.js groups All tasks by project)
const KN_DAY_PROJECTS = [KN_PROJECTS[0], { id: 2, name: 'Service', color: '#22c55e', lists: [{ id: 21, name: 'Wartung' }], statuses: null }];
knSampleAdd('Wartung', 'Maintenance');
knSampleAdd('Jahreswartung Autohaus Petersen planen', 'Plan the annual service for Autohaus Petersen');
// the contact columns as the team arranged them: their own fields right after the company
const KN_DAY_COLUMNS = ['company', 'branche', 'dachflaeche', 'assigned_to', 'email', 'phone', 'website', 'created_at'].map(key => ({ key, visible: key !== 'created_at' }));
// the settings tabs this preview has (settings.js:63 switchSettingsTab)
const KN_DAY_SET_TABS = ['preferences', 'contacts'];   // (round 22) Darstellung and the contact fields; no Objekte or Lieferanten names, which are the app's real-estate leftovers

// Analysen and Einstellungen stack plain cards (no scroll of their own): on a narrow frame their piece's full height
// becomes the frame's. (round 14) Kontakte and Aufgaben too: on a phone their list (and an open contact) is let out of
// its own scroller (part-day.css), so the page scrolls and nothing scrolls inside it; the tasks table keeps scrolling
// sideways in its card (its 640 px keep the title readable beside the app's fixed 506 px of columns). (round 17) Chat
// and the week too: the message list and the hour grid (8 to 19) let out of their scrollers on a phone (part-day.css).
const KN_DAY_GROW = ['contacts', 'tasks', 'calendar', 'chat', 'analytics', 'settings'];
function knDayFit(F) {
  if (!F.narrow || !KN_DAY_GROW.includes(F.W.page)) return;
  const el = knQ(F, '.kn-piece'), h = el ? el.scrollHeight : 0;
  F.fit = F.fit || {};
  if (h && h !== F.fit[F.W.page]) { F.fit[F.W.page] = h; knScale(F); }
}
// a tab's piece: the app's whole page for it, cut to what the tab line talks about
// (round 14) the day shares what the visitor did elsewhere: a lead sent in step 1 arrives in its world too (the contact
// in Kontakte, updated when its address is known), and Jonas Becker's meeting is the one booked in step 2 (the day's
// own sample while step 2 holds none). Shown once the day's page loads again, as a page of the app is.
function knDayLead(src, i) {
  const D = KN.day;
  if (!D) return;
  knLeadArrive(D.W, src, 0, i);
  if (!D.lazy && D.W.page === 'contacts' && !D.W.ctRec) knPaintPage(D);
}
function knDayMeet(W) {
  W.acts = W.acts.filter(a => !(a.type === 'meeting' && a.source === 'calcom' && a.contact_id === 70));
  const T = KN.termin, booked = T ? T.W.acts.filter(a => a.type === 'meeting' && a.source === 'calcom' && a.contact_id === 70 && !a.cancelled_at) : [];
  // (round 18) step 2's own sample booking (Jonas Becker's, through the link) is in the day too. (round 21) It is his one
  // meeting while the visitor has booked nothing (round 18's stand-in at 09:30 made two Erstgespräche); the stand-in
  // only when step 2 holds no booking at all
  if (!booked.length) knMeetingAdd(W, 120, KN_NOTIZ_AT(), true, true, knT1(W, 40), KN_CAL.event_types[1]);   // (round 25) step 3's Beratung
  for (const a of booked) W.acts.unshift({ ...a, id: ++W.seq, kn_from: `termin:${a.id}` });
}
// (round 20) step 4's deals in the day's workspace, so Analysen counts what step 4 shows (Offene Pipeline, Gewonnener
// Wert and Abschlussquote read every deal's stage, no window: routes/analytics.js 94-116):
// - Jonas Becker's deal (120) is the day's own (Tag 1: Kontaktiert, no value, no owner) until step 4 wins or loses it;
//   then it has step 4's stage, value and owner, so Gewonnener Wert gains his 315.000 €, the open deals lose one, and
//   Deals nach Zuständigkeit counts the deal for its owner (round 21); Rückgängig and Von vorn put it back. (round 25:
//   before, the day showed step 4's value and owner, which step 4 sets three weeks later)
// - another deal step 4 moved is won or lost here while it is won or lost there, with its value and owner; otherwise the
//   day's own
function knDayWon(W) {
  const E = KN.abschluss, EW = E && E.W, moved = EW && EW.knMoved;
  const own = W.knOwn || (W.knOwn = Object.fromEntries(W.deals.map(d => [d.id, { stage_id: d.stage_id, value: d.value, assigned_to: d.assigned_to }])));
  for (const d of W.deals) {
    const e = EW ? knDeal(EW, d.id) : null;
    const decided = e && (e.stage_id === KN_WON || e.stage_id === KN_LOST);
    if (e && d.id === 120) Object.assign(d, decided ? { stage_id: e.stage_id, value: e.value, assigned_to: e.assigned_to } : own[d.id]);
    else if (e && moved && moved.has(d.id) && decided) Object.assign(d, { stage_id: e.stage_id, value: e.value, assigned_to: e.assigned_to });
    else if (own[d.id]) Object.assign(d, own[d.id]);
  }
}
function knDayWonFollow() {
  const D = KN.day;
  if (!D || !D.W) return;
  knDayWon(D.W);
  if (!D.lazy && D.W.page === 'analytics') knPaintPage(D);
}
// (round 20) step 4's „Analysen ansehen“: the day on its Analysen tab, the won value's card ringed
function knDayShowAnalytics(from) {
  const D = KN.day;
  if (!D) return;
  knWake(D);
  if (D.W.page !== 'analytics') knGo(D, 'analytics');
  if (D.part.sync) D.part.sync(D);
  knShow(D, knQ(D, '.an-kpi[data-stat-id="won_value"]') || knQ(D, '.kn-piece') || D.host, from);
}
function knDayFollow() {
  const D = KN.day;
  if (!D) return;
  knDayMeet(D.W);
  if (!D.lazy && (D.W.page === 'calendar' || (D.W.page === 'contacts' && !D.W.ctRec))) knPaintPage(D);
}
function knDayPiece(F) {
  const W = F.W, p = F.p, tpl = document.createElement('template');
  tpl.innerHTML = knScreen(F, W.page);
  const R = tpl.content, cut = sel => R.querySelectorAll(sel).forEach(el => el.remove());
  if (W.page === 'contacts') cut('.contacts-main > .page-header h1, .contacts-main > .page-header [data-kr="more"]');   // the title; CSV import/export
  if (W.page === 'tasks') cut('.tk-side, .tk-main > .page-header, [id$="-tasks-summary"], [id$="-tasks-toolbar"]');
  if (W.page === 'calendar') cut('.page-header, [id$="-calendar-upcoming"], [id$="-calendar-toolbar"] > .toolbar-sep, [id$="-calendar-toolbar"] > [data-chip], [id$="-calendar-toolbar"] > [data-kr="clear-filters"]');
  if (W.page === 'chat') cut('.chat-page-header');
  if (W.page === 'analytics') cut('.page-header h1, [data-kr="analytics-config"]');
  if (W.page === 'settings') {
    // (round 22) Darstellung and the contact fields only: the Arbeitsbereich pane (the names for Objekte and Lieferanten,
    // the app's real-estate leftovers) and the list's own pane are cut with their tabs
    cut(`.settings-page-header, #${p}-settings-pane-workspace, #${p}-settings-pane-objects`);
    R.querySelectorAll('.settings-tabs > .settings-tab').forEach(b => { if (!KN_DAY_SET_TABS.includes(b.dataset.tab)) b.remove(); });
    R.querySelectorAll('.settings-tabs > .settings-tab-sep').forEach(s => { if (!s.nextElementSibling || s.nextElementSibling.classList.contains('settings-tab-sep')) s.remove(); });
    const lang = R.querySelector('input[name="language"]');
    if (lang && lang.closest('.settings-card')) lang.closest('.settings-card').remove();   // the language: the page's own DE | EN
  }
  return tpl.innerHTML;
}

knPart({
  name: 'day', p: 'd', w: KN_DAY_W, h: 600, hm: 400,   // (round 17) the phone floor (size() gives 600 on wider narrow frames)
  size(F) {
    const z = KN_DAY_SIZE[F.W.page] || KN_DAY_SIZE.contacts, cw = F.host.clientWidth;
    const base = z[2] && cw > 0 && cw <= 712 ? z[2] : z[1];
    return { w: KN_DAY_W, h: z[0], hm: Math.max(base, (F.fit && F.fit[F.W.page]) || 0) };
  },
  // phones: a tab whose app page has no scroller of its own grows to its content (measured once painted); (round 21
  // review) the Kalender's instruction follows the week shown
  afterPage(F) { knDayFit(F); knDaySync(F); },
  fit: knDayFit,
  page: 'contacts', pages: KN_TABS, home: KN_TABS, contact: true,
  world(W) {
    // (round 24) the day is Tag 1, as steps 1 and 2: the enquiry two hours ago, the call back since, his own booking for
    // a next working day
    knJonas(W, 12);
    knDayMeet(W);   // (round 14) step 2's booking, once there is one
    knDayWon(W);   // (round 20) step 4's win, once there is one
    W.projects = KN_DAY_PROJECTS;
    Object.assign(W.tasks.find(x => x.id === 204), { project_id: 2, list_id: 21 });
    W.tasks.push({ ...knTask(208, 'Jahreswartung Autohaus Petersen planen', 'todo', 'medium', krBookingAddDays(W.today, 6), null, 1, 93, 21), project_id: 2 });
    W.ct.contactColumns = KN_DAY_COLUMNS.map(c => ({ ...c }));
    W.setTab = 'preferences';   // (round 22) Einstellungen opens on Darstellung
  },
  view(F) { return knPiece(F.W.page, knDayPiece(F), `page ${F.W.page}`); },
  showContact(T, id) { if (T.W.page !== 'contacts') knGo(T, 'contacts'); knCtOpen(T, id); },
  sync: knDaySync,
  after: knDaySync,
  wire() {
    const tabs = [...document.querySelectorAll('.kn-tab[data-tab]')];
    tabs.forEach(b => b.addEventListener('click', () => knDayTab(b.dataset.tab)));
    // the tablist pattern: the arrows move between the tabs and open the one they reach, Home and End the ends
    const list = knId('kn-tabs');
    if (list) list.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || !KN.day) return;
      e.preventDefault();
      const i = Math.max(0, KN_TABS.indexOf(KN.day.W.page)), n = e.key === 'Home' ? 0 : e.key === 'End' ? KN_TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : KN_TABS.length - 1)) % KN_TABS.length;
      knDayTab(KN_TABS[n]);
      const b = tabs.find(x => x.dataset.tab === KN_TABS[n]);
      if (b) b.focus();
    });
    const again = knId('kn-day-reset');
    if (again) again.addEventListener('click', knDayAgain);
  },
});
// the tabs and the two lines under them follow the frame's page (round 13: Einstellungen has its line too; the page's
// stand-in row for list names and the look went, the frame's own Speichern and switch do both)
function knDaySync(F) {
  const page = F.W.page, line = knId('kn-tab-line'), todo = knId('kn-day-do');
  document.querySelectorAll('.kn-tab[data-tab]').forEach(b => { const on = b.dataset.tab === page; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  if (KN_TABS.includes(page)) {
    F.host.setAttribute('aria-labelledby', `kn-tab-${page}`);
    if (line) { line.dataset.kn = `kn_day_${page}`; line.textContent = knWord(line.dataset.kn); }
    if (todo) { todo.dataset.kn = page === 'calendar' && knDayCalNext(F.W) ? 'kn_do_calendar_next' : `kn_do_${page}`; todo.textContent = knWord(todo.dataset.kn); }
  }
  F.host.setAttribute('aria-describedby', 'kn-tab-line kn-day-do');
}
// (round 23) a tab change closes what the frame has open (a dialog, a menu, a window), quietly, as leaving a page of
// the app does; otherwise „Kontakt hinzufügen“ stayed over the next tab and kept it from being used
function knDayTab(tab) {
  const D = KN.day;
  if (!D || D.W.page === tab) return;
  knQuiet(D);
  knGo(D, tab);
}
// (round 21 review) the Kalender opens on the week of today, as the app does (calendar.js:76); from a Thursday to a
// Sunday the sample's next meeting lies in a later week (knWorkdays), and the instruction says so until › gets there
function knDayCalNext(W) {
  const wk = iso => krCalIso(krCalWeekStart(krCalDateFromIso(iso)));
  const next = W.acts.filter(a => a.type === 'meeting' && !a.cancelled_at && a.event_date && a.event_date >= W.today).map(a => a.event_date).sort()[0];
  return !!next && wk(next) > wk(W.calUI.anchor);
}
// Von vorn: the day's workspace as it started and the light look, on the tab the visitor is on
function knDayAgain() {
  const F = KN.day;
  if (!F) return;
  const tab = F.W.page;
  knReset(F);
  if (KN_TABS.includes(tab) && tab !== F.W.page) knGo(F, tab);
  if (knDark) knSetTheme(false);
  knDaySync(F);
}

/* ═══ the Upgrads Engine (round 22): optional, after the story; not a step ═════════════════════════════════════
   The CRM behind it (reviewed before building; the notes with file:line are in review-abschluss.md):
     routes/deals.js 166-190              PATCH /:id/stage: a change INTO a trigger stage fires vertrag.unterschrieben
     utils/engine.js 348-399              dispatchContractSigned: a delivery row, pending until the Engine answers
     public/js/onboarding.js 39-159       the phase, the row, Aktualisieren (loadOnboarding)
     routes/engine.js 186-266             GET /onboarding: every deal, the trigger stage, the newest delivery
     routes/engine-api.js 63-101          PATCH /api/kunden/:id/status: the Engine's steps (contacts.updated_at = Seit)
   Piece: the Onboarding monitor (krOnboardingPage without its filter row), cropped to Jonas Becker's row and the
   Wallbox customer's. Its workspace is step 4's: a win there is vertrag.unterschrieben here (knEngineFollow), the row
   pending; what the Engine reports comes with the monitor's own Aktualisieren, one each, or all at once with „Ein
   paar Tage später“, the one click that stands for the days in between. No spine: the drawing keeps four steps.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
knPart({
  name: 'engine', p: 'g', w: 960, h: 280, hm: 360,
  clock: () => 21 * KN_DAY,   // (round 25) step 4's three weeks on
  size(F) { return { w: 960, h: 280, hm: F.fitH || 360 }; },
  fit: knEngineFit,
  page: 'onboarding', pages: ['onboarding'], home: ['onboarding'],
  world(W) { knAbschlussWorld(W); knEngineWon(W); knOnbLoad(W); },
  view(F) {
    const W = F.W, p = F.p;
    const onb = knAbschlussOnb(knTrim(krOnboardingPage(knL({ p, rows: knOnbLoad(W), active: true, filter: W.onbFilter, now: Date.now() })), [`#${p}-onboarding-toolbar`, `#${p}-onboarding-page-sub`, `#${p}-onboarding-body tr:not([data-deal="120"]):not([data-deal="93"])`]));
    return `<div class="kn-cuts-g">${knPiece('onboarding', onb, 'e-onb')}</div>`;
  },
  after(F) { knEngineNext(); },
  sync(F) { knEngineNext(); },
  afterPage(F) { knAbschlussEdges(F); knEngineNext(); },   // the time skip follows every report, the monitor's own Aktualisieren too
  scroll(F, e) { if (e.target.classList.contains('table-wrap')) knAbschlussEdges(F); },
  moved(F, id) { knOnbMark(F, [id]); knEngineNext(); },
  started() { knEngineNext(); },
  wire() {
    knResetButton('kn-engine-reset', 'engine', knEngineNext);
    // (round 24) its line to step 4 is the page's jump (knShow): step 4 then offers „Zurück zur Upgrads Engine“
    const wait = knId('kn-engine-wait');
    if (wait) wait.addEventListener('click', e => { if (!e.target.closest('a') || !KN.abschluss) return; e.preventDefault(); knShow(KN.abschluss, KN.abschluss.host, KN.engine); });
    const all = knId('kn-abschluss-rest');
    if (all) all.addEventListener('click', () => { const G = KN.engine; if (G && !all.disabled) { knOnbReload(G, knOnbLeft(G.W)); knEngineNext(); } });
  },
});
// step 4's moves in the Engine's workspace: a win there sends vertrag.unterschrieben here (a pending delivery,
// knSetStage); a deal moved back keeps the delivery that went out, as the app does
function knEngineWon(W) {
  const E = KN.abschluss, moved = E && E.W && E.W.knMoved;
  if (!moved) return;
  for (const id of moved) { const e = knDeal(E.W, id), d = knDeal(W, id); if (e && d && d.stage_id !== e.stage_id) knSetStage(W, d, e.stage_id); }
}
function knEngineFollow(id) {
  const G = KN.engine, E = KN.abschluss;
  if (!G || !G.W || !E) return;
  const e = knDeal(E.W, id), d = knDeal(G.W, id);
  if (!e || !d || d.stage_id === e.stage_id) return;
  knSetStage(G.W, d, e.stage_id);
  knOnbLoad(G.W);
  if (!G.lazy) { knPaintPage(G); knOnbMark(G, [id]); }
  knEngineNext();
}
// step 4 from its start: the Engine's workspace from its start too
function knEngineAgain() { if (KN.engine) knReset(KN.engine); knEngineNext(); }
// „Ein paar Tage später“: only once a deal is won (no idle button), resting once every report is in
function knEngineNext() {
  const F = KN.engine, all = knId('kn-abschluss-rest');
  if (!F || !all) return;
  const left = knOnbLeft(F.W), live = F.W.live.size > 0, box = knId('kn-abschluss-engine'), wait = knId('kn-engine-wait');
  if (box) box.hidden = !live;
  if (wait) wait.hidden = live;   // (round 23) before a win, the line to step 4
  all.disabled = !live || left === 0;
  all.dataset.kn = live && left === 0 ? 'kn_e_all' : 'kn_e_rest';
  all.textContent = knWord(all.dataset.kn);
}
// phones: the frame as tall as the monitor's crop, measured once painted
function knEngineFit(F) {
  if (!F.narrow) return;
  const el = knQ(F, '.kn-cuts-g'), h = el ? Math.ceil(el.scrollHeight) : 0;
  if (h && h !== F.fitH) { F.fitH = h; knScale(F); }
}

document.addEventListener('DOMContentLoaded', knInit);
