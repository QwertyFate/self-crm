// CLIENT (static + pure-function) tests for the workflows of the integrations on the Workflows page
// (public/js/journey-fixed.js, CUSTOMER_JOURNEY_CHANGES Part 8, 2026-11-19).
//
// What fonio, the lead webhooks, the Upgrads Engine, Cal.com and Calendly do stands in the list of workflows next to
// the workspace's own. Pinned: they are a group of their own in the list; a workspace without workflows of its own
// sees the first of them; a fixed workflow is read, never edited — its boxes carry none of the hooks the board's
// hands look for; a step the settings switched off is shown as off; the switch is offered to owners and admins only,
// saves the integration's own setting and shows the server's answer; fonio's workflows say why they cannot be
// switched on while fonio is off; Cal.com and Calendly have no switch; "Open settings" lands on the integration's
// own tab; every word is in both dictionaries; typed names never become markup.
//
// journey.js runs here together with journey-fixed.js, as in the page: the list, the toolbar and the board are
// journey.js's, asking this file which workflow is shown.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const core = read('public/js/core.js');
const page = read('public/js/journey.js');
const startJs = read('public/js/journey-start.js');   // a box says what its start is (Part 9): its file rides along
const js   = read('public/js/journey-fixed.js');
const css  = read('public/style.css');
const util = read('utils/journey-fixed.js');
const route = read('routes/journey-fixed.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;
const constOf = name => new Function(`${sliceConst('public/js/journey-fixed.js', name)} return ${name};`)();

// journey.js's part of the page, as it ships
const PAGE_FNS = ['resetJourneyUI', 'journeySend', 'journeyWaitText', 'journeyDurationText', 'journeyWaitLines', 'journeyPipelines', 'journeyFlow', 'journeyStageName', 'journeyLayout', 'journeyChain', 'journeyPlaces', 'journeyCanvasSize', 'journeyLinePath', 'journeyPart', 'journeyEdges', 'journeyRects', 'journeyLinesHtml',
  'loadJourney', 'journeyApply', 'setJourneyFlow', 'journeyBoxHtml', 'journeyBoardHtml', 'journeyDrawLines', 'journeyToolbarHtml', 'renderJourney'];
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  sliceFn(core, 't', 'core.js'),
  sliceFn(core, 'tf', 'core.js'),
  sliceFn(core, 'icon', 'core.js'),
  sliceConst('public/js/journey.js', 'JOURNEY_ICONS'),
  sliceConst('public/js/journey.js', 'JOURNEY_WAIT_DAYS'),
  'const JOURNEY_BOX_W = 300, JOURNEY_PAD = 40, JOURNEY_STEP_Y = 150, JOURNEY_MAX_PLACE = 20000;',
  page.match(/^const JOURNEY_ARROW = .*$/m)[0],
  ...['JOURNEY_FIXED_SOURCES', 'JOURNEY_FIXED_SERVICES', 'JOURNEY_FIXED_NAMES', 'JOURNEY_FIXED_KINDS', 'JOURNEY_FIXED_ICONS', 'JOURNEY_FIXED_BLOCKED', 'JOURNEY_FIXED_ERRORS'].map(n => sliceConst('public/js/journey-fixed.js', n)),
  ...PAGE_FNS.map(n => sliceFn(page, n, 'journey.js')),
  ...['JOURNEY_TRIGGERS', 'JOURNEY_RESULT_KEYS', 'JOURNEY_DOC_KEYS', 'JOURNEY_URGENCY_KEYS', 'JOURNEY_DAY_KEYS', 'JOURNEY_STOP_ON_KEYS'].map(n => sliceConst('public/js/journey-start.js', n)),
  'let journeyDealFields = [], journeyContactFields = [];',
  ...['journeyStartUses', 'journeyStartHours', 'journeyStartDays'].map(n => startJs.match(new RegExp(`^const ${n} = .*$`, 'm'))[0]),
  ...['journeyStartFields', 'journeyStartLines'].map(n => sliceFn(startJs, n, 'journey-start.js')),
  `const __log = [];
   let __answers = {}, __throw = false;
   const __els = {};
   const __el = id => (__els[id] ||= { id, innerHTML: '' });
   const document = { getElementById: id => __el(id) };
   const __answer = (verb, url, body) => { __log.push(body === undefined ? [verb, url] : [verb, url, body]); if (__throw) throw new Error('offline'); return __answers[verb + ' ' + url]; };
   const api = { get: async url => __answer('get', url), put: async (url, b) => __answer('put', url, b) };
   const ui = { toast: m => __log.push(['toast', m]) };
   function switchPage(p) { __log.push(['page', p]); return 'switched'; }
   function switchIntgTab(tab) { __log.push(['tab', tab]); }
   function setFonioPart(part) { __log.push(['part', part]); }
   function updateOnboardingNav() { __log.push(['onboarding-nav']); }
   function __state() { return { journeyFixed, journeyFixedKey, journeyFlows, journeyFlowId, journeyManage, currentWebhookId }; }
   function __reset(answers = {}) { __log.length = 0; __answers = answers; __throw = false; for (const k of Object.keys(__els)) delete __els[k]; }
   function __offline(v) { __throw = v; }
   function __page() { return { log: __log, els: __els }; }`,
].join('\n');
const NAMES = ['resetJourneyFixed', 'loadJourneyFixed', 'journeyFixedShown', 'journeyFixedPick', 'journeyFixedName', 'journeyFixedOptionsHtml', 'journeyFixedStageId', 'journeyFixedSteps', 'journeyFixedStepText',
  'journeyFixedStepHtml', 'journeyFixedBoardHtml', 'journeyFixedToolbarHtml', 'journeyFixedErrorText', 'setJourneyFixedActive', 'openJourneyFixedSettings'];
const F = loadFns('public/js/journey-fixed.js', NAMES, {
  state: { currentLang: 'en', pipelines: [], journeyFlows: [], journeyWebhooks: [], journeyManage: false, journeyLimits: { flows: 20, nodes: 60 }, journeyFlowId: null, journeyFonio: false, journeyDrag: null,
    journeyDragEnd: 0, journeyFixed: [], journeyFixedKey: null, currentWebhookId: null },
  extra, expose: [...PAGE_FNS, '__state', '__reset', '__offline', '__page'],
});

const SALES = { id: 3, name: 'Sales', stages: [{ id: 31, name: 'New' }, { id: 32, name: 'Booked' }] };
const RENT  = { id: 4, name: 'Rentals', stages: [{ id: 41, name: 'Enquiry' }] };
const HOOKS = [{ id: 5, name: 'Website form' }, { id: 6, name: 'Meta Ads' }];
const step = (what, kind, more = {}) => ({ what, kind, off: false, ...more });
const AFTER = [step('fonio_call', 'call', { wait_minutes: 5, hours: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } }), step('fonio_retry', 'call', { max_attempts: 2, no_answer: 120, voicemail: 1440, busy: 0 }),
  step('fonio_callback', 'call'), step('fonio_note', 'note'), step('fonio_meeting', 'meeting', { service: 'calcom' }), step('fonio_stage', 'move', { lines: 3 })];
