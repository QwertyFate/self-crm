// CLIENT (static + sandboxed) tests for the full Activities port from
// reference/pro/crm-pro.html (screen: activities.js): the inline compose card,
// the Period chip, the feed grouped by day, the breakdown rail (by type, by
// person, most active deals), the kebab with Open deal / Open contact, the
// confirmed delete, and the reference's CSV columns.
//
// The reference's fifth type (meeting) is NOT ported: the activities table's
// CHECK constraint allows note/call/email/whatsapp and the table is not changed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const objects = read('public/js/objects.js');
const core = read('public/js/core.js');
const css = read('public/style.css');
const section = html.slice(html.indexOf('<section id="page-activities"'), html.indexOf('<!-- ── Calendar ── -->'));

const H = 36e5, D = 864e5;
// "now" is pinned (2026-10-08 10:00 local) both here and inside the sandbox, so the calendar-day
// buckets (today / yesterday) cannot flip when the suite runs just after midnight.
const NOW = new Date(2026, 9, 8, 10, 0, 0).getTime();
const iso = msAgo => new Date(NOW - msAgo).toISOString();

// A minimal DOM + the globals the page functions read, so the renderers can run as-is.
const STUBS = `
  const __NOW = new globalThis.Date(2026, 9, 8, 10, 0, 0).getTime();
  class Date extends globalThis.Date { constructor(...a) { if (a.length) super(...a); else super(__NOW); } static now() { return __NOW; } }
  let __pageActive = true; function __setPageActive(v) { __pageActive = v; }
  const __els = {}; const __el = id => (__els[id] = __els[id] || { id, innerHTML: '', textContent: '', value: '', focus() { __focused.push(id); }, contains() { return false; }, setAttribute() {}, removeAttribute() {}, scrollIntoView() {}, classList: { contains: () => __pageActive } });
  const __focused = [];
  const document = { getElementById: id => __el(id), activeElement: null, querySelector: () => null, body: { appendChild() {} }, createElement: () => ({ style: {}, click() {}, remove() {} }) };
  const URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  function Blob(parts) { this.text = parts.join(''); __blobs.push(this); } const __blobs = [];
  const t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/');
  function esc(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const icon = (n, c) => '<i ' + n + (c ? ' ' + c : '') + '>'; const avatar = (w, s) => '<av ' + (typeof w === 'string' ? w : w.name) + '>';
  const dvActHtml = s => s == null ? '' : String(s); const dvActText = s => s == null ? '' : String(s).replace(/<br>/g, '\\n');
  const fmtEURShort = v => v + '€'; let currentLang = 'en';
  let __defer = false; const __gets = []; function __deferGets(v) { __defer = v; } function __resolveGet(i, rows) { const g = __gets[i]; __gets[i] = null; g.res(rows); }
  const __calls = []; const api = { get: async u => { __calls.push(['get', u]); if (__defer) return new Promise(res => __gets.push({ u, res })); return []; }, post: async (u, b) => { __calls.push(['post', u, b]); return { id: 777 }; }, del: async u => { __calls.push(['del', u]); return { success: true }; } };
  const __toasts = []; let __confirm = true; const __menus = [];
  const ui = { toast: (m, o) => __toasts.push({ m, o }), confirm: async () => __confirm, menu: (a, items, o) => __menus.push(items), select: (a, opts, cur, cb) => __menus.push({ opts, cur, cb }) };
  const __opened = []; const openDealDetail = (id, opts) => __opened.push(['deal', id, opts]); const openContactDetail = (id, opts) => __opened.push(['contact', id, opts]);
  async function ensureMembers() {} async function ensureContacts() {}
  function __html(id) { return __el(id).innerHTML; } function __state() { return { calls: __calls, toasts: __toasts, menus: __menus, opened: __opened, focused: __focused, blobs: __blobs, els: __els }; } function __setConfirm(v) { __confirm = v; } function __act() { return { activities, activityDeals }; }
`;
const FNS = ['loadActivities', 'visibleActivities', 'activitiesAnyFilter', 'renderActivities', 'renderActivitiesToolbar', 'activitiesChip', 'openActivitiesChip', 'onActivitiesSearch', 'clearActivitiesFilters',
  'renderActivityCompose', 'setActivityComposeType', 'activityComposeClearError', 'onActivityComposeInput', 'onActivityComposeDeal', 'onActivityComposeContact', 'onActivityComposeKey', 'focusActivityCompose', 'submitActivityCompose',
  'renderActivitiesFeed', 'renderActivitiesRail', 'toggleActivitiesStat', 'openActivityKebab', 'deleteActivity', 'exportActivitiesCsv',
  'actLocale', 'actStartOfDay', 'actDayDiff', 'actDayLabel', 'actAgo', 'actTime', 'actPlural', 'actContactOf', 'activityDetailOpts', 'openActivityDeal', 'openActivityContact', 'activityDealOptions'];
