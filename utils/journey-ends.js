/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY ENDS — everything that can end a workflow for a deal, beside its stage
   (CUSTOMER_JOURNEY_CHANGES Part 13, 2026-11-19; utils/journey-triggers.js
   saves the rules with the start through checkEnds() and foreignEnds(),
   utils/journey-run.js asks reasonOf() each time a step is due, the page
   chooses them in the "Ends when" window).

   A workflow's start says where the workflow ends for a deal. The two stage
   rules (stop_stage_ids, stay_stage_ids) stay where they were, in
   utils/journey-triggers.js and the engine's stopReason(). Everything else is
   here: a list of RULES, any one of which ends the workflow.

   SAVED AS  stop_on: [rule keys, in STOP_ON's order, each once]
             stop_set: { <rule key>: { its settings } } — only for a rule that
             is in stop_on and has a setting; a rule whose settings are all
             optional and none was given has no entry.

   THE RULES, by the category the page shows them under (STOP_CATEGORIES):
     deal      assigned           the deal is assigned to someone
               urgency            its urgency is at least a level (min_urgency)
               field              a deal field has a value — any, or this one
                                  (field_key, value)
     contact   contact_field      a contact field has a value (field_key, value)
               document           a document was added (doc_type, or any)
               onboarding_done    the contact's onboarding is completed
               opt_out            the contact pressed "no more emails"
     calls     answered           a fonio call reached the person
               call_result        a fonio call came out as one of the chosen
                                  results (results)
               call_inbound       the contact called in
     meetings  meeting            a meeting was booked
               meeting_cancelled  a booking was cancelled
     tasks     task_done          a task of the deal was completed
     time      max_days           so many days in the workflow (days)
     other     other_flow         the deal was taken into another workflow
                                  (flow_id)

   TWO KINDS OF RULE
     how the deal IS when a step is due   assigned, urgency, field,
                          contact_field, onboarding_done, opt_out, max_days:
                          read from the row the engine has in hand; no question
                          to the database.
     what HAPPENED since the deal entered the workflow (journey_runs.started_at)
                          everything else: asked of the database, for the deal
                          — or for its contact where the row names no deal, as
                          a booking from the public page does.

   A FIELD'S KEY NEVER BECOMES PART OF A STATEMENT: the deal's and the contact's
   fields are read as a whole and looked into in code (own keys only), and a
   key is saved only when it is one of the workspace's own fields.

   A TASK HAS NO TIME OF COMPLETION. "Completed since" is: the task is in its
   project's last status now, and it was last changed (tasks.updated_at) since
   the deal entered. A task that was completed before and only edited since
   counts too — the CRM keeps nothing that tells the two apart.

   Every function takes the pool; nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const branch      = require('./journey-branch');   // the questions a branch box shares with these rules
const fonioResult = require('./fonio-result');     // readResult: what a call's Body says
const fonioStage  = require('./fonio-stage');      // eventOf: what came out of a call; the hour after which a silent call is "not reached"

const STOP_ON = ['assigned', 'urgency', 'field', 'contact_field', 'document', 'onboarding_done', 'opt_out', 'answered', 'call_result', 'call_inbound',
  'meeting', 'meeting_cancelled', 'task_done', 'max_days', 'other_flow'];
const STOP_CATEGORIES = { deal: ['assigned', 'urgency', 'field'], contact: ['contact_field', 'document', 'onboarding_done', 'opt_out'], calls: ['answered', 'call_result', 'call_inbound'],
  meetings: ['meeting', 'meeting_cancelled'], tasks: ['task_done'], time: ['max_days'], other: ['other_flow'] };
// rule → the settings it has; a rule not named here has none
const STOP_USES = { urgency: ['min_urgency'], field: ['field_key', 'value'], contact_field: ['field_key', 'value'], document: ['doc_type'], call_result: ['results'], max_days: ['days'], other_flow: ['flow_id'] };
// rule → the word kept in journey_runs.reason when it ended a workflow
const REASONS = { assigned: 'deal_assigned', urgency: 'urgency_reached', field: 'field_set', contact_field: 'contact_field_set', document: 'document_added', onboarding_done: 'onboarding_done',
  opt_out: 'opted_out', answered: 'call_answered', call_result: 'call_result', call_inbound: 'call_inbound', meeting: 'meeting_booked', meeting_cancelled: 'meeting_cancelled', task_done: 'task_done',
  max_days: 'max_days', other_flow: 'other_flow' };
const ONBOARDING_DONE = 'onboarding_abgeschlossen';   // contacts.onboarding_status when the onboarding is through: the word the start goes by
const DAY_MS = 86400000;
const CALLS_LOOKED_AT = 50;   // the calls of one deal one look goes through

const isRule = key => typeof key === 'string' && STOP_ON.includes(key);
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e10 ? v : null);
const intIn = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const plain = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const given = v => v !== undefined && v !== null;

