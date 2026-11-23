// CLIENT (static + pure-function) tests for a workflow's ROUTER box on the board
// (public/js/journey-router.js and public/js/journey.js, CUSTOMER_JOURNEY_CHANGES Part 24, 2026-11-23).
//
// A ROUTER has several lines out: one per route — kept in its settings (config.routes[].next_id) — and "else"
// (else_id). What it says on its box, its feet under the box, where the chain puts the routes, the lines the board
// draws for them, what adding a step or drawing a line from a route's foot asks the server for, a new router made
// in its window (Part 25: its routes row by row, each with a name and a condition set in the branch box's own
// window), and what a member reads. The server side is tests/unit/journey-router.test.js,
// tests/unit/journey-run.test.js and tests/routes/journey.test.js.
//
// Nothing here can watch a browser lay the feet out: where a foot stands is tested as the number written on it.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const server = require('../../utils/journey-router');

const html   = read('public/index.html');
const core   = read('public/js/core.js');
const js     = read('public/js/journey.js');
const branch = read('public/js/journey-branch.js');
const router = read('public/js/journey-router.js');
const start  = read('public/js/journey-start.js');
const css    = read('public/style.css');
const route  = read('routes/journey.js');
const dict   = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count  = (src, needle) => src.split(needle).length - 1;
const constOf2 = (rel, name) => new Function(`${sliceConst(rel, name)} return ${name};`)();
const hands  = js.slice(js.indexOf("document.addEventListener('pointerdown'"));   // the page's pointer and click handlers, as they are

// the sandbox: the page's own state, a recording api/ui, a document that keeps the handlers the page registers, frames
// that run when the test says so, and the real t/tf/esc/icon
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  ...['t', 'tf', 'icon', 'fmtDate'].map(n => sliceFn(core, n, 'core.js')),
  ...['JOURNEY_ACTIONS', 'JOURNEY_ICONS', 'JOURNEY_WAIT_DAYS', 'JOURNEY_UNITS', 'JOURNEY_ERRORS', 'JOURNEY_DETAILS'].map(n => sliceConst('public/js/journey.js', n)),
  // the variables of a step's texts (journey-vars.js, Part 14): a step's window shows them, so its file rides along; its own tests are journey-vars-ui.test.js
  ...['JOURNEY_VAR_GROUPS', 'JOURNEY_VAR_ALIASES', 'JOURNEY_VAR_PREFIXES', 'JOURNEY_VAR_KINDS', 'JOURNEY_VAR_QUICK', 'JOURNEY_VAR_GROUP_KEYS', 'JOURNEY_VAR_KEYS', 'JOURNEY_VAR_SAMPLE'].map(n => sliceConst('public/js/journey-vars.js', n)),
  ...['journeyVarOf', 'journeyVarHas', 'journeyVarWord', 'journeyVarList', 'journeyVarZone', 'journeyVarClock', 'journeyVarSample', 'journeyVarFill', 'journeyVarUnknown', 'journeyVarInsert', 'journeyVarBarHtml', 'journeyVarWire'].map(n => sliceFn(read('public/js/journey-vars.js'), n, 'journey-vars.js')),
  'const JOURNEY_MAX_NAME = 80, JOURNEY_MAX_TITLE = 120, JOURNEY_MAX_TEXT = 20000, JOURNEY_MAX_WAIT = 365 * 24 * 60;',
  'const JOURNEY_BOX_W = 300, JOURNEY_PAD = 40, JOURNEY_STEP_Y = 150, JOURNEY_MAX_PLACE = 20000;',
  js.match(/^const JOURNEY_ARROW = .*$/m)[0],
  js.match(/^const journeyClamp = .*$/m)[0],
  js.match(/^const journeyOption = .*$/m)[0],
  // the start's words (journey-start.js): a board has a start box, and a branch box names urgency levels with its keys
  ...['JOURNEY_TRIGGERS', 'JOURNEY_RESULT_KEYS', 'JOURNEY_DOC_KEYS', 'JOURNEY_URGENCY_KEYS', 'JOURNEY_DAY_KEYS', 'JOURNEY_STOP_ON_KEYS'].map(n => sliceConst('public/js/journey-start.js', n)),
  ...['journeyStartUses', 'journeyStartHours', 'journeyStartDays'].map(n => start.match(new RegExp(`^const ${n} = .*$`, 'm'))[0]),
  ...['journeyStartFields', 'journeyStartLines'].map(n => sliceFn(start, n, 'journey-start.js')),
  // the branch box itself
  ...['JOURNEY_TESTS', 'JOURNEY_TEST_KEYS', 'JOURNEY_TEST_LINES', 'JOURNEY_BRANCH_MAX', 'JOURNEY_FIELD_TESTS', 'JOURNEY_CONTACT_BASE', 'JOURNEY_BASE_KEYS', 'JOURNEY_OPS', 'JOURNEY_OPS_BARE', 'JOURNEY_OPS_SIZE', 'JOURNEY_OP_KEYS', 'JOURNEY_OP_LINES', 'JOURNEY_TEST_GROUPS', 'JOURNEY_OP_GROUPS',
    'JOURNEY_OWNER_TESTS', 'JOURNEY_AGE_TESTS', 'JOURNEY_OWNER_OPS', 'JOURNEY_OWNER_LINES', 'JOURNEY_AGE_OPS', 'JOURNEY_AGE_LINES', 'JOURNEY_SPAN_UNITS', 'JOURNEY_WHOSE'].map(n => sliceConst('public/js/journey-branch.js', n)),
  ...['journeyBranchTestOptions', 'journeyBranchOpOptions', 'journeyBranchOp', 'journeyBranchBase', 'journeyContactFieldOptions', 'journeyBranchDay', 'journeyBranchSpan', 'loadJourneyPeople', 'resetJourneyBranch', 'journeyBranchSized', 'journeyBranchText', 'journeyBranchLines', 'journeyBranchConfig', 'openJourneyBranch'].map(n => sliceFn(branch, n, 'journey-branch.js')),
  // the router box itself (journey-router.js)
  router.match(/^const JOURNEY_ROUTER_NEW = \d+;/m)[0], sliceConst('public/js/journey-router.js', 'JOURNEY_ROUTER_MAX'),
  ...['journeyRouterRoutes', 'journeyRouteLabel', 'journeyRouterLines', 'journeyRouterListHtml', 'journeyRouterFeetHtml', 'journeyRouterView', 'journeyRouterRowsHtml', 'journeyRouterMoved', 'journeyRouterConfig', 'openJourneyRouter'].map(n => sliceFn(router, n, 'journey-router.js')),
  `const __log = [], __listeners = {}, __els = {}, __fields = {}, __handlers = {};
   let __answers = {}, __confirm = true, __unsaved = true, __checks = [], __frames = [], __cancelled = [], __under = null;
   let journeyMail = null;
   const __el = id => (__els[id] ||= { id, innerHTML: '' });
   const document = { getElementById: id => __el(id), addEventListener: (type, fn) => { __listeners[type] = fn; }, elementFromPoint: () => __under };
   const requestAnimationFrame = fn => { __frames.push(fn); return __frames.length; };
   const cancelAnimationFrame = id => { __cancelled.push(id); __frames[id - 1] = null; };
   const __answer = (verb, url, body) => { __log.push(body === undefined ? [verb, url] : [verb, url, body]); return __answers[verb + ' ' + url] ?? __answers[url]; };
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
   function __state() { return { journeyFlows, journeyManage, journeyFlowId, journeyDrag, journeyDragEnd }; }
   function __reset(answers = {}) { __log.length = 0; __answers = answers; __confirm = true; __unsaved = true; __checks = []; __frames = []; __cancelled = []; __under = null; journeyMail = null; journeyDrag = null; journeyDragEnd = 0;
     for (const o of [__els, __fields, __handlers]) for (const k of Object.keys(o)) delete o[k]; }
   function __fill(values) { for (const k of Object.keys(values)) __field(k).value = values[k]; }
   function __opt(k, v) { if (k === 'confirm') __confirm = v; else if (k === 'unsaved') __unsaved = v; else if (k === 'checks') __checks = v; else if (k === 'under') __under = v; }
   function __page() { return { log: __log, els: __els, fields: __fields, handlers: __handlers, listeners: __listeners, frames: __frames, cancelled: __cancelled }; }
   function __frame() { const due = __frames.filter(Boolean); __frames = []; for (const fn of due) fn(); return due.length; }`,
  hands,
].join('\n');
const NAMES = ['journeyErrorText', 'journeySend', 'journeyWaitText', 'journeyDurationText', 'journeyWaitLines', 'journeyWaitParts', 'journeyWaitMinutes', 'journeyPipelines', 'journeyFlow', 'journeyStageName',
  'journeyLayout', 'journeyChain', 'journeyPlaces', 'journeyCanvasSize', 'journeyLinePath', 'journeyPart', 'journeyEdges', 'journeyRects', 'journeyLinesHtml', 'journeyApply', 'journeyBoxHtml', 'journeyBoardHtml',
  'journeyDrawLines', 'journeyToolbarHtml', 'renderJourney', 'journeyWindow', 'openJourneyAdd', 'journeyBehind', 'openJourneyBox', 'openJourneyWait', 'journeyBoxView', 'journeyDropBox', 'journeyDropLine',
  'journeyRemoveLine', 'journeyDragBegin', 'journeyDragDrop', 'journeyDragPaint', 'journeyPreviewHtml', 'journeyWhen', 'journeyStepText', 'journeyDetailText', 'journeyActivityHtml', 'loadJourney'];
