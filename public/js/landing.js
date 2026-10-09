/* ═══════════════════════════════════════════════════════════════════════════
   LANDING PAGE (/landingpage) — standalone: no app scripts, no API calls.

   A product page in the manner of a consumer launch page: one statement per
   section, set large and centred, the product shown big and working under
   it, light and dark bands alternating, a slim translucent bar on top, a
   a four-step walkthrough of one task near the end, one closing call to action.

     board    drag and drop between stage columns; once, on first sight, a
              visible cursor drags the deal into Won, then the visitor takes
              over; totals and the Engine line follow every move
     leads    the ad platforms and the website on the left, Upgrads on the
              right; one button sends a lead across (a real payload shape
              mapped through the webhook's own dot-path logic) and the contact
              appears
     deal     the deal record's tabs; tasks tick, a note saves
     contacts search filters the list as the Contacts table does; a pick
              fills the card (deals, history); Anrufen / E-Mail / WhatsApp
              open the number, the address, or the filled-in template
     numbers  three periods of figures: cards, win-rate line, funnel
     engine   from our system to the next: closing the deal moves it to Won
              and a packet travels to the next system, which confirms receipt;
              no code on the page (the real transfer is utils/engine.js)
     work     how a task is used, in four explained steps: the form, the list
              (All / My tasks), the week, the tick; the steps play once in
              view and are clickable; the form's button and the row's tick
              move the walkthrough on, as they would in the app

   German is the default and the markup text IS the German dictionary (the
   client test checks that key for key). Every string claims only what the
   code does, and every string is short: the test caps their length.
   ═══════════════════════════════════════════════════════════════════════════ */

