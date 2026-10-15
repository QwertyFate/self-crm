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

   CAL.COM (utils/calcom.js; the Cal.com tab on the Integrations page)
     One connection per workspace: the API key of a personal Cal.com account,
     sealed at rest. Everyone may read the status; connect, the event type,
     refresh and disconnect are owner/admin only. The key, the receive token
     and the webhook secret never leave the server. requireAuth is applied
     per route here (not router.use('/calcom')) so that the public booking
     receiver, /calcom/receive/:token, can join this prefix later.

   ENDPOINTS
     GET   /settings · PATCH /settings · POST /settings/regenerate-key
     GET   /logs                       last 50 deliveries
     POST  /receive/:key               PUBLIC
     GET   /calcom                     status (everyone); ?fresh=1 re-reads the event types from Cal.com first
     POST  /calcom/connect             { api_key }        owner/admin
     PATCH /calcom                     { event_type_id }  owner/admin
     POST  /calcom/refresh             re-fetch the event types, owner/admin
     POST  /calcom/register-webhook    (re)register the booking webhook at Cal.com, owner/admin
     DELETE /calcom                    disconnect (and remove the webhook at Cal.com), owner/admin
     GET   /calcom/logs                last 30 Cal.com deliveries (everyone)
     GET   /calcom/slots               free slots of an event type, up to 42 days, viewer's zone (everyone); ?reschedule_uid= counts that booking's own slot as free
     POST  /calcom/book                book a slot for a deal's contact or a contact (everyone); the deal's
                                       (else the contact's) assignee rides along as a Cal.com guest
     POST  /calcom/cancel              cancel a booked meeting at Cal.com and mark the entry (everyone)
     POST  /calcom/reschedule          move a booked meeting to a new slot at Cal.com and on the entry (everyone)
     POST  /calcom/receive/:token      PUBLIC: Cal.com's booking webhook, signed

   TELLING THE ASSIGNEE (Part 12)  every booked, moved or cancelled meeting is announced to the
     assignee of the deal, else of the contact, as one bell notification (calTellAssignee): from
     the CRM's own routes with the actor skipped, from the webhook for what happened on Cal.com's
     page (a new booking only when the row is new, a move or a cancellation only when it hit a row
     the CRM had not already changed), so nobody is told twice.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const engine      = require('../utils/engine');            // "a lead comes in" → kunde.angelegt / kunde.aktualisiert
const { masterDataChanges } = require('../utils/kunde');
const calcom      = require('../utils/calcom');            // the Cal.com client and the sealing of its key
const baseUrl     = require('../utils/base-url');          // the public origin Cal.com must reach for the booking webhook
const { notifyUser } = require('../notifications');         // the assignee of a deal or a contact is told of a meeting (Part 12)

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
       WHERE l.workspace_id=$1 AND l.source='lead'
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


// ═══ Cal.com ══════════════════════════════════════════════════════════════════
// One connection per workspace. The row is created by POST /calcom/connect and
// replaced by a later connect (ON CONFLICT): the sealed key and the account change,
// receive_token and webhook_secret stay, so a registered webhook keeps working.

const canManageCal = role => role === 'owner' || role === 'admin';
function requireManageCal(req, res, next) {
  if (!canManageCal(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
  next();
}

async function loadCalRow(wid) {
  const { rows: [row] } = await pool.query(
    `SELECT c.*, u.name AS connected_by_name, h.id AS host_user_id
     FROM workspace_calcom c
     LEFT JOIN users u ON u.id = c.connected_by
     LEFT JOIN users h ON h.workspace_id = c.workspace_id AND LOWER(h.email) = LOWER(c.cal_email)
     WHERE c.workspace_id=$1`, [wid]
  );
  return row || null;
}

// What the browser sees. Never the sealed key, the receive token or the webhook secret.
// The event-type list goes to everyone: a member picks one when booking from a deal (Step 3).
function calView(row, manage) {
  const types = Array.isArray(row.event_types) ? row.event_types : [];
  const chosen = types.find(t => t.id === row.event_type_id) || null;
  const view = {
    cal_user_id: row.cal_user_id, cal_username: row.cal_username, cal_email: row.cal_email,
    cal_name: row.cal_name, cal_timezone: row.cal_timezone,
    event_type: chosen ? { id: chosen.id, slug: chosen.slug, title: chosen.title, lengthInMinutes: chosen.lengthInMinutes } : null,
    webhook_registered: !!row.webhook_id,
    host_user_id: row.host_user_id ?? null,   // the CRM user whose email is the connected account's: the booking dialog checks their calendar too
    connected_by: row.connected_by, connected_by_name: row.connected_by_name || null,
    connected_at: row.connected_at, updated_at: row.updated_at, last_error: row.last_error || null,
  };
  view.event_types = types;
  view.can_manage = manage;
  return view;
}
const calAnswer = (row, role) => ({ connected: !!row, calcom: row ? calView(row, canManageCal(role)) : null, can_manage: canManageCal(role) });

// Keep the chosen event type when it still exists; otherwise the first visible one, else the first.
function pickEventType(types, currentId) {
  if (types.some(t => t.id === currentId)) return currentId;
  return (types.find(t => !t.hidden) || types[0] || {}).id ?? null;
}

// The receiver's public address: the origin Cal.com must reach, plus the workspace's token.
function calReceiveUrl(req, row) {
  const origin = baseUrl(req);
  return origin ? `${origin}/api/integrations/calcom/receive/${row.receive_token}` : null;
}

// Register (or re-register) the booking webhook on the connected account and remember its id.
// Never throws: a failure is written to last_error and shown on the card; the connection stands.
async function calRegisterWebhook(req, wid, row, key) {
  const subscriberUrl = calReceiveUrl(req, row);
  try {
    if (!subscriberUrl) throw new calcom.CalError(0, 'The CRM has no public address (set APP_BASE_URL)');
    if (row.webhook_id) await calcom.deleteWebhook(key, row.webhook_id).catch(() => {});   // never two for one receiver
    const wh = await calcom.createWebhook(key, { subscriberUrl, secret: row.webhook_secret });
    await pool.query('UPDATE workspace_calcom SET webhook_id=$1, last_error=NULL, updated_at=NOW() WHERE workspace_id=$2', [wh.id, wid]);
    return { ok: true, id: wh.id };
  } catch (err) {
    const message = err instanceof calcom.CalError ? err.message : 'Could not register the webhook';
    await pool.query('UPDATE workspace_calcom SET webhook_id=NULL, last_error=$1, updated_at=NOW() WHERE workspace_id=$2', [('Webhook: ' + message).slice(0, 300), wid]);
    return { ok: false, error: message };
  }
}

// Cal.com's failure → this route's status. 401/403 from Cal.com means the key is wrong (our
// 400, the browser shows the message); 0 means Cal.com was not reachable (502).
function calFailure(res, err) {
  if (err instanceof calcom.CalError) {
    if (err.status === 401 || err.status === 403) return res.status(400).json({ error: 'Cal.com rejected the key: ' + err.message });
    if (err.status === 0)                         return res.status(502).json({ error: err.message });
    return res.status(502).json({ error: 'Cal.com answered with an error: ' + err.message });
  }
  return null;
}

// The stored event types are re-read from Cal.com, best effort (a failure keeps the copy): always
// when asked with ?fresh=1 (the booking dialog does, so a location added in Cal.com shows on the next
// open), else only for a copy from before their locations were kept (2026-10-13).
async function calRefreshStaleTypes(wid, row, force = false) {
  if (!row) return row;
  const types = Array.isArray(row.event_types) ? row.event_types : [];
  if (!force && (!types.length || types.every(t => Array.isArray(t.locations)))) return row;
  try {
    const fresh = await calcom.listEventTypes(calcom.openKey(row.api_key_sealed));
    await pool.query(
      'UPDATE workspace_calcom SET event_types=$1::jsonb, event_type_id=$2, last_error=NULL, updated_at=NOW() WHERE workspace_id=$3',
      [JSON.stringify(fresh), pickEventType(fresh, row.event_type_id), wid]
    );
    return await loadCalRow(wid) || row;
  } catch { return row; }
}

router.get('/calcom', requireAuth, async (req, res, next) => {
  try {
    const row = await calRefreshStaleTypes(req.workspaceId, await loadCalRow(req.workspaceId), req.query.fresh === '1');
    res.json(calAnswer(row, req.userRole));
  } catch (err) { next(err); }
});

router.post('/calcom/connect', requireAuth, requireManageCal, async (req, res, next) => {
  try {
    const key = typeof req.body?.api_key === 'string' ? req.body.api_key.trim() : '';
    if (!calcom.isApiKeyShaped(key)) return res.status(400).json({ error: 'That does not look like a Cal.com API key (they start with cal_)' });
    const wid = req.workspaceId;
    let me, types;
    try {
      me    = await calcom.getMe(key);
      types = await calcom.listEventTypes(key);
    } catch (err) {
      if (calFailure(res, err)) return;
      throw err;
    }
    const existing = await loadCalRow(wid);
    // another account than before: its webhook belongs to the old account, remove it with the old key
    if (existing?.webhook_id && existing.cal_user_id !== me.id) {
      let oldKey = null;
      try { oldKey = calcom.openKey(existing.api_key_sealed); } catch { /* unreadable: nothing to remove with */ }
      if (oldKey) await calcom.deleteWebhook(oldKey, existing.webhook_id).catch(() => {});
      await pool.query('UPDATE workspace_calcom SET webhook_id=NULL WHERE workspace_id=$1', [wid]);
    }
    const { rows: [row] } = await pool.query(
      `INSERT INTO workspace_calcom
         (workspace_id, api_key_sealed, cal_user_id, cal_username, cal_email, cal_name, cal_timezone,
          event_types, event_type_id, receive_token, webhook_secret, connected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
       ON CONFLICT (workspace_id) DO UPDATE SET
         api_key_sealed=EXCLUDED.api_key_sealed, cal_user_id=EXCLUDED.cal_user_id, cal_username=EXCLUDED.cal_username,
         cal_email=EXCLUDED.cal_email, cal_name=EXCLUDED.cal_name, cal_timezone=EXCLUDED.cal_timezone,
         event_types=EXCLUDED.event_types, event_type_id=EXCLUDED.event_type_id, connected_by=EXCLUDED.connected_by,
         connected_at=NOW(), updated_at=NOW(), last_error=NULL
       RETURNING *`,
      [wid, calcom.sealKey(key), me.id, me.username, me.email, me.name, me.timeZone,
       JSON.stringify(types), pickEventType(types, existing?.event_type_id ?? null),
       crypto.randomBytes(20).toString('hex'), crypto.randomBytes(32).toString('hex'), req.userId]
    );
    // the same account as before keeps its webhook; otherwise (or on a first connect) register one
    const current = await loadCalRow(wid) || row;
    if (!(existing?.webhook_id && existing.cal_user_id === me.id)) await calRegisterWebhook(req, wid, current, key);
    res.json(calAnswer(await loadCalRow(wid) || current, req.userRole));
  } catch (err) { next(err); }
});

router.patch('/calcom', requireAuth, requireManageCal, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadCalRow(wid);
    if (!row) return res.status(404).json({ error: 'Cal.com is not connected' });
    const id = Number(req.body?.event_type_id);
    const types = Array.isArray(row.event_types) ? row.event_types : [];
    if (!Number.isInteger(id) || !types.some(t => t.id === id)) return res.status(400).json({ error: 'Choose one of the connected account\'s event types' });
    await pool.query('UPDATE workspace_calcom SET event_type_id=$1, updated_at=NOW() WHERE workspace_id=$2', [id, wid]);
    res.json(calAnswer(await loadCalRow(wid), req.userRole));
  } catch (err) { next(err); }
});

router.post('/calcom/refresh', requireAuth, requireManageCal, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadCalRow(wid);
    if (!row) return res.status(404).json({ error: 'Cal.com is not connected' });
    let key;
    try { key = calcom.openKey(row.api_key_sealed); }
    catch { return res.status(409).json({ error: 'The stored key cannot be read any more; connect Cal.com again' }); }
    let types;
    try { types = await calcom.listEventTypes(key); }
    catch (err) {
      if (err instanceof calcom.CalError) await pool.query('UPDATE workspace_calcom SET last_error=$1, updated_at=NOW() WHERE workspace_id=$2', [err.message.slice(0, 300), wid]);
      if (calFailure(res, err)) return;
      throw err;
    }
    await pool.query(
      'UPDATE workspace_calcom SET event_types=$1::jsonb, event_type_id=$2, last_error=NULL, updated_at=NOW() WHERE workspace_id=$3',
      [JSON.stringify(types), pickEventType(types, row.event_type_id), wid]
    );
    res.json(calAnswer(await loadCalRow(wid), req.userRole));
  } catch (err) { next(err); }
});

