/**
 * A stand-in for what utils/journey-sends.js reads and writes (CUSTOMER_JOURNEY_CHANGES Part 17): the limits and the
 * pause of a sending address (workspace_mail), the counted emails (journey_sends), the emails that wait for a limit
 * (journey_runs.held) and the people who are told of a pause (user_workspaces).
 *
 *   const sends = createSends({ mail: [{ workspace_id: 7, email: 'news@firma.de' }] });
 *   const pool = { query: async (sql, p) => sends.answer(sql, p) || { rows: [] } };
 *
 * `answer(sql, params)` knows EVERY statement of that file by its exact text and answers it from the lists in
 * `sends.w` as Postgres would; for any other statement it returns null, so a test's own stand-in goes on. A statement
 * of that file that was changed is not known here any more: the tests that need it fail, and this file is updated on
 * purpose. What the statements really do in Postgres is not shown by this — that is the real-database check's part.
 *
 * The lists (each may also be a getter on the object you hand in, when your test replaces its array):
 *   mail     [{ workspace_id, email, limit_day?, limit_hour?, limit_person?, paused_until?, pause_reason?, pause_detail?, pause_count? }]
 *   sends    [{ workspace_id, from_email, contact_id, kind, sent_at }]
 *   runs     [{ id, workspace_id, flow_id, status, held, due_at }]
 *   members  [{ user_id, workspace_id, role }]
 *   off      ids of workflows that are switched off (every other one is on)
 */
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const ms = v => (v == null ? null : new Date(v).getTime());

const SQL = {
  read: "SELECT m.email, m.limit_day, m.limit_hour, m.limit_person, p.paused_until, p.pause_reason, p.pause_detail, p.pause_count, (SELECT COUNT(*)::int FROM journey_sends s WHERE s.from_email = LOWER(m.email) AND s.sent_at > $2) AS sent_day, "
    + "(SELECT COUNT(*)::int FROM journey_sends s WHERE s.from_email = LOWER(m.email) AND s.sent_at > $3) AS sent_hour, (SELECT COUNT(*)::int FROM journey_sends s WHERE s.from_email = LOWER(m.email) AND s.kind = 'step' AND s.contact_id = $4 AND s.sent_at > $2) AS sent_person "
    + 'FROM workspace_mail m LEFT JOIN LATERAL (SELECT a.paused_until, a.pause_reason, a.pause_detail, a.pause_count FROM workspace_mail a WHERE LOWER(a.email) = LOWER(m.email) ORDER BY a.paused_until DESC NULLS LAST, a.pause_count DESC LIMIT 1) p ON true WHERE m.workspace_id = $1',
  slotPerson: "SELECT s.sent_at AS t FROM journey_sends s WHERE s.from_email = $1 AND s.kind = 'step' AND s.contact_id = $3 AND s.sent_at > $2 ORDER BY s.sent_at DESC OFFSET $4 LIMIT 1",
  slot: 'SELECT q.t FROM ( SELECT s.sent_at AS t FROM journey_sends s WHERE s.from_email = $1 AND s.sent_at > $2 UNION ALL SELECT r.due_at FROM journey_runs r JOIN workspace_mail m ON m.workspace_id = r.workspace_id JOIN journey_flows f ON f.id = r.flow_id '
    + "WHERE LOWER(m.email) = $1 AND f.active AND r.status = 'waiting' AND r.held = $3 AND r.due_at > $4 ) q ORDER BY q.t DESC OFFSET $5 LIMIT 1",
  count: 'INSERT INTO journey_sends (workspace_id, from_email, contact_id, kind, sent_at) VALUES ($1,$2,$3,$4,$5)',
  proven: 'UPDATE workspace_mail SET paused_until = NULL, pause_reason = NULL, pause_detail = NULL, pause_count = 0 WHERE LOWER(email) = $1 AND (paused_until IS NULL OR paused_until <= $2)',
  trim: 'DELETE FROM journey_sends WHERE sent_at < $1',
  pauseWas: 'SELECT COALESCE(MAX(pause_count), 0)::int AS count, MAX(paused_until) AS until FROM workspace_mail WHERE LOWER(email) = $1',
  pause: "UPDATE workspace_mail SET paused_until = $2, pause_reason = 'google_limit', pause_detail = $3, pause_count = $4 WHERE LOWER(email) = $1 AND (paused_until IS NULL OR paused_until <= $5) RETURNING workspace_id",
  pausePush: "UPDATE journey_runs r SET due_at = $2, updated_at = NOW() FROM workspace_mail m WHERE m.workspace_id = r.workspace_id AND LOWER(m.email) = $1 AND r.status = 'waiting' AND r.held = 'paused'",
  managers: "SELECT user_id, workspace_id FROM user_workspaces WHERE workspace_id = ANY($1::int[]) AND role IN ('owner','admin') ORDER BY workspace_id, user_id",
  resume: 'UPDATE workspace_mail SET paused_until = NULL, pause_reason = NULL, pause_detail = NULL WHERE LOWER(email) = $1',
  resumePull: "UPDATE journey_runs r SET due_at = $2, updated_at = NOW() FROM workspace_mail m WHERE m.workspace_id = r.workspace_id AND LOWER(m.email) = $1 AND r.status = 'waiting' AND r.held = 'paused' AND r.due_at > $2",
  limits: 'UPDATE workspace_mail SET limit_day = $2, limit_hour = $3, limit_person = $4 WHERE workspace_id = $1',
  limitsPull: "UPDATE journey_runs SET due_at = $2, updated_at = NOW() WHERE workspace_id = $1 AND status = 'waiting' AND held IN ('limit_day','limit_hour','limit_person') AND due_at > $2",
  forget: 'UPDATE workspace_mail SET limit_day = NULL, limit_hour = NULL, limit_person = NULL, paused_until = NULL, pause_reason = NULL, pause_detail = NULL, pause_count = 0 WHERE workspace_id = $1',
};

