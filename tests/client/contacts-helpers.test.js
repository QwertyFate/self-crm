// CLIENT (pure, no jsdom) tests for the contact-list helpers in
// public/js/contacts.js: the effective column layout and sorting.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns } = require('../helpers/client-fn');

const F = loadFns('public/js/contacts.js', ['effectiveContactColumns', 'getSortValue', 'sortContacts'],
  { state: { fields: [], contactColumns: [], sortKey: null, sortDir: 'asc' }, extra: 'function t(k) { return k; }' });
const BUILTIN = ['company', 'email', 'phone', 'stage_id', 'assigned_to', 'created_at', 'onboarding_status', 'drive_file_count'];
const BUDGET = { field_key: 'budget', name: 'Budget', type: 'number' };
const reset = () => { F.__set('fields', []); F.__set('contactColumns', []); F.__set('sortKey', null); F.__set('sortDir', 'asc'); };
beforeEach(reset);

describe('effectiveContactColumns', () => {
  test('no saved layout -> the seven built-ins then every custom field, visible = default', () => {
    F.__set('fields', [BUDGET]);
    const cols = F.effectiveContactColumns();
    assert.deepEqual(cols.map(c => c.key), [...BUILTIN, 'budget']);
    assert.deepEqual(cols.map(c => c.visible), [true, true, true, false, true, false, false, false, true]);
    assert.equal(cols.at(-1).label(), 'Budget');
    assert.equal(cols[0].label(), 'col_company', 'built-in labels go through t()');
  });
  test('a saved layout sets order and visibility, drops unknown keys, appends new columns with defaults', () => {
    F.__set('fields', [BUDGET]);
    F.__set('contactColumns', [{ key: 'phone', visible: false }, { key: 'ghost', visible: true }, { key: 'company', visible: true }]);
    const cols = F.effectiveContactColumns();
    assert.deepEqual(cols.map(c => c.key), ['phone', 'company', 'email', 'stage_id', 'assigned_to', 'created_at', 'onboarding_status', 'drive_file_count', 'budget']);
    assert.equal(cols[0].visible, false, 'saved visibility wins over the default');
    assert.equal(cols.find(c => c.key === 'stage_id').visible, false, 'unsaved column keeps its default');
    assert.equal(cols.find(c => c.key === 'budget').visible, true);
  });
});

describe('getSortValue / sortContacts', () => {
  test('no sort key -> the same array reference, untouched', () => {
    const list = [{ name: 'b' }, { name: 'a' }];
    assert.equal(F.sortContacts(list), list);
  });
  test('text keys sort case-insensitively; input not mutated; desc flips', () => {
    const list = [{ name: 'bob' }, { name: 'Alice' }, { name: 'carl' }];
    F.__set('sortKey', '_name');
    assert.deepEqual(F.sortContacts(list).map(c => c.name), ['Alice', 'bob', 'carl']);
    assert.deepEqual(list.map(c => c.name), ['bob', 'Alice', 'carl'], 'original order kept');
    F.__set('sortDir', 'desc');
    assert.deepEqual(F.sortContacts(list).map(c => c.name), ['carl', 'bob', 'Alice']);
  });
  test('built-in columns map to the joined display names and created_at is numeric', () => {
    assert.equal(F.getSortValue({ stage_name: 'Won' }, 'stage_id'), 'won');
    assert.equal(F.getSortValue({ assigned_to_name: 'Zoe' }, 'assigned_to'), 'zoe');
    assert.equal(F.getSortValue({ created_at: '2026-01-01T00:00:00Z' }, 'created_at'), Date.UTC(2026, 0, 1));
    assert.equal(F.getSortValue({}, 'created_at'), 0);
  });
  test('a custom number field sorts numerically, a date field by time, missing values as empty text', () => {
    F.__set('fields', [BUDGET, { field_key: 'start', name: 'Start', type: 'date' }, { field_key: 'note', name: 'Note', type: 'text' }]);
    F.__set('sortKey', 'budget');
    const list = [{ custom_data: { budget: '12' } }, { custom_data: { budget: '9' } }, { custom_data: {} }];
    assert.deepEqual(F.sortContacts(list).map(c => c.custom_data.budget), [undefined, '9', '12'], '"9" < "12" numerically, missing = 0 first');
    assert.equal(F.getSortValue({ custom_data: { start: '2026-02-01T00:00:00Z' } }, 'start'), Date.UTC(2026, 1, 1));
    assert.equal(F.getSortValue({ custom_data: { note: 'Hello' } }, 'note'), 'hello');
    assert.equal(F.getSortValue({}, 'note'), '', 'no custom_data at all');
  });
});
