const { pool } = require('../db');

const VALID_TYPES = ['text','email','phone','number','dropdown','date','url'];

function createFieldRouter(tableName) {
  const express = require('express');
  const router = express.Router();
  const requireAuth = require('./auth');

  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${tableName} WHERE workspace_id=$1 ORDER BY position ASC, id ASC`,
        [req.workspaceId]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { name, field_key, type, options } = req.body;
      if (!name || !field_key) return res.status(400).json({ error: 'Name and key required' });
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
      const { rows: [{ m }] } = await pool.query(
        `SELECT COALESCE(MAX(position),-1) AS m FROM ${tableName} WHERE workspace_id=$1`,
        [req.workspaceId]
      );
      const { rows: [row] } = await pool.query(
        `INSERT INTO ${tableName} (workspace_id,name,field_key,type,options,position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.workspaceId, name, field_key, type, JSON.stringify(options||[]), m + 1]
      );
      res.status(201).json({ id: row.id });
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'Field key already exists' });
      next(e);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const { name, field_key, type, options } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      if (type && !VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
      const setClauses = [];
      const params = [];
      let paramIdx = 1;
      if (name) { setClauses.push(`name=$${paramIdx++}`); params.push(name); }
      if (field_key) { setClauses.push(`field_key=$${paramIdx++}`); params.push(field_key); }
      if (type) { setClauses.push(`type=$${paramIdx++}`); params.push(type); }
      if (options) { setClauses.push(`options=$${paramIdx++}`); params.push(JSON.stringify(options)); }
      params.push(req.params.id, req.workspaceId);
      const result = await pool.query(
        `UPDATE ${tableName} SET ${setClauses.join(',')} WHERE id=$${paramIdx} AND workspace_id=$${paramIdx+1}`,
        params
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await pool.query(
        `DELETE FROM ${tableName} WHERE id=$1 AND workspace_id=$2`,
        [req.params.id, req.workspaceId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { createFieldRouter };
