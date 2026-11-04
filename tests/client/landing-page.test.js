// CLIENT (static + sandboxed) tests for the landing page at /landingpage (built as /landingpagetwo in LOGIN_LANDING_CHANGES Part 49 and promoted in Part 50,
// the redo, 2026-10-28, its five fix rounds, an honesty round and a design round): "Anfragen, Termine, Notizen: ohne Abtippen." A page of five interactive
// parts, each one place of the CRM zoomed in, which the visitor drives: Anfrage (the hero), Termin, Notiz, Abschluss (full
// width) on the spine (the deal's four steps), then the rest of the sales day behind six tabs. No demo: no film, no scripted cursor, and
// no whole-CRM shell (sidebar, top bar, palette) anywhere. Every part is the app's own markup
// (public/js/landing-ui.js, the app's render code ported and assembled with a generated copy of its words), drawn
// by the app's own stylesheet over a sample workspace; public/js/landing.js (assembled from the redo's sources)
// runs the app's rules on it.
// Pinned: the route and the document; the face; nothing of earlier pages and no demo; the replica layer (its words
// equal TRANSLATIONS, its helpers are the app's own text, its renderers draw what the app's draw); the sample world's
// rules against the code that has them; the parts (order, no shell, the spine, the routing homes, the zoom and the
// narrow layout) and one acceptance run per part, in a sandbox; the words audits; the request; the stylesheet audit;
// the script. The DOM-driven walk of every part (about 300 checks) runs in jsdom outside this suite (no jsdom here).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const { read, sliceConst, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const server = read('server.js');
const html   = read('public/landingpage.html');
const cssAll = read('public/landing.css');
const js     = read('public/js/landing.js');
const ui     = read('public/js/landing-ui.js');
const style  = read('public/style.css');
const REL    = 'public/js/landing.js';
const MARK   = '/* ── 16 replica context (generated from the porters\' kr-*.css) ────────────── */';
const css    = cssAll.slice(0, cssAll.indexOf(MARK));          // the page's own design and the parts' (sections 01–15)
const gen    = cssAll.slice(cssAll.indexOf(MARK));             // section 16: the app's id rules, class-scoped
const dict   = new Function(sliceConst(REL, 'KN_I18N').replace(/^[^{]*/, 'return '))();
const app    = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bodyNoSprite = body.replace(/<svg class="kn-sprite"[\s\S]*?<\/svg>/, '');
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const PARTS  = ['anfrage', 'termin', 'notiz', 'abschluss', 'day', 'engine'];   // (round 22) the Upgrads Engine's own block after the day
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words  = s => String(s).trim().split(/\s+/).filter(Boolean).length;
// read aloud, or shown only after an action or on a touch screen
const LABELS = /^kn_(f_(anfrage|termin|notiz|abschluss)|nav|lang|legal|off|step|step_done|mail_\w+|done_\w+|f_sending|f_err_\w+|f_fallback|f_text|f_copy|f_copied|f_edit|src_why|e_do_touch|e_next|e_all|e_stand|jump_tag|noscript|skip\d|toc|f_fallback_fail|f_open_mail|f_retry|t_booked|back|back_day|doc_title|meta_desc|og_\w+|n_none)$/;   // e_stand: shown after the win; jump_tag: on hover and focus
// the copy a visitor reads on arrival: not the labels, not kn_c_d (it swaps with kn_c_d_mail), not the folded answers,
// not the lines of the tabs not yet chosen (Kontakte is the first)
const SEEN   = Object.keys(dict.de).filter(k => !LABELS.test(k) && k !== 'kn_c_d' && !/^kn_a\d$/.test(k) && k !== 'kn_new' && !/^kn_(day|do)_(tasks|calendar|chat|analytics|settings)$/.test(k));
const COMPETITORS = /\b(hubspot|pipedrive|salesforce|zoho|onoffice|propstack|attio|twenty|monday\.com|close\.com|freshsales|copper|keap|insightly|nethunt|fireflies|tl;dv|tldv|claap|read\.ai|meetgeek)\b/i;
const EARLIER_HOOKS = ['Das CRM, das mit anpackt.', 'Alles landet im Deal.', 'Das CRM, das den Kleinkram übernimmt.', 'Ein CRM, kein Bastelprojekt.', 'Wer hat das alles eingetippt?', 'Erst Probe fahren. Dann reden.', 'Selbst zum Lead werden.'];
const norm = s => s.replace(/\s(on[a-z]+)="[^"]*"/g, '').replace(/\sdraggable="true"/g, '').replace(/\sdata-kr(-arg)?="[^"]*"/g, '').replace(/\s+/g, ' ').replace(/\s+>/g, '>').replace(/> </g, '><').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Both scripts in one sandbox, the way the browser runs them (shared global scope), with a document that only
// records the start and answers every lookup with nothing: the sample world, the rules and the replicas run without
// a DOM, and a part runs on a stand-in frame whose layers keep the HTML the app would draw (knFake).
function sandbox() {
  const started = [];
  const el = () => ({ innerHTML: '', textContent: '', content: { querySelector: () => null, querySelectorAll: () => [] }, querySelector: () => null, querySelectorAll: () => [], setAttribute() {} });
  // the context's own built-ins (an outer-realm Object would fail knL's plain-object test, as no browser would)
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, window: {},
    document: { addEventListener: (type, fn) => started.push([type, fn.name]), getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, createElement: el, documentElement: { setAttribute() {}, lang: 'de' } } });
  vm.runInContext(ui, ctx, { filename: 'landing-ui.js' });
  vm.runInContext(js, ctx, { filename: 'landing.js' });
  vm.runInContext(`function knFake(name, cw) {
    const P = KN_PARTS.find(p => p.name === name), box = () => ({ innerHTML: '', firstElementChild: null, querySelector: () => null, querySelectorAll: () => [], classList: { toggle() {}, add() {}, remove() {}, contains: () => false } });
    const F = { part: P, kind: P.name, p: P.p, w: P.w, h: P.h, s: 1, root: box(), app: box(), layers: Object.fromEntries(KN_LAYERS.map(l => [l, box()])), timers: new Set(), run: 0, live: false, drag: null, noClick: false,
      host: { clientWidth: cw || 0, vars: {}, narrow: null, style: { setProperty(k, v) { F.host.vars[k] = v; } }, classList: { toggle(c, on) { if (c === 'kn-narrow') F.host.narrow = on; } }, setAttribute() {} } };
    KN[P.name] = F;
    F.W = knWorld(P);
    return F;
  }`, ctx);
  ctx.__started = started;
  return ctx;
}
const S = sandbox();
const run = code => vm.runInContext(code, S);
const val = code => JSON.parse(run(`JSON.stringify(${code})`));   // a value out of the sandbox, in this realm (deepEqual compares prototypes)

