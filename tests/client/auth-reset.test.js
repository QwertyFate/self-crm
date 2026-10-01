// CLIENT tests for logging out and in again without a reload: the browser must
// go back to the state it has on a fresh page load, so the next user never sees
// the previous user's workspace. Static checks on the auth flow, plus the real
// resetClientState() run in a sandbox with every workspace-scoped global seeded.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const auth  = read('public/js/auth.js');
const notif = read('public/js/notifications.js');
const clock = read('public/js/clock.js');

// Every module-level value that holds workspace or user data, with the value a fresh load gives it.
const INITIAL = {
  currentUser: null, currentWorkspace: null,
  contacts: [], stages: [], fields: [], activities: [], members: [],
  pipelines: [], deals: [], dealFields: [], dealColumns: [], currentPipelineId: null, dragDealId: null,
  kanbanFields: ['company', 'email'], dealKanbanFields: ['contact', 'value'], contactColumns: [], colWidths: {},
  objects: [], objectFields: [], objectColumns: [], objCurrentPage: 1,
  tasks: [], taskProjects: [], currentProjectId: null, currentListId: null, currentProject: null, taskFields: [], taskLinkOptionsCache: null,
  analyticsData: null, trendRawData: null, calEvents: [],
  intgData: null, engineData: null, activeGuideId: null, activeCustomKeys: [],
  currentSettingsTab: 'workspace', currentIntgTab: 'webhook',
  currentContactType: 'contact', filteredContacts: [], kanbanAllContacts: [], selectionModeOn: false,
  currentPage: 1, sortKey: null, sortDir: 'asc', activeFilters: {}, filterPanelOpen: false,
  notifPanelOpen: false, onlineUsers: [], chatOldestId: null, chatNewestId: null, chatOpen: false, chatPageOpen: false, chatLoadingMore: false,
};
// Workspace-1-looking values to seed before the reset.
const SEEDED = {
  currentUser: { id: 1, role: 'owner' }, currentWorkspace: { id: 1, name: 'WS One' },
  contacts: [{ id: 1 }], stages: [{ id: 1 }], fields: [{ id: 1 }], activities: [{ id: 1 }], members: [{ id: 1 }],
  pipelines: [{ id: 11 }], deals: [{ id: 5 }], dealFields: [{ id: 2 }], dealColumns: [{ key: 'value', visible: true }], currentPipelineId: 11, dragDealId: 5,
  kanbanFields: ['phone'], dealKanbanFields: ['value'], contactColumns: [{ key: 'email' }], colWidths: { name: 200 },
  objects: [{ id: 3 }], objectFields: [{ id: 4 }], objectColumns: [{ key: 'x' }], objCurrentPage: 3,
  tasks: [{ id: 9 }], taskProjects: [{ id: 2 }], currentProjectId: 2, currentListId: 7, currentProject: { id: 2 }, taskFields: [{ id: 1 }], taskLinkOptionsCache: { deals: [] },
  analyticsData: { total: 1 }, trendRawData: { x: 1 }, calEvents: [{ id: 1 }],
  intgData: { webhook: {} }, engineData: { engine: {} }, activeGuideId: 'zapier', activeCustomKeys: ['k'],
  currentSettingsTab: 'team', currentIntgTab: 'engine',
  currentContactType: 'supplier', filteredContacts: [{ id: 1 }], kanbanAllContacts: [{ id: 1 }], selectionModeOn: true,
  currentPage: 4, sortKey: 'name', sortDir: 'desc', activeFilters: { stage: '1' }, filterPanelOpen: true,
  notifPanelOpen: true, onlineUsers: [{ id: 1 }], chatOldestId: 3, chatNewestId: 9, chatOpen: true, chatPageOpen: true, chatLoadingMore: true,
};