router.post('/calcom/register-webhook', requireAuth, requireManageCal, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadCalRow(wid);
    if (!row) return res.status(404).json({ error: 'Cal.com is not connected' });
    let key;
    try { key = calcom.openKey(row.api_key_sealed); }
    catch { return res.status(409).json({ error: 'The stored key cannot be read any more; connect Cal.com again' }); }
    const result = await calRegisterWebhook(req, wid, row, key);
    const answer = calAnswer(await loadCalRow(wid), req.userRole);
    if (!result.ok) return res.status(502).json({ ...answer, error: 'Cal.com did not take the webhook: ' + result.error });
    res.json(answer);
  } catch (err) { next(err); }
});

router.delete('/calcom', requireAuth, requireManageCal, async (req, res, next) => {
  try {
    const row = await loadCalRow(req.workspaceId);
    if (row?.webhook_id) {
      let key = null;
      try { key = calcom.openKey(row.api_key_sealed); } catch { /* unreadable: the webhook stays at Cal.com, Cal.com will see 404s */ }
      if (key) await calcom.deleteWebhook(key, row.webhook_id).catch(() => {});
    }
    await pool.query('DELETE FROM workspace_calcom WHERE workspace_id=$1', [req.workspaceId]);
    res.json({ success: true, connected: false, calcom: null, can_manage: true });
  } catch (err) { next(err); }
});