function sandbox() {
  const F = loadFns('public/js/objects.js', FNS, {
    state: { activities: [], activitiesUI: { q: '', type: null, by: null, deal: null, period: 'all' }, activityDeals: [], activityDealList: [], activityCompose: { type: 'note', text: '', deal: '', contact: '', err: '' }, members: [], contacts: [], activityContactList: [], currentWorkspace: null, activitiesSearchTimer: null, activitiesLoadSeq: 0 },
    extra: STUBS + sliceConst('public/js/objects.js', 'ACT_TYPES') + sliceConst('public/js/objects.js', 'ACT_PERIODS'),
    expose: ['__html', '__state', '__setConfirm', '__setPageActive', '__act', '__deferGets', '__resolveGet'],
  });
  return F;
}
const seed = () => [
  { id: 1, type: 'note',     content: 'Called about financing', contact_id: 10, contact_name: 'Anna Berg', deal_id: 5, deal_title: 'Haus Köln', created_by: 1, logged_by_name: 'Max',  created_at: iso(2 * H) },
  { id: 2, type: 'call',     content: 'Quick follow-up',        contact_id: 11, contact_name: 'Jonas Kahl', deal_id: 5, deal_title: 'Haus Köln', created_by: 2, logged_by_name: 'Lena', created_at: iso(30 * H) },
  { id: 3, type: 'email',    content: 'Sent the brochure',      contact_id: null, contact_name: null, deal_id: 6, deal_title: 'Büro Bonn', created_by: 1, logged_by_name: 'Max', created_at: iso(10 * D) },
  { id: 4, type: 'whatsapp', content: 'Pinged <b>again</b>',    contact_id: 10, contact_name: 'Anna Berg', deal_id: null, deal_title: null, created_by: 2, logged_by_name: 'Lena', created_at: iso(40 * D) },
];