const F = loadFns('public/js/journey.js', NAMES, {
  state: { currentLang: 'en', pipelines: [], journeyFlows: [], journeyWebhooks: [], journeyManage: false, journeyLimits: { flows: 20, nodes: 60 }, journeyFlowId: null, journeyFonio: false, journeyDrag: null, journeyDragEnd: 0,
    journeyDealFields: [], journeyContactFields: [], journeyPeople: [] },
  extra, expose: ['__state', '__reset', '__fill', '__opt', '__page', '__frame', 'journeyBranchText', 'journeyBranchLines', 'journeyBranchConfig', 'journeyBranchOp', 'journeyBranchSized', 'journeyBranchBase', 'journeyContactFieldOptions', 'journeyBranchDay', 'journeyBranchSpan', 'loadJourneyPeople', 'resetJourneyBranch',
    'journeyRouterRoutes', 'journeyRouteLabel', 'journeyRouterLines', 'journeyRouterListHtml', 'journeyRouterFeetHtml', 'journeyRouterView', 'journeyRouterRowsHtml', 'journeyRouterMoved', 'journeyRouterConfig', 'openJourneyRouter'],
});

const SALES = { id: 3, name: 'Sales', stages: [{ id: 31, name: 'New' }, { id: 32, name: 'Booked' }] };
const FIELDS = [{ field_key: 'budget', name: 'Budget', type: 'text' }];
const box = (id, kind, more = {}) => ({ id, kind, title: '', body: '', wait_minutes: 0, config: {}, next_id: null, else_id: null, ...more });
const R = (id, more = {}) => ({ id, name: '', when: null, next_id: null, ...more });
const START = box(1, 'start', { config: { trigger: 'lead', webhook_ids: null }, next_id: 5 });
// a router with three routes — a named one, one that only has a question, one for every deal — and an "else"
const ROUTES = [R(1, { name: 'Has a <b>phone</b>', when: { test: 'has_phone' }, next_id: 10 }), R(2, { when: { test: 'field', field_key: 'budget', op: 'gt', value: '500000' }, next_id: 11 }), R(4, { next_id: null })];
const ROUTER = box(5, 'router', { config: { routes: ROUTES }, else_id: 12 });
const CALL = box(10, 'call', { title: 'fonio calls', next_id: 13 }), SENIOR = box(11, 'task', { title: 'Senior agent' }), FIX = box(12, 'task', { title: 'Complete the data' }), AFTER = box(13, 'task', { title: 'Note the result' });
const FLOW = { id: 10, name: 'New lead', nodes: [START, ROUTER, CALL, SENIOR, FIX, AFTER] };
function fill({ manage = false, lang = 'en', flows = [FLOW], shown = 10, answers = {} } = {}) {
  F.__reset(answers);
  F.__set('currentLang', lang); F.__set('pipelines', [SALES]); F.__set('journeyFlows', flows); F.__set('journeyWebhooks', []); F.__set('journeyManage', manage);
  F.__set('journeyFlowId', shown); F.__set('journeyFonio', true); F.__set('journeyDealFields', FIELDS); F.__set('journeyContactFields', []); F.__set('journeyPeople', []);
}
const modals = () => F.__page().log.filter(c => c[0] === 'modal').map(c => c[1]);
const logged = verb => F.__page().log.filter(c => c[0] === verb);
const settle = () => new Promise(r => setImmediate(r));

describe('wiring', () => {
  test('the script is loaded once, after the board and the branch box whose questions a route asks', () => {
    assert.equal(count(html, '<script src="js/journey-router.js"></script>'), 1);
    for (const before of ['js/journey.js', 'js/journey-start.js', 'js/journey-branch.js']) assert.ok(html.indexOf(`<script src="${before}">`) < html.indexOf('<script src="js/journey-router.js">'), before);
  });
  test('a router is a kind of step like the others: the last in the list, the server\'s own, with an icon and a colour', () => {
    const kinds = constOf2('public/js/journey.js', 'JOURNEY_ACTIONS');
    assert.equal(kinds.at(-1), 'router');
    assert.deepEqual(kinds, new Function(`${route.match(/^const ACTIONS = \[[^\]]*\];/m)[0]} return ACTIONS;`)());
    assert.equal(constOf2('public/js/journey.js', 'JOURNEY_ICONS').router, 'columns');
    assert.ok(html.includes('<symbol id="i-columns"'), 'an icon the sprite has: the landing page keeps a copy of the sprite, so none is added');
    assert.match(css, /^\[data-kind="router"\]\s+\{ --jr-c: var\(--brand-ink\); --jr-bg: var\(--brand-subtle\); --jr-bd: var\(--brand-line\); \}$/m);
    assert.deepEqual([dict.en.jr_kind_router, dict.de.jr_kind_router], ['Router', 'Router']);
    assert.match(router, /^const JOURNEY_ROUTER_NEW = 2;/m, 'a new router starts with two routes');
    assert.deepEqual(constOf2('public/js/journey-router.js', 'JOURNEY_ROUTER_MAX'), { routes: server.MAX_ROUTES, name: server.MAX_NAME }, 'the limits are the server\'s own');
  });
  test('the board hands a router to its own file: its lines, its feet, its window, and what a member reads', () => {
    assert.match(js, /if \(\(node \? node\.kind : fresh\.kind\) === 'router'\) return openJourneyRouter\(node, fresh\);/);
    assert.match(js, /if \(node\.kind === 'router'\) return journeyRouterView\(node, why\);/);
    assert.match(js, /: n\.kind === 'router' \? journeyRouterFeetHtml\(n\)/);
    assert.match(js, /node\.kind === 'router' \? journeyRouterLines\(node\) : null;/);
    assert.match(js, /\$\{node\.kind === 'router' \? journeyRouterListHtml\(node\) : flat \?/);
  });
});

describe('both dictionaries', () => {
  const used = [...new Set([...router.matchAll(/'(jrt_[a-z0-9_]+)'/g)].map(m => m[1]))];
  test('every word of the router exists in English and German; none is left unused, none defined twice', () => {
    assert.ok(used.length >= 19, `its own keys (${used.length})`);
    for (const k of [...used, 'jr_kind_router']) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jrt_') && !used.includes(k)), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jrt_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jrt_')).sort());
    const at = core.indexOf('const TRANSLATIONS'), en = core.indexOf('\n  en: {', at), de = core.indexOf('\n  de: {', en);
    for (const [lang, block] of [['en', core.slice(en, de)], ['de', core.slice(de, core.indexOf('\n};', de))]]) {
      const keys = [...block.matchAll(/(?:^|[\s,{])((?:jrt_[a-z0-9_]+)|jr_kind_router):\s*'/gm)].map(m => m[1]);
      assert.equal(keys.length, used.length + 1, lang);
      assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], lang);
    }
  });
  test('German speaks to nobody in particular, no text says "journey", and the words are what the page shows', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jrt_'))) {
      assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
      for (const lang of ['en', 'de']) assert.doesNotMatch(dict[lang][k], /journey/i, k);
    }
    assert.deepEqual([dict.en.jrt_one, dict.en.jrt_many, dict.en.jrt_always, dict.en.jrt_else], ['1 route', '{n} routes', 'Every deal', 'else']);
    assert.deepEqual([dict.de.jrt_one, dict.de.jrt_many, dict.de.jrt_always, dict.de.jrt_else], ['1 Route', '{n} Routen', 'Jeder Deal', 'sonst']);
    assert.deepEqual(['jrt_f_routes', 'jrt_name_ph', 'jrt_name_aria', 'jrt_cond_set', 'jrt_cond_change', 'jrt_cond_clear', 'jrt_add', 'jrt_up', 'jrt_down', 'jrt_remove', 'jrt_cond_title'].map(k => dict.en[k]),
      ['Routes', 'Name (optional)', 'Name of route {n}', 'Set a condition', 'Change', 'No condition', 'Add a route', 'Move route {n} up', 'Move route {n} down', 'Remove route {n}', 'Condition of route {n}']);
    assert.deepEqual(['jrt_f_routes', 'jrt_name_ph', 'jrt_name_aria', 'jrt_cond_set', 'jrt_cond_change', 'jrt_cond_clear', 'jrt_add', 'jrt_up', 'jrt_down', 'jrt_remove', 'jrt_cond_title'].map(k => dict.de[k]),
      ['Routen', 'Name (optional)', 'Name der Route {n}', 'Bedingung festlegen', 'Ändern', 'Keine Bedingung', 'Route hinzufügen', 'Route {n} nach oben', 'Route {n} nach unten', 'Route {n} entfernen', 'Bedingung der Route {n}']);
    assert.match(dict.en.jrt_routes_hint, /^Up to 6 routes\. A route without a condition takes every deal\./); assert.match(dict.en.jrt_routes_hint, /a route that is removed loses its line\.$/);
    assert.match(dict.de.jrt_routes_hint, /^Bis zu 6 Routen\./); assert.match(dict.de.jrt_routes_hint, /eine entfernte Route verliert ihre Linie\.$/);
    assert.equal(dict.en.jrt_hint, 'A deal goes down every route whose question is answered with yes, side by side. When none fits, it takes the "else" line.');
    assert.equal(dict.de.jrt_hint, 'Ein Deal geht jede Route entlang, deren Frage mit Ja beantwortet wird, nebeneinander. Passt keine, nimmt er die Linie „sonst“.');
    assert.deepEqual([dict.en.jrt_else_long, dict.de.jrt_else_long], ['Otherwise: when no route fits', 'Sonst: wenn keine Route passt']);
    assert.match(dict.en.jrt_route_aria, /^Route \{n\}: add a step, or drag onto another step to draw the line$/); assert.match(dict.de.jrt_route_aria, /^Route \{n\}: Schritt hinzufügen/);
    assert.match(dict.en.jrt_else_aria, /^When no route fits: /); assert.match(dict.de.jrt_else_aria, /^Wenn keine Route passt: /);
  });
});

