// CLIENT (static + pure-function) tests for a workflow's branch box and for the board's drag
// (public/js/journey-branch.js and public/js/journey.js, CUSTOMER_JOURNEY_CHANGES Part 11, 2026-11-19).
//
// A BRANCH BOX asks one question about the deal and has two lines out, "yes" (next_id) and "no" (else_id): what it
// says on its box, its two feet, where the chain puts the two sides, the lines the board draws for it, what its
// window sends, and what adding a step or drawing a line on its "no" side asks the server for.
//
// Part 20 (2026-11-23): the same question about a field of the deal's CONTACT, and for both field questions a
// comparison chosen from a list — see the describe at the end of "the window".
//
// THE DRAG. Nothing here can watch a browser paint, so what makes the drag light is tested as what the code does:
// the boxes are measured once when a drag begins, a moved box is a transform (its left and top are not written), only
// the lines that touch it are drawn again, and however often the pointer reports there is one drawing per frame. The
// page's real pointer handlers run here against a stand-in document.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const server = require('../../utils/journey-branch');

const html   = read('public/index.html');
const core   = read('public/js/core.js');
const js     = read('public/js/journey.js');
const branch = read('public/js/journey-branch.js');
const start  = read('public/js/journey-start.js');
const css    = read('public/style.css');
const dict   = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count  = (src, needle) => src.split(needle).length - 1;
const constOf = name => new Function(`${sliceConst('public/js/journey-branch.js', name)} return ${name};`)();
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
  extra, expose: ['__state', '__reset', '__fill', '__opt', '__page', '__frame', 'journeyBranchText', 'journeyBranchLines', 'journeyBranchConfig', 'journeyBranchOp', 'journeyBranchSized', 'journeyBranchBase', 'journeyContactFieldOptions', 'journeyBranchDay', 'journeyBranchSpan', 'loadJourneyPeople', 'resetJourneyBranch', 'journeyBranchTestOptions', 'journeyBranchOpOptions'],
});

const SALES = { id: 3, name: 'Sales', stages: [{ id: 31, name: 'New' }, { id: 32, name: 'Booked' }] };
const RENT  = { id: 4, name: 'Rentals', stages: [{ id: 41, name: 'Enquiry' }] };
const FIELDS = [{ field_key: 'budget', name: 'Budget', type: 'text' }, { field_key: 'finanzierung', name: 'Financing', type: 'select' }];
const CFIELDS = [{ field_key: 'kundenstatus', name: 'Customer status', type: 'dropdown', options: ['Interested', 'Approved <b>'] }, { field_key: 'einkommen', name: 'Income', type: 'number', options: [] }];
const PEOPLE = [{ id: 3, name: 'Anna <A>', email: 'anna@firma.de', role: 'owner' }, { id: 4, name: 'Ben', email: 'ben@firma.de', role: 'member' }, { id: 5, name: 'Cem', email: 'cem@firma.de', role: 'member' }];
const REST = { who: 'is', age: 'older', span: '', spanunit: 'days', day: '' };   // what the parts of Part 22 hold in a form nobody touched
const box = (id, kind, more = {}) => ({ id, kind, title: '', body: '', wait_minutes: 0, config: {}, next_id: null, else_id: null, ...more });
const START = box(1, 'start', { config: { trigger: 'lead', webhook_ids: null }, next_id: 2 });
const MAIL  = box(2, 'email', { title: 'Welcome', next_id: 7 });
const IF    = box(7, 'branch', { wait_minutes: 2880, config: { test: 'meeting' }, next_id: 8, else_id: 9 });
const YES   = box(8, 'task', { title: 'Prepare the meeting' });
const NO    = box(9, 'call', { title: 'fonio calls again' });
const FLOW  = { id: 10, name: 'New lead', nodes: [START, MAIL, IF, YES, NO] };
function fill({ manage = false, lang = 'en', flows = [FLOW], shown = 10, list = [SALES, RENT], fields = FIELDS, cfields = CFIELDS, people = PEOPLE, answers = {} } = {}) {
  F.__reset(answers);
  F.__set('currentLang', lang); F.__set('pipelines', list); F.__set('journeyFlows', flows); F.__set('journeyWebhooks', []); F.__set('journeyManage', manage);
  F.__set('journeyFlowId', shown); F.__set('journeyFonio', true); F.__set('journeyDealFields', fields); F.__set('journeyContactFields', cfields); F.__set('journeyPeople', people);
}
const modals = () => F.__page().log.filter(c => c[0] === 'modal').map(c => c[1]);
const press = what => F.__page().handlers[what]();
const tick = (value, checked) => ({ value: String(value), checked });

describe('wiring', () => {
  test('the script is loaded once, after the board and the start it borrows names from', () => {
    assert.equal(count(html, '<script src="js/journey-branch.js"></script>'), 1);
    for (const before of ['js/journey.js', 'js/journey-start.js']) assert.ok(html.indexOf(`<script src="${before}">`) < html.indexOf('<script src="js/journey-branch.js">'), before);
  });
  test('the questions and the limits are the server\'s own, and every question has its sentence and its line on the box', () => {
    assert.deepEqual(constOf('JOURNEY_TESTS'), server.TESTS);
    assert.deepEqual(constOf('JOURNEY_BRANCH_MAX'), { stages: server.MAX_STAGES, value: server.MAX_VALUE, people: server.MAX_PEOPLE, age: server.MAX_AGE });
    assert.deepEqual(Object.keys(constOf('JOURNEY_TEST_KEYS')), server.TESTS);
    assert.deepEqual(Object.keys(constOf('JOURNEY_TEST_LINES')), server.TESTS.filter(k => !['stage', 'urgency', 'field', 'contact_field', ...server.OWNER_TESTS, ...server.AGE_TESTS].includes(k)), 'those eight say what they were set to');
    assert.deepEqual([constOf('JOURNEY_OWNER_TESTS'), Object.keys(constOf('JOURNEY_OWNER_OPS')), Object.keys(constOf('JOURNEY_OWNER_LINES'))], [server.OWNER_TESTS, server.OWNER_OPS, server.OWNER_OPS]);
    assert.deepEqual([constOf('JOURNEY_AGE_TESTS'), Object.keys(constOf('JOURNEY_AGE_OPS')), Object.keys(constOf('JOURNEY_AGE_LINES'))], [server.AGE_TESTS, server.AGE_OPS, server.AGE_OPS]);
    assert.deepEqual(Object.keys(constOf('JOURNEY_WHOSE')).sort(), [...server.OWNER_TESTS, ...server.AGE_TESTS].sort());
    assert.deepEqual(Object.keys(constOf('JOURNEY_SPAN_UNITS')), Object.keys(constOf2('public/js/journey.js', 'JOURNEY_UNITS')), 'a unit of the wait each');
    assert.deepEqual([constOf('JOURNEY_FIELD_TESTS'), constOf('JOURNEY_OPS'), constOf('JOURNEY_OPS_BARE'), constOf('JOURNEY_OPS_SIZE')], [server.FIELD_TESTS, server.OPS, server.OPS_BARE, server.OPS_SIZE], 'the comparisons are the server\'s own');
    assert.deepEqual([Object.keys(constOf('JOURNEY_OP_KEYS')), Object.keys(constOf('JOURNEY_OP_LINES'))], [server.OPS, server.OPS], 'each with its words in the list and its line on the box');
    assert.deepEqual([constOf('JOURNEY_CONTACT_BASE'), Object.keys(constOf('JOURNEY_BASE_KEYS'))], [server.CONTACT_BASE, server.CONTACT_BASE], 'what every contact has is the server\'s list, each with its name');
    assert.equal(Object.keys(new Function(`${sliceConst('public/js/journey-start.js', 'JOURNEY_URGENCY_KEYS')} return JOURNEY_URGENCY_KEYS;`)()).length, server.MAX_URGENCY);
  });
  test('a branch box is a kind of step like the others: in the list, with an icon and a colour', () => {
    assert.equal(new Function(`${sliceConst('public/js/journey.js', 'JOURNEY_ACTIONS')} return JOURNEY_ACTIONS;`)().at(-2), 'branch');
    assert.ok(html.includes('<symbol id="i-help"'));
    assert.match(css, /^\[data-kind="branch"\]\s+\{ --jr-c: var\(--brand-ink\); --jr-bg: var\(--brand-subtle\); --jr-bd: var\(--brand-line\); \}$/m);
    assert.match(js, /if \(\(node \? node\.kind : fresh\.kind\) === 'branch'\) return openJourneyBranch\(node, fresh\);/);
  });
});

describe('both dictionaries', () => {
  const used = [...new Set([...branch.matchAll(/'(jb_[a-z0-9_]+)'/g)].map(m => m[1]))];
  const board = ['jr_kind_branch', 'jr_side_yes', 'jr_side_no', 'jr_out_yes_aria', 'jr_out_no_aria', 'jr_err_branch', 'jr_d_yes', 'jr_d_no'];
  test('every word of the branch box exists in English and German; none is left unused', () => {
    assert.ok(used.length >= 108, `its own keys (${used.length})`);
    for (const k of [...used, ...board]) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jb_') && !used.includes(k)), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jb_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jb_')).sort());
  });
  test('German speaks to nobody in particular, and no text says "journey"', () => {
    for (const k of [...Object.keys(dict.de).filter(x => x.startsWith('jb_')), ...board]) {
      assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
      for (const lang of ['en', 'de']) assert.doesNotMatch(dict[lang][k], /journey/i, k);
    }
  });
  test('no word of the branch box is defined twice', () => {
    const at = core.indexOf('const TRANSLATIONS'), en = core.indexOf('\n  en: {', at), de = core.indexOf('\n  de: {', en);
    for (const [lang, block] of [['en', core.slice(en, de)], ['de', core.slice(de, core.indexOf('\n};', de))]]) {
      const keys = [...block.matchAll(/(?:^|[\s,{])(jb_[a-z0-9_]+):\s*'/gm)].map(m => m[1]);
      assert.equal(keys.length, used.length, lang);
      assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], lang);
    }
  });
  test('the page says which side is which', () => {
    assert.match(dict.en.jb_hint, /With yes the deal goes on along the left line, with no along the right one\. A line that leads nowhere ends the workflow for that deal\./);
    assert.match(dict.de.jb_hint, /Bei Ja geht der Deal über die linke Linie weiter, bei Nein über die rechte\./);
  });
});

// Part 27 (2026-11-23): fourteen questions and eleven comparisons in flat lists were hard to find one's way in.
describe('the lists stand under headings (Part 27)', () => {
  const groups = constOf('JOURNEY_TEST_GROUPS'), ops = constOf('JOURNEY_OP_GROUPS');
  const read = html => [...html.matchAll(/<optgroup label="([^"]*)">([^]*?)<\/optgroup>/g)].map(g => [g[1], [...g[2].matchAll(/<option value="([a-z_]+)"( selected)?>([^<]*)</g)].map(o => [o[1], !!o[2], o[3]])]);
  test('every question stands under exactly one heading, every comparison too — none left out, none twice', () => {
    assert.deepEqual(groups.flatMap(g => g[1]).sort(), [...server.TESTS].sort());
    assert.deepEqual(ops.flatMap(g => g[1]), server.OPS, 'the comparisons keep their order');
    assert.deepEqual(groups.map(g => g[0]), ['jb_g_deal', 'jb_g_contact', 'jb_g_since']);
    assert.deepEqual(ops.map(g => [g[0], g[1]]), [['jb_g_op_filled', server.OPS_BARE], ['jb_g_op_text', ['is', 'is_not', 'contains', 'not_contains', 'starts']], ['jb_g_op_size', server.OPS_SIZE]]);
    for (const k of groups[0][1]) assert.match(dict.en[constOf('JOURNEY_TEST_KEYS')[k]], /deal/i, `a question about the deal: ${k}`);
    for (const k of groups[1][1]) assert.match(dict.en[constOf('JOURNEY_TEST_KEYS')[k]], /contact/i, `a question about the contact: ${k}`);
    for (const k of groups[2][1]) assert.match(dict.en[constOf('JOURNEY_TEST_KEYS')[k]], /since the deal entered the workflow/, `what happened since: ${k}`);
  });
  test('the questions: "choose" first, then three headings with their questions; the chosen one is marked', () => {
    fill();
    const out = F.journeyBranchTestOptions('');
    assert.ok(out.startsWith('<option value="" selected>— choose —</option><optgroup label="About the deal"><option value="stage">Is the deal in one of these stages?</option>'));
    assert.deepEqual(read(out).map(g => [g[0], g[1].map(o => o[0])]), [['About the deal', ['stage', 'assigned', 'deal_owner', 'urgency', 'field', 'deal_age']],
      ['About the contact', ['has_email', 'has_phone', 'contact_field', 'contact_owner', 'contact_age', 'opt_out']], ['Since the deal entered the workflow', ['meeting', 'answered']]]);
    assert.equal((out.match(/ selected/g) || []).length, 1);
    const chosen = F.journeyBranchTestOptions('contact_owner');
    assert.match(chosen, /^<option value="">— choose —<\/option>/); assert.match(chosen, /<option value="contact_owner" selected>Who is the contact assigned to\?<\/option>/);
    assert.equal((chosen.match(/ selected/g) || []).length, 1);
    assert.match(F.journeyBranchTestOptions('weather'), /^<option value="">— choose —<\/option>/, 'a question nobody knows marks nothing');
    fill({ lang: 'de' });
    assert.deepEqual(read(F.journeyBranchTestOptions('')).map(g => g[0]), ['Zum Deal', 'Zum Kontakt', 'Seit der Deal im Workflow ist']);
  });
  test('the comparisons: whether it is filled in, text, numbers and dates', () => {
    fill();
    assert.deepEqual(read(F.journeyBranchOpOptions('gt')), [['Filled in or not', [['any', false, 'has any value'], ['empty', false, 'is empty']]],
      ['Text', [['is', false, 'is exactly'], ['is_not', false, 'is not'], ['contains', false, 'contains'], ['not_contains', false, 'does not contain'], ['starts', false, 'starts with']]],
      ['Numbers and dates', [['gt', true, 'is greater than, or later than'], ['gte', false, 'is at least, or not earlier than'], ['lt', false, 'is less than, or earlier than'], ['lte', false, 'is at most, or not later than']]]]);
    assert.ok(F.journeyBranchOpOptions('any').startsWith('<optgroup label="Filled in or not"><option value="any" selected>has any value</option>'), 'no "choose": a comparison is always chosen');
    fill({ lang: 'de' });
    assert.deepEqual(read(F.journeyBranchOpOptions('any')).map(g => g[0]), ['Ausgefüllt oder nicht', 'Text', 'Zahlen und Datumsangaben']);
  });
  test('the window uses them: both lists come grouped, with what was saved chosen', () => {
    fill({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? { ...IF, config: { test: 'contact_field', field_key: 'einkommen', op: 'gte', value: '4000' } } : n)) }] });
    F.openJourneyBox(7);
    const body = modals()[0].body;
    const tests = body.slice(body.indexOf('id="jr-abc1234-test"'), body.indexOf('</select>', body.indexOf('id="jr-abc1234-test"')));
    const list = body.slice(body.indexOf('id="jr-abc1234-op"'), body.indexOf('</select>', body.indexOf('id="jr-abc1234-op"')));
    assert.deepEqual(read(tests).map(g => g[0]), ['About the deal', 'About the contact', 'Since the deal entered the workflow']);
    assert.match(tests, /<optgroup label="About the contact">[^]*<option value="contact_field" selected>/);
    assert.deepEqual(read(list).map(g => g[0]), ['Filled in or not', 'Text', 'Numbers and dates']);
    assert.match(list, /<optgroup label="Numbers and dates">[^]*<option value="gte" selected>/);
    assert.match(branch, /id="\$\{fid\}-test" autofocus>\$\{journeyBranchTestOptions\(start\.test\)\}<\/select>/);
    assert.match(branch, /id="\$\{fid\}-op">\$\{journeyBranchOpOptions\(start\.op\)\}<\/select>/);
  });
  test('a heading is text', () => {
    assert.match(branch, /<optgroup label="\$\{esc\(t\(heading\)\)\}">/g);
    assert.equal(count(branch, '<optgroup label="${esc(t(heading))}">'), 2);
  });
});

