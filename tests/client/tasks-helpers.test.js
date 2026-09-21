// CLIENT (pure, no jsdom) tests for public/js/tasks.js: subtask grouping and
// attachment size formatting.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns } = require('../helpers/client-fn');

const F = loadFns('public/js/tasks.js', ['buildSubtaskMap', 'fmtSize']);

describe('buildSubtaskMap', () => {
  test('groups children under parent_id in list order; roots are not keys; empty -> {}', () => {
    const list = [{ id: 1 }, { id: 2, parent_id: 1 }, { id: 3 }, { id: 4, parent_id: 1 }, { id: 5, parent_id: 3 }];
    const map = F.buildSubtaskMap(list);
    assert.deepEqual(Object.keys(map), ['1', '3']);
    assert.deepEqual(map[1].map(s => s.id), [2, 4]);
    assert.deepEqual(map[3].map(s => s.id), [5]);
    assert.deepEqual(F.buildSubtaskMap([]), {});
  });
});

describe('fmtSize', () => {
  test('B below 1024, KB below 1 MiB, MB above, one decimal', () => {
    assert.equal(F.fmtSize(0), '0 B');
    assert.equal(F.fmtSize(1023), '1023 B');
    assert.equal(F.fmtSize(1024), '1.0 KB');
    assert.equal(F.fmtSize(1536), '1.5 KB');
    assert.equal(F.fmtSize(1048576), '1.0 MB');
    assert.equal(F.fmtSize(5.5 * 1048576), '5.5 MB');
  });
});
