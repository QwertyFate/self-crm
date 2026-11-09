// CLIENT (static + sandboxed) tests: the master CRM's screens (MASTER_ACCESS_CHANGES Parts 2–4, 2026-11-09).
//   Part 2  the admin console's "CRM access" tab: the secret (a masked TEXT field, so Chrome offers no save), the
//           button that opens the CRM through POST /api/admin/crm-login, and the access log from GET /crm-log.
//   Part 3  the CRM for a master session: the picker with every workspace under its own heading and a way back to
//           the console; the Workspaces page adds no workspace; a switch reloads (another owner); logout goes back
//           to the console.
//   Part 4  the banner above the top bar: the workspace and the owner it is open as, "Alle Arbeitsbereiche" and
//           "Beenden" (POST /api/admin/crm-leave, then the console).
// The server side is pinned in tests/routes/master-access.test.js.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFns, sliceConst } = require('../helpers/client-fn');

const admin  = read('public/admin.html');
const inline = admin.slice(admin.lastIndexOf('<script>'), admin.lastIndexOf('</script>'));
const panel  = admin.slice(admin.indexOf('<div id="tab-crm"'), admin.indexOf('<!-- /#tab-crm -->'));
const index  = read('public/index.html');
const css    = read('public/style.css');
const T = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

// a tiny DOM stand-in: elements by id, each with a classList and a dataset
const DOM = `
  const els = {};
  function el(id) {
    if (!els[id]) {
      const cls = new Set(['hidden']);
      els[id] = { id, innerHTML: '', textContent: '', value: '', disabled: false, dataset: {},
        classList: { toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); }, add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
        querySelector: sel => el(id + ' ' + sel) };
    }
    return els[id];
  }
  const document = { getElementById: el };
  const window = { location: { href: '', search: '', reload() { window.reloaded = true; } }, reloaded: false };
  const calls = [];`;

