/* ═══════════════════════════════════════════════════════════════════════════
   /api/admin/assistant — the admin console's assistant
   (ASSISTANT_CHANGES Part 1, 2026-11-24; utils/assistant.js is Claude's side,
   utils/assistant-tools.js what it may look up, utils/assistant-prompt.js what
   it is told, utils/journey-create.js what makes a workflow; the "Assistant"
   tab of public/admin.html is its page).

   Platform console only: every route is behind requireAdmin.

   WHAT THE ASSISTANT CAN DO IS WHAT EXISTS HERE — not what it is told:
     · it has FOUR tools: three that only read (list_workspaces,
       workspace_setup, read_workflow — utils/assistant-tools.js, SELECTs
       only) and propose_workflow, which writes ONE row into
       assistant_proposals and nothing into any workspace
     · a workflow is written into a workspace only when the admin presses
       "Create" (POST …/proposals/:id/create) — through the journey's own
       checks (utils/journey-create.js with routes/journey.js's `boxes`),
       and always switched off: nothing here ever sets `active`
     · "Undo" (the admin's click) takes that workflow away again, only while
       it is as it was made; after an undo "Create again" makes it again
     · no statement of this file updates or deletes a table of a workspace:
       the two that do are journeyCreate.create and journeyCreate.remove

     GET  /assistant                     { configured, model, max_text, chats:
                                         [{ id, title, updated_at }] } — the
                                         newest twenty conversations
     POST /assistant/ask                 { chat_id | null, text } → { chat_id,
                                         reply, looked_at: [sentence],
                                         proposals: [Proposal] }: one order.
                                         chat_id null begins a conversation.
     GET  /assistant/chats/:id           { chat: { id, title, entries: [{ role:
                                         'you' | 'assistant', text, proposals
                                         }] } } — a conversation to read again
     GET  /assistant/proposals           { proposals } — the newest fifty
     POST /assistant/proposals/:id/create  the workflow is made in its
                                         workspace, switched off → { proposal }
     POST /assistant/proposals/:id/undo  it is taken away again → { proposal }

   Proposal: { id, chat_id, workspace_id, workspace_name, name, asked, explain,
   status (proposed | created | undone), flow_id, created_at, made_at,
   undone_at, notes: [text], start: { label, explain, settings, next }, steps:
   [{ key, kind, label, title, body, wait_minutes, explain, settings, next,
   else, routes }] } — start and steps are journeyCreate.view() of the checked
   proposal as it was when it was made (kept in the row), each box with the
   `explain` Claude wrote for it.

   ONE ORDER (POST /assistant/ask)
     1. The conversation is claimed (assistant_chats.busy_at; free again when
        the request ends, or after five minutes whatever became of it), so two
        requests never add to one conversation. A new conversation gets its
        row only when there is something to keep.
     2. The admin's text is added, and Claude's loop runs (utils/assistant.js
        ask) with the four tools. A lookup's answer is JSON text, cut at 60 000
        characters. A proposal is checked by the journey's own rules, on the
        clock of the workspace's owner: problems go back to Claude, every one
        of them, to be repaired; a proposal that holds is kept as a row and
        Claude is told that nothing is written until the admin presses
        "Create". At most five proposals an order.
     3. The conversation as it has grown is saved once, at the end — also when
        Claude's side failed after tools ran (what is whole is kept; it never
        ends on tool calls without their answers). An order that brought no
        answer at all is not kept: a declined text would stand in the way of
        every later one.

   REFUSALS  { error, code }: not_configured (503), text (400: empty or more
   than 4000 characters), chat (404), busy (409), key / rate / unreachable /
   declined / too_long / rejected (502: Anthropic's side — a refusal after
   the conversation was kept also names its chat_id); for a proposal:
   not_found (404), state (409: already created / nothing to undo), workspace
   (409: it no longer exists), limit (409), invalid (409, with `problems`:
   it no longer fits the workspace), changed (409: the workflow was switched
   on, has run or was changed — it is removed in the workspace, not here).

   The API key never leaves utils/assistant.js: no answer, no refusal and no
   log line of this file holds it.
   ═══════════════════════════════════════════════════════════════════════════ */

