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
     contact_field   the same about a field of the deal's contact (Part 20) —
                 one of the workspace's own (field_key), or one every contact
                 has (base: name, email, phone, company; Part 21). `base` is a
                 word of its own beside field_key, because a workspace may
                 have given one of its own fields the key "email".

     deal_owner, contact_owner   who the deal, or its contact, is assigned to
                 (Part 22): op is (one of user_ids) / is_not (none of them —
                 so also when assigned to nobody) / nobody
     deal_age, contact_age   when the deal, or its contact, was created
                 (Part 22): op older / newer (than `minutes` before now) or
                 before / after (the day `date` 'YYYY-MM-DD' on the clock of
                 whoever saved the box, config.tz; "after" includes the day)
   A question about the contact is answered with no when the deal has none.

   HOW A FIELD IS COMPARED (config.op, Part 20, 2026-11-23) — for both field
   questions. A box saved before has no `op`: no value means "any", a value
   means "is", and those two are still saved that way.
     any           the field has a value            empty         it has none
     is / is_not   the whole value, or not it       contains / not_contains
     starts        the value begins with it
     gt gte lt lte by size: two numbers, or two days. A number is 250000,
                   2,5 or 2.5, 300.000 or 300.000,50 (points every three
                   digits part thousands), 1,234.56, also with spaces and
                   € $ % or EUR around it. A day is 2027-03-31 or 31.03.2027.
                   What is neither on both sides is answered with no.
   Capitals and outer spaces never count. An empty field "is not" and "does not
   contain" anything. A deal without a contact answers every question about a
   contact field with no — and so does a deal whose contact the engine could
   not read (one of another workspace): what counts is the contact's fields as
   read (x.contact_data), not the id on the deal.

   A field's key is always a value in what is asked, never part of it: the
   deal's and the contact's fields are read as a whole and looked into here.

   Every function takes the pool; nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const TESTS = ['stage', 'meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned', 'urgency', 'field', 'contact_field', 'deal_owner', 'contact_owner', 'deal_age', 'contact_age'];
const OWNER_TESTS = ['deal_owner', 'contact_owner'], OWNER_OPS = ['is', 'is_not', 'nobody'];
const AGE_TESTS = ['deal_age', 'contact_age'], AGE_OPS = ['older', 'newer', 'before', 'after'];
const MAX_PEOPLE = 20, MAX_AGE = 3650 * 24 * 60;   // people in one question; the longest "older than", in minutes (ten years)
const FIELD_TESTS = ['field', 'contact_field'];
const CONTACT_BASE = ['name', 'email', 'phone', 'company'];   // what every contact has, beside the workspace's own fields
const OPS = ['any', 'empty', 'is', 'is_not', 'contains', 'not_contains', 'starts', 'gt', 'gte', 'lt', 'lte'];
const OPS_BARE = ['any', 'empty'], OPS_SIZE = ['gt', 'gte', 'lt', 'lte'];   // those without a value; those that compare by size
const MAX_STAGES = 20, MAX_URGENCY = 4, MAX_VALUE = 200;
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e10 ? v : null);

// A text as a number, or null: 250000, 2,5, 2.5, 300.000, 300.000,50, 1,234.56 — spaces and € $ % EUR around it do not count.
function numOf(v) {
  const s = String(v ?? '').replace(/\s+/g, '').replace(/^(?:€|\$|EUR)/i, '').replace(/(?:€|\$|%|EUR)$/i, '');
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) return Number(s.replace(/,/g, ''));
  return /^-?\d+(?:[.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : null;
}
// A text as a day 'YYYY-MM-DD', or null: 2027-03-31 (a time behind it does not count) or 31.03.2027.
function dayOf(v) {
  const s = String(v ?? '').trim(), iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(s), de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]].map(Number) : de ? [de[3], de[2], de[1]].map(Number) : [0, 0, 0];
  const day = new Date(Date.UTC(y, m - 1, d));
  if (!y || day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;
  return day.toISOString().slice(0, 10);
}
// The day 'YYYY-MM-DD' a moment falls on, on a zone's clock (UTC for a zone nobody knows).
function dayIn(when, tz) {
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return null;
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
  catch (e) { return at.toISOString().slice(0, 10); }
}
// How a field question compares: its `op`, the one a box saved before Part 20 means, or null for one nobody knows.
function opOf(c) {
  if (c.op === undefined || c.op === null) return c.value ? 'is' : 'any';
  return typeof c.op === 'string' && OPS.includes(c.op) ? c.op : null;
}

