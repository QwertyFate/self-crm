// ROUTE tests for fonio's call log (routes/fonio.js GET /log and POST /log/:id/contact, FONIO_CHANGES Part 16,
// 2026-11-11) over a stateful fake pool. Pinned: the log is the calls the CRM sent plus the conversations it did not
// start, newest first, this workspace's only, without any transcript; a kept conversation without a contact is
// connected to a contact of this workspace exactly once, its note written from what the row kept (and on the
// contact's deal when it has exactly one), the kept transcript cleared; bad ids, unknown rows, other workspaces'
// contacts and a second connect are refused and write nothing.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const express = require('express');
const { loadRoute } = require('../helpers/load-route');

const WS = 7, OTHER_WS = 8;
const state = {};
function reset() {
  Object.assign(state, {
    nextActivity: 500, activities: [],
    contacts: [{ id: 40, workspace_id: WS, name: 'Erika Muster' }, { id: 41, workspace_id: WS, name: 'Zwei Deals' }, { id: 50, workspace_id: OTHER_WS, name: 'Fremd' }],
    deals: [{ id: 60, workspace_id: WS, contact_id: 40, title: 'Wohnung 3' }, { id: 61, workspace_id: WS, contact_id: 41, title: 'A' }, { id: 62, workspace_id: WS, contact_id: 41, title: 'B' }],
    fonioCalls: [
      { id: 12, workspace_id: WS, status: 'sent', sent_at: '2026-11-10T10:00:00.000Z', to_number: '+491711234567', contact_id: 40, deal_id: 60, conversation_link: 'https://app.fonio.ai/c/12', result_at: '2026-11-10T10:02:00.000Z', note_activity_id: 77 },
      { id: 13, workspace_id: WS, status: 'sent', sent_at: '2026-11-11T08:00:00.000Z', to_number: '+491722222222', contact_id: null, deal_id: null, conversation_link: null, result_at: null, note_activity_id: null },
      { id: 14, workspace_id: WS, status: 'scheduled', sent_at: null, due_at: '2026-11-12T05:30:00.000Z', to_number: '+491733333333', contact_id: 40, deal_id: 60 },
      { id: 15, workspace_id: WS, status: 'scheduled', sent_at: null, due_at: '2026-11-12T05:00:00.000Z', to_number: '+491734444444', contact_id: 40, deal_id: 60 },
      { id: 16, workspace_id: WS, status: 'cancelled', sent_at: null, due_at: '2026-11-12T04:00:00.000Z', to_number: '+491735555555', contact_id: 40, deal_id: 60 },
      { id: 21, workspace_id: OTHER_WS, status: 'sent', sent_at: '2026-11-11T09:00:00.000Z', to_number: '+491744444444', contact_id: 50, deal_id: null },
    ],
    others: [
      { id: 900, workspace_id: WS, created_at: '2026-11-11T07:00:00.000Z', direction: 'inbound', number: '+491519999999', caller_name: 'Max Neu', contact_id: null, deal_id: null,
        conversation_link: 'https://app.fonio.ai/c/in-1', duration: '1:05', summary: 'Fragt nach dem Exposé.', transcript: 'Caller: Hallo', note_activity_id: null },
      { id: 901, workspace_id: WS, created_at: '2026-11-11T09:30:00.000Z', direction: 'inbound', number: '+491511000001', caller_name: null, contact_id: 40, deal_id: 60,
        conversation_link: null, duration: null, summary: null, transcript: null, note_activity_id: 78 },
      { id: 950, workspace_id: OTHER_WS, created_at: '2026-11-11T09:40:00.000Z', direction: 'inbound', number: '+491519999998', caller_name: 'Fremd', contact_id: null, deal_id: null, transcript: 'geheim' },
    ],
  });
}
const nameOf = id => state.contacts.find(c => c.id === id)?.name ?? null;
const titleOf = id => state.deals.find(d => d.id === id)?.title ?? null;
const other = id => state.others.find(o => o.id === id);

