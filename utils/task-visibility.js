/* ═══════════════════════════════════════════════════════════════════════════
   Which TASKS a member held to their own sees (utils/visibility.js has the
   switch and the rule for deals and contacts; this is the same rule one step
   further, for what hangs on them).

   A task is not restricted by who it is assigned to — the switch is about
   deals and contacts. A task is held back only through what it NAMES:
     it names a deal      → seen when that deal is seen;
     it names a contact   → seen when that contact is seen (no deal named);
     it names neither     → seen by everyone, as before;
     it is a SUBTASK      → also only when its parent task is seen (one level:
                            a subtask is a task with parent_id, and the screens
                            make no deeper nesting).
   So a task assigned to a member that names somebody else's deal is NOT seen
   by that member: the deal decides, not the assignee.

   tasks(req, params, alias)  the piece of SQL to put after a statement's own
                              WHERE conditions, with the member's id pushed onto
                              `params`; '' and nothing pushed for whoever is not
                              held, so the statement is the one that shipped.
                              `alias` is what the statement calls the table
                              ('t' in the lists, 'tasks' in a bare UPDATE or
                              DELETE) — a word written in the route.
   rule(alias, n)             the bare condition, for a place a piece after
                              WHERE does not fit; n is the placeholder number
                              of the member's id.
   seesTask(pool, req, id)    one task by id; always true, and no query, for
                              whoever is not held.

   Like every utility, it is handed the pool; it never requires ../db.
   ═══════════════════════════════════════════════════════════════════════════ */

const visibility = require('./visibility');

const names = a => ({ deal: `${a}.deal_id`, contact: `${a}.contact_id` });
const own   = (a, n) => visibility.rules.linked(names(a), n);
const rule  = (t, n) =>
  `(${own(t, n)} AND (${t}.parent_id IS NULL OR EXISTS (SELECT 1 FROM tasks pt WHERE pt.id = ${t}.parent_id AND ${own('pt', n)})))`;

function tasks(req, params, alias = 't') {
  if (!visibility.restricted(req)) return '';
  params.push(req.userId);
  return ` AND ${rule(alias, params.length)}`;
}

async function seesTask(pool, req, id) {
  if (!visibility.restricted(req)) return true;
  const params = [id, req.workspaceId];
  const { rows } = await pool.query(`SELECT 1 FROM tasks t WHERE t.id = $1 AND t.workspace_id = $2${tasks(req, params)}`, params);
  return rows.length > 0;
}

module.exports = { tasks, rule, own, seesTask };
