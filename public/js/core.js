let currentUser      = null;
let currentWorkspace = null;
let kanbanFields     = ['company', 'email'];

let contacts   = [];
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
let currentLang   = localStorage.getItem('lang') || 'en';

const TRANSLATIONS = {
  en: {
    nav_deals:'Deals', nav_contacts:'Contacts', nav_activities:'Activities', nav_settings:'Settings', nav_board:'Board',
    // Shell (sidebar groups, top bar, menus, command palette)
    sb_workspace:'Workspace', sb_tools:'Tools', nav_tasks:'Tasks', nav_chat:'Team Chat', nav_calendar:'Calendar', nav_analytics:'Analytics', nav_integrations:'Integrations', nav_workspaces:'Workspaces',
    topbar_search:'Go to a page…', topbar_new:'New', new_deal:'Deal', new_contact:'Contact', new_task:'Task',
    kbd_shortcuts:'Keyboard shortcuts', start_tour:'Start the product tour', btn_close:'Close',
    sc_search:'Search and jump to a page', sc_close:'Close dialog or menu', sc_move:'Move in menus and search', palette_none:'No page matches', palette_group_pages:'Go to',
    kbd_to_move:'to move', kbd_to_open:'to open', kbd_to_close:'to close',
    set_miro:'Miro Board', hint_miro:'Paste the embed URL from Miro → Share → Embed.',
    add_deal:'Add deal', lbl_deal_title:'Title', lbl_deal_value:'Value',
    // Deals page (board, list, summary, toolbar, menus)
    deals_in_pipeline:'{n} deals in {p}', deals_all_pipelines:'{n} deals across all pipelines', search_deals:'Search deals',
    kpi_pipeline_value:'Pipeline value', kpi_deals:'Deals', kpi_avg_deal:'Average deal', kpi_urgent:'Urgent', kpi_urgent_foot:'High or very urgent', kpi_deals_foot:'in this view', kpi_avg_foot:'of deals with a value', strip_label:'Pipeline value by stage',
    chip_owner:'Owner', chip_urgency:'Urgency', chip_stage:'Stage', filter_all:'All', or_higher:'or higher', clear_filters:'Clear filters', btn_columns:'Columns', show_summary:'Show summary', hide_summary:'Hide summary',
    view_board:'Board', view_list:'List', no_deals_match:'No deals match your filters', try_removing_filter:'Try removing a filter.', n_selected:'{n} selected', clear_selection:'Clear selection',
    move_to_stage:'Move to stage', set_urgency:'Set urgency', open_deal:'Open deal', delete_deal:'Delete deal', delete_deal_q:'Delete this deal?', delete_deals_q:'Delete {n} deals?', delete_deal_msg:'The deal and its activity history will be removed. This cannot be undone.',
    deal_deleted:'Deal deleted', deals_deleted:'{n} deals deleted', moved_to:'Moved to {s}', deals_moved_to:'{n} deals moved to {s}', undo:'Undo', import_csv:'Import from CSV', export_csv:'Export to CSV', manage_pipelines:'Manage pipelines', exported_n:'Exported {n} deals',
    no_contact:'No contact', not_set:'Not set', created_lbl:'Created', updated_lbl:'Updated', of_deals:'{a} of {b} deals', total_lbl:'Total', col_urgency:'Urgency', col_owner:'Owner', col_title:'Deal', col_pipeline:'Pipeline', no_pipeline_selected:'Select a pipeline to see the board, or switch to the list to see every deal.',
    n_deals:'{n} deals', no_deals_yet:'No deals yet', opt_all_pipelines:'All pipelines', urg_0:'No urgency', urg_1:'Low', urg_2:'Medium', urg_3:'High', urg_4:'Very urgent',
    // Activities page (toolbar, feed, export)
    search_activities:'Search activities', chip_type:'Type', chip_person:'Person', activities_logged:'{n} logged, {m} in the last 7 days', no_activities_match:'No activities match your filters',
    delete_activity:'Delete activity', activity_deleted:'Activity deleted', export_activities_csv:'Exported {n} activities',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Each pipeline has its own stages. Deals belong to one pipeline.',
    set_deal_fields:'Deal fields', hint_deal_fields:'Extra properties on every deal.',
    no_pipelines:'No pipelines yet. Create one in Settings → Deals.',
    no_deals:'No deals in this stage.',
    dark_mode:'Dark mode', light_mode:'Light mode', logout:'Log out',
    page_pipeline:'Pipeline', page_contacts:'Contacts', page_activities:'Activities', page_settings:'Settings',
    add_contact:'+ Add Contact', log_activity:'+ Log Activity',
    col_name:'Name', col_company:'Company', col_email:'Email', col_phone:'Phone', col_stage:'Stage', col_assignee:'Assignee', col_created_at:'Date Added',
    search_ph:'Search name, company, email or phone', chip_last:'Last contact', last_today:'Today', last_week:'Last 7 days', last_month:'Last 30 days', last_older:'Older than 30 days', last_never:'Never contacted',
    add_filter:'Filter', remove_filter:'Remove filter', btn_select:'Select',
    filter_contains_ph:'Type to filter…', click_to_edit:'Click to edit', edit_entry:'Edit entry', delete_entry:'Delete entry', entry_updated:'Entry updated', enter_saves_esc_cancels:'Enter saves · Esc cancels · Shift+Enter for a new line', no_contacts_match:'No {noun} match your filters', no_contacts_yet:'No {noun} yet', n_items:'{n} {noun}', n_of_items:'{a} of {b} {noun}',
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
    add_field_title:'Add Field', edit_field_title:'Edit Field',
    lbl_name:'Name', lbl_company:'Company', lbl_email:'Email', lbl_phone:'Phone',
    lbl_stage:'Stage', lbl_assignee:'Assignee', lbl_type:'Type', lbl_contact:'Contact',
    lbl_content:'Content', lbl_color:'Color', lbl_field_label:'Label', lbl_key:'Key',
    lbl_options:'Options (one per line)',
    btn_cancel:'Cancel', btn_save:'Save', btn_delete:'Delete', btn_view:'View', btn_log:'Log', btn_edit:'Edit',
    detail_stage:'Stage', detail_activities:'Activities',
    detail_log_ph:'Add note, call, or email…', detail_unassigned:'Unassigned',
    opt_none:'— None —', opt_no_deal_stage:'— No stage —', opt_unassigned:'— Unassigned —',
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
    pane_preferences:'My preferences', pane_contacts:'Contacts', hint_pane_contacts:'Custom fields, table columns and the WhatsApp template.',
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
    set_task_statuses:'Task statuses', hint_task_statuses:'Drag to reorder. Statuses are the columns of the task board.',
    set_task_fields:'Custom fields', hint_task_fields:'Extra properties on every task.',
    add_stage_btn:'Add stage', copy_btn:'Copy', remove_btn:'Remove', you_marker:'(you)', used_by:'Used by',
    no_pipelines_yet:'No pipelines yet.', no_deal_fields_yet:'No deal fields yet.', no_invites_yet:'No invite codes yet.', no_task_fields_yet:'No fields yet.',
    // Integrations page (same shell as Settings): rail tabs, section titles and descriptions, cards
    page_integrations:'Integrations', hint_page_integrations:'Connect the tools that send you leads, and the Upgrads Engine that handles signed contracts.',
    intg_tab_webhook:'Lead webhook', intg_tab_platforms:'Platforms', intg_tab_activity:'Recent leads', intg_tab_engine:'Upgrads Engine', intg_tab_deliveries:'Deliveries',
    intg_pane_webhook:'Lead webhook', intg_pane_webhook_hint:'Other tools push new leads into this workspace through this URL.',
    intg_pane_platforms:'Connect a platform', intg_pane_platforms_hint:'Setup steps and a sample payload for the tool you send leads from.',
    intg_pane_activity:'Recent leads', intg_pane_activity_hint:'What this webhook received and what was captured from each lead.',
    intg_pane_engine:'Upgrads Engine', intg_pane_engine_hint:'The Engine is told the moment a contract is signed.',
    intg_pane_deliveries:'Deliveries', intg_pane_deliveries_hint:'Every event sent to the Engine, with its outcome.',
    intg_webhook_title:'Webhook connection', intg_active:'Active',
    intg_webhook_hint:'Send leads from Zapier, Make.com, Facebook or any other tool to this URL. Each lead becomes a contact, and optionally a deal.',
    intg_url_label:'Your webhook URL', intg_url_hint:'Paste this URL into the tool that sends the leads.',
    intg_mapping_title:'Field mapping', intg_mapping_hint:'Which key in the incoming JSON fills which contact field. Use dots for nested keys, for example data.email.',
    intg_builtin_fields:'Built-in fields', intg_custom_fields:'Custom fields', intg_add_field_ph:'Add a custom field…', intg_edit_key:'Edit key', intg_custom_tag:'Custom',
    intg_autodeal_title:'Auto-create a deal', intg_autodeal_hint:'Start a deal in your pipeline for every lead that arrives.', intg_autodeal_toggle:'Create a deal for every incoming lead',
    intg_assignee_title:'Default assignee', intg_assignee_hint:'Who new contacts from this webhook are assigned to.', opt_assignee_self:'Not set (assigned to yourself)',
    lbl_pipeline:'Pipeline', intg_no_stages_in_pipeline:'No stages in this pipeline', msg_saved:'Saved', intg_autosaved:'Auto-saved',
    intg_confirm_regen_url:'This replaces your webhook URL. Every tool that sends leads to the old URL must be updated. Continue?',
    intg_platforms_title:'Setup guides', intg_platforms_hint:'Pick the tool you send leads from to see the setup steps and a sample payload.',
    intg_pick_platform:'Select a platform on the left to see its setup guide.', intg_setup_guide:'Setup guide', intg_guide_url:'Your webhook URL',
    intg_activity_title:'Received leads', intg_activity_hint:'The last 50 leads this webhook received and what was captured from each.',
    intg_no_activity:'No leads received yet. Send a test from your platform and it will show up here.',
    intg_fields_missing:'Not found in the payload:', intg_fields_missing_hint:'Check that the mapping keys match the incoming data.', intg_view_raw:'View raw payload',
    intg_log_success:'Lead received', intg_log_error:'Rejected',
  },
  de: {
    nav_deals:'Deals', nav_contacts:'Kontakte', nav_activities:'Aktivitäten', nav_settings:'Einstellungen', nav_board:'Board',
    // Hülle (Seitenleiste, obere Leiste, Menüs, Befehlspalette)
    sb_workspace:'Arbeitsbereich', sb_tools:'Werkzeuge', nav_tasks:'Aufgaben', nav_chat:'Team-Chat', nav_calendar:'Kalender', nav_analytics:'Analysen', nav_integrations:'Integrationen', nav_workspaces:'Arbeitsbereiche',
    topbar_search:'Zu einer Seite springen…', topbar_new:'Neu', new_deal:'Deal', new_contact:'Kontakt', new_task:'Aufgabe',
    kbd_shortcuts:'Tastenkürzel', start_tour:'Produkttour starten', btn_close:'Schließen',
    sc_search:'Suchen und zu einer Seite springen', sc_close:'Dialog oder Menü schließen', sc_move:'In Menüs und Suche bewegen', palette_none:'Keine Seite passt', palette_group_pages:'Gehe zu',
    kbd_to_move:'bewegen', kbd_to_open:'öffnen', kbd_to_close:'schließen',
    set_miro:'Miro-Board', hint_miro:'Embed-URL aus Miro → Teilen → Einbetten einfügen.',
    add_deal:'Deal hinzufügen', lbl_deal_title:'Titel', lbl_deal_value:'Wert',
    // Deals-Seite (Board, Liste, Übersicht, Werkzeugleiste, Menüs)
    deals_in_pipeline:'{n} Deals in {p}', deals_all_pipelines:'{n} Deals in allen Pipelines', search_deals:'Deals durchsuchen',
    kpi_pipeline_value:'Pipeline-Wert', kpi_deals:'Deals', kpi_avg_deal:'Durchschnittlicher Deal', kpi_urgent:'Dringend', kpi_urgent_foot:'Hoch oder sehr dringend', kpi_deals_foot:'in dieser Ansicht', kpi_avg_foot:'der Deals mit Wert', strip_label:'Pipeline-Wert nach Phase',
    chip_owner:'Zuständig', chip_urgency:'Dringlichkeit', chip_stage:'Phase', filter_all:'Alle', or_higher:'oder höher', clear_filters:'Filter zurücksetzen', btn_columns:'Spalten', show_summary:'Übersicht anzeigen', hide_summary:'Übersicht ausblenden',
    view_board:'Board', view_list:'Liste', no_deals_match:'Keine Deals passen zu deinen Filtern', try_removing_filter:'Entferne einen Filter.', n_selected:'{n} ausgewählt', clear_selection:'Auswahl aufheben',
    move_to_stage:'In Phase verschieben', set_urgency:'Dringlichkeit setzen', open_deal:'Deal öffnen', delete_deal:'Deal löschen', delete_deal_q:'Diesen Deal löschen?', delete_deals_q:'{n} Deals löschen?', delete_deal_msg:'Der Deal und sein Aktivitätsverlauf werden entfernt. Das lässt sich nicht rückgängig machen.',
    deal_deleted:'Deal gelöscht', deals_deleted:'{n} Deals gelöscht', moved_to:'Verschoben nach {s}', deals_moved_to:'{n} Deals verschoben nach {s}', undo:'Rückgängig', import_csv:'Aus CSV importieren', export_csv:'Als CSV exportieren', manage_pipelines:'Pipelines verwalten', exported_n:'{n} Deals exportiert',
    no_contact:'Kein Kontakt', not_set:'Nicht gesetzt', created_lbl:'Erstellt', updated_lbl:'Aktualisiert', of_deals:'{a} von {b} Deals', total_lbl:'Gesamt', col_urgency:'Dringlichkeit', col_owner:'Zuständig', col_title:'Deal', col_pipeline:'Pipeline', no_pipeline_selected:'Wähle eine Pipeline für das Board oder wechsle zur Liste, um alle Deals zu sehen.',
    n_deals:'{n} Deals', no_deals_yet:'Noch keine Deals', opt_all_pipelines:'Alle Pipelines', urg_0:'Keine Dringlichkeit', urg_1:'Niedrig', urg_2:'Mittel', urg_3:'Hoch', urg_4:'Sehr dringend',
    // Aktivitäten-Seite (Werkzeugleiste, Feed, Export)
    search_activities:'Aktivitäten durchsuchen', chip_type:'Typ', chip_person:'Person', activities_logged:'{n} erfasst, {m} in den letzten 7 Tagen', no_activities_match:'Keine Aktivitäten passen zu deinen Filtern',
    delete_activity:'Aktivität löschen', activity_deleted:'Aktivität gelöscht', export_activities_csv:'{n} Aktivitäten exportiert',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Jede Pipeline hat eigene Phasen. Deals gehören zu einer Pipeline.',
    set_deal_fields:'Deal-Felder', hint_deal_fields:'Zusätzliche Eigenschaften für jeden Deal.',
    no_pipelines:'Noch keine Pipelines. Erstelle eine unter Einstellungen → Deals.',
    no_deals:'Keine Deals in dieser Phase.',
    dark_mode:'Dunkelmodus', light_mode:'Hellmodus', logout:'Abmelden',
    page_pipeline:'Pipeline', page_contacts:'Kontakte', page_activities:'Aktivitäten', page_settings:'Einstellungen',
    add_contact:'+ Kontakt hinzufügen', log_activity:'+ Aktivität erfassen',
    col_name:'Name', col_company:'Unternehmen', col_email:'E-Mail', col_phone:'Telefon', col_stage:'Phase', col_assignee:'Zuständig', col_created_at:'Hinzugefügt am',
    search_ph:'Name, Unternehmen, E-Mail oder Telefon suchen', chip_last:'Letzter Kontakt', last_today:'Heute', last_week:'Letzte 7 Tage', last_month:'Letzte 30 Tage', last_older:'Älter als 30 Tage', last_never:'Nie kontaktiert',
    add_filter:'Filter', remove_filter:'Filter entfernen', btn_select:'Auswählen',
    filter_contains_ph:'Tippen zum Filtern…', click_to_edit:'Zum Bearbeiten klicken', edit_entry:'Eintrag bearbeiten', delete_entry:'Eintrag löschen', entry_updated:'Eintrag aktualisiert', enter_saves_esc_cancels:'Enter speichert · Esc bricht ab · Shift+Enter für eine neue Zeile', no_contacts_match:'Keine {noun} passen zu deinen Filtern', no_contacts_yet:'Noch keine {noun}', n_items:'{n} {noun}', n_of_items:'{a} von {b} {noun}',
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
    add_field_title:'Feld hinzufügen', edit_field_title:'Feld bearbeiten',
    lbl_name:'Name', lbl_company:'Unternehmen', lbl_email:'E-Mail', lbl_phone:'Telefon',
    lbl_stage:'Phase', lbl_assignee:'Zuständig', lbl_type:'Typ', lbl_contact:'Kontakt',
    lbl_content:'Inhalt', lbl_color:'Farbe', lbl_field_label:'Bezeichnung', lbl_key:'Schlüssel',
    lbl_options:'Optionen (eine pro Zeile)',
    btn_cancel:'Abbrechen', btn_save:'Speichern', btn_delete:'Löschen', btn_view:'Ansehen', btn_log:'Erfassen', btn_edit:'Bearbeiten',
    detail_stage:'Phase', detail_activities:'Aktivitäten',
    detail_log_ph:'Notiz, Anruf oder E-Mail hinzufügen…', detail_unassigned:'Nicht zugewiesen',
    opt_none:'— Keine —', opt_no_deal_stage:'— Keine Phase —', opt_unassigned:'— Nicht zugewiesen —',
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
    pane_preferences:'Meine Einstellungen', pane_contacts:'Kontakte', hint_pane_contacts:'Eigene Felder, Tabellenspalten und die WhatsApp-Vorlage.',
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
    set_task_statuses:'Aufgabenstatus', hint_task_statuses:'Ziehen zum Sortieren. Status sind die Spalten des Aufgaben-Boards.',
    set_task_fields:'Eigene Felder', hint_task_fields:'Zusätzliche Eigenschaften für jede Aufgabe.',
    add_stage_btn:'Phase hinzufügen', copy_btn:'Kopieren', remove_btn:'Entfernen', you_marker:'(du)', used_by:'Verwendet von',
    no_pipelines_yet:'Noch keine Pipelines.', no_deal_fields_yet:'Noch keine Deal-Felder.', no_invites_yet:'Noch keine Einladungscodes.', no_task_fields_yet:'Noch keine Felder.',
    // Integrationen (gleiche Hülle wie Einstellungen): Reiter, Abschnittstitel und Kurzbeschreibungen, Karten
    page_integrations:'Integrationen', hint_page_integrations:'Verbinde die Tools, die dir Leads schicken, und die Upgrads Engine, die unterschriebene Verträge übernimmt.',
    intg_tab_webhook:'Lead-Webhook', intg_tab_platforms:'Plattformen', intg_tab_activity:'Letzte Leads', intg_tab_engine:'Upgrads Engine', intg_tab_deliveries:'Zustellungen',
    intg_pane_webhook:'Lead-Webhook', intg_pane_webhook_hint:'Andere Tools legen über diese URL neue Leads in diesem Arbeitsbereich an.',
    intg_pane_platforms:'Plattform verbinden', intg_pane_platforms_hint:'Einrichtungsschritte und ein Beispiel-Payload für das Tool, aus dem du Leads sendest.',
    intg_pane_activity:'Letzte Leads', intg_pane_activity_hint:'Was dieser Webhook empfangen hat und was aus jedem Lead übernommen wurde.',
    intg_pane_engine:'Upgrads Engine', intg_pane_engine_hint:'Die Engine erfährt sofort, wenn ein Vertrag unterschrieben ist.',
    intg_pane_deliveries:'Zustellungen', intg_pane_deliveries_hint:'Jedes an die Engine gesendete Ereignis mit seinem Ergebnis.',
    intg_webhook_title:'Webhook-Verbindung', intg_active:'Aktiv',
    intg_webhook_hint:'Sende Leads aus Zapier, Make.com, Facebook oder jedem anderen Tool an diese URL. Aus jedem Lead wird ein Kontakt, optional auch ein Deal.',
    intg_url_label:'Deine Webhook-URL', intg_url_hint:'Füge diese URL in dem Tool ein, das die Leads sendet.',
    intg_mapping_title:'Feldzuordnung', intg_mapping_hint:'Welcher Schlüssel im eingehenden JSON welches Kontaktfeld füllt. Für verschachtelte Schlüssel Punkte verwenden, z. B. data.email.',
    intg_builtin_fields:'Standardfelder', intg_custom_fields:'Eigene Felder', intg_add_field_ph:'Eigenes Feld hinzufügen…', intg_edit_key:'Schlüssel bearbeiten', intg_custom_tag:'Eigenes Feld',
    intg_autodeal_title:'Deal automatisch anlegen', intg_autodeal_hint:'Für jeden eingehenden Lead einen Deal in deiner Pipeline starten.', intg_autodeal_toggle:'Für jeden eingehenden Lead einen Deal anlegen',
    intg_assignee_title:'Standard-Zuständigkeit', intg_assignee_hint:'Wem neue Kontakte aus diesem Webhook zugewiesen werden.', opt_assignee_self:'Nicht gesetzt (dir selbst zugewiesen)',
    lbl_pipeline:'Pipeline', intg_no_stages_in_pipeline:'Keine Phasen in dieser Pipeline', msg_saved:'Gespeichert', intg_autosaved:'Automatisch gespeichert',
    intg_confirm_regen_url:'Deine Webhook-URL wird ersetzt. Jedes Tool, das Leads an die alte URL sendet, muss aktualisiert werden. Fortfahren?',
    intg_platforms_title:'Einrichtungsanleitungen', intg_platforms_hint:'Wähle das Tool, aus dem du Leads sendest, um die Einrichtungsschritte und ein Beispiel-Payload zu sehen.',
    intg_pick_platform:'Wähle links eine Plattform, um die Anleitung zu sehen.', intg_setup_guide:'Einrichtungsanleitung', intg_guide_url:'Deine Webhook-URL',
    intg_activity_title:'Empfangene Leads', intg_activity_hint:'Die letzten 50 Leads, die dieser Webhook empfangen hat, und was daraus übernommen wurde.',
    intg_no_activity:'Noch keine Leads empfangen. Sende einen Test aus deiner Plattform, dann erscheint er hier.',
    intg_fields_missing:'Nicht im Payload gefunden:', intg_fields_missing_hint:'Prüfe, ob die Zuordnungsschlüssel zu den eingehenden Daten passen.', intg_view_raw:'Rohdaten anzeigen',
    intg_log_success:'Lead empfangen', intg_log_error:'Abgelehnt',
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
  const nav = document.querySelector('.sb-link[aria-current="page"]')?.dataset.page;
  if (nav) setCrumbs(nav);   // the crumb is the (now re-translated) sidebar label
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

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN FOUNDATION — ported from reference/pro/src/core.js
   Icons from the sprite in index.html, the ui primitives (popover, menu,
   modal, drawer, confirm, toast) and the shell helpers (crumbs, rail, the
   New / help / user menus, the page palette). Screens ported later build on
   these; the existing inline-handler code keeps working next to them.
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function on(root, type, selector, handler) {
  const fn = e => { const el = e.target.closest(selector); if (el && root.contains(el)) handler(e, el); };
  root.addEventListener(type, fn); return () => root.removeEventListener(type, fn);
}
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- icons ---------- */
// Page / concept names → sprite symbol ids (reference alias map, plus the app's own page names).
const ICON_ALIAS = { deals: 'kanban', contacts: 'users', tasks: 'check-square', suppliers: 'truck', chat: 'message', activities: 'activity',
  listings: 'building', objects: 'building', analytics: 'bar-chart', integrations: 'plug', board: 'presentation', workspaces: 'building', logout: 'log-out', more: 'ellipsis',
  // activity/timeline entry types (shared by the Activities feed, the deal modal and contact panel timelines)
  call: 'phone', email: 'mail', whatsapp: 'message-circle' };
function icon(name, cls = '') { return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${ICON_ALIAS[name] || name}"/></svg>`; }

/* ---------- people ---------- */
// Avatar colours and initials (reference core.js): the colour is hashed from the
// name so the same person always gets the same one, without storing anything.
const AV_COLORS = ['#3D6DA9', '#0E7C86', '#6D5AE0', '#B45309', '#9D2B6B', '#2F7D32', '#5C6BC0', '#C2410C'];
function initialsOf(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
function hashColor(s) { return AV_COLORS[[...String(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length]; }
// who: a name, or { name, color?, initials? }; size: '' | 'sm' | 'lg' | 'xl'
function avatar(who, size = '') {
  const p = typeof who === 'string' ? { name: who } : who;
  if (!p || !p.name) return '';
  return `<span class="avatar${size ? ' avatar-' + size : ''}" style="background:${p.color || hashColor(p.name)}" title="${esc(p.name)}">${esc(p.initials || initialsOf(p.name))}</span>`;
}
// Fills {placeholders} in a translated string: tf('of_deals', { a: 3, b: 12 }).
function tf(key, vars = {}) { return t(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)); }

/* ---------- ui primitives ---------- */
const ui = {};
let openPopover = null;
ui.closePopover = () => { if (openPopover) { openPopover.close(); openPopover = null; } };

// Floating panel anchored to an element (or an {x, y} point); closes on outside click and Escape.
ui.popover = (anchor, content, opts = {}) => {
  ui.closePopover();
  const el = document.createElement('div'); el.className = opts.className || 'menu'; if (opts.width) el.style.width = opts.width + 'px';
  if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
  document.body.appendChild(el);
  const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = opts.align === 'right' ? rect.right - w : rect.left;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = rect.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, rect.top - h - 6);
  el.style.left = left + 'px'; el.style.top = top + 'px';
  const prevFocus = document.activeElement;
  const onDown = e => { if (!el.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) close(); };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); prevFocus && prevFocus.focus && prevFocus.focus(); }
    if (opts.keys !== false && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = $$('.menu-item', el); if (!items.length) return; e.preventDefault();
      const i = items.indexOf(document.activeElement); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  };
  function close() { el.remove(); document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); if (openPopover && openPopover.el === el) openPopover = null; opts.onClose && opts.onClose(); }
  setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0); document.addEventListener('keydown', onKey, true);
  openPopover = { el, close };
  return { el, close };
};

