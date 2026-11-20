/* ═══════════════════════════════════════════════════════════════════════════
   THE WORKFLOWS OF THE INTEGRATIONS on the Workflows page
   (CUSTOMER_JOURNEY_CHANGES Part 8, 2026-11-19; server: routes/journey-fixed.js,
   utils/journey-fixed.js).

   What fonio, the lead webhooks, the Upgrads Engine, Cal.com and Calendly do
   stands in the list of workflows, under "From integrations", next to the
   workflows the workspace builds itself. A fixed workflow is drawn from the
   integration's own settings each time the page loads; nothing of it is kept.

   FIXED  It is read here and changed where the integration is set up:
   "Open settings" goes to its tab on the Integrations page. No step opens, no
   step is dragged, none is added — the boxes stand one under the other in the
   page's own flow (journeyFixedBoardHtml), not on the board's canvas, so none
   of the board's hands (journey.js) reaches them.

   THE SWITCH  is the integration's own switch: switching here saves the same
   setting the integration's page saves, and each page shows what the other
   did. Cal.com and Calendly have none — they happen while connected. fonio's
   two workflows only happen while fonio itself is switched on; with it off
   they say so and their switch is not offered. The server decides who may
   switch (journeyManage: owner or admin).

   A STEP the settings have switched off is shown all the same, greyed and
   marked "Off": the workflow says what does NOT happen too.

   journey.js asks for this file's part with typeof checks, so the page works
   without it: loadJourneyFixed, journeyFixedShown, journeyFixedPick,
   journeyFixedOptionsHtml, journeyFixedToolbarHtml, journeyFixedBoardHtml,
   resetJourneyFixed.

   FUNCTION MAP  loadJourneyFixed, journeyFixedShown, journeyFixedPick,
                 setJourneyFixedActive, openJourneyFixedSettings,
                 resetJourneyFixed;
                 pure: journeyFixedName, journeyFixedOptionsHtml,
                 journeyFixedSteps, journeyFixedStageId, journeyFixedStepText,
                 journeyFixedStepHtml, journeyFixedBoardHtml,
                 journeyFixedToolbarHtml, journeyFixedErrorText
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_FIXED_SOURCES = ['fonio', 'webhook', 'engine', 'calcom', 'calendly'];   // an integration, and its tab on the Integrations page
const JOURNEY_FIXED_SERVICES = { calcom: 'Cal.com', calendly: 'Calendly' };           // the booking services by their own names
// A fixed workflow's name by its key (a lead webhook's workflow carries the webhook's own name instead).
const JOURNEY_FIXED_NAMES = { 'fonio-webhook': 'jx_name_fonio_webhook', 'fonio-manual': 'jx_name_fonio_manual', engine: 'jx_name_engine', calcom: 'jx_name_calcom', calendly: 'jx_name_calendly' };
// What a step is (the server's `kind`): the word above its sentence. A start says "Start", as on the board.
const JOURNEY_FIXED_KINDS = { call: 'jx_kind_call', note: 'jx_kind_note', meeting: 'jx_kind_meeting', move: 'jx_kind_move', contact: 'jx_kind_contact', deal: 'jx_kind_deal', engine: 'jx_kind_engine',
  notify: 'jx_kind_notify', flow: 'jx_kind_flow' };
// The icon of each step (the server's `what`).
const JOURNEY_FIXED_ICONS = { lead_webhook: 'flag', deal_manual: 'flag', lead_arrives: 'flag', engine_stage: 'flag', booking_arrives: 'flag',
  fonio_call: 'phone', fonio_retry: 'refresh', fonio_callback: 'clock', fonio_note: 'note', fonio_meeting: 'calendar', fonio_stage: 'arrow-up-right',
  lead_contact: 'users', lead_engine: 'send', lead_deal: 'kanban', lead_fonio: 'phone', lead_flows: 'journey',
  engine_handover: 'send', booking_contact: 'users', booking_entry: 'calendar', booking_tell: 'bell' };
// Why a workflow cannot be switched on from here, and the route's refusal codes, as sentences.
const JOURNEY_FIXED_BLOCKED = { fonio_off: 'jx_blocked_fonio_off' };
const JOURNEY_FIXED_ERRORS = { forbidden: 'jr_err_forbidden', active: 'jr_err_generic', no_switch: 'jx_err_no_switch', fonio_off: 'jx_err_fonio_off', not_found: 'jx_err_gone' };

let journeyFixed    = [];     // GET /api/journey/fixed: what the integrations do, as workflows
let journeyFixedKey = null;   // the fixed workflow that was chosen; null while one of the workspace's own is

// Logout and a workspace switch (journey.js resetJourneyUI): nothing of the last workspace's integrations stays.
function resetJourneyFixed() { journeyFixed = []; journeyFixedKey = null; }

async function loadJourneyFixed() {
  const res = await journeySend(() => api.get('/api/journey/fixed'));
  journeyFixed = res && !res.error && Array.isArray(res.fixed) ? res.fixed.filter(f => f && typeof f.key === 'string' && Array.isArray(f.steps)) : [];
  if (!journeyFixed.some(f => f.key === journeyFixedKey)) journeyFixedKey = null;   // its integration was disconnected meanwhile
  return journeyFixed;
}

// The fixed workflow the page shows, or null while it shows one of the workspace's own. A workspace that has built
// none yet sees what its integrations do: the first of them.
function journeyFixedShown() {
  return journeyFixed.find(f => f.key === journeyFixedKey) || (!journeyFlows.length && journeyFixed[0]) || null;
}
// What the list of workflows chose (journey.js setJourneyFlow): 'fx:<key>' is a fixed workflow, anything else is not.
function journeyFixedPick(value) {
  const key = typeof value === 'string' && value.startsWith('fx:') ? value.slice(3) : null;
  journeyFixedKey = journeyFixed.some(f => f.key === key) ? key : null;
}

function journeyFixedName(fx) {
  if (fx.source === 'webhook') return tf('jx_name_webhook', { name: fx.name || '' });
  return JOURNEY_FIXED_NAMES[fx.key] ? t(JOURNEY_FIXED_NAMES[fx.key]) : String(fx.key);
}
// The fixed workflows as a group of the list of workflows; nothing while there are none.
function journeyFixedOptionsHtml() {
  if (!journeyFixed.length) return '';
  const shown = journeyFixedShown();
  return `<optgroup label="${esc(t('jx_group'))}">${journeyFixed.map(f => `<option value="fx:${esc(f.key)}"${shown && shown.key === f.key ? ' selected' : ''}>${esc(journeyFixedName(f))}</option>`).join('')}</optgroup>`;
}

// The stage a new deal lands in: the chosen one, else the first of its pipeline (as the server puts it there). null
// when neither exists any more.
function journeyFixedStageId(pipelineId, stageId) {
  if (stageId) return stageId;
  const p = journeyPipelines().find(x => x.id === pipelineId), first = p && Array.isArray(p.stages) ? p.stages[0] : null;
  return first ? first.id : null;
}
// A fixed workflow's steps as they are shown. A lead webhook's are followed by the workspace's own workflows that
// take its deals in: those that run and start with a lead from a lead webhook (every one, or this one), with any
// new deal, or with the stage its deals land in — and are not limited to another pipeline. They are looked up here, so they follow a workflow switched on a moment ago.
function journeyFixedSteps(fx) {
  const steps = Array.isArray(fx.steps) ? [...fx.steps] : [];
  const deal = fx.source === 'webhook' ? steps.find(s => s.what === 'lead_deal' && !s.off) : null;
  if (!deal) return steps;
  const stageId = journeyFixedStageId(deal.pipeline_id, deal.stage_id);
  const names = journeyFlows.filter(f => f.active).filter(f => {
    const c = ((f.nodes || []).find(n => n.kind === 'start') || {}).config || {};
    if (c.pipeline_id && c.pipeline_id !== deal.pipeline_id) return false;   // a start limited to another pipeline (Part 9)
    if (c.trigger === 'deal_new') return true;                               // any new deal, however it was made
    if (c.trigger === 'lead') return !Array.isArray(c.webhook_ids) || c.webhook_ids.includes(fx.webhook_id);
    return c.trigger === 'stage' && !!stageId && c.stage_id === stageId;
  }).map(f => f.name);
  if (names.length) steps.push({ what: 'lead_flows', kind: 'flow', off: false, names });
  return steps;
}

// What a step says: { title, lines, warn }. Pure apart from t()/tf(), the language and the names the page knows
// (pipelines, stages, lead webhooks).
function journeyFixedStepText(step, fx) {
  const lines = [];
  let title = '', warn = '';
  const named = (ids, list) => ids.map(id => list.find(x => x.id === id)).filter(Boolean).map(x => x.name);
  const after = minutes => (Number(minutes) > 0 ? journeyWaitText(minutes) : t('jx_at_once'));
  const onlyPipelines = () => {   // fonio limited to some pipelines is said; every pipeline needs no line
    if (!Array.isArray(step.pipeline_ids)) return;
    const names = named(step.pipeline_ids, journeyPipelines());
    lines.push(names.length ? tf('jx_only_pipelines', { names: names.join(', ') }) : t('jx_only_gone'));
  };
  switch (step.what) {
    case 'lead_webhook': {
      title = t('jx_s_lead_webhook');
      if (!Array.isArray(step.webhook_ids)) lines.push(t('jx_from_all'));
      else { const names = named(step.webhook_ids, journeyWebhooks); lines.push(names.length ? tf('jx_from_some', { names: names.join(', ') }) : t('jx_from_gone')); }
      onlyPipelines();
      break;
    }
    case 'deal_manual': title = t('jx_s_deal_manual'); onlyPipelines(); break;
    case 'fonio_call':
      title = t('jx_s_fonio_call');
      lines.push(step.hours ? tf('jx_hours', { days: (Array.isArray(step.hours.days) ? step.hours.days : []).map(d => t('fonio_day_' + d)).join(', '), from: step.hours.from, to: step.hours.to }) : t('jx_hours_any'));
      break;
    case 'fonio_retry':
      title = t('jx_s_fonio_retry');
      if (!step.off) lines.push(tf(step.max_attempts === 1 ? 'jx_retry_one' : 'jx_retry_many', { n: step.max_attempts, no_answer: after(step.no_answer), voicemail: after(step.voicemail), busy: after(step.busy) }));
      break;
    case 'fonio_callback': title = t('jx_s_fonio_callback'); break;
    case 'fonio_note': title = t('jx_s_fonio_note'); lines.push(t('jx_fonio_note_line')); break;
    case 'fonio_meeting': {
      const service = JOURNEY_FIXED_SERVICES[step.service];
      title = service ? tf('jx_s_fonio_meeting', { service }) : t('jx_s_fonio_meeting_any');
      if (step.off) lines.push(t('jx_fonio_meeting_off'));
      else if (!service) warn = t('jx_warn_no_booking');
      break;
    }
    case 'fonio_stage':
      title = t('jx_s_fonio_stage');
      lines.push(step.off ? t('jx_fonio_stage_off') : step.lines === 1 ? t('jx_stage_rule_one') : tf('jx_stage_rules', { n: step.lines }));
      break;
    case 'lead_arrives': title = t('jx_s_lead_arrives'); break;
    case 'lead_contact':
      title = t('jx_s_lead_contact');
      lines.push(t('jx_lead_contact_line'));
      if (step.assignee_name) lines.push(tf('jx_assigned', { name: step.assignee_name }));
      break;
    case 'lead_engine': title = t('jx_s_lead_engine'); break;
    case 'lead_deal': {
      title = t('jx_s_lead_deal');
      const stage = step.off ? null : journeyStageName(journeyFixedStageId(step.pipeline_id, step.stage_id));
      lines.push(step.off ? t('jx_lead_deal_off') : stage ? tf('jx_in_stage', { stage }) : t('jx_in_stage_first'));
      break;
    }
    case 'lead_fonio': title = t('jx_s_lead_fonio'); lines.push(tf('jx_see', { name: t('jx_name_fonio_webhook') })); break;
    case 'lead_flows': {
      const names = Array.isArray(step.names) ? step.names : [];
      title = names.length === 1 ? tf('jx_s_lead_flow', { name: names[0] }) : tf('jx_s_lead_flows', { names: names.join(', ') });
      break;
    }
    case 'engine_stage': {
      title = t('jx_s_engine_stage');
      const names = (Array.isArray(step.stage_ids) ? step.stage_ids : []).map(id => journeyStageName(id)).filter(Boolean);
      if (names.length) lines.push(names.join(', ')); else warn = t('jx_warn_no_stage');
      break;
    }
    case 'engine_handover': title = t('jx_s_engine_handover'); lines.push(t('jx_engine_line')); break;
    case 'booking_arrives': title = tf('jx_s_booking_arrives', { service: JOURNEY_FIXED_SERVICES[fx.source] || '' }); break;
    case 'booking_contact': {
      if (step.known_only) { title = t('jx_s_booking_known'); lines.push(t('jx_booking_known_line')); break; }
      title = t('jx_s_booking_contact');
      const stage = step.pipeline_id ? journeyStageName(journeyFixedStageId(step.pipeline_id, step.stage_id)) : null;
      lines.push(stage ? tf('jx_booking_new', { stage }) : t('jx_booking_new_first'));
      break;
    }
    case 'booking_entry': title = t('jx_s_booking_entry'); lines.push(t('jx_booking_entry_line')); break;
    case 'booking_tell': title = t('jx_s_booking_tell'); lines.push(t('jx_booking_tell_line')); break;
    default: title = String(step.what || '');   // a step a newer server knows and this page does not: its own word
  }
  return { title, lines, warn };
}

// One step: the board's box, to read. A step that is switched off says so.
function journeyFixedStepHtml(step, fx) {
  const said = journeyFixedStepText(step, fx), start = step.kind === 'start';
  const kind = start ? t('jr_kind_start') : JOURNEY_FIXED_KINDS[step.kind] ? t(JOURNEY_FIXED_KINDS[step.kind]) : '';
  const when = !start && !step.off && Number.isInteger(step.wait_minutes) ? journeyWaitText(step.wait_minutes) : '';
  return `<li class="jx-step${step.off ? ' is-off' : ''}"><div class="jx-box${start ? ' jx-start' : ''}" data-kind="${esc(step.kind)}"><span class="jr-ic">${icon(JOURNEY_FIXED_ICONS[step.what] || 'note')}</span>
      <span class="jr-what"><span class="jr-meta"><b>${esc(kind)}</b>${when ? `<span>${esc(when)}</span>` : ''}${step.off ? `<span class="jx-off">${esc(t('jx_off'))}</span>` : ''}</span>
        <span class="jr-title">${esc(said.title)}</span>${said.lines.map(l => `<span class="jr-text">${esc(l)}</span>`).join('')}${said.warn ? `<span class="jr-warn">${icon('alert')}${esc(said.warn)}</span>` : ''}</span>
    </div></li>`;
}
// The shown fixed workflow: its steps one under the other, in the order they happen.
function journeyFixedBoardHtml(fx) {
  return `<div class="jx-wrap"><ol class="jx-chain" aria-label="${esc(journeyFixedName(fx))}">${journeyFixedSteps(fx).map(s => journeyFixedStepHtml(s, fx)).join('')}</ol></div>`;
}

// Above it: that it is fixed, whether it runs — for an owner or admin the integration's own switch — and the way to
// the integration's settings, for everyone.
function journeyFixedToolbarHtml(fx) {
  const state = t(fx.active ? 'jr_on' : 'jr_off');
  const lock = `<span class="badge jx-lock">${icon('lock')}<span>${esc(t('jx_fixed'))}</span></span>`;
  const run = !fx.switchable ? `<span class="badge badge-success">${esc(tf('jx_always', { service: JOURNEY_FIXED_SERVICES[fx.source] || '' }))}</span>`
    : journeyManage ? `<label class="jr-run"><input type="checkbox" class="switch" aria-label="${esc(t('jr_switch_aria'))}"${fx.active ? ' checked' : ''}${fx.blocked ? ' disabled' : ''} onchange="setJourneyFixedActive(this.checked)"><span>${esc(state)}</span></label>`
    : `<span class="badge${fx.active ? ' badge-success' : ''}">${esc(state)}</span>`;
  const why = JOURNEY_FIXED_BLOCKED[fx.blocked] ? `<span class="jx-blocked">${icon('alert')}${esc(t(JOURNEY_FIXED_BLOCKED[fx.blocked]))}</span>` : '';
  const open = `<button type="button" class="btn btn-secondary btn-sm" onclick="openJourneyFixedSettings()">${icon('settings')}<span>${esc(t('jx_open'))}</span></button>`;
  return lock + run + why + open + `<span class="jr-hint">${esc(t('jx_hint'))}</span>`;
}

function journeyFixedErrorText(res) { return t(JOURNEY_FIXED_ERRORS[res && res.code] || 'jr_err_generic'); }

// The switch: the integration's own setting is saved, and the server answers every fixed workflow as it is now.
async function setJourneyFixedActive(on) {
  const fx = journeyFixedShown();
  if (!fx || !journeyManage || !fx.switchable) return;
  journeyFixedKey = fx.key;   // the one that was switched stays the one that is shown
  const res = await journeySend(() => api.put(`/api/journey/fixed/${encodeURIComponent(fx.key)}`, { active: !!on }));
  if (!res || res.error || !Array.isArray(res.fixed)) { ui.toast(journeyFixedErrorText(res)); return renderJourney(); }   // the switch goes back to what is true
  journeyFixed = res.fixed;
  renderJourney();
  if (fx.source === 'engine' && typeof updateOnboardingNav === 'function') updateOnboardingNav();   // the Onboarding link follows the Engine's switch, as on its own tab
  const now = journeyFixed.find(f => f.key === fx.key);
  ui.toast(t(now && now.active ? 'jx_switched_on' : 'jx_switched_off'));
}

// "Open settings": the integration's tab on the Integrations page — for a lead webhook that webhook's card, for
// fonio the part that holds who is called and when. The page reads its settings anew when it opens.
function openJourneyFixedSettings() {
  const fx = journeyFixedShown();
  if (!fx || !JOURNEY_FIXED_SOURCES.includes(fx.source)) return null;
  if (typeof switchIntgTab === 'function') switchIntgTab(fx.source);
  if (fx.source === 'webhook' && typeof currentWebhookId !== 'undefined') currentWebhookId = fx.webhook_id;
  if (fx.source === 'fonio' && typeof setFonioPart === 'function') setFonioPart('who');
  return switchPage('integrations');
}
