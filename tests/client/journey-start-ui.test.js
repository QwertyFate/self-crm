// CLIENT (static + pure-function) tests for the start of a workflow (public/js/journey-start.js,
// CUSTOMER_JOURNEY_CHANGES Part 9, 2026-11-19): everything that can set a workflow off, sorted by what it is about.
//
// Pinned: the starts and their categories are the server's own; the window shows the categories as tabs and only the
// open one's starts, each with what it means; choosing a start shows that start's settings and nothing else; what is
// sent is only what the chosen start uses; every start survives the round trip saved → window → saved; what is
// missing is said in the window and nothing is sent; a member, and everyone while the workflow runs, reads the start;
// names from the settings are text, never markup; every word is in both dictionaries.
//
// Part 13 (2026-11-19): where a workflow ENDS for a deal is one list of rules — the two stage rules and the server's
// fifteen others, each a tick with a sentence and, under a ticked one, what it needs. Two tests of that block hold
// the page and the server's half of Part 13 (utils/journey-ends.js) together: the lists, and what is saved.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const server = require('../../utils/journey-triggers');

const html = read('public/index.html');
const core = read('public/js/core.js');
const page = read('public/js/journey.js');
const js   = read('public/js/journey-start.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;
const constOf = name => new Function(`${sliceConst('public/js/journey-start.js', name)} return ${name};`)();
const TRIGGERS = constOf('JOURNEY_TRIGGERS');

const CONSTS = ['JOURNEY_CATEGORIES', 'JOURNEY_CAT_KEYS', 'JOURNEY_CAT_ICONS', 'JOURNEY_TRIGGERS', 'JOURNEY_RESULT_KEYS', 'JOURNEY_DOC_KEYS', 'JOURNEY_URGENCY_KEYS', 'JOURNEY_DAY_KEYS', 'JOURNEY_START_MAX', 'JOURNEY_STOP_ON_KEYS',
  'JOURNEY_STAGE_RULES', 'JOURNEY_STOP_GROUPS', 'JOURNEY_STOP_HEADS', 'JOURNEY_STOP_USES', 'JOURNEY_STOP_ICONS', 'JOURNEY_STOP_TITLES', 'JOURNEY_STOP_HINTS', 'JOURNEY_STOP_PARTS'];
const PAGE_FNS = ['journeySend', 'journeyWaitText', 'journeyPipelines', 'journeyFlow', 'journeyStageName', 'journeyWindow', 'journeyStageOptions', 'journeyBoxView', 'journeyErrorText'];
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  sliceFn(core, 't', 'core.js'),
  sliceFn(core, 'tf', 'core.js'),
  sliceFn(core, 'icon', 'core.js'),
  sliceConst('public/js/journey.js', 'JOURNEY_ERRORS'),
  page.match(/^const journeyOption = .*$/m)[0],
  ...CONSTS.map(n => sliceConst('public/js/journey-start.js', n)),
  'const JOURNEY_STOP_MAX = 20;',
  ...['journeyStartUses', 'journeyStartHours', 'journeyStartDays'].map(n => js.match(new RegExp(`^const ${n} = .*$`, 'm'))[0]),
  ...PAGE_FNS.map(n => sliceFn(page, n, 'journey.js')),
  `const __log = [];
   let __answers = {}, __unsaved = true, __throw = false, __lists = {};
   const __fields = {}, __handlers = {};
   const __answer = (verb, url, body) => { __log.push(body === undefined ? [verb, url] : [verb, url, body]); if (__throw) throw new Error('offline'); return __answers[verb + ' ' + url]; };
   const api = { get: async url => __answer('get', url), put: async (url, b) => __answer('put', url, b) };
   const __field = part => (__fields[part] ||= { value: '', hidden: null, innerHTML: '', textContent: '', focused: 0, focus() { this.focused++; } });
   const ui = {
     modal: opts => { __log.push(['modal', opts]); return { el: { querySelector: sel => __field(sel.replace(/^#jr-[a-z0-9]+-/, '')), querySelectorAll: sel => __lists[sel] || [] }, close() { __log.push(['close']); } }; },
     toast: m => __log.push(['toast', m]),
   };
   function on(_root, type, selector, fn) { __handlers[type + ' ' + selector] = fn; }
   const uid = () => 'abc1234';
   function dvConfirmUnsaved() { __log.push(['unsaved?']); return __unsaved; }
   function journeyApply(flow) { __log.push(['apply', flow]); }
   function __reset(answers = {}) { __log.length = 0; __answers = answers; __unsaved = true; __throw = false; __lists = {}; for (const o of [__fields, __handlers]) for (const k of Object.keys(o)) delete o[k]; }
   function __fill(values) { for (const k of Object.keys(values)) __field(k).value = values[k]; }
   function __list(sel, items) { __lists[sel] = items; }
   function __opt(k, v) { if (k === 'unsaved') __unsaved = v; else if (k === 'throw') __throw = v; }
   function __page() { return { log: __log, fields: __fields, handlers: __handlers }; }
   function __state() { return { journeyDealFields, journeyContactFields }; }`,
].join('\n');
const NAMES = ['resetJourneyStart', 'loadJourneyStart', 'journeyStartFields', 'journeyStartLines', 'journeyStartChooserHtml', 'journeyStartFieldOptions', 'journeyStartState', 'journeyStartShown', 'journeyStartConfig', 'journeyStopGroup', 'journeyStopDetail', 'journeyStopSummaryHtml', 'journeyStopTabsHtml', 'journeyStopHtml', 'openJourneyStart'];
const F = loadFns('public/js/journey-start.js', NAMES, {
  state: { currentLang: 'en', pipelines: [], journeyFlows: [], journeyWebhooks: [], journeyManage: false, journeyLimits: { flows: 20, nodes: 60 }, journeyFlowId: null, journeyDealFields: [], journeyContactFields: [] },
  extra, expose: ['__reset', '__fill', '__list', '__opt', '__page', '__state'],
});

const SALES = { id: 3, name: 'Sales', stages: [{ id: 31, name: 'New' }, { id: 32, name: 'Booked' }] };
const RENT  = { id: 4, name: 'Rentals', stages: [{ id: 41, name: 'Enquiry' }] };
const HOOKS = [{ id: 5, name: 'Website form' }, { id: 6, name: 'Meta Ads' }];
const DEAL_FIELDS = [{ field_key: 'finanzierung', name: 'Finanzierung', type: 'text' }, { field_key: 'einzug', name: 'Einzug', type: 'date' }, { field_key: 'frist', name: 'Frist', type: 'date' }];
const CONTACT_FIELDS = [{ field_key: 'kundenstatus', name: 'Kundenstatus', type: 'text' }];
const BASE = { trigger: null, webhook_ids: null, stage_id: null, stop_stage_ids: [] };
const startBox = (config = {}) => ({ id: 20, kind: 'start', title: '', body: '', wait_minutes: 0, config: { ...BASE, ...config }, next_id: null });
const FLOW = { id: 10, name: 'Nurture', active: false, nodes: [startBox()] };
const OTHER = { id: 11, name: 'After the viewing', active: true, nodes: [{ ...startBox({ trigger: 'manual' }), id: 21 }] };
function fill({ manage = true, lang = 'en', flows = [FLOW, OTHER], shown = 10, list = [SALES, RENT], hooks = HOOKS, deal = DEAL_FIELDS, contact = CONTACT_FIELDS, answers = {} } = {}) {
  F.__reset(answers);
  F.__set('currentLang', lang); F.__set('pipelines', list); F.__set('journeyFlows', flows); F.__set('journeyWebhooks', hooks); F.__set('journeyManage', manage); F.__set('journeyFlowId', shown);
  F.__set('journeyDealFields', deal); F.__set('journeyContactFields', contact);
}
const lines = config => F.journeyStartLines(startBox(config));
const modal = () => F.__page().log.filter(c => c[0] === 'modal').map(c => c[1]).at(-1);
// What a browser's form holds for a start as the window can show it: text in the fields, and in each list of ticks the
// ones that are ticked (the stand-in page builds no elements from the markup, so the test puts them there).
function form(s) {
  F.__fill(Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string')));
  for (const [sel, ticked] of [['[data-jr-wh]', s.webhooks], ['[data-jt-day]', s.weekdays], ['[data-jt-end]', s.ends], ['[data-jt-arrive]', s.arrive], ['[data-jt-leave]', s.leave], ['[data-jt-res]', s.endresults]]) {
    F.__list(sel, ticked.map(v => ({ value: String(v), checked: true })));
  }
}
// The start's window, opened on a saved start by an owner whose workflow is off.
function open(config, state = {}) {
  fill({ flows: [{ ...FLOW, nodes: [startBox(config)] }, OTHER], ...state });
  form(F.journeyStartShown(F.journeyStartState({ ...BASE, ...config }), 10));
  return F.openJourneyStart(startBox(config));
}
// every start with settings that are complete, as the server saves them (without the zone, which the server stamps)
const EVERY = { lead: { webhook_ids: [5] }, deal_manual: {}, deal_import: {}, deal_new: {}, stage: { stage_id: 31 }, stage_left: { stage_id: 32 }, assigned: {}, urgency: { min_urgency: 3 },
  deal_field: { field_key: 'finanzierung', value: 'ja' }, manual: {}, contact_field: { field_key: 'kundenstatus' }, document: { doc_type: 'vertrag' }, call_result: { result: 'not_reached' }, call_inbound: {},
  meeting_booked: {}, meeting_moved: {}, meeting_cancelled: {}, meeting_before: { hours: 24 }, meeting_after: { hours: 2 }, notetaker: {}, task_done: {}, task_overdue: {}, stage_days: { stage_id: 31, days: 3 },
  quiet_days: { days: 14 }, date_field: { field_key: 'einzug', offset_days: -7, at: '08:30' }, schedule: { stage_id: 41, weekdays: [1, 3], at: '09:00' }, opt_out: {}, onboarding_done: {}, flow_done: { flow_id: 11 } };

describe('the starts are the server\'s own', () => {
  test('the same starts, each in the same category with the same settings', () => {
    assert.deepEqual(Object.keys(TRIGGERS), Object.keys(server.TRIGGERS), 'the same starts in the same order');
    for (const key of Object.keys(TRIGGERS)) assert.deepEqual({ cat: TRIGGERS[key].cat, uses: TRIGGERS[key].uses }, server.TRIGGERS[key], key);
    assert.deepEqual(constOf('JOURNEY_CATEGORIES'), server.CATEGORIES);
    assert.deepEqual(Object.keys(EVERY).sort(), Object.keys(TRIGGERS).sort(), 'this file tries every start');
  });
  test('the results of a call, the kinds of document and the limits too', () => {
    assert.deepEqual(Object.keys(constOf('JOURNEY_RESULT_KEYS')), server.RESULTS);
    assert.deepEqual(Object.keys(constOf('JOURNEY_DOC_KEYS')), server.DOC_TYPES);
    assert.deepEqual(constOf('JOURNEY_START_MAX'), { hours: server.MAX_HOURS, days: server.MAX_DAYS, value: server.MAX_VALUE });
    assert.deepEqual(Object.keys(constOf('JOURNEY_URGENCY_KEYS')).map(Number), [1, 2, 3, 4]);
    assert.equal(server.MAX_URGENCY, 4);
  });
  test('what the server saves from the window\'s values is what the window sent — for every start', () => {
    fill();
    for (const [trigger, more] of Object.entries(EVERY)) {
      const sent = F.journeyStartConfig(F.journeyStartState({ ...BASE, trigger, ...more, pipeline_id: 3, stop_stage_ids: [32] }));
      assert.equal(sent.error, undefined, trigger);
      const saved = server.checkStart(sent.config, { tz: 'Europe/Berlin' });
      assert.equal(saved.code, undefined, `${trigger}: the server takes it`);
      const { tz, ...config } = saved.config;
      assert.deepEqual(config, { ...BASE, trigger, ...more, pipeline_id: 3, stop_stage_ids: [32] }, trigger);
    }
  });
  test('every category has its name, and its icon is in the sprite', () => {
    const icons = constOf('JOURNEY_CAT_ICONS'), keys = constOf('JOURNEY_CAT_KEYS');
    for (const cat of server.CATEGORIES) { assert.ok(dict.en[keys[cat]] && dict.de[keys[cat]], cat); assert.ok(html.includes(`<symbol id="i-${icons[cat]}"`), `icon of ${cat}`); }
  });
});

describe('markup and wiring', () => {
  test('the script is loaded once, after the page\'s own', () => {
    assert.equal(count(html, '<script src="js/journey-start.js"></script>'), 1);
    assert.ok(html.indexOf('<script src="js/journey.js">') < html.indexOf('<script src="js/journey-start.js">'));
  });
  test('the page reads the fields with everything else, forgets them at logout, and its boxes ask this file what a start says', () => {
    assert.match(sliceFn(page, 'loadJourney', 'journey.js'), /typeof loadJourneyStart === 'function' \? loadJourneyStart\(\) : null\]\);/);
    assert.match(sliceFn(page, 'resetJourneyUI', 'journey.js'), /if \(typeof resetJourneyStart === 'function'\) resetJourneyStart\(\);/);
    assert.match(sliceFn(page, 'journeyBoxHtml', 'journey.js'), /journeyStartLines\(node\)/);
    assert.match(sliceFn(page, 'openJourneyBox', 'journey.js'), /if \(node && node\.kind === 'start'\) return openJourneyStart\(node\);/);
    assert.equal(count(page, 'function journeyStartLines('), 0, 'one place says what a start is');
    assert.equal(count(page, 'function openJourneyStart('), 0);
  });
  test('the server\'s refusals of a start have their sentences on the page', () => {
    const errors = new Function(`${sliceConst('public/js/journey.js', 'JOURNEY_ERRORS')} return JOURNEY_ERRORS;`)();
    for (const code of ['start', 'stage', 'webhooks', 'field', 'pipeline', 'flow', 'loop']) { assert.ok(dict.en[errors[code]] && dict.de[errors[code]], code); assert.notEqual(errors[code], 'jr_err_generic', code); }
  });
});

describe('both dictionaries', () => {
  const used = [...new Set([...js.matchAll(/'(jt_[a-z0-9_]+)'/g)].map(m => m[1]))];
  test('every key the file names exists in English and German, and none is left unused', () => {
    assert.ok(used.length >= 140, `the file's own keys (${used.length})`);
    for (const k of used) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jt_') && !used.includes(k)), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jt_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jt_')).sort());
    assert.ok(!used.some(k => k.endsWith('_')), 'no key is put together at run time');
  });
  test('every start has its title and its line of explanation, and no two starts read the same', () => {
    for (const lang of ['en', 'de']) {
      const titles = Object.values(TRIGGERS).map(x => dict[lang][x.title]), hints = Object.values(TRIGGERS).map(x => dict[lang][x.hint]);
      assert.ok(titles.every(Boolean) && hints.every(Boolean), lang);
      assert.equal(new Set(titles).size, titles.length, `${lang}: every title is its own`);
      assert.equal(new Set(hints).size, hints.length, `${lang}: every explanation is its own`);
    }
  });
  test('the same placeholders in both languages', () => {
    const holes = s => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const k of used) assert.equal(holes(dict.de[k]), holes(dict.en[k]), k);
  });
  test('German speaks to nobody in particular, and nothing says "journey"', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jt_'))) {
      assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
      assert.doesNotMatch(dict.de[k] + dict.en[k], /journey/i, k);
    }
  });
  test('the words the old start had are gone, so nothing says two things — and those of the one stage list of Part 10', () => {
    for (const k of ['jr_start_lead', 'jr_start_lead_all', 'jr_start_stage', 'jr_f_trigger', 'jr_f_from', 'jr_opt_from_all', 'jr_f_start_stage', 'jr_f_stop', 'jr_stops', 'jr_title_start', 'jr_err_pick_webhook',
      'jt_opt_stop_never', 'jt_opt_stop_arrive', 'jt_opt_stop_leave', 'jt_f_stop_on']) {
      assert.equal(dict.en[k], undefined, k); assert.equal(dict.de[k], undefined, k);
    }
  });
});

