/**
 * Facts about the schema that more than one test asserts on. One place, so a
 * change to the CHECK constraint or a new engine table is updated once.
 */
const ONBOARDING_STATUSES = [
  'kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht',
  'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen',
];

// Stage 1 added these to contacts (German names — the users are German).
const CONTACT_ONBOARDING_COLUMNS = [
  'onboarding_status', 'drive_ordner_id', 'akte_version',
  'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'strasse', 'plz', 'ort',
];

// Stage 1 added these tables.
const ENGINE_TABLES = ['api_keys', 'engine_webhook', 'engine_webhook_deliveries', 'idempotency_keys'];

// Every table the schema created before Stage 1 — the "nothing removed" guard.
const PRE_STAGE1_TABLES = [
  'workspaces', 'users', 'invite_codes', 'stages', 'custom_fields', 'contacts', 'pipelines', 'pipeline_stages',
  'deal_fields', 'deals', 'activities', 'password_resets', 'platform_invites', 'platform_settings', 'notifications',
  'task_fields', 'objects', 'object_contacts', 'object_fields', 'deal_objects', 'tasks', 'task_projects', 'task_lists',
  'task_project_statuses', 'task_attachments', 'workspace_webhook', 'webhook_logs', 'user_workspaces',
  'chat_messages', 'chat_reads', 'activity_comments',
];

const ENGINE_INDEXES = [
  'idx_contacts_onboarding_status', 'idx_engine_webhook_deliveries_retry',
  'idx_engine_webhook_deliveries_ws', 'idx_idempotency_keys_expires',
];

// Part 45: files of the contact's Drive folder + the sync stamps on contacts.
const DRIVE_FILES_TABLE     = 'contact_drive_files';
const CONTACT_DRIVE_COLUMNS = ['drive_synced_at', 'drive_sync_error', 'drive_file_count'];

module.exports = { ONBOARDING_STATUSES, CONTACT_ONBOARDING_COLUMNS, ENGINE_TABLES, PRE_STAGE1_TABLES, ENGINE_INDEXES, DRIVE_FILES_TABLE, CONTACT_DRIVE_COLUMNS };
