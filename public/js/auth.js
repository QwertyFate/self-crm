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
     login       handleLogin, handleSignup, toggleSignupMode, togglePassword,
                 setAuthBusy, startLoginCooldown, showForgotPassword, handleForgotPassword,
                 copyResetLink, showResetForm, handleResetPassword, showMainAuth
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
  ['login-error', 'signup-error', 'forgot-error', 'forgot-success', 'forgot-link-box', 'login-notice', 'login-hint'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );
  document.getElementById('forgot-btn').disabled = false;
  document.getElementById('reset-error').classList.add('hidden');
  loginFails = 0; clearInterval(loginCooldown); loginCooldown = null;   // door state, not workspace state: every entry to the door starts clean
  const loginBtn = document.querySelector('#login-form .au-submit');
  if (loginBtn) { loginBtn.disabled = false; if (loginBtn.dataset.label) loginBtn.textContent = loginBtn.dataset.label; }
  document.querySelectorAll('.auth-tab').forEach(t => {
    const on = t.dataset.tab === 'login';
    t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on));
  });
  // a password revealed with Show never survives a logout
  document.querySelectorAll('#auth-screen .au-pw-btn[aria-pressed="true"]').forEach(togglePassword);
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  const createRadio = document.querySelector('input[name="signup-mode"][value="create"]');
  if (createRadio) { createRadio.checked = true; toggleSignupMode(); }
  applyTranslations();   // the door is the one screen showApp() never translates
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
  updateOnboardingNav();
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
  document.getElementById('login-notice').classList.add('hidden');
  document.getElementById('login-hint').classList.add('hidden');
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
    document.querySelectorAll('.auth-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
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

// The Show/Hide button beside every password field; `btn.dataset.pw` names its input.
function togglePassword(btn) {
  const input = document.getElementById(btn.dataset.pw);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', String(show));
  btn.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
  btn.querySelector('span').textContent = t(show ? 'auth_hide' : 'auth_show');
}

// While a request is out the submit button says what is happening ("Logging in…")
// and cannot be pressed twice; `on = false` gives it its label back.
function setAuthBusy(form, on, key) {
  const btn = form.querySelector('.au-submit');
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.setAttribute('aria-busy', 'true'); btn.textContent = t(key); }
  else { btn.removeAttribute('aria-busy'); if (btn.dataset.label) btn.textContent = btn.dataset.label; }
}

// After a wrong password the button counts down LOGIN_COOLDOWN_S seconds before it can be pressed
// again — so a refused attempt reads as deliberate, not as a broken button — and from the
// LOGIN_FAILS_HINT-th failure on, #login-hint points to the password reset. Client-side only; the
// server's own limit (10 failures / 15 min) still stands behind it.
const LOGIN_COOLDOWN_S = 8, LOGIN_FAILS_HINT = 5;
let loginFails = 0, loginCooldown = null;

function startLoginCooldown(form, seconds) {
  const btn = form.querySelector('.au-submit');
  if (!btn) return;
  clearInterval(loginCooldown);
  const label = btn.dataset.label || btn.textContent;
  btn.dataset.label = label;
  let left = seconds;
  const show = () => { btn.textContent = t('auth_retry_in').replace('%s', left); };
  btn.disabled = true; show();
  loginCooldown = setInterval(() => {
    left -= 1;
    if (left > 0) { show(); return; }
    clearInterval(loginCooldown); loginCooldown = null;
    btn.disabled = false; btn.textContent = label;
  }, 1000);
}

