// ROUTE tests: a test delivery for setting a lead webhook's mapping up (LEAD_WEBHOOK_CHANGES Part 2).
//
// POST /settings/:id/test makes one webhook listen for ten minutes; the next delivery to its address is kept as the
// webhook's sample, logged as a test and makes NO contact, and that one delivery ends the listening — the one after
// it is a lead again. DELETE …/test stops, DELETE …/sample discards. A webhook that is switched off still takes its
// test delivery. Every write is scoped to one id in the caller's workspace.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const WID = 7;
const state = {};
function reset() {
  Object.assign(state, {
    now: Date.parse('2026-11-17T10:00:00Z'), log: [], logs: [], contacts: [], known: [], deliveries: [],
    webhooks: [
      { id: 1, workspace_id: WID, webhook_key: 'key-one', name: 'Website', field_map: { name: 'full_name', email: 'email' }, create_deal: false, pipeline_id: null, stage_id: null, default_assignee_id: null, active: true, test_until: null, sample: null, sample_at: null },
      { id: 2, workspace_id: WID, webhook_key: 'key-two', name: 'Facebook', field_map: {}, create_deal: false, pipeline_id: null, stage_id: null, default_assignee_id: null, active: false, test_until: null, sample: null, sample_at: null },
      { id: 3, workspace_id: 99, webhook_key: 'key-other', name: 'Elsewhere', field_map: {}, active: true, test_until: null, sample: null, sample_at: null },
    ],
  });
}
const listening = w => !!w.test_until && new Date(w.test_until).getTime() > Date.now();
const mine = (id, wid) => state.webhooks.find(w => w.id === id && w.workspace_id === wid);
const pool = { query: async (sql, p = []) => {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  state.log.push(q);
  if (q === "UPDATE workspace_webhook SET test_until = NOW() + INTERVAL '10 minutes' WHERE id=$1 AND workspace_id=$2 RETURNING *") { const w = mine(p[0], p[1]); if (!w) return { rows: [] }; w.test_until = new Date(Date.now() + 600000).toISOString(); return { rows: [{ ...w }] }; }
  if (q === 'UPDATE workspace_webhook SET test_until = NULL WHERE id=$1 AND workspace_id=$2 RETURNING *') { const w = mine(p[0], p[1]); if (!w) return { rows: [] }; w.test_until = null; return { rows: [{ ...w }] }; }
  if (q === 'UPDATE workspace_webhook SET sample = NULL, sample_at = NULL WHERE id=$1 AND workspace_id=$2 RETURNING *') { const w = mine(p[0], p[1]); if (!w) return { rows: [] }; w.sample = null; w.sample_at = null; return { rows: [{ ...w }] }; }
  if (q === 'SELECT * FROM workspace_webhook WHERE webhook_key=$1 AND active=true') return { rows: state.webhooks.filter(w => w.webhook_key === p[0] && w.active).map(w => ({ ...w })) };
  if (q === 'SELECT id, workspace_id FROM workspace_webhook WHERE webhook_key=$1 AND active=false AND test_until > NOW()') return { rows: state.webhooks.filter(w => w.webhook_key === p[0] && !w.active && listening(w)).map(w => ({ id: w.id, workspace_id: w.workspace_id })) };
  if (q === 'UPDATE workspace_webhook SET sample=$2::jsonb, sample_at=NOW(), test_until=NULL WHERE id=$1 AND test_until > NOW() RETURNING id') {
    const w = state.webhooks.find(x => x.id === p[0]);
    if (!w || !listening(w)) return { rows: [] };
    Object.assign(w, { sample: JSON.parse(p[1]), sample_at: new Date().toISOString(), test_until: null });
    return { rows: [{ id: w.id }] };
  }
  if (q.startsWith('INSERT INTO webhook_logs')) { state.logs.push({ sql: q, params: p }); return { rows: [] }; }
  // Part 3: the last delivery as the sample — the statement is answered only as written, so its conditions are pinned
  if (q === 'SELECT id FROM workspace_webhook WHERE workspace_id=$1 ORDER BY id ASC LIMIT 1') return { rows: state.webhooks.filter(w => w.workspace_id === p[0]).sort((a, b) => a.id - b.id).slice(0, 1).map(w => ({ id: w.id })) };
  if (q === 'SELECT id FROM workspace_webhook WHERE id=$1 AND workspace_id=$2') return { rows: mine(p[0], p[1]) ? [{ id: p[0] }] : [] };
  if (q === "UPDATE workspace_webhook w SET sample = l.payload, sample_at = l.created_at FROM (SELECT payload, created_at FROM webhook_logs WHERE workspace_id=$2 AND source='lead' AND payload IS NOT NULL AND (webhook_id=$1 OR ($3::boolean AND webhook_id IS NULL)) ORDER BY created_at DESC, id DESC LIMIT 1) l WHERE w.id=$1 AND w.workspace_id=$2 RETURNING w.*") {
    const w = mine(p[0], p[1]);
    const last = state.deliveries.filter(d => d.workspace_id === p[1] && d.source === 'lead' && d.payload != null && (d.webhook_id === p[0] || (p[2] && d.webhook_id == null)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id)[0];
    if (!w || !last) return { rows: [] };
    Object.assign(w, { sample: last.payload, sample_at: last.created_at });
    return { rows: [{ ...w }] };
  }
  // Part 4: the preview reads the webhook's map and sample, and looks the email up
  if (q === 'SELECT id, field_map, sample FROM workspace_webhook WHERE id=$1 AND workspace_id=$2') { const w = mine(p[0], p[1]); return { rows: w ? [{ id: w.id, field_map: w.field_map, sample: w.sample }] : [] }; }
  if (q === 'SELECT id, name FROM contacts WHERE workspace_id=$1 AND email=$2') return { rows: state.known.filter(c => c.workspace_id === p[0] && c.email === p[1]).map(c => ({ id: c.id, name: c.name })) };
  if (/^SELECT w\.\* ?, p\.name AS pipeline_name/.test(q) || /^SELECT w\.\*, p\.name/.test(q)) return { rows: state.webhooks.filter(w => w.workspace_id === p[0]).sort((a, b) => a.id - b.id).map(w => ({ ...w, pipeline_name: null, stage_name: null })) };
  if (/FROM pipelines WHERE workspace_id=\$1 ORDER BY position/.test(q)) return { rows: [] };
  if (/FROM pipeline_stages ps JOIN pipelines p/.test(q)) return { rows: [] };
  if (/FROM custom_fields WHERE workspace_id=\$1 ORDER BY position/.test(q)) return { rows: [] };
  if (/FROM users u JOIN user_workspaces uw/.test(q)) return { rows: [] };
  // a lead, after the test: the contact lookup and the insert
  if (q.startsWith('SELECT id, name, email, phone, company, contact_type FROM contacts WHERE workspace_id=$1 AND email=$2')) return { rows: [] };
  if (q.startsWith('INSERT INTO contacts')) { state.contacts.push({ name: p[1], email: p[2], phone: p[3], company: p[4], custom: JSON.parse(p[5]) }); return { rows: [{ id: 500, name: p[1] }] }; }
  return { rows: [] };
} };

let srv;
before(async () => { srv = await serve({ '/api/integrations': loadRoute('integrations.js', { pool, user: { id: 1, workspaceId: WID, role: 'member' } }) }); });
after(() => srv.close());
beforeEach(reset);
const S = '/api/integrations/settings', R = '/api/integrations/receive/';
const LEAD = { full_name: 'Erika Muster', email: 'erika@muster.de', data: { phone: '+49171' } };

describe('listening', () => {
  test('POST /settings/:id/test: that webhook listens for ten minutes; the answer and GET /settings say so, with the seconds left', async () => {
    const r = await srv.request('POST', `${S}/1/test`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.webhook.id, 1); assert.equal(r.body.webhook.testing, true);
    assert.ok(r.body.webhook.test_seconds_left > 590 && r.body.webhook.test_seconds_left <= 600);
    const list = (await srv.request('GET', S)).body.webhooks;
    assert.deepEqual(list.map(w => [w.id, w.testing]), [[1, true], [2, false]]);
    assert.equal(list[1].test_seconds_left, 0);
  });
  test('DELETE …/test stops it; an unknown id, another workspace\'s webhook or a bad id is a 404 and changes nothing', async () => {
    await srv.request('POST', `${S}/1/test`, {});
    const r = await srv.request('DELETE', `${S}/1/test`);
    assert.equal(r.status, 200); assert.equal(r.body.webhook.testing, false);
    for (const id of ['3', '99', 'abc']) for (const [m, tail] of [['POST', '/test'], ['DELETE', '/test'], ['DELETE', '/sample']]) assert.equal((await srv.request(m, `${S}/${id}${tail}`, m === 'POST' ? {} : undefined)).status, 404, `${m} ${id}${tail}`);
    assert.equal(state.webhooks[2].test_until, null);
  });
});

describe('the test delivery', () => {
  test('kept as the sample, logged as a test, and no contact is made; the listening ends with it', async () => {
    await srv.request('POST', `${S}/1/test`, {});
    const r = await srv.request('POST', R + 'key-one', LEAD);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, test: true, message: 'Kept as a test delivery. No contact was created.' });
    assert.deepEqual(state.webhooks[0].sample, LEAD); assert.ok(state.webhooks[0].sample_at); assert.equal(state.webhooks[0].test_until, null);
    assert.equal(state.contacts.length, 0, 'no contact'); assert.ok(!state.log.some(q => q.startsWith('SELECT id, name, email')), 'the lead path was never entered');
    assert.equal(state.logs.length, 1);
    assert.match(state.logs[0].sql, /VALUES \(\$1,\$2,'test',\$3,\$4,\$5\)/);
    assert.deepEqual([state.logs[0].params[0], state.logs[0].params[1], JSON.parse(state.logs[0].params[2])], [WID, 1, LEAD]);
    assert.deepEqual(JSON.parse(state.logs[0].params[3]), { payload_keys: ['full_name', 'email', 'data'] });
    const wh = (await srv.request('GET', S)).body.webhooks[0];
    assert.equal(wh.testing, false); assert.deepEqual(wh.sample, LEAD);
  });
  test('the delivery after it is a lead again; without listening a delivery is a lead from the start', async () => {
    await srv.request('POST', `${S}/1/test`, {});
    await srv.request('POST', R + 'key-one', LEAD);
    const next = await srv.request('POST', R + 'key-one', LEAD);
    assert.equal(next.body.test, undefined); assert.equal(state.contacts.length, 1);
    assert.deepEqual(state.webhooks[0].sample, LEAD, 'the sample stays');
    reset();
    await srv.request('POST', R + 'key-one', LEAD);
    assert.equal(state.contacts.length, 1); assert.equal(state.webhooks[0].sample, null);
  });
  test('a listening that ran out takes nothing: the delivery is a lead', async () => {
    state.webhooks[0].test_until = new Date(Date.now() - 1000).toISOString();
    const r = await srv.request('POST', R + 'key-one', LEAD);
    assert.equal(r.body.test, undefined); assert.equal(state.webhooks[0].sample, null); assert.equal(state.contacts.length, 1);
  });
  test('a webhook that is switched off takes its test delivery while it listens, and is "not found" otherwise', async () => {
    assert.equal((await srv.request('POST', R + 'key-two', LEAD)).status, 404);
    await srv.request('POST', `${S}/2/test`, {});
    const r = await srv.request('POST', R + 'key-two', LEAD);
    assert.equal(r.status, 200); assert.equal(r.body.test, true); assert.deepEqual(state.webhooks[1].sample, LEAD);
    assert.equal((await srv.request('POST', R + 'key-two', LEAD)).status, 404, 'one delivery, then off again');
    assert.equal(state.contacts.length, 0);
  });
  test('only the listening webhook keeps a sample; a payload that is a list or deeply nested is kept as it came', async () => {
    await srv.request('POST', `${S}/1/test`, {});
    await srv.request('POST', R + 'key-two', LEAD);
    assert.equal(state.webhooks[1].sample, null);
    const odd = { field_data: [{ name: 'email', values: ['a@b.de'] }], meta: { form: { id: 9 } } };
    await srv.request('POST', R + 'key-one', odd);
    assert.deepEqual(state.webhooks[0].sample, odd);
  });
  test('DELETE …/sample discards it', async () => {
    await srv.request('POST', `${S}/1/test`, {});
    await srv.request('POST', R + 'key-one', LEAD);
    const r = await srv.request('DELETE', `${S}/1/sample`);
    assert.equal(r.status, 200); assert.equal(r.body.webhook.sample, null); assert.equal(state.webhooks[0].sample_at, null);
  });
});