// ── the rules as they are saved ─────────────────────────────────────────────
// What a start was sent as its end rules: { stop_on, stop_set } as they are saved, or { code } — start (no such rule,
// or one of its settings is missing or cannot be), field (a field key that is none), flow (a workflow id that is
// none). Settings of a rule that is not in stop_on are left out, not refused. limits: the lists and bounds the start
// itself goes by (utils/journey-triggers.js hands them in, so there is one of each).
function checkEnds(raw, { DOC_TYPES, RESULTS, MAX_DAYS, MAX_URGENCY, MAX_VALUE }) {
  const c = plain(raw) || {};
  if (!given(c.stop_on)) return { stop_on: [], stop_set: {} };
  if (!Array.isArray(c.stop_on) || c.stop_on.some(k => !isRule(k))) return { code: 'start' };
  if (given(c.stop_set) && !plain(c.stop_set)) return { code: 'start' };
  const on = STOP_ON.filter(k => c.stop_on.includes(k)), sent = c.stop_set || {}, set = {};
  for (const key of on) {
    if (!Object.hasOwn(STOP_USES, key)) continue;
    const s = (Object.hasOwn(sent, key) && plain(sent[key])) || {}, out = {};
    if (key === 'urgency') {
      if (!intIn(s.min_urgency, 1, MAX_URGENCY)) return { code: 'start' };
      out.min_urgency = s.min_urgency;
    }
    if (key === 'field' || key === 'contact_field') {
      if (typeof s.field_key !== 'string' || !/^\S{1,120}$/.test(s.field_key)) return { code: 'field' };
      out.field_key = s.field_key;
      if (given(s.value)) {
        if (typeof s.value !== 'string' || s.value.length > MAX_VALUE) return { code: 'start' };
        if (s.value.trim()) out.value = s.value.trim();
      }
    }
    if (key === 'document' && given(s.doc_type)) {
      if (!DOC_TYPES.includes(s.doc_type)) return { code: 'start' };
      out.doc_type = s.doc_type;
    }
    if (key === 'call_result') {
      if (!Array.isArray(s.results) || !s.results.length || s.results.some(r => typeof r !== 'string' || !RESULTS.includes(r))) return { code: 'start' };
      out.results = RESULTS.filter(r => s.results.includes(r));
    }
    if (key === 'max_days') {
      if (!intIn(s.days, 1, MAX_DAYS)) return { code: 'start' };
      out.days = s.days;
    }
    if (key === 'other_flow') {
      if (!idOf(s.flow_id)) return { code: 'flow' };
      out.flow_id = s.flow_id;
    }
    if (Object.keys(out).length) set[key] = out;
  }
  return { stop_on: on, stop_set: set };
}

// What a saved rule's settings are: its own entry in stop_set, or nothing.
function settingsOf(config, key) {
  const set = plain(config && config.stop_set);
  return (set && Object.hasOwn(set, key) && plain(set[key])) || {};
}
const rulesOf = config => (config && Array.isArray(config.stop_on) ? STOP_ON.filter(k => config.stop_on.includes(k)) : []);

// What the rules name must be the workspace's own: null, or the code of what is not — field (no such deal field, or
// no such contact field, here), flow (no such other workflow here, or the workflow itself). flowId: the workflow
// the start is of.
async function foreignEnds(db, wid, flowId, config) {
  const on = rulesOf(config);
  if (on.includes('field')) {
    const { rows } = await db.query('SELECT type FROM deal_fields WHERE workspace_id = $1 AND field_key = $2', [wid, String(settingsOf(config, 'field').field_key || '')]);
    if (!rows.length) return 'field';
  }
  if (on.includes('contact_field')) {
    const { rows } = await db.query('SELECT type FROM custom_fields WHERE workspace_id = $1 AND field_key = $2', [wid, String(settingsOf(config, 'contact_field').field_key || '')]);
    if (!rows.length) return 'field';
  }
  if (on.includes('other_flow')) {
    const other = idOf(Number(settingsOf(config, 'other_flow').flow_id));
    if (!other || other === Number(flowId)) return 'flow';
    const { rows } = await db.query('SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', [other, wid]);
    if (!rows.length) return 'flow';
  }
  return null;
}