describe('markup: the page is the reference layout', () => {
  test('objects.js parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/objects.js')]));
  test('header: a visible Export CSV button and Log activity that focuses the inline card (no more-menu, no modal)', () => {
    assert.match(section, /class="btn btn-secondary"[^>]*onclick="exportActivitiesCsv\(\)"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-download"\/><\/svg><span data-i18n="export_csv">/);
    assert.match(section, /class="btn btn-primary"[^>]*onclick="focusActivityCompose\(\)"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span data-i18n="log_activity">/);
    assert.doesNotMatch(section, /openActivitiesMoreMenu|openActivityModal/);
    assert.doesNotMatch(objects, /openActivitiesMoreMenu/);
  });
  test('toolbar, then a 2:1 split: compose + feed on the left, the breakdown rail on the right', () => {
    assert.match(section, /<div id="activities-toolbar" class="toolbar"><\/div>/);
    const split = section.indexOf('class="split split-2-1 ac-split"');
    assert.ok(split > section.indexOf('id="activities-toolbar"'));
    assert.match(section, /<div class="ac-left"><div id="activities-compose"><\/div><div id="activities-list" class="ac-feed"><\/div><\/div>/);
    assert.match(section, /<aside class="ac-rail" id="activities-rail"/);
  });
  test('every sprite reference inside the section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
  test('the Calendar keeps its modal: openActivityModal still exists and calendar.js still calls it', () => {
    assert.match(read('public/js/modals.js'), /async function openActivityModal\(/);
    assert.match(read('public/js/calendar.js'), /openActivityModal\(\{ date:/);
    assert.match(html, /id="activity-modal"/);
  });
});

describe('style.css: the split scrolls inside the clipped page; the old flat-feed rules are gone', () => {
  test('.ac-split is the scroll container (the .page is overflow:hidden) and is declared after .split', () => {
    assert.match(css, /^\.page \{[^}]*overflow: hidden/m, 'premise: the page clips');
    const rule = css.match(/\.ac-split \{([^}]*)\}/);
    assert.ok(rule, '.ac-split rule');
    assert.match(rule[1], /flex: 1/); assert.match(rule[1], /min-height: 0/); assert.match(rule[1], /overflow-y: auto/); assert.match(rule[1], /align-content: start/);
    assert.ok(css.indexOf('.ac-split {') > css.indexOf('.split-2-1 {'), 'cascade: .ac-split after .split-2-1');
  });
  test('reference row/rail/compose rules exist', () => {
    for (const sel of ['.ac-compose .card-body', '.ac-compose-row', '.ac-row', '.ac-head', '.ac-link', '.ac-time', '.ac-meta', '.ac-rail', '.ac-stat', '.ac-stat .bar', '.ac-deal-row', '.ac-ic', '.ac-day', '.ac-group + .ac-group']) {
      assert.ok(css.includes(sel + ' {'), sel);
    }
    assert.match(css, /\.ac-row:hover \.kebab, \.ac-row:focus-within \.kebab \{ opacity: ?1/);
    assert.match(css, /@media \(max-width: ?760px\) \{ \.ac-compose-row \{ grid-template-columns: ?minmax\(0, ?1fr\)/);
  });
  test('the pre-port flat feed CSS is removed, not left dead', () => {
    for (const sel of ['.activities-list {', '.activity-item {', '.act-icon {', '.act-icon.note', '.act-logged-by', '.act-logged-email', '.act-body {', '.act-content {']) assert.ok(!css.includes(sel), sel + ' should be gone');
  });
});

describe('types and periods', () => {
  test('ACT_TYPES is exactly the database CHECK set and the route allow-list; meeting is not ported', () => {
    const types = new Function(sliceConst('public/js/objects.js', 'ACT_TYPES') + ' return ACT_TYPES;')();
    const dbSet = read('db.js').match(/activities_type_check CHECK\(type IN \(([^)]*)\)\)/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
    assert.deepEqual(types, dbSet);
    assert.ok(!types.includes('meeting'));
    const route = read('routes/activities.js');
    assert.match(route, /\['note','call','email','whatsapp'\]\.includes\(type\)/);
    assert.doesNotMatch(route, /meeting/);
  });
  test('ACT_PERIODS mirrors the reference (all / today / 7d / 30d)', () => {
    assert.deepEqual(new Function(sliceConst('public/js/objects.js', 'ACT_PERIODS') + ' return ACT_PERIODS;')(), ['all', 'today', '7d', '30d']);
  });
  test('state carries the period; clearing resets it; anyFilter counts it', () => {
    assert.match(objects, /^let activitiesUI = \{ q: '', type: null, by: null, deal: null, period: 'all' \};/m);
    assert.match(sliceFn(objects, 'clearActivitiesFilters', 'objects.js'), /period: 'all'/);
    const F = sandbox();
    assert.equal(F.activitiesAnyFilter(), false);
    F.__set('activitiesUI', { q: '', type: null, by: null, deal: null, period: '7d' }); assert.equal(F.activitiesAnyFilter(), true);
    F.__set('activitiesUI', { q: '  ', type: null, by: null, deal: null, period: 'all' }); assert.equal(F.activitiesAnyFilter(), false, 'whitespace is not a search');
  });
});

describe('visibleActivities: period, skip, and the reference search haystack', () => {
  const F = sandbox();
  const ui = patch => F.__set('activitiesUI', { q: '', type: null, by: null, deal: null, period: 'all', ...patch });
  const ids = () => F.visibleActivities().map(a => a.id);
  test('period buckets by calendar day: today / last 7 days / last 30 days', () => {
    F.__set('activities', seed());
    ui({ period: 'today' }); assert.deepEqual(ids(), [1]);
    ui({ period: '7d' }); assert.deepEqual(ids(), [1, 2]);
    ui({ period: '30d' }); assert.deepEqual(ids(), [1, 2, 3]);
    ui({ period: 'all' }); assert.deepEqual(ids(), [1, 2, 3, 4]);
  });
  test('skip ignores one filter so the rail can count the other options', () => {
    F.__set('activities', seed());
    ui({ type: 'call' });
    assert.deepEqual(ids(), [2]);
    assert.deepEqual(F.visibleActivities('type').map(a => a.id), [1, 2, 3, 4]);
    ui({ by: 2 });
    assert.deepEqual(F.visibleActivities('by').map(a => a.id), [1, 2, 3, 4]);
    assert.deepEqual(ids(), [2, 4]);
  });
  test('search also matches the type label and the person who logged it', () => {
    F.__set('activities', seed());
    ui({ q: 'lena' }); assert.deepEqual(ids(), [2, 4]);
    ui({ q: 'act_email' }); assert.deepEqual(ids(), [3]);
    ui({ q: 'bonn' }); assert.deepEqual(ids(), [3]);
    ui({ q: 'again' }); assert.deepEqual(ids(), [4], 'visible text of a stored <b> note');
  });
});

describe('toolbar: a Period chip next to Type / Person / Deal', () => {
  test('renders four chips; the period chip is off at "all" and labelled when set', () => {
    const F = sandbox();
    F.renderActivitiesToolbar();
    let h = F.__html('activities-toolbar');
    for (const k of ['type', 'by', 'deal', 'period']) assert.ok(h.includes(`openActivitiesChip(this,'${k}')`), k);
    assert.doesNotMatch(h, /clearActivitiesFilters/);
    assert.match(h, /id="activities-chip-period"[^>]*>chip_period<i chevron-down ic-sm>/);
    F.__set('activitiesUI', { q: '', type: null, by: null, deal: null, period: '30d' });
    F.renderActivitiesToolbar(); h = F.__html('activities-toolbar');
    assert.match(h, /class="chip on"[^>]*id="activities-chip-period"[^>]*>chip_period: period_30d/);
    assert.match(h, /clearActivitiesFilters\(\)/);
  });
  test('the period menu lists the four periods (no extra "All" entry), the type menu lists all four types with icons', () => {
    const F = sandbox();
    F.openActivitiesChip({}, 'period');
    const m = F.__state().menus.pop();
    assert.deepEqual(m.opts.map(o => o.value), ['all', 'today', '7d', '30d']);
    assert.equal(m.cur, 'all');
    F.openActivitiesChip({}, 'type');
    const ty = F.__state().menus.pop();
    assert.deepEqual(ty.opts.map(o => o.value), [null, 'note', 'call', 'email', 'whatsapp']);
    assert.deepEqual(ty.opts.slice(1).map(o => o.icon), ['note', 'call', 'email', 'whatsapp']);
    ty.cb('call'); assert.equal(F.activitiesAnyFilter(), true);
  });
});

describe('the inline compose card', () => {
  test('renders the type segment (four types), the textarea, Deal and Contact pickers sorted by name, the verb button and the error slot', () => {
    const F = sandbox();
    F.__set('activityDealList', [{ id: 2, title: 'Zeta', contact_id: 11 }, { id: 1, title: 'Alpha <x>', contact_id: 10 }]);
    F.__set('activityContactList', [{ id: 11, name: 'Zoe', company: 'Z GmbH' }, { id: 10, name: 'Anna "A"', company: null }]);
    F.renderActivityCompose();
    const h = F.__html('activities-compose');
    assert.match(h, /<form class="card ac-compose" id="ac-form" novalidate[^>]*onsubmit="submitActivityCompose\(event\)"/);
    const seg = [...h.matchAll(/data-ctype="(\w+)" aria-pressed="(true|false)"/g)].map(m => [m[1], m[2]]);
    assert.deepEqual(seg, [['note', 'true'], ['call', 'false'], ['email', 'false'], ['whatsapp', 'false']]);
    assert.match(h, /<textarea class="textarea" id="ac-text" rows="2" placeholder="act_ph_note"/);
    assert.match(h, /<select class="select" id="ac-deal" onchange="onActivityComposeDeal\(this\)"><option value="">opt_no_deal<\/option><option value="1" >Alpha &lt;x&gt;<\/option><option value="2" >Zeta<\/option>/);
    assert.match(h, /<select class="select" id="ac-contact" onchange="onActivityComposeContact\(this\)"><option value="">opt_no_contact<\/option><option value="10" >Anna &quot;A&quot;<\/option><option value="11" >Zoe, Z GmbH<\/option>/);
    assert.match(h, /<button class="btn btn-primary" type="submit" id="ac-go">act_verb_note<\/button>/);
    assert.match(h, /<div class="error-text" id="ac-err" role="alert"><\/div>/);
  });
  test('switching the type changes placeholder + verb and clears a pending error; the draft text survives', () => {
    const F = sandbox();
    F.__set('activityCompose', { type: 'note', text: 'keep me', deal: '', contact: '', err: 'act_err_link' });
    F.setActivityComposeType('call');
    const h = F.__html('activities-compose');
    assert.match(h, /placeholder="act_ph_call"/); assert.match(h, /id="ac-go">act_verb_call</);
    assert.match(h, /data-ctype="call" aria-pressed="true"/);
    assert.match(h, />keep me<\/textarea>/);
    assert.match(h, /id="ac-err" role="alert"><\/div>/, 'error cleared');
  });
  test('choosing a deal fills the contact from the deal (the reference overwrites, it does not only fill an empty one)', () => {
    const F = sandbox();
    F.__set('activityDealList', [{ id: 1, title: 'Alpha', contact_id: 10 }, { id: 3, title: 'Orphan', contact_id: null }]);
    F.__set('activityCompose', { type: 'note', text: '', deal: '', contact: '99', err: '' });
    F.onActivityComposeDeal({ value: '1' });
    const h = F.__html.bind(F);
    assert.equal(F.__state().els['ac-contact'].value, '10');
    F.onActivityComposeDeal({ value: '3' });
    assert.equal(F.__state().els['ac-contact'].value, '10', 'a deal without a contact leaves the contact alone');
    F.onActivityComposeContact({ value: '' });
    F.renderActivityCompose(); assert.match(h('activities-compose'), /id="ac-contact"[^>]*><option value="">opt_no_contact<\/option>/);
  });
  test('validation: text first, then a deal or a contact; nothing is posted', async () => {
    const F = sandbox();
    F.__set('activityCompose', { type: 'note', text: '   ', deal: '', contact: '', err: '' });
    await F.submitActivityCompose();
    assert.match(F.__html('activities-compose'), /id="ac-err" role="alert">act_err_text</);
    assert.match(F.__html('activities-compose'), /id="ac-text"[^>]*aria-invalid="true"/);
    assert.deepEqual(F.__state().focused.slice(-1), ['ac-text']);
    F.__set('activityCompose', { type: 'call', text: 'Hello', deal: '', contact: '', err: '' });
    await F.submitActivityCompose();
    assert.match(F.__html('activities-compose'), /id="ac-err" role="alert">act_err_link</);
    assert.deepEqual(F.__state().focused.slice(-1), ['ac-deal']);
    assert.equal(F.__state().calls.filter(c => c[0] === 'post').length, 0);
  });
  test('a valid entry is posted in the stored shape, the feed reloads, the textarea refocuses, and Undo deletes the new row', async () => {
    const F = sandbox();
    F.__set('activityCompose', { type: 'email', text: ' A & B\nline 2 ', deal: '5', contact: '10', err: '' });
    await F.submitActivityCompose();
    const post = F.__state().calls.find(c => c[0] === 'post');
    assert.deepEqual(post, ['post', '/api/activities', { contact_id: '10', deal_id: '5', type: 'email', content: 'A &amp; B<br>line 2' }]);
    assert.ok(F.__state().calls.some(c => c[0] === 'get' && c[1] === '/api/activities'), 'reloaded');
    assert.ok(F.__state().focused.includes('ac-text'));
    const toast = F.__state().toasts.pop();
    assert.equal(toast.m, 'act_logged:act_email');
    assert.equal(toast.o.action.label, 'undo');
    await toast.o.action.onClick();
    assert.ok(F.__state().calls.some(c => c[0] === 'del' && c[1] === '/api/activities/777'));
  });
  test('Ctrl/Cmd+Enter submits from the textarea; a server error lands in the error slot', async () => {
    const F = sandbox();
    const src = sliceFn(objects, 'onActivityComposeKey', 'objects.js');
    assert.match(src, /e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)/); assert.match(src, /submitActivityCompose\(\)/);
    assert.match(sliceFn(objects, 'submitActivityCompose', 'objects.js'), /res\.error/);
    assert.match(sliceFn(objects, 'focusActivityCompose', 'objects.js'), /scrollIntoView/);
  });
});

describe('the feed: grouped by day, reference rows, two empty states', () => {
  test('groups by calendar day with a count per group, newest first', () => {
    const F = sandbox();
    F.__set('activities', seed());
    F.renderActivitiesFeed();
    const h = F.__html('activities-list');
    const labels = [...h.matchAll(/<h2 class="section-title">([^<]*)<\/h2><span class="muted">([^<]*)<\/span>/g)].map(m => [m[1], m[2]]);
    assert.equal(labels[0][0], 'today'); assert.equal(labels[0][1], 'one_activity');
    assert.equal(labels[1][0], 'yesterday');
    assert.equal(labels.length, 4);
    assert.match(labels[2][0], /\w+,? \d+ \w+/, 'older days: weekday, day month');
    assert.ok(h.indexOf('data-aid="1"') < h.indexOf('data-aid="2"'));
  });
  test('a row: type icon + label, deal and contact links, relative time, text, author meta, kebab', () => {
    const F = sandbox();
    F.__set('activities', [seed()[0]]);
    F.renderActivitiesFeed();
    const h = F.__html('activities-list');
    assert.match(h, /<div class="ac-row" data-aid="1"><span class="tl-ic note" title="act_note"><i note><\/span>/);
    assert.match(h, /<div class="ac-head"><b>act_note<\/b>/);
    assert.match(h, /<a href="#" class="ac-link" title="Haus Köln" onclick="event\.preventDefault\(\);openActivityDeal\(5\)"><i deals><span>Haus Köln<\/span><\/a>/);
    assert.match(h, /<a href="#" class="ac-link" title="" onclick="event\.preventDefault\(\);openActivityContact\(10\)"><i users><span>Anna Berg<\/span><\/a>/);
    assert.match(h, /<span class="ac-time" title="[^"]+">ago_h:2<\/span>/);
    assert.match(h, /<div class="tl-text ac-text">Called about financing<\/div>/);
    assert.match(h, /<div class="ac-meta"><av Max><span>Max<\/span><span class="ac-dot"><\/span><span>\d\d:\d\d<\/span><\/div>/);
    assert.match(h, /<button class="iconbtn kebab" type="button" onclick="openActivityKebab\(this,1\)"/);
  });
  test('a row without a deal or contact shows neither link', () => {
    const F = sandbox();
    F.__set('activities', [{ ...seed()[3], deal_id: null, contact_id: null, contact_name: null }]);
    F.renderActivitiesFeed();
    assert.doesNotMatch(F.__html('activities-list'), /openActivityDeal|openActivityContact/);
  });
  test('empty states: nothing logged vs nothing matching (with Clear filters)', () => {
    const F = sandbox();
    F.renderActivitiesFeed();
    let h = F.__html('activities-list');
    assert.match(h, /<div class="card"><div class="empty"><i activity><b>no_activities<\/b><div>no_activities_sub<\/div><\/div><\/div>/);
    F.__set('activities', seed()); F.__set('activitiesUI', { q: 'zzz', type: null, by: null, deal: null, period: 'all' });
    F.renderActivitiesFeed(); h = F.__html('activities-list');
    assert.match(h, /<i search><b>no_activities_match<\/b><div>no_activities_match_sub<\/div><div style="margin-top:14px"><button class="btn btn-secondary btn-sm" type="button" onclick="clearActivitiesFilters\(\)">clear_filters<\/button>/);
  });
  test('the feed renders the rail too (search changes both)', () => {
    assert.match(sliceFn(objects, 'renderActivitiesFeed', 'objects.js'), /renderActivitiesRail\(\)/);
  });
});

describe('the breakdown rail', () => {
  const rail = (F) => { F.renderActivitiesRail(); return F.__html('activities-rail'); };
  test('By type: one bar per type, counted with the type filter skipped, the active one pressed', () => {
    const F = sandbox();
    F.__set('activities', seed()); F.__set('activitiesUI', { q: '', type: 'call', by: null, deal: null, period: 'all' });
    const h = rail(F);
    const stats = [...h.matchAll(/<button class="ac-stat" type="button" data-stat-type="(\w+)" aria-pressed="(\w+)" onclick="toggleActivitiesStat\('type','\w+'\)"><span class="tl-ic \w+ ac-ic"><i \w+><\/span><span><span class="nm">act_\w+<\/span><span class="bar"><i style="width:(\d+)%"><\/i><\/span><\/span><span class="n">(\d+)<\/span><\/button>/g)].map(m => [m[1], m[2], m[3], m[4]]);
    assert.deepEqual(stats, [['note', 'false', '100', '1'], ['call', 'true', '100', '1'], ['email', 'false', '100', '1'], ['whatsapp', 'false', '100', '1']]);
    assert.match(h, /<h2 class="card-title">rail_by_type<\/h2><span class="muted">one_activity<\/span>/, 'the header counts what is visible');
  });
  test('By person: every member, counted with the person filter skipped', () => {
    const F = sandbox();
    F.__set('activities', seed()); F.__set('members', [{ id: 1, name: 'Max' }, { id: 2, name: 'Lena' }, { id: 3, name: 'Nobody' }]);
    F.__set('activitiesUI', { q: '', type: null, by: 1, deal: null, period: 'all' });
    const h = rail(F);
    const p = [...h.matchAll(/data-stat-by="(\d+)" aria-pressed="(\w+)" onclick="toggleActivitiesStat\('by',(\d+)\)"><av (\w+)>[\s\S]*?<span class="n">(\d+)<\/span>/g)].map(m => [m[1], m[2], m[4], m[5]]);
    assert.deepEqual(p, [['1', 'true', 'Max', '2'], ['2', 'false', 'Lena', '2'], ['3', 'false', 'Nobody', '0']]);
  });
  test('Most active deals: top four by count, with stage and value from the deals list, linking to the deal', () => {
    const F = sandbox();
    const acts = seed().concat([5, 6, 7].map(i => ({ ...seed()[2], id: 10 + i, deal_id: 7 + i, deal_title: 'D' + i })));
    F.__set('activities', acts);
    F.__set('activityDealList', [{ id: 5, title: 'Haus Köln', stage_name: 'Proposal', value: 485000 }, { id: 6, title: 'Büro Bonn', stage_name: 'New', value: null }]);
    const h = rail(F);
    const rows = [...h.matchAll(/<a class="ac-deal-row" href="#" onclick="event\.preventDefault\(\);openActivityDeal\((\d+)\)"><span class="grow"><span class="truncate" style="display:block;font-weight:600">([^<]*)<\/span>(?:<span class="muted">([^<]*)<\/span>)?<\/span><span class="n">(\d+)<\/span><\/a>/g)].map(m => [m[1], m[2], m[3], m[4]]);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], ['5', 'Haus Köln', 'Proposal, 485000€', '2']);
    assert.deepEqual(rows[1], ['6', 'Büro Bonn', 'New', '1']);
    assert.equal(rows[2][1], 'D5', 'a deal missing from the list falls back to the row title');
  });
  test('no deal activity in the view → the reference empty line', () => {
    const F = sandbox();
    F.__set('activities', [seed()[3]]);
    assert.match(rail(F), /<div class="ac-rail-empty">rail_no_deals<\/div>/);
  });
  test('clicking a stat toggles that filter and re-renders everything', () => {
    const F = sandbox();
    F.__set('activities', seed());
    F.toggleActivitiesStat('type', 'call'); assert.equal(F.activitiesAnyFilter(), true);
    F.toggleActivitiesStat('type', 'call'); assert.equal(F.activitiesAnyFilter(), false);
    F.toggleActivitiesStat('by', 2); assert.deepEqual(F.visibleActivities().map(a => a.id), [2, 4]);
    assert.match(sliceFn(objects, 'toggleActivitiesStat', 'objects.js'), /renderActivities\(\)/);
  });
});

describe('kebab, delete, export', () => {
  test('the kebab offers Open deal / Open contact only when the row has them, then Delete', () => {
    const F = sandbox();
    F.__set('activities', seed());
    F.openActivityKebab({}, 1);
    let items = F.__state().menus.pop();
    assert.deepEqual(items.map(i => i.label || (i.sep && 'sep')), ['open_deal', 'open_contact', 'sep', 'delete_activity']);
    items[0].onSelect(); items[1].onSelect();
    assert.deepEqual(F.__state().opened.map(o => o.slice(0, 2)), [['deal', 5], ['contact', 10]]);
    assert.equal(typeof F.__state().opened[0][2].onClose, 'function', 'opened with the reload-on-close option');
    assert.equal(items[3].danger, true);
    F.openActivityKebab({}, 4); items = F.__state().menus.pop();
    assert.deepEqual(items.map(i => i.label || (i.sep && 'sep')), ['open_contact', 'sep', 'delete_activity']);
    F.openActivityKebab({}, 3); items = F.__state().menus.pop();
    assert.deepEqual(items.map(i => i.label || (i.sep && 'sep')), ['open_deal', 'sep', 'delete_activity']);
  });
  test('delete asks first; cancelling deletes nothing; confirming calls the API and re-renders', async () => {
    const F = sandbox();
    F.__set('activities', seed());
    F.__setConfirm(false); await F.deleteActivity(1);
    assert.equal(F.__state().calls.filter(c => c[0] === 'del').length, 0);
    assert.equal(F.visibleActivities().length, 4);
    F.__setConfirm(true); await F.deleteActivity(1);
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'del'), [['del', '/api/activities/1']]);
    assert.equal(F.visibleActivities().length, 3);
    assert.equal(F.__state().toasts.pop().m, 'activity_deleted');
    assert.match(sliceFn(objects, 'deleteActivity', 'objects.js'), /ui\.confirm\(\{ title: t\('delete_activity_q'\), message: t\('delete_activity_msg'\)/);
    assert.doesNotMatch(sliceFn(objects, 'deleteActivity', 'objects.js'), /action:/, 'no re-create undo (the backend cannot restore the row)');
  });
  test('CSV: the reference columns Type, Person, Deal, Contact, Date (ISO), Text — of the visible rows, CRLF, BOM', () => {
    const F = sandbox();
    F.__set('activities', seed()); F.__set('activitiesUI', { q: '', type: null, by: null, deal: null, period: '7d' });
    F.exportActivitiesCsv();
    const text = F.__state().blobs.pop().text;
    assert.ok(text.startsWith('\ufeff"Type","Person","Deal","Contact","Date","Text"\r\n'));
    const lines = text.split('\r\n');
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^"act_note","Max","Haus Köln","Anna Berg","\d{4}-\d\d-\d\dT[\d:.]+Z","Called about financing"$/);
    assert.equal(F.__state().toasts.pop().m, 'export_activities_csv:2');
  });
});

describe('time helpers', () => {
  const F = sandbox();
  test('actAgo: just now / hours / yesterday / days', () => {
    assert.equal(F.actAgo(iso(10 * 60e3)), 'ago_now');
    assert.equal(F.actAgo(iso(5 * H)), 'ago_h:5');
    assert.equal(F.actAgo(iso(30 * H)), 'yesterday');
    assert.equal(F.actAgo(iso(72 * H)), 'ago_d:3');
  });
  test('actDayDiff / actDayLabel bucket by local calendar day', () => {
    const now = new Date(2026, 9, 8, 0, 30, 0);
    const lateYesterday = new Date(now.getTime() - 60 * 60e3);   // 2026-10-07 23:30, only an hour earlier
    assert.equal(F.actDayDiff({ created_at: lateYesterday.toISOString() }), 1);
    assert.equal(F.actDayLabel(0, now.toISOString()), 'today');
    assert.equal(F.actDayLabel(1, now.toISOString()), 'yesterday');
    assert.match(F.actDayLabel(9, iso(9 * D)), /\d/);
    assert.equal(F.actPlural(1), 'one_activity'); assert.equal(F.actPlural(3), 'n_activities:3');
  });
});

describe('Part 44: the Deal chip', () => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  test('a slower, older response never overwrites a newer one', async () => {
    const F = sandbox();
    F.__deferGets(true);
    F.__set('activitiesUI', { q: '', type: null, by: null, deal: 5, period: 'all' });
    const p1 = F.loadActivities(); await tick();
    F.__resolveGet(0, []); F.__resolveGet(1, []); await tick();            // deals + contacts of load 1 → it now asks for ?deal_id=5
    F.__set('activitiesUI', { q: '', type: null, by: null, deal: 7, period: 'all' });
    const p2 = F.loadActivities(); await tick();
    F.__resolveGet(3, []); F.__resolveGet(4, []); await tick();            // deals + contacts of load 2 → ?deal_id=7
    assert.equal(F.__state().calls.filter(c => c[0] === 'get' && /activities/.test(c[1])).length, 2);
    F.__resolveGet(5, [{ id: 'B', created_at: iso(H), type: 'note' }]); await tick();
    F.__resolveGet(2, [{ id: 'A', created_at: iso(H), type: 'note' }]); await tick();
    await p1; await p2;
    assert.deepEqual(F.__act().activities.map(a => a.id), ['B'], 'the request that was sent last wins, whatever order the answers arrive in');
  });
  test('deleting the last note bound to a deal drops that deal from the chip\'s options', async () => {
    const F = sandbox();
    F.__set('activities', [{ id: 1, type: 'note', content: 'x', bound_deal_id: 5, deal_id: 5, deal_title: 'Haus Köln', created_at: iso(H) }, { id: 2, type: 'note', content: 'y', bound_deal_id: null, deal_id: null, created_at: iso(H) }]);
    F.__set('activityDeals', F.activityDealOptions());
    assert.deepEqual(F.__act().activityDeals, [{ id: 5, title: 'Haus Köln' }]);
    await F.deleteActivity(1);
    assert.deepEqual(F.__act().activityDeals, []);
  });
});