const FONIO_HOOK = { key: 'fonio-webhook', source: 'fonio', name: null, active: true, switchable: true, blocked: null, steps: [step('lead_webhook', 'start', { webhook_ids: null, pipeline_ids: null }), ...AFTER] };
const FONIO_HAND = { key: 'fonio-manual', source: 'fonio', name: null, active: false, switchable: true, blocked: null, steps: [step('deal_manual', 'start', { pipeline_ids: null }), ...AFTER] };
const HOOK5 = { key: 'webhook-5', source: 'webhook', webhook_id: 5, name: 'Website form', active: true, switchable: true, blocked: null,
  steps: [step('lead_arrives', 'start'), step('lead_contact', 'contact', { assignee_name: 'Olga' }), step('lead_engine', 'engine'), step('lead_deal', 'deal', { pipeline_id: 3, stage_id: 32 }), step('lead_fonio', 'call', { wait_minutes: 5 })] };
const ENGINE = { key: 'engine', source: 'engine', name: null, active: true, switchable: true, blocked: null, steps: [step('engine_stage', 'start', { stage_ids: [32] }), step('engine_handover', 'engine')] };
const CALCOM = { key: 'calcom', source: 'calcom', name: null, active: true, switchable: false, blocked: null,
  steps: [step('booking_arrives', 'start'), step('booking_contact', 'contact', { known_only: false, pipeline_id: 3, stage_id: null }), step('booking_entry', 'meeting'), step('booking_tell', 'notify')] };
const CALENDLY = { ...CALCOM, key: 'calendly', source: 'calendly' };
const ALL = [FONIO_HOOK, FONIO_HAND, HOOK5, ENGINE, CALCOM];
const startBox = (config = {}) => ({ id: 1, kind: 'start', title: '', body: '', wait_minutes: 0, config: { trigger: null, webhook_ids: null, stage_id: null, stop_stage_ids: [], ...config }, next_id: null });
const OWN = { id: 10, name: 'Nurture', active: true, nodes: [startBox({ trigger: 'lead' })] };
function fill({ manage = false, lang = 'en', flows = [], shown = null, fixed = ALL, key = null, list = [SALES, RENT], hooks = HOOKS, answers = {} } = {}) {
  F.__reset(answers);
  F.__set('currentLang', lang); F.__set('pipelines', list); F.__set('journeyFlows', flows); F.__set('journeyWebhooks', hooks); F.__set('journeyManage', manage);
  F.__set('journeyFlowId', shown); F.__set('journeyFixed', fixed); F.__set('journeyFixedKey', key); F.__set('currentWebhookId', null);
}
const said = (s, fx = FONIO_HOOK) => F.journeyFixedStepText(s, fx);

describe('markup and wiring', () => {
  test('the script is loaded once, after the page\'s own', () => {
    assert.equal(count(html, '<script src="js/journey-fixed.js"></script>'), 1);
    assert.ok(html.indexOf('<script src="js/journey.js">') < html.indexOf('<script src="js/journey-fixed.js">'));
  });
  test('the page asks for this file\'s part and works without it', () => {
    for (const fn of ['loadJourneyFixed', 'journeyFixedShown', 'journeyFixedPick', 'journeyFixedOptionsHtml', 'resetJourneyFixed']) {
      assert.ok(page.includes(`typeof ${fn} === 'function'`), fn);
      assert.equal(count(js, `function ${fn}(`), 1, fn);
    }
    assert.match(sliceFn(page, 'loadJourney', 'journey.js'), /typeof loadJourneyFixed === 'function' \? loadJourneyFixed\(\) : null,/);
    assert.match(sliceFn(page, 'resetJourneyUI', 'journey.js'), /if \(typeof resetJourneyFixed === 'function'\) resetJourneyFixed\(\);/);
  });
  test('the refusal codes are the route\'s own; what cannot be switched on has its sentence', () => {
    const codes = [...route.slice(route.indexOf('const ERRORS = {'), route.indexOf('const refuse')).matchAll(/^\s+([a-z_]+):\s+\[/gm)].map(m => m[1]);
    assert.deepEqual(Object.keys(constOf('JOURNEY_FIXED_ERRORS')).sort(), codes.sort());
    const blocked = [...new Set([...util.matchAll(/blocked: [^,]*'([a-z_]+)'/g)].map(m => m[1]))];
    assert.deepEqual(Object.keys(constOf('JOURNEY_FIXED_BLOCKED')), blocked);
  });
  test('every step the server can send has its icon in the sprite, its word above it and its sentence', () => {
    const sent = [...util.matchAll(/step\('([a-z_]+)', '([a-z]+)'/g)].map(m => ({ what: m[1], kind: m[2] }));
    assert.equal(sent.length, 19, 'every step of the utility');
    const icons = constOf('JOURNEY_FIXED_ICONS'), kinds = constOf('JOURNEY_FIXED_KINDS'), text = sliceFn(js, 'journeyFixedStepText', 'journey-fixed.js');
    for (const { what, kind } of [...sent, { what: 'lead_flows', kind: 'flow' }]) {
      assert.ok(icons[what], `icon of ${what}`);
      assert.ok(html.includes(`<symbol id="i-${icons[what]}"`), `the icon of ${what} is in the sprite`);
      assert.ok(kind === 'start' || kinds[kind], `the word for ${kind}`);
      assert.ok(text.includes(`case '${what}':`), `the sentence of ${what}`);
    }
    assert.deepEqual(Object.keys(icons).sort(), [...new Set([...sent.map(s => s.what), 'lead_flows'])].sort(), 'no icon for a step that does not exist');
  });
  test('the sources are the tabs of the Integrations page', () => {
    for (const source of constOf('JOURNEY_FIXED_SOURCES')) assert.equal(count(html, `data-tab="${source}"`), 1, source);
    assert.deepEqual(constOf('JOURNEY_FIXED_SOURCES').sort(), [...new Set([...util.matchAll(/source: '([a-z]+)'/g)].map(m => m[1])), 'calcom', 'calendly'].sort());
  });
});

describe('both dictionaries', () => {
  const used = [...new Set([...js.matchAll(/'(jx_[a-z0-9_]+)'/g)].map(m => m[1]))];
  test('every key the file names exists in English and German, and none is left unused', () => {
    assert.ok(used.length >= 60, `the file's own keys (${used.length})`);
    for (const k of [...used, 'jr_group_own', 'jr_on', 'jr_off', 'jr_switch_aria', 'jr_kind_start', 'jr_err_forbidden', 'jr_err_generic']) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jx_') && !used.includes(k)), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jx_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jx_')).sort());
    assert.ok(!used.some(k => k.endsWith('_')), 'no key is put together at run time');
    for (let d = 1; d <= 7; d++) assert.ok(dict.en['fonio_day_' + d] && dict.de['fonio_day_' + d], `the weekday ${d}`);
  });
  test('the same placeholders in both languages', () => {
    const holes = s => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const k of used) assert.equal(holes(dict.de[k]), holes(dict.en[k]), k);
  });
  test('German speaks to nobody in particular: no du, no Sie', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jx_') || x === 'jr_group_own')) assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
  });
  test('the page calls them workflows, never a customer journey', () => {
    for (const lang of ['en', 'de']) for (const k of Object.keys(dict[lang]).filter(x => x.startsWith('jx_'))) assert.doesNotMatch(dict[lang][k], /journey/i, k);
  });
});

