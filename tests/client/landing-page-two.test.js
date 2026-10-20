// CLIENT (static + pure-function) tests for the second public landing page at /landingpagetwo.
// Part 35 (2026-10-20, from scratch): built to be compared with /landingpage, then one deleted. Page one
// is a film the visitor scrolls through. Page two is the crossed-off list as a reel: the hero ticks the
// four chores a sales team does by hand (the product's own task rows), then six frames side by side,
// one per swipe; each middle frame takes one chore, the product does it once on arrival, and the chore
// is struck through; the fourth strikes when the hand drops the card into Gewonnen. Pinned: the route,
// the CSP-safe document, Funnel Display self-hosted with its licence, the pager (the 100 % height
// chain, the snapping track, the six frames and segments, inert off-screen frames, the wheel lock, the
// keys, the hash, the settle), the reel (the segments fill per scene, each scene once, the flight,
// the strikes, the hero list), German first and equal to the dictionary key for key, impersonal
// German, the caps on words (concise), the claims audit, every screen's anatomy and the app's own
// words, the contracts (move + undo, the arrival, the booking, the hand-over), and the stylesheet
// audit: every class used has a rule and every rule is used, every token resolves, every property is
// real, every spacing value is on the scale, no selector is declared twice, breakpoints descend,
// reduced motion comes last, nothing follows the pointer, nothing plays on scroll, no gradient, no
// viewport-height unit.
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
const dict   = new Function(sliceConst('public/js/landing2.js', 'RL_I18N').replace(/^[^{]*/, 'return '))();
const app    = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const ids6   = new Function(sliceConst('public/js/landing2.js', 'RL_IDS').replace(/^[^[]*/, 'return '))();
const sceneMs = new Function(sliceConst('public/js/landing2.js', 'RL_SCENE_MS').replace(/^[^[]*/, 'return '))();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words  = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const block  = (startMark, endMark) => { const s = html.indexOf(startMark); assert.ok(s >= 0, startMark); return html.slice(s, html.indexOf(endMark, s)); };
const fnBody = name => { const i = js.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const s = js.indexOf('{', i); let d = 0; for (let j = s; j < js.length; j++) { if (js[j] === '{') d++; else if (js[j] === '}' && !--d) return js.slice(s, j + 1); } return ''; };
const same   = (k, appKey) => { for (const lang of ['de', 'en']) { assert.ok(appKey in app[lang], `${appKey} is an app key`); assert.equal(dict[lang][k], app[lang][appKey], `${lang} ${k} = app ${appKey}`); } };
const PAGE_KEYS = Object.keys(dict.de).filter(k => /^rl_(hero_|c\d$|p\d_|tab_|hint_|close_|foot_|lang$|login|request|crm|nav_aria|list_aria|via|src_|sources|inbox_aria|won_aria|week_aria|deal_stage_aria|types_aria|prev|next)/.test(k));
const USED_HOOKS = ['Gewonnen ist erst der Anfang.', 'Nur noch verkaufen.', 'Nur auf Einladung.', 'Just sell.', 'The CRM that keeps working.', 'Leads arrive. Deals depart.', 'One card. Drag it to Won.', 'Alles nach dem Klick.', 'Everything after the click.'];

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
const classesIn = s => [...s.matchAll(/\.(rl-[a-z0-9-]+|is-[a-z-]+)/g)].map(m => m[1]);
const cssClasses = new Set(rules.flatMap(r => r.selector.startsWith('@') ? [] : classesIn(r.selector)));
// class tokens the markup and the script use: static attributes, template attributes with `${…}` cut out, classList calls, state strings
const stripped = (() => { let s = js; for (let n = 0; n < 10; n++) s = s.replace(/\$\{[^{}]*\}/g, ' '); return s; })();
const usedClasses = new Set();
for (const src of [html, stripped]) for (const m of src.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/class="([^"$]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/className = '([^']+)'/g)) m[1].split(' ').forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/'(?: )?((?:rl|is)-[a-z0-9-]+)'/g)) usedClasses.add(m[1]);
const dynamicPrefixes = [...new Set([...js.matchAll(/((?:rl|is)-[a-z0-9-]*)(?=\$\{)/g)].map(m => m[1]))];
const dynamicTokens = new Set([...js.matchAll(/'(?: )?((?:rl|is)-[a-z0-9-]*)' \+/g)].map(m => m[1]));
const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]).concat([...js.matchAll(/ id="([^"$]+)"/g)].map(m => m[1])).concat([...js.matchAll(/\.id = '([^']+)'/g)].map(m => m[1])));

describe('route', () => {
  test('/landingpagetwo serves public/landingpagetwo.html, right after /landingpage and before the SPA catch-all', () => {
    const r1 = server.indexOf("app.get('/landingpage'"), r2 = server.indexOf("app.get('/landingpagetwo'"), catchAll = server.indexOf("app.get('*'") >= 0 ? server.indexOf("app.get('*'") : server.indexOf("app.get(/");
    assert.ok(r1 >= 0 && r2 > r1, 'route order');
    assert.match(server.slice(r2, r2 + 200), /sendFile\(path\.join\(__dirname, 'public', 'landingpagetwo\.html'\)\)/);
    if (catchAll >= 0) assert.ok(r2 < catchAll, 'before the catch-all');
    assert.match(read('readmedev.md'), /GET \/landingpagetwo → public\/landingpagetwo\.html/);
  });
});

describe('the document', () => {
  test('the head: German, the app in dark, the root class, viewport-fit, the face and Inter preloaded, the app stylesheet first', () => {
    assert.match(head, /<html lang="de" data-theme="dark" class="rl-root">/);
    assert.match(head, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
    assert.match(head, /<meta name="color-scheme" content="dark">/);
    assert.match(head, /<meta name="description" content="Upgrads CRM: Vier Handgriffe gestrichen\./);
    assert.match(head, /<title>Upgrads CRM<\/title>/);
    assert.match(head, /<link rel="preload" href="\/fonts\/FunnelDisplay\.woff2" as="font" type="font\/woff2" crossorigin>/);
    assert.match(head, /<link rel="preload" href="\/fonts\/inter-latin-wght\.woff2" as="font"/);
    assert.ok(head.indexOf('href="/style.css"') < head.indexOf('href="/landing2.css"'));
    assert.doesNotMatch(head, /https?:\/\//, 'no external host in the head');
    assert.equal((html.match(/<script/g) || []).length, 1);
    assert.match(html, /<script src="\/js\/landing2\.js"><\/script>\s*<\/body>/);
  });
  test('Funnel Display is self-hosted with its licence; the faces of the rejected pages are gone', () => {
    const font = path.join(ROOT, 'public/fonts/FunnelDisplay.woff2');
    assert.ok(fs.existsSync(font) && fs.statSync(font).size > 15000, 'FunnelDisplay.woff2 present');
    assert.match(fs.readFileSync(path.join(ROOT, 'public/fonts/OFL-FunnelDisplay.txt'), 'utf8'), /SIL Open Font License, Version 1\.1/);
    assert.match(bare, /@font-face \{ font-family: "Funnel Display"; font-style: normal; font-weight: 300 800; font-display: swap; src: url\(\/fonts\/FunnelDisplay\.woff2\) format\("woff2"\); \}/);
    assert.equal((bare.match(/@font-face/g) || []).length, 1, 'one face: Inter comes from style.css');
    for (const f of ['Onest', 'AlbertSans', 'SofiaSans', 'SofiaSansCondensed', 'HostGrotesk', 'Jost', 'Syne', 'Epilogue', 'FamiljenGrotesk', 'Newsreader', 'Sora', 'InstrumentSerif', 'Archivo']) {
      assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/${f}.woff2`)), `${f}.woff2 gone`);
      assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/OFL-${f}.txt`)), `OFL-${f}.txt gone`);
    }
  });
  test('the two pages share nothing but the subject; the hook is new', () => {
    assert.doesNotMatch(html + css + js, /\blp-|LP_I18N|lpInit/, 'page two never uses page one\'s names');
    assert.doesNotMatch(one.html + one.css + one.js, /\brl-|RL_I18N|rlInit/, 'page one never uses page two\'s names');
    const lpHook = new Function(sliceConst('public/js/landing.js', 'LP_I18N').replace(/^[^{]*/, 'return '))().de.lp_hero_title;
    for (const lang of ['de', 'en']) { assert.notEqual(dict[lang].rl_hero_t, lpHook); assert.ok(!USED_HOOKS.includes(dict[lang].rl_hero_t), `${lang}: a hook not used before`); }
  });
  test('the sprite holds exactly the icons and marks the page uses; no inline style anywhere', () => {
    const syms = [...html.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(syms, ['rl-i-check', 'rl-i-phone', 'rl-i-mail', 'rl-i-message', 'rl-i-note', 'rl-i-calendar', 'rl-i-chevron', 'rl-i-globe', 'rl-l-fb', 'rl-l-ig', 'rl-l-tt']);
    const typeIcons = Object.values(new Function(sliceConst('public/js/landing2.js', 'RL_TYPE_ICON').replace(/^[^{]*/, 'return '))()).map(n => 'rl-i-' + n);
    const used = new Set([...js.matchAll(/rlIcon\('([a-z-]+)'/g)].map(m => 'rl-i-' + m[1]).concat([...(html + js).matchAll(/href="#(rl-[il]-[a-z-]+)"/g)].map(m => m[1]), typeIcons));
    for (const s of syms) assert.ok(used.has(s), `${s} is used`);
    for (const u of used) assert.ok(syms.includes(u), `${u} exists`);
    assert.doesNotMatch(body, /style="/, 'no inline styles in the markup');
    assert.doesNotMatch(js, /style="|\.style\.(?!setProperty)/, 'the script only sets custom properties');
  });
});

describe('the pager', () => {
  test('six frames side by side with ids the script knows, each a tabpanel; six segments as tabs, the arrows at the edges', () => {
    const frames = [...body.matchAll(/<section class="rl-frame" id="([a-z]+)" role="tabpanel" aria-labelledby="rl-tab-(\d)" tabindex="-1">/g)].map(m => [m[1], +m[2]]);
    assert.deepEqual(frames.map(p => p[0]), ['start', 'leads', 'deal', 'termin', 'gewonnen', 'zugang']);
    assert.deepEqual(frames.map(p => p[1]), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(ids6, frames.map(p => p[0]), 'RL_IDS equals the markup');
    assert.equal((body.match(/<section class="rl-frame"/g) || []).length, 6);
    const segs = [...body.matchAll(/<button type="button" class="rl-seg( is-on)?" role="tab" id="rl-tab-(\d)" data-go="(\d)" aria-selected="(true|false)" aria-controls="([a-z]+)"><span class="rl-seg-track"><span class="rl-seg-fill"><\/span><\/span><span class="rl-seg-name" data-i18n="rl_tab_(\d)">/g)];
    assert.equal(segs.length, 6);
    segs.forEach((m, k) => { assert.equal(+m[2], k); assert.equal(+m[3], k); assert.equal(m[5], ids6[k]); assert.equal(+m[6], k); assert.equal(!!m[1], k === 0); assert.equal(m[4], String(k === 0)); });
    assert.match(body, /<div class="rl-segs" role="tablist" data-i18n-aria="rl_nav_aria" aria-label="Abschnitte">/);
    assert.match(body, /<button type="button" class="rl-arrow rl-arrow-prev" id="rl-prev" data-go="prev" data-i18n-aria="rl_prev" aria-label="Zurück" disabled>/);
    assert.match(body, /<button type="button" class="rl-arrow rl-arrow-next" id="rl-next" data-go="next" data-i18n-aria="rl_next" aria-label="Weiter">/);
    assert.ok(body.indexOf('<header class="rl-bar">') < body.indexOf('<main class="rl-track" id="rl-track">'));
    assert.ok(body.indexOf('</main>') < body.indexOf('id="rl-prev"'));
  });
  test('the stylesheet: the 100 % height chain, the snapping track, the frames, the inner scrollers; no viewport-height unit, nothing sticky', () => {
    assert.match(bare, /^html\.rl-root, body\.rl \{ height: 100%; overflow: hidden; overscroll-behavior: none; \}$/m);
    assert.match(bare, /^\.rl-track \{ display: flex; height: 100%; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none; \}$/m);
    assert.match(bare, /^\.rl-track::-webkit-scrollbar \{ display: none; \}$/m);
    assert.match(bare, /^\.rl-frame \{ flex: 0 0 100%; width: 100%; height: 100%; padding: calc\(var\(--rl-bar\) \+ 24px\) var\(--rl-gutter\) calc\(24px \+ env\(safe-area-inset-bottom\)\); scroll-snap-align: start; scroll-snap-stop: always; outline: none; \}$/m);
    assert.match(bare, /^\.rl-scroll \{ min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; \}$/m);
    assert.match(bare, /^\.rl-card \{[^}]*touch-action: pan-y; user-select: none;/m);
    assert.doesNotMatch(bare, /\d(vh|dvh|svh|lvh)\b/, 'no viewport-height unit: the height chain does it');
    assert.doesNotMatch(bare, /(?<!over)scroll-behavior/, 'every scrollTo names its behavior');
    assert.equal((bare.match(/overflow-x: auto/g) || []).length, 1, 'only the track scrolls sideways');
    const fixed = rules.filter(r => r.decls.some(([p, v]) => p === 'position' && v === 'fixed')).map(r => r.selector);
    assert.deepEqual(fixed, ['.rl-bar', '.rl-arrow', '.rl-fly', '.rl-ghost', '.rl-toasts']);
    assert.ok(!rules.some(r => r.decls.some(([p, v]) => p === 'position' && v === 'sticky')));
    assert.match(bare, /\.rl-arrow:disabled \{ opacity: 0; pointer-events: none; \}/);
    assert.match(bare, /@media \(pointer: coarse\) \{\s*\.rl-hint-touch \{ display: inline; \}\s*\.rl-hint-key \{ display: none; \}\s*\}/);
  });
  test('rlGo: clamped, the segment and the inert frames marked, the scene asked for, the hash replaced (never pushed), the jump instant under reduced motion, focus without scrolling', () => {
    const g = fnBody('rlGo'), m = fnBody('rlMark');
    assert.match(g, /i = rlClamp\(i, 0, RL_IDS\.length - 1\);/);
    assert.match(g, /history\.replaceState\(null, '', '#' \+ RL_IDS\[i\]\);/);
    assert.match(g, /track\.scrollTo\(\{ left: i \* track\.clientWidth, behavior: instant \|\| rlReduced\(\) \? 'instant' : 'smooth' \}\);/);
    assert.match(g, /if \(focus\) document\.getElementById\(RL_IDS\[i\]\)\?\.focus\(\{ preventScroll: true \}\);/);
    assert.match(m, /document\.querySelectorAll\('\.rl-seg'\)\.forEach\(\(t, k\) => \{ t\.classList\.toggle\('is-on', k === i\); t\.setAttribute\('aria-selected', String\(k === i\)\); \}\);/);
    assert.match(m, /document\.querySelectorAll\('\.rl-frame'\)\.forEach\(\(p, k\) => p\.toggleAttribute\('inert', k !== i\)\);/);
    assert.match(m, /prev\.disabled = i === 0;/); assert.match(m, /next\.disabled = i === RL_IDS\.length - 1;/);
    assert.match(m, /rlPlay\(i\);\s*\}$/);
    assert.doesNotMatch(js, /pushState|IntersectionObserver|requestAnimationFrame|scrollend|scrollY/);
  });
  test('the wheel is one gesture: sideways stays native, an inner scroller scrolls first, the first notch pages, the stream is held until quiet', () => {
    const w = fnBody('rlOnWheel'), l = fnBody('rlWheelLock');
    assert.match(w, /if \(RL\.drag \|\| RL\.busy\) return;/);
    assert.match(w, /if \(Math\.abs\(e\.deltaX\) > Math\.abs\(e\.deltaY\)\) return;/);
    assert.match(w, /const dy = e\.deltaMode === 1 \? e\.deltaY \* 16 : e\.deltaMode === 2 \? e\.deltaY \* window\.innerHeight : e\.deltaY;/);
    assert.match(w, /const s = e\.target\.closest\('\.rl-scroll'\);/);
    assert.match(w, /s\.scrollTop \+ s\.clientHeight < s\.scrollHeight - 1\)\)\) \{ rlWheelLock\(\); return; \}/);
    assert.match(w, /e\.preventDefault\(\);\s*if \(RL\.wheelLock\) \{ rlWheelLock\(\); return; \}/);
    assert.match(w, /if \(Math\.abs\(RL\.wheelAcc\) < 24\) return;\s*rlGo\(RL\.i \+ Math\.sign\(RL\.wheelAcc\)\);/);
    assert.match(l, /Date\.now\(\) - RL\.wheelSince >= 450/); assert.match(l, /\}, 160\);/);
    assert.match(fnBody('rlInitPager'), /document\.addEventListener\('wheel', rlOnWheel, \{ passive: false \}\);/);
  });
  test('the keys page unless a field or a card took them; the settle adopts a swipe, repairs an interrupted jump; resize, hash, focus and the hero rows realign', () => {
    const k = fnBody('rlOnKey'), s = fnBody('rlSettle'), p = fnBody('rlInitPager');
    assert.match(k, /^\{\s*if \(e\.defaultPrevented \|\| RL\.drag \|\| e\.target\.closest\('input, textarea, select, \[contenteditable\]'\)\) return;/);
    assert.match(k, /ArrowRight: RL\.i \+ 1, PageDown: RL\.i \+ 1, ArrowLeft: RL\.i - 1, PageUp: RL\.i - 1, Home: 0, End: RL_IDS\.length - 1/);
    assert.match(k, /rlGo\(map\[e\.key\], false, true\);/);
    assert.match(s, /k = Math\.round\(track\.scrollLeft \/ w\);/);
    assert.match(s, /if \(RL\.busy && k !== RL\.i\) track\.scrollTo\(\{ left: RL\.i \* w, behavior: 'instant' \}\);/);
    assert.match(s, /else if \(k !== RL\.i\) \{ rlMark\(k\); history\.replaceState\(null, '', '#' \+ RL_IDS\[k\]\); \}/);
    assert.match(p, /history\.scrollRestoration = 'manual';/);
    assert.match(p, /track\.addEventListener\('scroll', \(\) => \{ clearTimeout\(RL\.settleTimer\); RL\.settleTimer = setTimeout\(rlSettle, 120\); \}, \{ passive: true \}\);/);
    assert.match(p, /window\.addEventListener\('resize', \(\) => track\.scrollTo\(\{ left: RL\.i \* track\.clientWidth, behavior: 'instant' \}\)\);/);
    assert.match(p, /window\.addEventListener\('hashchange', \(\) => rlGo\(rlIndexOf\(location\.hash\), true\)\);/);
    assert.match(p, /track\.addEventListener\('focusin'/);
    assert.match(p, /const a = e\.target\.closest\('a\[href\^="#"\]'\);\s*if \(a\) \{ e\.preventDefault\(\); rlGo\(rlIndexOf\(a\.getAttribute\('href'\)\), false, true\); \}/);
    assert.match(fnBody('rlInit'), /rlGo\(rlIndexOf\(location\.hash\), true\);\s*\}$/);
    const w = fnBody('rlInitWon');
    assert.match(w, /RL\.drag = true;\s*card\.setPointerCapture\(e\.pointerId\);/); assert.match(w, /drag = null; RL\.drag = false;/);
  });
});

describe('the reel: segments, scenes, the flight, the strikes', () => {
  test('six scene lengths; a segment fills with its scene (0 ms under reduced motion); a chore is struck once; the ring lasts 1.2 s', () => {
    assert.equal(sceneMs.length, 6);
    const f = fnBody('rlFill'), s = fnBody('rlStrike'), l = fnBody('rlLit');
    assert.match(f, /const f = document\.querySelectorAll\('\.rl-seg-fill'\)\[i\]; if \(!f\) return;/);
    assert.match(f, /f\.style\.setProperty\('--rl-sd', \(rlReduced\(\) \? 0 : ms\) \+ 'ms'\);\s*f\.style\.setProperty\('--rl-f', '100%'\);/);
    assert.match(s, /if \(RL\.struck\[n\]\) return; RL\.struck\[n\] = true;\s*document\.getElementById\('rl-chore-' \+ n\)\?\.classList\.add\('is-struck'\);/);
    assert.match(l, /el\.classList\.add\('is-lit'\);\s*clearTimeout\(RL\.litTimer\);\s*RL\.litTimer = setTimeout\(\(\) => el\.classList\.remove\('is-lit'\), 1200\);/);
    assert.match(bare, /^\.rl-seg-fill \{ display: block; width: var\(--rl-f, 0%\); height: 100%; background: var\(--ink\); transition: width var\(--rl-sd, \.3s\) linear; \}$/m);
  });
  test('each scene plays once, 400 ms after its frame is reached, only if the frame is still current (else it waits for the next visit); reduced motion stands at the end at once', () => {
    const p = fnBody('rlPlay');
    assert.match(p, /if \(RL\.seen\[i\]\) return; RL\.seen\[i\] = true;/);
    assert.match(p, /const scene = RL_SCENES\[i\]; if \(!scene\) return;/);
    assert.match(p, /if \(rlReduced\(\)\) \{ scene\(true\); return; \}/);
    assert.match(p, /setTimeout\(\(\) => \{ if \(RL\.i === i\) scene\(false\); else RL\.seen\[i\] = false; \}, 400\);/);
    assert.match(js, /^const RL_SCENES = \{ 0: rlSceneList, 1: rlSceneLead, 2: rlSceneNumber, 3: rlSceneConflict, 5: rlSceneClose \};$/m, 'frame 4 has no scene: it is the hand\'s');
  });
  test('the hero ticks the four rows one by one (300 ms, then every 320 ms); leads: the packet flies from Instagram and the lead lands with the strike; the deal: WhatsApp with the ring; the meeting: Tuesday 11:00 with the ring; the close fills', () => {
    const a = fnBody('rlSceneList'), b = fnBody('rlSceneLead'), c = fnBody('rlSceneNumber'), d = fnBody('rlSceneConflict'), e = fnBody('rlSceneClose');
    assert.match(a, /rlFill\(0, RL_SCENE_MS\[0\]\);/);
    assert.match(a, /document\.querySelectorAll\('#rl-list \.rl-row'\)\.forEach\(\(r, k\) => \{\s*if \(instant\) r\.classList\.add\('is-done'\);\s*else setTimeout\(\(\) => r\.classList\.add\('is-done'\), 300 \+ k \* 320\);/);
    assert.match(b, /rlFill\(1, RL_SCENE_MS\[1\]\);\s*const land = \(\) => \{ rlArrive\('ig'\); rlStrike\(1\); \};\s*if \(instant\) land\(\); else rlFly\('ig', land\);/);
    assert.match(c, /rlFill\(2, RL_SCENE_MS\[2\]\);\s*rlRec\.type = 'whatsapp'; rlRenderRecord\(\);\s*if \(!instant\) rlLit\(document\.querySelector\('#rl-record \.rl-chint'\)\);\s*rlStrike\(2\);/);
    assert.match(d, /rlFill\(3, RL_SCENE_MS\[3\]\);\s*rlBookState\.day = 1; rlBookState\.slot = '11:00'; rlRenderBook\(\);\s*if \(!instant\) rlLit\(document\.querySelector\('#rl-book \.rl-conflict'\)\);\s*rlStrike\(3\);/);
    assert.match(e, /rlFill\(5, RL_SCENE_MS\[5\]\);/);
    assert.match(fnBody('rlMoveDeal'), /if \(d\.id === RL_HERO\) \{ if \(stage === 4\) \{ rlEngineFire\(\); rlStrike\(4\); rlFill\(4, RL_SCENE_MS\[4\]\); \} else rlEngineReset\(\); \}/, 'the fourth chore is struck by the hand');
    assert.match(fnBody('rlInit'), /rlInitChrome\(\); rlInitSources\(\); rlInitWon\(\); rlInitRecord\(\); rlInitBook\(\); rlInitPager\(\);/);
    assert.doesNotMatch(fnBody('rlInit'), /rlArrive|rlScene|rlStrike/, 'nothing plays from init itself: the hash jump marks the frame, and the frame plays');
  });
  test('the flight: a packet with the mark, from the source button to the first stage\'s head, three keyframes along a lifted arc, kept at the end, removed on finish; no flight under reduced motion or without the API', () => {
    const f = fnBody('rlFly');
    assert.match(f, /const from = document\.querySelector\(`#rl-sources \.rl-src\[data-src="\$\{src\}"\] \.rl-logo`\), to = document\.querySelector\('#rl-inbox \.rl-col-head'\), host = document\.getElementById\('rl-fly'\);/);
    assert.match(f, /if \(!from \|\| !to \|\| !host \|\| rlReduced\(\) \|\| typeof host\.animate !== 'function'\) \{ land\(\); return; \}/);
    assert.match(f, /el\.className = 'rl-packet';/);
    assert.match(f, /el\.style\.setProperty\('--rl-px', x0 \+ 'px'\); el\.style\.setProperty\('--rl-py', y0 \+ 'px'\);/);
    assert.match(f, /const mx = \(x0 \+ x1\) \/ 2, my = Math\.min\(y0, y1\) - 56;/);
    assert.match(f, /\{ transform: `translate\(\$\{mx\}px, \$\{my\}px\)`, offset: \.5 \}/);
    assert.match(f, /\{ duration: 650, easing: 'cubic-bezier\(\.3, \.6, \.2, 1\)', fill: 'forwards' \}/);
    assert.match(f, /anim\.onfinish = \(\) => \{ el\.remove\(\); land\(\); \};/);
    assert.match(fnBody('rlInitSources'), /if \(b\) rlFly\(b\.dataset\.src, \(\) => rlArrive\(b\.dataset\.src\)\);/);
    assert.match(bare, /^\.rl-fly \{ position: fixed; inset: 0; z-index: 90; pointer-events: none; \}$/m);
    assert.match(bare, /^\.rl-packet \{[^}]*transform: translate\(var\(--rl-px\), var\(--rl-py\)\); \}$/m);
    assert.equal((js.match(/setTimeout\(/g) || []).length, 7, 'the toast, the wheel quiet, the settle, the ring, the hero ticks, the scene delay, the delivery');
  });
  test('the strike in the stylesheet: the chore is one line with a drawn line and a step back in colour; the hero rows tick like the app\'s tasks', () => {
    assert.match(bare, /^\.rl-chore \{ position: relative; display: inline-block;[^}]*white-space: nowrap; transition: color \.5s var\(--ease\); \}$/m);
    assert.match(bare, /^\.rl-chore::after \{ content: ""; position: absolute; left: -\.04em; right: -\.04em; top: 52%; height: \.075em; border-radius: 2px; background: var\(--ink\); transform: scaleX\(0\); transform-origin: left center; transition: transform \.55s var\(--ease-out\); \}$/m);
    assert.match(bare, /^\.rl-chore\.is-struck \{ color: var\(--ink-muted\); \}$/m);
    assert.match(bare, /^\.rl-chore\.is-struck::after \{ transform: scaleX\(1\); \}$/m);
    assert.match(bare, /^\.rl-row\.is-done \.rl-done \{ background: var\(--success\); border-color: var\(--success\); color: var\(--surface\); \}$/m);
    assert.match(bare, /^\.rl-row\.is-done \.rl-row-title::after \{ transform: scaleX\(1\); \}$/m);
    assert.match(bare, /@media \(max-width: 860px\) \{[^}]*\}[\s\S]*?\.rl-chore \{ white-space: normal; \}/, 'the chore may wrap on a phone');
  });
});

describe('the opening and the close', () => {
  const start = block('<section class="rl-frame" id="start"', '</section>');
  const close = block('<section class="rl-frame" id="zugang"', '</section>');
  test('the bar, the hook, the lead, the four rows as the product\'s task rows (each a way to its frame), two pills, the swipe hint', () => {
    const bar = block('<header class="rl-bar">', '</header>');
    assert.match(bar, /<a class="rl-brand" href="#start"><img src="\/images\/logo\.png" alt="Upgrads"><span data-i18n="rl_crm">CRM<\/span><\/a>/);
    assert.match(bar, /data-lang="de" aria-pressed="true">DE<\/button>/); assert.match(bar, /data-lang="en" aria-pressed="false">EN<\/button>/);
    assert.match(bar, /<a class="rl-pill rl-pill-sm" href="mailto:hello@upgrads\.de\?subject=Zugang%20zu%20Upgrads%20CRM" data-i18n="rl_request">Zugang anfragen<\/a>/);
    assert.match(start, /<h1 class="rl-h1" data-i18n="rl_hero_t">Vier Handgriffe gestrichen\.<\/h1>/);
    assert.match(start, /<p class="rl-lead" data-i18n="rl_hero_d">/);
    assert.match(start, /<ol class="rl-list" id="rl-list" data-i18n-aria="rl_list_aria" aria-label="Die vier Handgriffe">/);
    const rows = [...start.matchAll(/<li class="rl-row"><button type="button" class="rl-row-btn" data-go="(\d)"><span class="rl-done" aria-hidden="true"><svg class="rl-ic" aria-hidden="true"><use href="#rl-i-check"\/><\/svg><\/span><span class="rl-row-title" data-i18n="rl_c(\d)">([^<]+)<\/span><svg class="rl-ic rl-row-go" aria-hidden="true"><use href="#rl-i-chevron"\/><\/svg><\/button><\/li>/g)];
    assert.equal(rows.length, 4);
    rows.forEach((m, k) => { assert.equal(+m[1], k + 1); assert.equal(+m[2], k + 1); assert.equal(m[3], dict.de['rl_c' + (k + 1)]); });
    assert.match(start, /<a class="rl-pill" href="mailto:[^"]+" data-i18n="rl_request">Zugang anfragen<\/a>\s*<a class="rl-pill rl-pill-line" href="\/" data-i18n="rl_login">Anmelden<\/a>/);
    assert.match(start, /<p class="rl-hint"><span class="rl-hint-touch" data-i18n="rl_hint_touch">[^<]+<\/span><span class="rl-hint-key" data-i18n="rl_hint_key">[^<]+<\/span><svg class="rl-ic rl-hint-ic" aria-hidden="true"><use href="#rl-i-chevron"\/><\/svg><\/p>/);
    assert.match(close, /<h2 class="rl-h2-big" data-i18n="rl_close_t">Der fünfte Handgriff\.<\/h2>/);
    assert.match(close, /<p class="rl-lead" data-i18n="rl_close_d">/);
    assert.match(close, /<p class="rl-note" data-i18n="rl_foot_fiction">Alle Daten auf dieser Seite sind erfunden\.<\/p>/);
    assert.match(dict.de.rl_close_d, /Mitglied, Admin oder Inhaber/); assert.match(dict.en.rl_close_d, /member, admin or owner/);
  });
  test('each of the four middle frames: the chore (the same key as its hero row), one line, one screen', () => {
    for (const [id, n, piece] of [['leads', 1, 'rl-inbox'], ['deal', 2, 'rl-record'], ['termin', 3, 'rl-book'], ['gewonnen', 4, 'rl-won']]) {
      const sec = block(`<section class="rl-frame" id="${id}"`, '</section>');
      assert.match(sec, new RegExp(`<h2 class="rl-chore" id="rl-chore-${n}" data-i18n="rl_c${n}">${dict.de['rl_c' + n]}</h2>`));
      assert.match(sec, new RegExp(`<p class="rl-line" data-i18n="rl_p${n}_d">`));
      assert.match(sec, new RegExp(`id="${piece}"`)); assert.match(sec, /<div class="rl-piece rl-scroll">/);
    }
  });
});

describe('leads: the arrival', () => {
  test('four sources with their marks, the via line, the first stage column; an arrival does what the webhook does; nobody is told', () => {
    const sec = block('<section class="rl-frame" id="leads"', '</section>');
    for (const [src, mark] of [['fb', '#rl-l-fb'], ['ig', '#rl-l-ig'], ['tt', '#rl-l-tt'], ['web', '#rl-i-globe']]) assert.match(sec, new RegExp(`<button type="button" class="rl-src" data-src="${src}"><svg class="(rl-logo|rl-ic rl-logo)" aria-hidden="true"><use href="${mark}"/></svg><span data-i18n="rl_src_${src}">`));
    assert.match(sec, /<div class="rl-via"><span class="rl-via-line"><\/span><span class="rl-via-text" data-i18n="rl_via">über Make, Zapier oder n8n<\/span><span class="rl-via-line"><\/span><\/div>/);
    assert.match(sec, /<div class="rl-inbox" id="rl-inbox" role="group" data-i18n-aria="rl_inbox_aria" aria-label="Erste Phase mit neuen Leads"><\/div>/);
    const a = fnBody('rlArrive');
    assert.match(a, /const known = rlDeals\.find\(d => d\.email === email\);/);
    assert.match(a, /if \(known\) \{ known\.touched = true; known\.fresh = true; known\.updated = 0; known\.phone = phone; \}/);
    assert.match(a, /else rlDeals\.unshift\(\{ id: rlNextId\+\+, title: name, contact: name, company: '', email, phone, value: null, urg: 0, stage: 0, owner: 'AW', created: 0, updated: 0, src, time: rlNow\(\), fresh: true \}\);/);
    assert.doesNotMatch(a, /rlToast/, 'the lead webhook notifies nobody');
    assert.match(fnBody('rlRenderInbox'), /rlColHtml\(0, rlDeals\.filter\(d => d\.stage === 0\), true\)/);
    const col = fnBody('rlColHtml'), card = fnBody('rlCardHtml');
    assert.match(col, /<span class="rl-dot"><\/span><span class="rl-col-name">[^<]+<\/span><span class="rl-col-n">\$\{deals\.length\}<\/span><span class="rl-col-sum">\$\{sum \? rlEsc\(rlMoney\(sum\)\) : ''\}<\/span>/);
    assert.match(card, /<article class="rl-card\$\{d\.urg \? ' rl-urg-' \+ d\.urg : ''\}\$\{d\.fresh \? ' is-fresh' : ''\}" data-id="\$\{d\.id\}"\$\{quiet \? '' : ' tabindex="0"'\}/);
    assert.match(card, /\$\{d\.touched \? `<span class="rl-tag">\$\{rlEsc\(rlT\('rl_updated_tag'\)\)\}<\/span>` : ''\}/);
    for (const n of [1, 2, 3, 4]) same(`rl_urg_${n}`, `urg_${n}`);
    same('rl_created_ago', 'dv_created_ago');
    const seeded = [...read('db.js').matchAll(/\['(New|Contacted|Proposal|Negotiation|Won)',\s*'#([0-9a-f]{6})'/g)].map(m => m[1]);
    assert.deepEqual(seeded, ['New', 'Contacted', 'Proposal', 'Negotiation', 'Won'], 'the five stages on the page are the seeded ones, in order');
    for (const [i, tok] of [[0, 'neutral'], [1, 'info'], [2, 'warning'], [3, 'violet'], [4, 'success']]) assert.match(bare, new RegExp(`^\\.rl-s${i} \\{ --rl-sc: var\\(--${tok}\\); \\}$`, 'm'));
  });
});

describe('the deal record', () => {
  const r = fnBody('rlRenderRecord');
  test('the header, the stepper, the composer with the app\'s types, verbs, placeholders, the number and the template, Strg+Enter, the history', () => {
    assert.match(r, /<div class="rl-rec-name">\$\{rlEsc\(d\.title\)\}<\/div>/);
    assert.match(r, /\$\{rlEsc\(rlT\('rl_deal_value'\)\)\}: <b>\$\{rlEsc\(rlMoney\(d\.value\)\)\}<\/b>/);
    assert.match(r, /<a class="rl-btn rl-btn-primary" href="#termin">\$\{rlIcon\('calendar'\)\}\$\{rlEsc\(rlT\('rl_book_btn'\)\)\}<\/a>/);
    assert.match(r, /class="rl-step rl-s\$\{i\}\$\{i < d\.stage \? ' is-done' : ''\}\$\{i === d\.stage \? ' is-current' : ''\}\$\{i === 4 \? ' is-won' : ''\}" data-stage="\$\{i\}" aria-pressed="\$\{i === d\.stage\}"/);
    assert.match(r, /\['note', 'call', 'email', 'whatsapp'\]\.map\(typeBtn\)/);
    assert.match(r, /<textarea class="rl-textarea" id="rl-compose-text" rows="2" maxlength="2000" placeholder="\$\{rlEsc\(rlT\('rl_ph_' \+ rlRec\.type\)\)\}"/);
    assert.match(r, /<b>\$\{rlEsc\(d\.contact\)\}<\/b>, \$\{rlEsc\(d\.phone\)\}<\/span><span class="rl-btn rl-btn-sm">\$\{rlEsc\(rlT\('rl_open_whatsapp'\)\)\}<\/span><\/div><p class="rl-help rl-template">\$\{rlEsc\(rlT\('rl_wa_template_lbl'\)\)\}: „Hi \$\{rlEsc\(d\.contact\)\}, “<\/p>/);
    assert.match(r, /\$\{rlEsc\(rlT\('rl_logged_as_on', \{ user: RL_PEOPLE\.AW, contact: d\.contact \}\)\)\} \$\{rlEsc\(rlT\('rl_ctrl_enter'\)\)\}<\/span><button type="submit" class="rl-btn rl-btn-primary rl-btn-sm">\$\{rlEsc\(rlT\('rl_verb_' \+ rlRec\.type\)\)\}<\/button>/);
    assert.match(r, /acts\.slice\(0, 2\)\.map/, 'the latest two entries: the record fits a 720 px laptop without an inner scroll');
    assert.match(r, /\$\{a\.join \? `<span class="rl-btn rl-btn-sm rl-tl-join">\$\{rlIcon\('calendar'\)\}\$\{rlEsc\(rlT\('rl_join', \{ app: a\.join \}\)\)\}<\/span>` : ''\}/);
    assert.match(js, /^let rlRec = \{ type: 'call', text: '' \};$/m, 'the composer opens on Call; the scene switches it to WhatsApp');
    assert.match(fnBody('rlInitRecord'), /e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)\) \{ e\.preventDefault\(\); rlLog\(e\.target\.value\); \}/);
    const l = fnBody('rlLog');
    assert.match(l, /const t = text\.trim\(\); if \(!t\) return;/);
    assert.match(l, /rlToast\(rlT\('rl_act_logged', \{ type: rlT\('rl_act_' \+ act\.type\) \}\), \(\) => \{ rlActs = rlActs\.filter\(a => a\.id !== act\.id\); rlRenderRecord\(\); \}\);/);
    assert.match(read('db.js'), /'Hi \{\{name\}\}, '/, 'the default WhatsApp template the hint shows');
    for (const t of ['note', 'call', 'email', 'whatsapp']) { same(`rl_act_${t}`, `act_${t}`); same(`rl_verb_${t}`, `act_verb_${t}`); same(`rl_ph_${t}`, `act_ph_${t}`); }
    for (const [k, a] of [['rl_act_meeting', 'act_meeting'], ['rl_to_whom', 'dv_to_whom'], ['rl_open_dialer', 'dv_open_dialer'], ['rl_open_mail', 'dv_open_mail'], ['rl_open_whatsapp', 'dv_open_whatsapp'], ['rl_logged_as_on', 'dv_logged_as_on'], ['rl_ctrl_enter', 'dv_ctrl_enter'], ['rl_act_logged', 'act_logged'], ['rl_by_name', 'dv_by_name'], ['rl_compose_text_lbl', 'dv_compose_text_lbl'], ['rl_wa_template_lbl', 'set_wa_template'], ['rl_types_aria', 'dv_activity_type'], ['rl_join', 'cal_join'], ['rl_deal_value', 'dv_deal_value'], ['rl_current_stage', 'dv_current_stage'], ['rl_move_to', 'dv_move_to_stage'], ['rl_deal_stage_aria', 'dv_deal_stage_aria'], ['rl_book_btn', 'cal_book_btn']]) same(k, a);
    for (const t of ['note', 'call', 'email', 'whatsapp', 'meeting']) assert.match(bare, new RegExp(`\\.rl-tl-${t} \\{ color: var\\(--`));
  });
});

describe('the meeting', () => {
  const b = fnBody('rlRenderBook'), w = fnBody('rlWeekHtml');
  test('the sheet as the app\'s dialog beside the week; the booking and its undo', () => {
    assert.match(b, /<div class="rl-sheet-title">\$\{rlEsc\(rlT\('rl_book_title', \{ name: d\.contact \}\)\)\}<\/div>/);
    assert.match(b, /field\('rl_book_type', seg\('len', \[\[30, 'rl_type_30'\], \[60, 'rl_type_60'\]\], B\.len\)\)/);
    assert.match(b, /field\('rl_book_where', seg\('where', \[\['meet', 'rl_where_meet'\], \['phone', 'rl_where_phone'\]\], B\.where\)\)/);
    assert.match(b, /<select class="rl-select" id="rl-book-time"[^>]*><option value="">\$\{rlEsc\(rlT\('rl_book_time_ph'\)\)\}<\/option>/);
    assert.match(b, /const slotLabel = s => rlT\('rl_book_slot', \{ from: s, to: rlFmt\(rlMin\(s\) \+ B\.len\), ampm: rlAmPm\(s\) \}\);/);
    assert.match(b, /rlT\('rl_book_zone', \{ zone: 'Europe\/Berlin', host: RL_PEOPLE\.AW \}\)/);
    assert.match(b, /<div class="rl-conflict" role="alert">\$\{conflicts\.map\(c => `<p>\$\{rlEsc\(rlT\('rl_book_conflict', \{ time: c\.start, title: rlT\(c\.key\), who: RL_PEOPLE\[c\.who\] \}\)\)\}<\/p>`\)\.join\(''\)\}<p>\$\{rlEsc\(rlT\('rl_book_conflict_hint'\)\)\}<\/p><\/div>/);
    assert.match(b, /id="rl-book-go"\$\{B\.slot \? '' : ' disabled'\}>\$\{rlEsc\(rlT\(conflicts\.length \? 'rl_book_anyway' : 'rl_book_submit'\)\)\}/);
    assert.match(w, /const H0 = 9, H1 = 17;/);
    assert.match(w, /data-c="\$\{ev\.day \+ 2\}" data-r="\$\{Math\.floor\(rlMin\(ev\.start\) \/ 60\) - H0 \+ 1\}" data-rs="\$\{Math\.ceil\(ev\.len \/ 60\)\}"/);
    assert.match(bare, /\.rl-week-lines, \.rl-week-evs \{ display: grid; grid-template-columns: 48px repeat\(5, minmax\(0, 1fr\)\); grid-auto-rows: 44px; \}/);
    assert.match(bare, /\.rl-week-evs \{ position: absolute; inset: 0; pointer-events: none; \}/);
    const k = fnBody('rlBook');
    assert.match(k, /const ev = \{ id: 'b' \+ rlNextId\+\+, day: B\.day, start: B\.slot, len: B\.len, who: 'AW', title: d\.contact, booked: true \};/);
    assert.match(k, /type: 'meeting', who: 'AW', days: 0, time: rlNow\(\), key: 'rl_x_booked', vars: \{[^}]*\}, join: B\.where === 'meet' \? 'Google Meet' : null \};/);
    assert.match(k, /rlToast\(rlT\('rl_book_done', \{ when \}\), \(\) => rlCancelBooking\(ev\.id, act\.id\)\);/);
    for (const k2 of ['title', 'type', 'where', 'date', 'time', 'time_ph', 'slot', 'zone', 'invite_to', 'submit', 'anyway', 'conflict', 'conflict_hint', 'done', 'with']) same(`rl_book_${k2}`, `cal_book_${k2}`);
  });
});