const LP_I18N = {
  de: {
    lp_login: 'Anmelden', lp_request: 'Zugang anfragen', lp_request_subject: 'Zugang zu Upgrads CRM', lp_lang: 'Sprache', lp_overview: 'Übersicht',
    lp_hero_kicker: 'CRM',
    lp_hero_title: 'Ein Board. Jeder Deal.',
    lp_hero_sub: 'Vom ersten Lead bis zur Unterschrift.',

    lp_s1_t: 'Ziehen. Fertig.', lp_s1_d: 'Deals durch eigene Phasen. Summen folgen live.',
    lp_board_pipeline: 'Vertrieb', lp_board_aria: 'Beispiel-Board. Karten mit der Maus oder den Pfeiltasten verschieben.',
    lp_col_new: 'Neu', lp_col_offer: 'Angebot', lp_col_nego: 'Verhandlung', lp_col_won: 'Gewonnen',
    lp_deal_one: 'Deal', lp_deal_many: 'Deals',
    lp_urg_low: 'Niedrig', lp_urg_medium: 'Mittel', lp_urg_high: 'Hoch', lp_urg_very: 'Sehr dringend',
    lp_stats_line: 'Offen {open} in {n} Deals. Gewonnen {won}. Anteil {rate} %.',
    lp_toast_moved: 'Verschoben nach {stage}', lp_toast_undo: 'Rückgängig',
    lp_delivery_idle: 'Upgrads Engine wartet auf einen Deal in Gewonnen.', lp_delivery_pending: 'Upgrads Engine: wird zugestellt', lp_delivery_done: 'Upgrads Engine: zugestellt, HTTP 200',
    lp_demo_replay: 'Noch einmal zeigen',

    lp_s2_t: 'Leads kommen an. Von selbst.', lp_s2_d: 'Aus Facebook, Instagram, TikTok und der Website. Über Make, Zapier oder n8n.',
    lp_src_fb: 'Facebook Ads', lp_src_ig: 'Instagram Ads', lp_src_tt: 'TikTok Ads', lp_src_web: 'Website-Formular', lp_via: 'über',
    lp_lead_send: 'Lead senden', lp_lead_contact: 'Kontakt angelegt', lp_lead_deal: 'Deal angelegt in {stage}', lp_lead_owner: 'Zugewiesen an Mara Kühn',
    lp_f_name: 'Name', lp_f_email: 'E-Mail', lp_f_phone: 'Telefon', lp_f_company: 'Firma',

    lp_s3_t: 'Alles an einem Ort.', lp_s3_d: 'Kontakt, Aufgaben, Notizen, Objekte. Am Deal.',
    lp_deal_name: 'Elbstraße 12, 3 Zimmer', lp_deal_created: 'Angelegt vor 11 Tagen',
    lp_tab_overview: 'Übersicht', lp_tab_contact: 'Kontakt', lp_tab_tasks: 'Aufgaben', lp_tab_activity: 'Aktivität', lp_tab_objects: 'Objekte',
    lp_kpi_value: 'Deal-Wert', lp_kpi_stage: 'Phase', lp_kpi_urg: 'Dringlichkeit', lp_kpi_owner: 'Zuständig', lp_kpi_last: 'Letzte Aktivität', lp_kpi_last_v: 'vor 2 Std.',
    lp_ov_next: 'Nächste Aufgaben', lp_ov_latest: 'Letzte Aktivität',
    lp_act_call: 'Anrufen', lp_act_email: 'E-Mail', lp_act_wa: 'WhatsApp',
    lp_f_owner: 'Zuständig', lp_f_last: 'Letzter Kontakt', lp_f_last_v: 'gestern, 15:20',
    lp_supplier_label: 'Lieferant', lp_supplier_role: 'Notariat',
    lp_tasks_progress: '{d} von {n} erledigt',
    lp_task1: 'Finanzierungsbestätigung anfordern', lp_task1_due: 'Fr, 10:00',
    lp_task2: 'Energieausweis senden', lp_task2_due: 'erledigt',
    lp_task3: 'Notartermin abstimmen', lp_task3_due: 'Di, 14:30',
    lp_task4: 'Exposé aktualisieren', lp_task4_due: 'ohne Datum',
    lp_prio_high: 'Hoch', lp_prio_medium: 'Mittel', lp_prio_low: 'Niedrig',
    lp_note_ph: 'Notiz schreiben, Strg+Enter speichert', lp_note_save: 'Speichern',
    lp_type_note: 'Notiz', lp_type_call: 'Anruf', lp_type_email: 'E-Mail', lp_type_wa: 'WhatsApp', lp_tl_now: 'gerade eben',
    lp_tl1_meta: 'Mara Kühn, gestern 15:20', lp_tl1_text: 'Kaufpreis besprochen, Finanzierung in Prüfung.',
    lp_tl2_meta: 'Mara Kühn, Montag 09:05', lp_tl2_text: 'Exposé gesendet, Besichtigung Mittwoch.',
    lp_tl3_meta: 'Tim Berger, letzte Woche', lp_tl3_text: 'Erstkontakt über das Formular. Sucht 3 Zimmer, Altbau.',
    lp_obj_title: 'Verknüpfte Objekte', lp_obj_meta: '87 m², 3 Zimmer, Baujahr 1962', lp_obj_open: 'Öffnen', lp_obj_add: 'Objekt verknüpfen',

    lp_s4_t: 'Jeder Kontakt. Sofort gefunden.', lp_s4_d: 'Suchen, anrufen, schreiben. Die ganze Geschichte an einem Kontakt.',
    lp_ct_search_ph: 'Kontakt suchen', lp_ct_list: 'Kontakte', lp_ct_none: 'Kein Treffer', lp_ct_private: 'Privat',
    lp_ct_call: 'Anrufen', lp_ct_mail: 'E-Mail', lp_ct_wa: 'WhatsApp', lp_ct_deals: 'Deals', lp_ct_history: 'Verlauf',
    lp_ct_bub_call: 'Ruft an', lp_ct_bub_mail: 'Schreibt an', lp_ct_bub_wa: 'WhatsApp, Vorlage vorausgefüllt',
    lp_ct_tpl: 'Guten Tag {name}, danke für die Anfrage zu {deal}. Beste Grüße, Mara Kühn',
    lp_h1a: 'Besichtigung bestätigt', lp_h1b: 'Finanzierung über die Hausbank', lp_h2a: 'Entwurf Kaufvertrag erhalten', lp_h2b: 'Termin am 14. Oktober vorgeschlagen',
    lp_h3a: 'Exposé gesendet', lp_h3b: 'Budget bis 650.000 €', lp_h4a: 'Erstkontakt über die Website', lp_h4b: 'Rückruf vereinbart',
    lp_h5a: 'Interesse an drei Zimmern', lp_h5b: 'Besichtigungstermin angefragt',

    lp_s5_t: 'Zahlen, die stimmen.', lp_s5_d: 'Gewinnquote und Trichter nach den eigenen Phasen.',
    lp_an_period_3: '3 Monate', lp_an_period_6: '6 Monate', lp_an_period_12: '12 Monate',
    lp_an_c_open: 'Offene Pipeline', lp_an_c_won: 'Gewonnener Wert', lp_an_c_rate: 'Gewinnquote', lp_an_c_new: 'Neue Deals',
    lp_an_rate_m: 'Gewinnquote je Monat', lp_an_funnel: 'Trichter', lp_an_lost: 'Verloren', lp_an_funnel_hint: '{p} % weiter zu {stage}',
    lp_an_tip: '{month}: {rate} %, {won} gewonnen, {lost} verloren',

    lp_s6_t: 'Unterschrieben. Weitergemeldet.', lp_s6_d: 'Ein Zug nach Gewonnen, und das nächste System weiß Bescheid.',
    lp_en_cap: 'Sicher übertragen, Empfang bestätigt. Jede Übertragung im Protokoll.',
    lp_en_send: 'Deal abschließen', lp_en_to: 'Nächstes System', lp_en_to_sub: 'Abwicklung, Buchhaltung, Verwaltung', lp_en_received: 'Empfangen',
    lp_en_idle: 'Wartet auf den Abschluss', lp_en_pending: 'Wird übertragen', lp_en_done: 'Empfangen und bestätigt',

    lp_s7_t: 'Eine Aufgabe, vier Schritte.', lp_s7_d: 'Anlegen, in der Liste, im Kalender, erledigt. So arbeitet das Team.',
    lp_how1: 'Aufgabe anlegen', lp_how1_d: 'Am Deal oder auf der Aufgabenseite: Titel, Datum, Uhrzeit und wer es macht.',
    lp_how2: 'In der Liste', lp_how2_d: 'Alle Aufgaben des Teams, nach Projekt gruppiert. Überfälliges steht rot.',
    lp_how3: 'Im Kalender', lp_how3_d: 'Mit Uhrzeit steht sie im Wochenplan des Teams. Jeder in seiner Zeitzone.',
    lp_how4: 'Abhaken', lp_how4_d: 'Ein Haken in der Liste, im Kalender oder am Deal. Überall erledigt.',
    lp_how_new: 'Neue Aufgabe', lp_how_f_title: 'Titel', lp_how_f_date: 'Mi, 7. Okt', lp_how_f_time: 'Uhrzeit', lp_how_f_deal: 'Deal', lp_how_f_hint: 'Mit Uhrzeit steht sie im Kalender.', lp_how_cancel: 'Abbrechen',
    lp_how_all: 'Alle Aufgaben', lp_how_mine: 'Meine Aufgaben', lp_how_task: 'Aufgabe', lp_how_prio: 'Priorität', lp_how_due: 'Fällig', lp_how_t4: 'Besichtigung bestätigen', lp_how_t4_due: 'Mo, 09:00', lp_how_foot: '4 offen, 1 überfällig',
    lp_how_cal: 'Kalender', lp_how_range: '5. bis 11. Okt', lp_how_month: 'Monat', lp_how_week: 'Woche', lp_how_e1: 'Besichtigung Hafenstraße', lp_how_e2: 'Übergabe Kanalweg',
    lp_how_p_list: 'Liste', lp_how_done: 'Aufgabe erledigt', lp_s7_cap: 'Kein Termin geht mehr unter. Das ganze Team sieht, was ansteht.',
    lp_w1: 'Exposé senden', lp_w1_due: 'Mi, 14:00',
    lp_wd1: 'Mo', lp_wd2: 'Di', lp_wd3: 'Mi', lp_wd4: 'Do', lp_wd5: 'Fr', lp_wd6: 'Sa', lp_wd7: 'So',

    lp_cta_t: 'Bereit, wenn das Team es ist.', lp_cta_d: 'Zugang anfragen. Der Einladungscode kommt per E-Mail.',
    lp_foot_tag: 'Upgrads CRM. Ein Board. Jeder Deal.',
  },
  en: {
    lp_login: 'Log in', lp_request: 'Request access', lp_request_subject: 'Access to Upgrads CRM', lp_lang: 'Language', lp_overview: 'Overview',
    lp_hero_kicker: 'CRM',
    lp_hero_title: 'One board. Every deal.',
    lp_hero_sub: 'From the first lead to the signature.',

    lp_s1_t: 'Drag. Done.', lp_s1_d: 'Deals through your own stages. Totals follow live.',
    lp_board_pipeline: 'Sales', lp_board_aria: 'Example board. Move cards with the mouse or the arrow keys.',
    lp_col_new: 'New', lp_col_offer: 'Proposal', lp_col_nego: 'Negotiation', lp_col_won: 'Won',
    lp_deal_one: 'deal', lp_deal_many: 'deals',
    lp_urg_low: 'Low', lp_urg_medium: 'Medium', lp_urg_high: 'High', lp_urg_very: 'Very urgent',
    lp_stats_line: 'Open {open} across {n} deals. Won {won}. Share {rate} %.',
    lp_toast_moved: 'Moved to {stage}', lp_toast_undo: 'Undo',
    lp_delivery_idle: 'Upgrads Engine waits for a deal in Won.', lp_delivery_pending: 'Upgrads Engine: delivering', lp_delivery_done: 'Upgrads Engine: delivered, HTTP 200',
    lp_demo_replay: 'Show again',

    lp_s2_t: 'Leads arrive. On their own.', lp_s2_d: 'From Facebook, Instagram, TikTok and the website. Via Make, Zapier or n8n.',
    lp_src_fb: 'Facebook Ads', lp_src_ig: 'Instagram Ads', lp_src_tt: 'TikTok Ads', lp_src_web: 'Website form', lp_via: 'via',
    lp_lead_send: 'Send a lead', lp_lead_contact: 'Contact created', lp_lead_deal: 'Deal created in {stage}', lp_lead_owner: 'Assigned to Mara Kühn',
    lp_f_name: 'Name', lp_f_email: 'Email', lp_f_phone: 'Phone', lp_f_company: 'Company',

    lp_s3_t: 'Everything in one place.', lp_s3_d: 'Contact, tasks, notes, listings. On the deal.',
    lp_deal_name: 'Elbstraße 12, 3 rooms', lp_deal_created: 'Created 11 days ago',
    lp_tab_overview: 'Overview', lp_tab_contact: 'Contact', lp_tab_tasks: 'Tasks', lp_tab_activity: 'Activity', lp_tab_objects: 'Listings',
    lp_kpi_value: 'Deal value', lp_kpi_stage: 'Stage', lp_kpi_urg: 'Urgency', lp_kpi_owner: 'Owner', lp_kpi_last: 'Last activity', lp_kpi_last_v: '2 h ago',
    lp_ov_next: 'Next tasks', lp_ov_latest: 'Latest activity',
    lp_act_call: 'Call', lp_act_email: 'Email', lp_act_wa: 'WhatsApp',
    lp_f_owner: 'Owner', lp_f_last: 'Last contact', lp_f_last_v: 'yesterday, 15:20',
    lp_supplier_label: 'Supplier', lp_supplier_role: 'Notary office',
    lp_tasks_progress: '{d} of {n} done',
    lp_task1: 'Request financing confirmation', lp_task1_due: 'Fri, 10:00',
    lp_task2: 'Send energy certificate', lp_task2_due: 'done',
    lp_task3: 'Agree the notary appointment', lp_task3_due: 'Tue, 14:30',
    lp_task4: 'Update the exposé', lp_task4_due: 'no date',
    lp_prio_high: 'High', lp_prio_medium: 'Medium', lp_prio_low: 'Low',
    lp_note_ph: 'Write a note, Ctrl+Enter saves', lp_note_save: 'Save',
    lp_type_note: 'Note', lp_type_call: 'Call', lp_type_email: 'Email', lp_type_wa: 'WhatsApp', lp_tl_now: 'just now',
    lp_tl1_meta: 'Mara Kühn, yesterday 15:20', lp_tl1_text: 'Discussed the price, financing under review.',
    lp_tl2_meta: 'Mara Kühn, Monday 09:05', lp_tl2_text: 'Sent the exposé, viewing on Wednesday.',
    lp_tl3_meta: 'Tim Berger, last week', lp_tl3_text: 'First contact through the form. Looking for 3 rooms, period building.',
    lp_obj_title: 'Linked listings', lp_obj_meta: '87 m², 3 rooms, built 1962', lp_obj_open: 'Open', lp_obj_add: 'Link a listing',

    lp_s4_t: 'Every contact. Found at once.', lp_s4_d: 'Search, call, write. The whole history on one contact.',
    lp_ct_search_ph: 'Find a contact', lp_ct_list: 'Contacts', lp_ct_none: 'No match', lp_ct_private: 'Private',
    lp_ct_call: 'Call', lp_ct_mail: 'Email', lp_ct_wa: 'WhatsApp', lp_ct_deals: 'Deals', lp_ct_history: 'History',
    lp_ct_bub_call: 'Calls', lp_ct_bub_mail: 'Writes to', lp_ct_bub_wa: 'WhatsApp, template filled in',
    lp_ct_tpl: 'Hello {name}, thank you for the enquiry about {deal}. Best regards, Mara Kühn',
    lp_h1a: 'Viewing confirmed', lp_h1b: 'Financing through their bank', lp_h2a: 'Draft purchase contract received', lp_h2b: 'Appointment proposed for 14 October',
    lp_h3a: 'Exposé sent', lp_h3b: 'Budget up to 650.000 €', lp_h4a: 'First contact via the website', lp_h4b: 'Call back arranged',
    lp_h5a: 'Interested in three rooms', lp_h5b: 'Viewing requested',

    lp_s5_t: 'Numbers that add up.', lp_s5_d: 'Win rate and funnel by your own stages.',
    lp_an_period_3: '3 months', lp_an_period_6: '6 months', lp_an_period_12: '12 months',
    lp_an_c_open: 'Open pipeline', lp_an_c_won: 'Won value', lp_an_c_rate: 'Win rate', lp_an_c_new: 'New deals',
    lp_an_rate_m: 'Win rate per month', lp_an_funnel: 'Funnel', lp_an_lost: 'Lost', lp_an_funnel_hint: '{p} % on to {stage}',
    lp_an_tip: '{month}: {rate} %, {won} won, {lost} lost',

    lp_s6_t: 'Signed. Passed on.', lp_s6_d: 'One move to Won, and the next system knows.',
    lp_en_cap: 'Transferred securely, receipt confirmed. Every transfer on record.',
    lp_en_send: 'Close the deal', lp_en_to: 'Next system', lp_en_to_sub: 'Fulfilment, accounting, administration', lp_en_received: 'Received',
    lp_en_idle: 'Waiting for the close', lp_en_pending: 'Transferring', lp_en_done: 'Received and confirmed',

    lp_s7_t: 'One task, four steps.', lp_s7_d: 'Added, in the list, on the calendar, done. How the team works.',
    lp_how1: 'Create the task', lp_how1_d: 'On the deal or the Tasks page: title, date, time and who does it.',
    lp_how2: 'In the list', lp_how2_d: 'Every task of the team, grouped by project. Overdue shows in red.',
    lp_how3: 'On the calendar', lp_how3_d: 'A time puts it on the team calendar. Everyone in their own time zone.',
    lp_how4: 'Tick it off', lp_how4_d: 'One tick in the list, on the calendar or on the deal. Done everywhere.',
    lp_how_new: 'New task', lp_how_f_title: 'Title', lp_how_f_date: 'Wed, 7 Oct', lp_how_f_time: 'Time', lp_how_f_deal: 'Deal', lp_how_f_hint: 'With a time it is on the calendar.', lp_how_cancel: 'Cancel',
    lp_how_all: 'All tasks', lp_how_mine: 'My tasks', lp_how_task: 'Task', lp_how_prio: 'Priority', lp_how_due: 'Due', lp_how_t4: 'Confirm the viewing', lp_how_t4_due: 'Mon, 09:00', lp_how_foot: '4 open, 1 overdue',
    lp_how_cal: 'Calendar', lp_how_range: '5 to 11 Oct', lp_how_month: 'Month', lp_how_week: 'Week', lp_how_e1: 'Viewing Hafenstraße', lp_how_e2: 'Handover Kanalweg',
    lp_how_p_list: 'List', lp_how_done: 'Task completed', lp_s7_cap: 'No deadline slips through. The whole team sees what is due.',
    lp_w1: 'Send exposé', lp_w1_due: 'Wed, 14:00',
    lp_wd1: 'Mon', lp_wd2: 'Tue', lp_wd3: 'Wed', lp_wd4: 'Thu', lp_wd5: 'Fri', lp_wd6: 'Sat', lp_wd7: 'Sun',

    lp_cta_t: 'Ready when the team is.', lp_cta_d: 'Request access. The invite code arrives by email.',
    lp_foot_tag: 'Upgrads CRM. One board. Every deal.',
  },
};