describe('what a branch box says', () => {
  test('its question as one short line, with what it was set to', () => {
    fill();
    const says = config => F.journeyBranchText(config);
    assert.equal(says({ test: 'stage', stage_ids: [32] }), 'Deal in: Booked (Sales)?');
    assert.equal(says({ test: 'stage', stage_ids: [31, 41] }), 'Deal in: New (Sales), Enquiry (Rentals)?');
    assert.equal(says({ test: 'meeting' }), 'Meeting booked?'); assert.equal(says({ test: 'answered' }), 'Reached by a fonio call?');
    assert.equal(says({ test: 'opt_out' }), 'No more emails wanted?'); assert.equal(says({ test: 'has_email' }), 'Email address known?');
    assert.equal(says({ test: 'has_phone' }), 'Phone number known?'); assert.equal(says({ test: 'assigned' }), 'Deal assigned?');
    assert.equal(says({ test: 'urgency', min_urgency: 3 }), 'Urgency at least "High"?');
    assert.equal(says({ test: 'field', field_key: 'budget' }), '"Budget" filled in?');
    assert.equal(says({ test: 'field', field_key: 'finanzierung', value: 'ja' }), '"Financing" is "ja"?');
    fill({ list: [SALES] });
    assert.equal(says({ test: 'stage', stage_ids: [31, 32] }), 'Deal in: New, Booked?', 'one pipeline: its name is not repeated');
  });
  test('what is gone, missing or unknown is said, not guessed', () => {
    fill();
    assert.equal(F.journeyBranchText({ test: 'stage', stage_ids: [32, 999] }), 'Deal in: Booked (Sales), a stage that no longer exists?');
    assert.equal(F.journeyBranchText({ test: 'field', field_key: 'gone' }), '"a field that no longer exists" filled in?');
    assert.equal(F.journeyBranchText({ test: 'weather' }), 'A question this version does not know');
    for (const none of [{}, null, undefined, { test: '' }]) assert.equal(F.journeyBranchText(none), 'No question chosen');
    assert.equal(F.journeyBranchText({ test: 'constructor' }), 'A question this version does not know', 'only the questions themselves, nothing an object carries besides');
  });
  test('a name, when it has one, is the title and the question the line under it', () => {
    fill();
    assert.deepEqual(F.journeyBranchLines(IF), { title: 'Meeting booked?', text: '' });
    assert.deepEqual(F.journeyBranchLines({ ...IF, title: '  Booked yet  ' }), { title: 'Booked yet', text: 'Meeting booked?' });
    fill({ lang: 'de' });
    assert.deepEqual(F.journeyBranchLines({ ...IF, config: { test: 'urgency', min_urgency: 4 } }), { title: 'Dringlichkeit mindestens „Sehr dringend“?', text: '' });
  });
  test('on the board: its kind, when it is asked, its question — and typed text stays text', () => {
    fill({ manage: true });
    const out = F.journeyBoxHtml(IF);
    assert.match(out, /^<button type="button" class="jr-box" data-box="7" data-kind="branch"><span class="jr-ic"><svg class="ic " aria-hidden="true"><use href="#i-help"\/><\/svg><\/span>/);
    assert.match(out, /<span class="jr-meta"><b>If \/ else<\/b><span>after 2 days<\/span><\/span>\s*<span class="jr-title">Meeting booked\?<\/span><\/span>/);
    const named = F.journeyBoxHtml({ ...IF, title: '<img src=x onerror=alert(1)>', config: { test: 'field', field_key: 'budget', value: '"><script>alert(2)</script>' } });
    assert.doesNotMatch(named, /<img|<script/);
    assert.match(named, /<span class="jr-title">&lt;img src=x onerror=alert\(1\)&gt;<\/span><span class="jr-text">&quot;Budget&quot; is &quot;&quot;&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;&quot;\?<\/span>/);
  });
  test('a member reads it: when it is asked and its question, no form', () => {
    fill({ manage: false });
    F.openJourneyBox(7);
    const [m] = modals();
    assert.doesNotMatch(m.body, /<form|<input|<select/);
    assert.match(m.body, /<div class="jr-view" data-kind="branch">\s*<p class="jr-meta"><b>If \/ else<\/b><span>after 2 days<\/span><\/p>\s*<h3 class="jr-view-title">Meeting booked\?<\/h3>/);
    fill({ manage: false, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? { ...n, title: 'Booked yet' } : n)) }] });
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /<h3 class="jr-view-title">Booked yet<\/h3>\s*<p class="jr-view-text">Meeting booked\?<\/p>/);
  });
});

describe('the two sides on the board', () => {
  test('a branch box has two feet, "Yes" and "No": for an owner or admin each is the handle of its line', () => {
    fill({ manage: true });
    const out = F.journeyBoardHtml(FLOW), node = out.slice(out.indexOf('data-node="7"'), out.indexOf('data-node="8"'));
    assert.match(node, /<button type="button" class="jr-out jr-side is-yes" data-out="7" data-side="next" aria-label="If yes: add a step, or drag onto another step to draw the line" title="[^"]+"><span>Yes<\/span><svg/);
    assert.match(node, /<button type="button" class="jr-out jr-side is-no" data-out="7" data-side="else" aria-label="If no: add a step, or drag onto another step to draw the line" title="[^"]+"><span>No<\/span><svg/);
    assert.equal(count(node, 'data-out="7"'), 2);
    assert.deepEqual([...out.matchAll(/class="jr-out" data-out="(\d+)"/g)].map(m => m[1]), ['1', '2', '8', '9'], 'every other box keeps its one "+"');
  });
  test('a member reads the two feet and can do nothing with them', () => {
    fill({ manage: false });
    const out = F.journeyBoardHtml(FLOW);
    assert.match(out, /<span class="jr-side is-yes">Yes<\/span><span class="jr-side is-no">No<\/span>/);
    assert.doesNotMatch(out, /data-out|data-side|<button type="button" class="jr-out/);
    fill({ manage: false, lang: 'de' });
    assert.match(F.journeyBoardHtml(FLOW), /<span class="jr-side is-yes">Ja<\/span><span class="jr-side is-no">Nein<\/span>/);
  });
  test('the chain: what "yes" leads to first, then what "no" leads to; no box twice', () => {
    assert.deepEqual(F.journeyChain(FLOW).chain.map(n => n.id), [1, 2, 7, 8, 9]);
    assert.deepEqual(F.journeyChain(FLOW).loose, []);
    const joined = { nodes: [START, MAIL, IF, { ...YES, next_id: 12 }, { ...NO, next_id: 12 }, box(12, 'move')] };
    assert.deepEqual(F.journeyChain(joined).chain.map(n => n.id), [1, 2, 7, 8, 12, 9], 'two sides that meet again: the box they meet in stands once');
    const round = { nodes: [START, MAIL, { ...IF, else_id: 2 }, YES] };
    assert.deepEqual(F.journeyChain(round).chain.map(n => n.id), [1, 2, 7, 8], 'a line that leads back ends there instead of running for ever');
    const lost = { nodes: [START, MAIL, { ...IF, else_id: 999 }, YES, NO] };
    assert.deepEqual([F.journeyChain(lost).chain.map(n => n.id), F.journeyChain(lost).loose.map(n => n.id)], [[1, 2, 7, 8], [9]], 'a "no" line to a box that is gone leads nowhere');
    assert.deepEqual(F.journeyChain({ nodes: [START, { ...MAIL, else_id: 9, next_id: null }, NO] }).loose.map(n => n.id), [9], 'only a branch box has a second line');
  });
  test('where the chain puts them: "yes" under the branch box, "no" one column to the right', () => {
    assert.deepEqual(F.journeyPlaces(FLOW), { 1: { x: 40, y: 40 }, 2: { x: 40, y: 190 }, 7: { x: 40, y: 340 }, 8: { x: 40, y: 490 }, 9: { x: 420, y: 490 } });
    assert.equal(F.journeyLayout(FLOW).width, 2);
    const onlyNo = { nodes: [START, MAIL, { ...IF, next_id: null }, NO] };
    assert.deepEqual(F.journeyPlaces(onlyNo)[9], { x: 420, y: 490 }, 'no "yes" side: its column stays free');
  });
  test('a branch inside a "yes" side pushes the outer "no" side further right; loose boxes stand beside all of it', () => {
    const inner = box(8, 'branch', { config: { test: 'assigned' }, next_id: 20, else_id: 21 });
    const nested = { nodes: [START, MAIL, IF, inner, NO, box(20, 'task'), box(21, 'task'), box(30, 'sms'), box(31, 'sms')] };
    const p = F.journeyPlaces(nested);
    assert.deepEqual([p[8], p[20], p[21]], [{ x: 40, y: 490 }, { x: 40, y: 640 }, { x: 420, y: 640 }]);
    assert.deepEqual(p[9], { x: 800, y: 490 }, 'right of the two columns the "yes" side needed');
    assert.deepEqual([p[30], p[31]], [{ x: 1180, y: 40 }, { x: 1180, y: 190 }]);
    assert.equal(F.journeyLayout(nested).width, 3);
    assert.deepEqual(F.journeyPlaces({ nodes: FLOW.nodes.map(n => (n.id === 9 ? { ...n, x: 900, y: 60 } : n)) })[9], { x: 900, y: 60 }, 'a box that was dragged keeps its place');
  });
});

describe('the lines', () => {
  const RECTS = { 1: { x: 40, y: 40, w: 300, h: 80 }, 2: { x: 40, y: 190, w: 300, h: 80 }, 7: { x: 40, y: 340, w: 300, h: 80 }, 8: { x: 40, y: 490, w: 300, h: 80 }, 9: { x: 420, y: 490, w: 300, h: 80 } };
  test('a branch box has two: "yes" leaves a quarter in from the left, "no" a quarter in from the right — where its feet stand', () => {
    assert.deepEqual(F.journeyEdges(FLOW), [{ from: 1, to: 2, side: 'next', part: 0.5 }, { from: 2, to: 7, side: 'next', part: 0.5 }, { from: 7, to: 8, side: 'next', part: 0.25 }, { from: 7, to: 9, side: 'else', part: 0.75 }]);
    assert.deepEqual([F.journeyPart(IF, 'next'), F.journeyPart(IF, 'else'), F.journeyPart(MAIL, 'next'), F.journeyPart(MAIL, 'else'), F.journeyPart(undefined, 'else')], [0.25, 0.75, 0.5, 0.5, 0.5]);
    assert.match(css, /^\.jr-side\.is-yes \{ left: 25%;/m); assert.match(css, /^\.jr-side\.is-no\s+\{ left: 75%; \}$/m);
    assert.deepEqual(F.journeyEdges({ nodes: [{ ...MAIL, else_id: 9 }] }), [{ from: 2, to: 7, side: 'next', part: 0.5 }], 'a second line on a box that is no branch is not drawn');
    for (const odd of [null, undefined, {}, { nodes: 'x' }]) assert.deepEqual(F.journeyEdges(odd), []);
  });
  test('a line leaves the foot at its part of the width and arrives at the middle of the head', () => {
    assert.equal(F.journeyLinePath(RECTS[7], RECTS[8], 0.25), 'M115 420 C115 456 190 454 190 490');
    assert.equal(F.journeyLinePath(RECTS[7], RECTS[9], 0.75), 'M265 420 C265 456 570 454 570 490');
    assert.equal(F.journeyLinePath(RECTS[1], RECTS[2]), 'M190 120 C190 156 190 154 190 190', 'without a part: the middle, as before');
  });
  test('each line says which boxes it joins; an owner or admin can click each away, a branch box\'s two apart', () => {
    fill({ manage: true });
    const out = F.journeyLinesHtml(FLOW, RECTS);
    assert.equal(count(out, '<path class="jr-line" '), 4); assert.equal(count(out, '<path class="jr-line-hit" '), 4);
    assert.ok(out.includes('<path class="jr-line" data-from="7" data-to="8" data-part="0.25" d="M115 420 C115 456 190 454 190 490" marker-end="url(#jr-arrow)"/>'));
    assert.ok(out.includes('<path class="jr-line-hit" data-line="7" data-side="next" data-from="7" data-to="8" data-part="0.25" d="M115 420 C115 456 190 454 190 490"/>'));
    assert.ok(out.includes('<path class="jr-line-hit" data-line="7" data-side="else" data-from="7" data-to="9" data-part="0.75" d="M265 420 C265 456 570 454 570 490"/>'));
    assert.match(out, /^<defs><marker id="jr-arrow"/); assert.match(out, /<path class="jr-line jr-line-new" id="jr-line-new" d="" marker-end="url\(#jr-arrow\)"\/>$/);
    fill({ manage: false });
    const read = F.journeyLinesHtml(FLOW, RECTS);
    assert.equal(count(read, '<path class="jr-line" '), 4); assert.doesNotMatch(read, /jr-line-hit|data-line/);
  });
  test('a line to a box that is not on the board is left out', () => {
    fill({ manage: true });
    const { 9: gone, ...rest } = RECTS;
    assert.equal(count(F.journeyLinesHtml(FLOW, rest), '<path class="jr-line" '), 3);
    assert.equal(count(F.journeyLinesHtml({ nodes: [] }, RECTS), '<path'), 2, 'the arrow head and the line drawn by hand');
  });
});

describe('adding a step and drawing a line on a side', () => {
  test('the "No" foot adds behind the "no" line, the "Yes" foot and every "+" behind the one line a box has', async () => {
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    assert.deepEqual([F.journeyBehind({ afterId: 7, side: 'else' }), F.journeyBehind({ afterId: '7', side: 'next' }), F.journeyBehind({ afterId: 7 }), F.journeyBehind({ afterId: null, side: 'else' }), F.journeyBehind({})],
      [{ after_id: 7, side: 'else' }, { after_id: 7 }, { after_id: 7 }, { after_id: null, side: 'else' }, { after_id: null }]);
    F.openJourneyAdd(7, {}, 'else');
    const items = F.__page().log.find(c => c[0] === 'menu')[2];
    assert.equal(items.at(-2).label, 'If / else');
    items.at(-3).onSelect();
    assert.equal(modals()[0].title, 'New step: Wait');
    F.__fill({ n: '1', unit: 'days', then: 'now', at: '09:00' });
    await press('click [data-jr-save]');
    const sent = F.__page().log.find(c => c[0] === 'post')[2];
    assert.deepEqual([sent.after_id, sent.side], [7, 'else'], 'the side chosen at the foot reaches the request');
  });
  test('a new step on the "no" side tells the server so — an email, a wait and a branch alike', async () => {
    for (const [kind, values] of [['email', { n: '0', unit: 'min', title: 'Reminder', text: 'Hello' }], ['wait', { n: '1', unit: 'days', then: 'now', at: '09:00' }], ['branch', { n: '0', unit: 'min', name: '', test: 'assigned' }]]) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
      F.openJourneyBox(null, { kind, afterId: 7, side: 'else' });
      F.__fill(values);
      await press('click [data-jr-save]');
      const sent = F.__page().log.find(c => c[0] === 'post')[2];
      assert.deepEqual([sent.kind, sent.after_id, sent.side], [kind, 7, 'else'], kind);
    }
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyBox(null, { kind: 'branch', afterId: 7 });
    F.__fill({ n: '0', unit: 'min', name: '', test: 'assigned' });
    await press('click [data-jr-save]');
    assert.ok(!('side' in F.__page().log.find(c => c[0] === 'post')[2]), 'the "yes" side is the box\'s own line: nothing more is said');
  });
  test('a line drawn from the "No" foot is the "no" line; taking a line away says which of the two', async () => {
    fill({ manage: true, answers: { 'put /api/journey/nodes/7/next': { flow: FLOW } } });
    await F.journeyDropLine({ id: 7, side: 'else' }, 2);
    await F.journeyDropLine({ id: 7, side: 'next' }, 2);
    await F.journeyRemoveLine(7, 'else'); await F.journeyRemoveLine(7, 'next'); await F.journeyRemoveLine(7);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'put').map(c => c[2]), [{ next_id: 2, side: 'else' }, { next_id: 2 }, { next_id: null, side: 'else' }, { next_id: null }, { next_id: null }]);
  });
  test('a click: the foot that was pressed says its side, and so does the line that is taken away', () => {
    assert.match(hands, /if \(add\) openJourneyAdd\(Number\(add\.dataset\.out\), add, add\.dataset\.side, add\.dataset\.route\);/);
    assert.match(hands, /onSelect: \(\) => journeyRemoveLine\(Number\(line\.dataset\.line\), line\.dataset\.side, line\.dataset\.route\) \}\]\);/);
    fill({ manage: true });
    const foot = { dataset: { out: '7', side: 'else' } };
    F.__page().listeners.click({ clientX: 1, clientY: 1, target: { closest: sel => (sel === '#journey-board' ? {} : sel === '[data-out]' ? foot : null) } });
    const [, anchor, items] = F.__page().log.find(c => c[0] === 'menu');
    assert.equal(anchor, foot);
    items[1].onSelect();   // a call, behind the "no" line
    assert.equal(modals()[0].title, 'New step: Call (fonio)');
  });
});

