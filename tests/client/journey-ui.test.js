// CLIENT (static + pure-function) tests for the Customer Journey page (public/js/journey.js, CUSTOMER_JOURNEY_CHANGES
// Part 3, 2026-11-19): the workspace's workflows. The sidebar link and the page markup, the wiring in auth.js / core.js,
// both dictionaries, and the functions — a workflow's boxes in the order of its lines, what a start says, a box for an
// owner and for a member, what a step whose integration is missing says, the three windows (a workflow's name, a
// step, the start: what they send and what they ask before closing) and what typed text cannot do to the markup.
//
// Part 3 is the plan only: workflows are kept and shown, nothing runs from them, and the page says so.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const js   = read('public/js/journey.js');
const start = read('public/js/journey-start.js');
const css  = read('public/style.css');
const route = read('routes/journey.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;
const pageStart = html.indexOf('<section id="page-journey"');
const page = html.slice(pageStart, html.indexOf('</section>', pageStart));
const ACTIONS = ['call', 'email', 'whatsapp', 'sms', 'task', 'move', 'wait', 'branch', 'router'];   // 'wait': a box that only takes time (Part 10); 'router': several routes out (Part 24); 'branch': a question with two lines out (Part 11)
const constOf = name => new Function(`${sliceConst('public/js/journey.js', name)} return ${name};`)();

// the sandbox: the page's own state, a recording api/ui/document, a window whose fields the test fills, and the real t/tf/esc/icon
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  sliceFn(core, 't', 'core.js'),
  sliceFn(core, 'tf', 'core.js'),
  sliceFn(core, 'icon', 'core.js'),
  sliceConst('public/js/journey.js', 'JOURNEY_ACTIONS'),
  sliceConst('public/js/journey.js', 'JOURNEY_ICONS'),
  sliceConst('public/js/journey.js', 'JOURNEY_WAIT_DAYS'),
  sliceConst('public/js/journey.js', 'JOURNEY_UNITS'),
  sliceConst('public/js/journey.js', 'JOURNEY_ERRORS'),
  'const JOURNEY_MAX_NAME = 80, JOURNEY_MAX_TITLE = 120, JOURNEY_MAX_TEXT = 20000, JOURNEY_MAX_WAIT = 365 * 24 * 60;',
  'const JOURNEY_BOX_W = 300, JOURNEY_PAD = 40, JOURNEY_STEP_Y = 150, JOURNEY_MAX_PLACE = 20000;',
  sliceConst('public/js/journey.js', 'JOURNEY_DETAILS'),
  // the variables of a step's texts (journey-vars.js, Part 14): a step's window shows them, so its file rides along; its own tests are journey-vars-ui.test.js
  ...['JOURNEY_VAR_GROUPS', 'JOURNEY_VAR_ALIASES', 'JOURNEY_VAR_PREFIXES', 'JOURNEY_VAR_KINDS', 'JOURNEY_VAR_QUICK', 'JOURNEY_VAR_GROUP_KEYS', 'JOURNEY_VAR_KEYS', 'JOURNEY_VAR_SAMPLE'].map(n => sliceConst('public/js/journey-vars.js', n)),
  ...['journeyVarOf', 'journeyVarHas', 'journeyVarWord', 'journeyVarList', 'journeyVarZone', 'journeyVarClock', 'journeyVarSample', 'journeyVarFill', 'journeyVarUnknown', 'journeyVarInsert', 'journeyVarBarHtml', 'journeyVarWire'].map(n => sliceFn(read('public/js/journey-vars.js'), n, 'journey-vars.js')),
  js.match(/^const JOURNEY_ARROW = .*$/m)[0],
  js.match(/^const journeyClamp = .*$/m)[0],
  js.match(/^const journeyOption = .*$/m)[0],
  // the start (journey-start.js, Part 9): a box says what its start is, so its file rides along; its own tests are journey-start-ui.test.js
  ...['JOURNEY_CATEGORIES', 'JOURNEY_CAT_KEYS', 'JOURNEY_CAT_ICONS', 'JOURNEY_TRIGGERS', 'JOURNEY_RESULT_KEYS', 'JOURNEY_DOC_KEYS', 'JOURNEY_URGENCY_KEYS', 'JOURNEY_DAY_KEYS', 'JOURNEY_START_MAX', 'JOURNEY_STOP_ON_KEYS',
    'JOURNEY_STAGE_RULES', 'JOURNEY_STOP_GROUPS', 'JOURNEY_STOP_HEADS', 'JOURNEY_STOP_USES', 'JOURNEY_STOP_ICONS', 'JOURNEY_STOP_TITLES', 'JOURNEY_STOP_HINTS', 'JOURNEY_STOP_PARTS'].map(n => sliceConst('public/js/journey-start.js', n)),
  'const JOURNEY_STOP_MAX = 20;',
  'let journeyDealFields = [], journeyContactFields = [];',
  ...['journeyStartUses', 'journeyStartHours', 'journeyStartDays'].map(n => start.match(new RegExp(`^const ${n} = .*$`, 'm'))[0]),
  ...['journeyStartFields', 'journeyStartLines', 'journeyStartChooserHtml', 'journeyStartFieldOptions', 'journeyStartState', 'journeyStartShown', 'journeyStartConfig', 'journeyStopGroup', 'journeyStopDetail', 'journeyStopSummaryHtml', 'journeyStopTabsHtml', 'journeyStopHtml', 'openJourneyStart'].map(n => sliceFn(start, n, 'journey-start.js')),
  `const __log = [];
   let __answers = {}, __confirm = true, __unsaved = true, __throw = false, __checks = [];
   let journeyMail = null;
   const __els = {}, __fields = {}, __handlers = {};
   const __el = id => (__els[id] ||= { id, innerHTML: '' });
   let __missing = [];
   const document = { getElementById: id => (__missing.includes(id) ? null : __el(id)) };
   const __answer = (verb, url, body) => { __log.push(body === undefined ? [verb, url] : [verb, url, body]); if (__throw) throw new Error('offline'); return __answers[verb + ' ' + url] ?? __answers[url]; };
   const api = { get: async url => __answer('get', url), post: async (url, b) => __answer('post', url, b), put: async (url, b) => __answer('put', url, b), del: async url => __answer('del', url) };
   const __field = part => (__fields[part] ||= { value: '', hidden: null, textContent: '', focused: 0, focus() { this.focused++; } });
   const ui = {
     modal: opts => { __log.push(['modal', opts]); return { el: { querySelector: sel => __field(sel.replace(/^#jr-[a-z0-9]+-/, '')), querySelectorAll: () => __checks }, close() { __log.push(['close']); } }; },
     confirm: async opts => { __log.push(['confirm', opts]); return __confirm; },
     menu: (anchor, items) => { __log.push(['menu', anchor, items]); },
     toast: m => __log.push(['toast', m]),
   };
   function on(_root, type, selector, fn) { __handlers[type + ' ' + selector] = fn; }
   const uid = () => 'abc1234';
   function dvConfirmUnsaved() { __log.push(['unsaved?']); return __unsaved; }
   function __state() { return { journeyFlows, journeyWebhooks, journeyManage, journeyLimits, journeyFlowId, journeyFonio, pipelines }; }
   function __reset(answers = {}, missing = []) { __log.length = 0; __answers = answers; __missing = missing; __confirm = true; __unsaved = true; __throw = false; __checks = []; journeyMail = null;
     for (const o of [__els, __fields, __handlers]) for (const k of Object.keys(o)) delete o[k]; }
   function __fill(values) { for (const k of Object.keys(values)) __field(k).value = values[k]; }
   function __opt(k, v) { if (k === 'confirm') __confirm = v; else if (k === 'unsaved') __unsaved = v; else if (k === 'throw') __throw = v; else if (k === 'checks') __checks = v; else if (k === 'mail') journeyMail = v; }
   function __page() { return { log: __log, els: __els, fields: __fields, handlers: __handlers }; }`,
].join('\n');
const NAMES = ['resetJourneyUI', 'journeyErrorText', 'journeyTestErrorText', 'journeySend', 'journeyWaitText', 'journeyDurationText', 'journeyWaitLines', 'openJourneyWait', 'journeyWaitParts', 'journeyWaitMinutes', 'journeyPipelines', 'journeyFlow', 'journeyStageName', 'journeyLayout', 'journeyChain',
  'journeyPlaces', 'journeyCanvasSize', 'journeyLinePath', 'journeyPart', 'journeyEdges', 'journeyRects', 'journeyLinesHtml', 'journeyBehind', 'loadJourney', 'journeyApply', 'setJourneyFlow', 'journeyBoxHtml', 'journeyBoardHtml', 'journeyDrawLines', 'journeyToolbarHtml',
  'renderJourney', 'setJourneyActive', 'journeyWhen', 'journeyStepText', 'journeyDetailText', 'journeyActivityHtml', 'openJourneyActivity', 'journeyIncludeDeal', 'journeyWindow', 'journeyStageOptions', 'journeyNameWindow', 'deleteJourneyFlow', 'openJourneyAdd',
  'journeyPreviewHtml', 'openJourneyBox', 'journeyBoxView', 'journeyDropBox', 'journeyDropLine', 'journeyRemoveLine'];
const F = loadFns('public/js/journey.js', NAMES, {
  state: { currentLang: 'en', pipelines: [], journeyFlows: [], journeyWebhooks: [], journeyManage: false, journeyLimits: { flows: 20, nodes: 60 }, journeyFlowId: null, journeyFonio: false, journeyDrag: null, journeyDragEnd: 0 },
  extra, expose: ['__state', '__reset', '__fill', '__opt', '__page'],
});

const SALES = { id: 3, name: 'Sales', stages: [{ id: 31, name: 'New' }, { id: 32, name: 'Booked' }] };
const RENT  = { id: 4, name: 'Rentals', stages: [{ id: 41, name: 'Enquiry' }] };
const HOOKS = [{ id: 5, name: 'Website form' }, { id: 6, name: 'Meta Ads' }];
const startBox = (config = {}, next_id = null) => ({ id: 1, kind: 'start', title: '', body: '', wait_minutes: 0, config: { trigger: null, webhook_ids: null, stage_id: null, stop_stage_ids: [], ...config }, next_id });
const CALL  = { id: 2, kind: 'call', title: 'fonio calls the lead', body: '', wait_minutes: 5, config: {}, next_id: 3 };
const MAIL  = { id: 3, kind: 'email', title: 'Welcome', body: 'Hello,\nthanks for asking.', wait_minutes: 0, config: {}, next_id: 4 };
const MOVE  = { id: 4, kind: 'move', title: '', body: '', wait_minutes: 2880, config: { stage_id: 32 }, next_id: null };
const FLOW  = { id: 10, name: 'New lead', nodes: [startBox({ trigger: 'lead', webhook_ids: [5] }, 2), CALL, MAIL, MOVE] };
const OTHER = { id: 11, name: 'No-show', nodes: [{ ...startBox(), id: 20 }] };
function fill({ manage = false, lang = 'en', flows = [FLOW, OTHER], shown = 10, list = [SALES], hooks = HOOKS, fonio = true, mail = { connection: { email: 'news@firma.de' } }, answers = {}, missing = [] } = {}) {
  F.__reset(answers, missing);
  F.__set('currentLang', lang); F.__set('pipelines', list); F.__set('journeyFlows', flows); F.__set('journeyWebhooks', hooks);
  F.__set('journeyManage', manage); F.__set('journeyLimits', { flows: 20, nodes: 60 }); F.__set('journeyFlowId', shown); F.__set('journeyFonio', fonio);
  F.__opt('mail', mail);
}
const modals = () => F.__page().log.filter(c => c[0] === 'modal').map(c => c[1]);
const press = what => F.__page().handlers[what]();

