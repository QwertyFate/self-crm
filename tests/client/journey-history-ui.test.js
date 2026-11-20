// CLIENT (static + pure-function) tests for the record of what the workflows did, as it is read
// (public/js/journey-history.js, CUSTOMER_JOURNEY_CHANGES Part 15, 2026-11-20; the server writes it and answers
// GET /api/journey/history: utils/journey-log.js).
//
// One list, three ways in: under what waits now in a workflow's "Activity" window, "History" at the top of the
// workflows page for the whole workspace, and "Workflow history" in a deal's menu. Here: what is asked of the server
// (and that the server takes it), every kind of entry as one line in plain words in both languages, the list with
// its time and its workflow, the window — narrowing, searching, "Load more", empty, refused, offline, an answer that
// comes too late — and that what a person typed stays text.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const serverLog = require('../../utils/journey-log');
const serverEnds = require('../../utils/journey-ends');
const serverStarts = require('../../utils/journey-triggers');

const html  = read('public/index.html');
const core  = read('public/js/core.js');
const js    = read('public/js/journey.js');
const hist  = read('public/js/journey-history.js');
const start = read('public/js/journey-start.js');
const dv    = read('public/js/detail-views.js');
const css   = read('public/style.css');
const dict  = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;
const constOf = name => new Function(`${sliceConst('public/js/journey-history.js', name)} return ${name};`)();
const flush = () => new Promise(r => setImmediate(r));

// the sandbox: a recording api whose answers the test sets (a value, or a function of the address), windows whose
// parts are plain objects, timers that run when the test says so, and the real t/tf/esc/icon
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  ...['t', 'tf', 'icon'].map(n => sliceFn(core, n, 'core.js')),
  ...['JOURNEY_ERRORS', 'JOURNEY_DETAILS'].map(n => sliceConst('public/js/journey.js', n)),
  sliceConst('public/js/journey-start.js', 'JOURNEY_TRIGGERS'),
  hist.match(/^const JOURNEY_HISTORY_PAGE = .*$/m)[0],
  hist.match(/^const JOURNEY_HISTORY_SEARCH = .*$/m)[0],
  ...['JOURNEY_HISTORY_GROUPS', 'JOURNEY_HISTORY_STATUS', 'JOURNEY_HISTORY_REASONS', 'JOURNEY_HISTORY_WAITS', 'JOURNEY_HISTORY_CHANGES'].map(n => sliceConst('public/js/journey-history.js', n)),
  ...['journeyHistoryUrl', 'journeyHistoryText', 'journeyHistoryRowHtml', 'journeyHistoryListHtml', 'journeyHistoryGroupsHtml', 'journeyHistoryButtonHtml', 'openJourneyHistory', 'openJourneyDealHistory']
    .map(n => sliceFn(hist, n, 'journey-history.js')),
  `const __log = [], __els = {}, __parts = {}, __handlers = {};
   let __answer = () => ({ entries: [], more: false }), __timers = [], __groups = [], __connected = true;
   const __el = id => (__els[id] ||= { id, innerHTML: '' });
   const document = { getElementById: id => __el(id) };
   const api = { get: async url => { __log.push(['get', url]); const a = typeof __answer === 'function' ? __answer(url) : __answer; if (a === 'offline') throw new Error('offline'); return a; } };
   const __part = part => (__parts[part] ||= { innerHTML: '', textContent: '', hidden: null, disabled: false, classes: {}, classList: { toggle(c, on) { __parts[part].classes[c] = !!on; } } });
   const __button = g => ({ dataset: { jhGroup: g }, on: g === '', pressed: String(g === ''), classList: { toggle(c, on) { if (c === 'on') __groups.find(b => b.dataset.jhGroup === g).on = !!on; } }, setAttribute(k, v) { if (k === 'aria-pressed') this.pressed = v; } });
   const ui = {
     modal: opts => { __log.push(['modal', opts]); __groups = ['', 'steps', 'deals', 'flow'].map(__button);
       return { el: { get isConnected() { return __connected; }, querySelector: sel => __part(sel.replace(/^#jh-[a-z0-9]+-/, '')), querySelectorAll: sel => (sel === '[data-jh-group]' ? __groups : []) }, close() { __log.push(['close']); } }; },
     toast: m => __log.push(['toast', m]),
   };
   function on(_root, type, selector, fn) { __handlers[type + ' ' + selector] = fn; }
   const uid = () => 'abc1234';
   const setTimeout = (fn, ms) => { __timers.push({ fn, ms }); return __timers.length; };
   const clearTimeout = id => { if (id && __timers[id - 1]) __timers[id - 1].fn = null; };
   function __tick() { const due = __timers.filter(x => x.fn); __timers = []; for (const x of due) x.fn(); return due.map(x => x.ms); }
   function __reset(answer) { __log.length = 0; __answer = answer === undefined ? (() => ({ entries: [], more: false })) : answer; __timers = []; __groups = []; __connected = true;
     for (const o of [__els, __parts, __handlers]) for (const k of Object.keys(o)) delete o[k]; }
   function __opt(k, v) { if (k === 'answer') __answer = v; else if (k === 'connected') __connected = v; }
   function __page() { return { log: __log, els: __els, parts: __parts, handlers: __handlers, groups: __groups }; }`,
].join('\n');
const NAMES = ['journeyErrorText', 'journeySend', 'journeyWhen', 'journeyStepText', 'journeyDetailText', 'journeyActivityHtml', 'openJourneyActivity', 'journeyFlow', 'journeyToolbarHtml', 'journeyDrawLines', 'renderJourney'];
const F = loadFns('public/js/journey.js', NAMES, {
  state: { currentLang: 'en', journeyFlows: [], journeyManage: false, journeyLimits: { flows: 20, nodes: 60 }, journeyFlowId: null },
  extra, expose: ['__reset', '__opt', '__page', '__tick', 'journeyHistoryUrl', 'journeyHistoryText', 'journeyHistoryRowHtml', 'journeyHistoryListHtml', 'journeyHistoryGroupsHtml', 'journeyHistoryButtonHtml',
    'openJourneyHistory', 'openJourneyDealHistory'],
});

