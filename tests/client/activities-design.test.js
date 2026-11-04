// CLIENT (static + sandboxed) tests for the Activities page, ported from
// reference/pro/src/screens/activities.js: search + Type + Person chips, a
// kebab menu, CSV export, a subtitle count. The rest of the reference screen
// (compose card, Period chip, day groups, the breakdown rail) is covered by
// activities-port.test.js.
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

describe('objects.js: filtering logic in a sandbox', () => {
  // visibleActivities searches the VISIBLE text of a note (dvActText — tags stripped, entities
  // decoded) rather than the stored <br>/entities, so the real helper is sliced in; the seed
  // notes are plain strings and pass through it unchanged.
  // The ported search also matches the type label (t('act_' + type)), so a label stub is in too.
  const extra = `const esc = s => String(s ?? ''); const t = k => k; ${sliceFn(read('public/js/detail-views.js'), 'dvActText', 'detail-views.js')}`;
  const F = loadFns('public/js/objects.js', ['visibleActivities', 'actDayDiff', 'actStartOfDay', 'actContactOf'], {
    state: { activities: [], activitiesUI: { q: '', type: null, by: null, period: 'all' }, activityContactList: [] },
    extra,
  });
  const seed = [
    { id: 1, type: 'note', content: 'Called about financing', contact_name: 'Anna Berg', created_by: 1 },
    { id: 2, type: 'call', content: 'Quick follow-up', contact_name: 'Jonas Kahl', created_by: 2 },
    { id: 3, type: 'email', content: 'Sent the brochure', contact_name: null, created_by: 1 },
  ];
  test('filters by type, by person, and by a search term over content/contact', () => {
    F.__set('activities', seed);
    const ui = patch => F.__set('activitiesUI', { q: '', type: null, by: null, period: 'all', ...patch });
    ui({}); assert.deepEqual(F.visibleActivities().map(a => a.id), [1, 2, 3]);
    ui({ type: 'call' }); assert.deepEqual(F.visibleActivities().map(a => a.id), [2]);
    ui({ by: 1 }); assert.deepEqual(F.visibleActivities().map(a => a.id), [1, 3]);
    ui({ q: 'berg' }); assert.deepEqual(F.visibleActivities().map(a => a.id), [1]);
    ui({ q: 'brochure' }); assert.deepEqual(F.visibleActivities().map(a => a.id), [3]);
  });
});
