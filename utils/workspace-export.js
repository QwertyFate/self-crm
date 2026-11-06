/* ═══════════════════════════════════════════════════════════════════════════
   WORKSPACE EXPORT — one workspace, whole, as a bundle another install can
   import: the local CRM on branch v2.2.1local. Served by
   GET /api/admin/workspaces/:id/export (routes/admin-transfer.js).

   A COPY. Nothing here writes. Every table is read inside one READ ONLY,
   REPEATABLE READ transaction, so the bundle is a single snapshot — a deal
   saved halfway through the export is either fully in it or not at all.

   THE BUNDLE  a .tar.gz (utils/tar.js) holding
     workspace.json   { format, version, exported_at, workspace_id,
                        workspace_name, counts, tables }
                      tables is { <table>: [row, …] } with the ORIGINAL ids;
                      the importer gives every row a new id and maps the
                      references (deal → contact, task → parent, …) itself.
     files/…          Part 2: the bytes of contact documents and task
                      attachments. Not in the bundle yet.

   EACH ROW IS to_jsonb(t) — Postgres renders the row, not node-pg. A DATE
   stays "2026-11-05" (node-pg makes it a local-midnight Date, and JSON would
   then shift it a day in Berlin), a TIME stays "14:30:00", and every column
   the table has travels, including ones added after this file was written.
   The importer keeps the columns its own schema knows and drops the rest.

   WHAT IS IN IT  the workspace row (its name and every setting), its people
   (users rows WITH password_hash, and user_workspaces with each role — so the
   owner stays owner and everyone keeps their password), custom fields of all
   four kinds, pipelines + stages, contacts, deals, listings and their links,
   activities + comments, task projects / statuses / lists / tasks, and the
   rows of task_attachments and contact_documents.

   ⚠ password_hash is in the file. Treat a bundle like a password.

   NOT IN IT, ON PURPOSE
     secrets bound to this install   workspace_webhook (the key is in its URL),
                                     workspace_calcom, workspace_engine,
                                     api_keys (and workspace_notetaker_ai on
                                     v2.3.3beta)
     history about the workspace     webhook_logs, engine_deliveries,
                                     engine_api_requests, idempotency_keys,
                                     notetaker_recordings, notifications
     the team's chatter              chat_messages, chat_reads, break_scores
     access                          invite_codes, password_resets
     dead                            stages (contact stages, removed in Part 19)
   ═══════════════════════════════════════════════════════════════════════════ */

const FORMAT  = 'upgrads-workspace';
const VERSION = 1;

const byWorkspace = table => `SELECT to_jsonb(t) AS r FROM ${table} t WHERE t.workspace_id = $1 ORDER BY t.id`;

// [table, statement] in the order an importer can insert them: every row's references point
// to a table above it (tasks.parent_id and activity_comments.parent_id point into their own).
const TABLES = [
  ['workspaces',            'SELECT to_jsonb(t) AS r FROM workspaces t WHERE t.id = $1'],
  // A member's users row carries this workspace's id; the OR also takes a membership whose row
  // lives elsewhere, should one exist, so no member can go missing from the bundle.
  ['users',                 `SELECT to_jsonb(t) AS r FROM users t
                             WHERE t.workspace_id = $1
                                OR t.id IN (SELECT user_id FROM user_workspaces WHERE workspace_id = $1)
                             ORDER BY t.id`],
  ['user_workspaces',       'SELECT to_jsonb(t) AS r FROM user_workspaces t WHERE t.workspace_id = $1 ORDER BY t.user_id'],
  ['custom_fields',         byWorkspace('custom_fields')],
  ['deal_fields',           byWorkspace('deal_fields')],
  ['task_fields',           byWorkspace('task_fields')],
  ['object_fields',         byWorkspace('object_fields')],
  ['pipelines',             byWorkspace('pipelines')],
  ['pipeline_stages',       byWorkspace('pipeline_stages')],
  ['contacts',              byWorkspace('contacts')],
  ['deals',                 byWorkspace('deals')],
  ['objects',               byWorkspace('objects')],
  ['object_contacts',       `SELECT to_jsonb(t) AS r FROM object_contacts t JOIN objects o ON o.id = t.object_id
                             WHERE o.workspace_id = $1 ORDER BY t.object_id, t.contact_id`],
  ['deal_objects',          `SELECT to_jsonb(t) AS r FROM deal_objects t JOIN deals d ON d.id = t.deal_id
                             WHERE d.workspace_id = $1 ORDER BY t.deal_id, t.object_id`],
  ['activities',            byWorkspace('activities')],
  ['activity_comments',     byWorkspace('activity_comments')],
  ['task_projects',         byWorkspace('task_projects')],
  ['task_project_statuses', `SELECT to_jsonb(t) AS r FROM task_project_statuses t JOIN task_projects p ON p.id = t.project_id
                             WHERE p.workspace_id = $1 ORDER BY t.id`],
  ['task_lists',            byWorkspace('task_lists')],
  ['tasks',                 byWorkspace('tasks')],
  ['task_attachments',      byWorkspace('task_attachments')],
  ['contact_documents',     byWorkspace('contact_documents')],
];

// The bundle's content, or null when the workspace does not exist.
async function readWorkspace(pool, workspaceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = {};
    for (const [name, sql] of TABLES) {
      const { rows } = await client.query(sql, [workspaceId]);
      tables[name] = rows.map(row => row.r);
      if (name === 'workspaces' && !rows.length) { await client.query('ROLLBACK'); return null; }
    }
    await client.query('COMMIT');
    const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
    return {
      format: FORMAT,
      version: VERSION,
      exported_at: new Date().toISOString(),
      workspace_id: workspaceId,
      workspace_name: tables.workspaces[0].name,
      counts,
      tables,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// The tar entries of a bundle (utils/tar.js tarEntries / tarStream).
function bundleEntries(bundle) {
  const json = Buffer.from(JSON.stringify(bundle), 'utf8');
  return [{ name: 'workspace.json', size: json.length, body: json, mtime: Date.parse(bundle.exported_at) }];
}

// upgrads-<name>-<id>-<YYYY-MM-DD>.tar.gz — ASCII only, so it is safe inside a quoted
// Content-Disposition filename. "Müller & Söhne" → "muller-sohne".
function bundleFileName(bundle) {
  const slug = String(bundle.workspace_name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/, '') || 'workspace';
  return `upgrads-${slug}-${bundle.workspace_id}-${bundle.exported_at.slice(0, 10)}.tar.gz`;
}

module.exports = { FORMAT, VERSION, TABLES, readWorkspace, bundleEntries, bundleFileName };