describe('the window', () => {
  test('a new one: when it is asked, the fourteen questions, and what each of them needs', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    const [m] = modals();
    assert.equal(m.title, 'New step: If / else');
    assert.match(m.body, /<label class="label" for="jr-abc1234-n">Asked after<\/label>/);
    assert.match(m.body, /id="jr-abc1234-n" type="number" min="0" step="1" inputmode="numeric" value="0">/);
    const list = m.body.slice(m.body.indexOf('id="jr-abc1234-test"'), m.body.indexOf('</select>', m.body.indexOf('id="jr-abc1234-test"')));
    assert.deepEqual([...list.matchAll(/<option value="([a-z_]*)"/g)].map(x => x[1]).sort(), ['', ...server.TESTS].sort(), 'every question once (under its heading since Part 27)');
    assert.match(list, /<option value="meeting">Was a meeting booked since the deal entered the workflow\?<\/option>/);
    assert.deepEqual([...m.body.matchAll(/<input type="checkbox" data-jb-stage value="(\d+)">/g)].map(x => x[1]), ['31', '32', '41'], 'every stage, none ticked');
    assert.match(m.body, /<div class="jt-stage-group"><span class="help">Sales<\/span>/);
    assert.match(m.body, /id="jr-abc1234-urgency"><option value="" selected>— choose —<\/option><option value="1">Low<\/option><option value="2">Medium<\/option><option value="3">High<\/option><option value="4">Very urgent<\/option>/);
    assert.match(m.body, /id="jr-abc1234-field"><option value="" selected>— choose —<\/option><option value="budget">Budget<\/option><option value="finanzierung">Financing<\/option>/);
    assert.match(m.body, /id="jr-abc1234-value" maxlength="200" autocomplete="off" list="jr-abc1234-values" value=""><datalist id="jr-abc1234-values"><\/datalist>/);
    assert.match(m.body, /<label class="label" for="jr-abc1234-name">Name on the step \(optional\)<\/label>/);
    assert.doesNotMatch(m.footer, /data-jr-delete/);
  });
  test('only what the chosen question needs is shown', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    const shown = () => ['w-stages', 'w-urgency', 'w-field', 'w-cfield', 'w-op', 'w-value'].filter(part => F.__page().fields[part].hidden === false);
    assert.deepEqual(shown(), [], 'no question yet: none of it');
    for (const [test, op, parts] of [['stage', 'any', ['w-stages']], ['urgency', 'any', ['w-urgency']], ['field', 'any', ['w-field', 'w-op']], ['field', 'is', ['w-field', 'w-op', 'w-value']],
      ['contact_field', 'empty', ['w-cfield', 'w-op']], ['contact_field', 'gt', ['w-cfield', 'w-op', 'w-value']], ['meeting', 'is', []], ['assigned', 'gt', []]]) {
      F.__fill({ test, op });
      press('change select');
      assert.deepEqual(shown(), parts, `${test} ${op}`);
    }
  });
  test('saving sends the question with what it uses, and nothing of the others', async () => {
    const cases = [
      [{ test: 'meeting', urgency: '3', field: 'budget', op: 'is', value: 'x' }, [], { test: 'meeting' }],
      [{ test: 'stage' }, [tick(31, true), tick(32, false), tick(41, true)], { test: 'stage', stage_ids: [31, 41] }],
      [{ test: 'urgency', urgency: '3' }, [tick(31, true)], { test: 'urgency', min_urgency: 3 }],
      [{ test: 'field', field: 'budget', value: '' }, [], { test: 'field', field_key: 'budget' }],
      [{ test: 'field', field: 'budget', value: 'typed before "any" was chosen' }, [], { test: 'field', field_key: 'budget' }],
      [{ test: 'field', field: 'finanzierung', op: 'is', value: '  ja ' }, [], { test: 'field', field_key: 'finanzierung', value: 'ja' }],
    ];
    for (const [values, checks, config] of cases) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
      F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
      F.__opt('checks', checks);
      F.__fill({ n: '2', unit: 'days', name: ' Booked yet ', urgency: '', field: '', cfield: '', op: 'any', value: '', ...values });
      await press('click [data-jr-save]');
      assert.deepEqual(F.__page().log.find(c => c[0] === 'post'), ['post', '/api/journey/flows/10/nodes', { title: 'Booked yet', body: '', wait_minutes: 2880, config, kind: 'branch', after_id: 2 }], values.test);
      assert.ok(F.__page().log.some(c => c[0] === 'close') && F.__page().log.some(c => c[0] === 'toast' && c[1] === 'Step saved'));
    }
  });
  test('what is missing is said in the window and nothing is sent', async () => {
    const cases = [
      [{ n: 'x', test: 'meeting' }, [], 'The wait is a whole number, from 0 up to 365 days.', 'n'],
      [{ test: '' }, [], 'Choose a question.', 'test'],
      [{ test: 'stage' }, [tick(31, false)], 'Tick at least one stage.', 'stages'],
      [{ test: 'stage' }, Array.from({ length: 21 }, (_, i) => tick(100 + i, true)), 'At most 20 stages.', 'stages'],
      [{ test: 'urgency', urgency: '' }, [], 'Choose a level.', 'urgency'],
      [{ test: 'urgency', urgency: '9' }, [], 'Choose a level.', 'urgency'],
      [{ test: 'field', field: '' }, [], 'Choose a field.', 'field'],
      [{ test: 'contact_field', field: 'budget', cfield: '' }, [], 'Choose a field.', 'cfield'],
      [{ test: 'field', field: 'budget', op: '' }, [], 'Choose a comparison.', 'op'],
      [{ test: 'field', field: 'budget', op: 'is', value: '  ' }, [], 'Type the value to compare with.', 'value'],
      [{ test: 'contact_field', cfield: 'einkommen', op: 'contains', value: '' }, [], 'Type the value to compare with.', 'value'],
      [{ test: 'contact_field', cfield: 'einkommen', op: 'gt', value: 'a lot' }, [], 'Greater and less need a number or a date, for example 250000 or 31.12.2027.', 'value'],
    ];
    for (const [values, checks, said, part] of cases) {
      fill({ manage: true });
      F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
      F.__opt('checks', checks);
      F.__fill({ n: '0', unit: 'min', name: '', urgency: '', field: '', cfield: '', op: 'any', value: '', ...values });
      await press('click [data-jr-save]');
      const { fields, log } = F.__page();
      assert.equal(fields.err.textContent, said); assert.equal(fields.err.hidden, false); assert.equal(fields[part].focused, 1, said);
      assert.ok(!log.some(c => c[0] === 'post' || c[0] === 'close'), said);
    }
  });
  test('journeyBranchConfig: only a known question, only its own settings', () => {
    const now = { test: 'meeting', stages: [31], urgency: '2', field: 'budget', cfield: 'kundenstatus', op: 'is', value: 'x', who: 'is', people: [3], age: 'older', span: '30', spanunit: 'days', day: '2026-12-31' };
    assert.deepEqual(F.journeyBranchConfig(now), { config: { test: 'meeting' } });
    assert.deepEqual(F.journeyBranchConfig({ ...now, test: 'stage' }), { config: { test: 'stage', stage_ids: [31] } });
    assert.deepEqual(F.journeyBranchConfig({ ...now, test: 'urgency' }), { config: { test: 'urgency', min_urgency: 2 } });
    assert.deepEqual(F.journeyBranchConfig({ ...now, test: 'field' }), { config: { test: 'field', field_key: 'budget', value: 'x' } });
    assert.deepEqual(F.journeyBranchConfig({ ...now, test: 'contact_field' }), { config: { test: 'contact_field', field_key: 'kundenstatus', value: 'x' } }, 'each question takes the field of its own list');
    for (const test of ['', 'weather', 'constructor', undefined]) assert.deepEqual(F.journeyBranchConfig({ ...now, test }), { error: 'jb_err_test', part: 'test' });
    assert.deepEqual(F.journeyBranchConfig({ ...now, test: 'urgency', urgency: 'toString' }), { error: 'jb_err_urgency', part: 'urgency' });
    for (const k of server.TESTS) {   // what the window builds is what the server takes
      const built = F.journeyBranchConfig({ ...now, test: k });
      assert.deepEqual(server.checkBranch(built.config), { config: built.config }, k);
    }
  });
  test('an existing one opens with what was saved, and saving replaces it at its own address', async () => {
    const saved = { ...IF, title: 'In a late stage', config: { test: 'stage', stage_ids: [41, 32] } };
    fill({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? saved : n)) }], answers: { 'put /api/journey/nodes/7': { flow: FLOW } } });
    F.openJourneyBox(7);
    const [m] = modals();
    assert.equal(m.title, 'Edit step: If / else');
    assert.match(m.body, /id="jr-abc1234-n" type="number" min="0" step="1" inputmode="numeric" value="2">/); assert.match(m.body, /<option value="days" selected>days<\/option>/);
    assert.match(m.body, /<option value="stage" selected>Is the deal in one of these stages\?<\/option>/);
    assert.deepEqual([...m.body.matchAll(/data-jb-stage value="(\d+)" checked/g)].map(x => x[1]), ['32', '41']);
    assert.match(m.body, /id="jr-abc1234-name" maxlength="120" autocomplete="off" value="In a late stage">/);
    assert.match(m.footer, /data-jr-delete/);
    F.__opt('checks', [tick(32, true)]);
    F.__fill({ n: '0', unit: 'min', name: 'Booked', test: 'stage', urgency: '', field: '', cfield: '', op: 'any', value: '' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/7', { title: 'Booked', body: '', wait_minutes: 0, config: { test: 'stage', stage_ids: [32] } }]);
    assert.ok(!F.__page().log.some(c => c[0] === 'post'));
  });
  test('closing asks only when something was changed; ticks under another question are not a change', () => {
    fill({ manage: true });
    F.openJourneyBox(7);
    const same = { n: '2', unit: 'days', name: '', test: 'meeting', urgency: '', field: '', cfield: '', op: 'any', value: '', ...REST };
    F.__fill(same); F.__opt('checks', [tick(31, true)]);
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'the question is "meeting": stage ticks do not belong to it');
    F.__fill({ ...same, test: 'stage' });
    F.__opt('unsaved', false);
    assert.equal(modals()[0].beforeClose(), false);
    assert.ok(F.__page().log.some(c => c[0] === 'unsaved?'));
  });
  // Found by the bug hunt of 2026-11-19: a branch box whose stage or field was deleted since asked "unsaved
  // changes?" when nobody had touched its window.
  test('a stage or a field that is gone since is not what the window opens with: an untouched window asks nothing', () => {
    const lost = { ...IF, config: { test: 'stage', stage_ids: [32, 999] } };
    fill({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? lost : n)) }] });
    F.openJourneyBox(7);
    assert.deepEqual([...modals()[0].body.matchAll(/data-jb-stage value="(\d+)" checked/g)].map(x => x[1]), ['32']);
    F.__fill({ n: '2', unit: 'days', name: '', test: 'stage', urgency: '', field: '', cfield: '', op: 'any', value: '', ...REST });
    F.__opt('checks', [tick(31, false), tick(32, true), tick(41, false)]);   // what the form can show: the stages there are
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    const noField = { ...IF, config: { test: 'field', field_key: 'gone', value: 'ja' } };
    fill({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? noField : n)) }] });
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /id="jr-abc1234-field"><option value="" selected>— choose —<\/option>/, 'no field is chosen: the saved one is not offered any more');
    F.__fill({ n: '2', unit: 'days', name: '', test: 'field', urgency: '', field: '', cfield: '', op: 'is', value: 'ja', ...REST });   // a list cannot hold a value it does not offer
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
  });
  test('deleting asks first, by what the box says', async () => {
    fill({ manage: true, answers: { 'del /api/journey/nodes/7': { flow: { ...FLOW, nodes: FLOW.nodes.filter(n => n.id !== 7) } } } });
    F.openJourneyBox(7);
    await press('click [data-jr-delete]');
    const asked = F.__page().log.find(c => c[0] === 'confirm')[1];
    assert.equal(asked.message, '"Meeting booked?" is removed from the workflow.');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'del'), ['del', '/api/journey/nodes/7']);
    assert.equal(F.__state().journeyFlows[0].nodes.length, 4);
    fill({ manage: true });
    F.__opt('confirm', false);
    F.openJourneyBox(7);
    await press('click [data-jr-delete]');
    assert.ok(!F.__page().log.some(c => c[0] === 'del'), '"no" deletes nothing');
  });
  test('a refusal of the server is said in the window, which stays', async () => {
    for (const [code, said] of [['branch', 'This question could not be saved. Choose a question and what it needs.'], ['stage', 'Choose a stage of this workspace.'], ['after', dict.en.jr_err_after]]) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { error: 'x', code } } });
      F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
      F.__fill({ n: '0', unit: 'min', name: '', test: 'assigned', urgency: '', field: '', cfield: '', op: 'any', value: '' });
      await press('click [data-jr-save]');
      assert.equal(F.__page().fields.err.textContent, said);
      assert.ok(!F.__page().log.some(c => c[0] === 'close'));
    }
  });
  test('the activity says which way a deal went', () => {
    const details = new Function(`${sliceConst('public/js/journey.js', 'JOURNEY_DETAILS')} return JOURNEY_DETAILS;`)();
    assert.deepEqual([details.yes, details.no], ['jr_d_yes', 'jr_d_no']);
    assert.deepEqual([dict.en.jr_d_yes, dict.en.jr_d_no, dict.de.jr_d_yes, dict.de.jr_d_no], ['answer: yes', 'answer: no', 'Antwort: ja', 'Antwort: nein']);
    assert.match(read('utils/journey-run.js'), /return \{ status: 'done', detail: yes \? 'yes' : 'no', to: \(yes \? x\.next_id : x\.else_id\) \|\| null \};/);
  });
});

