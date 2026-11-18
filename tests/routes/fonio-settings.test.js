// ROUTE + UNIT tests for /api/integrations/fonio (FONIO_CHANGES Part 1, 2026-11-06): the fonio.ai connection, one per
// workspace — API key, fonio number, active switch, delay, triggers, number rules, calling hours. Everyone reads it;
// saving and removing are owner/admin only. Three servers (owner, admin, member) are built from the same route file
// over a stateful fake pool, and fonio itself is a fake: nothing leaves the machine. Pinned: the key is checked with
// fonio once, sealed before it is bound, and never comes back (only its last four, only to owner/admin); a save
// without a key keeps the saved one and asks fonio nothing; a save names only what it changes; every bad setting is
// refused with its reason before fonio is asked or anything written; fonio refusing or not answering writes nothing;
// the calling hours carry the saver's zone; initDb() creates the table with one row per workspace.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb } = require('../helpers/load-db');
const fonio = require('../../utils/fonio');

const WS = 7;
const KEY  = 'fonio_live_0123456789abcdefABCDEF-wxyz';
const KEY2 = 'fonio_live_9876543210zyxwvuZYXWVU-qrst';

// The one workspace_fonio row as Postgres would hand it back (TIME as HH:MM:SS, JSONB as arrays).
const state = { row: null, calls: [] };
const pool = {
  query: async (sql, params) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: text, params });
    if (/FROM workspace_fonio f LEFT JOIN users u/.test(text)) {
      assert.doesNotMatch(text, /api_key_sealed/, 'reading the settings never reads the sealed key');
      if (!state.row || state.row.workspace_id !== params[0]) return { rows: [] };
      const { api_key_sealed, workspace_id, ...row } = state.row;
      return { rows: [{ ...row, saved_at: '2026-11-06T09:00:00.000Z', saved_by_name: 'Olaf Owner' }] };
    }
    const fields = p => ({
      from_number: p[3], active: p[4], delay_minutes: p[5], on_deal_manual: p[6], on_deal_webhook: p[7],
      country_code: p[8], number_prefixes: JSON.parse(p[9]), hours_on: p[10], hours_days: JSON.parse(p[11]),
      hours_from: `${p[12]}:00`, hours_to: `${p[13]}:00`, hours_tz: p[14], saved_by: p[15],
      follow_up: JSON.parse(p[16]), book_meetings: p[17],
      only_webhooks: p[18] == null ? null : JSON.parse(p[18]), only_pipelines: p[19] == null ? null : JSON.parse(p[19]),   // Part 37: NULL is "all"
    });
    // Part 37: which of the ids in a list belong to this workspace (lead webhooks 5, 6, 7; pipelines 1, 2)
    const own = text.match(/^SELECT id FROM (workspace_webhook|pipelines) WHERE workspace_id = \$1 AND id = ANY\(\$2::int\[\]\)$/);
    if (own) {
      const ids = params[0] === WS ? (own[1] === 'pipelines' ? [1, 2] : [5, 6, 7]) : [];
      return { rows: params[1].filter(id => ids.includes(id)).map(id => ({ id })) };
    }
    // Part 39: the stage table is written on its own, like the variables; pipeline 1 has the stages 11 and 12, pipeline 2 has 21
    if (text === 'UPDATE workspace_fonio SET stage_rules = $2::jsonb WHERE workspace_id = $1') {
      if (state.row?.workspace_id === params[0]) state.row = { ...state.row, stage_rules: JSON.parse(params[1]) };
      return { rowCount: 1, rows: [] };
    }
    if (text === 'SELECT id, pipeline_id FROM pipeline_stages WHERE workspace_id = $1 AND pipeline_id = ANY($2::int[])') {
      const all = params[0] === WS ? [{ id: 11, pipeline_id: 1 }, { id: 12, pipeline_id: 1 }, { id: 21, pipeline_id: 2 }] : [];
      return { rows: all.filter(x => params[1].includes(x.pipeline_id)) };
    }
    if (text === 'UPDATE workspace_fonio SET variables = $2::jsonb WHERE workspace_id = $1') {
      if (state.row?.workspace_id === params[0]) state.row = { ...state.row, variables: JSON.parse(params[1]) };
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith("SELECT 'contact' AS kind, field_key, name FROM custom_fields WHERE workspace_id = $1 UNION ALL SELECT 'deal' AS kind, field_key, name FROM deal_fields WHERE workspace_id = $1")) {
      return { rows: params[0] === WS ? [{ kind: 'contact', field_key: 'eigenkapital', name: 'Eigenkapital' }, { kind: 'deal', field_key: 'budget', name: 'Budget' }] : [] };
    }
    if (text.startsWith('INSERT INTO workspace_fonio')) {
      state.row = { workspace_id: params[0], api_key_sealed: params[1], key_hint: params[2], ...fields(params) };
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('UPDATE workspace_fonio')) {
      if (state.row?.workspace_id === params[0]) {
        state.row = { ...state.row, ...fields(params),
          api_key_sealed: params[1] ?? state.row.api_key_sealed, key_hint: params[2] ?? state.row.key_hint };
      }
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('DELETE FROM workspace_fonio')) { if (state.row?.workspace_id === params[0]) state.row = null; return { rowCount: 1, rows: [] }; }
    return { rows: [] };
  },
};
const writes = () => state.calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