// The two server messages the door can show, as translation keys (the server speaks English).
const AUTH_ERRORS = { 'Invalid email or password': 'auth_err_invalid', 'Too many login attempts. Please try again in 15 minutes.': 'auth_err_limit' };

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  document.getElementById('login-notice').classList.add('hidden');
  setAuthBusy(e.target, true, 'auth_logging_in');
  const data = await api.post('/api/auth/login', {
    email:    document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });
  setAuthBusy(e.target, false);
  if (data.error) {
    errEl.textContent = AUTH_ERRORS[data.error] ? t(AUTH_ERRORS[data.error]) : data.error; errEl.classList.remove('hidden');
    if (AUTH_ERRORS[data.error] === 'auth_err_invalid') {
      loginFails += 1;
      startLoginCooldown(e.target, LOGIN_COOLDOWN_S);
      if (loginFails >= LOGIN_FAILS_HINT) document.getElementById('login-hint').classList.remove('hidden');
    }
    return;
  }
  loginFails = 0;

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
  grid.innerHTML = `<p style="color:var(--muted);font-size:13px">${esc(t('ws_loading'))}</p>`;

  const data = await api.get('/api/auth/my-workspaces');
  if (!data || data.error) { grid.innerHTML = `<p style="color:var(--muted)">${esc(t('ws_load_error'))}</p>`; return; }

  const cards = data.workspaces.map(w => {
    const isActive = w.id === currentWorkspace?.id;
    const grad     = wsGradient(w.id);
    return `
    <div class="ws-page-card${isActive ? ' active' : ''}" onclick="switchWorkspace(${w.id})">
      <div class="ws-page-card-banner" style="background:${grad}">
        <div class="ws-page-avatar-lg">${(w.name||'?')[0].toUpperCase()}</div>
        ${isActive ? `<div class="ws-page-active-badge">${esc(t('ws_active'))}</div>` : ''}
      </div>
      <div class="ws-page-card-body">
        <div class="ws-page-name">${esc(w.name)}</div>
        <div class="ws-page-role">${roleLabel(w.role)}</div>
      </div>
      <div class="ws-page-card-footer">
        <span class="ws-page-open-btn">${isActive ? esc(t('ws_current')) : `${esc(t('ws_switch'))} ${icon('arrow-up-right', 'ic-sm')}`}</span>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = cards + `
    <div class="ws-page-card ws-page-add" onclick="openAddWorkspaceChoice()">
      <div class="ws-page-card-banner ws-page-add-banner">
        <div class="ws-page-add-icon">${icon('plus')}</div>
      </div>
      <div class="ws-page-card-body">
        <div class="ws-page-name">${esc(t('ws_add_title'))}</div>
        <div class="ws-page-role">${esc(t('ws_join_or_create'))}</div>
      </div>
      <div class="ws-page-card-footer">
        <span class="ws-page-open-btn">${esc(t('ws_get_started'))} ${icon('arrow-up-right', 'ic-sm')}</span>
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
  document.getElementById('join-ws-auth-code').value = '';
  document.getElementById('join-ws-auth-error').classList.add('hidden');
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
  // Two forms submit here — the in-app modal and the auth-screen view — each with
  // its own input and error box, so read from the form that fired, not by id.
  const form = e.target.closest('form');
  const errEl = form.querySelector('.au-alert, .auth-error');
  errEl.classList.add('hidden');
  const code = (form.querySelector('input[type="text"]')?.value || '').trim();
  if (!code) { errEl.textContent = t('auth_code_required'); errEl.classList.remove('hidden'); return; }

  const data = await api.post('/api/auth/join-workspace', { invite_code: code });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }

  document.getElementById('join-workspace-modal').classList.add('hidden');
  document.getElementById('auth-screen').classList.add('hidden');   // the auth-screen view hides the app while open
  document.getElementById('app').classList.remove('hidden');
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

function copyResetLink(btn) {
  navigator.clipboard.writeText(document.getElementById('forgot-link-val').value).then(() => {
    const label = btn.querySelector('span'), use = btn.querySelector('use');
    label.textContent = t('copied'); use.setAttribute('href', '#i-check');
    setTimeout(() => { label.textContent = t('btn_copy'); use.setAttribute('href', '#i-copy'); }, 1500);
  });
}

async function handleResetPassword(e) {
  e.preventDefault();
  const errEl    = document.getElementById('reset-error');
  const token    = document.getElementById('reset-token').value;
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;
  errEl.classList.add('hidden');
  if (password !== confirm) { errEl.textContent = t('auth_pw_mismatch'); errEl.classList.remove('hidden'); return; }
  const data = await api.post('/api/auth/reset-password', { token, password });
  if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
  showMainAuth();
  const notice = document.getElementById('login-notice');   // inline, where the person now has to act
  notice.textContent = t('auth_pw_updated'); notice.classList.remove('hidden');
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
  if (page === 'onboarding')   await loadOnboarding();
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
  tasks = []; taskProjects = []; currentProjectId = null; currentListId = null; currentProject = null; taskFields = []; collapsedTasks = new Set(); resetTasksUI(); resetActivitiesUI();   // the Tasks and Activities pages clear their own scope, filters and drafts (tasks.js, objects.js)
  analyticsData = null; trendRawData = null; calEvents = [];
  intgData = null; engineData = null; engineApiKeys = []; activeGuideId = null; activeCustomKeys = [];
  onboardingData = null; onboardingFilter = 'all';
  document.getElementById('nav-onboarding-link')?.classList.add('hidden');
  currentSettingsTab = 'workspace'; currentIntgTab = 'webhook';
  currentContactType = 'contact'; filteredContacts = []; selectedContactIds = new Set(); selectionModeOn = false;
  currentPage = 1; sortKey = null; sortDir = 'asc'; activeFilters = {};
  notifPanelOpen = false;
  const notifList = document.getElementById('notif-list'); if (notifList) notifList.innerHTML = '';
  document.getElementById('notif-panel')?.classList.add('hidden');
  localStorage.removeItem('lastTaskListId');
  localStorage.removeItem('taskScope');
  Object.keys(localStorage).filter(k => k.startsWith('proj-collapsed-')).forEach(k => localStorage.removeItem(k));
}
async function ensureFields()   { if (!fields.length)   fields   = await api.get('/api/fields'); }
async function ensureContacts() { if (!contacts.length) contacts = await api.get('/api/contacts'); }
async function ensureMembers()  { if (!members.length)  members  = await api.get('/api/workspace/members'); }
async function ensurePipelines() { if (!pipelines.length) pipelines = await api.get('/api/pipelines'); }