describe('markup', () => {
  test('sidebar: one link under Tools, visible to everyone, between Board and Analytics, with its own sprite icon', () => {
    assert.equal(count(html, 'data-page="journey"'), 1);
    const link = html.match(/<a href="#" class="sb-link" data-page="journey">[^\n]*<\/a>/);
    assert.ok(link, 'a plain sidebar link: never hidden');
    assert.match(link[0], /<use href="#i-journey"\/>/); assert.match(link[0], /<span class="sb-text" data-i18n="nav_journey">Workflows<\/span>/);
    assert.ok(html.indexOf('data-page="board"') < html.indexOf('data-page="journey"') && html.indexOf('data-page="journey"') < html.indexOf('data-page="analytics"'));
    assert.equal(count(html, '<symbol id="i-journey" viewBox="0 0 24 24">'), 1, 'the icon is in the sprite');
  });
  test('the page: its title, the line that says what it is, and the three places the script fills', () => {
    assert.ok(pageStart > 0);
    assert.match(page, /<h1 class="page-title"><svg class="ic" aria-hidden="true"><use href="#i-journey"\/><\/svg><span data-i18n="nav_journey">Workflows<\/span><\/h1>/);
    assert.match(page, /<p class="page-sub" data-i18n="jr_sub">Workflows say what happens to a lead/);
    for (const id of ['journey-actions', 'journey-toolbar', 'journey-board']) assert.equal(count(page, `id="${id}"`), 1, id);
  });
  test('the script is loaded once, after the helpers it uses', () => {
    assert.equal(count(html, '<script src="js/journey.js"></script>'), 1);
    for (const before of ['js/core.js', 'js/auth.js']) assert.ok(html.indexOf(`<script src="${before}">`) < html.indexOf('<script src="js/journey.js">'), before);
  });
});

describe('wiring', () => {
  test('opening the page loads it; a reload comes back to it; a language switch redraws it; logout clears it', () => {
    assert.match(sliceFn(auth, 'switchPage', 'auth.js'), /if \(page === 'journey'\)\s+await loadJourney\(\);/);
    assert.match(core, /^const APP_PAGES = \[[^\]]*'journey'[^\]]*\];/m);
    assert.match(sliceFn(core, 'setLanguage', 'core.js'), /if \(page === 'journey'\)\s+renderJourney\(\);/);
    assert.match(sliceFn(auth, 'resetClientState', 'auth.js'), /resetJourneyUI\(\);/);
  });
  test('the kinds, the limits and the refusal codes are the route\'s own', () => {
    const routeActions = new Function(`${route.match(/^const ACTIONS = \[[^\]]*\];/m)[0]} return ACTIONS;`)();
    assert.deepEqual(constOf('JOURNEY_ACTIONS'), routeActions);
    assert.deepEqual(routeActions, ACTIONS);
    assert.match(js, /^const JOURNEY_MAX_NAME = 80, JOURNEY_MAX_TITLE = 120, JOURNEY_MAX_TEXT = 20000, JOURNEY_MAX_WAIT = 365 \* 24 \* 60;/m);
    assert.match(route, /^const MAX_FLOWS = 20, MAX_NODES = 60, MAX_NAME = 80, MAX_TITLE = 120, MAX_BODY = 20000, MAX_WAIT = 365 \* 24 \* 60, MAX_IDS = 20;/m);
    const codes = [...route.slice(route.indexOf('const ERRORS = {'), route.indexOf('const refuse')).matchAll(/^\s+([a-z_]+):\s+\[/gm)].map(m => m[1]);
    assert.deepEqual(Object.keys(constOf('JOURNEY_ERRORS')).sort(), codes.sort(), 'every refusal code of the route has its sentence');
    for (const kind of ['start', ...ACTIONS]) assert.ok(html.includes(`<symbol id="i-${constOf('JOURNEY_ICONS')[kind]}"`), `the icon of ${kind} is in the sprite`);
  });
});

describe('both dictionaries', () => {
  // every 'jr_…' the script names: a whole key, or the start of one that is finished at run time ('jr_kind_' + kind)
  const literals = [...new Set([...js.matchAll(/'(jr_[a-z0-9_]+)'/g)].map(m => m[1]))];
  const used = literals.filter(k => !k.endsWith('_')), prefixes = literals.filter(k => k.endsWith('_'));
  test('every key the page uses exists in English and German, the built ones too; none is left unused', () => {
    assert.deepEqual(prefixes.sort(), ['jr_kind_', 'jr_unit_']);   // how a step came out is the record's word now (journey-history.js, jh_s_*)
    const built = [...['start', ...ACTIONS].map(k => 'jr_kind_' + k), ...Object.keys(constOf('JOURNEY_UNITS')).map(u => 'jr_unit_' + u), 'jr_sub', 'nav_journey'];
    assert.ok(used.length >= 60, `the page's own keys (${used.length})`);
    for (const k of [...used, ...built]) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jr_') && !used.includes(k) && !prefixes.some(p => k.startsWith(p)) && !html.includes(`"${k}"`)), []);
  });
  test('German speaks to nobody in particular: no du, no Sie', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jr_') || x === 'nav_journey')) assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
  });
  test('the page says in both languages when a workflow runs', () => {
    assert.match(dict.en.jr_sub, /A workflow runs while it is switched on\./);
    assert.match(dict.de.jr_sub, /Ein Workflow läuft, solange er eingeschaltet ist\./);
  });
  test('every short word the engine writes about a step has its sentence', () => {
    // the engine is utils/journey-run.js and what it calls: why a call step planned no call is fonio's file's, why an
    // email waits — a sending limit, a pause — the file's that keeps the limits (Part 17)
    const details = constOf('JOURNEY_DETAILS'), fs = require('node:fs'), path = require('node:path'), utils = path.join(__dirname, '..', '..', 'utils');
    const engine = fs.readdirSync(utils).filter(f => /^journey-.*\.js$/.test(f) || f === 'fonio-calls.js').map(f => fs.readFileSync(path.join(utils, f), 'utf8')).join('\n');
    for (const [word, key] of Object.entries(details)) { assert.ok(dict.en[key] && dict.de[key], key); assert.ok(engine.includes(`'${word}'`), `the engine writes '${word}'`); }
  });
  // Part 26: what a router's entry in the record says
  test('a router\'s entry says which routes a deal went down — by the numbers on the router\'s feet — or that none fitted', () => {
    fill();
    assert.deepEqual(['routes:2', 'routes:1,3', 'routes:1,2,3,4,5,6', 'else', 'paths_limit'].map(F.journeyDetailText),
      ['went down route 2', 'went down routes 1, 3', 'went down routes 1, 2, 3, 4, 5, 6', 'no route fitted: on along "else"', 'at too many places of the workflow at once: a route was left out']);
    for (const odd of ['routes:', 'routes:a', 'routes:1,', 'routes:1,,2', 'routes: 1', 'routes:1;2', 'Routes:1', 'routes']) assert.equal(F.journeyDetailText(odd), odd, `what is no list of numbers is shown as it is: ${odd}`);
    fill({ lang: 'de' });
    assert.deepEqual(['routes:2', 'routes:1,3', 'else', 'paths_limit'].map(F.journeyDetailText), ['Route 2 genommen', 'Routen 1, 3 genommen', 'keine Route passte: weiter über „sonst“', 'an zu vielen Stellen des Workflows zugleich: eine Route wurde ausgelassen']);
    assert.match(read('utils/journey-run.js'), /detail: `routes:\$\{went\.map\(r => r\.no\)\.join\(','\)\}`/, 'the engine writes the routes\' places, comma by comma');
    assert.equal(F.journeyStepText({ kind: 'router', title: 'Who gets what' }), 'Router: Who gets what');
  });
  test('why an email waits is said in both languages: a limit of the sending address, or a pause', () => {
    const details = constOf('JOURNEY_DETAILS');
    assert.deepEqual(['limit_day', 'limit_hour', 'limit_person', 'paused'].map(w => [details[w], dict.en[details[w]], dict.de[details[w]]]), [
      ['jr_d_limit_day', 'the daily limit of the sending address is reached', 'das Tageslimit der Absenderadresse ist erreicht'],
      ['jr_d_limit_hour', 'the hourly limit of the sending address is reached', 'das Stundenlimit der Absenderadresse ist erreicht'],
      ['jr_d_limit_person', 'the limit of emails per person per day is reached', 'das Limit an E-Mails pro Person pro Tag ist erreicht'],
      ['jr_d_paused', 'sending is paused', 'der Versand ist pausiert']]);
  });
});

describe('the wait', () => {
  test('as words: right away, then the largest unit it is a whole number of', () => {
    fill();
    assert.deepEqual([0, 1, 20, 60, 90, 120, 1440, 1500, 4320].map(m => F.journeyWaitText(m)), ['Right away', 'after 1 min', 'after 20 min', 'after 1 hour', 'after 90 min', 'after 2 hours', 'after 1 day', 'after 25 hours', 'after 3 days']);
    fill({ lang: 'de' });
    assert.deepEqual([0, 20, 60, 120, 1440, 4320].map(m => F.journeyWaitText(m)), ['Sofort', 'nach 20 Min.', 'nach 1 Stunde', 'nach 2 Stunden', 'nach 1 Tag', 'nach 3 Tagen']);
  });
  test('as the form shows it, and back; what the form holds is a whole number from 0 to 365 days, or it is refused', () => {
    for (const m of [0, 45, 60, 180, 1440, 2880, 1500, 525600]) { const p = F.journeyWaitParts(m); assert.equal(F.journeyWaitMinutes(String(p.n), p.unit), m, String(m)); }
    assert.deepEqual(F.journeyWaitParts(2880), { n: 2, unit: 'days' });
    for (const [n, unit] of [['', 'min'], ['1.5', 'hours'], ['-1', 'min'], ['abc', 'min'], ['366', 'days'], ['525601', 'min'], ['5', 'weeks'], [null, 'min']]) assert.equal(F.journeyWaitMinutes(n, unit), null, `${n} ${unit}`);
  });
});