const AT = '2026-11-19T09:00:00.000Z';
const entry = (id, more = {}) => ({ id, created_at: AT, event: 'step', flow_id: 10, flow_name: 'New lead', deal_id: 60, deal_title: 'Wohnung 3', kind: 'email', title: 'Welcome', status: 'done', detail: 'erika@example.de', actor_name: null, ...more });
const FLOW = { id: 10, name: 'New lead', active: true, nodes: [] };
function fill({ lang = 'en', manage = false, flows = [FLOW], shown = 10, answer } = {}) {
  F.__reset(answer);
  F.__set('currentLang', lang); F.__set('journeyFlows', flows); F.__set('journeyManage', manage); F.__set('journeyFlowId', shown);
}
const say = (e, lang = 'en') => { F.__set('currentLang', lang); const out = F.journeyHistoryText(e); F.__set('currentLang', 'en'); return out; };
const line = (e, lang) => { const l = say(e, lang); return `${l.who}${l.person ? ' ' : ' — '}${l.text}`; };
const asked = () => F.__page().log.filter(c => c[0] === 'get').map(c => c[1]);
const modal = () => F.__page().log.filter(c => c[0] === 'modal').map(c => c[1]).at(-1);
const part = name => F.__page().parts[name];
const press = (what, ...args) => F.__page().handlers[what](...args);

describe('wiring', () => {
  test('the script is loaded once, after the board and the starts whose names it says', () => {
    assert.equal(count(html, '<script src="js/journey-history.js"></script>'), 1);
    for (const before of ['js/core.js', 'js/journey.js', 'js/journey-start.js']) assert.ok(html.indexOf(`<script src="${before}">`) < html.indexOf('<script src="js/journey-history.js">'), before);
  });
  test('what the list can be narrowed to, how a step came out and what was done to a workflow are the server\'s own lists', () => {
    assert.deepEqual(Object.keys(constOf('JOURNEY_HISTORY_GROUPS')), ['', ...Object.keys(serverLog.GROUPS)], 'everything, then the server\'s three groups');
    assert.deepEqual(Object.keys(constOf('JOURNEY_HISTORY_CHANGES')), serverLog.FLOW_DETAILS);
    assert.deepEqual(Object.keys(constOf('JOURNEY_HISTORY_STATUS')), ['done', 'skipped', 'failed']);
    assert.deepEqual(serverLog.EVENTS, ['step', 'retry', 'entered', 'ended', 'moved', 'flow']);
    for (const event of serverLog.EVENTS) assert.ok(hist.includes(`'${event}'`), `an entry of the kind '${event}' has its line`);
    assert.deepEqual(serverLog.BY_HAND, ['manual', 'restart']);
    assert.match(hist, /^const JOURNEY_HISTORY_PAGE = 50;/m); assert.equal(serverLog.DEFAULT_LIMIT, 50);
    assert.match(hist, /^const JOURNEY_HISTORY_SEARCH = 100;/m); assert.equal(serverLog.MAX_Q, 100);
  });
  test('every reason the engine ends a workflow with has its sentence, and every start that takes a deal in has its name', () => {
    const engine = read('utils/journey-run.js');
    const reasons = ['stop_stage', 'left_stages', ...Object.values(serverEnds.REASONS)];
    for (const word of ['stop_stage', 'left_stages']) assert.ok(engine.includes(`'${word}'`), word);
    assert.deepEqual(Object.keys(constOf('JOURNEY_HISTORY_REASONS')).sort(), [...new Set(reasons)].sort());
    const triggers = new Function(`${sliceConst('public/js/journey-start.js', 'JOURNEY_TRIGGERS')} return JOURNEY_TRIGGERS;`)();
    assert.deepEqual(Object.keys(triggers), Object.keys(serverStarts.TRIGGERS));
    for (const k of Object.keys(triggers)) assert.ok(dict.en[triggers[k].title] && dict.de[triggers[k].title], k);
  });
  test('the three ways in: the page\'s header, a workflow\'s "Activity", a deal\'s menu', () => {
    assert.match(sliceFn(js, 'renderJourney', 'journey.js'), /\+ \(typeof journeyHistoryButtonHtml === 'function' \? journeyHistoryButtonHtml\(\) : ''\) \+/);
    assert.match(sliceFn(js, 'openJourneyActivity', 'journey.js'), /if \(typeof openJourneyHistory === 'function'\) return openJourneyHistory\(\{ flowId: flow\.id, title, head \}\);/);
    assert.match(dv, /\.\.\.\(typeof openJourneyDealHistory === 'function' \? \[\{ label: t\('jh_deal_menu'\), icon: 'list', onSelect: \(\) => openJourneyDealHistory\(S\.d\.id, S\.d\.title\) \}\] : \[\]\), \{ sep: true \},/);
    assert.ok(dv.indexOf("journeyIncludeDeal(S.d.id, S.d.title)") < dv.indexOf("openJourneyDealHistory(S.d.id, S.d.title)"), 'right under "Add to a workflow"');
    assert.ok(html.includes('<symbol id="i-list"'));
  });
  test('the server\'s refusal of a search it cannot answer has its sentence', () => {
    const errors = new Function(`${sliceConst('public/js/journey.js', 'JOURNEY_ERRORS')} return JOURNEY_ERRORS;`)();
    assert.equal(errors.history, 'jh_err_query');
    assert.match(read('routes/journey.js'), /^\s+history:\s+\[400, /m);
    fill();
    assert.equal(F.journeyErrorText({ error: 'x', code: 'history' }), 'This search cannot be answered. Change it and try again.');
  });
});

describe('both dictionaries', () => {
  const used = [...new Set([hist, js, dv].flatMap(src => [...src.matchAll(/'(jh_[a-z0-9_]+)'/g)].map(m => m[1])))];
  test('every word of the record exists in English and German; none is left unused', () => {
    assert.ok(used.length >= 60, `its own keys (${used.length})`);
    for (const k of used) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jh_') && !used.includes(k)), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jh_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jh_')).sort());
  });
  test('German speaks to nobody in particular, no text says "journey", and no word is defined twice', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jh_'))) {
      assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
      for (const lang of ['en', 'de']) assert.doesNotMatch(dict[lang][k], /journey/i, k);
    }
    const at = core.indexOf('const TRANSLATIONS'), en = core.indexOf('\n  en: {', at), de = core.indexOf('\n  de: {', en);
    for (const [lang, block] of [['en', core.slice(en, de)], ['de', core.slice(de, core.indexOf('\n};', de))]]) {
      const keys = [...block.matchAll(/(?:^|[\s,{])(jh_[a-z0-9_]+):\s*'/gm)].map(m => m[1]);
      assert.equal(keys.length, used.length, lang);
      assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], lang);
    }
  });
  test('the words of the short list the Activity window had are gone with it', () => {
    for (const k of ['jr_act_log', 'jr_act_none_log', 'jr_log_done', 'jr_log_skipped', 'jr_log_failed']) for (const lang of ['en', 'de']) assert.equal(dict[lang][k], undefined, `${lang}: ${k}`);
    assert.doesNotMatch(js, /jr_log_|jr_act_log/);
  });
  test('the deal\'s menu and the page call the feature what the user calls it', () => {
    assert.deepEqual([dict.en.jh_deal_menu, dict.de.jh_deal_menu, dict.en.jh_button, dict.de.jh_button], ['Workflow history', 'Workflow-Protokoll', 'History', 'Protokoll']);
    assert.deepEqual([dict.en.jr_include, dict.de.jr_include], ['Add to a workflow', 'In einen Workflow aufnehmen'], 'the entry beside it never said "Customer Journey" to the user');
  });
});

