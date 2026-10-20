// CLIENT (static + pure-function) tests for the public landing page at /landingpage.
// Part 36 (2026-10-20, from scratch as the second design at /landingpagetwo), Part 37 (the retouch: the hero says what
// Upgrads is beside one deal's week, the steps are numbered and coloured, the way in is three plain steps, Figtree, a
// friendlier navy), Part 38 (chosen: it moved to landingpage.html / landing.css / js/landing.js, the film that was here
// is deleted with its face, and /landingpagetwo redirects here).
// The page: the hook "Das CRM, das den Kleinkram übernimmt." beside a deal card whose three numbered, coloured lines
// lead to the three steps; the Monday wipe (the desk as it usually is and the same things in Upgrads; a line dragged to
// the right tidies up); three steps to do by hand (a lead arrives, the calendar has a say, the card goes to Won and the
// Engine takes over), each answered by the product and by a hand-written note in the margin; two questions; the way in.
// Pinned: the route and the redirect, the CSP-safe document, Figtree and Shantell Sans self-hosted with their licences,
// the film and every earlier design gone, the wipe (markup, the clip, the pointer and keyboard contracts, the one nudge),
// the hand (notes that answer, arrows that redraw), every step's contract and the app's own words, German first and
// equal to the dictionary key for key, impersonal German, the caps on words, the claims audit (plus the tells of
// generated copy), and the stylesheet audit: every class used has a rule and every rule is used, every token resolves,
// hex only for the desk's materials, every property is real, every spacing value is on the scale, no selector is
// declared twice, breakpoints descend, reduced motion comes last.
// Part 39 (the same day): the break, a falling-block game behind a dim little block in the footer. Part 40: the game
// moved to /js/break-game.js + /break-game.css (shared with the app, its own suite: break-game.test.js) and gained
// hold and a high score board; here: the button, the wiring, and every word the game asks for in both languages.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const server = read('server.js');
const html   = read('public/landingpage.html');
const css    = read('public/landing.css');
const js     = read('public/js/landing.js');
const style  = read('public/style.css');
const dict   = new Function(sliceConst('public/js/landing.js', 'MO_I18N').replace(/^[^{]*/, 'return '))();
const app    = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pool   = new Function(sliceConst('public/js/landing.js', 'MO_LEAD_POOL').replace(/^[^{]*/, 'return '))();
const leads0 = new Function('return ' + js.match(/\nlet moLeads = (\[[\s\S]*?\n\]);/)[1])();
const events0 = new Function('return ' + js.match(/\nlet moEvents = (\[[\s\S]*?\n\]);/)[1])();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words  = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const block  = (startMark, endMark) => { const s = html.indexOf(startMark); assert.ok(s >= 0, startMark); return html.slice(s, html.indexOf(endMark, s)); };
const fnBody = name => { const i = js.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const s = js.indexOf('{', i); let d = 0; for (let j = s; j < js.length; j++) { if (js[j] === '{') d++; else if (js[j] === '}' && !--d) return js.slice(s, j + 1); } return ''; };
const same   = (k, appKey) => { for (const lang of ['de', 'en']) { assert.ok(appKey in app[lang], `${appKey} is an app key`); assert.equal(dict[lang][k], app[lang][appKey], `${lang} ${k} = app ${appKey}`); } };
const PAGE_KEYS = Object.keys(dict.de).filter(k => /^mo_(hero_|wipe_(t|d|with|without)$|m\d_|faq_|q\d$|a\d$|c\d$|close_|foot_|n_[a-z]+_idle$|login|request|crm$|lang$)/.test(k));
const USED_HOOKS = ['Gewonnen ist erst der Anfang.', 'Nur noch verkaufen.', 'Nur auf Einladung.', 'Just sell.', 'The CRM that keeps working.', 'Leads arrive. Deals depart.', 'One card. Drag it to Won.', 'Alles nach dem Klick.', 'Everything after the click.', 'Vier Handgriffe gestrichen.', 'Four chores, crossed off.', 'Verkaufen ist schon schwer genug.', 'Selling is hard enough.'];

// ── a small stylesheet parser: rules with their declarations, and the at-rule they sit in ─────────────
function parseCss(src) {
  const rules = []; let i = 0; const stack = [];
  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  while (i < src.length) {
    skipWs(); if (i >= src.length) break;
    if (src[i] === '}') { stack.pop(); i++; continue; }
    const open = src.indexOf('{', i); const selector = src.slice(i, open).trim();
    if (/^@(media|keyframes|supports)/.test(selector)) { stack.push(selector); i = open + 1; continue; }
    const close = src.indexOf('}', open);
    const decls = src.slice(open + 1, close).split(/;(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(d => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });
    rules.push({ selector, decls, in: stack.join(' > ') });
    i = close + 1;
  }
  return rules;
}
const rules = parseCss(bare);
const classesIn = s => [...s.matchAll(/\.(mo-[a-z0-9-]+|is-[a-z-]+)/g)].map(m => m[1]);
const cssClasses = new Set(rules.flatMap(r => r.selector.startsWith('@') ? [] : classesIn(r.selector)));
// class tokens the markup and the script use: static attributes, template attributes with `${…}` cut out, classList calls, state strings
const stripped = (() => { let s = js; for (let n = 0; n < 10; n++) s = s.replace(/\$\{[^{}]*\}/g, ' '); return s; })();
const usedClasses = new Set();
for (const src of [html, stripped]) for (const m of src.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/class="([^"$]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));   // class attributes inside nested templates
for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/className = '([^']+)'/g)) m[1].split(' ').forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/'(?: )?((?:mo|is)-[a-z0-9-]+)'/g)) usedClasses.add(m[1]);
const dynamicPrefixes = [...new Set([...js.matchAll(/((?:mo|is)-[a-z0-9-]*)(?=\$\{)/g)].map(m => m[1]))];
const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]).concat([...js.matchAll(/ id="([^"$]+)"/g)].map(m => m[1])));

describe('route', () => {
  test('/landingpage serves public/landingpage.html; /landingpagetwo, its old address, redirects there for good; both before the SPA catch-all', () => {
    const r1 = server.indexOf("app.get('/landingpage'"), r2 = server.indexOf("app.get('/landingpagetwo'"), catchAll = server.indexOf("app.get('*'") >= 0 ? server.indexOf("app.get('*'") : server.indexOf("app.get(/");
    assert.ok(r1 >= 0 && r2 > r1, 'route order');
    assert.match(server, /app\.get\('\/landingpage', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'public', 'landingpage\.html'\)\)\);/);
    assert.match(server, /app\.get\('\/landingpagetwo', \(req, res\) => res\.redirect\(301, '\/landingpage'\)\);/);
    if (catchAll >= 0) assert.ok(r2 < catchAll, 'before the catch-all');
    assert.match(read('readmedev.md'), /GET \/landingpage    → public\/landingpage\.html/);
    assert.match(read('readmedev.md'), /GET \/landingpagetwo → 301 to \/landingpage/);
    assert.doesNotMatch(server, /landingpagetwo\.html|landing2\.css|landing2\.js/);
  });
  test('the page that was here (the scroll film) is gone with its face; the second design\'s files are gone, it lives here now', () => {
    for (const f of ['public/landingpagetwo.html', 'public/landing2.css', 'public/js/landing2.js', 'tests/client/landing-page-two.test.js', 'public/fonts/InstrumentSans.woff2', 'public/fonts/OFL-InstrumentSans.txt', 'public/fonts/Manrope.woff2', 'public/fonts/OFL-Manrope.txt']) assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} gone`);
    assert.doesNotMatch(html + css + js, /\blp-|LP_I18N|lpInit|Instrument Sans/, 'nothing of the film is left');
    assert.match(js, /^const MO_I18N = \{/m);
  });
});

describe('the document', () => {
  test('the head: German, the app in dark, the root class, both faces and Inter preloaded, the app stylesheet first, one script', () => {
    assert.match(head, /<html lang="de" data-theme="dark" class="mo-root">/);
    assert.match(head, /<meta name="color-scheme" content="dark">/);
    assert.match(head, /<meta name="description" content="Upgrads CRM: Das CRM, das den Kleinkram übernimmt\./);
    assert.match(head, /<title>Upgrads CRM<\/title>/);
    for (const f of ['Figtree', 'ShantellSans', 'inter-latin-wght']) assert.match(head, new RegExp(`<link rel="preload" href="/fonts/${f}\\.woff2" as="font" type="font/woff2" crossorigin>`));
    assert.ok(head.indexOf('href="/style.css"') < head.indexOf('href="/landing.css"'));
    assert.doesNotMatch(head, /https?:\/\//, 'no external host in the head');
    assert.equal((html.match(/<script/g) || []).length, 2, 'the shared game, then the page');
    assert.match(html, /<script src="\/js\/break-game\.js"><\/script>\s*<script src="\/js\/landing\.js"><\/script>\s*<\/body>/);
    assert.ok(head.indexOf('href="/landing.css"') < head.indexOf('href="/break-game.css"'), 'the game\'s stylesheet after the page\'s');
  });
  test('Figtree (the voice) and Shantell Sans (the hand) are self-hosted with their licences; the faces of the earlier pages are gone', () => {
    for (const [f, min] of [['Figtree', 15000], ['ShantellSans', 60000]]) {
      const p = path.join(ROOT, `public/fonts/${f}.woff2`);
      assert.ok(fs.existsSync(p) && fs.statSync(p).size > min, `${f}.woff2 present`);
      assert.match(fs.readFileSync(path.join(ROOT, `public/fonts/OFL-${f}.txt`), 'utf8'), /SIL Open Font License, Version 1\.1/);
    }
    assert.match(bare, /@font-face \{ font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url\(\/fonts\/Figtree\.woff2\) format\("woff2"\); \}/);
    assert.match(bare, /@font-face \{ font-family: "Shantell Sans"; font-style: normal; font-weight: 400 700; font-display: swap; src: url\(\/fonts\/ShantellSans\.woff2\) format\("woff2"\); \}/);
    assert.equal((bare.match(/@font-face/g) || []).length, 2, 'two faces: Inter comes from style.css');
    for (const f of ['InstrumentSans', 'Manrope', 'Besley', 'FunnelDisplay', 'Onest', 'AlbertSans', 'SofiaSans', 'SofiaSansCondensed', 'HostGrotesk', 'Jost', 'Syne', 'Epilogue', 'FamiljenGrotesk', 'Newsreader', 'Sora', 'InstrumentSerif', 'Archivo']) {
      assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/${f}.woff2`)), `${f}.woff2 gone`);
      assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/OFL-${f}.txt`)), `OFL-${f}.txt gone`);
    }
  });
  test('the hook is its own, not one of the earlier designs\' hooks', () => {
    for (const lang of ['de', 'en']) assert.ok(!USED_HOOKS.includes(dict[lang].mo_hero_t), `${lang}: a hook not used before`);
  });
  test('the sprite holds exactly the icons, marks and hand-drawn arrows the page uses; the arrows draw by length; no inline style anywhere', () => {
    const syms = [...html.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(syms, ['mo-i-phone', 'mo-i-message', 'mo-i-mail', 'mo-i-calendar', 'mo-i-globe', 'mo-i-grip', 'mo-i-plus', 'mo-i-chevron', 'mo-i-blocks', 'mo-a-up', 'mo-a-right', 'mo-l-fb', 'mo-l-ig', 'mo-l-tt']);
    const used = new Set([...js.matchAll(/moIcon\('([a-z-]+)'/g)].map(m => 'mo-i-' + m[1]).concat([...(html + js).matchAll(/href="#(mo-[ila]-[a-z-]+)"/g)].map(m => m[1])));
    for (const s of syms) assert.ok(used.has(s), `${s} is used`);
    for (const u of used) assert.ok(syms.includes(u), `${u} exists`);
    for (const a of ['mo-a-up', 'mo-a-right']) assert.match(html, new RegExp(`<symbol id="${a}" viewBox="[^"]+"><path pathLength="1" d="`));
    assert.doesNotMatch(body, /style="/, 'no inline styles in the markup');
    assert.doesNotMatch(js, /style="|\.style\.(?!setProperty)/, 'the script only sets custom properties');
  });
  test('the page scrolls like a page: nothing sticky, the bar not fixed, only the flight layer, the drag ghost and the toasts are fixed', () => {
    const fixed = rules.filter(r => r.decls.some(([p, v]) => p === 'position' && v === 'fixed')).map(r => r.selector);
    assert.deepEqual(fixed, ['.mo-ghost', '.mo-fly', '.mo-toasts']);
    assert.ok(!rules.some(r => r.decls.some(([p, v]) => p === 'position' && v === 'sticky')));
    assert.doesNotMatch(bare, /overflow: hidden; overscroll|html\.mo-root, body\.mo \{ height/, 'no pager: the document scrolls');
    assert.doesNotMatch(js, /addEventListener\('scroll'|scrollY|scrollTo\(|'wheel'/, 'nothing listens to the scroll');
  });
});

describe('the hero and the way in', () => {
  test('the bar; the hero says what Upgrads is, with the request and the sign-in as two buttons and a note', () => {
    const bar = block('<header class="mo-bar">', '</header>');
    assert.match(bar, /<a class="mo-brand" href="#top"><img src="\/images\/logo\.png" alt="Upgrads"><span data-i18n="mo_crm">CRM<\/span><\/a>/);
    assert.match(bar, /data-lang="de" aria-pressed="true">DE<\/button>/); assert.match(bar, /data-lang="en" aria-pressed="false">EN<\/button>/);
    assert.match(bar, /<a class="mo-pill mo-pill-sm" href="mailto:team@upgrads\.de\?subject=Zugang%20zu%20Upgrads%20CRM" data-i18n="mo_request">Zugang anfragen<\/a>/);
    const hero = block('<section class="mo-hero">', '</section>');
    assert.match(hero, /<h1 class="mo-h1" data-i18n="mo_hero_t">Das CRM, das den Kleinkram übernimmt\.<\/h1>/);
    assert.match(hero, /<a class="mo-pill" href="mailto:team@upgrads\.de\?subject=Zugang%20zu%20Upgrads%20CRM" data-i18n="mo_request">Zugang anfragen<\/a>\s*<a class="mo-pill mo-pill-ghost" href="\/" data-i18n="mo_login">Anmelden<\/a>/);
    assert.match(hero, /<p class="mo-small" data-i18n="mo_hero_note">/);
    assert.equal(dict.en.mo_hero_t, 'The CRM that handles the small stuff.');
    for (const lang of ['de', 'en']) assert.match(dict[lang].mo_hero_t, /\bCRM\b/, `${lang}: the hook names what it is`);
    assert.match(bare, /^\.mo-hero-grid \{ display: grid; grid-template-columns: minmax\(0, 6fr\) minmax\(0, 5fr\);/m);
  });
  test('the hero card: one deal, won, and the three things that happened this week, each numbered, coloured and linked to its step below', () => {
    const card = block('<aside class="mo-hcard"', '</aside>');
    assert.match(card, /<span class="mo-stage mo-s4"><span class="mo-dot"><\/span><span data-i18n="mo_st_won">Gewonnen<\/span><\/span>/);
    const steps = [...card.matchAll(/<li><a class="mo-hstep mo-c(\d)" href="#([a-z]+)"><span class="mo-num" aria-hidden="true">(\d)<\/span><span class="mo-hstep-text"><span class="mo-hstep-what" data-i18n="mo_hero_l(\d)">/g)];
    assert.deepEqual(steps.map(m => [m[1], m[2], m[3], m[4]]), [['1', 'leads', '1', '1'], ['2', 'termin', '2', '2'], ['3', 'gewonnen', '3', '3']]);
    for (const [n, id] of [[1, 'leads'], [2, 'termin'], [3, 'gewonnen']]) assert.match(body, new RegExp(`<section class="mo-sec" id="${id}" aria-labelledby="mo-m${n}-t">\\s*<div class="mo-wrap">\\s*<div class="mo-panel mo-moment mo-c${n}">\\s*<div class="mo-copy">\\s*<span class="mo-num mo-num-lg" aria-hidden="true">${n}</span>`), `step ${n} carries the same number and colour`);
    assert.match(card, /<span class="mo-hstep-when" data-i18n="mo_onb_s1">Formular versendet<\/span>/, 'the third says what the Engine did first');
    for (const [n, tok] of [[1, 'info'], [2, 'warning'], [3, 'success']]) assert.match(bare, new RegExp(`^\\.mo-c${n} \\{ --mo-step: var\\(--${tok}\\); \\}$`, 'm'));
    assert.match(bare, /^\.mo-panel \{[^}]*border-radius: 28px; background: color-mix\(in srgb, var\(--mo-step\) 7%, var\(--mo-ground\)\); \}$/m);
    assert.match(bare, /^\.mo-sec \{ padding-top: var\(--mo-sec\); scroll-margin-top: 24px; \}$/m);
    assert.match(bare, /@media \(prefers-reduced-motion: no-preference\) \{\s*html\.mo-root \{ scroll-behavior: smooth; \}\s*\}/, 'the jump to a step glides, except under reduced motion');
  });
  test('the way in: a question, a line, the request and the sign-in as real buttons, and the three steps it takes; no sticky note', () => {
    const close = block('<section class="mo-close">', '</section>');
    assert.match(close, /<h2 class="mo-h2" data-i18n="mo_close_t">Bereit für weniger Kleinkram\?<\/h2>/);
    assert.match(close, /<a class="mo-pill" href="mailto:team@upgrads\.de\?subject=Zugang%20zu%20Upgrads%20CRM" data-i18n="mo_request">Zugang anfragen<\/a>\s*<a class="mo-pill mo-pill-ghost" href="\/" data-i18n="mo_login">Anmelden<\/a>/);
    const steps = [...close.matchAll(/<li class="mo-cstep"><span class="mo-num" aria-hidden="true">(\d)<\/span><span data-i18n="mo_c(\d)">/g)].map(m => [m[1], m[2]]);
    assert.deepEqual(steps, [['1', '1'], ['2', '2'], ['3', '3']]);
    assert.doesNotMatch(html + css, /mo-sticky-cta/);
    assert.match(dict.de.mo_c1, /team@upgrads\.de/);
    assert.match(dict.de.mo_c2, /Mitglied, Admin oder Inhaber/); assert.match(dict.en.mo_c2, /member, admin or owner/);
    assert.match(bare, /^\.mo-cta \{ --mo-step: var\(--brand\);/m);
    assert.match(html, /<p data-i18n="mo_foot_fiction">Alle Namen und Zahlen auf dieser Seite sind erfunden\.<\/p>/);
  });
});

describe('the Monday wipe', () => {
  const wipe = block('<div class="mo-wipe" id="mo-wipe"', '<p class="mo-note mo-note-wipe"');
  test('two layers of the same three cells: the desk below, the product on top; the handle; a range for the keyboard', () => {
    assert.match(wipe, /<div class="mo-wipe" id="mo-wipe" role="group" data-i18n-aria="mo_wipe_aria" aria-label="Derselbe Montag, ohne und mit Upgrads">/);
    const before = wipe.slice(wipe.indexOf('<div class="mo-layer mo-before">'), wipe.indexOf('<div class="mo-layer mo-after mo-app">'));
    const after = wipe.slice(wipe.indexOf('<div class="mo-layer mo-after mo-app">'), wipe.indexOf('<div class="mo-handle"'));
    assert.equal((before.match(/<div class="mo-cell">/g) || []).length, 3);
    assert.equal((after.match(/<div class="mo-cell">/g) || []).length, 3);
    for (const o of ['mo-mail', 'mo-xls', 'mo-phone', 'mo-sticky', 'mo-cal', 'mo-todo']) assert.match(before, new RegExp(`class="mo-obj ${o}"`), o);
    assert.equal((before.match(/Tom Riedel/g) || []).length, 2, 'the spreadsheet has the duplicate');
    assert.match(before, /<span class="mo-scrawl" data-i18n="mo_x_twice">doppelt\?<\/span>/);
    for (const o of ['mo-col mo-s0', 'mo-rec', 'mo-meet', 'mo-eng-mini']) assert.match(after, new RegExp(`class="${o}"`), o);
    assert.match(after, /<span class="mo-col-n">3<\/span>/); assert.equal((after.match(/Tom Riedel/g) || []).length, 1, 'Upgrads has him once');
    assert.match(wipe, /<div class="mo-handle" aria-hidden="true"><span class="mo-grip"><svg class="mo-ic" aria-hidden="true"><use href="#mo-i-grip"\/><\/svg><\/span><\/div>/);
    assert.match(wipe, /<input class="mo-wipe-range" id="mo-wipe-range" type="range" min="0" max="100" step="1" value="12" data-i18n-aria="mo_wipe_range" aria-label="[^"]+">/);
    assert.match(block('<div class="mo-wipe-labels"', '</div>'), /<span class="mo-tagline mo-tagline-with" data-i18n="mo_wipe_with">Mit Upgrads<\/span><span class="mo-tagline" data-i18n="mo_wipe_without">Ohne Upgrads<\/span>/);
  });
  test('the stylesheet: the product layer is clipped to [0, cut]; the line sits at the cut; a vertical swipe still scrolls; the keyboard focus shows on the whole desk', () => {
    assert.match(bare, /^\.mo-after \{ position: absolute; inset: 0; z-index: 1; background: var\(--canvas\); clip-path: inset\(0 calc\(100% - var\(--mo-cut\)\) 0 0\); \}$/m);
    assert.match(bare, /^\.mo-handle \{[^}]*left: var\(--mo-cut\);[^}]*pointer-events: none; \}$/m);
    assert.match(bare, /^\.mo-wipe \{[^}]*cursor: ew-resize; touch-action: pan-y; user-select: none;/m);
    assert.match(bare, /^\.mo-wipe:has\(\.mo-wipe-range:focus-visible\) \{ outline: 2px solid var\(--focus\); outline-offset: 4px; \}$/m);
    assert.match(bare, /^\.mo-layer \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-auto-rows: 340px; \}$/m);
    assert.match(bare, /@media \(max-width: 860px\) \{[\s\S]*?\.mo-layer \{ grid-template-columns: minmax\(0, 1fr\); grid-auto-rows: 300px; \}/, 'on a phone the cells stack and the same line wipes all three');
    assert.match(bare, /^\.mo-wipe-range \{[^}]*opacity: 0; pointer-events: none; \}$/m);
  });
  test('moSetCut writes only the custom property and the range (value and spoken value); a mouse moves the line at once, a finger only after 6 px sideways', () => {
    const s = fnBody('moSetCut'), i = fnBody('moInitWipe');
    assert.match(s, /MO_W\.cut = moClamp\(v, 0, 100\);\s*stage\.style\.setProperty\('--mo-cut', MO_W\.cut\.toFixed\(2\) \+ '%'\);/);
    assert.match(s, /range\.value = String\(Math\.round\(MO_W\.cut\)\); range\.setAttribute\('aria-valuetext', moT\('mo_wipe_value', \{ n: Math\.round\(MO_W\.cut\) \}\)\);/);
    assert.match(s, /if \(byHand\) moWipeNote\(\);/);
    assert.match(i, /if \(e\.pointerType === 'mouse'\) \{ e\.preventDefault\(\); engage\(e\); \}/);
    assert.match(i, /if \(!d\.live\) \{ const dx = Math\.abs\(e\.clientX - d\.x\), dy = Math\.abs\(e\.clientY - d\.y\); if \(dx > 6 && dx > dy\) engage\(e\); return; \}/);
    assert.match(i, /const engage = e => \{ MO_W\.drag\.live = true; stage\.setPointerCapture\(e\.pointerId\); stage\.classList\.add\('is-dragging'\); moStopNudge\(\); moSetCut\(at\(e\), true\); \};/);
    assert.match(i, /range\.addEventListener\('input', \(\) => \{ moStopNudge\(\); moSetCut\(\+range\.value, true\); \}\);/);
    assert.match(js, /^const MO_W = \{ cut: 12, done: false, drag: null, touched: false, raf: 0 \};$/m, 'starts with a sliver of order at the left');
  });
  test('the one unasked movement: once, when the desk is first 60 % in view, the line leans 22 points right and back over 1.4 s; never under reduced motion; any touch cancels it', () => {
    const i = fnBody('moInitWipe'), n = fnBody('moNudge');
    assert.match(i, /if \('IntersectionObserver' in window && !moReduced\(\)\) \{\s*const io = new IntersectionObserver\(entries => \{ if \(entries\.some\(en => en\.isIntersecting\)\) \{ io\.disconnect\(\); moNudge\(\); \} \}, \{ threshold: \.6 \}\);/);
    assert.match(n, /if \(MO_W\.touched \|\| moReduced\(\)\) return;/);
    assert.match(n, /dur = 1400/); assert.match(n, /moSetCut\(from \+ 22 \* Math\.sin\(Math\.PI \* p\), false\);/);
    assert.match(fnBody('moStopNudge'), /MO_W\.touched = true; cancelAnimationFrame\(MO_W\.raf\);/);
    assert.equal((js.match(/IntersectionObserver\(/g) || []).length, 1, 'one observer');
    assert.equal((js.match(/requestAnimationFrame\(/g) || []).length, 2, 'the nudge only: the game\'s loop lives in break-game.js');
  });
  test('the hand answers the wipe: nearly tidy says so; going back to the mess after that asks', () => {
    const F = loadFns('public/js/landing.js', ['moWipeNote'], { state: { MO_W: { cut: 12, done: false } }, extra: 'const __notes = []; function moNote(n, k) { __notes.push(k); } function __w() { return MO_W; }', expose: ['__notes', '__w'] });
    const at = v => { F.__w().cut = v; F.moWipeNote(); };
    at(50); assert.deepEqual(F.__notes, [], 'halfway says nothing');
    at(5); assert.deepEqual(F.__notes, [], 'back before done says nothing');
    at(90); assert.deepEqual(F.__notes, ['mo_n_wipe_done']);
    at(60); at(7); assert.deepEqual(F.__notes, ['mo_n_wipe_done', 'mo_n_wipe_back']);
    at(3); assert.equal(F.__notes.length, 2, 'asked once');
    assert.equal(dict.de.mo_n_wipe_done, 'Schon besser.'); assert.equal(dict.en.mo_n_wipe_back, 'Back to the chaos?');
  });
});

describe('the hand: notes in the margin', () => {
  test('four notes, each starting with what to try; the arrow is part of the note', () => {
    const notes = [...body.matchAll(/<p class="mo-note[^"]*" data-note="([a-z]+)">([\s\S]*?)<\/p>/g)];
    assert.deepEqual(notes.map(m => m[1]), ['wipe', 'leads', 'cal', 'won']);
    for (const [, name, inner] of notes) {
      assert.match(inner, new RegExp(`<span class="mo-note-text" data-i18n="mo_n_${name}_idle">`), name);
      assert.match(inner, /<svg class="mo-scribble mo-scribble-(up|side)" aria-hidden="true"><use href="#mo-a-(up|right)"\/><\/svg>/, name);
    }
    assert.match(js, /^const MO_NOTES = \{ wipe: 'mo_n_wipe_idle', leads: 'mo_n_leads_idle', cal: 'mo_n_cal_idle', won: 'mo_n_won_idle' \};$/m);
  });
  test('moNote swaps the words and redraws the arrow only when the words change (never under reduced motion); a language switch keeps what the hand last said', () => {
    const n = fnBody('moNote');
    assert.match(n, /const changed = MO_NOTES\[name\] !== key;\s*MO_NOTES\[name\] = key;/);
    assert.match(n, /if \(changed && !moReduced\(\)\) \{ el\.classList\.remove\('is-fresh'\); void el\.offsetWidth; el\.classList\.add\('is-fresh'\); \}/);
    assert.match(fnBody('moApplyLang'), /document\.querySelectorAll\('\[data-i18n\]'\)[\s\S]*moRefreshNotes\(\);/, 'the notes are rewritten after the generic pass');
    assert.match(bare, /^\.mo-scribble \{[^}]*stroke-dasharray: 1; stroke-dashoffset: 0; \}$/m);
    assert.match(bare, /^\.mo-note\.is-fresh \.mo-scribble \{ animation: mo-draw \.7s var\(--ease-out\) both; \}$/m);
    assert.match(bare, /@keyframes mo-draw \{ from \{ stroke-dashoffset: 1; \} to \{ stroke-dashoffset: 0; \} \}/);
    assert.match(bare, /^\.mo-note \{[^}]*font-family: var\(--mo-script\);[^}]*color: var\(--mo-marker\); transform: rotate\(-1deg\);/m, 'a light tilt: friendly, still easy to read');
  });
});

describe('moment one: a lead arrives', () => {
  test('four sources with their marks; the first stage; a tap flies the mark in, then the lead lands', () => {
    const sec = block('<section class="mo-sec" id="leads" aria-labelledby="mo-m1-t">', '</section>');
    assert.match(sec, /<h2 class="mo-h2" id="mo-m1-t" data-i18n="mo_m1_t">Leads tippt hier niemand mehr ab\.<\/h2>/);
    for (const [src, mark] of [['fb', '#mo-l-fb'], ['ig', '#mo-l-ig'], ['tt', '#mo-l-tt'], ['web', '#mo-i-globe']]) assert.match(sec, new RegExp(`<button type="button" class="mo-src" data-src="${src}"><svg class="(mo-logo|mo-ic mo-logo)" aria-hidden="true"><use href="${mark}"/></svg><span data-i18n="mo_src_${src}">`));
    assert.match(sec, /<div class="mo-inbox" id="mo-inbox" role="group" data-i18n-aria="mo_inbox_aria" aria-label="Erste Phase"><\/div>/);
    assert.match(fnBody('moInitSources'), /if \(b\) moFly\(b\.dataset\.src, \(\) => moArrive\(b\.dataset\.src\)\);/);
    const f = fnBody('moFly');
    assert.match(f, /if \(!from \|\| !to \|\| !host \|\| moReduced\(\) \|\| typeof host\.animate !== 'function'\) \{ land\(\); return; \}/);
    assert.match(f, /\{ transform: `translate\(\$\{mx\}px, \$\{my\}px\)`, offset: \.5 \}/);
    assert.match(f, /\{ duration: 600, easing: 'cubic-bezier\(\.3, \.6, \.2, 1\)', fill: 'forwards' \}/);
    assert.match(f, /anim\.onfinish = \(\) => \{ el\.remove\(\); land\(\); \};/);
    assert.match(fnBody('moRenderInbox'), /moLeads\.slice\(0, 5\)\.map\(moLeadCard\)/, 'five cards at most; the count says the rest');
  });
  test('what the webhook does: a new person is a new card; a known email updates the contact, moves it up, never a twin; nobody is notified', () => {
    for (const s of ['fb', 'ig', 'tt']) assert.ok(leads0.some(l => l.email === pool[s][1][1]), `${s}: the second lead is someone already there`);
    assert.equal(pool.web[1][1], pool.fb[0][1], 'the website sends someone Facebook sent before');
    const F = loadFns('public/js/landing.js', ['moArrive'], { state: { moLeads: leads0, moLeadIx: { fb: 0, ig: 0, tt: 0, web: 0 } }, extra: `const MO_LEAD_POOL = ${JSON.stringify(pool)}; const __notes = []; function moNote(n, k) { __notes.push(k); } function moRenderInbox() {} function __leads() { return moLeads; }`, expose: ['__notes', '__leads'] });
    F.moArrive('fb');
    assert.equal(F.__leads().length, 4); assert.equal(F.__leads()[0].name, 'Eva Schulz'); assert.equal(F.__leads()[0].fresh, true);
    F.moArrive('fb');
    assert.equal(F.__leads().length, 4, 'Jonas Weber again: no twin'); assert.equal(F.__leads()[0].name, 'Jonas Weber'); assert.equal(F.__leads()[0].touched, true);
    assert.equal(F.__leads().filter(l => l.touched).length, 1, 'only the last arrival is marked');
    F.moArrive('web'); F.moArrive('web');
    assert.equal(F.__leads().length, 5); assert.equal(F.__leads()[0].name, 'Eva Schulz'); assert.equal(F.__leads()[0].touched, true);
    assert.deepEqual(F.__notes, ['mo_n_leads_one', 'mo_n_leads_known', 'mo_n_leads_one', 'mo_n_leads_known']);
    assert.doesNotMatch(fnBody('moArrive'), /moToast/, 'the lead webhook notifies nobody');
  });
});

describe('moment two: the calendar has a say', () => {
  test('the sheet in the app\'s words beside the week; the conflict block is the app\'s; the button says what will happen', () => {
    const b = fnBody('moRenderBook');
    assert.match(b, /moT\('mo_book_title', \{ name: 'Marie Lindner' \}\)/);
    assert.match(b, /<div class="mo-conflict" role="alert">\$\{conflicts\.map\(c => `<p>\$\{moEsc\(moT\('mo_book_conflict', \{ time: c\.start, title: moT\(c\.key\), who: MO_PEOPLE\[c\.who\] \}\)\)\}<\/p>`\)\.join\(''\)\}<p>\$\{moEsc\(moT\('mo_book_conflict_hint'\)\)\}<\/p><\/div>/);
    assert.match(b, /id="mo-book-go"\$\{B\.slot \? '' : ' disabled'\}>\$\{moEsc\(moT\(conflicts\.length \? 'mo_book_anyway' : 'mo_book_submit'\)\)\}/);
    assert.match(js, /^let moBookState = \{ day: 1, slot: null \};$/m, 'Tuesday is picked, the time is not');
    for (const k of ['title', 'date', 'time', 'submit', 'anyway', 'conflict', 'conflict_hint', 'done']) same(`mo_book_${k}`, `cal_book_${k}`);
  });
  test('the hand: a clash says "Ups"; the first free pick after it says "Frei"; booking says who sends the invite; undo takes it back', () => {
    const F = loadFns('public/js/landing.js', ['moCalNote', 'moConflict', 'moMin'], { state: { moBookState: { day: 1, slot: '11:00' }, moEvents: events0, MO_NOTES: { cal: 'mo_n_cal_idle' } }, extra: 'const __notes = []; function moNote(n, k) { __notes.push(k); MO_NOTES[n] = k; } function __b() { return moBookState; }', expose: ['__notes', '__b'] });
    F.moCalNote(); F.__b().slot = '14:00'; F.moCalNote(); F.__b().slot = '10:00'; F.moCalNote();
    assert.deepEqual(F.__notes, ['mo_n_cal_conflict', 'mo_n_cal_free'], 'Tuesday 11:00 clashes, 14:00 is free, then the hand is quiet');
    const k = fnBody('moBook');
    assert.match(k, /const ev = \{ id: 'b' \+ moNextId\+\+, day: B\.day, start: B\.slot, len: 30, who: 'AW', title: 'Marie Lindner', booked: true \};/);
    assert.match(k, /moToast\(moT\('mo_book_done', \{ when \}\), \(\) => \{ moEvents = moEvents\.filter\(e => e\.id !== ev\.id\); moRenderBook\(\); moNote\('cal', 'mo_n_cal_idle'\); \}\);/);
    assert.match(dict.de.mo_n_cal_idle, /Dienstag, 11 Uhr/);
  });
});

describe('moment three: won, and the Engine takes over', () => {
  test('two stages side by side, one card that moves by drag, arrow keys or the button; the move answers with the app\'s toast and undo', () => {
    const i = fnBody('moInitWon');
    assert.match(i, /const card = e\.target\.closest\('\.mo-card\.is-hero'\); if \(!card \|\| e\.button\) return;/);
    assert.match(i, /if \(Math\.hypot\(e\.clientX - drag\.x, e\.clientY - drag\.y\) < 6\) return;/);
    assert.match(i, /document\.elementFromPoint\(e\.clientX, e\.clientY\)\?\.closest\('\.mo-col'\)/);
    assert.match(i, /if \(ghost && over\) moMoveHero\(over\.dataset\.stage\);/);
    assert.match(i, /moMoveHero\(e\.key === 'ArrowRight' \? 'won' : 'nego'\);/);
    assert.match(i, /if \(e\.target\.closest\('#mo-won-go'\)\) moMoveHero\('won'\);/);
    assert.match(bare, /^\.mo-card\.is-hero \{ cursor: grab; touch-action: pan-y; user-select: none;/m);
    assert.match(bare, /^\.mo-ghost \{ position: fixed; left: 0; top: 0; z-index: 90;[^}]*pointer-events: none; \}$/m);
    assert.match(bare, /^\.mo-won \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/m, 'the columns stay side by side on a phone: the drag is sideways');
    const toasts = [], notes = [], engine = [];
    const F = loadFns('public/js/landing.js', ['moMoveHero'], { state: { moWonDeals: [{ id: 1, stage: 'nego' }, { id: 8, stage: 'won' }] }, extra: `const MO_HERO = 1; const moStageKey = st => st === 'won' ? 'mo_st_won' : 'mo_st_nego'; function moT(k, v) { return v ? k + ':' + JSON.stringify(v) : k; } const __t = [], __n = [], __e = []; function moToast(t, u) { __t.push({ t, u }); } function moNote(n, k) { __n.push(k); } function moEngineFire() { __e.push('fire'); } function moEngineReset() { __e.push('reset'); } function moRenderWon() {} function __all() { return { t: __t, n: __n, e: __e, d: moWonDeals }; }`, expose: ['__all'] });
    F.moMoveHero('won');
    let s = F.__all();
    assert.equal(s.d[0].stage, 'won'); assert.deepEqual(s.e, ['fire']); assert.deepEqual(s.n, ['mo_n_won_done']);
    assert.equal(s.t.length, 1); assert.match(s.t[0].t, /^mo_moved_to:/);
    s.t[0].u();
    s = F.__all();
    assert.equal(s.d[0].stage, 'nego', 'undo moves it back'); assert.deepEqual(s.e, ['fire', 'reset']); assert.deepEqual(s.n, ['mo_n_won_done', 'mo_n_won_undo']);
    assert.equal(s.t.length, 1, 'the undo itself says nothing');
    F.moMoveHero('nego'); assert.equal(F.__all().t.length, 1, 'no move, no toast');
    void toasts; void notes; void engine;
    for (const [k, a] of [['mo_moved_to', 'moved_to'], ['mo_undo', 'undo'], ['mo_move_to', 'dv_move_to_stage'], ['mo_current_stage', 'dv_current_stage'], ['mo_st_won', 'an_won']]) same(k, a);
  });
  test('the Engine card: Aktiv, the trigger stage, one event Ausstehend then Zugestellt after 1.1 s with one attempt, the seven statuses in the schema\'s order', () => {
    const e = fnBody('moRenderEngine'), f = fnBody('moEngineFire');
    assert.match(e, /<span class="mo-badge mo-ok">\$\{moEsc\(moT\('mo_engine_active'\)\)\}<\/span>/);
    assert.match(e, /<span class="mo-badge \$\{moEngine\.delivered \? 'mo-ok' : 'mo-wait'\}">\$\{moEsc\(moT\(moEngine\.delivered \? 'mo_status_success' : 'mo_status_pending'\)\)\}<\/span><span class="mo-help">1 \$\{moEsc\(moT\('mo_attempt_one'\)\)\}<\/span>/);
    assert.match(e, /\[0, 1, 2, 3, 4, 5, 6\]\.map\(s => `<span class="mo-path-step\$\{moEngine\.step === s \? ' is-on' : ''\}">\$\{moEsc\(moT\('mo_onb_s' \+ s\)\)\}<\/span>`\)/);
    assert.match(f, /moEngine = \{ fired: true, delivered: false, step: 0 \};/);
    assert.match(f, /moEngine\.delivered = true; moEngine\.step = 1; moRenderEngine\(\);/);
    assert.match(f, /if \(moReduced\(\)\) done\(\); else moEngineTimer = setTimeout\(done, 1100\);/);
    assert.match(fnBody('moEngineReset'), /clearTimeout\(moEngineTimer\);/);
    const db = read('db.js'); const i = db.indexOf('onboarding_status IN ('); const order = [...db.slice(i, db.indexOf('))', i)).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    assert.equal(order.length, 7);
    order.forEach((s, n) => same(`mo_onb_s${n}`, `onb_status_${s}`));
    for (const [k, a] of [['mo_engine_title', 'engine_title'], ['mo_engine_active', 'engine_active'], ['mo_engine_stages_label', 'engine_stages_label'], ['mo_deliveries_title', 'engine_deliveries_title'], ['mo_no_deliveries', 'engine_no_deliveries'], ['mo_status_pending', 'engine_status_pending'], ['mo_status_success', 'engine_status_success'], ['mo_attempt_one', 'engine_attempt_one'], ['mo_onb_col_status', 'onb_col_status']]) same(k, a);
  });
  test('the product on the desk uses the app\'s words too', () => {
    for (const [k, a] of [['mo_act_whatsapp', 'act_whatsapp'], ['mo_act_email', 'act_email'], ['mo_act_meeting', 'act_meeting'], ['mo_open_dialer', 'dv_open_dialer'], ['mo_open_whatsapp', 'dv_open_whatsapp'], ['mo_urg_1', 'urg_1'], ['mo_urg_3', 'urg_3']]) same(k, a);
    for (const lang of ['de', 'en']) assert.equal(dict[lang].mo_x_join, app[lang].cal_join.replace('{app}', 'Google Meet'));
    assert.match(read('db.js'), /'Hi \{\{name\}\}, '/, 'the default WhatsApp template the desk shows');
    assert.match(html, /<span class="mo-grow mo-muted">„Hi Marie Lindner, “<\/span>/);
  });
});

describe('the questions', () => {
  test('two questions as native details, each with an answer (how to get in is the close\'s job now)', () => {
    const qs = [...body.matchAll(/<details class="mo-q"><summary class="mo-q-sum"><span data-i18n="mo_q(\d)">[^<]+<\/span><svg class="mo-ic mo-q-ic" aria-hidden="true"><use href="#mo-i-plus"\/><\/svg><\/summary><p class="mo-q-a" data-i18n="mo_a(\d)">[^<]+<\/p><\/details>/g)];
    assert.deepEqual(qs.map(m => [m[1], m[2]]), [['1', '1'], ['2', '2']]);
    assert.match(bare, /^\.mo-q-sum::-webkit-details-marker \{ display: none; \}$/m);
    assert.match(bare, /^\.mo-q\[open\] \.mo-q-ic \{ transform: rotate\(45deg\); \}$/m);
  });
});

describe('the way into the break', () => {
  test('four small squares beside the footer line, dim until a pointer or the keyboard reaches them, labelled; a click opens the shared game with the page\'s words and a board kept in this browser', () => {
    const foot = block('<footer class="mo-foot">', '</footer>');
    assert.match(foot, /<div class="mo-foot-end">\s*<p data-i18n="mo_foot_fiction">[^<]+<\/p>\s*<button type="button" class="mo-egg" id="mo-egg" data-i18n-aria="brk_title" aria-label="Kurze Pause"><svg class="mo-egg-ic" aria-hidden="true"><use href="#mo-i-blocks"\/><\/svg><\/button>/);
    assert.match(html, /<symbol id="mo-i-blocks" viewBox="0 0 18 12">(<rect [^>]+\/>){4}<\/symbol>/, 'four squares, the T shape');
    assert.match(bare, /^\.mo-egg \{[^}]*color: var\(--ink-muted\); opacity: \.35;/m);
    assert.match(bare, /^\.mo-egg:hover, \.mo-egg:focus-visible \{ opacity: 1; color: var\(--mo-marker\); \}$/m);
    assert.match(fnBody('moInitGame'), /if \(!egg \|\| typeof brkOpen !== 'function'\) return;\s*egg\.addEventListener\('click', \(\) => brkOpen\(\{ t: moT, store: brkLocalStore\('landing_break_board'\) \}\)\);/);
    assert.doesNotMatch(html + css + js, /mo-game|moGame|mo_g_/, 'the page keeps no copy of the game');
  });
  test('the page holds every word the shared game asks for, in German and English, impersonal and translated', () => {
    const game = read('public/js/break-game.js');
    const asked = [...new Set([...game.matchAll(/'(brk_[a-z0-9_]+)'/g)].map(m => m[1]))];
    assert.ok(asked.length >= 25, `${asked.length} words`);
    for (const k of asked) for (const lang of ['de', 'en']) assert.ok(typeof dict[lang][k] === 'string' && dict[lang][k], `${lang} ${k}`);
    assert.match(dict.de.brk_over, /\{n\} Punkte/); assert.match(dict.en.brk_place, /\{n\}/);
    assert.match(dict.de.brk_help, /C hält/); assert.match(dict.en.brk_help, /C holds/);
  });
  test('the address for access is team@upgrads.de everywhere; hello@ is gone', () => {
    assert.doesNotMatch(html + js, /hello@upgrads/);
    assert.equal((html.match(/href="mailto:team@upgrads\.de\?subject=Zugang%20zu%20Upgrads%20CRM"/g) || []).length, 3, 'the bar, the hero, the way in');
    assert.match(dict.de.mo_c1, /team@upgrads\.de/); assert.match(dict.en.mo_c1, /team@upgrads\.de/);
  });
});

describe('words', () => {
  test('both languages hold the same keys; the markup equals the German value key for key, aria included', () => {
    assert.deepEqual(Object.keys(dict.de), Object.keys(dict.en));
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(m[2].replace(/&amp;/g, '&'), dict.de[m[1]], m[1]);
    for (const m of html.matchAll(/data-i18n-aria="([^"]+)" aria-label="([^"]+)"/g)) assert.equal(m[2], dict.de[m[1]], m[1]);
  });
  test('no dead keys, no unknown keys (dynamic families counted by their prefix)', () => {
    const used = new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(m => m[1]));
    for (const m of js.matchAll(/'(mo_[a-z0-9_]+)'/g)) used.add(m[1]);
    for (const m of read('public/js/break-game.js').matchAll(/'(brk_[a-z0-9_]+)'/g)) used.add(m[1]);   // the shared game asks the page for these
    const prefixes = [...new Set([...js.matchAll(/'(mo_[a-z0-9_]*)' \+/g)].map(m => m[1]))];
    for (const k of Object.keys(dict.de)) assert.ok(used.has(k) || prefixes.some(p => k.startsWith(p)), `${k} is used`);
    for (const k of used) if (!prefixes.includes(k)) assert.ok(k in dict.de, `${k} exists`);
  });
  test('impersonal German, English where it differs, a short allow-list of names that stay', () => {
    const KEEP = /^(CRM|Name|WhatsApp|Website|Upgrads Engine|Facebook Ads|Instagram Ads|TikTok Ads)$/;
    for (const [k, v] of Object.entries(dict.de)) {
      assert.doesNotMatch(v, IMPERSONAL, `${k} is impersonal: ${v}`);
      if (!KEEP.test(v)) assert.notEqual(v, dict.en[k], `${k} is translated`);
    }
    assert.doesNotMatch(body.replace(/<svg[\s\S]*?<\/svg>/g, ''), IMPERSONAL);
  });
  test('short: the hook, the lead, the headings, the lines, the questions, the notes, the page copy as a whole', () => {
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      assert.ok(words(d.mo_hero_t) <= 7, `${lang} hook ≤ 7: it names what it is`); assert.ok(words(d.mo_hero_d) <= 30, `${lang} lead ≤ 30`);
      for (const k of ['mo_wipe_t', 'mo_m1_t', 'mo_m2_t', 'mo_m3_t', 'mo_faq_t', 'mo_close_t']) assert.ok(words(d[k]) <= 9, `${lang} ${k} ≤ 9: ${d[k]}`);
      for (const k of ['mo_wipe_d', 'mo_m1_d', 'mo_m2_d', 'mo_m3_d', 'mo_close_d']) assert.ok(words(d[k]) <= 27, `${lang} ${k} ≤ 27: ${d[k]}`);
      for (const n of [1, 2]) { assert.ok(words(d['mo_q' + n]) <= 6, `${lang} q${n}`); assert.ok(words(d['mo_a' + n]) <= 20, `${lang} a${n}`); }
      for (const n of [1, 2, 3]) { assert.ok(words(d['mo_hero_l' + n]) <= 8, `${lang} hero line ${n}`); assert.ok(words(d['mo_c' + n]) <= 12, `${lang} access step ${n}`); }
      for (const k of Object.keys(d).filter(k => k.startsWith('mo_n_'))) assert.ok(words(d[k]) <= 11, `${lang} ${k} ≤ 11: ${d[k]}`);
      const total = PAGE_KEYS.reduce((a, k) => a + words(d[k]), 0);
      assert.ok(total <= 270, `${lang}: ${total} words of page copy`);
    }
  });
  test('the claims audit: no code or protocol words, no competitor, no superlative, no price, no notification or mention promise', () => {
    const copy = Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + '\n' + body.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy, /\b(webhook|api|endpoint|payload|json|hmac|http|url|token|header|curl)\b/i);
    assert.doesNotMatch(copy, /pipedrive|hubspot|onoffice|propstack|salesforce/i);
    assert.doesNotMatch(copy, /(?<!\p{L})(beste[rsn]?|schnellste[rsn]?|einfachste[rsn]?|einzige[rsn]?|revolutionär|führend|marktführer|best|fastest|easiest|leading|revolutionary|world-class)(?!\p{L})/iu);
    assert.doesNotMatch(copy, /\b(preis|price|kostenlos|free|trial|testphase|rabatt|discount)\b|€|\$/i);
    assert.doesNotMatch(copy.replace(/[\w.]+@[\w.]+\.[a-z]+/g, ''), /benachrichtig|glocke|notification|erwähn|mention|@\w/i, 'an email address on the desk is not a mention');
    assert.doesNotMatch(copy, /Lead Ads|Doppelbuchung|double.?booking|forecast|prognose/i);
    assert.doesNotMatch(js.replace(/\/\/.*$/gm, ''), /notif|bell|Glocke/i, 'no notification claims');
  });
  test('none of the tells of generated copy: no em dash, no middle dot, no arrow glyph, no buzzwords, no "not just X but Y"', () => {
    const copy = Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + '\n' + body.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy, /—|·|→|←/);
    assert.doesNotMatch(copy, /seamless|effortless|nahtlos|mühelos|game.?changer|supercharge|unlock|elevate|empower|next.level/i);
    assert.doesNotMatch(copy, /not just|nicht nur .* sondern/i);
  });
});

describe('pure helpers', () => {
  const F = loadFns('public/js/landing.js', ['moMoney', 'moClamp', 'moEsc', 'moCutAt', 'moMin', 'moConflict']);
  test('money as the board shows it; the cut from a pointer position, clamped', () => {
    assert.equal(F.moMoney(9800), '9.8k €'); assert.equal(F.moMoney(1200000), '1.2M €'); assert.equal(F.moMoney(900), '900 €'); assert.equal(F.moMoney(null), '');
    assert.equal(F.moCutAt(150, 100, 200), 25); assert.equal(F.moCutAt(50, 100, 200), 0); assert.equal(F.moCutAt(400, 100, 200), 100); assert.equal(F.moCutAt(120, 100, 0), 0);
    assert.equal(F.moClamp(9, 0, 5), 5); assert.equal(F.moEsc('<b>&"'), '&lt;b&gt;&amp;&quot;');
  });
  test('the conflict check: the host\'s own entries on that day, overlapping, nothing else', () => {
    assert.equal(F.moMin('14:00'), 840);
    assert.deepEqual(F.moConflict(1, '11:00', 30, events0, 'AW').map(e => e.id), ['e2'], 'Tuesday 11:00 meets the team meeting');
    assert.deepEqual(F.moConflict(1, '14:00', 30, events0, 'AW'), [], 'Tuesday 14:00 is free');
    assert.deepEqual(F.moConflict(1, '15:00', 30, events0, 'AW').map(e => e.id), ['e3'], 'the viewing at 15:00');
    assert.deepEqual(F.moConflict(3, '10:00', 30, events0, 'AW'), [], 'a colleague\'s entry is not the host\'s');
    for (const ev of events0) { const h = +ev.start.slice(0, 2); assert.ok(h >= 9 && h + ev.len / 60 <= 17, `${ev.id} inside the week's hours`); }
  });
});

