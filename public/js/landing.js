/* ═══════════════════════════════════════════════════════════════════════════
   LANDING PAGE (/landingpage) — standalone: no app scripts, no API calls.
   Part 18, 2026-10-14: from scratch. The scroll tells the story.

   One opening screen, then three acts. Each act is a tall section with a
   screen pinned inside it; the act's scroll progress (0 → 1 while pinned)
   drives the product on that screen, forwards and backwards:
     leads   a lead flies from each ad platform into the board's first column
             and lands as the card the inbound webhook would make (the payload
             mapped through the webhook's own dot paths), one per fifth of the
             scroll
     deal    the record walks seven phases: the WhatsApp template, a task that
             lands in the list and the overview, a note in the timeline, then
             the booking dialog in place (a free day, the 11:00 clash with the
             team calendar, a clean 14:00) and the booked meeting as the newest
             entry with the join link; the words above swap with the phase
     won     the deal card travels from Verhandlung into Gewonnen with the
             scroll, lands and flashes, and the packet reaches the next
             system, which confirms receipt (the real transfer: utils/engine.js)
   The first touch of a scene hands it over: from then on the scroll leaves
   it alone and every control works as in the app (drag, tabs, the sheet).
   Reduced motion: nothing pins, every act stands at its end.

   German is the default and the markup text IS the German dictionary (the
   client test checks that key for key). Every string claims only what the
   code does, every string is short, nothing technical appears anywhere.
   ═══════════════════════════════════════════════════════════════════════════ */