const express       = require('express');
const router        = express.Router();
const { pool }      = require('../db');
const requireAdmin  = require('../middleware/admin-auth');
const assistant     = require('../utils/assistant');          // Claude's side: one order to its end
const tools         = require('../utils/assistant-tools');    // what Claude may look up, and the four tools' definitions
const prompt        = require('../utils/assistant-prompt');   // what Claude is told
const journeyCreate = require('../utils/journey-create');     // a whole workflow, checked and made in one piece
const triggers      = require('../utils/journey-triggers');   // the zone that counts where a workspace's owner has none
const log           = require('../utils/journey-log');        // the workflows' own record: made and taken away are entries of it
const { boxes }     = require('./journey');                   // the journey's own checks, limits and sentences

const MAX_TEXT = 4000, MAX_TITLE = 60, MAX_RESULT = 60000, MAX_PROPOSALS = 5, MAX_NOTES = 20, MAX_NOTE = 500, MAX_EXPLAIN = 2000;
const PROPOSAL_COLUMNS = 'id, chat_id, workspace_id, workspace_name, name, asked, explain, spec, view, notes, status, flow_id, created_at, made_at, undone_at';
const ERRORS = {
  not_configured: [503, 'The assistant is not set up on this server: ANTHROPIC_API_KEY is missing.'],
  text:           [400, `Write what the assistant should do, in up to ${MAX_TEXT} characters.`],
  chat:           [404, 'That conversation does not exist.'],
  busy:           [409, 'The assistant is still working on this conversation. Wait for its answer.'],
  key:            [502, 'Anthropic does not accept the API key of this server.'],
  rate:           [502, 'Anthropic is limiting requests at the moment. Try again in a minute.'],
  unreachable:    [502, 'Anthropic could not be reached.'],
  declined:       [502, 'The assistant declined this request.'],
  too_long:       [502, 'The assistant did not come to an end: too many steps, or too long an answer. Ask for less at once.'],
  rejected:       [502, 'Anthropic refused the request.'],
  not_found:      [404, 'That proposal does not exist.'],
  state:          [409, 'This workflow was already created.'],
  nothing:        [409, 'There is nothing to undo: no workflow was made of this proposal.', 'state'],
  workspace:      [409, 'The workspace no longer exists.'],
  limit:          [409, `The workspace already has ${boxes.MAX_FLOWS} workflows.`],
  invalid:        [409, 'The proposal no longer fits the workspace.'],
  changed:        [409, 'It was switched on, has run or was changed in the workspace. Remove it there.'],
};
const refuse = (res, key, more = {}) => res.status(ERRORS[key][0]).json({ error: more.detail ? `${ERRORS[key][1]} ${more.detail}` : ERRORS[key][1], code: ERRORS[key][2] || key, ...(more.extra || {}) });
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2147483647 ? v : null);
const paramId = v => (/^[1-9]\d{0,8}$/.test(String(v)) ? Number(v) : null);
const words = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// A proposal as the console is told it: the row, and each box of its view with the sentence Claude wrote for it.
function proposalOf(row) {
  const spec = row.spec && typeof row.spec === 'object' ? row.spec : {}, view = row.view && typeof row.view === 'object' ? row.view : {};
  const told = new Map((Array.isArray(spec.steps) ? spec.steps : []).filter(s => s && typeof s === 'object').map(s => [s.key, words(s.explain, MAX_EXPLAIN)]));
  return {
    id: row.id, chat_id: row.chat_id, workspace_id: row.workspace_id, workspace_name: row.workspace_name, name: row.name, asked: row.asked, explain: row.explain,
    status: row.status, flow_id: row.flow_id, created_at: row.created_at, made_at: row.made_at, undone_at: row.undone_at,
    notes: (Array.isArray(row.notes) ? row.notes : []).filter(n => typeof n === 'string'),
    start: { ...(view.start && typeof view.start === 'object' ? view.start : {}), explain: words(spec.start && spec.start.explain, MAX_EXPLAIN) },
    steps: (Array.isArray(view.steps) ? view.steps : []).filter(s => s && typeof s === 'object').map(s => ({ ...s, explain: told.get(s.key) || '' })),
  };
}

// The clock a workspace's workflows are written on: its owner's, else the zone every legacy row has.
async function zoneOf(workspaceId) {
  const { rows: [owner] } = await pool.query(`SELECT timezone FROM users WHERE workspace_id = $1 AND role = 'owner' ORDER BY id LIMIT 1`, [workspaceId]);
  return owner && typeof owner.timezone === 'string' && owner.timezone ? owner.timezone : triggers.FALLBACK_ZONE;
}