describe('a workflow\'s boxes', () => {
  test('stand in the order of the lines, from the start; a box no line leads to is set apart', () => {
    const scrambled = { nodes: [MOVE, MAIL, startBox({}, 2), CALL, { id: 9, kind: 'task', title: 'lost', next_id: null }] };
    const { chain, loose } = F.journeyChain(scrambled);
    assert.deepEqual(chain.map(n => n.id), [1, 2, 3, 4]);
    assert.deepEqual(loose.map(n => n.id), [9]);
  });
  test('a line that leads back, or to a box that is gone, ends the chain instead of running for ever', () => {
    assert.deepEqual(F.journeyChain({ nodes: [startBox({}, 2), { ...CALL, next_id: 1 }] }).chain.map(n => n.id), [1, 2]);
    assert.deepEqual(F.journeyChain({ nodes: [startBox({}, 77)] }).chain.map(n => n.id), [1]);
    assert.deepEqual(F.journeyChain({ nodes: [CALL] }), { chain: [], loose: [CALL] }, 'without a start nothing is in the chain');
    for (const odd of [null, undefined, {}, { nodes: 'x' }]) assert.deepEqual(F.journeyChain(odd), { chain: [], loose: [] });
  });
  test('a stage is called by its name, with its pipeline\'s when there is more than one; a stage that is gone has none', () => {
    fill({ list: [SALES] });
    assert.equal(F.journeyStageName(32), 'Booked');
    fill({ list: [SALES, RENT] });
    assert.equal(F.journeyStageName(32), 'Booked (Sales)');
    assert.equal(F.journeyStageName(999), null);
  });
});

describe('a box', () => {
  test('the start: what it says, line by line; dashed while nothing is chosen', () => {
    fill({ manage: true });
    const empty = F.journeyBoxHtml(startBox());
    assert.match(empty, /^<button type="button" class="jr-box jr-start is-empty" data-box="1" data-kind="start">/);
    assert.match(empty, /<b>Start<\/b><\/span><span class="jr-title">Choose what starts this workflow<\/span>/);   // the words are the start's own (journey-start.js)
    const set = F.journeyBoxHtml(FLOW.nodes[0]);
    assert.match(set, /class="jr-box jr-start" data-box="1"/);
    assert.match(set, /<span class="jr-title">A lead arrives through a lead webhook<\/span><span class="jr-text">Only: Website form<\/span>/);
    assert.match(set, /<use href="#i-flag"\/>/);
  });
  test('an action: its kind and when it happens, its title, the start of its text on one line', () => {
    fill();
    const box = F.journeyBoxHtml(MAIL);
    assert.match(box, /^<button type="button" class="jr-box" data-box="3" data-kind="email">/);
    assert.match(box, /<span class="jr-meta"><b>Email<\/b><span>Right away<\/span><\/span>/);
    assert.match(box, /<span class="jr-title">Welcome<\/span><span class="jr-text">Hello, thanks for asking\.<\/span>/);
    assert.match(F.journeyBoxHtml(CALL), /<b>Call \(fonio\)<\/b><span>after 5 min<\/span>/);
    assert.match(F.journeyBoxHtml(MOVE), /<b>Move the deal<\/b><span>after 2 days<\/span><\/span>\s*<span class="jr-title">Move the deal to Booked<\/span>/);
    assert.match(F.journeyBoxHtml({ ...MOVE, config: { stage_id: 999 } }), /Move the deal to a stage that no longer exists/);
    assert.doesNotMatch(F.journeyBoxHtml(CALL), /jr-text|jr-warn/);
  });
  test('a step whose integration is not connected says so: a call without fonio, an email without an address', () => {
    fill({ fonio: false, mail: { connection: null } });
    assert.match(F.journeyBoxHtml(CALL), /<span class="jr-warn">.*fonio is not connected<\/span>/);
    assert.match(F.journeyBoxHtml(MAIL), /<span class="jr-warn">.*No email address is connected<\/span>/);
    assert.doesNotMatch(F.journeyBoxHtml(MOVE), /jr-warn/);
    fill({ fonio: true, mail: { connection: { email: 'a@b.de' } } });
    assert.doesNotMatch(F.journeyBoxHtml(CALL) + F.journeyBoxHtml(MAIL), /jr-warn/);
    fill({ mail: null });
    assert.match(F.journeyBoxHtml(MAIL), /jr-warn/, 'not read yet counts as not connected');
  });
  test('typed text is text: markup in a title, a text or a name never becomes markup', () => {
    fill({ hooks: [{ id: 5, name: '<img src=x onerror=alert(1)>' }] });
    const out = F.journeyBoxHtml({ ...MAIL, title: '<b>x</b>', body: '"><script>alert(2)</script>' }) + F.journeyBoxHtml(startBox({ trigger: 'lead', webhook_ids: [5] }));
    assert.doesNotMatch(out, /<img|<script|<b>x/);
    assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/); assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});

describe('the board', () => {
  test('a box stands where it was dragged to, or where the chain puts it: the start on top, each step under the one before', () => {
    assert.deepEqual(F.journeyPlaces(FLOW), { 1: { x: 40, y: 40 }, 2: { x: 40, y: 190 }, 3: { x: 40, y: 340 }, 4: { x: 40, y: 490 } });
    const moved = { ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 3 ? { ...n, x: 520, y: 80 } : n)) };
    assert.deepEqual(F.journeyPlaces(moved)[3], { x: 520, y: 80 });
    assert.deepEqual(F.journeyPlaces(moved)[4], { x: 40, y: 490 }, 'the others keep the chain\'s places');
    const loose = { nodes: [startBox(), { ...MAIL, id: 9, next_id: null }, { ...MAIL, id: 10, next_id: null }] };
    assert.deepEqual([F.journeyPlaces(loose)[9], F.journeyPlaces(loose)[10]], [{ x: 420, y: 40 }, { x: 420, y: 190 }], 'a box no line leads to stands in a column beside the chain');
    assert.deepEqual(F.journeyPlaces({ nodes: [{ ...startBox(), x: 1.5, y: 2 }] })[1], { x: 40, y: 40 }, 'a place that is no place is not used');
  });
  test('the board is as large as its boxes need, with room to drag one further', () => {
    assert.deepEqual(F.journeyCanvasSize({ 1: { x: 40, y: 40 }, 2: { x: 900, y: 600 } }), { w: 1440, h: 920 });
    assert.deepEqual(F.journeyCanvasSize({}), { w: 540, h: 320 });
  });
  test('a line runs from the foot of a box to the head of the next, as a soft curve', () => {
    assert.equal(F.journeyLinePath({ x: 40, y: 40, w: 300, h: 80 }, { x: 40, y: 190, w: 300, h: 80 }), 'M190 120 C190 156 190 154 190 190');
    assert.equal(F.journeyLinePath({ x: 0, y: 0, w: 300, h: 100 }, { x: 500, y: 400, w: 300, h: 60 }), 'M150 100 C150 250 650 250 650 400');
    assert.match(F.journeyLinePath({ x: 0, y: 300, w: 300, h: 80 }, { x: 400, y: 0, w: 300, h: 80 }), /^M150 380 C150 570 550 -190 550 0$/, 'a box above its own next: the line still leaves at the foot and arrives at the head');
  });
  test('every box at its place; for an owner or admin with the "+" under it that adds a step or draws a line', () => {
    fill({ manage: true });
    const out = F.journeyBoardHtml(FLOW);
    assert.match(out, /^<div class="jr-canvas can-edit" style="width:580px;height:810px"><svg class="jr-lines" width="580" height="810" aria-hidden="true"><defs><marker id="jr-arrow"/);
    assert.deepEqual([...out.matchAll(/<div class="jr-node" data-node="(\d+)" style="left:(\d+)px;top:(\d+)px">/g)].map(m => m.slice(1).join(',')), ['1,40,40', '2,40,190', '3,40,340', '4,40,490']);
    assert.deepEqual([...out.matchAll(/data-out="(\d+)"/g)].map(m => m[1]), ['1', '2', '3', '4']);
    assert.match(out, /<button type="button" class="jr-out" data-out="1" aria-label="Add a step, or drag onto another step to draw a line"/);
  });
  test('a member sees the boxes at their places and nothing to change them with', () => {
    fill({ manage: false });
    const out = F.journeyBoardHtml(FLOW);
    assert.match(out, /^<div class="jr-canvas" style=/);
    assert.doesNotMatch(out, /data-out|can-edit/);
    assert.equal(count(out, 'class="jr-node"'), 4);
  });
  test('above it: the workflows to choose from, whether the shown one runs, its activity — and for an owner or admin the switch, "Rename" and "Delete workflow"', () => {
    fill({ manage: true, shown: 11 });
    let bar = F.journeyToolbarHtml();
    assert.match(bar, /<select class="select select-sm jr-pick" aria-label="Workflow" onchange="setJourneyFlow\(this\.value\)"><option value="10">New lead<\/option><option value="11" selected>No-show<\/option><\/select>/);
    assert.match(bar, /<label class="jr-run"><input type="checkbox" class="switch" aria-label="The workflow runs" onchange="setJourneyActive\(this\.checked\)"><span>Off<\/span><\/label>/);
    assert.match(bar, /onclick="openJourneyActivity\(\)">.*<span>Activity<\/span>/);
    assert.match(bar, /onclick="journeyNameWindow\(journeyFlow\(\)\)">.*<span>Rename<\/span>/); assert.match(bar, /onclick="deleteJourneyFlow\(\)">.*<span>Delete workflow<\/span>/);
    assert.match(bar, /<span class="jr-hint">Drag a step to move it\./);
    fill({ manage: true, flows: [{ ...FLOW, active: true }] });
    assert.match(F.journeyToolbarHtml(), /class="switch" aria-label="The workflow runs" checked onchange="setJourneyActive\(this\.checked\)"><span>Running<\/span>/);
    fill({ manage: false, flows: [{ ...FLOW, active: true }] });
    bar = F.journeyToolbarHtml();
    assert.match(bar, /<span class="badge badge-success">Running<\/span>/);
    assert.doesNotMatch(bar, /switch|Rename|Delete workflow|jr-hint/);
    assert.match(bar, /Activity/, 'everyone may look at what a workflow did');
    fill({ flows: [], shown: null });
    assert.equal(F.journeyToolbarHtml(), '');
  });
  test('dropping a box keeps its place here at once and saves it; a place the server refuses is said', async () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'put /api/journey/nodes/3/place': { success: true } } });
    await F.journeyDropBox({ id: 3, nx: 500, ny: 120 });
    assert.deepEqual([F.__state().journeyFlows[0].nodes[2].x, F.__state().journeyFlows[0].nodes[2].y], [500, 120]);
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/3/place', { x: 500, y: 120 }]);
    assert.match(F.__page().els['journey-board'].innerHTML, /data-node="3" style="left:500px;top:120px"/);
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'put /api/journey/nodes/3/place': { error: 'x', code: 'place' } } });
    await F.journeyDropBox({ id: 3, nx: 1, ny: 1 });
    assert.ok(F.__page().log.some(c => c[0] === 'toast' && c[1] === 'The place could not be saved.'));
  });
  test('a "+" dropped on another box draws the line; dropped on nothing or on its own box, nothing is asked', async () => {
    const drawn = { ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 4 ? { ...n, next_id: 2 } : n)) };
    fill({ manage: true, answers: { 'put /api/journey/nodes/4/next': { flow: drawn } } });
    await F.journeyDropLine({ id: 4 }, 2);
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/4/next', { next_id: 2 }]);
    assert.equal(F.__state().journeyFlows[0].nodes[3].next_id, 2);
    fill({ manage: true });
    await F.journeyDropLine({ id: 4 }, null); await F.journeyDropLine({ id: 4 }, 4);
    assert.ok(!F.__page().log.some(c => c[0] === 'put'));
  });
  test('a line the server refuses is said in words; taking a line away asks the server for "no next box"', async () => {
    fill({ manage: true, answers: { 'put /api/journey/nodes/4/next': { error: 'x', code: 'line' } } });
    await F.journeyDropLine({ id: 4 }, 1);
    assert.ok(F.__page().log.some(c => c[0] === 'toast' && c[1] === 'A line leads to another step of the same workflow, never to the start and never round in a circle.'));
    const cut = { ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 2 ? { ...n, next_id: null } : n)) };
    fill({ manage: true, answers: { 'put /api/journey/nodes/2/next': { flow: cut } } });
    await F.journeyRemoveLine(2);
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/2/next', { next_id: null }]);
    assert.equal(F.__state().journeyFlows[0].nodes[1].next_id, null);
  });
  test('the hands of the board: a press that barely moves is a click, a drag ends without opening anything, a line is clicked away', () => {
    const tail = js.slice(js.indexOf("document.addEventListener('pointerdown'"));
    assert.match(tail, /if \(!journeyManage \|\| e\.button !== 0 \|\| !e\.target\.closest\) return;/, 'a member moves nothing');
    assert.match(tail, /if \(!d\.moved && Math\.hypot\(dx, dy\) < 5\) return;/);
    assert.match(tail, /journeyDragEnd = Date\.now\(\);/); assert.match(tail, /if \(Date\.now\(\) - journeyDragEnd < 350\) return;/);
    assert.match(tail, /if \(add\) openJourneyAdd\(Number\(add\.dataset\.out\), add, add\.dataset\.side, add\.dataset\.route\);\s+else if \(box\) openJourneyBox\(Number\(box\.dataset\.box\)\);\s+else if \(line && journeyManage\) ui\.menu\(\{ x: e\.clientX, y: e\.clientY \}, \[\{ label: t\('jr_line_remove'\)/);
    assert.match(tail, /const under = document\.elementFromPoint\(e\.clientX, e\.clientY\), target = under && under\.closest \? under\.closest\('\[data-node\]'\) : null;/);
  });
});

describe('the page', () => {
  test('draws the shown workflow; "New workflow" at the top for an owner or admin only', () => {
    fill({ manage: true });
    F.renderJourney();
    const els = F.__page().els;
    assert.match(els['journey-board'].innerHTML, /^<div class="jr-canvas can-edit" style="width:\d+px;height:\d+px"><svg class="jr-lines"/);
    assert.match(els['journey-actions'].innerHTML, /<button type="button" class="btn btn-primary btn-sm" onclick="journeyNameWindow\(null\)">.*<span>New workflow<\/span><\/button>/);
    fill({ manage: false });
    F.renderJourney();
    assert.equal(F.__page().els['journey-actions'].innerHTML, '');
  });
  test('no workflow yet: what a workflow is, and for a member who can add one', () => {
    fill({ manage: true, flows: [], shown: null });
    F.renderJourney();
    assert.match(F.__page().els['journey-board'].innerHTML, /<b>No workflow yet<\/b><div>A workflow begins with what sets it off, such as a new lead, and goes on with calls, emails and tasks, one step each\.<\/div>/);
    fill({ manage: false, flows: [], shown: null });
    F.renderJourney();
    assert.match(F.__page().els['journey-board'].innerHTML, /one step each\. An owner or admin can add one\.<\/div>/);
    fill({ missing: ['journey-board', 'journey-actions', 'journey-toolbar'] });
    assert.doesNotThrow(() => F.renderJourney());
  });
  const LIST = { 'get /api/journey': { flows: [FLOW, OTHER], webhooks: HOOKS, can_manage: true, max_flows: 20, max_nodes: 60 }, 'get /api/pipelines': [SALES, RENT], 'get /api/integrations/fonio': { configured: true, settings: {} } };
  test('loading reads the workflows, the stages and whether fonio is connected, and shows the first workflow', async () => {
    fill({ flows: [], shown: null, list: [], hooks: [], fonio: false, answers: LIST });
    await F.loadJourney();
    const s = F.__state();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'get').map(c => c[1]).sort(), ['/api/integrations/fonio', '/api/journey', '/api/pipelines']);
    assert.deepEqual([s.journeyFlows.length, s.journeyWebhooks.length, s.journeyManage, s.journeyFlowId, s.journeyFonio, s.pipelines.length], [2, 2, true, 10, true, 2]);
    assert.match(F.__page().els['journey-board'].innerHTML, /data-box="1"/);
  });
  test('the workflow that was shown stays; one that is gone is replaced by the first; fonio not connected is known', async () => {
    fill({ shown: 11, answers: { ...LIST, 'get /api/integrations/fonio': { configured: false } } });
    await F.loadJourney();
    assert.deepEqual([F.__state().journeyFlowId, F.__state().journeyFonio], [11, false]);
    fill({ shown: 77, answers: LIST });
    await F.loadJourney();
    assert.equal(F.__state().journeyFlowId, 10);
  });
  test('an answer that is an error leaves no workflows, nothing to change, and the stages as they were', async () => {
    fill({ manage: true, answers: { 'get /api/journey': { error: 'Unauthorized' }, 'get /api/pipelines': { error: 'x' }, 'get /api/integrations/fonio': { error: 'x' } } });
    await F.loadJourney();
    const s = F.__state();
    assert.deepEqual([s.journeyFlows, s.journeyManage, s.journeyFlowId, s.journeyFonio, s.pipelines.length], [[], false, null, false, 1]);
  });
  test('the server\'s answer to a change takes the workflow\'s place and is shown; choosing another workflow shows that one', () => {
    fill({ manage: true });
    F.journeyApply({ ...FLOW, name: 'Renamed' });
    assert.deepEqual([F.__state().journeyFlows.map(f => f.name), F.__state().journeyFlowId], [['Renamed', 'No-show'], 10]);
    F.journeyApply({ id: 12, name: 'Third', nodes: [startBox()] });
    assert.deepEqual([F.__state().journeyFlows.length, F.__state().journeyFlowId], [3, 12]);
    F.journeyApply(null); F.journeyApply({ id: 13 });
    assert.equal(F.__state().journeyFlows.length, 3, 'an answer without a workflow changes nothing');
    F.setJourneyFlow('11');
    assert.equal(F.__state().journeyFlowId, 11);
    F.setJourneyFlow('999');
    assert.equal(F.__state().journeyFlowId, 11);
  });
  test('logout leaves nothing of the workflows behind', () => {
    fill({ manage: true });
    F.resetJourneyUI();
    const s = F.__state();
    assert.deepEqual([s.journeyFlows, s.journeyWebhooks, s.journeyManage, s.journeyFlowId, s.journeyFonio], [[], [], false, null, false]);
  });
});

