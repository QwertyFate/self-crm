// CLIENT (static + pure-function) tests for the variables in a workflow step's texts (public/js/journey-vars.js and
// the step window in public/js/journey.js, CUSTOMER_JOURNEY_CHANGES Part 14, 2026-11-19): "Hello {{first_name}}".
//
// The names there are and their German names (the server's own lists), what each is called in the list, what the
// list offers for each kind of step, where a choice goes in, what the preview fills in — sample values, a fallback
// for a contact about whom nothing is known, a name nobody knows left as typed, never markup out of a value — and
// the line under the text that says which names between braces are none.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const core = read('public/js/core.js');
const js   = read('public/js/journey.js');
const vars = read('public/js/journey-vars.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;
const constOf = name => new Function(`${sliceConst('public/js/journey-vars.js', name)} return ${name};`)();

// the contract with the server (utils/journey-vars.js), written out: what the page's lists must be
const GROUPS = { contact: ['name', 'first_name', 'last_name', 'email', 'phone', 'company'], deal: ['deal', 'deal_value', 'stage', 'pipeline'], owner: ['owner', 'owner_first_name', 'owner_email'],
  now: ['date', 'time', 'date_time', 'weekday', 'month', 'year'], other: ['workspace', 'today', 'meeting_date', 'meeting_time', 'unsubscribe'] };
const ALIASES = { vorname: 'first_name', nachname: 'last_name', telefon: 'phone', firma: 'company', wert: 'deal_value', phase: 'stage', betreuer: 'owner', betreuer_vorname: 'owner_first_name',
  betreuer_email: 'owner_email', heute: 'today', termin_datum: 'meeting_date', termin_uhrzeit: 'meeting_time', abmelden: 'unsubscribe', unsubscribe_url: 'unsubscribe', datum: 'date', uhrzeit: 'time', datum_uhrzeit: 'date_time', wochentag: 'weekday', monat: 'month', jahr: 'year' };
const NAMES = Object.values(GROUPS).flat();

const CONSTS = ['JOURNEY_VAR_GROUPS', 'JOURNEY_VAR_ALIASES', 'JOURNEY_VAR_PREFIXES', 'JOURNEY_VAR_KINDS', 'JOURNEY_VAR_QUICK', 'JOURNEY_VAR_GROUP_KEYS', 'JOURNEY_VAR_KEYS', 'JOURNEY_VAR_SAMPLE'];
const VAR_FNS = ['journeyVarOf', 'journeyVarHas', 'journeyVarWord', 'journeyVarList', 'journeyVarZone', 'journeyVarClock', 'journeyVarSample', 'journeyVarFill', 'journeyVarUnknown', 'journeyVarInsert', 'journeyVarBarHtml', 'journeyVarWire'];
// the sandbox: a step's window with its real code, a recording api/ui, fields the test fills, and the real t/tf/esc/icon
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  ...['t', 'tf', 'icon'].map(n => sliceFn(core, n, 'core.js')),
  ...['JOURNEY_ACTIONS', 'JOURNEY_UNITS', 'JOURNEY_ERRORS'].map(n => sliceConst('public/js/journey.js', n)),
  'const JOURNEY_MAX_NAME = 80, JOURNEY_MAX_TITLE = 120, JOURNEY_MAX_TEXT = 20000, JOURNEY_MAX_WAIT = 365 * 24 * 60;',
  js.match(/^const journeyOption = .*$/m)[0],
  ...CONSTS.map(n => sliceConst('public/js/journey-vars.js', n)),
  ...VAR_FNS.map(n => sliceFn(vars, n, 'journey-vars.js')),
  `const __log = [], __fields = {}, __handlers = {};
   let __answers = {};
   let journeyMail = null;
   const __answer = (verb, url, body) => { __log.push(body === undefined ? [verb, url] : [verb, url, body]); return __answers[verb + ' ' + url]; };
   const api = { get: async url => __answer('get', url), post: async (url, b) => __answer('post', url, b), put: async (url, b) => __answer('put', url, b), del: async url => __answer('del', url) };
   const __field = part => (__fields[part] ||= { value: '', hidden: null, textContent: '', checked: false, focused: 0, focus() { this.focused++; }, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } });
   const ui = {
     modal: opts => { __log.push(['modal', opts]); return { el: { querySelector: sel => __field(sel.replace(/^#jr-[a-z0-9]+-/, '')), querySelectorAll: () => [] }, close() { __log.push(['close']); } }; },
     confirm: async () => true,
     menu: (anchor, items, opts) => { __log.push(['menu', anchor, items, opts]); },
     toast: m => __log.push(['toast', m]),
   };
   function on(_root, type, selector, fn) { __handlers[type + ' ' + selector] = fn; }
   const uid = () => 'abc1234';
   function dvConfirmUnsaved() { return true; }
   function journeyApply(flow) { __log.push(['apply', flow]); }
   function __reset(answers = {}) { __log.length = 0; __answers = answers; journeyMail = { connection: { email: 'news@firma.de' } }; for (const o of [__fields, __handlers]) for (const k of Object.keys(o)) delete o[k]; }
   function __fill(values) { for (const k of Object.keys(values)) Object.assign(__field(k), typeof values[k] === 'object' ? values[k] : { value: values[k] }); }
   function __page() { return { log: __log, fields: __fields, handlers: __handlers }; }`,
].join('\n');
const F = loadFns('public/js/journey.js', ['journeyErrorText', 'journeySend', 'journeyWaitParts', 'journeyWaitMinutes', 'journeyPipelines', 'journeyFlow', 'journeyStageOptions', 'journeyWindow', 'journeyBehind',
  'journeyPreviewHtml', 'openJourneyBox'], {
  state: { currentLang: 'en', pipelines: [], journeyFlows: [], journeyManage: false, journeyLimits: { flows: 20, nodes: 60 }, journeyFlowId: null, journeyFonio: true, journeyDealFields: [], journeyContactFields: [] },
  extra, expose: ['__reset', '__fill', '__page', ...VAR_FNS],
});

const SALES = { id: 3, name: 'Sales', stages: [{ id: 31, name: 'New' }, { id: 32, name: 'Booked' }] };
const DEAL_FIELDS = [{ field_key: 'finanzierung', name: 'Finanzierung', type: 'text' }, { field_key: 'Einzug', name: 'Einzug am', type: 'date' }];
const CONTACT_FIELDS = [{ field_key: 'kundenstatus', name: 'Kundenstatus', type: 'text' }];
const box = (id, kind, more = {}) => ({ id, kind, title: '', body: '', wait_minutes: 0, config: {}, next_id: null, else_id: null, ...more });
const FLOW = { id: 10, name: 'New lead', nodes: [box(1, 'start', { config: { trigger: 'lead' }, next_id: 2 }), box(2, 'email', { title: 'Welcome {{first_name}}', body: 'Hallo {{first_name|zusammen}},\nwie geht es?', next_id: 3 }),
  box(3, 'task', { title: 'Call {{name}}', body: 'About {{deal}}' }), box(4, 'call', { title: 'fonio calls' }), box(5, 'move', { config: { stage_id: 32 } })] };
function fill({ lang = 'en', deal = DEAL_FIELDS, contact = CONTACT_FIELDS, answers = {} } = {}) {
  F.__reset(answers);
  F.__set('currentLang', lang); F.__set('pipelines', [SALES]); F.__set('journeyFlows', [FLOW]); F.__set('journeyManage', true); F.__set('journeyFlowId', 10);
  F.__set('journeyDealFields', deal); F.__set('journeyContactFields', contact);
}
const modals = () => F.__page().log.filter(c => c[0] === 'modal').map(c => c[1]);
const NOW = new Date('2026-11-19T12:00:00Z');
const bodyOf = page => page.slice(page.indexOf('<body'), page.indexOf('</body>')).replace(/^<body[^>]*>/, '');

