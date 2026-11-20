/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY TRIGGERS — everything that can start a workflow
   (CUSTOMER_JOURNEY_CHANGES Part 9, 2026-11-19; utils/journey-run.js asks
   find() every tick, routes/journey.js checks a start with checkStart() and
   foreignRefs(), public/js/journey-start.js is the window that chooses one).

   A WORKFLOW RUNS ON A DEAL. So every start answers one question each tick:
   which deals does this workflow take in now? find() answers
   [{ dealId, key }]: the deal, and the key of what happened (''
   for a start a deal goes through once). A deal is taken in once per key
   (journey_runs: flow + deal + event_key), so a second meeting, a second task
   or a second change starts the workflow again, and nothing starts it twice.
   Something that happens to a CONTACT (a call, a booking without a deal, a
   field, a document) counts for the deal it names, else for that contact's
   newest deal: one deal, so nobody gets everything twice. A contact without
   any deal starts nothing.

   NOTHING FROM BEFORE. A start only sees what happens after the workflow was
   switched on (flow.activated_at): a deal made, a meeting booked, a moment
   reached after that. A deal from before is put in by hand ("Add to a
   workflow"). Switching on never sets off a wave.

   THREE WAYS A START SEES WHAT HAPPENED — no route has to report anything:
     a row with its time   a deal, a booking, a document, a call's result:
                           made (or ended) since the workflow was switched on
     a change              the CRM keeps no history of who was assigned or
                           what a field held, so journey_watch remembers the
                           last value this workflow saw per deal, contact,
                           meeting or task; a tick that finds another value
                           has found a change. baseline() fills it when the
                           workflow is switched on, so what is there already
                           is no change.
     a moment              so many hours before a meeting, so many days in a
                           stage, a date in a field, a weekday at a time

   THE STARTS, by the category the window shows them under (TRIGGERS has what
   each one's settings are):
     deals      lead · deal_manual · deal_import · deal_new · stage ·
                stage_left · assigned · urgency · deal_field · manual
     contacts   contact_field · document
     calls      call_result · call_inbound
     meetings   meeting_booked · meeting_moved · meeting_cancelled ·
                meeting_before · meeting_after · notetaker
     tasks      task_done · task_overdue
     time       stage_days · quiet_days · date_field · schedule
     other      opt_out · onboarding_done · flow_done
   Every start may be limited to one pipeline (pipeline_id).

   WHERE A WORKFLOW ENDS FOR A DEAL (Part 10) is saved with its start, and any
   of it ends it — looked at each time a step is due (utils/journey-run.js):
     stop_stage_ids   the deal is in one of these stages
     stay_stage_ids   the deal is in none of these stages any more ("runs only
                      while the deal is in …"); both stage rules may be set
     stop_on          the other rules that are switched on, and
     stop_set         the settings of those that have any (Part 13: fifteen
                      rules — the deal is assigned, a field has a value, a
                      call's result, a document, a task, so many days … —
                      all of them in utils/journey-ends.js)

   A FIELD'S KEY NEVER BECOMES PART OF A STATEMENT: it is always a parameter
   (custom_data->>$n), and it is saved only when it is one of the workspace's
   own fields.

   Every function takes the pool; nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom      = require('./calcom');         // wallClock, utcFromWallClock: a moment on a zone's clock
const fonioResult = require('./fonio-result');   // readResult: what a call's Body says
const fonioStage  = require('./fonio-stage');    // eventOf, EVENTS: what came out of a call, as the stage rules read it
const ends        = require('./journey-ends');   // everything that can end a workflow for a deal, beside its stage (Part 13)

const CATEGORIES = ['deals', 'contacts', 'calls', 'meetings', 'tasks', 'time', 'other'];
// key → its category and the settings it uses (beside pipeline_id and stop_stage_ids, which every start has)
const TRIGGERS = {
  lead:              { cat: 'deals',    uses: ['webhook_ids'] },
  deal_manual:       { cat: 'deals',    uses: [] },
  deal_import:       { cat: 'deals',    uses: [] },
  deal_new:          { cat: 'deals',    uses: [] },
  stage:             { cat: 'deals',    uses: ['stage_id'] },
  stage_left:        { cat: 'deals',    uses: ['stage_id'] },
  assigned:          { cat: 'deals',    uses: [] },
  urgency:           { cat: 'deals',    uses: ['min_urgency'] },
  deal_field:        { cat: 'deals',    uses: ['field_key', 'value'] },
  manual:            { cat: 'deals',    uses: [] },
  contact_field:     { cat: 'contacts', uses: ['field_key', 'value'] },
  document:          { cat: 'contacts', uses: ['doc_type'] },
  call_result:       { cat: 'calls',    uses: ['result'] },
  call_inbound:      { cat: 'calls',    uses: [] },
  meeting_booked:    { cat: 'meetings', uses: [] },
  meeting_moved:     { cat: 'meetings', uses: [] },
  meeting_cancelled: { cat: 'meetings', uses: [] },
  meeting_before:    { cat: 'meetings', uses: ['hours'] },
  meeting_after:     { cat: 'meetings', uses: ['hours'] },
  notetaker:         { cat: 'meetings', uses: [] },
  task_done:         { cat: 'tasks',    uses: [] },
  task_overdue:      { cat: 'tasks',    uses: [] },
  stage_days:        { cat: 'time',     uses: ['stage_id', 'days'] },
  quiet_days:        { cat: 'time',     uses: ['days'] },
  date_field:        { cat: 'time',     uses: ['field_key', 'offset_days', 'at'] },
  schedule:          { cat: 'time',     uses: ['stage_id', 'weekdays', 'at'] },
  opt_out:           { cat: 'other',    uses: [] },
  onboarding_done:   { cat: 'other',    uses: [] },
  flow_done:         { cat: 'other',    uses: ['flow_id'] },
};
const DOC_TYPES = ['vertrag', 'aufnahme', 'sonstiges'];   // contact_documents.typ
const { STOP_ON, STOP_CATEGORIES, STOP_USES } = ends;      // what ends a workflow for a deal, beside its stage (Parts 10 and 13): utils/journey-ends.js
const RESULTS = fonioStage.EVENTS;                         // interested, meeting_booked, callback, not_interested, wrong_person, not_reached
const MAX_HOURS = 720, MAX_DAYS = 365, MAX_URGENCY = 4, MAX_VALUE = 200, MAX_IDS = 20;
const ENROLL_LIMIT = 200;      // deals one workflow takes in in one tick
const WATCH_LIMIT = 500;       // changes one workflow looks at in one tick
const RESULT_WAIT_MS = 60000;  // a call's result is read a minute after it came: its retry or callback is booked by then
const DAY_MS = 86400000;
const FALLBACK_ZONE = 'Europe/Berlin';

const isTrigger = key => typeof key === 'string' && Object.hasOwn(TRIGGERS, key);
const usesOf = key => (isTrigger(key) ? TRIGGERS[key].uses : []);
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e10 ? v : null);
const intIn = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
// A list of ids as sent: distinct whole numbers, at most MAX_IDS — or undefined when it is anything else.
function idList(value) {
  if (!Array.isArray(value) || value.length > MAX_IDS) return undefined;
  const ids = value.map(idOf);
  return ids.includes(null) ? undefined : [...new Set(ids)];
}

// ── a start as it is saved ──────────────────────────────────────────────────
// The settings as sent, as a start: { config } or { code }. What does not belong to the chosen start is left out.
// The four fields every saved start has had since Part 3 are always there; a start's own settings only when it has
// them. tz: the zone of who saves it, kept with a time of day (as a task keeps its zone).
// codes: start (no such start or end rule, or one of its settings is missing or cannot be), stage, webhooks,
// pipeline, field, flow.
function checkStart(raw, { tz = null } = {}) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!c) return { code: 'start' };
  const trigger = c.trigger === undefined ? null : c.trigger;
  if (trigger !== null && !isTrigger(trigger)) return { code: 'start' };
  const uses = usesOf(trigger), has = f => uses.includes(f);
  const given = v => v !== undefined && v !== null;

  const webhooks = has('webhook_ids') && given(c.webhook_ids) ? idList(c.webhook_ids) : null;   // null: every lead webhook
  if (webhooks === undefined) return { code: 'webhooks' };
  const stageId = has('stage_id') ? idOf(c.stage_id) : null;
  if (has('stage_id') && !stageId) return { code: 'stage' };
  const stops = given(c.stop_stage_ids) ? idList(c.stop_stage_ids) : [];
  if (stops === undefined) return { code: 'stage' };
  const config = { trigger, webhook_ids: webhooks, stage_id: stageId, stop_stage_ids: stops };
  // where the workflow ends beside the stop stages (Part 10): saved only when set
  const stays = given(c.stay_stage_ids) ? idList(c.stay_stage_ids) : [];
  if (stays === undefined) return { code: 'stage' };
  if (stays.length) config.stay_stage_ids = stays;
  // the other rules (Part 13): which are switched on, and the settings of those that have any
  const ended = ends.checkEnds(c, { DOC_TYPES, RESULTS, MAX_DAYS, MAX_URGENCY, MAX_VALUE });
  if (ended.code) return { code: ended.code };
  if (ended.stop_on.length) config.stop_on = ended.stop_on;
  if (Object.keys(ended.stop_set).length) config.stop_set = ended.stop_set;

  if (given(c.pipeline_id)) {
    if (!idOf(c.pipeline_id)) return { code: 'pipeline' };
    config.pipeline_id = c.pipeline_id;
  }
  if (has('min_urgency') && given(c.min_urgency)) {
    if (!intIn(c.min_urgency, 1, MAX_URGENCY)) return { code: 'start' };
    config.min_urgency = c.min_urgency;
  }
  if (has('field_key')) {
    if (typeof c.field_key !== 'string' || !/^\S{1,120}$/.test(c.field_key)) return { code: 'field' };
    config.field_key = c.field_key;
  }
  if (has('value') && given(c.value)) {
    if (typeof c.value !== 'string' || c.value.length > MAX_VALUE) return { code: 'start' };
    if (c.value.trim()) config.value = c.value.trim();
  }
  if (has('doc_type') && given(c.doc_type)) {
    if (!DOC_TYPES.includes(c.doc_type)) return { code: 'start' };
    config.doc_type = c.doc_type;
  }
  if (has('result')) {
    if (!RESULTS.includes(c.result)) return { code: 'start' };
    config.result = c.result;
  }
  if (has('hours')) {
    if (!intIn(c.hours, 1, MAX_HOURS)) return { code: 'start' };
    config.hours = c.hours;
  }
  if (has('days')) {
    if (!intIn(c.days, 1, MAX_DAYS)) return { code: 'start' };
    config.days = c.days;
  }
  if (has('offset_days')) {
    const off = given(c.offset_days) ? c.offset_days : 0;
    if (intIn(off, -MAX_DAYS, MAX_DAYS) === null) return { code: 'start' };
    config.offset_days = off;
  }
  if (has('weekdays')) {
    const days = Array.isArray(c.weekdays) ? [...new Set(c.weekdays)] : [];
    if (!days.length || days.some(d => !intIn(d, 1, 7))) return { code: 'start' };
    config.weekdays = days.sort((a, b) => a - b);
  }
  if (has('at')) {
    if (typeof c.at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.at)) return { code: 'start' };
    config.at = c.at;
    config.tz = typeof tz === 'string' && tz ? tz : FALLBACK_ZONE;
  }
  if (has('flow_id')) {
    if (!idOf(c.flow_id)) return { code: 'flow' };
    config.flow_id = c.flow_id;
  }
  return { config };
}

