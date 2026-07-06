const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

// ── Authenticated routes ───────────────────────────────────
router.use('/settings', requireAuth);
router.use('/logs',     requireAuth);

// GET /api/integrations/settings — get or create webhook config for workspace
router.get('/settings', async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    let { rows: [wh] } = await pool.query(
      `SELECT w.*, p.name AS pipeline_name, ps.name AS stage_name
       FROM workspace_webhook w
       LEFT JOIN pipelines p ON p.id = w.pipeline_id
       LEFT JOIN pipeline_stages ps ON ps.id = w.stage_id
       WHERE w.workspace_id=$1`, [wid]
    );
    if (!wh) {
      // Auto-create on first access
      const key = crypto.randomBytes(20).toString('hex');
      const { rows: [created] } = await pool.query(
        `INSERT INTO workspace_webhook (workspace_id, webhook_key) VALUES ($1,$2) RETURNING *`,
        [wid, key]
      );
      wh = created;
    }

    // Fetch pipelines + stages for the UI
    const { rows: pipelines } = await pool.query(
      `SELECT id, name FROM pipelines WHERE workspace_id=$1 ORDER BY position`, [wid]
    );
    const { rows: stages } = await pool.query(
      `SELECT ps.id, ps.name, ps.color, p.name AS pipeline_name
       FROM pipeline_stages ps JOIN pipelines p ON p.id=ps.pipeline_id
       WHERE ps.workspace_id=$1 ORDER BY p.position, ps.position`, [wid]
    );

    // Contact custom fields so the UI can build a dynamic field map
    const { rows: contact_fields } = await pool.query(
      `SELECT field_key, name, type FROM custom_fields WHERE workspace_id=$1 ORDER BY position`, [wid]
    );

    res.json({ webhook: wh, pipelines, stages, contact_fields, base_url: process.env.APP_URL || null });
  } catch (err) { next(err); }
});

