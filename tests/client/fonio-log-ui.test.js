// CLIENT (static + pure-function) tests for the fonio calls page (public/js/fonio-log.js, FONIO_CHANGES Part 17,
// 2026-11-11): the sidebar link (hidden until fonio is connected) and the page markup, script order, the wiring in
// auth.js / core.js / integrations.js / modals.js, both dictionaries, and the functions — the filters, the table row
// (which calls get "Add contact" / "Connect to a contact"), the contact dialog filled from a call and the call handed
// to the new contact exactly once, the picker's search, and what typed or received text cannot do to the markup.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const intg = read('public/js/integrations.js');
const mod  = read('public/js/modals.js');
const js   = read('public/js/fonio-log.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;
const pageStart = html.indexOf('<section id="page-calls"');
const page = html.slice(pageStart, html.indexOf('</section>', pageStart));

// the sandbox: the page's own state, a recording api/ui/document, and the real t/tf/esc/icon
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  sliceFn(core, 't', 'core.js'),
  sliceFn(core, 'tf', 'core.js'),
  sliceFn(core, 'icon', 'core.js'),
  sliceConst('public/js/fonio-log.js', 'FONIO_LOG_FILTERS'),
  'const FONIO_LOG_PICK_MAX = 30;',
  sliceConst('public/js/fonio-log.js', 'FONIO_LOG_TECH_PARTS'),
  `const __log = [];
   let __answers = {};
   const __els = {};
   const __el = id => (__els[id] ||= { id, value: '', innerHTML: '', textContent: '', hidden: null, focused: 0,
     classList: { toggle(_c, on) { __els[id].hidden = on; }, remove() { __els[id].hidden = false; }, add() { __els[id].hidden = true; } }, focus() { __els[id].focused++; } });
   let __missing = [];
   const document = { getElementById: id => (__missing.includes(id) ? null : __el(id)) };
   const api = {
     get: async url => { __log.push(['get', url]); return __answers[url]; },
     post: async (url, body) => { __log.push(['post', url, body]); return __answers[url] ?? { success: true }; },
   };
   const apiFetchSilent = async url => { __log.push(['silent', url]); return __answers[url]; };
   const ui = { toast: m => __log.push(['toast', m]) };
   const closeModal = id => __log.push(['close', id]);
   async function openContactModal() { fonioLogForget(); __log.push(['openContactModal', currentContactType]); }
   function __state() { return { fonioLogEntries, fonioLogFilter, fonioLogPending, fonioLogPicking, currentContactType }; }
   function __reset(answers = {}, missing = []) { __log.length = 0; __answers = answers; __missing = missing; for (const k of Object.keys(__els)) delete __els[k]; }
   function __page() { return { log: __log, els: __els }; }`,
].join('\n');
const NAMES = ['showFonioLogNav', 'updateFonioLogNav', 'fonioLogIsUnknown', 'fonioLogMatches', 'loadFonioLog', 'setFonioLogFilter', 'renderFonioLog', 'fonioLogRowHtml',
  'fonioLogUnknownById', 'fonioLogConnect', 'fonioLogForget', 'fonioLogAddContact', 'fonioLogContactSaved', 'fonioLogPickContact', 'fonioLogPickMatches', 'renderFonioLogPick', 'fonioLogPicked', 'fonioLogTechText', 'openFonioLogTech'];
const F = loadFns('public/js/fonio-log.js', NAMES, {
  state: { currentLang: 'en', fonioLogManage: false, fonioLogEntries: [], fonioLogFilter: 'all', fonioLogPending: null, fonioLogPicking: null, fonioLogContacts: [], currentContactType: 'supplier' },
  extra, expose: ['__state', '__reset', '__page'],
});

const LOG = '/api/integrations/fonio/log';
const sent    = { key: 'call:12', id: 12, by_crm: true, direction: 'outbound', at: '2026-11-10T10:00:00.000Z', number: '+491711234567', caller_name: null, contact_id: 40, contact_name: 'Erika Muster',
  deal_id: 60, deal_title: 'Wohnung 3', duration: null, summary: null, link: 'https://app.fonio.ai/c/12', result: true, noted: true };
const known   = { key: 'other:901', id: 901, by_crm: false, direction: 'inbound', at: '2026-11-11T09:30:00.000Z', number: '+491511000001', caller_name: null, contact_id: 40, contact_name: 'Erika Muster',
  deal_id: null, deal_title: null, duration: '1:05', summary: 'Fragt nach dem Exposé.', link: null, result: true, noted: true };