// The ids of `table` that are NOT this workspace's own.
async function foreignIds(db, table, wid, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE workspace_id = $1 AND id = ANY($2::int[])`, [wid, ids]);
  const own = new Set(rows.map(r => Number(r.id)));
  return ids.filter(id => !own.has(Number(id)));
}

// What a start names must be this workspace's own: null, or the code of what is not — stage, webhooks, pipeline,
// field (no such field here, or not a date for a start that needs one), flow (no such other workflow), loop (the
// other workflow starts, directly or through others, when this one ends). flowId: the workflow the start is of.
async function foreignRefs(db, wid, flowId, config) {
  const c = config || {};
  const stages = [...(c.stage_id ? [c.stage_id] : []), ...(Array.isArray(c.stop_stage_ids) ? c.stop_stage_ids : []), ...(Array.isArray(c.stay_stage_ids) ? c.stay_stage_ids : [])];
  if ((await foreignIds(db, 'pipeline_stages', wid, stages)).length) return 'stage';
  if (Array.isArray(c.webhook_ids) && (await foreignIds(db, 'workspace_webhook', wid, c.webhook_ids)).length) return 'webhooks';
  if (c.pipeline_id && (await foreignIds(db, 'pipelines', wid, [c.pipeline_id])).length) return 'pipeline';
  if (usesOf(c.trigger).includes('field_key')) {
    const table = c.trigger === 'contact_field' ? 'custom_fields' : 'deal_fields';
    const { rows: [field] } = await db.query(`SELECT type FROM ${table} WHERE workspace_id = $1 AND field_key = $2`, [wid, String(c.field_key || '')]);
    if (!field || (c.trigger === 'date_field' && field.type !== 'date')) return 'field';
  }
  if (c.trigger === 'flow_done') {
    if (Number(c.flow_id) === Number(flowId)) return 'flow';
    // every workflow's start that waits for another workflow: following them from the named one must not lead back
    const { rows } = await db.query(
      `SELECT f.id, s.config FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.workspace_id = $1`, [wid]
    );
    const after = new Map(rows.map(r => [Number(r.id), r.config && r.config.trigger === 'flow_done' ? Number(r.config.flow_id) : null]));
    if (!after.has(Number(c.flow_id))) return 'flow';
    for (let at = Number(c.flow_id), steps = 0; at && steps <= rows.length; at = after.get(at), steps++) if (at === Number(flowId)) return 'loop';
  }
  return ends.foreignEnds(db, wid, flowId, c);   // what its end rules name: a deal field, a contact field, another workflow
}

// ── a moment on a zone's clock ──────────────────────────────────────────────
const shiftDay = (day, n) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n)).toISOString().slice(0, 10);
const weekdayOf = day => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))).getUTCDay() || 7;   // 1 Monday … 7 Sunday
const instantOf = (day, time, tz) => { const iso = calcom.utcFromWallClock(day, time, tz || FALLBACK_ZONE); return iso ? new Date(iso).getTime() : null; };
// The latest day whose time `at` has come on the zone's clock: today from `at` on, yesterday before.
function dayReached(when, at, tz) {
  const here = calcom.wallClock(new Date(when).toISOString(), tz || FALLBACK_ZONE);
  return here.time >= at ? here.date : shiftDay(here.date, -1);
}
// The first day whose time `at` comes at or after `when`.
function dayFrom(when, at, tz) {
  const here = calcom.wallClock(new Date(when).toISOString(), tz || FALLBACK_ZONE);
  const t = instantOf(here.date, at, tz);
  return t !== null && t >= new Date(when).getTime() ? here.date : shiftDay(here.date, 1);
}
// The first moment at or after `when` that is `at` o'clock on the zone's clock, on one of the weekdays (1 Monday … 7
// Sunday; none named: every day). Milliseconds; null when `at` is no time. For a Wait box that holds on until a time.
function nextMoment(when, at, tz, weekdays) {
  if (typeof at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return null;
  const days = Array.isArray(weekdays) && weekdays.length ? weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  let day = dayFrom(when, at, tz);
  for (let i = 0; i < 7 && !days.includes(weekdayOf(day)); i++) day = shiftDay(day, 1);
  return days.includes(weekdayOf(day)) ? instantOf(day, at, tz) : null;
}

// ── what the statements share ───────────────────────────────────────────────
// Every statement gets the same first four values: $1 the workspace, $2 the workflow, $3 its pipeline (or NULL for
// all), $4 how many at most; a start's own values follow from $5.
const pipeOf = c => (c && c.pipeline_id ? Number(c.pipeline_id) : null);   // the pipeline a start is limited to, or NULL for all
const head = flow => [flow.workspace_id, flow.id, pipeOf(flow.config), ENROLL_LIMIT];
// The deal of something that names a contact and maybe a deal: that deal, else the contact's newest — its newest IN
// THE WORKFLOW'S PIPELINE where the start is limited to one (a contact's newer deal in another pipeline must not hide
// the one this workflow is for). `pipe` is the statement's value that holds the pipeline.
const dealOf = (x, pipe = '$3') => `COALESCE(${x}.deal_id, (SELECT MAX(d2.id) FROM deals d2 WHERE d2.contact_id = ${x}.contact_id AND d2.workspace_id = ${x}.workspace_id AND (${pipe}::int IS NULL OR d2.pipeline_id = ${pipe})))`;
// A key that holds for ONE switching-on of the workflow. Change counts start again each time a workflow is switched
// on (baseline), so a key made of a count alone would come round again and the change be taken for one already seen.
const roundOf = flow => new Date(flow.activated_at).getTime();
const DONE_TASK = `t.status = COALESCE((SELECT s.key FROM task_project_statuses s WHERE s.project_id = t.project_id ORDER BY s.position DESC, s.id DESC LIMIT 1), 'done')`;
const BOOKED = `a.type = 'meeting' AND a.source IN ('calcom','calendly')`;   // a booking, not an appointment typed in by hand

// A start a deal goes through once: the deals made since the workflow was switched on that it has not seen.
async function madeSince(pool, flow, where = 'TRUE', params = []) {
  const { rows } = await pool.query(
    `SELECT d.id AS deal_id FROM deals d
      WHERE d.workspace_id = $1 AND d.created_at >= $5 AND ($3::int IS NULL OR d.pipeline_id = $3)
        AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = $2 AND r.deal_id = d.id)
        AND (${where})
      ORDER BY d.id LIMIT $4`, [...head(flow), flow.activated_at, ...params]
  );
  return rows.map(r => ({ dealId: r.deal_id, key: '' }));
}
// Things that happened, each with its deal and its key (the statement `sql` yields deal_id and key): those whose deal
// is this workspace's, in the workflow's pipeline, and not taken in for that key yet.
async function happened(pool, flow, sql, params = []) {
  const { rows } = await pool.query(
    `SELECT e.deal_id, e.key FROM (${sql}) e JOIN deals d ON d.id = e.deal_id AND d.workspace_id = $1
      WHERE ($3::int IS NULL OR d.pipeline_id = $3)
        AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = $2 AND r.deal_id = e.deal_id AND r.event_key = e.key)
      ORDER BY e.key, e.deal_id LIMIT $4`, [...head(flow), ...params]
  );
  return rows.map(r => ({ dealId: r.deal_id, key: r.key }));
}
// The same for a list worked out here ({ dealId, key }): those in the pipeline, not taken in yet.
async function notYet(pool, flow, list) {
  if (!list.length) return [];
  const [wid, fid, pipeline] = head(flow);
  const { rows: deals } = await pool.query(
    'SELECT d.id FROM deals d WHERE d.workspace_id = $1 AND d.id = ANY($2::int[]) AND ($3::int IS NULL OR d.pipeline_id = $3)', [wid, [...new Set(list.map(x => Number(x.dealId)))], pipeline]
  );
  const mine = new Set(deals.map(d => Number(d.id)));
  const { rows: runs } = await pool.query('SELECT deal_id, event_key FROM journey_runs WHERE flow_id = $1 AND event_key = ANY($2::text[])', [fid, [...new Set(list.map(x => x.key))]]);
  const seen = new Set(runs.map(r => `${r.deal_id}|${r.event_key}`));
  return list.filter(x => mine.has(Number(x.dealId)) && !seen.has(`${x.dealId}|${x.key}`));   // all of them: a change is written down as seen, so one cut off here would be lost
}

// ── changes: what journey_watch remembers ───────────────────────────────────
// What each watching start looks at now: a statement that yields subject (what is watched), deal_id (the deal a
// change of it counts for) and value (text), with the workspace as $1 and the start's own values from $3.
const WATCHES = {
  stage_left:      () => ({ sql: `SELECT d.id::text AS subject, d.id AS deal_id, COALESCE(d.stage_id, 0)::text AS value FROM deals d WHERE d.workspace_id = $1` }),
  stage_days:      () => ({ sql: `SELECT d.id::text AS subject, d.id AS deal_id, COALESCE(d.stage_id, 0)::text AS value FROM deals d WHERE d.workspace_id = $1` }),
  assigned:        () => ({ sql: `SELECT d.id::text AS subject, d.id AS deal_id, COALESCE(d.assigned_to, 0)::text AS value FROM deals d WHERE d.workspace_id = $1` }),
  urgency:         () => ({ sql: `SELECT d.id::text AS subject, d.id AS deal_id, COALESCE(d.urgency, 0)::text AS value FROM deals d WHERE d.workspace_id = $1` }),
  deal_field:      c => ({ sql: `SELECT d.id::text AS subject, d.id AS deal_id, COALESCE(d.custom_data->>$3::text, '') AS value FROM deals d WHERE d.workspace_id = $1`, params: [String(c.field_key || '')] }),
  // what belongs to a contact counts for the contact's newest deal — in the workflow's pipeline, where it has one
  contact_field:   c => ({ sql: `SELECT c.id::text AS subject, (SELECT MAX(d.id) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = c.workspace_id AND ($4::int IS NULL OR d.pipeline_id = $4)) AS deal_id,
                                        COALESCE(c.custom_data->>$3::text, '') AS value FROM contacts c WHERE c.workspace_id = $1`, params: [String(c.field_key || ''), pipeOf(c)] }),
  opt_out:         c => ({ sql: `SELECT c.id::text AS subject, (SELECT MAX(d.id) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = c.workspace_id AND ($3::int IS NULL OR d.pipeline_id = $3)) AS deal_id,
                                        CASE WHEN c.journey_opt_out THEN '1' ELSE '0' END AS value FROM contacts c WHERE c.workspace_id = $1`, params: [pipeOf(c)] }),
  onboarding_done: c => ({ sql: `SELECT c.id::text AS subject, (SELECT MAX(d.id) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = c.workspace_id AND ($3::int IS NULL OR d.pipeline_id = $3)) AS deal_id,
                                        COALESCE(c.onboarding_status, '') AS value FROM contacts c WHERE c.workspace_id = $1`, params: [pipeOf(c)] }),
  meeting_moved:   c => ({ sql: `SELECT a.id::text AS subject, ${dealOf('a')} AS deal_id,
                                        COALESCE(a.event_date::text, '') || ' ' || COALESCE(a.event_time::text, '') || ' ' || COALESCE(a.event_tz, '') AS value
                                   FROM activities a WHERE a.workspace_id = $1 AND ${BOOKED} AND a.cancelled_at IS NULL AND a.event_date >= CURRENT_DATE - 1`, params: [pipeOf(c)] }),
  task_done:       () => ({ sql: `SELECT t.id::text AS subject, t.deal_id, CASE WHEN ${DONE_TASK} THEN '1' ELSE '0' END AS value FROM tasks t WHERE t.workspace_id = $1 AND t.deal_id IS NOT NULL` }),
};
// Whether a change sets the workflow off: (the value before, the value now, the start's settings).
const FIRES = {
  stage_left:      (was, now, c) => was === String(c.stage_id) && now !== was,
  stage_days:      () => false,   // the stage is only remembered here; the days are counted in find()
  assigned:        (was, now) => now !== '0',
  urgency:         (was, now, c) => !c.min_urgency || (Number(now) >= Number(c.min_urgency) && Number(was) < Number(c.min_urgency)),
  deal_field:      (was, now, c) => (c.value ? now.trim().toLowerCase() === String(c.value).trim().toLowerCase() : true),
  contact_field:   (was, now, c) => (c.value ? now.trim().toLowerCase() === String(c.value).trim().toLowerCase() : true),
  opt_out:         (was, now) => now === '1',
  onboarding_done: (was, now) => now === 'onboarding_abgeschlossen',
  meeting_moved:   () => true,
  task_done:       (was, now) => now === '1',
};
const watches = trigger => Object.hasOwn(WATCHES, trigger);
// Whether a change from `was` to `now` sets a watching start off (pure; text values as the watch table keeps them).
const fires = (trigger, was, now, config = {}) => (Object.hasOwn(FIRES, trigger) ? !!FIRES[trigger](String(was ?? ''), String(now ?? ''), config || {}) : false);

// What changed since this workflow last looked: each change is written down (so it is found once) and, when it sets
// the workflow off, answered with the key of that change. Something seen for the first time is no change.
async function changed(pool, flow) {
  const c = flow.config || {}, w = WATCHES[c.trigger](c);
  const { rows } = await pool.query(
    `WITH cur AS (${w.sql})
     SELECT cur.subject, cur.deal_id, cur.value, w.value AS was, (w.subject IS NULL) AS fresh
       FROM cur LEFT JOIN journey_watch w ON w.flow_id = $2 AND w.subject = cur.subject
      WHERE w.subject IS NULL OR w.value IS DISTINCT FROM cur.value
      ORDER BY cur.subject LIMIT ${ENROLL_LIMIT}`, [flow.workspace_id, flow.id, ...(w.params || [])]   // no more than one tick takes in: the rest is found by the next
  );
  const out = [], round = roundOf(flow);
  for (const r of rows) {
    const { rows: [kept] } = await pool.query(
      `INSERT INTO journey_watch (flow_id, subject, value) VALUES ($1,$2,$3)
       ON CONFLICT (flow_id, subject) DO UPDATE SET value = EXCLUDED.value, n = journey_watch.n + 1, since = NOW()
         WHERE journey_watch.value IS DISTINCT FROM EXCLUDED.value
       RETURNING n`, [flow.id, r.subject, r.value]
    );
    if (!kept || r.fresh || !r.deal_id) continue;   // another tick wrote it down, it is new here, or it has no deal
    // the key names what changed, which change of it this is, and which switching-on of the workflow saw it: two
    // tasks of one deal are two keys, and a count that starts again after the workflow was off is another key
    if (fires(c.trigger, r.was, r.value, c)) out.push({ dealId: r.deal_id, key: `c${r.subject}.${kept.n}.${round}` });
  }
  return out;
}

// ── a call's result, read as the stage rules read it ────────────────────────
async function callResults(pool, flow, now) {
  const at = new Date(now).getTime();
  const { rows } = await pool.query(
    `SELECT f.id, ${dealOf('f', '$5')} AS deal_id, f.result_body, f.call_outcome, w.from_number,
            EXISTS (SELECT 1 FROM fonio_calls x WHERE x.follow_up_of = f.id AND x.trigger = 'callback')  AS callback,
            EXISTS (SELECT 1 FROM fonio_calls x WHERE x.follow_up_of = f.id AND x.trigger = 'follow_up') AS retry
       FROM fonio_calls f JOIN workspace_fonio w ON w.workspace_id = f.workspace_id
      WHERE f.workspace_id = $1 AND f.result_at >= $2 AND f.result_at > $3 AND f.result_at <= $4
      ORDER BY f.id LIMIT ${WATCH_LIMIT}`, [flow.workspace_id, flow.activated_at, new Date(at - DAY_MS), new Date(at - RESULT_WAIT_MS), pipeOf(flow.config)]
  );
  const want = (flow.config || {}).result, list = [];
  for (const r of rows) {
    if (!r.deal_id) continue;
    const said = fonioResult.readResult(r.result_body || {}, r.from_number);
    const event = fonioStage.eventOf({ leadStatus: said.leadStatus, meeting: !!said.meeting, callback: !!r.callback, outcome: said.outcome || r.call_outcome || null, retry: !!r.retry });
    if (event === want) list.push({ dealId: r.deal_id, key: `call${r.id}` });
  }
  // "Not reached" is also a call fonio never reported and will not try again — the rule the deal's stage table goes
  // by (utils/fonio-stage.js sweepNotReached): sent, no result an hour later (and not older than a day), no retry
  // booked, and only where fonio's result link has delivered at least once.
  if (want === 'not_reached') {
    const followUpSettings = require('./fonio-calls').followUpSettings;   // asked for here: that file is a large one this one otherwise does not need
    const { rows: silent } = await pool.query(
      `SELECT f.id, ${dealOf('f', '$5')} AS deal_id, f.follow_up_no, w.follow_up, w.active
         FROM fonio_calls f JOIN workspace_fonio w ON w.workspace_id = f.workspace_id
        WHERE f.workspace_id = $1 AND f.status = 'sent' AND f.result_at IS NULL AND f.follow_up_at IS NULL AND f.sent_at IS NOT NULL
          AND f.sent_at >= $2 AND f.sent_at < $3 AND f.sent_at > $4 AND w.last_delivery IS NOT NULL
        ORDER BY f.id LIMIT ${WATCH_LIMIT}`,
      [flow.workspace_id, flow.activated_at, new Date(at - fonioStage.UNREPORTED_MINUTES * 60000), new Date(at - fonioStage.UNREPORTED_HOURS * 3600000), pipeOf(flow.config)]
    );
    for (const r of silent) {
      const f = followUpSettings({ follow_up: r.follow_up });
      if (r.active && f.enabled && f.max_attempts > 0 && Number(r.follow_up_no || 0) < f.max_attempts) continue;   // the retries book its next try
      if (r.deal_id) list.push({ dealId: r.deal_id, key: `call${r.id}` });   // the call's own key: a result that comes late does not start it twice
    }
  }
  return notYet(pool, flow, list);
}

// ── moments around a meeting, and a task that is overdue ────────────────────
async function meetingMoments(pool, flow, now) {
  const c = flow.config || {}, at = new Date(now).getTime(), span = Number(c.hours) * 3600000, since = new Date(flow.activated_at).getTime();
  const today = new Date(at).toISOString().slice(0, 10), reach = Math.ceil(Number(c.hours) / 24) + 2;
  const { rows } = await pool.query(
    `SELECT a.id, ${dealOf('a', '$4')} AS deal_id, to_char(a.event_date, 'YYYY-MM-DD') AS day, to_char(a.event_time, 'HH24:MI') AS time, a.event_tz
       FROM activities a
      WHERE a.workspace_id = $1 AND ${BOOKED} AND a.cancelled_at IS NULL AND a.event_date IS NOT NULL AND a.event_time IS NOT NULL
        AND a.event_date BETWEEN $2::date AND $3::date
      ORDER BY a.id LIMIT ${WATCH_LIMIT}`, [flow.workspace_id, shiftDay(today, c.trigger === 'meeting_before' ? -1 : -reach), shiftDay(today, c.trigger === 'meeting_before' ? reach : 1), pipeOf(c)]
  );
  const list = [];
  for (const r of rows) {
    const start = instantOf(r.day, r.time, r.event_tz);
    if (start === null || !r.deal_id) continue;
    const moment = c.trigger === 'meeting_before' ? start - span : start + span;
    if (moment > at || moment < since) continue;                           // not yet, or it passed before the workflow was switched on
    if (c.trigger === 'meeting_before' ? at >= start : at - moment > DAY_MS) continue;   // the meeting has begun — or the moment is a day old
    list.push({ dealId: r.deal_id, key: `${c.trigger === 'meeting_before' ? 'b' : 'a'}${r.id}@${Math.round(start / 60000)}` });   // a moved meeting has another key
  }
  return notYet(pool, flow, list);
}
async function overdueTasks(pool, flow, now) {
  const at = new Date(now).getTime(), since = new Date(flow.activated_at).getTime(), today = new Date(at).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT t.id, t.deal_id, to_char(t.due_date, 'YYYY-MM-DD') AS day, to_char(t.due_time, 'HH24:MI') AS time, t.due_tz
       FROM tasks t
      WHERE t.workspace_id = $1 AND t.deal_id IS NOT NULL AND t.due_date IS NOT NULL AND NOT (${DONE_TASK})
        AND t.due_date BETWEEN $2::date AND $3::date
      ORDER BY t.id LIMIT ${WATCH_LIMIT}`, [flow.workspace_id, shiftDay(new Date(since).toISOString().slice(0, 10), -1), shiftDay(today, 1)]
  );
  const list = [];
  for (const r of rows) {
    const due = instantOf(r.day, r.time || '23:59', r.due_tz);   // a task without a time is overdue when its day is over
    if (due === null || due >= at || due < since) continue;
    list.push({ dealId: r.deal_id, key: `o${r.id}@${Math.round(due / 60000)}` });
  }
  return notYet(pool, flow, list);
}