// PATCH /api/integrations/settings — update config
router.patch('/settings', async (req, res, next) => {
  try {
    const { field_map, create_deal, pipeline_id, stage_id, active } = req.body;
    await pool.query(
      `UPDATE workspace_webhook
       SET field_map=$1, create_deal=$2, pipeline_id=$3, stage_id=$4, active=$5
       WHERE workspace_id=$6`,
      [
        JSON.stringify(field_map || {}),
        create_deal === true,
        pipeline_id || null,
        stage_id    || null,
        active !== false,
        req.workspaceId,
      ]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/integrations/settings/regenerate-key
router.post('/settings/regenerate-key', async (req, res, next) => {
  try {
    const key = crypto.randomBytes(20).toString('hex');
    await pool.query(
      `UPDATE workspace_webhook SET webhook_key=$1 WHERE workspace_id=$2`,
      [key, req.workspaceId]
    );
    res.json({ webhook_key: key });
  } catch (err) { next(err); }
});

// GET /api/integrations/logs — last 50 webhook events
router.get('/logs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.status, l.payload, l.captured, l.error, l.created_at,
              c.name AS contact_name, l.contact_id, l.deal_id
       FROM webhook_logs l
       LEFT JOIN contacts c ON c.id = l.contact_id
       WHERE l.workspace_id=$1
       ORDER BY l.created_at DESC LIMIT 50`,
      [req.workspaceId]
    );
    res.json({ logs: rows });
  } catch (err) { next(err); }
});

// ── Public webhook receiver ────────────────────────────────
// POST /api/webhooks/:key
router.post('/receive/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const { rows: [wh] } = await pool.query(
      `SELECT * FROM workspace_webhook WHERE webhook_key=$1 AND active=true`, [key]
    );
    if (!wh) return res.status(404).json({ error: 'Webhook not found or inactive' });

    const payload   = req.body || {};
    const fieldMap  = wh.field_map || {};
    const wid       = wh.workspace_id;

    // Map incoming fields → contact fields
    function pick(key) {
      if (!key) return null;
      // Support dot notation: "data.email" → payload.data.email
      return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), payload);
    }

    // Build name from mapping (supports "first_name last_name" template)
    let name = pick(fieldMap.name) || '';
    if (!name && (fieldMap.first_name || fieldMap.last_name)) {
      name = [pick(fieldMap.first_name), pick(fieldMap.last_name)].filter(Boolean).join(' ');
    }
    const email   = pick(fieldMap.email)   || null;
    const phone   = pick(fieldMap.phone)   || null;
    const company = pick(fieldMap.company) || null;

    // Reject if both name and email are missing — one is required
    if (!name?.trim() && !email?.trim()) {
      await pool.query(
        `INSERT INTO webhook_logs (workspace_id, status, payload, captured, error) VALUES ($1,'error',$2,$3,$4)`,
        [wid, JSON.stringify(payload), JSON.stringify({ field_map_keys: Object.keys(fieldMap), payload_keys: Object.keys(payload) }),
         'Payload rejected: neither name nor email found. Check your field mapping matches the incoming keys.']
      );
      return res.status(422).json({
        error: 'Payload rejected: the webhook must include at least a name or email. Check your field mapping.',
      });
    }

    // Any field not built-in goes into custom_data
    const BUILTIN = new Set(['name', 'first_name', 'last_name', 'email', 'phone', 'company']);
    const customData = {};
    const skipped    = {};   // for debug logging
    for (const [crmKey, incomingKey] of Object.entries(fieldMap)) {
      if (!BUILTIN.has(crmKey) && incomingKey) {
        const val = pick(incomingKey);
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          customData[crmKey] = String(val);
        } else {
          skipped[crmKey] = `incoming key "${incomingKey}" not found or empty in payload`;
        }
      }
    }

    // Build a summary of what was captured for the log
    const captured = {
      name:    name    || null,
      email:   email   || null,
      phone:   phone   || null,
      company: company || null,
      ...customData,
      _skipped: Object.keys(skipped).length ? skipped : undefined,
    };

    // Check if contact with same email already exists in this workspace
    let contact;
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const { rows: [existing] } = await pool.query(
        `SELECT id, name FROM contacts WHERE workspace_id=$1 AND email=$2`,
        [wid, normalizedEmail]
      );

      if (existing) {
        // Update existing contact
        const { rows: [updated] } = await pool.query(
          `UPDATE contacts SET name=$1, phone=$2, company=$3, custom_data=$4, updated_at=NOW()
           WHERE id=$5 AND workspace_id=$6 RETURNING id, name`,
          [name || existing.name, phone, company, JSON.stringify(customData), existing.id, wid]
        );
        contact = updated;
      } else {
        // Create new contact
        const { rows: [newContact] } = await pool.query(
          `INSERT INTO contacts (workspace_id, name, email, phone, company, contact_type, custom_data)
           VALUES ($1,$2,$3,$4,$5,'contact',$6) RETURNING id, name`,
          [wid, name || email, normalizedEmail, phone, company, JSON.stringify(customData)]
        );
        contact = newContact;
      }
    } else {
      // Create new contact if no email
      const { rows: [newContact] } = await pool.query(
        `INSERT INTO contacts (workspace_id, name, email, phone, company, contact_type, custom_data)
         VALUES ($1,$2,$3,$4,$5,'contact',$6) RETURNING id, name`,
        [wid, name || email, null, phone, company, JSON.stringify(customData)]
      );
      contact = newContact;
    }

    let dealId = null;
    if (wh.create_deal && wh.pipeline_id) {
      const { rows: [deal] } = await pool.query(
        `INSERT INTO deals (workspace_id, contact_id, pipeline_id, stage_id, title)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [wid, contact.id, wh.pipeline_id, wh.stage_id || null, `Lead: ${name || email}`]
      );
      dealId = deal.id;
    }

    await pool.query(
      `INSERT INTO webhook_logs (workspace_id, status, payload, captured, contact_id, deal_id)
       VALUES ($1,'success',$2,$3,$4,$5)`,
      [wid, JSON.stringify(payload), JSON.stringify(captured), contact.id, dealId]
    );

    res.json({ success: true, contact_id: contact.id, deal_id: dealId });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
