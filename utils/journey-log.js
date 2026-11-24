/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY LOG — the whole record of what the workflows do
   (CUSTOMER_JOURNEY_CHANGES Part 15, 2026-11-20; written by
   utils/journey-run.js and routes/journey.js, read through
   GET /api/journey/history; table journey_log).

   Before this, journey_log held one row per step. Nothing said when a deal
   entered a workflow or left it, that a step was tried again, or who changed a
   workflow — and deleting a workflow deleted its rows. Now EVERYTHING is an
   entry, and an entry stays: it carries the workflow's name and the deal's
   title as they were, so it still reads when the workflow, the step or the
   deal is gone (flow_id, node_id and deal_id are then empty).

   AN ENTRY'S `event`
     step      a box did its thing — kind, title, status done | skipped |
               failed, detail (why, or what: an address, a stage, yes / no)
     retry     a step will be tried again — status 'retry', detail = why
     entered   a deal was taken in — detail = the start's trigger key when the
               start took it in, 'manual' when a person put it in, 'restart'
               when a person put in a deal that was already in it (actor set)
     ended     the workflow is over for the deal — status 'done' (it ran to
               its end) or 'stopped' (detail = the reason word)
     moved     a deal that waited at a step which was deleted was put on —
               detail 'step_deleted', kind and title = the deleted step's
     flow      something was done to the workflow itself, with who did it —
               detail one of FLOW_DETAILS; kind and title = the step's where
               it is about a step, title = the name for created / renamed /
               deleted
   kind and status are '' where an entry has none. A 'flow' entry names no
   deal.

   WRITING  write() throws like any statement; record() NEVER throws — a
   record that cannot be written is said in the server's log and the workflow
   goes on. (The step entry in runOne is written with write(): a step whose
   outcome cannot be written down must not move on as if it had been.)
   Whoever writes hands in what it has; a workflow's name, a deal's title and
   a person's name that are not handed in are read in the same statement.

   READING  history(): newest first, a page at a time (before = the last id
   seen), narrowed by workflow, deal, group of events and a text. Every value
   is checked here and handed to the statement — never part of it. A caller
   may hand in scope(params): one more condition written by the route (which
   entries this person may read — routes/journey.js, utils/visibility.js), its
   value pushed onto the statement's values. Without it: the whole record.

   Takes the pool; opens nothing itself.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const EVENTS = ['step', 'retry', 'entered', 'ended', 'moved', 'flow'];
const GROUPS = { steps: ['step', 'retry'], deals: ['entered', 'ended', 'moved'], flow: ['flow'] };   // what the page's three filters show
const FLOW_DETAILS = ['created', 'renamed', 'switched_on', 'switched_off', 'deleted', 'step_added', 'step_changed', 'step_deleted', 'line_changed', 'start_changed'];
const BY_HAND = ['manual', 'restart'];   // how a person puts a deal in; anything else in an 'entered' entry is a start's trigger key
const MAX_Q = 100, MAX_LIMIT = 200, DEFAULT_LIMIT = 50, MAX_TITLE = 200, MAX_DETAIL = 300, MAX_NAME = 200;

const idOf = v => { const n = typeof v === 'number' ? v : /^[1-9]\d{0,9}$/.test(String(v ?? '')) ? Number(v) : NaN; return Number.isInteger(n) && n > 0 && n < 2147483648 ? n : null; };
const text = (v, max) => String(v ?? '').slice(0, max);
const given = (v, max) => (v === undefined || v === null ? null : String(v).slice(0, max));   // null: read it in the statement

// One statement writes an entry with its names: what the caller did not hand in is read from the workflow, the deal
// and the person — within this workspace.
const WRITE = `INSERT INTO journey_log (workspace_id, flow_id, node_id, deal_id, kind, title, status, detail, event, flow_name, deal_title, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       COALESCE($10::text, (SELECT f.name FROM journey_flows f WHERE f.id = $2 AND f.workspace_id = $1), ''),
       COALESCE($11::text, (SELECT d.title FROM deals d WHERE d.id = $4 AND d.workspace_id = $1), ''),
       $12,
       COALESCE($13::text, (SELECT u.name FROM users u WHERE u.id = $12), ''))
     RETURNING id`;