// ── how the deal is when a step is due ──────────────────────────────────────
// x: the row the engine read — the deal's assignee, urgency and fields, its contact's fields, onboarding and "no more
// emails", and when the deal entered the workflow. s: the rule's settings. at: the tick's clock, in milliseconds.
// The questions a branch box asks too are asked of that file, so the two can never answer differently.
const IS = {
  assigned:        x => branch.holds(null, x, { test: 'assigned' }),
  urgency:         (x, s) => !!intIn(s.min_urgency, 1, 99) && branch.holds(null, x, { test: 'urgency', min_urgency: s.min_urgency }),
  field:           (x, s) => typeof s.field_key === 'string' && !!s.field_key && branch.holds(null, x, { test: 'field', field_key: s.field_key, value: s.value }),
  contact_field:   (x, s) => typeof s.field_key === 'string' && !!s.field_key && branch.holds(null, { deal_data: x.contact_data }, { test: 'field', field_key: s.field_key, value: s.value }),
  onboarding_done: x => x.onboarding_status === ONBOARDING_DONE,
  opt_out:         x => branch.holds(null, x, { test: 'opt_out' }),
  max_days:        (x, s, at) => !!intIn(s.days, 1, 100000) && !!x.started_at && at - new Date(x.started_at).getTime() >= s.days * DAY_MS,
};

// ── what happened since the deal entered the workflow ───────────────────────
// A statement about something that may name the deal or only its contact gets the same four values first: $1 the
// workspace, $2 the deal, $3 its contact (or NULL), $4 when the deal entered. `FOR_DEAL(alias)`: the row is the
// deal's own — or, where it names no deal, its contact's. A task and a run always name their deal: three values.
const head = x => [x.workspace_id, x.deal_id, x.contact_id || null, x.started_at];
const FOR_DEAL = a => `(${a}.deal_id = $2 OR (${a}.deal_id IS NULL AND ${a}.contact_id = $3))`;
const any = async (pool, sql, params) => (await pool.query(sql, params)).rows.length > 0;

// A fonio call came out as one of the chosen results — read as the start reads it (a result is looked at a minute
// after it came, when its retry or callback is booked). "Not reached" is also a call fonio never reported and will
// not try again (the rule of utils/fonio-stage.js): sent, no result an hour later, no retry booked or left to try,
// and only where fonio's result link has delivered at least once.
async function callResultSince(pool, x, s, at) {
  const want = Array.isArray(s.results) ? s.results : [];
  if (!want.length) return false;
  const { RESULT_WAIT_MS } = require('./journey-triggers');   // asked for here: that file loads this one
  const { rows } = await pool.query(
    `SELECT f.id, f.result_body, f.call_outcome, w.from_number,
            EXISTS (SELECT 1 FROM fonio_calls y WHERE y.follow_up_of = f.id AND y.trigger = 'callback')  AS callback,
            EXISTS (SELECT 1 FROM fonio_calls y WHERE y.follow_up_of = f.id AND y.trigger = 'follow_up') AS retry
       FROM fonio_calls f JOIN workspace_fonio w ON w.workspace_id = f.workspace_id
      WHERE f.workspace_id = $1 AND f.result_at >= $4 AND f.result_at <= $5 AND ${FOR_DEAL('f')}
      ORDER BY f.id DESC LIMIT ${CALLS_LOOKED_AT}`, [...head(x), new Date(at - RESULT_WAIT_MS)]
  );
  for (const r of rows) {
    const said = fonioResult.readResult(r.result_body || {}, r.from_number);
    const event = fonioStage.eventOf({ leadStatus: said.leadStatus, meeting: !!said.meeting, callback: !!r.callback, outcome: said.outcome || r.call_outcome || null, retry: !!r.retry });
    if (want.includes(event)) return true;
  }
  if (!want.includes('not_reached')) return false;
  const followUpSettings = require('./fonio-calls').followUpSettings;   // asked for here: a large file this one otherwise does not need
  const { rows: silent } = await pool.query(
    `SELECT f.id, f.follow_up_no, w.follow_up, w.active
       FROM fonio_calls f JOIN workspace_fonio w ON w.workspace_id = f.workspace_id
      WHERE f.workspace_id = $1 AND f.status = 'sent' AND f.result_at IS NULL AND f.follow_up_at IS NULL AND f.sent_at IS NOT NULL
        AND f.sent_at >= $4 AND f.sent_at < $5 AND w.last_delivery IS NOT NULL AND ${FOR_DEAL('f')}
      ORDER BY f.id DESC LIMIT ${CALLS_LOOKED_AT}`, [...head(x), new Date(at - fonioStage.UNREPORTED_MINUTES * 60000)]
  );
  return silent.some(r => {
    const f = followUpSettings({ follow_up: r.follow_up });
    return !(r.active && f.enabled && f.max_attempts > 0 && Number(r.follow_up_no || 0) < f.max_attempts);   // not one the retries will still try
  });
}