describe('what is asked of the server', () => {
  const U = q => F.journeyHistoryUrl(q);
  test('only what is set is sent, in one order; fifty at a time', () => {
    assert.equal(U(), '/api/journey/history?limit=50');
    assert.equal(U({}), '/api/journey/history?limit=50');
    assert.equal(U({ flowId: 10 }), '/api/journey/history?flow_id=10&limit=50');
    assert.equal(U({ dealId: '60' }), '/api/journey/history?deal_id=60&limit=50');
    assert.equal(U({ flowId: 10, dealId: 60, group: 'steps', q: ' Wohnung 3 ', before: 412 }), '/api/journey/history?flow_id=10&deal_id=60&group=steps&q=Wohnung+3&before=412&limit=50');
    assert.equal(U({ group: 'deals' }), '/api/journey/history?group=deals&limit=50'); assert.equal(U({ group: 'flow' }), '/api/journey/history?group=flow&limit=50');
    assert.equal(U({ limit: 200 }), '/api/journey/history?limit=200');
  });
  test('"everything" sends no group; a group nobody knows is not sent; a search is trimmed, cut to a hundred characters and escaped', () => {
    for (const group of ['', 'weather', 'constructor', undefined]) assert.equal(U({ group }), '/api/journey/history?limit=50', String(group));
    assert.equal(U({ q: '   ' }), '/api/journey/history?limit=50');
    assert.equal(new URLSearchParams(U({ q: 'x'.repeat(150) }).split('?')[1]).get('q').length, 100);
    assert.equal(U({ q: 'a&b=c #d' }), '/api/journey/history?q=a%26b%3Dc+%23d&limit=50');
  });
  test('whatever the window can ask is something the server takes', () => {
    const queries = [{}, { flowId: 10 }, { dealId: 60 }, { group: 'steps' }, { group: 'deals' }, { group: 'flow' }, { q: 'Wohnung' }, { q: 'x'.repeat(150) }, { before: 412 }, { flowId: 10, group: 'flow', q: 'ö & <b>', before: 7 }];
    for (const q of queries) {
      const taken = serverLog.checkQuery(Object.fromEntries(new URLSearchParams(U(q).split('?')[1])));
      assert.equal(taken.code, undefined, JSON.stringify(q));
      assert.equal(taken.limit, 50);
    }
    const taken = serverLog.checkQuery(Object.fromEntries(new URLSearchParams(U({ flowId: 10, dealId: 60, group: 'deals', q: ' Haus ', before: 9 }).split('?')[1])));
    assert.deepEqual([taken.flowId, taken.dealId, taken.events, taken.q, taken.before], [10, 60, serverLog.GROUPS.deals, 'Haus', 9]);
  });
});

