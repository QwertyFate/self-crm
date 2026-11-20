/* ═══════════════════════════════════════════════════════════════════════════
   THE WORKFLOWS OF THE INTEGRATIONS — what fonio, the lead webhooks, the
   Upgrads Engine, Cal.com and Calendly do, shown on the Workflows page next
   to the workflows a workspace builds itself (CUSTOMER_JOURNEY_CHANGES Part 8,
   2026-11-19; routes/journey-fixed.js answers with it, public/js/
   journey-fixed.js draws it).

   NOTHING IS KEPT HERE. A fixed workflow is drawn from the integration's own
   settings every time it is asked for: no table, no copy that could say
   something else than the settings do. So it cannot be edited on the board —
   it is changed where the integration is set up — and its switch IS the
   integration's switch: the same column, flipped from either page.

   THE WORKFLOWS (key, when it exists, its switch)
     fonio-webhook   fonio is connected      workspace_fonio.on_deal_webhook
     fonio-manual    fonio is connected      workspace_fonio.on_deal_manual
                     Both only happen while fonio itself is switched on
                     (workspace_fonio.active): with it off they are shown as
                     off and `blocked: 'fonio_off'`, and cannot be switched on
                     from here. fonio's main switch is not theirs — a call step
                     of a workspace's own workflow needs it too.
     webhook-<id>    one per lead webhook    workspace_webhook.active
     engine          the Engine has its URL  workspace_engine.active
     calcom          Cal.com is connected    none: it happens while connected
     calendly        Calendly is connected   none

   A WORKFLOW  { key, source, name, active, switchable, blocked, steps }.
   `name` is a lead webhook's own name; every other workflow is named by the
   page, in its language. A STEP is { what, kind, off, … }: `what` names the
   sentence the page says, `kind` its colour and icon family, `off` a step the
   settings have switched off (shown, greyed), and the rest is what the
   sentence needs — ids of pipelines, stages and lead webhooks, which the page
   turns into names, never a key, a token or an address.

   compose() is pure: rows in, workflows out. read() and setActive() take the
   pool, as every utility does.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fonioCalls = require('./fonio-calls');   // followUpSettings and allowedBy: the settings read as fonio's own code reads them

// fonio's two triggers for a new deal: the workflow's key → the column that switches it.
const FONIO_SWITCHES = { 'fonio-webhook': 'on_deal_webhook', 'fonio-manual': 'on_deal_manual' };
const WEBHOOK_KEY = /^webhook-([1-9]\d{0,9})$/;

// Whole positive numbers of a list, each once.
const idsOf = list => [...new Set((Array.isArray(list) ? list : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
// A "who gets the call" list as it is saved: null for all, or the ids.
const onlyOf = list => (Array.isArray(list) ? idsOf(list) : null);
const hhmm = v => String(v || '').slice(0, 5);   // TIME comes back as HH:MM:SS
const step = (what, kind, more = {}) => ({ what, kind, off: false, ...more });

// What follows a trigger of fonio's, in the order it happens: the call, the calls after it, and what the call's
// result does. `booking` is the service a meeting agreed in the call is booked at: 'calcom', 'calendly' or null.
function fonioSteps(f, booking) {
  const follow = fonioCalls.followUpSettings(f);
  const rules = f.stage_rules && typeof f.stage_rules === 'object' && !Array.isArray(f.stage_rules) ? f.stage_rules : {};
  const lines = Object.values(rules).reduce((n, events) => n + (events && typeof events === 'object' ? Object.keys(events).length : 0), 0);
  return [
    step('fonio_call', 'call', { wait_minutes: Number(f.delay_minutes) || 0,
      hours: f.hours_on ? { days: idsOf(f.hours_days).sort((a, b) => a - b), from: hhmm(f.hours_from), to: hhmm(f.hours_to) } : null }),
    step('fonio_retry', 'call', { off: !(follow.enabled && follow.max_attempts > 0), max_attempts: follow.max_attempts,
      no_answer: follow.no_answer, voicemail: follow.voicemail, busy: follow.busy }),
    step('fonio_callback', 'call', { off: !follow.callback }),
    step('fonio_note', 'note'),
    step('fonio_meeting', 'meeting', { off: f.book_meetings === false, service: booking }),
    step('fonio_stage', 'move', { off: !lines, lines }),
  ];
}

function fonioFlows(f, booking) {
  if (!f) return [];
  const after = fonioSteps(f, booking), pipelines = onlyOf(f.only_pipelines);
  const flow = (key, start) => ({ key, source: 'fonio', name: null, active: !!f.active && !!f[FONIO_SWITCHES[key]], switchable: true,
    blocked: f.active ? null : 'fonio_off', steps: [start, ...after] });
  return [
    flow('fonio-webhook', step('lead_webhook', 'start', { webhook_ids: onlyOf(f.only_webhooks), pipeline_ids: pipelines })),
    flow('fonio-manual', step('deal_manual', 'start', { pipeline_ids: pipelines })),
  ];
}

// One workflow per lead webhook: what a delivery to it does (routes/integrations.js POST /receive/:key). The call
// is named only when fonio would make it for a deal this webhook creates; the Engine only while it listens.
function webhookFlows(webhooks, fonio, engineOn) {
  return webhooks.map(w => {
    const deal = !!(w.create_deal && w.pipeline_id);
    const steps = [step('lead_arrives', 'start'), step('lead_contact', 'contact', { assignee_name: w.assignee_name || null })];
    if (engineOn) steps.push(step('lead_engine', 'engine'));
    // no stage chosen (or the chosen one deleted): the pipeline's first, which the page looks up
    steps.push(step('lead_deal', 'deal', { off: !deal, pipeline_id: deal ? Number(w.pipeline_id) : null, stage_id: deal && w.stage_id ? Number(w.stage_id) : null }));
    if (deal && fonio && fonio.active && fonio.on_deal_webhook && fonioCalls.allowedBy(fonio.only_webhooks, w.id) && fonioCalls.allowedBy(fonio.only_pipelines, w.pipeline_id)) {
      steps.push(step('lead_fonio', 'call', { wait_minutes: Number(fonio.delay_minutes) || 0 }));
    }
    return { key: `webhook-${w.id}`, source: 'webhook', webhook_id: Number(w.id), name: w.name, active: !!w.active, switchable: true, blocked: null, steps };
  });
}

// The hand-over: a deal that arrives in a trigger stage is sent to the Engine (utils/engine.js dispatchContractSigned).
function engineFlows(e) {
  if (!e || !e.engine_url) return [];   // without its URL the Engine is not set up, and cannot be switched on
  return [{ key: 'engine', source: 'engine', name: null, active: !!e.active, switchable: true, blocked: null,
    steps: [step('engine_stage', 'start', { stage_ids: idsOf(e.trigger_stage_ids) }), step('engine_handover', 'engine')] }];
}

// A booking that arrives from Cal.com or Calendly (their receivers; calContactFor in routes/integrations.js). A guest
// the CRM does not know becomes a contact with a deal where the workspace's FIRST lead webhook puts its deals —
// unless the workspace only notes bookings on contacts it has.
function bookingFlows(calcom, calendly, first) {
  const flow = (key, row) => ({ key, source: key, name: null, active: true, switchable: false, blocked: null, steps: [
    step('booking_arrives', 'start'),
    step('booking_contact', 'contact', row.existing_contacts_only
      ? { known_only: true }
      : { known_only: false, pipeline_id: first && first.pipeline_id ? Number(first.pipeline_id) : null, stage_id: first && first.pipeline_id && first.stage_id ? Number(first.stage_id) : null }),
    step('booking_entry', 'meeting'),
    step('booking_tell', 'notify'),
  ] });
  return [...(calcom ? [flow('calcom', calcom)] : []), ...(calendly ? [flow('calendly', calendly)] : [])];
}

// Rows in, workflows out. webhooks: oldest first, as the workspace's first lead webhook is its oldest.
function compose({ fonio = null, webhooks = [], engine = null, calcom = null, calendly = null } = {}) {
  const booking = calcom ? 'calcom' : calendly ? 'calendly' : null;   // Cal.com first, as utils/fonio-meeting.js asks
  const engineOn = !!(engine && engine.active && engine.engine_url);
  return [...fonioFlows(fonio, booking), ...webhookFlows(webhooks, fonio, engineOn), ...engineFlows(engine), ...bookingFlows(calcom, calendly, webhooks[0] || null)];
}

// The workspace's fixed workflows, from what its integrations hold now. Only what a workflow shows is read: no key,
// no token, no address — and an assignee's name only while that person is a member of this workspace.
async function read(pool, wid) {
  const one = async sql => (await pool.query(sql, [wid])).rows[0] || null;
  const fonio = await one(
    `SELECT active, delay_minutes, on_deal_manual, on_deal_webhook, hours_on, hours_days, hours_from, hours_to, follow_up, book_meetings,
            only_webhooks, only_pipelines, stage_rules
       FROM workspace_fonio WHERE workspace_id = $1`
  );
  const { rows: webhooks } = await pool.query(
    `SELECT w.id, w.name, w.active, w.create_deal, w.pipeline_id, w.stage_id, u.name AS assignee_name
       FROM workspace_webhook w
       LEFT JOIN users u ON u.id = w.default_assignee_id
        AND EXISTS (SELECT 1 FROM user_workspaces uw WHERE uw.user_id = u.id AND uw.workspace_id = w.workspace_id)
      WHERE w.workspace_id = $1 ORDER BY w.id`, [wid]
  );
  const engine = await one('SELECT engine_url, active, trigger_stage_ids FROM workspace_engine WHERE workspace_id = $1');
  const calcom = await one('SELECT existing_contacts_only FROM workspace_calcom WHERE workspace_id = $1');
  const calendly = await one('SELECT existing_contacts_only FROM workspace_calendly WHERE workspace_id = $1');
  return compose({ fonio, webhooks, engine, calcom, calendly });
}

// A fixed workflow's switch, flipped from the Workflows page: the integration's own column, with what that
// integration's own route does when it saves it — nothing more for a trigger of fonio's (calls already waiting stay,
// as they do there), a lead webhook or the Engine. { ok: true }, or { code }: not_found (no such workflow in this
// workspace), fonio_off (fonio itself is switched off), no_switch (Cal.com and Calendly happen while connected).
async function setActive(pool, { workspaceId, key, active, userId = null }) {
  const column = typeof key === 'string' && Object.hasOwn(FONIO_SWITCHES, key) ? FONIO_SWITCHES[key] : null;   // only the two keys: never 'constructor'
  if (column) {
    const { rows: [f] } = await pool.query('SELECT active FROM workspace_fonio WHERE workspace_id = $1', [workspaceId]);
    if (!f) return { code: 'not_found' };
    if (active && !f.active) return { code: 'fonio_off' };
    // the guard again in the statement: fonio switched off between the two still switches nothing on
    const { rowCount } = await pool.query(
      `UPDATE workspace_fonio SET ${column} = $2, saved_by = $3, saved_at = NOW() WHERE workspace_id = $1 AND (active OR NOT $2)`, [workspaceId, active, userId]
    );
    return rowCount ? { ok: true } : { code: 'fonio_off' };
  }
  const hook = typeof key === 'string' ? WEBHOOK_KEY.exec(key) : null;
  if (hook) {
    const { rowCount } = await pool.query('UPDATE workspace_webhook SET active = $3 WHERE id = $1 AND workspace_id = $2', [Number(hook[1]), workspaceId, active]);
    return rowCount ? { ok: true } : { code: 'not_found' };
  }
  if (key === 'engine') {
    const { rowCount } = await pool.query('UPDATE workspace_engine SET active = $2, updated_at = NOW() WHERE workspace_id = $1 AND engine_url IS NOT NULL', [workspaceId, active]);
    return rowCount ? { ok: true } : { code: 'not_found' };
  }
  if (key === 'calcom' || key === 'calendly') return { code: 'no_switch' };
  return { code: 'not_found' };
}

module.exports = { FONIO_SWITCHES, compose, read, setActive };
