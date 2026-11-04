/* ═══════════════════════════════════════════════════════════════════════════
   /api/notetaker — the Notetaker's result for one recorded meeting (Part 2, 2026-10-20).

   PUBLIC ON PURPOSE. The Notetaker (the recording bot for Google Meet, utils/notetaker.js)
   is a server, not a signed-in user, so this router has no session check. What guards it:
     · the link: each recorded meeting has its own secret, 48 hex characters
       (notetaker_recordings.callback_token), sent to the Notetaker as callback_url when
       the bot is booked (routes/integrations.js, notetakerSync). The link alone decides
       the workspace, the meeting, the deal and the contact; the body's metadata is never
       trusted for any of them.
     · the signature, when NOTETAKER_WEBHOOK_SECRET is set (the same value as in the
       Notetaker's .env): X-Notetaker-Signature over the raw body, five minutes' tolerance.
     · server.js: raw bytes up to 5 MB on this path (the result carries the whole
       transcript), the inbound limit per IP and 30 deliveries a minute per link.

   POST /webhook/:token
     The Notetaker sends this by itself when the meeting is over and the transcript and
     notes are done (or the recording failed), and retries for about 13 minutes on
     anything but a 2xx. Nobody in the CRM waits for it.
       recording.completed → a note on the meeting's deal and contact: Claude's notes
                             (title, summary, key points, decisions, action items, open
                             questions), or why there are none
       recording.failed    → a note saying the meeting was not recorded, and why
       anything else       → 200 { ignored: true }, nothing written
     One note per recording: the first delivery claims the row (finished_at) in the same
     statement that writes the note, so a retry or a redelivery is acknowledged
     ({ already: true }) and writes nothing. The note has no author and source
     'notetaker'; the timelines sign it "Notetaker". The person who booked the
     recording is told with the bell (notetaker_done / notetaker_failed).
   ═══════════════════════════════════════════════════════════════════════════ */

const express       = require('express');
const router        = express.Router();
const { pool }      = require('../db');
const notetaker     = require('../utils/notetaker');
const { notifyUser } = require('../notifications');

const LINK = /^[0-9a-f]{48}$/;

router.post('/webhook/:token', async (req, res) => {
  const token = String(req.params.token || '');
  if (!LINK.test(token)) return res.status(404).json({ error: 'Unknown recording' });
  try {
    const { rows: [r] } = await pool.query(
      `SELECT n.id, n.workspace_id, n.external_id, n.requested_by, n.language, n.finished_at, n.note_activity_id,
              a.content AS meeting_content, a.deal_id, a.contact_id
         FROM notetaker_recordings n JOIN activities a ON a.id = n.activity_id AND a.workspace_id = n.workspace_id
        WHERE n.callback_token = $1`,
      [token]
    );
    if (!r) return res.status(404).json({ error: 'Unknown recording' });

    // the raw bytes (server.js mounts express.raw on this path); a body some other parser already read is re-serialised
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const { webhookSecret } = notetaker.config();
    if (webhookSecret && !notetaker.verifySignature(raw, req.get('x-notetaker-timestamp'), req.get('x-notetaker-signature'), webhookSecret)) {
      return res.status(401).json({ error: 'Bad signature' });
    }
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Body is not JSON' }); }
    if (body && body.external_id != null && body.external_id !== r.external_id) return res.status(400).json({ error: 'This result belongs to another meeting' });

    const note = notetaker.resultNote(body, r.language);
    if (note.kind === 'ignored') return res.json({ ignored: true });
    if (r.finished_at) return res.json({ success: true, already: true, activity_id: r.note_activity_id });

    // claim the recording and write the note in ONE statement: both happen, or neither
    const jobId = body.id != null ? String(body.id).slice(0, 100) : null;
    const { rows: [created] } = await pool.query(
      `WITH claim AS (
         UPDATE notetaker_recordings SET status=$1, error=$2, job_id=COALESCE(job_id, $3), finished_at=NOW(), updated_at=NOW()
          WHERE id=$4 AND finished_at IS NULL RETURNING workspace_id
       )
       INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source)
       SELECT workspace_id, $5::int, $6::int, 'note', $7::text, NULL, 'notetaker' FROM claim RETURNING id`,
      [note.kind === 'failed' ? 'recording_failed' : 'completed', note.reason, jobId, r.id, r.contact_id, r.deal_id, note.content]
    );
    if (!created) return res.json({ success: true, already: true, activity_id: r.note_activity_id });   // a delivery running alongside won
    await pool.query('UPDATE notetaker_recordings SET note_activity_id=$1 WHERE id=$2', [created.id, r.id]);

    if (r.requested_by) {
      await notifyUser(r.workspace_id, null, r.requested_by, {
        type: note.kind === 'failed' ? 'notetaker_failed' : 'notetaker_done', category: 'activities',
        title: String(r.meeting_content || '').split('\n')[0].trim().slice(0, 200) || 'Notetaker',
        body: note.kind === 'failed' ? note.reason : note.title,
        entityType: r.deal_id ? 'deal' : 'contact', entityId: r.deal_id || r.contact_id,
      });
    }
    res.json({ success: true, kind: note.kind, activity_id: created.id });
  } catch (err) {
    console.error('Notetaker result error:', err);
    res.status(500).json({ error: 'Internal error' });   // the Notetaker tries again
  }
});

module.exports = router;
