// CLIENT (static + pure-function) tests for the public landing page at
// /landingpage (2026-10-07, the product page): statements set large and
// centred, one per section, the product shown big and working under them in
// a rounded frame, white, grey and navy bands alternating, a slim translucent
// bar, pill buttons, a specs grid, one closing call to action. The route, the
// CSP-safe document, German-first copy equal to the dictionary key for key, a
// hard cap on words, the claims audit, and the working pieces: the board (a
// visible cursor drags the deal into Won once, then drag and drop), leads
// (one button, three real payload shapes through the webhook's own mapping),
// the deal record's tabs, the contacts (search, pick, reach), three periods of figures, and the
// hand-over from our system to the next shown as a packet that travels and a
// receipt, no code on the page (2026-10-07: the user asked for the lead
// sources with their logos and for the Engine as a visible workflow, not the
// payload and the signature). Pure functions are sliced out of
// public/js/landing.js and run in a sandbox.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const server = read('server.js');
const html   = read('public/landingpage.html');
const css    = read('public/landing.css');
const js     = read('public/js/landing.js');
const style  = read('public/style.css');
const engine = read('utils/engine.js');
const dict      = new Function(sliceConst('public/js/landing.js', 'LP_I18N').replace(/^[^{]*/, 'return '))();
const presets   = new Function(sliceConst('public/js/landing.js', 'LP_LEAD_PRESETS').replace(/^[^[]*/, 'return '))();
const analytics = new Function(sliceConst('public/js/landing.js', 'LP_ANALYTICS').replace(/^[^{]*/, 'return '))();
const contacts  = new Function(sliceConst('public/js/landing.js', 'LP_CONTACTS').replace(/^[^[]*/, 'return '))();
const count  = (src, needle) => src.split(needle).length - 1;
const body   = html.slice(html.indexOf('<body'));
const unesc  = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const section = id => { const s = html.indexOf(`<section id="${id}"`); let e = html.indexOf('\n<section id="', s + 1); if (e < 0) e = html.indexOf('</main>'); return html.slice(s, e); };
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;

describe('route', () => {
  test('/landingpage serves public/landingpage.html, after the API mounts and before the SPA catch-all', () => {
    const route = server.indexOf("app.get('/landingpage'");
    assert.ok(route > 0, 'route present');
    assert.match(server, /app\.get\('\/landingpage', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'public', 'landingpage\.html'\)\)\);/);
    assert.ok(route < server.indexOf("app.get('*'"), 'before the catch-all');
    assert.ok(route > server.indexOf("app.use('/api/engine'"), 'after the API mounts');
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'landingpage.html')));
  });
});

