/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOMER JOURNEY (#page-journey) — the workspace's workflows
   (CUSTOMER_JOURNEY_CHANGES Parts 3–6, 2026-11-19; server: routes/journey.js,
   utils/journey-run.js makes them happen).

   A WORKFLOW is made of steps, one action per box, added by the workspace
   itself — as many workflows as it wants. The first box is the START: what
   sets the workflow off — a lead, a stage, a booking, a call's result, a
   moment; every start, its window and what it says on its box are
   journey-start.js (Part 9) — and where it stops.
   Every other box is one action: fonio calls, an email, a WhatsApp, an SMS or
   a task for a person, the deal moved to a stage — each with how long after
   the box before it it happens — or a Wait (Part 10): a box that only takes
   time, and can hold on until a time of day on chosen weekdays. The order is the lines: a box names the
   box after it (next_id), and journeyChain() follows them from the start.

   A BRANCH (Part 11)  One kind of box does nothing but ask a question about
   the deal — is it in one of these stages, was a meeting booked, has a field
   a value — and has TWO lines out: "yes" (next_id) and "no" (else_id), each
   with its own handle under the box. Its question, its window and what it
   says on its box are journey-branch.js. The chain puts a "no" side one
   column to the right of everything its "yes" side needed.

   THE BOARD (Part 5)  Every box has its place (journeyPlaces: where it was
   dragged to, or where the chain puts it). An owner or admin drags a box to
   move it; the round "+" under a box adds a step behind it when clicked, and
   draws a line when dragged onto another box. A click on a line takes it
   away. The lines are drawn after the boxes (journeyDrawLines), because where
   a line ends depends on how tall a box turned out.
   WHILE A BOX IS DRAGGED (Part 11) nothing is laid out again: every box is
   measured once when the drag begins, the box follows the pointer as a
   transform, only the lines that touch it are drawn again — and all of that
   at most once per frame, however often the pointer reports.

   RUNNING (Part 4)  A workflow runs while it is switched on (the switch above
   the board). Its start can be changed only while it is off. "Activity" shows
   which deals wait for which step and, under that, everything that happened
   in the workflow. A deal the workflow did not take in by itself is put in by
   hand: "Add to a workflow" in a deal's menu (detail-views.js calls
   journeyIncludeDeal).

   THE RECORD (Part 15)  Everything the workflows do is written down by the
   server and read in journey-history.js: every step, every deal taken in or
   let go, every change to a workflow and who made it. That file is the list
   in the "Activity" window, the "History" of the whole workspace (the button
   at the top of the page) and "Workflow history" in a deal's menu. This file
   keeps the two things they share with the waiting list: what a step is
   called (journeyStepText) and the engine's short words as sentences
   (journeyDetailText).

   AN EMAIL STEP (Part 6)  Its text is plain text or HTML. The window shows a
   preview with sample values in a sandboxed frame — what is typed there can
   run nothing in the CRM — and sends the saved step once to the person's own
   address.

   VARIABLES (Part 14)  The texts of an email, a task, a WhatsApp and an SMS
   step can name the contact's and the deal's own values ("Hello
   {{first_name}}"). The names there are, the list that puts one in, what the
   preview fills in for them and the line that says which names are none are
   journey-vars.js; this file shows them in the step's window.

   WHO  Everyone in the workspace sees the workflows and may include a deal.
   Owners and admins add, change, move and delete (the server decides:
   can_manage). A member's click on a step opens it to read.

   WHAT A STEP NEEDS  A call step needs fonio connected, an email step an
   email address (journey-mail.js): a step whose integration is missing says
   so on its box.

   THE INTEGRATIONS' OWN WORKFLOWS (Part 8)  What fonio, the lead webhooks, the
   Upgrads Engine, Cal.com and Calendly do stands in the same list, as
   workflows that are read here and changed in the integration's settings.
   They are journey-fixed.js; this file only asks which one is shown.

   FUNCTION MAP  loadJourney, renderJourney, journeyToolbarHtml,
                 journeyBoardHtml, journeyBoxHtml, journeyDrawLines,
                 journeyDragBegin, journeyDragPaint,
                 openJourneyAdd, openJourneyBox,
                 journeyNameWindow, deleteJourneyFlow, setJourneyFlow,
                 setJourneyActive, openJourneyActivity, journeyIncludeDeal,
                 resetJourneyUI;
                 pure: journeyChain, journeyLayout, journeyPlaces,
                 journeyCanvasSize, journeyEdges, journeyLinesHtml,
                 journeyLinePath, journeyWaitText, journeyWaitParts,
                 journeyWaitMinutes, journeyStageName,
                 journeyPreviewHtml, journeyActivityHtml, journeyErrorText,
                 journeyStepText, journeyDetailText, journeyWhen
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_ACTIONS = ['call', 'email', 'whatsapp', 'sms', 'task', 'move', 'wait', 'branch'];   // the route's ACTIONS, in the order of the "Add step" list
const JOURNEY_ICONS = { start: 'flag', call: 'phone', email: 'mail', whatsapp: 'message-circle', sms: 'message', task: 'check-square', move: 'arrow-up-right', wait: 'clock', branch: 'help' };
const JOURNEY_WAIT_DAYS = { 1: 'fonio_day_1', 2: 'fonio_day_2', 3: 'fonio_day_3', 4: 'fonio_day_4', 5: 'fonio_day_5', 6: 'fonio_day_6', 7: 'fonio_day_7' };   // the weekdays a Wait box can wait for
const JOURNEY_UNITS = { min: 1, hours: 60, days: 1440 };   // a unit of the wait, in minutes
const JOURNEY_MAX_NAME = 80, JOURNEY_MAX_TITLE = 120, JOURNEY_MAX_TEXT = 20000, JOURNEY_MAX_WAIT = 365 * 24 * 60;   // the route's limits (routes/journey.js)
const JOURNEY_BOX_W = 300, JOURNEY_PAD = 40, JOURNEY_STEP_Y = 150, JOURNEY_MAX_PLACE = 20000;   // the board: a box's width, the room around, the chain's rhythm
// The route's refusal codes as sentences.
const JOURNEY_ERRORS = { forbidden: 'jr_err_forbidden', name: 'jr_err_name', limit: 'jr_err_limit', nodes_limit: 'jr_err_nodes_limit', after: 'jr_err_after', kind: 'jr_err_kind', title: 'jr_err_title',
  body: 'jr_err_body', wait: 'jr_err_wait', until: 'jr_err_until', branch: 'jr_err_branch', stage: 'jr_err_stage', webhooks: 'jr_err_webhooks', start: 'jr_err_start', field: 'jr_err_field', pipeline: 'jr_err_pipeline', flow: 'jr_err_flow', loop: 'jr_err_loop',
  start_fixed: 'jr_err_start_fixed', active: 'jr_start_locked', inactive: 'jr_err_inactive',
  deal: 'jr_err_deal', place: 'jr_err_place', line: 'jr_err_line', not_email: 'jr_err_generic', not_connected: 'jm_err_not_connected', no_address: 'jm_err_no_address', gone: 'jm_err_gone',
  rejected: 'jm_err_rejected', unreachable: 'jm_err_unreachable', paused: 'jm_err_paused', not_found: 'jr_err_gone', history: 'jh_err_query' };
// What a step's entry in the activity says about why: the engine's short words as sentences (anything else is shown as it is).
const JOURNEY_DETAILS = { no_sender: 'jr_d_no_sender', no_email: 'jr_d_no_email', opted_out: 'jr_d_opted_out', fonio_off: 'jr_d_fonio_off', gone: 'jr_d_gone', unreachable: 'jr_d_unreachable',
  stage_gone: 'jr_d_stage_gone', already_there: 'jr_d_already_there', interrupted: 'jr_d_interrupted', error: 'jr_d_error', scheduled: 'jr_d_scheduled', assigned: 'jr_d_assigned', unassigned: 'jr_d_unassigned',
  waited: 'jr_d_waited', yes: 'jr_d_yes', no: 'jr_d_no',
  // why fonio did not call (utils/fonio-calls.js scheduleForJourney), and a kind of step this server does not know
  no_contact: 'jr_d_no_contact', no_phone: 'jr_d_no_phone', bad_number: 'jr_d_bad_number', number_not_allowed: 'jr_d_number_not_allowed', already_scheduled: 'jr_d_already_scheduled', no_hours: 'jr_d_no_hours',
  skipped: 'jr_d_skipped', unknown_kind: 'jr_d_unknown_kind',
  // why an email waits at its step instead of going out: a sending limit of the address, or a pause (journey-mail.js, Part 17)
  limit_day: 'jr_d_limit_day', limit_hour: 'jr_d_limit_hour', limit_person: 'jr_d_limit_person', paused: 'jr_d_paused' };
const JOURNEY_ARROW = '<defs><marker id="jr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>';

let journeyFlows    = [];      // every workflow of the workspace, with its boxes (GET /api/journey)
let journeyWebhooks = [];      // the workspace's lead webhooks, by id and name: what a start can be limited to
let journeyManage   = false;   // owner or admin: may add, change and delete
let journeyLimits   = { flows: 20, nodes: 60 };   // the most workflows, and boxes in one, as the route says
let journeyFlowId   = null;    // the workflow that is shown
let journeyFonio    = false;   // fonio is connected: a call step can be made
let journeyDrag     = null;    // what the pointer holds on the board: a box being moved, or a line being drawn
let journeyDragEnd  = 0;       // when the last drag ended: the click that follows it opens nothing

// Logout and a workspace switch (auth.js resetClientState): nothing of the last workspace's workflows stays — nor of
// its email connection (journey-mail.js, loaded after this file).
function resetJourneyUI() {
  journeyFlows = []; journeyWebhooks = []; journeyManage = false; journeyFlowId = null; journeyFonio = false; journeyDrag = null;
  if (typeof resetJourneyMail === 'function') resetJourneyMail();
  if (typeof resetJourneyFixed === 'function') resetJourneyFixed();   // the integrations' workflows (journey-fixed.js, loaded after this file)
  if (typeof resetJourneyStart === 'function') resetJourneyStart();   // the fields a start chooses from (journey-start.js)
}

function journeyErrorText(res) {
  const code = res && res.code;
  return tf(JOURNEY_ERRORS[code] || 'jr_err_generic', { max: code === 'limit' ? journeyLimits.flows : journeyLimits.nodes, detail: (res && res.detail) || '' });
}
// What a step's test email was refused with, as a sentence. To that request "limit" says that the sending address's
// day is full (journey-mail.js); to every other one it is the number of workflows.
function journeyTestErrorText(res) { return res && res.code === 'limit' ? t('jm_err_limit') : journeyErrorText(res); }
// A request that never reached the server is a refusal like any other: said in the window, not thrown.
async function journeySend(call) { try { return await call(); } catch (e) { return { error: true }; } }

// "Right away", "after 20 min", "after 2 hours", "after 3 days": the largest unit the wait is a whole number of.
function journeyWaitText(minutes) {
  const m = Number(minutes) || 0;
  if (m <= 0) return t('jr_wait_now');
  if (m % 1440 === 0) return m === 1440 ? t('jr_wait_day') : tf('jr_wait_days', { n: m / 1440 });
  if (m % 60 === 0) return m === 60 ? t('jr_wait_hour') : tf('jr_wait_hours', { n: m / 60 });
  return tf('jr_wait_min', { n: m });
}
// A length of time by itself: "20 min", "2 hours", "3 days" — what a Wait box waits.
function journeyDurationText(minutes) {
  const m = Number(minutes) || 0;
  if (m && m % 1440 === 0) return m === 1440 ? t('jr_dur_day') : tf('jr_dur_days', { n: m / 1440 });
  if (m && m % 60 === 0) return m === 60 ? t('jr_dur_hour') : tf('jr_dur_hours', { n: m / 60 });
  return tf('jr_dur_min', { n: m });
}
// What a Wait box says: how long it waits and, when it then holds on, until which time of day on which days.
function journeyWaitLines(node) {
  const c = (node && node.config) || {}, m = Number(node && node.wait_minutes) || 0, until = typeof c.until === 'string' ? c.until : '';
  const title = until ? (m ? tf('jr_pause_for_until', { time: journeyDurationText(m), at: until }) : tf('jr_pause_until', { at: until })) : tf('jr_pause_for', { time: journeyDurationText(m) });
  const days = until && Array.isArray(c.weekdays) ? c.weekdays.filter(d => JOURNEY_WAIT_DAYS[d]).map(d => t(JOURNEY_WAIT_DAYS[d])) : [];
  return { title, text: days.length ? tf('jr_pause_days', { days: days.join(', ') }) : '' };
}
// The same wait as the form shows it: a number and its unit.
function journeyWaitParts(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  if (m && m % 1440 === 0) return { n: m / 1440, unit: 'days' };
  if (m && m % 60 === 0) return { n: m / 60, unit: 'hours' };
  return { n: m, unit: 'min' };
}
// What the form holds, as minutes; null when it is not a whole number from 0 to the route's limit.
function journeyWaitMinutes(n, unit) {
  const text = String(n ?? '').trim(), per = JOURNEY_UNITS[unit];
  if (!/^\d{1,6}$/.test(text) || !per) return null;
  const m = Number(text) * per;
  return m <= JOURNEY_MAX_WAIT ? m : null;
}

// The workspace's pipelines with their stages. A pipeline without stages comes from the server with one entry of
// nulls (routes/pipelines.js): that is no stage, and is left out of every list here.
function journeyPipelines() {
  return (Array.isArray(pipelines) ? pipelines : []).map(p => ({ ...p, stages: (Array.isArray(p.stages) ? p.stages : []).filter(s => s && s.id != null) }));
}
function journeyFlow() { return journeyFlows.find(f => f.id === journeyFlowId) || null; }
// A stage by its name — with its pipeline's when the workspace has more than one — or null when it is gone.
function journeyStageName(stageId) {
  const list = journeyPipelines();
  for (const p of list) {
    const s = (Array.isArray(p.stages) ? p.stages : []).find(x => x.id === stageId);
    if (s) return list.length > 1 ? tf('jr_stage_of', { stage: s.name, pipeline: p.name }) : s.name;
  }
  return null;
}
// A workflow's boxes as its lines order them, from the start: `chain` is every box a line leads to, in the order
// they are reached — behind a branch box (Part 11) its "yes" side first, then its "no" side — and `loose` are the
// boxes no line leads to. `at` says where the chain puts a box: its column and its row. A "no" side stands in the
// column right of everything its "yes" side needed; `width` is how many columns the whole chain came to.
function journeyLayout(flow) {
  const nodes = flow && Array.isArray(flow.nodes) ? flow.nodes : [];
  const byId = new Map(nodes.map(n => [n.id, n])), at = new Map(), chain = [];
  const walk = (n, col, row) => {
    for (; n && !at.has(n.id); n = byId.get(n.next_id), row++) {
      at.set(n.id, { col, row }); chain.push(n);
      if (n.kind !== 'branch') continue;
      const yes = walk(byId.get(n.next_id), col, row + 1), no = byId.get(n.else_id);
      return yes + (no && !at.has(no.id) ? walk(no, col + yes, row + 1) : 0);
    }
    return 1;
  };
  const width = walk(nodes.find(n => n.kind === 'start'), 0, 0);
  return { chain, loose: nodes.filter(n => !at.has(n.id)), at, width };
}
function journeyChain(flow) {
  const { chain, loose } = journeyLayout(flow);
  return { chain, loose };
}

// ── the board's geometry ────────────────────────────────────────────────────
// Where each box stands: { id: { x, y } }. A box that was dragged keeps its place; any other stands where the chain
// puts it — the start on top, each step under the one before, a branch box's "no" side in a column of its own — and
// a box no line leads to in the column beside all of that.
function journeyPlaces(flow) {
  const { chain, loose, at, width } = journeyLayout(flow), places = {};
  const own = n => (Number.isInteger(n.x) && Number.isInteger(n.y) ? { x: n.x, y: n.y } : null);
  const spot = (col, row) => ({ x: JOURNEY_PAD + col * (JOURNEY_BOX_W + 80), y: JOURNEY_PAD + row * JOURNEY_STEP_Y });
  chain.forEach(n => { places[n.id] = own(n) || spot(at.get(n.id).col, at.get(n.id).row); });
  loose.forEach((n, i) => { places[n.id] = own(n) || spot(width, i); });
  return places;
}
// The board is as large as its boxes need, with room to drag one further out.
function journeyCanvasSize(places) {
  const all = Object.values(places);
  return { w: Math.max(0, ...all.map(p => p.x)) + JOURNEY_BOX_W + 240, h: Math.max(0, ...all.map(p => p.y)) + 320 };
}
// The line from the foot of box a to the head of box b ({ x, y, w, h } each), as an SVG path: a soft curve. It
// leaves the foot at `part` of the box's width: the middle, unless the box has two lines (journeyPart).
function journeyLinePath(a, b, part = 0.5) {
  const x1 = Math.round(a.x + a.w * part), y1 = Math.round(a.y + a.h), x2 = Math.round(b.x + b.w / 2), y2 = Math.round(b.y);
  const bend = Math.max(36, Math.round(Math.abs(y2 - y1) / 2));
  return `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
}
const journeyClamp = v => Math.max(0, Math.min(JOURNEY_MAX_PLACE, Math.round(v)));
// Where on a box's foot one of its lines leaves, as a part of the box's width: the middle — for a branch box a
// quarter in from the left ("yes", its next_id) and a quarter in from the right ("no", its else_id).
function journeyPart(node, side) {
  return node && node.kind === 'branch' ? (side === 'else' ? 0.75 : 0.25) : 0.5;
}
// Every line of a workflow: from which box, along which of its lines ('next', or 'else' for a branch box's "no"),
// to which box, and where on the foot it leaves.
function journeyEdges(flow) {
  const edges = [];
  for (const n of flow && Array.isArray(flow.nodes) ? flow.nodes : []) {
    if (n.next_id) edges.push({ from: n.id, to: n.next_id, side: 'next', part: journeyPart(n, 'next') });
    if (n.kind === 'branch' && n.else_id) edges.push({ from: n.id, to: n.else_id, side: 'else', part: journeyPart(n, 'else') });
  }
  return edges;
}

async function loadJourney() {
  // the workflows, the stages a step can name, whether fonio is connected, which email address is (journey-mail.js),
  // and what the integrations do, as workflows nobody edits here (journey-fixed.js)
  const [data, list, fonio] = await Promise.all([api.get('/api/journey'), api.get('/api/pipelines'), api.get('/api/integrations/fonio'),
    typeof loadJourneyMail === 'function' ? loadJourneyMail() : null, typeof loadJourneyFixed === 'function' ? loadJourneyFixed() : null,
    typeof loadJourneyStart === 'function' ? loadJourneyStart() : null]);   // the fields a start can choose from (journey-start.js)
  if (Array.isArray(list)) pipelines = list;   // the stages may have changed in Settings since they were last read
  const ok = !!data && !data.error && Array.isArray(data.flows);
  journeyFlows    = ok ? data.flows : [];
  journeyWebhooks = ok && Array.isArray(data.webhooks) ? data.webhooks : [];
  journeyManage   = ok && !!data.can_manage;
  if (ok && Number.isInteger(data.max_flows) && Number.isInteger(data.max_nodes)) journeyLimits = { flows: data.max_flows, nodes: data.max_nodes };
  journeyFonio    = !!fonio && !fonio.error && !!fonio.configured;
  if (!journeyFlow()) journeyFlowId = journeyFlows.length ? journeyFlows[0].id : null;
  renderJourney();
  if (typeof journeyMailAfterLoad === 'function') journeyMailAfterLoad();   // back from Google's sign-in page: say how it went
}

// The server answers every change with the whole workflow: it takes its place here, and the page is drawn again.
function journeyApply(flow) {
  if (!flow || !Array.isArray(flow.nodes)) return;
  const i = journeyFlows.findIndex(f => f.id === flow.id);
  if (i < 0) journeyFlows.push(flow); else journeyFlows[i] = flow;
  journeyFlowId = flow.id;
  if (typeof journeyFixedPick === 'function') journeyFixedPick(null);   // one of the workspace's own is shown now
  renderJourney();
}
// The list of workflows chose: an id is one of the workspace's own, 'fx:<key>' one of an integration's (journey-fixed.js).
function setJourneyFlow(id) {
  if (typeof journeyFixedPick === 'function') journeyFixedPick(id);
  const f = journeyFlows.find(x => x.id === Number(id));
  if (f) journeyFlowId = f.id;
  renderJourney();
}

// One box. Pure apart from t()/tf()/icon(), the language and what is connected.
function journeyBoxHtml(node) {
  const head = `<span class="jr-ic">${icon(JOURNEY_ICONS[node.kind] || 'note')}</span>`;
  if (node.kind === 'start') {
    const [first, ...rest] = journeyStartLines(node);
    return `<button type="button" class="jr-box jr-start${node.config && node.config.trigger ? '' : ' is-empty'}" data-box="${Number(node.id)}" data-kind="start">${head}
        <span class="jr-what"><span class="jr-meta"><b>${esc(t('jr_kind_start'))}</b></span><span class="jr-title">${esc(first)}</span>${rest.map(l => `<span class="jr-text">${esc(l)}</span>`).join('')}</span>
      </button>`;
  }
  const pause = node.kind === 'wait' ? journeyWaitLines(node) : null;   // a Wait box says its time, and has no "after …" of its own
  const asks = node.kind === 'branch' ? journeyBranchLines(node) : null;   // a branch box says its question (journey-branch.js)
  const raw = String(node.body || ''), flat = pause ? pause.text : asks ? asks.text : (node.kind === 'email' ? raw.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ') : raw).replace(/\s+/g, ' ').trim();
  const title = pause ? pause.title : asks ? asks.title : node.kind === 'move' ? tf('jr_move_to', { stage: journeyStageName(node.config && node.config.stage_id) || t('jr_stage_gone') }) : node.title;
  const mailOn = typeof journeyMail !== 'undefined' && !!journeyMail && !!journeyMail.connection;
  const warn = node.kind === 'call' && !journeyFonio ? t('jr_warn_fonio') : node.kind === 'email' && !mailOn ? t('jr_warn_mail') : '';
  return `<button type="button" class="jr-box" data-box="${Number(node.id)}" data-kind="${esc(node.kind)}">${head}
      <span class="jr-what"><span class="jr-meta"><b>${esc(t('jr_kind_' + node.kind))}</b>${pause ? '' : `<span>${esc(journeyWaitText(node.wait_minutes))}</span>`}</span>
        <span class="jr-title">${esc(title)}</span>${flat ? `<span class="jr-text">${esc(flat.slice(0, 160))}</span>` : ''}${warn ? `<span class="jr-warn">${icon('alert')}${esc(warn)}</span>` : ''}</span>
    </button>`;
}

// The shown workflow on its board: every box at its place, for an owner or admin with the "+" under it. A branch
// box has two feet, "Yes" and "No", for everyone to read — for an owner or admin each is the handle of its line.
// The lines are drawn afterwards (journeyDrawLines), into the layer that lies under the boxes.
function journeyBoardHtml(flow) {
  const places = journeyPlaces(flow), size = journeyCanvasSize(places);
  const foot = (id, side, word, aria) => (journeyManage
    ? `<button type="button" class="jr-out jr-side is-${side === 'else' ? 'no' : 'yes'}" data-out="${Number(id)}" data-side="${side}" aria-label="${esc(t(aria))}" title="${esc(t(aria))}"><span>${esc(t(word))}</span>${icon('plus')}</button>`
    : `<span class="jr-side is-${side === 'else' ? 'no' : 'yes'}">${esc(t(word))}</span>`);
  const out = n => (n.kind === 'branch' ? foot(n.id, 'next', 'jr_side_yes', 'jr_out_yes_aria') + foot(n.id, 'else', 'jr_side_no', 'jr_out_no_aria')
    : journeyManage ? `<button type="button" class="jr-out" data-out="${Number(n.id)}" aria-label="${esc(t('jr_out_aria'))}" title="${esc(t('jr_out_aria'))}">${icon('plus')}</button>` : '');
  const nodes = (flow.nodes || []).map(n => `<div class="jr-node" data-node="${Number(n.id)}" style="left:${places[n.id].x}px;top:${places[n.id].y}px">${journeyBoxHtml(n)}${out(n)}</div>`).join('');
  return `<div class="jr-canvas${journeyManage ? ' can-edit' : ''}" style="width:${size.w}px;height:${size.h}px"><svg class="jr-lines" width="${size.w}" height="${size.h}" aria-hidden="true">${JOURNEY_ARROW}</svg>${nodes}</div>`;
}

// Every box's place and size on the board, read in one go: { id: { x, y, w, h } }.
function journeyRects(canvas) {
  const rects = {};
  for (const el of canvas.querySelectorAll('[data-node]')) rects[Number(el.dataset.node)] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  return rects;
}
// The lines of a workflow between boxes measured as `rects`. A line says which two boxes it joins and where it
// leaves the first — a drag redraws just the lines of the box it moves by that — and has, for an owner or admin, a
// wide unseen twin that takes the click which removes it. The last path is the line being drawn by hand.
function journeyLinesHtml(flow, rects) {
  return JOURNEY_ARROW + journeyEdges(flow).map(e => {
    const a = rects[e.from], b = rects[e.to];
    if (!a || !b) return '';
    const d = journeyLinePath(a, b, e.part), ends = `data-from="${Number(e.from)}" data-to="${Number(e.to)}" data-part="${e.part}"`;
    return `<path class="jr-line" ${ends} d="${d}" marker-end="url(#jr-arrow)"/>${journeyManage ? `<path class="jr-line-hit" data-line="${Number(e.from)}" data-side="${e.side}" ${ends} d="${d}"/>` : ''}`;
  }).join('') + '<path class="jr-line jr-line-new" id="jr-line-new" d="" marker-end="url(#jr-arrow)"/>';
}
// The lines, from each box to the box after it — from a branch box to both.
function journeyDrawLines() {
  const board = document.getElementById('journey-board'), flow = journeyFlow();
  const canvas = board && board.querySelector ? board.querySelector('.jr-canvas') : null;
  const layer = canvas ? canvas.querySelector('.jr-lines') : null;
  if (!layer || !flow) return;
  layer.innerHTML = journeyLinesHtml(flow, journeyRects(canvas));
}

// Above the board: which workflow is shown, whether it runs, what it did — and for an owner or admin its name and its end.
// With integrations set up the list has two groups: the workspace's own workflows, and what the integrations do
// (journey-fixed.js), which has a toolbar of its own.
function journeyToolbarHtml() {
  const fixed = typeof journeyFixedShown === 'function' ? journeyFixedShown() : null;
  const fixedOptions = typeof journeyFixedOptionsHtml === 'function' ? journeyFixedOptionsHtml() : '';
  if (!journeyFlows.length && !fixedOptions) return '';
  const flow = journeyFlow();
  const own = journeyFlows.map(f => `<option value="${Number(f.id)}"${!fixed && f.id === journeyFlowId ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  const pick = `<select class="select select-sm jr-pick" aria-label="${esc(t('jr_flow_aria'))}" onchange="setJourneyFlow(this.value)">${
    fixedOptions ? (own ? `<optgroup label="${esc(t('jr_group_own'))}">${own}</optgroup>` : '') + fixedOptions : own}</select>`;
  if (fixed) return pick + journeyFixedToolbarHtml(fixed);
  if (!flow) return pick;
  const state = t(flow.active ? 'jr_on' : 'jr_off');
  const run = journeyManage
    ? `<label class="jr-run"><input type="checkbox" class="switch" aria-label="${esc(t('jr_switch_aria'))}"${flow.active ? ' checked' : ''} onchange="setJourneyActive(this.checked)"><span>${esc(state)}</span></label>`
    : `<span class="badge${flow.active ? ' badge-success' : ''}">${esc(state)}</span>`;
  const activity = `<button type="button" class="btn btn-ghost btn-sm" onclick="openJourneyActivity()">${icon('activity')}<span>${esc(t('jr_activity'))}</span></button>`;
  const tools = journeyManage
    ? `<button type="button" class="btn btn-ghost btn-sm" onclick="journeyNameWindow(journeyFlow())">${icon('pencil')}<span>${esc(t('jr_rename'))}</span></button>
       <button type="button" class="btn btn-danger-ghost btn-sm" onclick="deleteJourneyFlow()">${icon('trash')}<span>${esc(t('jr_delete_flow'))}</span></button>`
    : '';
  return pick + run + activity + tools + (journeyManage ? `<span class="jr-hint">${esc(t('jr_board_hint'))}</span>` : '');
}

function renderJourney() {
  const board = document.getElementById('journey-board'); if (!board) return;
  const flow = journeyFlow();
  const actions = document.getElementById('journey-actions');
  // the email address the workflows send from (journey-mail.js) and the record of everything they did
  // (journey-history.js), for everyone; "New workflow" for an owner or admin
  if (actions) actions.innerHTML = (typeof journeyMailButtonHtml === 'function' ? journeyMailButtonHtml() : '') + (typeof journeyHistoryButtonHtml === 'function' ? journeyHistoryButtonHtml() : '') + (journeyManage
    ? `<button type="button" class="btn btn-primary btn-sm" onclick="journeyNameWindow(null)">${icon('plus')}<span>${esc(t('jr_new'))}</span></button>`
    : '');
  const tools = document.getElementById('journey-toolbar');
  if (tools) tools.innerHTML = journeyToolbarHtml();
  const fixed = typeof journeyFixedShown === 'function' ? journeyFixedShown() : null;   // a workflow of an integration: read here, not edited
  board.innerHTML = fixed ? journeyFixedBoardHtml(fixed) : flow
    ? journeyBoardHtml(flow)
    : `<div class="empty">${icon('journey')}<b>${esc(t('jr_empty_title'))}</b><div>${esc(t('jr_empty_hint'))}${journeyManage ? '' : ' ' + esc(t('jr_empty_member'))}</div></div>`;
  journeyDrawLines();
}

// ── running ─────────────────────────────────────────────────────────────────
async function setJourneyActive(on) {
  const flow = journeyFlow();
  if (!flow || !journeyManage) return;
  const res = await journeySend(() => api.put(`/api/journey/flows/${flow.id}`, { active: !!on }));
  if (!res || res.error || !res.flow) { ui.toast(journeyErrorText(res)); return renderJourney(); }   // the switch goes back to what is true
  journeyApply(res.flow);
  ui.toast(t(res.flow.active ? 'jr_switched_on' : 'jr_switched_off'));
}

// A moment as the page's language writes it: "19 Nov 2026, 10:00".
function journeyWhen(v) {
  return v ? new Date(v).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
// What a step is called in a list: its kind and its title ("Email: Welcome"). A kind this page does not know says its title alone.
function journeyStepText(r) {
  const kind = r && r.kind ? 'jr_kind_' + r.kind : '', word = kind && t(kind) !== kind ? t(kind) : '';
  return `${word}${r && r.title ? `${word ? ': ' : ''}${r.title}` : ''}`;
}
// The engine's short word about a step as a sentence. What Google answered to a refused email is said as Google
// said it; a word nobody knows is shown as it is.
function journeyDetailText(d) {
  return !d ? '' : Object.hasOwn(JOURNEY_DETAILS, d) ? t(JOURNEY_DETAILS[d]) : String(d).startsWith('rejected: ') ? tf('jr_d_rejected', { detail: String(d).slice(10) }) : String(d);
}
// The top of the "Activity" window: how many deals wait, are through or were stopped, and who waits for which step.
// What happened so far stands under it: the workflow's record (journey-history.js).
function journeyActivityHtml(data) {
  const counts = (data && data.counts) || {}, waiting = (data && Array.isArray(data.waiting) ? data.waiting : []);
  const row = (deal, what, tail) => `<li class="jr-act-row"><b>${esc(deal || '')}</b><span>${esc(what)}</span><span class="jr-act-tail">${esc(tail)}</span></li>`;
  return `<div class="jr-act">
      <p class="jr-act-counts">${esc(tf('jr_act_counts', { waiting: (counts.waiting || 0) + (counts.working || 0), done: counts.done || 0, stopped: counts.stopped || 0 }))}</p>
      <h3 class="jr-act-head">${esc(t('jr_act_waiting'))}</h3>
      ${waiting.length ? `<ul class="jr-act-list">${waiting.map(r => row(r.deal_title, journeyStepText(r), tf('jr_act_due', { when: journeyWhen(r.due_at) }))).join('')}</ul>` : `<p class="help">${esc(t('jr_act_none_waiting'))}</p>`}
    </div>`;
}
async function openJourneyActivity() {
  const flow = journeyFlow();
  if (!flow) return null;
  const data = await journeySend(() => api.get(`/api/journey/flows/${flow.id}/activity`));
  if (!data || data.error) { ui.toast(journeyErrorText(data)); return null; }
  const title = tf('jr_activity_title', { name: flow.name }), head = journeyActivityHtml(data);
  // under what waits now: everything that happened in this workflow, to look through and search (journey-history.js)
  if (typeof openJourneyHistory === 'function') return openJourneyHistory({ flowId: flow.id, title, head });
  return ui.modal({ title, size: 'lg', body: head, footer: `<button class="btn btn-secondary" data-close autofocus>${esc(t('btn_close'))}</button>` });
}

// "Add to a workflow", from a deal's menu: the workflows that run, one to choose. The deal then starts
// at that workflow's first step, whatever its start says.
async function journeyIncludeDeal(dealId, dealTitle) {
  const data = await journeySend(() => api.get('/api/journey'));
  const running = data && !data.error && Array.isArray(data.flows) ? data.flows.filter(f => f.active) : [];
  if (!running.length) { ui.toast(t('jr_include_none')); return null; }
  const m = ui.modal({ title: t('jr_include'), size: 'sm',
    body: `<div class="jr-inc"><p class="help">${esc(t('jr_include_hint'))}</p>${running.map(f => `<button type="button" class="btn btn-secondary jr-inc-flow" data-jr-include="${Number(f.id)}">${icon('journey')}<span class="truncate">${esc(f.name)}</span></button>`).join('')}</div>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button>` });
  on(m.el, 'click', '[data-jr-include]', async (e, btn) => {
    const flow = running.find(f => f.id === Number(btn.dataset.jrInclude));
    const res = await journeySend(() => api.post(`/api/journey/flows/${flow.id}/include`, { deal_id: Number(dealId) }));
    m.close();
    ui.toast(!res || res.error ? journeyErrorText(res) : tf('jr_included', { deal: dealTitle || '', name: flow.name }));
  });
  return m;
}

// ── the windows ─────────────────────────────────────────────────────────────
// A small form window: the shared part of the three windows below. read(el, root) reads it; save(now, fail, done) sends it.
function journeyWindow({ title, body, start, read, save, remove, size = 'md' }) {
  const fid = 'jr-' + uid();
  const m = ui.modal({ title, size,
    body: `<form id="${fid}" novalidate class="col" style="gap:14px;padding-top:4px">${body(fid)}<div class="error-text" id="${fid}-err" role="alert" hidden></div></form>`,
    footer: `${remove ? `<button class="btn btn-danger-ghost jr-foot-left" data-jr-delete>${esc(t('btn_delete'))}</button>` : ''}<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" data-jr-save>${esc(t('btn_save'))}</button>`,
    // typed and not saved: the same question as for a note (detail-views.js)
    beforeClose: () => { const now = read(el, m.el); return JSON.stringify(now) === JSON.stringify(start) || typeof dvConfirmUnsaved !== 'function' || dvConfirmUnsaved(); } });
  const el = part => m.el.querySelector(`#${fid}-${part}`);
  // core.js holds a form for ten seconds after it was submitted, so that Enter pressed twice saves once. A window that
  // answers "this is missing" has saved nothing: it lets the form go, or the next Enter would do nothing.
  const fail = (text, part) => {
    const e = el('err'); e.textContent = text; e.hidden = false; if (part && el(part)) el(part).focus();
    const form = m.el.querySelector(`#${fid}`); if (form) form._submitting = false;
  };
  const done = (res, said) => {
    if (!res || res.error) { fail(journeyErrorText(res)); return false; }
    m.close();   // saved: closed without the question
    ui.toast(t(said));
    return true;
  };
  on(m.el, 'click', '[data-jr-save]', () => save(read(el, m.el), fail, done));
  on(m.el, 'click', '[data-jr-delete]', () => remove(fail, done));
  on(m.el, 'submit', 'form', e => { e.preventDefault(); save(read(el, m.el), fail, done); });
  on(m.el, 'input', 'input, select, textarea', () => { el('err').hidden = true; });
  return { m, el };
}
const journeyOption = (value, label, chosen) => `<option value="${esc(value)}"${String(value) === String(chosen) ? ' selected' : ''}>${esc(label)}</option>`;
// Every stage of the workspace as the options of a list, under its pipeline's name.
function journeyStageOptions(chosen) {
  return journeyPipelines().map(p => `<optgroup label="${esc(p.name)}">${(Array.isArray(p.stages) ? p.stages : []).map(s => journeyOption(s.id, s.name, chosen)).join('')}</optgroup>`).join('');
}

// A workflow's name: a new workflow (flow null), or another name for one.
function journeyNameWindow(flow) {
  if (!journeyManage) return null;
  const start = { name: flow ? flow.name : '' };
  return journeyWindow({ title: t(flow ? 'jr_name_title' : 'jr_new'), size: 'sm', start,
    body: fid => `<div class="field"><label class="label" for="${fid}-name">${esc(t('jr_f_name'))}</label>
        <input class="input" id="${fid}-name" maxlength="${JOURNEY_MAX_NAME}" autocomplete="off" placeholder="${esc(t('jr_f_name_ph'))}" value="${esc(start.name)}" autofocus></div>`,
    read: el => ({ name: el('name').value.trim() }),
    save: async (now, fail, done) => {
      if (!now.name) return fail(t('jr_err_name'), 'name');
      const res = await journeySend(() => (flow ? api.put(`/api/journey/flows/${flow.id}`, now) : api.post('/api/journey/flows', now)));
      if (done(res, 'jr_flow_saved')) journeyApply(res.flow);
    } }).m;
}

async function deleteJourneyFlow() {
  const flow = journeyFlow();
  if (!flow || !journeyManage) return;
  const ok = await ui.confirm({ title: t('jr_flow_delete_q'), message: tf('jr_flow_delete_msg', { name: flow.name }), confirmLabel: t('btn_delete'), danger: true });
  if (!ok) return;
  const res = await journeySend(() => api.del(`/api/journey/flows/${flow.id}`));
  if (!res || (res.error && res.code !== 'not_found')) return ui.toast(journeyErrorText(res));   // deleted by a colleague meanwhile is deleted all the same
  journeyFlows = journeyFlows.filter(f => f.id !== flow.id);
  journeyFlowId = journeyFlows.length ? journeyFlows[0].id : null;
  renderJourney();
  ui.toast(t('jr_flow_deleted'));
}

// "Add step": the kinds of step, under the "+" that was pressed. The new step goes in right behind that box — behind
// a branch box on the side whose handle it was (side 'else': its "no" line).
function openJourneyAdd(afterId, anchor, side) {
  if (!journeyManage || !journeyFlow()) return;
  const behind = side === 'else' ? { afterId, side: 'else' } : { afterId };
  ui.menu(anchor, [{ heading: t('jr_add') }, ...JOURNEY_ACTIONS.map(kind => ({ label: t('jr_kind_' + kind), icon: JOURNEY_ICONS[kind], onSelect: () => openJourneyBox(null, { kind, ...behind }) }))]);
}
// Where a new step goes, as the route is told: behind which box, and on a branch box's "no" side when that was chosen.
function journeyBehind(fresh) {
  const after_id = fresh.afterId == null ? null : Number(fresh.afterId);
  return fresh.side === 'else' ? { after_id, side: 'else' } : { after_id };
}

// An email's text as the preview frame shows it: every variable filled with a sample value (journey-vars.js) — or,
// with `bare`, as for a contact about whom nothing is known, which is where a fallback is seen. Plain text keeps its
// line breaks; HTML is taken as it is — the frame is sandboxed, so nothing in it can run — and what a variable is
// filled with is text in it, never markup. footer: with the small "no more emails" line the server puts at the end
// (utils/journey-run.js emailParts — the email's own words, German like every automatic email).
function journeyPreviewHtml(body, bare = false, footer = false) {
  const raw = String(body || ''), html = /<\/?[a-z][^<>]*>/i.test(raw), values = journeyVarSample(new Date(), bare);
  const inner = html ? journeyVarFill(raw, values, { html: true, fields: !bare })
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0F141C">${esc(journeyVarFill(raw, values, { fields: !bare })).replace(/\r?\n/g, '<br>')}</div>`;
  const line = footer ? '<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6E7A8C;margin-top:28px">Keine weiteren E-Mails erhalten: <a href="#" style="color:#6E7A8C">abmelden</a></p>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:14px;background:#fff">${inner}${line}</body></html>`;
}

// A box's window. The start has its own. An owner or admin gets the form (id null: a new step of fresh.kind, behind
// fresh.afterId); everyone else reads the box.
function openJourneyBox(id, fresh) {
  const flow = journeyFlow();
  const node = id == null ? null : (flow ? flow.nodes.find(n => n.id === Number(id)) : null) || null;
  if (!flow || (id != null && !node) || (!node && (!journeyManage || !fresh || !JOURNEY_ACTIONS.includes(fresh.kind)))) return null;
  if (node && node.kind === 'start') return openJourneyStart(node);
  if (!journeyManage) return journeyBoxView(node);
  if ((node ? node.kind : fresh.kind) === 'wait') return openJourneyWait(node, fresh);
  if ((node ? node.kind : fresh.kind) === 'branch') return openJourneyBranch(node, fresh);   // its question and its window: journey-branch.js

  const kind = node ? node.kind : fresh.kind, move = kind === 'move', email = kind === 'email', wait = journeyWaitParts(node ? node.wait_minutes : 0);
  const start = { n: String(wait.n), unit: wait.unit, title: node ? node.title : kind === 'call' ? t('jr_call_default') : '', text: node ? String(node.body || '') : '',
    stage: move ? String((node && node.config && node.config.stage_id) || '') : '' };
  // an email's small "no more emails" line at the end: always there while the text has no link of its own; with
  // one, only when the step was saved so (the server's own rule: utils/journey-run.js emailParts)
  if (email) start.footer = !journeyVarHas(start.text, 'unsubscribe') || !!(node && node.config && node.config.footer === true);
  const mailOn = typeof journeyMail !== 'undefined' && !!journeyMail && !!journeyMail.connection;
  const hint = kind === 'call' ? `<p class="help">${esc(t('jr_hint_call'))}${journeyFonio ? '' : ` <b class="jr-bad">${esc(t('jr_warn_fonio'))}</b>`}</p>`
    : email && !mailOn ? `<p class="help"><b class="jr-bad">${esc(t('jr_warn_mail'))}</b></p>` : '';
  // a step whose texts are filled in for each contact: the variables to put in (journey-vars.js). An email besides:
  // a preview — its subject, its text, and both again for a contact about whom nothing is known — and the saved step
  // sent once to the person's own address
  const vars = JOURNEY_VAR_KINDS.includes(kind);
  const extras = fid => (vars ? journeyVarBarHtml(fid) : '') + (!email ? '' : `
    <div class="field"><label class="jr-check"><input type="checkbox" id="${fid}-footer"${start.footer ? ' checked' : ''}><span>${esc(t('jr_footer'))}</span></label>
      <p class="help" id="${fid}-footer-hint"></p></div>
    <div class="field"><span class="label">${esc(t('jr_preview'))}</span><p class="jr-subject" id="${fid}-psubject"></p>
      <iframe class="jr-preview" id="${fid}-preview" sandbox="" title="${esc(t('jr_preview'))}"></iframe>
      <label class="jr-check"><input type="checkbox" id="${fid}-bare"><span>${esc(t('jv_bare'))}</span></label><p class="help">${esc(t('jr_preview_hint'))}</p></div>
    ${node ? `<div class="jr-test"><button type="button" class="btn btn-secondary btn-sm" data-jr-test>${icon('send')}<span>${esc(t('jr_test'))}</span></button><span class="help">${esc(t('jr_test_saved_hint'))}</span></div>
      <p class="jr-test-note" id="${fid}-note" role="status" hidden></p>` : ''}`);
  const w = journeyWindow({ title: `${t(node ? 'jr_title_edit' : 'jr_title_add')}: ${t('jr_kind_' + kind)}`, size: email ? 'xl' : 'lg', start, remove: node ? async (fail, done) => {
      const ok = await ui.confirm({ title: t('jr_delete_q'), message: tf('jr_delete_msg', { title: move ? t('jr_kind_move') : node.title }), confirmLabel: t('btn_delete'), danger: true });
      if (!ok) return;
      const res = await journeySend(() => api.del(`/api/journey/nodes/${node.id}`));
      if (res && res.error && res.code === 'not_found') { done({}, 'jr_deleted'); return loadJourney(); }   // deleted by a colleague meanwhile: deleted all the same, read again
      if (done(res, 'jr_deleted')) journeyApply(res.flow);
    } : null,
    body: fid => `<div class="field"><label class="label" for="${fid}-n">${esc(t('jr_f_wait'))}</label>
          <div class="row jr-wait"><input class="input" id="${fid}-n" type="number" min="0" step="1" inputmode="numeric" value="${esc(start.n)}">
            <select class="select" id="${fid}-unit" aria-label="${esc(t('jr_unit_aria'))}">${Object.keys(JOURNEY_UNITS).map(u => journeyOption(u, t('jr_unit_' + u), start.unit)).join('')}</select></div>
          <p class="help">${esc(t('jr_f_wait_hint'))}</p></div>
        ${move ? `<div class="field"><label class="label" for="${fid}-stage">${esc(t('jr_f_stage'))}</label>
          <select class="select" id="${fid}-stage" autofocus><option value="">${esc(t('jr_opt_choose'))}</option>${journeyStageOptions(start.stage)}</select></div>`
        : `<div class="field"><label class="label" for="${fid}-title">${esc(t(email ? 'jr_f_subject' : 'jr_f_title'))}</label>
          <input class="input" id="${fid}-title" maxlength="${JOURNEY_MAX_TITLE}" autocomplete="off" value="${esc(start.title)}" autofocus></div>
        <div class="field"><label class="label" for="${fid}-text">${esc(t(email ? 'jr_f_text_email' : kind === 'call' ? 'jr_f_text_call' : 'jr_f_text'))}</label>
          <textarea class="textarea${email ? ' jr-code' : ''}" id="${fid}-text" rows="${email ? 12 : 8}" maxlength="${JOURNEY_MAX_TEXT}" spellcheck="${email ? 'false' : 'true'}">\n${esc(start.text)}</textarea></div>`}${extras(fid)}${hint}`,   // the line break after the tag is the one a browser drops: the text's own first line stays
    read: el => ({ n: el('n').value.trim(), unit: el('unit').value, title: move ? '' : el('title').value.trim(), text: move ? '' : el('text').value, stage: move ? el('stage').value : '',
      ...(email ? { footer: !!el('footer').checked } : {}) }),
    save: async (now, fail, done) => {
      const minutes = journeyWaitMinutes(now.n, now.unit);
      if (minutes === null) return fail(t('jr_err_wait'), 'n');
      if (move && !now.stage) return fail(t('jr_err_stage'), 'stage');
      if (!move && !now.title) return fail(t('jr_err_title'), 'title');
      const body = { title: now.title, body: now.text, wait_minutes: minutes, config: move ? { stage_id: Number(now.stage) } : email ? { footer: now.footer } : {} };
      const res = await journeySend(() => (node ? api.put(`/api/journey/nodes/${node.id}`, body) : api.post(`/api/journey/flows/${flow.id}/nodes`, { ...body, kind, ...journeyBehind(fresh) })));
      if (done(res, 'jr_saved')) journeyApply(res.flow);
    } });
  // the preview: the text in its frame, the subject in a line above it — with sample values, or as for a contact
  // about whom nothing is known when that is ticked
  const show = () => {
    const frame = w.el('preview'), line = w.el('psubject'), bare = !!(w.el('bare') && w.el('bare').checked);
    // the line at the end can be switched off only while the text has its own link; without one it is on, and locked
    const box = w.el('footer'), hint = w.el('footer-hint'), own = journeyVarHas(w.el('text').value, 'unsubscribe');
    if (box) { if (!own) box.checked = true; box.disabled = !own; }
    if (hint) hint.textContent = tf(own ? 'jr_footer_own' : 'jr_footer_need', { name: journeyVarWord('unsubscribe') });
    if (frame) frame.srcdoc = journeyPreviewHtml(w.el('text').value, bare, !box || !!box.checked);
    if (line) line.textContent = tf('jv_preview_subject', { subject: journeyVarFill(w.el('title').value, journeyVarSample(new Date(), bare), { fields: !bare }) });
  };
  if (vars) journeyVarWire(w, kind, email ? show : null);   // a variable that is put in changes the preview too
  if (email) {
    on(w.m.el, 'input', 'textarea', show);
    on(w.m.el, 'input', 'input', show);                 // the subject
    on(w.m.el, 'change', '[type="checkbox"]', show);    // "for a contact about whom nothing is known", and the line at the end
    on(w.m.el, 'click', '[data-jr-test]', async (e, btn) => {
      const note = w.el('note');
      const say = (text, bad) => { if (!note) return; note.textContent = text; note.hidden = !text; if (note.classList) note.classList.toggle('bad', !!bad); };
      btn.disabled = true; say(t('jr_test_sending'));
      const res = await journeySend(() => api.post(`/api/journey/nodes/${node.id}/test`, {}));
      btn.disabled = false;
      say(!res || res.error || !res.success ? journeyTestErrorText(res) : tf('jr_test_ok', { to: res.to }), !res || !!res.error || !res.success);
    });
    show();
  }
  return w.m;
}

// A Wait box's window (Part 10): how long nothing happens and, if wanted, the time of day — on chosen weekdays — it
// then holds on until. node null: a new one, behind fresh.afterId.
function openJourneyWait(node, fresh) {
  const flow = journeyFlow(), c = (node && node.config) || {}, wait = journeyWaitParts(node ? node.wait_minutes : 1440);
  const start = { n: String(wait.n), unit: wait.unit, then: c.until ? 'until' : 'now', at: String(c.until || '09:00'), days: Array.isArray(c.weekdays) ? [...c.weekdays].sort((a, b) => a - b) : [] };
  const w = journeyWindow({ title: `${t(node ? 'jr_title_edit' : 'jr_title_add')}: ${t('jr_kind_wait')}`, size: 'md', start, remove: node ? async (fail, done) => {
      const ok = await ui.confirm({ title: t('jr_delete_q'), message: tf('jr_delete_msg', { title: journeyWaitLines(node).title }), confirmLabel: t('btn_delete'), danger: true });
      if (!ok) return;
      const res = await journeySend(() => api.del(`/api/journey/nodes/${node.id}`));
      if (res && res.error && res.code === 'not_found') { done({}, 'jr_deleted'); return loadJourney(); }
      if (done(res, 'jr_deleted')) journeyApply(res.flow);
    } : null,
    body: fid => `<div class="field"><label class="label" for="${fid}-n">${esc(t('jr_f_wait_long'))}</label>
          <div class="row jr-wait"><input class="input" id="${fid}-n" type="number" min="0" step="1" inputmode="numeric" value="${esc(start.n)}" autofocus>
            <select class="select" id="${fid}-unit" aria-label="${esc(t('jr_unit_aria'))}">${Object.keys(JOURNEY_UNITS).map(u => journeyOption(u, t('jr_unit_' + u), start.unit)).join('')}</select></div>
          <p class="help">${esc(t('jr_f_wait_long_hint'))}</p></div>
        <div class="field"><label class="label" for="${fid}-then">${esc(t('jr_f_wait_then'))}</label>
          <select class="select" id="${fid}-then">${journeyOption('now', t('jr_opt_wait_now'), start.then)}${journeyOption('until', t('jr_opt_wait_until'), start.then)}</select></div>
        <div class="field" id="${fid}-w-at"><label class="label" for="${fid}-at">${esc(t('jr_f_wait_at'))}</label>
          <input class="input jt-num" id="${fid}-at" type="time" value="${esc(start.at)}"><p class="help">${esc(t('jr_pause_at_hint'))}</p></div>
        <div class="field" id="${fid}-w-days"><span class="label">${esc(t('jr_f_wait_days'))}</span>
          <div class="jt-days">${Object.keys(JOURNEY_WAIT_DAYS).map(d => `<label class="jr-check"><input type="checkbox" data-jr-day value="${d}"${start.days.includes(Number(d)) ? ' checked' : ''}><span>${esc(t(JOURNEY_WAIT_DAYS[d]))}</span></label>`).join('')}</div>
          <p class="help">${esc(t('jr_pause_days_hint'))}</p></div>`,
    read: (el, root) => ({ n: el('n').value.trim(), unit: el('unit').value, then: el('then').value, at: el('at').value,
      days: el('then').value === 'until' ? [...root.querySelectorAll('[data-jr-day]')].filter(b => b.checked).map(b => Number(b.value)).sort((a, b) => a - b) : start.days }),
    save: async (now, fail, done) => {
      const minutes = journeyWaitMinutes(now.n, now.unit), until = now.then === 'until';
      if (minutes === null) return fail(t('jr_err_wait'), 'n');
      if (until && !/^([01]\d|2[0-3]):[0-5]\d$/.test(now.at)) return fail(t('jr_err_until'), 'at');
      if (!minutes && !until) return fail(t('jr_err_wait_none'), 'n');
      const body = { title: '', body: '', wait_minutes: minutes, config: until ? { until: now.at, weekdays: now.days } : {} };
      const res = await journeySend(() => (node ? api.put(`/api/journey/nodes/${node.id}`, body) : api.post(`/api/journey/flows/${flow.id}/nodes`, { ...body, kind: 'wait', ...journeyBehind(fresh) })));
      if (done(res, 'jr_saved')) journeyApply(res.flow);
    } });
  const sync = () => { const until = w.el('then').value === 'until'; w.el('w-at').hidden = !until; w.el('w-days').hidden = !until; };
  on(w.m.el, 'change', 'select', sync);
  sync();
  return w.m;
}

// A box, to read: for everyone who may not change workflows, and for a start while its workflow runs (why: the line under it).
function journeyBoxView(node, why = 'jr_err_forbidden') {
  const startBox = node.kind === 'start', lines = startBox ? journeyStartLines(node) : [], pause = node.kind === 'wait' ? journeyWaitLines(node) : node.kind === 'branch' ? journeyBranchLines(node) : null;   // a box that says itself in two lines
  const timed = !startBox && node.kind !== 'wait';   // a Wait box is its own time
  const title = startBox ? lines[0] : pause ? pause.title : node.kind === 'move' ? tf('jr_move_to', { stage: journeyStageName(node.config && node.config.stage_id) || t('jr_stage_gone') }) : node.title;
  return ui.modal({ title: t('jr_title_view'), size: 'md',
    body: `<div class="jr-view" data-kind="${esc(node.kind)}">
        <p class="jr-meta"><b>${esc(t('jr_kind_' + node.kind))}</b>${timed ? `<span>${esc(journeyWaitText(node.wait_minutes))}</span>` : ''}</p>
        <h3 class="jr-view-title">${esc(title)}</h3>
        ${startBox ? lines.slice(1).map(l => `<p class="jr-view-text">${esc(l)}</p>`).join('') : pause ? (pause.text ? `<p class="jr-view-text">${esc(pause.text)}</p>` : '') : node.body ? `<p class="jr-view-text">${esc(node.body)}</p>` : ''}
        <p class="help">${esc(t(why))}</p></div>`,
    footer: `<button class="btn btn-secondary" data-close autofocus>${esc(t('btn_close'))}</button>` });
}

// ── the board's hands ───────────────────────────────────────────────────────
// A box is moved by dragging it; a line is drawn by dragging a box's "+" onto another box. A press that does not move
// is a click: on a box it opens its window, on a "+" the list of steps to add, on a line the way to take it away.
async function journeyDropBox(d) {
  const flow = journeyFlow(), node = flow && flow.nodes.find(n => n.id === d.id);
  if (!node) return;
  node.x = d.nx; node.y = d.ny;
  renderJourney();   // the board grows with the box, and the lines follow it
  const res = await journeySend(() => api.put(`/api/journey/nodes/${d.id}/place`, { x: d.nx, y: d.ny }));
  if (!res || res.error) ui.toast(journeyErrorText(res));
}
// d.side 'else': the line is a branch box's "no" line.
async function journeyDropLine(d, targetId) {
  if (!targetId || targetId === d.id) return renderJourney();
  const res = await journeySend(() => api.put(`/api/journey/nodes/${d.id}/next`, d.side === 'else' ? { next_id: targetId, side: 'else' } : { next_id: targetId }));
  if (!res || res.error || !res.flow) { ui.toast(journeyErrorText(res)); return renderJourney(); }
  journeyApply(res.flow);
}
async function journeyRemoveLine(fromId, side) {
  const res = await journeySend(() => api.put(`/api/journey/nodes/${fromId}/next`, side === 'else' ? { next_id: null, side: 'else' } : { next_id: null }));
  if (!res || res.error || !res.flow) return ui.toast(journeyErrorText(res));
  journeyApply(res.flow);
}

// A drag begins — the pointer moved far enough to be one. What the drag needs is read ONCE, here: every box's place
// and size, and for a box the lines that touch it. Nothing is measured again until it ends.
function journeyDragBegin(d) {
  if (d.canvas.isConnected === false) return false;   // the board was drawn again since the press: its boxes are gone, there is nothing to measure
  d.moved = true;
  d.rects = journeyRects(d.canvas);
  d.board = d.canvas.parentElement || null;           // what scrolls: where it stood when the drag began
  d.sl = d.board ? d.board.scrollLeft : 0; d.st = d.board ? d.board.scrollTop : 0;
  if (d.kind === 'box') {
    d.lines = [...d.canvas.querySelectorAll(`[data-from="${d.id}"], [data-to="${d.id}"]`)];
    d.el.classList.add('is-dragging');
  } else {
    const flow = journeyFlow();
    d.part = journeyPart(flow && flow.nodes.find(n => n.id === d.id), d.side);
    d.line = d.canvas.querySelector('#jr-line-new');
  }
  return true;
}
// A drag ends with nothing dropped: its frame is not drawn, and a board it had changed is drawn as it was.
function journeyDragDrop(d) {
  if (d.frame) cancelAnimationFrame(d.frame);
  if (d.moved) renderJourney();
}
// One frame of a drag, however many times the pointer reported since the last one. A dragged box is moved as a
// transform — its left and top stay as they are, so the page lays nothing out — and only the lines that touch it
// are drawn again, between the places read when the drag began. A line being drawn follows the pointer.
function journeyDragPaint(d) {
  d.frame = 0;
  const from = d.rects[d.id];
  if (!from) return;
  if (d.kind === 'box') {
    // the board may have been scrolled with the wheel while the box is held: the box stays under the pointer
    const sx = d.board ? d.board.scrollLeft - d.sl : 0, sy = d.board ? d.board.scrollTop - d.st : 0;
    d.nx = journeyClamp(from.x + d.dx + sx); d.ny = journeyClamp(from.y + d.dy + sy);
    d.el.style.transform = `translate3d(${d.nx - from.x}px,${d.ny - from.y}px,0)`;
    const now = { x: d.nx, y: d.ny, w: from.w, h: from.h };
    for (const line of d.lines) {
      const a = Number(line.dataset.from), b = Number(line.dataset.to), ra = a === d.id ? now : d.rects[a], rb = b === d.id ? now : d.rects[b];
      if (ra && rb) line.setAttribute('d', journeyLinePath(ra, rb, Number(line.dataset.part) || 0.5));
    }
  } else if (d.line) {
    const box = d.canvas.getBoundingClientRect();
    d.line.setAttribute('d', journeyLinePath(from, { x: d.cx - box.left, y: d.cy - box.top, w: 0, h: 0 }, d.part));
  }
}

document.addEventListener('pointerdown', e => {
  if (!journeyManage || e.button !== 0 || !e.target.closest) return;
  const canvas = e.target.closest('#journey-board .jr-canvas');
  if (!canvas) return;
  const out = e.target.closest('[data-out]'), node = e.target.closest('[data-node]');
  const held = { sx: e.clientX, sy: e.clientY, moved: false, canvas, frame: 0 };
  if (out) journeyDrag = { ...held, kind: 'line', id: Number(out.dataset.out), side: out.dataset.side === 'else' ? 'else' : 'next' };
  else if (node) journeyDrag = { ...held, kind: 'box', id: Number(node.dataset.node), el: node };
});
document.addEventListener('pointermove', e => {
  const d = journeyDrag;
  if (!d) return;
  // the button was let go where the page did not see it (a menu of the system, another window): nothing is held any
  // more — without this the box would follow the pointer until the next click dropped it somewhere
  if (!(e.buttons & 1)) { journeyDrag = null; return journeyDragDrop(d); }
  const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
  if (!d.moved && Math.hypot(dx, dy) < 5) return;   // a press that barely moves is still a click
  if (!d.moved && !journeyDragBegin(d)) { journeyDrag = null; return; }
  e.preventDefault();
  d.dx = dx; d.dy = dy; d.cx = e.clientX; d.cy = e.clientY;   // only noted here …
  if (!d.frame) d.frame = requestAnimationFrame(() => journeyDragPaint(d));   // … and drawn once per frame
});
document.addEventListener('pointerup', e => {
  const d = journeyDrag;
  journeyDrag = null;
  if (!d || !d.moved) return;
  journeyDragEnd = Date.now();
  if (d.frame) cancelAnimationFrame(d.frame);
  if (d.kind === 'box') {
    d.dx = e.clientX - d.sx; d.dy = e.clientY - d.sy;
    journeyDragPaint(d);   // where the pointer was let go, not where the last frame happened to be
    return Number.isInteger(d.nx) && Number.isInteger(d.ny) ? journeyDropBox(d) : renderJourney();
  }
  const under = document.elementFromPoint(e.clientX, e.clientY), target = under && under.closest ? under.closest('[data-node]') : null;
  journeyDropLine(d, target ? Number(target.dataset.node) : null);
});
// The browser took the pointer away (a touch it turned into something else, a pointer that was lost): nothing was
// dropped, and the board is drawn as it was.
document.addEventListener('pointercancel', () => {
  const d = journeyDrag;
  journeyDrag = null;
  if (d) journeyDragDrop(d);
});

// Every box opens its window here, every "+" the list of steps to add, and every line the way to take it away.
document.addEventListener('click', e => {
  const board = e.target && e.target.closest ? e.target.closest('#journey-board') : null;
  if (!board) return;
  if (Date.now() - journeyDragEnd < 350) return;   // the click that ends a drag
  const add = e.target.closest('[data-out]'), box = e.target.closest('[data-box]'), line = e.target.closest('[data-line]');
  if (add) openJourneyAdd(Number(add.dataset.out), add, add.dataset.side);
  else if (box) openJourneyBox(Number(box.dataset.box));
  else if (line && journeyManage) ui.menu({ x: e.clientX, y: e.clientY }, [{ label: t('jr_line_remove'), icon: 'x', danger: true, onSelect: () => journeyRemoveLine(Number(line.dataset.line), line.dataset.side) }]);
});
