const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Every link endpoint must own BOTH ends: the object in the URL and the
// linked deal/contact. Foreign keys are global, so either id can be another
// workspace's real row. One round trip; `table` is an internal literal
// ('deals' | 'contacts'), never request input. Returns { obj, linked }.
async function ownsLink(workspaceId, objectId, table, linkedId) {
  const { rows: [r] } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM objects WHERE id=$1 AND workspace_id=$3) AS obj,
            EXISTS (SELECT 1 FROM ${table} WHERE id=$2 AND workspace_id=$3) AS linked`,
    [objectId, linkedId, workspaceId]
  );
  return r;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM objects WHERE workspace_id=$1 ORDER BY created_at DESC',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [obj] } = await pool.query(
      'SELECT * FROM objects WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (!obj) return res.status(404).json({ error: 'Not found' });

    const { rows: deals } = await pool.query(`
      SELECT d.id, d.title, d.value,
             ps.name AS stage_name, ps.color AS stage_color,
             c.name  AS contact_name,
             p.name  AS pipeline_name
      FROM deal_objects dobj
      JOIN deals          d  ON d.id  = dobj.deal_id
      LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id   AND ps.workspace_id = d.workspace_id
      LEFT JOIN contacts        c  ON c.id  = d.contact_id AND c.workspace_id  = d.workspace_id
      LEFT JOIN pipelines       p  ON p.id  = d.pipeline_id AND p.workspace_id = d.workspace_id
      WHERE dobj.object_id = $1 AND d.workspace_id = $2
      ORDER BY d.created_at DESC
    `, [req.params.id, req.workspaceId]);

    const { rows: linkedContacts } = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.company, c.contact_type
       FROM object_contacts oc JOIN contacts c ON c.id = oc.contact_id
       WHERE oc.object_id = $1 AND c.workspace_id = $2
       ORDER BY oc.created_at`,
      [req.params.id, req.workspaceId]
    );
    res.json({ ...obj, deals, contacts: linkedContacts });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, custom_data } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const { rows: [row] } = await pool.query(
      'INSERT INTO objects (workspace_id, name, custom_data) VALUES ($1,$2,$3) RETURNING id',
      [req.workspaceId, name.trim(), JSON.stringify(custom_data || {})]
    );
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, custom_data } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'UPDATE objects SET name=$1, custom_data=$2, updated_at=NOW() WHERE id=$3 AND workspace_id=$4',
      [name.trim(), JSON.stringify(custom_data || {}), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM objects WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/:id/deals', async (req, res, next) => {
  try {
    const { deal_id } = req.body;
    if (!deal_id) return res.status(400).json({ error: 'deal_id required' });
    const own = await ownsLink(req.workspaceId, req.params.id, 'deals', deal_id);
    if (!own.obj)    return res.status(404).json({ error: 'Not found' });
    if (!own.linked) return res.status(404).json({ error: 'Deal not found' });
    await pool.query(
      'INSERT INTO deal_objects (deal_id, object_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [deal_id, req.params.id]
    );
    res.status(201).json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id/deals/:dealId', async (req, res, next) => {
  try {
    const own = await ownsLink(req.workspaceId, req.params.id, 'deals', req.params.dealId);
    if (!own.obj)    return res.status(404).json({ error: 'Not found' });
    if (!own.linked) return res.status(404).json({ error: 'Deal not found' });
    await pool.query(
      'DELETE FROM deal_objects WHERE deal_id=$1 AND object_id=$2',
      [req.params.dealId, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get('/:id/contacts', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.company, c.contact_type
       FROM object_contacts oc JOIN contacts c ON c.id = oc.contact_id
       WHERE oc.object_id = $1 AND c.workspace_id = $2
       ORDER BY oc.created_at`,
      [req.params.id, req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:id/contacts', async (req, res, next) => {
  try {
    const { contact_id } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
    const own = await ownsLink(req.workspaceId, req.params.id, 'contacts', contact_id);
    if (!own.obj)    return res.status(404).json({ error: 'Not found' });
    if (!own.linked) return res.status(404).json({ error: 'Contact not found' });
    await pool.query(
      'INSERT INTO object_contacts (object_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, contact_id]
    );
    res.status(201).json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id/contacts/:contactId', async (req, res, next) => {
  try {
    const own = await ownsLink(req.workspaceId, req.params.id, 'contacts', req.params.contactId);
    if (!own.obj)    return res.status(404).json({ error: 'Not found' });
    if (!own.linked) return res.status(404).json({ error: 'Contact not found' });
    await pool.query(
      'DELETE FROM object_contacts WHERE object_id=$1 AND contact_id=$2',
      [req.params.id, req.params.contactId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
