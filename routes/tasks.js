/* ═══════════════════════════════════════════════════════════════════════════
   /api/tasks — tasks and subtasks.

   A TASK can hang off several things, all optional: a project and list
   (task_projects / task_lists), a deal, a contact, and a parent task. A
   subtask is simply a task with parent_id set; it is never notified about and
   it is deleted with its parent (ON DELETE CASCADE).

   WORKSPACE OWNERSHIP OF LINKS IS CHECKED EXPLICITLY. deal_id and contact_id
   come from the client, so POST and PUT verify each one belongs to this
   workspace before writing — otherwise a task could point at another tenant's
   record. Copy that pattern for any new foreign key here.

   TIMES  due_date is a DATE and due_time a nullable TIME. BOTH are read back
   through TO_CHAR, and every SELECT here must keep doing so:
     due_time → 'HH24:MI'     so the client gets "09:30", not "09:30:00".
     due_date → 'YYYY-MM-DD'  because a raw DATE is NOT safe through res.json:
                              node-pg parses it into a JS Date at LOCAL midnight
                              and JSON serialises that in UTC, so on any server
                              east of UTC the client reads the day BEFORE the
                              one stored. The calendar route always did this;
                              this file's SELECT t.* let the raw DATE through,
                              which is why a task opened from the calendar
                              showed one day less than the calendar itself.
                              Pinned by tests/routes/task-date-serialisation.test.js.
   `SELECT t.*, TO_CHAR(..) AS due_date` names the column twice; node-pg keeps
   the LAST one, which is the alias — the same guarantee due_time relies on.
   A task with no time is a whole-day task; see taskDueAt() in
   public/js/tasks.js for why that distinction matters for "overdue".

   due_tz IS THE ZONE THAT TIME WAS TYPED IN. POST and PUT stamp it from
   req.userTimezone (middleware/auth.js → users.timezone), never from the body:
   the member types in their own clock, the server records which clock, and
   the client converts for each viewer (toViewerClock in public/js/clock.js).
   A row with NULL due_tz predates the column and is read as Europe/Berlin.

   THE LIST QUERY also counts subtasks (subtask_count / subtask_done) and
   joins the deal title and contact name, so the list renders in one request.

   WHO SEES A TASK. Tasks are not restricted by assignee. But when the workspace
   holds members to the deals and contacts assigned to them (utils/visibility.js),
   a task that NAMES a deal or a contact follows it, and a subtask follows its
   parent (utils/task-visibility.js): for such a member it is left out of the
   list and the subtask counts, and by id it is a 404 — read, change, status,
   delete. That holds even for a task assigned to the member: the deal decides.
   A task that names neither stays everybody's. A member cannot put a task on a
   deal or contact they cannot see (the same 400 as for one that does not
   exist), nor a subtask under a task they cannot see (404). Where a task
   follows a deal but also names a contact the member does not see, the
   contact's name is not joined. Owners, admins and workspaces without the
   switch run the statements unchanged.

   ENDPOINTS
     GET    /?list_id=       the list view's query
     GET    /:id             one task + its subtasks
     POST   / · PUT /:id · DELETE /:id
     PATCH  /:id/status      what kanban drag and drop calls

   ATTACHMENTS ARE A SEPARATE FILE mounted on the SAME prefix:
   routes/task-attachments.js serves /api/tasks/:taskId/attachments. This
   router is mounted first and only declares one- and two-segment paths, which
   is what lets those fall through. Do not add a /:id/:something route here.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');
const visibility     = require('../utils/visibility');        // members held to what is assigned to them
const taskVisibility = require('../utils/task-visibility');   // … and the tasks that hang on it

router.use(requireAuth);

// For a member held to their own, on top of the statement's own WHERE (`mine`): the same rule for the subtasks a
// count looks at (`sub`, alias s) and for the contact whose name is joined (`contact`, alias ct). All three are ''
// for everyone else. Call it after the statement's other parameters are pushed: the member's id goes last.
function held(req, params) {
  const mine = taskVisibility.tasks(req, params);
  if (!mine) return { mine: '', sub: '', contact: '' };
  const n = params.length;
  return { mine, sub: ` AND ${taskVisibility.own('s', n)}`, contact: ` AND ${visibility.rules.contact('ct', n)}` };
}

router.get('/', async (req, res, next) => {
  try {
    const { list_id } = req.query;
    const params = [req.workspaceId];
    let filter = '';
    if (list_id) { params.push(list_id); filter = ` AND t.list_id = $${params.length}`; }
    const own = held(req, params);

    const { rows } = await pool.query(`
      SELECT t.*,
             TO_CHAR(t.due_time, 'HH24:MI')    AS due_time,
             TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date,
             u.name  AS assigned_to_name,
             cu.name AS created_by_name,
             dl.title  AS deal_title,
             ct.name   AS contact_name,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id${own.sub}) AS subtask_count,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done'${own.sub}) AS subtask_done
      FROM tasks t
      LEFT JOIN users u  ON u.id = t.assigned_to
      LEFT JOIN users cu ON cu.id = t.created_by
      LEFT JOIN deals    dl ON dl.id = t.deal_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id${own.contact}
      WHERE t.workspace_id = $1 ${filter}${own.mine}
      ORDER BY t.parent_id NULLS FIRST, t.created_at ASC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const params = [req.params.id, req.workspaceId];
    const own = held(req, params);
    const { rows: [task] } = await pool.query(`
      SELECT t.*, TO_CHAR(t.due_time, 'HH24:MI') AS due_time,
             TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date,
             u.name AS assigned_to_name,
             dl.title AS deal_title, ct.name AS contact_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN deals    dl ON dl.id = t.deal_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id${own.contact}
      WHERE t.id = $1 AND t.workspace_id = $2${own.mine}
    `, params);
    if (!task) return res.status(404).json({ error: 'Not found' });

    // A subtask that names a deal or contact of its own follows that too (the parent is seen: checked above).
    const subParams = [req.params.id];
    let ownSub = '';
    if (visibility.restricted(req)) { subParams.push(req.userId); ownSub = ` AND ${taskVisibility.own('t', subParams.length)}`; }
    const { rows: subtasks } = await pool.query(`
      SELECT t.*, TO_CHAR(t.due_time, 'HH24:MI') AS due_time,
             TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date,
             u.name AS assigned_to_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.parent_id = $1${ownSub}
      ORDER BY t.created_at ASC
    `, subParams);

    res.json({ ...task, subtasks });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, due_time, parent_id, project_id, list_id, deal_id, contact_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    const contactId = contact_id ? parseInt(contact_id, 10) || null : null;
    if (dealId) {
      const p = [dealId, req.workspaceId];
      const { rows: [d] } = await pool.query(`SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2${visibility.deals(req, p, 'deals')}`, p);
      if (!d) return res.status(400).json({ error: 'Deal not found in this workspace' });
    }
    if (contactId) {
      const p = [contactId, req.workspaceId];
      const { rows: [c] } = await pool.query(`SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2${visibility.contacts(req, p, 'contacts')}`, p);
      if (!c) return res.status(400).json({ error: 'Contact not found in this workspace' });
    }
    if (parent_id && !(await taskVisibility.seesTask(pool, req, parent_id))) return res.status(404).json({ error: 'Not found' });
    const userTz = req.userTimezone || 'Europe/Berlin';
    const { rows: [row] } = await pool.query(
      `INSERT INTO tasks (workspace_id, parent_id, project_id, list_id, deal_id, contact_id, title, description, status, priority, assigned_to, due_date, due_time, created_by, due_tz)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [req.workspaceId, parent_id||null, project_id||null, list_id||null, dealId, contactId,
       title.trim(), description||null, status||'todo', priority||'medium',
       assigned_to||null, due_date||null, due_time||null, req.userId, userTz]
    );
    if (!parent_id) {
      notify(req.workspaceId, req.userId, {
        type: 'task_created', category: 'tasks',
        title: `New task: ${title.trim()}`,
        body: assigned_to ? `Assigned` : null,
        entityType: 'task', entityId: row.id,
      });
    }
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, due_time, custom_data, project_id, list_id, deal_id, contact_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    const contactId = contact_id ? parseInt(contact_id, 10) || null : null;
    if (dealId) {
      const p = [dealId, req.workspaceId];
      const { rows: [d] } = await pool.query(`SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2${visibility.deals(req, p, 'deals')}`, p);
      if (!d) return res.status(400).json({ error: 'Deal not found in this workspace' });
    }
    if (contactId) {
      const p = [contactId, req.workspaceId];
      const { rows: [c] } = await pool.query(`SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2${visibility.contacts(req, p, 'contacts')}`, p);
      if (!c) return res.status(400).json({ error: 'Contact not found in this workspace' });
    }
    const userTz = req.userTimezone || 'Europe/Berlin';
    const write = [title.trim(), description||null, status, priority, assigned_to||null,
       due_date||null, project_id||null, list_id||null,
       dealId, contactId, JSON.stringify(custom_data||{}), req.params.id, req.workspaceId,
       due_time||null, userTz];
    const result = await pool.query(
      `UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4,
       assigned_to=$5, due_date=$6, due_time=$14, due_tz=$15, project_id=$7, list_id=$8,
       deal_id=$9, contact_id=$10, custom_data=$11, updated_at=NOW()
       WHERE id=$12 AND workspace_id=$13${taskVisibility.tasks(req, write, 'tasks')}`,
      write
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const params = [req.body.status, req.params.id, req.workspaceId];
    const result = await pool.query(
      `UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3${taskVisibility.tasks(req, params, 'tasks')}`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const params = [req.params.id, req.workspaceId];
    const result = await pool.query(
      `DELETE FROM tasks WHERE id=$1 AND workspace_id=$2${taskVisibility.tasks(req, params, 'tasks')}`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