describe('an entry in plain words', () => {
  test('a step: what it is called and how it came out — a step that says what it did needs no "done" before that', () => {
    assert.equal(line(entry(1)), 'Wohnung 3 — Email: Welcome — done, erika@example.de');
    assert.equal(line(entry(1, { kind: 'call', title: 'fonio calls', detail: 'scheduled' })), 'Wohnung 3 — Call (fonio): fonio calls — call planned');
    assert.equal(line(entry(1, { kind: 'branch', title: 'Meeting booked?', detail: 'no' })), 'Wohnung 3 — If / else: Meeting booked? — answer: no');
    assert.equal(line(entry(1, { kind: 'wait', title: '', detail: 'waited' })), 'Wohnung 3 — Wait — waited');
    assert.equal(line(entry(1, { kind: 'task', title: 'Call Erika', detail: 'assigned' })), 'Wohnung 3 — Task: Call Erika — task made');
    assert.equal(line(entry(1, { kind: 'move', title: '', detail: 'Booked' })), 'Wohnung 3 — Move the deal — done, Booked');
    assert.equal(line(entry(1, { status: 'skipped', detail: 'no_email' })), 'Wohnung 3 — Email: Welcome — skipped, the contact has no email address');
    assert.equal(line(entry(1, { status: 'failed', detail: 'rejected: quota' })), 'Wohnung 3 — Email: Welcome — failed, Google refused the email: quota');
    assert.equal(line(entry(1, { status: 'done', detail: null })), 'Wohnung 3 — Email: Welcome — done');
    assert.deepEqual([say(entry(1)).bad, say(entry(1, { status: 'skipped' })).bad, say(entry(1, { status: 'failed' })).bad], [false, false, true], 'only a step that failed is marked');
    assert.equal(line(entry(1), 'de'), 'Wohnung 3 — E-Mail: Welcome — erledigt, erika@example.de');
    assert.equal(line(entry(1, { status: 'skipped', detail: 'no_phone', kind: 'call', title: 'fonio' }), 'de'), 'Wohnung 3 — Anruf (fonio): fonio — übersprungen, der Kontakt hat keine Telefonnummer');
  });
  test('a step that will be tried again says so, and why', () => {
    assert.equal(line(entry(2, { event: 'retry', status: 'retry', detail: 'unreachable' })), 'Wohnung 3 — Email: Welcome — will be tried again: Google could not be reached');
    assert.equal(line(entry(2, { event: 'retry', status: 'retry', detail: null })), 'Wohnung 3 — Email: Welcome — will be tried again');
    assert.equal(line(entry(2, { event: 'retry', status: 'retry', detail: 'unreachable' }), 'de'), 'Wohnung 3 — E-Mail: Welcome — wird noch einmal versucht: Google war nicht erreichbar');
    assert.equal(say(entry(2, { event: 'retry', status: 'retry' })).bad, false, 'not a failure yet');
  });
  test('an email held back by a sending limit or a pause waits — it was not tried, and nothing failed (Part 17)', () => {
    const waits = (detail, lang) => line(entry(2, { event: 'retry', status: 'retry', detail }), lang);
    assert.deepEqual(['limit_day', 'limit_hour', 'limit_person', 'paused'].map(d => waits(d)), ['Wohnung 3 — Email: Welcome — waits: the daily limit of the sending address is reached',
      'Wohnung 3 — Email: Welcome — waits: the hourly limit of the sending address is reached', 'Wohnung 3 — Email: Welcome — waits: the limit of emails per person per day is reached',
      'Wohnung 3 — Email: Welcome — waits: sending is paused']);
    assert.deepEqual(['limit_day', 'limit_hour', 'limit_person', 'paused'].map(d => waits(d, 'de')), ['Wohnung 3 — E-Mail: Welcome — wartet: das Tageslimit der Absenderadresse ist erreicht',
      'Wohnung 3 — E-Mail: Welcome — wartet: das Stundenlimit der Absenderadresse ist erreicht', 'Wohnung 3 — E-Mail: Welcome — wartet: das Limit an E-Mails pro Person pro Tag ist erreicht',
      'Wohnung 3 — E-Mail: Welcome — wartet: der Versand ist pausiert']);
    for (const d of ['limit_day', 'limit_hour', 'limit_person', 'paused']) assert.deepEqual([say(entry(2, { event: 'retry', status: 'retry', detail: d })).bad, say(entry(2, { event: 'retry', status: 'retry', detail: d })).person], [false, false], d);
    // every such word has its sentence (journey.js), and only an entry of the kind 'retry' is worded so
    const waiting = constOf('JOURNEY_HISTORY_WAITS'), details = new Function(`${sliceConst('public/js/journey.js', 'JOURNEY_DETAILS')} return JOURNEY_DETAILS;`)();
    assert.deepEqual(waiting, ['limit_day', 'limit_hour', 'limit_person', 'paused']);
    for (const d of waiting) assert.ok(Object.hasOwn(details, d), d);
    assert.equal(waits('unreachable'), 'Wohnung 3 — Email: Welcome — will be tried again: Google could not be reached', 'anything else is still tried again');
    assert.equal(waits('limit_week'), 'Wohnung 3 — Email: Welcome — will be tried again: limit_week', 'a word nobody knows is shown as it is');
    assert.equal(line(entry(1, { status: 'skipped', detail: 'paused' })), 'Wohnung 3 — Email: Welcome — skipped, sending is paused', 'a step that came out is worded as a step');
  });
  test('a deal taken in: by which start, by whom by hand, or put in again', () => {
    const taken = detail => line(entry(3, { event: 'entered', kind: null, title: '', status: null, detail }));
    assert.equal(taken('lead'), 'Wohnung 3 — taken in (start: A lead arrives through a lead webhook)');
    assert.equal(taken('stage'), 'Wohnung 3 — taken in (start: A deal arrives in a stage)');
    // 'manual' is both the name of a start ("only when a deal is added by hand", which takes nobody in by itself) and
    // the server's word for "a person put it in": as what took a deal in it always means the person
    const seen = new Set(), starts = Object.keys(serverStarts.TRIGGERS).filter(k => !serverLog.BY_HAND.includes(k));
    assert.deepEqual(Object.keys(serverStarts.TRIGGERS).filter(k => serverLog.BY_HAND.includes(k)), ['manual']);
    for (const key of starts) {
      const en = taken(key), de = line(entry(3, { event: 'entered', detail: key }), 'de');
      assert.match(en, /^Wohnung 3 — taken in \(start: .{8,}\)$/, key); assert.match(de, /^Wohnung 3 — aufgenommen \(Auslöser: .{8,}\)$/, key);
      seen.add(en);
    }
    assert.equal(seen.size, 28, 'every start that takes a deal in says its own name');
    assert.equal(line(entry(3, { event: 'entered', detail: 'manual', actor_name: 'Olga' })), 'Wohnung 3 — put in by Olga');
    assert.equal(line(entry(3, { event: 'entered', detail: 'manual' })), 'Wohnung 3 — put in by hand');
    assert.equal(line(entry(3, { event: 'entered', detail: 'restart', actor_name: 'Olga' })), 'Wohnung 3 — started again by Olga');
    assert.equal(line(entry(3, { event: 'entered', detail: 'restart' })), 'Wohnung 3 — started again by hand');
    assert.equal(line(entry(3, { event: 'entered', detail: 'manual', actor_name: 'Olga' }), 'de'), 'Wohnung 3 — von Olga aufgenommen');
    assert.equal(line(entry(3, { event: 'entered', detail: 'restart' }), 'de'), 'Wohnung 3 — von Hand neu gestartet');
    for (const detail of ['a_start_of_tomorrow', 'constructor', '', null]) assert.equal(taken(detail), 'Wohnung 3 — taken in', `${detail}: taken in, nothing guessed`);
  });
  test('a workflow that is over for a deal: it ran to its end, or what ended it — every reason in its own words', () => {
    const over = (detail, status = 'stopped', lang) => line(entry(4, { event: 'ended', kind: null, title: '', status, detail }), lang);
    assert.equal(over(null, 'done'), 'Wohnung 3 — finished'); assert.equal(over(null, 'done', 'de'), 'Wohnung 3 — durchgelaufen');
    assert.equal(over('meeting_booked'), 'Wohnung 3 — ended: a meeting was booked');
    assert.equal(over('stop_stage'), 'Wohnung 3 — ended: the deal arrived in a stage that ends the workflow');
    assert.equal(over('max_days', 'stopped', 'de'), 'Wohnung 3 — beendet: der Deal war so viele Tage im Workflow, wie dieser höchstens dauern darf');
    const reasons = ['stop_stage', 'left_stages', ...Object.values(serverEnds.REASONS)], en = new Set(), de = new Set();
    for (const r of reasons) {
      assert.match(over(r), /^Wohnung 3 — ended: [a-z].{12,}$/, r); assert.match(over(r, 'stopped', 'de'), /^Wohnung 3 — beendet: [a-zäöü].{12,}$/, r);
      assert.doesNotMatch(over(r), /_/, `${r}: no raw word`);
      en.add(over(r)); de.add(over(r, 'stopped', 'de'));
    }
    assert.deepEqual([en.size, de.size], [17, 17], 'seventeen reasons, seventeen sentences');
    assert.equal(over('a_reason_of_tomorrow'), 'Wohnung 3 — ended: a_reason_of_tomorrow', 'a reason a newer server knows is shown as it is');
    assert.equal(over('constructor'), 'Wohnung 3 — ended: constructor');
    assert.equal(over(null), 'Wohnung 3 — ended'); assert.equal(over(''), 'Wohnung 3 — ended');
  });
  test('a deal that waited at a step which was deleted', () => {
    const moved = (more, lang) => line(entry(5, { event: 'moved', status: null, detail: 'step_deleted', ...more }), lang);
    assert.equal(moved({}), 'Wohnung 3 — put on to the next step, because the step "Welcome" (Email) was deleted');
    assert.equal(moved({ title: '', kind: 'wait' }), 'Wohnung 3 — put on to the next step, because the step "Wait" was deleted');
    assert.equal(moved({ title: '', kind: null }), 'Wohnung 3 — put on to the next step, because its step was deleted');
    assert.equal(moved({}, 'de'), 'Wohnung 3 — zum nächsten Schritt weitergeleitet, weil der Schritt „Welcome“ (E-Mail) gelöscht wurde');
  });
  test('something done to the workflow itself: who did it, and what — every kind of change in its own words', () => {
    const did = (detail, more = {}, lang) => line(entry(6, { event: 'flow', deal_id: null, deal_title: null, kind: null, title: '', status: null, detail, actor_name: 'Olga', ...more }), lang);
    assert.equal(did('switched_on'), 'Olga switched the workflow on'); assert.equal(did('switched_off'), 'Olga switched the workflow off');
    assert.equal(did('created'), 'Olga created the workflow'); assert.equal(did('deleted'), 'Olga deleted the workflow');
    assert.equal(did('renamed', { title: 'Nurture' }), 'Olga renamed the workflow to "Nurture"'); assert.equal(did('renamed'), 'Olga renamed the workflow');
    assert.equal(did('step_changed', { title: 'Welcome', kind: 'email' }), 'Olga changed the step "Welcome" (Email)');
    assert.equal(did('step_changed', { title: 'Welcome' }), 'Olga changed the step "Welcome"');
    assert.equal(did('step_added', { kind: 'wait' }), 'Olga added the step "Wait"');
    assert.equal(did('step_deleted', { kind: 'branch', title: 'Booked yet' }), 'Olga deleted the step "Booked yet" (If / else)');
    assert.equal(did('step_added'), 'Olga added the step', 'nothing known about the step: no dangling words');
    assert.equal(did('line_changed'), 'Olga changed a line between two steps'); assert.equal(did('start_changed'), 'Olga changed the start');
    assert.equal(did('switched_on', { actor_name: null }), 'Someone switched the workflow on');
    assert.equal(did('something_new'), 'Olga changed the workflow', 'a change a newer server knows');
    assert.equal(did('constructor'), 'Olga changed the workflow');
    assert.equal(did('switched_on', {}, 'de'), 'Olga hat den Workflow eingeschaltet');
    assert.equal(did('step_changed', { title: 'Welcome', kind: 'email' }, 'de'), 'Olga hat den Schritt „Welcome“ (E-Mail) geändert');
    assert.equal(did('renamed', { title: 'Nurture' }, 'de'), 'Olga hat den Workflow in „Nurture“ umbenannt');
    assert.equal(did('deleted', { actor_name: '' }, 'de'), 'Jemand hat den Workflow gelöscht');
    const en = new Set(), de = new Set();
    for (const d of serverLog.FLOW_DETAILS) { en.add(did(d, { title: 'T', kind: 'email' })); de.add(did(d, { title: 'T', kind: 'email' }, 'de')); }
    assert.deepEqual([en.size, de.size], [10, 10], 'ten kinds of change, ten sentences');
    assert.equal(say(entry(6, { event: 'flow', detail: 'created', actor_name: 'Olga' })).person, true);
  });
  test('an entry about a deal that has no title, and a kind of entry nobody knows, still read', () => {
    assert.equal(line(entry(7, { deal_title: null })), 'A deal — Email: Welcome — done, erika@example.de');
    assert.equal(line(entry(7, { deal_title: '' }), 'de'), 'Ein Deal — E-Mail: Welcome — erledigt, erika@example.de');
    assert.equal(line(entry(7, { event: 'paused', detail: 'by_someone' })), 'Wohnung 3 — paused: by_someone');
    assert.equal(line(entry(7, { event: 'constructor', detail: '' })), 'Wohnung 3 — constructor');
    assert.deepEqual(F.journeyHistoryText(null), { who: 'A deal', text: '', bad: false, person: false });
    assert.equal(line(entry(7, { kind: 'weather', title: 'Rain', status: 'sunny', detail: 'toString' })), 'Wohnung 3 — Rain — sunny, toString', 'a kind and a status of tomorrow: shown as they are');
  });
});

