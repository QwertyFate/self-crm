// ROUTE tests: an auto-save of a note tells nobody (NOTE_EDITOR_CHANGES Part 1).
//
// The note editors save while somebody types. Every PATCH with content used to run notifyMentions, which
// inserts one notification per person mentioned — with no memory of an earlier one — and matches a name by
// its first letters. Saved at every pause, a note with "@Anna" would notify Anna again and again, and a
// half-typed "@An" would notify everyone whose name starts with "An".
//
// So the editors send `autosave: true` with these saves. The route writes the content exactly as before and
// skips the mentions; the save that ends the edit comes without the flag and tells the people mentioned once.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

// user 1 (Bea) writes; Anna and Anton are in the workspace
function workspace() {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/^\s*UPDATE activities SET/.test(sql)) return { rowCount: 1, rows: [{ id: Number(params[2]) }] };
    if (/SELECT name FROM users WHERE id=\$1/.test(sql)) return { rows: [{ name: 'Bea' }] };
    if (/SELECT id, name FROM users WHERE workspace_id = \$1/.test(sql)) return { rows: [{ id: 1, name: 'Bea' }, { id: 2, name: 'Anna Berg' }, { id: 3, name: 'Anton Kurz' }] };
    if (/FROM activities a/.test(sql)) return { rows: [{ contact_id: 42, type: 'note', contact_name: 'Erika' }] };
    if (/SELECT id FROM deals WHERE contact_id/.test(sql)) return { rows: [{ id: 5 }] };
    return { rows: [] };
  } };
  return { pool, calls };
}
const told = calls => calls.filter(c => /INSERT INTO notifications/.test(c.sql)).map(c => c.params[1]);
const written = calls => calls.find(c => /^\s*UPDATE activities SET/.test(c.sql));

async function patch(body) {
  const w = workspace();
  const s = await serve({ '/api/activities': loadRoute('activities.js', { pool: w.pool }) });
  try { return { res: await s.request('PATCH', '/api/activities/9', body), calls: w.calls }; } finally { await s.close(); }
}

describe('PATCH /api/activities/:id with autosave', () => {
  test('an auto-save writes the content and tells nobody', async () => {
    const { res, calls } = await patch({ content: 'Call back @Anna on Monday', autosave: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { success: true, id: 9 });
    assert.equal(written(calls).params[1], 'Call back @Anna on Monday', 'the content is written as sent');
    assert.deepEqual(told(calls), [], 'nobody is notified');
    assert.ok(!calls.some(c => /FROM users/.test(c.sql)), 'the names are not even read');
  });

  test('a half-typed name tells nobody while it is auto-saved', async () => {
    const { calls } = await patch({ content: 'Ask @An', autosave: true });
    assert.deepEqual(told(calls), []);
  });

  test('the save that ends the edit (no flag) tells the people mentioned, as before', async () => {
    const { res, calls } = await patch({ content: 'Call back @Anna on Monday' });
    assert.equal(res.status, 200);
    assert.deepEqual(told(calls), [2], 'Anna is told once');
    const n = calls.find(c => /INSERT INTO notifications/.test(c.sql));
    assert.equal(n.params[5], 'Bea mentioned you in a note');
  });

  test('only a literal true is an auto-save: any other value notifies as before', async () => {
    for (const autosave of [false, 'true', 1, null]) {
      const { calls } = await patch({ content: 'Thanks @Anna', autosave });
      assert.deepEqual(told(calls), [2], `autosave: ${JSON.stringify(autosave)}`);
    }
  });

  test('the flag changes nothing else: same statement, same refusals', async () => {
    const quiet = await patch({ content: 'x', autosave: true }), loud = await patch({ content: 'x' });
    assert.equal(written(quiet.calls).sql, written(loud.calls).sql);
    assert.deepEqual(written(quiet.calls).params, written(loud.calls).params);
    const nothing = await patch({ autosave: true });
    assert.equal(nothing.res.status, 400, 'the flag alone is still nothing to update');
    assert.ok(!written(nothing.calls));
  });

  test('the header of the route says so', () => {
    assert.match(read('routes/activities.js'), /`autosave: true`/);
  });
});
