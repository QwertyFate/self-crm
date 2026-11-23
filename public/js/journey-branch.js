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
     contact_field   the same about a field of the deal's contact (Part 20):
                 one of the workspace's own, or name, email, phone, company
                 (Part 21, config.base). In the list of fields those four are
                 the values "base name" … — a space no field's key can have.

     deal_owner, contact_owner   who the deal, or its contact, is assigned to
                 (Part 22): one of the ticked people, none of them, nobody
     deal_age, contact_age   when the deal, or its contact, was created
                 (Part 22): longer ago than a time, within it, before a day,
                 on a day or later
   The people are the workspace's own (journeyPeople, read with the page).

   HOW A FIELD IS COMPARED (JOURNEY_OPS, the server's OPS; Part 20, 2026-11-23)
   Both field questions choose a comparison: has any value, is empty, is
   exactly, is not, contains, does not contain, starts with, and four by size
   (numbers or dates). "Any" and "is" are saved as before, without a word for
   the comparison. A dropdown field offers its options as suggestions.

   The box says its question as one short line (journeyBranchText). A name
   may be given to it; then the name is the title and the question the line
   under it.

   THE LISTS ARE GROUPED (Part 27)  Fourteen questions in one list are hard
   to find one's way in, so the list of questions stands under three
   headings — about the deal, about its contact, about what happened since
   the deal entered — and the list of comparisons under three: filled in or
   not, text, numbers and dates. Only the order in the list changes: what
   is saved and what the server takes is the same.

   A ROUTE'S CONDITION (Part 25)  A router's route asks one of these very
   questions. Its window is this window, opened with `pick`: it then shows
   neither "Asked after" nor a name nor which line is which — those are the
   router's — and "Save" hands the question back (pick.done) instead of
   saving a box.

   FUNCTION MAP  openJourneyBranch, loadJourneyPeople, resetJourneyBranch;
                 pure: journeyBranchText, journeyBranchLines,
                 journeyBranchConfig, journeyBranchOp, journeyBranchSized,
                 journeyBranchBase, journeyContactFieldOptions,
                 journeyBranchDay, journeyBranchSpan,
                 journeyBranchTestOptions, journeyBranchOpOptions
   ═══════════════════════════════════════════════════════════════════════════ */

// The questions, in the order of the list, each with its sentence in the list and its short line on the box.
const JOURNEY_TESTS = ['stage', 'meeting', 'answered', 'opt_out', 'has_email', 'has_phone', 'assigned', 'urgency', 'field', 'contact_field', 'deal_owner', 'contact_owner', 'deal_age', 'contact_age'];
const JOURNEY_TEST_KEYS = { stage: 'jb_q_stage', meeting: 'jb_q_meeting', answered: 'jb_q_answered', opt_out: 'jb_q_opt_out', has_email: 'jb_q_has_email', has_phone: 'jb_q_has_phone',
  assigned: 'jb_q_assigned', urgency: 'jb_q_urgency', field: 'jb_q_field', contact_field: 'jb_q_contact_field', deal_owner: 'jb_q_deal_owner', contact_owner: 'jb_q_contact_owner',
  deal_age: 'jb_q_deal_age', contact_age: 'jb_q_contact_age' };
// The list of questions, under its headings (Part 27): every question of JOURNEY_TESTS once, in the order it is shown.
const JOURNEY_TEST_GROUPS = [['jb_g_deal', ['stage', 'assigned', 'deal_owner', 'urgency', 'field', 'deal_age']],
  ['jb_g_contact', ['has_email', 'has_phone', 'contact_field', 'contact_owner', 'contact_age', 'opt_out']],
  ['jb_g_since', ['meeting', 'answered']]];
const JOURNEY_TEST_LINES = { meeting: 'jb_l_meeting', answered: 'jb_l_answered', opt_out: 'jb_l_opt_out', has_email: 'jb_l_has_email', has_phone: 'jb_l_has_phone', assigned: 'jb_l_assigned' };
const JOURNEY_BRANCH_MAX = { stages: 20, value: 200, people: 20, age: 3650 * 24 * 60 };   // the server's limits (utils/journey-branch.js)
// Who it is assigned to, and when it was created (Part 22; the server's OWNER_TESTS, OWNER_OPS, AGE_TESTS, AGE_OPS):
// each way of asking with its words in the list and its line on the box, and whose it is — the deal's or the contact's.
const JOURNEY_OWNER_TESTS = ['deal_owner', 'contact_owner'];
const JOURNEY_AGE_TESTS = ['deal_age', 'contact_age'];
const JOURNEY_OWNER_OPS = { is: 'jb_who_is', is_not: 'jb_who_is_not', nobody: 'jb_who_nobody' };
const JOURNEY_OWNER_LINES = { is: 'jb_l_owner_is', is_not: 'jb_l_owner_is_not', nobody: 'jb_l_owner_nobody' };
const JOURNEY_AGE_OPS = { older: 'jb_age_older', newer: 'jb_age_newer', before: 'jb_age_before', after: 'jb_age_after' };
const JOURNEY_AGE_LINES = { older: 'jb_l_age_older', newer: 'jb_l_age_newer', before: 'jb_l_age_before', after: 'jb_l_age_after' };
const JOURNEY_SPAN_UNITS = { min: 'jb_unit_min', hours: 'jb_unit_hours', days: 'jb_unit_days' };   // the units of JOURNEY_UNITS, as they read behind "longer ago than"
const JOURNEY_WHOSE = { deal_owner: 'jb_w_deal', deal_age: 'jb_w_deal', contact_owner: 'jb_w_contact', contact_age: 'jb_w_contact' };

let journeyPeople = [];   // the people of the workspace: who a deal or a contact can be assigned to
function resetJourneyBranch() { journeyPeople = []; }
// Read with the page (journey.js loadJourney): people may have joined or left since they were last read.
async function loadJourneyPeople() {
  const list = await journeySend(() => api.get('/api/workspace/members'));
  journeyPeople = Array.isArray(list) ? list : [];
}

// A day 'YYYY-MM-DD' as typed into the form, when it is a day there is; else ''.
function journeyBranchDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])], day = new Date(Date.UTC(y, mo - 1, d));
  return y && day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d ? m[0] : '';
}
// A length of time as the form holds it, in minutes: a whole number from 1, up to the server's limit; else null.
function journeyBranchSpan(n, unit) {
  const text = String(n ?? '').trim(), per = Object.hasOwn(JOURNEY_UNITS, unit) ? JOURNEY_UNITS[unit] : 0;
  if (!/^\d{1,7}$/.test(text) || !per) return null;
  const m = Number(text) * per;
  return m >= 1 && m <= JOURNEY_BRANCH_MAX.age ? m : null;
}
// The two questions about a field, and how a field is compared (the server's FIELD_TESTS, OPS, OPS_BARE, OPS_SIZE):
// each comparison with its words in the list and its line on the box.
const JOURNEY_FIELD_TESTS = ['field', 'contact_field'];
// What every contact has (the server's CONTACT_BASE), each with its name in the list and on the box. In the list of
// contact fields such a one is the value 'base <word>': the key of a field cannot hold a space, so the two never meet.
const JOURNEY_CONTACT_BASE = ['name', 'email', 'phone', 'company'];
const JOURNEY_BASE_KEYS = { name: 'jb_base_name', email: 'jb_base_email', phone: 'jb_base_phone', company: 'jb_base_company' };
const JOURNEY_OPS = ['any', 'empty', 'is', 'is_not', 'contains', 'not_contains', 'starts', 'gt', 'gte', 'lt', 'lte'];
const JOURNEY_OPS_BARE = ['any', 'empty'];            // these need no value
const JOURNEY_OPS_SIZE = ['gt', 'gte', 'lt', 'lte'];   // these compare numbers or dates
const JOURNEY_OP_KEYS = { any: 'jb_op_any', empty: 'jb_op_empty', is: 'jb_op_is', is_not: 'jb_op_is_not', contains: 'jb_op_contains', not_contains: 'jb_op_not_contains', starts: 'jb_op_starts',
  gt: 'jb_op_gt', gte: 'jb_op_gte', lt: 'jb_op_lt', lte: 'jb_op_lte' };