// items: { label, icon?, hint?, checked?, danger?, onSelect } | { sep: true } | { heading }
ui.menu = (anchor, items, opts = {}) => {
  const html = items.map((it, i) => it.sep ? '<div class="menu-sep"></div>' : it.heading ? `<div class="menu-label">${esc(it.heading)}</div>`
    : `<button class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.hint ? `<span class="kbd" style="margin-left:auto">${esc(it.hint)}</span>` : ''}${it.checked ? icon('check', 'check-mark') : ''}</button>`).join('');
  const pop = ui.popover(anchor, html, { ...opts });
  pop.el.setAttribute('role', 'menu');
  on(pop.el, 'click', '.menu-item', (e, b) => { const it = items[+b.dataset.i]; pop.close(); it.onSelect && it.onSelect(); });
  const first = $('.menu-item', pop.el); first && first.focus();
  return pop;
};

ui.select = (anchor, options, current, cb, opts = {}) =>
  ui.menu(anchor, options.map(o => ({ label: o.label, icon: o.icon, checked: o.value === current, onSelect: () => cb(o.value) })), opts);

// Shared body of ui.modal / ui.drawer: scrim, focus trap, Escape, [data-close].
function uiOverlay(kind, { title, body, footer, size = 'md', onClose, width }) {
  const prev = document.activeElement;
  const ov = document.createElement('div'); ov.className = 'overlay' + (kind === 'drawer' ? ' drawer-wrap' : '');
  const id = 'dlg-' + uid();
  ov.innerHTML = kind === 'drawer'
    ? `<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="${id}" ${width ? `style="width:min(${width}px,100%)"` : ''}><div class="modal-head"><h2 class="modal-title" id="${id}">${esc(title)}</h2><button class="iconbtn" data-close aria-label="Close">${icon('x')}</button></div><div class="modal-body" style="flex:1 1 auto"></div>${footer ? '<div class="modal-foot" style="border-radius:0"></div>' : ''}</aside>`
    : `<div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}"><div class="modal-head"><h2 class="modal-title" id="${id}">${esc(title)}</h2><button class="iconbtn" data-close aria-label="Close">${icon('x')}</button></div><div class="modal-body"></div>${footer ? '<div class="modal-foot"></div>' : ''}</div>`;
  const fill = (sel, c) => { const tgt = $(sel, ov); if (!tgt || c == null) return; if (typeof c === 'string') tgt.innerHTML = c; else tgt.appendChild(c); };
  fill('.modal-body', body); fill('.modal-foot', footer);
  document.body.appendChild(ov);
  const panel = $('.modal, .drawer', ov);
  const isTop = () => $$('.overlay').at(-1) === ov;
  const onKey = e => {
    if (!isTop()) return;
    if (e.key === 'Escape' && !openPopover) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', panel).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); prev && prev.focus && prev.focus(); onClose && onClose(); }
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  on(ov, 'click', '[data-close]', close);
  document.addEventListener('keydown', onKey, true);
  const autof = $('[autofocus]', ov) || $('input:not([type=hidden]),select,textarea', $('.modal-body', ov)) || $('[data-close]', ov); autof && autof.focus();
  return { el: ov, body: $('.modal-body', ov), footer: $('.modal-foot', ov), close };
}
ui.modal = opts => uiOverlay('modal', opts);
ui.drawer = opts => uiOverlay('drawer', opts);
ui.confirm = ({ title, message, confirmLabel = 'Confirm', cancelLabel = t('btn_cancel'), danger = false }) => new Promise(resolve => {
  const m = ui.modal({ title, size: 'sm', body: `<p class="sub">${esc(message)}</p>`,
    footer: `<button class="btn btn-secondary" data-no>${esc(cancelLabel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>`,
    onClose: () => resolve(false) });
  $('[data-yes]', m.el).addEventListener('click', () => { resolve(true); m.close(); });
  $('[data-no]', m.el).addEventListener('click', () => m.close());
});
ui.toast = (message, opts = {}) => {
  let wrap = $('.toasts'); if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = `<span>${esc(message)}</span>${opts.action ? `<button>${esc(opts.action.label)}</button>` : ''}`;
  while (wrap.children.length >= 3) wrap.firstChild.remove(); wrap.appendChild(el); const kill = () => el.remove(); setTimeout(kill, opts.ms || 4200);
  if (opts.action) $('button', el).addEventListener('click', () => { opts.action.onClick(); kill(); });
  return { close: kill };
};
ui.formData = form => Object.fromEntries(new FormData(form).entries());

/* ---------- shell ---------- */
// Breadcrumbs in the top bar: the active page's sidebar label (translated, and
// dynamic for Listings / Suppliers), optionally preceded by a trail.
function setCrumbs(page, trail = []) {
  const el = document.getElementById('crumbs'); if (!el) return;
  const link = document.querySelector(`.sb-link[data-page="${page}"] .sb-text`);
  const label = link ? link.textContent.trim() : page === 'workspaces' ? t('nav_workspaces') : String(page || '');
  el.innerHTML = [...trail, label].map((c, i, all) => (i ? icon('chevron-right') : '') + (i === all.length - 1 ? `<b>${esc(c)}</b>` : `<span>${esc(c)}</span>`)).join('');
}
function toggleRail() {
  const app = document.getElementById('app'); if (!app) return;
  const rail = app.classList.toggle('rail');
  localStorage.setItem('sidebarRail', rail ? '1' : '0');
}
function applyRailState() {
  document.getElementById('app')?.classList.toggle('rail', localStorage.getItem('sidebarRail') === '1');
}
// Workspace name in the sidebar button plus its two-letter badge.
function setSidebarWorkspace(name) {
  const n = String(name || '');
  const el = document.getElementById('sidebar-workspace'); if (el) el.textContent = n;
  const badge = document.getElementById('sidebar-workspace-badge');
  if (badge) badge.textContent = n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';
}

// Top bar "New": the record types the app can create from anywhere. Contact and
// supplier open on their own list page first, so the new record shows up there.
function openNewMenu(anchor) {
  const supplierLabel = (currentWorkspace?.supplier_name || 'Supplier').replace(/s$/i, '');
  ui.menu(anchor, [
    { label: t('new_deal'), icon: 'deals', onSelect: () => openDealModal() },
    { label: t('new_contact'), icon: 'contacts', onSelect: async () => { if (currentContactType !== 'contact') await switchPage('contacts'); currentContactType = 'contact'; openContactModal(); } },
    { label: supplierLabel, icon: 'suppliers', onSelect: async () => { if (currentContactType !== 'supplier') await switchPage('suppliers'); currentContactType = 'supplier'; openContactModal(); } },
    { label: t('new_task'), icon: 'tasks', onSelect: () => openTaskModal() },
  ], { align: 'right' });
}
// Top bar "?": shortcuts, and the product tour while the admin console has it enabled.
function openHelpMenu(anchor) {
  const items = [{ label: t('kbd_shortcuts'), icon: 'keyboard', onSelect: () => showShortcuts() }];
  if (typeof tourEnabled !== 'undefined' && tourEnabled) items.push({ label: t('start_tour'), icon: 'info', onSelect: () => startGuide() });
  ui.menu(anchor, items, { align: 'right' });
}
// Sidebar user button: Settings, theme, log out.
function openUserMenu(anchor) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ui.menu(anchor, [
    { label: t('nav_settings'), icon: 'settings', onSelect: () => switchPage('settings') },
    { label: t(dark ? 'light_mode' : 'dark_mode'), icon: dark ? 'sun' : 'moon', onSelect: () => toggleDarkMode() },
    { sep: true },
    { label: t('logout'), icon: 'log-out', danger: true, onSelect: () => logout() },
  ]);
}