// Part 20: the same question about a field of the deal's contact, and how a field is compared.
describe('a contact field, and the comparisons of both field questions (Part 20)', () => {
  const IFC = { ...IF, config: { test: 'contact_field', field_key: 'kundenstatus', op: 'is_not', value: 'Approved <b>' } };
  const withBox = node => ({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? node : n)) }], answers: { 'put /api/journey/nodes/7': { flow: FLOW }, 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
  const EMPTY = { n: '0', unit: 'min', name: '', test: '', urgency: '', field: '', cfield: '', op: 'any', value: '', ...REST };
  test('what the box says for each comparison; a contact\'s field says whose it is', () => {
    fill();
    const deal = (op, value) => F.journeyBranchText({ test: 'field', field_key: 'budget', op, value });
    assert.deepEqual([deal('any'), deal('empty'), deal('is', '5'), deal('is_not', 'x'), deal('contains', 'x'), deal('not_contains', 'x'), deal('starts', 'x')],
      ['"Budget" filled in?', '"Budget" empty?', '"Budget" is "5"?', '"Budget" is not "x"?', '"Budget" contains "x"?', '"Budget" does not contain "x"?', '"Budget" starts with "x"?']);
    assert.deepEqual([deal('gt', '250000'), deal('gte', '300.000'), deal('lt', '31.12.2027'), deal('lte', '2,5')], ['"Budget" > 250000?', '"Budget" ≥ 300.000?', '"Budget" < 31.12.2027?', '"Budget" ≤ 2,5?']);
    const contact = more => F.journeyBranchText({ test: 'contact_field', field_key: 'kundenstatus', ...more });
    assert.equal(contact({}), 'Contact: "Customer status" filled in?');
    assert.equal(contact({ value: 'Approved' }), 'Contact: "Customer status" is "Approved"?', 'no comparison saved, a value: "is"');
    assert.equal(contact({ op: 'not_contains', value: 'no' }), 'Contact: "Customer status" does not contain "no"?');
    assert.equal(F.journeyBranchText({ test: 'contact_field', field_key: 'einkommen', op: 'gte', value: '4000' }), 'Contact: "Income" ≥ 4000?');
    assert.equal(F.journeyBranchText({ test: 'contact_field', field_key: 'budget' }), 'Contact: "a field that no longer exists" filled in?', 'a deal field of the same key is not a contact field');
    assert.equal(F.journeyBranchText({ test: 'field', field_key: 'kundenstatus' }), '"a field that no longer exists" filled in?');
    for (const op of ['weather', 'constructor', '', 5]) for (const test of ['field', 'contact_field']) assert.equal(F.journeyBranchText({ test, field_key: 'budget', op, value: 'x' }), 'A question this version does not know', String(op));
    fill({ lang: 'de' });
    assert.equal(contact({ op: 'is_not', value: 'Abgelehnt' }), 'Kontakt: „Customer status“ ist nicht „Abgelehnt“?');
    assert.equal(F.journeyBranchText({ test: 'field', field_key: 'budget', op: 'empty' }), '„Budget“ leer?');
  });
  test('the comparison of a box: its own word, what a box saved before means, nothing for one nobody knows', () => {
    assert.deepEqual([F.journeyBranchOp({}), F.journeyBranchOp({ value: 'x' }), F.journeyBranchOp({ op: null, value: 'x' }), F.journeyBranchOp({ op: 'gt', value: '5' }), F.journeyBranchOp({ op: 'empty' }), F.journeyBranchOp(null)], ['any', 'is', 'is', 'gt', 'empty', 'any']);
    for (const op of ['weather', 'constructor', '', 5, ['is']]) assert.equal(F.journeyBranchOp({ op, value: 'x' }), null, String(op));
  });
  test('on the board a typed value stays text', () => {
    fill({ manage: true });
    const out = F.journeyBoxHtml(IFC);
    assert.doesNotMatch(out, /Approved <b>/);
    assert.match(out, /<span class="jr-title">Contact: &quot;Customer status&quot; is not &quot;Approved &lt;b&gt;&quot;\?<\/span>/);
  });
  test('the window: the contact fields in a list of their own, the eleven comparisons, "has any value" chosen', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    const [m] = modals();
    assert.match(m.body, /<option value="field">Does a deal field hold a certain value\?<\/option>/); assert.match(m.body, /<option value="contact_field">Does a contact field hold a certain value\?<\/option>/);
    assert.match(m.body, /<label class="label" for="jr-abc1234-cfield">Which contact field<\/label>\s*<select class="select" id="jr-abc1234-cfield"><option value="" selected>— choose —<\/option><optgroup label="Contact details"><option value="base name">Name<\/option><option value="base email">Email<\/option><option value="base phone">Phone<\/option><option value="base company">Company<\/option><\/optgroup><optgroup label="Own fields"><option value="kundenstatus">Customer status<\/option><option value="einkommen">Income<\/option><\/optgroup><\/select>/);
    assert.match(m.body, /a deal without a contact gets the answer no\.<\/p>/);
    const list = m.body.slice(m.body.indexOf('id="jr-abc1234-op"'), m.body.indexOf('</select>', m.body.indexOf('id="jr-abc1234-op"')));
    assert.deepEqual([...list.matchAll(/<option value="([a-z_]+)"( selected)?>([^<]+)</g)].map(x => [x[1], !!x[2], x[3]]), [['any', true, 'has any value'], ['empty', false, 'is empty'], ['is', false, 'is exactly'], ['is_not', false, 'is not'],
      ['contains', false, 'contains'], ['not_contains', false, 'does not contain'], ['starts', false, 'starts with'], ['gt', false, 'is greater than, or later than'], ['gte', false, 'is at least, or not earlier than'],
      ['lt', false, 'is less than, or earlier than'], ['lte', false, 'is at most, or not later than']]);
    assert.match(m.body, /<label class="label" for="jr-abc1234-op">Comparison<\/label>/); assert.match(m.body, /<label class="label" for="jr-abc1234-value">Value<\/label>/);
    assert.doesNotMatch(m.body, /id="jr-abc1234-field">[^]*?Customer status[^]*?id="jr-abc1234-cfield"/, 'the deal field list holds no contact field');
  });
  test('saving a question about a contact field sends the field, the comparison and its value', async () => {
    const cases = [
      [{ cfield: 'kundenstatus', op: 'any', value: 'left over' }, { test: 'contact_field', field_key: 'kundenstatus' }],
      [{ cfield: 'kundenstatus', op: 'empty', value: 'left over' }, { test: 'contact_field', field_key: 'kundenstatus', op: 'empty' }],
      [{ cfield: 'kundenstatus', op: 'is', value: ' Approved ' }, { test: 'contact_field', field_key: 'kundenstatus', value: 'Approved' }],
      [{ cfield: 'kundenstatus', op: 'is_not', value: 'Approved' }, { test: 'contact_field', field_key: 'kundenstatus', op: 'is_not', value: 'Approved' }],
      [{ cfield: 'kundenstatus', op: 'contains', value: 'appr' }, { test: 'contact_field', field_key: 'kundenstatus', op: 'contains', value: 'appr' }],
      [{ cfield: 'einkommen', op: 'gte', value: '4.000' }, { test: 'contact_field', field_key: 'einkommen', op: 'gte', value: '4.000' }],
      [{ cfield: 'einkommen', field: 'budget', op: 'lt', value: '31.12.2027' }, { test: 'contact_field', field_key: 'einkommen', op: 'lt', value: '31.12.2027' }],
    ];
    for (const [values, config] of cases) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
      F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
      F.__fill({ ...EMPTY, test: 'contact_field', ...values });
      await press('click [data-jr-save]');
      assert.deepEqual(F.__page().log.find(c => c[0] === 'post')[2].config, config, JSON.stringify(values));
    }
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    F.__fill({ ...EMPTY, test: 'field', field: 'budget', cfield: 'einkommen', op: 'gt', value: '250000' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post')[2].config, { test: 'field', field_key: 'budget', op: 'gt', value: '250000' }, 'a deal field is compared alike, with the field of its own list');
  });
  test('what the window builds is what the server keeps, for every comparison of both questions', () => {
    for (const test of server.FIELD_TESTS) for (const op of server.OPS) {
      const built = F.journeyBranchConfig({ test, stages: [], urgency: '', field: 'budget', cfield: 'einkommen', op, value: '250000' });
      assert.deepEqual(server.checkBranch(built.config), { config: built.config }, `${test} ${op}`);
      assert.equal(F.journeyBranchOp(built.config), op, 'and it opens again with the comparison it was saved with');
    }
  });
  test('a value has a size where the server finds a number or a day in it', () => {
    const samples = ['250000', '2,5', '2.5', '-3', '007', '300.000', '1.234.567', '300.000,50', '1,234.56', ' 300.000 € ', '€ 5', '12 %', '250 000', '1500 EUR', '$20', '2027-03-31', '31.03.2027', '1.2.2027', '29.02.2028',
      '2027-03-31T10:00:00Z', '', '  ', 'abc', '12abc', '1.5.', '12.34.567', '1,2,3', '.5', '5.', '--5', 'Infinity', '1e5', 'morgen', '2027-02-30', '31.13.2027', '29.02.2027', '2027-3-1', '31.03.27', '2027-03-31x', '0000-01-01'];
    for (const v of samples) assert.equal(F.journeyBranchSized(v), server.numOf(v) !== null || server.dayOf(v) !== null, JSON.stringify(v));
    assert.equal(samples.filter(v => F.journeyBranchSized(v)).length, 20);
    for (const v of [null, undefined]) assert.equal(F.journeyBranchSized(v), false);
  });
  test('an existing one opens with its field, its comparison and its value; untouched it asks nothing, and saving keeps it', async () => {
    fill(withBox(IFC));
    F.openJourneyBox(7);
    const [m] = modals();
    assert.match(m.body, /<option value="contact_field" selected>/);
    assert.match(m.body, /id="jr-abc1234-cfield"><option value="">— choose —<\/option><optgroup label="Contact details">[^]*?<\/optgroup><optgroup label="Own fields"><option value="kundenstatus" selected>Customer status<\/option>/);
    assert.match(m.body, /id="jr-abc1234-field"><option value="" selected>— choose —<\/option>/, 'the deal field list stays unchosen');
    assert.match(m.body, /<option value="is_not" selected>is not<\/option>/);
    assert.match(m.body, /id="jr-abc1234-value" maxlength="200" autocomplete="off" list="jr-abc1234-values" value="Approved &lt;b&gt;">/);
    const same = { ...EMPTY, n: '2', unit: 'days', test: 'contact_field', cfield: 'kundenstatus', op: 'is_not', value: 'Approved <b>' };
    F.__fill(same);
    assert.equal(m.beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2].config, IFC.config);
    F.__fill({ ...same, op: 'contains' }); F.__opt('unsaved', false);
    assert.equal(m.beforeClose(), false, 'another comparison is a change');
  });
  test('a box saved before opens with "is exactly" when it has a value and "has any value" when it has none', () => {
    for (const [config, op] of [[{ test: 'field', field_key: 'budget', value: 'x' }, 'is'], [{ test: 'field', field_key: 'budget' }, 'any'], [{ test: 'contact_field', field_key: 'einkommen', op: 'weather', value: '1' }, 'any']]) {
      fill(withBox({ ...IF, config }));
      F.openJourneyBox(7);
      const body = modals()[0].body, list = body.slice(body.indexOf('id="jr-abc1234-op"'));
      assert.equal(/<option value="([a-z_]+)" selected>/.exec(list)[1], op, JSON.stringify(config));
    }
  });
  test('a key that both a deal field and a contact field have: each question opens with its own list chosen, the other unchosen', () => {
    const both = [...CFIELDS, { field_key: 'budget', name: 'Contact budget', type: 'text', options: [] }];
    fill({ ...withBox({ ...IF, config: { test: 'contact_field', field_key: 'budget' } }), cfields: both });
    assert.equal(F.journeyBranchText({ test: 'contact_field', field_key: 'budget' }), 'Contact: "Contact budget" filled in?');
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /id="jr-abc1234-field"><option value="" selected>— choose —<\/option><option value="budget">Budget<\/option>/, 'a contact question leaves the deal list unchosen');
    assert.match(modals()[0].body, /id="jr-abc1234-cfield"><option value="">— choose —<\/option>[^]*?<option value="budget" selected>Contact budget<\/option>/);
    fill({ ...withBox({ ...IF, config: { test: 'field', field_key: 'budget' } }), cfields: both });
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /id="jr-abc1234-field"><option value="">— choose —<\/option><option value="budget" selected>Budget<\/option>/);
    assert.match(modals()[0].body, /id="jr-abc1234-cfield"><option value="" selected>— choose —<\/option>/, 'a deal question leaves the contact list unchosen');
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'field', field: 'budget' });   // what such a form holds: nothing chosen among the contact fields
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'untouched, it asks nothing');
  });
  test('a contact field that is gone since is not what the window opens with', () => {
    fill(withBox({ ...IF, config: { test: 'contact_field', field_key: 'gone', op: 'contains', value: 'x' } }));
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /id="jr-abc1234-cfield"><option value="" selected>— choose —<\/option>/);
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'contact_field', op: 'contains', value: 'x' });
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
  });
  test('a dropdown field offers its options as suggestions for the value — as text, and only its own', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    const offered = () => F.__page().fields.values.innerHTML;
    assert.equal(offered(), '', 'no question yet');
    F.__fill({ ...EMPTY, test: 'contact_field', cfield: 'kundenstatus', op: 'is' });
    press('change select');
    assert.equal(offered(), '<option value="Interested"></option><option value="Approved &lt;b&gt;"></option>');
    F.__fill({ cfield: 'einkommen' }); press('change select');
    assert.equal(offered(), '', 'a field without options offers none');
    F.__fill({ cfield: 'kundenstatus', test: 'field', field: 'budget' }); press('change select');
    assert.equal(offered(), '', 'the deal field question looks at the deal field list');
    F.__fill({ test: 'meeting' }); press('change select');
    assert.equal(offered(), '');
    // a deal field with options: offered for the deal question — whatever the contact list holds — and gone with another question
    fill({ manage: true, fields: [...FIELDS, { field_key: 'art', name: 'Kind', type: 'dropdown', options: ['Buy', 'Rent'] }] });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    F.__fill({ ...EMPTY, test: 'field', field: 'art', cfield: 'einkommen', op: 'is' }); press('change select');
    assert.equal(offered(), '<option value="Buy"></option><option value="Rent"></option>');
    F.__fill({ cfield: 'kundenstatus' }); press('change select');
    assert.equal(offered(), '<option value="Buy"></option><option value="Rent"></option>', 'the contact list is not this question\'s');
    F.__fill({ test: 'contact_field' }); press('change select');
    assert.equal(offered(), '<option value="Interested"></option><option value="Approved &lt;b&gt;"></option>');
    F.__fill({ test: 'meeting' }); press('change select');
    assert.equal(offered(), '', 'a question about no field offers nothing');
  });
  test('the words: every comparison in both languages, and the hint says how sizes are written', () => {
    const keys = constOf('JOURNEY_OP_KEYS'), lines = constOf('JOURNEY_OP_LINES');
    assert.deepEqual(server.OPS.map(k => dict.de[keys[k]]), ['hat irgendeinen Wert', 'ist leer', 'ist genau', 'ist nicht', 'enthält', 'enthält nicht', 'beginnt mit', 'ist größer als oder später als',
      'ist mindestens oder nicht früher als', 'ist kleiner als oder früher als', 'ist höchstens oder nicht später als']);
    for (const k of server.OPS) for (const lang of ['en', 'de']) {
      assert.match(dict[lang][lines[k]], /\{name\}/, `${lang} ${k}`);
      assert.equal(/\{value\}/.test(dict[lang][lines[k]]), !server.OPS_BARE.includes(k), `${lang} ${k}: a value is said where there is one`);
    }
    for (const lang of ['en', 'de']) {
      assert.equal(new Set(server.OPS.map(k => dict[lang][lines[k]])).size, server.OPS.length, `${lang}: no two comparisons read alike on the box`);
      assert.equal(new Set(server.OPS.map(k => dict[lang][keys[k]])).size, server.OPS.length, `${lang}: nor in the list`);
      assert.deepEqual(server.OPS_SIZE.map(k => /[<>≤≥]/.exec(dict[lang][lines[k]])[0]), ['>', '≥', '<', '≤'], `${lang}: each size comparison with its own sign`);
      assert.notEqual(dict[lang].jb_q_field, dict[lang].jb_q_contact_field, `${lang}: the two questions read apart`);
    }
    assert.deepEqual([dict.de.jb_q_field, dict.de.jb_q_contact_field], ['Hat ein Deal-Feld einen bestimmten Wert?', 'Hat ein Kontaktfeld einen bestimmten Wert?']);
    assert.equal(dict.en.jb_f_value_hint, 'Capital letters do not matter. Greater and less compare numbers (250000 or 300.000) and dates (31.12.2027).');
    assert.deepEqual([dict.en.jb_l_contact, dict.de.jb_l_contact], ['Contact: {text}', 'Kontakt: {text}']);
    assert.match(dict.de.jb_cfield_hint, /ein Deal ohne Kontakt erhält die Antwort Nein\.$/);
  });
});