describe('the list of workflows', () => {
  test('a fixed workflow is named by what it is; a lead webhook\'s by the webhook\'s own name; one this page does not know by its key', () => {
    fill();
    assert.deepEqual(ALL.map(F.journeyFixedName), ['fonio: lead from a lead webhook', 'fonio: deal created by hand', 'Lead webhook: Website form', 'Upgrads Engine: hand-over', 'Cal.com: booking']);
    assert.equal(F.journeyFixedName(CALENDLY), 'Calendly: booking');
    assert.equal(F.journeyFixedName({ key: 'something-new', source: 'new' }), 'something-new');
    fill({ lang: 'de' });
    assert.deepEqual(ALL.map(F.journeyFixedName), ['fonio: Lead über einen Lead-Webhook', 'fonio: Deal von Hand angelegt', 'Lead-Webhook: Website form', 'Upgrads Engine: Übergabe', 'Cal.com: Buchung']);
  });
  test('two groups: the workspace\'s own workflows, and those from integrations; the shown one is selected', () => {
    fill({ flows: [OWN], shown: 10 });
    let bar = F.journeyToolbarHtml();
    assert.match(bar, /^<select class="select select-sm jr-pick" aria-label="Workflow" onchange="setJourneyFlow\(this\.value\)"><optgroup label="Own workflows"><option value="10" selected>Nurture<\/option><\/optgroup><optgroup label="From integrations"><option value="fx:fonio-webhook">fonio: lead from a lead webhook<\/option>/);
    assert.equal(count(bar, ' selected'), 1);
    assert.equal(count(bar, '<option value="fx:'), 5);
    fill({ flows: [OWN], shown: 10, key: 'engine' });
    bar = F.journeyToolbarHtml();
    assert.match(bar, /<option value="10">Nurture<\/option>/, 'the own workflow is no longer the selected one');
    assert.match(bar, /<option value="fx:engine" selected>Upgrads Engine: hand-over<\/option>/);
    assert.equal(count(bar, ' selected'), 1);
  });
  test('no workflow of its own yet: the group from integrations alone, and its first one is shown', () => {
    fill();
    assert.equal(F.journeyFixedShown().key, 'fonio-webhook');
    const bar = F.journeyToolbarHtml();
    assert.doesNotMatch(bar, /Own workflows/);
    assert.match(bar, /<optgroup label="From integrations"><option value="fx:fonio-webhook" selected>/);
  });
  test('no integration set up: the list is the workspace\'s own, exactly as without this file; with nothing at all there is no list', () => {
    fill({ flows: [OWN], shown: 10, fixed: [] });
    assert.equal(F.journeyFixedOptionsHtml(), '');
    assert.match(F.journeyToolbarHtml(), /^<select class="select select-sm jr-pick" aria-label="Workflow" onchange="setJourneyFlow\(this\.value\)"><option value="10" selected>Nurture<\/option><\/select>/);
    fill({ fixed: [] });
    assert.equal(F.journeyFixedShown(), null);
    assert.equal(F.journeyToolbarHtml(), '');
  });
  test('with workflows of its own the page shows one of those until a fixed one is chosen', () => {
    fill({ flows: [OWN], shown: 10 });
    assert.equal(F.journeyFixedShown(), null);
    F.setJourneyFlow('fx:engine');
    assert.equal(F.journeyFixedShown().key, 'engine');
    assert.equal(F.__state().journeyFlowId, 10, 'the own workflow that was shown is remembered');
    F.setJourneyFlow('10');
    assert.equal(F.journeyFixedShown(), null);
    F.setJourneyFlow('fx:not-there');
    assert.equal(F.__state().journeyFixedKey, null, 'a key that is no workflow chooses nothing');
    F.journeyFixedPick(5); F.journeyFixedPick(null); F.journeyFixedPick(undefined);
    assert.equal(F.__state().journeyFixedKey, null);
  });
  test('a workflow of its own that was just saved is what the page shows, whatever was chosen before', () => {
    fill({ manage: true, key: 'engine' });
    F.journeyApply(OWN);
    assert.equal(F.__state().journeyFixedKey, null);
    assert.equal(F.journeyFixedShown(), null);
    assert.match(F.__page().els['journey-board'].innerHTML, /^<div class="jr-canvas can-edit"/);
  });
  test('a webhook\'s name is text in the list', () => {
    fill({ fixed: [{ ...HOOK5, name: '<img src=x onerror=alert(1)>"' }] });
    const out = F.journeyFixedOptionsHtml();
    assert.doesNotMatch(out, /<img/);
    assert.match(out, /Lead webhook: &lt;img src=x onerror=alert\(1\)&gt;&quot;/);
  });
});