// ═══ Cal.com: the booking receiver ═══════════════════════════════════════════
// PUBLIC, like /receive/:key: the receive token in the URL names the workspace, and every
// delivery must carry Cal.com's signature over the raw body (server.js hands this path the
// raw bytes). A booking becomes ONE activity of type 'meeting' (utils/calcom.js
// bookingToActivity), found again by its uid for a reschedule or a cancellation; a delivery
// repeated by Cal.com lands on the same row (ON CONFLICT on the uid). Every delivery is logged
// in webhook_logs with source 'calcom'. The rules behind it (decided 2026-10-13): our own
// metadata (a booking made from the CRM) names the contact and the deal; else the attendee's
// email finds the contact; an unknown email creates the contact AND a deal in the lead
// webhook's pipeline, stage and assignee (else the first pipeline's first stage), then logs;
// a cancelled booking stays visible as cancelled; the host's email names the owner, else
// whoever connected Cal.com.

async function calLog(wid, status, payload, captured, contactId, dealId, error) {
  await pool.query(
    `INSERT INTO webhook_logs (workspace_id, source, status, payload, captured, contact_id, deal_id, error)
     VALUES ($1,'calcom',$2,$3,$4,$5,$6,$7)`,
    [wid, status, payload == null ? null : JSON.stringify(payload), JSON.stringify(captured || {}), contactId || null, dealId || null, error || null]
  ).catch(() => {});
}

