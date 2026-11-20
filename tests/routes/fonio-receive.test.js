// ROUTE tests for fonio's result link (routes/fonio.js POST /receive/:token, FONIO_CHANGES Part 7, 2026-11-09). fonio's
// API cannot fetch a call or its transcript, so fonio sends them itself after each call to the workspace's secret link
// (an HTTP Request in fonio, Run "After the conversation"). The CRM finds the call it belongs to and writes one note on
// the call's deal and contact (source 'fonio', no author). Served the way server.js serves it (raw bytes, 1 MB) over
// a stateful fake pool. Pinned: the link alone decides the workspace; a call is found by crm_call_id, else by number
// (the newest sent call without a result in the last six hours), never another workspace's; one note per call and per
// conversation however often fonio delivers; a call the CRM did not start (inbound, or matching no call) is kept in
// fonio_other_calls and noted on the contact with that number (Part 15); empty bodies and calls whose contact and deal
// are gone are acknowledged and ignored; a body that is not JSON is a 400; every delivery is remembered without its values; the
// link and the last delivery reach owners and admins only; the wiring in server.js and db.js.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const { loadRoute, ROOT } = require('../helpers/load-route');

const WS = 7, OTHER_WS = 8;
const TOKEN = 'ab'.repeat(32), OTHER_TOKEN = 'cd'.repeat(32);
const OWN = '+4930123456';
const NOW = Date.now();
const ago = min => new Date(NOW - min * 60000).toISOString();

