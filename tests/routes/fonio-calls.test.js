// ROUTE + UNIT tests for fonio's calls (FONIO_CHANGES Parts 3–5): utils/fonio-calls.js (scheduling a new deal's
// call, the worker sending it, cancelling), the history routes in routes/fonio.js, and the two triggers — a deal made
// by hand (routes/deals.js) and a deal made by the lead link (routes/integrations.js /receive). The tables are an
// in-memory fake that answers exactly the statements these files run (anything else throws, so a new statement is
// noticed); the SQL itself is checked against a real Postgres separately (FONIO_CHANGES, "Verified"). fonio is a fake
// too. Pinned above all: a call is sent once — claimed before it is sent, never re-sent after an unclear answer, a
// row stuck mid-send is failed, not retried; and nothing is called while switched off, outside the hours, or for a
// number outside the workspace's number starts.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve, inject } = require('../helpers/load-route');
const calcom = require('../../utils/calcom');
const fonioCalls = require('../../utils/fonio-calls');

const WS = 7, OTHER_WS = 8;
const KEY = 'fonio_live_0123456789abcdef';
const WED10 = new Date('2026-11-04T09:00:00.000Z');   // Wednesday 10:00 in Berlin
const minutes = (d, m) => new Date(d.getTime() + m * 60000);

const CONN = (over = {}) => ({
  workspace_id: WS, api_key_sealed: calcom.sealKey(KEY), key_hint: 'cdef', from_number: '+4930123456', active: true,
  delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true, country_code: '+49', number_prefixes: [],
  hours_on: true, hours_days: [1, 2, 3, 4, 5], hours_from: '09:00:00', hours_to: '18:00:00', hours_tz: 'Europe/Berlin',
  saved_by: 1, saved_at: '2026-11-06T09:00:00.000Z', ...over,
});

