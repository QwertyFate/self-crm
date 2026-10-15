// Public landing page two (/landingpagetwo): the board is the page.
//
// Part 28 (2026-10-15, from scratch): built to be compared with /landingpage, then one deleted.
// No sections, no scroll story. The product's own board fills the page: one card, five columns in the
// pipeline's order. The visitor drags the card (pointer, touch, the card's arrows or the keyboard) and
// the column it lands in widens and shows what the product does at that stage: the lead's arrival (Neu),
// the record (Kontaktiert), the meeting (Angebot), tasks and the team (Verhandlung), the Engine and the
// next deal (Gewonnen). Every move gets the app's own answer: a toast with Rückgängig.
// Nothing scrolls the story; nothing plays on a timer (the toast's own fade apart). Every string is a key
// in BD_I18N (de first, en second); the markup is the German text. The data is fictional.

const BD_I18N = {
  de: {
    bd_deals: "Deals",
    bd_login: "Anmelden",
    bd_request: "Zugang anfragen",
    bd_hero_title: "Eine Karte. Bis Gewonnen ziehen.",
    bd_hero_line: "Jede Spalte zeigt, was das Produkt in dieser Phase tut. Nichts scrollen, ziehen.",
    bd_st_new: "Neu",
    bd_d1: "Der Lead kommt an, bevor jemand ihn abtippt.",
    bd_src_fb: "Facebook Ads",
    bd_src_ig: "Instagram Ads",
    bd_src_tt: "TikTok Ads",
    bd_src_web: "Website-Formular",
    bd_via: "über",
    bd_lead_received: "Lead empfangen",
    bd_lead_result: "Kontakt angelegt · Deal in Neu · Anna Weber",
    bd_st_contacted: "Kontaktiert",
    bd_d2: "Anruf, E-Mail, WhatsApp: jede Berührung steht am Deal.",
    bd_act_note: "Notiz",
    bd_act_call: "Anruf",
    bd_act_email: "E-Mail",
    bd_act_whatsapp: "WhatsApp",
    bd_wa_hint: "Lena Hoffmann, +49 151 2345678 · Vorlage: „Hallo Lena, “",
    bd_e2_when: "Heute, 09:30 · Anna Weber",
    bd_e2: "Donnerstag 14 Uhr passt. Elbstraße?",
    bd_e1_when: "Gestern, 14:20 · Jonas Krüger",
    bd_e1: "Erstgespräch. Budget bis 450.000 €, Besichtigung gewünscht.",
    bd_ctrl_enter: "Strg+Enter speichert.",
    bd_st_offer: "Angebot",
    bd_d3: "Der Termin wird aus dem Deal gebucht.",
    bd_book_title: "Termin mit Lena Hoffmann",
    bd_book_type: "Terminart",
    bd_book_type_v: "Besichtigung (60 Min.)",
    bd_book_where: "Wo",
    bd_book_when: "Wann",
    bd_book_when_v: "Donnerstag, 14:00 bis 15:00",
    bd_book_check: "Teamkalender",
    bd_book_check_v: "geprüft, keine Überschneidung",
    bd_booked: "Gebucht",
    bd_booked_d: "Cal.com schickt die Einladung an l.hoffmann@hoffmann-partner.de.",
    bd_join: "Google Meet beitreten",
    bd_in_history: "im Verlauf des Deals",
    bd_st_nego: "Verhandlung",
    bd_d4: "Aufgaben, Kalender, Team-Chat: alle am selben Deal.",
    bd_t1: "Rückruf Lena Hoffmann",
    bd_t1_d: "Erledigt · heute, 11:30",
    bd_t2: "Notartermin vorbereiten",
    bd_t2_d: "Morgen fällig · Jonas Krüger",
    bd_t3: "Finanzierungsbestätigung einholen",
    bd_t3_d: "In 3 Tagen · Anna Weber",
    bd_chat_online: "online",
    bd_chat_msg: "@Anna Weber die Unterlagen liegen im Deal.",
    bd_st_won: "Gewonnen",
    bd_d5: "Gewonnen ist ein Zug. Dann übernimmt die Upgrads Engine.",
    bd_engine: "Upgrads Engine",
    bd_delivered: "Zugestellt",
    bd_s1: "Formular versendet",
    bd_s2: "Formular ausgefüllt",
    bd_s3: "Termin gebucht",
    bd_s4: "Call erfolgt",
    bd_s5: "Briefing fertig",
    bd_s6: "Abgeschlossen",
    bd_engine_rule: "Die Engine füllt nur leere Felder. Was das Team eingetragen hat, bleibt.",
    bd_next_t: "Der nächste Deal wartet.",
    bd_next_d: "Nur auf Einladung. Zugang anfragen.",
    bd_urg_high: "Hoch",
    bd_from_fb: "aus Facebook Ads",
    bd_board_foot: "Ziehen, antippen oder Pfeiltasten. Jeder Zug lässt sich zurücknehmen.",
    bd_close_title: "Nur auf Einladung.",
    bd_close_line: "Ein Code trägt die Rolle. Der erste Deal kann am selben Tag ankommen.",
    bd_crm: "CRM",
    bd_foot_note: "Alle Daten auf dieser Seite sind erfunden.",
    bd_undo: "Rückgängig",
    bd_lang: "Sprache",
    bd_board_aria: "Das Board: eine Karte, fünf Phasen",
    bd_stations_aria: "Die Stationen des Onboardings",
    bd_card_aria: "Elbstraße 12, Verkauf. Pfeiltasten verschieben die Karte.",
    bd_back: "Eine Phase zurück",
    bd_forward: "Eine Phase weiter",
    // ── rendered by the script ──
    bd_moved_to: "Verschoben nach {s}", bd_undone: "Zurückgenommen", bd_sum: "420.000 €", bd_sum_zero: "0 €"
  },
  en: {
    bd_deals: "Deals", bd_lang: "Language", bd_login: "Log in", bd_request: "Request access",
    bd_hero_title: "One card. Drag it to Won.", bd_hero_line: "Each column shows what the product does at that stage. Nothing to scroll, drag.",
    bd_board_aria: "The board: one card, five stages",
    bd_st_new: "New", bd_d1: "The lead arrives before anyone types it in.", bd_src_fb: "Facebook Ads", bd_src_ig: "Instagram Ads", bd_src_tt: "TikTok Ads", bd_src_web: "Website form", bd_via: "via",
    bd_lead_received: "Lead received", bd_lead_result: "Contact created · deal in New · Anna Weber",
    bd_st_contacted: "Contacted", bd_d2: "Call, email, WhatsApp: every touch is on the deal.", bd_act_note: "Note", bd_act_call: "Call", bd_act_email: "Email", bd_act_whatsapp: "WhatsApp",
    bd_wa_hint: "Lena Hoffmann, +49 151 2345678 · template: “Hallo Lena, ”", bd_e2_when: "Today, 09:30 · Anna Weber", bd_e2: "Thursday 2 pm works. Elbstraße?", bd_e1_when: "Yesterday, 14:20 · Jonas Krüger", bd_e1: "First call. Budget up to €450,000, viewing wanted.", bd_ctrl_enter: "Ctrl+Enter saves.",
    bd_st_offer: "Proposal", bd_d3: "The meeting is booked from the deal.", bd_book_title: "Meeting with Lena Hoffmann", bd_book_type: "Event type", bd_book_type_v: "Viewing (60 min)", bd_book_where: "Where", bd_book_when: "When", bd_book_when_v: "Thursday, 14:00 to 15:00", bd_book_check: "Team calendar", bd_book_check_v: "checked, no overlap",
    bd_booked: "Booked", bd_booked_d: "Cal.com sends the invitation to l.hoffmann@hoffmann-partner.de.", bd_join: "Join Google Meet", bd_in_history: "in the deal's history",
    bd_st_nego: "Negotiation", bd_d4: "Tasks, calendar, team chat: all on the same deal.", bd_t1: "Call back Lena Hoffmann", bd_t1_d: "Done · today, 11:30", bd_t2: "Prepare the notary appointment", bd_t2_d: "Due tomorrow · Jonas Krüger", bd_t3: "Get the financing confirmation", bd_t3_d: "In 3 days · Anna Weber",
    bd_chat_online: "online", bd_chat_msg: "@Anna Weber the documents are on the deal.",
    bd_st_won: "Won", bd_d5: "Won is one move. Then the Upgrads Engine takes over.", bd_engine: "Upgrads Engine", bd_delivered: "Delivered", bd_stations_aria: "The stations of the onboarding",
    bd_s1: "Form sent", bd_s2: "Form completed", bd_s3: "Appointment booked", bd_s4: "Call done", bd_s5: "Briefing ready", bd_s6: "Completed",
    bd_engine_rule: "The Engine fills empty fields only. What the team entered stays.", bd_next_t: "The next deal is waiting.", bd_next_d: "By invitation only. Request access.",
    bd_card_aria: "Elbstraße 12, Verkauf. Arrow keys move the card.", bd_urg_high: "High", bd_from_fb: "from Facebook Ads", bd_back: "One stage back", bd_forward: "One stage forward",
    bd_board_foot: "Drag, tap or use the arrow keys. Every move can be taken back.",
    bd_close_title: "By invitation only.", bd_close_line: "One code carries the role. The first deal can arrive the same day.", bd_crm: "CRM", bd_foot_note: "All data on this page is fictional.", bd_undo: "Undo",
    // ── rendered by the script ──
    bd_moved_to: "Moved to {s}", bd_undone: "Undone", bd_sum: "€420,000", bd_sum_zero: "€0"
  }
};