const state = {};
function reset() {
  Object.assign(state, {
    calls: [], nextActivity: 500, nextCall: 90,
    conns: [
      { workspace_id: WS, from_number: OWN, receive_token: TOKEN, last_delivery: null },
      { workspace_id: OTHER_WS, from_number: '+4940999999', receive_token: OTHER_TOKEN, last_delivery: null },
    ],
    fonioCalls: [
      { id: 11, workspace_id: WS, contact_id: 5, deal_id: 12, status: 'sent', to_number: '+491711234567', sent_at: ago(400), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 12, workspace_id: WS, contact_id: 5, deal_id: 13, status: 'sent', to_number: '+491711234567', sent_at: ago(3), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 13, workspace_id: WS, contact_id: 6, deal_id: 14, status: 'failed', to_number: '+491722222222', sent_at: null, result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 14, workspace_id: WS, contact_id: null, deal_id: null, status: 'sent', to_number: '+491733333333', sent_at: ago(2), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
      { id: 21, workspace_id: OTHER_WS, contact_id: 30, deal_id: 31, status: 'sent', to_number: '+491744444444', sent_at: ago(1), result_at: null, conversation_id: null, conversation_link: null, note_activity_id: null },
    ],
    activities: [],
    // contact 40 has one deal, 41 has two, 42 none; 43 and 44 share a number (44 changed last); 50 is the other workspace's
    contacts: [
      { id: 40, workspace_id: WS, phone: '0151 1000001', updated_at: ago(500) },
      { id: 41, workspace_id: WS, phone: '+49 151 1000002', updated_at: ago(500) },
      { id: 42, workspace_id: WS, phone: '0049 151 1000003', updated_at: ago(500) },
      { id: 43, workspace_id: WS, phone: '+491511000004', updated_at: ago(500) },
      { id: 44, workspace_id: WS, phone: '01511000004', updated_at: ago(5) },
      { id: 45, workspace_id: WS, phone: '', updated_at: ago(1) },
      { id: 50, workspace_id: OTHER_WS, phone: '+491511000009', updated_at: ago(1) },
    ],
    deals: [{ id: 60, workspace_id: WS, contact_id: 40 }, { id: 61, workspace_id: WS, contact_id: 41 }, { id: 62, workspace_id: WS, contact_id: 41 }],
    // Part 39: the deals of the calls above as the stage rules read them (deal 13 is call 12's), and the stages of pipeline 1
    dealRows: [{ id: 13, workspace_id: WS, title: 'Erika Muster', contact_id: 5, pipeline_id: 1, stage_id: 71, urgency: 0 }],
    stages: [{ id: 71, pipeline_id: 1, name: 'Neu' }, { id: 72, pipeline_id: 1, name: 'Qualifiziert' }, { id: 73, pipeline_id: 1, name: 'Termin geplant' }, { id: 74, pipeline_id: 1, name: 'Nicht erreicht' }],
    others: [], nextOther: 900,
  });
}
const callOf = id => state.fonioCalls.find(c => c.id === id);
const fields = c => ({ id: c.id, contact_id: c.contact_id, deal_id: c.deal_id, result_at: c.result_at, note_activity_id: c.note_activity_id,
  sent_at: c.sent_at || null, trigger: c.trigger || 'deal_manual', raw_number: c.raw_number || null, to_number: c.to_number || null,
  follow_up_no: c.follow_up_no || 0, follow_up_at: c.follow_up_at || null });

const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    // Part 28: the note a meeting belongs to, its last line, and who answers for the deal
    if (q === 'SELECT contact_id, deal_id FROM activities WHERE id = $1 AND workspace_id = $2') return { rows: state.activities.filter(a => a.id === params[0] && a.workspace_id === params[1]).map(a => ({ contact_id: a.contact_id, deal_id: a.deal_id })) };
    if (q === 'UPDATE activities SET content = content || $3 WHERE id = $1 AND workspace_id = $2') { const a = state.activities.find(x => x.id === params[0] && x.workspace_id === params[1]); if (a) a.content += params[2]; return { rowCount: a ? 1 : 0, rows: [] }; }
    if (q === 'SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2') return { rows: [{ assigned_to: params[0] === 13 ? 9 : null }] };
    if (q === 'SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2') return { rows: [{ assigned_to: null }] };
    if (q === 'SELECT workspace_id, from_number, country_code, book_meetings, hours_tz FROM workspace_fonio WHERE receive_token = $1') {
      const c = state.conns.find(x => x.receive_token === params[0]);
      return { rows: c ? [{ workspace_id: c.workspace_id, from_number: c.from_number, country_code: '+49', book_meetings: c.book_meetings !== false, hours_tz: 'Europe/Berlin' }] : [] };
    }
    // Part 39: the deal after the call — the workspace's table, the one look per call, the deal, its stages, the move
    if (q === 'SELECT stage_rules FROM workspace_fonio WHERE workspace_id = $1') {
      const c = state.conns.find(x => x.workspace_id === params[0]);
      return { rows: c ? [{ stage_rules: c.stage_rules || {} }] : [] };
    }
    if (q.startsWith('UPDATE fonio_calls SET stage_rule_at = NOW(), stage_event = $3 WHERE id = $1 AND workspace_id = $2 AND stage_rule_at IS NULL RETURNING')) {
      const c = state.fonioCalls.find(x => x.id === params[0] && x.workspace_id === params[1]);
      if (!c || c.stage_rule_at) return { rows: [] };
      c.stage_rule_at = new Date().toISOString(); c.stage_event = params[2];
      return { rows: [{ id: c.id, deal_id: c.deal_id, contact_id: c.contact_id, stage_at_send: c.stage_at_send ?? null }] };
    }
    if (q === 'SELECT id, title, contact_id, pipeline_id, stage_id, urgency FROM deals WHERE id = $1 AND workspace_id = $2') {
      const d = state.dealRows.find(x => x.id === params[0] && x.workspace_id === params[1]);
      return { rows: d ? [{ id: d.id, title: d.title, contact_id: d.contact_id, pipeline_id: d.pipeline_id, stage_id: d.stage_id, urgency: d.urgency }] : [] };
    }
    if (q === 'SELECT id, name FROM pipeline_stages WHERE id = $1 AND pipeline_id = $2 AND workspace_id = $3') {
      const st = state.stages.find(x => x.id === params[0] && x.pipeline_id === params[1] && params[2] === WS);
      return { rows: st ? [{ id: st.id, name: st.name }] : [] };
    }
    if (q.startsWith('UPDATE deals SET stage_id = COALESCE($3, stage_id), urgency = COALESCE($4, urgency), updated_at = NOW() WHERE id = $1 AND workspace_id = $2 AND stage_id IS NOT DISTINCT FROM $5')) {
      const d = state.dealRows.find(x => x.id === params[0] && x.workspace_id === params[1]);
      if (!d || (d.stage_id ?? null) !== (params[4] ?? null)) return { rowCount: 0, rows: [] };
      if (params[2] != null) d.stage_id = params[2]; if (params[3] != null) d.urgency = params[3];
      return { rowCount: 1, rows: [] };
    }
    if (q === 'SELECT id FROM users WHERE workspace_id = $1') return { rows: params[0] === WS ? [{ id: 1 }, { id: 3 }] : [] };
    if (q === 'UPDATE workspace_fonio SET last_delivery = $2::jsonb WHERE workspace_id = $1') {
      state.conns.find(x => x.workspace_id === params[0]).last_delivery = JSON.parse(params[1]);
      return { rows: [], rowCount: 1 };
    }
    if (q === 'SELECT id, note_activity_id FROM fonio_calls WHERE workspace_id = $1 AND conversation_id = $2') {
      const c = state.fonioCalls.find(x => x.workspace_id === params[0] && x.conversation_id === params[1]);
      return { rows: c ? [{ id: c.id, note_activity_id: c.note_activity_id }] : [] };
    }
    if (q === "SELECT id, contact_id, deal_id, result_at, note_activity_id, sent_at, trigger, raw_number, to_number, follow_up_no, follow_up_at FROM fonio_calls WHERE id = $1 AND workspace_id = $2 AND status = 'sent'") {
      const c = state.fonioCalls.find(x => x.id === params[0] && x.workspace_id === params[1] && x.status === 'sent');
      return { rows: c ? [fields(c)] : [] };
    }
    if (q === "SELECT id, contact_id, deal_id, result_at, note_activity_id, sent_at, trigger, raw_number, to_number, follow_up_no, follow_up_at FROM fonio_calls WHERE workspace_id = $1 AND status = 'sent' AND result_at IS NULL AND to_number = ANY($2::text[]) AND sent_at > $3 ORDER BY sent_at DESC, id DESC LIMIT 1") {
      const since = new Date(params[2]).getTime();
      const c = state.fonioCalls
        .filter(x => x.workspace_id === params[0] && x.status === 'sent' && !x.result_at && params[1].includes(x.to_number) && x.sent_at && new Date(x.sent_at).getTime() > since)
        .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at) || b.id - a.id)[0];
      return { rows: c ? [fields(c)] : [] };
    }
    if (q === "WITH claim AS ( UPDATE fonio_calls SET result_at = NOW(), conversation_id = $2, conversation_link = $3, updated_at = NOW() WHERE id = $1 AND result_at IS NULL RETURNING workspace_id, contact_id, deal_id ) INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) SELECT workspace_id, contact_id, deal_id, 'note', $4::text, NULL, 'fonio' FROM claim RETURNING id") {
      const c = state.fonioCalls.find(x => x.id === params[0] && !x.result_at);
      if (!c) return { rows: [] };
      if (params[1] != null && state.fonioCalls.some(x => x !== c && x.workspace_id === c.workspace_id && x.conversation_id === params[1])) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "fonio_calls_one_conversation"'), { code: '23505' });
      }
      Object.assign(c, { result_at: new Date().toISOString(), conversation_id: params[1], conversation_link: params[2] });
      const a = { id: state.nextActivity++, workspace_id: c.workspace_id, contact_id: c.contact_id, deal_id: c.deal_id, type: 'note', content: params[3], created_by: null, source: 'fonio' };
      state.activities.push(a);
      return { rows: [{ id: a.id }] };
    }
    if (q === 'UPDATE fonio_calls SET result_body = $2::jsonb WHERE id = $1') { callOf(params[0]).result_body = JSON.parse(params[1]); return { rows: [] }; }
    if (q === 'UPDATE fonio_other_calls SET result_body = $2::jsonb WHERE id = $1') { state.others.find(o => o.id === params[0]).result_body = JSON.parse(params[1]); return { rows: [] }; }
    if (q === 'UPDATE fonio_calls SET note_activity_id = $1 WHERE id = $2') { callOf(params[1]).note_activity_id = params[0]; return { rows: [] }; }
    // Part 33: the note keeps how the call ended, and a call that reached nobody books one retry
    if (q === 'UPDATE fonio_calls SET note_activity_id = $1, call_outcome = COALESCE($3, call_outcome) WHERE id = $2') {
      const c = callOf(params[1]);
      if (c) { c.note_activity_id = params[0]; if (params[2]) c.call_outcome = params[2]; }
      return { rows: [] };
    }
    if (q === 'SELECT * FROM workspace_fonio WHERE workspace_id = $1') {
      const c = state.conns.find(x => x.workspace_id === params[0]);
      return { rows: c ? [{ delay_minutes: 5, active: true, country_code: '+49', hours_on: true, hours_days: [1, 2, 3, 4, 5],
        hours_from: '09:00:00', hours_to: '18:00:00', hours_tz: 'Europe/Berlin', follow_up: {}, ...c }] : [] };
    }
    // Part 35: how many callbacks the chain a call belongs to has had, and a sweep's retry that becomes the callback
    if (q.startsWith('WITH RECURSIVE chain AS ( SELECT id, follow_up_of, trigger FROM fonio_calls WHERE id = $1 AND workspace_id = $2 UNION ALL')) {
      let n = 0;
      for (let c = state.fonioCalls.find(x => x.id === params[0] && x.workspace_id === params[1]); c; c = state.fonioCalls.find(x => x.id === c.follow_up_of)) if (c.trigger === 'callback') n++;
      return { rows: [{ callbacks: n }] };
    }
    if (q === "UPDATE fonio_calls SET trigger = 'callback', due_at = $2, follow_up_no = $3, updated_at = NOW() WHERE follow_up_of = $1 AND status = 'scheduled' RETURNING id, status, reason, due_at") {
      const c = state.fonioCalls.find(x => x.follow_up_of === params[0] && x.status === 'scheduled');
      if (!c) return { rows: [] };
      Object.assign(c, { trigger: 'callback', due_at: params[1], follow_up_no: params[2] });
      return { rows: [{ id: c.id, status: c.status, reason: c.reason, due_at: c.due_at }] };
    }
    if (q.startsWith("INSERT INTO fonio_calls (workspace_id, deal_id, contact_id, trigger, status, raw_number, to_number, due_at, follow_up_of, follow_up_no)")) {
      // one waiting call per contact (fonio_calls_one_waiting)
      if (state.fonioCalls.some(c => c.contact_id === params[2] && (c.status === 'scheduled' || c.status === 'sending'))) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const row = { id: state.nextCall++, workspace_id: params[0], deal_id: params[1], contact_id: params[2], trigger: /VALUES \(\$1,\$2,\$3,'callback','scheduled'/.test(q) ? 'callback' : 'follow_up', status: 'scheduled',
        reason: null, raw_number: params[3], to_number: params[4], due_at: params[5], follow_up_of: params[6], follow_up_no: params[7],
        result_at: null, note_activity_id: null, follow_up_at: null, sent_at: null, conversation_id: null, conversation_link: null };
      state.fonioCalls.push(row);
      return { rows: [{ id: row.id, status: row.status, reason: row.reason, due_at: row.due_at }] };
    }
    if (q === 'UPDATE fonio_calls SET follow_up_at = NOW(), updated_at = NOW() WHERE id = $1 AND follow_up_at IS NULL RETURNING id') {
      const c = callOf(params[0]);
      if (!c || c.follow_up_at) return { rows: [] };
      c.follow_up_at = new Date().toISOString();
      return { rows: [{ id: c.id }] };
    }
    if (q.startsWith("UPDATE fonio_calls SET status = 'cancelled', reason = 'late_result'")) {
      let n = 0;
      for (const c of state.fonioCalls) if (c.follow_up_of === params[0] && c.status === 'scheduled') { c.status = 'cancelled'; c.reason = 'late_result'; n++; }
      return { rowCount: n, rows: [] };
    }
    if (q === 'SELECT id, note_activity_id FROM fonio_other_calls WHERE workspace_id = $1 AND conversation_id = $2') {
      const o = state.others.find(x => x.workspace_id === params[0] && x.conversation_id === params[1]);
      return { rows: o ? [{ id: o.id, note_activity_id: o.note_activity_id }] : [] };
    }
    if (q === "SELECT id, phone FROM contacts WHERE workspace_id = $1 AND phone IS NOT NULL AND phone <> '' ORDER BY updated_at DESC, id DESC") {
      return { rows: state.contacts.filter(c => c.workspace_id === params[0] && c.phone)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at) || b.id - a.id).map(c => ({ id: c.id, phone: c.phone })) };
    }
    if (q === 'SELECT id FROM deals WHERE workspace_id = $1 AND contact_id = $2 ORDER BY id LIMIT 2') {
      return { rows: state.deals.filter(d => d.workspace_id === params[0] && d.contact_id === params[1]).slice(0, 2).map(d => ({ id: d.id })) };
    }
    const otherTaken = (ws, conv) => conv != null && state.others.some(x => x.workspace_id === ws && x.conversation_id === conv);
    const dup = () => Object.assign(new Error('duplicate key value violates unique constraint "fonio_other_calls_one_conversation"'), { code: '23505' });
    if (q.startsWith("WITH note AS ( INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) VALUES ($1::int, $2::int, $3::int, 'note', $4::text, NULL, 'fonio') RETURNING id ) INSERT INTO fonio_other_calls (workspace_id, direction, number, caller_name, contact_id, deal_id, conversation_id, conversation_link, duration, summary, note_activity_id) SELECT $1::int, $5::text, $6::text, $7::text, $2::int, $3::int, $8::text, $9::text, $10::text, $11::text, id FROM note RETURNING id, note_activity_id")) {
      const [ws, contact, deal, content, direction, number, name, conv, link, duration, summary] = params;
      if (otherTaken(ws, conv)) throw dup();   // the whole statement fails: no note either
      const a = { id: state.nextActivity++, workspace_id: ws, contact_id: contact, deal_id: deal, type: 'note', content, created_by: null, source: 'fonio' };
      state.activities.push(a);
      const o = { id: state.nextOther++, workspace_id: ws, direction, number, caller_name: name, contact_id: contact, deal_id: deal, conversation_id: conv, conversation_link: link, duration, summary, transcript: null, note_activity_id: a.id };
      state.others.push(o);
      return { rows: [{ id: o.id, note_activity_id: a.id }] };
    }
    if (q === 'INSERT INTO fonio_other_calls (workspace_id, direction, number, caller_name, conversation_id, conversation_link, duration, summary, transcript) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, note_activity_id') {
      const [ws, direction, number, name, conv, link, duration, summary, transcript] = params;
      if (otherTaken(ws, conv)) throw dup();
      const o = { id: state.nextOther++, workspace_id: ws, direction, number, caller_name: name, contact_id: null, deal_id: null, conversation_id: conv, conversation_link: link, duration, summary, transcript, note_activity_id: null };
      state.others.push(o);
      return { rows: [{ id: o.id, note_activity_id: null }] };
    }
    if (/FROM workspace_fonio f LEFT JOIN users u/.test(q)) {
      const c = state.conns.find(x => x.workspace_id === params[0]);
      return { rows: c ? [{ from_number: c.from_number, active: true, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true, country_code: '+49',
        number_prefixes: [], hours_on: true, hours_days: [1, 2, 3, 4, 5], hours_from: '09:00:00', hours_to: '18:00:00', hours_tz: 'Europe/Berlin',
        key_hint: 'wxyz', receive_token: c.receive_token, last_delivery: c.last_delivery, saved_by: 1, saved_at: '2026-11-09T09:00:00.000Z', saved_by_name: 'Olaf Owner' }] : [] };
    }
    throw new Error('unexpected query: ' + q);
  },
};

