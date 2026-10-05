const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

// The calendar feed is a union of two things the app schedules: activities that have an
// event_date (optionally with an event_time), and tasks that have a due_date. Each row says
// which it is in `kind`, since an activity and a task can share an id. A task has no clock
// time — a due date is a day — so it comes back as an all-day entry.

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required (YYYY-MM-DD)' });

    const { rows } = await pool.query(`
      SELECT 'activity' AS kind, a.id, a.type, a.content AS title, a.completed, a.created_by,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             TO_CHAR(a.event_time, 'HH24:MI')    AS event_time,
             a.content AS content,
             NULL AS status, NULL AS priority,
             u.name AS created_by_name,
             c.name AS contact_name, c.id AS contact_id,
             d.id AS deal_id, d.title AS deal_title
      FROM activities a
      LEFT JOIN users    u ON u.id = a.created_by
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN LATERAL (
        SELECT id, title FROM deals
        WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id
        ORDER BY deals.updated_at DESC LIMIT 1
      ) d ON true
      WHERE a.workspace_id = $1
        AND a.event_date IS NOT NULL
        AND a.event_date >= $2::date
        AND a.event_date <= $3::date
      UNION ALL
      SELECT 'task' AS kind, t.id, 'task' AS type, t.title AS title,
             (t.status = 'done') AS completed,
             COALESCE(t.assigned_to, t.created_by) AS created_by,
             TO_CHAR(t.due_date, 'YYYY-MM-DD')  AS event_date,
             TO_CHAR(t.due_time, 'HH24:MI')     AS event_time,
             t.description AS content,
             t.status, t.priority,
             ut.name AS created_by_name,
             ct.name AS contact_name, ct.id AS contact_id,
             dt.id AS deal_id, dt.title AS deal_title
      FROM tasks t
      LEFT JOIN users    ut ON ut.id = COALESCE(t.assigned_to, t.created_by)
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN deals    dt ON dt.id = t.deal_id
      WHERE t.workspace_id = $1
        AND t.due_date IS NOT NULL
        AND t.due_date >= $2::date
        AND t.due_date <= $3::date
      ORDER BY event_date ASC, event_time ASC NULLS FIRST, kind ASC, id ASC
    `, [req.workspaceId, start, end]);

    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/today', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT 'activity' AS kind, a.id, a.type, a.content AS title, a.completed, a.created_by,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             TO_CHAR(a.event_time, 'HH24:MI')    AS event_time,
             a.content AS content,
             NULL AS status, NULL AS priority,
             u.name AS created_by_name,
             c.name AS contact_name, c.id AS contact_id,
             d.id AS deal_id, d.title AS deal_title
      FROM activities a
      LEFT JOIN users    u ON u.id = a.created_by
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN LATERAL (
        SELECT id, title FROM deals
        WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id
        ORDER BY deals.updated_at DESC LIMIT 1
      ) d ON true
      WHERE a.workspace_id = $1
        AND a.event_date = CURRENT_DATE
      UNION ALL
      SELECT 'task' AS kind, t.id, 'task' AS type, t.title AS title,
             (t.status = 'done') AS completed,
             COALESCE(t.assigned_to, t.created_by) AS created_by,
             TO_CHAR(t.due_date, 'YYYY-MM-DD')  AS event_date,
             TO_CHAR(t.due_time, 'HH24:MI')     AS event_time,
             t.description AS content,
             t.status, t.priority,
             ut.name AS created_by_name,
             ct.name AS contact_name, ct.id AS contact_id,
             dt.id AS deal_id, dt.title AS deal_title
      FROM tasks t
      LEFT JOIN users    ut ON ut.id = COALESCE(t.assigned_to, t.created_by)
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN deals    dt ON dt.id = t.deal_id
      WHERE t.workspace_id = $1
        AND t.due_date = CURRENT_DATE
      ORDER BY event_time ASC NULLS FIRST, kind ASC, id ASC
    `, [req.workspaceId]);

    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
