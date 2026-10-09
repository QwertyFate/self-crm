/* ═══════════════════════════════════════════════════════════════════════════
   /api/contacts — contacts AND suppliers, plus the CSV import.

   ONE TABLE, TWO RECORD TYPES. contact_type is 'contact' or 'supplier';
   the UI shows them as two pages but everything here is shared. Filter with
   ?contact_type= and remember that PUT COALESCEs the column, so omitting it
   does not silently turn a supplier into a contact.

   CUSTOM FIELDS live in contacts.custom_data (JSONB), keyed by the field_key
   of a row in custom_fields. No schema change per field — see
   middleware/field-crud.js.

   THE LIST QUERY also computes last_activity_at as a correlated MAX over
   activities, which is what the "Last contact" filter on the Contacts page
   sorts by.

   POST /import IS THE INTERESTING ONE. The browser parses the CSV and posts
   the whole thing as one JSON array, so:
     - server.js gives THIS ROUTE ALONE a 10 MB body limit; over that the
       error handler turns body-parser's entity.too.large into a 413.
     - everything happens in ONE transaction: create any new custom fields,
       then per row upsert the contact BY EMAIL (update when it exists, insert
       when it does not), then optionally create a deal.
     - a row with no name is skipped; a row with no email can never match an
       existing contact, so it always inserts.
     - when deals are requested with no stage, it falls back to the pipeline's
       FIRST stage — the same rule as the inbound webhook. Change one, change
       both.

   ENDPOINTS
     GET    /?contact_type=&contact_id=    list (+ assignee, + last activity)
     POST   /import                        bulk upsert, see above
     GET    /:id                           one contact + its activities
     POST   /                              409 on a duplicate email
     PUT    /:id · DELETE /:id
     POST   /bulk/delete                   { contactIds: [...] }
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');
const engine      = require('../utils/engine');
const { masterDataChanges } = require('../utils/kunde');

router.use(requireAuth);

// Tell the Upgrads Engine about a new client (kunde.angelegt) or changed master data
// (kunde.aktualisiert). Fire-and-forget: the dispatcher checks the workspace's Engine
// settings and the contact type itself and never throws into the request. The CSV
// import deliberately does not fire (it re-imports existing customers in bulk).
function fireContactCreated(req, contactId) {
  engine.dispatchContactCreated({ workspaceId: req.workspaceId, contactId: Number(contactId) }).catch(() => {});
}
function fireContactUpdated(req, contactId, changed) {
  engine.dispatchContactUpdated({ workspaceId: req.workspaceId, contactId: Number(contactId), changed }).catch(() => {});
}

router.get('/', async (req, res, next) => {
  try {
    const { contact_id, contact_type } = req.query;
    const params = [req.workspaceId];
    let filter = '';
    if (contact_type) { params.push(contact_type); filter += ` AND c.contact_type = $${params.length}`; }
    if (contact_id)   { params.push(contact_id);   filter += ` AND c.id = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT c.*,
             u.name AS assigned_to_name, u.email AS assigned_to_email,
             (SELECT MAX(a.created_at) FROM activities a WHERE a.contact_id = c.id) AS last_activity_at
      FROM contacts c
      LEFT JOIN users  u ON u.id = c.assigned_to
      WHERE c.workspace_id = $1 ${filter}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/import', async (req, res, next) => {
  try {
    const { contacts: rows, newFields, createDealsForNew, createDealsForUpdated, pipelineId, stageId, defaultAssigneeId } = req.body;
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
      let dealsCreated = 0;

      let defaultStageId = stageId;
      if ((createDealsForNew || createDealsForUpdated) && pipelineId && !stageId) {
        const { rows: [firstStage] } = await client.query(
          'SELECT id FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position ASC LIMIT 1',
          [pipelineId]
        );
        defaultStageId = firstStage?.id || null;
      }

      for (const row of rows) {
        if (!row.name?.trim()) continue;

        let contactId;
        let isNew = true;
        if (row.email) {
          const { rows: [existing] } = await client.query(
            'SELECT id FROM contacts WHERE workspace_id=$1 AND email=$2',
            [req.workspaceId, row.email.toLowerCase().trim()]
          );

          if (existing) {
            await client.query(
              'UPDATE contacts SET name=$1, phone=$2, company=$3, assigned_to=$4, custom_data=$5, updated_at=NOW() WHERE id=$6 AND workspace_id=$7',
              [row.name.trim(), row.phone||null, row.company||null,
               row.assigned_to||req.userId, JSON.stringify(row.custom_data||{}), existing.id, req.workspaceId]
            );
            contactId = existing.id;
            isNew = false;
            count++;
          } else {
            const assignedTo = defaultAssigneeId || req.userId;
            const { rows: [newContact] } = await client.query(
              'INSERT INTO contacts (workspace_id, name, email, phone, company, assigned_to, custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
              [req.workspaceId, row.name.trim(), row.email.toLowerCase().trim(),
               row.phone||null, row.company||null, assignedTo, JSON.stringify(row.custom_data||{})]
            );
            contactId = newContact.id;
            isNew = true;
            count++;
          }
        } else {
          const assignedTo = defaultAssigneeId || req.userId;
          const { rows: [newContact] } = await client.query(
            'INSERT INTO contacts (workspace_id, name, email, phone, company, assigned_to, custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [req.workspaceId, row.name.trim(), null,
             row.phone||null, row.company||null, assignedTo, JSON.stringify(row.custom_data||{})]
          );
          contactId = newContact.id;
          isNew = true;
          count++;
        }

        const shouldCreateDeal = (isNew && createDealsForNew) || (!isNew && createDealsForUpdated);
        if (shouldCreateDeal && pipelineId && contactId) {
          await client.query(
            'INSERT INTO deals (workspace_id, contact_id, pipeline_id, stage_id, title) VALUES ($1,$2,$3,$4,$5)',
            [req.workspaceId, contactId, pipelineId, defaultStageId || null, row.name.trim()]
          );
          dealsCreated++;
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ imported: count, deals_created: dealsCreated });
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
      SELECT c.*,
             u.name AS assigned_to_name, u.email AS assigned_to_email
      FROM contacts c
      LEFT JOIN users  u ON u.id = c.assigned_to
      WHERE c.id = $1 AND c.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!contact) return res.status(404).json({ error: 'Not found' });

    const { rows: activities } = await pool.query(`
      SELECT a.id, a.workspace_id, a.contact_id, a.type, a.content, a.created_by, a.created_at,
             a.completed, a.source,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             a.deal_id, db.title AS deal_title,
             COALESCE(u.name, CASE WHEN a.source = 'engine' THEN 'Upgrads Engine' END) AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN users u ON u.id = a.created_by
      LEFT JOIN deals db ON db.id = a.deal_id
      WHERE a.contact_id = $1 AND a.workspace_id = $2
      ORDER BY a.created_at DESC
    `, [req.params.id, req.workspaceId]);

    res.json({ ...contact, activities });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, company, assigned_to, custom_data, contact_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const assignee = assigned_to ? Number(assigned_to) : req.userId;
    const type = contact_type || 'contact';

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const { rows: [existing] } = await pool.query(
        'SELECT id FROM contacts WHERE workspace_id=$1 AND email=$2',
        [req.workspaceId, normalizedEmail]
      );
      if (existing) return res.status(409).json({ error: 'Contact with this email already exists in this workspace' });
    }

    const { rows: [row] } = await pool.query(
      'INSERT INTO contacts (workspace_id, name, email, phone, company, assigned_to, custom_data, contact_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [req.workspaceId, name, email ? email.toLowerCase().trim() : null, phone||null, company||null, assignee, JSON.stringify(custom_data||{}), type]
    );
    notify(req.workspaceId, req.userId, {
      type: 'contact_created', category: 'contacts',
      title: `New ${type} added: ${name}`,
      body: company ? `Company: ${company}` : null,
      entityType: 'contact', entityId: row.id,
    });
    fireContactCreated(req, row.id);
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, company, assigned_to, custom_data, contact_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    // Pre-read (scoped) so the Engine can be told WHAT changed; also a clean 404 before any write.
    const { rows: [before] } = await pool.query(
      'SELECT name, email, phone, company, contact_type FROM contacts WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspaceId]
    );
    if (!before) return res.status(404).json({ error: 'Not found' });
    // The master data as written (assigned_to and custom_data are not master data to the Engine).
    const after   = { name, email: email||null, phone: phone||null, company: company||null, contact_type: contact_type || before.contact_type };
    const changed = masterDataChanges(before, after);
    // akte_version counts master-data changes from every side (briefing §5.4 "detect concurrent
    // changes"): a CRM edit bumps it too, so the Engine's next precondition fails and it re-reads.
    const result = await pool.query(
      'UPDATE contacts SET name=$1, email=$2, phone=$3, company=$4, assigned_to=$5, custom_data=$6, contact_type=COALESCE($7,contact_type), akte_version=akte_version+$10::int, updated_at=NOW() WHERE id=$8 AND workspace_id=$9',
      [name, email||null, phone||null, company||null, assigned_to||null, JSON.stringify(custom_data||{}), contact_type||null, req.params.id, req.workspaceId, changed.length ? 1 : 0]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    if (before.contact_type !== 'contact' && after.contact_type === 'contact') fireContactCreated(req, req.params.id);   // a supplier became a client: new to the Engine
    else if (changed.length) fireContactUpdated(req, req.params.id, changed);
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

router.post('/bulk/delete', async (req, res, next) => {
  try {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: 'contactIds array required' });
    }
    const placeholders = contactIds.map((_, i) => `$${i + 2}`).join(',');
    const result = await pool.query(
      `DELETE FROM contacts WHERE id IN (${placeholders}) AND workspace_id=$1`,
      [req.workspaceId, ...contactIds]
    );
    res.json({ deleted: result.rowCount });
  } catch (e) { next(e); }
});

module.exports = router;
