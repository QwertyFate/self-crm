/* ═══════════════════════════════════════════════════════════════════════════
   LANDING PAGE (/landingpage) — standalone: no app scripts, no API calls.

   The page inherits the login's two-tone split: a navy panel on the left that
   stays put (headline, the two calls to action, an index of six parts, the
   louvre-wall texture the login carries), and on the right, on white, one
   screen per part with one short title, one line and one working piece:

     board    drag and drop between stage columns; once, on first sight, a
              visible cursor drags the deal into Won, then the visitor takes
              over; totals and the Engine line follow every move
     leads    "Lead senden" maps one of three real payload shapes through the
              webhook's own dot-path logic and shows the contact it becomes
     deal     the deal record's tabs; tasks tick, a note saves
     team     wall clock in the author's zone, shown in the viewer's zone
     numbers  three periods of figures: cards, win-rate line, funnel
     engine   the vertrag.unterschrieben event signed with HMAC-SHA256 over
              "<timestamp>.<raw body>" via WebCrypto, as utils/engine.js does

   German is the default and the markup text IS the German dictionary (the
   client test checks that key for key). Every string claims only what the
   code does, and every string is short: the test caps their length.
   ═══════════════════════════════════════════════════════════════════════════ */

const LP_I18N = {
  de: {
    lp_login: 'Anmelden', lp_request: 'Zugang anfragen', lp_request_subject: 'Zugang zu Upgrads CRM', lp_lang: 'Sprache', lp_index: 'Inhalt',
    lp_hero_title: 'Ein Board für jeden Deal, vom Lead bis zur Unterschrift.',
    lp_hero_sub: 'Leads, Deals, Team und Unterschrift an einem Ort.',
    lp_ix_board: 'Board', lp_ix_leads: 'Leads', lp_ix_deal: 'Deal', lp_ix_team: 'Team', lp_ix_numbers: 'Zahlen', lp_ix_engine: 'Engine',

    lp_s1_t: 'Das Board.', lp_s1_d: 'Karten ziehen, Summen folgen. Eigene Phasen, eigene Begriffe.',
    lp_board_pipeline: 'Vertrieb', lp_board_aria: 'Beispiel-Board. Karten mit der Maus oder den Pfeiltasten verschieben.',
    lp_col_new: 'Neu', lp_col_offer: 'Angebot', lp_col_nego: 'Verhandlung', lp_col_won: 'Gewonnen',
    lp_deal_one: 'Deal', lp_deal_many: 'Deals',
    lp_urg_low: 'Niedrig', lp_urg_medium: 'Mittel', lp_urg_high: 'Hoch', lp_urg_very: 'Sehr dringend',
    lp_stats_line: 'Offen {open} in {n} Deals. Gewonnen {won}. Anteil {rate} %.',
    lp_toast_moved: 'Verschoben nach {stage}', lp_toast_undo: 'Rückgängig',
    lp_delivery_idle: 'Upgrads Engine wartet auf einen Deal in Gewonnen.', lp_delivery_pending: 'Upgrads Engine: wird zugestellt', lp_delivery_done: 'Upgrads Engine: zugestellt, HTTP 200',
    lp_demo_hint: 'Einmal vorgeführt. Dann selbst ziehen.', lp_demo_replay: 'Noch einmal',

    lp_s2_t: 'Leads kommen von selbst.', lp_s2_d: 'Per Webhook aus Make, Zapier, n8n oder dem eigenen Formular.',
    lp_lead_send: 'Lead senden', lp_lead_in: 'Eingehend', lp_lead_contact: 'Kontakt angelegt', lp_lead_deal: 'Deal angelegt in {stage}', lp_lead_owner: 'Zugewiesen an Mara Kühn',
    lp_f_name: 'Name', lp_f_email: 'E-Mail', lp_f_phone: 'Telefon', lp_f_company: 'Firma',

    lp_s3_t: 'Alles am Deal.', lp_s3_d: 'Kontakt, Aufgaben, Notizen, Objekte. Ein Datensatz.',
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

    lp_s4_t: 'Ein Team, jede Zeitzone.', lp_s4_d: 'Ein Inhaber, Admins, Mitglieder. Echtzeit-Chat. Jeder Termin in der eigenen Ortszeit.',
    lp_tz_entered: 'Eingetragen in', lp_tz_viewed: 'Gesehen in', lp_tz_at: 'um',
    lp_tz_note: 'eingetragen als {time} {zone}', lp_tz_next: 'am nächsten Tag', lp_tz_prev: 'am Vortag', lp_tz_same: 'am selben Tag',

    lp_s5_t: 'Zahlen, die stimmen.', lp_s5_d: 'Gewinnquote und Trichter nach den eigenen Phasen.',
    lp_an_period_3: '3 Monate', lp_an_period_6: '6 Monate', lp_an_period_12: '12 Monate',
    lp_an_c_open: 'Offene Pipeline', lp_an_c_won: 'Gewonnener Wert', lp_an_c_rate: 'Gewinnquote', lp_an_c_new: 'Neue Deals',
    lp_an_rate_m: 'Gewinnquote je Monat', lp_an_funnel: 'Trichter', lp_an_lost: 'Verloren', lp_an_funnel_hint: '{p} % weiter zu {stage}',
    lp_an_tip: '{month}: {rate} %, {won} gewonnen, {lost} verloren',

    lp_s6_t: 'Unterschrieben. Weitergemeldet.', lp_s6_d: 'Erreicht ein Deal Gewonnen, erhält das nächste System das signierte Ereignis vertrag.unterschrieben.',
    lp_en_send: 'Testereignis senden', lp_en_event: 'Ereignis', lp_en_signature: 'Signatur', lp_en_signed: 'HMAC-SHA256 über Zeitstempel und Body', lp_en_status: 'Zustellung',
    lp_en_idle: 'Noch nicht gesendet', lp_en_pending: 'Wird zugestellt', lp_en_done: 'Zugestellt, HTTP 200', lp_en_nosubtle: 'Signieren braucht eine sichere Verbindung.',

    lp_fact1: 'PostgreSQL, jede Abfrage je Arbeitsbereich.', lp_fact2: 'Zugang nur auf Einladung, mit Einladungscode.', lp_fact3: 'Deutsch und Englisch, Beträge in Euro.', lp_fact4: 'Export als CSV, jederzeit.',
    lp_faq1_q: 'Wie bekommt ein Team Zugang?', lp_faq1_a: 'Auf Anfrage. Der Einladungscode kommt per E-Mail.',
    lp_faq2_q: 'Woher kommen die Leads?', lp_faq2_a: 'Aus allem, was JSON sendet: Make, Zapier, n8n, ein Formular.',
    lp_faq3_q: 'Ist die Engine Pflicht?', lp_faq3_a: 'Nein. Ohne Engine ist Upgrads ein vollständiges CRM.',
    lp_cta_t: 'Bereit, wenn das Team es ist.', lp_cta_d: 'Zugang anfragen. Der erste Lead liegt heute auf dem Board.',
    lp_foot_tag: 'Upgrads CRM. Ein Board für jeden Deal.',
  },
  en: {
    lp_login: 'Log in', lp_request: 'Request access', lp_request_subject: 'Access to Upgrads CRM', lp_lang: 'Language', lp_index: 'Contents',
    lp_hero_title: 'One board for every deal, from lead to signature.',
    lp_hero_sub: 'Leads, deals, team and signature in one place.',
    lp_ix_board: 'Board', lp_ix_leads: 'Leads', lp_ix_deal: 'Deal', lp_ix_team: 'Team', lp_ix_numbers: 'Numbers', lp_ix_engine: 'Engine',

    lp_s1_t: 'The board.', lp_s1_d: 'Drag cards, totals follow. Your own stages, your own names.',
    lp_board_pipeline: 'Sales', lp_board_aria: 'Example board. Move cards with the mouse or the arrow keys.',
    lp_col_new: 'New', lp_col_offer: 'Proposal', lp_col_nego: 'Negotiation', lp_col_won: 'Won',
    lp_deal_one: 'deal', lp_deal_many: 'deals',
    lp_urg_low: 'Low', lp_urg_medium: 'Medium', lp_urg_high: 'High', lp_urg_very: 'Very urgent',
    lp_stats_line: 'Open {open} across {n} deals. Won {won}. Share {rate} %.',
    lp_toast_moved: 'Moved to {stage}', lp_toast_undo: 'Undo',
    lp_delivery_idle: 'Upgrads Engine waits for a deal in Won.', lp_delivery_pending: 'Upgrads Engine: delivering', lp_delivery_done: 'Upgrads Engine: delivered, HTTP 200',
    lp_demo_hint: 'Shown once. Then drag yourself.', lp_demo_replay: 'Once more',

    lp_s2_t: 'Leads arrive on their own.', lp_s2_d: 'By webhook from Make, Zapier, n8n or your own form.',
    lp_lead_send: 'Send a lead', lp_lead_in: 'Incoming', lp_lead_contact: 'Contact created', lp_lead_deal: 'Deal created in {stage}', lp_lead_owner: 'Assigned to Mara Kühn',
    lp_f_name: 'Name', lp_f_email: 'Email', lp_f_phone: 'Phone', lp_f_company: 'Company',

    lp_s3_t: 'Everything on the deal.', lp_s3_d: 'Contact, tasks, notes, listings. One record.',
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

    lp_s4_t: 'One team, every time zone.', lp_s4_d: 'One owner, admins, members. Realtime chat. Every appointment in local time.',
    lp_tz_entered: 'Entered in', lp_tz_viewed: 'Viewed in', lp_tz_at: 'at',
    lp_tz_note: 'entered as {time} {zone}', lp_tz_next: 'the next day', lp_tz_prev: 'the day before', lp_tz_same: 'the same day',

    lp_s5_t: 'Numbers that add up.', lp_s5_d: 'Win rate and funnel by your own stages.',
    lp_an_period_3: '3 months', lp_an_period_6: '6 months', lp_an_period_12: '12 months',
    lp_an_c_open: 'Open pipeline', lp_an_c_won: 'Won value', lp_an_c_rate: 'Win rate', lp_an_c_new: 'New deals',
    lp_an_rate_m: 'Win rate per month', lp_an_funnel: 'Funnel', lp_an_lost: 'Lost', lp_an_funnel_hint: '{p} % on to {stage}',
    lp_an_tip: '{month}: {rate} %, {won} won, {lost} lost',

    lp_s6_t: 'Signed. Passed on.', lp_s6_d: 'When a deal reaches Won, the next system receives the signed event vertrag.unterschrieben.',
    lp_en_send: 'Send test event', lp_en_event: 'Event', lp_en_signature: 'Signature', lp_en_signed: 'HMAC-SHA256 over timestamp and body', lp_en_status: 'Delivery',
    lp_en_idle: 'Not sent yet', lp_en_pending: 'Delivering', lp_en_done: 'Delivered, HTTP 200', lp_en_nosubtle: 'Signing needs a secure connection.',

    lp_fact1: 'PostgreSQL, every query per workspace.', lp_fact2: 'Access by invitation only, with an invite code.', lp_fact3: 'German and English, amounts in euro.', lp_fact4: 'Export as CSV, any time.',
    lp_faq1_q: 'How does a team get access?', lp_faq1_a: 'On request. The invite code arrives by email.',
    lp_faq2_q: 'Where do the leads come from?', lp_faq2_a: 'From anything that sends JSON: Make, Zapier, n8n, a form.',
    lp_faq3_q: 'Is the Engine required?', lp_faq3_a: 'No. Without the Engine, Upgrads is a complete CRM.',
    lp_cta_t: 'Ready when the team is.', lp_cta_d: 'Request access. The first lead is on the board today.',
    lp_foot_tag: 'Upgrads CRM. One board for every deal.',
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

const LP_ZONES = ['Europe/Berlin', 'Europe/London', 'Europe/Lisbon', 'Europe/Athens', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];

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

// ── the index in the panel follows the screen in view ───────────────────────
function lpInitIndex() {
  const links = [...document.querySelectorAll('.lp-index a[href^="#"]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach(a => a.removeAttribute('aria-current'));
      byId.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  for (const id of byId.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
}

// ── the wall ────────────────────────────────────────────────────────────────
// The louvre wall of upgrads.de, as the login page carries it (public/js/login-wall.js), as the
// texture of the panel: slats rest tilted away under one fixed light and turn toward the pointer.
// No wordmark mask (the crisp logo sits above it). Sleeps when the panel is off screen or the tab
// hidden; coarse pointers get the idle wander only; reduced motion gets one still frame.
function lpWallSmooth(v) { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c * (3 - 2 * c); }
function lpWallGrid(W, H, target) { const cell = Math.sqrt((W * H) / target); return { cols: Math.max(6, Math.round(W / cell)), rows: Math.max(6, Math.round(H / cell)) }; }
function lpWallHex(h, fb) { const s = String(h || '').trim().replace('#', ''); if (!/^[0-9a-f]{6}$/i.test(s)) return fb; return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; }
function lpWallMix(a, b, t) { return '#' + [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0')).join(''); }

function lpInitWall() {
  const wrap = document.querySelector('.lp-panel');
  const cv = document.querySelector('canvas.lp-wall');
  if (!wrap || !cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const DEG = Math.PI / 180, LEVELS = 14;
  const REST = 72 * DEG, MAX_TILT = 60 * DEG, RADIUS = 260, FILL = 0.4, TARGET = 2600;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const css = getComputedStyle(document.documentElement);
  const tok = (name, fb) => lpWallHex(css.getPropertyValue(name), fb);
  const ground = tok('--sb-bg', [15, 35, 64]), panel = tok('--navy-500', [61, 109, 169]);
  const palette = [];
  for (let i = 0; i < LEVELS; i++) palette.push(lpWallMix(ground, panel, i / (LEVELS - 1)));
  const buckets = palette.map(() => []);
  let cells = [], size = { w: 0, h: 0, dpr: 1, hw: 8, hh: 8 }, built = null, inView = true;
  const att = { x: 0, y: 0, tx: 0, ty: 0, live: false, since: 0 };
  let startAt = 0, sweepFrom = -1, nextSweep = -1, last = 0;

  function rebuild() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (W < 2 || H < 2) return;
    if (built && Math.abs(built.w - W) < 2 && Math.abs(built.h - H) < 90) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const { cols, rows } = lpWallGrid(W, H, TARGET);
    const cw = W / cols, ch = H / rows;
    size = { w: W, h: H, dpr, hw: cw * FILL, hh: ch * FILL };
    const persp = 0.0016, cxm = W / 2, cym = H / 2;
    let seed = 40503;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    cells = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = (gx + 0.5) * cw, y = (gy + 0.5) * ch, ra = REST * (0.92 + rnd() * 0.16);
      cells.push({ x, y, a: ra, b: 0, va: 0, vb: 0, ra, ox: (x - cxm) * persp, oy: (y - cym) * persp, nx: 0, ny: 0, nz: 0, bucket: 0, ready: false, q: new Float32Array(8) });
    }
    if (!built) { att.x = att.tx = W / 2; att.y = att.ty = H / 2; startAt = 0; }
    built = { w: W, h: H };
  }
  const L = [-0.34, -0.44, 0.83], LN = Math.hypot(...L), lx = L[0] / LN, ly = L[1] / LN, lz = L[2] / LN;
  function shadeOf(p) {
    const facing = p.nz > 0 ? p.nz : 0;
    const lam = Math.max(0, p.nx * lx + p.ny * ly + p.nz * lz);
    const shade = 0.06 + 0.5 * facing * facing + 0.42 * lam;
    return Math.min(LEVELS - 1, Math.max(0, Math.round(Math.min(1, shade) * (LEVELS - 1))));
  }
  function geometry(p) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a), cb = Math.cos(p.b), sb = Math.sin(p.b);
    p.nx = sa; p.ny = -ca * sb; p.nz = ca * cb;
    const q = p.q, hw = size.hw, hh = size.hh;
    for (let k = 0; k < 4; k++) {
      const sx = (k === 0 || k === 3) ? -hw : hw, sy = k < 2 ? -hh : hh;
      const x2 = sx * ca, y2 = sy * cb + sx * sa * sb, z2 = sy * sb - sx * sa * cb;
      q[k * 2] = p.x + x2 + p.ox * z2; q[k * 2 + 1] = p.y + y2 + p.oy * z2;
    }
  }
  function paint(now) {
    const W = size.w, H = size.h;
    if (W < 2 || !cells.length) return;
    if (!startAt) { startAt = now; last = now; sweepFrom = now + 600; nextSweep = -1; }
    const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000)); last = now;
    const idle = !att.live || now - att.since > 2600;
    if (!reduce && idle) { const t = now / 1000; att.tx = W * (0.5 + 0.3 * Math.sin(t * 0.29)); att.ty = H * (0.48 + 0.24 * Math.sin(t * 0.41 + 1.3)); }
    const follow = Math.min(1, dt * (att.live && !idle ? 11 : 2.2));
    att.x += (att.tx - att.x) * follow; att.y += (att.ty - att.y) * follow;
    let sweepP = 1;
    if (!reduce && sweepFrom >= 0) { sweepP = Math.min(1, Math.max(0, (now - sweepFrom) / 1500)); if (sweepP >= 1) { sweepFrom = -1; nextSweep = now + 10000 + Math.random() * 20000; } }
    else if (!reduce && nextSweep >= 0 && now >= nextSweep) { if (idle) { sweepFrom = now; nextSweep = -1; sweepP = 0; } else nextSweep = now + 2200; }
    const sweepX = (-0.2 + 1.4 * sweepP) * W, bandW = W * 0.19, sweeping = sweepFrom >= 0 && sweepP > 0 && sweepP < 1;
    for (const b of buckets) b.length = 0;
    const cym = H / 2;
    for (let i = 0; i < cells.length; i++) {
      const p = cells[i], dx = p.x - att.x, dy = p.y - att.y, dist = Math.sqrt(dx * dx + dy * dy);
      let w = 1 - lpWallSmooth(dist / RADIUS);
      if (sweeping) { const wv = 1 - lpWallSmooth(Math.abs(p.x + (p.y - cym) * 0.26 - sweepX) / bandW); if (wv > w) w = wv; }
      let ta = p.ra, tb = 0;
      if (w > 0.001) { const ring = w * (1 - w) * 4, inv = dist > 0.001 ? 1 / dist : 0; ta = p.ra * (1 - w) - (dx * inv) * MAX_TILT * ring * 0.85; tb = (dy * inv) * MAX_TILT * ring * 0.85; }
      if (reduce) { p.a = ta; p.b = tb; }
      else {
        const da = ta - p.a, db = tb - p.b;
        if (p.ready && Math.abs(da) < 0.0012 && Math.abs(db) < 0.0012 && Math.abs(p.va) < 0.0016 && Math.abs(p.vb) < 0.0016) { buckets[p.bucket].push(i); continue; }
        p.va += (da * 130 - p.va * 17) * dt; p.vb += (db * 130 - p.vb * 17) * dt;
        p.a += p.va * dt; p.b += p.vb * dt;
      }
      geometry(p); p.bucket = shadeOf(p); p.ready = true; buckets[p.bucket].push(i);
    }
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let bi = 0; bi < buckets.length; bi++) {
      const list = buckets[bi]; if (!list.length) continue;
      ctx.fillStyle = palette[bi]; ctx.beginPath();
      for (const idx of list) { const q = cells[idx].q; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.closePath(); }
      ctx.fill();
    }
  }
  const active = () => inView && !document.hidden;
  function tick(now) {
    if (!active()) { last = 0; setTimeout(() => requestAnimationFrame(tick), 400); return; }
    if (!last) last = now;
    paint(now);
    if (reduce) return;
    requestAnimationFrame(tick);
  }
  if (!coarse && !reduce) {
    const onMove = e => {
      const r = wrap.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < -60 || y < -60 || x > r.width + 60 || y > r.height + 60) { att.live = false; return; }
      att.tx = x; att.ty = y; att.live = true; att.since = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); }, { threshold: 0.02 }).observe(wrap);
  new ResizeObserver(() => { rebuild(); if (reduce) paint(performance.now()); }).observe(wrap);
  rebuild();
  requestAnimationFrame(tick);
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
  const btn = root.querySelector('#lp-lead-send'), pre = root.querySelector('#lp-lead-json'), card = root.querySelector('#lp-lead-card'), fields = root.querySelector('#lp-lead-fields'), chips = root.querySelector('#lp-lead-chips');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, last = null;
  function show(preset) {
    last = preset;
    const r = lpMapLead(preset.payload, preset.map);
    if (pre) pre.textContent = JSON.stringify(preset.payload, null, 2);
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
    if (card) { card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in'); }
    root.classList.remove('is-sending'); void root.offsetWidth; if (!reduce) root.classList.add('is-sending');
  }
  btn?.addEventListener('click', () => { show(LP_LEAD_PRESETS[i % LP_LEAD_PRESETS.length]); i++; });
  lpRerender.push(() => { if (last) show(last); });
  show(LP_LEAD_PRESETS[0]); i = 1;
}