// The CRM user for the booking's host, by email in this workspace; else whoever connected Cal.com.
async function calOwnerFor(wid, b, conn) {
  const email = b.organizer?.email;
  if (email) {
    const { rows: [u] } = await pool.query('SELECT id FROM users WHERE workspace_id=$1 AND LOWER(email)=$2 LIMIT 1', [wid, email]);
    if (u) return u.id;
  }
  return conn.connected_by || null;
}
// Who is responsible for a meeting: the deal's assignee, else the contact's. null when nobody is.
async function calAssigneeOf(wid, dealId, contactId) {
  if (dealId) {
    const { rows: [d] } = await pool.query('SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2', [dealId, wid]);
    if (d?.assigned_to) return d.assigned_to;
  }
  if (contactId) {
    const { rows: [c] } = await pool.query('SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2', [contactId, wid]);
    if (c?.assigned_to) return c.assigned_to;
  }
  return null;
}
// Tell the assignee (Part 12): one bell notification, category "activities" (so it follows their
// preference), titled with the meeting's own title, the time on THEIR clock, where it happens.
// `kind` is booked | moved | cancelled. The actor is skipped: they did it themselves. A delivery
// from Cal.com's own page passes no actor, so the host is told too. The start is an instant when
// known (`start`), else the entry's wall clock in the host's zone. Never throws; answers the user
// id told, or null.
async function calTellAssignee(wid, actorId, { kind, dealId, contactId, title, start, event_date, event_time, event_tz, url, location }) {
  try {
    const assignee = await calAssigneeOf(wid, dealId, contactId);
    if (!assignee || assignee === actorId) return null;
    const { rows: [u] } = await pool.query('SELECT id, timezone FROM users WHERE id=$1 AND workspace_id=$2', [assignee, wid]);
    if (!u) return null;
    const iso = start || (event_date ? calcom.utcFromWallClock(event_date, event_time || '00:00', event_tz) : null);
    const wc = iso ? calcom.wallClock(iso, u.timezone) : null;
    const when = wc ? `${wc.date.slice(8, 10)}.${wc.date.slice(5, 7)}.${wc.date.slice(0, 4)}, ${wc.time} (${wc.zone})` : '';
    const body = [when, calcom.placeLabel({ url, location })].filter(Boolean).join(', ') || null;
    const sent = await notifyUser(wid, actorId, u.id, {
      type: 'meeting_' + kind, category: 'activities',
      title: String(title || 'Termin').split('\n')[0].trim().slice(0, 200),
      body, entityType: dealId ? 'deal' : 'contact', entityId: dealId || contactId,
    });
    return sent ? u.id : null;
  } catch (err) { console.error('Cal.com: telling the assignee failed:', err?.message || err); return null; }
}

// The contact for the booking, and the deal an unknown attendee gets.
async function calContactFor(wid, b, conn) {
  if (b.contactId) {
    const { rows: [c] } = await pool.query('SELECT id, name FROM contacts WHERE id=$1 AND workspace_id=$2', [b.contactId, wid]);
    if (c) return { contact: c, createdContact: false, createdDealId: null };
  }
  const email = b.attendee?.email || null;
  if (email) {
    const { rows: [c] } = await pool.query('SELECT id, name FROM contacts WHERE workspace_id=$1 AND email=$2', [wid, email]);
    if (c) return { contact: c, createdContact: false, createdDealId: null };
  }
  const { rows: [wh] } = await pool.query('SELECT pipeline_id, stage_id, default_assignee_id FROM workspace_webhook WHERE workspace_id=$1', [wid]);
  const name = b.attendee?.name || email || 'Cal.com';
  const { rows: [c] } = await pool.query(
    `INSERT INTO contacts (workspace_id, name, email, phone, company, contact_type, custom_data, assigned_to)
     VALUES ($1,$2,$3,NULL,NULL,'contact','{}',$4) RETURNING id, name`,
    [wid, name, email, wh?.default_assignee_id || conn.connected_by || null]
  );
  engine.dispatchContactCreated({ workspaceId: wid, contactId: c.id }).catch(() => {});
  let pipelineId = wh?.pipeline_id || null, stageId = wh?.stage_id || null, dealId = null;
  if (!pipelineId) {
    const { rows: [p] } = await pool.query('SELECT id FROM pipelines WHERE workspace_id=$1 ORDER BY position ASC LIMIT 1', [wid]);
    pipelineId = p?.id || null; stageId = null;
  }
  if (pipelineId) {
    if (!stageId) {
      const { rows: [st] } = await pool.query('SELECT id FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position ASC LIMIT 1', [pipelineId]);
      stageId = st?.id || null;
    }
    const { rows: [d] } = await pool.query(
      `INSERT INTO deals (workspace_id, contact_id, pipeline_id, stage_id, title) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [wid, c.id, pipelineId, stageId, c.name]
    );
    dealId = d.id;
  }
  return { contact: c, createdContact: true, createdDealId: dealId };
}

router.get('/calcom/logs', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.status, l.captured, l.error, l.created_at, c.name AS contact_name, l.contact_id, l.deal_id
       FROM webhook_logs l LEFT JOIN contacts c ON c.id = l.contact_id
       WHERE l.workspace_id=$1 AND l.source='calcom'
       ORDER BY l.created_at DESC LIMIT 30`,
      [req.workspaceId]
    );
    res.json({ logs: rows });
  } catch (err) { next(err); }
});

