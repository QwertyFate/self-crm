// CLIENT (static + pure-function) tests: the contact record's create actions
// live with what they create. "Add deal" sits in the Deals block head, "Add
// task" in a new Tasks block (with the contact's tasks listed), and the
// identity card carries no action band.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const css = read('public/style.css');
const modals = read('public/js/modals.js');
const tasks = read('public/js/tasks.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const GLYPH = /📅|🔗|✕|⚠|✓/;

describe('where the actions live', () => {
  test('the identity card has no action band', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    for (const s of ['contact-card-actions', 'openDealModalForContact(', 'openTaskModalForContact(']) assert.equal(card.includes(s), false, s);
  });
  test('Add deal in the Deals head; a Tasks block with Add task between Deals and Notes', () => {
    const body = sliceFn(modals, 'buildDetailHTML', 'modals.js');
    // The head (toggle · title · count · actions) is built by detailBlockHead; each block passes its own action button.
    const head = sliceFn(modals, 'detailBlockHead', 'modals.js');
    assert.match(head, /detail-block-actions">\$\{actionsHtml\}/);
    assert.match(head, /id="contact-\$\{name\}-count"/, 'every block has a count the refresh can update');
    const deals = body.slice(body.indexOf("detailBlockHead('deals'"), body.indexOf('id="contact-deals-list"'));
    assert.match(deals, /openDealModalForContact\(\$\{id\}\)/, 'Add deal in the Deals head');
    assert.equal((deals.match(/<button/g) || []).length, 1, 'one action in the Deals head');
    const tasksBlock = body.slice(body.indexOf("detailBlockHead('tasks'"), body.indexOf('id="contact-tasks-list"'));
    assert.ok(tasksBlock.length > 0, 'a Tasks block exists');
    assert.match(tasksBlock, /t\('sec_tasks'\), taskCount,/);
    assert.match(tasksBlock, /openTaskModalForContact\(\$\{id\}\)/, 'Add task in the Tasks head');
    assert.match(body, /id="contact-tasks-list" data-contact-id="\$\{id\}">\$\{renderContactTasks\(contactTasks\)\}/);
    const order = ['contact-detail-card', 'contact-deals-list', 'contact-tasks-list', 'contact-note-form-wrapper'].map(s => body.indexOf(s));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `order: ${order.join(',')}`);
    assert.match(body, /^function buildDetailHTML\(c, contactDeals, contactTasks, id\)/);
  });
  test('openDetail fetches the contact\'s tasks and hands them to the body', () => {
    const open = sliceFn(modals, 'openDetail', 'modals.js');
    assert.match(open, /api\.get\(`\/api\/tasks\?contact_id=\$\{id\}`\)/);
    assert.match(open, /buildDetailHTML\(c, contactDeals, contactTasks, id\)/);
  });
});

describe('the task rows', () => {
  test('renderContactTasks: compact rows that open the task, a due date, an empty state, no glyphs', () => {
    const r = sliceFn(modals, 'renderContactTasks', 'modals.js');
    for (const s of ['contactTaskStatus(', 'contactTaskStatuses(', 'contact-task-row', 'is-done', 'contact-task-dot', 'contact-task-title', 'openTaskModal(', 'task-due', 'overdue', 'fmtDate(', 'empty-inline', "t('no_tasks_hint')"]) {
      assert.ok(r.includes(s), s);
    }
    assert.match(sliceFn(modals, 'contactTaskStatuses', 'modals.js'), /task_statuses[\s\S]*DEFAULT_TASK_STATUSES/, 'workspace statuses, else the built-in four');
    assert.equal(r.replace(/style="background:[^"]*"/g, '').includes('style="'), false, 'the only inline style is the status colour');
    assert.doesNotMatch(r, GLYPH);
  });
  test('contactTaskStatus: the last status counts as done; unknown keys are handled', () => {
    const F = loadFns('public/js/modals.js', ['contactTaskStatus']);
    const statuses = [{ key: 'todo', label: 'Todo', color: '#111' }, { key: 'doing', label: 'Doing', color: '#222' }, { key: 'closed', label: 'Closed', color: '#333' }];
    assert.deepEqual(F.contactTaskStatus({ status: 'doing' }, statuses), { label: 'Doing', color: '#222', isDone: false });
    assert.deepEqual(F.contactTaskStatus({ status: 'closed' }, statuses), { label: 'Closed', color: '#333', isDone: true });
    const unknown = F.contactTaskStatus({ status: 'archived' }, statuses);
    assert.equal(unknown.label, 'archived'); assert.equal(unknown.isDone, false); assert.ok(unknown.color.includes('--ink-subtle'));
  });
  test('refreshContactTasks exists and the task modal calls it after save and delete', () => {
    assert.match(modals, /^async function refreshContactTasks\(/m);
    assert.match(sliceFn(modals, 'refreshContactTasks', 'modals.js'), /contact-tasks-list[\s\S]*dataset\.contactId[\s\S]*renderContactTasks\(/);
    assert.match(sliceFn(tasks, 'saveTask', 'tasks.js'), /refreshContactTasks\(\)/);
    assert.match(sliceFn(tasks, 'deleteTaskFromModal', 'tasks.js'), /refreshContactTasks\(\)/);
  });
});

describe('copy and stylesheet', () => {
  test('keys in both dictionaries; the deals empty state no longer points "above"', () => {
    for (const k of ['sec_tasks', 'no_tasks_hint', 'sec_deals', 'no_deals_hint', 'add_deal', 'btn_add_task']) assert.ok(k in dict.en && k in dict.de, k);
    assert.doesNotMatch(dict.en.no_deals_hint, /above/);
    assert.doesNotMatch(dict.de.no_deals_hint, /oben/);
  });
  test('task row rules exist; the card action band is gone', () => {
    for (const r of ['.contact-tasks-list {', '.contact-task-row {', '.contact-task-dot {', '.contact-task-title {', '.contact-task-row.is-done']) assert.ok(css.includes('\n' + r), r);
    assert.equal(css.includes('.contact-card-actions'), false);
    assert.ok(css.includes('\n.task-due {'), 'the due-date style is shared with the Tasks page');
  });
});