describe('Part 2: the console tab', () => {
  test('a sixth tab after Engine Monitor, its hidden panel, and showAdminTab loads the log', () => {
    assert.match(admin, /id="tabbtn-monitor"[^>]*>Engine Monitor<\/button>\s*<button class="admin-tab"\s+id="tabbtn-crm"\s+onclick="showAdminTab\('crm'\)">CRM access<\/button>/);
    assert.match(admin, /<div id="tab-crm" class="hidden">/);
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine', 'monitor', 'crm'\]\)/);
    assert.match(inline, /if \(name === 'crm'\) loadCrmLog\(\);/);
  });

  test('the secret is a masked TEXT field (no save prompt), and Enter opens the CRM too', () => {
    const input = /<input [^>]*id="crm-secret"[^>]*>/.exec(panel)[0];
    assert.match(input, /type="text"/);
    assert.match(input, /class="crm-secret-input"/);
    assert.match(input, /autocomplete="off"/);
    assert.match(input, /onkeydown="if \(event\.key === 'Enter'\) openMasterCrm\(\)"/);
    assert.match(admin, /\.crm-secret-input \{ -webkit-text-security: disc; \}/);
    assert.match(panel, /id="crm-open-btn" onclick="openMasterCrm\(\)">Open the CRM<\/button>/);
    assert.match(panel, /<th>Workspace<\/th><th>Opened as<\/th><th>Entered<\/th><th>Left<\/th><th>IP<\/th>/);
    assert.match(panel, /id="crm-log-body"/);
  });

  test('openMasterCrm: posts the secret to /crm-login and follows the redirect; a refusal shows the error and stays', async () => {
    const F = loadFns('public/admin.html', ['openMasterCrm', 'esc'], {
      state: { API_BASE: '/api/admin' },
      extra: DOM + `
        let answer = { ok: true, body: { success: true, redirect: '/' } };
        async function fetch(url, opts) { calls.push({ url, opts }); return { ok: answer.ok, json: async () => answer.body }; }
        function __probe() { return { els, window, calls }; }
        function __answer(a) { answer = a; }`,
      expose: ['__probe', '__answer'],
    });
    const doc = F.__probe();
    doc.els['crm-secret']   = { value: 'S3cret' };
    doc.els['crm-error']    = { innerHTML: '' };
    doc.els['crm-open-btn'] = { disabled: false };
    // the right secret: one POST, then the CRM
    await F.openMasterCrm();
    assert.equal(doc.calls.length, 1);
    assert.equal(doc.calls[0].url, '/api/admin/crm-login');
    assert.equal(doc.calls[0].opts.method, 'POST');
    assert.deepEqual(JSON.parse(doc.calls[0].opts.body), { secret: 'S3cret' });
    assert.equal(doc.window.location.href, '/');
    assert.equal(doc.els['crm-secret'].value, '');
    // a refusal
    doc.window.location.href = '';
    doc.els['crm-secret'].value = 'wrong';
    F.__answer({ ok: false, body: { error: 'Invalid admin secret.' } });
    await F.openMasterCrm();
    assert.match(doc.els['crm-error'].innerHTML, /Invalid admin secret\./);
    assert.equal(doc.window.location.href, '');
    assert.equal(doc.els['crm-open-btn'].disabled, false);
  });

  test('renderCrmLog: escaped names, "still open" for an open visit, and the empty and failed states', () => {
    const F = loadFns('public/admin.html', ['renderCrmLog', 'fmtVisitTime', 'esc']);
    const html = F.renderCrmLog([
      { workspace_name: '<b>Acme</b>', user_name: 'Maria & Co', entered_at: '2026-11-09T10:00:00Z', left_at: null, ip: '1.2.3.4' },
      { workspace_name: 'Lotrecht', user_name: 'Jonas', entered_at: '2026-11-09T09:00:00Z', left_at: '2026-11-09T09:30:00Z', ip: null },
    ]);
    assert.match(html, /&lt;b&gt;Acme&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>Acme/);
    assert.match(html, /Maria &amp; Co/);
    assert.equal(html.split('still open').length - 1, 1);
    assert.match(F.renderCrmLog([]), /No visits yet\./);
    assert.match(F.renderCrmLog(null), /could not be loaded/);
  });
});

