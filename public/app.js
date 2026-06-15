// ── State ─────────────────────────────────────────────────
let currentUser      = null;
let currentWorkspace = null;
let kanbanFields     = ['company', 'email'];

let contacts   = [];
let stages     = [];
let fields     = [];
let activities = [];
let members    = [];
let pipelines        = [];
let deals            = [];
let objects          = [];
let objectFields     = [];
let objectColumns    = [];
let objColDragIdx    = null;
let objCurrentPage   = 1;
let objectViewMode   = localStorage.getItem('objectViewMode') || 'table';
let dealFields       = [];
let dealKanbanFields = ['contact', 'value'];
let currentPipelineId = null;
let dealViewMode      = localStorage.getItem('dealViewMode') || 'kanban';
let dealColumns       = []; // [{key, visible}] per-user, saved in DB
let dealColDragIdx    = null;
let dragDealId        = null;
let dragContactId    = null;
let dragStageIdx     = null;
let colDragIdx     = null;
let importData     = null;
let contactColumns = []; // [{key, visible}] — empty = all visible in default order
let colWidths      = {}; // {colKey: widthPx} — persisted per workspace in localStorage
let resizingCol    = null;
let currentPage    = 1;
const PAGE_SIZE    = 25;
let sortKey        = null; // column key currently sorted, null = default order
let sortDir        = 'asc'; // 'asc' | 'desc'
let activeFilters  = {}; // { field_key: ['value1', 'value2'] }
let filterPanelOpen = false;
let currentLang   = localStorage.getItem('lang') || 'en';

// ── Translations ──────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    nav_deals:'Deals', nav_contacts:'Contacts', nav_activities:'Activities', nav_settings:'Settings', nav_board:'Board',
    set_miro:'Miro Board', hint_miro:'Paste the embed URL from Miro → Share → Embed.',
    add_deal:'+ Add Deal', lbl_deal_title:'Title', lbl_deal_value:'Value',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Each pipeline has its own stages. Deals belong to one pipeline.',
    set_deal_fields:'Deal Fields', hint_deal_fields:'Extra properties on every deal.',
    no_pipelines:'No pipelines yet. Create one in Settings → Deals.',
    no_deals:'No deals in this stage.',
    dark_mode:'Dark mode', light_mode:'Light mode', logout:'Log out',
    page_pipeline:'Pipeline', page_contacts:'Contacts', page_activities:'Activities', page_settings:'Settings',
    add_contact:'+ Add Contact', log_activity:'+ Log Activity',
    import_csv:'⬆ Import CSV', export_csv:'⬇ Export CSV',
    col_name:'Name', col_company:'Company', col_email:'Email', col_phone:'Phone', col_stage:'Stage', col_assignee:'Assignee', col_created_at:'Date Added',
    search_ph:'Search contacts…',
    no_activities:'No activities yet.', no_fields:'No custom fields yet.',
    drop_here:'Drop contacts here', unassigned:'Unassigned',
    act_note:'Note', act_call:'Call', act_email:'Email', act_whatsapp:'WhatsApp',
    logged_by:'by',
    tab_general:'General', tab_pipeline:'Pipeline', tab_contacts:'Contacts', tab_team:'Team',
    set_stages:'Pipeline Stages', set_fields:'Custom Fields', set_kanban:'Kanban Card Fields',
    set_invites:'Invite Codes', set_members:'Team Members', set_language:'Language', set_workspace:'Workspace',
    set_contact_cols:'Contact Columns', hint_contact_cols:'Drag to reorder. Name is always first.',
    set_wa_template:'WhatsApp Message Template',
    hint_wa_template:'Written when you tap the WhatsApp button on a contact.',
    wa_vars:'Available variables:',
    hint_stages:'Drag to reorder. Contacts are unassigned when a stage is deleted.',
    hint_fields:'Extra properties on every contact.',
    hint_kanban:'Choose which fields appear on pipeline cards. Name is always shown.',
    hint_invites:'One-time codes to let people join this workspace.',
    hint_language:'Choose your preferred display language.',
    hint_workspace:'Update the name of this workspace.',
    add_btn:'+ Add', generate_btn:'Generate', save_btn:'Save',
    add_contact_title:'Add Contact', edit_contact_title:'Edit Contact',
    log_activity_title:'Log Activity',
    add_stage_title:'Add Stage', edit_stage_title:'Edit Stage',
    add_field_title:'Add Field', edit_field_title:'Edit Field',
    lbl_name:'Name', lbl_company:'Company', lbl_email:'Email', lbl_phone:'Phone',
    lbl_stage:'Stage', lbl_assignee:'Assignee', lbl_type:'Type', lbl_contact:'Contact',
    lbl_content:'Content', lbl_color:'Color', lbl_field_label:'Label', lbl_key:'Key',
    lbl_options:'Options (one per line)',
    btn_cancel:'Cancel', btn_save:'Save', btn_delete:'Delete', btn_view:'View', btn_log:'Log', btn_edit:'Edit',
    detail_stage:'Stage', detail_activities:'Activities',
    detail_log_ph:'Add note, call, or email…', detail_unassigned:'Unassigned',
    opt_none:'— None —', opt_no_stage:'— No stage —', opt_unassigned:'— Unassigned —',
    lang_en:'English', lang_de:'German',
  },
  de: {
    nav_deals:'Deals', nav_contacts:'Kontakte', nav_activities:'Aktivitäten', nav_settings:'Einstellungen', nav_board:'Board',
    set_miro:'Miro-Board', hint_miro:'Embed-URL aus Miro → Teilen → Einbetten einfügen.',
    add_deal:'+ Deal hinzufügen', lbl_deal_title:'Titel', lbl_deal_value:'Wert',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Jede Pipeline hat eigene Phasen. Deals gehören zu einer Pipeline.',
    set_deal_fields:'Deal-Felder', hint_deal_fields:'Zusätzliche Eigenschaften für jeden Deal.',
    no_pipelines:'Noch keine Pipelines. Erstelle eine unter Einstellungen → Deals.',
    no_deals:'Keine Deals in dieser Phase.',
    dark_mode:'Dunkelmodus', light_mode:'Hellmodus', logout:'Abmelden',
    page_pipeline:'Pipeline', page_contacts:'Kontakte', page_activities:'Aktivitäten', page_settings:'Einstellungen',
    add_contact:'+ Kontakt hinzufügen', log_activity:'+ Aktivität erfassen',
    import_csv:'⬆ CSV importieren', export_csv:'⬇ CSV exportieren',
    col_name:'Name', col_company:'Unternehmen', col_email:'E-Mail', col_phone:'Telefon', col_stage:'Phase', col_assignee:'Zuständig', col_created_at:'Hinzugefügt am',
    search_ph:'Kontakte suchen…',
    no_activities:'Noch keine Aktivitäten.', no_fields:'Noch keine benutzerdefinierten Felder.',
    drop_here:'Kontakte hierher ziehen', unassigned:'Nicht zugewiesen',
    act_note:'Notiz', act_call:'Anruf', act_email:'E-Mail', act_whatsapp:'WhatsApp',
    logged_by:'von',
    tab_general:'Allgemein', tab_pipeline:'Pipeline', tab_contacts:'Kontakte', tab_team:'Team',
    set_stages:'Pipeline-Phasen', set_fields:'Benutzerdefinierte Felder', set_kanban:'Kanban-Kartenfelder',
    set_invites:'Einladungscodes', set_members:'Teammitglieder', set_language:'Sprache', set_workspace:'Arbeitsbereich',
    set_contact_cols:'Kontaktspalten', hint_contact_cols:'Zum Neuanordnen ziehen. Name steht immer an erster Stelle.',
    set_wa_template:'WhatsApp-Nachrichtenvorlage',
    hint_wa_template:'Wird beim Klicken auf den WhatsApp-Button des Kontakts vorausgefüllt.',
    wa_vars:'Verfügbare Variablen:',
    hint_stages:'Zum Neuanordnen ziehen. Kontakte werden bei Phasenlöschung nicht zugewiesen.',
    hint_fields:'Zusätzliche Eigenschaften für jeden Kontakt.',
    hint_kanban:'Felder auswählen, die auf Pipeline-Karten erscheinen. Name wird immer angezeigt.',
    hint_invites:'Einmalcodes, damit Personen diesem Arbeitsbereich beitreten können.',
    hint_language:'Bevorzugte Anzeigesprache wählen.',
    hint_workspace:'Namen dieses Arbeitsbereichs ändern.',
    add_btn:'+ Hinzufügen', generate_btn:'Generieren', save_btn:'Speichern',
    add_contact_title:'Kontakt hinzufügen', edit_contact_title:'Kontakt bearbeiten',
    log_activity_title:'Aktivität erfassen',
    add_stage_title:'Phase hinzufügen', edit_stage_title:'Phase bearbeiten',
    add_field_title:'Feld hinzufügen', edit_field_title:'Feld bearbeiten',
    lbl_name:'Name', lbl_company:'Unternehmen', lbl_email:'E-Mail', lbl_phone:'Telefon',
    lbl_stage:'Phase', lbl_assignee:'Zuständig', lbl_type:'Typ', lbl_contact:'Kontakt',
    lbl_content:'Inhalt', lbl_color:'Farbe', lbl_field_label:'Bezeichnung', lbl_key:'Schlüssel',
    lbl_options:'Optionen (eine pro Zeile)',
    btn_cancel:'Abbrechen', btn_save:'Speichern', btn_delete:'Löschen', btn_view:'Ansehen', btn_log:'Erfassen', btn_edit:'Bearbeiten',
    detail_stage:'Phase', detail_activities:'Aktivitäten',
    detail_log_ph:'Notiz, Anruf oder E-Mail hinzufügen…', detail_unassigned:'Nicht zugewiesen',
    opt_none:'— Keine —', opt_no_stage:'— Keine Phase —', opt_unassigned:'— Nicht zugewiesen —',
    lang_en:'Englisch', lang_de:'Deutsch',
  },
};

function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.en)[key] ?? TRANSLATIONS.en[key] ?? key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  // Sync dark-mode toggle label
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const lbl = document.getElementById('dark-toggle-label');
  if (lbl) lbl.textContent = t(dark ? 'light_mode' : 'dark_mode');
  // Sync language radio
  document.querySelectorAll('input[name="language"]').forEach(r => { r.checked = r.value === currentLang; });
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
  // Re-render current page so dynamic strings update
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals')      loadDeals();
  if (page === 'contacts')   filterContacts();
  if (page === 'activities') loadActivities();
  if (page === 'settings')   loadSettings();
  if (page === 'objects')    loadObjects();
  if (page === 'board')      loadBoard();
}

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="vertical-align:middle"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
const ICONS = { note: '📝', call: '📞', email: '✉️', whatsapp: WA_SVG };
function waLink(phone, contact) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  const name    = typeof contact === 'string' ? contact : (contact?.name    || '');
  const company = typeof contact === 'string' ? ''      : (contact?.company || '');
  const tpl = (currentWorkspace?.whatsapp_template || 'Hi {{name}}, ')
    .replace(/\{\{name\}\}/g,    name)
    .replace(/\{\{company\}\}/g, company);
  return `https://wa.me/${digits}?text=${encodeURIComponent(tpl)}`;
}

const BUILTIN_FIELDS = [
  { key: 'company',  label: 'Company',  type: 'text' },
  { key: 'email',    label: 'Email',    type: 'email' },
  { key: 'phone',    label: 'Phone',    type: 'phone' },
  { key: 'assignee', label: 'Assignee', type: 'text' },
];

// ── Loading bar + overlay ─────────────────────────────────
const loader = (() => {
  let count = 0;
  let fillTimer = null;
  let hideTimer = null;
  let overlayTimer = null;
  const bar     = () => document.getElementById('loading-bar');
  const fill    = () => document.getElementById('loading-bar-fill');
  const overlay = () => document.getElementById('loading-overlay');

  function start() {
    count++;
    clearTimeout(hideTimer);
    clearTimeout(overlayTimer);

    // ── Progress bar ──
    const b = bar(), f = fill();
    if (b && f) {
      b.classList.add('active');
      let pct = parseFloat(f.style.width) || 0;
      if (pct >= 80) pct = 30;
      f.style.width = pct + '%';
      clearTimeout(fillTimer);
      fillTimer = setTimeout(() => { if (fill()) fill().style.width = '70%'; }, 50);
      fillTimer = setTimeout(() => { if (fill()) fill().style.width = '82%'; }, 400);
    }

    // ── Center overlay — only after 300ms so quick fetches never flash ──
    overlayTimer = setTimeout(() => {
      if (count > 0) overlay()?.classList.remove('hidden');
    }, 300);
  }

  function done() {
    count = Math.max(0, count - 1);
    if (count > 0) return;

    clearTimeout(overlayTimer);
    overlay()?.classList.add('hidden');

    const f = fill();
    if (f) f.style.width = '100%';
    hideTimer = setTimeout(() => {
      const b = bar(), f2 = fill();
      if (b) b.classList.remove('active');
      setTimeout(() => { if (f2) f2.style.width = '0%'; }, 160);
    }, 260);
  }

  return { start, done };
})();

// ── API ───────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  loader.start();
  try {
    const r = await fetch(url, opts);
    return await r.json();
  } finally {
    loader.done();
  }
}