router.post('/calcom/receive/:token', async (req, res) => {
  let wid = null;
  try {
    const { rows: [conn] } = await pool.query('SELECT * FROM workspace_calcom WHERE receive_token=$1', [req.params.token]);
    if (!conn) return res.status(404).json({ error: 'Unknown receiver' });
    wid = conn.workspace_id;
    // the raw bytes (server.js mounts express.raw on this path); a body some other parser already read is re-serialised
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    if (!calcom.verifySignature(raw, req.get('x-cal-signature-256'), conn.webhook_secret)) {
      await calLog(wid, 'error', null, { bytes: raw.length }, null, null, 'Signature missing or wrong');
      return res.status(401).json({ error: 'Bad signature' });
    }
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Body is not JSON' }); }
    const b = calcom.parseBooking(body);
    if (!b.trigger) return res.json({ ignored: b.ignored || true });
    if (!b.uid) { await calLog(wid, 'error', body, { trigger: b.trigger }, null, null, 'Booking without uid'); return res.status(422).json({ error: 'Booking without uid' }); }
    const a = calcom.bookingToActivity(b, conn.cal_timezone);
    const captured = { trigger: b.trigger, uid: b.uid, title: a.content, event_date: a.event_date, event_time: a.event_time, event_tz: a.event_tz, attendee: b.attendee?.email || null };

    if (b.trigger === 'BOOKING_CANCELLED') {
      const { rows: [row] } = await pool.query(
        'UPDATE activities SET cancelled_at=NOW() WHERE workspace_id=$1 AND calcom_uid=$2 AND cancelled_at IS NULL RETURNING id, contact_id, deal_id, content, event_date, event_time, event_tz',
        [wid, b.uid]
      );
      captured.found = !!row;
      if (b.cancellationReason) captured.reason = b.cancellationReason;
      // a row the CRM had not cancelled itself: it happened on Cal.com's page, so the assignee is told
      if (row) captured.told = await calTellAssignee(wid, null, { kind: 'cancelled', dealId: row.deal_id, contactId: row.contact_id, title: row.content, start: b.start, event_date: row.event_date, event_time: row.event_time, event_tz: row.event_tz, url: b.meetingUrl || calcom.meetingLinkOf(row.content), location: b.location });
      await calLog(wid, 'success', body, captured, row?.contact_id, row?.deal_id, null);
      return res.json({ success: true, trigger: b.trigger, activity_id: row?.id || null, found: !!row });
    }

    if (b.trigger === 'BOOKING_RESCHEDULED') {
      const { rows: [row] } = await pool.query(
        `UPDATE activities SET calcom_uid=$1, content=$2, event_date=$3, event_time=$4, event_tz=$5, cancelled_at=NULL
         WHERE workspace_id=$6 AND calcom_uid=$7 RETURNING id, contact_id, deal_id`,
        [b.uid, a.content, a.event_date, a.event_time, a.event_tz, wid, b.rescheduleUid || b.uid]
      );
      if (row) {
        captured.rescheduled_from = b.rescheduleUid || b.uid;
        // the old uid still stood, so the move happened on Cal.com's page (the CRM's own move renames the row first)
        captured.told = await calTellAssignee(wid, null, { kind: 'moved', dealId: row.deal_id, contactId: row.contact_id, title: a.content, start: b.start, url: b.meetingUrl, location: b.location });
        await calLog(wid, 'success', body, captured, row.contact_id, row.deal_id, null);
        return res.json({ success: true, trigger: b.trigger, activity_id: row.id, contact_id: row.contact_id, deal_id: row.deal_id });
      }
      // nothing to move: the booking was never seen, so it is created below
    }

    const { contact, createdContact, createdDealId } = await calContactFor(wid, b, conn);
    let dealId = createdDealId;
    if (!dealId && b.dealId) {
      const { rows: [d] } = await pool.query('SELECT id FROM deals WHERE id=$1 AND workspace_id=$2', [b.dealId, wid]);
      dealId = d?.id || null;
    }
    const createdBy = await calOwnerFor(wid, b, conn);
    const { rows: [row] } = await pool.query(
      `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calcom_uid, calcom_event_type_id)
       VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calcom',$9,$10)
       ON CONFLICT (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL
       DO UPDATE SET content=EXCLUDED.content, event_date=EXCLUDED.event_date, event_time=EXCLUDED.event_time, event_tz=EXCLUDED.event_tz, cancelled_at=NULL,
                     calcom_event_type_id=COALESCE(EXCLUDED.calcom_event_type_id, activities.calcom_event_type_id)
       RETURNING id, (xmax = 0) AS inserted`,
      [wid, contact.id, dealId, a.content, createdBy, a.event_date, a.event_time, a.event_tz, b.uid, b.eventTypeId]
    );
    Object.assign(captured, { contact_id: contact.id, deal_id: dealId, created_contact: createdContact, created_deal: !!createdDealId });
    // a NEW row (xmax = 0: inserted, not updated) is a booking made on Cal.com's page; one the CRM
    // booked itself already told the assignee from /calcom/book and only gets its link filled in here
    if (row.inserted) captured.told = await calTellAssignee(wid, null, { kind: 'booked', dealId, contactId: contact.id, title: a.content, start: b.start, url: b.meetingUrl, location: b.location });
    await calLog(wid, 'success', body, captured, contact.id, dealId, null);
    res.json({ success: true, trigger: b.trigger, activity_id: row.id, contact_id: contact.id, deal_id: dealId, created_contact: createdContact, created_deal: !!createdDealId });
  } catch (err) {
    console.error('Cal.com webhook error:', err);
    if (wid) await calLog(wid, 'error', null, {}, null, null, String(err?.message || err).slice(0, 300));
    res.status(500).json({ error: 'Internal error' });
  }
});


