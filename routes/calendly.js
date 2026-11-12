/* ═══════════════════════════════════════════════════════════════════════════
   /api/integrations/calendly — the workspace's Calendly account (CALENDLY_CHANGES).

   ONE CONNECTION PER WORKSPACE (workspace_calendly): the personal access
   token of a Calendly account, sealed at rest like the Cal.com key
   (utils/calcom.js sealKey / openKey). Everyone may read the status; connect,
   the event type, refresh and disconnect are owner/admin only. The token,
   the receive token and the webhook secret never leave the server.

   CAL.COM OR CALENDLY, NEVER BOTH. A workspace books with one service, so
   "book a meeting" never has to ask which. Connecting Calendly is refused
   while Cal.com is connected (409, code calcom_connected), and Cal.com's
   connect refuses the other way round (routes/integrations.js). The status
   says so too (blocked_by: 'calcom'), so the card can explain it before
   anyone pastes a token.

   EVERY REFUSAL NAMES ITS REASON in `code`, so the page can say it in its
   own language: token_shape, calcom_connected, rejected (Calendly took the
   token for wrong), scope (the token lacks permissions: `scopes` lists them),
   unreachable, calendly_error (`detail` is Calendly's message), not_connected,
   event_type, reseal (the stored token cannot be opened any more).

   requireAuth is applied per route, not with router.use, so that Calendly's
   public booking receiver can share this prefix.

   INCOMING BOOKINGS (Part 2)  Connecting subscribes the workspace's receiver
   to the account's bookings at Calendly (invitee.created, invitee.canceled;
   signed with the workspace's webhook secret). A refusal is kept in
   last_error and shown on the card; the connection stands, and
   /register-webhook tries again. POST /receive/:token is PUBLIC: the token
   names the workspace, the signature over the raw body proves Calendly
   (server.js hands this path the raw bytes). A booking becomes ONE activity
   of type 'meeting', source 'calendly', named by its invitee URI, under the
   Cal.com receiver's own rules (routes/integrations.js router.booking): the
   invitee's email finds the contact; an unknown email creates the contact
   AND a deal in the lead link's pipeline; the assignee is told; a cancelled
   booking stays visible as cancelled. A reschedule is Calendly's pair of
   deliveries: a canceled with rescheduled: true (acknowledged, changes
   nothing) and a created whose old_invitee names the entry to move. Every
   delivery is logged in webhook_logs with source 'calendly'; `captured.trigger`
   uses Cal.com's three words (BOOKING_CREATED / _RESCHEDULED / _CANCELLED) so
   the page shows both logs with the same texts.

   ENDPOINTS
     GET    /                  status (everyone): { connected, calendly, can_manage, blocked_by }
     POST   /connect           { token }       owner/admin; registers the booking webhook
     PATCH  /                  { event_type }  the URI of one of the account's event types, owner/admin
     POST   /refresh           re-fetch the event types, owner/admin
     POST   /register-webhook  (re)register the booking webhook at Calendly, owner/admin
     DELETE /                  disconnect (and remove the webhook at Calendly), owner/admin
     GET    /logs              the last 30 Calendly deliveries (everyone)
     POST   /receive/:token    PUBLIC: Calendly's booking webhook, signed
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const calendly    = require('../utils/calendly');   // the Calendly client
const calcom      = require('../utils/calcom');     // the sealing of the token, shared with the Cal.com key
const baseUrl     = require('../utils/base-url');   // the public origin Calendly must reach for the booking webhook
const { booking } = require('./integrations');      // the Cal.com receiver's rules: the contact and deal, the host, telling the assignee

const canManage = role => role === 'owner' || role === 'admin';
function requireManage(req, res, next) {
  if (!canManage(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
  next();
}

async function loadRow(wid) {
  const { rows: [row] } = await pool.query(
    `SELECT c.*, u.name AS connected_by_name, h.id AS host_user_id
     FROM workspace_calendly c
     LEFT JOIN users u ON u.id = c.connected_by
     LEFT JOIN users h ON h.workspace_id = c.workspace_id AND LOWER(h.email) = LOWER(c.cly_email)
     WHERE c.workspace_id=$1`, [wid]
  );
  return row || null;
}

async function calcomConnected(wid) {
  const { rows } = await pool.query('SELECT 1 FROM workspace_calcom WHERE workspace_id=$1', [wid]);
  return rows.length > 0;
}

// What the browser sees. Never the sealed token, the receive token or the webhook secret.
// The event-type list goes to everyone: a member picks one when booking from a deal.
function view(row, manage) {
  const types  = Array.isArray(row.event_types) ? row.event_types : [];
  const chosen = types.find(t => t.uri === row.event_type_uri) || null;
  return {
    name: row.cly_name, email: row.cly_email, slug: row.cly_slug, timezone: row.cly_timezone,
    scheduling_url: row.scheduling_url || null,
    event_type: chosen ? { uri: chosen.uri, name: chosen.name, slug: chosen.slug, duration: chosen.duration } : null,
    event_types: types,
    webhook_registered: !!row.webhook_uri,
    host_user_id: row.host_user_id ?? null,   // the CRM user whose email is the connected account's
    connected_by: row.connected_by, connected_by_name: row.connected_by_name || null,
    connected_at: row.connected_at, updated_at: row.updated_at, last_error: row.last_error || null,
    can_manage: manage,
  };
}
async function answer(wid, row, role) {
  const manage = canManage(role);
  return { connected: !!row, calendly: row ? view(row, manage) : null, can_manage: manage, blocked_by: !row && await calcomConnected(wid) ? 'calcom' : null };
}

// Keep the chosen event type when it still exists; otherwise the first one Calendly shows on the
// account's booking page, else the first.
function pickEventType(types, currentUri) {
  if (types.some(t => t.uri === currentUri)) return currentUri;
  return (types.find(t => !t.secret) || types[0] || {}).uri ?? null;
}

// Calendly's failure → this route's status. 401 means the token is wrong, 403 that it lacks a
// permission (Calendly lists them) or may not do this: our 400. 0 means Calendly was not reachable (502).
function failure(res, err) {
  if (!(err instanceof calendly.CalendlyError)) return null;
  if (err.status === 403 && err.scopes.length) return res.status(400).json({ error: 'The Calendly token lacks permissions: ' + err.scopes.join(', '), code: 'scope', scopes: err.scopes });
  if (err.status === 401 || err.status === 403) return res.status(400).json({ error: 'Calendly rejected the token: ' + err.message, code: 'rejected' });
  if (err.status === 0)                         return res.status(502).json({ error: err.message, code: 'unreachable' });
  return res.status(502).json({ error: 'Calendly answered with an error: ' + err.message, code: 'calendly_error', detail: err.message });
}

// The receiver's public address: the origin Calendly must reach, plus the workspace's token.
function receiveUrl(req, row) {
  const origin = baseUrl(req);
  return origin ? `${origin}/api/integrations/calendly/receive/${row.receive_token}` : null;
}

// Register (or re-register) the booking webhook for the connected account and remember its URI.
// Never throws: a failure is written to last_error and shown on the card; the connection stands.
async function registerWebhook(req, wid, row, token) {
  const url = receiveUrl(req, row);
  try {
    if (!url) throw new calendly.CalendlyError(0, 'The CRM has no public address (set APP_BASE_URL)');
    if (!row.org_uri) throw new calendly.CalendlyError(0, 'Calendly named no organization for this account');
    if (row.webhook_uri) await calendly.deleteWebhook(token, row.webhook_uri).catch(() => {});   // never two for one receiver
    const wh = await calendly.createWebhook(token, { url, organization: row.org_uri, user: row.user_uri, signingKey: row.webhook_secret });
    await pool.query('UPDATE workspace_calendly SET webhook_uri=$1, last_error=NULL, updated_at=NOW() WHERE workspace_id=$2', [wh.uri, wid]);
    return { ok: true, uri: wh.uri };
  } catch (err) {
    const message = err instanceof calendly.CalendlyError ? (err.scopes.length ? 'the token lacks ' + err.scopes.join(', ') : err.message) : 'Could not register the webhook';
    await pool.query('UPDATE workspace_calendly SET webhook_uri=NULL, last_error=$1, updated_at=NOW() WHERE workspace_id=$2', [('Webhook: ' + message).slice(0, 300), wid]);
    return { ok: false, error: message };
  }
}

const NOT_CONNECTED = { error: 'Calendly is not connected', code: 'not_connected' };
const RESEAL        = { error: 'The stored token cannot be read any more; connect Calendly again', code: 'reseal' };

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json(await answer(req.workspaceId, await loadRow(req.workspaceId), req.userRole));
  } catch (err) { next(err); }
});

router.post('/connect', requireAuth, requireManage, async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!calendly.isTokenShaped(token)) return res.status(400).json({ error: 'That does not look like a Calendly access token', code: 'token_shape' });
    const wid = req.workspaceId;
    if (await calcomConnected(wid)) return res.status(409).json({ error: 'Cal.com is connected; disconnect it before connecting Calendly', code: 'calcom_connected' });
    let me, types;
    try {
      me    = await calendly.getMe(token);
      types = await calendly.listEventTypes(token, me.uri);
    } catch (err) {
      if (failure(res, err)) return;
      throw err;
    }
    const existing = await loadRow(wid);
    // another account than before: its webhook belongs to the old account, remove it with the old token
    const sameAccount = !!existing && existing.user_uri === me.uri;
    if (existing?.webhook_uri && !sameAccount) {
      let oldToken = null;
      try { oldToken = calcom.openKey(existing.token_sealed); } catch { /* unreadable: nothing to remove with */ }
      if (oldToken) await calendly.deleteWebhook(oldToken, existing.webhook_uri).catch(() => {});
      await pool.query('UPDATE workspace_calendly SET webhook_uri=NULL WHERE workspace_id=$1', [wid]);
    }
    await pool.query(
      `INSERT INTO workspace_calendly
         (workspace_id, token_sealed, user_uri, org_uri, cly_name, cly_email, cly_slug, cly_timezone, scheduling_url,
          event_types, event_type_uri, receive_token, webhook_secret, connected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)
       ON CONFLICT (workspace_id) DO UPDATE SET
         token_sealed=EXCLUDED.token_sealed, user_uri=EXCLUDED.user_uri, org_uri=EXCLUDED.org_uri, cly_name=EXCLUDED.cly_name,
         cly_email=EXCLUDED.cly_email, cly_slug=EXCLUDED.cly_slug, cly_timezone=EXCLUDED.cly_timezone,
         scheduling_url=EXCLUDED.scheduling_url, event_types=EXCLUDED.event_types, event_type_uri=EXCLUDED.event_type_uri,
         connected_by=EXCLUDED.connected_by, connected_at=NOW(), updated_at=NOW(), last_error=NULL`,
      [wid, calcom.sealKey(token), me.uri, me.organization, me.name, me.email, me.slug, me.timezone, me.schedulingUrl,
       JSON.stringify(types), pickEventType(types, existing?.event_type_uri ?? null),
       crypto.randomBytes(20).toString('hex'), crypto.randomBytes(32).toString('hex'), req.userId]
    );
    // the same account as before keeps its webhook; otherwise (or on a first connect) register one
    const current = await loadRow(wid);
    if (!(sameAccount && existing.webhook_uri)) await registerWebhook(req, wid, current, token);
    res.json(await answer(wid, await loadRow(wid), req.userRole));
  } catch (err) { next(err); }
});

