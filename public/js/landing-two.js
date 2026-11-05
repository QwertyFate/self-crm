/* ═══════════════════════════════════════════════════════════════════════════
   /landingpagetwo, "Nachtblau": one deal record, in focus. Standalone: no
   session, no app code, no app stylesheet.

   1. the words, German and English (every visible word and label is a key here;
      the HTML carries the German ones so the page reads without JavaScript)
   2. the record, filled by the scroll: one number per chapter (--c1 … --c4,
      0 to 1) on the stage, and one on each phone plate; the stylesheet turns
      them into what shows. One rAF loop eases the numbers toward the scroll
      position and stops as soon as they have arrived.
   3. the request: POST /api/landing/ask, with the honest states of page 1
      (public/js/landing.js): sent, sent by mail, failed (retry), maybe lost
      (no retry: it could arrive twice), no server (by mail); the values stay
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ltBooted = true;
  try { clearTimeout(window.ltSafe); } catch (e) { /* no timer */ }

  const WORDS = {
    de: {
      doc_title: 'Upgrads CRM: Von der Anfrage bis zur Übergabe',
      meta_desc: 'Upgrads CRM für B2B-Vertriebsteams: Anfrage, Termin und Notiz landen ohne Abtippen im Deal. Nur auf Einladung.',
      og_title: 'Upgrads CRM: Von der Anfrage bis zur Übergabe.',
      og_desc: 'Für B2B-Vertriebsteams: Anfrage, Termin und Notiz landen ohne Abtippen im Deal.',
      brand: 'Upgrads CRM',
      skip: 'Zum Inhalt springen',
      lang: 'EN',
      lang_aria: 'English',
      login: 'Anmelden',
      cta: 'Zugang anfragen',
      h1_a: 'Von der Anfrage',
      h1_b: 'bis zur Übergabe.',
      lede: 'Für B2B-Vertriebsteams: Anfrage, Termin und Notiz landen ohne Abtippen im Deal.',
      fact: 'Nur auf Einladung. Bei Upgrads täglich im Einsatz.',
      hero_alt: 'Bild eines Deals in Upgrads CRM, ganz ausgefüllt: Jonas Brandt von Lotrecht Messebau, Deal-Wert 8.900 €, Phase „Gewonnen“. In der Aktivität eine Notiz von Notetaker und ein über Cal.com gebuchter Termin, daneben der Kontakt mit E-Mail und Telefon; darunter der Onboarding-Fortschritt der Upgrads Engine bis „Abgeschlossen“.',
      steps_aria: 'Ein Deal, Schritt für Schritt',
      s1_h: 'Aus der Anfrage wird ein Deal.',
      s1_p: 'Per Webhook, etwa über Make, Zapier oder n8n. Bekannte E-Mail: Der Kontakt wird ergänzt, nie geleert.',
      s1_alt: 'Bildfolge: Ein Website-Formular schickt die Anfrage per Webhook, möglich auch über Make, Zapier oder n8n. Mit „Deal automatisch anlegen“ entsteht der Deal „Jonas Brandt“ in der ersten Phase „Neu“, der Kontakt bekommt Name, Unternehmen und E-Mail. Eine zweite Anfrage mit derselben E-Mail und leerem Firmenfeld ergänzt beim Kontakt die Telefonnummer; das Unternehmen bleibt stehen.',
      s2_h: 'Der Termin landet im Deal.',
      s2_p: 'Über Cal.com im CRM gebucht, gegen den eigenen Kalender geprüft.',
      s2_alt: 'Bildfolge: Im Buchungsdialog des CRM ist 10:00 Uhr gewählt, und das CRM meldet einen Konflikt mit einem Eintrag im eigenen Kalender. Gewählt wird 11:00 Uhr, gebucht über Cal.com mit Google Meet, und der Termin steht in der Aktivität des Deals.',
      s3_h: 'Notetaker schreibt mit.',
      s3_p: 'Google Meet im CRM gebucht, Häkchen gesetzt: Die fertige Notiz landet im Deal. Bis 120 Minuten.',
      s3_alt: 'Bildfolge: Beim Buchen ist „Mit Notetaker aufzeichnen“ angehakt. Notetaker nimmt das Google Meet auf; danach steht die fertige Notiz von Notetaker in der Aktivität des Deals, mit Messestand, Budget und der nächsten Aufgabe.',
      s4_h: 'Gewonnen. Dann die Übergabe.',
      s4_p: 'Optional übernimmt die Upgrads Engine das Onboarding, der Fortschritt steht im CRM.',
      s4_alt: 'Bildfolge: Der Deal-Wert steht bei 8.900 €, der Deal wandert Phase für Phase bis „Gewonnen“. „Gewonnen“ ist die Auslöser-Phase der optionalen Upgrads Engine; ihre Onboarding-Schritte vom versendeten Formular bis „Abgeschlossen“ werden nacheinander abgehakt.',
      b_h: 'Alles an einem Ort.',
      b_p: 'Kontakte, Deals, Aufgaben, Kalender, Team-Chat. Auf Deutsch und Englisch.',
      ask_t: 'Zugang anfragen.',
      ask_d: 'Name und E-Mail genügen. Der Preis wird pro Team vereinbart.',
      limits: 'Nur auf Einladung. Notetaker nur für Google Meet; ein kostenloses Google-Konto beendet ein Meet nach 60 Minuten. Microsoft Teams und Outlook-Kalender folgen.',
      ask_form: 'Zugang anfragen',
      f_name: 'Name',
      f_email: 'E-Mail',
      f_company: 'Firma (optional)',
      f_message: 'Nachricht (optional)',
      f_send_mail: 'Per Mail anfragen',
      f_sending: 'Wird gesendet …',
      f_send_again: 'Weitere Anfrage senden',
      f_direct: 'Oder direkt an',
      f_err_name: 'Bitte einen Namen eintragen, mindestens zwei Zeichen.',
      f_err_email: 'Bitte eine E-Mail-Adresse wie name@firma.de eintragen.',
      f_fallback: 'Öffnet sich kein Mailprogramm, den Text kopieren und an team@upgrads.de schicken.',
      f_fallback_fail: 'Per Mail geht es trotzdem: im Mailprogramm öffnen oder den Text kopieren und an team@upgrads.de schicken. „Nochmal senden“ versucht es noch einmal.',
      f_open_mail: 'Im Mailprogramm öffnen',
      f_retry: 'Nochmal senden',
      f_copy: 'Text kopieren',
      f_copied: 'Kopiert',
      f_edit: 'Angaben ändern',
      f_text: 'Text der Anfrage',
      done_crm: 'Angekommen. Die Antwort geht an {email}.',
      done_mail: 'Noch nicht gesendet: im Mailprogramm auf Senden klicken.',
      done_fail: 'Die Anfrage ist nicht angekommen. Gesendet wurde nichts.',
      done_unsure: 'Die Anfrage ist möglicherweise nicht angekommen. Zur Sicherheit auch per Mail senden.',
      mail_subject: 'Anfrage zu Upgrads CRM',
      mail_company: 'Firma',
      mail_message: 'Nachricht',
      mail_to: 'An',
      mail_subject_l: 'Betreff',
      foot_by: 'Upgrads GbR, Landshut',
      foot_nav: 'Rechtliches und Kontakt',
      imprint: 'Impressum',
      privacy: 'Datenschutz',
      // the record: the app's own labels (public/js/core.js), the sample deal's values
      v_title: 'Jonas Brandt',
      v_initials: 'JB',
      v_company: 'Lotrecht Messebau',
      v_value: 'Deal-Wert',
      v_amount: '8.900 €',
      st_1: 'Neu',
      st_2: 'Kontaktiert',
      st_3: 'Angebot',
      st_4: 'Verhandlung',
      st_5: 'Gewonnen',
      v_activity: 'Aktivität',
      v_meeting: 'Termin',
      v_meet_title: 'Erstgespräch',
      v_join: 'Google Meet beitreten',
      v_note: 'Notiz',
      v_by_nt: 'von Notetaker',
      v_n1: 'Messestand, 40 m², März',
      v_n2: 'Budget 9.000 €',
      v_n3: 'Angebot bis Freitag',
      v_contact: 'Kontakt',
      v_email: 'jb@lotrecht.example',
      v_phone: '+49 30 23125 417',
      v_onb: 'Onboarding',
      o_1: 'Formular versendet',
      o_2: 'Formular ausgefüllt',
      o_3: 'Termin gebucht',
      o_4: 'Call erfolgt',
      o_5: 'Briefing fertig',
      o_6: 'Abgeschlossen',
      // the sources beside the record
      v_form: 'Anfrage',
      v_form2: 'Zweite Anfrage',
      v_f_name: 'Name',
      v_f_company: 'Firma',
      v_f_email: 'E-Mail',
      v_f_msg: 'Nachricht',
      v_f_phone: 'Telefon',
      v_msg: 'Messestand im März',
      v_webhook: 'Webhook',
      v_make: 'Make',
      v_zapier: 'Zapier',
      v_n8n: 'n8n',
      v_autodeal: 'Deal automatisch anlegen',
      v_book: 'Termin buchen',
      v_gmeet: 'Google Meet',
      v_t1: '10:00',
      v_t2: '11:00',
      v_t3: '14:00',
      v_conflict: 'Konflikt: Teamrunde',
      v_summary: 'Do., 12. Nov., 11:00',
      v_go: 'Buchen',
      v_go_anyway: 'Trotzdem buchen',
      v_record: 'Mit Notetaker aufzeichnen',
      v_len: '47 Min.',
      v_engine: 'Upgrads Engine',
      v_optional: 'Optional',
    },
    en: {
      doc_title: 'Upgrads CRM: From the enquiry to the handover',
      meta_desc: 'Upgrads CRM for B2B sales teams: enquiry, meeting and note land in the deal, with no retyping. By invitation only.',
      og_title: 'Upgrads CRM: From the enquiry to the handover.',
      og_desc: 'For B2B sales teams: enquiry, meeting and note land in the deal, with no retyping.',
      brand: 'Upgrads CRM',
      skip: 'Skip to content',
      lang: 'DE',
      lang_aria: 'Deutsch',
      login: 'Sign in',
      cta: 'Request access',
      h1_a: 'From the enquiry',
      h1_b: 'to the handover.',
      lede: 'For B2B sales teams: enquiry, meeting and note land in the deal, with no retyping.',
      fact: 'By invitation only. In daily use at Upgrads.',
      hero_alt: 'Picture of a deal in Upgrads CRM, filled in completely: Jonas Brandt of Lotrecht Messebau, deal value 8.900 €, stage “Won”. In the activity a note by Notetaker and a meeting booked through Cal.com; beside them the contact with email and phone; below, the Upgrads Engine’s onboarding progress up to “Completed”.',
      steps_aria: 'A deal, step by step',
      s1_h: 'An enquiry becomes a deal.',
      s1_p: 'By webhook, for example through Make, Zapier or n8n. Known email: the contact is filled in, never emptied.',
      s1_alt: 'Sequence: a website form sends the enquiry by webhook; Make, Zapier or n8n can do the same. With “Auto-create a deal” the deal “Jonas Brandt” appears in the first stage, “New”, and the contact gets name, company and email. A second enquiry with the same email and an empty company field adds the phone number to the contact; the company stays.',
      s2_h: 'The meeting lands in the deal.',
      s2_p: 'Booked through Cal.com in the CRM, checked against its own calendar.',
      s2_alt: 'Sequence: 10:00 is picked in the CRM’s booking dialog, and the CRM reports a conflict with an entry in its own calendar. 11:00 is picked instead, booked through Cal.com with Google Meet, and the meeting appears in the deal’s activity.',
      s3_h: 'Notetaker takes notes.',
      s3_p: 'A Google Meet booked in the CRM, box ticked: the finished note lands in the deal. Up to 120 minutes.',
      s3_alt: 'Sequence: “Record with Notetaker” is ticked when booking. Notetaker records the Google Meet; afterwards the finished note by Notetaker is in the deal’s activity, with the trade fair stand, the budget and the next task.',
      s4_h: 'Won. Then the handover.',
      s4_p: 'Optionally, the Upgrads Engine takes over the onboarding; the progress shows in the CRM.',
      s4_alt: 'Sequence: the deal value is set to 8.900 €, and the deal moves stage by stage to “Won”. “Won” is the trigger stage of the optional Upgrads Engine; its onboarding steps, from the form sent to “Completed”, are ticked off one after another.',
      b_h: 'Everything in one place.',
      b_p: 'Contacts, deals, tasks, calendar, team chat. In German and English.',
      ask_t: 'Request access.',
      ask_d: 'A name and an email are enough. The price is agreed per team.',
      limits: 'By invitation only. Notetaker works with Google Meet only; a free Google account ends a Meet after 60 minutes. Microsoft Teams and Outlook calendar are coming.',
      ask_form: 'Request access',
      f_name: 'Name',
      f_email: 'Email',
      f_company: 'Company (optional)',
      f_message: 'Message (optional)',
      f_send_mail: 'Request by email',
      f_sending: 'Sending …',
      f_send_again: 'Send another request',
      f_direct: 'Or write directly to',
      f_err_name: 'Please enter a name, at least two characters.',
      f_err_email: 'Please enter an email address like name@company.com.',
      f_fallback: 'If no mail app opens, copy the text and send it to team@upgrads.de.',
      f_fallback_fail: 'It still works by email: open it in the mail app, or copy the text and send it to team@upgrads.de. “Send again” tries once more.',
      f_open_mail: 'Open in the mail app',
      f_retry: 'Send again',
      f_copy: 'Copy the text',
      f_copied: 'Copied',
      f_edit: 'Change the details',
      f_text: 'Text of the request',
      done_crm: 'Received. The reply goes to {email}.',
      done_mail: 'Not sent yet: click Send in the mail app.',
      done_fail: 'The request did not arrive. Nothing was sent.',
      done_unsure: 'The request may not have arrived. To be safe, send it by email too.',
      mail_subject: 'Request about Upgrads CRM',
      mail_company: 'Company',
      mail_message: 'Message',
      mail_to: 'To',
      mail_subject_l: 'Subject',
      foot_by: 'Upgrads GbR, Landshut',
      foot_nav: 'Legal and contact',
      imprint: 'Legal notice',
      privacy: 'Privacy',
      v_title: 'Jonas Brandt',
      v_initials: 'JB',
      v_company: 'Lotrecht Messebau',
      v_value: 'Deal value',
      v_amount: '8.900 €',
      st_1: 'New',
      st_2: 'Contacted',
      st_3: 'Proposal',
      st_4: 'Negotiation',
      st_5: 'Won',
      v_activity: 'Activity',
      v_meeting: 'Meeting',
      v_meet_title: 'Intro call',
      v_join: 'Join Google Meet',
      v_note: 'Note',
      v_by_nt: 'by Notetaker',
      v_n1: 'Trade fair stand, 40 m², March',
      v_n2: 'Budget €9,000',
      v_n3: 'Proposal by Friday',
      v_contact: 'Contact',
      v_email: 'jb@lotrecht.example',
      v_phone: '+49 30 23125 417',
      v_onb: 'Onboarding',
      o_1: 'Form sent',
      o_2: 'Form completed',
      o_3: 'Appointment booked',
      o_4: 'Call done',
      o_5: 'Briefing ready',
      o_6: 'Completed',
      v_form: 'Enquiry',
      v_form2: 'Second enquiry',
      v_f_name: 'Name',
      v_f_company: 'Company',
      v_f_email: 'Email',
      v_f_msg: 'Message',
      v_f_phone: 'Phone',
      v_msg: 'Trade fair stand in March',
      v_webhook: 'Webhook',
      v_make: 'Make',
      v_zapier: 'Zapier',
      v_n8n: 'n8n',
      v_autodeal: 'Auto-create a deal',
      v_book: 'Book meeting',
      v_gmeet: 'Google Meet',
      v_t1: '10:00',
      v_t2: '11:00',
      v_t3: '14:00',
      v_conflict: 'Conflict: team meeting',
      v_summary: 'Thu 12 Nov, 11:00',
      v_go: 'Book',
      v_go_anyway: 'Book anyway',
      v_record: 'Record with Notetaker',
      v_len: '47 min',
      v_engine: 'Upgrads Engine',
      v_optional: 'Optional',
    },
  };

  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  let lang = 'de';
  function word(key) {
    const d = WORDS[lang];
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return Object.prototype.hasOwnProperty.call(WORDS.de, key) ? WORDS.de[key] : '';
  }

  /* ── 2. the record, filled by the scroll ── */
  const canvas = document.querySelector('.lt-canvas');
  const stage = document.querySelector('.lt-stage');
  const grid = document.querySelector('.lt-story-grid');
  const plane = document.querySelector('.lt-plane');
  const steps = Array.from(document.querySelectorAll('.lt-step'));
  // what each phone plate shows of the record: the part its chapter fills
  const PARTS = { 1: ['head', 'contact'], 2: ['tl'], 3: ['tl'], 4: ['head', 'bar', 'onb'] };
  // the plate's own connector draws in the window its stage connector does (landingpagetwo.html, .lt-wires)
  const LINE = { 1: [0.12, 0.28], 2: [0.5, 0.64], 3: [0.52, 0.6], 4: [0.42, 0.52] };
  const EASE = 0.14;   // the share of the remaining way covered per 60 Hz frame (the same speed at 120 Hz)
  const EPS = 0.0005;  // closer than this is there
  const clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const moving = () => root.classList.contains('lt-motion');
  const wide = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1180px)') : null;
  const plates = [];
  let chans = [];      // { el, name, get, cur, tgt, out }: one custom property eased toward its target
  let raf = 0, last = 0, vh = 800, sticky = false, onStep = -1;

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    return el;
  }
  function plateLine(k, dir) {
    const v = dir === 'v';
    const svg = svgEl('svg', { class: 'lt-pl lt-pl-' + dir, viewBox: v ? '0 0 2 3' : '0 0 3 2', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(svgEl('path', { d: v ? 'M1 0V3' : 'M0 1H3', class: 'lt-x k' + k + ' fx-d', style: '--a:' + LINE[k][0] + ';--b:' + LINE[k][1] + ';--len:3.05px' }));
    return svg;
  }
  // a phone plate per chapter: that chapter's source, a connector, and the part of the record it fills
  // (copies of the stage's own parts, so both always show the same thing); chapters before it are done
  function buildPlates() {
    if (!canvas) return;
    for (const li of steps) {
      const k = Number(li.dataset.k), src = canvas.querySelector('.lt-src.f' + k);
      if (!src || !PARTS[k]) continue;
      const plate = document.createElement('div');
      plate.className = 'lt-plate';
      plate.dataset.k = String(k);
      plate.setAttribute('aria-hidden', 'true');
      for (let j = 1; j <= 4; j++) plate.style.setProperty('--c' + j, j <= k ? '1' : '0');
      const s = document.createElement('div');
      s.className = 'lt-plate-src';
      s.appendChild(src.cloneNode(true));
      const rec = document.createElement('div');
      rec.className = 'lt-plate-rec';
      for (const part of PARTS[k]) {
        const el = canvas.querySelector('[data-part="' + part + '"]');
        if (el) rec.appendChild(el.cloneNode(true));
      }
      plate.append(s, plateLine(k, 'v'), plateLine(k, 'h'), rec);
      li.appendChild(plate);
      plates.push({ el: plate, k });
    }
    if (plates.length) root.classList.add('lt-plated');
  }

  function chan(el, name, get) { return { el, name, get, cur: 0, tgt: 0, out: '' }; }
  function write(c) {
    const v = c.cur.toFixed(4);
    if (v !== c.out) { c.out = v; c.el.style.setProperty(c.name, v); }
    // the hero plane, once straight, drops its transform altogether: crisp text, no layer
    if (c.el === plane) plane.classList.toggle('is-flat', c.cur >= 1);
  }

  // the connectors: each hairline is drawn from its source row to the record row it fills, measured from the
  // layout (offsets ignore the panels' transforms), in the canvas's em, which is the wires' user unit
  const WIRES = [
    { k: 1, src: '.f1 .lt-node-card', row: null, to: '.lt-r-title', into: '.lt-canvas > .lt-rec' },
    { k: 2, src: '.f2 .lt-book', row: '.lt-bf', to: '.lt-it-m .lt-ic', into: '.lt-canvas > .lt-rec' },
    { k: 3, src: '.f3 .lt-nt', row: '.lt-wave', to: '.lt-it-n .lt-ic', into: '.lt-canvas > .lt-rec' },
    { k: 4, src: '.f4 .lt-eng', row: '.lt-echip', to: '.lt-node', into: '.lt-canvas > .lt-onb' },
  ];
  function boxIn(el) {   // el's border box in the canvas, px
    let x = 0, y = 0, n = el;
    while (n && n !== canvas) {
      x += n.offsetLeft; y += n.offsetTop;
      n = n.offsetParent;
      if (n && n !== canvas) { x += n.clientLeft; y += n.clientTop; }
    }
    return n === canvas ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
  }
  const f3 = v => Number(v.toFixed(3));
  function wire() {
    if (!canvas || !canvas.offsetWidth) return;   // hidden (the plates show instead): nothing to measure
    const em = parseFloat(window.getComputedStyle(canvas).fontSize) || 12;
    for (const w of WIRES) {
      const g = canvas.querySelector('.lt-wires .lt-pan-o.f' + w.k);
      const card = canvas.querySelector(w.src), into = canvas.querySelector(w.into);
      const target = into && into.querySelector(w.to);
      const row = card && (w.row ? card.querySelector(w.row) : card);
      const path = g && g.querySelector('path'), dot = g && g.querySelector('circle');
      const a = card && boxIn(card), r = row && boxIn(row), b = target && boxIn(target), p = into && boxIn(into);
      if (!path || !dot || !a || !r || !b || !p) continue;
      const sx = (a.x + a.w) / em, sy = (r.y + r.h / 2) / em;
      const ex = b.x / em - 0.5, ey = (b.y + b.h / 2) / em;
      const vx = (sx + p.x / em) / 2, dy = ey - sy;
      let d, len;
      if (Math.abs(dy) < 0.6) { d = `M${f3(sx)} ${f3(ey)}H${f3(ex)}`; len = ex - sx; }   // nearly level: one straight line at the row's height
      else {
        const s = dy < 0 ? -1 : 1, rad = f3(Math.min(0.7, Math.abs(dy) / 2, vx - sx, ex - vx));
        d = `M${f3(sx)} ${f3(sy)}H${f3(vx - rad)}A${rad} ${rad} 0 0 ${s < 0 ? 0 : 1} ${f3(vx)} ${f3(sy + s * rad)}`
          + `V${f3(ey - s * rad)}A${rad} ${rad} 0 0 ${s < 0 ? 1 : 0} ${f3(vx + rad)} ${f3(ey)}H${f3(ex)}`;
        len = (vx - rad - sx) + Math.PI * rad + (Math.abs(dy) - 2 * rad) + (ex - vx - rad);
      }
      path.setAttribute('d', d);
      path.style.setProperty('--len', (len + 0.05).toFixed(3) + 'px');
      dot.setAttribute('cx', String(f3(ex)));
      dot.setAttribute('cy', String(f3(ey)));
    }
  }
  function storyP() {
    const r = grid.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - vh));
  }
  function measure(snap) {
    vh = window.innerHeight || root.clientHeight || 800;
    const P = sticky ? storyP() : 0;
    for (const c of chans) {
      c.tgt = c.get(P);
      if (snap) { c.cur = c.tgt; write(c); }
    }
    if (sticky) {
      const i = P >= 1 ? 3 : Math.floor(P * 4);
      if (i !== onStep) { onStep = i; steps.forEach((li, n) => li.classList.toggle('is-on', n === i)); }
    }
  }
  function tick(now) {
    raf = 0;
    const dt = last && now > last ? Math.min(64, now - last) : 16.667;
    last = now || 0;
    const k = 1 - Math.pow(1 - EASE, dt / 16.667);
    let going = false;
    for (const c of chans) {
      const d = c.tgt - c.cur;
      if (Math.abs(d) < EPS) c.cur = c.tgt;
      else { c.cur += d * k; going = true; }
      write(c);
    }
    if (going) raf = requestAnimationFrame(tick);   // settled: no frame is asked for until the next scroll
    else last = 0;
  }
  function kick() { if (!raf && chans.length) raf = requestAnimationFrame(tick); }
  function onScroll() { if (!chans.length) return; measure(false); kick(); }
  function onResize() { wire(); onScroll(); }

  // which layout, and which numbers move: the sticky stage on wide screens with motion, else the plates;
  // without motion every number stays at its end (the stylesheet's own value, or the plate's 1)
  function setupScrub() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    last = 0;
    for (const c of chans) c.el.style.removeProperty(c.name);
    plates.forEach(p => p.el.style.setProperty('--c' + p.k, '1'));
    chans = [];
    onStep = -1;
    sticky = moving() && !!(wide && wide.matches) && !!(canvas && grid && stage);
    root.classList.toggle('lt-scrub', sticky);
    if (!sticky) steps.forEach(li => li.classList.remove('is-on'));
    if (plane && !moving()) plane.classList.remove('is-flat');
    wire();
    if (!moving()) return;
    if (plane) chans.push(chan(plane, '--h', () => clamp((window.scrollY || window.pageYOffset || 0) / (vh * 0.55))));
    if (sticky) {
      for (let k = 1; k <= 4; k++) chans.push(chan(canvas, '--c' + k, P => clamp(P * 4 - (k - 1))));
      chans.push(chan(stage, '--ps', P => P));
    } else {
      for (const p of plates) chans.push(chan(p.el, '--c' + p.k, () => clamp((vh * 0.9 - p.el.getBoundingClientRect().top) / (vh * 0.75))));
    }
    measure(true);
  }
  function wireScrub() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    const again = () => setupScrub();
    if (wide) { if (wide.addEventListener) wide.addEventListener('change', again); else if (wide.addListener) wide.addListener(again); }
    try {
      // a change of the system setting while the page is open: still frames at once, or motion from here on
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const sync = () => { root.classList.toggle('lt-motion', !mq.matches); setupScrub(); };
      if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);
    } catch (e) { /* no matchMedia */ }
    // the faces arrive after the first layout: measure again once they are in
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize, () => {}); } catch (e) { /* no font loading API */ }
    window.addEventListener('load', onResize);
  }

  /* ── 1. the words ── */
  function applyLang(next, save) {
    lang = next === 'en' ? 'en' : 'de';
    root.lang = lang;
    document.title = word('doc_title');
    document.querySelectorAll('meta[data-w-meta]').forEach(m => m.setAttribute('content', word(m.dataset.wMeta)));
    document.querySelectorAll('[data-w]').forEach(el => { el.textContent = word(el.dataset.w); });
    document.querySelectorAll('[data-w-aria]').forEach(el => el.setAttribute('aria-label', word(el.dataset.wAria)));
    document.querySelectorAll('[data-w-alt]').forEach(el => el.setAttribute('alt', word(el.dataset.wAlt)));
    // one key, named for the language it switches to
    const lb = $('lt-lang');
    if (lb) { lb.textContent = word('lang'); lb.lang = lang === 'de' ? 'en' : 'de'; lb.setAttribute('aria-label', word('lang_aria')); }
    const subject = 'mailto:team@upgrads.de?subject=' + encodeURIComponent(word('mail_subject'));
    document.querySelectorAll('a[data-mail]').forEach(a => { a.href = subject; });
    const form = $('ask-form');
    if (form) form.setAttribute('action', subject);
    askRender();
    if (save) { try { localStorage.setItem('lang', lang); } catch (e) { /* private mode */ } }
    onResize();   // other words, other line breaks: measure again
  }

  /* ── 3. the request ── */
  // an address: a name of 1 to 64 characters without a dot at either end or two in a row, an @, labels that are
  // not empty, a top-level label of two characters at least (no lookbehind: older Safari stops on one)
  const EMAIL = /^(?!\.)(?!.*\.\.)(?=[^\s@]{1,64}@)[^\s@]*[^\s@.]@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;
  const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  let ready = false;       // the server can deliver a request into the team's CRM (GET /api/landing/status)
  let server = false;      // what the status said, so a failed delivery can be sent again
  let askState = 'form';   // form | busy | crm | mail | failed (nothing was sent) | unsure (a timeout or a gateway error: it may have arrived)
  let askSent = false;     // a request already arrived: the next one is named "Weitere Anfrage senden"
  function values() {
    const f = $('ask-form');
    return { name: clean(f.elements.name.value, 120), email: clean(f.elements.email.value, 254), company: clean(f.elements.company.value, 120), message: String(f.elements.message.value || '').trim().slice(0, 1000) };
  }
  function bad(v) { return { name: v.name.length < 2, email: !EMAIL.test(v.email) }; }
  function mailBody(v) {
    return [word('f_name') + ': ' + v.name, word('f_email') + ': ' + v.email].concat(v.company ? [word('mail_company') + ': ' + v.company] : []).join('\n') + (v.message ? '\n\n' + word('mail_message') + ':\n' + v.message : '');
  }
  function mailLink(v) { return 'mailto:team@upgrads.de?subject=' + encodeURIComponent(word('mail_subject')) + '&body=' + encodeURIComponent(mailBody(v)); }
  function mailText(v) { return word('mail_to') + ': team@upgrads.de\n' + word('mail_subject_l') + ': ' + word('mail_subject') + '\n\n' + mailBody(v); }
  function askRender() {
    const form = $('ask-form'), done = $('ask-done'), send = $('ask-send');
    if (!form || !done || !send) return;
    const sent = askState === 'crm' || askState === 'mail', failed = askState === 'failed' || askState === 'unsure';
    form.hidden = sent || failed;
    done.hidden = !sent && !failed;
    if (sent || failed) $('ask-done-t').textContent = word(askState === 'unsure' ? 'done_unsure' : failed ? 'done_fail' : askState === 'crm' ? 'done_crm' : 'done_mail').replace('{email}', values().email);
    // by mail, or after a failed delivery: nothing is lost. The request as text to copy, and the mail app's link
    $('ask-fallback').hidden = askState !== 'mail' && !failed;
    if (askState === 'mail' || failed) $('ask-text').value = mailText(values());
    const fb = $('ask-fallback-t');
    fb.dataset.w = askState === 'failed' ? 'f_fallback_fail' : 'f_fallback';   // "Nochmal senden" only where nothing was sent
    fb.textContent = word(fb.dataset.w);
    const mail = $('ask-mail');
    mail.hidden = !failed && askState !== 'mail';
    $('ask-retry').hidden = askState !== 'failed' || !server;   // a request that may have arrived is not sent again
    if (!mail.hidden) mail.href = mailLink(values());
    send.disabled = askState === 'busy';
    send.dataset.w = askState === 'busy' ? 'f_sending' : askSent ? 'f_send_again' : ready ? 'cta' : 'f_send_mail';
    send.textContent = word(send.dataset.w);
  }
  function mark(b) {
    for (const k of ['name', 'email']) {
      const input = $('ask-' + k), err = $('ask-' + k + '-err');
      if (b[k]) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      err.hidden = !b[k];
    }
  }
  async function ask(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (askState === 'busy') return;
    const v = values(), b = bad(v);
    mark(b);
    if (b.name || b.email) { $(b.name ? 'ask-name' : 'ask-email').focus(); return; }
    askState = 'busy';
    askRender();
    let ok = false, unsure = false;
    const tried = ready;
    if (ready) {
      // a timeout (15 s), an answer lost while online, or a gateway error (502, 504) may still have reached the CRM;
      // offline, or the server's own answer (503 not configured, a 4xx), nothing was sent
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const cut = ac ? setTimeout(() => ac.abort(), 15000) : 0;
      try {
        const r = await fetch('/api/landing/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, v, { lang, website: $('ask-website').value })), signal: ac ? ac.signal : undefined });
        ok = r.ok;
        unsure = !ok && (r.status === 502 || r.status === 504);
      } catch (err) { ok = false; unsure = navigator.onLine !== false; }
      finally { if (cut) clearTimeout(cut); }
    }
    // the server did not take it: say so; from here on the request goes by mail
    if (tried && !ok) { ready = false; askState = unsure ? 'unsure' : 'failed'; askRender(); $('ask-done').focus(); return; }
    // without the server the click that asked opens the mail app with the request filled in (no await before it)
    askState = ok ? 'crm' : 'mail';
    if (ok) askSent = true;
    askRender();
    if (!ok) { const a = $('ask-mail'); if (a && a.href) a.click(); }
    $('ask-done').focus();
  }
  // the status switches the form to "into the CRM", but never while the visitor is at work in it
  function touched() {
    const f = $('ask-form');
    if (f.contains(document.activeElement)) return true;
    return ['name', 'email', 'company', 'message'].some(k => f.elements[k] && String(f.elements[k].value || '').trim() !== '');
  }
  function seen() {
    const f = $('ask-form');
    if (f.contains(document.activeElement)) return true;
    const r = f.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0);
  }
  function applyStatus(isReady) {
    server = isReady;
    ready = isReady && askState === 'form' && !(seen() && touched());
    askRender();
  }
  function wireForm() {
    const f = $('ask-form');
    if (!f) return;
    f.addEventListener('submit', ask);
    // a marked field clears its mark once what is typed there is right
    f.addEventListener('input', e => {
      const k = e.target.name;
      if ((k !== 'name' && k !== 'email') || e.target.getAttribute('aria-invalid') !== 'true') return;
      if (!bad(values())[k]) { e.target.removeAttribute('aria-invalid'); $('ask-' + k + '-err').hidden = true; }
    });
    $('ask-copy').addEventListener('click', () => {
      const ta = $('ask-text'), btn = $('ask-copy');
      const said = () => { btn.textContent = word('f_copied'); setTimeout(() => { btn.textContent = word('f_copy'); }, 2000); };
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(said, () => {});
      else said();
    });
    $('ask-retry').addEventListener('click', () => { ready = server; askState = 'form'; ask(null); });   // the same request, to the server again
    $('ask-edit').addEventListener('click', () => { askState = 'form'; askRender(); $('ask-name').focus(); });   // back, with everything still in it
  }

  function init() {
    const status = typeof window.fetch === 'function'
      ? fetch('/api/landing/status').then(r => r.ok && r.json()).then(j => !!j && j.ready === true, () => false)
      : Promise.resolve(false);
    let l = 'de';
    try { const s = localStorage.getItem('lang'); if (s === 'en' || s === 'de') l = s; } catch (e) { /* private mode */ }
    buildPlates();           // before the words: the copies get their words with everything else
    wireForm();
    const lb = $('lt-lang');
    if (lb) lb.addEventListener('click', () => applyLang(lang === 'de' ? 'en' : 'de', true));
    applyLang(l, false);
    setupScrub();
    wireScrub();
    root.classList.add('lt-ready');
    status.then(applyStatus);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
