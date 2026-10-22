// CLIENT (pure-function) tests for switching workspace inside the app (public/js/auth.js switchWorkspace, 2026-10-21).
// Bug: the chat's socket.io connection is joined to a workspace once, when it connects (server.js reads the session at
// the handshake), and switchWorkspace never touched it. After a switch without a reload, live chat and the online list
// stayed on the previous workspace, and messages sent went there. Also the new workspace's notification preferences
// (one users row per workspace) were not taken over. Pinned: a successful switch closes the old connection, starts the
// chat's state over for the new workspace, opens a new connection (which the server joins to the new workspace) only
// after the server switched the session, refreshes the unread count, and takes the new row's preferences, role and id;
// a refused switch changes nothing.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns } = require('../helpers/client-fn');

function setup(answer) {
  const extra = `
    const __calls = [];
    const api = { post: async (u, b) => { __calls.push(['post', u, b]); return ${JSON.stringify(answer)}; } };
    const document = { getElementById: () => null };
    function setSidebarWorkspace(n) { __calls.push(['sidebar', n]); }
    function invalidate() { __calls.push(['invalidate']); }
    async function switchPage(p) { __calls.push(['page', p]); }
    function initChatSocket() { __calls.push(['initChatSocket', socket]); socket = { id: 'new' }; }
    function refreshChatBadge() { __calls.push(['refreshChatBadge']); }
    function alert(m) { __calls.push(['alert', m]); }
    function __get() { return { socket, currentUser, onlineUsers, chatOldestId, chatNewestId, chatPageOpen, chatLoadingMore }; }`;
  const F = loadFns('public/js/auth.js', ['switchWorkspace'], {
    state: { currentWorkspace: { id: 1, name: 'One' }, currentUser: { id: 11, role: 'owner', notification_prefs: { deals: false } }, kanbanFields: [], contactColumns: [], objectColumns: [], socket: null, onlineUsers: [{ id: 3 }], chatOldestId: 40, chatNewestId: 90, chatPageOpen: true, chatLoadingMore: true },
    extra, expose: ['__calls', '__get'],
  });
  const oldSocket = { id: 'old', disconnected: 0, disconnect() { this.disconnected++; } };
  F.__set('socket', oldSocket);
  return { F, oldSocket };
}
const OK = { workspace: { id: 2, name: 'Two', kanban_fields: null, contact_columns: null, object_columns: null }, role: 'member', user_id: 12, notification_prefs: { tasks: false } };

describe('switching workspace', () => {
  test('the chat leaves the old workspace: the old connection closed, a new one opened after the session switched, the unread count refreshed', async () => {
    const { F, oldSocket } = setup(OK);
    await F.switchWorkspace(2);
    assert.equal(oldSocket.disconnected, 1, 'the old connection is closed');
    const order = F.__calls.map(c => c[0]);
    assert.ok(order.includes('initChatSocket'), 'a new connection, which the server joins to the new workspace');
    assert.ok(order.indexOf('post') < order.indexOf('initChatSocket'), 'only after the server switched the session');
    assert.equal(F.__calls.find(c => c[0] === 'initChatSocket')[1], null, 'initChatSocket finds no socket, so it really opens a new one');
    assert.equal(F.__get().socket.id, 'new');
    assert.ok(order.includes('refreshChatBadge'));
  });
  test('the chat starts over for the new workspace: nobody online yet, no message markers, the chat page not open', async () => {
    const { F } = setup(OK);
    await F.switchWorkspace(2);
    const s = F.__get();
    assert.deepEqual({ online: s.onlineUsers, oldest: s.chatOldestId, newest: s.chatNewestId, open: s.chatPageOpen, more: s.chatLoadingMore }, { online: [], oldest: null, newest: null, open: false, more: false });
  });
  test('the new workspace\'s own notification preferences, role and user id are taken over ({} when none were saved)', async () => {
    const { F } = setup(OK);
    await F.switchWorkspace(2);
    assert.deepEqual(F.__get().currentUser, { id: 12, role: 'member', notification_prefs: { tasks: false } });
    const { F: G } = setup({ ...OK, notification_prefs: undefined });
    await G.switchWorkspace(2);
    assert.deepEqual(G.__get().currentUser.notification_prefs, {});
  });
  test('a refused switch changes nothing: no reconnect, no badge refresh, the chat state kept', async () => {
    const { F, oldSocket } = setup({ error: 'Not a member of this workspace' });
    await F.switchWorkspace(3);
    assert.equal(oldSocket.disconnected, 0);
    assert.ok(!F.__calls.some(c => c[0] === 'initChatSocket' || c[0] === 'refreshChatBadge'));
    assert.equal(F.__get().chatNewestId, 90);
  });
  test('the same workspace: nothing but the Deals page', async () => {
    const { F, oldSocket } = setup(OK);
    await F.switchWorkspace(1);
    assert.equal(oldSocket.disconnected, 0);
    assert.deepEqual(F.__calls, [['page', 'deals']]);
  });
});