describe('running', () => {
  test('the switch asks the server, shows what it answers and says what that means', async () => {
    fill({ manage: true, answers: { 'put /api/journey/flows/10': { flow: { ...FLOW, active: true } } } });
    await F.setJourneyActive(true);
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/flows/10', { active: true }]);
    assert.equal(F.__state().journeyFlows[0].active, true);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'The workflow runs now. Deals that arrive from now on are taken in.']]);
    fill({ manage: true, flows: [{ ...FLOW, active: true }], answers: { 'put /api/journey/flows/10': { flow: { ...FLOW, active: false } } } });
    await F.setJourneyActive(false);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'The workflow is off. Nothing more happens until it is switched on again.']]);
  });
  test('a workflow without a start cannot be switched on: said in words, and the switch goes back', async () => {
    fill({ manage: true, lang: 'de', answers: { 'put /api/journey/flows/10': { error: 'x', code: 'start' } } });
    await F.setJourneyActive(true);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'Einen Auslöser wählen, mit allem, was dieser Auslöser braucht.']]);
    assert.ok(!F.__state().journeyFlows[0].active);
    assert.doesNotMatch(F.__page().els['journey-toolbar'].innerHTML, /" checked /, 'drawn again from what is true');
    fill({ manage: false });
    await F.setJourneyActive(true);
    assert.ok(!F.__page().log.some(c => c[0] === 'put'), 'a member switches nothing');
  });
  test('while a workflow runs its start is read, not changed, and says why', () => {
    fill({ manage: true, flows: [{ ...FLOW, active: true }] });
    F.openJourneyBox(1);
    const [m] = modals();
    assert.equal(m.title, 'Step');
    assert.doesNotMatch(m.body, /<form|<select/);
    assert.match(m.body, /<p class="help">Switch the workflow off to change its start\.<\/p>/);
  });
  // Part 15: what happened is the record's list (journey-history.js, tests/client/journey-history-ui.test.js); the
  // top of the window is what it was: the counts, and who waits for which step.
  test('the activity\'s top: how many deals wait, are through or were stopped, and who waits for which step', () => {
    fill();
    const out = F.journeyActivityHtml({ counts: { waiting: 2, working: 1, done: 5, stopped: 1, old: 9 },
      waiting: [{ deal_title: 'Wohnung 3', due_at: '2026-11-20T09:00:00.000Z', kind: 'email', title: 'Second mail' }, { deal_title: '<b>x</b>', due_at: '2026-11-21T09:00:00.000Z', kind: 'wait', title: '' }],
      log: [{ deal_title: 'Wohnung 3', kind: 'email', title: 'Welcome', status: 'done', detail: 'lead@example.de', created_at: '2026-11-19T09:00:00.000Z' }] });
    assert.match(out, /<p class="jr-act-counts">3 waiting, 5 finished, 1 stopped<\/p>/);
    assert.match(out, /<li class="jr-act-row"><b>Wohnung 3<\/b><span>Email: Second mail<\/span><span class="jr-act-tail">due 20 Nov 2026, \d\d:\d\d<\/span><\/li>/);
    assert.match(out, /<li class="jr-act-row"><b>&lt;b&gt;x&lt;\/b&gt;<\/b><span>Wait<\/span>/, 'what a deal is called is text; a step without a title says its kind');
    assert.doesNotMatch(out, /Welcome|lead@example\.de/, 'what the steps did is not listed here any more: it is the record under it');
    const empty = F.journeyActivityHtml({});
    assert.match(empty, /0 waiting, 0 finished, 0 stopped/); assert.match(empty, /No deal is waiting\./);
  });
  test('what a step is called, and the engine\'s short words as sentences — shared with the record', () => {
    fill();
    assert.deepEqual([F.journeyStepText({ kind: 'email', title: 'Welcome' }), F.journeyStepText({ kind: 'wait', title: '' }), F.journeyStepText({ kind: 'weather', title: 'Rain' }), F.journeyStepText({ kind: 'constructor' }), F.journeyStepText(null)],
      ['Email: Welcome', 'Wait', 'Rain', '', ''], 'a kind this page does not know says its title alone');
    // why a call step planned no call is said in words, in the page's language; a word nobody knows is shown as it is
    const said = ['no_email', 'no_contact', 'no_phone', 'bad_number', 'number_not_allowed', 'already_scheduled', 'no_hours', 'skipped', 'unknown_kind', 'something_new', 'constructor', 'rejected: <i>no</i>', '', null].map(F.journeyDetailText);
    assert.deepEqual(said, ['the contact has no email address', 'the deal has no contact', 'the contact has no phone number', 'the phone number cannot be called as it is written',
      'this number is not among the numbers fonio may call', 'a call to this number is already planned', 'no calling hours are set in the fonio settings', 'no call was planned',
      'a kind of step this version does not know', 'something_new', 'constructor', 'Google refused the email: <i>no</i>', '', '']);
    // why an email waits at its step (Part 17): a limit of the sending address, or a pause
    assert.deepEqual(['limit_day', 'limit_hour', 'limit_person', 'paused'].map(F.journeyDetailText), ['the daily limit of the sending address is reached', 'the hourly limit of the sending address is reached',
      'the limit of emails per person per day is reached', 'sending is paused']);
    fill({ lang: 'de' });
    assert.deepEqual([F.journeyDetailText('no_phone'), F.journeyDetailText('rejected: quota')], ['der Kontakt hat keine Telefonnummer', 'Google hat die E-Mail abgelehnt: quota']);
    assert.deepEqual(['limit_day', 'limit_hour', 'limit_person', 'paused'].map(F.journeyDetailText), ['das Tageslimit der Absenderadresse ist erreicht', 'das Stundenlimit der Absenderadresse ist erreicht',
      'das Limit an E-Mails pro Person pro Tag ist erreicht', 'der Versand ist pausiert']);
    assert.match(F.journeyWhen('2026-11-19T09:00:00.000Z'), /^19\.11\.2026, \d\d:\d\d$/); assert.equal(F.journeyWhen(null), '');
    fill();
    assert.match(F.journeyWhen('2026-11-19T09:00:00.000Z'), /^19 Nov 2026, \d\d:\d\d$/);
  });
  test('"Activity" reads the shown workflow\'s activity and opens it under the workflow\'s name', async () => {
    fill({ answers: { 'get /api/journey/flows/10/activity': { counts: {}, waiting: [], log: [] } } });
    await F.openJourneyActivity();
    assert.equal(modals()[0].title, 'Activity: New lead');
    fill({ answers: { 'get /api/journey/flows/10/activity': { error: 'Not found', code: 'not_found' } } });
    await F.openJourneyActivity();
    assert.deepEqual([modals().length, F.__page().log.filter(c => c[0] === 'toast')[0][1]], [0, 'This no longer exists.']);
  });
});