const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT f.id, f.sent_at AS at, f.to_number AS number,') && q.includes("WHERE f.workspace_id = $1 AND f.status = 'sent' ORDER BY f.sent_at DESC, f.id DESC LIMIT $2")) {
      return { rows: state.fonioCalls.filter(c => c.workspace_id === params[0] && c.status === 'sent').sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, params[1])
        .map(c => ({ id: c.id, at: c.sent_at, number: c.to_number, contact_id: c.contact_id, contact_name: nameOf(c.contact_id), deal_id: c.deal_id, deal_title: titleOf(c.deal_id), link: c.conversation_link, result_at: c.result_at, note_activity_id: c.note_activity_id })) };
    }
    // Part 24: the calls still to come, the soonest first
    if (q.startsWith('SELECT f.id, f.due_at AS at, f.to_number AS number,') && q.includes("WHERE f.workspace_id = $1 AND f.status IN ('scheduled','sending') ORDER BY f.due_at, f.id LIMIT $2")) {
      return { rows: state.fonioCalls.filter(c => c.workspace_id === params[0] && (c.status === 'scheduled' || c.status === 'sending')).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)).slice(0, params[1])
        .map(c => ({ id: c.id, at: c.due_at, number: c.to_number, contact_id: c.contact_id, contact_name: nameOf(c.contact_id), deal_id: c.deal_id, deal_title: titleOf(c.deal_id) })) };
    }
    if (q.startsWith('SELECT o.id, o.created_at AS at, o.direction, o.number, o.caller_name,') && q.includes('WHERE o.workspace_id = $1 ORDER BY o.created_at DESC, o.id DESC LIMIT $2')) {
      assert.doesNotMatch(q, /transcript/);
      return { rows: state.others.filter(o => o.workspace_id === params[0]).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, params[1])
        .map(o => ({ id: o.id, at: o.created_at, direction: o.direction, number: o.number, caller_name: o.caller_name, contact_id: o.contact_id, contact_name: nameOf(o.contact_id), deal_id: o.deal_id,
          deal_title: titleOf(o.deal_id), link: o.conversation_link, duration: o.duration, summary: o.summary, note_activity_id: o.note_activity_id })) };
    }
    if (q === 'SELECT id, direction, contact_id, conversation_link, duration, summary, transcript FROM fonio_other_calls WHERE id = $1 AND workspace_id = $2') {
      const o = state.others.find(x => x.id === params[0] && x.workspace_id === params[1]);
      return { rows: o ? [{ id: o.id, direction: o.direction, contact_id: o.contact_id, conversation_link: o.conversation_link, duration: o.duration, summary: o.summary, transcript: o.transcript }] : [] };
    }
    if (q === 'SELECT id FROM contacts WHERE id = $1 AND workspace_id = $2') {
      return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ id: c.id })) };
    }
    if (q === 'SELECT id FROM deals WHERE workspace_id = $1 AND contact_id = $2 ORDER BY id LIMIT 2') {
      return { rows: state.deals.filter(d => d.workspace_id === params[0] && d.contact_id === params[1]).slice(0, 2).map(d => ({ id: d.id })) };
    }
    if (q === "WITH claim AS ( UPDATE fonio_other_calls SET contact_id = $3::int, deal_id = $4::int, transcript = NULL WHERE id = $1 AND workspace_id = $2 AND contact_id IS NULL RETURNING workspace_id, contact_id, deal_id ) INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) SELECT workspace_id, contact_id, deal_id, 'note', $5::text, NULL, 'fonio' FROM claim RETURNING id") {
      const o = state.others.find(x => x.id === params[0] && x.workspace_id === params[1] && x.contact_id == null);
      if (!o) return { rows: [] };
      Object.assign(o, { contact_id: params[2], deal_id: params[3], transcript: null });
      const a = { id: state.nextActivity++, workspace_id: o.workspace_id, contact_id: params[2], deal_id: params[3], type: 'note', content: params[4], created_by: null, source: 'fonio' };
      state.activities.push(a);
      return { rows: [{ id: a.id }] };
    }
    if (q.startsWith('SELECT id, deal_id, contact_id, trigger, status, reason, raw_number, to_number, message, attempts,') && q.endsWith('request, response, result_body FROM fonio_calls WHERE id = $1 AND workspace_id = $2')) {
      const c = state.fonioCalls.find(x => x.id === params[0] && x.workspace_id === params[1]);
      return { rows: c ? [{ id: c.id, status: c.status, to_number: c.to_number, request: c.request ?? null, response: c.response ?? null, result_body: c.result_body ?? null }] : [] };
    }
    if (q.startsWith('SELECT id, direction, number, caller_name,') && q.endsWith('note_activity_id, created_at, result_body FROM fonio_other_calls WHERE id = $1 AND workspace_id = $2')) {
      assert.doesNotMatch(q, /transcript/);
      const o = state.others.find(x => x.id === params[0] && x.workspace_id === params[1]);
      return { rows: o ? [{ id: o.id, direction: o.direction, number: o.number, result_body: o.result_body ?? null }] : [] };
    }
    if (q === 'UPDATE fonio_other_calls SET note_activity_id = $1 WHERE id = $2') { other(params[1]).note_activity_id = params[0]; return { rows: [] }; }
    throw new Error('unexpected query: ' + q);
  },
};

