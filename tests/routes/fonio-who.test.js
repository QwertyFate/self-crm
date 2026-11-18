// ROUTE tests: who gets fonio's call (FONIO_CHANGES Part 37).
//
// Until now one switch covered every lead webhook together, and no rule looked at the pipeline. With up to five lead
// webhooks a workspace decides per list:
//   workspace_fonio.only_webhooks   NULL = all lead webhooks, or the ids fonio is limited to
//   workspace_fonio.only_pipelines  NULL = all pipelines,     or the ids fonio is limited to
// "All" is what it was before and includes webhooks and pipelines added later; in a list, a new one is not called
// until it is added. The pipeline rule covers every new deal (by hand or through a webhook), the webhook rule the
// leads. A deal that is not allowed gets no call and no row in the history, exactly like a trigger that is off.
//
// Here: the real scheduleForDeal with a small fake database, the lead receiver handing over its webhook, and the
// columns. The settings route is covered in fonio-settings.test.js.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const fonioCalls = require('../../utils/fonio-calls');

const WS = 7, NOW = new Date('2026-11-18T10:00:00Z');
const db = { conn: null, deals: new Map(), calls: [], log: [] };
const pool = {
  query: async (sql, p = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    db.log.push(t);
    if (t === 'SELECT * FROM workspace_fonio WHERE workspace_id = $1') return { rows: db.conn && p[0] === WS ? [db.conn] : [] };
    if (t.startsWith('SELECT d.id, d.contact_id, d.pipeline_id, c.phone FROM deals d')) {
      const d = db.deals.get(p[0]); return { rows: d && p[1] === WS ? [d] : [] };
    }
    if (t.startsWith('SELECT id FROM fonio_calls WHERE workspace_id = $1 AND contact_id = $2')) return { rows: [] };
    if (t.startsWith('INSERT INTO fonio_calls (workspace_id, deal_id, contact_id, trigger, status, reason, raw_number, to_number, due_at)')) {
      const row = { id: db.calls.length + 1, deal_id: p[1], trigger: p[3], status: p[4], reason: p[5], due_at: p[8] };
      db.calls.push(row); return { rows: [row] };
    }
    throw new Error(`unexpected statement: ${t}`);
  },
};
beforeEach(() => {
  db.conn = { workspace_id: WS, active: true, on_deal_manual: true, on_deal_webhook: true, delay_minutes: 5, country_code: '+49',
    number_prefixes: [], hours_on: false, hours_days: [1, 2, 3, 4, 5], hours_from: '09:00:00', hours_to: '18:00:00', hours_tz: 'Europe/Berlin',
    only_webhooks: null, only_pipelines: null };
  db.deals = new Map([
    [100, { id: 100, contact_id: 10, pipeline_id: 1, phone: '0151 1234567' }],   // Sales
    [101, { id: 101, contact_id: 11, pipeline_id: 2, phone: '0151 7654321' }],   // Partners
    [102, { id: 102, contact_id: 12, pipeline_id: null, phone: '0151 1112223' }],
    [103, { id: 103, contact_id: 13, pipeline_id: 2, phone: null }],             // Partners, no number
  ]);
  db.calls = []; db.log = [];
});
const byHand  = dealId => fonioCalls.scheduleForDeal(pool, { workspaceId: WS, dealId, trigger: 'deal_manual', now: NOW });
const byHook  = (dealId, webhookId) => fonioCalls.scheduleForDeal(pool, { workspaceId: WS, dealId, trigger: 'deal_webhook', webhookId, now: NOW });
const nothing = async p => { assert.equal(await p, null); assert.deepEqual(db.calls, [], 'no call and no row in the history'); };

describe('all (nothing chosen): as before', () => {
  test('every pipeline and every lead webhook is called', async () => {
    assert.equal((await byHand(100)).status, 'scheduled');
    assert.equal((await byHand(101)).status, 'scheduled');
    assert.equal((await byHook(102, 5)).status, 'scheduled', 'also a deal without a pipeline');
    assert.equal(db.calls.length, 3);
  });
  test('a connection saved before the lists existed (no such columns on the row) is "all"', async () => {
    delete db.conn.only_webhooks; delete db.conn.only_pipelines;
    assert.equal((await byHook(101, 9)).status, 'scheduled');
  });
  test('a caller that names no webhook is still called while all webhooks are', async () => {
    assert.equal((await fonioCalls.scheduleForDeal(pool, { workspaceId: WS, dealId: 100, trigger: 'deal_webhook', now: NOW })).status, 'scheduled');
  });
});

