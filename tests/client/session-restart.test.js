// CLIENT (static + behaviour) tests: a user or workspace change is a fresh
// page load. Logout, login, signup, workspace select / switch / join and
// create all end in restartApp(), so nothing the previous identity rendered,
// cached, timed or connected (the chat socket) can survive into the next one.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const auth = read('public/js/auth.js');
const BOUNDARIES = ['logout', 'handleLogin', 'selectWorkspace', 'handleSignup', 'switchWorkspace', 'handleJoinWorkspace', 'handleCreateWorkspace'];

describe('every identity boundary restarts the app', () => {
  test('restartApp loads the app afresh at its bare path', () => {
    assert.match(auth, /^function restartApp\(/m);
    assert.match(sliceFn(auth, 'restartApp', 'auth.js'), /window\.location\.replace\(window\.location\.pathname\)/);
  });
  test('logout, login, signup, select, switch, join and create all call it and never patch the live app', () => {
    for (const fn of BOUNDARIES) {
      const src = sliceFn(auth, fn, 'auth.js');
      assert.match(src, /restartApp\(\)/, `${fn} restarts`);
      assert.equal(src.includes('showApp('), false, `${fn} does not reuse the live document`);
      assert.equal(src.includes('showAuth('), false, `${fn} does not reuse the live document`);
      assert.equal(src.includes('invalidate('), false, `${fn} has nothing left to invalidate`);
    }
    assert.match(sliceFn(auth, 'handleLogin', 'auth.js'), /showWorkspacePicker\(/, 'the picker path stays');
    const sw = sliceFn(auth, 'switchWorkspace', 'auth.js');
    assert.equal((sw.match(/switchPage\('deals'\)/g) || []).length, 1, 'switchPage only for the same-workspace shortcut');
    assert.equal(auth.includes('location.reload'), false, 'one restart path, not two');
  });
  test('the dead sidebar-dropdown code is gone; showApp runs on a fresh document only', () => {
    for (const s of ['function showJoinWorkspace', 'ws-dropdown', 'wsSwitcherOpen']) assert.equal(auth.includes(s), false, s);
    const callers = [...auth.matchAll(/^(?:async )?function (\w+)\([^)]*\) \{[\s\S]*?^\}/gm)]
      .filter(m => m[0].includes('showApp();')).map(m => m[1]);
    assert.deepEqual(callers, ['init', 'closeJoinWorkspace']);
  });
});

describe('behaviour (stubbed window, api, switchPage, alert)', () => {
  const extra = `
    globalThis.__calls = { post: [], replace: [], page: [], alert: [] };
    globalThis.__postResult = () => ({});
    const window = { location: { pathname: '/', replace(p) { globalThis.__calls.replace.push(p); } } };
    const api = { post: async (url) => { globalThis.__calls.post.push(url); return globalThis.__postResult(url); } };
    async function switchPage(p) { globalThis.__calls.page.push(p); }
    function alert(m) { globalThis.__calls.alert.push(m); }`;
  const fresh = () => { globalThis.__calls = { post: [], replace: [], page: [], alert: [] }; globalThis.__postResult = () => ({}); };

  test('logout posts to the server, then restarts', async () => {
    const F = loadFns('public/js/auth.js', ['restartApp', 'logout'], { extra });
    fresh();
    await F.logout();
    assert.deepEqual(globalThis.__calls.post, ['/api/auth/logout']);
    assert.deepEqual(globalThis.__calls.replace, ['/']);
  });
  test('switchWorkspace: another workspace restarts; the same one just goes to Deals; an error stops', async () => {
    const F = loadFns('public/js/auth.js', ['restartApp', 'switchWorkspace'], { state: { currentWorkspace: { id: 1 } }, extra });
    fresh();
    await F.switchWorkspace(2);
    assert.deepEqual(globalThis.__calls.post, ['/api/auth/switch-workspace']);
    assert.deepEqual(globalThis.__calls.replace, ['/']);
    fresh();
    await F.switchWorkspace(1);
    assert.deepEqual(globalThis.__calls.post, []);
    assert.deepEqual(globalThis.__calls.replace, []);
    assert.deepEqual(globalThis.__calls.page, ['deals']);
    fresh();
    globalThis.__postResult = () => ({ error: 'nope' });
    await F.switchWorkspace(3);
    assert.deepEqual(globalThis.__calls.alert, ['nope']);
    assert.deepEqual(globalThis.__calls.replace, []);
  });
});
