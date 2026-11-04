// CLIENT (static + sandboxed) tests for Part 16: the pop windows and side
// panels rebuilt to the reference's own detail/form layouts
// (reference/pro/src/screens/deal-detail.js, contacts.js detail + form,
// tasks.js drawer + form, Forms.*). The old static #deal-modal / #task-modal /
// #detail-modal / #object-detail-modal blocks are gone; public/js/detail-views.js
// renders them through the ui.modal / ui.drawer primitives, and every other
// static modal uses the reference chrome (.modal-head/.modal-title, iconbtn
// close, .field/.label/.input, .modal-foot). Verified statically — repo rule.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const dv = read('public/js/detail-views.js');
const modals = read('public/js/modals.js');
const tasks = read('public/js/tasks.js');
const objects = read('public/js/objects.js');
const deals = read('public/js/deals.js');
const calendar = read('public/js/calendar.js');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const css = read('public/style.css');
const count = (src, needle) => src.split(needle).length - 1;

describe('files parse', () => {
  test('node --check on every touched script', () => {
    for (const f of ['public/js/detail-views.js', 'public/js/modals.js', 'public/js/tasks.js', 'public/js/objects.js', 'public/js/deals.js', 'public/js/calendar.js', 'public/js/core.js', 'public/js/auth.js'])
      execFileSync('node', ['--check', path.join(ROOT, f)]);
  });
});
describe('detail-views.js: pure helpers in a sandbox', () => {
  // dvDue now converts through the zone helpers and takes "now" from the picked clock;
  // identity stubs keep this fixture on the browser's clock, which is what d(n) builds from.
  // t / tf are stubbed to the key (plus `:values`), so the assertions name the dictionary keys.
  const F = loadFns('public/js/detail-views.js', ['dvDue', 'dvActText', 'dvDigits'], {
    extra: "const t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/'); function toViewerClock(d, t) { return { date: String(d || '').slice(0, 10), time: t || null }; } function nowInTimezone() { return new Date(); } function currentTimezone() { return 'UTC'; }" });
  test('dvDue phrases a due date relative to today', () => {
    // Builds the date from local Y/M/D, like a real <input type="date"> due-date picker would — not
    // toISOString(), whose UTC calendar date can fall a day either side of "today" near local midnight.
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    assert.equal(F.dvDue(null), 'tk_due_none');
    assert.equal(F.dvDue(d(0)), 'dv_due_today'); assert.equal(F.dvDue(d(1)), 'dv_due_tomorrow'); assert.equal(F.dvDue(d(5)), 'dv_due_in_days:5');
    assert.equal(F.dvDue(d(-1)), 'dv_overdue_one'); assert.equal(F.dvDue(d(-3)), 'dv_overdue_n:3');
  });
  test('dvActText turns a stored rich note into editable plain text; dvDigits keeps a dialable number', () => {
    assert.equal(F.dvActText('<p>Hello</p><br>world'), 'Hello\n\nworld');
    assert.equal(F.dvDigits('+49 (0) 151 / 23'), '+49015123');
  });
});