// ═══ language ═══════════════════════════════════════════════════════════════
let bdLang = 'de';
function bdT(key, vars) {
  const d = BD_I18N[bdLang] || BD_I18N.de;
  let s = d[key]; if (s === undefined) s = BD_I18N.de[key]; if (s === undefined) return key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
function bdApplyLang() {
  document.documentElement.lang = bdLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = bdT(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', bdT(el.dataset.i18nAria)); });
  document.querySelectorAll('.bd-lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === bdLang)));
  bdRender(false);
}
function bdSetLang(l) {
  if (!BD_I18N[l]) return;
  bdLang = l;
  try { localStorage.setItem('lang', l); } catch {}
  bdApplyLang();
}

// ═══ helpers ════════════════════════════════════════════════════════════════
function bdEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function bdClamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function bdStacked() { return !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches); }
function bdReduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
let bdToastTimer = 0, bdToastUndo = null;
function bdToast(text, undo) {
  const t = document.getElementById('bd-toast'), tx = document.getElementById('bd-toast-text'), u = document.getElementById('bd-toast-undo'); if (!t) return;
  tx.textContent = text; bdToastUndo = undo || null; u.classList.toggle('hidden', !undo); t.classList.remove('hidden');
  clearTimeout(bdToastTimer); bdToastTimer = setTimeout(() => t.classList.add('hidden'), 6000);
}

// ═══ the board: the pipeline's stages, in order; the card's stage ═══════════
const BD_STAGES = ['new', 'contacted', 'offer', 'nego', 'won'];
let bdStage = 0;
let bdPos = { x: 0, y: 0 };
function bdStageName(i) { return bdT('bd_st_' + BD_STAGES[i]); }
function bdCols() { return [...document.querySelectorAll('#bd-board .bd-col')]; }
// Where the card belongs: the active column's slot, measured against the board
function bdSlotPos(i) {
  const board = document.getElementById('bd-board'), slot = document.getElementById('bd-slot-' + i); if (!board || !slot) return { x: 0, y: 0 };
  const b = board.getBoundingClientRect(), s = slot.getBoundingClientRect();
  return { x: s.left - b.left, y: s.top - b.top };
}
function bdPlace(pos) { const card = document.getElementById('bd-card'); if (card) card.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`; bdPos = pos; }
// Dock the card in its slot: a flight when the move came from the hand, a jump otherwise
function bdDock(fly) {
  const card = document.getElementById('bd-card'); if (!card) return;
  const target = bdSlotPos(bdStage);
  if (fly && !bdReduced()) { card.classList.add('is-flying'); requestAnimationFrame(() => bdPlace(target)); card.addEventListener('transitionend', () => card.classList.remove('is-flying'), { once: true }); }
  else { card.classList.remove('is-flying'); bdPlace(target); }
}
function bdRender(fly) {
  bdCols().forEach((col, i) => {
    col.classList.toggle('is-done', i < bdStage); col.classList.toggle('is-active', i === bdStage); col.classList.toggle('is-next', i > bdStage);
    col.querySelector('.bd-count').textContent = i === bdStage ? '1' : '0';
    col.querySelector('.bd-col-sum').textContent = bdT(i === bdStage ? 'bd_sum' : 'bd_sum_zero');
  });
  document.querySelectorAll('.bd-step').forEach(b => { const d = Number(b.dataset.dir); b.disabled = bdStage + d < 0 || bdStage + d >= BD_STAGES.length; });
  bdDock(fly);
}
// A move: the app's own answer, a toast with Rückgängig
function bdMove(i, quiet) {
  i = bdClamp(i, 0, BD_STAGES.length - 1);
  if (i === bdStage) { bdDock(true); return; }
  const from = bdStage;
  bdStage = i; bdRender(true);
  if (quiet) return;
  bdToast(bdT('bd_moved_to', { s: bdStageName(i) }), () => { bdMove(from, true); bdToast(bdT('bd_undone')); });
}

// ═══ the hand: pointer drag (mouse and touch), the arrows, the keyboard ═════
function bdColAt(x, y) {
  const stacked = bdStacked();
  return bdCols().findIndex(col => { const r = col.getBoundingClientRect(); return stacked ? y >= r.top && y <= r.bottom : x >= r.left && x <= r.right; });
}
function bdInitHand() {
  const card = document.getElementById('bd-card'); if (!card) return;
  let drag = null;
  card.addEventListener('pointerdown', e => {
    if (e.target.closest('.bd-step') || e.button > 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { ...bdPos } };
    card.setPointerCapture(e.pointerId); card.classList.add('is-dragging'); card.classList.remove('is-flying');
    e.preventDefault();
  });
  card.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    bdPlace({ x: drag.from.x + e.clientX - drag.x, y: drag.from.y + e.clientY - drag.y });
    const over = bdColAt(e.clientX, e.clientY);
    bdCols().forEach((col, i) => col.classList.toggle('is-over', i === over && i !== bdStage));
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const over = bdColAt(e.clientX, e.clientY);
    drag = null; card.classList.remove('is-dragging');
    bdCols().forEach(col => col.classList.remove('is-over'));
    if (over >= 0 && over !== bdStage) bdMove(over); else bdDock(true);
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  card.addEventListener('keydown', e => {
    const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (next) { e.preventDefault(); bdMove(bdStage + next); }
    if (e.key === 'Home') { e.preventDefault(); bdMove(0); }
    if (e.key === 'End') { e.preventDefault(); bdMove(BD_STAGES.length - 1); }
  });
  document.querySelectorAll('.bd-step').forEach(b => b.addEventListener('click', () => { bdMove(bdStage + Number(b.dataset.dir)); card.focus(); }));
  const undo = document.getElementById('bd-toast-undo');
  if (undo) undo.addEventListener('click', () => { const fn = bdToastUndo; bdToastUndo = null; document.getElementById('bd-toast').classList.add('hidden'); if (fn) fn(); });
}

// ═══ start ══════════════════════════════════════════════════════════════════
function bdInit() {
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch {}
  if (saved && BD_I18N[saved]) bdLang = saved;
  document.querySelectorAll('.bd-lang-btn').forEach(b => b.addEventListener('click', () => bdSetLang(b.dataset.lang)));
  bdInitHand();
  bdApplyLang();
  window.addEventListener('resize', () => bdDock(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => bdDock(false));
}
document.addEventListener('DOMContentLoaded', bdInit);
