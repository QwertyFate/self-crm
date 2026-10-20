// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE TWO — public/js/landing2.js  (Part 35, 2026-10-20: from scratch)
//
// The crossed-off list, as a reel. The hero ticks the four chores off one by
// one on load (the product's own task rows). Then six frames side by side,
// one per swipe; each middle frame takes one chore: the product does it once
// on first arrival (a lead flies in from Instagram; the number is already in
// the composer; the calendar speaks up with the conflict), and the chore is
// struck through. The fourth frame waits for the hand: the strike comes when
// the card is dropped into Gewonnen and the Engine answers. The segments in
// the bar fill while each frame's scene plays. One state behind every frame;
// German first with every string a key of RL_I18N, English one click away;
// every action answered the way the app answers it: a toast with Rückgängig.
//
//   01 the words            02 language            03 helpers, the toast
//   04 the one state        05 the pager           06 the reel: segments, scenes, the flight
//   07 column, cards, move  08 arrivals            09 the deal record
//   10 the booking, week    11 Gewonnen, Engine    12 chrome, start
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

/* ── 01 · the words ───────────────────────────────────────────────────── */
const RL_I18N = {
  de: {
    rl_lang: 'Sprache', rl_login: 'Anmelden', rl_request: 'Zugang anfragen', rl_crm: 'CRM',
    rl_hero_t: 'Vier Handgriffe gestrichen.',
    rl_hero_d: 'Der Lead, die Nummer, der Termin, das Onboarding. Was bleibt, ist das Gespräch.',
    rl_list_aria: 'Die vier Handgriffe',
    rl_c1: 'Leads abtippen', rl_c2: 'Nummern suchen', rl_c3: 'Kalender abgleichen', rl_c4: 'Onboarding anstoßen',
    rl_p1_d: 'Aus Facebook, Instagram, TikTok und der Website kommt der Lead von selbst.',
    rl_p2_d: 'Anruf, E-Mail, WhatsApp mit Vorlage: direkt vom Deal. Strg+Enter speichert.',
    rl_p3_d: 'Gebucht vom Deal. Eigene Einträge melden sich von selbst. Cal.com lädt ein.',
    rl_p4_d: 'Karte nach Gewonnen ziehen. Die Upgrads Engine übernimmt, Schritt für Schritt.',
    rl_close_t: 'Der fünfte Handgriff.', rl_close_d: 'Eine Mail genügt. Der Code kommt mit Rolle: Mitglied, Admin oder Inhaber.',
    rl_foot_fiction: 'Alle Daten auf dieser Seite sind erfunden.',
    rl_hint_touch: 'Nach links wischen', rl_hint_key: 'Pfeiltaste oder scrollen',
    rl_nav_aria: 'Abschnitte', rl_prev: 'Zurück', rl_next: 'Weiter',
    rl_tab_0: 'Start', rl_tab_1: 'Leads', rl_tab_2: 'Deal', rl_tab_3: 'Termin', rl_tab_4: 'Gewonnen', rl_tab_5: 'Zugang',
    rl_via: 'über Make, Zapier oder n8n',
    rl_sources: 'Lead-Quellen', rl_src_fb: 'Facebook Ads', rl_src_ig: 'Instagram Ads', rl_src_tt: 'TikTok Ads', rl_src_web: 'Website',
    rl_inbox_aria: 'Erste Phase mit neuen Leads', rl_won_aria: 'Die letzten zwei Phasen und die Engine', rl_week_aria: 'Teamkalender, diese Woche', rl_deal_stage_aria: 'Deal-Phase', rl_types_aria: 'Aktivitätstyp',
    // the product's own words (pinned to the app's dictionary by the suite)
    rl_undo: 'Rückgängig', rl_moved_to: 'Verschoben nach {s}',
    rl_st_new: 'Neu', rl_st_contacted: 'Kontaktiert', rl_st_proposal: 'Angebot', rl_st_nego: 'Verhandlung', rl_st_won: 'Gewonnen',
    rl_created_ago: 'Erstellt {when}', rl_today: 'heute', rl_yesterday: 'gestern', rl_days_ago: 'vor {n} Tagen', rl_just_now: 'gerade eben', rl_updated_tag: 'aktualisiert',
    rl_urg_1: 'Niedrig', rl_urg_2: 'Mittel', rl_urg_3: 'Hoch', rl_urg_4: 'Sehr dringend',
    rl_deal_value: 'Deal-Wert', rl_current_stage: 'Aktuelle Phase: {s}', rl_move_to: 'Nach {s} verschieben',
    rl_act_note: 'Notiz', rl_act_call: 'Anruf', rl_act_email: 'E-Mail', rl_act_whatsapp: 'WhatsApp', rl_act_meeting: 'Termin',
    rl_verb_note: 'Notiz hinzufügen', rl_verb_call: 'Anruf erfassen', rl_verb_email: 'E-Mail erfassen', rl_verb_whatsapp: 'Nachricht erfassen',
    rl_ph_note: 'Notiz schreiben', rl_ph_call: 'Was wurde im Gespräch besprochen?', rl_ph_email: 'E-Mail zusammenfassen oder die Kernpunkte einfügen', rl_ph_whatsapp: 'Nachrichtentext oder Zusammenfassung des Chats',
    rl_to_whom: 'An {who}', rl_open_dialer: 'Anrufen', rl_open_mail: 'E-Mail-Programm öffnen', rl_open_whatsapp: 'WhatsApp öffnen',
    rl_logged_as_on: 'Erfasst als {user} bei {contact}.', rl_ctrl_enter: 'Strg+Enter speichert.', rl_act_logged: '{type} erfasst', rl_by_name: 'von {name}', rl_compose_text_lbl: '{type}-Text',
    rl_wa_template_lbl: 'WhatsApp-Nachrichtenvorlage', rl_join: '{app} beitreten',
    rl_book_btn: 'Termin buchen', rl_book_title: 'Termin mit {name} buchen', rl_book_type: 'Terminart', rl_book_where: 'Wo', rl_book_date: 'Datum', rl_book_time: 'Uhrzeit', rl_book_time_ph: 'Uhrzeit wählen',
    rl_book_slot: '{from} bis {to} ({ampm})', rl_book_zone: 'Zeiten in {zone}. Gastgeber: {host}.', rl_book_invite_to: 'Die Einladung geht an {email}.', rl_book_submit: 'Buchen', rl_book_anyway: 'Trotzdem buchen',
    rl_book_conflict: 'Konflikt: um {time} steht bereits {title} ({who}) im Kalender.', rl_book_conflict_hint: 'Cal.com kennt die Aufgaben und Einträge dieses CRM nicht. Trotzdem buchen oder eine andere Zeit wählen.',
    rl_book_done: 'Gebucht: {when}. Cal.com schickt die Einladung.', rl_book_with: 'mit {name}', rl_type_30: '30 Minuten', rl_type_60: '60 Minuten', rl_where_meet: 'Google Meet', rl_where_phone: 'Telefon',
    rl_d0: 'Mo', rl_d1: 'Di', rl_d2: 'Mi', rl_d3: 'Do', rl_d4: 'Fr',
    rl_engine_title: 'Upgrads Engine', rl_engine_active: 'Aktiv', rl_engine_stages_label: 'Auslöser-Phasen', rl_deliveries_title: 'Gesendete Ereignisse', rl_no_deliveries: 'Noch keine Ereignisse gesendet.',
    rl_status_pending: 'Ausstehend', rl_status_success: 'Zugestellt', rl_attempt_one: 'Versuch', rl_ev_name: 'Vertrag unterschrieben', rl_onb_col_status: 'Engine-Status',
    rl_onb_s0: 'Kein Onboarding', rl_onb_s1: 'Formular versendet', rl_onb_s2: 'Formular ausgefüllt', rl_onb_s3: 'Termin gebucht', rl_onb_s4: 'Call erfolgt', rl_onb_s5: 'Briefing fertig', rl_onb_s6: 'Abgeschlossen',
    // the invented data (names and numbers stay, the words switch)
    rl_x_a1: 'Hallo Marie, danke für das Gespräch eben. Das Angebot kommt heute per Mail.', rl_x_a2: 'Angebot gesendet, Laufzeit zwölf Monate.', rl_x_a3: 'Will erst mit dem Partner sprechen. Nachfassen am Donnerstag.',
    rl_x_booked: '{day} {date}, {from} bis {to}. Einladung an {email}.',
    rl_x_e1: 'Rückruf Berger', rl_x_e2: 'Teammeeting', rl_x_e3: 'Besichtigung Krüger', rl_x_e4: 'Übergabe Hofmann',
  },
  en: {
    rl_lang: 'Language', rl_login: 'Sign in', rl_request: 'Request access', rl_crm: 'CRM',
    rl_hero_t: 'Four chores, crossed off.',
    rl_hero_d: 'The lead, the number, the meeting, the onboarding. What’s left is the conversation.',
    rl_list_aria: 'The four chores',
    rl_c1: 'Typing leads in', rl_c2: 'Hunting for numbers', rl_c3: 'Checking calendars', rl_c4: 'Kicking off onboarding',
    rl_p1_d: 'From Facebook, Instagram, TikTok and the website, the lead arrives by itself.',
    rl_p2_d: 'Call, email, WhatsApp with the template: straight from the deal. Ctrl+Enter saves.',
    rl_p3_d: 'Booked from the deal. Own entries speak up. Cal.com sends the invite.',
    rl_p4_d: 'Drag the card into Won. The Upgrads Engine takes over, step by step.',
    rl_close_t: 'The fifth chore.', rl_close_d: 'One email is enough. The code comes with a role: member, admin or owner.',
    rl_foot_fiction: 'All data on this page is invented.',
    rl_hint_touch: 'Swipe left', rl_hint_key: 'Arrow key or scroll',
    rl_nav_aria: 'Sections', rl_prev: 'Back', rl_next: 'Next',
    rl_tab_0: 'Start', rl_tab_1: 'Leads', rl_tab_2: 'Deal', rl_tab_3: 'Meeting', rl_tab_4: 'Won', rl_tab_5: 'Access',
    rl_via: 'via Make, Zapier or n8n',
    rl_sources: 'Lead sources', rl_src_fb: 'Facebook Ads', rl_src_ig: 'Instagram Ads', rl_src_tt: 'TikTok Ads', rl_src_web: 'Website',
    rl_inbox_aria: 'First stage with new leads', rl_won_aria: 'The last two stages and the Engine', rl_week_aria: 'Team calendar, this week', rl_deal_stage_aria: 'Deal stage', rl_types_aria: 'Activity type',
    rl_undo: 'Undo', rl_moved_to: 'Moved to {s}',
    rl_st_new: 'New', rl_st_contacted: 'Contacted', rl_st_proposal: 'Proposal', rl_st_nego: 'Negotiation', rl_st_won: 'Won',
    rl_created_ago: 'Created {when}', rl_today: 'today', rl_yesterday: 'yesterday', rl_days_ago: '{n} days ago', rl_just_now: 'just now', rl_updated_tag: 'updated',
    rl_urg_1: 'Low', rl_urg_2: 'Medium', rl_urg_3: 'High', rl_urg_4: 'Very urgent',
    rl_deal_value: 'Deal value', rl_current_stage: 'Current stage: {s}', rl_move_to: 'Move to {s}',
    rl_act_note: 'Note', rl_act_call: 'Call', rl_act_email: 'Email', rl_act_whatsapp: 'WhatsApp', rl_act_meeting: 'Meeting',
    rl_verb_note: 'Add note', rl_verb_call: 'Log call', rl_verb_email: 'Log email', rl_verb_whatsapp: 'Log message',
    rl_ph_note: 'Write a note', rl_ph_call: 'What was discussed on the call?', rl_ph_email: 'Summarise the email or paste its key points', rl_ph_whatsapp: 'Message text or summary of the chat',
    rl_to_whom: 'To {who}', rl_open_dialer: 'Open dialer', rl_open_mail: 'Open mail app', rl_open_whatsapp: 'Open WhatsApp',
    rl_logged_as_on: 'Logged as {user}, on {contact}.', rl_ctrl_enter: 'Press Ctrl+Enter to save.', rl_act_logged: '{type} logged', rl_by_name: 'by {name}', rl_compose_text_lbl: '{type} text',
    rl_wa_template_lbl: 'WhatsApp message template', rl_join: 'Join {app}',
    rl_book_btn: 'Book meeting', rl_book_title: 'Book a meeting with {name}', rl_book_type: 'Event type', rl_book_where: 'Where', rl_book_date: 'Date', rl_book_time: 'Time', rl_book_time_ph: 'Pick a time',
    rl_book_slot: '{from} to {to} ({ampm})', rl_book_zone: 'Times in {zone}. Host: {host}.', rl_book_invite_to: 'The invitation goes to {email}.', rl_book_submit: 'Book', rl_book_anyway: 'Book anyway',
    rl_book_conflict: 'Conflict: {time} {title} ({who}) is already on the calendar.', rl_book_conflict_hint: 'Cal.com does not see the tasks and entries of this CRM. Book anyway, or pick another time.',
    rl_book_done: 'Booked: {when}. Cal.com sends the invitation.', rl_book_with: 'with {name}', rl_type_30: '30 minutes', rl_type_60: '60 minutes', rl_where_meet: 'Google Meet', rl_where_phone: 'Phone',
    rl_d0: 'Mon', rl_d1: 'Tue', rl_d2: 'Wed', rl_d3: 'Thu', rl_d4: 'Fri',
    rl_engine_title: 'Upgrads Engine', rl_engine_active: 'Active', rl_engine_stages_label: 'Trigger stages', rl_deliveries_title: 'Sent events', rl_no_deliveries: 'No events sent yet.',
    rl_status_pending: 'Pending', rl_status_success: 'Delivered', rl_attempt_one: 'attempt', rl_ev_name: 'Contract signed', rl_onb_col_status: 'Engine status',
    rl_onb_s0: 'No onboarding', rl_onb_s1: 'Form sent', rl_onb_s2: 'Form completed', rl_onb_s3: 'Appointment booked', rl_onb_s4: 'Call done', rl_onb_s5: 'Briefing ready', rl_onb_s6: 'Completed',
    rl_x_a1: 'Hello Marie, thanks for the call just now. The proposal goes out by email today.', rl_x_a2: 'Proposal sent, twelve-month term.', rl_x_a3: 'Wants to talk to the partner first. Follow up on Thursday.',
    rl_x_booked: '{day} {date}, {from} to {to}. Invitation to {email}.',
    rl_x_e1: 'Call-back Berger', rl_x_e2: 'Team meeting', rl_x_e3: 'Viewing Krüger', rl_x_e4: 'Hand-over Hofmann',
  },
};