const JOURNEY_OP_LINES = { any: 'jb_l_field_any', empty: 'jb_l_field_empty', is: 'jb_l_field_is', is_not: 'jb_l_field_is_not', contains: 'jb_l_field_contains', not_contains: 'jb_l_field_not_contains',
  starts: 'jb_l_field_starts', gt: 'jb_l_field_gt', gte: 'jb_l_field_gte', lt: 'jb_l_field_lt', lte: 'jb_l_field_lte' };

// The list of comparisons under its headings (Part 27): whether the field is filled in at all, text, and size.
const JOURNEY_OP_GROUPS = [['jb_g_op_filled', ['any', 'empty']], ['jb_g_op_text', ['is', 'is_not', 'contains', 'not_contains', 'starts']], ['jb_g_op_size', ['gt', 'gte', 'lt', 'lte']]];

// The questions as the options of their list: "choose" first, then each heading with its questions.
function journeyBranchTestOptions(chosen) {
  return journeyOption('', t('jr_opt_choose'), chosen) + JOURNEY_TEST_GROUPS.map(([heading, tests]) =>
    `<optgroup label="${esc(t(heading))}">${tests.map(k => journeyOption(k, t(JOURNEY_TEST_KEYS[k]), chosen)).join('')}</optgroup>`).join('');
}
// The comparisons as the options of their list, each heading with its comparisons.
function journeyBranchOpOptions(chosen) {
  return JOURNEY_OP_GROUPS.map(([heading, ops]) => `<optgroup label="${esc(t(heading))}">${ops.map(k => journeyOption(k, t(JOURNEY_OP_KEYS[k]), chosen)).join('')}</optgroup>`).join('');
}
// How a field question compares: its own word, what a box saved before Part 20 means (a value: "is", none: "any"),
// or null for a comparison a newer server knows.
function journeyBranchOp(config) {
  const c = config || {};
  if (c.op === undefined || c.op === null) return c.value ? 'is' : 'any';
  return JOURNEY_OPS.includes(c.op) ? c.op : null;
}
// Which of the four a value of the contact field list stands for ('base email' → 'email'), or '' for a field's key.
function journeyBranchBase(value) {
  const word = String(value ?? '').startsWith('base ') ? String(value).slice(5) : '';
  return JOURNEY_CONTACT_BASE.includes(word) ? word : '';
}
// The list a question about a contact field chooses from: what every contact has, then the workspace's own fields.
function journeyContactFieldOptions(chosen) {
  const own = journeyContactFields.map(f => journeyOption(f.field_key, f.name, chosen)).join('');
  return `${journeyOption('', t('jr_opt_choose'), chosen)}<optgroup label="${esc(t('jb_g_base'))}">${JOURNEY_CONTACT_BASE.map(k => journeyOption('base ' + k, t(JOURNEY_BASE_KEYS[k]), chosen)).join('')}</optgroup>${
    own ? `<optgroup label="${esc(t('jb_g_own'))}">${own}</optgroup>` : ''}`;
}
// Whether a typed value has a size the server can compare by: a number (250000, 2,5, 300.000, 1,234.56, with € $ %
// or EUR around it) or a day (2027-03-31, 31.03.2027) — the server's numOf and dayOf.
function journeyBranchSized(value) {
  const s = String(value ?? '').replace(/\s+/g, '').replace(/^(?:€|\$|EUR)/i, '').replace(/(?:€|\$|%|EUR)$/i, '');
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s) || /^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(s) || /^-?\d+(?:[.,]\d+)?$/.test(s)) return true;
  const txt = String(value ?? '').trim(), iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(txt), de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(txt);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]].map(Number) : de ? [de[3], de[2], de[1]].map(Number) : [0, 0, 0];
  const day = new Date(Date.UTC(y, m - 1, d));
  return !!y && day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
}