// ── time zones: the Calendar's conversion, wall clock in → wall clock out ───
// Offset of `tz` from UTC at the instant `utcMs`, in milliseconds.
function lpZoneOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const g = t => Number(parts.find(p => p.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - utcMs;
}

// '2026-10-07', '09:30', 'Europe/Berlin', 'Europe/Lisbon' → { time: '08:30', dayShift: 0 }
function lpConvertClock(date, time, fromTz, toTz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - lpZoneOffsetMs(wall, fromTz);
  utc = wall - lpZoneOffsetMs(utc, fromTz);                 // second pass settles a DST edge
  const local = new Date(utc + lpZoneOffsetMs(utc, toTz));
  const pad = n => String(n).padStart(2, '0');
  const shift = Math.round((Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - Date.UTC(y, m - 1, d)) / 864e5);
  return { time: pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()), dayShift: shift };
}

function lpInitTimezone() {
  const root = document.getElementById('lp-tz');
  if (!root) return;
  const from = root.querySelector('#lp-tz-from'), to = root.querySelector('#lp-tz-to'), time = root.querySelector('#lp-tz-time');
  const out = root.querySelector('#lp-tz-out'), note = root.querySelector('#lp-tz-note'), day = root.querySelector('#lp-tz-day');
  for (const sel of [from, to]) { if (!sel) continue; for (const z of LP_ZONES) { const o = document.createElement('option'); o.value = z; o.textContent = z.replace('_', ' '); sel.appendChild(o); } }
  if (from) from.value = 'Europe/Berlin';
  if (to) to.value = 'Europe/Lisbon';
  const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
  function render() {
    if (!from || !to || !time || !out) return;
    const t = /^\d{2}:\d{2}$/.test(time.value) ? time.value : '09:30';
    let r;
    try { r = lpConvertClock(today(), t, from.value, to.value); } catch { return; }
    out.textContent = r.time;
    if (note) note.textContent = from.value === to.value ? '' : lpT('lp_tz_note', { time: t, zone: from.value.split('/').pop().replace('_', ' ') });
    if (day) day.textContent = r.dayShift > 0 ? lpT('lp_tz_next') : r.dayShift < 0 ? lpT('lp_tz_prev') : lpT('lp_tz_same');
  }
  [from, to, time].forEach(el => el?.addEventListener('input', render));
  lpRerender.push(render);
  render();
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

  function render() {
    const a = LP_ANALYTICS[period];
    root.querySelectorAll('.lp-period-btn').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.period) === period)));
    q('#lp-an-open').textContent = lpFmtEurShort(a.open);
    q('#lp-an-won').textContent = lpFmtEurShort(a.won);
    q('#lp-an-rate').textContent = a.rate + ' %';
    q('#lp-an-new').textContent = String(a.newDeals);

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

  root.querySelectorAll('.lp-period-btn').forEach(b => b.addEventListener('click', () => { period = Number(b.dataset.period) || 6; render(); }));
  lpRerender.push(render);
  render();
}

