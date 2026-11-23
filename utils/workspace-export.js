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
   SINCE VERSION 2 (2026-11-20, WORKSPACE_TRANSFER_CHANGES Part 2) also what
   the workspace has made with what was added after the first export:
     note_templates      the templates a note is started from
     journey_flows       the workflows — name, whether it is switched on
     journey_nodes       … their boxes: the start with everything it was set
                         to (what starts it, where it ends), every step, the
                         two lines of a branch, each box's place on the board
     journey_runs        … which deal is in which workflow, at which step,
                         and when that step is due
     journey_log         … the whole record: who was taken in, every step,
                         every end with its reason, and who changed a
                         workflow — also of workflows that were deleted
     fonio_calls         fonio's calls for deals: sent, planned, their results
     fonio_other_calls   … and the calls nobody planned (incoming, unmatched)
   A version 1 bundle is a version 2 bundle without these seven tables.

   ⚠ password_hash is in the file. Treat a bundle like a password.

   NOT IN IT, ON PURPOSE  (LEFT_OUT below names every one; a test holds the
   two lists against db.js, so a table added later has to be put in one of
   them — the export cannot fall behind unnoticed again)
     secrets bound to this install   workspace_webhook (the key is in its URL),
                                     workspace_calcom, workspace_calendly,
                                     workspace_engine, workspace_fonio (its key
                                     and its result link), workspace_mail and
                                     email_accounts (a Google sign-in, sealed
                                     under this server's secret), api_keys,
                                     workspace_notetaker_ai
     history about the workspace     webhook_logs, engine_deliveries,
                                     engine_api_requests, idempotency_keys,
                                     notetaker_recordings, notifications,
                                     journey_sends (the emails counted against
                                     the sending address's limits: seven days
                                     of this install's own sending)
     rebuilt by itself               journey_watch (what a workflow last saw of
                                     each deal: written again the first time
                                     the workflow looks)
     the team's chatter              chat_messages, chat_reads, break_scores
     access                          invite_codes, password_resets
     the platform's, not the         master_access_log, platform_invites,
     workspace's                     platform_settings
     dead                            stages (contact stages, removed in Part 19)

   FOR WHOEVER IMPORTS A BUNDLE
     · Ids also stand INSIDE JSON, where no foreign key shows them. In
       journey_nodes.config: stage_id, stage_ids, stop_stage_ids,
       stay_stage_ids (stages), pipeline_id, flow_id and
       stop_set.other_flow.flow_id (workflows), webhook_ids (lead webhooks —
       which are NOT in the bundle: a start limited to some of them has to
       become "every lead webhook" or be set anew), user_ids (people, where a
       box asks who a deal or a contact is assigned to), and in a router box
       routes[].next_id (boxes of the same workflow — the routes' lines) with
       each route's own question in routes[].when, which names the same
       kinds of ids. A field is named by its
       key, which travels as it is. fonio_calls.stage_at_send is a stage's id
       without a foreign key.
     · journey_runs.event_key and the ids in a call's request / result_body
       were made from this install's ids. A key only has to stay unique per
       workflow and deal; an importer that keeps ids from colliding with new
       ones gives the old keys a prefix.
     · WORK THAT IS STILL TO HAPPEN travels too: a workflow that is switched
       on, a deal waiting for its next step (journey_runs.status 'waiting'), a
       call that is planned (fonio_calls.status 'scheduled'). Imported as they
       are into an install that runs, they would happen a second time — the
       email sent, the person called — beside the install they came from. An
       importer switches the workflows off and leaves planned calls behind
       unless it is told that this copy takes over.
   ═══════════════════════════════════════════════════════════════════════════ */

const FORMAT  = 'upgrads-workspace';
const VERSION = 2;

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
  // version 2: journey_nodes.next_id / else_id point into their own table, journey_runs to a workflow, a deal and a
  // box, journey_log to those and a person (each of them may be gone: the entry keeps their names), fonio_calls to a
  // deal, a contact, people, the note it left and the call it follows
  ['note_templates',        byWorkspace('note_templates')],
  ['journey_flows',         byWorkspace('journey_flows')],
  ['journey_nodes',         byWorkspace('journey_nodes')],
  ['journey_runs',          byWorkspace('journey_runs')],
  ['journey_log',           byWorkspace('journey_log')],
  ['fonio_calls',           byWorkspace('fonio_calls')],
  ['fonio_other_calls',     byWorkspace('fonio_other_calls')],
];

// Every other table of the schema, with why it stays out (the header says more). TABLES and LEFT_OUT together are
// every table db.js creates: tests/routes/admin-transfer.test.js fails when a new table is in neither.
const LEFT_OUT = {
  workspace_webhook: 'secret', workspace_calcom: 'secret', workspace_calendly: 'secret', workspace_engine: 'secret', workspace_fonio: 'secret', workspace_mail: 'secret', email_accounts: 'secret',
  api_keys: 'secret', workspace_notetaker_ai: 'secret',
  webhook_logs: 'history', engine_deliveries: 'history', engine_api_requests: 'history', idempotency_keys: 'history', notetaker_recordings: 'history', notifications: 'history',
  journey_sends: 'history',
  journey_watch: 'rebuilt',
  chat_messages: 'chatter', chat_reads: 'chatter', break_scores: 'chatter',
  invite_codes: 'access', password_resets: 'access',
  master_access_log: 'platform', platform_invites: 'platform', platform_settings: 'platform',
  stages: 'dead',
};

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

module.exports = { FORMAT, VERSION, TABLES, LEFT_OUT, readWorkspace, bundleEntries, bundleFileName };
