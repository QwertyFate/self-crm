/* ═══════════════════════════════════════════════════════════════════════════
   FONIO: THE DEAL AFTER THE CALL (FONIO_CHANGES Part 39) — what came out of a
   call moves the deal to a stage and sets its urgency, by a table the
   workspace keeps per pipeline.

   THE TABLE  workspace_fonio.stage_rules:
     { "<pipeline id>": { "<event>": { stage_id, urgency } } }
   stage_id and urgency are each null for "leave as it is"; a line that leaves
   both is not kept. {} (the default) moves nothing. Stages belong to one
   pipeline, hence a table per pipeline; the deal's CURRENT pipeline picks it.

   THE EVENTS  five come from fonio's assistant, as the workspace's own
   variable lead_status in the result Body (utils/fonio-result.js
   readLeadStatus): interested, meeting_booked, callback, not_interested,
   wrong_person. Without it, a meeting agreed or a callback planned is taken
   from the variables there already are (meeting_*, callback_*). The sixth,
   not_reached, is the CRM's own: the call ended unanswered (call_outcome
   no_answer, voicemail or busy) and no further try is planned — or fonio never
   reported the call at all and no further try is planned (sweepNotReached,
   from the worker). eventOf() decides.

   ONCE PER CALL, AND ONLY AN UNTOUCHED DEAL  fonio_calls.stage_rule_at is the
   claim: a call's line is looked at once. fonio_calls.stage_at_send is the
   deal's stage when the call went out (0 for none; NULL on calls sent before
   this part, which move nothing): the deal is moved only while it is still in
   that stage, so a deal somebody moved by hand since is left alone — stage
   and urgency both. The write repeats the check (IS NOT DISTINCT FROM).

   A NORMAL STAGE CHANGE  tellMoved() tells every member as a move by hand does
   (routes/deals.js: 'deal_stage_changed') and lets the Engine hear of a deal
   that landed in one of its trigger stages. A change of urgency alone tells
   nobody, as by hand. noteLine() is the last line of the call's note, in
   German like the note itself.
   ═══════════════════════════════════════════════════════════════════════════ */

const STATUSES = ['interested', 'meeting_booked', 'callback', 'not_interested', 'wrong_person'];   // lead_status, from fonio
const EVENTS   = [...STATUSES, 'not_reached'];                                                      // the table's lines
const UNANSWERED = ['no_answer', 'voicemail', 'busy'];
const URGENCY_MAX   = 4;
const MAX_PIPELINES = 100;
const UNREPORTED_MINUTES = 60, UNREPORTED_HOURS = 24;   // as for the retries (utils/fonio-calls.js)
const EVENT_WORDS = { interested: 'interessiert', meeting_booked: 'Termin vereinbart', callback: 'Rückruf gewünscht',
  not_interested: 'kein Interesse', wrong_person: 'falsche Person', not_reached: 'nicht erreicht' };
const URGENCY_WORDS = ['Keine Dringlichkeit', 'Niedrig', 'Mittel', 'Hoch', 'Sehr dringend'];   // the app's own (core.js urg_0 … urg_4)

// The table as it is saved: { value } with empty lines and empty pipelines dropped, or { error }.
function checkRules(value) {
  if (value === null || value === undefined) return { value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) return { error: 'The table is an object: pipeline id, then event, then { stage_id, urgency }' };
  const pids = Object.keys(value);
  if (pids.length > MAX_PIPELINES) return { error: `Up to ${MAX_PIPELINES} pipelines` };
  const out = {};
  for (const pid of pids) {
    if (!/^[1-9]\d{0,9}$/.test(pid)) return { error: 'A pipeline id is a whole number' };
    const lines = value[pid];
    if (!lines || typeof lines !== 'object' || Array.isArray(lines)) return { error: 'A pipeline holds its events' };
    const kept = {};
    for (const event of Object.keys(lines)) {
      if (!EVENTS.includes(event)) return { error: `Unknown event: ${String(event).slice(0, 40)}` };
      const line = lines[event];
      if (line === null || line === undefined) continue;
      if (typeof line !== 'object' || Array.isArray(line)) return { error: 'An event holds { stage_id, urgency }' };
      const stage = line.stage_id ?? null, urgency = line.urgency ?? null;
      if (stage !== null && (!Number.isInteger(stage) || stage <= 0)) return { error: 'A stage id is a whole number, or null to leave the stage' };
      if (urgency !== null && (!Number.isInteger(urgency) || urgency < 0 || urgency > URGENCY_MAX)) return { error: `Urgency is 0 to ${URGENCY_MAX}, or null to leave it` };
      if (stage === null && urgency === null) continue;
      kept[event] = { stage_id: stage, urgency };
    }
    if (Object.keys(kept).length) out[pid] = kept;
  }
  return { value: out };
}