describe('Part 3: the CRM for a master session', () => {
  const authFns = names => loadFns('public/js/auth.js', names, {
    state: { masterSession: false, currentUser: null, currentWorkspace: null },
    extra: DOM + `
      const T = { au_title_picker: 'Arbeitsbereich wählen', au_sub_picker: 'Sub', au_title_picker_master: 'Plattform-Zugang', au_sub_picker_master: 'Jeder Arbeitsbereich …', ws_loading: '…', ws_load_error: 'x', ws_active: 'Aktiv', ws_current: 'Offen', ws_switch: 'Wechseln', ws_add_title: 'Hinzufügen', ws_join_or_create: 'J', ws_get_started: 'G' };
      const t = k => T[k] || k;
      const esc = s => String(s);
      const roleLabel = r => r;
      const icon = n => '[' + n + ']';
      const wsGradient = () => 'g';
      let answers = {};
      const api = { get: async url => { calls.push(['GET', url]); return answers[url]; }, post: async (url, body) => { calls.push(['POST', url, body]); return answers[url] || {}; } };
      function showAuthView(v) { calls.push(['view', v]); }
      function showAuth() { calls.push(['showAuth']); }
      function showApp() { calls.push(['showApp']); }
      function showResetForm() { calls.push(['reset']); }
      function resetClientState() { calls.push(['resetClientState']); }
      function startAppVersionWatch() {}
      function mailboxKeepReturn() {}
      function switchPage(p) { calls.push(['page', p]); }
      function __probe() { return { els, el, window, calls }; }
      function __answers(a) { answers = a; }`,
    expose: ['__probe', '__answers'],
  });

  test('init: a master session without a user gets the picker with every workspace', async () => {
    const F = authFns(['init', 'showWorkspacePicker']);
    const all = [{ id: 7, name: 'Acme', role: 'owner' }, { id: 8, name: 'Lotrecht', role: 'owner' }];
    F.__answers({ '/api/auth/me': { user: null, master: true, needs_workspace_picker: true, workspaces: all } });
    await F.init();
    const P = F.__probe();
    assert.deepEqual(P.calls.filter(c => c[0] === 'showAuth' || c[0] === 'view'), [['showAuth'], ['view', 'workspace-picker']]);
    assert.match(P.els['workspace-picker-list'].innerHTML, /selectWorkspace\(7\)/);
    assert.match(P.els['workspace-picker-list'].innerHTML, /selectWorkspace\(8\)/);
  });

  test('the picker: its own heading and the console link for master, the usual ones otherwise', () => {
    const F = authFns(['showWorkspacePicker']);
    const P = F.__probe();
    F.__set('masterSession', true);
    F.showWorkspacePicker([{ id: 7, name: 'Acme', role: 'owner' }], null);
    const title = P.els['auth-view-workspace-picker .au-title'], sub = P.els['auth-view-workspace-picker .au-sub'];
    assert.equal(title.dataset.i18n, 'au_title_picker_master');
    assert.equal(title.textContent, 'Plattform-Zugang');
    assert.equal(sub.dataset.i18n, 'au_sub_picker_master');
    assert.equal(P.els['workspace-picker-console'].classList.contains('hidden'), false);
    F.__set('masterSession', false);
    F.showWorkspacePicker([{ id: 7, name: 'Acme', role: 'owner' }], null);
    assert.equal(title.dataset.i18n, 'au_title_picker');
    assert.equal(P.els['workspace-picker-console'].classList.contains('hidden'), true);
  });

  test('the Workspaces page in master mode: every workspace, no "add" card, no "New Workspace" button', async () => {
    const F = authFns(['loadWorkspacesPage']);
    const P = F.__probe();
    P.el('ws-page-new-btn').classList.remove('hidden');
    F.__answers({ '/api/auth/my-workspaces': { workspaces: [{ id: 7, name: 'Acme', role: 'owner' }, { id: 8, name: 'Lotrecht', role: 'owner' }], master: true } });
    await F.loadWorkspacesPage();
    const grid = P.els['workspaces-grid'].innerHTML;
    assert.match(grid, /switchWorkspace\(7\)/);
    assert.match(grid, /switchWorkspace\(8\)/);
    assert.doesNotMatch(grid, /openAddWorkspaceChoice/);
    assert.equal(P.els['ws-page-new-btn'].classList.contains('hidden'), true);
    // an ordinary session keeps both
    F.__answers({ '/api/auth/my-workspaces': { workspaces: [{ id: 7, name: 'Acme', role: 'owner' }] } });
    await F.loadWorkspacesPage();
    assert.match(P.els['workspaces-grid'].innerHTML, /openAddWorkspaceChoice/);
    assert.equal(P.els['ws-page-new-btn'].classList.contains('hidden'), false);
  });

  test('a switch in master mode reloads the app (another owner); logout goes back to the console', async () => {
    const F = authFns(['switchWorkspace', 'logout']);
    const P = F.__probe();
    F.__set('masterSession', true);
    F.__set('currentWorkspace', { id: 7, name: 'Acme' });
    F.__answers({ '/api/auth/switch-workspace': { workspace: { id: 8 }, role: 'owner', user_id: 80 } });
    await F.switchWorkspace(8);
    assert.equal(P.window.reloaded, true);
    assert.deepEqual(P.calls.find(c => c[1] === '/api/auth/switch-workspace'), ['POST', '/api/auth/switch-workspace', { workspace_id: 8 }]);
    await F.logout();
    assert.ok(P.calls.some(c => c[0] === 'resetClientState'));
    assert.equal(P.window.location.href, '/adminconsole');
    assert.ok(!P.calls.some(c => c[0] === 'showAuth'), 'no login screen for the master CRM');
  });

  test('init and resetClientState carry the flag', () => {
    const src = read('public/js/auth.js');
    assert.match(src, /masterSession = !!data\.master;/);
    assert.match(src, /currentUser = null; currentWorkspace = null; masterSession = false;/);
    assert.match(read('public/js/core.js'), /^let masterSession {4}= false;$/m);
  });
});