describe('Gewonnen and the Engine', () => {
  test('the hero\'s stage beside Gewonnen, the foot, the Engine card in the same frame; the drag and the keys; the move contract; the Engine fires on Won and forgets on the way back', () => {
    const w = fnBody('rlRenderWon'), m = fnBody('rlMoveDeal'), i = fnBody('rlInitWon');
    assert.match(w, /if \(hero\.stage < 4\) rlLeftStage = hero\.stage;/);
    assert.match(w, /rlColHtml\(rlLeftStage, rlDeals\.filter\(d => d\.stage === rlLeftStage\), false\) \+ rlColHtml\(4, rlDeals\.filter\(d => d\.stage === 4\), false\)/);
    assert.match(w, /<button type="button" class="rl-btn rl-btn-primary" id="rl-won-go"\$\{hero\.stage === 4 \? ' disabled' : ''\}>\$\{rlEsc\(rlT\('rl_move_to', \{ s: rlStageName\(4\) \}\)\)\}<\/button>/);
    assert.match(w, /`<div class="rl-eng rl-surface" id="rl-engine"><\/div>`;\s*rlRenderEngine\(\);/);
    assert.match(fnBody('rlRenderAll'), /^\{ rlRenderInbox\(\); rlRenderRecord\(\); rlRenderBook\(\); rlRenderWon\(\); \}$/);
    assert.match(m, /stage = rlClamp\(stage, 0, RL_STAGES\.length - 1\);/);
    assert.match(m, /rlToast\(rlT\('rl_moved_to', \{ s: rlStageName\(stage\) \}\), \(\) => rlMoveDeal\(id, prev, true\)\);/);
    assert.match(i, /if \(Math\.hypot\(e\.clientX - drag\.x, e\.clientY - drag\.y\) < 6\) return;/);
    assert.match(i, /document\.elementFromPoint\(e\.clientX, e\.clientY\)\?\.closest\('\.rl-col'\)/);
    assert.match(i, /if \(ghost && over\) rlMoveDeal\(id, \+over\.dataset\.stage\);/);
    assert.match(i, /rlMoveDeal\(d\.id, e\.key === 'ArrowRight' \? 4 : rlLeftStage\);/);
    assert.match(i, /if \(e\.target\.closest\('#rl-won-go'\)\) rlMoveDeal\(RL_HERO, 4\);/);
    assert.match(bare, /\.rl-ghost \{ position: fixed; left: 0; top: 0; z-index: 90;[^}]*pointer-events: none; \}/);
    assert.match(bare, /^\.rl-won \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(0, 1\.15fr\); gap: 20px; align-items: start; \}$/m);
    assert.match(bare, /^\.rl-eng \{ grid-column: 3; grid-row: 1 \/ 3; padding: 14px 16px 16px; \}$/m);
    same('rl_moved_to', 'moved_to'); same('rl_undo', 'undo'); same('rl_st_won', 'an_won');
    const t = fnBody('rlToast');
    assert.match(t, /while \(host\.children\.length >= 3\) host\.firstChild\.remove\(\);/); assert.match(t, /setTimeout\(\(\) => el\.remove\(\), 4200\);/);
  });
  test('the Engine card: Aktiv, the trigger stage, one event Ausstehend → Zugestellt with one attempt, the seven statuses in the schema\'s order; seven attempts; no invented note', () => {
    const e = fnBody('rlRenderEngine'), f = fnBody('rlEngineFire'), r = fnBody('rlEngineReset');
    assert.match(e, /<span class="rl-badge rl-ok">\$\{rlEsc\(rlT\('rl_engine_active'\)\)\}<\/span>/);
    assert.match(e, /\$\{rlEsc\(rlT\('rl_engine_stages_label'\)\)\}<\/span><span class="rl-stage rl-s4"><span class="rl-dot"><\/span>\$\{rlEsc\(rlStageName\(4\)\)\}<\/span>/);
    assert.match(e, /<span class="rl-badge \$\{rlEngine\.delivered \? 'rl-ok' : 'rl-wait'\}">\$\{rlEsc\(rlT\(rlEngine\.delivered \? 'rl_status_success' : 'rl_status_pending'\)\)\}<\/span><span class="rl-help">1 \$\{rlEsc\(rlT\('rl_attempt_one'\)\)\}<\/span>/);
    assert.match(e, /: `<p class="rl-help">\$\{rlEsc\(rlT\('rl_no_deliveries'\)\)\}<\/p>`/);
    assert.match(e, /\[0, 1, 2, 3, 4, 5, 6\]\.map\(s => `<span class="rl-path-step\$\{rlEngine\.step === s \? ' is-on' : ''\}">\$\{rlEsc\(rlT\('rl_onb_s' \+ s\)\)\}<\/span>`\)/);
    assert.match(f, /rlEngine = \{ fired: true, delivered: false, step: 0 \};/);
    assert.match(f, /rlEngine\.delivered = true; rlEngine\.step = 1; rlRenderEngine\(\);/);
    assert.match(f, /if \(rlReduced\(\)\) done\(\); else rlEngineTimer = setTimeout\(done, 1100\);/);
    assert.match(r, /clearTimeout\(rlEngineTimer\);/);
    assert.doesNotMatch(f + r, /rlActs/, 'no invented Engine note in the history');
    const db = read('db.js'); const i = db.indexOf('onboarding_status IN ('); const order = [...db.slice(i, db.indexOf('))', i)).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    assert.equal(order.length, 7);
    order.forEach((s, n) => same(`rl_onb_s${n}`, `onb_status_${s}`));
    const delays = new Function(sliceConst('utils/engine.js', 'RETRY_DELAYS_SEC').replace(/^[^[]*/, 'return '))();
    assert.match(read('utils/engine.js'), /const MAX_ATTEMPTS\s*=\s*RETRY_DELAYS_SEC\.length \+ 1;/); assert.equal(delays.length + 1, 7);
    for (const [k, a] of [['rl_engine_title', 'engine_title'], ['rl_engine_active', 'engine_active'], ['rl_engine_stages_label', 'engine_stages_label'], ['rl_deliveries_title', 'engine_deliveries_title'], ['rl_no_deliveries', 'engine_no_deliveries'], ['rl_status_pending', 'engine_status_pending'], ['rl_status_success', 'engine_status_success'], ['rl_attempt_one', 'engine_attempt_one'], ['rl_onb_col_status', 'onb_col_status']]) same(k, a);
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
    for (const m of js.matchAll(/'(rl_[a-z0-9_]+)'/g)) used.add(m[1]);
    const prefixes = [...new Set([...js.matchAll(/'(rl_[a-z0-9_]*)' \+/g)].map(m => m[1]))];
    const dynamic = ['rl_x_', 'rl_d', 'rl_st_'];
    for (const k of Object.keys(dict.de)) assert.ok(used.has(k) || prefixes.some(p => k.startsWith(p)) || dynamic.some(p => k.startsWith(p)), `${k} is used`);
    for (const k of used) if (!prefixes.includes(k)) assert.ok(k in dict.de, `${k} exists`);
    for (const k of Object.keys(dict.de).filter(k => dynamic.some(p => k.startsWith(p)))) assert.ok(js.includes(`'${k}'`), `${k} is referenced as a value`);
  });
  test('impersonal German, English where it differs, a short allow-list of names that stay', () => {
    const KEEP = /^(CRM|Deal|Start|Leads|Website|WhatsApp|Google Meet|Upgrads Engine|Facebook Ads|Instagram Ads|TikTok Ads)$/;
    for (const [k, v] of Object.entries(dict.de)) {
      assert.doesNotMatch(v, IMPERSONAL, `${k} is impersonal: ${v}`);
      if (!KEEP.test(v)) assert.notEqual(v, dict.en[k], `${k} is translated`);
    }
    assert.doesNotMatch(body.replace(/<svg[\s\S]*?<\/svg>/g, ''), IMPERSONAL);
  });
  test('concise: the caps on the hook, the leads, the chores, the lines, the tabs, the hints, the page copy as a whole', () => {
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      assert.ok(words(d.rl_hero_t) <= 5, `${lang} hook ≤ 5`);
      for (const k of ['rl_hero_d', 'rl_close_d']) assert.ok(words(d[k]) <= 14, `${lang} ${k} ≤ 14: ${d[k]}`);
      for (const k of ['rl_c1', 'rl_c2', 'rl_c3', 'rl_c4']) { assert.ok(words(d[k]) <= 3, `${lang} ${k} ≤ 3: ${d[k]}`); assert.doesNotMatch(d[k], /[.!]$/, `${lang} ${k}: a chore, not a sentence`); }
      assert.ok(words(d.rl_close_t) <= 4, `${lang} close ≤ 4`);
      for (const k of ['rl_p1_d', 'rl_p2_d', 'rl_p3_d', 'rl_p4_d']) assert.ok(words(d[k]) <= 13, `${lang} ${k} ≤ 13: ${d[k]}`);
      for (let n = 0; n < 6; n++) assert.ok(words(d['rl_tab_' + n]) === 1, `${lang} tab ${n} is one word`);
      assert.equal(new Set([0, 1, 2, 3, 4, 5].map(n => d['rl_tab_' + n])).size, 6, `${lang}: six distinct tabs`);
      for (const k of ['rl_hint_touch', 'rl_hint_key']) assert.ok(words(d[k]) <= 4, `${lang} ${k}`);
      assert.ok(words(d.rl_via) <= 5, `${lang} via ≤ 5`);
      const total = PAGE_KEYS.reduce((a, k) => a + words(d[k]), 0);
      assert.ok(total <= 160, `${lang}: ${total} words of page copy`);
    }
  });
  test('the claims audit: no code or protocol words, no competitor, no superlative, no price, no notification or mention promise', () => {
    const copy = Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + '\n' + body.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy, /\b(webhook|api|endpoint|payload|json|hmac|http|url|token|header|curl)\b/i);
    assert.doesNotMatch(copy, /pipedrive|hubspot|onoffice|propstack|salesforce/i);
    assert.doesNotMatch(copy, /(?<!\p{L})(beste[rsn]?|schnellste[rsn]?|einfachste[rsn]?|einzige[rsn]?|revolutionär|führend|marktführer|best|fastest|easiest|leading|revolutionary|world-class)(?!\p{L})/iu);
    assert.doesNotMatch(copy, /\b(preis|price|kostenlos|free|trial|testphase|rabatt|discount)\b|€|\$/i);
    assert.doesNotMatch(copy, /benachrichtig|glocke|notification|erwähn|mention|@\w/i);
    assert.doesNotMatch(copy, /Lead Ads|Doppelbuchung|double.?booking|forecast|prognose/i);
    assert.doesNotMatch(js.replace(/\/\/.*$/gm, ''), /notif|bell|Glocke/i, 'no notification claims');
  });
});