let base, server, ownerBase, ownerServer;
const serve = async role => {
  const a = express();
  a.use(express.json());
  a.use('/api/integrations/fonio', loadRoute('fonio.js', { pool, user: { id: 3, workspaceId: WS, role } }));
  a.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  const s = await new Promise(resolve => { const x = a.listen(0, '127.0.0.1', () => resolve(x)); });
  return [s, `http://127.0.0.1:${s.address().port}/api/integrations/fonio`];
};
before(async () => { [server, base] = await serve('member'); [ownerServer, ownerBase] = await serve('owner'); });
after(async () => { for (const s of [server, ownerServer]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)); } });
beforeEach(reset);

const connect = async (id, body) => {
  const r = await fetch(`${base}/log/${id}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

describe('GET /log', () => {
  test('a member reads it: the calls still to come first, the soonest on top (Part 24), then sent calls and kept conversations of this workspace, newest first', async () => {
    const r = await fetch(`${base}/log`);
    assert.equal(r.status, 200);
    const { entries } = await r.json();
    assert.deepEqual(entries.map(e => e.key), ['call:15', 'call:14', 'other:901', 'call:13', 'other:900', 'call:12']);
  });
  test('a call still to come: planned, its time, its contact and deal; a cancelled one is not listed; a call made is not "planned"', async () => {
    const { entries } = await (await fetch(`${base}/log`)).json();
    assert.deepEqual(entries.find(e => e.key === 'call:15'), { key: 'call:15', id: 15, by_crm: true, direction: 'outbound', at: '2026-11-12T05:00:00.000Z', number: '+491734444444',
      caller_name: null, contact_id: 40, contact_name: 'Erika Muster', deal_id: 60, deal_title: 'Wohnung 3', duration: null, summary: null, link: null, result: false, noted: false,
      planned: true });
    assert.equal(entries.find(e => e.key === 'call:14').planned, true);
    assert.ok(!entries.some(e => e.key === 'call:16')); assert.equal(entries.find(e => e.key === 'call:12').planned, undefined);
  });
  test('a call the CRM sent: outgoing, its contact and deal, whether the result and the note are there', async () => {
    const { entries } = await (await fetch(`${base}/log`)).json();
    assert.deepEqual(entries.find(e => e.key === 'call:12'), { key: 'call:12', id: 12, by_crm: true, direction: 'outbound', at: '2026-11-10T10:00:00.000Z', number: '+491711234567',
      caller_name: null, contact_id: 40, contact_name: 'Erika Muster', deal_id: 60, deal_title: 'Wohnung 3', duration: null, summary: null, link: 'https://app.fonio.ai/c/12', result: true, noted: true });
    const waiting = entries.find(e => e.key === 'call:13');
    assert.deepEqual({ result: waiting.result, noted: waiting.noted, contact: waiting.contact_id }, { result: false, noted: false, contact: null });
  });
  test('a kept conversation without a contact: the number, the name, the summary — never the transcript', async () => {
    const text = await (await fetch(`${base}/log`)).text();
    assert.deepEqual(JSON.parse(text).entries.find(e => e.key === 'other:900'), { key: 'other:900', id: 900, by_crm: false, direction: 'inbound', at: '2026-11-11T07:00:00.000Z', number: '+491519999999',
      caller_name: 'Max Neu', contact_id: null, contact_name: null, deal_id: null, deal_title: null, duration: '1:05', summary: 'Fragt nach dem Exposé.', link: 'https://app.fonio.ai/c/in-1', result: true, noted: false });
    assert.doesNotMatch(text, /Caller: Hallo|geheim|Fremd|transcript/);
  });
});

// Part 18: one call's technical record, for owners and admins.
describe('GET /log/:kind/:id', () => {
  const get = async (path, at = ownerBase) => { const r = await fetch(`${at}/log/${path}`); return { status: r.status, body: await r.json() }; };
  test('the list says whether the reader may open it', async () => {
    assert.equal((await (await fetch(`${base}/log`)).json()).can_manage, false);
    assert.equal((await (await fetch(`${ownerBase}/log`)).json()).can_manage, true);
  });
  test("an owner reads a CRM call's record: the row, what was sent, fonio's answer, the result Body", async () => {
    Object.assign(state.fonioCalls[0], { request: { url: 'u', body: { apiKey: '(hidden)' } }, response: { http: 200, body: { status: 'success' } }, result_body: { summary: 'S' } });
    assert.deepEqual(await get('call/12'), { status: 200, body: { kind: 'call', record: { id: 12, status: 'sent', to_number: '+491711234567' },
      request: { url: 'u', body: { apiKey: '(hidden)' } }, response: { http: 200, body: { status: 'success' } }, result_body: { summary: 'S' } } });
  });
  test('a call from before has no record: nulls, not an error', async () => {
    assert.deepEqual((await get('call/13')).body, { kind: 'call', record: { id: 13, status: 'sent', to_number: '+491722222222' }, request: null, response: null, result_body: null });
  });
  test('a kept call: its row and the result Body', async () => {
    state.others[0].result_body = { direction: 'inbound' };
    assert.deepEqual((await get('other/900')).body, { kind: 'other', record: { id: 900, direction: 'inbound', number: '+491519999999' }, request: null, response: null, result_body: { direction: 'inbound' } });
  });
  test('a member is refused; another workspace’s call is a 404; a bad kind or id a 400', async () => {
    assert.equal((await get('call/12', base)).status, 403);
    assert.equal((await get('call/21')).status, 404);
    assert.equal((await get('other/950')).status, 404);
    for (const p of ['deal/12', 'call/abc', 'call/0', 'other/1.5']) assert.equal((await get(p)).status, 400, p);
  });
});

describe('POST /log/:id/contact', () => {
  test('connected to a contact with one deal: the note from what the row kept, on contact and deal; the transcript is cleared', async () => {
    const r = await connect(900, { contact_id: 40 });
    assert.deepEqual(r, { status: 200, body: { success: true, contact_id: 40, deal_id: 60, activity_id: 500 } });
    const n = state.activities[0];
    assert.deepEqual({ ws: n.workspace_id, contact: n.contact_id, deal: n.deal_id, type: n.type, source: n.source, by: n.created_by }, { ws: WS, contact: 40, deal: 60, type: 'note', source: 'fonio', by: null });
    assert.equal(n.content, 'Eingehender fonio-Anruf · Dauer 1:05\n\nZusammenfassung\nFragt nach dem Exposé.\n\nTranskript\nCaller: Hallo\n\nGespräch in fonio: https://app.fonio.ai/c/in-1');
    assert.deepEqual({ contact: other(900).contact_id, deal: other(900).deal_id, transcript: other(900).transcript, note: other(900).note_activity_id }, { contact: 40, deal: 60, transcript: null, note: 500 });
  });
  test('a contact with several deals: the note is on the contact only', async () => {
    assert.equal((await connect(900, { contact_id: 41 })).body.deal_id, null);
    assert.equal(state.activities[0].deal_id, null);
  });
  test('a second connect is a 409 and writes no second note', async () => {
    await connect(900, { contact_id: 40 });
    const r = await connect(900, { contact_id: 41 });
    assert.deepEqual(r, { status: 409, body: { error: 'This call already has a contact', code: 'connected' } });
    assert.equal(state.activities.length, 1);
    assert.equal(other(900).contact_id, 40);
  });
  test('two connects at once: the claim lets one through', async () => {
    const orig = pool.query;
    pool.query = async (sql, params) => {   // the other click's claim lands after this one's read
      const out = await orig(sql, params);
      if (/^\s*SELECT id FROM deals/.test(String(sql))) other(900).contact_id = 41;
      return out;
    };
    try {
      assert.equal((await connect(900, { contact_id: 40 })).status, 409);
      assert.equal(state.activities.length, 0);
    } finally { pool.query = orig; }
  });
  test("another workspace's contact, an unknown contact, another workspace's call, an unknown call: 404, nothing written", async () => {
    assert.deepEqual(await connect(900, { contact_id: 50 }), { status: 404, body: { error: 'Contact not found', code: 'no_contact' } });
    assert.equal((await connect(900, { contact_id: 9999 })).status, 404);
    assert.deepEqual(await connect(950, { contact_id: 40 }), { status: 404, body: { error: 'Call not found', code: 'not_found' } });
    assert.equal((await connect(12345, { contact_id: 40 })).status, 404);
    assert.equal(state.activities.length, 0);
    assert.equal(other(900).contact_id, null);
    assert.equal(other(950).transcript, 'geheim');
  });
  test('bad ids are a 400', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) assert.equal((await connect(id, { contact_id: 40 })).status, 400, id);
    for (const c of [undefined, null, 'x', 0, 1.5, { id: 40 }]) assert.equal((await connect(900, { contact_id: c })).status, 400, String(c));
    assert.equal(state.activities.length, 0);
  });
});