/* ---------- command palette (pages; records come with their tabs) ---------- */
function openPalette() {
  ui.closePopover();
  if ($('.overlay .palette')) return;
  const all = $$('.sb-link[data-page]').filter(a => !a.classList.contains('hidden'))
    .map(a => ({ label: a.querySelector('.sb-text')?.textContent.trim() || a.dataset.page, page: a.dataset.page, icon: a.dataset.page }))
    .concat([{ label: t('nav_workspaces'), page: 'workspaces', icon: 'workspaces' }]);
  let sel = 0, list = all;
  const m = document.createElement('div'); m.className = 'overlay'; m.style.alignItems = 'start';
  m.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Search"><div class="palette-input">${icon('search')}<input id="pal-q" placeholder="${esc(t('topbar_search'))}" autocomplete="off" aria-label="Search"></div><div class="palette-list" role="listbox"></div><div class="palette-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> ${esc(t('kbd_to_move'))}</span><span><span class="kbd">Enter</span> ${esc(t('kbd_to_open'))}</span><span><span class="kbd">Esc</span> ${esc(t('kbd_to_close'))}</span></div></div>`;
  document.body.appendChild(m);
  const q = $('#pal-q', m), box = $('.palette-list', m);
  const draw = () => {
    box.innerHTML = list.length ? `<div class="palette-group">${esc(t('palette_group_pages'))}</div>` + list.map((it, i) =>
      `<button class="palette-item" role="option" data-i="${i}" aria-selected="${i === sel}">${icon(it.icon)}<span class="grow truncate">${esc(it.label)}</span></button>`).join('')
      : `<div class="empty" style="padding:28px">${esc(t('palette_none'))}</div>`;
    const s = $('[aria-selected="true"]', box); s && s.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { m.remove(); document.removeEventListener('keydown', key, true); };
  const run = i => { const it = list[i]; if (!it) return; close(); switchPage(it.page); };
  const key = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(list.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  };
  document.addEventListener('keydown', key, true);
  q.addEventListener('input', () => { const term = q.value.trim().toLowerCase(); list = term ? all.filter(x => x.label.toLowerCase().includes(term)) : all; sel = 0; draw(); });
  on(m, 'click', '.palette-item', (e, el) => run(+el.dataset.i)); m.addEventListener('mousedown', e => { if (e.target === m) close(); });
  draw(); q.focus();
}
function showShortcuts() {
  const row = (k, txt) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--divider)"><span>${esc(txt)}</span><span class="kbd">${esc(k)}</span></div>`;
  ui.modal({ title: t('kbd_shortcuts'), size: 'sm', body: row('Ctrl K', t('sc_search')) + row('/', t('sc_search')) + row('Esc', t('sc_close')) + row('↑ ↓', t('sc_move')), footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_close'))}</button>` });
}
document.addEventListener('keydown', e => {
  if (!document.getElementById('app') || document.getElementById('app').classList.contains('hidden')) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  else if (e.key === '/' && !typing && !$('.overlay') && !$('.modal-overlay:not(.hidden)')) { e.preventDefault(); openPalette(); }
});