router.get('/assistant', requireAdmin, async (req, res, next) => {
  try {
    const c = assistant.config();
    const { rows: chats } = await pool.query('SELECT id, title, updated_at FROM assistant_chats ORDER BY updated_at DESC, id DESC LIMIT 20');
    res.json({ configured: !!c, model: c ? c.model : assistant.DEFAULT_MODEL, max_text: MAX_TEXT, chats });
  } catch (err) { next(err); }
});

// One order. See the header: claimed, asked, kept once at the end.
router.post('/assistant/ask', requireAdmin, async (req, res, next) => {
  let chatId = null, held = false;
  try {
    const c = assistant.config();
    if (!c) return refuse(res, 'not_configured');
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > MAX_TEXT) return refuse(res, 'text');
    let before = [];
    if (req.body.chat_id !== null && req.body.chat_id !== undefined) {
      const id = idOf(req.body.chat_id);
      if (!id) return refuse(res, 'chat');
      const { rows: [mine] } = await pool.query(`UPDATE assistant_chats SET busy_at = NOW() WHERE id = $1 AND (busy_at IS NULL OR busy_at < NOW() - INTERVAL '5 minutes') RETURNING id, messages`, [id]);
      if (!mine) {
        const { rows: [there] } = await pool.query('SELECT id FROM assistant_chats WHERE id = $1', [id]);
        return refuse(res, there ? 'busy' : 'chat');
      }
      chatId = id; held = true;
      before = Array.isArray(mine.messages) ? mine.messages : [];
    }
    // a new conversation gets its row when a proposal needs to name it, or at the end — claimed from its first moment
    const chat = async () => {
      if (!chatId) {
        const { rows: [made] } = await pool.query('INSERT INTO assistant_chats (title, busy_at) VALUES ($1, NOW()) RETURNING id', [text.replace(/\s+/g, ' ').slice(0, MAX_TITLE)]);
        chatId = made.id; held = true;
      }
      return chatId;
    };

    const looked = [], proposed = [];
    // What Claude's tools do. Never a throw: what goes wrong on this server is said to Claude as a failed tool.
    const propose = async input => {
      if (proposed.length >= MAX_PROPOSALS) return { content: `No more than ${MAX_PROPOSALS} proposals in one request. Tell the admin what is still open.`, is_error: true };
      const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const workspaceId = idOf(b.workspace_id);
      const { rows: [workspace] } = workspaceId ? await pool.query('SELECT id, name FROM workspaces WHERE id = $1', [workspaceId]) : { rows: [] };
      if (!workspace) return { content: 'There is no workspace with that id. Look the workspace up with list_workspaces first.', is_error: true };
      const spec = { name: b.name, explain: words(b.explain, MAX_EXPLAIN), start: b.start, steps: b.steps };
      const out = await journeyCreate.check(pool, workspace.id, spec, { boxes, tz: await zoneOf(workspace.id) });
      if (!out.ok) {
        const lines = (Array.isArray(out.problems) ? out.problems : []).map(p => `- ${p.where}: ${p.message} (${p.code})`);
        return { content: `The proposal was not accepted, and nothing was kept. Problems:\n${lines.join('\n')}\nCorrect every one of them and propose again.`, is_error: true };
      }
      const notes = (Array.isArray(b.notes) ? b.notes : []).filter(n => typeof n === 'string' && n.trim()).slice(0, MAX_NOTES).map(n => n.trim().slice(0, MAX_NOTE));
      const { rows: [row] } = await pool.query(
        `INSERT INTO assistant_proposals (chat_id, workspace_id, workspace_name, name, asked, explain, spec, view, notes) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb) RETURNING id`,
        [await chat(), workspace.id, workspace.name, String(spec.name).trim(), text, spec.explain, JSON.stringify(spec), JSON.stringify(journeyCreate.view(out.plan)), JSON.stringify(notes)]
      );
      proposed.push(row.id);
      return { content: `Proposal ${row.id} is shown to the admin with a Create button. Nothing is written into the workspace until they press it.`, is_error: false };
    };
    const runTool = async (name, input) => {
      try {
        if (name === tools.PROPOSE_TOOL.name) return await propose(input);
        const out = await tools.runRead(pool, name, input);
        if (!out.ok) return { content: String(out.error), is_error: true };
        looked.push(tools.summary(name, input, out.data));
        const said = JSON.stringify(out.data);
        return { content: said.length > MAX_RESULT ? `${said.slice(0, MAX_RESULT)}\n[cut: the answer was longer than ${MAX_RESULT} characters]` : said, is_error: false };
      } catch (err) {
        console.error('assistant: a tool failed:', name, (err && err.message) || err);
        return { content: 'The tool failed on this server.', is_error: true };
      }
    };

    let out = null, failure = null;
    try { out = await assistant.ask(assistant.client(), { model: c.model, system: prompt.SYSTEM, tools: tools.TOOLS, messages: [...before, { role: 'user', content: text }], runTool }); }
    catch (err) {
      if (!(err instanceof assistant.AssistantError)) throw err;
      failure = err;
    }
    // what is kept: everything of an order that came to its end; of one that failed, only what grew beyond the
    // admin's own text (the tools that ran, with their answers)
    const history = failure ? (Array.isArray(failure.messages) ? failure.messages : []) : out.messages;
    if (!failure || history.length > before.length + 1) {
      await pool.query('UPDATE assistant_chats SET messages = $2::jsonb, busy_at = NULL, updated_at = NOW() WHERE id = $1', [await chat(), JSON.stringify(history)]);
      held = false;
    }
    if (failure) return refuse(res, failure.code in ERRORS ? failure.code : 'rejected', { detail: failure.code === 'rejected' ? failure.message : '', extra: chatId && !held ? { chat_id: chatId } : {} });
    const { rows } = proposed.length ? await pool.query(`SELECT ${PROPOSAL_COLUMNS} FROM assistant_proposals WHERE id = ANY($1::int[]) ORDER BY id`, [proposed]) : { rows: [] };
    res.json({ chat_id: chatId, reply: out.reply, looked_at: looked, proposals: rows.map(proposalOf) });
  } catch (err) { next(err); }
  finally {
    // whatever happened, a conversation that was claimed and not saved is free again
    if (held && chatId) await pool.query('UPDATE assistant_chats SET busy_at = NULL WHERE id = $1', [chatId]).catch(() => {});
  }
});