// fonio, faked: the test client's own requests to 127.0.0.1 pass through; every other request is recorded and
// answered from `fon.reply` (a status and body, or { throw: true }).
const realFetch = globalThis.fetch;
const OK = { status: 200, body: { status: 'success', message: 'API key is valid' } };
const fon = { reply: OK, calls: [] };
function fakeFonio() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    fon.calls.push({ url: u, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : null });
    if (fon.reply.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(fon.reply.body ?? {}), { status: fon.reply.status, headers: { 'content-type': 'application/json' } });
  };
}

let owner, admin, member;
before(async () => {
  fakeFonio();
  const build = user => serve({ '/api/integrations/fonio': loadRoute('fonio.js', { pool, user: { workspaceId: WS, ...user } }) });
  owner  = await build({ id: 1, role: 'owner',  timezone: 'Europe/Berlin' });
  admin  = await build({ id: 2, role: 'admin',  timezone: 'Asia/Manila' });
  member = await build({ id: 3, role: 'member', timezone: 'Europe/Berlin' });
});
after(async () => { globalThis.fetch = realFetch; await owner.close(); await admin.close(); await member.close(); });
beforeEach(() => { state.row = null; state.calls.length = 0; fon.reply = OK; fon.calls.length = 0; });

const FIRST = { api_key: KEY, from_number: '+49 30 1234-567' };
const save = (srv, body) => srv.request('PUT', '/api/integrations/fonio', body);

describe('reading', () => {
  test('nothing saved: not configured, the defaults to fill the form, and who may change it', async () => {
    const r = await owner.request('GET', '/api/integrations/fonio');
    assert.equal(r.status, 200);
    assert.equal(r.body.configured, false);
    assert.deepEqual(r.body.settings, {
      from_number: '', active: false, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true,
      country_code: '+49', number_prefixes: [], hours_on: true, hours_days: [1, 2, 3, 4, 5],
      hours_from: '09:00', hours_to: '18:00', hours_tz: 'Europe/Berlin',
      book_meetings: true,
      only_webhooks: null, only_pipelines: null,
      follow_up: { enabled: false, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, callback: true },
    });
    assert.equal(r.body.can_manage, true);
    assert.equal((await member.request('GET', '/api/integrations/fonio')).body.can_manage, false);
  });

  test('saved: everyone sees the settings; only owner and admin see the key\'s last four; nobody the key', async () => {
    await save(owner, FIRST);
    const o = (await owner.request('GET', '/api/integrations/fonio')).body;
    const a = (await admin.request('GET', '/api/integrations/fonio')).body;
    const m = (await member.request('GET', '/api/integrations/fonio')).body;
    assert.equal(o.configured, true);
    assert.equal(o.settings.key_hint, 'wxyz');
    assert.equal(a.settings.key_hint, 'wxyz');
    assert.ok(!('key_hint' in m.settings), 'a member does not see the key hint');
    assert.equal(m.settings.from_number, '+49301234567');
    for (const body of [o, a, m]) assert.ok(!JSON.stringify(body).includes(KEY), 'the key never comes back');
    assert.equal(o.settings.hours_from, '09:00', 'TIME comes back as HH:MM');
  });
});

describe('who may save', () => {
  test('a member: 403, fonio is not asked, nothing written', async () => {
    const r = await save(member, FIRST);
    assert.equal(r.status, 403);
    assert.equal(fon.calls.length, 0);
    assert.deepEqual(writes(), []);
  });
  test('a member cannot remove it either', async () => {
    await save(owner, FIRST);
    assert.equal((await member.request('DELETE', '/api/integrations/fonio')).status, 403);
    assert.ok(state.row, 'still there');
  });
});