const HAPPENED = {
  answered:          (pool, x) => branch.answeredSince(pool, x),
  call_result:       callResultSince,
  call_inbound:      (pool, x) => any(pool, `SELECT 1 FROM fonio_other_calls o WHERE o.workspace_id = $1 AND o.direction = 'inbound' AND o.created_at >= $4 AND ${FOR_DEAL('o')} LIMIT 1`, head(x)),
  meeting:           (pool, x) => branch.meetingSince(pool, x),
  // a booking, not an appointment typed in by hand — as for "a meeting was booked"
  meeting_cancelled: (pool, x) => any(pool,
    `SELECT 1 FROM activities a WHERE a.workspace_id = $1 AND a.type = 'meeting' AND a.source IN ('calcom','calendly') AND a.cancelled_at >= $4 AND ${FOR_DEAL('a')} LIMIT 1`, head(x)),
  document:          (pool, x, s) => any(pool,
    `SELECT 1 FROM contact_documents doc WHERE doc.workspace_id = $1 AND doc.created_at >= $4 AND ${FOR_DEAL('doc')} AND ($5::text IS NULL OR doc.typ = $5) LIMIT 1`, [...head(x), typeof s.doc_type === 'string' && s.doc_type ? s.doc_type : null]),
  // in its project's last status now, and last changed since the deal entered (see the header: a task has no time of completion)
  task_done:         (pool, x) => any(pool,
    `SELECT 1 FROM tasks t WHERE t.workspace_id = $1 AND t.deal_id = $2 AND t.updated_at >= $3 AND ${require('./journey-triggers').DONE_TASK} LIMIT 1`, [x.workspace_id, x.deal_id, x.started_at]),
  // taken into the other workflow after it entered this one; a deal only written down as "was there already" is no entry
  other_flow:        (pool, x, s) => (idOf(Number(s.flow_id)) ? any(pool,
    `SELECT 1 FROM journey_runs r WHERE r.workspace_id = $1 AND r.deal_id = $2 AND r.started_at >= $3 AND r.flow_id = $4 AND r.status <> 'old' LIMIT 1`, [x.workspace_id, x.deal_id, x.started_at, Number(s.flow_id)]) : false),
};

// Why the workflow ends for this deal now, beside its stage rules: the reason word of the first rule that holds, or
// null. What the row itself says is looked at first, in STOP_ON's order; only then is the database asked, one rule at
// a time, and only for rules the start names. x: the row the engine read (see IS and head). now: the tick's clock.
async function reasonOf(pool, x, config, now = new Date()) {
  const on = rulesOf(config);
  if (!on.length) return null;
  const at = new Date(now).getTime();
  for (const key of on) if (Object.hasOwn(IS, key) && await IS[key](x, settingsOf(config, key), at)) return REASONS[key];
  for (const key of on) if (Object.hasOwn(HAPPENED, key) && await HAPPENED[key](pool, x, settingsOf(config, key), at)) return REASONS[key];
  return null;
}

module.exports = { STOP_ON, STOP_CATEGORIES, STOP_USES, REASONS, ONBOARDING_DONE, CALLS_LOOKED_AT, isRule, checkEnds, foreignEnds, settingsOf, rulesOf, reasonOf };