const unknown = { key: 'other:900', id: 900, by_crm: false, direction: 'inbound', at: '2026-11-11T07:00:00.000Z', number: '+491519999999', caller_name: 'Max Neu', contact_id: null, contact_name: null,
  deal_id: null, deal_title: null, duration: null, summary: null, link: null, result: true, noted: false };
const ENTRIES = [known, unknown, sent];
function fill(entries = ENTRIES, answers = {}) { F.__reset(answers); F.__set('fonioLogManage', false); F.__set('fonioLogEntries', entries); F.__set('fonioLogFilter', 'all'); F.__set('fonioLogPending', null); F.__set('fonioLogPicking', null); }

describe('markup', () => {
  test('sidebar: one link, hidden by default, before Integrations, with a sprite icon', () => {
    assert.equal(count(html, 'data-page="calls"'), 1);
    const link = html.match(/<a href="#" class="sb-link hidden" data-page="calls" id="nav-fonio-log-link">[^\n]*<\/a>/);
    assert.ok(link, 'link markup');
    assert.match(link[0], /<use href="#i-phone"\/>/);
    assert.match(link[0], /<span class="sb-text" data-i18n="nav_calls">/);
    assert.ok(html.indexOf('data-page="onboarding"') < html.indexOf('data-page="calls"') && html.indexOf('data-page="calls"') < html.indexOf('data-page="integrations"'));
    assert.ok(html.includes('symbol id="i-phone"'));
  });
  test('page: header with refresh, toolbar, a table with seven translated columns, the dots column and an empty body', () => {
    assert.equal(count(html, 'id="page-calls"'), 1);
    assert.match(page, /<section id="page-calls" class="page">/);
    assert.match(page, /<p class="page-sub" id="fonio-log-sub"><\/p>/);
    assert.match(page, /onclick="loadFonioLog\(\)"[\s\S]*?data-i18n="btn_refresh"/);
    assert.match(page, /<div class="toolbar" id="fonio-log-toolbar"><\/div>/);
    assert.deepEqual([...page.matchAll(/<th[^>]*data-i18n="([^"]+)"/g)].map(m => m[1]),
      ['fcl_col_when', 'fcl_col_direction', 'fcl_col_number', 'fcl_col_contact', 'fcl_col_deal', 'fcl_col_result', 'fcl_col_actions']);
    assert.match(page, /<tbody id="fonio-log-body"><\/tbody>/);
    assert.match(page, /<th class="fcl-actions" data-i18n="fcl_col_actions">Action<\/th>\s*<th class="fcl-more" aria-hidden="true"><\/th>\s*<\/tr>/, 'the dots column is last, after Action');
    assert.match(js, /<td colspan="8">/, 'the empty row spans the seven columns and the dots');
    for (const m of page.matchAll(/<(th|span|p|h1)([^>]*)>([^<]+)</g)) if (/[A-Za-z]{2,}/.test(m[3])) assert.match(m[2], /data-i18n=/, `untranslated: ${m[3].trim()}`);
  });
  test('the picker dialog: starts hidden, a search that redraws, a list, Cancel', () => {
    const start = html.indexOf('<div id="fcl-pick-modal" class="modal-overlay hidden">');
    assert.ok(start > 0);
    const modal = html.slice(start, html.indexOf('<div id="object-field-modal"', start));
    assert.match(modal, /<input type="search" id="fcl-pick-search"[^>]*data-i18n-ph="fcl_pick_ph"[^>]*data-i18n-aria="fcl_pick_ph"[^>]*oninput="renderFonioLogPick\(\)"/);
    assert.match(modal, /<ul class="fcl-pick-list" id="fcl-pick-list"><\/ul>/);
    assert.equal(count(modal, `closeModal('fcl-pick-modal')`), 2);
  });
  test('fonio-log.js is loaded after modals.js and integrations.js, before the socket client', () => {
    const i = html.indexOf('<script src="js/fonio-log.js">');
    assert.ok(i > html.indexOf('<script src="js/modals.js">') && i > html.indexOf('<script src="js/integrations.js">'));
    assert.ok(i < html.indexOf('<script src="/socket.io/socket.io.js">'));
    assert.equal(count(html, '<script src="js/fonio-log.js">'), 1);
  });
  test('the stylesheet has the page’s few own rules; the clamp is paired with its standard form', () => {
    for (const sel of ['.fcl-sub', '.fcl-when', '.fcl-summary', '.fcl-actions', '.fcl-pick-list', '.fcl-pick-row', '.fcl-pick-note']) assert.ok(css.includes(`${sel} {`), sel);
    assert.match(css, /\.fcl-summary \{[^}]*-webkit-line-clamp: 3; line-clamp: 3;/);
  });
});