// ── the Engine: sign the event in the browser exactly as the server does ────
function lpHex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function lpRandomHex(bytes) { const a = new Uint8Array(bytes); (globalThis.crypto).getRandomValues(a); return lpHex(a.buffer); }

// 'sha256=' + hex(HMAC-SHA256(secret, "<timestamp>.<rawBody>")) — the scheme of utils/engine.js.
async function lpSign(secret, timestamp, rawBody) {
  const subtle = (globalThis.crypto || {}).subtle;
  if (!subtle) throw new Error('no subtle crypto');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  return 'sha256=' + lpHex(sig);
}

// The payload utils/engine.js builds for a deal that reached a trigger stage.
function lpEnginePayload({ eventId, timestamp, title, stage }) {
  return { event: 'vertrag.unterschrieben', event_id: eventId, timestamp, kunde_id: 318, vertrag_id: 1042, produkt: title, stage };
}

function lpInitEngine() {
  const root = document.getElementById('engine');
  if (!root) return;
  const q = s => root.querySelector(s);
  const secret = lpRandomHex(24);
  const body = q('#lp-en-body'), sig = q('#lp-en-sig'), status = q('#lp-en-state'), note = q('#lp-en-note');
  let state = 'idle';
  const paint = () => { if (status) status.textContent = lpT(state === 'idle' ? 'lp_en_idle' : state === 'pending' ? 'lp_en_pending' : 'lp_en_done'); };
  lpRerender.push(paint);
  async function send() {
    const now = new Date();
    const eventId = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : lpRandomHex(16);
    const payload = lpEnginePayload({ eventId, timestamp: now.toISOString(), title: lpT('lp_deal_name'), stage: lpT('lp_col_won') });
    const raw = JSON.stringify(payload, null, 2);
    const ts = Math.floor(now.getTime() / 1000);
    if (body) body.textContent = raw;
    if (note) note.textContent = '';
    try { if (sig) sig.textContent = `X-Upgrads-Timestamp: ${ts}\nX-Upgrads-Signature: ${await lpSign(secret, ts, raw)}`; }
    catch { if (sig) sig.textContent = `X-Upgrads-Timestamp: ${ts}\nX-Upgrads-Signature: sha256=…`; if (note) note.textContent = lpT('lp_en_nosubtle'); }
    root.classList.remove('is-done'); root.classList.add('is-sent', 'is-pending');
    state = 'pending'; paint();
    setTimeout(() => { root.classList.remove('is-pending'); root.classList.add('is-done'); state = 'done'; paint(); }, 800);
  }
  q('#lp-en-send')?.addEventListener('click', send);
  paint();
}

// ── boot ────────────────────────────────────────────────────────────────────
function lpInit() {
  document.body.classList.add('lp');
  document.querySelectorAll('.lp-lang-btn').forEach(b => b.addEventListener('click', () => lpSetLang(b.dataset.lang)));
  lpInitIndex();
  lpInitRecord();
  lpInitLeads();
  lpInitTimezone();
  lpInitAnalytics();
  lpInitEngine();
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch {}
  lpApplyLang(saved || 'de');
  lpInitBoard();   // after the language, so its first paint reads it
  lpInitWall();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', lpInit);
