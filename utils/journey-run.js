/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY RUN — what makes a workflow happen
   (CUSTOMER_JOURNEY_CHANGES Part 4, 2026-11-19; routes/journey.js has the
   workflows, utils/journey-mail.js the Gmail side).

   A WORKFLOW RUNS WHILE IT IS SWITCHED ON (journey_flows.active). A deal's row
   in journey_runs names the box that happens next (node_id) and when
   (due_at). A deal is in a workflow once per thing that happened (UNIQUE
   flow + deal + event_key): once for a start a deal goes through once (a new
   lead, a stage — event_key ''), and once more for every further booking,
   call or change of a start that can happen again.

   TAKING DEALS IN  every tick enrollNew() asks, for each workflow that is on,
   which deals its start takes in now. Every start — a new lead, a deal in a
   stage, a booking, a call's result, a field that changed, so many hours
   before a meeting — is utils/journey-triggers.js (find). None of them sees
   anything from before the workflow was switched on (activated_at; baseline()
   writes down what is there at that moment). No route has to say "a deal
   arrived": whatever makes or moves a deal, now or later, is seen here within
   one tick. A deal from before is taken in by hand: include() — "Add to a
   workflow" on a deal.

   A TICK  runDue() takes each row whose time has come: it is claimed first
   (waiting → working in one UPDATE, so no step happens twice), then checked —
   the deal has reached one of the start's stop stages: the workflow ends for
   it — then the box happens, what it did is written to journey_log, and the
   row moves on to the box after it, due after that box's wait.

   THE RECORD (Part 15, utils/journey-log.js)  Beside what each box did, the
   record says when a deal was taken in and by what (the start, or a person),
   that a step will be tried again, and when and why the workflow was over for
   a deal. Those entries never hold a workflow up: a record that cannot be
   written is said in the server's log. The step's own entry is written the
   old way — a step whose outcome cannot be written down does not move on.

   THE BOXES
     email     through the workspace's Gmail address (workspace_mail). The text
               may be HTML; {{first_name}} and the like are filled in (Part 14,
               utils/journey-vars.js: every variable, {{name|fallback}}, the
               workspace's own fields), and a
               "no more emails" link is added unless the text places one itself
               ({{unsubscribe}}). No address connected, a contact without an
               email address or one who pressed that link: skipped, and the
               workflow goes on. Google not reachable: tried again later.
               Written onto the contact and the deal as an email entry.
               Before it goes out the address's limits are asked (Part 17,
               utils/journey-sends.js): an email there is no room for, or
               whose address is paused, WAITS at its step — status 'held':
               not sent, not failed, not a try. The row says why (held) and
               is due again when there is room; the record says it once.
               Google answering "limit" pauses the address. An email that
               went out is counted, and carries the one-click unsubscribe
               headers when the server's address is https.
     call      fonio is asked to call (utils/fonio-calls.js scheduleForJourney).
     task, whatsapp, sms   a task for the person the deal belongs to; its title
               and text are filled with the same variables.
     move      the deal is moved to the stage, with a note, the bell for the
               team and the Engine told, as when fonio moves a deal.
     branch    a question about the deal (Part 11, utils/journey-branch.js):
               the deal goes on along the box's "yes" line (next_id) or its
               "no" line (else_id). Nothing is done to the deal.
     router    several routes out, each with its own question (Part 23,
               utils/journey-router.js): the deal goes on down EVERY route
               whose answer is yes, side by side — or, when none says yes,
               along the "otherwise" line (else_id). Nothing is done to it.
     wait      nothing happens (Part 10): the box only takes time — its own
               wait, and then, when it says so, until a time of day on chosen
               weekdays (dueOf). What comes after it starts from there.

   A DEAL ON SEVERAL ROUTES (Part 23)  A deal that goes down two routes of a
   router is at two places of the workflow at once. The row the start made
   stands for the deal (the ROOT: root_id NULL); every further route is a row
   of its own that names it (root_id), with the root's started_at and an
   event_key of its own (the root's, '~' and a random tail). Each row is run
   like any row. A route that is through deletes its row (pathDone); when
   the root's own route is through while others are on their way, the root
   takes one of them over — so the root is 'done' exactly when the last
   route is, and only then does the record say "ended". A rule that ends the
   workflow ends it on every route at once (pathStopped). At most MAX_PATHS
   places per deal and workflow: a route beyond that is not gone down, and
   the record says so. "Include" (a restart) clears the routes of before.

   WHERE IT ENDS (Part 10)  stopReason() is asked each time a step is due,
   before the step: the deal is in a stop stage, or in none of the stages the
   workflow is meant for any more, or one of the other rules the start has
   switched on holds (Part 13, utils/journey-ends.js: a meeting booked, a
   call's result, the deal assigned, a field with a value, so many days …).

   NEVER OPENS THE DATABASE MODULE ITSELF: the pool is handed in, and so are
   notifyUser and the Engine (tell), by server.js and the route.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto     = require('crypto');
const mail       = require('./journey-mail');
const fonioCalls = require('./fonio-calls');
const baseUrl    = require('./base-url');
const triggers   = require('./journey-triggers');   // everything that can start a workflow (Part 9)
const branch     = require('./journey-branch');     // a box that asks a question and has two lines out (Part 11)
const ends       = require('./journey-ends');       // everything that can end a workflow for a deal, beside its stage (Part 13)
const vars       = require('./journey-vars');       // the variables a step's text can use: {{first_name}}, {{deal.<field>}} … (Part 14)
const log        = require('./journey-log');        // the whole record of what the workflows do (Part 15)
const sends      = require('./journey-sends');      // the sending limits, the count and the pause of the address (Part 17)
const routes     = require('./journey-router');     // a box with several routes out, each with its own question (Part 23)

const RETRY_MINUTES = 15;   // an email Google could not be reached for is tried again after this
const MAX_ATTEMPTS  = 4;    // … this many times in all; then the step counts as failed and the workflow goes on
const STUCK_MINUTES = 15;   // a row a crashed tick left as 'working' is taken up again after this
const ENROLL_LIMIT  = 200;  // deals taken into one workflow in one tick
const MAX_PLACE     = 20000;
const MAX_PATHS     = 24;   // the places a deal can be at in one workflow at once (Part 23): a route beyond that is not gone down

// ── the email's text ────────────────────────────────────────────────────────
const htmlText = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isHtml = s => /<\/?[a-z][^<>]*>/i.test(String(s || ''));

// What stands for what between two braces, and how it is put in, is utils/journey-vars.js (Part 14).
// An HTML text as plain text, for the mail programs that show no HTML: line breaks where blocks end, no tags.
function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => { const l = label.replace(/<[^>]+>/g, '').trim(); return l && l !== href ? `${l} (${href})` : href; })
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The "no more emails" link: the contact's id, signed, so nobody can switch another person's emails off by guessing.
function unsubscribeSig(contactId) {
  const secret = process.env.SESSION_SECRET || 'change-me-in-production';
  return crypto.createHmac('sha256', secret).update('journey-unsubscribe:' + contactId).digest('base64url');
}
const unsubscribeToken = contactId => `${Number(contactId)}.${unsubscribeSig(Number(contactId))}`;
// The contact a token names, or null for anything this server did not sign.
function contactOfToken(token) {
  const m = /^([1-9]\d{0,9})\.([\w-]+)$/.exec(String(token || ''));
  if (!m) return null;
  const want = Buffer.from(unsubscribeSig(Number(m[1]))), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? Number(m[1]) : null;
}
// Where the link leads: the server's public address is needed (APP_BASE_URL or BASE_URL); without one, no link.
function unsubscribeUrl(contactId, origin = baseUrl(null)) {
  return origin && contactId ? `${origin}/api/journey/unsubscribe/${unsubscribeToken(contactId)}` : null;
}

// An email box as what is sent: { subject, html, text }. The text may be HTML or plain text. given: the values of
// its variables (vars.valuesFor for a deal, vars.sampleFor for the test email). link: the "no more emails" address,
// put where the text says {{unsubscribe}} (or {{abmelden}}, {{unsubscribe_url}}), and in a small line at the end.
// THE LINE AT THE END (Part 19): an email never goes out without the link. A text that has none always gets the
// line. A text that has its own gets it only when the step asks for it (config.footer true — the tick box of the
// step's window); switched off there, or a step saved before there was a tick box: the text's own link is enough.
function emailParts(node, given, link) {
  const values = { ...(given || {}), unsubscribe: link || '' };
  const raw = String(node.body || '');
  const footer = !vars.usedIn(raw).has('unsubscribe') || !!(node.config && typeof node.config === 'object' && node.config.footer === true);
  let html, text;
  if (isHtml(raw)) {
    html = vars.fill(raw, values, true);
    text = htmlToText(html);
  } else {
    text = vars.fill(raw, values, false);
    html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0F141C">${htmlText(text).replace(/\r?\n/g, '<br>')}</div>`;
  }
  if (link && footer) {
    html += `<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6E7A8C;margin-top:28px">Keine weiteren E-Mails erhalten: <a href="${htmlText(link)}" style="color:#6E7A8C">abmelden</a></p>`;
    text += `\n\n--\nKeine weiteren E-Mails erhalten: ${link}`;
  }
  return { subject: vars.fill(node.title, values, false), html, text };
}

// ── what a box does ─────────────────────────────────────────────────────────
// Each answers { status: 'done' | 'skipped' | 'failed' | 'retry', detail } — an email also { status: 'held', detail,
// until }: it waits at its step until then (Part 17).
async function doEmail(pool, x, now, tell = {}) {
  const { rows: [sender] } = await pool.query('SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1', [x.workspace_id]);
  if (!sender) return { status: 'skipped', detail: 'no_sender' };
  const to = String(x.contact_email || '').trim().toLowerCase();
  if (!x.contact_id || !mail.isAddress(to)) return { status: 'skipped', detail: 'no_email' };
  if (x.journey_opt_out) return { status: 'skipped', detail: 'opted_out' };
  let refreshToken;
  try { refreshToken = mail.openToken(sender.refresh_token_sealed); }
  catch { return { status: 'failed', detail: 'gone' }; }   // sealed under an older server secret: only a new sign-in helps
  // Part 17: is there room for one more email from this address, and is it not paused? An email there is no room for
  // waits. Limits that cannot be asked are no leave to send: the email waits as well and is looked at again.
  const at = new Date(now).getTime();
  let door;
  try { door = await sends.gate(pool, { workspaceId: x.workspace_id, contactId: x.contact_id, now }); }
  catch (err) {
    console.error('journey: the sending limits could not be asked, the email waits:', err?.message || err);
    return { status: 'held', detail: 'error', until: new Date(at + RETRY_MINUTES * 60000) };
  }
  if (!door.state) return { status: 'skipped', detail: 'no_sender' };   // disconnected in this very moment
  if (!door.ok) return { status: 'held', detail: door.why, until: door.until };
  const link = unsubscribeUrl(x.contact_id);
  const parts = emailParts({ title: x.title, body: x.body, config: x.config }, await vars.valuesFor(pool, x, [x.title, x.body], now), link);
  try {
    await mail.send(await mail.accessToken(refreshToken), mail.buildMessage({ from: sender.email, to, ...parts, unsubscribe: link }));
  } catch (err) {
    if (!(err instanceof mail.MailError)) throw err;
    if (err.code === 'unreachable') return { status: 'retry', detail: 'unreachable' };
    if (err.code === 'limited') {
      // Google itself says "limit": the address is paused — nothing more is sent to Google from it — and this email waits
      let until = new Date(at + sends.PAUSE_FIRST_MS);
      try { until = (await sends.pause(pool, { from: sender.email, now, retryAt: err.retryAt, detail: err.message, tell })).until; }
      catch (e) { console.error('journey: the pause of the sending address could not be written:', e?.message || e); }
      return { status: 'held', detail: 'paused', until };
    }
    return { status: 'failed', detail: err.code === 'gone' ? 'gone' : `rejected: ${err.message}`.slice(0, 300) };
  }
  // the email is out: it is counted — a count that could not be written does not undo it
  await sends.sent(pool, { workspaceId: x.workspace_id, from: sender.email, contactId: x.contact_id, kind: 'step', now, state: door.state })
    .catch(err => console.error('journey: a sent email could not be counted:', err?.message || err));
  await pool.query(
    `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) VALUES ($1,$2,$3,'email',$4,NULL,'journey')`,
    [x.workspace_id, x.contact_id, x.deal_id, `Workflow · E-Mail gesendet\n\nBetreff: ${parts.subject}\nAn: ${to}\nWorkflow: ${x.flow_name}`]
  ).catch(() => {});   // the email is out; an entry that could not be written does not undo it
  return { status: 'done', detail: to };
}

async function doCall(pool, x, now) {
  const call = await fonioCalls.scheduleForJourney(pool, { workspaceId: x.workspace_id, dealId: x.deal_id, now });
  if (!call) return { status: 'skipped', detail: 'fonio_off' };
  return call.status === 'scheduled' ? { status: 'done', detail: 'scheduled' } : { status: 'skipped', detail: call.reason || 'skipped' };
}

// A task for the person the deal belongs to (a WhatsApp or an SMS is something that person sends).
const TASK_PREFIX = { whatsapp: 'WhatsApp: ', sms: 'SMS: ', task: '' };
// Its title and its text say who and what: the variables are filled in as in an email (no link — that is an email's).
async function doTask(pool, x, tell, now) {
  const values = await vars.valuesFor(pool, x, [x.title, x.body], now);
  const title = (TASK_PREFIX[x.kind] + vars.fill(x.title, values, false)).slice(0, 200);
  const { rows: [task] } = await pool.query(
    `INSERT INTO tasks (workspace_id, deal_id, contact_id, title, description, status, priority, assigned_to, created_by)
     VALUES ($1,$2,$3,$4,$5,'todo','medium',$6,NULL) RETURNING id`,
    [x.workspace_id, x.deal_id, x.contact_id || null, title, vars.fill(x.body, values, false) || null, x.assigned_to || null]
  );
  if (x.assigned_to && tell.notifyUser) {
    await Promise.resolve(tell.notifyUser(x.workspace_id, null, x.assigned_to, { type: 'task_created', category: 'tasks', title: `New task: ${title}`,
      body: `Workflow: ${x.flow_name}`, entityType: 'task', entityId: task.id })).catch(() => {});
  }
  return { status: 'done', detail: x.assigned_to ? 'assigned' : 'unassigned' };
}

async function doMove(pool, x, tell) {
  const stageId = Number(x.config && x.config.stage_id) || 0;
  const { rows: [stage] } = await pool.query('SELECT id, name, pipeline_id FROM pipeline_stages WHERE id = $1 AND workspace_id = $2', [stageId, x.workspace_id]);
  if (!stage) return { status: 'failed', detail: 'stage_gone' };
  if (Number(stage.id) === Number(x.stage_id)) return { status: 'skipped', detail: 'already_there' };
  await pool.query('UPDATE deals SET stage_id = $3, pipeline_id = $4, updated_at = NOW() WHERE id = $1 AND workspace_id = $2', [x.deal_id, x.workspace_id, stage.id, stage.pipeline_id]);
  await pool.query(
    `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) VALUES ($1,$2,$3,'note',$4,NULL,'journey')`,
    [x.workspace_id, x.contact_id || null, x.deal_id, `Workflow · Deal nach „${stage.name}“ verschoben\n\nWorkflow: ${x.flow_name}`]
  ).catch(() => {});
  // told like a move by hand: the bell for every member, and the Engine hears of a deal that landed in a trigger stage
  try {
    if (tell.notifyUser) {
      const { rows } = await pool.query('SELECT id FROM users WHERE workspace_id = $1', [x.workspace_id]);
      for (const u of rows) {
        await tell.notifyUser(x.workspace_id, null, u.id, { type: 'deal_stage_changed', category: 'deals', title: `Deal stage changed: ${x.deal_title}`,
          body: `Workflow „${x.flow_name}“: ${stage.name}`, entityType: 'deal', entityId: x.deal_id });
      }
    }
    const to = tell.engine ? tell.engine.stageNum(stage.id) : null;
    if (to && to !== tell.engine.stageNum(x.stage_id)) {
      tell.engine.dispatchContractSigned({ workspaceId: x.workspace_id, dealId: Number(x.deal_id), contactId: x.contact_id ? Number(x.contact_id) : null, title: x.deal_title, stageId: to }).catch(() => {});
    }
  } catch (err) { console.error('journey: telling about the moved deal failed:', err?.message || err); }
  return { status: 'done', detail: stage.name };
}

// ── when a box happens, and where a workflow ends ───────────────────────────
// When a box happens for a deal that reaches it at `from`: after the box's own wait. A Wait box may then hold on
// until a time of day on chosen weekdays (config.until, .weekdays, .tz — the clock of who saved it).
function dueOf(node, from) {
  const at = new Date(from).getTime() + Number(node.wait_minutes || 0) * 60000;
  const c = node.kind === 'wait' && node.config && typeof node.config === 'object' ? node.config : null;
  const until = c && c.until ? triggers.nextMoment(at, c.until, c.tz, c.weekdays) : null;
  return new Date(until || at);
}

// Why the workflow ends for this deal now, or null. Any of what the start names ends it (utils/journey-triggers.js
// has what a start may name). x: the row runOne read — the deal's stage, assignee, urgency and fields, its contact,
// when it entered (started_at). now: the tick's clock, for the rule that counts days.
async function stopReason(pool, x, now = new Date()) {
  const c = x.start_config || {}, stage = Number(x.stage_id) || 0, ids = v => (Array.isArray(v) ? v.map(Number) : []);
  if (stage && ids(c.stop_stage_ids).includes(stage)) return 'stop_stage';
  const stay = ids(c.stay_stage_ids);
  if (stay.length && !stay.includes(stage)) return 'left_stages';
  // every other rule the start has switched on (Part 13): what the row says first, then what the database is asked
  return ends.reasonOf(pool, x, c, now);
}

// A branch box: its question is asked about the deal as it is now, and the answer picks the line. now: the moment
// an age ("created more than 30 days ago") is counted back from.
async function doBranch(pool, x, now) {
  const yes = await branch.holds(pool, x, x.config, { now });
  return { status: 'done', detail: yes ? 'yes' : 'no', to: (yes ? x.next_id : x.else_id) || null };
}

// A router box: every route whose question says yes is gone down — or, when none does, the "otherwise" line. The
// record says which: detail 'routes:1,3' — the routes by their place among the routes at that moment, the numbers
// on their feet on the board (Part 26; a route's name can be long and can change, a short number fits the record) —
// or 'else'.
async function doRouter(pool, x, now) {
  const went = await routes.taken(pool, x, x.config, { now });
  return went.length ? { status: 'done', detail: `routes:${went.map(r => r.no).join(',')}`, targets: went.map(r => r.next_id) } : { status: 'done', detail: 'else', targets: [x.else_id] };
}

// ── a deal on several routes at once (Part 23) ──────────────────────────────
// One route of a deal is through. row: { id, root_id }. A row that is a further route (root_id) is deleted. The
// row that stands for the deal takes over a route that is still on its way, if there is one — and is 'done' only
// when there is none: → { over }, whether the workflow is over for the deal now. db: the pool, or the client of a
// transaction (routes/journey.js, when a box is deleted).
async function pathDone(db, row) {
  if (row.root_id) { await db.query('DELETE FROM journey_runs WHERE id = $1 AND root_id IS NOT NULL', [row.id]); return { over: false }; }
  const { rows: others } = await db.query('SELECT id, status FROM journey_runs WHERE root_id = $1 ORDER BY id', [row.id]);
  const next = others.find(o => o.status === 'waiting');
  if (next) {
    const { rows: [took] } = await db.query(`DELETE FROM journey_runs WHERE id = $1 AND root_id = $2 AND status = 'waiting' RETURNING node_id, due_at, attempts, held`, [next.id, row.id]);
    if (took) {
      await db.query(`UPDATE journey_runs SET node_id = $2, status = 'waiting', due_at = $3, attempts = $4, held = $5, updated_at = NOW() WHERE id = $1`, [row.id, took.node_id, took.due_at, took.attempts, took.held]);
      return { over: false };
    }
  }
  if (others.length) {   // a route whose step is being done this very moment: the deal's row asks again in a minute
    await db.query(`UPDATE journey_runs SET node_id = NULL, status = 'waiting', due_at = NOW() + INTERVAL '1 minute', updated_at = NOW() WHERE id = $1`, [row.id]);
    return { over: false };
  }
  await db.query(`UPDATE journey_runs SET status = $2, reason = $3, node_id = NULL, due_at = NULL, updated_at = NOW() WHERE id = $1`, [row.id, 'done', null]);
  return { over: true };
}
// A rule ended the workflow for the deal: on every route at once. The further routes' rows go, the deal's row says
// 'stopped' and why.
async function pathStopped(db, row, reason) {
  const root = row.root_id || row.id;
  await db.query('DELETE FROM journey_runs WHERE root_id = $1', [root]);
  await db.query(`UPDATE journey_runs SET status = $2, reason = $3, node_id = NULL, due_at = NULL, updated_at = NOW() WHERE id = $1`, [root, 'stopped', reason]);
}
// The row goes on to its next box and a further row is made for every other route — in ONE statement, so that a
// crash leaves either all of it or none. $4–$6: the further routes' boxes, when each is due, and each row's key.
const FORK = `
  WITH on_it AS (
    UPDATE journey_runs SET node_id = $2, status = 'waiting', due_at = $3, attempts = 0, updated_at = NOW() WHERE id = $1
    RETURNING workspace_id, flow_id, deal_id, started_at, COALESCE(root_id, id) AS root
  )
  INSERT INTO journey_runs (workspace_id, flow_id, deal_id, node_id, status, due_at, event_key, started_at, root_id)
  SELECT o.workspace_id, o.flow_id, o.deal_id, t.node_id, 'waiting', t.due_at, t.key, o.started_at, o.root
    FROM on_it o, unnest($4::int[], $5::timestamptz[], $6::text[]) AS t(node_id, due_at, key)`;
// A further route's own key: the deal's key in this workflow, '~' and a tail nobody else has.
const pathKey = x => `${String(x.event_key || '').split('~')[0]}~${crypto.randomBytes(6).toString('hex')}`;

// ── one row whose time has come ─────────────────────────────────────────────
async function runOne(pool, id, { now = new Date(), tell = {} } = {}) {
  const { rows: [claimed] } = await pool.query(
    `UPDATE journey_runs SET status = 'working', attempts = attempts + 1, updated_at = NOW() WHERE id = $1 AND status = 'waiting' RETURNING id, attempts`, [id]
  );
  if (!claimed) return null;   // another tick has it, or it was stopped meanwhile
  const { rows: [x] } = await pool.query(
    `SELECT r.id, r.workspace_id, r.flow_id, r.deal_id, r.node_id, r.started_at, r.held, f.name AS flow_name, s.config AS start_config,
            n.kind, n.title, n.body, n.config, n.next_id, n.else_id, r.root_id, r.event_key,
            d.title AS deal_title, d.stage_id, d.contact_id, d.assigned_to, d.urgency, d.custom_data AS deal_data, d.created_at AS deal_created_at,
            d.value AS deal_value, ps.name AS stage_name, p.name AS pipeline_name, u.name AS owner_name, u.email AS owner_email, w.name AS workspace_name,
            c.name AS contact_name, c.email AS contact_email, c.company AS contact_company, c.phone AS contact_phone, c.journey_opt_out,
            c.custom_data AS contact_data, c.onboarding_status, c.assigned_to AS contact_assigned_to, c.created_at AS contact_created_at
       FROM journey_runs r
       JOIN journey_flows f ON f.id = r.flow_id
       JOIN deals d ON d.id = r.deal_id
       LEFT JOIN journey_nodes s ON s.flow_id = r.flow_id AND s.kind = 'start'
       LEFT JOIN journey_nodes n ON n.id = r.node_id
       LEFT JOIN contacts c ON c.id = d.contact_id AND c.workspace_id = d.workspace_id
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       LEFT JOIN pipelines p ON p.id = d.pipeline_id
       LEFT JOIN users u ON u.id = d.assigned_to
       LEFT JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.id = $1`, [id]
  );
  const at = new Date(now).getTime();
  // what every entry of this row says: whose, which workflow and which deal — by their names as they are now
  const entry = x ? { workspaceId: x.workspace_id, flowId: x.flow_id, dealId: x.deal_id, flowName: x.flow_name, dealTitle: x.deal_title } : null;
  const step = x ? { ...entry, nodeId: x.node_id, kind: x.kind, title: x.title } : null;
  // this row's way is over. Stopped by a rule: the workflow is over for the deal, on every route. Done: over for
  // the deal only when no other route of it is still on its way (Part 23). The record says "ended" when it is over.
  const end = async (status, reason = null) => {
    const row = { id, root_id: x ? x.root_id : null };
    const over = status === 'stopped' ? (await pathStopped(pool, row, reason), true) : (await pathDone(pool, row)).over;
    if (entry && over) await log.record(pool, { ...entry, event: 'ended', status, detail: reason });
  };
  // What held the row back last time (Part 17) is over once it is taken up; an email that is held again says so anew.
  if (x && x.held) await pool.query(`UPDATE journey_runs SET held = NULL WHERE id = $1`, [id]);
  if (!x || !x.kind) { await end('done'); return { id, status: 'done' }; }   // its box is gone: nothing is left to do
  const stop = await stopReason(pool, x, now);
  if (stop) { await end('stopped', stop); return { id, status: 'stopped', reason: stop }; }

  let res;
  try {
    res = x.kind === 'wait' ? { status: 'done', detail: 'waited' } : x.kind === 'branch' ? await doBranch(pool, x, now) : x.kind === 'router' ? await doRouter(pool, x, now) : x.kind === 'email' ? await doEmail(pool, x, now, tell) : x.kind === 'call' ? await doCall(pool, x, now)
      : x.kind === 'move' ? await doMove(pool, x, tell) : x.kind in TASK_PREFIX ? await doTask(pool, x, tell, now) : { status: 'skipped', detail: 'unknown_kind' };
  } catch (err) {
    console.error('journey: a step failed:', err?.message || err);
    res = { status: 'failed', detail: 'error' };
  }
  // An email its address has no room for, or whose address is paused (Part 17): the deal waits at this step until
  // then. Not a try (the claim's count is taken back) and not a failure. The record says why once: an email that is
  // looked at again and still has to wait for the same reason writes no second entry.
  if (res.status === 'held') {
    await pool.query(`UPDATE journey_runs SET status = 'waiting', due_at = $2, attempts = GREATEST(attempts - 1, 0), held = $3, updated_at = NOW() WHERE id = $1`, [id, res.until, res.detail]);
    if (x.held !== res.detail) await log.record(pool, { ...step, event: 'retry', status: 'retry', detail: res.detail });
    return { id, status: 'held', detail: res.detail, until: res.until };
  }
  if (res.status === 'retry' && claimed.attempts < MAX_ATTEMPTS) {
    await pool.query(`UPDATE journey_runs SET status = 'waiting', due_at = $2, updated_at = NOW() WHERE id = $1`, [id, new Date(at + RETRY_MINUTES * 60000)]);
    await log.record(pool, { ...step, event: 'retry', status: 'retry', detail: res.detail });
    return { id, status: 'retry' };
  }
  const status = res.status === 'retry' ? 'failed' : res.status;
  // what the box did: written down before the row moves on (write, not record — it may throw, and then nothing moves)
  await log.write(pool, { ...step, event: 'step', status, detail: res.detail });
  // on to the box after it, due after that box's wait; past the last box the workflow is done for this deal
  // a branch box says which of its two lines the deal takes, a router box every route it goes down; every other box has one
  const wanted = (res.targets !== undefined ? res.targets : [res.to !== undefined ? res.to : x.next_id]).filter(Boolean);
  const nexts = [];
  for (const nextId of wanted) {
    const { rows: [n] } = await pool.query('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND flow_id = $2', [nextId, x.flow_id]);
    if (n) nexts.push(n);
  }
  const [next, ...more] = nexts;
  if (!next) { await end('done'); return { id, status, step: x.kind, finished: true }; }
  if (!more.length) {
    await pool.query(`UPDATE journey_runs SET node_id = $2, status = 'waiting', due_at = $3, attempts = 0, updated_at = NOW() WHERE id = $1`,
      [id, next.id, dueOf(next, at)]);
    return { id, status, step: x.kind, finished: false };
  }
  // several routes (Part 23): this row goes down the first, a row of its own is made for each of the others — as
  // far as the deal may still be at more places of this workflow
  const { rows: [live] } = await pool.query('SELECT COUNT(*)::int AS n FROM journey_runs WHERE root_id = $1', [x.root_id || x.id]);
  const further = more.slice(0, Math.max(0, MAX_PATHS - 1 - Number((live && live.n) || 0)));
  if (further.length < more.length) await log.record(pool, { ...step, event: 'step', status: 'skipped', detail: 'paths_limit' });
  await pool.query(FORK, [id, next.id, dueOf(next, at), further.map(n => n.id), further.map(n => dueOf(n, at)), further.map(() => pathKey(x))]);
  return { id, status, step: x.kind, finished: false, routes: 1 + further.length };
}

// ── taking deals in ─────────────────────────────────────────────────────────
// A deal's row at the first box of a workflow: due after that box's wait; a workflow with nothing behind its start is
// done at once. key: what happened (Part 9; '' for a start a deal goes through once) — a deal is taken in once per
// key. restart: an existing row starts again (the "Include" button); otherwise an existing row stays.
// by: what took the deal in, for the record — the start's trigger key, or 'manual' / 'restart' with the person
// (actorId) who put it in.
async function enroll(pool, flow, dealId, { now = new Date(), restart = false, key = '', by = null, actorId = null } = {}) {
  const { rows: [first] } = flow.first_id ? await pool.query('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND flow_id = $2', [flow.first_id, flow.id]) : { rows: [] };
  const due = first ? dueOf(first, now) : null;
  const { rows: [row] } = await pool.query(
    `INSERT INTO journey_runs (workspace_id, flow_id, deal_id, node_id, status, due_at, event_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (flow_id, deal_id, event_key) DO ${restart
       ? `UPDATE SET node_id = EXCLUDED.node_id, status = EXCLUDED.status, due_at = EXCLUDED.due_at, reason = NULL, held = NULL, attempts = 0, started_at = NOW(), updated_at = NOW()`
       : 'NOTHING'}
     RETURNING id, status, due_at`,
    [flow.workspace_id, flow.id, dealId, first ? first.id : null, first ? 'waiting' : 'done', due, String(key || '')]
  );
  if (row && restart) await pool.query('DELETE FROM journey_runs WHERE root_id = $1', [row.id]);   // the routes it was on before are not gone on with (Part 23)
  if (row) {   // taken in (no row: it was in already) — and over at once where nothing stands behind the start
    const entry = { workspaceId: flow.workspace_id, flowId: flow.id, dealId };
    await log.record(pool, { ...entry, event: 'entered', detail: by || (flow.config && flow.config.trigger) || '', actorId });
    if (!first) await log.record(pool, { ...entry, event: 'ended', status: 'done' });
  }
  return row || null;
}

// The workflows that are on, each with its start: [{ id, workspace_id, activated_at, config, first_id }].
async function activeFlows(pool, flowId = null) {
  const { rows } = await pool.query(
    `SELECT f.id, f.workspace_id, f.activated_at, s.config, s.next_id AS first_id
       FROM journey_flows f JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start'
      WHERE f.active AND ($1::int IS NULL OR f.id = $1) ORDER BY f.id`, [flowId]
  );
  return rows;
}

// The deals a workflow's start takes in now, each with the key of what happened: [{ dealId, key }]. Every start —
// a new lead, a stage, a booking, a call's result, a moment — is utils/journey-triggers.js.
const newDeals = (pool, flow, now = new Date()) => triggers.find(pool, flow, now);

async function enrollNew(pool, now = new Date()) {
  let taken = 0;
  for (const flow of await activeFlows(pool)) {
    if (!flow.activated_at) continue;
    try {
      for (const found of await newDeals(pool, flow, now)) if (await enroll(pool, flow, found.dealId, { now, key: found.key })) taken++;
    } catch (err) { console.error(`journey: the start of workflow ${flow.id} failed:`, err?.message || err); }   // one start that fails never holds the others back
  }
  return taken;
}

// Switching a workflow on: what is there already must not look like something that just happened — the deals in a
// start's stage, the values a start watches for changes (utils/journey-triggers.js baseline).
const baseline = (pool, flow) => triggers.baseline(pool, flow);

// "Include in the Customer Journey": a deal is put at the first box of a workflow that is on, whatever its start
// says and whether or not it has been through it before. { code } or { run }. actorId: who did it — the record says
// 'manual', or 'restart' when the deal was in it already (a row the start had only written down as 'old' is none).
async function include(pool, { workspaceId, flowId, dealId, now = new Date(), actorId = null }) {
  const [flow] = (await activeFlows(pool, flowId)).filter(f => Number(f.workspace_id) === Number(workspaceId));
  if (!flow) return { code: 'inactive' };
  const { rows: [deal] } = await pool.query('SELECT id FROM deals WHERE id = $1 AND workspace_id = $2', [dealId, workspaceId]);
  if (!deal) return { code: 'deal' };
  const { rows: [was] } = await pool.query(`SELECT 1 FROM journey_runs WHERE flow_id = $1 AND deal_id = $2 AND workspace_id = $3 AND event_key = '' AND status <> 'old'`, [flow.id, deal.id, workspaceId]);
  return { run: await enroll(pool, flow, deal.id, { now, restart: true, by: was ? 'restart' : 'manual', actorId }) };
}

// ── the tick ────────────────────────────────────────────────────────────────
async function runDue(pool, { now = new Date(), limit = 25, tell = {} } = {}) {
  const at = new Date(now).getTime();
  // a row a crashed tick left as 'working': whether its step happened is not known, so it is not done again —
  // the row goes on to the box after it
  const { rows: stuck } = await pool.query(
    `SELECT r.id, r.root_id, r.workspace_id, r.flow_id, r.node_id, r.deal_id, n.kind, n.title, n.next_id FROM journey_runs r LEFT JOIN journey_nodes n ON n.id = r.node_id
      WHERE r.status = 'working' AND r.updated_at < $1`, [new Date(at - STUCK_MINUTES * 60000)]
  );
  for (const s of stuck) {
    try {   // one row that cannot be put right must not keep the tick from every other deal
      // a box that does nothing to the deal (a question, a router, a wait) is simply asked again
      if (s.kind === 'branch' || s.kind === 'router' || s.kind === 'wait') { await pool.query(`UPDATE journey_runs SET status = 'waiting', updated_at = NOW() WHERE id = $1 AND status = 'working'`, [s.id]); continue; }
      const entry = { workspaceId: s.workspace_id, flowId: s.flow_id, dealId: s.deal_id };
      if (s.kind) await log.write(pool, { ...entry, nodeId: s.node_id, kind: s.kind, title: s.title, event: 'step', status: 'failed', detail: 'interrupted' });
      const { rows: [next] } = s.next_id ? await pool.query('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND flow_id = $2', [s.next_id, s.flow_id]) : { rows: [] };
      if (next) await pool.query(`UPDATE journey_runs SET node_id = $2, status = 'waiting', due_at = $3, attempts = 0, updated_at = NOW() WHERE id = $1`, [s.id, next.id, dueOf(next, at)]);
      else if ((await pathDone(pool, s)).over) await log.record(pool, { ...entry, event: 'ended', status: 'done' });   // this route is through; over for the deal when it was the last
    } catch (err) { console.error('journey: a row a tick had left could not be put right:', err?.message || err); }
  }
  try { await enrollNew(pool, now); }
  catch (err) { console.error('journey: taking new deals in failed:', err?.message || err); }   // never holds the due steps back
  const { rows } = await pool.query(
    `SELECT r.id FROM journey_runs r JOIN journey_flows f ON f.id = r.flow_id
      WHERE r.status = 'waiting' AND r.due_at <= $1 AND f.active ORDER BY r.due_at, r.id LIMIT $2`, [new Date(at), limit]
  );
  const out = [];
  for (const r of rows) {
    const x = await runOne(pool, r.id, { now, tell });
    if (x) out.push(x);
  }
  return out;
}

let worker = null;
// tell: { notifyUser, engine } for the tasks a workflow makes and the deals it moves; server.js hands them in.
function startWorker(pool, { intervalMs = 30000, limit = 25, log = console, tell = {} } = {}) {
  if (worker) return worker;
  let busy = false, trimmed = 0;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      try { await runDue(pool, { limit, tell }); }
      catch (err) { log.error('journey worker:', err?.message || err); }
      // Part 17: the counted emails are kept seven days. Looked at once an hour, after the tick's work, never in its way.
      if (Date.now() - trimmed >= sends.TRIM_EVERY_MS) {
        trimmed = Date.now();
        try { await sends.trim(pool); }
        catch (err) { log.error('journey worker: the old counted emails could not be deleted:', err?.message || err); }
      }
    } finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  worker = { tick, stop() { clearInterval(timer); worker = null; } };
  return worker;
}

module.exports = {
  RETRY_MINUTES, MAX_ATTEMPTS, STUCK_MINUTES, ENROLL_LIMIT, MAX_PLACE, MAX_PATHS,
  isHtml, htmlToText, emailParts, unsubscribeToken, contactOfToken, unsubscribeUrl,
  dueOf, stopReason, pathDone, pathStopped,
  enroll, enrollNew, newDeals, activeFlows, baseline, include, runOne, runDue, startWorker,
};