// Part 21: what every contact has — name, email, phone, company — in the same list as the workspace's own fields.
describe('a contact\'s name, email, phone and company (Part 21)', () => {
  const EMPTY = { n: '0', unit: 'min', name: '', test: 'contact_field', urgency: '', field: '', cfield: '', op: 'any', value: '', ...REST };
  const withBox = config => ({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? { ...IF, config } : n)) }], answers: { 'put /api/journey/nodes/7': { flow: FLOW }, 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
  test('the list: the four first, under their own heading, then the workspace\'s own fields — or the four alone', () => {
    fill();
    assert.equal(F.journeyContactFieldOptions(''), '<option value="" selected>— choose —</option><optgroup label="Contact details"><option value="base name">Name</option><option value="base email">Email</option>' +
      '<option value="base phone">Phone</option><option value="base company">Company</option></optgroup><optgroup label="Own fields"><option value="kundenstatus">Customer status</option><option value="einkommen">Income</option></optgroup>');
    assert.match(F.journeyContactFieldOptions('base phone'), /<option value="">— choose —<\/option>[^]*<option value="base phone" selected>Phone<\/option>/);
    assert.equal((F.journeyContactFieldOptions('base phone').match(/ selected/g) || []).length, 1);
    fill({ cfields: [] });
    assert.doesNotMatch(F.journeyContactFieldOptions(''), /Own fields/, 'a workspace without fields of its own has no empty heading');
    assert.match(F.journeyContactFieldOptions(''), /<option value="base company">Company<\/option><\/optgroup>$/);
    fill({ lang: 'de', cfields: [{ field_key: 'x', name: '<b>Feld</b>', type: 'text' }] });
    assert.match(F.journeyContactFieldOptions(''), /<optgroup label="Kontaktdaten"><option value="base name">Name<\/option><option value="base email">E-Mail<\/option><option value="base phone">Telefon<\/option><option value="base company">Firma<\/option><\/optgroup><optgroup label="Eigene Felder"><option value="x">&lt;b&gt;Feld&lt;\/b&gt;<\/option>/);
  });
  test('which of the four a value of the list stands for', () => {
    assert.deepEqual(['base name', 'base email', 'base phone', 'base company'].map(v => F.journeyBranchBase(v)), server.CONTACT_BASE);
    // an own field may well have the key "base_email": only the space, which no key can hold, marks one of the four
    for (const v of ['base_email', 'base-name', 'baseXcompany', 'basephone']) assert.equal(F.journeyBranchBase(v), '', v);
    assert.deepEqual(F.journeyBranchConfig({ test: 'contact_field', stages: [], urgency: '', field: '', cfield: 'base_email', op: 'any', value: '' }).config, { test: 'contact_field', field_key: 'base_email' });
    for (const v of ['', 'email', 'base', 'base ', 'base city', 'base constructor', 'base  email', 'Base email', ' base email', 'kundenstatus', null, undefined]) assert.equal(F.journeyBranchBase(v), '', String(v));
  });
  test('what the box says: the name of what is asked about, in the language of the page', () => {
    fill();
    assert.equal(F.journeyBranchText({ test: 'contact_field', base: 'company', op: 'contains', value: 'GmbH' }), 'Contact: "Company" contains "GmbH"?');
    assert.equal(F.journeyBranchText({ test: 'contact_field', base: 'email' }), 'Contact: "Email" filled in?');
    assert.equal(F.journeyBranchText({ test: 'contact_field', base: 'phone', op: 'starts', value: '+49' }), 'Contact: "Phone" starts with "+49"?');
    assert.equal(F.journeyBranchText({ test: 'contact_field', base: 'name', value: 'Erika' }), 'Contact: "Name" is "Erika"?');
    for (const base of ['city', 'constructor', '', 5]) assert.equal(F.journeyBranchText({ test: 'contact_field', base, field_key: 'kundenstatus' }), 'A question this version does not know', String(base));
    assert.equal(F.journeyBranchText({ test: 'field', base: 'company', field_key: 'budget' }), '"Budget" filled in?', 'a deal field question has no such word');
    fill({ lang: 'de' });
    assert.equal(F.journeyBranchText({ test: 'contact_field', base: 'company', op: 'empty' }), 'Kontakt: „Firma“ leer?');
  });
  test('saving sends the word for it, never as a field\'s key — and the server keeps what the window builds', async () => {
    for (const base of server.CONTACT_BASE) for (const op of server.OPS) {
      const built = F.journeyBranchConfig({ ...EMPTY, stages: [], cfield: 'base ' + base, field: 'budget', op, value: '250000' });
      assert.equal(built.config.base, base); assert.ok(!('field_key' in built.config), `${base} ${op}`);
      assert.deepEqual(server.checkBranch(built.config), { config: built.config }, `${base} ${op}`);
    }
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    F.__fill({ ...EMPTY, cfield: 'base company', op: 'contains', value: ' GmbH ' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post')[2].config, { test: 'contact_field', base: 'company', op: 'contains', value: 'GmbH' });
    assert.deepEqual(F.journeyBranchConfig({ ...EMPTY, stages: [], cfield: 'base city' }).config, { test: 'contact_field', field_key: 'base city' }, 'a word that is none of the four is sent as it is — and the server refuses a key with a space');
    assert.deepEqual(server.checkBranch({ test: 'contact_field', field_key: 'base city' }), { code: 'field' });
    assert.deepEqual(F.journeyBranchConfig({ ...EMPTY, stages: [], test: 'field', field: 'base company' }).config, { test: 'field', field_key: 'base company' }, 'only the contact question knows the four');
  });
  test('an existing one opens with it chosen; untouched it asks nothing, and saving keeps it', async () => {
    const config = { test: 'contact_field', base: 'email', op: 'not_contains', value: 'gmail' };
    fill(withBox(config));
    F.openJourneyBox(7);
    const [m] = modals();
    assert.match(m.body, /<option value="base email" selected>Email<\/option>/);
    assert.equal((m.body.slice(m.body.indexOf('id="jr-abc1234-cfield"'), m.body.indexOf('id="jr-abc1234-w-op"')).match(/ selected/g) || []).length, 1);
    assert.match(m.body, /<option value="not_contains" selected>does not contain<\/option>/);
    const same = { ...EMPTY, n: '2', unit: 'days', cfield: 'base email', op: 'not_contains', value: 'gmail' };
    F.__fill(same);
    assert.equal(m.beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2].config, config);
  });
  test('a workspace\'s own field with the key "email" is another thing: each opens as itself', () => {
    const own = [...CFIELDS, { field_key: 'email', name: 'Second email', type: 'text', options: [] }];
    fill({ ...withBox({ test: 'contact_field', field_key: 'email' }), cfields: own });
    assert.equal(F.journeyBranchText({ test: 'contact_field', field_key: 'email' }), 'Contact: "Second email" filled in?');
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /<option value="base email">Email<\/option>[^]*<option value="email" selected>Second email<\/option>/);
    fill({ ...withBox({ test: 'contact_field', base: 'email' }), cfields: own });
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /<option value="base email" selected>Email<\/option>[^]*<option value="email">Second email<\/option>/);
    fill({ ...withBox({ test: 'contact_field', base: 'city', field_key: 'email' }), cfields: own });
    F.openJourneyBox(7);
    assert.match(modals()[0].body, /id="jr-abc1234-cfield"><option value="" selected>— choose —<\/option>/, 'a word a newer server knows: nothing is chosen, least of all the field of that key');
  });
  test('the four offer no suggestions, and the value box shows for a comparison that has a value', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    F.__fill({ ...EMPTY, cfield: 'kundenstatus', op: 'is' }); press('change select');
    assert.notEqual(F.__page().fields.values.innerHTML, '');
    F.__fill({ cfield: 'base company' }); press('change select');
    assert.equal(F.__page().fields.values.innerHTML, '');
    assert.deepEqual(['w-cfield', 'w-op', 'w-value'].map(part => F.__page().fields[part].hidden), [false, false, false]);
  });
  test('the words', () => {
    const keys = constOf('JOURNEY_BASE_KEYS');
    assert.deepEqual(server.CONTACT_BASE.map(k => [dict.en[keys[k]], dict.de[keys[k]]]), [['Name', 'Name'], ['Email', 'E-Mail'], ['Phone', 'Telefon'], ['Company', 'Firma']]);
    assert.deepEqual([dict.en.jb_g_base, dict.en.jb_g_own, dict.de.jb_g_base, dict.de.jb_g_own], ['Contact details', 'Own fields', 'Kontaktdaten', 'Eigene Felder']);
    assert.match(dict.en.jb_cfield_hint, /^Name, email, phone and company, or a field added in Settings\./);
    assert.match(dict.de.jb_cfield_hint, /^Name, E-Mail, Telefon und Firma oder ein Feld aus den Einstellungen\./);
  });
});