describe('the list', () => {
  test('an entry is its time, one line, and — where the list spans workflows — its workflow', () => {
    fill();
    assert.match(F.journeyHistoryRowHtml(entry(1), false), /^<li class="jh-row"><span class="jh-when">19 Nov 2026, \d\d:\d\d<\/span><span class="jh-what"><b>Wohnung 3<\/b> — Email: Welcome — done, erika@example\.de<\/span><\/li>$/);
    assert.match(F.journeyHistoryRowHtml(entry(1), true), /<\/span><span class="jh-flow">New lead<\/span><\/li>$/);
    assert.match(F.journeyHistoryRowHtml(entry(1, { status: 'failed', detail: 'error' }), false), /^<li class="jh-row bad">/);
    assert.match(F.journeyHistoryRowHtml(entry(2, { event: 'flow', detail: 'switched_on', actor_name: 'Olga' }), false), /<span class="jh-what"><b>Olga<\/b> switched the workflow on<\/span>/, 'a person and what they did read as one sentence');
    F.__set('currentLang', 'de');
    assert.match(F.journeyHistoryRowHtml(entry(1), false), /<span class="jh-when">19\.11\.2026, \d\d:\d\d<\/span>/);
  });
  test('a workflow that was deleted keeps its name, and says that it is gone', () => {
    fill();
    assert.match(F.journeyHistoryRowHtml(entry(1, { flow_id: null, flow_name: 'Old drip' }), true), /<span class="jh-flow">Old drip \(deleted\)<\/span>/);
    assert.match(F.journeyHistoryRowHtml(entry(1, { flow_id: null, flow_name: null }), true), /<span class="jh-flow">a workflow \(deleted\)<\/span>/);
    assert.match(F.journeyHistoryRowHtml(entry(1, { flow_name: '' }), true), /<span class="jh-flow">a workflow<\/span>/);
    F.__set('currentLang', 'de');
    assert.match(F.journeyHistoryRowHtml(entry(1, { flow_id: null, flow_name: 'Old drip' }), true), /<span class="jh-flow">Old drip \(gelöscht\)<\/span>/);
  });
  test('what a person typed is text: a deal\'s title, a step\'s title, a workflow\'s name, a person\'s name, what Google said', () => {
    fill();
    const evil = '<img src=x onerror=alert(1)>';
    const rows = F.journeyHistoryListHtml([
      entry(1, { deal_title: evil, title: '"><script>alert(2)</script>', flow_name: '<b>bold</b>', status: 'failed', detail: 'rejected: <i>no</i>' }),
      entry(2, { event: 'flow', detail: 'renamed', title: evil, actor_name: '<u>Olga</u>', flow_name: '<b>bold</b>' }),
      entry(3, { event: 'ended', status: 'stopped', detail: '<s>why</s>' }),
      entry(4, { event: evil, detail: evil })], true);
    assert.doesNotMatch(rows, /<img|<script|<b>bold|<u>|<i>|<s>/);
    assert.match(rows, /<b>&lt;img src=x onerror=alert\(1\)&gt;<\/b>/); assert.match(rows, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/); assert.match(rows, /<span class="jh-flow">&lt;b&gt;bold&lt;\/b&gt;<\/span>/);
    assert.match(rows, /<b>&lt;u&gt;Olga&lt;\/u&gt;<\/b> renamed the workflow to &quot;&lt;img src=x onerror=alert\(1\)&gt;&quot;/);
    assert.equal(count(rows, '<li class="jh-row'), 4);
    assert.equal(F.journeyHistoryListHtml(null, true), ''); assert.equal(F.journeyHistoryListHtml([], false), '');
  });
  test('the buttons that narrow the list: everything first, the one that is chosen pressed', () => {
    fill();
    const bar = F.journeyHistoryGroupsHtml('');
    assert.deepEqual([...bar.matchAll(/data-jh-group="([a-z]*)" aria-pressed="(true|false)">([^<]+)</g)].map(m => m.slice(1).join('|')),
      ['|true|All', 'steps|false|Steps', 'deals|false|Deals entering and leaving', 'flow|false|Changes to the workflow']);
    assert.match(bar, /^<button type="button" class="chip on" data-jh-group=""/);
    assert.match(F.journeyHistoryGroupsHtml('deals'), /<button type="button" class="chip on" data-jh-group="deals" aria-pressed="true">/);
    assert.equal(count(F.journeyHistoryGroupsHtml('deals'), 'chip on'), 1);
    F.__set('currentLang', 'de');
    assert.deepEqual([...F.journeyHistoryGroupsHtml('').matchAll(/>([^<]+)<\/button>/g)].map(m => m[1]), ['Alles', 'Schritte', 'Deals, die hinzukommen und ausscheiden', 'Änderungen am Workflow']);
  });
});