describe('what a router says', () => {
  test('a route is called by its name — or, without one, by its question as a branch box says it, or "Every deal"', () => {
    fill();
    assert.deepEqual(ROUTES.map(r => F.journeyRouteLabel(r)), ['Has a <b>phone</b>', '"Budget" > 500000?', 'Every deal']);
    assert.equal(F.journeyRouteLabel({ name: '   ', when: { test: 'has_email' } }), 'Email address known?', 'a name of spaces is none');
    assert.equal(F.journeyRouteLabel({ when: { test: 'weather' } }), 'A question this version does not know');
    for (const r of [null, undefined, {}, { name: null, when: null }]) assert.equal(F.journeyRouteLabel(r), 'Every deal');
    fill({ lang: 'de' });
    assert.deepEqual([F.journeyRouteLabel(ROUTES[2]), F.journeyRouteLabel({ when: { test: 'has_phone' } })], ['Jeder Deal', 'Telefonnummer bekannt?']);
  });
  test('the routes of a box: the list the server keeps, and nothing for anything else', () => {
    assert.deepEqual(F.journeyRouterRoutes(ROUTER).map(r => r.id), [1, 2, 4]);
    for (const n of [null, undefined, {}, box(9, 'task'), { config: null }, { config: { routes: 'x' } }]) assert.deepEqual(F.journeyRouterRoutes(n), []);
    assert.deepEqual(F.journeyRouterRoutes({ config: { routes: [null, 'x', R(3)] } }).map(r => r.id), [3], 'what is no route is left out');
  });
  test('the box: its name, or how many routes it has — and the routes in turn, each with its number', () => {
    fill();
    assert.deepEqual(F.journeyRouterLines(ROUTER), { title: '3 routes', text: '1 Has a <b>phone</b> · 2 "Budget" > 500000? · 3 Every deal' });
    assert.deepEqual(F.journeyRouterLines({ ...ROUTER, title: '  Who gets what  ' }).title, 'Who gets what');
    assert.equal(F.journeyRouterLines(box(5, 'router', { config: { routes: [R(1)] } })).title, '1 route');
    assert.deepEqual(F.journeyRouterLines(box(5, 'router')), { title: '0 routes', text: '' });
    fill({ lang: 'de' });
    assert.deepEqual([F.journeyRouterLines(ROUTER).title, F.journeyRouterLines(box(5, 'router', { config: { routes: [R(1)] } })).title], ['3 Routen', '1 Route']);
  });
  test('on the board: its kind, when it is asked, its title and the routes as a list — and typed text stays text', () => {
    fill({ manage: true });
    const out = F.journeyBoxHtml({ ...ROUTER, wait_minutes: 60 });
    assert.match(out, /^<button type="button" class="jr-box" data-box="5" data-kind="router"><span class="jr-ic"><svg class="ic " aria-hidden="true"><use href="#i-columns"\/><\/svg><\/span>/);
    assert.match(out, /<span class="jr-meta"><b>Router<\/b><span>after 1 hour<\/span><\/span>\s*<span class="jr-title">3 routes<\/span><span class="jr-routes"><span class="jr-route"><b>1<\/b><span>Has a &lt;b&gt;phone&lt;\/b&gt;<\/span><\/span><span class="jr-route"><b>2<\/b><span>&quot;Budget&quot; &gt; 500000\?<\/span><\/span><span class="jr-route"><b>3<\/b><span>Every deal<\/span><\/span><\/span><\/span>/);
    assert.doesNotMatch(out, /<b>phone<\/b>|jr-text/);
    assert.match(F.journeyBoxHtml({ ...ROUTER, title: '<img src=x>' }), /<span class="jr-title">&lt;img src=x&gt;<\/span>/);
    assert.equal(F.journeyRouterListHtml(box(5, 'router')), '', 'no routes: no list');
    assert.match(F.journeyBoxHtml(CALL), /<span class="jr-title">fonio calls<\/span>/, 'another box is drawn as before');
    assert.doesNotMatch(F.journeyBoxHtml(CALL), /jr-routes/);
  });
});