let base, server;
const told = [];   // who the route told of what (Part 28)
const envSaved = {};
function app(user) {
  const a = express();
  a.use('/api/integrations/fonio/receive', express.raw({ type: '*/*', limit: '1mb' }));   // as server.js
  a.use(express.json());
  a.use('/api/integrations/fonio', loadRoute('fonio.js', { pool, user, notifications: { notify() {}, notifyUser: async (wid, actor, userId, n) => { told.push({ wid, actor, userId, ...n }); return true; } } }));
  a.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  return a;
}
let memberBase, memberServer;
before(async () => {
  for (const k of ['APP_BASE_URL', 'BASE_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  server = await new Promise(resolve => { const s = app({ id: 1, workspaceId: WS, role: 'owner' }).listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  memberServer = await new Promise(resolve => { const s = app({ id: 3, workspaceId: WS, role: 'member' }).listen(0, '127.0.0.1', () => resolve(s)); });
  memberBase = `http://127.0.0.1:${memberServer.address().port}`;
});
after(async () => {
  for (const s of [server, memberServer]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)); }
  for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; }
});
beforeEach(reset);

// fonio's delivery: a POST with the Body as written in fonio (an object, or raw text as fonio may send it).
const post = async (token, body, { type = 'application/json', at = base } = {}) => {
  const r = await fetch(`${at}/api/integrations/fonio/receive/${token}`, { method: 'POST', headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const RESULT = { crm_call_id: '12', conversation_id: 'conv-1', conversation_link: 'https://app.fonio.ai/conversations/conv-1', direction: 'outbound',
  duration: '125', summary: 'Termin am Freitag vereinbart.', transcript: 'Agent: Guten Tag\nKunde: Hallo', person_number: '+491711234567', agent_number: OWN };
const notes = () => state.activities;
const lastDelivery = (ws = WS) => state.conns.find(c => c.workspace_id === ws).last_delivery;

describe('a finished call', () => {
  test("the note lands on the call's deal and contact, as fonio's, in this workspace", async () => {
    const r = await post(TOKEN, RESULT);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, already: false, call_id: 12, activity_id: 500 });
    assert.equal(notes().length, 1);
    const n = notes()[0];
    assert.deepEqual({ ws: n.workspace_id, contact: n.contact_id, deal: n.deal_id, type: n.type, by: n.created_by, source: n.source }, { ws: WS, contact: 5, deal: 13, type: 'note', by: null, source: 'fonio' });
    assert.equal(n.content, 'fonio-Anruf · Dauer 125\n\nZusammenfassung\nTermin am Freitag vereinbart.\n\nTranskript\nAgent: Guten Tag\nKunde: Hallo\n\nGespräch in fonio: https://app.fonio.ai/conversations/conv-1');
    assert.equal(callOf(12).conversation_id, 'conv-1');
    assert.equal(callOf(12).conversation_link, 'https://app.fonio.ai/conversations/conv-1');
    assert.equal(callOf(12).note_activity_id, 500);
    assert.ok(callOf(12).result_at);
    assert.equal(callOf(11).result_at, null, 'the older call to the same number is untouched');
  });
  test('the delivery is remembered: when, the outcome, the call, the field names — never the values', async () => {
    await post(TOKEN, RESULT);
    const d = lastDelivery();
    assert.deepEqual({ outcome: d.outcome, call: d.call_id, fields: d.fields }, { outcome: 'noted', call: 12, fields: Object.keys(RESULT) });
    assert.ok(!Number.isNaN(Date.parse(d.at)));
    assert.doesNotMatch(JSON.stringify(d), /Termin|Guten Tag|\+49171/);
    assert.equal(lastDelivery(OTHER_WS), null);
  });
  test('without a filled crm_call_id the call is found by number: the newest sent call without a result', async () => {
    const r = await post(TOKEN, { conversationId: 'c-2', from: '+491711234567', to: OWN, crm_call_id: '{{crm_call_id}}', summary: 'S' });
    assert.equal(r.body.call_id, 12);
    const again = await post(TOKEN, { conversationId: 'c-3', from: '+491711234567', to: OWN, summary: 'S' });
    assert.deepEqual(again.body, { success: true, already: false, call_id: null, other_id: 900, activity_id: null }, 'the call 6+ hours ago is too old to be this one: kept in the call log');
    assert.equal(notes().length, 1);
    assert.equal(callOf(11).result_at, null);
  });
  test('the number match covers six hours, not more', async () => {
    callOf(12).sent_at = ago(6 * 60 - 1);
    assert.equal((await post(TOKEN, { from: '+491711234567', summary: 'S' })).body.call_id, 12);
    reset(); callOf(12).sent_at = ago(6 * 60 + 1);
    assert.equal((await post(TOKEN, { from: '+491711234567', summary: 'S' })).body.call_id, null);
    assert.equal(callOf(12).result_at, null);
  });
  test('a raw transcript with line breaks inside the JSON string, sent as text, is still written', async () => {
    const raw = `{"crm_call_id": "12", "transcript": "Agent: Guten Tag\nKunde: Hallo"}`;
    const r = await post(TOKEN, raw, { type: 'text/plain' });
    assert.equal(r.status, 200);
    assert.ok(notes()[0].content.includes('Transkript\nAgent: Guten Tag\nKunde: Hallo'));
  });
});

describe('never twice', () => {
  test('fonio delivering the same result again: acknowledged, no second note', async () => {
    await post(TOKEN, RESULT);
    const r = await post(TOKEN, RESULT);
    assert.deepEqual(r.body, { success: true, already: true, call_id: 12, activity_id: 500 });
    assert.equal(notes().length, 1);
    assert.equal(lastDelivery().outcome, 'already');
  });
  test('the same call again under another conversation id: still one note per call', async () => {
    await post(TOKEN, RESULT);
    const r = await post(TOKEN, { ...RESULT, conversation_id: 'conv-other' });
    assert.deepEqual(r.body, { success: true, already: true, call_id: 12, activity_id: 500 }, 'recognised before any claim, with its note');
    assert.equal(callOf(12).conversation_id, 'conv-1');
    assert.equal(notes().length, 1);
  });
  test('the same conversation matched by number to an older call: refused by the conversation, no second note', async () => {
    callOf(11).sent_at = ago(30);
    const body = { conversation_id: 'conv-9', from: '+491711234567', summary: 'S' };
    assert.equal((await post(TOKEN, body)).body.call_id, 12);
    const r = await post(TOKEN, body);
    assert.deepEqual(r.body, { success: true, already: true, call_id: 12, activity_id: 500 });
    assert.equal(callOf(11).result_at, null);
    assert.equal(notes().length, 1);
  });
  test('two deliveries of one conversation at once, matched to different calls: the unique index lets one through', async () => {
    callOf(11).sent_at = ago(30);
    Object.assign(callOf(11), { conversation_id: 'conv-race', result_at: ago(0) });   // the other delivery's claim landed first
    const orig = pool.query;
    let first = true;
    pool.query = async (sql, params) => {   // the dedupe read runs before that claim committed
      if (first && /AND conversation_id = \$2$/.test(String(sql).replace(/\s+/g, ' ').trim())) { first = false; return { rows: [] }; }
      return orig(sql, params);
    };
    try {
      const r = await post(TOKEN, { conversation_id: 'conv-race', from: '+491711234567', summary: 'S' });
      assert.equal(r.status, 200);
      assert.equal(r.body.already, true);
      assert.equal(notes().length, 0);
      assert.equal(callOf(12).result_at, null, 'the losing claim wrote nothing');
    } finally { pool.query = orig; }
  });
});

describe('acknowledged and ignored', () => {
  test("another workspace's call is never matched, by id or by number", async () => {
    assert.equal((await post(TOKEN, { crm_call_id: '21', from: '+491744444444', summary: 'S' })).body.call_id, null);
    assert.equal(callOf(21).result_at, null);
    assert.equal(notes().length, 0);
    assert.equal(state.others[0].workspace_id, WS, "kept in this link's workspace as an unknown number");
  });
  test('a call that was not sent (failed) is not matched', async () => {
    assert.equal((await post(TOKEN, { crm_call_id: '13', from: '+491722222222' })).body.call_id, null);
    assert.equal(callOf(13).result_at, null);
  });
  test("a call whose contact and deal were deleted: nothing written", async () => {
    assert.deepEqual((await post(TOKEN, { crm_call_id: '14', summary: 'S' })).body, { ignored: true, reason: 'gone' });
    assert.equal(notes().length, 0);
    assert.equal(callOf(14).result_at, null);
  });
  test('a body with nothing to match: ignored', async () => {
    assert.deepEqual((await post(TOKEN, {})).body, { ignored: true, reason: 'no_match' });
    assert.deepEqual((await post(TOKEN, { direction: 'inbound', agent_number: OWN, summary: '{{summary}}' })).body, { ignored: true, reason: 'no_match' });
    assert.equal(state.others.length, 0);
    assert.equal(lastDelivery().outcome, 'no_match');
  });
});

// Part 15 (2026-11-11): a call the CRM did not start is kept in fonio_other_calls and noted on the contact with that number.
describe('a call the CRM did not start', () => {
  const IN = { conversation_id: 'in-1', conversation_link: 'https://app.fonio.ai/conversations/in-1', direction: 'inbound', agent_number: OWN,
    caller_name: 'Erika  Muster', duration: '1:05', summary: 'Fragt nach dem Exposé.', transcript: 'Caller: Hallo' };
  const other = () => state.others[0];
  test('incoming, the contact has one deal: the note is on the contact and that deal', async () => {
    const r = await post(TOKEN, { ...IN, person_number: '+491511000001' });
    assert.deepEqual(r.body, { success: true, already: false, call_id: null, other_id: 900, activity_id: 500 });
    const n = notes()[0];
    assert.deepEqual({ ws: n.workspace_id, contact: n.contact_id, deal: n.deal_id, source: n.source, by: n.created_by }, { ws: WS, contact: 40, deal: 60, source: 'fonio', by: null });
    assert.equal(n.content, 'Eingehender fonio-Anruf · Dauer 1:05\n\nZusammenfassung\nFragt nach dem Exposé.\n\nTranskript\nCaller: Hallo\n\nGespräch in fonio: https://app.fonio.ai/conversations/in-1');
    assert.deepEqual({ ...other(), result_body: undefined }, { result_body: undefined, id: 900, workspace_id: WS, direction: 'inbound', number: '+491511000001', caller_name: 'Erika Muster', contact_id: 40, deal_id: 60,
      conversation_id: 'in-1', conversation_link: 'https://app.fonio.ai/conversations/in-1', duration: '1:05', summary: 'Fragt nach dem Exposé.', transcript: null, note_activity_id: 500 });
    assert.equal(lastDelivery().outcome, 'noted');
    assert.equal(callOf(12).result_at, null, "no call of the CRM is claimed");
  });
  test('the contact has several deals: the note is on the contact, not on a deal', async () => {
    await post(TOKEN, { ...IN, person_number: '+491511000002' });
    assert.deepEqual({ contact: notes()[0].contact_id, deal: notes()[0].deal_id }, { contact: 41, deal: null });
    assert.equal(other().deal_id, null);
  });
  test('the contact has no deal: the note is on the contact', async () => {
    await post(TOKEN, { ...IN, person_number: '+491511000003' });
    assert.deepEqual({ contact: notes()[0].contact_id, deal: notes()[0].deal_id }, { contact: 42, deal: null });
  });
  test('two contacts share the number: the one changed last', async () => {
    await post(TOKEN, { ...IN, person_number: '+491511000004' });
    assert.equal(notes()[0].contact_id, 44);
  });
  test('an unknown number: kept with the name and the transcript, no note', async () => {
    const r = await post(TOKEN, { ...IN, person_number: '+491519999999' });
    assert.deepEqual(r.body, { success: true, already: false, call_id: null, other_id: 900, activity_id: null });
    assert.equal(notes().length, 0);
    assert.deepEqual({ number: other().number, name: other().caller_name, contact: other().contact_id, transcript: other().transcript, summary: other().summary },
      { number: '+491519999999', name: 'Erika Muster', contact: null, transcript: 'Caller: Hallo', summary: 'Fragt nach dem Exposé.' });
    assert.equal(lastDelivery().outcome, 'logged');
  });
  test("another workspace's contact with that number is not this workspace's", async () => {
    await post(TOKEN, { ...IN, person_number: '+491511000009' });
    assert.equal(other().contact_id, null);
    assert.equal(notes().length, 0);
  });
  test('a hidden number: kept without one', async () => {
    await post(TOKEN, IN);
    assert.deepEqual({ number: other().number, contact: other().contact_id }, { number: null, contact: null });
  });
  test('a name fonio could not fill, or "unbekannt", is no name', async () => {
    await post(TOKEN, { ...IN, caller_name: '{{caller_name}}', person_number: '+491519999999' });
    await post(TOKEN, { ...IN, conversation_id: 'in-2', caller_name: 'Unbekannt', person_number: '+491519999999' });
    assert.deepEqual(state.others.map(o => o.caller_name), [null, null]);
  });
  test('the same conversation delivered again: one row, one note', async () => {
    await post(TOKEN, { ...IN, person_number: '+491511000001' });
    const r = await post(TOKEN, { ...IN, person_number: '+491511000001' });
    assert.deepEqual(r.body, { success: true, already: true, call_id: null, other_id: 900, activity_id: 500 });
    assert.equal(state.others.length, 1);
    assert.equal(notes().length, 1);
    assert.equal(lastDelivery().outcome, 'already');
  });
  test('two deliveries of one conversation at once: the unique index lets one through, and no note is left behind', async () => {
    state.others.push({ id: 899, workspace_id: WS, conversation_id: 'in-1', note_activity_id: 1 });
    const orig = pool.query;
    pool.query = async (sql, params) => (/FROM fonio_other_calls WHERE/.test(String(sql)) ? { rows: [] } : orig(sql, params));
    try {
      const r = await post(TOKEN, { ...IN, person_number: '+491511000001' });
      assert.deepEqual(r.body, { success: true, already: true, call_id: null, other_id: null, activity_id: null });
      assert.equal(notes().length, 0);
    } finally { pool.query = orig; }
  });
  test('an incoming call from a number the CRM called is still incoming: the waiting call keeps its place', async () => {
    await post(TOKEN, { ...IN, person_number: '+491711234567' });
    assert.equal(callOf(12).result_at, null);
    assert.equal(other().direction, 'inbound');
  });
  test('an outgoing call the CRM did not start, to a known contact: noted there as outgoing', async () => {
    await post(TOKEN, { conversation_id: 'out-9', direction: 'outbound', person_number: '+491511000001', summary: 'S' });
    assert.equal(other().direction, 'outbound');
    assert.ok(notes()[0].content.startsWith('fonio-Anruf'));
    assert.equal(notes()[0].contact_id, 40);
  });
  test('nothing recorded (a declined recording): the note says so', async () => {
    await post(TOKEN, { conversation_id: 'in-3', direction: 'inbound', person_number: '+491511000001', duration: '0:12' });
    assert.equal(notes()[0].content, 'Eingehender fonio-Anruf · Dauer 0:12\n\nKeine Aufzeichnung: fonio hat weder eine Zusammenfassung noch ein Transkript mitgeschickt. Das ist so, wenn die Person die Aufzeichnung abgelehnt hat oder kein Gespräch zustande kam.');
  });
  test("Part 18: the Body fonio sent is kept with the row it became — a CRM call, a contact's call, an unknown caller's — once", async () => {
    await post(TOKEN, RESULT);
    assert.deepEqual(callOf(12).result_body, RESULT);
    await post(TOKEN, { ...RESULT, summary: 'second delivery' });
    assert.equal(callOf(12).result_body.summary, RESULT.summary, 'a repeated delivery does not replace it');
    await post(TOKEN, { ...IN, person_number: '+491511000001' });
    await post(TOKEN, { ...IN, conversation_id: 'in-9', person_number: '+491519999999', transcript: `a\u0000b${'x'.repeat(25000)}` });
    assert.deepEqual(state.others[0].result_body, { ...IN, person_number: '+491511000001' });
    const kept = state.others[1].result_body.transcript;
    assert.ok(kept.startsWith('abxxx') && kept.endsWith('… (cut)') && kept.length < 20020, 'no NUL, and a long text is cut');
    assert.equal(state.others[1].transcript.length, 25003, 'the transcript kept for the note is whole');
  });
  test('db.js: the table, its direction check, one row per conversation', () => {
    const db = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    assert.match(db, /CREATE TABLE IF NOT EXISTS fonio_other_calls \([\s\S]*?direction\s+TEXT NOT NULL CHECK \(direction IN \('inbound','outbound'\)\)[\s\S]*?contact_id\s+INTEGER REFERENCES contacts\(id\) ON DELETE SET NULL[\s\S]*?note_activity_id\s+INTEGER REFERENCES activities\(id\) ON DELETE SET NULL/);
    assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS fonio_other_calls_one_conversation ON fonio_other_calls \(workspace_id, conversation_id\) WHERE conversation_id IS NOT NULL/);
    assert.ok(db.indexOf('CREATE TABLE IF NOT EXISTS fonio_other_calls') > db.indexOf('CREATE TABLE IF NOT EXISTS fonio_calls'));
    for (const col of ['fonio_calls ADD COLUMN IF NOT EXISTS request     JSONB', 'fonio_calls ADD COLUMN IF NOT EXISTS response    JSONB', 'fonio_calls ADD COLUMN IF NOT EXISTS result_body JSONB',
      'fonio_other_calls ADD COLUMN IF NOT EXISTS result_body JSONB']) assert.ok(db.includes(`ALTER TABLE ${col}`), col);
  });
});

// ── Part 28: a meeting agreed in the call is booked ──────────────────────────
describe('a meeting agreed in the call (Part 28)', () => {
  const path = require('path');
  const { ROOT } = require('../helpers/load-route');
  const fonioMeeting = require(path.join(ROOT, 'utils', 'fonio-meeting.js'));
  const integrations = require(path.join(ROOT, 'routes', 'integrations.js'));
  const real = { bookMeeting: fonioMeeting.bookMeeting, tellAssignee: integrations.booking.tellAssignee };
  const MEET = { ...RESULT, meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00' };
  let asked, announced, answer;
  beforeEach(() => {
    told.length = 0; asked = []; announced = [];
    answer = m => ({ status: 'booked', service: 'calendly', inserted: true, activity_id: 777, title: 'Erstgespräch: Erika', start: '2026-11-20T13:00:00.000Z', url: null, location: null, date: m.date, time: m.time, said: m.said });
    fonioMeeting.bookMeeting = async (p, args) => { asked.push(args); return answer(args.meeting); };
    integrations.booking.tellAssignee = async (wid, actor, what) => { announced.push({ wid, actor, ...what }); return 9; };
  });
  after(() => { fonioMeeting.bookMeeting = real.bookMeeting; integrations.booking.tellAssignee = real.tellAssignee; });

  test('booked for the note\'s contact and deal; the note says so on its last line; the assignee hears of the meeting; the answer names it', async () => {
    const r = await post(TOKEN, MEET);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, already: false, call_id: 12, activity_id: 500, meeting: { status: 'booked', service: 'calendly', reason: null, activity_id: 777 } });
    assert.deepEqual(asked, [{ wid: WS, contactId: 5, dealId: 13, meeting: { date: '2026-11-20', time: '14:00', email: null, said: '2026-11-20 14:00' } }]);
    assert.ok(notes()[0].content.endsWith('\n\nTermin gebucht: 20.11.2026, 14:00 (Calendly)'), notes()[0].content.slice(-80));
    assert.deepEqual(announced, [{ wid: WS, actor: null, kind: 'booked', dealId: 13, contactId: 5, title: 'Erstgespräch: Erika', start: '2026-11-20T13:00:00.000Z', url: null, location: null }]);
    assert.equal(told.length, 0);
  });
  test('the service refuses (the time is taken): the note says why and the deal\'s assignee is told, so a person can see to it; fonio\'s delivery still succeeds', async () => {
    answer = m => ({ status: 'failed', service: 'calcom', reason: 'refused', detail: 'User either already has booking at this time or is not available', date: m.date, time: m.time, said: m.said });
    const r = await post(TOKEN, MEET);
    assert.equal(r.status, 200); assert.deepEqual(r.body.meeting, { status: 'failed', service: 'calcom', reason: 'refused', activity_id: null });
    const line = 'Termin im Gespräch vereinbart (20.11.2026, 14:00), aber nicht gebucht: Cal.com hat abgelehnt: User either already has booking at this time or is not available';
    assert.ok(notes()[0].content.endsWith('\n\n' + line));
    assert.deepEqual(told, [{ wid: WS, actor: null, userId: 9, type: 'meeting_failed', category: 'activities', title: '20.11.2026, 14:00', body: line, entityType: 'deal', entityId: 13 }]);
    assert.equal(announced.length, 0);
  });
  test('no booking service connected: nothing is booked and nobody told; the note keeps what was agreed', async () => {
    answer = m => ({ status: 'not_connected', date: m.date, time: m.time, said: m.said });
    const r = await post(TOKEN, MEET);
    assert.deepEqual(r.body.meeting, { status: 'not_connected', service: null, reason: null, activity_id: null });
    assert.ok(notes()[0].content.endsWith('\n\nIm Gespräch vereinbarter Termin: 20.11.2026, 14:00'));
    assert.equal(told.length, 0); assert.equal(announced.length, 0);
  });
  test('no meeting named, or "no": the booking is never asked and the note is as before', async () => {
    await post(TOKEN, RESULT);
    await post(TOKEN, { ...RESULT, crm_call_id: '11', conversation_id: 'conv-2', meeting_booked: 'no', meeting_date: '2026-11-20', meeting_time: '14:00' });
    assert.equal(asked.length, 0); assert.ok(notes().every(n => !/Termin gebucht|vereinbarter Termin|nicht gebucht/.test(n.content)));
  });
  test('the same result delivered twice books once; a booking that throws never fails the delivery', async () => {
    await post(TOKEN, MEET);
    const again = await post(TOKEN, MEET);
    assert.equal(again.body.already, true); assert.equal(again.body.meeting, undefined); assert.equal(asked.length, 1);
    reset(); fonioMeeting.bookMeeting = async () => { throw new Error('boom'); };
    const r = await post(TOKEN, MEET);
    assert.equal(r.status, 200); assert.deepEqual(r.body.meeting, { status: 'failed', service: null, reason: null, activity_id: null });
  });
  test('an incoming call from a known contact books too, for that contact', async () => {
    const r = await post(TOKEN, { conversation_id: 'in-9', direction: 'inbound', person_number: '+491511000001', agent_number: OWN, summary: 'Will einen Termin.', meeting_booked: 'yes', meeting_date: '20.11.2026', meeting_time: '14 Uhr' });
    assert.equal(r.status, 200); assert.equal(r.body.meeting.status, 'booked');
    assert.equal(asked[0].contactId, 40); assert.deepEqual([asked[0].meeting.date, asked[0].meeting.time], ['2026-11-20', '14:00']);
  });
  test('an incoming call from an unknown number has nobody to book for', async () => {
    const r = await post(TOKEN, { conversation_id: 'in-10', direction: 'inbound', person_number: '+491519999999', agent_number: OWN, summary: 'x', meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00' });
    assert.equal(r.status, 200); assert.equal(r.body.meeting, undefined); assert.equal(asked.length, 0);
  });
  test('book_meetings off (Part 34): fonio books the meeting itself, so nothing is asked of a booking service and nobody is told; the note says so', async () => {
    state.conns.find(c => c.workspace_id === WS).book_meetings = false;
    const r = await post(TOKEN, MEET);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.meeting, { status: 'self_booked', service: null, reason: null, activity_id: null });
    assert.equal(asked.length, 0, 'bookMeeting is never asked');
    assert.ok(notes()[0].content.endsWith('\n\nTermin im Gespräch vereinbart: 20.11.2026, 14:00 — die Buchung übernimmt fonio'), notes()[0].content.slice(-130));
    assert.equal(told.length, 0); assert.equal(announced.length, 0);
  });
  test('a row saved before the switch existed (no book_meetings column) books as before: only an explicit false keeps the CRM out', async () => {
    delete state.conns.find(c => c.workspace_id === WS).book_meetings;
    const r = await post(TOKEN, MEET);
    assert.equal(r.body.meeting.status, 'booked');
    assert.equal(asked.length, 1);
  });
});

describe('refused', () => {
  test('an unknown or malformed link is a 404 and writes nothing; a malformed one never reaches the database', async () => {
    for (const t of ['AB'.repeat(32), 'ab'.repeat(31), `${'ab'.repeat(31)}g1`, `${TOKEN}0`]) {
      assert.equal((await post(t, RESULT)).status, 404, t);
    }
    assert.equal(state.calls.length, 0);
    assert.equal((await post('ef'.repeat(32), RESULT)).status, 404);
    assert.deepEqual(state.calls.map(c => c.sql), ['SELECT workspace_id, from_number, country_code, book_meetings, hours_tz FROM workspace_fonio WHERE receive_token = $1']);
    assert.equal(notes().length, 0);
  });
  test('a body that is not JSON: 400, remembered as such', async () => {
    const r = await post(TOKEN, 'summary=Hallo', { type: 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'Body is not JSON' });
    assert.deepEqual({ outcome: lastDelivery().outcome, fields: lastDelivery().fields }, { outcome: 'bad_json', fields: [] });
    assert.equal(notes().length, 0);
  });
  test("the other workspace's link writes into the other workspace only", async () => {
    const r = await post(OTHER_TOKEN, { crm_call_id: '21', summary: 'S' });
    assert.equal(r.body.call_id, 21);
    assert.equal(notes()[0].workspace_id, OTHER_WS);
    assert.equal(lastDelivery(WS), null);
  });
});

describe('the settings answer', () => {
  test('owners and admins get the link and the last delivery', async () => {
    await post(TOKEN, RESULT);
    const r = await (await fetch(`${base}/api/integrations/fonio`)).json();
    assert.equal(r.settings.receive_url, `${base}/api/integrations/fonio/receive/${TOKEN}`);
    assert.equal(r.settings.last_delivery.outcome, 'noted');
  });
  test('a member gets neither', async () => {
    const r = await (await fetch(`${memberBase}/api/integrations/fonio`)).json();
    assert.equal(r.configured, true);
    assert.equal('receive_url' in r.settings, false);
    assert.equal('last_delivery' in r.settings, false);
    assert.equal('key_hint' in r.settings, false);
  });
});

// ── Part 33: a call that reached nobody is tried again ──────────────────────
describe('a call that reached nobody (Part 33)', () => {
  const policy = (over = {}) => ({ enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, ...over });
  const followUps = () => state.fonioCalls.filter(c => c.trigger === 'follow_up');
  const result = (over = {}) => ({ ...RESULT, conversation_id: 'conv-n1', call_outcome: 'no_answer', ...over });

  test('not answered: the note says so, and one follow-up call waits, due the delay after the call itself', async () => {
    state.conns[0].hours_on = false;
    state.conns[0].follow_up = policy();
    const sentAt = new Date(callOf(12).sent_at).getTime();
    const r = await post(TOKEN, result());
    assert.equal(r.status, 200);
    assert.ok(notes()[0].content.startsWith('fonio-Anruf · nicht abgenommen · Dauer 125'), notes()[0].content.slice(0, 60));
    assert.equal(callOf(12).call_outcome, 'no_answer');
    const [f] = followUps();
    assert.deepEqual([f.status, f.follow_up_of, f.follow_up_no, f.contact_id, f.deal_id, f.to_number],
      ['scheduled', 12, 1, 5, 13, '+491711234567']);
    assert.equal(new Date(f.due_at).getTime(), sentAt + 120 * 60000, 'counted from the call, not from the result');
    assert.ok(callOf(12).follow_up_at, 'the call knows it has its retry');
  });
  test('mailbox: a day later; busy: two hours; the outcome is kept on the call', async () => {
    state.conns[0].hours_on = false;
    state.conns[0].follow_up = policy();
    const sentAt = new Date(callOf(12).sent_at).getTime();
    await post(TOKEN, result({ call_outcome: 'voicemail' }));
    assert.equal(new Date(followUps()[0].due_at).getTime(), sentAt + 1440 * 60000);
    reset();
    state.conns[0].hours_on = false;
    state.conns[0].follow_up = policy();
    const sent2 = new Date(callOf(12).sent_at).getTime();
    await post(TOKEN, result({ call_outcome: 'busy' }));
    assert.equal(new Date(followUps()[0].due_at).getTime(), sent2 + 120 * 60000);
  });
  test('answered: nothing booked; without call_outcome nothing is guessed', async () => {
    state.conns[0].follow_up = policy();
    await post(TOKEN, result({ call_outcome: 'answered' }));
    assert.equal(callOf(12).call_outcome, 'answered');
    assert.equal(followUps().length, 0);
    reset();
    state.conns[0].follow_up = policy();
    await post(TOKEN, result({ call_outcome: undefined }));
    assert.equal(callOf(12).call_outcome, undefined);
    assert.equal(followUps().length, 0);
  });
  test('while the card is off (the default): no retry', async () => {
    await post(TOKEN, result());
    assert.equal(notes().length, 1, 'the note is written as before');
    assert.equal(followUps().length, 0);
  });
  test('the chain stops at max_attempts, and a call whose retry is booked books no second one', async () => {
    state.conns[0].follow_up = policy({ max_attempts: 1 });
    callOf(12).follow_up_no = 1;
    await post(TOKEN, result());
    assert.equal(followUps().length, 0);
    reset();
    state.conns[0].follow_up = policy();
    callOf(12).follow_up_at = ago(5);
    await post(TOKEN, result());
    assert.equal(followUps().length, 0);
  });
  test('an answered result arriving after the sweep booked a retry cancels that retry, not a call that already rang', async () => {
    state.conns[0].follow_up = policy();
    callOf(12).follow_up_at = ago(10);
    state.fonioCalls.push({ id: 90, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'follow_up', status: 'scheduled', reason: null,
      follow_up_of: 12, follow_up_no: 1, to_number: '+491711234567', sent_at: null, result_at: null, note_activity_id: null, due_at: ago(-60) });
    const r = await post(TOKEN, result({ call_outcome: 'answered' }));
    assert.equal(r.status, 200);
    assert.deepEqual([callOf(90).status, callOf(90).reason], ['cancelled', 'late_result']);
    assert.equal(followUps().length, 1, 'no second retry');
  });
});

// ── Part 35: the person had no time and named one ───────────────────────────
describe('a callback at the time the person asked for (Part 35)', () => {
  const calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  const policy = (over = {}) => ({ enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, ...over });
  const rows = trigger => state.fonioCalls.filter(c => c.trigger === trigger);
  // tomorrow on the workspace's clock: always ahead, always by day, whenever the tests run
  const TOMORROW = calcom.wallClock(new Date(NOW + 24 * 3600000).toISOString(), 'Europe/Berlin').date;
  const german = d => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  const at = time => calcom.utcFromWallClock(TOMORROW, time, 'Europe/Berlin');
  const result = (over = {}) => ({ ...RESULT, conversation_id: 'conv-cb1', call_outcome: 'busy', callback_date: TOMORROW, callback_time: '15:00', ...over });

  test('"call me tomorrow at three": one call waits for that time, the note says so, and the answer names it — with trying again switched off', async () => {
    const r = await post(TOKEN, result());
    assert.equal(r.status, 200);
    const [c] = rows('callback');
    assert.ok(c, 'a callback is planned');
    assert.deepEqual([c.status, c.follow_up_of, c.follow_up_no, c.contact_id, c.deal_id, c.to_number], ['scheduled', 12, 0, 5, 13, '+491711234567']);
    assert.equal(new Date(c.due_at).toISOString(), at('15:00'));
    assert.deepEqual(r.body.callback, { status: 'planned', call_id: c.id, due_at: c.due_at });
    assert.ok(notes()[0].content.endsWith(`\n\nRückruf gewünscht („${TOMORROW} 15:00“): geplant für ${german(TOMORROW)}, 15:00`), notes()[0].content.slice(-90));
    assert.ok(callOf(12).follow_up_at, 'the call has its one follow-up');
    assert.equal(rows('follow_up').length, 0);
  });
  test('the person\'s time, not the calling hours: 19:30 stays 19:30 although the hours end at 18:00', async () => {
    await post(TOKEN, result({ callback_time: '19:30' }));
    assert.equal(new Date(rows('callback')[0].due_at).toISOString(), at('19:30'));
  });
  test('with trying again on, a busy call that named a time gets the callback, not the busy delay as well', async () => {
    state.conns[0].follow_up = policy();
    await post(TOKEN, result());
    assert.equal(rows('callback').length, 1);
    assert.equal(rows('follow_up').length, 0);
    assert.equal(callOf(12).call_outcome, 'busy');
  });
  test('an answered call that named a time is called back too', async () => {
    await post(TOKEN, result({ call_outcome: 'answered', callback_date: 'morgen', callback_time: 'nachmittags' }));
    const [c] = rows('callback');
    assert.equal(new Date(c.due_at).toISOString(), at('15:00'), 'tomorrow afternoon is tomorrow at three');
    assert.ok(notes()[0].content.endsWith(`Rückruf gewünscht („morgen nachmittags“): geplant für ${german(TOMORROW)}, 15:00`));
  });
  test('the switch off: nothing is planned for that time, the note says why, and the busy delay decides as before', async () => {
    state.conns[0].hours_on = false;
    state.conns[0].follow_up = policy({ callback: false });
    const r = await post(TOKEN, result());
    assert.equal(rows('callback').length, 0);
    assert.deepEqual(r.body.callback, { status: 'off', call_id: null, due_at: null });
    assert.ok(notes()[0].content.endsWith(`Rückruf gewünscht („${TOMORROW} 15:00“), aber nicht geplant: Rückrufe zur Wunschzeit sind ausgeschaltet`), notes()[0].content.slice(-110));
    assert.equal(rows('follow_up').length, 1, 'the retry after a busy call');
  });
  test('a time this cannot read, one in the past, one at night: not planned, said in the note; the busy delay decides', async () => {
    for (const [fields, status, why] of [
      [{ callback_date: '', callback_time: 'später' }, 'unreadable', 'die Zeit war nicht lesbar'],
      [{ callback_date: '2020-01-01', callback_time: '15:00' }, 'past', 'die Zeit liegt in der Vergangenheit'],
      [{ callback_date: TOMORROW, callback_time: '23:15' }, 'night', 'zwischen 22 und 7 Uhr wird nicht angerufen'],
      [{ callback_date: '2099-01-01', callback_time: '15:00' }, 'too_far', 'die Zeit liegt mehr als 14 Tage entfernt'],
    ]) {
      reset();
      state.conns[0].hours_on = false;
      state.conns[0].follow_up = policy();
      const r = await post(TOKEN, result(fields));
      assert.equal(r.body.callback.status, status);
      assert.equal(rows('callback').length, 0, status);
      assert.ok(notes()[0].content.endsWith(`aber nicht geplant: ${why}`), notes()[0].content.slice(-90));
      assert.equal(rows('follow_up').length, 1, status + ': the busy delay still books its retry');
    }
  });
  test('no time named (empty, "no", fonio\'s unfilled placeholders): nothing about a callback anywhere', async () => {
    for (const fields of [{ callback_date: '', callback_time: '' }, { callback_date: 'no', callback_time: 'no' }, { callback_date: '{{callback_date}}', callback_time: '{{callback_time}}' }, { callback_date: undefined, callback_time: undefined }]) {
      reset();
      const r = await post(TOKEN, result(fields));
      assert.equal(r.body.callback, undefined);
      assert.equal(rows('callback').length, 0);
      assert.doesNotMatch(notes()[0].content, /Rückruf/);
    }
  });
  test('the same result delivered twice plans one callback', async () => {
    await post(TOKEN, result());
    const again = await post(TOKEN, result());
    assert.equal(again.body.already, true);
    assert.equal(rows('callback').length, 1);
    assert.equal(notes().length, 1);
    assert.equal(notes()[0].content.split('Rückruf gewünscht').length, 2, 'one line in the note');
  });
  test('the contact already has a call waiting: no second one, and the note says so', async () => {
    state.fonioCalls.push({ id: 80, workspace_id: WS, contact_id: 5, deal_id: 12, trigger: 'deal_manual', status: 'scheduled', to_number: '+491711234567', sent_at: null, result_at: null, note_activity_id: null, due_at: ago(-30) });
    const r = await post(TOKEN, result());
    assert.equal(r.body.callback.status, 'waiting');
    assert.equal(rows('callback').length, 0);
    assert.ok(notes()[0].content.endsWith('aber nicht geplant: für den Kontakt ist schon ein Anruf geplant'));
  });
  test('the result came late and the sweep had booked a retry: that waiting call becomes the callback', async () => {
    state.conns[0].follow_up = policy();
    callOf(12).follow_up_at = ago(10);
    state.fonioCalls.push({ id: 81, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'follow_up', status: 'scheduled', reason: null,
      follow_up_of: 12, follow_up_no: 1, to_number: '+491711234567', sent_at: null, result_at: null, note_activity_id: null, due_at: ago(-60) });
    const r = await post(TOKEN, result());
    assert.equal(r.body.callback.status, 'planned'); assert.equal(r.body.callback.call_id, 81);
    assert.deepEqual([callOf(81).trigger, callOf(81).status, callOf(81).follow_up_no], ['callback', 'scheduled', 0]);
    assert.equal(new Date(callOf(81).due_at).toISOString(), at('15:00'));
    assert.equal(state.fonioCalls.filter(c => c.follow_up_of === 12).length, 1, 'no second call');
  });
  test('at most three callbacks in one chain of calls: the fourth wish is noted, not planned', async () => {
    // 12 is itself the third callback: 12 ← 72 ← 71 ← 70 (the first call)
    state.fonioCalls.push({ id: 70, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'deal_manual', status: 'sent', follow_up_of: null },
      { id: 71, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'callback', status: 'sent', follow_up_of: 70 },
      { id: 72, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'callback', status: 'sent', follow_up_of: 71 });
    Object.assign(callOf(12), { trigger: 'callback', follow_up_of: 72 });
    const r = await post(TOKEN, result());
    assert.equal(r.body.callback.status, 'limit');
    assert.equal(rows('callback').filter(c => c.status === 'scheduled').length, 0);
    assert.ok(notes()[0].content.endsWith('aber nicht geplant: der Kontakt wurde schon 3-mal zurückgerufen'));
    // one fewer in the chain: planned
    reset();
    state.fonioCalls.push({ id: 70, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'deal_manual', status: 'sent', follow_up_of: null },
      { id: 71, workspace_id: WS, contact_id: 5, deal_id: 13, trigger: 'callback', status: 'sent', follow_up_of: 70 });
    Object.assign(callOf(12), { trigger: 'callback', follow_up_of: 71 });
    assert.equal((await post(TOKEN, result())).body.callback.status, 'planned');
  });
  test('a call that agreed a meeting plans no callback', async () => {
    const fonioMeeting = require(path.join(ROOT, 'utils', 'fonio-meeting.js'));
    const real = fonioMeeting.bookMeeting;
    fonioMeeting.bookMeeting = async (_pool, args) => ({ status: 'not_connected', date: args.meeting.date, time: args.meeting.time, said: args.meeting.said });
    try {
      const r = await post(TOKEN, result({ meeting_booked: 'yes', meeting_date: TOMORROW, meeting_time: '14:00' }));
      assert.equal(r.status, 200);
      assert.equal(r.body.callback, undefined);
      assert.equal(rows('callback').length, 0);
      assert.doesNotMatch(notes()[0].content, /Rückruf/);
    } finally { fonioMeeting.bookMeeting = real; }
  });
  test('an incoming call that names a time plans nothing (only calls the CRM started are called back)', async () => {
    const r = await post(TOKEN, { ...result(), crm_call_id: undefined, direction: 'inbound', person_number: '+491511000001' });
    assert.equal(r.status, 200);
    assert.equal(r.body.callback, undefined);
    assert.equal(rows('callback').length, 0);
  });
});

describe('the wiring', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  test('server.js: raw bytes up to 1 MB on the link, before json(); the webhook limits before the route', () => {
    const s = read('server.js');
    const iRaw = s.indexOf("app.use('/api/integrations/fonio/receive', express.raw({ type: '*/*', limit: '1mb' }));");
    const iJson = s.indexOf('app.use(express.json());');
    const iLimit = s.indexOf("app.use('/api/integrations/fonio/receive', webhookIpLimiter, fonioLinkLimiter);");
    const iRoute = s.indexOf("app.use('/api/integrations/fonio', require('./routes/fonio'));");
    assert.ok(iRaw > 0 && iRaw < iJson, 'raw before json');
    assert.ok(iLimit > 0 && iLimit < iRoute, 'limits before the route');
    assert.match(s, /const fonioLinkLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000, max: 60,[\s\S]*?keyGenerator: \(req\) => req\.path \|\| 'unknown',\s*\}\);/);
  });
  test('db.js: the link for every row, the last delivery, the result columns, one note per conversation, fonio as a source', () => {
    const db = read('db.js');
    assert.match(db, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS receive_token TEXT NOT NULL UNIQUE DEFAULT replace\(gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text, '-', ''\)/);
    assert.match(db, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS last_delivery JSONB/);
    for (const col of ['result_at\\s+TIMESTAMPTZ', 'conversation_id\\s+TEXT', 'conversation_link TEXT', 'note_activity_id\\s+INTEGER REFERENCES activities\\(id\\) ON DELETE SET NULL']) {
      assert.match(db, new RegExp(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS ${col}`), col);
    }
    assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS fonio_calls_one_conversation ON fonio_calls \(workspace_id, conversation_id\) WHERE conversation_id IS NOT NULL/);
    assert.ok(db.indexOf('ADD COLUMN IF NOT EXISTS receive_token') > db.indexOf('CREATE TABLE IF NOT EXISTS workspace_fonio'));
    assert.ok(db.indexOf('ADD COLUMN IF NOT EXISTS result_at') > db.indexOf('CREATE TABLE IF NOT EXISTS fonio_calls'));
    assert.match(db, /ADD CONSTRAINT activities_source_check CHECK\(source IN \('user','engine','calcom','notetaker','fonio','calendly','journey'\)\)/);   // 'journey': a workflow's step (CUSTOMER_JOURNEY Part 4)
  });
});

// ── Part 39: the deal after the call ─────────────────────────────────────────
// Call 12 is deal 13 ("Erika Muster", pipeline 1, stage 71 "Neu"). The table for pipeline 1 says where the deal goes
// by what came out of the call. utils/fonio-stage.js is tested on its own in fonio-stage.test.js; here the whole way
// through the receiver: fonio's Body in, the deal moved, the note's last line, who is told, and the answer.
describe('the deal after the call (Part 39)', () => {
  const RULES = { 1: { interested: { stage_id: 72, urgency: 3 }, meeting_booked: { stage_id: 73, urgency: null }, not_reached: { stage_id: 74, urgency: 1 }, wrong_person: { stage_id: null, urgency: 0 } } };
  const deal = () => state.dealRows.find(d => d.id === 13);
  const setUp = (rules = RULES) => { state.conns[0].stage_rules = rules; callOf(12).stage_at_send = 71; told.length = 0; };
  const result = (over = {}) => ({ ...RESULT, conversation_id: 'conv-s1', ...over });
  const lastLine = () => notes()[0].content.split('\n\n').at(-1);

  test('lead_status interested: the deal moves to the stage and urgency of its line, the note says so, everyone is told', async () => {
    setUp();
    const r = await post(TOKEN, result({ lead_status: 'interested', call_outcome: 'answered' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.deal, { event: 'interested', status: 'applied', stage_id: 72, urgency: 3 });
    assert.deepEqual([deal().stage_id, deal().urgency], [72, 3]);
    assert.equal(lastLine(), 'Deal nach „Qualifiziert“ verschoben, Dringlichkeit: Hoch (Ergebnis: interessiert).');
    assert.deepEqual(told.map(n => [n.userId, n.type, n.title, n.body, n.entityType, n.entityId, n.actor]),
      [1, 3].map(uid => [uid, 'deal_stage_changed', 'Deal stage changed: Erika Muster', 'fonio: Qualifiziert', 'deal', 13, null]));
    assert.equal(callOf(12).stage_event, 'interested');
  });

  test('written the German way, or loosely: still understood', async () => {
    setUp();
    const r = await post(TOKEN, result({ lead_status: ' Interessiert. ' }));
    assert.equal(r.body.deal.status, 'applied');
    assert.equal(deal().stage_id, 72);
  });

  test('no table: nothing moves, nothing is added to the note, and the answer names no deal', async () => {
    setUp({});
    const r = await post(TOKEN, result({ lead_status: 'interested' }));
    assert.equal(r.status, 200);
    assert.equal('deal' in r.body, false);
    assert.equal(deal().stage_id, 71);
    assert.doesNotMatch(notes()[0].content, /Deal /);
    assert.equal(told.length, 0);
  });

  test('a word that is not one of the five, or no lead_status on an answered call: the deal stays', async () => {
    setUp();
    const r = await post(TOKEN, result({ lead_status: 'vielleicht', call_outcome: 'answered' }));
    assert.equal('deal' in r.body, false);
    assert.equal(deal().stage_id, 71);
  });

  test('no line for that event in the deal\'s pipeline: the deal stays', async () => {
    setUp();
    const r = await post(TOKEN, result({ lead_status: 'not_interested' }));
    assert.equal('deal' in r.body, false);
    assert.equal(deal().stage_id, 71);
  });

  test('somebody moved the deal since the call went out: left alone, and the note says why', async () => {
    setUp(); deal().stage_id = 73;
    const r = await post(TOKEN, result({ lead_status: 'interested' }));
    assert.deepEqual(r.body.deal, { event: 'interested', status: 'moved_by_hand', stage_id: null, urgency: null });
    assert.deepEqual([deal().stage_id, deal().urgency], [73, 0]);
    assert.equal(lastLine(), 'Deal nicht verschoben: Er wurde seit dem Anruf bereits verschoben (Ergebnis: interessiert).');
    assert.equal(told.length, 0);
  });

  test('only the urgency: set without a move, and nobody is told (as for a change by hand)', async () => {
    setUp(); deal().urgency = 3;
    const r = await post(TOKEN, result({ lead_status: 'wrong_person' }));
    assert.deepEqual(r.body.deal, { event: 'wrong_person', status: 'applied', stage_id: null, urgency: 0 });
    assert.deepEqual([deal().stage_id, deal().urgency], [71, 0]);
    assert.equal(lastLine(), 'Dringlichkeit des Deals: Keine Dringlichkeit (Ergebnis: falsche Person).');
    assert.equal(told.length, 0);
  });

  test('not answered and no further try planned: "not reached"', async () => {
    setUp();
    const r = await post(TOKEN, result({ call_outcome: 'no_answer' }));
    assert.deepEqual(r.body.deal, { event: 'not_reached', status: 'applied', stage_id: 74, urgency: 1 });
    assert.equal(deal().stage_id, 74);
    assert.equal(lastLine(), 'Deal nach „Nicht erreicht“ verschoben, Dringlichkeit: Niedrig (Ergebnis: nicht erreicht).');
  });

  test('not answered, but a retry is booked: this was not the last try, the deal stays where it is', async () => {
    setUp(); state.conns[0].hours_on = false;
    state.conns[0].follow_up = { enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1 };
    const r = await post(TOKEN, result({ call_outcome: 'no_answer' }));
    assert.equal(state.fonioCalls.filter(c => c.trigger === 'follow_up').length, 1, 'the retry waits');
    assert.equal('deal' in r.body, false);
    assert.equal(deal().stage_id, 71);
    assert.equal(callOf(12).stage_rule_at, undefined, 'not looked at: the retry\'s own result will be');
  });

  test('the retry also goes unanswered and the tries are used up ("called twice and no answer"): now it is "not reached"', async () => {
    setUp(); state.conns[0].hours_on = false;
    state.conns[0].follow_up = { enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1 };
    Object.assign(callOf(12), { follow_up_no: 1, trigger: 'follow_up' });   // call 12 is itself the one retry
    const r = await post(TOKEN, result({ call_outcome: 'no_answer' }));
    assert.equal(state.fonioCalls.filter(c => c.follow_up_of === 12).length, 0, 'no third call');
    assert.deepEqual(r.body.deal, { event: 'not_reached', status: 'applied', stage_id: 74, urgency: 1 });
  });

  test('a meeting agreed in the call moves the deal without lead_status, from the variables there already are', async () => {
    setUp();
    const integrations = require('../../routes/integrations');
    const fonioMeeting = require('../../utils/fonio-meeting');
    const kept = { book: fonioMeeting.bookMeeting, tell: integrations.booking.tellAssignee };
    fonioMeeting.bookMeeting = async (p, a) => ({ status: 'booked', service: 'calcom', inserted: false, activity_id: 778, title: 'x', start: '2026-11-20T13:00:00.000Z', url: null, location: null, date: a.meeting.date, time: a.meeting.time, said: a.meeting.said });
    integrations.booking.tellAssignee = async () => 9;
    try {
      const r = await post(TOKEN, result({ meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00' }));
      assert.deepEqual(r.body.deal, { event: 'meeting_booked', status: 'applied', stage_id: 73, urgency: null });
      assert.equal(deal().stage_id, 73);
      assert.equal(lastLine(), 'Deal nach „Termin geplant“ verschoben (Ergebnis: Termin vereinbart).', 'after the meeting\'s own line');
    } finally { fonioMeeting.bookMeeting = kept.book; integrations.booking.tellAssignee = kept.tell; }
  });

  test('what the assistant wrote wins over what the other variables suggest', async () => {
    setUp({ 1: { ...RULES[1], not_interested: { stage_id: 74, urgency: null } } });
    const r = await post(TOKEN, result({ lead_status: 'not interested', call_outcome: 'no_answer' }));
    assert.equal(r.body.deal.event, 'not_interested');
  });

  test('the same result delivered again moves nothing a second time', async () => {
    setUp();
    await post(TOKEN, result({ lead_status: 'interested' }));
    deal().stage_id = 71; callOf(12).stage_at_send = 71; told.length = 0;   // as if somebody had put it back
    const again = await post(TOKEN, result({ lead_status: 'interested' }));
    assert.equal(again.body.already, true);
    assert.equal('deal' in again.body, false);
    assert.equal(deal().stage_id, 71);
    assert.equal(told.length, 0);
  });

  test('a call that came in (not one the CRM started) moves no deal', async () => {
    setUp();
    const r = await post(TOKEN, { ...RESULT, crm_call_id: '', conversation_id: 'conv-in', direction: 'inbound', person_number: '+491511000001', lead_status: 'interested' });
    assert.equal(r.status, 200);
    assert.equal('deal' in r.body, false);
    assert.equal(deal().stage_id, 71);
  });

  test('a failure in this step never fails fonio\'s delivery: the note is written, the answer is a success', async () => {
    setUp(); state.dealRows = null;   // the deal lookup blows up
    const r = await post(TOKEN, result({ lead_status: 'interested' }));
    assert.equal(r.status, 200); assert.equal(r.body.success, true);
    assert.equal(notes().length, 1);
    assert.equal('deal' in r.body, false);
  });

  test('the wiring: the receiver reads the workspace\'s clock, hands in who is told, and does this step last', () => {
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'fonio.js'), 'utf8');
    assert.match(src, /const deal = out\.outcome === 'noted' \? await dealAfterCall\(req, conn, r, out\) : null;/);
    assert.ok(src.indexOf("await dealAfterCall(req, conn, r, out)") > src.indexOf("await meetingFromCall(conn.workspace_id, r, out.activity_id, bookMeetings) : null;\n    const deal"), 'after the meeting');
    assert.match(src, /fonioStage\.eventOf\(\{ leadStatus: r\.leadStatus, meeting: !!r\.meeting, callback: out\.callback\?\.status === 'planned', outcome: r\.outcome, retry: !!out\.retry \}\)/);
    assert.match(src, /fonioStage\.tellMoved\(pool, conn\.workspace_id, done, \{ notifyUser, engine, timezone: conn\.hours_tz, baseUrl: baseUrl\(req\) \}\)/);
  });
});