describe('auth flow', () => {
  test('logout resets the client state before showing the login screen', () => {
    const s = sliceFn(auth, 'logout', 'auth.js');
    assert.match(s, /await api\.post\('\/api\/auth\/logout'/);
    assert.ok(s.indexOf('resetClientState()') > 0 && s.indexOf('resetClientState()') < s.indexOf('showAuth()'), 'reset, then showAuth');
    assert.doesNotMatch(s, /contacts = stages = fields/, 'the old partial reset is gone');
  });
  test('entering the app always lands on a freshly loaded Deals page', () => {
    const s = sliceFn(auth, 'showApp', 'auth.js');
    assert.match(s, /switchPage\('deals'\)/);
    assert.doesNotMatch(s, /\bloadDeals\(\)/, 'the page switch loads deals; no bare loader call that leaves the previous page active');
  });
  test('login and workspace selection set every workspace-scoped column list', () => {
    for (const fn of ['handleLogin', 'selectWorkspace', 'init']) {
      const s = sliceFn(auth, fn, 'auth.js');
      for (const v of ['kanbanFields', 'contactColumns', 'dealColumns', 'objectColumns']) assert.match(s, new RegExp(`\\b${v}\\s*=`), `${fn} sets ${v}`);
    }
  });
  test('background work can be stopped and never stacks', () => {
    assert.match(sliceFn(notif, 'startNotifPolling', 'notifications.js'), /clearInterval\(notifPollTimer\)/, 'a second start replaces the first interval');
    assert.match(sliceFn(clock, 'stopClock', 'clock.js'), /clearInterval\(clockTimer\)/);
    assert.match(sliceFn(clock, 'startClock', 'clock.js'), /clearInterval\(clockTimer\)/);
  });
  test('resetClientState names every workspace-scoped global, the socket, the timers and the per-workspace storage keys', () => {
    const s = sliceFn(auth, 'resetClientState', 'auth.js');
    for (const name of Object.keys(INITIAL)) assert.match(s, new RegExp(`\\b${name}\\s*=`), name);
    assert.match(s, /socket\.disconnect\(\)/);
    assert.match(s, /socket = null/);
    assert.match(s, /stopNotifPolling\(\)/);
    assert.match(s, /stopClock\(\)/);
    assert.match(s, /updateChatBadge\(0\)/);
    assert.match(s, /localStorage\.removeItem\('lastTaskListId'\)/);
    assert.match(s, /proj-collapsed-/);
    for (const keep of ['dealViewMode', 'taskViewMode', "'lang'", "'theme'"]) assert.ok(!s.includes(keep), `${keep} is a browser preference and stays`);
  });
});

describe('resetClientState in a sandbox', () => {
  const extra = `
    const __calls = [];
    function stopNotifPolling() { __calls.push('stopNotifPolling'); }
    function stopClock() { __calls.push('stopClock'); }
    function updateChatBadge(n) { __calls.push('badge:' + n); }
    let socket = { disconnected: false, disconnect() { this.disconnected = true; __calls.push('socket.disconnect'); } };
    const __sock = socket;
    let collapsedTasks = new Set([1, 2]);
    let selectedContactIds = new Set([1]);
    const localStorage = Object.create({ removeItem(k) { delete this[k]; } });
    Object.assign(localStorage, { lastTaskListId: '7', 'proj-collapsed-2': '1', 'proj-collapsed-9': '1', dealViewMode: 'list', taskViewMode: 'board', lang: 'de', theme: 'dark', crm_guide_seen_v1: '1' });
    const document = { getElementById: () => null };
    function __snapshot() { return { state: { ${Object.keys(INITIAL).join(', ')} }, calls: __calls, socket, sockDisconnected: __sock.disconnected, storage: Object.keys(localStorage), collapsedTasks: collapsedTasks.size, selectedContactIds: selectedContactIds.size }; }
  `;
  const F = loadFns('public/js/auth.js', ['resetClientState', '__snapshot'], { state: SEEDED, extra });

  test('every workspace-scoped value is back to its fresh-load value', () => {
    F.resetClientState();
    const after = F.__snapshot();
    assert.deepEqual(after.state, INITIAL);
    assert.equal(after.collapsedTasks, 0);
    assert.equal(after.selectedContactIds, 0);
  });
  test('the socket is disconnected and dropped, polling and clock stopped, badge cleared', () => {
    const after = F.__snapshot();
    assert.equal(after.socket, null);
    assert.equal(after.sockDisconnected, true);
    for (const c of ['stopNotifPolling', 'stopClock', 'socket.disconnect', 'badge:0']) assert.ok(after.calls.includes(c), c);
  });
  test('only per-workspace storage keys are removed; browser preferences stay', () => {
    const keys = F.__snapshot().storage;
    assert.deepEqual(keys.sort(), ['crm_guide_seen_v1', 'dealViewMode', 'lang', 'taskViewMode', 'theme']);
  });
});