describe('what a step says', () => {
  test('fonio: what starts it, and who gets the call when that is limited', () => {
    fill();
    assert.deepEqual(said(step('lead_webhook', 'start', { webhook_ids: null, pipeline_ids: null })), { title: 'A lead webhook creates a deal', lines: ['Through every lead webhook'], warn: '' });
    assert.deepEqual(said(step('lead_webhook', 'start', { webhook_ids: [6, 5, 77], pipeline_ids: [4] })).lines, ['Only through: Meta Ads, Website form', 'Only deals in: Rentals']);
    assert.deepEqual(said(step('lead_webhook', 'start', { webhook_ids: [77], pipeline_ids: [99] })).lines,
      ['Only through lead webhooks that no longer exist: nobody is called', 'Only deals in pipelines that no longer exist: nobody is called']);
    assert.deepEqual(said(step('deal_manual', 'start', { pipeline_ids: null }), FONIO_HAND), { title: 'A deal is created by hand', lines: [], warn: '' });
    assert.deepEqual(said(step('deal_manual', 'start', { pipeline_ids: [3, 4] }), FONIO_HAND).lines, ['Only deals in: Sales, Rentals']);
  });
  test('fonio: the call and its hours; trying again with each wait; the callback; the note', () => {
    fill();
    assert.deepEqual(said(AFTER[0]), { title: 'fonio calls the deal\'s contact', lines: ['Only within the calling hours: Mon, Tue, Wed, Thu, Fri, 09:00 to 18:00'], warn: '' });
    assert.deepEqual(said({ ...AFTER[0], hours: null }).lines, ['At any time of day']);
    assert.deepEqual(said(AFTER[1]), { title: 'Nobody answers: fonio calls again', lines: ['Up to 2 more calls. No answer: after 2 hours; voicemail: after 1 day; busy: at once'], warn: '' });
    assert.deepEqual(said({ ...AFTER[1], max_attempts: 1 }).lines, ['One more call. No answer: after 2 hours; voicemail: after 1 day; busy: at once']);
    assert.deepEqual(said({ ...AFTER[1], off: true }).lines, [], 'switched off: no numbers that do not apply');
    assert.deepEqual(said(AFTER[2]), { title: 'The person names a later time: fonio calls back then', lines: [], warn: '' });
    assert.deepEqual(said(AFTER[3]), { title: 'The conversation is noted on the deal and the contact', lines: ['The summary and the transcript, as fonio sends them after the call'], warn: '' });
  });
  test('fonio: a meeting at the service that is connected, a warning when none is, and who books when the CRM does not', () => {
    fill();
    assert.deepEqual(said(AFTER[4]), { title: 'A meeting agreed in the call is booked at Cal.com', lines: [], warn: '' });
    assert.equal(said({ ...AFTER[4], service: 'calendly' }).title, 'A meeting agreed in the call is booked at Calendly');
    assert.deepEqual(said({ ...AFTER[4], service: null }), { title: 'A meeting agreed in the call is booked', lines: [], warn: 'Neither Cal.com nor Calendly is connected: nothing is booked' });
    assert.deepEqual(said({ ...AFTER[4], service: null, off: true }), { title: 'A meeting agreed in the call is booked', lines: ['fonio books the meeting itself'], warn: '' }, 'switched off: no warning about a service nobody needs');
  });
  test('fonio: the deal after the call, by how many rules', () => {
    fill();
    assert.deepEqual(said(AFTER[5]), { title: 'The deal moves by what came out of the call', lines: ['3 rules for stage and urgency'], warn: '' });
    assert.deepEqual(said({ ...AFTER[5], lines: 1 }).lines, ['1 rule for stage and urgency']);
    assert.deepEqual(said({ ...AFTER[5], lines: 0, off: true }).lines, ['No rule is set: the deal stays where it is']);
  });
  test('a lead webhook: the contact and who gets it, the deal and where it lands', () => {
    fill();
    assert.deepEqual(said(HOOK5.steps[0], HOOK5), { title: 'A lead arrives at this lead webhook', lines: [], warn: '' });
    assert.deepEqual(said(HOOK5.steps[1], HOOK5), { title: 'The contact is created', lines: ['A known email address updates the contact that has it', 'Assigned to Olga'], warn: '' });
    assert.deepEqual(said({ ...HOOK5.steps[1], assignee_name: null }, HOOK5).lines, ['A known email address updates the contact that has it']);
    assert.deepEqual(said(HOOK5.steps[2], HOOK5), { title: 'The Upgrads Engine is told of the new or changed customer', lines: [], warn: '' });
    assert.deepEqual(said(HOOK5.steps[3], HOOK5), { title: 'A deal is created', lines: ['In the stage Booked (Sales)'], warn: '' });
    assert.deepEqual(said(step('lead_deal', 'deal', { pipeline_id: 4, stage_id: null }), HOOK5).lines, ['In the stage Enquiry (Rentals)'], 'no stage chosen: the first of its pipeline');
    assert.deepEqual(said(step('lead_deal', 'deal', { pipeline_id: 99, stage_id: null }), HOOK5).lines, ['In the first stage of its pipeline'], 'a pipeline the page does not know');
    assert.deepEqual(said(step('lead_deal', 'deal', { off: true, pipeline_id: null, stage_id: null }), HOOK5).lines, ['Switched off: only the contact is created']);
    assert.deepEqual(said(HOOK5.steps[4], HOOK5), { title: 'fonio calls the lead', lines: ['Continues in the workflow "fonio: lead from a lead webhook"'], warn: '' });
    fill({ list: [SALES] });
    assert.deepEqual(said(HOOK5.steps[3], HOOK5).lines, ['In the stage Booked'], 'one pipeline: the stage alone');
  });
  test('the Engine: its stages by name, a warning when none is chosen or left', () => {
    fill();
    assert.deepEqual(said(ENGINE.steps[0], ENGINE), { title: 'A deal arrives in a stage that means: contract signed', lines: ['Booked (Sales)'], warn: '' });
    assert.deepEqual(said(step('engine_stage', 'start', { stage_ids: [32, 41, 999] }), ENGINE).lines, ['Booked (Sales), Enquiry (Rentals)'], 'a stage that is gone is left out');
    for (const stage_ids of [[], [999], undefined]) assert.deepEqual(said(step('engine_stage', 'start', { stage_ids }), ENGINE), { title: 'A deal arrives in a stage that means: contract signed', lines: [], warn: 'No stage is chosen: nothing is handed over' });
    assert.deepEqual(said(ENGINE.steps[1], ENGINE), { title: 'The customer is handed over to the Upgrads Engine', lines: ['With the deal as the signed contract'], warn: '' });
  });
  test('a booking: by the service\'s own name; an unknown guest, or only the contacts there are; the entry; who is told', () => {
    fill();
    assert.equal(said(CALCOM.steps[0], CALCOM).title, 'Someone books a meeting at Cal.com');
    assert.equal(said(CALCOM.steps[0], CALENDLY).title, 'Someone books a meeting at Calendly');
    assert.deepEqual(said(CALCOM.steps[1], CALCOM), { title: 'The contact is found by the email address', lines: ['An unknown guest becomes a contact, with a deal in the stage New (Sales)'], warn: '' });
    assert.deepEqual(said(step('booking_contact', 'contact', { known_only: false, pipeline_id: null, stage_id: null }), CALCOM).lines, ['An unknown guest becomes a contact, with a deal in the first stage of the first pipeline']);
    assert.deepEqual(said(step('booking_contact', 'contact', { known_only: true }), CALCOM), { title: 'Only for people who are contacts already', lines: ['A booking from an unknown email address is only logged'], warn: '' });
    assert.deepEqual(said(CALCOM.steps[2], CALCOM), { title: 'The meeting is entered on the contact', lines: ['A booking that is moved or cancelled changes the same entry'], warn: '' });
    assert.deepEqual(said(CALCOM.steps[3], CALCOM), { title: 'The person responsible is told', lines: ['Whoever the deal is assigned to, else the contact'], warn: '' });
  });
  test('in German too', () => {
    fill({ lang: 'de' });
    assert.deepEqual(said(AFTER[0]), { title: 'fonio ruft den Kontakt des Deals an', lines: ['Nur innerhalb der Anrufzeiten: Mo, Di, Mi, Do, Fr, 09:00 bis 18:00'], warn: '' });
    assert.deepEqual(said(AFTER[1]).lines, ['Bis zu 2 weitere Anrufe. Niemand erreicht: nach 2 Stunden; Mailbox: nach 1 Tag; besetzt: sofort']);
    assert.equal(said(AFTER[4]).title, 'Ein im Anruf vereinbarter Termin wird bei Cal.com gebucht');
    assert.deepEqual(said(HOOK5.steps[3], HOOK5).lines, ['In der Phase Booked (Sales)']);
    assert.deepEqual(said(HOOK5.steps[4], HOOK5).lines, ['Weiter im Workflow „fonio: Lead über einen Lead-Webhook“']);
  });
  test('a step a newer server knows and this page does not is its own word, not an error', () => {
    fill();
    assert.deepEqual(said(step('something_new', 'note')), { title: 'something_new', lines: [], warn: '' });
    assert.doesNotThrow(() => F.journeyFixedStepHtml(step('something_new', 'whatever'), FONIO_HOOK));
  });
});

