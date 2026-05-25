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
}

function showAuthView(view) {
  ['main','forgot','reset'].forEach(v =>
    document.getElementById(`auth-view-${v}`).classList.toggle('hidden', v !== view)
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
  currentUser      = data.user;
  currentWorkspace = data.workspace;
  kanbanFields     = data.workspace.kanban_fields   || ['company', 'email'];
  contactColumns   = data.workspace.contact_columns || [];
  dealColumns      = Array.isArray(data.user?.deal_columns) ? data.user.deal_columns : [];
  showApp();
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
  if (page === 'board')      loadBoard();
}

// ── Shared loaders ────────────────────────────────────────
function invalidate() { contacts = []; stages = []; fields = []; members = []; deals = []; pipelines = []; dealFields = []; }
async function ensureStages()   { if (!stages.length)   stages   = await api.get('/api/stages'); }
async function ensureFields()   { if (!fields.length)   fields   = await api.get('/api/fields'); }
async function ensureContacts() { if (!contacts.length) contacts = await api.get('/api/contacts'); } // loads current type only; deal modal fetches both types directly
async function ensureMembers()  { if (!members.length)  members  = await api.get('/api/workspace/members'); }