describe('route and document', () => {
  test('/landingpage serves public/landingpage.html, before the SPA catch-all', () => {
    assert.match(server, /app\.get\('\/landingpage', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'public', 'landingpage\.html'\)\)\);/);
    const one = server.indexOf("app.get('/landingpage',"), all = server.indexOf("app.get('*'");
    assert.ok(one > 0 && all > one);
  });
  test('the head: German, no data-theme (the parts start in the app\'s light theme), the face and Inter preloaded, the app stylesheet first, the replicas then the page script, both deferred', () => {
    assert.match(html, /^<!DOCTYPE html>\n<html lang="de" class="kn-root">\n/);
    for (const f of ['ManropeVF', 'inter-latin-wght']) assert.match(head, new RegExp(`<link rel="preload" href="/fonts/${f}\\.woff2" as="font" type="font/woff2" crossorigin>`));
    assert.match(head, /<link rel="stylesheet" href="\/style\.css">\s*<link rel="stylesheet" href="\/landing\.css">\s*<script src="\/js\/landing-ui\.js" defer><\/script>\s*<script src="\/js\/landing\.js" defer><\/script>\s*<\/head>/);
    assert.equal((html.match(/<script\b/g) || []).length, 2);
    assert.match(head, /<meta name="description" data-kn-meta="kn_meta_desc" content="[^"]+">/); assert.match(head, /<meta property="og:description" data-kn-meta="kn_og_desc" content="[^"]+">/);
    assert.match(head, /<title>Upgrads CRM: Anfragen, Termine und Notizen im Deal<\/title>/, 'a descriptive title, the one the language switch sets (kn_doc_title)');
    // og:image stays relative: the build knows no origin, and the page names no host
    for (const [k, v] of [['og:type', 'website'], ['og:title', 'Upgrads CRM: Anfrage, Termin und Notiz landen von selbst im Deal.'], ['og:image', '/images/logo.png']]) assert.match(head, new RegExp(`<meta property="${k}" (data-kn-meta="[a-z_]+" )?content="${v.replace(/\./g, '\\.')}">`), k);
    assert.equal((body.match(/<main\b/g) || []).length, 1);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.doesNotMatch(html, /\sstyle="|<style\b|\son(click|load|input|submit|change|keydown)="/);
    assert.doesNotMatch(html.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''), /https?:\/\/(?!upgrads\.de(\/|"))/, 'no other host: the only links go to upgrads.de');
  });
  test('the sprite: the app\'s icon symbols verbatim from index.html, then no source glyphs (the sources by name only, round 11); every icon the replicas draw is in it; no cursor glyph', () => {
    const index = read('public/index.html');
    const appSprite = index.slice(index.indexOf('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'));
    const appSyms = appSprite.slice(appSprite.indexOf('\n') + 1, appSprite.indexOf('</svg>')).trim();
    assert.match(body, /^<body class="kn">\n<!-- the app's icon sprite, verbatim from public\/index\.html[^\n]*\n<svg class="kn-sprite" xmlns="http:\/\/www\.w3\.org\/2000\/svg" aria-hidden="true" focusable="false">\n/);
    assert.ok(body.includes(appSyms), 'the app\'s symbols, verbatim');
    const ids = new Set([...body.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
    for (const g of ['kn-g-form', 'kn-g-make', 'kn-g-zapier', 'kn-g-n8n']) assert.ok(!ids.has(g), `${g}: gone, the sources by name only`);
    assert.doesNotMatch(body, /<button type="button" class="kn-src"[^>]*><svg/, 'no drawn marks on the source buttons');
    assert.ok(!ids.has('kn-cur'), 'the film\'s cursor glyph is gone');
    const alias = new Function(`${sliceConst('public/js/core.js', 'ICON_ALIAS')} return ICON_ALIAS;`)();
    const drawn = new Set([...ui.matchAll(/(?<![\w$.])icon\('([a-z-]+)'/g), ...ui.matchAll(/icon: '([a-z-]+)'/g), ...ui.matchAll(/#i-([a-z-]+)/g)].map(m => alias[m[1]] || m[1]));
    for (const n of drawn) assert.ok(ids.has('i-' + n), `#i-${n} is in the sprite`);
  });
  test('the face (round 16): Manrope, self-hosted with its licence, its weight axis declared; the only face the page names; Encode Sans gone', () => {
    const file = path.join(ROOT, 'public/fonts/ManropeVF.woff2');   // published as ManropeVF (an earlier page's Manrope.woff2 stays gone)
    assert.ok(fs.statSync(file).size > 20000); assert.equal(fs.readFileSync(file).slice(0, 4).toString('latin1'), 'wOF2');
    assert.match(read('public/fonts/OFL-ManropeVF.txt'), /SIL Open Font License, Version 1\.1/);
    assert.match(bare, /@font-face \{ font-family: "Manrope"; font-style: normal; font-weight: 200 800; font-display: swap; src: url\(\/fonts\/ManropeVF\.woff2\) format\("woff2"\); \}/);
    assert.deepEqual([...new Set([...bare.matchAll(/font-family: "([^"]+)"/g)].map(m => m[1]))], ['Manrope']);
    assert.doesNotMatch(bare, /font-stretch/, 'no width axis any more');
    for (const f of ['Commissioner.woff2', 'OFL-Commissioner.txt', 'EncodeSans.woff2', 'OFL-EncodeSans.txt', 'Manrope.woff2', 'OFL-Manrope.txt', 'Figtree.woff2', 'OFL-Figtree.txt', 'ShantellSans.woff2', 'OFL-ShantellSans.txt']) assert.ok(!fs.existsSync(path.join(ROOT, 'public/fonts', f)), `${f} gone`);
    assert.doesNotMatch(html + cssAll + js, /Encode Sans|EncodeSans/, 'nothing names the old face');
    for (const other of ['public/style.css', 'public/index.html']) assert.doesNotMatch(read(other), /Manrope/, `${other}: the face is the landing page's own`);
  });
});

describe('nothing of the earlier pages, and no demo', () => {
  test('not their prefixes, dictionaries, faces or game', () => {
    assert.doesNotMatch(html + css + js, /(?<![\w-])(pi|lz|mo|cv|rq|pf|up|wt|bk|vs)-[a-z]|PI_I18N|LZ_I18N|MO_I18N|CV_I18N|piInit|Commissioner|Anybody|Hanken|Figtree|Shantell|Instrument|break-game/);
  });
  test('not their hooks, and not a comparison: no other platform is named or argued with', () => {
    for (const h of EARLIER_HOOKS) for (const lang of ['de', 'en']) assert.notEqual(dict[lang].kn_h1, h);
    assert.doesNotMatch(Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + html + css + js, COMPETITORS);
    assert.doesNotMatch(Object.values(dict.de).join('\n'), /andere[nr]? (CRM|Plattform|Anbieter)|im Vergleich|Übliche/i);
  });
  test('no film, no player, no scripted cursor, no autoplay: nothing on the page changes by itself', () => {
    assert.doesNotMatch(body, /id="kn-(demo|chapters|watch|play|caption|end|again-film)"|class="kn-(cursor|chap|player|playbtn|caption)/);
    // round 12: an IntersectionObserver only in knLazy, which draws a frame ahead of the viewport (900 px), nothing else
    const lazyFn = sliceFn(js, 'knLazy', REL);
    // (round 26) the user decided one moment that plays by itself: the mark drawn once on load (knMark, its own rAF, which
    // stops when drawn); the stations' observer only marks the current one (knStations). Nothing else
    assert.match(sliceFn(js, 'knMark', REL), /if \(t < end\) requestAnimationFrame\(step\); else \{ draw\(end\); wm\.dataset\.drawn = '1'; \}/, 'the mark draws once and stops');
    assert.doesNotMatch(js.replace(lazyFn, '').replace(sliceFn(js, 'knMark', REL), '').replace(sliceFn(js, 'knStations', REL), ''), /\bKF\b|\bkf[A-Z]\w*\(|knScript\(|knCursor\w*\(|knTakeover|knReveal\(|requestAnimationFrame|IntersectionObserver|setInterval\(/);
    assert.match(lazyFn, /if \(e\.isIntersecting\) \{ const F = [^;]+; io\.unobserve\(e\.target\); knWake\(F\); \}/);
    assert.match(lazyFn, /rootMargin: '900px 0px'/);
    assert.doesNotMatch(css, /kn-cursor|kn-chap|kn-player|kn-caption|kn-click/);
    for (const k of Object.keys(dict.de)) assert.doesNotMatch(k, /^kn_(watch|demo_aria|pause|play|replay|ch\d|cap\w*|again_film|nav_demo)$/, `${k} belongs to the film`);
  });
});

describe('the replica layer: the app\'s own markup in every part', () => {
  const KW = run('KR_WORDS');
  test('generated, not hand-written: the header says so and names the assembly', () => {
    assert.match(ui, /^'use strict';\n\/\* ═+\n   \/landingpage — the replica layer \(LOGIN_LANDING_CHANGES Part 49, 2026-10-27\)\. GENERATED: do not edit by hand;/);
    assert.match(ui, /\/\/ GENERATED by the assembly \(Part 49\) from public\/js\/core\.js TRANSLATIONS: \d+ keys, pinned equal by the suite\./);
    assert.match(js, /^'use strict';\n\/\* ═+\n   \/landingpage — the page script \(LOGIN_LANDING_CHANGES Part 49, the redo\)\. ASSEMBLED/);
  });
  test('its words are the app\'s: every KR_WORDS entry equals TRANSLATIONS in both languages, and every literal key either script asks for is in it', () => {
    assert.deepEqual(Object.keys(KW.de).sort(), Object.keys(KW.en).sort());
    assert.ok(Object.keys(KW.de).length > 400);
    for (const l of ['de', 'en']) for (const [k, v] of Object.entries(KW[l])) assert.equal(v, app[l][k], `${l}.${k}`);
    for (const src of [ui, js]) for (const m of src.matchAll(/\btf?\(\s*'([a-z][a-z0-9_]*)'\s*[,)]/g)) assert.ok(m[1] in KW.de, `${m[1]} is in KR_WORDS`);
    for (const k of new Function(`${sliceConst(REL, 'KR_EXTRA_KEYS')} return KR_EXTRA_KEYS;`)()) assert.ok(k in KW.de, `extra key ${k}`);
    for (const k of ['dv_title_updated', 'dv_urgency_updated']) assert.ok(k in KW.de, `${k}: the title and the urgency edit as in the app`);
  });
  test('its helpers are the app\'s own text (t reads KR_WORDS instead of TRANSLATIONS, nothing else differs)', () => {
    const core = read('public/js/core.js'), deals = read('public/js/deals.js');
    for (const n of ['tf', 'esc', 'icon', 'initialsOf', 'hashColor', 'avatar']) assert.equal(sliceFn(ui, n, 'ui'), sliceFn(core, n, 'core.js'), n);
    for (const n of ['urgencyMeta', 'urgencyLabel', 'urgencyBadge', 'fmtEUR', 'fmtEURShort', 'fmtDateShort', 'agoDays']) assert.equal(sliceFn(ui, n, 'ui'), sliceFn(deals, n, 'deals.js'), n);
    assert.equal(sliceFn(ui, 't', 'ui'), sliceFn(core, 't', 'core.js').replace(/TRANSLATIONS/g, 'KR_WORDS'));
    const c = (n, src) => new RegExp(`const ${n} = [^;]*;`).exec(src)[0].replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');   // the app's line comments aside
    for (const n of ['ICON_ALIAS', 'AV_COLORS']) assert.equal(c(n, ui), c(n, core), n);
    assert.equal(sliceConst('public/js/landing-ui.js', 'DEAL_URGENCY'), sliceConst('public/js/deals.js', 'DEAL_URGENCY'));
  });
  test('its renderers draw what the app\'s draw: a deal card and an onboarding row, in both languages, once the app\'s inline handlers are set aside', () => {
    const ctx = vm.createContext({});
    vm.runInContext(ui, ctx);
    const onb = read('public/js/onboarding.js');
    vm.runInContext([sliceFn(read('public/js/deals.js'), 'dealCard', 'deals.js'), sliceConst('public/js/onboarding.js', 'ONB_STATUSES'), onb.match(/^const ONB_STALE_DAYS = \d+;/m)[0],
      ...['onboardingPhase', 'onboardingIsStale', 'onboardingStatusStep', 'onboardingRowHtml'].map(n => sliceFn(onb, n, 'onboarding.js')), sliceFn(read('public/js/core.js'), 'fmtDate', 'core.js')].join('\n'), ctx);
    ctx.__d = { id: 96, title: 'Rahmenvertrag <Büro>', value: '36000', urgency: 3, contact_name: 'Katrin Meier', contact_company: 'Meier & Co', assigned_to_name: 'Sophie Krüger', created_at: '2026-09-29T08:00:00.000Z', updated_at: '2026-10-26T09:00:00.000Z' };
    ctx.__r = { deal_id: 52, deal_title: 'Nadia Öztürk', deal_value: '0', deal_created_at: '2026-09-01T08:00:00.000Z', pipeline_id: 1, pipeline_name: 'Vertrieb', stage_id: 4, stage_name: 'Verhandlung', stage_color: '#8b5cf6',
      contact_id: 88, contact_name: 'Nadia Öztürk', contact_company: 'Öztürk Immobilien', onboarding_status: 'formular_ausgefuellt', drive_ordner_id: 'abc', akte_version: 1, status_since: '2026-09-20T09:15:00.000Z',
      in_trigger: true, trigger_stage_id: 6, trigger_stage_name: 'Gewonnen', delivery: { status: 'failed', last_error: 'HTTP 500' } };
    for (const lang of ['de', 'en']) {
      vm.runInContext(`currentLang = ${JSON.stringify(lang)}`, ctx);
      assert.equal(norm(vm.runInContext('krDealCard(__d)', ctx)), norm(vm.runInContext('dealCard(__d)', ctx)), `${lang}: the card`);
      assert.equal(norm(vm.runInContext('krOnboardingRow(__r)', ctx)), norm(vm.runInContext('onboardingRowHtml(__r)', ctx)), `${lang}: the row`);
    }
  });
  test('the Contacts page is the app\'s: the side panel on the Contacts page, the pop window elsewhere (closing a deal first); its words are in KR_WORDS', () => {
    assert.match(ui, /\/\* ════ contacts ════ \*\//);
    for (const f of ['krCtPage', 'krCtParts', 'krCtRecord', 'krCtRecordBody', 'krCtRecordModal', 'krCtInlineEditor', 'krCtInlineCommit', 'krCtRecordLog']) assert.match(ui, new RegExp(`function ${f}\\(`), f);
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /'open-contact': el => \{ m\.close\(\); openContactDetail\(\+el\.dataset\.id\); \}/);
    assert.ok(js.includes("if (act === 'open-contact') { knRecClose(F); return knCtOpen(F, Number(b.dataset.id)); }"));
    assert.match(js, /const panel = knShows\(F, 'contacts'\);\s*W\.ctRec = \{ id, host: panel \? 'panel' : 'modal'/);
    assert.match(dv, /if \(usePanel\) \{/, 'the app picks the side panel or the pop window too');
    const ct = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); const o = knCtO({ W, p: 'z' }, false); return JSON.stringify({ n: o.contacts.length, keys: Object.keys(o.contacts[0].custom_data), fields: o.fields.map(f => f.field_key) }); })()`));
    assert.equal(ct.n, 10); assert.deepEqual(ct.fields, ['branche', 'website', 'dachflaeche']);
    for (const k of ct.keys) assert.ok(ct.fields.includes(k), `custom field ${k} is one of the workspace's fields`);
  });
  test('"Deal hinzufügen", the Deals list and "Kontakt hinzufügen" are the app\'s: the forms port is assembled and wired where the app opens them', () => {
    assert.match(ui, /\/\* ════ forms ════ \*\//);
    for (const f of ['krFmDealForm', 'krFmDealSubmit', 'krFmDealSaved', 'krFmDealsListPage', 'krFmDealsListParts', 'krFmContactModal', 'krFmContactInvalid', 'krFmContactSaved', 'krFmContactEmailTaken']) assert.match(ui, new RegExp(`function ${f}\\(`), f);
    for (const off of ['[data-kr="add-deal"]', '[data-add]', '[data-kr="view-list"]', '[data-kr="add-contact"]']) assert.ok(!run('KN_OFF').includes(off), `${off} works`);
    for (const s of ["if (k === 'add-deal') return knDfOpen(F, {});", 'if (add) return knDfOpen(F, { pipelineId: 1, stageId: Number(add.dataset.add) });', "if (k === 'add-contact') return knCfOpen(F);",
      "krFmContactEmailTaken(all, req.body.email) ? { error: 'email_taken', code: 'email_taken' }", 'knLater(F, 10000, () => { if (W.df === D) { D.submitting = false;']) assert.ok(js.includes(s), s);
    assert.match(read('routes/contacts.js'), /email_taken/);
  });
  test('the record\'s edits are the app\'s: the owner\'s ui.select, dvInlineEdit for the title and the value with their rules, commit\'s toast with Rückgängig, the urgency\'s menu', () => {
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /owner: el => ui\.select\(el, \[\{ value: null, label: t\('unassigned'\) \}, \.\.\.members\.map\(x => \(\{ value: x\.id, label: x\.name \}\)\)\], S\.d\.assigned_to/);
    assert.ok(js.includes("opts = [{ value: null, label: t('unassigned') }, ...KN_MEMBERS.map(x => ({ value: x.id, label: x.name }))]"));
    const title = "v = v.trim(); return !v ? { error: t('dv_err_deal_title') } : v.length > 140 ? { error: t('dv_err_title_len') } : { v };";
    assert.ok(dv.includes(title) && js.includes(title), 'the same title rule');
    assert.ok(dv.includes("if (String(v).trim() === '') return { v: null }; const n = Number(v); return !isFinite(n) || n < 0 ? { error: t('dv_err_value_min') } :"), 'the app\'s value rule');
    const r = JSON.parse(run(`JSON.stringify([KN_REC_FIELDS.value.parse(''), KN_REC_FIELDS.value.parse('-5'), KN_REC_FIELDS.value.parse('315000.555'), KN_REC_FIELDS.title.parse('  '), KN_REC_FIELDS.title.parse('x'.repeat(141)), KN_REC_FIELDS.title.parse(' PV ')])`));
    assert.deepEqual(r, [{ v: null }, { error: 'Mindestens 0.' }, { v: '315000.56' }, { error: app.de.dv_err_deal_title }, { error: app.de.dv_err_title_len }, { v: 'PV' }]);
    assert.match(dv, /if \(msg\) ui\.toast\(msg, \{ action: \{ label: t\('undo'\), onClick: \(\) => commit\(prev, null\) \} \}\);/);
    assert.ok(js.includes("if (msg) knToast(F, msg, t('undo'), () => knRecCommit(F, prev, null));"));
    assert.match(dv, /dvRefreshDeals\(\);\s*ui\.toast\(tf\('moved_to'/, 'the board behind the record follows a stage move');
    assert.ok(js.includes("if (knShows(F, 'deals')) knPaintPage(F);   // dvRefreshDeals: the board behind the record follows"));
    assert.match(dv, /dvRefreshDeals\(\); ui\.toast\(t\('dv_urgency_updated'\)\);/); assert.ok(js.includes("knToast(F, t('dv_urgency_updated'));"), 'the urgency: no Rückgängig, as in the app');
    assert.match(dv, /const title = m\.el\.querySelector\('\.modal-title'\); if \(title\) title\.textContent = S\.d\.title;/);
    assert.match(sliceFn(js, 'knRecPaint', REL), /const title = F\.layers\.record\.querySelector\('\.modal-title'\);/, 'the window\'s title follows the deal\'s');
  });
  test('no inline handler and no draggable in the replicas; every class they draw is styled by the app or is the app\'s own; the kr- hooks stand for the app\'s id rules', () => {
    const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // the comments cite the app's handlers
    assert.doesNotMatch(code, /\son(click|change|input|keydown|submit|dragstart|dragend|mousedown)="/);
    assert.doesNotMatch(code, /draggable="true"/);
    const appSrc = fs.readdirSync(path.join(ROOT, 'public/js')).filter(f => f.endsWith('.js') && !f.startsWith('landing')).map(f => read('public/js/' + f)).join('\n') + read('public/index.html');
    const cls = new Set();
    for (const m of ui.matchAll(/class="([^"]*)"/g)) for (const c of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(c)) cls.add(c);
    assert.ok(cls.size > 300);
    const esc = c => c.replace(/-/g, '\\-');
    for (const c of cls) {
      const styled = new RegExp(`\\.${esc(c)}(?![\\w-])`).test(style + gen);
      const theApps = new RegExp(`(class="[^"]*|[\\s'"\`])${esc(c)}(?![\\w-])`).test(appSrc);
      assert.ok(styled || theApps, `.${c}`);
      if (c.startsWith('kr-')) assert.match(gen, new RegExp(`\\.${esc(c)}(?![\\w-])`), `.${c} has its class-scoped rule`);
    }
  });
  test('the day\'s second-round ports are the app\'s: a task row\'s ⋯ (tasks.js openTaskKebab), a calendar entry\'s window (calendar.js openCalendarEventDetail), the deals per owner (analytics.js renderDealsByOwner)', () => {
    for (const f of ['krTaskKebabItems', 'krTaskMoveToast', 'krTaskPrioToast', 'krTaskDeleteConfirm', 'krTaskDeletedToast', 'krCalEventDetail', 'krAnTableBtn', 'krAnDataTable', 'krAnOwnerCard']) assert.match(ui, new RegExp(`function ${f}\\(`), f);
    assert.match(read('public/js/tasks.js'), /^function openTaskKebab\(anchor, id\) \{/m);
    assert.match(read('public/js/calendar.js'), /^function openCalendarEventDetail\(uid\) \{/m);
    assert.match(read('public/js/analytics.js'), /^function renderDealsByOwner\(d\) \{/m);
    // the menu in the app's order: open, done, the statuses, the priorities, delete; the page runs each by its act
    const items = val(`(() => { const F = knFake('day'); knGo(F, 'tasks'); return krTaskKebabItems(knTasksO(F), F.W.tasks[0].id).map(i => i.act || (i.heading ? 'h' : 'sep')); })()`);
    assert.deepEqual([items[0], items[1], items[2], items[items.length - 2], items[items.length - 1]], ['open', 'toggle', 'h', 'sep', 'delete']);
    assert.ok(items.includes('move') && items.includes('priority'));
    assert.ok(js.includes("if (it.act === 'open') return knTkDrOpen(F, id, anchor);"), 'the menu\'s "Aufgabe öffnen" opens the drawer');
    // the owner card from the same deals as the board, in the server's order (routes/analytics.js: ORDER BY cnt DESC, u.name ASC)
    const own = val(`knAnSummary(knWorld({ name: 'x' }), 6).by_owner`);
    assert.equal(own.length, run('KN_MEMBERS.length'));
    for (let i = 1; i < own.length; i++) assert.ok(own[i - 1].deals > own[i].deals || (own[i - 1].deals === own[i].deals && own[i - 1].name.localeCompare(own[i].name) <= 0), 'most deals first, then by name');
    for (const o of own) assert.equal(o.open + o.won + o.lost, o.deals, `${o.name}: open, won and lost add up`);
    assert.match(read('routes/analytics.js'), /ORDER BY cnt DESC, u\.name ASC/);
    const card = run(`krAnOwnerCard({ summary: knAnSummary(knWorld({ name: 'x' }), 6), months: 6, tables: new Set() })`);
    assert.match(card, new RegExp(`<h2 class="card-title" id="an-owner-title">${app.de.an_owner_card_title}</h2>`));
    assert.equal((card.match(/an-owner-row/g) || []).length, own.length);
    // the calendar entry's window: the app's hooks in place of its inline handlers
    const det = run(`(() => { const F = knFake('day'); knGo(F, 'calendar'); const o = knCalO(F), a = o.rows.find(r => r.kind === 'activity' && r.type === 'meeting'); const d = krCalEventDetail(o, 'activity-' + a.id); return JSON.stringify(d && [d.title, d.body.includes('data-kr="cal-done"'), d.body.includes('data-kr="open-contact"') || d.footer.includes('data-kr="open-contact"')]); })()`);
    assert.ok(JSON.parse(det) && JSON.parse(det)[1], `a meeting's window with its done box: ${det}`);
  });
  test('the task drawer is the app\'s: krTaskDrawer and krDrawerWrap draw what openTaskDrawer and ui.drawer draw (kr-drawer.check.js, kr-shell.check.js); the title, the row, the menu and a calendar task open it', () => {
    for (const f of ['krTaskDrawer', 'krTaskDrawerSubs', 'krTaskDrawerDueNote', 'krTaskDrawerLinksHidden', 'krDrawerWrap']) assert.match(ui, new RegExp(`function ${f}\\(`), f);
    assert.match(read('public/js/detail-views.js'), /^async function openTaskDrawer\(id, opts = \{\}\) \{/m);
    const d = JSON.parse(run(`(() => { const F = knFake('day'); const id = F.W.tasks.find(x => !x.parent_id).id; const o = knTkDrO(F, id), x = krTaskDrawer(o, id);
      return JSON.stringify({ title: x.title, width: x.width, has: [x.body.includes('data-dtoggle'), x.body.includes(\`id="\${F.p}-tkd-t"\`), x.footer.includes('data-del')], wrap: krDrawerWrap({ p: 'q', title: 'T', width: 580, body: 'b', footer: 'f', cls: 'tk-drawer' }) }); })()`));
    assert.deepEqual([d.title, d.width, d.has], [app.de.dv_task_details, 580, [true, true, true]]);
    assert.match(d.wrap, /^<div class="overlay drawer-wrap"><aside class="drawer tk-drawer" role="dialog" aria-modal="true" aria-labelledby="q-dlg" style="width:min\(580px,100%\)">/);
    for (const s of ["if (title && tr) return knTkDrOpen(F, Number(tr.dataset.open), title);", "if (it.act === 'open') return knTkDrOpen(F, id, anchor);", "if (ev && /^task-\\d+$/.test(ev.dataset.ev)) return knTkDrOpen(F, Number(ev.dataset.ev.slice(5)), ev);", "knToast(F, r.toast, r.action, () => knTkDrOpen(F, id));"]) assert.ok(js.includes(s), s);
    assert.ok(js.includes("KN_CONFIRM['task-drawer-delete']") && js.includes("title: t('tk_delete_task_q'), message: t('dv_delete_task_msg'), confirmLabel: t('tk_delete_task'), danger: true"), 'deleting asks the app\'s question');
    assert.match(cssAll, /\.kr-frame \.drawer \{ height: 100%; \}/, 'the drawer as tall as the frame (style.css: 100vh)');
  });
  test('section 16 is the porters\' class-scoped copies: every rule sits under a kr- class or the frame', () => {
    const rules = gen.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(s => s.split('{')[0].trim()).filter(s => s && !s.startsWith('@'));
    for (const sel of rules) assert.match(sel, /\.kr-|^\[data-theme="dark"\] input\[type="checkbox"\]\.kr-/, sel);
  });
});

describe('the sample world: the app\'s rules, run in a sandbox', () => {
  test('a lead from the inbound address: a contact and a deal titled with the name in the first stage, no value, no owner; the captured fields in JSONB key order; a known email updates the contact', () => {
    const r = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); const n = W.contacts.length; const d = knLeadArrive(W, 'form'); const again = knLeadArrive(W, 'form');
      return JSON.stringify({ d, log: W.logs[1], contacts: W.contacts.length - n, again: again.contact_id === d.contact_id }); })()`));
    assert.deepEqual([r.d.title, r.d.stage_id, r.d.value, r.d.assigned_to], ['Jonas Becker', 11, null, null]);
    assert.deepEqual(Object.keys(r.log.captured), ['name', 'email', 'phone', 'source', 'branche', 'company', 'website', 'dachflaeche'], 'Postgres stores JSONB keys shortest first, then by bytes (round 11: "source"; round 15 review: the form\'s custom fields too)');
    assert.equal(r.log.status, 'success'); assert.equal(r.contacts, 1, 'the second post updated the contact'); assert.equal(r.again, true);
  });
  test('into the Engine\'s stage the server sends vertrag.unterschrieben (pending); each Aktualisieren shows what the Engine reported, step by step; it stops at the end; a second win never sets a status back', () => {
    const r = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); knJonas(W, 14); const d = knDeal(W, 120); const out = [];
      knSetStage(W, d, KN_WON); out.push(W.deliv[120].status);
      for (let i = 0; i < 8; i++) { knEngine(W, 1); const row = knOnbRows(W).find(x => x.deal_id === 120); out.push(row.delivery.status + ':' + row.onboarding_status); }
      const top = knOnbRows(W)[0].deal_id; knSetStage(W, d, 14); knSetStage(W, d, KN_WON); const again = W.deliv[120].status; knEngine(W, 1);
      return JSON.stringify({ out, top, again, after: [W.deliv[120].status, W.onb[70].status] }); })()`));
    assert.deepEqual(r.out, ['pending', 'success:formular_versendet', 'success:formular_ausgefuellt', 'success:termin_gebucht', 'success:call_erfolgt', 'success:briefing_fertig', 'success:onboarding_abgeschlossen', 'success:onboarding_abgeschlossen', 'success:onboarding_abgeschlossen']);
    assert.equal(r.top, 120, 'the row whose contact changed last is first (ORDER BY c.updated_at DESC)');
    assert.equal(r.again, 'pending', 'moving into the stage again is a new delivery');
    assert.deepEqual(r.after, ['success', 'onboarding_abgeschlossen'], 'the second delivery lands; the status already reached stays');
    assert.match(read('routes/engine.js'), /ORDER BY c\.updated_at DESC NULLS LAST, d\.created_at DESC/);
  });
  test('the booking: the first free day has 09:30, 11:00, 14:00, 16:00; 11:00 clashes with the 11:15 call in the CRM calendar, 14:00 does not; a booked meeting takes its type and blocks its time', () => {
    const r = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); knJonas(W, 12); const day = W.days[0], rows = knCalRows(W);
      const at = hm => krBookingConflicts({ pickedStart: knAt(day, hm), slotEnd: new Date(Date.parse(knAt(day, hm)) + 30 * 60000).toISOString(), zone: KN_ZONE, people: [KN_ME.id, KN_CAL.host_user_id], rows });
      const times = W.slots[day].map(s => krBookingZonedParts(s.start, KN_ZONE).time), c11 = at('11:00'), c14 = at('14:00');
      const a = knMeetingAdd(W, 120, knAt(day, '14:00'), true, false, null, KN_CAL.event_types[1]);
      return JSON.stringify({ times, c11, c14, a: [a.content, a.calcom_event_type_id], left: W.slots[day].map(s => krBookingZonedParts(s.start, KN_ZONE).time) }); })()`));
    assert.deepEqual(r.times, ['09:30', '11:00', '14:00', '16:00']);
    assert.deepEqual(r.c11.map(c => c.title), ['Rückruf Sabine Wolf']);
    assert.deepEqual(r.c14, []);
    assert.deepEqual(r.a, [`Beratung zwischen Anna Weiß und Jonas Becker\n${run('KN_MEET')}`, 102], 'Cal.com\'s title for the chosen type, the Meet link on its own line');
    assert.deepEqual(r.left, ['09:30', '11:00', '16:00'], 'the booked hour is no longer free');
  });
  test('the Notetaker\'s note is exactly what utils/notetaker.js resultNote writes for that result; the bell goes to the booker and opens the deal', () => {
    const nt = require(path.join(ROOT, 'utils/notetaker'));
    const N = run('KN_NOTE');
    for (const l of ['de', 'en']) {
      for (const ty of val('KN_CAL.event_types')) {
        const title = `${l === 'de' ? ty.title : run(`KN_SAMPLE_EN[${JSON.stringify(ty.title)}]`)}: ${N[l].title}`;   // round 13: the event type names the note
        const b = { event: 'recording.completed', notes: { language: l, title, summary: N[l].summary, key_points: N[l].key, decisions: N[l].dec, action_items: N[l].act, open_questions: N[l].open } };
        assert.equal(run(`knNoteText(${JSON.stringify(l)}, KN_CAL.event_types.find(x => x.id === ${ty.id}))`), nt.resultNote(b, l).content, `${l} ${ty.title}`);
        assert.equal(run(`knNoteTitle(${JSON.stringify(l)}, KN_CAL.event_types.find(x => x.id === ${ty.id}))`), title);
      }
    }
    const b = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); knJonas(W, 12); knMeetingAdd(W, 120, knAt(W.days[0], '14:00'), true, true); knNoteArrive(W); return JSON.stringify({ a: W.acts[0], n: W.bell.items[0] }); })()`));
    assert.deepEqual([b.a.type, b.a.source, b.a.logged_by_name, b.a.deal_id], ['note', 'notetaker', 'Notetaker', 120]);
    assert.deepEqual([b.n.type, b.n.user_id, b.n.entity_type, b.n.entity_id, b.n.read], ['notetaker_done', 1, 'deal', 120, false]);
    assert.match(b.n.title, /^Erstgespräch zwischen Anna Weiß und Jonas Becker$/, 'the meeting\'s Cal.com title, first line');
    assert.match(read('routes/notetaker.js'), /type: note\.kind === 'failed' \? 'notetaker_failed' : 'notetaker_done', category: 'activities',/);
  });
  test('the English visitor reads the sample workspace in English; what a visitor types is never swapped', () => {
    run(`knLang = 'en'`);
    try {
      assert.deepEqual(JSON.parse(run(`JSON.stringify(knL({ a: 'Gewonnen', b: ['Vertrieb', 'Ich habe angerufen.'], c: 3 }))`)), { a: 'Won', b: ['Sales', 'Ich habe angerufen.'], c: 3 });
      assert.equal(run('knL(knNoteText("de"))'), run('knNoteText("en")'));
    } finally { run(`knLang = 'de'`); }
    assert.equal(run(`knL('Gewonnen')`), 'Gewonnen');
  });
  test('analytics is drawn from the same deals as the board: open pipeline, won, lost (a real Verloren stage), new deals in the window; new contacts since the 1st of the month, as the server counts them', () => {
    const r = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); const a = knAnSummary(W, 6), v = d => Number(d.value) || 0, m0 = Date.parse(knAt(knIsoToday().slice(0, 8) + '01', '00:00'));
      const open = W.deals.filter(d => d.stage_id !== KN_WON && d.stage_id !== KN_LOST);
      return JSON.stringify({ a, open: open.reduce((x, d) => x + v(d), 0), n: open.length, won: W.deals.filter(d => d.stage_id === KN_WON).length, lost: W.deals.filter(d => d.stage_id === KN_LOST).length,
        stages: KN_STAGES.map(s => s.name), nc: W.contacts.filter(c => Date.parse(c.created_at) >= m0).length }); })()`));
    assert.equal(r.a.pipeline_value, r.open); assert.equal(r.a.open_deals, r.n);
    assert.deepEqual([r.a.won_deals, r.a.lost_deals], [r.won, r.lost]);
    assert.equal(r.a.win_rate, Math.round(r.won / (r.won + r.lost) * 100));
    assert.deepEqual(r.stages, ['Neu', 'Kontaktiert', 'Angebot', 'Verhandlung', 'Gewonnen', 'Verloren']);
    assert.ok(r.a.new_deals > 0 && r.a.prev_new_deals > 0 && r.a.new_deals < r.a.prev_new_deals * 3, 'a believable change against the window before');
    assert.equal(r.a.new_contacts, r.nc);
    assert.match(read('routes/analytics.js'), /created_at >= date_trunc\('month', NOW\(\)\)/);
    assert.doesNotMatch(js, /const KN_AN\b|KN_AN_BASE/, 'no hand-written analytics numbers');
  });
  test('one story for Jonas Becker: his enquiry now in step 1, two hours earlier in steps 2, 3 and 4 alike (round 25: one date; step 3\'s clock on the meeting day, step 4\'s three weeks on)', () => {
    const h = JSON.parse(run(`(() => { const age = W => (Date.now() - Date.parse(knDeal(W, 120).created_at)) / 3600000, call = W => (Date.now() - Date.parse(W.acts.find(a => a.id === 310).created_at)) / 60000;
      const A = knWorld({ name: 'a' }); knLeadArrive(A, 'form', 0, 0); const T2 = knWorld({ name: 'termin' }); knJonas(T2, 12); const N = knWorld(KN_PARTS.find(p => p.name === 'notiz')); const E = knWorld(KN_PARTS.find(p => p.name === 'abschluss'));
      return JSON.stringify({ a: age(A), t: age(T2), tc: call(T2), n: age(N), e: age(E), sn: N.shift / 3600000, se: E.shift / 86400000 }); })()`));
    assert.ok(h.a < 0.1 && [h.t, h.n, h.e].every(x => x > 1.9 && x < 2.1) && h.tc > 55 && h.tc < 65 && h.sn > 12 && h.se === 21, JSON.stringify(h));
    assert.match(js, /globalThis\.Date = KnDate;/, 'the app\'s renderers read a part\'s clock through Date (round 25)');
    assert.match(sliceFn(js, 'knOnClock', REL), /return function \(F, \.\.\.a\) \{ return knIn\(F, \(\) => fn\.call\(this, F, \.\.\.a\)\); \};/);
    assert.match(js, /\nknPaint = knOnClock\(knPaint\);/);
    assert.ok(js.includes("world(W) { knJonas(W, 12); knTerminSeed(W); W.record = knRecState(120); },") && js.includes("knLeadArrive(W, 'form', 0, 0, 120)") && js.includes("knJonas(W, 14);") && js.includes("clock: () => 21 * KN_DAY,"), 'step 1 and step 2 the same moment (round 18 review: two hours ago), step 4 three weeks on (round 25: on its own clock)');
    // phones (polish round): no scroll inside the page's scroll for Letzte Leads: the card as tall as its entries, the frame
    // the board (360) and the card (estimated from the app's rules until a browser measures it); each frame's height in the
    // stylesheet before the script
    assert.equal(run(`(() => { const F = knFake('anfrage', 360); F.W.logsShown = [{}, {}, {}, {}]; knScale(F); return F.h; })()`), Math.ceil((264 + 152 + 104) / 8) * 8, 'round 15: phones show the newest entry only');
    assert.ok(run(`(() => { const F = knFake('anfrage', 360); F.W.logsShown = [{ captured: { a: 1, b: 2 } }]; knScale(F); const one = F.h; F.W.logsShown.unshift({ captured: { a: 1, b: 2, c: 3 } }); knScale(F); return F.h > one; })()`), 'round 15: the newest entry sets the height (a lead with more fields, a taller frame)');
    assert.match(cssAll, /\.kn-frame\.kn-narrow \.kn-piece-logs \{ max-height: none; overflow: visible; \}/);
    for (const r of ['.kn-frame.kn-a-frame { --kn-h: 470; }', '.kn-frame.kn-rec-book { --kn-h: 620; --kn-s: 1; }', '.kn-frame.kn-notiz-frame { --kn-h: 560; --kn-s: 1; }', '.kn-frame.kn-e-frame { --kn-h: 540; --kn-s: 1; }', '.kn-day .kn-frame { --kn-h: 400; --kn-s: 1; }', '.kn-rec-book { max-width: 600px; }']) assert.ok(cssAll.includes(r), r);   // round 15: step 4 540, step 2 the dialog's width
  });
  test('the sample values are what a solar seller expects: hall and office roofs in six figures, the proposal 315.000 €', () => {
    const v = JSON.parse(run('JSON.stringify(Object.fromEntries(KN_DEALS.map(d => [d[1], Number(d[3])])))'));
    for (const k of ['PV-Anlage Lagerhalle', 'Dachanlage Bürogebäude', 'Hallendach Nord', 'Flachdach Kühlhaus', 'Solardach Druckerei']) assert.ok(v[k] >= 100000, `${k}: ${v[k]}`);
    assert.equal(run('knDeal(knWorld(KN_PARTS.find(p => p.name === "abschluss")), 120).value'), '315000', 'Jonas Becker\'s proposal for 1,200 m² of roof and about 200 kWh, when it is won');
    assert.ok(!('kn_a1' in dict.de) && (body.match(/data-kn="kn_next"/g) || []).length === 1, 'what happens after the request is said once, beside the request (the steps show it; no answer repeats them)');
  });
  test('each source sends the next of three people; the form\'s first is Jonas Becker (contact 70, deal 120)', () => {
    const r = JSON.parse(run(`(() => { const W = knWorld({ name: 'x' }); const out = []; for (let i = 0; i < 3; i++) out.push(knLeadArrive(W, 'make', 0, i).title); const j = knLeadArrive(W, 'form', 0, 0);
      return JSON.stringify({ out, j: [j.id, j.contact_id], sizes: Object.values(KN_LEADS).map(l => l.length) }); })()`));
    assert.equal(new Set(r.out).size, 3); assert.deepEqual(r.j, [120, 70]); assert.deepEqual(r.sizes, [3, 3, 3, 3]);
    assert.ok(js.includes('knAnfrageRest(btn, W.used[src] >= KN_LEADS[src].length);'));
  });
});

describe('the parts: five places of the CRM, one per section, which the visitor drives', () => {
  const parts = val('KN_PARTS.map(p => ({ name: p.name, p: p.p, w: p.w, h: p.h, hm: p.hm, step: p.step || null, home: p.home || [], deal: !!p.deal, contact: !!p.contact, keep: p.keep || [], maxS: p.maxS || null, narrowBelow: p.narrowBelow || null }))');
  test('five parts in page order, each a section with its frame; one id prefix each; the start waits for DOMContentLoaded', () => {
    assert.deepEqual(parts.map(p => p.name), PARTS);
    assert.equal(new Set(parts.map(p => p.p)).size, PARTS.length, 'one prefix per part');
    let at = -1;
    for (const n of PARTS) {
      const sec = body.indexOf(`id="kn-${n}" data-kn-part="${n}"`), frame = body.indexOf(`id="kn-f-${n}"`);
      assert.ok(sec > at && frame > sec, `${n}: its section, then its frame, after the part before it`);
      at = frame;
      assert.match(body, new RegExp(`<div class="kn-frame[^"]*" id="kn-f-${n}" role="(region|tabpanel)"`), `${n}: the frame is a labelled region`);
    }
    assert.ok(body.indexOf('id="kn-f-day"') < body.indexOf('id="kn-fit"'), 'then needs and limits, the start, the questions, the request');
    assert.deepEqual(S.__started, [['DOMContentLoaded', 'knInit']]);
    assert.match(sliceFn(js, 'knInit', REL), /KN_PARTS\.forEach\(\(P, i\) => knMount\(P, i > 0\)\);[\s\S]*knLazy\(\);/, 'part 1 drawn at once, the others on approach (round 12)');
  });
  test('no shell in any frame: the script never draws the sidebar, the top bar or the palette, and binds no Ctrl K; a frame is its pieces and the app\'s layers', () => {
    assert.doesNotMatch(js, /krSidebar\(|krTopbar\(|krPalette\(|krCrumbFor\(|krUserMenuItems\(|krNewMenuItems\(|krHelpMenuItems\(/);
    assert.doesNotMatch(js, /e\.key === 'k'|'\/' && !/);
    assert.match(sliceFn(js, 'knMount', REL), /<div class="kn-stage"><div class="kr-frame"><div class="kr-app kn-cut-app"><\/div>\$\{KN_LAYERS\.map/);
    assert.match(sliceFn(js, 'knPaintApp', REL), /<main class="view kn-cut-view">\$\{F\.part\.view \? F\.part\.view\(F\) : ''\}<\/main>/);
    assert.deepEqual(val('KN_LAYERS'), ['record', 'contact', 'form', 'detail', 'booking', 'confirm', 'toasts', 'menu']);
    for (const n of PARTS) assert.match(body, new RegExp(`id="kn-f-${n}"[^>]*></div>`), `${n}: the frame is empty until the script draws its part`);
  });
  test('the spine: the deal\'s four steps in order, each stop on its part, reached only by what the visitor does', () => {
    const T_dots = () => [...body.matchAll(/<a class="kn-dot" href="#kn-st-[a-z]+" data-step="(\d)"/g)].map(m => m[1]);
    assert.deepEqual(parts.map(p => p.step), [1, 2, 3, 4, null, null]);   // (round 22) the Engine's block is not a step
    assert.deepEqual([...body.matchAll(/<span class="kn-stop" data-step="(\d)"><span class="kn-stop-n" aria-hidden="true">\1<\/span><span class="kn-stop-t" data-kn="kn_cue\1">[^<]+<\/span>(?:<span class="kn-stop-opt" data-kn="kn_e_opt_t">Optional<\/span><span class="kn-stop-why" data-kn="kn_e_opt_why">[^<]+<\/span>)?<span class="kn-vh">Schritt \1 von 4<\/span><\/span>/g)].map(m => +m[1]), [1, 2, 3, 4], 'each stop: its numeral, its day, the words for a screen reader');
    assert.deepEqual([1, 2, 3, 4].map(n => dict.de[`kn_cue${n}`]), ['Tag 1', 'Tag 1, später', 'Am Tag des Termins', 'Drei Wochen später'], 'one deal\'s days');
    for (const n of [1, 2, 3, 4]) assert.match(body, new RegExp(`data-kn-part="${PARTS[n - 1]}" data-step="${n}"`), `stop ${n} sits on ${PARTS[n - 1]}`);
    assert.deepEqual([...js.matchAll(/knStep\((\d)\)/g)].map(m => +m[1]).sort(), [1, 2, 3, 4, 4], 'each step is reached in its own part (part 2 by the dialog, round 19; part 4 by the drag and by Onboarding starten)');
    assert.deepEqual(T_dots(), ['1', '2', '3', '4'], '(round 26, alphaiota restyle) four step dots among the stations\' dots');
    assert.equal(run('KN_DONE.size'), 0, 'nothing reached on load');
    // (round 26, alphaiota restyle) the rail and its thread went: each stop is its panel's eyebrow, its numeral in a square that fills with the accent once done
    assert.match(bare, /\.kn-stop-n \{[^}]*box-shadow: inset 0 0 0 1\.5px var\(--kn-ink-3\);/, 'a numeral not yet reached in an ink-3 square (4.6:1 on paper)');
    assert.match(bare, /\.kn-stop\.is-done \.kn-stop-n \{ box-shadow: none; background: var\(--kn-accent\); color: var\(--kn-card\); \}/);
    assert.match(bare, /\.kn-dot\.is-done::before \{ background: var\(--kn-accent\); opacity: 1; \}/, 'a done step\'s dot filled');
    assert.equal(dict.en.kn_step_done, 'Step {n} of 4, tried');
  });
  test('a skip link right before each frame, to the next part\'s heading (focusable, tabindex -1), shown only while it has focus', () => {
    const to = { anfrage: ['kn-t-t', 'kn_skip2'], termin: ['kn-n-t', 'kn_skip3'], notiz: ['kn-e-t', 'kn_skip4'], abschluss: ['kn-day-t', 'kn_skip5'], day: ['kn-fit-t', 'kn_skip6'], engine: ['kn-fit-t', 'kn_skip6'] };   // (round 22) the Engine's block skips on to Voraussetzungen too
    for (const n of PARTS) {
      const [id, key] = to[n];
      assert.match(body, new RegExp(`<a class="kn-skip" href="#${id}" data-kn="${key}">${dict.de[key]}</a>\\s*<div class="kn-frame[^"]*" id="kn-f-${n}"`), `${n}: "${dict.de[key]}"`);
      assert.match(body, new RegExp(`id="${id}" tabindex="-1"`), `#${id} takes the focus`);
    }
    assert.match(bare, /\.kn-skip \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\); white-space: nowrap; \}/);
    assert.match(bare, /\.kn-skip:focus-visible \{ position: absolute;/);   // (round 26) over its station, out of the flow
  });
  test('step 3 follows step 2 (the booking, its type, Notetaker on or off); a deal from step 1 brings its own history, not another part\'s sample', () => {
    const r = JSON.parse(run(`(() => { const A = knFake('anfrage'); knLeadArrive(A.W, 'form', 0, 0); delete KN.termin; const G = knFake('notiz'); const had = G.W.acts.filter(a => a.contact_id === 70).map(a => a.type);
      knCarry(A.W, G.W, 120, null); return JSON.stringify({ had, now: G.W.acts.filter(a => a.contact_id === 70).length }); })()`));
    assert.deepEqual(r, { had: ['note', 'meeting', 'meeting', 'call'], now: 0 }, 'Jonas Becker from step 1 has no call, no meeting and no note in step 3 (round 13: the sample\'s note is in from the start)');
    assert.match(sliceFn(js, 'knCarry', REL), /T\.acts = T\.acts\.filter\(/, 'what only the target has on that deal or contact goes');
    assert.equal(run(`(() => { const W = knWorld({ name: 'x' }); knJonas(W, 12); knMeetingAdd(W, 120, knAt(W.days[0], '14:00'), true, false); return knNoteArrive(W) === null && W.bell.items.length === 0; })()`), true, 'booked without Notetaker: no note, no bell');
    assert.match(sliceFn(js, 'knNotizEndIn', REL), /const note = knNotizCan\(F\)\.rec \? knNoteArrive\(F\.W\) : null;\s*if \(!note\) \{\s*knToast\(F, knWord\('kn_n_none'\)\);/, 'and the page says why');
    assert.match(sliceFn(js, 'knNotizEnd', REL), /knIn\(F, \(\) => knNotizEndIn\(F, btn\)\);/, 'on step 3\'s clock (round 25)');
    assert.ok(js.includes("W.own = !knNotizMeet();\n    if (!W.own) knCarry(KN.termin.W, W, 120, null);") && js.includes("const note = W.own ? knNoteArrive(W) : null;\n    if (note) W.record.stale = [note.id];"), 'step 3 starts from what step 2 holds, seen on the day of the meeting; its own "Von vorn" brings the sample back (KN_NOTIZ_OWN, round 11), its note in (round 13)');
    assert.match(sliceFn(js, 'knNotizFollow', REL), /if \(!N \|\| \(!N\.W\.own && N\.W\.acts\.some\(a => a\.source === 'notetaker'\)\)\) return;\s*KN_NOTIZ_OWN = false;\s*knReset\(N\);/, 'step 2\'s next booking clears it (round 13: over the sample\'s own note too)');
    assert.match(sliceFn(js, 'knNotizRebook', REL), /knReset\(T\);[\s\S]*T\.W\.booking\.B\.record = true;[\s\S]*knShow\(T, /, 'the way on: step 2 again, Notetaker ticked, with the way back');
    assert.ok(js.includes("booked(F) { knStep(2); knTerminSay(F); knNotizFollow(); },"));   // (round 25) the instruction gives way to the done line
  });
  test('the way back after a jump: "Zurück zu Schritt N" before the heading it landed on; a click returns and focuses; the next jump moves it', () => {
    const offer = sliceFn(js, 'knBackOffer', REL);
    assert.match(offer, /b\.dataset\.from = F\.part\.name;\s*b\.textContent = knBackLabel\(b\);\s*b\.hidden = false;\s*h\.before\(b\);/);
    assert.match(offer, /sh\.focus\(\{ preventScroll: true \}\)/);
    assert.match(sliceFn(js, 'knShow', REL), /knBackOffer\(h, F, T\);/);   // (round 25) the way back knows the part it leaves (part.back)
    assert.deepEqual([dict.de.kn_back, dict.de.kn_back_day], ['Zurück zu Schritt {n}', 'Zurück zum Vertriebstag']);
    assert.match(bare, /\.kn-back\[hidden\] \{ display: none; \}/, 'hidden means hidden (its display rule would win over the attribute)');
  });
  test('the routing homes: each place of the CRM is one part\'s; a click in another part leads there', () => {
    const home = Object.fromEntries(parts.flatMap(p => p.home.map(pg => [pg, p.name])));
    assert.deepEqual(home, { deals: 'anfrage', integrations: 'anfrage', onboarding: 'engine', contacts: 'day', tasks: 'day', calendar: 'day', chat: 'day', analytics: 'day', settings: 'day' });
    assert.deepEqual(parts.filter(p => p.deal).map(p => p.name), ['notiz'], 'a deal opened anywhere shows its timeline in part 3');
    assert.deepEqual(parts.filter(p => p.contact).map(p => p.name), ['day'], 'a contact opened anywhere shows on the Kontakte tab');
    assert.match(sliceFn(js, 'knRecOpen', REL), /if \(!F\.part\.deal\) return knRouteDeal\(F, id\);/);
    assert.match(sliceFn(js, 'knCtOpen', REL), /if \(!F\.part\.contact\) return knRouteContact\(F, id\);/);
    assert.match(sliceFn(js, 'knShow', REL), /\(sec\.closest\('\.kn-st'\) \|\| sec\)\.scrollIntoView\(\{ behavior: KN_STILL \? 'auto' : 'smooth', block: 'start' \}\);/);   // (round 26) the station
    for (const n of PARTS) assert.match(body, new RegExp(`id="kn-${n}" data-kn-part="${n}"[\\s\\S]*?tabindex="-1" data-kn-head`), `${n}: a heading the page moves focus to`);
    // a deal carried into its part: as the part it came from has it
    const r = JSON.parse(run(`(() => { const A = knFake('anfrage'), G = knFake('notiz'); knLeadArrive(A.W, 'make', 0, 0); const d = A.W.deals.find(x => x.title === 'Mira Schulz');
      knRouteDeal(A, d.id); const g = knDeal(G.W, G.W.record.id); return JSON.stringify({ title: g.title, contact: knContact(G.W, g.contact_id).name, own: g.id !== d.id }); })()`));
    assert.deepEqual(r, { title: 'Mira Schulz', contact: 'Mira Schulz', own: true });
  });
  test('the zoom and the narrow layout: a part\'s design size scaled up to the column on wide screens, the app\'s narrow layout at 1:1 below 1024 px, as the host\'s kn-narrow class; parts 1 and 3 beside their text, part 1 at 1:1; nothing zoomed above 1.12, a wider column centres it', () => {
    const scale = (n, cw) => JSON.parse(run(`(() => { const F = knFake('${n}', ${cw}); knScale(F); return JSON.stringify({ w: F.w, h: F.h, s: F.s, x: F.x, narrow: F.host.narrow, vw: F.host.vars['--kn-w'], vx: F.host.vars['--kn-x'] }); })()`));
    // round 12: one zoom for every frame, the app at its own size (1:1), the frame as wide as its column
    assert.equal(run('KN_MAX_S'), 1, 'never zoomed up: the app\'s text keeps one size down the page');
    for (const n of PARTS.filter(x => x !== 'notiz' && x !== 'anfrage')) {
      const col = 1096;   // every part on the text column (round 11: step 4 too)
      const wide = scale(n, col);
      assert.ok(wide.s === 1 && wide.narrow === false && +wide.vw === wide.w && wide.w === col && wide.x === 0, `${n} at ${col} px: 1:1, as wide as the column (${wide.w}), not narrow`);
      for (const cw of n === 'termin' ? [320, 360, 568] : [320, 360, 768]) {   // round 15: step 2's frame is the dialog's 600 px, the desktop layout from 600
        const { w, s: z, narrow } = scale(n, cw);
        assert.deepEqual({ w, s: z, narrow }, { w: cw, s: 1, narrow: true }, `${n} at ${cw} px: as wide as the frame, 1:1, narrow`);
      }
    }
    // Notiz sits beside its text (kn-split): its frame takes the column's width, zoomed no more than 1.12 times, and keeps the
    // app's desktop layout down to 480 px (the panel above the record, as the part always shows it)
    const nz = parts.find(p => p.name === 'notiz');
    assert.deepEqual([nz.w, nz.h, nz.hm, nz.maxS, nz.narrowBelow], [540, 560, 660, 1.3, 480]);   // round 13: the bell and the note's timeline, 560 on wide screens; phones 660 since round 11
    const d = scale('notiz', 1096), t = scale('notiz', 768);
    assert.ok(d.w === 1096 && d.s === 1 && d.x === 0 && d.h === 560 && d.narrow === false, `notiz at 1096 px: ${d.w} wide, 1:1, 560 high (round 13)`);
    assert.ok(t.w === 768 && t.s === 1 && t.narrow === false && t.h === 560, `notiz at 768 px: ${t.w} wide, 1:1, not narrow, 560 high`);
    for (const cw of [320, 360]) { const { w, s: z, narrow, h } = scale('notiz', cw); assert.deepEqual({ w, s: z, narrow, h }, { w: cw, s: 1, narrow: true, h: 660 }, `notiz at ${cw} px`); }
    // part 1 sits beside its text in the hero above 1100 px (the column 692 px at 1366): the app's desktop layout at 1:1,
    // never zoomed; stacked below, still 1:1; its narrow layout only below 600 px
    const az = parts.find(p => p.name === 'anfrage');
    assert.deepEqual([az.w, az.h, az.hm, az.maxS, az.narrowBelow], [600, 470, 704, 1, 600]);   // round 15: phones 640, a 240 px board crop and the newest entry of Letzte Leads
    for (const cw of [1096, 692, 600]) { const { w, s: z, narrow, h } = scale('anfrage', cw); assert.deepEqual({ w, s: z, narrow, h }, { w: cw, s: 1, narrow: false, h: 470 }, `anfrage at ${cw} px`); }
    for (const cw of [320, 360, 599]) { const { w, s: z, narrow, h } = scale('anfrage', cw); assert.deepEqual({ w, s: z, narrow, h }, { w: cw, s: 1, narrow: true, h: 704 }, `anfrage at ${cw} px`); }   // round 15; round 18: Jonas Becker's entry on arrival
    assert.match(bare, /\.kn-split \{ display: grid; grid-template-columns: min\(30vw, 420px\) minmax\(0, 1fr\);/);   // (round 26) every step: the panel left, the frame right
    assert.ok(rules.some(r => r.in === '@media (max-width: 1100px)' && r.selector === '.kn-split' && r.decls.some(([p, v]) => p === 'grid-template-columns' && v === 'minmax(0, 1fr)')), 'stacked from 1100 px down (round 26: every step)');
    const minW = Math.min(...parts.filter(p => !p.maxS && p.name !== 'termin').map(p => p.w));   // round 15: step 2's frame is the dialog's 600 px by design
    const cq = [...bare.matchAll(/@container kn-cut \(max-width: (\d+)px\)/g)].map(m => +m[1]);
    const cqRules = [...bare.matchAll(/@container kn-cut \(max-width: \d+px\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
    assert.ok(cq.every(w => w < minW) && !/kn-rec-book|booking|cal-book/.test(cqRules), `no narrow container query a desktop frame (${minW} px and up) would match: ${cq}; none reaches step 2's dialog`);
    // Notiz may sit under those widths: every kn-cut rule belongs to a piece of part 4 or of the day, none to Notiz's
    for (const m of bare.matchAll(/@container kn-cut \(max-width: \d+px\) \{([\s\S]*?)\n\}/g)) for (const r of m[1].split('}').map(x => x.split('{')[0].trim()).filter(Boolean)) assert.match(r, /^\.kn-piece-(e-board|e-onb|tasks|contacts)\b/, `a kn-cut rule outside Notiz: ${r}`);
    assert.match(body, /<div class="kn-part kn-split" id="kn-notiz" data-kn-part="notiz" data-step="3">\s*<div class="kn-panel">/, 'part 3: the text beside the frame (round 26: its panel, then the frame)');
    assert.match(bare, /\.kn-split \{[^}]*grid-template-columns: min\(30vw, 420px\) minmax\(0, 1fr\)/);   // (round 26) their narrow left panel
    assert.match(bare, /\.kn-frame\.kn-narrow \.kn-cuts-a \{/, 'part 1 stacks its pieces on the class, not on a container query');
    // the one break in the rhythm: part 4's frame leaves the text column for the full width (the spine ends at its stop)
    assert.match(body, /<a class="kn-skip" href="#kn-day-t" data-kn="kn_skip5">[^<]+<\/a>\s*<div class="kn-frame kn-e-frame" id="kn-f-abschluss"/, 'step 4\'s frame in its text column, like steps 2 and 3 (round 11)');
    assert.doesNotMatch(body, /class="kn-full"/);
    assert.doesNotMatch(bare, /\.kn-full\b/);
    assert.equal(parts.find(p => p.name === 'abschluss').w, 960, 'the text column\'s design width: the board, the entry beside it, the monitor up to its Drive column (round 11)');
  });
});

describe('one run per part, on a stand-in frame (the app\'s rules, the part\'s hooks, the spine)', () => {
  test('1 · Anfrage: a source posts the next person; Letzte Leads and the board show what the server made of it; the third rests the button; step 1', () => {
    assert.deepEqual([...body.matchAll(/<button type="button" class="kn-src" data-src="([a-z0-9]+)">/g)].map(m => m[1]), ['form', 'make', 'zapier', 'n8n']);
    const r = JSON.parse(run(`(() => { const F = knFake('anfrage'), btn = { disabled: false, dataset: {}, setAttribute() {}, removeAttribute() {} }; const shown = F.W.logsShown.length; knAnfrageSend('form', btn); const one = [F.W.logsShown[0].contact_name, knDeal(F.W, 120).stage_id, KN_DONE.has(1)];
      knAnfrageSend('form', btn); knAnfrageSend('form', btn); const n = F.W.deals.length; knAnfrageSend('form', btn);
      return JSON.stringify({ shown, one, rest: btn.disabled, same: F.W.deals.length === n }); })()`));
    assert.deepEqual(r, { shown: 3, one: ['Hanna Vogt', 11, true], rest: true, same: true });   // round 18: Jonas Becker in from the start, the form sends Hanna Vogt next
    assert.match(sliceFn(js, 'knAnfrageRest', REL), /if \(rest\) \{ btn\.dataset\.knTitle = 'kn_src_why'; btn\.title = knWord\('kn_src_why'\); \}/, 'a resting source says why in its tooltip (round 11: no side line)');
    assert.doesNotMatch(body, /id="kn-src-why"|id="kn-anfrage-jump"|data-kn="kn_jump"/, 'the preview\'s side notes went: one preview line, at the top of step 1 (round 11)');
    assert.match(body, /<h2 class="kn-h2" id="kn-a-t" tabindex="-1" data-kn-head data-kn="kn_a_t">Formular und Automatisierung legen den Deal an\.<\/h2>/, 'step 1 has its heading, scoped to forms and automations (round 15 copy; round 21: Automatisierung in German prose)');
    assert.doesNotMatch(body, /id="kn-f-abschluss"[^>]*aria-describedby/, 'each card names its jump itself (round 11: no side line)');
    assert.match(body, /id="kn-f-anfrage" role="region" aria-describedby="kn-sample"/, 'step 1\'s frame described by its caption (round 12)');
    assert.doesNotMatch(body, /id="kn-abschluss-jump"/);
    assert.ok(!('kn_jump' in dict.de) && /Schritt 3/.test(dict.de.kn_jump_tag), 'the jump said on each card, not in a side line');
    // the board leads; Letzte Leads beside it, narrower, second in reading order
    assert.ok(js.includes("return `<div class=\"kn-cuts-a\">${knPiece('deals', board, 'board')}${knPiece('integrations', logs, 'logs')}</div>`;"));
    assert.match(cssAll, /\.kn-cuts-a \{ display: grid; grid-template-columns: minmax\(0, 1fr\); grid-template-rows: minmax\(0, 1fr\) auto;/);
    assert.match(sliceFn(js, 'knPart', REL) + js, /knPick\(krIntegrationsPage\(knL\(\{ p, logs: W\.logsShown \|\| \[\] \}\)\), '\.settings-card'\)/, 'the Letzte Leads card itself');
  });
  test('2 · Termin: the dialog open with the first free day; 11:00 clashes, 14:00 books with Notetaker; the meeting with its Meet link on the deal; step 2', async () => {
    run(`(() => { const F = knFake('termin'); F.part.after(F); knOnLoad(F); })()`);
    const B = () => run('KN.termin.W.booking && KN.termin.W.booking.B');
    assert.equal(B().date, run('KN.termin.W.days[0]'));
    assert.match(run('KN.termin.layers.booking.innerHTML'), /Termin mit Jonas Becker buchen/);
    assert.doesNotMatch(run('KN.termin.layers.booking.innerHTML'), /aria-modal/, 'a labelled dialog, not modal to the whole page');
    run(`knBookTime(KN.termin, knAt(KN.termin.W.booking.B.date, '11:00'))`); await sleep(520);
    assert.deepEqual(val('KN.termin.W.booking.B.conflicts.map(c => c.title)'), ['Rückruf Sabine Wolf']);
    run(`knBookTime(KN.termin, knAt(KN.termin.W.booking.B.date, '14:00'))`); await sleep(520);
    assert.equal(run('KN.termin.W.booking.B.conflicts.length'), 0);
    run(`KN.termin.W.booking.B.record = true; knBookGo(KN.termin)`); await sleep(1000);
    const a = run(`(() => { const a = KN.termin.W.acts[0]; return JSON.stringify([a.type, a.source, a.content, a.record, !!KN.termin.W.booking, KN_DONE.has(2)]); })()`);
    assert.deepEqual(JSON.parse(a), ['meeting', 'calcom', `Beratung zwischen Anna Weiß und Jonas Becker\n${run('KN_MEET')}`, true, false, true]);
    assert.match(run('KN.termin.layers.toasts.innerHTML'), /Notetaker/, 'the app\'s booking toast, then the Notetaker\'s');
    assert.ok(run('KN.termin.onLoad.has("booking") === false'), 'closed by the booking: opened again it holds Tab, as the app\'s does');
  });
  test('2 · Termin, the other way in (round 19: the sample\'s own state): his booking on Cal.com\'s page is in his timeline from the start, on his contact, no deal, owned by the host, no Notetaker; no button books a second one', () => {
    const r = JSON.parse(run(`(() => { const F = knFake('termin'); F.part.after(F); const a = F.W.acts.find(x => x.kn_seed);
      return JSON.stringify({ a: [a.type, a.source, a.contact_id, a.deal_id, a.bound_deal_id, a.event_date === F.W.days[0], a.event_time], by: a.created_by, record: a.record, link: a.content.split('\\n')[1], shown: krDealRecordPart(knRecO(F), 'main').includes(esc(a.content.split('\\n')[0])), type: F.W.booking && F.W.booking.B.typeId }); })()`));
    assert.deepEqual(r, { a: ['meeting', 'calcom', 70, null, null, true, '09:30'],   // (round 25) the next working day's first time, before the rep's Beratung
      by: run('KN_CAL.host_user_id'), record: false, link: run('KN_MEET_SELF'), shown: true, type: 102 });
    assert.notEqual(run('KN_MEET_SELF'), run('KN_MEET'), 'its own Meet link');
    assert.match(read('routes/integrations.js'), /router\.post\('\/calcom\/receive\/:token'/, 'the signed receiver the sample stands for');
    assert.match(read('routes/integrations.js'), /const createdBy = await calOwnerFor\(wid, b, conn\);/, 'the webhook\'s row belongs to the organizer');
    assert.match(sliceFn(js, 'knTerminSeed', REL), /Object\.assign\(a, \{ deal_id: null, bound_deal_id: null, created_by: KN_CAL\.host_user_id, kn_seed: true \}\);/);
    assert.ok(!/knTerminSelf|kn-termin-self/.test(js + body) && !('kn_t_self_btn' in dict.de) && !('kn_t_booked' in dict.de), 'no button books as the customer: his own booking is the proof (round 19)');
    assert.match(body, /<p class="kn-acts"><button type="button" class="kn-reset" id="kn-termin-reset" data-kn="kn_again">Von vorn<\/button><\/p>/);
    assert.ok(!('kn_t_host' in dict.de) && !('kn_t_host' in dict.en) && !/kn_t_host/.test(body), 'no line excusing the host name (round 20)');
    assert.ok(!('kn_t_self_d' in dict.de)); assert.deepEqual([dict.de.kn_t_tag, dict.en.kn_t_tag], ['Beispieldaten. Von selbst im Verlauf: Jonas Beckers Buchung über Cal.com bei Anna Weiß.', 'Sample data. Already in the timeline: Jonas Becker\'s own booking with Anna Weiß through Cal.com.'], 'step 2\'s caption says his booking came by itself, so „Termin von Anna Weiß“ reads (round 22 review)');
  });
  test('3 · Notiz: the sample\'s note in from the start, its row unread in the bell, the open timeline as loaded (round 13); a booked meeting waits for "Gespräch beenden"; the row opens the deal with the note on top; step 3; a deal opened elsewhere shows here', () => {
    run(`delete KN.termin; knFake('notiz')`);
    const n0 = val('KN.notiz.W.bell.items[0]'), note0 = val("KN.notiz.W.acts.find(a => a.source === 'notetaker')");
    assert.deepEqual([val('KN.notiz.W.bell.items.length'), n0.type, n0.read, n0.body, val('KN.notiz.W.own'), val('KN.notiz.W.record.stale')], [1, 'notetaker_done', false, 'Beratung: PV-Anlage für die Lagerhalle in Hamburg', true, [note0.id]]);
    assert.match(sliceFn(js, 'knRecO', REL), /knActRows\(W\)\.filter\(a => !\(R\.stale && R\.stale\.includes\(a\.id\)\)\)/, 'the open timeline does not show what arrived after it was opened (no live update)');
    assert.match(body, /<p class="kn-do" id="kn-notiz-do" data-kn="kn_n_do_own">Die Notetaker-Meldung zu Jonas Becker öffnen\.<\/p>\s*<p class="kn-acts"><button type="button" class="kn-btn kn-btn-sm kn-btn-ghost" id="kn-notiz-end" hidden data-kn="kn_m_end">Gespräch ist vorbei<\/button><button type="button" class="kn-reset" id="kn-notiz-reset" data-kn="kn_again">Von vorn<\/button><\/p>/);
    assert.match(sliceFn(js, 'knNotizFollow', REL), /if \(!N \|\| \(!N\.W\.own && N\.W\.acts\.some\(a => a\.source === 'notetaker'\)\)\) return;/, 'step 2\'s booking still carries in over the sample\'s own note');
    // a meeting the visitor booked: "Gespräch beenden" brings its note
    run(`KN.notiz.W = knWorld(KN.notiz.part); KN.notiz.W.own = false; KN.notiz.W.acts = KN.notiz.W.acts.filter(a => a.source !== 'notetaker'); KN.notiz.W.bell.items = []; KN.notiz.W.record.stale = []`);
    const btn = run('({ disabled: false })');
    S.__btn = btn; run('knNotizEnd(__btn)');
    const n = val('KN.notiz.W.bell.items[0]');
    assert.deepEqual([n.type, n.entity_id, n.read, btn.disabled], ['notetaker_done', 120, false, true]);
    run('KN.notiz.part.notif(KN.notiz, KN.notiz.W.bell.items[0])');
    assert.match(run('KN.notiz.layers.record.innerHTML'), /PV-Anlage für die Lagerhalle in Hamburg/);
    assert.ok(run('KN_DONE.has(3)'));
    assert.deepEqual(val('KN_PARTS.find(p => p.name === "notiz").keep'), ['record', 'bell'], 'the record and the bell\'s panel are the piece: they stay open');
    run('KN.notiz.part.showDeal(KN.notiz, 108)');
    assert.match(run('KN.notiz.layers.record.innerHTML'), /Zwei Hallen, Dachflächen zusammen rund 2\.400 m²/, 'the deal\'s home: another deal\'s timeline');
    // part 4 Angebot was folded away (addendum 11): the record's title, value and stage edits stay the app's (the replica tests above)
    assert.doesNotMatch(body, /id="kn-angebot"|kn_g_/);
  });
  test('4 · Abschluss: Jonas Becker\'s deal to Gewonnen: the toast, a pending delivery, step 4; each "Nächste Meldung" one report of the Engine\'s, counted', async () => {
    run(`knFake('abschluss')`);
    assert.equal(run('knDeal(KN.abschluss.W, 120).stage_id'), 14, 'in Verhandlung after the proposal');
    run('knBoardMove(KN.abschluss, 120, KN_WON)');
    assert.deepEqual([run('knDeal(KN.abschluss.W, 120).stage_id'), run('KN.abschluss.W.deliv[120].status')], [15, 'pending']);
    await sleep(380);
    assert.match(run('KN.abschluss.layers.toasts.innerHTML'), /Verschoben nach Gewonnen[\s\S]*Rückgängig/);
    assert.ok(run('KN_DONE.has(4)'));
    const left = () => run('knOnbLeft(KN.abschluss.W)');
    assert.equal(left(), 6, 'a pending delivery: six reports to come');
    run('knOnbReport(KN.abschluss.W)');
    assert.deepEqual([run('KN.abschluss.W.deliv[120].status'), run('KN.abschluss.W.onb[70].status'), left()], ['success', 'formular_versendet', 5]);
    run('knOnbReport(KN.abschluss.W)');
    assert.deepEqual([run('KN.abschluss.W.onb[70].status'), left()], ['formular_ausgefuellt', 4]);
    // round 13: one control, "Alle Meldungen holen", brings every report left; Aktualisieren only reloads, as the app's does
    const next = sliceFn(js, 'knEngineNext', REL);   // (round 22) the Engine's block holds the control
    assert.match(next, /all\.disabled = !live \|\| left === 0;/);
    assert.match(next, /all\.dataset\.kn = live && left === 0 \? 'kn_e_all' : 'kn_e_rest';\s*all\.textContent = knWord\(all\.dataset\.kn\);/, 'the reports\' control: „Ein paar Tage später“ while it can be pressed (round 22: an honest stand-in for the days)');
    assert.ok(!js.includes('kn-abschluss-next') && js.includes("if (k === 'onb-refresh') return knOnbReload(F, 1);") && !('kn_e_next' in dict.de), 'no single-step control of the page\'s own; the monitor\'s Aktualisieren brings the next report, one per click (round 18)');
    // all that are left at once, one click and no timer
    assert.ok(js.includes("const G = KN.engine; if (G && !all.disabled) { knOnbReload(G, knOnbLeft(G.W)); knEngineNext(); }") && sliceFn(js, 'knOnbReload', REL).includes('for (let i = 0; i < n; i++) knOnbReport(W);'));
    run('knOnbReload(KN.abschluss, knOnbLeft(KN.abschluss.W))');
    assert.deepEqual([run('KN.abschluss.W.onb[70].status'), left()], ['onboarding_abgeschlossen', 0]);
    assert.match(body, /<p class="kn-acts"><span class="kn-e-engine" id="kn-abschluss-engine" hidden><button type="button" class="kn-btn kn-btn-sm" id="kn-abschluss-rest" disabled data-kn="kn_e_rest">Ein paar Tage später<\/button><\/span><button type="button" class="kn-reset" id="kn-engine-reset" data-kn="kn_again">Von vorn<\/button><\/p>/, 'the Engine\'s block: its time skip, unseen until a win, then its Von vorn (round 22)');
    assert.deepEqual([dict.de.kn_e_rest, dict.de.kn_e_all], ['Ein paar Tage später', 'Alle Schritte gemeldet']);
    assert.ok(!('kn_e_next' in dict.de) && !('kn_e_wait' in dict.de), 'the single-step words went with their control (round 13)');
    // the Engine marked optional in its heading; the first line says what it is (polish round)
    { const e4 = body.slice(body.indexOf('id="kn-e-t"'), body.indexOf('id="kn-f-abschluss"')), at = t => e4.indexOf(t);
      assert.ok(at('>Gewonnene Deals zählen in den Analysen mit.</h2>') > 0 && at('class="kn-do"') > 0 && at('id="kn-abschluss-an"') > at('class="kn-do"') && at('data-kn="kn_e_win"') === -1 && at('id="kn-e-sub"') === -1 && at('data-kn="kn_e_opt"') === -1, 'round 22: the heading the win, then its one line with „Analysen ansehen“; the Engine in its own block after the day'); }
    assert.doesNotMatch(dict.de.kn_e_see + dict.en.kn_e_see, /Rückgängig|Undo/); assert.ok(!('kn_e_win' in dict.de), 'no line claims Undo recalls the Engine (routes/deals.js:183-186); the win\'s Undo sets the stage back only');
    assert.doesNotMatch(body, /<span class="kn-stop" data-step="4">[^\n]*kn-stop-opt/, 'round 15: step 4\'s stop is the win\'s; "Optional" is on the Engine\'s own block');
    // its controls only after the win (round 22: knEngineNext, in the Engine's block)
    assert.match(body, /<span class="kn-e-engine" id="kn-abschluss-engine" hidden><button type="button" class="kn-btn kn-btn-sm" id="kn-abschluss-rest" disabled/);
    assert.match(sliceFn(js, 'knEngineNext', REL), /if \(box\) box\.hidden = !live;/);
    assert.equal(dict.de.kn_e_t, 'Gewonnene Deals zählen in den Analysen mit.'); assert.equal(dict.en.kn_e_t, 'Once won, the deal counts in Analytics.');   // (round 26 copy)   // (round 25 review) the stage quoted, the gain first, no „Zug“   // (round 20) shown in the day's Analysen
    assert.deepEqual([dict.de.kn_e_an, dict.en.kn_e_an], ['Analysen ansehen', 'See Analytics']); assert.match(sliceFn(js, 'knDayWon', REL), /d\.id === 120/, 'Jonas Becker\'s deal is step 4\'s in the day\'s Analysen');   // round 18: the heading is the win; the Engine follows in its optional block
    // what the team sees in the CRM, first (design round 8): the status in the monitor's own words (the customer's form and
    // booking, the call, the briefing: who does what, 5.3), the Drive folder's link (onboarding.js drive_ordner_id), the
    // note the CRM writes for differing details (engine-api.js conflictNote); then the win that starts it
    assert.doesNotMatch(body, /class="kn-e-see"|kn-ledger-e|data-kn="kn_e_s\d/, 'step 4 is the gain and one line (round 12): the ledger and its brackets went');
    // round 12: no status words in the copy any more (the monitor in the frame shows them); no agency jargon, no brackets
    assert.ok(Object.keys(dict.de).every(k => !/^kn_e_s\d/.test(k)) && !/Briefing|Call erfolgt|\(/.test(dict.de.kn_e_opt + dict.de.kn_e_see), 'step 4 in plain words');
    assert.ok(!('kn_e_who' in dict.de) && !('kn_e_steps' in dict.de), 'the two abstract lines are gone');
    assert.match(read('routes/engine-api.js'), /'Upgrads Engine: abweichende Stammdaten erkannt – nicht überschrieben\.'/);
    assert.match(read('routes/activities.js'), /WHEN a\.source = 'engine' THEN 'Upgrads Engine'/, 'signed "Upgrads Engine" on the deal\'s timeline');
    assert.match(sliceFn(js, 'knEngineNote', REL), /Upgrads Engine: abweichende Stammdaten erkannt – nicht überschrieben\.\\n• Telefon: CRM „\$\{c\.phone\}“ \/ Engine „/);
    assert.ok(js.includes("return `<div class=\"kn-cuts-e\">${knPiece('deals', board, 'e-board')}${knPiece('analytics', knAbschlussCards(W), 'e-an')}</div>`;") && /const KN_E_CARDS = \['won_value', 'win_rate'\];/.test(js) && js.includes("return `<div class=\"kn-cuts-g\">${knPiece('onboarding', onb, 'e-onb')}</div>`;"), 'step 4: the board and, beside it, the app\'s Analysen cards (round 21); the monitor in the Engine\'s block (round 22)');
    assert.match(bare, /\.kn-cuts-g \{ height: 100%; min-height: 0; \}/, 'round 22: the Engine block\'s frame, the monitor alone');
    assert.match(bare, /\.kn-cuts-e \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 300px; grid-template-rows: minmax\(0, 1fr\);/);
    assert.deepEqual(val("[KN_PARTS.find(p => p.name === 'abschluss').w, KN_PARTS.find(p => p.name === 'abschluss').h, KN_PARTS.find(p => p.name === 'abschluss').hm]"), [960, 540, 600], 'in the text column (round 11); round 15: cropped to the win, 540 high; round 17: phones from 600, then as tall as the column (knAbschlussFit)');
    assert.deepEqual(val('KN_ONB_STEPS'), ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'], 'the six steps the line explains, in the briefing\'s order');
    assert.ok(!('kn_e_d' in dict.de) && /^Nach dem Abschluss übernimmt die Upgrads Engine und schickt dem Kunden das Onboarding-Formular\.$/.test(dict.de.kn_e_opt), 'the win in the heading, the Engine\'s part in its block (round 15; round 19 copy: the Engine named, then the form) (round 13: no "Keine …:" opener); the monitor in the frame keeps its own „Onboarding starten“');
  });
  test('5 · The day: six tabs, Kontakte first and open; each tab one page; a contact opened anywhere shows on Kontakte; the list\'s own name', () => {
    assert.deepEqual([...body.matchAll(/data-tab="([a-z]+)" data-kn="kn_tab_/g)].map(m => m[1]), val('KN_TABS'));
    assert.deepEqual(val('KN_TABS'), ['contacts', 'tasks', 'calendar', 'chat', 'analytics', 'settings']);
    assert.match(body, /id="kn-tab-contacts" aria-controls="kn-f-day" aria-selected="true"/);
    const r = JSON.parse(run(`(() => { const F = knFake('day'), seen = [F.W.page]; for (const t of KN_TABS) { knGo(F, t); seen.push(F.W.page); }
      F.part.showContact(F, 62); const ct = [F.W.page, F.W.ctRec && F.W.ctRec.id]; knSaveName(F, 'object', '  Standorte  ');
      return JSON.stringify({ seen, ct, name: F.W.objectName, sizes: KN_TABS.map(t => { F.W.page = t; return F.part.size(F).h; }) }); })()`));
    assert.deepEqual(r.seen, ['contacts', 'contacts', 'tasks', 'calendar', 'chat', 'analytics', 'settings']);
    assert.deepEqual(r.ct, ['contacts', 62]);
    assert.equal(r.name, 'Standorte', 'trimmed, as objects.js saves it');
    assert.ok(r.sizes.every(h => h > 200 && h <= 640), `each tab its own height: ${r.sizes}`);
  });
});

describe('the page\'s words', () => {
  test('every data-kn key exists in both languages and the markup holds the German text; the page\'s copy is all in KN_I18N', () => {
    for (const m of body.matchAll(/data-kn="([a-z0-9_]+)">([^<]*)</g)) { assert.ok(m[1] in dict.de && m[1] in dict.en, m[1]); assert.equal(m[2], dict.de[m[1]], m[1]); }
    for (const m of body.matchAll(/data-kn-aria="([a-z0-9_]+)" aria-label="([^"]*)"/g)) assert.equal(m[2], dict.de[m[1]], m[1]);
    assert.deepEqual(Object.keys(dict.de).sort(), Object.keys(dict.en).sort());
    for (const m of js.matchAll(/knWordN?\('([a-z0-9_]+)'/g)) assert.ok(m[1] in dict.de, `${m[1]}: a script word is in the dictionary`);
    // without the script: one line in both languages (the page's only English in the markup, marked lang="en")
    // without the script: one line in both languages, only what is true (the form has no action; the direct address works)
    assert.ok(body.includes(`<noscript><p class="kn-noscript"><span data-kn="kn_noscript">${dict.de.kn_noscript}</span> <a class="kn-a kn-a-line" href="mailto:team@upgrads.de?subject=Anfrage%20zu%20Upgrads%20CRM">team@upgrads.de</a>. <span lang="en"><span data-kn-en="kn_noscript">${dict.en.kn_noscript.replace(/'/g, "'")}</span> <a class="kn-a kn-a-line" href="mailto:team@upgrads.de?subject=Request%20about%20Upgrads%20CRM">team@upgrads.de</a>.</span></p></noscript>`));
    assert.doesNotMatch(dict.de.kn_noscript + dict.en.kn_noscript, /Alles andere|Everything else/);
    assert.doesNotMatch(body, /<form[^>]*action=/, 'the form sends nothing without the script, and the line does not claim it does');
  });
  test('impersonal German, English where it differs', () => {
    const KEEP = /^(CRM|Onboarding|Optional|Make|Zapier|n8n|Name|Import|Export|Pipelines|Deal|team@upgrads\.de|Upgrads CRM|Upgrads Engine \(optional\))$/;   // (round 26) the brand link's name and the Engine's dot are names   // round 16: the drawing's "Deal" is the English word too
    for (const k of Object.keys(dict.de)) {
      assert.doesNotMatch(dict.de[k], IMPERSONAL, `${k} is impersonal: ${dict.de[k]}`);
      if (!KEEP.test(dict.de[k]) && !/_k$/.test(k)) assert.notEqual(dict.de[k], dict.en[k], `${k} is translated`);
      assert.doesNotMatch(dict.de[k], /;/, `${k}: no semicolon in the German`);
    }
    for (const k of ['kn_fit_t', 'kn_q2', 'kn_q4', 'kn_e_t']) assert.doesNotMatch(dict.de[k], /, und/, `${k}: no comma before "und"`);
  });
  test('few words: the claim, the sub, each part\'s heading, line and instruction, the whole page', () => {
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      // the sub 18 words at most since design round 8 (it was 34 in German): the first screen keeps part 1 above the fold
      assert.ok(words(d.kn_h1) <= 9, `${lang} claim`); assert.ok(words(d.kn_sub) <= (lang === 'de' ? 22 : 25), `${lang} sub: ${words(d.kn_sub)}`);   // (round 26 copy) the English 25: the gain first, as the German
      for (const k of ['kn_a_t', 'kn_t_t', 'kn_n_t', 'kn_e_t', 'kn_day_t', 'kn_fit_t', 'kn_facts_t', 'kn_start_t', 'kn_faq_t', 'kn_c_t']) assert.ok(words(d[k]) <= (k === 'kn_n_t' ? 12 : 10), `${lang} ${k}`);   // (round 22 review) step 3 names Notetaker in its heading
      for (const k of ['kn_n_d', 'kn_e_d']) assert.ok(!(k in d), `${lang} ${k} went (round 22: one line per part)`);
      for (const k of Object.keys(d).filter(x => /^kn_(\w_do|do_\w+|e_do_touch)$/.test(x))) assert.ok(words(d[k]) <= 18, `${lang} ${k}: ${words(d[k])}`);
      const total = SEEN.reduce((a, k) => a + words(d[k]), 0);
      // 670/750 since design round 8 (659/736 then; 687/757 before): the sub 18 words, step 4 a ledger of what the team sees
      assert.ok(total <= (lang === 'de' ? 670 : 750), `${lang}: ${total} words on arrival`);
    }
  });
  test('the claims audit: no code words, no superlative, no price, no AI or compliance or speed promise, no "Upgrads sends", no email sync', () => {
    const copy = Object.keys(dict.de).flatMap(k => [dict.de[k], dict.en[k]]).join('\n');
    assert.doesNotMatch(copy.replace(/API-Schlüssel|API key/g, ''), /\b(api|endpoint|payload|json|hmac|http|url|token|header|curl|webhook)\b/i);
    assert.deepEqual(Object.keys(dict.de).filter(k => /API/.test(dict.de[k] + dict.en[k])), ['kn_need1'], '"API-Schlüssel" only where Cal.com\'s key is named, as Cal.com names it');
    assert.doesNotMatch(copy, /kein zweites Programm|no second tool/i, 'round 15: no claim the page\'s own limits contradict');
    assert.doesNotMatch(copy, /(?<!\p{L})(beste[rsn]?|schnellste[rsn]?|einfachste[rsn]?|einzige[rsn]?|revolutionär|führend|marktführer|best|fastest|easiest|leading|revolutionary|world-class)(?!\p{L})/iu);
    // "kostenlos" / "free" only as Google's free account (the Meet limit), never as this product's price
    const price = /\b(preis|price|trial|testphase|rabatt|discount)\b|\b(kostenlos\w*|free)\b(?!\s+Google)|€|\$/i;
    assert.deepEqual(Object.keys(dict.de).filter(k => price.test(dict.de[k] + '\n' + dict.en[k])).sort(), ['kn_a7', 'kn_next'], 'price only where it says it is agreed with each team (the answer, and what follows a request; round 18: the delivered request no longer repeats it)');
    assert.doesNotMatch(Object.values(dict.de).concat(Object.values(dict.en)).join('\n'), /Hosting|hosted|Rechenzentrum|data cent(er|re)|Server(standort)?\b/i, 'the hosting location is not a topic of this page');
    assert.deepEqual([dict.de.kn_need2_k, dict.de.kn_need2], ['Notetaker', 'Google Meet, im Deal gebucht. Aufnahme bis zu 120 Minuten, mit kostenlosem Google-Konto endet ein Meeting nach 60.'], 'the 120 and the 60 minutes in plain words; Notetaker only for a Meet booked from the deal');
    // Notetaker is ordered in one place only: a booking from the deal's dialog with the box ticked (integrations.js:1015)
    assert.equal((read('routes/integrations.js').match(/\bnotetakerRequest\(/g) || []).length, 2, 'the definition and its one call');
    assert.match(read('routes/integrations.js'), /const notetakerResult = body\.record === true \? await notetakerRequest\(/);
    assert.match(dict.de.kn_need1, /, sonst fehlen Terminbuchung und Notetaker\.$/); assert.equal(dict.en.kn_need1, 'A Cal.com account, connected by API key. Without it, booking and Notetaker are missing.');
    assert.match(dict.en.kn_need2, /^A Google Meet booked from the deal\./);
    // the note scoped to the Google Meet booked in the CRM (polish round: no ambiguous "dort", no German plural "Meets")
    assert.match(dict.de.kn_sub, /^Das CRM für Vertriebsteams: kein Abtippen dank Formularen, .*Notetaker \(Aufzeichnung in Google\u00a0Meet\)\. Microsoft Teams und Outlook-Kalender\u00a0folgen\.$/); assert.match(dict.en.kn_sub, /^The CRM for sales teams: no more retyping, thanks to forms, .*Notetaker \(Google\u00a0Meet recording\)\. Microsoft Teams and Outlook calendar are coming\.$/);   // (round 26 copy)   // (round 25) the sub names the CRM on every width   // round 15 review: notes only when Notetaker was ticked; round 16 review: the sources first, a no-break space in "Google Meet"
    assert.doesNotMatch(dict.de.kn_sub, /\bdort\b|Google Meets|im CRM gebuchten/, 'plain: no nested participle (round 11)');
    assert.doesNotMatch(dict.de.kn_sub, /aus im CRM gebuchten/, 'no phrase nested in a phrase');
    for (const l of ['de', 'en']) assert.ok(/\b(server|Server)\b/.test(dict[l].kn_f_fallback_fail) === false, `${l}: the retry line says what it does, not where`);
    for (const l of ['de', 'en']) assert.ok(Object.values(dict[l]).every(v => !/Gesprächsnotizen aus Google Meet(?!s)|Google Meet call notes/.test(v)), `${l}: no line promises notes from any Meet`);
    assert.match(dict.de.kn_a2, /beim Buchen aus dem Deal angehakt/); assert.ok(!('kn_t_booked' in dict.de));
    // the new deal has no owner and nobody is told (integrations.js:286): no "bleibt liegen"
    assert.match(dict.de.kn_a_t, /Formular und Automatisierung/); assert.match(dict.en.kn_a_t, /Forms and automations/);   // (round 26 copy)   // round 13: the heading scopes it, the line adds the known address
    assert.ok(!('kn_a_d' in dict.de)); assert.deepEqual([dict.de.kn_a_do, dict.en.kn_a_do], ['Beispiel-Anfrage senden:', 'Send a sample enquiry:']); assert.equal(dict.de.kn_a_hint, 'Tipp: Die zweite Make-Anfrage kommt von Sabine Wolf, die schon als Kontakt im CRM ist. Das CRM erkennt sie an der E-Mail.', 'round 22: the Sabine Wolf demo as a second hint once a lead is in (round 24: „als Kontakt im CRM“)');
    // enquiries by phone or plain email are typed in (no email sync): no line claims every or no enquiry (round 11)
    assert.ok(Object.values(dict.de).every(v => !/\b(Jede|Keine) Anfrage\b/.test(v)) && Object.values(dict.en).every(v => !/\b(every|no) enquiry\b/i.test(v)));
    assert.ok(Object.values(dict.de).every(v => !/bleibt liegen/.test(v)));
    assert.deepEqual([dict.de.kn_not4, dict.en.kn_not4], ['Keine Handy-App, läuft im Browser.', 'No phone app; it runs in the browser.'], 'phones: what there is, not only what there is not (the app\'s narrow layout, style.css)');
    assert.match(read('utils/notetaker.js'), /^const MAX_MINUTES = 120;$/m, 'the 120 minutes are what the CRM asks the Notetaker for');
    // AI only as the plain fact of how Notetaker's notes are written (routes/notetaker.js: "Claude's notes"), never as a promise
    const ai = /\bKI\b|\bAI\b|künstliche Intelligenz|artificial intelligence/i;
    assert.deepEqual(Object.keys(dict.de).filter(k => ai.test(dict.de[k] + '\n' + dict.en[k])), ['kn_n_tag']);   // (round 22) the AI line is step 3's caption
    assert.equal(dict.de.kn_n_tag, 'Beispieldaten. Nur mit Notetaker von Upgrads: Er nimmt auf, ein KI-Modell schreibt die Notiz.', 'round 22: the AI line as step 3\'s caption; round 25: the condition here, the heading the gain');
    assert.match(read('routes/notetaker.js'), /Claude's notes/);
    assert.doesNotMatch(copy, /DSGVO|GDPR|in Sekunden|in seconds|sofort|instantly|Echtzeit|real.?time|automatisch|automatic/i);
    assert.doesNotMatch(copy, /verschickt (das CRM|Upgrads)|Upgrads (sendet|verschickt|schickt)|CRM sends|Upgrads sends/i);
    const mailbox = /Postfach|Gmail|mailbox|inbox|E-Mails? (lesen|synchron)|E-Mail-Synchron|email sync/i;
    assert.deepEqual(Object.keys(dict.de).filter(k => mailbox.test(dict.de[k] + '\n' + dict.en[k])), ['kn_not1'], 'the mailbox is named only as something it does not do yet');
    assert.match(dict.de.kn_a3, /^Das CRM nicht\. Einladungen verschickt Cal\.com/, 'the answer to "does the CRM write to customers" is no, and names the Engine\'s form');
    assert.match(dict.de.kn_a2, /Die Einwilligung der Teilnehmenden holt das Team vorher ein\./);
    assert.equal(dict.de.kn_who, 'Upgrads nutzt es selbst täglich. Ansprechpartner: Basilius Peetz.', 'used daily by Upgrads, and the one contact');
    assert.equal(dict.de.kn_for3, 'Neu, von der Upgrads GbR aus Landshut', 'near the hero: new, and the operator as the legal notice names it');
    assert.match(body, /<p class="kn-hero-fact"><span data-kn="kn_for3">Neu, von der Upgrads GbR aus Landshut<\/span> · <a class="kn-a kn-a-line" href="https:\/\/upgrads\.de\/impressum" data-kn="kn_imprint">Impressum<\/a><\/p>/, 'near the top again, beside the button (round 13, a round-12 regression undone)');
    assert.match(body, /<p class="kn-fact"><span data-kn="kn_who">[^<]*Basilius Peetz\.<\/span>/, 'the contact stays in the request panel');
    assert.match(dict.de.kn_a2, /Ins CRM kommt nur die fertige Notiz, keine Aufnahme und kein Transkript\./);
    assert.deepEqual(Object.keys(dict.de).filter(k => /Ins CRM kommt nur die fertige Notiz/.test(dict.de[k])), ['kn_a2'], 'the note-only line said once, in the answer');
    assert.match(read('routes/notetaker.js'), /INSERT INTO activities \(workspace_id, contact_id, deal_id, type, content, created_by, source\)/, 'the Notetaker result is stored as a note');
    assert.doesNotMatch(read('db.js').slice(read('db.js').indexOf('CREATE TABLE IF NOT EXISTS notetaker_recordings')).slice(0, 1400), /transcript|recording_url|audio/, 'no transcript or recording column');
    assert.ok(!('kn_fiction' in dict.de) && /^Echte Oberfläche, erfundene Beispieldaten\./.test(dict.de.kn_sample), 'the made-up data said once, under part 1\'s frame');
    // the vendor's facts kept through the cuts (memory: new and used daily by Upgrads, price per team, 120/60 minutes)
    assert.match(dict.de.kn_a7, /Der Preis wird pro Team vereinbart\./);
    assert.equal(Object.values(dict.de).filter(v => /120 Minuten/.test(v)).length, 1, 'the 120 and 60 minutes said once, in the needs');
    assert.doesNotMatch(html + js, /peetz@upgrads\.de/i, 'the user\'s own address is not on the page');
    // the outcome for the team first; a stand-in says what it stands for; 11:00 says why
    assert.equal(dict.de.kn_sub, 'Das CRM für Vertriebsteams: kein Abtippen dank Formularen, Cal.com (Terminbuchung) und Notetaker (Aufzeichnung in Google\u00a0Meet). Microsoft Teams und Outlook-Kalender\u00a0folgen.', 'round 19 review: whom it is for, the gain, the means, the Microsoft line; round 25: the CRM named first');
    assert.equal(dict.en.kn_sub, 'The CRM for sales teams: no more retyping, thanks to forms, Cal.com (scheduling) and Notetaker (Google\u00a0Meet recording). Microsoft Teams and Outlook calendar are coming.');   // (round 26 copy)   // (round 25 review) the Microsoft line as kn_not2 has it
    // the gain for the team and its sales lead at the sub's size; what works without Cal.com beside the request
    assert.ok(!('kn_for_a' in dict.de) && !('kn_for_b' in dict.de), 'round 19: the hero\'s fit lines went (the head of sales\' gain is in the Analysen line, Microsoft in the limits\' plan row)');
    assert.equal(Object.keys(dict.de).filter(k => /Cal\.com \(Terminbuchung\)/.test(dict.de[k])).join(), 'kn_sub');
    assert.ok(!('kn_for_a' in dict.en));
    assert.ok(!('kn_for4' in dict.de), 'the Cal.com caveat moved to Voraussetzungen (round 11)');
    assert.match(dict.de.kn_need1, /, sonst fehlen Terminbuchung und Notetaker\.$/, 'the limit, said in the needs');
    assert.equal(dict.de.kn_h1, 'Anfrage, Termin und Notiz landen von selbst im Deal.', 'the claim names the concrete outcome with a verb (round 15 copy; the sub scopes the notes)');
    assert.equal(dict.en.kn_h1, 'Enquiries, meetings, notes land on the deal for you.');   // (round 25) a verb, one line at 1366, nine words at most
    // Cal.com said what it is at its first mention, in the word itself: "Cal.com-Termine" / "Cal.com bookings"
    assert.match(dict.de.kn_sub, /Cal\.com \(Terminbuchung\)/); assert.match(dict.en.kn_sub, /Cal\.com \(scheduling\)/);
    assert.deepEqual([dict.de.kn_need5, dict.en.kn_need5], ['Ein Google-Drive-Konto für die Kundenordner.', 'A Google Drive account for the customer folders.'], 'a clear need (round 13; round 16 copy: its term "Upgrads Engine" says whose)');
    assert.ok(!('kn_t_self_btn' in dict.en), 'round 19: no customer-booking button');
    assert.equal(dict.de.kn_e_see, 'Das CRM zeigt, wie weit der Kunde ist, und seinen Drive-Ordner.', 'in plain words what the Engine block\'s frame shows (round 22: no line about a note it does not show)');
    assert.doesNotMatch(dict.de.kn_for3, /Pipeline/, 'no hero fact repeats the sub');
    // the headings say what is gained; the app's labels quoted; the plain names
    assert.deepEqual(['kn_a_t', 'kn_n_t', 'kn_e_t', 'kn_day_t'].map(k => dict.de[k]), ['Formular und Automatisierung legen den Deal an.', 'Die Notiz steht nach dem Gespräch schon im Deal.', 'Gewonnene Deals zählen in den Analysen mit.', 'Kontakte, Aufgaben, Termine und Zahlen an einem Ort.'], 'the headings: the gain, and no more than the page shows (round 18: the win on the board; the day a selection, not all of it)');
    assert.ok(!('kn_a_d' in dict.de) && !('kn_t_d' in dict.de));
    assert.match(dict.de.kn_t_do, /^11:00 wählen: Das CRM meldet die Überschneidung\.$/); assert.equal(dict.de.kn_e_do, 'Jonas Becker auf „Gewonnen“ ziehen oder „Gewonnen“ im Kartenmenü wählen.');   // round 15: the Engine is optional, so no promise of the onboarding; round 16 review: the card menu named for everyone
    for (const [k, l] of [['kn_e_do', '„Gewonnen“'], ['kn_a_next', '„Neu“'], ['kn_n_none', '„Mit Notetaker aufzeichnen“']]) assert.ok(dict.de[k].includes(l), `${k} quotes ${l}`);
    assert.match(dict.de.kn_need1, /API-Schlüssel/); assert.match(dict.de.kn_st3_d, /^Per Einladungscode/);
    assert.ok(Object.values(dict.de).filter(v => /abtipp/i.test(v)).length <= 1, '"Abtippen" once at most; the claim says "von selbst" (round 15 copy)');
    assert.equal(dict.de.kn_not2, 'Notetaker bisher nur in Google Meet. Microsoft Teams und Outlook-Kalender folgen.', 'round 19: the Microsoft gap in the limits\' plan row; round 21: with the Notetaker limit, and what Microsoft brings (the Outlook calendar and Teams meetings, not email)');
    assert.deepEqual([dict.de.kn_n_do_own, dict.de.kn_n_do], ['Die Notetaker-Meldung zu Jonas Becker öffnen.', 'Das gebuchte Gespräch mit Jonas Becker beenden, dann die Meldung öffnen.'], 'one short line, by what step 3 holds, naming whose (round 14) (round 13)');
    assert.equal(dict.en.kn_e_do, 'Drag Jonas Becker to “Won” or choose “Won” in his card menu.');
    assert.ok(!('kn_e_stand' in dict.de), 'the preview\'s side notes went: one preview line, at the top of step 1 (round 11)');
    assert.equal((body.match(/data-kn="kn_jump"/g) || []).length, 0, '"Ein Klick auf einen Deal" said once (part 4\'s frame points to part 1\'s line)');
    assert.match(dict.de.kn_a_do, /Beispiel-Anfrage/);
    assert.match(dict.de.kn_t_do, /^11:00 wählen: Das CRM meldet die Überschneidung\.$/);   // (round 22) one short line; the dialog shows the clash
    assert.doesNotMatch(dict.de.kn_t_do + dict.en.kn_t_do, /11:15|warnt|warns/, 'the instruction does not give the outcome away');
    assert.doesNotMatch(Object.values(dict.de).join('\n'), /Adresse des Arbeitsbereichs|das Formular\b|erste Phase|Niemand stößt/, 'no jargon, and nothing the buttons contradict');
  });
  test('none of the tells of generated copy: no em dash, no middle dot, no arrow glyph, no buzzwords, no "not just X but Y"; no caps labels', () => {
    const copy = Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + '\n' + bodyNoSprite.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy.replace('<span data-kn="kn_for3">', '').replace(/\bLandshut<\/span> · /, ''), /—|→|←/);
    assert.equal((copy.match(/·/g) || []).length, 1, 'one middle dot: before Impressum in the vendor line (round 13, asked for)');
    assert.doesNotMatch(copy, /seamless|effortless|nahtlos|mühelos|game.?changer|supercharge|unlock|elevate|empower|next.level/i);
    assert.doesNotMatch(copy, /not just|nicht nur .* sondern/i);
    assert.doesNotMatch(bare, /text-transform/);
  });
  test('the request: team@upgrads.de, privacy and legal notices linked, the hidden trap, the server route with the mail fallback', () => {
    assert.doesNotMatch(html + js, /hello@/);
    assert.match(body, /href="https:\/\/upgrads\.de\/datenschutz"/); assert.match(body, /href="https:\/\/upgrads\.de\/impressum"/);
    assert.match(body, /<div class="kn-trap" aria-hidden="true"><label for="kn-website">Website<\/label><input id="kn-website" name="website" type="text" tabindex="-1" autocomplete="off"><\/div>/);
    // the status asked first; a ready server takes the request only while the form is out of view (no label flips in front
    // of the visitor): the button says "Per Mail anfragen" until then
    assert.match(sliceFn(js, 'knInit', REL), /const status = fetch\('\/api\/landing\/status'\)\.then\(r => r\.ok && r\.json\(\)\)\.then\(j => !!j && j\.ready === true, \(\) => false\);\s*status\.then\(knAskApply\);/, 'applied the moment it answers, before the parts (round 12)');
    // round 12: a form already in view switches too, quietly, unless the visitor is typing in it or sending
    assert.match(sliceFn(js, 'knAskApply', REL), /knServer = ready;\s*knReady = ready && knAskState === 'form' && !\(knAskSeen\(\) && knAskTouched\(\)\);\s*knAskRender\(\);/);
    assert.match(sliceFn(js, 'knAskTouched', REL), /if \(f\.contains\(document\.activeElement\)\) return true;\s*return \['name', 'email', 'company', 'message'\]\.some\(/);
    assert.match(body, /<button type="submit" class="kn-btn" id="kn-ask-send" data-kn="kn_f_send_mail">Per Mail anfragen<\/button>/);
    // after a failed delivery: "Nochmal senden", the same request to the server again
    assert.match(body, /<button type="button" class="kn-btn kn-btn-sm" id="kn-ask-retry" hidden data-kn="kn_f_retry">Nochmal senden<\/button>/);
    assert.ok(js.includes("retry.addEventListener('click', () => { knReady = knServer; knAskState = 'form'; knAsk({ preventDefault() {} }); });"));
    assert.ok(js.includes("knId('kn-ask-retry').hidden = knAskState !== 'failed' || !knServer;"), 'round 25: a request that may have arrived is not sent again (it could arrive twice); the mail first');
    assert.match(js, /if \(knReady\) \{[\s\S]{0,600}?const ac = typeof AbortController === 'function' \? new AbortController\(\) : null, cut = ac \? setTimeout\(\(\) => ac\.abort\(\), 15000\) : 0;\s*try \{\s*const r = await fetch\('\/api\/landing\/ask'/, 'round 24: the request gives up after 15 s');
    // (round 24 review) a 502 or 504, or a lost answer while online, may have arrived; a 503 (not_configured), a 4xx or offline sent nothing
    assert.match(sliceFn(js, 'knAsk', REL), /ok = r\.ok;\s*unsure = !ok && \[502, 504\]\.includes\(r\.status\);[^\n]*\n\s*\} catch \(err2\) \{ ok = false; unsure = navigator\.onLine !== false; \}/);
    assert.match(sliceFn(js, 'knAsk', REL), /if \(tried && !ok\) \{ knReady = false; knAskState = unsure \? 'unsure' : 'failed'; knAskRender\(\);/);
    assert.match(js, /knAskState = ok \? 'crm' : 'mail';\s*if \(ok\) knAskSent = true;\s*knAskRender\(\);\s*if \(!ok\) knAskOpenMail\(\);/, 'by mail: the visitor\'s click opens the prepared mail, the text to copy beside it');
    const F = loadFns(REL, ['knWord', 'knAskBad', 'knAskOk', 'knAskBody', 'knAskMailto', 'knAskText'], { state: { knLang: 'de' }, extra: sliceConst(REL, 'KN_I18N') + '\n' + js.match(/^const KN_EMAIL = .*;$/m)[0] });
    for (const e of ['max@firma..de', 'max.@firma.de', '.max@firma.de', 'max@.firma.de', 'max@firma.de.', 'max..x@firma.de', 'max@firma', 'max@@firma.de']) assert.equal(F.knAskBad({ name: 'Max', email: e }).email, true, `${e} is refused`);
    for (const e of ['max.muster@firma.de', 'a@b.co', 'jo+crm@sub.firma.de']) assert.equal(F.knAskBad({ name: 'Max', email: e }).email, false, `${e} passes`);
    assert.equal(F.knAskOk({ name: 'Jo', email: 'jo@firma.de' }), true);
    for (const v of [{ name: 'J', email: 'jo@firma.de' }, { name: 'Jo', email: 'jo@firma' }, { name: 'Jo', email: '' }]) assert.equal(F.knAskOk(v), false);
    const m = F.knAskMailto({ name: 'Jo Kraus', email: 'jo@firma.de', company: 'Firma GmbH' });
    assert.match(m, /^mailto:team@upgrads\.de\?subject=Anfrage%20zu%20Upgrads%20CRM&body=/);
    assert.equal(decodeURIComponent(m.split('body=')[1]), 'Name: Jo Kraus\nE-Mail: jo@firma.de\nFirma: Firma GmbH');
    assert.deepEqual({ ...F.knAskBad({ name: 'B', email: 'b@firma.de' }) }, { name: true, email: false }, 'which field is wrong, each on its own');
    assert.deepEqual({ ...F.knAskBad({ name: 'Basil', email: 'basil@firma' }) }, { name: false, email: true });
    assert.equal(F.knAskText({ name: 'Jo Kraus', email: 'jo@firma.de', company: '' }), 'An: team@upgrads.de\nBetreff: Anfrage zu Upgrads CRM\n\nName: Jo Kraus\nE-Mail: jo@firma.de', 'the text to copy when no mail app opens');
    for (const k of ['name', 'email']) assert.match(body, new RegExp(`aria-describedby="kn-ask-${k}-err"></label>\\n            <p class="kn-err" id="kn-ask-${k}-err" hidden data-kn="kn_f_err_${k}">`), `${k}: its own message`);
    assert.match(sliceFn(js, 'knAskMark', REL), /if \(bad\[k\]\) input\.setAttribute\('aria-invalid', 'true'\); else input\.removeAttribute\('aria-invalid'\);/);
    assert.match(body, /<textarea class="kn-ask-i kn-ask-text" id="kn-ask-text" rows="5" readonly data-kn-aria="kn_f_text"/);
    assert.match(sliceFn(js, 'knAskEdit', REL), /knAskState = 'form'; knAskRender\(\);/, 'back to the form: nothing reset');
    assert.doesNotMatch(js, /\.reset\(\)/, 'the form is never cleared');
    // the optional line on the team and its tools: under the fields, sent as message, in the mail and the text to copy after a blank line
    assert.match(body, /<label class="kn-ask-f" for="kn-ask-message"><span data-kn="kn_f_message">Teamgröße und Werkzeuge \(optional\)<\/span><textarea class="kn-ask-i kn-ask-msg" id="kn-ask-message" name="message" rows="3" maxlength="1000"><\/textarea><\/label>/);
    assert.equal(decodeURIComponent(F.knAskMailto({ name: 'Jo Kraus', email: 'jo@firma.de', company: '', message: '8 Personen, Cal.com' }).split('body=')[1]), 'Name: Jo Kraus\nE-Mail: jo@firma.de\n\nTeamgröße und Werkzeuge:\n8 Personen, Cal.com', 'round 15: the free text under its label');
    assert.match(js, /body: JSON\.stringify\(\{ \.\.\.v, lang: knLang, website: knId\('kn-website'\)\.value \}\)/, 'the server gets it as message (knAskValues)');
    // a delivery the server does not take: said so, the line above the form switches to mail, the mail app and the text
    // offered (opened only by the visitor); nothing claims it was sent
    const ask = sliceFn(js, 'knAsk', REL);
    assert.match(ask, /if \(tried && !ok\) \{ knReady = false; knAskState = unsure \? 'unsure' : 'failed'; knAskRender\(\); knId\('kn-ask-done'\)\.focus\(\); return; \}/);
    assert.doesNotMatch(js, /window\.location\.href = knAskMailto/, 'no mail app is opened by itself: by mail only by the click on "Per Mail anfragen", after a failed delivery only by "Im Mailprogramm öffnen"');
    assert.match(sliceFn(js, 'knAskOpenMail', REL), /const a = knId\('kn-ask-mail'\); if \(a && a\.href\) a\.click\(\);/);
    const render = sliceFn(js, 'knAskRender', REL);
    assert.match(render, /fb\.dataset\.kn = knAskState === 'failed' \? 'kn_f_fallback_fail' : 'kn_f_fallback';/);   // (round 25) „Nochmal senden“ only where nothing was sent
    assert.match(render, /mail\.hidden = !failed && knAskState !== 'mail';\s*knId\('kn-ask-retry'\)\.hidden = knAskState !== 'failed' \|\| !knServer;[^\n]*\s*if \(!mail\.hidden\) mail\.href = knAskMailto\(knAskValues\(\)\);/, 'by mail and after a failure: the link to the mail app, with the request in it');
    assert.match(render, /lead\.dataset\.kn = knReady \? 'kn_c_d' : 'kn_c_d_mail';/);
    assert.match(body, /<a class="kn-btn kn-btn-sm" id="kn-ask-mail" href="mailto:team@upgrads\.de\?subject=Anfrage%20zu%20Upgrads%20CRM" hidden data-kn="kn_f_open_mail">Im Mailprogramm öffnen<\/a><button type="button" class="kn-btn kn-btn-sm kn-btn-ghost" id="kn-ask-copy" data-kn="kn_f_copy">Text kopieren<\/button>/, '"Im Mailprogramm öffnen" first, then "Text kopieren"');
    assert.deepEqual([dict.de.kn_done_mail, dict.en.kn_done_mail], ['Noch nicht gesendet: im Mailprogramm auf Senden klicken.', 'Not sent yet: click Send in your mail app.'], 'by mail the panel says nothing was sent yet');
    assert.match(render, /send\.dataset\.kn = knAskState === 'busy' \? 'kn_f_sending' : knAskSent \? 'kn_f_send_again' : knReady \? 'kn_request' : 'kn_f_send_mail';/, 'by mail the button prepares the mail, it does not claim to send');
    assert.deepEqual([dict.de.kn_f_send_mail, dict.en.kn_f_send_mail], ['Per Mail anfragen', 'Request by email']);
    // "Angaben ändern" in every finished state, "Angekommen …" too (a mistyped address); it only goes back to the form
    assert.match(body, /<\/div>\s*<\/div>\s*<p class="kn-acts"><button type="button" class="kn-reset" id="kn-ask-edit" data-kn="kn_f_edit">Angaben ändern<\/button><a class="kn-a" href="#kn-anfrage" id="kn-ask-steps" data-kn="kn_f_steps">Zur Vorschau<\/a><\/p>\s*<\/div>/, 'the sent request leads back to step 1 (round 23: „Zur Vorschau“, not „send again“)');
    for (const l of ['de', 'en']) assert.ok(Object.values(dict[l]).every(v => !/bleiben im Formular|stay in the form/.test(v)), `${l}: no line about a form that is hidden by then`);
    assert.match(render, /knWord\(knAskState === 'unsure' \? 'kn_done_unsure' : failed \? 'kn_done_fail' : knAskState === 'crm' \? 'kn_done_crm' : 'kn_done_mail'\)\.replace\('\{email\}', knAskValues\(\)\.email\)/);
    assert.match(render, /failed = knAskState === 'failed' \|\| knAskState === 'unsure';[\s\S]*knId\('kn-ask-fallback'\)\.hidden = knAskState !== 'mail' && !failed;/, 'a request that may not have arrived keeps the mail fallback');
    assert.deepEqual([dict.de.kn_done_crm, dict.en.kn_done_crm], ['Angekommen. Die Antwort geht an {email}.', 'Received. The reply goes to {email}.'], 'a delivery names the address; what happens next is the panel\'s kn_next beside it, said once (round 18)');
    assert.equal(dict.de.kn_f_fallback, 'Öffnet sich kein Mailprogramm, den Text kopieren und an team@upgrads.de schicken.');
    assert.deepEqual([dict.de.kn_done_fail, dict.en.kn_done_fail], ['Die Anfrage ist nicht angekommen. Gesendet wurde nichts.', 'The request did not arrive. Nothing was sent.']);
    assert.deepEqual([dict.de.kn_done_unsure, dict.en.kn_done_unsure], ['Die Anfrage ist möglicherweise nicht angekommen. Zur Sicherheit auch per Mail senden.', 'The request may not have arrived. To be safe, send it by email too.'], 'round 24 review: it may have arrived, so the page does not say nothing was sent');
    F.__set('knLang', 'en'); assert.equal(F.knWord('kn_h1'), 'Enquiries, meetings, notes land on the deal for you.'); assert.equal(F.knWord('nope'), 'nope');
  });
});

// ── the stylesheet (sections 01–15: the page's own and the parts') ──────────────────────────────────────────────
function parseCss(src) {
  const rules = []; let i = 0; const stack = [];
  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  while (i < src.length) {
    skipWs(); if (i >= src.length) break;
    if (src[i] === '}') { stack.pop(); i++; continue; }
    const open = src.indexOf('{', i); const selector = src.slice(i, open).trim();
    if (/^@(media|keyframes|supports|container)/.test(selector)) { stack.push(selector); i = open + 1; continue; }
    let depth = 0, close = open;
    for (let j = open; j < src.length; j++) { if (src[j] === '{') depth++; if (src[j] === '}') { depth--; if (depth === 0) { close = j; break; } } }
    const inner = src.slice(open + 1, close);
    if (/\{/.test(inner)) { stack.push(selector); i = open + 1; continue; }
    const decls = inner.split(/;(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(d => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });
    rules.push({ selector, decls, in: stack.join(' > ') });
    i = close + 1;
  }
  return rules;
}
const rules = parseCss(bare);
const classesIn = s => [...s.matchAll(/\.((?:kn|is)-[a-zA-Z0-9-]+)/g)].map(m => m[1]);
const cssClasses = new Set(rules.flatMap(r => r.in.includes('@keyframes') ? [] : classesIn(r.selector)));
const usedClasses = new Set(['kn-piece']);   // knPiece draws .kn-piece and .kn-piece-<each class it is given>
for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/['"` ]((?:kn|is)-[a-z0-9-]+)(?=['"` .,)\]>])/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/knPiece\([^;]*?, '([a-z -]+)'\)/g)) m[1].split(' ').forEach(c => usedClasses.add('kn-piece-' + c));
for (const t of ['page', ...val('KN_TABS')]) usedClasses.add('kn-piece-' + t);   // the day's piece: `page ${F.W.page}`

describe('stylesheet discipline and the audit', () => {
  const tok = n => bare.match(new RegExp(`--kn-${n}: (#[0-9A-Fa-f]{6});`))[1];
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  test('every control\'s outline is 3:1 or better on every ground it sits on (the source chips, the picks, the tabs, the ghost buttons, the language switch, the form fields)', () => {
    for (const g of ['paper', 'card']) assert.ok(ratio(tok('ink-3'), tok(g)) >= 3, `--kn-ink-3 on --kn-${g}: ${ratio(tok('ink-3'), tok(g)).toFixed(2)}`);   // (round 26) paper and the white card
    for (const sel of ['.kn-src', '.kn-tab', '.kn-ask .kn-ask-i']) {   // (round 26) the language is a plain link now, no outline
      const r = rules.find(x => x.selector === sel && !x.in);
      assert.ok(r && r.decls.some(([p, v]) => (p === 'border' || p === 'border-color') && /var\(--kn-ink-3\)/.test(v)), `${sel}: its outline is --kn-ink-3`);
    }
    // round 16: the second action is an underlined word, no box (round 26: in ink-2, their link button)
    const ghost = rules.find(x => x.selector === '.kn-btn.kn-btn-ghost' && !x.in), gd = p => (ghost.decls.find(([a]) => a === p) || [])[1];
    assert.ok(ghost && gd('color') === 'var(--kn-ink-2)' && gd('text-decoration') === 'underline' && gd('background') === 'transparent', '.kn-btn-ghost: an underlined word');
  });
  test('an invalid field has its own error tone, 4.5:1 or better on every ground, after the field\'s own rule; its message in the same tone', () => {
    for (const g of ['paper', 'card']) assert.ok(ratio(tok('alert'), tok(g)) >= 4.5, `--kn-alert on --kn-${g}: ${ratio(tok('alert'), tok(g)).toFixed(2)}`);
    const i = rules.findIndex(r => r.selector === '.kn-ask .kn-ask-i' && !r.in), bad = rules.findIndex(r => r.selector === '.kn-ask .kn-ask-i[aria-invalid="true"]' && !r.in);
    assert.ok(i >= 0 && bad > i, 'the error rule comes after the field\'s own (same specificity plus the attribute)');
    assert.deepEqual(rules[bad].decls, [['border-color', 'var(--kn-alert)'], ['background', 'var(--kn-alert-bg)']]);   // (round 26) their error field
    assert.ok(rules.some(r => r.selector === '.kn-err' && r.decls.some(([p, v]) => p === 'color' && v === 'var(--kn-alert)')));
  });
  test('one ground (design round 8): no second band, no glow, no blur; small text 4.5:1 and outlines 3:1 on the ground and on the request\'s panel', () => {
    assert.doesNotMatch(bare, /--kn-blue|kn-sec-blue|radial-gradient|backdrop-filter/);
    for (const k of ['ink-2', 'ink-3', 'accent', 'alert']) assert.ok(ratio(tok(k), tok('paper')) >= 4.5, `--kn-${k} on --kn-paper: ${ratio(tok(k), tok('paper')).toFixed(2)}`);   // (round 26) one ground: paper
    for (const k of ['ink-2', 'ink-3', 'alert']) assert.ok(ratio(tok(k), tok('card')) >= 4.5, `--kn-${k} on --kn-card: ${ratio(tok(k), tok('card')).toFixed(2)}`);
    assert.ok(ratio(tok('card'), tok('accent')) >= 4.5 && ratio(tok('sky'), tok('paper')) < 3, 'white on the accent 4.5:1; the sky below 3:1 on paper, so it is only ever a fill');
  });
  test('a jump lands on its station (round 26): the station\'s own top is the header\'s room; the spine\'s numerals 3:1', () => {
    // (round 26, alphaiota restyle; dark-design pins retired: scroll-padding-top 96 / 136 for the one- and two-row header,
    // a part's 16 px margin) — every station keeps 96 px above its content (72 for the nav, 24 of air) and snaps to its top
    assert.ok(rules.some(r => r.selector === '.kn-head' && !r.in && r.decls.some(([p, v]) => p === 'height' && v === 'var(--kn-nav)')) && /--kn-nav: 72px;/.test(bare));
    assert.ok(rules.some(r => r.selector === 'html.kn-root' && !r.in && r.decls.some(([p, v]) => p === 'scroll-padding-top' && v === '0')) && rules.some(r => r.selector === '.kn-st' && !r.in && r.decls.some(([p, v]) => p === 'scroll-snap-align' && v === 'start')));
    assert.ok(rules.some(r => r.selector === '.kn-st [data-kn-head]' && r.decls.some(([p, v]) => p === 'scroll-margin-top' && v === '96px')), 'a skip link\'s heading lands below the nav');
    assert.ok(ratio(tok('ink-3'), tok('paper')) >= 3, `a numeral not yet reached on paper: ${ratio(tok('ink-3'), tok('paper')).toFixed(2)}`);
    assert.ok(rules.some(r => r.selector === '.kn-stop-n' && !r.in && r.decls.some(([p, v]) => p === 'box-shadow' && v === 'inset 0 0 0 1.5px var(--kn-ink-3)')));
  });
  test('no facts list of its own; the needs and limits as two ledgers; the start\'s four steps take the spine, laid flat (one rule through four quiet stops; down the left from 1100 px)', () => {
    assert.doesNotMatch(body, /kn-kv|kn-facts-t|data-kn="kn_k\d"/);
    assert.ok(rules.some(r => r.selector === '.kn-step-n' && !r.in && r.decls.some(([p, v]) => p === 'background' && v === 'var(--kn-accent)')));   // (round 26, alphaiota restyle; dark-design pin retired): the start's numbers in accent squares, no rule through them
    // the needs and limits: two ledgers, a term in the wide cut beside its sentence
    assert.equal((body.match(/<dl class="kn-ledger( kn-ledger-not)?" aria-labelledby="kn-(need|not)-t">/g) || []).length, 2);
    assert.equal((body.match(/<div class="kn-ledger-r"><dt data-kn="kn_(need|not)\d_k">[^<]+<\/dt><dd data-kn="kn_(need|not)\d">/g) || []).length, 7, 'thinned (round 12): the browser line went; round 19: Microsoft in its own plan row; round 21: the Notetaker limit joined it'); assert.match(body, /<dl class="kn-ledger kn-ledger-plan" aria-labelledby="kn-plan-t">/);
    assert.ok(rules.some(r => r.selector === '.kn-ledger-r' && !r.in && r.decls.some(([p, v]) => p === 'grid-template-columns' && v === '152px minmax(0, 1fr)')));
    for (const [k, re] of [['kn_st3_d', /^Per Einladungscode\. Deutsch oder Englisch, frei wählbar\.$/], ['kn_a4', /deutschen oder englischen Spaltennamen/]]) assert.match(dict.de[k], re, `${k}: the facts folded in`);
    assert.equal(dict.de.kn_st2_d, 'Vom Upgrads-Team, mit Pipelines und Feldern.', 'the filler about several workspaces gone (polish round; round 15 copy)');
  });
  test('one change of pace: the day is compact, its heading and its tabs on one row, less air (stacked from 1100 px)', () => {
    assert.ok(rules.some(r => r.selector === '.kn-day-head > .kn-h2' && r.decls.some(([p, v]) => p === 'grid-column' && v === '1 / -1')));   // (round 26, alphaiota restyle; dark-design pin retired): the day is a station; its heading on its own row
    assert.ok(rules.some(r => r.selector === '.kn-day-head' && !r.in && r.decls.some(([p, v]) => p === 'grid-template-columns' && v === 'minmax(0, 1fr) auto')));   // (round 26 review) the heading on its own row, the tabs and the request under it
    assert.ok(rules.some(r => r.in === '@media (max-width: 1100px)' && r.selector === '.kn-day-head' && r.decls.some(([p, v]) => p === 'grid-template-columns' && v === 'minmax(0, 1fr)')));   // (round 26) stacked from 1100 px
  });
  test('small controls are 32 px tall at least ("Von vorn", the language switch), the small buttons 40', () => {
    const h = sel => { const r = rules.find(x => x.selector === sel && !x.in); const d = r && r.decls.find(([p]) => p === 'min-height'); return d ? parseInt(d[1], 10) : 0; };
    assert.ok(h('.kn-reset') >= 32 && h('.kn-lang-btn') >= 32 && h('.kn-btn-sm') >= 40, `${h('.kn-reset')} / ${h('.kn-lang-btn')} / ${h('.kn-btn-sm')}`);
  });
  test('one ground down the page (round 26: paper); the fold: the hero station holds the claim and the request, step 1\'s whole frame within its station at 1366 x 768', () => {
    // (round 26, alphaiota restyle; dark-design pins retired: the navy bands, the lower half's own step lighter, the
    // 316 px fold with part 1's frame on the first screen) — the user chose full-screen stations: the first CRM screen
    // is one station down, a decided trade-off
    for (const sel of ['.kn-hero', '.kn-st', '.kn-fit', '.kn-start', '.kn-faq', '.kn-close']) assert.ok(!rules.some(r => r.selector === sel && r.decls.some(([p]) => p === 'background' || p === '--kn-ground')), `${sel}: on the one paper`);
    assert.doesNotMatch(body, /kn-sec-blue/);
    assert.ok(rules.some(r => r.selector === 'html.kn-big .kn-hero' && r.decls.some(([p, v]) => p === 'padding-top' && v === 'max(37svh, 280px)')), 'the hero\'s card from max(37svh, 280px) (round 27: the claim larger): its request ends at 582 px of a 1366 x 657 window, 586 of 768 (scratchpad/r26/hero.js)');
    assert.match(body, /<section class="kn-st kn-hero" id="kn-hero" aria-labelledby="kn-h1">[\s\S]*?<h1 class="kn-h1" id="kn-h1"[\s\S]*?<a class="kn-btn" href="#kn-ask" data-kn="kn_request">/, 'the hero station: the claim, then the request');
    assert.ok(rules.some(r => r.selector === '.kn-st' && !r.in && r.decls.some(([p, v]) => p === 'min-height' && v === '100svh') && r.decls.some(([p, v]) => p === 'padding' && /^96px .* 32px /.test(v))) && 96 + 470 + 32 <= 768, 'step 1\'s frame (470) inside its station: 96 + 470 + 32 of 768');
  });
  test('the look (round 16): almost square page, round app; sky the one accent (the thread, its dots, the main action); one family by weight', () => {
    assert.doesNotMatch(bare, /border-radius: 999px/, 'no pills');
    assert.ok(rules.some(r => r.selector === '.kn-btn' && !r.in && r.decls.some(([p, v]) => p === 'background' && v === 'var(--kn-accent)') && r.decls.some(([p, v]) => p === 'border-radius' && v === '2px')), 'the main action filled with the accent, square (round 26: Upgrads blue)');
    assert.ok(rules.some(r => r.selector === '.kn-piece' && r.decls.some(([p, v]) => p === 'border-radius' && v === '12px')), 'the app\'s pieces keep their round corners');
    const sky = rules.filter(r => !r.in.includes('@keyframes') && r.decls.some(([, v]) => /var\(--kn-sky\)/.test(v)) && r.selector !== 'html.kn-root');
    for (const r of sky) assert.ok(r.decls.every(([p, v]) => !/var\(--kn-sky\)/.test(v) || p === 'background' || p === 'outline'), `the sky only as a fill (round 26: 1.65:1 on paper): ${r.selector}`);
    assert.doesNotMatch(bare, /font-stretch/, 'no width axis: weight carries the hierarchy');
    assert.ok(rules.some(r => r.selector === '.kn-h1, .kn-h2' && !r.in && r.decls.some(([p, v]) => p === 'font-weight' && v === '300') && r.decls.some(([p, v]) => p === 'letter-spacing' && v === '-.022em')), 'their light headlines: the claim and the headings at 300, -.022em (round 26; it was 400 and 600)');
    // the deal's clock: the rule solid within a day, dashed where days pass (2 to 3, 3 to 4), sky once reached; a numeral
    // rides along above 900 px (sticky: layout, nothing moves by itself)
    assert.doesNotMatch(bare, /repeating-linear-gradient/, 'round 15: the rule says reached or not, no dashes to decode');
  });
  test('phones (design round 8): each frame about one phone screen, its height in the stylesheet before the script runs; half the air', () => {
    const at600 = sel => { const r = rules.find(x => x.selector === sel && x.in === '@media (max-width: 600px)'); const d = r && r.decls.find(([p]) => p === '--kn-h'); return d ? +d[1] : null; };
    const hm = n => val(`KN_PARTS.find(p => p.name === '${n}').hm`);
    // part 1 grows with Letzte Leads (polish round: no scroll inside the page's scroll where the app's card has none); the
    // others hold one of the app's own scrollers (a record window, a dialog, the monitor's table, the contacts list)
    const want = { anfrage: ['.kn-frame.kn-a-frame', 704], termin: ['.kn-frame.kn-rec-book', 640], notiz: ['.kn-frame.kn-notiz-frame', 660], abschluss: ['.kn-frame.kn-e-frame', 600], day: ['.kn-day .kn-frame', 400] };   // round 15: shorter crops; round 17: step 4 and the day from lower floors, their pieces growing to their content
    for (const [n, [sel, h]] of Object.entries(want)) { assert.equal(hm(n), h, `${n} on a phone: ${hm(n)}`); assert.equal(at600(sel), h, `${sel}: the same height before the script runs`); if (n !== 'anfrage') assert.ok(h <= 760); }
    assert.ok(Object.values(want).reduce((a, [, h]) => a + h, 0) <= 3630, '3020 px of frame on a phone at the floors (round 17; 3220 in round 15, 3828 in the polish round, 4140 in round 7)');
    assert.deepEqual(val('KN_DAY_SIZE').contacts, [600, 600, 400],   // (round 27) each tab its own desktop height again; the station grows
      'Kontakte on narrow screens 600, on a phone from 480 (round 17), growing to its five rows'); assert.ok(['chat', 'calendar'].every(t => val('KN_DAY_GROW').includes(t)), 'round 17: the chat and the week grow to their content on a phone too');
    assert.ok(rules.some(r => r.selector === '.kn-frame.kn-narrow .kn-piece-logs' && r.decls.some(([p, v]) => p === 'max-height' && v === 'none') && r.decls.some(([p, v]) => p === 'overflow' && v === 'visible')), 'Letzte Leads: as tall as its entries, no scroll of its own');
    assert.ok(!rules.some(r => r.selector === '.kn-ask-panel' && r.decls.some(([p, v]) => p === 'border-radius' && v !== '2px')), 'the request panel keeps 2 px corners on phones (polish round: no 20 px)');
    assert.ok(rules.some(r => r.in === '@media (pointer: coarse)' && r.selector === '.kn-lang-btn, .kn-reset, .kn-back, .kn-login' && r.decls.some(([p, v]) => p === 'min-height' && v === '44px')), 'on touch the language keys, "Von vorn", the way back and "Inhalt" are 44 px tall (round 16 review)');
  });
  test('the polish round: a card names its jump to step 3; the text filter stays in the frame; a skip link to step 1; the screen\'s own words; waiting buttons quiet', () => {
    // a deal card outside the deal's home: its name and a tag on hover and focus say it opens in step 3 (knRouteDeal)
    const inert = sliceFn(js, 'knInertify', REL);
    assert.match(inert, /if \(!F\.part\.deal\) for \(const c of F\.root\.querySelectorAll\('\.dcard\[data-id\]'\)\) \{/);
    assert.match(inert, /c\.dataset\.knHint = knWord\('kn_jump_tag'\);\s*c\.setAttribute\('aria-label', c\.dataset\.knLabel \? `\$\{c\.dataset\.knLabel\}, \$\{c\.dataset\.knHint\}` : c\.dataset\.knHint\);/);
    assert.deepEqual([dict.de.kn_jump_tag, dict.en.kn_jump_tag], ['In Schritt 3 öffnen', 'Open in step 3']);
    assert.ok(rules.some(r => r.selector === '.kn-stage .dcard[data-kn-hint]:hover::after, .kn-stage .dcard[data-kn-hint]:focus-visible::after' && r.decls.some(([p, v]) => p === 'content' && v === 'attr(data-kn-hint)')));
    assert.deepEqual(val("KN_PARTS.filter(p => p.deal).map(p => p.name)"), ['notiz'], 'the deal\'s home is step 3, as the tag says');
    // the contacts' text filter placed as ui.popover places it: inside the frame, above the chip when there is no room under it
    const pop = sliceFn(js, 'knPopOpen', REL);
    assert.match(pop, /mw = m\.offsetWidth \|\| width \|\| 0/);
    assert.match(pop, /if \(top \+ mh > F\.h - 8\) top = Math\.max\(8, ay - mh - 6\);\s*m\.style\.left = `\$\{Math\.max\(8, Math\.min\(ax, F\.w - mw - 8\)\)\}px`;/);
    assert.match(read('public/js/core.js'), /left = Math\.max\(8, Math\.min\(left, innerWidth - w - 8\)\);/, 'the app clamps the same way');
    // a skip link past the header to step 1, the first link on the page
    assert.match(body, /<a class="kn-skip kn-skip-top" href="#kn-a-t" data-kn="kn_skip1">Weiter zu Schritt 1<\/a>\s*<header class="kn-head">/);
    assert.ok(rules.some(r => r.selector === '.kn-skip-top:focus-visible' && r.decls.some(([p, v]) => p === 'position' && v === 'fixed')));
    // the frame's name in the screen's own word ("Empfangene Leads", intg_activity_title)
    assert.ok(dict.de.kn_f_anfrage.includes(app.de.intg_activity_title) && dict.en.kn_f_anfrage.includes(app.en.intg_activity_title.toLowerCase()));
    assert.ok(Object.values(dict.de).every(v => !/Letzte Leads/.test(v)));
    // a waiting button: a quiet outline in the reading tone, not 55% white
    assert.ok(rules.some(r => r.selector === '.kn-btn:disabled, .kn-btn:disabled:hover' && r.decls.some(([p, v]) => p === 'color' && v === 'var(--kn-ink-3)') && r.decls.some(([p, v]) => p === 'background' && v === 'var(--kn-line)')));   // (round 26)
    assert.ok(!rules.some(r => /\.kn-btn:disabled/.test(r.selector) && r.decls.some(([p]) => p === 'opacity')));
  });
  test('round 11: fine print 15 px; the mail path in the start; step 3 never a dead end; "Upgrads-Team" once per block; one preview line', () => {
    const fs = sel => { const r = rules.find(x => x.selector === sel && !x.in); const d = r && r.decls.find(([p]) => p === 'font-size'); return d ? parseInt(d[1], 10) : 0; };
    const fsz = sel => { const r = rules.find(x => x.selector === sel && !x.in && x.decls.some(([q]) => q === 'font-size')); const d = r && r.decls.find(([q]) => q === 'font-size'); return d ? d[1] : ''; };
    for (const sel of ['.kn-fine', '.kn-sample', '.kn-ask-f', '.kn-err', '.kn-foot', '.kn-e-sub-t']) assert.ok(/rem$/.test(fsz(sel)) && parseFloat(fsz(sel)) >= .875, `${sel}: ${fsz(sel)}`);   // (round 26, alphaiota restyle; dark-design pin retired): their small print .875rem (14 px), not 15
    assert.equal(dict.de.kn_st1_d, 'Unten im Formular.');   // round 17 copy: the request says "Name und E-Mail genügen" assert.match(body, /id="kn-ask-form"[\s\S]*?team@upgrads\.de/, 'round 15 copy: the address beside the form');
    assert.deepEqual([dict.de.kn_n_off, dict.de.kn_n_rebook], ['Kein Termin mit Notetaker', 'In Schritt 2 mit Notetaker buchen']);
    const sync = sliceFn(js, 'knNotizSync', REL);
    assert.match(sync, /b\.disabled = !c\.rec \|\| c\.done;/); assert.match(sync, /if \(again\) again\.hidden = !c\.jonas \|\| c\.rec \|\| c\.done;/);
    assert.match(body, /<div class="kn-n-why" id="kn-notiz-why" hidden><p class="kn-fine" data-kn="kn_n_none">[^<]+<\/p><button type="button" class="kn-btn kn-btn-sm kn-btn-ghost" id="kn-notiz-rebook" hidden data-kn="kn_n_rebook">/);
    for (const sec of body.split(/<section /).slice(1)) assert.ok((sec.replace(/<[^>]+>/g, ' ').match(/Upgrads-Team/g) || []).length <= 1, 'at most one "Upgrads-Team" per block');
    assert.equal((body.match(/class="kn-sample"/g) || []).length, 1, 'one preview line');
    assert.match(body, /<div class="kn-frame kn-a-frame" id="kn-f-anfrage" role="region" aria-describedby="kn-sample"[^>]*><\/div>\s*<p class="kn-sample" id="kn-sample" data-kn="kn_sample">Echte Oberfläche/, 'a caption on step 1\'s frame (round 12; round 15 copy)');
  });
  test('round 12: the touch tag, the inert hint, the mats, the ledger break, readable body text, step 4 in about 50 words, the Notetaker nudge, the honest board, lazy frames', () => {
    const at = (sel, media) => rules.find(r => r.selector === sel && (r.in || '') === (media || ''));
    const decl = (r, p) => { const d = r && r.decls.find(([a]) => a === p); return d ? d[1] : null; };
    assert.equal(decl(at('.kn-stage .dcard[data-kn-hint-one]::after', '@media (hover: none)'), 'content'), 'attr(data-kn-hint)', 'on touch the tag "In Schritt 3 öffnen" is always shown, on one card per board (round 13)');
    assert.equal(decl(at('.kn-stage .kn-inert'), 'text-decoration'), 'underline dotted', 'every inert control the same quiet hint, its colour (and contrast) unchanged');
    assert.equal(decl(at('.kn-frame'), 'box-shadow'), null, 'round 16: no mat behind a frame (fewer boxes), its pieces inside one hairline each');
    assert.doesNotMatch(bare, /--kn-mat/);
    assert.equal(decl(at('.kn-fit-col .kn-h3'), 'font-size'), '1.125rem', 'the ledger\'s two heads: their item heading (round 26)');
    for (const sel of ['.kn-p', '.kn-ledger dd']) assert.ok(decl(at(sel), 'font-size') === '1.0625rem' && decl(at(sel), 'color') === 'var(--kn-ink-2)',   // (round 26) their reading text: 17 px in ink-2
      `${sel}: 16 px or more, the brighter tone`);
    assert.equal(decl(at('.kn-p'), 'color'), 'var(--kn-ink-2)');   // (round 26) the answers are reading text: ink-2
    const e4 = ['kn_e_t', 'kn_e_opt_t', 'kn_cue4', 'kn_e_opt', 'kn_e_see', 'kn_e_do'].reduce((a, k) => a + words(dict.de[k]), 0);
    assert.ok(e4 <= 62 && !/[()]/.test(dict.de.kn_e_opt + dict.de.kn_e_see), `step 4 in about 50 words, no brackets (${e4})`);
    assert.match(body, /<button type="button" class="kn-btn kn-btn-sm" id="kn-abschluss-rest" disabled data-kn="kn_e_rest">Ein paar Tage später<\/button>/, '„Ein paar Tage später“ the Engine block\'s main button (round 13: alone; round 22: its label)'); assert.doesNotMatch(body, /kn-abschluss-next/);
    assert.match(sliceFn(js, 'knTerminNudge', REL), /const want = !!B\.picked && !B\.record && B\.nt === 'ok';[\s\S]*if \(want && was\) \{[\s\S]*?if \(row\) \{ knBookReveal\(F, `#\$\{F\.p\}b-cal-book-record`, true\); knFlash\(F, row\); \} \}/, 'a time picked without Notetaker: the line, and the checkbox ringed once; nothing ticked for the visitor');
    assert.doesNotMatch(sliceFn(js, 'knTerminNudge', REL), /B\.record = true|checked = true/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*?\.kn-stage \.kn-flash, \.kn-stage \.kn-flash\.kn-flash-out, \.kn-stage \.kn-piece\.kn-flash\.kn-flash-out, \.kn-acts \.kn-flash, \.kn-acts \.kn-flash\.kn-flash-out \{ box-shadow: 0 0 0 3px var\(--kn-accent\); transition: none; \}/, 'reduced motion: the flash is a still ring, no fade (round 14: the page\'s own controls too; round 26: in the accent)');
    assert.equal(dict.de.kn_t_nt, 'Für die Notiz in Schritt 3 „Mit Notetaker aufzeichnen“ anhaken.');
    assert.match(sliceFn(js, 'knAnfrageSend', REL), /knAnfragePending\(F\);/, 'a source click: the entry in Letzte Leads, and "Deals neu laden" waits');
    assert.doesNotMatch(sliceFn(js, 'knAnfrageSend', REL), /dcard/, 'no card appears on the board by itself (auth.js:543: the app shows it on the next load)');
    assert.match(sliceFn(js, 'knAnfrageReload', REL), /F\.W\.boardIds = new Set\(F\.W\.deals\.map\(d => d\.id\)\);/);
    assert.deepEqual([dict.de.kn_a_reload, dict.en.kn_a_reload], ['Board neu laden', 'Reload the board'], 'a plain label (round 14); where the deal will be is said beside it while one waits');
    assert.equal(dict.de.kn_a_next, 'Der Deal erscheint beim nächsten Laden in „Neu“.');
    assert.ok(!('kn_a_reload_d' in dict.de));
    assert.match(sliceFn(js, 'knPaint', REL), /if \(F\.lazy\) return knWake\(F\);/, 'a frame not drawn yet is drawn whole when anything paints into it');
    assert.match(sliceFn(js, 'knShow', REL), /knWake\(T\);/, 'or when a jump leads to it');
    assert.match(sliceFn(js, 'knDayFit', REL), /if \(!F\.narrow \|\| !KN_DAY_GROW\.includes\(F\.W\.page\)\) return;/);
    assert.deepEqual(val('KN_DAY_GROW'), ['contacts', 'tasks', 'calendar', 'chat', 'analytics', 'settings'], 'phones: the tabs that can grow to their content do (round 14: Kontakte and Aufgaben let out of their scrollers)');
  });
  test('round 13: the vendor line near the top, one zoom with no frame over 620, one line and one row of controls per part, quiet "Von vorn", step 3 in one click, the note named by its event type, Kontakte by keyboard, one touch tag per board, no mat on phones', () => {
    const at = (sel, media) => rules.find(r => r.selector === sel && (r.in || '') === (media || ''));
    const decl = (r, p) => { const d = r && r.decls.find(([a]) => a === p); return d ? d[1] : null; };
    // [1] beside the button, under the fit line, 15 px in mute
    assert.deepEqual([decl(at('.kn-hero-fact'), 'font-size'), decl(at('.kn-hero-fact'), 'color')], ['.875rem', 'var(--kn-ink-3)'], 'round 26: their note');
    assert.match(body, /<p class="kn-fact"><span data-kn="kn_who">Upgrads nutzt es selbst täglich\. Ansprechpartner: Basilius Peetz\.<\/span>/);
    // [2] every desktop frame 620 high at most (the day's tabs too), one scale; step 3 the bell and the note's timeline
    const P = name => val(`(P => ({ w: P.w, h: P.h, hm: P.hm }))(KN_PARTS.find(p => p.name === ${JSON.stringify(name)}))`);
    for (const n of ['anfrage', 'termin', 'notiz', 'abschluss']) assert.ok(P(n).h <= 620, `${n}: ${P(n).h}`);
    assert.ok(Object.values(val('KN_DAY_SIZE')).every(([h]) => h <= 620), 'the day\'s tabs');
    assert.equal(run('KN_MAX_S'), 1);
    assert.equal(decl(at('.kn-notiz-frame [data-kn-layer="record"] .dd-compose'), 'display'), 'none');
    assert.deepEqual([decl(at('.kn-notiz-frame'), '--kn-bell-h'), decl(at('.kn-notiz-frame.kn-narrow'), '--kn-bell-h')], ['168px', '232px']);
    // [3] [4] one instruction line, then one row of the part's controls with "Von vorn" last, unseen until the part changes
    for (const n of ['anfrage', 'termin', 'notiz', 'abschluss', 'day']) assert.match(body, new RegExp(`<button type="button" class="kn-reset" id="kn-${n}-reset" data-kn="kn_again">Von vorn<\\/button>(<\\/p>|\\s*<\\/div>)`), `${n}: "Von vorn" last in its row`);
    assert.equal((body.match(/<p class="kn-acts">/g) || []).length + (body.match(/<div class="kn-acts">/g) || []).length, 7);   // round 19: step 1's row a div (its sources inside); round 21: the sent request's row; round 22: the Engine's block
    assert.equal(decl(at('.kn-reset.kn-idle'), 'visibility'), 'hidden');
    assert.match(sliceFn(js, 'knWirePage', REL), /^function knWirePage\(\) \{\s*knIdleWire\(\);/);
    assert.match(sliceFn(js, 'knReset', REL), /knIdle\(F\.part\.name, true\);/);
    assert.match(sliceFn(js, 'knIdleWire', REL), /for \(const type of \['click', 'input', 'change', 'pointerup'\]\) host\.addEventListener\(type, wake\);/);
    assert.doesNotMatch(body, /kn-abschluss-next|id="kn-own"|class="kn-pick"|data-kn="kn_a_reload_d"|data-kn="kn_t_self"/);
    // [5] step 3: the sample's note waits in the bell; the open timeline as loaded
    assert.match(sliceFn(js, 'knNotizSync', REL), /b\.hidden = !!F\.W\.own \|\| !\(c\.rec \|\| c\.done\);/);   // (round 25) no resting button while the reason shows
    assert.match(sliceFn(js, 'knNotizEndIn', REL), /F\.W\.record\.stale = \(F\.W\.record\.stale \|\| \[\]\)\.concat\(note\.id\);/);
    // [6] the note's title by the booked event type
    assert.match(sliceFn(js, 'knNoteArrive', REL), /const ty = KN_CAL\.event_types\.find\(x => x\.id === m\.calcom_event_type_id\) \|\| KN_INTRO;/);
    assert.match(sliceFn(js, 'knNoteArrive', REL), /body: knNoteTitle\('de', ty\)/);
    // [7] the reply
    assert.match(sliceFn(js, 'knChatSend', REL), /content: 'Gesehen, ich melde mich gleich\.'/);
    // [8]–[13] the words
    assert.ok(!('kn_a_d' in dict.de), 'round 19: no line under step 1\'s heading repeating it');
    for (const k of ['kn_n_t', 'kn_e_opt']) assert.doesNotMatch(dict.de[k], /^Kein(e|en)? [^:]+:/, k);
    assert.doesNotMatch(Object.values(dict.en).join('\n'), /sales lead/i);
    assert.deepEqual([dict.de.kn_day_t, dict.en.kn_day_t], ['Kontakte, Aufgaben, Termine und Zahlen an einem Ort.', 'Contacts, tasks, meetings and numbers in one place.'], 'round 15 (honesty): not "no second tool"; round 17 review: no count; round 24 review: it names what the tabs hold');
    assert.deepEqual([dict.de.kn_e_opt_why, dict.en.kn_e_opt_why], ['Zusatzdienst, fürs CRM nicht nötig', 'An add-on, not required']);
    assert.match(dict.de.kn_e_see, /und seinen Drive-Ordner\.$/, 'round 15: plain; round 22: what the Engine block\'s frame shows, the status and the Drive folder');
    // [15] Kontakte by keyboard
    assert.match(sliceFn(js, 'knCtKeys', REL), /\.contacts-main \.contact-name-link\[data-kr="open"\], \.contacts-main \.editable-cell\[data-kr="cell-edit"\]/);
    assert.match(sliceFn(js, 'knCtKeys', REL), /el\.tabIndex = 0;\s*el\.setAttribute\('role', 'button'\);/);
    assert.match(sliceFn(js, 'knCtListKey', REL), /if \(!el \|\| e\.target !== el \|\| \(e\.key !== 'Enter' && e\.key !== ' '\)\) return false;\s*e\.preventDefault\(\);\s*el\.click\(\);/);
    // [16] one tag per board on touch
    assert.match(sliceFn(js, 'knInertify', REL), /const one = F\.root\.querySelector\('\.dcard\[data-kn-hint\]\[data-id="120"\]'\) \|\| F\.root\.querySelector\('\.dcard\[data-kn-hint\]'\);/);
    assert.equal(decl(at('.kn-stage .dcard[data-kn-hint]::after', '@media (hover: none)'), 'content'), '""', 'round 27: on touch a quiet mark on every routed card, the words on the board\'s first (round 15 had the words on every card)');
    // [17] no mat ring at the phone gutter (round 16: no mat on any width)
    assert.equal(decl(at('.kn-frame'), 'box-shadow'), null); assert.equal(decl(at('.kn-frame', '@media (max-width: 600px)'), 'box-shadow'), null);
  });
  test('round 14: a known address in step 1, the head of sales\' gain as a link, the Engine in one sentence, plain labels, phones without a scroller inside the scroll, the reload with the first lead, a mark on every routed card, never below 1:1, the parts sharing the visitor\'s actions, honest invite-only words, 16 px text', () => {
    const at = (sel, media) => rules.find(r => r.selector === sel && (r.in || '') === (media || ''));
    const decl = (r, p) => { const d = r && r.decls.find(([a]) => a === p); return d ? d[1] : null; };
    // [1] the second Make lead is Sabine Wolf, already in the sample: knLeadArrive updates her contact
    assert.deepEqual(val('KN_LEADS.make[1]'), { name: 'Sabine Wolf', email: 's.wolf@wolf-soehne.de', phone: '+49 171 5550199', source: 'Make', company: 'Wolf & Söhne KG', custom: { branche: 'Handwerk', website: 'https://wolf-soehne.de', dachflaeche: '420' } }, 'round 15 review: her fields in the payload, so the app\'s rule loses nothing');
    const r = JSON.parse(run(`(() => { const A = knFake('anfrage'); const n = A.W.contacts.length; knLeadArrive(A.W, 'make', 0, 1); const c = A.W.contacts.filter(x => x.email === 's.wolf@wolf-soehne.de'); return JSON.stringify({ added: A.W.contacts.length - n, ids: c.map(x => x.id), phone: c[0].phone }); })()`));
    assert.deepEqual(r, { added: 0, ids: [62], phone: '+49 171 5550199' }, 'updated, not added twice');
    assert.match(body, /<p class="kn-fine kn-a-dup" id="kn-anfrage-dup" hidden><span data-kn="kn_a_dup">Sabine Wolf war schon im CRM: [^<]+<\/span> <a class="kn-a kn-a-line" href="#kn-day" id="kn-anfrage-dup-go" data-kn="kn_a_dup_go">In Kontakte ansehen<\/a><\/p>/);
    // [2] the head of sales' gain first in the fit line, its words a link to Analysen
    assert.ok(!js.includes('knHeroAnalytics') && !body.includes('kn-hero-an'), 'round 19: the hero\'s Analysen link went with its fit line');
    // [3] the Engine in one sentence; the fast-forward named
    assert.ok(!('kn_e_what' in dict.de), 'round 19: the Engine\'s box in two lines');
    assert.ok(!('kn_e_days' in dict.de), 'round 22: „Ein paar Tage später“ says the days itself');
    // [5] phones: the record window and the day's lists grow; no !important needed (the app's layout rows give no box)
    assert.equal(decl(at('.kn-notiz-frame.kn-narrow [data-kn-layer="record"] .modal-body'), 'overflow'), 'visible');
    assert.equal(decl(at('.kn-frame.kn-narrow .kn-piece-contacts .page-contacts-layout, .kn-frame.kn-narrow .kn-piece-tasks .page-tasks-layout'), 'display'), 'contents');
    assert.match(sliceFn(js, 'knNotizFit', REL), /const m = knQ\(F, '\[data-kn-layer="record"\] \.dd-modal'\), h = m \? Math\.ceil\(m\.offsetTop \+ m\.offsetHeight\) : 0;/);
    assert.match(sliceFn(js, 'knPaint', REL), /knFit\(F\);/);
    // [6] the reload unseen until a lead, then ringed once; the arrival said
    assert.match(body, /id="kn-anfrage-reload" hidden disabled data-kn="kn_a_reload">Board neu laden<\/button><span class="kn-fine" id="kn-anfrage-next" hidden data-kn="kn_a_next">/);
    assert.match(sliceFn(js, 'knAnfragePending', REL), /b\.hidden = !F\.W\.arrived;\s*b\.disabled = !waiting;\s*if \(next\) next\.hidden = !waiting;/);
    assert.match(sliceFn(js, 'knAnfrageSend', REL), /if \(first && !b\.hidden\) knFlash\(F, b\);/);
    assert.match(body, /<p class="kn-vh" id="kn-anfrage-live" aria-live="polite"><\/p>/);
    // [7] touch: a quiet mark on every routed card, the words on one per board
    assert.deepEqual([decl(at('.kn-stage .dcard[data-kn-hint]::after', '@media (hover: none)'), 'width'), decl(at('.kn-stage .dcard[data-kn-hint-one]::after', '@media (hover: none)'), 'content')], ['8px', 'attr(data-kn-hint)'],   // (round 27) an 8 px square on the rest
      'round 15: the words small on every card, full size on the board\'s first (round 24: 14 px, the first 16)');
    assert.equal(decl(at('.kn-stage .dcard[data-kn-hint-one]::after', '@media (hover: none)'), 'font-size'), '16px');
    // [9] the Engine's note in English as well
    assert.match(sliceFn(js, 'knEngineNote', REL), /knSampleAdd\(content, `Upgrads Engine: differing master data detected – not overwritten\./);
    // [10] Einstellungen: the line names what is shown
    assert.match(sliceFn(js, 'knDayPiece', REL), /cut\(`\.settings-page-header, #\$\{p\}-settings-pane-workspace, #\$\{p\}-settings-pane-objects`\);/, 'round 22: the settings crop is Darstellung and the contact fields');
    // [11] the day shares step 1's leads and step 2's booking
    assert.match(sliceFn(js, 'knAnfrageSend', REL), /knDayLead\(src, i\);/);
    assert.match(sliceFn(js, 'knNotizFollow', REL), /^function knNotizFollow\(\) \{\s*knDayFollow\(\);/);
    assert.match(sliceFn(js, 'knDayMeet', REL), /W\.acts\.unshift\(\{ \.\.\.a, id: \+\+W\.seq, kn_from: `termin:\$\{a\.id\}` \}\)/);
    // [14] invite only
    assert.equal(dict.de.kn_next, 'Danach klärt das Upgrads-Team, ob Upgrads CRM passt, und vereinbart den Preis.');
    // [15] 16 px for what a buyer reads; the claim's line height 1
    for (const sel of ['.kn-fine', '.kn-e-sub-t', '.kn-sample', '.kn-hero-fact']) assert.equal(decl(at(sel), 'font-size'), '.875rem', sel);   // (round 26, alphaiota restyle; dark-design pin retired): their note size
  });
  test('round 15 (honesty): the day says what it shows, step 4 says the status, step 3 asks to end no call it cannot, what follows a request in one subject, the mail\'s free text labelled', () => {
    assert.match(sliceFn(js, 'knNotizSync', REL), /say\.dataset\.kn = F\.W\.own \|\| c\.done \? 'kn_n_do_own' : 'kn_n_do';[\s\S]*say\.hidden = !c\.jonas \|\| \(!c\.rec && !c\.done\);[\s\S]*b\.dataset\.kn = c\.rec \|\| c\.done \? 'kn_m_end' : 'kn_n_off';/, 'no Notetaker booking: no line to end a call; another deal shown: no line about Jonas Becker (round 21); „Gespräch ist vorbei“ ends the call (round 22)');
    assert.doesNotMatch(dict.de.kn_e_see + dict.en.kn_e_see, /jeden Schritt|every step/, '"Alle Meldungen holen" brings every report at once: the team sees the status');
    assert.doesNotMatch(dict.de.kn_next + ' ' + dict.de.kn_done_crm, /klärt das Team|\bes\b/);
    assert.equal(dict.de.kn_mail_message, 'Teamgröße und Werkzeuge');
    assert.match(sliceFn(js, 'knAskBody', REL), /\$\{knWord\('kn_mail_message'\)\}:\\n\$\{v\.message\}/);
  });
  test('round 15: step 4 the win\'s with the Engine as its optional block, close-ups cropped (step 2 the dialog, step 4 two stages and one row), a dialog\'s dimmed pieces inert, shorter phones, the rail without dashes, the limits loud; the reviewer\'s fixes (the sub, the fit line, Undo, the known-address rule)', () => {
    const at = (sel, media) => rules.find(r => r.selector === sel && (r.in || '') === (media || ''));
    const decl = (r, p) => { const d = r && r.decls.find(([a]) => a === p); return d ? d[1] : null; };
    // structure
    assert.deepEqual([val('KN_E_CUT_STAGES'), val('KN_E_CUT_COLS')], [[11, 12, 13, 16], [1, 4, 7]], 'step 4: Verhandlung and Gewonnen; the monitor without Kunde, Seit, Aktion');
    assert.match(sliceFn(js, 'knDim', REL), /for \(const el of \[F\.app, \.\.\.keep\.map\(l => F\.layers\[l\]\)\]\) if \(el && el\.toggleAttribute\) el\.toggleAttribute\('inert', dim\);/, 'what a dialog dims holds no tab stops');
    assert.equal(decl(at('.kn-rec-book'), 'max-width'), '600px');
    assert.match(body, /<section class="kn-st kn-st-split kn-engine" id="kn-st-engine" aria-labelledby="kn-g-t">[\s\S]*<h2 class="kn-h2" id="kn-g-t" tabindex="-1" data-kn-head><span data-kn="kn_engine_t">Die Übergabe startet von selbst\.<\/span> <span class="kn-e-opt-tag" data-kn="kn_e_opt_t">Optional<\/span><\/h2>/, 'round 22: the Upgrads Engine in its own optional block after the day (round 24: „Optional“ in its heading)');
    assert.doesNotMatch(bare, /repeating-linear-gradient|\.kn-stop-opt|\.kn-stop-why/);
    assert.ok(!rules.some(r => r.selector === '.kn-ledger-not dt' && r.decls.some(([q]) => q === 'font-size')), 'the limits\' heads their small labels too');   // (round 26, alphaiota restyle; dark-design pin retired: „Noch nicht“ as the lower half\'s loud moment)
    assert.equal(decl(at('.kn-piece-logs .intg-logs > .intg-log-entry:nth-child(n+2)'), 'display'), 'none', 'the newest lead entry (round 18: on every width, Letzte Leads under the board)');
    assert.equal(decl(at('.kn-frame.kn-narrow .kn-piece-contacts tbody tr:nth-child(n+6)'), 'display'), 'none', 'phones: five contacts');
    // review: only what the app does
    assert.match(dict.de.kn_sub, /Notetaker \(Aufzeichnung in Google\u00a0Meet\)/, 'notes only from a Meet with Notetaker, glossed (routes/integrations.js:1015; round 20)');
    assert.ok(!('kn_e_win' in dict.de) && !/Rückgängig|Undo/.test(dict.de.kn_e_see + dict.en.kn_e_see), 'round 22: step 4 in one line; no line claims Undo recalls the Engine (routes/deals.js:183-186, pinned above)');
    assert.ok(!('kn_n_d' in dict.de) && dict.de.kn_n_t === 'Die Notiz steht nach dem Gespräch schon im Deal.' && /^Beispieldaten\. Nur mit Notetaker/.test(dict.de.kn_n_tag), 'round 25: the gain in step 3\'s heading, the condition in its caption (round 22 review: it was in the heading)');
    const r = JSON.parse(run(`(() => { const A = knFake('anfrage'); A.W.contacts.push({ id: 998, name: 'Alt', email: 'e.yilmaz@yilmaz-kfz.de', phone: '+49 1', company: 'Alt GmbH', custom_data: { branche: 'Gastronomie' } }); knLeadArrive(A.W, 'form', 0, 2); const c = A.W.contacts.find(x => x.id === 998); knLeadArrive(A.W, 'make', 0, 1); const sw = A.W.contacts.find(x => x.id === 62);
      return JSON.stringify({ c: [c.name, c.phone, c.company, JSON.stringify(c.custom_data)], sw: [sw.phone, sw.company, sw.custom_data.branche, sw.custom_data.dachflaeche] }); })()`));
    assert.deepEqual(r.c, ['Emre Yilmaz', '+49 1', 'Yilmaz Kfz-Technik', '{"branche":"Gastronomie"}'], 'a known address (round 16, routes/integrations.js:246-256): a sent value replaces, a missing one (phone) keeps the old, the custom fields merge; nothing is emptied');
    assert.deepEqual(r.sw, ['+49 171 5550199', 'Wolf & Söhne KG', 'Handwerk', '420'], 'Sabine Wolf\'s payload carries her fields: only the phone number changes');
  });
  test('"Noch nicht": Microsoft Teams and Outlook are coming (round 20: idiomatic), with no date and no scope; the mailbox and the Notetaker lines as they were', () => {
    assert.deepEqual([dict.de.kn_not2, dict.en.kn_not2], ['Notetaker bisher nur in Google Meet. Microsoft Teams und Outlook-Kalender folgen.', 'Notetaker only in Google Meet for now. Microsoft Teams and Outlook calendar are coming.']);
    assert.doesNotMatch(dict.de.kn_not2 + dict.en.kn_not2, /\d|bald|demnächst|soon|geplant|planned/i);
    assert.equal(dict.de.kn_not1, 'Keine E-Mail-Synchronisierung.'); assert.ok(!('kn_not3' in dict.de), 'the Notetaker limit is in the plan row now (round 21)');
  });
  test('a control the preview leaves out: the not-allowed pointer and a tooltip (a toast on a tap), the app\'s look and contrast kept; rows of left-out icons go', () => {
    const r = rules.find(x => x.selector === '.kn-stage .kn-inert');
    assert.ok(r && r.decls.some(([p, v]) => p === 'cursor' && v === 'not-allowed') && !r.decls.some(([p]) => p === 'pointer-events'), 'it keeps the pointer, so its tooltip shows');
    assert.ok(!rules.some(x => /\.kn-inert/.test(x.selector) && x.decls.some(([p]) => p === 'opacity' || p === 'filter')), 'nothing inert is dimmed: text keeps the app\'s contrast (at .45 it fell under 4.5:1)');
    // a row of left-out icons goes instead of greying (an entry's Verschieben, Absagen, Bearbeiten, Löschen; WhatsApp in
    // a row; a field's Bearbeiten and Löschen); buttons with words, like "Google Meet beitreten", stay dimmed
    assert.ok(rules.some(x => x.selector === '.kn-stage .kn-inert.iconbtn, .kn-stage .kn-inert.btn-icon, .kn-stage .kn-inert.btn-wa-inline' && x.decls.some(([p, v]) => p === 'display' && v === 'none')));
  });
  test('phones: the header is one compact row (no in-page links below 720 px; the logo, DE | EN and the request below 420 px); the footer links wrap; nothing in the page\'s own layout is wider than 288 px', () => {
    const at = q => rules.filter(r => r.in === `@media (max-width: ${q}px)`);
    assert.ok(!/class="kn-links"/.test(body) && !/kn-toc-link/.test(body));   // (round 26, alphaiota restyle; dark-design pin retired): no in-page links in the header; the dots and the footer's list
    assert.ok(rules.some(r => r.in === '@media (max-aspect-ratio: 9/10)' && r.selector === '.kn-brand-crm' && r.decls.some(([p, v]) => p === 'display' && v === 'none')) && !rules.some(r => r.selector === '.kn-brand > span') && /data-kn-aria="kn_brand" aria-label="Upgrads CRM"/.test(body),   // (round 26 review) „CRM“ goes in portrait; the link keeps its name „Upgrads CRM“
      'the logo alone up to 1100 px (round 25: the wordmark at its own aspect; the sub names the CRM; its text alternative names the brand)');
    assert.match(body, /<a class="kn-brand" href="#top" data-kn-aria="kn_brand" aria-label="Upgrads CRM"><span class="kn-brand-mark"><img class="kn-brand-png" src="\/images\/logo\.png" alt="Upgrads"><\/span>/);   // (round 26 review) the link's own name; the PNG under the drawn mark
    assert.ok(rules.some(r => r.selector === '.kn-foot-nav' && r.decls.some(([p, v]) => p === 'flex-wrap' && v === 'wrap')));
    // the sections on phones: "Inhalt" in the header where the in-page links are gone, to a list in the footer; the row
    // with it is 305 px in German and 322 in English (round 16: Manrope, measured), so it shows from 360 px
    assert.doesNotMatch(body, /kn-toc-link/);   // (round 26, alphaiota restyle; dark-design pin retired: the header's „Inhalt“ link; the dots and the footer's list)
    assert.match(body, /<nav class="kn-foot-nav kn-toc" id="kn-toc" tabindex="-1" data-kn-aria="kn_toc" aria-label="Inhalt">\s*<a class="kn-a" href="#kn-anfrage"[^>]*>[^<]+<\/a>\s*<a class="kn-a" href="#kn-fit"[^>]*>[^<]+<\/a>\s*<a class="kn-a" href="#kn-faq"[^>]*>[^<]+<\/a>\s*<a class="kn-a" href="#kn-ask"[^>]*>[^<]+<\/a>\s*<a class="kn-a" href="\/" data-kn="kn_login">Anmelden<\/a>\s*<\/nav>/, 'the sections, and "Anmelden", which the header drops below 600 px');
    // the page's own fixed widths (the frames lay out the app, at 1:1 below 1024 px, inside their own width)
    // (round 16: part 2's 600 px dialog column, as part 1's 340 px text column, holds from 1101 px only)
    // (round 26) the drawn mark is 884 x 264 units at scale 1, always scaled down by its transform (knMark), so it is no fixed width;
    // a step's 420 px panel column holds from 1101 px only (it stacks below)
    for (const r of rules.filter(x => !/kn-(frame|stage|piece|cuts|notiz-frame|rec-|cut|wm)|^\.kn-hero \.kn-body$|^\.kn-split-book$|^\.kn-split$|^\.kn-hero-copy$|\.kr-|\.tk-|\.cal-|\.dd-|notif|contact|kn-set/.test(x.selector))) for (const [p, v] of r.decls) {
      if (!/^(width|min-width|flex-basis)$/.test(p) && p !== 'grid-template-columns') continue;
      for (const m of v.matchAll(/(\d+)px/g)) assert.ok(+m[1] <= 288, `${r.selector} ${p}: ${v} fits a 320 px phone`);
    }
  });
  const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128]);
  test('every page class in the stylesheet is used, and every page class the markup uses has a rule', () => {
    assert.match(js, /knPiece\(F\.W\.page, knDayPiece\(F\), `page \$\{F\.W\.page\}`\)/, 'the day\'s piece classes are its tabs');
    for (const c of cssClasses) assert.ok(usedClasses.has(c), `.${c} is used`);
    for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (/^(kn|is)-/.test(c) && c !== 'kn-root') assert.ok(cssClasses.has(c), `.${c} has a rule`);
  });
  test('scoped to the page; hex only as the page\'s named tokens; four gradients; no !important; a short z-index ladder', () => {
    for (const r of rules) if (!r.selector.startsWith('@') && !r.in.includes('@keyframes')) assert.ok(/\.kn-|body\.kn|html\.kn-root/.test(r.selector), `scoped: ${r.selector}`);
    for (const r of rules) for (const [p, v] of r.decls) if (/#[0-9a-f]{3,8}\b/i.test(v)) assert.ok(r.selector === 'html.kn-root' && p.startsWith('--kn-'), `hex only as a token: ${r.selector} ${p}`);
    assert.equal((bare.match(/gradient\(/g) || []).length, 3, 'the header\'s paper fade and the two board edge fades (round 26: the rail\'s thread went)');
    assert.doesNotMatch(bare, /linear-gradient\(var\(--kn-sky\)/, '(round 26, alphaiota restyle; dark-design pin retired)');
    assert.doesNotMatch(bare, /!important/);
    const z = rules.flatMap(r => r.decls.filter(([p]) => p === 'z-index').map(([, v]) => Number(v)));
    assert.ok(z.every(n => n === -1 || (n >= 1 && n <= 10) || [40, 45, 60, 61, 100, 9400].includes(n)), `z-index: ${[...new Set(z)]}`);   // (round 26) their ladder: the nav 40, the dots 45, the mark 60 and its pen 61, the skip link 100
  });
  test('every custom property resolves; no declaration repeated; no selector declared twice at the same level', () => {
    const defined = new Set([...(style + cssAll).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    for (const k of ['--kn-w', '--kn-h', '--kn-s']) { assert.ok(js.includes(`'${k}'`), `${k} is set by the script`); defined.add(k); }
    for (const m of js.matchAll(/setProperty\('(--kn-[a-z0-9-]+)'/g)) defined.add(m[1]);
    for (const m of bare.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
    const seen = new Set();
    for (const r of rules) {
      if (r.in.includes('@keyframes') || r.selector === '@font-face') continue;
      const props = r.decls.map(([p]) => p);
      assert.equal(new Set(props).size, props.length, `${r.selector}: no repeated declaration`);
      const key = r.in + ' | ' + r.selector; assert.ok(!seen.has(key), `${key} declared once`); seen.add(key);
    }
  });
  test('spacing on the scale; breakpoints descending; the frames scale from a design size', () => {
    for (const r of rules) for (const [p, v] of r.decls) if (/^(margin|padding|gap|row-gap|column-gap)/.test(p)) {
      let flat = v; while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '~');
      for (const tok of flat.split(/\s+/)) {
        if (/^(0|auto|none|-?[a-z-]+~|[\d.]+%)$/.test(tok)) continue;
        const px = tok.match(/^(-?\d+(?:\.\d+)?)(px|rem|vw|svh)$/); assert.ok(px, `${r.selector}: ${p}: ${v} in px, rem, vw or svh`);   // (round 26, alphaiota restyle; dark-design pin retired): their literal spacing, not the 4 px scale
      }
    }
    assert.deepEqual([...bare.matchAll(/@media \(max-width: (\d+)px\)/g)].map(m => +m[1]), [1100, 720, 600, 480]);   // (round 26) and the portrait rule (max-aspect-ratio: 9/10);   // (round 25) the short request label up to 480 px; (round 24 review) „Inhalt“ from 380 px, so the English header fits at 360
    assert.match(bare, /\.kn-frame \{ position: relative; width: 100%; height: calc\(var\(--kn-h, 600\) \* var\(--kn-s, 1\) \* 1px\); \}/);
    assert.match(bare, /\.kn-stage \{[^}]*left: calc\(var\(--kn-x, 0\) \* 1px\);[^}]*width: calc\(var\(--kn-w, 880\) \* 1px\);[^}]*transform: scale\(var\(--kn-s, 1\)\);/, 'the stage centred by the script\'s --kn-x');
    assert.match(sliceFn(js, 'knScale', REL), /const z = F\.part\.size \? F\.part\.size\(F\) : F\.part, cw = F\.host\.clientWidth, narrow = cw > 0 && cw < \(F\.part\.narrowBelow \|\| 1024\);\s*\/\/[^\n]*\s*const grow = KN_MAX_S;\s*F\.w = narrow \? cw : grow && cw > 0 \? Math\.round\(cw \/ grow\) : z\.w;[^\n]*\s*F\.h = narrow \? z\.hm : z\.h;\s*F\.s = \(narrow \? 1 : Math\.min\(cw \/ F\.w, KN_MAX_S\)\) \|\| 1;[\s\S]*?F\.host\.classList\.toggle\('kn-narrow', narrow\);/);
  });
  test('motion: every animation inside prefers-reduced-motion: no-preference; it only answers what the visitor does; nothing loops; nothing follows the pointer or tilts', () => {
    const at = bare.indexOf('@media (prefers-reduced-motion: no-preference)');
    assert.doesNotMatch(bare.slice(0, at), /animation(-delay)?: (?!none)/);
    for (const m of bare.matchAll(/animation: (?!none)[^;]+/g)) assert.ok(rules.some(r => r.in.includes('prefers-reduced-motion: no-preference') && r.decls.some(([p, v]) => p === 'animation' && m[0].endsWith(v))), `${m[0]} only with motion allowed`);
    assert.deepEqual([...bare.matchAll(/@keyframes ([a-z-]+)/g)].map(m => m[1]), ['kn-drop', 'kn-rec-in'], 'round 16: no load animation; a card or an entry that arrived because of a click');
    // round 16: the drawing moves only when the visitor completes a part (knStepSync), and only with motion allowed
    assert.match(sliceFn(js, 'knStepSync', REL), /document\.querySelectorAll\('\.kn-dot\[data-step\]'\)\.forEach\(d => d\.classList\.toggle\('is-done', KN_DONE\.has\(Number\(d\.dataset\.step\)\)\)\);/);   // (round 26) the step dots, not the drawing's threads
    assert.doesNotMatch(sliceFn(js, 'knStepSync', REL), /setTimeout|setInterval|requestAnimationFrame|knLater/);
    assert.ok(!/kn-sig/.test(bare), '(round 26, alphaiota restyle; dark-design pin retired): the drawing went');
    assert.doesNotMatch(bare.replace('.kn-q[open] .kn-q-s::after { background: var(--kn-accent); transform: rotate(45deg); }', ''), /infinite|rotate|perspective|skew/);   // (round 26) the FAQ's square turns into a diamond once open, on a click: a state, not a tilt
    assert.doesNotMatch(js, /mousemove|deviceorientation|mouseenter|mouseover/);
    assert.match(js, /e\.pointerType === 'touch' \|\|/, 'a card drags with a mouse or pen; a touch scrolls');
  });
  test('round 24 review: the day names what its tabs hold, no overclaim; the request says when it may have arrived; touch targets; the Engine starts the hand-over; one time for his own Erstgespräch', () => {
    // [1] the day's heading, and the overclaim family nowhere (the dictionary, the markup, its labels)
    const family = /Rest des (Vertriebs)?tag|im selben CRM|bleibt der Vertrieb|rest of the (sales ?)?day|in the same CRM|sales stays/i;
    const hits = ['de', 'en'].flatMap(l => Object.entries(dict[l]).filter(([, v]) => family.test(String(v))).map(([k]) => `${l}.${k}`));
    assert.deepEqual(hits, [], 'no line says sales spends the rest of its day in the same CRM');
    assert.doesNotMatch(body.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, ''), family);
    assert.match(body, /<h2 class="kn-h2" id="kn-day-t" tabindex="-1" data-kn-head data-kn="kn_day_t">Kontakte, Aufgaben, Termine und Zahlen an einem Ort\.<\/h2>\s*<div class="kn-tabs" id="kn-tabs" role="tablist" data-kn-aria="kn_day_t" aria-label="Kontakte, Aufgaben, Termine und Zahlen an einem Ort\.">/);
    // [2] the outcomes' wording (check.js [R2] sends 200, 502, 503, 504, a TypeError online and offline through the page)
    assert.ok(!/Gesendet wurde nichts|Nothing was sent/.test(dict.de.kn_done_unsure + dict.en.kn_done_unsure) && /per Mail senden\.$/.test(dict.de.kn_done_unsure) && /by email too\.$/.test(dict.en.kn_done_unsure));
    // [3] touch: the language buttons 44 px wide; the hero's Impressum, the request's two links, „Analysen ansehen“, „In Kontakte ansehen“ 44 px high
    assert.ok(rules.some(r => r.in === '@media (pointer: coarse)' && r.selector === '.kn-lang-btn' && r.decls.some(([p, v]) => p === 'min-width' && v === '44px')));
    const tall = rules.find(r => r.in === '@media (pointer: coarse)' && r.selector.split(',').map(x => x.trim()).includes('.kn-hero-fact .kn-a'));
    assert.ok(tall && ['.kn-foot a', '.kn-engine .kn-fine .kn-a', '.kn-hero-fact .kn-a', '.kn-ask .kn-fine .kn-a', '.kn-do .kn-a', '.kn-a-dup .kn-a'].every(x => tall.selector.split(',').map(y => y.trim()).includes(x))
      && ['display', 'inline-flex', 'align-items', 'center', 'min-height', '44px'].join() === tall.decls.flat().join(), tall ? tall.selector : 'no rule');
    assert.match(body, /<p class="kn-hero-fact">[^\n]*<a class="kn-a kn-a-line" href="https:\/\/upgrads\.de\/impressum"/);
    assert.match(body, /<p class="kn-fine kn-a-dup" id="kn-anfrage-dup" hidden><span data-kn="kn_a_dup">[^<]+<\/span> <a class="kn-a kn-a-line" href="#kn-day" id="kn-anfrage-dup-go"/);
    assert.match(body, /<p class="kn-do">[\s\S]{0,500}?<a class="kn-a" href="#kn-day" id="kn-abschluss-an"/);   // (round 25) the done line sits between
    // [4] the Engine's heading
    assert.deepEqual([dict.de.kn_engine_t, dict.en.kn_engine_t], ['Die Übergabe startet von selbst.', 'The hand-over starts by itself.']);   // (round 25) with its full stop
    // [5] his own Erstgespräch at one time in step 2, step 3 and the day (the day copies step 2's)
    assert.match(sliceFn(js, 'knTerminSeed', REL), /const at = knJonasOwnAt\(W\);/);
    assert.match(sliceFn(js, 'knRecMet', REL), /const own = knMeetingAdd\(W, 120, knJonasOwnAt\(W\), KN_MEET_SELF, false, knT1\(W, 50\)\);/);   // (round 25) a Tag 1 time on step 3's clock
    const at = JSON.parse(run(`(() => { delete KN.termin; const T = knFake('termin'), N = knFake('notiz'); const o = W => { const a = W.acts.find(x => x.kn_seed); return a.event_date + ' ' + a.event_time; }; return JSON.stringify([o(T.W), o(N.W), T.W.days[0]]); })()`));   // (round 25) Tag 1's next working day
    assert.ok(at[0] === at[1] && at[0].startsWith(at[2]), at.join(' / '));
  });
  test('round 25: one time line (each part its clock), the story\'s deal on a jump, the header\'s wordmark, skip links out of the flow, done lines, touch targets, the app\'s meeting filter', () => {
    // the clocks: step 3 at its meeting, step 4 and the Engine three weeks on; a later step's deal shown on its own clock in step 3, given back on "Zurück"
    assert.match(js, /clock: \(\) => 21 \* KN_DAY,   \/\/ \(round 25\) three weeks after Tag 1/);
    assert.match(sliceFn(js, 'knRouteDeal', REL), /later = story && \(F\.W\.shift \|\| 0\) > \(T\.W\.shift \|\| 0\);[\s\S]*if \(T !== F && T\.part\.story\) T\.part\.story\(T, later \? F : null\);[\s\S]*knCarry\(F\.W, T\.W, id, null, story\)/);
    assert.match(js, /story\(T, from\) \{[\s\S]*?if \(from\) W\.shift = from\.W\.shift;/, 'step 3 shows the won deal on step 4\'s clock (round 25 review)');
    assert.match(sliceFn(js, 'knNotizStory', REL), /Object\.assign\(W, \{ shift: S\.shift,/, '"Zurück": step 3\'s own story and clock again');
    assert.match(js, /if \(note && T\.W\.bell\.items\.some\(n => n\.entity_type === 'deal' && n\.entity_id === id && !n\.read\)\) T\.W\.record\.stale = \[note\.id\];/, 'a jump keeps the note behind its unread row');
    assert.match(js, /bellItems\(F\) \{ const R = F\.W\.record; return F\.W\.bell\.items\.filter\(n => !R \|\| n\.entity_type !== 'deal' \|\| n\.entity_id === R\.id\); \},/);
    // the done lines
    assert.match(sliceFn(js, 'knTerminSay', REL), /'kn_t_done' : 'kn_t_do'/); assert.match(sliceFn(js, 'knAbschlussSay', REL), /p\.classList\.toggle\('is-done', won\);\s*if \(done\) done\.hidden = !won;/);
    assert.match(body, /<span class="kn-do-done" data-kn="kn_e_done" hidden>/);
    // the wordmark at its own aspect; a focused skip link out of the layout; touch targets
    assert.ok(rules.some(r => !r.in && r.selector === '.kn-brand-png' && r.decls.some(([p, v]) => p === 'width' && v === '170px') && r.decls.some(([p, v]) => p === 'height' && v === 'auto')) && rules.some(r => r.selector === 'html.kn-js .kn-brand-png' && r.decls.some(([p, v]) => p === 'opacity' && v === '0')));   // (round 26 review) the PNG at its own aspect, hidden by opacity under the drawn mark (its alt kept)
    assert.ok(rules.some(r => r.selector === '.kn-skip:not(.kn-skip-top):focus-visible' && r.decls.some(([p, v]) => p === 'position' && v === 'absolute')));
    assert.ok(rules.some(r => r.in === '@media (pointer: coarse)' && r.selector === '.kn-brand, .kn-fact .kn-a' && r.decls.some(([p, v]) => p === 'min-height' && v === '44px')));
    assert.ok(rules.some(r => r.in === '@media (max-width: 480px)' && r.selector === '.kn-req-long' && r.decls.some(([p, v]) => p === 'display' && v === 'none')) && dict.de.kn_request_short === 'Anfragen' && dict.en.kn_request_short === 'Request');
    // the copy
    assert.ok(/^Das CRM für Vertriebsteams: /.test(dict.de.kn_sub) && /^The CRM for sales teams: /.test(dict.en.kn_sub) && /Microsoft Teams and Outlook calendar are coming\.$/.test(dict.en.kn_not2) && /Microsoft Teams and Outlook calendar are coming\.$/.test(dict.en.kn_sub));
    assert.ok(!/\bZug\b|sofort/.test(dict.de.kn_e_t) && dict.de.kn_e_t === 'Gewonnene Deals zählen in den Analysen mit.' && dict.en.kn_e_t === 'Once won, the deal counts in Analytics.');   // (round 27) the gain first, in both
    // the app's meeting filter (Kontakte → Aktivität): its word in the replica
    assert.ok(new Function(`${sliceConst(REL, 'KR_EXTRA_KEYS')} return KR_EXTRA_KEYS;`)().includes('dv_filter_meeting') && /"dv_filter_meeting":"Termine"/.test(ui) && /"dv_filter_meeting":"Meetings"/.test(ui));
  });
});

describe('the script', () => {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  test('the document follows the language: html lang, the title, the description and og:* (knSetLang)', () => {
    const lang = sliceFn(js, 'knSetLang', REL);
    assert.match(lang, /document\.documentElement\.lang = knLang;\s*document\.title = knWord\('kn_doc_title'\);\s*document\.querySelectorAll\('meta\[data-kn-meta\]'\)\.forEach\(m => m\.setAttribute\('content', knWord\(m\.dataset\.knMeta\)\)\);/);
    assert.equal(dict.en.kn_meta_desc.startsWith('Upgrads CRM for sales teams'), true);
    assert.equal(dict.de.kn_doc_title, 'Upgrads CRM: Anfragen, Termine und Notizen im Deal'); assert.equal(dict.en.kn_doc_title, 'Upgrads CRM: enquiries, meetings and notes on the deal');
    assert.doesNotMatch(dict.en.kn_og_title + dict.en.kn_h1, /overview/i, 'no Germanism in English');
    assert.ok(lang.includes('for (const F of Object.values(KN)) { F.W.toasts = []; if (F.lazy) continue; knRender(F); if (F.part.sync) F.part.sync(F); }'), 'a toast showing during the switch goes with the old language');
  });
  test('strict; the page ids it touches exist; the language is saved only on a pick; the app\'s theme is never saved', () => {
    assert.match(js, /^'use strict';$/m);
    for (const m of js.matchAll(/knId\('([a-z0-9-]+)'\)/g)) assert.ok(ids.has(m[1]) || m[1] === 'kn-back', `#${m[1]} exists`);   // kn-back: made by the script on the first jump
    assert.ok(js.includes("b.className = 'kn-a kn-back'; b.id = 'kn-back'; b.href = '#';"));
    assert.ok(js.includes("if (save) { try { localStorage.setItem('lang', knLang); }"));
    assert.equal((js.match(/localStorage\.setItem/g) || []).length, 1);
    assert.ok(js.includes("document.documentElement.setAttribute('data-theme', knDark ? 'dark' : '');"), 'as the app sets it: dark or empty');
  });
  test('no dead end: a control the page does not port is inert (aria-disabled, out of the tab order, no click), not a toast; KN_OFF is empty', () => {
    assert.deepEqual(val('KN_OFF'), []);
    const inert = val('KN_INERT');
    assert.ok(!inert.includes('[data-ev^="task-"]') && !inert.includes('[data-kr="open-task"]'), 'a task in the calendar and a task title open the ported drawer');
    for (const sel of ['[data-addday]', '.dv-join', '[data-cal-resched]', '[data-cal-cancel]', '[data-kr="new-task"]', '.onb-drive', '[data-kn-layer="record"] [data-toggle]', '.contact-side-panel [data-act="edit-all"]']) assert.ok(inert.includes(sel), sel);
    assert.ok(!inert.includes('[data-kn-layer="contact"] [data-act="book"]') && !val('KN_CT_OFF').includes('book'), '"Termin buchen" in a contact record is live');
    assert.ok(js.includes("if (act === 'book') { knCtClose(F); return knRouteBook(F, R.id); }"), 'it leads to step 2, the booking part');
    const route = sliceFn(js, 'knRouteBook', REL);
    assert.match(route, /const did = knCarry\(W, T\.W, d\.id, null\)\.deal;\s*knQuiet\(T\);\s*T\.W\.record = knRecState\(did\);\s*knPaint\(T, 'record'\);\s*knBookOpen\(T, true\);/, 'the contact\'s newest deal carried over, its record open, the booking dialog on it');
    assert.match(route, /knShow\(T, T\.root\.querySelector\('\[data-kn-layer="booking"\] \.modal'\)/, 'scrolled to, with the way back');
    // the app's headings inside a frame stay out of the page's outline (level 3 or deeper), drawn as the app draws them
    assert.match(sliceFn(js, 'knInertify', REL), /for \(const h of F\.root\.querySelectorAll\('h1, h2, h3, h4, h5, h6'\)\) if \(!h\.hasAttribute\('aria-level'\)\) h\.setAttribute\('aria-level', String\(Math\.min\(6, Math\.max\(3, Number\(h\.tagName\[1\]\) \+ 1\)\)\)\);/);
    assert.ok(!rules.some(r => /aria-level/.test(r.selector)), 'no rule keys on it: they look unchanged');
    assert.match(sliceFn(js, 'knInert', REL), /el\.classList\.add\('kn-inert'\);\s*el\.setAttribute\('aria-disabled', 'true'\);\s*el\.setAttribute\('tabindex', '-1'\);/);
    assert.ok(js.includes("if (el.closest('.kn-inert')) { e.preventDefault(); knOff(F); return; }"), 'a click on one does nothing but say so: the toast, on a mouse click and on a tap');
    assert.ok(js.includes("R.addEventListener('pointerdown', e => { F.touch = e.pointerType === 'touch'; knPointerDown(F, e); });"), 'the frame knows a touch from a mouse or a pen');
    assert.match(sliceFn(js, 'knInert', REL), /el\.dataset\.knTitle = 'kn_off';[^\n]*\n\s*el\.title = knWord\('kn_off'\);/, 'its tooltip says it is not part of the preview, in the page\'s language');
    for (const sel of ['a[href^="https://wa.me/"]', 'a[href^="tel:"]', 'a[href^="mailto:"]', 'a[href^="https://meet.google.com/"]']) assert.ok(inert.includes(sel), `the sample's ${sel} is inert`);
    assert.match(dict.de.kn_sample, /^Echte Oberfläche, /, 'round 15 copy: the inert controls\' tooltip and toast say what is left out');
    assert.ok(js.includes("new MutationObserver(() => knInertify(F)).observe(R, { childList: true, subtree: true })"), 'every repaint is covered');
    const menu = sliceFn(js, 'knMenuOpen', REL);
    assert.match(menu, /items\.forEach\(\(it, i\) => \{ const b = it\.inert && m\.querySelector\(`\.menu-item\[data-i="\$\{i\}"\]`\); if \(b\) knInert\(b\); \}\);/, 'a menu\'s left-out item too');
    assert.match(menu, /knFocus\(F, m\.querySelector\('\.menu-item:not\(\.kn-inert\)'\)\);/, 'focus starts on the first live item');
    // the calendar entry's window and the task menu are ported; what they open that is not stays inert
    assert.ok(js.includes("knLayerMod('detail'"), 'a calendar entry opens its window (calendar.js:473-514)');
  });
  test('a frame never leaves the page: every link in it is sample data (dialers, mail, Meet, Drive), nothing is fetched but the request, and no file of the CRM app is loaded', () => {
    assert.ok(js.includes("if (el.closest('a[href]')) e.preventDefault();"));
    assert.deepEqual([...js.matchAll(/fetch\('([^']+)'/g)].map(m => m[1]), ['/api/landing/ask', '/api/landing/status']);
    assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|WebSocket|io\(/);
    // what the hero says is true: what is typed into the screens stays in the browser (only the request below them is sent)
    assert.match(dict.de.kn_sample, /Getipptes bleibt im Browser\./);
    assert.doesNotMatch(js, /XMLHttpRequest|WebSocket|sendBeacon|navigator\.share|\.action = |new FormData/);
    const fetching = [...js.matchAll(/^(?:async )?function (\w+)\([^)]*\) \{[\s\S]*?^\}/gm)].filter(m => /fetch\(/.test(m[0])).map(m => m[1]);
    assert.deepEqual(fetching, ['knAsk', 'knInit'], 'only the request and its status ask the server');
    assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['/js/landing-ui.js', '/js/landing.js'], 'the page loads only its own two scripts');
    const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // the comments cite the app's files
    assert.doesNotMatch(code, /import\(|require\(|importScripts|createElement\('script'\)|\.src = |\/js\/(?!landing(-ui)?\.js)[a-z-]+\.js/, 'and loads no file of the CRM app');
  });
  test('what a visitor types is drawn by the app\'s own escaping renderers; the request is bounded as routes/landing.js bounds it (120/254/120, the message 1000)', () => {
    assert.ok(js.includes("function knClean(v, max) { return String(v || '').replace(/\\s+/g, ' ').trim().slice(0, max); }"));
    assert.ok(js.includes("return { name: knClean(f.elements.name.value, 120), email: knClean(f.elements.email.value, 254), company: knClean(f.elements.company.value, 120), message: String(f.elements.message ? f.elements.message.value : '').trim().slice(0, 1000) };"));
    assert.match(read('routes/landing.js'), /message: String\(b\.message \?\? ''\)\.trim\(\)\.slice\(0, 1000\),/, 'the server keeps the message as typed (line breaks too), up to 1000');
    assert.match(js, /if \(text\.length > 2000\) return;/, 'the chat drops what the server would drop');
    for (const m of js.matchAll(/\.innerHTML = ([^;]+);/g)) assert.match(m[1], /^(kr[A-Z]\w*\(|`\$\{kr[A-Z]|knScreen\(|knConfirmHtml\(|''|html$|keep$|ed\.html$|parts\.table$|`<div class="chat-empty">\$\{esc\(t\('chat_loading'\)\)\}<\/div>`|`<div class="kn-stage">|`<main class="view kn-cut-view">\$\{F\.part\.view|F\.part\.view \? F\.part\.view\(F\) : ''|\(m && m\.paint && m\.paint\(F\)\) \|\| '')/, `innerHTML from a renderer: ${m[1].slice(0, 60)}`);
  });
});