// A conversation as the console reads it again: what the admin wrote, and for each order the assistant's last words
// with the proposals it made. The proposals are found by the sentence this server answered the tool with.
function entriesOf(messages, byId) {
  const entries = [];
  let open = null;   // the assistant's entry of the order that is being read
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || typeof m !== 'object') continue;
    const blocks = Array.isArray(m.content) ? m.content.filter(b => b && typeof b === 'object') : [];
    if (m.role === 'user') {
      const said = typeof m.content === 'string' ? m.content : blocks.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n\n');
      for (const b of blocks.filter(x => x.type === 'tool_result' && !x.is_error && typeof x.content === 'string')) {
        const made = /^Proposal (\d+) is shown to the admin/.exec(b.content);
        if (made && open && byId.has(Number(made[1]))) open.proposals.push(byId.get(Number(made[1])));
      }
      if (said.trim()) { entries.push({ role: 'you', text: said, proposals: [] }); open = null; }
    } else if (m.role === 'assistant') {
      if (!open) { open = { role: 'assistant', text: '', proposals: [] }; entries.push(open); }
      const said = blocks.filter(b => b.type === 'text' && typeof b.text === 'string' && b.text.trim()).map(b => b.text.trim()).join('\n\n');
      if (said) open.text = said;   // the last words of the order are its answer
    }
  }
  return entries;
}

router.get('/assistant/chats/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    const { rows: [chat] } = id ? await pool.query('SELECT id, title, messages FROM assistant_chats WHERE id = $1', [id]) : { rows: [] };
    if (!chat) return refuse(res, 'chat');
    const { rows } = await pool.query(`SELECT ${PROPOSAL_COLUMNS} FROM assistant_proposals WHERE chat_id = $1 ORDER BY id`, [id]);
    res.json({ chat: { id: chat.id, title: chat.title, entries: entriesOf(chat.messages, new Map(rows.map(r => [r.id, proposalOf(r)]))) } });
  } catch (err) { next(err); }
});

