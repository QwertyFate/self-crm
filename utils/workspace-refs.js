// ---------------------------------------------------------------------------
// Cross-workspace reference guard. Foreign keys are global, so an id that
// belongs to another workspace is a real row and would be accepted — and then
// rendered back by the read-side joins, leaking that workspace's user name,
// email, phone or stage names. Every referenced id must belong to the caller's
// workspace. `q` is a pool or a checked-out client (anything with .query).
// ---------------------------------------------------------------------------

// Whole-workspace prefetch of contact stages + members. Used by the contacts
// import loop, where one query serves every row. Query text is unchanged from
// its original home in routes/contacts.js.
async function workspaceRefs(q, workspaceId) {
  const { rows } = await q.query(
    `SELECT 'stage' AS kind, id FROM stages WHERE workspace_id=$1
     UNION ALL
     SELECT 'user', id FROM users WHERE workspace_id=$1`,
    [workspaceId]
  );
  const stages = new Set(), members = new Set();
  for (const r of rows) (r.kind === 'stage' ? stages : members).add(Number(r.id));
  return { stages, members };
}

// Targeted lookup for a single deal write: one round trip, bound to the ids
// actually supplied, so a deal save never prefetches every contact in the
// workspace. A missing or falsy id is "not provided" and is not looked up; a
// non-integer id is not looked up either, so refCheck rejects it with 400
// instead of the INSERT failing with 500.
async function dealRefs(q, workspaceId, ids = {}) {
  const int = v => { const n = Number(v); return v && Number.isInteger(n) ? n : null; };
  const want = {
    contacts:  [int(ids.contact_id), int(ids.supplier_id)].filter(v => v !== null),
    pipelines: [int(ids.pipeline_id)].filter(v => v !== null),
    stages:    [int(ids.stage_id)].filter(v => v !== null),
    members:   [int(ids.assigned_to)].filter(v => v !== null),
  };
  const refs = { contacts: new Set(), pipelines: new Set(), stages: new Set(), members: new Set() };
  if (!want.contacts.length && !want.pipelines.length && !want.stages.length && !want.members.length) return refs;
  const { rows } = await q.query(
    `SELECT 'contact' AS kind, id FROM contacts WHERE workspace_id=$1 AND id = ANY($2::int[])
     UNION ALL SELECT 'pipeline', id FROM pipelines WHERE workspace_id=$1 AND id = ANY($3::int[])
     UNION ALL SELECT 'stage', id FROM pipeline_stages WHERE workspace_id=$1 AND id = ANY($4::int[])
     UNION ALL SELECT 'user', id FROM users WHERE workspace_id=$1 AND id = ANY($5::int[])`,
    [workspaceId, want.contacts, want.pipelines, want.stages, want.members]
  );
  const target = { contact: refs.contacts, pipeline: refs.pipelines, stage: refs.stages, user: refs.members };
  for (const r of rows) target[r.kind]?.add(Number(r.id));
  return refs;
}

// Same idea for a task write: one round trip, only the supplied ids, over the
// six tables a task can point at. Returns { tasks, projects, lists, members,
// deals, contacts } Sets.
async function taskRefs(q, workspaceId, ids = {}) {
  const int = v => { const n = Number(v); return v && Number.isInteger(n) ? n : null; };
  const one = v => [int(v)].filter(x => x !== null);
  const want = {
    tasks: one(ids.parent_id), projects: one(ids.project_id), lists: one(ids.list_id),
    members: one(ids.assigned_to), deals: one(ids.deal_id), contacts: one(ids.contact_id),
  };
  const refs = { tasks: new Set(), projects: new Set(), lists: new Set(), members: new Set(), deals: new Set(), contacts: new Set() };
  if (!Object.values(want).some(a => a.length)) return refs;
  const { rows } = await q.query(
    `SELECT 'task' AS kind, id FROM tasks WHERE workspace_id=$1 AND id = ANY($2::int[])
     UNION ALL SELECT 'project', id FROM task_projects WHERE workspace_id=$1 AND id = ANY($3::int[])
     UNION ALL SELECT 'list', id FROM task_lists WHERE workspace_id=$1 AND id = ANY($4::int[])
     UNION ALL SELECT 'user', id FROM users WHERE workspace_id=$1 AND id = ANY($5::int[])
     UNION ALL SELECT 'deal', id FROM deals WHERE workspace_id=$1 AND id = ANY($6::int[])
     UNION ALL SELECT 'contact', id FROM contacts WHERE workspace_id=$1 AND id = ANY($7::int[])`,
    [workspaceId, want.tasks, want.projects, want.lists, want.members, want.deals, want.contacts]
  );
  const target = { task: refs.tasks, project: refs.projects, list: refs.lists, user: refs.members, deal: refs.deals, contact: refs.contacts };
  for (const r of rows) target[r.kind]?.add(Number(r.id));
  return refs;
}

// Task status / priority allow-lists. A task may carry: a key from the
// workspace's task_statuses column, a key from its project's own statuses
// (the client prefers those when the project has any), or one of the four
// built-ins the client falls back to. One round trip; projectId may be null.
const TASK_PRIORITIES        = ['low', 'medium', 'high', 'urgent'];
const BUILTIN_TASK_STATUSES  = ['todo', 'in_progress', 'in_review', 'done'];
async function allowedTaskStatuses(q, workspaceId, projectId = null) {
  const pid = projectId && Number.isInteger(Number(projectId)) ? Number(projectId) : null;
  const { rows } = await q.query(
    `SELECT s->>'key' AS key FROM workspaces w, jsonb_array_elements(w.task_statuses) s WHERE w.id=$1
     UNION SELECT tps.key FROM task_project_statuses tps
       JOIN task_projects p ON p.id = tps.project_id
       WHERE p.workspace_id=$1 AND tps.project_id = $2::int`,
    [workspaceId, pid]
  );
  return new Set([...BUILTIN_TASK_STATUSES, ...rows.map(r => r.key).filter(Boolean)]);
}

// Returns an error message, or null. Mirrors the write sites' `|| null`
// semantics: a falsy id means "not provided" and is never validated. A field
// is only checked when `refs` carries the matching set, so the contacts path
// (stages + members) validates exactly what it did before.
const REF_FIELDS = [
  ['contact_id',  'contacts',  'contact_id does not belong to this workspace'],
  ['supplier_id', 'contacts',  'supplier_id does not belong to this workspace'],
  ['pipeline_id', 'pipelines', 'pipeline_id does not belong to this workspace'],
  ['stage_id',    'stages',    'stage_id does not belong to this workspace'],
  ['assigned_to', 'members',   'assigned_to is not a member of this workspace'],
  ['parent_id',   'tasks',     'parent_id does not belong to this workspace'],
  ['project_id',  'projects',  'project_id does not belong to this workspace'],
  ['list_id',     'lists',     'list_id does not belong to this workspace'],
  ['deal_id',     'deals',     'deal_id does not belong to this workspace'],
];
function refCheck(refs, ids = {}) {
  for (const [field, set, message] of REF_FIELDS) {
    const v = ids[field] || null;
    if (v !== null && refs[set] && !refs[set].has(Number(v))) return message;
  }
  return null;
}

module.exports = { workspaceRefs, dealRefs, taskRefs, refCheck, allowedTaskStatuses, TASK_PRIORITIES };