describe('logout clears the Activities page state (Part 43)', () => {
  test('resetActivitiesUI empties the filters, the compose draft and the cached lists, and resetClientState calls it', () => {
    const F = loadFns('public/js/objects.js', ['resetActivitiesUI'], { state: { activitiesUI: { q: 'x', type: 'call', by: 2, deal: 5, period: '7d' }, activityDeals: [{ id: 1 }], activityDealList: [{ id: 1 }], activityContactList: [{ id: 1 }], activityCompose: { type: 'call', text: 'secret draft', deal: '5', contact: '1', err: 'e' } }, extra: 'function __snap() { return { activitiesUI, activityDeals, activityDealList, activityContactList, activityCompose }; }', expose: ['__snap'] });
    F.resetActivitiesUI();
    assert.deepEqual(F.__snap(), { activitiesUI: { q: '', type: null, by: null, deal: null, period: 'all' }, activityDeals: [], activityDealList: [], activityContactList: [], activityCompose: { type: 'note', text: '', deal: '', contact: '', err: '' } });
    assert.match(sliceFn(read('public/js/auth.js'), 'resetClientState', 'auth.js'), /resetActivitiesUI\(\)/);
  });
});

describe('core.js: every new string exists in both languages', () => {
  test('keys', () => {
    const en = core.slice(core.indexOf('  en: {'), core.indexOf('  de: {')), de = core.slice(core.indexOf('  de: {'), core.indexOf('function t(key)'));
    for (const k of ['chip_period', 'period_all', 'period_today', 'period_7d', 'period_30d', 'act_verb_note', 'act_verb_call', 'act_verb_email', 'act_verb_whatsapp', 'act_ph_note', 'act_ph_call', 'act_ph_email', 'act_ph_whatsapp',
      'act_err_text', 'act_err_link', 'act_err_save', 'act_logged', 'opt_no_deal', 'opt_no_contact', 'one_activity', 'n_activities', 'rail_by_type', 'rail_by_person', 'rail_top_deals', 'rail_no_deals',
      'no_activities_sub', 'no_activities_match_sub', 'delete_activity_q', 'delete_activity_msg', 'open_contact', 'open_supplier', 'yesterday', 'ago_now', 'ago_h', 'ago_d', 'act_compose_aria', 'rail_aria']) {
      assert.match(en, new RegExp(`(^|[ ,{])${k}:`, 'm'), `en ${k}`); assert.match(de, new RegExp(`(^|[ ,{])${k}:`, 'm'), `de ${k}`);
    }
  });
});