// What a table that is SENT names that is not this workspace's own: 'pipeline', 'stage' (also a stage of another
// pipeline than the one it stands under), or null when everything is.
async function foreignRefs(pool, wid, rules) {
  const pids = Object.keys(rules).map(Number);
  if (!pids.length) return null;
  const { rows: own } = await pool.query('SELECT id FROM pipelines WHERE workspace_id = $1 AND id = ANY($2::int[])', [wid, pids]);
  if (own.length !== pids.length) return 'pipeline';
  const { rows: stages } = await pool.query('SELECT id, pipeline_id FROM pipeline_stages WHERE workspace_id = $1 AND pipeline_id = ANY($2::int[])', [wid, pids]);
  const has = (pid, sid) => stages.some(s => Number(s.id) === sid && Number(s.pipeline_id) === pid);
  for (const pid of pids) for (const line of Object.values(rules[pid])) if (line.stage_id !== null && !has(pid, line.stage_id)) return 'stage';
  return null;
}

// Which line of the table a finished call falls under, or null for none. leadStatus: what the assistant wrote;
// meeting: the call agreed a meeting; callback: a callback was planned; outcome: how the call ended; retry: a
// further try was booked for it.
function eventOf({ leadStatus = null, meeting = false, callback = false, outcome = null, retry = false } = {}) {
  if (STATUSES.includes(leadStatus)) return leadStatus;
  if (meeting) return 'meeting_booked';
  if (callback) return 'callback';
  if (UNANSWERED.includes(outcome) && !retry) return 'not_reached';
  return null;
}

// One call's line, looked at once. null: nothing to say (no event, no table, no line for this event in the deal's
// pipeline, the call looked at before, no deal). Otherwise { event, status, deal, … } with status
//   applied        the deal was changed: stage ({ id, name }, or null when only the urgency was), urgency (or null),
//                  from_stage
//   unchanged      the deal already is where the line says
//   moved_by_hand  the deal is no longer in the stage it had when the call went out
//   stage_gone     the line's stage no longer exists in the deal's pipeline
async function applyAfterCall(pool, wid, callId, event) {
  if (!event || !callId) return null;
  const { rows: [conn] } = await pool.query('SELECT stage_rules FROM workspace_fonio WHERE workspace_id = $1', [wid]);
  const rules = conn && conn.stage_rules;
  if (!rules || typeof rules !== 'object' || !Object.keys(rules).length) return null;
  const { rows: [call] } = await pool.query(
    `UPDATE fonio_calls SET stage_rule_at = NOW(), stage_event = $3 WHERE id = $1 AND workspace_id = $2 AND stage_rule_at IS NULL
     RETURNING id, deal_id, contact_id, stage_at_send`, [callId, wid, event]
  );
  if (!call || !call.deal_id) return null;
  const { rows: [deal] } = await pool.query('SELECT id, title, contact_id, pipeline_id, stage_id, urgency FROM deals WHERE id = $1 AND workspace_id = $2', [call.deal_id, wid]);
  if (!deal) return null;
  const line = (rules[String(deal.pipeline_id)] || {})[event];
  if (!line) return null;
  if (call.stage_at_send === null || call.stage_at_send === undefined) return null;   // sent before the stage was kept
  if (Number(call.stage_at_send) !== Number(deal.stage_id || 0)) return { event, status: 'moved_by_hand', deal };
  let stage = null;
  if (line.stage_id) {
    ({ rows: [stage] } = await pool.query('SELECT id, name FROM pipeline_stages WHERE id = $1 AND pipeline_id = $2 AND workspace_id = $3', [line.stage_id, deal.pipeline_id, wid]));
    if (!stage) return { event, status: 'stage_gone', deal };
  }
  const toStage = stage && Number(stage.id) !== Number(deal.stage_id) ? stage.id : null;
  const wanted = line.urgency === null || line.urgency === undefined ? null : Number(line.urgency);
  const toUrgency = wanted !== null && wanted !== Number(deal.urgency || 0) ? wanted : null;
  if (toStage === null && toUrgency === null) return { event, status: 'unchanged', deal };
  const { rowCount } = await pool.query(
    `UPDATE deals SET stage_id = COALESCE($3, stage_id), urgency = COALESCE($4, urgency), updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND stage_id IS NOT DISTINCT FROM $5`, [deal.id, wid, toStage, toUrgency, deal.stage_id ?? null]
  );
  if (!rowCount) return { event, status: 'moved_by_hand', deal };   // moved between the look and the write
  return { event, status: 'applied', deal, from_stage: deal.stage_id ?? null, stage: toStage === null ? null : { id: stage.id, name: stage.name }, urgency: toUrgency };
}

