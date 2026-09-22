const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');
// Cross-workspace reference guard (stages + members prefetch, per-row check).
// Shared with routes/deals.js; see utils/workspace-refs.js.
const { workspaceRefs, refCheck } = require('../utils/workspace-refs');
// Outbound events to the Onboarding Engine are emitted from CRM-user actions
// here — never from routes/engine-api.js, which would loop.
const { emitEngineEvent } = require('../utils/engine-webhook');
const { ONBOARDING_STATUSES } = require('../utils/onboarding-statuses');
// Google Drive folder per contact (public, link-shared): the link/id parser and
// the sync that keeps contact_drive_files in step with the folder (utils/drive-sync.js).
const drive = require('../utils/google-drive');
const { getDriveSync } = require('../utils/drive-sync');
const driveConfigured = () => !!process.env.GOOGLE_API_KEY;

router.use(requireAuth);

class ImportRejected extends Error {
  constructor(message) { super(message); this.status = 400; }
}

router.get('/', async (req, res, next) => {
  try {
    const { contact_id, contact_type } = req.query;
    const params = [req.workspaceId];
    let filter = '';
    if (contact_type) { params.push(contact_type); filter += ` AND c.contact_type = $${params.length}`; }
    if (contact_id)   { params.push(contact_id);   filter += ` AND c.id = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT c.*, s.name AS stage_name, s.color AS stage_color,
             u.name AS assigned_to_name, u.email AS assigned_to_email
      FROM contacts c
      LEFT JOIN stages s ON s.id = c.stage_id    AND s.workspace_id = c.workspace_id
      LEFT JOIN users  u ON u.id = c.assigned_to AND u.workspace_id = c.workspace_id
      WHERE c.workspace_id = $1 ${filter}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Import: same rows, same columns, same values as the original per-row loop —
// but batched, so a 1000-row file costs ~13 round trips instead of 1000–3000
// and does not pin one of the pool's connections for the duration.
const MAX_IMPORT_ROWS = 2000;
const IMPORT_CHUNK    = 500;

// pg error codes raised by the SET LOCAL limits inside the transaction, mapped
// to a status the client can show. Anything else stays a 500 via next(e).
function importErrorStatus(e) {
  if (e instanceof ImportRejected) return [400, e.message];                          // a foreign reference
  if (e?.code === '57014') return [504, 'Import timed out — try a smaller file.'];   // statement_timeout
  if (e?.code === '55P03') return [503, 'Database busy — please try again.'];        // lock_timeout
  return null;
}

router.post('/import', async (req, res, next) => {
  try {
    const { contacts: rows, newFields, createDealsForNew, createDealsForUpdated, pipelineId, stageId, defaultAssigneeId } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'contacts must be an array' });
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(413).json({ error: `Too many rows. Maximum ${MAX_IMPORT_ROWS} contacts per import.` });
    }

    // ---- Classify (no DB). The loop's own rules: skip nameless rows; email is
    // lowercased and trimmed. Rows whose email appears more than once in this
    // file keep today's exact insert-then-update behaviour by going through the
    // original per-row path at the end; everything else is batched.
    const emailCount = new Map();
    for (const row of rows) {
      if (!row?.name?.trim() || !row.email) continue;
      const e = row.email.toLowerCase().trim();
      emailCount.set(e, (emailCount.get(e) || 0) + 1);
    }
    const batchRows = [], legacyRows = [];
    let skipped = 0;   // rows dropped for having no name — reported, never silent
    for (const row of rows) {
      if (!row?.name?.trim()) { skipped++; continue; }
      const email = row.email ? row.email.toLowerCase().trim() : null;
      if (email && emailCount.get(email) > 1) legacyRows.push(row);
      else batchRows.push({ row, email });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Transaction-scoped limits: SET LOCAL resets on COMMIT/ROLLBACK and can
      // never leak to the next user of this pooled connection.
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '5s'");

      // ---- Every referenced id must belong to this workspace. One prefetch
      // for stages + members; pipeline and stage checked directly. Rejected
      // here, before any write and inside the transaction, so nothing foreign
      // is ever stored. Thrown as ImportRejected -> ROLLBACK -> 400.
      const refs = await workspaceRefs(client, req.workspaceId);
      if ((defaultAssigneeId || null) !== null && !refs.members.has(Number(defaultAssigneeId))) {
        throw new ImportRejected('defaultAssigneeId is not a member of this workspace');
      }
      if (pipelineId) {
        const { rows: [p] } = await client.query(
          'SELECT id FROM pipelines WHERE id=$1 AND workspace_id=$2', [pipelineId, req.workspaceId]
        );
        if (!p) throw new ImportRejected('pipelineId does not belong to this workspace');
        if (stageId) {
          const { rows: [ps] } = await client.query(
            'SELECT id FROM pipeline_stages WHERE id=$1 AND pipeline_id=$2 AND workspace_id=$3',
            [stageId, pipelineId, req.workspaceId]
          );
          if (!ps) throw new ImportRejected('stageId does not belong to this pipeline');
        }
      }
      for (let i = 0; i < rows.length; i++) {
        const bad = rows[i] && refCheck(refs, rows[i]);
        if (bad) throw new ImportRejected(`Row ${i + 1}: ${bad}`);
      }

      if (Array.isArray(newFields) && newFields.length) {
        const { rows: [{ m }] } = await client.query(
          'SELECT COALESCE(MAX(position), -1) AS m FROM custom_fields WHERE workspace_id=$1',
          [req.workspaceId]
        );
        // One statement for all new fields; positions m+1+i exactly as before.
        await client.query(
          `INSERT INTO custom_fields (workspace_id, name, field_key, type, options, position)
           SELECT $1, v.name, v.field_key, 'text', '[]', v.position
           FROM unnest($2::text[], $3::text[], $4::int[]) AS v(name, field_key, position)
           ON CONFLICT DO NOTHING`,
          [req.workspaceId, newFields.map(f => f.name), newFields.map(f => f.field_key), newFields.map((_, i) => m + 1 + i)]
        );
      }

      let count = 0;
      let dealsCreated = 0;
      let created = 0, updated = 0;   // split of `count`, both read back from DB results
      let unmatched = 0;              // rows that produced no DB row (deleted mid-import) — so
                                      // submitted === imported + skipped + unmatched always holds

      let defaultStageId = stageId;
      if ((createDealsForNew || createDealsForUpdated) && pipelineId && !stageId) {
        const { rows: [firstStage] } = await client.query(
          'SELECT id FROM pipeline_stages WHERE pipeline_id=$1 AND workspace_id=$2 ORDER BY position ASC LIMIT 1',
          [pipelineId, req.workspaceId]
        );
        defaultStageId = firstStage?.id || null;
      }

      // ---- One prefetch replaces N per-row email lookups. Same predicate.
      const batchEmails = batchRows.map(b => b.email).filter(Boolean);
      const existingByEmail = new Map();
      if (batchEmails.length) {
        const { rows: found } = await client.query(
          // Case-insensitive on both sides: the incoming array is already
          // lowercased; LOWER() brings the stored value to the same form.
          'SELECT id, email FROM contacts WHERE workspace_id=$1 AND LOWER(email) = ANY($2::text[])',
          [req.workspaceId, batchEmails]
        );
        // Key by the lowercased stored value so the lookup below (by the
        // lowercased incoming value) hits even when the row was saved mixed-case.
        for (const f of found) existingByEmail.set(f.email.toLowerCase(), f.id);
      }

      // ---- Partition. The loop's own decision: email found -> update, else insert.
      const toUpdate = [], toInsert = [];
      for (const b of batchRows) {
        const id = b.email ? existingByEmail.get(b.email) : undefined;
        if (id !== undefined) toUpdate.push({ ...b, id }); else toInsert.push(b);
      }

      // ---- Multi-row writes, chunked. Column lists and value expressions are
      // the per-row statements' own; unnest keeps the parameter count constant.
      const updatedIds = [], insertedIds = [];
      for (let i = 0; i < toUpdate.length; i += IMPORT_CHUNK) {
        const c = toUpdate.slice(i, i + IMPORT_CHUNK);
        // RETURNING tells us which ids actually matched. The prefetch and this
        // write see different snapshots (READ COMMITTED), so a contact deleted
        // in between matches nothing here — it must not be counted or handed
        // to the deals statement.
        const { rows: matched } = await client.query(
          `UPDATE contacts c
             SET name=v.name, phone=v.phone, company=v.company, stage_id=v.stage_id,
                 assigned_to=v.assigned_to, custom_data=v.custom_data, updated_at=NOW()
           FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::jsonb[])
                AS v(id, name, phone, company, stage_id, assigned_to, custom_data)
           WHERE c.id=v.id AND c.workspace_id=$1
           RETURNING c.id`,
          [req.workspaceId,
           c.map(x => x.id),
           c.map(x => x.row.name.trim()),
           c.map(x => x.row.phone||null),
           c.map(x => x.row.company||null),
           c.map(x => x.row.stage_id||null),
           c.map(x => x.row.assigned_to||req.userId),
           c.map(x => JSON.stringify(x.row.custom_data||{}))]
        );
        for (const r of matched) updatedIds.push(r.id);
        count     += matched.length;
        updated   += matched.length;
        unmatched += c.length - matched.length;
      }
      for (let i = 0; i < toInsert.length; i += IMPORT_CHUNK) {
        const c = toInsert.slice(i, i + IMPORT_CHUNK);
        const assignedTo = defaultAssigneeId || req.userId;
        const { rows: inserted } = await client.query(
          `INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data)
           SELECT $1, v.name, v.email, v.phone, v.company, v.stage_id, v.assigned_to, v.custom_data
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::jsonb[])
                AS v(name, email, phone, company, stage_id, assigned_to, custom_data)
           RETURNING id`,
          [req.workspaceId,
           c.map(x => x.row.name.trim()),
           c.map(x => x.email),
           c.map(x => x.row.phone||null),
           c.map(x => x.row.company||null),
           c.map(x => x.row.stage_id||null),
           c.map(() => assignedTo),
           c.map(x => JSON.stringify(x.row.custom_data||{}))]
        );
        for (const r of inserted) insertedIds.push(r.id);
        count     += inserted.length;   // what came back, not what was sent
        created   += inserted.length;
        unmatched += c.length - inserted.length;   // cannot really happen for INSERT … RETURNING; keeps the identity exact
      }

      // ---- Deals in one statement. Title is 'Deal: ' + the trimmed name just
      // written to the contact row; stage is defaultStageId — the per-row
      // statement's own values. No dependence on RETURNING order.
      const dealIds = [
        ...(createDealsForNew     ? insertedIds : []),
        ...(createDealsForUpdated ? updatedIds  : []),
      ];
      if (dealIds.length && pipelineId) {
        const result = await client.query(
          `INSERT INTO deals (workspace_id, contact_id, pipeline_id, stage_id, title)
           SELECT $1, c.id, $2, $3, 'Deal: ' || c.name
           FROM contacts c WHERE c.workspace_id=$1 AND c.id = ANY($4::int[])`,
          [req.workspaceId, pipelineId, defaultStageId || null, dealIds]
        );
        dealsCreated += result.rowCount;
      }

      // ---- In-file duplicate emails: the original per-row path. Its rows were
      // validated by the reference loop above together with the batch rows, so
      // the raw row.stage_id / row.assigned_to reads below are already safe.
      for (const row of legacyRows) {
        let contactId;
        let isNew = true;
        const { rows: [existing] } = await client.query(
          'SELECT id FROM contacts WHERE workspace_id=$1 AND LOWER(email)=$2',
          [req.workspaceId, row.email.toLowerCase().trim()]
        );

        if (existing) {
          const upd = await client.query(
            'UPDATE contacts SET name=$1, phone=$2, company=$3, stage_id=$4, assigned_to=$5, custom_data=$6, updated_at=NOW() WHERE id=$7 AND workspace_id=$8',
            [row.name.trim(), row.phone||null, row.company||null, row.stage_id||null,
             row.assigned_to||req.userId, JSON.stringify(row.custom_data||{}), existing.id, req.workspaceId]
          );
          // Vanished between the lookup and the write: not imported, and the
          // deal block below must not run for it.
          if (upd.rowCount === 0) { unmatched++; continue; }
          contactId = existing.id;
          isNew = false;
          count++; updated++;
        } else {
          const assignedTo = defaultAssigneeId || req.userId;
          const { rows: [newContact] } = await client.query(
            'INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [req.workspaceId, row.name.trim(), row.email.toLowerCase().trim(),
             row.phone||null, row.company||null, row.stage_id||null, assignedTo, JSON.stringify(row.custom_data||{})]
          );
          contactId = newContact.id;
          isNew = true;
          count++; created++;
        }

        const shouldCreateDeal = (isNew && createDealsForNew) || (!isNew && createDealsForUpdated);
        if (shouldCreateDeal && pipelineId && contactId) {
          await client.query(
            'INSERT INTO deals (workspace_id, contact_id, pipeline_id, stage_id, title) VALUES ($1,$2,$3,$4,$5)',
            [req.workspaceId, contactId, pipelineId, defaultStageId || null, `Deal: ${row.name.trim()}`]
          );
          dealsCreated++;
        }
      }

      await client.query('COMMIT');
      // `imported` and `deals_created` are unchanged for the client; the rest
      // are additive. imported === created + updated and
      // submitted === imported + skipped + unmatched always.
      res.status(201).json({ imported: count, deals_created: dealsCreated, created, updated, skipped, unmatched });
    } catch (e) {
      await client.query('ROLLBACK');
      const mapped = importErrorStatus(e);
      if (mapped) return res.status(mapped[0]).json({ error: mapped[1] });
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
      LEFT JOIN stages s ON s.id = c.stage_id    AND s.workspace_id = c.workspace_id
      LEFT JOIN users  u ON u.id = c.assigned_to AND u.workspace_id = c.workspace_id
      WHERE c.id = $1 AND c.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!contact) return res.status(404).json({ error: 'Not found' });

    const { rows: activities } = await pool.query(`
      SELECT a.id, a.workspace_id, a.contact_id, a.type, a.content, a.created_by, a.created_at,
             a.completed,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN users u ON u.id = a.created_by AND u.workspace_id = a.workspace_id
      WHERE a.contact_id = $1 AND a.workspace_id = $2
      ORDER BY a.created_at DESC
    `, [req.params.id, req.workspaceId]);

    res.json({ ...contact, activities });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, company, stage_id, assigned_to, custom_data, contact_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const badRef = refCheck(await workspaceRefs(pool, req.workspaceId), { stage_id, assigned_to });
    if (badRef) return res.status(400).json({ error: badRef });
    const assignee = assigned_to ? Number(assigned_to) : req.userId;
    const type = contact_type || 'contact';

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const { rows: [existing] } = await pool.query(
        'SELECT id FROM contacts WHERE workspace_id=$1 AND LOWER(email)=$2',
        [req.workspaceId, normalizedEmail]
      );
      if (existing) return res.status(409).json({ error: 'Contact with this email already exists in this workspace' });
    }

    const { rows: [row] } = await pool.query(
      'INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data, contact_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [req.workspaceId, name, email ? email.toLowerCase().trim() : null, phone||null, company||null, stage_id||null, assignee, JSON.stringify(custom_data||{}), type]
    );
    notify(req.workspaceId, req.userId, {
      type: 'contact_created', category: 'contacts',
      title: `New ${type} added: ${name}`,
      body: company ? `Company: ${company}` : null,
      entityType: 'contact', entityId: row.id,
    });
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, company, stage_id, assigned_to, custom_data, contact_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const badRef = refCheck(await workspaceRefs(pool, req.workspaceId), { stage_id, assigned_to });
    if (badRef) return res.status(400).json({ error: badRef });
    const result = await pool.query(
      'UPDATE contacts SET name=$1, email=$2, phone=$3, company=$4, stage_id=$5, assigned_to=$6, custom_data=$7, contact_type=COALESCE($8,contact_type), updated_at=NOW() WHERE id=$9 AND workspace_id=$10',
      [name, email ? email.toLowerCase().trim() : null, phone||null, company||null, stage_id||null, assigned_to||null, JSON.stringify(custom_data||{}), contact_type||null, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:id/stage', async (req, res, next) => {
  try {
    const badRef = refCheck(await workspaceRefs(pool, req.workspaceId), { stage_id: req.body.stage_id });
    if (badRef) return res.status(400).json({ error: badRef });
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

// Manual onboarding trigger: a CRM user marks the contract as signed. Moves the
// contact to formular_versendet and emits vertrag.unterschrieben to the engine
// with fallback contract data (there is no e-signature system feeding this yet).
// The status change is the source of truth: a webhook-table failure is logged
// and reported as deliveries: 0, never rolled back into a 500.
router.post('/:id/onboarding/start', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const id = Number(req.params.id);

    const { rows: [c] } = await pool.query(
      `UPDATE contacts SET onboarding_status = 'formular_versendet', updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2
        RETURNING id, name, email, company, onboarding_status`,
      [id, req.workspaceId]
    );
    if (!c) return res.status(404).json({ error: 'Not found' });

    let event_id = null, deliveries = 0;
    try {
      const r = await emitEngineEvent(req.workspaceId, 'vertrag.unterschrieben', {
        kundeId: id,
        daten: {
          vertrag_id:        `manuell_${id}_${Date.now()}`,
          quelle:            'manuell',
          ausgeloest_von:    req.userId,
          onboarding_status: c.onboarding_status,
          kunde:             { name: c.name, email: c.email, firma: c.company },
        },
      });
      event_id = r.eventId; deliveries = r.deliveryIds.length;
    } catch (e) {
      console.error('vertrag.unterschrieben emit failed:', e.message);
    }

    notify(req.workspaceId, req.userId, {
      type: 'contact_updated', category: 'contacts',
      title: `Onboarding gestartet: ${c.name}`,
      entityType: 'contact', entityId: id,
    });
    res.status(201).json({ success: true, onboarding_status: c.onboarding_status, event_id, deliveries });
  } catch (e) { next(e); }
});

// Manual status change by a CRM user (contact detail, deal editor, Onboarding
// page). Validated against the same seven values as the CHECK constraint and
// the engine API. Pushed to the engine as onboarding.status_geaendert with the
// previous value; a change made BY the engine (routes/engine-api.js) is never
// echoed back, so the two systems cannot loop. Unchanged value: 200, no event.
router.patch('/:id/onboarding-status', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const id = Number(req.params.id);
    const status = req.body?.onboarding_status;
    if (typeof status !== 'string' || !ONBOARDING_STATUSES.includes(status)) {
      return res.status(400).json({ error: `onboarding_status must be one of ${ONBOARDING_STATUSES.join(', ')}` });
    }

    const { rows: [before] } = await pool.query(
      'SELECT onboarding_status FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!before) return res.status(404).json({ error: 'Not found' });
    const vorher = before.onboarding_status;

    const { rows: [c] } = await pool.query(
      `UPDATE contacts SET onboarding_status=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3
       RETURNING id, name, email, company, onboarding_status`,
      [status, id, req.workspaceId]
    );
    if (!c) return res.status(404).json({ error: 'Not found' });

    let event_id = null, deliveries = 0;
    if (vorher !== status) {
      try {
        const r = await emitEngineEvent(req.workspaceId, 'onboarding.status_geaendert', {
          kundeId: id,
          daten: {
            onboarding_status: status,
            vorher,
            quelle:            'manuell',
            ausgeloest_von:    req.userId,
            kunde:             { name: c.name, email: c.email, firma: c.company },
          },
        });
        event_id = r.eventId; deliveries = r.deliveryIds.length;
      } catch (e) {
        console.error('onboarding.status_geaendert emit failed:', e.message);
      }
      notify(req.workspaceId, req.userId, {
        type: 'contact_updated', category: 'contacts',
        title: `Onboarding-Status geändert: ${c.name} → ${status}`,
        entityType: 'contact', entityId: id,
      });
    }
    res.json({ success: true, onboarding_status: c.onboarding_status, vorher, event_id, deliveries });
  } catch (e) { next(e); }
});

// Drive folder: a user pastes the folder link (or id); the bare id is stored.
// The engine keeps writing drive_ordner_id through PATCH /api/kunden/:id/status;
// a manual entry here is a correction, so no engine event is emitted.
router.patch('/:id/drive-folder', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const raw = req.body?.drive_ordner_id;
    let value = null;
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      value = drive.parseDriveFolderId(String(raw));
      if (!value) return res.status(400).json({ error: 'Not a Google Drive folder link or ID' });
    }
    const result = await pool.query(
      'UPDATE contacts SET drive_ordner_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3',
      [value, Number(req.params.id), req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    // Sync right away so the files show up with the save. Clearing always runs
    // (it only deletes rows); reading a folder needs the key. A Drive failure
    // never fails the save: it is reported in `sync`.
    let sync = null;
    if (!value || driveConfigured()) {
      const r = await getDriveSync().syncContact(req.workspaceId, Number(req.params.id));
      sync = { synced_at: r.synced_at ?? null, sync_error: r.sync_error ?? null, count: Array.isArray(r.files) ? r.files.length : 0 };
    }
    res.json({ success: true, drive_ordner_id: value, folder_url: value ? drive.folderUrl(value) : null, sync });
  } catch (e) { next(e); }
});

// The stored file list — never calls Google. `configured` lets the UI explain
// an empty list when the server has no GOOGLE_API_KEY.
function driveView(c, folderId, files) {
  return {
    folder_id: folderId, folder_url: folderId ? drive.folderUrl(folderId) : null, embed_url: folderId ? drive.embedUrl(folderId) : null,
    synced_at: c.drive_synced_at ?? null, sync_error: c.drive_sync_error ?? null, configured: driveConfigured(), files,
  };
}
router.get('/:id/drive-files', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const id = Number(req.params.id);
    const { rows: [c] } = await pool.query(
      'SELECT drive_ordner_id, drive_synced_at, drive_sync_error, drive_file_count FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const folderId = drive.parseDriveFolderId(c.drive_ordner_id || '');   // tolerates a full link stored by the engine
    const files = folderId ? await getDriveSync().listFiles(req.workspaceId, id) : [];
    res.json(driveView(c, folderId, files));
  } catch (e) { next(e); }
});

// Re-read the folder now. A Drive failure is 200 with sync_error (the cached
// rows are still useful); only a missing key is a 503.
router.post('/:id/drive-sync', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const id = Number(req.params.id);
    const { rows: [c] } = await pool.query(
      'SELECT drive_ordner_id, drive_synced_at, drive_sync_error, drive_file_count FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (!driveConfigured()) return res.status(503).json({ error: 'drive_not_configured' });
    const r = await getDriveSync().syncContact(req.workspaceId, id);
    if (r.error === 'not_found') return res.status(404).json({ error: 'Not found' });
    res.json(driveView({ drive_synced_at: r.synced_at, drive_sync_error: r.sync_error }, r.folder_id ?? null, r.files || []));
  } catch (e) { next(e); }
});

module.exports = router;