describe('what a start says on its box', () => {
  test('nothing chosen: an invitation for an owner or admin, a plain fact for a member', () => {
    fill({ manage: true });
    assert.deepEqual(lines(), ['Choose what starts this workflow']);
    fill({ manage: false });
    assert.deepEqual(lines(), ['No start chosen yet']);
  });
  test('its title first — for every start', () => {
    fill();
    for (const key of Object.keys(TRIGGERS)) assert.equal(lines({ trigger: key, ...EVERY[key] })[0], dict.en[TRIGGERS[key].title], key);
    assert.deepEqual(lines({ trigger: 'something_new' }), ['something_new'], 'a start a newer server knows: its own word');
  });
  test('a lead webhook: every one, the chosen ones by name, or one that is gone', () => {
    fill();
    assert.deepEqual(lines({ trigger: 'lead' }), ['A lead arrives through a lead webhook', 'Every lead webhook']);
    assert.deepEqual(lines({ trigger: 'lead', webhook_ids: [6, 5, 404] }), ['A lead arrives through a lead webhook', 'Only: Meta Ads, Website form']);
    assert.deepEqual(lines({ trigger: 'lead', webhook_ids: [404] })[1], 'A lead webhook that no longer exists');
  });
  test('a stage by its name; days and hours; the level; the result; the document; the other workflow', () => {
    fill();
    assert.deepEqual(lines({ trigger: 'stage', stage_id: 31 }), ['A deal arrives in a stage', 'Stage: New (Sales)']);
    assert.deepEqual(lines({ trigger: 'stage_left', stage_id: 999 })[1], 'Stage: a stage that no longer exists');
    assert.deepEqual(lines({ trigger: 'stage_days', stage_id: 41, days: 3 }), ['A deal has been in a stage for some days', 'Stage: Enquiry (Rentals)', '3 days']);
    assert.deepEqual(lines({ trigger: 'quiet_days', days: 1 })[1], '1 day');
    assert.deepEqual(lines({ trigger: 'meeting_before', hours: 24 }), ['Some hours before a meeting', '24 hours']);
    assert.deepEqual(lines({ trigger: 'meeting_after', hours: 1 })[1], '1 hour');
    assert.deepEqual(lines({ trigger: 'urgency' }), ['A deal\'s urgency changes'], 'every change: nothing more to say');
    assert.deepEqual(lines({ trigger: 'urgency', min_urgency: 3 })[1], 'From "High" up');
    assert.deepEqual(lines({ trigger: 'call_result', result: 'not_reached' })[1], 'Result: Not reached after the last try');
    assert.deepEqual(lines({ trigger: 'document' }), ['A document is uploaded to a contact']);
    assert.deepEqual(lines({ trigger: 'document', doc_type: 'vertrag' })[1], 'Only: Contract');
    assert.deepEqual(lines({ trigger: 'flow_done', flow_id: 11 })[1], 'After: After the viewing');
    assert.deepEqual(lines({ trigger: 'flow_done', flow_id: 99 })[1], 'After: a workflow that no longer exists');
  });
  test('a field by its name — a deal field, a contact field — and the value it has to become', () => {
    fill();
    assert.deepEqual(lines({ trigger: 'deal_field', field_key: 'finanzierung', value: 'ja' }), ['A deal field changes', 'Field: Finanzierung', 'Becomes: ja']);
    assert.deepEqual(lines({ trigger: 'contact_field', field_key: 'kundenstatus' }), ['A contact field changes', 'Field: Kundenstatus']);
    assert.deepEqual(lines({ trigger: 'contact_field', field_key: 'finanzierung' })[1], 'Field: a field that no longer exists', 'a deal field is no contact field');
    assert.deepEqual(lines({ trigger: 'date_field', field_key: 'einzug', offset_days: 0, at: '09:00' }), ['A date in a deal field is reached', 'Field: Einzug', 'On the day, at 09:00']);
    assert.deepEqual(lines({ trigger: 'date_field', field_key: 'einzug', offset_days: -7, at: '08:30' })[2], '7 days before, at 08:30');
    assert.deepEqual(lines({ trigger: 'date_field', field_key: 'einzug', offset_days: 30, at: '08:30' })[2], '30 days after, at 08:30');
    assert.deepEqual(lines({ trigger: 'date_field', field_key: 'finanzierung', offset_days: 0, at: '09:00' })[1], 'Field: a field that no longer exists', 'a text field is no date');
  });
  test('weekdays and a time; the pipeline it is limited to; where it stops', () => {
    fill();
    assert.deepEqual(lines({ trigger: 'schedule', stage_id: 31, weekdays: [1, 3, 5], at: '09:00' }), ['On fixed weekdays', 'Stage: New (Sales)', 'Mon, Wed, Fri, at 09:00']);
    assert.deepEqual(lines({ trigger: 'meeting_booked', pipeline_id: 4, stop_stage_ids: [32] }), ['A meeting is booked', 'Only the pipeline Rentals', 'Stops when the deal reaches: Booked (Sales)']);
    assert.deepEqual(lines({ trigger: 'meeting_booked', pipeline_id: 99 }), ['A meeting is booked'], 'a pipeline that is gone is not named');
    assert.deepEqual(lines({ trigger: 'manual', stop_stage_ids: [998] })[1], 'Stops when the deal reaches: a stage that no longer exists');
  });
  test('settings that do not belong to the start are not said', () => {
    fill();
    assert.deepEqual(lines({ trigger: 'meeting_booked', stage_id: 31, hours: 5, days: 3, field_key: 'einzug', webhook_ids: [5], result: 'interested', flow_id: 11 }), ['A meeting is booked']);
  });
  test('in German', () => {
    fill({ lang: 'de' });
    assert.deepEqual(lines({ trigger: 'lead', stop_stage_ids: [32] }), ['Ein Lead kommt über einen Lead-Webhook', 'Jeder Lead-Webhook', 'Endet, wenn der Deal ankommt in: Booked (Sales)']);
    assert.deepEqual(lines({ trigger: 'schedule', stage_id: 31, weekdays: [1, 2], at: '09:00' })[2], 'Mo, Di, um 09:00');
    assert.deepEqual(lines({ trigger: 'urgency', min_urgency: 4 })[1], 'Ab „Sehr dringend“');
  });
});

describe('the chooser: categories as tabs, the starts of the open one as cards', () => {
  test('seven tabs in the server\'s order, the open one marked, each with its icon', () => {
    fill();
    const out = F.journeyStartChooserHtml('meetings', 'meeting_booked');
    assert.match(out, /^<div class="jt-cats" role="tablist" aria-label="What the start is about"><button type="button" role="tab" class="jt-cat" data-jt-cat="deals" aria-selected="false">/);
    assert.deepEqual([...out.matchAll(/data-jt-cat="([a-z]+)" aria-selected="(true|false)"/g)].map(m => [m[1], m[2]]),
      [['deals', 'false'], ['contacts', 'false'], ['calls', 'false'], ['meetings', 'true'], ['tasks', 'false'], ['time', 'false'], ['other', 'false']]);
    assert.match(out, /data-jt-cat="calls" aria-selected="false"><svg class="ic " aria-hidden="true"><use href="#i-phone"\/><\/svg><span>Calls \(fonio\)<\/span><\/button>/);
  });
  test('only the open category\'s starts, each with its title and what it means; the chosen one marked', () => {
    fill();
    const out = F.journeyStartChooserHtml('meetings', 'meeting_booked');
    assert.deepEqual([...out.matchAll(/data-jt-trig="([a-z_]+)" aria-checked="(true|false)"/g)].map(m => [m[1], m[2]]),
      [['meeting_booked', 'true'], ['meeting_moved', 'false'], ['meeting_cancelled', 'false'], ['meeting_before', 'false'], ['meeting_after', 'false'], ['notetaker', 'false']]);
    assert.match(out, /<button type="button" role="radio" class="jt-trig" data-jt-trig="meeting_before" aria-checked="false"><b>Some hours before a meeting<\/b><span>For a reminder\. A meeting that is moved is reminded again\.<\/span><\/button>/);
    assert.match(out, /<div class="jt-trigs" role="radiogroup" aria-label="The starts of this kind">/);
    assert.doesNotMatch(F.journeyStartChooserHtml('deals', 'meeting_booked'), /aria-checked="true"/, 'another category is open: the chosen start is not among its cards');
  });
  test('every start is on exactly one tab', () => {
    fill();
    const seen = [];
    for (const cat of server.CATEGORIES) seen.push(...[...F.journeyStartChooserHtml(cat, '').matchAll(/data-jt-trig="([a-z_]+)"/g)].map(m => m[1]));
    assert.deepEqual(seen, Object.keys(TRIGGERS));
    assert.equal(F.journeyStartChooserHtml('nowhere', '').includes('data-jt-trig'), false);
  });
  test('in German', () => {
    fill({ lang: 'de' });
    const out = F.journeyStartChooserHtml('time', '');
    assert.match(out, /<span>Zeit<\/span>/);
    assert.match(out, /<b>An festen Wochentagen<\/b><span>Für jeden Deal, der zu dieser Zeit in einer Phase ist\.<\/span>/);
  });
});

describe('the window\'s values and what is sent', () => {
  test('a saved start as the window holds it: text in every field, the offset split into when and how many', () => {
    fill();
    assert.deepEqual(F.journeyStartState({ ...BASE }), { trigger: '', from: 'all', webhooks: [], stage: '', urgency: '', field: '', value: '', doc: '', result: '', hours: '', days: '', when: 'on', offset: '', at: '09:00', weekdays: [],
      flow: '', pipeline: '', ends: [], arrive: [], leave: [], endurgency: '', endfield: '', endvalue: '', endcfield: '', endcvalue: '', enddoc: '', endresults: [], enddays: '', endflow: '' });
    const s = F.journeyStartState({ ...BASE, trigger: 'date_field', field_key: 'einzug', offset_days: -7, at: '08:30', pipeline_id: 3, stop_stage_ids: [32] });
    assert.deepEqual([s.trigger, s.field, s.when, s.offset, s.at, s.pipeline, s.ends, s.arrive], ['date_field', 'einzug', 'before', '7', '08:30', '3', ['arrive'], [32]]);
    assert.deepEqual(F.journeyStartState({ ...BASE, trigger: 'lead', webhook_ids: [6, 5] }).webhooks, [5, 6]);
    assert.equal(F.journeyStartState({ ...BASE, trigger: 'lead', webhook_ids: [6, 5] }).from, 'some');
    assert.equal(F.journeyStartState({ ...BASE, trigger: 'something_new' }).trigger, '', 'a start this page does not know is not chosen');
    assert.equal(F.journeyStartState(null).trigger, '');
  });
  test('only what the chosen start uses is sent — values left over from another start stay behind', () => {
    fill();
    const leftovers = { from: 'some', webhooks: [5], stage: '31', urgency: '3', field: 'einzug', value: 'ja', doc: 'vertrag', result: 'interested', hours: '24', days: '3', when: 'before', offset: '7', at: '08:30', weekdays: [1], flow: '11',
      pipeline: '', ends: [], arrive: [31], leave: [32], endurgency: '2', endfield: 'einzug', endvalue: 'x', endcfield: 'kundenstatus', endcvalue: 'y', enddoc: 'vertrag', endresults: ['interested'], enddays: '9', endflow: '11' };
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'meeting_booked' }), { config: { trigger: 'meeting_booked', stop_stage_ids: [] } });
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'meeting_before' }), { config: { trigger: 'meeting_before', stop_stage_ids: [], hours: 24 } });
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'stage', pipeline: '4', ends: ['arrive'], arrive: [32] }), { config: { trigger: 'stage', stop_stage_ids: [32], pipeline_id: 4, stage_id: 31 } });
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'lead', from: 'all' }).config.webhook_ids, null, 'every lead webhook: the ticked ones are not sent');
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'date_field', when: 'on' }).config.offset_days, 0, 'on the day: no offset, whatever number is left in the field');
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'date_field', when: 'after' }).config.offset_days, 7);
    assert.deepEqual(F.journeyStartConfig({ ...leftovers, trigger: 'urgency', urgency: '' }).config, { trigger: 'urgency', stop_stage_ids: [] }, 'every change');
  });
  test('what is missing is said, with the field to put the cursor in — and nothing is a start without a start', () => {
    fill();
    const empty = F.journeyStartState({ ...BASE });
    const err = more => { const out = F.journeyStartConfig({ ...empty, ...more }); return [out.error, out.part]; };
    assert.deepEqual(err({}), ['jt_err_choose', 'chooser']);
    assert.deepEqual(err({ trigger: 'constructor' }), ['jt_err_choose', 'chooser']);
    assert.deepEqual(err({ trigger: 'lead', from: 'some' }), ['jt_err_pick_webhook', 'from']);
    assert.deepEqual(err({ trigger: 'stage' }), ['jt_err_stage', 'stage']);
    assert.deepEqual(err({ trigger: 'deal_field' }), ['jt_err_field', 'field']);
    assert.deepEqual(err({ trigger: 'call_result' }), ['jt_err_result', 'result']);
    for (const hours of ['', '0', '721', '1.5', '-3', 'x']) assert.deepEqual(err({ trigger: 'meeting_before', hours }), ['jt_err_hours', 'hours'], hours);
    for (const days of ['', '0', '366', 'x']) assert.deepEqual(err({ trigger: 'quiet_days', days }), ['jt_err_days', 'days'], days);
    assert.deepEqual(err({ trigger: 'stage_days', stage: '31', days: '' }), ['jt_err_days', 'days']);
    assert.deepEqual(err({ trigger: 'date_field', field: 'einzug', when: 'before', offset: '' }), ['jt_err_days', 'offset']);
    assert.deepEqual(err({ trigger: 'date_field', field: 'einzug', at: '9' }), ['jt_err_at', 'at']);
    assert.deepEqual(err({ trigger: 'schedule', stage: '31' }), ['jt_err_weekdays', 'weekdays']);
    assert.deepEqual(err({ trigger: 'flow_done' }), ['jt_err_flow', 'flow']);
    for (const key of ['jt_err_choose', 'jt_err_pick_webhook', 'jt_err_stage', 'jt_err_field', 'jt_err_result', 'jt_err_hours', 'jt_err_days', 'jt_err_at', 'jt_err_weekdays', 'jt_err_flow']) assert.ok(dict.en[key] && dict.de[key], key);
  });
  test('the fields a start chooses from: contact fields, deal fields that hold a date, or every deal field', () => {
    fill();
    assert.deepEqual(F.journeyStartFields('deal_field').map(f => f.field_key), ['finanzierung', 'einzug', 'frist']);
    assert.deepEqual(F.journeyStartFields('date_field').map(f => f.field_key), ['einzug', 'frist']);
    assert.deepEqual(F.journeyStartFields('contact_field').map(f => f.field_key), ['kundenstatus']);
    assert.equal(F.journeyStartFieldOptions('date_field', 'frist'), '<option value="">— choose —</option><option value="einzug">Einzug</option><option value="frist" selected>Frist</option>');
  });
});

