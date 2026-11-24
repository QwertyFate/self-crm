// UNIT tests for utils/facebook-leads.js (FACEBOOK_CHANGES Part 3, 2026-11-24): what becomes of a lead that
// Facebook announced — claimed once, fetched with the Page's own token, handed to the lead webhook of the workspace
// the Page was given to.
//
// The database is a stand-in that knows the module's five statements and no others, and keeps the leads as rows —
// with the claim's own rule (a new lead, a failed one, or one left "working" for two minutes). Facebook and the lead
// webhook's delivery are functions handed in, as the module takes them.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const { sealKey } = require('../../utils/calcom');
const { FacebookError } = require('../../utils/facebook');
const leads = require('../../utils/facebook-leads');

const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
const CLAIM = flat(leads.CLAIM), FINISH = flat(leads.FINISH);
const state = { rows: new Map(), pages: [], hooks: [], sql: [], broken: null, clock: 0 };
const pool = { query: async (sql, p) => {
  const t = flat(sql);
  state.sql.push({ sql: t, params: p });
  if (state.broken && state.broken(t)) throw new Error('the database is away');
  if (t === CLAIM) {
    const old = state.rows.get(p[0]);
    if (!old) { state.rows.set(p[0], { leadgen_id: p[0], page_id: p[1], form_id: p[2], status: 'working', tries: 1, claimed: state.clock, workspace_id: null, webhook_id: null, reason: null, detail: null, contact_id: null, deal_id: null }); return { rows: [{ leadgen_id: p[0] }] }; }
    if (old.status === 'failed' || (old.status === 'working' && old.claimed < state.clock - 120)) { Object.assign(old, { status: 'working', claimed: state.clock, tries: old.tries + 1 }); return { rows: [{ leadgen_id: p[0] }] }; }
    return { rows: [] };
  }
  if (t === 'SELECT status FROM facebook_leads WHERE leadgen_id = $1') return { rows: state.rows.has(p[0]) ? [{ status: state.rows.get(p[0]).status }] : [] };
  if (t === 'SELECT page_id, page_name, workspace_id, webhook_id, token FROM facebook_pages WHERE page_id = $1') return { rows: state.pages.filter(g => g.page_id === p[0]) };
  if (t === 'SELECT * FROM workspace_webhook WHERE id = $1 AND workspace_id = $2') return { rows: state.hooks.filter(h => h.id === p[0] && h.workspace_id === p[1]) };
  if (t === FINISH) { Object.assign(state.rows.get(p[0]), { status: p[1], reason: p[2], detail: p[3], workspace_id: p[4], webhook_id: p[5], contact_id: p[6], deal_id: p[7] }); return { rows: [], rowCount: 1 }; }
  throw new Error(`a statement nobody expected: ${t}`);
} };

const LEAD = { id: '900', created_time: '2026-11-24T09:00:00+0000', field_data: [{ name: 'email', values: ['ada@example.de'] }], form_id: '12', campaign_name: 'Herbst' };
const EV = { leadgenId: '900', pageId: '100', formId: '12' };
let fetched, delivered, fetchLead, deliver;
const row = (id = '900') => state.rows.get(id);
const take = (ev = EV) => leads.take(pool, ev, { deliver, fetchLead });
beforeEach(() => {
  Object.assign(state, { rows: new Map(), sql: [], broken: null, clock: 1000,
    pages: [{ page_id: '100', page_name: 'Müller Immobilien', workspace_id: 7, webhook_id: 70, token: sealKey('PAGE-TOKEN-100') }],
    hooks: [{ id: 70, workspace_id: 7, name: 'Facebook', active: true, test_until: null }, { id: 80, workspace_id: 8, name: 'Other', active: true, test_until: null }] });
  fetched = []; delivered = [];
  fetchLead = async (id, token) => { fetched.push([id, token]); return LEAD; };
  deliver = async (wh, payload) => { delivered.push([wh, payload]); return { kind: 'lead', contactId: 55, dealId: 66 }; };
});

