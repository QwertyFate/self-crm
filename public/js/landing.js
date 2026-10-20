// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE — public/js/landing.js  (Part 36, 2026-10-20; Part 37 retouch; Part 38: chosen as the
// landing page the same day, moved here from js/landing2.js)
//
// A short, friendly page that says plainly what Upgrads is: the hero sets one
// deal beside the three things that happened to it this week, each numbered,
// coloured and linked to its step below. The Monday wipe: the desk as it is
// and the same things in Upgrads, a line dragged to the right tidies up.
// Three moments to do by hand (a lead arrives, the calendar has a say, the
// card goes to Won and the Engine takes over), each answered twice: by the
// product in its own look, and by a hand-written note in the margin. German
// first with every string a key of MO_I18N, English one click away; the
// product's actions answer the way the app answers: a toast with Rückgängig.
// Nothing moves by itself except one nudge of the wipe when it is first seen.
//
//   01 the words      02 language       03 helpers, the toast
//   04 the hand       05 the wipe       06 leads
//   07 the meeting    08 won, the Engine 09 the way into the break
//   10 start
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

/* ── 01 · the words ───────────────────────────────────────────────────── */
const MO_I18N = {
  de: {
    mo_lang: 'Sprache', mo_crm: 'CRM', mo_login: 'Anmelden', mo_request: 'Zugang anfragen',
    mo_hero_t: 'Das CRM, das den Kleinkram übernimmt.',
    mo_hero_d: 'Leads kommen von selbst rein, Termine prüfen den Kalender, und nach dem Abschluss startet das Onboarding allein. Mehr Zeit fürs Verkaufen.',
    mo_hero_note: 'Deutsch und Englisch. Zugang per Einladung.',
    mo_hero_card: 'Diese Woche', mo_hero_l1: 'Lead aus Instagram, von allein im CRM', mo_hero_l2: 'Termin gebucht, Kalender geprüft', mo_hero_l3: 'Onboarding startet von allein',
    mo_wipe_t: 'Montag, 8:47 Uhr.', mo_wipe_d: 'Derselbe Montag zweimal: links mit Upgrads, rechts ohne.',
    mo_wipe_with: 'Mit Upgrads', mo_wipe_without: 'Ohne Upgrads',
    mo_wipe_aria: 'Derselbe Montag, ohne und mit Upgrads', mo_wipe_range: 'Vergleichen: ziehen oder Pfeiltasten', mo_wipe_value: '{n} Prozent aufgeräumt',
    mo_m1_t: 'Leads tippt hier niemand mehr ab.',
    mo_m1_d: 'Facebook, Instagram, TikTok oder die eigene Website: Über Make, Zapier oder n8n landet jeder Lead von selbst im CRM, auf Wunsch gleich als Deal.',
    mo_m2_t: 'Der Kalender hat ein Wörtchen mitzureden.',
    mo_m2_d: 'Termine entstehen direkt am Deal über Cal.com. Steht zur selben Zeit schon etwas im eigenen Kalender, meldet sich das CRM.',
    mo_m3_t: 'Nach der Unterschrift hat der Vertrieb Feierabend.',
    mo_m3_d: 'Landet ein Deal in Gewonnen, übernimmt die Upgrads Engine das Onboarding und meldet jeden Schritt an den Deal zurück.',
    mo_faq_t: 'Was oft gefragt wird.',
    mo_q1: 'Wie kommen die Leads rein?', mo_a1: 'Über Make, Zapier oder n8n. Einmal verbunden, kommen sie von allein, mit den Feldern, die das Formular liefert.',
    mo_q2: 'Passt das zu unserem Geschäft?', mo_a2: 'Phasen, Felder und sogar die Namen für Objekte und Lieferanten legt das Team selbst fest.',
    mo_close_t: 'Bereit für weniger Kleinkram?', mo_close_d: 'Der Zugang ist schnell eingerichtet.',
    mo_c1: 'Kurze Mail an team@upgrads.de', mo_c2: 'Code erhalten, mit Rolle: Mitglied, Admin oder Inhaber', mo_c3: 'Anmelden, und der erste Lead kann kommen',
    mo_foot_fiction: 'Alle Namen und Zahlen auf dieser Seite sind erfunden.',
    // the hand: what to try, and what it says once something was done
    mo_n_wipe_idle: 'nach rechts ziehen', mo_n_wipe_done: 'Schon besser.', mo_n_wipe_back: 'Zurück ins Chaos?',
    mo_n_leads_idle: 'eine Quelle antippen', mo_n_leads_one: 'Da ist er. Ohne Abtippen.', mo_n_leads_known: 'Gleiche E-Mail? Dann wird der Kontakt aktualisiert, nicht verdoppelt.',
    mo_n_cal_idle: 'Dienstag, 11 Uhr probieren', mo_n_cal_conflict: 'Ups. Da ist schon was.', mo_n_cal_free: 'Frei. So einfach.', mo_n_cal_booked: 'Gebucht. Die Einladung verschickt Cal.com.',
    mo_n_won_idle: 'Karte rüberziehen', mo_n_won_done: 'Ab hier läuft es ohne den Vertrieb.', mo_n_won_undo: 'Doch noch nicht? Auch gut.',
    mo_sources: 'Lead-Quellen', mo_inbox_aria: 'Erste Phase', mo_won_aria: 'Die letzten zwei Phasen', mo_week_aria: 'Kalender dieser Woche',
    mo_src_fb: 'Facebook Ads', mo_src_ig: 'Instagram Ads', mo_src_tt: 'TikTok Ads', mo_src_web: 'Website',
    mo_updated: 'aktualisiert', mo_just_now: 'gerade eben',
    mo_d0: 'Mo', mo_d1: 'Di', mo_d2: 'Mi', mo_d3: 'Do', mo_d4: 'Fr', mo_d_sat: 'Sa', mo_d_sun: 'So',
    // the product's own words (pinned to the app's dictionary by the suite)
    mo_undo: 'Rückgängig', mo_moved_to: 'Verschoben nach {s}', mo_move_to: 'Nach {s} verschieben', mo_current_stage: 'Aktuelle Phase: {s}',
    mo_st_new: 'Neu', mo_st_nego: 'Verhandlung', mo_st_won: 'Gewonnen',
    mo_urg_1: 'Niedrig', mo_urg_3: 'Hoch',
    mo_act_whatsapp: 'WhatsApp', mo_act_email: 'E-Mail', mo_act_meeting: 'Termin',
    mo_open_dialer: 'Anrufen', mo_open_whatsapp: 'WhatsApp öffnen',
    mo_book_title: 'Termin mit {name} buchen', mo_book_date: 'Datum', mo_book_time: 'Uhrzeit', mo_book_submit: 'Buchen', mo_book_anyway: 'Trotzdem buchen',
    mo_book_conflict: 'Konflikt: um {time} steht bereits {title} ({who}) im Kalender.', mo_book_conflict_hint: 'Cal.com kennt die Aufgaben und Einträge dieses CRM nicht. Trotzdem buchen oder eine andere Zeit wählen.',
    mo_book_done: 'Gebucht: {when}. Cal.com schickt die Einladung.',
    mo_engine_title: 'Upgrads Engine', mo_engine_active: 'Aktiv', mo_engine_stages_label: 'Auslöser-Phasen', mo_deliveries_title: 'Gesendete Ereignisse', mo_no_deliveries: 'Noch keine Ereignisse gesendet.',
    mo_status_pending: 'Ausstehend', mo_status_success: 'Zugestellt', mo_attempt_one: 'Versuch', mo_onb_col_status: 'Engine-Status',
    mo_onb_s0: 'Kein Onboarding', mo_onb_s1: 'Formular versendet', mo_onb_s2: 'Formular ausgefüllt', mo_onb_s3: 'Termin gebucht', mo_onb_s4: 'Call erfolgt', mo_onb_s5: 'Briefing fertig', mo_onb_s6: 'Abgeschlossen',
    // the invented Monday (names and numbers stay, the words switch)
    mo_x_mail_subj: 'Fwd: Fwd: Neuer Lead (Facebook)', mo_x_name: 'Name', mo_x_phone: 'Telefon', mo_x_empty: 'leer?', mo_x_sent: 'Gesendet',
    mo_x_file: 'Leads_Oktober_final2.xlsx', mo_x_source: 'Quelle', mo_x_state: 'Stand', mo_x_twice: 'doppelt?',
    mo_x_bubble: 'Kommt das Angebot heute noch?', mo_x_sticky: 'Lindner zurückrufen!! Nummer??',
    mo_x_tuesday: 'Dienstag', mo_x_todo1: 'Formular schicken', mo_x_todo2: 'Call ausmachen', mo_x_todo3: 'Briefing schreiben',
    mo_x_offer: 'Angebot gesendet, Laufzeit zwölf Monate.',
    mo_x_meet_when: 'Di, 14:00 bis 14:30', mo_x_invite: 'Einladung an marie.lindner@example.de', mo_x_meet_note: '11:00 war schon belegt.', mo_x_join: 'Google Meet beitreten',
    mo_x_e1: 'Rückruf Berger', mo_x_e2: 'Teammeeting', mo_x_e3: 'Besichtigung Krüger', mo_x_e4: 'Übergabe Hofmann',
    mo_ev_name: 'Vertrag unterschrieben',
    // the break: the falling-block game behind the footer's little block (/js/break-game.js asks for these brk_* words)
    brk_title: 'Kurze Pause', brk_close: 'Schließen', brk_field: 'Spielfeld', brk_hold: 'Gehalten', brk_next: 'Als Nächstes',
    brk_score: 'Punkte', brk_lines: 'Reihen', brk_level: 'Stufe', brk_record: 'Rekord',
    brk_pause: 'Pausieren', brk_resume: 'Weiter', brk_board: 'Bestenliste', brk_back: 'Zurück zum Spiel', brk_again: 'Nochmal',
    brk_over: 'Vorbei. {n} Punkte.', brk_place: 'Platz {n} auf der Bestenliste!', brk_name_label: 'Name für die Bestenliste', brk_name_default: 'Gast', brk_save: 'Eintragen',
    brk_board_empty: 'Noch keine Einträge. Platz eins ist frei.', brk_scope_browser: 'Gespeichert in diesem Browser.', brk_scope_team: 'Die Bestenliste des ganzen Teams.',
    brk_help: 'Pfeiltasten bewegen und drehen, Leertaste lässt fallen, C hält, P pausiert.',
    brk_pad: 'Steuerung', brk_key_left: 'Links', brk_key_right: 'Rechts', brk_key_rotate: 'Drehen', brk_key_down: 'Runter', brk_key_drop: 'Fallen lassen', brk_key_hold: 'Halten',
  },
  en: {
    mo_lang: 'Language', mo_crm: 'CRM', mo_login: 'Sign in', mo_request: 'Request access',
    mo_hero_t: 'The CRM that handles the small stuff.',
    mo_hero_d: 'Leads come in by themselves, meetings check the calendar, and won deals start their onboarding on their own. More time for selling.',
    mo_hero_note: 'German and English. Access by invitation.',
    mo_hero_card: 'This week', mo_hero_l1: 'Lead from Instagram, in the CRM by itself', mo_hero_l2: 'Meeting booked, calendar checked', mo_hero_l3: 'Onboarding starts by itself',
    mo_wipe_t: 'Monday, 8:47 a.m.', mo_wipe_d: 'The same Monday twice: left with Upgrads, right without.',
    mo_wipe_with: 'With Upgrads', mo_wipe_without: 'Without Upgrads',
    mo_wipe_aria: 'The same Monday, without and with Upgrads', mo_wipe_range: 'Compare: drag or use the arrow keys', mo_wipe_value: '{n} percent tidied',
    mo_m1_t: 'Nobody types leads in here anymore.',
    mo_m1_d: 'Facebook, Instagram, TikTok or your own website: via Make, Zapier or n8n, every lead lands in the CRM by itself, as a deal if you like.',
    mo_m2_t: 'The calendar gets a say.',
    mo_m2_d: 'Meetings are booked from the deal via Cal.com. If your calendar already has something then, the CRM speaks up.',
    mo_m3_t: 'After the signature, sales can call it a day.',
    mo_m3_d: 'When a deal lands in Won, the Upgrads Engine takes over the onboarding and reports each step back.',
    mo_faq_t: 'What people usually ask.',
    mo_q1: 'How do the leads get in?', mo_a1: 'Via Make, Zapier or n8n. Connect once and they arrive on their own, with whatever fields the form sends.',
    mo_q2: 'Will it fit our business?', mo_a2: 'Stages, fields and even what listings and suppliers are called are up to the team.',
    mo_close_t: 'Ready for less busywork?', mo_close_d: 'Getting access is quick.',
    mo_c1: 'A short email to team@upgrads.de', mo_c2: 'Get a code with a role: member, admin or owner', mo_c3: 'Sign in, and the first lead can arrive',
    mo_foot_fiction: 'Every name and number on this page is made up.',
    mo_n_wipe_idle: 'drag to the right', mo_n_wipe_done: 'Much better.', mo_n_wipe_back: 'Back to the chaos?',
    mo_n_leads_idle: 'tap a source', mo_n_leads_one: 'There it is. Nobody typed a thing.', mo_n_leads_known: 'Same email? The contact gets updated, not doubled.',
    mo_n_cal_idle: 'try Tuesday at 11', mo_n_cal_conflict: 'Oops. Something is already there.', mo_n_cal_free: 'That one\u2019s open.', mo_n_cal_booked: 'Booked. Cal.com sends the invite.',
    mo_n_won_idle: 'drag the card across', mo_n_won_done: 'From here on, it runs without sales.', mo_n_won_undo: 'Not yet after all? Fine.',
    mo_sources: 'Lead sources', mo_inbox_aria: 'First stage', mo_won_aria: 'The last two stages', mo_week_aria: 'This week’s calendar',
    mo_src_fb: 'Facebook Ads', mo_src_ig: 'Instagram Ads', mo_src_tt: 'TikTok Ads', mo_src_web: 'Website',
    mo_updated: 'updated', mo_just_now: 'just now',
    mo_d0: 'Mon', mo_d1: 'Tue', mo_d2: 'Wed', mo_d3: 'Thu', mo_d4: 'Fri', mo_d_sat: 'Sat', mo_d_sun: 'Sun',
    mo_undo: 'Undo', mo_moved_to: 'Moved to {s}', mo_move_to: 'Move to {s}', mo_current_stage: 'Current stage: {s}',
    mo_st_new: 'New', mo_st_nego: 'Negotiation', mo_st_won: 'Won',
    mo_urg_1: 'Low', mo_urg_3: 'High',
    mo_act_whatsapp: 'WhatsApp', mo_act_email: 'Email', mo_act_meeting: 'Meeting',
    mo_open_dialer: 'Open dialer', mo_open_whatsapp: 'Open WhatsApp',
    mo_book_title: 'Book a meeting with {name}', mo_book_date: 'Date', mo_book_time: 'Time', mo_book_submit: 'Book', mo_book_anyway: 'Book anyway',
    mo_book_conflict: 'Conflict: {time} {title} ({who}) is already on the calendar.', mo_book_conflict_hint: 'Cal.com does not see the tasks and entries of this CRM. Book anyway, or pick another time.',
    mo_book_done: 'Booked: {when}. Cal.com sends the invitation.',
    mo_engine_title: 'Upgrads Engine', mo_engine_active: 'Active', mo_engine_stages_label: 'Trigger stages', mo_deliveries_title: 'Sent events', mo_no_deliveries: 'No events sent yet.',
    mo_status_pending: 'Pending', mo_status_success: 'Delivered', mo_attempt_one: 'attempt', mo_onb_col_status: 'Engine status',
    mo_onb_s0: 'No onboarding', mo_onb_s1: 'Form sent', mo_onb_s2: 'Form completed', mo_onb_s3: 'Appointment booked', mo_onb_s4: 'Call done', mo_onb_s5: 'Briefing ready', mo_onb_s6: 'Completed',
    mo_x_mail_subj: 'Fwd: Fwd: New lead (Facebook)', mo_x_name: 'Name', mo_x_phone: 'Phone', mo_x_empty: 'empty?', mo_x_sent: 'Sent',
    mo_x_file: 'Leads_October_final2.xlsx', mo_x_source: 'Source', mo_x_state: 'Status', mo_x_twice: 'twice?',
    mo_x_bubble: 'Is the proposal coming today?', mo_x_sticky: 'Call Lindner back!! Number??',
    mo_x_tuesday: 'Tuesday', mo_x_todo1: 'Send the form', mo_x_todo2: 'Set up the call', mo_x_todo3: 'Write the briefing',
    mo_x_offer: 'Proposal sent, twelve-month term.',
    mo_x_meet_when: 'Tue, 14:00 to 14:30', mo_x_invite: 'Invitation to marie.lindner@example.de', mo_x_meet_note: '11:00 was already taken.', mo_x_join: 'Join Google Meet',
    mo_x_e1: 'Call-back Berger', mo_x_e2: 'Team meeting', mo_x_e3: 'Viewing Krüger', mo_x_e4: 'Hand-over Hofmann',
    mo_ev_name: 'Contract signed',
    brk_title: 'Quick break', brk_close: 'Close', brk_field: 'Playing field', brk_hold: 'Hold', brk_next: 'Next up',
    brk_score: 'Score', brk_lines: 'Lines', brk_level: 'Level', brk_record: 'High score',
    brk_pause: 'Pause', brk_resume: 'Resume', brk_board: 'High scores', brk_back: 'Back to the game', brk_again: 'Play again',
    brk_over: 'Game over. {n} points.', brk_place: 'Place {n} on the board!', brk_name_label: 'Name for the high scores', brk_name_default: 'Guest', brk_save: 'Save',
    brk_board_empty: 'No entries yet. First place is open.', brk_scope_browser: 'Kept in this browser.', brk_scope_team: 'The whole team\u2019s high scores.',
    brk_help: 'Arrow keys move and turn, space drops, C holds, P pauses.',
    brk_pad: 'Controls', brk_key_left: 'Left', brk_key_right: 'Right', brk_key_rotate: 'Turn', brk_key_down: 'Down', brk_key_drop: 'Drop', brk_key_hold: 'Hold piece',
  },
};