const api = {
  get:   url      => apiFetch(url),
  post:  (url, d) => apiFetch(url, { method:'POST',   headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  put:   (url, d) => apiFetch(url, { method:'PUT',    headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  patch: (url, d) => apiFetch(url, { method:'PATCH',  headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  del:   url      => apiFetch(url, { method:'DELETE' }),
};

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
async function init() {
  const params     = new URLSearchParams(window.location.search);
  const resetToken = params.get('reset');

  // Admin panel entry point
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
  // Reset all auth forms and error states
  ['login-form', 'signup-form'].forEach(id => document.getElementById(id).reset());
  ['login-error', 'signup-error', 'forgot-error', 'forgot-success', 'forgot-link-box'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );
  document.getElementById('forgot-btn').disabled = false;
  document.getElementById('reset-error').classList.add('hidden');
  // Reset signup to default tab (login) and mode (create)
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
  document.getElementById('sidebar-user').textContent = currentUser?.name || '';
  applyTranslations();
  loadColWidths();
  updateBoardNavVisibility();
  updateObjectsNav();
  loadDeals();
}

function showAuthView(view) {
  ['main','forgot','reset'].forEach(v =>
    document.getElementById(`auth-view-${v}`).classList.toggle('hidden', v !== view)
  );
  // Only show tabs on main view
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

function showMainAuth(e) {
  e?.preventDefault();
  showAuthView('main');
}

function showResetForm(token) {
  document.getElementById('reset-token').value = token;
  document.getElementById('reset-error').classList.add('hidden');
  showAuthView('reset');
}

// Auth tabs
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
  // Re-fetch session data
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
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
  linkBox.classList.add('hidden');
  btn.disabled = true;

  const data = await api.post('/api/auth/forgot-password', {
    email: document.getElementById('forgot-email').value,
  });

  if (data.error) {
    errEl.textContent = data.error;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  okEl.textContent = data.message;
  okEl.classList.remove('hidden');

  if (data.resetUrl) {
    document.getElementById('forgot-link-val').value = data.resetUrl;
    linkBox.classList.remove('hidden');
  }
}

function copyResetLink() {
  const val = document.getElementById('forgot-link-val').value;
  navigator.clipboard.writeText(val).then(() => alert('Copied to clipboard'));
}

async function handleResetPassword(e) {
  e.preventDefault();
  const errEl    = document.getElementById('reset-error');
  const token    = document.getElementById('reset-token').value;
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;

  errEl.classList.add('hidden');
  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match';
    errEl.classList.remove('hidden');
    return;
  }

  const data = await api.post('/api/auth/reset-password', { token, password });
  if (data.error) {
    errEl.textContent = data.error;
    errEl.classList.remove('hidden');
    return;
  }

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
  // Close chat page if switching away
  if (page !== 'chat') chatPageOpen = false;

  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.sidebar-nav a[data-page="${page}"]`)?.classList.add('active');
  document.getElementById(`page-${page}`).classList.add('active');
  if (page === 'deals')      loadDeals();
  if (page === 'contacts')   loadContacts();
  if (page === 'chat')       loadChatPage();
  if (page === 'activities') loadActivities();
  if (page === 'settings')   loadSettings();
  if (page === 'objects')    loadObjects();
  if (page === 'board')      loadBoard();
}

// ── Shared loaders ────────────────────────────────────────
function invalidate() { contacts = []; stages = []; fields = []; members = []; deals = []; pipelines = []; dealFields = []; }
async function ensureStages()   { if (!stages.length)   stages   = await api.get('/api/stages'); }
async function ensureFields()   { if (!fields.length)   fields   = await api.get('/api/fields'); }
async function ensureContacts() { if (!contacts.length) contacts = await api.get('/api/contacts'); }
async function ensureMembers()  { if (!members.length)  members  = await api.get('/api/workspace/members'); }

// ══════════════════════════════════════════════════════════
// DEALS
// ══════════════════════════════════════════════════════════
async function loadDeals() {
  console.log('loadDeals called');
  try {
    // Show loading state
    const boardEl = document.getElementById('deals-board');
    if (boardEl) boardEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Loading deals…</div>';

    console.log('Ensuring members...');
    await ensureMembers();

    console.log('Fetching pipelines and deal fields...');
    const [pipelineData, dealFieldData] = await Promise.all([
      api.get('/api/pipelines'),
      api.get('/api/deal-fields'),
    ]);

    console.log('Pipelines:', pipelineData);
    console.log('Deal fields:', dealFieldData);

    pipelines = pipelineData || [];
    dealFields = dealFieldData || [];
    dealKanbanFields = currentWorkspace?.deal_kanban_fields || ['contact', 'value'];

    const sel = document.getElementById('deals-pipeline-select');
    if (sel) {
      sel.innerHTML = `<option value="">— All pipelines —</option>` +
        pipelines.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

      // On first load in kanban mode with nothing selected, default to first pipeline
      if (dealViewMode === 'kanban' && !currentPipelineId && pipelines.length) {
        currentPipelineId = pipelines[0].id;
      }
      if (currentPipelineId && !pipelines.find(p => p.id === currentPipelineId)) {
        currentPipelineId = null;
      }
      sel.value = currentPipelineId || '';
    }

    const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
    console.log('Fetching deals from:', url);
    const dealsData = await api.get(url);
    console.log('Deals:', dealsData);
    deals = dealsData || [];

    console.log('Calling setDealView with mode:', dealViewMode);
    setDealView(dealViewMode);
    console.log('loadDeals completed');
  } catch (err) {
    console.error('Error loading deals:', err);
    const boardEl = document.getElementById('deals-board');
    if (boardEl) boardEl.innerHTML = '<div style="padding:40px;text-align:center;color:red">Error loading deals: ' + err.message + '</div>';
  }
}

async function onPipelineChange() {
  const sel = document.getElementById('deals-pipeline-select');
  currentPipelineId = sel.value ? parseInt(sel.value) : null;
  const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
  deals = await api.get(url);
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

function setDealView(mode) {
  dealViewMode = mode;
  localStorage.setItem('dealViewMode', mode);
  document.getElementById('deals-board')?.classList.toggle('hidden', mode === 'list');
  document.getElementById('deals-list-view')?.classList.toggle('hidden', mode === 'kanban');
  document.getElementById('deal-view-kanban')?.classList.toggle('active', mode === 'kanban');
  document.getElementById('deal-view-list')?.classList.toggle('active', mode === 'list');
  if (mode === 'list') renderDealsList(); else renderDealsBoard();
}

// ── Deal column config (per-user) ─────────────────────────
function effectiveDealColumns() {
  const BUILTIN = [
    { key: 'stage',       label: () => t('col_stage'),      show: true  },
    { key: 'contact',     label: () => t('lbl_contact'),    show: true  },
    { key: 'value',       label: () => t('lbl_deal_value'), show: true  },
    { key: 'assigned_to', label: () => t('col_assignee'),   show: true  },
    { key: 'created_at',  label: () => t('col_created_at'), show: false },
  ];
  const ALL = [
    ...BUILTIN,
    ...dealFields.map(f => ({ key: `custom:${f.field_key}`, label: () => f.name, show: true })),
  ];
  if (!dealColumns.length) return ALL.map(c => ({ ...c, visible: c.show }));
  const savedMap = Object.fromEntries(dealColumns.map(c => [c.key, c.visible]));
  const ordered  = dealColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: c.show }));
  return ordered;
}

function renderDealColumnSettings() {
  const el = document.getElementById('deal-columns-list');
  if (!el) return;
  const cols = effectiveDealColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="dealColDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="dealColDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">⠿</span>
      <span class="row-label">${col.label()}</span>
      <label class="col-vis-toggle">
        <input type="checkbox" ${col.visible ? 'checked' : ''} onchange="dealColToggle(${i},this.checked)" />
      </label>
    </li>`).join('');
}

function dealColDragStart(e, i) { dealColDragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function dealColDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('col-drag-over');
  if (dealColDragIdx === null || dealColDragIdx === targetIdx) { dealColDragIdx = null; return; }
  const cols  = effectiveDealColumns();
  const moved = cols.splice(dealColDragIdx, 1)[0];
  cols.splice(targetIdx, 0, moved);
  dealColDragIdx = null;
  dealColumns = cols.map(({ key, visible }) => ({ key, visible }));
  renderDealColumnSettings();
}
function dealColToggle(i, visible) {
  const cols = effectiveDealColumns();
  cols[i].visible = visible;
  dealColumns = cols.map(({ key, visible }) => ({ key, visible }));
}

async function saveDealColumns() {
  const toSave = effectiveDealColumns().map(({ key, visible }) => ({ key, visible }));
  const btn  = document.getElementById('save-deal-cols-btn');
  const msgEl = document.getElementById('deal-cols-msg');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  msgEl?.classList.add('hidden');
  const res = await api.patch('/api/auth/preferences', { deal_columns: toSave });
  if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); }
  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }
  dealColumns = toSave;
  if (currentUser) currentUser.deal_columns = toSave;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
  renderDealsList();
}

function renderDealsList() {
  const thead = document.getElementById('deals-thead');
  const tbody = document.getElementById('deals-tbody');
  if (!thead || !tbody) return;

  const visibleCols  = effectiveDealColumns().filter(c => c.visible);
  const showPipeline = !currentPipelineId;
  const span = 1 + (showPipeline ? 1 : 0) + visibleCols.length;

  thead.innerHTML = `<tr>
    <th>Title</th>
    ${showPipeline ? '<th>Pipeline</th>' : ''}
    ${visibleCols.map(c => `<th>${c.label()}</th>`).join('')}
  </tr>`;

  if (!deals.length) {
    tbody.innerHTML = `<tr><td colspan="${span}" style="text-align:center;color:var(--muted);padding:28px">No deals found.</td></tr>`;
    return;
  }

  tbody.innerHTML = deals.map(d => {
    const dash  = '<span class="muted-dash">—</span>';
    const cells = visibleCols.map(col => {
      if (col.key === 'stage') {
        const badge = d.stage_name
          ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${d.stage_color}"></span>${esc(d.stage_name)}</span>`
          : dash;
        return `<td>${badge}</td>`;
      }
      if (col.key === 'contact')     return `<td>${d.contact_name ? esc(d.contact_name) : dash}</td>`;
      if (col.key === 'value')       return `<td>${d.value != null ? `<span class="deal-value-chip">€ ${Number(d.value).toLocaleString()}</span>` : dash}</td>`;
      if (col.key === 'assigned_to') return `<td>${d.assigned_to_name ? esc(d.assigned_to_name) : dash}</td>`;
      if (col.key === 'created_at')  return `<td>${fmtDate(d.created_at)}</td>`;
      if (col.key.startsWith('custom:')) {
        const fk = col.key.slice(7);
        return `<td>${esc(d.custom_data?.[fk] ?? '') || dash}</td>`;
      }
      return `<td>${dash}</td>`;
    }).join('');

    return `<tr class="deal-list-row" onclick="openDealModal(${d.id})">
      <td><strong>${esc(d.title)}</strong></td>
      ${showPipeline ? `<td>${esc(pipelines.find(p => p.id === d.pipeline_id)?.name || '—')}</td>` : ''}
      ${cells}
    </tr>`;
  }).join('');
}

function renderDealsBoard() {
  const board = document.getElementById('deals-board');
  if (!board) return;

  if (!pipelines.length) {
    board.innerHTML = `<div style="padding:40px;color:var(--muted);font-size:14px">${t('no_pipelines')}</div>`;
    return;
  }
  if (!currentPipelineId) {
    board.innerHTML = `<div style="padding:40px;color:var(--muted);font-size:14px">Select a pipeline above to view the board, or switch to List view to see all deals.</div>`;
    return;
  }

  const pipeline = pipelines.find(p => p.id === currentPipelineId);
  if (!pipeline) return;
  const pipelineStages = pipeline.stages || [];

  board.innerHTML = pipelineStages.map(stage => {
    const stageDeals = deals.filter(d => d.stage_id === stage.id);
    return `
    <div class="pipeline-col">
      <div class="col-header">
        <span class="col-dot" style="background:${stage.color}"></span>
        <span class="col-name">${esc(stage.name)}</span>
        <span class="col-count">${stageDeals.length}</span>
      </div>
      <div class="col-cards"
        ondragover="dealDragOver(event)" ondragleave="dealDragLeave(event)"
        ondrop="dealDrop(event,${stage.id})">
        ${stageDeals.length ? stageDeals.map(dealCard).join('') : `<div class="col-empty">${t('no_deals')}</div>`}
      </div>
    </div>`;
  }).join('');
}

function dealCard(d) {
  const fmtVal = d.value != null ? Number(d.value).toLocaleString() : null;
  return `
    <div class="contact-card deal-card" draggable="true" data-id="${d.id}"
      ondragstart="dealDragStart(event,${d.id})" ondragend="dealDragEnd(event)"
      onclick="openDealModal(${d.id})">
      <div class="card-name">${esc(d.title)}</div>
      ${d.contact_name ? `<div class="card-field">👤 ${esc(d.contact_name)}</div>` : ''}
      ${fmtVal != null ? `<div class="card-field deal-value-chip">€ ${fmtVal}</div>` : ''}
      ${d.assigned_to_name ? `<div class="card-field">→ ${esc(d.assigned_to_name)}</div>` : ''}
      <div class="card-actions">
        <button class="btn btn-sm btn-danger btn-icon" title="Delete"
          onclick="event.stopPropagation();deleteDeal(${d.id})">✕</button>
      </div>
    </div>`;
}

// ── Deal Drag & Drop ──────────────────────────────────────
function dealDragStart(e, id) {
  dragDealId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}
function dealDragEnd(e)   { e.target.classList.remove('dragging'); }
function dealDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dealDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function dealDrop(e, stageId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragDealId) return;
  const deal = deals.find(d => d.id === dragDealId);
  if (!deal || deal.stage_id === stageId) return;
  deal.stage_id = stageId;
  const stage = (pipelines.find(p => p.id === currentPipelineId)?.stages || []).find(s => s.id === stageId);
  deal.stage_name  = stage?.name  || null;
  deal.stage_color = stage?.color || null;
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
  await api.patch(`/api/deals/${dragDealId}/stage`, { stage_id: stageId });
  dragDealId = null;
}

// ══════════════════════════════════════════════════════════
// CONTACTS TABLE
// ══════════════════════════════════════════════════════════
async function loadContacts() {
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  contacts = await api.get('/api/contacts');
  currentPage = 1;
  renderFilterChips(); // refresh chips in case members/stages changed
  filterContacts();
}

// ── Column width persistence (per-user, stored in DB) ────
function loadColWidths() {
  colWidths = { ...(currentUser?.column_widths || {}) };
}
function saveColWidths() {
  if (currentUser) currentUser.column_widths = { ...colWidths };
  api.patch('/api/auth/preferences', { column_widths: colWidths });
}

// ── Column resize handlers ────────────────────────────────
function startColResize(e, colKey, colEl) {
  e.preventDefault();
  e.stopPropagation();
  resizingCol = { colKey, colEl, startX: e.clientX, startW: colWidths[colKey] || parseInt(colEl.style.width) || 100 };
  document.addEventListener('mousemove', onColResize);
  document.addEventListener('mouseup', stopColResize);
  document.body.style.cursor    = 'col-resize';
  document.body.style.userSelect = 'none';
}
function onColResize(e) {
  if (!resizingCol) return;
  const newW = Math.max(50, resizingCol.startW + (e.clientX - resizingCol.startX));
  resizingCol.colEl.style.width = newW + 'px';
  colWidths[resizingCol.colKey] = Math.round(newW);
}
function stopColResize() {
  if (!resizingCol) return;
  document.removeEventListener('mousemove', onColResize);
  document.removeEventListener('mouseup', stopColResize);
  document.body.style.cursor    = '';
  document.body.style.userSelect = '';
  saveColWidths();
  resizingCol = null;
}

// Returns ordered, merged column definitions respecting saved config + current fields
function effectiveContactColumns() {
  const BUILTIN = [
    { key: 'company',     label: () => t('col_company'),    type: 'text',     show: true  },
    { key: 'email',       label: () => t('col_email'),      type: 'email',    show: true  },
    { key: 'phone',       label: () => t('col_phone'),      type: 'phone',    show: true  },
    { key: 'stage_id',    label: () => t('col_stage'),      type: 'stage',    show: true  },
    { key: 'assigned_to', label: () => t('col_assignee'),   type: 'assignee', show: true  },
    { key: 'created_at',  label: () => t('col_created_at'), type: 'date',     show: false },
  ];
  const ALL = [
    ...BUILTIN,
    ...fields.map(f => ({ key: f.field_key, label: () => f.name, type: f.type, show: true })),
  ];

  if (!contactColumns.length) return ALL.map(c => ({ ...c, visible: c.show }));

  const savedMap = Object.fromEntries(contactColumns.map(c => [c.key, c.visible]));
  const ordered  = contactColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  // Append any new fields not in saved config, using their default show value
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: c.show }));
  return ordered;
}

// ── Sort ──────────────────────────────────────────────────
function toggleSort(key) {
  if (sortKey === key) {
    if (sortDir === 'asc') { sortDir = 'desc'; }
    else { sortKey = null; sortDir = 'asc'; } // third click = reset
  } else {
    sortKey = key;
    sortDir = 'asc';
  }
  currentPage = 1;
  filterContacts();
}

function getSortValue(c, key) {
  if (key === '_name')       return (c.name || '').toLowerCase();
  if (key === 'company')     return (c.company || '').toLowerCase();
  if (key === 'email')       return (c.email || '').toLowerCase();
  if (key === 'phone')       return (c.phone || '').toLowerCase();
  if (key === 'stage_id')    return (c.stage_name || '').toLowerCase();
  if (key === 'assigned_to') return (c.assigned_to_name || '').toLowerCase();
  if (key === 'created_at')  return c.created_at ? new Date(c.created_at).getTime() : 0;
  const f = fields.find(f => f.field_key === key);
  const v = c.custom_data?.[key];
  if (f?.type === 'number') return parseFloat(v) || 0;
  if (f?.type === 'date')   return v ? new Date(v).getTime() : 0;
  return (v || '').toString().toLowerCase();
}