describe('stylesheet discipline and the audit', () => {
  const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96, 128]);
  const PROPS = new Set(('position top right bottom left inset z-index display flex flex-direction flex-wrap align-items align-content align-self justify-content gap column-gap row-gap grid-template-columns grid-template-rows grid-auto-rows grid-column grid-row place-items width min-width max-width height min-height max-height margin margin-top margin-bottom margin-left margin-inline padding padding-top padding-bottom padding-left border border-top border-bottom border-left border-color border-left-color border-radius background color font-family font-size font-weight font-style font-display font-variant-numeric src line-height letter-spacing text-align text-wrap text-overflow text-decoration text-decoration-color text-underline-offset white-space overflow overflow-wrap opacity transform transform-origin translate transition animation box-shadow outline outline-offset cursor user-select -webkit-user-select pointer-events touch-action isolation content fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset list-style clip-path aspect-ratio scroll-behavior scroll-margin-top justify-self justify-items place-content').split(' '));
  test('every class in the stylesheet is used by the markup or the script, and every class they use has a rule', () => {
    for (const c of cssClasses) assert.ok(usedClasses.has(c) || dynamicPrefixes.some(p => c.startsWith(p)), `.${c} is used`);
    for (const c of usedClasses) if (/^(mo|is)-/.test(c) && !ids.has(c) && !dynamicPrefixes.includes(c)) assert.ok(cssClasses.has(c), `.${c} has a rule`);
  });
  test('prefix, tokens only, hex only for the desk\'s materials, no gradient, two keyframes, no caps, no pointer-following, no !important', () => {
    for (const r of rules) if (!r.selector.startsWith('@') && !r.in.includes('@keyframes')) assert.ok(/mo-|body\.mo|html\.mo/.test(r.selector), `scoped: ${r.selector}`);
    for (const r of rules) for (const [p, v] of r.decls) if (/#[0-9a-f]{3,8}\b/i.test(v)) assert.ok(r.selector === 'body.mo' && p.startsWith('--mo-'), `hex only as a desk material token: ${r.selector} ${p}`);
    const materials = rules.find(r => r.selector === 'body.mo').decls.filter(([, v]) => /^#/.test(v)).map(([p]) => p);
    assert.deepEqual(materials, ['--mo-paper', '--mo-paper-ink', '--mo-paper-line', '--mo-sticky', '--mo-sticky-ink', '--mo-marker', '--mo-pen']);
    assert.equal((bare.match(/gradient\(/g) || []).length, 0, 'no gradient');
    assert.deepEqual([...bare.matchAll(/@keyframes ([a-z-]+)/g)].map(m => m[1]), ['mo-draw', 'mo-in']);
    assert.doesNotMatch(bare, /text-transform|!important|rotateX|rotateY|perspective/);
    assert.doesNotMatch(js, /mousemove|deviceorientation|rotateX|rotateY|perspective|innerHTML \+=/);
    assert.match(bare, /body\.mo \{[^}]*--mo-ground: var\(--navy-900\);[^}]*background: var\(--mo-ground\);/, 'the ground is the app\'s navy-900: dark, but a friendly blue');
  });
  test('every custom property resolves; every property name is a real one; no declaration is repeated in a rule; no selector is declared twice at the same level', () => {
    const defined = new Set([...(style + bare).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]).concat([...js.matchAll(/setProperty\('(--[a-z0-9-]+)'/g)].map(m => m[1])));
    for (const m of bare.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
    const seen = new Set();
    for (const r of rules) {
      const props = r.decls.map(([p]) => p);
      for (const p of props) assert.ok(PROPS.has(p) || p.startsWith('--'), `${r.selector}: "${p}" is a property`);
      assert.equal(new Set(props).size, props.length, `${r.selector}: no repeated declaration`);
      if (r.selector === '@font-face') continue;   // one block per face
      const key = r.in + ' | ' + r.selector; assert.ok(!seen.has(key), `${key} declared once`); seen.add(key);
    }
  });
  test('spacing on the scale, breakpoints descending, reduced motion last, the z-index ladder', () => {
    for (const r of rules) for (const [p, v] of r.decls) if (/^(margin|padding|gap|column-gap|row-gap)/.test(p)) {
      let flat = v; while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '~');
      for (const tok of flat.split(/\s+/)) {
        if (/^(0|auto|none|-?[a-z-]+~|[\d.]+%)$/.test(tok)) continue;
        const px = tok.match(/^(-?\d+)px$/); assert.ok(px && SCALE.has(Math.abs(+px[1])), `${r.selector}: ${p}: ${v} on the scale`);
      }
    }
    const bps = [...bare.matchAll(/@media \(max-width: (\d+)px\)/g)].map(m => +m[1]);
    assert.deepEqual(bps, [1024, 860, 600, 420]);
    assert.ok(bare.lastIndexOf('@media (prefers-reduced-motion: reduce)') > bare.lastIndexOf('@media (max-width'));
    const z = Object.fromEntries(rules.filter(r => r.decls.some(([p]) => p === 'z-index')).map(r => [r.selector, r.decls.find(([p]) => p === 'z-index')[1]]));
    assert.deepEqual(z, { '.mo-after': '1', '.mo-handle': '2', '.mo-ghost': '90', '.mo-fly': '90', '.mo-toasts': '80' });
  });
  test('the script: every id it touches exists, two timers, the app\'s language key, the start on DOMContentLoaded', () => {
    for (const m of js.matchAll(/getElementById\('([^']+)'\)|closest\('#([^']+)'\)|querySelector\([`']#([a-z0-9-]+)/g)) assert.ok(ids.has(m[1] || m[2] || m[3]), `#${m[1] || m[2] || m[3]} exists`);
    assert.equal((js.match(/setTimeout\(/g) || []).length, 2, 'the toast and the delivery');
    assert.match(js, /localStorage\.getItem\('lang'\)/); assert.match(js, /localStorage\.setItem\('lang', l\)/);
    assert.match(js.trim(), /document\.addEventListener\('DOMContentLoaded', moInit\);$/);
    assert.match(js, /^'use strict';$/m);
  });
});
