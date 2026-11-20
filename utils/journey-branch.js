/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY BRANCH — a box that asks a question and has two lines out
   (CUSTOMER_JOURNEY_CHANGES Part 11, 2026-11-19; utils/journey-run.js asks
   holds() when a deal reaches the box, routes/journey.js saves one with
   checkBranch() and foreignRefs(), public/js/journey.js draws it).

   A branch box ("If") does nothing to the deal. When a deal reaches it — after
   the box's own wait, like every box — its question is asked about the deal as
   it is at that moment, and the deal goes on along the box's "yes" line
   (journey_nodes.next_id) or its "no" line (else_id). A line that leads
   nowhere ends the workflow for that deal.

   THE QUESTIONS (config.test)
     stage       the deal is in one of these stages (stage_ids)
     meeting     a meeting was booked since the deal entered the workflow
                 (Cal.com or Calendly; for the deal, or for its contact)
     answered    a fonio call reached the person since then
     opt_out     the contact pressed "no more emails"
     has_email   the contact has an email address
     has_phone   the contact has a phone number
     assigned    the deal is assigned to someone
     urgency     the deal's urgency is at least a level (min_urgency 1–4)
     field       a deal field has a value — any (no `value`), or this one
                 (field_key, value; capitals and outer spaces do not count)

   A field's key is always a value in what is asked, never part of it: the
   deal's fields are read as a whole and looked into here.

   Every function takes the pool; nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const TESTS = ['stage', 'meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned', 'urgency', 'field'];
const MAX_STAGES = 20, MAX_URGENCY = 4, MAX_VALUE = 200;
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e10 ? v : null);

// A branch box's settings as sent: { config } with only what its question uses, or { code }: branch (no such
// question, or one of its settings is missing or cannot be), stage, field.
function checkBranch(raw) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!c || typeof c.test !== 'string' || !TESTS.includes(c.test)) return { code: 'branch' };
  const config = { test: c.test };
  if (c.test === 'stage') {
    const ids = Array.isArray(c.stage_ids) && c.stage_ids.length && c.stage_ids.length <= MAX_STAGES ? c.stage_ids.map(idOf) : [null];
    if (ids.includes(null)) return { code: 'stage' };
    config.stage_ids = [...new Set(ids)];
  }
  if (c.test === 'urgency') {
    if (!Number.isInteger(c.min_urgency) || c.min_urgency < 1 || c.min_urgency > MAX_URGENCY) return { code: 'branch' };
    config.min_urgency = c.min_urgency;
  }
  if (c.test === 'field') {
    if (typeof c.field_key !== 'string' || !/^\S{1,120}$/.test(c.field_key)) return { code: 'field' };
    config.field_key = c.field_key;
    if (c.value !== undefined && c.value !== null) {
      if (typeof c.value !== 'string' || c.value.length > MAX_VALUE) return { code: 'branch' };
      if (c.value.trim()) config.value = c.value.trim();
    }
  }
  return { config };
}

// What a question names must be the workspace's own: null, or 'stage' / 'field'.
async function foreignRefs(db, wid, config) {
  const c = config || {};
  if (c.test === 'stage') {
    const ids = Array.isArray(c.stage_ids) ? c.stage_ids : [];
    const { rows } = await db.query('SELECT id FROM pipeline_stages WHERE workspace_id = $1 AND id = ANY($2::int[])', [wid, ids]);
    if (rows.length !== new Set(ids).size) return 'stage';
  }
  if (c.test === 'field') {
    const { rows } = await db.query('SELECT type FROM deal_fields WHERE workspace_id = $1 AND field_key = $2', [wid, String(c.field_key || '')]);
    if (!rows.length) return 'field';
  }
  return null;
}

// A booking for the deal — or, where a booking names no deal, for its contact — made since the deal entered the
// workflow; an appointment typed in by hand and a cancelled booking are none. x: workspace_id, deal_id, contact_id,
// started_at.
async function meetingSince(pool, x) {
  const { rows } = await pool.query(
    `SELECT 1 FROM activities a
      WHERE a.workspace_id = $1 AND a.type = 'meeting' AND a.source IN ('calcom','calendly') AND a.cancelled_at IS NULL AND a.created_at >= $4
        AND (a.deal_id = $2 OR (a.deal_id IS NULL AND a.contact_id = $3)) LIMIT 1`, [x.workspace_id, x.deal_id, x.contact_id || null, x.started_at]
  );
  return rows.length > 0;
}
// A fonio call that reached the person, for the deal or its contact, since the deal entered the workflow.
async function answeredSince(pool, x) {
  const { rows } = await pool.query(
    `SELECT 1 FROM fonio_calls f
      WHERE f.workspace_id = $1 AND f.call_outcome = 'answered' AND f.result_at >= $4
        AND (f.deal_id = $2 OR (f.deal_id IS NULL AND f.contact_id = $3)) LIMIT 1`, [x.workspace_id, x.deal_id, x.contact_id || null, x.started_at]
  );
  return rows.length > 0;
}

// Whether the question is answered with yes for this deal now. x: the row the engine read — the deal's stage,
// urgency, fields and assignee, its contact's email, phone and "no more emails", and when it entered.
async function holds(pool, x, config) {
  const c = config || {};
  switch (c.test) {
    case 'stage':     return (Array.isArray(c.stage_ids) ? c.stage_ids.map(Number) : []).includes(Number(x.stage_id) || 0);
    case 'meeting':   return meetingSince(pool, x);
    case 'answered':  return answeredSince(pool, x);
    case 'opt_out':   return !!x.journey_opt_out;
    case 'has_email': return /^\S+@\S+\.\S+$/.test(String(x.contact_email || '').trim());
    case 'has_phone': return !!String(x.contact_phone || '').trim();
    case 'assigned':  return !!x.assigned_to;
    case 'urgency':   return Number(x.urgency || 0) >= Number(c.min_urgency || 0);
    case 'field': {
      const data = x.deal_data && typeof x.deal_data === 'object' ? x.deal_data : {};
      const has = Object.hasOwn(data, c.field_key) ? data[c.field_key] : null;
      const text = has === null || has === undefined ? '' : String(has).trim();
      return c.value ? text.toLowerCase() === String(c.value).trim().toLowerCase() : text !== '';
    }
    default: return false;   // a question this server does not know: the "no" line
  }
}

module.exports = { TESTS, MAX_STAGES, MAX_URGENCY, MAX_VALUE, checkBranch, foreignRefs, meetingSince, answeredSince, holds };
