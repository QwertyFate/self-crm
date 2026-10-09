/* ═══════════════════════════════════════════════════════════════════════════
   /api/analytics — the dashboard's numbers.

   TWO READS  GET /summary builds the whole page in one response (counts, win
   rate, values, period deltas, top open deals, by-owner, funnel, win-rate
   trend, by-pipeline, stages, deal fields, config, layout). GET /trend returns
   only the time series, because the period switch changes nothing else.

   NOTHING IS MEANINGFUL UNTIL A WORKSPACE IS CONFIGURED
   (workspaces.analytics_config, written by PATCH /config):
     won_stage_ids / lost_stage_ids   which stages mean won and lost; every
                                      other stage counts as open
     value_field                      which field the money metrics sum —
                                      'value' or a numeric custom deal field
   With no value_field the money numbers are returned as null, not 0, so the
   UI can say "not configured" instead of lying with a zero.

   THE ONE PLACE THIS CODEBASE SPLICES A NAME INTO SQL
   A JSONB key cannot be a bind parameter, so value_field is interpolated as
   custom_data->>'<field>'. safeValueField() first matches it against THIS
   workspace's own deal_fields and returns null for anything else — that check
   is the only thing between this file and SQL injection. Never bypass it, and
   do not add a second interpolation. The period keys in /trend are likewise
   looked up in a fixed PERIODS map, never taken from the query string.

   HONEST LIMITS, by design: only "new deals" and "average deal size" are
   compared across time, because created_at is the only date a deal carries.
   Won/lost/open are current-stage snapshots, so they cannot be trended until
   a deal records when it closed.

   LAYOUT IS PER USER (users.analytics_layout) and merged with the JSONB ||
   operator, so PATCH /layout only overwrites the keys you send — and silently
   DROPS keys it does not know (which is why guide.js's guide_seen never
   persists).

   ENDPOINTS
     GET   /summary?months=3|6|12&pipeline_id=
     GET   /trend?period=week|month|year
     PATCH /layout      per user
     PATCH /config      per workspace
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// The window the KPI deltas compare. Only 3, 6 and 12 are offered (the reference's ranges);
// anything else falls back to 6 so a hand-written query string can never reach SQL.
const ALLOWED_MONTHS = [3, 6, 12];
function monthsOf(q) { const n = parseInt(q, 10); return ALLOWED_MONTHS.includes(n) ? n : 6; }

// analytics_config.value_field names the column the money metrics add up, and it is spliced
// into SQL (a JSONB key cannot be a bind parameter). So it is only ever used after being
// matched against this workspace's own deal fields — anything else is treated as unset.
async function dealFieldKeys(wid) {
  const { rows } = await pool.query('SELECT field_key FROM deal_fields WHERE workspace_id=$1', [wid]);
  return rows.map(r => r.field_key);
}
function safeValueField(field, keys) {
  if (!field) return null;
  return field === 'value' || keys.includes(field) ? field : null;
}

router.get('/summary', async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const months = monthsOf(req.query.months);

    const { rows: [ws] } = await pool.query(
      'SELECT analytics_config FROM workspaces WHERE id=$1', [wid]
    );
    const config     = ws?.analytics_config || {};
    const wonIds     = (config.won_stage_ids  || []).map(Number);
    const lostIds    = (config.lost_stage_ids || []).map(Number);
    const valueField = safeValueField(config.value_field, await dealFieldKeys(wid));

    const { rows: [{ total_contacts }] } = await pool.query(
      `SELECT COUNT(*) AS total_contacts FROM contacts WHERE workspace_id=$1`, [wid]
    );
    const { rows: [{ new_contacts }] } = await pool.query(
      `SELECT COUNT(*) AS new_contacts FROM contacts WHERE workspace_id=$1 AND created_at >= date_trunc('month', NOW())`, [wid]
    );

    let valExpr = 'NULL::numeric';
    if (valueField === 'value') {
      valExpr = 'value';
    } else if (valueField) {
      valExpr = `(custom_data->>'${valueField}')::numeric`;
    }

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

    // Deals created in the window, and in the window before it. created_at is the only date a
    // deal carries, so these two are the only metrics that can honestly be compared over time —
    // won/lost/open are current-stage snapshots until a deal records when it was closed.
    const { rows: [{ new_deals }] } = await pool.query(
      `SELECT COUNT(*) AS new_deals FROM deals
       WHERE workspace_id=$1 AND created_at >= NOW() - ($2 || ' months')::interval`, [wid, months]
    );
    const { rows: [{ prev_new_deals }] } = await pool.query(
      `SELECT COUNT(*) AS prev_new_deals FROM deals
       WHERE workspace_id=$1 AND created_at >= NOW() - ($2 || ' months')::interval
                            AND created_at <  NOW() - ($3 || ' months')::interval`, [wid, months * 2, months]
    );

    let avg_value = null, avg_deal_size = null, prev_avg_deal_size = null, cohort_deals = 0;
    if (valueField) {
      const { rows: [{ av }] } = await pool.query(
        `SELECT AVG(${valExpr}) AS av FROM deals WHERE workspace_id=$1 AND ${valExpr} IS NOT NULL`, [wid]
      );
      avg_value = av ? parseFloat(av) : null;
      const { rows: [cur] } = await pool.query(
        `SELECT AVG(${valExpr}) AS avg_deal_size, COUNT(*) AS n FROM deals
         WHERE workspace_id=$1 AND ${valExpr} IS NOT NULL AND created_at >= NOW() - ($2 || ' months')::interval`, [wid, months]
      );
      avg_deal_size = cur.avg_deal_size ? parseFloat(cur.avg_deal_size) : null;
      cohort_deals  = parseInt(cur.n) || 0;
      const { rows: [prev] } = await pool.query(
        `SELECT AVG(${valExpr}) AS prev_avg_deal_size FROM deals
         WHERE workspace_id=$1 AND ${valExpr} IS NOT NULL
           AND created_at >= NOW() - ($2 || ' months')::interval
           AND created_at <  NOW() - ($3 || ' months')::interval`, [wid, months * 2, months]
      );
      prev_avg_deal_size = prev.prev_avg_deal_size ? parseFloat(prev.prev_avg_deal_size) : null;
    }

    const { rows: [tk] } = await pool.query(
      `SELECT
         COUNT(*)                                                        AS total_tasks,
         COUNT(*) FILTER (WHERE status='done')                          AS done_tasks,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done')  AS overdue_tasks
       FROM tasks WHERE workspace_id=$1`, [wid]
    );

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

    // The reference's "Deals by owner": every member of the workspace, including anyone with
    // nothing in the window, counted over the deals they own that were created in it.
    const { rows: ownerRows } = await pool.query(
      `SELECT u.id, u.name,
              COUNT(d.id)                                                        AS cnt,
              COUNT(d.id) FILTER (WHERE d.stage_id = ANY($2::int[]))             AS won_count,
              COUNT(d.id) FILTER (WHERE d.stage_id = ANY($3::int[]))             AS lost_count,
              COALESCE(SUM(${pipelineValExpr}),0)                                AS val
       FROM user_workspaces uw
       JOIN users u ON u.id = uw.user_id
       LEFT JOIN deals d ON d.assigned_to = u.id AND d.workspace_id = uw.workspace_id
            AND d.created_at >= NOW() - ($4 || ' months')::interval
       WHERE uw.workspace_id = $1
       GROUP BY u.id, u.name
       ORDER BY cnt DESC, u.name ASC`, [wid, wonIds, lostIds, months]
    );
    const by_owner = ownerRows.map(r => {
      const deals = parseInt(r.cnt) || 0, won = parseInt(r.won_count) || 0, lost = parseInt(r.lost_count) || 0;
      return { id: r.id, name: r.name, deals, open: deals - won - lost, won, lost, value: parseFloat(r.val) || 0 };
    });

    const { rows: all_stages } = await pool.query(
      `SELECT ps.id, ps.name, ps.color, p.id AS pipeline_id, p.name AS pipeline_name
       FROM pipeline_stages ps
       JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE ps.workspace_id=$1
       ORDER BY p.position, ps.position`, [wid]
    );

    const { rows: deal_fields } = await pool.query(
      `SELECT field_key, name, type FROM deal_fields WHERE workspace_id=$1 ORDER BY position`, [wid]
    );

    // The reference's "Top open deals": the largest deals still in play. Probability and
    // expected close (its other two columns) have no column on this app's deals.
    const closedIds = [...wonIds, ...lostIds];
    const { rows: topRows } = await pool.query(
      `SELECT d.id, d.title, ${valExpr} AS val,
              c.name AS contact_name, c.company AS contact_company,
              ps.name AS stage_name, ps.color AS stage_color,
              u.name  AS assigned_to_name
       FROM deals d
       LEFT JOIN contacts        c  ON c.id  = d.contact_id
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       LEFT JOIN users           u  ON u.id  = d.assigned_to
       WHERE d.workspace_id = $1
         AND (d.stage_id IS NULL OR NOT (d.stage_id = ANY($2::int[])))
       ORDER BY val DESC NULLS LAST, d.created_at DESC
       LIMIT 8`, [wid, closedIds]
    );
    const top_open_deals = topRows.map(r => ({
      id: r.id, title: r.title,
      value: r.val == null ? null : parseFloat(r.val),
      contact_name: r.contact_name, contact_company: r.contact_company,
      stage_name: r.stage_name, stage_color: r.stage_color,
      assigned_to_name: r.assigned_to_name,
    }));

    // The reference's "Win rate per month". It charts win rate by *close* month; this app has
    // no closed-at timestamp on a deal, so the honest equivalent is the creation cohort: of the
    // deals created in month M, what share of the ones that have since been decided were won.
    // Months with nothing decided report null rather than a misleading 0 %.
    const { rows: rateRows } = await pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM')       AS ym,
              COUNT(*)                                                  AS created,
              COUNT(*) FILTER (WHERE stage_id = ANY($2::int[]))         AS won,
              COUNT(*) FILTER (WHERE stage_id = ANY($3::int[]))         AS lost
       FROM deals
       WHERE workspace_id=$1
         AND created_at >= date_trunc('month', NOW() - (($4::int - 1) || ' months')::interval)
       GROUP BY 1 ORDER BY 1`, [wid, wonIds, lostIds, months]
    );
    const rateBy = new Map(rateRows.map(r => [r.ym, r]));
    const nowMonth = new Date();
    const win_rate_trend = [];
    for (let k = months - 1; k >= 0; k--) {
      const dt = new Date(nowMonth.getFullYear(), nowMonth.getMonth() - k, 1);
      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const row = rateBy.get(ym);
      const won = parseInt(row?.won) || 0, lost = parseInt(row?.lost) || 0, decided = won + lost;
      win_rate_trend.push({
        ym, created: parseInt(row?.created) || 0, won, lost, decided,
        rate: decided ? Math.round(won / decided * 100) : null,
      });
    }

    // The reference's pipeline funnel. It is per-pipeline by nature (stage sets differ), so it
    // is scoped to one: ?pipeline_id=, else the first pipeline. "Reached" is a suffix of the
    // stage order — a deal sitting in Proposal must have passed New — with lost deals counted
    // at the top of the funnel, the way the reference does it. In-stage counts and values are
    // where deals sit *now*, not windowed. The reference also shows a per-stage probability;
    // this app has no such column, so that line is left out.
    const askedPipe = parseInt(req.query.pipeline_id, 10);
    const { rows: [pipe] } = Number.isInteger(askedPipe)
      ? await pool.query('SELECT id, name FROM pipelines WHERE workspace_id=$1 AND id=$2 LIMIT 1', [wid, askedPipe])
      : await pool.query('SELECT id, name FROM pipelines WHERE workspace_id=$1 ORDER BY position LIMIT 1', [wid]);
    const funnelPipeId = Number.isInteger(askedPipe) ? askedPipe : (pipe?.id ?? null);
    let funnel = { pipeline_id: funnelPipeId, pipeline_name: pipe?.name ?? null, rows: [], lost: null };
    if (funnelPipeId != null) {
      const { rows: fnStages } = await pool.query(
        `SELECT id, name, color FROM pipeline_stages
         WHERE workspace_id=$1 AND pipeline_id=$2 ORDER BY position`, [wid, funnelPipeId]
      );
      const { rows: fnCohort } = await pool.query(
        `SELECT stage_id, COUNT(*) AS cnt, COALESCE(SUM(${valExpr}),0) AS val
         FROM deals
         WHERE workspace_id=$1 AND pipeline_id=$2
           AND created_at >= NOW() - ($3 || ' months')::interval
         GROUP BY stage_id`, [wid, funnelPipeId, months]
      );
      const { rows: fnNow } = await pool.query(
        `SELECT d.stage_id, COUNT(*) AS cnt, COALESCE(SUM(${pipelineValExpr}),0) AS val
         FROM deals d
         WHERE d.workspace_id=$1 AND d.pipeline_id=$2
         GROUP BY d.stage_id`, [wid, funnelPipeId]
      );
      const cohortCnt = new Map(fnCohort.map(r => [Number(r.stage_id), parseInt(r.cnt) || 0]));
      const nowAt     = new Map(fnNow.map(r => [Number(r.stage_id), r]));
      const lostSet   = new Set(lostIds);
      const lostStages = fnStages.filter(s2 => lostSet.has(Number(s2.id)));
      const openStages = fnStages.filter(s2 => !lostSet.has(Number(s2.id)));
      funnel.rows = openStages.map((s2, i) => {
        const here = nowAt.get(Number(s2.id));
        return {
          id: s2.id, name: s2.name, color: s2.color,
          reached: openStages.slice(i).reduce((n, st) => n + (cohortCnt.get(Number(st.id)) || 0), 0)
                   + (i === 0 ? lostStages.reduce((n, st) => n + (cohortCnt.get(Number(st.id)) || 0), 0) : 0),
          in_stage: parseInt(here?.cnt) || 0,
          value: parseFloat(here?.val) || 0,
        };
      });
      if (lostStages.length) {
        funnel.lost = {
          name: lostStages.length === 1 ? lostStages[0].name : 'Lost',
          color: lostStages[0].color,
          deals: lostStages.reduce((n, st) => n + (cohortCnt.get(Number(st.id)) || 0), 0),
          value: lostStages.reduce((n, st) => n + (parseFloat(fnCohort.find(r => Number(r.stage_id) === Number(st.id))?.val) || 0), 0),
          base: funnel.rows[0]?.reached || 0,
        };
      }
    }

    const { rows: [usr] } = await pool.query(
      'SELECT analytics_layout FROM users WHERE id=$1', [req.userId]
    );
    const layout = usr?.analytics_layout || {};

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
      prev_new_deals: parseInt(prev_new_deals),
      avg_deal_size, prev_avg_deal_size, cohort_deals,
      period: { months, from: new Date(Date.now() - months * 30.44 * 864e5).toISOString(), to: new Date().toISOString() },
      total_tasks:    parseInt(tk.total_tasks),
      done_tasks:     parseInt(tk.done_tasks),
      overdue_tasks:  parseInt(tk.overdue_tasks),
      top_open_deals,
      by_owner,
      funnel,
      win_rate_trend,
      by_pipeline,
      all_stages,
      deal_fields,
      config,
      layout,
    });
  } catch (err) { next(err); }
});

router.patch('/layout', async (req, res, next) => {
  try {
    const { stat_card_order, hidden_stat_cards, section_order, trend_config } = req.body;
    const patch = {};
    if (stat_card_order  !== undefined) patch.stat_card_order  = stat_card_order;
    if (hidden_stat_cards !== undefined) patch.hidden_stat_cards = hidden_stat_cards;
    if (section_order    !== undefined) patch.section_order    = section_order;
    if (trend_config     !== undefined) patch.trend_config     = trend_config;
    await pool.query(
      `UPDATE users SET analytics_layout = analytics_layout || $1::jsonb WHERE id=$2`,
      [JSON.stringify(patch), req.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

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
    const valueField = safeValueField(config.value_field, await dealFieldKeys(wid));

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

router.patch('/config', async (req, res, next) => {
  try {
    const { won_stage_ids = [], lost_stage_ids = [], value_field = null } = req.body;
    if (value_field && !safeValueField(value_field, await dealFieldKeys(req.workspaceId))) {
      return res.status(400).json({ error: 'Unknown value field for this workspace' });
    }
    await pool.query(
      `UPDATE workspaces SET analytics_config = analytics_config || $1::jsonb WHERE id=$2`,
      [JSON.stringify({ won_stage_ids, lost_stage_ids, value_field }), req.workspaceId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