const LP_I18N = {
  de: {
    lp_login: 'Anmelden', lp_request: 'Zugang anfragen', lp_request_subject: 'Zugang zu Upgrads CRM', lp_lang: 'Sprache', lp_crm: 'CRM',
    lp_hero_title: 'Gewonnen ist erst der Anfang.',
    lp_hero_sub: 'Ein Deal, vom Werbeklick bis zur Übergabe. Einfach scrollen.',

    lp_a1_t: 'Leads kommen von selbst.', lp_a1_d: 'Aus Facebook, Instagram, TikTok und der Website. Über Make, Zapier oder n8n.',
    lp_src_fb: 'Facebook Ads', lp_src_ig: 'Instagram Ads', lp_src_tt: 'TikTok Ads', lp_src_web: 'Website-Formular', lp_via: 'über',
    lp_lead_from: 'Lead über {src}', lp_lead_fb: 'Lead über Facebook Ads',
    lp_board: 'Vertrieb', lp_board_aria: 'Beispiel-Board. Karten mit der Maus oder den Pfeiltasten verschieben.',
    lp_col_new: 'Neu', lp_col_offer: 'Angebot', lp_col_nego: 'Verhandlung', lp_col_won: 'Gewonnen',
    lp_deal_one: 'Deal', lp_deal_many: 'Deals',
    lp_urg_low: 'Niedrig', lp_urg_medium: 'Mittel', lp_urg_high: 'Hoch', lp_urg_very: 'Sehr dringend',
    lp_stats_line: 'Offen {open} in {n} Deals. Gewonnen {won}. Anteil {rate} %.',
    lp_toast_moved: 'Verschoben nach {stage}', lp_toast_undo: 'Rückgängig',

    lp_a2_t: 'Alles passiert am Deal.', lp_a2b_t: 'Termin in drei Klicks.',
    lp_p0: 'Anrufen, schreiben, WhatsApp mit fertiger Vorlage.',
    lp_p1: 'Eine Aufgabe mit Uhrzeit landet im Teamkalender.',
    lp_p2: 'Eine Notiz. Strg+Enter, und die Geschichte bleibt am Deal.',
    lp_p3: 'Nur Tage mit freien Zeiten aus Cal.com.',
    lp_p4: 'Was im Teamkalender steht, zeigt der Dialog vorher an.',
    lp_p5: 'Eine freie Zeit. Die Einladung schickt Cal.com.',
    lp_p6: 'Gebucht. Der Link zum Meeting hängt am Termin.',
    lp_deal_name: 'Elbstraße 12, 3 Zimmer', lp_deal_created: 'Angelegt vor 11 Tagen',
    lp_act_call: 'Anrufen', lp_act_email: 'E-Mail', lp_act_wa: 'WhatsApp', lp_act_book: 'Termin buchen',
    lp_call_label: 'Ruft an', lp_mail_label: 'Schreibt an', lp_wa_label: 'WhatsApp, Vorlage vorausgefüllt',
    lp_wa_tpl: 'Guten Tag Jana Weber, danke für die Anfrage zu Elbstraße 12. Beste Grüße, Mara Kühn',
    lp_tab_overview: 'Übersicht', lp_tab_contact: 'Kontakt', lp_tab_tasks: 'Aufgaben', lp_tab_activity: 'Aktivität', lp_tab_objects: 'Objekte',
    lp_kpi_value: 'Deal-Wert', lp_kpi_stage: 'Phase', lp_kpi_urg: 'Dringlichkeit', lp_kpi_owner: 'Zuständig', lp_kpi_last: 'Letzte Aktivität', lp_kpi_last_v: 'vor 2 Std.',
    lp_ov_next: 'Nächste Aufgaben', lp_ov_latest: 'Letzte Aktivität',
    lp_f_email: 'E-Mail', lp_f_phone: 'Telefon', lp_f_owner: 'Zuständig', lp_f_last: 'Letzter Kontakt', lp_f_last_v: 'gestern, 15:20',
    lp_supplier: 'Lieferant', lp_supplier_role: 'Notariat',
    lp_tasks_progress: '{d} von {n} erledigt',
    lp_task1: 'Finanzierungsbestätigung anfordern', lp_task1_due: 'Fr, 10:00',
    lp_task2: 'Energieausweis senden', lp_task2_due: 'erledigt',
    lp_task3: 'Notartermin abstimmen', lp_task3_due: 'Di, 14:30',
    lp_prio_high: 'Hoch', lp_prio_medium: 'Mittel',
    lp_task_new: 'Neue Aufgabe', lp_task_title_v: 'Exposé senden', lp_task_due_v: 'Mi, 14:00', lp_task_add: 'Anlegen',
    lp_note_ph: 'Notiz schreiben, Strg+Enter speichert', lp_note_save: 'Speichern', lp_note_preset: 'Finanzierung bestätigt, Notartermin am Dienstag.',
    lp_type_note: 'Notiz', lp_type_call: 'Anruf', lp_type_email: 'E-Mail', lp_type_wa: 'WhatsApp', lp_tl_now: 'gerade eben',
    lp_tl1_meta: 'Mara Kühn, gestern 15:20', lp_tl1_text: 'Kaufpreis besprochen, Finanzierung in Prüfung.',
    lp_tl2_meta: 'Tim Berger, letzte Woche', lp_tl2_text: 'Erstkontakt über das Formular. Sucht 3 Zimmer, Altbau.',
    lp_meet: 'Termin', lp_meet_title: '{type} mit Jana Weber', lp_join: 'Google Meet beitreten', lp_join_link: 'Link zum Termin öffnen',
    lp_obj_title: 'Verknüpfte Objekte', lp_obj_meta: '87 m², 3 Zimmer, Baujahr 1962', lp_obj_open: 'Öffnen',

    lp_bk_title: 'Termin mit Jana Weber buchen', lp_bk_type: 'Terminart', lp_bk_type1: 'Erstgespräch', lp_bk_type2: 'Besichtigung', lp_bk_where: 'Wo', lp_bk_month: 'Oktober 2026',
    lp_bk_time: 'Uhrzeit', lp_bk_slot: '{from} bis {to} ({ampm})', lp_bk_conflict: 'Konflikt: um {time} steht bereits {title} ({who}) im Kalender.', lp_bk_busy: 'Übergabe Kanalweg',
    lp_bk_book: 'Buchen', lp_bk_anyway: 'Trotzdem buchen', lp_bk_cancel: 'Abbrechen', lp_bk_with: 'mit {name}', lp_bk_invite: 'Die Einladung geht an {email}.',
    lp_bk_done: 'Gebucht: {when}. Cal.com schickt die Einladung.',
    lp_wd1: 'Mo', lp_wd2: 'Di', lp_wd3: 'Mi', lp_wd4: 'Do', lp_wd5: 'Fr', lp_wd6: 'Sa', lp_wd7: 'So',

    lp_a3_t: 'Unterschrieben. Weitergemeldet.', lp_a3_d: 'Ein Zug nach Gewonnen, und das nächste System weiß Bescheid.',
    lp_next: 'Nächstes System', lp_next_sub: 'Abwicklung, Buchhaltung, Verwaltung', lp_next_idle: 'Wartet auf einen Deal in Gewonnen', lp_next_pending: 'Wird übertragen', lp_next_done: 'Empfangen und bestätigt', lp_received: 'Empfangen',

    lp_num_t: 'Zahlen nach den eigenen Phasen.', lp_num_d: 'Gewinnquote, Trichter, offene Pipeline. Ohne Tabelle nebenher.',
    lp_an_period: 'Zeitraum', lp_an_period_3: '3 Monate', lp_an_period_6: '6 Monate', lp_an_period_12: '12 Monate',
    lp_an_c_open: 'Offene Pipeline', lp_an_c_won: 'Gewonnener Wert', lp_an_c_rate: 'Gewinnquote', lp_an_c_new: 'Neue Deals',
    lp_an_rate_m: 'Gewinnquote je Monat', lp_an_funnel: 'Trichter', lp_an_lost: 'Verloren', lp_an_funnel_hint: '{p} % weiter zu {stage}',
    lp_an_tip: '{month}: {rate} %, {won} gewonnen, {lost} verloren',

    lp_vs_t: 'Weniger CRM. Mehr Unterschriften.', lp_vs_a: 'Anderswo', lp_vs_b: 'Bei Upgrads',
    lp_vs1a: 'Leads werden abgetippt.', lp_vs1b: 'Leads kommen von selbst an.',
    lp_vs2a: 'Gewonnen ist das Ende.', lp_vs2b: 'Gewonnen ist eine Übergabe.',
    lp_vs3a: 'Aus dem Englischen übersetzt.', lp_vs3b: 'Auf Deutsch gebaut. Englisch einen Klick entfernt.',
    lp_vs4a: 'Die Software bestimmt die Begriffe.', lp_vs4b: 'Phasen, Objekte, Lieferanten heißen wie im Team.',
    lp_vs5a: 'Noch ein Tool für Termine.', lp_vs5b: 'Termine aus dem Deal heraus gebucht.',

    lp_cta_t: 'Nur auf Einladung.', lp_cta_d: 'Zugang anfragen. Der Einladungscode kommt per E-Mail.',
    lp_foot_tag: 'Upgrads CRM. Gewonnen ist erst der Anfang.',
  },
  en: {
    lp_login: 'Log in', lp_request: 'Request access', lp_request_subject: 'Access to Upgrads CRM', lp_lang: 'Language', lp_crm: 'CRM',
    lp_hero_title: 'Won is only the beginning.',
    lp_hero_sub: 'One deal, from the ad click to the hand-over. Just scroll.',

    lp_a1_t: 'Leads arrive on their own.', lp_a1_d: 'From Facebook, Instagram, TikTok and the website. Via Make, Zapier or n8n.',
    lp_src_fb: 'Facebook Ads', lp_src_ig: 'Instagram Ads', lp_src_tt: 'TikTok Ads', lp_src_web: 'Website form', lp_via: 'via',
    lp_lead_from: 'Lead via {src}', lp_lead_fb: 'Lead via Facebook Ads',
    lp_board: 'Sales', lp_board_aria: 'Example board. Move cards with the mouse or the arrow keys.',
    lp_col_new: 'New', lp_col_offer: 'Proposal', lp_col_nego: 'Negotiation', lp_col_won: 'Won',
    lp_deal_one: 'deal', lp_deal_many: 'deals',
    lp_urg_low: 'Low', lp_urg_medium: 'Medium', lp_urg_high: 'High', lp_urg_very: 'Very urgent',
    lp_stats_line: 'Open {open} across {n} deals. Won {won}. Share {rate} %.',
    lp_toast_moved: 'Moved to {stage}', lp_toast_undo: 'Undo',

    lp_a2_t: 'Everything happens on the deal.', lp_a2b_t: 'A meeting in three clicks.',
    lp_p0: 'Call, write, WhatsApp with the template filled in.',
    lp_p1: 'A task with a time lands on the team calendar.',
    lp_p2: 'A note. Ctrl+Enter, and the story stays on the deal.',
    lp_p3: 'Only days with free times, from Cal.com.',
    lp_p4: 'Whatever the team calendar holds, the dialog shows first.',
    lp_p5: 'A free time. Cal.com sends the invitation.',
    lp_p6: 'Booked. The meeting link sits on the entry.',
    lp_deal_name: 'Elbstraße 12, 3 rooms', lp_deal_created: 'Created 11 days ago',
    lp_act_call: 'Call', lp_act_email: 'Email', lp_act_wa: 'WhatsApp', lp_act_book: 'Book meeting',
    lp_call_label: 'Calls', lp_mail_label: 'Writes to', lp_wa_label: 'WhatsApp, template filled in',
    lp_wa_tpl: 'Hello Jana Weber, thank you for the enquiry about Elbstraße 12. Best regards, Mara Kühn',
    lp_tab_overview: 'Overview', lp_tab_contact: 'Contact', lp_tab_tasks: 'Tasks', lp_tab_activity: 'Activity', lp_tab_objects: 'Listings',
    lp_kpi_value: 'Deal value', lp_kpi_stage: 'Stage', lp_kpi_urg: 'Urgency', lp_kpi_owner: 'Owner', lp_kpi_last: 'Last activity', lp_kpi_last_v: '2 h ago',
    lp_ov_next: 'Next tasks', lp_ov_latest: 'Latest activity',
    lp_f_email: 'Email', lp_f_phone: 'Phone', lp_f_owner: 'Owner', lp_f_last: 'Last contact', lp_f_last_v: 'yesterday, 15:20',
    lp_supplier: 'Supplier', lp_supplier_role: 'Notary office',
    lp_tasks_progress: '{d} of {n} done',
    lp_task1: 'Request financing confirmation', lp_task1_due: 'Fri, 10:00',
    lp_task2: 'Send energy certificate', lp_task2_due: 'done',
    lp_task3: 'Agree the notary appointment', lp_task3_due: 'Tue, 14:30',
    lp_prio_high: 'High', lp_prio_medium: 'Medium',
    lp_task_new: 'New task', lp_task_title_v: 'Send exposé', lp_task_due_v: 'Wed, 14:00', lp_task_add: 'Add',
    lp_note_ph: 'Write a note, Ctrl+Enter saves', lp_note_save: 'Save', lp_note_preset: 'Financing confirmed, notary appointment on Tuesday.',
    lp_type_note: 'Note', lp_type_call: 'Call', lp_type_email: 'Email', lp_type_wa: 'WhatsApp', lp_tl_now: 'just now',
    lp_tl1_meta: 'Mara Kühn, yesterday 15:20', lp_tl1_text: 'Discussed the price, financing under review.',
    lp_tl2_meta: 'Tim Berger, last week', lp_tl2_text: 'First contact through the form. Looking for 3 rooms, period building.',
    lp_meet: 'Meeting', lp_meet_title: '{type} with Jana Weber', lp_join: 'Join Google Meet', lp_join_link: 'Open the meeting link',
    lp_obj_title: 'Linked listings', lp_obj_meta: '87 m², 3 rooms, built 1962', lp_obj_open: 'Open',

    lp_bk_title: 'Book a meeting with Jana Weber', lp_bk_type: 'Event type', lp_bk_type1: 'Intro call', lp_bk_type2: 'Viewing', lp_bk_where: 'Where', lp_bk_month: 'October 2026',
    lp_bk_time: 'Time', lp_bk_slot: '{from} to {to} ({ampm})', lp_bk_conflict: 'Conflict: {time} {title} ({who}) is already on the calendar.', lp_bk_busy: 'Handover Kanalweg',
    lp_bk_book: 'Book', lp_bk_anyway: 'Book anyway', lp_bk_cancel: 'Cancel', lp_bk_with: 'with {name}', lp_bk_invite: 'The invitation goes to {email}.',
    lp_bk_done: 'Booked: {when}. Cal.com sends the invitation.',
    lp_wd1: 'Mon', lp_wd2: 'Tue', lp_wd3: 'Wed', lp_wd4: 'Thu', lp_wd5: 'Fri', lp_wd6: 'Sat', lp_wd7: 'Sun',

    lp_a3_t: 'Signed. Passed on.', lp_a3_d: 'One move into Won, and the next system knows.',
    lp_next: 'Next system', lp_next_sub: 'Fulfilment, accounting, administration', lp_next_idle: 'Waiting for a deal in Won', lp_next_pending: 'Transferring', lp_next_done: 'Received and confirmed', lp_received: 'Received',

    lp_num_t: 'Numbers by your own stages.', lp_num_d: 'Win rate, funnel, open pipeline. No spreadsheet on the side.',
    lp_an_period: 'Period', lp_an_period_3: '3 months', lp_an_period_6: '6 months', lp_an_period_12: '12 months',
    lp_an_c_open: 'Open pipeline', lp_an_c_won: 'Won value', lp_an_c_rate: 'Win rate', lp_an_c_new: 'New deals',
    lp_an_rate_m: 'Win rate per month', lp_an_funnel: 'Funnel', lp_an_lost: 'Lost', lp_an_funnel_hint: '{p} % on to {stage}',
    lp_an_tip: '{month}: {rate} %, {won} won, {lost} lost',

    lp_vs_t: 'Less CRM. More signatures.', lp_vs_a: 'Elsewhere', lp_vs_b: 'At Upgrads',
    lp_vs1a: 'Leads get retyped.', lp_vs1b: 'Leads arrive on their own.',
    lp_vs2a: 'Won is the finish line.', lp_vs2b: 'Won is a hand-over.',
    lp_vs3a: 'Translated from English.', lp_vs3b: 'Built in German. English one click away.',
    lp_vs4a: 'The software picks the words.', lp_vs4b: 'Stages, listings, suppliers named as the team names them.',
    lp_vs5a: 'Another tool for meetings.', lp_vs5b: 'Meetings booked from the deal.',

    lp_cta_t: 'By invitation only.', lp_cta_d: 'Request access. The invite code arrives by email.',
    lp_foot_tag: 'Upgrads CRM. Won is only the beginning.',
  },
};

