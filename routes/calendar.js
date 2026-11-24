/* ═══════════════════════════════════════════════════════════════════════════
   /api/calendar — READ ONLY. The calendar owns no table of its own.

   Each response is a UNION ALL of the two things this app schedules:
     activities with an event_date   (+ optional event_time)
     tasks      with a due_date      (+ optional due_time)
   Every row also carries event_tz — the zone its time was typed in (NULL for
   rows older than the column). The client converts to the viewer's clock.
   Every row carries `kind` ('activity' | 'task') because an activity and a
   task can share an id — the client keys entries by kind AND id.

   WRITES GO BACK TO THE OWNING ROUTE, not here:
     an activity → PATCH /api/activities/:id
     a task      → PATCH /api/tasks/:id/status

   BOTH HALVES OF THE UNION MUST FILTER ON workspace_id. A missing filter in
   one half is invisible in the UI, which is why tests/routes/calendar-tasks.js
   asserts it in the SQL.

   Dates come back pre-formatted (TO_CHAR 'YYYY-MM-DD' and 'HH24:MI') so the
   client never parses a timestamp — building a Date from a bare date string
   is UTC midnight and has caused off-by-a-day bugs here.

   The LATERAL join on each activity finds that contact's most recently updated
   deal, so an entry can link straight to the deal it is about.

   WHO SEES AN ENTRY. When the workspace holds members to what is assigned to
   them (utils/visibility.js), an entry follows what it names: an activity or
   a task on a deal is shown when the member sees that deal, else one on a
   contact when they see that contact; an entry that names neither (a task of
   the team, a note with a date) is shown to everyone. A subtask is shown only
   when its parent task is (utils/task-visibility.js, as on the Tasks page). The LATERAL join only
   offers such a member a deal they see, so an entry on their contact never
   links to (or names) a colleague's deal on the same contact. Owners, admins
   and workspaces without the switch run the statements unchanged.

   ENDPOINTS
     GET /?start=YYYY-MM-DD&end=YYYY-MM-DD   400 without both
     GET /today                              the same union at CURRENT_DATE
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const visibility  = require('../utils/visibility');    // members held to what is assigned to them
const taskVisibility = require('../utils/task-visibility');   // the same rule for tasks (a subtask also follows its parent)

// The calendar feed is a union of two things the app schedules: activities that have an
// event_date (optionally with an event_time), and tasks that have a due_date. Each row says
// which it is in `kind`, since an activity and a task can share an id. A task has no clock
// time — a due date is a day — so it comes back as an all-day entry.

router.use(requireAuth);

// What a member held to their own adds to the union (utils/visibility.js): which activities, which tasks, and which
// deal the LATERAL join may offer. Three empty strings, and nothing pushed, for everyone else.
function pieces(req, params) {
  return {
    activities: visibility.linked(req, params, { deal: 'a.deal_id', contact: 'a.contact_id' }),
    deal:       visibility.deals(req, params, 'deals'),
    tasks:      taskVisibility.tasks(req, params, 't'),   // the Tasks page's own rule, so both screens show the same tasks
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required (YYYY-MM-DD)' });
    const params = [req.workspaceId, start, end], mine = pieces(req, params);

    const { rows } = await pool.query(`
      SELECT 'activity' AS kind, a.id, a.type, a.content AS title, a.completed, a.created_by,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             TO_CHAR(a.event_time, 'HH24:MI')    AS event_time,
             a.event_tz AS event_tz,
             a.content AS content,
             NULL AS status, NULL AS priority,
             u.name AS created_by_name,
             c.name AS contact_name, c.id AS contact_id,
             COALESCE(db.id, d.id) AS deal_id, COALESCE(db.title, d.title) AS deal_title,
             a.cancelled_at AS cancelled_at, a.source AS source, a.calcom_uid AS calcom_uid, a.calcom_event_type_id AS calcom_event_type_id
      FROM activities a
      LEFT JOIN users    u ON u.id = a.created_by
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN deals db ON db.id = a.deal_id
      LEFT JOIN LATERAL (
        SELECT id, title FROM deals
        WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id${mine.deal}
        ORDER BY deals.updated_at DESC LIMIT 1
      ) d ON true
      WHERE a.workspace_id = $1
        AND a.event_date IS NOT NULL
        AND a.event_date >= $2::date
        AND a.event_date <= $3::date${mine.activities}
      UNION ALL
      SELECT 'task' AS kind, t.id, 'task' AS type, t.title AS title,
             (t.status = 'done') AS completed,
             COALESCE(t.assigned_to, t.created_by) AS created_by,
             TO_CHAR(t.due_date, 'YYYY-MM-DD')  AS event_date,
             TO_CHAR(t.due_time, 'HH24:MI')     AS event_time,
             t.due_tz AS event_tz,
             t.description AS content,
             t.status, t.priority,
             ut.name AS created_by_name,
             ct.name AS contact_name, ct.id AS contact_id,
             dt.id AS deal_id, dt.title AS deal_title,
             NULL::timestamptz AS cancelled_at, 'user' AS source, NULL::text AS calcom_uid, NULL::integer AS calcom_event_type_id
      FROM tasks t
      LEFT JOIN users    ut ON ut.id = COALESCE(t.assigned_to, t.created_by)
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN deals    dt ON dt.id = t.deal_id
      WHERE t.workspace_id = $1
        AND t.due_date IS NOT NULL
        AND t.due_date >= $2::date
        AND t.due_date <= $3::date${mine.tasks}
      ORDER BY event_date ASC, event_time ASC NULLS FIRST, kind ASC, id ASC
    `, params);

    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/today', async (req, res, next) => {
  try {
    const params = [req.workspaceId], mine = pieces(req, params);
    const { rows } = await pool.query(`
      SELECT 'activity' AS kind, a.id, a.type, a.content AS title, a.completed, a.created_by,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             TO_CHAR(a.event_time, 'HH24:MI')    AS event_time,
             a.event_tz AS event_tz,
             a.content AS content,
             NULL AS status, NULL AS priority,
             u.name AS created_by_name,
             c.name AS contact_name, c.id AS contact_id,
             COALESCE(db.id, d.id) AS deal_id, COALESCE(db.title, d.title) AS deal_title,
             a.cancelled_at AS cancelled_at, a.source AS source, a.calcom_uid AS calcom_uid, a.calcom_event_type_id AS calcom_event_type_id
      FROM activities a
      LEFT JOIN users    u ON u.id = a.created_by
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN deals db ON db.id = a.deal_id
      LEFT JOIN LATERAL (
        SELECT id, title FROM deals
        WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id${mine.deal}
        ORDER BY deals.updated_at DESC LIMIT 1
      ) d ON true
      WHERE a.workspace_id = $1
        AND a.event_date = CURRENT_DATE${mine.activities}
      UNION ALL
      SELECT 'task' AS kind, t.id, 'task' AS type, t.title AS title,
             (t.status = 'done') AS completed,
             COALESCE(t.assigned_to, t.created_by) AS created_by,
             TO_CHAR(t.due_date, 'YYYY-MM-DD')  AS event_date,
             TO_CHAR(t.due_time, 'HH24:MI')     AS event_time,
             t.due_tz AS event_tz,
             t.description AS content,
             t.status, t.priority,
             ut.name AS created_by_name,
             ct.name AS contact_name, ct.id AS contact_id,
             dt.id AS deal_id, dt.title AS deal_title,
             NULL::timestamptz AS cancelled_at, 'user' AS source, NULL::text AS calcom_uid, NULL::integer AS calcom_event_type_id
      FROM tasks t
      LEFT JOIN users    ut ON ut.id = COALESCE(t.assigned_to, t.created_by)
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN deals    dt ON dt.id = t.deal_id
      WHERE t.workspace_id = $1
        AND t.due_date = CURRENT_DATE${mine.tasks}
      ORDER BY event_time ASC NULLS FIRST, kind ASC, id ASC
    `, params);

    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