// ── Part 3: the sample's fields, and the last delivery as the sample ─────────
const FACEBOOK = { id: '4447', field_data: [{ name: 'full_name', values: ['Erika Muster'] }, { name: 'email', values: ['Erika@Muster.de'] }, { name: 'phone_number', values: ['+491711234567'] }, { name: 'budget', values: ['10k'] }] };
const FB_MAP = { name: 'field_data[name=full_name].values', email: 'field_data[name=email].values', phone: 'field_data[name=phone_number].values', company: '', eigenkapital: 'field_data[name=budget].values', fehlt: 'field_data[name=nope].values' };

describe("the sample's fields (Part 3)", () => {
  test('every webhook answers its sample\'s values with the path that reaches each: nested keys with dots, name/value pairs by name; none without a sample', async () => {
    state.webhooks[0].sample = { full_name: 'Erika Muster', data: { email: 'e@x.de', tags: ['a', 'b'] } };
    state.webhooks[1].sample = FACEBOOK;
    const list = (await srv.request('GET', S)).body.webhooks;
    assert.deepEqual(list[0].sample_fields, [{ path: 'full_name', value: 'Erika Muster' }, { path: 'data.email', value: 'e@x.de' }, { path: 'data.tags', value: 'a, b' }]);
    assert.deepEqual(list[1].sample_fields.map(f => f.path), ['id', 'field_data[name=full_name].values', 'field_data[name=email].values', 'field_data[name=phone_number].values', 'field_data[name=budget].values']);
    state.webhooks[0].sample = null;
    assert.deepEqual((await srv.request('GET', S)).body.webhooks[0].sample_fields, []);
    assert.deepEqual((await srv.request('POST', `${S}/2/test`, {})).body.webhook.sample_fields.length, 5, 'the test routes answer them too');
  });
  test('POST …/sample/last: the newest delivery this webhook got becomes its sample, whatever became of it; another webhook\'s is not taken', async () => {
    state.deliveries = [
      { id: 1, workspace_id: WID, webhook_id: 1, source: 'lead', payload: { old: 1 }, created_at: '2026-11-16T10:00:00Z' },
      { id: 2, workspace_id: WID, webhook_id: 1, source: 'lead', payload: { rejected: 'yes' }, created_at: '2026-11-17T09:00:00Z' },
      { id: 3, workspace_id: WID, webhook_id: 2, source: 'lead', payload: { other: 1 }, created_at: '2026-11-17T09:30:00Z' },
      { id: 4, workspace_id: WID, webhook_id: null, source: 'calcom', payload: { booking: 1 }, created_at: '2026-11-17T09:40:00Z' },
      { id: 5, workspace_id: 99, webhook_id: 3, source: 'lead', payload: { foreign: 1 }, created_at: '2026-11-17T09:50:00Z' },
    ];
    const r = await srv.request('POST', `${S}/1/sample/last`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.webhook.sample, { rejected: 'yes' }); assert.equal(r.body.webhook.sample_at, '2026-11-17T09:00:00Z');
    assert.deepEqual(r.body.webhook.sample_fields, [{ path: 'rejected', value: 'yes' }]);
    assert.deepEqual((await srv.request('POST', `${S}/2/sample/last`, {})).body.webhook.sample, { other: 1 });
  });
  test('a delivery from before the webhooks had names (no webhook on it) belongs to the first webhook, never to the second', async () => {
    state.deliveries = [{ id: 1, workspace_id: WID, webhook_id: null, source: 'lead', payload: { legacy: 1 }, created_at: '2026-11-01T10:00:00Z' }];
    assert.deepEqual((await srv.request('POST', `${S}/1/sample/last`, {})).body.webhook.sample, { legacy: 1 });
    const second = await srv.request('POST', `${S}/2/sample/last`, {});
    assert.equal(second.status, 404); assert.equal(second.body.reason, 'no_delivery');
  });
  test('nothing has arrived yet: 404 no_delivery and the sample stays; an unknown or foreign webhook: 404 without a reason', async () => {
    state.webhooks[0].sample = { kept: 1 };
    const r = await srv.request('POST', `${S}/1/sample/last`, {});
    assert.equal(r.status, 404); assert.equal(r.body.reason, 'no_delivery'); assert.deepEqual(state.webhooks[0].sample, { kept: 1 });
    for (const id of ['3', '99', 'abc']) { const x = await srv.request('POST', `${S}/${id}/sample/last`, {}); assert.equal(x.status, 404, id); assert.equal(x.body.reason, undefined, id); }
  });
});

