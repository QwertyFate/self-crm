/* ═══════════════════════════════════════════════════════════════════════════
   AUTH + APP SHELL — getting in, choosing a workspace, and page navigation.
   This file owns the app's lifecycle. Loaded second, right after core.js.

   THE ENTRY POINT is init(), called once when index.html finishes loading:

     init()
       ├─ ?admin in the URL  → the in-app admin screen (admin-import.js)
       ├─ ?reset=<token>     → the password-reset form
       ├─ GET /api/auth/me   → logged in?  yes → showApp()   no → showAuth()
       └─ showApp() fills currentUser / currentWorkspace, paints the shell, and
          calls switchPage('deals'). Every session starts on Deals, never on
          whatever page the previous user left open.

   switchPage(page) IS THE ROUTER. There is no URL routing in this app: it
   hides every .page section, shows one, and calls that page's loader
   (loadDeals, loadContacts, loadTasks, …). To add a page: add the section to
   index.html, the sidebar link, and one line here.

   WORKSPACES — THE PART THAT SURPRISES PEOPLE
     A person with three workspaces has THREE rows in the users table, one per
     workspace, sharing an email and password hash. Switching workspace changes
     session.userId on the server to the other row's id. So a user id is only
     meaningful together with a workspace.
       login  → one membership  : straight in
              → several         : showWorkspacePicker() → selectWorkspace()
       inside : switchWorkspace() → POST /api/auth/switch-workspace → reload

   resetClientState() PUTS THE TAB BACK TO BOOT STATE — stops pollers and the
   socket, clears every workspace-scoped global and the per-workspace
   localStorage keys. It runs on logout and on workspace switch.
   ⚠ ADD A NEW GLOBAL ANYWHERE IN public/js → ADD IT HERE TOO. Forgetting is
   how one user's data leaks into the next user's session in the same tab.

   ensureFields / ensureContacts / ensureMembers / ensurePipelines are lazy
   caches: they fetch only when the array is still empty. invalidate() empties
   them so the next ensureX() refetches.

   FUNCTION MAP
     lifecycle   init, showApp, showAuth, showAuthView, switchPage,
                 resetClientState, invalidate, logout
     login       handleLogin, handleSignup, toggleSignupMode,
                 showForgotPassword, handleForgotPassword, copyResetLink,
                 showResetForm, handleResetPassword, showMainAuth
     workspaces  showWorkspacePicker, selectWorkspace, switchWorkspace,
                 loadWorkspacesPage, wsGradient, openAddWorkspaceChoice,
                 pickAddWorkspace, openCreateWorkspaceModal,
                 closeCreateWorkspaceModal, handleCreateWorkspace,
                 openJoinWorkspaceModal, showJoinWorkspace, closeJoinWorkspace,
                 handleJoinWorkspace
     caches      ensureFields, ensureContacts, ensureMembers, ensurePipelines

   ⚠ handleCreateWorkspace posts to /api/workspace, which stores the literal
     string 'placeholder' as the new users row's password_hash. See §8 of
     readmedev.md before touching it.
   ═══════════════════════════════════════════════════════════════════════════ */