const LP_MONTHS = {
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

// What each ad platform hands over: a real payload shape and the mapping that reads it (the inbound
// webhook's own dot-path mapping), so the card that lands is what the webhook would make of it.
const LP_LEADS = {
  fb:  { key: 'lp_src_fb',  payload: { data: { lead: { name: 'Lena Hoffmann', email: 'lena.hoffmann@example.de', company: 'Hoffmann Immobilien' } } }, map: { name: 'data.lead.name', email: 'data.lead.email', phone: 'data.lead.phone', company: 'data.lead.company' } },
  ig:  { key: 'lp_src_ig',  payload: { first_name: 'Sofia', last_name: 'Marin', email_address: 'sofia.marin@example.de', phone_number: '+49 160 9876543' }, map: { name: 'first_name', email: 'email_address', phone: 'phone_number', company: 'company_name' } },
  tt:  { key: 'lp_src_tt',  payload: { full_name: 'Jonas Richter', contact: { email: 'jonas.richter@example.de', phone: '+49 171 5550123' } }, map: { name: 'full_name', email: 'contact.email', phone: 'contact.phone', company: 'company' } },
  web: { key: 'lp_src_web', payload: { name: 'Miriam Vogt', email: 'miriam.vogt@example.de', company: 'Vogt & Söhne' }, map: { name: 'name', email: 'email', phone: 'phone', company: 'company' } },
};
const LP_LEAD_ORDER = ['fb', 'ig', 'tt', 'web'];

// Three periods of example figures for the numbers surface.
const LP_ANALYTICS = {
  3:  { open: 1840000, won: 1210000, rate: 46, newDeals: 23, rates: [38, 44, 47], wonM: [5, 7, 8], lostM: [8, 9, 9], funnel: [31, 19, 12, 8], lost: 10 },
  6:  { open: 1840000, won: 2370000, rate: 42, newDeals: 48, rates: [31, 35, 38, 38, 44, 47], wonM: [4, 5, 6, 5, 7, 8], lostM: [9, 9, 10, 8, 9, 9], funnel: [64, 39, 24, 17], lost: 21 },
  12: { open: 1840000, won: 4620000, rate: 38, newDeals: 97, rates: [26, 28, 27, 30, 31, 29, 31, 35, 38, 38, 44, 47], wonM: [3, 3, 3, 4, 4, 3, 4, 5, 6, 5, 7, 8], lostM: [8, 8, 8, 9, 9, 7, 9, 9, 10, 8, 9, 9], funnel: [131, 76, 46, 31], lost: 43 },
};

// The booking month as the dialog draws it: October 2026, Monday first (the 1st is a Thursday, so
// three blanks lead), the 7th is today, the weekdays with free times, the times of a day, the two
// event types' lengths, and the one entry the team calendar already holds (Thursday the 8th, 11:00).
const LP_MEET = { month: 10, lead: 3, days: 31, today: 7, free: [8, 12, 13, 14, 15, 19, 20, 21, 22, 26, 27, 28, 29], slots: ['09:00', '10:00', '11:00', '14:00', '15:30'], types: { 1: 30, 2: 60 }, busy: { day: 8, time: '11:00', key: 'lp_bk_busy', who: 'Tim Berger' } };
const LP_CONTACT = { name: 'Jana Weber', email: 'jana.weber@example.de', phone: '+49 171 2345678' };

let lpLang = 'de';
const lpRerender = [];   // functions that repaint script-generated text when the language changes
const LP_ACTS = {};      // act name → the function the scroll drives with its progress (0..1)
const LP_REC = {};       // what the record lets the acts do (filled by lpInitRecord)
const LP_BOOK = {};      // what the booking sheet lets the acts do (filled by lpInitBooking)

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

// ── small helpers ───────────────────────────────────────────────────────────
const lpReduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lpEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const lpSvg = id => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'lp-ic lp-ic-sm'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; };
function lpFmtEur(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
function lpFmtEurShort(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' M €';
  if (n >= 1e3) return Math.round(n / 1e3) + ' k €';
  return lpFmtEur(n);
}
// cards: [{ value, won }] → open and won sums, counts, and the won share in percent
function lpBoardStats(cards) {
  let open = 0, won = 0, openN = 0, wonN = 0;
  for (const c of cards) { if (c.won) { won += c.value; wonN++; } else { open += c.value; openN++; } }
  const total = openN + wonN;
  return { open, won, openN, wonN, total, rate: total ? Math.round((wonN / total) * 100) : 0 };
}
// dot-path lookup, as routes/integrations.js reads mapped keys ("data.lead.email")
function lpGetPath(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((o, k) => (o !== null && o !== undefined && typeof o === 'object' && k in o ? o[k] : undefined), obj);
}
function lpMapLead(payload, map) {
  const fields = {}, missing = [];
  for (const [field, key] of Object.entries(map || {})) {
    if (!key) continue;
    const v = lpGetPath(payload, key);
    if (v === undefined || v === null || v === '') missing.push(key); else fields[field] = String(v);
  }
  return { ok: Boolean(fields.name || fields.email), fields, missing };
}
// times, as the booking dialog shows them
function lpAmPm(t) { const [h, m] = String(t).split(':').map(Number); return (h % 12 || 12) + ':' + String(m || 0).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); }
function lpAddMin(t, n) { const [h, m] = String(t).split(':').map(Number); const x = h * 60 + (m || 0) + n; return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); }
function lpMeetDay(d) {
  const wd = lpT('lp_wd' + (((LP_MEET.lead + d - 1) % 7) + 1));
  const mon = (LP_MONTHS[lpLang] || LP_MONTHS.en)[LP_MEET.month - 1];
  return lpLang === 'de' ? `${wd}, ${d}. ${mon}` : `${wd}, ${d} ${mon}`;
}
// the ease the moving card follows with the scroll
function lpEase(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
// move `el` into `parent` (before `before`) and animate it from where it was: FLIP
function lpFlip(el, parent, before, reduce, start) {
  const a = start || el.getBoundingClientRect();   // `start`: where the element is drawn right now, when a transform has carried it away from its box
  if (before) parent.insertBefore(el, before); else parent.appendChild(el);
  if (reduce) return;
  const b = el.getBoundingClientRect();
  const dx = a.left - b.left, dy = a.top - b.top;
  if (!dx && !dy) return;
  el.style.transition = 'none'; el.style.transform = `translate(${dx}px, ${dy}px)`;
  requestAnimationFrame(() => { el.style.transition = 'transform .55s cubic-bezier(.32,.72,0,1)'; el.style.transform = ''; });
  el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
}
// the throw: a point on the flat arc from (x0, y0) to (x1, y1), lifted by about a fifth of the distance; u in [0, 1]
function lpArcPoint(x0, y0, x1, y1, u) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.22, v = 1 - u;
  return { x: v * v * x0 + 2 * v * u * cx + u * u * x1, y: v * v * y0 + 2 * v * u * cy + u * u * y1 };
}
// the centres of `from` and `to`, measured inside `frame`
function lpArcEnds(frame, from, to) {
  const f = frame.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  return { x0: a.left - f.left + a.width / 2, y0: a.top - f.top + a.height / 2, x1: b.left - f.left + b.width / 2, y1: b.top - f.top + b.height / 2 };
}
// fly `packet` (absolute inside `frame`) along the throw from `from` to `to`, growing on the way and fading at both ends
function lpFly(packet, frame, from, to, ms) {
  const { x0, y0, x1, y1 } = lpArcEnds(frame, from, to);
  packet.classList.remove('hidden');
  if (lpReduce() || !packet.animate) { packet.style.transform = `translate(${x1}px, ${y1}px)`; return Promise.resolve(); }
  const frames = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16, q = lpArcPoint(x0, y0, x1, y1, u), s = Math.sin(Math.PI * u); frames.push({ transform: `translate(${q.x}px, ${q.y}px) scale(${0.55 + 0.45 * s})`, opacity: Math.min(1, s * 2.2) }); }
  const anim = packet.animate(frames, { duration: ms, easing: 'cubic-bezier(.45, 0, .2, 1)', fill: 'forwards' });
  return anim.finished.catch(() => {});
}
function lpCountUp(el, target, fmt, ms) {
  const t0 = performance.now();
  const step = now => { const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3); el.textContent = fmt(target * e); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// a toast inside a surface, with an optional undo; hides itself
function lpToast(el, text, undoFn) {
  if (!el) return;
  const t = el.querySelector('.lp-toast-text'); if (t) t.textContent = text;
  const u = el.querySelector('.lp-toast-undo'); if (u) { u.classList.toggle('hidden', !undoFn); u.onclick = () => { undoFn?.(); el.classList.add('hidden'); }; }
  el.classList.remove('hidden');
  clearTimeout(el.__timer); el.__timer = setTimeout(() => el.classList.add('hidden'), 4200);
}

// ── the bar ─────────────────────────────────────────────────────────────────
function lpInitBar() {
  const bar = document.querySelector('.lp-bar');
  if (!bar) return;
  const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 16);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  document.querySelectorAll('.lp-lang-btn').forEach(b => b.addEventListener('click', () => lpSetLang(b.dataset.lang)));
}