describe('wiring', () => {
  test('auth.js: the link is decided at login, and the page loads its list when opened', () => {
    assert.match(auth, /updateOnboardingNav\(\);\n  updateFonioLogNav\(\);/);
    assert.match(sliceFn(auth, 'switchPage', 'auth.js'), /if \(page === 'calls'\)\s+await loadFonioLog\(\);/);
  });
  test('core.js: the page survives a reload and is redrawn on a language switch', () => {
    assert.match(core, /^const APP_PAGES = \[[^\]]*'calls'[^\]]*\];/m);
    assert.match(sliceFn(core, 'setLanguage', 'core.js'), /if \(page === 'calls'\)\s+renderFonioLog\(\);/);
  });
  test('integrations.js: the fonio tab shows and hides the link as the connection is saved or removed', () => {
    assert.match(sliceFn(intg, 'renderFonio', 'integrations.js'), /if \(typeof showFonioLogNav === 'function'\) showFonioLogNav\(!!d\.configured\);/);
  });
  test('modals.js: opening the contact dialog forgets a pending call; a NEW contact is handed over, an edit is not', () => {
    assert.match(sliceFn(mod, 'openContactModal', 'modals.js'), /^async function openContactModal\(id\) \{\n  if \(typeof fonioLogForget === 'function'\) fonioLogForget\(\);/);
    const save = sliceFn(mod, 'saveContact', 'modals.js');
    assert.match(save, /const fromCall = !id && typeof fonioLogContactSaved === 'function' && await fonioLogContactSaved\(saved\.id\);/);
    assert.ok(save.indexOf('if (!saved || saved.error)') < save.indexOf('fonioLogContactSaved'), 'only after a successful save');
    assert.match(save, /\} else if \(!fromCall\) \{\s*await loadContacts\(\);/);
  });
  test('every text of the page exists in English and German, with the same placeholders', () => {
    const used = new Set([...js.matchAll(/\bt[f]?\('(fcl_[a-z_]+)'/g)].map(m => m[1]));
    for (const m of js.matchAll(/t\(([^)]*'fcl_[^)]*)\)/g)) for (const k of m[1].matchAll(/'(fcl_[a-z_]+)'/g)) used.add(k[1]);
    for (const f of ['all', 'planned', 'inbound', 'outbound', 'unknown']) used.add('fcl_filter_' + f);
    for (const m of html.matchAll(/data-i18n(?:-ph|-aria)?="(fcl_[a-z_]+|nav_calls)"/g)) used.add(m[1]);
    for (const k of [...used]) if (k.endsWith('_')) used.delete(k);   // a prefix completed at run time ('fcl_filter_' + f), listed above
    assert.ok(used.size >= 30, String(used.size));
    for (const k of used) {
      assert.equal(typeof dict.en[k], 'string', `en ${k}`);
      assert.equal(typeof dict.de[k], 'string', `de ${k}`);
      assert.deepEqual((dict.en[k].match(/\{\w+\}/g) || []).sort(), (dict.de[k].match(/\{\w+\}/g) || []).sort(), k);
    }
    const defined = Object.keys(dict.en).filter(k => k.startsWith('fcl_'));
    for (const k of defined) assert.ok(used.has(k), `unused ${k}`);
    assert.deepEqual(defined.sort(), Object.keys(dict.de).filter(k => k.startsWith('fcl_')).sort());
  });
});

describe('the sidebar link', () => {
  test('shown while fonio is connected, hidden otherwise and when the answer fails', async () => {
    for (const [answer, hidden] of [[{ configured: true }, false], [{ configured: false }, true], [{ error: 'x', configured: true }, true], [undefined, true]]) {
      F.__reset({ '/api/integrations/fonio': answer });
      await F.updateFonioLogNav();
      assert.equal(F.__page().els['nav-fonio-log-link'].hidden, hidden, JSON.stringify(answer));
    }
  });
  test('without the link in the page nothing is asked', async () => {
    F.__reset({}, ['nav-fonio-log-link']);
    await F.updateFonioLogNav();
    assert.deepEqual(F.__page().log, []);
  });
});

describe('the list', () => {
  test('loading reads the log; an error leaves an empty list', async () => {
    F.__reset({ [LOG]: { entries: ENTRIES } });
    await F.loadFonioLog();
    assert.equal(F.__state().fonioLogEntries.length, 3);
    F.__reset({ [LOG]: { error: 'nope' } });
    await F.loadFonioLog();
    assert.deepEqual(F.__state().fonioLogEntries, []);
    assert.match(F.__page().els['fonio-log-body'].innerHTML, /No calls yet/);
  });
  test('the filters: all, incoming, outgoing, and calls nobody has given a contact', () => {
    const by = f => ENTRIES.filter(e => F.fonioLogMatches(e, f)).map(e => e.key);
    assert.deepEqual(by('all'), ['other:901', 'other:900', 'call:12']);
    assert.deepEqual(by('inbound'), ['other:901', 'other:900']);
    assert.deepEqual(by('outbound'), ['call:12']);
    assert.deepEqual(by('unknown'), ['other:900']);
    assert.equal(F.fonioLogIsUnknown({ by_crm: true, contact_id: null }), false, 'a call the CRM sent whose contact was deleted is not an unknown caller');
  });
  test('the toolbar counts each filter; the sub line counts in and out; an unknown filter name is "all"', () => {
    fill();
    F.renderFonioLog();
    const { els } = F.__page();
    assert.equal(els['fonio-log-sub'].textContent, '2 incoming, 1 outgoing');
    assert.deepEqual([...els['fonio-log-toolbar'].innerHTML.matchAll(/aria-pressed="(\w+)" onclick="setFonioLogFilter\('(\w+)'\)">([^<]+) <span class="muted">(\d)</g)].map(m => m.slice(1)),
      [['true', 'all', 'All', '3'], ['false', 'planned', 'Upcoming', '0'], ['false', 'inbound', 'Incoming', '2'], ['false', 'outbound', 'Outgoing', '1'], ['false', 'unknown', 'Not in contacts', '1']]);
    assert.equal(count(els['fonio-log-body'].innerHTML, '<tr data-call='), 3);
    F.setFonioLogFilter('unknown');
    assert.equal(count(F.__page().els['fonio-log-body'].innerHTML, '<tr data-call='), 1);
    F.setFonioLogFilter('<x>');
    assert.equal(F.__state().fonioLogFilter, 'all');
  });
  test('calls still to come (Part 24): counted under Upcoming and not under Outgoing; the row says Planned and that it waits for its time; owners and admins can cancel it', () => {
    const planned = { key: 'call:15', id: 15, by_crm: true, direction: 'outbound', at: '2026-11-12T05:00:00.000Z', number: '+491734444444', caller_name: null, contact_id: 40, contact_name: 'Erika Muster',
      deal_id: 60, deal_title: 'Wohnung 3', duration: null, summary: null, link: null, result: false, noted: false, planned: true };
    assert.deepEqual(['all', 'planned', 'inbound', 'outbound', 'unknown'].map(f => F.fonioLogMatches(planned, f)), [true, true, false, false, false]);
    assert.deepEqual(['planned', 'outbound'].map(f => F.fonioLogMatches(sent, f)), [false, true]);
    const row = F.fonioLogRowHtml(planned);
    assert.match(row, /<span class="badge badge-warning">Planned<\/span>/); assert.doesNotMatch(row, />Outgoing</);
    assert.match(row, /<span class="muted">waiting for its time<\/span>/); assert.doesNotMatch(row, /fonioLogCancel/, 'a member gets no cancel button');
    assert.doesNotMatch(row, /Calendly/);
    F.__set('fonioLogManage', true);
    assert.match(F.fonioLogRowHtml(planned), /<button type="button" class="btn btn-secondary btn-sm" onclick="fonioLogCancel\(15, this\)">Cancel call<\/button>/);
    F.__set('fonioLogManage', false);
    const c = sliceFn(js, 'fonioLogCancel', 'fonio-log.js');
    assert.match(c, /api\.post\(`\/api\/integrations\/fonio\/calls\/\$\{Number\(id\)\}\/cancel`, \{\}\)/); assert.match(c, /await loadFonioLog\(\);/);
    for (const k of ['fcl_filter_planned', 'fcl_planned', 'fcl_planned_waiting']) { assert.equal(typeof dict.en[k], 'string'); assert.equal(typeof dict.de[k], 'string'); }
  });
  test('a filter with no match says so, differently from an empty log', () => {
    fill([sent]);
    F.setFonioLogFilter('unknown');
    assert.match(F.__page().els['fonio-log-body'].innerHTML, /No calls match this filter/);
  });
});

describe('a row', () => {
  test('a call the CRM sent: outgoing, started by the CRM, contact and deal as links, the note, fonio’s link, no buttons', () => {
    const r = F.fonioLogRowHtml(sent);
    assert.match(r, /<tr data-call="call:12">/);
    assert.match(r, /<span class="badge ">Outgoing<\/span><div class="muted fcl-sub">Started by the CRM<\/div>/);
    assert.match(r, /onclick="event\.preventDefault\(\);openContactDetail\(40\)">Erika Muster<\/a>/);
    assert.match(r, /onclick="event\.preventDefault\(\);openDealDetail\(60\)">Wohnung 3<\/a>/);
    assert.match(r, /<span class="muted">Written as a note<\/span>/);
    assert.match(r, /<a href="https:\/\/app\.fonio\.ai\/c\/12" target="_blank" rel="noopener">Open in fonio<\/a>/);
    assert.doesNotMatch(r, /<button/);
  });
  test('a call the CRM sent: no result yet, or a result without a note', () => {
    assert.match(F.fonioLogRowHtml({ ...sent, result: false, noted: false }), /No result from fonio yet/);
    assert.match(F.fonioLogRowHtml({ ...sent, result: true, noted: false }), /Result received, no note/);
  });
  test('an incoming call from a contact: its summary and duration, no deal, no buttons', () => {
    const r = F.fonioLogRowHtml(known);
    assert.match(r, /<span class="badge badge-info">Incoming<\/span>/);
    assert.doesNotMatch(r, /Started by the CRM/);
    assert.match(r, /<div class="fcl-summary">Fragt nach dem Exposé\.<\/div><div class="muted fcl-sub">Duration 1:05<\/div>/);
    assert.match(r, /<td><span class="muted-dash">—<\/span><\/td>/);
    assert.doesNotMatch(r, /<button/);
  });
  test('an unknown caller: the number and the name fonio gave, marked, with both buttons', () => {
    const r = F.fonioLogRowHtml(unknown);
    assert.match(r, /<td>\+491519999999<div class="muted fcl-sub">Max Neu<\/div><\/td>/);
    assert.match(r, /<span class="badge badge-warning">Not in contacts<\/span>/);
    assert.match(r, /onclick="fonioLogAddContact\(900\)">Add contact<\/button>/);
    assert.match(r, /onclick="fonioLogPickContact\(900\)">Connect to a contact<\/button>/);
    assert.match(r, /<span class="muted">No summary<\/span>/);
  });
  test('a hidden number says so; a call the CRM sent whose contact is gone shows a dash and no buttons', () => {
    assert.match(F.fonioLogRowHtml({ ...unknown, number: null, caller_name: null }), /<span class="muted">Hidden number<\/span>/);
    const gone = F.fonioLogRowHtml({ ...sent, contact_id: null, contact_name: null, deal_id: null, deal_title: null });
    assert.doesNotMatch(gone, /Not in contacts|<button/);
  });
  test('what fonio or a caller wrote cannot inject markup; only an https link becomes a link', () => {
    const r = F.fonioLogRowHtml({ ...unknown, key: '"><b>', number: '<img src=x onerror=1>', caller_name: '<script>x</script>', summary: '<svg onload=1>', duration: '"><i>', link: 'javascript:alert(1)' });
    for (const raw of ['<img', '<script>', '<svg', '<i>', '<b>', 'javascript:']) assert.ok(!r.includes(raw), raw);
    assert.doesNotMatch(F.fonioLogRowHtml({ ...sent, link: 'http://app.fonio.ai/x' }), /<a href="http:/);
    assert.match(F.fonioLogRowHtml({ ...sent, contact_name: '<b>x</b>', deal_title: '"><u>' }), /&lt;b&gt;x&lt;\/b&gt;/);
  });
  test('German: the row speaks German', () => {
    F.__set('currentLang', 'de');
    try { assert.match(F.fonioLogRowHtml(unknown), /Eingehend[\s\S]*Nicht in Kontakten[\s\S]*Kontakt anlegen[\s\S]*Mit Kontakt verbinden/); }
    finally { F.__set('currentLang', 'en'); }
  });
});

describe('Add contact', () => {
  test('the contact dialog opens for a client, filled with the name and number; the call is pending', async () => {
    fill();
    await F.fonioLogAddContact(900);
    const { log, els } = F.__page();
    assert.deepEqual(log, [['openContactModal', 'contact']]);
    assert.deepEqual({ name: els['cf-name'].value, phone: els['cf-phone'].value }, { name: 'Max Neu', phone: '+491519999999' });
    assert.equal(F.__state().fonioLogPending, 900);
  });
  test('only an unknown caller of this list: a known contact, a CRM call and an unknown id open nothing', async () => {
    fill();
    for (const id of [901, 12, 4711]) await F.fonioLogAddContact(id);
    assert.deepEqual(F.__page().log, []);
    assert.equal(F.__state().fonioLogPending, null);
  });
  test('the saved contact takes the call: one request, a toast, the list read again, and nothing pending', async () => {
    fill(ENTRIES, { [LOG]: { entries: [] } });
    await F.fonioLogAddContact(900);
    F.__page().log.length = 0;
    assert.equal(await F.fonioLogContactSaved(77), true);
    assert.deepEqual(F.__page().log, [['post', `${LOG}/900/contact`, { contact_id: 77 }], ['toast', 'The call is now on the contact, with its note.'], ['get', LOG]]);
    assert.equal(F.__state().fonioLogPending, null);
    assert.equal(await F.fonioLogContactSaved(78), false, 'the next new contact has nothing to do with a call');
    assert.equal(F.__page().log.length, 3);
  });
  test('opening the contact dialog anywhere else forgets the call', async () => {
    fill();
    await F.fonioLogAddContact(900);
    F.fonioLogForget();   // what openContactModal does first, wherever it is opened from
    F.__page().log.length = 0;
    assert.equal(await F.fonioLogContactSaved(77), false);
    assert.deepEqual(F.__page().log, []);
  });
  test('a save that returned no id connects nothing', async () => {
    fill();
    await F.fonioLogAddContact(900);
    F.__page().log.length = 0;
    assert.equal(await F.fonioLogContactSaved(undefined), false);
    assert.deepEqual(F.__page().log, []);
    assert.equal(F.__state().fonioLogPending, null);
  });
  test('a refusal is said: already connected, or failed', async () => {
    fill(ENTRIES, { [`${LOG}/900/contact`]: { error: 'This call already has a contact', code: 'connected' }, [LOG]: { entries: ENTRIES } });
    assert.equal(await F.fonioLogConnect(900, 40), false);
    assert.deepEqual(F.__page().log[1], ['toast', 'This call already has a contact.']);
    fill(ENTRIES, { [`${LOG}/900/contact`]: { error: 'Contact not found', code: 'no_contact' }, [LOG]: { entries: ENTRIES } });
    await F.fonioLogConnect(900, 40);
    assert.deepEqual(F.__page().log[1], ['toast', 'The call could not be connected to the contact.']);
  });
});

describe('Connect to a contact', () => {
  const PEOPLE = [{ id: 1, name: 'Erika Muster', company: 'Muster GmbH', email: 'erika@muster.example', phone: '0151 1000001' }, { id: 2, name: 'Olaf Beispiel', company: null, email: null, phone: '+49 30 123456' }];
  test('the picker opens with the clients, an empty search, and the call remembered', async () => {
    fill(ENTRIES, { '/api/contacts?contact_type=contact': PEOPLE });
    F.__page().els; await F.fonioLogPickContact(900);
    const { log, els } = F.__page();
    assert.deepEqual(log, [['get', '/api/contacts?contact_type=contact']]);
    assert.equal(els['fcl-pick-modal'].hidden, false);
    assert.equal(els['fcl-pick-search'].focused, 1);
    assert.equal(count(els['fcl-pick-list'].innerHTML, 'class="fcl-pick-row"'), 2);
    assert.match(els['fcl-pick-list'].innerHTML, /onclick="fonioLogPicked\(1\)">\s*<b>Erika Muster<\/b><span class="muted">Muster GmbH, 0151 1000001<\/span>/);
    assert.equal(F.__state().fonioLogPicking, 900);
  });
  test('the search finds by name, company, email, and by the digits of a phone number', () => {
    const ids = q => F.fonioLogPickMatches(PEOPLE, q).map(c => c.id);
    assert.deepEqual(ids(''), [1, 2]);
    assert.deepEqual(ids('  ERIKA '), [1]);
    assert.deepEqual(ids('gmbh'), [1]);
    assert.deepEqual(ids('muster.example'), [1]);
    assert.deepEqual(ids('030 1234'), [], 'the saved number has no 0 after +49');
    assert.deepEqual(ids('30 1234'), [2]);
    assert.deepEqual(ids('151 100'), [1]);
    assert.deepEqual(ids('zzz'), []);
    assert.deepEqual(ids('e 1'), [], 'one digit is not a phone search');
  });
  test('no match says so; a long list shows the first 30 and says that', async () => {
    fill(ENTRIES, { '/api/contacts?contact_type=contact': Array.from({ length: 31 }, (_, i) => ({ id: i + 1, name: `K${i}` })) });
    await F.fonioLogPickContact(900);
    const list = F.__page().els['fcl-pick-list'];
    assert.equal(count(list.innerHTML, 'class="fcl-pick-row"'), 30);
    assert.match(list.innerHTML, /Showing the first 30\. Type to narrow it down\./);
    F.__page().els['fcl-pick-search'].value = 'nobody';
    F.renderFonioLogPick();
    assert.match(list.innerHTML, /No contact matches\./);
  });
  test('picking closes the dialog and connects once', async () => {
    fill(ENTRIES, { '/api/contacts?contact_type=contact': PEOPLE, [LOG]: { entries: [] } });
    await F.fonioLogPickContact(900);
    F.__page().log.length = 0;
    await F.fonioLogPicked(2);
    await F.fonioLogPicked(2);
    assert.deepEqual(F.__page().log.filter(l => l[0] !== 'toast' && l[0] !== 'get'), [['close', 'fcl-pick-modal'], ['post', `${LOG}/900/contact`, { contact_id: 2 }], ['close', 'fcl-pick-modal']]);
  });
  test('a contact’s name cannot inject markup into the picker', async () => {
    fill(ENTRIES, { '/api/contacts?contact_type=contact': [{ id: 1, name: '<img src=x>', company: '<b>', phone: '"><i>' }] });
    await F.fonioLogPickContact(900);
    const out = F.__page().els['fcl-pick-list'].innerHTML;
    for (const raw of ['<img', '<i>']) assert.ok(!out.includes(raw), raw);
    assert.ok(out.includes('&lt;b&gt;'), 'the company is text, not a tag');
  });
  test('a contacts answer that is not a list opens an empty picker', async () => {
    fill(ENTRIES, { '/api/contacts?contact_type=contact': { error: 'x' } });
    await F.fonioLogPickContact(900);
    assert.match(F.__page().els['fcl-pick-list'].innerHTML, /No contact matches\./);
  });
});

// Part 18: the three dots at the end of a row and the dialog behind them.
describe('technical details', () => {
  const start = html.indexOf('<div id="fcl-tech-modal" class="modal-overlay hidden">');
  const modal = html.slice(start, html.indexOf('<div id="object-field-modal"', start));
  const PARTS = ['request', 'response', 'result_body', 'record'];
  test('the list says who may open them; a member gets no dots, an owner gets them on every row, last in the row', async () => {
    F.__reset({ [LOG]: { entries: ENTRIES, can_manage: false } });
    await F.loadFonioLog();
    assert.doesNotMatch(F.__page().els['fonio-log-body'].innerHTML, /fcl-more-btn/);
    assert.equal(count(F.__page().els['fonio-log-body'].innerHTML, '<td class="fcl-more"></td>'), 3, 'the column stays, empty');
    F.__reset({ [LOG]: { entries: ENTRIES, can_manage: true } });
    await F.loadFonioLog();
    const body = F.__page().els['fonio-log-body'].innerHTML;
    assert.equal(count(body, 'class="iconbtn fcl-more-btn"'), 3);
    assert.match(body, /<td class="fcl-actions">[\s\S]*?<\/td>\s*<td class="fcl-more"><button type="button" class="iconbtn fcl-more-btn" title="Technical details" aria-label="Technical details" onclick="openFonioLogTech\('other', 901\)"><svg class="ic " aria-hidden="true"><use href="#i-ellipsis"\/><\/svg><\/button><\/td>\s*<\/tr>/);
    assert.match(body, /openFonioLogTech\('call', 12\)/);
    F.__reset({ [LOG]: { error: 'x', can_manage: true } });
    await F.loadFonioLog();
    assert.equal(F.fonioLogRowHtml(sent).includes('fcl-more-btn'), false, 'a failed load grants nothing');
  });
  test('the dots show on hover and on keyboard focus, and always where there is no hover', () => {
    assert.match(css, /\.fcl-more-btn \{[^}]*opacity: 0;/);
    assert.match(css, /#page-calls \.table tr:hover \.fcl-more-btn, #page-calls \.table tr:focus-within \.fcl-more-btn \{ opacity: 1; \}/);
    assert.match(css, /@media \(hover: none\) \{ \.fcl-more-btn \{ opacity: 1; \} \}/);
    assert.ok(html.includes('symbol id="i-ellipsis"'));
  });
  test('the dialog: four parts, each a translated heading, a copy button and a code block', () => {
    assert.ok(start > 0);
    for (const p of PARTS) {
      assert.match(modal, new RegExp(`<div class="fcl-tech-part" id="fcl-tech-${p}-wrap">\\s*<div class="fcl-tech-head"><h3 data-i18n="fcl_tech_[a-z]+"></h3><button type="button" class="btn btn-sm" id="fcl-tech-${p}-copy" onclick="copyIntgText\\(this, document\\.getElementById\\('fcl-tech-${p}'\\)\\.textContent\\)" data-i18n="btn_copy">Copy</button></div>\\s*<pre class="intg-code" id="fcl-tech-${p}"></pre>`), p);
    }
    assert.deepEqual(new Function(sliceConst('public/js/fonio-log.js', 'FONIO_LOG_TECH_PARTS').replace(/^[^[]*/, 'return '))(), PARTS);
    assert.match(modal, /data-i18n="fcl_tech_hint"/);
  });
  test('a CRM call: the request, the answer, the result Body and the record as indented JSON', async () => {
    const detail = { kind: 'call', record: { id: 12, status: 'sent' }, request: { url: 'u', body: { apiKey: '(hidden)', context: { vorname: 'Erika' } } }, response: { http: 200, body: { status: 'success' } }, result_body: { summary: 'S' } };
    F.__reset({ [`${LOG}/call/12`]: detail });
    await F.openFonioLogTech('call', 12);
    const { els, log } = F.__page();
    assert.deepEqual(log, [['get', `${LOG}/call/12`]]);
    for (const p of PARTS) {
      assert.equal(els[`fcl-tech-${p}`].textContent, JSON.stringify(detail[p], null, 2), p);
      assert.equal(els[`fcl-tech-${p}-wrap`].hidden, false, p);
      assert.equal(els[`fcl-tech-${p}-copy`].hidden, false, p);
    }
    assert.equal(els['fcl-tech-modal'].hidden, false);
  });
  test('a call from before: each empty part says nothing was kept, without a copy button', async () => {
    F.__reset({ [`${LOG}/call/13`]: { kind: 'call', record: { id: 13 }, request: null, response: null, result_body: null } });
    await F.openFonioLogTech('call', 13);
    const { els } = F.__page();
    for (const p of ['request', 'response', 'result_body']) {
      assert.match(els[`fcl-tech-${p}`].textContent, /^Nothing kept\./, p);
      assert.equal(els[`fcl-tech-${p}-copy`].hidden, true, p);
    }
    assert.equal(els['fcl-tech-record-copy'].hidden, false);
  });
  test('a call the CRM did not start has no request and no answer: those two parts are hidden', async () => {
    F.__reset({ [`${LOG}/other/900`]: { kind: 'other', record: { id: 900 }, request: null, response: null, result_body: { direction: 'inbound' } } });
    await F.openFonioLogTech('other', 900);
    const { els } = F.__page();
    assert.deepEqual(PARTS.map(p => els[`fcl-tech-${p}-wrap`].hidden), [true, true, false, false]);
  });
  test('a refusal or a failed load: a toast, the dialog stays closed', async () => {
    F.__reset({ [`${LOG}/call/12`]: { error: 'Owner or admin only' } });
    await F.openFonioLogTech('call', 12);
    assert.deepEqual(F.__page().log, [['get', `${LOG}/call/12`], ['toast', 'The technical details could not be loaded.']]);
    assert.equal(F.__page().els['fcl-tech-modal'], undefined);
  });
  test('only the two kinds and a number reach the address', async () => {
    F.__reset({});
    await F.openFonioLogTech('../x', '7/../../y');
    assert.deepEqual(F.__page().log[0], ['get', `${LOG}/other/NaN`]);
  });
  test('the values are written as text, never as markup', () => {
    assert.match(sliceFn(js, 'openFonioLogTech', 'fonio-log.js'), /pre\.textContent = /);
    assert.doesNotMatch(sliceFn(js, 'openFonioLogTech', 'fonio-log.js'), /innerHTML/);
  });
});