async function init() {
  const params     = new URLSearchParams(window.location.search);
  const resetToken = params.get('reset');

  if (params.has('admin')) {
    document.getElementById('admin-screen').classList.remove('hidden');
    const { isAdmin } = await api.get('/api/admin/me');
    document.getElementById('admin-view-login').classList.toggle('hidden', isAdmin);
    document.getElementById('admin-view-panel').classList.toggle('hidden', !isAdmin);
    if (isAdmin) loadAdminInvites();
    return;
  }

  const data = await api.get('/api/auth/me');
  if (data.user && !resetToken) {
    currentUser      = data.user;
    currentWorkspace = data.workspace;
    kanbanFields     = data.workspace.kanban_fields    || ['company', 'email'];
    contactColumns   = data.workspace.contact_columns  || [];
    dealColumns      = Array.isArray(data.user?.deal_columns) ? data.user.deal_columns : [];
    objectColumns    = data.workspace.object_columns   || [];
    showApp();
  } else {
    showAuth();
    if (resetToken) showResetForm(resetToken);
  }
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  ['login-form', 'signup-form'].forEach(id => document.getElementById(id).reset());
  ['login-error', 'signup-error', 'forgot-error', 'forgot-success', 'forgot-link-box'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );
  document.getElementById('forgot-btn').disabled = false;
  document.getElementById('reset-error').classList.add('hidden');
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'login'));
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  const createRadio = document.querySelector('input[name="signup-mode"][value="create"]');
  if (createRadio) { createRadio.checked = true; toggleSignupMode(); }
  showAuthView('main');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  window.history.replaceState({}, '', window.location.pathname);
  setSidebarWorkspace(currentWorkspace?.name);
  const settingsLabel = document.getElementById('settings-workspace-label');
  if (settingsLabel) settingsLabel.textContent = currentWorkspace?.name || '';
  document.getElementById('sidebar-user').textContent = currentUser?.name || '';
  const av = document.getElementById('sidebar-user-avatar');
  if (av) av.textContent = (currentUser?.name || '?')[0].toUpperCase();
  const roleEl = document.getElementById('sidebar-user-role');
  if (roleEl) roleEl.textContent = currentUser?.role ? (t(`role_${currentUser.role}`) === `role_${currentUser.role}` ? currentUser.role : t(`role_${currentUser.role}`)) : '';
  applyRailState();
  applyTranslations();
  loadColWidths();
  updateBoardNavVisibility();
  updateObjectsNav();
  updateSuppliersNav();
  loadNotifPrefs();
  startNotifPolling();
  startClock();
  switchPage('deals');   // every entry lands on a freshly loaded Deals page, never on whatever page the previous user left active
  initChatSocket();
  refreshChatBadge();
  setTimeout(maybeStartGuide, 800);
}

function showAuthView(view) {
  ['main','forgot','reset','workspace-picker','join-workspace'].forEach(v =>
    document.getElementById(`auth-view-${v}`)?.classList.toggle('hidden', v !== view)
  );
  document.querySelector('.auth-tabs').classList.toggle('hidden', view !== 'main');
}

function showForgotPassword(e) {
  e?.preventDefault();
  document.getElementById('forgot-email').value = document.getElementById('login-email').value;
  document.getElementById('forgot-error').classList.add('hidden');
  document.getElementById('forgot-success').classList.add('hidden');
  document.getElementById('forgot-link-box').classList.add('hidden');
  document.getElementById('forgot-btn').disabled = false;
  showAuthView('forgot');
}

function showMainAuth(e) { e?.preventDefault(); showAuthView('main'); }

function showResetForm(token) {
  document.getElementById('reset-token').value = token;
  document.getElementById('reset-error').classList.add('hidden');
  showAuthView('reset');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('signup-form').classList.toggle('hidden', isLogin);
  });
});