function sortContacts(list) {
  if (!sortKey) return list;
  return [...list].sort((a, b) => {
    const va = getSortValue(a, sortKey);
    const vb = getSortValue(b, sortKey);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

function renderContactsTable(list) {
  const table = document.getElementById('contacts-table');
  if (!table) return;
  const visibleCols = effectiveContactColumns().filter(c => c.visible);
  const colKeys     = ['_name', ...visibleCols.map(c => c.key)];

  // Remove existing colgroup + reset layout so the browser auto-sizes for measurement
  const existingCg = table.querySelector('colgroup');
  if (existingCg) table.removeChild(existingCg);
  table.style.tableLayout = '';

  // Sort the full list before paginating
  const sorted = sortContacts(list);

  // Build thead with sort indicators (no resize handles yet — added via DOM after measurement)
  document.getElementById('contacts-thead').innerHTML = `<tr>
    ${colKeys.map(k => {
      const col   = visibleCols.find(c => c.key === k);
      const label = k === '_name' ? t('col_name') : col?.label() || '';
      const isActive = sortKey === k;
      const icon = isActive
        ? `<span class="sort-icon active">${sortDir === 'asc' ? '↑' : '↓'}</span>`
        : `<span class="sort-icon">⇅</span>`;
      return `<th data-col-key="${k}" class="sortable-col${isActive ? ' sort-active' : ''}" onclick="toggleSort('${k}')">${label}${icon}</th>`;
    }).join('')}
  </tr>`;

  // Paginate the sorted list
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageList = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Build tbody
  document.getElementById('contacts-body').innerHTML = pageList.map(c => {
    const dash  = '<span class="muted-dash">—</span>';
    const cells = visibleCols.map(col => {
      if (col.key === 'company')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'company','text')" title="${esc(c.company||'')}">${esc(c.company||'')||dash}</td>`;
      if (col.key === 'email')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'email','email')" title="${esc(c.email||'')}">${esc(c.email||'')||dash}</td>`;
      if (col.key === 'phone')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'phone','phone')" title="${esc(c.phone||'')}">${esc(c.phone||'')||dash}</td>`;
      if (col.key === 'stage_id') {
        const stage = stages.find(s => s.id === c.stage_id);
        const badge = stage ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${stage.color}"></span>${esc(stage.name)}</span>` : dash;
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'stage_id','stage')">${badge}</td>`;
      }
      if (col.key === 'assigned_to')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'assigned_to','assignee')" title="${esc(c.assigned_to_name||'')}">${esc(c.assigned_to_name||'')||dash}</td>`;
      if (col.key === 'created_at')
        return `<td title="${esc(String(c.created_at||''))}">${fmtDate(c.created_at)||dash}</td>`;
      const v = c.custom_data?.[col.key] ?? '';
      return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'${col.key}','${col.type}')" title="${esc(v)}">${esc(v)||dash}</td>`;
    }).join('');

    const waHref = waLink(c.phone, c);
    return `<tr>
      <td class="name-cell" title="${esc(c.name)}">
        ${waHref ? `<a class="btn-wa-inline" href="${waHref}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.name)}">${WA_SVG}</a>` : ''}
        <strong class="contact-name-link" onclick="openDetail(${c.id})">${esc(c.name)}</strong>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  // Render pagination bar
  renderPagination(sorted.length);

  // Measure natural widths for any column not yet in colWidths (forces reflow)
  let measured = false;
  document.querySelectorAll('#contacts-thead th').forEach(th => {
    const key = th.dataset.colKey;
    if (key && !colWidths[key]) {
      colWidths[key] = Math.max(60, Math.round(th.getBoundingClientRect().width));
      measured = true;
    }
  });
  if (measured) saveColWidths();

  // Build and insert colgroup with stored widths
  const cg = document.createElement('colgroup');
  colKeys.forEach(key => {
    const col = document.createElement('col');
    col.style.width = (colWidths[key] || 100) + 'px';
    cg.appendChild(col);
  });
  table.insertBefore(cg, table.firstChild);
  table.style.tableLayout = 'fixed';

  // Add resize handles to th elements (except the last actions column)
  const ths  = document.querySelectorAll('#contacts-thead th');
  const cols = cg.children;
  ths.forEach((th, i) => {
    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    const colEl = cols[i];
    handle.addEventListener('mousedown', e => { e.stopPropagation(); startColResize(e, colKeys[i], colEl); });
    handle.addEventListener('click', e => e.stopPropagation());
    th.appendChild(handle);
  });
}

function startInlineEdit(td, contactId, fieldKey, fieldType) {
  if (td.querySelector('input,select')) return;
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;
  const originalHTML = td.innerHTML;

  const isSelect = fieldType === 'stage' || fieldType === 'assignee' || fieldType === 'dropdown';
  let el;

  if (isSelect) {
    el = document.createElement('select');
    el.className = 'inline-select';

    if (fieldType === 'stage') {
      el.innerHTML = `<option value="">${t('opt_no_stage')}</option>` +
        stages.map(s => `<option value="${s.id}"${contact.stage_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    } else if (fieldType === 'assignee') {
      el.innerHTML = `<option value="">${t('opt_unassigned')}</option>` +
        members.map(m => `<option value="${m.id}"${contact.assigned_to === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
    } else {
      const fDef = fields.find(f => f.field_key === fieldKey);
      const opts = Array.isArray(fDef?.options) ? fDef.options : [];
      const cur = contact.custom_data?.[fieldKey] ?? '';
      el.innerHTML = '<option value="">—</option>' +
        opts.map(o => `<option value="${esc(o)}"${cur === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
    }

    el.onchange = async () => {
      const raw = el.value;
      const val = (fieldType === 'stage' || fieldType === 'assignee') ? (raw ? parseInt(raw) : null) : (raw || null);
      td.innerHTML = originalHTML;
      await commitInlineEdit(contactId, fieldKey, fieldType, val);
    };
    el.onkeydown = e => { if (e.key === 'Escape') td.innerHTML = originalHTML; };
    el.onblur = () => { if (td.contains(el)) td.innerHTML = originalHTML; };
  } else {
    el = document.createElement('input');
    el.className = 'inline-input';
    el.type = { email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' }[fieldType] || 'text';
    const builtinKeys = ['company', 'email', 'phone'];
    el.value = builtinKeys.includes(fieldKey) ? (contact[fieldKey] || '') : (contact.custom_data?.[fieldKey] ?? '');
    const origVal = el.value;

    el.onblur = async () => {
      const val = el.value.trim();
      td.innerHTML = originalHTML;
      if (val !== origVal) await commitInlineEdit(contactId, fieldKey, fieldType, val || null);
    };
    el.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.onblur = null; td.innerHTML = originalHTML; }
    };
  }

  td.innerHTML = '';
  td.appendChild(el);
  el.focus();
  if (el.select && fieldType !== 'date') el.select();
}

async function commitInlineEdit(contactId, fieldKey, fieldType, value) {
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  if (fieldType === 'stage') {
    contact.stage_id = value;
    const s = stages.find(s => s.id === value);
    contact.stage_name  = s?.name  || null;
    contact.stage_color = s?.color || null;
  } else if (fieldType === 'assignee') {
    contact.assigned_to = value;
    const m = members.find(m => m.id === value);
    contact.assigned_to_name = m?.name || null;
  } else if (['company','email','phone'].includes(fieldKey)) {
    contact[fieldKey] = value;
  } else {
    contact.custom_data = { ...(contact.custom_data || {}), [fieldKey]: value };
  }

  await api.put(`/api/contacts/${contactId}`, {
    name:        contact.name,
    company:     contact.company,
    email:       contact.email,
    phone:       contact.phone,
    stage_id:    contact.stage_id,
    assigned_to: contact.assigned_to,
    custom_data: contact.custom_data || {}
  });

  filterContacts();
  if (document.getElementById('page-deals').classList.contains('active')) renderDealsBoard();
}

function onContactSearch() {
  currentPage = 1;
  filterContacts();
}

function filterContacts() {
  const q = document.getElementById('contact-search').value.toLowerCase();
  let filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.company||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q)
  );

  for (const [key, values] of Object.entries(activeFilters)) {
    if (!values?.length) continue;
    filtered = filtered.filter(c => {
      const cv = key === 'stage_id'    ? (c.stage_id    == null ? '' : String(c.stage_id))
               : key === 'assigned_to' ? (c.assigned_to == null ? '' : String(c.assigned_to))
               : String(c.custom_data?.[key] ?? '');
      return values.includes(cv);
    });
  }

  renderContactsTable(filtered);
}

// ══════════════════════════════════════════════════════════
// CONTACT FILTERS
// ══════════════════════════════════════════════════════════
function toggleFilterPanel() {
  filterPanelOpen = !filterPanelOpen;
  const panel = document.getElementById('filter-panel');
  const btn   = document.getElementById('filter-toggle-btn');
  panel?.classList.toggle('hidden', !filterPanelOpen);
  btn?.classList.toggle('active', filterPanelOpen);
  if (filterPanelOpen) renderFilterPanel();
}

function isFiltered(key, value) {
  return (activeFilters[key] || []).includes(value);
}

function toggleFilter(key, value) {
  if (!activeFilters[key]) activeFilters[key] = [];
  const idx = activeFilters[key].indexOf(value);
  if (idx >= 0) activeFilters[key].splice(idx, 1); else activeFilters[key].push(value);
  if (!activeFilters[key].length) delete activeFilters[key];
  renderFilterPanel();
  renderFilterChips();
  currentPage = 1;
  filterContacts();
}

function clearAllFilters() {
  activeFilters = {};
  renderFilterPanel();
  renderFilterChips();
  currentPage = 1;
  filterContacts();
}

function renderFilterPanel() {
  const el = document.getElementById('filter-panel');
  if (!el || !filterPanelOpen) return;

  const hasFilters = Object.keys(activeFilters).length > 0;

  const mkOpt = (key, value, label, style = '') => {
    const on = isFiltered(key, value);
    return `<button class="filter-opt${on ? ' active' : ''}" style="${style}" onclick="toggleFilter('${key}','${value}')">${label}</button>`;
  };

  const sections = [];

  // Stage
  if (stages.length) {
    const opts = [
      mkOpt('stage_id', '', t('detail_unassigned')),
      ...stages.map(s => mkOpt('stage_id', String(s.id), esc(s.name),
        isFiltered('stage_id', String(s.id)) ? `background:${s.color};border-color:${s.color};color:#fff` : `border-color:${s.color}40`
      ))
    ].join('');
    sections.push(`<div class="filter-section"><div class="filter-section-label">${t('col_stage')}</div><div class="filter-options">${opts}</div></div>`);
  }

  // Assignee
  if (members.length) {
    const opts = [
      mkOpt('assigned_to', '', t('detail_unassigned')),
      ...members.map(m => mkOpt('assigned_to', String(m.id), esc(m.name)))
    ].join('');
    sections.push(`<div class="filter-section"><div class="filter-section-label">${t('col_assignee')}</div><div class="filter-options">${opts}</div></div>`);
  }

  // Custom dropdown fields
  fields.filter(f => f.type === 'dropdown' && f.options?.length).forEach(f => {
    const opts = f.options.map(o => mkOpt(f.field_key, o, esc(o))).join('');
    sections.push(`<div class="filter-section"><div class="filter-section-label">${esc(f.name)}</div><div class="filter-options">${opts}</div></div>`);
  });

  el.innerHTML = `
    <div class="filter-panel-header">
      <span class="filter-panel-title">Filters</span>
      ${hasFilters ? `<button class="btn btn-sm btn-ghost" onclick="clearAllFilters()">Clear all</button>` : ''}
    </div>
    <div class="filter-sections">${sections.join('') || '<p style="color:var(--muted);font-size:13px">No filterable fields available.</p>'}</div>`;
}

function renderFilterChips() {
  const el = document.getElementById('filter-chips');
  if (!el) return;

  const chips = [];
  for (const [key, values] of Object.entries(activeFilters)) {
    if (!values?.length) continue;
    values.forEach(v => {
      let prefix, label;
      if (key === 'stage_id') {
        prefix = t('col_stage');
        label  = v === '' ? t('detail_unassigned') : esc(stages.find(s => String(s.id) === v)?.name || v);
      } else if (key === 'assigned_to') {
        prefix = t('col_assignee');
        label  = v === '' ? t('detail_unassigned') : esc(members.find(m => String(m.id) === v)?.name || v);
      } else {
        const f = fields.find(f => f.field_key === key);
        prefix = esc(f?.name || key);
        label  = esc(v);
      }
      chips.push(`<span class="filter-chip"><span class="filter-chip-label">${prefix}:</span> ${label}
        <button class="filter-chip-remove" onclick="toggleFilter('${key}','${v.replace(/'/g, '&apos;')}')">✕</button>
      </span>`);
    });
  }

  el.innerHTML = chips.join('');
  el.classList.toggle('hidden', chips.length === 0);

  const count = Object.values(activeFilters).reduce((n, v) => n + v.length, 0);
  const badge = document.getElementById('filter-badge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}

function goToPage(page) {
  currentPage = page;
  filterContacts();
}

function renderPagination(total) {
  const el = document.getElementById('contacts-pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end   = Math.min(currentPage * PAGE_SIZE, total);

  const pages = buildPageNumbers(currentPage, totalPages);
  el.innerHTML = `
    <span class="pagination-info">Showing ${start}–${end} of ${total}</span>
    <div class="pagination-controls">
      <button class="page-btn" onclick="goToPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>
      ${pages.map(p => p === '…'
        ? '<span class="page-ellipsis">…</span>'
        : `<button class="page-btn${p===currentPage?' active':''}" onclick="goToPage(${p})">${p}</button>`
      ).join('')}
      <button class="page-btn" onclick="goToPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>
    </div>`;
}

function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

// ══════════════════════════════════════════════════════════
// OBJECTS (custom listing / product catalog)
// ══════════════════════════════════════════════════════════
function updateObjectsNav() {
  const name  = currentWorkspace?.object_name || 'Listings';
  const label = document.getElementById('nav-objects-label');
  const title = document.getElementById('objects-page-title');
  const btn   = document.getElementById('add-object-btn');
  const tab   = document.getElementById('settings-tab-objects');
  if (label) label.textContent = name;
  if (title) title.textContent = name;
  if (btn)   btn.textContent   = `+ Add ${name.replace(/s$/i, '')}`;
  if (tab)   tab.textContent   = name;
}

function effectiveObjectColumns() {
  const BUILTIN = [
    { key: 'created_at', label: () => t('col_created_at'), show: false },
  ];
  const ALL = [
    ...BUILTIN,
    ...objectFields.map(f => ({ key: f.field_key, label: () => f.name, type: f.type, show: true })),
  ];
  if (!objectColumns.length) return ALL.map(c => ({ ...c, visible: c.show }));
  const savedMap = Object.fromEntries(objectColumns.map(c => [c.key, c.visible]));
  const ordered  = objectColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: c.show }));
  return ordered;
}

async function loadObjects() {
  objectFields  = await api.get('/api/object-fields');
  objectColumns = currentWorkspace?.object_columns || [];
  objects       = await api.get('/api/objects');
  objCurrentPage = 1;
  setObjectView(objectViewMode, false);
  renderObjectsCurrent();
}

function setObjectView(mode, save = true) {
  objectViewMode = mode;
  if (save) localStorage.setItem('objectViewMode', mode);
  document.getElementById('obj-view-table')?.classList.toggle('active', mode === 'table');
  document.getElementById('obj-view-card')?.classList.toggle('active', mode === 'card');
  document.getElementById('objects-table-wrap')?.classList.toggle('hidden', mode === 'card');
  document.getElementById('objects-card-grid')?.classList.toggle('hidden', mode === 'table');
  if (objects.length) renderObjectsCurrent();
}