// The tables, in memory. Each statement of utils/fonio-calls.js and routes/fonio.js has its answer; any other throws.
const db = { conn: null, deals: new Map(), contacts: new Map(), fields: [], calls: [], nextCall: 1, log: [] };
function seed() {
  db.conn = CONN(); db.calls = []; db.nextCall = 1; db.log = [];
  db.contacts = new Map([
    [10, { id: 10, workspace_id: WS, name: 'Erika Muster', email: 'erika@muster.de', phone: '0171 1234567', company: 'Muster GmbH',
           ort: 'Berlin', owner: 'Olaf Owner', custom_data: { lead_source: 'Ads', email_alt: 'custom@x.de', notes: '' } }],
    [11, { id: 11, workspace_id: WS, name: 'No Phone', phone: null, custom_data: {} }],
    [12, { id: 12, workspace_id: WS, name: 'Bad Number', phone: '12345', custom_data: {} }],
    [13, { id: 13, workspace_id: WS, name: 'Wien', phone: '+43 1 234567', custom_data: {} }],
    [20, { id: 20, workspace_id: OTHER_WS, name: 'Elsewhere', phone: '0171 9999999', custom_data: {} }],
  ]);
  db.deals = new Map([
    [100, { id: 100, workspace_id: WS, contact_id: 10, title: 'Erika Muster', value: '5000', pipeline: 'Sales', stage: 'New', owner: 'Olaf Owner', custom_data: { budget: '10k' } }],
    [101, { id: 101, workspace_id: WS, contact_id: 11, title: 'No Phone', custom_data: {} }],
    [102, { id: 102, workspace_id: WS, contact_id: null, title: 'Nobody', custom_data: {} }],
    [103, { id: 103, workspace_id: WS, contact_id: 12, title: 'Bad', custom_data: {} }],
    [104, { id: 104, workspace_id: WS, contact_id: 13, title: 'Wien', custom_data: {} }],
    [105, { id: 105, workspace_id: WS, contact_id: 10, title: 'Erika, second deal', custom_data: {} }],
    [200, { id: 200, workspace_id: OTHER_WS, contact_id: 20, title: 'Elsewhere', custom_data: {} }],
  ]);
  // email_alt is labelled "email": a custom field never overwrites the built-in key
  db.fields = [
    { kind: 'contact', field_key: 'lead_source', name: 'Lead Source' },
    { kind: 'contact', field_key: 'email_alt', name: 'email' },
    { kind: 'deal', field_key: 'budget', name: 'Budget' },
  ];
}
const waitingStatus = s => s === 'scheduled' || s === 'sending';
const pool = {
  query: async (sql, p = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    db.log.push({ sql: t, params: p });
    const call = id => db.calls.find(c => c.id === id);
    if (t === 'SELECT * FROM workspace_fonio WHERE workspace_id = $1') return { rows: db.conn && db.conn.workspace_id === p[0] ? [db.conn] : [] };
    if (t.startsWith('SELECT d.id, d.contact_id, c.phone FROM deals d')) {
      const d = db.deals.get(p[0]); if (!d || d.workspace_id !== p[1]) return { rows: [] };
      const c = db.contacts.get(d.contact_id);
      return { rows: [{ id: d.id, contact_id: d.contact_id, phone: c && c.workspace_id === d.workspace_id ? c.phone : null }] };
    }
    if (t.startsWith('SELECT id FROM fonio_calls WHERE workspace_id = $1 AND contact_id = $2')) {
      return { rows: db.calls.filter(c => c.workspace_id === p[0] && c.contact_id === p[1] && waitingStatus(c.status)).slice(0, 1).map(c => ({ id: c.id })) };
    }
    // Part 33: a retry booked after a call that reached nobody
    if (t.startsWith("INSERT INTO fonio_calls (workspace_id, deal_id, contact_id, trigger, status, raw_number, to_number, due_at, follow_up_of, follow_up_no)")) {
      if (db.calls.some(c => c.contact_id === p[2] && waitingStatus(c.status))) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const row = { id: db.nextCall++, workspace_id: p[0], deal_id: p[1], contact_id: p[2], trigger: /VALUES \(\$1,\$2,\$3,'callback','scheduled'/.test(t) ? 'callback' : 'follow_up', status: 'scheduled', reason: null, raw_number: p[3],
        to_number: p[4], due_at: new Date(p[5]), follow_up_of: p[6], follow_up_no: p[7], message: null, sent_at: null, attempts: 0, cancelled_by: null,
        created_at: new Date(), updated_at: new Date() };
      db.calls.push(row);
      return { rows: [{ id: row.id, status: row.status, reason: row.reason, due_at: row.due_at }] };
    }
    if (t.startsWith('INSERT INTO fonio_calls')) {
      if (waitingStatus(p[4]) && db.calls.some(c => c.contact_id === p[2] && waitingStatus(c.status))) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const row = { id: db.nextCall++, workspace_id: p[0], deal_id: p[1], contact_id: p[2], trigger: p[3], status: p[4], reason: p[5], raw_number: p[6],
        to_number: p[7], due_at: p[8] ? new Date(p[8]) : new Date(), message: null, sent_at: null, attempts: 0, cancelled_by: null, created_at: new Date(), updated_at: new Date() };
      db.calls.push(row);
      return { rows: [{ id: row.id, status: row.status, reason: row.reason, due_at: row.due_at }] };
    }
    // Part 35: how many callbacks the chain a call belongs to has had, and a sweep's retry that becomes the callback
    if (t.startsWith('WITH RECURSIVE chain AS ( SELECT id, follow_up_of, trigger FROM fonio_calls WHERE id = $1 AND workspace_id = $2 UNION ALL')) {
      let n = 0;
      for (let c = db.calls.find(x => x.id === p[0] && x.workspace_id === p[1]); c; c = call(c.follow_up_of)) if (c.trigger === 'callback') n++;
      return { rows: [{ callbacks: n }] };
    }
    if (t === "UPDATE fonio_calls SET trigger = 'callback', due_at = $2, follow_up_no = $3, updated_at = NOW() WHERE follow_up_of = $1 AND status = 'scheduled' RETURNING id, status, reason, due_at") {
      const c = db.calls.find(x => x.follow_up_of === p[0] && x.status === 'scheduled');
      if (!c) return { rows: [] };
      Object.assign(c, { trigger: 'callback', due_at: new Date(p[1]), follow_up_no: p[2] });
      return { rows: [{ id: c.id, status: c.status, reason: c.reason, due_at: c.due_at }] };
    }
    if (t === 'UPDATE fonio_calls SET follow_up_at = NOW(), updated_at = NOW() WHERE id = $1 AND follow_up_at IS NULL RETURNING id') {
      const c = call(p[0]);
      if (!c || c.follow_up_at) return { rows: [] };
      c.follow_up_at = new Date();
      return { rows: [{ id: c.id }] };
    }
    if (t.startsWith("UPDATE fonio_calls SET status = 'cancelled', reason = 'late_result'")) {
      let n = 0;
      for (const c of db.calls) if (c.follow_up_of === p[0] && c.status === 'scheduled') { Object.assign(c, { status: 'cancelled', reason: 'late_result' }); n++; }
      return { rowCount: n, rows: [] };
    }
    if (t.startsWith('SELECT f.id, f.workspace_id, f.contact_id, f.deal_id, f.raw_number, f.to_number, f.sent_at, f.follow_up_no, f.follow_up_at FROM fonio_calls f JOIN workspace_fonio w')) {
      if (!db.conn || db.conn.workspace_id !== WS || !db.conn.active || db.conn.follow_up?.enabled !== true) return { rows: [] };
      const cut = new Date(p[0]).getTime();
      const oldest = new Date(p[2]).getTime();
      const rows = db.calls
        .filter(c => c.status === 'sent' && !c.result_at && !c.follow_up_at && c.sent_at
          && new Date(c.sent_at).getTime() < cut && new Date(c.sent_at).getTime() > oldest)
        .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at) || a.id - b.id).slice(0, p[1]);
      return { rows };
    }
    // the claim and the stuck-row sweep are answered only when their guard is in the statement: the fake cannot
    // honour a WHERE it does not read, so a statement without it is "unexpected" and the test fails
    if (t === "UPDATE fonio_calls SET status = 'sending', attempts = attempts + 1, updated_at = NOW() WHERE id = $1 AND status = 'scheduled' RETURNING *") {
      const c = call(p[0]); if (!c || c.status !== 'scheduled') return { rows: [] };
      c.status = 'sending'; c.attempts++; c.updated_at = new Date();
      return { rows: [{ ...c }] };
    }
    if (t === 'UPDATE fonio_calls SET request = $2::jsonb, response = $3::jsonb WHERE id = $1') {
      if (db.failKeep) throw new Error('jsonb refused');
      Object.assign(call(p[0]), { request: JSON.parse(p[1]), response: JSON.parse(p[2]) });
      return { rowCount: 1, rows: [] };
    }
    if (t.startsWith('UPDATE fonio_calls SET status = $2')) {
      const c = call(p[0]);
      Object.assign(c, { status: p[1], reason: p[2], message: p[3] ?? c.message, to_number: p[4] ?? c.to_number, due_at: p[5] ? new Date(p[5]) : c.due_at,
        sent_at: p[6] ? new Date() : c.sent_at, attempts: c.attempts - p[7], updated_at: new Date() });
      return { rowCount: 1, rows: [] };
    }
    if (t === "UPDATE fonio_calls SET status = 'failed', reason = 'interrupted', updated_at = NOW() WHERE status = 'sending' AND updated_at < $1") {
      let n = 0; for (const c of db.calls) if (c.status === 'sending' && c.updated_at < p[0]) { c.status = 'failed'; c.reason = 'interrupted'; n++; }
      return { rowCount: n, rows: [] };
    }
    if (t.startsWith("SELECT id FROM fonio_calls WHERE status = 'scheduled' AND due_at <= $1")) {
      return { rows: db.calls.filter(c => c.status === 'scheduled' && c.due_at <= new Date(p[0])).sort((a, b) => a.due_at - b.due_at || a.id - b.id).slice(0, p[1]).map(c => ({ id: c.id })) };
    }
    if (t.startsWith('SELECT d.id, d.title, d.value, d.custom_data, d.contact_id, p.name AS pipeline')) {
      const d = db.deals.get(p[0]); return { rows: d && d.workspace_id === p[1] ? [{ ...d }] : [] };
    }
    if (t.startsWith('SELECT c.*, u.name AS owner FROM contacts c')) {
      const c = db.contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [{ ...c }] : [] };
    }
    if (t.startsWith("SELECT 'contact' AS kind")) return { rows: db.fields };
    if (t.startsWith("UPDATE fonio_calls SET status = 'cancelled', reason = $2")) {
      let n = 0; for (const c of db.calls) if (c.workspace_id === p[0] && c.status === 'scheduled') { Object.assign(c, { status: 'cancelled', reason: p[1], cancelled_by: p[2] }); n++; }
      return { rowCount: n, rows: [] };
    }
    if (t.startsWith("UPDATE fonio_calls SET status = 'cancelled', reason = 'by_user'")) {
      const c = call(p[0]); if (!c || c.workspace_id !== p[1] || c.status !== 'scheduled') return { rows: [] };
      Object.assign(c, { status: 'cancelled', reason: 'by_user', cancelled_by: p[2] });
      return { rows: [{ id: c.id }] };
    }
    if (t.startsWith('SELECT f.id, f.trigger')) {
      return { rows: db.calls.filter(c => c.workspace_id === p[0]).slice().reverse().slice(0, p[1])
        .map(c => ({ ...c, contact_name: db.contacts.get(c.contact_id)?.name ?? null, deal_title: db.deals.get(c.deal_id)?.title ?? null, cancelled_by_name: null })) };
    }
    // routes/fonio.js: the settings
    if (/FROM workspace_fonio f LEFT JOIN users u/.test(t)) return { rows: db.conn && db.conn.workspace_id === p[0] ? [{ ...db.conn, saved_by_name: 'Olaf Owner' }] : [] };
    if (t.startsWith('UPDATE workspace_fonio')) { db.conn = { ...db.conn, from_number: p[3], active: p[4], delay_minutes: p[5] }; return { rowCount: 1, rows: [] }; }
    if (t.startsWith('DELETE FROM workspace_fonio')) { db.conn = null; return { rowCount: 1, rows: [] }; }
    throw new Error('unexpected SQL: ' + t);
  },
};

// fonio, faked: the test client's own requests to 127.0.0.1 pass through; everything else is recorded and answered.
const realFetch = globalThis.fetch;
const fon = { reply: { status: 200, body: { status: 'success', message: 'Call initiated' } }, calls: [] };
before(() => {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    fon.calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
    const r = typeof fon.reply === 'function' ? fon.reply() : fon.reply;
    if (r.throwCode) throw Object.assign(new TypeError('fetch failed'), { cause: { code: r.throwCode } });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
});
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { seed(); fon.reply = { status: 200, body: { status: 'success', message: 'Call initiated' } }; fon.calls.length = 0; });

const schedule = (dealId, trigger = 'deal_manual', now = WED10) => fonioCalls.scheduleForDeal(pool, { workspaceId: WS, dealId, trigger, now });
const only = () => { assert.equal(db.calls.length, 1); return db.calls[0]; };

