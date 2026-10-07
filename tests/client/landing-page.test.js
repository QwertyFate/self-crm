// CLIENT (static + pure-function) tests for the public landing page at
// /landingpage (2026-10-07, the split page): the login's two-tone split as the
// page, a navy panel that stays in view (headline, two calls to action, an
// index of six parts, the louvre wall without a wordmark) and on the right one
// white screen per part with a short title, one line and one working piece:
// the board (a visible cursor drags the deal into Won once, then drag and
// drop), leads (one button, three real payload shapes through the webhook's
// own mapping), the deal record's tabs, the two clocks, three periods of
// figures, and the vertrag.unterschrieben event signed with HMAC-SHA256 as
// utils/engine.js signs it. The route, the CSP-safe document, German-first
// copy equal to the dictionary key for key, a hard cap on words, and the
// claims audit. Pure functions are sliced out of public/js/landing.js and run
// in a sandbox; the signing is checked against Node's own HMAC.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const server = read('server.js');
const html   = read('public/landingpage.html');
const css    = read('public/landing.css');
const js     = read('public/js/landing.js');
const style  = read('public/style.css');
const engine = read('utils/engine.js');
const login  = read('public/js/login-wall.js');
const dict      = new Function(sliceConst('public/js/landing.js', 'LP_I18N').replace(/^[^{]*/, 'return '))();
const presets   = new Function(sliceConst('public/js/landing.js', 'LP_LEAD_PRESETS').replace(/^[^[]*/, 'return '))();
const analytics = new Function(sliceConst('public/js/landing.js', 'LP_ANALYTICS').replace(/^[^{]*/, 'return '))();
const count  = (src, needle) => src.split(needle).length - 1;
const body   = html.slice(html.indexOf('<body'));
const unesc  = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const screen = id => { const s = html.indexOf(`<section id="${id}"`); let e = html.indexOf('\n    <section id="', s + 1); if (e < 0) e = html.indexOf('</main>'); return html.slice(s, e); };
const panel  = html.slice(html.indexOf('<aside class="lp-panel">'), html.indexOf('</aside>'));
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
  test('standalone head: light theme, viewport, title, description, the app stylesheet then its own, both fonts preloaded, no scripts in the head', () => {
    assert.match(html, /^<html lang="de" data-theme="">/m);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
    assert.match(html, /<meta name="color-scheme" content="light">/);
    assert.match(html, /<title>Upgrads CRM<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{60,}">/);
    assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]), ['/style.css', '/landing.css']);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /<link rel="preload" href="\/fonts\/BricolageGrotesque\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.match(head, /<link rel="preload" href="\/fonts\/inter-latin-wght\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.doesNotMatch(head, /<script>/);
    assert.doesNotMatch(js, /localStorage\.(get|set)Item\('theme'/, 'the page has one theme, the product\'s light one');
  });
  test('nothing the production policy would block: no external hosts, no iframes, one own script and one canvas, no inline styles, no hidden attribute', () => {
    assert.doesNotMatch(html, /https?:\/\//, 'no external hosts in the markup');
    assert.doesNotMatch(html, /<iframe/);
    assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['/js/landing.js']);
    assert.equal(count(body, '<canvas class="lp-wall" aria-hidden="true"></canvas>'), 1);
    assert.deepEqual([...html.matchAll(/ style="[^"]*"/g)].map(m => m[0]), [], 'no inline styles');
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(/^(\/|#|mailto:)/.test(m[1]), `absolute, anchor or mailto: ${m[1]}`);
    assert.doesNotMatch(body, /<[a-z]+[^>]*\shidden(?=[\s>])/, 'hidden things use the .hidden class, not the attribute');
    assert.ok(count(body, 'class="lp-toast hidden"') === 1 && count(body, 'class="lp-pan hidden"') === 4 && count(body, 'class="lp-demo-cursor hidden"') === 1);
  });
  test('the split: a panel with the wall, the headline, two calls to action and an index of six; a main with the language switch and a login link', () => {
    assert.match(html, /<div class="lp-split">\s*<!--[^>]*-->\s*<aside class="lp-panel">\s*<canvas class="lp-wall"[\s\S]*<span class="lp-scrim"[\s\S]*<a class="lp-brand" href="\/"><img src="\/images\/logo\.png" alt="Upgrads"><\/a>/);
    assert.match(panel, /<h1 class="lp-hero-title" data-i18n="lp_hero_title">/);
    assert.match(panel, /<p class="lp-hero-sub" data-i18n="lp_hero_sub">/);
    assert.match(panel, /<a class="lp-btn lp-btn-sky lp-request" href="mailto:hello@upgrads\.de\?subject=[^"]+" data-i18n="lp_request">[\s\S]*<a class="lp-btn lp-btn-ghost" href="\/" data-i18n="lp_login">/);
    assert.deepEqual([...panel.matchAll(/<a href="#(\w+)" data-i18n="(lp_ix_\w+)">/g)].map(m => [m[1], m[2]]), [['board', 'lp_ix_board'], ['leads', 'lp_ix_leads'], ['deal', 'lp_ix_deal'], ['team', 'lp_ix_team'], ['numbers', 'lp_ix_numbers'], ['engine', 'lp_ix_engine']]);
    assert.match(html, /<main class="lp-main">\s*<div class="lp-topbar">[\s\S]*class="lp-lang-btn" data-lang="de" aria-pressed="true"[\s\S]*class="lp-lang-btn" data-lang="en" aria-pressed="false"[\s\S]*<a class="lp-top-link" href="\/" data-i18n="lp_login">/);
    assert.equal(count(html, 'lp-request"'), 2, 'request access in the panel and the closing');
    assert.doesNotMatch(html, /href="\/\?admin"/);
  });
  test('seven screens in order, each with one title and one line; every anchor resolves; no chapter kit, no weekdays as structure', () => {
    const ids = [...html.matchAll(/<section id="(\w+)" class="lp-screen[^"]*">/g)].map(m => m[1]);
    assert.deepEqual(ids, ['board', 'leads', 'deal', 'team', 'numbers', 'engine', 'close']);
    const all = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    for (const a of [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1])) assert.ok(all.has(a), `#${a} resolves`);
    for (const id of ids.slice(0, 6)) {
      const s = screen(id);
      assert.equal((s.match(/<h2 /g) || []).length, 1, `${id}: one title`);
      assert.equal((s.match(/<p class="lp-line"/g) || []).length, 1, `${id}: one line`);
      assert.equal((s.match(/<div class="lp-piece[ "]/g) || []).length, 1, `${id}: one piece`);
    }
    assert.doesNotMatch(body, /lp-eyebrow|lp-reveal|lp-ch\b|lp-ch-time|lp-stage\b|lp-scene|lp-inst\b|lp-notes|lp-passage/);
    assert.doesNotMatch(body, />(Montag|Dienstag|Mittwoch|Donnerstag|Freitag)(, \d\d:\d\d)?</);
    assert.doesNotMatch(css, /text-transform: uppercase/, 'no all-caps labels');
    assert.doesNotMatch(css, /backdrop-filter|!important|\[data-theme/);
    assert.equal((css.match(/gradient\(/g) || []).length, 1, 'one gradient: the panel scrim, as on the login');
  });
  test('the closing: two buttons, four facts, three questions, a one-line footer', () => {
    const c = screen('close');
    assert.match(c, /<a class="lp-btn lp-btn-primary lp-request"[^>]*data-i18n="lp_request">[\s\S]*<a class="lp-btn" href="\/" data-i18n="lp_login">/);
    assert.equal(count(c, '<li data-i18n="lp_fact'), 4);
    assert.equal(count(c, '<details class="lp-faq-item">'), 3);
    assert.match(c, /<footer class="lp-footer"><p data-i18n="lp_foot_tag">/);
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
    assert.ok(n >= 110, `checked ${n} strings`);
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
    const dynamic = k => /^lp_f_(name|email|phone|company)$/.test(k) && logic.includes("lpT('lp_f_' + f)");   // the lead card builds these keys
    assert.deepEqual(Object.keys(dict.de).filter(k => !used.has(k) && !logic.includes(`'${k}'`) && !dynamic(k) && k !== 'lp_request_subject'), [], 'no dead keys');
  });
  test('short: every value at most 100 characters, titles at most 5 words, lines at most 14 words; under 600 German words on the whole page', () => {
    for (const [lang, d] of Object.entries(dict)) for (const [k, v] of Object.entries(d)) {
      assert.ok(v.length <= 100, `${lang}.${k} is ${v.length} chars`);
      if (/^lp_s\d_t$/.test(k)) assert.ok(v.split(/\s+/).length <= 5, `${lang}.${k} title: ${v}`);
      if (/^lp_s\d_d$/.test(k)) assert.ok(v.split(/\s+/).length <= 14, `${lang}.${k} line: ${v}`);
    }
    assert.ok(dict.de.lp_hero_title.split(/\s+/).length <= 10 && dict.en.lp_hero_title.split(/\s+/).length <= 10, 'headline is ten words or fewer');
    const words = [...body.matchAll(/>([^<]+)</g)].map(m => m[1].trim()).filter(Boolean).join(' ').split(/\s+/).length;
    assert.ok(words < 600, `German words on the page: ${words}`);
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
      assert.doesNotMatch(all, /Facebook|Lead Ads|ImmoScout|Immowelt|HubSpot|Salesforce/i, `${lang}: no adapters we do not have`);
      assert.doesNotMatch(all, /attach|Anhang|anhäng/i, `${lang}: no attachments in the UI`);
      assert.doesNotMatch(all, /\bchannels?\b|\bKanäle\b|\bDMs?\b|Direktnachricht|thread/i, `${lang}: chat is one room`);
      assert.doesNotMatch(all, /\bSSO\b|single sign|\bAI\b|\bKI\b|mobile[- ]app|email sync|E-Mail-Sync|Kalender-Sync|calendar sync|iCal|Outlook/i, `${lang}: not built`);
      assert.doesNotMatch(all, /Kommentar|comment|@Name|Erwähnung|mention picker/i, `${lang}: no comment or mention UI`);
      assert.doesNotMatch(all, /kostenlos|free trial|Testphase|\bPreis(e|liste)?\b|pricing|\$/i, `${lang}: no pricing or trial claims`);
      assert.doesNotMatch(all, /\b\d+\+? (companies|teams|customers|agencies|users|Unternehmen|Teams|Kunden|Makler|Nutzer)\b/i, 'no made-up customer counts');
      assert.doesNotMatch(all, /→|·|—|\*\*/, 'no arrows, middle dots, em dashes or markdown');
      assert.doesNotMatch(all, /\b[A-Z]{5,}\b/, 'no shouting labels');
    }
    const en = Object.values(dict.en).join('\n');
    for (const word of ['webhook', 'Make', 'Zapier', 'n8n', 'invite code', 'pipeline', 'Upgrads Engine', 'vertrag.unterschrieben', 'HMAC-SHA256', 'owner', 'admin', 'member', 'German and English', 'PostgreSQL', 'CSV', 'WhatsApp', 'euro']) assert.ok(en.includes(word), `en mentions ${word}`);
    const de = Object.values(dict.de).join('\n');
    for (const word of ['Webhook', 'Einladungscode', 'Upgrads Engine', 'vertrag.unterschrieben', 'Inhaber', 'Admin', 'Mitglied', 'Deutsch und Englisch', 'Arbeitsbereich']) assert.ok(de.includes(word), `de mentions ${word}`);
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

describe('the pieces', () => {
  test('the board: four stage columns, six cards with values, the deal that will be demonstrated, one already won, a stats sentence, an Engine line, a cursor and a replay', () => {
    const s = screen('board');
    assert.deepEqual([...s.matchAll(/<section class="lp-col[^"]*" data-stage="([a-z]+)">/g)].map(m => m[1]), ['new', 'offer', 'nego', 'won']);
    const cards = [...s.matchAll(/<article class="lp-card[^"]*" tabindex="0" data-value="(\d+)"/g)];
    assert.equal(cards.length, 6);
    assert.equal(cards.reduce((a, m) => a + Number(m[1]), 0), 1590500);
    assert.match(s, /<article class="lp-card u3" tabindex="0" data-value="485000" data-hero>/, 'the demonstrated deal starts in New');
    assert.match(s, /data-stage="won">[\s\S]*<article class="lp-card is-won"/);
    for (const id of ['lp-board', 'lp-stats-line', 'lp-engine-line', 'lp-cursor', 'lp-toast', 'lp-demo-replay']) assert.ok(s.includes(`id="${id}"`), id);
    assert.match(s, /<p class="lp-stats-line" id="lp-stats-line" aria-live="polite">/);
    assert.match(s, /<svg class="lp-demo-cursor hidden" id="lp-cursor" aria-hidden="true"><use href="#lp-i-pointer"\/><\/svg>/);
    assert.match(s, /<p class="lp-hint" data-i18n="lp_demo_hint">/);
  });
  test('leads: one button, an incoming block, an arrow, a contact card with fields and chips; three presets each with a four-field map', () => {
    const s = screen('leads');
    assert.match(s, /<pre class="lp-code" id="lp-lead-json"><\/pre>[\s\S]*<svg class="lp-ic lp-lead-arrow"[\s\S]*<div class="lp-lead-card" id="lp-lead-card">[\s\S]*<dl class="lp-fields" id="lp-lead-fields"><\/dl>[\s\S]*<p class="lp-chips" id="lp-lead-chips"><\/p>/);
    assert.match(s, /<button type="button" class="lp-btn lp-btn-primary" id="lp-lead-send">/);
    assert.doesNotMatch(s, /textarea|lp-map-row|lp-log/, 'no mapping table, no log: the piece shows the result');
    assert.equal(presets.length, 3);
    assert.deepEqual(presets.map(p => p.name), ['form', 'make', 'zapier']);
    for (const p of presets) { assert.deepEqual(Object.keys(p.map), ['name', 'email', 'phone', 'company'], p.name); assert.ok(Object.keys(p.payload).length >= 1, p.name); }
  });
  test('the record: a tablist of five, panels wired by aria-controls, four tasks (one done), a composer with four types', () => {
    const rec = screen('deal');
    const tabs = [...rec.matchAll(/<button type="button" role="tab" id="(lp-tab-[a-z]+)" aria-controls="(lp-pan-[a-z]+)" aria-selected="(true|false)"/g)];
    assert.equal(tabs.length, 5);
    assert.equal(tabs.filter(t => t[3] === 'true').length, 1);
    for (const t of tabs) assert.match(rec, new RegExp(`role="tabpanel" id="${t[2]}" aria-labelledby="${t[1]}"`));
    assert.equal(count(rec, '<li class="lp-task">'), 4);
    assert.equal(count(rec, '<input type="checkbox" checked>'), 1);
    assert.equal(count(rec, 'class="lp-type-chip"'), 4);
    assert.match(rec, /<textarea rows="2" data-i18n-ph="lp_note_ph" placeholder="/);
  });
  test('team: the two clocks with their controls, nothing else', () => {
    const s = screen('team');
    for (const id of ['lp-tz', 'lp-tz-from', 'lp-tz-to', 'lp-tz-time', 'lp-tz-out', 'lp-tz-note', 'lp-tz-day']) assert.ok(s.includes(`id="${id}"`), id);
    assert.match(s, /<input type="time" id="lp-tz-time" value="09:30">/);
    assert.doesNotMatch(s, /lp-chat|lp-roles/, 'roles and chat are one line of copy, not a piece');
  });
  test('numbers: three periods with six months on, four cards, the line with its readout, the funnel', () => {
    const s = screen('numbers');
    const periods = [...s.matchAll(/class="lp-period-btn" data-period="(\d+)" aria-pressed="(true|false)"/g)];
    assert.deepEqual(periods.map(p => Number(p[1])), Object.keys(analytics).map(Number));
    assert.deepEqual(periods.filter(p => p[2] === 'true').map(p => p[1]), ['6']);
    for (const id of ['lp-an-open', 'lp-an-won', 'lp-an-rate', 'lp-an-new', 'lp-an-line', 'lp-an-tip', 'lp-an-funnel']) assert.ok(s.includes(`id="${id}"`), id);
    assert.doesNotMatch(s, /lp-an-table|lp-an-owners/, 'no table twin, no owners: two charts');
    for (const [p, a] of Object.entries(analytics)) { assert.equal(a.rates.length, Number(p)); assert.equal(a.funnel.length, 4); assert.ok(a.funnel.every((n, i, arr) => i === 0 || n <= arr[i - 1])); }
  });
  test('engine: the event body with the exact payload keys of utils/engine.js, a signature block, a state line, one button', () => {
    const s = screen('engine');
    const serverKeys = [...engine.slice(engine.indexOf('function buildContractSignedPayload'), engine.indexOf('}', engine.indexOf('return {', engine.indexOf('function buildContractSignedPayload')))).matchAll(/^\s+(\w+)\s*[:,]/gm)].map(m => m[1]);
    const bodyPre = s.match(/<pre class="lp-code" id="lp-en-body">([\s\S]*?)<\/pre>/)[1];
    assert.deepEqual(Object.keys(JSON.parse(bodyPre)), serverKeys);
    assert.deepEqual(Object.keys(new Function(sliceFn(js, 'lpEnginePayload', 'landing.js') + ' return lpEnginePayload({ eventId: "e", timestamp: "t", title: "T", stage: "S" });')()), serverKeys);
    assert.match(s, /<pre class="lp-code lp-en-sig" id="lp-en-sig">X-Upgrads-Timestamp:\nX-Upgrads-Signature: sha256=<\/pre>/);
    for (const h of ['X-Upgrads-Timestamp', 'X-Upgrads-Signature']) assert.ok(engine.includes(h), `server ${h}`);
    assert.match(s, /<p class="lp-en-state"><i><\/i><span id="lp-en-state"><\/span><\/p>/);
    assert.match(s, /<button type="button" class="lp-btn lp-btn-primary" id="lp-en-send">/);
    assert.doesNotMatch(s, /lp-trigger|lp-switch|lp-en-received|lp-en-log/, 'no settings, no receiver, no log: one event, one signature');
  });
});

describe('landing.js: pure functions', () => {
  const F = loadFns('public/js/landing.js', ['lpT', 'lpFmtEur', 'lpFmtEurShort', 'lpBoardStats', 'lpEase', 'lpGetPath', 'lpMapLead', 'lpZoneOffsetMs', 'lpConvertClock', 'lpHex', 'lpSign', 'lpEnginePayload'], { state: { lpLang: 'de' }, extra: sliceConst('public/js/landing.js', 'LP_I18N') });
  test('lpT: current language, then English, then the key; placeholders filled', () => {
    assert.equal(F.lpT('lp_login'), 'Anmelden');
    assert.equal(F.lpT('lp_toast_moved', { stage: 'Gewonnen' }), 'Verschoben nach Gewonnen');
    assert.equal(F.lpT('lp_tasks_progress', { d: 1, n: 4 }), '1 von 4 erledigt');
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
    assert.ok(F.lpEase(0.25) < 0.25 && F.lpEase(0.75) > 0.75);
  });
  test('board stats: open and won sums, counts and the won share', () => {
    assert.deepEqual(F.lpBoardStats([{ value: 100, won: false }, { value: 300, won: false }, { value: 600, won: true }]), { open: 400, won: 600, openN: 2, wonN: 1, total: 3, rate: 33 });
    assert.equal(F.lpBoardStats([]).rate, 0);
  });
  test('dot paths and the lead mapping behave like the inbound webhook; every preset yields a contact', () => {
    const p = { full_name: 'Jana', contact: { email: 'j@x.de', phone: '' }, n: 0 };
    assert.equal(F.lpGetPath(p, 'contact.email'), 'j@x.de'); assert.equal(F.lpGetPath(p, 'n'), 0);
    assert.equal(F.lpGetPath(p, 'contact.street'), undefined); assert.equal(F.lpGetPath(p, 'full_name.first'), undefined); assert.equal(F.lpGetPath(p, ''), undefined);
    const r = F.lpMapLead(p, { name: 'full_name', email: 'contact.email', phone: 'contact.phone', company: 'company' });
    assert.deepEqual(r, { ok: true, fields: { name: 'Jana', email: 'j@x.de' }, missing: ['contact.phone', 'company'] });
    assert.equal(F.lpMapLead({ foo: 1 }, { name: 'name', email: 'email' }).ok, false);
    for (const pr of presets) { const m = F.lpMapLead(pr.payload, pr.map); assert.ok(m.ok && m.fields.name && m.fields.email, pr.name); }
  });
  test('the clock conversion is the Calendar\'s: wall clock in the author\'s zone, shown in the viewer\'s zone, with the day shift', () => {
    assert.deepEqual(F.lpConvertClock('2026-10-07', '09:30', 'Europe/Berlin', 'Europe/Lisbon'), { time: '08:30', dayShift: 0 });
    assert.deepEqual(F.lpConvertClock('2026-10-07', '23:00', 'Europe/Berlin', 'Asia/Tokyo'), { time: '06:00', dayShift: 1 });
    assert.deepEqual(F.lpConvertClock('2026-10-07', '03:00', 'Asia/Tokyo', 'America/Los_Angeles'), { time: '11:00', dayShift: -1 });
    assert.deepEqual(F.lpConvertClock('2026-10-07', '00:15', 'Europe/Berlin', 'Europe/Berlin'), { time: '00:15', dayShift: 0 });
    assert.deepEqual(F.lpConvertClock('2026-01-15', '09:30', 'Europe/Berlin', 'Asia/Kolkata'), { time: '14:00', dayShift: 0 });
  });
  test('lpSign is the server\'s scheme: sha256= + hex HMAC-SHA256 over "<timestamp>.<raw body>"', async () => {
    const secret = 'abc123', ts = 1760000000, raw = '{"event":"vertrag.unterschrieben"}';
    assert.equal(await F.lpSign(secret, ts, raw), 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex'));
    assert.match(engine, /createHmac\('sha256', String\(secret\)\)\.update\(`\$\{timestamp\}\.\$\{rawBody\}`\)\.digest\('hex'\)/);
    assert.equal(F.lpHex(new Uint8Array([0, 15, 255]).buffer), '000fff');
    const p = F.lpEnginePayload({ eventId: 'e1', timestamp: 't', title: 'T', stage: 'S' });
    assert.equal(p.event, 'vertrag.unterschrieben'); assert.equal(p.vertrag_id, 1042); assert.equal(p.produkt, 'T'); assert.equal(p.stage, 'S');
  });
});

describe('landing.js: behaviour hooks', () => {
  test('the board demonstrates itself once when 60 % in view: a visible cursor drags the deal into Won, then any pointer or key takes over; drag and drop with pointer events, a placeholder, arrow keys, no HTML5 drag', () => {
    const b = sliceFn(js, 'lpInitBoard', 'landing.js');
    assert.match(b, /new IntersectionObserver\([\s\S]*io\.disconnect\(\); runDemo\(\)/); assert.match(b, /threshold: 0\.6/);
    assert.match(b, /function runDemo\(\) \{\s*if \(!hero \|\| !cursor \|\| reduce\) return;/, 'no demonstration under reduced motion');
    assert.match(b, /hero\.classList\.add\('is-lifted'\)/); assert.match(b, /cursor\.style\.transform = `translate/); assert.match(b, /lpEase\(t\)/);
    assert.match(b, /place\(hero, won, won\.querySelector\('\.lp-col-cards'\)\.firstElementChild, \{ quiet: true \}\)/);
    assert.equal(count(b, 'stopDemo();'), 4, 'a fresh start, the reset, a pointer and a key all stop the demonstration');
    assert.match(b, /lp-demo-replay/); assert.match(b, /function resetBoard\(\)/);
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) assert.ok(b.includes(`'${ev}'`), ev);
    assert.match(b, /setPointerCapture/); assert.match(b, /elementFromPoint/); assert.match(b, /lp-card-ph/); assert.match(b, /ArrowLeft/); assert.match(b, /ArrowRight/);
    assert.match(b, /dataset\.stage === 'won'/); assert.match(b, /deliver\(\)/); assert.match(b, /lp_toast_moved/); assert.match(b, /lpBoardStats\(/); assert.match(b, /lpFlip\(card/);
    assert.doesNotMatch(js, /dragstart|draggable|dataTransfer/);
    assert.doesNotMatch(b, /clock|caption|feed/, 'no narration');
    assert.match(css, /\.lp-card \{[^}]*touch-action: none/);
    assert.match(css, /\.lp-card\.is-dragging \{[^}]*position: fixed[^}]*pointer-events: none/);
    assert.match(css, /\.lp-card\.is-lifted \{[^}]*z-index: 6/);
    assert.match(css, /\.lp-demo-cursor \{ position: absolute;[^}]*pointer-events: none/);
  });
  test('leads: the button cycles the three presets through lpMapLead and writes text nodes; the record tabs follow the WAI pattern and the composer saves without innerHTML', () => {
    const l = sliceFn(js, 'lpInitLeads', 'landing.js');
    assert.match(l, /LP_LEAD_PRESETS\[i % LP_LEAD_PRESETS\.length\]/); assert.match(l, /lpMapLead\(preset\.payload, preset\.map\)/);
    assert.match(l, /lp_lead_owner/); assert.match(l, /lp_lead_deal/); assert.doesNotMatch(l, /innerHTML/);
    const r = sliceFn(js, 'lpInitRecord', 'landing.js');
    assert.match(r, /aria-selected/); assert.match(r, /aria-controls/); assert.match(r, /tabIndex = on \? 0 : -1/);
    assert.match(r, /lp_tasks_progress/); assert.match(r, /e\.ctrlKey \|\| e\.metaKey\) && e\.key === 'Enter'/); assert.doesNotMatch(r, /innerHTML/);
  });
  test('clock, numbers and engine: zones listed with Berlin and Lisbon defaults; hover readout on the line; the event is signed with WebCrypto and the state advances', () => {
    const t = sliceFn(js, 'lpInitTimezone', 'landing.js');
    assert.match(t, /'Europe\/Berlin'/); assert.match(t, /'Europe\/Lisbon'/); assert.match(t, /lpConvertClock\(/);
    const an = sliceFn(js, 'lpInitAnalytics', 'landing.js');
    assert.match(an, /addEventListener\('pointermove'/); assert.match(an, /lp_an_tip/); assert.match(an, /addEventListener\('pointerleave'/);
    const e = sliceFn(js, 'lpInitEngine', 'landing.js');
    assert.match(e, /await lpSign\(secret, ts, raw\)/); assert.match(e, /X-Upgrads-Signature: \$\{/); assert.match(e, /Math\.floor\(now\.getTime\(\) \/ 1000\)/);
    assert.match(e, /lp_en_nosubtle/); assert.match(e, /'is-sent', 'is-pending'/); assert.match(e, /'is-done'/);
  });
  test('the wall is the login wall\'s mechanism, in the panel, without the wordmark; the index follows the screen in view; two observers in total besides the wall\'s', () => {
    const w = sliceFn(js, 'lpInitWall', 'landing.js');
    assert.match(w, /querySelector\('\.lp-panel'\)/); assert.match(w, /canvas\.lp-wall/); assert.match(w, /TARGET = 2600/);
    assert.match(w, /'--sb-bg'/); assert.match(w, /'--navy-500'/, 'the login panel\'s own two tones');
    assert.doesNotMatch(w, /MASK|logo|Image\(/, 'no pixelled wordmark');
    assert.match(w, /const active = \(\) => inView && !document\.hidden/); assert.match(w, /if \(!coarse && !reduce\)/); assert.match(w, /if \(reduce\) return;/);
    for (const [mine, theirs] of [['lpWallSmooth', 'wallSmooth'], ['lpWallGrid', 'wallGrid'], ['lpWallHex', 'wallHex'], ['lpWallMix', 'wallMix']]) {
      const a = sliceFn(js, mine, 'landing.js').replace(mine, 'f').replace(/\s+/g, ' ');
      const b2 = sliceFn(login, theirs, 'login-wall.js').replace(theirs, 'f').replace(/\s+/g, ' ');
      assert.equal(a, b2, `${mine} equals the login's ${theirs}`);
    }
    const ix = sliceFn(js, 'lpInitIndex', 'landing.js');
    assert.match(ix, /\.lp-index a\[href\^="#"\]/); assert.match(ix, /aria-current/);
    assert.equal(count(js, 'new IntersectionObserver('), 3, 'index, board start, wall sleep');
    assert.doesNotMatch(js, /lpInitReveal|lp-reveal|lpInitStage|lpInitNav|WebGL|\bTHREE\b|gsap|import\(/);
  });
  test('all helpers are top-level function declarations; no API calls, no eval, no innerHTML', () => {
    for (const f of ['lpT', 'lpApplyLang', 'lpSetLang', 'lpInitIndex', 'lpWallSmooth', 'lpWallGrid', 'lpWallHex', 'lpWallMix', 'lpInitWall', 'lpFmtEur', 'lpFmtEurShort', 'lpBoardStats', 'lpFlip', 'lpEase', 'lpInitBoard', 'lpInitRecord', 'lpGetPath', 'lpMapLead', 'lpInitLeads', 'lpZoneOffsetMs', 'lpConvertClock', 'lpInitTimezone', 'lpInitAnalytics', 'lpHex', 'lpRandomHex', 'lpEnginePayload', 'lpInitEngine', 'lpInit']) assert.match(js, new RegExp(`^function ${f}\\(`, 'm'), f);
    assert.match(js, /^async function lpSign\(/m);
    assert.doesNotMatch(js, /fetch\(|\/api\/|\bapi\.(get|post|patch)\(|\beval\(|innerHTML/);
    assert.match(js, /document\.addEventListener\('DOMContentLoaded', lpInit\)/);
  });
});

describe('landing.css', () => {
  test('own file, lp- prefixed and scoped, tokens only, three breakpoints widest first, a reduced-motion block, three keyframes', () => {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colours');
    const selectors = [...css.matchAll(/^([.#\[:a-z][^{\n]*?)\s*\{/gm)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
    assert.ok(selectors.length > 120, `selectors: ${selectors.length}`);
    for (const s of selectors) for (const part of s.split(',')) assert.match(part.trim(), /^(\.lp-|#lp-|body\.lp|:where\(body\.lp\) h[1-6]|from|to|\d+%)/, part);
    const idx = ['1100px', '860px', '600px'].map(w => css.indexOf(`@media (max-width: ${w})`));
    assert.ok(idx.every(i => i > 0)); assert.deepEqual([...idx].sort((a, b) => a - b), idx);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.deepEqual([...css.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]), ['lp-fade', 'lp-pulse', 'lp-nudge']);
    const defined = new Set([...style.matchAll(/(--[\w-]+)\s*:/g), ...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
  });
  test('the display face is Bricolage Grotesque, self-hosted with its licence; Inter stays in the pieces', () => {
    assert.match(css, /@font-face \{ font-family: "Bricolage Grotesque"; font-style: normal; font-weight: 200 800; font-stretch: 75% 100%; font-display: swap; src: url\(\/fonts\/BricolageGrotesque\.woff2\) format\("woff2"\); \}/);
    assert.match(css, /--lp-display: "Bricolage Grotesque", var\(--font\)/);
    assert.equal((css.match(/@font-face/g) || []).length, 1);
    assert.doesNotMatch(css.replace(/url\("data:[^"]*"\)/g, ''), /https?:\/\//);
    const font = path.join(ROOT, 'public', 'fonts', 'BricolageGrotesque.woff2');
    const bytes = fs.readFileSync(font);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2'); assert.ok(bytes.length > 50000 && bytes.length < 400000);
    assert.match(fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'OFL-BricolageGrotesque.txt'), 'utf8'), /SIL Open Font License, Version 1\.1/);
    assert.match(css, /\.lp-piece \{[^}]*font-family: var\(--font\)/, 'the pieces speak Inter, the page Bricolage');
    assert.match(css, /\.lp-hero-title \{[^}]*font-optical-sizing: auto/);
    assert.doesNotMatch(html, /Schibsted/);
  });
  test('the cascade the page depends on: the panel is sticky and the wall absolute under its content, the split collapses under 1100 px, the toast and cursor are positioned inside the board piece, headings stay at :where() specificity', () => {
    assert.match(css, /\.lp-split \{ display: grid; grid-template-columns: var\(--lp-panel-w\) minmax\(0, 1fr\)/);
    assert.match(css, /\.lp-panel \{ position: sticky; top: 0; height: 100vh;[^}]*overflow: hidden; isolation: isolate; background: var\(--sb-bg\)/);
    assert.match(css, /\.lp-wall \{ position: absolute; inset: 0; z-index: 0;[^}]*pointer-events: none/);
    assert.match(css, /\.lp-panel-in \{ position: relative; z-index: 1;/);
    assert.doesNotMatch(css, /\.lp-panel > \*/, 'no child rule that could pull the canvas into the flow (the login bug)');
    const m1100 = css.slice(css.indexOf('@media (max-width: 1100px)'), css.indexOf('@media (max-width: 860px)'));
    assert.match(m1100, /\.lp-split \{ grid-template-columns: 1fr; \}/); assert.match(m1100, /\.lp-panel \{ position: static; height: auto;/);
    assert.match(css, /\.lp-piece \{ position: relative;/); assert.match(css, /\.lp-toast \{ position: absolute/); assert.match(css, /\.lp-demo-cursor \{ position: absolute/);
    assert.doesNotMatch(css, /^body\.lp h[1-6]\b/m);
    assert.match(css, /\.lp-hero-title \{[^}]*color: var\(--navy-50\)/); assert.match(css, /:where\(body\.lp\) h2 \{[^}]*color: var\(--brand\)/);
    assert.doesNotMatch(css, /> \* \{[^}]*position/);
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