describe('a deal put into a workflow by hand', () => {
  const LIST = flows => ({ 'get /api/journey': { flows, webhooks: [], can_manage: false, max_flows: 20, max_nodes: 60 } });
  test('offers the workflows that run; choosing one sends the deal there and says so', async () => {
    fill({ answers: { ...LIST([{ ...FLOW, active: true }, OTHER, { id: 12, name: 'Nurture <x>', active: true, nodes: [] }]), 'post /api/journey/flows/12/include': { success: true } } });
    await F.journeyIncludeDeal(60, 'Wohnung 3');
    const [m] = modals();
    assert.equal(m.title, 'Add to a workflow');
    assert.deepEqual([...m.body.matchAll(/data-jr-include="(\d+)"/g)].map(x => x[1]), ['10', '12'], 'only the workflows that are switched on');
    assert.match(m.body, /Nurture &lt;x&gt;/);
    await F.__page().handlers['click [data-jr-include]']({}, { dataset: { jrInclude: '12' } });
    const log = F.__page().log;
    assert.deepEqual(log.find(c => c[0] === 'post'), ['post', '/api/journey/flows/12/include', { deal_id: 60 }]);
    assert.deepEqual(log.filter(c => ['close', 'toast'].includes(c[0])), [['close'], ['toast', '"Wohnung 3" is now in "Nurture <x>".']]);
  });
  test('no workflow runs: said, and no window; a refusal is said in words', async () => {
    fill({ answers: LIST([FLOW, OTHER]) });
    await F.journeyIncludeDeal(60, 'Wohnung 3');
    assert.deepEqual([modals().length, F.__page().log.filter(c => c[0] === 'toast')[0][1]], [0, 'No workflow is switched on.']);
    fill({ answers: { ...LIST([{ ...FLOW, active: true }]), 'post /api/journey/flows/10/include': { error: 'x', code: 'inactive' } } });
    await F.journeyIncludeDeal(60, 'Wohnung 3');
    await F.__page().handlers['click [data-jr-include]']({}, { dataset: { jrInclude: '10' } });
    assert.ok(F.__page().log.some(c => c[0] === 'toast' && c[1] === 'The workflow is not switched on.'));
  });
  test('a deal\'s menu offers it, in both languages', () => {
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /\.\.\.\(typeof journeyIncludeDeal === 'function' \? \[\{ label: t\('jr_include'\), icon: 'journey', onSelect: \(\) => journeyIncludeDeal\(S\.d\.id, S\.d\.title\) \}\] : \[\]\)/);
    assert.equal(dict.en.jr_include, 'Add to a workflow'); assert.equal(dict.de.jr_include, 'In einen Workflow aufnehmen');
    assert.deepEqual([dict.en.nav_journey, dict.de.nav_journey], ['Workflows', 'Workflows'], 'the page is called Workflows, not Customer Journey (asked 2026-11-19)');
    for (const lang of ['en', 'de']) for (const k of Object.keys(dict[lang]).filter(x => /^(jr_|jm_|nav_journey)/.test(x))) assert.doesNotMatch(dict[lang][k], /Journey|journey/, lang + ' ' + k);
  });
});

