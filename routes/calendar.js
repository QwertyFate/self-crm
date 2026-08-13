const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns activities scheduled between start and end (inclusive)
router.get('/', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required (YYYY-MM-DD)' });

    const { rows } = await pool.query(`
      SELECT a.id, a.type, a.content, a.event_date, a.created_at,
             c.name AS contact_name, c.id AS contact_id,
             d.id AS deal_id, d.title AS deal_title
      FROM activities a
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
      ORDER BY a.event_date ASC, a.created_at ASC
    `, [req.workspaceId, start, end]);

    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/calendar/today — shorthand for today's events
router.get('/today', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.type, a.content, a.event_date, a.created_at,
             c.name AS contact_name, c.id AS contact_id,
             d.id AS deal_id, d.title AS deal_title
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN LATERAL (
        SELECT id, title FROM deals
        WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id
        ORDER BY deals.updated_at DESC LIMIT 1
      ) d ON true
      WHERE a.workspace_id = $1
        AND a.event_date = CURRENT_DATE
      ORDER BY a.created_at ASC
    `, [req.workspaceId]);

    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;