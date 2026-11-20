/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY SENDS — the safeguards around the workflows' emails, so that the
   connected Gmail address is not blocked
   (CUSTOMER_JOURNEY_CHANGES Part 17, 2026-11-20; utils/journey-run.js asks
   here before every email, routes/journey-mail.js shows and saves the limits,
   utils/journey-mail.js tells Google's "limit" apart from any other refusal).

   WHAT GOOGLE ALLOWS (its own pages, read 2026-11-20): a personal Gmail
   address sends 500 emails a day, a Google Workspace address 2,000 (500 while
   it is a trial) — counted over a rolling 24 hours. Who goes over cannot send
   for up to 24 hours, and "repeated overages may lead to account suspension".

   THE CRM'S OWN LIMITS stand below that. They are counted PER SENDING ADDRESS:
   an address that is connected in two workspaces is one address to Google.
     day     emails in a rolling 24 hours     personal 400, Workspace 1,500
     hour    emails in a rolling 60 minutes   personal 40,  Workspace 150
     person  workflow emails to the same contact in 24 hours   3
   An owner or admin may set each of them for the workspace's connection
   (workspace_mail.limit_day / limit_hour / limit_person; NULL is the default
   for the address's kind) — never above what Google allows that kind.

   EVERY EMAIL IS COUNTED (journey_sends: the workspace, the address, the
   contact, 'step' or 'test', when). The worker deletes rows older than seven
   days.

   AN EMAIL THAT WOULD GO OVER A LIMIT WAITS (gate). It is not sent, not lost
   and not failed: its deal stays at that step and is due again at the moment
   the limit has room FOR IT — worked out from the counted sends and from the
   emails that already wait for the same limit (journey_runs.held), so that
   a hundred waiting emails are not all due at the first free place. The gate
   is asked again when that moment comes; only what it says then counts.

   WHEN GOOGLE ITSELF SAYS "LIMIT" (pause) sending from that address is
   paused: until the time Google names (at least five minutes, at most 24
   hours), else one hour. Every pause that follows without an email going out
   in between is twice as long (2 h, 4 h … at most 24 h) — then Google's time
   counts only when it is later. While an address is paused nothing is sent to
   Google from it at all. Every owner and admin of the workspaces that use the
   address is told, once per pause. The first email that goes out afterwards
   ends the doubling.

   NEVER OPENS THE DATABASE MODULE ITSELF: the pool is handed in, and so is
   notifyUser (tell).
   ═══════════════════════════════════════════════════════════════════════════ */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

const GOOGLE_DAY = { personal: 500, workspace: 2000 };   // what Google itself allows in 24 hours
const DEFAULTS   = { personal: { day: 400, hour: 40, person: 3 }, workspace: { day: 1500, hour: 150, person: 3 } };
const MAX_PERSON = 20;
const KEEP_DAYS      = 7;                // a counted email is kept this long
const TRIM_EVERY_MS  = HOUR_MS;          // how often the worker deletes the older ones
const PAUSE_FIRST_MS = HOUR_MS;          // a pause for which Google names no time
const PAUSE_MIN_MS   = 5 * 60 * 1000;    // … and the shortest one, whatever time Google names
const PAUSE_MAX_MS   = DAY_MS;
const RECHECK_MS     = 15 * 60 * 1000;   // an email whose time cannot be worked out is looked at again after this
// Why an email waits at its step, in the order the gate asks (journey_runs.held, and the record's detail).
const WAITS = ['paused', 'limit_day', 'limit_hour', 'limit_person'];

const addressOf = email => String(email || '').trim().toLowerCase();
// A gmail.com (or googlemail.com) address is a personal one; any other domain is a Google Workspace.
const kindOf = email => (/@(gmail|googlemail)\.com$/.test(addressOf(email)) ? 'personal' : 'workspace');

// ── the limits ──────────────────────────────────────────────────────────────
// What holds for a connection: { kind, google_day, limits, defaults, max }. row: its address and what was saved for
// it. A saved number never counts for more than the most that kind of address may have, and an hour never for more
// than the day.
function limitsOf(row) {
  const kind = kindOf(row && row.email), defaults = { ...DEFAULTS[kind] };
  const max = { day: GOOGLE_DAY[kind], hour: GOOGLE_DAY[kind], person: MAX_PERSON };
  const saved = (v, top) => (Number.isInteger(v) && v >= 1 ? Math.min(v, top) : null);
  const day = saved(row && row.limit_day, max.day) ?? defaults.day;
  return { kind, google_day: GOOGLE_DAY[kind], defaults, max,
    limits: { day, hour: Math.min(saved(row && row.limit_hour, max.hour) ?? defaults.hour, day), person: saved(row && row.limit_person, max.person) ?? defaults.person } };
}

// What a person sent to be saved, as { day, hour, person } — each a whole number or null ("the default") — or null
// when it is anything else: day 1..max.day, hour 1..day, person 1..20. All three have to be named.
function readLimits(email, body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const { max, defaults } = limitsOf({ email }), out = {};
  for (const key of ['day', 'hour', 'person']) {
    const v = b[key];
    if (v === null) { out[key] = null; continue; }
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,5}$/.test(v) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > max[key]) return null;
    out[key] = n;
  }
  if (out.hour !== null && out.hour > (out.day ?? defaults.day)) return null;
  return out;
}