/* ── 02 · language ────────────────────────────────────────────────────── */
let rlLang = 'de';
function rlT(k, vars) {
  let s = (RL_I18N[rlLang] && RL_I18N[rlLang][k]) ?? RL_I18N.de[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(String(b));
  return s;
}
function rlApplyLang() {
  document.documentElement.lang = rlLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = rlT(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', rlT(el.dataset.i18nAria)));
  document.querySelectorAll('.rl-lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === rlLang)));
  rlRenderAll();
}
function rlSetLang(l) {
  if (l !== 'de' && l !== 'en') return;
  rlLang = l;
  try { localStorage.setItem('lang', l); } catch (e) { /* private mode */ }
  rlApplyLang();
}

/* ── 03 · helpers, the toast ──────────────────────────────────────────── */
function rlEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rlClamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
// Money as the app's board shows it (public/js/deals.js: 9.8k €, 1.2M €).
function rlMoney(v) {
  if (v == null) return '';
  if (v >= 1e6) return (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M €';
  if (v >= 1e3) return (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'k €';
  return v + ' €';
}
function rlAgo(days) { return days <= 0 ? rlT('rl_today') : days === 1 ? rlT('rl_yesterday') : rlT('rl_days_ago', { n: days }); }
function rlNow() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function rlIcon(name, cls) { return `<svg class="rl-ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#rl-i-${name}"/></svg>`; }
const RL_PEOPLE = { AW: 'Anna Weiß', JK: 'Jan Krause', MS: 'Mira Sahin' };
function rlAv(who) { return `<span class="rl-av rl-av-${who.toLowerCase()}" title="${rlEsc(RL_PEOPLE[who])}">${rlEsc(who)}</span>`; }
function rlReduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
// The app's toast: a line and a bare Rückgängig button, three at most, gone after 4.2 s.
function rlToast(text, undo) {
  const host = document.getElementById('rl-toasts'); if (!host) return;
  while (host.children.length >= 3) host.firstChild.remove();
  const el = document.createElement('div'); el.className = 'rl-toast';
  el.innerHTML = `<span>${rlEsc(text)}</span>${undo ? `<button type="button">${rlEsc(rlT('rl_undo'))}</button>` : ''}`;
  if (undo) el.querySelector('button').addEventListener('click', () => { el.remove(); undo(); });
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ── 04 · the one state ───────────────────────────────────────────────── */
const RL_STAGES = ['new', 'contacted', 'proposal', 'nego', 'won'];
const RL_STAGE_KEYS = ['rl_st_new', 'rl_st_contacted', 'rl_st_proposal', 'rl_st_nego', 'rl_st_won'];
const rlStageName = i => rlT(RL_STAGE_KEYS[i]);
const RL_HERO = 1;
let rlNextId = 100;
// created / updated: days ago. src: where the lead came from. A deal the webhook created carries the contact's bare name.
let rlDeals = [
  { id: 1, title: 'Marie Lindner', contact: 'Marie Lindner', company: 'Lindner & Sohn', email: 'marie.lindner@example.de', phone: '+49 171 5540 218', value: 9800, urg: 3, stage: 3, owner: 'AW', created: 11, updated: 1 },
  { id: 2, title: 'Jonas Weber', contact: 'Jonas Weber', company: '', email: 'jonas.weber@example.de', phone: '+49 160 9912 304', value: null, urg: 0, stage: 0, owner: 'AW', created: 0, updated: 0, src: 'fb', time: '08:32' },
  { id: 3, title: 'Sophie Brandt', contact: 'Sophie Brandt', company: '', email: 'sophie.brandt@example.de', phone: '+49 152 2231 877', value: null, urg: 0, stage: 0, owner: 'AW', created: 0, updated: 0, src: 'web', time: '08:05' },
  { id: 7, title: 'Nadia Öztürk', contact: 'Nadia Öztürk', company: 'Öztürk Immobilien', email: 'nadia.oeztuerk@example.de', phone: '+49 157 3302 441', value: 5600, urg: 1, stage: 3, owner: 'MS', created: 8, updated: 3 },
  { id: 8, title: 'Peters & Co.', contact: 'Daniel Peters', company: 'Peters & Co.', email: 'd.peters@example.de', phone: '+49 170 6612 087', value: 8900, urg: 0, stage: 4, owner: 'AW', created: 20, updated: 2 },
];
let rlActs = [
  { id: 'a3', dealId: 1, type: 'note', who: 'AW', days: 0, time: '09:12', key: 'rl_x_a3' },
  { id: 'a2', dealId: 1, type: 'email', who: 'AW', days: 2, key: 'rl_x_a2' },
  { id: 'a1', dealId: 1, type: 'whatsapp', who: 'AW', days: 2, key: 'rl_x_a1' },
];
// The team calendar's week: day 0 = Monday, start as HH:MM, len in minutes. The host's (AW's) entries are the ones the check knows.
let rlEvents = [
  { id: 'e1', day: 0, start: '09:00', len: 30, who: 'AW', key: 'rl_x_e1' },
  { id: 'e2', day: 1, start: '11:00', len: 30, who: 'AW', key: 'rl_x_e2' },
  { id: 'e3', day: 1, start: '15:00', len: 60, who: 'AW', key: 'rl_x_e3' },
  { id: 'e4', day: 3, start: '10:00', len: 30, who: 'JK', key: 'rl_x_e4' },
];
const RL_DAYS = ['rl_d0', 'rl_d1', 'rl_d2', 'rl_d3', 'rl_d4'];
const RL_DATES = ['19.10.', '20.10.', '21.10.', '22.10.', '23.10.'];
const RL_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
let rlBookState = { day: 1, len: 30, where: 'meet', slot: null };
let rlRec = { type: 'call', text: '' };
let rlEngine = { fired: false, delivered: false, step: 0 };
let rlEngineTimer = null;
let rlLeftStage = 3;
// What each source sends next: name, email, phone. A known email updates the contact instead of making a second one.
const RL_LEADS = {
  fb: [['Tom Riedel', 'tom.riedel@example.de', '+49 170 2231 118'], ['Eva Schulz', 'eva.schulz@example.de', '+49 151 4480 902'], ['Jonas Weber', 'jonas.weber@example.de', '+49 160 9912 304']],
  ig: [['Lea Fischer', 'lea.fischer@example.de', '+49 176 8821 450'], ['Ben Hartmann', 'ben.hartmann@example.de', '+49 162 3390 771'], ['Sophie Brandt', 'sophie.brandt@example.de', '+49 152 2231 877']],
  tt: [['Noah Klein', 'noah.klein@example.de', '+49 157 6604 318'], ['Mila Roth', 'mila.roth@example.de', '+49 171 9023 665'], ['Tom Riedel', 'tom.riedel@example.de', '+49 170 2231 118']],
  web: [['Clara Voss', 'clara.voss@example.de', '+49 160 7715 204'], ['Finn Lorenz', 'finn.lorenz@example.de', '+49 151 3348 519'], ['Lea Fischer', 'lea.fischer@example.de', '+49 176 8821 450']],
};
let rlLeadIx = { fb: 0, ig: 0, tt: 0, web: 0 };
const RL_TYPE_ICON = { note: 'note', call: 'phone', email: 'mail', whatsapp: 'message', meeting: 'calendar' };
const rlHero = () => rlDeals.find(d => d.id === RL_HERO);

/* ── 05 · the pager ───────────────────────────────────────────────────── */
const RL_IDS = ['start', 'leads', 'deal', 'termin', 'gewonnen', 'zugang'];
const RL = { i: 0, busy: false, drag: false, seen: [], struck: [], wheelAcc: 0, wheelLock: false, wheelSince: 0, wheelTimer: null, settleTimer: null, litTimer: null };
function rlTrack() { return document.getElementById('rl-track'); }
function rlIndexOf(hash) { const k = RL_IDS.indexOf(String(hash || '').replace(/^#/, '')); return k < 0 ? 0 : k; }
// The current frame: its segment, the inert attribute on the other frames, the arrows, and its scene (once).
function rlMark(i) {
  RL.i = i;
  document.querySelectorAll('.rl-seg').forEach((t, k) => { t.classList.toggle('is-on', k === i); t.setAttribute('aria-selected', String(k === i)); });
  document.querySelectorAll('.rl-frame').forEach((p, k) => p.toggleAttribute('inert', k !== i));
  const prev = document.getElementById('rl-prev'), next = document.getElementById('rl-next');
  if (prev) prev.disabled = i === 0;
  if (next) next.disabled = i === RL_IDS.length - 1;
  rlPlay(i);
}
function rlGo(i, instant, focus) {
  const track = rlTrack(); if (!track) return;
  i = rlClamp(i, 0, RL_IDS.length - 1);
  rlMark(i);
  history.replaceState(null, '', '#' + RL_IDS[i]);
  RL.busy = true;
  track.scrollTo({ left: i * track.clientWidth, behavior: instant || rlReduced() ? 'instant' : 'smooth' });
  if (focus) document.getElementById(RL_IDS[i])?.focus({ preventScroll: true });
}
// After the track has been quiet for 120 ms: a native swipe is adopted, an interrupted jump is repaired, a drift is realigned.
function rlSettle() {
  const track = rlTrack(); if (!track) return;
  const w = track.clientWidth || 1, k = Math.round(track.scrollLeft / w);
  if (RL.busy && k !== RL.i) track.scrollTo({ left: RL.i * w, behavior: 'instant' });
  else if (k !== RL.i) { rlMark(k); history.replaceState(null, '', '#' + RL_IDS[k]); }
  else if (Math.abs(track.scrollLeft - RL.i * w) > 1) track.scrollTo({ left: RL.i * w, behavior: 'instant' });
  RL.busy = false;
}
// A wheel stream is one gesture: the first notch pages, the rest is held until the stream has been quiet for 160 ms (and 450 ms have passed).
function rlWheelLock() {
  clearTimeout(RL.wheelTimer);
  RL.wheelTimer = setTimeout(() => { if (Date.now() - RL.wheelSince >= 450) { RL.wheelLock = false; RL.wheelAcc = 0; } else rlWheelLock(); }, 160);
}
function rlOnWheel(e) {
  if (RL.drag || RL.busy) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;            // sideways is native: the track snaps by itself
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
  const s = e.target.closest('.rl-scroll');
  if (s && s.scrollHeight > s.clientHeight + 1 && ((dy < 0 && s.scrollTop > 0) || (dy > 0 && s.scrollTop + s.clientHeight < s.scrollHeight - 1))) { rlWheelLock(); return; }
  e.preventDefault();
  if (RL.wheelLock) { rlWheelLock(); return; }
  RL.wheelAcc += dy;
  if (Math.abs(RL.wheelAcc) < 24) return;
  rlGo(RL.i + Math.sign(RL.wheelAcc));
  RL.wheelAcc = 0; RL.wheelLock = true; RL.wheelSince = Date.now();
  rlWheelLock();
}
function rlOnKey(e) {
  if (e.defaultPrevented || RL.drag || e.target.closest('input, textarea, select, [contenteditable]')) return;
  const map = { ArrowRight: RL.i + 1, PageDown: RL.i + 1, ArrowLeft: RL.i - 1, PageUp: RL.i - 1, Home: 0, End: RL_IDS.length - 1 };
  if (!(e.key in map)) return;
  e.preventDefault();
  rlGo(map[e.key], false, true);
}
function rlInitPager() {
  const track = rlTrack(); if (!track) return;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  track.addEventListener('scroll', () => { clearTimeout(RL.settleTimer); RL.settleTimer = setTimeout(rlSettle, 120); }, { passive: true });
  document.addEventListener('wheel', rlOnWheel, { passive: false });
  document.addEventListener('keydown', rlOnKey);
  window.addEventListener('resize', () => track.scrollTo({ left: RL.i * track.clientWidth, behavior: 'instant' }));
  window.addEventListener('hashchange', () => rlGo(rlIndexOf(location.hash), true));
  track.addEventListener('focusin', e => { const p = e.target.closest('.rl-frame'); const k = p ? RL_IDS.indexOf(p.id) : -1; if (k >= 0 && k !== RL.i) rlGo(k, true); });
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { const v = go.dataset.go; rlGo(v === 'prev' ? RL.i - 1 : v === 'next' ? RL.i + 1 : +v, false, true); return; }
    const a = e.target.closest('a[href^="#"]');
    if (a) { e.preventDefault(); rlGo(rlIndexOf(a.getAttribute('href')), false, true); }
  });
}

/* ── 06 · the reel: the segments, the scenes, the flight ──────────────── */
// How long each frame's segment takes to fill: the length of its scene. Frame 4 fills when the hand drops the card.
const RL_SCENE_MS = [1600, 1300, 1200, 1200, 600, 400];
function rlFill(i, ms) {
  const f = document.querySelectorAll('.rl-seg-fill')[i]; if (!f) return;
  f.style.setProperty('--rl-sd', (rlReduced() ? 0 : ms) + 'ms');
  f.style.setProperty('--rl-f', '100%');
}
// The chore is struck once; the strike is the product's, earned by the scene or by the hand.
function rlStrike(n) {
  if (RL.struck[n]) return; RL.struck[n] = true;
  document.getElementById('rl-chore-' + n)?.classList.add('is-struck');
}
// A ring on the thing the scene points at, for a moment.
function rlLit(el) {
  if (!el) return;
  el.classList.add('is-lit');
  clearTimeout(RL.litTimer);
  RL.litTimer = setTimeout(() => el.classList.remove('is-lit'), 1200);
}
// The hero: the four chores ticked one after another, as the app ticks a task (done circle + strike).
function rlSceneList(instant) {
  rlFill(0, RL_SCENE_MS[0]);
  document.querySelectorAll('#rl-list .rl-row').forEach((r, k) => {
    if (instant) r.classList.add('is-done');
    else setTimeout(() => r.classList.add('is-done'), 300 + k * 320);
  });
}
// Leads: one lead flies in from Instagram and lands in the first stage; the chore is struck as it lands.
function rlSceneLead(instant) {
  rlFill(1, RL_SCENE_MS[1]);
  const land = () => { rlArrive('ig'); rlStrike(1); };
  if (instant) land(); else rlFly('ig', land);
}
// The deal: the composer opens on WhatsApp with the contact's number and the template already there.
function rlSceneNumber(instant) {
  rlFill(2, RL_SCENE_MS[2]);
  rlRec.type = 'whatsapp'; rlRenderRecord();
  if (!instant) rlLit(document.querySelector('#rl-record .rl-chint'));
  rlStrike(2);
}
// The meeting: the sheet picks Tuesday 11:00 and the calendar speaks up with the team meeting.
function rlSceneConflict(instant) {
  rlFill(3, RL_SCENE_MS[3]);
  rlBookState.day = 1; rlBookState.slot = '11:00'; rlRenderBook();
  if (!instant) rlLit(document.querySelector('#rl-book .rl-conflict'));
  rlStrike(3);
}
function rlSceneClose() { rlFill(5, RL_SCENE_MS[5]); }
const RL_SCENES = { 0: rlSceneList, 1: rlSceneLead, 2: rlSceneNumber, 3: rlSceneConflict, 5: rlSceneClose };
// Each frame's scene plays once, on its first arrival, after the snap has settled (400 ms); if the visitor has
// already moved on by then, the frame is left unseen so it plays when they come back. Reduced motion: at once, at the end.
function rlPlay(i) {
  if (RL.seen[i]) return; RL.seen[i] = true;
  const scene = RL_SCENES[i]; if (!scene) return;   // frame 4 is the hand's
  if (rlReduced()) { scene(true); return; }
  setTimeout(() => { if (RL.i === i) scene(false); else RL.seen[i] = false; }, 400);
}
// A packet with the source's mark flies from its button to the first stage's head, along a lifted arc, then lands.
function rlFly(src, land) {
  const from = document.querySelector(`#rl-sources .rl-src[data-src="${src}"] .rl-logo`), to = document.querySelector('#rl-inbox .rl-col-head'), host = document.getElementById('rl-fly');
  if (!from || !to || !host || rlReduced() || typeof host.animate !== 'function') { land(); return; }
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2 - 18, y0 = a.top + a.height / 2 - 18, x1 = b.left + b.width / 2 - 18, y1 = b.top + b.height / 2 - 18;
  const el = document.createElement('span'); el.className = 'rl-packet';
  el.innerHTML = src === 'web' ? rlIcon('globe', 'rl-logo') : `<svg class="rl-logo" aria-hidden="true"><use href="#rl-l-${src}"/></svg>`;
  el.style.setProperty('--rl-px', x0 + 'px'); el.style.setProperty('--rl-py', y0 + 'px');
  host.appendChild(el);
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 56;
  const anim = el.animate([
    { transform: `translate(${x0}px, ${y0}px)` },
    { transform: `translate(${mx}px, ${my}px)`, offset: .5 },
    { transform: `translate(${x1}px, ${y1}px)` },
  ], { duration: 650, easing: 'cubic-bezier(.3, .6, .2, 1)', fill: 'forwards' });
  anim.onfinish = () => { el.remove(); land(); };
}

/* ── 07 · the column, the cards, the move ─────────────────────────────── */
function rlCardHtml(d, quiet) {
  const src = d.src ? `<span class="rl-card-src">${d.src === 'web' ? rlIcon('globe') : `<svg class="rl-logo rl-logo-sm" aria-hidden="true"><use href="#rl-l-${d.src}"/></svg>`}${rlEsc(rlT('rl_src_' + d.src))}</span>` : '';
  const when = d.created === 0 ? (d.time || rlT('rl_just_now')) : rlAgo(d.created);
  return `<article class="rl-card${d.urg ? ' rl-urg-' + d.urg : ''}${d.fresh ? ' is-fresh' : ''}" data-id="${d.id}"${quiet ? '' : ' tabindex="0"'} aria-label="${rlEsc(d.title)}">
    <div class="rl-card-title">${rlEsc(d.title)}</div>
    <div class="rl-card-meta">${rlEsc(d.company || d.email)}</div>
    <div class="rl-card-foot">${d.value != null ? `<span class="rl-card-val">${rlEsc(rlMoney(d.value))}</span>` : src}${d.urg ? `<span class="rl-badge rl-u${d.urg}">${rlEsc(rlT('rl_urg_' + d.urg))}</span>` : ''}${d.touched ? `<span class="rl-tag">${rlEsc(rlT('rl_updated_tag'))}</span>` : ''}<span class="rl-card-end">${rlAv(d.owner)}<span class="rl-card-time">${rlEsc(when)}</span></span></div>
  </article>`;
}
function rlColHtml(i, deals, quiet) {
  const sum = deals.reduce((a, d) => a + (d.value || 0), 0);
  return `<section class="rl-col rl-s${i}" data-stage="${i}" aria-label="${rlEsc(rlStageName(i))}">
    <header class="rl-col-head"><span class="rl-dot"></span><span class="rl-col-name">${rlEsc(rlStageName(i))}</span><span class="rl-col-n">${deals.length}</span><span class="rl-col-sum">${sum ? rlEsc(rlMoney(sum)) : ''}</span></header>
    <div class="rl-col-cards">${deals.map(d => rlCardHtml(d, quiet)).join('')}</div>
  </section>`;
}
function rlRenderInbox() {
  const host = document.getElementById('rl-inbox'); if (!host) return;
  host.innerHTML = rlColHtml(0, rlDeals.filter(d => d.stage === 0), true);
}
// The last two stages: the hero deal's own stage (while it is not won) beside Gewonnen, the foot, and the Engine card.
function rlRenderWon() {
  const host = document.getElementById('rl-won'); if (!host) return;
  const hero = rlHero();
  if (hero.stage < 4) rlLeftStage = hero.stage;
  host.innerHTML = rlColHtml(rlLeftStage, rlDeals.filter(d => d.stage === rlLeftStage), false) + rlColHtml(4, rlDeals.filter(d => d.stage === 4), false)
    + `<div class="rl-won-foot"><span class="rl-help">${rlEsc(rlT('rl_current_stage', { s: rlStageName(hero.stage) }))}</span><button type="button" class="rl-btn rl-btn-primary" id="rl-won-go"${hero.stage === 4 ? ' disabled' : ''}>${rlEsc(rlT('rl_move_to', { s: rlStageName(4) }))}</button></div>`
    + `<div class="rl-eng rl-surface" id="rl-engine"></div>`;
  rlRenderEngine();
}
// The one move. The hero deal into Gewonnen fires the Engine and strikes the fourth chore; out of it, the Engine forgets.
function rlMoveDeal(id, stage, quiet) {
  stage = rlClamp(stage, 0, RL_STAGES.length - 1);
  const d = rlDeals.find(x => x.id === id); if (!d || d.stage === stage) return;
  const prev = d.stage;
  rlDeals.forEach(x => { x.fresh = false; x.touched = false; });
  d.stage = stage; d.updated = 0; d.fresh = true;
  if (d.id === RL_HERO) { if (stage === 4) { rlEngineFire(); rlStrike(4); rlFill(4, RL_SCENE_MS[4]); } else rlEngineReset(); }
  rlRenderAll();
  if (quiet) return;
  rlToast(rlT('rl_moved_to', { s: rlStageName(stage) }), () => rlMoveDeal(id, prev, true));
}
function rlInitWon() {
  const host = document.getElementById('rl-won'); if (!host) return;
  let drag = null;
  host.addEventListener('pointerdown', e => {
    const card = e.target.closest('.rl-card');
    if (!card || e.target.closest('button') || e.button) return;
    drag = { id: +card.dataset.id, card, x: e.clientX, y: e.clientY, ghost: null, over: null, pid: e.pointerId, ox: 0, oy: 0 };
    RL.drag = true;
    card.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const r = drag.card.getBoundingClientRect();
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('rl-ghost'); drag.ghost.classList.remove('is-fresh'); drag.ghost.removeAttribute('tabindex');
      drag.ghost.style.setProperty('--rl-gw', r.width + 'px');
      drag.ox = r.left - drag.x; drag.oy = r.top - drag.y;
      document.body.appendChild(drag.ghost);
      drag.card.classList.add('is-dragging');
    }
    drag.ghost.style.setProperty('--rl-gx', (e.clientX + drag.ox) + 'px');
    drag.ghost.style.setProperty('--rl-gy', (e.clientY + drag.oy) + 'px');
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rl-col');
    const over = col && host.contains(col) ? col : null;
    if (over !== drag.over) { drag.over?.classList.remove('is-over'); drag.over = over; drag.over?.classList.add('is-over'); }
    e.preventDefault();
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const { id, ghost, over, card } = drag; drag = null; RL.drag = false;
    ghost?.remove(); card.classList.remove('is-dragging'); over?.classList.remove('is-over');
    if (ghost && over) rlMoveDeal(id, +over.dataset.stage);
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('keydown', e => {
    const card = e.target.closest('.rl-card'); if (!card) return;
    const d = rlDeals.find(x => x.id === +card.dataset.id); if (!d) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    rlMoveDeal(d.id, e.key === 'ArrowRight' ? 4 : rlLeftStage);
    host.querySelector(`.rl-card[data-id="${d.id}"]`)?.focus();
  });
  host.addEventListener('click', e => { if (e.target.closest('#rl-won-go')) rlMoveDeal(RL_HERO, 4); });
}

/* ── 08 · arrivals: what the webhook does ─────────────────────────────── */
// A new contact and a deal with the contact's bare name, in the first stage, no urgency, the default assignee.
// A known email updates the contact. Nobody is told, so nothing on the page says so.
function rlArrive(src) {
  const pool = RL_LEADS[src]; if (!pool) return;
  const [name, email, phone] = pool[rlLeadIx[src] % pool.length]; rlLeadIx[src]++;
  rlDeals.forEach(x => { x.fresh = false; x.touched = false; });
  const known = rlDeals.find(d => d.email === email);
  if (known) { known.touched = true; known.fresh = true; known.updated = 0; known.phone = phone; }
  else rlDeals.unshift({ id: rlNextId++, title: name, contact: name, company: '', email, phone, value: null, urg: 0, stage: 0, owner: 'AW', created: 0, updated: 0, src, time: rlNow(), fresh: true });
  rlRenderInbox(); rlRenderWon();
}
// A tap on a source: the mark flies into the first stage and the lead lands.
function rlInitSources() {
  const host = document.getElementById('rl-sources'); if (!host) return;
  host.addEventListener('click', e => { const b = e.target.closest('.rl-src'); if (b) rlFly(b.dataset.src, () => rlArrive(b.dataset.src)); });
}

/* ── 09 · the deal record ─────────────────────────────────────────────── */
function rlRenderRecord() {
  const host = document.getElementById('rl-record'); if (!host) return;
  const d = rlHero(); const acts = rlActs.filter(a => a.dealId === d.id);
  const stepper = RL_STAGES.map((_, i) => `<button type="button" class="rl-step rl-s${i}${i < d.stage ? ' is-done' : ''}${i === d.stage ? ' is-current' : ''}${i === 4 ? ' is-won' : ''}" data-stage="${i}" aria-pressed="${i === d.stage}" title="${rlEsc(i === d.stage ? rlT('rl_current_stage', { s: rlStageName(i) }) : rlT('rl_move_to', { s: rlStageName(i) }))}">${i < d.stage ? rlIcon('check') : ''}${rlEsc(rlStageName(i))}</button>`).join('');
  const to = rlEsc(rlT('rl_to_whom', { who: '' }).trim());
  const hint = rlRec.type === 'note' ? ''
    : rlRec.type === 'call' ? `<div class="rl-chint">${rlIcon('phone')}<span class="rl-grow"><b>${rlEsc(d.contact)}</b>, ${rlEsc(d.phone)}</span><span class="rl-btn rl-btn-sm">${rlEsc(rlT('rl_open_dialer'))}</span></div>`
    : rlRec.type === 'email' ? `<div class="rl-chint">${rlIcon('mail')}<span class="rl-grow">${to} <b>${rlEsc(d.contact)}</b>, ${rlEsc(d.email)}</span><span class="rl-btn rl-btn-sm">${rlEsc(rlT('rl_open_mail'))}</span></div>`
    : `<div class="rl-chint">${rlIcon('message')}<span class="rl-grow"><b>${rlEsc(d.contact)}</b>, ${rlEsc(d.phone)}</span><span class="rl-btn rl-btn-sm">${rlEsc(rlT('rl_open_whatsapp'))}</span></div><p class="rl-help rl-template">${rlEsc(rlT('rl_wa_template_lbl'))}: „Hi ${rlEsc(d.contact)}, “</p>`;
  const typeBtn = t => `<button type="button" class="rl-type${rlRec.type === t ? ' is-on' : ''}" data-type="${t}" aria-pressed="${rlRec.type === t}">${rlIcon(RL_TYPE_ICON[t])}${rlEsc(rlT('rl_act_' + t))}</button>`;
  const tl = acts.slice(0, 2).map(a => `<div class="rl-tl-item"><span class="rl-tl-ic rl-tl-${a.type}">${rlIcon(RL_TYPE_ICON[a.type])}</span><div class="rl-tl-main">
    <div class="rl-tl-head"><b>${rlEsc(rlT('rl_act_' + a.type))}</b><span class="rl-muted">${rlEsc(rlT('rl_by_name', { name: RL_PEOPLE[a.who] }))}</span><span class="rl-tl-time">${rlEsc(a.days === 0 ? a.time : rlAgo(a.days))}</span></div>
    <div class="rl-tl-text">${rlEsc(a.key ? rlT(a.key, a.vars) : a.text)}</div>${a.join ? `<span class="rl-btn rl-btn-sm rl-tl-join">${rlIcon('calendar')}${rlEsc(rlT('rl_join', { app: a.join }))}</span>` : ''}</div></div>`).join('');
  host.innerHTML = `<div class="rl-rec-head">
      <div class="rl-rec-title"><div class="rl-rec-name">${rlEsc(d.title)}</div>
        <div class="rl-rec-meta"><span class="rl-stage rl-s${d.stage}"><span class="rl-dot"></span>${rlEsc(rlStageName(d.stage))}</span>${d.urg ? `<span class="rl-badge rl-u${d.urg}">${rlEsc(rlT('rl_urg_' + d.urg))}</span>` : ''}<span>${rlEsc(rlT('rl_deal_value'))}: <b>${rlEsc(rlMoney(d.value))}</b></span><span class="rl-muted">${rlEsc(rlT('rl_created_ago', { when: rlAgo(d.created) }))}</span></div></div>
      <div class="rl-rec-actions">${['call', 'email', 'whatsapp'].map(t => `<button type="button" class="rl-btn" data-type="${t}">${rlIcon(RL_TYPE_ICON[t])}${rlEsc(rlT('rl_act_' + t))}</button>`).join('')}<a class="rl-btn rl-btn-primary" href="#termin">${rlIcon('calendar')}${rlEsc(rlT('rl_book_btn'))}</a></div>
    </div>
    <div class="rl-stepper" role="group" aria-label="${rlEsc(rlT('rl_deal_stage_aria'))}">${stepper}</div>
    <form class="rl-compose" id="rl-compose">
      <div class="rl-types" role="group" aria-label="${rlEsc(rlT('rl_types_aria'))}">${['note', 'call', 'email', 'whatsapp'].map(typeBtn).join('')}</div>
      <textarea class="rl-textarea" id="rl-compose-text" rows="2" maxlength="2000" placeholder="${rlEsc(rlT('rl_ph_' + rlRec.type))}" aria-label="${rlEsc(rlT('rl_compose_text_lbl', { type: rlT('rl_act_' + rlRec.type) }))}">${rlEsc(rlRec.text)}</textarea>
      ${hint}
      <div class="rl-compose-foot"><span class="rl-help">${rlEsc(rlT('rl_logged_as_on', { user: RL_PEOPLE.AW, contact: d.contact }))} ${rlEsc(rlT('rl_ctrl_enter'))}</span><button type="submit" class="rl-btn rl-btn-primary rl-btn-sm">${rlEsc(rlT('rl_verb_' + rlRec.type))}</button></div>
    </form>
    <div class="rl-tl">${tl}</div>`;
}
function rlLog(text) {
  const d = rlHero(); const t = text.trim(); if (!t) return;
  const act = { id: 'n' + rlNextId++, dealId: d.id, type: rlRec.type, who: 'AW', days: 0, time: rlNow(), text: t };
  rlActs.unshift(act); rlRec.text = '';
  rlRenderRecord();
  rlToast(rlT('rl_act_logged', { type: rlT('rl_act_' + act.type) }), () => { rlActs = rlActs.filter(a => a.id !== act.id); rlRenderRecord(); });
}
function rlInitRecord() {
  const host = document.getElementById('rl-record'); if (!host) return;
  host.addEventListener('click', e => {
    const step = e.target.closest('.rl-step'); if (step) { rlMoveDeal(RL_HERO, +step.dataset.stage); return; }
    const type = e.target.closest('[data-type]'); if (type) { rlRec.type = type.dataset.type; rlRenderRecord(); document.getElementById('rl-compose-text')?.focus(); }
  });
  host.addEventListener('submit', e => { if (e.target.id === 'rl-compose') { e.preventDefault(); rlLog(document.getElementById('rl-compose-text')?.value || ''); } });
  host.addEventListener('input', e => { if (e.target.id === 'rl-compose-text') rlRec.text = e.target.value; });
  host.addEventListener('keydown', e => { if (e.target.id === 'rl-compose-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); rlLog(e.target.value); } });
}

/* ── 10 · the booking and the week ────────────────────────────────────── */
function rlMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function rlFmt(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function rlAmPm(t) { const h = Math.floor(rlMin(t) / 60); return (h % 12 || 12) + (h < 12 ? ' am' : ' pm'); }
// The check the app does: the host's own entries on that day that overlap the slot.
function rlConflict(day, slot, len, events, host) {
  const s = rlMin(slot), e = s + len;
  return events.filter(ev => ev.day === day && ev.who === host && rlMin(ev.start) < e && rlMin(ev.start) + ev.len > s);
}
function rlRenderBook() {
  const host = document.getElementById('rl-book'); if (!host) return;
  const d = rlHero(); const B = rlBookState;
  const conflicts = B.slot ? rlConflict(B.day, B.slot, B.len, rlEvents, 'AW') : [];
  const seg = (name, opts, cur) => `<div class="rl-seg-row" role="group">${opts.map(([v, k]) => `<button type="button" class="rl-seg-btn${cur === v ? ' is-on' : ''}" data-${name}="${v}" aria-pressed="${cur === v}">${rlEsc(rlT(k))}</button>`).join('')}</div>`;
  const field = (k, inner) => `<div class="rl-field"><span class="rl-label">${rlEsc(rlT(k))}</span>${inner}</div>`;
  const slotLabel = s => rlT('rl_book_slot', { from: s, to: rlFmt(rlMin(s) + B.len), ampm: rlAmPm(s) });
  const days = `<div class="rl-days" role="group" aria-label="${rlEsc(rlT('rl_book_date'))}">${RL_DAYS.map((k, i) => `<button type="button" class="rl-day${B.day === i ? ' is-on' : ''}" data-day="${i}" aria-pressed="${B.day === i}"><b>${rlEsc(rlT(k))}</b><span>${RL_DATES[i]}</span></button>`).join('')}</div>`;
  const times = `<select class="rl-select" id="rl-book-time" aria-label="${rlEsc(rlT('rl_book_time'))}"><option value="">${rlEsc(rlT('rl_book_time_ph'))}</option>${RL_SLOTS.map(s => `<option value="${s}"${B.slot === s ? ' selected' : ''}>${rlEsc(slotLabel(s))}</option>`).join('')}</select>`;
  const conflict = conflicts.length ? `<div class="rl-conflict" role="alert">${conflicts.map(c => `<p>${rlEsc(rlT('rl_book_conflict', { time: c.start, title: rlT(c.key), who: RL_PEOPLE[c.who] }))}</p>`).join('')}<p>${rlEsc(rlT('rl_book_conflict_hint'))}</p></div>` : '';
  const summary = B.slot ? `<div class="rl-summary">${rlIcon('calendar')}<div><b>${rlEsc(rlT(RL_DAYS[B.day]))} ${RL_DATES[B.day]}, ${rlEsc(slotLabel(B.slot))}</b><span>${rlEsc(rlT('rl_where_' + B.where) + ', ' + rlT('rl_book_with', { name: d.contact }))}</span></div></div>` : '';
  host.innerHTML = `<div class="rl-sheet"><div class="rl-sheet-title">${rlEsc(rlT('rl_book_title', { name: d.contact }))}</div>
      ${field('rl_book_type', seg('len', [[30, 'rl_type_30'], [60, 'rl_type_60']], B.len))}
      ${field('rl_book_where', seg('where', [['meet', 'rl_where_meet'], ['phone', 'rl_where_phone']], B.where))}
      ${field('rl_book_date', days)}
      ${field('rl_book_time', times)}
      <p class="rl-help rl-zone">${rlEsc(rlT('rl_book_zone', { zone: 'Europe/Berlin', host: RL_PEOPLE.AW }))}</p>
      ${conflict}${summary}
      <div class="rl-sheet-foot"><span class="rl-help">${rlEsc(rlT('rl_book_invite_to', { email: d.email }))}</span><button type="button" class="rl-btn rl-btn-primary" id="rl-book-go"${B.slot ? '' : ' disabled'}>${rlEsc(rlT(conflicts.length ? 'rl_book_anyway' : 'rl_book_submit'))}</button></div>
    </div>
    <div class="rl-week" role="group" aria-label="${rlEsc(rlT('rl_week_aria'))}">${rlWeekHtml()}</div>`;
  host.querySelectorAll('.rl-ev').forEach(el => { el.style.setProperty('--rl-c', el.dataset.c); el.style.setProperty('--rl-r1', el.dataset.r); el.style.setProperty('--rl-rs', el.dataset.rs); });
}
function rlWeekHtml() {
  const H0 = 9, H1 = 17;
  const head = `<div class="rl-week-head"><span></span>${RL_DAYS.map((k, i) => `<span${i === 0 ? ' class="is-today"' : ''}>${rlEsc(rlT(k))} ${RL_DATES[i]}</span>`).join('')}</div>`;
  let lines = '';
  for (let h = H0; h < H1; h++) { lines += `<span class="rl-hr">${String(h).padStart(2, '0')}:00</span>`; for (let i = 0; i < 5; i++) lines += '<span class="rl-cell"></span>'; }
  const evs = rlEvents.map(ev => `<div class="rl-ev${ev.len === 30 ? ' rl-ev-30' : ''}${ev.booked ? ' is-new' : ''}" data-c="${ev.day + 2}" data-r="${Math.floor(rlMin(ev.start) / 60) - H0 + 1}" data-rs="${Math.ceil(ev.len / 60)}" title="${rlEsc(ev.start + ' ' + (ev.key ? rlT(ev.key) : ev.title))}">${rlEsc(ev.key ? rlT(ev.key) : ev.title)}<span class="rl-ev-who">${rlEsc(ev.start)} ${rlEsc(RL_PEOPLE[ev.who])}</span></div>`).join('');
  return head + `<div class="rl-week-body"><div class="rl-week-lines">${lines}</div><div class="rl-week-evs">${evs}</div></div>`;
}
function rlBook() {
  const B = rlBookState; if (!B.slot) return;
  const d = rlHero();
  const ev = { id: 'b' + rlNextId++, day: B.day, start: B.slot, len: B.len, who: 'AW', title: d.contact, booked: true };
  const act = { id: 'm' + rlNextId++, dealId: d.id, type: 'meeting', who: 'AW', days: 0, time: rlNow(), key: 'rl_x_booked', vars: { day: rlT(RL_DAYS[B.day]), date: RL_DATES[B.day], from: B.slot, to: rlFmt(rlMin(B.slot) + B.len), email: d.email }, join: B.where === 'meet' ? 'Google Meet' : null };
  rlEvents.push(ev); rlActs.unshift(act);
  const when = rlT(RL_DAYS[B.day]) + ' ' + B.slot;
  B.slot = null;
  rlRenderBook(); rlRenderRecord();
  rlToast(rlT('rl_book_done', { when }), () => rlCancelBooking(ev.id, act.id));
}
function rlCancelBooking(evId, actId) {
  rlEvents = rlEvents.filter(e => e.id !== evId); rlActs = rlActs.filter(a => a.id !== actId);
  rlRenderBook(); rlRenderRecord();
}
function rlInitBook() {
  const host = document.getElementById('rl-book'); if (!host) return;
  host.addEventListener('click', e => {
    const B = rlBookState;
    const len = e.target.closest('[data-len]'); if (len) { B.len = +len.dataset.len; rlRenderBook(); return; }
    const where = e.target.closest('[data-where]'); if (where) { B.where = where.dataset.where; rlRenderBook(); return; }
    const day = e.target.closest('[data-day]'); if (day) { B.day = +day.dataset.day; rlRenderBook(); return; }
    if (e.target.closest('#rl-book-go')) rlBook();
  });
  host.addEventListener('change', e => { if (e.target.id === 'rl-book-time') { rlBookState.slot = e.target.value || null; rlRenderBook(); } });
}

/* ── 11 · Gewonnen and the Engine ─────────────────────────────────────── */
// Into a trigger stage: one event, pending, delivered a moment later; the customer's first status follows.
function rlEngineFire() {
  if (rlEngine.fired) return;
  rlEngine = { fired: true, delivered: false, step: 0 };
  const done = () => { if (!rlEngine.fired) return; rlEngine.delivered = true; rlEngine.step = 1; rlRenderEngine(); };
  if (rlReduced()) done(); else rlEngineTimer = setTimeout(done, 1100);
}
function rlEngineReset() {
  if (!rlEngine.fired) return;
  clearTimeout(rlEngineTimer);
  rlEngine = { fired: false, delivered: false, step: 0 };
}
function rlRenderEngine() {
  const host = document.getElementById('rl-engine'); if (!host) return;
  const hero = rlHero();
  const deliveries = rlEngine.fired
    ? `<div class="rl-dl"><div class="rl-dl-main"><b>${rlEsc(rlT('rl_ev_name'))}</b><span class="rl-help">${rlEsc(hero.title)}</span></div><span class="rl-badge ${rlEngine.delivered ? 'rl-ok' : 'rl-wait'}">${rlEsc(rlT(rlEngine.delivered ? 'rl_status_success' : 'rl_status_pending'))}</span><span class="rl-help">1 ${rlEsc(rlT('rl_attempt_one'))}</span></div>`
    : `<p class="rl-help">${rlEsc(rlT('rl_no_deliveries'))}</p>`;
  const path = [0, 1, 2, 3, 4, 5, 6].map(s => `<span class="rl-path-step${rlEngine.step === s ? ' is-on' : ''}">${rlEsc(rlT('rl_onb_s' + s))}</span>`).join('');
  host.innerHTML = `<div class="rl-eng-head"><b>${rlEsc(rlT('rl_engine_title'))}</b><span class="rl-badge rl-ok">${rlEsc(rlT('rl_engine_active'))}</span></div>
    <div class="rl-eng-row"><span class="rl-label">${rlEsc(rlT('rl_engine_stages_label'))}</span><span class="rl-stage rl-s4"><span class="rl-dot"></span>${rlEsc(rlStageName(4))}</span></div>
    <div class="rl-eng-row rl-eng-col"><span class="rl-label">${rlEsc(rlT('rl_deliveries_title'))}</span>${deliveries}</div>
    <div class="rl-eng-row rl-eng-col"><span class="rl-label">${rlEsc(rlT('rl_onb_col_status'))}</span><div class="rl-path">${path}</div></div>`;
}

/* ── 12 · chrome, start ───────────────────────────────────────────────── */
function rlInitChrome() {
  document.querySelectorAll('.rl-lang-btn').forEach(b => b.addEventListener('click', () => rlSetLang(b.dataset.lang)));
}
function rlRenderAll() { rlRenderInbox(); rlRenderRecord(); rlRenderBook(); rlRenderWon(); }
function rlInit() {
  try { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'de') rlLang = l; } catch (e) { /* private mode */ }
  rlInitChrome(); rlInitSources(); rlInitWon(); rlInitRecord(); rlInitBook(); rlInitPager();
  rlApplyLang();
  rlGo(rlIndexOf(location.hash), true);
}
document.addEventListener('DOMContentLoaded', rlInit);