// ── Part 4: what the sample would become ─────────────────────────────────────
describe('POST …/preview (Part 4)', () => {
  const P = id => `${S}/${id}/preview`;
  test('no sample: has_sample false, nothing else asked', async () => {
    assert.deepEqual((await srv.request('POST', P(1), {})).body, { has_sample: false });
  });
  test('with the map sent: the contact\'s values, the custom fields, what the sample lacks; a new contact; nothing is written', async () => {
    state.webhooks[1].sample = FACEBOOK;
    const r = await srv.request('POST', P(2), { field_map: FB_MAP });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { has_sample: true, rejected: false,
      contact: { name: 'Erika Muster', email: 'erika@muster.de', phone: '+491711234567', company: null },
      custom: [{ key: 'eigenkapital', value: '10k' }], skipped: [{ key: 'fehlt', incoming: 'field_data[name=nope].values' }], existing: null });
    assert.ok(!state.log.some(q => /^(INSERT|UPDATE|DELETE)/.test(q)), 'a preview writes nothing');
    assert.deepEqual(state.webhooks[1].field_map, {}, 'and does not save the map it was sent');
  });
  test('the email is looked up as the receiver does (lower-cased): a contact the CRM has would be updated', async () => {
    state.webhooks[1].sample = FACEBOOK; state.known = [{ id: 5, workspace_id: WID, name: 'Erika M.', email: 'erika@muster.de' }, { id: 6, workspace_id: 99, name: 'Fremd', email: 'erika@muster.de' }];
    assert.deepEqual((await srv.request('POST', P(2), { field_map: FB_MAP })).body.existing, { id: 5, name: 'Erika M.' });
  });
  test('without a map in the body the saved one is used; a map that fills neither a name nor an email: rejected, no lookup', async () => {
    state.webhooks[0].sample = { full_name: 'Erika Muster', email: 'e@x.de' };
    const saved = await srv.request('POST', P(1), {});
    assert.deepEqual(saved.body.contact, { name: 'Erika Muster', email: 'e@x.de', phone: null, company: null });
    state.log.length = 0;
    const bad = await srv.request('POST', P(1), { field_map: { name: 'nope', email: '', phone: 'full_name' } });
    assert.equal(bad.body.rejected, true); assert.equal(bad.body.existing, null); assert.equal(bad.body.contact.phone, 'Erika Muster');
    assert.ok(!state.log.some(q => q.startsWith('SELECT id, name FROM contacts')));
    for (const fm of ['text', [1], 5]) assert.equal((await srv.request('POST', P(1), { field_map: fm })).body.contact.name, 'Erika Muster', 'a map that is no object falls back to the saved one');
  });
  test('another workspace\'s webhook, an unknown one, a bad id: 404', async () => {
    for (const id of ['3', '99', 'abc']) assert.equal((await srv.request('POST', P(id), {})).status, 404, id);
  });
});