describe('a lead of a Page that was given to a workspace', () => {
  test('is fetched with the Page\'s own token and handed to that workspace\'s lead webhook — the lead as Facebook has it, and the Page', async () => {
    assert.deepEqual(await take(), { status: 'done', reason: null, retry: false });
    assert.deepEqual(fetched, [['900', 'PAGE-TOKEN-100']], 'the sealed token is opened for Facebook only');
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0][0], state.hooks[0], 'the whole row of the lead webhook');
    assert.deepEqual(delivered[0][1], { ...LEAD, page_id: '100', page_name: 'Müller Immobilien' });
    assert.deepEqual(row(), { leadgen_id: '900', page_id: '100', form_id: '12', status: 'done', tries: 1, claimed: 1000, workspace_id: 7, webhook_id: 70, reason: null, detail: null, contact_id: 55, deal_id: 66 });
  });
  test('in this order: claimed, the Page, its webhook, Facebook, the delivery, the end written', async () => {
    const order = [];
    fetchLead = async () => { order.push('facebook'); return LEAD; };
    deliver = async () => { order.push('deliver'); return { kind: 'lead', contactId: 1, dealId: null }; };
    await take();
    assert.deepEqual(state.sql.map(q => q.sql.split(' ').slice(0, 4).join(' ')), ['INSERT INTO facebook_leads (leadgen_id,', 'SELECT page_id, page_name, workspace_id,', 'SELECT * FROM workspace_webhook', 'UPDATE facebook_leads SET status']);
    assert.deepEqual(order, ['facebook', 'deliver']);
    assert.deepEqual(state.sql[0].params, ['900', '100', '12']);
    assert.deepEqual(state.sql[2].params, [70, 7], 'the webhook must be that workspace\'s own');
    assert.equal(row().deal_id, null, 'a webhook that makes no deal: none is noted');
    assert.deepEqual((await leads.take(pool, { leadgenId: '901', pageId: '100' }, { deliver, fetchLead })).status, 'done');
    assert.equal(row('901').form_id, null, 'a lead without a form id is taken all the same');
  });
  test('the lead webhook was listening for its test delivery: the lead is its sample, and no contact', async () => {
    deliver = async () => ({ kind: 'test' });
    assert.deepEqual(await take(), { status: 'test', reason: null, retry: false });
    assert.deepEqual([row().status, row().contact_id, row().workspace_id, row().webhook_id], ['test', null, 7, 70]);
  });
  test('neither a name nor an email could be read: nothing comes of it, and Facebook is not asked to send it again', async () => {
    deliver = async () => ({ kind: 'unmapped' });
    assert.deepEqual(await take(), { status: 'skipped', reason: 'unmapped', retry: false });
    deliver = async () => ({ kind: 'off' });
    assert.deepEqual(await take({ ...EV, leadgenId: '901' }), { status: 'skipped', reason: 'off', retry: false }, 'switched off in the very moment');
  });
});

describe('a lead announced again', () => {
  test('one that was taken is not taken twice — whatever became of it', async () => {
    await take();
    assert.deepEqual(await take(), { status: 'known', reason: null, retry: false });
    assert.deepEqual([fetched.length, delivered.length, row().tries], [1, 1, 1]);
    for (const [id, kind] of [['901', 'test'], ['902', 'unmapped']]) {
      deliver = async () => ({ kind });
      await take({ ...EV, leadgenId: id });
      assert.equal((await take({ ...EV, leadgenId: id })).status, 'known', kind);
    }
    assert.equal(fetched.length, 3, 'Facebook was asked once per lead');
  });
  test('one that another request is taking right now: not taken, and Facebook is asked to send it again', async () => {
    let inner;
    fetchLead = async () => { inner = await take(); return LEAD; };
    assert.equal((await take()).status, 'done');
    assert.deepEqual(inner, { status: 'busy', reason: null, retry: true });
    assert.equal(delivered.length, 1, 'one contact');
  });
  test('one that failed is taken again, and counted', async () => {
    fetchLead = async () => { throw new FacebookError('unreachable', 'Facebook could not be reached'); };
    assert.deepEqual(await take(), { status: 'failed', reason: 'unreachable', retry: true });
    assert.equal(delivered.length, 0);
    fetchLead = async () => LEAD;
    assert.deepEqual(await take(), { status: 'done', reason: null, retry: false });
    assert.deepEqual([row().tries, row().status, row().reason, row().detail, row().contact_id], [2, 'done', null, null, 55]);
  });
  test('one left "working" by a request that died is taken after two minutes, not before', async () => {
    state.rows.set('900', { leadgen_id: '900', page_id: '100', form_id: null, status: 'working', tries: 1, claimed: 1000 });
    state.clock = 1119;
    assert.equal((await take()).status, 'busy');
    state.clock = 1121;
    assert.equal((await take()).status, 'done');
    assert.equal(row().tries, 2);
    assert.match(CLAIM, /WHERE facebook_leads\.status = 'failed' OR \(facebook_leads\.status = 'working' AND facebook_leads\.claimed_at < NOW\(\) - INTERVAL '2 minutes'\) RETURNING leadgen_id$/);
    assert.match(CLAIM, /^INSERT INTO facebook_leads \(leadgen_id, page_id, form_id\) VALUES \(\$1, \$2, \$3\) ON CONFLICT \(leadgen_id\) DO UPDATE SET status = 'working', claimed_at = NOW\(\), updated_at = NOW\(\), tries = facebook_leads\.tries \+ 1 /);
  });
});