describe('scheduling a new deal', () => {
  test('no connection, switched off, or that trigger off: nothing at all is written', async () => {
    db.conn = null;
    assert.equal(await schedule(100), null);
    db.conn = CONN({ active: false });
    assert.equal(await schedule(100), null);
    db.conn = CONN({ on_deal_manual: false });
    assert.equal(await schedule(100, 'deal_manual'), null);
    assert.equal(db.calls.length, 0);
    assert.ok(await schedule(100, 'deal_webhook'), 'the other trigger still schedules');
  });

  test('an unknown trigger (a CSV import, Cal.com) schedules nothing', async () => {
    assert.equal(await fonioCalls.scheduleForDeal(pool, { workspaceId: WS, dealId: 100, trigger: 'import', now: WED10 }), null);
    assert.equal(db.calls.length, 0);
  });

  test('scheduled at now + delay inside the hours, the number made international, the saved one kept', async () => {
    const r = await schedule(100, 'deal_webhook');
    assert.equal(r.status, 'scheduled');
    const c = only();
    assert.deepEqual([c.deal_id, c.contact_id, c.trigger], [100, 10, 'deal_webhook']);
    assert.equal(c.to_number, '+491711234567');
    assert.equal(c.raw_number, '0171 1234567');
    assert.equal(c.due_at.toISOString(), minutes(WED10, 5).toISOString());
  });

  test('a delay that ends after the hours waits for the next opening', async () => {
    await schedule(100, 'deal_manual', new Date('2026-11-04T16:58:00.000Z'));   // Wed 17:58 Berlin + 5 min
    assert.equal(only().due_at.toISOString(), '2026-11-05T08:00:00.000Z');       // Thu 09:00 Berlin
  });

  test('no contact, no number, a number that cannot be told: skipped with the reason, never scheduled', async () => {
    await schedule(102); await schedule(101); await schedule(103);
    assert.deepEqual(db.calls.map(c => [c.status, c.reason]), [['skipped', 'no_contact'], ['skipped', 'no_phone'], ['skipped', 'bad_number']]);
  });

  test('a number outside the number starts: skipped number_not_allowed, with the number it would have been', async () => {
    db.conn = CONN({ number_prefixes: ['0171'] });
    await schedule(104);
    assert.deepEqual([db.calls[0].status, db.calls[0].reason, db.calls[0].to_number], ['skipped', 'number_not_allowed', '+431234567']);
    await schedule(100);
    assert.equal(db.calls[1].status, 'scheduled', '0171 matches');
  });

  test('one waiting call per contact: a second deal for the same contact is skipped already_scheduled', async () => {
    await schedule(100); await schedule(105);
    assert.deepEqual(db.calls.map(c => [c.status, c.reason]), [['scheduled', null], ['skipped', 'already_scheduled']]);
  });

  test("a deal of another workspace is not this workspace's to schedule", async () => {
    assert.equal(await schedule(200), null);
    assert.equal(db.calls.length, 0);
  });
});

describe('the worker sends due calls', () => {
  const tick = now => fonioCalls.runDue(pool, { now });

  test('a due call goes to fonio once, with the whole contact and the deal as context, and is sent', async () => {
    await schedule(100);
    assert.deepEqual(await tick(minutes(WED10, 4)), [], 'not due yet');
    assert.equal(fon.calls.length, 0);
    const out = await tick(minutes(WED10, 6));
    assert.deepEqual(out, [{ id: 1, status: 'sent', reason: null }]);
    assert.equal(fon.calls.length, 1);
    const b = fon.calls[0].body;
    assert.equal(fon.calls[0].url, 'https://app.fonio.ai/api/public/v1/outbound_call');
    assert.equal(b.apiKey, KEY, 'the sealed key opened');
    assert.equal(b.fromNumber, '+4930123456');
    assert.equal(b.toNumber, '+491711234567');
    assert.deepEqual(b.context, {
      crm_call_id: '1', crm_contact_id: '10', crm_deal_id: '100',
      name: 'Erika Muster', email: 'erika@muster.de', phone: '0171 1234567', company: 'Muster GmbH', ort: 'Berlin',
      contact_owner: 'Olaf Owner', deal_title: 'Erika Muster', deal_value: '5000', deal_pipeline: 'Sales', deal_stage: 'New',
      deal_owner: 'Olaf Owner', 'Lead Source': 'Ads', deal_Budget: '10k',
      request_date: only().created_at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }),
      lead_source: 'Ads', deal_budget: '10k',     // the custom fields once more, under plain names for fonio's prompt
      first_name: 'Erika', last_name: 'Muster',   // the name's first word and the rest
      vorname: 'Erika', nachname: 'Muster', telefon: '0171 1234567', firma: 'Muster GmbH',   // the same under German names
      anfragedatum: only().created_at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }),
    });
    const c = only();
    assert.equal(c.status, 'sent');
    assert.equal(c.message, 'Call initiated');
    assert.ok(c.sent_at);
    assert.deepEqual(await tick(minutes(WED10, 10)), [], 'a sent call is never sent again');
    assert.equal(fon.calls.length, 1);
    // Part 18: what was sent and what fonio answered are kept with the call — the key is not
    assert.deepEqual(c.request, { url: 'https://app.fonio.ai/api/public/v1/outbound_call', body: { apiKey: '(hidden)', fromNumber: '+4930123456', toNumber: '+491711234567', context: b.context } });
    assert.deepEqual(c.response, { http: 200, body: { status: 'success', message: 'Call initiated' } });
    assert.ok(!JSON.stringify([c.request, c.response]).includes(KEY));
  });
  test('the technical record failing to save changes nothing about the call (Part 18)', async () => {
    db.failKeep = true;
    try {
      await schedule(100);
      assert.deepEqual(await tick(minutes(WED10, 6)), [{ id: 1, status: 'sent', reason: null }]);
      assert.equal(only().request, undefined);
    } finally { db.failKeep = false; }
  });

  test('the same call claimed twice at once is sent once', async () => {
    await schedule(100);
    const [a, b] = await Promise.all([fonioCalls.sendCall(pool, 1, minutes(WED10, 6)), fonioCalls.sendCall(pool, 1, minutes(WED10, 6))]);
    assert.equal([a, b].filter(Boolean).length, 1);
    assert.equal(fon.calls.length, 1);
  });

  test('switched off or removed since: cancelled, fonio not asked', async () => {
    await schedule(100);
    db.conn = CONN({ active: false });
    await tick(minutes(WED10, 6));
    assert.deepEqual([only().status, only().reason], ['cancelled', 'inactive']);
    seed(); await schedule(100); db.conn = null;
    await tick(minutes(WED10, 6));
    assert.deepEqual([only().status, only().reason], ['cancelled', 'disconnected']);
    assert.equal(fon.calls.length, 0);
  });

  test('the hours changed since: back to waiting for the next opening, no attempt counted, fonio not asked', async () => {
    await schedule(100);
    db.conn = CONN({ hours_from: '11:00:00' });   // 10:06 Berlin is now too early
    await tick(minutes(WED10, 6));
    const c = only();
    assert.equal(c.status, 'scheduled');
    assert.equal(c.due_at.toISOString(), '2026-11-04T10:00:00.000Z');
    assert.equal(c.attempts, 0);
    assert.equal(fon.calls.length, 0);
  });

  test("the contact's number as it is now: removed since → skipped, fonio not asked", async () => {
    await schedule(100);
    db.contacts.get(10).phone = '';
    await tick(minutes(WED10, 6));
    assert.deepEqual([only().status, only().reason], ['skipped', 'no_phone']);
    assert.equal(fon.calls.length, 0);
  });

  test('fonio says no (200 error): failed with its words, not tried again', async () => {
    fon.reply = { status: 200, body: { status: 'error', message: 'KYC not completed' } };
    await schedule(100);
    await tick(minutes(WED10, 6)); await tick(minutes(WED10, 30));
    assert.deepEqual([only().status, only().reason, only().message], ['failed', 'fonio', 'KYC not completed']);
    assert.equal(fon.calls.length, 1);
    assert.deepEqual(only().response, { http: 200, body: { status: 'error', message: 'KYC not completed' } }, "fonio's refusal is kept as it came");
  });

  test('fonio busy (429): tried again in 5 minutes, at most 3 times, then failed', async () => {
    fon.reply = { status: 429, body: { message: 'Too many calls' } };
    await schedule(100);
    await tick(minutes(WED10, 6));
    assert.equal(only().status, 'scheduled');
    assert.equal(only().due_at.toISOString(), minutes(WED10, 11).toISOString());
    await tick(minutes(WED10, 11)); await tick(minutes(WED10, 16));
    assert.deepEqual([only().status, only().attempts], ['failed', 3]);
    assert.equal(fon.calls.length, 3);
  });

  test('a broken connection: failed, never tried again — the phone may already be ringing', async () => {
    fon.reply = { throwCode: 'ECONNRESET' };
    await schedule(100);
    await tick(minutes(WED10, 6)); await tick(minutes(WED10, 30));
    assert.equal(only().status, 'failed');
    assert.match(only().message, /may have started/);
    assert.equal(fon.calls.length, 1);
    assert.deepEqual({ http: only().response.http, body: only().response.body }, { http: 0, body: null }, 'no answer: recorded as none');
    assert.match(only().response.error, /may have started/);
  });

  test('a row left mid-send by a dead process is failed "interrupted", never sent', async () => {
    await schedule(100);
    Object.assign(db.calls[0], { status: 'sending', updated_at: minutes(WED10, 3) });
    await tick(minutes(WED10, 6));
    assert.deepEqual([only().status, only().reason], ['failed', 'interrupted']);
    assert.equal(fon.calls.length, 0);
  });
});