// ═══ Cal.com: booking from the CRM (Step 3) ═══════════════════════════════════
// Any member may book: the host is always the connected account, and the entry belongs to
// whoever booked. The customer is the deal's contact or the contact itself; Cal.com needs a
// name and an email for the invitation, which Cal.com sends itself. The deal and contact ids
// travel in the booking's metadata, so the webhook's reschedule or cancellation finds the row;
// the row is written here at once (same uid), and the webhook's delivery lands on it.

const calDateOnly = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
function calAddDays(date, n) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// The connection with its key opened; answers 404 / 409 itself and returns null then.
async function calOpenConnection(req, res) {
  const row = await loadCalRow(req.workspaceId);
  if (!row) { res.status(404).json({ error: 'Cal.com is not connected' }); return null; }
  let key;
  try { key = calcom.openKey(row.api_key_sealed); }
  catch { res.status(409).json({ error: 'The stored key cannot be read any more; connect Cal.com again' }); return null; }
  return { row, key };
}
function calEventTypeFor(row, wanted) {
  const types = Array.isArray(row.event_types) ? row.event_types : [];
  const id = wanted !== undefined && wanted !== null && wanted !== '' ? Number(wanted) : row.event_type_id;
  return types.find(t => t.id === id) || null;
}

router.get('/calcom/slots', requireAuth, async (req, res, next) => {
  try {
    const opened = await calOpenConnection(req, res); if (!opened) return;
    const { row, key } = opened;
    const type = calEventTypeFor(row, req.query.event_type_id);
    if (!type) return res.status(400).json({ error: 'Choose one of the connected account\'s event types' });
    const zone = req.userTimezone || calcom.FALLBACK_ZONE;
    const from = calDateOnly(req.query.from) || calcom.wallClock(new Date().toISOString(), zone).date;
    const days = Math.min(42, Math.max(1, parseInt(req.query.days, 10) || 7));   // up to a month's grid
    // moving a booking: its own slot counts as free, Cal.com just needs the uid, which must be one of ours
    let bookingUidToReschedule;
    if (typeof req.query.reschedule_uid === 'string' && req.query.reschedule_uid) {
      const { rows: [own] } = await pool.query('SELECT id FROM activities WHERE workspace_id=$1 AND calcom_uid=$2', [req.workspaceId, req.query.reschedule_uid]);
      if (!own) return res.status(404).json({ error: 'No meeting with that booking in this workspace' });
      bookingUidToReschedule = req.query.reschedule_uid;
    }
    let slots;
    try { slots = await calcom.getSlots(key, { eventTypeId: type.id, start: from, end: calAddDays(from, days), timeZone: zone, bookingUidToReschedule }); }
    catch (err) { if (calFailure(res, err)) return; throw err; }
    res.json({ event_type: { id: type.id, title: type.title, lengthInMinutes: type.lengthInMinutes }, time_zone: zone, from, days, slots });
  } catch (err) { next(err); }
});