function filterObjects() {
  const q = document.getElementById('object-search').value.toLowerCase();
  const filtered = objects.filter(o => o.name.toLowerCase().includes(q));
  if (objectViewMode === 'card') renderObjectsCards(filtered);
  else renderObjectsTable(filtered);
}

function renderObjectsCurrent() {
  const q = document.getElementById('object-search')?.value.toLowerCase() || '';
  const filtered = q ? objects.filter(o => o.name.toLowerCase().includes(q)) : objects;
  if (objectViewMode === 'card') renderObjectsCards(filtered);
  else renderObjectsTable(filtered);
}

function renderObjectsCards(list) {
  const visCols = effectiveObjectColumns().filter(c => c.visible);
  const grid = document.getElementById('objects-card-grid');
  const pag  = document.getElementById('objects-pagination');
  if (!grid) return;

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (objCurrentPage > totalPages) objCurrentPage = totalPages;
  const page = list.slice((objCurrentPage - 1) * PAGE_SIZE, objCurrentPage * PAGE_SIZE);

  grid.innerHTML = page.map(o => {
    const fieldRows = visCols.map(col => {
      let val;
      if (col.key === 'created_at') {
        val = fmtDate(o.created_at) || '—';
      } else {
        const v = o.custom_data?.[col.key];
        val = v ? esc(v) : '<span style="color:var(--muted)">—</span>';
      }
      return `<div class="obj-card-field"><label>${esc(col.label())}</label><span>${val}</span></div>`;
    }).join('');

    return `<div class="obj-card" onclick="openObjectDetail(${o.id})">
      <div class="obj-card-header">
        <div class="obj-card-name">${esc(o.name)}</div>
        <div class="obj-card-actions">
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openObjectModal(${o.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteObject(${o.id})">Delete</button>
        </div>
      </div>
      ${fieldRows ? `<div class="obj-card-fields">${fieldRows}</div>` : ''}
    </div>`;
  }).join('') || '<p style="color:var(--muted);padding:20px 0">No items found.</p>';

  if (pag && totalPages > 1) {
    const s = (objCurrentPage-1)*PAGE_SIZE+1, e = Math.min(objCurrentPage*PAGE_SIZE, total);
    const pages = buildPageNumbers(objCurrentPage, totalPages);
    pag.innerHTML = `<span class="pagination-info">Showing ${s}–${e} of ${total}</span>
      <div class="pagination-controls">
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage-1})" ${objCurrentPage===1?'disabled':''}>‹</button>
        ${pages.map(p => p==='…'?'<span class="page-ellipsis">…</span>'
          :`<button class="page-btn${p===objCurrentPage?' active':''}" onclick="objGoToPage(${p})">${p}</button>`).join('')}
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage+1})" ${objCurrentPage===totalPages?'disabled':''}>›</button>
      </div>`;
  } else if (pag) { pag.innerHTML = ''; }
}

function renderObjectsTable(list) {
  const visCols = effectiveObjectColumns().filter(c => c.visible);
  const colKeys = ['_name', ...visCols.map(c => c.key)];

  document.getElementById('objects-thead').innerHTML = `<tr>
    <th>Name</th>
    ${visCols.map(c => `<th>${c.label()}</th>`).join('')}
    <th></th>
  </tr>`;

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (objCurrentPage > totalPages) objCurrentPage = totalPages;
  const page = list.slice((objCurrentPage - 1) * PAGE_SIZE, objCurrentPage * PAGE_SIZE);

  const dash = '<span class="muted-dash">—</span>';
  document.getElementById('objects-tbody').innerHTML = page.map(o => {
    const cells = visCols.map(col => {
      if (col.key === 'created_at') return `<td>${fmtDate(o.created_at)}</td>`;
      const v = o.custom_data?.[col.key] ?? '';
      return `<td class="editable-cell" onclick="startObjectInlineEdit(this,${o.id},'${col.key}','${col.type||'text'}')">${esc(v)||dash}</td>`;
    }).join('');
    return `<tr>
      <td><strong class="contact-name-link" onclick="openObjectDetail(${o.id})">${esc(o.name)}</strong></td>
      ${cells}
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-ghost" onclick="openObjectModal(${o.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteObject(${o.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');

  // Pagination
  const pagEl = document.getElementById('objects-pagination');
  if (pagEl && totalPages > 1) {
    const s = (objCurrentPage-1)*PAGE_SIZE+1, e = Math.min(objCurrentPage*PAGE_SIZE, total);
    const pages = buildPageNumbers(objCurrentPage, totalPages);
    pagEl.innerHTML = `<span class="pagination-info">Showing ${s}–${e} of ${total}</span>
      <div class="pagination-controls">
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage-1})" ${objCurrentPage===1?'disabled':''}>‹</button>
        ${pages.map(p => p==='…'?'<span class="page-ellipsis">…</span>'
          :`<button class="page-btn${p===objCurrentPage?' active':''}" onclick="objGoToPage(${p})">${p}</button>`).join('')}
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage+1})" ${objCurrentPage===totalPages?'disabled':''}>›</button>
      </div>`;
  } else if (pagEl) { pagEl.innerHTML = ''; }
}

function objGoToPage(p) { objCurrentPage = p; filterObjects(); }

function startObjectInlineEdit(td, objectId, fieldKey, fieldType) {
  if (td.querySelector('input,select')) return;
  const obj = objects.find(o => o.id === objectId);
  if (!obj) return;
  const origHTML = td.innerHTML;
  const el = document.createElement('input');
  el.className = 'inline-input';
  el.type = { number:'number', date:'date', url:'url', email:'email', phone:'tel' }[fieldType] || 'text';
  el.value = obj.custom_data?.[fieldKey] ?? '';
  const origVal = el.value;
  el.onblur = async () => {
    const val = el.value.trim();
    td.innerHTML = origHTML;
    if (val === origVal) return;
    obj.custom_data = { ...(obj.custom_data||{}), [fieldKey]: val };
    await api.put(`/api/objects/${objectId}`, { name: obj.name, custom_data: obj.custom_data });
    filterObjects();
  };
  el.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.onblur = null; td.innerHTML = origHTML; }
  };
  td.innerHTML = ''; td.appendChild(el); el.focus(); el.select?.();
}

async function openObjectModal(id) {
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  document.getElementById('object-form').reset();
  document.getElementById('object-id').value = id || '';
  const typeName = (currentWorkspace?.object_name || 'Listing').replace(/s$/i,'');
  document.getElementById('object-modal-title').textContent = id ? `Edit ${typeName}` : `Add ${typeName}`;
  document.getElementById('obj-custom-fields').innerHTML = objectFields.map(f =>
    `<div class="form-group"><label>${esc(f.name)}</label>${renderDealFieldInput(f,'')}</div>`
  ).join('');
  if (id) {
    const obj = objects.find(o => o.id === id) || await api.get(`/api/objects/${id}`);
    document.getElementById('obj-name').value = obj.name;
    objectFields.forEach(f => {
      const el = document.getElementById(`dfield-${f.field_key}`);
      if (el) el.value = obj.custom_data?.[f.field_key] ?? '';
    });
  }
  document.getElementById('object-modal').classList.remove('hidden');
}

async function saveObject(e) {
  e.preventDefault();
  const id = document.getElementById('object-id').value;
  const custom_data = Object.fromEntries(objectFields.map(f => [f.field_key, document.getElementById(`dfield-${f.field_key}`)?.value || '']));
  const payload = { name: document.getElementById('obj-name').value, custom_data };
  if (id) await api.put(`/api/objects/${id}`, payload);
  else    await api.post('/api/objects', payload);
  closeModal('object-modal');
  await loadObjects();
}

async function deleteObject(id) {
  if (!confirm('Delete this item?')) return;
  await api.del(`/api/objects/${id}`);
  objects = objects.filter(o => o.id !== id);
  filterObjects();
}

async function openObjectDetail(id) {
  const obj = await api.get(`/api/objects/${id}`);
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  // Ensure deals list is loaded for the picker
  if (!deals.length) deals = await api.get('/api/deals');

  document.getElementById('object-detail-title').textContent = obj.name;

  const fields = objectFields.map(f => {
    const v = obj.custom_data?.[f.field_key];
    return v ? `<div class="detail-item"><label>${esc(f.name)}</label><span>${esc(v)}</span></div>` : '';
  }).join('');

  const linkedDealIds = new Set((obj.deals || []).map(d => d.id));

  const dealRows = (obj.deals || []).map(d => `
    <div class="contact-deal-row" style="cursor:pointer" onclick="navigateToDeal(${d.id})">
      <div class="contact-deal-title">${esc(d.title)}</div>
      <div class="contact-deal-meta">
        ${d.stage_name ? `<span class="contact-deal-stage" style="border-color:${d.stage_color||'var(--border)'}">${esc(d.stage_name)}</span>` : ''}
        ${d.pipeline_name ? `<span style="font-size:11px;color:var(--muted)">${esc(d.pipeline_name)}</span>` : ''}
        ${d.value != null ? `<span class="contact-deal-value">€ ${Number(d.value).toLocaleString()}</span>` : ''}
      </div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:12px;padding:4px 0">No deals linked.</p>';

  document.getElementById('object-detail-body').innerHTML = `
    <div class="detail-section"><div class="detail-grid">${fields}</div></div>
    <div class="detail-section">
      <div class="detail-section-header"><h3>Deals</h3></div>
      <div class="contact-deals-list" id="obj-detail-deal-rows">${dealRows}</div>
      <div class="object-panel-add" style="margin-top:10px;align-items:flex-start">
        <div class="deal-search-wrap">
          <input type="text" id="obj-deal-search" placeholder="Search deals by name or contact…"
            autocomplete="off"
            oninput="filterDealSearch(${id})"
            onfocus="filterDealSearch(${id})" />
          <div class="deal-search-dropdown hidden" id="obj-deal-dropdown"></div>
        </div>
        <button class="btn btn-sm btn-primary" id="obj-deal-link-btn" onclick="linkDealToObject(${id})" style="flex-shrink:0">Link</button>
      </div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-danger btn-sm" onclick="deleteObject(${id});closeModal('object-detail-modal')">Delete</button>
      <button class="btn btn-sm" onclick="closeModal('object-detail-modal');openObjectModal(${id})">Edit</button>
    </div>`;

  // Store available deals + selected id on the input for easy access
  const input = document.getElementById('obj-deal-search');
  input._availableDeals = deals.filter(d => !linkedDealIds.has(d.id));
  input._selectedDealId = null;

  // Close dropdown when clicking outside
  document.addEventListener('mousedown', function closeDD(e) {
    if (!e.target.closest('#obj-deal-search') && !e.target.closest('#obj-deal-dropdown')) {
      document.getElementById('obj-deal-dropdown')?.classList.add('hidden');
      document.removeEventListener('mousedown', closeDD);
    }
  });

  document.getElementById('object-detail-modal').classList.remove('hidden');
}

function filterDealSearch(objectId) {
  const input = document.getElementById('obj-deal-search');
  const dropdown = document.getElementById('obj-deal-dropdown');
  if (!input || !dropdown) return;

  const q = input.value.toLowerCase().trim();
  const available = input._availableDeals || [];

  // Show recommended (most recent ~5) when empty, else filter
  const results = q
    ? available.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.contact_name || '').toLowerCase().includes(q)
      ).slice(0, 8)
    : available.slice(0, 5);

  if (!results.length) {
    dropdown.innerHTML = `<div class="deal-search-item dsi-empty">${q ? 'No matching deals' : 'No deals available to link'}</div>`;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = results.map(d => `
    <div class="deal-search-item" data-id="${d.id}" onclick="selectDealSearchItem(${d.id}, ${objectId})">
      <div class="dsi-title">${esc(d.title)}</div>
      <div class="dsi-meta">${d.contact_name ? esc(d.contact_name) + (d.stage_name ? ' · ' : '') : ''}${d.stage_name ? esc(d.stage_name) : ''}</div>
    </div>`).join('');

  dropdown.classList.remove('hidden');
}

function selectDealSearchItem(dealId, objectId) {
  const input = document.getElementById('obj-deal-search');
  const dropdown = document.getElementById('obj-deal-dropdown');
  const deal = (input?._availableDeals || []).find(d => d.id === dealId);
  if (!deal || !input) return;
  input.value = deal.title + (deal.contact_name ? ` — ${deal.contact_name}` : '');
  input._selectedDealId = dealId;
  dropdown?.classList.add('hidden');
}

async function linkDealToObject(objectId) {
  const input = document.getElementById('obj-deal-search');
  const dealId = input?._selectedDealId;
  if (!dealId) return;
  await api.post(`/api/objects/${objectId}/deals`, { deal_id: dealId });
  objects = await api.get('/api/objects');
  deals   = await api.get('/api/deals');
  await openObjectDetail(objectId);
}

async function navigateToDeal(dealId) {
  closeModal('object-detail-modal');
  switchPage('deals');
  await openDealModal(dealId);
}

// ── Object Fields Settings ─────────────────────────────────
function renderObjectFieldsList() {
  const el = document.getElementById('object-fields-list');
  if (!el) return;
  if (!objectFields.length) { el.innerHTML = '<li style="color:var(--muted);font-size:13px;padding:6px 10px">No fields yet.</li>'; return; }
  el.innerHTML = objectFields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span>
      <span class="row-sub">${f.type}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openObjectFieldModal(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteObjectField(${f.id})">✕</button>
      </div>
    </li>`).join('');
}

function openObjectFieldModal(id) {
  document.getElementById('object-field-form').reset();
  document.getElementById('objf-id').value = id || '';
  document.getElementById('objf-options-group').classList.add('hidden');
  document.getElementById('object-field-modal-title').textContent = id ? 'Edit Field' : 'Add Field';
  if (id) {
    const f = objectFields.find(f => f.id === id);
    document.getElementById('objf-name').value = f.name;
    document.getElementById('objf-key').value  = f.field_key;
    document.getElementById('objf-type').value = f.type;
    document.getElementById('objf-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('objf-options-group').classList.remove('hidden');
  }
  document.getElementById('object-field-modal').classList.remove('hidden');
}
function autoObjectFieldKey() {
  if (document.getElementById('objf-id').value) return;
  document.getElementById('objf-key').value = document.getElementById('objf-name').value
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function toggleObjectFieldOptions() {
  document.getElementById('objf-options-group').classList.toggle('hidden', document.getElementById('objf-type').value !== 'dropdown');
}
async function saveObjectField(e) {
  e.preventDefault();
  const id = document.getElementById('objf-id').value;
  const type = document.getElementById('objf-type').value;
  const payload = {
    name:      document.getElementById('objf-name').value,
    field_key: document.getElementById('objf-key').value,
    type,
    options: type === 'dropdown' ? document.getElementById('objf-options').value.split('\n').map(s=>s.trim()).filter(Boolean) : [],
  };
  const res = id ? await api.put(`/api/object-fields/${id}`, payload) : await api.post('/api/object-fields', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('object-field-modal');
  objectFields = await api.get('/api/object-fields');
  renderObjectFieldsList();
}
async function deleteObjectField(id) {
  if (!confirm('Delete this field?')) return;
  await api.del(`/api/object-fields/${id}`);
  objectFields = objectFields.filter(f => f.id !== id);
  renderObjectFieldsList();
}

// ── Object Columns Settings ────────────────────────────────
function renderObjectColumnSettings() {
  const el = document.getElementById('object-columns-list');
  if (!el) return;
  const cols = effectiveObjectColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="objColDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="objColDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">⠿</span>
      <span class="row-label">${col.label()}</span>
      <label class="col-vis-toggle">
        <input type="checkbox" ${col.visible?'checked':''} onchange="objColToggle(${i},this.checked)" />
      </label>
    </li>`).join('');
}
function objColDragStart(e,i){ objColDragIdx=i; e.dataTransfer.effectAllowed='move'; }
function objColDrop(e,targetIdx){
  e.preventDefault(); e.currentTarget.classList.remove('col-drag-over');
  if(objColDragIdx===null||objColDragIdx===targetIdx){objColDragIdx=null;return;}
  const cols=effectiveObjectColumns(); const moved=cols.splice(objColDragIdx,1)[0]; cols.splice(targetIdx,0,moved);
  objColDragIdx=null; objectColumns=cols.map(({key,visible})=>({key,visible})); renderObjectColumnSettings();
}
function objColToggle(i,visible){const cols=effectiveObjectColumns();cols[i].visible=visible;objectColumns=cols.map(({key,visible})=>({key,visible}));}
async function saveObjectColumns(){
  const toSave=effectiveObjectColumns().map(({key,visible})=>({key,visible}));
  const btn=document.getElementById('save-obj-cols-btn'), msgEl=document.getElementById('obj-cols-msg');
  if(btn){btn.disabled=true;btn.textContent='…';}
  const res=await api.patch('/api/workspace/object-columns',{columns:toSave});
  if(btn){btn.disabled=false;btn.textContent=t('btn_save');}
  if(res.error){if(msgEl){msgEl.textContent=res.error;msgEl.className='workspace-name-msg error';msgEl.classList.remove('hidden');}return;}
  objectColumns=toSave; currentWorkspace.object_columns=toSave;
  if(msgEl){msgEl.textContent='✓ Saved';msgEl.className='workspace-name-msg success';msgEl.classList.remove('hidden');}
  setTimeout(()=>msgEl?.classList.add('hidden'),2500);
  filterObjects();
}

