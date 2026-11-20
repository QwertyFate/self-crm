/* ═══════════════════════════════════════════════════════════════════════════
   THE START OF A WORKFLOW — what sets it off
   (CUSTOMER_JOURNEY_CHANGES Part 9, 2026-11-19; server: utils/journey-triggers.js
   has every start and finds its deals, routes/journey.js saves one).

   A workflow starts on one of many things the CRM knows of: a lead from a
   lead webhook, a deal in a stage, a booking, what came out of a fonio call,
   a task, a date, a weekday … They are SORTED BY WHAT THEY ARE ABOUT, so the
   one that is needed is found by looking, not by reading a long list:
     Leads and deals · Contacts · Calls (fonio) · Meetings · Tasks · Time · Other
   The window shows the categories as tabs and, under the open one, its starts
   as cards — each with a line that says what it means. Choosing a card shows
   that start's own settings (a stage, a field, how many hours …) and nothing
   else. Every start can be limited to one pipeline.

   WHERE THE WORKFLOW ENDS FOR A DEAL (Parts 10, 13 and 16) is set in the same
   window, in a panel of its own that is built like the start above it:
     · on top, WHAT IS SWITCHED ON — each rule a row with what it was set to
       ("The deal arrives in a stage · Booked, Won"), a way to it, and a
       cross that switches it off; a rule that still lacks something says so;
     · under it EVERY RULE THERE IS, sorted by what it is about as tabs —
       Stages, Deal, Contact, Calls, Meetings, Tasks, Time, Other — each tab
       with how many of its rules are on. A rule is a card: its name, a line
       that says what it means, and a switch. A rule that is on is framed
       and shows what it needs inside its card (stages and call results as
       chips to choose, a level, a field and maybe its value, a number of
       days, another workflow).
   Any one rule that is on ends the workflow. The two stage rules — the deal
   arrives in one of these stages, the deal is no longer in one of these
   stages — may both be on. A rule that is off sends nothing, whatever was
   set in its card. Every rule's switch and settings are in the page all the
   time, whichever tab is open: the tabs only show and hide.
   Two kinds of rule (utils/journey-ends.js): what HAPPENED since the deal
   entered (a booking, a call, a document, a task …), and how the deal IS when
   a step is due (assigned, urgency, a field's value, onboarding, "no more
   emails") — a deal that is already so when it enters ends at its first step,
   which the section says in a line of its own.
   What is saved: stop_stage_ids and stay_stage_ids (the two stage rules),
   stop_on (the other rules that are ticked, in the list's order) and stop_set
   (the settings of those that have any, by rule).

   JOURNEY_TRIGGERS is the server's TRIGGERS (a test holds the two together):
   each start's category and the settings it uses, plus the two sentences the
   chooser shows. JOURNEY_STOP_ON_KEYS, JOURNEY_STOP_GROUPS and
   JOURNEY_STOP_USES are the server's end rules the same way.

   journeyStartLines(node) is what a start says on its box; openJourneyStart
   is its window (journey.js calls both). While the workflow runs the start is
   only read; a member reads it always.

   FUNCTION MAP  loadJourneyStart, openJourneyStart, resetJourneyStart;
                 pure: journeyStartLines, journeyStartChooserHtml,
                 journeyStartFieldOptions, journeyStartState,
                 journeyStartShown, journeyStartConfig, journeyStartUses,
                 journeyStopGroup, journeyStopDetail, journeyStopSummaryHtml,
                 journeyStopTabsHtml, journeyStopHtml
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_CATEGORIES = ['deals', 'contacts', 'calls', 'meetings', 'tasks', 'time', 'other'];
const JOURNEY_CAT_KEYS = { deals: 'jt_cat_deals', contacts: 'jt_cat_contacts', calls: 'jt_cat_calls', meetings: 'jt_cat_meetings', tasks: 'jt_cat_tasks', time: 'jt_cat_time', other: 'jt_cat_other' };
const JOURNEY_CAT_ICONS = { deals: 'kanban', contacts: 'users', calls: 'phone', meetings: 'calendar', tasks: 'check-square', time: 'clock', other: 'plug' };
// key → its category, the settings it uses, and its two sentences in the chooser
const JOURNEY_TRIGGERS = {
  lead:              { cat: 'deals',    uses: ['webhook_ids'],                    title: 'jt_t_lead',              hint: 'jt_h_lead' },
  deal_manual:       { cat: 'deals',    uses: [],                                 title: 'jt_t_deal_manual',       hint: 'jt_h_deal_manual' },
  deal_import:       { cat: 'deals',    uses: [],                                 title: 'jt_t_deal_import',       hint: 'jt_h_deal_import' },
  deal_new:          { cat: 'deals',    uses: [],                                 title: 'jt_t_deal_new',          hint: 'jt_h_deal_new' },
  stage:             { cat: 'deals',    uses: ['stage_id'],                       title: 'jt_t_stage',             hint: 'jt_h_stage' },
  stage_left:        { cat: 'deals',    uses: ['stage_id'],                       title: 'jt_t_stage_left',        hint: 'jt_h_stage_left' },
  assigned:          { cat: 'deals',    uses: [],                                 title: 'jt_t_assigned',          hint: 'jt_h_assigned' },
  urgency:           { cat: 'deals',    uses: ['min_urgency'],                    title: 'jt_t_urgency',           hint: 'jt_h_urgency' },
  deal_field:        { cat: 'deals',    uses: ['field_key', 'value'],             title: 'jt_t_deal_field',        hint: 'jt_h_deal_field' },
  manual:            { cat: 'deals',    uses: [],                                 title: 'jt_t_manual',            hint: 'jt_h_manual' },
  contact_field:     { cat: 'contacts', uses: ['field_key', 'value'],             title: 'jt_t_contact_field',     hint: 'jt_h_contact_field' },
  document:          { cat: 'contacts', uses: ['doc_type'],                       title: 'jt_t_document',          hint: 'jt_h_document' },
  call_result:       { cat: 'calls',    uses: ['result'],                         title: 'jt_t_call_result',       hint: 'jt_h_call_result' },
  call_inbound:      { cat: 'calls',    uses: [],                                 title: 'jt_t_call_inbound',      hint: 'jt_h_call_inbound' },
  meeting_booked:    { cat: 'meetings', uses: [],                                 title: 'jt_t_meeting_booked',    hint: 'jt_h_meeting_booked' },
  meeting_moved:     { cat: 'meetings', uses: [],                                 title: 'jt_t_meeting_moved',     hint: 'jt_h_meeting_moved' },
  meeting_cancelled: { cat: 'meetings', uses: [],                                 title: 'jt_t_meeting_cancelled', hint: 'jt_h_meeting_cancelled' },
  meeting_before:    { cat: 'meetings', uses: ['hours'],                          title: 'jt_t_meeting_before',    hint: 'jt_h_meeting_before' },
  meeting_after:     { cat: 'meetings', uses: ['hours'],                          title: 'jt_t_meeting_after',     hint: 'jt_h_meeting_after' },
  notetaker:         { cat: 'meetings', uses: [],                                 title: 'jt_t_notetaker',         hint: 'jt_h_notetaker' },
  task_done:         { cat: 'tasks',    uses: [],                                 title: 'jt_t_task_done',         hint: 'jt_h_task_done' },
  task_overdue:      { cat: 'tasks',    uses: [],                                 title: 'jt_t_task_overdue',      hint: 'jt_h_task_overdue' },
  stage_days:        { cat: 'time',     uses: ['stage_id', 'days'],               title: 'jt_t_stage_days',        hint: 'jt_h_stage_days' },
  quiet_days:        { cat: 'time',     uses: ['days'],                           title: 'jt_t_quiet_days',        hint: 'jt_h_quiet_days' },
  date_field:        { cat: 'time',     uses: ['field_key', 'offset_days', 'at'], title: 'jt_t_date_field',        hint: 'jt_h_date_field' },
  schedule:          { cat: 'time',     uses: ['stage_id', 'weekdays', 'at'],     title: 'jt_t_schedule',          hint: 'jt_h_schedule' },
  opt_out:           { cat: 'other',    uses: [],                                 title: 'jt_t_opt_out',           hint: 'jt_h_opt_out' },
  onboarding_done:   { cat: 'other',    uses: [],                                 title: 'jt_t_onboarding_done',   hint: 'jt_h_onboarding_done' },
  flow_done:         { cat: 'other',    uses: ['flow_id'],                        title: 'jt_t_flow_done',         hint: 'jt_h_flow_done' },
};
// What came out of a fonio call, and the kinds of document: the server's words, each with its own here.
const JOURNEY_RESULT_KEYS = { interested: 'jt_res_interested', meeting_booked: 'jt_res_meeting_booked', callback: 'jt_res_callback', not_interested: 'jt_res_not_interested', wrong_person: 'jt_res_wrong_person',
  not_reached: 'jt_res_not_reached' };
const JOURNEY_DOC_KEYS = { vertrag: 'jt_doc_vertrag', aufnahme: 'jt_doc_aufnahme', sonstiges: 'jt_doc_sonstiges' };
const JOURNEY_URGENCY_KEYS = { 1: 'urg_1', 2: 'urg_2', 3: 'urg_3', 4: 'urg_4' };
const JOURNEY_DAY_KEYS = { 1: 'fonio_day_1', 2: 'fonio_day_2', 3: 'fonio_day_3', 4: 'fonio_day_4', 5: 'fonio_day_5', 6: 'fonio_day_6', 7: 'fonio_day_7' };
const JOURNEY_START_MAX = { hours: 720, days: 365, value: 200 };   // the server's limits (utils/journey-triggers.js)
// What ends a workflow for a deal (Part 13). Beside the two stage rules, which are this window's own names for the two
// stage lists a start has, the rules are the server's STOP_ON in its order, each with its sentence —
const JOURNEY_STOP_ON_KEYS = { assigned: 'jt_on_assigned', urgency: 'jt_on_urgency', field: 'jt_on_field', contact_field: 'jt_on_contact_field', document: 'jt_on_document',
  onboarding_done: 'jt_on_onboarding_done', opt_out: 'jt_on_opt_out', answered: 'jt_on_answered', call_result: 'jt_on_call_result', call_inbound: 'jt_on_call_inbound', meeting: 'jt_on_meeting',
  meeting_cancelled: 'jt_on_meeting_cancelled', task_done: 'jt_on_task_done', max_days: 'jt_on_max_days', other_flow: 'jt_on_other_flow' };
const JOURNEY_STAGE_RULES = { arrive: 'jt_on_arrive', leave: 'jt_on_leave' };   // arrive: stop_stage_ids; leave: stay_stage_ids
// — the heading each rule stands under in the window (the server's STOP_CATEGORIES, with the stage rules first), and
// the settings a rule has (the server's STOP_USES; a rule that is not named has none).
const JOURNEY_STOP_GROUPS = { stages: ['arrive', 'leave'], deal: ['assigned', 'urgency', 'field'], contact: ['contact_field', 'document', 'onboarding_done', 'opt_out'],
  calls: ['answered', 'call_result', 'call_inbound'], meetings: ['meeting', 'meeting_cancelled'], tasks: ['task_done'], time: ['max_days'], other: ['other_flow'] };
const JOURNEY_STOP_HEADS = { stages: 'jt_ec_stages', deal: 'jt_ec_deal', contact: 'jt_ec_contact', calls: 'jt_cat_calls', meetings: 'jt_cat_meetings', tasks: 'jt_cat_tasks', time: 'jt_cat_time', other: 'jt_cat_other' };
const JOURNEY_STOP_USES = { urgency: ['min_urgency'], field: ['field_key', 'value'], contact_field: ['field_key', 'value'], document: ['doc_type'], call_result: ['results'], max_days: ['days'], other_flow: ['flow_id'] };
const JOURNEY_STOP_MAX = 20;   // how many stages a stage rule may name
// How the end rules are shown (Part 16): the icon of each heading's tab; each rule's two sentences on its card — its
// name, and what it means; and which rule a field of the window belongs to, so that the rule's tab can be opened when
// that field is the one that is missing.
const JOURNEY_STOP_ICONS = { stages: 'columns', deal: 'briefcase', contact: 'users', calls: 'phone', meetings: 'calendar', tasks: 'check-square', time: 'clock', other: 'plug' };
const JOURNEY_STOP_TITLES = { arrive: 'jt_et_arrive', leave: 'jt_et_leave', assigned: 'jt_et_assigned', urgency: 'jt_et_urgency', field: 'jt_et_field', contact_field: 'jt_et_contact_field', document: 'jt_et_document',
  onboarding_done: 'jt_et_onboarding_done', opt_out: 'jt_et_opt_out', answered: 'jt_et_answered', call_result: 'jt_et_call_result', call_inbound: 'jt_et_call_inbound', meeting: 'jt_et_meeting',
  meeting_cancelled: 'jt_et_meeting_cancelled', task_done: 'jt_et_task_done', max_days: 'jt_et_max_days', other_flow: 'jt_et_other_flow' };
const JOURNEY_STOP_HINTS = { arrive: 'jt_eh_arrive', leave: 'jt_eh_leave', assigned: 'jt_eh_assigned', urgency: 'jt_eh_urgency', field: 'jt_eh_field', contact_field: 'jt_eh_contact_field', document: 'jt_eh_document',
  onboarding_done: 'jt_eh_onboarding_done', opt_out: 'jt_eh_opt_out', answered: 'jt_eh_answered', call_result: 'jt_eh_call_result', call_inbound: 'jt_eh_call_inbound', meeting: 'jt_eh_meeting',
  meeting_cancelled: 'jt_eh_meeting_cancelled', task_done: 'jt_eh_task_done', max_days: 'jt_eh_max_days', other_flow: 'jt_eh_other_flow' };
const JOURNEY_STOP_PARTS = { endarrive: 'arrive', endleave: 'leave', endurgency: 'urgency', endfield: 'field', endcfield: 'contact_field', endresults: 'call_result', enddays: 'max_days', endflow: 'other_flow' };

let journeyDealFields    = [];   // the workspace's deal fields: what "a deal field changes" and "a date is reached" choose from
let journeyContactFields = [];   // … and its contact fields

function resetJourneyStart() { journeyDealFields = []; journeyContactFields = []; }
// Read with the page (journey.js loadJourney): the fields may have changed in Settings since they were last read.
async function loadJourneyStart() {
  const [deal, contact] = await Promise.all([journeySend(() => api.get('/api/deal-fields')), journeySend(() => api.get('/api/fields'))]);
  journeyDealFields    = Array.isArray(deal) ? deal : [];
  journeyContactFields = Array.isArray(contact) ? contact : [];
}

const journeyStartUses = trigger => (Object.hasOwn(JOURNEY_TRIGGERS, trigger) ? JOURNEY_TRIGGERS[trigger].uses : []);
// The fields a start chooses from: contact fields, the deal fields that hold a date, or every deal field.
function journeyStartFields(trigger) {
  if (trigger === 'contact_field') return journeyContactFields;
  return trigger === 'date_field' ? journeyDealFields.filter(f => f.type === 'date') : journeyDealFields;
}
const journeyStartHours = n => (Number(n) === 1 ? t('jt_l_hours_one') : tf('jt_l_hours', { n }));
const journeyStartDays = n => (Number(n) === 1 ? t('jt_l_days_one') : tf('jt_l_days', { n }));

// What a start box says, as lines: what starts the workflow, with what it was set to, the pipeline it is limited to
// and where it stops. Pure apart from t()/tf(), the language and the names the page knows.
function journeyStartLines(node) {
  const c = (node && node.config) || {}, lines = [], uses = journeyStartUses(c.trigger), has = f => uses.includes(f);
  if (!c.trigger) lines.push(t(journeyManage ? 'jt_start_empty' : 'jt_start_none'));
  else lines.push(Object.hasOwn(JOURNEY_TRIGGERS, c.trigger) ? t(JOURNEY_TRIGGERS[c.trigger].title) : String(c.trigger));   // a start a newer server knows: its own word
  if (has('webhook_ids')) {
    if (!Array.isArray(c.webhook_ids)) lines.push(t('jt_l_webhooks_all'));
    else {
      const names = c.webhook_ids.map(id => journeyWebhooks.find(w => w.id === id)).filter(Boolean).map(w => w.name);
      lines.push(names.length ? tf('jt_l_webhooks', { names: names.join(', ') }) : t('jt_l_webhooks_gone'));
    }
  }
  if (has('stage_id')) lines.push(tf('jt_l_stage', { stage: journeyStageName(c.stage_id) || t('jt_l_stage_gone') }));
  if (has('min_urgency') && JOURNEY_URGENCY_KEYS[c.min_urgency]) lines.push(tf('jt_l_urgency', { level: t(JOURNEY_URGENCY_KEYS[c.min_urgency]) }));
  if (has('field_key')) {
    const field = journeyStartFields(c.trigger).find(f => f.field_key === c.field_key);
    lines.push(tf('jt_l_field', { name: field ? field.name : t('jt_l_field_gone') }));
  }
  if (has('value') && c.value) lines.push(tf('jt_l_value', { value: c.value }));
  if (has('doc_type') && JOURNEY_DOC_KEYS[c.doc_type]) lines.push(tf('jt_l_doc', { type: t(JOURNEY_DOC_KEYS[c.doc_type]) }));
  if (has('result') && JOURNEY_RESULT_KEYS[c.result]) lines.push(tf('jt_l_result', { result: t(JOURNEY_RESULT_KEYS[c.result]) }));
  if (has('hours')) lines.push(journeyStartHours(c.hours));
  if (has('days')) lines.push(journeyStartDays(c.days));
  if (has('offset_days')) {
    const off = Number(c.offset_days) || 0;
    lines.push(off === 0 ? tf('jt_l_date_on', { at: c.at }) : tf(off < 0 ? 'jt_l_date_before' : 'jt_l_date_after', { n: Math.abs(off), at: c.at }));
  }
  if (has('weekdays')) lines.push(tf('jt_l_schedule', { days: (Array.isArray(c.weekdays) ? c.weekdays : []).filter(d => JOURNEY_DAY_KEYS[d]).map(d => t(JOURNEY_DAY_KEYS[d])).join(', '), at: c.at }));
  if (has('flow_id')) {
    const other = journeyFlows.find(f => f.id === c.flow_id);
    lines.push(tf('jt_l_flow', { name: other ? other.name : t('jt_l_flow_gone') }));
  }
  if (c.pipeline_id) {
    const p = journeyPipelines().find(x => x.id === c.pipeline_id);
    if (p) lines.push(tf('jt_l_pipeline', { name: p.name }));
  }
  // where it ends: the stages it stops in, the stages it is meant for, and every other rule that is set — each said
  // with what it was set to, all of them in one line (the box is a summary; a rule this page does not know is left out)
  const names = ids => ids.map(id => journeyStageName(id) || t('jt_l_stage_gone')).join(', ');
  const stops = Array.isArray(c.stop_stage_ids) ? c.stop_stage_ids : [], stays = Array.isArray(c.stay_stage_ids) ? c.stay_stage_ids : [];
  if (stops.length) lines.push(tf('jt_l_stops', { stages: names(stops) }));
  if (stays.length) lines.push(tf('jt_l_stays', { stages: names(stays) }));
  const set = c.stop_set && typeof c.stop_set === 'object' ? c.stop_set : {}, of = k => (set[k] && typeof set[k] === 'object' ? set[k] : {});
  const fieldSaid = (k, list) => { const f = list.find(x => x.field_key === of(k).field_key); return `${t(JOURNEY_STOP_ON_KEYS[k])} (${f ? f.name : t('jt_l_field_gone')}${of(k).value ? `: ${of(k).value}` : ''})`; };
  const said = Object.keys(JOURNEY_STOP_ON_KEYS).filter(k => Array.isArray(c.stop_on) && c.stop_on.includes(k)).map(k => {   // in the list's order, as the window has them
    if (k === 'urgency') return Object.hasOwn(JOURNEY_URGENCY_KEYS, of(k).min_urgency) ? tf('jt_ol_urgency', { level: t(JOURNEY_URGENCY_KEYS[of(k).min_urgency]) }) : t(JOURNEY_STOP_ON_KEYS[k]);
    if (k === 'field') return fieldSaid(k, journeyDealFields);
    if (k === 'contact_field') return fieldSaid(k, journeyContactFields);
    if (k === 'document') return t(JOURNEY_STOP_ON_KEYS[k]) + (Object.hasOwn(JOURNEY_DOC_KEYS, of(k).doc_type) ? ` (${t(JOURNEY_DOC_KEYS[of(k).doc_type])})` : '');
    if (k === 'call_result') { const res = (Array.isArray(of(k).results) ? of(k).results : []).filter(r => Object.hasOwn(JOURNEY_RESULT_KEYS, r)).map(r => t(JOURNEY_RESULT_KEYS[r])); return res.length ? tf('jt_ol_call_result', { results: res.join(', ') }) : t(JOURNEY_STOP_ON_KEYS[k]); }
    if (k === 'max_days') return Number.isInteger(of(k).days) && of(k).days > 0 ? tf('jt_ol_max_days', { days: journeyStartDays(of(k).days) }) : t(JOURNEY_STOP_ON_KEYS[k]);
    if (k === 'other_flow') { const other = journeyFlows.find(f => f.id === of(k).flow_id); return `${t(JOURNEY_STOP_ON_KEYS[k])} (${other ? other.name : t('jt_l_flow_gone')})`; }
    return t(JOURNEY_STOP_ON_KEYS[k]);
  });
  if (said.length) lines.push(tf('jt_l_stop_on', { what: said.join('; ') }));
  return lines;
}

// The chooser: the categories as tabs, and the starts of the open one as cards, each with what it means.
function journeyStartChooserHtml(cat, trigger) {
  const tabs = JOURNEY_CATEGORIES.map(c => `<button type="button" role="tab" class="jt-cat" data-jt-cat="${c}" aria-selected="${c === cat}">${icon(JOURNEY_CAT_ICONS[c])}<span>${esc(t(JOURNEY_CAT_KEYS[c]))}</span></button>`).join('');
  const cards = Object.keys(JOURNEY_TRIGGERS).filter(k => JOURNEY_TRIGGERS[k].cat === cat).map(k =>
    `<button type="button" role="radio" class="jt-trig" data-jt-trig="${k}" aria-checked="${k === trigger}"><b>${esc(t(JOURNEY_TRIGGERS[k].title))}</b><span>${esc(t(JOURNEY_TRIGGERS[k].hint))}</span></button>`).join('');
  return `<div class="jt-cats" role="tablist" aria-label="${esc(t('jt_cats_aria'))}">${tabs}</div><div class="jt-trigs" role="radiogroup" aria-label="${esc(t('jt_trigs_aria'))}">${cards}</div>`;
}
// The fields a start can choose, as the options of a list.
function journeyStartFieldOptions(trigger, chosen) {
  return journeyOption('', t('jt_opt_choose'), chosen) + journeyStartFields(trigger).map(f => journeyOption(f.field_key, f.name, chosen)).join('');
}

// A saved start as the window's values, every one as the form holds it (text).
function journeyStartState(config) {
  const c = config || {}, known = Object.hasOwn(JOURNEY_TRIGGERS, c.trigger), off = Number(c.offset_days) || 0;
  const stop = Array.isArray(c.stop_stage_ids) ? c.stop_stage_ids : [], stay = Array.isArray(c.stay_stage_ids) ? c.stay_stage_ids : [];
  const set = c.stop_set && typeof c.stop_set === 'object' ? c.stop_set : {}, of = k => (set[k] && typeof set[k] === 'object' ? set[k] : {});
  return {
    trigger: known ? c.trigger : '',
    from: Array.isArray(c.webhook_ids) ? 'some' : 'all', webhooks: Array.isArray(c.webhook_ids) ? [...c.webhook_ids].sort((a, b) => a - b) : [],
    stage: String(c.stage_id || ''), urgency: String(c.min_urgency || ''), field: String(c.field_key || ''), value: String(c.value || ''), doc: String(c.doc_type || ''), result: String(c.result || ''),
    hours: String(c.hours || ''), days: String(c.days || ''), when: off < 0 ? 'before' : off > 0 ? 'after' : 'on', offset: off ? String(Math.abs(off)) : '', at: String(c.at || '09:00'),
    weekdays: Array.isArray(c.weekdays) ? [...c.weekdays].sort((a, b) => a - b) : [], flow: String(c.flow_id || ''), pipeline: String(c.pipeline_id || ''),
    // where it ends: the rules that are ticked, in the list's order (a stage rule is ticked when the start names such
    // stages), the stages under each stage rule, and what the other rules were set to — each under the id its field has
    ends: [...(stop.length ? ['arrive'] : []), ...(stay.length ? ['leave'] : []), ...Object.keys(JOURNEY_STOP_ON_KEYS).filter(k => Array.isArray(c.stop_on) && c.stop_on.includes(k))],
    arrive: [...stop].sort((a, b) => a - b), leave: [...stay].sort((a, b) => a - b),
    endurgency: String(of('urgency').min_urgency || ''), endfield: String(of('field').field_key || ''), endvalue: String(of('field').value || ''),
    endcfield: String(of('contact_field').field_key || ''), endcvalue: String(of('contact_field').value || ''), enddoc: String(of('document').doc_type || ''),
    endresults: Object.keys(JOURNEY_RESULT_KEYS).filter(r => Array.isArray(of('call_result').results) && of('call_result').results.includes(r)),
    enddays: String(of('max_days').days || ''), endflow: String(of('other_flow').flow_id || ''),
  };
}
// A saved start as the window can show it. What it names and is gone since — a lead webhook, a stage, a field, a
// pipeline, another workflow, under the start or under one of its end rules — is not in the window's lists, so it is
// not in what the window opens with either: a window nobody touched must not ask about unsaved changes. flowId: the
// workflow the start belongs to.
function journeyStartShown(start, flowId) {
  const stageIds = journeyPipelines().flatMap(p => (Array.isArray(p.stages) ? p.stages : []).map(s => s.id));
  const otherFlow = id => journeyFlows.some(f => String(f.id) === id && f.id !== flowId);
  return { ...start,
    webhooks: start.webhooks.filter(id => journeyWebhooks.some(w => w.id === id)),
    stage: stageIds.some(id => String(id) === start.stage) ? start.stage : '',
    field: journeyStartFields(start.trigger).some(f => f.field_key === start.field) ? start.field : '',
    flow: otherFlow(start.flow) ? start.flow : '',
    pipeline: journeyPipelines().some(p => String(p.id) === start.pipeline) ? start.pipeline : '',
    arrive: start.arrive.filter(id => stageIds.includes(id)), leave: start.leave.filter(id => stageIds.includes(id)),
    endurgency: Object.hasOwn(JOURNEY_URGENCY_KEYS, start.endurgency) ? start.endurgency : '',
    endfield: journeyDealFields.some(f => f.field_key === start.endfield) ? start.endfield : '',
    endcfield: journeyContactFields.some(f => f.field_key === start.endcfield) ? start.endcfield : '',
    enddoc: Object.hasOwn(JOURNEY_DOC_KEYS, start.enddoc) ? start.enddoc : '',
    endflow: otherFlow(start.endflow) ? start.endflow : '' };
}
// The window's values as the start that is saved: { config }, or { error, part } — the sentence to say and the
// field to put the cursor in. Only what the chosen start uses is sent.
function journeyStartConfig(now) {
  if (!Object.hasOwn(JOURNEY_TRIGGERS, now.trigger)) return { error: 'jt_err_choose', part: 'chooser' };
  const uses = journeyStartUses(now.trigger), has = f => uses.includes(f), whole = (v, max) => (/^\d{1,4}$/.test(String(v)) && Number(v) >= 1 && Number(v) <= max ? Number(v) : null);
  const ends = k => now.ends.includes(k);   // a rule that is ticked; what stands under one that is not is left behind
  const config = { trigger: now.trigger, stop_stage_ids: ends('arrive') ? now.arrive : [] };
  if (ends('leave')) config.stay_stage_ids = now.leave;
  if (now.pipeline) config.pipeline_id = Number(now.pipeline);
  if (has('webhook_ids')) {
    if (now.from === 'some' && !now.webhooks.length) return { error: 'jt_err_pick_webhook', part: 'from' };
    config.webhook_ids = now.from === 'some' ? now.webhooks : null;
  }
  if (has('stage_id')) { if (!now.stage) return { error: 'jt_err_stage', part: 'stage' }; config.stage_id = Number(now.stage); }
  if (has('min_urgency') && now.urgency) config.min_urgency = Number(now.urgency);
  if (has('field_key')) { if (!now.field) return { error: 'jt_err_field', part: 'field' }; config.field_key = now.field; }
  if (has('value') && now.value) config.value = now.value;
  if (has('doc_type') && now.doc) config.doc_type = now.doc;
  if (has('result')) { if (!now.result) return { error: 'jt_err_result', part: 'result' }; config.result = now.result; }
  if (has('hours')) { const n = whole(now.hours, JOURNEY_START_MAX.hours); if (!n) return { error: 'jt_err_hours', part: 'hours' }; config.hours = n; }
  if (has('days')) { const n = whole(now.days, JOURNEY_START_MAX.days); if (!n) return { error: 'jt_err_days', part: 'days' }; config.days = n; }
  if (has('offset_days')) {
    const n = now.when === 'on' ? 0 : whole(now.offset, JOURNEY_START_MAX.days);
    if (n === null) return { error: 'jt_err_days', part: 'offset' };
    config.offset_days = now.when === 'before' ? -n : n;
  }
  if (has('weekdays')) { if (!now.weekdays.length) return { error: 'jt_err_weekdays', part: 'weekdays' }; config.weekdays = now.weekdays; }
  if (has('at')) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(now.at)) return { error: 'jt_err_at', part: 'at' }; config.at = now.at; }
  if (has('flow_id')) { if (!now.flow) return { error: 'jt_err_flow', part: 'flow' }; config.flow_id = Number(now.flow); }
  // where it ends, in the order of the window: a ticked rule needs what stands under it
  for (const rule of Object.keys(JOURNEY_STAGE_RULES)) {
    if (ends(rule) && !now[rule].length) return { error: 'jt_err_stop_stages', part: 'end' + rule };
    if (ends(rule) && now[rule].length > JOURNEY_STOP_MAX) return { error: 'jt_err_stop_many', part: 'end' + rule };
  }
  const set = {};
  if (ends('urgency')) { if (!Object.hasOwn(JOURNEY_URGENCY_KEYS, now.endurgency)) return { error: 'jt_err_level', part: 'endurgency' }; set.urgency = { min_urgency: Number(now.endurgency) }; }
  if (ends('field')) { if (!now.endfield) return { error: 'jt_err_field', part: 'endfield' }; set.field = now.endvalue ? { field_key: now.endfield, value: now.endvalue } : { field_key: now.endfield }; }
  if (ends('contact_field')) { if (!now.endcfield) return { error: 'jt_err_field', part: 'endcfield' }; set.contact_field = now.endcvalue ? { field_key: now.endcfield, value: now.endcvalue } : { field_key: now.endcfield }; }
  if (ends('document') && now.enddoc) set.document = { doc_type: now.enddoc };   // no kind: any document, and nothing to keep
  if (ends('call_result')) { if (!now.endresults.length) return { error: 'jt_err_results', part: 'endresults' }; set.call_result = { results: now.endresults }; }
  if (ends('max_days')) { const n = whole(now.enddays, JOURNEY_START_MAX.days); if (!n) return { error: 'jt_err_days', part: 'enddays' }; set.max_days = { days: n }; }
  if (ends('other_flow')) { if (!now.endflow) return { error: 'jt_err_flow', part: 'endflow' }; set.other_flow = { flow_id: Number(now.endflow) }; }
  const on = Object.keys(JOURNEY_STOP_ON_KEYS).filter(ends);
  if (on.length) config.stop_on = on;
  if (Object.keys(set).length) config.stop_set = set;
  return { config };
}

// ── where it ends, as the window shows it (Part 16) ─────────────────────────
// The heading a rule stands under, or null for what is no rule.
function journeyStopGroup(rule) {
  return Object.keys(JOURNEY_STOP_GROUPS).find(g => JOURNEY_STOP_GROUPS[g].includes(rule)) || null;
}
// What a rule that is switched on was set to, in a few words for the list on top — and whether it still lacks what it
// needs (`missing`: the list then says so; which sentence names what is missing is decided when the window is saved).
// now: the window's values. A rule without settings says nothing more than its name.
function journeyStopDetail(rule, now) {
  const stagesSaid = ids => ids.map(id => journeyStageName(id)).filter(Boolean).join(', ');
  const fieldSaid = (list, key, value) => { const f = list.find(x => x.field_key === key); return !f ? '' : value ? `${f.name}: ${value}` : tf('jt_es_field_any', { name: f.name }); };
  const days = /^\d{1,4}$/.test(String(now.enddays)) && Number(now.enddays) >= 1 && Number(now.enddays) <= JOURNEY_START_MAX.days ? Number(now.enddays) : 0;
  const said = {
    arrive: () => stagesSaid(now.arrive),
    leave: () => stagesSaid(now.leave),
    urgency: () => (Object.hasOwn(JOURNEY_URGENCY_KEYS, now.endurgency) ? tf('jt_es_level', { level: t(JOURNEY_URGENCY_KEYS[now.endurgency]) }) : ''),
    field: () => fieldSaid(journeyDealFields, now.endfield, now.endvalue),
    contact_field: () => fieldSaid(journeyContactFields, now.endcfield, now.endcvalue),
    document: () => t(Object.hasOwn(JOURNEY_DOC_KEYS, now.enddoc) ? JOURNEY_DOC_KEYS[now.enddoc] : 'jt_opt_doc_any'),   // no kind is a choice too: any document
    call_result: () => now.endresults.filter(r => Object.hasOwn(JOURNEY_RESULT_KEYS, r)).map(r => t(JOURNEY_RESULT_KEYS[r])).join(', '),
    max_days: () => (days ? journeyStartDays(days) : ''),
    other_flow: () => { const other = journeyFlows.find(f => String(f.id) === String(now.endflow)); return other ? other.name : ''; },
  };
  if (!Object.hasOwn(said, rule)) return { text: '', missing: false };
  const text = said[rule]();
  return { text, missing: !text };
}
// What is switched on, as the list on top: each rule a row — the icon of its heading, its name with what it was set
// to (or that it still needs a setting), and a cross that switches it off. The name is a way to the rule: it opens
// the rule's tab. Nothing on: a line that says what that means.
function journeyStopSummaryHtml(now) {
  const on = [...Object.keys(JOURNEY_STAGE_RULES), ...Object.keys(JOURNEY_STOP_ON_KEYS)].filter(k => now.ends.includes(k));
  if (!on.length) return `<p class="jt-now-none">${esc(t('jt_es_none'))}</p>`;
  return `<div class="jt-now-head"><span>${esc(t('jt_es_on'))}</span><span class="badge">${on.length}</span></div><ul class="jt-now-list">${on.map(k => {
    const d = journeyStopDetail(k, now), title = t(JOURNEY_STOP_TITLES[k]), off = tf('jt_es_off', { rule: title });
    return `<li class="jt-now-row"><span class="jt-now-ic">${icon(JOURNEY_STOP_ICONS[journeyStopGroup(k)])}</span>`
      + `<button type="button" class="jt-now-what" data-jt-goto="${k}" title="${esc(t('jt_es_goto'))}"><b>${esc(title)}</b>${d.missing ? `<span class="is-missing">${esc(t('jt_es_missing'))}</span>` : d.text ? `<span>${esc(d.text)}</span>` : ''}</button>`
      + `<button type="button" class="iconbtn jt-now-x" data-jt-off="${k}" aria-label="${esc(off)}" title="${esc(off)}">${icon('x')}</button></li>`;
  }).join('')}</ul>`;
}
// The headings as tabs, in the list's order, each with its icon and — where any of its rules is on — how many.
function journeyStopTabsHtml(open, ends) {
  return Object.keys(JOURNEY_STOP_GROUPS).map(g => {
    const n = JOURNEY_STOP_GROUPS[g].filter(k => ends.includes(k)).length;
    return `<button type="button" role="tab" class="jt-cat" data-jt-ecat="${g}" aria-selected="${g === open}">${icon(JOURNEY_STOP_ICONS[g])}<span>${esc(t(JOURNEY_STOP_HEADS[g]))}</span>${
      n ? `<span class="jt-cat-n" title="${esc(tf('jt_es_n', { n }))}">${n}</span>` : ''}</button>`;
  }).join('');
}
// Every rule as a card, the cards of each heading together (only those of the open heading are shown — the others
// are in the page all the same, hidden, so that what was set under them is kept and read). A card: the rule's name,
// a line that says what it means, a switch; and inside it what the rule needs, hidden while the rule is off. Stages
// and call results are chips to choose from. start: the window's values; fid: the form's id; others: the workflows
// another one can be chosen from; open: the heading that is shown.
function journeyStopHtml(start, fid, others, open) {
  const chip = (attr, value, label, on) => `<label class="jt-chip"><input type="checkbox" ${attr} value="${esc(value)}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  const stages = (rule, chosen) => `<div class="jt-chipsets" id="${fid}-end${rule}" tabindex="-1">${journeyPipelines().map(p => `<div class="jt-chipset"><span class="jt-chipset-name">${esc(p.name)}</span><div class="jt-chips">${
    (Array.isArray(p.stages) ? p.stages : []).map(st => chip(`data-jt-${rule}`, Number(st.id), st.name, chosen.includes(st.id))).join('')}</div></div>`).join('')}</div>`;
  const labelled = (id, label, inner, hint = '') => `<div class="jt-set"><label class="label" for="${fid}-${id}">${esc(t(label))}</label>${inner}${hint ? `<p class="help">${esc(t(hint))}</p>` : ''}</div>`;
  const fieldOf = (id, valueId, list, chosen, value) => `<div class="jt-pair">${
    labelled(id, 'jt_f_field', `<select class="select" id="${fid}-${id}">${journeyOption('', t('jt_opt_choose'), chosen)}${list.map(f => journeyOption(f.field_key, f.name, chosen)).join('')}</select>`, 'jt_e_field_hint')}${
    labelled(valueId, 'jt_e_value', `<input class="input" id="${fid}-${valueId}" maxlength="${JOURNEY_START_MAX.value}" autocomplete="off" value="${esc(value)}">`, 'jt_e_value_hint')}</div>`;
  const needs = {
    arrive: () => stages('arrive', start.arrive),
    leave: () => stages('leave', start.leave),
    urgency: () => labelled('endurgency', 'jt_e_level', `<select class="select" id="${fid}-endurgency">${journeyOption('', t('jt_opt_choose'), start.endurgency)}${Object.keys(JOURNEY_URGENCY_KEYS).map(n => journeyOption(n, t(JOURNEY_URGENCY_KEYS[n]), start.endurgency)).join('')}</select>`),
    field: () => fieldOf('endfield', 'endvalue', journeyDealFields, start.endfield, start.endvalue),
    contact_field: () => fieldOf('endcfield', 'endcvalue', journeyContactFields, start.endcfield, start.endcvalue),
    document: () => labelled('enddoc', 'jt_f_doc', `<select class="select" id="${fid}-enddoc">${journeyOption('', t('jt_opt_doc_any'), start.enddoc)}${Object.keys(JOURNEY_DOC_KEYS).map(k => journeyOption(k, t(JOURNEY_DOC_KEYS[k]), start.enddoc)).join('')}</select>`),
    call_result: () => `<div class="jt-set"><span class="label">${esc(t('jt_e_results'))}</span><div class="jt-chips" id="${fid}-endresults" tabindex="-1">${
      Object.keys(JOURNEY_RESULT_KEYS).map(r => chip('data-jt-res', r, t(JOURNEY_RESULT_KEYS[r]), start.endresults.includes(r))).join('')}</div></div>`,
    max_days: () => labelled('enddays', 'jt_f_days', `<input class="input jt-num" id="${fid}-enddays" type="number" min="1" max="${JOURNEY_START_MAX.days}" step="1" inputmode="numeric" value="${esc(start.enddays)}">`),
    other_flow: () => (others.length ? labelled('endflow', 'jt_f_flow', `<select class="select" id="${fid}-endflow">${journeyOption('', t('jt_opt_choose'), start.endflow)}${others.map(f => journeyOption(f.id, f.name, start.endflow)).join('')}</select>`)
      : `<input type="hidden" id="${fid}-endflow" value=""><p class="help">${esc(t('jt_no_flows'))}</p>`),
  };
  const card = k => {
    const on = start.ends.includes(k);
    return `<div class="jt-rule" id="${fid}-r-${k}"><label class="jt-rule-head"><span class="jt-rule-what"><b>${esc(t(JOURNEY_STOP_TITLES[k]))}</b><span>${esc(t(JOURNEY_STOP_HINTS[k]))}</span></span>`
      + `<input type="checkbox" class="switch" data-jt-end value="${k}"${on ? ' checked' : ''}></label>${needs[k] ? `<div class="jt-rule-set" id="${fid}-s-${k}"${on ? '' : ' hidden'}>${needs[k]()}</div>` : ''}</div>`;
  };
  return Object.keys(JOURNEY_STOP_GROUPS).map(g => `<div class="jt-rules" role="tabpanel" id="${fid}-g-${g}"${g === open ? '' : ' hidden'}>${JOURNEY_STOP_GROUPS[g].map(card).join('')}</div>`).join('');
}

// The start's window: what sets the workflow off — chosen by category — with that start's settings, one pipeline,
// and where it stops. While the workflow runs it is only read.
function openJourneyStart(node) {
  const flow = journeyFlow();
  if (!journeyManage || (flow && flow.active)) return journeyBoxView(node, journeyManage ? 'jr_start_locked' : 'jr_err_forbidden');
  const start = journeyStartShown(journeyStartState(node.config), flow ? flow.id : null);
  let cat = start.trigger ? JOURNEY_TRIGGERS[start.trigger].cat : JOURNEY_CATEGORIES[0];
  let ecat = journeyStopGroup(start.ends[0]) || Object.keys(JOURNEY_STOP_GROUPS)[0];   // the heading of end rules that is open: that of the first rule that is on
  const others = journeyFlows.filter(f => !flow || f.id !== flow.id);
  const field = (part, label, inner, hint = '') => `<div class="field" id="${part}"><label class="label" for="${part.replace('-w-', '-')}">${esc(t(label))}</label>${inner}${hint ? `<p class="help">${esc(t(hint))}</p>` : ''}</div>`;
  const checks = journeyWebhooks.length
    ? journeyWebhooks.map(w => `<label class="jr-check"><input type="checkbox" data-jr-wh value="${Number(w.id)}"${start.webhooks.includes(w.id) ? ' checked' : ''}><span>${esc(w.name)}</span></label>`).join('')
    : `<p class="help">${esc(t('jt_no_webhooks'))}</p>`;
  // What the window holds now, as its values (the start's own, and where it ends).
  const read = (el, root) => {
    const ticked = sel => [...root.querySelectorAll(sel)].filter(b => b.checked).map(b => String(b.value)), ids = sel => ticked(sel).map(Number).sort((a, b) => a - b);
    const rules = ticked('[data-jt-end]'), ends = [...Object.keys(JOURNEY_STAGE_RULES), ...Object.keys(JOURNEY_STOP_ON_KEYS)].filter(k => rules.includes(k));
    // what stands in the card of a rule that is off is not that rule's: it stays what the window opened with — neither a change nor sent
    const under = (rule, key, value) => (ends.includes(rule) ? value() : start[key]);
    const now = { trigger: el('trigger').value, from: el('from').value, webhooks: ids('[data-jr-wh]'),
      stage: el('stage').value, urgency: el('urgency').value, field: el('field').value, value: el('value').value.trim(), doc: el('doc').value, result: el('result').value,
      hours: el('hours').value.trim(), days: el('days').value.trim(), when: el('when').value, offset: el('when').value === 'on' ? '' : el('offset').value.trim(), at: el('at').value,
      weekdays: ids('[data-jt-day]'), flow: el('flow').value, pipeline: el('pipeline').value, ends,
      arrive: under('arrive', 'arrive', () => ids('[data-jt-arrive]')), leave: under('leave', 'leave', () => ids('[data-jt-leave]')),
      endurgency: under('urgency', 'endurgency', () => el('endurgency').value), endfield: under('field', 'endfield', () => el('endfield').value), endvalue: under('field', 'endvalue', () => el('endvalue').value.trim()),
      endcfield: under('contact_field', 'endcfield', () => el('endcfield').value), endcvalue: under('contact_field', 'endcvalue', () => el('endcvalue').value.trim()),
      enddoc: under('document', 'enddoc', () => el('enddoc').value),
      endresults: under('call_result', 'endresults', () => { const res = ticked('[data-jt-res]'); return Object.keys(JOURNEY_RESULT_KEYS).filter(r => res.includes(r)); }),
      enddays: under('max_days', 'enddays', () => el('enddays').value.trim()), endflow: under('other_flow', 'endflow', () => el('endflow').value) };
    return Object.fromEntries(Object.keys(start).map(k => [k, now[k]]));   // in the order the window opened with: the two are compared as they are written
  };
  const w = journeyWindow({ title: t('jt_title'), size: 'lg', start, read,
    body: fid => `<div class="field"><span class="label">${esc(t('jt_f_when'))}</span>
          <input type="hidden" id="${fid}-trigger" value="${esc(start.trigger)}">
          <div class="jt-chooser" id="${fid}-chooser" tabindex="-1">${journeyStartChooserHtml(cat, start.trigger)}</div></div>
        <p class="help" id="${fid}-w-none">${esc(t('jt_choose'))}</p>
        ${field(`${fid}-w-from`, 'jt_f_from', `<select class="select" id="${fid}-from">${journeyOption('all', t('jt_opt_from_all'), start.from)}${journeyOption('some', t('jt_opt_from_some'), start.from)}</select>
          <div class="jr-checks" id="${fid}-whs">${checks}</div>`)}
        ${field(`${fid}-w-stage`, 'jt_f_stage', `<select class="select" id="${fid}-stage"><option value="">${esc(t('jt_opt_choose'))}</option>${journeyStageOptions(start.stage)}</select>`)}
        ${field(`${fid}-w-urgency`, 'jt_f_urgency', `<select class="select" id="${fid}-urgency">${journeyOption('', t('jt_opt_urgency_any'), start.urgency)}${
          Object.keys(JOURNEY_URGENCY_KEYS).map(n => journeyOption(n, tf('jt_opt_urgency_min', { level: t(JOURNEY_URGENCY_KEYS[n]) }), start.urgency)).join('')}</select>`)}
        ${field(`${fid}-w-field`, 'jt_f_field', `<select class="select" id="${fid}-field">${journeyStartFieldOptions(start.trigger, start.field)}</select>`, 'jt_field_hint')}
        ${field(`${fid}-w-value`, 'jt_f_value', `<input class="input" id="${fid}-value" maxlength="${JOURNEY_START_MAX.value}" autocomplete="off" placeholder="${esc(t('jt_f_value_ph'))}" value="${esc(start.value)}">`, 'jt_f_value_hint')}
        ${field(`${fid}-w-doc`, 'jt_f_doc', `<select class="select" id="${fid}-doc">${journeyOption('', t('jt_opt_doc_any'), start.doc)}${Object.keys(JOURNEY_DOC_KEYS).map(k => journeyOption(k, t(JOURNEY_DOC_KEYS[k]), start.doc)).join('')}</select>`)}
        ${field(`${fid}-w-result`, 'jt_f_result', `<select class="select" id="${fid}-result">${journeyOption('', t('jt_opt_choose'), start.result)}${
          Object.keys(JOURNEY_RESULT_KEYS).map(k => journeyOption(k, t(JOURNEY_RESULT_KEYS[k]), start.result)).join('')}</select>`)}
        ${field(`${fid}-w-hours`, 'jt_f_hours', `<input class="input jt-num" id="${fid}-hours" type="number" min="1" max="${JOURNEY_START_MAX.hours}" step="1" inputmode="numeric" value="${esc(start.hours)}">`)}
        ${field(`${fid}-w-days`, 'jt_f_days', `<input class="input jt-num" id="${fid}-days" type="number" min="1" max="${JOURNEY_START_MAX.days}" step="1" inputmode="numeric" value="${esc(start.days)}">`)}
        ${field(`${fid}-w-when`, 'jt_f_date_when', `<div class="row jr-wait"><select class="select" id="${fid}-when">${journeyOption('on', t('jt_opt_on_day'), start.when)}${journeyOption('before', t('jt_opt_days_before'), start.when)}${
          journeyOption('after', t('jt_opt_days_after'), start.when)}</select>
          <input class="input" id="${fid}-offset" type="number" min="1" max="${JOURNEY_START_MAX.days}" step="1" inputmode="numeric" aria-label="${esc(t('jt_f_offset'))}" value="${esc(start.offset)}"></div>`)}
        ${field(`${fid}-w-weekdays`, 'jt_f_weekdays', `<div class="jt-days" id="${fid}-weekdays" tabindex="-1">${Object.keys(JOURNEY_DAY_KEYS).map(d =>
          `<label class="jr-check"><input type="checkbox" data-jt-day value="${d}"${start.weekdays.includes(Number(d)) ? ' checked' : ''}><span>${esc(t(JOURNEY_DAY_KEYS[d]))}</span></label>`).join('')}</div>`)}
        ${field(`${fid}-w-at`, 'jt_f_at', `<input class="input jt-num" id="${fid}-at" type="time" value="${esc(start.at)}">`, 'jt_at_hint')}
        ${field(`${fid}-w-flow`, 'jt_f_flow', others.length ? `<select class="select" id="${fid}-flow">${journeyOption('', t('jt_opt_choose'), start.flow)}${others.map(f => journeyOption(f.id, f.name, start.flow)).join('')}</select>`
          : `<input type="hidden" id="${fid}-flow" value=""><p class="help">${esc(t('jt_no_flows'))}</p>`)}
        ${field(`${fid}-w-pipeline`, 'jt_f_pipeline', `<select class="select" id="${fid}-pipeline">${journeyOption('', t('jt_opt_pipeline_all'), start.pipeline)}${journeyPipelines().map(p => journeyOption(p.id, p.name, start.pipeline)).join('')}</select>`)}
        <div class="field jt-endbox" id="${fid}-w-stop"><span class="label">${esc(t('jt_f_stop'))}</span>
          <p class="help">${esc(t('jt_f_stop_any'))}</p>
          <div class="jt-now" id="${fid}-endsum" tabindex="-1">${journeyStopSummaryHtml(start)}</div>
          <span class="jt-rules-head">${esc(t('jt_es_all'))}</span>
          <div class="jt-cats" role="tablist" aria-label="${esc(t('jt_es_tabs_aria'))}" id="${fid}-endtabs">${journeyStopTabsHtml(ecat, start.ends)}</div>
          ${journeyStopHtml(start, fid, others, ecat)}
          <p class="help">${esc(t('jt_f_stop_hint'))}</p></div>`,
    save: async (now, fail, done) => {
      const out = journeyStartConfig(now);
      if (out.error) {
        // what is missing may stand in the card of a rule on another tab: that tab is opened first, so the cursor can go there
        if (Object.hasOwn(JOURNEY_STOP_PARTS, out.part)) { ecat = journeyStopGroup(JOURNEY_STOP_PARTS[out.part]); syncEnds(); }
        return fail(t(out.error), out.part);
      }
      const res = await journeySend(() => api.put(`/api/journey/nodes/${node.id}`, { config: out.config }));
      if (done(res, 'jr_saved')) journeyApply(res.flow);
    } });
  // only what belongs to the chosen start is shown; the chooser is drawn again with the open category and the chosen card
  const sync = () => {
    const trigger = w.el('trigger').value, uses = journeyStartUses(trigger), show = (part, on) => { w.el(part).hidden = !on; };
    w.el('chooser').innerHTML = journeyStartChooserHtml(cat, trigger);
    show('w-none', !trigger);
    show('w-from', uses.includes('webhook_ids')); show('whs', w.el('from').value === 'some');
    show('w-stage', uses.includes('stage_id')); show('w-urgency', uses.includes('min_urgency')); show('w-field', uses.includes('field_key')); show('w-value', uses.includes('value'));
    show('w-doc', uses.includes('doc_type')); show('w-result', uses.includes('result')); show('w-hours', uses.includes('hours')); show('w-days', uses.includes('days'));
    show('w-when', uses.includes('offset_days')); show('offset', w.el('when').value !== 'on'); show('w-weekdays', uses.includes('weekdays')); show('w-at', uses.includes('at'));
    show('w-flow', uses.includes('flow_id')); show('w-pipeline', !!trigger); show('w-stop', !!trigger);
    syncEnds();
  };
  // Where it ends, drawn from what the window holds now: the list of what is on, the tabs with their counts, the open
  // tab's cards and no other, and inside a card what its rule needs — only while that rule is on.
  const syncEnds = () => {
    const now = read(w.el, w.m.el), show = (part, on) => { w.el(part).hidden = !on; };
    w.el('endsum').innerHTML = journeyStopSummaryHtml(now);
    w.el('endtabs').innerHTML = journeyStopTabsHtml(ecat, now.ends);
    for (const g of Object.keys(JOURNEY_STOP_GROUPS)) show('g-' + g, g === ecat);
    for (const rule of [...Object.keys(JOURNEY_STAGE_RULES), ...Object.keys(JOURNEY_STOP_USES)]) show('s-' + rule, now.ends.includes(rule));
  };
  // The keyboard's place after a part of the panel was drawn again: on what `sel` finds, where there is such a thing.
  const focusOn = sel => { const el = w.m.el.querySelector(sel); if (el && typeof el.focus === 'function') el.focus(); };
  on(w.m.el, 'click', '[data-jt-cat]', (e, btn) => { cat = JOURNEY_CATEGORIES.includes(btn.dataset.jtCat) ? btn.dataset.jtCat : cat; sync(); });
  on(w.m.el, 'click', '[data-jt-trig]', (e, btn) => {
    const next = Object.hasOwn(JOURNEY_TRIGGERS, btn.dataset.jtTrig) ? btn.dataset.jtTrig : '';
    if (!next || next === w.el('trigger').value) return;
    const field = w.el('field');
    field.innerHTML = journeyStartFieldOptions(next, '');   // another start chooses from other fields
    field.value = '';
    w.el('trigger').value = next;
    w.el('err').hidden = true;
    sync();
  });
  on(w.m.el, 'change', 'select', sync);
  // where it ends: a tab shows its rules; a switch turns its rule on or off; what is chosen or typed in a card is said
  // in the list on top at once; a row of that list leads to its rule, and its cross switches the rule off
  on(w.m.el, 'click', '[data-jt-ecat]', (e, btn) => {
    if (!Object.hasOwn(JOURNEY_STOP_GROUPS, btn.dataset.jtEcat)) return;
    ecat = btn.dataset.jtEcat;
    syncEnds();
    focusOn(`[data-jt-ecat="${ecat}"]`);   // the tabs were drawn again: the keyboard stays on the one that was pressed
  });
  on(w.m.el, 'change', '[data-jt-end]', () => { w.el('err').hidden = true; syncEnds(); });
  on(w.m.el, 'input', '.jt-rule-set input', syncEnds);
  on(w.m.el, 'click', '[data-jt-goto]', (e, btn) => {
    const rule = btn.dataset.jtGoto, group = journeyStopGroup(rule);
    if (!group) return;
    ecat = group;
    syncEnds();
    focusOn(`[data-jt-end][value="${rule}"]`);
  });
  on(w.m.el, 'click', '[data-jt-off]', (e, btn) => {
    for (const b of w.m.el.querySelectorAll('[data-jt-end]')) if (String(b.value) === btn.dataset.jtOff) b.checked = false;
    w.el('err').hidden = true;
    syncEnds();
    if (typeof w.el('endsum').focus === 'function') w.el('endsum').focus();   // its row is gone: the keyboard stays in the list
  });
  sync();
  return w.m;
}
