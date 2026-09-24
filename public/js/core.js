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
let filterPanelOpen = false;
let currentLang   = localStorage.getItem('lang') || 'en';

const TRANSLATIONS = {
  en: {
    nav_deals:'Deals', nav_contacts:'Contacts', nav_activities:'Activities', nav_settings:'Settings', nav_board:'Board',
    role_owner:'Owner', role_admin:'Admin', role_member:'Member', lbl_invite_role:'Role',
    tab_workspace:'Workspace', tab_preferences:'My preferences', tab_tasks:'Tasks', tab_integrations:'Integrations',
    hint_preferences:'These settings apply only to you, not to the whole workspace.',
    set_appearance:'Appearance', hint_appearance:'Light or dark theme for this browser.', set_danger:'Delete workspace',
    hint_members:'Everyone who has joined this workspace.',
    set_miro:'Miro board', hint_miro:'Paste the embed link from Miro (Share, then Embed). Leave empty to hide the Board page.',
    // Settings: section titles and one-line descriptions
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
    no_pipelines_yet:'No pipelines yet.', no_deal_fields_yet:'No deal fields yet.', no_invites_yet:'No invite codes yet.',
    add_deal:'Add deal', lbl_deal_title:'Title', lbl_deal_value:'Value',
    // Deals board
    urg_0:'No urgency', urg_1:'Low', urg_2:'Medium', urg_3:'High', urg_4:'Very urgent', urgency:'Urgency',
    select_pipeline_hint:'Choose a pipeline above to see its board, or switch to the list to see every deal.',
    all_pipelines:'All pipelines', move_here:'Move here', move_to:'Move to', delete_deal:'Delete deal',
    confirm_delete_deal:'Delete this deal? This cannot be undone.', deal_move_failed:"Couldn't move the deal. Try again.",
    deals_count_one:'1 deal', deals_count:'{n} deals', card_menu:'Deal options',
    col_title:'Title', col_pipeline:'Pipeline', no_deals_found:'No deals found.',
    // Deal view (modal)
    deal_new:'New deal', deal_edit:'Edit deal', deal_title_ph:'Deal title', btn_add_task:'Task',
    sec_details:'Details', sec_contact:'Contact', sec_notes:'Notes', lbl_pipeline:'Pipeline', lbl_supplier:'Supplier',
    opt_no_stage:'No stage', opt_no_contact:'No contact', opt_none_named:'No {name}', opt_select:'Select…', stage_none:'No stage yet',
    deal_no_contact_hint:'No contact linked. Choose one under Details.', deal_save_first_hint:'Save the deal and link a contact to see its notes.',
    btn_add_note:'Add note', btn_show_all:'Show all', lbl_date:'Date', no_date:'No date', no_date_hint:'Saved without a date, so it will not appear on the calendar.',
    save_deal:'Save deal', show_more:'Show more', show_less:'Show less', btn_comment:'Comment', btn_reply:'Reply', btn_send:'Send',
    comment_ph:'Write a comment…', reply_ph:'Write a reply…', loading:'Loading…', unknown_user:'Unknown',
    err_load_activities:"Couldn't load the notes.", err_load_comments:"Couldn't load the comments.", err_save_comment:"Couldn't save the comment.", err_load_deal:"Couldn't load the deal.",
    no_activities_hint:'No notes yet. Add the first one.', all_notes_title:'All notes and activities',
    confirm_delete_activity:'Delete this note? This cannot be undone.', enter_content:'Write something first.',
    save_deal_first_task:'Save the deal first, then add a task from it.',
    objects_save_first:'Save the deal first to link {name}.', objects_none:'No {name} linked yet.', objects_add:'Link {name}…', btn_link:'Link', btn_unlink:'Unlink',
    objects_none_yet:'No {name} yet. Add one on the {page} page.', objects_all_linked:'Every {name} in this workspace is already linked.',
    yes:'Yes', no:'No', name_required:'Name is required.', saving:'Saving…', more_fields:'More fields',
    fmt_bold:'Bold', fmt_italic:'Italic', fmt_underline:'Underline', fmt_list:'List', fmt_link:'Link', fmt_clear:'Clear formatting',
    search_contact_ph:'Type a name, company or email…', search_named_ph:'Search {name}…', no_matches:'No matches', btn_clear:'Clear',
    // Lists (Contacts table, Deals list)
    search_contacts_ph:'Search name, company, email or phone…', search_deals_ph:'Search deals by title or contact…',
    suppliers:'Suppliers', add_named:'Add {name}', btn_filter:'Filter', col_actions:'Actions',
    n_selected:'{n} selected', select_all_n:'Select all {n}', select_page:'Select this page', pagination_range:'{from}–{to} of {total}',
    empty_contacts_title:'No contacts yet', empty_contacts_hint:'Add your first contact or import a CSV.',
    empty_filtered_title:'Nothing matches these filters', empty_filtered_hint:'Try fewer filters or clear them.', btn_clear_filters:'Clear filters',
    empty_deals_title:'No deals here yet', empty_deals_hint:'Add a deal or pick another pipeline.',
    filter_title:'Filters', filter_keywords:'Search by keyword', filter_keyword_ph:'Keyword…', filter_none:'Nothing to filter by yet.', btn_clear_all:'Clear all',
    dblclick_edit:'Double-click to edit', btn_open:'Open', row_menu:'Row options',
    confirm_delete_contact:'Delete this contact? This cannot be undone.', delete_contact:'Delete contact',
    bulk_delete_msg:'You are about to delete {n} contacts. This cannot be undone.', bulk_delete_confirm_hint:'Type {n} to confirm.', err_delete_contacts:"Couldn't delete the contacts.",
    // Contact record (side panel / detail modal)
    sec_deals:'Deals', lbl_added:'Added', contact_menu:'Contact options', no_deals_hint:'No deals yet.',
    sec_tasks:'Tasks', no_tasks_hint:'No tasks yet.', toggle_section:'Show or hide', sec_contact_info:'Contact information',
    // Team chat
    nav_chat:'Team chat', page_chat:'Team chat', chat_placeholder:'Message your team…', chat_send:'Send',
    chat_online_one:'1 online', chat_online_n:'{n} online', chat_nobody_online:'Nobody online', chat_you:'You', chat_today:'Today', chat_yesterday:'Yesterday',
    chat_empty_title:'No messages yet', chat_empty_hint:'Say hello to your team.', chat_load_error:"Couldn't load the chat.", chat_retry:'Retry',
    chat_history_start:'This is the beginning of the conversation', chat_loading_older:'Loading earlier messages…',
    chat_new_messages:'New messages', chat_unread_divider:'Unread', chat_reconnecting:'Connection lost. Reconnecting…',
    chat_offline:"You're offline. Your message is kept until the connection is back.", chat_not_sent:'Not sent',
    chat_too_long:'Messages can have up to 2,000 characters.', chat_rate_limited:"You're sending too fast. Wait a moment.", chat_chars_left:'{n} left',
    assigned_to_lbl:'Assigned to', assign_someone:'Assign to someone', click_to_edit:'Click to edit', edit_all_fields:'Edit all fields',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Each pipeline has its own stages. A deal belongs to one pipeline.',
    set_deal_fields:'Deal fields', hint_deal_fields:'Extra properties on every deal.',
    no_pipelines:'No pipelines yet. Create one in Settings → Deals.',
    no_deals:'No deals in this stage.',
    dark_mode:'Dark mode', light_mode:'Light mode', logout:'Log out',
    page_pipeline:'Pipeline', page_contacts:'Contacts', page_activities:'Activities', page_settings:'Settings',
    add_contact:'Add contact', log_activity:'Log activity',
    import_csv:'⬆ Import CSV', export_csv:'⬇ Export CSV',
    col_name:'Name', col_company:'Company', col_email:'Email', col_phone:'Phone', col_stage:'Stage', col_assignee:'Assignee', col_created_at:'Date Added',
    search_ph:'Search contacts…',
    no_activities:'No activities yet.', no_subtasks:'No subtasks yet.', no_fields:'No custom fields yet.',
    unassigned:'Unassigned',
    act_note:'Note', act_call:'Call', act_email:'Email', act_whatsapp:'WhatsApp',
    logged_by:'by',
    // Activities page
    day_today:'Today', day_yesterday:'Yesterday', n_activities:'{n} activities', activities_search_ph:'Search activities…', act_all:'All',
    no_activities_title:'No activities yet', no_activities_match:'No activities match your search.', act_edit:'Edit', act_delete:'Delete',
    // Analytics
    page_analytics:'Analytics', nav_analytics:'Analytics', analytics_settings:'Metric settings',
    analytics_outcomes:'Deal outcomes', analytics_pipelines:'Deals by pipeline', analytics_trends:'Trends',
    period_week:'Week', period_month:'Month', period_year:'Year',
    kpi_pipeline_value:'Pipeline value', kpi_won_value:'Won value', kpi_win_rate:'Win rate', kpi_deals:'Deals', kpi_new_deals:'New deals', kpi_contacts:'Contacts', kpi_overdue_tasks:'Overdue tasks',
    kpi_open_deals_sub:'{n} open', kpi_avg_sub:'avg {v} per deal', kpi_won_lost_sub:'{w} won · {l} lost', kpi_this_month:'this month', kpi_new_this_month:'+{n} this month',
    kpi_setup_stages:'Set up won and lost stages', kpi_of_tasks:'of {n} tasks',
    outcome_won:'Won', outcome_open:'Open', outcome_lost:'Lost', no_outcomes_hint:'No deals yet.', no_outcomes_setup:'Choose which stages count as won and lost to see outcomes.', no_pipelines:'No pipelines yet.',
    deal_one:'1 deal', deal_other:'{n} deals',
    trend_new_deals:'New deals', trend_new_contacts:'New contacts', trend_deal_value:'Deal value',
    cfg_title:'Metric settings', cfg_cards:'Numbers on the page', cfg_cards_hint:'Choose which numbers appear in the band at the top.',
    cfg_value_field:'Deal value field', cfg_value_field_hint:'The field that holds a deal\'s price. Only number and currency fields are listed.',
    cfg_value_none:'None (hide value metrics)', cfg_value_builtin:'Deal value (built-in)', cfg_won_stages:'Won stages', cfg_lost_stages:'Lost stages',
    cfg_overlap_error:'A stage cannot be both won and lost.',
    tab_general:'General', tab_pipeline:'Pipeline', tab_contacts:'Contacts', tab_team:'Team',
    set_fields:'Custom fields', set_kanban:'Kanban card fields',
    set_invites:'Invite codes', set_members:'Members', set_language:'Language', set_workspace:'Workspace name',
    set_contact_cols:'Table columns', hint_contact_cols:'Drag to reorder. Name is always first.',
    set_wa_template:'WhatsApp message template',
    hint_wa_template:'Pre-filled when you tap the WhatsApp button on a contact.',
    wa_vars:'Available variables:',
    hint_fields:'Extra properties on every contact.',
    hint_kanban:'Choose which fields appear on pipeline cards. Name is always shown.',
    hint_invites:'One-time codes that let people join this workspace.',
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
    detail_activities:'Activities',
    detail_log_ph:'Add note, call, or email…', detail_unassigned:'Unassigned',
    opt_none:'— None —', opt_unassigned:'— Unassigned —',
    lang_en:'English', lang_de:'German',
  },
  de: {
    nav_deals:'Deals', nav_contacts:'Kontakte', nav_activities:'Aktivitäten', nav_settings:'Einstellungen', nav_board:'Board',
    role_owner:'Inhaber', role_admin:'Admin', role_member:'Mitglied', lbl_invite_role:'Rolle',
    tab_workspace:'Arbeitsbereich', tab_preferences:'Meine Einstellungen', tab_tasks:'Aufgaben', tab_integrations:'Integrationen',
    hint_preferences:'Diese Einstellungen gelten nur für dich, nicht für den ganzen Arbeitsbereich.',
    set_appearance:'Darstellung', hint_appearance:'Helles oder dunkles Design für diesen Browser.', set_danger:'Arbeitsbereich löschen',
    hint_members:'Alle, die diesem Arbeitsbereich beigetreten sind.',
    set_miro:'Miro-Board', hint_miro:'Embed-Link aus Miro einfügen (Teilen, dann Einbetten). Leer lassen, um die Board-Seite auszublenden.',
    // Einstellungen: Abschnittstitel und Kurzbeschreibungen
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
    no_pipelines_yet:'Noch keine Pipelines.', no_deal_fields_yet:'Noch keine Deal-Felder.', no_invites_yet:'Noch keine Einladungscodes.',
    add_deal:'Deal hinzufügen', lbl_deal_title:'Titel', lbl_deal_value:'Wert',
    // Deal-Board
    urg_0:'Keine Dringlichkeit', urg_1:'Niedrig', urg_2:'Mittel', urg_3:'Hoch', urg_4:'Sehr dringend', urgency:'Dringlichkeit',
    select_pipeline_hint:'Wähle oben eine Pipeline für das Board, oder wechsle zur Liste für alle Deals.',
    all_pipelines:'Alle Pipelines', move_here:'Hierher verschieben', move_to:'Verschieben nach', delete_deal:'Deal löschen',
    confirm_delete_deal:'Diesen Deal löschen? Das lässt sich nicht rückgängig machen.', deal_move_failed:'Der Deal konnte nicht verschoben werden. Bitte erneut versuchen.',
    deals_count_one:'1 Deal', deals_count:'{n} Deals', card_menu:'Deal-Optionen',
    col_title:'Titel', col_pipeline:'Pipeline', no_deals_found:'Keine Deals gefunden.',
    // Deal-Ansicht (Modal)
    deal_new:'Neuer Deal', deal_edit:'Deal bearbeiten', deal_title_ph:'Deal-Titel', btn_add_task:'Aufgabe',
    sec_details:'Details', sec_contact:'Kontakt', sec_notes:'Notizen', lbl_pipeline:'Pipeline', lbl_supplier:'Lieferant',
    opt_no_stage:'Keine Phase', opt_no_contact:'Kein Kontakt', opt_none_named:'Kein {name}', opt_select:'Auswählen…', stage_none:'Noch keine Phase',
    deal_no_contact_hint:'Kein Kontakt verknüpft. Wähle einen unter Details.', deal_save_first_hint:'Speichere den Deal und verknüpfe einen Kontakt, um Notizen zu sehen.',
    btn_add_note:'Notiz hinzufügen', btn_show_all:'Alle anzeigen', lbl_date:'Datum', no_date:'Ohne Datum', no_date_hint:'Ohne Datum gespeichert, erscheint daher nicht im Kalender.',
    save_deal:'Deal speichern', show_more:'Mehr anzeigen', show_less:'Weniger anzeigen', btn_comment:'Kommentieren', btn_reply:'Antworten', btn_send:'Senden',
    comment_ph:'Kommentar schreiben…', reply_ph:'Antwort schreiben…', loading:'Wird geladen…', unknown_user:'Unbekannt',
    err_load_activities:'Notizen konnten nicht geladen werden.', err_load_comments:'Kommentare konnten nicht geladen werden.', err_save_comment:'Kommentar konnte nicht gespeichert werden.', err_load_deal:'Deal konnte nicht geladen werden.',
    no_activities_hint:'Noch keine Notizen. Füge die erste hinzu.', all_notes_title:'Alle Notizen und Aktivitäten',
    confirm_delete_activity:'Diese Notiz löschen? Das lässt sich nicht rückgängig machen.', enter_content:'Bitte zuerst etwas schreiben.',
    save_deal_first_task:'Speichere zuerst den Deal, dann kannst du eine Aufgabe daraus anlegen.',
    objects_save_first:'Speichere zuerst den Deal, um {name} zu verknüpfen.', objects_none:'Noch keine {name} verknüpft.', objects_add:'{name} verknüpfen…', btn_link:'Verknüpfen', btn_unlink:'Entfernen',
    objects_none_yet:'Noch keine {name}. Lege welche auf der Seite {page} an.', objects_all_linked:'Alle {name} in diesem Arbeitsbereich sind bereits verknüpft.',
    yes:'Ja', no:'Nein', name_required:'Name ist erforderlich.', saving:'Wird gespeichert…', more_fields:'Weitere Felder',
    fmt_bold:'Fett', fmt_italic:'Kursiv', fmt_underline:'Unterstrichen', fmt_list:'Liste', fmt_link:'Link', fmt_clear:'Formatierung entfernen',
    search_contact_ph:'Name, Firma oder E-Mail eingeben…', search_named_ph:'{name} suchen…', no_matches:'Keine Treffer', btn_clear:'Leeren',
    // Listen (Kontakttabelle, Deal-Liste)
    search_contacts_ph:'Name, Firma, E-Mail oder Telefon suchen…', search_deals_ph:'Deals nach Titel oder Kontakt suchen…',
    suppliers:'Lieferanten', add_named:'{name} hinzufügen', btn_filter:'Filter', col_actions:'Aktionen',
    n_selected:'{n} ausgewählt', select_all_n:'Alle {n} auswählen', select_page:'Diese Seite auswählen', pagination_range:'{from}–{to} von {total}',
    empty_contacts_title:'Noch keine Kontakte', empty_contacts_hint:'Lege den ersten Kontakt an oder importiere eine CSV.',
    empty_filtered_title:'Nichts passt zu diesen Filtern', empty_filtered_hint:'Weniger Filter setzen oder alle entfernen.', btn_clear_filters:'Filter entfernen',
    empty_deals_title:'Noch keine Deals hier', empty_deals_hint:'Lege einen Deal an oder wähle eine andere Pipeline.',
    filter_title:'Filter', filter_keywords:'Nach Stichwort suchen', filter_keyword_ph:'Stichwort…', filter_none:'Noch nichts zum Filtern.', btn_clear_all:'Alle entfernen',
    dblclick_edit:'Doppelklick zum Bearbeiten', btn_open:'Öffnen', row_menu:'Zeilenoptionen',
    confirm_delete_contact:'Diesen Kontakt löschen? Das lässt sich nicht rückgängig machen.', delete_contact:'Kontakt löschen',
    bulk_delete_msg:'Du löschst gleich {n} Kontakte. Das lässt sich nicht rückgängig machen.', bulk_delete_confirm_hint:'Zur Bestätigung {n} eingeben.', err_delete_contacts:'Die Kontakte konnten nicht gelöscht werden.',
    // Kontaktdatensatz (Seitenleiste / Detailfenster)
    sec_deals:'Deals', lbl_added:'Hinzugefügt', contact_menu:'Kontaktoptionen', no_deals_hint:'Noch keine Deals.',
    sec_tasks:'Aufgaben', no_tasks_hint:'Noch keine Aufgaben.', toggle_section:'Ein- oder ausblenden', sec_contact_info:'Kontaktinformationen',
    // Team-Chat
    nav_chat:'Team-Chat', page_chat:'Team-Chat', chat_placeholder:'Nachricht an dein Team…', chat_send:'Senden',
    chat_online_one:'1 online', chat_online_n:'{n} online', chat_nobody_online:'Niemand online', chat_you:'Du', chat_today:'Heute', chat_yesterday:'Gestern',
    chat_empty_title:'Noch keine Nachrichten', chat_empty_hint:'Sag deinem Team Hallo.', chat_load_error:'Der Chat konnte nicht geladen werden.', chat_retry:'Erneut versuchen',
    chat_history_start:'Hier beginnt die Unterhaltung', chat_loading_older:'Frühere Nachrichten werden geladen…',
    chat_new_messages:'Neue Nachrichten', chat_unread_divider:'Ungelesen', chat_reconnecting:'Verbindung unterbrochen. Verbinde neu…',
    chat_offline:'Du bist offline. Deine Nachricht bleibt erhalten, bis die Verbindung wieder steht.', chat_not_sent:'Nicht gesendet',
    chat_too_long:'Nachrichten dürfen bis zu 2.000 Zeichen lang sein.', chat_rate_limited:'Du sendest zu schnell. Warte einen Moment.', chat_chars_left:'{n} übrig',
    assigned_to_lbl:'Zuständig', assign_someone:'Jemandem zuweisen', click_to_edit:'Zum Bearbeiten klicken', edit_all_fields:'Alle Felder bearbeiten',
    tab_deals:'Deals', set_pipelines:'Pipelines', hint_pipelines:'Jede Pipeline hat eigene Phasen. Deals gehören zu einer Pipeline.',
    set_deal_fields:'Deal-Felder', hint_deal_fields:'Zusätzliche Eigenschaften für jeden Deal.',
    no_pipelines:'Noch keine Pipelines. Erstelle eine unter Einstellungen → Deals.',
    no_deals:'Keine Deals in dieser Phase.',
    dark_mode:'Dunkelmodus', light_mode:'Hellmodus', logout:'Abmelden',
    page_pipeline:'Pipeline', page_contacts:'Kontakte', page_activities:'Aktivitäten', page_settings:'Einstellungen',
    add_contact:'Kontakt hinzufügen', log_activity:'Aktivität erfassen',
    import_csv:'⬆ CSV importieren', export_csv:'⬇ CSV exportieren',
    col_name:'Name', col_company:'Unternehmen', col_email:'E-Mail', col_phone:'Telefon', col_stage:'Phase', col_assignee:'Zuständig', col_created_at:'Hinzugefügt am',
    search_ph:'Kontakte suchen…',
    no_activities:'Noch keine Aktivitäten.', no_subtasks:'Noch keine Teilaufgaben.', no_fields:'Noch keine benutzerdefinierten Felder.',
    unassigned:'Nicht zugewiesen',
    act_note:'Notiz', act_call:'Anruf', act_email:'E-Mail', act_whatsapp:'WhatsApp',
    logged_by:'von',
    // Aktivitäten
    day_today:'Heute', day_yesterday:'Gestern', n_activities:'{n} Aktivitäten', activities_search_ph:'Aktivitäten durchsuchen…', act_all:'Alle',
    no_activities_title:'Noch keine Aktivitäten', no_activities_match:'Keine Aktivitäten passen zu deiner Suche.', act_edit:'Bearbeiten', act_delete:'Löschen',
    // Analytics
    page_analytics:'Analytics', nav_analytics:'Analytics', analytics_settings:'Kennzahlen einstellen',
    analytics_outcomes:'Deal-Ergebnisse', analytics_pipelines:'Deals nach Pipeline', analytics_trends:'Trends',
    period_week:'Woche', period_month:'Monat', period_year:'Jahr',
    kpi_pipeline_value:'Pipeline-Wert', kpi_won_value:'Gewonnener Wert', kpi_win_rate:'Gewinnquote', kpi_deals:'Deals', kpi_new_deals:'Neue Deals', kpi_contacts:'Kontakte', kpi_overdue_tasks:'Überfällige Aufgaben',
    kpi_open_deals_sub:'{n} offen', kpi_avg_sub:'Ø {v} pro Deal', kpi_won_lost_sub:'{w} gewonnen · {l} verloren', kpi_this_month:'diesen Monat', kpi_new_this_month:'+{n} diesen Monat',
    kpi_setup_stages:'Gewonnen- und Verloren-Phasen festlegen', kpi_of_tasks:'von {n} Aufgaben',
    outcome_won:'Gewonnen', outcome_open:'Offen', outcome_lost:'Verloren', no_outcomes_hint:'Noch keine Deals.', no_outcomes_setup:'Lege fest, welche Phasen als gewonnen und verloren zählen, um Ergebnisse zu sehen.', no_pipelines:'Noch keine Pipelines.',
    deal_one:'1 Deal', deal_other:'{n} Deals',
    trend_new_deals:'Neue Deals', trend_new_contacts:'Neue Kontakte', trend_deal_value:'Deal-Wert',
    cfg_title:'Kennzahlen einstellen', cfg_cards:'Zahlen auf der Seite', cfg_cards_hint:'Wähle, welche Zahlen im Band oben erscheinen.',
    cfg_value_field:'Feld für den Deal-Wert', cfg_value_field_hint:'Das Feld mit dem Preis eines Deals. Nur Zahlen- und Währungsfelder werden angezeigt.',
    cfg_value_none:'Keins (Wert-Kennzahlen ausblenden)', cfg_value_builtin:'Deal-Wert (integriert)', cfg_won_stages:'Gewonnen-Phasen', cfg_lost_stages:'Verloren-Phasen',
    cfg_overlap_error:'Eine Phase kann nicht gleichzeitig gewonnen und verloren sein.',
    tab_general:'Allgemein', tab_pipeline:'Pipeline', tab_contacts:'Kontakte', tab_team:'Team',
    set_fields:'Benutzerdefinierte Felder', set_kanban:'Kanban-Kartenfelder',
    set_invites:'Einladungscodes', set_members:'Mitglieder', set_language:'Sprache', set_workspace:'Name des Arbeitsbereichs',
    set_contact_cols:'Tabellenspalten', hint_contact_cols:'Ziehen zum Sortieren. Name steht immer zuerst.',
    set_wa_template:'WhatsApp-Nachrichtenvorlage',
    hint_wa_template:'Wird beim Klicken auf den WhatsApp-Button des Kontakts vorausgefüllt.',
    wa_vars:'Verfügbare Variablen:',
    hint_fields:'Zusätzliche Eigenschaften für jeden Kontakt.',
    hint_kanban:'Felder auswählen, die auf Pipeline-Karten erscheinen. Name wird immer angezeigt.',
    hint_invites:'Einmalcodes, mit denen Personen diesem Arbeitsbereich beitreten.',
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
    detail_activities:'Aktivitäten',
    detail_log_ph:'Notiz, Anruf oder E-Mail hinzufügen…', detail_unassigned:'Nicht zugewiesen',
    opt_none:'— Keine —', opt_unassigned:'— Nicht zugewiesen —',
    lang_en:'Englisch', lang_de:'Deutsch',
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
  // Inputs have a placeholder property; contenteditable editors read the attribute (CSS attr()).
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { const v = t(el.dataset.i18nPh); if ('placeholder' in el) el.placeholder = v; else el.setAttribute('placeholder', v); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
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
  if (page === 'analytics')  loadAnalytics();
  if (page === 'settings')   loadSettings();
  if (page === 'objects')    loadObjects();
  if (page === 'board')      loadBoard();
}

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="vertical-align:middle"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;

// Interface icons for JS-rendered controls: the same 1.85-stroke line style as
// the markup's inline SVGs. Use `${UI_ICON.edit}` inside a template literal.
const UI_ICON = {
  edit:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  remove: '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  drag:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  pin:    '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5"/></svg>',
  plus:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  more:   '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  check:  '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  // Activity types on the timeline
  note:   '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  call:   '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail:   '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  chat:   '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>',
  calendar: '<svg class="ic" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  // Lists: sort marks, pagination chevrons, a folder
  chevronUp:    '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
  chevronDown:  '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  chevronLeft:  '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  chevronRight: '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  sort:         '<svg class="ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l4-4 4 4"/><path d="M16 15l-4 4-4-4"/></svg>',
  folder:       '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  // Team chat
  send:         '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  arrowDown:    '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
  // Analytics
  settings:     '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

/* ── Picker: a searchable combobox over an existing <select> ───────────────
   The select stays in the form as the source of truth: it is readable by id,
   it submits, and it fires `change`. The picker only shows and filters its
   options (label = option text, second line = data-meta), with the keyboard:
   ↑ ↓ move, Enter picks, Escape closes the list (and only the list).         */
function pickerFilter(items, q, limit = 30) {
  const needle = String(q || '').trim().toLowerCase();
  const hits = needle ? items.filter(i => `${i.label} ${i.meta || ''}`.toLowerCase().includes(needle)) : items;
  return hits.slice(0, limit);
}
function pickerItems(sel) {
  return [...sel.options].map(o => ({ value: o.value, label: o.textContent.trim(), meta: o.dataset.meta || '' }));
}
function attachPicker(selectId, opts = {}) {
  const sel = document.getElementById(selectId);
  if (!sel) return null;
  sel.classList.add('sr-only'); sel.setAttribute('aria-hidden', 'true'); sel.tabIndex = -1;
  let wrap = sel.parentElement?.querySelector(`.picker[data-for="${selectId}"]`);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'picker is-empty';
    wrap.dataset.for = selectId;
    wrap.innerHTML = `
      <input type="text" class="picker-input" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${selectId}-list" autocomplete="off" />
      <button type="button" class="picker-clear" tabindex="-1" aria-label="${esc(t('btn_clear'))}" title="${esc(t('btn_clear'))}">${UI_ICON.remove}</button>
      <div class="deal-search-dropdown picker-list hidden" id="${selectId}-list" role="listbox"></div>`;
    sel.insertAdjacentElement('afterend', wrap);
    const input = wrap.querySelector('.picker-input'), list = wrap.querySelector('.picker-list'), clear = wrap.querySelector('.picker-clear');
    let active = -1, blurTimer = null;
    const items   = () => pickerItems(sel);
    const isOpen  = () => !list.classList.contains('hidden');
    const close   = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
    const restore = () => {
      const cur = sel.value ? items().find(i => i.value === sel.value) : null;
      input.value = cur ? cur.label : '';
      wrap.classList.toggle('is-empty', !sel.value);
    };
    const pick = (value) => {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      restore(); close();
    };
    const render = () => {
      const rows = pickerFilter(items(), input.value);
      list.innerHTML = rows.length
        ? rows.map((i, idx) => `<div class="deal-search-item${idx === active ? ' active' : ''}" role="option" aria-selected="${i.value !== '' && i.value === sel.value}" data-value="${esc(i.value)}">
            <div class="dsi-title">${esc(i.label)}</div>${i.meta ? `<div class="dsi-meta">${esc(i.meta)}</div>` : ''}
          </div>`).join('')
        : `<div class="deal-search-item dsi-empty">${esc(t('no_matches'))}</div>`;
      list.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true');
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('focus', () => { clearTimeout(blurTimer); input.select(); active = -1; render(); });
    input.addEventListener('input', () => { active = -1; render(); });
    input.addEventListener('keydown', e => {
      const rows = list.querySelectorAll('.deal-search-item:not(.dsi-empty)');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen()) { active = -1; render(); }
        active = e.key === 'ArrowDown' ? Math.min(active + 1, rows.length - 1) : Math.max(active - 1, 0);
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();                                   // never submit the surrounding form from here
        if (!isOpen()) return;
        const row = rows[active] || rows[0];
        if (row) pick(row.dataset.value);
      } else if (e.key === 'Escape') {
        if (!isOpen()) return;                                // a closed picker lets Escape reach the modal
        e.stopPropagation(); e.preventDefault(); restore(); close();
      } else if (e.key === 'Tab') { restore(); close(); }
    });
    input.addEventListener('blur', () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => { restore(); close(); }, 120); });
    list.addEventListener('mousedown', e => {
      const row = e.target.closest('.deal-search-item:not(.dsi-empty)');
      if (!row) return;
      e.preventDefault();                                     // keep focus in the input; beat its blur
      clearTimeout(blurTimer);
      pick(row.dataset.value);
    });
    clear.addEventListener('click', () => { pick(''); input.focus(); });
    wrap._picker = { restore, close, input };
  }
  if (opts.placeholder != null) wrap.querySelector('.picker-input').placeholder = opts.placeholder;
  wrap._picker.restore();
  return wrap;
}
// Re-read the select (after its options or value changed programmatically).
function refreshPicker(selectId) {
  const sel = document.getElementById(selectId);
  sel?.parentElement?.querySelector(`.picker[data-for="${selectId}"]`)?._picker?.restore();
}
function pickerSetValue(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.value = value ?? '';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  refreshPicker(selectId);
}

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