router.post('/calcom/book', requireAuth, async (req, res, next) => {
  try {
    const opened = await calOpenConnection(req, res); if (!opened) return;
    const { row, key } = opened;
    const wid = req.workspaceId, body = req.body || {};
    const type = calEventTypeFor(row, body.event_type_id);
    if (!type) return res.status(400).json({ error: 'Choose one of the connected account\'s event types' });
    const startMs = typeof body.start === 'string' ? new Date(body.start).getTime() : NaN;
    if (Number.isNaN(startMs)) return res.status(400).json({ error: 'start must be an ISO date-time' });
    const start = new Date(startMs).toISOString();
    const dealId = body.deal_id ? parseInt(body.deal_id, 10) || null : null;
    let contactId = body.contact_id ? parseInt(body.contact_id, 10) || null : null;
    let deal = null;
    if (dealId) {
      const { rows: [d] } = await pool.query('SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2', [dealId, wid]);
      if (!d) return res.status(400).json({ error: 'Deal not found in this workspace' });
      deal = d;
      if (!contactId) contactId = d.contact_id;
    }
    if (!contactId) return res.status(400).json({ error: 'A contact is required' });
    const { rows: [contact] } = await pool.query('SELECT id, name, email, assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2', [contactId, wid]);
    if (!contact) return res.status(400).json({ error: 'Contact not found in this workspace' });
    if (!contact.email) return res.status(400).json({ error: 'The contact has no email address; Cal.com needs one for the invitation' });
    const zone = req.userTimezone || calcom.FALLBACK_ZONE;
    const language = body.language === 'en' ? 'en' : 'de';
    // where it happens: one of the event type's locations, chosen in the dialog; none means Cal.com's default for the type
    let location = null;
    if (body.location !== undefined && body.location !== null && body.location !== '') {
      location = calcom.bookingLocationFor(type.locations, body.location);
      if (!location) return res.status(400).json({ error: 'Choose one of the event type\'s locations' });
    }
    // the assignee of the deal (else of the contact) rides along as a guest: Cal.com sends them the
    // invitation with the meeting link, so it is in their calendar; not when they are the host (already
    // there), the attendee, or have no email
    const assigneeId = deal?.assigned_to || contact.assigned_to || null;
    let guest = null;
    if (assigneeId) {
      const { rows: [u] } = await pool.query('SELECT id, name, email FROM users WHERE id=$1 AND workspace_id=$2', [assigneeId, wid]);
      const mail = u?.email ? String(u.email).trim().toLowerCase() : null;
      if (mail && mail !== String(row.cal_email || '').trim().toLowerCase() && mail !== String(contact.email).trim().toLowerCase()) guest = { id: u.id, name: u.name, email: mail };
    }
    const make = guests => calcom.createBooking(key, {
      eventTypeId: type.id, start,
      attendee: { name: contact.name, email: contact.email, timeZone: zone, language },
      metadata: { upgrads_workspace_id: String(wid), upgrads_contact_id: String(contact.id), ...(deal ? { upgrads_deal_id: String(deal.id) } : {}) },
      notes: typeof body.note === 'string' ? body.note : '',
      location, guests,
    });
    const refused = err => {
      if (!(err instanceof calcom.CalError)) throw err;
      if (err.status === 0) return res.status(502).json({ error: err.message });
      if (err.status >= 400 && err.status < 500) return res.status(409).json({ error: 'Cal.com did not accept the booking: ' + err.message });
      return res.status(502).json({ error: 'Cal.com answered with an error: ' + err.message });
    };
    let booking, guestDropped = false;
    try { booking = await make(guest ? [guest.email] : undefined); }
    catch (err) {
      // an event type that takes no guests refuses the email: book without, the assignee still gets the bell
      if (guest && err instanceof calcom.CalError && err.status >= 400 && err.status < 500 && /guest/i.test(err.message)) {
        guestDropped = true;
        try { booking = await make(undefined); } catch (err2) { return refused(err2); }
      } else return refused(err);
    }
    // the entry, at once: the same row the webhook will land on (same uid); the booker owns it
    const a = calcom.bookingToActivity({ uid: booking.uid, title: booking.title || type.title, start: booking.start || start, organizer: { timeZone: row.cal_timezone }, attendee: { name: contact.name }, meetingUrl: booking.meetingUrl }, row.cal_timezone);
    const { rows: [act] } = await pool.query(
      `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calcom_uid, calcom_event_type_id)
       VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calcom',$9,$10)
       ON CONFLICT (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL
       DO UPDATE SET content=EXCLUDED.content, event_date=EXCLUDED.event_date, event_time=EXCLUDED.event_time, event_tz=EXCLUDED.event_tz,
                     created_by=EXCLUDED.created_by, deal_id=COALESCE(EXCLUDED.deal_id, activities.deal_id), cancelled_at=NULL, calcom_event_type_id=EXCLUDED.calcom_event_type_id
       RETURNING id`,
      [wid, contact.id, deal?.id || null, a.content, req.userId, a.event_date, a.event_time, a.event_tz, booking.uid, type.id]
    );
    const told = await calTellAssignee(wid, req.userId, { kind: 'booked', dealId: deal?.id || null, contactId: contact.id, title: a.content, start: booking.start || start, url: booking.meetingUrl, location: booking.location });
    const guests = guest && !guestDropped ? [{ name: guest.name, email: guest.email }] : [];
    const captured = { trigger: 'BOOKED_FROM_CRM', uid: booking.uid, title: a.content, event_date: a.event_date, event_time: a.event_time, event_tz: a.event_tz, attendee: contact.email, contact_id: contact.id, deal_id: deal?.id || null, booked_by: req.userId, guest: guest ? guest.email : null, guest_dropped: guestDropped, told };
    await calLog(wid, 'success', { booking, request: { start, event_type_id: type.id, deal_id: deal?.id || null, contact_id: contact.id } }, captured, contact.id, deal?.id || null, null);
    res.status(201).json({
      activity: { id: act.id, type: 'meeting', content: a.content, event_date: a.event_date, event_time: a.event_time, event_tz: a.event_tz, contact_id: contact.id, deal_id: deal?.id || null, calcom_uid: booking.uid, calcom_event_type_id: type.id, source: 'calcom', created_by: req.userId },
      booking: { uid: booking.uid, title: booking.title, start: booking.start, end: booking.end, status: booking.status, location: booking.location, meeting_url: booking.meetingUrl, guests },
      told,
    });
  } catch (err) { next(err); }
});


// ═══ Cal.com: cancel and reschedule from the CRM ═══════════════════════════════
// Both act on an entry that came from Cal.com (source 'calcom', a booking id) and is not cancelled;
// everyone may, as everyone may book. Cancel: the booking is cancelled at Cal.com (which tells the
// attendee, with the reason when given) and the entry is marked, not removed. Reschedule: Cal.com
// makes a NEW booking at the new start and the entry takes its uid, title and time at once; the
// webhook's BOOKING_RESCHEDULED then lands on the same row (ON CONFLICT on the new uid).

async function calMeetingEntry(req, res) {
  const id = parseInt(req.body?.activity_id, 10) || null;
  if (!id) { res.status(400).json({ error: 'activity_id is required' }); return null; }
  const { rows: [a] } = await pool.query(
    "SELECT id, contact_id, deal_id, content, calcom_uid, calcom_event_type_id, cancelled_at, event_date, event_time, event_tz FROM activities WHERE id=$1 AND workspace_id=$2 AND source='calcom'",
    [id, req.workspaceId]
  );
  if (!a || !a.calcom_uid) { res.status(404).json({ error: 'No Cal.com meeting with that id in this workspace' }); return null; }
  if (a.cancelled_at) { res.status(409).json({ error: 'This meeting is already cancelled' }); return null; }
  return a;
}

