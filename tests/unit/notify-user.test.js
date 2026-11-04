// UNIT tests for notifyUser in notifications.js (Cal.com Part 12, 2026-10-14): one person
// is told, not the workspace. The REAL module is loaded over a fake pool (db.js swapped in
// the require cache, as tests/helpers/load-route.js does for routes). Pinned: the actor is
// skipped; an unknown user or one of another workspace gets nothing; a category switched
// off in their preferences gets nothing; otherwise one row with every column; a null actor
// (a booking made on Cal.com's own page) writes actor_id NULL; a failing query is swallowed
// and reported as false, never thrown. notify()'s fan-out is untouched.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');

const state = { calls: [], users: [], fail: false };
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (state.fail) throw new Error('connection lost');
    if (q.startsWith('SELECT id, notification_prefs FROM users WHERE id=$1 AND workspace_id=$2')) return { rows: state.users.filter(u => u.id === params[0] && u.workspace_id === params[1]).map(u => ({ id: u.id, notification_prefs: u.notification_prefs })) };
    if (q.startsWith('SELECT id, notification_prefs FROM users WHERE workspace_id=$1 AND id != $2')) return { rows: state.users.filter(u => u.workspace_id === params[0] && u.id !== params[1]).map(u => ({ id: u.id, notification_prefs: u.notification_prefs })) };
    return { rows: [] };
  },
};
function load() {
  const dbAbs = path.join(ROOT, 'db.js'), abs = path.join(ROOT, 'notifications.js');
  const previous = require.cache[dbAbs];
  require.cache[dbAbs] = { id: dbAbs, filename: dbAbs, loaded: true, exports: { pool }, children: [], paths: [] };
  delete require.cache[abs];
  const m = require(abs);
  if (previous) require.cache[dbAbs] = previous; else delete require.cache[dbAbs];
  return m;
}
const N = load();
const MSG = { type: 'meeting_booked', category: 'activities', title: 'Erstgespräch mit Jana Weber', body: '20.10.2026, 14:00 (Europe/Berlin), Google Meet', entityType: 'deal', entityId: 12 };
beforeEach(() => { state.calls = []; state.fail = false; state.users = [{ id: 3, workspace_id: 7, notification_prefs: { activities: true } }, { id: 4, workspace_id: 7, notification_prefs: { activities: false } }, { id: 5, workspace_id: 7, notification_prefs: null }, { id: 6, workspace_id: 8, notification_prefs: {} }]; });
const inserts = () => state.calls.filter(c => c.sql.startsWith('INSERT INTO notifications'));

describe('notifyUser', () => {
  test('one row for the one person, every column; the actor recorded; true', async () => {
    assert.equal(await N.notifyUser(7, 2, 3, MSG), true);
    assert.equal(inserts().length, 1);
    assert.match(inserts()[0].sql, /^INSERT INTO notifications \(workspace_id, user_id, actor_id, type, category, title, body, entity_type, entity_id\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9\)$/);
    assert.deepEqual(inserts()[0].params, [7, 3, 2, 'meeting_booked', 'activities', 'Erstgespräch mit Jana Weber', '20.10.2026, 14:00 (Europe/Berlin), Google Meet', 'deal', 12]);
  });
  test('the actor is skipped (they did it themselves); no user id, an unknown user, or one of another workspace: nothing, false', async () => {
    assert.equal(await N.notifyUser(7, 3, 3, MSG), false);
    assert.equal(await N.notifyUser(7, 2, null, MSG), false);
    assert.equal(await N.notifyUser(7, 2, 999, MSG), false);
    assert.equal(await N.notifyUser(7, 2, 6, MSG), false, 'user 6 belongs to workspace 8');
    assert.equal(inserts().length, 0);
  });
  test('the category preference is honoured: off means no row; unset means on; no category means on', async () => {
    assert.equal(await N.notifyUser(7, 2, 4, MSG), false);
    assert.equal(await N.notifyUser(7, 2, 5, MSG), true, 'no preferences stored: everything on');
    assert.equal(await N.notifyUser(7, 2, 4, { ...MSG, category: 'deals' }), true, 'another category is still on for user 4');
    assert.equal(await N.notifyUser(7, 2, 4, { ...MSG, category: undefined }), true);
    assert.equal(inserts().length, 3);
  });
  test('no actor (a booking made on Cal.com\'s own page): actor_id NULL and nobody skipped, the host included; an empty body and entity are NULL', async () => {
    assert.equal(await N.notifyUser(7, null, 3, { type: 'meeting_cancelled', category: 'activities', title: 'T' }), true);
    assert.deepEqual(inserts()[0].params, [7, 3, null, 'meeting_cancelled', 'activities', 'T', null, null, null]);
  });
  test('a failing query is swallowed: false, nothing thrown (a notification must never fail a booking)', async () => {
    state.fail = true;
    assert.equal(await N.notifyUser(7, 2, 3, MSG), false);
  });
  test('notify() still fans out to everyone but the actor, honouring the category', async () => {
    await N.notify(7, 2, MSG);
    const ins = inserts()[0];
    assert.ok(ins, 'one multi-row insert'); assert.deepEqual(ins.params.filter((_, i) => i % 9 === 1), [3, 5], 'users 3 and 5; 4 has activities off; 6 is elsewhere');
  });
});