describe('the start\'s window', () => {
  const hiddenParts = () => Object.entries(F.__page().fields).filter(([k, f]) => k.startsWith('w-') && f.hidden === false).map(([k]) => k.slice(2)).sort();
  const press = (what, ...args) => F.__page().handlers[what](...args);
  test('opens with what is saved: its title, the saved start\'s tab open and its card chosen, the settings filled in', () => {
    open({ trigger: 'stage_days', stage_id: 32, days: 3, pipeline_id: 3, stop_stage_ids: [31] });
    const m = modal();
    assert.equal(m.title, 'Start of the workflow');
    assert.equal(m.size, 'lg');
    assert.match(m.body, /<input type="hidden" id="jr-abc1234-trigger" value="stage_days">/);
    assert.match(m.body, /data-jt-cat="time" aria-selected="true"/);
    assert.match(m.body, /data-jt-trig="stage_days" aria-checked="true"/);
    assert.match(m.body, /id="jr-abc1234-stage"><option value="">— choose —<\/option><optgroup label="Sales"><option value="31">New<\/option><option value="32" selected>Booked<\/option>/);
    assert.match(m.body, /id="jr-abc1234-days" type="number" min="1" max="365" step="1" inputmode="numeric" value="3">/);
    assert.match(m.body, /id="jr-abc1234-pipeline"><option value="">Every pipeline<\/option><option value="3" selected>Sales<\/option><option value="4">Rentals<\/option>/);
    assert.match(m.body, /<b>The deal arrives in a stage<\/b><span>As soon as the deal is in one of the stages chosen here\.<\/span><\/span><input type="checkbox" class="switch" data-jt-end value="arrive" checked><\/label>/);
    assert.match(m.body, /<span class="jt-chipset-name">Sales<\/span><div class="jt-chips"><label class="jt-chip"><input type="checkbox" data-jt-arrive value="31" checked><span>New<\/span><\/label><label class="jt-chip"><input type="checkbox" data-jt-arrive value="32"><span>Booked<\/span>/);
    assert.doesNotMatch(m.body, /data-jt-end value="leave" checked|data-jt-leave value="\d+" checked/, 'the other stage rule is not ticked, nor a stage under it');
  });
  test('nothing chosen yet: the first tab is open, no card is chosen, and only the invitation to choose is shown', () => {
    open({});
    assert.match(modal().body, /data-jt-cat="deals" aria-selected="true"/);
    assert.doesNotMatch(modal().body, /aria-checked="true"/);
    assert.deepEqual(hiddenParts(), ['none']);
  });
  test('only the chosen start\'s settings are shown — plus the pipeline and the stop, which every start has', () => {
    const shown = { lead: ['from'], stage: ['stage'], urgency: ['urgency'], deal_field: ['field', 'value'], contact_field: ['field', 'value'], document: ['doc'], call_result: ['result'], meeting_before: ['hours'],
      meeting_after: ['hours'], stage_days: ['days', 'stage'], quiet_days: ['days'], date_field: ['at', 'field', 'when'], schedule: ['at', 'stage', 'weekdays'], flow_done: ['flow'], manual: [], meeting_booked: [], task_done: [] };
    for (const [trigger, own] of Object.entries(shown)) {
      open({ trigger, ...EVERY[trigger] });
      assert.deepEqual(hiddenParts(), [...own, 'pipeline', 'stop'].sort(), trigger);
    }
  });
  test('the lead webhooks to tick show only for "only chosen ones"; the number of days only for "before" and "after"', () => {
    open({ trigger: 'lead' });
    assert.equal(F.__page().fields.whs.hidden, true);
    F.__fill({ from: 'some' }); press('change select');
    assert.equal(F.__page().fields.whs.hidden, false);
    assert.match(modal().body, /<label class="jr-check"><input type="checkbox" data-jr-wh value="5"><span>Website form<\/span><\/label>/);
    open({ trigger: 'date_field', field_key: 'einzug', offset_days: 0, at: '09:00' });
    assert.equal(F.__page().fields.offset.hidden, true);
    F.__fill({ when: 'before' }); press('change select');
    assert.equal(F.__page().fields.offset.hidden, false);
  });
  test('another tab shows that category\'s starts and changes nothing that is chosen', () => {
    open({ trigger: 'stage', stage_id: 31 });
    press('click [data-jt-cat]', {}, { dataset: { jtCat: 'meetings' } });
    const chooser = F.__page().fields.chooser.innerHTML;
    assert.match(chooser, /data-jt-cat="meetings" aria-selected="true"/);
    assert.match(chooser, /data-jt-trig="meeting_booked" aria-checked="false"/);
    assert.equal(F.__page().fields.trigger.value, 'stage');
    assert.deepEqual(hiddenParts(), ['pipeline', 'stage', 'stop'], 'the stage start\'s settings are still the ones shown');
    press('click [data-jt-cat]', {}, { dataset: { jtCat: 'nowhere' } });
    assert.match(F.__page().fields.chooser.innerHTML, /data-jt-cat="meetings" aria-selected="true"/, 'a tab that is none changes nothing');
  });
  test('choosing a card makes it the start, shows its settings, and offers the fields that start can use', () => {
    open({});
    press('click [data-jt-cat]', {}, { dataset: { jtCat: 'time' } });
    press('click [data-jt-trig]', {}, { dataset: { jtTrig: 'date_field' } });
    const f = F.__page().fields;
    assert.equal(f.trigger.value, 'date_field');
    assert.match(f.chooser.innerHTML, /data-jt-trig="date_field" aria-checked="true"/);
    assert.equal(f.field.innerHTML, '<option value="" selected>— choose —</option><option value="einzug">Einzug</option><option value="frist">Frist</option>', 'only the fields that hold a date, none chosen');
    assert.deepEqual(hiddenParts(), ['at', 'field', 'pipeline', 'stop', 'when']);
    press('click [data-jt-cat]', {}, { dataset: { jtCat: 'contacts' } });
    f.field.value = 'einzug';
    press('click [data-jt-trig]', {}, { dataset: { jtTrig: 'contact_field' } });
    assert.equal(f.field.innerHTML, '<option value="" selected>— choose —</option><option value="kundenstatus">Kundenstatus</option>');
    assert.equal(f.field.value, '', 'a field chosen for another start is not carried over');
    press('click [data-jt-trig]', {}, { dataset: { jtTrig: 'constructor' } });
    assert.equal(f.trigger.value, 'contact_field', 'a card that is no start changes nothing');
  });
  test('saving sends the start to its own address and shows the workflow as the server answers it', async () => {
    open({});
    const saved = { ...FLOW, nodes: [startBox({ trigger: 'meeting_before', hours: 24, pipeline_id: 4 })] };
    F.__reset({ 'put /api/journey/nodes/20': { flow: saved } });
    fill({ answers: { 'put /api/journey/nodes/20': { flow: saved } } });
    F.openJourneyStart(startBox());
    F.__fill({ trigger: 'meeting_before', from: 'all', hours: ' 24 ', days: '', when: 'on', at: '09:00', pipeline: '4', stage: '', urgency: '', field: '', value: '', doc: '', result: '', offset: '', flow: '' });
    await press('click [data-jr-save]');
    const log = F.__page().log;
    assert.deepEqual(log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/20', { config: { trigger: 'meeting_before', stop_stage_ids: [], pipeline_id: 4, hours: 24 } }]);
    assert.deepEqual(log.find(c => c[0] === 'apply')[1], saved);
    assert.ok(log.some(c => c[0] === 'close'));
    assert.deepEqual(log.find(c => c[0] === 'toast'), ['toast', 'Step saved']);
  });
  test('the ticked lead webhooks and weekdays are read from the window', async () => {
    fill({ answers: { 'put /api/journey/nodes/20': { flow: FLOW } } });
    F.openJourneyStart(startBox());
    F.__list('[data-jr-wh]', [{ value: '6', checked: true }, { value: '5', checked: true }, { value: '9', checked: false }]);
    F.__fill({ trigger: 'lead', from: 'some', when: 'on', at: '09:00' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2].config.webhook_ids, [5, 6]);
    fill({ answers: { 'put /api/journey/nodes/20': { flow: FLOW } } });
    F.openJourneyStart(startBox());
    F.__list('[data-jt-day]', [{ value: '5', checked: true }, { value: '1', checked: true }, { value: '7', checked: false }]);
    F.__fill({ trigger: 'schedule', stage: '31', from: 'all', when: 'on', at: '08:00' });
    await press('click [data-jr-save]');
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2].config, { trigger: 'schedule', stop_stage_ids: [], stage_id: 31, weekdays: [1, 5], at: '08:00' });
  });
  test('something missing: said in the window, the cursor in that field, nothing sent', async () => {
    fill();
    F.openJourneyStart(startBox());
    F.__fill({ trigger: 'meeting_before', hours: '', from: 'all', when: 'on', at: '09:00' });
    await press('click [data-jr-save]');
    const { fields, log } = F.__page();
    assert.equal(fields.err.textContent, 'The hours are a whole number from 1 to 720.');
    assert.equal(fields.err.hidden, false);
    assert.equal(fields.hours.focused, 1);
    assert.ok(!log.some(c => c[0] === 'put'));
    F.__fill({ trigger: '' });
    await press('click [data-jr-save]');
    assert.equal(fields.err.textContent, 'Choose what starts the workflow.');
    assert.equal(fields.chooser.focused, 1);
  });
  test('a refusal of the server is said in the window in the page\'s language, and the window stays', async () => {
    for (const [code, words] of [['field', 'Dieses Feld gibt es nicht mehr, oder es ist nicht von der Art, die dieser Auslöser braucht.'], ['loop', 'Der andere Workflow beginnt, wenn dieser endet. Die beiden würden sich endlos gegenseitig starten.'],
      ['pipeline', 'Diese Pipeline gibt es nicht mehr.'], ['active', 'Zum Ändern des Starts den Workflow ausschalten.']]) {
      fill({ lang: 'de', answers: { 'put /api/journey/nodes/20': { error: 'x', code } } });
      F.openJourneyStart(startBox());
      F.__fill({ trigger: 'manual', from: 'all', when: 'on', at: '09:00' });
      await press('click [data-jr-save]');
      assert.equal(F.__page().fields.err.textContent, words, code);
      assert.ok(!F.__page().log.some(c => c[0] === 'close' || c[0] === 'apply'), code);
    }
  });
  test('closing asks only when something was changed', () => {
    open({ trigger: 'stage', stage_id: 31 });
    assert.equal(modal().beforeClose(), true, 'nothing changed');
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    press('click [data-jt-cat]', {}, { dataset: { jtCat: 'time' } });
    assert.equal(modal().beforeClose(), true, 'looking at another tab is no change');
    F.__fill({ stage: '32' });
    F.__opt('unsaved', false);
    assert.equal(modal().beforeClose(), false);
    assert.ok(F.__page().log.some(c => c[0] === 'unsaved?'));
  });
  // Found by the bug hunt of 2026-11-19: a start that names something deleted since asked "unsaved changes?" on a
  // window nobody had touched — the form cannot show what is gone, so it differed from what it opened with.
  test('what a saved start names and is gone since is not what the window opens with: an untouched window asks nothing', () => {
    const saved = F.journeyStartState({ ...BASE, trigger: 'stage_days', stage_id: 999, days: 3, pipeline_id: 77, webhook_ids: [5, 404], stop_stage_ids: [31, 998] });
    fill();
    assert.deepEqual([saved.stage, saved.pipeline, saved.webhooks, saved.arrive], ['999', '77', [5, 404], [31, 998]], 'as it was saved');
    const shown = F.journeyStartShown(saved, 10);
    assert.deepEqual([shown.stage, shown.pipeline, shown.webhooks, shown.arrive], ['', '', [5], [31]], 'as the window can show it');
    assert.deepEqual([shown.trigger, shown.days, shown.from, shown.ends], ['stage_days', '3', 'some', ['arrive']], 'everything else stays');
    assert.deepEqual(F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'deal_field', field_key: 'gone' }), 10).field, '');
    assert.deepEqual(F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'date_field', field_key: 'finanzierung' }), 10).field, '', 'a field that is no date is not offered to a date start');
    assert.deepEqual(F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'date_field', field_key: 'einzug' }), 10).field, 'einzug');
    assert.deepEqual([F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'flow_done', flow_id: 11 }), 10).flow, F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'flow_done', flow_id: 10 }), 10).flow,
      F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'flow_done', flow_id: 555 }), 10).flow], ['11', '', ''], 'another workflow that exists; never itself; never one that is gone');
    // the window itself: the form holds what a browser's lists can hold, and closing asks nothing
    open({ trigger: 'lead', webhook_ids: [5, 404], stop_stage_ids: [31, 998], pipeline_id: 77 });
    assert.equal(modal().beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'nothing was touched');
    assert.match(sliceFn(js, 'openJourneyStart', 'journey-start.js'), /const start = journeyStartShown\(journeyStartState\(node\.config\), flow \? flow\.id : null\);/);
  });
  test('another workflow to wait for: every workflow but this one; none yet says so', () => {
    open({ trigger: 'flow_done', flow_id: 11 });
    assert.match(modal().body, /id="jr-abc1234-flow"><option value="">— choose —<\/option><option value="11" selected>After the viewing<\/option><\/select>/);
    assert.doesNotMatch(modal().body, /<option value="10"/, 'a workflow cannot wait for itself');
    fill({ flows: [FLOW] });
    F.openJourneyStart(startBox({ trigger: 'flow_done' }));
    assert.match(modal().body, /<input type="hidden" id="jr-abc1234-flow" value=""><p class="help">There is no other workflow yet\.<\/p>/);
  });
  test('while the workflow runs, and for a member, the start is read: no form, and the reason', () => {
    fill({ flows: [{ ...FLOW, active: true, nodes: [startBox({ trigger: 'meeting_before', hours: 24 })] }] });
    F.openJourneyStart(startBox({ trigger: 'meeting_before', hours: 24 }));
    let m = modal();
    assert.equal(m.title, 'Step');
    assert.doesNotMatch(m.body, /<form|<select|jt-cat/);
    assert.match(m.body, /<h3 class="jr-view-title">Some hours before a meeting<\/h3>\s*<p class="jr-view-text">24 hours<\/p>/);
    assert.match(m.body, /Switch the workflow off to change its start\./);
    fill({ manage: false });
    F.openJourneyStart(startBox({ trigger: 'stage', stage_id: 31 }));
    m = modal();
    assert.doesNotMatch(m.body, /<form|<select|jt-cat/);
    assert.match(m.body, /Only owners and admins can change workflows\./);
  });
  test('names from the settings are text in the window, never markup', () => {
    const evil = '<img src=x onerror=alert(1)>';
    fill({ hooks: [{ id: 5, name: evil }], list: [{ id: 3, name: evil, stages: [{ id: 31, name: evil }] }], deal: [{ field_key: 'f', name: evil, type: 'date' }], contact: [{ field_key: 'c', name: evil, type: 'text' }],
      flows: [FLOW, { ...OTHER, name: evil }] });
    F.openJourneyStart(startBox({ trigger: 'deal_field', field_key: 'f', value: `"><b>x</b>` }));
    const body = modal().body;
    assert.doesNotMatch(body, /<img|<b>x<\/b>/);
    assert.ok(count(body, '&lt;img src=x onerror=alert(1)&gt;') >= 5, 'the webhook, the pipeline, the stage, the field, the other workflow');
    assert.match(body, /value="&quot;&gt;&lt;b&gt;x&lt;\/b&gt;"/);
    assert.doesNotMatch(F.journeyStartFieldOptions('contact_field', ''), /<img/);
  });
});