describe('the feet under a router', () => {
  test('where a line leaves: the feet side by side, evenly — the routes in their order, then "else"', () => {
    assert.deepEqual([F.journeyPart(ROUTER, 'route', 1), F.journeyPart(ROUTER, 'route', 2), F.journeyPart(ROUTER, 'route', 4), F.journeyPart(ROUTER, 'else')], [0.125, 0.375, 0.625, 0.875]);
    const two = box(5, 'router', { config: { routes: [R(1), R(2)] } });
    assert.deepEqual([F.journeyPart(two, 'route', 1), F.journeyPart(two, 'route', 2), F.journeyPart(two, 'else')], [0.1667, 0.5, 0.8333]);
    const six = box(5, 'router', { config: { routes: [1, 2, 3, 4, 5, 6].map(i => R(i)) } });
    assert.deepEqual([F.journeyPart(six, 'route', 1), F.journeyPart(six, 'route', 6), F.journeyPart(six, 'else')], [0.0714, 0.7857, 0.9286]);
    for (const [side, r] of [['route', 3], ['route', undefined], ['route', '1'], ['next', undefined], [undefined, undefined]]) assert.equal(F.journeyPart(ROUTER, side, r), 0.5, `no such foot (${side} ${r}): the middle`);
    assert.equal(F.journeyPart(box(5, 'router'), 'else'), 0.5, 'no routes: "else" alone stands in the middle');
    assert.deepEqual([F.journeyPart(box(7, 'branch'), 'next'), F.journeyPart(box(7, 'branch'), 'else'), F.journeyPart(CALL, 'route', 1)], [0.25, 0.75, 0.5], 'the other boxes as before');
  });
  test('for an owner or admin each foot is the handle of its line: the route\'s number on it, its side and its route written on it', () => {
    fill({ manage: true });
    const feet = F.journeyRouterFeetHtml(ROUTER);
    assert.deepEqual([...feet.matchAll(/<button type="button" class="jr-out jr-side (is-route|is-else)" style="left:([\d.]+)%" data-out="5" data-side="(route|else)"(?: data-route="(\d+)")? aria-label="([^"]+)" title="[^"]+"><span>([^<]+)<\/span><\/button>/g)].map(m => m.slice(1)),
      [['is-route', '12.5', 'route', '1', 'Route 1: add a step, or drag onto another step to draw the line', '1'], ['is-route', '37.5', 'route', '2', 'Route 2: add a step, or drag onto another step to draw the line', '2'],
        ['is-route', '62.5', 'route', '4', 'Route 3: add a step, or drag onto another step to draw the line', '3'], ['is-else', '87.5', 'else', undefined, 'When no route fits: add a step, or drag onto another step to draw the line', 'else']]);
    assert.equal(count(feet, '<button'), 4);
    assert.doesNotMatch(feet, /<svg/, 'up to seven feet stand under one box: they carry no "+"');
    const board = F.journeyBoardHtml(FLOW), node = board.slice(board.indexOf('data-node="5"'), board.indexOf('data-node="10"'));
    assert.equal(count(node, 'data-out="5"'), 4, 'the board puts them under the router');
    assert.deepEqual([...board.matchAll(/class="jr-out" data-out="(\d+)"/g)].map(m => m[1]), ['1', '10', '11', '12', '13'], 'every other box keeps its one "+"');
    fill({ manage: true, lang: 'de' });
    assert.match(F.journeyRouterFeetHtml(ROUTER), /aria-label="Wenn keine Route passt: [^"]+" title="[^"]+"><span>sonst<\/span>/);
  });
  test('a member reads the feet — each says which route it is — and can do nothing with them', () => {
    fill({ manage: false });
    const feet = F.journeyRouterFeetHtml(ROUTER);
    assert.equal(feet, '<span class="jr-side is-route" style="left:12.5%" title="Has a &lt;b&gt;phone&lt;/b&gt;">1</span><span class="jr-side is-route" style="left:37.5%" title="&quot;Budget&quot; &gt; 500000?">2</span>' +
      '<span class="jr-side is-route" style="left:62.5%" title="Every deal">3</span><span class="jr-side is-else" style="left:87.5%" title="Otherwise: when no route fits">else</span>');
    assert.doesNotMatch(F.journeyBoardHtml(FLOW), /data-out|data-side|data-route|<button type="button" class="jr-out/);
  });
  test('the look: narrow feet, each at the place written on it; the routes listed in the box', () => {
    assert.match(css, /^\.jr-side\.is-route, \.jr-side\.is-else \{ min-width: 22px; padding: 0 6px; justify-content: center; \}$/m);
    assert.match(css, /^\.jr-side \{ position: absolute; bottom: -11px; transform: translateX\(-50%\);/m, 'a foot is centred on its left');
    assert.doesNotMatch(css, /\.jr-side\.is-(route|else)[^{]*\{[^}]*\bleft:/, 'no rule places a router\'s foot: its own style does');
    assert.match(css, /^\.jr-out\.jr-side \{ width: auto; height: 22px; margin-left: 0; border-radius: 11px; \}$/m, 'and the "+"\'s own offset does not push it');
    assert.match(css, /^\.jr-routes \{ display: flex; flex-direction: column; gap: 2px; margin-top: 4px; \}$/m);
    assert.match(css, /^\.jr-route span \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}$/m);
    assert.match(css, /^\.jr-view \.jr-route span \{ white-space: normal; \}$/m, 'in the window a long name is read whole');
    assert.match(css, /^\.jr-route b \{ flex: none; min-width: 16px; color: var\(--brand-ink\); font-weight: 650; text-align: center; \}$/m, 'the number in the box looks like the number on its foot');
    assert.match(css, /^\.jr-side\.is-route \{ color: var\(--brand-ink\); \}$/m);
  });
});

describe('where the chain puts the routes, and the lines', () => {
  test('the chain: the routes in their order, each with what stands behind it, then "else"; no box twice', () => {
    assert.deepEqual(F.journeyChain(FLOW).chain.map(n => n.id), [1, 5, 10, 13, 11, 12]);
    assert.deepEqual(F.journeyChain(FLOW).loose, []);
    const joined = { nodes: [START, box(5, 'router', { config: { routes: [R(1, { next_id: 10 }), R(2, { next_id: 10 }), R(3, { next_id: 11 })] }, else_id: 11 }), box(10, 'task'), box(11, 'task')] };
    assert.deepEqual(F.journeyChain(joined).chain.map(n => n.id), [1, 5, 10, 11], 'two routes to one box: it stands once');
    assert.deepEqual([F.journeyPlaces(joined)[10], F.journeyPlaces(joined)[11], F.journeyLayout(joined).width], [{ x: 40, y: 340 }, { x: 420, y: 340 }, 2], 'and takes one column: what a later route leads to stands right beside it');
    const lost = { nodes: [START, box(5, 'router', { config: { routes: [R(1, { next_id: 999 }), R(2, { next_id: 11 })] } }), box(10, 'task'), box(11, 'task')] };
    assert.deepEqual([F.journeyChain(lost).chain.map(n => n.id), F.journeyChain(lost).loose.map(n => n.id)], [[1, 5, 11], [10]], 'a route to a box that is gone leads nowhere');
    assert.deepEqual(F.journeyChain({ nodes: [START, box(5, 'router', { next_id: 10, config: { routes: [] } }), box(10, 'task')] }).loose.map(n => n.id), [10], 'a router has no line of its own: its next_id leads nowhere');
  });
  test('where the chain puts them: side by side under the router, each route as wide as it needs, "else" last', () => {
    assert.deepEqual(F.journeyPlaces(FLOW), { 1: { x: 40, y: 40 }, 5: { x: 40, y: 190 }, 10: { x: 40, y: 340 }, 13: { x: 40, y: 490 }, 11: { x: 420, y: 340 }, 12: { x: 800, y: 340 } });
    assert.equal(F.journeyLayout(FLOW).width, 3);
    const onlyLast = { nodes: [START, box(5, 'router', { config: { routes: [R(1), R(2), R(3, { next_id: 10 })] } }), box(10, 'task')] };
    assert.deepEqual(F.journeyPlaces(onlyLast)[10], { x: 40, y: 340 }, 'a route that leads nowhere takes no column');
    assert.equal(F.journeyLayout({ nodes: [START, box(5, 'router', { config: { routes: [R(1), R(2)] } })] }).width, 1, 'a router with nothing behind it is one column wide');
    const inner = box(10, 'branch', { config: { test: 'assigned' }, next_id: 20, else_id: 21 });
    const nested = { nodes: [START, box(5, 'router', { config: { routes: [R(1, { next_id: 10 }), R(2, { next_id: 11 })] }, else_id: 12 }), inner, box(11, 'task'), box(12, 'task'), box(20, 'task'), box(21, 'task'), box(30, 'sms')] };
    const p = F.journeyPlaces(nested);
    assert.deepEqual([p[10], p[20], p[21], p[11], p[12]], [{ x: 40, y: 340 }, { x: 40, y: 490 }, { x: 420, y: 490 }, { x: 800, y: 340 }, { x: 1180, y: 340 }], 'a branch inside the first route pushes the second route and "else" further right');
    assert.deepEqual(p[30], { x: 1560, y: 40 }, 'a loose box stands beside all of it');
    const behind = { nodes: [START, box(5, 'branch', { config: { test: 'assigned' }, next_id: 6, else_id: 12 }), box(6, 'router', { config: { routes: [R(1, { next_id: 10 }), R(2, { next_id: 11 })] } }), box(10, 'task'), box(11, 'task'), box(12, 'task')] };
    assert.deepEqual([F.journeyPlaces(behind)[11], F.journeyPlaces(behind)[12]], [{ x: 420, y: 490 }, { x: 800, y: 340 }], 'a router on a "yes" side: the "no" side stands right of both its routes');
    assert.deepEqual(F.journeyPlaces({ nodes: FLOW.nodes.map(n => (n.id === 11 ? { ...n, x: 900, y: 60 } : n)) })[11], { x: 900, y: 60 }, 'a box that was dragged keeps its place');
  });
  test('a router has a line per route that leads somewhere, and "else" — none of its own', () => {
    assert.deepEqual(F.journeyEdges(FLOW), [{ from: 1, to: 5, side: 'next', part: 0.5 }, { from: 5, to: 10, side: 'route', route: 1, part: 0.125 }, { from: 5, to: 11, side: 'route', route: 2, part: 0.375 },
      { from: 5, to: 12, side: 'else', part: 0.875 }, { from: 10, to: 13, side: 'next', part: 0.5 }]);
    assert.deepEqual(F.journeyEdges({ nodes: [box(5, 'router', { next_id: 10, config: { routes: [R(1)] } })] }), [], 'a next_id on a router is not a line, a route without a line is none');
    assert.deepEqual(F.journeyEdges({ nodes: [box(5, 'router', { config: { routes: 'x' }, else_id: 12 })] }), [{ from: 5, to: 12, side: 'else', part: 0.5 }]);
  });
  test('each line says which boxes it joins; an owner or admin can click each away, a route\'s line with its route', () => {
    const RECTS = { 1: { x: 40, y: 40, w: 300, h: 80 }, 5: { x: 40, y: 190, w: 300, h: 120 }, 10: { x: 40, y: 340, w: 300, h: 80 }, 11: { x: 420, y: 340, w: 300, h: 80 }, 12: { x: 800, y: 340, w: 300, h: 80 }, 13: { x: 40, y: 490, w: 300, h: 80 } };
    fill({ manage: true });
    const out = F.journeyLinesHtml(FLOW, RECTS);
    assert.equal(count(out, '<path class="jr-line" '), 5); assert.equal(count(out, '<path class="jr-line-hit" '), 5);
    const d = F.journeyLinePath(RECTS[5], RECTS[11], 0.375);
    assert.equal(d, 'M153 310 C153 346 570 304 570 340', 'it leaves the router at its route\'s foot');
    assert.ok(out.includes(`<path class="jr-line" data-from="5" data-to="11" data-part="0.375" d="${d}" marker-end="url(#jr-arrow)"/>`));
    assert.ok(out.includes(`<path class="jr-line-hit" data-line="5" data-side="route" data-route="2" data-from="5" data-to="11" data-part="0.375" d="${d}"/>`));
    assert.match(out, /<path class="jr-line-hit" data-line="5" data-side="else" data-from="5" data-to="12" data-part="0\.875" d="[^"]+"\/>/, '"else" names no route');
    assert.match(out, /<path class="jr-line-hit" data-line="1" data-side="next" data-from="1" data-to="5" data-part="0\.5" d="[^"]+"\/>/, 'another box\'s line as before');
    fill({ manage: false });
    assert.doesNotMatch(F.journeyLinesHtml(FLOW, RECTS), /jr-line-hit|data-line|data-route/);
  });
});

describe('adding a step and drawing a line from a route', () => {
  test('where a new step goes, as the server is told: behind a route, behind "else", or behind the one line a box has', () => {
    assert.deepEqual([F.journeyBehind({ afterId: 5, side: 'route', route: 2 }), F.journeyBehind({ afterId: '5', side: 'route', route: '4' }), F.journeyBehind({ afterId: 5, side: 'else' }), F.journeyBehind({ afterId: 5 }), F.journeyBehind({ afterId: 5, side: 'next', route: 2 })],
      [{ after_id: 5, side: 'route', route: 2 }, { after_id: 5, side: 'route', route: 4 }, { after_id: 5, side: 'else' }, { after_id: 5 }, { after_id: 5 }]);
  });
  test('a click on a route\'s foot lists the steps to add; the one chosen goes behind that route', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    const foot = { dataset: { out: '5', side: 'route', route: '2' } };
    F.__page().listeners.click({ clientX: 1, clientY: 1, target: { closest: sel => (sel === '#journey-board' ? {} : sel === '[data-out]' ? foot : null) } });
    const [, anchor, items] = logged('menu')[0];
    assert.equal(anchor, foot);
    assert.equal(items.at(-1).label, 'Router');
    items.find(i => i.label === 'Wait').onSelect();
    F.__fill({ n: '1', unit: 'days', then: 'now', at: '09:00' });
    await F.__page().handlers['click [data-jr-save]']();
    const sent = logged('post')[0][2];
    assert.deepEqual([sent.kind, sent.after_id, sent.side, sent.route], ['wait', 5, 'route', 2]);
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyAdd(5, {}, 'else');
    logged('menu')[0][2].find(i => i.label === 'Wait').onSelect();
    F.__fill({ n: '1', unit: 'days', then: 'now', at: '09:00' });
    await F.__page().handlers['click [data-jr-save]']();
    assert.deepEqual([logged('post')[0][2].after_id, logged('post')[0][2].side, 'route' in logged('post')[0][2]], [5, 'else', false]);
  });
  test('a line drawn from a route\'s foot is that route\'s line; taking one away says which', async () => {
    fill({ manage: true, answers: { 'put /api/journey/nodes/5/next': { flow: FLOW } } });
    await F.journeyDropLine({ id: 5, side: 'route', route: 4 }, 13);
    await F.journeyDropLine({ id: 5, side: 'else' }, 13);
    await F.journeyRemoveLine(5, 'route', '2'); await F.journeyRemoveLine(5, 'else', undefined); await F.journeyRemoveLine(10, 'next', undefined);
    assert.deepEqual(logged('put').map(c => c[2]), [{ next_id: 13, side: 'route', route: 4 }, { next_id: 13, side: 'else' }, { next_id: null, side: 'route', route: 2 }, { next_id: null, side: 'else' }, { next_id: null }]);
    fill({ manage: true });
    await F.journeyDropLine({ id: 5, side: 'route', route: 4 }, 5);
    await F.journeyDropLine({ id: 5, side: 'route', route: 4 }, null);
    assert.equal(logged('put').length, 0, 'onto itself or onto nothing: no request');
  });
  test('the page\'s own hands: a press on a route\'s foot holds that route\'s line, and the line being drawn leaves at its foot', () => {
    fill({ manage: true });
    const canvas = { isConnected: true, parentElement: null, querySelectorAll: () => [], querySelector: () => ({ setAttribute() {} }) };
    const foot = (side, route) => ({ closest: sel => (sel === '#journey-board .jr-canvas' ? canvas : sel === '[data-out]' ? { dataset: { out: '5', side, ...(route ? { route } : {}) } } : null) });
    const L = F.__page().listeners;
    L.pointerdown({ button: 0, clientX: 10, clientY: 10, target: foot('route', '2') });
    assert.deepEqual([F.__state().journeyDrag.kind, F.__state().journeyDrag.id, F.__state().journeyDrag.side, F.__state().journeyDrag.route], ['line', 5, 'route', 2]);
    const d = F.__state().journeyDrag;
    F.journeyDragBegin(d);
    assert.equal(d.part, 0.375);
    L.pointerdown({ button: 0, clientX: 10, clientY: 10, target: foot('else') });
    assert.deepEqual([F.__state().journeyDrag.side, F.__state().journeyDrag.route], ['else', null]);
    L.pointerdown({ button: 0, clientX: 10, clientY: 10, target: foot(undefined) });
    assert.deepEqual([F.__state().journeyDrag.side, F.__state().journeyDrag.route], ['next', null], 'every other "+" as before');
    L.pointerdown({ button: 0, clientX: 10, clientY: 10, target: foot('nonsense', '7') });
    assert.equal(F.__state().journeyDrag.side, 'next');
  });
  test('a click on a route\'s line offers to take it away, with its route', async () => {
    assert.match(hands, /if \(add\) openJourneyAdd\(Number\(add\.dataset\.out\), add, add\.dataset\.side, add\.dataset\.route\);/);
    fill({ manage: true, answers: { 'put /api/journey/nodes/5/next': { flow: FLOW } } });
    const line = { dataset: { line: '5', side: 'route', route: '2' } };
    F.__page().listeners.click({ clientX: 3, clientY: 4, target: { closest: sel => (sel === '#journey-board' ? {} : sel === '[data-line]' ? line : null) } });
    const [, at, items] = logged('menu')[0];
    assert.deepEqual([at, items.map(i => i.label)], [{ x: 3, y: 4 }, ['Remove this line']]);
    await items[0].onSelect();
    assert.deepEqual(logged('put')[0], ['put', '/api/journey/nodes/5/next', { next_id: null, side: 'route', route: 2 }]);
  });
});