describe('a lead nothing can come of', () => {
  test('its Page is given to no workspace: Facebook is not asked at all', async () => {
    assert.deepEqual(await take({ ...EV, pageId: '999' }), { status: 'skipped', reason: 'no_page', retry: false });
    assert.deepEqual([fetched.length, delivered.length, row().workspace_id, row().webhook_id], [0, 0, null, null]);
  });
  test('its lead webhook was deleted, or is another workspace\'s', async () => {
    state.pages[0].webhook_id = null;
    assert.deepEqual(await take(), { status: 'skipped', reason: 'no_webhook', retry: false });
    assert.equal(state.sql.some(q => /FROM workspace_webhook/.test(q.sql)), false, 'without a webhook id nothing is looked up');
    state.pages[0].webhook_id = 80;
    assert.deepEqual(await take({ ...EV, leadgenId: '901' }), { status: 'skipped', reason: 'no_webhook', retry: false });
    assert.deepEqual([fetched.length, delivered.length, row('901').workspace_id, row('901').webhook_id], [0, 0, 7, null], 'the workspace is noted, the foreign webhook is not');
  });
  test('its lead webhook is switched off — unless it is listening for its test delivery', async () => {
    state.hooks[0].active = false;
    assert.deepEqual(await take(), { status: 'skipped', reason: 'off', retry: false });
    assert.deepEqual([fetched.length, row().webhook_id], [0, 70]);
    state.hooks[0].test_until = new Date(Date.now() - 1000).toISOString();
    assert.equal((await take({ ...EV, leadgenId: '901' })).reason, 'off', 'the listening is over');
    state.hooks[0].test_until = new Date(Date.now() + 60000).toISOString();
    deliver = async wh => { delivered.push(wh); return { kind: 'test' }; };
    assert.equal((await take({ ...EV, leadgenId: '902' })).status, 'test');
    assert.equal(fetched.length, 1, 'only now Facebook was asked');
  });
  test('Facebook does not hand it out: its words are kept, and it is not asked for again', async () => {
    fetchLead = async () => { throw new FacebookError('rejected', 'Unsupported get request. Object with ID \'900\' does not exist ' + 'x'.repeat(400)); };
    assert.deepEqual(await take(), { status: 'skipped', reason: 'rejected', retry: false });
    assert.match(row().detail, /^Unsupported get request\. Object with ID '900' does not exist x+$/);
    assert.deepEqual([row().detail.length, leads.MAX_DETAIL, delivered.length], [300, 300, 0]);
  });
});