// What a branch box asks, as one short line. Pure apart from t()/tf(), the language and the names the page knows.
function journeyBranchText(config) {
  const c = config || {};
  if (c.test === 'stage') return tf('jb_l_stage', { stages: (Array.isArray(c.stage_ids) ? c.stage_ids : []).map(id => journeyStageName(id) || t('jr_stage_gone')).join(', ') });
  if (c.test === 'urgency') return tf('jb_l_urgency', { level: JOURNEY_URGENCY_KEYS[c.min_urgency] ? t(JOURNEY_URGENCY_KEYS[c.min_urgency]) : String(c.min_urgency ?? '') });
  if (JOURNEY_OWNER_TESTS.includes(c.test)) {
    if (!Object.hasOwn(JOURNEY_OWNER_LINES, c.op)) return t('jb_l_unknown');
    const names = (Array.isArray(c.user_ids) ? c.user_ids : []).map(id => { const p = journeyPeople.find(m => Number(m.id) === Number(id)); return p ? p.name : t('jb_user_gone'); }).join(', ');
    return tf(JOURNEY_OWNER_LINES[c.op], { what: t(JOURNEY_WHOSE[c.test]), names });
  }
  if (JOURNEY_AGE_TESTS.includes(c.test)) {
    if (!Object.hasOwn(JOURNEY_AGE_LINES, c.op)) return t('jb_l_unknown');
    const day = journeyBranchDay(c.date);   // shown as a date of the page's language; noon, so that no clock turns it into the day before
    return tf(JOURNEY_AGE_LINES[c.op], { what: t(JOURNEY_WHOSE[c.test]), time: journeyDurationText(c.minutes), day: day ? fmtDate(day + 'T12:00:00') : String(c.date ?? '') });
  }
  if (JOURNEY_FIELD_TESTS.includes(c.test)) {
    const ofContact = c.test === 'contact_field', op = journeyBranchOp(c);
    if (!op) return t('jb_l_unknown');
    const based = ofContact && c.base !== undefined && c.base !== null;
    if (based && !JOURNEY_CONTACT_BASE.includes(c.base)) return t('jb_l_unknown');
    const field = (ofContact ? journeyContactFields : journeyDealFields).find(f => f.field_key === c.field_key), name = based ? t(JOURNEY_BASE_KEYS[c.base]) : field ? field.name : t('jb_field_gone');
    const says = tf(JOURNEY_OP_LINES[op], { name, value: String(c.value ?? '') });
    return ofContact ? tf('jb_l_contact', { text: says }) : says;   // a contact's field says whose it is
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
  if (JOURNEY_OWNER_TESTS.includes(now.test)) {
    if (!Object.hasOwn(JOURNEY_OWNER_OPS, now.who)) return { error: 'jb_err_who', part: 'who' };
    config.op = now.who;
    if (now.who !== 'nobody') {
      if (!now.people.length) return { error: 'jb_err_people', part: 'people' };
      if (now.people.length > JOURNEY_BRANCH_MAX.people) return { error: 'jb_err_people_many', part: 'people' };
      config.user_ids = now.people;
    }
  }
  if (JOURNEY_AGE_TESTS.includes(now.test)) {
    if (!Object.hasOwn(JOURNEY_AGE_OPS, now.age)) return { error: 'jb_err_age', part: 'age' };
    config.op = now.age;
    if (now.age === 'older' || now.age === 'newer') {
      const minutes = journeyBranchSpan(now.span, now.spanunit);
      if (minutes === null) return { error: 'jb_err_span', part: 'span' };
      config.minutes = minutes;
    } else {
      const day = journeyBranchDay(now.day);
      if (!day) return { error: 'jb_err_day', part: 'day' };
      config.date = day;
    }
  }
  if (JOURNEY_FIELD_TESTS.includes(now.test)) {
    const part = now.test === 'contact_field' ? 'cfield' : 'field';   // each question has its own list of fields
    if (!now[part]) return { error: 'jb_err_field', part };
    if (!JOURNEY_OPS.includes(now.op)) return { error: 'jb_err_op', part: 'op' };
    const base = part === 'cfield' ? journeyBranchBase(now.cfield) : '';
    if (base) config.base = base; else config.field_key = now[part];
    if (now.op !== 'any' && now.op !== 'is') config.op = now.op;   // those two are saved as before Part 20
    if (!JOURNEY_OPS_BARE.includes(now.op)) {
      if (!now.value) return { error: 'jb_err_value', part: 'value' };
      if (JOURNEY_OPS_SIZE.includes(now.op) && !journeyBranchSized(now.value)) return { error: 'jb_err_size', part: 'value' };
      config.value = now.value;
    }
  }
  return { config };
}

// A branch box's window: when the question is asked, which one, and what it needs. node null: a new one, behind
// fresh.afterId (on the "no" side of a branch box when fresh.side says so). pick: { config, title, done } — the
// window asks for a question only (a route's condition, journey-router.js) and hands it to pick.done; no box is saved.
function openJourneyBranch(node, fresh, pick = null) {
  const flow = journeyFlow(), c = (pick ? pick.config : node && node.config) || {}, wait = journeyWaitParts(node ? node.wait_minutes : 0);
  // What the form opens with is what it can show: a stage or a field that was deleted since is not in its lists, so
  // it is not in `start` either — a window nobody touched must not ask about unsaved changes.
  const stageIds = journeyPipelines().flatMap(p => p.stages.map(s => s.id));
  const asksOwner = JOURNEY_OWNER_TESTS.includes(c.test), asksAge = JOURNEY_AGE_TESTS.includes(c.test), span = asksAge && c.minutes ? journeyWaitParts(c.minutes) : { n: '', unit: 'days' };
  const start = { n: String(wait.n), unit: wait.unit, name: node ? String(node.title || '') : '', test: JOURNEY_TESTS.includes(c.test) ? c.test : '',
    stages: Array.isArray(c.stage_ids) ? c.stage_ids.filter(id => stageIds.includes(id)).sort((a, b) => a - b) : [], urgency: String(c.min_urgency || ''),
    field: c.test !== 'contact_field' && journeyDealFields.some(f => f.field_key === c.field_key) ? String(c.field_key) : '',
    cfield: c.test !== 'contact_field' ? '' : JOURNEY_CONTACT_BASE.includes(c.base) ? 'base ' + c.base : (c.base === undefined || c.base === null) && journeyContactFields.some(f => f.field_key === c.field_key) ? String(c.field_key) : '',
    op: (JOURNEY_FIELD_TESTS.includes(c.test) && journeyBranchOp(c)) || 'any', value: String(c.value || ''),   // "op" is also how the people and the creation are asked: not this list's
    who: asksOwner && Object.hasOwn(JOURNEY_OWNER_OPS, c.op) ? c.op : 'is',
    people: asksOwner && Array.isArray(c.user_ids) ? c.user_ids.map(Number).filter(id => journeyPeople.some(p => Number(p.id) === id)).sort((a, b) => a - b) : [],
    age: asksAge && Object.hasOwn(JOURNEY_AGE_OPS, c.op) ? c.op : 'older', span: String(span.n), spanunit: span.unit, day: asksAge ? journeyBranchDay(c.date) : '' };
  const w = journeyWindow({ title: pick ? pick.title : `${t(node ? 'jr_title_edit' : 'jr_title_add')}: ${t('jr_kind_branch')}`, size: 'lg', start, remove: node ? async (fail, done) => {
      const ok = await ui.confirm({ title: t('jr_delete_q'), message: tf('jr_delete_msg', { title: journeyBranchLines(node).title }), confirmLabel: t('btn_delete'), danger: true });
      if (!ok) return;
      const res = await journeySend(() => api.del(`/api/journey/nodes/${node.id}`));
      if (res && res.error && res.code === 'not_found') { done({}, 'jr_deleted'); return loadJourney(); }   // deleted by a colleague meanwhile: deleted all the same, read again
      if (done(res, 'jr_deleted')) journeyApply(res.flow);
    } : null,
    body: fid => `<div class="field" id="${fid}-w-wait"><label class="label" for="${fid}-n">${esc(t('jb_f_wait'))}</label>
          <div class="row jr-wait"><input class="input" id="${fid}-n" type="number" min="0" step="1" inputmode="numeric" value="${esc(start.n)}">
            <select class="select" id="${fid}-unit" aria-label="${esc(t('jr_unit_aria'))}">${Object.keys(JOURNEY_UNITS).map(u => journeyOption(u, t('jr_unit_' + u), start.unit)).join('')}</select></div>
          <p class="help">${esc(t('jb_f_wait_hint'))}</p></div>
        <div class="field"><label class="label" for="${fid}-test">${esc(t('jb_f_test'))}</label>
          <select class="select" id="${fid}-test" autofocus>${journeyBranchTestOptions(start.test)}</select></div>
        <div class="field" id="${fid}-w-stages"><span class="label">${esc(t('jb_f_stages'))}</span>
          <div class="jr-checks jt-stages" id="${fid}-stages" tabindex="-1">${journeyPipelines().map(p => `<div class="jt-stage-group"><span class="help">${esc(p.name)}</span>${(Array.isArray(p.stages) ? p.stages : []).map(st =>
            `<label class="jr-check"><input type="checkbox" data-jb-stage value="${Number(st.id)}"${start.stages.includes(st.id) ? ' checked' : ''}><span>${esc(st.name)}</span></label>`).join('')}</div>`).join('')}</div></div>
        <div class="field" id="${fid}-w-urgency"><label class="label" for="${fid}-urgency">${esc(t('jb_f_urgency'))}</label>
          <select class="select" id="${fid}-urgency">${journeyOption('', t('jr_opt_choose'), start.urgency)}${Object.keys(JOURNEY_URGENCY_KEYS).map(n => journeyOption(n, t(JOURNEY_URGENCY_KEYS[n]), start.urgency)).join('')}</select></div>
        <div class="field" id="${fid}-w-field"><label class="label" for="${fid}-field">${esc(t('jb_f_field'))}</label>
          <select class="select" id="${fid}-field">${journeyOption('', t('jr_opt_choose'), start.field)}${journeyDealFields.map(f => journeyOption(f.field_key, f.name, start.field)).join('')}</select>
          <p class="help">${esc(t('jb_field_hint'))}</p></div>
        <div class="field" id="${fid}-w-cfield"><label class="label" for="${fid}-cfield">${esc(t('jb_f_cfield'))}</label>
          <select class="select" id="${fid}-cfield">${journeyContactFieldOptions(start.cfield)}</select>
          <p class="help">${esc(t('jb_cfield_hint'))}</p></div>
        <div class="field" id="${fid}-w-op"><label class="label" for="${fid}-op">${esc(t('jb_f_op'))}</label>
          <select class="select" id="${fid}-op">${journeyBranchOpOptions(start.op)}</select></div>
        <div class="field" id="${fid}-w-value"><label class="label" for="${fid}-value">${esc(t('jb_f_value'))}</label>
          <input class="input" id="${fid}-value" maxlength="${JOURNEY_BRANCH_MAX.value}" autocomplete="off" list="${fid}-values" value="${esc(start.value)}"><datalist id="${fid}-values"></datalist>
          <p class="help">${esc(t('jb_f_value_hint'))}</p></div>
        <div class="field" id="${fid}-w-who"><label class="label" for="${fid}-who">${esc(t('jb_f_who'))}</label>
          <select class="select" id="${fid}-who">${Object.keys(JOURNEY_OWNER_OPS).map(k => journeyOption(k, t(JOURNEY_OWNER_OPS[k]), start.who)).join('')}</select></div>
        <div class="field" id="${fid}-w-people"><span class="label">${esc(t('jb_f_people'))}</span>
          <div class="jr-checks" id="${fid}-people" tabindex="-1">${journeyPeople.length ? journeyPeople.map(p =>
            `<label class="jr-check"><input type="checkbox" data-jb-user value="${Number(p.id)}"${start.people.includes(Number(p.id)) ? ' checked' : ''}><span>${esc(p.name)}</span></label>`).join('') : `<span class="help">${esc(t('jb_people_none'))}</span>`}</div></div>
        <div class="field" id="${fid}-w-age"><label class="label" for="${fid}-age">${esc(t('jb_f_age'))}</label>
          <select class="select" id="${fid}-age">${Object.keys(JOURNEY_AGE_OPS).map(k => journeyOption(k, t(JOURNEY_AGE_OPS[k]), start.age)).join('')}</select></div>
        <div class="field" id="${fid}-w-span"><label class="label" for="${fid}-span">${esc(t('jb_f_span'))}</label>
          <div class="row jr-wait"><input class="input" id="${fid}-span" type="number" min="1" step="1" inputmode="numeric" value="${esc(start.span)}">
            <select class="select" id="${fid}-spanunit" aria-label="${esc(t('jr_unit_aria'))}">${Object.keys(JOURNEY_SPAN_UNITS).map(u => journeyOption(u, t(JOURNEY_SPAN_UNITS[u]), start.spanunit)).join('')}</select></div>
          <p class="help">${esc(t('jb_span_hint'))}</p></div>
        <div class="field" id="${fid}-w-day"><label class="label" for="${fid}-day">${esc(t('jb_f_day'))}</label>
          <input class="input" id="${fid}-day" type="date" value="${esc(start.day)}"><p class="help">${esc(t('jb_day_hint'))}</p></div>
        <div class="field" id="${fid}-w-name"><label class="label" for="${fid}-name">${esc(t('jb_f_name'))}</label>
          <input class="input" id="${fid}-name" maxlength="${JOURNEY_MAX_TITLE}" autocomplete="off" value="${esc(start.name)}"></div>
        <p class="help" id="${fid}-w-hint">${esc(t('jb_hint'))}</p>`,
    // ticks under another question are not this question's: they stay what they were
    read: (el, root) => ({ n: el('n').value.trim(), unit: el('unit').value, name: el('name').value.trim(), test: el('test').value,
      stages: el('test').value === 'stage' ? [...root.querySelectorAll('[data-jb-stage]')].filter(b => b.checked).map(b => Number(b.value)).sort((a, b) => a - b) : start.stages,
      urgency: el('urgency').value, field: el('field').value, cfield: el('cfield').value, op: el('op').value, value: el('value').value.trim(),
      who: el('who').value,
      people: JOURNEY_OWNER_TESTS.includes(el('test').value) ? [...root.querySelectorAll('[data-jb-user]')].filter(b => b.checked).map(b => Number(b.value)).sort((a, b) => a - b) : start.people,
      age: el('age').value, span: el('span').value.trim(), spanunit: el('spanunit').value, day: el('day').value }),
    save: async (now, fail, done) => {
      const minutes = journeyWaitMinutes(now.n, now.unit);
      if (minutes === null) return fail(t('jr_err_wait'), 'n');
      const out = journeyBranchConfig(now);
      if (out.error) return fail(t(out.error), out.part);
      if (pick) { w.m.close(); return pick.done(out.config); }   // a route's condition: handed back, nothing saved here
      const body = { title: now.name, body: '', wait_minutes: minutes, config: out.config };
      const res = await journeySend(() => (node ? api.put(`/api/journey/nodes/${node.id}`, body) : api.post(`/api/journey/flows/${flow.id}/nodes`, { ...body, kind: 'branch', ...journeyBehind(fresh) })));
      if (done(res, 'jr_saved')) journeyApply(res.flow);
    } });
  // only what the chosen question needs is shown: a field question its own list of fields and the comparison, and the
  // value only for a comparison that has one. A dropdown field offers its options as suggestions for the value.
  const sync = () => {
    w.el('w-wait').hidden = !!pick; w.el('w-name').hidden = !!pick; w.el('w-hint').hidden = !!pick;   // a route's condition has no wait, no name and no two lines of its own
    const test = w.el('test').value, asksField = JOURNEY_FIELD_TESTS.includes(test), ofContact = test === 'contact_field';
    w.el('w-stages').hidden = test !== 'stage'; w.el('w-urgency').hidden = test !== 'urgency'; w.el('w-field').hidden = test !== 'field'; w.el('w-cfield').hidden = !ofContact;
    w.el('w-op').hidden = !asksField; w.el('w-value').hidden = !asksField || JOURNEY_OPS_BARE.includes(w.el('op').value);
    const field = asksField ? (ofContact ? journeyContactFields : journeyDealFields).find(f => f.field_key === w.el(ofContact ? 'cfield' : 'field').value) : null;
    w.el('values').innerHTML = (field && Array.isArray(field.options) ? field.options : []).map(o => `<option value="${esc(o)}"></option>`).join('');
    // who it is assigned to: the people only when people are named; when it was created: a length of time, or a day
    const owner = JOURNEY_OWNER_TESTS.includes(test), aged = JOURNEY_AGE_TESTS.includes(test), byDay = ['before', 'after'].includes(w.el('age').value);
    w.el('w-who').hidden = !owner; w.el('w-people').hidden = !owner || w.el('who').value === 'nobody';
    w.el('w-age').hidden = !aged; w.el('w-span').hidden = !aged || byDay; w.el('w-day').hidden = !aged || !byDay;
  };
  on(w.m.el, 'change', 'select', sync);
  sync();
  return w.m;
}