router.get('/assistant/proposals', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${PROPOSAL_COLUMNS} FROM assistant_proposals ORDER BY id DESC LIMIT 50`);
    res.json({ proposals: rows.map(proposalOf) });
  } catch (err) { next(err); }
});

// "Create": the proposal becomes a workflow in its workspace — checked again, in one piece, switched off. The row is
// claimed first, so two clicks make one workflow; whatever fails afterwards puts it back as it was.
router.post('/assistant/proposals/:id/create', requireAdmin, async (req, res, next) => {
  const id = paramId(req.params.id);
  let was = null;
  const putBack = () => pool.query(`UPDATE assistant_proposals SET status = $2 WHERE id = $1 AND status = 'created'`, [id, was]);
  try {
    if (!id) return refuse(res, 'not_found');
    const { rows: [mine] } = await pool.query(`UPDATE assistant_proposals SET status = 'created' WHERE id = $1 AND status IN ('proposed','undone') RETURNING ${PROPOSAL_COLUMNS}`, [id]);
    if (!mine) {
      const { rows: [there] } = await pool.query('SELECT id FROM assistant_proposals WHERE id = $1', [id]);
      return refuse(res, there ? 'state' : 'not_found');
    }
    was = mine.undone_at ? 'undone' : 'proposed';   // an undone proposal is the only one with that time
    if (!mine.workspace_id) { await putBack(); was = null; return refuse(res, 'workspace'); }
    const record = entry => log.record(pool, { workspaceId: mine.workspace_id, event: 'flow', actorId: null, detail: 'created', ...entry });
    const out = await journeyCreate.create(pool, mine.workspace_id, mine.spec, { boxes, tz: await zoneOf(mine.workspace_id), record });
    if (!out.ok) {
      await putBack(); was = null;
      if (out.code === 'workspace' || out.code === 'limit') return refuse(res, out.code);
      return refuse(res, 'invalid', { extra: { problems: (Array.isArray(out.problems) ? out.problems : []).map(p => `${p.where}: ${p.message}`) } });
    }
    // made — and written on the proposal's row. Should that fail, the workflow just made is taken away again (it is
    // untouched: nobody has seen it yet) so that the row and the workspace never say different things; the catch
    // below then puts the status back.
    let row;
    try {
      ({ rows: [row] } = await pool.query(
        `UPDATE assistant_proposals SET flow_id = $2, flow_updated_at = $3, made_at = NOW(), undone_at = NULL WHERE id = $1 RETURNING ${PROPOSAL_COLUMNS}`, [id, out.flowId, out.updatedAt]
      ));
    } catch (err) {
      await journeyCreate.remove(pool, mine.workspace_id, out.flowId, out.updatedAt).catch(() => {});
      throw err;
    }
    was = null;   // from here on nothing puts it back
    res.json({ proposal: proposalOf(row) });
  } catch (err) {
    if (was) await putBack().catch(() => {});
    next(err);
  }
});

// "Undo": the workflow that was made of the proposal is taken away — only while it is exactly as it was made
// (journeyCreate.remove carries that in its one statement). The journey's record gets the entry its own delete writes.
router.post('/assistant/proposals/:id/undo', requireAdmin, async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    const { rows: [p] } = id ? await pool.query('SELECT id, status, workspace_id, name, flow_id, flow_updated_at FROM assistant_proposals WHERE id = $1', [id]) : { rows: [] };
    if (!p) return refuse(res, 'not_found');
    if (p.status !== 'created' || !p.flow_id) return refuse(res, 'nothing');
    if (!p.workspace_id) return refuse(res, 'workspace');
    if (!await journeyCreate.remove(pool, p.workspace_id, p.flow_id, p.flow_updated_at)) {
      // not removed: either it was touched — or it is no longer there at all (deleted in the workspace, or by an undo
      // whose own row could not be written): then there is nothing left to undo, and the row says so
      const { rows: [there] } = await pool.query('SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2', [p.flow_id, p.workspace_id]);
      if (there) return refuse(res, 'changed');
      const { rows: [gone] } = await pool.query(`UPDATE assistant_proposals SET status = 'undone', undone_at = NOW() WHERE id = $1 RETURNING ${PROPOSAL_COLUMNS}`, [id]);
      return res.json({ proposal: proposalOf(gone) });
    }
    const { rows: [row] } = await pool.query(`UPDATE assistant_proposals SET status = 'undone', undone_at = NOW() WHERE id = $1 RETURNING ${PROPOSAL_COLUMNS}`, [id]);
    await log.record(pool, { workspaceId: p.workspace_id, event: 'flow', actorId: null, flowId: null, flowName: p.name, title: p.name, detail: 'deleted' });
    res.json({ proposal: proposalOf(row) });
  } catch (err) { next(err); }
});

module.exports = router;