describe('the workspace\'s own workflows that take a lead webhook\'s deals in', () => {
  const lead = (id, name, config, active = true) => ({ id, name, active, nodes: [startBox(config)] });
  const flowsOf = flows => { fill({ flows }); return F.journeyFixedSteps(HOOK5).filter(s => s.what === 'lead_flows'); };
  test('those that run and start with a new lead — from every lead webhook, or from this one', () => {
    assert.deepEqual(flowsOf([lead(10, 'All leads', { trigger: 'lead', webhook_ids: null }), lead(11, 'This one', { trigger: 'lead', webhook_ids: [5] }), lead(12, 'Another', { trigger: 'lead', webhook_ids: [6] })]),
      [{ what: 'lead_flows', kind: 'flow', off: false, names: ['All leads', 'This one'] }]);
  });
  test('and those that start with the stage its deals land in — the chosen one, or the pipeline\'s first', () => {
    assert.deepEqual(flowsOf([lead(10, 'In Booked', { trigger: 'stage', stage_id: 32 }), lead(11, 'In New', { trigger: 'stage', stage_id: 31 })]).map(s => s.names), [['In Booked']]);
    fill({ flows: [lead(11, 'In New', { trigger: 'stage', stage_id: 31 })] });
    const first = { ...HOOK5, steps: [HOOK5.steps[0], step('lead_deal', 'deal', { pipeline_id: 3, stage_id: null })] };
    assert.deepEqual(F.journeyFixedSteps(first).at(-1).names, ['In New']);
  });
  test('and those that start with any new deal; never one that is limited to another pipeline (Part 9)', () => {
    assert.deepEqual(flowsOf([lead(10, 'Any deal', { trigger: 'deal_new' }), lead(11, 'By hand only', { trigger: 'deal_manual' }), lead(12, 'On a booking', { trigger: 'meeting_booked' })]).map(s => s.names), [['Any deal']]);
    assert.deepEqual(flowsOf([lead(10, 'Sales only', { trigger: 'lead', pipeline_id: 3 }), lead(11, 'Rentals only', { trigger: 'lead', pipeline_id: 4 }), lead(12, 'Any, in Rentals', { trigger: 'deal_new', pipeline_id: 4 })]).map(s => s.names),
      [['Sales only']], 'this webhook puts its deals into pipeline 3');
  });
  test('not one that is switched off, has no start chosen, or belongs to nothing', () => {
    assert.deepEqual(flowsOf([lead(10, 'Off', { trigger: 'lead' }, false), lead(11, 'No start', {}), { id: 12, name: 'No boxes', active: true }]), []);
  });
  test('a webhook that creates no deal starts none; another integration\'s workflow never does', () => {
    fill({ flows: [lead(10, 'All leads', { trigger: 'lead' })] });
    const noDeal = { ...HOOK5, steps: [HOOK5.steps[0], step('lead_deal', 'deal', { off: true, pipeline_id: null, stage_id: null })] };
    assert.equal(F.journeyFixedSteps(noDeal).some(s => s.what === 'lead_flows'), false);
    assert.deepEqual(F.journeyFixedSteps(FONIO_HOOK), FONIO_HOOK.steps);
    assert.deepEqual(F.journeyFixedSteps({ key: 'x', source: 'webhook' }), []);
  });
  test('it comes last, and the server\'s steps are left as they were', () => {
    fill({ flows: [lead(10, 'All leads', { trigger: 'lead' })] });
    const before = JSON.stringify(HOOK5);
    const steps = F.journeyFixedSteps(HOOK5);
    assert.deepEqual(steps.map(s => s.what), ['lead_arrives', 'lead_contact', 'lead_engine', 'lead_deal', 'lead_fonio', 'lead_flows']);
    assert.equal(JSON.stringify(HOOK5), before);
    assert.deepEqual(F.journeyFixedStepText(steps.at(-1), HOOK5), { title: 'The workflow "All leads" starts', lines: [], warn: '' });
    assert.equal(F.journeyFixedStepText({ what: 'lead_flows', names: ['A', 'B'] }, HOOK5).title, 'These workflows start: A, B');
  });
});

