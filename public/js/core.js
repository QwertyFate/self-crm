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
let currentContactType = 'contact';
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

const TRANSLATIONS = {
  en: {
    nav_deals:'Deals', nav_contacts:'Contacts', nav_activities:'Activities', nav_settings:'Settings', nav_board:'Board',
    set_miro:'Miro Board', hint_miro:'Paste the embed URL from Miro → Share → Embed.',
    add_deal:'+ Add Deal', lbl_deal_title:'Title', lbl_deal_value:'Value',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Each pipeline has its own stages. Deals belong to one pipeline.',
    set_deal_fields:'Deal fields', hint_deal_fields:'Extra properties on every deal.',
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
    set_stages:'Pipeline stages', set_fields:'Custom fields', set_kanban:'Kanban card fields',
    set_invites:'Invite codes', set_members:'Members', set_language:'Language', set_workspace:'Workspace name',
    set_contact_cols:'Table columns', hint_contact_cols:'Drag to reorder. Name is always first.',
    set_wa_template:'WhatsApp message template',
    hint_wa_template:'Written when you tap the WhatsApp button on a contact.',
    wa_vars:'Available variables:',
    hint_stages:'Drag to reorder. Contacts are unassigned when a stage is deleted.',
    hint_fields:'Extra properties on every contact.',
    hint_kanban:'Choose which fields appear on pipeline cards. Name is always shown.',
    hint_invites:'One-time codes to let people join this workspace.',
    hint_language:'The language of menus, labels and hints.',
    hint_workspace:'Shown in the sidebar and to everyone you invite.',
    add_btn:'Add', generate_btn:'Generate', save_btn:'Save',
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
    role_owner:'Owner', role_admin:'Admin', role_member:'Member', lbl_invite_role:'Role',
    btn_copy:'Copy', btn_regenerate:'Regenerate', btn_refresh:'Refresh', btn_save_changes:'Save changes', copied:'Copied!',
    engine_title:'Upgrads Engine', engine_active:'Active',
    engine_hint:'When a deal moves into one of the trigger stages, a signed vertrag.unterschrieben event is sent to the Engine URL.',
    engine_readonly_hint:'Only owners and admins can change these settings.',
    engine_url_label:'Engine URL', engine_url_hint:'Where the event is sent. Must start with http:// or https:// and point to a public host.',
    engine_url_ph:'https://engine.example.com/webhooks/crm',
    engine_stages_label:'Trigger stages',
    engine_stages_hint:'Moving a deal into any of these stages sends the event. Preselected from your Won stages in Analytics.',
    engine_no_stages:'No pipeline stages yet.',
    engine_secret_label:'Webhook secret',
    engine_secret_hint:'Share this with the Engine team. Every request is signed with it (X-Upgrads-Signature).',
    engine_btn_test:'Send test event',
    engine_deliveries_title:'Sent events', engine_deliveries_hint:'Attempts and the last response from the Engine for each event.',
    engine_no_deliveries:'No events sent yet.',
    engine_saved:'Saved', engine_test_ok:'Test event delivered.', engine_test_failed:'Test event failed:',
    engine_confirm_regen_secret:'This will invalidate the current secret. The Engine must be updated with the new one. Continue?',
    engine_status_pending:'Pending', engine_status_success:'Delivered', engine_status_failed:'Failed',
    engine_attempt_one:'attempt', engine_attempts:'attempts', engine_view_payload:'View payload',
    // Settings (design ported from NewUIAI): rail tabs, section titles and one-line descriptions, cards
    tab_workspace:'Workspace', tab_preferences:'My preferences', tab_tasks:'Tasks', tab_integrations:'Integrations',
    hint_preferences:'These settings apply only to you, not to the whole workspace.',
    set_appearance:'Appearance', hint_appearance:'Light or dark theme for this browser.', set_danger:'Delete workspace',
    hint_members:'Everyone who has joined this workspace.',
    pane_workspace:'Workspace', hint_pane_workspace:'Name this workspace and what it calls suppliers and listings.',
    pane_preferences:'My preferences', pane_contacts:'Contacts', hint_pane_contacts:'Custom fields, table columns, contact stages and the WhatsApp template.',
    pane_deals:'Deals', hint_pane_deals:'Pipelines and their stages, deal fields and list columns.',
    hint_pane_objects:'Fields and table columns.', pane_tasks:'Tasks', hint_pane_tasks:'Statuses and custom fields for tasks.',
    pane_team:'Team', hint_pane_team:'Who is in this workspace, and invite codes for new members.',
    pane_integrations:'Integrations', hint_pane_integrations:'The Miro board embedded on the Board page.',
    set_supplier_name:'Name for suppliers', hint_supplier_name:'What the second contact list is called in the sidebar, for example Suppliers or Partners.',
    set_object_name:'Name for listings', hint_object_name:'What the things you list are called throughout the app, for example Properties or Products.',
    hint_delete_workspace:'Deletes every contact, deal, task and file in this workspace. This cannot be undone.', btn_delete_workspace:'Delete workspace',
    set_timezone:'Time zone', hint_timezone:'Used by the clock in the sidebar. Defaults to Berlin.',
    set_notifications:'Notifications', hint_notifications:'Choose which activity sends you a notification.',
    notif_contacts:'Contacts and suppliers', notif_deals:'Deals', notif_tasks:'Tasks', notif_objects:'Listings', notif_activities:'Activities',
    set_deal_cols:'Deal list columns', hint_deal_cols:'Columns of the deal list view. Drag to reorder. Title is always first.',
    set_object_fields:'Fields', hint_object_fields:'Extra properties on every item in this list.', set_object_cols:'Table columns',
    set_contact_stages:'Contact stages', hint_contact_stages:'Stages of the contact kanban. Drag to reorder.',
    set_task_statuses:'Task statuses', hint_task_statuses:'Drag to reorder. Statuses are the columns of the task board.',
    set_task_fields:'Custom fields', hint_task_fields:'Extra properties on every task.',
    add_stage_btn:'Add stage', copy_btn:'Copy', remove_btn:'Remove', you_marker:'(you)', used_by:'Used by',
    no_pipelines_yet:'No pipelines yet.', no_deal_fields_yet:'No deal fields yet.', no_invites_yet:'No invite codes yet.', no_task_fields_yet:'No fields yet.', no_stages_yet:'No stages yet.',
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
    set_invites:'Einladungscodes', set_members:'Mitglieder', set_language:'Sprache', set_workspace:'Name des Arbeitsbereichs',
    set_contact_cols:'Tabellenspalten', hint_contact_cols:'Zum Neuanordnen ziehen. Name steht immer an erster Stelle.',
    set_wa_template:'WhatsApp-Nachrichtenvorlage',
    hint_wa_template:'Wird beim Klicken auf den WhatsApp-Button des Kontakts vorausgefüllt.',
    wa_vars:'Verfügbare Variablen:',
    hint_stages:'Zum Neuanordnen ziehen. Kontakte werden bei Phasenlöschung nicht zugewiesen.',
    hint_fields:'Zusätzliche Eigenschaften für jeden Kontakt.',
    hint_kanban:'Felder auswählen, die auf Pipeline-Karten erscheinen. Name wird immer angezeigt.',
    hint_invites:'Einmalcodes, damit Personen diesem Arbeitsbereich beitreten können.',
    hint_language:'Die Sprache von Menüs, Beschriftungen und Hinweisen.',
    hint_workspace:'Wird in der Seitenleiste und allen Eingeladenen angezeigt.',
    add_btn:'Hinzufügen', generate_btn:'Generieren', save_btn:'Speichern',
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
    role_owner:'Inhaber', role_admin:'Admin', role_member:'Mitglied', lbl_invite_role:'Rolle',
    btn_copy:'Kopieren', btn_regenerate:'Neu erzeugen', btn_refresh:'Aktualisieren', btn_save_changes:'Änderungen speichern', copied:'Kopiert!',
    engine_title:'Upgrads Engine', engine_active:'Aktiv',
    engine_hint:'Wechselt ein Deal in eine der Auslöser-Phasen, wird ein signiertes vertrag.unterschrieben-Ereignis an die Engine-URL gesendet.',
    engine_readonly_hint:'Nur Inhaber und Admins können diese Einstellungen ändern.',
    engine_url_label:'Engine-URL', engine_url_hint:'Wohin das Ereignis gesendet wird. Muss mit http:// oder https:// beginnen und auf einen öffentlichen Host zeigen.',
    engine_url_ph:'https://engine.example.com/webhooks/crm',
    engine_stages_label:'Auslöser-Phasen',
    engine_stages_hint:'Wechselt ein Deal in eine dieser Phasen, wird das Ereignis gesendet. Vorbelegt mit den Gewonnen-Phasen aus der Analyse.',
    engine_no_stages:'Noch keine Pipeline-Phasen.',
    engine_secret_label:'Webhook-Secret',
    engine_secret_hint:'Gib dieses Secret dem Engine-Team. Jede Anfrage wird damit signiert (X-Upgrads-Signature).',
    engine_btn_test:'Testereignis senden',
    engine_deliveries_title:'Gesendete Ereignisse', engine_deliveries_hint:'Versuche und die letzte Antwort der Engine für jedes Ereignis.',
    engine_no_deliveries:'Noch keine Ereignisse gesendet.',
    engine_saved:'Gespeichert', engine_test_ok:'Testereignis zugestellt.', engine_test_failed:'Testereignis fehlgeschlagen:',
    engine_confirm_regen_secret:'Das aktuelle Secret wird ungültig. Die Engine muss mit dem neuen Secret aktualisiert werden. Fortfahren?',
    engine_status_pending:'Ausstehend', engine_status_success:'Zugestellt', engine_status_failed:'Fehlgeschlagen',
    engine_attempt_one:'Versuch', engine_attempts:'Versuche', engine_view_payload:'Payload anzeigen',
    // Einstellungen (Design von NewUIAI übernommen): Reiter, Abschnittstitel und Kurzbeschreibungen, Karten
    tab_workspace:'Arbeitsbereich', tab_preferences:'Meine Einstellungen', tab_tasks:'Aufgaben', tab_integrations:'Integrationen',
    hint_preferences:'Diese Einstellungen gelten nur für dich, nicht für den ganzen Arbeitsbereich.',
    set_appearance:'Darstellung', hint_appearance:'Helles oder dunkles Design für diesen Browser.', set_danger:'Arbeitsbereich löschen',
    hint_members:'Alle, die diesem Arbeitsbereich beigetreten sind.',
    pane_workspace:'Arbeitsbereich', hint_pane_workspace:'Name des Arbeitsbereichs und Bezeichnungen für Lieferanten und Objekte.',
    pane_preferences:'Meine Einstellungen', pane_contacts:'Kontakte', hint_pane_contacts:'Eigene Felder, Tabellenspalten, Kontakt-Phasen und die WhatsApp-Vorlage.',
    pane_deals:'Deals', hint_pane_deals:'Pipelines mit Phasen, Deal-Felder und Listenspalten.',
    hint_pane_objects:'Felder und Tabellenspalten.', pane_tasks:'Aufgaben', hint_pane_tasks:'Status und eigene Felder für Aufgaben.',
    pane_team:'Team', hint_pane_team:'Mitglieder dieses Arbeitsbereichs und Einladungscodes für neue Mitglieder.',
    pane_integrations:'Integrationen', hint_pane_integrations:'Das Miro-Board, das auf der Board-Seite eingebettet wird.',
    set_supplier_name:'Bezeichnung für Lieferanten', hint_supplier_name:'So heißt die zweite Kontaktliste in der Seitenleiste, zum Beispiel Lieferanten oder Partner.',
    set_object_name:'Bezeichnung für Objekte', hint_object_name:'So heißen die Dinge, die du verwaltest, in der ganzen App, zum Beispiel Immobilien oder Produkte.',
    hint_delete_workspace:'Löscht alle Kontakte, Deals, Aufgaben und Dateien in diesem Arbeitsbereich. Das lässt sich nicht rückgängig machen.', btn_delete_workspace:'Arbeitsbereich löschen',
    set_timezone:'Zeitzone', hint_timezone:'Wird von der Uhr in der Seitenleiste verwendet. Standard ist Berlin.',
    set_notifications:'Benachrichtigungen', hint_notifications:'Wähle, welche Aktivitäten dich benachrichtigen.',
    notif_contacts:'Kontakte und Lieferanten', notif_deals:'Deals', notif_tasks:'Aufgaben', notif_objects:'Objekte', notif_activities:'Aktivitäten',
    set_deal_cols:'Spalten der Deal-Liste', hint_deal_cols:'Spalten der Deal-Listenansicht. Ziehen zum Sortieren. Titel steht immer zuerst.',
    set_object_fields:'Felder', hint_object_fields:'Zusätzliche Eigenschaften für jeden Eintrag dieser Liste.', set_object_cols:'Tabellenspalten',
    set_contact_stages:'Kontakt-Phasen', hint_contact_stages:'Phasen des Kontakt-Kanbans. Ziehen zum Sortieren.',
    set_task_statuses:'Aufgabenstatus', hint_task_statuses:'Ziehen zum Sortieren. Status sind die Spalten des Aufgaben-Boards.',
    set_task_fields:'Eigene Felder', hint_task_fields:'Zusätzliche Eigenschaften für jede Aufgabe.',
    add_stage_btn:'Phase hinzufügen', copy_btn:'Kopieren', remove_btn:'Entfernen', you_marker:'(du)', used_by:'Verwendet von',
    no_pipelines_yet:'Noch keine Pipelines.', no_deal_fields_yet:'Noch keine Deal-Felder.', no_invites_yet:'Noch keine Einladungscodes.', no_task_fields_yet:'Noch keine Felder.', no_stages_yet:'Noch keine Phasen.',
  },
};