// Part 22: who the deal or its contact is assigned to, and when it was created.
describe('who it is assigned to, and when it was created (Part 22)', () => {
  const EMPTY = { n: '0', unit: 'min', name: '', test: '', urgency: '', field: '', cfield: '', op: 'any', value: '', ...REST };
  const NOW = { test: '', stages: [], urgency: '', field: '', cfield: '', op: 'any', value: '', who: 'is', people: [], age: 'older', span: '', spanunit: 'days', day: '' };
  const withBox = config => ({ manage: true, flows: [{ ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 7 ? { ...IF, config } : n)) }], answers: { 'put /api/journey/nodes/7': { flow: FLOW }, 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
  const says = config => F.journeyBranchText(config);
  test('what the box says: whose it is, the people by name, a time as a length, a day as a date', () => {
    fill();
    assert.equal(says({ test: 'deal_owner', op: 'is', user_ids: [4, 5] }), 'Deal assigned to Ben, Cem?');
    assert.equal(says({ test: 'deal_owner', op: 'is_not', user_ids: [3] }), 'Deal not assigned to Anna <A>?');
    assert.equal(says({ test: 'deal_owner', op: 'nobody' }), 'Deal assigned to nobody?');
    assert.equal(says({ test: 'contact_owner', op: 'is', user_ids: ['4'] }), 'Contact assigned to Ben?', 'ids as the server hands them over');
    assert.equal(says({ test: 'contact_owner', op: 'nobody', user_ids: [4] }), 'Contact assigned to nobody?');
    assert.equal(says({ test: 'contact_owner', op: 'is', user_ids: [4, 99] }), 'Contact assigned to Ben, someone who is no longer here?');
    assert.equal(says({ test: 'deal_age', op: 'older', minutes: 43200 }), 'Deal older than 30 days?');
    assert.equal(says({ test: 'deal_age', op: 'newer', minutes: 120 }), 'Deal newer than 2 hours?');
    assert.equal(says({ test: 'contact_age', op: 'older', minutes: 1440 }), 'Contact older than 1 day?');
    assert.equal(says({ test: 'contact_age', op: 'newer', minutes: 45 }), 'Contact newer than 45 min?');
    assert.equal(says({ test: 'deal_age', op: 'before', date: '2026-12-31', tz: 'Europe/Berlin' }), 'Deal created before 31 Dec 2026?');
    assert.equal(says({ test: 'contact_age', op: 'after', date: '2027-01-01', tz: 'UTC' }), 'Contact created on 1 Jan 2027 or later?');
    const zone = process.env.TZ;   // west of Greenwich the day's midnight in UTC is still the evening before: the date shown must not move
    try {
      for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) { process.env.TZ = tz; assert.equal(says({ test: 'deal_age', op: 'before', date: '2026-12-31' }), 'Deal created before 31 Dec 2026?', tz); }
    } finally { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; }
    assert.equal(says({ test: 'deal_age', op: 'before', date: 'soon' }), 'Deal created before soon?', 'what is no day is said as it is, not turned into a date');
    for (const test of ['deal_owner', 'contact_owner', 'deal_age', 'contact_age']) for (const op of [undefined, 'anybody', 'between', 'constructor', 'toString']) assert.equal(says({ test, op, user_ids: [3], minutes: 5 }), 'A question this version does not know', `${test} ${op}`);
    fill({ lang: 'de' });
    assert.deepEqual([says({ test: 'deal_owner', op: 'is', user_ids: [4] }), says({ test: 'contact_owner', op: 'is_not', user_ids: [4] }), says({ test: 'contact_owner', op: 'nobody' })],
      ['Deal zugewiesen an Ben?', 'Kontakt nicht zugewiesen an Ben?', 'Kontakt niemandem zugewiesen?']);
    assert.deepEqual([says({ test: 'deal_age', op: 'older', minutes: 43200 }), says({ test: 'contact_age', op: 'newer', minutes: 1440 }), says({ test: 'deal_age', op: 'before', date: '2026-12-31' }), says({ test: 'contact_age', op: 'after', date: '2026-12-31' })],
      ['Deal älter als 30 Tage?', 'Kontakt jünger als 1 Tag?', 'Deal vor dem 31. Dez. 2026 angelegt?', 'Kontakt am 31. Dez. 2026 oder später angelegt?']);
  });
  test('on the board a person\'s name stays text', () => {
    fill({ manage: true });
    const out = F.journeyBoxHtml({ ...IF, config: { test: 'deal_owner', op: 'is', user_ids: [3] } });
    assert.match(out, /<span class="jr-title">Deal assigned to Anna &lt;A&gt;\?<\/span>/);
  });
  test('a day as the form holds it, and a length of time in minutes', () => {
    assert.deepEqual(['2026-12-31', ' 2028-02-29 ', '2026-01-01'].map(v => F.journeyBranchDay(v)), ['2026-12-31', '2028-02-29', '2026-01-01']);
    for (const v of ['', '2026-02-30', '2027-02-29', '31.12.2026', '2026-12-31T00:00', '2026-1-1', '0000-01-01', '2026-13-01', 'soon', null, undefined, 20261231]) assert.equal(F.journeyBranchDay(v), '', String(v));
    for (const v of ['2026-12-31', '2028-02-29', '2026-02-30', '31.12.2026', '2026-1-1', '0000-01-01']) assert.equal(!!F.journeyBranchDay(v), !server.checkBranch({ test: 'deal_age', op: 'before', date: v }).code, `the server agrees: ${v}`);
    assert.deepEqual([F.journeyBranchSpan('30', 'days'), F.journeyBranchSpan(' 2 ', 'hours'), F.journeyBranchSpan('45', 'min'), F.journeyBranchSpan('3650', 'days'), F.journeyBranchSpan(1, 'min')], [43200, 120, 45, server.MAX_AGE, 1]);
    for (const [n, unit] of [['0', 'days'], ['', 'days'], ['-1', 'days'], ['1.5', 'days'], ['3651', 'days'], ['x', 'days'], ['5', 'weeks'], ['5', 'constructor'], ['5', undefined], ['12345678', 'min'], [null, 'days']]) assert.equal(F.journeyBranchSpan(n, unit), null, `${n} ${unit}`);
  });
  test('the window: how it is asked, the people of the workspace to tick, a length of time or a day', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    const [m] = modals();
    for (const [k, said] of [['deal_owner', 'Who is the deal assigned to\\?'], ['contact_owner', 'Who is the contact assigned to\\?'], ['deal_age', 'When was the deal created\\?'], ['contact_age', 'When was the contact created\\?']]) assert.match(m.body, new RegExp(`<option value="${k}">${said}</option>`));
    assert.match(m.body, /<label class="label" for="jr-abc1234-who">Assigned to<\/label>\s*<select class="select" id="jr-abc1234-who"><option value="is" selected>one of these people<\/option><option value="is_not">none of these people<\/option><option value="nobody">nobody<\/option><\/select>/);
    assert.match(m.body, /<span class="label">Which people<\/span>\s*<div class="jr-checks" id="jr-abc1234-people" tabindex="-1"><label class="jr-check"><input type="checkbox" data-jb-user value="3"><span>Anna &lt;A&gt;<\/span><\/label><label class="jr-check"><input type="checkbox" data-jb-user value="4"><span>Ben<\/span><\/label><label class="jr-check"><input type="checkbox" data-jb-user value="5"><span>Cem<\/span><\/label><\/div>/);
    assert.match(m.body, /<label class="label" for="jr-abc1234-age">Created<\/label>\s*<select class="select" id="jr-abc1234-age"><option value="older" selected>longer ago than<\/option><option value="newer">within the last<\/option><option value="before">before a day<\/option><option value="after">on a day or later<\/option><\/select>/);
    assert.match(m.body, /<input class="input" id="jr-abc1234-span" type="number" min="1" step="1" inputmode="numeric" value="">\s*<select class="select" id="jr-abc1234-spanunit" aria-label="Unit"><option value="min">minutes<\/option><option value="hours">hours<\/option><option value="days" selected>days<\/option><\/select>/);
    assert.match(m.body, /<input class="input" id="jr-abc1234-day" type="date" value="">/);
    fill({ manage: true, people: [] });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    assert.match(modals()[0].body, /id="jr-abc1234-people" tabindex="-1"><span class="help">This workspace has no people to choose from\.<\/span><\/div>/);
    fill({ manage: true, lang: 'de' });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    assert.match(modals()[0].body, /id="jr-abc1234-spanunit" aria-label="[^"]+"><option value="min">Minuten<\/option><option value="hours">Stunden<\/option><option value="days" selected>Tage<\/option>/, '"länger her als 30 Tage", not "Tagen"');
  });
  test('only what the chosen way of asking needs is shown', () => {
    fill({ manage: true });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    const shown = () => ['w-stages', 'w-field', 'w-cfield', 'w-op', 'w-value', 'w-who', 'w-people', 'w-age', 'w-span', 'w-day'].filter(part => F.__page().fields[part].hidden === false);
    for (const [values, parts] of [[{ test: 'deal_owner', who: 'is' }, ['w-who', 'w-people']], [{ test: 'contact_owner', who: 'is_not' }, ['w-who', 'w-people']], [{ test: 'contact_owner', who: 'nobody' }, ['w-who']],
      [{ test: 'deal_age', age: 'older' }, ['w-age', 'w-span']], [{ test: 'contact_age', age: 'newer' }, ['w-age', 'w-span']], [{ test: 'deal_age', age: 'before' }, ['w-age', 'w-day']], [{ test: 'contact_age', age: 'after' }, ['w-age', 'w-day']],
      [{ test: 'meeting', who: 'is', age: 'before' }, []], [{ test: 'field', op: 'any', who: 'is', age: 'older' }, ['w-field', 'w-op']], [{ test: 'stage' }, ['w-stages']]]) {
      F.__fill({ ...EMPTY, ...values });
      press('change select');
      assert.deepEqual(shown(), parts, JSON.stringify(values));
    }
  });
  test('saving sends the way of asking with what it needs, and nothing of the others', async () => {
    const cases = [
      [{ test: 'deal_owner', who: 'is', span: '30', day: '2026-12-31' }, [tick(3, false), tick(5, true), tick(4, true)], { test: 'deal_owner', op: 'is', user_ids: [4, 5] }],
      [{ test: 'contact_owner', who: 'is_not' }, [tick(3, true)], { test: 'contact_owner', op: 'is_not', user_ids: [3] }],
      [{ test: 'contact_owner', who: 'nobody' }, [tick(3, true)], { test: 'contact_owner', op: 'nobody' }],
      [{ test: 'deal_age', age: 'older', span: ' 30 ', spanunit: 'days', day: '2026-12-31' }, [tick(3, true)], { test: 'deal_age', op: 'older', minutes: 43200 }],
      [{ test: 'contact_age', age: 'newer', span: '2', spanunit: 'hours' }, [], { test: 'contact_age', op: 'newer', minutes: 120 }],
      [{ test: 'deal_age', age: 'before', day: '2026-12-31', span: '30' }, [], { test: 'deal_age', op: 'before', date: '2026-12-31' }],
      [{ test: 'contact_age', age: 'after', day: '2028-02-29' }, [], { test: 'contact_age', op: 'after', date: '2028-02-29' }],
    ];
    for (const [values, checks, config] of cases) {
      fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { flow: FLOW } } });
      F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
      F.__opt('checks', checks);
      F.__fill({ ...EMPTY, ...values });
      await press('click [data-jr-save]');
      assert.deepEqual(F.__page().log.find(c => c[0] === 'post')[2].config, config, JSON.stringify(values));
      assert.ok(!('tz' in F.__page().log.find(c => c[0] === 'post')[2].config), 'the clock is the server\'s to add');
    }
  });
  test('what is missing is said in the window and nothing is sent', async () => {
    const cases = [
      [{ test: 'deal_owner', who: '' }, [], 'Choose who it is assigned to.', 'who'],
      [{ test: 'deal_owner', who: 'is' }, [tick(3, false)], 'Tick at least one person.', 'people'],
      [{ test: 'contact_owner', who: 'is_not' }, Array.from({ length: 21 }, (_, i) => tick(100 + i, true)), 'At most 20 people.', 'people'],
      [{ test: 'deal_age', age: '' }, [], 'Choose how the creation date is compared.', 'age'],
      [{ test: 'deal_age', age: 'older', span: '' }, [], 'The time is a whole number from 1, up to 10 years.', 'span'],
      [{ test: 'contact_age', age: 'newer', span: '0' }, [], 'The time is a whole number from 1, up to 10 years.', 'span'],
      [{ test: 'deal_age', age: 'older', span: '3651', spanunit: 'days' }, [], 'The time is a whole number from 1, up to 10 years.', 'span'],
      [{ test: 'deal_age', age: 'before', day: '' }, [], 'Choose a day.', 'day'],
      [{ test: 'contact_age', age: 'after', day: '2026-02-30' }, [], 'Choose a day.', 'day'],
    ];
    for (const [values, checks, said, part] of cases) {
      fill({ manage: true });
      F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
      F.__opt('checks', checks);
      F.__fill({ ...EMPTY, ...values });
      await press('click [data-jr-save]');
      const { fields, log } = F.__page();
      assert.equal(fields.err.textContent, said); assert.equal(fields[part].focused, 1, said);
      assert.ok(!log.some(c => c[0] === 'post' || c[0] === 'close'), said);
    }
    fill({ manage: true, answers: { 'post /api/journey/flows/10/nodes': { error: 'x', code: 'user' } } });
    F.openJourneyBox(null, { kind: 'branch', afterId: 2 });
    F.__opt('checks', [tick(3, true)]);
    F.__fill({ ...EMPTY, test: 'deal_owner' });
    await press('click [data-jr-save]');
    assert.equal(F.__page().fields.err.textContent, 'Choose people of this workspace.', 'the server\'s refusal of a person who left meanwhile');
  });
  test('what the window builds is what the server keeps, for every way of asking', () => {
    for (const test of server.OWNER_TESTS) for (const op of server.OWNER_OPS) {
      const built = F.journeyBranchConfig({ ...NOW, test, who: op, people: [3, 4] });
      assert.deepEqual(server.checkBranch(built.config), { config: built.config }, `${test} ${op}`);
    }
    for (const test of server.AGE_TESTS) for (const op of server.AGE_OPS) {
      const built = F.journeyBranchConfig({ ...NOW, test, age: op, span: '30', spanunit: 'days', day: '2026-12-31' });
      const kept = ['before', 'after'].includes(op) ? { ...built.config, tz: 'Europe/Vienna' } : built.config;
      assert.deepEqual(server.checkBranch(built.config, { tz: 'Europe/Vienna' }), { config: kept }, `${test} ${op}`);
    }
    assert.deepEqual(F.journeyBranchConfig({ ...NOW, test: 'deal_owner', who: 'constructor', people: [3] }), { error: 'jb_err_who', part: 'who' });
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.deepEqual(F.journeyBranchConfig({ ...NOW, test: 'deal_owner', who: 'is', people: twenty }).config.user_ids, twenty, 'twenty people are the most, and allowed');
    assert.equal(server.checkBranch({ test: 'deal_owner', op: 'is', user_ids: twenty }).config.user_ids.length, 20);
    assert.equal(F.journeyBranchConfig({ ...NOW, test: 'deal_owner', who: 'is', people: [...twenty, 21] }).error, 'jb_err_people_many');
    assert.deepEqual(F.journeyBranchConfig({ ...NOW, test: 'deal_age', age: 'toString', span: '5' }), { error: 'jb_err_age', part: 'age' });
  });
  test('an existing one opens with what was saved; untouched it asks nothing, and saving keeps it', async () => {
    const owner = { test: 'contact_owner', op: 'is_not', user_ids: [5, 3] };
    fill(withBox(owner));
    F.openJourneyBox(7);
    let [m] = modals();
    assert.match(m.body, /<option value="contact_owner" selected>/); assert.match(m.body, /<option value="is_not" selected>none of these people<\/option>/);
    assert.deepEqual([...m.body.matchAll(/data-jb-user value="(\d+)" checked/g)].map(x => x[1]), ['3', '5']);
    F.__opt('checks', [tick(3, true), tick(4, false), tick(5, true)]);
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'contact_owner', who: 'is_not' });
    assert.equal(m.beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2].config, { test: 'contact_owner', op: 'is_not', user_ids: [3, 5] });
    fill(withBox({ test: 'deal_age', op: 'newer', minutes: 120 }));
    F.openJourneyBox(7);
    [m] = modals();
    assert.match(m.body, /<option value="newer" selected>within the last<\/option>/); assert.match(m.body, /id="jr-abc1234-span" type="number" min="1" step="1" inputmode="numeric" value="2">/); assert.match(m.body, /<option value="hours" selected>hours<\/option><option value="days">days<\/option><\/select><\/div>\s*<p class="help">Counted back/);
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'deal_age', age: 'newer', span: '2', spanunit: 'hours' });
    assert.equal(m.beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    fill(withBox({ test: 'contact_age', op: 'before', date: '2026-12-31', tz: 'Europe/Berlin' }));
    F.openJourneyBox(7);
    [m] = modals();
    assert.match(m.body, /<option value="before" selected>before a day<\/option>/); assert.match(m.body, /id="jr-abc1234-day" type="date" value="2026-12-31">/);
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'contact_age', age: 'before', day: '2026-12-31' });
    assert.equal(m.beforeClose(), true);
    F.__fill({ day: '2027-01-01' }); F.__opt('unsaved', false);
    assert.equal(m.beforeClose(), false, 'another day is a change');
  });
  test('a person who left since is not ticked, and an untouched window asks nothing; ticks under another question are not this one\'s', () => {
    fill(withBox({ test: 'deal_owner', op: 'is', user_ids: [4, 99] }));
    F.openJourneyBox(7);
    assert.deepEqual([...modals()[0].body.matchAll(/data-jb-user value="(\d+)" checked/g)].map(x => x[1]), ['4']);
    F.__opt('checks', [tick(3, false), tick(4, true), tick(5, false)]);
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'deal_owner' });
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    fill({ manage: true });
    F.openJourneyBox(7);   // the box asks "meeting"
    F.__opt('checks', [tick(3, true)]);
    F.__fill({ ...EMPTY, n: '2', unit: 'days', test: 'meeting' });
    assert.equal(modals()[0].beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'a tick that belongs to no question of the form is no change');
  });
  test('what the form cannot show is not what it opens with: an untouched window asks nothing', () => {
    const untouched = (config, held) => {
      fill(withBox(config));
      F.openJourneyBox(7);
      F.__opt('checks', (held.ticks || []).map(id => tick(id, true)));
      F.__fill({ ...EMPTY, n: '2', unit: 'days', test: config.test, ...held.form });
      assert.equal(modals()[0].beforeClose(), true, JSON.stringify(config));
      assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), JSON.stringify(config));
      return modals()[0].body;
    };
    // a way of asking a newer server knows: the lists show their first entry
    untouched({ test: 'deal_owner', op: 'anybody', user_ids: [4] }, { ticks: [4], form: { who: 'is' } });
    untouched({ test: 'contact_age', op: 'between', minutes: 120 }, { form: { age: 'older', span: '2', spanunit: 'hours' } });
    // a date that is no day: the date box is empty
    assert.match(untouched({ test: 'deal_age', op: 'before', date: 'soon' }, { form: { age: 'before', day: '' } }), /id="jr-abc1234-day" type="date" value="">/);
    // what belongs to another question — left in the box by hand — fills nothing here
    const body = untouched({ test: 'meeting', minutes: 120, user_ids: [4], date: '2026-12-31', op: 'is_not' }, { form: {} });
    assert.doesNotMatch(body, /data-jb-user value="\d+" checked/); assert.match(body, /id="jr-abc1234-span" type="number" min="1" step="1" inputmode="numeric" value="">/); assert.match(body, /id="jr-abc1234-day" type="date" value="">/);
    assert.match(body, /<option value="is" selected>one of these people<\/option>/); assert.match(body, /<option value="any" selected>has any value<\/option>/);
  });
  test('the people are read with the page, and a workspace change forgets them', async () => {
    fill({ people: [], answers: { '/api/workspace/members': PEOPLE } });
    await F.loadJourneyPeople();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'get'), [['get', '/api/workspace/members']]);
    assert.equal(says({ test: 'deal_owner', op: 'is', user_ids: [4] }), 'Deal assigned to Ben?');
    F.resetJourneyBranch();
    assert.equal(says({ test: 'deal_owner', op: 'is', user_ids: [4] }), 'Deal assigned to someone who is no longer here?');
    for (const answer of [{ error: 'x' }, null, undefined, 'nope']) {
      fill({ answers: { '/api/workspace/members': answer } });
      await F.loadJourneyPeople();
      assert.equal(says({ test: 'deal_owner', op: 'is', user_ids: [4] }), 'Deal assigned to someone who is no longer here?', `no list (${JSON.stringify(answer)}): nobody, and no crash`);
    }
    assert.match(sliceFn(js, 'loadJourney', 'journey.js'), /typeof loadJourneyPeople === 'function' \? loadJourneyPeople\(\) : null,/);
    assert.match(js, /if \(typeof resetJourneyBranch === 'function'\) resetJourneyBranch\(\);/);
  });
  test('the words: both languages, each way of asking apart from the others', () => {
    const groups = [constOf('JOURNEY_OWNER_OPS'), constOf('JOURNEY_OWNER_LINES'), constOf('JOURNEY_AGE_OPS'), constOf('JOURNEY_AGE_LINES'), constOf('JOURNEY_SPAN_UNITS')];
    for (const lang of ['en', 'de']) for (const g of groups) assert.equal(new Set(Object.values(g).map(k => dict[lang][k])).size, Object.keys(g).length, `${lang}: ${Object.keys(g)}`);
    for (const lang of ['en', 'de']) {
      for (const k of Object.values(constOf('JOURNEY_OWNER_LINES'))) { assert.match(dict[lang][k], /\{what\}/, k); assert.equal(/\{names\}/.test(dict[lang][k]), k !== 'jb_l_owner_nobody', k); }
      for (const [op, k] of Object.entries(constOf('JOURNEY_AGE_LINES'))) { assert.match(dict[lang][k], /\{what\}/, k); assert.match(dict[lang][k], ['older', 'newer'].includes(op) ? /\{time\}/ : /\{day\}/, k); }
      assert.notEqual(dict[lang].jb_q_deal_owner, dict[lang].jb_q_contact_owner); assert.notEqual(dict[lang].jb_q_deal_age, dict[lang].jb_q_contact_age);
    }
    assert.deepEqual([dict.de.jb_who_is, dict.de.jb_who_is_not, dict.de.jb_who_nobody, dict.de.jb_age_older, dict.de.jb_age_newer, dict.de.jb_age_before, dict.de.jb_age_after],
      ['eine dieser Personen', 'keine dieser Personen', 'niemanden', 'länger her als', 'innerhalb der letzten', 'vor einem Tag', 'an einem Tag oder später']);
    assert.deepEqual([dict.de.jb_w_deal, dict.de.jb_w_contact, dict.en.jb_w_deal, dict.en.jb_w_contact], ['Deal', 'Kontakt', 'Deal', 'Contact']);
    assert.deepEqual([dict.de.jb_f_who, dict.de.jb_f_people, dict.de.jb_f_age, dict.de.jb_f_span, dict.de.jb_f_day], ['Zugewiesen an', 'Welche Personen', 'Angelegt', 'Wie lange', 'Welcher Tag']);
    assert.deepEqual([dict.en.jb_span_hint, dict.en.jb_day_hint], ['Counted back from the moment the deal reaches this step.', 'The day counts on the clock of whoever saves this step.']);
    assert.deepEqual([dict.de.jb_span_hint, dict.de.jb_day_hint], ['Zurückgerechnet ab dem Moment, in dem der Deal diesen Schritt erreicht.', 'Der Tag zählt nach der Uhr der Person, die diesen Schritt speichert.']);
    assert.deepEqual([dict.en.jr_err_user, dict.de.jr_err_user], ['Choose people of this workspace.', 'Personen dieses Arbeitsbereichs wählen.']);
  });
});

