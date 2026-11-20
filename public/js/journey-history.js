/* ═══════════════════════════════════════════════════════════════════════════
   THE RECORD OF WHAT THE WORKFLOWS DID — where it is read
   (CUSTOMER_JOURNEY_CHANGES Part 15, 2026-11-20; loaded after journey.js;
   the server writes the record and answers GET /api/journey/history).

   Everything a workflow does is written down and stays — also when the
   workflow or the deal is deleted later:

     step      a step did its thing: done, skipped or failed, and why
     retry     a step will be tried again, and why — or an email waits,
               held back by a sending limit of the address or a pause
     entered   a deal was taken in: by the start (which one), by a person, or
               put in again by a person
     ended     the workflow is over for a deal: it ran to its end, or it was
               stopped — and by which of the start's end rules
     moved     a deal that waited at a step which was deleted was put on
     flow      something was done to the workflow itself, and by whom:
               created, renamed, switched on or off, deleted, a step added,
               changed or deleted, a line or the start changed

   ONE LIST, THREE WAYS IN (openJourneyHistory)
     · the "Activity" window of a workflow (journey.js): under what waits
       now, everything that happened in that workflow
     · "History" at the top of the workflows page: the whole workspace, every
       workflow — also those that are deleted, whose name stays
     · "Workflow history" in a deal's menu (detail-views.js): everything the
       workflows did with that deal
   Where the list spans workflows each entry names its workflow.

   An entry is one line in plain words with its time ("Wohnung 3 — Email:
   Welcome — done, erika@example.de"; "Olga switched the workflow on"). The
   list is newest first, fifty at a time ("Load more"), can be narrowed to
   steps, to deals entering and leaving, or to changes of a workflow, and
   searched by a deal's, a step's or a workflow's name.

   What a person typed — a deal's title, a step's title, a workflow's name, a
   person's name — is text here, never markup.

   FUNCTION MAP  openJourneyHistory, openJourneyDealHistory,
                 journeyHistoryButtonHtml;
                 pure: journeyHistoryUrl, journeyHistoryText,
                 journeyHistoryRowHtml, journeyHistoryListHtml,
                 journeyHistoryGroupsHtml
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_HISTORY_PAGE = 50;   // entries asked for at a time (the server gives 200 at most)
const JOURNEY_HISTORY_SEARCH = 100;   // how long a search may be
// What the list can be narrowed to (the server's `group`; '' is everything), each with its word.
const JOURNEY_HISTORY_GROUPS = { '': 'jh_g_all', steps: 'jh_g_steps', deals: 'jh_g_deals', flow: 'jh_g_flow' };
// How a step came out.
const JOURNEY_HISTORY_STATUS = { done: 'jh_s_done', skipped: 'jh_s_skipped', failed: 'jh_s_failed' };
// Why a workflow ended for a deal: the engine's reason words (journey_runs.reason), each as a sentence.
const JOURNEY_HISTORY_REASONS = { stop_stage: 'jh_r_stop_stage', left_stages: 'jh_r_left_stages', meeting_booked: 'jh_r_meeting_booked', call_answered: 'jh_r_call_answered', opted_out: 'jh_r_opted_out',
  deal_assigned: 'jh_r_deal_assigned', urgency_reached: 'jh_r_urgency_reached', field_set: 'jh_r_field_set', contact_field_set: 'jh_r_contact_field_set', document_added: 'jh_r_document_added',
  onboarding_done: 'jh_r_onboarding_done', call_result: 'jh_r_call_result', call_inbound: 'jh_r_call_inbound', meeting_cancelled: 'jh_r_meeting_cancelled', task_done: 'jh_r_task_done',
  max_days: 'jh_r_max_days', other_flow: 'jh_r_other_flow' };
// Why an email was held back at its step without being tried: a sending limit of the address, or a pause (the
// engine's words in a 'retry' entry; journey-mail.js, Part 17). Such an entry says "waits", not "will be tried again".
const JOURNEY_HISTORY_WAITS = ['limit_day', 'limit_hour', 'limit_person', 'paused'];
// What was done to a workflow itself: what follows the person's name.
const JOURNEY_HISTORY_CHANGES = { created: 'jh_c_created', renamed: 'jh_c_renamed', switched_on: 'jh_c_switched_on', switched_off: 'jh_c_switched_off', deleted: 'jh_c_deleted',
  step_added: 'jh_c_step_added', step_changed: 'jh_c_step_changed', step_deleted: 'jh_c_step_deleted', line_changed: 'jh_c_line_changed', start_changed: 'jh_c_start_changed' };

// The address the list is asked at: only what is set is sent, in one order.
function journeyHistoryUrl({ flowId = null, dealId = null, group = '', q = '', before = null, limit = JOURNEY_HISTORY_PAGE } = {}) {
  const p = new URLSearchParams(), text = String(q || '').trim().slice(0, JOURNEY_HISTORY_SEARCH);
  if (flowId) p.set('flow_id', String(Number(flowId)));
  if (dealId) p.set('deal_id', String(Number(dealId)));
  if (group && Object.hasOwn(JOURNEY_HISTORY_GROUPS, group)) p.set('group', group);
  if (text) p.set('q', text);
  if (before) p.set('before', String(Number(before)));
  p.set('limit', String(limit));
  return `/api/journey/history?${p}`;
}

// One entry in plain words: { who, text, bad, person } — who it is about (a deal; for a change to a workflow the
// person who made it: `person`), what happened, and whether it went wrong. Pure apart from t()/tf() and the language.
function journeyHistoryText(entry) {
  const e = entry || {}, d = String(e.detail || ''), deal = String(e.deal_title || '') || t('jh_deal_none');
  const quoted = text => tf('jh_quoted', { text }), join = (a, b) => [a, b].filter(Boolean).join(' — ');
  // a step as a change names it: its title in quotes with its kind, or its kind alone where it has no title
  const stepName = () => { const kind = journeyStepText({ kind: e.kind }); return e.title ? `${quoted(e.title)}${kind ? ` (${kind})` : ''}` : kind ? quoted(kind) : ''; };
  if (e.event === 'step' || e.event === 'retry') {
    const step = journeyStepText(e), why = journeyDetailText(e.detail);
    if (e.event === 'retry') return { who: deal, text: join(step, JOURNEY_HISTORY_WAITS.includes(d) ? tf('jh_l_waits', { why }) : why ? tf('jh_l_retry', { why }) : t('jh_l_retry_plain')), bad: false, person: false };
    const status = Object.hasOwn(JOURNEY_HISTORY_STATUS, e.status) ? t(JOURNEY_HISTORY_STATUS[e.status]) : String(e.status || '');
    // a step that went well and says what it did ("call planned", "answer: no") needs no "done" before that
    const result = e.status === 'done' && Object.hasOwn(JOURNEY_DETAILS, d) ? why : [status, why].filter(Boolean).join(', ');
    return { who: deal, text: join(step, result), bad: e.status === 'failed', person: false };
  }
  if (e.event === 'entered') {
    const text = d === 'manual' ? (e.actor_name ? tf('jh_l_manual_by', { name: e.actor_name }) : t('jh_l_manual'))
      : d === 'restart' ? (e.actor_name ? tf('jh_l_restart_by', { name: e.actor_name }) : t('jh_l_restart'))
      : Object.hasOwn(JOURNEY_TRIGGERS, d) ? tf('jh_l_entered', { start: t(JOURNEY_TRIGGERS[d].title) }) : t('jh_l_entered_plain');   // a start a newer server knows: taken in, nothing guessed
    return { who: deal, text, bad: false, person: false };
  }
  if (e.event === 'ended') {
    const text = e.status === 'done' ? t('jh_l_finished')
      : Object.hasOwn(JOURNEY_HISTORY_REASONS, d) ? tf('jh_l_ended', { why: t(JOURNEY_HISTORY_REASONS[d]) }) : d ? tf('jh_l_ended', { why: d }) : t('jh_l_ended_plain');
    return { who: deal, text, bad: false, person: false };
  }
  if (e.event === 'moved') return { who: deal, text: e.title || e.kind ? tf('jh_l_moved', { step: stepName() }) : t('jh_l_moved_plain'), bad: false, person: false };
  if (e.event === 'flow') {
    const key = Object.hasOwn(JOURNEY_HISTORY_CHANGES, d) ? JOURNEY_HISTORY_CHANGES[d] : 'jh_c_unknown';
    const text = d === 'renamed' ? (e.title ? tf('jh_c_renamed', { name: quoted(e.title) }) : t('jh_c_renamed_plain'))
      : d === 'step_added' || d === 'step_changed' || d === 'step_deleted' ? tf(key, { step: stepName() }).replace(/\s+/g, ' ').trim() : t(key);
    return { who: String(e.actor_name || '') || t('jh_someone'), text, bad: false, person: true };
  }
  return { who: deal, text: [String(e.event || ''), d].filter(Boolean).join(': '), bad: false, person: false };   // a kind of entry a newer server writes: shown as it is
}

// One entry as a row: its time, the line, and — where the list spans workflows (`wide`) — its workflow, whose name
// stays when it is deleted.
function journeyHistoryRowHtml(entry, wide) {
  const e = entry || {}, line = journeyHistoryText(e), name = String(e.flow_name || '') || t('jh_flow_none');
  return `<li class="jh-row${line.bad ? ' bad' : ''}"><span class="jh-when">${esc(journeyWhen(e.created_at))}</span><span class="jh-what"><b>${esc(line.who)}</b>${line.person ? ' ' : ' — '}${esc(line.text)}</span>${
    wide ? `<span class="jh-flow">${esc(e.flow_id ? name : tf('jh_flow_gone', { name }))}</span>` : ''}</li>`;
}
function journeyHistoryListHtml(entries, wide) {
  return (Array.isArray(entries) ? entries : []).map(e => journeyHistoryRowHtml(e, wide)).join('');
}
// What the list can be narrowed to, as buttons; `chosen` is the one that is pressed.
function journeyHistoryGroupsHtml(chosen) {
  return Object.keys(JOURNEY_HISTORY_GROUPS).map(g =>
    `<button type="button" class="chip${g === chosen ? ' on' : ''}" data-jh-group="${g}" aria-pressed="${g === chosen}">${esc(t(JOURNEY_HISTORY_GROUPS[g]))}</button>`).join('');
}
// The button at the top of the workflows page: the record of the whole workspace, for everyone.
function journeyHistoryButtonHtml() {
  return `<button type="button" class="btn btn-ghost btn-sm" onclick="openJourneyHistory()">${icon('list')}<span>${esc(t('jh_button'))}</span></button>`;
}

// The record in a window. flowId: one workflow's; dealId: one deal's; neither: the whole workspace. head: what
// stands above the list (the "Activity" window puts there what waits now). The list is asked for when the window
// opens, again whenever it is narrowed or searched, and added to by "Load more".
function openJourneyHistory({ flowId = null, dealId = null, title = '', head = '' } = {}) {
  const id = 'jh-' + uid(), wide = !flowId, state = { group: '', q: '', entries: [], more: false, asked: 0, timer: 0 };
  const m = ui.modal({ title: title || t('jh_title_all'), size: 'lg',
    body: `${head}<div class="jh">
        ${head ? `<h3 class="jr-act-head">${esc(t('jh_head'))}</h3>` : ''}
        <div class="jh-bar">
          <div class="jh-groups" role="group" aria-label="${esc(t('jh_filter_aria'))}">${journeyHistoryGroupsHtml('')}</div>
          <input class="input jh-q" id="${id}-q" type="search" maxlength="${JOURNEY_HISTORY_SEARCH}" autocomplete="off" placeholder="${esc(t('jh_search_ph'))}" aria-label="${esc(t('jh_search_ph'))}" data-jh-q>
        </div>
        <ul class="jh-list${wide ? ' wide' : ''}" id="${id}-list" hidden></ul>
        <p class="jh-note" id="${id}-note" role="status">${esc(t('jh_loading'))}</p>
        <button type="button" class="btn btn-secondary btn-sm jh-more" id="${id}-more" data-jh-more hidden>${esc(t('jh_more'))}</button>
        <p class="help">${esc(t('jh_hint'))}</p>
      </div>`,
    footer: `<button class="btn btn-secondary" data-close autofocus>${esc(t('btn_close'))}</button>` });
  const el = part => m.el.querySelector(`#${id}-${part}`);
  const draw = (note, bad) => {
    const list = el('list'), line = el('note');
    list.innerHTML = journeyHistoryListHtml(state.entries, wide); list.hidden = !state.entries.length;
    line.textContent = note; line.hidden = !note; if (line.classList) line.classList.toggle('bad', !!bad);
    el('more').hidden = !state.more;
  };
  // fresh: a new question (the window opened, the list was narrowed or searched); else the next entries behind the last
  const load = async fresh => {
    const asked = ++state.asked, last = !fresh && state.entries.length ? state.entries[state.entries.length - 1].id : null;
    el('more').disabled = true;
    const res = await journeySend(() => api.get(journeyHistoryUrl({ flowId, dealId, group: state.group, q: state.q, before: last })));
    if (asked !== state.asked || m.el.isConnected === false) return;   // something newer was asked meanwhile, or the window is closed
    el('more').disabled = false;
    if (!res || res.error || !Array.isArray(res.entries)) {
      if (fresh) { state.entries = []; state.more = false; }   // what was there answered another question; "Load more" stays to try again
      return draw(journeyErrorText(res), true);   // the route's refusal in words (a search it cannot answer has its own sentence), or that it did not arrive
    }
    state.entries = fresh ? res.entries : state.entries.concat(res.entries);
    state.more = !!res.more;
    draw(state.entries.length ? '' : t(state.group || state.q ? 'jh_empty_filter' : 'jh_empty'), false);
  };
  on(m.el, 'click', '[data-jh-group]', (e, btn) => {
    const group = btn.dataset.jhGroup || '';
    if (!Object.hasOwn(JOURNEY_HISTORY_GROUPS, group) || group === state.group) return;
    state.group = group;
    for (const b of m.el.querySelectorAll('[data-jh-group]')) { const here = (b.dataset.jhGroup || '') === group; b.classList.toggle('on', here); b.setAttribute('aria-pressed', String(here)); }
    load(true);
  });
  on(m.el, 'input', '[data-jh-q]', (e, field) => {   // asked for once the typing pauses
    state.q = String(field.value || '').trim();
    clearTimeout(state.timer);
    state.timer = setTimeout(() => load(true), 300);
  });
  on(m.el, 'click', '[data-jh-more]', () => load(false));
  load(true);
  return m;
}
// "Workflow history", from a deal's menu: everything the workflows did with that deal.
function openJourneyDealHistory(dealId, dealTitle) {
  return openJourneyHistory({ dealId: Number(dealId), title: tf('jh_title_deal', { deal: dealTitle || '' }) });
}