describe('wiring', () => {
  test('the script is loaded once, after the board and the start whose fields it names', () => {
    assert.equal(count(html, '<script src="js/journey-vars.js"></script>'), 1);
    for (const before of ['js/journey.js', 'js/journey-start.js']) assert.ok(html.indexOf(`<script src="${before}">`) < html.indexOf('<script src="js/journey-vars.js">'), before);
  });
  test('the names, their groups, the German names and what stands before a field are the contract\'s', () => {
    assert.deepEqual(constOf('JOURNEY_VAR_GROUPS'), GROUPS);
    assert.deepEqual(constOf('JOURNEY_VAR_ALIASES'), ALIASES);
    assert.deepEqual(constOf('JOURNEY_VAR_PREFIXES'), { 'deal.': 'deal', 'contact.': 'contact', 'kontakt.': 'contact' });
    assert.deepEqual(constOf('JOURNEY_VAR_KINDS').sort(), ['email', 'sms', 'task', 'whatsapp'], 'an email, a task, a WhatsApp, an SMS — not a call, a move, a wait or a branch');
    for (const [german, name] of Object.entries(ALIASES)) { assert.ok(NAMES.includes(name), german); assert.ok(!NAMES.includes(german), `${german} is no name of its own`); }
    assert.equal(new Set(NAMES).size, 24);
  });
  // Red until the server half of Part 14 has written utils/journey-vars.js: the page's lists are the server's own.
  test('the same lists as the server fills with', () => {
    const server = require('../../utils/journey-vars');
    assert.deepEqual(constOf('JOURNEY_VAR_GROUPS'), server.GROUPS);
    assert.deepEqual(constOf('JOURNEY_VAR_ALIASES'), server.ALIASES);
    assert.deepEqual(constOf('JOURNEY_VAR_PREFIXES'), server.FIELD_PREFIXES);
  });
  test('every name has its words, every group its heading, and the three beside the button are names', () => {
    assert.deepEqual(Object.keys(constOf('JOURNEY_VAR_KEYS')), NAMES, 'in the list\'s own order');
    assert.deepEqual(Object.keys(constOf('JOURNEY_VAR_GROUP_KEYS')), Object.keys(GROUPS));
    assert.deepEqual(constOf('JOURNEY_VAR_QUICK'), ['first_name', 'name', 'company']);
    for (const k of [...Object.values(constOf('JOURNEY_VAR_KEYS')), ...Object.values(constOf('JOURNEY_VAR_GROUP_KEYS'))]) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
  });
  test('the step\'s window asks this file: the bar for the four kinds, the preview through its filling', () => {
    const win = sliceFn(js, 'openJourneyBox', 'journey.js');
    assert.match(win, /const vars = JOURNEY_VAR_KINDS\.includes\(kind\);/);
    assert.match(win, /const extras = fid => \(vars \? journeyVarBarHtml\(fid\) : ''\) \+ \(!email \? '' : `/);
    assert.match(win, /if \(vars\) journeyVarWire\(w, kind, email \? show : null\);/);
    assert.doesNotMatch(js, /JOURNEY_SAMPLE|data-jr-ph|jr_ph_label/, 'the five chips and their sample are gone');
    assert.match(sliceFn(js, 'journeyPreviewHtml', 'journey.js'), /journeyVarFill\(raw, values, \{ html: true, fields: !bare \}\)/);
  });
});

describe('both dictionaries', () => {
  const used = [...new Set([...vars.matchAll(/'(jv_[a-z0-9_]+)'/g), ...js.matchAll(/'(jv_[a-z0-9_]+)'/g)].map(m => m[1]))];
  test('every word of the variables exists in English and German; none is left unused', () => {
    assert.ok(used.length >= 28, `its own keys (${used.length})`);
    for (const k of used) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jv_') && !used.includes(k)), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jv_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jv_')).sort());
    assert.ok(!('jr_ph_label' in dict.en) && !('jr_ph_label' in dict.de), 'the word of the five chips is gone with them');
  });
  test('German speaks to nobody in particular, no text says "journey", and no word is defined twice', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jv_'))) {
      assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
      for (const lang of ['en', 'de']) assert.doesNotMatch(dict[lang][k], /journey/i, k);
    }
    const at = core.indexOf('const TRANSLATIONS'), en = core.indexOf('\n  en: {', at), de = core.indexOf('\n  de: {', en);
    for (const [lang, block] of [['en', core.slice(en, de)], ['de', core.slice(de, core.indexOf('\n};', de))]]) {
      const keys = [...block.matchAll(/(?:^|[\s,{])(jv_[a-z0-9_]+):\s*'/gm)].map(m => m[1]);
      assert.equal(keys.length, used.length, lang);
      assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], lang);
    }
  });
  test('each variable says in plain words what it is, in both languages', () => {
    const words = lang => Object.fromEntries(NAMES.map(n => [n, dict[lang][constOf('JOURNEY_VAR_KEYS')[n]]]));
    assert.deepEqual(words('en'), { name: 'Full name', first_name: 'First name', last_name: 'Last name', email: 'Email address', phone: 'Phone number', company: 'Company', deal: 'Title of the deal',
      deal_value: 'Value of the deal', stage: 'Stage the deal is in', pipeline: 'Pipeline of the deal', owner: 'Name of the person in charge', owner_first_name: 'First name of the person in charge',
      owner_email: 'Email address of the person in charge', date: 'Date', time: 'Time', date_time: 'Date and time', weekday: 'Weekday', month: 'Month', year: 'Year', workspace: 'Name of the workspace', today: 'Date of today', meeting_date: 'Date of the next meeting', meeting_time: 'Time of the next meeting',
      unsubscribe: 'Link: no more emails' });
    assert.deepEqual(words('de'), { name: 'Voller Name', first_name: 'Vorname', last_name: 'Nachname', email: 'E-Mail-Adresse', phone: 'Telefonnummer', company: 'Firma', deal: 'Titel des Deals',
      deal_value: 'Wert des Deals', stage: 'Phase, in der der Deal ist', pipeline: 'Pipeline des Deals', owner: 'Name der zuständigen Person', owner_first_name: 'Vorname der zuständigen Person',
      owner_email: 'E-Mail-Adresse der zuständigen Person', date: 'Datum', time: 'Uhrzeit', date_time: 'Datum und Uhrzeit', weekday: 'Wochentag', month: 'Monat', year: 'Jahr', workspace: 'Name des Arbeitsbereichs', today: 'Heutiges Datum', meeting_date: 'Datum des nächsten Termins', meeting_time: 'Uhrzeit des nächsten Termins',
      unsubscribe: 'Link: keine weiteren E-Mails' });
    assert.equal(new Set(Object.values(words('en'))).size, 24, 'no two read alike'); assert.equal(new Set(Object.values(words('de'))).size, 24);
  });
  test('the help line says what a variable is, what the bar gives, and that an unknown name stays', () => {
    assert.equal(dict.en.jv_help, 'A variable stands for a value of the contact or the deal and is filled in when the step happens. {{first_name|there}} gives "there" when there is no first name. A name the CRM does not know stays as it was typed.');
    assert.match(dict.de.jv_help, /\{\{vorname\|zusammen\}\} ergibt „zusammen“, wenn kein Vorname da ist\. Ein Name, den das CRM nicht kennt, bleibt so stehen, wie er getippt wurde\.$/);
    fill();
    assert.equal(F.journeyVarFill('{{first_name|there}}', F.journeyVarSample(NOW, true)), 'there', 'what the English line promises');
    assert.equal(F.journeyVarFill('{{vorname|zusammen}}', F.journeyVarSample(NOW, true)), 'zusammen', 'and the German one');
  });
});

describe('what stands between the braces', () => {
  test('a name of the list — capitals and spaces around it do not count, a German name is the same value', () => {
    fill();
    for (const n of NAMES) assert.deepEqual(F.journeyVarOf(n), { name: n }, n);
    for (const typed of ['first_name', ' first_name ', 'FIRST_NAME', 'First_Name', 'vorname', ' Vorname ', 'VORNAME']) assert.deepEqual(F.journeyVarOf(typed), { name: 'first_name' }, typed);
    for (const [german, name] of Object.entries(ALIASES)) assert.deepEqual(F.journeyVarOf(german), { name }, german);
  });
  test('one of the workspace\'s own fields, by its key behind "deal." or "contact." ("kontakt." too) — capitals do not count', () => {
    fill();
    assert.deepEqual(F.journeyVarOf('deal.finanzierung'), { field: 'deal', key: 'finanzierung', label: 'Finanzierung' });
    assert.deepEqual(F.journeyVarOf(' Deal.Finanzierung '), { field: 'deal', key: 'finanzierung', label: 'Finanzierung' });
    assert.deepEqual(F.journeyVarOf('deal.einzug'), { field: 'deal', key: 'Einzug', label: 'Einzug am' }, 'a key saved with a capital is found by small letters');
    assert.deepEqual(F.journeyVarOf('contact.kundenstatus'), { field: 'contact', key: 'kundenstatus', label: 'Kundenstatus' });
    assert.deepEqual(F.journeyVarOf('kontakt.kundenstatus'), { field: 'contact', key: 'kundenstatus', label: 'Kundenstatus' });
    assert.equal(F.journeyVarOf('deal.kundenstatus'), null, 'a contact field is no deal field');
    assert.equal(F.journeyVarOf('contact.finanzierung'), null);
    fill({ deal: [{ field_key: 'ohne_namen', name: '' }] });
    assert.equal(F.journeyVarOf('deal.ohne_namen').label, 'ohne_namen', 'a field without a name goes by its key');
  });
  test('anything else is no variable', () => {
    fill();
    for (const typed of ['', '   ', 'frist_name', 'first name', 'first-name', 'deal.gone', 'deal.', 'contact.', 'kontakt.', 'deal. finanzierung', 'lead.finanzierung', 'finanzierung', '.finanzierung', 'deal..finanzierung',
      'constructor', 'toString', '__proto__', 'hasOwnProperty', 'deal.constructor', 'contact.__proto__', null, undefined, 7]) assert.equal(F.journeyVarOf(typed), null, String(typed));
  });
  test('the "no more emails" link is a variable in an email only', () => {
    fill();
    for (const typed of ['unsubscribe', 'abmelden', ' UNSUBSCRIBE ']) {
      assert.deepEqual(F.journeyVarOf(typed, 'email'), { name: 'unsubscribe' }, typed);
      assert.deepEqual(F.journeyVarOf(typed), { name: 'unsubscribe' }, 'the preview is an email\'s');
      for (const kind of ['task', 'whatsapp', 'sms']) assert.equal(F.journeyVarOf(typed, kind), null, `${typed} in a ${kind}`);
    }
    for (const kind of ['task', 'whatsapp', 'sms']) assert.deepEqual(F.journeyVarOf('first_name', kind), { name: 'first_name' });
  });
});

describe('the list behind "Insert variable"', () => {
  const headings = list => list.filter(i => i.heading).map(i => i.heading);
  test('for an email: Contact, Deal, Person in charge, Other, then the workspace\'s own fields by their names', () => {
    fill();
    const list = F.journeyVarList('email');
    assert.deepEqual(headings(list), ['Contact', 'Deal', 'Person in charge', 'Date and time, when the step happens', 'Other', 'Fields of the deal', 'Fields of the contact']);
    assert.deepEqual(list.filter(i => !i.heading).slice(0, 24).map(i => i.insert), NAMES.map(n => `{{${n}}}`), 'every name once, in the list\'s order');
    assert.deepEqual(list.slice(0, 3), [{ heading: 'Contact' }, { label: 'Full name', insert: '{{name}}' }, { label: 'First name', insert: '{{first_name}}' }]);
    assert.deepEqual(list.slice(-5), [{ heading: 'Fields of the deal' }, { label: 'Finanzierung', insert: '{{deal.finanzierung}}' }, { label: 'Einzug am', insert: '{{deal.Einzug}}' },
      { heading: 'Fields of the contact' }, { label: 'Kundenstatus', insert: '{{contact.kundenstatus}}' }]);
    for (const item of list.filter(i => !i.heading)) assert.ok(F.journeyVarOf(item.insert.slice(2, -2), 'email'), `${item.insert} is a variable the page knows itself`);
  });
  test('for a task, a WhatsApp and an SMS: the same without the "no more emails" link', () => {
    fill();
    for (const kind of ['task', 'whatsapp', 'sms']) {
      const list = F.journeyVarList(kind);
      assert.deepEqual(list.filter(i => !i.heading).slice(0, 23).map(i => i.insert), NAMES.filter(n => n !== 'unsubscribe').map(n => `{{${n}}}`), kind);
      assert.ok(!list.some(i => /unsubscribe|abmelden/.test(i.insert || '')), kind);
      assert.deepEqual(headings(list), ['Contact', 'Deal', 'Person in charge', 'Date and time, when the step happens', 'Other', 'Fields of the deal', 'Fields of the contact']);
    }
  });
  test('a workspace without fields of its own has no such headings; a key that could not stand between braces is not offered', () => {
    fill({ deal: [], contact: [] });
    assert.deepEqual(headings(F.journeyVarList('email')), ['Contact', 'Deal', 'Person in charge', 'Date and time, when the step happens', 'Other']);
    fill({ deal: [{ field_key: 'a|b', name: 'Bar' }, { field_key: 'a}b', name: 'Brace' }, { field_key: 'a b', name: 'Space' }, { field_key: '', name: 'Empty' }, null, { field_key: 'gut', name: 'Good' }], contact: [] });
    assert.deepEqual(F.journeyVarList('email').slice(-2), [{ heading: 'Fields of the deal' }, { label: 'Good', insert: '{{deal.gut}}' }]);
  });
  test('in a German page: German headings and words, and the German name is put in where there is one', () => {
    fill({ lang: 'de' });
    const list = F.journeyVarList('email');
    assert.deepEqual(headings(list), ['Kontakt', 'Deal', 'Zuständige Person', 'Datum und Uhrzeit, wenn der Schritt passiert', 'Sonstiges', 'Felder des Deals', 'Felder des Kontakts']);
    assert.deepEqual(list.filter(i => !i.heading).slice(0, 24).map(i => i.insert), ['{{name}}', '{{vorname}}', '{{nachname}}', '{{email}}', '{{telefon}}', '{{firma}}', '{{deal}}', '{{wert}}', '{{phase}}', '{{pipeline}}',
      '{{betreuer}}', '{{betreuer_vorname}}', '{{betreuer_email}}', '{{datum}}', '{{uhrzeit}}', '{{datum_uhrzeit}}', '{{wochentag}}', '{{monat}}', '{{jahr}}', '{{workspace}}', '{{heute}}', '{{termin_datum}}', '{{termin_uhrzeit}}', '{{abmelden}}']);
    assert.equal(list.at(-1).insert, '{{kontakt.kundenstatus}}');
    for (const item of list.filter(i => !i.heading)) assert.ok(F.journeyVarOf(item.insert.slice(2, -2), 'email'), item.insert);
    assert.deepEqual([F.journeyVarWord('first_name'), F.journeyVarWord('name'), F.journeyVarWord('company')], ['{{vorname}}', '{{name}}', '{{firma}}']);
    fill();
    assert.deepEqual([F.journeyVarWord('first_name'), F.journeyVarWord('company')], ['{{first_name}}', '{{company}}']);
  });
  test('names from the settings are text in the bar and the list, never markup', () => {
    fill({ deal: [{ field_key: 'x', name: '<img src=x onerror=alert(1)>' }] });
    assert.equal(F.journeyVarList('email').at(-3).label, '<img src=x onerror=alert(1)>', 'handed to the menu as text; the menu escapes what it shows');
    assert.match(read('public/js/core.js'), /<span>\$\{esc\(it\.label\)\}<\/span>\$\{it\.hint \? `<span class="kbd" style="margin-left:auto">\$\{esc\(it\.hint\)\}<\/span>` : ''\}/, 'ui.menu: label and hint are escaped');
  });
});

describe('putting a variable in', () => {
  test('where the cursor is, in place of what is marked; the cursor then stands behind it', () => {
    const field = (value, a, b) => ({ value, selectionStart: a, selectionEnd: b, focused: 0, focus() { this.focused++; }, setSelectionRange(x, y) { this.selectionStart = x; this.selectionEnd = y; } });
    let f = field('Hallo !', 6, 6);
    F.journeyVarInsert(f, '{{first_name}}');
    assert.deepEqual([f.value, f.selectionStart, f.selectionEnd, f.focused], ['Hallo {{first_name}}!', 20, 20, 1]);
    f = field('Hallo NAME, hallo', 6, 10);
    F.journeyVarInsert(f, '{{name}}');
    assert.deepEqual([f.value, f.selectionStart], ['Hallo {{name}}, hallo', 14], 'what was marked is replaced');
    f = field('', 0, 0);
    F.journeyVarInsert(f, '{{deal}}');
    assert.equal(f.value, '{{deal}}');
  });
  test('a field that does not say where its cursor is gets it at the end', () => {
    const f = { value: 'Hallo ' };
    F.journeyVarInsert(f, '{{first_name}}');
    assert.equal(f.value, 'Hallo {{first_name}}');
    const empty = { value: undefined };
    F.journeyVarInsert(empty, '{{name}}');
    assert.equal(empty.value, '{{name}}');
  });
});

describe('in a step\'s window', () => {
  test('an email, a task, a WhatsApp and an SMS have "Insert variable", the three most used beside it, the help line and the place for the note', () => {
    fill();
    for (const kind of ['email', 'task', 'whatsapp', 'sms']) {
      F.openJourneyBox(null, { kind, afterId: 2 });
      const m = modals().at(-1);
      assert.match(m.body, /<div class="jr-ph"><button type="button" class="btn btn-secondary btn-sm" data-jv-menu aria-haspopup="menu"><svg[^>]*><use href="#i-plus"\/><\/svg><span>Insert variable<\/span><\/button>/, kind);
      assert.deepEqual([...m.body.matchAll(/<button type="button" class="chip" data-jv-put="(\{\{[a-z_]+\}\})" title="([^"]+)">(\{\{[a-z_]+\}\})<\/button>/g)].map(x => x.slice(1).join('|')),
        ['{{first_name}}|First name|{{first_name}}', '{{name}}|Full name|{{name}}', '{{company}}|Company|{{company}}'], kind);
      assert.match(m.body, /<p class="help">A variable stands for a value of the contact or the deal[^<]*<\/p>\s*<p class="help">Date and time go by the time zone of whoever saves the step: Europe\/Berlin\.<\/p>\s*<p class="jr-vars-note" id="jr-abc1234-unknown" role="status" hidden><\/p>/, kind);
      assert.ok(m.body.indexOf('id="jr-abc1234-text"') < m.body.indexOf('data-jv-menu'), 'under the text');
    }
  });
  test('a call and a move have none: their texts are not filled', () => {
    fill();
    F.openJourneyBox(4); F.openJourneyBox(5);
    for (const m of modals()) assert.doesNotMatch(m.body, /data-jv-|jr-vars-note|A variable stands for/);
    assert.ok(!Object.keys(F.__page().handlers).some(k => /jv-/.test(k)));
  });
  test('in a German page the three beside the button are the German names', () => {
    fill({ lang: 'de' });
    F.openJourneyBox(3);
    assert.deepEqual([...modals()[0].body.matchAll(/data-jv-put="(\{\{[a-z_]+\}\})" title="([^"]+)"/g)].map(x => `${x[1]}|${x[2]}`), ['{{vorname}}|Vorname', '{{name}}|Voller Name', '{{firma}}|Firma']);
    assert.match(modals()[0].body, /<span>Variable einfügen<\/span>/);
  });
  test('a choice from the list goes into the text — or into the title, when that was the field last in use', () => {
    fill();
    F.openJourneyBox(3);
    const { fields: f, handlers: h, log } = F.__page();
    F.__fill({ title: { value: 'Call ', selectionStart: 5, selectionEnd: 5 }, text: { value: 'About ', selectionStart: 6, selectionEnd: 6 } });
    const anchor = { id: 'btn' };
    h['click [data-jv-menu]']({}, anchor);
    const [, at, items, opts] = log.find(c => c[0] === 'menu');
    assert.equal(at, anchor);
    assert.deepEqual(opts, { className: 'menu jr-vars-menu' });
    assert.deepEqual(items.slice(0, 3).map(i => [i.heading, i.label, i.hint]), [['Contact', undefined, undefined], [undefined, 'Full name', '{{name}}'], [undefined, 'First name', '{{first_name}}']]);
    assert.ok(items.filter(i => !i.heading).every(i => typeof i.onSelect === 'function' && i.hint === `{{${i.hint.slice(2, -2)}}}`));
    items.find(i => i.hint === '{{deal}}').onSelect();
    assert.deepEqual([f.title.value, f.text.value, f.text.focused], ['Call ', 'About {{deal}}', 1], 'nothing was in use yet: the text');
    h['focusin input, textarea']({}, { id: 'jr-abc1234-title' });
    items.find(i => i.hint === '{{first_name}}').onSelect();
    assert.deepEqual([f.title.value, f.title.focused, f.text.value], ['Call {{first_name}}', 1, 'About {{deal}}']);
    h['focusin input, textarea']({}, { id: 'jr-abc1234-n' });   // the wait's number is no place for a variable
    h['click [data-jv-put]']({}, { dataset: { jvPut: '{{company}}' } });
    assert.equal(f.title.value, 'Call {{first_name}}{{company}}', 'still the title');
    h['focusin input, textarea']({}, { id: 'jr-abc1234-text' });
    items.find(i => i.hint === '{{deal.finanzierung}}').onSelect();
    assert.equal(f.text.value, 'About {{deal}}{{deal.finanzierung}}', 'one of the workspace\'s own fields');
  });
  test('the line under the text says which names between braces are none, as the person types — and goes again', () => {
    fill();
    F.openJourneyBox(3);
    const { fields: f, handlers: h } = F.__page();
    assert.deepEqual([f.unknown.hidden, f.unknown.textContent], [true, ''], 'the saved step names only variables');
    F.__fill({ title: 'Call {{frist_name}}', text: 'About {{deal}} and {{nope|x}} and {{frist_name}} {{unsubscribe}}' });
    h['input input, textarea']();
    assert.deepEqual([f.unknown.hidden, f.unknown.textContent], [false, 'Not a variable: {{frist_name}}, {{nope|x}}, {{unsubscribe}}'], 'each once, as typed; the "no more emails" link is none in a task');
    F.__fill({ title: 'Call {{first_name}}', text: 'About {{deal}}' });
    h['input input, textarea']();
    assert.deepEqual([f.unknown.hidden, f.unknown.textContent], [true, '']);
    fill({ lang: 'de' });
    F.openJourneyBox(2);
    F.__fill({ title: 'x', text: '{{vornam}} {{abmelden}}' });
    F.__page().handlers['input input, textarea']();
    assert.equal(F.__page().fields.unknown.textContent, 'Keine Variable: {{vornam}}', 'in an email the link is one');
  });
  test('a variable put in from the list is looked at too, and the note is set when the window opens', () => {
    fill();
    const odd = { ...FLOW, nodes: FLOW.nodes.map(n => (n.id === 3 ? { ...n, body: 'About {{deel}}' } : n)) };
    F.__set('journeyFlows', [odd]);
    F.openJourneyBox(3);
    F.__fill({ title: 'Call {{name}}', text: 'About {{deel}}' });
    F.__page().handlers['input input, textarea']();
    assert.equal(F.__page().fields.unknown.textContent, 'Not a variable: {{deel}}');
    F.__fill({ text: { value: 'About ', selectionStart: 6, selectionEnd: 6 } });
    F.__page().handlers['click [data-jv-put]']({}, { dataset: { jvPut: '{{name}}' } });
    assert.deepEqual([F.__page().fields.text.value, F.__page().fields.unknown.hidden], ['About {{name}}', true], 'a value set by the page fires no "input": the note is redone by hand');
    assert.match(sliceFn(vars, 'journeyVarWire', 'journey-vars.js'), /on\(w\.m\.el, 'input', 'input, textarea', note\);\s+note\(\);\s+\}$/, 'said when the window opens');
  });
  test('a name that is no variable does not hold saving back: it is saved as typed', async () => {
    fill({ answers: { 'put /api/journey/nodes/3': { flow: FLOW } } });
    F.openJourneyBox(3);
    F.__fill({ n: '0', unit: 'min', title: 'Call {{frist_name}}', text: 'About {{nope}}' });
    await F.__page().handlers['click [data-jr-save]']();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put'), ['put', '/api/journey/nodes/3', { title: 'Call {{frist_name}}', body: 'About {{nope}}', wait_minutes: 0, config: {} }]);
    assert.ok(F.__page().log.some(c => c[0] === 'close'));
  });
});

describe('the preview of an email', () => {
  test('every variable is filled with its sample value — the one the server\'s test email uses', () => {
    fill();
    const sample = F.journeyVarSample(NOW);
    assert.deepEqual(sample, { name: 'Erika Musterfrau', first_name: 'Erika', last_name: 'Musterfrau', email: 'erika@example.de', phone: '+49 151 23456789', company: 'Muster GmbH', deal: 'Beispiel-Deal',
      deal_value: '250.000', stage: 'Erstgespräch', pipeline: 'Vertrieb', owner: 'Max Berater', owner_first_name: 'Max', owner_email: 'max@example.de', workspace: 'Muster Immobilien', meeting_time: '10:00',
      unsubscribe: '#', meeting_date: '26.11.2026', today: '19.11.2026',
      date: '19.11.2026', time: '13:00', date_time: '19.11.2026, 13:00', weekday: 'Donnerstag', month: 'November', year: '2026' });
    assert.deepEqual(Object.keys(sample).sort(), [...NAMES].sort(), 'a value for every name');
    for (const n of NAMES) assert.equal(F.journeyVarFill(`<{{${n}}}>`, sample), `<${sample[n]}>`, n);
    for (const [german, name] of Object.entries(ALIASES)) assert.equal(F.journeyVarFill(`{{${german}}}`, sample), sample[name], german);
    assert.equal(F.journeyVarFill('{{ First_Name }} {{VORNAME}}', sample), 'Erika Erika');
  });
  test('the day is Berlin\'s, as dd.mm.yyyy, and the meeting a week on — also across a month and a year', () => {
    assert.deepEqual([F.journeyVarSample(new Date('2026-11-19T23:30:00Z')).today, F.journeyVarSample(new Date('2026-11-19T22:30:00Z')).today], ['20.11.2026', '19.11.2026'], 'half past midnight in Berlin is the next day');
    assert.equal(F.journeyVarSample(new Date('2026-12-28T10:00:00Z')).meeting_date, '04.01.2027');
    assert.equal(F.journeyVarSample(new Date('2026-03-27T10:00:00Z')).meeting_date, '03.04.2026', 'across the night the clocks change');
  });
  // The server's sample is the page's: the test email and the preview read alike. Red until utils/journey-vars.js is there.
  test('the sample is the server\'s own', () => {
    const server = require('../../utils/journey-vars');
    assert.deepEqual({ ...F.journeyVarSample(NOW), unsubscribe: '' }, server.sampleValues(NOW), 'everything but the link, which the server is handed');
  });
  // Part 18: the day and the time, on the clock of whoever saves the step.
  test('the day, the time, the weekday, the month and the year are the server\'s own, on every clock', () => {
    const server = require('../../utils/journey-vars');
    const moments = ['2026-11-19T12:00:00Z', '2026-12-31T23:30:00Z', '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-10-25T00:30:00Z', '2026-07-01T07:05:00Z', '2028-02-29T22:00:00Z'];
    for (const at of moments) for (const zone of ['Europe/Berlin', 'America/New_York', 'Asia/Manila', 'UTC', 'Asia/Kolkata', 'Pacific/Auckland']) {
      assert.deepEqual(F.journeyVarClock(new Date(at), zone), server.clockValues(new Date(at), zone), `${at} ${zone}`);
      assert.deepEqual({ ...F.journeyVarSample(new Date(at), false, zone), unsubscribe: '' }, server.sampleValues(new Date(at), zone), `the sample, ${at} ${zone}`);
    }
    assert.deepEqual(F.journeyVarClock(new Date('2026-12-31T23:30:00Z'), 'America/New_York'), { date: '31.12.2026', time: '18:30', date_time: '31.12.2026, 18:30', weekday: 'Donnerstag', month: 'Dezember', year: '2026', today: '31.12.2026' });
    assert.deepEqual(F.journeyVarClock(new Date('2026-12-31T23:30:00Z'), 'Nowhere/None'), F.journeyVarClock(new Date('2026-12-31T23:30:00Z'), 'Europe/Berlin'), 'a zone the browser does not know is Berlin, as on the server');
    assert.equal(F.journeyVarSample(new Date('2026-12-31T23:30:00Z'), false, 'America/New_York').meeting_date, '07.01.2027', 'the sample meeting is a week on from that clock\'s day');
  });
  test('the clock is the one of whoever sits at the page, and the line under the text names it', () => {
    const Z = loadFns('public/js/journey-vars.js', ['journeyVarZone', 'journeyVarClock', 'journeyVarSample'], { state: { zone: 'Asia/Manila' },
      extra: `function currentTimezone() { return zone; }\n${['JOURNEY_VAR_KEYS', 'JOURNEY_VAR_SAMPLE'].map(n => sliceConst('public/js/journey-vars.js', n)).join('\n')}` });
    const at = new Date('2026-12-31T23:30:00Z');
    assert.equal(Z.journeyVarZone(), 'Asia/Manila');
    assert.deepEqual([Z.journeyVarSample(at).date_time, Z.journeyVarSample(at).weekday, Z.journeyVarSample(at).year, Z.journeyVarSample(at, true).time], ['01.01.2027, 07:30', 'Freitag', '2027', '07:30']);
    for (const none of ['', null, undefined, 7]) { Z.__set('zone', none); assert.equal(Z.journeyVarZone(), 'Europe/Berlin', `no zone (${none}): Berlin`); }
    assert.equal(F.journeyVarZone(), 'Europe/Berlin', 'a page without a clock: Berlin');
    assert.match(sliceFn(vars, 'journeyVarBarHtml', 'journey-vars.js'), /<p class="help">\$\{esc\(tf\('jv_zone', \{ zone: journeyVarZone\(\) \}\)\)\}<\/p>/);
    assert.equal(dict.en.jv_zone, 'Date and time go by the time zone of whoever saves the step: {zone}.');
    assert.equal(dict.de.jv_zone, 'Datum und Uhrzeit richten sich nach der Zeitzone der Person, die den Schritt speichert: {zone}.');
  });
  test('the preview shows the day and the time also for a contact about whom nothing is known', () => {
    const text = '{{first_name|there}} · {{date}} · {{uhrzeit}} · {{weekday}} · {{monat}} · {{year}} · {{datum_uhrzeit}}';
    assert.equal(F.journeyVarFill(text, F.journeyVarSample(NOW, true)), 'there · 19.11.2026 · 13:00 · Donnerstag · November · 2026 · 19.11.2026, 13:00');
    assert.equal(F.journeyVarFill(text, F.journeyVarSample(NOW)), 'Erika · 19.11.2026 · 13:00 · Donnerstag · November · 2026 · 19.11.2026, 13:00');
    assert.deepEqual(F.journeyVarUnknown([text], 'email'), [], 'none of them is a name nobody knows');
  });
  test('the server fills a text as the page previews it', () => {
    const server = require('../../utils/journey-vars');
    fill();
    const values = F.journeyVarSample(NOW), bare = F.journeyVarSample(NOW, true);
    const known = { ...values, 'deal.finanzierung': '[Finanzierung]', 'contact.kundenstatus': '[Kundenstatus]' }, knownBare = { ...bare, 'deal.finanzierung': '', 'contact.kundenstatus': '' };
    for (const text of ['Hallo {{first_name}}, {{ Vorname | zusammen }}!', '{{frist_name}} {{}} {{|x}} {name} {{deal.gone}} {{deal. finanzierung}}', '{{deal.finanzierung|offen}} / {{kontakt.Kundenstatus}} / {{contact.kundenstatus| - }}',
      '{{owner|das Team}} {{meeting_date|bald}} {{today}} {{workspace}}', '{{first_name|a|b}} {{name| <b>x</b> }} {{company|"Q" & \'q\'}}', '{{constructor}} {{deal.constructor}} {{toString|x}}']) {
      for (const asHtml of [false, true]) {
        assert.equal(F.journeyVarFill(text, values, { html: asHtml }), server.fill(text, known, asHtml), `${text} (html ${asHtml})`);
        assert.equal(F.journeyVarFill(text, bare, { html: asHtml, fields: false }), server.fill(text, knownBare, asHtml), `${text} (nothing known, html ${asHtml})`);
      }
    }
  });
  test('one of the workspace\'s own fields shows its name in square brackets; a field that is gone stays as typed', () => {
    fill();
    const sample = F.journeyVarSample(NOW);
    assert.equal(F.journeyVarFill('{{deal.finanzierung}} / {{Deal.EINZUG}} / {{contact.kundenstatus}} / {{kontakt.kundenstatus}}', sample), '[Finanzierung] / [Einzug am] / [Kundenstatus] / [Kundenstatus]');
    assert.equal(F.journeyVarFill('{{deal.gone}} {{contact.finanzierung}} {{deal.}}', sample), '{{deal.gone}} {{contact.finanzierung}} {{deal.}}');
    assert.equal(F.journeyVarFill('{{deal.finanzierung|offen}}', sample), '[Finanzierung]', 'a fallback waits for an empty value');
  });
  test('a name nobody knows stays exactly as typed', () => {
    fill();
    const sample = F.journeyVarSample(NOW);
    for (const text of ['{{frist_name}}', '{{ nope }}', '{{}}', '{{|x}}', '{{first name}}', '{{constructor}}', '{{toString|x}}', '{name}', '{{ {{name', 'a }} b {{']) assert.equal(F.journeyVarFill(text, sample), text, text);
    assert.equal(F.journeyVarFill('{{nope}} {{first_name}} {{nope}}', sample), '{{nope}} Erika {{nope}}');
    assert.equal(F.journeyVarFill(null, sample), ''); assert.equal(F.journeyVarFill(undefined, sample), '');
  });
  test('a fallback is what an empty value gives: seen for a contact about whom nothing is known', () => {
    fill();
    const bare = F.journeyVarSample(NOW, true);
    assert.deepEqual(Object.entries(bare).filter(([, v]) => v !== '').map(([k]) => k).sort(), ['date', 'date_time', 'month', 'time', 'today', 'unsubscribe', 'weekday', 'workspace', 'year'], 'what always has a value: the day and the time are known for everyone');
    assert.equal(F.journeyVarFill('Hallo {{first_name|zusammen}}, {{ Vorname | liebe Kundin }}!', bare), 'Hallo zusammen, liebe Kundin!');
    assert.equal(F.journeyVarFill('Hallo {{first_name}}!', bare), 'Hallo !', 'no fallback: nothing');
    assert.equal(F.journeyVarFill('{{first_name|a|b}}', bare), 'a|b', 'only the first bar parts the name from the fallback');
    assert.equal(F.journeyVarFill('{{first_name|}}{{first_name|  }}', bare), '');
    assert.equal(F.journeyVarFill('{{deal.finanzierung|offen}} {{deal.finanzierung}}.', bare, { fields: false }), 'offen .', 'a field that holds nothing');
    assert.equal(F.journeyVarFill('{{today}} {{workspace}}', bare), '19.11.2026 Muster Immobilien');
    assert.equal(F.journeyVarFill('{{first_name|zusammen}}', F.journeyVarSample(NOW)), 'Erika', 'with a value the fallback is not used');
    assert.equal(F.journeyVarFill('{{name|x}}', { name: '   ' }), 'x', 'spaces are no value');
  });
  test('plain text: variables filled, line breaks kept, everything text', () => {
    fill();
    const out = bodyOf(F.journeyPreviewHtml('Hallo {{first_name}},\n1 < 2 & "{{company}}" — {{nope}} {{deal.finanzierung}}\n{{vorname|x}}'));
    assert.match(out, /^<div style="[^"]*">Hallo Erika,<br>1 &lt; 2 &amp; &quot;Muster GmbH&quot; — \{\{nope\}\} \[Finanzierung\]<br>Erika<\/div>$/);
  });
  test('HTML: the author\'s markup is taken as it is, and what a variable is filled with is text in it', () => {
    fill({ deal: [{ field_key: 'x', name: '<img src=x onerror=alert(1)>' }, { field_key: 'q', name: 'a"b\'c' }] });
    const out = bodyOf(F.journeyPreviewHtml('<h1 style="color:#18345D">Hi {{name}}</h1><a href="{{unsubscribe}}">x</a><p>{{deal.x}}</p><a title="{{deal.q}}" data-x=\'{{deal.q}}\'>y</a>'));
    assert.equal(out, '<h1 style="color:#18345D">Hi Erika Musterfrau</h1><a href="#">x</a><p>[&lt;img src=x onerror=alert(1)&gt;]</p><a title="[a&quot;b&#39;c]" data-x=\'[a&quot;b&#39;c]\'>y</a>');
    const bare = bodyOf(F.journeyPreviewHtml('<p>Hallo {{first_name|<script>alert(1)</script>}}</p><p title="{{name|" onmouseover="alert(2)}}">{{company|a & b}}</p>', true));
    assert.equal(bare, '<p>Hallo &lt;script&gt;alert(1)&lt;/script&gt;</p><p title="&quot; onmouseover=&quot;alert(2)">a &amp; b</p>', 'a fallback is text too: it closes no attribute and opens no tag');
    assert.doesNotMatch(bare, /<script|onmouseover="alert/);
  });
  test('plain text with a hostile name of a field stays text; a tag typed into a fallback makes the text HTML, and the fallback is text in it', () => {
    fill({ deal: [{ field_key: 'x', name: '</div><script>alert(1)</script>' }] });
    const out = bodyOf(F.journeyPreviewHtml('{{deal.x}} & {{nope|x}}\n1 < 2'));
    assert.doesNotMatch(out, /<script|<\/div><s/);
    assert.match(out, /^<div style="[^"]*">\[&lt;\/div&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;\] &amp; \{\{nope\|x\}\}<br>1 &lt; 2<\/div>$/);
    assert.equal(bodyOf(F.journeyPreviewHtml('Hi {{first_name|<i>du</i>}}', true)), 'Hi &lt;i&gt;du&lt;/i&gt;', 'read as HTML because of the tag — and the fallback is shown as the text it is');
    assert.equal(bodyOf(F.journeyPreviewHtml('<p>{{nope|<b>}}</p>')), '<p>{{nope|<b>}}</p>', 'what is no variable is the author\'s own text, left as it is');
  });
  test('the window: the subject above the frame, the frame still sandboxed, and a tick for "nothing known"', () => {
    fill();
    F.openJourneyBox(2);
    const [m] = modals(), f = F.__page().fields, h = F.__page().handlers;
    assert.match(m.body, /<span class="label">Preview<\/span><p class="jr-subject" id="jr-abc1234-psubject"><\/p>\s*<iframe class="jr-preview" id="jr-abc1234-preview" sandbox="" title="Preview"><\/iframe>\s*<label class="jr-check"><input type="checkbox" id="jr-abc1234-bare"><span>Show it for a contact about whom nothing is known<\/span><\/label>/);
    F.__fill({ title: 'Welcome {{first_name|there}} <b>', text: 'Hallo {{first_name|zusammen}},\n{{frist}}' });
    h['input textarea']();
    assert.equal(f.psubject.textContent, 'Subject: Welcome Erika <b>', 'set as text: a subject is never markup');
    assert.match(f.preview.srcdoc, />Hallo Erika,<br>\{\{frist\}\}<\/div>/);
    f.bare.checked = true;
    h['change [type="checkbox"]']();
    assert.equal(f.psubject.textContent, 'Subject: Welcome there <b>');
    assert.match(f.preview.srcdoc, />Hallo zusammen,<br>\{\{frist\}\}<\/div>/);
    f.bare.checked = false;
    F.__fill({ title: 'Angebot für {{firma}}' });
    h['input input']();
    assert.equal(f.psubject.textContent, 'Subject: Angebot für Muster GmbH', 'the subject is redrawn as it is typed');
  });
  test('a variable put in redraws the preview at once', () => {
    fill();
    F.openJourneyBox(2);
    const f = F.__page().fields, h = F.__page().handlers;
    F.__fill({ title: 'Hi', text: { value: 'Hallo !', selectionStart: 6, selectionEnd: 6 } });
    h['click [data-jv-put]']({}, { dataset: { jvPut: '{{first_name}}' } });
    assert.equal(f.text.value, 'Hallo {{first_name}}!');
    assert.match(f.preview.srcdoc, />Hallo Erika!<\/div>/);
    h['focusin input, textarea']({}, { id: 'jr-abc1234-title' });
    h['click [data-jv-put]']({}, { dataset: { jvPut: '{{company}}' } });
    assert.equal(f.psubject.textContent, 'Subject: HiMuster GmbH');
  });
  test('a task has no preview, and putting a variable in asks for none', () => {
    fill();
    F.openJourneyBox(3);
    assert.doesNotMatch(modals()[0].body, /jr-preview|jr-subject|-bare"/);
    F.__fill({ title: 'x', text: 'y' });
    F.__page().handlers['click [data-jv-put]']({}, { dataset: { jvPut: '{{name}}' } });
    assert.equal(F.__page().fields.text.value, 'y{{name}}');
    assert.ok(!('preview' in F.__page().fields) || F.__page().fields.preview.srcdoc === undefined);
  });
});

// Part 19: the tick box "Add the unsubscribe line at the end of the email".
describe('the unsubscribe line of an email', () => {
  const OWN = '<p>Hi {{first_name}}</p><a href="{{unsubscribe_url}}">Abmelden</a>';
  const LINE = '<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6E7A8C;margin-top:28px">Keine weiteren E-Mails erhalten: <a href="#" style="color:#6E7A8C">abmelden</a></p>';
  const withNodes = (nodes, lang = 'en') => { fill({ lang }); F.__set('journeyFlows', [{ ...FLOW, nodes: [FLOW.nodes[0], ...nodes] }]); };
  const BOX = /<div class="field"><label class="jr-check"><input type="checkbox" id="jr-abc1234-footer"( checked)?><span>Add the unsubscribe line at the end of the email<\/span><\/label>\s*<p class="help" id="jr-abc1234-footer-hint"><\/p><\/div>\s*<div class="field"><span class="label">Preview<\/span>/;
  test('whether a text has the link: under each of its names, with a fallback, capitals and spaces not counting — nothing else', () => {
    for (const text of ['{{unsubscribe}}', 'a {{abmelden}} b', '<a href="{{unsubscribe_url}}">x</a>', '{{ Unsubscribe_URL }}', '{{unsubscribe|#}}', '{{first_name}} {{ABMELDEN}}']) assert.equal(F.journeyVarHas(text, 'unsubscribe'), true, text);
    for (const text of ['', null, undefined, 'unsubscribe', '{unsubscribe}', '{{unsubscribe_link}}', '{{first_name|unsubscribe}}', '{{deal.unsubscribe}}', '{{unsub scribe}}']) assert.equal(F.journeyVarHas(text, 'unsubscribe'), false, String(text));
    assert.equal(F.journeyVarHas('{{vorname}}', 'first_name'), true); assert.equal(F.journeyVarHas('{{vorname}}', 'name'), false);
    // the server decides by the same rule
    const server = require('../../utils/journey-vars');
    for (const text of ['{{unsubscribe}}', '{{ Unsubscribe_URL |x}}', '{{abmelden}}', '{{unsubscribe_link}}', '{{first_name|unsubscribe}}', '{unsubscribe}', '']) assert.equal(F.journeyVarHas(text, 'unsubscribe'), server.usedIn(text).has('unsubscribe'), text);
    assert.equal(constOf('JOURNEY_VAR_ALIASES').unsubscribe_url, 'unsubscribe');
    fill({ lang: 'de' }); assert.equal(F.journeyVarWord('unsubscribe'), '{{abmelden}}', 'the German page still puts in the German name');
  });
  test('a new email: the box is ticked, stands above the preview, and is locked until the text has its own link', () => {
    fill();
    F.openJourneyBox(null, { kind: 'email', afterId: 2 });
    const [m] = modals(), f = F.__page().fields, h = F.__page().handlers;
    assert.equal(BOX.exec(m.body)[1], ' checked');
    assert.deepEqual([f.footer.checked, f.footer.disabled], [true, true]);
    assert.equal(f['footer-hint'].textContent, 'Every email must offer a way to unsubscribe. The line can be switched off once the text itself contains {{unsubscribe}}.');
    assert.ok(f.preview.srcdoc.endsWith(`${LINE}</body></html>`), 'the preview shows the line');
    F.__fill({ title: 'Hi', text: OWN });
    h['input textarea']();
    assert.deepEqual([f.footer.checked, f.footer.disabled], [true, false], 'the text has the link: the box can be used, and stays as it was');
    assert.equal(f['footer-hint'].textContent, 'The text has its own unsubscribe link ({{unsubscribe}}), so the line can be switched off.');
    assert.ok(f.preview.srcdoc.endsWith(`<a href="#">Abmelden</a>${LINE}</body></html>`), 'both, as it will be sent');
    f.footer.checked = false;
    h['change [type="checkbox"]']();
    assert.ok(f.preview.srcdoc.endsWith('<a href="#">Abmelden</a></body></html>'), 'switched off: the text\'s own link alone');
    F.__fill({ text: '<p>Hi</p>' });
    h['input textarea']();
    assert.deepEqual([f.footer.checked, f.footer.disabled], [true, true], 'the link was taken out: on again, and locked');
    assert.ok(f.preview.srcdoc.endsWith(`<p>Hi</p>${LINE}</body></html>`));
  });
  test('a variable put in from the list unlocks the box too', () => {
    fill();
    F.openJourneyBox(null, { kind: 'email', afterId: 2 });
    const f = F.__page().fields, h = F.__page().handlers;
    F.__fill({ title: 'Hi', text: { value: 'Bye ', selectionStart: 4, selectionEnd: 4 } });
    h['click [data-jv-put]']({}, { dataset: { jvPut: '{{unsubscribe}}' } });
    assert.deepEqual([f.text.value, f.footer.disabled], ['Bye {{unsubscribe}}', false]);
  });
  test('a saved email opens as it is sent: the line is off for a text with its own link unless the step asks for it', () => {
    const email = (id, body, config) => box(id, 'email', { title: 'T', body, config });
    withNodes([email(2, OWN, { tz: 'Europe/Berlin', footer: true }), email(3, OWN, { tz: 'Europe/Berlin', footer: false }), email(4, OWN, { tz: 'Europe/Berlin' }), email(5, OWN, {}), email(6, '<p>Hi</p>', { footer: false }), email(7, '<p>Hi</p>', {})]);
    const ticked = id => { F.__reset(); F.openJourneyBox(id); return BOX.exec(modals()[0].body)[1] === ' checked'; };
    assert.deepEqual([2, 3, 4, 5, 6, 7].map(ticked), [true, false, false, false, true, true]);
  });
  test('saving says what the box says; closing an untouched window asks nothing', async () => {
    const sentOf = async (node, after) => {
      withNodes([node]); F.__reset({ [`put /api/journey/nodes/${node.id}`]: { flow: FLOW } });
      F.__fill({ n: '0', unit: 'min', title: node.title, text: node.body });   // the stand-in fields do not read the markup: the text is there when the window opens, as in a browser
      F.openJourneyBox(node.id);
      const f = F.__page().fields, h = F.__page().handlers;
      if (after) after(f, h);
      await h['click [data-jr-save]']();
      return F.__page().log.find(c => c[0] === 'put')[2].config;
    };
    const own = box(2, 'email', { title: 'T', body: OWN, config: { tz: 'Europe/Berlin' } });
    assert.deepEqual(await sentOf(own), { footer: false }, 'opened unticked, saved unticked');
    assert.deepEqual(await sentOf(own, (f, h) => { f.footer.checked = true; h['change [type="checkbox"]'](); }), { footer: true });
    assert.deepEqual(await sentOf(box(2, 'email', { title: 'T', body: '<p>Hi</p>', config: {} })), { footer: true }, 'no link in the text: always on');
    assert.deepEqual(await sentOf(own, (f, h) => { F.__fill({ text: 'Hi' }); h['input textarea'](); }), { footer: true }, 'the link taken out before saving');
    withNodes([box(3, 'task', { title: 'T', body: '{{name}}' })]); F.__reset({ 'put /api/journey/nodes/3': { flow: FLOW } });
    F.openJourneyBox(3); F.__fill({ n: '0', unit: 'min', title: 'T', text: 'x' });
    await F.__page().handlers['click [data-jr-save]']();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'put')[2].config, {}, 'a task has no such line');
    assert.doesNotMatch(modals()[0].body, /-footer"/);
    const code = sliceFn(js, 'openJourneyBox', 'journey.js');
    assert.match(code, /if \(email\) start\.footer = !journeyVarHas\(start\.text, 'unsubscribe'\) \|\| !!\(node && node\.config && node\.config\.footer === true\);/, 'what the window opens with is what it compares with when it is closed');
    assert.match(code, /\.\.\.\(email \? \{ footer: !!el\('footer'\)\.checked \} : \{\}\)/);
  });
  test('German: the box and both lines, speaking to nobody in particular, naming the German variable', () => {
    fill({ lang: 'de' });
    F.openJourneyBox(null, { kind: 'email', afterId: 2 });
    const [m] = modals(), f = F.__page().fields;
    assert.match(m.body, /<span>Abmeldezeile am Ende der E-Mail anfügen<\/span>/);
    assert.equal(f['footer-hint'].textContent, 'Jede E-Mail muss eine Möglichkeit zum Abmelden bieten. Die Zeile lässt sich abschalten, sobald der Text selbst {{abmelden}} enthält.');
    F.__fill({ text: '{{abmelden}}' }); F.__page().handlers['input textarea']();
    assert.equal(f['footer-hint'].textContent, 'Der Text enthält einen eigenen Abmeldelink ({{abmelden}}), die Zeile lässt sich daher abschalten.');
    for (const k of ['jr_footer', 'jr_footer_need', 'jr_footer_own']) { assert.ok(dict.en[k] && dict.de[k], k); assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|Sie|Ihre?)\b/, k); }
  });
  test('the line in the preview is the server\'s own, word for word', () => {
    const run = require('../../utils/journey-run');
    const sent = run.emailParts({ title: 'x', body: '<p>Hi</p>' }, {}, '#').html;
    assert.equal(sent, `<p>Hi</p>${LINE}`);
    assert.ok(F.journeyPreviewHtml('<p>Hi</p>', false, true).endsWith(`<p>Hi</p>${LINE}</body></html>`));
    assert.ok(F.journeyPreviewHtml('<p>Hi</p>', false, false).endsWith('<p>Hi</p></body></html>'));
    assert.ok(F.journeyPreviewHtml('<p>Hi</p>').endsWith('<p>Hi</p></body></html>'), 'not asked for: no line');
  });
});

describe('the look', () => {
  test('the note is a quiet warning that only the hidden attribute hides; the list is wide enough for words and name', () => {
    assert.match(css, /^\.jr-vars-note \{ font-size: var\(--fs-sm\); font-weight: 600; color: var\(--warning\); overflow-wrap: anywhere; \}$/m);
    assert.doesNotMatch(css, /^\.jr-vars-note[^{]*\{[^}]*display:/m, 'it sets no display the hidden attribute would have to beat');
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m);
    assert.match(css, /^\.menu\.jr-vars-menu \{ max-width: min\(460px, calc\(100vw - 16px\)\); \}$/m);
    assert.ok(css.indexOf('\n.menu { position: fixed;') < css.indexOf('\n.menu.jr-vars-menu {'), 'after the menu\'s own width, and with one class more');
    assert.match(css, /^\.jr-subject \{ margin-bottom: 6px;[^}]*overflow-wrap: anywhere; \}$/m); assert.match(css, /^\.jr-subject:empty \{ display: none; \}$/m);
  });
});