describe("the booking service's free times go with the call, for the assistant (Part 29)", () => {
  const bookingSlots = require('../../utils/booking-slots');
  const realFreeSlots = bookingSlots.freeSlots;
  const tick = now => fonioCalls.runDue(pool, { now });
  const B = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 1, m);   // Berlin clock in November
  let asked;
  const service = answer => { asked = []; bookingSlots.freeSlots = async (p, wid, from) => { asked.push({ wid, from }); return typeof answer === 'function' ? answer() : answer; }; };
  after(() => { bookingSlots.freeSlots = realFreeSlots; });
  const sent = async () => { await schedule(100); await tick(minutes(WED10, 6)); return fon.calls[0].body.context; };

  test('with a booking service connected: the next free times as text and as a list, and today, under German and English names, on the account\'s clock', async () => {
    service({ service: 'calendly', zone: 'Europe/Berlin', slots: [B(5, 9), B(5, 9, 30), B(6, 14)] });
    const ctx = await sent();
    assert.deepEqual(asked, [{ wid: WS, from: minutes(WED10, 6).getTime() }], 'asked when the call goes out, so the times are fresh');
    assert.equal(ctx.freie_termine, 'Do 05.11.2026: 09:00, 09:30; Fr 06.11.2026: 14:00'); assert.equal(ctx.free_times, ctx.freie_termine);
    assert.equal(ctx.freie_termine_json, '["2026-11-05 09:00","2026-11-05 09:30","2026-11-06 14:00"]'); assert.equal(ctx.free_times_json, ctx.freie_termine_json);
    assert.equal(ctx.heute, 'Mittwoch, 04.11.2026'); assert.equal(ctx.today, ctx.heute);
    assert.equal(ctx.vorname, 'Erika', 'everything else as before');
  });
  test('nothing free: the times are empty text and an empty list, so the prompt never shows a raw placeholder', async () => {
    service({ service: 'calcom', zone: 'Europe/Berlin', slots: [] });
    const ctx = await sent();
    assert.deepEqual([ctx.freie_termine, ctx.freie_termine_json, ctx.heute], ['', '[]', 'Mittwoch, 04.11.2026']);
  });
  test('no booking service, or the lookup failing: the call goes out without them, exactly as before', async () => {
    service(null);
    const ctx = await sent();
    for (const k of ['freie_termine', 'free_times', 'freie_termine_json', 'free_times_json', 'heute', 'today']) assert.ok(!(k in ctx), k);
    seed(); fon.calls.length = 0;
    service(() => { throw new Error('boom'); });
    const again = await sent();
    assert.ok(!('freie_termine' in again)); assert.equal(only().status, 'sent');
  });
  test("a name the workspace's own variables already use is left to them", async () => {
    db.conn = CONN({ variables: [{ name: 'heute', source: 'value:company' }] });
    service({ service: 'calendly', zone: 'Europe/Berlin', slots: [B(5, 9)] });
    const ctx = await sent();
    assert.equal(ctx.heute, 'Muster GmbH'); assert.equal(ctx.today, 'Mittwoch, 04.11.2026'); assert.equal(ctx.freie_termine, 'Do 05.11.2026: 09:00');
  });
  test("a prompt that calls them something else: the workspace's own name connected to the free times or to today carries them (Part 32); empty without a booking service", async () => {
    db.conn = CONN({ variables: [{ name: 'offene_zeiten', source: 'value:free_times' }, { name: 'datum', source: 'value:today' }, { name: 'liste', source: 'value:free_times_json' }] });
    service({ service: 'calendly', zone: 'Europe/Berlin', slots: [B(5, 9)] });
    const ctx = await sent();
    assert.deepEqual([ctx.offene_zeiten, ctx.datum, ctx.liste], ['Do 05.11.2026: 09:00', 'Mittwoch, 04.11.2026', '["2026-11-05 09:00"]']);
    seed(); fon.calls.length = 0;
    db.conn = CONN({ variables: [{ name: 'offene_zeiten', source: 'value:free_times' }] });
    service(null);
    const none = await sent();
    assert.equal(none.offene_zeiten, '', 'named in the prompt, so it is sent, empty');
    assert.deepEqual(fonioCalls.checkVariables([{ name: 'offene_zeiten', source: 'value:free_times' }]).value, [{ name: 'offene_zeiten', source: 'value:free_times' }], 'a save accepts it');
  });
  test('the request kept for the technical details carries them too', async () => {
    service({ service: 'calendly', zone: 'Europe/Berlin', slots: [B(5, 9)] });
    await sent();
    assert.equal(only().request.body.context.freie_termine, 'Do 05.11.2026: 09:00');
  });
});

// ── Part 33: trying again after a call that reached nobody ──────────────────
describe('trying again after a call that reached nobody (Part 33)', () => {
  const follow = (over = {}) => ({ enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, ...over });
  // a call fonio made 90 minutes before WED10 and never reported
  const sentCall = (over = {}) => {
    const c = { id: db.nextCall++, workspace_id: WS, deal_id: 100, contact_id: 10, trigger: 'deal_manual', status: 'sent', reason: null,
      raw_number: '0171 1234567', to_number: '+491711234567', due_at: minutes(WED10, -95), sent_at: minutes(WED10, -90),
      result_at: null, follow_up_no: 0, follow_up_at: null, attempts: 1, created_at: minutes(WED10, -95), updated_at: minutes(WED10, -90) };
    Object.assign(c, over);
    db.calls.push(c);
    return c;
  };
  const followUps = () => db.calls.filter(c => c.trigger === 'follow_up');

  test('the sweep books one retry for a call older than an hour: due sent_at + the not-answered delay, inside the hours', async () => {
    db.conn.follow_up = follow();
    const c = sentCall();
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 1);
    const [f] = followUps();
    assert.deepEqual([f.status, f.follow_up_of, f.follow_up_no, f.contact_id, f.deal_id, f.to_number], ['scheduled', c.id, 1, 10, 100, '+491711234567']);
    assert.equal(f.due_at.toISOString(), minutes(WED10, 30).toISOString(), '90 minutes ago + 120 minutes: half an hour from now');
    assert.ok(c.follow_up_at, 'the call knows it has its retry');
  });
  test('the sweep leaves alone: a call younger than an hour, older than a day, with a result, or with its retry booked', async () => {
    db.conn.follow_up = follow();
    sentCall({ sent_at: minutes(WED10, -10) });
    sentCall({ sent_at: minutes(WED10, -25 * 60) });
    sentCall({ result_at: new Date(), sent_at: minutes(WED10, -120) });
    const booked = sentCall({ sent_at: minutes(WED10, -120) });
    booked.follow_up_at = new Date();
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 0);
    assert.equal(followUps().length, 0);
  });
  test('nothing is retried while the card is off (a row saved before it existed) or the connection is inactive', async () => {
    sentCall();
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 0, '{} means off');
    db.conn.follow_up = follow();
    db.conn.active = false;
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 0);
    assert.equal(followUps().length, 0);
  });
  test('the chain stops at max_attempts: a retry that was itself not answered is not retried past the limit', async () => {
    db.conn.follow_up = follow({ max_attempts: 1 });
    sentCall({ trigger: 'follow_up', follow_up_no: 1 });
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 0);
    db.calls.length = 0;
    db.conn.follow_up = follow({ max_attempts: 2 });
    sentCall({ trigger: 'follow_up', follow_up_no: 1 });
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 1);
    assert.equal(followUps().at(-1).follow_up_no, 2);
  });
  test('one retry per call: the next tick finds nothing to book', async () => {
    db.conn.follow_up = follow();
    sentCall();
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 1);
    assert.equal(await fonioCalls.sweepUnreported(pool, WED10), 0);
    assert.equal(followUps().length, 1);
  });
  test('runDue carries the sweep, so the worker needs no second timer', async () => {
    db.conn.follow_up = follow();
    sentCall();
    await fonioCalls.runDue(pool, { now: WED10 });
    assert.equal(followUps().length, 1);
    assert.equal(followUps()[0].status, 'scheduled', 'due in half an hour: not sent yet');
  });
});

