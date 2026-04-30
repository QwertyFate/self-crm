// ── State ─────────────────────────────────────────────────
let currentUser      = null;
let currentWorkspace = null;
let kanbanFields     = ['company', 'email'];

let contacts   = [];
let stages     = [];
let fields     = [];
let activities = [];
let members    = [];
let dragContactId  = null;
let dragStageIdx   = null;
let colDragIdx     = null;
let importData     = null;
let contactColumns = []; // [{key, visible}] — empty = all visible in default order
let currentLang   = localStorage.getItem('lang') || 'en';

// ── Translations ──────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    nav_pipeline:'Pipeline', nav_contacts:'Contacts', nav_activities:'Activities', nav_settings:'Settings',
    dark_mode:'Dark mode', light_mode:'Light mode', logout:'Log out',
    page_pipeline:'Pipeline', page_contacts:'Contacts', page_activities:'Activities', page_settings:'Settings',
    add_contact:'+ Add Contact', log_activity:'+ Log Activity',
    import_csv:'⬆ Import CSV', export_csv:'⬇ Export CSV',
    col_name:'Name', col_company:'Company', col_email:'Email', col_phone:'Phone', col_stage:'Stage', col_assignee:'Assignee',
    search_ph:'Search contacts…',
    no_activities:'No activities yet.', no_fields:'No custom fields yet.',
    drop_here:'Drop contacts here', unassigned:'Unassigned',
    act_note:'Note', act_call:'Call', act_email:'Email',
    logged_by:'by',
    set_stages:'Pipeline Stages', set_fields:'Custom Fields', set_kanban:'Kanban Card Fields',
    set_invites:'Invite Codes', set_members:'Team Members', set_language:'Language', set_workspace:'Workspace',
    set_contact_cols:'Contact Columns', hint_contact_cols:'Drag to reorder. Name is always first.',
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
    nav_pipeline:'Pipeline', nav_contacts:'Kontakte', nav_activities:'Aktivitäten', nav_settings:'Einstellungen',
    dark_mode:'Dunkelmodus', light_mode:'Hellmodus', logout:'Abmelden',
    page_pipeline:'Pipeline', page_contacts:'Kontakte', page_activities:'Aktivitäten', page_settings:'Einstellungen',
    add_contact:'+ Kontakt hinzufügen', log_activity:'+ Aktivität erfassen',
    import_csv:'⬆ CSV importieren', export_csv:'⬇ CSV exportieren',
    col_name:'Name', col_company:'Unternehmen', col_email:'E-Mail', col_phone:'Telefon', col_stage:'Phase', col_assignee:'Zuständig',
    search_ph:'Kontakte suchen…',
    no_activities:'Noch keine Aktivitäten.', no_fields:'Noch keine benutzerdefinierten Felder.',
    drop_here:'Kontakte hierher ziehen', unassigned:'Nicht zugewiesen',
    act_note:'Notiz', act_call:'Anruf', act_email:'E-Mail',
    logged_by:'von',
    set_stages:'Pipeline-Phasen', set_fields:'Benutzerdefinierte Felder', set_kanban:'Kanban-Kartenfelder',
    set_invites:'Einladungscodes', set_members:'Teammitglieder', set_language:'Sprache', set_workspace:'Arbeitsbereich',
    set_contact_cols:'Kontaktspalten', hint_contact_cols:'Zum Neuanordnen ziehen. Name steht immer an erster Stelle.',
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
  if (page === 'pipeline')   renderPipeline();
  if (page === 'contacts')   filterContacts();
  if (page === 'activities') loadActivities();
  if (page === 'settings')   loadSettings();
}

const ICONS = { note: '📝', call: '📞', email: '✉️' };
const BUILTIN_FIELDS = [
  { key: 'company',  label: 'Company',  type: 'text' },
  { key: 'email',    label: 'Email',    type: 'email' },
  { key: 'phone',    label: 'Phone',    type: 'phone' },
  { key: 'assignee', label: 'Assignee', type: 'text' },
];

