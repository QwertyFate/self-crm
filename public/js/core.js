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
let objectViewMode     = localStorage.getItem('objectViewMode') || 'table';
let currentContactType = 'contact'; // 'contact' | 'supplier'
let dealFields       = [];
let dealKanbanFields = ['contact', 'value'];
let currentPipelineId = null;
let dealViewMode      = localStorage.getItem('dealViewMode') || 'kanban';
let dealColumns       = [];
let dealColDragIdx    = null;
let dragDealId        = null;
let dragContactId    = null;
let dragStageIdx     = null;
let colDragIdx     = null;
let importData     = null;
let contactColumns = [];
let colWidths      = {};
let resizingCol    = null;
let currentPage    = 1;
const PAGE_SIZE    = 25;
let sortKey        = null;
let sortDir        = 'asc';
let activeFilters  = {};
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
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const lbl = document.getElementById('dark-toggle-label');
  if (lbl) lbl.textContent = t(dark ? 'light_mode' : 'dark_mode');
  document.querySelectorAll('input[name="language"]').forEach(r => { r.checked = r.value === currentLang; });
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
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

// ── Helpers ───────────────────────────────────────────────
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  // Reset submit guard and re-enable buttons for any form inside this modal
  el.querySelectorAll('form').forEach(f => {
    f._submitting = false;
    f.querySelectorAll('[type="submit"]').forEach(btn => { btn.disabled = false; });
  });
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
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

// ── Dark mode ─────────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
  const track = document.getElementById('dark-toggle-track');
  const label = document.getElementById('dark-toggle-label');
  if (track) track.classList.toggle('on', dark);
  if (label) label.textContent = t(dark ? 'light_mode' : 'dark_mode');
}

function toggleDarkMode() {
  const next = document.documentElement.getAttribute('data-theme') !== 'dark';
  localStorage.setItem('theme', next ? 'dark' : 'light');
  applyTheme(next);
}

// Apply saved theme immediately
(function () {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : prefersDark);
})();

// ── Loading bar + overlay ─────────────────────────────────
const loader = (() => {
  let count = 0, fillTimer = null, hideTimer = null, overlayTimer = null;
  const bar     = () => document.getElementById('loading-bar');
  const fill    = () => document.getElementById('loading-bar-fill');
  const overlay = () => document.getElementById('loading-overlay');

  function start() {
    count++;
    clearTimeout(hideTimer);
    clearTimeout(overlayTimer);
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
    overlayTimer = setTimeout(() => { if (count > 0) overlay()?.classList.remove('hidden'); }, 300);
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

// ── Duplicate submit guard ────────────────────────────────
// Runs in capture phase (before the onsubmit handler) so it can cancel duplicates.
document.addEventListener('submit', e => {
  const form = e.target;
  if (form._submitting) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  form._submitting = true;
  const btn = e.submitter || form.querySelector('[type="submit"]');
  if (btn) btn.disabled = true;
  // Safety net: always unlock after 10s in case the handler throws without closing the modal
  setTimeout(() => {
    form._submitting = false;
    if (btn) btn.disabled = false;
  }, 10000);
}, true);

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});