router.post('/calcom/cancel', requireAuth, async (req, res, next) => {
  try {
    const opened = await calOpenConnection(req, res); if (!opened) return;
    const a = await calMeetingEntry(req, res); if (!a) return;
    const { key } = opened, wid = req.workspaceId;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    let result;
    try { result = await calcom.cancelBooking(key, a.calcom_uid, { reason }); }
    catch (err) {
      if (err instanceof calcom.CalError) {
        if (err.status === 0) return res.status(502).json({ error: err.message });
        if (err.status >= 400 && err.status < 500) return res.status(409).json({ error: 'Cal.com did not accept the cancellation: ' + err.message });
        return res.status(502).json({ error: 'Cal.com answered with an error: ' + err.message });
      }
      throw err;
    }
    const { rows: [row] } = await pool.query('UPDATE activities SET cancelled_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING cancelled_at', [a.id, wid]);
    const told = await calTellAssignee(wid, req.userId, { kind: 'cancelled', dealId: a.deal_id, contactId: a.contact_id, title: a.content, event_date: a.event_date, event_time: a.event_time, event_tz: a.event_tz, url: calcom.meetingLinkOf(a.content) });
    await calLog(wid, 'success', { cancel: result, request: { activity_id: a.id, reason: reason || null } }, { trigger: 'CANCELLED_FROM_CRM', uid: a.calcom_uid, title: a.content, reason: reason || null, gone: result.gone, cancelled_by: req.userId, contact_id: a.contact_id, deal_id: a.deal_id, told }, a.contact_id, a.deal_id, null);
    res.json({ success: true, activity: { id: a.id, cancelled_at: row?.cancelled_at || new Date().toISOString(), calcom_uid: a.calcom_uid }, gone: result.gone, told });
  } catch (err) { next(err); }
});

router.post('/calcom/reschedule', requireAuth, async (req, res, next) => {
  try {
    const opened = await calOpenConnection(req, res); if (!opened) return;
    const a = await calMeetingEntry(req, res); if (!a) return;
    const { row, key } = opened, wid = req.workspaceId;
    const startMs = typeof req.body?.start === 'string' ? new Date(req.body.start).getTime() : NaN;
    if (Number.isNaN(startMs)) return res.status(400).json({ error: 'start must be an ISO date-time' });
    const start = new Date(startMs).toISOString();
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    let booking;
    try { booking = await calcom.rescheduleBooking(key, a.calcom_uid, { start, reason }); }
    catch (err) {
      if (err instanceof calcom.CalError) {
        if (err.status === 0) return res.status(502).json({ error: err.message });
        if (err.status >= 400 && err.status < 500) return res.status(409).json({ error: 'Cal.com did not accept the new time: ' + err.message });
        return res.status(502).json({ error: 'Cal.com answered with an error: ' + err.message });
      }
      throw err;
    }
    const oldTitle = String(a.content || '').split('\n')[0];
    const act = calcom.bookingToActivity({ uid: booking.uid, title: booking.title || oldTitle, start: booking.start || start, organizer: { timeZone: row.cal_timezone }, meetingUrl: booking.meetingUrl }, row.cal_timezone);
    await pool.query(
      'UPDATE activities SET calcom_uid=$1, content=$2, event_date=$3, event_time=$4, event_tz=$5, cancelled_at=NULL, calcom_event_type_id=COALESCE($6, calcom_event_type_id) WHERE id=$7 AND workspace_id=$8',
      [booking.uid, act.content, act.event_date, act.event_time, act.event_tz, booking.eventTypeId, a.id, wid]
    );
    const told = await calTellAssignee(wid, req.userId, { kind: 'moved', dealId: a.deal_id, contactId: a.contact_id, title: act.content, start: booking.start || start, url: booking.meetingUrl || calcom.meetingLinkOf(a.content), location: booking.location });
    await calLog(wid, 'success', { booking, request: { activity_id: a.id, start, reason: reason || null } }, { trigger: 'RESCHEDULED_FROM_CRM', uid: booking.uid, rescheduled_from: a.calcom_uid, title: act.content, event_date: act.event_date, event_time: act.event_time, event_tz: act.event_tz, rescheduled_by: req.userId, contact_id: a.contact_id, deal_id: a.deal_id, told }, a.contact_id, a.deal_id, null);
    res.json({
      success: true,
      activity: { id: a.id, type: 'meeting', content: act.content, event_date: act.event_date, event_time: act.event_time, event_tz: act.event_tz, contact_id: a.contact_id, deal_id: a.deal_id, calcom_uid: booking.uid, calcom_event_type_id: booking.eventTypeId || a.calcom_event_type_id, source: 'calcom', cancelled_at: null },
      booking: { uid: booking.uid, rescheduled_from: a.calcom_uid, title: booking.title, start: booking.start, end: booking.end, status: booking.status, location: booking.location, meeting_url: booking.meetingUrl },
      told,
    });
  } catch (err) { next(err); }
});

module.exports = router;