router.patch('/', requireAuth, requireManage, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadRow(wid);
    if (!row) return res.status(404).json(NOT_CONNECTED);
    const uri   = typeof req.body?.event_type === 'string' ? req.body.event_type.trim() : '';
    const types = Array.isArray(row.event_types) ? row.event_types : [];
    if (!uri || !types.some(t => t.uri === uri)) return res.status(400).json({ error: 'Choose one of the connected account\'s event types', code: 'event_type' });
    await pool.query('UPDATE workspace_calendly SET event_type_uri=$1, updated_at=NOW() WHERE workspace_id=$2', [uri, wid]);
    res.json(await answer(wid, await loadRow(wid), req.userRole));
  } catch (err) { next(err); }
});

router.post('/refresh', requireAuth, requireManage, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadRow(wid);
    if (!row) return res.status(404).json(NOT_CONNECTED);
    let token;
    try { token = calcom.openKey(row.token_sealed); }
    catch { return res.status(409).json(RESEAL); }
    let types;
    try { types = await calendly.listEventTypes(token, row.user_uri); }
    catch (err) {
      if (err instanceof calendly.CalendlyError) await pool.query('UPDATE workspace_calendly SET last_error=$1, updated_at=NOW() WHERE workspace_id=$2', [err.message.slice(0, 300), wid]);
      if (failure(res, err)) return;
      throw err;
    }
    await pool.query(
      'UPDATE workspace_calendly SET event_types=$1::jsonb, event_type_uri=$2, last_error=NULL, updated_at=NOW() WHERE workspace_id=$3',
      [JSON.stringify(types), pickEventType(types, row.event_type_uri), wid]
    );
    res.json(await answer(wid, await loadRow(wid), req.userRole));
  } catch (err) { next(err); }
});