// Render-side sanitiser for note HTML: every place that puts note HTML into the
// page passes it through here first, so a note stored with markup the editor
// never produces cannot run anything. DOMParser documents are inert: nothing
// loads or runs while the untrusted markup is parsed.
function sanitizeNoteHtml(html) {
  if (html == null) return '';
  // Self-contained on purpose: no dependence on anything else in this file
  // having initialised first.
  const NOTE_ALLOWED_TAGS = new Set(['B','I','U','STRONG','EM','A','BR','P','UL','OL','LI']);
  const NOTE_DROP_TAGS    = new Set(['SCRIPT','STYLE','TEMPLATE','IFRAME','OBJECT','EMBED','NOSCRIPT']);
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== 1) { if (child.nodeType !== 3) child.remove(); continue; }   // keep text, drop comments etc.
      const tag = child.tagName.toUpperCase();
      if (NOTE_DROP_TAGS.has(tag)) { child.remove(); continue; }                          // text inside goes too
      walk(child);
      if (tag === 'DIV') {                                                                 // editor line -> paragraph
        const p = doc.createElement('p');
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p); continue;
      }
      if (!NOTE_ALLOWED_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; } // unwrap, keep children
      const href = tag === 'A' ? child.getAttribute('href') : null;
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      if (href && /^\s*(https?:|mailto:)/i.test(href)) child.setAttribute('href', href);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

