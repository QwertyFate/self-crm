// CLIENT tests for the tick box "Members only see the deals and contacts assigned to them"
// (MEMBER_VISIBILITY_CHANGES Part 1, 2026-11-25): Settings → Team, shown to owners and admins.
//
// Static reads of the page plus the real saveOwnOnly() run against stand-ins for the page and the server.
// Not a browser: that the card looks right is not shown here.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/settings.js');
const core = read('public/js/core.js');
const KEYS = ['set_visibility', 'hint_visibility', 'own_only_toggle', 'own_only_note', 'own_only_not_saved', 'imp_skipped_one', 'imp_skipped_many'];

describe('the card in Settings → Team', () => {
  const pane = html.slice(html.indexOf('id="settings-pane-team"'), html.indexOf('id="settings-pane-integrations"'));
  const card = pane.slice(pane.indexOf('id="visibility-card"'));
  test('it is in the Team pane (admins cannot open the Workspace tab) and hidden until the script shows it', () => {
    assert.match(pane, /<div class="settings-card hidden" id="visibility-card">/);
    assert.equal(html.split('id="visibility-card"').length, 2, 'once in the page');
  });
  test('one tick box that saves itself, with a place for the answer', () => {
    assert.match(card, /<input type="checkbox" id="own-only-toggle" class="switch" onchange="saveOwnOnly\(\)">/);
    assert.match(card, /id="own-only-msg" class="workspace-name-msg hidden"/);
    assert.doesNotMatch(card.slice(0, card.indexOf('own-only-msg')), /\bchecked\b/, 'off until the workspace says otherwise');
  });
  test('it says who always sees everything and what happens to unassigned deals and leads', () => {
    for (const key of ['set_visibility', 'hint_visibility', 'own_only_toggle', 'own_only_note']) assert.ok(card.includes(`data-i18n="${key}"`), key);
  });
  test('the line "still shows everything for now" is gone with the last piece (Parts 2–3): page and dictionary', () => {
    assert.doesNotMatch(html + core, /own_only_partial/);
  });
  test('every text is in the dictionary twice: English and German, each once', () => {
    for (const key of KEYS) assert.equal(core.split(`${key}:'`).length - 1, 2, key);
    const de = core.slice(core.indexOf("own_only_toggle:'Mitglieder"));
    assert.doesNotMatch(de.slice(0, 900), /\b(du|dir|dein|deine|Sie|Ihre|Ihnen)\b/, 'German stays impersonal');
  });
});

describe('loadSettings shows and ticks it', () => {
  const load = sliceFn(js, 'loadSettings', 'settings.js');
  test('shown to whoever manages invites (owner, admin), hidden from members', () => {
    assert.match(load, /getElementById\('visibility-card'\)\?\.classList\.toggle\('hidden', !canManageInvites\)/);
    assert.match(load, /const canManageInvites = isOwner \|\| currentUser\?\.role === 'admin'/);
  });
  test('ticked only when the workspace really has it on', () => {
    assert.match(load, /ownOnlyEl\.checked = currentWorkspace\?\.members_own_only === true/);
  });
});

describe('saveOwnOnly', () => {
  const PAGE = `
    const sent = [], timers = [];
    const box = { checked: false, disabled: false };
    const msg = { textContent: '', className: '', classList: { hidden: true, add() { this.hidden = true; }, remove() { this.hidden = false; } } };
    const document = { getElementById: id => (id === 'own-only-toggle' ? box : id === 'own-only-msg' ? msg : null) };
    const api = { patch: async (url, body) => { sent.push([url, body, box.disabled]); return answer; } };
    const t = k => k;
    const setTimeout = fn => timers.push(fn);
    function probe() { return { sent, box, msg, currentWorkspace, timers }; }`;
  const F = answer => loadFns('public/js/settings.js', ['saveOwnOnly'], { state: { currentWorkspace: { members_own_only: false }, answer }, extra: PAGE, expose: ['probe'] });

  test('ticking sends true to the one route, with the box locked meanwhile, and remembers it', async () => {
    const f = F({ success: true, own_only: true });
    f.probe().box.checked = true;
    await f.saveOwnOnly();
    const p = f.probe();
    assert.deepEqual(p.sent, [['/api/workspace/member-visibility', { own_only: true }, true]]);
    assert.equal(p.box.disabled, false);
    assert.equal(p.currentWorkspace.members_own_only, true);
    assert.deepEqual([p.msg.textContent, p.msg.className, p.msg.classList.hidden], ['msg_saved', 'workspace-name-msg success', false]);
    p.timers[0](); assert.equal(p.msg.classList.hidden, true);
  });
  test('unticking sends false', async () => {
    const f = F({ success: true, own_only: false });
    f.__set('currentWorkspace', { members_own_only: true });
    await f.saveOwnOnly();
    assert.deepEqual(f.probe().sent[0][1], { own_only: false });
    assert.equal(f.probe().currentWorkspace.members_own_only, false);
  });
  for (const [name, answer] of [['a refusal', { error: 'Owner or admin only' }], ['no answer at all', null]]) {
    test(`${name}: the box goes back, the workspace is not changed, and it says so in the user's language`, async () => {
      const f = F(answer);
      f.probe().box.checked = true;
      await f.saveOwnOnly();
      const p = f.probe();
      assert.equal(p.box.checked, false);
      assert.equal(p.box.disabled, false);
      assert.equal(p.currentWorkspace.members_own_only, false);
      assert.deepEqual([p.msg.textContent, p.msg.className, p.msg.classList.hidden], ['own_only_not_saved', 'workspace-name-msg error', false]);
    });
  }
});

describe('the contact import says what it left out', () => {
  const imp = read('public/js/admin-import.js');
  test('rows left out because their email is somebody else\'s contact are counted in the result line', () => {
    assert.match(imp, /const skipped = res\.skipped \|\| 0;/);
    assert.match(imp, /if \(skipped > 0\) message \+= ' ' \+ tf\(skipped === 1 \? 'imp_skipped_one' : 'imp_skipped_many', \{ n: skipped \}\)/);
  });
});