function createSends(w = {}) {
  for (const list of ['mail', 'sends', 'runs', 'members', 'off']) if (!(list in w)) w[list] = [];
  const asked = [];   // the names of that file's statements, in the order they were asked
  const lower = s => String(s || '').toLowerCase();
  const ofAddress = address => w.mail.filter(m => lower(m.email) === address);
  const workspacesOf = address => ofAddress(address).map(m => m.workspace_id);
  const newestFirst = times => times.map(ms).sort((a, b) => b - a);
  const nth = (times, offset) => { const t = newestFirst(times)[offset]; return { rows: t === undefined ? [] : [{ t: new Date(t) }] }; };
  const clear = m => { m.paused_until = null; m.pause_reason = null; m.pause_detail = null; };
  const heldPaused = address => w.runs.filter(r => workspacesOf(address).includes(r.workspace_id) && r.status === 'waiting' && r.held === 'paused');

  function answer(sql, p = []) {
    const t = norm(sql), name = Object.keys(SQL).find(k => SQL[k] === t);
    if (!name) return null;
    asked.push(name);
    if (name === 'read') {
      const m = w.mail.find(r => r.workspace_id === p[0]);
      if (!m) return { rows: [] };
      const address = lower(m.email), from = w.sends.filter(s => s.from_email === address);
      const [top] = [...ofAddress(address)].sort((a, b) => (ms(b.paused_until) ?? -Infinity) - (ms(a.paused_until) ?? -Infinity) || (b.pause_count || 0) - (a.pause_count || 0));
      return { rows: [{ email: m.email, limit_day: m.limit_day ?? null, limit_hour: m.limit_hour ?? null, limit_person: m.limit_person ?? null,
        paused_until: top.paused_until ?? null, pause_reason: top.pause_reason ?? null, pause_detail: top.pause_detail ?? null, pause_count: top.pause_count || 0,
        sent_day: from.filter(s => ms(s.sent_at) > ms(p[1])).length, sent_hour: from.filter(s => ms(s.sent_at) > ms(p[2])).length,
        sent_person: p[3] == null ? 0 : from.filter(s => s.kind === 'step' && s.contact_id === p[3] && ms(s.sent_at) > ms(p[1])).length }] };
    }
    if (name === 'slotPerson') return nth(w.sends.filter(s => s.from_email === p[0] && s.kind === 'step' && s.contact_id === p[2] && ms(s.sent_at) > ms(p[1])).map(s => s.sent_at), p[3]);
    if (name === 'slot') {
      const waiting = w.runs.filter(r => workspacesOf(p[0]).includes(r.workspace_id) && !w.off.includes(r.flow_id) && r.status === 'waiting' && r.held === p[2] && ms(r.due_at) > ms(p[3]));
      return nth([...w.sends.filter(s => s.from_email === p[0] && ms(s.sent_at) > ms(p[1])).map(s => s.sent_at), ...waiting.map(r => r.due_at)], p[4]);
    }
    if (name === 'count') { w.sends.push({ workspace_id: p[0], from_email: p[1], contact_id: p[2], kind: p[3], sent_at: p[4] }); return { rows: [], rowCount: 1 }; }
    if (name === 'proven') {
      const rows = ofAddress(p[0]).filter(m => m.paused_until == null || ms(m.paused_until) <= ms(p[1]));
      for (const m of rows) { clear(m); m.pause_count = 0; }
      return { rows: [], rowCount: rows.length };
    }
    if (name === 'trim') { const old = w.sends.filter(s => ms(s.sent_at) < ms(p[0])); for (const s of old) w.sends.splice(w.sends.indexOf(s), 1); return { rows: [], rowCount: old.length }; }
    if (name === 'pauseWas') {
      const rows = ofAddress(p[0]), untils = rows.map(m => ms(m.paused_until)).filter(v => v != null);
      return { rows: [{ count: Math.max(0, ...rows.map(m => m.pause_count || 0)), until: untils.length ? new Date(Math.max(...untils)) : null }] };
    }
    if (name === 'pause') {
      const rows = ofAddress(p[0]).filter(m => m.paused_until == null || ms(m.paused_until) <= ms(p[4]));
      for (const m of rows) Object.assign(m, { paused_until: p[1], pause_reason: 'google_limit', pause_detail: p[2], pause_count: p[3] });
      return { rows: rows.map(m => ({ workspace_id: m.workspace_id })), rowCount: rows.length };
    }
    if (name === 'pausePush') { const rows = heldPaused(p[0]); for (const r of rows) r.due_at = p[1]; return { rows: [], rowCount: rows.length }; }
    if (name === 'managers') {
      return { rows: w.members.filter(m => p[0].includes(m.workspace_id) && ['owner', 'admin'].includes(m.role)).sort((a, b) => a.workspace_id - b.workspace_id || a.user_id - b.user_id)
        .map(m => ({ user_id: m.user_id, workspace_id: m.workspace_id })) };
    }
    if (name === 'resume') { const rows = ofAddress(p[0]); rows.forEach(clear); return { rows: [], rowCount: rows.length }; }
    if (name === 'resumePull') { const rows = heldPaused(p[0]).filter(r => ms(r.due_at) > ms(p[1])); for (const r of rows) r.due_at = p[1]; return { rows: [], rowCount: rows.length }; }
    if (name === 'limits') {
      const rows = w.mail.filter(m => m.workspace_id === p[0]);
      for (const m of rows) Object.assign(m, { limit_day: p[1], limit_hour: p[2], limit_person: p[3] });
      return { rows: [], rowCount: rows.length };
    }
    if (name === 'limitsPull') {
      const rows = w.runs.filter(r => r.workspace_id === p[0] && r.status === 'waiting' && ['limit_day', 'limit_hour', 'limit_person'].includes(r.held) && ms(r.due_at) > ms(p[1]));
      for (const r of rows) r.due_at = p[1];
      return { rows: [], rowCount: rows.length };
    }
    // forget
    const rows = w.mail.filter(m => m.workspace_id === p[0]);
    for (const m of rows) { clear(m); Object.assign(m, { limit_day: null, limit_hour: null, limit_person: null, pause_count: 0 }); }
    return { rows: [], rowCount: rows.length };
  }
  return { w, asked, answer, SQL };
}

module.exports = { createSends, SQL };