describe('pure helpers', () => {
  const F = loadFns('public/js/landing2.js', ['rlMoney', 'rlClamp', 'rlEsc', 'rlMin', 'rlFmt', 'rlAmPm', 'rlConflict', 'rlIndexOf'], { state: { RL_IDS: ['start', 'leads', 'deal', 'termin', 'gewonnen', 'zugang'] } });
  test('money as the board shows it; the hash to a frame index', () => {
    assert.equal(F.rlMoney(9800), '9.8k €'); assert.equal(F.rlMoney(1200000), '1.2M €'); assert.equal(F.rlMoney(900), '900 €'); assert.equal(F.rlMoney(null), '');
    assert.equal(F.rlIndexOf('#termin'), 3); assert.equal(F.rlIndexOf('#nothing'), 0); assert.equal(F.rlIndexOf(''), 0); assert.equal(F.rlIndexOf('#zugang'), 5);
    assert.equal(F.rlClamp(9, 0, 5), 5); assert.equal(F.rlEsc('<b>&"'), '&lt;b&gt;&amp;&quot;');
  });
  test('time helpers and the conflict check: the host\'s own entries on that day, overlapping, nothing else; the scene\'s pick really conflicts', () => {
    assert.equal(F.rlMin('14:00'), 840); assert.equal(F.rlFmt(870), '14:30'); assert.equal(F.rlAmPm('14:00'), '2 pm'); assert.equal(F.rlAmPm('09:00'), '9 am');
    const events = new Function('return ' + js.match(/\nlet rlEvents = (\[[\s\S]*?\n\]);/)[1])();
    assert.deepEqual(F.rlConflict(1, '11:00', 30, events, 'AW').map(e => e.id), ['e2'], 'Tuesday 11:00 meets the team meeting: what the scene shows');
    assert.deepEqual(F.rlConflict(1, '10:30', 60, events, 'AW').map(e => e.id), ['e2'], 'an hour from 10:30 overlaps 11:00');
    assert.deepEqual(F.rlConflict(1, '14:00', 60, events, 'AW').map(e => e.id), [], 'an hour from 14:00 ends as the viewing starts');
    assert.deepEqual(F.rlConflict(3, '10:00', 30, events, 'AW'), [], 'another person\'s entry is not the host\'s');
    for (const ev of events) { const h = +ev.start.slice(0, 2); assert.ok(h >= 9 && h + ev.len / 60 <= 17, `${ev.id} inside the week's hours`); }
  });
});

