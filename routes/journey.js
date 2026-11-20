/* ═══════════════════════════════════════════════════════════════════════════
   /api/journey — the Customer Journey's workflows
   (CUSTOMER_JOURNEY_CHANGES Parts 3–6, 2026-11-19; public/js/journey.js;
   utils/journey-run.js makes them happen).

   A WORKSPACE HAS WORKFLOWS (journey_flows), as many as it adds. A workflow is
   made of BOXES (journey_nodes), one action per box:
     start     the first box, made with the workflow and never deleted: what
               starts it — one of the starts of utils/journey-triggers.js (a
               lead, a stage, a booking, a call's result, a moment … Part 9),
               with that start's own settings and, for any of them, one
               pipeline — and the stages in which it stops
     call      fonio calls the lead
     email     an email (title = its subject, body = its text, plain or HTML)
     whatsapp, sms, task   something a person does, with a title and a text
     move      the deal is moved to a stage (config.stage_id)
     branch    a question about the deal with TWO lines out (Part 11,
               utils/journey-branch.js): next_id is where "yes" leads,
               else_id where "no" leads; config.test names the question
     wait      nothing happens: the box only takes time (Part 10) — its wait,
               and then, when set, until a time of day on chosen weekdays
               (config.until, .weekdays; .tz is the zone of who saved it)
   Every box but the start has a wait: how long after the box before it it
   happens (wait_minutes, 0 = right away).

   THE ORDER IS THE LINES. A box names the box that comes after it (next_id):
   one line out of every box — two out of a branch box, whose second line is
   else_id (`side: 'else'` names it when a box is added behind it or a line is
   drawn). A new box is put in behind a box of the same
   workflow and takes over that box's line — or stands alone until a line is
   drawn to it (after_id null). Deleting a box joins the box before it to the
   box after it. A line is drawn or taken away with PUT /nodes/:id/next; it
   never leads to a start, to the box itself, or round in a circle. A box's
   place on the board is its own (x, y), kept when it is dragged.

   RUNNING (Part 4)  A workflow runs while it is switched on (active). It can
   be switched on once its start says what starts it. Its start is changed
   only while it is off: who is taken in is decided at the moment of switching
   on (utils/journey-run.js). Steps can be changed while it runs; a deal that
   waits at a deleted step goes on to the step after it.

   PER WORKSPACE. Everyone in the workspace reads the workflows and may put a
   deal into one that runs ("Include in the Customer Journey"); every change
   to a workflow is owner/admin only. Who and where always come from the
   session. A box may name only what is its own workspace's — stages, lead
   webhooks, a pipeline, a field, another workflow — checked when it is saved
   and again when the workflow is switched on.

   THE RECORD (Part 15, utils/journey-log.js)  Everything that happens is an
   entry of journey_log, and stays: what each step did, when a deal entered
   and left and why (written by the engine) — and, written here, every change
   to a workflow with who made it (created, renamed, switched on or off,
   deleted, a step added, changed or deleted, a line or the start changed) and
   every deal a deleted step put on. An entry is written after the change has
   happened, and never undoes it: a record that cannot be written is said in
   the server's log. Deleting a workflow keeps its entries (they carry its
   name). Everyone in the workspace reads the record: GET /history.

   Every refusal carries a `code` the page turns into a sentence.

   ENDPOINTS
     GET    /                    { flows: [{ id, name, active, updated_at, nodes: [{ id, kind, title, body,
                                 wait_minutes, config, next_id, x, y }] }], webhooks: [{ id, name }],
                                 can_manage, max_flows, max_nodes } (everyone)
     POST   /flows               { name } → 201 { flow }, with its start box (owner/admin, as all below
                                 unless said otherwise)
     PUT    /flows/:id           { name } and/or { active } → { flow }
     DELETE /flows/:id           → { success: true }; its boxes go with it
     GET    /flows/:id/activity  { counts, waiting: [...], log: [...] } — who waits for which step, and what
                                 the steps did (the newest hundred step entries; everyone)
     GET    /history             the record, newest first: { entries: [{ id, created_at, event, flow_id,
                                 flow_name, deal_id, deal_title, kind, title, status, detail, actor_name }],
                                 more } — ?flow_id, ?deal_id, ?group=steps|deals|flow, ?q, ?before, ?limit (everyone)
     POST   /flows/:id/include   { deal_id } → { success: true }: the deal starts at the first step (everyone)
     POST   /flows/:id/nodes     { after_id | null, kind, title, body, wait_minutes, config } → 201 { flow }
     PUT    /nodes/:id           the box's own fields (a start: { config }) → { flow }
     PUT    /nodes/:id/place     { x, y } → { success: true }
     PUT    /nodes/:id/next      { next_id | null } → { flow }
     POST   /nodes/:id/test      an email box, sent once to the caller's own address with sample values. It is an
                                 email like any other (Part 17, utils/journey-sends.js): counted, and not sent —
                                 409 paused while sending from the address is paused, 409 limit while its day is
                                 full ("limit" is, to this request alone, the sending limit)
     DELETE /nodes/:id           → { flow }; 400 start_fixed for a start box
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const journeyRun  = require('../utils/journey-run');
const mail        = require('../utils/journey-mail');
const baseUrl     = require('../utils/base-url');
const triggers    = require('../utils/journey-triggers');   // everything that can start a workflow (Part 9)
const branch      = require('../utils/journey-branch');     // a box that asks a question and has two lines out (Part 11)
const vars        = require('../utils/journey-vars');       // the variables a step's text can use, and their sample values (Part 14)
const log         = require('../utils/journey-log');        // the whole record of what the workflows do (Part 15)
const sends       = require('../utils/journey-sends');      // the sending limits, the count and the pause of the address (Part 17)
const { notifyUser } = require('../notifications');         // owners and admins hear of a pause

router.use(requireAuth);

const ACTIONS = ['call', 'email', 'whatsapp', 'sms', 'task', 'move', 'wait', 'branch'];
const MAX_FLOWS = 20, MAX_NODES = 60, MAX_NAME = 80, MAX_TITLE = 120, MAX_BODY = 20000, MAX_WAIT = 365 * 24 * 60, MAX_IDS = 20;
const FLOW_COLUMNS = 'id, name, active, updated_at';
const NODE_COLUMNS = 'id, flow_id, kind, title, body, wait_minutes, config, next_id, x, y, else_id';
const START_CONFIG = { trigger: null, webhook_ids: null, stage_id: null, stop_stage_ids: [] };
const ERRORS = {
  forbidden:     [403, 'Owner or admin only'],
  name:          [400, `A workflow needs a name of up to ${MAX_NAME} characters`],
  limit:         [409, `A workspace has at most ${MAX_FLOWS} workflows`],
  nodes_limit:   [409, `A workflow has at most ${MAX_NODES} boxes`],
  after:         [400, 'The box to add after is not in this workflow'],
  kind:          [400, `The kind is one of: ${ACTIONS.join(', ')}`],
  title:         [400, `A box needs a title of up to ${MAX_TITLE} characters`],
  body:          [400, `The text has up to ${MAX_BODY} characters`],
  wait:          [400, `The wait is a whole number of minutes from 0 to ${MAX_WAIT}`],
  branch:        [400, 'A branch box asks one of the known questions, with what that question needs'],
  until:         [400, 'A Wait box waits some time, or until a time of day (HH:MM) on days from 1 (Monday) to 7 (Sunday)'],
  stage:         [400, 'The stage is not one of this workspace'],
  webhooks:      [400, 'A lead webhook in the list is not one of this workspace'],
  start:         [400, 'The start names what starts the workflow, with everything that start needs'],
  field:         [400, 'The field is not one of this workspace, or not of the kind the start needs'],
  pipeline:      [400, 'The pipeline is not one of this workspace'],
  flow:          [400, 'The other workflow is not one of this workspace'],
  loop:          [400, 'The other workflow starts when this one ends: the two would start each other for ever'],
  start_fixed:   [400, 'The start box cannot be deleted'],
  active:        [409, 'Switch the workflow off to change its start'],
  inactive:      [409, 'The workflow is not switched on'],
  deal:          [400, 'The deal is not one of this workspace'],
  place:         [400, `A place is two whole numbers from 0 to ${journeyRun.MAX_PLACE}`],
  line:          [400, 'A line leads to another box of the same workflow, never to the start and never round in a circle'],
  not_email:     [400, 'Only an email step can be sent as a test'],
  not_connected: [409, 'No address is connected'],
  no_address:    [409, 'The signed-in account has no valid email address'],
  gone:          [409, 'Google no longer accepts this connection; sign in with Google again'],
  rejected:      [502, 'Google refused the email'],
  unreachable:   [502, 'Google could not be reached'],
  paused:        [409, 'Sending from this address is paused'],
  history:       [400, 'The record is asked for by a workflow, a deal, a group (steps, deals, flow), a text of up to 100 characters, the entry to go on from and how many (1 to 200)'],
  not_found:     [404, 'Not found'],
};
const refuse = (res, code, detail) => res.status(ERRORS[code][0]).json({ error: ERRORS[code][1], code, ...(detail ? { detail } : {}) });
const idOf = v => (/^[1-9]\d{0,9}$/.test(String(v)) ? Number(v) : null);

const canManage = role => role === 'owner' || role === 'admin';
function requireManage(req, res, next) {
  if (!canManage(req.userRole)) return refuse(res, 'forbidden');
  next();
}

// The body as an action box of `kind`: { title, body, wait, config } or { code }. tz: the zone of who saves it, kept
// with a Wait box's time of day.
function actionOf(kind, body, tz) {
  const b = body && typeof body === 'object' ? body : {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (title.length > MAX_TITLE || (!title && !['move', 'wait', 'branch'].includes(kind))) return { code: 'title' };   // a move is named by its stage, a wait by its time, a branch by its question
  const text = b.body === undefined || b.body === null ? '' : b.body;
  if (typeof text !== 'string' || text.length > MAX_BODY) return { code: 'body' };
  const wait = b.wait_minutes === undefined ? 0 : b.wait_minutes;
  if (!Number.isInteger(wait) || wait < 0 || wait > MAX_WAIT) return { code: 'wait' };
  const config = {};
  // a step whose texts are filled for each deal keeps the time zone of whoever saves it: {{date}}, {{time}} and the
  // like go by that clock (utils/journey-vars.js) — never by a zone that was sent
  if (vars.KINDS.includes(kind)) config.tz = typeof tz === 'string' && tz ? tz : triggers.FALLBACK_ZONE;
  // an email's small "no more emails" line at the end (Part 19): it can be switched off only while the text itself
  // holds the link — otherwise it stays on, whatever was sent. Nothing sent: nothing kept (the rule of before).
  if (kind === 'email' && typeof b.config?.footer === 'boolean') config.footer = b.config.footer || !vars.usedIn(text).has('unsubscribe');
  if (kind === 'move') {
    const stageId = typeof b.config?.stage_id === 'number' ? idOf(b.config.stage_id) : null;
    if (!stageId) return { code: 'stage' };
    config.stage_id = stageId;
  }
  if (kind === 'branch') {
    const asked = branch.checkBranch(b.config);
    if (asked.code) return { code: asked.code };
    return { title, body: text, wait, config: asked.config };
  }
  if (kind === 'wait') {
    const until = b.config?.until, days = b.config?.weekdays;
    if (until !== undefined && until !== null) {
      if (typeof until !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(until)) return { code: 'until' };
      if (days !== undefined && days !== null && (!Array.isArray(days) || days.some(d => !Number.isInteger(d) || d < 1 || d > 7))) return { code: 'until' };
      config.until = until;
      config.tz = typeof tz === 'string' && tz ? tz : triggers.FALLBACK_ZONE;
      const list = Array.isArray(days) ? [...new Set(days)].sort((x, y) => x - y) : [];
      if (list.length && list.length < 7) config.weekdays = list;   // every day needs no list
    }
    if (!wait && !config.until) return { code: 'until' };   // a wait of no time at all is no step
  }
  return { title, body: text, wait, config };
}

// The body as a start box's settings: { config } or { code } (utils/journey-triggers.js checkStart). What does not
// belong to the chosen start is left out. tz: the zone of who saves it, kept with a start's time of day.
function startOf(body, tz) {
  const c = body && typeof body === 'object' && body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : null;
  return c ? triggers.checkStart(c, { tz }) : { code: 'start' };
}

// The ids of `table` that are NOT this workspace's own.
async function foreignIds(db, table, wid, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE workspace_id = $1 AND id = ANY($2::int[])`, [wid, ids]);
  const own = new Set(rows.map(r => Number(r.id)));
  return ids.filter(id => !own.has(id));
}
// What a box's settings name must be this workspace's: null, or the code of what is not. A start's are its
// registry's to check (stages, lead webhooks, a pipeline, a field, another workflow); flowId: the workflow it is of.
async function foreignRefs(db, wid, kind, config, flowId = null) {
  if (kind === 'start') return triggers.foreignRefs(db, wid, flowId, config);
  if (kind === 'branch') return branch.foreignRefs(db, wid, config);
  return (await foreignIds(db, 'pipeline_stages', wid, config.stage_id ? [config.stage_id] : [])).length ? 'stage' : null;
}

// The workspace's workflows with their boxes (flowId: only that one).
async function readFlows(wid, flowId = null, db = pool) {
  const { rows: flows } = await db.query(`SELECT ${FLOW_COLUMNS} FROM journey_flows WHERE workspace_id = $1 AND ($2::int IS NULL OR id = $2) ORDER BY id`, [wid, flowId]);
  const { rows: nodes } = await db.query(`SELECT ${NODE_COLUMNS} FROM journey_nodes WHERE workspace_id = $1 AND ($2::int IS NULL OR flow_id = $2) ORDER BY id`, [wid, flowId]);
  return flows.map(f => ({ ...f, nodes: nodes.filter(n => n.flow_id === f.id).map(({ flow_id, ...n }) => n) }));
}
const readFlow = async (wid, flowId) => (await readFlows(wid, flowId))[0] || null;
// A box with whether its workflow runs: { id, kind, flow_id, next_id, active } or undefined.
async function nodeOf(wid, id) {
  const { rows: [node] } = await pool.query(
    'SELECT n.id, n.kind, n.flow_id, n.next_id, n.title, n.body, n.config, f.active FROM journey_nodes n JOIN journey_flows f ON f.id = n.flow_id WHERE n.id = $1 AND n.workspace_id = $2', [id, wid]
  );
  return node;
}

// A change to a workflow, written into the record with who made it — after the change has happened. Never throws.
const note = (req, entry) => log.record(pool, { workspaceId: req.workspaceId, event: 'flow', actorId: req.userId, ...entry });

// Several statements that stand or fall together.
async function together(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; }
  finally { client.release(); }
}

router.get('/', async (req, res, next) => {
  try {
    const flows = await readFlows(req.workspaceId);
    const { rows: webhooks } = await pool.query('SELECT id, name FROM workspace_webhook WHERE workspace_id = $1 ORDER BY id', [req.workspaceId]);
    res.json({ flows, webhooks, can_manage: canManage(req.userRole), max_flows: MAX_FLOWS, max_nodes: MAX_NODES });
  } catch (err) { next(err); }
});

const nameOf = body => { const n = typeof body?.name === 'string' ? body.name.trim() : ''; return n && n.length <= MAX_NAME ? n : null; };

router.post('/flows', requireManage, async (req, res, next) => {
  try {
    const name = nameOf(req.body);
    if (!name) return refuse(res, 'name');
    const { rows: [count] } = await pool.query('SELECT COUNT(*)::int AS n FROM journey_flows WHERE workspace_id = $1', [req.workspaceId]);
    if (count.n >= MAX_FLOWS) return refuse(res, 'limit');
    const id = await together(async db => {
      const { rows: [flow] } = await db.query('INSERT INTO journey_flows (workspace_id, name, created_by) VALUES ($1,$2,$3) RETURNING id', [req.workspaceId, name, req.userId]);
      await db.query(`INSERT INTO journey_nodes (workspace_id, flow_id, kind, config) VALUES ($1,$2,'start',$3::jsonb)`, [req.workspaceId, flow.id, JSON.stringify(START_CONFIG)]);
      return flow.id;
    });
    await note(req, { flowId: id, flowName: name, title: name, detail: 'created' });
    res.status(201).json({ flow: await readFlow(req.workspaceId, id) });
  } catch (err) { next(err); }
});

// A workflow's name, and whether it runs. Switching on needs a start that says what starts it; the deals already in
// a start's stage are written down in the same breath (journeyRun.baseline), so only later arrivals are taken in.
router.put('/flows/:id', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    if (!id) return refuse(res, 'not_found');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const name = b.name === undefined ? undefined : nameOf(b);
    if (name === null || (name === undefined && typeof b.active !== 'boolean')) return refuse(res, 'name');
    if (b.active !== undefined && typeof b.active !== 'boolean') return refuse(res, 'start');
    const { rows: [flow] } = await pool.query(
      `SELECT f.id, f.name, f.active, s.config FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.id = $1 AND f.workspace_id = $2`, [id, req.workspaceId]
    );
    if (!flow) return refuse(res, 'not_found');
    if (b.active === true && !flow.active) {
      const config = flow.config || {};
      if (!triggers.isTrigger(config.trigger)) return refuse(res, 'start');
      // what the start names may be gone since it was saved: a workflow that could never start, or never stop, is not switched on
      const gone = await triggers.foreignRefs(pool, req.workspaceId, id, config);
      if (gone) return refuse(res, gone);
      await together(async db => {
        await journeyRun.baseline(db, { id, workspace_id: req.workspaceId, config });
        await db.query('UPDATE journey_flows SET active = true, activated_at = NOW(), updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId]);
      });
      await note(req, { flowId: id, title: flow.name, detail: 'switched_on' });
    } else if (b.active === false && flow.active) {
      await pool.query('UPDATE journey_flows SET active = false, updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId]);
      await note(req, { flowId: id, title: flow.name, detail: 'switched_off' });
    }
    if (name) {
      await pool.query('UPDATE journey_flows SET name = $3, updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId, name]);
      if (name !== flow.name) await note(req, { flowId: id, flowName: name, title: name, detail: 'renamed' });   // the same name again is no change
    }
    res.json({ flow: await readFlow(req.workspaceId, id) });
  } catch (err) { next(err); }
});

router.delete('/flows/:id', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    if (!id) return refuse(res, 'not_found');
    // its boxes and what waits in it go with it; its entries in the record stay, without the workflow they were of
    const { rows: [gone] } = await pool.query('DELETE FROM journey_flows WHERE id = $1 AND workspace_id = $2 RETURNING name', [id, req.workspaceId]);
    if (!gone) return refuse(res, 'not_found');
    await note(req, { flowId: null, flowName: gone.name, title: gone.name, detail: 'deleted' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Who waits for which step, and what the steps did: the trace of a workflow.
router.get('/flows/:id/activity', async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const { rows: [flow] } = id ? await pool.query('SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId]) : { rows: [] };
    if (!flow) return refuse(res, 'not_found');
    const { rows: counts } = await pool.query('SELECT status, COUNT(*)::int AS n FROM journey_runs WHERE flow_id = $1 AND workspace_id = $2 GROUP BY status', [id, req.workspaceId]);
    const { rows: waiting } = await pool.query(
      `SELECT r.deal_id, d.title AS deal_title, r.due_at, n.kind, n.title
         FROM journey_runs r JOIN deals d ON d.id = r.deal_id LEFT JOIN journey_nodes n ON n.id = r.node_id
        WHERE r.flow_id = $1 AND r.workspace_id = $2 AND r.status IN ('waiting','working') ORDER BY r.due_at, r.id LIMIT 100`, [id, req.workspaceId]
    );
    const { rows: log } = await pool.query(
      `SELECT l.deal_id, d.title AS deal_title, l.kind, l.title, l.status, l.detail, l.created_at
         FROM journey_log l LEFT JOIN deals d ON d.id = l.deal_id
        WHERE l.flow_id = $1 AND l.workspace_id = $2 AND l.event = 'step' ORDER BY l.id DESC LIMIT 100`, [id, req.workspaceId]
    );
    res.json({ counts: Object.fromEntries(counts.map(c => [c.status, c.n])), waiting, log });
  } catch (err) { next(err); }
});

// The record: everything the workflows did and everything that was done to them, newest first. For everyone.
router.get('/history', async (req, res, next) => {
  try {
    const out = await log.history(pool, req.workspaceId, req.query);
    if (out.code) return refuse(res, out.code);
    res.json(out);
  } catch (err) { next(err); }
});

// "Include in the Customer Journey": a deal is put at the first step of a workflow that runs. For everyone.
router.post('/flows/:id/include', async (req, res, next) => {
  try {
    const id = idOf(req.params.id), dealId = typeof req.body?.deal_id === 'number' ? idOf(req.body.deal_id) : null;
    if (!id) return refuse(res, 'not_found');
    if (!dealId) return refuse(res, 'deal');
    const out = await journeyRun.include(pool, { workspaceId: req.workspaceId, flowId: id, dealId, actorId: req.userId });   // who put it in: for the record
    if (out.code) return refuse(res, out.code);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/flows/:id/nodes', requireManage, async (req, res, next) => {
  try {
    const flowId = idOf(req.params.id);
    if (!flowId) return refuse(res, 'not_found');
    const kind = req.body?.kind;
    if (!ACTIONS.includes(kind)) return refuse(res, 'kind');
    const box = actionOf(kind, req.body, req.userTimezone);
    if (box.code) return refuse(res, box.code);
    const loose = req.body.after_id === null || req.body.after_id === undefined;   // a box that stands alone until a line is drawn to it
    const elseSide = req.body.side === 'else';   // behind a branch box's "no" line
    const afterId = loose ? null : typeof req.body.after_id === 'number' ? idOf(req.body.after_id) : null;
    if (!loose && !afterId) return refuse(res, 'after');
    const foreign = await foreignRefs(pool, req.workspaceId, kind, box.config);
    if (foreign) return refuse(res, foreign);
    let madeId = null;
    const code = await together(async db => {
      const { rows: [flow] } = await db.query('SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [flowId, req.workspaceId]);
      if (!flow) return 'not_found';
      const { rows: [after] } = loose ? { rows: [{ id: null, next_id: null }] }
        : elseSide ? await db.query(`SELECT id, else_id AS next_id FROM journey_nodes WHERE id = $1 AND flow_id = $2 AND workspace_id = $3 AND kind = 'branch'`, [afterId, flowId, req.workspaceId])   // only a branch box has that line
        : await db.query('SELECT id, next_id FROM journey_nodes WHERE id = $1 AND flow_id = $2 AND workspace_id = $3', [afterId, flowId, req.workspaceId]);
      if (!after) return 'after';
      const { rows: [count] } = await db.query('SELECT COUNT(*)::int AS n FROM journey_nodes WHERE flow_id = $1 AND workspace_id = $2', [flowId, req.workspaceId]);
      if (count.n >= MAX_NODES) return 'nodes_limit';
      // the new box takes over the line of the box it is put behind
      const { rows: [made] } = await db.query(
        `INSERT INTO journey_nodes (workspace_id, flow_id, kind, title, body, wait_minutes, config, next_id) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
        [req.workspaceId, flowId, kind, box.title, box.body, box.wait, JSON.stringify(box.config), after.next_id]
      );
      if (after.id && elseSide) await db.query('UPDATE journey_nodes SET else_id = $3 WHERE id = $1 AND workspace_id = $2', [after.id, req.workspaceId, made.id]);
      else if (after.id) await db.query('UPDATE journey_nodes SET next_id = $3 WHERE id = $1 AND workspace_id = $2', [after.id, req.workspaceId, made.id]);
      await db.query('UPDATE journey_flows SET updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [flowId, req.workspaceId]);
      madeId = made.id;
      return null;
    });
    if (code) return refuse(res, code);
    await note(req, { flowId, nodeId: madeId, kind, title: box.title, detail: 'step_added' });
    res.status(201).json({ flow: await readFlow(req.workspaceId, flowId) });
  } catch (err) { next(err); }
});

router.put('/nodes/:id', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const node = id ? await nodeOf(req.workspaceId, id) : null;
    if (!node) return refuse(res, 'not_found');
    if (node.kind === 'start' && node.active) return refuse(res, 'active');   // who is taken in was decided when it was switched on
    const box = node.kind === 'start' ? { title: '', body: '', wait: 0, ...startOf(req.body, req.userTimezone) } : actionOf(node.kind, req.body, req.userTimezone);
    if (box.code) return refuse(res, box.code);
    const foreign = await foreignRefs(pool, req.workspaceId, node.kind, box.config, node.flow_id);
    if (foreign) return refuse(res, foreign);
    await pool.query(
      'UPDATE journey_nodes SET title = $3, body = $4, wait_minutes = $5, config = $6::jsonb, updated_at = NOW() WHERE id = $1 AND workspace_id = $2',
      [id, req.workspaceId, box.title, box.body, box.wait, JSON.stringify(box.config)]
    );
    await pool.query('UPDATE journey_flows SET updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [node.flow_id, req.workspaceId]);
    await note(req, { flowId: node.flow_id, nodeId: id, kind: node.kind, title: box.title, detail: node.kind === 'start' ? 'start_changed' : 'step_changed' });
    res.json({ flow: await readFlow(req.workspaceId, node.flow_id) });
  } catch (err) { next(err); }
});

// Where a box stands on the board. (No entry in the record: where a box stands changes nothing a workflow does.)
router.put('/nodes/:id/place', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const { x, y } = req.body || {};
    const ok = v => Number.isInteger(v) && v >= 0 && v <= journeyRun.MAX_PLACE;
    if (!ok(x) || !ok(y)) return refuse(res, 'place');
    const { rowCount } = id ? await pool.query('UPDATE journey_nodes SET x = $3, y = $4 WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId, x, y]) : { rowCount: 0 };
    if (!rowCount) return refuse(res, 'not_found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// The line out of a box: to another box of its workflow, or (null) nowhere. side 'else': a branch box's "no" line.
router.put('/nodes/:id/next', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const node = id ? await nodeOf(req.workspaceId, id) : null;
    if (!node) return refuse(res, 'not_found');
    const raw = req.body?.next_id;
    const nextId = raw === null || raw === undefined ? null : (typeof raw === 'number' && idOf(raw)) || 0;   // 0: not an id at all
    if (nextId === 0 || nextId === id) return refuse(res, 'line');
    const elseSide = req.body?.side === 'else';
    if (elseSide && node.kind !== 'branch') return refuse(res, 'line');   // only a branch box has a second line
    if (nextId) {
      const { rows } = await pool.query('SELECT id, kind, next_id, else_id FROM journey_nodes WHERE flow_id = $1 AND workspace_id = $2', [node.flow_id, req.workspaceId]);
      const byId = new Map(rows.map(n => [n.id, n])), target = byId.get(nextId);
      if (!target || target.kind === 'start') return refuse(res, 'line');
      // following every line from the target — both lines of a branch box — must not lead back to this box
      const seen = new Set(), todo = [target];
      while (todo.length) {
        const at = todo.pop();
        if (!at || seen.has(at.id)) continue;
        if (at.id === id) return refuse(res, 'line');
        seen.add(at.id);
        todo.push(byId.get(at.next_id), byId.get(at.else_id));
      }
    }
    if (elseSide) await pool.query('UPDATE journey_nodes SET else_id = $3 WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId, nextId]);
    else await pool.query('UPDATE journey_nodes SET next_id = $3 WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId, nextId]);
    await pool.query('UPDATE journey_flows SET updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [node.flow_id, req.workspaceId]);
    await note(req, { flowId: node.flow_id, nodeId: id, kind: node.kind, title: node.title, detail: 'line_changed' });
    res.json({ flow: await readFlow(req.workspaceId, node.flow_id) });
  } catch (err) { next(err); }
});

// An email step as it will arrive, sent once to the caller's own address: sample values in every variable (Part 14,
// utils/journey-vars.js — a field of the workspace says its own name in brackets), the subject marked as a test.
// Nothing a caller writes is sent — only what the step holds.
// Part 17: it is an email like any other. While the address is paused or its day is full, Google is not asked; an
// email that went out is counted. The full day answers with the mail route's own word, "limit" — which to every
// other request of this route is the number of workflows (ERRORS.limit), hence its own sentence here.
const MAIL_LIMIT = 'The daily sending limit of this address is reached';
router.post('/nodes/:id/test', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const node = id ? await nodeOf(req.workspaceId, id) : null;
    if (!node) return refuse(res, 'not_found');
    if (node.kind !== 'email') return refuse(res, 'not_email');
    const { rows: [sender] } = await pool.query('SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1', [req.workspaceId]);
    if (!sender) return refuse(res, 'not_connected');
    const { rows: [me] } = await pool.query(
      'SELECT u.email FROM users u JOIN user_workspaces uw ON uw.user_id = u.id WHERE u.id = $1 AND uw.workspace_id = $2', [req.userId, req.workspaceId]
    );
    const to = String(me?.email || '').trim().toLowerCase();
    if (!mail.isAddress(to)) return refuse(res, 'no_address');
    const origin = baseUrl(req), now = new Date();
    const sample = { ...await vars.sampleFor(pool, req.workspaceId, [node.title, node.body], now, req.userTimezone), email: to };   // the caller's own address is the contact's
    const parts = journeyRun.emailParts(node, sample, origin ? `${origin}/api/journey/unsubscribe/test` : null);
    let refreshToken;
    try { refreshToken = mail.openToken(sender.refresh_token_sealed); }
    catch { return refuse(res, 'gone'); }
    const door = await sends.gate(pool, { workspaceId: req.workspaceId, now, test: true });
    if (!door.state) return refuse(res, 'not_connected');
    if (!door.ok) return door.why === 'paused' ? refuse(res, 'paused', door.state.pause_detail) : res.status(409).json({ error: MAIL_LIMIT, code: 'limit' });
    try {
      await mail.send(await mail.accessToken(refreshToken), mail.buildMessage({ from: sender.email, to, ...parts, subject: `[Test] ${parts.subject}` }));
    } catch (err) {
      if (!(err instanceof mail.MailError)) throw err;
      if (err.code === 'limited') {   // Google itself says "limit": the address is paused, as for a workflow's email
        await sends.pause(pool, { from: sender.email, now, retryAt: err.retryAt, detail: err.message, tell: { notifyUser } });
        return refuse(res, 'paused', err.message);
      }
      return refuse(res, err.code, err.code === 'rejected' ? err.message : undefined);
    }
    await sends.sent(pool, { workspaceId: req.workspaceId, from: sender.email, kind: 'test', now, state: door.state })
      .catch(err => console.error('journey: a sent test email could not be counted:', err?.message || err));   // it is out all the same
    res.json({ success: true, to });
  } catch (err) { next(err); }
});

router.delete('/nodes/:id', requireManage, async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const node = id ? await nodeOf(req.workspaceId, id) : null;
    if (!node) return refuse(res, 'not_found');
    if (node.kind === 'start') return refuse(res, 'start_fixed');
    const put = [];   // the deals that waited at it, for the record: { dealId, over } — over: nothing stood behind it
    await together(async db => {
      // the box before it is joined to the box after it, and a deal that waits at it goes on to that box
      await db.query('UPDATE journey_nodes SET next_id = $3 WHERE next_id = $1 AND workspace_id = $2', [id, req.workspaceId, node.next_id]);
      await db.query('UPDATE journey_nodes SET else_id = $3 WHERE else_id = $1 AND workspace_id = $2', [id, req.workspaceId, node.next_id]);   // a branch's "no" line that led to it
      // A deal that waits at it goes on to the box behind it — due as if it had reached THAT box when it reached this
      // one: the deleted box's wait no longer counts, the next box's own wait does. With no box behind, the workflow
      // is done for it now. When it reached this box is its due time less the box's wait — but never before the row
      // was last put somewhere (a wait that was made longer meanwhile must not make the next step early).
      const { rows: [behind] } = node.next_id ? await db.query('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND workspace_id = $2', [node.next_id, req.workspaceId]) : { rows: [] };
      const { rows: waiting } = await db.query(
        `SELECT r.id, r.deal_id, r.due_at, r.updated_at, n.wait_minutes FROM journey_runs r JOIN journey_nodes n ON n.id = r.node_id WHERE r.node_id = $1 AND r.workspace_id = $2 AND r.status = 'waiting'`, [id, req.workspaceId]
      );
      for (const r of waiting) {
        put.push({ dealId: r.deal_id, over: !behind });
        if (!behind) { await db.query(`UPDATE journey_runs SET status = 'done', node_id = NULL, due_at = NULL, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`, [r.id, req.workspaceId]); continue; }
        const since = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        const reached = r.due_at ? Math.max(new Date(r.due_at).getTime() - Number(r.wait_minutes || 0) * 60000, since) : Date.now();
        await db.query('UPDATE journey_runs SET node_id = $3, due_at = $4, updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [r.id, req.workspaceId, behind.id, journeyRun.dueOf(behind, reached)]);
      }
      await db.query('UPDATE journey_runs SET node_id = $3 WHERE node_id = $1 AND workspace_id = $2', [id, req.workspaceId, node.next_id]);   // a row whose step is being done this very moment follows as it is
      await db.query('DELETE FROM journey_nodes WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId]);
      await db.query('UPDATE journey_flows SET updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [node.flow_id, req.workspaceId]);
    });
    // the record: the step is gone (it names it by its kind and title — its id leads nowhere any more), and every
    // deal that waited at it was put on, or was through with the workflow
    await note(req, { flowId: node.flow_id, kind: node.kind, title: node.title, detail: 'step_deleted' });
    for (const p of put) {
      const entry = { workspaceId: req.workspaceId, flowId: node.flow_id, dealId: p.dealId };
      await log.record(pool, { ...entry, event: 'moved', kind: node.kind, title: node.title, detail: 'step_deleted' });
      if (p.over) await log.record(pool, { ...entry, event: 'ended', status: 'done' });
    }
    res.json({ flow: await readFlow(req.workspaceId, node.flow_id) });
  } catch (err) { next(err); }
});

module.exports = router;