// ── find: the deals a workflow takes in now ─────────────────────────────────
const FIND = {
  lead: (pool, flow) => madeSince(pool, flow,
    `EXISTS (SELECT 1 FROM webhook_logs l WHERE l.deal_id = d.id AND l.workspace_id = d.workspace_id AND l.source = 'lead' AND l.webhook_id IS NOT NULL
               AND ($6::int[] IS NULL OR l.webhook_id = ANY($6::int[])))`, [Array.isArray(flow.config.webhook_ids) ? flow.config.webhook_ids.map(Number) : null]),
  deal_manual: (pool, flow) => madeSince(pool, flow, `d.origin = 'manual'`),
  deal_import: (pool, flow) => madeSince(pool, flow, `d.origin = 'import'`),
  deal_new:    (pool, flow) => madeSince(pool, flow),
  // the deals in the stage this workflow has not seen; those there when it was switched on were written down as 'old'
  stage: async (pool, flow) => {
    const { rows } = await pool.query(
      `SELECT d.id AS deal_id FROM deals d
        WHERE d.workspace_id = $1 AND d.stage_id = $5 AND ($3::int IS NULL OR d.pipeline_id = $3)
          AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = $2 AND r.deal_id = d.id)
        ORDER BY d.id LIMIT $4`, [...head(flow), Number(flow.config.stage_id)]
    );
    return rows.map(r => ({ dealId: r.deal_id, key: '' }));
  },
  manual: async () => [],
  document: (pool, flow) => happened(pool, flow,
    `SELECT ${dealOf('x')} AS deal_id, 'doc' || x.id AS key FROM contact_documents x WHERE x.workspace_id = $1 AND x.created_at >= $5 AND ($6::text IS NULL OR x.typ = $6)`,
    [flow.activated_at, flow.config.doc_type || null]),
  call_result: callResults,
  call_inbound: (pool, flow) => happened(pool, flow,
    `SELECT ${dealOf('o')} AS deal_id, 'in' || o.id AS key FROM fonio_other_calls o WHERE o.workspace_id = $1 AND o.direction = 'inbound' AND o.contact_id IS NOT NULL AND o.created_at >= $5`,
    [flow.activated_at]),
  meeting_booked: (pool, flow) => happened(pool, flow,
    `SELECT ${dealOf('a')} AS deal_id, 'm' || a.id AS key FROM activities a WHERE a.workspace_id = $1 AND ${BOOKED} AND a.cancelled_at IS NULL AND a.created_at >= $5`, [flow.activated_at]),
  meeting_cancelled: (pool, flow) => happened(pool, flow,
    `SELECT ${dealOf('a')} AS deal_id, 'x' || a.id AS key FROM activities a WHERE a.workspace_id = $1 AND ${BOOKED} AND a.cancelled_at >= $5`, [flow.activated_at]),
  meeting_before: meetingMoments,
  meeting_after: meetingMoments,
  // the note of a recording that worked; a recording that failed leaves a note too, and starts nothing
  notetaker: (pool, flow) => happened(pool, flow,
    `SELECT ${dealOf('a')} AS deal_id, 'n' || a.id AS key FROM activities a
      WHERE a.workspace_id = $1 AND a.source = 'notetaker' AND a.created_at >= $5
        AND EXISTS (SELECT 1 FROM notetaker_recordings n WHERE n.note_activity_id = a.id AND n.status = 'completed')`, [flow.activated_at]),
  task_overdue: overdueTasks,
  // a deal that has been in the stage for so many days: counted from when this workflow first saw it there
  stage_days: async (pool, flow, now) => {
    await changed(pool, flow);
    return happened(pool, flow,
      `SELECT d.id AS deal_id, 's' || w.n || '.' || $8::text AS key FROM journey_watch w JOIN deals d ON d.id::text = w.subject
        WHERE w.flow_id = $2 AND d.workspace_id = $1 AND w.value = $5 AND d.stage_id = $6 AND w.since <= $7`,
      [String(flow.config.stage_id), Number(flow.config.stage_id), new Date(new Date(now).getTime() - Number(flow.config.days) * DAY_MS), String(roundOf(flow))]);
  },
  // nothing new on the deal for so many days, the mark reached after the workflow was switched on; once per deal
  quiet_days: async (pool, flow, now) => {
    const days = Number(flow.config.days);
    const { rows } = await pool.query(
      `SELECT d.id AS deal_id FROM deals d
        CROSS JOIN LATERAL (SELECT GREATEST(d.created_at, d.updated_at, (SELECT MAX(a.created_at) FROM activities a WHERE a.deal_id = d.id)) AS at) last
        WHERE d.workspace_id = $1 AND ($3::int IS NULL OR d.pipeline_id = $3)
          AND last.at <= $5 AND last.at >= $6
          AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = $2 AND r.deal_id = d.id)
        ORDER BY d.id LIMIT $4`,
      [...head(flow), new Date(new Date(now).getTime() - days * DAY_MS), new Date(new Date(flow.activated_at).getTime() - days * DAY_MS)]
    );
    return rows.map(r => ({ dealId: r.deal_id, key: '' }));
  },
  // a date in a deal's field, so many days before or after, at a time of day: every date whose moment has come since
  // the workflow was switched on. The date is compared as text (YYYY-MM-DD), never cast: a field can hold anything.
  date_field: (pool, flow, now) => {
    const c = flow.config, off = Number(c.offset_days) || 0;
    const to = shiftDay(dayReached(now, c.at, c.tz), -off), from = shiftDay(dayFrom(flow.activated_at, c.at, c.tz), -off);
    if (from > to) return [];
    return happened(pool, flow,
      `SELECT d.id AS deal_id, 'df' || (d.custom_data->>$5::text) AS key FROM deals d
        WHERE d.workspace_id = $1 AND (d.custom_data->>$5::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND (d.custom_data->>$5::text) BETWEEN $6::text AND $7::text`, [String(c.field_key), from, to]);
  },
  // on a weekday at a time: every deal that is in the stage then, once that day
  schedule: (pool, flow, now) => {
    const c = flow.config, here = calcom.wallClock(new Date(now).toISOString(), c.tz || FALLBACK_ZONE);
    const moment = instantOf(here.date, c.at, c.tz);
    if (!(c.weekdays || []).includes(weekdayOf(here.date)) || here.time < c.at || moment === null || moment < new Date(flow.activated_at).getTime()) return [];
    return happened(pool, flow, `SELECT d.id AS deal_id, $6::text AS key FROM deals d WHERE d.workspace_id = $1 AND d.stage_id = $5::int`, [Number(c.stage_id), `w${here.date}`]);
  },
  // the key carries when the deal began that workflow: a deal put through it again by hand finishes it again
  flow_done: (pool, flow) => happened(pool, flow,
    `SELECT x.deal_id, 'f' || x.id || '.' || FLOOR(EXTRACT(EPOCH FROM x.started_at) * 1000)::bigint AS key
       FROM journey_runs x JOIN journey_flows o ON o.id = x.flow_id AND o.workspace_id = $1
      WHERE x.flow_id = $5 AND x.status = 'done' AND x.updated_at >= $6`, [Number(flow.config.flow_id), flow.activated_at]),
};