function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.en)[key] ?? TRANSLATIONS.en[key] ?? key;
}

// Human label for a workspace role ('owner' | 'admin' | 'member'); unknown values fall back to the raw string.
function roleLabel(role) {
  const key = `role_${role}`;
  const label = t(key);
  return label === key ? esc(String(role ?? '')) : label;
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
  if (page === 'integrations') loadIntegrations();   // re-renders the Engine card's runtime strings (badges, empty states)
}

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="vertical-align:middle"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
const ICONS = { note: '📝', call: '📞', email: '✉️', whatsapp: WA_SVG };

// Interface icons for JS-rendered controls: the same 1.85-stroke line style as
// the markup's inline SVGs. Use `${UI_ICON.edit}` inside a template literal.
const UI_ICON = {
  edit:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  remove: '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  drag:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  pin:    '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5"/></svg>',
  plus:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

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

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
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

function toggleNoDate(cb) {
  if (!cb) return;
  const row = cb.closest('div');
  const dateInput = row ? row.querySelector('input[type="date"]') : null;
  if (dateInput) {
    dateInput.disabled = cb.checked;
    if (cb.checked) dateInput.value = '';
  }
}

function resetNoDate(cb) {
  if (!cb) return;
  cb.checked = false;
  const row = cb.closest('div');
  const dateInput = row ? row.querySelector('input[type="date"]') : null;
  if (dateInput) {
    dateInput.disabled = false;
  }
}

function toggleInlineNoDate(cb) {
  toggleNoDate(cb);
}

function defaultNoDate(cb) {
  if (!cb) return;
  cb.checked = true;
  const row = cb.closest('div');
  const dateInput = row ? row.querySelector('input[type="date"]') : null;
  if (dateInput) {
    dateInput.disabled = true;
    dateInput.value = '';
  }
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

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
  const track = document.getElementById('dark-toggle-track');
  const label = document.getElementById('dark-toggle-label');
  if (track) track.classList.toggle('on', dark);
  if (label) label.textContent = t(dark ? 'light_mode' : 'dark_mode');
  const pref = document.getElementById('pref-dark-toggle');   // Settings → My preferences → Appearance
  if (pref) pref.checked = dark;
}

function toggleDarkMode() {
  const next = document.documentElement.getAttribute('data-theme') !== 'dark';
  localStorage.setItem('theme', next ? 'dark' : 'light');
  applyTheme(next);
}

(function () {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : prefersDark);
})();

