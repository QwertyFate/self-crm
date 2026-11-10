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
    });
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