router.post('/register-webhook', requireAuth, requireManage, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadRow(wid);
    if (!row) return res.status(404).json(NOT_CONNECTED);
    let token;
    try { token = calcom.openKey(row.token_sealed); }
    catch { return res.status(409).json(RESEAL); }
    const result = await registerWebhook(req, wid, row, token);
    const body = await answer(wid, await loadRow(wid), req.userRole);
    if (!result.ok) return res.status(502).json({ ...body, error: 'Calendly did not take the webhook: ' + result.error, code: 'webhook', detail: result.error });
    res.json(body);
  } catch (err) { next(err); }
});

router.delete('/', requireAuth, requireManage, async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    if (row?.webhook_uri) {
      let token = null;
      try { token = calcom.openKey(row.token_sealed); } catch { /* unreadable: the webhook stays at Calendly, which will see 404s */ }
      if (token) await calendly.deleteWebhook(token, row.webhook_uri).catch(() => {});
    }
    await pool.query('DELETE FROM workspace_calendly WHERE workspace_id=$1', [req.workspaceId]);
    res.json({ success: true, ...await answer(req.workspaceId, null, req.userRole) });
  } catch (err) { next(err); }
});


// ═══ Calendly: the booking receiver (Part 2) ═════════════════════════════════

async function logDelivery(wid, status, payload, captured, contactId, dealId, error) {
  await pool.query(
    `INSERT INTO webhook_logs (workspace_id, source, status, payload, captured, contact_id, deal_id, error)
     VALUES ($1,'calendly',$2,$3,$4,$5,$6,$7)`,
    [wid, status, payload == null ? null : JSON.stringify(payload), JSON.stringify(captured || {}), contactId || null, dealId || null, error || null]
  ).catch(() => {});
}