// ── the drag ────────────────────────────────────────────────────────────────
// A stand-in board: boxes that count how often they are measured, and the lines between them.
function board(nodes, lines) {
  let measured = 0;
  const els = nodes.map(n => ({ dataset: { node: String(n.id) }, style: {}, classes: [], classList: { add(c) { el(n.id).classes.push(c); } },
    get offsetLeft() { measured++; return n.x; }, get offsetTop() { return n.y; }, get offsetWidth() { return 300; }, get offsetHeight() { return n.h ?? 80; } }));
  const el = id => els.find(e => e.dataset.node === String(id));
  const paths = lines.map(([from, to, part]) => ({ dataset: { from: String(from), to: String(to), part: String(part) }, d: null, drawn: 0, setAttribute(k, v) { this[k] = v; this.drawn++; } }));
  const fresh = { d: '', drawn: 0, setAttribute(k, v) { this[k] = v; this.drawn++; } };
  let asked = 0;
  const canvas = {
    querySelectorAll: sel => (sel === '[data-node]' ? els : paths.filter(p => sel.includes(`[data-from="${p.dataset.from}"]`) || sel.includes(`[data-to="${p.dataset.to}"]`))),
    querySelector: sel => (sel === '#jr-line-new' ? fresh : null),
    getBoundingClientRect: () => { asked++; return { left: 100, top: 50 }; },
  };
  return { canvas, el, paths, fresh, measured: () => measured, asked: () => asked };
}
const BOXES = [{ id: 1, x: 40, y: 40 }, { id: 2, x: 40, y: 190 }, { id: 7, x: 40, y: 340 }, { id: 8, x: 40, y: 490 }, { id: 9, x: 420, y: 490 }];
const LINES = [[1, 2, 0.5], [2, 7, 0.5], [7, 8, 0.25], [7, 9, 0.75]];
const pointer = (x, y, target, buttons = 1) => ({ button: 0, buttons, clientX: x, clientY: y, target, prevented: 0, preventDefault() { this.prevented++; } });   // buttons 1: the main button is held
const over = (b, { node, out } = {}) => ({ closest: sel => (sel === '#journey-board .jr-canvas' ? b.canvas : sel === '[data-out]' ? out || null : sel === '[data-node]' ? (node ? b.el(node) : null) : null) });