// ── a board: the real drag-and-drop board with live totals ──────────────────
// One per act. Returns what the acts need: a lead card that lands (and leaves again when the
// page scrolls back), the deal card driven toward Gewonnen, a reset.
function lpBoard(root, { onWon } = {}) {
  const board = root.querySelector('.lp-board');
  if (!board) return null;
  const reduce = lpReduce();
  const cols = [...board.querySelectorAll('.lp-col')], colOf = stage => cols.find(c => c.dataset.stage === stage);
  const stats = root.querySelector('.lp-stats'), toast = root.querySelector('.lp-toast');
  const hero = board.querySelector('.lp-card[data-hero]');
  const home = new Map([...board.querySelectorAll('.lp-card')].map(c => [c, { parent: c.parentElement, next: c.nextElementSibling }]));

  function refresh() {
    const all = [];
    for (const c of cols) {
      const cards = [...c.querySelectorAll('.lp-card')], won = c.dataset.stage === 'won';
      let sum = 0;
      for (const card of cards) { const v = Number(card.dataset.value) || 0; sum += v; all.push({ value: v, won }); }
      c.querySelector('.lp-col-count').textContent = cards.length + ' ' + lpT(cards.length === 1 ? 'lp_deal_one' : 'lp_deal_many');
      c.querySelector('.lp-col-sum').textContent = lpFmtEurShort(sum);
    }
    const s = lpBoardStats(all);
    if (stats) stats.textContent = lpT('lp_stats_line', { open: lpFmtEurShort(s.open), n: s.openN, won: lpFmtEurShort(s.won), rate: s.rate });
    board.querySelectorAll('.lp-card.is-lead[data-src]').forEach(card => { const sub = card.querySelector('.lp-card-sub'); if (sub && !sub.dataset.i18n) sub.textContent = lpT('lp_lead_from', { src: lpT(LP_LEADS[card.dataset.src]?.key || 'lp_src_web') }); });
  }
  lpRerender.push(refresh);

  // move a card into a column (before a sibling), announce, tell the act if it reached Won
  function place(card, c, before, { quiet = false, start = null } = {}) {
    const from = card.parentElement, nextSib = card.nextElementSibling;
    lpFlip(card, c.querySelector('.lp-col-cards'), before, reduce, start);
    card.classList.toggle('is-won', c.dataset.stage === 'won');
    refresh();
    if (from === card.parentElement) return;
    if (!quiet) lpToast(toast, lpT('lp_toast_moved', { stage: c.querySelector('h3').textContent }), () => { from.insertBefore(card, nextSib && nextSib.parentElement === from ? nextSib : null); card.classList.toggle('is-won', from.closest('.lp-col').dataset.stage === 'won'); refresh(); });
    if (c.dataset.stage === 'won') { if (!reduce) { c.classList.remove('is-flash'); void c.offsetWidth; c.classList.add('is-flash'); } onWon?.(); }
  }

  // a lead card, as the webhook would make it from that platform's payload
  function addLead(srcKey) {
    if (board.querySelector(`.lp-card.is-lead[data-src="${srcKey}"]`)) return null;
    const lead = LP_LEADS[srcKey], col = colOf('new');
    const r = lpMapLead(lead.payload, lead.map);
    const card = lpEl('article', 'lp-card is-lead is-new'); card.tabIndex = 0; card.dataset.value = '0'; card.dataset.src = srcKey;
    card.appendChild(lpEl('span', 'lp-card-stripe'));
    card.appendChild(lpEl('h4', 'lp-card-title', r.fields.name || r.fields.email));
    card.appendChild(lpEl('p', 'lp-card-sub', lpT('lp_lead_from', { src: lpT(lead.key) })));
    const foot = lpEl('div', 'lp-card-foot'); foot.appendChild(lpEl('span', 'lp-card-value', r.fields.company || r.fields.email || '')); foot.appendChild(lpEl('span', 'lp-avatar', 'MK')); card.appendChild(foot);
    col.querySelector('.lp-col-cards').prepend(card);
    if (!reduce) { col.classList.remove('is-hit'); void col.offsetWidth; col.classList.add('is-hit'); }
    refresh();
    return card;
  }
  function removeLead(srcKey) { const card = board.querySelector(`.lp-card.is-lead[data-src="${srcKey}"]:not([data-i18n])`); if (card && !home.has(card)) { card.remove(); refresh(); } }

  // the deal card driven toward Gewonnen: q in (0, 1) carries it along the way, lifted a little as a hand would; 1 lands it; 0 brings it home
  let wonPlaced = false;
  function setWon(q) {
    if (!hero) return;
    const won = colOf('won'), nego = home.get(hero)?.parent;
    if (!won || !nego) return;
    const wc = won.querySelector('.lp-col-cards');
    if (q >= 1) {
      if (wonPlaced) return;
      wonPlaced = true;
      const start = hero.getBoundingClientRect();          // where the travel left it: the landing starts there, never from home
      hero.style.transform = ''; hero.classList.remove('is-lifted');
      place(hero, won, wc.firstElementChild, { quiet: true, start });
      return;
    }
    if (wonPlaced) { wonPlaced = false; nego.insertBefore(hero, home.get(hero).next && home.get(hero).next.parentElement === nego ? home.get(hero).next : null); hero.classList.remove('is-won'); refresh(); }
    if (q <= 0) { hero.style.transform = ''; hero.classList.remove('is-lifted'); return; }
    // offsets ignore transforms: the way is measured from the card's own box to the top slot of Gewonnen, whatever the frame shows
    const dx = wc.offsetLeft - nego.offsetLeft, dy = wc.offsetTop + parseFloat(getComputedStyle(wc).paddingTop) - hero.offsetTop;
    const e = lpEase(q), lift = Math.sin(Math.PI * e);
    hero.classList.add('is-lifted');
    hero.style.transform = `translate(${dx * e}px, ${dy * e - 18 * lift}px) scale(${1 + .04 * lift})`;
  }
  function reset() {
    wonPlaced = false;
    board.querySelectorAll('.lp-card.is-lead:not([data-i18n])').forEach(c => { if (!home.has(c)) c.remove(); });
    for (const [card, h] of home) { h.parent.insertBefore(card, h.next && h.next.parentElement === h.parent ? h.next : null); card.classList.toggle('is-won', h.parent.closest('.lp-col').dataset.stage === 'won'); card.style.transform = ''; card.classList.remove('is-lifted'); }
    toast?.classList.add('hidden'); refresh();
  }

  // pointer drag: lifted into a fixed layer, a placeholder keeps the slot, the column under the pointer highlights
  let drag = null;
  board.addEventListener('pointerdown', e => {
    const card = e.target.closest('.lp-card');
    if (!card || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = card.getBoundingClientRect();
    drag = { card, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false, ph: null, over: null };
    card.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      const ph = lpEl('div', 'lp-card-ph'); ph.style.height = drag.h + 'px';
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
    const before = [...w.querySelectorAll('.lp-card:not(.is-dragging)')].find(o => { const b = o.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (before) w.insertBefore(drag.ph, before); else w.appendChild(drag.ph);
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { card, ph, over, moved } = drag;
    drag = null;
    if (!moved) return;
    card.classList.remove('is-dragging'); card.style.transform = ''; card.style.width = '';
    board.classList.remove('is-dragging'); over?.classList.remove('is-over');
    const c = ph.closest('.lp-col'), nextSib = ph.nextElementSibling;
    ph.remove();
    if (card === hero) wonPlaced = c.dataset.stage === 'won';
    place(card, c, nextSib);
    card.focus({ preventScroll: true });
  };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);
  // keyboard: left and right move the focused card one column
  board.addEventListener('keydown', e => {
    const card = e.target.closest('.lp-card');
    if (!card || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const i = cols.indexOf(card.closest('.lp-col')), j = i + (e.key === 'ArrowRight' ? 1 : -1);
    if (j < 0 || j >= cols.length) return;
    if (card === hero) wonPlaced = cols[j].dataset.stage === 'won';
    place(card, cols[j]); card.focus({ preventScroll: true });
  });
  refresh();
  return { board, colOf, addLead, removeLead, setWon, reset, refresh };
}

// ── act 1 · leads: one platform per fifth of the scroll ─────────────────────
function lpInitLeads() {
  const scene = document.getElementById('lp-scene-leads');
  if (!scene) return;
  const b = lpBoard(scene);
  const packet = scene.querySelector('#lp-packet-leads'), marks = [...scene.querySelectorAll('.lp-src')];
  const landed = [false, false, false, false];
  // the scroll: each platform owns a fifth of the act. Its packet rides the throw from the mark into Neu as that fifth is
  // scrolled, forwards and backwards, and the card lands when the throw is complete; the last fifth is rest. `final` is
  // the hand-over to the visitor: whatever is more than half way lands, the rest goes back, the packet disappears.
  LP_ACTS.leads = (p, final) => {
    let flying = -1, u = 0;
    LP_LEAD_ORDER.forEach((key, k) => {
      const v = Math.min(1, Math.max(0, (p * 5 - k - 0.15) / 0.7));
      const land = v >= 1 || (final && v > 0.5);
      if (land && !landed[k]) { landed[k] = true; b?.addLead(key); }
      else if (!land && landed[k]) { landed[k] = false; b?.removeLead(key); }
      marks.find(m => m.dataset.src === key)?.classList.toggle('is-sent', final ? land : v > 0);
      if (v > 0 && v < 1) { flying = k; u = v; }
    });
    const mark = flying >= 0 ? marks.find(m => m.dataset.src === LP_LEAD_ORDER[flying]) : null, col = b?.colOf('new');
    if (!packet || final || !mark || !col) { packet?.classList.add('hidden'); return; }
    const { x0, y0, x1, y1 } = lpArcEnds(scene, mark, col), q = lpArcPoint(x0, y0, x1, y1, lpEase(u)), s = Math.sin(Math.PI * u);
    packet.style.transform = `translate(${q.x}px, ${q.y}px) scale(${0.55 + 0.45 * s})`;
    packet.style.opacity = String(Math.min(1, s * 2.2));
    packet.classList.remove('hidden');
  };
}

// ── act 2 · the record: seven phases ────────────────────────────────────────
function lpInitRecord() {
  const rec = document.getElementById('lp-record');
  if (!rec) return;
  const q = s => rec.querySelector(s);
  const tabs = [...rec.querySelectorAll('.lp-tabs [role="tab"]')], panels = [...rec.querySelectorAll('.lp-pan')];
  function selectTab(id) {
    tabs.forEach(t => { const on = t.id === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    panels.forEach(p => p.classList.toggle('hidden', p.id !== document.getElementById(id)?.getAttribute('aria-controls')));
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.id));
    t.addEventListener('keydown', e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; selectTab(n.id); n.focus(); });
  });

  // reach the contact: each action opens a bubble with the number, the address, or the WhatsApp template
  const bubble = q('#lp-wa');
  let act = null;
  function paintBubble() {
    if (!bubble) return;
    bubble.classList.toggle('hidden', !act);
    const label = bubble.querySelector('small'), text = bubble.querySelector('p');
    if (!act || !label || !text) return;
    label.textContent = lpT(act === 'call' ? 'lp_call_label' : act === 'mail' ? 'lp_mail_label' : 'lp_wa_label');
    text.textContent = act === 'call' ? LP_CONTACT.phone : act === 'mail' ? LP_CONTACT.email : lpT('lp_wa_tpl');
  }
  rec.querySelectorAll('#lp-rec-actions [data-act]').forEach(b => b.addEventListener('click', () => { act = act === b.dataset.act ? null : b.dataset.act; paintBubble(); }));
  q('#lp-rec-book')?.addEventListener('click', () => LP_BOOK.open?.());

  // tasks: ticks move the progress; the form adds the task to the list and the overview
  const list = q('#lp-task-list'), progress = q('#lp-task-progress'), bar = q('.lp-task-bar i'), ovOpen = q('#lp-ov-open'), ovTasks = q('#lp-ov-tasks');
  function refreshTasks() {
    const rows = [...rec.querySelectorAll('#lp-task-list .lp-task')];
    const done = rows.filter(r => r.querySelector('input').checked).length;
    rows.forEach(r => r.classList.toggle('is-done', r.querySelector('input').checked));
    if (progress) progress.textContent = lpT('lp_tasks_progress', { d: done, n: rows.length });
    if (bar) bar.style.width = (rows.length ? (done / rows.length) * 100 : 0) + '%';
    if (ovOpen) ovOpen.textContent = String(rows.length - done);
  }
  rec.addEventListener('change', e => { if (e.target.matches('#lp-task-list input')) refreshTasks(); });
  let taskRow = null, taskMini = null;
  function addTask() {
    if (taskRow || !list) return false;
    const li = lpEl('li', 'lp-task is-new');
    const label = lpEl('label'); const input = document.createElement('input'); input.type = 'checkbox'; label.appendChild(input);
    const check = lpEl('span', 'lp-check'); check.appendChild(lpSvg('lp-i-check')); label.appendChild(check);
    const title = lpEl('span', 'lp-task-title', lpT('lp_task_title_v')); title.dataset.i18n = 'lp_task_title_v'; label.appendChild(title);
    li.appendChild(label);
    const badge = lpEl('span', 'lp-badge lp-badge-u3', lpT('lp_prio_high')); badge.dataset.i18n = 'lp_prio_high'; li.appendChild(badge);
    const due = lpEl('small', null, lpT('lp_task_due_v')); due.dataset.i18n = 'lp_task_due_v'; li.appendChild(due);
    list.prepend(li); taskRow = li;
    if (ovTasks) { const m = lpEl('li', 'is-new'); m.appendChild(lpEl('span', 'lp-mini-dot')); const s = lpEl('span', null, lpT('lp_task_title_v')); s.dataset.i18n = 'lp_task_title_v'; m.appendChild(s); const d = lpEl('small', null, lpT('lp_task_due_v')); d.dataset.i18n = 'lp_task_due_v'; m.appendChild(d); ovTasks.prepend(m); taskMini = m; }
    q('#lp-task-add')?.setAttribute('disabled', '');
    refreshTasks();
    return true;
  }
  function removeTask() { if (!taskRow) return; taskRow.remove(); taskRow = null; taskMini?.remove(); taskMini = null; q('#lp-task-add')?.removeAttribute('disabled'); refreshTasks(); }
  q('#lp-task-add')?.addEventListener('click', addTask);

  // the composer: a note lands in the timeline and in the overview
  const ta = q('#lp-note'), timeline = q('#lp-timeline'), chips = [...rec.querySelectorAll('.lp-type-chip')];
  const latest = q('#lp-ov-latest'), latestMeta = q('#lp-ov-latest-meta');
  chips.forEach(c => c.addEventListener('click', () => chips.forEach(x => x.setAttribute('aria-pressed', String(x === c)))));
  function tlItem(type, labelKey, metaText, text, extra) {
    const li = lpEl('li', 'lp-tl-item is-new');
    li.appendChild(lpEl('span', 'lp-tl-ic type-' + type));
    const body = lpEl('div');
    const meta = lpEl('p', 'lp-tl-meta'); const b = lpEl('b', null, lpT(labelKey)); b.dataset.i18n = labelKey; meta.appendChild(b);
    if (extra) meta.appendChild(extra);
    meta.appendChild(lpEl('span', null, metaText));
    body.appendChild(meta);
    body.appendChild(lpEl('p', 'lp-tl-text', text));
    li.appendChild(body);
    return li;
  }
  function paintLatest() {
    const top = timeline?.querySelector('.lp-tl-item');
    if (!top || !latest || !latestMeta) return;
    if (top.dataset.own) { latest.textContent = top.querySelector('.lp-tl-text').textContent; delete latest.dataset.i18n; latestMeta.textContent = top.querySelector('.lp-tl-meta span:last-child').textContent; delete latestMeta.dataset.i18n; }
    else { latest.dataset.i18n = 'lp_tl1_text'; latest.textContent = lpT('lp_tl1_text'); latestMeta.dataset.i18n = 'lp_tl1_meta'; latestMeta.textContent = lpT('lp_tl1_meta'); }
  }
  let noteRow = null;
  function saveNote(preset) {
    const text = (preset || ta?.value || '').trim();
    if (!text || !timeline) return false;
    const type = chips.find(c => c.getAttribute('aria-pressed') === 'true')?.dataset.type || 'note';
    const li = tlItem(type, { note: 'lp_type_note', call: 'lp_type_call', email: 'lp_type_email', wa: 'lp_type_wa' }[type] || 'lp_type_note', 'Mara Kühn, ' + lpT('lp_tl_now'), text);
    li.dataset.own = '1';
    if (preset) { noteRow?.remove(); noteRow = li; }
    timeline.prepend(li);
    if (ta) ta.value = '';
    paintLatest();
    return true;
  }
  function removeNote() { if (!noteRow) return; noteRow.remove(); noteRow = null; paintLatest(); }
  q('#lp-note-save')?.addEventListener('click', () => saveNote());
  ta?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveNote(); } });

  // a booked meeting: the newest entry, with the way in (the join link, named after the app)
  let meetRow = null;
  function addMeeting({ when, place, typeName }) {
    if (!timeline) return;
    meetRow?.remove();
    const tag = lpEl('span', 'lp-tl-tag', 'Cal.com');
    const li = tlItem('meeting', 'lp_meet', when + ', ' + place, lpT('lp_meet_title', { type: typeName }), tag);
    li.dataset.own = '1';
    const join = lpEl('span', 'lp-join'); join.appendChild(lpSvg('lp-i-external')); join.appendChild(lpEl('span', null, place === 'Google Meet' ? lpT('lp_join') : lpT('lp_join_link')));
    li.querySelector('div').appendChild(join);
    timeline.prepend(li); meetRow = li;
    paintLatest();
    selectTab('lp-tab-activity');
    lpToast(q('#lp-rec-toast'), lpT('lp_bk_done', { when }));
  }
  function removeMeeting() { if (!meetRow) return; meetRow.remove(); meetRow = null; paintLatest(); }

  // the scroll: seven phases, forwards and backwards
  const h = document.getElementById('lp-deal-h'), line = document.getElementById('lp-deal-line');
  let phase = -1;
  function caption(n) {
    if (h) { const k = n >= 3 ? 'lp_a2b_t' : 'lp_a2_t'; if (h.dataset.i18n !== k) { h.dataset.i18n = k; h.textContent = lpT(k); } }
    if (line) { const k = 'lp_p' + n; if (line.dataset.i18n !== k) { line.classList.add('is-swap'); setTimeout(() => { line.dataset.i18n = k; line.textContent = lpT(k); line.classList.remove('is-swap'); }, lpReduce() ? 0 : 180); } }
  }
  function setPhase(n) {
    n = Math.max(0, Math.min(6, n));
    if (n === phase) return;
    phase = n;
    caption(n);
    act = n === 0 ? 'wa' : null; paintBubble();
    if (n >= 1) addTask(); else removeTask();
    if (n >= 2) saveNote(lpT('lp_note_preset')); else removeNote();
    if (n >= 6) { LP_BOOK.setStage?.(3); LP_BOOK.book?.(); }
    else { removeMeeting(); LP_BOOK.setStage?.(n >= 3 ? n - 2 : 0); }
    selectTab(n === 0 ? 'lp-tab-overview' : n === 1 ? 'lp-tab-tasks' : 'lp-tab-activity');
  }
  LP_ACTS.deal = p => setPhase(Math.min(6, Math.floor(p * 7)));
  Object.assign(LP_REC, { selectTab, addMeeting, removeMeeting, setPhase });
  lpRerender.push(() => { refreshTasks(); paintBubble(); paintLatest(); });
  refreshTasks();
}