describe('the window', () => {
  const page = (ids, more = false) => ({ entries: ids.map(id => entry(id)), more });
  test('the whole workspace: asked for when it opens, newest first as the server gives it, each entry with its workflow', async () => {
    fill({ answer: page([9, 8, 7]) });
    F.openJourneyHistory();
    const m = modal();
    assert.equal(m.title, 'History of the workflows'); assert.equal(m.size, 'lg');
    assert.match(m.body, /<ul class="jh-list wide" id="jh-abc1234-list" hidden><\/ul>/);
    assert.match(m.body, /<p class="jh-note" id="jh-abc1234-note" role="status">Loading …<\/p>/);
    assert.match(m.body, /<button type="button" class="btn btn-secondary btn-sm jh-more" id="jh-abc1234-more" data-jh-more hidden>Load more<\/button>/);
    assert.match(m.body, /<input class="input jh-q" id="jh-abc1234-q" type="search" maxlength="100" autocomplete="off" placeholder="Search for a deal, a step or a workflow" aria-label="Search for a deal, a step or a workflow" data-jh-q>/);
    assert.match(m.body, /<p class="help">Every step, every deal that was taken in or let go, and every change to a workflow is written down here\. It stays when the workflow or the deal is deleted\.<\/p>/);
    assert.doesNotMatch(m.body, /Everything that happened/, 'no heading where nothing stands above the list');
    assert.match(m.footer, /data-close autofocus>Close</);
    await flush();
    assert.deepEqual(asked(), ['/api/journey/history?limit=50']);
    assert.equal(count(part('list').innerHTML, '<li class="jh-row'), 3); assert.equal(count(part('list').innerHTML, 'class="jh-flow">New lead<'), 3);
    assert.deepEqual([part('list').hidden, part('note').hidden, part('note').textContent, part('more').hidden], [false, true, '', true]);
  });
  test('a workflow\'s "Activity": what waits now on top, and under it everything that happened in that workflow', async () => {
    fill({ answer: url => (url.includes('/activity') ? { counts: { waiting: 1, done: 4 }, waiting: [{ deal_title: 'Haus 1', due_at: AT, kind: 'email', title: 'Second mail' }] } : page([5, 4])) });
    await F.openJourneyActivity();
    const m = modal();
    assert.equal(m.title, 'Activity: New lead');
    assert.match(m.body, /^<div class="jr-act">\s*<p class="jr-act-counts">1 waiting, 4 finished, 0 stopped<\/p>/);
    assert.match(m.body, /<b>Haus 1<\/b><span>Email: Second mail<\/span>/);
    assert.ok(m.body.indexOf('jr-act-counts') < m.body.indexOf('<h3 class="jr-act-head">Everything that happened</h3>') && m.body.indexOf('Everything that happened') < m.body.indexOf('jh-list'));
    assert.match(m.body, /<ul class="jh-list" id="jh-abc1234-list" hidden>/, 'one workflow: its name is not repeated on every entry');
    await flush();
    assert.deepEqual(asked(), ['/api/journey/flows/10/activity', '/api/journey/history?flow_id=10&limit=50']);
    assert.equal(count(part('list').innerHTML, '<li class="jh-row'), 2); assert.doesNotMatch(part('list').innerHTML, /jh-flow/);
    fill({ answer: { error: 'Not found', code: 'not_found' } });
    assert.equal(await F.openJourneyActivity(), null);
    assert.deepEqual([F.__page().log.filter(c => c[0] === 'modal').length, F.__page().log.find(c => c[0] === 'toast')[1], asked().length], [0, 'This no longer exists.', 1], 'a workflow that is gone opens nothing and asks for no record');
  });
  test('a deal\'s "Workflow history": everything the workflows did with that deal, each entry with its workflow', async () => {
    fill({ answer: page([3]) });
    F.openJourneyDealHistory('60', 'Wohnung 3');
    assert.equal(modal().title, 'Workflow history: Wohnung 3');
    assert.match(modal().body, /<ul class="jh-list wide"/);
    await flush();
    assert.deepEqual(asked(), ['/api/journey/history?deal_id=60&limit=50']);
    fill({ lang: 'de', answer: page([3]) });
    F.openJourneyDealHistory(60, 'Wohnung 3');
    assert.equal(modal().title, 'Workflow-Protokoll: Wohnung 3');
  });
  test('narrowing: the pressed button changes and the list is asked for again; pressing what is pressed asks nothing', async () => {
    fill({ answer: page([9, 8]) });
    F.openJourneyHistory({ flowId: 10 });
    await flush();
    F.__opt('answer', page([6]));
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'deals' } });
    assert.deepEqual(F.__page().groups.map(b => [b.dataset.jhGroup, b.on, b.pressed].join('|')), ['|false|false', 'steps|false|false', 'deals|true|true', 'flow|false|false']);
    await flush();
    assert.deepEqual(asked(), ['/api/journey/history?flow_id=10&limit=50', '/api/journey/history?flow_id=10&group=deals&limit=50']);
    assert.equal(count(part('list').innerHTML, '<li class="jh-row'), 1, 'the list is the new answer, not added to the old one');
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'deals' } });
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'weather' } });
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'constructor' } });
    await flush();
    assert.equal(asked().length, 2);
    press('click [data-jh-group]', {}, { dataset: { jhGroup: '' } });
    await flush();
    assert.equal(asked().at(-1), '/api/journey/history?flow_id=10&limit=50', '"All" sends no group again');
    assert.equal(F.__page().groups[0].pressed, 'true');
  });
  test('searching: asked for once the typing pauses, with what stands in the field then', async () => {
    fill({ answer: page([9]) });
    F.openJourneyHistory();
    await flush();
    press('input [data-jh-q]', {}, { value: 'W' });
    press('input [data-jh-q]', {}, { value: 'Wo' });
    press('input [data-jh-q]', {}, { value: '  Wohnung 3 ' });
    assert.equal(asked().length, 1, 'nothing is asked while the person types');
    assert.deepEqual(F.__tick(), [300], 'one question waits; the two before it were dropped');
    await flush();
    assert.deepEqual(asked().slice(1), ['/api/journey/history?q=Wohnung+3&limit=50']);
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'steps' } });
    await flush();
    assert.equal(asked().at(-1), '/api/journey/history?group=steps&q=Wohnung+3&limit=50', 'narrowing keeps the search');
    press('input [data-jh-q]', {}, { value: '' });
    F.__tick(); await flush();
    assert.equal(asked().at(-1), '/api/journey/history?group=steps&limit=50', 'an emptied field searches for nothing');
  });
  test('"Load more" asks for what is older than the last entry and adds it; it goes when there is no more', async () => {
    fill({ answer: page([9, 8, 7], true) });
    F.openJourneyHistory({ dealId: 60 });
    await flush();
    assert.equal(part('more').hidden, false);
    F.__opt('answer', page([6, 5], true));
    press('click [data-jh-more]');
    assert.equal(part('more').disabled, true, 'not pressed twice while it is asked');
    await flush();
    assert.equal(asked().at(-1), '/api/journey/history?deal_id=60&before=7&limit=50');
    assert.deepEqual([count(part('list').innerHTML, '<li class="jh-row'), part('more').hidden, part('more').disabled], [5, false, false]);
    F.__opt('answer', page([4], false));
    press('click [data-jh-more]');
    await flush();
    assert.equal(asked().at(-1), '/api/journey/history?deal_id=60&before=5&limit=50');
    assert.deepEqual([count(part('list').innerHTML, '<li class="jh-row'), part('more').hidden], [6, true]);
    F.__opt('answer', page([3, 2], true));
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'steps' } });
    await flush();
    assert.equal(asked().at(-1), '/api/journey/history?deal_id=60&group=steps&limit=50', 'a new question starts from the newest again');
  });
  test('an empty record says so — and says something else when a search or a filter found nothing', async () => {
    fill();
    F.openJourneyHistory();
    await flush();
    assert.deepEqual([part('list').hidden, part('note').hidden, part('note').textContent, part('note').classes.bad, part('more').hidden], [true, false, 'Nothing has been recorded yet.', false, true]);
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'flow' } });
    await flush();
    assert.equal(part('note').textContent, 'Nothing matches.');
    fill({ lang: 'de' });
    F.openJourneyHistory();
    await flush();
    assert.equal(part('note').textContent, 'Noch ist nichts festgehalten.');
  });
  test('a refusal and a request that never arrived are said in the window, which stays open', async () => {
    fill({ answer: { error: 'x', code: 'history' } });
    F.openJourneyHistory();
    await flush();
    assert.deepEqual([part('note').textContent, part('note').hidden, part('note').classes.bad, part('list').hidden], ['This search cannot be answered. Change it and try again.', false, true, true]);
    assert.ok(!F.__page().log.some(c => c[0] === 'close' || c[0] === 'toast'));
    fill({ answer: 'offline' });
    F.openJourneyHistory();
    await flush();
    assert.equal(part('note').textContent, 'That did not work. Please try again.');
    fill({ answer: { success: true } });   // an answer that is no list
    F.openJourneyHistory();
    await flush();
    assert.deepEqual([part('note').classes.bad, part('list').hidden], [true, true]);
  });
  test('a new question that fails clears what answered the old one; "Load more" that fails keeps the list and can be pressed again', async () => {
    fill({ answer: page([9, 8], true) });
    F.openJourneyHistory();
    await flush();
    F.__opt('answer', 'offline');
    press('click [data-jh-more]');
    await flush();
    assert.deepEqual([count(part('list').innerHTML, '<li class="jh-row'), part('list').hidden, part('more').hidden, part('more').disabled, part('note').classes.bad], [2, false, false, false, true]);
    F.__opt('answer', page([7], false));
    press('click [data-jh-more]');
    await flush();
    assert.deepEqual([asked().at(-1), count(part('list').innerHTML, '<li class="jh-row'), part('note').hidden], ['/api/journey/history?before=8&limit=50', 3, true]);
    F.__opt('answer', { error: 'x', code: 'history' });
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'steps' } });
    await flush();
    assert.deepEqual([part('list').innerHTML, part('list').hidden, part('more').hidden], ['', true, true], 'the entries on show answered another question');
  });
  test('an answer that comes after a newer question was asked is dropped; so is one for a window that is closed', async () => {
    const waiting = [];
    fill({ answer: () => new Promise(resolve => waiting.push(resolve)) });
    F.openJourneyHistory();
    await flush();
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'steps' } });
    await flush();
    assert.equal(waiting.length, 2);
    waiting[1](page([5]));            // the newer question is answered first …
    await flush();
    waiting[0](page([9, 8, 7]));      // … then the older one
    await flush();
    assert.equal(count(part('list').innerHTML, '<li class="jh-row'), 1, 'the list is the answer to what was asked last');
    press('click [data-jh-group]', {}, { dataset: { jhGroup: 'flow' } });
    await flush();
    F.__opt('connected', false);
    waiting[2](page([3, 2]));
    await flush();
    assert.equal(count(part('list').innerHTML, '<li class="jh-row'), 1, 'a closed window is not written into');
  });
  test('the page\'s header has the record\'s button for everyone, between the email address and "New workflow"', () => {
    fill({ manage: false, flows: [], shown: null });
    assert.equal(F.journeyHistoryButtonHtml(), '<button type="button" class="btn btn-ghost btn-sm" onclick="openJourneyHistory()"><svg class="ic " aria-hidden="true"><use href="#i-list"/></svg><span>History</span></button>');
    F.renderJourney();
    assert.equal(F.__page().els['journey-actions'].innerHTML, F.journeyHistoryButtonHtml(), 'a member, and a workspace without a workflow: the record of deleted ones is still there to read');
    fill({ manage: true, flows: [], shown: null });
    F.renderJourney();
    const bar = F.__page().els['journey-actions'].innerHTML;
    assert.ok(bar.indexOf('openJourneyHistory()') >= 0 && bar.indexOf('openJourneyHistory()') < bar.indexOf('journeyNameWindow(null)'));
    fill({ lang: 'de' });
    assert.match(F.journeyHistoryButtonHtml(), /<span>Protokoll<\/span>/);
  });
});

