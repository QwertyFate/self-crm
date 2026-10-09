// CLIENT (static) tests: creating a task has an explicit "Set a due date" tick
// box, off by default; ticking it reveals the date and time, prefilled with
// today (on the viewer's clock) and three hours from now.
//
// THE BUG THIS REPLACES. Both create forms rendered
// <input type="date" name="due_date" value=""> — genuinely empty — but Safari
// and the macOS picker paint an EMPTY date input as today's date in grey. So the
// user saw "today", the form submitted nothing, and the task saved with no due
// date; only re-picking today made it stick. (Reported as: "there is already
// today's date there, but when I save it says no due date".) And a task saved
// without a time has no time to show on the calendar — the user's other report.
//
// With a tick box, what you see is what saves: unticked → no due date, full
// stop; ticked → the fields are visible AND filled, so an untouched form still
// submits a real date and time.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const dv = read('public/js/detail-views.js');
const cal = read('public/js/calendar.js');
const ESC = `function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }`;

describe('dvDefaultDue: today, three hours from now, rounded up to the quarter hour', () => {
  const F = () => loadFns('public/js/detail-views.js', ['dvDefaultDue']);
  const at = (h, m, d = 6) => new Date(2026, 9, d, h, m);

  test('14:07 → 17:15 on the same day', () => {
    assert.deepEqual(F().dvDefaultDue(at(14, 7)), { date: '2026-10-06', time: '17:15' });
  });
  test('an exact hour stays exact: 14:00 → 17:00', () => {
    assert.deepEqual(F().dvDefaultDue(at(14, 0)), { date: '2026-10-06', time: '17:00' });
  });
  test('14:45 → 17:45 (already on a quarter)', () => {
    assert.deepEqual(F().dvDefaultDue(at(14, 45)), { date: '2026-10-06', time: '17:45' });
  });
  test('late evening rolls the DATE forward: 22:30 → 7 Oct 01:30', () => {
    assert.deepEqual(F().dvDefaultDue(at(22, 30)), { date: '2026-10-07', time: '01:30' });
  });
  test('rounding can roll the hour too: 23:50 → 7 Oct 03:00', () => {
    assert.deepEqual(F().dvDefaultDue(at(23, 50)), { date: '2026-10-07', time: '03:00' });
  });
  test("with no argument it reads the viewer's clock, not the browser's", () => {
    assert.match(sliceFn(dv, 'dvDefaultDue', 'detail-views.js'), /now = nowInTimezone\(currentTimezone\(\)\)/);
  });
});