// The deals a workflow's start takes in now: [{ dealId, key }]. flow: { id, workspace_id, activated_at, config }.
async function find(pool, flow, now = new Date()) {
  const c = flow && flow.config ? flow.config : {};
  if (!isTrigger(c.trigger) || !flow.activated_at) return [];
  if (Object.hasOwn(FIND, c.trigger)) return FIND[c.trigger](pool, flow, now);
  return watches(c.trigger) ? notYet(pool, flow, await changed(pool, flow)) : [];
}

// Switching a workflow on: what is there already must not look like something that just happened. A "deal arrives
// in a stage" start writes the deals in that stage down as 'old'; a start that watches for changes remembers
// everything as it is now. Every other start goes by the time the workflow was switched on.
async function baseline(pool, flow) {
  const c = flow.config || {};
  if (c.trigger === 'stage' && c.stage_id) {
    const { rowCount } = await pool.query(
      `INSERT INTO journey_runs (workspace_id, flow_id, deal_id, node_id, status, due_at)
       SELECT d.workspace_id, $2, d.id, NULL, 'old', NULL FROM deals d WHERE d.workspace_id = $1 AND d.stage_id = $3
       ON CONFLICT (flow_id, deal_id, event_key) DO NOTHING`, [flow.workspace_id, flow.id, Number(c.stage_id)]
    );
    return rowCount;
  }
  if (!watches(c.trigger)) return 0;
  const w = WATCHES[c.trigger](c);
  await pool.query('DELETE FROM journey_watch WHERE flow_id = $1', [flow.id]);
  const { rowCount } = await pool.query(
    `INSERT INTO journey_watch (flow_id, subject, value)
     SELECT $2::int, cur.subject, cur.value FROM (${w.sql}) cur
     ON CONFLICT (flow_id, subject) DO NOTHING`, [flow.workspace_id, flow.id, ...(w.params || [])]
  );
  return rowCount;
}

module.exports = {
  CATEGORIES, TRIGGERS, DOC_TYPES, RESULTS, STOP_ON, STOP_CATEGORIES, STOP_USES, DONE_TASK, nextMoment, MAX_HOURS, MAX_DAYS, MAX_URGENCY, MAX_VALUE, MAX_IDS, ENROLL_LIMIT, WATCH_LIMIT, RESULT_WAIT_MS, FALLBACK_ZONE,
  isTrigger, usesOf, idList, checkStart, foreignRefs, shiftDay, weekdayOf, dayReached, dayFrom, watches, fires, find, baseline,
};