describe('an email step', () => {
  test('the preview: placeholders become sample values; plain text keeps its line breaks; HTML is taken as it is', () => {
    const plain = F.journeyPreviewHtml('Hallo {{first_name}},\n1 < 2 & {{nope}} {{vorname}} von {{firma}}');
    assert.match(plain, /^<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><\/head><body style="margin:14px;background:#fff"><div style="[^"]*">Hallo Erika,<br>1 &lt; 2 &amp; \{\{nope\}\} Erika von Muster GmbH<\/div><\/body><\/html>$/);
    const html = F.journeyPreviewHtml('<h1 style="color:#18345D">Hi {{name}}</h1><a href="{{unsubscribe}}">x</a>');
    assert.match(html, /<body style="margin:14px;background:#fff"><h1 style="color:#18345D">Hi Erika Musterfrau<\/h1><a href="#">x<\/a><\/body>/);
    assert.match(F.journeyPreviewHtml(''), /<body[^>]*><div[^>]*><\/div><\/body>/);
  });
  test('its window: the text as code, the variables to put in, a preview in a frame that can run nothing, and the test for a saved step', () => {
    fill({ manage: true });
    F.openJourneyBox(3);
    const [m] = modals();
    assert.equal(m.size, 'xl');
    assert.match(m.body, /<textarea class="textarea jr-code" id="jr-abc1234-text" rows="12" maxlength="20000" spellcheck="false">/);
    // the variables are journey-vars.js (Part 14): "Insert variable" with the three most used beside it; everything about them is tested in journey-vars-ui.test.js
    assert.match(m.body, /<button type="button" class="btn btn-secondary btn-sm" data-jv-menu aria-haspopup="menu">.*<span>Insert variable<\/span><\/button>/);
    assert.deepEqual([...m.body.matchAll(/data-jv-put="(\{\{[a-z_]+\}\})"/g)].map(x => x[1]), ['{{first_name}}', '{{name}}', '{{company}}']);
    assert.doesNotMatch(m.body, /data-jr-ph/);
    assert.match(m.body, /<iframe class="jr-preview" id="jr-abc1234-preview" sandbox="" title="Preview"><\/iframe>/, 'sandbox with nothing allowed: no script, not the CRM\'s origin');
    assert.match(m.body, /<button type="button" class="btn btn-secondary btn-sm" data-jr-test>.*<span>Send a test email to me<\/span><\/button>/);
    assert.match(sliceFn(js, 'openJourneyBox', 'journey.js'), /on\(w\.m\.el, 'input', 'textarea', show\);[\s\S]*\n    show\(\);\n  \}/, 'drawn when the window opens, and again on every keystroke');
    F.openJourneyBox(null, { kind: 'email', afterId: 3 });
    assert.doesNotMatch(modals()[1].body, /data-jr-test/, 'a step that is not saved yet cannot be tested');
    F.openJourneyBox(2);
    assert.doesNotMatch(modals()[2].body, /jr-preview|data-jv-/, 'a call has no preview and no variables');
  });
  test('typing redraws the preview; a variable goes in where the cursor is', () => {
    fill({ manage: true });
    F.openJourneyBox(3);
    const f = F.__page().fields, h = F.__page().handlers;
    f.text.value = '<b>Neu</b>';
    h['input textarea']();
    assert.match(f.preview.srcdoc, /<b>Neu<\/b>/);
    f.text.value = 'Hallo !'; f.text.selectionStart = 6; f.text.selectionEnd = 6;
    h['click [data-jv-put]']({}, { dataset: { jvPut: '{{first_name}}' } });
    assert.equal(f.text.value, 'Hallo {{first_name}}!');
    assert.match(f.preview.srcdoc, /Hallo Erika!/);
  });
  test('the test sends the saved step and says where it went, or why not', async () => {
    fill({ manage: true, answers: { 'post /api/journey/nodes/3/test': { success: true, to: 'olga@firma.de' } } });
    F.openJourneyBox(3);
    const btn = { disabled: false };
    await F.__page().handlers['click [data-jr-test]']({}, btn);
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post'), ['post', '/api/journey/nodes/3/test', {}]);
    assert.deepEqual([F.__page().fields.note.textContent, F.__page().fields.note.hidden, btn.disabled], ['Test email sent to olga@firma.de.', false, false]);
    for (const [answer, sentence] of [[{ error: 'x', code: 'not_connected' }, 'No address is connected.'], [{ error: 'x', code: 'rejected', detail: 'Mail service not enabled' }, 'Google refused the email: Mail service not enabled'],
      [{ error: 'x', code: 'gone' }, 'Google no longer accepts this connection. Please sign in with Google again.'], [undefined, 'That did not work. Please try again.'],
      // the safeguards of the sending address (Part 17): no test while sending is paused, or while its day is full
      [{ error: 'x', code: 'paused' }, 'Sending is paused. A test email can go out when the pause is over.'],
      [{ error: 'x', code: 'limit' }, 'The daily limit of this address is reached. A test email can go out when there is room again.']]) {
      fill({ manage: true, answers: { 'post /api/journey/nodes/3/test': answer } });
      F.openJourneyBox(3);
      const btn = { disabled: false };
      await F.__page().handlers['click [data-jr-test]']({}, btn);
      assert.deepEqual([F.__page().fields.note.textContent, F.__page().fields.note.hidden, btn.disabled], [sentence, false, false]);
    }
    fill({ manage: true, lang: 'de', answers: { 'post /api/journey/nodes/3/test': { error: 'x', code: 'limit' } } });
    F.openJourneyBox(3);
    await F.__page().handlers['click [data-jr-test]']({}, { disabled: false });
    assert.equal(F.__page().fields.note.textContent, 'Das Tageslimit dieser Adresse ist erreicht. Eine Test-E-Mail kann hinausgehen, sobald wieder Platz ist.');
  });
  test('"limit" means the sending address\'s day only to a test email: to every other request it is the number of workflows', () => {
    fill();
    assert.equal(F.journeyTestErrorText({ error: 'x', code: 'limit' }), 'The daily limit of this address is reached. A test email can go out when there is room again.');
    assert.equal(F.journeyErrorText({ error: 'x', code: 'limit' }), 'A workspace holds at most 20 workflows.');
    for (const res of [{ error: 'x', code: 'paused' }, { error: 'x', code: 'gone' }, { error: 'x', code: 'nodes_limit' }, { error: 'x', code: 'rejected', detail: 'quota' }, { error: 'x' }, undefined, null])
      assert.equal(F.journeyTestErrorText(res), F.journeyErrorText(res), JSON.stringify(res));
    assert.equal(count(js, 'journeyTestErrorText('), 2, 'defined once and used once: by the step window\'s test');
    assert.match(js, /say\(!res \|\| res\.error \|\| !res\.success \? journeyTestErrorText\(res\) : tf\('jr_test_ok', \{ to: res\.to \}\)/);
  });
});

describe('a workflow\'s name', () => {
  test('a new workflow: named, sent once, shown', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows': { flow: { id: 12, name: 'Third', nodes: [startBox()] } } } });
    F.journeyNameWindow(null);
    const [m] = modals();
    assert.equal(m.title, 'New workflow');
    assert.match(m.body, /<form id="jr-abc1234" novalidate class="col" style="gap:14px;padding-top:4px">/);
    assert.match(m.body, /<input class="input" id="jr-abc1234-name" maxlength="80"[^>]*value="" autofocus>/);
    F.__fill({ name: '  Third ' });
    await press('click [data-jr-save]');
    const log = F.__page().log;
    assert.deepEqual(log.find(c => c[0] === 'post'), ['post', '/api/journey/flows', { name: 'Third' }]);
    assert.deepEqual(log.filter(c => ['close', 'toast'].includes(c[0])), [['close'], ['toast', 'Workflow saved']]);
    assert.deepEqual([F.__state().journeyFlows.length, F.__state().journeyFlowId], [3, 12]);
  });
  test('another name for a workflow goes to its own address; no name is said in the window', async () => {
    fill({ manage: true, answers: { 'put /api/journey/flows/10': { flow: { ...FLOW, name: 'Welcome' } } } });
    F.journeyNameWindow(FLOW);
    assert.equal(modals()[0].title, 'Rename workflow');
    assert.match(modals()[0].body, /value="New lead" autofocus>/);
    F.__fill({ name: '   ' });
    await press('click [data-jr-save]');
    assert.deepEqual([F.__page().fields.err.textContent, F.__page().fields.name.focused], ['A workflow needs a name of up to 80 characters.', 1]);
    assert.ok(!F.__page().log.some(c => c[0] === 'put'));
    F.__fill({ name: 'Welcome' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/flows/10', { name: 'Welcome' }]);
    assert.equal(F.__state().journeyFlows[0].name, 'Welcome');
  });
  test('a refusal is said in the window in the page\'s language and the window stays; a member gets no window', async () => {
    fill({ manage: true, lang: 'de', answers: { 'post /api/journey/flows': { error: 'x', code: 'limit' } } });
    F.journeyNameWindow(null);
    F.__fill({ name: 'X' });
    await press('click [data-jr-save]');
    assert.equal(F.__page().fields.err.textContent, 'Ein Arbeitsbereich fasst höchstens 20 Workflows.');
    assert.ok(!F.__page().log.some(c => c[0] === 'close'));
    fill({ manage: false });
    assert.equal(F.journeyNameWindow(null), null);
    assert.deepEqual(modals(), []);
  });
  test('deleting a workflow asks first, by its name; "yes" removes it and shows the next one', async () => {
    fill({ manage: true, answers: { 'del /api/journey/flows/10': { success: true } } });
    F.__opt('confirm', false);
    await F.deleteJourneyFlow();
    const asked = F.__page().log.find(c => c[0] === 'confirm')[1];
    assert.deepEqual([asked.title, asked.message, asked.danger], ['Delete this workflow?', '"New lead" and all its steps are deleted.', true]);
    assert.ok(!F.__page().log.some(c => c[0] === 'del'));
    F.__opt('confirm', true);
    await F.deleteJourneyFlow();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'del'), ['del', '/api/journey/flows/10']);
    assert.deepEqual([F.__state().journeyFlows.map(f => f.id), F.__state().journeyFlowId], [[11], 11]);
    assert.ok(F.__page().log.some(c => c[0] === 'toast' && c[1] === 'Workflow deleted'));
  });
  test('a delete the server refuses changes nothing and says why', async () => {
    fill({ manage: true, answers: { 'del /api/journey/flows/10': { error: 'x', code: 'forbidden' } } });
    await F.deleteJourneyFlow();
    assert.equal(F.__state().journeyFlows.length, 2);
    assert.ok(F.__page().log.some(c => c[0] === 'toast' && c[1] === 'Only owners and admins can change workflows.'));
  });
});

describe('adding a step', () => {
  test('the "+" lists the nine kinds of step, fonio\'s call first, then the wait, the branch and the router; choosing one opens its form', () => {
    fill({ manage: true });
    const anchor = { id: 'plus' };
    F.openJourneyAdd(2, anchor);
    const [, at, items] = F.__page().log.find(c => c[0] === 'menu');
    assert.equal(at, anchor);
    assert.equal(items[0].heading, 'Add step');
    assert.deepEqual(items.slice(1).map(i => [i.label, i.icon]), [['Call (fonio)', 'phone'], ['Email', 'mail'], ['WhatsApp', 'message-circle'], ['SMS', 'message'], ['Task', 'check-square'], ['Move the deal', 'arrow-up-right'], ['Wait', 'clock'], ['If / else', 'help'], ['Router', 'columns']]);
    items[2].onSelect();
    assert.equal(modals()[0].title, 'New step: Email');
  });
  test('a member gets no list', () => {
    fill({ manage: false });
    F.openJourneyAdd(2, {});
    assert.ok(!F.__page().log.some(c => c[0] === 'menu'));
  });
  test('a new email goes in behind the box whose "+" was pressed', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyBox(null, { kind: 'email', afterId: 3 });
    const [m] = modals();
    assert.match(m.body, /<label class="label" for="jr-abc1234-title">Subject<\/label>/); assert.match(m.body, /<label class="label" for="jr-abc1234-text">Text of the email \(plain text or HTML\)<\/label>/);
    assert.match(m.body, /id="jr-abc1234-n" type="number" min="0" step="1" inputmode="numeric" value="0">/);
    assert.doesNotMatch(m.footer, /data-jr-delete/);
    F.__fill({ n: '2', unit: 'days', title: '  Second mail ', text: 'Hello again' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post'), ['post', '/api/journey/flows/10/nodes', { title: 'Second mail', body: 'Hello again', wait_minutes: 2880, config: { footer: true }, kind: 'email', after_id: 3 }]);   // the line at the end: on (Part 19)
    assert.deepEqual(F.__page().log.filter(c => ['close', 'toast'].includes(c[0])), [['close'], ['toast', 'Step saved']]);
  });
  test('a call comes with its title filled in and says who makes it; without fonio it says that too', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'call', afterId: 1 });
    assert.match(modals()[0].body, /value="fonio calls the lead" autofocus>/);
    assert.match(modals()[0].body, /fonio makes the call with the assistant and the settings under Integrations, fonio\.<\/p>/);
    fill({ manage: true, fonio: false });
    F.openJourneyBox(null, { kind: 'call', afterId: 1 });
    assert.match(modals()[0].body, /<b class="jr-bad">fonio is not connected<\/b>/);
    fill({ manage: true, mail: { connection: null } });
    F.openJourneyBox(null, { kind: 'email', afterId: 1 });
    assert.match(modals()[0].body, /<b class="jr-bad">No email address is connected<\/b>/);
  });
  test('a move asks for a stage instead of a title and a text', async () => {
    fill({ manage: true, list: [SALES, RENT], answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyBox(null, { kind: 'move', afterId: 4 });
    const [m] = modals();
    assert.match(m.body, /<optgroup label="Sales"><option value="31">New<\/option><option value="32">Booked<\/option><\/optgroup><optgroup label="Rentals">/);
    assert.doesNotMatch(m.body, /jr-abc1234-title"|jr-abc1234-text"/);
    F.__fill({ n: '0', unit: 'min', stage: '' });
    await press('click [data-jr-save]');
    assert.equal(F.__page().fields.err.textContent, 'Choose a stage of this workspace.');
    F.__fill({ stage: '32' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post')[2], { title: '', body: '', wait_minutes: 0, config: { stage_id: 32 }, kind: 'move', after_id: 4 });
  });
  test('no title, or a wait that is no whole number: said in the window, nothing sent', async () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'task', afterId: 1 });
    F.__fill({ n: '0', unit: 'min', title: '  ', text: '' });
    await press('click [data-jr-save]');
    assert.deepEqual([F.__page().fields.err.textContent, F.__page().fields.title.focused], ['A step needs a title of up to 120 characters.', 1]);
    F.__fill({ n: '1.5', title: 'x' });
    await press('click [data-jr-save]');
    assert.deepEqual([F.__page().fields.err.textContent, F.__page().fields.n.focused], ['The wait is a whole number, from 0 up to 365 days.', 1]);
    assert.ok(!F.__page().log.some(c => c[0] === 'post' || c[0] === 'close'));
    F.__page().handlers['input input, select, textarea']();
    assert.equal(F.__page().fields.err.hidden, true, 'typing takes the sentence away');
  });
  test('a refusal of the server, or a request that never arrived, is said in the window, which stays', async () => {
    for (const [answer, sentence] of [[{ error: 'x', code: 'nodes_limit' }, 'A workflow holds at most 60 steps.'], [{ error: 'x', code: 'after' }, 'The step this one should follow no longer exists.'], [undefined, 'That did not work. Please try again.']]) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': answer } });
      F.openJourneyBox(null, { kind: 'task', afterId: 1 });
      F.__fill({ n: '0', unit: 'min', title: 'x', text: '' });
      await press('click [data-jr-save]');
      assert.equal(F.__page().fields.err.textContent, sentence);
      assert.ok(!F.__page().log.some(c => c[0] === 'close'));
    }
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'task', afterId: 1 });
    F.__fill({ n: '0', unit: 'min', title: 'x', text: '' }); F.__opt('throw', true);
    await assert.doesNotReject(press('click [data-jr-save]'));
    assert.equal(F.__page().fields.err.textContent, 'That did not work. Please try again.');
  });
  test('nothing opens for a kind that is none, without a workflow, or for a member who wants to add', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'start', afterId: 1 }); F.openJourneyBox(null, null); F.openJourneyBox(999);
    fill({ manage: true, shown: null });
    F.openJourneyBox(null, { kind: 'email', afterId: 1 });
    fill({ manage: false });
    F.openJourneyBox(null, { kind: 'email', afterId: 1 });
    assert.deepEqual(modals(), []);
  });
});

