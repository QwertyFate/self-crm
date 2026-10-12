// CLIENT (static) — open signup on the door and in the workspace modals. With
// GET /api/auth/signup-options saying openSignup, the code fields disappear and a workspace
// picker takes the code's place for "join". Pinned here: the markup auth.js reads, the branches
// in auth.js, and the dictionary keys in both languages.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst } = require('../helpers/client-fn');

const html = read('public/index.html');
const auth = read('public/js/auth.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (s, needle) => s.split(needle).length - 1;

describe('index.html', () => {
  test('the signup form has a hidden workspace picker with its empty-state line, declared once', () => {
    for (const id of ['su-workspace-pick-field', 'su-workspace-pick', 'su-workspace-pick-empty']) assert.equal(count(html, ` id="${id}"`), 1, id);
    assert.match(html, /<div class="au-field field hidden" id="su-workspace-pick-field">\s*<label class="label" for="su-workspace-pick" data-i18n="auth_pick_workspace">/);
    assert.match(html, /<select class="input" id="su-workspace-pick"><\/select>/);
    assert.match(html, /id="su-workspace-pick-empty" data-i18n="auth_no_workspaces_yet"/);
  });
  test('both join forms carry data-join="code" / "pick" / "empty" so applyJoinMode can swap them', () => {
    assert.equal(count(html, 'data-join="code"'), 2);
    assert.equal(count(html, 'data-join="pick"'), 2);
    assert.equal(count(html, 'data-join="empty"'), 2);
    assert.equal(count(html, ' id="join-ws-auth-pick"'), 1);
    assert.equal(count(html, ' id="join-ws-pick"'), 1);
    assert.match(html, /<div class="field hidden" data-join="pick">[\s\S]*?<select id="join-ws-pick"><\/select>/);
    assert.match(html, /id="join-ws-code"[^>]*required/, 'the modal code input keeps required in markup; applyJoinMode moves it');
  });
  test('the create-workspace modal wraps its platform code in #cw-code-field so it can be hidden whole', () => {
    assert.equal(count(html, ' id="cw-code-field"'), 1);
    assert.match(html, /<div class="field" id="cw-code-field">\s*<label class="label"><span data-i18n="html_platform_code">/);
  });
  test('no id is declared twice', () => {
    const all = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual([...new Set(all.filter((id, i) => all.indexOf(id) !== i))], []);
  });
});

describe('auth.js', () => {
  test('signupOptions is fetched from the public endpoint, before the door first paints, and reset with the rest of the client state', () => {
    assert.match(sliceFn(auth, 'loadSignupOptions', 'auth.js'), /api\.get\('\/api\/auth\/signup-options'\)/);
    const init = sliceFn(auth, 'init', 'auth.js');
    assert.ok(init.indexOf('await loadSignupOptions()') < init.indexOf('showAuth();'), 'options first, then the door');
    assert.match(sliceFn(auth, 'showAuth', 'auth.js'), /loadSignupOptions\(\)\.then\(toggleSignupMode\)/);
    assert.match(sliceFn(auth, 'resetClientState', 'auth.js'), /signupOptions = \{ openSignup: false, workspaces: \[\] \}/);
  });
  test('toggleSignupMode: in open signup no code field is ever shown and the picker appears for join', () => {
    const s = sliceFn(auth, 'toggleSignupMode', 'auth.js');
    assert.match(s, /const open = signupOptions\.openSignup/);
    assert.match(s, /'su-platform-code-field'\)\.classList\.toggle\('hidden', open \|\| mode !== 'create'\)/);
    assert.match(s, /'su-code-field'\)\.classList\.toggle\('hidden', open \|\| mode !== 'join'\)/);
    assert.match(s, /pickField\.classList\.toggle\('hidden', !open \|\| mode !== 'join'\)/);
    assert.match(s, /open \? 'au_sub_signup_open' : 'au_sub_signup'/);
  });
  test('applyJoinMode swaps code ↔ picker and moves `required` so a hidden input never blocks the form', () => {
    const s = sliceFn(auth, 'applyJoinMode', 'auth.js');
    assert.match(s, /codeField\.classList\.toggle\('hidden', open\)/);
    assert.match(s, /pickField\.classList\.toggle\('hidden', !open\)/);
    assert.match(s, /codeInput\.required = !open/);
    assert.match(s, /open \? 'au_sub_join_open' : 'au_sub_join'/);
  });
  test('handleSignup sends workspace_id for an open join and refuses an empty pick client-side', () => {
    const s = sliceFn(auth, 'handleSignup', 'auth.js');
    assert.match(s, /workspace_id:\s*signupOptions\.openSignup && mode === 'join' \? pickedWs : undefined/);
    assert.match(s, /t\(signupOptions\.workspaces\.length \? 'auth_pick_required' : 'auth_no_workspaces_yet'\)/);
  });
  test('handleJoinWorkspace posts workspace_id in open signup, the invite code otherwise', () => {
    const s = sliceFn(auth, 'handleJoinWorkspace', 'auth.js');
    assert.match(s, /open \? \{ workspace_id: wsId \} : \{ invite_code: code \}/);
    assert.match(s, /t\(open \? 'auth_pick_required' : 'auth_code_required'\)/);
  });
  test('the workspace modals refresh the options when opened; the create modal hides its code field', () => {
    assert.match(sliceFn(auth, 'openJoinWorkspaceModal', 'auth.js'), /await loadSignupOptions\(\);\s*applyJoinMode\(document\.getElementById\('join-workspace-modal'\)\)/);
    assert.match(sliceFn(auth, 'showJoinWorkspace', 'auth.js'), /applyJoinMode\(document\.getElementById\('auth-view-join-workspace'\)\)/);
    assert.match(sliceFn(auth, 'openCreateWorkspaceModal', 'auth.js'), /'cw-code-field'\)\?\.classList\.toggle\('hidden', signupOptions\.openSignup\)/);
  });
  test('workspace names go through esc() into the <option>s', () => {
    assert.match(sliceFn(auth, 'fillWorkspaceSelect', 'auth.js'), /<option value="\$\{Number\(w\.id\)\}">\$\{esc\(w\.name\)\}<\/option>/);
  });
});

describe('dictionary', () => {
  for (const k of ['au_sub_signup_open', 'auth_pick_workspace', 'auth_pick_workspace_help', 'auth_no_workspaces_yet', 'auth_join_all_joined', 'auth_pick_required', 'au_sub_join_open']) {
    test(k, () => { assert.ok(dict.en[k] && dict.de[k], k); assert.notEqual(dict.en[k], dict.de[k]); });
  }
  test('the German reads impersonally (the login page rule)', () => {
    for (const k of ['au_sub_signup_open', 'auth_pick_workspace_help', 'auth_no_workspaces_yet', 'auth_join_all_joined', 'auth_pick_required', 'au_sub_join_open']) assert.doesNotMatch(dict.de[k], /\b[Dd]u\b|\b[Dd]ich\b|\b[Dd]ein/, k);
  });
});
