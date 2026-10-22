'use strict';
// Landing page two at /landingpagetwo (LOGIN_LANDING_CHANGES Part 46, 2026-10-22): "Bei anderen CRMs ein Zusatz.
// Bei Upgrads eingebaut." The comparison is the page: a split first screen, grey for other CRM platforms, navy for
// Upgrads, four rows where the comparison of Part 45 found Upgrads ahead (enquiries, meeting notes, your own list, the
// hand-over after the win). A row opens its detail below: what the others need, with the source, against what Upgrads
// does, with its screen. Then what Upgrads leaves out on purpose, the everyday tools, questions, the request.
// No vendor is named; the others' side is hedged ("oft", "meist", "manche", "oder"). Sources: Part 45.
// The choice of row is pure (vsInitial, vsAct), so tests/client/landing-page-two.test.js runs it.
// Words: VS_I18N, German first; the vs_app_* words are the app's own TRANSLATIONS values (pinned by the suite).
// No t( calls here: the app's i18n sweep scans every file in public/js.

const VS_I18N = {
  de: {
    vs_crm: 'CRM',
    vs_nav: 'Seiten',
    vs_nav_detail: 'Der Vergleich',
    vs_nav_faq: 'Fragen',
    vs_lang: 'Sprache',
    vs_login: 'Anmelden',
    vs_request: 'Zugang anfragen',
    vs_h1: 'Bei anderen CRMs ein Zusatz, bei Upgrads eingebaut.',
    vs_o_k: 'Bei anderen CRMs',
    vs_o_big: 'ein Zusatz.',
    vs_u_k: 'Bei Upgrads',
    vs_u_big: 'eingebaut.',
    vs_rows: 'Vier Unterschiede',
    vs_t_leads: 'Anfragen',
    vs_t_notes: 'Gesprächsnotizen',
    vs_t_list: 'Eigene Liste',
    vs_t_handover: 'Nach dem Abschluss',
    vs_o_leads: 'Anbindung per Programmierung oder Profi-Paket',
    vs_o_notes: 'Notetaker im Bezahlpaket oder aus dem Marktplatz, oft nur auf Englisch',
    vs_o_list: 'Eigene Objekte oft erst im größten Paket',
    vs_o_handover: 'Onboarding als Zusatzmodul oder zweites Werkzeug',
    vs_u_leads: 'Eine Adresse pro Arbeitsbereich, mit Feldzuordnung und Protokoll',
    vs_u_notes: 'Notizen in der Sprache des Gesprächs, direkt im Deal',
    vs_u_list: 'Eine eigene Liste mit eigenen Feldern, mit Deals verknüpft',
    vs_u_handover: 'Übergabe an die Upgrads Engine, der Stand kommt zurück',
    vs_yes: 'eingebaut',
    vs_hint: 'Eine Zeile antippen für die Einzelheiten.',
    vs_intro: 'Upgrads ist das CRM für Vertriebsteams, in dem Anfragen, Termine, Gesprächsnotizen und das Onboarding nach dem Abschluss an einem Ort zusammenkommen.',
    vs_note: 'Zugang nur auf Einladung, auf Deutsch und Englisch.',
    vs_source: 'Andere CRMs: nach den Hilfe- und Preisseiten großer Anbieter, Stand Oktober 2026.',
    // the detail of each row
    vs_detail: '{topic} im Vergleich',
    vs_d_o: 'Übliche CRM-Plattformen',
    vs_d_u: 'Upgrads',
    vs_next: 'Nächster Unterschied',
    vs_leads_o1: 'Eine Adresse für eingehende Anfragen fehlt oft, dann braucht es die Programmierschnittstelle.',
    vs_leads_o2: 'Wo es sie gibt, steckt sie meist im Profi-Paket und nimmt nur Kontakte an, die es schon gibt.',
    vs_leads_u1: 'Jeder Arbeitsbereich hat eine eigene Adresse, beliefert von Make, Zapier, n8n oder dem eigenen Formular.',
    vs_leads_u2: 'Neue Anfragen werden Kontakte, auf Wunsch gleich mit Deal. Eine bekannte E-Mail aktualisiert den Kontakt.',
    vs_leads_u3: 'Das Protokoll zeigt, was ankam und welche Angaben fehlten.',
    vs_notes_o1: 'Der Notetaker steckt im Bezahlpaket oder kommt als App aus dem Marktplatz.',
    vs_notes_o2: 'Abschriften gibt es oft nur auf Englisch.',
    vs_notes_u1: 'Beim Buchen ein Haken, und der Notetaker kommt mit ins Google Meet.',
    vs_notes_u2: 'Er schreibt in der Sprache, in der gesprochen wurde.',
    vs_notes_u3: 'Die Notiz steht danach im Deal: Zusammenfassung, Entscheidungen, Aufgaben, offene Fragen.',
    vs_list_o1: 'Eigene Objekte gibt es oft erst im größten Paket.',
    vs_list_o2: 'Manche Anbieter haben gar keine, dann bleibt nur ein Feld mehr am Deal.',
    vs_list_u1: 'Eine eigene Liste mit eigenem Namen, etwa Immobilien oder Fahrzeuge.',
    vs_list_u2: 'Eigene Felder, verknüpft mit Deals und Kontakten.',
    vs_handover_o1: 'Nach dem Abschluss braucht es oft ein Zusatzmodul oder ein zweites Werkzeug.',
    vs_handover_o2: 'Der Stand des Onboardings steht dann meist woanders.',
    vs_handover_u1: 'Ein gewonnener Deal geht an die Upgrads Engine.',
    vs_handover_u2: 'Den Stand meldet die Engine zurück, vom versendeten Formular bis zum fertigen Briefing.',
    vs_handover_u3: 'Was das Team eingetragen hat, überschreibt sie nicht.',
    // the screens (data, as a team would type it)
    vs_d_list: 'Immobilien',
    vs_d_city: 'Ort',
    vs_d_rooms: 'Zimmer',
    vs_d_n_title: 'Erstgespräch Nordwerk',
    vs_d_n_sum: 'Zwei Standorte, Start im Januar.',
    vs_d_n_a1: 'Angebot schicken (Anna), bis Freitag',
    vs_n_head: 'Aufgaben',
    vs_by_nt: 'von Notetaker',
    // the app's own words (core.js TRANSLATIONS)
    vs_app_recent: 'Letzte Leads',
    vs_app_received: 'Lead empfangen',
    vs_app_rejected: 'Abgelehnt',
    vs_app_now: 'Gerade eben',
    vs_app_note: 'Notiz',
    vs_app_deals: 'Deals',
    vs_app_linked: 'Verknüpft',
    vs_app_onboarding: 'Onboarding',
    vs_app_customer: 'Kunde',
    vs_app_status: 'Engine-Status',
    vs_app_delivery: 'Webhook',
    vs_app_form_done: 'Formular ausgefüllt',
    vs_app_briefing: 'Briefing fertig',
    vs_app_delivered: 'Zugestellt',
    // what Upgrads leaves out
    vs_no_t: 'Was Upgrads bewusst weglässt.',
    vs_no1_t: 'Keine Mails aus dem CRM',
    vs_no1_d: 'Telefon, Mail und WhatsApp öffnen sich in den eigenen Apps. Einladungen zu Terminen kommen von Cal.com.',
    vs_no2_t: 'Kein Marktplatz voller Apps',
    vs_no2_d: 'Die vier Dinge oben sind eingebaut, nicht nachgerüstet.',
    vs_no3_t: 'Keine offene Anmeldung',
    vs_no3_d: 'Jeder Arbeitsbereich wird eingerichtet, die Rollen kommen per Einladungscode.',
    // the everyday tools
    vs_x_t: 'Und was jedes CRM können muss, kann Upgrads auch.',
    vs_x1: 'Board mit Wert pro Phase, und Rückgängig',
    vs_x2: 'Termine im Deal buchen, mit Warnung bei Überschneidung',
    vs_x3: 'Aufgaben mit Projekten, Unteraufgaben und Uhrzeit',
    vs_x4: 'Ein Kalender fürs Team, jede Person auf der eigenen Uhr',
    vs_x5: 'Analysen: Abschlussquote, gewonnener Wert, Funnel',
    vs_x6: 'Import aus CSV, Team-Chat, mehrere Arbeitsbereiche',
    // questions
    vs_q_t: 'Fragen zum Vergleich.',
    vs_q_d: 'Noch etwas offen? Das Team antwortet unter',
    vs_q1_q: 'Woher stammen die Angaben zu anderen CRMs?',
    vs_q1_a: 'Aus den Hilfe- und Preisseiten großer CRM-Anbieter, Stand Oktober 2026. Pakete ändern sich, ein Blick in den eigenen Tarif lohnt sich.',
    vs_q2_q: 'Warum stehen keine Namen dabei?',
    vs_q2_a: 'Weil es um die Sache geht: was ein Vertriebsteam braucht und wo es das bekommt. Die Angaben gelten für große Anbieter, nicht für jeden einzelnen.',
    vs_q3_q: 'Sind Notetaker und Engine Teil des CRM?',
    vs_q3_a: 'Beide laufen als eigene Dienste neben dem CRM und sind fest angebunden. Der Notetaker zeichnet Termine in Google Meet auf, die Upgrads Engine führt das Onboarding nach dem Abschluss.',
    vs_q4_q: 'Für wen ist Upgrads gemacht?',
    vs_q4_a: 'Für Vertriebsteams, deren Anfragen über Formulare kommen, die Termine per Video führen und nach dem Abschluss ein Onboarding übergeben.',
    vs_q5_q: 'Wie kommt ein Team zu Upgrads?',
    vs_q5_a: 'Nur auf Einladung. Nach einer Anfrage richtet das Upgrads-Team den Arbeitsbereich ein, Einladungscodes legen die Rollen fest.',
    // the way in
    vs_c_t: 'Selbst vergleichen, im eigenen Arbeitsbereich.',
    vs_c_d: 'Name und E-Mail genügen. Die Anfrage landet als Lead in unserem CRM, die Antwort kommt vom Team.',
    vs_c_d_mail: 'Name und E-Mail genügen. Die Anfrage geht per Mail an das Upgrads-Team.',
    vs_f_name: 'Name',
    vs_f_email: 'E-Mail',
    vs_f_company: 'Firma (optional)',
    vs_f_err: 'Bitte einen Namen und eine E-Mail-Adresse eintragen.',
    vs_f_send: 'Anfrage senden',
    vs_f_send_mail: 'Per Mail senden',
    vs_f_sending: 'Wird gesendet …',
    vs_f_privacy: 'Die Angaben dienen nur dieser Anfrage.',
    vs_mail_company: 'Firma',
    vs_mail_subject: 'Anfrage zu Upgrads CRM',
    vs_done_crm: 'Angekommen. Die Antwort kommt vom Upgrads-Team.',
    vs_done_mail: 'Das Mailprogramm ist offen, die Anfrage steht schon drin.',
    vs_privacy: 'Datenschutz',
    vs_imprint: 'Impressum',
    vs_legal: 'Rechtliches',
    vs_foot: 'Upgrads CRM für Vertriebsteams',
    vs_fiction: 'Namen und Zahlen in den Bildschirmen sind erfunden.',
  },
  en: {
    vs_crm: 'CRM',
    vs_nav: 'Pages',
    vs_nav_detail: 'The comparison',
    vs_nav_faq: 'Questions',
    vs_lang: 'Language',
    vs_login: 'Log in',
    vs_request: 'Request access',
    vs_h1: 'An add-on in other CRMs, built into Upgrads.',
    vs_o_k: 'In other CRMs',
    vs_o_big: 'an add-on.',
    vs_u_k: 'In Upgrads',
    vs_u_big: 'built in.',
    vs_rows: 'Four differences',
    vs_t_leads: 'Enquiries',
    vs_t_notes: 'Meeting notes',
    vs_t_list: 'Your own list',
    vs_t_handover: 'After the win',
    vs_o_leads: 'A connection by coding or a pro plan',
    vs_o_notes: 'A notetaker in a paid plan or from the marketplace, often English only',
    vs_o_list: 'Custom objects often only in the top plan',
    vs_o_handover: 'Onboarding as an add-on module or a second tool',
    vs_u_leads: 'One address per workspace, with field mapping and a log',
    vs_u_notes: 'Notes in the language of the call, right in the deal',
    vs_u_list: 'A list of your own with its own fields, linked to deals',
    vs_u_handover: 'Hand-over to the Upgrads Engine, the progress comes back',
    vs_yes: 'built in',
    vs_hint: 'Tap a row for the details.',
    vs_intro: 'Upgrads is the CRM for sales teams where enquiries, meetings, call notes and the onboarding after the win come together in one place.',
    vs_note: 'Access by invitation only, in German and English.',
    vs_source: 'Other CRMs: from the help and pricing pages of large vendors, as of October 2026.',
    vs_detail: '{topic}, compared',
    vs_d_o: 'Typical CRM platforms',
    vs_d_u: 'Upgrads',
    vs_next: 'Next difference',
    vs_leads_o1: 'An address for incoming enquiries is often missing, so it takes the programming interface.',
    vs_leads_o2: 'Where there is one, it usually sits in a pro plan and only accepts contacts that already exist.',
    vs_leads_u1: 'Every workspace has its own address, fed by Make, Zapier, n8n or your own form.',
    vs_leads_u2: 'New enquiries become contacts, and deals if wanted. A known email updates the contact.',
    vs_leads_u3: 'The log shows what came in and which details were missing.',
    vs_notes_o1: 'The notetaker sits in a paid plan or comes as an app from the marketplace.',
    vs_notes_o2: 'Transcripts are often English only.',
    vs_notes_u1: 'One tick when booking, and the Notetaker joins the Google Meet.',
    vs_notes_u2: 'It writes in the language that was spoken.',
    vs_notes_u3: 'Afterwards the note is in the deal: summary, decisions, action items, open questions.',
    vs_list_o1: 'Custom objects often come only with the top plan.',
    vs_list_o2: 'Some vendors have none at all, which leaves one more field on the deal.',
    vs_list_u1: 'A list of your own with its own name, like properties or vehicles.',
    vs_list_u2: 'Its own fields, linked to deals and contacts.',
    vs_handover_o1: 'After the win it often takes an add-on module or a second tool.',
    vs_handover_o2: 'The onboarding status then usually lives somewhere else.',
    vs_handover_u1: 'A won deal goes to the Upgrads Engine.',
    vs_handover_u2: 'The Engine reports the progress back, from the form sent to the finished briefing.',
    vs_handover_u3: 'It never overwrites what the team has entered.',
    vs_d_list: 'Properties',
    vs_d_city: 'City',
    vs_d_rooms: 'Rooms',
    vs_d_n_title: 'First call with Nordwerk',
    vs_d_n_sum: 'Two sites, starting in January.',
    vs_d_n_a1: 'Send the proposal (Anna), due Friday',
    vs_n_head: 'Action items',
    vs_by_nt: 'by Notetaker',
    vs_app_recent: 'Recent leads',
    vs_app_received: 'Lead received',
    vs_app_rejected: 'Rejected',
    vs_app_now: 'Just now',
    vs_app_note: 'Note',
    vs_app_deals: 'Deals',
    vs_app_linked: 'Linked',
    vs_app_onboarding: 'Onboarding',
    vs_app_customer: 'Customer',
    vs_app_status: 'Engine status',
    vs_app_delivery: 'Webhook',
    vs_app_form_done: 'Form completed',
    vs_app_briefing: 'Briefing ready',
    vs_app_delivered: 'Delivered',
    vs_no_t: 'What Upgrads leaves out on purpose.',
    vs_no1_t: 'No emails from the CRM',
    vs_no1_d: 'Phone, email and WhatsApp open in your own apps. Meeting invitations come from Cal.com.',
    vs_no2_t: 'No marketplace full of apps',
    vs_no2_d: 'The four things above are built in, not retrofitted.',
    vs_no3_t: 'No open sign-up',
    vs_no3_d: 'Every workspace is set up for the team; the roles come with invite codes.',
    vs_x_t: 'And what every CRM must do, Upgrads does too.',
    vs_x1: 'A board with value per stage, and undo',
    vs_x2: 'Book meetings in the deal, with a warning on clashes',
    vs_x3: 'Tasks with projects, subtasks and a due time',
    vs_x4: 'One calendar for the team, everyone on their own clock',
    vs_x5: 'Analytics: win rate, won value, funnel',
    vs_x6: 'CSV import, team chat, several workspaces',
    vs_q_t: 'Questions about the comparison.',
    vs_q_d: 'Anything else? The team answers at',
    vs_q1_q: 'Where do the details on other CRMs come from?',
    vs_q1_a: 'From the help and pricing pages of large CRM vendors, as of October 2026. Plans change, so it is worth checking your own.',
    vs_q2_q: 'Why are no names given?',
    vs_q2_a: 'Because it is about the job: what a sales team needs and where it gets it. The details hold for large vendors, not for every single one.',
    vs_q3_q: 'Are the Notetaker and the Engine part of the CRM?',
    vs_q3_a: 'Both run as separate services next to the CRM and are wired in for good. The Notetaker records Google Meet meetings; the Upgrads Engine runs the onboarding after the win.',
    vs_q4_q: 'Who is Upgrads made for?',
    vs_q4_a: 'Sales teams whose enquiries come in through forms, who hold meetings by video, and who hand over an onboarding after the win.',
    vs_q5_q: 'How does a team get Upgrads?',
    vs_q5_a: 'By invitation only. After a request, the Upgrads team sets up the workspace, and invite codes set the roles.',
    vs_c_t: 'Compare for yourself, in a workspace of your own.',
    vs_c_d: 'Your name and email are enough. The request lands as a lead in our CRM, and the team replies.',
    vs_c_d_mail: 'Your name and email are enough. The request goes to the Upgrads team by email.',
    vs_f_name: 'Name',
    vs_f_email: 'Email',
    vs_f_company: 'Company (optional)',
    vs_f_err: 'Please enter a name and an email address.',
    vs_f_send: 'Send request',
    vs_f_send_mail: 'Send by email',
    vs_f_sending: 'Sending…',
    vs_f_privacy: 'The details are used for this request only.',
    vs_mail_company: 'Company',
    vs_mail_subject: 'Request about Upgrads CRM',
    vs_done_crm: 'Received. The Upgrads team will reply.',
    vs_done_mail: 'Your mail app is open with the request filled in.',
    vs_privacy: 'Privacy',
    vs_imprint: 'Legal notice',
    vs_legal: 'Legal',
    vs_foot: 'Upgrads CRM for sales teams',
    vs_fiction: 'Names and numbers in the screens are made up.',
  },
};