// ── API ───────────────────────────────────────────────────
const api = {
  get:   url      => fetch(url).then(r => r.json()),
  post:  (url, d) => fetch(url, { method:'POST',   headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  put:   (url, d) => fetch(url, { method:'PUT',    headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  patch: (url, d) => fetch(url, { method:'PATCH',  headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  del:   url      => fetch(url, { method:'DELETE' }).then(r => r.json()),
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
  loadPipeline();
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
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.sidebar-nav a[data-page="${page}"]`)?.classList.add('active');
  document.getElementById(`page-${page}`).classList.add('active');
  if (page === 'pipeline')   loadPipeline();
  if (page === 'contacts')   loadContacts();
  if (page === 'activities') loadActivities();
  if (page === 'settings')   loadSettings();
}

// ── Shared loaders ────────────────────────────────────────
function invalidate() { contacts = []; stages = []; fields = []; members = []; }
async function ensureStages()   { if (!stages.length)   stages   = await api.get('/api/stages'); }
async function ensureFields()   { if (!fields.length)   fields   = await api.get('/api/fields'); }
async function ensureContacts() { if (!contacts.length) contacts = await api.get('/api/contacts'); }
async function ensureMembers()  { if (!members.length)  members  = await api.get('/api/workspace/members'); }

// ══════════════════════════════════════════════════════════
// PIPELINE
// ══════════════════════════════════════════════════════════
async function loadPipeline() {
  await Promise.all([ensureStages(), ensureFields(), ensureContacts()]);
  renderPipeline();
}

function renderPipeline() {
  const board = document.getElementById('pipeline-board');

  const unassigned = contacts.filter(c => !c.stage_id);
  const cols = [
    { id: null, name: t('unassigned'), color: '#9ca3af', items: unassigned },
    ...stages.map(s => ({ ...s, items: contacts.filter(c => c.stage_id === s.id) })),
  ];

  board.innerHTML = cols.map(col => `
    <div class="pipeline-col">
      <div class="col-header">
        <span class="col-dot" style="background:${col.color}"></span>
        <span class="col-name">${esc(col.name)}</span>
        <span class="col-count">${col.items.length}</span>
      </div>
      <div class="col-cards"
        data-stage-id="${col.id ?? 'null'}"
        ondragover="onDragOver(event)"
        ondragleave="onDragLeave(event)"
        ondrop="onDrop(event, ${col.id ?? null})">
        ${col.items.length
          ? col.items.map(c => contactCard(c)).join('')
          : `<div class="col-empty">${t('drop_here')}</div>`}
      </div>
    </div>`).join('');
}

function contactCard(c) {
  const visibleFields = kanbanFields.map(key => {
    if (key === 'company'  && c.company)           return { val: c.company,           isLink: false };
    if (key === 'email'    && c.email)              return { val: c.email,             isLink: true  };
    if (key === 'phone'    && c.phone)              return { val: c.phone,             isLink: false };
    if (key === 'assignee' && c.assigned_to_name)  return { val: c.assigned_to_name,  isLink: false };
    const f = fields.find(f => f.field_key === key);
    if (f) {
      const val = c.custom_data?.[key];
      if (val) return { val, isLink: f.type === 'url' || f.type === 'email' };
    }
    return null;
  }).filter(Boolean);

  return `
    <div class="contact-card" draggable="true" data-id="${c.id}"
      ondragstart="onDragStart(event, ${c.id})" ondragend="onDragEnd(event)"
      onclick="openDetail(${c.id})">
      <div class="card-name">${esc(c.name)}</div>
      ${visibleFields.map(f => `<div class="card-field${f.isLink ? ' link' : ''}">${esc(f.val)}</div>`).join('')}
      <div class="card-actions">
        <button class="btn btn-sm btn-ghost btn-icon" title="Edit" onclick="event.stopPropagation();openContactModal(${c.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" title="Delete" onclick="event.stopPropagation();deleteContact(${c.id})">✕</button>
      </div>
    </div>`;
}

// ── Drag & Drop ───────────────────────────────────────────
function onDragStart(e, id) {
  dragContactId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}
function onDragEnd(e)   { e.target.classList.remove('dragging'); }
function onDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function onDrop(e, stageId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragContactId) return;
  const contact = contacts.find(c => c.id === dragContactId);
  if (!contact || contact.stage_id === stageId) return;
  contact.stage_id = stageId;
  renderPipeline();
  await api.patch(`/api/contacts/${dragContactId}/stage`, { stage_id: stageId });
  dragContactId = null;
}

// ══════════════════════════════════════════════════════════
// CONTACTS TABLE
// ══════════════════════════════════════════════════════════
async function loadContacts() {
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  contacts = await api.get('/api/contacts');
  renderContactsTable(contacts);
}

// Returns ordered, merged column definitions respecting saved config + current fields
function effectiveContactColumns() {
  const BUILTIN = [
    { key: 'company',     label: () => t('col_company'), type: 'text'     },
    { key: 'email',       label: () => t('col_email'),   type: 'email'    },
    { key: 'phone',       label: () => t('col_phone'),   type: 'phone'    },
    { key: 'stage_id',    label: () => t('col_stage'),   type: 'stage'    },
    { key: 'assigned_to', label: () => t('col_assignee'),type: 'assignee' },
  ];
  const ALL = [
    ...BUILTIN,
    ...fields.map(f => ({ key: f.field_key, label: () => f.name, type: f.type })),
  ];

  if (!contactColumns.length) return ALL.map(c => ({ ...c, visible: true }));

  const savedMap = Object.fromEntries(contactColumns.map(c => [c.key, c.visible]));
  const ordered  = contactColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  // Append any new fields not in saved config
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: true }));
  return ordered;
}

function renderContactsTable(list) {
  const cols = effectiveContactColumns().filter(c => c.visible);

  document.getElementById('contacts-thead').innerHTML = `<tr>
    <th>${t('col_name')}</th>
    ${cols.map(c => `<th>${c.label()}</th>`).join('')}
    <th></th>
  </tr>`;

  document.getElementById('contacts-body').innerHTML = list.map(c => {
    const cells = cols.map(col => {
      const dash = '<span class="muted-dash">—</span>';
      if (col.key === 'company')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'company','text')">${esc(c.company||'')||dash}</td>`;
      if (col.key === 'email')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'email','email')">${esc(c.email||'')||dash}</td>`;
      if (col.key === 'phone')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'phone','phone')">${esc(c.phone||'')||dash}</td>`;
      if (col.key === 'stage_id') {
        const stage = stages.find(s => s.id === c.stage_id);
        const badge = stage ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${stage.color}"></span>${esc(stage.name)}</span>` : dash;
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'stage_id','stage')">${badge}</td>`;
      }
      if (col.key === 'assigned_to')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'assigned_to','assignee')">${esc(c.assigned_to_name||'')||dash}</td>`;
      // Custom field
      const v = c.custom_data?.[col.key] ?? '';
      return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'${col.key}','${col.type}')">${esc(v)||dash}</td>`;
    }).join('');

    return `<tr>
      <td><strong class="contact-name-link" onclick="openDetail(${c.id})">${esc(c.name)}</strong></td>
      ${cells}
      <td class="row-actions" style="white-space:nowrap">
        <button class="btn btn-sm btn-ghost" onclick="openDetail(${c.id})">${t('btn_view')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteContact(${c.id})">${t('btn_delete')}</button>
      </td>
    </tr>`;
  }).join('');
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
  if (document.getElementById('page-pipeline').classList.contains('active')) renderPipeline();
}

