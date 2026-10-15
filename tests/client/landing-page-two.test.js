// CLIENT (static + pure-function) tests for the second public landing page at /landingpagetwo.
// Part 28 (2026-10-15, from scratch): built to be compared with /landingpage, then one deleted.
// Page one is a film the visitor scrolls through. Page two has no sections and no scroll story: the
// product's own board fills the page — one card, five columns in the pipeline's order — and the visitor
// drags the card to Gewonnen (pointer, touch, the card's arrows, the keyboard). The column it lands in
// widens and shows what the product does at that stage: the lead's arrival, the record, the meeting,
// tasks and the team, the Engine and the next deal. Every move gets the app's own toast with Rückgängig.
// Pinned: the route, the CSP-safe document, Syne self-hosted with its licence, German first and equal
// to the dictionary key for key, impersonal German, the caps on words, the claims audit, the bar as the
// app's Deals header, the five columns and their anatomy and contents, the card's anatomy, the state →
// render contract (done/active/next, counts, sums, the arrows), docking by measurement, the flight on a
// move, the drag with pointer capture, the keyboard, the undo, the stacked board at 860, reduced motion
// last, tokens only, no timers but the toast's, no scroll or pointer engines, and that the two pages
// share nothing but the subject.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const server = read('server.js');
const html   = read('public/landingpagetwo.html');
const css    = read('public/landing2.css');
const js     = read('public/js/landing2.js');
const style  = read('public/style.css');
const one    = { html: read('public/landingpage.html'), css: read('public/landing.css'), js: read('public/js/landing.js') };
const dict   = new Function(sliceConst('public/js/landing2.js', 'BD_I18N').replace(/^[^{]*/, 'return '))();
const stages = new Function(sliceConst('public/js/landing2.js', 'BD_STAGES').replace(/^[^[]*/, 'return '))();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const unesc  = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const col = stage => { const s = html.lastIndexOf('<section class="bd-col', html.indexOf(`data-stage="${stage}" data-i=`)); let e = html.indexOf('\n      <section class="bd-col', s + 1); if (e < 0) e = html.indexOf('\n      <article class="bd-card"', s); return html.slice(s, e); };
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const textOf = src => [...src.matchAll(/>([^<]+)</g)].map(m => m[1].trim()).filter(Boolean).join(' ');
const fnBody = name => { const i = js.indexOf(`function ${name}(`); const s = js.indexOf('{', i); let d = 0; for (let j = s; j < js.length; j++) { if (js[j] === '{') d++; else if (js[j] === '}' && !--d) return js.slice(s, j + 1); } return ''; };

describe('route', () => {
  test('/landingpagetwo serves public/landingpagetwo.html, right after /landingpage and before the SPA catch-all', () => {
    const r1 = server.indexOf("app.get('/landingpage'"), r2 = server.indexOf("app.get('/landingpagetwo'");
    assert.ok(r1 > 0 && r2 > r1, 'both routes, in order');
    assert.match(server, /app\.get\('\/landingpagetwo', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'public', 'landingpagetwo\.html'\)\)\);/);
    assert.ok(r2 < server.indexOf("app.get('*'"), 'before the catch-all');
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'landingpagetwo.html')));
    assert.match(read('readmedev.md'), /GET \/landingpagetwo → public\/landingpagetwo\.html/);
  });
});

