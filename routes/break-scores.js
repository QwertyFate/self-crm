/* ═══════════════════════════════════════════════════════════════════════════
   /api/break-scores — the team's high score board for the break, the
   falling-block game in public/js/break-game.js (2026-10-20).

   PER WORKSPACE. One row per person and workspace: their best game. Everyone
   in the workspace sees the ten best with names. Someone who leaves the
   workspace drops off the board (the join on user_workspaces) but keeps the
   row, so it is back if they return.

   CLIENT-REPORTED. The score comes from the browser, so it is checked (whole
   numbers, in range, capped) and the route is rate-limited in server.js. It
   is a game among colleagues, not a ledger. Who and where always come from
   the session (req.userId, req.workspaceId), never from the body.

   ENDPOINTS
     GET  /   the ten best of this workspace:
              [{ name, score, lines, level, at (ms), mine }]
     POST /   { score, lines, level } after a finished game; kept only if it
              beats the caller's best; answers with the board
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const BOARD_SIZE = 10;
const CAPS = { score: 10_000_000, lines: 100_000, level: 10_000 };

// A whole number from min to max, or null.
function wholeIn(v, min, max) { return Number.isInteger(v) && v >= min && v <= max ? v : null; }

async function board(workspaceId, userId) {
  const { rows } = await pool.query(`
    SELECT u.name, b.score, b.lines, b.level, b.updated_at, (b.user_id = $2) AS mine
    FROM break_scores b
    JOIN user_workspaces uw ON uw.user_id = b.user_id AND uw.workspace_id = b.workspace_id
    JOIN users u ON u.id = b.user_id
    WHERE b.workspace_id = $1 AND b.score > 0
    ORDER BY b.score DESC, b.updated_at ASC
    LIMIT $3
  `, [workspaceId, userId, BOARD_SIZE]);
  return rows.map(r => ({
    name: r.name, score: r.score, lines: r.lines, level: r.level,
    at: r.updated_at ? new Date(r.updated_at).getTime() : null,
    mine: r.mine === true,
  }));
}

router.get('/', async (req, res, next) => {
  try { res.json(await board(req.workspaceId, req.userId)); } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const body  = req.body || {};
    const score = wholeIn(body.score, 1, CAPS.score);
    const lines = wholeIn(body.lines, 0, CAPS.lines);
    const level = wholeIn(body.level, 1, CAPS.level);
    if (score === null || lines === null || level === null) {
      return res.status(400).json({ error: 'score, lines and level must be whole numbers in range' });
    }
    // Keep the best: a new row, or an update only when this game beats the stored one.
    await pool.query(`
      INSERT INTO break_scores (workspace_id, user_id, score, lines, level) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (workspace_id, user_id) DO UPDATE
        SET score = EXCLUDED.score, lines = EXCLUDED.lines, level = EXCLUDED.level, updated_at = NOW()
        WHERE break_scores.score < EXCLUDED.score
    `, [req.workspaceId, req.userId, score, lines, level]);
    res.json(await board(req.workspaceId, req.userId));
  } catch (e) { next(e); }
});

module.exports = router;