describe('Part 39: refresh after a pop-up, supplier label, company search', () => {
  test('rows, rail and kebab open details through the page wrappers, which reload the feed when the pop-up closes (only while the page is shown)', async () => {
    const F = sandbox();
    F.openActivityDeal(5); F.openActivityContact(10);
    const [deal, contact] = F.__state().opened;
    assert.deepEqual(deal.slice(0, 2), ['deal', 5]); assert.deepEqual(contact.slice(0, 2), ['contact', 10]);
    const before = F.__state().calls.length;
    await deal[2].onClose();
    assert.ok(F.__state().calls.some((c, i) => i >= before && c[0] === 'get' && c[1] === '/api/activities'), 'closing reloads the feed');
    F.__setPageActive(false);
    const mid = F.__state().calls.length;
    await contact[2].onClose();
    assert.equal(F.__state().calls.length, mid, 'nothing reloads when the page is no longer shown');
    assert.doesNotMatch(sliceFn(objects, 'renderActivitiesFeed', 'objects.js'), /openDealDetail\(|openContactDetail\(/);
    assert.doesNotMatch(sliceFn(objects, 'renderActivitiesRail', 'objects.js'), /openDealDetail\(/);
    assert.doesNotMatch(sliceFn(objects, 'openActivityKebab', 'objects.js'), /openDealDetail\(|openContactDetail\(/);
  });
  test('detail-views: the deal detail takes options and fires onClose; the contact pop window does too', () => {
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /^async function openDealDetail\(id, opts = \{\}\) \{/m);
    assert.match(sliceFn(dv, 'openDealDetail', 'detail-views.js'), /onClose: \(\) => \{ if \(dvDeal === inst\) dvDeal = null; opts\.onClose && opts\.onClose\(\); \}/);
    assert.match(sliceFn(dv, 'openContactDetail', 'detail-views.js'), /modal = ui\.modal\(\{ title: sup \? dvSupplierWord\(\) : 'Contact', size: 'xl', body: '<div><\/div>', onClose: opts\.onClose \}\)/);
  });
  test('loadActivities fetches the full contact list for this page (both types), and the compose picker reads it', () => {
    const la = sliceFn(objects, 'loadActivities', 'objects.js');
    assert.match(la, /api\.get\('\/api\/contacts'\)/);
    assert.match(la, /activityContactList = /);
    assert.doesNotMatch(la, /ensureContacts\(\)/, 'the shared global may hold only the last-visited type');
    const rc = sliceFn(objects, 'renderActivityCompose', 'objects.js');
    assert.match(rc, /\[\.\.\.activityContactList\]/); assert.doesNotMatch(rc, /\[\.\.\.contacts\]/);
    assert.match(objects, /^let activityContactList = \[\];/m);
  });
  test('the kebab says "Open <supplier word>" for a supplier contact — lowercased in English, as typed in German', () => {
    const F = sandbox();
    F.__set('activities', seed());
    F.__set('activityContactList', [{ id: 10, name: 'Anna Berg', contact_type: 'supplier', company: 'Berg Bau' }, { id: 11, name: 'Jonas Kahl', contact_type: 'contact', company: 'Kahl AG' }]);
    F.__set('currentWorkspace', { supplier_name: 'Partners' });
    F.openActivityKebab({}, 1);
    assert.equal(F.__state().menus.pop()[1].label, 'open_supplier:partner');
    F.openActivityKebab({}, 2);
    assert.equal(F.__state().menus.pop()[1].label, 'open_contact');
    F.__set('currentWorkspace', null);
    F.openActivityKebab({}, 1);
    assert.equal(F.__state().menus.pop()[1].label, 'open_supplier:supplier', 'default word when the workspace has no supplier name');
    assert.match(sliceFn(objects, 'openActivityKebab', 'objects.js'), /currentLang === 'de' \? word : word\.toLowerCase\(\)/);
  });
  test('the contact link carries the company as its title (reference row)', () => {
    const F = sandbox();
    F.__set('activities', [seed()[0]]);
    F.__set('activityContactList', [{ id: 10, name: 'Anna Berg', contact_type: 'contact', company: 'Berg & Co' }]);
    F.renderActivitiesFeed();
    assert.match(F.__html('activities-list'), /class="ac-link" title="Berg &amp; Co" onclick="event\.preventDefault\(\);openActivityContact\(10\)"/);
  });
  test('search matches the contact company', () => {
    const F = sandbox();
    F.__set('activities', seed());
    F.__set('activityContactList', [{ id: 10, name: 'Anna Berg', company: 'Berg Bau' }, { id: 11, name: 'Jonas Kahl', company: 'Kahl AG' }]);
    F.__set('activitiesUI', { q: 'kahl ag', type: null, by: null, deal: null, period: 'all' });
    assert.deepEqual(F.visibleActivities().map(a => a.id), [2]);
    F.__set('activitiesUI', { q: 'berg bau', type: null, by: null, deal: null, period: 'all' });
    assert.deepEqual(F.visibleActivities().map(a => a.id), [1, 4]);
  });
});
