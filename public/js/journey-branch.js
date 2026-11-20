/* ═══════════════════════════════════════════════════════════════════════════
   A BRANCH BOX OF A WORKFLOW — "if / else"
   (CUSTOMER_JOURNEY_CHANGES Part 11, 2026-11-19; loaded after journey.js,
   which draws the box with its two lines and opens this window; server:
   utils/journey-branch.js asks the question, routes/journey.js saves it).

   A branch box does nothing to the deal. When a deal reaches it — after the
   box's own wait, like every box — one QUESTION is asked about the deal as it
   is at that moment, and the deal goes on along the box's "yes" line or its
   "no" line. A line that leads nowhere ends the workflow for that deal.

   THE QUESTIONS (JOURNEY_TESTS, the server's TESTS)
     stage       the deal is in one of the ticked stages
     meeting     a meeting was booked since the deal entered the workflow
     answered    a fonio call reached the person since then
     opt_out     the contact pressed "no more emails"
     has_email   the contact has an email address
     has_phone   the contact has a phone number
     assigned    the deal is assigned to someone
     urgency     the deal's urgency is at least a level
     field       a deal field has a value — any, or the one typed in

   The box says its question as one short line (journeyBranchText). A name
   may be given to it; then the name is the title and the question the line
   under it.

   FUNCTION MAP  openJourneyBranch;
                 pure: journeyBranchText, journeyBranchLines,
                 journeyBranchConfig
   ═══════════════════════════════════════════════════════════════════════════ */

// The questions, in the order of the list, each with its sentence in the list and its short line on the box.
const JOURNEY_TESTS = ['stage', 'meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned', 'urgency', 'field'];
const JOURNEY_TEST_KEYS = { stage: 'jb_q_stage', meeting: 'jb_q_meeting', answered: 'jb_q_answered', opt_out: 'jb_q_opt_out', has_email: 'jb_q_has_email', has_phone: 'jb_q_has_phone',
  assigned: 'jb_q_assigned', urgency: 'jb_q_urgency', field: 'jb_q_field' };
const JOURNEY_TEST_LINES = { meeting: 'jb_l_meeting', answered: 'jb_l_answered', opt_out: 'jb_l_opt_out', has_email: 'jb_l_has_email', has_phone: 'jb_l_has_phone', assigned: 'jb_l_assigned' };
const JOURNEY_BRANCH_MAX = { stages: 20, value: 200 };   // the server's limits (utils/journey-branch.js)

// What a branch box asks, as one short line. Pure apart from t()/tf(), the language and the names the page knows.
function journeyBranchText(config) {
  const c = config || {};
  if (c.test === 'stage') return tf('jb_l_stage', { stages: (Array.isArray(c.stage_ids) ? c.stage_ids : []).map(id => journeyStageName(id) || t('jr_stage_gone')).join(', ') });
  if (c.test === 'urgency') return tf('jb_l_urgency', { level: JOURNEY_URGENCY_KEYS[c.min_urgency] ? t(JOURNEY_URGENCY_KEYS[c.min_urgency]) : String(c.min_urgency ?? '') });
  if (c.test === 'field') {
    const field = journeyDealFields.find(f => f.field_key === c.field_key), name = field ? field.name : t('jb_field_gone');
    return c.value ? tf('jb_l_field_is', { name, value: c.value }) : tf('jb_l_field_any', { name });
  }
  return Object.hasOwn(JOURNEY_TEST_LINES, c.test) ? t(JOURNEY_TEST_LINES[c.test]) : t(c.test ? 'jb_l_unknown' : 'jb_l_none');   // a question a newer server knows: said, not guessed
}
// What the box shows: its question — or, when it was given a name, the name with the question under it.
function journeyBranchLines(node) {
  const asks = journeyBranchText(node && node.config), name = String((node && node.title) || '').trim();
  return name ? { title: name, text: asks } : { title: asks, text: '' };
}

