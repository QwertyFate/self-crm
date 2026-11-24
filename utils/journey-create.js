/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY CREATE — a whole workflow made in one piece
   (ASSISTANT_CHANGES, 2026-11-24; routes/admin-assistant.js is its only
   caller: the admin console's assistant proposes a workflow, and the admin's
   click makes it. The Workflows page itself builds a workflow box by box,
   routes/journey.js.)

   THE ONE WAY a workflow is written that was not clicked together on the
   board. It can make a workflow and take an untouched one away again —
   nothing else: it never switches one on, never changes one that exists.

   THE SPEC — the workflow as it is handed in, flat, its boxes named by keys:
     { name,
       start: { config, next },          config: what PUT /nodes/:id takes as a
                                         start's config; next: the key of the
                                         first box, or null
       steps: [{ key, kind, title, body, wait_minutes, config,
                 next,                   the key of the box behind it, or null
                 else,                   branch: the "no" line; router: the
                                         "otherwise" line
                 routes: [{ name, when, next }] }] }     a router's routes
     key: a lower-case letter, then up to 29 letters, digits or underscores;
     no two boxes share one. A branch's `next` is its "yes" line. A router has
     no `next`: its lines are its routes'. `explain` on the spec, the start or
     a box is for people and is not looked at here.

   THE SAME CHECKS AS THE BOARD. Every box goes through the journey's own
   checks, handed in as `boxes` (routes/journey.js router.boxes: actionOf,
   startOf, foreignRefs, nameOf, ERRORS and the limits) — so nothing can be
   made here that the Workflows page would refuse, and everything a box names
   (a stage, a lead webhook, a pipeline, a field, a person, another workflow)
   must be the workspace's own. On top of that, what only a workflow in one
   piece can get wrong:
     key          a key that is none, or one that two boxes share
     line         a line that names no box, or leads round in a circle; `else`
                  or `routes` on a box that has none; `next` on a router
     unreachable  a box no line leads to
     workspace    there is no such workspace
   and the start must name what starts the workflow: one that could never be
   switched on is not made.

   check()   finds EVERY problem at once: { ok: true, plan } or { ok: false,
             problems: [{ where, code, message }] } — where: 'name', 'start',
             'steps', 'workspace' or a box's key; message: the journey's own
             sentence for a code of its own. plan: the checked boxes as they
             will be written, in the order of `steps`. Writes nothing.
   create()  checks again and writes, in ONE transaction: the workflow —
             switched off, as every new workflow is: `active` is never named
             here — its start, every box, then the lines by the ids just made.
             x and y stay empty: the board lays unplaced boxes out itself.
             { ok: true, flowId, updatedAt } · { ok: false, problems } ·
             { ok: false, code: 'workspace' | 'limit' }. After the commit
             record(entry) is called with the journey record's "created"
             (actorId null: no person of the workspace made it); a record that
             cannot be written never undoes the workflow.
   view()    the plan for the console's card: labels in English, the settings
             as they will be saved, the lines by the boxes' keys.
   untouched() / remove()   a made workflow is untouched while it is as it was
             made: still there, off, never switched on, updated_at exactly the
             time create() handed back, and no deal ever in it. remove() is ONE
             DELETE that carries all of that in its WHERE — a workflow somebody
             switched on in the same second is not deleted — and answers true
             only when a row went. (Its boxes go with it, as with the journey's
             own delete.)

   Takes the pool; opens no database module. Every id is a parameter of a
   statement, never part of one.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const triggers  = require('./journey-triggers');   // isTrigger: does the start say what starts the workflow
const routerBox = require('./journey-router');     // setLine: a route's line is kept in the router's config

const KEY = /^[a-z][a-z0-9_]{0,29}$/;
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?Z$/;   // updated_at as create() hands it back
const LABELS = { start: 'Start', call: 'Call (fonio)', email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', task: 'Task', move: 'Move to a stage', wait: 'Wait', branch: 'If / else', router: 'Router' };
// The maker's own problems; every other code is the journey's, with the journey's sentence (boxes.ERRORS).
const MESSAGES = {
  key:         'A box is named by a key: a lower-case letter, then up to 29 lower-case letters, digits or underscores, and no two boxes share one',
  line:        'A line leads to another box of this workflow by its key, never round in a circle; only a branch and a router have "else", only a router has "routes", and a router has no "next"',
  unreachable: 'No line leads to this box: nothing would ever reach it',
  workspace:   'There is no such workspace',
  steps:       'The steps are a list of boxes',
};
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2147483648 ? v : null);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const none = v => v === undefined || v === null;

