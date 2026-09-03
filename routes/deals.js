const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');

router.use(requireAuth);

// Deal urgency: 0 = not set, 1 Low, 2 Medium, 3 High, 4 Very urgent
function clampUrgency(v) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return 0;
  return Math.min(4, Math.max(0, n));
}

router.get('/', async (req, res, next) => {
  try {
    const pipeline_id = parseInt(req.query.pipeline_id) || null;
    const contact_id  = parseInt(req.query.contact_id)  || null;
    const params = [req.workspaceId];
    let filter = '';
    if (pipeline_id) { params.push(pipeline_id); filter += ` AND d.pipeline_id = $${params.length}`; }
    if (contact_id)  { params.push(contact_id);  filter += ` AND d.contact_id  = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT d.*,
             c.name  AS contact_name,  c.email AS contact_email, c.phone AS contact_phone,
             s.name  AS supplier_name_val,
             ps.name AS stage_name,    ps.color AS stage_color,
             u.name  AS assigned_to_name
      FROM deals d
      LEFT JOIN contacts       c  ON c.id  = d.contact_id
      LEFT JOIN contacts       s  ON s.id  = d.supplier_id
      LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
      LEFT JOIN users           u  ON u.id  = d.assigned_to
      WHERE d.workspace_id = $1 ${filter}
      ORDER BY d.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [deal] } = await pool.query(`
      SELECT d.*,
             c.name  AS contact_name,  c.email AS contact_email, c.phone AS contact_phone,
             s.name  AS supplier_name_val,
             ps.name AS stage_name,    ps.color AS stage_color,
             u.name  AS assigned_to_name
      FROM deals d
      LEFT JOIN contacts       c  ON c.id  = d.contact_id
      LEFT JOIN contacts       s  ON s.id  = d.supplier_id
      LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
      LEFT JOIN users           u  ON u.id  = d.assigned_to
      WHERE d.id = $1 AND d.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!deal) return res.status(404).json({ error: 'Not found' });
    const { rows: objects } = await pool.query(
      'SELECT o.id, o.name, o.custom_data FROM deal_objects dobj JOIN objects o ON o.id=dobj.object_id WHERE dobj.deal_id=$1',
      [req.params.id]
    );
    res.json({ ...deal, objects });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { contact_id, supplier_id, pipeline_id, stage_id, title, value, assigned_to, custom_data, urgency } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    if (!pipeline_id)   return res.status(400).json({ error: 'Pipeline required' });
    const assignee = assigned_to ? Number(assigned_to) : req.userId;
    const { rows: [row] } = await pool.query(
      'INSERT INTO deals (workspace_id,contact_id,supplier_id,pipeline_id,stage_id,title,value,assigned_to,urgency,custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [req.workspaceId, contact_id||null, supplier_id||null, pipeline_id, stage_id||null, title.trim(), value||null, assignee, clampUrgency(urgency), JSON.stringify(custom_data||{})]
    );
    notify(req.workspaceId, req.userId, {
      type: 'deal_created', category: 'deals',
      title: `New deal: ${title.trim()}`,
      body: value ? `Value: € ${Number(value).toLocaleString()}` : null,
      entityType: 'deal', entityId: row.id,
    });
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { contact_id, supplier_id, pipeline_id, stage_id, title, value, assigned_to, custom_data, urgency } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const result = await pool.query(
      'UPDATE deals SET contact_id=$1,supplier_id=$2,pipeline_id=$3,stage_id=$4,title=$5,value=$6,assigned_to=$7,urgency=$8,custom_data=$9,updated_at=NOW() WHERE id=$10 AND workspace_id=$11',
      [contact_id||null, supplier_id||null, pipeline_id, stage_id||null, title.trim(), value||null, assigned_to||null, clampUrgency(urgency), JSON.stringify(custom_data||{}), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    notify(req.workspaceId, req.userId, {
      type: 'deal_updated', category: 'deals',
      title: `Deal updated: ${title.trim()}`,
      entityType: 'deal', entityId: Number(req.params.id),
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:id/stage', async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE deals SET stage_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3',
      [req.body.stage_id||null, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const { rows: [deal] } = await pool.query('SELECT title FROM deals WHERE id=$1', [req.params.id]);
    if (deal) notify(req.workspaceId, req.userId, {
      type: 'deal_stage_changed', category: 'deals',
      title: `Deal stage changed: ${deal.title}`,
      entityType: 'deal', entityId: Number(req.params.id),
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// PATCH /:id/urgency — quick update from the kanban card shortcut
router.patch('/:id/urgency', async (req, res, next) => {
  try {
    const urgency = clampUrgency(req.body.urgency);
    const result = await pool.query(
      'UPDATE deals SET urgency=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3',
      [urgency, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, urgency });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM deals WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Link / unlink objects from deal side
router.get('/:id/objects', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT o.* FROM deal_objects dobj JOIN objects o ON o.id=dobj.object_id WHERE dobj.deal_id=$1',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:id/objects', async (req, res, next) => {
  try {
    const { object_id } = req.body;
    if (!object_id) return res.status(400).json({ error: 'object_id required' });
    await pool.query(
      'INSERT INTO deal_objects (deal_id, object_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, object_id]
    );
    res.status(201).json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id/objects/:objectId', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM deal_objects WHERE deal_id=$1 AND object_id=$2',
      [req.params.id, req.params.objectId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