// "Today", "Yesterday", or the long localized date: shared by the chat and the activities log.
function dayLabelFor(iso, now = new Date()) {
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const d = new Date(iso), n = new Date(now);
  if (same(d, n)) return t('day_today');
  const y = new Date(n); y.setDate(y.getDate() - 1);
  if (same(d, y)) return t('day_yesterday');
  const locale = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'en-GB';
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtDate(dt) {
  if (!dt) return '';
  const locale = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'en-US';
  return new Date(dt).toLocaleDateString(locale, { month:'short', day:'numeric', year:'numeric' });
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

/* ── List primitives shared by the Contacts table and the Deals list ────────
   One header cell, one pagination bar, one "is this click on a control?"
   check, and one popover menu — so both lists read and behave as one.      */
function sortIconFor(key, sortKey, sortDir) {
  if (sortKey === key) return `<span class="sort-ic is-active">${sortDir === 'asc' ? UI_ICON.chevronUp : UI_ICON.chevronDown}</span>`;
  return `<span class="sort-ic">${UI_ICON.sort}</span>`;
}
// { key, label, sortKey, sortDir, onSort: 'globalFnName' | null, align: 'left'|'right', cls }
function tableHeadCell({ key, label, sortKey = null, sortDir = 'asc', onSort = null, align = 'left', cls = '' }) {
  const sortable = !!onSort;
  const active = sortable && sortKey === key;
  const classes = [sortable ? 'th-sortable' : '', active ? 'is-sorted' : '', align === 'right' ? 'td-num' : '', cls].filter(Boolean).join(' ');
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<th data-col-key="${esc(key)}"${classes ? ` class="${classes}"` : ''}${sortable ? ` aria-sort="${ariaSort}" onclick="${onSort}('${esc(key)}')"` : ''}><span class="th-label">${label}</span>${sortable ? sortIconFor(key, sortKey, sortDir) : ''}</th>`;
}
// True when a click landed on something that already has its own behaviour.
function rowIsInteractive(target) {
  return !!(target && target.closest && target.closest('a, button, input, select, textarea, label, [contenteditable], .row-actions, .editable-cell.editing, .card-menu'));
}
// { total, page, pageSize, goto: 'globalFnName' } → the pagination bar's inner markup (the range is always shown)
function paginationHtml({ total, page, pageSize, goto }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(1, page), totalPages);
  const from = total ? (cur - 1) * pageSize + 1 : 0, to = Math.min(cur * pageSize, total);
  const range = t('pagination_range').replace('{from}', from).replace('{to}', to).replace('{total}', total);
  if (totalPages <= 1) return `<span class="pagination-info">${range}</span>`;
  const pages = buildPageNumbers(cur, totalPages);
  return `
    <span class="pagination-info">${range}</span>
    <div class="pagination-controls">
      <button type="button" class="page-btn" onclick="${goto}(${cur - 1})" ${cur === 1 ? 'disabled' : ''} aria-label="Previous page">${UI_ICON.chevronLeft}</button>
      ${pages.map(p => p === '…'
        ? '<span class="page-ellipsis">…</span>'
        : `<button type="button" class="page-btn${p === cur ? ' active' : ''}" onclick="${goto}(${p})">${p}</button>`).join('')}
      <button type="button" class="page-btn" onclick="${goto}(${cur + 1})" ${cur === totalPages ? 'disabled' : ''} aria-label="Next page">${UI_ICON.chevronRight}</button>
    </div>`;
}
// A small popover menu anchored under a button (same look as the deal board's card menu).
let popoverMenuEl = null;
function closePopoverMenu() {
  if (popoverMenuEl) { popoverMenuEl.remove(); popoverMenuEl = null; }
  document.querySelectorAll('[data-popover-open="true"]').forEach(b => { b.removeAttribute('data-popover-open'); b.setAttribute('aria-expanded', 'false'); });
}
function openPopoverMenu(btn, innerHtml) {
  const already = btn.dataset.popoverOpen === 'true';
  closePopoverMenu();
  if (already) return;
  const menu = document.createElement('div');
  menu.className = 'card-menu'; menu.setAttribute('role', 'menu');
  menu.innerHTML = innerHtml;
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect(), m = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
  const below = r.bottom + 4 + m.height <= window.innerHeight - 8;
  menu.style.left = `${left}px`;
  menu.style.top  = `${below ? r.bottom + 4 : Math.max(8, r.top - 4 - m.height)}px`;
  btn.dataset.popoverOpen = 'true'; btn.setAttribute('aria-expanded', 'true');
  popoverMenuEl = menu;
  menu.querySelector('.card-menu-item:not([disabled])')?.focus();
}
document.addEventListener('click',   e => { if (popoverMenuEl && !popoverMenuEl.contains(e.target)) closePopoverMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && popoverMenuEl) closePopoverMenu(); });

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

// Overlays in the static markup close by id (so the form / submit reset runs);
// overlays built by JS at runtime are simply removed.
const STATIC_OVERLAY_IDS = new Set([...document.querySelectorAll('.modal-overlay')].map(o => o.id).filter(Boolean));
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});
// Escape closes the topmost open modal. Popovers that own Escape (the deal
// board's card menu) are left alone.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('.card-menu')) return;
  const open = [...document.querySelectorAll('.modal-overlay:not(.hidden)')].pop();
  if (!open) return;
  if (STATIC_OVERLAY_IDS.has(open.id)) closeModal(open.id); else open.remove();
});

document.addEventListener('mousedown', e => {
  if (!e.target.closest('.deal-search-wrap') && !e.target.closest('.deal-search-dropdown') && !e.target.closest('.picker')) {
    document.querySelectorAll('.deal-search-dropdown').forEach(dd => dd.classList.add('hidden'));
  }
});