// ── the booking sheet: the dialog, as the app opens it over the record ──────
function lpInitBooking() {
  const sheet = document.getElementById('lp-book');
  if (!sheet) return;
  const q = s => sheet.querySelector(s);
  const typeSel = q('#lp-bk-type'), whereSel = q('#lp-bk-where'), grid = q('#lp-bk-grid'), slots = q('#lp-bk-slots');
  const conflict = q('#lp-bk-conflict'), summary = q('#lp-bk-summary'), go = q('#lp-bk-go'), invite = q('#lp-bk-invite');
  const B = { day: 0, time: '' };
  const minutes = () => LP_MEET.types[typeSel?.value] || 30;
  const typeName = () => lpT(typeSel?.selectedOptions?.[0]?.dataset.i18n || 'lp_bk_type1');
  const place = () => whereSel?.value || 'Google Meet';
  const clash = () => B.day === LP_MEET.busy.day && B.time === LP_MEET.busy.time;
  const slotText = t => lpT('lp_bk_slot', { from: t, to: lpAddMin(t, minutes()), ampm: lpAmPm(t) });
  const when = () => (B.day && B.time ? lpMeetDay(B.day) + ', ' + slotText(B.time) : '');

  function paintMonth() {
    if (!grid) return;
    grid.textContent = '';
    for (let k = 0; k < LP_MEET.lead; k++) { const s = lpEl('span', 'lp-bk-day is-blank'); s.setAttribute('aria-hidden', 'true'); grid.appendChild(s); }
    for (let d = 1; d <= LP_MEET.days; d++) {
      const free = LP_MEET.free.includes(d);
      const b = lpEl('button', 'lp-bk-day' + (free ? ' is-free' : '') + (d === B.day ? ' is-on' : '') + (d === LP_MEET.today ? ' is-today' : ''), String(d));
      b.type = 'button'; b.disabled = !free; b.setAttribute('aria-pressed', String(d === B.day)); b.setAttribute('aria-label', lpMeetDay(d));
      if (free) b.addEventListener('click', () => pickDay(d));
      grid.appendChild(b);
    }
  }
  function pickDay(d) { B.day = d; B.time = ''; paintMonth(); paintSlots(); }
  function paintSlots() {
    if (!slots) return;
    slots.textContent = '';
    for (const t of LP_MEET.slots) { const b = lpEl('button', 'lp-bk-slot', slotText(t)); b.type = 'button'; b.disabled = !B.day; b.addEventListener('click', () => pickTime(t)); slots.appendChild(b); }
    if (invite) invite.textContent = lpT('lp_bk_invite', { email: LP_CONTACT.email });
    paintPick();
  }
  function paintPick() {
    const has = Boolean(B.day && B.time), c = has && clash();
    slots?.querySelectorAll('.lp-bk-slot').forEach((b, k) => b.setAttribute('aria-pressed', String(LP_MEET.slots[k] === B.time)));
    if (conflict) { conflict.classList.toggle('hidden', !c); conflict.textContent = c ? lpT('lp_bk_conflict', { time: LP_MEET.busy.time, title: lpT(LP_MEET.busy.key), who: LP_MEET.busy.who }) : ''; }
    if (summary) { summary.classList.toggle('hidden', !has); q('#lp-bk-when').textContent = when(); q('#lp-bk-who').textContent = place() + ', ' + lpT('lp_bk_with', { name: LP_CONTACT.name }); }
    if (go) { go.disabled = !has; go.textContent = lpT(c ? 'lp_bk_anyway' : 'lp_bk_book'); }
  }
  function pickTime(t) { B.time = t; paintPick(); }
  function open() { if (!sheet.classList.contains('hidden')) return; B.day = 0; B.time = ''; paintMonth(); paintSlots(); sheet.classList.remove('hidden'); }
  function close() { sheet.classList.add('hidden'); }
  function book() {
    if (!B.day || !B.time) return false;
    const detail = { when: when(), place: place(), typeName: typeName() };
    close();
    LP_REC.addMeeting?.(detail);
    return true;
  }
  // the scroll's stages: 0 closed, 1 open on the 8th, 2 the 11:00 clash, 3 the clean 14:00
  function setStage(k) {
    if (k <= 0) { close(); return; }
    if (sheet.classList.contains('hidden')) { B.day = 0; B.time = ''; sheet.classList.remove('hidden'); }
    B.day = LP_MEET.busy.day; B.time = k === 2 ? LP_MEET.busy.time : k >= 3 ? '14:00' : '';
    paintMonth(); paintSlots();
  }
  typeSel?.addEventListener('change', paintSlots);
  whereSel?.addEventListener('change', paintPick);
  go?.addEventListener('click', book);
  q('#lp-bk-cancel')?.addEventListener('click', close);
  q('#lp-bk-close')?.addEventListener('click', close);
  Object.assign(LP_BOOK, { open, close, book, setStage, isOpen: () => !sheet.classList.contains('hidden') });
  lpRerender.push(() => { if (LP_BOOK.isOpen()) { paintMonth(); paintSlots(); } });
}