// Saves a connection's limits. The emails that wait for a limit of this workspace are looked at again at once:
// with more room they go out sooner, with less they are put in line anew.
async function saveLimits(pool, workspaceId, limits, now = new Date()) {
  await pool.query('UPDATE workspace_mail SET limit_day = $2, limit_hour = $3, limit_person = $4 WHERE workspace_id = $1', [workspaceId, limits.day, limits.hour, limits.person]);
  await pool.query(
    `UPDATE journey_runs SET due_at = $2, updated_at = NOW()
      WHERE workspace_id = $1 AND status = 'waiting' AND held IN ('limit_day','limit_hour','limit_person') AND due_at > $2`, [workspaceId, new Date(now)]
  );
}

// Another address took the connection's place: what was set and said about the old one is not the new one's.
async function forget(pool, workspaceId) {
  await pool.query(
    `UPDATE workspace_mail SET limit_day = NULL, limit_hour = NULL, limit_person = NULL, paused_until = NULL, pause_reason = NULL, pause_detail = NULL, pause_count = 0
      WHERE workspace_id = $1`, [workspaceId]
  );
}

// ── what is known about sending from a workspace's address ──────────────────
// null without a connection. Else the address, its limits, how much went out from it — in 24 hours, in 60 minutes,
// and as workflow emails to this contact in 24 hours — and its pause. The count and the pause are the ADDRESS's:
// whichever workspace sent, and whichever workspace's email Google refused.
async function read(pool, workspaceId, { contactId = null, now = new Date() } = {}) {
  const at = new Date(now).getTime();
  const { rows: [row] } = await pool.query(
    `SELECT m.email, m.limit_day, m.limit_hour, m.limit_person, p.paused_until, p.pause_reason, p.pause_detail, p.pause_count,
            (SELECT COUNT(*)::int FROM journey_sends s WHERE s.from_email = LOWER(m.email) AND s.sent_at > $2) AS sent_day,
            (SELECT COUNT(*)::int FROM journey_sends s WHERE s.from_email = LOWER(m.email) AND s.sent_at > $3) AS sent_hour,
            (SELECT COUNT(*)::int FROM journey_sends s WHERE s.from_email = LOWER(m.email) AND s.kind = 'step' AND s.contact_id = $4 AND s.sent_at > $2) AS sent_person
       FROM workspace_mail m
       LEFT JOIN LATERAL (SELECT a.paused_until, a.pause_reason, a.pause_detail, a.pause_count FROM workspace_mail a
                           WHERE LOWER(a.email) = LOWER(m.email) ORDER BY a.paused_until DESC NULLS LAST, a.pause_count DESC LIMIT 1) p ON true
      WHERE m.workspace_id = $1`, [workspaceId, new Date(at - DAY_MS), new Date(at - HOUR_MS), contactId]
  );
  if (!row) return null;
  const until = row.paused_until ? new Date(row.paused_until) : null, paused = !!until && until.getTime() > at;
  return {
    from: addressOf(row.email), ...limitsOf(row),
    sent: { day: Number(row.sent_day) || 0, hour: Number(row.sent_hour) || 0, person: Number(row.sent_person) || 0 },
    // a pause that is over is no pause — but its count stays until an email went out (sent)
    paused_until: paused ? until : null, pause_reason: paused ? row.pause_reason || 'google_limit' : null, pause_detail: paused ? row.pause_detail || null : null,
    pause_count: Number(row.pause_count) || 0,
  };
}

// What the page is told (GET /api/journey/mail → sending): never more than this.
function sendingOf(state) {
  if (!state) return null;
  return {
    kind: state.kind, google_day: state.google_day, limits: state.limits, defaults: state.defaults, max: state.max,
    sent: { day: state.sent.day, hour: state.sent.hour },
    paused_until: state.paused_until ? state.paused_until.toISOString() : null, pause_reason: state.pause_reason, pause_detail: state.pause_detail,
  };
}