// ── Object Type Name Setting ────────────────────────────────
async function saveObjectTypeName(){
  const input=document.getElementById('object-name-input'), msgEl=document.getElementById('object-name-msg');
  const name=input?.value.trim(); if(!name) return;
  const res=await api.patch('/api/workspace/object-name',{name});
  if(res.error){if(msgEl){msgEl.textContent=res.error;msgEl.className='workspace-name-msg error';msgEl.classList.remove('hidden');}return;}
  currentWorkspace.object_name=res.name; updateObjectsNav();
  if(msgEl){msgEl.textContent='✓ Saved';msgEl.className='workspace-name-msg success';msgEl.classList.remove('hidden');}
  setTimeout(()=>msgEl?.classList.add('hidden'),2500);
}

// ══════════════════════════════════════════════════════════
// MIRO BOARD
// ══════════════════════════════════════════════════════════
function updateBoardNavVisibility() {
  const link = document.getElementById('nav-board-link');
  if (link) link.classList.toggle('hidden', !currentWorkspace?.miro_url);
}

function getMiroBoardUrl(embedUrl) {
  // Convert live-embed URL to regular board URL for opening in a new tab
  if (!embedUrl) return null;
  return embedUrl.replace('/live-embed/', '/board/');
}

function reloadMiroIframe() {
  const iframe = document.getElementById('miro-iframe');
  if (iframe) { const src = iframe.src; iframe.src = ''; iframe.src = src; }
}

function loadBoard() {
  const el  = document.getElementById('board-content');
  const url = currentWorkspace?.miro_url;
  if (!el) return;
  if (!url) {
    el.innerHTML = `<div class="board-empty">
      <p>No Miro board linked yet.</p>
      <p>Go to <strong>Settings → General → Miro Board</strong> and paste your embed URL.</p>
    </div>`;
    return;
  }
  const boardUrl = getMiroBoardUrl(url);
  el.innerHTML = `
    <div class="board-topbar">
      <span class="board-topbar-hint">
        ⚠️ Seeing a login page or 403? Google blocks login inside iframes.
        Open Miro in a new tab, log in, then click Reload.
      </span>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-sm" onclick="reloadMiroIframe()">🔄 Reload</button>
        <a class="btn btn-sm btn-primary" href="${esc(boardUrl)}" target="_blank" rel="noopener">
          Open in Miro ↗
        </a>
      </div>
    </div>
    <iframe id="miro-iframe" src="${esc(url)}" class="miro-iframe"
      allow="fullscreen; clipboard-read; clipboard-write"
      referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}

async function saveMiroUrl() {
  const input = document.getElementById('miro-url-input');
  const msgEl = document.getElementById('miro-url-msg');
  const url   = input?.value.trim() || null;
  const res   = await api.patch('/api/workspace/miro-url', { url });
  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }
  currentWorkspace.miro_url = url;
  updateBoardNavVisibility();
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

// ══════════════════════════════════════════════════════════
// ACTIVITIES
// ══════════════════════════════════════════════════════════
async function loadActivities() {
  activities = await api.get('/api/activities');
  const el = document.getElementById('activities-list');
  if (!activities.length) { el.innerHTML = `<p style="color:var(--muted);padding:8px">${t('no_activities')}</p>`; return; }
  el.innerHTML = activities.map(a => `
    <div class="activity-item">
      <div class="act-icon ${a.type}">${ICONS[a.type]}</div>
      <div class="act-body">
        <div class="act-meta">
          <strong>${t('act_' + a.type)}</strong>${a.contact_name ? ` · ${esc(a.contact_name)}` : ''} · ${fmtDate(a.created_at)}
        </div>
        ${a.logged_by_name ? `<div class="act-logged-by">${t('logged_by')} ${esc(a.logged_by_name)} · <span class="act-logged-email">${esc(a.logged_by_email||'')}</span></div>` : ''}
        <div class="act-content">${esc(a.content)}</div>
      </div>
      <button class="btn btn-sm btn-danger btn-icon" onclick="deleteActivity(${a.id})">✕</button>
    </div>`).join('');
}

async function deleteActivity(id) {
  await api.del(`/api/activities/${id}`);
  loadActivities();
}

// ══════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════
let currentSettingsTab = 'general';

function switchSettingsTab(tab) {
  currentSettingsTab = tab;
  document.querySelectorAll('.settings-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  document.querySelectorAll('.settings-pane').forEach(pane =>
    pane.classList.toggle('active', pane.id === `settings-pane-${tab}`)
  );
}

async function loadSettings() {
  [stages, fields] = await Promise.all([api.get('/api/stages'), api.get('/api/fields')]);
  renderStagesList();
  renderFieldsList();
  renderContactColumnSettings();
  // Populate WA template textarea
  const waEl    = document.getElementById('wa-template-input');
  if (waEl) waEl.value = currentWorkspace?.whatsapp_template ?? 'Hi {{name}}, ';
  const miroEl  = document.getElementById('miro-url-input');
  if (miroEl) miroEl.value = currentWorkspace?.miro_url || '';
  // Load object settings
  objectFields  = await api.get('/api/object-fields');
  objectColumns = currentWorkspace?.object_columns || [];
  renderObjectFieldsList();
  renderObjectColumnSettings();
  if (currentUser?.role === 'owner') {
    const nameCard = document.getElementById('object-name-card');
    if (nameCard) { nameCard.classList.remove('hidden'); document.getElementById('object-name-input').value = currentWorkspace?.object_name || 'Listings'; }
  }
  // Load deals settings
  pipelines    = await api.get('/api/pipelines');
  dealFields   = await api.get('/api/deal-fields');
  renderPipelinesSettings();
  renderDealFieldsList();
  renderDealColumnSettings();
  // Restore active tab
  switchSettingsTab(currentSettingsTab);
  if (currentUser?.role === 'owner') {
    document.getElementById('invites-card').classList.remove('hidden');
    loadInvites();
    const wsCard = document.getElementById('workspace-name-card');
    wsCard.classList.remove('hidden');
    document.getElementById('workspace-name-input').value = currentWorkspace?.name || '';
    document.getElementById('workspace-name-msg').classList.add('hidden');

    // Show delete workspace button only if user has multiple workspaces
    const deleteCard = document.getElementById('delete-workspace-card');
    members.forEach(m => {
      if (m.id === currentUser.id) {
        const userWorkspaceCount = members.length; // Approximation - could be improved
      }
    });
    deleteCard.classList.remove('hidden');
  } else {
    document.getElementById('invites-card').classList.add('hidden');
    document.getElementById('workspace-name-card').classList.add('hidden');
    document.getElementById('delete-workspace-card').classList.add('hidden');
  }
  loadMembers();
}

async function saveWorkspaceName() {
  const input = document.getElementById('workspace-name-input');
  const msgEl = document.getElementById('workspace-name-msg');
  const name  = input.value.trim();
  if (!name) return;

  const res = await api.patch('/api/workspace/name', { name });
  if (res.error) {
    msgEl.textContent = res.error;
    msgEl.className = 'workspace-name-msg error';
    msgEl.classList.remove('hidden');
    return;
  }
  currentWorkspace.name = res.name;
  document.getElementById('sidebar-workspace').textContent = res.name;
  msgEl.textContent = '✓ Saved';
  msgEl.className = 'workspace-name-msg success';
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 2500);
}

// ── Pipeline Settings ─────────────────────────────────────
function renderPipelinesSettings() {
  const el = document.getElementById('pipelines-list');
  if (!el) return;
  if (!pipelines.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:8px 0">No pipelines yet.</p>`;
    return;
  }
  el.innerHTML = pipelines.map(p => `
    <div class="pipeline-settings-row">
      <div class="pipeline-settings-header">
        <span class="row-label" style="font-weight:600">📌 ${esc(p.name)}</span>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost btn-icon" onclick="editPipeline(${p.id},'${esc(p.name).replace(/'/g,'&apos;')}')">✏️</button>
          <button class="btn btn-sm btn-danger btn-icon" onclick="deletePipeline(${p.id})">✕</button>
        </div>
      </div>
      <div class="pipeline-stages-list">
        ${(p.stages||[]).map((s,i) => `
          <div class="settings-row pipeline-stage-row" draggable="true"
            ondragstart="pipelineStageDragStart(event,${p.id},${i})"
            ondragover="pipelineStageDragOver(event)"
            ondrop="pipelineStageDrop(event,${p.id},${i})">
            <span class="drag-handle">⠿</span>
            <span class="row-dot" style="background:${s.color}"></span>
            <span class="row-label">${esc(s.name)}</span>
            <div class="row-actions">
              <button class="btn btn-sm btn-ghost btn-icon" onclick="editPipelineStage(${p.id},${s.id},'${esc(s.name).replace(/'/g,'&apos;')}','${s.color}')">✏️</button>
              <button class="btn btn-sm btn-danger btn-icon" onclick="deletePipelineStage(${p.id},${s.id})">✕</button>
            </div>
          </div>`).join('')}
        <button class="btn btn-sm btn-ghost" style="margin-top:6px" onclick="addPipelineStage(${p.id})">+ Add stage</button>
      </div>
    </div>`).join('');
}

