/* ═══════════════════════════════════════════════════════════════════════════
   /api/integrations — INBOUND leads. (Outbound lives in routes/engine.js.)

   THE PUBLIC ENDPOINT  POST /receive/:key is the only route in this app that
   anyone on the internet may call. It is NOT behind requireAuth — the secret
   key in the URL identifies the workspace — which is why server.js rate limits
   it twice, per IP and per key. Note the selective guard at the top of this
   file: requireAuth is applied to /settings and /logs only.

   WHAT A DELIVERY DOES
     1. look up workspace_webhook by key, must be active        → 404 otherwise
     2. map the payload through field_map. Values may be nested: a mapping of
        "data.contact.email" is resolved by pick() walking dot segments.
        first_name + last_name are joined when there is no single name field.
     3. reject with 422 when neither a name nor an email could be mapped, and
        log WHY — the log row records which keys the map wanted and which keys
        the payload actually had, which is the first thing to look at when
        someone says "my form is not coming through".
     4. anything mapped that is not a built-in field becomes custom_data;
        what could not be found is recorded under captured._skipped.
     5. upsert the contact BY EMAIL; with no email it always inserts.
     6. optionally create a deal — with no configured stage it falls back to
        the pipeline's FIRST stage, the same rule as the CSV import.
     7. always write a webhook_logs row, success or failure.

   GET /settings CREATES the workspace_webhook row and its key on first view,
   and returns the pipelines, stages, custom fields and members the mapping UI
   needs in one response.

   ⚠ /settings and /settings/regenerate-key are MEMBER level — any member can
     repoint or rotate the inbound webhook. The equivalent Engine routes
     require owner/admin. See §8 of readmedev.md.

   ENDPOINTS
     GET   /settings · PATCH /settings · POST /settings/regenerate-key
     GET   /logs                       last 50 deliveries
     POST  /receive/:key               PUBLIC
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const engine      = require('../utils/engine');            // "a lead comes in" → kunde.angelegt / kunde.aktualisiert
const { masterDataChanges } = require('../utils/kunde');

router.use('/settings', requireAuth);
router.use('/logs',     requireAuth);

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
      const key = crypto.randomBytes(20).toString('hex');
      const { rows: [created] } = await pool.query(
        `INSERT INTO workspace_webhook (workspace_id, webhook_key) VALUES ($1,$2) RETURNING *`,
        [wid, key]
      );
      wh = created;
    }

    const { rows: pipelines } = await pool.query(
      `SELECT id, name FROM pipelines WHERE workspace_id=$1 ORDER BY position`, [wid]
    );
    const { rows: stages } = await pool.query(
      `SELECT ps.id, ps.name, ps.color, p.name AS pipeline_name
       FROM pipeline_stages ps JOIN pipelines p ON p.id=ps.pipeline_id
       WHERE ps.workspace_id=$1 ORDER BY p.position, ps.position`, [wid]
    );

    const { rows: contact_fields } = await pool.query(
      `SELECT field_key, name, type FROM custom_fields WHERE workspace_id=$1 ORDER BY position`, [wid]
    );

    const { rows: members } = await pool.query(
      `SELECT DISTINCT u.id, u.name FROM users u
       JOIN user_workspaces uw ON uw.user_id = u.id
       WHERE uw.workspace_id=$1 ORDER BY u.name`, [wid]
    );

    res.json({ webhook: wh, pipelines, stages, contact_fields, members, base_url: process.env.APP_URL || null });
  } catch (err) { next(err); }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const { field_map, create_deal, pipeline_id, stage_id, default_assignee_id, active } = req.body;
    await pool.query(
      `UPDATE workspace_webhook
       SET field_map=$1, create_deal=$2, pipeline_id=$3, stage_id=$4, default_assignee_id=$5, active=$6
       WHERE workspace_id=$7`,
      [
        JSON.stringify(field_map || {}),
        create_deal === true,
        pipeline_id || null,
        stage_id    || null,
        default_assignee_id || null,
        active !== false,
        req.workspaceId,
      ]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

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

    function pick(key) {
      if (!key) return null;
      return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), payload);
    }

    let name = pick(fieldMap.name) || '';
    if (!name && (fieldMap.first_name || fieldMap.last_name)) {
      name = [pick(fieldMap.first_name), pick(fieldMap.last_name)].filter(Boolean).join(' ');
    }
    const email   = pick(fieldMap.email)   || null;
    const phone   = pick(fieldMap.phone)   || null;
    const company = pick(fieldMap.company) || null;

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

    const BUILTIN = new Set(['name', 'first_name', 'last_name', 'email', 'phone', 'company']);
    const customData = {};
    const skipped    = {};
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

    const captured = {
      name:    name    || null,
      email:   email   || null,
      phone:   phone   || null,
      company: company || null,
      ...customData,
      _skipped: Object.keys(skipped).length ? skipped : undefined,
    };

    let contact;
    const defaultAssigneeId = wh.default_assignee_id || null;

    // The Upgrads Engine hears about every lead: a new contact → kunde.angelegt, a known
    // email whose master data changed → kunde.aktualisiert (fire-and-forget, after the write).
    const fireEngine = (fn, args) => engine[fn]({ workspaceId: wid, ...args }).catch(() => {});

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const { rows: [existing] } = await pool.query(
        `SELECT id, name, email, phone, company, contact_type FROM contacts WHERE workspace_id=$1 AND email=$2`,
        [wid, normalizedEmail]
      );

      if (existing) {
        const changed = masterDataChanges(existing, { name: name || existing.name, phone, company });
        const { rows: [updated] } = await pool.query(
          `UPDATE contacts SET name=$1, phone=$2, company=$3, custom_data=$4, akte_version=akte_version+$7::int, updated_at=NOW()
           WHERE id=$5 AND workspace_id=$6 RETURNING id, name`,
          [name || existing.name, phone, company, JSON.stringify(customData), existing.id, wid, changed.length ? 1 : 0]
        );
        contact = updated;
        if (changed.length) fireEngine('dispatchContactUpdated', { contactId: existing.id, changed });
      } else {
        const { rows: [newContact] } = await pool.query(
          `INSERT INTO contacts (workspace_id, name, email, phone, company, contact_type, custom_data, assigned_to)
           VALUES ($1,$2,$3,$4,$5,'contact',$6,$7) RETURNING id, name`,
          [wid, name || email, normalizedEmail, phone, company, JSON.stringify(customData), defaultAssigneeId]
        );
        contact = newContact;
        fireEngine('dispatchContactCreated', { contactId: newContact.id });
      }
    } else {
      const { rows: [newContact] } = await pool.query(
        `INSERT INTO contacts (workspace_id, name, email, phone, company, contact_type, custom_data, assigned_to)
         VALUES ($1,$2,$3,$4,$5,'contact',$6,$7) RETURNING id, name`,
        [wid, name || email, null, phone, company, JSON.stringify(customData), defaultAssigneeId]
      );
      contact = newContact;
      fireEngine('dispatchContactCreated', { contactId: newContact.id });
    }

    let dealId = null;
    if (wh.create_deal && wh.pipeline_id) {
      // Auto-created deals always land in a stage: when none is configured (or the
      // saved stage was deleted, the FK is ON DELETE SET NULL) use the pipeline's
      // first one. Mirrors the import route's default-stage lookup.
      let stageId = wh.stage_id || null;
      if (!stageId) {
        const { rows: [firstStage] } = await pool.query(
          'SELECT id FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position ASC LIMIT 1',
          [wh.pipeline_id]
        );
        stageId = firstStage?.id || null;
      }
      const { rows: [deal] } = await pool.query(
        `INSERT INTO deals (workspace_id, contact_id, pipeline_id, stage_id, title)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [wid, contact.id, wh.pipeline_id, stageId, contact.name]
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
