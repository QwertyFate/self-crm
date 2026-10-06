// CLIENT (static + sandboxed) tests for the Activities page, ported from
// reference/pro/src/screens/activities.js within the data the backend
// supports: a flat feed (not the reference's two-column stats rail), search
// + Type + Person chips (the reference's Period chip has no equivalent
// here and is deferred), a kebab menu, CSV export, a subtitle count.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const objects = read('public/js/objects.js');
const core = read('public/js/core.js');
const section = html.slice(html.indexOf('<section id="page-activities"'), html.indexOf('<!-- ── Calendar ── -->'));
const count = (src, needle) => src.split(needle).length - 1;

describe('markup: header, more menu, toolbar container', () => {
  test('files parse', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/objects.js')]));
  test('sub line, more menu, sprite plus on Log Activity', () => {
    assert.match(section, /<p class="page-sub" id="activities-page-sub">/);
    assert.match(section, /onclick="openActivitiesMoreMenu\(this\)"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-ellipsis"\/><\/svg>/);
    assert.match(section, /onclick="openActivityModal\(\)"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span data-i18n="log_activity">/);
  });
  test('toolbar container exists', () => {
    assert.match(section, /<div id="activities-toolbar" class="toolbar"><\/div>/);
  });
  test('every sprite reference inside the section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});

describe('objects.js: renderers follow the reference idiom', () => {
  test('the feed uses sprite type icons and a kebab menu, not emoji or a bare delete button', () => {
    const r = sliceFn(objects, 'renderActivitiesFeed', 'objects.js');
    assert.match(r, /class="act-icon \$\{a\.type\}">\$\{icon\(a\.type\)\}/);
    assert.match(r, /openActivityKebab\(this,\$\{a\.id\}\)/);
    assert.doesNotMatch(r, /ICONS\[a\.type\]|btn-danger btn-icon.*✕|>✕</);
  });
  test('the kebab menu and delete use the ui primitives', () => {
    assert.match(sliceFn(objects, 'openActivityKebab', 'objects.js'), /ui\.menu\(/);
    const del = sliceFn(objects, 'deleteActivity', 'objects.js');
    assert.match(del, /ui\.toast\(/);
  });
  test('the toolbar renders a search input and type/person chips, and preserves focus', () => {
    const r = sliceFn(objects, 'renderActivitiesToolbar', 'objects.js');
    assert.match(r, /class="input-group"/); assert.match(r, /id="activities-q"/);
    assert.match(r, /activitiesChip\('type'/); assert.match(r, /activitiesChip\('by'/);
    assert.match(r, /document\.activeElement/, 'keeps focus across re-renders like the Deals toolbar');
  });
  test('the more menu calls the CSV export', () => {
    assert.match(sliceFn(objects, 'openActivitiesMoreMenu', 'objects.js'), /exportActivitiesCsv\(\)/);
  });
  test('loadActivities fetches members too (for the Person chip) and renders through renderActivities', () => {
    const l = sliceFn(objects, 'loadActivities', 'objects.js');
    assert.match(l, /ensureMembers\(\)/); assert.match(l, /renderActivities\(\)/);
  });
});

describe('objects.js: filtering logic in a sandbox', () => {
  // visibleActivities searches the VISIBLE text of a note (dvActText — tags stripped, entities
  // decoded) rather than the stored <br>/entities, so the real helper is sliced in; the seed
  // notes are plain strings and pass through it unchanged.
  const extra = `const esc = s => String(s ?? ''); ${sliceFn(read('public/js/detail-views.js'), 'dvActText', 'detail-views.js')}`;
  const F = loadFns('public/js/objects.js', ['visibleActivities'], {
    state: { activities: [], activitiesUI: { q: '', type: null, by: null } },
    extra,
  });
  const seed = [
    { id: 1, type: 'note', content: 'Called about financing', contact_name: 'Anna Berg', created_by: 1 },
    { id: 2, type: 'call', content: 'Quick follow-up', contact_name: 'Jonas Kahl', created_by: 2 },
    { id: 3, type: 'email', content: 'Sent the brochure', contact_name: null, created_by: 1 },
  ];
  test('filters by type, by person, and by a search term over content/contact', () => {
    F.__set('activities', seed);
    const ui = patch => F.__set('activitiesUI', { q: '', type: null, by: null, ...patch });
    ui({}); assert.deepEqual(F.visibleActivities().map(a => a.id), [1, 2, 3]);
    ui({ type: 'call' }); assert.deepEqual(F.visibleActivities().map(a => a.id), [2]);
    ui({ by: 1 }); assert.deepEqual(F.visibleActivities().map(a => a.id), [1, 3]);
    ui({ q: 'berg' }); assert.deepEqual(F.visibleActivities().map(a => a.id), [1]);
    ui({ q: 'brochure' }); assert.deepEqual(F.visibleActivities().map(a => a.id), [3]);
  });
});

describe('core.js: activity-type sprite aliases and translation strings', () => {
  test('ICON_ALIAS maps the activity types used by icon(a.type)', () => {
    assert.match(core, /call: 'phone', email: 'mail', whatsapp: 'message-circle'/);
  });
  test('every new string exists in both languages', () => {
    const en = core.slice(core.indexOf('  en: {'), core.indexOf('  de: {')), de = core.slice(core.indexOf('  de: {'), core.indexOf('function t(key)'));
    for (const k of ['search_activities', 'chip_type', 'chip_person', 'activities_logged', 'no_activities_match', 'delete_activity', 'activity_deleted', 'export_activities_csv']) {
      assert.match(en, new RegExp(`(^|[ ,{])${k}:`, 'm'), `en ${k}`); assert.match(de, new RegExp(`(^|[ ,{])${k}:`, 'm'), `de ${k}`);
    }
  });
});