describe('the New task form', () => {
  const tf = sliceFn(dv, 'openTaskForm', 'detail-views.js');

  test('has a "Set a due date" tick box that starts UNTICKED', () => {
    const box = tf.match(/<input type="checkbox"[^>]*name="due_on"[^>]*>/);
    assert.ok(box, 'no due_on checkbox');
    assert.doesNotMatch(box[0], /\schecked/, 'must start off: an untouched form means no due date');
  });
  test('the date and time fields live in a wrapper that starts hidden — by CLASS, not attribute', () => {
    // .field-row is display:grid; an author display rule beats the browser's [hidden]
    // {display:none}, so the attribute left the row visible and the picker usable with the
    // box off (reported). The app hides with the .hidden class (display:none !important).
    assert.match(tf, /class="field-row hidden" id="\$\{fid\}-dw"/);
    assert.doesNotMatch(tf, /id="\$\{fid\}-dw" hidden/);
  });
  test('the inputs themselves are unchanged (and still empty, never a fake-looking prefill)', () => {
    assert.match(tf, /type="date" id="\$\{fid\}-d" name="due_date" value=""/);
    assert.match(tf, /type="time"[^>]*name="due_time"[^>]*value=""/);
  });
  test('ticking reveals the fields and prefills them from dvDefaultDue; unticking hides and clears', () => {
    assert.match(tf, /dvDefaultDue\(\)/);
    assert.match(tf, /classList\.toggle\('hidden', !dueOn\.checked\)/, 'the wrapper follows the box, via the class');
    assert.match(tf, /\.value = ''/, 'cleared on untick');
  });
  test('the payload sends a due date and time ONLY when the box is ticked — whatever the inputs hold', () => {
    assert.match(tf, /due_date: d\.due_on \? \(d\.due_date \|\| null\) : null/);
    assert.match(tf, /due_time: d\.due_on \? \(d\.due_time \|\| null\) : null/);
  });
  test('the rest of the form is as it was: modal, ≥4 field rows, posts the payload, custom fields', () => {
    assert.match(tf, /ui\.modal\(\{ title: t\('dv_new_task'\), size: 'md'/);
    assert.ok((tf.match(/<div class="field-row"/g) || []).length >= 4);
    assert.match(tf, /api\.post\('\/api\/tasks', payload\)/);
    assert.match(tf, /taskFields\.map\(cf\)/);
  });
});

describe('the deal-detail quick-add task form', () => {
  test('S.task starts with due_on: false, and is reset to it after adding', () => {
    assert.match(dv, /task: \{[^}]*due_on: false/);
    assert.match(dv, /S\.task = \{ title: '', due_on: false, due_date: '', due_time: ''/);
  });
  test('the form renders the tick box and hides the date/time unless it is on', () => {
    const f = sliceFn(dv, 'taskFormHtml', 'detail-views.js');
    assert.match(f, /name="due_on"/);
    assert.match(f, /x\.due_on \? 'checked' : ''/);
    assert.match(f, /class="field-row-3 \$\{x\.due_on \? '' : 'hidden'\}"/, 'hidden as a class on the grid row, not an attribute');
    assert.match(f, /id="dd-task-time" name="due_time"/, 'the time input keeps its id and name');
  });
  test('the input handler reads a checkbox as checked/unchecked, not as the string "on"', () => {
    assert.match(dv, /el\.type === 'checkbox' \? el\.checked : el\.value/);
  });
  test('ticking prefills from dvDefaultDue and re-renders; submit gates on due_on', () => {
    assert.ok((dv.match(/dvDefaultDue\(\)/g) || []).length >= 2, 'both forms use the one default');
    const s = sliceFn(dv, 'submitTask', 'detail-views.js');
    assert.match(s, /due_date: x\.due_on \? \(x\.due_date \|\| null\) : null/);
    assert.match(s, /due_time: x\.due_on \? \(x\.due_time \|\| null\) : null/);
  });
});

describe('why the attribute failed, and the guard against it recurring', () => {
  const css = read('public/style.css');
  test('.field-row and .field-row-3 are display:grid — an author rule, which is why [hidden] lost', () => {
    assert.match(css, /\.field-row \{ display: grid;/);
    assert.match(css, /\.dd-taskform \.field-row-3 \{ display: grid;/);
  });
  test('a global [hidden] { display:none !important } now exists, so the attribute can never lose this way again', () => {
    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });
});

describe('the calendar DOES show a time on a task that has one (the "no time preview" report)', () => {
  // CAL_TYPES holds dictionary keys; t() is core.js, stubbed here to the English words
  const C = () => loadFns('public/js/calendar.js', ['calEvButton', 'calTitleOf', 'calTypeOf', 'calTypeLabel', 'calFmtDay', 'calDateFromIso', 'calLocale'],
    { extra: `${ESC}\nconst CAL_TYPES = [{ id: 'note', key: 'act_note' }, { id: 'task', key: 'new_task' }];\nconst currentLang = 'en'; const t = k => ({ act_note: 'Note', new_task: 'Task', cal_all_day: 'All day' })[k] || k;` });
  const task = time => ({ uid: 'task-1', kind: 'task', type: 'task', title: 'Call Anna', event_date: '2026-10-07', event_time: time, completed: false });

  test('a task with 09:00 renders <b>09:00</b> in the month chip body', () => {
    const body = C().calEvButton(task('09:00')).replace(/^<button[^>]*>/, '');
    assert.match(body, /<b>09:00<\/b>/);
    assert.match(body, /Call Anna/);
  });
  test('a task with no time renders no time — there is nothing to preview, which is why the form fix matters', () => {
    const body = C().calEvButton(task(null)).replace(/^<button[^>]*>/, '');
    assert.doesNotMatch(body, /<b>/);
  });
});

describe('the task DRAWER: the same tick box — and it can REMOVE a due date', () => {
  // The create forms gained the box; the drawer had none, so a due date put on the wrong task
  // could not be cleanly taken off. The drawer saves on change, so here ticking SAVES at once
  // (today + 3 h) — the inputs must never show a value that is not stored — and unticking
  // saves null for both date and time.
  const dr = sliceFn(dv, 'openTaskDrawer', 'detail-views.js');

  test('a "Has a due date" box, checked only when the task has one', () => {
    assert.match(dr, /<input type="checkbox" id="\$\{fid\}-don" data-due-on \$\{x\.due_date \? 'checked' : ''\}>/);
  });
  test('the inputs sit in a wrapper hidden by CLASS when there is no date; display:contents keeps the flex row layout', () => {
    assert.match(dr, /id="\$\{fid\}-dw" class="\$\{x\.due_date \? '' : 'hidden'\}" style="display:contents"/);
    assert.match(dr, /data-f="due_date"/);
    assert.match(dr, /type="time"[^>]*data-f="due_time"/);
  });
  test('ticking saves today + 3 h immediately', () => {
    assert.match(dr, /const dd = dvDefaultDue\(\); await save\(\{ due_date: dd\.date, due_time: dd\.time \}/);
  });
  test('unticking saves null for BOTH date and time — how a wrong due date is removed', () => {
    assert.match(dr, /await save\(\{ due_date: null, due_time: null \}, t\('dv_due_removed'\)\)/);
  });
  test('clearing the date input by hand also drops the time (a time without a date is useless)', () => {
    assert.match(dr, /if \(k === 'due_date' && !v\) patch\.due_time = null/);
  });
  test('after any due change, box / wrapper / inputs / note are re-synced from the SAVED task', () => {
    assert.match(dr, /const syncDue = /);
    assert.match(dr, /if \(k === 'due_date' \|\| k === 'due_time'\) syncDue\(\)/);
    assert.doesNotMatch(dr, /if \(k === 'due_date' \|\| k === 'due_time'\) dueNote\(\)/);
  });
  test('the PUT payload is unchanged: date and time come from the task object', () => {
    assert.match(dr, /due_date: x\.due_date \? dvIso\(x\.due_date\) : null, due_time: x\.due_time \|\| null/);
  });
});