describe('the outcome decides the delay, and an answered result takes the retry back (Part 33)', () => {
  const follow = (over = {}) => ({ enabled: true, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, ...over });
  const sentCall = (over = {}) => {
    const c = { id: db.nextCall++, workspace_id: WS, deal_id: 100, contact_id: 10, trigger: 'deal_manual', status: 'sent', reason: null,
      raw_number: '0171 1234567', to_number: '+491711234567', due_at: minutes(WED10, -95), sent_at: minutes(WED10, -90),
      result_at: null, follow_up_no: 0, follow_up_at: null, attempts: 1, created_at: minutes(WED10, -95), updated_at: minutes(WED10, -90) };
    Object.assign(c, over);
    db.calls.push(c);
    return c;
  };
  const followUps = () => db.calls.filter(c => c.trigger === 'follow_up');

  test('no answer and unreported 120 minutes, mailbox a day, busy 120 — all counted from sent_at, moved into the hours', async () => {
    db.conn.follow_up = follow();
    const due = { no_answer: '2026-11-04T09:30:00.000Z', voicemail: '2026-11-05T08:00:00.000Z', busy: '2026-11-04T09:30:00.000Z' };
    for (const outcome of ['no_answer', 'voicemail', 'busy', 'unreported']) {
      db.calls.length = 0;
      const c = sentCall();
      assert.ok(await fonioCalls.followUpAfterResult(pool, WS, c, outcome, WED10), outcome);
      assert.equal(followUps()[0].due_at.toISOString(), due[outcome === 'unreported' ? 'no_answer' : outcome], outcome);
    }
  });
  test('an answered result, or none at all, books nothing', async () => {
    db.conn.follow_up = follow();
    for (const outcome of ['answered', null]) {
      const c = sentCall();
      assert.equal(await fonioCalls.followUpAfterResult(pool, WS, c, outcome, WED10), null, String(outcome));
    }
    assert.equal(followUps().length, 0);
  });
  test('a late answered result cancels the retry the sweep booked — unless it has gone out', async () => {
    db.conn.follow_up = follow();
    const c = sentCall();
    c.follow_up_at = new Date();
    const f = { id: db.nextCall++, workspace_id: WS, deal_id: 100, contact_id: 10, trigger: 'follow_up', status: 'scheduled', reason: null,
      follow_up_of: c.id, follow_up_no: 1, due_at: minutes(WED10, 30), sent_at: null, attempts: 0, created_at: new Date(), updated_at: new Date() };
    db.calls.push(f);
    assert.equal(await fonioCalls.followUpAfterResult(pool, WS, c, 'answered', WED10), null);
    assert.deepEqual([f.status, f.reason], ['cancelled', 'late_result']);
    f.status = 'sent';
    await fonioCalls.followUpAfterResult(pool, WS, c, 'answered', WED10);
    assert.equal(f.status, 'sent', 'a call that already rang is not taken back');
  });
  test('a contact with a call waiting gets none — and the call is settled, not retried later; one retry per call', async () => {
    db.conn.follow_up = follow();
    const c = sentCall();
    db.calls.push({ id: db.nextCall++, workspace_id: WS, deal_id: 100, contact_id: 10, trigger: 'deal_webhook', status: 'scheduled', reason: null,
      due_at: minutes(WED10, 5), sent_at: null, follow_up_no: 0, follow_up_at: null, attempts: 0, created_at: new Date(), updated_at: new Date() });
    assert.equal(await fonioCalls.followUpAfterResult(pool, WS, c, 'no_answer', WED10), null);
    assert.equal(followUps().length, 0);
    assert.ok(c.follow_up_at, 'the contact is being called anyway: this call needs no retry of its own');
    db.calls = db.calls.filter(x => x.status !== 'scheduled');
    const c2 = sentCall({ id: db.nextCall++ });
    assert.ok(await fonioCalls.followUpAfterResult(pool, WS, c2, 'no_answer', WED10));
    assert.equal(await fonioCalls.followUpAfterResult(pool, WS, c2, 'no_answer', WED10), null);
    assert.equal(followUps().length, 1);
  });
});