describe('the look of the router\'s window', () => {
  test('the rows: the number, the name with the condition under it, the buttons — and a button that is off looks off', () => {
    for (const rule of ['.jr-rts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }', '.jr-rt { display: flex; align-items: flex-start; gap: 6px; }',
      '.jr-rt-no { flex: 0 0 22px; height: 22px; margin-top: 7px; display: grid; place-items: center; border: 1px solid var(--border-strong); border-radius: 11px; color: var(--brand-ink); font-size: var(--fs-xs); font-weight: 650; }',
      '.jr-rt-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }', '.jr-rt-cond { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }',
      '.jr-rt-says { min-width: 0; color: var(--text-2); font-size: var(--fs-sm); }', '.jr-rt .iconbtn { margin-top: 3px; }', '.jr-rt .iconbtn:disabled { opacity: .35; cursor: default; background: none; color: var(--text-2); }']) {
      assert.equal(count(css, `\n${rule}\n`), 1, rule.slice(0, 40));
    }
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m, 'a part of a form that is hidden stays hidden, whatever its class says');
  });
});

describe('the router\'s window (Part 25)', () => {
  const H = what => F.__page().handlers[what];
  const rows = () => F.__page().fields.routes.innerHTML;
  const plain = v => v.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');   // what the row shows, as a person reads it
  const says = () => [...rows().matchAll(/<span class="jr-rt-says">([^<]*)<\/span>/g)].map(m => plain(m[1]));
  const names = () => [...rows().matchAll(/data-rt-name="\d+"[^>]* value="([^"]*)">/g)].map(m => m[1]);
  const b = (what, i) => [{}, { dataset: { [what]: String(i) } }];   // a press on the row's button, as the page's `on` hands it over
  const type = (i, value) => H('input [data-rt-name]')({}, { dataset: { rtName: String(i) }, value });
  const form = (more = {}) => F.__fill({ n: '0', unit: 'min', name: '', ...more });
  const posted = () => logged('post')[0][2];
  const SAVED = { ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 5 ? { ...n, title: 'Who gets what', wait_minutes: 120 } : n)) };

  test('the rows: a route\'s number, its name, its condition as the box says it with a way to set, change or drop it, and the buttons that move or remove it', () => {
    fill({ manage: true });
    const out = F.journeyRouterRowsHtml([{ id: 1, name: 'A "big" <b>one</b>', when: { test: 'has_phone' } }, { id: null, name: '', when: null }]);
    assert.ok(out.startsWith('<li class="jr-rt"><span class="jr-rt-no" aria-hidden="true">1</span><div class="jr-rt-main">'));
    assert.match(out, /<input class="input" data-rt-name="0" maxlength="60" autocomplete="off" placeholder="Name \(optional\)" aria-label="Name of route 1" value="A &quot;big&quot; &lt;b&gt;one&lt;\/b&gt;">/);
    assert.match(out, /<div class="jr-rt-cond"><span class="jr-rt-says">Phone number known\?<\/span><button type="button" class="btn btn-ghost btn-sm" data-rt-cond="0">Change<\/button><button type="button" class="btn btn-ghost btn-sm" data-rt-clear="0">No condition<\/button><\/div>/);
    assert.match(out, /<div class="jr-rt-cond"><span class="jr-rt-says">Every deal<\/span><button type="button" class="btn btn-ghost btn-sm" data-rt-cond="1">Set a condition<\/button><\/div>/, 'a route without a condition has none to drop');
    assert.deepEqual([...out.matchAll(/<button type="button" class="iconbtn" data-rt-(up|down|del)="(\d)" aria-label="([^"]+)" title="[^"]+"( disabled)?>/g)].map(m => [m[1], m[2], m[3], !!m[4]]),
      [['up', '0', 'Move route 1 up', true], ['down', '0', 'Move route 1 down', false], ['del', '0', 'Remove route 1', false], ['up', '1', 'Move route 2 up', false], ['down', '1', 'Move route 2 down', true], ['del', '1', 'Remove route 2', false]]);
    assert.match(F.journeyRouterRowsHtml([{ id: 1, name: '', when: null }]), /data-rt-del="0" aria-label="Remove route 1" title="Remove route 1" disabled>/, 'the only route there is cannot be removed');
    assert.equal(F.journeyRouterRowsHtml([]), '');
    assert.doesNotMatch(out, /<b>one<\/b>/);
    assert.deepEqual([...out.matchAll(/data-rt-(up|down|del)="0"[^>]*><svg class="ic " aria-hidden="true"><use href="#i-([a-z-]+)"\/>/g)].map(m => [m[1], m[2]]), [['up', 'arrow-up'], ['down', 'arrow-down'], ['del', 'x']], 'each button its own sign');
    const typed = F.journeyRouterRowsHtml([{ id: 1, name: '', when: { test: 'field', field_key: 'budget', op: 'is', value: '<img src=x onerror=alert(1)>' } }]);
    assert.match(typed, /<span class="jr-rt-says">&quot;Budget&quot; is &quot;&lt;img src=x onerror=alert\(1\)&gt;&quot;\?<\/span>/, 'a value typed into a condition stays text');
    assert.doesNotMatch(typed, /<img/);
    fill({ manage: true, lang: 'de' });
    assert.match(F.journeyRouterRowsHtml([{ id: null, name: '', when: null }]), /aria-label="Name der Route 1" value=""[^]*<span class="jr-rt-says">Jeder Deal<\/span><button[^>]*>Bedingung festlegen<\/button>/);
  });
  test('a list with one entry moved by a place; what the window holds as the server takes it', () => {
    assert.deepEqual([F.journeyRouterMoved(['a', 'b', 'c'], 1, -1), F.journeyRouterMoved(['a', 'b', 'c'], 1, 1), F.journeyRouterMoved(['a', 'b', 'c'], 0, -1), F.journeyRouterMoved(['a', 'b', 'c'], 2, 1), F.journeyRouterMoved(['a'], 5, 1), F.journeyRouterMoved(['a', 'b'], '0', 1)],
      [['b', 'a', 'c'], ['a', 'c', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c'], ['a'], ['a', 'b']]);
    assert.deepEqual([F.journeyRouterMoved(['a', 'b'], 2, -1), F.journeyRouterMoved(['a', 'b'], -1, 1)], [['a', 'b'], ['a', 'b']], 'one past either end is no place');
    const list = ['a', 'b']; F.journeyRouterMoved(list, 0, 1); assert.deepEqual(list, ['a', 'b'], 'the list handed in is not written into');
    assert.deepEqual(F.journeyRouterConfig({ routes: [{ id: 4, name: 'Kept', when: { test: 'has_phone' }, next_id: 99 }, { id: null, name: '', when: null }] }),
      { config: { routes: [{ id: 4, name: 'Kept', when: { test: 'has_phone' } }, { name: '', when: null }] } }, 'a saved route with its id, a new one without — and never a line');
    for (const routes of [[], undefined, 'x', Array.from({ length: 7 }, () => ({ id: null, name: '', when: null })), [{ id: null, name: 'x'.repeat(61), when: null }]]) assert.deepEqual(F.journeyRouterConfig({ routes }), { error: 'jr_err_router', part: 'routes' }, String(JSON.stringify(routes)).slice(0, 40));
    assert.equal(F.journeyRouterConfig({ routes: Array.from({ length: 6 }, () => ({ id: null, name: 'x'.repeat(60), when: null })) }).config.routes.length, 6);
  });
  test('a new router: "Router" in the list opens its window — when it is asked, two routes that take every deal, a name — and saving makes it behind what was pressed', async () => {
    for (const [how, where] of [[[13, {}], { after_id: 13 }], [[5, {}, 'route', '4'], { after_id: 5, side: 'route', route: 4 }], [[5, {}, 'else'], { after_id: 5, side: 'else' }]]) {
      fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'post /api/journey/flows/10/nodes': { flow: SAVED } } });
      F.openJourneyAdd(...how);
      const item = logged('menu')[0][2].at(-1);
      assert.deepEqual([item.label, item.icon], ['Router', 'columns']);
      item.onSelect();
      const [m] = modals();
      assert.equal(m.title, 'New step: Router');
      assert.equal(logged('post').length, 0, 'nothing is made before "Save"');
      assert.deepEqual([says(), names()], [['Every deal', 'Every deal'], ['', '']]);
      form({ n: '2', unit: 'hours', name: ' Split ' });
      await H('click [data-jr-save]')();
      assert.deepEqual(logged('post')[0], ['post', '/api/journey/flows/10/nodes', { title: 'Split', body: '', wait_minutes: 120, config: { routes: [{ name: '', when: null }, { name: '', when: null }] }, kind: 'router', ...where }]);
      assert.ok(logged('close').length === 1 && logged('toast').some(c => c[1] === 'Step saved'));
    }
    assert.deepEqual(server.checkRouter(posted().config).config.routes.map(r => [r.id, r.when, r.next_id]), [[1, null, null], [2, null, null]], 'what the page sends is what the server keeps');
    const [m] = modals();
    assert.match(m.body, /<label class="label" for="jr-abc1234-n">Asked after<\/label>/);
    assert.match(m.body, /<span class="label" id="jr-abc1234-rlabel">Routes<\/span>\s*<ol class="jr-rts" id="jr-abc1234-routes" aria-labelledby="jr-abc1234-rlabel" tabindex="-1"><\/ol>\s*<div><button type="button" class="btn btn-ghost btn-sm" data-rt-add><svg[^>]*><use href="#i-plus"\/><\/svg>Add a route<\/button><\/div>/);
    assert.match(m.body, /<p class="help">Up to 6 routes\. A route without a condition takes every deal\./);
    assert.match(m.body, /<label class="label" for="jr-abc1234-name">Name on the step \(optional\)<\/label>/);
    assert.match(m.body, /<p class="help">A deal goes down every route whose question is answered with yes, side by side\./);
    assert.doesNotMatch(m.footer, /data-jr-delete/);
  });
  test('a name is typed, a route added — up to six — moved and removed; the last one stays', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'router', afterId: 13 });
    type(0, 'First'); type(1, 'Second');
    H('click [data-rt-add]')();
    assert.deepEqual(names(), ['First', 'Second', ''], 'what was typed is still there when the rows are drawn again');
    assert.equal(F.__page().fields['[data-rt-name="2"]'].focused, 1, 'the cursor stands in the new row');
    type(2, 'Third');
    H('click [data-rt-up], [data-rt-down]')(...b('rtUp', 2));
    assert.deepEqual(names(), ['First', 'Third', 'Second']);
    assert.equal(F.__page().fields['[data-rt-up="1"]'].focused, 1, 'on the button that was pressed, so it can be pressed again');
    H('click [data-rt-up], [data-rt-down]')(...b('rtDown', 0));
    assert.deepEqual(names(), ['Third', 'First', 'Second']);
    H('click [data-rt-up], [data-rt-down]')(...b('rtUp', 0));
    assert.deepEqual(names(), ['Third', 'First', 'Second'], 'the first cannot go further up');
    H('click [data-rt-del]')(...b('rtDel', 1));
    assert.deepEqual(names(), ['Third', 'Second']);
    H('click [data-rt-del]')(...b('rtDel', 0)); H('click [data-rt-del]')(...b('rtDel', 0)); H('click [data-rt-del]')(...b('rtDel', 5));
    assert.deepEqual(names(), ['Second'], 'a router keeps at least one route');
    for (let i = 0; i < 8; i++) H('click [data-rt-add]')();
    assert.equal(names().length, 6);
    assert.equal(F.__page().fields['[data-rt-add]'].disabled, true, 'no route past the server\'s six');
    H('click [data-rt-del]')(...b('rtDel', 5));
    assert.equal(F.__page().fields['[data-rt-add]'].disabled, false);
    type(9, 'no such row');   // nothing happens
    assert.equal(names().length, 5);
    // a message of before goes when the rows change, and the cursor never lands on a button that is switched off
    F.__page().fields.err.hidden = false;
    H('click [data-rt-add]')();
    assert.equal(F.__page().fields.err.hidden, true);
    F.__page().fields['[data-rt-up="0"]'] = { disabled: true, focused: 0, focus() { this.focused++; } };   // the first row's "up", as the browser has it
    const before = F.__page().fields['[data-rt-name="0"]'].focused;
    H('click [data-rt-up], [data-rt-down]')(...b('rtUp', 1));
    assert.deepEqual([F.__page().fields['[data-rt-up="0"]'].focused, F.__page().fields['[data-rt-name="0"]'].focused - before], [0, 1], 'moved to the top: its "up" is off, so the cursor goes into the name');
  });
  test('a route\'s condition is set in the branch box\'s own window: a question only, handed back — and saved with the router', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: SAVED } } });
    F.openJourneyBox(null, { kind: 'router', afterId: 13 });
    const saveRouter = H('click [data-jr-save]');
    H('click [data-rt-cond]')(...b('rtCond', 1));
    const [, pick] = modals();
    assert.equal(pick.title, 'Condition of route 2');
    assert.match(pick.body, /<option value="has_phone">Does the contact have a phone number\?<\/option>/, 'the questions of a branch box');
    assert.deepEqual(['w-wait', 'w-name', 'w-hint'].map(part => F.__page().fields[part].hidden), [true, true, true], 'no wait, no name and no word about two lines: those are not a route\'s');
    form({ test: '', urgency: '', field: '', cfield: '', op: 'any', value: '', who: 'is', age: 'older', span: '', spanunit: 'days', day: '' });
    await H('click [data-jr-save]')();
    assert.equal(F.__page().fields.err.textContent, 'Choose a question.');
    assert.equal(logged('close').length, 0, 'the window stays');
    F.__fill({ test: 'has_phone' });
    await H('click [data-jr-save]')();
    assert.equal(logged('close').length, 1);
    assert.equal(logged('post').length + logged('put').length, 0, 'the question is handed back: nothing is saved by that window');
    assert.deepEqual(says(), ['Every deal', 'Phone number known?']);
    assert.match(rows(), /data-rt-cond="1">Change<\/button><button type="button" class="btn btn-ghost btn-sm" data-rt-clear="1">No condition<\/button>/);
    assert.equal(F.__page().fields['[data-rt-cond="1"]'].focused, 1);
    await saveRouter();
    assert.deepEqual(posted().config, { routes: [{ name: '', when: null }, { name: '', when: { test: 'has_phone' } }] });
    assert.deepEqual(server.checkRouter(posted().config).config.routes[1].when, { test: 'has_phone' }, 'and the server keeps it');
  });
  test('a condition that is set opens with what it is, can be changed and dropped; a question with settings comes back whole', async () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(SAVED))], answers: { 'put /api/journey/nodes/5': { flow: SAVED } } });
    F.openJourneyBox(5);
    const saveRouter = H('click [data-jr-save]');
    assert.deepEqual(says(), ['Phone number known?', '"Budget" > 500000?', 'Every deal']);
    H('click [data-rt-cond]')(...b('rtCond', 1));
    const [, pick] = modals();
    assert.match(pick.body, /<option value="field" selected>/); assert.match(pick.body, /<option value="budget" selected>Budget<\/option>/); assert.match(pick.body, /<option value="gt" selected>/);
    assert.match(pick.body, /id="jr-abc1234-value" maxlength="200" autocomplete="off" list="jr-abc1234-values" value="500000">/);
    form({ test: 'field', urgency: '', field: 'budget', cfield: '', op: 'lte', value: ' 300.000 ', who: 'is', age: 'older', span: '', spanunit: 'days', day: '' });
    await H('click [data-jr-save]')();
    assert.deepEqual(says(), ['Phone number known?', '"Budget" ≤ 300.000?', 'Every deal']);
    H('click [data-rt-clear]')(...b('rtClear', 1));
    assert.deepEqual(says(), ['Phone number known?', 'Every deal', 'Every deal'], 'the row whose button it was, not another');
    assert.equal(F.__page().fields['[data-rt-cond="1"]'].focused, 2, 'the cursor stays on that row\'s condition (once for setting it, once for dropping it)');
    H('click [data-rt-cond]')(...b('rtCond', 1));
    form({ test: 'field', urgency: '', field: 'budget', cfield: '', op: 'lte', value: ' 300.000 ', who: 'is', age: 'older', span: '', spanunit: 'days', day: '' });
    await H('click [data-jr-save]')();
    H('click [data-rt-clear]')(...b('rtClear', 0));
    assert.deepEqual(says(), ['Every deal', '"Budget" ≤ 300.000?', 'Every deal']);
    H('click [data-rt-clear]')(...b('rtClear', 7));   // no such row
    form({ n: '2', unit: 'hours', name: 'Who gets what' });
    await saveRouter();
    assert.deepEqual(logged('put')[0][2].config.routes.map(r => [r.id, r.when]), [[1, null], [2, { test: 'field', field_key: 'budget', op: 'lte', value: '300.000' }], [4, null]]);
  });
  test('an existing router opens with what was saved; saving sends each kept route with its id, a new one without, in the order of the window — never a line', async () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(SAVED))], answers: { 'put /api/journey/nodes/5': { flow: SAVED } } });
    F.openJourneyBox(5);
    const [m] = modals();
    assert.equal(m.title, 'Edit step: Router');
    assert.match(m.body, /id="jr-abc1234-n" type="number" min="0" step="1" inputmode="numeric" value="2">/); assert.match(m.body, /<option value="hours" selected>hours<\/option>/);
    assert.match(m.body, /id="jr-abc1234-name" maxlength="120" autocomplete="off" value="Who gets what">/);
    assert.match(m.footer, /data-jr-delete/);
    assert.deepEqual(names(), ['Has a &lt;b&gt;phone&lt;/b&gt;', '', '']);
    fill({ manage: true, flows: [{ ...SAVED, nodes: SAVED.nodes.map(n => (n.id === 5 ? { ...n, title: '"><img src=x>' } : n)) }] });
    F.openJourneyBox(5);
    assert.match(modals()[0].body, /id="jr-abc1234-name" maxlength="120" autocomplete="off" value="&quot;&gt;&lt;img src=x&gt;">/, 'a router\'s name stays text in its form');
    const after = { ...SAVED, nodes: SAVED.nodes.filter(n => n.id !== 13) };   // what the server answers with is what the board shows next
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(SAVED))], answers: { 'put /api/journey/nodes/5': { flow: after } } });
    F.openJourneyBox(5);
    H('click [data-rt-del]')(...b('rtDel', 1));                    // route 2 goes
    H('click [data-rt-add]')(); type(2, '  New   one ');           // a new one
    H('click [data-rt-up], [data-rt-down]')(...b('rtUp', 1));       // route 4 in front of route 1
    form({ n: '0', unit: 'min', name: ' Renamed ' });
    await H('click [data-jr-save]')();
    const sent = logged('put')[0];
    assert.deepEqual(sent, ['put', '/api/journey/nodes/5', { title: 'Renamed', body: '', wait_minutes: 0, config: { routes: [{ id: 4, name: '', when: null }, { id: 1, name: 'Has a <b>phone</b>', when: { test: 'has_phone' } }, { name: 'New one', when: null }] } }]);
    assert.doesNotMatch(JSON.stringify(sent[2]), /next_id/);
    assert.deepEqual(server.checkRouter(sent[2].config, ROUTER.config).config.routes.map(r => [r.id, r.next_id]), [[4, null], [1, 10], [5, null]], 'the server: the kept routes keep their lines, the removed one\'s is gone, the new one is numbered above');
    assert.ok(!logged('post').length && logged('close').length === 1);
    assert.equal(F.__state().journeyFlows[0].nodes.length, 5, 'the board is drawn again from the server\'s answer');
  });
  test('closing asks only when something was changed: a name typed, a route added, moved or removed, a condition set or dropped', () => {
    const open = () => { fill({ manage: true, flows: [JSON.parse(JSON.stringify(SAVED))] }); F.openJourneyBox(5); form({ n: '2', unit: 'hours', name: 'Who gets what' }); return modals()[0]; };
    const asked = () => F.__page().log.some(c => c[0] === 'unsaved?');
    let m = open();
    assert.equal(m.beforeClose(), true);
    assert.ok(!asked(), 'untouched: no question');
    m = open(); type(0, 'Has a <b>phone</b> '); assert.equal(m.beforeClose(), true); assert.ok(!asked(), 'a space typed behind a name is no change');
    const changes = [() => type(1, 'x'), () => H('click [data-rt-add]')(), () => H('click [data-rt-up], [data-rt-down]')(...b('rtDown', 0)), () => H('click [data-rt-del]')(...b('rtDel', 2)), () => H('click [data-rt-clear]')(...b('rtClear', 0)), () => form({ n: '3', unit: 'hours', name: 'Who gets what' })];
    for (const [i, change] of changes.entries()) {
      m = open(); F.__opt('unsaved', false); change();
      assert.equal(m.beforeClose(), false, `change ${i}`); assert.ok(asked(), `change ${i}`);
    }
    m = open(); H('click [data-rt-up], [data-rt-down]')(...b('rtDown', 0)); H('click [data-rt-up], [data-rt-down]')(...b('rtUp', 1));
    assert.equal(m.beforeClose(), true); assert.ok(!asked(), 'moved and moved back: as it was');
  });
  test('what is missing is said in the window; a refusal of the server is said there too, and the window stays', async () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'router', afterId: 13 });
    form({ n: 'x' });
    await H('click [data-jr-save]')();
    assert.deepEqual([F.__page().fields.err.textContent, F.__page().fields.n.focused, logged('post').length], ['The wait is a whole number, from 0 up to 365 days.', 1, 0]);
    for (const [code, said] of [['router', dict.en.jr_err_router], ['branch', dict.en.jr_err_branch], ['stage', dict.en.jr_err_stage], ['user', dict.en.jr_err_user], ['after', dict.en.jr_err_after]]) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { error: 'x', code } } });
      F.openJourneyBox(null, { kind: 'router', afterId: 13 });
      form();
      await H('click [data-jr-save]')();
      assert.equal(F.__page().fields.err.textContent, said, code);
      assert.equal(logged('close').length, 0);
    }
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'post /api/journey/flows/10/nodes': {} } });
    F.openJourneyBox(null, { kind: 'router', afterId: 13 });
    form();
    await H('click [data-jr-save]')();
    assert.equal(F.__state().journeyFlows[0].nodes.length, 6, 'an answer without a workflow draws nothing');
  });
  test('deleting asks first, by what the box says; "no" deletes nothing; deleted by a colleague meanwhile is deleted all the same', async () => {
    const without = { ...FLOW, nodes: FLOW.nodes.filter(n => n.id !== 5) };
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(SAVED))], answers: { 'del /api/journey/nodes/5': { flow: without } } });
    F.openJourneyBox(5);
    await H('click [data-jr-delete]')();
    assert.equal(logged('confirm')[0][1].message, '"Who gets what" is removed from the workflow.');
    assert.deepEqual(logged('del'), [['del', '/api/journey/nodes/5']]);
    assert.ok(logged('close').length === 1 && logged('toast').some(c => c[1] === 'Step deleted'));
    assert.equal(F.__state().journeyFlows[0].nodes.length, 5);
    fill({ manage: true });
    F.__opt('confirm', false);
    F.openJourneyBox(5);
    await H('click [data-jr-delete]')();
    assert.equal(logged('del').length, 0);
    assert.equal(logged('confirm')[0][1].message, '"3 routes" is removed from the workflow.', 'a router without a name: by what its box says');
    fill({ manage: true, answers: { 'del /api/journey/nodes/5': { error: 'x', code: 'not_found' }, '/api/journey': { flows: [], can_manage: true } } });
    F.openJourneyBox(5);
    await H('click [data-jr-delete]')(); await settle();
    assert.ok(logged('close').length === 1 && logged('toast').some(c => c[1] === 'Step deleted'));
    assert.ok(logged('get').some(c => c[1] === '/api/journey'), 'the page reads the workflows again');
  });
  test('a member reads the router — its routes one by one, what happens when none fits — with no form and no way to delete it', () => {
    fill({ manage: false, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 5 ? { ...n, title: '<img src=x onerror=alert(1)>' } : n)) }] });
    F.openJourneyBox(5);
    let [m] = modals();
    assert.equal(m.title, 'Step');
    assert.match(m.body, /<div class="jr-view" data-kind="router">\s*<p class="jr-meta"><b>Router<\/b><span>Right away<\/span><\/p>\s*<h3 class="jr-view-title">&lt;img src=x onerror=alert\(1\)&gt;<\/h3>\s*<span class="jr-routes"><span class="jr-route"><b>1<\/b><span>Has a &lt;b&gt;phone&lt;\/b&gt;<\/span><\/span>/);
    assert.match(m.body, /<p class="jr-view-text">Otherwise: when no route fits<\/p>/);
    assert.ok(m.body.includes(`<p class="help">${dict.en.jr_err_forbidden}</p>`));
    assert.doesNotMatch(m.body, /<form|<input|<select|<img|<b>phone<\/b>/);
    assert.equal(m.footer, '<button class="btn btn-secondary" data-close autofocus>Close</button>');
    assert.equal(H('click [data-jr-delete]'), undefined);
    assert.equal(F.openJourneyBox(null, { kind: 'router', afterId: 13 }), null, 'and makes none');
    fill({ manage: false, flows: [JSON.parse(JSON.stringify(SAVED))] });
    F.openJourneyBox(5);
    assert.match(modals()[0].body, /<p class="jr-meta"><b>Router<\/b><span>after 2 hours<\/span><\/p>\s*<h3 class="jr-view-title">Who gets what<\/h3>/, 'when it is asked is said');
    fill({ manage: false, lang: 'de' });
    F.openJourneyBox(5);
    [m] = modals();
    assert.match(m.body, /<p class="jr-meta"><b>Router<\/b><span>Sofort<\/span><\/p>\s*<h3 class="jr-view-title">3 Routen<\/h3>/);
    assert.match(m.body, /<span class="jr-route"><b>3<\/b><span>Jeder Deal<\/span><\/span><\/span>\s*<p class="jr-view-text">Sonst: wenn keine Route passt<\/p>/);
  });
  test('the branch box\'s own window is as it was: its wait, its name and its word about the two lines are shown', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 13 });
    assert.equal(modals()[0].title, 'New step: If / else');
    assert.deepEqual(['w-wait', 'w-name', 'w-hint'].map(part => F.__page().fields[part].hidden), [false, false, false]);
    assert.match(modals()[0].body, /<div class="field" id="jr-abc1234-w-wait"><label class="label" for="jr-abc1234-n">Asked after<\/label>/);
    assert.match(modals()[0].body, /<p class="help" id="jr-abc1234-w-hint">With yes the deal goes on along the left line/);
    assert.match(modals()[0].body, /<div class="field" id="jr-abc1234-w-name"><label class="label" for="jr-abc1234-name">Name on the step \(optional\)<\/label>/, 'the three parts a route\'s condition hides are in the form under the names the window asks for');
    assert.match(branch, /w\.el\('w-wait'\)\.hidden = !!pick; w\.el\('w-name'\)\.hidden = !!pick; w\.el\('w-hint'\)\.hidden = !!pick;/);
    assert.match(branch, /if \(pick\) \{ w\.m\.close\(\); return pick\.done\(out\.config\); \}/);
  });
});