function filterContacts() {
  const q = document.getElementById('contact-search').value.toLowerCase();
  renderContactsTable(contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.company||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q)
  ));
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
async function loadSettings() {
  [stages, fields] = await Promise.all([api.get('/api/stages'), api.get('/api/fields')]);
  renderStagesList();
  renderFieldsList();
  renderKanbanFields();
  renderContactColumnSettings();
  if (currentUser?.role === 'owner') {
    document.getElementById('invites-card').classList.remove('hidden');
    loadInvites();
    const wsCard = document.getElementById('workspace-name-card');
    wsCard.classList.remove('hidden');
    document.getElementById('workspace-name-input').value = currentWorkspace?.name || '';
    document.getElementById('workspace-name-msg').classList.add('hidden');
  } else {
    document.getElementById('invites-card').classList.add('hidden');
    document.getElementById('workspace-name-card').classList.add('hidden');
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
  await api.patch('/api/workspace/contact-columns', { columns: contactColumns });
  currentWorkspace.contact_columns = contactColumns;
  filterContacts();
}

// ── Kanban field visibility ───────────────────────────────
function renderKanbanFields() {
  const allOptions = [
    ...BUILTIN_FIELDS,
    ...fields.map(f => ({ key: f.field_key, label: f.name, type: f.type })),
  ];
  document.getElementById('kanban-fields-list').innerHTML = allOptions.map(f => `
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
  const list = await api.get('/api/workspace/members');
  document.getElementById('members-list').innerHTML = list.map(m => `
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
  if (page === 'pipeline') loadPipeline(); else loadContacts();
}

async function deleteContact(id) {
  if (!confirm('Delete this contact and all their activities?')) return;
  await api.del(`/api/contacts/${id}`);
  closeModal('detail-modal');
  invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'pipeline') loadPipeline(); else loadContacts();
}

// ══════════════════════════════════════════════════════════
// CONTACT DETAIL
// ══════════════════════════════════════════════════════════
async function openDetail(id) {
  await Promise.all([ensureStages(), ensureFields()]);
  const c = await api.get(`/api/contacts/${id}`);
  document.getElementById('detail-title').textContent = c.name;

  const infoFields = [
    ['Company',  c.company],
    ['Email',    c.email   ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : null],
    ['Phone',    c.phone],
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
      <h3>${t('detail_stage')}</h3>
      <div class="stage-pills">
        <div class="stage-pill ${!c.stage_id ? 'active' : ''}"
          style="${!c.stage_id ? 'background:#9ca3af' : ''}"
          onclick="moveContactStage(${id}, null, this)">${t('detail_unassigned')}</div>
        ${stages.map(s => `
          <div class="stage-pill ${c.stage_id===s.id ? 'active' : ''}"
            style="${c.stage_id===s.id ? `background:${s.color}` : ''}"
            onclick="moveContactStage(${id}, ${s.id}, this)">
            <span style="width:7px;height:7px;border-radius:50%;background:${s.color};display:inline-block"></span>
            ${esc(s.name)}
          </div>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <h3>${t('detail_activities')}</h3>
      <div class="mini-acts" id="detail-acts">${renderMiniActs(c.activities)}</div>
    </div>
    <div class="inline-log">
      <select id="inline-type">
        <option value="note">Note</option><option value="call">Call</option><option value="email">Email</option>
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
  if (document.getElementById('page-pipeline').classList.contains('active')) renderPipeline();
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
function parseCSV(text) {
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
      } else if (ch === ',' && !inQ) { row.push(cur); cur = ''; }
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
  const h = header.toLowerCase().trim();
  if (['name','full name','contact name','contact'].includes(h)) return 'name';
  if (['email','e-mail','email address'].includes(h)) return 'email';
  if (['phone','mobile','telephone','tel','phone number','phone no'].includes(h)) return 'phone';
  if (['company','organization','org','account','company name'].includes(h)) return 'company';
  if (['stage','status','pipeline stage','deal stage'].includes(h)) return 'stage';
  if (['assignee','owner','assigned to','assigned_to'].includes(h)) return 'assignee';
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
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    alert('Please upload a .csv file.'); return;
  }
  const text = await file.text();
  const allRows = parseCSV(text);
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
      else if (m.mapTo === 'phone')   c.phone   = val;
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