// ── Parts 3 and 5: the receiver reads a delivery the way the preview does ────
describe('a lead through a map of pair paths and awkward shapes', () => {
  test('a Facebook-shaped delivery: the contact gets its values from the name/value pairs; the missing custom field is logged as skipped', async () => {
    state.webhooks[0].field_map = FB_MAP;
    const r = await srv.request('POST', R + 'key-one', FACEBOOK);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(state.contacts, [{ name: 'Erika Muster', email: 'erika@muster.de', phone: '+491711234567', company: null, custom: { eigenkapital: '10k' } }]);
    const captured = JSON.parse(state.logs.at(-1).params[3]);
    assert.deepEqual(captured, { name: 'Erika Muster', email: 'Erika@Muster.de', phone: '+491711234567', company: null, eigenkapital: '10k', _skipped: { fehlt: 'incoming key "field_data[name=nope].values" not found or empty in payload' } });
  });
  test('values that are not text no longer break a delivery: a number as the name, a list as the email', async () => {
    const r = await srv.request('POST', R + 'key-one', { full_name: 4711, email: ['Zahl@X.de'] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([state.contacts[0].name, state.contacts[0].email], ['4711', 'zahl@x.de']);
  });
  test('a delivery the map finds neither a name nor an email in is still rejected with 422 and logged with its keys', async () => {
    const r = await srv.request('POST', R + 'key-one', { something: 'else' });
    assert.equal(r.status, 422);
    assert.match(state.logs.at(-1).sql, /VALUES \(\$1,\$2,'error',\$3,\$4,\$5\)/);
    assert.deepEqual(JSON.parse(state.logs.at(-1).params[3]), { field_map_keys: ['name', 'email'], payload_keys: ['something'] });
  });
});

describe('the table', () => {
  test('the three columns are added, guarded', () => {
    const db = require('fs').readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    for (const col of ['test_until TIMESTAMPTZ', 'sample     JSONB', 'sample_at  TIMESTAMPTZ']) assert.ok(db.includes('ALTER TABLE workspace_webhook ADD COLUMN IF NOT EXISTS ' + col), col);
  });
});