// A branch box's settings as sent: { config } with only what its question uses, or { code }: branch (no such
// question, or one of its settings is missing or cannot be), stage, field.
function checkBranch(raw, { tz } = {}) {   // tz: the zone of who saves the box, kept where a day is compared
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
  if (OWNER_TESTS.includes(c.test)) {
    if (typeof c.op !== 'string' || !OWNER_OPS.includes(c.op)) return { code: 'branch' };
    config.op = c.op;
    if (c.op !== 'nobody') {
      const ids = Array.isArray(c.user_ids) && c.user_ids.length && c.user_ids.length <= MAX_PEOPLE ? c.user_ids.map(idOf) : [null];
      if (ids.includes(null)) return { code: 'user' };
      config.user_ids = [...new Set(ids)];
    }
  }
  if (AGE_TESTS.includes(c.test)) {
    if (typeof c.op !== 'string' || !AGE_OPS.includes(c.op)) return { code: 'branch' };
    config.op = c.op;
    if (c.op === 'older' || c.op === 'newer') {
      if (!Number.isInteger(c.minutes) || c.minutes < 1 || c.minutes > MAX_AGE) return { code: 'branch' };
      config.minutes = c.minutes;
    } else {
      if (typeof c.date !== 'string' || dayOf(c.date) !== c.date) return { code: 'branch' };   // a day there is, written 'YYYY-MM-DD' and nothing around it
      config.date = c.date;
      config.tz = typeof tz === 'string' && tz ? tz : 'UTC';   // never a zone that was sent
    }
  }
  if (FIELD_TESTS.includes(c.test)) {
    if (c.test === 'contact_field' && c.base !== undefined && c.base !== null) {   // one every contact has: no key beside it
      if (typeof c.base !== 'string' || !CONTACT_BASE.includes(c.base)) return { code: 'field' };
      config.base = c.base;
    } else {
      if (typeof c.field_key !== 'string' || !/^\S{1,120}$/.test(c.field_key)) return { code: 'field' };
      config.field_key = c.field_key;
    }
    const none = c.value === undefined || c.value === null;
    if (!none && (typeof c.value !== 'string' || c.value.length > MAX_VALUE)) return { code: 'branch' };
    const value = none ? '' : c.value.trim(), op = opOf({ op: c.op, value });
    if (!op) return { code: 'branch' };
    if (OPS_BARE.includes(op)) { if (op !== 'any') config.op = op; return { config }; }
    if (!value || (OPS_SIZE.includes(op) && numOf(value) === null && !dayOf(value))) return { code: 'branch' };   // nothing to compare with, or nothing that has a size
    if (op !== 'is') config.op = op;
    config.value = value;
  }
  return { config };
}