const loader = (() => {
  let count = 0, fillTimer = null, hideTimer = null, overlayTimer = null, startTime = null;
  const bar     = () => document.getElementById('loading-bar');
  const fill    = () => document.getElementById('loading-bar-fill');
  const overlay = () => document.getElementById('loading-overlay');
  const MIN_DISPLAY_TIME = 500;

  function start() {
    if (count === 0) startTime = Date.now();
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

    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_DISPLAY_TIME - elapsed);

    hideTimer = setTimeout(() => {
      const b = bar(), f2 = fill();
      if (b) b.classList.remove('active');
      setTimeout(() => { if (f2) f2.style.width = '0%'; }, 160);
    }, 260 + delay);
  }

  return { start, done };
})();

async function apiFetch(url, opts = {}) {
  loader.start();
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { return { error: `Server error (${r.status})` }; }
  } finally {
    loader.done();
  }
}

async function apiFetchSilent(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { return { error: `Server error (${r.status})` }; }
  } catch { return { error: 'Network error' }; }
}

const api = {
  get:   url      => apiFetch(url),
  post:  (url, d) => apiFetch(url, { method:'POST',   headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  put:   (url, d) => apiFetch(url, { method:'PUT',    headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  patch: (url, d) => apiFetch(url, { method:'PATCH',  headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  del:   url      => apiFetch(url, { method:'DELETE' }),
};

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
  setTimeout(() => {
    form._submitting = false;
    if (btn) btn.disabled = false;
  }, 10000);
}, true);

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

document.addEventListener('mousedown', e => {
  if (!e.target.closest('.deal-search-wrap') && !e.target.closest('.deal-search-dropdown')) {
    document.querySelectorAll('.deal-search-dropdown').forEach(dd => dd.classList.add('hidden'));
  }
});
