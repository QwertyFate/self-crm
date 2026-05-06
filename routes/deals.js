const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { pipeline_id, contact_id } = req.query;
    const params = [req.workspaceId];
    let filter = '';
    if (pipeline_id) { params.push(pipeline_id); filter += ` AND d.pipeline_id = $${params.length}`; }
    if (contact_id)  { params.push(contact_id);  filter += ` AND d.contact_id  = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT d.*,
             c.name  AS contact_name,  c.email AS contact_email, c.phone AS contact_phone,
             ps.name AS stage_name,    ps.color AS stage_color,
             u.name  AS assigned_to_name
      FROM deals d
      LEFT JOIN contacts       c  ON c.id  = d.contact_id
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
             ps.name AS stage_name,    ps.color AS stage_color,
             u.name  AS assigned_to_name
      FROM deals d
      LEFT JOIN contacts       c  ON c.id  = d.contact_id
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
    const { contact_id, pipeline_id, stage_id, title, value, assigned_to, custom_data } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    if (!pipeline_id)   return res.status(400).json({ error: 'Pipeline required' });
    const assignee = assigned_to ? Number(assigned_to) : req.userId;
    const { rows: [row] } = await pool.query(
      'INSERT INTO deals (workspace_id,contact_id,pipeline_id,stage_id,title,value,assigned_to,custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [req.workspaceId, contact_id||null, pipeline_id, stage_id||null, title.trim(), value||null, assignee, JSON.stringify(custom_data||{})]
    );
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { contact_id, pipeline_id, stage_id, title, value, assigned_to, custom_data } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const result = await pool.query(
      'UPDATE deals SET contact_id=$1,pipeline_id=$2,stage_id=$3,title=$4,value=$5,assigned_to=$6,custom_data=$7,updated_at=NOW() WHERE id=$8 AND workspace_id=$9',
      [contact_id||null, pipeline_id, stage_id||null, title.trim(), value||null, assigned_to||null, JSON.stringify(custom_data||{}), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
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
    res.json({ success: true });
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