// What a question names must be the workspace's own: null, or 'stage' / 'field' / 'user'.
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
  if (OWNER_TESTS.includes(c.test) && c.op !== 'nobody') {   // a person of the workspace: at home there, or a member of it
    const ids = Array.isArray(c.user_ids) ? c.user_ids : [];
    const { rows } = await db.query(
      'SELECT u.id FROM users u WHERE u.id = ANY($2::int[]) AND (u.workspace_id = $1 OR EXISTS (SELECT 1 FROM user_workspaces uw WHERE uw.user_id = u.id AND uw.workspace_id = $1))', [wid, ids]
    );
    if (rows.length !== new Set(ids).size) return 'user';
  }
  if (c.test === 'contact_field' && !c.base) {   // what every contact has needs no looking up
    const { rows } = await db.query('SELECT type FROM custom_fields WHERE workspace_id = $1 AND field_key = $2', [wid, String(c.field_key || '')]);
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

// Whether a record's fields (a deal's or a contact's custom_data) answer a field question with yes.
function fieldHolds(data, c) {
  const own = data && typeof data === 'object' ? data : {};
  const has = Object.hasOwn(own, c.field_key) ? own[c.field_key] : null;
  const text = has === null || has === undefined ? '' : String(has).trim();
  const want = String(c.value ?? '').trim(), a = text.toLowerCase(), b = want.toLowerCase(), op = opOf(c);
  if (op === 'any') return text !== '';
  if (op === 'empty') return text === '';
  if (op === 'is') return a === b;
  if (op === 'is_not') return a !== b;
  if (op === 'contains') return b !== '' && a.includes(b);
  if (op === 'not_contains') return !a.includes(b);   // nothing to look for: every text "contains" it, so no
  if (op === 'starts') return b !== '' && a.startsWith(b);
  if (!OPS_SIZE.includes(op)) return false;   // a comparison this server does not know: the "no" line
  const n = [numOf(text), numOf(want)], days = [dayOf(text), dayOf(want)];
  const [x, y] = n[0] !== null && n[1] !== null ? n : days[0] && days[1] ? days : [null, null];
  if (x === null) return false;
  return op === 'gt' ? x > y : op === 'gte' ? x >= y : op === 'lt' ? x < y : x <= y;
}

// A question about what every contact has, asked like one about a field: the contact as the engine read it.
function baseHolds(x, c) {
  if (typeof c.base !== 'string' || !CONTACT_BASE.includes(c.base)) return false;   // one a newer server knows: the "no" line
  return fieldHolds({ name: x.contact_name, email: x.contact_email, phone: x.contact_phone, company: x.contact_company }, { ...c, field_key: c.base });
}

// Who it is assigned to: one of the named people, none of them (so also nobody), or nobody.
function ownerHolds(who, c) {
  const id = Number(who) || 0, ids = Array.isArray(c.user_ids) ? c.user_ids.map(Number) : [];
  return c.op === 'nobody' ? !id : c.op === 'is' ? !!id && ids.includes(id) : c.op === 'is_not' ? !ids.includes(id) : false;
}
// When it was created: longer ago than `minutes`, or less; before the day, or on it or later (on the saver's clock).
function ageHolds(created, c, now) {
  const at = created === null || created === undefined ? NaN : new Date(created).getTime();
  if (Number.isNaN(at)) return false;
  if (c.op === 'older' || c.op === 'newer') {
    const span = Number(c.minutes) * 60000;
    if (!(span > 0)) return false;
    return c.op === 'older' ? new Date(now).getTime() - at >= span : new Date(now).getTime() - at < span;
  }
  const day = dayIn(at, c.tz), date = dayOf(c.date);
  if (!day || !date) return false;
  return c.op === 'before' ? day < date : c.op === 'after' ? day >= date : false;
}

// Whether the question is answered with yes for this deal now. x: the row the engine read — the deal's stage,
// urgency, fields, assignee and creation, its contact's email, phone, fields, assignee, creation and "no more
// emails", and when it entered. now: the moment the question is asked (an age is counted back from it).
async function holds(pool, x, config, { now = new Date() } = {}) {
  const c = config || {};
  const contact = !!x.contact_data && typeof x.contact_data === 'object';   // the contact as read: none, or one of another workspace, is no contact
  switch (c.test) {
    case 'stage':     return (Array.isArray(c.stage_ids) ? c.stage_ids.map(Number) : []).includes(Number(x.stage_id) || 0);
    case 'meeting':   return meetingSince(pool, x);
    case 'answered':  return answeredSince(pool, x);
    case 'opt_out':   return !!x.journey_opt_out;
    case 'has_email': return /^\S+@\S+\.\S+$/.test(String(x.contact_email || '').trim());
    case 'has_phone': return !!String(x.contact_phone || '').trim();
    case 'assigned':  return !!x.assigned_to;
    case 'urgency':   return Number(x.urgency || 0) >= Number(c.min_urgency || 0);
    case 'field':         return fieldHolds(x.deal_data, c);
    // no contact, no answer but no — and "no contact" is what the engine could not read: a deal with none, or one
    // that names a contact of another workspace (a contact that was read always has its fields, were it {})
    case 'deal_owner':    return ownerHolds(x.assigned_to, c);
    case 'contact_owner': return contact && ownerHolds(x.contact_assigned_to, c);
    case 'deal_age':      return ageHolds(x.deal_created_at, c, now);
    case 'contact_age':   return contact && ageHolds(x.contact_created_at, c, now);
    case 'contact_field': return contact && (c.base !== undefined && c.base !== null ? baseHolds(x, c) : fieldHolds(x.contact_data, c));
    default: return false;   // a question this server does not know: the "no" line
  }
}

module.exports = { TESTS, FIELD_TESTS, CONTACT_BASE, OPS, OPS_BARE, OPS_SIZE, OWNER_TESTS, OWNER_OPS, AGE_TESTS, AGE_OPS, MAX_STAGES, MAX_URGENCY, MAX_VALUE, MAX_PEOPLE, MAX_AGE, dayIn, numOf, dayOf, checkBranch, foreignRefs, meetingSince, answeredSince, holds };