function toggleSignupMode() {
  const mode = document.querySelector('input[name="signup-mode"]:checked').value;
  document.getElementById('su-workspace-field').classList.toggle('hidden', mode !== 'create');
  document.getElementById('su-platform-code-field').classList.toggle('hidden', mode !== 'create');
  document.getElementById('su-code-field').classList.toggle('hidden', mode !== 'join');
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const data = await api.post('/api/auth/login', {
    email:    document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }

  if (data.needs_workspace_picker) {
    showWorkspacePicker(data.workspaces, data.user);
    return;
  }

  currentUser      = data.user;
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  dealColumns      = Array.isArray(data.user?.deal_columns) ? data.user.deal_columns : [];
  objectColumns    = data.workspace.object_columns  || [];
  showApp();
}

function showWorkspacePicker(workspaces, user) {
  showAuthView('workspace-picker');
  document.getElementById('workspace-picker-list').innerHTML = workspaces.map(w => `
    <button class="workspace-picker-btn" onclick="selectWorkspace(${w.id})">
      <div class="workspace-picker-avatar">${(w.name||'?')[0].toUpperCase()}</div>
      <div>
        <div class="workspace-picker-name">${esc(w.name)}</div>
        <div class="workspace-picker-role">${roleLabel(w.role)}</div>
      </div>
    </button>`).join('');
}

async function selectWorkspace(workspaceId) {
  const errEl = document.getElementById('workspace-picker-error');
  errEl.classList.add('hidden');
  const data = await api.post('/api/auth/select-workspace', { workspace_id: workspaceId });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
  currentUser      = data.user;
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  dealColumns      = Array.isArray(data.user?.deal_columns) ? data.user.deal_columns : [];
  objectColumns    = data.workspace.object_columns  || [];
  showApp();
}

const WS_PALETTE = [
  ['#6366f1','#818cf8'], ['#3b82f6','#60a5fa'], ['#10b981','#34d399'],
  ['#f59e0b','#fbbf24'], ['#ef4444','#f87171'], ['#8b5cf6','#a78bfa'],
  ['#06b6d4','#22d3ee'], ['#f43f5e','#fb7185'],
];
function wsGradient(id) {
  const [c1, c2] = WS_PALETTE[(id - 1) % WS_PALETTE.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

async function loadWorkspacesPage() {
  const grid = document.getElementById('workspaces-grid');
  if (!grid) return;
  grid.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading…</p>';

  const data = await api.get('/api/auth/my-workspaces');
  if (!data || data.error) { grid.innerHTML = '<p style="color:var(--muted)">Could not load workspaces.</p>'; return; }

  const cards = data.workspaces.map(w => {
    const isActive = w.id === currentWorkspace?.id;
    const grad     = wsGradient(w.id);
    return `
    <div class="ws-page-card${isActive ? ' active' : ''}" onclick="switchWorkspace(${w.id})">
      <div class="ws-page-card-banner" style="background:${grad}">
        <div class="ws-page-avatar-lg">${(w.name||'?')[0].toUpperCase()}</div>
        ${isActive ? '<div class="ws-page-active-badge">Active</div>' : ''}
      </div>
      <div class="ws-page-card-body">
        <div class="ws-page-name">${esc(w.name)}</div>
        <div class="ws-page-role">${roleLabel(w.role)}</div>
      </div>
      <div class="ws-page-card-footer">
        <span class="ws-page-open-btn">${isActive ? 'Currently open' : `Switch ${icon('arrow-up-right', 'ic-sm')}`}</span>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = cards + `
    <div class="ws-page-card ws-page-add" onclick="openAddWorkspaceChoice()">
      <div class="ws-page-card-banner ws-page-add-banner">
        <div class="ws-page-add-icon">${icon('plus')}</div>
      </div>
      <div class="ws-page-card-body">
        <div class="ws-page-name">Add a Workspace</div>
        <div class="ws-page-role">Join or create</div>
      </div>
      <div class="ws-page-card-footer">
        <span class="ws-page-open-btn">Get started ${icon('arrow-up-right', 'ic-sm')}</span>
      </div>
    </div>`;
}

async function switchWorkspace(workspaceId) {
  if (workspaceId === currentWorkspace?.id) { await switchPage('deals'); return; }
  const data = await api.post('/api/auth/switch-workspace', { workspace_id: workspaceId });
  if (data.error) { alert(data.error); return; }
  currentWorkspace = data.workspace;
  // Users are per-workspace rows, so both the id and the role change on switch.
  if (currentUser && data.role)    currentUser.role = data.role;
  if (currentUser && data.user_id) currentUser.id   = data.user_id;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  objectColumns    = data.workspace.object_columns  || [];
  setSidebarWorkspace(data.workspace.name);
  const settingsLabel = document.getElementById('settings-workspace-label');
  if (settingsLabel) settingsLabel.textContent = data.workspace.name || '';
  invalidate();
  await switchPage('deals');
}

function openAddWorkspaceChoice() {
  document.getElementById('add-workspace-modal').classList.remove('hidden');
}

function pickAddWorkspace(type) {
  document.getElementById('add-workspace-modal').classList.add('hidden');
  if (type === 'join')   openJoinWorkspaceModal();
  if (type === 'create') openCreateWorkspaceModal();
}

function openJoinWorkspaceModal() {
  document.getElementById('join-ws-code').value = '';
  document.getElementById('join-ws-error').classList.add('hidden');
  document.getElementById('join-workspace-modal').classList.remove('hidden');
}

function openCreateWorkspaceModal(e) {
  e?.preventDefault();
  document.getElementById('cw-name').value = '';
  document.getElementById('cw-code').value = '';
  document.getElementById('cw-error').classList.add('hidden');
  document.getElementById('create-workspace-modal').classList.remove('hidden');
}

function closeCreateWorkspaceModal() {
  document.getElementById('create-workspace-modal').classList.add('hidden');
}

async function handleCreateWorkspace(e) {
  e.preventDefault();
  const errEl = document.getElementById('cw-error');
  errEl.classList.add('hidden');
  const data = await api.post('/api/workspace', {
    name:                  document.getElementById('cw-name').value.trim(),
    platform_invite_code:  document.getElementById('cw-code').value.trim(),
  });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
  closeCreateWorkspaceModal();
  window.location.reload();
}

function showJoinWorkspace(e) {
  e?.preventDefault();
  wsSwitcherOpen = false;
  document.getElementById('ws-dropdown').classList.add('hidden');
  document.getElementById('join-ws-code').value = '';
  document.getElementById('join-ws-error').classList.add('hidden');
  showAuthView('join-workspace');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function closeJoinWorkspace(e) {
  e?.preventDefault();
  showAuth();
  showApp();
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function handleJoinWorkspace(e) {
  e.preventDefault();
  const errEl = document.getElementById('join-ws-error');
  errEl.classList.add('hidden');
  const codeInput = document.querySelector('#join-workspace-modal input[id="join-ws-code"]');
  const code = (codeInput?.value || '').trim();
  if (!code) { errEl.textContent = 'Invite code required'; errEl.classList.remove('hidden'); return; }

  const data = await api.post('/api/auth/join-workspace', { invite_code: code });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }

  document.getElementById('join-workspace-modal').classList.add('hidden');
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  objectColumns    = data.workspace.object_columns  || [];
  setSidebarWorkspace(data.workspace.name);
  invalidate();
  loadWorkspacesPage();
  switchPage('workspaces');
}

async function handleSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  errEl.classList.add('hidden');
  const mode = document.querySelector('input[name="signup-mode"]:checked').value;
  const data = await api.post('/api/auth/signup', {
    mode,
    workspace_name:       document.getElementById('su-workspace').value,
    platform_invite_code: document.getElementById('su-platform-code').value,
    invite_code:          document.getElementById('su-code').value,
    name:                 document.getElementById('su-name').value,
    email:                document.getElementById('su-email').value,
    password:             document.getElementById('su-password').value,
  });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
  const me = await api.get('/api/auth/me');
  currentUser      = me.user;
  currentWorkspace = me.workspace;
  kanbanFields     = me.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = me.workspace.contact_columns || [];
  dealColumns      = Array.isArray(me.user?.deal_columns) ? me.user.deal_columns : [];
  objectColumns    = me.workspace.object_columns  || [];
  showApp();
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const errEl  = document.getElementById('forgot-error');
  const okEl   = document.getElementById('forgot-success');
  const linkBox = document.getElementById('forgot-link-box');
  const btn    = document.getElementById('forgot-btn');
  errEl.classList.add('hidden'); okEl.classList.add('hidden'); linkBox.classList.add('hidden');
  btn.disabled = true;
  const data = await api.post('/api/auth/forgot-password', { email: document.getElementById('forgot-email').value });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); btn.disabled = false; return; }
  okEl.textContent = data.message; okEl.classList.remove('hidden');
  if (data.resetUrl) { document.getElementById('forgot-link-val').value = data.resetUrl; linkBox.classList.remove('hidden'); }
}

function copyResetLink() {
  navigator.clipboard.writeText(document.getElementById('forgot-link-val').value).then(() => alert('Copied to clipboard'));
}

async function handleResetPassword(e) {
  e.preventDefault();
  const errEl    = document.getElementById('reset-error');
  const token    = document.getElementById('reset-token').value;
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;
  errEl.classList.add('hidden');
  if (password !== confirm) { errEl.textContent = 'Passwords do not match'; errEl.classList.remove('hidden'); return; }
  const data = await api.post('/api/auth/reset-password', { token, password });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
  alert('Password updated — please log in.');
  showMainAuth();
}

async function logout(e) {
  e?.preventDefault();
  await api.post('/api/auth/logout', {});
  resetClientState();
  showAuth();
}

document.querySelectorAll('.sb-link[data-page]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); switchPage(link.dataset.page); });
});

async function switchPage(page) {
  document.querySelectorAll('.sb-link[data-page]').forEach(a => a.removeAttribute('aria-current'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.sb-link[data-page="${page}"]`)?.setAttribute('aria-current', 'page');
  setCrumbs(page);
  ui.closePopover();
  const pageElId = page === 'suppliers' ? 'page-contacts' : `page-${page}`;
  document.getElementById(pageElId)?.classList.add('active');
  if (page === 'deals')      { closeSidePanel(); await loadDeals(); }
  if (page === 'contacts')   { currentContactType = 'contact'; await loadContacts(); }
  if (page === 'suppliers')  { currentContactType = 'supplier'; await loadContacts(); }
  if (page === 'activities') await loadActivities();
  if (page === 'calendar')   renderCalendar();
  if (page === 'settings')   await loadSettings();
  if (page === 'objects')    await loadObjects();
  if (page === 'tasks')      await loadTasks();
  if (page === 'board')        await loadBoard();
  if (page === 'analytics')    await loadAnalytics();
  if (page === 'integrations') await loadIntegrations();
  if (page === 'workspaces')   await loadWorkspacesPage();
  if (page === 'chat')         await loadChatPage();
}

function invalidate() { contacts = []; fields = []; members = []; deals = []; pipelines = []; dealFields = []; }

// Puts the browser back to the state it has on a fresh page load, so a login in the
// same tab (no reload) can never show anything of the previous user's workspace:
// background work stops, every workspace-scoped value returns to its initial value,
// and the per-workspace storage keys go. Browser preferences (language, theme,
// view modes, the guide flag) stay.
function resetClientState() {
  stopNotifPolling(); stopClock();
  if (socket) { socket.disconnect(); socket = null; }
  onlineUsers = []; chatOldestId = null; chatNewestId = null; chatOpen = false; chatPageOpen = false; chatLoadingMore = false;
  updateChatBadge(0);
  currentUser = null; currentWorkspace = null;
  contacts = []; fields = []; activities = []; members = [];
  pipelines = []; deals = []; dealFields = []; dealColumns = []; currentPipelineId = null; dragDealId = null;
  kanbanFields = ['company', 'email']; dealKanbanFields = ['contact', 'value']; contactColumns = []; colWidths = {};
  objects = []; objectFields = []; objectColumns = []; objCurrentPage = 1;
  tasks = []; taskProjects = []; currentProjectId = null; currentListId = null; currentProject = null; taskFields = []; collapsedTasks = new Set();
  analyticsData = null; trendRawData = null; calEvents = [];
  intgData = null; engineData = null; activeGuideId = null; activeCustomKeys = [];
  currentSettingsTab = 'workspace'; currentIntgTab = 'webhook';
  currentContactType = 'contact'; filteredContacts = []; selectedContactIds = new Set(); selectionModeOn = false;
  currentPage = 1; sortKey = null; sortDir = 'asc'; activeFilters = {};
  notifPanelOpen = false;
  const notifList = document.getElementById('notif-list'); if (notifList) notifList.innerHTML = '';
  document.getElementById('notif-panel')?.classList.add('hidden');
  localStorage.removeItem('lastTaskListId');
  Object.keys(localStorage).filter(k => k.startsWith('proj-collapsed-')).forEach(k => localStorage.removeItem(k));
}
async function ensureFields()   { if (!fields.length)   fields   = await api.get('/api/fields'); }
async function ensureContacts() { if (!contacts.length) contacts = await api.get('/api/contacts'); }
async function ensureMembers()  { if (!members.length)  members  = await api.get('/api/workspace/members'); }
async function ensurePipelines() { if (!pipelines.length) pipelines = await api.get('/api/pipelines'); }