describe('the look', () => {
  test('the list scrolls inside the window; an entry is its time and its line, with its workflow beside it in the wide list', () => {
    assert.match(css, /^\.jh-list \{ list-style: none; margin: 0; padding: 0; max-height: 46vh; overflow: auto;/m);
    assert.match(css, /^\.jh-row \{ display: grid; grid-template-columns: 132px minmax\(0, 1fr\);/m);
    assert.match(css, /^\.jh-list\.wide \.jh-row \{ grid-template-columns: 132px minmax\(0, 1fr\) minmax\(0, 190px\); \}$/m);
    assert.match(css, /^\.jh-row\.bad \.jh-what \{ color: var\(--danger\); \}$/m);
    assert.match(css, /^\.jh-note \{[^}]*\} \.jh-note\.bad \{ color: var\(--danger\); font-weight: 600; \}$/m);
  });
  test('the search field takes the room beside the buttons: its rule comes after the one that makes every field full width', () => {
    assert.match(css, /^\.jh-q \{ flex: 1 1 220px; min-width: 0; width: auto; \}$/m);
    assert.ok(css.indexOf('\n.input, .select, .textarea { width: 100%;') > 0 && css.indexOf('\n.input, .select, .textarea { width: 100%;') < css.indexOf('\n.jh-q {'));
  });
  test('the list, the note and "Load more" are hidden by the attribute alone: nothing of theirs outweighs it', () => {
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m);
    const own = css.slice(css.indexOf('\n.jh {'), css.indexOf('\n', css.indexOf('@media (max-width: 640px) { .jh-row')));
    assert.ok(own.length > 600 && own.length < 3000, 'the record\'s own rules');
    assert.doesNotMatch(own, /!important/);
    assert.doesNotMatch(css, /\.jh\s*>\s*\*|\.jh-list\s*>\s*\*/);
    assert.match(css, /^\.chip:hover \{[^}]*\} \.chip\.on \{/m, 'the pressed button\'s look is the one the app has');
  });
});
