const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// GET /api/analytics/summary
router.get('/summary', async (req, res, next) => {
  try {
    const wid = req.workspaceId;

    const { rows: [ws] } = await pool.query(
      'SELECT analytics_config FROM workspaces WHERE id=$1', [wid]
    );
    const config     = ws?.analytics_config || {};
    const wonIds     = (config.won_stage_ids  || []).map(Number);
    const lostIds    = (config.lost_stage_ids || []).map(Number);
    const valueField = config.value_field || null; // null = no value tracking

    // Contacts
    const { rows: [{ total_contacts }] } = await pool.query(
      `SELECT COUNT(*) AS total_contacts FROM contacts WHERE workspace_id=$1`, [wid]
    );
    const { rows: [{ new_contacts }] } = await pool.query(
      `SELECT COUNT(*) AS new_contacts FROM contacts WHERE workspace_id=$1 AND created_at >= date_trunc('month', NOW())`, [wid]
    );

    // Build value expression for deals
    let valExpr = 'NULL::numeric';
    if (valueField === 'value') {
      valExpr = 'value';
    } else if (valueField) {
      valExpr = `(custom_data->>'${valueField}')::numeric`;
    }

    // Deals grouped by stage
    const { rows: dealRows } = await pool.query(
      `SELECT stage_id, COUNT(*) AS cnt, COALESCE(SUM(${valExpr}),0) AS val
       FROM deals WHERE workspace_id=$1 GROUP BY stage_id`, [wid]
    );

    let open_deals = 0, won_deals = 0, lost_deals = 0;
    let pipeline_value = 0, won_value = 0;

    for (const row of dealRows) {
      const sid   = row.stage_id ? Number(row.stage_id) : null;
      const count = parseInt(row.cnt);
      const val   = parseFloat(row.val) || 0;
      if (sid !== null && wonIds.includes(sid)) {
        won_deals  += count; won_value      += val;
      } else if (sid !== null && lostIds.includes(sid)) {
        lost_deals += count;
      } else {
        open_deals += count; pipeline_value += val;
      }
    }

    const closed   = won_deals + lost_deals;
    const win_rate = closed > 0 ? Math.round((won_deals / closed) * 100) : null;

    // New deals this month
    const { rows: [{ new_deals }] } = await pool.query(
      `SELECT COUNT(*) AS new_deals FROM deals WHERE workspace_id=$1 AND created_at >= date_trunc('month', NOW())`, [wid]
    );

    // Average deal value (only when a field is configured)
    let avg_value = null;
    if (valueField) {
      const { rows: [{ av }] } = await pool.query(
        `SELECT AVG(${valExpr}) AS av FROM deals WHERE workspace_id=$1 AND ${valExpr} IS NOT NULL`, [wid]
      );
      avg_value = av ? parseFloat(av) : null;
    }

    // Tasks
    const { rows: [tk] } = await pool.query(
      `SELECT
         COUNT(*)                                                        AS total_tasks,
         COUNT(*) FILTER (WHERE status='done')                          AS done_tasks,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done')  AS overdue_tasks
       FROM tasks WHERE workspace_id=$1`, [wid]
    );

    // Deals by pipeline — value only if field configured
    const pipelineValExpr = valueField === 'value'
      ? 'd.value'
      : valueField
        ? `(d.custom_data->>'${valueField}')::numeric`
        : '0';
    const { rows: by_pipeline } = await pool.query(
      `SELECT p.name AS pipeline_name,
              COUNT(d.id) AS cnt,
              COALESCE(SUM(${pipelineValExpr}),0) AS val
       FROM pipelines p
       LEFT JOIN deals d ON d.pipeline_id = p.id AND d.workspace_id = p.workspace_id
       WHERE p.workspace_id=$1
       GROUP BY p.id, p.name, p.position
       ORDER BY p.position`, [wid]
    );

    // All pipeline stages for config UI — grouped with pipeline info
    const { rows: all_stages } = await pool.query(
      `SELECT ps.id, ps.name, ps.color, p.id AS pipeline_id, p.name AS pipeline_name
       FROM pipeline_stages ps
       JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE ps.workspace_id=$1
       ORDER BY p.position, ps.position`, [wid]
    );

    // Deal fields (for value field selector)
    const { rows: deal_fields } = await pool.query(
      `SELECT field_key, name, type FROM deal_fields WHERE workspace_id=$1 ORDER BY position`, [wid]
    );

    res.json({
      total_contacts: parseInt(total_contacts),
      new_contacts:   parseInt(new_contacts),
      total_deals:    open_deals + won_deals + lost_deals,
      open_deals, won_deals, lost_deals,
      win_rate,
      pipeline_value: valueField ? parseFloat(pipeline_value) : null,
      won_value:      valueField ? parseFloat(won_value)      : null,
      avg_value,
      new_deals:      parseInt(new_deals),
      total_tasks:    parseInt(tk.total_tasks),
      done_tasks:     parseInt(tk.done_tasks),
      overdue_tasks:  parseInt(tk.overdue_tasks),
      by_pipeline,
      all_stages,
      deal_fields,
      config,
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/trend?period=week|month|year
router.get('/trend', async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const PERIODS = {
      week:  { interval: '7 days',   trunc: 'day',   step: '1 day',   count: 7  },
      month: { interval: '30 days',  trunc: 'day',   step: '1 day',   count: 30 },
      year:  { interval: '12 months', trunc: 'month', step: '1 month', count: 12 },
    };
    const p = PERIODS[req.query.period] || PERIODS.month;

    const { rows: [ws] } = await pool.query('SELECT analytics_config FROM workspaces WHERE id=$1', [wid]);
    const config     = ws?.analytics_config || {};
    const valueField = config.value_field || null;

    let valExpr = 'NULL::numeric';
    if (valueField === 'value')  valExpr = 'value';
    else if (valueField)         valExpr = `(custom_data->>'${valueField}')::numeric`;

    const seriesSQL = `
      SELECT gs.p::date AS period, COALESCE(t.cnt, 0) AS cnt
      FROM generate_series(
        date_trunc('${p.trunc}', NOW() - INTERVAL '${p.interval}'),
        date_trunc('${p.trunc}', NOW()),
        INTERVAL '${p.step}'
      ) AS gs(p)
      LEFT JOIN (
        SELECT date_trunc('${p.trunc}', created_at) AS p, COUNT(*) AS cnt
        FROM {TABLE} WHERE workspace_id=$1
          AND created_at >= date_trunc('${p.trunc}', NOW() - INTERVAL '${p.interval}')
        GROUP BY 1
      ) t ON t.p = gs.p
      ORDER BY gs.p`;

    const { rows: contacts } = await pool.query(seriesSQL.replace('{TABLE}', 'contacts'), [wid]);
    const { rows: deals }    = await pool.query(seriesSQL.replace('{TABLE}', 'deals'),    [wid]);

    let value_trend = null;
    if (valueField) {
      const { rows } = await pool.query(`
        SELECT gs.p::date AS period, COALESCE(t.val, 0) AS val
        FROM generate_series(
          date_trunc('${p.trunc}', NOW() - INTERVAL '${p.interval}'),
          date_trunc('${p.trunc}', NOW()),
          INTERVAL '${p.step}'
        ) AS gs(p)
        LEFT JOIN (
          SELECT date_trunc('${p.trunc}', created_at) AS p, COALESCE(SUM(${valExpr}),0) AS val
          FROM deals WHERE workspace_id=$1
            AND created_at >= date_trunc('${p.trunc}', NOW() - INTERVAL '${p.interval}')
          GROUP BY 1
        ) t ON t.p = gs.p
        ORDER BY gs.p`, [wid]);
      value_trend = rows;
    }

    res.json({ contacts, deals, value_trend, period: req.query.period || 'month' });
  } catch (err) { next(err); }
});

// PATCH /api/analytics/config
router.patch('/config', async (req, res, next) => {
  try {
    const { won_stage_ids = [], lost_stage_ids = [], value_field = null } = req.body;
    await pool.query(
      `UPDATE workspaces
       SET analytics_config = analytics_config || $1::jsonb
       WHERE id=$2`,
      [JSON.stringify({ won_stage_ids, lost_stage_ids, value_field }), req.workspaceId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