// ── the gate ────────────────────────────────────────────────────────────────
// When a limit that is full now has room again for one more email: the moment the send that is the limit-th newest
// leaves the window. The emails that already wait for the same limit count as sent at the time they are due — so
// the next one is put behind them, not beside them. null when nothing can be worked out.
async function slot(pool, { from, why, limit, windowMs, contactId = null, now }) {
  const at = new Date(now).getTime(), since = new Date(at - windowMs);
  const { rows: [row] } = why === 'limit_person'
    ? await pool.query(
      `SELECT s.sent_at AS t FROM journey_sends s
        WHERE s.from_email = $1 AND s.kind = 'step' AND s.contact_id = $3 AND s.sent_at > $2 ORDER BY s.sent_at DESC OFFSET $4 LIMIT 1`, [from, since, contactId, limit - 1])
    : await pool.query(
      `SELECT q.t FROM (
         SELECT s.sent_at AS t FROM journey_sends s WHERE s.from_email = $1 AND s.sent_at > $2
         UNION ALL
         SELECT r.due_at FROM journey_runs r JOIN workspace_mail m ON m.workspace_id = r.workspace_id JOIN journey_flows f ON f.id = r.flow_id
          WHERE LOWER(m.email) = $1 AND f.active AND r.status = 'waiting' AND r.held = $3 AND r.due_at > $4
       ) q ORDER BY q.t DESC OFFSET $5 LIMIT 1`, [from, since, why, new Date(at), limit - 1]);
  return row && row.t ? new Date(new Date(row.t).getTime() + windowMs) : null;
}

// May one more email go out from the workspace's address now?
//   { ok: true, state }                 yes
//   { ok: false, why, until, state }    no: why is one of WAITS, until the moment it may be asked again
//   { ok: false, why: 'no_sender' }     no address is connected (state null)
// contactId: whom a workflow's email goes to (the limit per person). test: a test email — it goes to the person who
// asked for it, so only a pause and the full day keep it back, and nobody waits for it (until null).
// THROWS when the database cannot be asked: the caller must then not send.
async function gate(pool, { workspaceId, contactId = null, now = new Date(), test = false }) {
  const at = new Date(now), state = await read(pool, workspaceId, { contactId, now: at });
  if (!state) return { ok: false, why: 'no_sender', until: null, state: null };
  const no = async (why, limit, windowMs) => {
    const free = test ? null : await slot(pool, { from: state.from, why, limit, windowMs, contactId, now: at });
    return { ok: false, why, until: test ? null : free && free.getTime() > at.getTime() ? free : new Date(at.getTime() + RECHECK_MS), state };
  };
  if (state.paused_until) return { ok: false, why: 'paused', until: state.paused_until, state };
  if (state.sent.day >= state.limits.day) return no('limit_day', state.limits.day, DAY_MS);
  if (test) return { ok: true, state };
  if (state.sent.hour >= state.limits.hour) return no('limit_hour', state.limits.hour, HOUR_MS);
  if (contactId && state.sent.person >= state.limits.person) return no('limit_person', state.limits.person, DAY_MS);
  return { ok: true, state };
}

// ── counting ────────────────────────────────────────────────────────────────
// An email went out: it is counted. state: what the gate knew before it — after a pause the first email that goes
// out ends the doubling (a pause that is in force is never lifted here).
async function sent(pool, { workspaceId, from, contactId = null, kind = 'step', now = new Date(), state = null }) {
  const at = new Date(now);
  await pool.query('INSERT INTO journey_sends (workspace_id, from_email, contact_id, kind, sent_at) VALUES ($1,$2,$3,$4,$5)',
    [workspaceId, addressOf(from), contactId, kind === 'test' ? 'test' : 'step', at]);
  if (state && state.pause_count > 0) {
    await pool.query(
      `UPDATE workspace_mail SET paused_until = NULL, pause_reason = NULL, pause_detail = NULL, pause_count = 0
        WHERE LOWER(email) = $1 AND (paused_until IS NULL OR paused_until <= $2)`, [addressOf(from), at]
    );
  }
}

// The counted emails older than seven days are deleted (the worker, once an hour).
async function trim(pool, now = new Date()) {
  const { rowCount } = await pool.query('DELETE FROM journey_sends WHERE sent_at < $1', [new Date(new Date(now).getTime() - KEEP_DAYS * DAY_MS)]);
  return rowCount || 0;
}

// ── the pause ───────────────────────────────────────────────────────────────
// Until when a pause lasts. count: how many pauses went before it without an email going out in between.
// retryAt: the time Google named, if any.
function pauseUntil({ now = new Date(), count = 0, retryAt = null } = {}) {
  const at = new Date(now).getTime();
  const own = Math.min(PAUSE_FIRST_MS * 2 ** Math.min(Math.max(Number(count) || 0, 0), 10), PAUSE_MAX_MS);
  const named = retryAt instanceof Date && Number.isFinite(retryAt.getTime()) && retryAt.getTime() > at ? retryAt.getTime() - at : null;
  // Google's time is taken at its word the first time; after that it was kept to once and Google still said no
  const span = named === null ? own : count > 0 ? Math.max(named, own) : Math.max(named, PAUSE_MIN_MS);
  return new Date(at + Math.min(span, PAUSE_MAX_MS));
}