// The statements of create(), untouched() and remove().
const WORKSPACE = 'SELECT id FROM workspaces WHERE id = $1';
const LOCK = 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE';   // two workflows made at once count each other
const COUNT = 'SELECT COUNT(*)::int AS n FROM journey_flows WHERE workspace_id = $1';
const FLOW = `INSERT INTO journey_flows (workspace_id, name) VALUES ($1, $2)
   RETURNING id, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;
const START = `INSERT INTO journey_nodes (workspace_id, flow_id, kind, config) VALUES ($1, $2, 'start', $3::jsonb) RETURNING id`;
const BOX = 'INSERT INTO journey_nodes (workspace_id, flow_id, kind, title, body, wait_minutes, config) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id';
const LINES = 'UPDATE journey_nodes SET next_id = $4, else_id = $5, config = $6::jsonb WHERE id = $1 AND workspace_id = $2 AND flow_id = $3';
// A made workflow as it was made: there, off, never switched on, not changed since, no deal ever in it — and no box
// placed on the board (create() leaves every box unplaced, and dragging one does not count as a change to the
// workflow: without this line a workflow somebody is arranging would still be taken away).
const AS_MADE = `f.id = $1 AND f.workspace_id = $2 AND f.active = false AND f.activated_at IS NULL AND f.updated_at = $3::timestamptz
     AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = f.id)
     AND NOT EXISTS (SELECT 1 FROM journey_nodes n WHERE n.flow_id = f.id AND (n.x IS NOT NULL OR n.y IS NOT NULL))`;
const UNTOUCHED = `SELECT f.id FROM journey_flows f WHERE ${AS_MADE}`;
const REMOVE = `DELETE FROM journey_flows f WHERE ${AS_MADE} RETURNING f.id`;

// A problem, with the journey's sentence for a code of the journey's and the maker's own otherwise.
function problemOf(boxes, where, code, detail = '') {
  const own = Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
  const sentence = own || (boxes.ERRORS && Object.hasOwn(boxes.ERRORS, code) ? boxes.ERRORS[code][1] : code);
  return { where, code, message: detail ? `${sentence} (${detail})` : sentence };
}

// A line as written: null for none, the key it names, or undefined when it is neither.
const lineOf = v => (none(v) ? null : typeof v === 'string' ? v : undefined);

// The workflow as handed in, checked against the workspace: every problem there is, or the plan. db: the pool, or
// the connection of create()'s transaction.
async function check(db, workspaceId, spec, { boxes, tz } = {}) {
  const wid = idOf(workspaceId);
  const { rows: [ws] } = wid ? await db.query(WORKSPACE, [wid]) : { rows: [] };
  if (!ws) return { ok: false, problems: [problemOf(boxes, 'workspace', 'workspace')] };   // nothing else can be said without it

  const s = isObject(spec) ? spec : {};
  const problems = [], say = (where, code, detail) => problems.push(problemOf(boxes, where, code, detail));
  const name = boxes.nameOf({ name: s.name });
  if (!name) say('name', 'name');

  // ── the boxes, each by itself ──
  if (!none(s.steps) && !Array.isArray(s.steps)) say('steps', 'steps');
  const listed = Array.isArray(s.steps) ? s.steps : [];
  if (listed.length + 1 > boxes.MAX_NODES) say('steps', 'nodes_limit');
  const byKey = new Map(), steps = [];
  for (const [i, raw] of listed.entries()) {
    const b = isObject(raw) ? raw : {};
    if (typeof b.key !== 'string' || !KEY.test(b.key) || byKey.has(b.key)) { say('steps', 'key', `box ${i + 1}`); continue; }
    const step = { key: b.key, kind: b.kind, raw: b, box: null, next: null, else: null, routes: [] };
    byKey.set(b.key, step);
    steps.push(step);
    if (!boxes.ACTIONS.includes(b.kind)) { say(b.key, 'kind'); continue; }
    // a router's routes are part of what the box is: handed to the journey's check as its config
    const config = b.kind === 'router' ? { routes: Array.isArray(b.routes) ? b.routes.map(r => (isObject(r) ? { name: r.name, when: r.when } : r)) : b.routes } : b.config;
    const box = boxes.actionOf(b.kind, { title: b.title, body: b.body, wait_minutes: none(b.wait_minutes) ? undefined : b.wait_minutes, config }, tz);
    if (box.code) say(b.key, box.code);
    else step.box = box;
  }

  // ── the lines ──
  const known = (where, v) => {   // a line as a key of this workflow, or null; a line that is none is said
    const key = lineOf(v);
    if (key === null) return null;
    if (key === undefined || !byKey.has(key)) { say(where, 'line', key === undefined ? 'a line is a key or null' : `no box is called "${key}"`); return null; }
    return key;
  };
  for (const step of steps) {
    const b = step.raw, isRouter = step.kind === 'router', twoLines = isRouter || step.kind === 'branch';
    if (isRouter) { if (!none(b.next)) say(step.key, 'line', 'a router has no "next": its lines are its routes\''); }
    else step.next = known(step.key, b.next);
    if (twoLines) step.else = known(step.key, b.else);
    else if (!none(b.else)) say(step.key, 'line', `a ${String(step.kind)} box has no "else"`);
    if (isRouter) step.routes = (Array.isArray(b.routes) ? b.routes : []).map(r => known(step.key, isObject(r) ? r.next : null));
    else if (!none(b.routes) && !(Array.isArray(b.routes) && !b.routes.length)) say(step.key, 'line', `a ${String(step.kind)} box has no "routes"`);
  }
  const start = isObject(s.start) ? s.start : {};
  const first = known('start', start.next);
  const out = step => [step.next, step.else, ...step.routes].filter(Boolean);
  // round in a circle: following the lines from a box must never lead back to it (said once per box that closes one)
  const state = new Map(), closing = new Set();
  const walk = (key, path) => {
    state.set(key, 'open');
    for (const to of out(byKey.get(key))) {
      if (state.get(to) === 'open') { if (!closing.has(key)) { closing.add(key); say(key, 'line', `round in a circle: ${[...path.slice(path.indexOf(to)), to].join(' → ')}`); } }
      else if (!state.has(to)) walk(to, [...path, to]);
    }
    state.set(key, 'done');
  };
  for (const step of steps) if (!state.has(step.key)) walk(step.key, [step.key]);
  // a box no line leads to, from the start on
  const reached = new Set(), todo = first ? [first] : [];
  while (todo.length) {
    const key = todo.pop();
    if (reached.has(key)) continue;
    reached.add(key);
    todo.push(...out(byKey.get(key)));
  }
  for (const step of steps) if (!reached.has(step.key)) say(step.key, 'unreachable');

  // ── the start ──
  const begun = boxes.startOf({ config: start.config }, tz);
  if (begun.code) say('start', begun.code);
  else if (!triggers.isTrigger(begun.config.trigger)) say('start', 'start', 'it does not say what starts the workflow');

  // ── what the boxes name must be this workspace's own ──
  if (begun.config && triggers.isTrigger(begun.config.trigger)) {
    const foreign = await boxes.foreignRefs(db, wid, 'start', begun.config, null);
    if (foreign) say('start', foreign);
  }
  for (const step of steps) {
    if (!step.box) continue;
    const foreign = await boxes.foreignRefs(db, wid, step.kind, step.box.config);
    if (foreign) say(step.key, foreign);
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, plan: {
    name,
    start: { config: begun.config, next: first },
    steps: steps.map(step => ({
      key: step.key, kind: step.kind, title: step.box.title, body: step.box.body, wait: step.box.wait, config: step.box.config, next: step.next, else: step.else,
      // a router's routes as they were checked (the journey numbers them in their order), each with where it leads
      routes: step.kind === 'router' ? step.box.config.routes.map((r, i) => ({ id: r.id, name: r.name, when: r.when, next: step.routes[i] ?? null })) : [],
    })),
  } };
}

// The workflow is made in the workspace, switched off. record: what writes the journey's record (handed in).
async function create(pool, workspaceId, spec, { boxes, tz, record } = {}) {
  const wid = idOf(workspaceId);
  if (!wid) return { ok: false, code: 'workspace' };
  const db = await pool.connect();
  let made;
  try {
    await db.query('BEGIN');
    const { rows: [ws] } = await db.query(LOCK, [wid]);
    if (!ws) { await db.query('ROLLBACK'); return { ok: false, code: 'workspace' }; }
    const checked = await check(db, wid, spec, { boxes, tz });
    if (!checked.ok) { await db.query('ROLLBACK'); return { ok: false, problems: checked.problems }; }
    const { rows: [count] } = await db.query(COUNT, [wid]);
    if (count.n >= boxes.MAX_FLOWS) { await db.query('ROLLBACK'); return { ok: false, code: 'limit' }; }
    const plan = checked.plan;
    const { rows: [flow] } = await db.query(FLOW, [wid, plan.name]);
    const { rows: [start] } = await db.query(START, [wid, flow.id, JSON.stringify(plan.start.config)]);
    const ids = new Map();
    for (const step of plan.steps) {
      const { rows: [box] } = await db.query(BOX, [wid, flow.id, step.kind, step.title, step.body, step.wait, JSON.stringify(step.config)]);
      ids.set(step.key, box.id);
    }
    // the lines, by the ids just made
    const idFor = key => (key ? ids.get(key) : null);
    if (plan.start.next) await db.query(LINES, [start.id, wid, flow.id, idFor(plan.start.next), null, JSON.stringify(plan.start.config)]);
    for (const step of plan.steps) {
      let config = step.config;
      for (const route of step.routes) if (route.next) config = routerBox.setLine(config, route.id, idFor(route.next));
      if (step.next || step.else || config !== step.config) await db.query(LINES, [ids.get(step.key), wid, flow.id, idFor(step.next), idFor(step.else), JSON.stringify(config)]);
    }
    await db.query('COMMIT');
    made = { flowId: flow.id, updatedAt: flow.updated_at, name: plan.name };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { db.release(); }
  // the journey's record: written after the workflow is, and never undoing it
  if (typeof record === 'function') {
    try { await record({ workspaceId: wid, event: 'flow', actorId: null, flowId: made.flowId, flowName: made.name, title: made.name, detail: 'created' }); }
    catch (err) { console.error('journey: the record of a made workflow could not be written:', (err && err.message) || err); }
  }
  return { ok: true, flowId: made.flowId, updatedAt: made.updatedAt };
}

// The plan as the console shows it: what each box is called, its settings as they will be saved, its lines by key.
function view(plan) {
  const p = isObject(plan) ? plan : {}, start = isObject(p.start) ? p.start : {};
  return {
    start: { label: LABELS.start, settings: start.config ?? {}, next: start.next ?? null },
    steps: (Array.isArray(p.steps) ? p.steps : []).map(step => ({
      key: step.key, kind: step.kind, label: LABELS[step.kind] || String(step.kind), title: step.title, body: step.body, wait_minutes: step.wait, settings: step.config,
      next: step.next ?? null, else: step.else ?? null, routes: (step.routes || []).map(r => ({ name: r.name, when: r.when ?? null, next: r.next ?? null })),
    })),
  };
}

const asMade = (workspaceId, flowId, updatedAt) => (idOf(workspaceId) && idOf(flowId) && typeof updatedAt === 'string' && STAMP.test(updatedAt) ? [flowId, workspaceId, updatedAt] : null);
// Is the workflow still as create() made it?
async function untouched(pool, workspaceId, flowId, updatedAt) {
  const params = asMade(workspaceId, flowId, updatedAt);
  if (!params) return false;
  const { rows } = await pool.query(UNTOUCHED, params);
  return rows.length === 1;
}
// The workflow is taken away again — only as create() made it. true when it is gone, false when nothing was deleted.
async function remove(pool, workspaceId, flowId, updatedAt) {
  const params = asMade(workspaceId, flowId, updatedAt);
  if (!params) return false;
  const { rows } = await pool.query(REMOVE, params);
  return rows.length === 1;
}

module.exports = { KEY, LABELS, MESSAGES, check, create, view, untouched, remove };