// Parts 10 and 13: where a workflow ends for a deal — one list of rules under small headings, each a tick with a plain
// sentence and, right under a ticked one, what it needs. Any one ticked rule ends the workflow.
describe('where a workflow ends', () => {
  // the contract with the server (CUSTOMER_JOURNEY_CHANGES Part 13): the rules in their order, their categories, their settings
  const RULES = ['assigned', 'urgency', 'field', 'contact_field', 'document', 'onboarding_done', 'opt_out', 'answered', 'call_result', 'call_inbound', 'meeting', 'meeting_cancelled', 'task_done', 'max_days', 'other_flow'];
  const GROUPS = { deal: ['assigned', 'urgency', 'field'], contact: ['contact_field', 'document', 'onboarding_done', 'opt_out'], calls: ['answered', 'call_result', 'call_inbound'], meetings: ['meeting', 'meeting_cancelled'],
    tasks: ['task_done'], time: ['max_days'], other: ['other_flow'] };
  const USES = { urgency: ['min_urgency'], field: ['field_key', 'value'], contact_field: ['field_key', 'value'], document: ['doc_type'], call_result: ['results'], max_days: ['days'], other_flow: ['flow_id'] };
  // every rule set, as the server keeps a start
  const SET = { urgency: { min_urgency: 3 }, field: { field_key: 'finanzierung', value: 'ja' }, contact_field: { field_key: 'kundenstatus' }, document: { doc_type: 'vertrag' },
    call_result: { results: ['interested', 'not_interested'] }, max_days: { days: 30 }, other_flow: { flow_id: 11 } };
  const ALL = { stop_stage_ids: [32], stay_stage_ids: [31, 41], stop_on: RULES, stop_set: SET };
  const state = more => ({ ...F.journeyStartState({ ...BASE, trigger: 'manual' }), ...more });
  const sent = more => F.journeyStartConfig(state(more));
  const SENTENCES = { arrive: 'the deal arrives in one of these stages', leave: 'the deal is no longer in one of these stages', assigned: 'the deal is assigned to someone', urgency: 'the deal\'s urgency is at least …',
    field: 'a deal field has a value', contact_field: 'a contact field has a value', document: 'a document is added', onboarding_done: 'the onboarding is completed', opt_out: 'the contact presses "no more emails"',
    answered: 'a fonio call reaches the person', call_result: 'fonio\'s result of a call is one of …', call_inbound: 'the contact calls in', meeting: 'a meeting is booked for the contact',
    meeting_cancelled: 'a booked meeting is cancelled', task_done: 'a task of the deal is completed', max_days: 'the deal has been in the workflow for … days', other_flow: 'the deal is taken into another workflow' };

  test('the rules, the heading each stands under and the settings each has are the contract\'s', () => {
    assert.deepEqual(Object.keys(constOf('JOURNEY_STOP_ON_KEYS')), RULES, 'the rules in their order');
    assert.deepEqual(constOf('JOURNEY_STOP_GROUPS'), { stages: ['arrive', 'leave'], ...GROUPS }, 'the two stage rules first, then the server\'s categories');
    assert.deepEqual(constOf('JOURNEY_STOP_USES'), USES);
    assert.deepEqual(Object.keys(constOf('JOURNEY_STAGE_RULES')), ['arrive', 'leave']);
    assert.deepEqual(Object.values(constOf('JOURNEY_STOP_GROUPS')).flat(), ['arrive', 'leave', ...RULES], 'every rule under exactly one heading, in the list\'s order');
    assert.deepEqual(Object.keys(constOf('JOURNEY_STOP_HEADS')), Object.keys(constOf('JOURNEY_STOP_GROUPS')));
    assert.equal(server.MAX_IDS, 20);
    assert.match(js, /^const JOURNEY_STOP_MAX = 20;/m);
  });
  // The page's lists against the server's own (utils/journey-ends.js, the server half of Part 13).
  test('the server\'s own lists say the same: the rules, their categories, their settings', () => {
    assert.deepEqual(server.STOP_ON, RULES);
    assert.deepEqual(Object.keys(constOf('JOURNEY_STOP_ON_KEYS')), server.STOP_ON);
    assert.deepEqual(server.STOP_CATEGORIES, GROUPS);
    const { stages, ...rest } = constOf('JOURNEY_STOP_GROUPS');
    assert.deepEqual([stages, rest], [['arrive', 'leave'], server.STOP_CATEGORIES], 'the page\'s headings are the server\'s categories, with its own two stage rules first');
    assert.deepEqual(server.STOP_USES, USES);
    assert.deepEqual(constOf('JOURNEY_STOP_USES'), server.STOP_USES);
  });
  test('every rule has its sentence and every heading its word, in both languages; no two rules read the same', () => {
    const keys = { ...constOf('JOURNEY_STAGE_RULES'), ...constOf('JOURNEY_STOP_ON_KEYS') }, heads = constOf('JOURNEY_STOP_HEADS');
    assert.deepEqual(Object.fromEntries(Object.entries(keys).map(([k, key]) => [k, dict.en[key]])), SENTENCES);
    for (const lang of ['en', 'de']) {
      const said = Object.values(keys).map(k => dict[lang][k]);
      assert.ok(said.every(Boolean), lang); assert.equal(new Set(said).size, said.length, `${lang}: every rule is its own sentence`);
      assert.ok(Object.values(heads).every(k => dict[lang][k]), `${lang}: every heading`);
    }
    assert.deepEqual(Object.values(heads).map(k => dict.en[k]), ['Stages', 'Deal', 'Contact', 'Calls (fonio)', 'Meetings', 'Tasks', 'Time', 'Other']);
    assert.deepEqual(Object.values(heads).map(k => dict.de[k]), ['Phasen', 'Deal', 'Kontakt', 'Anrufe (fonio)', 'Termine', 'Aufgaben', 'Zeit', 'Sonstiges']);
    assert.equal(dict.de.jt_on_max_days, 'der Deal seit … Tagen im Workflow ist');
  });
  // Part 16: a rule is a card — its name, and a line that says what it means.
  test('every rule has its name and its line of explanation for its card, in both languages; no two read the same', () => {
    const titles = constOf('JOURNEY_STOP_TITLES'), hints = constOf('JOURNEY_STOP_HINTS'), all = ['arrive', 'leave', ...RULES];
    assert.deepEqual(Object.keys(titles), all); assert.deepEqual(Object.keys(hints), all);
    for (const lang of ['en', 'de']) for (const map of [titles, hints]) {
      const said = Object.values(map).map(k => dict[lang][k]);
      assert.ok(said.every(Boolean), lang); assert.equal(new Set(said).size, said.length, `${lang}: each its own`);
    }
    assert.deepEqual(all.map(k => dict.en[titles[k]]), ['The deal arrives in a stage', 'The deal leaves its stages', 'The deal is assigned to someone', 'The urgency reaches a level', 'A deal field has a value',
      'A contact field has a value', 'A document is added', 'The onboarding is completed', 'The contact wants no more emails', 'A fonio call reaches the person', 'A fonio call ends with a result', 'The contact calls in',
      'A meeting is booked', 'A booked meeting is cancelled', 'A task of the deal is completed', 'After a number of days', 'Another workflow takes the deal']);
    // the rules that go by how the deal IS when a step is due (the server's two kinds of rule) say so on their own card —
    // and the one a deal made by hand always meets says that too
    for (const k of ['assigned', 'urgency', 'field', 'contact_field']) { assert.match(dict.en[hints[k]], /when a step is due/, k); assert.match(dict.de[hints[k]], /wenn ein Schritt fällig ist/, k); }
    assert.match(dict.en.jt_eh_assigned, /A deal made by hand is always assigned to whoever made it, so its workflow would end at the first step\.$/);
    assert.match(dict.de.jt_eh_assigned, /Ein von Hand angelegter Deal ist immer der anlegenden Person zugewiesen: Sein Workflow würde beim ersten Schritt enden\.$/);
    // … and those that go by what HAPPENED say since when
    for (const k of ['document', 'answered', 'call_inbound', 'meeting', 'meeting_cancelled', 'task_done']) { assert.match(dict.en[hints[k]], /after the deal entered the workflow/, k); assert.match(dict.de[hints[k]], /nachdem der Deal in den Workflow kam/, k); }
    assert.equal(dict.en.jt_f_stop_any, 'The workflow is over for a deal as soon as one of the rules that are switched on is true.');
    assert.ok(!('jt_f_stop_state' in dict.en) && !('jt_f_stop_state' in dict.de), 'the one long note of before is gone: each card says its own');
  });

  test('a saved start as the window holds it: the ticked rules in the list\'s order, the stages under each stage rule, every setting as text', () => {
    fill();
    const s = F.journeyStartState({ ...BASE, trigger: 'manual', ...ALL, stop_on: [...RULES].reverse() });
    assert.deepEqual(s.ends, ['arrive', 'leave', ...RULES], 'in the list\'s own order, however it was kept');
    assert.deepEqual([s.arrive, s.leave], [[32], [31, 41]]);
    assert.deepEqual([s.endurgency, s.endfield, s.endvalue, s.endcfield, s.endcvalue, s.enddoc, s.endresults, s.enddays, s.endflow], ['3', 'finanzierung', 'ja', 'kundenstatus', '', 'vertrag', ['interested', 'not_interested'], '30', '11']);
    assert.deepEqual(F.journeyStartState({ ...BASE, trigger: 'manual', stop_stage_ids: [41, 32], stay_stage_ids: [32, 31] }).arrive, [32, 41]);
    assert.deepEqual(F.journeyStartState({ ...BASE, trigger: 'manual', stop_set: { call_result: { results: ['not_reached', 'nope', 'interested'] } } }).endresults, ['interested', 'not_reached'], 'the results in their list\'s order, only those there are');
    const none = F.journeyStartState({ ...BASE, trigger: 'manual' });
    assert.deepEqual([none.ends, none.arrive, none.leave, none.endresults, none.endurgency, none.enddays, none.endflow], [[], [], [], [], '', '', '']);
  });
  test('what was kept oddly is no rule and breaks nothing', () => {
    fill();
    for (const odd of [{ stop_on: 'meeting' }, { stop_on: ['nope', 'constructor', 'arrive'] }, { stop_set: null }, { stop_set: 'x' }, { stop_set: ['urgency'] }, { stop_set: { urgency: null, field: 'x', call_result: { results: 'interested' } } }]) {
      const s = F.journeyStartState({ ...BASE, trigger: 'manual', ...odd });
      assert.deepEqual([s.ends, s.endurgency, s.endfield, s.endresults], [[], '', '', []], JSON.stringify(odd));
    }
    assert.deepEqual(lines({ trigger: 'manual', stop_on: ['urgency', 'field', 'call_result', 'max_days', 'other_flow', 'document'], stop_set: null })[1],
      'Also ends when: the deal\'s urgency is at least …; a deal field has a value (a field that no longer exists); a document is added; fonio\'s result of a call is one of …; the deal has been in the workflow for … days; the deal is taken into another workflow (a workflow that no longer exists)',
      'a rule whose setting is not there says its plain sentence');
  });

  test('what is sent, rule by rule: the rule, and its settings only where it has any', () => {
    fill();
    const filled = { endurgency: '3', endfield: 'finanzierung', endvalue: 'ja', endcfield: 'kundenstatus', endcvalue: '', enddoc: 'vertrag', endresults: ['interested', 'not_interested'], enddays: '30', endflow: '11', arrive: [32], leave: [31, 41] };
    for (const rule of RULES) {
      const out = sent({ ...filled, ends: [rule] });
      assert.deepEqual(out, { config: { trigger: 'manual', stop_stage_ids: [], stop_on: [rule], ...(SET[rule] ? { stop_set: { [rule]: SET[rule] } } : {}) } }, rule);
      assert.equal(!!out.config.stop_set, rule in USES, `${rule}: settings only for a rule that has any`);
    }
    assert.deepEqual(sent({ ...filled, ends: ['arrive'] }), { config: { trigger: 'manual', stop_stage_ids: [32] } });
    assert.deepEqual(sent({ ...filled, ends: ['leave'] }), { config: { trigger: 'manual', stop_stage_ids: [], stay_stage_ids: [31, 41] } });
    assert.deepEqual(sent({ ...filled, ends: [] }), { config: { trigger: 'manual', stop_stage_ids: [] } }, 'nothing ticked: nothing of what stands under the rules is sent');
  });
  test('all of them at once come back as they were saved; both stage rules may be set together', () => {
    fill();
    assert.deepEqual(F.journeyStartConfig(F.journeyStartState({ ...BASE, trigger: 'manual', ...ALL })), { config: { trigger: 'manual', ...ALL } });
    assert.deepEqual(sent({ ends: ['leave', 'arrive'], arrive: [32], leave: [31] }).config, { trigger: 'manual', stop_stage_ids: [32], stay_stage_ids: [31] });
    assert.deepEqual(sent({ ends: ['other_flow', 'meeting', 'assigned'], endflow: '11' }).config.stop_on, ['assigned', 'meeting', 'other_flow'], 'in the list\'s order, however they were ticked');
  });
  test('an optional setting that is left empty is not sent: any value, any document', () => {
    fill();
    assert.deepEqual(sent({ ends: ['field'], endfield: 'finanzierung', endvalue: '' }).config.stop_set, { field: { field_key: 'finanzierung' } });
    assert.deepEqual(sent({ ends: ['contact_field'], endcfield: 'kundenstatus', endcvalue: 'aktiv' }).config.stop_set, { contact_field: { field_key: 'kundenstatus', value: 'aktiv' } });
    assert.deepEqual(sent({ ends: ['document'], enddoc: '' }).config, { trigger: 'manual', stop_stage_ids: [], stop_on: ['document'] }, 'any document: the rule alone');
    assert.deepEqual(sent({ ends: ['document', 'max_days'], enddoc: '', enddays: '7' }).config.stop_set, { max_days: { days: 7 } });
  });
  test('a ticked rule without what it needs: said, with the cursor on that field — and nothing is a config', () => {
    fill();
    const err = more => { const out = sent(more); return [out.error, out.part, out.config]; };
    assert.deepEqual(err({ ends: ['arrive'] }), ['jt_err_stop_stages', 'endarrive', undefined]);
    assert.deepEqual(err({ ends: ['leave'], arrive: [31] }), ['jt_err_stop_stages', 'endleave', undefined], 'the stages of the other stage rule are not this one\'s');
    assert.deepEqual(err({ ends: ['arrive'], arrive: Array.from({ length: 21 }, (_, i) => i + 1) }), ['jt_err_stop_many', 'endarrive', undefined]);
    assert.deepEqual(err({ ends: ['leave'], leave: Array.from({ length: 21 }, (_, i) => i + 1) }), ['jt_err_stop_many', 'endleave', undefined]);
    assert.equal(sent({ ends: ['arrive'], arrive: Array.from({ length: 20 }, (_, i) => i + 1) }).error, undefined, 'twenty are the most');
    for (const endurgency of ['', '0', '5', 'toString', 'constructor']) assert.deepEqual(err({ ends: ['urgency'], endurgency }), ['jt_err_level', 'endurgency', undefined], endurgency);
    assert.deepEqual(err({ ends: ['field'], endcfield: 'kundenstatus' }), ['jt_err_field', 'endfield', undefined], 'a contact field chosen under the other rule is no deal field');
    assert.deepEqual(err({ ends: ['contact_field'], endfield: 'finanzierung' }), ['jt_err_field', 'endcfield', undefined]);
    assert.deepEqual(err({ ends: ['call_result'] }), ['jt_err_results', 'endresults', undefined]);
    for (const enddays of ['', '0', '366', '1.5', '-3', 'x']) assert.deepEqual(err({ ends: ['max_days'], enddays }), ['jt_err_days', 'enddays', undefined], enddays);
    assert.deepEqual(err({ ends: ['other_flow'] }), ['jt_err_flow', 'endflow', undefined]);
    assert.deepEqual([sent({ ends: ['max_days'], enddays: '1' }).config.stop_set, sent({ ends: ['max_days'], enddays: '365' }).config.stop_set], [{ max_days: { days: 1 } }, { max_days: { days: 365 } }]);
    for (const key of ['jt_err_stop_stages', 'jt_err_stop_many', 'jt_err_level', 'jt_err_field', 'jt_err_results', 'jt_err_days', 'jt_err_flow']) assert.ok(dict.en[key] && dict.de[key], key);
    assert.deepEqual([dict.en.jt_err_level, dict.en.jt_err_results, dict.de.jt_err_level, dict.de.jt_err_results], ['Choose a level.', 'Choose at least one result.', 'Eine Stufe wählen.', 'Mindestens ein Ergebnis wählen.']);
    assert.deepEqual([dict.en.jt_err_stop_stages, dict.de.jt_err_stop_stages], ['Choose at least one stage.', 'Mindestens eine Phase wählen.'], 'a stage is a chip to choose now, not a box to tick');
  });
  test('what the start itself is missing is said before what a rule is missing: the window is read from the top', () => {
    fill();
    const out = F.journeyStartConfig({ ...F.journeyStartState({ ...BASE, trigger: 'stage' }), ends: ['urgency'] });
    assert.deepEqual([out.error, out.part], ['jt_err_stage', 'stage']);
  });

  test('a workflow saved before this opens as it was and saves back the same rules, without anything new', () => {
    fill();
    const back = c => F.journeyStartConfig(F.journeyStartState({ ...BASE, trigger: 'manual', ...c })).config;
    assert.deepEqual(back({ stop_stage_ids: [32, 41] }), { trigger: 'manual', stop_stage_ids: [32, 41] });
    assert.deepEqual(back({ stay_stage_ids: [31, 32] }), { trigger: 'manual', stop_stage_ids: [], stay_stage_ids: [31, 32] });
    assert.deepEqual(back({ stop_on: ['meeting'] }), { trigger: 'manual', stop_stage_ids: [], stop_on: ['meeting'] });
    const three = back({ stay_stage_ids: [31], stop_on: ['meeting', 'answered', 'opt_out'] });
    assert.deepEqual([three.stay_stage_ids, [...three.stop_on].sort(), 'stop_set' in three], [[31], ['answered', 'meeting', 'opt_out'], false], 'the same three rules; no settings appear from nowhere');
    assert.deepEqual(three.stop_on, ['opt_out', 'answered', 'meeting'], 'in the order the list has now');
  });
  test('the server saves exactly what the window sent, for what it could always be told', () => {
    fill();
    for (const c of [{ stop_stage_ids: [32, 41] }, { stay_stage_ids: [31, 32] }, { stop_on: ['meeting'] }, { stay_stage_ids: [31], stop_on: ['opt_out'] }]) {
      const saved = server.checkStart(F.journeyStartConfig(F.journeyStartState({ ...BASE, trigger: 'manual', ...c })).config);
      assert.deepEqual(saved.config, { ...BASE, trigger: 'manual', ...c }, JSON.stringify(c));
    }
  });
  // The server half of Part 13 must take every rule the window sends, as the window sends it.
  test('the server saves exactly what the window sent, for every rule and for all at once', () => {
    fill();
    const cases = [...RULES.map(rule => ({ stop_on: [rule], ...(SET[rule] ? { stop_set: { [rule]: SET[rule] } } : {}) })), { stop_on: ['document'] }, { stop_on: ['field'], stop_set: { field: { field_key: 'finanzierung' } } },
      { stop_stage_ids: [32], stay_stage_ids: [31] }, ALL];
    for (const c of cases) {
      const sentNow = F.journeyStartConfig(F.journeyStartState({ ...BASE, trigger: 'manual', ...c }));
      assert.equal(sentNow.error, undefined, JSON.stringify(c));
      const saved = server.checkStart(sentNow.config, { tz: 'Europe/Berlin' });
      assert.equal(saved.code, undefined, `the server takes it: ${JSON.stringify(c)}`);
      assert.deepEqual(saved.config, { ...BASE, trigger: 'manual', ...c }, JSON.stringify(c));
      assert.deepEqual(F.journeyStartConfig(F.journeyStartState(saved.config)).config, sentNow.config, 'and what it kept opens and saves back the same');
    }
  });

  test('on the box: the stages it stops in, the stages it is meant for, and every other rule with what it was set to — in one line', () => {
    fill();
    assert.deepEqual(lines({ trigger: 'manual', stop_stage_ids: [32, 41] }), ['Only when a deal is added by hand', 'Stops when the deal reaches: Booked (Sales), Enquiry (Rentals)']);
    assert.deepEqual(lines({ trigger: 'manual', stay_stage_ids: [31, 32] })[1], 'Runs only while the deal is in: New (Sales), Booked (Sales)');
    assert.deepEqual(lines({ trigger: 'manual', stop_stage_ids: [32], stay_stage_ids: [31] }).slice(1), ['Stops when the deal reaches: Booked (Sales)', 'Runs only while the deal is in: New (Sales)'], 'both stage rules, each in its line');
    assert.deepEqual(lines({ trigger: 'manual', stop_on: ['meeting', 'opt_out'] })[1], 'Also ends when: the contact presses "no more emails"; a meeting is booked for the contact', 'in the list\'s order, as the window has them');
    assert.deepEqual(lines({ trigger: 'manual', stop_on: ['answered', 'something_new', 'constructor'] })[1], 'Also ends when: a fonio call reaches the person', 'a word this page does not know is left out');
    assert.deepEqual(lines({ trigger: 'manual', stop_on: [] }), ['Only when a deal is added by hand']);
    const all = lines({ trigger: 'manual', ...ALL });
    assert.equal(all.length, 4, 'the start, two stage lines, one line for every other rule');
    assert.equal(all[3], 'Also ends when: the deal is assigned to someone; the deal\'s urgency is at least "High"; a deal field has a value (Finanzierung: ja); a contact field has a value (Kundenstatus); '
      + 'a document is added (Contract); the onboarding is completed; the contact presses "no more emails"; a fonio call reaches the person; fonio\'s result of a call is one of: Interested, Not interested; the contact calls in; '
      + 'a meeting is booked for the contact; a booked meeting is cancelled; a task of the deal is completed; the deal has been in the workflow for 30 days; the deal is taken into another workflow (After the viewing)');
    assert.deepEqual(lines({ trigger: 'manual', stop_on: ['max_days'], stop_set: { max_days: { days: 1 } } })[1], 'Also ends when: the deal has been in the workflow for 1 day');
    assert.deepEqual(lines({ trigger: 'manual', stop_on: ['document'] })[1], 'Also ends when: a document is added', 'any document: nothing more to say');
  });
  test('on the box, what a rule names and is gone since is said so; a contact field is no deal field', () => {
    fill();
    const says = (stop_on, stop_set) => lines({ trigger: 'manual', stop_on, stop_set })[1];
    assert.equal(says(['field'], { field: { field_key: 'gone' } }), 'Also ends when: a deal field has a value (a field that no longer exists)');
    assert.equal(says(['field'], { field: { field_key: 'kundenstatus', value: 'x' } }), 'Also ends when: a deal field has a value (a field that no longer exists: x)');
    assert.equal(says(['contact_field'], { contact_field: { field_key: 'finanzierung' } }), 'Also ends when: a contact field has a value (a field that no longer exists)');
    assert.equal(says(['other_flow'], { other_flow: { flow_id: 999 } }), 'Also ends when: the deal is taken into another workflow (a workflow that no longer exists)');
    assert.equal(says(['call_result'], { call_result: { results: ['nope'] } }), 'Also ends when: fonio\'s result of a call is one of …');
    assert.equal(says(['urgency'], { urgency: { min_urgency: 9 } }), 'Also ends when: the deal\'s urgency is at least …');
    assert.equal(says(['document'], { document: { doc_type: 'constructor' } }), 'Also ends when: a document is added');
  });
  test('on the box in German, and for a member who reads the start', () => {
    fill({ lang: 'de' });
    assert.deepEqual(lines({ trigger: 'manual', stay_stage_ids: [31], stop_on: ['meeting', 'max_days', 'urgency'], stop_set: { max_days: { days: 30 }, urgency: { min_urgency: 4 } } }).slice(1),
      ['Läuft nur, solange der Deal ist in: New (Sales)', 'Endet außerdem, wenn: die Dringlichkeit des Deals mindestens „Sehr dringend“ ist; ein Termin für den Kontakt gebucht wird; der Deal 30 Tage im Workflow ist']);
    assert.equal(lines({ trigger: 'manual', stop_on: ['max_days'], stop_set: { max_days: { days: 1 } } })[1], 'Endet außerdem, wenn: der Deal 1 Tag im Workflow ist');
    fill({ manage: false });
    F.openJourneyStart(startBox({ trigger: 'manual', stop_on: ['task_done', 'field'], stop_set: { field: { field_key: 'finanzierung', value: '<b>ja</b>' } } }));
    const m = modal();
    assert.doesNotMatch(m.body, /<form|<input|<select|<b>ja/);
    assert.match(m.body, /<p class="jr-view-text">Also ends when: a deal field has a value \(Finanzierung: &lt;b&gt;ja&lt;\/b&gt;\); a task of the deal is completed<\/p>/);
  });

  // Part 16: the panel. On top what is switched on; under it every rule as a card behind the tab of what it is about.
  const PANEL = 'id="jr-abc1234-w-stop"';
  const TITLES = { arrive: 'The deal arrives in a stage', leave: 'The deal leaves its stages', assigned: 'The deal is assigned to someone', urgency: 'The urgency reaches a level', field: 'A deal field has a value',
    contact_field: 'A contact field has a value', document: 'A document is added', onboarding_done: 'The onboarding is completed', opt_out: 'The contact wants no more emails', answered: 'A fonio call reaches the person',
    call_result: 'A fonio call ends with a result', call_inbound: 'The contact calls in', meeting: 'A meeting is booked', meeting_cancelled: 'A booked meeting is cancelled', task_done: 'A task of the deal is completed',
    max_days: 'After a number of days', other_flow: 'Another workflow takes the deal' };
  const HEADS = ['stages', 'deal', 'contact', 'calls', 'meetings', 'tasks', 'time', 'other'];
  test('in the window: a panel of its own — what is switched on, then every rule behind eight tabs, then when it is looked at', () => {
    open({ trigger: 'manual', ...ALL });
    const body = modal().body, section = body.slice(body.indexOf(PANEL));
    assert.match(body, /<div class="field jt-endbox" id="jr-abc1234-w-stop"><span class="label">Ends for a deal<\/span>\s*<p class="help">The workflow is over for a deal as soon as one of the rules that are switched on is true\.<\/p>\s*<div class="jt-now" id="jr-abc1234-endsum" tabindex="-1">/);
    assert.match(section, /<span class="jt-rules-head">All rules<\/span>\s*<div class="jt-cats" role="tablist" aria-label="What the rules are about" id="jr-abc1234-endtabs">/);
    assert.match(section, /<\/div><\/div>\s*<p class="help">Looked at each time a step is due\. A deal the workflow has ended for gets no further step\.<\/p><\/div><div class="error-text"/, 'the one hint closes the panel');
    assert.ok(section.indexOf('id="jr-abc1234-endsum"') < section.indexOf('id="jr-abc1234-endtabs"') && section.indexOf('id="jr-abc1234-endtabs"') < section.indexOf('id="jr-abc1234-g-stages"'), 'in that order');
    assert.deepEqual([...section.matchAll(/<div class="jt-rules" role="tabpanel" id="jr-abc1234-g-([a-z]+)"( hidden)?>/g)].map(m => [m[1], !m[2]]), HEADS.map(g => [g, g === 'stages']), 'every heading\'s rules are in the page; only the open one\'s are shown');
    // every rule a card, under its heading, in the list's order
    const cards = [...section.matchAll(/<div class="jt-rule" id="jr-abc1234-r-([a-z_]+)"><label class="jt-rule-head"><span class="jt-rule-what"><b>([^<]+)<\/b><span>([^<]+)<\/span><\/span><input type="checkbox" class="switch" data-jt-end value="([a-z_]+)"( checked)?><\/label>/g)];
    assert.deepEqual(cards.map(m => m[1]), ['arrive', 'leave', ...RULES]);
    assert.ok(cards.every(m => m[1] === m[4] && m[5]), 'the switch is the rule\'s own, and every rule that is saved is on');
    assert.deepEqual(Object.fromEntries(cards.map(m => [m[1], m[2]])), TITLES);
    assert.ok(cards.every(m => m[3].length > 20), 'each with a line that says what it means');
    const groups = section.split('<div class="jt-rules" role="tabpanel"').slice(1).map(g => [...g.matchAll(/data-jt-end value="([a-z_]+)"/g)].map(m => m[1]));
    assert.deepEqual(groups, [['arrive', 'leave'], ...Object.values(GROUPS)]);
    open({ trigger: 'manual' });
    assert.doesNotMatch(modal().body, /data-jt-end value="[a-z_]+" checked/, 'nothing saved: nothing on');
    assert.doesNotMatch(modal().body, /stopmode|data-jt-stop|data-jt-on|jt-on-label|class="jr-check"><input type="checkbox" data-jt-end/, 'the one stage list, the three ticks and the long list of ticks of before are gone');
  });
  test('the tabs: the eight headings in the list\'s order, each with its icon, the open one marked — and how many of its rules are on', () => {
    fill();
    const tabs = (open, ends) => [...F.journeyStopTabsHtml(open, ends).matchAll(/<button type="button" role="tab" class="jt-cat" data-jt-ecat="([a-z]+)" aria-selected="(true|false)"><svg class="ic " aria-hidden="true"><use href="#i-([a-z-]+)"\/><\/svg><span>([^<]+)<\/span>(?:<span class="jt-cat-n" title="(\d+) switched on">(\d+)<\/span>)?<\/button>/g)];
    const none = tabs('deal', []);
    assert.deepEqual(none.map(m => m[1]), HEADS);
    assert.deepEqual(none.map(m => m[4]), ['Stages', 'Deal', 'Contact', 'Calls (fonio)', 'Meetings', 'Tasks', 'Time', 'Other']);
    assert.deepEqual(none.filter(m => m[2] === 'true').map(m => m[1]), ['deal']);
    assert.ok(none.every(m => m[6] === undefined), 'nothing on: no number anywhere');
    for (const m of none) assert.ok(read('public/index.html').includes(`<symbol id="i-${m[3]}"`), `the icon of ${m[1]} is in the sprite`);
    assert.equal(new Set(none.map(m => m[3])).size, 8, 'each heading its own icon');
    const some = tabs('stages', ['arrive', 'leave', 'urgency', 'opt_out', 'document', 'contact_field', 'max_days', 'weather']);
    assert.deepEqual(Object.fromEntries(some.map(m => [m[1], m[6] || '0'])), { stages: '2', deal: '1', contact: '3', calls: '0', meetings: '0', tasks: '0', time: '1', other: '0' });
    assert.ok(some.every(m => m[5] === m[6]), 'the number it shows is the number it says');
    fill({ lang: 'de' });
    assert.match(F.journeyStopTabsHtml('stages', ['arrive']), /data-jt-ecat="stages" aria-selected="true">.*<span>Phasen<\/span><span class="jt-cat-n" title="1 eingeschaltet">1<\/span>/);
  });
  test('the heading a rule stands under', () => {
    assert.deepEqual(['arrive', 'leave', ...RULES].map(F.journeyStopGroup), ['stages', 'stages', 'deal', 'deal', 'deal', 'contact', 'contact', 'contact', 'contact', 'calls', 'calls', 'calls', 'meetings', 'meetings', 'tasks', 'time', 'other']);
    for (const odd of ['weather', '', undefined, 'constructor', 'stages']) assert.equal(F.journeyStopGroup(odd), null, String(odd));
    assert.deepEqual(constOf('JOURNEY_STOP_PARTS'), { endarrive: 'arrive', endleave: 'leave', endurgency: 'urgency', endfield: 'field', endcfield: 'contact_field', endresults: 'call_result', enddays: 'max_days', endflow: 'other_flow' });
    const config = sliceFn(js, 'journeyStartConfig', 'journey-start.js');
    for (const part of Object.keys(constOf('JOURNEY_STOP_PARTS'))) assert.ok(config.includes(`part: '${part}'`) || config.includes("part: 'end' + rule"), `${part} is a field a rule can miss`);
  });
  test('what a rule that is on was set to, in a few words — and whether it still lacks something', () => {
    fill();
    const now = F.journeyStartState({ ...BASE, trigger: 'manual', ...ALL }), said = (rule, more = {}) => F.journeyStopDetail(rule, { ...now, ...more });
    assert.deepEqual(said('arrive'), { text: 'Booked (Sales)', missing: false });
    assert.deepEqual(said('leave'), { text: 'New (Sales), Enquiry (Rentals)', missing: false });
    assert.deepEqual(said('urgency'), { text: 'at least "High"', missing: false });
    assert.deepEqual(said('field'), { text: 'Finanzierung: ja', missing: false });
    assert.deepEqual(said('contact_field'), { text: 'Kundenstatus: any value', missing: false });
    assert.deepEqual(said('document'), { text: 'Contract', missing: false });
    assert.deepEqual(said('document', { enddoc: '' }), { text: 'Any document', missing: false }, 'no kind is a choice too');
    assert.deepEqual(said('call_result'), { text: 'Interested, Not interested', missing: false });
    assert.deepEqual(said('max_days'), { text: '30 days', missing: false });
    assert.deepEqual(said('max_days', { enddays: '1' }), { text: '1 day', missing: false });
    assert.deepEqual(said('other_flow'), { text: 'After the viewing', missing: false });
    for (const rule of RULES.filter(k => !(k in USES))) assert.deepEqual(said(rule), { text: '', missing: false }, `${rule} needs nothing and says nothing more`);
    // what is missing — or names something that is gone — is missing
    for (const [rule, more] of [['arrive', { arrive: [] }], ['arrive', { arrive: [999] }], ['leave', { leave: [] }], ['urgency', { endurgency: '' }], ['urgency', { endurgency: '9' }], ['urgency', { endurgency: 'constructor' }],
      ['field', { endfield: '' }], ['field', { endfield: 'weg' }], ['field', { endfield: 'kundenstatus' }], ['contact_field', { endcfield: 'finanzierung' }], ['call_result', { endresults: [] }], ['call_result', { endresults: ['toString'] }],
      ['max_days', { enddays: '' }], ['max_days', { enddays: '0' }], ['max_days', { enddays: '366' }], ['max_days', { enddays: '1.5' }], ['other_flow', { endflow: '' }], ['other_flow', { endflow: '555' }]]) {
      assert.deepEqual(said(rule, more), { text: '', missing: true }, `${rule} ${JSON.stringify(more)}`);
    }
    for (const odd of ['weather', 'constructor', undefined]) assert.deepEqual(said(odd), { text: '', missing: false }, String(odd));
    fill({ list: [SALES] });
    assert.equal(F.journeyStopDetail('leave', { ...now, leave: [31, 32] }).text, 'New, Booked', 'one pipeline: its name is not repeated');
    fill({ lang: 'de' });
    assert.deepEqual([F.journeyStopDetail('urgency', now).text, F.journeyStopDetail('contact_field', now).text, F.journeyStopDetail('max_days', now).text], ['mindestens „Hoch“', 'Kundenstatus: jeder Wert', '30 Tage']);
  });
  test('what is switched on, as the list on top: each rule a row with what it was set to, a way to it and a cross', () => {
    fill();
    const now = F.journeyStartState({ ...BASE, trigger: 'manual', ...ALL }), list = F.journeyStopSummaryHtml(now);
    assert.match(list, /^<div class="jt-now-head"><span>Switched on<\/span><span class="badge">17<\/span><\/div><ul class="jt-now-list"><li class="jt-now-row">/);
    const rows = [...list.matchAll(/<li class="jt-now-row"><span class="jt-now-ic"><svg class="ic " aria-hidden="true"><use href="#i-([a-z-]+)"\/><\/svg><\/span><button type="button" class="jt-now-what" data-jt-goto="([a-z_]+)" title="Show this rule"><b>([^<]+)<\/b>(?:<span>([^<]*)<\/span>)?<\/button><button type="button" class="iconbtn jt-now-x" data-jt-off="([a-z_]+)" aria-label="Switch off: ([^"]+)" title="Switch off: [^"]+"><svg[^>]*><use href="#i-x"\/><\/svg><\/button><\/li>/g)];
    assert.deepEqual(rows.map(m => m[2]), ['arrive', 'leave', ...RULES], 'in the list\'s order');
    assert.ok(rows.every(m => m[2] === m[5] && m[3] === TITLES[m[2]] && m[6] === m[3]), 'each row is its rule\'s: its name, its way, its cross');
    // the icon of a row is the icon of its rule's tab
    const tabIcon = Object.fromEntries([...F.journeyStopTabsHtml('stages', []).matchAll(/data-jt-ecat="([a-z]+)" aria-selected="(?:true|false)"><svg class="ic " aria-hidden="true"><use href="#i-([a-z-]+)"\/>/g)].map(m => [m[1], m[2]]));
    assert.equal(Object.keys(tabIcon).length, 8);
    for (const m of rows) assert.equal(m[1], tabIcon[F.journeyStopGroup(m[2])], `${m[2]}: the icon of its heading`);
    assert.deepEqual(Object.fromEntries(rows.filter(m => m[4] !== undefined).map(m => [m[2], m[4]])), { arrive: 'Booked (Sales)', leave: 'New (Sales), Enquiry (Rentals)', urgency: 'at least &quot;High&quot;',
      field: 'Finanzierung: ja', contact_field: 'Kundenstatus: any value', document: 'Contract', call_result: 'Interested, Not interested', max_days: '30 days', other_flow: 'After the viewing' });
    assert.ok(list.endsWith('</li></ul>'));
    // a rule that is on and still lacks what it needs says so, in the colour of a warning
    const lacking = F.journeyStopSummaryHtml({ ...now, ends: ['arrive', 'max_days', 'meeting'], arrive: [], enddays: '' });
    assert.equal(count(lacking, '<span class="is-missing">still needs a setting</span>'), 2);
    assert.match(lacking, /<b>A meeting is booked<\/b><\/button>/, 'a rule without settings is its name alone');
    assert.match(lacking, /<span class="badge">3<\/span>/);
    // nothing on: said in words
    assert.equal(F.journeyStopSummaryHtml({ ...now, ends: [] }), '<p class="jt-now-none">No rule is switched on. Every deal runs through to the last step.</p>');
    assert.equal(F.journeyStopSummaryHtml({ ...now, ends: ['weather', 'constructor'] }), '<p class="jt-now-none">No rule is switched on. Every deal runs through to the last step.</p>', 'a tick that is no rule is none');
    fill({ lang: 'de' });
    assert.match(F.journeyStopSummaryHtml({ ...now, ends: ['arrive'], arrive: [] }), /<span>Eingeschaltet<\/span><span class="badge">1<\/span>.*<b>Der Deal kommt in eine Phase<\/b><span class="is-missing">braucht noch eine Angabe<\/span>.*aria-label="Ausschalten: Der Deal kommt in eine Phase"/);
  });
  test('in the window: inside a rule\'s card, what that rule needs — filled with what was saved; stages and call results as chips', () => {
    open({ trigger: 'manual', ...ALL });
    const body = modal().body, card = rule => { const at = body.indexOf(`<div class="jt-rule" id="jr-abc1234-r-${rule}">`); assert.ok(at > 0, rule); const next = body.indexOf('<div class="jt-rule" id=', at + 10); return body.slice(at, next > 0 ? next : undefined); };
    const set = rule => { const c = card(rule), at = c.indexOf(`<div class="jt-rule-set" id="jr-abc1234-s-${rule}">`); assert.ok(at > 0, `${rule}: its settings are inside its own card, shown because it is on`); return c.slice(at); };
    assert.deepEqual([...body.matchAll(/<div class="jt-rule-set" id="jr-abc1234-s-([a-z_]+)"/g)].map(m => m[1]), ['arrive', 'leave', ...Object.keys(USES)], 'the rules that need something, and no other');
    assert.match(set('arrive'), /^<div class="jt-rule-set" id="jr-abc1234-s-arrive"><div class="jt-chipsets" id="jr-abc1234-endarrive" tabindex="-1"><div class="jt-chipset"><span class="jt-chipset-name">Sales<\/span><div class="jt-chips"><label class="jt-chip"><input type="checkbox" data-jt-arrive value="31"><span>New<\/span><\/label><label class="jt-chip"><input type="checkbox" data-jt-arrive value="32" checked><span>Booked<\/span><\/label><\/div><\/div><div class="jt-chipset"><span class="jt-chipset-name">Rentals<\/span>/);
    assert.deepEqual([...set('leave').matchAll(/data-jt-leave value="(\d+)"( checked)?/g)].map(m => [m[1], !!m[2]]), [['31', true], ['32', false], ['41', true]], 'its own stages, with its own choice');
    assert.doesNotMatch(set('leave'), /data-jt-arrive/);
    assert.match(set('urgency'), /<div class="jt-set"><label class="label" for="jr-abc1234-endurgency">At least<\/label><select class="select" id="jr-abc1234-endurgency"><option value="">— choose —<\/option><option value="1">Low<\/option><option value="2">Medium<\/option><option value="3" selected>High<\/option><option value="4">Very urgent<\/option><\/select><\/div>/);
    assert.match(set('field'), /<div class="jt-pair"><div class="jt-set"><label class="label" for="jr-abc1234-endfield">Which field<\/label><select class="select" id="jr-abc1234-endfield"><option value="">— choose —<\/option><option value="finanzierung" selected>Finanzierung<\/option><option value="einzug">Einzug<\/option><option value="frist">Frist<\/option><\/select><p class="help">Fields are added in Settings\.<\/p><\/div>/);
    assert.match(set('field'), /<div class="jt-set"><label class="label" for="jr-abc1234-endvalue">Only when its value is \(optional\)<\/label><input class="input" id="jr-abc1234-endvalue" maxlength="200" autocomplete="off" value="ja"><p class="help">Empty: any value ends it\.<\/p><\/div><\/div>/, 'the field and its value side by side');
    assert.match(set('contact_field'), /id="jr-abc1234-endcfield"><option value="">— choose —<\/option><option value="kundenstatus" selected>Kundenstatus<\/option><\/select>/, 'the contact\'s fields, not the deal\'s');
    assert.match(set('contact_field'), /id="jr-abc1234-endcvalue" maxlength="200" autocomplete="off" value="">/);
    assert.match(set('document'), /<label class="label" for="jr-abc1234-enddoc">Which kind of document<\/label><select class="select" id="jr-abc1234-enddoc"><option value="">Any document<\/option><option value="vertrag" selected>Contract<\/option><option value="aufnahme">Recording<\/option><option value="sonstiges">Other<\/option><\/select>/);
    assert.match(set('call_result'), /<div class="jt-set"><span class="label">Which results<\/span><div class="jt-chips" id="jr-abc1234-endresults" tabindex="-1"><label class="jt-chip"><input type="checkbox" data-jt-res value="interested" checked><span>Interested<\/span><\/label>/);
    assert.deepEqual([...set('call_result').matchAll(/data-jt-res value="([a-z_]+)"( checked)?/g)].map(m => [m[1], !!m[2]]), server.RESULTS.map(r => [r, ['interested', 'not_interested'].includes(r)]));
    assert.match(set('max_days'), /<label class="label" for="jr-abc1234-enddays">How many days<\/label><input class="input jt-num" id="jr-abc1234-enddays" type="number" min="1" max="365" step="1" inputmode="numeric" value="30">/);
    assert.match(set('other_flow'), /<label class="label" for="jr-abc1234-endflow">Which workflow<\/label><select class="select" id="jr-abc1234-endflow"><option value="">— choose —<\/option><option value="11" selected>After the viewing<\/option><\/select>/);
    assert.doesNotMatch(set('other_flow'), /<option value="10"/, 'never the workflow itself');
    for (const rule of RULES.filter(k => !(k in USES))) { assert.equal(body.includes(`id="jr-abc1234-s-${rule}"`), false, `${rule} needs nothing`); assert.match(card(rule), /data-jt-end value="[a-z_]+" checked><\/label><\/div>/, `${rule}: a card of two lines and a switch`); }
    // a rule that is off has its settings in the page all the same — hidden — so that they are there to be read and shown at once
    open({ trigger: 'manual' });
    assert.equal(count(modal().body, '<div class="jt-rule-set" id="jr-abc1234-s-'), 2 + Object.keys(USES).length);
    assert.equal(count(modal().body, '" hidden><div class="jt-chipsets"') + count(modal().body, '" hidden><div class="jt-set">') + count(modal().body, '" hidden><div class="jt-pair">'), 2 + Object.keys(USES).length, 'each of them hidden');
    assert.doesNotMatch(modal().body, /class="jr-check"><input type="checkbox" data-jt-(arrive|leave|res)/, 'no stage and no result is a plain tick box any more');
  });
  test('no other workflow yet: the rule says so where its list would be', () => {
    open({ trigger: 'manual' }, { flows: [FLOW] });
    assert.match(modal().body, /<div class="jt-rule-set" id="jr-abc1234-s-other_flow" hidden><input type="hidden" id="jr-abc1234-endflow" value=""><p class="help">There is no other workflow yet\.<\/p><\/div>/);
  });
  test('the window opens on the tab of the first rule that is on — and on "Stages" where none is', () => {
    const openOn = config => { open({ trigger: 'manual', ...config }); const body = modal().body; return [...body.slice(body.indexOf(PANEL)).matchAll(/data-jt-ecat="([a-z]+)" aria-selected="true"/g)].map(m => m[1]); };
    assert.deepEqual(openOn({}), ['stages']);
    assert.deepEqual(openOn({ stop_on: ['max_days'], stop_set: { max_days: { days: 30 } } }), ['time']);
    assert.deepEqual(openOn({ stop_on: ['meeting', 'other_flow'], stop_set: { other_flow: { flow_id: 11 } } }), ['meetings'], 'the first of them in the list\'s order');
    assert.deepEqual(openOn({ stay_stage_ids: [31], stop_on: ['opt_out'] }), ['stages']);
    open({ trigger: 'manual', stop_on: ['call_result'], stop_set: { call_result: { results: ['interested'] } } });
    const shownPanels = () => HEADS.filter(g => F.__page().fields['g-' + g].hidden === false);
    assert.deepEqual(shownPanels(), ['calls'], 'and only that tab\'s cards are shown');
    assert.match(modal().body, /<div class="jt-rules" role="tabpanel" id="jr-abc1234-g-calls">/);
  });
  test('a tab shows its heading\'s rules and no other; what is on anywhere stays on and is counted on its tab', () => {
    open({ trigger: 'manual', stop_stage_ids: [32], stop_on: ['max_days'], stop_set: { max_days: { days: 30 } } });
    const { fields, handlers } = F.__page(), shownPanels = () => HEADS.filter(g => fields['g-' + g].hidden === false);
    assert.deepEqual(shownPanels(), ['stages']);
    handlers['click [data-jt-ecat]']({}, { dataset: { jtEcat: 'time' } });
    assert.deepEqual(shownPanels(), ['time']);
    assert.match(fields.endtabs.innerHTML, /data-jt-ecat="time" aria-selected="true">.*?<span>Time<\/span><span class="jt-cat-n" title="1 switched on">1<\/span>/);
    assert.match(fields.endtabs.innerHTML, /data-jt-ecat="stages" aria-selected="false">.*?<span>Stages<\/span><span class="jt-cat-n" title="1 switched on">1<\/span>/, 'the tab that was left still says what is on behind it');
    assert.equal(fields['[data-jt-ecat="time"]'].focused, 1, 'the tabs were drawn again: the keyboard stays on the one that was pressed');
    assert.equal(fields['s-arrive'].hidden, false, 'what a rule needs stays open in its card, on a tab that is not shown');
    for (const odd of ['weather', 'constructor', '', undefined]) { handlers['click [data-jt-ecat]']({}, { dataset: { jtEcat: odd } }); assert.deepEqual(shownPanels(), ['time'], `no tab called ${odd}`); }
    assert.equal(modal().beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'looking at another tab is no change');
  });
  test('what a rule needs is shown only while the rule is ticked', () => {
    open({ trigger: 'manual' });
    const shown = () => ['arrive', 'leave', ...Object.keys(USES)].filter(rule => F.__page().fields['s-' + rule].hidden === false);
    const tick = (...rules) => { F.__list('[data-jt-end]', ['arrive', 'leave', ...RULES].map(v => ({ value: v, checked: rules.includes(v) }))); F.__page().handlers['change [data-jt-end]'](); };
    assert.deepEqual(shown(), [], 'nothing ticked: nothing of it');
    assert.equal(['arrive', 'leave', ...Object.keys(USES)].every(rule => F.__page().fields['s-' + rule].hidden === true), true);
    tick('urgency');
    assert.deepEqual(shown(), ['urgency']);
    tick('arrive', 'leave', 'call_result', 'assigned', 'meeting');
    assert.deepEqual(shown(), ['arrive', 'leave', 'call_result'], 'a rule that needs nothing shows nothing');
    tick(...RULES);
    assert.deepEqual(shown(), Object.keys(USES));
    tick();
    assert.deepEqual(shown(), []);
    // a saved start opens with the settings of its ticked rules open
    open({ trigger: 'manual', stop_stage_ids: [32], stop_on: ['max_days'], stop_set: { max_days: { days: 30 } } });
    assert.deepEqual(shown(), ['arrive', 'max_days']);
    // ticking takes an old message away
    F.__fill({ err: '' });   // the window's line for what is missing
    F.__page().fields.err.hidden = false;
    F.__page().handlers['change [data-jt-end]']();
    assert.equal(F.__page().fields.err.hidden, true);
  });
  test('the list on top says at once what is switched on, chosen or typed', () => {
    open({ trigger: 'manual' });
    const { fields, handlers } = F.__page();
    assert.equal(fields.endsum.innerHTML, '<p class="jt-now-none">No rule is switched on. Every deal runs through to the last step.</p>');
    F.__list('[data-jt-end]', [{ value: 'arrive', checked: true }, { value: 'max_days', checked: true }]);
    handlers['change [data-jt-end]']();
    assert.match(fields.endsum.innerHTML, /<span class="badge">2<\/span>/);
    assert.equal(count(fields.endsum.innerHTML, '<span class="is-missing">still needs a setting</span>'), 2, 'on, and nothing chosen yet');
    assert.match(fields.endtabs.innerHTML, /<span>Stages<\/span><span class="jt-cat-n" title="1 switched on">1<\/span>.*<span>Time<\/span><span class="jt-cat-n" title="1 switched on">1<\/span>/);
    F.__list('[data-jt-arrive]', [{ value: '32', checked: true }, { value: '41', checked: true }]);   // two chips chosen
    F.__fill({ enddays: '14' });                                                                  // a number typed
    handlers['input .jt-rule-set input']();
    assert.match(fields.endsum.innerHTML, /<b>The deal arrives in a stage<\/b><span>Booked \(Sales\), Enquiry \(Rentals\)<\/span>/);
    assert.match(fields.endsum.innerHTML, /<b>After a number of days<\/b><span>14 days<\/span>/);
    assert.doesNotMatch(fields.endsum.innerHTML, /is-missing/);
    // a list — a level, a field, a kind of document, another workflow — is read on its change
    F.__list('[data-jt-end]', [{ value: 'urgency', checked: true }]);
    F.__fill({ endurgency: '4' });
    handlers['change select']();
    assert.match(fields.endsum.innerHTML, /<b>The urgency reaches a level<\/b><span>at least &quot;Very urgent&quot;<\/span>/);
    const fn = sliceFn(js, 'openJourneyStart', 'journey-start.js');
    assert.match(fn, /on\(w\.m\.el, 'input', '\.jt-rule-set input', syncEnds\);/);
    assert.match(fn, /show\('w-flow', uses\.includes\('flow_id'\)\); show\('w-pipeline', !!trigger\); show\('w-stop', !!trigger\);\s+syncEnds\(\);\s+\};/, 'whatever redraws the start redraws where it ends');
  });
  test('the cross of a row switches its rule off — what was set in its card stays there, and is not sent', async () => {
    fill({ flows: [{ ...FLOW, nodes: [startBox({ trigger: 'manual', stop_stage_ids: [32], stop_on: ['max_days', 'meeting'], stop_set: { max_days: { days: 30 } } })] }, OTHER], answers: { 'put /api/journey/nodes/20': { flow: FLOW } } });
    const config = { trigger: 'manual', stop_stage_ids: [32], stop_on: ['max_days', 'meeting'], stop_set: { max_days: { days: 30 } } };
    form(F.journeyStartShown(F.journeyStartState({ ...BASE, ...config }), 10));
    F.openJourneyStart(startBox(config));
    const { fields, handlers } = F.__page(), rows = () => [...fields.endsum.innerHTML.matchAll(/data-jt-off="([a-z_]+)"/g)].map(m => m[1]);
    assert.deepEqual(rows(), ['arrive', 'meeting', 'max_days']);
    F.__fill({ err: '' });   // the window's line for what is missing
    fields.err.hidden = false;
    handlers['click [data-jt-off]']({}, { dataset: { jtOff: 'max_days' } });
    assert.deepEqual(rows(), ['arrive', 'meeting']);
    assert.match(fields.endsum.innerHTML, /<span class="badge">2<\/span>/);
    assert.equal(fields['s-max_days'].hidden, true, 'its card closes');
    assert.equal(fields.enddays.value, '30', 'what was typed there is left alone');
    assert.equal(fields.err.hidden, true, 'an old message goes');
    assert.equal(fields.endsum.focused, 1, 'the row is gone: the keyboard stays in the list');
    handlers['click [data-jt-off]']({}, { dataset: { jtOff: 'weather' } });
    assert.deepEqual(rows(), ['arrive', 'meeting'], 'a cross for nothing switches nothing off');
    await handlers['click [data-jr-save]']();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2], { config: { trigger: 'manual', stop_stage_ids: [32], stop_on: ['meeting'] } });
  });
  test('a row of the list leads to its rule: the rule\'s tab opens and the keyboard is on its switch', () => {
    open({ trigger: 'manual', stop_stage_ids: [32], stop_on: ['other_flow'], stop_set: { other_flow: { flow_id: 11 } } });
    const { fields, handlers } = F.__page(), shownPanels = () => HEADS.filter(g => fields['g-' + g].hidden === false);
    assert.deepEqual(shownPanels(), ['stages']);
    handlers['click [data-jt-goto]']({}, { dataset: { jtGoto: 'other_flow' } });
    assert.deepEqual(shownPanels(), ['other']);
    assert.equal(fields['[data-jt-end][value="other_flow"]'].focused, 1);
    handlers['click [data-jt-goto]']({}, { dataset: { jtGoto: 'weather' } });
    assert.deepEqual(shownPanels(), ['other'], 'a row for nothing leads nowhere');
  });
  test('what is missing in the card of a rule on another tab: that tab opens before the cursor goes there', async () => {
    for (const [rule, part, group] of [['urgency', 'endurgency', 'deal'], ['contact_field', 'endcfield', 'contact'], ['call_result', 'endresults', 'calls'], ['max_days', 'enddays', 'time'], ['other_flow', 'endflow', 'other'], ['leave', 'endleave', 'stages']]) {
      fill();
      F.openJourneyStart(startBox());
      F.__fill({ trigger: 'manual', from: 'all', when: 'on', at: '09:00' });
      F.__list('[data-jt-end]', [{ value: rule, checked: true }]);
      F.__page().handlers['click [data-jt-ecat]']({}, { dataset: { jtEcat: group === 'meetings' ? 'stages' : 'meetings' } });   // looking somewhere else
      await F.__page().handlers['click [data-jr-save]']();
      const { fields } = F.__page();
      assert.deepEqual(HEADS.filter(g => fields['g-' + g].hidden === false), [group], `${rule}: its tab is the one shown`);
      assert.equal(fields[part].focused, 1, `${rule}: and the cursor is in ${part}`);
      assert.equal(fields.err.hidden, false);
    }
    // what the START is missing changes no tab of the end rules
    fill();
    F.openJourneyStart(startBox());
    F.__fill({ trigger: 'stage', stage: '', from: 'all', when: 'on', at: '09:00' });
    F.__page().handlers['click [data-jt-ecat]']({}, { dataset: { jtEcat: 'tasks' } });
    await F.__page().handlers['click [data-jr-save]']();
    assert.deepEqual(HEADS.filter(g => F.__page().fields['g-' + g].hidden === false), ['tasks']);
    assert.equal(F.__page().fields.stage.focused, 1);
  });
  test('what is ticked and set is read from the window and sent', async () => {
    fill({ answers: { 'put /api/journey/nodes/20': { flow: FLOW } } });
    F.openJourneyStart(startBox());
    F.__fill({ trigger: 'manual', from: 'all', when: 'on', at: '09:00', endurgency: '2', endfield: 'einzug', endvalue: '  bald ', endcfield: 'kundenstatus', endcvalue: '', enddoc: '', enddays: ' 14 ', endflow: '11' });
    F.__list('[data-jt-end]', [{ value: 'other_flow', checked: true }, { value: 'max_days', checked: true }, { value: 'call_result', checked: true }, { value: 'document', checked: true }, { value: 'contact_field', checked: true },
      { value: 'field', checked: true }, { value: 'urgency', checked: true }, { value: 'leave', checked: true }, { value: 'arrive', checked: true }, { value: 'assigned', checked: false }, { value: 'constructor', checked: true }]);
    F.__list('[data-jt-arrive]', [{ value: '41', checked: true }, { value: '32', checked: true }, { value: '31', checked: false }]);
    F.__list('[data-jt-leave]', [{ value: '31', checked: true }]);
    F.__list('[data-jt-res]', [{ value: 'not_reached', checked: true }, { value: 'interested', checked: true }, { value: 'callback', checked: false }, { value: 'toString', checked: true }]);
    await F.__page().handlers['click [data-jr-save]']();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2], { config: { trigger: 'manual', stop_stage_ids: [32, 41], stay_stage_ids: [31], stop_on: ['urgency', 'field', 'contact_field', 'document', 'call_result', 'max_days', 'other_flow'],
      stop_set: { urgency: { min_urgency: 2 }, field: { field_key: 'einzug', value: 'bald' }, contact_field: { field_key: 'kundenstatus' }, call_result: { results: ['interested', 'not_reached'] }, max_days: { days: 14 }, other_flow: { flow_id: 11 } } } });
    assert.ok(F.__page().log.some(c => c[0] === 'close'));
  });
  test('what stands under a rule that is not ticked is not sent, and is no change either', async () => {
    fill({ answers: { 'put /api/journey/nodes/20': { flow: FLOW } } });
    F.openJourneyStart(startBox());
    F.__fill({ trigger: 'manual', from: 'all', when: 'on', at: '09:00', endurgency: '4', endfield: 'einzug', endvalue: 'x', endcfield: 'kundenstatus', endcvalue: 'y', enddoc: 'vertrag', enddays: '9', endflow: '11' });
    F.__list('[data-jt-end]', [{ value: 'urgency', checked: false }, { value: 'meeting', checked: true }]);
    F.__list('[data-jt-arrive]', [{ value: '31', checked: true }]); F.__list('[data-jt-leave]', [{ value: '32', checked: true }]); F.__list('[data-jt-res]', [{ value: 'interested', checked: true }]);
    await F.__page().handlers['click [data-jr-save]']();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2], { config: { trigger: 'manual', stop_stage_ids: [], stop_on: ['meeting'] } });
    // a rule ticked, filled in and unticked again leaves the window as it was: nothing to ask about
    open({ trigger: 'manual', stop_on: ['meeting'] });
    F.__fill({ endurgency: '4', endfield: 'einzug', endvalue: 'x', endcfield: 'kundenstatus', endcvalue: 'y', enddoc: 'vertrag', enddays: '9', endflow: '11' });
    F.__list('[data-jt-arrive]', [{ value: '31', checked: true }]); F.__list('[data-jt-leave]', [{ value: '32', checked: true }]); F.__list('[data-jt-res]', [{ value: 'interested', checked: true }]);
    assert.equal(modal().beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'nothing to ask about');
    // … while ticking a rule is a change
    F.__list('[data-jt-end]', [{ value: 'meeting', checked: true }, { value: 'assigned', checked: true }]);
    F.__opt('unsaved', false);
    assert.equal(modal().beforeClose(), false);
    assert.ok(F.__page().log.some(c => c[0] === 'unsaved?'));
  });
  test('a ticked rule with nothing under it: said in the window, the cursor there, nothing sent', async () => {
    const cases = [[['arrive'], {}, 'Choose at least one stage.', 'endarrive'], [['leave'], {}, 'Choose at least one stage.', 'endleave'], [['urgency'], { endurgency: '' }, 'Choose a level.', 'endurgency'],
      [['field'], { endfield: '' }, 'Choose a field.', 'endfield'], [['contact_field'], { endcfield: '' }, 'Choose a field.', 'endcfield'], [['call_result'], {}, 'Choose at least one result.', 'endresults'],
      [['max_days'], { enddays: '0' }, 'The days are a whole number from 1 to 365.', 'enddays'], [['other_flow'], { endflow: '' }, 'Choose a workflow.', 'endflow']];
    for (const [rules, values, said, part] of cases) {
      fill();
      F.openJourneyStart(startBox());
      F.__fill({ trigger: 'manual', from: 'all', when: 'on', at: '09:00', ...values });
      F.__list('[data-jt-end]', rules.map(v => ({ value: v, checked: true })));
      await F.__page().handlers['click [data-jr-save]']();
      const { fields, log } = F.__page();
      assert.equal(fields.err.textContent, said, rules[0]); assert.equal(fields.err.hidden, false);
      assert.equal(fields[part].focused, 1, `${rules[0]}: the cursor goes to ${part}`);
      assert.ok(!log.some(c => c[0] === 'put'), rules[0]);
    }
  });
  test('the window\'s values come back in the order it opened with: the two are compared as they are written', () => {
    open({ trigger: 'manual', ...ALL });
    const fn = sliceFn(js, 'openJourneyStart', 'journey-start.js');
    assert.match(fn, /return Object\.fromEntries\(Object\.keys\(start\)\.map\(k => \[k, now\[k\]\]\)\);/);
    assert.equal(modal().beforeClose(), true, 'a start with every rule set, untouched');
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'));
    // the ticked rules are read as the list has them, whatever order the ticks come in — and a tick that is no rule is none
    open({ trigger: 'manual', stop_on: ['assigned', 'meeting'] });
    F.__list('[data-jt-end]', [{ value: 'meeting', checked: true }, { value: 'constructor', checked: true }, { value: 'assigned', checked: true }, { value: 'opt_out', checked: false }]);
    assert.equal(modal().beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'the same two rules: nothing to ask about');
  });
  // Part 12's rule, kept: the window opens with what it can still show.
  test('what a rule names and is gone since is not what the window opens with: an untouched window asks nothing', () => {
    fill();
    const gone = { stop_stage_ids: [32, 998], stay_stage_ids: [999, 41], stop_on: ['urgency', 'field', 'contact_field', 'document', 'other_flow'],
      stop_set: { urgency: { min_urgency: 9 }, field: { field_key: 'weg' }, contact_field: { field_key: 'finanzierung', value: 'x' }, document: { doc_type: 'fax' }, other_flow: { flow_id: 555 } } };
    const saved = F.journeyStartState({ ...BASE, trigger: 'manual', ...gone }), shown = F.journeyStartShown(saved, 10);
    assert.deepEqual([saved.arrive, saved.leave, saved.endurgency, saved.endfield, saved.endcfield, saved.enddoc, saved.endflow], [[32, 998], [41, 999], '9', 'weg', 'finanzierung', 'fax', '555'], 'as it was saved');
    assert.deepEqual([shown.arrive, shown.leave, shown.endurgency, shown.endfield, shown.endcfield, shown.enddoc, shown.endflow], [[32], [41], '', '', '', '', ''], 'as the window can show it');
    assert.deepEqual([shown.ends, shown.endcvalue], [saved.ends, 'x'], 'the rules stay ticked, and what was typed stays');
    assert.equal(F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'manual', stop_on: ['other_flow'], stop_set: { other_flow: { flow_id: 10 } } }), 10).endflow, '', 'never the workflow itself');
    assert.equal(F.journeyStartShown(F.journeyStartState({ ...BASE, trigger: 'manual', stop_on: ['other_flow'], stop_set: { other_flow: { flow_id: 11 } } }), 10).endflow, '11');
    open({ trigger: 'manual', ...gone });
    assert.equal(modal().beforeClose(), true);
    assert.ok(!F.__page().log.some(c => c[0] === 'unsaved?'), 'nothing was touched');
    assert.doesNotMatch(modal().body, /value="998"|value="999"|value="555"|value="weg"/, 'what is gone is not offered');
  });
  test('names from the settings are text under the rules too', () => {
    const evil = '<img src=x onerror=alert(1)>';
    fill({ list: [{ id: 3, name: evil, stages: [{ id: 31, name: evil }] }], deal: [{ field_key: 'f', name: evil, type: 'text' }], contact: [{ field_key: 'c', name: evil, type: 'text' }], flows: [FLOW, { ...OTHER, name: evil }] });
    const config = { trigger: 'manual', stop_stage_ids: [31], stop_on: ['field', 'contact_field', 'other_flow'], stop_set: { field: { field_key: 'f', value: '"><b>x</b>' }, contact_field: { field_key: 'c' }, other_flow: { flow_id: 11 } } };
    F.openJourneyStart(startBox(config));
    const body = modal().body, section = body.slice(body.indexOf('id="jr-abc1234-w-stop"'));
    assert.doesNotMatch(section, /<img|<b>x<\/b>/);
    assert.ok(count(section, '&lt;img src=x onerror=alert(1)&gt;') >= 11, 'the pipeline and its stage in both stage rules, the deal field, the contact field, the other workflow — and each again in the list on top');
    assert.match(section, /<b>A deal field has a value<\/b><span>&lt;img src=x onerror=alert\(1\)&gt;: &quot;&gt;&lt;b&gt;x&lt;\/b&gt;<\/span>/, 'what was typed as a value is text in the list on top too');
    assert.match(section, /id="jr-abc1234-endvalue" maxlength="200" autocomplete="off" value="&quot;&gt;&lt;b&gt;x&lt;\/b&gt;">/);
    assert.equal(lines(config).at(-1), `Also ends when: a deal field has a value (${evil}: "><b>x</b>); a contact field has a value (${evil}); the deal is taken into another workflow (${evil})`, 'the box\'s lines are plain text: the box escapes them');
  });
});

