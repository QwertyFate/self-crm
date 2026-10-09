/* ═══════════════════════════════════════════════════════════════════════════
   CORE — the foundation every other client file is built on. Loaded FIRST.

   There are no modules in the browser here: every public/js file shares one
   global scope and is loaded by a <script> tag in index.html. This file
   declares the shared state and the helpers, so nothing else can run without
   it. If you are new, read this file before any other client file.

   WHAT LIVES HERE
     1. Global state   — currentUser, currentWorkspace, and the per-page caches
                         (contacts, deals, pipelines, objects, …). Every other
                         file reads and writes these directly.
                         ⚠ Add a global here → also reset it in resetClientState()
                         (auth.js), or the next user to log in in the same tab
                         sees the previous user's data.
     2. i18n           — TRANSLATIONS.en / .de, t(key), tf(key, vars),
                         applyTranslations(), setLanguage(). A key must exist in
                         BOTH languages; tests/client assert that.
     3. Networking     — api.get/post/put/patch/del. Thin wrappers over fetch
                         that always parse JSON and never throw: a failed call
                         resolves to { error }. ALWAYS check `res.error`.
                         apiFetchSilent() is the same without the loading bar
                         (used by pollers so the bar does not flicker).
     4. Formatting     — esc() (HTML-escape — use it on EVERY interpolated
                         value), fmtDate, buildPageNumbers, initialsOf,
                         hashColor, avatar, icon.
     5. ui.*           — the design system in code: ui.popover, ui.menu,
                         ui.select, ui.modal, ui.drawer, ui.confirm, ui.toast.
                         Prefer these over hand-rolled markup and over the
                         browser's own dialogs.
     6. Shell          — setCrumbs, toggleRail, setSidebarWorkspace, the top-bar
                         New / help / user menus, the Ctrl-K command palette,
                         the theme toggle and the loading bar.

   FUNCTION MAP
     i18n        t, tf, roleLabel, applyTranslations, setLanguage
     format      esc, fmtDate, buildPageNumbers, icon, initialsOf, hashColor,
                 avatar, uid, waLink
     net         apiFetch, apiFetchSilent, api (get/post/put/patch/del), loader
     dom         $, $$, on (delegated listener), closeModal, toggleNoDate,
                 resetNoDate, toggleInlineNoDate, defaultNoDate
     theme       applyTheme, toggleDarkMode
     ui          ui.popover, ui.menu, ui.select, uiOverlay, ui.modal, ui.drawer,
                 ui.confirm, ui.toast, ui.formData, ui.closePopover
     shell       setCrumbs, toggleRail, applyRailState, setSidebarWorkspace,
                 openNewMenu, openHelpMenu, openUserMenu, openPalette,
                 showShortcuts

   GOTCHA  esc() escapes & < > " — it does NOT escape single quotes. Never put
           an unescaped value inside a single-quoted HTML attribute.
   ═══════════════════════════════════════════════════════════════════════════ */

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
let currentLang   = localStorage.getItem('lang') || 'de';   // the team is German; English stays one click away in Settings

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
    search_activities:'Search activities', chip_type:'Type', chip_person:'Person', chip_deal:'Deal', activities_logged:'{n} logged, {m} in the last 7 days', no_activities_match:'No activities match your filters',
    delete_activity:'Delete activity', activity_deleted:'Activity deleted', export_activities_csv:'Exported {n} activities',
    // Activities page, full port (compose card, Period chip, day groups, rail, kebab)
    chip_period:'Period', period_all:'All time', period_today:'Today', period_7d:'Last 7 days', period_30d:'Last 30 days',
    act_verb_note:'Add note', act_verb_call:'Log call', act_verb_email:'Log email', act_verb_whatsapp:'Log message',
    act_ph_note:'Write a note', act_ph_call:'What was discussed on the call?', act_ph_email:'Summarise the email or paste its key points', act_ph_whatsapp:'Message text or summary of the chat',
    act_err_text:'Add a short description before saving.', act_err_link:'Link a deal or a contact so the entry can be found later.', act_err_save:'Could not save the entry. Try again.', act_logged:'{type} logged',
    act_compose_aria:'Log a new activity', opt_no_deal:'No deal', opt_no_contact:'No contact', one_activity:'1 activity', n_activities:'{n} activities',
    rail_aria:'Breakdown', rail_by_type:'By type', rail_by_person:'By person', rail_top_deals:'Most active deals', rail_no_deals:'No deal activity in this view',
    no_activities_sub:'Log a call, email or note to start the feed.', no_activities_match_sub:'Try a different search term or clear the filters.',
    delete_activity_q:'Delete this activity?', delete_activity_msg:'The entry is removed from the feed and from the history of the linked deal.', open_contact:'Open contact', open_supplier:'Open {name}',
    today:'Today', yesterday:'Yesterday', ago_now:'Just now', ago_h:'{n}h ago', ago_d:'{n} days ago',
    // Tasks page, reference screen port (sidebar views, summary, chips, grouped table, bulk bar, board)
    tk_views:'Views', tk_all:'All tasks', tk_mine:'My tasks', tk_projects:'Projects', tk_new_project:'New project', tk_edit_project:'Edit project', tk_add_list:'Add list', tk_new_list:'New list', tk_no_projects:'No projects yet.', tk_one_open:'1 open task', tk_open_n:'{n} open tasks', tk_overdue_n:'{n} overdue',
    tk_collapse:'Collapse', tk_expand:'Expand', tk_actions_for:'Actions for {name}', tk_rename_project:'Rename project', tk_delete_project:'Delete project', tk_rename_list:'Rename list', tk_delete_list:'Delete list',
    tk_view:'View', tk_list:'List', tk_board:'Board', tk_add_task:'Add task', tk_summary:'Task summary',
    tk_kpi_open:'Open tasks', tk_kpi_inprog:'{n} in progress', tk_kpi_overdue:'Overdue', tk_kpi_needs:'Needs attention', tk_kpi_none_overdue:'Nothing overdue', tk_kpi_week:'Due in 7 days', tk_kpi_incl_today:'Including today', tk_kpi_done:'Completed', tk_kpi_done_foot:'{p} % of {n}',
    tk_search:'Search tasks', chip_assignee:'Assignee', chip_priority:'Priority', chip_status:'Status', chip_due:'Due', tk_not_done:'Not done', tk_done:'Done', tk_due_overdue:'Overdue', tk_due_today:'Today', tk_due_week:'Next 7 days', tk_due_none:'No due date',
    tk_sort:'Sort', tk_sort_due:'Due date', tk_sort_priority:'Priority', tk_sort_title:'Title', tk_sort_owner:'Assignee',
    tk_col_task:'Task', tk_col_subtasks:'Subtasks', tk_col_priority:'Priority', tk_col_due:'Due', tk_col_assignee:'Assignee', tk_select_all:'Select all visible tasks', tk_select:'Select {name}', tk_complete:'Complete', tk_reopen:'Reopen', tk_subs_done:'{d} of {n} subtasks done',
    tk_open_deal:'Open deal', tk_open_contact:'Open contact', tk_no_deal:'No deal', tk_not_set:'Not set', tk_no_project:'No project', tk_add_placeholder:'Add task', tk_add_to:'Add task to {name}', tk_press_enter:'Press Enter to add',
    tk_n_of_total:'{n} of {total}', one_task:'1 task', n_tasks:'{n} tasks', one_list:'1 list', n_lists:'{n} lists', tk_foot_open:'{open} open, {late} overdue', tk_no_match:'No tasks match your filters', tk_no_match_sub:'Try removing a filter or changing the search.',
    tk_bulk_aria:'Bulk actions', tk_bulk_status:'Set status', tk_bulk_priority:'Set priority', tk_bulk_assign:'Assign', tk_bulk_due:'Set due date', tk_clear_sel:'Clear selection', tk_due_tomorrow:'Tomorrow', tk_due_in7:'In 7 days', tk_due_clear:'Clear due date',
    tk_moved_to:'{n} moved to {s}', tk_prio_set:'Priority of {n} set to {p}', tk_assigned_to:'{n} assigned to {m}', tk_due_cleared:'Due date cleared on {n}', tk_due_set:'Due date of {n} set to {d}',
    tk_open_task:'Open task', tk_mark_complete:'Mark complete', tk_reopen_task:'Reopen task', tk_move_to:'Move to status', tk_priority:'Priority', tk_delete_task:'Delete task', tk_delete_task_q:'Delete this task?', tk_delete_tasks_q:'Delete {n} tasks?', tk_delete_msg:'The tasks and their subtasks will be removed. This cannot be undone.',
    tk_deleted:'Task deleted', tk_deleted_n:'{n} tasks deleted', tk_completed:'Task completed', tk_reopened:'Task reopened', tk_moved:'Moved to {s}', tk_prio_single:'Priority set to {p}', tk_added_to:'Task added to {g}', tk_open:'Open', tk_err_add:'Could not add the task.',
    tk_col_nothing_overdue:'Nothing overdue', tk_col_overdue:'{n} overdue', tk_col_none:'No tasks', tk_drop_here:'Drop a task here',
    tk_delete_project_q:'Delete this project?', tk_delete_project_msg:'"{name}" with {lists} and {tasks} will be removed.', tk_delete_list_q:'Delete this list?', tk_delete_list_msg:'"{name}" and its {tasks} will be removed.', tk_project_deleted:'Project "{name}" deleted', tk_list_deleted:'List "{name}" deleted',
    tk_project_created:'Project "{name}" created', tk_project_updated:'Project updated', tk_list_created:'List "{name}" created', tk_list_renamed:'List renamed',
    prio_urgent:'Urgent', prio_high:'High', prio_medium:'Medium', prio_low:'Low',
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
    lbl_stage:'Stage', lbl_assignee:'Assignee', lbl_type:'Type', lbl_contact:'Contact', lbl_deal:'Deal',
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
    engine_btn_retry:'Retry', engine_retry_ok:'Delivered.', engine_retry_failed:'Still failing: {error}', engine_next_attempt:'Next attempt {when}',
    // Documents tab on the contact detail (contracts / recordings for the Upgrads Engine) — detail-views.js
    dv_tab_documents:'Documents', dv_doc_upload:'Upload document', dv_doc_uploading:'Uploading…', dv_doc_download:'Download',
    dv_doc_type_aria:'Document type', dv_doc_type_vertrag:'Contract', dv_doc_type_aufnahme:'Recording', dv_doc_type_sonstiges:'Other',
    dv_no_docs:'No documents yet', dv_docs_hint:'Contracts and call recordings for the Upgrads Engine live here. The Engine fetches them through its API.',
    dv_one_doc:'1 document', n_docs:'{n} documents', dv_doc_uploaded:'Document uploaded', dv_doc_too_large:'File too large (max. 10 MB)',
    dv_doc_delete_q:'Delete document?', dv_doc_delete_msg:'The file is removed from storage. This cannot be undone.', dv_doc_deleted:'Document deleted',
    // API keys card (the Engine's credentials for /api/kunden)
    engine_keys_title:'API keys', engine_keys_hint:'The Engine reads and writes customer data through /api/kunden with one of these keys (Authorization: Bearer). A key is shown once, when it is created.',
    engine_keys_new_label:'New key', engine_keys_new_hint:'Name it after the system that will use it, for example "Engine production".', engine_keys_name_ph:'Engine production',
    engine_keys_create:'Create key', engine_keys_name_required:'Give the key a name first.',
    engine_keys_reveal_label:'Your new key', engine_keys_reveal_hint:'Copy it now and give it to the Engine team. It will not be shown again.', engine_keys_hide:'Done',
    engine_keys_list_label:'Issued keys', engine_keys_none:'No keys yet.', engine_keys_col_name:'Name', engine_keys_col_key:'Key', engine_keys_col_created:'Created', engine_keys_col_last_used:'Last used', engine_keys_never:'never',
    engine_keys_revoke:'Revoke', engine_keys_revoked:'Revoked', engine_keys_confirm_revoke:'Revoke the key "{name}"? The Engine stops working with it immediately.', engine_keys_revoked_toast:'Key revoked.',
    engine_keys_openapi:'Download the API description (OpenAPI 3.1) for the Engine team',
    // Onboarding monitor (Upgrads Engine) — public/js/onboarding.js
    nav_onboarding:'Onboarding', onb_sub:'{running} in onboarding · {done} completed',
    onb_inactive_hint:'The Upgrads Engine integration is switched off. Deals are listed, but nothing is sent until it is activated on the Integrations page.',
    onb_filter_aria:'Filter deals', onb_filter_all:'All', onb_filter_not_started:'Not started', onb_filter_running:'In onboarding', onb_filter_done:'Completed',
    onb_col_deal:'Deal', onb_col_customer:'Customer', onb_col_stage:'Stage', onb_col_status:'Engine status', onb_col_since:'Since', onb_col_delivery:'Webhook', onb_col_drive:'Drive', onb_col_actions:'Action',
    onb_status_kein_onboarding:'No onboarding', onb_status_formular_versendet:'Form sent', onb_status_formular_ausgefuellt:'Form completed', onb_status_termin_gebucht:'Appointment booked',
    onb_status_call_erfolgt:'Call done', onb_status_briefing_fertig:'Briefing ready', onb_status_onboarding_abgeschlossen:'Completed',
    onb_stale:'{days}+ days unchanged', onb_delivery_none:'Not sent', onb_drive_link:'Open Drive folder',
    onb_btn_start:'Start onboarding', onb_no_contact:'Link a customer to this deal first', onb_no_trigger_stage:'No trigger stage is configured for this pipeline (Integrations → Upgrads Engine)',
    onb_confirm_title:'Start onboarding?', onb_confirm_body:'"{deal}" will be moved to the stage "{stage}". The deal then counts as won and the Upgrads Engine is notified.',
    onb_started_toast:'Onboarding started for "{deal}"', onb_empty:'No deals yet', onb_empty_filter:'No deals match this filter',
    onb_empty_hint:"Every deal of the workspace appears here with its customer's onboarding status.",
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
    set_timezone:'Time zone', hint_timezone:'Used by the sidebar clock, by the calendar for what counts as today, and for whether a task is overdue. Defaults to Berlin.',
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
    // Login page (2026-10-06) — the door, in both languages
    au_headline:'From first lead to signed contract, on one board.',
    au_lede:'Upgrads CRM brings your pipeline, contacts, tasks and team chat into one workspace, so everyone on the team can see what matters next.',
    au_pt_pipe_t:'The pipeline at a glance', au_pt_pipe_d:'Drag deals through your stages, with value, urgency and forecast per stage.',
    au_pt_contacts_t:'Contacts with context', au_pt_contacts_d:'Notes, calls, emails and WhatsApp: a contact’s whole history in one place, filterable by deal.',
    au_pt_team_t:'One team, every time zone', au_pt_team_d:'Tasks, calendar and chat in the same workspace. Every date shows in each person’s local time.',
    au_switch_q_signup:'New to Upgrads?', tab_signup:'Create an account', au_switch_q_login:'Already have an account?', tab_login:'Log in',
    au_title_login:'Welcome back', au_sub_login:'Log in and pick up where you left off.',
    au_lbl_email:'Email address', lbl_password:'Password', auth_forgot:'Forgot your password?', auth_show:'Show password', auth_hide:'Hide password',
    btn_login:'Log in', auth_logging_in:'Logging in…',
    au_title_signup:'Create your account', au_sub_signup:'Start a new workspace, or join your team with an invite code.',
    auth_mode_create:'Create a new workspace', auth_mode_join:'Join an existing workspace',
    lbl_workspace_name:'Workspace name', ph_workspace_name:'e.g. Sales North',
    auth_platform_code:'Platform invite code', auth_platform_code_help:'Issued by the platform administrator; required for a new workspace.', ph_platform_code:'Paste the code',
    auth_ws_code:'Workspace invite code', ph_ws_code:'Paste the code',
    lbl_your_name:'Full name', auth_pw_min:'At least 6 characters.', btn_create_account:'Create account',
    au_title_forgot:'Reset your password', au_sub_forgot:'The reset link goes to the email address on the account.',
    auth_copy_link:'Reset link:', btn_send_reset:'Send reset link', auth_back_login:'Back to log in',
    au_title_reset:'Set a new password', au_sub_reset:'At least 6 characters.', auth_new_password:'New password', lbl_confirm_password:'Confirm password', btn_set_password:'Save password',
    au_title_picker:'Choose a workspace', au_sub_picker:'This account belongs to several workspaces. Which one should open?',
    au_title_join:'Join a workspace', au_sub_join:'Enter the invite code from the workspace owner or admin.', btn_join_workspace:'Join', btn_back:'Back',
    auth_pw_updated:'Password updated. Log in with your new password.', auth_pw_mismatch:'The passwords do not match.', auth_code_required:'Please enter the invite code.',
    auth_err_invalid:'Email address or password is not correct.', auth_err_limit:'Too many failed attempts. Please try again in 15 minutes.',
    auth_retry_in:'Try again in %s s', auth_fails_hint:'Five failed attempts. A new password may help.', auth_fails_link:'Reset password',
    // Part 45 — German sweep: analytics
    an_show_chart:'Show chart', an_show_table:'Show data table', an_kpi_open_pipeline:'Open pipeline',
    an_kpi_won_value:'Won value', an_win_rate:'Win rate', an_kpi_new_deals:'New deals',
    an_kpi_avg_deal_size:'Avg deal size', an_kpi_total_contacts:'Total contacts', an_kpi_total_deals:'Total deals',
    an_period_label:'Last {n} months ({from} to {to})', an_prev_period:'previous period', an_no_prior_period:'No prior period',
    an_no_change_vs:'No change vs {vs}', an_vs:'vs {vs}', an_snapshot:'Current snapshot',
    an_one_open_deal:'1 open deal', an_n_open_deals:'{n} open deals', an_closed_won:'Closed won',
    an_won_lost:'{w} won, {l} lost', an_set_won_lost:'Set won and lost stages', an_not_configured:'Not configured',
    an_one_deal:'1 deal', an_in_workspace:'In this workspace', an_new_this_month:'+{n} this month',
    an_key_metrics_aria:'Key metrics', an_kpi_fill:'Changes compare the last {n} months with the {n} months before.', an_aria_nothing_decided:'nothing decided yet',
    an_aria_win_rate:'win rate {rate} %', an_rate_tip:'{rate} % won · {won} of {decided} decided · {created} created', an_rate_chart_aria:'Win rate per month, line chart',
    an_rate_empty_title:'Nothing decided yet', an_rate_empty_sub:'A month gets a win rate once its deals reach a won or lost stage. Pick which stages count as won or lost in Configure Metrics.', an_col_month:'Month',
    an_col_decided:'Decided', an_nothing_decided:'Nothing decided', an_rate_title:'Win rate per month',
    an_rate_sub:'Deals grouped by the month they were created · the share of the decided ones that were won · last {n} months', an_fn_row_title:'{name}: {reached} reached, {now} in this stage now, {value} in stage', an_fn_conv:'{pct} % move on to {next}',
    an_fn_lost_text:'{n} lost · {pct} % of all deals in this period', an_col_reached:'Reached', an_col_conversion:'Conversion',
    an_col_in_stage_now:'In stage now', an_value_in_stage:'Value in stage', an_funnel_title:'Pipeline funnel',
    an_funnel_sub:'deals created in the last {n} months, by stage reached', an_funnel_empty_title:'No pipeline to chart', an_funnel_empty_sub:'Add a pipeline with stages and its funnel appears here.',
    an_owner_row_title:'{name}: {deals} deals, {open} open, {won} won, {lost} lost', an_owner_empty_title:'No deals in this period', an_owner_empty_sub:'Deals created in the last {n} months are counted here, per owner.',
    an_open:'Open', an_won:'Won', an_lost:'Lost',
    an_owner_card_title:'Deals by owner', an_owner_card_sub:'Created in the last {n} months', an_open_deal_aria:'Open deal {title}',
    an_top_empty_title:'No open deals', an_top_empty_sub:'Deals still in play show up here, biggest first.', an_top_title:'Top open deals',
    an_top_sub:'Largest deals still in play', an_view_all_deals:'View all deals', an_showing_top:'Showing top {n} of {total} open deals',
    an_open_value:'Open value', an_wl_empty_title:'No deal outcomes yet', an_wl_empty_sub:'Pick which stages count as won and lost in Configure Metrics and this fills in.',
    an_col_outcome:'Outcome', an_col_share:'Share', an_by_pipeline:'By pipeline',
    an_wl_title:'Win and loss', an_wl_sub:'Every deal by outcome, as things stand now', an_trend_contacts:'New Contacts',
    an_trend_deals:'New Deals', an_trend_value:'Deal Value', an_drag_reorder:'Drag to reorder',
    an_view_line:'Line', an_view_bar:'Bar', an_view_detail:'Detail',
    an_opt_none_value:'None — hide value metrics', an_opt_deal_value_builtin:'Deal Value (built-in)', an_err_stage_both:'A stage cannot be both Won and Lost.',
    // Part 45 — German sweep: calendar-chat
    cal_all_day:'All day', cal_upcoming:'Upcoming', cal_next_7_days:'Today and the next 7 days',
    cal_nothing_scheduled:'Nothing scheduled', cal_nothing_matches:'Nothing in the next 7 days matches the filters.', cal_nothing_next_7:'Nothing scheduled in the next 7 days.',
    cal_add_event:'Add event', cal_prev_month:'Previous month', cal_next_month:'Next month',
    cal_prev_week:'Previous week', cal_next_week:'Next week', cal_legend:'Legend',
    cal_show_day:'Show the whole day', cal_add_on_day:'Add on this day', cal_add_on_date:'Add on {date}',
    cal_n_more:'+{n} more', cal_week_range:'{from} to {to} {year}', cal_events_in_one:'{n} event in {label}',
    cal_events_in_many:'{n} events in {label}', cal_events_week_one:'{n} event this week', cal_events_week_many:'{n} events this week',
    cal_gone:'That entry is no longer here.', cal_err_save:'That did not save. Try again.', cal_past:'Past',
    cal_when:'When', cal_added_by:'Added by', cal_unknown:'Unknown',
    cal_mark_done:'Mark as done', cal_no_details:'No details.', cal_entered_as:'(entered as {time} {tz})',
    cal_nothing_this_day:'Nothing scheduled for this day.', cal_not_done:'Not done yet', chat_no_one_online:'No one online',
    chat_online:'Online:', chat_err_load:'Could not load messages.', chat_empty:'No messages yet. Say hello to your team!',
    chat_err_loading:'Error loading messages.', chat_loading:'Loading…', chat_you:'You',
    chat_ago_m:'{n}m ago', notif_by:'By {name}', notif_caught_up:'You\'re all caught up!',
    notif_appear_here:'Notifications will appear here.',
    // Part 45 — German sweep: core
    core_network_error:'Network error', core_server_error:'Server error ({status})', core_confirm:'Confirm',
    core_supplier:'Supplier', core_search:'Search', core_wa_default:'Hi {{name}}, ',
    lbl_date:'Date', lbl_time:'Time',
    // Part 45 — German sweep: detail-views
    dv_supplier_one:'Supplier', dv_object_one:'Listing', dv_objects_many:'Listings',
    dv_due_today:'Due today', dv_due_today_at:'Due today at {time}', dv_due_tomorrow:'Due tomorrow',
    dv_due_tomorrow_at:'Due tomorrow at {time}', dv_due_in_days:'In {n} days', dv_due_in_days_at:'In {n} days at {time}',
    dv_overdue_one:'1 day overdue', dv_overdue_n:'{n} days overdue', dv_deal_title_ph:'For example Mehrfamilienhaus Köln, Finanzierung',
    dv_contact_help:'Enables call, email and WhatsApp.', dv_none:'None', dv_supplier_help:'Notary, appraiser or partner.',
    dv_edit_deal:'Edit deal', dv_new_deal:'New deal', dv_create_deal:'Create deal',
    dv_err_deal_title:'Enter a deal title.', dv_err_title_len:'Use at most 140 characters.', dv_err_value:'Enter a number of 0 or more.',
    dv_err_value_min:'Use 0 or more.', dv_deal_updated:'Deal updated', dv_deal_created:'Deal created',
    dv_deal_gone:'That deal no longer exists.', dv_edit_aria:'Edit {what}', dv_no_contact_deal:'No contact linked to this deal',
    dv_edit_title_aria:'Edit title: {title}', dv_created_ago:'Created {when}', dv_more_actions:'More actions',
    dv_deal_stage_aria:'Deal stage', dv_current_stage:'Current stage: {s}', dv_move_to_stage:'Move to {s}',
    dv_deal_value:'Deal value', dv_change_stage:'Change stage', dv_stage_pos:'Stage {a} of {b}',
    dv_shown_on_board:'Shown on the board', dv_change_owner:'Change owner', dv_last_activity:'Last activity',
    dv_never:'Never', dv_one_logged_activity:'1 logged activity', dv_n_logged_activities:'{n} logged activities',
    dv_tab_overview:'Overview', dv_tab_activity:'Activity', dv_deal_sections:'Deal sections',
    dv_next_tasks:'Next tasks', dv_view_all:'View all', dv_no_open_tasks:'No open tasks.',
    dv_latest_activity:'Latest activity', dv_no_activity_yet_dot:'No activity yet.', dv_no_activity_yet:'No activity yet',
    dv_log_activity:'Log activity', dv_hint_no_contact_overview:'No contact is linked to this deal. Link one from the Contact card to log calls, emails and messages.', dv_hint_link_call:'No contact is linked to this deal. Link one to log a call.',
    dv_hint_link_email:'No contact is linked to this deal. Link one to log an email.', dv_hint_link_whatsapp:'No contact is linked to this deal. Link one to log a message.', dv_open_dialer:'Open dialer',
    dv_to_whom:'To {who}', dv_open_mail:'Open mail app', dv_open_whatsapp:'Open WhatsApp',
    dv_logged_other_deal:'Logged on another deal of this contact', dv_other_deal:'Other deal', dv_by_name:'by {name}',
    dv_activity_type:'Activity type', dv_compose_text_lbl:'{type} text', dv_logged_as:'Logged as {user}.',
    dv_logged_as_on:'Logged as {user}, on {contact}.', dv_ctrl_enter:'Press Ctrl+Enter to save.', dv_tlonly_on_title:'Showing notes on this deal and untied contact notes. Click to show every note on the contact.',
    dv_tlonly_off_title:'Notes logged on this deal, plus notes on the contact not tied to any deal', dv_show_all_notes:'Show all notes', dv_this_deal_only:'This deal only',
    dv_one_entry:'1 entry', dv_n_entries:'{n} entries', dv_no_entries_type:'No entries of this type',
    dv_choose_type_or_clear:'Choose another type or clear the filter.', dv_log_to_start_deal:'Log a call, email or note to start the history of this deal.', dv_link_contact_first:'Link a contact to this deal first.',
    dv_clear_filter:'Clear filter', dv_new_task:'New task', dv_task_title_ph:'What needs to be done?',
    dv_set_due:'Set a due date', dv_due_date:'Due date', dv_time:'Time',
    dv_n_open:'{n} open', dv_n_done:'{n} done', dv_tasks_linked_deal:'Tasks linked to this deal',
    dv_no_tasks_deal:'No tasks linked to this deal', dv_no_tasks_deal_sub:'Add a task to track the next step, for example a call-back or a document request.', dv_details:'Details',
    dv_edit_all:'Edit all', dv_change_x:'Change {x}', dv_add_x:'Add {x}',
    dv_remove_x:'Remove {x}', dv_x_set_to:'{x} set to {name}', dv_x_removed:'{x} removed',
    dv_unlink_x:'Unlink {name}', dv_no_x_linked:'No {x} linked', dv_no_xs_linked:'No {x} linked',
    dv_link_object_sub:'Link a {one} to keep it with this deal.', dv_add_objects_first:'Add {many} on the {page} page first.', dv_no_contact_linked:'No contact linked',
    dv_link_contact_sub:'Link a contact to call, email or message them from this deal.', dv_add_contact:'Add contact', dv_supplier_empty_sub:'Notary, appraiser or financing partner for this deal.',
    dv_deal_summary:'Deal summary', dv_title_updated:'Title updated', dv_value_updated:'Value updated',
    dv_urgency_updated:'Urgency updated', dv_moved_pipeline:'Moved to {p}, stage reset to {s}', dv_none_stage:'none',
    dv_x_updated:'{x} updated', dv_field:'Field', dv_delete_entry_q:'Delete this entry?',
    dv_delete_entry_deal_msg:'The entry is removed from the activity history of this deal.', dv_delete_entry_msg:'The entry is removed from the activity history.', dv_entry_deleted:'Entry deleted',
    dv_delete_deal_msg:'The deal will be removed from all pipelines. Linked activities and tasks stay in the workspace.', dv_copy_suffix:'{title} (copy)', dv_deal_duplicated:'Deal duplicated',
    dv_duplicate:'Duplicate', dv_err_task_title:'Enter a task title.', dv_task_added:'Task added',
    dv_owner_updated:'Owner updated', dv_all_types:'All types', dv_x_linked:'{x} linked',
    dv_x_unlinked:'{x} unlinked', dv_contact_gone:'That contact no longer exists.', dv_email_x_aria:'Email {name}',
    dv_send_email:'Send email', dv_call_x_aria:'Call {name}', dv_logged_on_deal:'Logged on this deal',
    dv_mark_done:'Mark {title} as done', dv_mark_not_done:'Mark {title} as not done', dv_x_information:'{x} information',
    dv_click_value_hint:'Click a value to edit, Enter saves, Esc cancels', dv_no_activity_logged:'No activity logged yet.', dv_log_first:'Log the first interaction',
    dv_no_open_tasks_for:'No open tasks for this {noun}.', dv_activity_details:'Activity details', dv_ph_note_about:'Write a note about {name}…',
    dv_ph_discussed:'What was discussed or agreed?', dv_activity_timeline:'Activity timeline', dv_filter_activity:'Filter activity',
    dv_filter_note:'Notes', dv_filter_call:'Calls', dv_filter_email:'Emails',
    dv_filter_whatsapp:'WhatsApp messages', dv_no_activity_type:'No activity of this type', dv_choose_type_above:'Choose another type above.',
    dv_log_to_start_contact:'Log a note, call or email to start the timeline.', dv_one_deal:'1 deal', dv_total_value:'Total value',
    dv_deals_linked_here:'Deals linked to this {noun} will show up here.', dv_no_tasks_yet:'No tasks yet', dv_tasks_linked_here:'Tasks linked to this {noun} will show up here.',
    dv_one_deal_total:'1 deal in total', dv_n_deals_total:'{n} deals in total', dv_no_deals:'No deals',
    dv_n_more:'+ {n} more', dv_last_contact_when:'Last contact: {when}', dv_no_phone:'No phone number on file',
    dv_no_email:'No email address on file', dv_err_name:'Enter a name.', dv_err_email:'Enter a valid email address.',
    dv_err_email_not_saved:'Not saved. Enter a valid email address.', dv_copy_email:'Copy email', dv_email_copied:'Email copied',
    dv_copy_phone:'Copy phone', dv_phone_copied:'Phone number copied', dv_delete_noun:'Delete {noun}',
    dv_delete_noun_q:'Delete this {noun}?', dv_delete_contact_msg:'Their activities are deleted with them. This cannot be undone.', dv_noun_deleted:'{noun} deleted',
    dv_description:'Description', dv_optional_details:'Optional details', dv_project:'Project',
    dv_list:'List', dv_set_due_time:'Set a due date and time', dv_due_hint:'Off means no due date. On starts at today, three hours from now.',
    dv_time_hint:'A time puts it on the calendar\'s hour grid.', dv_create_task:'Create task', dv_task_created:'Task created',
    dv_task_gone:'That task no longer exists.', dv_complete_task:'Complete task', dv_task_title_aria:'Task title',
    dv_has_due:'Has a due date', dv_add_description:'Add a description', dv_task_details:'Task details',
    dv_err_title_empty:'The title cannot be empty. The previous title was restored.', dv_title_saved:'Title saved', dv_entered_as:'(entered as {time} {tz})',
    dv_due_set:'Due date set: {d}', dv_due_removed:'Due date removed', dv_status_updated:'Status updated',
    dv_priority_updated:'Priority updated', dv_assignee_updated:'Assignee updated', dv_due_updated:'Due date updated',
    dv_time_updated:'Time updated', dv_description_saved:'Description saved', dv_list_updated:'List updated',
    dv_deal_link_updated:'Deal link updated', dv_contact_updated:'Contact updated', dv_delete_task_msg:'Its subtasks are deleted with it. This cannot be undone.',
    dv_n_of_done:'{d} of {n} done', dv_delete_subtask_aria:'Delete subtask {title}', dv_no_subtasks:'No subtasks yet.',
    dv_add_subtask_ph:'Add a subtask', dv_new_subtask:'New subtask', dv_subtask_deleted:'Subtask deleted',
    // Part 45 — German sweep: guide-import-auth
    gd_welcome_title:'Welcome to your CRM!', gd_welcome_body:'This quick tour walks you through the key features. Use the arrows to move between steps, or skip anytime. You can restart it with the <strong>?</strong> button in the sidebar.', gd_sidebar_title:'Sidebar Navigation',
    gd_sidebar_body:'The sidebar is how you move around. <strong>Workspace</strong> contains your core data — Deals, Contacts, Suppliers, and Tasks. <strong>Tools</strong> has Activities, Listings, Board, and Analytics.', gd_deals_title:'Deals', gd_deals_body:'This is your pipeline. Deals move through stages as they progress. You can view them as a Kanban board or a table.',
    gd_add_deal_title:'Creating a Deal', gd_add_deal_body:'Click <strong>+ Add Deal</strong> to create a new deal. Give it a title, assign it to a pipeline and stage, set a value, and assign it to a team member.', gd_contacts_title:'Contacts',
    gd_contacts_body:'Contacts are the people and companies you work with. Each contact can be linked to deals and have activities logged against them.', gd_add_contact_title:'Creating a Contact', gd_add_contact_body:'Click <strong>+ Add Contact</strong> to add a person or company. You can add custom fields like industry, notes, or any data that matters to your workflow.',
    gd_link_contact_title:'Linking a Contact to a Deal', gd_link_contact_body:'When creating or editing a deal, use the <strong>Contact</strong> field to link a contact to it. Open any deal, click the contact search box, and pick from your contact list.', gd_listings_title:'Listings',
    gd_listings_body:'Listings (also called Objects) are extra entities — properties, products, projects, or anything you want to track alongside deals and contacts.', gd_link_listing_title:'Connecting a Listing to a Deal', gd_link_listing_body:'Inside any deal, the <strong>Listings</strong> section sits under the Contact panel. Pick a listing from the dropdown and press <strong>Add</strong> to link it; press <strong>×</strong> on a card to unlink it.',
    gd_settings_title:'Settings', gd_settings_body:'Settings is where you customise the workspace — pipelines, custom fields, team members, and more. Open it from the gear icon at the bottom of the sidebar.', gd_contact_fields_title:'Adding Contact Fields',
    gd_contact_fields_body:'Go to the <strong>Contacts</strong> tab in Settings. Under <em>Custom Fields</em>, click <strong>+ Add</strong> to create a new field — text, number, date, dropdown, and more.', gd_deal_fields_title:'Adding Deal Fields', gd_deal_fields_body:'Go to the <strong>Deals</strong> tab in Settings. Under <em>Deal Fields</em>, click <strong>+ Add</strong> to attach extra properties to every deal — like deal type, priority, or close probability.',
    gd_done_title:'You\'re all set!', gd_done_body:'That covers the essentials. Explore at your own pace — and remember, you can reopen this guide any time by clicking the <strong>?</strong> button in the sidebar. Good luck!', gd_next:'Next',
    gd_finish:'Finish', imp_admin_no_invites:'No invite codes yet. Click + Generate to create one.', imp_admin_used:'Used · {name}',
    imp_admin_available:'Available', imp_admin_confirm_delete:'Delete this invite code?', imp_no_contacts_export:'No contacts to export.',
    imp_opt_no_pipelines:'— No pipelines available —', imp_opt_select_pipeline:'— Select a pipeline —', imp_opt_default_assignee:'— Use default or unassigned —',
    imp_opt_auto_stage:'— Auto (first stage) —', imp_err_csv_rows:'CSV must have a header row and at least one data row.', imp_rows_detected_one:'{n} row detected — match each column to a CRM field.',
    imp_rows_detected_many:'{n} rows detected — match each column to a CRM field.', imp_first_name:'First Name', imp_last_name:'Last Name',
    imp_name_required:'Name *', imp_opt_skip:'— Don\'t import —', imp_group_contact_fields:'Contact fields',
    imp_group_new_field:'New field', imp_opt_create_field:'Create as custom field…', imp_ph_field_name:'Field name',
    imp_err_map_split_name:'Please map at least "First Name" or "Last Name" when splitting names.', imp_err_map_name:'Please map a column to "Name" before importing.', imp_importing:'Importing…',
    imp_done_one:'Successfully imported {n} contact.', imp_done_many:'Successfully imported {n} contacts.', imp_deals_created_one:'Created {n} deal.',
    imp_deals_created_many:'Created {n} deals.', ws_loading:'Loading…', ws_load_error:'Could not load workspaces.',
    ws_active:'Active', ws_current:'Currently open', ws_switch:'Switch',
    ws_add_title:'Add a Workspace', ws_join_or_create:'Join or create', ws_get_started:'Get started',
    intg_step_paste_url:'Paste your Webhook URL (copy from the field at the top).', intg_make_step1:'Create a new Scenario in Make.com. Add a trigger — e.g. <strong>Facebook Lead Ads → Watch leads</strong> or <strong>New lead</strong>, or any other lead source.', intg_make_step2:'Add module: <strong>HTTP → Make a request</strong>. Authentication: <strong>No authentication</strong>. Method: <code>POST</code>.',
    intg_make_step4:'Body type: <code>Raw</code> · Content-Type: <code>application/json</code>.', intg_make_step5:'Paste the JSON body below into the Body field.', intg_make_step6:'For each value shown as <code>{{1.field_name}}</code> — click that value in Make and select the matching field from your trigger module (module 1). The <code>1</code> is the module number; the part after the dot is the field name from your trigger output.',
    intg_make_step7:'Save and activate.', intg_make_note:'Each value like <code>{{1.full_name}}</code> is a <strong>Make variable</strong>. In the HTTP Body field, click where the value is and use Make\'s variable picker to select the matching output from your trigger module instead of typing it manually.', intg_make_json_label:'JSON Body — paste into Make HTTP module',
    intg_zapier_step1:'Create a new Zap. Trigger: e.g. <strong>Facebook Lead Ads → New Lead</strong>, or any lead source.', intg_zapier_step2:'Add Action: <strong>Webhooks by Zapier → POST</strong>. Authentication: <strong>No authentication</strong>.', intg_zapier_step3:'Paste your Webhook URL (copy from the field at the top). Payload Type: <code>JSON</code>.',
    intg_zapier_step4:'In the <strong>Data</strong> section, add one row per field. The key on the left is fixed (e.g. <code>full_name</code>). For the value on the right, click the field and use Zapier\'s field picker to select the matching data from your trigger step.', intg_zapier_step5:'Test and publish.', intg_zapier_note:'The keys on the left (e.g. <code>full_name</code>) must match exactly. For the values — <strong>do not type them manually</strong>. In Zapier\'s data section, click the value field and pick the corresponding output from your trigger step using the dropdown.',
    intg_zapier_json_label:'Key/value pairs to add in Zapier', intg_n8n_step1:'Add your trigger node (e.g. a lead source), then an <strong>HTTP Request</strong> node.', intg_n8n_step2:'Method: <code>POST</code>. Authentication: <strong>No authentication</strong>.',
    intg_n8n_step4:'Body Content Type: <code>JSON</code>.', intg_n8n_step5:'Paste the JSON below. Each value like <code>{{ $json.field_name }}</code> is an n8n expression — it reads the field named <code>field_name</code> from your trigger node\'s output.', intg_n8n_step6:'To find the correct field name: run your trigger once, click the output of the trigger node, and check the JSON keys shown there. Use those exact key names inside <code>{{ $json.KEY_HERE }}</code>.',
    intg_n8n_step7:'Activate the workflow.', intg_n8n_note:'Each value like <code>{{ $json.full_name }}</code> pulls data from your trigger node. Replace <code>full_name</code> with the exact key name shown in your trigger node\'s output data. You can drag fields directly from the n8n data panel into the expression editor.', intg_n8n_json_label:'JSON Body — paste into HTTP Request node',
    intg_custom_step1:'Send a <code>POST</code> request to your Webhook URL below (copy it from the field at the top).', intg_custom_step2:'Authentication: <strong>No authentication</strong> required.', intg_custom_step3:'Set <code>Content-Type: application/json</code>.',
    intg_custom_step4:'Send the JSON body below. The keys are fixed — replace the example values with real data from your source.', intg_custom_step5:'A successful response returns <code>{"success": true, "contact_id": 42}</code>.', intg_custom_note:'The JSON keys (left side, e.g. <code>"full_name"</code>) must match exactly as shown. Replace only the values (right side) with actual data from your source system.',
    intg_custom_json_label:'JSON Body', intg_platform_custom:'Custom / API', intg_example_value:'example value',
    // Part 45 — German sweep: index-html
    html_alt_loading:'Loading…', html_alt_logo:'CRM Logo', html_admin_title:'Platform Admin',
    html_admin_sub:'Enter your admin secret to manage platform invite codes.', html_admin_secret:'Admin Secret', html_admin_access:'Access panel',
    html_back_to_app:'Back to app', html_admin_invites:'Platform Invites', html_admin_invites_hint:'One-time codes that allow someone to create a new workspace on signup.',
    html_admin_logout:'Log out of admin', html_nav_main:'Main', html_collapse_sidebar:'Collapse sidebar',
    html_click_change_tz:'Click to change timezone', html_search:'Search', html_help:'Help',
    html_mark_all_read:'Mark all read', html_clear:'Clear', html_more_actions:'More actions',
    html_pipeline_summary:'Pipeline summary', html_chat_ph:'Message your team...', html_send:'Send',
    html_send_message:'Send message', html_month:'Month', html_week:'Week',
    html_year:'Year', html_add_event:'Add event', html_add_column:'Add column',
    html_add_column_title:'Add a new property (column) to every listing', html_task_projects:'Task projects', html_time_range:'Time range',
    html_configure_metrics:'Configure Metrics', html_drag_section:'Drag to reorder section', html_trends:'Trends',
    html_visible_cards:'Visible Metric Cards', html_visible_cards_hint:'Toggle which cards appear in the overview row.', html_deal_value_field:'Deal Value Field',
    html_deal_value_field_hint:'Which field holds the deal price? Only numeric/currency fields appear here.', html_won_stages:'Won Stages', html_lost_stages:'Lost Stages',
    html_ph_suppliers:'Suppliers', html_ph_listings:'Listings', html_invite_role_aria:'Role for the new invite code',
    html_ws_sub:'Switch between your workspaces or create a new one.', html_new_workspace:'New Workspace', html_join_ws_title:'Join a Workspace',
    html_ws_invite_code:'Workspace Invite Code', html_ph_invite_code:'Paste invite code here', html_join_ws_btn:'Join Workspace',
    html_add_ws_title:'Add a Workspace', html_join_ws_sub:'Enter an invite code from a workspace owner or admin', html_create_ws:'Create a workspace',
    html_create_ws_sub:'Start fresh with a platform invite code', html_create_ws_title:'Create New Workspace', html_ws_name:'Workspace Name',
    html_ph_ws_name:'e.g. Acme Sales', html_platform_code:'Platform Invite Code', html_ph_platform_code:'Paste platform code here',
    html_platform_code_help:'Get a code from the admin panel (yoursite.com/?admin)', html_create_ws_btn:'Create Workspace', html_confirm_delete:'Confirm Delete',
    html_confirm_delete_hint:'To confirm, type the number of contacts you want to delete:', html_ph_eg_5:'e.g., 5', html_act_time_hint:'Leave the time empty for an all-day entry. A date puts it on the calendar.',
    html_ft_text:'Text', html_ft_email:'Email', html_ft_phone:'Phone',
    html_ft_number:'Number', html_ft_date:'Date', html_ft_dropdown:'Dropdown',
    html_ph_options:'Option A\nOption B\nOption C', html_add_status:'Add Status', html_add_task_field:'Add Task Field',
    html_new_project:'New Project', html_new_list:'New List', html_new_pipeline:'New Pipeline',
    html_add_deal_field:'Add Deal Field', html_objf_hint:'Each field becomes a column in the list and a property on every item.', html_import_title:'Import Contacts from CSV',
    html_import_drop:'Drag & drop a CSV here, or', html_import_browse:'browse', html_import_hint:'First row must be column headers',
    html_import_split_name:'Combine First Name + Last Name into Contact Name', html_import_create_deals:'Create deals during import', html_import_deals_new:'For new contacts',
    html_import_deals_updated:'For updated contacts (optional)', html_opt_select_pipeline:'— Select a pipeline —', html_import_stage:'Starting Stage (optional)',
    html_opt_auto_stage:'— Auto (first stage) —', html_import_assignee:'Assignee (optional)', html_opt_default_assignee:'— Use default or unassigned —',
    html_import_col_sample:'CSV column & sample', html_import_maps_to:'Maps to CRM field', html_import_run:'Import contacts',
    html_done_btn:'Done', html_skip_tour:'Skip tour', html_next:'Next',
    html_search_ph:'Search…', html_ft_url:'URL',
    // Part 45 — German sweep: objects-contacts
    obj_listings_fallback:'Listings', obj_listing_fallback:'Listing', obj_add_item:'Add {name}',
    obj_edit_item:'Edit {name}', obj_search_ph:'Search {name}…', obj_name_label:'{name} name',
    obj_no_matches:'No matches found', obj_nothing_matches:'Nothing matches “{q}”. Try a different search term.', obj_add_first:'Add your first {name} to keep everything in one place.',
    obj_clear_search:'Clear search', obj_add_column:'Add column', obj_n_of_total_shown:'{a} of {b} shown',
    obj_one_item:'1 item', obj_n_items:'{n} items', obj_no_extra_fields:'No extra fields set up yet — the name is all that is needed.',
    obj_delete_q:'Delete this {name}?', obj_delete_msg:'Links to deals and contacts are removed with it. This cannot be undone.', obj_details:'Details',
    obj_no_details:'No details recorded yet.', obj_contacts_and:'Contacts & {name}', obj_link_btn:'Link',
    obj_unlink_aria:'Unlink {name}', obj_no_people_linked:'No contacts or {name} linked.', obj_no_stage:'No stage',
    obj_no_deals_linked:'No deals linked.', obj_all_people_linked:'Everyone is already linked.', obj_all_deals_linked:'Every deal is already linked.',
    obj_linked:'Linked', obj_unlinked:'Unlinked', obj_field_hint:'Each field becomes a column in {name} and a property on every item.',
    obj_delete_column_confirm:'Delete this column? Values stored in it will no longer show on any item.', obj_board_empty_title:'No Miro board linked yet', obj_board_step1:'Open {path}.',
    obj_board_step2:'In Miro, choose {menu} and copy the link.', obj_board_step3:'Paste it there and save — this page will show it from then on.', obj_board_login_hint:'Seeing a login page or 403? Google blocks login inside iframes. Open Miro in a new tab, log in, then click Reload.',
    obj_board_reload:'Reload', obj_board_open_miro:'Open in Miro', obj_actions_aria:'Actions',
    obj_csv_date:'Date', obj_csv_text:'Text', ct_suppliers_fallback:'Suppliers',
    ct_showing_range:'Showing {s}–{e} of {n}', ct_pagination_aria:'Pagination', ct_prev_page:'Previous page',
    ct_next_page:'Next page', ct_bulk_delete_one:'You are about to delete 1 contact. This action cannot be undone.', ct_bulk_delete_n:'You are about to delete {n} contacts. This action cannot be undone.',
    ct_bulk_confirm_number:'Please enter the correct number ({n}) to confirm deletion.', ct_bulk_delete_error:'Error deleting contacts: {error}', md_opt_select:'— Select —',
    md_opt_no_deal:'— No deal —', md_delete_contact_q:'Delete this contact?', md_delete_contact_msg:'Their activities are deleted with them. This cannot be undone.',
    stg_rename_pipeline:'Rename Pipeline', stg_new_pipeline:'New Pipeline', stg_delete_pipeline_confirm:'Delete this pipeline and all its deals?',
    stg_stage_name_prompt:'Stage name:', stg_delete_stage_confirm:'Delete this stage? Deals in it will become unsorted.', stg_edit_deal_field:'Edit Deal Field',
    stg_add_deal_field:'Add Deal Field', stg_delete_field_confirm:'Delete this field?', stg_delete_field_values_confirm:'Delete this field? Saved values will be lost.',
    stg_n_opts:'{n} opts', stg_kanban_saved:'Kanban fields saved.', stg_someone:'someone',
    stg_copied_code:'Copied: {code}', stg_remove_member_confirm:'Remove {name} from this workspace? Their assigned contacts will become unassigned.', stg_delete_ws_confirm1:'Are you sure you want to delete this workspace? This action cannot be undone. All data will be permanently deleted.',
    stg_delete_ws_confirm2:'This will delete all contacts, deals, tasks, and messages. Confirm deletion?', stg_edit_status:'Edit Status', stg_add_status:'Add Status',
    stg_delete_status_confirm:'Delete this status? Tasks with this status will keep it but it won\'t appear in the kanban.', stg_edit_task_field:'Edit Task Field', stg_add_task_field:'Add Task Field',
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
    search_activities:'Aktivitäten durchsuchen', chip_type:'Typ', chip_person:'Person', chip_deal:'Deal', activities_logged:'{n} erfasst, {m} in den letzten 7 Tagen', no_activities_match:'Keine Aktivitäten passen zu deinen Filtern',
    delete_activity:'Aktivität löschen', activity_deleted:'Aktivität gelöscht', export_activities_csv:'{n} Aktivitäten exportiert',
    // Aktivitäten-Seite, vollständige Portierung (Erfassen-Karte, Zeitraum-Chip, Tagesgruppen, Seitenleiste, Menü)
    chip_period:'Zeitraum', period_all:'Gesamt', period_today:'Heute', period_7d:'Letzte 7 Tage', period_30d:'Letzte 30 Tage',
    act_verb_note:'Notiz hinzufügen', act_verb_call:'Anruf erfassen', act_verb_email:'E-Mail erfassen', act_verb_whatsapp:'Nachricht erfassen',
    act_ph_note:'Notiz schreiben', act_ph_call:'Was wurde im Gespräch besprochen?', act_ph_email:'E-Mail zusammenfassen oder die Kernpunkte einfügen', act_ph_whatsapp:'Nachrichtentext oder Zusammenfassung des Chats',
    act_err_text:'Füge eine kurze Beschreibung hinzu, bevor du speicherst.', act_err_link:'Verknüpfe einen Deal oder einen Kontakt, damit der Eintrag später auffindbar ist.', act_err_save:'Der Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.', act_logged:'{type} erfasst',
    act_compose_aria:'Neue Aktivität erfassen', opt_no_deal:'Kein Deal', opt_no_contact:'Kein Kontakt', one_activity:'1 Aktivität', n_activities:'{n} Aktivitäten',
    rail_aria:'Aufschlüsselung', rail_by_type:'Nach Typ', rail_by_person:'Nach Person', rail_top_deals:'Aktivste Deals', rail_no_deals:'Keine Deal-Aktivität in dieser Ansicht',
    no_activities_sub:'Erfasse einen Anruf, eine E-Mail oder eine Notiz, um den Feed zu starten.', no_activities_match_sub:'Versuche einen anderen Suchbegriff oder setze die Filter zurück.',
    delete_activity_q:'Diese Aktivität löschen?', delete_activity_msg:'Der Eintrag wird aus dem Feed und aus dem Verlauf des verknüpften Deals entfernt.', open_contact:'Kontakt öffnen', open_supplier:'{name} öffnen',
    today:'Heute', yesterday:'Gestern', ago_now:'Gerade eben', ago_h:'vor {n} Std.', ago_d:'vor {n} Tagen',
    // Aufgaben-Seite, Portierung des Referenz-Screens (Ansichten in der Seitenleiste, Übersicht, Chips, gruppierte Tabelle, Sammelaktionen, Board)
    tk_views:'Ansichten', tk_all:'Alle Aufgaben', tk_mine:'Meine Aufgaben', tk_projects:'Projekte', tk_new_project:'Neues Projekt', tk_edit_project:'Projekt bearbeiten', tk_add_list:'Liste hinzufügen', tk_new_list:'Neue Liste', tk_no_projects:'Noch keine Projekte.', tk_one_open:'1 offene Aufgabe', tk_open_n:'{n} offene Aufgaben', tk_overdue_n:'{n} überfällig',
    tk_collapse:'Einklappen', tk_expand:'Ausklappen', tk_actions_for:'Aktionen für {name}', tk_rename_project:'Projekt umbenennen', tk_delete_project:'Projekt löschen', tk_rename_list:'Liste umbenennen', tk_delete_list:'Liste löschen',
    tk_view:'Ansicht', tk_list:'Liste', tk_board:'Board', tk_add_task:'Aufgabe hinzufügen', tk_summary:'Aufgabenübersicht',
    tk_kpi_open:'Offene Aufgaben', tk_kpi_inprog:'{n} in Arbeit', tk_kpi_overdue:'Überfällig', tk_kpi_needs:'Braucht Aufmerksamkeit', tk_kpi_none_overdue:'Nichts überfällig', tk_kpi_week:'Fällig in 7 Tagen', tk_kpi_incl_today:'Einschließlich heute', tk_kpi_done:'Erledigt', tk_kpi_done_foot:'{p} % von {n}',
    tk_search:'Aufgaben durchsuchen', chip_assignee:'Zuständig', chip_priority:'Priorität', chip_status:'Status', chip_due:'Fällig', tk_not_done:'Nicht erledigt', tk_done:'Erledigt', tk_due_overdue:'Überfällig', tk_due_today:'Heute', tk_due_week:'Nächste 7 Tage', tk_due_none:'Ohne Fälligkeit',
    tk_sort:'Sortierung', tk_sort_due:'Fälligkeit', tk_sort_priority:'Priorität', tk_sort_title:'Titel', tk_sort_owner:'Zuständig',
    tk_col_task:'Aufgabe', tk_col_subtasks:'Teilaufgaben', tk_col_priority:'Priorität', tk_col_due:'Fällig', tk_col_assignee:'Zuständig', tk_select_all:'Alle sichtbaren Aufgaben auswählen', tk_select:'{name} auswählen', tk_complete:'Erledigen', tk_reopen:'Wieder öffnen', tk_subs_done:'{d} von {n} Teilaufgaben erledigt',
    tk_open_deal:'Deal öffnen', tk_open_contact:'Kontakt öffnen', tk_no_deal:'Kein Deal', tk_not_set:'Nicht gesetzt', tk_no_project:'Kein Projekt', tk_add_placeholder:'Aufgabe hinzufügen', tk_add_to:'Aufgabe hinzufügen zu {name}', tk_press_enter:'Enter drücken zum Hinzufügen',
    tk_n_of_total:'{n} von {total}', one_task:'1 Aufgabe', n_tasks:'{n} Aufgaben', one_list:'1 Liste', n_lists:'{n} Listen', tk_foot_open:'{open} offen, {late} überfällig', tk_no_match:'Keine Aufgaben passen zu deinen Filtern', tk_no_match_sub:'Entferne einen Filter oder ändere die Suche.',
    tk_bulk_aria:'Sammelaktionen', tk_bulk_status:'Status setzen', tk_bulk_priority:'Priorität setzen', tk_bulk_assign:'Zuweisen', tk_bulk_due:'Fälligkeit setzen', tk_clear_sel:'Auswahl aufheben', tk_due_tomorrow:'Morgen', tk_due_in7:'In 7 Tagen', tk_due_clear:'Fälligkeit entfernen',
    tk_moved_to:'{n} verschoben nach {s}', tk_prio_set:'Priorität von {n} auf {p} gesetzt', tk_assigned_to:'{n} zugewiesen an {m}', tk_due_cleared:'Fälligkeit entfernt bei {n}', tk_due_set:'Fälligkeit von {n} gesetzt auf {d}',
    tk_open_task:'Aufgabe öffnen', tk_mark_complete:'Als erledigt markieren', tk_reopen_task:'Aufgabe wieder öffnen', tk_move_to:'Status wechseln', tk_priority:'Priorität', tk_delete_task:'Aufgabe löschen', tk_delete_task_q:'Diese Aufgabe löschen?', tk_delete_tasks_q:'{n} Aufgaben löschen?', tk_delete_msg:'Die Aufgaben und ihre Teilaufgaben werden entfernt. Das lässt sich nicht rückgängig machen.',
    tk_deleted:'Aufgabe gelöscht', tk_deleted_n:'{n} Aufgaben gelöscht', tk_completed:'Aufgabe erledigt', tk_reopened:'Aufgabe wieder geöffnet', tk_moved:'Verschoben nach {s}', tk_prio_single:'Priorität auf {p} gesetzt', tk_added_to:'Aufgabe hinzugefügt zu {g}', tk_open:'Öffnen', tk_err_add:'Die Aufgabe konnte nicht hinzugefügt werden.',
    tk_col_nothing_overdue:'Nichts überfällig', tk_col_overdue:'{n} überfällig', tk_col_none:'Keine Aufgaben', tk_drop_here:'Aufgabe hier ablegen',
    tk_delete_project_q:'Dieses Projekt löschen?', tk_delete_project_msg:'„{name}“ mit {lists} und {tasks} wird entfernt.', tk_delete_list_q:'Diese Liste löschen?', tk_delete_list_msg:'„{name}“ und ihre {tasks} werden entfernt.', tk_project_deleted:'Projekt „{name}“ gelöscht', tk_list_deleted:'Liste „{name}“ gelöscht',
    tk_project_created:'Projekt „{name}“ erstellt', tk_project_updated:'Projekt aktualisiert', tk_list_created:'Liste „{name}“ erstellt', tk_list_renamed:'Liste umbenannt',
    prio_urgent:'Dringend', prio_high:'Hoch', prio_medium:'Mittel', prio_low:'Niedrig',
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
    lbl_stage:'Phase', lbl_assignee:'Zuständig', lbl_type:'Typ', lbl_contact:'Kontakt', lbl_deal:'Deal',
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
    engine_btn_retry:'Erneut senden', engine_retry_ok:'Zugestellt.', engine_retry_failed:'Weiterhin fehlgeschlagen: {error}', engine_next_attempt:'Nächster Versuch {when}',
    // Dokumente-Reiter in der Kontaktansicht (Verträge / Aufnahmen für die Upgrads Engine) — detail-views.js
    dv_tab_documents:'Dokumente', dv_doc_upload:'Dokument hochladen', dv_doc_uploading:'Wird hochgeladen…', dv_doc_download:'Herunterladen',
    dv_doc_type_aria:'Dokumenttyp', dv_doc_type_vertrag:'Vertrag', dv_doc_type_aufnahme:'Aufnahme', dv_doc_type_sonstiges:'Sonstiges',
    dv_no_docs:'Noch keine Dokumente', dv_docs_hint:'Verträge und Gesprächsaufnahmen für die Upgrads Engine liegen hier. Die Engine holt sie über ihre API ab.',
    dv_one_doc:'1 Dokument', n_docs:'{n} Dokumente', dv_doc_uploaded:'Dokument hochgeladen', dv_doc_too_large:'Datei zu groß (max. 10 MB)',
    dv_doc_delete_q:'Dokument löschen?', dv_doc_delete_msg:'Die Datei wird aus dem Speicher entfernt. Das kann nicht rückgängig gemacht werden.', dv_doc_deleted:'Dokument gelöscht',
    // API-Schlüssel-Karte (Zugangsdaten der Engine für /api/kunden)
    engine_keys_title:'API-Schlüssel', engine_keys_hint:'Die Engine liest und schreibt Kundendaten über /api/kunden mit einem dieser Schlüssel (Authorization: Bearer). Ein Schlüssel wird nur einmal angezeigt, direkt nach dem Erstellen.',
    engine_keys_new_label:'Neuer Schlüssel', engine_keys_new_hint:'Benenne ihn nach dem System, das ihn verwendet, z. B. „Engine Produktion“.', engine_keys_name_ph:'Engine Produktion',
    engine_keys_create:'Schlüssel erstellen', engine_keys_name_required:'Gib dem Schlüssel zuerst einen Namen.',
    engine_keys_reveal_label:'Dein neuer Schlüssel', engine_keys_reveal_hint:'Jetzt kopieren und dem Engine-Team geben. Er wird nicht noch einmal angezeigt.', engine_keys_hide:'Fertig',
    engine_keys_list_label:'Ausgestellte Schlüssel', engine_keys_none:'Noch keine Schlüssel.', engine_keys_col_name:'Name', engine_keys_col_key:'Schlüssel', engine_keys_col_created:'Erstellt', engine_keys_col_last_used:'Zuletzt verwendet', engine_keys_never:'nie',
    engine_keys_revoke:'Widerrufen', engine_keys_revoked:'Widerrufen', engine_keys_confirm_revoke:'Schlüssel „{name}“ widerrufen? Die Engine kann damit sofort nicht mehr arbeiten.', engine_keys_revoked_toast:'Schlüssel widerrufen.',
    engine_keys_openapi:'API-Beschreibung (OpenAPI 3.1) für das Engine-Team herunterladen',
    // Onboarding-Monitor (Upgrads Engine) — public/js/onboarding.js
    nav_onboarding:'Onboarding', onb_sub:'{running} im Onboarding · {done} abgeschlossen',
    onb_inactive_hint:'Die Upgrads-Engine-Integration ist ausgeschaltet. Deals werden angezeigt, aber nichts wird gesendet, bis sie auf der Seite Integrationen aktiviert wird.',
    onb_filter_aria:'Deals filtern', onb_filter_all:'Alle', onb_filter_not_started:'Nicht gestartet', onb_filter_running:'Im Onboarding', onb_filter_done:'Abgeschlossen',
    onb_col_deal:'Deal', onb_col_customer:'Kunde', onb_col_stage:'Phase', onb_col_status:'Engine-Status', onb_col_since:'Seit', onb_col_delivery:'Webhook', onb_col_drive:'Drive', onb_col_actions:'Aktion',
    onb_status_kein_onboarding:'Kein Onboarding', onb_status_formular_versendet:'Formular versendet', onb_status_formular_ausgefuellt:'Formular ausgefüllt', onb_status_termin_gebucht:'Termin gebucht',
    onb_status_call_erfolgt:'Call erfolgt', onb_status_briefing_fertig:'Briefing fertig', onb_status_onboarding_abgeschlossen:'Abgeschlossen',
    onb_stale:'{days}+ Tage unverändert', onb_delivery_none:'Nicht gesendet', onb_drive_link:'Drive-Ordner öffnen',
    onb_btn_start:'Onboarding starten', onb_no_contact:'Zuerst einen Kunden mit diesem Deal verknüpfen', onb_no_trigger_stage:'Für diese Pipeline ist keine Trigger-Phase konfiguriert (Integrationen → Upgrads Engine)',
    onb_confirm_title:'Onboarding starten?', onb_confirm_body:'„{deal}“ wird in die Phase „{stage}“ verschoben. Der Deal gilt dann als gewonnen und die Upgrads Engine wird benachrichtigt.',
    onb_started_toast:'Onboarding für „{deal}“ gestartet', onb_empty:'Noch keine Deals', onb_empty_filter:'Keine Deals für diesen Filter',
    onb_empty_hint:'Hier erscheint jeder Deal des Arbeitsbereichs mit dem Onboarding-Status seines Kunden.',
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
    set_timezone:'Zeitzone', hint_timezone:'Wird von der Uhr in der Seitenleiste, vom Kalender für das heutige Datum und für die Überfälligkeit von Aufgaben verwendet. Standard ist Berlin.',
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
    // Login-Seite (2026-10-06) — unpersönlich formuliert, damit sie neben den App-Texten besteht
    au_headline:'Vom ersten Lead bis zum unterschriebenen Vertrag – auf einem Board.',
    au_lede:'Upgrads CRM bündelt Pipeline, Kontakte, Aufgaben und Team-Chat in einem Arbeitsbereich. So sieht jeder im Team, was als Nächstes zählt.',
    au_pt_pipe_t:'Die Pipeline im Blick', au_pt_pipe_d:'Deals per Drag-and-drop durch die Phasen ziehen – mit Wert, Dringlichkeit und Forecast je Phase.',
    au_pt_contacts_t:'Kontakte mit Kontext', au_pt_contacts_d:'Notizen, Anrufe, E-Mails und WhatsApp: die ganze Historie eines Kontakts an einem Ort, nach Deal filterbar.',
    au_pt_team_t:'Ein Team, jede Zeitzone', au_pt_team_d:'Aufgaben, Kalender und Chat im selben Arbeitsbereich. Jeder Termin erscheint in der Ortszeit des Betrachters.',
    au_switch_q_signup:'Noch kein Konto?', tab_signup:'Konto erstellen', au_switch_q_login:'Bereits ein Konto?', tab_login:'Anmelden',
    au_title_login:'Willkommen zurück', au_sub_login:'Anmelden und direkt weiterarbeiten.',
    au_lbl_email:'E-Mail-Adresse', lbl_password:'Passwort', auth_forgot:'Passwort vergessen?', auth_show:'Passwort anzeigen', auth_hide:'Passwort verbergen',
    btn_login:'Anmelden', auth_logging_in:'Anmeldung läuft…',
    au_title_signup:'Konto erstellen', au_sub_signup:'Einen neuen Arbeitsbereich anlegen oder dem Team mit einem Einladungscode beitreten.',
    auth_mode_create:'Neuen Arbeitsbereich anlegen', auth_mode_join:'Bestehendem Arbeitsbereich beitreten',
    lbl_workspace_name:'Name des Arbeitsbereichs', ph_workspace_name:'z. B. Vertrieb Nord',
    auth_platform_code:'Plattform-Einladungscode', auth_platform_code_help:'Wird vom Plattform-Administrator vergeben und ist für einen neuen Arbeitsbereich erforderlich.', ph_platform_code:'Code einfügen',
    auth_ws_code:'Einladungscode des Arbeitsbereichs', ph_ws_code:'Code einfügen',
    lbl_your_name:'Vollständiger Name', auth_pw_min:'Mindestens 6 Zeichen.', btn_create_account:'Konto erstellen',
    au_title_forgot:'Passwort zurücksetzen', au_sub_forgot:'Der Link zum Zurücksetzen geht an die hinterlegte E-Mail-Adresse.',
    auth_copy_link:'Link zum Zurücksetzen:', btn_send_reset:'Link senden', auth_back_login:'Zurück zur Anmeldung',
    au_title_reset:'Neues Passwort festlegen', au_sub_reset:'Mindestens 6 Zeichen.', auth_new_password:'Neues Passwort', lbl_confirm_password:'Passwort bestätigen', btn_set_password:'Passwort speichern',
    au_title_picker:'Arbeitsbereich wählen', au_sub_picker:'Dieses Konto gehört zu mehreren Arbeitsbereichen. Welcher soll geöffnet werden?',
    au_title_join:'Arbeitsbereich beitreten', au_sub_join:'Den Einladungscode vom Inhaber oder Admin des Arbeitsbereichs eingeben.', btn_join_workspace:'Beitreten', btn_back:'Zurück',
    auth_pw_updated:'Passwort aktualisiert. Jetzt mit dem neuen Passwort anmelden.', auth_pw_mismatch:'Die Passwörter stimmen nicht überein.', auth_code_required:'Bitte den Einladungscode eingeben.',
    auth_err_invalid:'E-Mail-Adresse oder Passwort ist nicht korrekt.', auth_err_limit:'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.',
    auth_retry_in:'Erneut versuchen in %s s', auth_fails_hint:'Fünf Fehlversuche. Vielleicht hilft ein neues Passwort.', auth_fails_link:'Passwort zurücksetzen',
    // Part 45 — German sweep: analytics
    an_show_chart:'Diagramm anzeigen', an_show_table:'Datentabelle anzeigen', an_kpi_open_pipeline:'Offene Pipeline',
    an_kpi_won_value:'Gewonnener Wert', an_win_rate:'Abschlussquote', an_kpi_new_deals:'Neue Deals',
    an_kpi_avg_deal_size:'Ø Deal-Größe', an_kpi_total_contacts:'Kontakte gesamt', an_kpi_total_deals:'Deals gesamt',
    an_period_label:'Letzte {n} Monate ({from} bis {to})', an_prev_period:'Vorperiode', an_no_prior_period:'Keine Vorperiode',
    an_no_change_vs:'Keine Änderung ggü. {vs}', an_vs:'ggü. {vs}', an_snapshot:'Aktueller Stand',
    an_one_open_deal:'1 offener Deal', an_n_open_deals:'{n} offene Deals', an_closed_won:'Gewonnen abgeschlossen',
    an_won_lost:'{w} gewonnen, {l} verloren', an_set_won_lost:'Gewonnen- und Verloren-Phasen festlegen', an_not_configured:'Nicht konfiguriert',
    an_one_deal:'1 Deal', an_in_workspace:'In diesem Arbeitsbereich', an_new_this_month:'+{n} in diesem Monat',
    an_key_metrics_aria:'Kennzahlen', an_kpi_fill:'Änderungen vergleichen die letzten {n} Monate mit den {n} Monaten davor.', an_aria_nothing_decided:'noch nichts entschieden',
    an_aria_win_rate:'Abschlussquote {rate} %', an_rate_tip:'{rate} % gewonnen · {won} von {decided} entschieden · {created} erstellt', an_rate_chart_aria:'Abschlussquote pro Monat, Liniendiagramm',
    an_rate_empty_title:'Noch nichts entschieden', an_rate_empty_sub:'Ein Monat bekommt eine Abschlussquote, sobald seine Deals eine Gewonnen- oder Verloren-Phase erreichen. Lege unter „Kennzahlen konfigurieren“ fest, welche Phasen als gewonnen oder verloren zählen.', an_col_month:'Monat',
    an_col_decided:'Entschieden', an_nothing_decided:'Nichts entschieden', an_rate_title:'Abschlussquote pro Monat',
    an_rate_sub:'Deals nach Erstellungsmonat · Anteil der entschiedenen Deals, die gewonnen wurden · letzte {n} Monate', an_fn_row_title:'{name}: {reached} erreicht, {now} aktuell in dieser Phase, {value} in Phase', an_fn_conv:'{pct} % gehen weiter zu {next}',
    an_fn_lost_text:'{n} verloren · {pct} % aller Deals in diesem Zeitraum', an_col_reached:'Erreicht', an_col_conversion:'Konversion',
    an_col_in_stage_now:'Aktuell in Phase', an_value_in_stage:'Wert in Phase', an_funnel_title:'Pipeline-Funnel',
    an_funnel_sub:'Deals aus den letzten {n} Monaten, nach erreichter Phase', an_funnel_empty_title:'Keine Pipeline für den Funnel', an_funnel_empty_sub:'Lege eine Pipeline mit Phasen an, dann erscheint ihr Funnel hier.',
    an_owner_row_title:'{name}: {deals} Deals, {open} offen, {won} gewonnen, {lost} verloren', an_owner_empty_title:'Keine Deals in diesem Zeitraum', an_owner_empty_sub:'Hier zählen Deals aus den letzten {n} Monaten, je zuständiger Person.',
    an_open:'Offen', an_won:'Gewonnen', an_lost:'Verloren',
    an_owner_card_title:'Deals nach Zuständigkeit', an_owner_card_sub:'Erstellt in den letzten {n} Monaten', an_open_deal_aria:'Deal {title} öffnen',
    an_top_empty_title:'Keine offenen Deals', an_top_empty_sub:'Laufende Deals erscheinen hier, die größten zuerst.', an_top_title:'Größte offene Deals',
    an_top_sub:'Die größten laufenden Deals', an_view_all_deals:'Alle Deals anzeigen', an_showing_top:'Top {n} von {total} offenen Deals angezeigt',
    an_open_value:'Offener Wert', an_wl_empty_title:'Noch keine Deal-Ergebnisse', an_wl_empty_sub:'Lege unter „Kennzahlen konfigurieren“ fest, welche Phasen als gewonnen und verloren zählen, dann füllt sich das hier.',
    an_col_outcome:'Ergebnis', an_col_share:'Anteil', an_by_pipeline:'Nach Pipeline',
    an_wl_title:'Gewonnen und verloren', an_wl_sub:'Jeder Deal nach Ergebnis, Stand jetzt', an_trend_contacts:'Neue Kontakte',
    an_trend_deals:'Neue Deals', an_trend_value:'Deal-Wert', an_drag_reorder:'Zum Neuanordnen ziehen',
    an_view_line:'Linie', an_view_bar:'Balken', an_view_detail:'Detail',
    an_opt_none_value:'Keine — Wertkennzahlen ausblenden', an_opt_deal_value_builtin:'Deal-Wert (integriert)', an_err_stage_both:'Eine Phase kann nicht gleichzeitig Gewonnen und Verloren sein.',
    // Part 45 — German sweep: calendar-chat
    cal_all_day:'Ganztägig', cal_upcoming:'Anstehend', cal_next_7_days:'Heute und die nächsten 7 Tage',
    cal_nothing_scheduled:'Nichts geplant', cal_nothing_matches:'In den nächsten 7 Tagen passt nichts zu den Filtern.', cal_nothing_next_7:'In den nächsten 7 Tagen ist nichts geplant.',
    cal_add_event:'Termin hinzufügen', cal_prev_month:'Vorheriger Monat', cal_next_month:'Nächster Monat',
    cal_prev_week:'Vorherige Woche', cal_next_week:'Nächste Woche', cal_legend:'Legende',
    cal_show_day:'Ganzen Tag anzeigen', cal_add_on_day:'An diesem Tag hinzufügen', cal_add_on_date:'Hinzufügen am {date}',
    cal_n_more:'+{n} weitere', cal_week_range:'{from} bis {to} {year}', cal_events_in_one:'{n} Termin im {label}',
    cal_events_in_many:'{n} Termine im {label}', cal_events_week_one:'{n} Termin diese Woche', cal_events_week_many:'{n} Termine diese Woche',
    cal_gone:'Dieser Eintrag ist nicht mehr da.', cal_err_save:'Das wurde nicht gespeichert. Bitte erneut versuchen.', cal_past:'Vergangen',
    cal_when:'Wann', cal_added_by:'Hinzugefügt von', cal_unknown:'Unbekannt',
    cal_mark_done:'Als erledigt markieren', cal_no_details:'Keine Details.', cal_entered_as:'(eingegeben als {time} {tz})',
    cal_nothing_this_day:'An diesem Tag ist nichts geplant.', cal_not_done:'Noch nicht erledigt', chat_no_one_online:'Niemand online',
    chat_online:'Online:', chat_err_load:'Nachrichten konnten nicht geladen werden.', chat_empty:'Noch keine Nachrichten. Sag deinem Team Hallo!',
    chat_err_loading:'Fehler beim Laden der Nachrichten.', chat_loading:'Lädt…', chat_you:'Du',
    chat_ago_m:'vor {n} Min.', notif_by:'Von {name}', notif_caught_up:'Alles auf dem neuesten Stand!',
    notif_appear_here:'Benachrichtigungen erscheinen hier.',
    // Part 45 — German sweep: core
    core_network_error:'Netzwerkfehler', core_server_error:'Serverfehler ({status})', core_confirm:'Bestätigen',
    core_supplier:'Lieferant', core_search:'Suche', core_wa_default:'Hallo {{name}}, ',
    lbl_date:'Datum', lbl_time:'Uhrzeit',
    // Part 45 — German sweep: detail-views
    dv_supplier_one:'Lieferant', dv_object_one:'Objekt', dv_objects_many:'Objekte',
    dv_due_today:'Heute fällig', dv_due_today_at:'Heute fällig um {time}', dv_due_tomorrow:'Morgen fällig',
    dv_due_tomorrow_at:'Morgen fällig um {time}', dv_due_in_days:'In {n} Tagen', dv_due_in_days_at:'In {n} Tagen um {time}',
    dv_overdue_one:'1 Tag überfällig', dv_overdue_n:'{n} Tage überfällig', dv_deal_title_ph:'Zum Beispiel Mehrfamilienhaus Köln, Finanzierung',
    dv_contact_help:'Ermöglicht Anruf, E-Mail und WhatsApp.', dv_none:'Keiner', dv_supplier_help:'Notar, Gutachter oder Partner.',
    dv_edit_deal:'Deal bearbeiten', dv_new_deal:'Neuer Deal', dv_create_deal:'Deal erstellen',
    dv_err_deal_title:'Gib einen Deal-Titel ein.', dv_err_title_len:'Höchstens 140 Zeichen.', dv_err_value:'Gib eine Zahl ab 0 ein.',
    dv_err_value_min:'Mindestens 0.', dv_deal_updated:'Deal aktualisiert', dv_deal_created:'Deal erstellt',
    dv_deal_gone:'Dieser Deal existiert nicht mehr.', dv_edit_aria:'{what} bearbeiten', dv_no_contact_deal:'Kein Kontakt mit diesem Deal verknüpft',
    dv_edit_title_aria:'Titel bearbeiten: {title}', dv_created_ago:'Erstellt {when}', dv_more_actions:'Weitere Aktionen',
    dv_deal_stage_aria:'Deal-Phase', dv_current_stage:'Aktuelle Phase: {s}', dv_move_to_stage:'Nach {s} verschieben',
    dv_deal_value:'Deal-Wert', dv_change_stage:'Phase ändern', dv_stage_pos:'Phase {a} von {b}',
    dv_shown_on_board:'Auf dem Board sichtbar', dv_change_owner:'Zuständigkeit ändern', dv_last_activity:'Letzte Aktivität',
    dv_never:'Nie', dv_one_logged_activity:'1 erfasste Aktivität', dv_n_logged_activities:'{n} erfasste Aktivitäten',
    dv_tab_overview:'Übersicht', dv_tab_activity:'Aktivität', dv_deal_sections:'Deal-Bereiche',
    dv_next_tasks:'Nächste Aufgaben', dv_view_all:'Alle anzeigen', dv_no_open_tasks:'Keine offenen Aufgaben.',
    dv_latest_activity:'Neueste Aktivität', dv_no_activity_yet_dot:'Noch keine Aktivität.', dv_no_activity_yet:'Noch keine Aktivität',
    dv_log_activity:'Aktivität erfassen', dv_hint_no_contact_overview:'Mit diesem Deal ist kein Kontakt verknüpft. Verknüpfe einen über die Kontakt-Karte, um Anrufe, E-Mails und Nachrichten zu erfassen.', dv_hint_link_call:'Mit diesem Deal ist kein Kontakt verknüpft. Verknüpfe einen, um einen Anruf zu erfassen.',
    dv_hint_link_email:'Mit diesem Deal ist kein Kontakt verknüpft. Verknüpfe einen, um eine E-Mail zu erfassen.', dv_hint_link_whatsapp:'Mit diesem Deal ist kein Kontakt verknüpft. Verknüpfe einen, um eine Nachricht zu erfassen.', dv_open_dialer:'Anrufen',
    dv_to_whom:'An {who}', dv_open_mail:'E-Mail-Programm öffnen', dv_open_whatsapp:'WhatsApp öffnen',
    dv_logged_other_deal:'Bei einem anderen Deal dieses Kontakts erfasst', dv_other_deal:'Anderer Deal', dv_by_name:'von {name}',
    dv_activity_type:'Aktivitätstyp', dv_compose_text_lbl:'{type}-Text', dv_logged_as:'Erfasst als {user}.',
    dv_logged_as_on:'Erfasst als {user} bei {contact}.', dv_ctrl_enter:'Strg+Enter speichert.', dv_tlonly_on_title:'Zeigt Notizen zu diesem Deal und ungebundene Kontakt-Notizen. Klicken zeigt alle Notizen des Kontakts.',
    dv_tlonly_off_title:'Notizen zu diesem Deal plus Kontakt-Notizen ohne Deal-Bezug', dv_show_all_notes:'Alle Notizen anzeigen', dv_this_deal_only:'Nur dieser Deal',
    dv_one_entry:'1 Eintrag', dv_n_entries:'{n} Einträge', dv_no_entries_type:'Keine Einträge dieses Typs',
    dv_choose_type_or_clear:'Wähle einen anderen Typ oder setze den Filter zurück.', dv_log_to_start_deal:'Erfasse einen Anruf, eine E-Mail oder eine Notiz, um die Historie dieses Deals zu beginnen.', dv_link_contact_first:'Verknüpfe zuerst einen Kontakt mit diesem Deal.',
    dv_clear_filter:'Filter zurücksetzen', dv_new_task:'Neue Aufgabe', dv_task_title_ph:'Was ist zu tun?',
    dv_set_due:'Fälligkeit setzen', dv_due_date:'Fälligkeitsdatum', dv_time:'Uhrzeit',
    dv_n_open:'{n} offen', dv_n_done:'{n} erledigt', dv_tasks_linked_deal:'Mit diesem Deal verknüpfte Aufgaben',
    dv_no_tasks_deal:'Keine Aufgaben mit diesem Deal verknüpft', dv_no_tasks_deal_sub:'Lege eine Aufgabe an, um den nächsten Schritt festzuhalten, zum Beispiel einen Rückruf oder eine Unterlagenanfrage.', dv_details:'Details',
    dv_edit_all:'Alles bearbeiten', dv_change_x:'{x} ändern', dv_add_x:'{x} hinzufügen',
    dv_remove_x:'{x} entfernen', dv_x_set_to:'{x} auf {name} gesetzt', dv_x_removed:'{x} entfernt',
    dv_unlink_x:'Verknüpfung mit {name} lösen', dv_no_x_linked:'Kein {x} verknüpft', dv_no_xs_linked:'Keine {x} verknüpft',
    dv_link_object_sub:'Verknüpfe {many}, die zu diesem Deal gehören.', dv_add_objects_first:'Lege zuerst {many} auf der Seite „{page}“ an.', dv_no_contact_linked:'Kein Kontakt verknüpft',
    dv_link_contact_sub:'Verknüpfe einen Kontakt, um aus diesem Deal heraus anzurufen, zu mailen oder zu schreiben.', dv_add_contact:'Kontakt hinzufügen', dv_supplier_empty_sub:'Notar, Gutachter oder Finanzierungspartner für diesen Deal.',
    dv_deal_summary:'Deal-Übersicht', dv_title_updated:'Titel aktualisiert', dv_value_updated:'Wert aktualisiert',
    dv_urgency_updated:'Dringlichkeit aktualisiert', dv_moved_pipeline:'Nach {p} verschoben, Phase auf {s} zurückgesetzt', dv_none_stage:'keine',
    dv_x_updated:'{x} aktualisiert', dv_field:'Feld', dv_delete_entry_q:'Diesen Eintrag löschen?',
    dv_delete_entry_deal_msg:'Der Eintrag wird aus der Aktivitätshistorie dieses Deals entfernt.', dv_delete_entry_msg:'Der Eintrag wird aus der Aktivitätshistorie entfernt.', dv_entry_deleted:'Eintrag gelöscht',
    dv_delete_deal_msg:'Der Deal wird aus allen Pipelines entfernt. Verknüpfte Aktivitäten und Aufgaben bleiben im Arbeitsbereich.', dv_copy_suffix:'{title} (Kopie)', dv_deal_duplicated:'Deal dupliziert',
    dv_duplicate:'Duplizieren', dv_err_task_title:'Gib einen Aufgabentitel ein.', dv_task_added:'Aufgabe hinzugefügt',
    dv_owner_updated:'Zuständigkeit aktualisiert', dv_all_types:'Alle Typen', dv_x_linked:'{x} verknüpft',
    dv_x_unlinked:'Verknüpfung mit {x} gelöst', dv_contact_gone:'Dieser Kontakt existiert nicht mehr.', dv_email_x_aria:'E-Mail an {name}',
    dv_send_email:'E-Mail senden', dv_call_x_aria:'{name} anrufen', dv_logged_on_deal:'Bei diesem Deal erfasst',
    dv_mark_done:'{title} als erledigt markieren', dv_mark_not_done:'{title} als nicht erledigt markieren', dv_x_information:'{x}-Informationen',
    dv_click_value_hint:'Wert anklicken zum Bearbeiten, Enter speichert, Esc bricht ab', dv_no_activity_logged:'Noch keine Aktivität erfasst.', dv_log_first:'Erste Interaktion erfassen',
    dv_no_open_tasks_for:'Dieser {noun} hat keine offenen Aufgaben.', dv_activity_details:'Details zur Aktivität', dv_ph_note_about:'Notiz zu {name} schreiben…',
    dv_ph_discussed:'Was wurde besprochen oder vereinbart?', dv_activity_timeline:'Aktivitätsverlauf', dv_filter_activity:'Aktivitäten filtern',
    dv_filter_note:'Notizen', dv_filter_call:'Anrufe', dv_filter_email:'E-Mails',
    dv_filter_whatsapp:'WhatsApp-Nachrichten', dv_no_activity_type:'Keine Aktivität dieses Typs', dv_choose_type_above:'Wähle oben einen anderen Typ.',
    dv_log_to_start_contact:'Erfasse eine Notiz, einen Anruf oder eine E-Mail, um den Verlauf zu beginnen.', dv_one_deal:'1 Deal', dv_total_value:'Gesamtwert',
    dv_deals_linked_here:'Verknüpfte Deals erscheinen hier.', dv_no_tasks_yet:'Noch keine Aufgaben', dv_tasks_linked_here:'Verknüpfte Aufgaben erscheinen hier.',
    dv_one_deal_total:'1 Deal insgesamt', dv_n_deals_total:'{n} Deals insgesamt', dv_no_deals:'Keine Deals',
    dv_n_more:'+ {n} weitere', dv_last_contact_when:'Letzter Kontakt: {when}', dv_no_phone:'Keine Telefonnummer hinterlegt',
    dv_no_email:'Keine E-Mail-Adresse hinterlegt', dv_err_name:'Gib einen Namen ein.', dv_err_email:'Gib eine gültige E-Mail-Adresse ein.',
    dv_err_email_not_saved:'Nicht gespeichert. Gib eine gültige E-Mail-Adresse ein.', dv_copy_email:'E-Mail kopieren', dv_email_copied:'E-Mail kopiert',
    dv_copy_phone:'Telefonnummer kopieren', dv_phone_copied:'Telefonnummer kopiert', dv_delete_noun:'{noun} löschen',
    dv_delete_noun_q:'{noun} wirklich löschen?', dv_delete_contact_msg:'Die zugehörigen Aktivitäten werden mitgelöscht. Das kann nicht rückgängig gemacht werden.', dv_noun_deleted:'{noun} gelöscht',
    dv_description:'Beschreibung', dv_optional_details:'Optionale Details', dv_project:'Projekt',
    dv_list:'Liste', dv_set_due_time:'Fälligkeit mit Uhrzeit setzen', dv_due_hint:'Aus bedeutet keine Fälligkeit. An startet mit heute, in drei Stunden.',
    dv_time_hint:'Mit Uhrzeit erscheint sie im Stundenraster des Kalenders.', dv_create_task:'Aufgabe erstellen', dv_task_created:'Aufgabe erstellt',
    dv_task_gone:'Diese Aufgabe existiert nicht mehr.', dv_complete_task:'Aufgabe erledigen', dv_task_title_aria:'Aufgabentitel',
    dv_has_due:'Hat eine Fälligkeit', dv_add_description:'Beschreibung hinzufügen', dv_task_details:'Aufgabendetails',
    dv_err_title_empty:'Der Titel darf nicht leer sein. Der vorherige Titel wurde wiederhergestellt.', dv_title_saved:'Titel gespeichert', dv_entered_as:'(eingegeben als {time} {tz})',
    dv_due_set:'Fälligkeit gesetzt: {d}', dv_due_removed:'Fälligkeit entfernt', dv_status_updated:'Status aktualisiert',
    dv_priority_updated:'Priorität aktualisiert', dv_assignee_updated:'Zuständigkeit aktualisiert', dv_due_updated:'Fälligkeit aktualisiert',
    dv_time_updated:'Uhrzeit aktualisiert', dv_description_saved:'Beschreibung gespeichert', dv_list_updated:'Liste aktualisiert',
    dv_deal_link_updated:'Deal-Verknüpfung aktualisiert', dv_contact_updated:'Kontakt aktualisiert', dv_delete_task_msg:'Die Teilaufgaben werden mitgelöscht. Das kann nicht rückgängig gemacht werden.',
    dv_n_of_done:'{d} von {n} erledigt', dv_delete_subtask_aria:'Teilaufgabe {title} löschen', dv_no_subtasks:'Noch keine Teilaufgaben.',
    dv_add_subtask_ph:'Teilaufgabe hinzufügen', dv_new_subtask:'Neue Teilaufgabe', dv_subtask_deleted:'Teilaufgabe gelöscht',
    // Part 45 — German sweep: guide-import-auth
    gd_welcome_title:'Willkommen in deinem CRM!', gd_welcome_body:'Diese kurze Tour führt dich durch die wichtigsten Funktionen. Nutze die Pfeile, um zwischen den Schritten zu wechseln, oder überspringe sie jederzeit. Über den <strong>?</strong>-Button in der Seitenleiste kannst du sie neu starten.', gd_sidebar_title:'Navigation in der Seitenleiste',
    gd_sidebar_body:'Über die Seitenleiste bewegst du dich durch die App. <strong>Arbeitsbereich</strong> enthält deine Kerndaten — Deals, Kontakte, Lieferanten und Aufgaben. Unter <strong>Werkzeuge</strong> findest du Aktivitäten, Objekte, Board und Analysen.', gd_deals_title:'Deals', gd_deals_body:'Das ist deine Pipeline. Deals wandern mit ihrem Fortschritt durch die Phasen. Du kannst sie als Kanban-Board oder als Tabelle anzeigen.',
    gd_add_deal_title:'Einen Deal anlegen', gd_add_deal_body:'Klicke auf <strong>+ Deal hinzufügen</strong>, um einen neuen Deal anzulegen. Gib ihm einen Titel, ordne ihn einer Pipeline und Phase zu, setze einen Wert und weise ihn einem Teammitglied zu.', gd_contacts_title:'Kontakte',
    gd_contacts_body:'Kontakte sind die Personen und Unternehmen, mit denen du arbeitest. Jeder Kontakt kann mit Deals verknüpft werden, und zu jedem lassen sich Aktivitäten erfassen.', gd_add_contact_title:'Einen Kontakt anlegen', gd_add_contact_body:'Klicke auf <strong>+ Kontakt hinzufügen</strong>, um eine Person oder ein Unternehmen anzulegen. Du kannst eigene Felder wie Branche, Notizen oder beliebige andere Daten ergänzen, die für deinen Arbeitsablauf wichtig sind.',
    gd_link_contact_title:'Einen Kontakt mit einem Deal verknüpfen', gd_link_contact_body:'Beim Anlegen oder Bearbeiten eines Deals verknüpfst du über das Feld <strong>Kontakt</strong> einen Kontakt damit. Öffne einen Deal, klicke in das Kontakt-Suchfeld und wähle aus deiner Kontaktliste.', gd_listings_title:'Objekte',
    gd_listings_body:'Objekte sind zusätzliche Einträge — Immobilien, Produkte, Projekte oder alles, was du neben Deals und Kontakten im Blick behalten willst.', gd_link_listing_title:'Ein Objekt mit einem Deal verknüpfen', gd_link_listing_body:'In jedem Deal liegt der Bereich <strong>Objekte</strong> unter dem Kontakt-Panel. Wähle ein Objekt aus der Liste und klicke auf <strong>Hinzufügen</strong>, um es zu verknüpfen; mit <strong>×</strong> auf einer Karte löst du die Verknüpfung.',
    gd_settings_title:'Einstellungen', gd_settings_body:'In den Einstellungen passt du den Arbeitsbereich an — Pipelines, eigene Felder, Teammitglieder und mehr. Du öffnest sie über das Zahnrad-Symbol unten in der Seitenleiste.', gd_contact_fields_title:'Kontaktfelder hinzufügen',
    gd_contact_fields_body:'Öffne in den Einstellungen den Tab <strong>Kontakte</strong>. Unter <em>Benutzerdefinierte Felder</em> klickst du auf <strong>+ Hinzufügen</strong>, um ein neues Feld anzulegen — Text, Zahl, Datum, Auswahlliste und mehr.', gd_deal_fields_title:'Deal-Felder hinzufügen', gd_deal_fields_body:'Öffne in den Einstellungen den Tab <strong>Deals</strong>. Unter <em>Deal-Felder</em> klickst du auf <strong>+ Hinzufügen</strong>, um jedem Deal zusätzliche Eigenschaften zu geben — etwa Deal-Typ, Priorität oder Abschlusswahrscheinlichkeit.',
    gd_done_title:'Alles bereit!', gd_done_body:'Das waren die Grundlagen. Erkunde den Rest in deinem Tempo — und denk daran: Über den <strong>?</strong>-Button in der Seitenleiste kannst du diese Tour jederzeit neu öffnen. Viel Erfolg!', gd_next:'Weiter',
    gd_finish:'Fertig', imp_admin_no_invites:'Noch keine Einladungscodes. Klicke auf + Generieren, um einen zu erstellen.', imp_admin_used:'Verwendet · {name}',
    imp_admin_available:'Verfügbar', imp_admin_confirm_delete:'Diesen Einladungscode löschen?', imp_no_contacts_export:'Keine Kontakte zum Exportieren.',
    imp_opt_no_pipelines:'— Keine Pipelines verfügbar —', imp_opt_select_pipeline:'— Pipeline wählen —', imp_opt_default_assignee:'— Standard oder nicht zugewiesen —',
    imp_opt_auto_stage:'— Automatisch (erste Phase) —', imp_err_csv_rows:'Die CSV braucht eine Kopfzeile und mindestens eine Datenzeile.', imp_rows_detected_one:'{n} Zeile erkannt — ordne jede Spalte einem CRM-Feld zu.',
    imp_rows_detected_many:'{n} Zeilen erkannt — ordne jede Spalte einem CRM-Feld zu.', imp_first_name:'Vorname', imp_last_name:'Nachname',
    imp_name_required:'Name *', imp_opt_skip:'— Nicht importieren —', imp_group_contact_fields:'Kontaktfelder',
    imp_group_new_field:'Neues Feld', imp_opt_create_field:'Als eigenes Feld anlegen…', imp_ph_field_name:'Feldname',
    imp_err_map_split_name:'Beim Aufteilen des Namens muss mindestens „Vorname“ oder „Nachname“ zugeordnet sein.', imp_err_map_name:'Ordne vor dem Import eine Spalte dem Feld „Name“ zu.', imp_importing:'Wird importiert…',
    imp_done_one:'{n} Kontakt erfolgreich importiert.', imp_done_many:'{n} Kontakte erfolgreich importiert.', imp_deals_created_one:'{n} Deal angelegt.',
    imp_deals_created_many:'{n} Deals angelegt.', ws_loading:'Lädt…', ws_load_error:'Arbeitsbereiche konnten nicht geladen werden.',
    ws_active:'Aktiv', ws_current:'Gerade geöffnet', ws_switch:'Wechseln',
    ws_add_title:'Arbeitsbereich hinzufügen', ws_join_or_create:'Beitreten oder erstellen', ws_get_started:'Loslegen',
    intg_step_paste_url:'Füge deine Webhook-URL ein (aus dem Feld oben kopieren).', intg_make_step1:'Erstelle in Make.com ein neues Szenario. Füge einen Trigger hinzu — z. B. <strong>Facebook Lead Ads → Watch leads</strong> oder <strong>New lead</strong> oder eine beliebige andere Lead-Quelle.', intg_make_step2:'Füge das Modul <strong>HTTP → Make a request</strong> hinzu. Authentifizierung: <strong>No authentication</strong>. Methode: <code>POST</code>.',
    intg_make_step4:'Body type: <code>Raw</code> · Content-Type: <code>application/json</code>.', intg_make_step5:'Füge den JSON-Body unten in das Feld Body ein.', intg_make_step6:'Klicke für jeden Wert der Form <code>{{1.field_name}}</code> in Make auf diesen Wert und wähle das passende Feld aus deinem Trigger-Modul (Modul 1). Die <code>1</code> ist die Modulnummer; der Teil nach dem Punkt ist der Feldname aus der Ausgabe deines Triggers.',
    intg_make_step7:'Speichern und aktivieren.', intg_make_note:'Jeder Wert wie <code>{{1.full_name}}</code> ist eine <strong>Make-Variable</strong>. Klicke im Body-Feld des HTTP-Moduls auf die Stelle des Werts und wähle über die Variablenauswahl von Make die passende Ausgabe deines Trigger-Moduls, statt sie von Hand einzutippen.', intg_make_json_label:'JSON-Body — in das HTTP-Modul von Make einfügen',
    intg_zapier_step1:'Erstelle einen neuen Zap. Trigger: z. B. <strong>Facebook Lead Ads → New Lead</strong> oder eine beliebige Lead-Quelle.', intg_zapier_step2:'Füge eine Aktion hinzu: <strong>Webhooks by Zapier → POST</strong>. Authentifizierung: <strong>No authentication</strong>.', intg_zapier_step3:'Füge deine Webhook-URL ein (aus dem Feld oben kopieren). Payload Type: <code>JSON</code>.',
    intg_zapier_step4:'Lege im Abschnitt <strong>Data</strong> eine Zeile pro Feld an. Der Schlüssel links ist fest vorgegeben (z. B. <code>full_name</code>). Klicke für den Wert rechts in das Feld und wähle über die Feldauswahl von Zapier die passenden Daten aus deinem Trigger-Schritt.', intg_zapier_step5:'Testen und veröffentlichen.', intg_zapier_note:'Die Schlüssel links (z. B. <code>full_name</code>) müssen exakt übereinstimmen. Die Werte <strong>nicht von Hand eintippen</strong>: Klicke im Data-Abschnitt von Zapier in das Wertfeld und wähle über das Dropdown die passende Ausgabe deines Trigger-Schritts.',
    intg_zapier_json_label:'Schlüssel/Wert-Paare für Zapier', intg_n8n_step1:'Füge deinen Trigger-Node hinzu (z. B. eine Lead-Quelle) und danach einen <strong>HTTP Request</strong>-Node.', intg_n8n_step2:'Methode: <code>POST</code>. Authentifizierung: <strong>No authentication</strong>.',
    intg_n8n_step4:'Body Content Type: <code>JSON</code>.', intg_n8n_step5:'Füge das JSON unten ein. Jeder Wert wie <code>{{ $json.field_name }}</code> ist ein n8n-Ausdruck — er liest das Feld <code>field_name</code> aus der Ausgabe deines Trigger-Nodes.', intg_n8n_step6:'So findest du den richtigen Feldnamen: Führe deinen Trigger einmal aus, klicke auf die Ausgabe des Trigger-Nodes und sieh dir die dort angezeigten JSON-Schlüssel an. Verwende genau diese Schlüsselnamen in <code>{{ $json.KEY_HERE }}</code>.',
    intg_n8n_step7:'Aktiviere den Workflow.', intg_n8n_note:'Jeder Wert wie <code>{{ $json.full_name }}</code> holt Daten aus deinem Trigger-Node. Ersetze <code>full_name</code> durch den exakten Schlüsselnamen aus der Ausgabe deines Trigger-Nodes. Du kannst Felder direkt aus dem Datenbereich von n8n in den Ausdruckseditor ziehen.', intg_n8n_json_label:'JSON-Body — in den HTTP Request-Node einfügen',
    intg_custom_step1:'Sende eine <code>POST</code>-Anfrage an deine Webhook-URL unten (aus dem Feld oben kopieren).', intg_custom_step2:'Es ist <strong>keine Authentifizierung</strong> erforderlich.', intg_custom_step3:'Setze <code>Content-Type: application/json</code>.',
    intg_custom_step4:'Sende den JSON-Body unten. Die Schlüssel sind fest vorgegeben — ersetze die Beispielwerte durch echte Daten aus deiner Quelle.', intg_custom_step5:'Bei Erfolg lautet die Antwort <code>{"success": true, "contact_id": 42}</code>.', intg_custom_note:'Die JSON-Schlüssel (links, z. B. <code>"full_name"</code>) müssen exakt wie gezeigt übereinstimmen. Ersetze nur die Werte (rechts) durch echte Daten aus deinem Quellsystem.',
    intg_custom_json_label:'JSON-Body', intg_platform_custom:'Eigene Anbindung / API', intg_example_value:'Beispielwert',
    // Part 45 — German sweep: index-html
    html_alt_loading:'Lädt…', html_alt_logo:'CRM-Logo', html_admin_title:'Plattform-Admin',
    html_admin_sub:'Gib dein Admin-Secret ein, um Plattform-Einladungscodes zu verwalten.', html_admin_secret:'Admin-Secret', html_admin_access:'Panel öffnen',
    html_back_to_app:'Zurück zur App', html_admin_invites:'Plattform-Einladungen', html_admin_invites_hint:'Einmalcodes, mit denen jemand bei der Registrierung einen neuen Arbeitsbereich anlegen kann.',
    html_admin_logout:'Vom Admin-Bereich abmelden', html_nav_main:'Hauptnavigation', html_collapse_sidebar:'Seitenleiste einklappen',
    html_click_change_tz:'Klicken, um die Zeitzone zu ändern', html_search:'Suchen', html_help:'Hilfe',
    html_mark_all_read:'Alle als gelesen markieren', html_clear:'Leeren', html_more_actions:'Weitere Aktionen',
    html_pipeline_summary:'Pipeline-Übersicht', html_chat_ph:'Nachricht an dein Team…', html_send:'Senden',
    html_send_message:'Nachricht senden', html_month:'Monat', html_week:'Woche',
    html_year:'Jahr', html_add_event:'Termin hinzufügen', html_add_column:'Spalte hinzufügen',
    html_add_column_title:'Neue Eigenschaft (Spalte) für jedes Objekt hinzufügen', html_task_projects:'Aufgabenprojekte', html_time_range:'Zeitraum',
    html_configure_metrics:'Kennzahlen konfigurieren', html_drag_section:'Ziehen, um den Abschnitt zu verschieben', html_trends:'Trends',
    html_visible_cards:'Sichtbare Kennzahlen-Karten', html_visible_cards_hint:'Wähle, welche Karten in der Übersichtszeile erscheinen.', html_deal_value_field:'Feld für den Deal-Wert',
    html_deal_value_field_hint:'Welches Feld enthält den Deal-Preis? Nur Zahlen- und Währungsfelder erscheinen hier.', html_won_stages:'Gewonnen-Phasen', html_lost_stages:'Verloren-Phasen',
    html_ph_suppliers:'Lieferanten', html_ph_listings:'Objekte', html_invite_role_aria:'Rolle für den neuen Einladungscode',
    html_ws_sub:'Wechsle zwischen deinen Arbeitsbereichen oder lege einen neuen an.', html_new_workspace:'Neuer Arbeitsbereich', html_join_ws_title:'Arbeitsbereich beitreten',
    html_ws_invite_code:'Einladungscode des Arbeitsbereichs', html_ph_invite_code:'Einladungscode hier einfügen', html_join_ws_btn:'Arbeitsbereich beitreten',
    html_add_ws_title:'Arbeitsbereich hinzufügen', html_join_ws_sub:'Einladungscode vom Inhaber oder Admin eines Arbeitsbereichs eingeben', html_create_ws:'Arbeitsbereich anlegen',
    html_create_ws_sub:'Neu starten mit einem Plattform-Einladungscode', html_create_ws_title:'Neuen Arbeitsbereich anlegen', html_ws_name:'Name des Arbeitsbereichs',
    html_ph_ws_name:'z. B. Acme Vertrieb', html_platform_code:'Plattform-Einladungscode', html_ph_platform_code:'Plattform-Code hier einfügen',
    html_platform_code_help:'Einen Code gibt es im Admin-Panel (yoursite.com/?admin)', html_create_ws_btn:'Arbeitsbereich anlegen', html_confirm_delete:'Löschen bestätigen',
    html_confirm_delete_hint:'Gib zur Bestätigung die Anzahl der Kontakte ein, die du löschen möchtest:', html_ph_eg_5:'z. B. 5', html_act_time_hint:'Ohne Uhrzeit wird ein ganztägiger Eintrag angelegt. Mit Datum erscheint er im Kalender.',
    html_ft_text:'Text', html_ft_email:'E-Mail', html_ft_phone:'Telefon',
    html_ft_number:'Zahl', html_ft_date:'Datum', html_ft_dropdown:'Auswahlliste',
    html_ph_options:'Option A\nOption B\nOption C', html_add_status:'Status hinzufügen', html_add_task_field:'Aufgabenfeld hinzufügen',
    html_new_project:'Neues Projekt', html_new_list:'Neue Liste', html_new_pipeline:'Neue Pipeline',
    html_add_deal_field:'Deal-Feld hinzufügen', html_objf_hint:'Jedes Feld wird zu einer Spalte in der Liste und zu einer Eigenschaft jedes Eintrags.', html_import_title:'Kontakte aus CSV importieren',
    html_import_drop:'CSV hierher ziehen oder', html_import_browse:'Datei wählen', html_import_hint:'Die erste Zeile muss die Spaltenüberschriften enthalten',
    html_import_split_name:'Vorname + Nachname zum Kontaktnamen zusammenführen', html_import_create_deals:'Deals beim Import anlegen', html_import_deals_new:'Für neue Kontakte',
    html_import_deals_updated:'Für aktualisierte Kontakte (optional)', html_opt_select_pipeline:'— Pipeline wählen —', html_import_stage:'Startphase (optional)',
    html_opt_auto_stage:'— Automatisch (erste Phase) —', html_import_assignee:'Zuständig (optional)', html_opt_default_assignee:'— Standard oder nicht zugewiesen —',
    html_import_col_sample:'CSV-Spalte & Beispiel', html_import_maps_to:'Zugeordnetes CRM-Feld', html_import_run:'Kontakte importieren',
    html_done_btn:'Fertig', html_skip_tour:'Tour überspringen', html_next:'Weiter',
    html_search_ph:'Suchen…', html_ft_url:'URL',
    // Part 45 — German sweep: objects-contacts
    obj_listings_fallback:'Objekte', obj_listing_fallback:'Objekt', obj_add_item:'{name} hinzufügen',
    obj_edit_item:'{name} bearbeiten', obj_search_ph:'{name} durchsuchen…', obj_name_label:'Name ({name})',
    obj_no_matches:'Keine Treffer', obj_nothing_matches:'Nichts passt zu „{q}“. Versuche einen anderen Suchbegriff.', obj_add_first:'Lege die ersten {name} an, um alles an einem Ort zu haben.',
    obj_clear_search:'Suche zurücksetzen', obj_add_column:'Spalte hinzufügen', obj_n_of_total_shown:'{a} von {b} angezeigt',
    obj_one_item:'1 Eintrag', obj_n_items:'{n} Einträge', obj_no_extra_fields:'Noch keine zusätzlichen Felder eingerichtet – der Name genügt.',
    obj_delete_q:'{name} löschen?', obj_delete_msg:'Verknüpfungen zu Deals und Kontakten werden mit entfernt. Das lässt sich nicht rückgängig machen.', obj_details:'Details',
    obj_no_details:'Noch keine Details erfasst.', obj_contacts_and:'Kontakte & {name}', obj_link_btn:'Verknüpfen',
    obj_unlink_aria:'Verknüpfung zu {name} lösen', obj_no_people_linked:'Keine Kontakte oder {name} verknüpft.', obj_no_stage:'Keine Phase',
    obj_no_deals_linked:'Keine Deals verknüpft.', obj_all_people_linked:'Alle sind bereits verknüpft.', obj_all_deals_linked:'Alle Deals sind bereits verknüpft.',
    obj_linked:'Verknüpft', obj_unlinked:'Verknüpfung gelöst', obj_field_hint:'Jedes Feld wird zu einer Spalte in {name} und zu einer Eigenschaft jedes Eintrags.',
    obj_delete_column_confirm:'Diese Spalte löschen? Darin gespeicherte Werte werden bei keinem Eintrag mehr angezeigt.', obj_board_empty_title:'Noch kein Miro-Board verknüpft', obj_board_step1:'Öffne {path}.',
    obj_board_step2:'Wähle in Miro {menu} und kopiere den Link.', obj_board_step3:'Füge ihn dort ein und speichere – ab dann zeigt diese Seite das Board.', obj_board_login_hint:'Login-Seite oder 403? Google blockiert die Anmeldung in iframes. Öffne Miro in einem neuen Tab, melde dich an und klicke dann auf „Neu laden“.',
    obj_board_reload:'Neu laden', obj_board_open_miro:'In Miro öffnen', obj_actions_aria:'Aktionen',
    obj_csv_date:'Datum', obj_csv_text:'Text', ct_suppliers_fallback:'Lieferanten',
    ct_showing_range:'{s}–{e} von {n} angezeigt', ct_pagination_aria:'Seitennavigation', ct_prev_page:'Vorherige Seite',
    ct_next_page:'Nächste Seite', ct_bulk_delete_one:'Du bist dabei, 1 Kontakt zu löschen. Das lässt sich nicht rückgängig machen.', ct_bulk_delete_n:'Du bist dabei, {n} Kontakte zu löschen. Das lässt sich nicht rückgängig machen.',
    ct_bulk_confirm_number:'Bitte gib zur Bestätigung die richtige Zahl ({n}) ein.', ct_bulk_delete_error:'Fehler beim Löschen der Kontakte: {error}', md_opt_select:'— Auswählen —',
    md_opt_no_deal:'— Kein Deal —', md_delete_contact_q:'Diesen Kontakt löschen?', md_delete_contact_msg:'Ihre Aktivitäten werden mit gelöscht. Das lässt sich nicht rückgängig machen.',
    stg_rename_pipeline:'Pipeline umbenennen', stg_new_pipeline:'Neue Pipeline', stg_delete_pipeline_confirm:'Diese Pipeline und alle ihre Deals löschen?',
    stg_stage_name_prompt:'Name der Phase:', stg_delete_stage_confirm:'Diese Phase löschen? Deals darin verlieren ihre Phase.', stg_edit_deal_field:'Deal-Feld bearbeiten',
    stg_add_deal_field:'Deal-Feld hinzufügen', stg_delete_field_confirm:'Dieses Feld löschen?', stg_delete_field_values_confirm:'Dieses Feld löschen? Gespeicherte Werte gehen verloren.',
    stg_n_opts:'{n} Optionen', stg_kanban_saved:'Kanban-Felder gespeichert.', stg_someone:'jemandem',
    stg_copied_code:'Kopiert: {code}', stg_remove_member_confirm:'{name} aus diesem Arbeitsbereich entfernen? Zugewiesene Kontakte sind danach nicht mehr zugewiesen.', stg_delete_ws_confirm1:'Diesen Arbeitsbereich wirklich löschen? Das lässt sich nicht rückgängig machen. Alle Daten werden dauerhaft gelöscht.',
    stg_delete_ws_confirm2:'Alle Kontakte, Deals, Aufgaben und Nachrichten werden gelöscht. Löschen bestätigen?', stg_edit_status:'Status bearbeiten', stg_add_status:'Status hinzufügen',
    stg_delete_status_confirm:'Diesen Status löschen? Aufgaben behalten ihn, aber er erscheint nicht mehr im Kanban.', stg_edit_task_field:'Aufgabenfeld bearbeiten', stg_add_task_field:'Aufgabenfeld hinzufügen',
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
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => { el.alt = t(el.dataset.i18nAlt); });
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const lbl = document.getElementById('dark-toggle-label');
  if (lbl) lbl.textContent = t(dark ? 'light_mode' : 'dark_mode');
  document.querySelectorAll('input[name="language"]').forEach(r => { r.checked = r.value === currentLang; });
  document.querySelectorAll('.au-lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === currentLang)));   // the login page's DE | EN switch
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');   // re-names the login page's theme switch
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
  // Part 45: these pages render their labels at run time too, so they re-render on a switch as well
  if (page === 'tasks')        renderTasksCurrent();
  if (page === 'calendar')     renderCalendar();
  if (page === 'analytics')    loadAnalytics();
  if (page === 'chat')         loadChatPage();
  if (page === 'workspaces')   loadWorkspacesPage();
  // the sidebar's supplier label and the Contacts page header carry workspace words with dictionary fallbacks
  if (typeof updateSuppliersNav === 'function') updateSuppliersNav();
  if (page === 'contacts' && typeof updateContactsPageHeader === 'function') updateContactsPageHeader();
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
  const tpl = (currentWorkspace?.whatsapp_template || t('core_wa_default'))
    .replace(/\{\{name\}\}/g,    name)
    .replace(/\{\{company\}\}/g, company);
  return `https://wa.me/${digits}?text=${encodeURIComponent(tpl)}`;
}