describe('an existing step', () => {
  test('its form holds what was saved, the wait in its largest unit, and saving replaces it at its own address', async () => {
    fill({ manage: true, answers: { 'put /api/journey/nodes/4': { flow: FLOW } } });
    F.openJourneyBox(4);
    const [m] = modals();
    assert.equal(m.title, 'Edit step: Move the deal');
    assert.match(m.body, /id="jr-abc1234-n"[^>]*value="2">/); assert.match(m.body, /<option value="days" selected>days<\/option>/); assert.match(m.body, /<option value="32" selected>Booked<\/option>/);
    assert.match(m.footer, /^<button class="btn btn-danger-ghost jr-foot-left" data-jr-delete>Delete<\/button>/);
    F.__fill({ n: '3', unit: 'days', stage: '31' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/4', { title: '', body: '', wait_minutes: 4320, config: { stage_id: 31 } }]);
  });
  // Found by the bug hunt of 2026-11-19 (the page run with its real scripts): four things a browser shows and a
  // stand-in does not.
  test('a text that begins with an empty line keeps it: the line break a browser drops after the tag is one of the window\'s own', () => {
    fill({ manage: true, flows: [{ id: 10, name: 'X', nodes: [startBox({}, 8), { id: 8, kind: 'email', title: 'Hi', body: '\n<p>Hi</p>\n', wait_minutes: 0, config: {}, next_id: null }] }] });
    F.openJourneyBox(8);
    assert.match(modals()[0].body, /spellcheck="false">\n\n&lt;p&gt;Hi&lt;\/p&gt;\n<\/textarea>/, 'two line breaks: the browser takes the first, the text\'s own stays');
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'task', afterId: 2 });
    assert.match(modals()[0].body, /spellcheck="true">\n<\/textarea>/);
  });
  test('a window that says "this is missing" lets its form go, so the next Enter is not swallowed; a save that went through does not', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows': { flow: { id: 12, name: 'Third', nodes: [startBox()] } } } });
    F.journeyNameWindow(null);
    const form = F.__page().fields['#jr-abc1234'] = { _submitting: true };   // as core.js leaves a form it has just seen submitted
    F.__fill({ name: '   ' });
    await press('click [data-jr-save]');
    assert.equal(F.__page().fields.err.textContent, 'A workflow needs a name of up to 80 characters.');
    assert.equal(form._submitting, false, 'nothing was saved: Enter works again at once');
    form._submitting = true;
    F.__fill({ name: 'Third' });
    await press('click [data-jr-save]');
    assert.equal(form._submitting, true, 'saved: Enter pressed twice still saves once');
    assert.equal(F.__page().log.filter(c => c[0] === 'post').length, 1);
  });
  test('a pipeline without stages comes with one entry of nulls: it is no stage in any list here', () => {
    fill({ manage: true, list: [SALES, { id: 9, name: 'Empty', stages: [{ id: null, name: null }] }, { id: 8, name: 'None' }] });
    assert.deepEqual(F.journeyPipelines().map(p => p.stages.map(s => s.id)), [[31, 32], [], []]);
    assert.doesNotMatch(F.journeyStageOptions(''), /value="null"|>null</);
    assert.match(F.journeyStageOptions(''), /<optgroup label="Empty"><\/optgroup>/);
  });
  test('what is in a step is text in the form too', () => {
    fill({ manage: true, flows: [{ id: 10, name: 'X', nodes: [startBox({}, 8), { id: 8, kind: 'email', title: '"><b>x</b>', body: '</textarea><script>alert(1)</script>', wait_minutes: 0, config: {}, next_id: null }] }] });
    F.openJourneyBox(8);
    assert.doesNotMatch(modals()[0].body, /<script|<b>x/);
    assert.match(modals()[0].body, /value="&quot;&gt;&lt;b&gt;x&lt;\/b&gt;" autofocus>/);
  });
  test('deleting asks first, by the step\'s title; "yes" deletes it and shows the workflow as the server answers it', async () => {
    const after = { ...FLOW, nodes: FLOW.nodes.filter(n => n.id !== 3) };
    fill({ manage: true, answers: { 'del /api/journey/nodes/3': { flow: after } } });
    F.openJourneyBox(3);
    F.__opt('confirm', false);
    await press('click [data-jr-delete]');
    const asked = F.__page().log.find(c => c[0] === 'confirm')[1];
    assert.deepEqual([asked.title, asked.message, asked.danger], ['Delete this step?', '"Welcome" is removed from the workflow.', true]);
    assert.ok(!F.__page().log.some(c => c[0] === 'del'));
    F.__opt('confirm', true);
    await press('click [data-jr-delete]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'del'), ['del', '/api/journey/nodes/3']);
    assert.deepEqual(F.__page().log.filter(c => ['close', 'toast'].includes(c[0])), [['close'], ['toast', 'Step deleted']]);
    assert.equal(F.__state().journeyFlows[0].nodes.length, 3);
  });
  test('a step a colleague already deleted counts as deleted, and the page is read again; a refused delete is said in the window', async () => {
    fill({ manage: true, answers: { 'del /api/journey/nodes/3': { error: 'Not found', code: 'not_found' }, 'get /api/journey': { flows: [], webhooks: [], can_manage: true, max_flows: 20, max_nodes: 60 } } });
    F.openJourneyBox(3);
    await press('click [data-jr-delete]');
    assert.ok(F.__page().log.some(c => c[0] === 'close'));
    assert.ok(F.__page().log.some(c => c[0] === 'get' && c[1] === '/api/journey'));
    fill({ manage: true, answers: { 'del /api/journey/nodes/3': { error: 'x', code: 'forbidden' } } });
    F.openJourneyBox(3);
    await press('click [data-jr-delete]');
    assert.equal(F.__page().fields.err.textContent, 'Only owners and admins can change workflows.');
    assert.ok(!F.__page().log.some(c => c[0] === 'close'));
  });
  test('closing with nothing changed asks nothing; with something typed it asks, and the answer decides', () => {
    fill({ manage: true });
    F.openJourneyBox(3);
    const [m] = modals();
    const SAVED = { n: '0', unit: 'min', title: 'Welcome', text: 'Hello,\nthanks for asking.' };
    F.__fill(SAVED);
    assert.equal(m.beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    for (const [field, value] of [['title', 'Other'], ['text', 'Hello'], ['n', '2'], ['unit', 'days']]) {
      F.__fill({ ...SAVED, [field]: value });
      F.__opt('unsaved', false);
      assert.equal(m.beforeClose(), false, `${field}: stays open on "no"`);
      F.__opt('unsaved', true);
      assert.equal(m.beforeClose(), true, `${field}: closes on "yes"`);
    }
  });
  test('a member reads a step: its kind, when it happens, its title and its whole text; no form', () => {
    fill({ manage: false });
    F.openJourneyBox(3);
    const [m] = modals();
    assert.equal(m.title, 'Step');
    assert.doesNotMatch(m.body, /<form|<input|<textarea|<select/);
    assert.match(m.body, /<p class="jr-meta"><b>Email<\/b><span>Right away<\/span><\/p>/);
    assert.match(m.body, /<h3 class="jr-view-title">Welcome<\/h3>/); assert.match(m.body, /<p class="jr-view-text">Hello,\nthanks for asking\.<\/p>/);
    assert.match(m.body, /Only owners and admins can change workflows\./);
    assert.deepEqual(Object.keys(F.__page().handlers), [], 'no save, no delete');
    F.openJourneyBox(1);
    assert.match(modals()[1].body, /<h3 class="jr-view-title">A lead arrives through a lead webhook<\/h3>\s*<p class="jr-view-text">Only: Website form<\/p>/);
  });
});

// Part 10: a box that only takes time.
describe('a Wait box', () => {
  const WAIT = { id: 5, kind: 'wait', title: '', body: '', wait_minutes: 1440, config: {}, next_id: null };
  const box = (value, checked) => ({ value: String(value), checked });
  test('says how long it waits — and, when it then holds on, until which time on which days', () => {
    fill();
    assert.deepEqual(F.journeyWaitLines(WAIT), { title: 'Wait 1 day', text: '' });
    assert.equal(F.journeyWaitLines({ ...WAIT, wait_minutes: 120 }).title, 'Wait 2 hours');
    assert.equal(F.journeyWaitLines({ ...WAIT, wait_minutes: 20 }).title, 'Wait 20 min');
    assert.equal(F.journeyWaitLines({ ...WAIT, wait_minutes: 4320 }).title, 'Wait 3 days');
    assert.deepEqual(F.journeyWaitLines({ ...WAIT, wait_minutes: 0, config: { until: '09:00', tz: 'Europe/Berlin' } }), { title: 'Wait until 09:00', text: '' });
    assert.deepEqual(F.journeyWaitLines({ ...WAIT, config: { until: '09:00', weekdays: [1, 2, 3, 4, 5] } }), { title: 'Wait 1 day, then until 09:00', text: 'Only on: Mon, Tue, Wed, Thu, Fri' });
    assert.equal(F.journeyWaitLines({ ...WAIT, config: { weekdays: [1] } }).text, '', 'days without a time say nothing');
    fill({ lang: 'de' });
    assert.deepEqual(F.journeyWaitLines({ ...WAIT, config: { until: '09:00', weekdays: [1, 5] } }), { title: '1 Tag warten, dann bis 09:00', text: 'Nur an: Mo, Fr' });
  });
  test('the words for a wait and for "after …" do not get in each other\'s way', () => {
    fill();
    assert.equal(F.journeyWaitText(2880), 'after 2 days');
    assert.equal(F.journeyDurationText(2880), '2 days');
    assert.equal(F.journeyDurationText(60), '1 hour'); assert.equal(F.journeyDurationText(1440), '1 day'); assert.equal(F.journeyDurationText(0), '0 min');
  });
  test('on the board: its kind, its time as the title, and no "after …" of its own', () => {
    fill({ manage: true });
    const out = F.journeyBoxHtml({ ...WAIT, config: { until: '09:00', weekdays: [1, 2] } });
    assert.match(out, /^<button type="button" class="jr-box" data-box="5" data-kind="wait"><span class="jr-ic"><svg class="ic " aria-hidden="true"><use href="#i-clock"\/><\/svg><\/span>/);
    assert.match(out, /<span class="jr-meta"><b>Wait<\/b><\/span>\s*<span class="jr-title">Wait 1 day, then until 09:00<\/span><span class="jr-text">Only on: Mon, Tue<\/span>/);
    assert.doesNotMatch(out, /after 1 day|Right away/);
    assert.match(css, /^\[data-kind="wait"\]\s+\{ --jr-c: var\(--neutral\);/m);
  });
  test('a new one opens with one day; saving sends the time and nothing else', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyBox(null, { kind: 'wait', afterId: 3 });
    const m = modals()[0];
    assert.equal(m.title, 'New step: Wait');
    assert.match(m.body, /id="jr-abc1234-n" type="number" min="0" step="1" inputmode="numeric" value="1" autofocus>/);
    assert.match(m.body, /<option value="days" selected>/);
    assert.match(m.body, /id="jr-abc1234-then"><option value="now" selected>Go on right away<\/option><option value="until">Hold on until a time of day<\/option>/);
    assert.doesNotMatch(m.body, /-title"|<textarea/, 'no title and no text: a wait is its time');
    F.__fill({ n: '2', unit: 'hours', then: 'now', at: '09:00' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post'), ['post', '/api/journey/flows/10/nodes', { title: '', body: '', wait_minutes: 120, config: {}, kind: 'wait', after_id: 3 }]);
  });
  test('holding on until a time: the time and the ticked days are sent; they show only when that is chosen', async () => {
    fill({ manage: true, flows: [{ ...FLOW, nodes: [...FLOW.nodes, WAIT] }], answers: { 'put /api/journey/nodes/5': { flow: FLOW } } });
    F.__fill({ then: 'now' });
    F.openJourneyBox(5);
    assert.deepEqual([F.__page().fields['w-at'].hidden, F.__page().fields['w-days'].hidden], [true, true]);
    F.__fill({ n: '0', unit: 'min', then: 'until', at: '08:30' }); press('change select');
    assert.deepEqual([F.__page().fields['w-at'].hidden, F.__page().fields['w-days'].hidden], [false, false]);
    F.__opt('checks', [box(5, true), box(1, true), box(7, false)]);
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/5', { title: '', body: '', wait_minutes: 0, config: { until: '08:30', weekdays: [1, 5] } }]);
  });
  test('its form holds what was saved', () => {
    fill({ manage: true, flows: [{ ...FLOW, nodes: [...FLOW.nodes, { ...WAIT, wait_minutes: 180, config: { until: '10:15', weekdays: [6, 7], tz: 'Europe/Berlin' } }] }] });
    F.openJourneyBox(5);
    const m = modals()[0];
    assert.equal(m.title, 'Edit step: Wait');
    assert.match(m.body, /value="3" autofocus>/); assert.match(m.body, /<option value="hours" selected>/);
    assert.match(m.body, /<option value="until" selected>/); assert.match(m.body, /id="jr-abc1234-at" type="time" value="10:15">/);
    assert.match(m.body, /data-jr-day value="6" checked><span>Sat<\/span>/); assert.doesNotMatch(m.body, /data-jr-day value="1" checked/);
    assert.match(m.footer, /data-jr-delete/);
  });
  test('no time at all, a wait that is no number, or a time that is none: said in the window, nothing sent', async () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'wait', afterId: 3 });
    for (const [values, words, part] of [[{ n: '0', unit: 'min', then: 'now', at: '09:00' }, 'Enter how long to wait, or choose a time of day to hold on until.', 'n'],
      [{ n: 'x', unit: 'days', then: 'now', at: '09:00' }, 'The wait is a whole number, from 0 up to 365 days.', 'n'], [{ n: '1', unit: 'days', then: 'until', at: '' }, 'Enter a time, for example 09:00.', 'at']]) {
      F.__fill(values);
      await press('click [data-jr-save]');
      assert.equal(F.__page().fields.err.textContent, words);
      assert.ok(F.__page().fields[part].focused >= 1, part);
    }
    assert.ok(!F.__page().log.some(c => c[0] === 'post'));
  });
  test('a member reads it: its time, no form', () => {
    fill({ manage: false, flows: [{ ...FLOW, nodes: [...FLOW.nodes, { ...WAIT, config: { until: '09:00', weekdays: [1] } }] }] });
    F.openJourneyBox(5);
    const m = modals()[0];
    assert.doesNotMatch(m.body, /<form|<input|<select/);
    assert.match(m.body, /<p class="jr-meta"><b>Wait<\/b><\/p>\s*<h3 class="jr-view-title">Wait 1 day, then until 09:00<\/h3>\s*<p class="jr-view-text">Only on: Mon<\/p>/);
  });
  test('no word of the page is defined twice: a second definition would silently replace the first', () => {
    const src = read('public/js/core.js'), at = src.indexOf('const TRANSLATIONS'), en = src.indexOf('\n  en: {', at), de = src.indexOf('\n  de: {', en);
    for (const [lang, block] of [['en', src.slice(en, de)], ['de', src.slice(de, src.indexOf('\n};', de))]]) {
      const keys = [...block.matchAll(/(?:^|[\s,{])((?:jr|jt|jx|jm|fcl)_[a-z0-9_]+):\s*'/gm)].map(m => m[1]);
      assert.ok(keys.length > 300, `${lang}: ${keys.length}`);
      assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], lang);
    }
  });
});

describe('the look', () => {
  test('each kind of step has one colour for its icon and its name', () => {
    for (const kind of ACTIONS) assert.match(css, new RegExp(`^\\[data-kind="${kind}"\\]\\s+\\{ --jr-c: var\\(--[a-z0-9-]+\\);\\s+--jr-bg: var\\(--[a-z0-9-]+\\);\\s+--jr-bd: var\\(--[a-z0-9-]+\\); \\}$`, 'm'), kind);
    assert.match(css, /^\.jr-ic \{[^}]*background: var\(--jr-bg\); color: var\(--jr-c\); border: 1px solid var\(--jr-bd\);/m);
    assert.match(css, /^\.jr-meta b \{ color: var\(--jr-c, var\(--text-2\)\);/m);
  });
  test('the board scrolls inside the page; a box stands where it is put, as wide as the code counts it; the start is readable in both themes', () => {
    assert.match(css, /^\.jr-board \{ flex: 1 1 auto; min-height: 0; overflow: auto;/m);
    assert.match(css, /^\.jr-canvas \{ position: relative; min-width: 100%; min-height: 100%; \}$/m, 'the boxes\' places are counted from the canvas');
    assert.match(css, /^\.jr-node \{ position: absolute; width: 300px; \}$/m);
    assert.match(js, /^const JOURNEY_BOX_W = 300,/m, 'the same width the lines are drawn with');
    assert.match(css, /^\.jr-start \{ background: var\(--navy-800\); color: #fff; border-color: transparent; \}$/m);
    assert.match(css, /^\[data-theme="dark"\] \.jr-start \{ background: var\(--brand-subtle-2\); color: var\(--ink\); border-color: var\(--brand-line\); \}$/m);
    assert.match(css, /^\.jr-start\.is-empty \{ border: 1\.5px dashed/m);
  });
  test('the lines lie under the boxes and take no click, but for the wide unseen twin that removes one; dragging scrolls nothing and selects nothing', () => {
    assert.match(css, /^\.jr-lines \{ position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; \}$/m);
    assert.match(css, /^\.jr-line-hit \{ fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; \}$/m);
    assert.match(css, /^\.jr-canvas\.can-edit \.jr-node \{ touch-action: none; \}$/m);
    assert.match(css, /^\.jr-canvas\.can-edit \{ user-select: none; -webkit-user-select: none; \}$/m);
    assert.ok(js.indexOf('<svg class="jr-lines"') < js.indexOf('${nodes}</div>`'), 'the layer of lines comes before the boxes, so it lies under them');
  });
  test('keyboard focus is visible on a box and on its "+"; the preview frame is white whatever the theme', () => {
    assert.match(css, /^\.jr-box:focus-visible, \.jr-out:focus-visible \{ outline: none; box-shadow: var\(--focus-ring\); \}$/m);
    assert.match(css, /^\.jr-preview \{[^}]*background: #fff; \}$/m);
  });
  test('an empty toolbar takes no room; a hidden row of a window stays hidden whatever its class', () => {
    assert.match(css, /^#journey-toolbar:empty \{ display: none; \}$/m);
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m);
  });
});