// What the window holds, as the settings the route takes: { config }, or { error, part } — the sentence to say and
// the field to go to. Only what the chosen question uses is sent.
function journeyBranchConfig(now) {
  if (!JOURNEY_TESTS.includes(now.test)) return { error: 'jb_err_test', part: 'test' };
  const config = { test: now.test };
  if (now.test === 'stage') {
    if (!now.stages.length) return { error: 'jb_err_stages', part: 'stages' };
    if (now.stages.length > JOURNEY_BRANCH_MAX.stages) return { error: 'jb_err_stages_many', part: 'stages' };
    config.stage_ids = now.stages;
  }
  if (now.test === 'urgency') {
    if (!Object.hasOwn(JOURNEY_URGENCY_KEYS, now.urgency)) return { error: 'jb_err_urgency', part: 'urgency' };
    config.min_urgency = Number(now.urgency);
  }
  if (now.test === 'field') {
    if (!now.field) return { error: 'jb_err_field', part: 'field' };
    config.field_key = now.field;
    if (now.value) config.value = now.value;
  }
  return { config };
}

// A branch box's window: when the question is asked, which one, and what it needs. node null: a new one, behind
// fresh.afterId (on the "no" side of a branch box when fresh.side says so).
function openJourneyBranch(node, fresh) {
  const flow = journeyFlow(), c = (node && node.config) || {}, wait = journeyWaitParts(node ? node.wait_minutes : 0);
  // What the form opens with is what it can show: a stage or a field that was deleted since is not in its lists, so
  // it is not in `start` either — a window nobody touched must not ask about unsaved changes.
  const stageIds = journeyPipelines().flatMap(p => p.stages.map(s => s.id));
  const start = { n: String(wait.n), unit: wait.unit, name: node ? String(node.title || '') : '', test: JOURNEY_TESTS.includes(c.test) ? c.test : '',
    stages: Array.isArray(c.stage_ids) ? c.stage_ids.filter(id => stageIds.includes(id)).sort((a, b) => a - b) : [], urgency: String(c.min_urgency || ''),
    field: journeyDealFields.some(f => f.field_key === c.field_key) ? String(c.field_key) : '', value: String(c.value || '') };
  const w = journeyWindow({ title: `${t(node ? 'jr_title_edit' : 'jr_title_add')}: ${t('jr_kind_branch')}`, size: 'lg', start, remove: node ? async (fail, done) => {
      const ok = await ui.confirm({ title: t('jr_delete_q'), message: tf('jr_delete_msg', { title: journeyBranchLines(node).title }), confirmLabel: t('btn_delete'), danger: true });
      if (!ok) return;
      const res = await journeySend(() => api.del(`/api/journey/nodes/${node.id}`));
      if (res && res.error && res.code === 'not_found') { done({}, 'jr_deleted'); return loadJourney(); }   // deleted by a colleague meanwhile: deleted all the same, read again
      if (done(res, 'jr_deleted')) journeyApply(res.flow);
    } : null,
    body: fid => `<div class="field"><label class="label" for="${fid}-n">${esc(t('jb_f_wait'))}</label>
          <div class="row jr-wait"><input class="input" id="${fid}-n" type="number" min="0" step="1" inputmode="numeric" value="${esc(start.n)}">
            <select class="select" id="${fid}-unit" aria-label="${esc(t('jr_unit_aria'))}">${Object.keys(JOURNEY_UNITS).map(u => journeyOption(u, t('jr_unit_' + u), start.unit)).join('')}</select></div>
          <p class="help">${esc(t('jb_f_wait_hint'))}</p></div>
        <div class="field"><label class="label" for="${fid}-test">${esc(t('jb_f_test'))}</label>
          <select class="select" id="${fid}-test" autofocus>${journeyOption('', t('jr_opt_choose'), start.test)}${JOURNEY_TESTS.map(k => journeyOption(k, t(JOURNEY_TEST_KEYS[k]), start.test)).join('')}</select></div>
        <div class="field" id="${fid}-w-stages"><span class="label">${esc(t('jb_f_stages'))}</span>
          <div class="jr-checks jt-stages" id="${fid}-stages" tabindex="-1">${journeyPipelines().map(p => `<div class="jt-stage-group"><span class="help">${esc(p.name)}</span>${(Array.isArray(p.stages) ? p.stages : []).map(st =>
            `<label class="jr-check"><input type="checkbox" data-jb-stage value="${Number(st.id)}"${start.stages.includes(st.id) ? ' checked' : ''}><span>${esc(st.name)}</span></label>`).join('')}</div>`).join('')}</div></div>
        <div class="field" id="${fid}-w-urgency"><label class="label" for="${fid}-urgency">${esc(t('jb_f_urgency'))}</label>
          <select class="select" id="${fid}-urgency">${journeyOption('', t('jr_opt_choose'), start.urgency)}${Object.keys(JOURNEY_URGENCY_KEYS).map(n => journeyOption(n, t(JOURNEY_URGENCY_KEYS[n]), start.urgency)).join('')}</select></div>
        <div class="field" id="${fid}-w-field"><label class="label" for="${fid}-field">${esc(t('jb_f_field'))}</label>
          <select class="select" id="${fid}-field">${journeyOption('', t('jr_opt_choose'), start.field)}${journeyDealFields.map(f => journeyOption(f.field_key, f.name, start.field)).join('')}</select>
          <p class="help">${esc(t('jb_field_hint'))}</p></div>
        <div class="field" id="${fid}-w-value"><label class="label" for="${fid}-value">${esc(t('jb_f_value'))}</label>
          <input class="input" id="${fid}-value" maxlength="${JOURNEY_BRANCH_MAX.value}" autocomplete="off" value="${esc(start.value)}"><p class="help">${esc(t('jb_f_value_hint'))}</p></div>
        <div class="field"><label class="label" for="${fid}-name">${esc(t('jb_f_name'))}</label>
          <input class="input" id="${fid}-name" maxlength="${JOURNEY_MAX_TITLE}" autocomplete="off" value="${esc(start.name)}"></div>
        <p class="help">${esc(t('jb_hint'))}</p>`,
    // ticks under another question are not this question's: they stay what they were
    read: (el, root) => ({ n: el('n').value.trim(), unit: el('unit').value, name: el('name').value.trim(), test: el('test').value,
      stages: el('test').value === 'stage' ? [...root.querySelectorAll('[data-jb-stage]')].filter(b => b.checked).map(b => Number(b.value)).sort((a, b) => a - b) : start.stages,
      urgency: el('urgency').value, field: el('field').value, value: el('value').value.trim() }),
    save: async (now, fail, done) => {
      const minutes = journeyWaitMinutes(now.n, now.unit);
      if (minutes === null) return fail(t('jr_err_wait'), 'n');
      const out = journeyBranchConfig(now);
      if (out.error) return fail(t(out.error), out.part);
      const body = { title: now.name, body: '', wait_minutes: minutes, config: out.config };
      const res = await journeySend(() => (node ? api.put(`/api/journey/nodes/${node.id}`, body) : api.post(`/api/journey/flows/${flow.id}/nodes`, { ...body, kind: 'branch', ...journeyBehind(fresh) })));
      if (done(res, 'jr_saved')) journeyApply(res.flow);
    } });
  // only what the chosen question needs is shown
  const sync = () => {
    const test = w.el('test').value;
    w.el('w-stages').hidden = test !== 'stage'; w.el('w-urgency').hidden = test !== 'urgency'; w.el('w-field').hidden = test !== 'field'; w.el('w-value').hidden = test !== 'field';
  };
  on(w.m.el, 'change', 'select', sync);
  sync();
  return w.m;
}