const BUILTIN_FIELDS = [
  // `label` is a getter so the list follows the language at the moment it is read.
  { key: 'company',  get label() { return t('col_company'); },  type: 'text' },
  { key: 'email',    get label() { return t('col_email'); },    type: 'email' },
  { key: 'phone',    get label() { return t('col_phone'); },    type: 'phone' },
  { key: 'assignee', get label() { return t('lbl_assignee'); }, type: 'text' },
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
  return new Date(dt).toLocaleDateString(currentLang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const door = document.getElementById('au-theme');            // the login page's sun / moon switch
  if (door) {
    door.setAttribute('aria-pressed', String(dark));
    const name = t(dark ? 'light_mode' : 'dark_mode');
    door.setAttribute('aria-label', name); door.title = name;
    document.getElementById('au-theme-ic')?.setAttribute('href', dark ? '#i-sun' : '#i-moon');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1424' : '#18345D');
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

// Two tiers. The top bar runs for every request and finishes the moment the
// request does — no minimum display time, so a millisecond request costs no
// visible wait. The blocking overlay only appears when a request has been in
// flight for OVERLAY_DELAY (2 s): fast navigation never shows it.
const loader = (() => {
  let count = 0, fillTimer = null, hideTimer = null, overlayTimer = null;
  const bar     = () => document.getElementById('loading-bar');
  const fill    = () => document.getElementById('loading-bar-fill');
  const overlay = () => document.getElementById('loading-overlay');
  const OVERLAY_DELAY = 2000;
  const clearFill = () => { (fillTimer || []).forEach(clearTimeout); fillTimer = null; };

  function start() {
    count++;
    clearTimeout(hideTimer);
    const b = bar(), f = fill();
    if (b && f) {
      b.classList.add('active');
      let pct = parseFloat(f.style.width) || 0;
      if (pct >= 80) pct = 30;
      f.style.width = pct + '%';
      clearFill();
      fillTimer = [
        setTimeout(() => { if (fill()) fill().style.width = '70%'; }, 50),
        setTimeout(() => { if (fill()) fill().style.width = '82%'; }, 400),
      ];
    }
    if (!overlayTimer) overlayTimer = setTimeout(() => { overlayTimer = null; if (count > 0) overlay()?.classList.remove('hidden'); }, OVERLAY_DELAY);
  }

  function done() {
    count = Math.max(0, count - 1);
    if (count > 0) return;
    clearTimeout(overlayTimer); overlayTimer = null;
    clearFill();
    overlay()?.classList.add('hidden');
    const f = fill();
    if (f) f.style.width = '100%';

    hideTimer = setTimeout(() => {
      const b = bar(), f2 = fill();
      if (b) b.classList.remove('active');
      setTimeout(() => { if (f2) f2.style.width = '0%'; }, 160);
    }, 200);
  }

  return { start, done };
})();

async function apiFetch(url, opts = {}) {
  loader.start();
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { return { error: tf('core_server_error', { status: r.status }) }; }
  } finally {
    loader.done();
  }
}

async function apiFetchSilent(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { return { error: tf('core_server_error', { status: r.status }) }; }
  } catch { return { error: t('core_network_error') }; }
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
    ? `<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="${id}" ${width ? `style="width:min(${width}px,100%)"` : ''}><div class="modal-head"><h2 class="modal-title" id="${id}">${esc(title)}</h2><button class="iconbtn" data-close aria-label="${esc(t('btn_close'))}">${icon('x')}</button></div><div class="modal-body" style="flex:1 1 auto"></div>${footer ? '<div class="modal-foot" style="border-radius:0"></div>' : ''}</aside>`
    : `<div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}"><div class="modal-head"><h2 class="modal-title" id="${id}">${esc(title)}</h2><button class="iconbtn" data-close aria-label="${esc(t('btn_close'))}">${icon('x')}</button></div><div class="modal-body"></div>${footer ? '<div class="modal-foot"></div>' : ''}</div>`;
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
ui.confirm = ({ title, message, confirmLabel = t('core_confirm'), cancelLabel = t('btn_cancel'), danger = false }) => new Promise(resolve => {
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
  const supplierLabel = (currentWorkspace?.supplier_name || t('core_supplier')).replace(/s$/i, '');
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
  m.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="${esc(t('core_search'))}"><div class="palette-input">${icon('search')}<input id="pal-q" placeholder="${esc(t('topbar_search'))}" autocomplete="off" aria-label="${esc(t('core_search'))}"></div><div class="palette-list" role="listbox"></div><div class="palette-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> ${esc(t('kbd_to_move'))}</span><span><span class="kbd">Enter</span> ${esc(t('kbd_to_open'))}</span><span><span class="kbd">Esc</span> ${esc(t('kbd_to_close'))}</span></div></div>`;
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