// ── act 3 · won: the deal card travels into Gewonnen, the packet reaches the next system ──
function lpInitWon() {
  const scene = document.getElementById('lp-scene-won');
  if (!scene) return;
  const next = scene.querySelector('#lp-next'), state = scene.querySelector('#lp-next-state'), receipt = scene.querySelector('#lp-receipt'), packet = scene.querySelector('#lp-packet-won');
  let phase = 'idle', flying = false, flown = false;
  function paintNext() {
    if (state) state.textContent = lpT(phase === 'idle' ? 'lp_next_idle' : phase === 'pending' ? 'lp_next_pending' : 'lp_next_done');
    next?.classList.toggle('is-pending', phase === 'pending'); next?.classList.toggle('is-done', phase === 'done');
    receipt?.classList.toggle('is-in', phase === 'done');
  }
  lpRerender.push(paintNext);
  // the hand-over: the packet travels from the Won column to the next system, which confirms
  async function deliver() {
    if (flying || flown) return;
    flying = true; flown = true;
    phase = 'pending'; paintNext();
    const won = b?.colOf('won');
    if (packet && won && next) await lpFly(packet, scene, won, next, 1000);
    packet?.classList.add('hidden');
    if (flown) { phase = 'done'; paintNext(); }
    flying = false;
  }
  function resetNext() { flown = false; phase = 'idle'; paintNext(); packet?.classList.add('hidden'); }
  const b = lpBoard(scene, { onWon: deliver });
  // the scroll: the card travels until half, lands, and the hand-over follows
  LP_ACTS.won = p => {
    const q = Math.min(1, p / 0.55);
    b?.setWon(q);
    if (q >= 1) deliver(); else resetNext();
  };
  paintNext();
}