// An entry as the statement's values. e: { workspaceId, event, flowId, nodeId, dealId, kind, title, status, detail,
// flowName, dealTitle, actorId, actorName } — only the workspace and the event are needed.
function valuesOf(e) {
  const wid = idOf(e && e.workspaceId);
  if (!wid) throw new Error('journey log: an entry needs its workspace');
  if (!EVENTS.includes(e.event)) throw new Error(`journey log: no such event: ${String(e.event)}`);
  const detail = e.detail === undefined || e.detail === null || e.detail === '' ? null : String(e.detail).slice(0, MAX_DETAIL);
  return [wid, idOf(e.flowId), idOf(e.nodeId), idOf(e.dealId), text(e.kind, 40), text(e.title, MAX_TITLE), text(e.status, 40), detail, e.event,
    given(e.flowName, MAX_NAME), given(e.dealTitle, MAX_NAME), idOf(e.actorId), given(e.actorName, MAX_NAME)];
}

// Writes an entry; the id it got. Throws when it cannot be written.
async function write(db, e) {
  const { rows: [row] } = await db.query(WRITE, valuesOf(e));
  return row ? row.id : null;
}
// Writes an entry and never throws: what cannot be written is said in the server's log, and null is answered.
async function record(db, e) {
  try { return await write(db, e); }
  catch (err) { console.error('journey: an entry of the record could not be written:', err?.message || err); return null; }
}

// One value of the query string: undefined when it is not there (or empty), null when it is no plain text.
const one = v => (v === undefined || v === null || v === '' ? undefined : typeof v === 'string' ? v : null);
// What is asked for, checked: { flowId, dealId, events, q, before, limit } or { code: 'history' }.
function checkQuery(query) {
  const raw = query && typeof query === 'object' && !Array.isArray(query) ? query : {};
  const out = { flowId: null, dealId: null, events: null, q: null, before: null, limit: DEFAULT_LIMIT };
  for (const [name, to] of [['flow_id', 'flowId'], ['deal_id', 'dealId'], ['before', 'before']]) {
    const v = one(raw[name]);
    if (v === undefined) continue;
    const id = v === null ? null : /^[1-9]\d{0,9}$/.test(v) ? idOf(v) : null;
    if (!id) return { code: 'history' };
    out[to] = id;
  }
  const group = one(raw.group);
  if (group !== undefined) {
    if (group === null || !Object.hasOwn(GROUPS, group)) return { code: 'history' };
    out.events = GROUPS[group];
  }
  const q = one(raw.q);
  if (q !== undefined) {
    if (q === null || q.length > MAX_Q) return { code: 'history' };
    out.q = q.trim() || null;
  }
  const limit = one(raw.limit);
  if (limit !== undefined) {
    if (limit === null || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > MAX_LIMIT) return { code: 'history' };
    out.limit = Number(limit);
  }
  return out;
}

// The record of a workspace, newest first: { entries, more } or { code: 'history' }. One entry more than asked for is
// read, to know whether older ones exist. The text is looked for as it is — no pattern, so nothing in it means more
// than its letters.
async function history(db, wid, query, { scope = null } = {}) {
  const ask = checkQuery(query);
  if (ask.code) return ask;
  const params = [wid, ask.flowId, ask.dealId, ask.events, ask.q, ask.before, ask.limit + 1];
  const held = scope ? scope(params) : '';
  const { rows } = await db.query(
    `SELECT l.id, l.created_at, l.event, l.flow_id, l.flow_name, l.deal_id, l.deal_title, l.kind, l.title, l.status, l.detail, l.actor_name
       FROM journey_log l
      WHERE l.workspace_id = $1
        AND ($2::int IS NULL OR l.flow_id = $2)
        AND ($3::int IS NULL OR l.deal_id = $3)
        AND ($4::text[] IS NULL OR l.event = ANY($4::text[]))
        AND ($5::text IS NULL OR POSITION(LOWER($5) IN LOWER(l.deal_title)) > 0 OR POSITION(LOWER($5) IN LOWER(l.title)) > 0 OR POSITION(LOWER($5) IN LOWER(l.flow_name)) > 0)
        AND ($6::int IS NULL OR l.id < $6)${held}
      ORDER BY l.id DESC LIMIT $7`,
    params
  );
  return { entries: rows.slice(0, ask.limit), more: rows.length > ask.limit };
}

module.exports = { EVENTS, GROUPS, FLOW_DETAILS, BY_HAND, MAX_Q, MAX_LIMIT, DEFAULT_LIMIT, valuesOf, write, record, checkQuery, history };