router.get('/logs', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.status, l.captured, l.error, l.created_at, c.name AS contact_name, l.contact_id, l.deal_id
       FROM webhook_logs l LEFT JOIN contacts c ON c.id = l.contact_id
       WHERE l.workspace_id=$1 AND l.source='calendly'
       ORDER BY l.created_at DESC LIMIT 30`,
      [req.workspaceId]
    );
    res.json({ logs: rows });
  } catch (err) { next(err); }
});

router.post('/receive/:token', async (req, res) => {
  let wid = null;
  try {
    const { rows: [conn] } = await pool.query('SELECT * FROM workspace_calendly WHERE receive_token=$1', [req.params.token]);
    if (!conn) return res.status(404).json({ error: 'Unknown receiver' });
    wid = conn.workspace_id;
    // the raw bytes (server.js mounts express.raw on this path); a body some other parser already read is re-serialised
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    if (!calendly.verifySignature(raw, req.get('Calendly-Webhook-Signature'), conn.webhook_secret)) {
      await logDelivery(wid, 'error', null, { bytes: raw.length }, null, null, 'Signature missing, wrong or too old');
      return res.status(401).json({ error: 'Bad signature' });
    }
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Body is not JSON' }); }
    const b = calendly.parseInvitee(body);
    if (!b.trigger) return res.json({ ignored: b.ignored || true });
    if (!b.uid) { await logDelivery(wid, 'error', body, { event: b.trigger }, null, null, 'Booking without an invitee'); return res.status(422).json({ error: 'Booking without an invitee' }); }
    const a = calendly.inviteeToActivity(b, conn.cly_timezone);
    const captured = { event: b.trigger, uid: b.uid, title: a.content, event_date: a.event_date, event_time: a.event_time, event_tz: a.event_tz, attendee: b.attendee?.email || null };

    if (b.trigger === 'invitee.canceled') {
      // replaced by a new booking: the created that follows (or came first) moves the entry
      if (b.rescheduled) {
        captured.trigger = 'BOOKING_RESCHEDULED'; captured.waiting_for_new = true;
        await logDelivery(wid, 'success', body, captured, null, null, null);
        return res.json({ success: true, event: b.trigger, rescheduled: true });
      }
      captured.trigger = 'BOOKING_CANCELLED';
      const { rows: [row] } = await pool.query(
        'UPDATE activities SET cancelled_at=NOW() WHERE workspace_id=$1 AND calendly_uri=$2 AND cancelled_at IS NULL RETURNING id, contact_id, deal_id, content, event_date, event_time, event_tz',
        [wid, b.uid]
      );
      captured.found = !!row;
      if (b.cancellationReason) captured.reason = b.cancellationReason;
      if (row) captured.told = await booking.tellAssignee(wid, null, { kind: 'cancelled', dealId: row.deal_id, contactId: row.contact_id, title: row.content, start: b.start, event_date: row.event_date, event_time: row.event_time, event_tz: row.event_tz, url: b.meetingUrl || calcom.meetingLinkOf(row.content), location: b.location });
      await logDelivery(wid, 'success', body, captured, row?.contact_id, row?.deal_id, null);
      return res.json({ success: true, event: b.trigger, activity_id: row?.id || null, found: !!row });
    }

    if (b.oldInvitee) {
      const { rows: [row] } = await pool.query(
        `UPDATE activities SET calendly_uri=$1, calendly_event_uri=$2, content=$3, event_date=$4, event_time=$5, event_tz=$6, cancelled_at=NULL
         WHERE workspace_id=$7 AND calendly_uri=$8 RETURNING id, contact_id, deal_id`,
        [b.uid, a.calendly_event_uri, a.content, a.event_date, a.event_time, a.event_tz, wid, b.oldInvitee]
      );
      if (row) {
        captured.trigger = 'BOOKING_RESCHEDULED'; captured.rescheduled_from = b.oldInvitee;
        captured.told = await booking.tellAssignee(wid, null, { kind: 'moved', dealId: row.deal_id, contactId: row.contact_id, title: a.content, start: b.start, url: b.meetingUrl, location: b.location });
        await logDelivery(wid, 'success', body, captured, row.contact_id, row.deal_id, null);
        return res.json({ success: true, event: b.trigger, moved: true, activity_id: row.id, contact_id: row.contact_id, deal_id: row.deal_id });
      }
      // nothing to move: the booking before was never seen, so this one is created below
    }

    captured.trigger = 'BOOKING_CREATED';
    const { contact, createdContact, createdDealId } = await booking.contactFor(wid, b, conn);
    const dealId = createdDealId;
    const createdBy = await booking.ownerFor(wid, b, conn);
    const { rows: [row] } = await pool.query(
      `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calendly_uri, calendly_event_uri)
       VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calendly',$9,$10)
       ON CONFLICT (workspace_id, calendly_uri) WHERE calendly_uri IS NOT NULL
       DO UPDATE SET content=EXCLUDED.content, event_date=EXCLUDED.event_date, event_time=EXCLUDED.event_time, event_tz=EXCLUDED.event_tz, cancelled_at=NULL,
                     calendly_event_uri=COALESCE(EXCLUDED.calendly_event_uri, activities.calendly_event_uri)
       RETURNING id, (xmax = 0) AS inserted`,
      [wid, contact.id, dealId, a.content, createdBy, a.event_date, a.event_time, a.event_tz, b.uid, a.calendly_event_uri]
    );
    Object.assign(captured, { contact_id: contact.id, deal_id: dealId, created_contact: createdContact, created_deal: !!createdDealId });
    // a NEW row (xmax = 0: inserted, not updated) is told to the assignee; a delivery Calendly repeats is not
    if (row.inserted) captured.told = await booking.tellAssignee(wid, null, { kind: 'booked', dealId, contactId: contact.id, title: a.content, start: b.start, url: b.meetingUrl, location: b.location });
    await logDelivery(wid, 'success', body, captured, contact.id, dealId, null);
    res.json({ success: true, event: b.trigger, activity_id: row.id, contact_id: contact.id, deal_id: dealId, created_contact: createdContact, created_deal: !!createdDealId });
  } catch (err) {
    console.error('Calendly webhook error:', err);
    if (wid) await logDelivery(wid, 'error', null, {}, null, null, String(err?.message || err).slice(0, 300));
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