describe('stylesheet discipline and the audit', () => {
  const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96, 128]);
  const PROPS = new Set(('position top right bottom left inset z-index display flex flex-direction flex-wrap align-items align-content align-self justify-content gap column-gap row-gap grid-template-columns grid-template-rows grid-auto-rows grid-column grid-row place-items width min-width max-width height min-height max-height margin margin-top margin-bottom margin-left margin-inline padding padding-top padding-bottom padding-left border border-top border-bottom border-left border-color border-left-color border-bottom-color border-radius background color font-family font-size font-weight font-style font-display font-variant-numeric src line-height letter-spacing text-align text-wrap text-overflow text-decoration white-space overflow overflow-x overflow-y overflow-wrap overscroll-behavior overscroll-behavior-x overscroll-behavior-y scroll-snap-type scroll-snap-align scroll-snap-stop scrollbar-width opacity transform transform-origin translate transition animation box-shadow outline outline-offset cursor user-select -webkit-user-select pointer-events touch-action isolation content fill stroke stroke-width stroke-linecap stroke-linejoin resize list-style backdrop-filter -webkit-backdrop-filter').split(' '));
  test('every class in the stylesheet is used by the markup or the script, and every class they use has a rule', () => {
    for (const c of cssClasses) assert.ok(usedClasses.has(c) || dynamicPrefixes.some(p => c.startsWith(p)) || [...dynamicTokens].some(p => c.startsWith(p)), `.${c} is used`);
    for (const c of usedClasses) if (/^(rl|is)-/.test(c) && !ids.has(c) && !dynamicPrefixes.includes(c) && !dynamicTokens.has(c)) assert.ok(cssClasses.has(c), `.${c} has a rule`);
  });
  test('prefix, tokens only, no gradient, two keyframes, no caps, no pointer effects, no !important', () => {
    for (const r of rules) if (!r.selector.startsWith('@') && !r.in.includes('@keyframes')) assert.ok(/rl-|body\.rl|html\.rl/.test(r.selector), `scoped: ${r.selector}`);
    assert.doesNotMatch(bare, /#[0-9a-f]{3,8}\b/i, 'no hex');
    assert.equal((bare.match(/gradient\(/g) || []).length, 0, 'no gradient: the page is flat, colour comes from the product');
    assert.deepEqual([...bare.matchAll(/@keyframes ([a-z-]+)/g)].map(m => m[1]), ['rl-nudge', 'rl-in']);
    assert.doesNotMatch(bare, /text-transform|!important|mousemove|rotateX|rotateY|perspective|deviceorientation/);
    assert.doesNotMatch(js, /mousemove|rotateX|rotateY|perspective|deviceorientation|innerHTML \+=/);
    assert.match(bare, /body\.rl \{[^}]*--rl-ground: var\(--canvas\);/);
    assert.match(bare, /^\.rl-pill \{[^}]*border: 1px solid var\(--ink\);[^}]*background: var\(--ink\); color: var\(--canvas\);/m, 'the page\'s own voice is monochrome');
  });
  test('every custom property resolves; every property name is a real one; no declaration is repeated in a rule; no selector is declared twice at the same level', () => {
    const defined = new Set([...(style + bare).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]).concat([...js.matchAll(/setProperty\('(--[a-z0-9-]+)'/g)].map(m => m[1])));
    for (const m of bare.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
    const seen = new Set();
    for (const r of rules) {
      const props = r.decls.map(([p]) => p);
      for (const p of props) assert.ok(PROPS.has(p) || p.startsWith('--'), `${r.selector}: "${p}" is a property`);
      assert.equal(new Set(props).size, props.length, `${r.selector}: no repeated declaration`);
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
    assert.deepEqual(bps, [1200, 1024, 860, 600, 480]);
    assert.ok(bare.lastIndexOf('@media (prefers-reduced-motion: reduce)') > bare.lastIndexOf('@media (max-width'));
    assert.ok(bare.lastIndexOf('@media (prefers-reduced-motion: reduce)') > bare.lastIndexOf('@media (pointer: coarse)'));
    const z = Object.fromEntries(rules.filter(r => r.decls.some(([p]) => p === 'z-index')).map(r => [r.selector, r.decls.find(([p]) => p === 'z-index')[1]]));
    assert.deepEqual(z, { '.rl-bar': '50', '.rl-arrow': '50', '.rl-fly': '90', '.rl-ghost': '90', '.rl-toasts': '80' });
  });
  test('the script: every id it touches exists, the app\'s language key, the start on DOMContentLoaded', () => {
    for (const m of js.matchAll(/getElementById\('([^']+)'\)|closest\('#([^']+)'\)|querySelector\('#([^']+) /g)) assert.ok(ids.has(m[1] || m[2] || m[3]), `#${m[1] || m[2] || m[3]} exists`);
    assert.match(js, /localStorage\.getItem\('lang'\)/); assert.match(js, /localStorage\.setItem\('lang', l\)/);
    assert.match(js.trim(), /document\.addEventListener\('DOMContentLoaded', rlInit\);$/);
    assert.match(js, /^'use strict';$/m);
  });
});