const spanText = ms => {
  const minutes = Math.max(1, Math.round(ms / 60000)), hours = Math.round(minutes / 60);
  return minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`;
};

// Google said "limit" to an email from this address: sending from it is paused, in every workspace that uses it.
// → { until, fresh }. fresh false: it was paused already (two answers at the same moment) — one pause, told once.
// detail: Google's own words. tell: { notifyUser }.
async function pause(pool, { from, now = new Date(), retryAt = null, detail = '', tell = {} }) {
  const address = addressOf(from), at = new Date(now);
  const { rows: [was] } = await pool.query('SELECT COALESCE(MAX(pause_count), 0)::int AS count, MAX(paused_until) AS until FROM workspace_mail WHERE LOWER(email) = $1', [address]);
  if (was && was.until && new Date(was.until).getTime() > at.getTime()) return { until: new Date(was.until), fresh: false };
  const count = (was && Number(was.count)) || 0, until = pauseUntil({ now: at, count, retryAt });
  const { rows } = await pool.query(
    `UPDATE workspace_mail SET paused_until = $2, pause_reason = 'google_limit', pause_detail = $3, pause_count = $4
      WHERE LOWER(email) = $1 AND (paused_until IS NULL OR paused_until <= $5) RETURNING workspace_id`,
    [address, until, String(detail || '').slice(0, 300) || null, count + 1, at]
  );
  if (!rows.length) return { until, fresh: false };
  // the emails that waited for the pause before this one wait for this one: one statement, not one look at each
  await pool.query(
    `UPDATE journey_runs r SET due_at = $2, updated_at = NOW() FROM workspace_mail m
      WHERE m.workspace_id = r.workspace_id AND LOWER(m.email) = $1 AND r.status = 'waiting' AND r.held = 'paused'`, [address, until]
  );
  try { await tellPaused(pool, rows.map(r => r.workspace_id), { address, until, now: at, tell }); }
  catch (err) { console.error('journey: telling about the paused address failed:', err?.message || err); }   // the pause holds all the same
  return { until, fresh: true, count: count + 1 };
}

// Every owner and admin of the workspaces that send with the address hears of the pause.
async function tellPaused(pool, workspaceIds, { address, until, now, tell }) {
  if (!tell || typeof tell.notifyUser !== 'function' || !workspaceIds.length) return;
  const { rows } = await pool.query(
    `SELECT user_id, workspace_id FROM user_workspaces WHERE workspace_id = ANY($1::int[]) AND role IN ('owner','admin') ORDER BY workspace_id, user_id`, [workspaceIds]
  );
  for (const u of rows) {
    await Promise.resolve(tell.notifyUser(u.workspace_id, null, u.user_id, {
      type: 'journey_mail_paused', category: 'system', title: `Workflow emails paused: ${address}`,
      body: `Google reported that this address has reached its sending limit. No email is sent from it for about ${spanText(until.getTime() - now.getTime())}; `
        + 'the emails wait and go out afterwards. If this happens again, lower the daily limit in the workflows\' email settings.',
    })).catch(() => {});
  }
}

// A person lifts the pause: sending from the address goes on now, and the emails that waited for it are due now.
// The count stays — when Google says "limit" again before an email went out, the next pause is the longer one.
async function resume(pool, from, now = new Date()) {
  const address = addressOf(from), at = new Date(now);
  await pool.query('UPDATE workspace_mail SET paused_until = NULL, pause_reason = NULL, pause_detail = NULL WHERE LOWER(email) = $1', [address]);
  await pool.query(
    `UPDATE journey_runs r SET due_at = $2, updated_at = NOW() FROM workspace_mail m
      WHERE m.workspace_id = r.workspace_id AND LOWER(m.email) = $1 AND r.status = 'waiting' AND r.held = 'paused' AND r.due_at > $2`, [address, at]
  );
}

module.exports = {
  GOOGLE_DAY, DEFAULTS, MAX_PERSON, KEEP_DAYS, TRIM_EVERY_MS, PAUSE_FIRST_MS, PAUSE_MIN_MS, PAUSE_MAX_MS, RECHECK_MS, WAITS,
  kindOf, limitsOf, readLimits, saveLimits, forget, read, sendingOf, gate, sent, trim, pauseUntil, pause, resume,
};