describe('only these pipelines', () => {
  beforeEach(() => { db.conn.only_pipelines = [1]; });

  test('a deal made by hand in a chosen pipeline is called', async () => {
    assert.equal((await byHand(100)).status, 'scheduled');
  });
  test('a deal made by hand in another pipeline: nothing', async () => { await nothing(byHand(101)); });
  test('a deal without a pipeline: nothing', async () => { await nothing(byHand(102)); });
  test('the rule covers leads too: a webhook that puts its lead into another pipeline is not called', async () => {
    await nothing(byHook(101, 5));
    assert.equal((await byHook(100, 5)).status, 'scheduled');
  });
  test('a deal that is not allowed leaves no "skipped" row either, even without a number', async () => { await nothing(byHand(103)); });
  test('with all pipelines, that same deal is kept as skipped, as before', async () => {
    db.conn.only_pipelines = null;
    const row = await byHand(103);
    assert.deepEqual([row.status, row.reason], ['skipped', 'no_phone']);
  });
  test('ids as Postgres or an older save may hand them back (text) still match', async () => {
    db.conn.only_pipelines = ['1'];
    await nothing(byHand(101));
    assert.equal((await byHand(100)).status, 'scheduled');
  });
  test('a list whose pipelines were all deleted matches nothing', async () => {
    db.conn.only_pipelines = [99];
    await nothing(byHand(100));
  });
});

describe('only these lead webhooks', () => {
  beforeEach(() => { db.conn.only_webhooks = [5, 6]; });

  test('a lead through a chosen webhook is called', async () => {
    assert.equal((await byHook(100, 5)).status, 'scheduled');
    assert.equal((await byHook(101, 6)).status, 'scheduled');
  });
  test('a lead through another webhook: nothing, and the deal is not even read', async () => {
    await nothing(byHook(100, 7));
    assert.ok(!db.log.some(s => s.startsWith('SELECT d.id')), 'decided before the deal is looked up');
  });
  test('a lead whose webhook is not named: nothing', async () => {
    await nothing(fonioCalls.scheduleForDeal(pool, { workspaceId: WS, dealId: 100, trigger: 'deal_webhook', now: NOW }));
  });
  test('deals made by hand are not touched by the webhook list', async () => {
    assert.equal((await byHand(100)).status, 'scheduled');
    assert.equal((await byHand(101)).status, 'scheduled');
  });
});

describe('both lists: both must allow', () => {
  beforeEach(() => { db.conn.only_webhooks = [5]; db.conn.only_pipelines = [1]; });

  test('chosen webhook, chosen pipeline: called', async () => { assert.equal((await byHook(100, 5)).status, 'scheduled'); });
  test('chosen webhook, other pipeline: nothing', async () => { await nothing(byHook(101, 5)); });
  test('other webhook, chosen pipeline: nothing', async () => { await nothing(byHook(100, 6)); });
});

describe('the switches still come first', () => {
  test('a trigger that is off calls nobody, whatever the lists say', async () => {
    db.conn.on_deal_webhook = false; db.conn.only_webhooks = [5];
    await nothing(byHook(100, 5));
    db.conn.on_deal_manual = false; db.conn.only_pipelines = [1];
    await nothing(byHand(100));
  });
  test('a connection that is switched off calls nobody', async () => {
    db.conn.active = false;
    await nothing(byHand(100));
  });
});

describe('checkWho: the shape of a list', () => {
  test('null (and nothing) is "all"', () => {
    assert.deepEqual(fonioCalls.checkWho(null), { value: null });
    assert.deepEqual(fonioCalls.checkWho(undefined), { value: null });
  });
  test('a list is tidied: each id once, in order', () => {
    assert.deepEqual(fonioCalls.checkWho([6, 2, 6, 4]), { value: [2, 4, 6] });
  });
  test('refused: an empty list, anything that is not a list, ids that are not whole positive numbers, too many', () => {
    for (const bad of [[], 'all', 5, {}, true, [1.5], ['3'], [0], [-1], [null], Array.from({ length: fonioCalls.WHO_MAX + 1 }, (_, i) => i + 1)]) {
      assert.ok(fonioCalls.checkWho(bad).error, JSON.stringify(bad).slice(0, 40));
      assert.ok(!('value' in fonioCalls.checkWho(bad)));
    }
    assert.ok(fonioCalls.checkWho(Array.from({ length: fonioCalls.WHO_MAX }, (_, i) => i + 1)).value);
  });
  test('the two lists are named once', () => {
    assert.deepEqual(fonioCalls.WHO_KEYS, ['only_webhooks', 'only_pipelines']);
  });
});

describe('the lead receiver and the deal route say who is asking', () => {
  test('a lead hands over the webhook it came through', () => {
    assert.match(read('routes/integrations.js'), /await fonioCalls\.scheduleForDeal\(pool, \{ workspaceId: wid, dealId, trigger: 'deal_webhook', webhookId: wh\.id \}\)/);
  });
  test('a deal made by hand names none', () => {
    assert.match(read('routes/deals.js'), /await fonioCalls\.scheduleForDeal\(pool, \{ workspaceId: req\.workspaceId, dealId: row\.id, trigger: 'deal_manual' \}\)/);
  });
});

describe('db.js', () => {
  const src = read('db.js');
  test('two plain lists on the connection, NULL until something is chosen, added to a table that already exists', () => {
    assert.match(src, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS only_webhooks JSONB`\)/);
    assert.match(src, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS only_pipelines JSONB`\)/);
    assert.doesNotMatch(src, /only_(webhooks|pipelines) JSONB (NOT NULL|DEFAULT)/, 'no default: NULL is "all"');
  });
});