// The four rows, in the order a deal lives (the comparison and its sources: LOGIN_LANDING_CHANGES Part 45).
const VS_TOPICS = ['leads', 'notes', 'list', 'handover'];

let vsLang = 'de';

// ── words ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function vsWord(k) { return (VS_I18N[vsLang] || VS_I18N.de)[k] ?? VS_I18N.de[k] ?? k; }
function vsFill(s, v) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)); }

// ── the comparison: which row is open ──────────────────────────────────────────────────────────────────────────────
function vsInitial() { return { topic: VS_TOPICS[0] }; }
function vsAct(s, a) {
  if (a.t === 'pick' && VS_TOPICS.includes(a.id)) return { topic: a.id };
  if (a.t === 'next') return { topic: VS_TOPICS[(VS_TOPICS.indexOf(s.topic) + 1) % VS_TOPICS.length] };
  return s;
}
function vsTitle(s) { return vsFill(vsWord('vs_detail'), { topic: vsWord('vs_t_' + s.topic) }); }

// ── the page ───────────────────────────────────────────────────────────────────────────────────────────────────────
let vsS = vsInitial();
let vsReady = false;     // the server can deliver a request into the team's CRM (GET /api/landing/status)
let vsAskState = 'form'; // form | busy | crm | mail

function vsRender() {
  document.querySelectorAll('[data-topic]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.topic === vsS.topic)));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== vsS.topic; });
  document.getElementById('vs-detail-t').textContent = vsTitle(vsS);
}
function vsDispatch(action) { vsS = vsAct(vsS, action); vsRender(); }

function vsSetLang(l, save) {
  vsLang = l === 'en' ? 'en' : 'de';
  document.documentElement.lang = vsLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = vsWord(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', vsWord(el.dataset.i18nAria)); });
  document.querySelectorAll('.vs-lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === vsLang)));
  document.querySelectorAll('[data-mail]').forEach(a => { a.href = `mailto:team@upgrads.de?subject=${encodeURIComponent(vsWord('vs_mail_subject'))}`; });
  if (save) { try { localStorage.setItem('lang', vsLang); } catch (e) { /* private mode */ } }
  vsRender();
  vsAskRender();
}

// ── the request at the end (routes/landing.js; a mail when the CRM cannot take it) ──
function vsAskRender() {
  const sent = vsAskState === 'crm' || vsAskState === 'mail';
  document.getElementById('vs-ask-form').hidden = sent;
  const done = document.getElementById('vs-ask-done');
  done.hidden = !sent;
  if (sent) done.textContent = vsWord(vsAskState === 'crm' ? 'vs_done_crm' : 'vs_done_mail');
  const lead = document.getElementById('vs-c-d');
  lead.dataset.i18n = vsReady ? 'vs_c_d' : 'vs_c_d_mail';
  lead.textContent = vsWord(lead.dataset.i18n);
  const send = document.getElementById('vs-ask-send');
  send.disabled = vsAskState === 'busy';
  send.textContent = vsWord(vsAskState === 'busy' ? 'vs_f_sending' : vsReady ? 'vs_f_send' : 'vs_f_send_mail');
}
function vsAskValues() {
  const f = document.getElementById('vs-ask-form');
  const one = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return { name: one(f.elements.name.value, 120), email: one(f.elements.email.value, 254), company: one(f.elements.company.value, 120) };
}
function vsAskOk(v) { return v.name.length >= 2 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v.email); }
function vsAskMailto(v) {
  const body = [`${vsWord('vs_f_name')}: ${v.name}`, `${vsWord('vs_f_email')}: ${v.email}`].concat(v.company ? [`${vsWord('vs_mail_company')}: ${v.company}`] : []).join('\n');
  return `mailto:team@upgrads.de?subject=${encodeURIComponent(vsWord('vs_mail_subject'))}&body=${encodeURIComponent(body)}`;
}
async function vsAsk(e) {
  e.preventDefault();
  if (vsAskState === 'busy') return;
  const v = vsAskValues(), err = document.getElementById('vs-ask-err');
  err.hidden = vsAskOk(v);
  if (!vsAskOk(v)) { document.getElementById(v.name.length >= 2 ? 'vs-ask-email' : 'vs-ask-name').focus(); return; }
  vsAskState = 'busy'; vsAskRender();
  let ok = false;
  if (vsReady) {
    try {
      const r = await fetch('/api/landing/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, lang: vsLang, website: document.getElementById('vs-website').value }) });
      ok = r.ok;
    } catch (err2) { ok = false; }
  }
  vsAskState = ok ? 'crm' : 'mail';
  if (!ok) window.location.href = vsAskMailto(v);
  vsAskRender();
  document.getElementById('vs-ask-done').focus();
}

async function vsInit() {
  let lang = 'de';
  try { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'de') lang = l; } catch (e) { /* private mode */ }
  vsSetLang(lang, false);
  document.querySelectorAll('.vs-lang-btn').forEach(b => b.addEventListener('click', () => vsSetLang(b.dataset.lang, true)));
  document.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => vsDispatch({ t: 'pick', id: b.dataset.topic })));
  document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => {
    vsDispatch({ t: 'next' });
    document.querySelector(`[data-panel="${vsS.topic}"] [data-next]`).focus();
  }));

  document.getElementById('vs-ask-form').addEventListener('submit', vsAsk);
  try {
    const r = await fetch('/api/landing/status');
    vsReady = r.ok && (await r.json()).ready === true;
  } catch (e) { vsReady = false; }
  vsAskRender();
}

document.addEventListener('DOMContentLoaded', vsInit);
