/* ═══════════════════════════════════════════════════════════════════════════
   ASSISTANT TOOLS — what the admin console's assistant may read
   (ASSISTANT_CHANGES, 2026-11-24; utils/assistant-prompt.js is what it is told,
   utils/assistant.js talks to Claude, routes/admin-assistant.js runs the tools
   and keeps what it proposes).

   The assistant is a Claude that the platform's admin gives orders to. It can
   LOOK and it can PROPOSE — and that is not a promise it is asked to keep: it
   is all there is. This file is the looking.

   FOUR TOOLS, and no others (TOOLS):
     list_workspaces    every workspace with how much is in it — counts only
     workspace_setup    one workspace's structure: its pipelines and stages,
                        the fields of its deals and of its contacts, its lead
                        webhooks by name, its members by name and role, what
                        is connected (yes / no) and its workflows
     read_workflow      one workflow of a workspace with its boxes, as the
                        Workflows page itself is given them
     propose_workflow   only DEFINED here (its name, what it is for, the shape
                        of what it takes): running it is the route's, which
                        checks the workflow with the journey's own checks and
                        keeps it as a proposal. It writes nothing into a
                        workspace.

   WHAT IS NEVER READ. Everything Claude reads leaves this server, so only
   structure is read: no row of a contact, a deal, an activity or a note (they
   are COUNTED, in list_workspaces, and nothing else), no email address and no
   phone number, and no key, token, secret, hash or lead webhook key. Every
   statement of this file stands in SQL below, each begins with SELECT, and
   tests/unit/assistant-tools.test.js reads that list: a statement that
   changes something, names another table or names such a column fails it.

   A WORKSPACE'S ID AND A WORKFLOW'S are whole numbers above nothing, and
   always parameters of a statement, never part of one.

   Nothing here opens the database module: the pool is handed in.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

// The kinds of box a workflow has beside its start, and its limits — the journey's own (routes/journey.js ACTIONS and
// MAX_*, utils/journey-router.js). They stand here a second time because that file opens the database; the test
// holds the two against each other.
const KINDS = ['call', 'email', 'whatsapp', 'sms', 'task', 'move', 'wait', 'branch', 'router'];
const LIMITS = { workflows_max: 20, boxes_max: 60 };
const MAX_OPTIONS = 50, MAX_OPTION = 100;   // what of a field's list of choices is told

// Every statement there is. Each is a SELECT with the workspace (and the workflow) as a parameter.
const SQL = {
  workspaces: `
    SELECT w.id, w.name,
           (SELECT COUNT(*)::int FROM (SELECT u.id FROM users u WHERE u.workspace_id = w.id
                                       UNION SELECT uw.user_id FROM user_workspaces uw WHERE uw.workspace_id = w.id) m) AS members,
           (SELECT COUNT(*)::int FROM pipelines p WHERE p.workspace_id = w.id) AS pipelines,
           (SELECT COUNT(*)::int FROM deals d WHERE d.workspace_id = w.id) AS deals,
           (SELECT COUNT(*)::int FROM contacts c WHERE c.workspace_id = w.id) AS contacts,
           (SELECT COUNT(*)::int FROM journey_flows f WHERE f.workspace_id = w.id) AS workflows
      FROM workspaces w ORDER BY lower(w.name), w.id`,
  workspace: 'SELECT id, name FROM workspaces WHERE id = $1',
  pipelines: 'SELECT id, name FROM pipelines WHERE workspace_id = $1 ORDER BY position, id',
  stages: 'SELECT id, pipeline_id, name, position FROM pipeline_stages WHERE workspace_id = $1 ORDER BY pipeline_id, position, id',
  dealFields: 'SELECT field_key, name, type, options FROM deal_fields WHERE workspace_id = $1 ORDER BY position, id',
  contactFields: 'SELECT field_key, name, type, options FROM custom_fields WHERE workspace_id = $1 ORDER BY position, id',
  webhooks: 'SELECT id, name, active, create_deal, pipeline_id FROM workspace_webhook WHERE workspace_id = $1 ORDER BY id',
  // a member: at home in the workspace, or a member of it — as a workflow's own check of a person reads it; the role
  // that counts is the membership's (user_workspaces), the user's own where there is no such row
  members: `
    SELECT u.id, u.name, COALESCE(uw.role, u.role) AS role
      FROM users u LEFT JOIN user_workspaces uw ON uw.user_id = u.id AND uw.workspace_id = $1
     WHERE u.workspace_id = $1 OR uw.user_id IS NOT NULL
     ORDER BY lower(u.name), u.id`,
  connected: `
    SELECT EXISTS (SELECT 1 FROM workspace_mail m WHERE m.workspace_id = $1) AS gmail,
           EXISTS (SELECT 1 FROM workspace_fonio f WHERE f.workspace_id = $1) AS fonio,
           EXISTS (SELECT 1 FROM workspace_fonio f WHERE f.workspace_id = $1 AND f.active) AS fonio_on,
           EXISTS (SELECT 1 FROM workspace_calcom c WHERE c.workspace_id = $1) AS calcom,
           EXISTS (SELECT 1 FROM workspace_calendly c WHERE c.workspace_id = $1) AS calendly,
           (SELECT COUNT(*)::int FROM facebook_pages p WHERE p.workspace_id = $1) AS facebook_pages`,
  flows: `
    SELECT f.id, f.name, f.active, s.config->>'trigger' AS start_trigger,
           (SELECT COUNT(*)::int FROM journey_nodes n WHERE n.flow_id = f.id AND n.kind <> 'start') AS boxes
      FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start'
     WHERE f.workspace_id = $1 ORDER BY f.id`,
  flow: 'SELECT id, name, active, updated_at FROM journey_flows WHERE workspace_id = $1 AND id = $2',
  nodes: 'SELECT id, kind, title, body, wait_minutes, config, next_id, x, y, else_id FROM journey_nodes WHERE workspace_id = $1 AND flow_id = $2 ORDER BY id',
};

// ── the tools as Claude is told them ────────────────────────────────────────
const ID = what => ({ type: 'integer', description: `The id of ${what}: a whole number, taken from what a tool handed back — never guessed.` });
const KEY = what => ({ type: ['string', 'null'], description: `${what} The key of a step in "steps", or null for "nowhere": the workflow ends there for the deal.` });
const QUESTION = { type: ['object', 'null'], description: 'One If / else question, written exactly as a branch step\'s config ({ "test": … } with what that question needs), or null: every deal goes down this route.' };

const READ_TOOLS = [
  {
    name: 'list_workspaces',
    description: 'Lists every workspace of the platform with its id, its name and how much is in it (the number of members, pipelines, deals, contacts and workflows — counts, nothing about any single one). Call it to find the workspace the admin means, or its id, before anything else is looked up.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'workspace_setup',
    description: 'The structure of one workspace: its pipelines with their stages, the fields of its deals and of its contacts (key, label, type and, for a field with fixed choices, the choices), its lead webhooks (name, whether it is switched on, whether it makes a deal for a lead and in which pipeline), its members (id, name, role), what is connected (Gmail for workflow emails, fonio for calls, Cal.com, Calendly, how many Facebook Pages), its workflows (name, on or off, what starts them, how many steps) and the limits. Every id a workflow may name — a stage, a pipeline, a lead webhook, a member, another workflow, a field\'s key — comes from here. Call it for the workspace before proposing a workflow there.',
    input_schema: { type: 'object', properties: { workspace_id: ID('the workspace') }, required: ['workspace_id'], additionalProperties: false },
  },
  {
    name: 'read_workflow',
    description: 'One existing workflow of a workspace with all its boxes as they are saved: each box\'s kind, title, text, wait, settings and the box its lines lead to (next_id; else_id for the "no" line of an If / else and the "otherwise" line of a router; a router\'s routes carry their own lines). Call it to see how the workspace already does something, or to build a new workflow like an existing one. It only reads: an existing workflow cannot be changed.',
    input_schema: { type: 'object', properties: { workspace_id: ID('the workspace'), flow_id: ID('the workflow, as workspace_setup lists it') }, required: ['workspace_id', 'flow_id'], additionalProperties: false },
  },
];

// What it takes is the SPEC of utils/journey-create.js plus where it is for, why, and what the admin should know.
// Not strict: a box's settings are a free-form object, checked by the journey's own checks when it is proposed.
const PROPOSE_TOOL = {
  name: 'propose_workflow',
  description: 'Proposes ONE new workflow for a workspace. The workflow is checked with the same checks the Workflows page itself uses and, when it passes, shown to the admin as a card with a "Create" button. Nothing is written into the workspace by this call: the workflow exists only once the admin presses that button, and then it is switched off until someone in the workspace switches it on. When the checks find problems they are all handed back at once, each with the step it is about: correct them and propose again. Look the workspace up with workspace_setup first — every id in the workflow must be that workspace\'s own.',
  input_schema: {
    type: 'object',
    properties: {
      workspace_id: ID('the workspace the workflow is for'),
      name: { type: 'string', description: 'The workflow\'s name as the team will see it in their list: 1 to 80 characters, in the workspace\'s language.' },
      explain: { type: 'string', description: 'For the admin: what the workflow does from start to end, in two or three plain sentences, in the language the admin writes in.' },
      start: {
        type: 'object',
        description: 'What takes a deal into the workflow, and where the workflow ends for a deal.',
        properties: {
          config: { type: 'object', description: 'The start\'s settings: "trigger" (required: one of the starts of the reference) with what that start needs, optionally "pipeline_id", and the end rules ("stop_stage_ids", "stay_stage_ids", "stop_on" with "stop_set").' },
          next: KEY('The first step.'),
          explain: { type: 'string', description: 'For the admin: one sentence saying when a deal is taken in and when the workflow ends for it.' },
        },
        required: ['config', 'next'],
      },
      steps: {
        type: 'array',
        description: 'The steps, one action each. Their order here means nothing: the order of the workflow is its lines ("next", "else", a route\'s "next"). Every step must be reached by a line, and no line may lead round in a circle.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'A name for this step inside this proposal, to draw lines to it: a small letter, then up to 29 small letters, digits or underscores (mail1, wait_2_days). Each key once.' },
            kind: { type: 'string', enum: KINDS, description: 'What the step does: one of the kinds of step the reference describes.' },
            title: { type: 'string', description: 'An email\'s subject; the title of a task, a WhatsApp, an SMS or a call step. Up to 120 characters. An email, task, whatsapp, sms and call step needs one; a move, wait, branch and router step does not.' },
            body: { type: 'string', description: 'An email\'s text (plain text or HTML); the text of a task, a WhatsApp or an SMS. Up to 20000 characters. Variables like {{first_name|there}} are filled in for each deal.' },
            wait_minutes: { type: 'integer', description: 'How long after the step before it this step happens, in minutes: 0 is at once, 1440 a day, at most 525600.' },
            config: { type: 'object', description: 'The settings of this kind of step, as the reference says: {} for most; { "stage_id": … } for move; the question for branch; { "until": "HH:MM", "weekdays": [...] } for a wait until a time of day. A router\'s routes are not written here but in "routes".' },
            next: KEY('Where the deal goes after this step — for a branch step: when the answer is yes. A router has none (leave it out).'),
            else: KEY('Only on a branch step (when the answer is no) and on a router (when no route says yes).'),
            routes: {
              type: 'array',
              description: 'Only on a router: its 1 to 6 routes. A deal goes down EVERY route whose question is answered with yes.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'What the route is called on the board, up to 60 characters.' },
                  when: QUESTION,
                  next: KEY('Where this route leads.'),
                },
                required: ['next'],
              },
            },
            explain: { type: 'string', description: 'For the admin: one sentence saying what this step does and why it is there.' },
          },
          required: ['key', 'kind'],
        },
      },
      notes: {
        type: 'array',
        description: 'For the admin, shown as warnings on the card: everything the workflow needs that the workspace does not have yet or that someone must check before switching it on (Gmail is not connected, fonio is switched off, a stage the order named does not exist and which one was used instead, a text that should be read through). Leave empty when there is nothing.',
        items: { type: 'string' },
      },
    },
    required: ['workspace_id', 'name', 'explain', 'start', 'steps'],
  },
};
const TOOLS = [...READ_TOOLS, PROPOSE_TOOL];

// ── running the three that read ─────────────────────────────────────────────
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2147483647 ? v : null);
const NO_WORKSPACE = 'There is no workspace with that id. list_workspaces shows the ones there are.';
// A field as it is told: its key, its label, its type and — where it has fixed choices — the choices, as short texts.
function fieldOf(row) {
  const out = { key: row.field_key, label: row.name, type: row.type };
  const options = (Array.isArray(row.options) ? row.options : []).filter(o => typeof o === 'string' || typeof o === 'number').map(o => String(o).slice(0, MAX_OPTION)).slice(0, MAX_OPTIONS);
  if (options.length) out.options = options;
  return out;
}

async function listWorkspaces(pool) {
  const { rows } = await pool.query(SQL.workspaces);
  return rows.map(r => ({ id: r.id, name: r.name, members: r.members, pipelines: r.pipelines, deals: r.deals, contacts: r.contacts, workflows: r.workflows }));
}

async function workspaceSetup(pool, wid) {
  const { rows: [workspace] } = await pool.query(SQL.workspace, [wid]);
  if (!workspace) return null;
  const ask = async sql => (await pool.query(sql, [wid])).rows;
  const [pipelines, stages, dealFields, contactFields, webhooks, members, connected, flows] = [await ask(SQL.pipelines), await ask(SQL.stages), await ask(SQL.dealFields), await ask(SQL.contactFields),
    await ask(SQL.webhooks), await ask(SQL.members), await ask(SQL.connected), await ask(SQL.flows)];
  const c = connected[0] || {};
  return {
    workspace: { id: workspace.id, name: workspace.name },
    pipelines: pipelines.map(p => ({ id: p.id, name: p.name, stages: stages.filter(s => s.pipeline_id === p.id).map(s => ({ id: s.id, name: s.name, position: s.position })) })),
    deal_fields: dealFields.map(fieldOf),
    contact_fields: contactFields.map(fieldOf),
    lead_webhooks: webhooks.map(h => ({ id: h.id, name: h.name, active: !!h.active, makes_deals: !!h.create_deal, pipeline_id: h.pipeline_id ?? null })),
    members: members.map(m => ({ id: m.id, name: m.name, role: m.role })),
    // fonio: a connection is there; fonio_on: and it is switched on — only then does a call step call anybody
    connected: { gmail: !!c.gmail, fonio: !!c.fonio, fonio_on: !!c.fonio_on, calcom: !!c.calcom, calendly: !!c.calendly, facebook_pages: Number(c.facebook_pages) || 0 },
    workflows: flows.map(f => ({ id: f.id, name: f.name, active: !!f.active, trigger: f.start_trigger || null, boxes: f.boxes })),
    limits: { ...LIMITS },
  };
}

// The workflow as GET /api/journey gives it: { id, name, active, updated_at, nodes: [...] } — or null.
async function readWorkflow(pool, wid, flowId) {
  const { rows: [flow] } = await pool.query(SQL.flow, [wid, flowId]);
  if (!flow) return null;
  const { rows: nodes } = await pool.query(SQL.nodes, [wid, flowId]);
  // each box by its named columns only: whatever else a row may carry is not passed on
  return { id: flow.id, name: flow.name, active: !!flow.active, updated_at: flow.updated_at,
    nodes: nodes.map(n => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, wait_minutes: n.wait_minutes, config: n.config, next_id: n.next_id, x: n.x, y: n.y, else_id: n.else_id })) };
}

// One of the three reading tools: { ok: true, data } — or { ok: false, error } with a sentence Claude can act on. A
// name that is none of them, or an input that is no id, is such an error and never a throw (what the database itself
// throws is thrown on: that is the server's to know about).
async function runRead(pool, name, input) {
  const i = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (name === 'list_workspaces') return { ok: true, data: await listWorkspaces(pool) };
  if (name === 'workspace_setup' || name === 'read_workflow') {
    const wid = idOf(i.workspace_id);
    if (!wid) return { ok: false, error: 'workspace_id must be the id of a workspace: a whole number above 0, as list_workspaces gives it.' };
    if (name === 'workspace_setup') {
      const data = await workspaceSetup(pool, wid);
      return data ? { ok: true, data } : { ok: false, error: NO_WORKSPACE };
    }
    const flowId = idOf(i.flow_id);
    if (!flowId) return { ok: false, error: 'flow_id must be the id of a workflow: a whole number above 0, as workspace_setup lists it.' };
    const data = await readWorkflow(pool, wid, flowId);
    return data ? { ok: true, data } : { ok: false, error: 'There is no such workflow in that workspace. workspace_setup lists the workspace\'s workflows.' };
  }
  return { ok: false, error: `There is no tool called "${String(name).slice(0, 40)}" that reads. The tools are: ${READ_TOOLS.map(t => t.name).join(', ')}.` };
}

// What a tool did, in one short sentence for the console ("Looked at …"). data: what it handed back, or nothing when
// it found nothing.
function summary(name, input, data) {
  const i = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const said = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (name === 'list_workspaces') return Array.isArray(data) ? `Looked at the list of workspaces (${data.length})` : 'Looked at the list of workspaces';
  if (name === 'workspace_setup') return data && data.workspace ? `Looked at the setup of "${said(data.workspace.name)}"` : `Looked for a workspace with the id ${said(i.workspace_id)} and found none`;
  if (name === 'read_workflow') return data && typeof data.name === 'string' ? `Read the workflow "${said(data.name)}"` : `Looked for a workflow with the id ${said(i.flow_id)} and found none`;
  if (name === 'propose_workflow') return `Proposed the workflow "${said(i.name)}"`;
  return `Asked for "${said(name)}", which there is not`;
}

module.exports = { KINDS, LIMITS, SQL, READ_TOOLS, PROPOSE_TOOL, TOOLS, runRead, summary };