describe('dragging a box', () => {
  test('when the drag begins every box is measured once, and only the lines of the dragged box are picked up', () => {
    const b = board(BOXES, LINES), d = { kind: 'box', id: 7, canvas: b.canvas, el: b.el(7), moved: false };
    F.journeyDragBegin(d);
    assert.equal(b.measured(), 5);
    assert.deepEqual(d.rects[7], { x: 40, y: 340, w: 300, h: 80 });
    assert.deepEqual(d.lines.map(l => `${l.dataset.from}>${l.dataset.to}`), ['2>7', '7>8', '7>9'], 'not the line between two other boxes');
    assert.deepEqual(b.el(7).classes, ['is-dragging']); assert.equal(d.moved, true);
  });
  test('a frame moves the box as a transform and redraws its lines from what was measured: nothing is laid out again', () => {
    const b = board(BOXES, LINES), d = { kind: 'box', id: 7, canvas: b.canvas, el: b.el(7), frame: 3 };
    F.journeyDragBegin(d);
    d.dx = 200; d.dy = -30;
    F.journeyDragPaint(d);
    assert.deepEqual([d.nx, d.ny, d.frame], [240, 310, 0]);
    assert.deepEqual(b.el(7).style, { transform: 'translate3d(200px,-30px,0)' }, 'its left and top are not written');
    assert.equal(b.measured(), 5, 'no box is measured again');
    assert.deepEqual(b.paths.map(p => p.drawn), [0, 1, 1, 1], 'the line between two other boxes is left alone');
    assert.equal(b.paths[1].d, F.journeyLinePath({ x: 40, y: 190, w: 300, h: 80 }, { x: 240, y: 310, w: 300, h: 80 }, 0.5), 'the line that arrives follows the box\'s head');
    assert.equal(b.paths[2].d, F.journeyLinePath({ x: 240, y: 310, w: 300, h: 80 }, { x: 40, y: 490, w: 300, h: 80 }, 0.25), 'the "yes" line leaves a quarter in');
    assert.equal(b.paths[3].d, F.journeyLinePath({ x: 240, y: 310, w: 300, h: 80 }, { x: 420, y: 490, w: 300, h: 80 }, 0.75));
    for (let i = 0; i < 50; i++) { d.dx = i; d.dy = i; F.journeyDragPaint(d); }
    assert.equal(b.measured(), 5, 'fifty frames later still measured once');
  });
  test('a box does not leave the board at its top or left edge', () => {
    const b = board(BOXES, LINES), d = { kind: 'box', id: 1, canvas: b.canvas, el: b.el(1) };
    F.journeyDragBegin(d);
    d.dx = -500; d.dy = -500;
    F.journeyDragPaint(d);
    assert.deepEqual([d.nx, d.ny, b.el(1).style.transform], [0, 0, 'translate3d(-40px,-40px,0)']);
  });
  test('the page\'s own handlers: a press that barely moves begins nothing; then many reports of the pointer, one drawing per frame', () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'put /api/journey/nodes/7/place': { success: true } } });
    const b = board(BOXES, LINES), on7 = over(b, { node: 7 }), L = F.__page().listeners;
    L.pointerdown(pointer(500, 400, on7));
    const small = pointer(503, 402, on7);
    L.pointermove(small);
    assert.deepEqual([F.__state().journeyDrag.moved, small.prevented, F.__page().frames.length, b.measured()], [false, 0, 0, 0]);
    for (let i = 1; i <= 40; i++) L.pointermove(pointer(500 + i * 5, 400 + i * 2, on7));
    assert.equal(F.__page().frames.length, 1, 'forty reports, one frame asked for');
    assert.equal(b.measured(), 5); assert.equal(b.el(7).style.transform, undefined, 'nothing is drawn before the frame');
    assert.equal(F.__frame(), 1);
    assert.equal(b.el(7).style.transform, 'translate3d(200px,80px,0)', 'the frame draws where the pointer is now, not every place it passed');
    assert.deepEqual(b.paths.map(p => p.drawn), [0, 1, 1, 1]);
    L.pointermove(pointer(710, 480, on7)); L.pointermove(pointer(720, 480, on7));
    assert.equal(F.__page().frames.length, 1, 'after a frame the next report asks for the next one');
  });
  test('letting go: the pending frame is dropped, the box lands where the pointer was, its place is saved and the board drawn once', async () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'put /api/journey/nodes/7/place': { success: true } } });
    const b = board(BOXES, LINES), on7 = over(b, { node: 7 }), L = F.__page().listeners;
    L.pointerdown(pointer(500, 400, on7));
    L.pointermove(pointer(560, 400, on7));
    await L.pointerup(pointer(623, 441, on7));
    assert.deepEqual(F.__page().cancelled, [1], 'the frame that was still due');
    assert.equal(F.__state().journeyDrag, null);
    const node = F.__state().journeyFlows[0].nodes.find(n => n.id === 7);
    assert.deepEqual([node.x, node.y], [163, 381], 'the place under the pointer when it was let go');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/7/place', { x: 163, y: 381 }]);
    assert.match(F.__page().els['journey-board'].innerHTML, /data-node="7" style="left:163px;top:381px"/);
    assert.ok(Date.now() - F.__state().journeyDragEnd < 350, 'the click that ends the drag opens nothing');
    F.__page().listeners.click({ clientX: 1, clientY: 1, target: { closest: sel => (sel === '#journey-board' || sel === '[data-box]' ? { dataset: { box: '7' } } : null) } });
    assert.equal(modals().length, 0);
  });
  // Found by the bug hunt of 2026-11-19, with the page's real handlers: without a look at the button, a box whose
  // release the page never saw followed the pointer until the next click dropped it somewhere and saved that.
  test('a button let go where the page did not see it ends the drag at the next report of the pointer: nothing is dropped, nothing saved', () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))] });
    const b = board(BOXES, LINES), on7 = over(b, { node: 7 }), L = F.__page().listeners;
    L.pointerdown(pointer(500, 400, on7));
    L.pointermove(pointer(600, 500, on7));
    assert.equal(F.__state().journeyDrag.moved, true);
    L.pointermove(pointer(700, 600, on7, 0));   // the pointer moves, no button is held
    assert.equal(F.__state().journeyDrag, null);
    assert.deepEqual(F.__page().cancelled, [1], 'the frame that was due is not drawn');
    assert.match(F.__page().els['journey-board'].innerHTML, /data-node="7" style="left:40px;top:340px"/, 'the board is drawn as it was');
    assert.ok(!F.__page().log.some(c => c[0] === 'put'));
    L.pointermove(pointer(800, 700, on7, 0));
    assert.equal(F.__frame(), 0, 'and nothing follows the pointer any more');
    // a press that had not become a drag yet is simply forgotten
    L.pointerdown(pointer(500, 400, on7));
    L.pointermove(pointer(900, 900, on7, 0));
    assert.deepEqual([F.__state().journeyDrag, b.measured()], [null, 5], 'nothing was measured for it');
    assert.match(hands, /if \(!\(e\.buttons & 1\)\) \{ journeyDrag = null; return journeyDragDrop\(d\); \}/);
  });
  test('a board that was drawn again under the press is not dragged on: its boxes are gone, nothing is measured or saved', () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))] });
    const b = board(BOXES, LINES), on7 = over(b, { node: 7 }), L = F.__page().listeners;
    L.pointerdown(pointer(500, 400, on7));
    b.canvas.isConnected = false;   // an answer of the server drew the board again meanwhile
    L.pointermove(pointer(600, 500, on7));
    assert.deepEqual([F.__state().journeyDrag, b.measured(), F.__page().frames.length], [null, 0, 0]);
    assert.equal(F.journeyDragBegin({ kind: 'box', id: 7, canvas: b.canvas, el: b.el(7) }), false);
  });
  test('the board scrolled with the wheel while a box is held: the box stays under the pointer and lands there', () => {
    const b = board(BOXES, LINES), scroller = { scrollLeft: 30, scrollTop: 200 };
    b.canvas.parentElement = scroller;
    const d = { kind: 'box', id: 7, canvas: b.canvas, el: b.el(7) };
    assert.equal(F.journeyDragBegin(d), true);
    d.dx = 10; d.dy = 20;
    F.journeyDragPaint(d);
    assert.deepEqual([d.nx, d.ny], [50, 360], 'not scrolled since the drag began');
    scroller.scrollTop = 350; scroller.scrollLeft = 0;
    F.journeyDragPaint(d);
    assert.deepEqual([d.nx, d.ny, b.el(7).style.transform], [20, 510, 'translate3d(-20px,170px,0)'], 'the board went 150 down and 30 back: so did the place under the pointer');
  });
  test('a press that never moved is a click: nothing is saved, nothing measured', async () => {
    fill({ manage: true });
    const b = board(BOXES, LINES), on7 = over(b, { node: 7 }), L = F.__page().listeners;
    L.pointerdown(pointer(500, 400, on7));
    await L.pointerup(pointer(501, 401, on7));
    assert.deepEqual([b.measured(), F.__page().log.length, F.__state().journeyDragEnd, F.__state().journeyDrag], [0, 0, 0, null]);
  });
  test('a member, another mouse button and a press beside the board hold nothing', () => {
    const b = board(BOXES, LINES), L = F.__page().listeners;
    fill({ manage: false });
    L.pointerdown(pointer(500, 400, over(b, { node: 7 })));
    assert.equal(F.__state().journeyDrag, null);
    fill({ manage: true });
    L.pointerdown({ ...pointer(500, 400, over(b, { node: 7 })), button: 2 });
    L.pointerdown(pointer(500, 400, { closest: () => null }));
    assert.equal(F.__state().journeyDrag, null);
    L.pointermove(pointer(900, 900, over(b)));   // a pointer that moves with nothing held
    assert.equal(F.__page().frames.length, 0);
  });
  test('a pointer the browser takes away drops nothing: the frame is cancelled and the board drawn as it was', () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))] });
    const b = board(BOXES, LINES), on7 = over(b, { node: 7 }), L = F.__page().listeners;
    L.pointerdown(pointer(500, 400, on7));
    L.pointermove(pointer(600, 500, on7));
    L.pointercancel({});
    assert.deepEqual(F.__page().cancelled, [1]);
    assert.equal(F.__state().journeyDrag, null);
    assert.ok(!F.__page().log.some(c => c[0] === 'put'));
    assert.match(F.__page().els['journey-board'].innerHTML, /data-node="7" style="left:40px;top:340px"/);
    assert.equal(F.__frame(), 0, 'the cancelled frame never runs');
  });
  test('the handlers only note where the pointer is; no handler writes a place or redraws every line', () => {
    const move = hands.slice(hands.indexOf("document.addEventListener('pointermove'"), hands.indexOf("document.addEventListener('pointerup'"));
    assert.match(move, /if \(!d\.frame\) d\.frame = requestAnimationFrame\(\(\) => journeyDragPaint\(d\)\);/);
    assert.doesNotMatch(move, /journeyDrawLines|setAttribute|\.style\.|offset(Left|Top|Width|Height)|getBoundingClientRect/);
    assert.doesNotMatch(js, /style\.(left|top) =/, 'a box\'s left and top are written by the board\'s markup alone');
    assert.equal(count(js, 'if (d.frame) cancelAnimationFrame(d.frame);'), 2, 'on letting go, and wherever a drag ends with nothing dropped');
    assert.equal(count(hands, 'journeyDragDrop(d)'), 2, 'a pointer taken away, and a button let go where the page did not see it');
    assert.equal(count(js, 'journeyRects('), 3, 'measured in two places: when the lines are drawn, and when a drag begins');
  });
  test('the look of a dragged box: on a layer of its own, and nothing of it eases behind the pointer', () => {
    assert.match(css, /^\.jr-node\.is-dragging \{ z-index: 2; will-change: transform; \}$/m);
    assert.match(css, /^\.jr-node\.is-dragging \.jr-box \{ box-shadow: var\(--shadow-md\); cursor: grabbing; transition: none; \}$/m);
    assert.doesNotMatch(css, /^\.jr-node \{[^}]*transition/m, 'a box\'s place never eases');
    assert.match(css, /^\.jr-canvas\.can-edit \.jr-node \{ touch-action: none; \}$/m);
  });
});

describe('drawing a line by hand', () => {
  test('from a branch box\'s "No" foot the line starts where that foot stands and follows the pointer, once per frame', () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'put /api/journey/nodes/7/next': { flow: FLOW } } });
    const b = board(BOXES, LINES), foot = { dataset: { out: '7', side: 'else' } }, L = F.__page().listeners;
    L.pointerdown(pointer(365, 470, over(b, { node: 7, out: foot })));
    assert.deepEqual([F.__state().journeyDrag.kind, F.__state().journeyDrag.side], ['line', 'else']);
    for (let i = 1; i <= 20; i++) L.pointermove(pointer(365 + i * 10, 470 + i * 5, over(b)));
    assert.equal(F.__page().frames.length, 1); assert.equal(b.fresh.drawn, 0);
    F.__frame();
    assert.equal(b.fresh.drawn, 1);
    assert.equal(b.fresh.d, F.journeyLinePath({ x: 40, y: 340, w: 300, h: 80 }, { x: 465, y: 520, w: 0, h: 0 }, 0.75), 'from three quarters of the foot to the pointer, in the board\'s own measure');
    assert.equal(b.asked(), 1, 'where the board is on the screen is asked once per frame');
    assert.deepEqual(b.paths.map(p => p.drawn), [0, 0, 0, 0], 'no other line is touched');
    assert.equal(b.el(7).style.transform, undefined, 'the box stays');
  });
  test('dropped on another box it becomes that side\'s line; the "+" of a plain box draws the one line it has', async () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))], answers: { 'put /api/journey/nodes/7/next': { flow: FLOW }, 'put /api/journey/nodes/8/next': { flow: FLOW } } });
    const b = board(BOXES, LINES), L = F.__page().listeners;
    L.pointerdown(pointer(365, 470, over(b, { node: 7, out: { dataset: { out: '7', side: 'else' } } })));
    L.pointermove(pointer(500, 300, over(b)));
    F.__opt('under', { closest: sel => (sel === '[data-node]' ? { dataset: { node: '2' } } : null) });
    await L.pointerup(pointer(500, 300, over(b)));
    L.pointerdown(pointer(190, 580, over(b, { node: 8, out: { dataset: { out: '8' } } })));
    L.pointermove(pointer(500, 560, over(b)));
    F.__frame();
    assert.equal(b.fresh.d, F.journeyLinePath({ x: 40, y: 490, w: 300, h: 80 }, { x: 400, y: 510, w: 0, h: 0 }, 0.5), 'from the middle of the foot');
    F.__opt('under', { closest: sel => (sel === '[data-node]' ? { dataset: { node: '9' } } : null) });
    await L.pointerup(pointer(500, 560, over(b)));
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'put'), [['put', '/api/journey/nodes/7/next', { next_id: 2, side: 'else' }], ['put', '/api/journey/nodes/8/next', { next_id: 9 }]]);
  });
  test('dropped on nothing, nothing is asked of the server', async () => {
    fill({ manage: true, flows: [JSON.parse(JSON.stringify(FLOW))] });
    const b = board(BOXES, LINES), L = F.__page().listeners;
    L.pointerdown(pointer(365, 470, over(b, { node: 7, out: { dataset: { out: '7', side: 'next' } } })));
    L.pointermove(pointer(900, 900, over(b)));
    await L.pointerup(pointer(900, 900, over(b)));
    assert.ok(!F.__page().log.some(c => c[0] === 'put'));
  });
});

describe('the look of the two feet', () => {
  test('a foot is a small labelled pill under the box; as a handle it gives up the round "+" shape', () => {
    assert.match(css, /^\.jr-side \{ position: absolute; bottom: -11px; transform: translateX\(-50%\);[^}]*white-space: nowrap; \}$/m);
    assert.match(css, /^\.jr-out\.jr-side \{ width: auto; height: 22px; margin-left: 0; border-radius: 11px; \}$/m);
    assert.match(css, /^\.jr-out\.jr-side\.is-yes \{ left: 25%; \}$/m); assert.match(css, /^\.jr-out\.jr-side\.is-no\s+\{ left: 75%; \}$/m);
    assert.match(css, /^\.jr-out\.jr-side:hover \{ color: var\(--on-primary\); \}$/m, 'on the filled hover the word stays readable');
  });
  test('the pill\'s rules come after the round "+" they adjust, so they are the ones that count', () => {
    const plus = css.indexOf('\n.jr-out { position: absolute; left: 50%;'), hover = css.indexOf('\n.jr-out:hover {'), side = css.indexOf('\n.jr-side { position: absolute;'), both = css.indexOf('\n.jr-out.jr-side {');
    assert.ok(plus > 0 && hover > plus && side > hover && both > side);
    assert.doesNotMatch(css, /\.jr-node\s*>\s*\*|\.jr-canvas\s*>\s*\*/, 'no rule for "every child" that could outweigh them');
  });
});
