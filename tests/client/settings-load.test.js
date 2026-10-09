// CLIENT (static) tests for how the Settings page loads: every request the page
// needs starts at once in one Promise.all, so the global loader (a counter in
// core.js) shows a single bar and every card paints together, instead of one
// request after another with a blink each time.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const js   = read('public/js/settings.js');
const load = sliceFn(js, 'loadSettings', 'settings.js');
const count = (src, needle) => src.split(needle).length - 1;

describe('loadSettings fetches everything in one batch', () => {
  test('exactly one Promise.all, and no request is awaited on its own', () => {
    assert.equal(count(load, 'Promise.all('), 1);
    assert.equal(count(load, 'await api.get('), 0, 'no sequential awaits');
    assert.equal(count(load, 'await loadTaskSettings('), 0);
    assert.equal(count(load, 'await loadInvites('), 0);
    assert.equal(count(load, 'await loadMembers('), 0);
  });
  test('the batch covers every endpoint the page renders from, each once', () => {
    const batch = load.slice(load.indexOf('Promise.all('), load.indexOf(']);', load.indexOf('Promise.all(')));
    for (const ep of ['/api/fields', '/api/object-fields', '/api/pipelines', '/api/deal-fields', '/api/task-fields', '/api/auth/me', '/api/workspace/members', '/api/invites']) {
      assert.equal(count(batch, `'${ep}'`), 1, ep);
    }
    assert.equal(count(load, "'/api/auth/me'"), 1, 'auth/me is fetched once and reused for the Tasks statuses and the delete-workspace check');
    assert.match(batch, /canManageInvites \? api\.get\('\/api\/invites'\) : null/, 'invites only for owners and admins');
  });
  test('the pre-fetched data is handed to the helpers instead of being fetched again', () => {
    assert.match(load, /loadTaskSettings\(me, taskFieldRows\)/);
    assert.match(load, /loadInvites\(inviteRows\)/);
    assert.match(load, /loadMembers\(memberRows\)/);
    assert.doesNotMatch(load, /const meRes = await/);
  });
  test('cards render in the same order as before, after the single wait', () => {
    const order = ['renderTimezoneSetting()', 'renderFieldsList()', 'renderObjectFieldsList()', 'renderPipelinesSettings()', 'loadTaskSettings(', 'loadNotifPrefs()', 'switchSettingsTab(currentSettingsTab)', 'loadInvites(', 'workspace-name-card', 'loadMembers('];
    const idx = order.map(n => load.indexOf(n));
    assert.ok(idx.every(i => i > 0), order.filter((_, i) => idx[i] < 0).join(', '));
    assert.deepEqual([...idx].sort((a, b) => a - b), idx);
    assert.ok(idx[0] > load.indexOf('Promise.all('), 'rendering starts after the batch');
  });
});

describe('the helpers still work on their own', () => {
  test('loadTaskSettings uses prefetched data when given and fetches otherwise', () => {
    const s = sliceFn(js, 'loadTaskSettings', 'settings.js');
    assert.match(s, /^async function loadTaskSettings\(prefetchedMe, prefetchedFields\)/);
    assert.match(s, /api\.get\('\/api\/auth\/me'\)/);
    assert.match(s, /api\.get\('\/api\/task-fields'\)/);
    assert.match(s, /taskFields = \[\]/, 'still falls back to an empty list on error');
  });
  test('loadInvites and loadMembers accept prefetched rows and still fetch when called bare', () => {
    const inv = sliceFn(js, 'loadInvites', 'settings.js');
    assert.match(inv, /^async function loadInvites\(prefetched\)/);
    assert.match(inv, /prefetched \?\? await api\.get\('\/api\/invites'\)/);
    const mem = sliceFn(js, 'loadMembers', 'settings.js');
    assert.match(mem, /^async function loadMembers\(prefetched\)/);
    assert.match(mem, /prefetched \?\? await api\.get\('\/api\/workspace\/members'\)/);
    // the other callers (after generate / delete / role change) still refetch
    assert.match(sliceFn(js, 'generateInviteCode', 'settings.js'), /await loadInvites\(\)/);
    assert.match(sliceFn(js, 'changeMemberRole', 'settings.js'), /await loadMembers\(\)/);
  });
});