// The last line of the call's note ('' for nothing worth a line).
function noteLine(res) {
  if (!res) return '';
  const why = ` (Ergebnis: ${EVENT_WORDS[res.event] || res.event}).`;
  if (res.status === 'moved_by_hand') return `Deal nicht verschoben: Er wurde seit dem Anruf bereits verschoben${why}`;
  if (res.status === 'stage_gone') return `Deal nicht verschoben: Die eingestellte Phase gibt es nicht mehr${why}`;
  if (res.status !== 'applied') return '';
  const urgency = res.urgency === null || res.urgency === undefined ? '' : URGENCY_WORDS[res.urgency] || String(res.urgency);
  if (!res.stage) return `Dringlichkeit des Deals: ${urgency}${why}`;
  return `Deal nach „${res.stage.name}“ verschoben${urgency ? `, Dringlichkeit: ${urgency}` : ''}${why}`;
}

// After a line moved the deal to another stage: every member is told, as for a move by hand, and the Engine hears of
// a deal that landed in one of its trigger stages (its dispatcher checks the workspace's settings itself). Never
// throws: the deal is moved already. notifyUser (notifications.js) and engine (utils/engine.js) are handed in by the
// caller — the route and server.js — so that this file never opens the database module by itself.
async function tellMoved(pool, wid, res, { notifyUser = null, engine = null, timezone = null, baseUrl = null } = {}) {
  if (!res || res.status !== 'applied' || !res.stage) return;
  try {
    if (notifyUser) {
      const { rows } = await pool.query('SELECT id FROM users WHERE workspace_id = $1', [wid]);
      for (const u of rows) {
        await notifyUser(wid, null, u.id, { type: 'deal_stage_changed', category: 'deals', title: `Deal stage changed: ${res.deal.title}`,
          body: `fonio: ${res.stage.name}`, entityType: 'deal', entityId: res.deal.id });
      }
    }
    const to = engine ? engine.stageNum(res.stage.id) : null;
    if (to && to !== engine.stageNum(res.from_stage)) {
      engine.dispatchContractSigned({ workspaceId: wid, dealId: Number(res.deal.id), contactId: res.deal.contact_id ? Number(res.deal.contact_id) : null,
        title: res.deal.title, stageId: to, timezone: timezone || undefined, baseUrl: baseUrl || undefined }).catch(() => {});
    }
  } catch (err) {
    console.error('fonio: telling about the moved deal failed:', err?.message || err);
  }
}

// The calls fonio never reported and that will not be tried again: sent, no result an hour later (and not older than
// a day), no retry booked, not looked at yet — "not reached". Only in a workspace whose result link has delivered at
// least once: where no result ever arrives, an answered call must not be filed as not reached. A call the retries
// (Part 33) will still try again is left for them. Each deal that is moved gets a short note saying why, since
// there is no result to carry the line. tell: { notifyUser, engine } for tellMoved. The answers of applyAfterCall.
async function sweepNotReached(pool, now = new Date(), limit = 20, tell = {}) {
  const fonioCalls = require('./fonio-calls');
  const at = new Date(now).getTime();
  const { rows } = await pool.query(
    `SELECT f.id, f.workspace_id, f.contact_id, f.deal_id, f.follow_up_no, w.follow_up, w.active, w.hours_tz
       FROM fonio_calls f JOIN workspace_fonio w ON w.workspace_id = f.workspace_id
      WHERE f.status = 'sent' AND f.result_at IS NULL AND f.follow_up_at IS NULL AND f.stage_rule_at IS NULL AND f.sent_at IS NOT NULL
        AND f.sent_at < $1 AND f.sent_at > $3 AND w.last_delivery IS NOT NULL AND w.stage_rules <> '{}'::jsonb
      ORDER BY f.sent_at, f.id LIMIT $2`,
    [new Date(at - UNREPORTED_MINUTES * 60000), limit, new Date(at - UNREPORTED_HOURS * 3600000)]
  );
  const done = [];
  for (const call of rows) {
    const f = fonioCalls.followUpSettings({ follow_up: call.follow_up });
    if (call.active && f.enabled && f.max_attempts > 0 && Number(call.follow_up_no || 0) < f.max_attempts) continue;   // the retries book its next try
    const res = await applyAfterCall(pool, call.workspace_id, call.id, 'not_reached');
    if (!res) continue;
    done.push(res);
    if (res.status !== 'applied') continue;
    if (call.contact_id) {
      await pool.query(
        `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) VALUES ($1,$2,$3,'note',$4,NULL,'fonio') RETURNING id`,
        [call.workspace_id, call.contact_id, call.deal_id, `fonio-Anruf · nicht erreicht\n\nfonio hat zu diesem Anruf kein Ergebnis geschickt, und ein weiterer Versuch ist nicht geplant.\n\n${noteLine(res)}`]
      ).catch(() => {});
    }
    await tellMoved(pool, call.workspace_id, res, { ...tell, timezone: call.hours_tz });
  }
  return done;
}

module.exports = { STATUSES, EVENTS, URGENCY_MAX, EVENT_WORDS, URGENCY_WORDS, UNREPORTED_MINUTES, UNREPORTED_HOURS, checkRules, foreignRefs, eventOf, applyAfterCall, noteLine, tellMoved, sweepNotReached };