describe('a fixed workflow on the page', () => {
  test('its steps one under the other, the start first, each with its word, its wait and its sentence', () => {
    fill();
    const out = F.journeyFixedBoardHtml(FONIO_HOOK);
    assert.match(out, /^<div class="jx-wrap"><ol class="jx-chain" aria-label="fonio: lead from a lead webhook"><li class="jx-step"><div class="jx-box jx-start" data-kind="start">/);
    assert.equal(count(out, '<li class="jx-step'), 7);
    assert.equal(count(out, 'jx-start'), 1);
    const order = ['A lead webhook creates a deal', 'fonio calls the deal\'s contact', 'Nobody answers', 'names a later time', 'is noted on the deal', 'is booked at Cal.com', 'The deal moves by'].map(s => out.indexOf(s));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the order they happen');
    assert.ok(order.every(i => i > 0));
    assert.match(out, /<span class="jr-meta"><b>Start<\/b><\/span>\s*<span class="jr-title">A lead webhook creates a deal<\/span><span class="jr-text">Through every lead webhook<\/span>/);
    assert.match(out, /<div class="jx-box" data-kind="call"><span class="jr-ic"><svg class="ic " aria-hidden="true"><use href="#i-phone"\/><\/svg><\/span>\s*<span class="jr-what"><span class="jr-meta"><b>Call \(fonio\)<\/b><span>after 5 min<\/span><\/span>/);
    assert.match(out, /data-kind="meeting">.*<b>Meeting<\/b>/s);
    assert.match(out, /data-kind="move">.*<b>Move the deal<\/b>/s);
  });
  test('a step the settings switched off is shown, marked "Off", without a wait', () => {
    fill();
    const off = F.journeyFixedStepHtml({ ...AFTER[0], off: true }, FONIO_HOOK);
    assert.match(off, /^<li class="jx-step is-off"><div class="jx-box" data-kind="call">/);
    assert.match(off, /<b>Call \(fonio\)<\/b><span class="jx-off">Off<\/span><\/span>/);
    assert.doesNotMatch(off, /after 5 min/);
    assert.doesNotMatch(F.journeyFixedStepHtml(AFTER[0], FONIO_HOOK), /is-off|jx-off/);
  });
  test('a warning stands on its box', () => {
    fill();
    assert.match(F.journeyFixedStepHtml({ ...AFTER[4], service: null }, FONIO_HOOK), /<span class="jr-warn"><svg class="ic " aria-hidden="true"><use href="#i-alert"\/><\/svg>Neither Cal\.com nor Calendly is connected: nothing is booked<\/span>/);
  });
  test('nothing of it can be opened, dragged or connected: none of the hooks the board\'s hands look for, and no button', () => {
    fill({ manage: true });
    for (const fx of [...ALL, CALENDLY]) {
      const out = F.journeyFixedBoardHtml(fx);
      assert.doesNotMatch(out, /data-box|data-out|data-node|data-line|jr-canvas|can-edit|<button|onclick|class="jr-box/, fx.key);
    }
    const hands = page.slice(page.indexOf("document.addEventListener('pointerdown'"));
    assert.match(hands, /e\.target\.closest\('#journey-board \.jr-canvas'\)/, 'a box is dragged on the canvas only');
    assert.match(hands, /e\.target\.closest\('\[data-out\]'\), box = e\.target\.closest\('\[data-box\]'\), line = e\.target\.closest\('\[data-line\]'\)/, 'and a click opens only what carries these');
  });
  test('names and words from the settings are text, never markup', () => {
    const evil = '<img src=x onerror=alert(1)>';
    fill({ hooks: [{ id: 5, name: evil }], list: [{ id: 3, name: evil, stages: [{ id: 31, name: evil }] }, RENT], flows: [{ id: 10, name: evil, active: true, nodes: [startBox({ trigger: 'lead' })] }] });
    const outs = [F.journeyFixedBoardHtml({ ...HOOK5, name: evil, steps: [HOOK5.steps[0], step('lead_contact', 'contact', { assignee_name: evil }), step('lead_deal', 'deal', { pipeline_id: 3, stage_id: 31 })] }),
      F.journeyFixedBoardHtml({ ...FONIO_HOOK, steps: [step('lead_webhook', 'start', { webhook_ids: [5], pipeline_ids: [3] }), step(evil, evil)] }),
      F.journeyFixedBoardHtml({ ...ENGINE, steps: [step('engine_stage', 'start', { stage_ids: [31] })] })];
    for (const out of outs) { assert.doesNotMatch(out, /<img/); assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/); }
    assert.match(outs[1], /data-kind="&lt;img src=x onerror=alert\(1\)&gt;"/);
  });
  test('the page draws it in the board\'s place, with no "+" and no lines to draw', () => {
    fill({ manage: true, flows: [OWN], shown: 10, key: 'webhook-5' });
    F.renderJourney();
    const els = F.__page().els;
    assert.match(els['journey-board'].innerHTML, /^<div class="jx-wrap"><ol class="jx-chain" aria-label="Lead webhook: Website form">/);
    assert.match(els['journey-board'].innerHTML, /The workflow &quot;Nurture&quot; starts/, 'the own workflow that takes this webhook\'s leads in');
    assert.match(els['journey-toolbar'].innerHTML, /<option value="fx:webhook-5" selected>/);
    assert.match(els['journey-actions'].innerHTML, /journeyNameWindow\(null\)/, '"New workflow" stays');
    F.setJourneyFlow('10');
    assert.match(F.__page().els['journey-board'].innerHTML, /^<div class="jr-canvas can-edit"/);
  });
});