describe('a lead that could not be taken yet: Facebook is asked to send it again', () => {
  test('Facebook away, the Page\'s token no longer accepted, Facebook saying "later"', async () => {
    for (const [i, [err, reason]] of [[new FacebookError('unreachable', 'Facebook could not be reached'), 'unreachable'], [new FacebookError('gone', 'Session has expired'), 'gone'],
      [new FacebookError('rejected', 'Please retry your request later.', true), 'facebook']].entries()) {
      fetchLead = async () => { throw err; };
      assert.deepEqual(await take({ ...EV, leadgenId: String(i) }), { status: 'failed', reason, retry: true }, reason);
      assert.deepEqual([row(String(i)).status, row(String(i)).detail, row(String(i)).workspace_id], ['failed', err.message, 7]);
    }
    assert.equal(delivered.length, 0);
  });
  test('a token that cannot be opened on this server is a token gone: Facebook is never asked with it', async () => {
    state.pages[0].token = 'not-sealed-here';
    assert.deepEqual(await take(), { status: 'failed', reason: 'gone', retry: true });
    assert.deepEqual([fetched.length, row().detail], [0, 'The Page\'s token cannot be opened on this server.']);
    assert.doesNotMatch(JSON.stringify(row()), /not-sealed-here/);
  });
  test('the lead webhook\'s delivery fails: kept as failed, with why', async () => {
    deliver = async () => { throw new Error('deadlock detected'); };
    assert.deepEqual(await take(), { status: 'failed', reason: 'error', retry: true });
    assert.deepEqual([row().status, row().detail, row().webhook_id], ['failed', 'deadlock detected', 70]);
  });
  test('the database away in the middle: still an answer, and still "again"', async () => {
    state.broken = t => /FROM facebook_pages/.test(t);
    assert.deepEqual(await take(), { status: 'failed', reason: 'error', retry: true });
    assert.equal(row().detail, 'the database is away');
    state.broken = t => /FROM facebook_pages/.test(t) || t === FINISH;
    assert.deepEqual(await take({ ...EV, leadgenId: '901' }), { status: 'failed', reason: 'error', retry: true }, 'not even the end could be written');
    assert.equal(row('901').status, 'working', 'left behind: taken again after two minutes');
    state.broken = t => t === FINISH;
    assert.deepEqual(await take({ ...EV, leadgenId: '902' }), { status: 'failed', reason: 'error', retry: true }, 'the contact was made, the end could not be written');
  });
  test('only the claim itself throws: without it nothing is known about the lead', async () => {
    state.broken = t => t === CLAIM;
    await assert.rejects(take(), /the database is away/);
    assert.equal(fetched.length, 0);
  });
});

describe('how it is built', () => {
  const code = read('utils/facebook-leads.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens no database and writes no log: the pool and the delivery are handed in', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['./facebook', './calcom']);
    assert.doesNotMatch(code, /console\./);
    assert.deepEqual(Object.keys(leads).sort(), ['CLAIM', 'FINISH', 'MAX_DETAIL', 'take']);
  });
  test('a lead\'s id and its Page\'s are parameters of every statement, never part of one', () => {
    assert.doesNotMatch(code, /\$\{/);
    assert.equal(FINISH, 'UPDATE facebook_leads SET status = $2, reason = $3, detail = $4, workspace_id = $5, webhook_id = $6, contact_id = $7, deal_id = $8, updated_at = NOW() WHERE leadgen_id = $1');
  });
  test('the table: one row per lead by Facebook\'s id; it goes with its workspace and outlives its webhook, contact and deal', () => {
    const db = read('db.js');
    const table = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS facebook_leads ('), db.indexOf('facebook_leads_page_idx'));
    for (const line of ['leadgen_id   TEXT PRIMARY KEY,', 'page_id      TEXT NOT NULL,', 'form_id      TEXT,', 'workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,', 'webhook_id   INTEGER REFERENCES workspace_webhook(id) ON DELETE SET NULL,',
      "status       TEXT NOT NULL DEFAULT 'working',", 'reason       TEXT,', 'detail       TEXT,', 'tries        INTEGER NOT NULL DEFAULT 1,', 'contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,', 'deal_id      INTEGER REFERENCES deals(id) ON DELETE SET NULL,',
      'claimed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),', 'created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),', 'updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()']) assert.ok(table.includes(`      ${line}\n`), line);
    assert.match(db, /CREATE INDEX IF NOT EXISTS facebook_leads_page_idx ON facebook_leads \(page_id, created_at DESC\)/);
    assert.ok(db.indexOf('CREATE TABLE IF NOT EXISTS facebook_leads') > db.indexOf('CREATE TABLE IF NOT EXISTS workspace_webhook'), 'after the tables it points to');
    assert.equal(require('../../utils/workspace-export').LEFT_OUT.facebook_leads, 'history', 'not part of a workspace\'s export');
  });
});