/* ── 02 · language ────────────────────────────────────────────────────── */
let moLang = 'de';
function moT(k, vars) {
  let s = (MO_I18N[moLang] && MO_I18N[moLang][k]) ?? MO_I18N.de[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(String(b));
  return s;
}
function moApplyLang() {
  document.documentElement.lang = moLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = moT(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', moT(el.dataset.i18nAria)));
  document.querySelectorAll('.mo-lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === moLang)));
  moRefreshNotes();
  moSetCut(MO_W.cut, false);
  moRenderAll();
}
function moSetLang(l) {
  if (l !== 'de' && l !== 'en') return;
  moLang = l;
  try { localStorage.setItem('lang', l); } catch (e) { /* private mode */ }
  moApplyLang();
}

/* ── 03 · helpers, the toast ──────────────────────────────────────────── */
function moEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function moClamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
// Money as the app's board shows it (public/js/deals.js: 9.8k €, 1.2M €).
function moMoney(v) {
  if (v == null) return '';
  if (v >= 1e6) return (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M €';
  if (v >= 1e3) return (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'k €';
  return v + ' €';
}
function moIcon(name, cls) { return `<svg class="mo-ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#mo-i-${name}"/></svg>`; }
function moReduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
// The app's toast: a line and a bare Rückgängig button, three at most, gone after 4.2 s.
function moToast(text, undo) {
  const host = document.getElementById('mo-toasts'); if (!host) return;
  while (host.children.length >= 3) host.firstChild.remove();
  const el = document.createElement('div'); el.className = 'mo-toast';
  el.innerHTML = `<span>${moEsc(text)}</span>${undo ? `<button type="button">${moEsc(moT('mo_undo'))}</button>` : ''}`;
  if (undo) el.querySelector('button').addEventListener('click', () => { el.remove(); undo(); });
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ── 04 · the hand: the notes in the margin ───────────────────────────── */
// Each note says what to try; once something was done, it answers. The arrow redraws only when the words change.
const MO_NOTES = { wipe: 'mo_n_wipe_idle', leads: 'mo_n_leads_idle', cal: 'mo_n_cal_idle', won: 'mo_n_won_idle' };
function moNote(name, key) {
  const changed = MO_NOTES[name] !== key;
  MO_NOTES[name] = key;
  const el = document.querySelector(`.mo-note[data-note="${name}"]`); if (!el) return;
  const text = el.querySelector('.mo-note-text'); if (text) text.textContent = moT(key);
  if (changed && !moReduced()) { el.classList.remove('is-fresh'); void el.offsetWidth; el.classList.add('is-fresh'); }
}
function moRefreshNotes() {
  for (const [name, key] of Object.entries(MO_NOTES)) {
    const text = document.querySelector(`.mo-note[data-note="${name}"] .mo-note-text`);
    if (text) text.textContent = moT(key);
  }
}

/* ── 05 · the wipe: the same Monday, twice ────────────────────────────── */
// cut: how much of the width shows Upgrads, in percent. A mouse moves the line at once; a finger only after a
// sideways move of 6 px, so a vertical swipe over the desk still scrolls the page.
const MO_W = { cut: 12, done: false, drag: null, touched: false, raf: 0 };
function moCutAt(x, left, width) { return width > 0 ? moClamp((x - left) / width * 100, 0, 100) : 0; }
function moSetCut(v, byHand) {
  const stage = document.getElementById('mo-wipe'), range = document.getElementById('mo-wipe-range'); if (!stage) return;
  MO_W.cut = moClamp(v, 0, 100);
  stage.style.setProperty('--mo-cut', MO_W.cut.toFixed(2) + '%');
  if (range) { range.value = String(Math.round(MO_W.cut)); range.setAttribute('aria-valuetext', moT('mo_wipe_value', { n: Math.round(MO_W.cut) })); }
  if (byHand) moWipeNote();
}
// Nearly tidy: "Schon besser." Back at the mess after that: "Zurück ins Chaos?"
function moWipeNote() {
  if (MO_W.cut >= 88) { MO_W.done = true; moNote('wipe', 'mo_n_wipe_done'); }
  else if (MO_W.done && MO_W.cut <= 8) { MO_W.done = false; moNote('wipe', 'mo_n_wipe_back'); }
}
function moStopNudge() { MO_W.touched = true; cancelAnimationFrame(MO_W.raf); }
// The page's one unasked movement: when the desk is first seen, the line leans 22 points to the right and back.
function moNudge() {
  if (MO_W.touched || moReduced()) return;
  const from = MO_W.cut, t0 = performance.now(), dur = 1400;
  const step = now => {
    if (MO_W.touched) return;
    const p = Math.min(1, (now - t0) / dur);
    moSetCut(from + 22 * Math.sin(Math.PI * p), false);
    if (p < 1) MO_W.raf = requestAnimationFrame(step);
  };
  MO_W.raf = requestAnimationFrame(step);
}
function moInitWipe() {
  const stage = document.getElementById('mo-wipe'), range = document.getElementById('mo-wipe-range'); if (!stage || !range) return;
  const at = e => { const r = stage.getBoundingClientRect(); return moCutAt(e.clientX, r.left, r.width); };
  const engage = e => { MO_W.drag.live = true; stage.setPointerCapture(e.pointerId); stage.classList.add('is-dragging'); moStopNudge(); moSetCut(at(e), true); };
  stage.addEventListener('pointerdown', e => {
    if (e.button) return;
    MO_W.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, live: false };
    if (e.pointerType === 'mouse') { e.preventDefault(); engage(e); }
  });
  stage.addEventListener('pointermove', e => {
    const d = MO_W.drag; if (!d || d.id !== e.pointerId) return;
    if (!d.live) { const dx = Math.abs(e.clientX - d.x), dy = Math.abs(e.clientY - d.y); if (dx > 6 && dx > dy) engage(e); return; }
    moSetCut(at(e), true);
  });
  const end = e => { if (!MO_W.drag || MO_W.drag.id !== e.pointerId) return; MO_W.drag = null; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  range.addEventListener('input', () => { moStopNudge(); moSetCut(+range.value, true); });
  moSetCut(MO_W.cut, false);
  if ('IntersectionObserver' in window && !moReduced()) {
    const io = new IntersectionObserver(entries => { if (entries.some(en => en.isIntersecting)) { io.disconnect(); moNudge(); } }, { threshold: .6 });
    io.observe(stage);
  }
}

/* ── 06 · leads: what the webhook does ────────────────────────────────── */
// The column starts with the weekend's leads. Each source sends a new person first, then someone already there:
// a known email updates the contact instead of making a second one. Nobody is notified, so nothing says so.
let moLeads = [
  { name: 'Tom Riedel', email: 'tom.riedel@example.de', src: 'tt', day: 'mo_d0', time: '07:55' },
  { name: 'Sophie Brandt', email: 'sophie.brandt@example.de', src: 'ig', day: 'mo_d_sun', time: '10:02' },
  { name: 'Jonas Weber', email: 'jonas.weber@example.de', src: 'fb', day: 'mo_d_sat', time: '23:14' },
];
const MO_LEAD_POOL = {
  fb: [['Eva Schulz', 'eva.schulz@example.de'], ['Jonas Weber', 'jonas.weber@example.de']],
  ig: [['Lea Fischer', 'lea.fischer@example.de'], ['Sophie Brandt', 'sophie.brandt@example.de']],
  tt: [['Noah Klein', 'noah.klein@example.de'], ['Tom Riedel', 'tom.riedel@example.de']],
  web: [['Clara Voss', 'clara.voss@example.de'], ['Eva Schulz', 'eva.schulz@example.de']],
};
let moLeadIx = { fb: 0, ig: 0, tt: 0, web: 0 };
function moLeadCard(l) {
  const mark = l.src === 'web' ? moIcon('globe', 'mo-logo-sm') : `<svg class="mo-logo mo-logo-sm" aria-hidden="true"><use href="#mo-l-${l.src}"/></svg>`;
  const when = l.day ? moT(l.day) + ' ' + l.time : moT('mo_just_now');
  return `<article class="mo-card${l.fresh ? ' is-fresh' : ''}">
    <div class="mo-card-title">${moEsc(l.name)}</div>
    <div class="mo-card-meta">${moEsc(l.email)}</div>
    <div class="mo-card-foot"><span class="mo-card-src">${mark}${moEsc(moT('mo_src_' + l.src))}</span>${l.touched ? `<span class="mo-tag">${moEsc(moT('mo_updated'))}</span>` : ''}<span class="mo-card-time">${moEsc(when)}</span></div>
  </article>`;
}
function moRenderInbox() {
  const host = document.getElementById('mo-inbox'); if (!host) return;
  host.innerHTML = `<section class="mo-col mo-s0" aria-label="${moEsc(moT('mo_st_new'))}">
    <header class="mo-col-head"><span class="mo-dot"></span><span class="mo-col-name">${moEsc(moT('mo_st_new'))}</span><span class="mo-col-n">${moLeads.length}</span></header>
    <div class="mo-col-cards">${moLeads.slice(0, 5).map(moLeadCard).join('')}</div>
  </section>`;
}
function moArrive(src) {
  const pool = MO_LEAD_POOL[src]; if (!pool) return;
  const [name, email] = pool[moLeadIx[src] % pool.length]; moLeadIx[src]++;
  moLeads.forEach(l => { l.fresh = false; l.touched = false; });
  const known = moLeads.find(l => l.email === email);
  if (known) { known.fresh = true; known.touched = true; moLeads = [known, ...moLeads.filter(l => l !== known)]; moNote('leads', 'mo_n_leads_known'); }
  else { moLeads.unshift({ name, email, src, day: null, time: null, fresh: true }); moNote('leads', 'mo_n_leads_one'); }
  moRenderInbox();
}
// The source's mark flies from its button into the first stage along a lifted arc, then the lead lands.
function moFly(src, land) {
  const from = document.querySelector(`#mo-sources .mo-src[data-src="${src}"] .mo-logo`), to = document.querySelector('#mo-inbox .mo-col-head'), host = document.getElementById('mo-fly');
  if (!from || !to || !host || moReduced() || typeof host.animate !== 'function') { land(); return; }
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2 - 18, y0 = a.top + a.height / 2 - 18, x1 = b.left + 24 - 18, y1 = b.top + b.height / 2 - 18;
  const el = document.createElement('span'); el.className = 'mo-packet';
  el.innerHTML = src === 'web' ? moIcon('globe', 'mo-logo') : `<svg class="mo-logo" aria-hidden="true"><use href="#mo-l-${src}"/></svg>`;
  el.style.setProperty('--mo-px', x0 + 'px'); el.style.setProperty('--mo-py', y0 + 'px');
  host.appendChild(el);
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 64;
  const anim = el.animate([
    { transform: `translate(${x0}px, ${y0}px)` },
    { transform: `translate(${mx}px, ${my}px)`, offset: .5 },
    { transform: `translate(${x1}px, ${y1}px)` },
  ], { duration: 600, easing: 'cubic-bezier(.3, .6, .2, 1)', fill: 'forwards' });
  anim.onfinish = () => { el.remove(); land(); };
}
function moInitSources() {
  const host = document.getElementById('mo-sources'); if (!host) return;
  host.addEventListener('click', e => { const b = e.target.closest('.mo-src'); if (b) moFly(b.dataset.src, () => moArrive(b.dataset.src)); });
}

/* ── 07 · the meeting: the calendar has a say ─────────────────────────── */
// The check the app does: the host's own entries on that day that overlap the slot. A colleague's entry is shown, not checked.
const MO_DAYS = ['mo_d0', 'mo_d1', 'mo_d2', 'mo_d3', 'mo_d4'];
const MO_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00'];
const MO_PEOPLE = { AW: 'Anna Weiß', JK: 'Jan Krause' };
let moEvents = [
  { id: 'e1', day: 0, start: '09:00', len: 30, who: 'AW', key: 'mo_x_e1' },
  { id: 'e2', day: 1, start: '11:00', len: 30, who: 'AW', key: 'mo_x_e2' },
  { id: 'e3', day: 1, start: '15:00', len: 60, who: 'AW', key: 'mo_x_e3' },
  { id: 'e4', day: 3, start: '10:00', len: 30, who: 'JK', key: 'mo_x_e4' },
];
let moBookState = { day: 1, slot: null };
let moNextId = 100;
function moMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function moConflict(day, slot, len, events, host) {
  const s = moMin(slot), e = s + len;
  return events.filter(ev => ev.day === day && ev.who === host && moMin(ev.start) < e && moMin(ev.start) + ev.len > s);
}
function moWeekHtml() {
  const H0 = 9, H1 = 17;
  const head = `<div class="mo-week-head"><span></span>${MO_DAYS.map(k => `<span>${moEsc(moT(k))}</span>`).join('')}</div>`;
  let lines = '';
  for (let h = H0; h < H1; h++) { lines += `<span class="mo-hr">${h}</span>`; for (let i = 0; i < 5; i++) lines += '<span class="mo-wcell"></span>'; }
  const evs = moEvents.map(ev => {
    const label = ev.key ? moT(ev.key) : ev.title;
    return `<div class="mo-ev${ev.len === 30 ? ' mo-ev-30' : ''}${ev.who !== 'AW' ? ' mo-ev-other' : ''}${ev.booked ? ' is-new' : ''}" data-c="${ev.day + 2}" data-r="${Math.floor(moMin(ev.start) / 60) - H0 + 1}" data-rs="${Math.ceil(ev.len / 60)}" title="${moEsc(ev.start + ' ' + label + ' (' + MO_PEOPLE[ev.who] + ')')}">${moEsc(label)}</div>`;
  }).join('');
  return head + `<div class="mo-week-body"><div class="mo-week-lines">${lines}</div><div class="mo-week-evs">${evs}</div></div>`;
}
function moRenderBook() {
  const host = document.getElementById('mo-book'); if (!host) return;
  const B = moBookState;
  const conflicts = B.slot ? moConflict(B.day, B.slot, 30, moEvents, 'AW') : [];
  const chip = (attr, v, label, on) => `<button type="button" class="mo-chip${on ? ' is-on' : ''}" data-${attr}="${v}" aria-pressed="${on}">${moEsc(label)}</button>`;
  const conflict = conflicts.length ? `<div class="mo-conflict" role="alert">${conflicts.map(c => `<p>${moEsc(moT('mo_book_conflict', { time: c.start, title: moT(c.key), who: MO_PEOPLE[c.who] }))}</p>`).join('')}<p>${moEsc(moT('mo_book_conflict_hint'))}</p></div>` : '';
  host.innerHTML = `<div class="mo-dlg mo-surface">
      <div class="mo-dlg-title">${moEsc(moT('mo_book_title', { name: 'Marie Lindner' }))}</div>
      <span class="mo-label">${moEsc(moT('mo_book_date'))}</span><div class="mo-chips" role="group" aria-label="${moEsc(moT('mo_book_date'))}">${MO_DAYS.map((k, i) => chip('day', i, moT(k), B.day === i)).join('')}</div>
      <span class="mo-label">${moEsc(moT('mo_book_time'))}</span><div class="mo-chips" role="group" aria-label="${moEsc(moT('mo_book_time'))}">${MO_SLOTS.map(s => chip('slot', s, s, B.slot === s)).join('')}</div>
      ${conflict}
      <div class="mo-dlg-foot"><button type="button" class="mo-btn mo-btn-primary" id="mo-book-go"${B.slot ? '' : ' disabled'}>${moEsc(moT(conflicts.length ? 'mo_book_anyway' : 'mo_book_submit'))}</button></div>
    </div>
    <div class="mo-week mo-surface" role="group" aria-label="${moEsc(moT('mo_week_aria'))}">${moWeekHtml()}</div>`;
  host.querySelectorAll('.mo-ev').forEach(el => { el.style.setProperty('--mo-c', el.dataset.c); el.style.setProperty('--mo-r1', el.dataset.r); el.style.setProperty('--mo-rs', el.dataset.rs); });
}
// After a pick: a clash gets "Ups"; the first free pick after a clash gets "Frei".
function moCalNote() {
  const B = moBookState; if (!B.slot) return;
  if (moConflict(B.day, B.slot, 30, moEvents, 'AW').length) moNote('cal', 'mo_n_cal_conflict');
  else if (MO_NOTES.cal === 'mo_n_cal_conflict') moNote('cal', 'mo_n_cal_free');
}
function moBook() {
  const B = moBookState; if (!B.slot) return;
  const ev = { id: 'b' + moNextId++, day: B.day, start: B.slot, len: 30, who: 'AW', title: 'Marie Lindner', booked: true };
  moEvents.push(ev);
  const when = moT(MO_DAYS[B.day]) + ' ' + B.slot;
  B.slot = null;
  moRenderBook(); moNote('cal', 'mo_n_cal_booked');
  moToast(moT('mo_book_done', { when }), () => { moEvents = moEvents.filter(e => e.id !== ev.id); moRenderBook(); moNote('cal', 'mo_n_cal_idle'); });
}
function moInitBook() {
  const host = document.getElementById('mo-book'); if (!host) return;
  host.addEventListener('click', e => {
    const B = moBookState;
    const day = e.target.closest('[data-day]'); if (day) { B.day = +day.dataset.day; moRenderBook(); moCalNote(); return; }
    const slot = e.target.closest('[data-slot]'); if (slot) { B.slot = slot.dataset.slot; moRenderBook(); moCalNote(); return; }
    if (e.target.closest('#mo-book-go')) moBook();
  });
}

/* ── 08 · won, the Engine ─────────────────────────────────────────────── */
// One card moves: Marie Lindner, from Verhandlung to Gewonnen (drag, arrow keys, or the button). Into Gewonnen
// the Engine gets one event: pending, delivered a moment later, the customer's first status follows. Back out, it forgets.
const MO_HERO = 1;
let moWonDeals = [
  { id: 1, title: 'Marie Lindner', meta: 'Lindner & Sohn', value: 9800, urg: 3, stage: 'nego' },
  { id: 7, title: 'Nadia Öztürk', meta: 'Öztürk Immobilien', value: 5600, urg: 1, stage: 'nego' },
  { id: 8, title: 'Peters & Co.', meta: 'Daniel Peters', value: 8900, urg: 0, stage: 'won' },
];
let moEngine = { fired: false, delivered: false, step: 0 };
let moEngineTimer = null;
const moStageKey = st => st === 'won' ? 'mo_st_won' : 'mo_st_nego';
function moDealCard(d) {
  const hero = d.id === MO_HERO;
  return `<article class="mo-card${hero ? ' is-hero' : ''}${d.fresh ? ' is-fresh' : ''}" data-id="${d.id}"${hero ? ' tabindex="0"' : ''} aria-label="${moEsc(d.title)}">
    <div class="mo-card-title">${moEsc(d.title)}</div>
    <div class="mo-card-meta">${moEsc(d.meta)}</div>
    <div class="mo-card-foot"><span class="mo-card-val">${moEsc(moMoney(d.value))}</span>${d.urg ? `<span class="mo-badge mo-u${d.urg}">${moEsc(moT('mo_urg_' + d.urg))}</span>` : ''}</div>
  </article>`;
}
function moColHtml(stage) {
  const deals = moWonDeals.filter(d => d.stage === stage), sum = deals.reduce((a, d) => a + d.value, 0);
  return `<section class="mo-col ${stage === 'won' ? 'mo-s4' : 'mo-s3'}" data-stage="${stage}" aria-label="${moEsc(moT(moStageKey(stage)))}">
    <header class="mo-col-head"><span class="mo-dot"></span><span class="mo-col-name">${moEsc(moT(moStageKey(stage)))}</span><span class="mo-col-n">${deals.length}</span><span class="mo-col-sum">${moEsc(moMoney(sum))}</span></header>
    <div class="mo-col-cards">${deals.map(moDealCard).join('')}</div>
  </section>`;
}
function moRenderWon() {
  const host = document.getElementById('mo-won'); if (!host) return;
  const hero = moWonDeals.find(d => d.id === MO_HERO);
  host.innerHTML = moColHtml('nego') + moColHtml('won')
    + `<div class="mo-won-foot"><span class="mo-help">${moEsc(moT('mo_current_stage', { s: moT(moStageKey(hero.stage)) }))}</span><button type="button" class="mo-btn mo-btn-primary" id="mo-won-go"${hero.stage === 'won' ? ' disabled' : ''}>${moEsc(moT('mo_move_to', { s: moT('mo_st_won') }))}</button></div>`
    + `<div class="mo-eng mo-surface" id="mo-engine"></div>`;
  moRenderEngine();
}
function moMoveHero(stage, quiet) {
  const d = moWonDeals.find(x => x.id === MO_HERO); if (!d || d.stage === stage) return;
  const prev = d.stage;
  moWonDeals.forEach(x => { x.fresh = false; });
  d.stage = stage; d.fresh = true;
  if (stage === 'won') { moEngineFire(); moNote('won', 'mo_n_won_done'); }
  else { moEngineReset(); moNote('won', quiet ? 'mo_n_won_undo' : 'mo_n_won_idle'); }
  moRenderWon();
  if (quiet) return;
  moToast(moT('mo_moved_to', { s: moT(moStageKey(stage)) }), () => moMoveHero(prev, true));
}
function moEngineFire() {
  if (moEngine.fired) return;
  moEngine = { fired: true, delivered: false, step: 0 };
  const done = () => { if (!moEngine.fired) return; moEngine.delivered = true; moEngine.step = 1; moRenderEngine(); };
  if (moReduced()) done(); else moEngineTimer = setTimeout(done, 1100);
}
function moEngineReset() {
  clearTimeout(moEngineTimer);
  moEngine = { fired: false, delivered: false, step: 0 };
}
function moRenderEngine() {
  const host = document.getElementById('mo-engine'); if (!host) return;
  const deliveries = moEngine.fired
    ? `<div class="mo-dl"><div class="mo-dl-main"><b>${moEsc(moT('mo_ev_name'))}</b><span class="mo-help">Marie Lindner</span></div><span class="mo-badge ${moEngine.delivered ? 'mo-ok' : 'mo-wait'}">${moEsc(moT(moEngine.delivered ? 'mo_status_success' : 'mo_status_pending'))}</span><span class="mo-help">1 ${moEsc(moT('mo_attempt_one'))}</span></div>`
    : `<p class="mo-help">${moEsc(moT('mo_no_deliveries'))}</p>`;
  const path = [0, 1, 2, 3, 4, 5, 6].map(s => `<span class="mo-path-step${moEngine.step === s ? ' is-on' : ''}">${moEsc(moT('mo_onb_s' + s))}</span>`).join('');
  host.innerHTML = `<div class="mo-eng-head"><b>${moEsc(moT('mo_engine_title'))}</b><span class="mo-badge mo-ok">${moEsc(moT('mo_engine_active'))}</span></div>
    <div class="mo-eng-row"><span class="mo-label">${moEsc(moT('mo_engine_stages_label'))}</span><span class="mo-stage mo-s4"><span class="mo-dot"></span>${moEsc(moT('mo_st_won'))}</span></div>
    <div class="mo-eng-row mo-eng-col"><span class="mo-label">${moEsc(moT('mo_deliveries_title'))}</span>${deliveries}</div>
    <div class="mo-eng-row mo-eng-col"><span class="mo-label">${moEsc(moT('mo_onb_col_status'))}</span><div class="mo-path">${path}</div></div>`;
}
function moInitWon() {
  const host = document.getElementById('mo-won'); if (!host) return;
  let drag = null;
  host.addEventListener('pointerdown', e => {
    const card = e.target.closest('.mo-card.is-hero'); if (!card || e.button) return;
    drag = { card, x: e.clientX, y: e.clientY, pid: e.pointerId, ghost: null, over: null, ox: 0, oy: 0 };
    card.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const r = drag.card.getBoundingClientRect();
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('mo-ghost'); drag.ghost.classList.remove('is-fresh'); drag.ghost.removeAttribute('tabindex');
      drag.ghost.style.setProperty('--mo-gw', r.width + 'px');
      drag.ox = r.left - drag.x; drag.oy = r.top - drag.y;
      document.body.appendChild(drag.ghost);
      drag.card.classList.add('is-dragging');
    }
    drag.ghost.style.setProperty('--mo-gx', (e.clientX + drag.ox) + 'px');
    drag.ghost.style.setProperty('--mo-gy', (e.clientY + drag.oy) + 'px');
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mo-col');
    const over = col && host.contains(col) ? col : null;
    if (over !== drag.over) { drag.over?.classList.remove('is-over'); drag.over = over; drag.over?.classList.add('is-over'); }
    e.preventDefault();
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const { ghost, over, card } = drag; drag = null;
    ghost?.remove(); card.classList.remove('is-dragging'); over?.classList.remove('is-over');
    if (ghost && over) moMoveHero(over.dataset.stage);
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('keydown', e => {
    if (!e.target.closest('.mo-card.is-hero') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    moMoveHero(e.key === 'ArrowRight' ? 'won' : 'nego');
    host.querySelector('.mo-card.is-hero')?.focus();
  });
  host.addEventListener('click', e => { if (e.target.closest('#mo-won-go')) moMoveHero('won'); });
}

/* ── 09 · the way into the break ─────────────────────────────────────── */
// The footer's little block opens the falling-block game from /js/break-game.js (shared with the app). This page gives
// it its words and a high score board kept in this browser; there is no sign-in here, so nobody's scores leave it.
function moInitGame() {
  const egg = document.getElementById('mo-egg'); if (!egg || typeof brkOpen !== 'function') return;
  egg.addEventListener('click', () => brkOpen({ t: moT, store: brkLocalStore('landing_break_board') }));
}

/* ── 10 · start ───────────────────────────────────────────────────────── */
function moInitChrome() {
  document.querySelectorAll('.mo-lang-btn').forEach(b => b.addEventListener('click', () => moSetLang(b.dataset.lang)));
}
function moRenderAll() { moRenderInbox(); moRenderBook(); moRenderWon(); }
function moInit() {
  try { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'de') moLang = l; } catch (e) { /* private mode */ }
  moInitChrome(); moInitWipe(); moInitSources(); moInitBook(); moInitWon(); moInitGame();
  moApplyLang();
}
document.addEventListener('DOMContentLoaded', moInit);
