const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, s.name AS stage_name, s.color AS stage_color,
             u.name AS assigned_to_name, u.email AS assigned_to_email
      FROM contacts c
      LEFT JOIN stages s ON s.id = c.stage_id
      LEFT JOIN users  u ON u.id = c.assigned_to
      WHERE c.workspace_id = $1
      ORDER BY c.created_at DESC
    `, [req.workspaceId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/import', async (req, res, next) => {
  try {
    const { contacts: rows, newFields } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'contacts must be an array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (Array.isArray(newFields) && newFields.length) {
        const { rows: [{ m }] } = await client.query(
          'SELECT COALESCE(MAX(position), -1) AS m FROM custom_fields WHERE workspace_id=$1',
          [req.workspaceId]
        );
        for (let i = 0; i < newFields.length; i++) {
          await client.query(
            'INSERT INTO custom_fields (workspace_id, name, field_key, type, options, position) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
            [req.workspaceId, newFields[i].name, newFields[i].field_key, 'text', '[]', m + 1 + i]
          );
        }
      }

      let count = 0;
      for (const row of rows) {
        if (!row.name?.trim()) continue;
        await client.query(
          'INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [req.workspaceId, row.name.trim(), row.email||null, row.phone||null,
           row.company||null, row.stage_id||null, req.userId, row.custom_data||{}]
        );
        count++;
      }

      await client.query('COMMIT');
      res.status(201).json({ imported: count });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [contact] } = await pool.query(`
      SELECT c.*, s.name AS stage_name, s.color AS stage_color,
             u.name AS assigned_to_name, u.email AS assigned_to_email
      FROM contacts c
      LEFT JOIN stages s ON s.id = c.stage_id
      LEFT JOIN users  u ON u.id = c.assigned_to
      WHERE c.id = $1 AND c.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!contact) return res.status(404).json({ error: 'Not found' });

    const { rows: activities } = await pool.query(`
      SELECT a.*, u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.contact_id = $1 AND a.workspace_id = $2
      ORDER BY a.created_at DESC
    `, [req.params.id, req.workspaceId]);

    res.json({ ...contact, activities });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, company, stage_id, assigned_to, custom_data } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const assignee = assigned_to ? Number(assigned_to) : req.userId;
    const { rows: [row] } = await pool.query(
      'INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [req.workspaceId, name, email||null, phone||null, company||null, stage_id||null, assignee, custom_data||{}]
    );
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, company, stage_id, assigned_to, custom_data } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query(
      'UPDATE contacts SET name=$1, email=$2, phone=$3, company=$4, stage_id=$5, assigned_to=$6, custom_data=$7, updated_at=NOW() WHERE id=$8 AND workspace_id=$9',
      [name, email||null, phone||null, company||null, stage_id||null, assigned_to||null, custom_data||{}, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:id/stage', async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE contacts SET stage_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3',
      [req.body.stage_id||null, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM contacts WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
