// UNIT tests for the shared cross-workspace guard. `refCheck` is a pure
// function; `dealRefs` / `taskRefs` / `allowedTaskStatuses` each run one SQL
// statement, so they get a fake pool and we inspect what they bound.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { refCheck, dealRefs, taskRefs, allowedTaskStatuses, TASK_PRIORITIES } = require('../../utils/workspace-refs');

describe('refCheck (pure)', () => {
  const refs = { contacts: new Set([10]), members: new Set([1]), stages: new Set([30]) };

  test('returns null when every supplied id is in the workspace', () => {
    assert.equal(refCheck(refs, { contact_id: 10, assigned_to: 1, stage_id: 30 }), null);
  });

  test('names the first foreign field', () => {
    assert.equal(refCheck(refs, { contact_id: 11 }), 'contact_id does not belong to this workspace');
    assert.equal(refCheck(refs, { assigned_to: 2 }), 'assigned_to is not a member of this workspace');
  });

  test('a falsy id means "not provided" and is never checked', () => {
    assert.equal(refCheck(refs, { contact_id: null, assigned_to: 0, stage_id: '' }), null);
  });

  test('a field is only checked when refs carries the matching set', () => {
    // the contacts path passes {stages, members}; a pipeline_id on the body is ignored there
    assert.equal(refCheck({ stages: new Set(), members: new Set() }, { pipeline_id: 999 }), null);
  });

  test('string ids compare numerically', () => {
    assert.equal(refCheck(refs, { contact_id: '10' }), null);
  });
});

describe('dealRefs (one lookup)', () => {
  test('binds only the ids that were supplied, in a fixed slot order', async () => {
    const pool = createFakePool([{ match: /id = ANY/, reply: () => ({ rows: [{ kind: 'pipeline', id: 20 }] }) }]);
    const refs = await dealRefs(pool, 7, { pipeline_id: 20 });
    assert.equal(pool.log.length, 1);
    assert.deepEqual(pool.log[0].params, [7, [], [20], [], []]);   // [wid, contacts, pipelines, stages, members]
    assert.ok(refs.pipelines.has(20));
    assert.equal(refs.contacts.size, 0);
  });

  test('runs no query at all when nothing is supplied', async () => {
    const pool = createFakePool();
    await dealRefs(pool, 7, {});
    assert.equal(pool.log.length, 0);
  });

  test('a non-integer id is not looked up, so refCheck rejects it instead of the DB erroring', async () => {
    const pool = createFakePool();
    const refs = await dealRefs(pool, 7, { contact_id: 'abc' });
    assert.equal(pool.log.length, 0);
    assert.equal(refCheck(refs, { contact_id: 'abc' }), 'contact_id does not belong to this workspace');
  });
});

describe('taskRefs (one lookup, six tables)', () => {
  test('binds six arrays and refCheck reads the result', async () => {
    const pool = createFakePool([{ match: /id = ANY/, reply: () => ({ rows: [{ kind: 'task', id: 100 }, { kind: 'user', id: 1 }] }) }]);
    const refs = await taskRefs(pool, 7, { parent_id: 100, assigned_to: 1 });
    assert.deepEqual(pool.log[0].params, [7, [100], [], [], [1], [], []]);  // parent, project, list, user, deal, contact
    assert.equal(refCheck(refs, { parent_id: 100, assigned_to: 1 }), null);
    assert.equal(refCheck(refs, { parent_id: 101 }), 'parent_id does not belong to this workspace');
  });
});

describe('allowedTaskStatuses (union)', () => {
  test('is workspace list + project list + the four built-ins', async () => {
    const pool = createFakePool([{ match: /jsonb_array_elements/, reply: () => ({ rows: [{ key: 'backlog' }, { key: 'qa' }] }) }]);
    const allowed = await allowedTaskStatuses(pool, 7, 20);
    assert.deepEqual([...allowed].sort(), ['backlog', 'done', 'in_progress', 'in_review', 'qa', 'todo']);
    assert.deepEqual(pool.log[0].params, [7, 20]);
  });

  test('a null project binds NULL for the project id', async () => {
    const pool = createFakePool();
    await allowedTaskStatuses(pool, 7, null);
    assert.deepEqual(pool.log[0].params, [7, null]);
  });
});

test('TASK_PRIORITIES is the fixed allow-list the UI offers', () => {
  assert.deepEqual(TASK_PRIORITIES, ['low', 'medium', 'high', 'urgent']);
});
