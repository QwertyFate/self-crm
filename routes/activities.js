/* ═══════════════════════════════════════════════════════════════════════════
   /api/activities — the timeline entries logged against a contact.

   AN ACTIVITY is a note, call, email or whatsapp entry with free-text content,
   optionally attached to a contact and optionally SCHEDULED: event_date (a
   DATE) plus an optional event_time (a TIME). A scheduled activity is what
   makes it appear on the Calendar; one with a date and no time is an all-day
   entry. `completed` is the Calendar's tick box. event_tz is the zone the
   time was typed in, stamped from req.userTimezone whenever a date or time is
   written (never from the body); the Calendar converts it for each viewer.
   NULL event_tz predates the column and is read as Europe/Berlin.

   A NOTE CAN BE BOUND TO ONE DEAL (activities.deal_id). POST takes deal_id —
   verified to be in THIS workspace, and a note with a deal but no contact takes
   the deal's contact. NULL deal_id is a contact-level note.

   TWO OPTIONAL, INDEPENDENT FILTERS ON GET /:
     ?deal_id=N     "this deal's notes": bound to N, PLUS the contact-level
                    notes (NULL deal) of N's contact — a note about the person
                    belongs with every deal of theirs. The only notes it hides
                    are those bound to the contact's OTHER deals.
     ?contact_id=N  everything on that contact, whichever deal (or none) each
                    note was logged on — the deal detail's DEFAULT view, "all
                    together", each row labelled with its bound deal
   For DISPLAY every row carries bound_deal_id, plus deal_id/deal_title that
   prefer the bound deal and fall back to the derived one — the contact's most
   recently updated deal, the same LATERAL join routes/calendar.js uses.

   PARTIAL UPDATES  PATCH /:id COALESCEs each field, so you send only what
   changed. To CLEAR a date or time, send an explicit null — that is what the
   `CASE WHEN $7 THEN NULL` branches are for. Omitting the key keeps the
   current value; sending null erases it.

   @MENTIONS  after a create or update, notifyMentions() scans the content for
   @name, matches loosely against the workspace's user names (exact, prefix, or
   any word of the name), and inserts a 'mention' notification pointing at the
   contact's most recently updated deal when there is one, otherwise the
   contact. Its errors are swallowed: a mention must never fail the write.
   NOTE routes/activity-comments.js has a SECOND, STRICTER mention scanner
   (exact name match only). Changing mention behaviour means changing both.

   CONTENT IS STORED AS THE CLIENT SENDS IT, including HTML, and nothing here
   sanitises it. See §8 of readmedev.md.

   ENDPOINTS  GET / (newest 200) · POST / · GET /:id · PATCH /:id · DELETE /:id
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

async function notifyMentions(workspaceId, actorId, actorName, content, activityId) {
  try {
    if (!content) return;
    const plain = content.replace(/<[^>]*>/g, ' ');
    const mentions = plain.match(/@(\w+)/g);
    if (!mentions) return;

    const nameSet = new Set();
    mentions.forEach(m => {
      const name = m.slice(1).trim().toLowerCase();
      if (name) nameSet.add(name);
    });
    if (nameSet.size === 0) return;

    const { rows: users } = await pool.query(
      'SELECT id, name FROM users WHERE workspace_id = $1',
      [workspaceId]
    );
    const matched = users.filter(u => {
      const lowerName = u.name.toLowerCase();
      const words = lowerName.split(/\s+/);
      return [...nameSet].some(name =>
        lowerName === name ||
        lowerName.startsWith(name) ||
        words.some(w => w.startsWith(name))
      );
    });
    if (!matched.length) return;

    const { rows: [activity] } = await pool.query(`
      SELECT a.contact_id, a.type, c.name AS contact_name
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.id = $1
    `, [activityId]);

    const preview = plain.replace(/@\w+/g, '').trim().slice(0, 120).replace(/\s+\S*$/, '') || 'a note';
    const contactName = activity?.contact_name || 'a contact';

    let dealId = null;
    if (activity?.contact_id) {
      const { rows: deals } = await pool.query(
        'SELECT id FROM deals WHERE contact_id = $1 AND workspace_id = $2 ORDER BY updated_at DESC LIMIT 1',
        [activity.contact_id, workspaceId]
      );
      if (deals.length) dealId = deals[0].id;
    }

    const body = `In ${contactName}: "${preview}"`;

    for (const user of matched) {
      if (user.id === actorId) continue;
      await pool.query(`
        INSERT INTO notifications (workspace_id, user_id, actor_id, type, category, title, body, entity_type, entity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        workspaceId, user.id, actorId,
        'mention', 'activities',
        `${actorName} mentioned you in a note`,
        body,
        dealId ? 'deal' : 'contact',
        dealId || (activity?.contact_id || null)
      ]);
    }
  } catch (e) {
    console.error('Mention notification error:', e.message);
  }
}

router.get('/', async (req, res, next) => {
  try {
    // ?deal_id=N (strictly bound to N) and ?contact_id=N (everything on the contact) — see the
    // header. A non-number is an error, not a silent "show everything".
    const dealFilter    = req.query.deal_id    === undefined ? null : parseInt(req.query.deal_id, 10);
    const contactFilter = req.query.contact_id === undefined ? null : parseInt(req.query.contact_id, 10);
    if (req.query.deal_id    !== undefined && !Number.isInteger(dealFilter))    return res.status(400).json({ error: 'deal_id must be a number' });
    if (req.query.contact_id !== undefined && !Number.isInteger(contactFilter)) return res.status(400).json({ error: 'contact_id must be a number' });
    const { rows } = await pool.query(`
      SELECT a.id, a.workspace_id, a.contact_id, a.type, a.content, a.created_by, a.created_at,
             a.completed,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             c.name AS contact_name,
             a.deal_id AS bound_deal_id,
             COALESCE(db.id, d.id) AS deal_id, COALESCE(db.title, d.title) AS deal_title,
             u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN users   u ON u.id = a.created_by
      LEFT JOIN deals db ON db.id = a.deal_id
      LEFT JOIN LATERAL (
        SELECT id, title FROM deals
        WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id
        ORDER BY deals.updated_at DESC LIMIT 1
      ) d ON true
      WHERE a.workspace_id = $1
        AND ($2::int IS NULL OR a.deal_id = $2 OR (a.deal_id IS NULL AND a.contact_id = (SELECT contact_id FROM deals WHERE id = $2 AND workspace_id = $1)))
        AND ($3::int IS NULL OR a.contact_id = $3)
      ORDER BY a.created_at DESC LIMIT 200
    `, [req.workspaceId, dealFilter, contactFilter]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { contact_id, type, content, event_date, event_time, deal_id } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    // A note composed on a deal is bound to it. The deal id comes from the client, so it must be
    // in THIS workspace; a note with a deal but no contact takes the deal's contact.
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    let contactId = contact_id || null;
    if (dealId) {
      const { rows: [d] } = await pool.query('SELECT contact_id FROM deals WHERE id=$1 AND workspace_id=$2', [dealId, req.workspaceId]);
      if (!d) return res.status(400).json({ error: 'Deal not found in this workspace' });
      if (!contactId) contactId = d.contact_id;
    }
    if (!['note','call','email','whatsapp'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const { rows: [row] } = await pool.query(
      'INSERT INTO activities (workspace_id, contact_id, type, content, created_by, event_date, event_time, event_tz, deal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [req.workspaceId, contactId, type, content, req.userId, event_date || null, event_time || null, req.userTimezone || 'Europe/Berlin', dealId]
    );

    const { rows: [actor] } = await pool.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await notifyMentions(req.workspaceId, req.userId, actor?.name || 'Someone', content, row.id);

    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT a.id, a.workspace_id, a.contact_id, a.type, a.content, a.created_by, a.created_at,
             a.completed,
             TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,
             u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id = $1 AND a.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { type, content, event_date, event_time, completed } = req.body;

    if (!content && completed === undefined && type === undefined && event_date === undefined && event_time === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    if (type && !['note','call','email','whatsapp'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const result = await pool.query(
       `UPDATE activities SET
          type        = COALESCE($1, type),
          content     = COALESCE($2, content),
          event_date  = CASE WHEN $7 THEN NULL ELSE COALESCE($5, event_date) END,
          event_time  = CASE WHEN $9 THEN NULL ELSE COALESCE($8, event_time) END,
          event_tz    = CASE WHEN $10 THEN $11 ELSE event_tz END,
          completed   = COALESCE($6, completed)
        WHERE id=$3 AND workspace_id=$4 RETURNING id`,
       [type ?? null, content ?? null, req.params.id, req.workspaceId, event_date ?? null, completed ?? null, event_date === null,
        event_time ?? null, event_time === null,
        // re-stamp the zone only when a date or time was actually sent — a bare
        // "completed" tick must not relabel a time it did not touch
        event_date !== undefined || event_time !== undefined, req.userTimezone || 'Europe/Berlin']
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Activity not found' });

    const { rows: [actor] } = await pool.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await notifyMentions(req.workspaceId, req.userId, actor?.name || 'Someone', content, result.rows[0].id);

    res.json({ success: true, id: result.rows[0].id });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM activities WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