// ── Part 35: a callback at the time the person asked for ────────────────────
describe('a callback at the time the person asked for (Part 35)', () => {
  const sentCall = (over = {}) => {
    const c = { id: db.nextCall++, workspace_id: WS, deal_id: 100, contact_id: 10, trigger: 'deal_manual', status: 'sent', reason: null,
      raw_number: '0171 1234567', to_number: '+491711234567', due_at: minutes(WED10, -10), sent_at: minutes(WED10, -5),
      result_at: null, follow_up_no: 0, follow_up_at: null, follow_up_of: null, attempts: 1, created_at: minutes(WED10, -10), updated_at: minutes(WED10, -5) };
    Object.assign(c, over);
    db.calls.push(c);
    return c;
  };
  const callbacks = () => db.calls.filter(c => c.trigger === 'callback');
  const instant = (cb, zone = 'Europe/Berlin', now = WED10) => { const w = fonioCalls.callbackInstant(cb, zone, now); return w.why ? w.why : [w.at.toISOString(), w.date, w.time]; };
  const day = (day, time) => ({ day, time, minutes: null, said: 'x' });

  test('the instant on the workspace\'s clock (Wednesday 10:00 in Berlin): a date, today, tomorrow, a weekday, a time alone, a day alone, "in 2 hours"', () => {
    assert.deepEqual(instant(day({ offset: 0 }, '15:00')), ['2026-11-04T14:00:00.000Z', '2026-11-04', '15:00']);
    assert.deepEqual(instant(day({ offset: 1 }, '09:30')), ['2026-11-05T08:30:00.000Z', '2026-11-05', '09:30']);
    assert.deepEqual(instant(day({ date: '2026-11-06' }, '14:30')), ['2026-11-06T13:30:00.000Z', '2026-11-06', '14:30']);
    assert.deepEqual(instant(day({ weekday: 5 }, '14:30')), ['2026-11-06T13:30:00.000Z', '2026-11-06', '14:30'], 'Friday is in two days');
    assert.deepEqual(instant(day({ weekday: 3 }, '15:00')), ['2026-11-04T14:00:00.000Z', '2026-11-04', '15:00'], 'Wednesday, still ahead today');
    assert.deepEqual(instant(day({ weekday: 3 }, '09:00')), ['2026-11-11T08:00:00.000Z', '2026-11-11', '09:00'], 'Wednesday, gone by today: next week');
    assert.deepEqual(instant(day(null, '15:00')), ['2026-11-04T14:00:00.000Z', '2026-11-04', '15:00'], 'a time alone: its next occurrence');
    assert.deepEqual(instant(day(null, '09:00')), ['2026-11-05T08:00:00.000Z', '2026-11-05', '09:00'], '…which is tomorrow when it has passed');
    assert.deepEqual(instant(day({ offset: 1 }, null)), ['2026-11-05T09:00:00.000Z', '2026-11-05', '10:00'], 'a day alone: ten in the morning');
    assert.equal(fonioCalls.CALLBACK_DAY_TIME, '10:00');
    assert.deepEqual(instant({ day: null, time: null, minutes: 120, said: 'in 2 Stunden' }), ['2026-11-04T11:00:00.000Z', '2026-11-04', '12:00']);
    // the same words on another clock: 17:00 in Manila
    assert.deepEqual(instant(day(null, '18:00'), 'Asia/Manila'), ['2026-11-04T10:00:00.000Z', '2026-11-04', '18:00']);
    assert.deepEqual(instant(day({ offset: 1 }, '09:00'), 'Asia/Manila'), ['2026-11-05T01:00:00.000Z', '2026-11-05', '09:00']);
  });
  test('not planned: unreadable, in the past, more than 14 days ahead, between 22:00 and 07:00', () => {
    assert.equal(instant(null), 'unreadable'); assert.equal(instant({ unreadable: true, said: 'später' }), 'unreadable');
    assert.equal(instant(day({ offset: 0 }, '09:30')), 'past'); assert.equal(instant(day({ date: '2026-11-03' }, '15:00')), 'past');
    assert.deepEqual(instant(day({ date: '2026-11-18' }, '09:59')), ['2026-11-18T08:59:00.000Z', '2026-11-18', '09:59'], 'a minute under 14 days is planned');
    assert.equal(instant(day({ date: '2026-11-18' }, '10:01')), 'too_far'); assert.equal(fonioCalls.CALLBACK_DAYS, 14);
    for (const t of ['22:00', '23:30', '00:30', '06:59']) assert.equal(instant(day({ offset: 1 }, t)), 'night', t);
    for (const t of ['07:00', '21:59']) assert.equal(instant(day({ offset: 1 }, t)).length, 3, t);
    assert.equal(instant({ day: null, time: null, minutes: 13 * 60, said: 'in 13 Stunden' }), 'night', '10:00 + 13 hours is 23:00');
    assert.deepEqual(fonioCalls.CALLBACK_NIGHT, { from: '22:00', to: '07:00' });
  });

  test('planned as a normal call for that time: the same contact, deal and number, answering the call it follows, no retry counted', async () => {
    const c = sentCall({ follow_up_no: 1 });
    const out = await fonioCalls.callbackAfterResult(pool, WS, c, { day: { offset: 0 }, time: '15:00', minutes: null, said: 'heute 15:00' }, WED10);
    const [f] = callbacks();
    assert.deepEqual(out, { status: 'planned', call_id: f.id, due_at: f.due_at, date: '2026-11-04', time: '15:00', said: 'heute 15:00' });
    assert.deepEqual([f.status, f.follow_up_of, f.follow_up_no, f.contact_id, f.deal_id, f.raw_number, f.to_number], ['scheduled', c.id, 1, 10, 100, '0171 1234567', '+491711234567']);
    assert.equal(f.due_at.toISOString(), '2026-11-04T14:00:00.000Z');
    assert.ok(c.follow_up_at, 'the call has its one follow-up');
    assert.equal(fonioCalls.callbackLine(out), 'Rückruf gewünscht („heute 15:00“): geplant für 04.11.2026, 15:00');
  });
  test('the worker sends it at that time although the calling hours are over — a normal call at that hour waits for the morning', async () => {
    const c = sentCall();
    await fonioCalls.callbackAfterResult(pool, WS, c, { day: { offset: 0 }, time: '19:30', minutes: null, said: 'heute 19:30' }, WED10);
    const [f] = callbacks();
    assert.equal(f.due_at.toISOString(), '2026-11-04T18:30:00.000Z', '19:30 in Berlin, not moved to 09:00');
    await fonioCalls.runDue(pool, { now: new Date('2026-11-04T18:29:00.000Z') });
    assert.equal(f.status, 'scheduled', 'not before its time'); assert.equal(fon.calls.length, 0);
    await fonioCalls.runDue(pool, { now: new Date('2026-11-04T18:30:30.000Z') });
    assert.equal(f.status, 'sent'); assert.equal(fon.calls.length, 1);
    assert.equal(fon.calls[0].body.toNumber, '+491711234567');
    // the contrast: a call a new deal started, due at the same moment
    seed(); fon.calls.length = 0;
    await schedule(100);
    only().due_at = new Date('2026-11-04T18:30:00.000Z');
    await fonioCalls.runDue(pool, { now: new Date('2026-11-04T18:30:30.000Z') });
    assert.equal(only().status, 'scheduled'); assert.equal(only().due_at.toISOString(), '2026-11-05T08:00:00.000Z'); assert.equal(fon.calls.length, 0);
  });
  test('with calling hours that name no day at all a callback still goes out', async () => {
    db.conn = CONN({ hours_days: [] });
    const c = sentCall();
    await fonioCalls.callbackAfterResult(pool, WS, c, { day: { offset: 0 }, time: '15:00', minutes: null, said: 'x' }, WED10);
    await fonioCalls.runDue(pool, { now: new Date('2026-11-04T14:00:30.000Z') });
    assert.equal(callbacks()[0].status, 'sent');
  });
  test('nothing to say: no callback named, the contact gone, fonio switched off or disconnected', async () => {
    const cb = { day: { offset: 0 }, time: '15:00', minutes: null, said: 'x' };
    assert.equal(await fonioCalls.callbackAfterResult(pool, WS, sentCall(), null, WED10), null);
    assert.equal(await fonioCalls.callbackAfterResult(pool, WS, sentCall({ contact_id: null }), cb, WED10), null);
    db.conn = CONN({ active: false });
    assert.equal(await fonioCalls.callbackAfterResult(pool, WS, sentCall(), cb, WED10), null);
    db.conn = null;
    assert.equal(await fonioCalls.callbackAfterResult(pool, WS, sentCall(), cb, WED10), null);
    assert.equal(callbacks().length, 0);
  });
  test('the switch: on for a row from before it existed, off only when saved off; a refusal claims nothing', async () => {
    assert.equal(fonioCalls.FOLLOW_UP.callback, true);
    for (const row of [null, {}, { follow_up: {} }, { follow_up: { enabled: true } }, { follow_up: { callback: true } }, { follow_up: { callback: 'no' } }]) assert.equal(fonioCalls.followUpSettings(row).callback, true, JSON.stringify(row));
    assert.equal(fonioCalls.followUpSettings({ follow_up: { callback: false } }).callback, false);
    const policy = { enabled: false, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1 };
    assert.equal(fonioCalls.checkFollowUp(policy).value.callback, true, 'a form from before the switch leaves it on');
    assert.equal(fonioCalls.checkFollowUp({ ...policy, callback: false }).value.callback, false);
    assert.match(fonioCalls.checkFollowUp({ ...policy, callback: 'yes' }).error, /callback must be true or false/);

    db.conn = CONN({ follow_up: { callback: false } });
    const c = sentCall();
    const out = await fonioCalls.callbackAfterResult(pool, WS, c, { day: { offset: 0 }, time: '15:00', minutes: null, said: 'heute 15:00' }, WED10);
    assert.deepEqual(out, { status: 'off', date: '2026-11-04', time: '15:00', said: 'heute 15:00' });
    assert.equal(callbacks().length, 0); assert.equal(c.follow_up_at, null, 'the delays may still book their retry');
    assert.equal(fonioCalls.callbackLine(out), 'Rückruf gewünscht („heute 15:00“), aber nicht geplant: Rückrufe zur Wunschzeit sind ausgeschaltet');
  });
  test('the note\'s line for every way it can end', () => {
    const line = (status, said = 'morgen') => fonioCalls.callbackLine({ status, date: null, time: null, said });
    assert.equal(line('unreadable', 'später'), 'Rückruf gewünscht („später“), aber nicht geplant: die Zeit war nicht lesbar');
    assert.equal(line('past'), 'Rückruf gewünscht („morgen“), aber nicht geplant: die Zeit liegt in der Vergangenheit');
    assert.equal(line('too_far'), 'Rückruf gewünscht („morgen“), aber nicht geplant: die Zeit liegt mehr als 14 Tage entfernt');
    assert.equal(line('night'), 'Rückruf gewünscht („morgen“), aber nicht geplant: zwischen 22 und 7 Uhr wird nicht angerufen');
    assert.equal(line('limit'), 'Rückruf gewünscht („morgen“), aber nicht geplant: der Kontakt wurde schon 3-mal zurückgerufen');
    assert.equal(line('waiting'), 'Rückruf gewünscht („morgen“), aber nicht geplant: für den Kontakt ist schon ein Anruf geplant');
    assert.equal(line('something_new', null), 'Rückruf gewünscht (ohne Angabe), aber nicht geplant: ein Fehler im CRM');
    assert.equal(fonioCalls.callbackLine(null), ''); assert.equal(fonioCalls.CALLBACK_MAX, 3);
  });
  test("another workspace's call is not this workspace's chain", async () => {
    const c = sentCall({ workspace_id: OTHER_WS });
    await fonioCalls.callbackAfterResult(pool, WS, c, { day: { offset: 0 }, time: '15:00', minutes: null, said: 'x' }, WED10);
    const chain = db.log.find(l => l.sql.startsWith('WITH RECURSIVE chain'));
    assert.deepEqual(chain.params, [c.id, WS], 'the chain is read inside the workspace');
  });
});