describe('document', () => {
  test('standalone head: dark root, viewport, title, description, the app stylesheet then its own, Syne and Inter preloaded, no scripts in the head', () => {
    assert.match(head, /<html lang="de" data-theme="dark">/);
    assert.match(head, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
    assert.match(head, /<title>Upgrads CRM<\/title>/);
    assert.match(head, /<meta name="description" content="[^"]{80,}">/);
    assert.ok(head.indexOf('href="/style.css"') < head.indexOf('href="/landing2.css"'), 'the app stylesheet first');
    assert.match(head, /<link rel="preload" href="\/fonts\/Syne\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.match(head, /<link rel="preload" href="\/fonts\/inter-latin-wght\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.doesNotMatch(head, /<script/);
  });
  test('CSP-safe: one script at the end, no inline handlers, no external hosts, no inline <style>', () => {
    assert.equal((body.match(/<script/g) || []).length, 1);
    assert.match(body, /<script src="\/js\/landing2\.js"><\/script>\s*<\/body>/);
    assert.doesNotMatch(html, /\son[a-z]+="/i, 'no inline handlers');
    assert.doesNotMatch(html, /<style/);
    for (const m of html.matchAll(/(?<![\w-])(?:href|src)="([^"]+)"/g)) assert.ok(/^(\/|#|mailto:)/.test(m[1]), `local only: ${m[1]}`);
  });
  test('the face: Syne, self-hosted with its licence, variable in weight, for the words; Inter inside the board; the faces of the earlier designs are not on this page', () => {
    assert.match(css, /@font-face \{ font-family: "Syne"; font-style: normal; font-weight: 400 800; font-display: swap; src: url\(\/fonts\/Syne\.woff2\) format\("woff2"\); \}/);
    for (const f of ['Syne.woff2', 'OFL-Syne.txt']) assert.ok(fs.existsSync(path.join(ROOT, 'public/fonts', f)), f);
    assert.match(read('public/fonts/OFL-Syne.txt'), /SIL OPEN FONT LICENSE/i);
    assert.match(css, /--bd-face: "Syne", var\(--font\);/);
    assert.match(css, /\.bd-h1, \.bd-h2, \.bd-lead, \.bd-lockup, \.bd-foot-note, \.bd-foot-line, \.bd-col-desc, \.bd-next b \{ font-family: var\(--bd-face\); \}/);
    assert.match(css, /body \{[^}]*font-family: var\(--font\);[^}]*font-size: 13\.5px;/, 'the board in Inter at the app\'s size');
    for (const f of ['Epilogue', 'Familjen', 'Newsreader', 'Sora', 'Archivo', 'InstrumentSerif', 'BricolageGrotesque', 'SchibstedGrotesk', 'Manrope']) assert.doesNotMatch(html + css + js, new RegExp(f), `${f} not on this page`);
    for (const f of ['Epilogue.woff2', 'FamiljenGrotesk.woff2', 'Newsreader.woff2', 'Sora.woff2']) assert.ok(!fs.existsSync(path.join(ROOT, 'public/fonts', f)), `${f} gone`);
    assert.equal((css.match(/@font-face/g) || []).length, 1);
  });
  test('two pages, two grammars: page two shares no class prefix, no token and no function with page one; neither carries the other\'s hook; no pinned acts, no track, no scenes', () => {
    assert.doesNotMatch(html + css + js, /\blp-/); assert.doesNotMatch(one.html + one.css + one.js, /\bbd-/);
    assert.doesNotMatch(css, /--lp-/); assert.doesNotMatch(js, /\blp[A-Z]\w*\(/);
    assert.ok(!html.includes('Gewonnen ist erst der Anfang.'), 'page two has its own hook');
    assert.ok(!one.html.includes('Eine Karte.'));
    assert.doesNotMatch(html + css, /bd-act\b|bd-pin|bd-track|bd-scene|bd-world|bd-coach|bd-index/);
    assert.doesNotMatch(css, /position: sticky/.source.replace('sticky', 'sticky') && /\.bd-(col|board|card)[^{]*\{[^}]*position: sticky/, 'nothing on the board is pinned');
  });
});

describe('the bar and the opening', () => {
  test('the bar is the app\'s Deals header: the crumb "Deals · Verkauf", the language switch, Anmelden, and "Zugang anfragen" as the primary button with the plus', () => {
    const bar = html.slice(html.indexOf('<header class="bd-bar">'), html.indexOf('</header>'));
    assert.match(bar, /<p class="bd-crumb"><span data-i18n="bd_deals">Deals<\/span><i aria-hidden="true">·<\/i><span>Verkauf<\/span><\/p>/);
    assert.match(bar, /<div class="bd-lang" role="group" data-i18n-aria="bd_lang" aria-label="Sprache">\s*<button type="button" class="bd-lang-btn" data-lang="de" aria-pressed="true">DE<\/button>\s*<button type="button" class="bd-lang-btn" data-lang="en" aria-pressed="false">EN<\/button>/);
    assert.match(bar, /<a href="\/" data-i18n="bd_login">Anmelden<\/a>/);
    assert.match(bar, /<a class="bd-btn bd-btn-primary bd-request" href="mailto:hello@upgrads\.de\?subject=[^"]+"><svg class="bd-ic"><use href="#bd-i-plus"\/><\/svg><span data-i18n="bd_request">Zugang anfragen<\/span><\/a>/);
  });
  test('the opening is four words and one line, then the board; no pills, no lockup, no scroll prompt', () => {
    const o = html.slice(html.indexOf('<section id="top"'), html.indexOf('<section id="board"'));
    assert.match(o, /<h1 class="bd-h1" data-i18n="bd_hero_title">Eine Karte\. Bis Gewonnen ziehen\.<\/h1>\s*<p class="bd-lead" data-i18n="bd_hero_line">Jede Spalte zeigt, was das Produkt in dieser Phase tut\. Nichts scrollen, ziehen\.<\/p>\s*<\/div>\s*<\/section>/);
    assert.doesNotMatch(o, /bd-pill|bd-actions|bd-lockup|href="#/);
    assert.equal(words(dict.de.bd_hero_title), 5); assert.ok(words(dict.en.bd_hero_title) <= 6);
  });
});

describe('the board is the page', () => {
  test('five columns in the pipeline\'s order, each with its head (dot, name, count), its sum, its slot, its one line and its piece; the first is active; the card is the board\'s last child', () => {
    const b = html.slice(html.indexOf('<div class="bd-board" id="bd-board"'), html.indexOf('<p class="bd-foot-line"'));
    assert.match(b, /<div class="bd-board" id="bd-board" role="group" data-i18n-aria="bd_board_aria" aria-label="[^"]+">/);
    assert.deepEqual([...b.matchAll(/<section class="bd-col( is-active| bd-col-won)?" data-stage="(\w+)" data-i="(\d)">/g)].map(m => [m[2], Number(m[3]), m[1] || '']), [['new', 0, ' is-active'], ['contacted', 1, ''], ['offer', 2, ''], ['nego', 3, ''], ['won', 4, ' bd-col-won']]);
    assert.deepEqual(stages, ['new', 'contacted', 'offer', 'nego', 'won']);
    for (const s of stages) {
      const c = col(s);
      assert.match(c, new RegExp(`<header class="bd-col-head"><i class="bd-dot s-${s}"></i><span data-i18n="bd_st_${s}">[^<]+</span><b class="bd-count">[01]</b></header>\\s*<p class="bd-col-sum">[^<]+</p>\\s*<div class="bd-slot" id="bd-slot-\\d"></div>\\s*<p class="bd-col-desc" data-i18n="bd_d\\d">[^<]+</p>\\s*<div class="bd-piece">`), s);
    }
    assert.deepEqual([...b.matchAll(/<p class="bd-col-desc" data-i18n="(bd_d\d)">([^<]+)<\/p>/g)].map(m => m[2]), [
      'Der Lead kommt an, bevor jemand ihn abtippt.', 'Anruf, E-Mail, WhatsApp: jede Berührung steht am Deal.', 'Der Termin wird aus dem Deal gebucht.', 'Aufgaben, Kalender, Team-Chat: alle am selben Deal.', 'Gewonnen ist ein Zug. Dann übernimmt die Upgrads Engine.'
    ]);
    assert.deepEqual([...b.matchAll(/id="bd-slot-(\d)"/g)].map(m => Number(m[1])), [0, 1, 2, 3, 4]);
    assert.match(b, /<\/section>\s*<article class="bd-card" id="bd-card" tabindex="0" role="button" data-i18n-aria="bd_card_aria" aria-label="[^"]+">[\s\S]*<\/article>\s*<\/div>\s*$/);
  });
  test('the pieces: Neu has the four marks via Make, Zapier, n8n and the received-lead line; Kontaktiert the composer with WhatsApp pressed, the template hint, two entries and Strg+Enter; Angebot the booking with the team-calendar check, Gebucht and the join link; Verhandlung three tasks (one done) and the chat with presence; Gewonnen the Engine delivered, the six stations with the first lit, the rule, and the next-deal card that asks for access', () => {
    const n = col('new');
    assert.deepEqual([...n.matchAll(/<span class="bd-source"><svg class="bd-logo( bd-logo-line)?"><use href="#(bd-[li]-\w+)"\/><\/svg><span data-i18n="(bd_src_\w+)">([^<]+)<\/span><\/span>/g)].map(m => [m[2], m[4]]), [['bd-l-fb', 'Facebook Ads'], ['bd-l-ig', 'Instagram Ads'], ['bd-l-tt', 'TikTok Ads'], ['bd-i-globe', 'Website-Formular']]);
    assert.match(n, /<p class="bd-via"><span data-i18n="bd_via">über<\/span><b>Make<\/b><b>Zapier<\/b><b>n8n<\/b><\/p>\s*<div class="bd-log"><span class="bd-badge bd-badge-ok" data-i18n="bd_lead_received">Lead empfangen<\/span><span data-i18n="bd_lead_result">Kontakt angelegt · Deal in Neu · Anna Weber<\/span><\/div>/);
    const c = col('contacted');
    assert.match(c, /<div class="bd-seg"><span data-i18n="bd_act_note">Notiz<\/span><span data-i18n="bd_act_call">Anruf<\/span><span data-i18n="bd_act_email">E-Mail<\/span><span aria-pressed="true" data-i18n="bd_act_whatsapp">WhatsApp<\/span><\/div>\s*<p class="bd-hint" data-i18n="bd_wa_hint">Lena Hoffmann, \+49 151 2345678 · Vorlage: „Hallo Lena, “<\/p>/);
    assert.equal((c.match(/<div class="bd-entry">/g) || []).length, 2);
    assert.match(c, /<p class="bd-hint" data-i18n="bd_ctrl_enter">Strg\+Enter speichert\.<\/p>/);
    const o = col('offer');
    assert.match(o, /<dt data-i18n="bd_book_check">Teamkalender<\/dt><dd data-i18n="bd_book_check_v">geprüft, keine Überschneidung<\/dd>/);
    assert.match(o, /<span class="bd-badge bd-badge-ok" data-i18n="bd_booked">Gebucht<\/span><span data-i18n="bd_booked_d">Cal\.com schickt die Einladung an l\.hoffmann@hoffmann-partner\.de\.<\/span>/);
    assert.match(o, /<p class="bd-join"><svg class="bd-ic"><use href="#bd-i-external"\/><\/svg><span data-i18n="bd_join">Google Meet beitreten<\/span><small data-i18n="bd_in_history">im Verlauf des Deals<\/small><\/p>/);
    const g = col('nego');
    assert.equal((g.match(/<div class="bd-task( is-done)?">/g) || []).length, 3); assert.equal((g.match(/<div class="bd-task is-done">/g) || []).length, 1);
    assert.match(g, /<div class="bd-chat"><span class="bd-avatar">MS<\/span><div><b>Mira Schulz <small data-i18n="bd_chat_online">online<\/small><\/b><p data-i18n="bd_chat_msg">@Anna Weber die Unterlagen liegen im Deal\.<\/p><\/div><\/div>/);
    const w = col('won');
    assert.match(w, /<div class="bd-log"><b data-i18n="bd_engine">Upgrads Engine<\/b><span class="bd-badge bd-badge-ok" data-i18n="bd_delivered">Zugestellt<\/span><\/div>/);
    assert.deepEqual([...w.matchAll(/<li( class="is-on")?><i><\/i><span data-i18n="(bd_s\d)">([^<]+)<\/span><\/li>/g)].map(m => [m[3], !!m[1]]), [['Formular versendet', true], ['Formular ausgefüllt', false], ['Termin gebucht', false], ['Call erfolgt', false], ['Briefing fertig', false], ['Abgeschlossen', false]]);
    assert.match(w, /<p class="bd-hint" data-i18n="bd_engine_rule">Die Engine füllt nur leere Felder\. Was das Team eingetragen hat, bleibt\.<\/p>\s*<a class="bd-next" href="mailto:hello@upgrads\.de\?subject=[^"]+"><b data-i18n="bd_next_t">Der nächste Deal wartet\.<\/b><span data-i18n="bd_next_d">Nur auf Einladung\. Zugang anfragen\.<\/span><\/a>/);
  });
  test('the card: the deal\'s title, contact, value, the urgency stripe and badge, the source, the owner, and two arrows with their labels; the line under the board says how to move it', () => {
    const c = html.slice(html.indexOf('<article class="bd-card"'), html.indexOf('</article>'));
    assert.match(c, /<b class="bd-card-title">Elbstraße 12, Verkauf<\/b>\s*<small>Lena Hoffmann, Hoffmann &amp; Partner<\/small>\s*<span class="bd-card-value">420\.000 €<\/span>/);
    assert.match(c, /<span class="bd-badge bd-badge-warn" data-i18n="bd_urg_high">Hoch<\/span><span class="bd-src"><svg class="bd-logo"><use href="#bd-l-fb"\/><\/svg><span data-i18n="bd_from_fb">aus Facebook Ads<\/span><\/span><span class="bd-avatar">AW<\/span>/);
    assert.match(c, /<button type="button" class="bd-step" data-dir="-1" data-i18n-aria="bd_back" aria-label="Eine Phase zurück">[\s\S]*<button type="button" class="bd-step" data-dir="1" data-i18n-aria="bd_forward" aria-label="Eine Phase weiter">/);
    assert.match(css, /\.bd-card::before \{[^}]*background: var\(--warning\);/, 'the urgency stripe');
    assert.match(html, /<p class="bd-foot-line" data-i18n="bd_board_foot">Ziehen, antippen oder Pfeiltasten\. Jeder Zug lässt sich zurücknehmen\.<\/p>/);
  });
  test('state → render: done / active / next on the columns, the count and the sum follow the card, the arrows disable at the ends; docking measures the slot against the board; a move flies (not under reduced motion) and answers with the toast and Rückgängig; undo moves back quietly', () => {
    assert.match(fnBody('bdRender'), /col\.classList\.toggle\('is-done', i < bdStage\); col\.classList\.toggle\('is-active', i === bdStage\); col\.classList\.toggle\('is-next', i > bdStage\);/);
    assert.match(fnBody('bdRender'), /\.bd-count'\)\.textContent = i === bdStage \? '1' : '0';[\s\S]*bdT\(i === bdStage \? 'bd_sum' : 'bd_sum_zero'\)/);
    assert.match(fnBody('bdRender'), /b\.disabled = bdStage \+ d < 0 \|\| bdStage \+ d >= BD_STAGES\.length/);
    assert.match(fnBody('bdSlotPos'), /x: s\.left - b\.left, y: s\.top - b\.top/);
    assert.match(fnBody('bdDock'), /if \(fly && !bdReduced\(\)\) \{ card\.classList\.add\('is-flying'\); requestAnimationFrame\(\(\) => bdPlace\(target\)\);[\s\S]*else \{ card\.classList\.remove\('is-flying'\); bdPlace\(target\); \}/);
    assert.match(fnBody('bdMove'), /if \(i === bdStage\) \{ bdDock\(true\); return; \}[\s\S]*bdToast\(bdT\('bd_moved_to', \{ s: bdStageName\(i\) \}\), \(\) => \{ bdMove\(from, true\); bdToast\(bdT\('bd_undone'\)\); \}\)/);
    assert.match(css, /\.bd-card\.is-flying \{ transition: transform \.5s var\(--ease\); \}/);
    assert.match(css, /\.bd-col\.is-active \{ flex: var\(--bd-active\) 1 0; border-color: var\(--line\); \}/);
    assert.match(css, /\.bd-col\.is-active \.bd-piece \{ display: block; \}/);
  });
  test('the hand: pointer capture on the card (not on its arrows), the column under the pointer lights while dragging, a drop on another column moves, elsewhere snaps back; arrows and Home/End on the keyboard; the stacked board reads the pointer\'s y', () => {
    const h = fnBody('bdInitHand');
    assert.match(h, /card\.addEventListener\('pointerdown', e => \{\s*if \(e\.target\.closest\('\.bd-step'\) \|\| e\.button > 0\) return;[\s\S]*card\.setPointerCapture\(e\.pointerId\); card\.classList\.add\('is-dragging'\)/);
    assert.match(h, /col\.classList\.toggle\('is-over', i === over && i !== bdStage\)/);
    assert.match(h, /if \(over >= 0 && over !== bdStage\) bdMove\(over\); else bdDock\(true\);/);
    assert.match(h, /card\.addEventListener\('pointerup', end\); card\.addEventListener\('pointercancel', end\);/);
    assert.match(h, /\{ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 \}\[e\.key\]/);
    assert.match(h, /e\.key === 'Home'[\s\S]*bdMove\(0\)[\s\S]*e\.key === 'End'[\s\S]*bdMove\(BD_STAGES\.length - 1\)/);
    assert.match(fnBody('bdColAt'), /stacked \? y >= r\.top && y <= r\.bottom : x >= r\.left && x <= r\.right/);
    assert.match(css, /\.bd-card \{[^}]*touch-action: none; user-select: none;/, 'the hand owns the card on touch');
    assert.match(css, /\.bd-col\.is-over \{ border-color: var\(--brand-line\); background: var\(--brand-subtle\); \}/);
  });
});

describe('words', () => {
  test('German first; every key in both languages; the markup equals the German dictionary key for key; no dead keys; no unknown keys', () => {
    assert.deepEqual(Object.keys(dict), ['de', 'en']);
    assert.deepEqual(Object.keys(dict.de).sort(), Object.keys(dict.en).sort());
    assert.ok(js.indexOf('de: {') < js.indexOf('en: {'));
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(unesc(m[2]), dict.de[m[1]], m[1]);
    for (const m of html.matchAll(/data-i18n-aria="([^"]+)"[^>]*aria-label="([^"]*)"/g)) assert.equal(unesc(m[2]), dict.de[m[1]], m[1]);
    const used = new Set([...js.matchAll(/'(bd_[a-z0-9_]+)'/g)].map(m => m[1]).concat([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(m => m[1])));
    assert.deepEqual([...used].filter(k => !(k in dict.de) && !/_$/.test(k)), [], 'unknown keys');
    assert.deepEqual(Object.keys(dict.de).filter(k => !used.has(k) && !/^bd_st_/.test(k)), [], 'dead keys');
  });
  test('impersonal German everywhere; every German value differs from its English one unless it is a name or a product word', () => {
    for (const [k, v] of Object.entries(dict.de)) assert.doesNotMatch(v, IMPERSONAL, k);
    for (const k of Object.keys(dict.de).filter(k => dict.de[k] === dict.en[k])) assert.match(dict.de[k], /^(CRM|Deals|WhatsApp|Upgrads Engine|Facebook Ads|Instagram Ads|TikTok Ads|online)$/, `${k} untranslated: ${dict.de[k]}`);
  });
  test('few words: the hook ≤ 6, every column line ≤ 10, outside the pieces ≤ 150, the whole markup ≤ 360', () => {
    for (const lang of ['de', 'en']) {
      assert.ok(words(dict[lang].bd_hero_title) <= 6, lang + ' hook');
      for (let i = 1; i <= 5; i++) assert.ok(words(dict[lang]['bd_d' + i]) <= 10, `${lang} d${i}: ${words(dict[lang]['bd_d' + i])}`);
      assert.ok(words(dict[lang].bd_hero_line) <= 14 && words(dict[lang].bd_close_line) <= 14, lang + ' lines');
    }
    const outside = body.replace(/<div class="bd-piece">[\s\S]*?\n        <\/div>\n/g, '');
    const n = words(textOf(outside)); assert.ok(n <= 150, `outside the pieces: ${n}`);
    const all = words(textOf(body)); assert.ok(all <= 360, `markup: ${all}`);
  });
  test('claims audit: no competitor names, no superlatives, nothing technical, no e-mail promises, no dollar figures, no "Lead Ads"', () => {
    const all = Object.values(dict.de).concat(Object.values(dict.en)).join(' ') + textOf(body);
    assert.doesNotMatch(all, /pipedrive|hubspot|onoffice|propstack|salesforce/i);
    assert.doesNotMatch(all, /\b(beste[rsn]?|schnellste|einzige|führende|#1|best|fastest|leading|only CRM|revolution)\b/i);
    assert.doesNotMatch(all, /hmac|sha256|signiert|signed with|payload|json|curl|header|endpoint|\bapi\b|webhook|vertrag\.unterschrieben|oauth/i);
    assert.doesNotMatch(all, /Lead Ads|E-Mails? (?:versendet|verschickt|gesendet)|sends? (?:an )?e-?mails?|synchronis|Forecast/i);
    assert.doesNotMatch(all, /\$\s?\d|\d\s?\$/);
  });
});

describe('pure helpers (loaded from the real file)', () => {
  const F = loadFns('public/js/landing2.js', ['bdT', 'bdEsc', 'bdClamp', 'bdStageName'], { state: { BD_I18N: dict, bdLang: 'de', BD_STAGES: stages } });
  test('bdT: the language, a fallback, variables; the stage names in both languages; clamp; escaping', () => {
    assert.equal(F.bdT('bd_moved_to', { s: 'Gewonnen' }), 'Verschoben nach Gewonnen');
    assert.equal(F.bdT('nope'), 'nope');
    assert.deepEqual([0, 1, 2, 3, 4].map(F.bdStageName), ['Neu', 'Kontaktiert', 'Angebot', 'Verhandlung', 'Gewonnen']);
    F.__set('bdLang', 'en'); assert.deepEqual([0, 4].map(F.bdStageName), ['New', 'Won']); assert.equal(F.bdT('bd_moved_to', { s: 'Won' }), 'Moved to Won'); F.__set('bdLang', 'de');
    assert.equal(F.bdClamp(9, 0, 4), 4); assert.equal(F.bdClamp(-2, 0, 4), 0); assert.equal(F.bdClamp(2, 0, 4), 2);
    assert.equal(F.bdEsc('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  });
});

describe('stylesheet and script discipline', () => {
  test('every selector is bd- prefixed (plus the five stage colours); tokens only (no hex, no gradients); the ground is the app\'s canvas, the columns its surfaces; the stage colours are the app\'s; no caps; every token resolves', () => {
    const sels = [...bare.matchAll(/^([.#][\w-]+)/gm)].map(m => m[1]);
    assert.ok(sels.length > 100);
    assert.deepEqual(sels.filter(s => !s.startsWith('.bd-') && s !== '.hidden' && !/^\.s-(new|contacted|offer|nego|won)$/.test(s)), []);
    assert.doesNotMatch(bare, /#[0-9a-fA-F]{3,6}\b/); assert.doesNotMatch(bare, /gradient\(/);
    assert.match(css, /body \{[^}]*background: var\(--canvas\); color: var\(--ink\);/); assert.match(css, /\.bd-col \{[^}]*background: var\(--surface\);/);
    assert.match(css, /\.s-new \{ background: var\(--neutral\); \}\s*\.s-contacted \{ background: var\(--info\); \}\s*\.s-offer \{ background: var\(--warning\); \}\s*\.s-nego \{ background: var\(--violet\); \}\s*\.s-won \{ background: var\(--success\); \}/);
    const tokens = [...new Set([...bare.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]))];
    assert.deepEqual(tokens.filter(t => !bare.includes(t + ':') && !style.includes(t + ':')), [], 'every token resolves');
    assert.doesNotMatch(bare, /text-transform: uppercase/);
    assert.match(css, /:where\(body\) :focus-visible \{ outline: 2px solid var\(--focus\)/);
  });
  test('four breakpoints widest first, reduced motion last; at 860 the board stands up (columns stacked, the slots of the other columns collapse); reduced motion: no flight, no reveal', () => {
    const bps = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map(m => Number(m[1]));
    assert.deepEqual(bps, [1024, 860, 600, 400]);
    const rm = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(rm > css.lastIndexOf('@media (max-width'), 'reduced motion is the last block');
    assert.match(css.slice(rm), /\.bd-card\.is-flying \{ transition: none; \}\s*\.bd-col\.is-active \.bd-piece > \* \{ animation: none; \}/);
    assert.match(css, /@media \(max-width: 860px\) \{[\s\S]*\.bd-board \{ flex-direction: column; min-height: 0; \}[\s\S]*\.bd-col\.is-done \.bd-slot, \.bd-col\.is-next \.bd-slot \{ height: 0; border: 0; \}/);
    assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*\.bd-bar-links > a:not\(\.bd-btn\) \{ display: none; \}/);
  });
  test('no scroll engine, no pointer-following, no IntersectionObserver, no timer but the toast\'s; every id the script touches exists; the language is shared with the app', () => {
    assert.doesNotMatch(js, /setInterval|mousemove|deviceorientation|IntersectionObserver|addEventListener\('scroll'/);
    assert.equal((js.match(/setTimeout\(/g) || []).length, 1); assert.match(fnBody('bdToast'), /setTimeout\(/);
    assert.doesNotMatch(js.replace(fnBody('bdInitHand'), ''), /pointermove/, 'pointer moves are read only while the hand holds the card');
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    const used = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]).concat([...js.matchAll(/querySelector(?:All)?\(`?'?#([\w-]+)/g)].map(m => m[1])).filter(i => !/^bd-slot-$/.test(i));
    assert.deepEqual([...new Set(used)].filter(i => !ids.has(i)), []);
    assert.match(js, /localStorage\.setItem\('lang', l\)/); assert.match(js, /localStorage\.getItem\('lang'\)/);
    assert.match(js, /document\.addEventListener\('DOMContentLoaded', bdInit\);\s*$/);
  });
});