describe('the fields a start chooses from', () => {
  test('read with the page: the deal fields and the contact fields', async () => {
    fill({ deal: [], contact: [], answers: { 'get /api/deal-fields': DEAL_FIELDS, 'get /api/fields': CONTACT_FIELDS } });
    await F.loadJourneyStart();
    assert.deepEqual(F.__page().log.map(c => c[1]).sort(), ['/api/deal-fields', '/api/fields']);
    assert.deepEqual([F.__state().journeyDealFields.length, F.__state().journeyContactFields.length], [3, 1]);
  });
  test('an error, or a request that never arrived, leaves none — and the page still loads', async () => {
    fill({ answers: { 'get /api/deal-fields': { error: 'x' }, 'get /api/fields': undefined } });
    await F.loadJourneyStart();
    assert.deepEqual([F.__state().journeyDealFields, F.__state().journeyContactFields], [[], []]);
    fill();
    F.__opt('throw', true);
    await assert.doesNotReject(F.loadJourneyStart());
    assert.deepEqual(F.__state().journeyDealFields, []);
  });
  test('logout leaves none behind', () => {
    fill();
    F.resetJourneyStart();
    assert.deepEqual([F.__state().journeyDealFields, F.__state().journeyContactFields], [[], []]);
  });
});

describe('the look', () => {
  test('the categories are a row of tabs that wraps; the open one is filled', () => {
    assert.match(css, /^\.jt-cats \{ display: flex; flex-wrap: wrap; gap: 6px; \}$/m);
    assert.match(css, /^\.jt-cat\[aria-selected="true"\] \{ background: var\(--brand\); border-color: var\(--brand\); color: var\(--on-primary\); \}$/m);
  });
  test('the starts are cards, two side by side, one below the other on a narrow screen; the chosen one is framed', () => {
    assert.match(css, /^\.jt-trigs \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 8px; margin-top: 10px; \}$/m);
    assert.match(css, /^@media \(max-width: 640px\) \{ \.jt-trigs \{ grid-template-columns: 1fr; \} \}$/m);
    assert.match(css, /^\.jt-trig\[aria-checked="true"\] \{ border-color: var\(--brand\); box-shadow: inset 0 0 0 1px var\(--brand\); \}$/m);
    assert.match(css, /^\.jt-trig span \{ font-size: var\(--fs-xs\); color: var\(--text-3\);/m);
  });
  test('where it ends is a panel of its own: a well, with what is on as rows and every rule as a card with a switch', () => {
    assert.match(css, /^\.jt-endbox \{ gap: 10px; padding: 14px; border: 1px solid var\(--border\); border-radius: var\(--r-xl\); background: var\(--surface-sunken\); \}$/m);
    assert.ok(css.indexOf('\n.field { display: flex;') > 0 && css.indexOf('\n.field { display: flex;') < css.indexOf('\n.jt-endbox {'), 'it is a field too: its own gap comes later, so it is the one that counts');
    assert.match(css, /^\.jt-now-row \{ display: flex; align-items: center; gap: 4px; [^}]*background: var\(--surface\); box-shadow: var\(--shadow-sm\); \}$/m);
    assert.match(css, /^\.jt-now-what span\.is-missing \{ color: var\(--warning\); font-weight: 600; \}$/m);
    assert.match(css, /^\.jt-now-none \{[^}]*border: 1px dashed var\(--border-strong\);/m);
    assert.match(css, /^\.jt-rule \{ border: 1px solid var\(--border\); border-radius: var\(--r-lg\); background: var\(--surface\); \}$/m);
    assert.match(css, /^\.jt-rule:has\(> \.jt-rule-head input:checked\) \{ border-color: var\(--brand\); box-shadow: inset 0 0 0 1px var\(--brand\); \}$/m, 'a rule that is on is framed as the chosen start is');
    assert.match(css, /^\.jt-rule-set \{ display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 12px; border-top: 1px solid var\(--divider\); \}$/m);
    assert.match(css, /^\.jt-cat\[aria-selected="true"\] \.jt-cat-n \{ background: var\(--on-primary\); color: var\(--brand\); \}$/m, 'the number stays readable on the filled tab');
    assert.match(css, /^\.jt-pair \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 10px 12px; \}$/m);
    assert.match(css, /^@media \(max-width: 640px\) \{ \.jt-pair \{ grid-template-columns: 1fr; \} \}$/m);
    assert.doesNotMatch(css, /\.jt-(endbox|now|rule|rules|set|pair|chip|chips|chipset|chipsets)[a-z-]*[^{}]*\{[^}]*!important/, 'nothing here outranks the hidden attribute');
    assert.doesNotMatch(css, /\.jt-on\b|\.jt-on-label|\.jt-ends\b|\.jt-end-group|\.jt-end-head|\.jt-end-set|\.jt-results/, 'the styles of the ticks of before are gone');
    for (const cls of ['jt-endbox', 'jt-now', 'jt-now-none', 'jt-now-head', 'jt-now-list', 'jt-now-row', 'jt-now-ic', 'jt-now-what', 'jt-now-x', 'jt-rules-head', 'jt-cat-n', 'jt-rules', 'jt-rule', 'jt-rule-head', 'jt-rule-what',
      'jt-rule-set', 'jt-set', 'jt-pair', 'jt-chipsets', 'jt-chipset', 'jt-chipset-name', 'jt-chips', 'jt-chip']) {
      assert.ok(new RegExp(`class="(?:[a-z-]+ )*${cls}(?: [a-z-]+)*"`).test(js), `${cls} is used by the window`);
      assert.ok(new RegExp(`\\.${cls}(?![a-z-])`).test(css), `${cls} has its style`);
    }
  });
  test('a stage and a call result are chips: a real tick box lies over each, unseen; a chosen one is filled and carries a tick', () => {
    assert.match(css, /^\.jt-chip input \{ position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; \}$/m, 'there for the keyboard and a screen reader, and it takes the click');
    assert.match(css, /^\.jt-chip input:checked \+ span \{ background: var\(--brand\); border-color: var\(--brand\); color: var\(--on-primary\); \}$/m);
    assert.match(css, /^\.jt-chip input:checked \+ span::before \{ content: '✓';/m, 'not by colour alone');
    assert.match(css, /^\.jt-chip input:focus-visible \+ span \{ box-shadow: var\(--focus-ring\); \}$/m);
    assert.match(css, /^\.jt-now-what:focus-visible \{ outline: none; box-shadow: var\(--focus-ring\); \}$/m);
    // the chip's look hangs on the box standing right before the word
    assert.match(sliceFn(js, 'journeyStopHtml', 'journey-start.js'), /<label class="jt-chip"><input type="checkbox" \$\{attr\} value="\$\{esc\(value\)\}"\$\{on \? ' checked' : ''\}><span>\$\{esc\(label\)\}<\/span><\/label>/);
    assert.match(css, /^input\[type="checkbox"\]\.switch,$/m, 'the switch is the app\'s own');
  });
  test('keyboard focus is visible on a tab and on a card; a setting that is hidden stays hidden whatever its class', () => {
    assert.match(css, /^\.jt-cat:focus-visible, \.jt-trig:focus-visible \{ outline: none; box-shadow: var\(--focus-ring\); \}$/m);
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m);
    assert.doesNotMatch(css, /\.field\s*\{[^}]*display:[^}]*!important/, 'no rule of a field outranks hidden');
  });
});