const LP_MONTHS = {
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

// Three payload shapes a workspace really receives, each with the mapping that reads it:
// a flat website form, Make's nested bundle, Zapier's flat keys with different names.
const LP_LEAD_PRESETS = [
  { name: 'form',   payload: { full_name: 'Jana Weber', contact: { email: 'jana.weber@example.de', phone: '+49 171 2345678' }, source: 'Website' }, map: { name: 'full_name', email: 'contact.email', phone: 'contact.phone', company: 'company' } },
  { name: 'make',   payload: { data: { lead: { name: 'Sofia Marin', email: 'sofia.marin@example.de', company: 'Marin & Co.' } } }, map: { name: 'data.lead.name', email: 'data.lead.email', phone: 'data.lead.phone', company: 'data.lead.company' } },
  { name: 'zapier', payload: { first_name: 'Tim', last_name: 'Berger', email_address: 'tim.berger@example.de', phone_number: '+49 160 9876543', company_name: 'Nordwind GmbH' }, map: { name: 'first_name', email: 'email_address', phone: 'phone_number', company: 'company_name' } },
];

// Three periods of example figures for the numbers screen.
const LP_ANALYTICS = {
  3:  { open: 1840000, won: 1210000, rate: 46, newDeals: 23, rates: [38, 44, 47], wonM: [5, 7, 8], lostM: [8, 9, 9], funnel: [31, 19, 12, 8], lost: 10 },
  6:  { open: 1840000, won: 2370000, rate: 42, newDeals: 48, rates: [31, 35, 38, 38, 44, 47], wonM: [4, 5, 6, 5, 7, 8], lostM: [9, 9, 10, 8, 9, 9], funnel: [64, 39, 24, 17], lost: 21 },
  12: { open: 1840000, won: 4620000, rate: 38, newDeals: 97, rates: [26, 28, 27, 30, 31, 29, 31, 35, 38, 38, 44, 47], wonM: [3, 3, 3, 4, 4, 3, 4, 5, 6, 5, 7, 8], lostM: [8, 8, 8, 9, 9, 7, 9, 9, 10, 8, 9, 9], funnel: [131, 76, 46, 31], lost: 43 },
};

// Five contacts as the Contacts table holds them (name, company, phone, email) with their
// deals and the last two entries of their history (note, call, email, WhatsApp: the four
// activity types). Texts are dictionary keys; a time is weekday + clock.
const LP_CONTACTS = [
  { id: 1, name: 'Jana Weber', company: '', phone: '+49 171 2345678', email: 'jana.weber@example.de', deals: [{ title: 'Elbstraße 12, 3 Zimmer', stage: 'lp_col_nego' }], history: [{ type: 'call', key: 'lp_h1a', day: 3, time: '10:12' }, { type: 'note', key: 'lp_h1b', day: 2, time: '16:40' }] },
  { id: 2, name: 'Katrin Feld', company: 'Notariat Feld & Kollegen', phone: '+49 40 5551234', email: 'kanzlei@example.de', deals: [{ title: 'Elbstraße 12, 3 Zimmer', stage: 'lp_col_nego' }], history: [{ type: 'email', key: 'lp_h2a', day: 3, time: '08:55' }, { type: 'call', key: 'lp_h2b', day: 1, time: '11:20' }] },
  { id: 3, name: 'Markus Lenz', company: 'Lenz Bau GmbH', phone: '+49 160 9876543', email: 'm.lenz@example.de', deals: [{ title: 'Hafenstraße 4, 2 Zimmer', stage: 'lp_col_offer' }], history: [{ type: 'wa', key: 'lp_h3a', day: 2, time: '14:05' }, { type: 'note', key: 'lp_h3b', day: 1, time: '09:30' }] },
  { id: 4, name: 'Sofia Brandt', company: 'Brandt & Partner', phone: '+49 30 4445566', email: 's.brandt@example.de', deals: [{ title: 'Kanalweg 8, 4 Zimmer', stage: 'lp_col_new' }], history: [{ type: 'email', key: 'lp_h4a', day: 3, time: '07:48' }, { type: 'call', key: 'lp_h4b', day: 3, time: '09:02' }] },
  { id: 5, name: 'Ömer Kaya', company: '', phone: '+49 176 1112233', email: 'oe.kaya@example.de', deals: [{ title: 'Elbstraße 12, 3 Zimmer', stage: 'lp_col_new' }], history: [{ type: 'note', key: 'lp_h5a', day: 2, time: '12:15' }, { type: 'wa', key: 'lp_h5b', day: 2, time: '12:30' }] },
];

let lpLang = 'de';
const lpRerender = [];   // functions that repaint script-generated text when the language changes

// ── i18n ────────────────────────────────────────────────────────────────────
function lpT(key, vars) {
  const d = LP_I18N[lpLang] || LP_I18N.en;
  let s = (d && d[key]) ?? LP_I18N.en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

function lpApplyLang(lang) {
  lpLang = LP_I18N[lang] ? lang : 'de';
  document.documentElement.lang = lpLang;
  try { localStorage.setItem('lang', lpLang); } catch {}
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = lpT(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = lpT(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', lpT(el.dataset.i18nAria)); });
  document.querySelectorAll('.lp-lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lpLang)));
  document.querySelectorAll('.lp-request').forEach(a => { a.href = 'mailto:hello@upgrads.de?subject=' + encodeURIComponent(lpT('lp_request_subject')); });
  for (const fn of lpRerender) fn();
}

function lpSetLang(lang) { lpApplyLang(lang); }

// ── the bar gains its line once the page has scrolled; statements rise once as they enter ──
function lpInitNav() {
  const nav = document.querySelector('.lp-nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function lpInitReveal() {
  const els = document.querySelectorAll('.lp-reveal');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.2 });
  els.forEach(el => io.observe(el));
}

// ── pointer effects: the hero glow follows the pointer, frames tilt a little ──
// One passive pointermove listener, throttled to a frame, writing CSS variables; nothing runs
// on coarse pointers or under reduced motion. The board frame never tilts: its drag positions a
// card with position: fixed, which a transformed ancestor would re-anchor.
function lpTiltFor(x, y, w, h, max) { return { rx: ((y / h) - 0.5) * -2 * max, ry: ((x / w) - 0.5) * 2 * max }; }

function lpInitFx() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (reduce || coarse) return;
  const hero = document.querySelector('.lp-hero');
  const tilts = [...document.querySelectorAll('.lp-tilt')];
  let pending = null, raf = 0;
  function apply() {
    raf = 0;
    const e = pending; pending = null; if (!e) return;
    if (hero) {
      const r = hero.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) { hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%'); hero.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%'); }
    }
    for (const el of tilts) {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) { if (el.classList.contains('is-tilted')) { el.classList.remove('is-tilted'); el.style.transform = ''; el.style.removeProperty('--sx'); el.style.removeProperty('--sy'); } continue; }
      const { rx, ry } = lpTiltFor(e.clientX - r.left, e.clientY - r.top, r.width, r.height, 3);
      el.classList.add('is-tilted');
      el.style.transform = `perspective(1400px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      el.style.setProperty('--sx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--sy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }
  }
  window.addEventListener('pointermove', e => { pending = e; if (!raf) raf = requestAnimationFrame(apply); }, { passive: true });
}

// Fly `packet` (absolute inside `frame`) from the centre of `from` to the centre of `to`.
// Resolves when it lands; one jump under reduced motion.
function lpFly(packet, frame, from, to, ms) {
  const f = frame.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left - f.left + a.width / 2, y0 = a.top - f.top + a.height / 2, x1 = b.left - f.left + b.width / 2, y1 = b.top - f.top + b.height / 2;
  packet.classList.remove('hidden');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !packet.animate) { packet.style.transform = `translate(${x1}px, ${y1}px)`; return Promise.resolve(); }
  const anim = packet.animate([{ transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, offset: .12 }, { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 1, offset: .9 }, { transform: `translate(${x1}px, ${y1}px) scale(.4)`, opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  return anim.finished.catch(() => {});
}

// Count a number up from zero over `ms`, formatting each frame with `fmt`.
function lpCountUp(el, target, fmt, ms) {
  const t0 = performance.now();
  const step = now => { const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3); el.textContent = fmt(target * e); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ── money, as the Deals page formats it ─────────────────────────────────────
function lpFmtEur(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
function lpFmtEurShort(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' M €';
  if (n >= 1e3) return Math.round(n / 1e3) + ' k €';
  return lpFmtEur(n);
}

// ── the board ───────────────────────────────────────────────────────────────
// cards: [{ value, won }] → open and won sums, counts, and the won share in percent.
function lpBoardStats(cards) {
  let open = 0, won = 0, openN = 0, wonN = 0;
  for (const c of cards) { if (c.won) { won += c.value; wonN++; } else { open += c.value; openN++; } }
  const total = openN + wonN;
  return { open, won, openN, wonN, total, rate: total ? Math.round((wonN / total) * 100) : 0 };
}

// Move `el` into `parent` (before `before`) and animate it from where it was: FLIP.
function lpFlip(el, parent, before, reduce) {
  const a = el.getBoundingClientRect();
  if (before) parent.insertBefore(el, before); else parent.appendChild(el);
  if (reduce) return;
  const b = el.getBoundingClientRect();
  const dx = a.left - b.left, dy = a.top - b.top;
  if (!dx && !dy) return;
  el.style.transition = 'none'; el.style.transform = `translate(${dx}px, ${dy}px)`;
  requestAnimationFrame(() => { el.style.transition = 'transform .55s cubic-bezier(.32,.72,0,1)'; el.style.transform = ''; });
  el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
}

// Ease for the demonstration cursor.
function lpEase(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function lpInitBoard() {
  const board = document.getElementById('lp-board');
  if (!board) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cols = [...board.querySelectorAll('.lp-col')];
  const toast = document.getElementById('lp-toast');
  const engine = document.getElementById('lp-engine-line');
  const statsLine = document.getElementById('lp-stats-line');
  const cursor = document.getElementById('lp-cursor');
  const hero = board.querySelector('.lp-card[data-hero]');
  const home = new Map([...board.querySelectorAll('.lp-card')].map(c => [c, { parent: c.parentElement, next: c.nextElementSibling }]));
  let toastTimer = 0, engineTimer = 0, undo = null, demo = null;

  function refresh() {
    const all = [];
    for (const c of cols) {
      const cards = [...c.querySelectorAll('.lp-card')];
      const won = c.dataset.stage === 'won';
      let sum = 0;
      for (const card of cards) { const v = Number(card.dataset.value) || 0; sum += v; all.push({ value: v, won }); }
      c.querySelector('.lp-col-count').textContent = cards.length + ' ' + lpT(cards.length === 1 ? 'lp_deal_one' : 'lp_deal_many');
      c.querySelector('.lp-col-sum').textContent = lpFmtEurShort(sum);
    }
    const s = lpBoardStats(all);
    if (statsLine) statsLine.textContent = lpT('lp_stats_line', { open: lpFmtEurShort(s.open), n: s.openN, won: lpFmtEurShort(s.won), rate: s.rate });
  }
  lpRerender.push(refresh);

  function showToast(stageName, undoFn) {
    if (!toast) return;
    undo = undoFn;
    toast.querySelector('.lp-toast-text').textContent = lpT('lp_toast_moved', { stage: stageName });
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
  }
  toast?.querySelector('.lp-toast-undo')?.addEventListener('click', () => { undo?.(); undo = null; toast.classList.add('hidden'); });

  function deliver() {
    const wonCol = cols.find(c => c.dataset.stage === 'won');
    if (wonCol && !reduce) { wonCol.classList.remove('is-flash'); void wonCol.offsetWidth; wonCol.classList.add('is-flash'); }
    if (!engine) return;
    engine.classList.remove('is-done'); engine.classList.add('is-busy');
    engine.querySelector('span').textContent = lpT('lp_delivery_pending');
    clearTimeout(engineTimer);
    engineTimer = setTimeout(() => { engine.classList.remove('is-busy'); engine.classList.add('is-done'); engine.querySelector('span').textContent = lpT('lp_delivery_done'); }, 900);
  }
  function resetEngine() {
    if (!engine) return;
    clearTimeout(engineTimer);
    engine.classList.remove('is-busy', 'is-done');
    engine.querySelector('span').textContent = lpT('lp_delivery_idle');
  }

  // Move a card into a column (optionally before a sibling), announce, deliver if it reached Won.
  function place(card, c, before, { quiet = false } = {}) {
    const from = card.parentElement, next = card.nextElementSibling;
    lpFlip(card, c.querySelector('.lp-col-cards'), before, reduce);
    card.classList.toggle('is-won', c.dataset.stage === 'won');
    refresh();
    if (from === card.parentElement) return;
    if (!quiet) showToast(c.querySelector('h3').textContent, () => { from.insertBefore(card, next && next.parentElement === from ? next : null); card.classList.toggle('is-won', from.closest('.lp-col').dataset.stage === 'won'); refresh(); });
    if (c.dataset.stage === 'won') deliver();
  }

  // ── the demonstration: a visible cursor drags the deal into Won, once ──
  function stopDemo() {
    if (!demo) return;
    cancelAnimationFrame(demo.raf); clearTimeout(demo.timer);
    demo.card.classList.remove('is-lifted'); demo.card.style.transform = '';
    cursor?.classList.add('hidden');
    board.classList.remove('is-demo');
    demo = null;
  }
  function runDemo() {
    if (!hero || !cursor || reduce) return;
    stopDemo();
    const won = cols.find(c => c.dataset.stage === 'won');
    if (!won || hero.closest('.lp-col') === won) return;
    board.classList.add('is-demo');
    const b = board.getBoundingClientRect(), r = hero.getBoundingClientRect(), w = won.querySelector('.lp-col-cards').getBoundingClientRect();
    const from = { x: r.left - b.left + r.width * 0.55, y: r.top - b.top + r.height * 0.5 };
    const to = { x: w.left - b.left + w.width * 0.5, y: w.top - b.top + 24 + r.height * 0.5 };
    cursor.style.transform = `translate(${from.x}px, ${from.y}px)`;
    cursor.classList.remove('hidden');
    demo = { card: hero, raf: 0, timer: 0 };
    demo.timer = setTimeout(() => {
      hero.classList.add('is-lifted');
      const t0 = performance.now(), dur = 1300;
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = lpEase(t);
        const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
        hero.style.transform = `translate(${x - from.x}px, ${y - from.y}px)`;
        if (t < 1) { demo.raf = requestAnimationFrame(step); return; }
        hero.style.transform = ''; hero.classList.remove('is-lifted');
        place(hero, won, won.querySelector('.lp-col-cards').firstElementChild, { quiet: true });
        demo.timer = setTimeout(() => { cursor.classList.add('hidden'); board.classList.remove('is-demo'); demo = null; }, 500);
      };
      demo.raf = requestAnimationFrame(step);
    }, 500);
  }
  function resetBoard() {
    stopDemo();
    for (const [card, h] of home) { h.parent.insertBefore(card, h.next && h.next.parentElement === h.parent ? h.next : null); card.classList.toggle('is-won', h.parent.closest('.lp-col').dataset.stage === 'won'); }
    toast?.classList.add('hidden'); resetEngine(); refresh();
  }

  // ── pointer drag: lifted into a fixed layer, a placeholder keeps the slot, the column under the pointer highlights ──
  let drag = null;
  board.addEventListener('pointerdown', e => {
    const card = e.target.closest('.lp-card');
    if (!card || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopDemo();
    const r = card.getBoundingClientRect();
    drag = { card, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false, ph: null, over: null };
    card.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      const ph = document.createElement('div');
      ph.className = 'lp-card-ph'; ph.style.height = drag.h + 'px';
      drag.card.after(ph); drag.ph = ph;
      drag.card.classList.add('is-dragging'); drag.card.style.width = drag.w + 'px';
      board.classList.add('is-dragging');
    }
    e.preventDefault();
    drag.card.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const c = under?.closest('.lp-col');
    if (drag.over && drag.over !== c) drag.over.classList.remove('is-over');
    drag.over = c || null;
    if (!c) return;
    c.classList.add('is-over');
    const w = c.querySelector('.lp-col-cards');
    const others = [...w.querySelectorAll('.lp-card:not(.is-dragging)')];
    const before = others.find(o => { const b = o.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (before) w.insertBefore(drag.ph, before); else w.appendChild(drag.ph);
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { card, ph, over, moved } = drag;
    drag = null;
    if (!moved) return;
    card.classList.remove('is-dragging'); card.style.transform = ''; card.style.width = '';
    board.classList.remove('is-dragging'); over?.classList.remove('is-over');
    const c = ph.closest('.lp-col');
    const next = ph.nextElementSibling;
    ph.remove();
    place(card, c, next);
    card.focus({ preventScroll: true });
  };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);

  // Keyboard: left and right move the focused card one column.
  board.addEventListener('keydown', e => {
    const card = e.target.closest('.lp-card');
    if (!card || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    stopDemo();
    const i = cols.indexOf(card.closest('.lp-col')), j = i + (e.key === 'ArrowRight' ? 1 : -1);
    if (j < 0 || j >= cols.length) return;
    place(card, cols[j]);
    card.focus({ preventScroll: true });
  });

  document.getElementById('lp-demo-replay')?.addEventListener('click', () => { resetBoard(); runDemo(); });
  refresh();
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); runDemo(); } }, { threshold: 0.6 });
    io.observe(board);
  }
}

// ── the deal record: tabs, tasks that tick, a note that saves ───────────────
function lpInitRecord() {
  const rec = document.getElementById('lp-record');
  if (!rec) return;
  const tabs = [...rec.querySelectorAll('[role="tab"]')];
  const panels = [...rec.querySelectorAll('[role="tabpanel"]')];
  function select(tab) {
    tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    panels.forEach(p => p.classList.toggle('hidden', p.id !== tab.getAttribute('aria-controls')));
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(n); n.focus();
    });
  });

  const progress = rec.querySelector('.lp-task-progress'), bar = rec.querySelector('.lp-task-bar i');
  function refreshTasks() {
    const rows = [...rec.querySelectorAll('.lp-task')];
    const done = rows.filter(r => r.querySelector('input').checked).length;
    rows.forEach(r => r.classList.toggle('is-done', r.querySelector('input').checked));
    if (progress) progress.textContent = lpT('lp_tasks_progress', { d: done, n: rows.length });
    if (bar) bar.style.width = (rows.length ? (done / rows.length) * 100 : 0) + '%';
    const open = rec.querySelector('.lp-ov-open');
    if (open) open.textContent = String(rows.length - done);
  }
  rec.querySelectorAll('.lp-task input').forEach(cb => cb.addEventListener('change', refreshTasks));
  lpRerender.push(refreshTasks);

  const ta = rec.querySelector('.lp-composer textarea'), save = rec.querySelector('.lp-composer .lp-note-save'), list = rec.querySelector('.lp-timeline');
  const chips = [...rec.querySelectorAll('.lp-composer .lp-type-chip')];
  chips.forEach(c => c.addEventListener('click', () => chips.forEach(x => x.setAttribute('aria-pressed', String(x === c)))));
  function saveNote() {
    const text = (ta?.value || '').trim();
    if (!text || !list) return;
    const type = chips.find(c => c.getAttribute('aria-pressed') === 'true')?.dataset.type || 'note';
    const li = document.createElement('li');
    li.className = 'lp-tl-item is-new';
    const ic = document.createElement('span'); ic.className = 'lp-tl-ic type-' + type; li.appendChild(ic);
    const body = document.createElement('div');
    const meta = document.createElement('p'); meta.className = 'lp-tl-meta';
    const t = document.createElement('b'); t.textContent = lpT({ note: 'lp_type_note', call: 'lp_type_call', email: 'lp_type_email', wa: 'lp_type_wa' }[type] || 'lp_type_note');
    meta.appendChild(t); meta.appendChild(document.createTextNode(' Mara Kühn, ' + lpT('lp_tl_now')));
    const p = document.createElement('p'); p.className = 'lp-tl-text'; p.textContent = text;
    body.appendChild(meta); body.appendChild(p); li.appendChild(body);
    list.prepend(li);
    ta.value = '';
    const latest = rec.querySelector('.lp-ov-latest-text');
    if (latest) latest.textContent = text;
  }
  save?.addEventListener('click', saveNote);
  ta?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveNote(); } });
  refreshTasks();
}

// ── leads: one button, three real payload shapes, the webhook's own mapping ──
// Dot-path lookup, as routes/integrations.js reads mapped keys ("data.email").
function lpGetPath(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((o, k) => (o !== null && o !== undefined && typeof o === 'object' && k in o ? o[k] : undefined), obj);
}

// map: { name: 'full_name', email: 'contact.email', ... } → the captured fields, the
// keys that were not in the payload, and whether the lead is accepted (name or email).
function lpMapLead(payload, map) {
  const fields = {}, missing = [];
  for (const [field, key] of Object.entries(map || {})) {
    if (!key) continue;
    const v = lpGetPath(payload, key);
    if (v === undefined || v === null || v === '') missing.push(key); else fields[field] = String(v);
  }
  return { ok: Boolean(fields.name || fields.email), fields, missing };
}

function lpInitLeads() {
  const root = document.getElementById('leads');
  if (!root) return;
  const frame = root.querySelector('#lp-flow-leads'), btn = root.querySelector('#lp-lead-send'), packet = root.querySelector('#lp-lead-packet');
  const target = root.querySelector('#lp-lead-target'), card = root.querySelector('#lp-lead-card'), fields = root.querySelector('#lp-lead-fields'), chips = root.querySelector('#lp-lead-chips');
  const sources = [...root.querySelectorAll('.lp-source')];
  let i = 0, last = null, busy = false;
  // Each source hands over one of the real payload shapes; the card shows what the webhook made of it.
  function paint(preset) {
    last = preset;
    const r = lpMapLead(preset.payload, preset.map);
    if (fields) {
      fields.textContent = '';
      for (const [f, v] of Object.entries(r.fields)) {
        const dt = document.createElement('dt'); dt.textContent = lpT('lp_f_' + f);
        const dd = document.createElement('dd'); dd.textContent = v;
        fields.appendChild(dt); fields.appendChild(dd);
      }
    }
    if (chips) {
      chips.textContent = '';
      for (const text of [lpT('lp_lead_owner'), lpT('lp_lead_deal', { stage: lpT('lp_col_new') })]) { const c = document.createElement('span'); c.className = 'lp-chip'; c.textContent = text; chips.appendChild(c); }
    }
  }
  async function send() {
    if (busy) return;
    busy = true;
    const src = sources[i % sources.length], preset = LP_LEAD_PRESETS[i % LP_LEAD_PRESETS.length];
    i++;
    sources.forEach(el => el.classList.toggle('is-on', el === src));
    card?.classList.remove('is-in');
    if (frame && packet && target) await lpFly(packet, frame, src, target, 900);
    packet?.classList.add('hidden');
    paint(preset);
    if (card) { void card.offsetWidth; card.classList.add('is-in'); }
    target?.classList.remove('is-hit'); void target?.offsetWidth; target?.classList.add('is-hit');
    busy = false;
  }
  btn?.addEventListener('click', send);
  sources.forEach((el, k) => el.addEventListener('click', () => { i = k; send(); }));
  lpRerender.push(() => { if (last) paint(last); });
  paint(LP_LEAD_PRESETS[0]); card?.classList.add('is-in'); i = 1;
}

// ── contacts: search, pick, see the history, reach them ─────────────────────
// The list filters on name and company as the Contacts table does; the card shows the
// picked contact, their deals and history; Anrufen / E-Mail / WhatsApp open a bubble with
// the number, the address, or the WhatsApp template filled in with the name and the deal.
function lpInitContacts() {
  const root = document.getElementById('contacts');
  if (!root) return;
  const q = sel => root.querySelector(sel);
  const rows = q('#lp-ct-rows'), none = q('#lp-ct-none'), input = q('#lp-ct-q'), card = q('#lp-ct-card');
  const bubble = q('#lp-ct-bubble'), bubLabel = q('#lp-ct-bubble-label'), bubText = q('#lp-ct-bubble-text');
  const acts = [...root.querySelectorAll('.lp-ct-act')];
  const TYPE = { note: 'lp_type_note', call: 'lp_type_call', email: 'lp_type_email', wa: 'lp_type_wa' };
  let current = LP_CONTACTS[0], act = null, query = '';
  const initial = c => c.name.trim().charAt(0).toUpperCase();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function matches(c) { const n = query.trim().toLowerCase(); return !n || c.name.toLowerCase().includes(n) || c.company.toLowerCase().includes(n); }
  function renderList() {
    if (!rows) return;
    rows.textContent = '';
    const hits = LP_CONTACTS.filter(matches);
    for (const c of hits) {
      const li = el('li', 'lp-ct-row' + (c === current ? ' is-on' : '')); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(c === current)); li.tabIndex = 0; li.dataset.id = String(c.id);
      li.appendChild(el('i', 'lp-av', initial(c)));
      const box = el('div'); box.appendChild(el('b', null, c.name)); box.appendChild(el('span', null, c.company || lpT('lp_ct_private')));
      li.appendChild(box);
      const pick = () => { current = c; act = null; renderList(); renderCard(true); };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      rows.appendChild(li);
    }
    none?.classList.toggle('hidden', hits.length > 0);
  }
  function renderCard(animate) {
    const c = current;
    const av = q('#lp-ct-av'), name = q('#lp-ct-name'), company = q('#lp-ct-company'), deals = q('#lp-ct-deals'), hist = q('#lp-ct-hist');
    if (av) av.textContent = initial(c);
    if (name) name.textContent = c.name;
    if (company) company.textContent = c.company || lpT('lp_ct_private');
    if (deals) { deals.textContent = ''; for (const d of c.deals) { const li = el('li'); li.appendChild(el('b', null, d.title)); li.appendChild(el('span', 'lp-stagepill', lpT(d.stage))); deals.appendChild(li); } }
    if (hist) { hist.textContent = ''; for (const hh of c.history) { const li = el('li'); li.appendChild(el('span', 'lp-type-tag lp-type-' + hh.type, lpT(TYPE[hh.type]))); li.appendChild(el('b', null, lpT(hh.key))); li.appendChild(el('time', null, lpT('lp_wd' + hh.day) + ' ' + hh.time)); hist.appendChild(li); } }
    acts.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.act === act)));
    if (bubble) {
      bubble.classList.toggle('hidden', !act);
      if (act && bubLabel && bubText) {
        bubLabel.textContent = lpT(act === 'call' ? 'lp_ct_bub_call' : act === 'mail' ? 'lp_ct_bub_mail' : 'lp_ct_bub_wa');
        bubText.textContent = act === 'call' ? c.phone : act === 'mail' ? c.email : lpT('lp_ct_tpl', { name: c.name, deal: c.deals[0]?.title || '' });
      }
    }
    if (card && animate) { card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in'); }
  }
  acts.forEach(b => b.addEventListener('click', () => { act = act === b.dataset.act ? null : b.dataset.act; renderCard(false); }));
  input?.addEventListener('input', () => { query = input.value; renderList(); });
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = LP_CONTACTS.find(matches); if (first) { current = first; act = null; renderList(); renderCard(true); } } });
  lpRerender.push(() => { renderList(); renderCard(false); });
  renderList(); renderCard(false); card?.classList.add('is-in');
}

// ── numbers: three periods of figures ───────────────────────────────────────
function lpInitAnalytics() {
  const root = document.getElementById('numbers');
  if (!root) return;
  let period = 6;
  const q = s => root.querySelector(s);
  const months = n => { const all = LP_MONTHS[lpLang] || LP_MONTHS.en; const end = 9; const out = []; for (let i = n - 1; i >= 0; i--) out.push(all[((end - i) % 12 + 12) % 12]); return out; };
  const svgNS = 'http://www.w3.org/2000/svg';
  const stageKeys = ['lp_col_new', 'lp_col_offer', 'lp_col_nego', 'lp_col_won'];
  const tip = q('#lp-an-tip');
  let pts = [];

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let animateNext = false;   // the first render in view counts the figures up; later renders set them
  function figure(sel, value, fmt) { const el = q(sel); if (animateNext && !reduce) lpCountUp(el, value, fmt, 900); else el.textContent = fmt(value); }
  function render() {
    const a = LP_ANALYTICS[period];
    root.querySelectorAll('.lp-period-btn').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.period) === period)));
    figure('#lp-an-open', a.open, lpFmtEurShort);
    figure('#lp-an-won', a.won, lpFmtEurShort);
    figure('#lp-an-rate', a.rate, v => Math.round(v) + ' %');
    figure('#lp-an-new', a.newDeals, v => String(Math.round(v)));
    animateNext = false;

    const funnel = q('#lp-an-funnel'); funnel.textContent = '';
    const max = a.funnel[0];
    a.funnel.forEach((n, i) => {
      const row = document.createElement('li'); row.className = 'lp-funnel-row s' + (i + 1);
      const label = document.createElement('span'); label.className = 'lp-funnel-label'; label.textContent = lpT(stageKeys[i]);
      const bar = document.createElement('span'); bar.className = 'lp-funnel-bar'; const fill = document.createElement('i'); fill.style.width = Math.max(4, (n / max) * 100) + '%'; bar.appendChild(fill);
      const val = document.createElement('span'); val.className = 'lp-funnel-val'; val.textContent = String(n);
      row.appendChild(label); row.appendChild(bar); row.appendChild(val);
      if (i < a.funnel.length - 1) { const hint = document.createElement('span'); hint.className = 'lp-funnel-hint'; hint.textContent = lpT('lp_an_funnel_hint', { p: Math.round((a.funnel[i + 1] / n) * 100), stage: lpT(stageKeys[i + 1]) }); row.appendChild(hint); }
      funnel.appendChild(row);
    });
    const lost = document.createElement('li'); lost.className = 'lp-funnel-row is-lost';
    const ll = document.createElement('span'); ll.className = 'lp-funnel-label'; ll.textContent = lpT('lp_an_lost');
    const lb = document.createElement('span'); lb.className = 'lp-funnel-bar'; const lf = document.createElement('i'); lf.style.width = Math.max(4, (a.lost / max) * 100) + '%'; lb.appendChild(lf);
    const lv = document.createElement('span'); lv.className = 'lp-funnel-val'; lv.textContent = String(a.lost);
    lost.appendChild(ll); lost.appendChild(lb); lost.appendChild(lv); funnel.appendChild(lost);

    const svg = q('#lp-an-line'); svg.textContent = '';
    const W = 560, H = 180, padL = 30, padR = 12, padT = 12, padB = 26;
    const xs = a.rates.map((_, i) => padL + (i * (W - padL - padR)) / Math.max(1, a.rates.length - 1));
    const ys = a.rates.map(r => padT + (H - padT - padB) * (1 - r / 60));
    for (const g of [0, 20, 40, 60]) {
      const y = padT + (H - padT - padB) * (1 - g / 60);
      const line = document.createElementNS(svgNS, 'line'); line.setAttribute('x1', padL); line.setAttribute('x2', W - padR); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('class', 'lp-grid'); svg.appendChild(line);
      const t = document.createElementNS(svgNS, 'text'); t.setAttribute('x', padL - 6); t.setAttribute('y', y + 3); t.setAttribute('class', 'lp-axis'); t.textContent = g + ' %'; svg.appendChild(t);
    }
    const area = document.createElementNS(svgNS, 'path');
    area.setAttribute('d', `M${xs[0]},${H - padB} ` + xs.map((x, i) => `L${x},${ys[i]}`).join(' ') + ` L${xs[xs.length - 1]},${H - padB} Z`);
    area.setAttribute('class', 'lp-area'); svg.appendChild(area);
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', xs.map((x, i) => (i ? 'L' : 'M') + x + ',' + ys[i]).join(' '));
    path.setAttribute('class', 'lp-line'); svg.appendChild(path);
    const labels = months(a.rates.length);
    pts = [];
    xs.forEach((x, i) => {
      const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', ys[i]); c.setAttribute('r', 3.5); c.setAttribute('class', 'lp-pt'); svg.appendChild(c);
      const t = document.createElementNS(svgNS, 'text'); t.setAttribute('x', x); t.setAttribute('y', H - 8); t.setAttribute('class', 'lp-axis lp-axis-x'); t.textContent = labels[i]; svg.appendChild(t);
      pts.push({ x, y: ys[i], dot: c, i });
    });
    const cursor = document.createElementNS(svgNS, 'line'); cursor.setAttribute('class', 'lp-cursor-line hidden'); cursor.setAttribute('y1', padT); cursor.setAttribute('y2', H - padB); svg.appendChild(cursor);
    svg.__cursor = cursor; svg.__W = W; svg.__labels = labels; svg.__a = a;
  }

  const svg = q('#lp-an-line');
  svg?.addEventListener('pointermove', e => {
    if (!pts.length || !tip) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * svg.__W;
    let best = pts[0]; for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    pts.forEach(p => p.dot.classList.toggle('is-on', p === best));
    svg.__cursor.setAttribute('x1', best.x); svg.__cursor.setAttribute('x2', best.x); svg.__cursor.classList.remove('hidden');
    const a = svg.__a;
    tip.textContent = lpT('lp_an_tip', { month: svg.__labels[best.i], rate: a.rates[best.i], won: a.wonM[best.i], lost: a.lostM[best.i] });
    tip.classList.remove('hidden');
    tip.style.left = Math.min(Math.max(0, (best.x / svg.__W) * r.width - tip.offsetWidth / 2), r.width - tip.offsetWidth) + 'px';
  });
  svg?.addEventListener('pointerleave', () => { tip?.classList.add('hidden'); svg.__cursor?.classList.add('hidden'); pts.forEach(p => p.dot.classList.remove('is-on')); });

  root.querySelectorAll('.lp-period-btn').forEach(b => b.addEventListener('click', () => { period = Number(b.dataset.period) || 6; animateNext = true; render(); }));
  lpRerender.push(render);
  render();
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); animateNext = true; render(); } }, { threshold: 0.4 });
    io.observe(root);
  }
}

// ── from our system to the next ─────────────────────────────────────────────
// Closing the deal moves it to Won; a packet travels to the next system, which confirms.
// The real transfer behind this is utils/engine.js; the page shows the handshake, not the code.
function lpInitEngine() {
  const root = document.getElementById('engine');
  if (!root) return;
  const q = sel => root.querySelector(sel);
  const frame = q('#lp-flow-engine'), from = q('#lp-en-from'), to = q('#lp-en-to'), packet = q('#lp-en-packet'), stage = q('#lp-en-stage'), state = q('#lp-en-state'), receipt = q('#lp-en-receipt');
  let phase = 'idle', busy = false;
  const paint = () => {
    if (state) state.textContent = lpT(phase === 'idle' ? 'lp_en_idle' : phase === 'pending' ? 'lp_en_pending' : 'lp_en_done');
    if (stage) { stage.textContent = lpT(phase === 'idle' ? 'lp_col_nego' : 'lp_col_won'); stage.classList.toggle('is-won', phase !== 'idle'); }
  };
  lpRerender.push(paint);
  async function close() {
    if (busy) return;
    busy = true;
    frame?.classList.remove('is-done'); receipt?.classList.remove('is-in');
    phase = 'pending'; paint();
    frame?.classList.add('is-pending');
    if (frame && packet && from && to) await lpFly(packet, frame, from, to, 1100);
    packet?.classList.add('hidden');
    frame?.classList.remove('is-pending'); frame?.classList.add('is-done');
    receipt?.classList.add('is-in');
    phase = 'done'; paint();
    busy = false;
  }
  q('#lp-en-send')?.addEventListener('click', close);
  paint();
}

// ── how it works: one task in four steps ────────────────────────────────────
// The steps on the left explain; the frame on the right shows each one as the app draws
// it (the form, the list, the week, the tick). The walkthrough plays once when the stage
// is in view (a bar under the step that is on counts the seconds down) and stops at the
// last step; clicking a step takes over. Inside the frame, the form's button creates the
// task (step 2), the new row's tick completes it (step 4), the toast's undo reopens it,
// and All / My tasks filters the rows, as the Tasks page does. Reduced motion: no play.
function lpInitWork() {
  const root = document.getElementById('work');
  if (!root) return;
  const q = sel => root.querySelector(sel);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = q('#lp-how'), steps = [...root.querySelectorAll('.lp-how-step')], shots = [...root.querySelectorAll('.lp-shot')];
  const STEP_MS = 4800;
  let i = 0, timer = 0, auto = false;
  function stop() { clearTimeout(timer); timer = 0; auto = false; stage?.classList.remove('is-auto'); }
  // light the step, show its screen (popping in), fill the rail to it
  function show(n, manual) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach((s, k) => { const on = k === i; s.classList.toggle('is-on', on); s.classList.toggle('is-past', k < i); s.setAttribute('aria-selected', String(on)); s.tabIndex = on ? 0 : -1; });
    shots.forEach((p, k) => { const on = k === i; p.classList.toggle('hidden', !on); if (on && !reduce) { p.classList.remove('is-in'); void p.offsetWidth; p.classList.add('is-in'); } });
    stage?.style.setProperty('--lp-how-prog', String(steps.length > 1 ? i / (steps.length - 1) : 0));
    if (manual) stop();
  }
  function play() {
    if (reduce) return;
    stop(); auto = true; stage?.classList.add('is-auto');
    const next = () => { if (!auto) return; if (i >= steps.length - 1) { stop(); return; } show(i + 1); timer = setTimeout(next, STEP_MS); };
    show(0); timer = setTimeout(next, STEP_MS);
  }
  steps.forEach((s, k) => {
    s.addEventListener('click', () => show(k, true));
    s.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(k, true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const j = (k + (e.key === 'ArrowDown' ? 1 : steps.length - 1)) % steps.length;
      show(j, true); steps[j].focus();
    });
  });
  // inside the frame: the app's own controls move the walkthrough on
  q('#lp-how-create')?.addEventListener('click', () => show(1, true));
  const tick = q('#lp-how-tick');
  tick?.addEventListener('change', () => { if (!tick.checked) return; stop(); timer = setTimeout(() => { tick.checked = false; show(3, true); }, reduce ? 0 : 350); });
  q('#lp-how-undo')?.addEventListener('click', () => show(1, true));
  const list = q('#lp-how-list'), scopes = [...root.querySelectorAll('.lp-how-scope')];
  scopes.forEach(b => b.addEventListener('click', () => { scopes.forEach(x => x.setAttribute('aria-pressed', String(x === b))); list?.classList.toggle('is-mine', b.dataset.scope === 'mine'); }));
  const progress = q('#lp-how-progress');
  lpRerender.push(() => { if (progress) progress.textContent = lpT('lp_tasks_progress', { d: 3, n: 4 }); });
  show(0);
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); play(); } }, { threshold: 0.35 });
    io.observe(stage || root);
  }
}

// ── boot ────────────────────────────────────────────────────────────────────
function lpInit() {
  document.body.classList.add('lp');
  document.querySelectorAll('.lp-lang-btn').forEach(b => b.addEventListener('click', () => lpSetLang(b.dataset.lang)));
  lpInitNav();
  lpInitReveal();
  lpInitRecord();
  lpInitLeads();
  lpInitContacts();
  lpInitAnalytics();
  lpInitEngine();
  lpInitWork();
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch {}
  lpApplyLang(saved || 'de');
  lpInitBoard();   // after the language, so its first paint reads it
  lpInitFx();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', lpInit);