describe('document', () => {
  test('standalone head: dark theme, viewport, title, description, the app stylesheet then its own, both fonts preloaded, no scripts in the head', () => {
    assert.match(html, /^<html lang="de" data-theme="dark">/m, 'the root carries the product\'s dark theme: the frames are the product in dark mode');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
    assert.match(html, /<meta name="color-scheme" content="dark">/);
    assert.match(html, /<title>Upgrads CRM<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{60,}">/);
    assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]), ['/style.css', '/landing.css']);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /<link rel="preload" href="\/fonts\/Manrope\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.match(head, /<link rel="preload" href="\/fonts\/inter-latin-wght\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.doesNotMatch(head, /<script>/);
    assert.doesNotMatch(js, /localStorage\.(get|set)Item\('theme'/);
  });
  test('nothing the production policy would block: no external hosts, no iframes, one own script, no canvas, no inline styles, no hidden attribute', () => {
    assert.doesNotMatch(html, /https?:\/\//, 'no external hosts in the markup');
    assert.doesNotMatch(html, /<iframe|<canvas/);
    assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['/js/landing.js']);
    assert.deepEqual([...html.matchAll(/ style="[^"]*"/g)].map(m => m[0]), [], 'no inline styles');
    for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) assert.ok(/^(\/|#|mailto:)/.test(m[1]), `absolute, anchor or mailto: ${m[1]}`);
    assert.doesNotMatch(html, /<img[^>]*src="(?!\/images\/logo\.png)/, 'the only bitmap is our own logo; the platform marks are inline symbols');
    assert.doesNotMatch(body, /<[a-z]+[^>]*\shidden(?=[\s>])/, 'hidden things use the .hidden class, not the attribute');
    assert.ok(count(body, 'class="lp-toast hidden"') === 1 && count(body, 'class="lp-pan hidden"') === 4 && count(body, 'class="lp-demo-cursor hidden"') === 1);
  });
  test('the bar: logo, overview, log in, the language switch and a small pill; nothing else', () => {
    const nav = html.slice(html.indexOf('<header class="lp-nav">'), html.indexOf('</header>'));
    assert.match(nav, /<a class="lp-brand" href="#top"><img src="\/images\/logo\.png" alt="Upgrads"><\/a>/);
    assert.deepEqual([...nav.matchAll(/<a href="([^"]+)" data-i18n="(lp_\w+)">/g)].map(m => [m[1], m[2]]), [['#top', 'lp_overview'], ['/', 'lp_login']]);
    assert.match(nav, /class="lp-lang-btn" data-lang="de" aria-pressed="true"[\s\S]*class="lp-lang-btn" data-lang="en" aria-pressed="false"/);
    assert.match(nav, /<a class="lp-pill lp-pill-sm lp-request" href="mailto:hello@upgrads\.de\?subject=[^"]+" data-i18n="lp_request">/);
    assert.equal(count(nav, '<a '), 4);
  });
  test('the hero: the product lockup (the Upgrads wordmark, a hairline, CRM set light and tracked), the statement, one line, two pills, then the product big in a frame', () => {
    const hero = section('top');
    assert.match(hero, /<section id="top" class="lp-sec lp-hero">\s*<div class="lp-glow" aria-hidden="true"><\/div>\s*<div class="lp-head lp-reveal">\s*<p class="lp-kicker"><img class="lp-kicker-mark" src="\/images\/logo\.png" alt="Upgrads"><span class="lp-kicker-crm" data-i18n="lp_hero_kicker">CRM<\/span><\/p>\s*<h1 class="lp-hero-title" data-i18n="lp_hero_title">[^<]*<\/h1>\s*<p class="lp-hero-sub" data-i18n="lp_hero_sub">/);
    assert.match(hero, /<div class="lp-actions">\s*<a class="lp-pill lp-request"[^>]*data-i18n="lp_request">[^<]*<\/a>\s*<a class="lp-pill lp-pill-line" href="\/" data-i18n="lp_login">/);
    assert.match(hero, /<div class="lp-stage lp-reveal">\s*<div class="lp-frame lp-board-wrap">/);
    assert.ok(hero.indexOf('lp-hero-title') < hero.indexOf('id="lp-board"'), 'the statement comes first, the product under it');
    assert.equal(count(html, 'lp-request"'), 3, 'request access in the bar, the hero and the closing');
    assert.doesNotMatch(html, /href="\/\?admin"/);
  });
  test('the bands: two shades of navy alternating; every section centred with one statement and at most one line', () => {
    const secs = [...html.matchAll(/<section id="(\w+)" class="lp-sec([^"]*)">/g)].map(m => [m[1], m[2].trim()]);
    assert.deepEqual(secs, [['top', 'lp-hero'], ['board', 'lp-alt'], ['leads', ''], ['deal', 'lp-alt'], ['contacts', ''], ['numbers', ''], ['engine', 'lp-alt'], ['work', ''], ['cta', 'lp-cta']]);
    for (const [id] of secs.slice(1)) {
      const s = section(id);
      assert.equal((s.match(/<h2 /g) || []).length, 1, `${id}: one statement`);
      assert.ok((s.match(/<p class="lp-sub"/g) || []).length <= 1, `${id}: at most one line`);
      assert.ok((s.match(/<div class="lp-frame[ "]/g) || []).length <= 1, `${id}: at most one frame`);
      assert.match(s, /<div class="lp-head lp-reveal">/);
    }
    assert.match(css, /\.lp-sec \{ position: relative; padding: 140px 24px; text-align: center; \}/, 'generous, centred');
    assert.match(css, /\.lp-alt \{ background: var\(--lp-alt\); \}/); assert.match(css, /--lp-ground: var\(--navy-950\)/); assert.match(css, /--lp-alt: var\(--navy-900\)/);
    assert.doesNotMatch(css, /\.lp-grey|\.lp-dark\b/);
    assert.equal(count(body, 'class="lp-frame lp-tilt'), 6, 'every frame but the board tilts (the board\'s drag uses position: fixed)');
    assert.doesNotMatch(body, /lp-frame lp-tilt lp-board-wrap|lp-board-wrap lp-tilt/);
    const all = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    for (const a of [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1])) assert.ok(all.has(a), `#${a} resolves`);
    assert.doesNotMatch(body, /lp-eyebrow|lp-ch\b|lp-ch-time|lp-scene|lp-inst\b|lp-notes|lp-passage|lp-panel|lp-index|lp-wall|lp-faq/);
    assert.doesNotMatch(body, />(Montag|Dienstag|Mittwoch|Donnerstag|Freitag)(, \d\d:\d\d)?</);
  });
  test('the working day: the record\'s own task rows (three, one done) with a composer, a seven-day week carrying the dated tasks and one viewing, and the team room with presence, two messages and a composer; then the closing and a one-line footer', () => {
    const w = section('work');
    assert.match(w, /<h2 data-i18n="lp_s7_t">Aufgaben\. Kalender\. Chat\.<\/h2>\s*<p class="lp-sub" data-i18n="lp_s7_d">/);
    assert.match(w, /<div class="lp-frame lp-tilt lp-work" id="lp-work">\s*<div class="lp-wk-left">/);
    assert.match(w, /<span class="lp-wk-count" id="lp-wk-count"><\/span><\/p>\s*<div class="lp-task-head"><span class="lp-task-progress" id="lp-wk-progress"><\/span><span class="lp-task-bar"><i id="lp-wk-bar"><\/i><\/span><\/div>/, 'the record\'s progress line and bar');
    const tasks = [...w.matchAll(/<li class="lp-task( is-done)?" data-task="(\d)"><label><input type="checkbox"( checked)?><span class="lp-check">[\s\S]*?<span class="lp-task-title" data-i18n="(lp_w\d)">[^<]*<\/span><\/label><small( class="is-today")? data-i18n="(lp_w\d_due)">([^<]*)<\/small><i class="lp-av lp-av-xs( lp-av-t)?">(\w)<\/i><\/li>/g)];
    assert.deepEqual(tasks.map(x => [x[2], !!x[1], !!x[3], x[4], x[6], !!x[5], x[9]]), [['1', false, false, 'lp_w1', 'lp_w1_due', true, 'M'], ['2', false, false, 'lp_w2', 'lp_w2_due', false, 'T'], ['3', true, true, 'lp_w3', 'lp_w3_due', false, 'M']], 'the record\'s row plus the owner; today\'s due is lit');
    assert.equal(dict.de.lp_w1_due.slice(0, 2), dict.de.lp_wd3, 'the lit due is today, Wednesday');
    assert.match(w, /<form class="lp-wk-add" id="lp-wk-add"><input type="text" id="lp-wk-input" autocomplete="off" data-i18n-ph="lp_wk_task_ph" placeholder="[^"]+"><button type="submit" class="lp-pill lp-pill-sm" data-i18n="lp_wk_add">/);
    const days = [...w.matchAll(/<div class="lp-cal-day( is-today)?" data-day="(\d)"><b data-i18n="(lp_wd\d)">[^<]*<\/b><i>(\d+)<\/i>/g)];
    assert.deepEqual(days.map(x => [x[2], x[3], x[4], !!x[1]]), [['1', 'lp_wd1', '5', false], ['2', 'lp_wd2', '6', false], ['3', 'lp_wd3', '7', true], ['4', 'lp_wd4', '8', false], ['5', 'lp_wd5', '9', false], ['6', 'lp_wd6', '10', false], ['7', 'lp_wd7', '11', false]], 'one week, Wednesday the 7th today');
    const chips = [...w.matchAll(/<span class="lp-cal-chip( is-done| lp-cal-ev)?"(?: data-task="(\d)")?><time>(\d\d:\d\d)<\/time><span data-i18n="(lp_\w+)">/g)].map(x => [x[1] || '', x[2] || '', x[3], x[4]]);
    assert.deepEqual(chips, [[' is-done', '3', '11:00', 'lp_w3'], ['', '1', '14:00', 'lp_w1'], [' lp-cal-ev', '', '09:30', 'lp_ev1'], ['', '2', '11:00', 'lp_w2']], 'every dated task is on its day with its time under the same key; the done one is done there too');
    for (const [, id, time, key] of chips) if (id) assert.ok(dict.de[key + '_due'].endsWith(time), `${key}: the chip time is the due time`);
    assert.match(dict.de.lp_msg2, /Donnerstag, 09:30/); assert.ok(chips.some(x => x[0] === ' lp-cal-ev' && x[2] === '09:30'), 'the viewing Tim mentions is the one on the week');
    for (const [, id] of tasks.map(x => [0, x[2]])) assert.ok(chips.some(c => c[1] === id), `task ${id} is on the calendar`);
    assert.match(w, /<p class="lp-online" id="lp-wk-online"><i class="lp-av">M<\/i><i class="lp-av lp-av-t">T<\/i><i class="lp-av lp-av-n">N<\/i><span class="lp-online-dot"><\/span><span data-i18n="lp_wk_online">/, 'presence, as the real chat bar shows it');
    const msgs = [...w.matchAll(/<li class="lp-msg"><i class="lp-av( lp-av-t)?">(\w)<\/i><div><p class="lp-msg-meta"><b>([^<]+)<\/b><time>(\d\d:\d\d)<\/time><\/p><p class="lp-msg-text" data-i18n="(lp_msg\d)">/g)];
    assert.deepEqual(msgs.map(x => [x[2], x[3], x[4], x[5]]), [['M', 'Mara Kühn', '09:12', 'lp_msg1'], ['T', 'Tim Berger', '09:14', 'lp_msg2']]);
    assert.match(w, /<\/ul>\s*<p class="lp-typing hidden" id="lp-wk-typing" aria-live="polite"><i><\/i><i><\/i><i><\/i><span id="lp-wk-typing-text"><\/span><\/p>\s*<form class="lp-chat-add"/, 'a typing indicator between the messages and the composer');
    assert.match(w, /<form class="lp-chat-add" id="lp-wk-send"><input type="text" id="lp-wk-msg" autocomplete="off" data-i18n-ph="lp_wk_msg_ph" placeholder="[^"]+"><button type="submit" class="lp-chat-btn" data-i18n-aria="lp_wk_send" aria-label="[^"]+"><svg class="lp-ic"><use href="#lp-i-arrow"\/><\/svg><\/button><\/form>/);
    assert.doesNotMatch(w, /lp-grid|<pre|<code|\{|\}|channel|Kanal|#general|\bDM\b/, 'one room, no channels, no code');
    assert.match(html, /<symbol id="lp-i-calendar" viewBox="0 0 24 24">/);
    const cta = section('cta');
    assert.match(cta, /<h2 data-i18n="lp_cta_t">[\s\S]*<p class="lp-sub" data-i18n="lp_cta_d">[\s\S]*<a class="lp-pill lp-request"[\s\S]*<a class="lp-pill lp-pill-line" href="\/" data-i18n="lp_login">/);
    assert.match(html, /<footer class="lp-footer">\s*<div class="lp-footer-in">\s*<a class="lp-brand" href="#top">[\s\S]*<p data-i18n="lp_foot_tag">/);
  });
});

describe('German first', () => {
  test('a visitor with no saved language gets German', () => {
    assert.match(js, /^let lpLang = 'de';/m);
    assert.match(js, /lpApplyLang\(saved \|\| 'de'\)/);
  });
  test('the markup text IS the German dictionary, key for key', () => {
    let n = 0;
    for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n="([a-z0-9_]+)"[^>]*>([^<]*)<\/\1>/g)) { n++; assert.equal(unesc(m[3]), dict.de[m[2]], m[2]); }
    assert.ok(n >= 105, `checked ${n} strings`);
    for (const m of html.matchAll(/data-i18n-ph="([a-z0-9_]+)"[^>]*placeholder="([^"]*)"/g)) assert.equal(unesc(m[2]), dict.de[m[1]], m[1]);
  });
  test('the German is impersonal (neither du nor Sie)', () => {
    for (const [k, v] of Object.entries(dict.de)) assert.doesNotMatch(v, IMPERSONAL, `${k}: ${v}`);
  });
});

describe('copy', () => {
  test('both dictionaries have identical key sets, no empty values; every key on the page exists; no dead keys', () => {
    assert.deepEqual(Object.keys(dict.en).sort(), Object.keys(dict.de).sort());
    for (const [lang, d] of Object.entries(dict)) for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.trim(), `${lang}.${k}`);
    const used = new Set([...html.matchAll(/data-i18n(?:-ph|-aria)?="([a-z0-9_]+)"/g)].map(m => m[1]));
    assert.deepEqual([...used].filter(k => !(k in dict.de)), []);
    const logic = js.slice(js.indexOf('let lpLang'));
    const dynamic = k => (/^lp_f_(name|email|phone|company)$/.test(k) && logic.includes("lpT('lp_f_' + f)"))   // the lead card builds these keys
      || (/^lp_h\d[ab]$/.test(k) && contacts.some(c => c.history.some(h => h.key === k)));                        // the contacts' history carries these
    assert.deepEqual(Object.keys(dict.de).filter(k => !used.has(k) && !logic.includes(`'${k}'`) && !dynamic(k) && k !== 'lp_request_subject'), [], 'no dead keys');
  });
  test('short, in the manner of a launch page: statements at most 6 words, lines at most 12, every value at most 90 characters; under 500 German words on the whole page', () => {
    for (const [lang, d] of Object.entries(dict)) for (const [k, v] of Object.entries(d)) {
      assert.ok(v.length <= 90, `${lang}.${k} is ${v.length} chars`);
      if (/^(lp_s\d_t|lp_hero_title|lp_cta_t)$/.test(k)) assert.ok(v.split(/\s+/).length <= 6, `${lang}.${k} statement: ${v}`);
      if (/^(lp_s\d_d|lp_hero_sub|lp_cta_d)$/.test(k)) assert.ok(v.split(/\s+/).length <= 12, `${lang}.${k} line: ${v}`);
    }
    const words = [...body.matchAll(/>([^<]+)</g)].map(m => m[1].trim()).filter(Boolean).join(' ').split(/\s+/).length;
    assert.ok(words < 500, `German words on the page: ${words}`);
  });
  test('headings, lines, links, buttons, list items and labels carry a key; only names and numbers are untranslated', () => {
    const allow = /^(DE|EN|Make\.com|Zapier|n8n|Upgrads|Mara Kühn|Tim Berger|Jana Weber|Elbstraße 12, Whg\. 3|Notariat Feld &amp; Kollegen|jana\.weber@example\.de|\+49 171 2345678|X-Upgrads[\s\S]*|\{[\s\S]*|[\d€.,:%\s+()-]*)$/;
    for (const m of body.matchAll(/<(h1|h2|h3|h4|p|a|button|li|summary|dt|dd|small|label)\b[^>]*>([^<]*)</g)) {
      const text = m[2].trim();
      if (!text || allow.test(text) || /lp-card-(title|sub)/.test(m[0])) continue;
      assert.match(m[0], /data-i18n(-ph)?=/, m[0].slice(0, 100));
    }
  });
  test('the copy claims only what the code does: no features we do not have, no invented proof, no template punctuation', () => {
    for (const [lang, d] of Object.entries(dict)) {
      const all = Object.values(d).join('\n');
      assert.doesNotMatch(all, /Lead Ads|ImmoScout|Immowelt|HubSpot|Salesforce|direkt(e|er)? (Anbindung|Schnittstelle)|native integration/i, `${lang}: no adapters we do not have`);
      assert.match(d.lp_s2_d, /Make, Zapier (oder|or) n8n/, `${lang}: the platforms arrive through the automation tools, said in the same breath`);
      assert.doesNotMatch(all, /attach|Anhang|anhäng/i, `${lang}: no attachments in the UI`);
      assert.doesNotMatch(all, /\bchannels?\b|\bKanäle\b|\bDMs?\b|Direktnachricht|thread/i, `${lang}: chat is one room`);
      assert.doesNotMatch(all, /\bSSO\b|single sign|\bAI\b|\bKI\b|mobile[- ]app|email sync|E-Mail-Sync|Kalender-Sync|calendar sync|iCal|Outlook/i, `${lang}: not built`);
      assert.doesNotMatch(all, /Kommentar|comment|@Name|Erwähnung|mention picker/i, `${lang}: no comment or mention UI`);
      assert.doesNotMatch(all, /kostenlos|free trial|Testphase|\bPreis(e|liste)?\b|pricing|\$/i, `${lang}: no pricing or trial claims`);
      assert.doesNotMatch(all, /\b\d+\+? (companies|teams|customers|agencies|users|Unternehmen|Teams|Kunden|Makler|Nutzer)\b/i, 'no made-up customer counts');
      assert.doesNotMatch(all, /→|·|—|\*\*/, 'no arrows, middle dots, em dashes or markdown');
      assert.doesNotMatch(all, /\b[A-Z]{5,}\b/, 'no shouting labels');
    }
    const en = Object.values(dict.en).join('\n').toLowerCase();
    for (const word of ['make', 'zapier', 'n8n', 'facebook', 'instagram', 'tiktok', 'invite code', 'upgrads engine', 'tasks', 'calendar', 'chat', 'team', 'contact', 'whatsapp']) assert.ok(en.includes(word), `en mentions ${word}`);
    const de = Object.values(dict.de).join('\n');
    assert.doesNotMatch(en + '\n' + de, /hmac|sha256|signiert|signed with|payload|json|curl|header|endpoint|\bapi\b|webhook-url|vertrag\.unterschrieben/i, 'nothing technical in the copy: the page shows the hand-over, not the code behind it');
    for (const word of ['Make', 'Zapier', 'n8n', 'Einladungscode', 'Upgrads Engine', 'Facebook', 'Instagram', 'TikTok', 'Aufgaben', 'Kalender', 'Chat', 'Team', 'Kontakt', 'WhatsApp']) assert.ok(de.includes(word), `de mentions ${word}`);
  });
  test('the language toggle and the mailto subject follow the chosen language', () => {
    assert.equal(count(html, 'class="lp-lang-btn" data-lang="de"'), 1); assert.equal(count(html, 'class="lp-lang-btn" data-lang="en"'), 1);
    const s = sliceFn(js, 'lpApplyLang', 'landing.js');
    assert.match(s, /document\.documentElement\.lang = lpLang/); assert.match(s, /localStorage\.setItem\('lang', lpLang\)/);
    assert.match(s, /aria-pressed/); assert.match(s, /data-i18n-ph/); assert.match(s, /data-i18n-aria/);
    assert.match(s, /mailto:hello@upgrads\.de\?subject=/); assert.match(s, /encodeURIComponent/);
    assert.match(s, /for \(const fn of lpRerender\) fn\(\)/);
  });
});

describe('the frames', () => {
  test('the board: four stage columns, six cards with values, the deal that will be demonstrated, one already won, a stats sentence, an Engine line, a cursor and a replay', () => {
    const s = section('top');
    assert.deepEqual([...s.matchAll(/<section class="lp-col[^"]*" data-stage="([a-z]+)">/g)].map(m => m[1]), ['new', 'offer', 'nego', 'won']);
    const cards = [...s.matchAll(/<article class="lp-card[^"]*" tabindex="0" data-value="(\d+)"/g)];
    assert.equal(cards.length, 6);
    assert.equal(cards.reduce((a, m) => a + Number(m[1]), 0), 1590500);
    assert.match(s, /<article class="lp-card u3" tabindex="0" data-value="485000" data-hero>/);
    assert.match(s, /data-stage="won">[\s\S]*<article class="lp-card is-won"/);
    for (const id of ['lp-board', 'lp-stats-line', 'lp-engine-line', 'lp-cursor', 'lp-toast', 'lp-demo-replay']) assert.ok(s.includes(`id="${id}"`), id);
    assert.match(s, /<p class="lp-stats-line" id="lp-stats-line" aria-live="polite">/);
    assert.match(s, /<svg class="lp-demo-cursor hidden" id="lp-cursor" aria-hidden="true"><use href="#lp-i-pointer"\/><\/svg>/);
  });
  test('leads: four sources with their marks (Facebook, Instagram, TikTok as inline symbols, the website as our globe), the automation tools between, Upgrads as the target with the contact card, a packet, one pill, no code; three presets each with a four-field map', () => {
    const s = section('leads');
    assert.deepEqual([...s.matchAll(/<li class="lp-source( is-on)?" data-src="(\w+)"><svg class="lp-logo( lp-logo-web)?"><use href="#(lp-[li]-\w+)"\/><\/svg><span data-i18n="(lp_src_\w+)">/g)].map(m => [m[2], m[4], m[5]]),
      [['fb', 'lp-l-fb', 'lp_src_fb'], ['ig', 'lp-l-ig', 'lp_src_ig'], ['tt', 'lp-l-tt', 'lp_src_tt'], ['web', 'lp-i-globe', 'lp_src_web']]);
    assert.equal(count(s, 'class="lp-source is-on"'), 1, 'one source lit at a time');
    for (const id of ['lp-l-fb', 'lp-l-ig', 'lp-l-tt']) assert.match(html, new RegExp(`<symbol id="${id}" viewBox="0 0 24 24">`), `${id} is drawn in the page's own sprite`);
    assert.match(s, /<div class="lp-via"><span data-i18n="lp_via">über<\/span><b>Make<\/b><b>Zapier<\/b><b>n8n<\/b>/);
    assert.match(s, /<div class="lp-target" id="lp-lead-target">\s*<p class="lp-target-name"><img src="\/images\/logo\.png" alt="Upgrads"><\/p>\s*<div class="lp-lead-card" id="lp-lead-card">[\s\S]*<dl class="lp-fields" id="lp-lead-fields"><\/dl>[\s\S]*<p class="lp-chips" id="lp-lead-chips"><\/p>/);
    assert.match(s, /<span class="lp-packet hidden" id="lp-lead-packet" aria-hidden="true"><\/span>/);
    assert.match(s, /<button type="button" class="lp-pill" id="lp-lead-send">/);
    assert.doesNotMatch(s, /<pre|<code|textarea|lp-map-row|lp-log\b|\{|\}/, 'no code in the leads section');
    assert.equal(presets.length, 3);
    assert.deepEqual(presets.map(p => p.name), ['form', 'make', 'zapier']);
    for (const p of presets) assert.deepEqual(Object.keys(p.map), ['name', 'email', 'phone', 'company'], p.name);
  });
  test('the record: a tablist of five, panels wired by aria-controls, four tasks (one done), a composer with four types', () => {
    const rec = section('deal');
    const tabs = [...rec.matchAll(/<button type="button" role="tab" id="(lp-tab-[a-z]+)" aria-controls="(lp-pan-[a-z]+)" aria-selected="(true|false)"/g)];
    assert.equal(tabs.length, 5);
    assert.equal(tabs.filter(t => t[3] === 'true').length, 1);
    for (const t of tabs) assert.match(rec, new RegExp(`role="tabpanel" id="${t[2]}" aria-labelledby="${t[1]}"`));
    assert.equal(count(rec, '<li class="lp-task">'), 4);
    assert.equal(count(rec, '<input type="checkbox" checked>'), 1);
    assert.equal(count(rec, 'class="lp-type-chip"'), 4);
    assert.match(rec, /<textarea rows="2" data-i18n-ph="lp_note_ph" placeholder="/);
  });
  test('contacts: a search field, a listbox the script fills from five real-shaped contacts, a card with three action pills, a bubble, deals and history; numbers: three periods, four figures, the line, the funnel; engine: our system with the deal on the left, a link with a state, the next system with a receipt on the right, a packet, one pill, one caption, no code', () => {
    const ct = section('contacts');
    assert.match(ct, /<h2 data-i18n="lp_s4_t">Jeder Kontakt\. Sofort gefunden\.<\/h2>/); assert.doesNotMatch(ct, /Zeitzone|time zone|lp-tz/);
    assert.match(ct, /<div class="lp-frame lp-tilt lp-ct" id="lp-ct">\s*<div class="lp-ct-list">\s*<label class="lp-ct-search"><svg class="lp-ic lp-ic-sm"><use href="#lp-i-search"\/><\/svg><input type="search" id="lp-ct-q" autocomplete="off" data-i18n-ph="lp_ct_search_ph" placeholder="[^"]+"><\/label>\s*<ul id="lp-ct-rows" role="listbox" data-i18n-aria="lp_ct_list" aria-label="[^"]+"><\/ul>\s*<p class="lp-ct-none hidden" id="lp-ct-none" data-i18n="lp_ct_none">/);
    assert.deepEqual([...ct.matchAll(/<button type="button" class="lp-ct-act" data-act="(\w+)" aria-pressed="false"><svg class="lp-ic lp-ic-sm"><use href="#(lp-i-\w+)"\/><\/svg><span data-i18n="(lp_ct_\w+)">/g)].map(m => [m[1], m[2], m[3]]),
      [['call', 'lp-i-phone', 'lp_ct_call'], ['mail', 'lp-i-mail', 'lp_ct_mail'], ['wa', 'lp-i-message', 'lp_ct_wa']], 'the three ways to reach a contact, as the contact page has them');
    assert.match(ct, /<div class="lp-ct-bubble hidden" id="lp-ct-bubble"><small id="lp-ct-bubble-label"><\/small><p id="lp-ct-bubble-text"><\/p><\/div>/);
    for (const id of ['lp-ct-card', 'lp-ct-av', 'lp-ct-name', 'lp-ct-company', 'lp-ct-deals', 'lp-ct-hist']) assert.ok(ct.includes(`id="${id}"`), id);
    assert.match(ct, /<p class="lp-label" data-i18n="lp_ct_deals">[\s\S]*<p class="lp-label" data-i18n="lp_ct_history">/);
    assert.doesNotMatch(ct, /<pre|<code|\{|\}|href="tel:|href="mailto:/, 'no code; the pills demonstrate, they do not dial a demo number');
    assert.match(html, /<symbol id="lp-i-search" viewBox="0 0 24 24">/);
    assert.equal(contacts.length, 5);
    for (const c of contacts) { assert.ok(c.name && c.phone && c.email && Array.isArray(c.deals) && c.deals.length >= 1 && c.history.length === 2, c.name); for (const hh of c.history) { assert.ok(['note', 'call', 'email', 'wa'].includes(hh.type), hh.type); assert.ok(dict.de[hh.key] && dict.en[hh.key], hh.key); assert.ok(hh.day >= 1 && hh.day <= 7 && /^\d\d:\d\d$/.test(hh.time)); } for (const d of c.deals) assert.ok(/^lp_col_/.test(d.stage), d.stage); }
    assert.equal(new Set(contacts.map(c => c.name)).size, 5, 'five different people');
    assert.ok(contacts.some(c => c.company === 'Notariat Feld & Kollegen'), 'the notary from the record is a contact too');
    const n = section('numbers');
    const periods = [...n.matchAll(/class="lp-period-btn" data-period="(\d+)" aria-pressed="(true|false)"/g)];
    assert.deepEqual(periods.map(p => Number(p[1])), Object.keys(analytics).map(Number));
    assert.deepEqual(periods.filter(p => p[2] === 'true').map(p => p[1]), ['6']);
    for (const id of ['lp-an-open', 'lp-an-won', 'lp-an-rate', 'lp-an-new', 'lp-an-line', 'lp-an-tip', 'lp-an-funnel']) assert.ok(n.includes(`id="${id}"`), id);
    for (const [p, a] of Object.entries(analytics)) { assert.equal(a.rates.length, Number(p)); assert.equal(a.funnel.length, 4); }
    const e = section('engine');
    assert.match(e, /<div class="lp-node" id="lp-en-from">\s*<p class="lp-target-name"><img src="\/images\/logo\.png" alt="Upgrads"><\/p>\s*<div class="lp-deal-mini">\s*<b>Elbstraße 12, 3 Zimmer<\/b>\s*<span class="lp-stagepill" id="lp-en-stage" data-i18n="lp_col_nego">/);
    assert.match(e, /<div class="lp-link">\s*<i class="lp-link-line" aria-hidden="true"><\/i>\s*<p class="lp-en-state"><i><\/i><span id="lp-en-state"><\/span><\/p>\s*<\/div>/);
    assert.match(e, /<div class="lp-node lp-node-to" id="lp-en-to">\s*<p class="lp-node-name" data-i18n="lp_en_to">[\s\S]*<p class="lp-receipt" id="lp-en-receipt"><svg class="lp-ic lp-ic-sm"><use href="#lp-i-check"\/><\/svg><span data-i18n="lp_en_received">/);
    assert.match(e, /<span class="lp-packet hidden" id="lp-en-packet" aria-hidden="true"><\/span>/);
    assert.match(e, /<button type="button" class="lp-pill" id="lp-en-send">/);
    assert.doesNotMatch(e, /<pre|<code|sha256|HMAC|X-Upgrads|\{|\}|curl/, 'no code, no headers, no signature on the page');
    assert.match(engine, /function buildContractSignedPayload/, 'the real transfer still lives in utils/engine.js');
    assert.match(e, /<p class="lp-cap" data-i18n="lp_en_cap">/);
  });
});

describe('landing.js: pure functions', () => {
  const F = loadFns('public/js/landing.js', ['lpT', 'lpFmtEur', 'lpFmtEurShort', 'lpBoardStats', 'lpEase', 'lpTiltFor', 'lpGetPath', 'lpMapLead'], { state: { lpLang: 'de' }, extra: sliceConst('public/js/landing.js', 'LP_I18N') });
  test('lpT: current language, then English, then the key; placeholders filled', () => {
    assert.equal(F.lpT('lp_login'), 'Anmelden');
    assert.equal(F.lpT('lp_toast_moved', { stage: 'Gewonnen' }), 'Verschoben nach Gewonnen');
    F.__set('lpLang', 'xx');
    assert.equal(F.lpT('lp_login'), 'Log in');
    assert.equal(F.lpT('lp_nope'), 'lp_nope');
    F.__set('lpLang', 'de');
  });
  test('money as the Deals page formats it; the demo ease is symmetric', () => {
    assert.equal(F.lpFmtEur(485000), '485.000 €');
    assert.equal(F.lpFmtEurShort(1840000), '1,84 M €');
    assert.equal(F.lpFmtEurShort(62500), '63 k €');
    assert.equal(F.lpFmtEurShort(900), '900 €');
    assert.equal(F.lpEase(0), 0); assert.equal(F.lpEase(1), 1); assert.equal(F.lpEase(0.5), 0.5);
    assert.deepEqual(F.lpTiltFor(50, 50, 100, 100, 3), { rx: -0, ry: 0 }); assert.deepEqual(F.lpTiltFor(100, 0, 100, 100, 3), { rx: 3, ry: 3 }); assert.deepEqual(F.lpTiltFor(0, 100, 100, 100, 3), { rx: -3, ry: -3 });
  });
  test('board stats: open and won sums, counts and the won share', () => {
    assert.deepEqual(F.lpBoardStats([{ value: 100, won: false }, { value: 300, won: false }, { value: 600, won: true }]), { open: 400, won: 600, openN: 2, wonN: 1, total: 3, rate: 33 });
    assert.equal(F.lpBoardStats([]).rate, 0);
  });
  test('dot paths and the lead mapping behave like the inbound webhook; every preset yields a contact', () => {
    const p = { full_name: 'Jana', contact: { email: 'j@x.de', phone: '' }, n: 0 };
    assert.equal(F.lpGetPath(p, 'contact.email'), 'j@x.de'); assert.equal(F.lpGetPath(p, 'n'), 0);
    assert.equal(F.lpGetPath(p, 'contact.street'), undefined); assert.equal(F.lpGetPath(p, 'full_name.first'), undefined); assert.equal(F.lpGetPath(p, ''), undefined);
    assert.deepEqual(F.lpMapLead(p, { name: 'full_name', email: 'contact.email', phone: 'contact.phone', company: 'company' }), { ok: true, fields: { name: 'Jana', email: 'j@x.de' }, missing: ['contact.phone', 'company'] });
    assert.equal(F.lpMapLead({ foo: 1 }, { name: 'name', email: 'email' }).ok, false);
    for (const pr of presets) { const m = F.lpMapLead(pr.payload, pr.map); assert.ok(m.ok && m.fields.name && m.fields.email, pr.name); }
  });
});

describe('landing.js: behaviour hooks', () => {
  test('the board demonstrates itself once when 60 % in view, hands over on any pointer or key, drags with pointer events and a placeholder, moves with the arrow keys, never uses HTML5 drag', () => {
    const b = sliceFn(js, 'lpInitBoard', 'landing.js');
    assert.match(b, /new IntersectionObserver\([\s\S]*io\.disconnect\(\); runDemo\(\)/); assert.match(b, /threshold: 0\.6/);
    assert.match(b, /function runDemo\(\) \{\s*if \(!hero \|\| !cursor \|\| reduce\) return;/);
    assert.match(b, /hero\.classList\.add\('is-lifted'\)/); assert.match(b, /lpEase\(t\)/);
    assert.match(b, /place\(hero, won, won\.querySelector\('\.lp-col-cards'\)\.firstElementChild, \{ quiet: true \}\)/);
    assert.equal(count(b, 'stopDemo();'), 4);
    assert.match(b, /lp-demo-replay/); assert.match(b, /function resetBoard\(\)/);
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) assert.ok(b.includes(`'${ev}'`), ev);
    assert.match(b, /setPointerCapture/); assert.match(b, /elementFromPoint/); assert.match(b, /lp-card-ph/); assert.match(b, /ArrowLeft/); assert.match(b, /ArrowRight/);
    assert.match(b, /dataset\.stage === 'won'/); assert.match(b, /deliver\(\)/); assert.match(b, /lp_toast_moved/); assert.match(b, /lpBoardStats\(/); assert.match(b, /lpFlip\(card/);
    assert.doesNotMatch(js, /dragstart|draggable|dataTransfer/);
    assert.match(css, /\.lp-card \{[^}]*touch-action: none/);
    assert.match(css, /\.lp-card\.is-dragging \{[^}]*position: fixed[^}]*pointer-events: none/);
    assert.match(css, /\.lp-demo-cursor \{ position: absolute;[^}]*pointer-events: none/);
  });
  test('statements rise once as they enter and stay; reduced motion shows everything at once; the bar gains its line after a small scroll', () => {
    const r = sliceFn(js, 'lpInitReveal', 'landing.js');
    assert.match(r, /prefers-reduced-motion: reduce/); assert.match(r, /IntersectionObserver/); assert.match(r, /unobserve/); assert.match(r, /threshold: 0\.2/);
    assert.ok(count(body, 'lp-reveal') >= 14, 'heads and frames reveal');
    assert.match(css, /\.lp-reveal \{ opacity: 0; transform: translateY\(18px\); transition: opacity \.8s/);
    assert.match(css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)')), /\.lp-reveal \{ opacity: 1; transform: none; transition: none; \}/);
    const nv = sliceFn(js, 'lpInitNav', 'landing.js');
    assert.match(nv, /addEventListener\('scroll', onScroll, \{ passive: true \}\)/); assert.match(nv, /is-scrolled/);
    assert.ok(count(js, 'new IntersectionObserver(') >= 2);
  });
  test('leads cycle the presets through lpMapLead with text nodes; the record tabs follow the WAI pattern; contacts, numbers and engine behave', () => {
    const l = sliceFn(js, 'lpInitLeads', 'landing.js');
    assert.match(l, /LP_LEAD_PRESETS\[i % LP_LEAD_PRESETS\.length\]/); assert.match(l, /lpMapLead\(preset\.payload, preset\.map\)/); assert.doesNotMatch(l, /innerHTML/);
    const rec = sliceFn(js, 'lpInitRecord', 'landing.js');
    assert.match(rec, /aria-selected/); assert.match(rec, /tabIndex = on \? 0 : -1/); assert.match(rec, /e\.ctrlKey \|\| e\.metaKey\) && e\.key === 'Enter'/);
    const ct = sliceFn(js, 'lpInitContacts', 'landing.js');
    assert.match(ct, /c\.name\.toLowerCase\(\)\.includes\(n\) \|\| c\.company\.toLowerCase\(\)\.includes\(n\)/, 'search on name and company, as the table does');
    assert.match(ct, /none\?\.classList\.toggle\('hidden', hits\.length > 0\)/); assert.match(ct, /li\.setAttribute\('role', 'option'\)/); assert.match(ct, /e\.key === 'Enter' \|\| e\.key === ' '/, 'rows are keyboard-pickable');
    assert.match(ct, /lpT\('lp_ct_tpl', \{ name: c\.name, deal: c\.deals\[0\]\?\.title \|\| '' \}\)/, 'the WhatsApp template is filled in with the name and the deal, as the contact page does');
    assert.match(ct, /act === 'call' \? c\.phone : act === 'mail' \? c\.email :/); assert.match(ct, /act = act === b\.dataset\.act \? null : b\.dataset\.act/, 'a pill toggles its bubble');
    assert.match(ct, /lpT\('lp_wd' \+ hh\.day\) \+ ' ' \+ hh\.time/, 'times follow the language'); assert.match(ct, /lpRerender\.push/); assert.doesNotMatch(ct, /innerHTML|fetch\(/);
    const an = sliceFn(js, 'lpInitAnalytics', 'landing.js');
    assert.match(an, /addEventListener\('pointermove'/); assert.match(an, /lp_an_tip/);
    assert.match(l, /lpFly\(packet, frame, src, target, 900\)/, 'the lead flies from its source into Upgrads'); assert.match(l, /sources\.forEach\(\(el, k\) => el\.addEventListener\('click'/, 'clicking a source sends from it');
    assert.match(l, /el\.classList\.toggle\('is-on', el === src\)/);
    const e = sliceFn(js, 'lpInitEngine', 'landing.js');
    assert.match(e, /lpFly\(packet, frame, from, to, 1100\)/, 'the packet travels from our system to the next');
    assert.match(e, /frame\?\.classList\.add\('is-pending'\)/); assert.match(e, /frame\?\.classList\.add\('is-done'\)/); assert.match(e, /receipt\?\.classList\.add\('is-in'\)/);
    assert.match(e, /lpT\(phase === 'idle' \? 'lp_col_nego' : 'lp_col_won'\)/, 'the deal visibly moves to Won');
    assert.doesNotMatch(e, /sign|sha256|HMAC|JSON\.stringify|X-Upgrads/i, 'no signing in the page script');
    const fly = sliceFn(js, 'lpFly', 'landing.js');
    assert.match(fly, /getBoundingClientRect/); assert.match(fly, /packet\.animate\(/); assert.match(fly, /prefers-reduced-motion: reduce/); assert.match(fly, /fill: 'forwards'/);
  });
  test('the effects: one passive, frame-throttled pointermove writes the glow, the tilt (never on the board) and the spotlights; figures count up once in view and on a period change; the Won column flashes on delivery; nothing runs on coarse pointers or under reduced motion', () => {
    const fx = sliceFn(js, 'lpInitFx', 'landing.js');
    assert.match(fx, /if \(reduce \|\| coarse\) return;/);
    assert.match(fx, /addEventListener\('pointermove', e => \{ pending = e; if \(!raf\) raf = requestAnimationFrame\(apply\); \}, \{ passive: true \}\)/);
    assert.match(fx, /querySelectorAll\('\.lp-tilt'\)/); assert.doesNotMatch(fx, /lp-grid/);
    assert.match(fx, /setProperty\('--mx'/); assert.match(fx, /setProperty\('--sx'/); assert.match(fx, /perspective\(1400px\) rotateX/);
    assert.match(fx, /lpTiltFor\(e\.clientX - r\.left, e\.clientY - r\.top, r\.width, r\.height, 3\)/, 'three degrees at most');
    const b = sliceFn(js, 'lpInitBoard', 'landing.js');
    assert.match(b, /wonCol\.classList\.add\('is-flash'\)/);
    const an = sliceFn(js, 'lpInitAnalytics', 'landing.js');
    assert.match(an, /lpCountUp\(el, value, fmt, 900\)/); assert.match(an, /animateNext = true; render\(\)/); assert.match(an, /threshold: 0\.4/);
    assert.equal(count(js, 'new IntersectionObserver('), 3, 'reveal, the board start, the figures');
    const wk = sliceFn(js, 'lpInitWork', 'landing.js');
    assert.match(wk, /chipFor\(row\.dataset\.task\)\?\.classList\.toggle\('is-done', cb\.checked\)/, 'ticking a task ticks its calendar entry');
    assert.match(wk, /\.lp-cal-day\[data-day="4"\] \.lp-cal-items/, 'a new task lands on Thursday'); assert.match(wk, /due\.dataset\.i18n = 'lp_w_new_due'/);
    assert.match(wk, /list\.querySelector\('\.lp-check'\)\?\.cloneNode\(true\)/, 'the new row reuses the record\'s check');
    assert.match(wk, /post\('M', '', 'Mara Kühn', text\)/); assert.match(wk, /post\('T', 'lp-av-t', 'Tim Berger', '', 'lp_msg_reply'\)/);
    assert.match(wk, /online\?\.classList\.add\('is-live'\)/); assert.match(wk, /e\.preventDefault\(\)/); assert.match(wk, /msgs\.scrollTop = msgs\.scrollHeight/);
    assert.match(wk, /lpT\('lp_tasks_progress', \{ d: done, n: rows\.length \}\)/, 'the record\'s progress line'); assert.match(wk, /count\.textContent = String\(rows\.length - done\)/);
    assert.match(wk, /lpT\('lp_wk_typing', \{ name: 'Tim Berger' \}\)/); assert.match(wk, /typing\?\.classList\.toggle\('hidden', reduce\)/, 'no typing dots under reduced motion'); assert.match(wk, /reduce \? 0 : 1400/);
    assert.match(wk, /at\.textContent = '10:00'/, 'the new chip carries its time');
    assert.doesNotMatch(wk, /innerHTML|fetch\(|socket/);
  });
  test('all helpers are top-level function declarations; no wall, no stage, no API calls, no eval, no innerHTML', () => {
    for (const f of ['lpT', 'lpApplyLang', 'lpSetLang', 'lpInitNav', 'lpInitReveal', 'lpTiltFor', 'lpInitFx', 'lpCountUp', 'lpFmtEur', 'lpFmtEurShort', 'lpBoardStats', 'lpFlip', 'lpEase', 'lpInitBoard', 'lpInitRecord', 'lpGetPath', 'lpMapLead', 'lpInitLeads', 'lpInitContacts', 'lpInitAnalytics', 'lpFly', 'lpInitEngine', 'lpInitWork', 'lpInit']) assert.match(js, new RegExp(`^function ${f}\\(`, 'm'), f);
    assert.doesNotMatch(js, /lpSign|lpHex|lpTypeInto|lpEnginePayload|crypto\.subtle/, 'the signing demo is gone');
    assert.doesNotMatch(js, /lpInitWall|lpInitIndex|lpInitStage|getContext\(|fetch\(|\/api\/|\bapi\.(get|post|patch)\(|\beval\(|innerHTML/);
    assert.match(js, /document\.addEventListener\('DOMContentLoaded', lpInit\)/);
  });
});

describe('landing.css', () => {
  test('own file, lp- prefixed and scoped, tokens only, three breakpoints widest first, a reduced-motion block, gradients only for the effects', () => {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colours');
    const selectors = [...css.matchAll(/^([.#\[:a-z][^{\n]*?)\s*\{/gm)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
    assert.ok(selectors.length > 120, `selectors: ${selectors.length}`);
    for (const s of selectors) for (const part of s.split(',')) assert.match(part.trim(), /^(\.lp-|#lp-|body\.lp|:where\(body\.lp\) h[1-6]|from|to|\d+%)/, part);
    const idx = ['1100px', '860px', '600px'].map(w => css.indexOf(`@media (max-width: ${w})`));
    assert.ok(idx.every(i => i > 0)); assert.deepEqual([...idx].sort((a, b) => a - b), idx);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(css, /!important|\[data-theme|text-transform: uppercase/);
    assert.equal((css.match(/gradient\(/g) || []).length, 5, 'gradients only for the effects: the hero glow (two), the headline fill, the frame sheen, the streaming link');
    const defined = new Set([...style.matchAll(/(--[\w-]+)\s*:/g), ...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    const script = new Set(['--mx', '--my', '--sx', '--sy']);
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(m[1]) || script.has(m[1]), `${m[1]} resolves`);
    for (const v of script) assert.match(js, new RegExp(`setProperty\\('${v}'`), `${v} is written by the script`);
  });
  test('the display face is Manrope, self-hosted with its licence, variable in weight; Inter stays inside the frames', () => {
    assert.match(css, /@font-face \{ font-family: "Manrope"; font-style: normal; font-weight: 200 800; font-display: swap; src: url\(\/fonts\/Manrope\.woff2\) format\("woff2"\); \}/);
    assert.match(css, /--lp-display: "Manrope", var\(--font\)/);
    assert.equal((css.match(/@font-face/g) || []).length, 1);
    assert.doesNotMatch(css.replace(/url\("data:[^"]*"\)/g, ''), /https?:\/\//);
    const bytes = fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'Manrope.woff2'));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2'); assert.ok(bytes.length > 15000 && bytes.length < 400000, `sane size: ${bytes.length}`);
    assert.match(fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'OFL-Manrope.txt'), 'utf8'), /SIL Open Font License, Version 1\.1/);
    assert.ok(!fs.existsSync(path.join(ROOT, 'public', 'fonts', 'BricolageGrotesque.woff2')), 'the unused face is gone');
    assert.match(css, /\.lp-frame \{[^}]*font-family: var\(--font\)/, 'the frames speak Inter, the page Manrope');
    assert.match(css, /\.lp-pill \{[^}]*font-family: var\(--lp-display\)/);
    assert.doesNotMatch(html, /Schibsted|Bricolage/);
  });
  test('the launch-page grammar: a translucent bar with blur, statements huge and tight, a rounded frame with a deep shadow, pills fully round with a glow, the ground in the system\'s deepest navy', () => {
    assert.match(css, /\.lp-nav \{ position: sticky; top: 0; z-index: 50; height: 52px; background: rgba\(10, 23, 41, \.6\);[^}]*backdrop-filter: saturate\(180%\) blur\(20px\)/);
    assert.match(css, /\.lp-pill \{[^}]*box-shadow: 0 12px 32px -12px var\(--lp-glow\);/); assert.match(css, /\.lp-pill:hover \{[^}]*transform: translateY\(-1px\) scale\(1\.03\)/);
    assert.match(css, /\.lp-hero-title \{ font-size: clamp\(52px, 8vw, 112px\); line-height: \.98; letter-spacing: -\.04em; font-weight: 800/);
    assert.match(css, /:where\(body\.lp\) h2 \{ font-size: clamp\(40px, 5\.2vw, 72px\)/);
    assert.match(css, /\.lp-frame \{ position: relative; text-align: left;[^}]*border-radius: 22px; box-shadow: 0 40px 100px -30px rgba\(0, 0, 0, \.7\)/);
    assert.match(css, /\.lp-pill \{[^}]*border-radius: 999px/);
    assert.match(css, /\.lp-hero-title \{[^}]*-webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;/, 'the statement carries a white-to-sky fill');
    assert.match(css, /\.lp-kicker \{ display: inline-flex; align-items: center; gap: 16px;/); assert.match(css, /\.lp-kicker-mark \{ height: clamp\(34px, 4vw, 46px\); width: auto;/); assert.match(css, /\.lp-kicker-crm \{ font-family: var\(--lp-display\); font-size: clamp\(22px, 2\.6vw, 30px\); font-weight: 300; letter-spacing: \.24em;[^}]*border-left: 1px solid/, 'the lockup: wordmark, hairline, CRM light and tracked');
    assert.doesNotMatch(css, /filter: (brightness|invert|grayscale)/, 'the Upgrads logo keeps its grey and sky arrow in the bar, the footer and the flow nodes; never recoloured');
    assert.match(css, /\.lp-target-name img \{ height: 26px; width: auto; display: block; margin-bottom: 14px; \}/);
    assert.match(css, /\.lp-toast \{ position: absolute/); assert.match(css, /\.lp-demo-cursor \{ position: absolute/);
    assert.doesNotMatch(css, /^body\.lp h[1-6]\b/m); assert.doesNotMatch(css, /> \* \{[^}]*position/);
  });
  test('the effects: the glow follows CSS variables, tilting frames keep 3D and a sheen, tiles get a spotlight, the Won column flashes; reduced motion stops all of it', () => {
    assert.match(css, /\.lp-glow \{ position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient\(640px circle at var\(--mx, 50%\) var\(--my, 28%\)/);
    assert.match(css, /\.lp-glow::after \{[^}]*animation: lp-drift 18s/);
    assert.match(css, /\.lp-tilt \{ transform-style: preserve-3d; transition: transform \.18s/);
    assert.match(css, /\.lp-tilt::after \{[^}]*radial-gradient\(520px circle at var\(--sx, 50%\) var\(--sy, 50%\)/);
    assert.match(css, /\.lp-work \{ display: grid; grid-template-columns: minmax\(0, 1\.25fr\) minmax\(0, 1fr\); \}/, 'tasks and week left, the room right');
    assert.match(css, /\.lp-ct \{ display: grid; grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\); \}/, 'the list left, the card right'); assert.match(css, /\.lp-ct-act\[aria-pressed="true"\] \{ background: var\(--n-0\);/); assert.match(css, /\.lp-ct-bubble \{[^}]*animation: lp-pop/);
    assert.doesNotMatch(css, /lp-tz|lp-stage-tight/, 'the clocks are gone');
    assert.match(css, /\.lp-cal \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/); assert.match(css, /\.lp-cal-day\.is-today \{ border-color: var\(--sky-400\); background: var\(--accent-subtle\); \}/);
    assert.match(css, /\.lp-cal-chip\.is-done \{ opacity: \.5; \}\n\.lp-cal-chip\.is-done span \{ text-decoration: line-through; \}/); assert.match(css, /\.lp-cal-day\.is-today \{ border-color: var\(--sky-400\); background: var\(--accent-subtle\); \}/); assert.match(css, /\.lp-typing i \{[^}]*animation: lp-blink/); assert.match(css, /\.lp-task\.is-done \.lp-task-title \{ color: var\(--ink-muted\); text-decoration: line-through; \}/, 'done looks the same in the list and on the day');
    assert.match(css, /\.lp-msg \{ display: grid; grid-template-columns: 32px minmax\(0, 1fr\);/); assert.match(css, /\.lp-online\.is-live \.lp-online-dot \{ animation: lp-pulse/);
    assert.doesNotMatch(css, /\.lp-grid li|lp-span-|lp-big/, 'no tile kit left');
    const bp = css.slice(css.indexOf('@media (max-width: 860px)'));
    assert.match(bp, /\.lp-work, \.lp-ct \{ grid-template-columns: 1fr; \}/); assert.match(bp, /\.lp-ct-list ul \{ flex-direction: row; overflow-x: auto;/, 'on a phone the list becomes a row to swipe'); assert.match(bp, /\.lp-cal-chip \{ height: 8px; padding: 0; \}\n\s*\.lp-cal-chip time, \.lp-cal-chip span \{ display: none; \}/, 'on a phone the week shows bars, not words');
    assert.match(css, /\.lp-col\.is-flash \{ animation: lp-flash/);
    assert.deepEqual([...css.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]), ['lp-fade', 'lp-pulse', 'lp-flash', 'lp-drift', 'lp-hit', 'lp-stream', 'lp-pop', 'lp-blink']);
    assert.match(css, /\.lp-packet \{ position: absolute; left: 0; top: 0; z-index: 8;[^}]*pointer-events: none; \}/, 'the packet is positioned by the script, never in the way');
    assert.match(css, /\.lp-flow-engine\.is-pending \.lp-link-line \{ opacity: 1; animation: lp-stream/); assert.match(css, /\.lp-target\.is-hit \{ animation: lp-hit/);
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(rm, /\.lp-glow::after, \.lp-col\.is-flash, \.lp-task\.is-new, \.lp-cal-chip\.is-new, \.lp-msg\.is-new, \.lp-online\.is-live \.lp-online-dot, \.lp-typing i \{ animation: none; \}/); assert.match(rm, /\.lp-tilt, \.lp-pill, \.lp-chat-btn \{ transition: none; \}/); assert.match(rm, /\.lp-ct-bubble \{ animation: none; \}/); assert.match(rm, /\.lp-target\.is-hit, \.lp-flow-engine\.is-pending \.lp-link-line \{ animation: none; \}/);
  });
  test('the stylesheet parses; the app stylesheet is untouched', () => {
    let depth = 0, inC = false;
    for (let i = 0; i < css.length; i++) {
      if (inC) { if (css[i] === '*' && css[i + 1] === '/') { inC = false; i++; } continue; }
      if (css[i] === '/' && css[i + 1] === '*') { inC = true; i++; continue; }
      if (css[i] === '{') depth++; if (css[i] === '}') depth--;
      assert.ok(depth >= 0, `"}" with nothing open at ${i}`);
    }
    assert.equal(depth, 0); assert.equal(inC, false);
    assert.doesNotMatch(style, /\.lp-/);
  });
});