describe('above a fixed workflow', () => {
  test('that it is fixed, the integration\'s switch for an owner or admin, the way to its settings — and none of an own workflow\'s tools', () => {
    fill({ manage: true });
    const bar = F.journeyFixedToolbarHtml(FONIO_HOOK);
    assert.match(bar, /^<span class="badge jx-lock"><svg class="ic " aria-hidden="true"><use href="#i-lock"\/><\/svg><span>Fixed<\/span><\/span>/);
    assert.match(bar, /<label class="jr-run"><input type="checkbox" class="switch" aria-label="The workflow runs" checked onchange="setJourneyFixedActive\(this\.checked\)"><span>Running<\/span><\/label>/);
    assert.match(bar, /<button type="button" class="btn btn-secondary btn-sm" onclick="openJourneyFixedSettings\(\)">.*<span>Open settings<\/span><\/button>/);
    assert.match(bar, /<span class="jr-hint">Drawn from the integration's settings\. It is changed there, not here\.<\/span>$/);
    assert.match(F.journeyFixedToolbarHtml(FONIO_HAND), /class="switch" aria-label="The workflow runs" onchange="setJourneyFixedActive\(this\.checked\)"><span>Off<\/span>/);
    const whole = F.journeyToolbarHtml();
    assert.doesNotMatch(whole, /journeyNameWindow|deleteJourneyFlow|openJourneyActivity|setJourneyActive\(/, 'no Rename, no Delete, no Activity, not the own workflow\'s switch');
  });
  test('a member reads whether it runs and gets no switch; "Open settings" is for everyone', () => {
    fill({ manage: false });
    const on = F.journeyFixedToolbarHtml(FONIO_HOOK), off = F.journeyFixedToolbarHtml(FONIO_HAND);
    assert.doesNotMatch(on + off, /<input|setJourneyFixedActive/);
    assert.match(on, /<span class="badge badge-success">Running<\/span>/);
    assert.match(off, /<span class="badge">Off<\/span>/);
    assert.match(on, /openJourneyFixedSettings\(\)/);
  });
  test('fonio switched off: the switch is not offered, and the reason stands next to it', () => {
    fill({ manage: true });
    const bar = F.journeyFixedToolbarHtml({ ...FONIO_HOOK, active: false, blocked: 'fonio_off' });
    assert.match(bar, /class="switch" aria-label="The workflow runs" disabled onchange=/);
    assert.match(bar, /<span class="jx-blocked"><svg class="ic " aria-hidden="true"><use href="#i-alert"\/><\/svg>fonio is switched off in its settings\.<\/span>/);
    assert.doesNotMatch(F.journeyFixedToolbarHtml(FONIO_HOOK), /jx-blocked|disabled/);
    assert.doesNotMatch(F.journeyFixedToolbarHtml({ ...FONIO_HOOK, blocked: 'something_new' }), /jx-blocked/, 'a reason this page does not know says nothing');
  });
  test('Cal.com and Calendly have no switch: they run while connected, said by name', () => {
    fill({ manage: true });
    const cal = F.journeyFixedToolbarHtml(CALCOM);
    assert.doesNotMatch(cal, /<input|setJourneyFixedActive/);
    assert.match(cal, /<span class="badge badge-success">Runs while Cal\.com is connected<\/span>/);
    assert.match(F.journeyFixedToolbarHtml(CALENDLY), /Runs while Calendly is connected/);
  });
});

describe('the switch', () => {
  const answer = (key, active) => ALL.map(f => (f.key === key ? { ...f, active } : f));
  test('saves the integration\'s own setting, shows what the server answers and says that both pages now show the same', async () => {
    fill({ manage: true, answers: { 'put /api/journey/fixed/fonio-webhook': { fixed: answer('fonio-webhook', false) } } });
    await F.setJourneyFixedActive(false);
    const p = F.__page();
    assert.deepEqual(p.log.filter(c => c[0] === 'put'), [['put', '/api/journey/fixed/fonio-webhook', { active: false }]]);
    assert.equal(F.__state().journeyFixed.find(f => f.key === 'fonio-webhook').active, false);
    assert.deepEqual(p.log.filter(c => c[0] === 'toast'), [['toast', 'Switched off. The integration\'s settings show the same.']]);
    assert.match(p.els['journey-toolbar'].innerHTML, /class="switch" aria-label="The workflow runs" onchange="setJourneyFixedActive\(this\.checked\)"><span>Off<\/span>/);
    assert.equal(F.__state().journeyFixedKey, 'fonio-webhook', 'the one that was switched stays the one that is shown');
  });
  test('on again says so; whatever is sent is true or false', async () => {
    fill({ manage: true, key: 'fonio-manual', answers: { 'put /api/journey/fixed/fonio-manual': { fixed: answer('fonio-manual', true) } } });
    await F.setJourneyFixedActive('yes');
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'put'), [['put', '/api/journey/fixed/fonio-manual', { active: true }]]);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'Switched on. The integration\'s settings show the same.']]);
  });
  test('a lead webhook\'s key goes into the address as it is; the Engine\'s switch moves the Onboarding link too', async () => {
    fill({ manage: true, key: 'webhook-5', answers: { 'put /api/journey/fixed/webhook-5': { fixed: answer('webhook-5', false) } } });
    await F.setJourneyFixedActive(false);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'put' || c[0] === 'onboarding-nav'), [['put', '/api/journey/fixed/webhook-5', { active: false }]]);
    fill({ manage: true, key: 'engine', answers: { 'put /api/journey/fixed/engine': { fixed: answer('engine', false) } } });
    await F.setJourneyFixedActive(false);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'onboarding-nav'), [['onboarding-nav']]);
    assert.match(js, /if \(fx\.source === 'engine' && typeof updateOnboardingNav === 'function'\) updateOnboardingNav\(\);/);
    assert.match(read('public/js/integrations.js'), /updateOnboardingNav\(\);   \/\/ the Onboarding monitor link follows the Active switch/, 'as the Engine\'s own tab does');
  });
  test('a refusal is said in words, nothing changes here, and the switch is drawn again as it truly is', async () => {
    for (const [code, words] of [['fonio_off', 'fonio is switched off. Switch fonio on in its settings first.'], ['forbidden', 'Only owners and admins can change workflows.'],
      ['not_found', 'This integration is no longer set up.'], ['no_switch', 'This workflow has no switch: it happens while the service is connected.'], ['whatever', 'That did not work. Please try again.']]) {
      fill({ manage: true, key: 'fonio-manual', answers: { 'put /api/journey/fixed/fonio-manual': { error: 'x', code } } });
      await F.setJourneyFixedActive(true);
      assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', words]], code);
      assert.equal(F.__state().journeyFixed.find(f => f.key === 'fonio-manual').active, false);
      assert.match(F.__page().els['journey-toolbar'].innerHTML, /<span>Off<\/span>/);
    }
  });
  test('a request that never arrived, or an answer without the workflows, is a refusal like any other', async () => {
    fill({ manage: true });
    F.__offline(true);
    await F.setJourneyFixedActive(false);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'That did not work. Please try again.']]);
    fill({ manage: true, answers: { 'put /api/journey/fixed/fonio-webhook': { success: true } } });
    await F.setJourneyFixedActive(false);
    assert.equal(F.__state().journeyFixed.length, ALL.length);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'That did not work. Please try again.']]);
  });
  test('a member, a workflow without a switch, or no fixed workflow shown: nothing is sent', async () => {
    for (const [why, state] of [['a member', { manage: false }], ['no switch', { manage: true, key: 'calcom' }], ['an own workflow is shown', { manage: true, flows: [OWN], shown: 10 }]]) {
      fill(state);   // fill() empties the log, so each case is looked at by itself
      await F.setJourneyFixedActive(false);
      assert.deepEqual(F.__page().log, [], why);
    }
  });
});

describe('"Open settings"', () => {
  test('goes to the integration\'s own tab on the Integrations page', () => {
    for (const fx of [ENGINE, CALCOM, CALENDLY]) {
      fill({ fixed: [fx] });
      assert.equal(F.openJourneyFixedSettings(), 'switched');
      assert.deepEqual(F.__page().log, [['tab', fx.source], ['page', 'integrations']], fx.key);
    }
  });
  test('a lead webhook: that webhook\'s card; fonio: the part that holds who is called and when', () => {
    fill({ key: 'webhook-5' });
    F.openJourneyFixedSettings();
    assert.deepEqual(F.__page().log, [['tab', 'webhook'], ['page', 'integrations']]);
    assert.equal(F.__state().currentWebhookId, 5);
    assert.match(read('public/js/integrations.js'), /const wanted = selectId \?\? currentWebhookId;/, 'the Integrations page opens on the webhook that is remembered');
    fill({ key: 'fonio-manual' });
    F.openJourneyFixedSettings();
    assert.deepEqual(F.__page().log, [['tab', 'fonio'], ['part', 'who'], ['page', 'integrations']]);
    assert.equal(F.__state().currentWebhookId, null);
    assert.ok(new Function(`${sliceConst('public/js/integrations.js', 'FONIO_PARTS')} return FONIO_PARTS;`)().includes('who'));
  });
  test('nothing shown, or a source that is no tab: nothing happens', () => {
    fill({ fixed: [] });
    assert.equal(F.openJourneyFixedSettings(), null);
    fill({ fixed: [{ ...ENGINE, source: 'settings' }] });
    assert.equal(F.openJourneyFixedSettings(), null);
    assert.deepEqual(F.__page().log, []);
  });
  test('the Integrations page reads its settings anew when it opens: what was switched here shows there', () => {
    const auth = read('public/js/auth.js'), intg = read('public/js/integrations.js');
    assert.match(sliceFn(auth, 'switchPage', 'auth.js'), /if \(page === 'integrations'\) await loadIntegrations\(\);/);
    const load = sliceFn(intg, 'loadIntegrations', 'integrations.js');
    for (const call of ['loadEngineSettings();', 'loadFonio();', 'await reloadIntgSettings();']) assert.ok(load.includes(call), call);
    assert.match(sliceFn(auth, 'switchPage', 'auth.js'), /if \(page === 'journey'\)\s+await loadJourney\(\);/, 'and what was switched there shows here');
  });
});

