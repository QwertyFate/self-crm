// CLIENT (static + pure-function) tests for the Activities rework: a
// workspace log grouped by day, a search and type filter, rich-text notes,
// the contact reachable from each row, edit and delete (with a confirmation),
// every string via t(), and the page code in its own module.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css = read('public/style.css');
const src = read('public/js/activities.js');
const objects = read('public/js/objects.js');
const core = read('public/js/core.js');
const chat = read('public/js/chat.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const start = html.indexOf('<section id="page-activities"');
const section = html.slice(start, html.indexOf('</section>', start));
const secCss = css.slice(css.indexOf('17 · ACTIVITIES'), css.indexOf('18 · FILTERS'));

describe('markup', () => {
  test('the page: shared header with a summary line, a toolbar with search and a type toggle, the list', () => {
    assert.match(section, /<div class="page-header">\s*<div>\s*<h1 data-i18n="page_activities">/);
    assert.match(section, /<p class="page-sub" id="activities-summary">/);
    assert.match(section, /<div class="page-actions">[\s\S]*onclick="openActivityModal\(\)"[\s\S]*data-i18n="log_activity"/);
    assert.match(section, /<div class="toolbar">/);
    assert.match(section, /<input type="search" id="activities-search" data-i18n-ph="activities_search_ph"[^>]*oninput="setActivityQuery\(this\.value\)"/);
    assert.match(section, /<div class="view-toggle" id="activities-type-toggle"/);
    for (const ty of ['all', 'note', 'call', 'email', 'whatsapp']) {
      assert.match(section, new RegExp(`<button type="button" class="view-toggle-btn[^"]*" data-type="${ty}" aria-pressed="(true|false)" onclick="setActivityType\\('${ty}'\\)" data-i18n="act_${ty}"`), ty);
    }
    assert.match(section, /<div id="activities-list" class="activities-page"/);
    assert.equal(section.includes('style="'), false);
    assert.match(html, /<div id="activity-modal"[\s\S]*?<h2 data-i18n="log_activity_title">/);
    assert.match(html, /<script src="js\/objects\.js"><\/script>\s*<script src="js\/activities\.js"><\/script>/);
  });
});

describe('activities.js', () => {
  test('the page code moved out of objects.js and the new surface exists', () => {
    assert.doesNotMatch(objects, /^async function loadActivities\(/m);
    assert.doesNotMatch(objects, /function deleteActivity\(/);
    assert.equal(core.includes('const ICONS ='), false, 'the emoji icon map is gone');
    for (const fn of ['loadActivities', 'renderActivities', 'activityItemHtml', 'groupActivitiesByDay', 'activityMatches', 'activityTime', 'setActivityType', 'setActivityQuery', 'deleteActivity', 'toggleActivityExpand']) {
      assert.match(src, new RegExp(`^(async )?function ${fn}\\(`, 'm'), fn);
    }
  });
  test('a row: tinted SVG icon, type and contact link, author and time, rich text with a fold, edit and delete', () => {
    const item = sliceFn(src, 'activityItemHtml', 'activities.js');
    for (const s of ['class="act-icon ${', 'UI_ICON.', 'WA_SVG', 'onclick="openActivityContact(', 'sanitizeNoteHtml(', '_countNoteLines(', 'collapsed', 'toggleActivityExpand(this)',
                     'editActivity(', 'deleteActivity(', 'class="act-actions"', 'activityTime(', "t('act_' + a.type)"]) assert.ok(item.includes(s), s);
    assert.equal(item.includes('esc(a.content)'), false, 'notes render as rich text, not escaped source');
    assert.equal(item.includes('ICONS['), false);
    assert.equal(item.includes('✕'), false);
    assert.match(sliceFn(src, 'deleteActivity', 'activities.js'), /confirm\(t\('confirm_delete_activity'\)\)/);
    assert.match(sliceFn(src, 'openActivityContact', 'activities.js'), /await switchPage\('contacts'\);\s*openDetail\(/, 'the contact panel lives on the Contacts page');
    assert.equal(src.includes('style="'), false);
    for (const s of ['No activities', 'Show more', 'logged_by_email']) assert.equal(src.includes(s), false, s);
  });
  test('the day label is shared with chat', () => {
    assert.match(core, /^function dayLabelFor\(/m);
    assert.match(sliceFn(chat, 'chatDayLabel', 'chat.js'), /dayLabelFor\(/);
    assert.match(sliceFn(src, 'groupActivitiesByDay', 'activities.js'), /dayLabelFor\(/);
  });
});

describe('pure helpers', () => {
  const extra = sliceFn(core, 'esc', 'core.js') + '\n' + sliceConst('public/js/core.js', 'TRANSLATIONS') + '\n' + sliceFn(core, 't', 'core.js') + '\n' + sliceFn(core, 'dayLabelFor', 'core.js');
  const F = loadFns('public/js/activities.js', ['activityMatches', 'groupActivitiesByDay', 'activityTime'], { state: { currentLang: 'en' }, extra });
  const acts = [
    { id: 1, type: 'call', content: 'Called about the <b>offer</b>', contact_name: 'Anna Weber', logged_by_name: 'Jonas', created_at: '2026-09-24T14:32:00' },
    { id: 2, type: 'note', content: 'Lunch', contact_name: null, logged_by_name: 'Lena', created_at: '2026-09-24T09:10:00' },
    { id: 3, type: 'email', content: 'Sent the deck', contact_name: 'Max Kraft', logged_by_name: 'Jonas', created_at: '2026-09-23T18:00:00' },
    { id: 4, type: 'whatsapp', content: 'ok', contact_name: 'Anna Weber', logged_by_name: 'Lena', created_at: '2026-09-01T08:00:00' },
  ];
  test('activityMatches: type and a case-insensitive query over content (tags stripped), contact and author', () => {
    assert.equal(F.activityMatches(acts[0], { type: 'all', q: '' }), true);
    assert.equal(F.activityMatches(acts[0], { type: 'note', q: '' }), false);
    assert.equal(F.activityMatches(acts[0], { type: 'call', q: 'OFFER' }), true);
    assert.equal(F.activityMatches(acts[0], { type: 'all', q: '<b>' }), false);
    assert.equal(F.activityMatches(acts[0], { type: 'all', q: 'anna' }), true);
    assert.equal(F.activityMatches(acts[0], { type: 'all', q: 'jonas' }), true);
    assert.equal(F.activityMatches(acts[1], { type: 'all', q: 'anna' }), false);
  });
  test('groupActivitiesByDay keeps order and labels days from the dictionary', () => {
    const now = new Date('2026-09-24T16:00:00');
    const groups = F.groupActivitiesByDay(acts, now);
    assert.deepEqual(groups.map(g => g.label), [dict.en.day_today, dict.en.day_yesterday, groups[2].label]);
    assert.match(groups[2].label, /September/);
    assert.deepEqual(groups.map(g => g.items.map(a => a.id)), [[1, 2], [3], [4]]);
    assert.deepEqual(F.groupActivitiesByDay([], now), []);
  });
  test('activityTime is HH:MM', () => {
    assert.match(F.activityTime('2026-09-24T14:32:00'), /^14:32$/);
  });
});

describe('copy and stylesheet', () => {
  test('every activities key exists in both dictionaries', () => {
    for (const k of ['day_today', 'day_yesterday', 'n_activities', 'activities_search_ph', 'act_all', 'act_note', 'act_call', 'act_email', 'act_whatsapp', 'no_activities_title',
                     'no_activities_match', 'act_edit', 'act_delete', 'log_activity', 'log_activity_title', 'show_more', 'show_less', 'confirm_delete_activity']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
    assert.equal(dict.en.log_activity.startsWith('+'), false, 'the button carries its own icon');
  });
  test('the log rules exist and the old ones are gone; tokens only', () => {
    for (const r of ['.activities-page {', '.act-day {', '.act-group {', '.activity-item {', '.act-icon {', '.act-icon.note {', '.act-icon.whatsapp {', '.act-head {', '.act-type {',
                     '.act-contact {', '.act-meta {', '.act-content {', '.act-content.collapsed {', '.act-actions {', '.act-empty {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\.act-day \{[^}]*position: sticky/);
    assert.match(css, /\.activity-item:hover \.act-actions, \.activity-item:focus-within \.act-actions \{ opacity: 1; \}/);
    for (const s of ['.activities-list', '.act-logged-by', '.act-logged-email', '.act-body']) assert.equal(css.includes(s), false, `${s} gone`);
    assert.doesNotMatch(secCss, /#[0-9a-f]{3,6}\b/i);
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    assert.match(coarse, /\.act-actions \{ opacity: 1; \}/);
  });
});
