// CLIENT (static + pure-function) tests for the public landing page at /landingpage.
// Part 18 (2026-10-14, from scratch): the scroll tells the story. One opening screen, then three
// acts, each a tall section with a screen pinned inside it whose product performs with the act's
// scroll progress, forwards and backwards:
//   leads   a lead flies from each ad platform into the board and lands as the card the inbound
//           webhook would make, one per fifth of the scroll
//   deal    the record walks seven phases (the WhatsApp template, a task, a note, the booking
//           dialog's day, clash and clean time, the booked meeting with its join link) and the
//           words above it swap with the phase
//   won     the deal card travels into Gewonnen with the scroll, lands, and the packet reaches
//           the next system, which confirms receipt
// then numbers, the ledger and the close. Every surface is the app in its own dark mode (the
// root carries data-theme="dark"; the page reaches the app's tokens only). Pinned: the route, the
// CSP-safe document, Instrument Sans self-hosted, German first and equal to the dictionary key
// for key, impersonal German, the caps on words, the claims audit, every anatomy, the scroll
// engine and the act drives, the stylesheet's discipline (lp- prefix, tokens only, no hex, pinned
// acts, flat surfaces, no reveals, no rejected designs), four breakpoints, reduced motion last.
// Pure functions are sliced out of public/js/landing.js and run in a sandbox.
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
const leads     = new Function(sliceConst('public/js/landing.js', 'LP_LEADS').replace(/^[^{]*/, 'return '))();
const analytics = new Function(sliceConst('public/js/landing.js', 'LP_ANALYTICS').replace(/^[^{]*/, 'return '))();
const meet      = new Function(sliceConst('public/js/landing.js', 'LP_MEET').replace(/^[^{]*/, 'return '))();
const count  = (src, needle) => src.split(needle).length - 1;
const body   = html.slice(html.indexOf('<body'));
const unesc  = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const section = id => { const s = html.indexOf(`<section id="${id}"`); let e = html.indexOf('\n<section id="', s + 1); if (e < 0) e = html.indexOf('</main>'); return html.slice(s, e); };
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const tokens = src => [...src.matchAll(/>([^<]+)</g)].map(m => m[1].trim()).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
const outsideSurfaces = src => { let out = '', i = 0; for (;;) { const a = src.indexOf('<div class="lp-surface', i); if (a < 0) { out += src.slice(i); break; } out += src.slice(i, a); let d = 0, j = a; for (;;) { const o = src.indexOf('<div', j), c = src.indexOf('</div>', j); if (c < 0) { j = src.length; break; } if (o >= 0 && o < c) { d++; j = o + 4; } else { d--; j = c + 6; if (!d) break; } } i = j; } return out; };

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
  test('standalone head: the app\'s dark theme on the root, viewport, title, description, the app stylesheet then its own, both faces preloaded, no scripts in the head', () => {
    assert.match(html, /^<html lang="de" data-theme="dark">/m);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
    assert.match(html, /<meta name="color-scheme" content="dark">/);
    assert.match(html, /<title>Upgrads CRM<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{60,}">/);
    assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]), ['/style.css', '/landing.css']);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /<link rel="preload" href="\/fonts\/InstrumentSans\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.match(head, /<link rel="preload" href="\/fonts\/inter-latin-wght\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.doesNotMatch(head, /<script>/);
    assert.doesNotMatch(js, /localStorage\.(get|set)Item\('theme'/);
  });
  test('nothing the production policy would block: no external hosts, no iframes, one own script, no canvas, no inline styles, no hidden attribute, unique ids, every anchor resolves', () => {
    assert.doesNotMatch(html, /https?:\/\//);
    assert.doesNotMatch(html, /<iframe|<canvas/);
    assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['/js/landing.js']);
    assert.deepEqual([...html.matchAll(/ style="[^"]*"/g)].map(m => m[0]), []);
    for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) assert.ok(/^(\/|#|mailto:)/.test(m[1]), m[1]);
    assert.doesNotMatch(html, /<img[^>]*src="(?!\/images\/logo\.png)/);
    assert.doesNotMatch(body, /<[a-z]+[^>]*\shidden(?=[\s>])/);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    for (const a of [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1])) assert.ok(ids.includes(a), `#${a} resolves`);
  });
  test('the bar: logo, the language switch, log in, a small pill; nothing else', () => {
    const bar = html.slice(html.indexOf('<header class="lp-bar">'), html.indexOf('</header>'));
    assert.match(bar, /<a class="lp-brand" href="#top"><img src="\/images\/logo\.png" alt="Upgrads"><\/a>/);
    assert.match(bar, /class="lp-lang-btn" data-lang="de" aria-pressed="true"[\s\S]*class="lp-lang-btn" data-lang="en" aria-pressed="false"/);
    assert.match(bar, /<a href="\/" data-i18n="lp_login">/); assert.match(bar, /<a class="lp-pill lp-pill-sm lp-request" href="mailto:hello@upgrads\.de\?subject=[^"]+" data-i18n="lp_request">/);
    assert.equal(count(bar, '<a '), 3);
  });
  test('the sections: the opening, three acts (leads, deal, won), then numbers, what is different, the close; each act a pinned screen with its caption above its scene; nothing of the rejected designs, no code', () => {
    assert.deepEqual([...html.matchAll(/<section id="(\w+)" class="([^"]*)"( data-act="(\w+)")?>/g)].map(m => [m[1], m[2], m[4] || '']), [['top', 'lp-open', ''], ['leads', 'lp-act', 'leads'], ['deal', 'lp-act', 'deal'], ['won', 'lp-act', 'won'], ['numbers', 'lp-sec', ''], ['anders', 'lp-sec', ''], ['cta', 'lp-sec lp-close', '']]);
    for (const id of ['leads', 'deal', 'won']) { const s = section(id); assert.match(s, /<div class="lp-pin">\s*<div class="lp-wrap lp-cap">\s*<h2 class="lp-h2"/, id + ': the caption above'); assert.match(s, /<div class="lp-wide lp-scene lp-scene-\w+"/, id + ': the scene'); assert.equal((s.match(/<h2 /g) || []).length, 1, id + ': one statement'); }
    assert.equal(count(body, '<div class="lp-surface '), 4, 'four product surfaces: two boards, the record, the numbers');
    assert.doesNotMatch(body, /lp-frame|lp-stage\b|lp-reveal|lp-eyebrow|lp-how|lp-ch\b|lp-inst\b|lp-panel|lp-index|lp-wall|lp-faq|lp-beat|lp-st-|lp-story|lp-glow|lp-tilt|lp-grid li|lp-span-|lp-big|lp-tz|lp-chat|lp-msg|lp-split|lp-steps|lp-tour|lp-spot|lp-tip/, 'no framed shots, no stages, no reveals, no eyebrows, no tiles, no clocks, no chat, no split, no tour tooltip');
    assert.doesNotMatch(body, /<pre|<code|\{|\}/);
    assert.equal(count(html, 'lp-request"'), 3);
    assert.doesNotMatch(html, /href="\/\?admin"/);
    assert.doesNotMatch(body, />(Montag|Dienstag|Mittwoch|Donnerstag|Freitag)(, \d\d:\d\d)?</);
  });
  test('the opening: the lockup, the one line, the lead, two pills, and nothing else on the first screen', () => {
    const o = section('top');
    assert.match(o, /<section id="top" class="lp-open">\s*<div class="lp-wrap lp-open-in">\s*<p class="lp-lockup"><img src="\/images\/logo\.png" alt="Upgrads"><span data-i18n="lp_crm">CRM<\/span><\/p>\s*<h1 class="lp-h1" data-i18n="lp_hero_title">Gewonnen ist erst der Anfang\.<\/h1>\s*<p class="lp-lead" data-i18n="lp_hero_sub">[^<]+<\/p>\s*<div class="lp-actions">\s*<a class="lp-pill lp-request"[^>]*>[^<]*<\/a>\s*<a class="lp-pill lp-pill-line" href="\/" data-i18n="lp_login">[^<]*<\/a>\s*<\/div>\s*<\/div>\s*<\/section>/);
    assert.equal(dict.en.lp_hero_title, 'Won is only the beginning.');
    assert.match(dict.de.lp_hero_sub, /scrollen/i); assert.match(dict.en.lp_hero_sub, /scroll/i, 'the line says what to do');
  });
  test('act 1, leads: the four platforms with their marks and the automation tools beside the board; the board has four stages, five cards and the deal to be won in Verhandlung; a packet', () => {
    const s = section('leads');
    assert.deepEqual([...s.matchAll(/<li class="lp-src" data-src="(\w+)"><svg class="lp-logo( lp-logo-web)?"><use href="#(lp-[li]-\w+)"\/><\/svg><span data-i18n="(lp_src_\w+)">/g)].map(m => [m[1], m[3], m[4]]), [['fb', 'lp-l-fb', 'lp_src_fb'], ['ig', 'lp-l-ig', 'lp_src_ig'], ['tt', 'lp-l-tt', 'lp_src_tt'], ['web', 'lp-i-globe', 'lp_src_web']]);
    for (const id of ['lp-l-fb', 'lp-l-ig', 'lp-l-tt', 'lp-i-globe', 'lp-i-external', 'lp-i-x', 'lp-i-calendar', 'lp-i-check']) assert.match(html, new RegExp(`<symbol id="${id}" viewBox="0 0 24 24">`), id);
    assert.match(s, /<p class="lp-via"><span data-i18n="lp_via">über<\/span><b>Make<\/b><b>Zapier<\/b><b>n8n<\/b><\/p>/);
    assert.match(s, /<div class="lp-surface lp-board-wrap">\s*<div class="lp-surface-bar"><span class="lp-dot s1"><\/span><b data-i18n="lp_board">[^<]+<\/b><\/div>\s*<div class="lp-board" id="lp-board-leads"/);
    assert.deepEqual([...s.matchAll(/<section class="lp-col[^"]*" data-stage="([a-z]+)">/g)].map(m => m[1]), ['new', 'offer', 'nego', 'won']);
    const cards = [...s.matchAll(/<article class="lp-card[^"]*" tabindex="0" data-value="(\d+)"/g)];
    assert.equal(cards.length, 6); assert.equal(cards.reduce((a, m) => a + Number(m[1]), 0), 1590500);
    assert.match(s, /data-stage="nego">[\s\S]*<article class="lp-card u3" tabindex="0" data-value="485000" data-hero>/);
    assert.match(s, /<p class="lp-stats" aria-live="polite"><\/p>/); assert.match(s, /<div class="lp-toast hidden" role="status">/);
    assert.match(s, /<span class="lp-packet hidden" id="lp-packet-leads" aria-hidden="true"><\/span>/);
    assert.doesNotMatch(s, /lp-card is-lead/, 'no lead has arrived yet: they come with the scroll');
  });
  test('act 2, the deal: the caption whose statement and line swap with the phase; the record as the app draws it (head, four actions, the bubble; five tabs; the overview, the contact, the tasks with the form, the composer and timeline, the listing); the booking sheet; a toast', () => {
    const d = section('deal');
    assert.match(d, /<h2 class="lp-h2" id="lp-deal-h" data-i18n="lp_a2_t">Alles passiert am Deal\.<\/h2>\s*<p class="lp-line" id="lp-deal-line" data-i18n="lp_p0">[^<]+<\/p>/);
    assert.match(d, /<div class="lp-wide lp-scene lp-scene-deal">\s*<div class="lp-surface lp-record" id="lp-record">\s*<div class="lp-rec-head">/);
    assert.match(d, /<span class="lp-stagepill" id="lp-rec-stage" data-i18n="lp_col_nego">Verhandlung<\/span><span class="lp-badge lp-badge-u3" data-i18n="lp_urg_high">/);
    assert.deepEqual([...d.matchAll(/<button type="button" class="lp-btn lp-btn-sm" data-act="(\w+)">/g)].map(m => m[1]), ['call', 'mail', 'wa']);
    assert.match(d, /<button type="button" class="lp-btn lp-btn-sm lp-btn-primary" id="lp-rec-book"><svg class="lp-ic lp-ic-sm"><use href="#lp-i-calendar"\/><\/svg><span data-i18n="lp_act_book">/);
    assert.match(d, /<div class="lp-bubble hidden" id="lp-wa"><small data-i18n="lp_wa_label">[^<]+<\/small><p data-i18n="lp_wa_tpl">[^<]+<\/p><\/div>/);
    const tabs = [...d.matchAll(/<button type="button" role="tab" id="(lp-tab-[a-z]+)" aria-controls="(lp-pan-[a-z]+)" aria-selected="(true|false)"/g)];
    assert.equal(tabs.length, 5); assert.equal(tabs.filter(t => t[3] === 'true').length, 1);
    for (const t of tabs) assert.match(d, new RegExp(`role="tabpanel" id="${t[2]}" aria-labelledby="${t[1]}"`));
    assert.match(d, /<span class="lp-count" id="lp-ov-open">2<\/span><\/h4><ul class="lp-mini" id="lp-ov-tasks">/); assert.match(d, /<p class="lp-ov-latest" id="lp-ov-latest" data-i18n="lp_tl1_text">/);
    assert.equal(count(d, '<li class="lp-task">'), 3); assert.equal(count(d, '<input type="checkbox" checked>'), 1);
    assert.match(d, /<div class="lp-task-new" id="lp-task-new">[\s\S]*<button type="button" class="lp-btn lp-btn-primary lp-btn-sm" id="lp-task-add" data-i18n="lp_task_add">/);
    assert.doesNotMatch(d.slice(d.indexOf('id="lp-task-new"'), d.indexOf('id="lp-pan-activity"')), /<input|<select|<textarea/, 'a picture of the form, not a form');
    assert.equal(count(d, 'class="lp-type-chip"'), 4); assert.match(d, /<textarea rows="2" id="lp-note" data-i18n-ph="lp_note_ph" placeholder="/); assert.match(d, /id="lp-note-save" data-i18n="lp_note_save">/);
    assert.equal(count(d, '<li class="lp-tl-item">'), 2);
    const sheet = d.slice(d.indexOf('id="lp-book"'), d.indexOf('id="lp-rec-toast"'));
    assert.match(sheet, /role="dialog" aria-modal="true" aria-labelledby="lp-bk-title"/);
    assert.match(sheet, /<select class="lp-select" id="lp-bk-type"><option value="1" data-i18n="lp_bk_type1">[^<]+<\/option><option value="2" data-i18n="lp_bk_type2">[^<]+<\/option><\/select>/);
    assert.match(sheet, /<select class="lp-select" id="lp-bk-where"><option>Google Meet<\/option><option>Zoom<\/option><option>Cal Video<\/option><\/select>/);
    assert.deepEqual([...sheet.matchAll(/<span data-i18n="(lp_wd\d)">/g)].map(m => m[1]), ['lp_wd1', 'lp_wd2', 'lp_wd3', 'lp_wd4', 'lp_wd5', 'lp_wd6', 'lp_wd7']);
    assert.match(sheet, /<div class="lp-bk-grid" id="lp-bk-grid"><\/div>/); assert.doesNotMatch(sheet, /class="lp-bk-day/, 'the days come from the script');
    assert.match(sheet, /<div class="lp-bk-slots" id="lp-bk-slots" role="group" data-i18n-aria="lp_bk_time" aria-label="[^"]+"><\/div>\s*<p class="lp-bk-conflict hidden" id="lp-bk-conflict" role="alert"><\/p>\s*<div class="lp-bk-summary hidden" id="lp-bk-summary">/);
    assert.match(sheet, /<div class="lp-sheet-foot"><button type="button" class="lp-btn lp-btn-sm" id="lp-bk-cancel" data-i18n="lp_bk_cancel">[^<]+<\/button><button type="button" class="lp-btn lp-btn-primary lp-btn-sm" id="lp-bk-go" disabled><\/button><\/div>/);
    assert.match(d, /<div class="lp-toast hidden" id="lp-rec-toast" role="status">/);
    assert.doesNotMatch(d, /Zeitzone|time zone|Europe\//);
  });
  test('act 3, won: the board again with the lead that arrived in act 1 already in Neu, the deal in Verhandlung, the next system with its state and receipt, a packet', () => {
    const w = section('won');
    assert.match(w, /<h2 class="lp-h2" data-i18n="lp_a3_t">Unterschrieben\. Weitergemeldet\.<\/h2>\s*<p class="lp-line" data-i18n="lp_a3_d">/);
    assert.match(w, /<div class="lp-board" id="lp-board-won"/);
    assert.match(w, /data-stage="new">[\s\S]*<article class="lp-card is-lead" tabindex="0" data-value="0" data-src="fb"><span class="lp-card-stripe"><\/span><h4 class="lp-card-title">Lena Hoffmann<\/h4><p class="lp-card-sub" data-i18n="lp_lead_fb">/, 'the story continues: the first lead is on the board');
    assert.match(w, /data-stage="nego">[\s\S]*<article class="lp-card u3" tabindex="0" data-value="485000" data-hero>/);
    assert.match(w, /<div class="lp-next" id="lp-next">\s*<p class="lp-next-name" data-i18n="lp_next">[^<]+<\/p>\s*<p class="lp-next-sub" data-i18n="lp_next_sub">[^<]+<\/p>\s*<p class="lp-next-state"><i><\/i><span id="lp-next-state"><\/span><\/p>\s*<p class="lp-receipt" id="lp-receipt"><svg class="lp-ic lp-ic-sm"><use href="#lp-i-check"\/><\/svg><span data-i18n="lp_received">/);
    assert.match(w, /<span class="lp-packet hidden" id="lp-packet-won" aria-hidden="true"><\/span>/);
    assert.equal(leads.fb.payload.data.lead.name, 'Lena Hoffmann', 'the same person act 1 lands');
    assert.match(engine, /function buildContractSignedPayload/, 'the real transfer still lives in utils/engine.js');
  });
  test('numbers, what is different, the close, the footer', () => {
    const n = section('numbers');
    const periods = [...n.matchAll(/class="lp-period" data-period="(\d+)" aria-pressed="(true|false)"/g)];
    assert.deepEqual(periods.map(p => Number(p[1])), Object.keys(analytics).map(Number)); assert.deepEqual(periods.filter(p => p[2] === 'true').map(p => p[1]), ['6']);
    for (const id of ['lp-an-open', 'lp-an-won', 'lp-an-rate', 'lp-an-new', 'lp-an-line', 'lp-an-tip', 'lp-an-funnel']) assert.ok(n.includes(`id="${id}"`), id);
    for (const [p, a] of Object.entries(analytics)) { assert.equal(a.rates.length, Number(p)); assert.equal(a.funnel.length, 4); }
    const a = section('anders');
    assert.match(a, /<h2 class="lp-h2" data-i18n="lp_vs_t">Weniger CRM\. Mehr Unterschriften\.<\/h2><\/div>\s*<div class="lp-wrap">\s*<ol class="lp-vs">\s*<li class="lp-vs-head" aria-hidden="true">/);
    assert.deepEqual([...a.matchAll(/<li class="lp-vs-row"><p class="lp-vs-a" data-i18n="(lp_vs\da)">[^<]+<\/p><p class="lp-vs-b" data-i18n="(lp_vs\db)">[^<]+<\/p><\/li>/g)].map(m => [m[1], m[2]]), [['lp_vs1a', 'lp_vs1b'], ['lp_vs2a', 'lp_vs2b'], ['lp_vs3a', 'lp_vs3b'], ['lp_vs4a', 'lp_vs4b'], ['lp_vs5a', 'lp_vs5b']]);
    assert.doesNotMatch(a, /lp-surface|<svg|lp-pill/);
    const c = section('cta');
    assert.match(c, /<h2 class="lp-h2" data-i18n="lp_cta_t">Nur auf Einladung\.<\/h2>\s*<p class="lp-line" data-i18n="lp_cta_d">[^<]+<\/p>\s*<div class="lp-actions">\s*<a class="lp-pill lp-request"[\s\S]*<a class="lp-pill lp-pill-line" href="\/" data-i18n="lp_login">/);
    assert.match(html, /<footer class="lp-footer">\s*<div class="lp-wrap lp-footer-in">\s*<a class="lp-brand" href="#top">[\s\S]*<p data-i18n="lp_foot_tag">/);
  });
});

describe('German first', () => {
  test('a visitor with no saved language gets German', () => { assert.match(js, /^let lpLang = 'de';/m); assert.match(js, /lpApplyLang\(saved \|\| 'de'\)/); });
  test('the markup text IS the German dictionary, key for key', () => {
    let n = 0;
    for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n="([a-z0-9_]+)"[^>]*>([^<]*)<\/\1>/g)) { n++; assert.equal(unesc(m[3]), dict.de[m[2]], m[2]); }
    assert.ok(n >= 140, `checked ${n} strings`);
    for (const m of html.matchAll(/data-i18n-ph="([a-z0-9_]+)"[^>]*placeholder="([^"]*)"/g)) assert.equal(unesc(m[2]), dict.de[m[1]], m[1]);
  });
  test('the German is impersonal (neither du nor Sie)', () => { for (const [k, v] of Object.entries(dict.de)) assert.doesNotMatch(v, IMPERSONAL, `${k}: ${v}`); });
});

describe('copy', () => {
  test('both dictionaries have identical key sets, no empty values; every key on the page exists; no dead keys', () => {
    assert.deepEqual(Object.keys(dict.en).sort(), Object.keys(dict.de).sort());
    for (const [lang, d] of Object.entries(dict)) for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.trim(), `${lang}.${k}`);
    const used = new Set([...html.matchAll(/data-i18n(?:-ph|-aria)?="([a-z0-9_]+)"/g)].map(m => m[1]));
    assert.deepEqual([...used].filter(k => !(k in dict.de)), []);
    const dynamic = k => /^lp_wd\d$/.test(k) || /^lp_p\d$/.test(k) || k === meet.busy.key || Object.values(leads).some(l => l.key === k) || k === 'lp_request_subject';
    assert.deepEqual(Object.keys(dict.de).filter(k => !used.has(k) && !js.includes(`'${k}'`) && !dynamic(k)), [], 'no dead keys');
    for (let i = 0; i <= 6; i++) { assert.ok(dict.de['lp_p' + i] && dict.en['lp_p' + i], 'lp_p' + i); assert.ok(words(dict.de['lp_p' + i]) <= 12 && words(dict.en['lp_p' + i]) <= 12, 'lp_p' + i + ' is one line'); }
  });
  test('short: statements at most 6 words, lines at most 12, every value at most 90 characters; the reading copy outside the surfaces under 200 German words, the whole page under 560', () => {
    for (const [lang, d] of Object.entries(dict)) for (const [k, v] of Object.entries(d)) {
      assert.ok(v.length <= 90, `${lang}.${k} is ${v.length} chars`);
      if (/^(lp_hero_title|lp_a1_t|lp_a2_t|lp_a2b_t|lp_a3_t|lp_num_t|lp_vs_t|lp_cta_t)$/.test(k)) assert.ok(words(v) <= 6, `${lang}.${k} statement: ${v}`);
      if (/^(lp_hero_sub|lp_a1_d|lp_a3_d|lp_num_d|lp_cta_d)$/.test(k)) assert.ok(words(v) <= 12, `${lang}.${k} line: ${v}`);
    }
    const all = tokens(body), prose = tokens(outsideSurfaces(body));
    assert.ok(all < 560, `German words on the page: ${all}`);
    assert.ok(prose <= 200, `reading copy outside the surfaces: ${prose}`);
  });
  test('headings, lines, links, buttons, list items and labels carry a key; only names, products and numbers are untranslated', () => {
    const allow = /^(DE|EN|Make|Zapier|n8n|Upgrads|Mara Kühn|Tim Berger|Jana Weber|Lena Hoffmann|Hoffmann Immobilien|Elbstraße 12, Whg\. 3|Notariat Feld &amp; Kollegen|jana\.weber@example\.de|\+49 171 2345678|Google Meet|Zoom|Cal Video|Cal\.com|[\d€.,:%\s+()-]*)$/;
    for (const m of body.matchAll(/<(h1|h2|h3|h4|p|a|button|li|dt|dd|small|label|option|b)\b[^>]*>([^<]*)</g)) {
      const text = m[2].trim();
      if (!text || allow.test(text) || /lp-card-(title|sub|value)/.test(m[0])) continue;
      assert.match(m[0], /data-i18n(-ph)?=/, m[0].slice(0, 100));
    }
  });
  test('the copy claims only what the code does: no features we do not have, no invented proof, no superlatives, no competitor, no template punctuation, nothing technical', () => {
    for (const [lang, d] of Object.entries(dict)) {
      const all = Object.values(d).join('\n');
      assert.doesNotMatch(all, /Lead Ads|ImmoScout|Immowelt|HubSpot|Salesforce|Pipedrive|onOffice|Propstack|direkt(e|er)? (Anbindung|Schnittstelle)|native integration/i, `${lang}: no adapters or competitors`);
      assert.doesNotMatch(all, /attach|Anhang|anhäng|\bchannels?\b|\bKanäle\b|Direktnachricht|thread|Kommentar|comment|Erwähnung/i, `${lang}: not built`);
      assert.doesNotMatch(all, /\bSSO\b|single sign|\bAI\b|\bKI\b|mobile[- ]app|email sync|E-Mail-Sync|Kalender-Sync|calendar sync|iCal|Outlook/i, `${lang}: not built`);
      assert.doesNotMatch(all, /kostenlos|free trial|Testphase|\bPreis(e|liste)?\b|pricing|\$/i, `${lang}: no pricing or trial claims`);
      assert.doesNotMatch(all, /\b\d+\+? (companies|teams|customers|agencies|users|Unternehmen|Teams|Kunden|Makler|Nutzer)\b/i);
      assert.doesNotMatch(all, /\beinzig|\bthe only\b|\bnur wir\b|weltweit|world's|Marktführer|market leader|\bNr\. ?1\b|\bno\. ?1\b/i, `${lang}: no superlative we cannot prove`);
      assert.doesNotMatch(all, /→|·|—|\*\*/); assert.doesNotMatch(all, /\b[A-Z]{5,}\b/);
    }
    const marks = [...body.matchAll(/>([^<]+)</g)].map(m => m[1]).join('\n').toLowerCase();
    const en = Object.values(dict.en).join('\n').toLowerCase() + '\n' + marks, de = Object.values(dict.de).join('\n').toLowerCase() + '\n' + marks;
    for (const word of ['make', 'zapier', 'n8n', 'facebook', 'instagram', 'tiktok', 'invite code', 'whatsapp', 'cal.com', 'google meet', 'meeting', 'task', 'calendar', 'contact', 'german', 'hand-over']) assert.ok(en.includes(word), `en mentions ${word}`);
    for (const word of ['make', 'zapier', 'n8n', 'facebook', 'instagram', 'tiktok', 'einladungscode', 'whatsapp', 'cal.com', 'google meet', 'termin', 'aufgabe', 'kalender', 'kontakt', 'deutsch', 'übergabe']) assert.ok(de.includes(word), `de mentions ${word}`);
    assert.doesNotMatch(en + '\n' + de, /hmac|sha256|signiert|signed with|payload|json|curl|header|endpoint|\bapi\b|webhook|vertrag\.unterschrieben/i);
  });
  test('the language toggle and the mailto subject follow the chosen language', () => {
    const s = sliceFn(js, 'lpApplyLang', 'landing.js');
    assert.match(s, /document\.documentElement\.lang = lpLang/); assert.match(s, /localStorage\.setItem\('lang', lpLang\)/);
    assert.match(s, /aria-pressed/); assert.match(s, /data-i18n-ph/); assert.match(s, /data-i18n-aria/);
    assert.match(s, /mailto:hello@upgrads\.de\?subject=/); assert.match(s, /encodeURIComponent/); assert.match(s, /for \(const fn of lpRerender\) fn\(\)/);
  });
});

describe('landing.js: pure functions', () => {
  const F = loadFns('public/js/landing.js', ['lpT', 'lpFmtEur', 'lpFmtEurShort', 'lpBoardStats', 'lpEase', 'lpArcPoint', 'lpGetPath', 'lpMapLead', 'lpAmPm', 'lpAddMin', 'lpMeetDay'], { state: { lpLang: 'de' }, extra: ['LP_I18N', 'LP_MONTHS', 'LP_MEET'].map(n => sliceConst('public/js/landing.js', n)).join('\n') });
  test('lpT: current language, then English, then the key; placeholders filled', () => {
    assert.equal(F.lpT('lp_login'), 'Anmelden'); assert.equal(F.lpT('lp_toast_moved', { stage: 'Gewonnen' }), 'Verschoben nach Gewonnen');
    F.__set('lpLang', 'xx'); assert.equal(F.lpT('lp_login'), 'Log in'); assert.equal(F.lpT('lp_nope'), 'lp_nope'); F.__set('lpLang', 'de');
  });
  test('money, the ease, board stats', () => {
    assert.equal(F.lpFmtEur(485000), '485.000 €'); assert.equal(F.lpFmtEurShort(1840000), '1,84 M €'); assert.equal(F.lpFmtEurShort(62500), '63 k €'); assert.equal(F.lpFmtEurShort(900), '900 €');
    assert.equal(F.lpEase(0), 0); assert.equal(F.lpEase(1), 1); assert.equal(F.lpEase(0.5), 0.5);
    assert.deepEqual(F.lpArcPoint(0, 0, 100, 0, 0), { x: 0, y: 0 }); assert.deepEqual(F.lpArcPoint(0, 0, 100, 0, 1), { x: 100, y: 0 }); assert.deepEqual(F.lpArcPoint(0, 0, 100, 0, 0.5), { x: 50, y: -11 }, 'the throw lifts by a fifth of the distance at its middle');
    assert.deepEqual(F.lpArcPoint(0, 0, 0, 200, 0.5), { x: 0, y: 78 }, 'a downward throw is lifted at its middle too'); assert.ok(F.lpArcPoint(0, 0, 0, 200, 0.25).y < 50, 'and rises first');
    assert.deepEqual(F.lpBoardStats([{ value: 100, won: false }, { value: 300, won: false }, { value: 600, won: true }]), { open: 400, won: 600, openN: 2, wonN: 1, total: 3, rate: 33 });
  });
  test('dot paths and the lead mapping behave like the inbound webhook; every platform\'s lead becomes a contact with a name and an email', () => {
    const p = { full_name: 'Jana', contact: { email: 'j@x.de', phone: '' }, n: 0 };
    assert.equal(F.lpGetPath(p, 'contact.email'), 'j@x.de'); assert.equal(F.lpGetPath(p, 'n'), 0); assert.equal(F.lpGetPath(p, 'contact.street'), undefined); assert.equal(F.lpGetPath(p, ''), undefined);
    assert.deepEqual(F.lpMapLead(p, { name: 'full_name', email: 'contact.email', phone: 'contact.phone', company: 'company' }), { ok: true, fields: { name: 'Jana', email: 'j@x.de' }, missing: ['contact.phone', 'company'] });
    assert.deepEqual(Object.keys(leads), ['fb', 'ig', 'tt', 'web']);
    for (const [k, l] of Object.entries(leads)) { const m = F.lpMapLead(l.payload, l.map); assert.ok(m.ok && m.fields.name && m.fields.email, k); assert.ok(dict.de[l.key] && dict.en[l.key], l.key); }
  });
  test('times as the booking dialog shows them; the day in each language; the month', () => {
    assert.equal(F.lpAmPm('14:00'), '2:00 PM'); assert.equal(F.lpAmPm('09:00'), '9:00 AM'); assert.equal(F.lpAddMin('14:00', 30), '14:30'); assert.equal(F.lpAddMin('15:30', 60), '16:30');
    assert.equal(F.lpMeetDay(8), 'Do, 8. Okt'); F.__set('lpLang', 'en'); assert.equal(F.lpMeetDay(8), 'Thu, 8 Oct'); F.__set('lpLang', 'de');
    assert.ok(meet.lead === 3 && meet.days === 31 && meet.today === 7 && meet.busy.day === 8 && meet.busy.time === '11:00' && meet.slots.includes('14:00'));
  });
});

describe('landing.js: the scroll and the acts', () => {
  test('the engine: an act\'s progress is 0 when its screen pins at the bar and 1 when the section releases it; it drives the act only until the first touch of the scene; rAF-throttled on scroll and resize; reduced motion stands every act at its end and binds nothing', () => {
    const a = sliceFn(js, 'lpInitActs', 'landing.js');
    assert.match(a, /acts = \[\.\.\.document\.querySelectorAll\('\.lp-act'\)\]\.map\(el => \(\{ el, drive: LP_ACTS\[el\.dataset\.act\], handed: false, target: 0, cur: -1 \}\)\)/);
    assert.match(a, /if \(lpReduce\(\)\) \{ acts\.forEach\(a => \{ a\.el\.style\.setProperty\('--lp-p', '1'\); a\.drive\?\.\(1\); \}\); return; \}/);
    assert.match(a, /range = a\.el\.offsetHeight - \(window\.innerHeight - barH\(\)\)/); assert.match(a, /Math\.min\(1, Math\.max\(0, \(barH\(\) - r\.top\) \/ range\)\)/, 'pinned at the bar, released at the section\'s end');
    assert.match(a, /a\.cur = p; a\.el\.style\.setProperty\('--lp-p', p\.toFixed\(3\)\);\s*if \(!a\.handed\) a\.drive\?\.\(p\);/);
    assert.match(a, /const k = 1 - Math\.exp\(-Math\.min\(64, now - \(last \|\| now\)\) \/ 120\); last = now;/, 'the drawn progress follows the scroll with a ~120 ms lag, time-based so every refresh rate feels the same'); assert.match(a, /let p = a\.cur < 0 \? a\.target : a\.cur \+ \(a\.target - a\.cur\) \* k;/, 'snaps on the first frame, glides after'); assert.match(a, /if \(busy\) raf = requestAnimationFrame\(frame\); else last = 0;/, 'the loop runs only while something still moves');
    assert.match(a, /if \(dirty\) \{ dirty = false; for \(const a of acts\) a\.target = progressOf\(a\); \}/, 'measured inside the frame, not in the scroll handler'); assert.match(a, /window\.addEventListener\('scroll', onScroll, \{ passive: true \}\);\s*window\.addEventListener\('resize', onScroll\);/);
    assert.match(a, /a\.el\.addEventListener\('pointerdown', e => \{ if \(e\.target\.closest\('\.lp-scene'\) && !a\.handed\) \{ a\.handed = true; a\.drive\?\.\(a\.cur, true\); \} \}\)/, 'the first touch hands the scene over and tells the act once');
    assert.deepEqual([...js.matchAll(/^\s*LP_ACTS\.(\w+) = /gm)].map(m => m[1]), ['leads', 'deal', 'won'], 'three drives, one per act');
  });
  test('act 1: each platform owns a fifth of the scroll; its packet rides the throw from the mark into Neu as that fifth is scrolled, and the card the webhook would make lands at the end; scrolling back carries it back and takes the card away; a touch mid-throw settles it', () => {
    const l = sliceFn(js, 'lpInitLeads', 'landing.js');
    assert.match(l, /LP_ACTS\.leads = \(p, final\) => \{/);
    assert.match(l, /const v = Math\.min\(1, Math\.max\(0, \(p \* 5 - k - 0\.15\) \/ 0\.7\)\);/, 'the throw spans the middle 70% of the platform\'s fifth');
    assert.match(l, /const land = v >= 1 \|\| \(final && v > 0\.5\);\s*if \(land && !landed\[k\]\) \{ landed\[k\] = true; b\?\.addLead\(key\); \}\s*else if \(!land && landed\[k\]\) \{ landed\[k\] = false; b\?\.removeLead\(key\); \}/, 'lands at the end of the throw, leaves when scrolled back');
    assert.match(l, /lpArcEnds\(scene, mark, col\), q = lpArcPoint\(x0, y0, x1, y1, lpEase\(u\)\)/, 'the packet sits on the throw where the scroll put it'); assert.match(l, /if \(!packet \|\| final \|\| !mark \|\| !col\) \{ packet\?\.classList\.add\('hidden'\); return; \}/); assert.doesNotMatch(l, /lpFly\(|setTimeout|chain|\.animate\(/, 'nothing is a timed clip any more');
    const b = sliceFn(js, 'lpBoard', 'landing.js');
    assert.match(b, /const r = lpMapLead\(lead\.payload, lead\.map\);/); assert.match(b, /lpEl\('article', 'lp-card is-lead is-new'\)/); assert.match(b, /col\.querySelector\('\.lp-col-cards'\)\.prepend\(card\)/);
    assert.match(b, /function removeLead\(srcKey\)/);
  });
  test('the board: the real drag with pointer events and a placeholder, the arrow keys, live totals, a toast with undo, the won column flashing; the deal card driven toward Gewonnen with the scroll, landing at 1, going home below; never HTML5 drag', () => {
    const b = sliceFn(js, 'lpBoard', 'landing.js');
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) assert.ok(b.includes(`'${ev}'`), ev);
    assert.match(b, /setPointerCapture/); assert.match(b, /elementFromPoint/); assert.match(b, /lp-card-ph/); assert.match(b, /ArrowLeft/); assert.match(b, /ArrowRight/); assert.match(b, /lpBoardStats\(/); assert.match(b, /lp_toast_moved/); assert.match(b, /c\.classList\.add\('is-flash'\)/); assert.match(b, /onWon\?\.\(\)/);
    assert.match(b, /function setWon\(q\) \{[\s\S]*if \(q >= 1\) \{\s*if \(wonPlaced\) return;\s*wonPlaced = true;\s*const start = hero\.getBoundingClientRect\(\);[^\n]*\n\s*hero\.style\.transform = ''; hero\.classList\.remove\('is-lifted'\);\s*place\(hero, won, wc\.firstElementChild, \{ quiet: true, start \}\);/, 'the landing starts where the travel left the card, never from home');
    assert.match(b, /const dx = wc\.offsetLeft - nego\.offsetLeft, dy = wc\.offsetTop \+ parseFloat\(getComputedStyle\(wc\)\.paddingTop\) - hero\.offsetTop;\s*const e = lpEase\(q\), lift = Math\.sin\(Math\.PI \* e\);\s*hero\.classList\.add\('is-lifted'\);\s*hero\.style\.transform = `translate\(\$\{dx \* e\}px, \$\{dy \* e - 18 \* lift\}px\) scale\(\$\{1 \+ \.04 \* lift\}\)`;/, 'the card travels along the scroll to the top slot of Gewonnen, lifted a little on the way');
    assert.match(sliceFn(js, 'lpFlip', 'landing.js'), /function lpFlip\(el, parent, before, reduce, start\) \{\s*const a = start \|\| el\.getBoundingClientRect\(\);/); assert.match(b, /lpFlip\(card, c\.querySelector\('\.lp-col-cards'\), before, reduce, start\)/);
    assert.match(b, /if \(wonPlaced\) \{ wonPlaced = false; nego\.insertBefore\(hero,/, 'scrolling back brings it home');
    assert.doesNotMatch(js, /dragstart|draggable|dataTransfer/);
  });
  test('act 2: seven phases from the progress; the caption\'s statement and line swap with the phase; each phase adds or takes away its move (the bubble, the task, the note, the sheet\'s stage, the booked meeting); the right tab each time', () => {
    const r = sliceFn(js, 'lpInitRecord', 'landing.js');
    assert.match(r, /LP_ACTS\.deal = p => setPhase\(Math\.min\(6, Math\.floor\(p \* 7\)\)\);/);
    assert.match(r, /const k = n >= 3 \? 'lp_a2b_t' : 'lp_a2_t';/, 'the statement swaps to the meeting at phase 3'); assert.match(r, /const k = 'lp_p' \+ n;/, 'the line is the phase\'s');
    assert.match(r, /act = n === 0 \? 'wa' : null; paintBubble\(\);\s*if \(n >= 1\) addTask\(\); else removeTask\(\);\s*if \(n >= 2\) saveNote\(lpT\('lp_note_preset'\)\); else removeNote\(\);\s*if \(n >= 6\) \{ LP_BOOK\.setStage\?\.\(3\); LP_BOOK\.book\?\.\(\); \}\s*else \{ removeMeeting\(\); LP_BOOK\.setStage\?\.\(n >= 3 \? n - 2 : 0\); \}\s*selectTab\(n === 0 \? 'lp-tab-overview' : n === 1 \? 'lp-tab-tasks' : 'lp-tab-activity'\);/);
    assert.match(r, /function removeTask\(\)/); assert.match(r, /function removeNote\(\)/); assert.match(r, /function removeMeeting\(\)/);
    assert.match(r, /act === 'call' \? LP_CONTACT\.phone : act === 'mail' \? LP_CONTACT\.email : lpT\('lp_wa_tpl'\)/);
    assert.match(r, /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key === 'Enter'/);
    assert.match(r, /lpEl\('span', 'lp-tl-tag', 'Cal\.com'\)/); assert.match(r, /lpSvg\('lp-i-external'\)/); assert.match(r, /place === 'Google Meet' \? lpT\('lp_join'\) : lpT\('lp_join_link'\)/, 'the join link, named after the app');
    assert.match(r, /q\('#lp-rec-book'\)\?\.addEventListener\('click', \(\) => LP_BOOK\.open\?\.\(\)\)/, 'the button opens the sheet by hand too');
  });
  test('the sheet: the month from the data (only free days are buttons), a day shows its times, a time shows the clash or the summary and relabels the one button; the scroll\'s stages pick the 8th, the 11:00 clash, the clean 14:00; book writes the entry', () => {
    const b = sliceFn(js, 'lpInitBooking', 'landing.js');
    assert.match(b, /for \(let k = 0; k < LP_MEET\.lead; k\+\+\)/); assert.match(b, /b\.disabled = !free;/); assert.match(b, /d === LP_MEET\.today \? ' is-today'/);
    assert.match(b, /const clash = \(\) => B\.day === LP_MEET\.busy\.day && B\.time === LP_MEET\.busy\.time;/); assert.match(b, /go\.textContent = lpT\(c \? 'lp_bk_anyway' : 'lp_bk_book'\)/); assert.match(b, /go\.disabled = !has;/);
    assert.match(b, /lpT\('lp_bk_slot', \{ from: t, to: lpAddMin\(t, minutes\(\)\), ampm: lpAmPm\(t\) \}\)/);
    assert.match(b, /function setStage\(k\) \{\s*if \(k <= 0\) \{ close\(\); return; \}[\s\S]*B\.day = LP_MEET\.busy\.day; B\.time = k === 2 \? LP_MEET\.busy\.time : k >= 3 \? '14:00' : '';/);
    assert.match(b, /function book\(\) \{\s*if \(!B\.day \|\| !B\.time\) return false;[\s\S]*LP_REC\.addMeeting\?\.\(detail\);/);
    assert.match(b, /Object\.assign\(LP_BOOK, \{ open, close, book, setStage, isOpen/);
  });
  test('act 3: the card travels until half the scroll and lands; then the packet flies from the Won column to the next system, which confirms; scrolling back resets it; the real transfer is never on the page', () => {
    const w = sliceFn(js, 'lpInitWon', 'landing.js');
    assert.match(w, /LP_ACTS\.won = p => \{\s*const q = Math\.min\(1, p \/ 0\.55\);\s*b\?\.setWon\(q\);\s*if \(q >= 1\) deliver\(\); else resetNext\(\);\s*\};/);
    assert.match(w, /lpFly\(packet, scene, won, next, 1000\)/); assert.match(w, /phase = 'pending'; paintNext\(\);/); assert.match(w, /if \(flown\) \{ phase = 'done'; paintNext\(\); \}/); assert.match(w, /receipt\?\.classList\.toggle\('is-in', phase === 'done'\)/);
    assert.match(w, /const b = lpBoard\(scene, \{ onWon: deliver \}\);/, 'a drag into Gewonnen by hand delivers too');
    assert.doesNotMatch(w, /sign|sha256|HMAC|JSON\.stringify|X-Upgrads/i);
  });
  test('numbers count up once in view and on a period change; one observer in all; two pointermove listeners; nothing follows the pointer, nothing tilts, nothing reveals on scroll', () => {
    const an = sliceFn(js, 'lpInitAnalytics', 'landing.js');
    assert.match(an, /lpCountUp\(el, value, fmt, 900\)/); assert.match(an, /animateNext = true; render\(\)/); assert.match(an, /threshold: 0\.4/);
    assert.equal(count(js, 'new IntersectionObserver('), 1, 'the figures only; the acts are driven by the scroll itself');
    assert.equal(count(js, "addEventListener('pointermove'"), 2, 'the board\'s drag and the chart\'s tooltip');
    assert.doesNotMatch(js, /window\.addEventListener\('pointermove'|lpInitFx|lpTiltFor|is-tilted|perspective\(|setProperty\('--(mx|my|sx|sy)'|lpInitReveal|lp-reveal/);
  });
  test('all helpers are top-level function declarations; no wall, no stage, no tour, no API calls, no eval, no innerHTML; the boot ends with the acts', () => {
    for (const f of ['lpT', 'lpApplyLang', 'lpSetLang', 'lpFmtEur', 'lpFmtEurShort', 'lpBoardStats', 'lpGetPath', 'lpMapLead', 'lpAmPm', 'lpAddMin', 'lpMeetDay', 'lpEase', 'lpArcPoint', 'lpArcEnds', 'lpFlip', 'lpFly', 'lpCountUp', 'lpToast', 'lpInitBar', 'lpBoard', 'lpInitLeads', 'lpInitRecord', 'lpInitBooking', 'lpInitWon', 'lpInitActs', 'lpInitAnalytics', 'lpInit']) assert.match(js, new RegExp(`^function ${f}\\(`, 'm'), f);
    assert.doesNotMatch(js, /lpInitWall|lpInitIndex|lpInitStage|lpInitWork|lpInitMeet|lpInitTour|lpInitStory|lpInitEngine|lpSign|lpHex|lpTypeInto|crypto\.subtle|getContext\(|fetch\(|\/api\/|\bapi\.(get|post|patch)\(|\beval\(|innerHTML/);
    assert.match(sliceFn(js, 'lpInit', 'landing.js'), /lpInitBar\(\);\s*lpInitRecord\(\);\s*lpInitBooking\(\);\s*lpInitLeads\(\);\s*lpInitWon\(\);\s*lpInitAnalytics\(\);[\s\S]*lpApplyLang\(saved \|\| 'de'\);\s*lpInitActs\(\);\s*\/\/ after the language[^\n]*\n\}$/);
    assert.match(js, /document\.addEventListener\('DOMContentLoaded', lpInit\)/);
  });
});

describe('landing.css', () => {
  test('own file, lp- prefixed and scoped, tokens only, no hex, no gradients, four breakpoints widest first, reduced motion last, nothing forced', () => {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
    const selectors = [...css.matchAll(/^([.#\[:a-z][^{\n]*?)\s*\{/gm)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
    assert.ok(selectors.length > 200, `selectors: ${selectors.length}`);
    for (const s of selectors) for (const part of s.split(',')) assert.match(part.trim(), /^(\.lp-|#lp-|body\.lp|:where\(body\.lp\) h[1-6]|from|to|\d+%)/, part);
    const idx = ['1024px', '900px', '600px', '400px'].map(w => css.indexOf(`@media (max-width: ${w})`));
    assert.ok(idx.every(i => i > 0)); assert.deepEqual([...idx].sort((a, b) => a - b), idx);
    assert.ok(css.indexOf('@media (prefers-reduced-motion: reduce)') > idx[3]);
    assert.doesNotMatch(css, /!important|\[data-theme|text-transform: uppercase/);
    assert.equal((css.match(/gradient\(/g) || []).length, 0);
    const defined = new Set([...style.matchAll(/(--[\w-]+)\s*:/g), ...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
    for (const t of ['--lp-ground: var(--canvas);', '--lp-ink: var(--ink);', '--lp-accent: var(--brand);', '--lp-line: var(--line);']) assert.ok(css.includes(t), t);
    for (const t of ['--lp-wrap: 1080px;', '--lp-wide: 1120px;', '--lp-gutter: clamp(20px, 6vw, 80px);', '--lp-join: clamp(20px, 3vw, 48px);']) assert.ok(css.includes(t), t + ' (the scenes never cover the width: 1120 at most, with a gutter of 6vw up to 80px)');
    assert.doesNotMatch(css, /1440px|1200px/, 'no wider measure anywhere'); assert.equal((css.match(/var\(--lp-join\)/g) || []).length, 5, 'the two scene gaps and the two hairlines share the join measure'); assert.match(css, /\.lp-scene-deal \.lp-record \{ width: min\(880px, 100%\); \}/);
  });
  test('the face is Instrument Sans, self-hosted with its licence, variable in weight; Inter stays inside the surfaces', () => {
    assert.match(css, /@font-face \{ font-family: "Instrument Sans"; font-style: normal; font-weight: 400 700; font-display: swap; src: url\(\/fonts\/InstrumentSans\.woff2\) format\("woff2"\); \}/);
    assert.match(css, /--lp-display: "Instrument Sans", var\(--font\)/); assert.equal((css.match(/@font-face/g) || []).length, 1);
    assert.doesNotMatch(css.replace(/url\("data:[^"]*"\)/g, ''), /https?:\/\//);
    const bytes = fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'InstrumentSans.woff2'));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2'); assert.ok(bytes.length > 15000 && bytes.length < 400000);
    assert.match(fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'OFL-InstrumentSans.txt'), 'utf8'), /SIL Open Font License, Version 1\.1/);
    assert.match(css, /\.lp-surface \{[^}]*font-family: var\(--font\)/); assert.match(css, /\.lp-h1 \{ font-size: clamp\(46px, 7\.6vw, 112px\);[^}]*font-weight: 600;/); assert.match(css, /\.lp-pill \{[^}]*font-family: var\(--lp-display\)/);
    assert.doesNotMatch(html, /Manrope|Schibsted|Bricolage/);
  });
  test('the grammar: a tall act with a screen pinned at the bar (the deal act taller, for its seven phases), the caption above the scene, the line fading between phases; flat surfaces with the app\'s lines, no shadow, no reveal; the opening fills the first screen', () => {
    assert.match(css, /\.lp-act \{ position: relative; height: 240vh; \}\n\.lp-act\[data-act="deal"\] \{ height: 520vh; \}/);
    assert.match(css, /\.lp-pin \{ position: sticky; top: var\(--lp-bar-h\); height: calc\(100vh - var\(--lp-bar-h\)\); display: grid; grid-template-rows: auto minmax\(0, 1fr\);[^}]*overflow: hidden; \}/);
    assert.match(css, /\.lp-cap \{ position: relative; opacity: calc\(\.4 \+ \.6 \* min\(1, var\(--lp-p\) \* 14\)\); translate: 0 calc\(12px \* \(1 - min\(1, var\(--lp-p\) \* 14\)\)\); \}/, 'the caption comes in with the first fourteenth of the act, tied to the scroll');
    assert.match(css, /\.lp-cap \.lp-line \{ transition: opacity \.35s var\(--ease-out\), translate \.35s var\(--ease-out\); \}\n\.lp-cap \.lp-line\.is-swap \{ opacity: 0; translate: 0 6px; \}/);
    assert.match(css, /\.lp-scene \{ position: relative; align-self: center; width: min\(var\(--lp-wide\), 100% - 2 \* var\(--lp-gutter\)\); max-height: 100%; opacity: calc\(\.4 \+ \.6 \* min\(1, var\(--lp-p\) \* 14\)\); \}/); assert.doesNotMatch(css, /^\.lp-scene \{[^}]*(transform|translate|scale)/m, 'no transform on the scene: the dragged card is position: fixed inside it');
    assert.match(css, /--lp-p: 1;/, 'full until the script runs'); assert.match(css, /\.lp-pin \{[^}]*row-gap: clamp\(20px, 4vh, 44px\); padding: clamp\(20px, 4\.5vh, 44px\) 0 clamp\(20px, 4vh, 40px\);/, 'air between the caption and the scene');
    assert.match(css, /\.lp-open-in > \* \{ animation: lp-rise \.8s var\(--ease-out\) both; \}\n\.lp-open-in > :nth-child\(2\) \{ animation-delay: \.08s; \}\n\.lp-open-in > :nth-child\(3\) \{ animation-delay: \.18s; \}\n\.lp-open-in > :nth-child\(4\) \{ animation-delay: \.28s; \}/, 'the one orchestrated moment: the opening, once'); assert.match(css, /\.lp-pan \{[^}]*animation: lp-fade \.3s var\(--ease-out\); \}/, 'a panel fades in when a tab shows it');
    assert.match(css, /\.lp-scene-leads \{ display: grid; grid-template-columns: minmax\(170px, 2fr\) minmax\(0, 9fr\);/); assert.match(css, /\.lp-scene-won \{ display: grid; grid-template-columns: minmax\(0, 9fr\) minmax\(170px, 2fr\);/);
    assert.match(css, /\.lp-marks::after, \.lp-next::before \{ content: ""; position: absolute; top: 50%;/, 'the two hand-overs drawn as hairlines');
    assert.match(css, /\.lp-open \{ min-height: calc\(100vh - var\(--lp-bar-h\)\); display: grid; align-items: center;/);
    assert.match(css, /\.lp-surface \{ position: relative; text-align: left; font-family: var\(--font\);[^}]*background: var\(--surface\); border: 1px solid var\(--lp-line\); border-radius: var\(--r-xl\); overflow: hidden; \}/); assert.doesNotMatch(css, /\.lp-surface \{[^}]*box-shadow/);
    assert.doesNotMatch(css, /\.lp-reveal|\.lp-frame|\.lp-glow|\.lp-tilt|is-tilted|preserve-3d|lp-drift|perspective|\.lp-stage\b|\.lp-how|\.lp-wk-|\.lp-cal\b|\.lp-chat|\.lp-msg|lp-blink|\.lp-beat|\.lp-st-|\.lp-split|\.lp-steps|\.lp-tour|\.lp-spot|\.lp-tip/);
    assert.match(css, /\.lp-src\.is-sent \{ border-color: var\(--lp-accent\);/, 'a platform that has sent lights up'); assert.match(css, /\.lp-card\.is-lifted \{ z-index: 6; box-shadow: var\(--shadow-lg\);[^}]*transition: none; \}/, 'the travelling card rides above the board');
    assert.deepEqual([...css.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]), ['lp-fade', 'lp-pulse', 'lp-flash', 'lp-hit', 'lp-pop', 'lp-rise']);
    assert.match(css, /\.lp-card \{[^}]*touch-action: none/); assert.match(css, /@media \(pointer: coarse\) \{ \.lp-card \{ touch-action: pan-y; \} \}/);
    assert.match(css, /\.lp-sheet \{ position: absolute; inset: 10px; z-index: 7;/);
    assert.doesNotMatch(css, /^body\.lp h[1-6]\b/m); assert.doesNotMatch(css, /> \* \{[^}]*position/);
  });
  test('responsive, widest first; reduced motion unpins every act and stops every animation', () => {
    const at = w => { const i = css.indexOf(`@media (max-width: ${w}px)`); const j = css.indexOf('@media', i + 1); return css.slice(i, j < 0 ? undefined : j); };
    const lap = at(1024), tab = at(900), ph = at(600), sm = at(400);
    assert.match(lap, /\.lp-scene-leads \{ grid-template-columns: minmax\(150px, 2fr\) minmax\(0, 8fr\); \}/);
    assert.match(tab, /\.lp-scene-leads, \.lp-scene-won \{ grid-template-columns: 1fr; gap: 16px; \}/); assert.match(tab, /\.lp-src-list \{ flex-direction: row; flex-wrap: wrap; \}/); assert.match(tab, /\.lp-board \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); min-height: 0; \}/); assert.doesNotMatch(css, /\.lp-board \{[^}]*overflow-x: auto/);
    assert.match(ph, /\.lp-bar-links > a:not\(\.lp-pill\) \{ display: none; \}/); assert.doesNotMatch(css, /\.lp-lang \{ display: none/); assert.match(ph, /\.lp-vs-head \{ display: none; \}\n\s*\.lp-vs-row \{ grid-template-columns: 1fr; gap: 6px; \}/); assert.match(ph, /\.lp-sheet \{ inset: 6px; padding: 12px; \}/);
    assert.match(sm, /\.lp-actions \{ flex-direction: column; align-items: stretch; \}\n\s*\.lp-actions \.lp-pill \{ width: 100%; \}/);
    assert.match(css, /body\.lp \{[^}]*overflow-x: hidden;/); assert.doesNotMatch(css, /(?<![\w-])width: \d{3,}px/);
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(rm, /\.lp-act, \.lp-act\[data-act="deal"\] \{ height: auto; padding: var\(--lp-sec\) 0; \}\n\s*\.lp-pin \{ position: static; height: auto; overflow: visible; \}/, 'nothing pins'); assert.match(rm, /\.lp-cap, \.lp-scene \{ opacity: 1; translate: none; \}/); assert.match(rm, /\.lp-open-in > \*, \.lp-pan, /, 'the opening and the panels stand still'); assert.match(rm, /animation: none; \}/); assert.match(rm, /transition: none; \}/);
  });
  test('the stylesheet parses; the app stylesheet is untouched', () => {
    let depth = 0, inC = false;
    for (let i = 0; i < css.length; i++) {
      if (inC) { if (css[i] === '*' && css[i + 1] === '/') { inC = false; i++; } continue; }
      if (css[i] === '/' && css[i + 1] === '*') { inC = true; i++; continue; }
      if (css[i] === '{') depth++; if (css[i] === '}') depth--;
      assert.ok(depth >= 0);
    }
    assert.equal(depth, 0); assert.equal(inC, false);
    assert.doesNotMatch(style, /\.lp-/);
  });
});

// Part 24 (2026-10-15) pinned the second page's absence here; Part 25 (the same day) built a new second page at
// /landingpagetwo to compare against this one, so that block is gone again. Both pages stay until one is chosen.