describe('loading', () => {
  const LIST = { 'get /api/journey': { flows: [], webhooks: HOOKS, can_manage: true, max_flows: 20, max_nodes: 60 }, 'get /api/pipelines': [SALES], 'get /api/integrations/fonio': { configured: true },
    'get /api/journey/fixed': { fixed: ALL, can_manage: true } };
  test('the page reads the fixed workflows with everything else and shows the first when the workspace has none of its own', async () => {
    fill({ fixed: [], answers: LIST });
    await F.loadJourney();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'get').map(c => c[1]).sort(), ['/api/integrations/fonio', '/api/journey', '/api/journey/fixed', '/api/pipelines']);
    assert.equal(F.__state().journeyFixed.length, 5);
    assert.match(F.__page().els['journey-board'].innerHTML, /^<div class="jx-wrap">/);
    assert.match(F.__page().els['journey-toolbar'].innerHTML, /setJourneyFixedActive/, 'an owner gets the switch');
  });
  test('a fixed workflow that was chosen stays; one whose integration was disconnected meanwhile is let go', async () => {
    fill({ key: 'engine', answers: { 'get /api/journey/fixed': { fixed: ALL } } });
    await F.loadJourneyFixed();
    assert.equal(F.__state().journeyFixedKey, 'engine');
    fill({ key: 'engine', answers: { 'get /api/journey/fixed': { fixed: [HOOK5] } } });
    await F.loadJourneyFixed();
    assert.equal(F.__state().journeyFixedKey, null);
  });
  test('an error, a request that never arrived or an answer that is none: no fixed workflows, and the page still loads', async () => {
    for (const bad of [{ error: 'Unauthorized' }, undefined, { fixed: 'x' }, null]) {
      fill({ answers: { 'get /api/journey/fixed': bad } });
      assert.deepEqual(await F.loadJourneyFixed(), []);
    }
    fill();
    F.__offline(true);
    assert.deepEqual(await F.loadJourneyFixed(), []);
    fill({ answers: { 'get /api/journey/fixed': { fixed: [HOOK5, null, { key: 5, steps: [] }, { key: 'no-steps' }] } } });
    assert.deepEqual((await F.loadJourneyFixed()).map(f => f.key), ['webhook-5'], 'only what is a workflow');
  });
  test('logout and a workspace switch leave nothing of the integrations behind', () => {
    fill({ key: 'engine' });
    F.resetJourneyUI();
    assert.deepEqual([F.__state().journeyFixed, F.__state().journeyFixedKey], [[], null]);
  });
});

describe('the look', () => {
  test('the steps stand in the page\'s own flow, one under the other, with a line and its arrowhead between each two', () => {
    assert.match(css, /^\.jx-chain \{ list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; width: 340px; max-width: 100%; \}$/m);
    assert.match(css, /^\.jx-step \{ position: relative; \}$/m);
    assert.match(css, /^\.jx-step \+ \.jx-step \{ margin-top: 34px; \}$/m);
    assert.match(css, /^\.jx-step \+ \.jx-step::before \{ content: ''; position: absolute; left: 50%; top: -34px; height: 34px; border-left: 1\.6px solid var\(--line-strong\); \}$/m);
    assert.match(css, /^\.jx-step \+ \.jx-step::after \{[^}]*transform: rotate\(45deg\); \}$/m);
    assert.doesNotMatch(css, /^\.jx-(wrap|chain|step|box) \{[^}]*position: absolute/m, 'no step has a place of its own to overlap another');
  });
  test('the box is its own class — the board\'s hover, focus and drag rules do not reach it — and shows a text whole', () => {
    assert.match(css, /^\.jx-box \{ display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid var\(--border\);/m);
    assert.doesNotMatch(css, /\.jx-box[^{]*\{[^}]*cursor: pointer/);
    assert.doesNotMatch(css, /\.jx-box:hover|\.jx-box:focus/);
    assert.match(css, /^\.jx-box \.jr-text \{ display: block; overflow: visible; \}$/m);
    assert.ok(css.indexOf('.jx-box .jr-text {') > css.indexOf('.jr-text {'), 'after the rule that cuts a text to two lines');
  });
  test('the start is navy as on the board, readable in both themes', () => {
    assert.match(css, /^\.jx-start \{ background: var\(--navy-800\); color: #fff; border-color: transparent; \}$/m);
    assert.match(css, /^\.jx-start \.jr-meta, \.jx-start \.jr-meta b, \.jx-start \.jr-text \{ color: rgba\(255,255,255,\.78\); \}$/m);
    assert.match(css, /^\[data-theme="dark"\] \.jx-start \{ background: var\(--brand-subtle-2\); color: var\(--ink\); border-color: var\(--brand-line\); \}$/m);
  });
  test('every kind of step has its colour: the board\'s for a call and a move, its own for the others', () => {
    const kinds = [...new Set([...util.matchAll(/step\('[a-z_]+', '([a-z]+)'/g)].map(m => m[1])), 'flow'].filter(k => k !== 'start');
    for (const kind of kinds) {
      const board = new RegExp(`^\\[data-kind="${kind}"\\]\\s+\\{ --jr-c:`, 'm').test(css), own = new RegExp(`\\.jx-box\\[data-kind="${kind}"\\][^{]*\\{ --jr-c: var\\(--[a-z0-9-]+\\); --jr-bg: var\\(--[a-z0-9-]+\\); --jr-bd: var\\(--[a-z0-9-]+\\); \\}`).test(css);
      assert.ok(board || own, kind);
    }
  });
  test('a step that is off is dashed and quiet; the reason a switch is not offered is a warning', () => {
    assert.match(css, /^\.jx-step\.is-off \.jx-box \{ background: transparent; border-style: dashed; box-shadow: none; \}$/m);
    assert.match(css, /^\.jx-blocked \{[^}]*color: var\(--warning\); \}$/m);
    assert.match(css, /^input\[type="checkbox"\]\.switch:disabled \{ opacity: \.5; cursor: default; \}$/m, 'a switch that is not offered looks it');
  });
});