describe('Part 4: the banner', () => {
  test('the markup: above the top bar, hidden until set, its words are keys, its buttons are wired', () => {
    const banner = /<div id="master-banner"[\s\S]*?<\/div>/.exec(index)[0];
    assert.ok(index.indexOf('id="master-banner"') < index.indexOf('<header class="topbar">'));
    assert.match(banner, /class="master-banner hidden" role="status"/);
    for (const k of ['master_label', 'master_as', 'master_all', 'master_end']) assert.match(banner, new RegExp(`data-i18n="${k}"`));
    assert.match(banner, /id="master-banner-ws"/);
    assert.match(banner, /id="master-banner-name"/);
    assert.match(banner, /onclick="switchPage\('workspaces'\)"/);
    assert.match(banner, /onclick="endMasterSession\(\)"/);
    assert.match(css, /\.master-banner \{ display: flex;[^}]*background: var\(--warning-bg\)/);
    assert.match(css, /^\.hidden \{ display: none !important; \}$/m);   // so the banner's own display cannot show it
    assert.match(index, /<div id="workspace-picker-console" class="au-aux hidden"><a href="\/adminconsole" data-i18n="au_back_console">/);
    assert.match(index, /id="ws-page-new-btn" onclick="openCreateWorkspaceModal\(\)"/);
  });

  test('renderMasterBanner: shown with the workspace and the owner for master, hidden and empty otherwise', () => {
    const F = loadFns('public/js/auth.js', ['renderMasterBanner'], {
      state: { masterSession: true, currentUser: { name: 'Maria Acme' }, currentWorkspace: { name: 'Acme GmbH' } },
      extra: DOM + 'function __probe() { return { els }; }',
      expose: ['__probe'],
    });
    F.renderMasterBanner();
    const P = F.__probe();
    assert.equal(P.els['master-banner'].classList.contains('hidden'), false);
    assert.equal(P.els['master-banner-ws'].textContent, 'Acme GmbH');
    assert.equal(P.els['master-banner-name'].textContent, 'Maria Acme');
    F.__set('masterSession', false);
    F.renderMasterBanner();
    assert.equal(P.els['master-banner'].classList.contains('hidden'), true);
    assert.equal(P.els['master-banner-ws'].textContent, '');
  });

  test('"Beenden": POST /api/admin/crm-leave, then the console', async () => {
    const F = loadFns('public/js/auth.js', ['endMasterSession'], {
      extra: DOM + `
        const api = { post: async (url, body) => { calls.push(['POST', url, body]); return { success: true }; } };
        function resetClientState() { calls.push(['resetClientState']); }
        function __probe() { return { window, calls }; }`,
      expose: ['__probe'],
    });
    await F.endMasterSession();
    const P = F.__probe();
    assert.deepEqual(P.calls[0], ['POST', '/api/admin/crm-leave', {}]);
    assert.deepEqual(P.calls[1], ['resetClientState']);
    assert.equal(P.window.location.href, '/adminconsole');
  });

  test('showApp renders the banner; every new word exists in en and de', () => {
    assert.match(read('public/js/auth.js'), /setSidebarWorkspace\(currentWorkspace\?\.name\);\n {2}renderMasterBanner\(\);/);
    for (const k of ['au_title_picker_master', 'au_sub_picker_master', 'au_back_console', 'master_label', 'master_as', 'master_all', 'master_end']) {
      assert.ok(T.en[k], `en ${k}`);
      assert.ok(T.de[k], `de ${k}`);
      assert.notEqual(T.en[k], T.de[k], k);
    }
  });
});