describe('the first save', () => {
  test('asks fonio about the key once, in the body, then stores it sealed with its last four', async () => {
    const r = await save(owner, FIRST);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fon.calls.length, 1);
    assert.equal(fon.calls[0].url, 'https://app.fonio.ai/api/public/v1/test-api-key');
    assert.deepEqual(fon.calls[0].body, { apiKey: KEY });
    assert.ok(!('Authorization' in (fon.calls[0].headers || {})), 'the key goes in the body only');
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO workspace_fonio'));
    assert.ok(ins, 'one INSERT');
    assert.equal(ins.params[0], WS);
    assert.notEqual(ins.params[1], KEY, 'the key is sealed before it is bound');
    assert.ok(!JSON.stringify(ins.params).includes(KEY), 'the plain key is bound nowhere');
    assert.match(ins.params[1], /^v1\./, 'the Cal.com sealing');
    assert.equal(ins.params[2], 'wxyz');
    assert.equal(ins.params[15], 1, 'saved_by');
  });

  test('defaults fill what the first save leaves out; the number is compacted; the hours carry the saver\'s zone', async () => {
    await save(admin, FIRST);
    const s = (await owner.request('GET', '/api/integrations/fonio')).body.settings;
    assert.equal(s.from_number, '+49301234567');
    assert.equal(s.active, false, 'saved, but not calling until switched on');
    assert.equal(s.delay_minutes, 5);
    assert.deepEqual([s.on_deal_manual, s.on_deal_webhook], [true, true]);
    assert.equal(s.hours_tz, 'Asia/Manila', "the admin's own zone");
  });

  test('without a key: 400 key_required, fonio not asked, nothing written', async () => {
    const r = await save(owner, { from_number: '+4930123456' });
    assert.equal(r.status, 400);
    assert.equal(r.body.reason, 'key_required');
    assert.equal(fon.calls.length, 0);
    assert.deepEqual(writes(), []);
  });

  test('every setting is checked: each bad value is refused with its reason before fonio is asked', async () => {
    const bad = [
      [{ api_key: 'short' }, 'key_shape'],
      [{ api_key: 'has a space in the middle of it' }, 'key_shape'],
      [{ api_key: 12345678901 }, 'key_shape'],
      [{ from_number: '030 1234567' }, 'from_number'],
      [{ from_number: '+0301234567' }, 'from_number'],
      [{ from_number: '' }, 'from_number'],
      [{ delay_minutes: -1 }, 'delay'],
      [{ delay_minutes: 1.5 }, 'delay'],
      [{ delay_minutes: '5' }, 'delay'],
      [{ delay_minutes: 7 * 24 * 60 + 1 }, 'delay'],
      [{ active: 'yes' }, 'active'],
      [{ on_deal_manual: 1 }, 'on_deal_manual'],
      [{ on_deal_webhook: null }, 'on_deal_webhook'],
      [{ hours_on: 'true' }, 'hours_on'],
      [{ book_meetings: 'yes' }, 'book_meetings'],
      [{ country_code: '49' }, 'country_code'],
      [{ country_code: '+04' }, 'country_code'],
      [{ number_prefixes: '+49' }, 'prefixes'],
      [{ number_prefixes: ['+49', 'abc'] }, 'prefixes'],
      [{ number_prefixes: Array.from({ length: 21 }, (_, i) => `+${i + 1}`) }, 'prefixes'],
      [{ hours_days: [0, 1] }, 'hours_days'],
      [{ hours_days: [8] }, 'hours_days'],
      [{ hours_days: [] }, 'hours_days'],
      [{ hours_from: '9:00' }, 'hours'],
      [{ hours_to: '24:00' }, 'hours'],
      [{ hours_from: '18:00', hours_to: '09:00' }, 'hours'],
      [{ hours_from: '10:00', hours_to: '10:00' }, 'hours'],
      [{ follow_up: null }, 'follow_up'],
      [{ follow_up: 'on' }, 'follow_up'],
      [{ follow_up: [] }, 'follow_up'],
      [{ follow_up: { enabled: 'yes' } }, 'follow_up'],
      [{ follow_up: { enabled: true, no_answer: -1 } }, 'follow_up'],
      [{ follow_up: { enabled: true, voicemail: 7 * 24 * 60 + 1 } }, 'follow_up'],
      [{ follow_up: { enabled: true, busy: 1.5 } }, 'follow_up'],
      [{ follow_up: { enabled: true, max_attempts: 4 } }, 'follow_up'],
    ];
    for (const [change, reason] of bad) {
      const r = await save(owner, { ...FIRST, ...change });
      assert.equal(r.status, 400, `${JSON.stringify(change)} → ${r.status}`);
      assert.equal(r.body.reason, reason, JSON.stringify(change));
    }
    assert.equal(fon.calls.length, 0, 'fonio was never asked');
    assert.deepEqual(writes(), []);
  });

  test('with the hours off, an empty day list is fine', async () => {
    const r = await save(owner, { ...FIRST, hours_on: false, hours_days: [] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  test('book_meetings is on until switched off, and only a save changes it (Part 34)', async () => {
    const first = await save(owner, FIRST);
    assert.equal(first.body.settings.book_meetings, true, 'on by default: the CRM books the agreed meeting');
    const off = await save(admin, { book_meetings: false });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.settings.book_meetings, false);
    assert.equal(state.row.book_meetings, false, 'kept on the row');
    assert.equal((await member.request('GET', '/api/integrations/fonio')).body.settings.book_meetings, false, 'everyone reads it');
    assert.equal((await save(owner, { delay_minutes: 20 })).body.settings.book_meetings, false, 'a save without it keeps it off');
    assert.equal((await save(owner, { book_meetings: true })).body.settings.book_meetings, true);
  });

  test('number starts and days are tidied: spaces out, duplicates out, days in order', async () => {
    await save(owner, { ...FIRST, number_prefixes: ['+49 15', '+4915', ' 0171 ', '', '+43'], hours_days: [5, 1, 3, 1] });
    const s = (await owner.request('GET', '/api/integrations/fonio')).body.settings;
    assert.deepEqual(s.number_prefixes, ['+4915', '0171', '+43']);
    assert.deepEqual(s.hours_days, [1, 3, 5]);
  });
});

describe('fonio says no, or does not answer', () => {
  const cases = [
    ['refuses the key (401)', { status: 401, body: { message: 'Invalid API key' } }, 400, 'key'],
    ['answers 200 with status error', { status: 200, body: { status: 'error', message: 'Key revoked' } }, 400, 'key'],
    ['is busy (429)', { status: 429, body: { message: 'Too many requests' } }, 502, 'refused'],
    ['fails (500)', { status: 500, body: {} }, 502, 'refused'],
    ['cannot be reached', { throw: true }, 502, 'unreachable'],
  ];
  for (const [name, reply, status, reason] of cases) {
    test(`fonio ${name}: ${status} ${reason}, nothing written`, async () => {
      fon.reply = reply;
      const r = await save(owner, FIRST);
      assert.equal(r.status, status);
      assert.equal(r.body.reason, reason);
      assert.deepEqual(writes(), []);
    });
  }

  test('a fonio message quoting the key never carries it back', async () => {
    fon.reply = { status: 401, body: { message: `Key ${KEY} is not valid` } };
    const r = await save(owner, FIRST);
    assert.equal(r.status, 400);
    assert.ok(!r.body.error.includes(KEY));
    assert.match(r.body.error, /Key … is not valid/);
  });
});

describe('later saves', () => {
  test('without a key: the saved key stays, fonio is not asked, only what was sent changes', async () => {
    await save(owner, { ...FIRST, delay_minutes: 15, number_prefixes: ['+49'] });
    const sealed = state.row.api_key_sealed;
    fon.calls.length = 0; state.calls.length = 0;
    const r = await save(owner, { active: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fon.calls.length, 0, 'no key, no question to fonio');
    const upd = state.calls.find(c => c.sql.startsWith('UPDATE workspace_fonio'));
    assert.equal(upd.params[1], null, 'no new sealed key bound');
    // the fake keeps the old key by itself, so the statement must say it too (the real column is NOT NULL)
    assert.match(upd.sql, /api_key_sealed = COALESCE\(\$2, api_key_sealed\), key_hint = COALESCE\(\$3, key_hint\)/);
    assert.equal(state.row.api_key_sealed, sealed, 'the key kept');
    assert.equal(r.body.settings.active, true);
    assert.equal(r.body.settings.delay_minutes, 15, 'kept');
    assert.deepEqual(r.body.settings.number_prefixes, ['+49'], 'kept');
    assert.ok(!state.calls.some(c => c.sql.startsWith('INSERT')), 'an UPDATE, not a second row');
  });

  test('a new key replaces the old one after fonio has said yes to it', async () => {
    await save(owner, FIRST);
    fon.calls.length = 0;
    const r = await save(owner, { api_key: KEY2 });
    assert.equal(r.status, 200);
    assert.deepEqual(fon.calls.map(c => c.body), [{ apiKey: KEY2 }]);
    assert.equal(r.body.settings.key_hint, 'qrst');
  });

  test('the zone changes only when the hours are saved', async () => {
    await save(owner, FIRST);                                     // Berlin
    await save(admin, { delay_minutes: 30 });                     // Manila, no hours sent
    assert.equal(state.row.hours_tz, 'Europe/Berlin');
    await save(admin, { hours_from: '08:00' });                   // Manila, hours sent
    assert.equal(state.row.hours_tz, 'Asia/Manila');
  });

  test('removing it: gone, and the answer is the unconfigured one', async () => {
    await save(owner, FIRST);
    const r = await admin.request('DELETE', '/api/integrations/fonio');
    assert.equal(r.status, 200);
    assert.equal(r.body.configured, false);
    assert.equal(state.row, null);
  });
});

// ── Part 33: trying again after a call that reached nobody ──────────────────
describe('trying again after a call that reached nobody (Part 33)', () => {
  const POLICY = { enabled: true, no_answer: 30, voicemail: 720, busy: 15, max_attempts: 2, callback: true };
  test('the policy is saved with the settings, read back by everyone, on the row as it was sent', async () => {
    const r = await save(owner, { ...FIRST, follow_up: POLICY });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.settings.follow_up, POLICY);
    assert.deepEqual((await member.request('GET', '/api/integrations/fonio')).body.settings.follow_up, POLICY);
    assert.deepEqual(state.row.follow_up, POLICY);
  });
  test('off until it is saved: a connection saved without it answers the defaults', async () => {
    const r = await save(owner, FIRST);
    assert.deepEqual(r.body.settings.follow_up, { enabled: false, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, callback: true });
  });
  test('a later save names only what it changes: the switch alone keeps the delays', async () => {
    await save(owner, { ...FIRST, follow_up: POLICY });
    const r = await save(admin, { follow_up: { enabled: false } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.settings.follow_up, { ...POLICY, enabled: false });
  });
  test('the callback switch (Part 35): on by default, saved off on its own, kept by a save that does not name it, refused unless true or false', async () => {
    await save(owner, FIRST);
    const off = await save(admin, { follow_up: { callback: false } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.deepEqual(off.body.settings.follow_up, { enabled: false, no_answer: 120, voicemail: 1440, busy: 120, max_attempts: 1, callback: false });
    assert.equal(state.row.follow_up.callback, false);
    const later = await save(admin, { follow_up: { enabled: true } });
    assert.equal(later.body.settings.follow_up.callback, false, 'a save that names only the retry switch leaves the callback switch');
    assert.equal((await member.request('GET', '/api/integrations/fonio')).body.settings.follow_up.callback, false, 'everyone reads it');
    const bad = await save(admin, { follow_up: { callback: 'no' } });
    assert.equal(bad.status, 400); assert.equal(bad.body.reason, 'follow_up');
    assert.equal(state.row.follow_up.callback, false, 'nothing written');
  });
});

describe('utils/fonio.js', () => {
  test('compactNumber drops what people type around digits', () => {
    assert.equal(fonio.compactNumber(' +49 (0)30 / 12.34-56 '), '+49030123456');
    assert.equal(fonio.compactNumber(null), '');
  });
  test('isE164: + and 7 to 15 digits, no 0 after the +', () => {
    for (const ok of ['+4930123456', '+491711234567', '+1234567']) assert.ok(fonio.isE164(ok), ok);
    for (const no of ['4930123456', '+049301234', '+123456', '+1234567890123456', '+49 30 123', 4930123456]) assert.ok(!fonio.isE164(no), String(no));
  });
});

describe('the table', () => {
  test('initDb() creates workspace_fonio, one row per workspace, removed with the workspace', async () => {
    const dbPool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    await loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), dbPool).initDb();
    const create = dbPool.find(/CREATE TABLE IF NOT EXISTS workspace_fonio \(/);
    assert.ok(create, 'created');
    assert.match(create.sql, /workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(create.sql, /api_key_sealed TEXT NOT NULL/);
    assert.match(create.sql, /active BOOLEAN NOT NULL DEFAULT false/);
  });
});

describe("the workspace's own variables for the prompt (Part 13)", () => {
  const VARS = [{ name: 'vorname', source: 'value:first_name' }, { name: 'spanne', source: 'contact_field:eigenkapital' }];
  const varWrites = () => state.calls.filter(c => c.sql === 'UPDATE workspace_fonio SET variables = $2::jsonb WHERE workspace_id = $1');

  test('saved with the settings, read back by everyone; nothing sent keeps them; an empty list clears them', async () => {
    const r = await save(owner, { ...FIRST, variables: VARS });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.settings.variables, VARS);
    assert.deepEqual(varWrites().map(c => c.params), [[WS, JSON.stringify(VARS)]]);
    assert.deepEqual((await member.request('GET', '/api/integrations/fonio')).body.settings.variables, VARS);

    state.calls.length = 0;
    const kept = await save(admin, { delay_minutes: 9 });
    assert.deepEqual(kept.body.settings.variables, VARS);
    assert.equal(varWrites().length, 0, 'a save that does not name them does not write them');

    assert.deepEqual((await save(owner, { variables: [] })).body.settings.variables, []);
  });

  test('a bad list is refused with its reason before fonio is asked or anything is written', async () => {
    for (const variables of ['x', [{ name: 'Vorname Nachname', source: 'value:name' }], [{ name: 'crm_call_id', source: 'value:name' }],
      [{ name: 'a', source: 'value:nope' }], [{ name: 'a', source: 'value:name' }, { name: 'a', source: 'value:email' }]]) {
      const r = await save(owner, { ...FIRST, variables });
      assert.equal(r.status, 400, JSON.stringify(variables));
      assert.equal(r.body.reason, 'variables');
    }
    assert.equal(fon.calls.length, 0);
    assert.deepEqual(writes(), []);
  });

  test('a member cannot save them', async () => {
    await save(owner, FIRST);
    state.calls.length = 0;
    assert.equal((await save(member, { variables: VARS })).status, 403);
    assert.deepEqual(writes(), []);
  });

  test('never connected: an empty list', async () => {
    assert.equal((await owner.request('GET', '/api/integrations/fonio')).body.settings.variables, undefined);
    await save(owner, FIRST);
    assert.deepEqual((await owner.request('GET', '/api/integrations/fonio')).body.settings.variables, []);
  });

  test('initDb adds the column, empty for every row', () => {
    const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    assert.match(dbSrc, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });
});

describe('what a variable can be connected to (Part 14)', () => {
  test("owner and admin get the built-in values and this workspace's custom fields; a member does not", async () => {
    const r = await owner.request('GET', '/api/integrations/fonio/sources');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { values: require('../../utils/fonio-calls').VALUE_SOURCES,
      contact_fields: [{ key: 'eigenkapital', name: 'Eigenkapital' }], deal_fields: [{ key: 'budget', name: 'Budget' }] });
    assert.deepEqual(state.calls.at(-1).params, [WS], "asked for the caller's workspace");
    assert.equal((await admin.request('GET', '/api/integrations/fonio/sources')).status, 200);
    assert.equal((await member.request('GET', '/api/integrations/fonio/sources')).status, 403);
  });
});

// Who gets the call (Part 37): two lists on the connection, each null for "all" or the ids fonio is limited to.
// In the fake, this workspace has the lead webhooks 5, 6, 7 and the pipelines 1, 2. What the lists then do to a new
// deal is in fonio-who.test.js.
describe('who gets the call (Part 37)', () => {
  const who = body => [body.settings.only_webhooks, body.settings.only_pipelines];
  const asks = () => state.calls.filter(c => /^SELECT id FROM (workspace_webhook|pipelines) WHERE workspace_id = \$1 AND id = ANY/.test(c.sql));

  test('a new connection calls all: both lists are null, and nothing is asked about them', async () => {
    const r = await save(owner, FIRST);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(who(r.body), [null, null]);
    assert.deepEqual([state.row.only_webhooks, state.row.only_pipelines], [null, null], 'NULL on the row, not an empty list');
    assert.deepEqual(asks(), []);
  });

  test('a connection saved before the columns existed reads as all', async () => {
    await save(owner, FIRST);
    delete state.row.only_webhooks; delete state.row.only_pipelines;
    assert.deepEqual(who((await owner.request('GET', '/api/integrations/fonio')).body), [null, null]);
    assert.deepEqual(who((await save(owner, { delay_minutes: 9 })).body), [null, null], 'and a save of something else keeps it so');
  });

  test('a list is saved tidied (each id once, in order) and everyone reads it', async () => {
    await save(owner, FIRST);
    const r = await save(admin, { only_webhooks: [6, 5, 6], only_pipelines: [2] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(who(r.body), [[5, 6], [2]]);
    assert.deepEqual([state.row.only_webhooks, state.row.only_pipelines], [[5, 6], [2]]);
    assert.deepEqual(who((await member.request('GET', '/api/integrations/fonio')).body), [[5, 6], [2]]);
  });

  test('the ids are looked up in the saver\'s own workspace', async () => {
    await save(owner, FIRST);
    await save(owner, { only_webhooks: [5], only_pipelines: [1, 2] });
    assert.deepEqual(asks().map(c => [c.sql.match(/FROM (\w+)/)[1], c.params]), [['workspace_webhook', [WS, [5]]], ['pipelines', [WS, [1, 2]]]]);
  });

  test('a save that does not name a list keeps it, and asks nothing about it', async () => {
    await save(owner, { ...FIRST, only_webhooks: [5], only_pipelines: [1] });
    state.calls.length = 0;
    const r = await save(owner, { active: true });
    assert.deepEqual(who(r.body), [[5], [1]]);
    assert.deepEqual(asks(), [], 'a saved list is not checked again: a webhook deleted since must not block the switch');
  });

  test('one list can change without the other', async () => {
    await save(owner, { ...FIRST, only_webhooks: [5], only_pipelines: [1] });
    assert.deepEqual(who((await save(owner, { only_pipelines: [1, 2] })).body), [[5], [1, 2]]);
  });

  test('null sets a list back to all', async () => {
    await save(owner, { ...FIRST, only_webhooks: [5], only_pipelines: [1] });
    const r = await save(owner, { only_webhooks: null });
    assert.deepEqual(who(r.body), [null, [1]]);
    assert.equal(state.row.only_webhooks, null);
  });

  test('refused with the list\'s name: an empty list, a wrong shape, ids that are not whole numbers', async () => {
    await save(owner, FIRST);
    for (const k of ['only_webhooks', 'only_pipelines']) {
      for (const bad of [[], 'all', 5, {}, [1.5], ['1'], [0], [-3]]) {
        state.calls.length = 0;
        const r = await save(owner, { [k]: bad });
        assert.equal(r.status, 400, `${k}: ${JSON.stringify(bad)}`);
        assert.equal(r.body.reason, k);
        assert.deepEqual(writes(), [], 'nothing is written');
      }
    }
  });

  test('refused: an id that is not this workspace\'s own lead webhook or pipeline', async () => {
    await save(owner, FIRST);
    state.calls.length = 0;
    const w = await save(owner, { only_webhooks: [5, 99] });
    assert.equal(w.status, 400); assert.equal(w.body.reason, 'only_webhooks');
    const p = await save(owner, { only_pipelines: [3] });
    assert.equal(p.status, 400); assert.equal(p.body.reason, 'only_pipelines');
    const mixed = await save(owner, { only_webhooks: [1], only_pipelines: [1] });   // 1 is a pipeline, not a lead webhook
    assert.equal(mixed.status, 400); assert.equal(mixed.body.reason, 'only_webhooks');
    assert.deepEqual(writes(), []);
    assert.deepEqual([state.row.only_webhooks, state.row.only_pipelines], [null, null]);
  });

  test('the lists can come with the first save; fonio is still asked about the key only after they hold', async () => {
    const bad = await save(owner, { ...FIRST, only_pipelines: [3] });
    assert.equal(bad.status, 400);
    assert.equal(fon.calls.length, 0, 'fonio is not asked when the save is refused anyway');
    const ok = await save(owner, { ...FIRST, only_pipelines: [1] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(who(ok.body), [null, [1]]);
  });

  test('a member reads the lists and cannot change them', async () => {
    await save(owner, { ...FIRST, only_pipelines: [1] });
    assert.equal((await save(member, { only_pipelines: null })).status, 403);
    assert.deepEqual(state.row.only_pipelines, [1]);
  });

  test('the statements carry both lists as JSONB, and the table name is never taken from the request', () => {
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'fonio.js'), 'utf8');
    assert.match(src, /only_webhooks = \$19::jsonb, only_pipelines = \$20::jsonb, saved_at = NOW\(\)/);
    assert.match(src, /only_webhooks = EXCLUDED\.only_webhooks, only_pipelines = EXCLUDED\.only_pipelines, saved_at = NOW\(\)/);
    assert.match(src, /only_webhooks:  \{ table: 'workspace_webhook', what: 'Lead webhooks' \},\s*only_pipelines: \{ table: 'pipelines',         what: 'Pipelines' \},/);
    assert.match(src, /`SELECT id FROM \$\{WHO\[key\]\.table\} WHERE workspace_id = \$1 AND id = ANY\(\$2::int\[\]\)`, \[wid, ids\]/);
    assert.match(src, /for \(const k of fonioCalls\.WHO_KEYS\) \{\s*if \(body\[k\] === undefined \|\| s\[k\] === null\) continue;/);
  });
});

// The deal after the call (Part 39): the table of stage and urgency per pipeline and event. In the fake, pipeline 1 has
// the stages 11 and 12, pipeline 2 has 21. What the table then does to a deal is in fonio-stage.test.js and
// fonio-receive.test.js.
describe('the deal after the call: the table (Part 39)', () => {
  const TABLE = { 1: { interested: { stage_id: 12, urgency: 3 }, not_reached: { stage_id: 11, urgency: null } }, 2: { not_interested: { stage_id: null, urgency: 0 } } };
  const tableWrites = () => state.calls.filter(c => c.sql === 'UPDATE workspace_fonio SET stage_rules = $2::jsonb WHERE workspace_id = $1');

  test('a new connection has an empty table, and nothing is written for it', async () => {
    const r = await save(owner, FIRST);
    assert.deepEqual(r.body.settings.stage_rules, {});
    assert.deepEqual(tableWrites(), []);
  });

  test('the table is saved as sent, tidied, and everyone reads it', async () => {
    await save(owner, FIRST);
    const r = await save(admin, { stage_rules: { ...TABLE, 1: { ...TABLE[1], callback: { stage_id: null, urgency: null }, wrong_person: null } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.settings.stage_rules, TABLE, 'lines that leave both as they are are not kept');
    assert.deepEqual(state.row.stage_rules, TABLE);
    assert.deepEqual((await member.request('GET', '/api/integrations/fonio')).body.settings.stage_rules, TABLE);
  });

  test('a save that does not send the table keeps it; the table alone can be sent', async () => {
    await save(owner, { ...FIRST, stage_rules: TABLE });
    state.calls.length = 0;
    assert.deepEqual((await save(owner, { delay_minutes: 9 })).body.settings.stage_rules, TABLE);
    assert.deepEqual(tableWrites(), [], 'not written again');
    const one = { 1: { interested: { stage_id: 11, urgency: null } } };
    assert.deepEqual((await save(owner, { stage_rules: one })).body.settings.stage_rules, one, 'replaced as a whole');
  });

  test('an empty table clears it', async () => {
    await save(owner, { ...FIRST, stage_rules: TABLE });
    assert.deepEqual((await save(owner, { stage_rules: {} })).body.settings.stage_rules, {});
    assert.deepEqual(state.row.stage_rules, {});
  });

  test('refused with its reason, nothing written: a wrong shape, an unknown event, a value out of range', async () => {
    await save(owner, FIRST);
    for (const bad of ['x', [], { 1: { reached: { stage_id: 11 } } }, { 1: { interested: { stage_id: '11' } } }, { 1: { interested: { urgency: 9 } } }, { abc: {} }]) {
      state.calls.length = 0;
      const r = await save(owner, { stage_rules: bad });
      assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.body.reason, 'stage_rules');
      assert.deepEqual(writes(), []);
    }
  });

  test('refused: a pipeline of another workspace, a stage that does not exist, a stage of another pipeline', async () => {
    await save(owner, FIRST);
    for (const bad of [{ 3: { interested: { stage_id: 11 } } }, { 1: { interested: { stage_id: 99 } } }, { 1: { interested: { stage_id: 21 } } }, { 2: { interested: { stage_id: 12 } } }]) {
      state.calls.length = 0;
      const r = await save(owner, { stage_rules: bad });
      assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.body.reason, 'stage_rules');
      assert.deepEqual(writes(), []);
    }
    assert.deepEqual(state.row.stage_rules ?? {}, {});
  });

  test('a line that only sets the urgency needs no stage lookup to pass', async () => {
    await save(owner, FIRST);
    const r = await save(owner, { stage_rules: { 2: { callback: { urgency: 2 } } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.settings.stage_rules, { 2: { callback: { stage_id: null, urgency: 2 } } });
  });

  test('a member reads the table and cannot change it', async () => {
    await save(owner, { ...FIRST, stage_rules: TABLE });
    assert.equal((await save(member, { stage_rules: {} })).status, 403);
    assert.deepEqual(state.row.stage_rules, TABLE);
  });

  test('a refused table stops the whole save: the rest of the form is not written either', async () => {
    await save(owner, FIRST);
    state.calls.length = 0;
    const r = await save(owner, { delay_minutes: 42, stage_rules: { 1: { interested: { stage_id: 99 } } } });
    assert.equal(r.status, 400);
    assert.equal(state.row.delay_minutes, 5);
  });
});