describe('the table', () => {
  test('initDb() creates fonio_calls, its due index, and one waiting call per contact as a unique index', async () => {
    const fs = require('fs'), path = require('path');
    const { createFakePool } = require('../helpers/fake-pool');
    const { loadDb } = require('../helpers/load-db');
    const { ROOT } = require('../helpers/load-route');
    const dbPool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    await loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), dbPool).initDb();
    const create = dbPool.find(/CREATE TABLE IF NOT EXISTS fonio_calls \(/);
    assert.ok(create);
    assert.match(create.sql, /trigger TEXT NOT NULL CHECK \(trigger IN \('deal_manual','deal_webhook','follow_up','callback'\)\)/);
    assert.ok(dbPool.find(/CREATE INDEX IF NOT EXISTS fonio_calls_due_idx ON fonio_calls \(due_at\) WHERE status = 'scheduled'/));
    // the pre-check in scheduleForDeal is the quick path; this index is the guarantee when two deals arrive at once
    assert.ok(dbPool.find(/CREATE UNIQUE INDEX IF NOT EXISTS fonio_calls_one_waiting ON fonio_calls \(contact_id\) WHERE status IN \('scheduled','sending'\)/));
  });
  test('initDb() adds the follow-up columns, widens an old trigger check and indexes the unreported calls (Part 33)', async () => {
    const fs = require('fs'), path = require('path');
    const { createFakePool } = require('../helpers/fake-pool');
    const { loadDb } = require('../helpers/load-db');
    const { ROOT } = require('../helpers/load-route');
    const dbPool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    await loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), dbPool).initDb();
    for (const col of ['call_outcome TEXT', 'follow_up_of INTEGER REFERENCES fonio_calls\\(id\\) ON DELETE SET NULL',
      'follow_up_no INTEGER NOT NULL DEFAULT 0', 'follow_up_at TIMESTAMPTZ']) {
      assert.ok(dbPool.find(new RegExp(`ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS ${col}`)), col);
    }
    assert.ok(dbPool.find(/ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS follow_up JSONB NOT NULL DEFAULT '\{\}'::jsonb/));
    assert.ok(dbPool.find(/ALTER TABLE fonio_calls DROP CONSTRAINT IF EXISTS fonio_calls_trigger_check/));
    assert.ok(dbPool.find(/ADD CONSTRAINT fonio_calls_trigger_check CHECK \(trigger IN \('deal_manual','deal_webhook','follow_up','callback'\)\)/), 'and the callback a person asked for in a call (Part 35)');
    assert.ok(dbPool.find(/CREATE INDEX IF NOT EXISTS fonio_calls_unreported_idx ON fonio_calls \(sent_at\) WHERE status = 'sent' AND result_at IS NULL/));
  });
});

describe('the history and cancelling (routes/fonio.js)', () => {
  let owner, member;
  before(async () => {
    owner  = await serve({ '/f': loadRoute('fonio.js', { pool, user: { id: 1, workspaceId: WS, role: 'owner' } }) });
    member = await serve({ '/f': loadRoute('fonio.js', { pool, user: { id: 3, workspaceId: WS, role: 'member' } }) });
  });
  after(async () => { await owner.close(); await member.close(); });

  test('everyone sees the history, newest first, with contact and deal', async () => {
    await schedule(100); await schedule(101);
    const r = await member.request('GET', '/f/calls');
    assert.equal(r.status, 200);
    assert.equal(r.body.can_manage, false);
    assert.deepEqual(r.body.calls.map(c => [c.status, c.contact_name, c.deal_title]), [['skipped', 'No Phone', 'No Phone'], ['scheduled', 'Erika Muster', 'Erika Muster']]);
  });

  test('a member cannot cancel; an owner cancels a waiting call; a call no longer waiting is 409', async () => {
    await schedule(100);
    assert.equal((await member.request('POST', '/f/calls/1/cancel')).status, 403);
    assert.equal(only().status, 'scheduled');
    const r = await owner.request('POST', '/f/calls/1/cancel');
    assert.equal(r.status, 200);
    assert.deepEqual([only().status, only().reason, only().cancelled_by], ['cancelled', 'by_user', 1]);
    assert.equal((await owner.request('POST', '/f/calls/1/cancel')).status, 409);
    assert.equal((await owner.request('POST', '/f/calls/abc/cancel')).status, 400);
  });

  test('switching the connection off cancels every waiting call; removing it too', async () => {
    await schedule(100); await schedule(104);
    const r = await owner.request('PUT', '/f', { active: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(db.calls.map(c => [c.status, c.reason]), [['cancelled', 'inactive'], ['cancelled', 'inactive']]);
    seed(); await schedule(100);
    assert.equal((await owner.request('DELETE', '/f')).status, 200);
    assert.deepEqual([only().status, only().reason], ['cancelled', 'disconnected']);
  });

  test('a save that keeps it switched on cancels nothing', async () => {
    await schedule(100);
    await owner.request('PUT', '/f', { delay_minutes: 10 });
    assert.equal(only().status, 'scheduled');
  });
});

describe('the triggers', () => {
  const seen = [];
  const stub = { scheduleForDeal: async (p, args) => { seen.push({ pool: p, ...args }); if (stub.fail) throw new Error('fonio down'); return null; } };
  let restore;
  beforeEach(() => { seen.length = 0; stub.fail = false; restore = inject('utils/fonio-calls.js', stub); });
  // each test loads its route after the stub is in place, and puts the real module back afterwards
  const done = () => restore();

  test('a deal made by hand: scheduled as deal_manual for that deal; a failure never fails the deal', async () => {
    const dealPool = { query: async sql => (/INSERT INTO deals/.test(sql) ? { rows: [{ id: 77 }] } : { rows: [] }) };
    const s = await serve({ '/api/deals': loadRoute('deals.js', { pool: dealPool, user: { id: 1, workspaceId: WS, role: 'member' } }) });
    try {
      let r = await s.request('POST', '/api/deals', { title: 'New deal', pipeline_id: 3, contact_id: 10 });
      assert.equal(r.status, 201);
      assert.equal(seen.length, 1);
      assert.deepEqual([seen[0].workspaceId, seen[0].dealId, seen[0].trigger], [WS, 77, 'deal_manual']);
      assert.equal(seen[0].pool, dealPool);
      stub.fail = true;
      r = await s.request('POST', '/api/deals', { title: 'Another', pipeline_id: 3 });
      assert.equal(r.status, 201, 'the deal is made even when fonio scheduling fails');
    } finally { await s.close(); done(); }
  });

  test('a lead with a deal: scheduled as deal_webhook; a lead without a deal schedules nothing', async () => {
    let createDeal = true;
    const leadPool = {
      query: async sql => {
        if (/FROM workspace_webhook/.test(sql)) return { rows: [{ workspace_id: WS, active: true, create_deal: createDeal, pipeline_id: 3, stage_id: 9, field_map: { name: 'full_name', phone: 'phone' }, default_assignee_id: null }] };
        if (/INSERT INTO contacts/.test(sql)) return { rows: [{ id: 55, name: 'Priya Shah' }] };
        if (/INSERT INTO deals/.test(sql)) return { rows: [{ id: 88 }] };
        return { rows: [] };
      },
    };
    const s = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: leadPool }) });
    try {
      let r = await s.request('POST', '/api/integrations/receive/abc', { full_name: 'Priya Shah', phone: '0171 7654321' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(seen.map(x => [x.workspaceId, x.dealId, x.trigger]), [[WS, 88, 'deal_webhook']]);
      createDeal = false; seen.length = 0;
      r = await s.request('POST', '/api/integrations/receive/abc', { full_name: 'No Deal' });
      assert.equal(r.status, 200);
      assert.deepEqual(seen, []);
    } finally { await s.close(); done(); }
  });
});