// ── the acts: the scroll drives each pinned screen with its progress ────────
// progress = 0 when the screen pins at the bar, 1 when the section's end releases it; the act's
// --lp-p carries it for the stylesheet. The drawn progress follows the scroll with a short lag
// (about 120 ms), so every screen glides instead of jumping. The first touch of a scene hands it
// over to the visitor; the act is told once (`final`) so it can settle whatever was in flight.
function lpInitActs() {
  const acts = [...document.querySelectorAll('.lp-act')].map(el => ({ el, drive: LP_ACTS[el.dataset.act], handed: false, target: 0, cur: -1 }));
  if (!acts.length) return;
  if (lpReduce()) { acts.forEach(a => { a.el.style.setProperty('--lp-p', '1'); a.drive?.(1); }); return; }
  const barH = () => parseFloat(getComputedStyle(document.body).getPropertyValue('--lp-bar-h')) || 56;
  function progressOf(a) {
    const r = a.el.getBoundingClientRect(), range = a.el.offsetHeight - (window.innerHeight - barH());
    if (range <= 0) return 1;
    return Math.min(1, Math.max(0, (barH() - r.top) / range));
  }
  let raf = 0, last = 0, dirty = true;
  function frame(now) {
    raf = 0;
    if (dirty) { dirty = false; for (const a of acts) a.target = progressOf(a); }
    const k = 1 - Math.exp(-Math.min(64, now - (last || now)) / 120); last = now;
    let busy = false;
    for (const a of acts) {
      let p = a.cur < 0 ? a.target : a.cur + (a.target - a.cur) * k;
      if (Math.abs(a.target - p) < 0.0005) p = a.target; else busy = true;
      if (p === a.cur) continue;
      a.cur = p; a.el.style.setProperty('--lp-p', p.toFixed(3));
      if (!a.handed) a.drive?.(p);
    }
    if (busy) raf = requestAnimationFrame(frame); else last = 0;
  }
  const onScroll = () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  acts.forEach(a => a.el.addEventListener('pointerdown', e => { if (e.target.closest('.lp-scene') && !a.handed) { a.handed = true; a.drive?.(a.cur, true); } }));
  onScroll();
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
  const reduce = lpReduce();
  let animateNext = false;
  function figure(sel, value, fmt) { const el = q(sel); if (!el) return; if (animateNext && !reduce) lpCountUp(el, value, fmt, 900); else el.textContent = fmt(value); }
  function render() {
    const a = LP_ANALYTICS[period];
    root.querySelectorAll('.lp-period').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.period) === period)));
    figure('#lp-an-open', a.open, lpFmtEurShort); figure('#lp-an-won', a.won, lpFmtEurShort);
    figure('#lp-an-rate', a.rate, v => Math.round(v) + ' %'); figure('#lp-an-new', a.newDeals, v => String(Math.round(v)));
    animateNext = false;
    const funnel = q('#lp-an-funnel'); if (!funnel) return;
    funnel.textContent = '';
    const max = a.funnel[0];
    a.funnel.forEach((n, k) => {
      const row = lpEl('li', 'lp-funnel-row s' + (k + 1));
      row.appendChild(lpEl('span', 'lp-funnel-label', lpT(stageKeys[k])));
      const barEl = lpEl('span', 'lp-funnel-bar'); const fill = lpEl('i'); fill.style.width = Math.max(4, (n / max) * 100) + '%'; barEl.appendChild(fill); row.appendChild(barEl);
      row.appendChild(lpEl('span', 'lp-funnel-val', String(n)));
      if (k < a.funnel.length - 1) row.appendChild(lpEl('span', 'lp-funnel-hint', lpT('lp_an_funnel_hint', { p: Math.round((a.funnel[k + 1] / n) * 100), stage: lpT(stageKeys[k + 1]) })));
      funnel.appendChild(row);
    });
    const lost = lpEl('li', 'lp-funnel-row is-lost');
    lost.appendChild(lpEl('span', 'lp-funnel-label', lpT('lp_an_lost')));
    const lb = lpEl('span', 'lp-funnel-bar'); const lf = lpEl('i'); lf.style.width = Math.max(4, (a.lost / max) * 100) + '%'; lb.appendChild(lf); lost.appendChild(lb);
    lost.appendChild(lpEl('span', 'lp-funnel-val', String(a.lost))); funnel.appendChild(lost);
    const svg = q('#lp-an-line'); if (!svg) return;
    svg.textContent = '';
    const W = 560, H = 180, padL = 30, padR = 12, padT = 12, padB = 26;
    const xs = a.rates.map((_, k) => padL + (k * (W - padL - padR)) / Math.max(1, a.rates.length - 1));
    const ys = a.rates.map(r => padT + (H - padT - padB) * (1 - r / 60));
    for (const g of [0, 20, 40, 60]) {
      const y = padT + (H - padT - padB) * (1 - g / 60);
      const line = document.createElementNS(svgNS, 'line'); line.setAttribute('x1', padL); line.setAttribute('x2', W - padR); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('class', 'lp-grid'); svg.appendChild(line);
      const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', padL - 6); tx.setAttribute('y', y + 3); tx.setAttribute('class', 'lp-axis'); tx.textContent = g + ' %'; svg.appendChild(tx);
    }
    const area = document.createElementNS(svgNS, 'path'); area.setAttribute('d', `M${xs[0]},${H - padB} ` + xs.map((x, k) => `L${x},${ys[k]}`).join(' ') + ` L${xs[xs.length - 1]},${H - padB} Z`); area.setAttribute('class', 'lp-area'); svg.appendChild(area);
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', xs.map((x, k) => (k ? 'L' : 'M') + x + ',' + ys[k]).join(' ')); path.setAttribute('class', 'lp-line-path'); svg.appendChild(path);
    const labels = months(a.rates.length);
    pts = [];
    xs.forEach((x, k) => {
      const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', ys[k]); c.setAttribute('r', 3.5); c.setAttribute('class', 'lp-pt'); svg.appendChild(c);
      const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', x); tx.setAttribute('y', H - 8); tx.setAttribute('class', 'lp-axis lp-axis-x'); tx.textContent = labels[k]; svg.appendChild(tx);
      pts.push({ x, y: ys[k], dot: c, i: k });
    });
    const cursor = document.createElementNS(svgNS, 'line'); cursor.setAttribute('class', 'lp-cursor-line hidden'); cursor.setAttribute('y1', padT); cursor.setAttribute('y2', H - padB); svg.appendChild(cursor);
    svg.__cursor = cursor; svg.__W = W; svg.__labels = labels; svg.__a = a;
  }
  const svg = q('#lp-an-line');
  svg?.addEventListener('pointermove', e => {
    if (!pts.length || !tip) return;
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * svg.__W;
    let best = pts[0]; for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    pts.forEach(p => p.dot.classList.toggle('is-on', p === best));
    svg.__cursor.setAttribute('x1', best.x); svg.__cursor.setAttribute('x2', best.x); svg.__cursor.classList.remove('hidden');
    const a = svg.__a;
    tip.textContent = lpT('lp_an_tip', { month: svg.__labels[best.i], rate: a.rates[best.i], won: a.wonM[best.i], lost: a.lostM[best.i] });
    tip.classList.remove('hidden');
    tip.style.left = Math.min(Math.max(0, (best.x / svg.__W) * r.width - tip.offsetWidth / 2), r.width - tip.offsetWidth) + 'px';
  });
  svg?.addEventListener('pointerleave', () => { tip?.classList.add('hidden'); svg.__cursor?.classList.add('hidden'); pts.forEach(p => p.dot.classList.remove('is-on')); });
  root.querySelectorAll('.lp-period').forEach(b => b.addEventListener('click', () => { period = Number(b.dataset.period) || 6; animateNext = true; render(); }));
  lpRerender.push(render);
  render();
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); animateNext = true; render(); } }, { threshold: 0.4 });
    io.observe(root);
  }
}

// ── boot ────────────────────────────────────────────────────────────────────
function lpInit() {
  document.body.classList.add('lp');
  lpInitBar();
  lpInitRecord();
  lpInitBooking();
  lpInitLeads();
  lpInitWon();
  lpInitAnalytics();
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch {}
  lpApplyLang(saved || 'de');
  lpInitActs();   // after the language and the scenes, so the first drive paints in the right words
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', lpInit);
