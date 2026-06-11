// ── AUTH ──────────────────────────────────────────────────
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
  document.getElementById('sidebar-workspace').textContent = currentWorkspace?.name || '';
  const settingsLabel = document.getElementById('settings-workspace-label');
  if (settingsLabel) settingsLabel.textContent = currentWorkspace?.name || '';
  document.getElementById('sidebar-user').textContent = currentUser?.name || '';
  const av = document.getElementById('sidebar-user-avatar');
  if (av) av.textContent = (currentUser?.name || '?')[0].toUpperCase();
  applyTranslations();
  loadColWidths();
  updateBoardNavVisibility();
  updateObjectsNav();
  updateSuppliersNav();
  loadNotifPrefs();
  startNotifPolling();
  loadDeals();
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
  showApp();
}

function showWorkspacePicker(workspaces, user) {
  showAuthView('workspace-picker');
  document.getElementById('workspace-picker-list').innerHTML = workspaces.map(w => `
    <button class="workspace-picker-btn" onclick="selectWorkspace(${w.id})">
      <div class="workspace-picker-avatar">${(w.name||'?')[0].toUpperCase()}</div>
      <div>
        <div class="workspace-picker-name">${esc(w.name)}</div>
        <div class="workspace-picker-role">${w.role}</div>
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

// ── Workspaces page ────────────────────────────────────────
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
        <div class="ws-page-role">${w.role === 'owner' ? 'Owner' : 'Member'}</div>
      </div>
      <div class="ws-page-card-footer">
        <span class="ws-page-open-btn">${isActive ? 'Currently open' : 'Switch →'}</span>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = cards + `
    <div class="ws-page-card ws-page-add" onclick="openAddWorkspaceChoice()">
      <div class="ws-page-card-banner ws-page-add-banner">
        <div class="ws-page-add-icon">+</div>
      </div>
      <div class="ws-page-card-body">
        <div class="ws-page-name">Add a Workspace</div>
        <div class="ws-page-role">Join or create</div>
      </div>
      <div class="ws-page-card-footer">
        <span class="ws-page-open-btn">Get started →</span>
      </div>
    </div>`;
}

async function switchWorkspace(workspaceId) {
  if (workspaceId === currentWorkspace?.id) { switchPage('deals'); return; }
  const data = await api.post('/api/auth/switch-workspace', { workspace_id: workspaceId });
  if (data.error) { alert(data.error); return; }
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  objectColumns    = data.workspace.object_columns  || [];
  document.getElementById('sidebar-workspace').textContent = data.workspace.name || '';
  const settingsLabel = document.getElementById('settings-workspace-label');
  if (settingsLabel) settingsLabel.textContent = data.workspace.name || '';
  invalidate();
  switchPage('deals');
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
  const data = await api.post('/api/auth/create-workspace', {
    workspace_name:       document.getElementById('cw-name').value.trim(),
    platform_invite_code: document.getElementById('cw-code').value.trim(),
  });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
  closeCreateWorkspaceModal();
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  objectColumns    = data.workspace.object_columns  || [];
  document.getElementById('sidebar-workspace').textContent = data.workspace.name || '';
  const settingsLabel = document.getElementById('settings-workspace-label');
  if (settingsLabel) settingsLabel.textContent = data.workspace.name || '';
  invalidate();
  switchPage('workspaces');
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
  const code = document.getElementById('join-ws-code').value.trim();
  if (!code) { errEl.textContent = 'Invite code required'; errEl.classList.remove('hidden'); return; }

  const data = await api.post('/api/auth/join-workspace', { invite_code: code });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }

  document.getElementById('join-workspace-modal').classList.add('hidden');
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  objectColumns    = data.workspace.object_columns  || [];
  document.getElementById('sidebar-workspace').textContent = data.workspace.name || '';
  invalidate();
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
  currentUser = currentWorkspace = null;
  contacts = stages = fields = activities = members = [];
  showAuth();
}

// ── Navigation ────────────────────────────────────────────
document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); switchPage(link.dataset.page); });
});

function switchPage(page) {
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.sidebar-nav a[data-page="${page}"]`)?.classList.add('active');
  // Suppliers reuses the contacts page element — no separate page-suppliers div
  const pageElId = page === 'suppliers' ? 'page-contacts' : `page-${page}`;
  document.getElementById(pageElId)?.classList.add('active');
  if (page === 'deals')      { closeSidePanel(); loadDeals(); }
  if (page === 'contacts')   { currentContactType = 'contact'; loadContacts(); }
  if (page === 'suppliers')  { currentContactType = 'supplier'; loadContacts(); }
  if (page === 'activities') loadActivities();
  if (page === 'settings')   loadSettings();
  if (page === 'objects')    loadObjects();
  if (page === 'tasks')      loadTasks();
  if (page === 'board')        loadBoard();
  if (page === 'analytics')    loadAnalytics();
  if (page === 'integrations') loadIntegrations();
  if (page === 'workspaces')   loadWorkspacesPage();
  if (page === 'chat')         loadChatPage();
}

// ── Shared loaders ────────────────────────────────────────
function invalidate() { contacts = []; stages = []; fields = []; members = []; deals = []; pipelines = []; dealFields = []; }
async function ensureStages()   { if (!stages.length)   stages   = await api.get('/api/stages'); }
async function ensureFields()   { if (!fields.length)   fields   = await api.get('/api/fields'); }
async function ensureContacts() { if (!contacts.length) contacts = await api.get('/api/contacts'); } // loads current type only; deal modal fetches both types directly
async function ensureMembers()  { if (!members.length)  members  = await api.get('/api/workspace/members'); }