describe("the context's names for fonio's prompt (Part 11)", () => {
  test('plainKey: a custom field name as a plain variable name', () => {
    assert.equal(fonioCalls.plainKey('Lead Source'), 'lead_source');
    assert.equal(fonioCalls.plainKey('Größe (m²) / Straße'), 'groesse_m2_strasse');
    assert.equal(fonioCalls.plainKey('  Eigenkapital-Spanne '), 'eigenkapital_spanne');
    assert.equal(fonioCalls.plainKey('Café'), 'cafe');
    assert.equal(fonioCalls.plainKey('???'), '');
  });
  test('requestDate: the day in the given zone, written the German way; nothing for no date; a bad zone falls back to Berlin', () => {
    assert.equal(fonioCalls.requestDate('2026-11-10T23:30:00.000Z', 'Europe/Berlin'), '11.11.2026');
    assert.equal(fonioCalls.requestDate('2026-11-10T23:30:00.000Z', 'America/New_York'), '10.11.2026');
    assert.equal(fonioCalls.requestDate('2026-11-10T09:00:00.000Z', 'Not/AZone'), '10.11.2026');
    assert.equal(fonioCalls.requestDate(null, 'Europe/Berlin'), '');
    assert.equal(fonioCalls.requestDate('nonsense', 'Europe/Berlin'), '');
  });
});

describe("the workspace's own variables for the prompt (Part 13)", () => {
  const tick = now => fonioCalls.runDue(pool, { now });
  async function contextWith(variables) {
    seed();
    db.conn = CONN({ variables });
    fon.calls.length = 0;
    await schedule(100);
    await tick(minutes(WED10, 6));
    return fon.calls[0].body.context;
  }

  test('each name carries its CRM value: a built-in, a custom contact field, a custom deal field', async () => {
    const ctx = await contextWith([
      { name: 'Anrede_Name', source: 'value:name' },
      { name: 'spanne', source: 'deal_field:budget' },
      { name: 'herkunft', source: 'contact_field:lead_source' },
      { name: 'datum', source: 'value:request_date' },
    ]);
    assert.equal(ctx.Anrede_Name, 'Erika Muster');
    assert.equal(ctx.spanne, '10k');
    assert.equal(ctx.herkunft, 'Ads');
    assert.equal(ctx.datum, ctx.request_date);
    assert.equal(ctx.name, 'Erika Muster', 'what every call carries is still there');
  });

  test('an empty or missing value is sent as empty text, so the prompt never shows a raw placeholder', async () => {
    const ctx = await contextWith([{ name: 'nachricht', source: 'contact_field:notes' }, { name: 'weg', source: 'deal_field:gone' }, { name: 'web', source: 'value:webseite' }]);
    assert.deepEqual([ctx.nachricht, ctx.weg, ctx.web], ['', '', '']);
  });

  test("a variable wins over what the call carries under that name, but never feeds another one and never takes the CRM's ids", async () => {
    const ctx = await contextWith([
      { name: 'name', source: 'value:company' },
      { name: 'kontakt', source: 'value:name' },
      { name: 'crm_call_id', source: 'value:name' },   // cannot be saved; a row put there by hand is passed over
    ]);
    assert.equal(ctx.name, 'Muster GmbH');
    assert.equal(ctx.kontakt, 'Erika Muster', 'read before any variable was written');
    assert.equal(ctx.crm_call_id, '1');
  });

  test('no variables, or a column that is not a list: the context as before', async () => {
    const plain = await contextWith([]);
    assert.deepEqual(await contextWith(undefined), plain);
    assert.deepEqual(await contextWith('nonsense'), plain);
  });

  test('checkVariables: trims and keeps good rows; refuses bad names, crm_ names, doubles, unknown sources, too many', () => {
    assert.deepEqual(fonioCalls.checkVariables([{ name: ' vorname ', source: ' value:first_name ' }, { name: 'x1', source: 'contact_field:eigenkapital' }]),
      { value: [{ name: 'vorname', source: 'value:first_name' }, { name: 'x1', source: 'contact_field:eigenkapital' }] });
    assert.deepEqual(fonioCalls.checkVariables([]), { value: [] });
    const bad = list => assert.ok(fonioCalls.checkVariables(list).error, JSON.stringify(list));
    bad('x'); bad(null);
    for (const name of ['', '1abc', 'Vorname Nachname', 'e-mail', 'größe', 'a'.repeat(61), 'crm_call_id', 'CRM_x']) bad([{ name, source: 'value:name' }]);
    for (const source of ['', 'name', 'value:password', 'value:crm_call_id', 'contact_field:', 'deal_field:a b', 'other:x', 5]) bad([{ name: 'ok', source }]);
    bad([{ name: 'a', source: 'value:name' }, { name: 'a', source: 'value:email' }]);
    bad(Array.from({ length: fonioCalls.MAX_VARIABLES + 1 }, (_, i) => ({ name: `v${i}`, source: 'value:name' })));
    assert.ok(fonioCalls.checkVariables(Array.from({ length: fonioCalls.MAX_VARIABLES }, (_, i) => ({ name: `v${i}`, source: 'value:name' }))).value);
  });

  test('every built-in source is a value the context can carry', async () => {
    seed();
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../utils/fonio-calls.js'), 'utf8');
    const fromCalendar = Object.values(fonioCalls.SLOT_NAMES).flat();   // the booking service's free times and today (Part 32)
    for (const k of fonioCalls.VALUE_SOURCES) assert.ok(fonioCalls.CONTACT_FIELDS.includes(k) || src.includes(`put('${k}'`) || fromCalendar.includes(k), k);
  });
});