let pipelineStageDragIdx = null;
let pipelineStageDragPid = null;
function pipelineStageDragStart(e, pid, i) { pipelineStageDragPid = pid; pipelineStageDragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function pipelineStageDragOver(e) { e.preventDefault(); }
async function pipelineStageDrop(e, pid, targetIdx) {
  e.preventDefault();
  if (pipelineStageDragPid !== pid || pipelineStageDragIdx === null || pipelineStageDragIdx === targetIdx) return;
  const p = pipelines.find(p => p.id === pid);
  const moved = p.stages.splice(pipelineStageDragIdx, 1)[0];
  p.stages.splice(targetIdx, 0, moved);
  pipelineStageDragIdx = null;
  renderPipelinesSettings();
  await api.patch(`/api/pipelines/${pid}/stages/reorder`, { ids: p.stages.map(s => s.id) });
}

function openNewPipelineModal(id, name) {
  document.getElementById('new-pipeline-form').reset();
  document.getElementById('pipeline-edit-id').value = id || '';
  document.getElementById('pipeline-name-input').value = name || '';
  document.getElementById('pipeline-modal-title').textContent = id ? 'Rename Pipeline' : 'New Pipeline';
  document.getElementById('new-pipeline-modal').classList.remove('hidden');
}
function editPipeline(id, name) { openNewPipelineModal(id, name); }

async function saveNewPipeline(e) {
  e.preventDefault();
  const id   = document.getElementById('pipeline-edit-id').value;
  const name = document.getElementById('pipeline-name-input').value.trim();
  if (!name) return;
  if (id) await api.put(`/api/pipelines/${id}`, { name });
  else    await api.post('/api/pipelines', { name });
  closeModal('new-pipeline-modal');
  pipelines = await api.get('/api/pipelines');
  renderPipelinesSettings();
  // Refresh pipeline selector on deals page if open
  const sel = document.getElementById('deals-pipeline-select');
  if (sel) {
    sel.innerHTML = pipelines.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if (currentPipelineId) sel.value = currentPipelineId;
  }
}

async function deletePipeline(id) {
  if (!confirm('Delete this pipeline and all its deals?')) return;
  await api.del(`/api/pipelines/${id}`);
  pipelines = pipelines.filter(p => p.id !== id);
  if (currentPipelineId === id) { currentPipelineId = pipelines[0]?.id || null; deals = []; }
  renderPipelinesSettings();
}

async function addPipelineStage(pipelineId) {
  const name = prompt('Stage name:');
  if (!name?.trim()) return;
  const color = '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
  const res = await api.post(`/api/pipelines/${pipelineId}/stages`, { name: name.trim(), color });
  if (res.error) { alert(res.error); return; }
  pipelines = await api.get('/api/pipelines');
  renderPipelinesSettings();
}

async function editPipelineStage(pipelineId, stageId, currentName, currentColor) {
  const name = prompt('Stage name:', currentName);
  if (!name?.trim()) return;
  await api.put(`/api/pipelines/${pipelineId}/stages/${stageId}`, { name: name.trim(), color: currentColor });
  pipelines = await api.get('/api/pipelines');
  renderPipelinesSettings();
}

async function deletePipelineStage(pipelineId, stageId) {
  if (!confirm('Delete this stage? Deals in it will become unsorted.')) return;
  await api.del(`/api/pipelines/${pipelineId}/stages/${stageId}`);
  pipelines = await api.get('/api/pipelines');
  renderPipelinesSettings();
}

// ── Deal Fields ───────────────────────────────────────────
function renderDealFieldsList() {
  const el = document.getElementById('deal-fields-list');
  if (!el) return;
  if (!dealFields.length) { el.innerHTML = `<li style="color:var(--muted);font-size:13px;padding:6px 10px">No deal fields yet.</li>`; return; }
  el.innerHTML = dealFields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span>
      <span class="row-sub">${f.type}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openDealFieldModal(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteDealField(${f.id})">✕</button>
      </div>
    </li>`).join('');
}

function openDealFieldModal(id) {
  document.getElementById('deal-field-form').reset();
  document.getElementById('deal-field-id').value = id || '';
  document.getElementById('dff-options-group').classList.add('hidden');
  document.getElementById('deal-field-modal-title').textContent = id ? 'Edit Deal Field' : 'Add Deal Field';
  if (id) {
    const f = dealFields.find(f => f.id === id);
    document.getElementById('dff-name').value = f.name;
    document.getElementById('dff-key').value  = f.field_key;
    document.getElementById('dff-type').value = f.type;
    document.getElementById('dff-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('dff-options-group').classList.remove('hidden');
  }
  document.getElementById('deal-field-modal').classList.remove('hidden');
}

function autoDealFieldKey() {
  if (document.getElementById('deal-field-id').value) return;
  document.getElementById('dff-key').value = document.getElementById('dff-name').value
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function toggleDealFieldOptions() {
  document.getElementById('dff-options-group').classList.toggle('hidden', document.getElementById('dff-type').value !== 'dropdown');
}

async function saveDealField(e) {
  e.preventDefault();
  const id   = document.getElementById('deal-field-id').value;
  const type = document.getElementById('dff-type').value;
  const payload = {
    name:      document.getElementById('dff-name').value,
    field_key: document.getElementById('dff-key').value,
    type,
    options: type === 'dropdown'
      ? document.getElementById('dff-options').value.split('\n').map(s => s.trim()).filter(Boolean)
      : [],
  };
  const res = id ? await api.put(`/api/deal-fields/${id}`, payload) : await api.post('/api/deal-fields', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('deal-field-modal');
  dealFields = await api.get('/api/deal-fields');
  renderDealFieldsList();
}

async function deleteDealField(id) {
  if (!confirm('Delete this field?')) return;
  await api.del(`/api/deal-fields/${id}`);
  dealFields = dealFields.filter(f => f.id !== id);
  renderDealFieldsList();
}

function insertWaVar(variable) {
  const el = document.getElementById('wa-template-input');
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  el.value = el.value.slice(0, start) + variable + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + variable.length;
  el.focus();
}

async function saveWaTemplate() {
  const textarea = document.getElementById('wa-template-input');
  const msgEl    = document.getElementById('wa-template-msg');
  const template = textarea.value;

  const btn = document.getElementById('save-wa-template-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  msgEl?.classList.add('hidden');

  const res = await api.patch('/api/workspace/whatsapp-template', { template });

  if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); }
  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }
  currentWorkspace.whatsapp_template = template;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

// ── Stages ────────────────────────────────────────────────
function renderStagesList() {
  document.getElementById('stages-list').innerHTML = stages.map((s, i) => `
    <li class="settings-row" draggable="true" data-id="${s.id}"
      ondragstart="stageDragStart(event,${i})" ondragover="stageDragOver(event)" ondrop="stageDrop(event,${i})">
      <span class="drag-handle">⠿</span>
      <span class="row-dot" style="background:${s.color}"></span>
      <span class="row-label">${esc(s.name)}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openStageModal(${s.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteStage(${s.id})">✕</button>
      </div>
    </li>`).join('');
}

function stageDragStart(e, i) { dragStageIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function stageDragOver(e) { e.preventDefault(); }
async function stageDrop(e, targetIdx) {
  e.preventDefault();
  if (dragStageIdx === null || dragStageIdx === targetIdx) return;
  const moved = stages.splice(dragStageIdx, 1)[0];
  stages.splice(targetIdx, 0, moved);
  dragStageIdx = null;
  renderStagesList();
  await api.patch('/api/stages/reorder', { ids: stages.map(s => s.id) });
}

function openStageModal(id) {
  document.getElementById('stage-form').reset();
  document.getElementById('stage-id').value = id || '';
  document.getElementById('stage-color').value = '#4f6ef7';
  document.getElementById('stage-modal-title').textContent = id ? t('edit_stage_title') : t('add_stage_title');
  if (id) {
    const s = stages.find(s => s.id === id);
    document.getElementById('stage-name').value  = s.name;
    document.getElementById('stage-color').value = s.color;
  }
  document.getElementById('stage-modal').classList.remove('hidden');
}

async function saveStage(e) {
  e.preventDefault();
  const id = document.getElementById('stage-id').value;
  const payload = { name: document.getElementById('stage-name').value, color: document.getElementById('stage-color').value };
  const res = id ? await api.put(`/api/stages/${id}`, payload) : await api.post('/api/stages', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('stage-modal');
  invalidate();
  await loadSettings();
}

async function deleteStage(id) {
  if (!confirm('Delete this stage? Contacts will become unassigned.')) return;
  await api.del(`/api/stages/${id}`);
  invalidate();
  await loadSettings();
}

// ── Custom Fields ─────────────────────────────────────────
function renderFieldsList() {
  const el = document.getElementById('fields-list');
  if (!fields.length) { el.innerHTML = `<li style="color:var(--muted);font-size:13px;padding:6px 10px">${t('no_fields')}</li>`; return; }
  el.innerHTML = fields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span>
      <span class="row-sub">${f.type}${f.type==='dropdown'?` (${f.options.length} opts)`:''}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openFieldModal(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteField(${f.id})">✕</button>
      </div>
    </li>`).join('');
}

function openFieldModal(id) {
  document.getElementById('field-form').reset();
  document.getElementById('field-id').value = id || '';
  document.getElementById('field-options-group').classList.add('hidden');
  document.getElementById('field-modal-title').textContent = id ? t('edit_field_title') : t('add_field_title');
  if (id) {
    const f = fields.find(f => f.id === id);
    document.getElementById('field-name').value    = f.name;
    document.getElementById('field-key').value     = f.field_key;
    document.getElementById('field-type').value    = f.type;
    document.getElementById('field-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('field-options-group').classList.remove('hidden');
  }
  document.getElementById('field-modal').classList.remove('hidden');
}

function autoKey() {
  if (document.getElementById('field-id').value) return;
  document.getElementById('field-key').value = document.getElementById('field-name').value
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function toggleDropdownOptions() {
  document.getElementById('field-options-group').classList.toggle('hidden', document.getElementById('field-type').value !== 'dropdown');
}

async function saveField(e) {
  e.preventDefault();
  const id   = document.getElementById('field-id').value;
  const type = document.getElementById('field-type').value;
  const payload = {
    name:      document.getElementById('field-name').value,
    field_key: document.getElementById('field-key').value,
    type,
    options: type === 'dropdown'
      ? document.getElementById('field-options').value.split('\n').map(s => s.trim()).filter(Boolean)
      : [],
  };
  const res = id ? await api.put(`/api/fields/${id}`, payload) : await api.post('/api/fields', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('field-modal');
  invalidate();
  await loadSettings();
}

async function deleteField(id) {
  if (!confirm('Delete this field? Saved values will be lost.')) return;
  await api.del(`/api/fields/${id}`);
  invalidate();
  await loadSettings();
}

// ── Contact column visibility & order ────────────────────
function renderContactColumnSettings() {
  const el = document.getElementById('contact-columns-list');
  if (!el) return;
  const cols = effectiveContactColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="colDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="colDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">⠿</span>
      <span class="row-label">${col.label()}</span>
      <label class="col-vis-toggle">
        <input type="checkbox" ${col.visible ? 'checked' : ''} onchange="colToggleVisible(${i},this.checked)" />
      </label>
    </li>`).join('');
}

function colDragStart(e, i) {
  colDragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}
function colDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('col-drag-over'); }
function colDragLeave(e) { e.currentTarget.classList.remove('col-drag-over'); }
function colDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('col-drag-over');
  if (colDragIdx === null || colDragIdx === targetIdx) { colDragIdx = null; return; }
  const cols  = effectiveContactColumns();
  const moved = cols.splice(colDragIdx, 1)[0];
  cols.splice(targetIdx, 0, moved);
  colDragIdx     = null;
  contactColumns = cols.map(({ key, visible }) => ({ key, visible }));
  renderContactColumnSettings();
}
function colToggleVisible(i, visible) {
  const cols  = effectiveContactColumns();
  cols[i].visible = visible;
  contactColumns  = cols.map(({ key, visible }) => ({ key, visible }));
}

async function saveContactColumns() {
  // Snapshot effective columns so we always save a full list, not just []
  const toSave = effectiveContactColumns().map(({ key, visible }) => ({ key, visible }));
  const btn    = document.getElementById('save-contact-cols-btn');
  const msgEl  = document.getElementById('contact-cols-msg');

  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  msgEl?.classList.add('hidden');

  const res = await api.patch('/api/workspace/contact-columns', { columns: toSave });

  if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); }

  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }

  contactColumns = toSave;
  currentWorkspace.contact_columns = toSave;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
  filterContacts();
}

// ── Kanban field visibility ───────────────────────────────
function renderKanbanFields() {
  const el = document.getElementById('kanban-fields-list');
  if (!el) return;
  const allOptions = [
    ...BUILTIN_FIELDS,
    ...fields.map(f => ({ key: f.field_key, label: f.name, type: f.type })),
  ];
  el.innerHTML = allOptions.map(f => `
    <label class="kanban-check-row">
      <input type="checkbox" value="${esc(f.key)}" ${kanbanFields.includes(f.key) ? 'checked' : ''} />
      <span class="kanban-check-label">${esc(f.label)}</span>
      <span class="kanban-check-type">${f.type}</span>
    </label>`).join('');
}

async function saveKanbanFields() {
  const checked = [...document.querySelectorAll('#kanban-fields-list input[type="checkbox"]:checked')]
    .map(cb => cb.value);
  await api.patch('/api/workspace/kanban-fields', { fields: checked });
  kanbanFields = checked;
  currentWorkspace.kanban_fields = checked;
  alert('Kanban fields saved.');
}

// ── Invite Codes ──────────────────────────────────────────
async function loadInvites() {
  const codes = await api.get('/api/invites');
  document.getElementById('invites-list').innerHTML = codes.length
    ? codes.map(c => `
      <li class="settings-row">
        <span class="invite-code-val ${c.used ? 'invite-used' : ''}">${c.code}</span>
        ${c.used
          ? `<span class="row-sub">Used by ${esc(c.used_by_name||'someone')}</span>`
          : `<button class="btn btn-sm" onclick="copyCode('${c.code}')">Copy</button>
             <button class="btn btn-sm btn-danger btn-icon" onclick="deleteInviteCode(${c.id})">✕</button>`}
      </li>`).join('')
    : '<li style="color:var(--muted);font-size:13px;padding:6px 10px">No invite codes yet.</li>';
}

async function generateInviteCode() {
  await api.post('/api/invites', {});
  await loadInvites();
}

async function deleteInviteCode(id) {
  await api.del(`/api/invites/${id}`);
  await loadInvites();
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => alert(`Copied: ${code}`));
}

// ── Team Members ──────────────────────────────────────────
async function loadMembers() {
  const membersEl = document.getElementById('members-list');
  if (!membersEl) return;

  const list = await api.get('/api/workspace/members');
  if (!list || list.error || !list.length) {
    membersEl.innerHTML = '<li style="padding:12px;color:var(--muted);font-size:13px">No members yet.</li>';
    return;
  }

  membersEl.innerHTML = list.map(m => `
    <li class="settings-row">
      <div class="member-avatar">${esc(m.name[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div class="row-label">${esc(m.name)}${m.id === currentUser?.id ? ' <span style="color:var(--muted);font-weight:400">(you)</span>' : ''}</div>
        <div class="row-sub">${esc(m.email)}</div>
      </div>
      <span class="member-role">${m.role}</span>
      ${currentUser?.role === 'owner' && m.id !== currentUser?.id && m.role !== 'owner'
        ? `<button class="btn btn-sm btn-danger btn-icon" onclick="removeMember(${m.id}, '${esc(m.name)}')">Remove</button>`
        : ''}
    </li>`).join('');
}

async function removeMember(id, name) {
  if (!confirm(`Remove ${name} from this workspace? Their assigned contacts will become unassigned.`)) return;
  const res = await api.del(`/api/workspace/members/${id}`);
  if (res.error) { alert(res.error); return; }
  invalidate();
  await loadSettings();
}

// ══════════════════════════════════════════════════════════
// CONTACT MODAL
// ══════════════════════════════════════════════════════════
async function openContactModal(id) {
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  document.getElementById('contact-form').reset();
  document.getElementById('contact-id').value = id || '';
  document.getElementById('contact-modal-title').textContent = id ? t('edit_contact_title') : t('add_contact_title');

  const stageEl = document.getElementById('cf-stage');
  stageEl.innerHTML = '<option value="">— None —</option>' +
    stages.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  const assigneeEl = document.getElementById('cf-assignee');
  assigneeEl.innerHTML = '<option value="">— Unassigned —</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.name)}${m.id === currentUser?.id ? ' (you)' : ''}</option>`).join('');

  document.getElementById('cf-custom-fields').innerHTML = fields.map(f => `
    <div class="form-group"><label>${esc(f.name)}</label>${renderFieldInput(f, '')}</div>`).join('');

  if (id) {
    const c = await api.get(`/api/contacts/${id}`);
    document.getElementById('cf-name').value    = c.name;
    document.getElementById('cf-company').value = c.company || '';
    document.getElementById('cf-email').value   = c.email   || '';
    document.getElementById('cf-phone').value   = c.phone   || '';
    stageEl.value    = c.stage_id    || '';
    assigneeEl.value = c.assigned_to || '';
    fields.forEach(f => {
      const el = document.getElementById(`cfield-${f.field_key}`);
      if (el) el.value = c.custom_data?.[f.field_key] ?? '';
    });
  } else {
    // default assignee to current user
    assigneeEl.value = currentUser?.id || '';
  }
  document.getElementById('contact-modal').classList.remove('hidden');
}

function renderFieldInput(f, value) {
  const id = `cfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}">
    <option value="">— Select —</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}" ${value===o?'selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

async function saveContact(e) {
  e.preventDefault();
  const id = document.getElementById('contact-id').value;
  const custom_data = {};
  fields.forEach(f => { const el = document.getElementById(`cfield-${f.field_key}`); if (el) custom_data[f.field_key] = el.value; });
  const payload = {
    name:        document.getElementById('cf-name').value,
    company:     document.getElementById('cf-company').value,
    email:       document.getElementById('cf-email').value,
    phone:       document.getElementById('cf-phone').value,
    stage_id:    document.getElementById('cf-stage').value    || null,
    assigned_to: document.getElementById('cf-assignee').value || null,
    custom_data,
  };
  if (id) await api.put(`/api/contacts/${id}`, payload); else await api.post('/api/contacts', payload);
  closeModal('contact-modal');
  invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') loadDeals(); else loadContacts();
}

async function deleteContact(id) {
  if (!confirm('Delete this contact and all their activities?')) return;
  await api.del(`/api/contacts/${id}`);
  closeModal('detail-modal');
  invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') loadDeals(); else loadContacts();
}

// ══════════════════════════════════════════════════════════
// CONTACT DETAIL
// ══════════════════════════════════════════════════════════
async function openDetail(id) {
  await Promise.all([ensureFields()]);
  const [c, contactDeals] = await Promise.all([
    api.get(`/api/contacts/${id}`),
    api.get(`/api/deals?contact_id=${id}`),
  ]);
  document.getElementById('detail-title').textContent = c.name;

  const infoFields = [
    ['Company',  c.company],
    ['Email',    c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : null],
    ['Phone',    c.phone ? `${esc(c.phone)}${waLink(c.phone, c) ? ` <a class="wa-detail-link" href="${waLink(c.phone, c)}" target="_blank" rel="noopener" title="Open WhatsApp">${WA_SVG} WhatsApp</a>` : ''}` : null],
    ['Assignee', c.assigned_to_name],
    ...fields.map(f => {
      const val = c.custom_data?.[f.field_key];
      if (!val) return [f.name, null];
      if (f.type === 'url')   return [f.name, `<a href="${esc(val)}" target="_blank" rel="noopener">${esc(val)}</a>`];
      if (f.type === 'email') return [f.name, `<a href="mailto:${esc(val)}">${esc(val)}</a>`];
      return [f.name, esc(val)];
    }),
  ].filter(([, v]) => v);

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-grid">
        ${infoFields.map(([label, val]) => `<div class="detail-item"><label>${esc(label)}</label><span>${val}</span></div>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-header">
        <h3>Deals</h3>
        <button class="btn btn-sm btn-primary" onclick="closeModal('detail-modal');openDealModalForContact(${id})">+ Add Deal</button>
      </div>
      <div class="contact-deals-list" id="contact-deals-list">
        ${renderContactDeals(contactDeals)}
      </div>
    </div>
    <div class="detail-section">
      <h3>${t('detail_activities')}</h3>
      <div class="mini-acts" id="detail-acts">${renderMiniActs(c.activities)}</div>
    </div>
    <div class="inline-log">
      <select id="inline-type">
        <option value="note">${t('act_note')}</option>
        <option value="call">${t('act_call')}</option>
        <option value="email">${t('act_email')}</option>
        <option value="whatsapp">${t('act_whatsapp')}</option>
      </select>
      <input type="text" id="inline-content" placeholder="${t('detail_log_ph')}" />
      <button class="btn btn-primary btn-sm" onclick="logInlineActivity(${id})">${t('btn_log')}</button>
    </div>
    <div class="detail-actions">
      <button class="btn btn-danger btn-sm" onclick="deleteContact(${id})">${t('btn_delete')}</button>
      <button class="btn btn-sm" onclick="closeModal('detail-modal');openContactModal(${id})">${t('btn_edit')}</button>
    </div>`;
  document.getElementById('detail-modal').classList.remove('hidden');
}

function renderContactDeals(deals) {
  if (!deals?.length) return `<p style="color:var(--muted);font-size:12px;padding:4px 0">No deals yet.</p>`;
  return deals.map(d => {
    const fmtVal = d.value != null ? `€ ${Number(d.value).toLocaleString()}` : null;
    return `
      <div class="contact-deal-row" onclick="closeModal('detail-modal');openDealModal(${d.id})">
        <div class="contact-deal-title">${esc(d.title)}</div>
        <div class="contact-deal-meta">
          ${d.stage_name ? `<span class="contact-deal-stage" style="border-color:${d.stage_color||'var(--border)'}">
            <span style="width:7px;height:7px;border-radius:50%;background:${d.stage_color||'#9ca3af'};display:inline-block;flex-shrink:0"></span>
            ${esc(d.stage_name)}
          </span>` : ''}
          ${fmtVal ? `<span class="contact-deal-value">${fmtVal}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function openDealModalForContact(contactId) {
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  await openDealModal(null);
  // Pre-select the contact after the modal is open
  const sel = document.getElementById('df-contact');
  if (sel) sel.value = contactId;
}

function renderMiniActs(acts) {
  if (!acts?.length) return `<p style="color:var(--muted);font-size:12px">${t('no_activities')}</p>`;
  return acts.map(a => `
    <div class="mini-act">
      <span class="mini-act-type">${t('act_' + a.type)}</span>
      <div>
        <div>${esc(a.content)}</div>
        <div class="mini-act-date">${fmtDate(a.created_at)}${a.logged_by_name ? ` · ${t('logged_by')} ${esc(a.logged_by_name)}` : ''}</div>
      </div>
    </div>`).join('');
}

async function moveContactStage(contactId, stageId, el) {
  el.closest('.stage-pills').querySelectorAll('.stage-pill').forEach(p => { p.classList.remove('active'); p.style.background = ''; });
  const stage = stages.find(s => s.id === stageId);
  el.classList.add('active');
  el.style.background = stage ? stage.color : '#9ca3af';
  await api.patch(`/api/contacts/${contactId}/stage`, { stage_id: stageId });
  const c = contacts.find(c => c.id === contactId);
  if (c) c.stage_id = stageId;
  if (document.getElementById('page-deals').classList.contains('active')) renderDealsBoard();
}

async function logInlineActivity(contactId) {
  const content = document.getElementById('inline-content').value.trim();
  if (!content) return;
  await api.post('/api/activities', { contact_id: contactId, type: document.getElementById('inline-type').value, content });
  document.getElementById('inline-content').value = '';
  const c = await api.get(`/api/contacts/${contactId}`);
  document.getElementById('detail-acts').innerHTML = renderMiniActs(c.activities);
}

// ══════════════════════════════════════════════════════════
// DEAL MODAL
// ══════════════════════════════════════════════════════════
function renderDealFieldInput(f, value = '') {
  const id = `dfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}">
    <option value="">— Select —</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}"${value===o?' selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

// ── Contact Panel (right column of deal modal) ────────────
async function renderContactPanelReadOnly(contact) {
  const panel = document.getElementById('deal-contact-panel');
  if (!panel) return;

  if (!contact) {
    panel.innerHTML = `
      <div class="contact-panel-top"><div class="deal-col-label">Contact</div></div>
      <div class="contact-panel-scroll">
        <div class="contact-panel-empty">No contact linked.<br>Select one from the dropdown.</div>
      </div>`;
    return;
  }

  // Show skeleton while fetching
  panel.innerHTML = `
    <div class="contact-panel-top"><div class="deal-col-label">Contact</div></div>
    <div class="contact-panel-scroll" style="color:var(--muted);font-size:13px;padding:10px 22px">Loading…</div>`;

  // Ensure contact custom fields are loaded (needed for effectiveContactColumns)
  await ensureFields();

  const full = await api.get(`/api/contacts/${contact.id}`);

  // Mirror Contact Columns settings — exclude _name (shown as header) and stage_id
  const visibleCols = effectiveContactColumns()
    .filter(c => c.visible && c.key !== '_name' && c.key !== 'stage_id');

  const dash = '<span style="color:var(--muted)">—</span>';

  const rows = visibleCols.map(col => {
    let value;
    if (col.key === 'company') {
      value = full.company ? esc(full.company) : dash;
    } else if (col.key === 'email') {
      value = full.email
        ? `<a href="mailto:${esc(full.email)}">${esc(full.email)}</a>`
        : dash;
    } else if (col.key === 'phone') {
      value = full.phone
        ? `${esc(full.phone)}${waLink(full.phone, full) ? ` <a class="wa-detail-link" href="${waLink(full.phone,full)}" target="_blank" rel="noopener">${WA_SVG}</a>` : ''}`
        : dash;
    } else if (col.key === 'assigned_to') {
      value = full.assigned_to_name ? esc(full.assigned_to_name) : dash;
    } else if (col.key === 'created_at') {
      value = fmtDate(full.created_at) || dash;
    } else {
      // Custom contact field
      const v = full.custom_data?.[col.key];
      if (!v) { value = dash; }
      else {
        const f = fields.find(f => f.field_key === col.key);
        if (f?.type === 'url')        value = `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`;
        else if (f?.type === 'email') value = `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
        else                          value = esc(v);
      }
    }
    return { label: col.label(), value };
  });

  panel.innerHTML = `
    <div class="contact-panel-top">
      <div class="deal-col-label">Contact</div>
      <div class="contact-panel-header">
        <div class="contact-panel-name">${esc(full.name)}</div>
        <button class="btn btn-sm btn-ghost" onclick="editContactPanel(${full.id})">Edit</button>
      </div>
    </div>
    <div class="contact-panel-scroll">
      <div class="contact-panel-rows">
        ${rows.map(r => `<div class="contact-panel-row"><label>${esc(r.label)}</label><span>${r.value}</span></div>`).join('')}
      </div>
      <div class="contact-panel-section-label" style="margin-top:14px">Activities</div>
      <div class="mini-acts" id="cpanel-acts">${renderMiniActs(full.activities)}</div>
    </div>
    <div class="panel-note-form">
      <select id="cpanel-act-type">
        <option value="note">${t('act_note')}</option>
        <option value="call">${t('act_call')}</option>
        <option value="email">${t('act_email')}</option>
        <option value="whatsapp">${t('act_whatsapp')}</option>
      </select>
      <input type="text" id="cpanel-act-content" placeholder="${t('detail_log_ph')}"
        onkeydown="if(event.key==='Enter'){event.preventDefault();logContactPanelNote(${full.id});}" />
      <button id="cpanel-log-btn" class="btn btn-primary btn-sm"
        onclick="logContactPanelNote(${full.id})">${t('btn_log')}</button>
    </div>`;
}

async function logContactPanelNote(contactId) {
  const contentEl = document.getElementById('cpanel-act-content');
  const content   = contentEl?.value.trim();
  if (!content) return;
  const type = document.getElementById('cpanel-act-type')?.value || 'note';
  const btn  = document.getElementById('cpanel-log-btn');
  if (btn) btn.disabled = true;
  await api.post('/api/activities', { contact_id: contactId, type, content });
  if (contentEl) contentEl.value = '';
  if (btn) btn.disabled = false;
  // Refresh just the activities list
  const fresh = await api.get(`/api/contacts/${contactId}`);
  const actsEl = document.getElementById('cpanel-acts');
  if (actsEl) actsEl.innerHTML = renderMiniActs(fresh.activities);
  contentEl?.focus();
}

async function editContactPanel(contactId) {
  await Promise.all([ensureStages(), ensureFields()]);
  const contact = contacts.find(c => c.id === contactId) || await api.get(`/api/contacts/${contactId}`);
  const panel   = document.getElementById('deal-contact-panel');
  if (!panel) return;

  const customInputs = fields.map(f => `
    <div class="form-group">
      <label>${esc(f.name)}</label>
      <input type="text" id="cpfield-${f.field_key}" value="${esc(contact.custom_data?.[f.field_key] || '')}" />
    </div>`).join('');

  panel.innerHTML = `
    <div class="contact-panel-top">
      <div class="deal-col-label">Edit Contact</div>
    </div>
    <div class="contact-panel-scroll">
      <div class="form-group"><label>Name <span class="req">*</span></label><input type="text" id="cpanel-name" value="${esc(contact.name)}" /></div>
      <div class="form-group"><label>Company</label><input type="text" id="cpanel-company" value="${esc(contact.company||'')}" /></div>
      <div class="form-group"><label>Email</label><input type="email" id="cpanel-email" value="${esc(contact.email||'')}" /></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="cpanel-phone" value="${esc(contact.phone||'')}" /></div>
      <div class="form-group"><label>Stage</label>
        <select id="cpanel-stage">
          <option value="">— None —</option>
          ${stages.map(s => `<option value="${s.id}"${contact.stage_id===s.id?' selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      ${customInputs}
      <div class="contact-panel-edit-actions">
        <button class="btn btn-sm" onclick="cancelContactPanelEdit(${contactId})">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="saveContactPanel(${contactId})">Save Contact</button>
      </div>
    </div>`;
}

async function saveContactPanel(contactId) {
  const nameEl = document.getElementById('cpanel-name');
  if (!nameEl?.value.trim()) { alert('Name is required.'); return; }

  const custom_data = {};
  fields.forEach(f => {
    const el = document.getElementById(`cpfield-${f.field_key}`);
    if (el) custom_data[f.field_key] = el.value;
  });

  const payload = {
    name:        nameEl.value.trim(),
    company:     document.getElementById('cpanel-company')?.value || '',
    email:       document.getElementById('cpanel-email')?.value   || '',
    phone:       document.getElementById('cpanel-phone')?.value   || '',
    stage_id:    document.getElementById('cpanel-stage')?.value   || null,
    assigned_to: contacts.find(c => c.id === contactId)?.assigned_to || null,
    custom_data,
  };

  const btn = document.querySelector('#deal-contact-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const res = await api.put(`/api/contacts/${contactId}`, payload);
  if (res.error) { alert(res.error); if (btn) { btn.disabled = false; btn.textContent = 'Save Contact'; } return; }

  // Update in-memory contact
  const c = contacts.find(c => c.id === contactId);
  if (c) {
    Object.assign(c, payload);
    const stg = stages.find(s => String(s.id) === String(payload.stage_id));
    c.stage_name  = stg?.name  || null;
    c.stage_color = stg?.color || null;
  }

  renderContactPanelReadOnly(c || { id: contactId, ...payload });
}

function cancelContactPanelEdit(contactId) {
  const contact = contacts.find(c => c.id === contactId);
  renderContactPanelReadOnly(contact || null);
}

function onDealContactChange() {
  const contactId = parseInt(document.getElementById('df-contact').value) || null;
  renderContactPanelReadOnly(contacts.find(c => c.id === contactId) || null);
}

async function openDealModal(id) {
  await Promise.all([ensureContacts(), ensureMembers(), ensureStages(), ensureFields()]);
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  if (!dealFields.length) dealFields = await api.get('/api/deal-fields');

  document.getElementById('deal-form').reset();
  document.getElementById('deal-id').value = id || '';
  document.getElementById('deal-modal-title').textContent = id ? 'Edit Deal' : 'Add Deal';

  // Pipeline
  const pipelineSel = document.getElementById('df-pipeline');
  pipelineSel.innerHTML = pipelines.map(p =>
    `<option value="${p.id}"${currentPipelineId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  populateDealStages(pipelineSel.value ? parseInt(pipelineSel.value) : null, null);

  // Contact
  const contactSel = document.getElementById('df-contact');
  contactSel.innerHTML = `<option value="">— No contact —</option>` +
    contacts.map(c => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('');

  // Assignee
  const assigneeSel = document.getElementById('df-assignee');
  assigneeSel.innerHTML = `<option value="">— Unassigned —</option>` +
    members.map(m => `<option value="${m.id}"${m.id === currentUser?.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  // Custom deal fields
  document.getElementById('df-custom-fields').innerHTML = dealFields.map(f =>
    `<div class="form-group"><label>${esc(f.name)}</label>${renderDealFieldInput(f, '')}</div>`
  ).join('');

  let linkedContact = null;
  let linkedObjects = [];

  if (id) {
    const d = await api.get(`/api/deals/${id}`);
    document.getElementById('df-title').value = d.title;
    document.getElementById('df-value').value = d.value != null ? d.value : '';
    pipelineSel.value = d.pipeline_id || '';
    populateDealStages(d.pipeline_id, d.stage_id);
    contactSel.value  = d.contact_id  || '';
    assigneeSel.value = d.assigned_to || '';
    dealFields.forEach(f => {
      const el = document.getElementById(`dfield-${f.field_key}`);
      if (el) el.value = d.custom_data?.[f.field_key] ?? '';
    });
    if (d.contact_id) linkedContact = contacts.find(c => c.id === d.contact_id) || null;
    linkedObjects = d.objects || [];
  }

  // Ensure objects list is loaded for the picker
  if (!objects.length) objects = await api.get('/api/objects');

  renderContactPanelReadOnly(linkedContact);
  await renderObjectPanel(id, linkedObjects);
  document.getElementById('deal-modal').classList.remove('hidden');
}

async function renderObjectPanel(dealId, linkedObjects) {
  const label = document.getElementById('deal-object-panel-label');
  const body  = document.getElementById('deal-object-panel-body');
  if (!label || !body) return;

  const objName = currentWorkspace?.object_name || 'Objects';
  label.textContent = objName;

  if (!dealId) {
    body.innerHTML = `<div class="object-panel-empty">Save the deal first to link ${esc(objName.toLowerCase())}.</div>`;
    return;
  }

  // Ensure object fields are loaded for rendering details
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');

  const dash = `<span style="color:var(--muted)">—</span>`;

  const linkedIds = new Set(linkedObjects.map(o => o.id));
  const available = objects.filter(o => !linkedIds.has(o.id));

  const cards = linkedObjects.length
    ? linkedObjects.map(o => {
        const customData = o.custom_data || {};
        const fieldRows = objectFields.map(f => {
          const raw = customData[f.field_key];
          let val;
          if (raw === undefined || raw === null || raw === '') {
            val = dash;
          } else if (f.type === 'date') {
            val = esc(fmtDate(raw));
          } else if (f.type === 'checkbox') {
            val = raw === true || raw === 'true' || raw === '1' ? '✓ Yes' : '✗ No';
          } else if (f.type === 'select' && Array.isArray(f.options)) {
            const opt = f.options.find(op => op === raw || (typeof op === 'object' && op.value === raw));
            val = esc(typeof opt === 'object' ? opt.label : (opt || raw));
          } else {
            val = esc(String(raw));
          }
          return `<div class="object-panel-field-row">
            <label>${esc(f.name)}</label>
            <span>${val}</span>
          </div>`;
        }).join('');

        return `
          <div class="object-panel-card" id="opcard-${o.id}">
            <div class="object-panel-card-header">
              <div class="object-panel-card-name">${esc(o.name)}</div>
              <button class="object-panel-unlink" title="Unlink" onclick="unlinkObjectFromDeal(${dealId},${o.id})">×</button>
            </div>
            ${fieldRows ? `<div class="object-panel-card-fields">${fieldRows}</div>` : ''}
          </div>`;
      }).join('')
    : `<div class="object-panel-empty">No ${esc(objName.toLowerCase())} linked yet.</div>`;

  const pickerOptions = available.map(o =>
    `<option value="${o.id}">${esc(o.name)}</option>`
  ).join('');

  body.innerHTML = `
    <div id="object-panel-cards">${cards}</div>
    <div class="object-panel-add">
      <select id="object-panel-select"><option value="">— Add ${esc(objName)} —</option>${pickerOptions}</select>
      <button class="btn btn-sm btn-primary" onclick="linkObjectInDeal(${dealId})">Add</button>
    </div>`;
}

async function linkObjectInDeal(dealId) {
  const sel = document.getElementById('object-panel-select');
  const objectId = parseInt(sel?.value);
  if (!objectId) return;
  await api.post(`/api/deals/${dealId}/objects`, { object_id: objectId });
  // Refresh master objects list so the picker stays consistent
  objects = await api.get('/api/objects');
  const linked = await api.get(`/api/deals/${dealId}/objects`);
  await renderObjectPanel(dealId, linked);
}

async function unlinkObjectFromDeal(dealId, objectId) {
  await api.del(`/api/deals/${dealId}/objects/${objectId}`);
  objects = await api.get('/api/objects');
  const linked = await api.get(`/api/deals/${dealId}/objects`);
  await renderObjectPanel(dealId, linked);
}

function populateDealStages(pipelineId, selectedStageId) {
  const pipeline = pipelines.find(p => p.id === pipelineId);
  const stageSel = document.getElementById('df-stage');
  stageSel.innerHTML = `<option value="">— No stage —</option>` +
    (pipeline?.stages || []).map(s =>
      `<option value="${s.id}" ${selectedStageId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
}

function onDealPipelineChange() {
  const pid = parseInt(document.getElementById('df-pipeline').value) || null;
  populateDealStages(pid, null);
}

async function saveDeal(e) {
  e.preventDefault();
  const id = document.getElementById('deal-id').value;
  const payload = {
    title:       document.getElementById('df-title').value,
    contact_id:  document.getElementById('df-contact').value  || null,
    pipeline_id: parseInt(document.getElementById('df-pipeline').value),
    stage_id:    document.getElementById('df-stage').value    || null,
    value:       document.getElementById('df-value').value    || null,
    assigned_to: document.getElementById('df-assignee').value || null,
    custom_data: Object.fromEntries(dealFields.map(f => [f.field_key, document.getElementById(`dfield-${f.field_key}`)?.value || ''])),
  };
  if (id) await api.put(`/api/deals/${id}`, payload);
  else     await api.post('/api/deals', payload);
  closeModal('deal-modal');
  deals = await api.get(`/api/deals?pipeline_id=${currentPipelineId}`);
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal?')) return;
  await api.del(`/api/deals/${id}`);
  deals = deals.filter(d => d.id !== id);
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

// ══════════════════════════════════════════════════════════
// ACTIVITY MODAL
// ══════════════════════════════════════════════════════════
async function openActivityModal() {
  await ensureContacts();
  document.getElementById('activity-form').reset();
  document.getElementById('act-contact').innerHTML =
    '<option value="">— None —</option>' +
    contacts.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('activity-modal').classList.remove('hidden');
}

async function saveActivity(e) {
  e.preventDefault();
  await api.post('/api/activities', {
    contact_id: document.getElementById('act-contact').value || null,
    type:       document.getElementById('act-type').value,
    content:    document.getElementById('act-content').value,
  });
  closeModal('activity-modal');
  if (document.getElementById('page-activities').classList.contains('active')) loadActivities();
}

// ── Helpers ───────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

// ── Dark mode ─────────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
  const track = document.getElementById('dark-toggle-track');
  const label = document.getElementById('dark-toggle-label');
  if (track) track.classList.toggle('on', dark);
  if (label) label.textContent = t(dark ? 'light_mode' : 'dark_mode');
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = !isDark;
  localStorage.setItem('theme', next ? 'dark' : 'light');
  applyTheme(next);
}

// ══════════════════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════════════════
async function handleAdminLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('admin-login-error');
  errEl.classList.add('hidden');
  const res = await api.post('/api/admin/login', { secret: document.getElementById('admin-secret-input').value });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
  document.getElementById('admin-view-login').classList.add('hidden');
  document.getElementById('admin-view-panel').classList.remove('hidden');
  loadAdminInvites();
}

async function adminLogout(e) {
  e?.preventDefault();
  await api.post('/api/admin/logout', {});
  document.getElementById('admin-view-panel').classList.add('hidden');
  document.getElementById('admin-view-login').classList.remove('hidden');
  document.getElementById('admin-secret-input').value = '';
}

async function loadAdminInvites() {
  const invites = await api.get('/api/admin/invites');
  const el = document.getElementById('admin-invites-list');
  if (!invites.length) {
    el.innerHTML = '<p class="admin-empty">No invite codes yet. Click + Generate to create one.</p>';
    return;
  }
  el.innerHTML = invites.map(inv => `
    <div class="admin-invite-row ${inv.used ? 'used' : ''}">
      <div class="admin-invite-code">${inv.code}</div>
      <div class="admin-invite-meta">
        ${inv.used
          ? `<span class="admin-badge used">Used · ${esc(inv.used_by_workspace_name || '—')}</span>`
          : `<span class="admin-badge available">Available</span>`}
        <span class="admin-invite-date">${fmtDate(inv.created_at)}</span>
      </div>
      <div class="admin-invite-actions">
        <button class="btn btn-sm btn-ghost" onclick="adminCopyCode('${inv.code}', this)" title="Copy">📋</button>
        ${!inv.used ? `<button class="btn btn-sm btn-danger" onclick="adminDeleteCode(${inv.id})" title="Delete">✕</button>` : ''}
      </div>
    </div>`).join('');
}

async function adminGenerateCode() {
  const res = await api.post('/api/admin/invites', {});
  if (res.error) { alert(res.error); return; }
  loadAdminInvites();
}

async function adminDeleteCode(id) {
  if (!confirm('Delete this invite code?')) return;
  const res = await api.del(`/api/admin/invites/${id}`);
  if (res.error) { alert(res.error); return; }
  loadAdminInvites();
}

function adminCopyCode(code, btn) {
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

// ══════════════════════════════════════════════════════════
// CSV EXPORT
// ══════════════════════════════════════════════════════════
function exportContactsCSV() {
  if (!contacts.length) { alert('No contacts to export.'); return; }
  const hdrs = ['Name','Company','Email','Phone','Stage','Assignee', ...fields.map(f => f.name)];
  const rows = contacts.map(c => [
    c.name, c.company||'', c.email||'', c.phone||'',
    c.stage_name||'', c.assigned_to_name||'',
    ...fields.map(f => c.custom_data?.[f.field_key] ?? '')
  ]);
  const csv = [hdrs, ...rows].map(r =>
    r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
  ).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `contacts-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ══════════════════════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════════════════════
// Decode file respecting BOM — handles UTF-16 LE/BE and UTF-8 BOM
async function readFileText(file) {
  const buf   = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE)
    return new TextDecoder('utf-16le').decode(buf).replace(/^﻿/, '');
  if (bytes[0] === 0xFE && bytes[1] === 0xFF)
    return new TextDecoder('utf-16be').decode(buf).replace(/^﻿/, '');
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return new TextDecoder('utf-8').decode(buf.slice(3));
  return file.text();
}

// Detect the delimiter used in the first line
function detectDelimiter(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const tabs   = (first.match(/\t/g)  || []).length;
  const commas = (first.match(/,/g)   || []).length;
  const semis  = (first.match(/;/g)   || []).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function parseCSV(text, delimiter = ',') {
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delimiter && !inQ) { row.push(cur); cur = ''; }
      else cur += ch;
    }
    row.push(cur);
    result.push(row);
  }
  return result;
}

function toFieldKey(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function autoMapHeader(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, ' ');
  if (['name','full name','contact name','contact',
       'vollständiger_name','vollständiger name','full_name','vor- und nachname'].includes(h)) return 'name';
  if (['email','e-mail','email address','e-mail-adresse','emailadresse',
       'e_mail','email_address'].includes(h)) return 'email';
  if (['phone','mobile','telephone','tel','phone number','phone no',
       'telefonnummer','telefon','handy','mobilnummer','mobile number',
       'phone_number','telefonnr'].includes(h)) return 'phone';
  if (['company','organization','org','account','company name',
       'firma','unternehmen','firmenname'].includes(h)) return 'company';
  if (['stage','status','pipeline stage','deal stage','phase'].includes(h)) return 'stage';
  if (['assignee','owner','assigned to','assigned_to','zuständig'].includes(h)) return 'assignee';
  const cf = fields.find(f => f.name.toLowerCase() === h || f.field_key === toFieldKey(h));
  if (cf) return `custom:${cf.field_key}`;
  return 'skip';
}

function openImportModal() {
  importData = null;
  showImportStep('upload');
  const fi = document.getElementById('import-file-input');
  if (fi) fi.value = '';
  document.getElementById('import-modal').classList.remove('hidden');
}

function showImportStep(step) {
  ['upload','map','done'].forEach(s =>
    document.getElementById(`import-step-${s}`).classList.toggle('hidden', s !== step)
  );
}

function handleImportDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  if (file) processImportFile(file);
}

function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (file) processImportFile(file);
}

async function processImportFile(file) {
  const text      = await readFileText(file);
  const delimiter = detectDelimiter(text);
  const allRows   = parseCSV(text, delimiter);
  if (allRows.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }

  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);

  const headers  = allRows[0].map(h => h.trim());
  const dataRows = allRows.slice(1).filter(r => r.some(v => v.trim()));
  const sampleRow = allRows[1] || [];

  importData = {
    headers,
    rows: dataRows,
    sampleRow,
    mappings: headers.map(h => ({ mapTo: autoMapHeader(h), newFieldName: h }))
  };

  renderImportMapping();
  showImportStep('map');
}

function renderImportMapping() {
  const { headers, sampleRow, mappings, rows } = importData;

  document.getElementById('import-info-text').textContent =
    `${rows.length} row${rows.length !== 1 ? 's' : ''} detected — match each column to a CRM field.`;

  const builtins = [
    { val:'name',     label:'Name *'   },
    { val:'email',    label:'Email'    },
    { val:'phone',    label:'Phone'    },
    { val:'company',  label:'Company'  },
    { val:'stage',    label:'Stage'    },
    { val:'assignee', label:'Assignee' },
  ];

  const buildOptions = cur => {
    let o = `<option value="skip"${cur==='skip'?' selected':''}>— Don't import —</option>
      <optgroup label="Contact fields">
        ${builtins.map(b => `<option value="${b.val}"${cur===b.val?' selected':''}>${b.label}</option>`).join('')}
      </optgroup>`;
    if (fields.length) {
      o += `<optgroup label="Custom fields">
        ${fields.map(f => `<option value="custom:${f.field_key}"${cur===`custom:${f.field_key}`?' selected':''}>${esc(f.name)}</option>`).join('')}
      </optgroup>`;
    }
    o += `<optgroup label="New field">
      <option value="new"${cur==='new'?' selected':''}>Create as custom field…</option>
    </optgroup>`;
    return o;
  };

  document.getElementById('import-map-rows').innerHTML = headers.map((h, i) => {
    const sample = (sampleRow[i] || '').trim().slice(0, 60);
    const m = mappings[i];
    return `<div class="import-map-row">
      <div class="import-col-info">
        <div class="import-col-header">${esc(h)}</div>
        ${sample ? `<div class="import-col-sample">${esc(sample)}</div>` : ''}
      </div>
      <div class="import-col-arrow">→</div>
      <div class="import-col-map">
        <select class="import-map-sel" onchange="onImportMapChange(this,${i})">${buildOptions(m.mapTo)}</select>
        <input type="text" class="import-new-name${m.mapTo==='new'?'':' hidden'}"
          placeholder="Field name" value="${esc(m.newFieldName)}"
          oninput="importData.mappings[${i}].newFieldName=this.value" />
      </div>
    </div>`;
  }).join('');
}

function onImportMapChange(sel, idx) {
  importData.mappings[idx].mapTo = sel.value;
  sel.closest('.import-col-map').querySelector('.import-new-name')
    .classList.toggle('hidden', sel.value !== 'new');
}

function importBack() {
  showImportStep('upload');
  document.getElementById('import-file-input').value = '';
  importData = null;
}

async function runImport() {
  const { headers, rows, mappings } = importData;

  if (!mappings.some(m => m.mapTo === 'name')) {
    alert('Please map a column to "Name" before importing.');
    return;
  }

  // Collect new fields
  const newFields = [];
  const newKeyByCol = {};
  mappings.forEach((m, i) => {
    if (m.mapTo !== 'new') return;
    const label = (m.newFieldName || headers[i]).trim();
    const key   = toFieldKey(label) || `col_${i}`;
    if (!fields.find(f => f.field_key === key) && !newFields.find(f => f.field_key === key)) {
      newFields.push({ name: label, field_key: key });
    }
    newKeyByCol[i] = toFieldKey((m.newFieldName || headers[i]).trim()) || `col_${i}`;
  });

  // Build contact rows
  const contactsList = rows.map(row => {
    const c = { custom_data: {} };
    mappings.forEach((m, i) => {
      const val = (row[i] || '').trim();
      if (!val || m.mapTo === 'skip') return;
      if      (m.mapTo === 'name')    c.name    = val;
      else if (m.mapTo === 'email')   c.email   = val;
      else if (m.mapTo === 'phone')   c.phone   = val.replace(/^p:/i, '').trim();
      else if (m.mapTo === 'company') c.company = val;
      else if (m.mapTo === 'stage') {
        const s = stages.find(s => s.name.toLowerCase() === val.toLowerCase());
        if (s) c.stage_id = s.id;
      }
      else if (m.mapTo === 'assignee') {
        const mem = members.find(mem =>
          mem.name.toLowerCase()  === val.toLowerCase() ||
          mem.email.toLowerCase() === val.toLowerCase()
        );
        if (mem) c.assigned_to = mem.id;
      }
      else if (m.mapTo.startsWith('custom:')) {
        c.custom_data[m.mapTo.slice(7)] = val;
      }
      else if (m.mapTo === 'new' && newKeyByCol[i]) {
        c.custom_data[newKeyByCol[i]] = val;
      }
    });
    return c;
  }).filter(c => c.name);

  const btn = document.getElementById('import-run-btn');
  btn.disabled = true;
  btn.textContent = 'Importing…';

  const res = await api.post('/api/contacts/import', { contacts: contactsList, newFields });

  btn.disabled = false;
  btn.textContent = 'Import contacts';

  document.getElementById('import-done-text').textContent =
    `Successfully imported ${res.imported} contact${res.imported !== 1 ? 's' : ''}.`;
  showImportStep('done');
  invalidate();
}

// Apply saved theme before first render
(function () {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : prefersDark);
})();

// ── Boot ──────────────────────────────────────────────────
init();
