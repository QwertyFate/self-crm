// ROUTE tests for "members only see what is assigned to them" (MEMBER_VISIBILITY_CHANGES Part 1, 2026-11-25):
// the switch itself (PATCH /api/workspace/member-visibility) and what it does to /api/deals and /api/contacts.
//
// The real routes on a throwaway server; the database is a stand-in that records every statement. So these show
// WHAT each route asks: for a held member every statement that reads or changes a deal or a contact carries the
// rule with the member's id, a row the rule hides is a 404 and NOTHING is written after it; for an owner, an admin
// and a member of a workspace without the switch the statements are the ones that shipped. What the rule selects
// on real rows is shown on a real Postgres (the log names the harness).
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const DEAL = (d, n) => ` AND (${d}.assigned_to = $${n} OR (${d}.assigned_to IS NULL AND EXISTS (SELECT 1 FROM contacts vc WHERE vc.id = ${d}.contact_id AND vc.assigned_to = $${n})))`;
const CONTACT = (c, n) => ` AND (${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier' OR EXISTS (SELECT 1 FROM deals vd WHERE vd.contact_id = ${c}.id AND vd.assigned_to = $${n}))`;
const OWN = (c, n) => ` AND (${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier')`;
const SEES_DEAL = `SELECT 1 FROM deals d WHERE d.id = $1 AND d.workspace_id = $2${DEAL('d', 3)}`;
const SEES_CONTACT = `SELECT 1 FROM contacts c WHERE c.id = $1 AND c.workspace_id = $2${CONTACT('c', 3)}`;

const HELD   = { id: 12, workspaceId: 7, role: 'member', ownOnly: true };
const FREE   = [{ id: 1, workspaceId: 7, role: 'owner' }, { id: 2, workspaceId: 7, role: 'admin' }, { id: 12, workspaceId: 7, role: 'member' }];

// The stand-in: `answer(sql, params)` may return { rows, rowCount } for a statement; everything else finds nothing.
const state = { asked: [], answer: null };
const pool = { query: async (sql, params) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.asked.push([t, params]);
  return (state.answer && state.answer(t, params)) || { rows: [], rowCount: 0 };
} };
beforeEach(() => { state.asked = []; state.answer = null; });
const call = async (file, mount, user, method, url, body) => {
  const server = await serve({ [mount]: loadRoute(file, { pool, user }) });
  try { return await server.request(method, mount + url, body); } finally { await server.close(); }
};
const deals    = (user, method, url, body) => call('deals.js', '/api/deals', user, method, url, body);
const contacts = (user, method, url, body) => call('contacts.js', '/api/contacts', user, method, url, body);
const find  = re => state.asked.filter(a => re.test(a[0]));
const wrote = () => state.asked.filter(a => /^(INSERT|UPDATE|DELETE)/.test(a[0]));
const ruled = () => state.asked.filter(a => /\bv[cd]\./.test(a[0]));

describe('PATCH /api/workspace/member-visibility: the switch', () => {
  const patch = (user, body) => call('workspace.js', '/api/workspace', user, 'PATCH', '/member-visibility', body);
  test('an owner and an admin switch it on and off; the workspace is the caller\'s own', async () => {
    for (const user of [FREE[0], FREE[1]]) for (const own_only of [true, false]) {
      state.asked = [];
      const r = await patch(user, { own_only });
      assert.deepEqual([r.status, r.body], [200, { success: true, own_only }]);
      assert.deepEqual(state.asked, [['UPDATE workspaces SET members_own_only=$1 WHERE id=$2', [own_only, 7]]]);
    }
  });
  test('a member is refused and nothing is written — also a member who is not held yet', async () => {
    for (const user of [HELD, FREE[2]]) {
      const r = await patch(user, { own_only: false });
      assert.deepEqual([r.status, r.body], [403, { error: 'Owner or admin only' }]);
    }
    assert.deepEqual(state.asked, []);
  });
  test('only a real true or false switches: a missing or misspelt value is refused, nothing is written', async () => {
    for (const body of [{}, { own_only: 'true' }, { own_only: 1 }, { own_only: null }, { ownOnly: true }]) {
      const r = await patch(FREE[0], body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.deepEqual(state.asked, []);
  });
  test('the column: off for every existing workspace, and sent to the screen with the workspace', () => {
    assert.match(read('db.js'), /ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS members_own_only BOOLEAN NOT NULL DEFAULT false/);
    assert.match(read('routes/auth.js'), /task_statuses, members_own_only FROM workspaces WHERE id = \$1/);
  });
});

describe('/api/deals: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, no extra parameter, no extra question`, async () => {
    state.answer = t => (/^SELECT stage_id, contact_id, title FROM deals/.test(t) ? { rows: [{ stage_id: null, contact_id: 4, title: 'T' }] } : /^(UPDATE|DELETE)/.test(t) ? { rows: [], rowCount: 1 } : /^INSERT INTO deals/.test(t) ? { rows: [{ id: 50 }] } : null);
    await deals(user, 'GET', '/?pipeline_id=3');
    await deals(user, 'GET', '/5');
    await deals(user, 'PUT', '/5', { title: 'T', pipeline_id: 3, contact_id: 4, assigned_to: 2 });
    await deals(user, 'PATCH', '/5/stage', {});
    await deals(user, 'PATCH', '/5/urgency', { urgency: 2 });
    await deals(user, 'DELETE', '/5');
    await deals(user, 'GET', '/5/objects');
    await deals(user, 'POST', '/5/objects', { object_id: 9 });
    await deals(user, 'DELETE', '/5/objects/9');
    assert.equal((await deals(user, 'POST', '/', { title: 'N', pipeline_id: 3, contact_id: 4 })).status, 201);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(find(/FROM deals d LEFT JOIN/).map(a => a[1]), [[7, 3], ['5', 7]]);
    assert.deepEqual(find(/^SELECT stage_id/).map(a => a[0]), Array(2).fill('SELECT stage_id, contact_id, title FROM deals WHERE id=$1 AND workspace_id=$2'));
    assert.deepEqual(find(/^UPDATE deals SET contact_id/)[0][1].slice(-2), ['5', 7]);
    assert.deepEqual(find(/^UPDATE deals SET stage_id/)[0], ['UPDATE deals SET stage_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3', [null, '5', 7]]);
    assert.deepEqual(find(/^UPDATE deals SET urgency/)[0], ['UPDATE deals SET urgency=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3', [2, '5', 7]]);
    assert.deepEqual(find(/^DELETE FROM deals /)[0], ['DELETE FROM deals WHERE id=$1 AND workspace_id=$2', ['5', 7]]);
    assert.equal(find(/deal_objects/).length, 3, 'the three listing statements run as before');
  });
});

describe('/api/deals: a held member', () => {
  test('the list carries the rule with the member\'s id, after the page\'s own filters', async () => {
    await deals(HELD, 'GET', '/');
    await deals(HELD, 'GET', '/?pipeline_id=3&contact_id=4');
    const [a, b] = find(/FROM deals d LEFT JOIN/);
    assert.ok(a[0].includes(`WHERE d.workspace_id = $1${DEAL('d', 2)} ORDER BY`), a[0]);
    assert.deepEqual(a[1], [7, 12]);
    assert.ok(b[0].includes(`AND d.contact_id = $3${DEAL('d', 4)} ORDER BY`), b[0]);
    assert.deepEqual(b[1], [7, 3, 4, 12]);
  });
  test('opening somebody else\'s deal is a 404, and its listings are not read', async () => {
    const r = await deals(HELD, 'GET', '/5');
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.equal(state.asked.length, 1);
    assert.ok(state.asked[0][0].includes(`WHERE d.id = $1 AND d.workspace_id = $2${DEAL('d', 3)}`));
    assert.deepEqual(state.asked[0][1], ['5', 7, 12]);
  });
  test('opening their own works and reads its listings', async () => {
    state.answer = t => (/FROM deals d LEFT JOIN/.test(t) ? { rows: [{ id: 5, title: 'Mine' }] } : null);
    const r = await deals(HELD, 'GET', '/5');
    assert.equal(r.status, 200); assert.equal(r.body.title, 'Mine');
    assert.equal(find(/deal_objects/).length, 1);
  });
  for (const [name, method, url, body] of [
    ['changing', 'PUT', '/5', { title: 'T', pipeline_id: 3 }],
    ['moving', 'PATCH', '/5/stage', { stage_id: 9 }],
    ['the urgency of', 'PATCH', '/5/urgency', { urgency: 3 }],
    ['deleting', 'DELETE', '/5', undefined],
  ]) test(`${name} somebody else's deal is a 404 and the statement itself is ruled`, async () => {
    const r = await deals(HELD, method, url, body);
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.ok(state.asked.every(a => a[0].includes(DEAL('deals', a[1].length))), JSON.stringify(state.asked));
    assert.ok(state.asked.every(a => a[1][a[1].length - 1] === 12));
    assert.equal(state.asked.length, 1, 'nothing is asked after the refusal');
  });
  test('changing their own deal: the read and the write both carry the rule, so a deal handed over in between is not rewritten', async () => {
    state.answer = t => (/^SELECT stage_id/.test(t) ? { rows: [{ stage_id: null, contact_id: null, title: 'T' }] } : /^UPDATE/.test(t) ? { rows: [], rowCount: 1 } : null);
    const r = await deals(HELD, 'PUT', '/5', { title: 'T', pipeline_id: 3, assigned_to: 44 });
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    assert.equal(state.asked[0][0], `SELECT stage_id, contact_id, title FROM deals WHERE id=$1 AND workspace_id=$2${DEAL('deals', 3)}`);
    const up = find(/^UPDATE deals SET contact_id/)[0];
    assert.ok(up[0].endsWith(`WHERE id=$10 AND workspace_id=$11${DEAL('deals', 12)}`), up[0]);
    assert.equal(up[1][6], 44, 'a member may hand the deal to someone else');
    assert.deepEqual(up[1].slice(-3), ['5', 7, 12]);
    state.asked = [];
    assert.equal((await deals(HELD, 'PATCH', '/5/stage', { stage_id: 9 })).status, 200);
    assert.equal(find(/^UPDATE deals SET stage_id/)[0][0], `UPDATE deals SET stage_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3${DEAL('deals', 4)}`);
  });
  test('a deal is not put on a contact the member cannot see: new or changed, 404 and nothing written', async () => {
    state.answer = t => (/^SELECT stage_id/.test(t) ? { rows: [{ stage_id: null, contact_id: null, title: 'T' }] } : null);
    const made = await deals(HELD, 'POST', '/', { title: 'N', pipeline_id: 3, contact_id: 4 });
    assert.deepEqual([made.status, made.body], [404, { error: 'Contact not found' }]);
    const put = await deals(HELD, 'PUT', '/5', { title: 'T', pipeline_id: 3, contact_id: 4 });
    assert.deepEqual([put.status, put.body], [404, { error: 'Contact not found' }]);
    assert.deepEqual(wrote(), []);
    assert.deepEqual(find(/^SELECT 1 FROM contacts c/).map(a => a), [[SEES_CONTACT, [4, 7, 12]], [SEES_CONTACT, [4, 7, 12]]]);
  });
  test('a new deal on a contact they see, or on none, is made and is theirs', async () => {
    state.answer = t => (/^SELECT 1 FROM contacts c/.test(t) ? { rows: [{}] } : /^INSERT INTO deals/.test(t) ? { rows: [{ id: 50 }] } : null);
    assert.equal((await deals(HELD, 'POST', '/', { title: 'N', pipeline_id: 3, contact_id: 4 })).status, 201);
    assert.equal((await deals(HELD, 'POST', '/', { title: 'M', pipeline_id: 3 })).status, 201);
    const ins = find(/^INSERT INTO deals/);
    assert.deepEqual(ins.map(a => a[1][7]), [12, 12], 'assigned to whoever made it');
    assert.equal(find(/^SELECT 1 FROM contacts c/).length, 1, 'no contact, no question');
  });
  test('a deal\'s listings are reached only through a deal the member sees', async () => {
    for (const [method, url, body] of [['GET', '/5/objects'], ['POST', '/5/objects', { object_id: 9 }], ['DELETE', '/5/objects/9']]) {
      state.asked = [];
      const r = await deals(HELD, method, url, body);
      assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }], url);
      assert.deepEqual(state.asked, [[SEES_DEAL, ['5', 7, 12]]]);
    }
    state.answer = t => (t === SEES_DEAL ? { rows: [{}] } : null);
    for (const [method, url, body] of [['GET', '/5/objects'], ['POST', '/5/objects', { object_id: 9 }], ['DELETE', '/5/objects/9']]) {
      state.asked = [];
      assert.ok((await deals(HELD, method, url, body)).status < 300);
      assert.equal(find(/deal_objects/).length, 1);
    }
  });
});

describe('/api/contacts: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, no extra parameter, and an import leaves nothing out`, async () => {
    state.answer = t => (/^SELECT name, email, phone, company, contact_type FROM contacts/.test(t) ? { rows: [{ name: 'A', email: null, phone: null, company: null, contact_type: 'contact' }] }
      : /^SELECT id FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(t) ? { rows: [{ id: 30 }] }
      : /^(UPDATE|DELETE)/.test(t) ? { rows: [], rowCount: 1 } : null);
    await contacts(user, 'GET', '/?contact_type=contact');
    await contacts(user, 'GET', '/5');
    await contacts(user, 'PUT', '/5', { name: 'A' });
    await contacts(user, 'DELETE', '/5');
    await contacts(user, 'POST', '/bulk/delete', { contactIds: [5, 6] });
    const imp = await contacts(user, 'POST', '/import', { contacts: [{ name: 'X', email: 'x@example.com' }] });
    assert.deepEqual([imp.status, imp.body], [201, { imported: 1, deals_created: 0, skipped: 0 }]);
    assert.deepEqual(ruled(), []);
    assert.equal(state.asked.some(a => / = 'supplier'\)/.test(a[0])), false);
    assert.deepEqual(find(/FROM contacts c LEFT JOIN/).map(a => a[1]), [[7, 'contact'], ['5', 7]]);
    assert.equal(find(/^SELECT name, email/)[0][0], 'SELECT name, email, phone, company, contact_type FROM contacts WHERE id=$1 AND workspace_id=$2');
    assert.ok(find(/^UPDATE contacts SET name=\$1, email/)[0][0].endsWith('WHERE id=$8 AND workspace_id=$9'));
    assert.deepEqual(find(/^DELETE FROM contacts/), [['DELETE FROM contacts WHERE id=$1 AND workspace_id=$2', ['5', 7]], ['DELETE FROM contacts WHERE id IN ($2,$3) AND workspace_id=$1', [7, 5, 6]]]);
  });
});

describe('/api/contacts: a held member', () => {
  test('the list carries the rule after the page\'s own filters', async () => {
    await contacts(HELD, 'GET', '/');
    await contacts(HELD, 'GET', '/?contact_type=contact&contact_id=5');
    const [a, b] = find(/FROM contacts c LEFT JOIN/);
    assert.ok(a[0].includes(`WHERE c.workspace_id = $1${CONTACT('c', 2)} ORDER BY`), a[0]);
    assert.deepEqual(a[1], [7, 12]);
    assert.ok(b[0].includes(`AND c.id = $3${CONTACT('c', 4)} ORDER BY`), b[0]);
    assert.deepEqual(b[1], [7, 'contact', '5', 12]);
  });
  test('opening somebody else\'s contact is a 404, and its notes are not read', async () => {
    const r = await contacts(HELD, 'GET', '/5');
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.equal(state.asked.length, 1);
    assert.ok(state.asked[0][0].includes(`WHERE c.id = $1 AND c.workspace_id = $2${CONTACT('c', 3)}`));
    assert.deepEqual(state.asked[0][1], ['5', 7, 12]);
  });
  test('changing somebody else\'s contact is a 404 and nothing is written', async () => {
    const r = await contacts(HELD, 'PUT', '/5', { name: 'A', email: 'new@example.com' });
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[`SELECT name, email, phone, company, contact_type FROM contacts WHERE id=$1 AND workspace_id=$2${CONTACT('contacts', 3)}`, ['5', 7, 12]]]);
  });
  test('changing a contact they see: the write carries the rule too', async () => {
    state.answer = t => (/^SELECT name, email/.test(t) ? { rows: [{ name: 'A', email: null, phone: null, company: null, contact_type: 'contact' }] } : /^UPDATE/.test(t) ? { rows: [], rowCount: 1 } : null);
    assert.equal((await contacts(HELD, 'PUT', '/5', { name: 'B', assigned_to: 44 })).status, 200);
    const up = find(/^UPDATE contacts SET name/)[0];
    assert.ok(up[0].endsWith(`WHERE id=$8 AND workspace_id=$9${CONTACT('contacts', 11)}`), up[0]);
    assert.deepEqual(up[1].slice(-4), ['5', 7, 1, 12]);
    assert.equal(up[1][4], 44, 'a member may hand the contact to someone else');
  });
  test('deleting asks the NARROWER rule: assigned to them (or a supplier), not merely seen through a deal', async () => {
    const one = await contacts(HELD, 'DELETE', '/5');
    assert.deepEqual([one.status, one.body], [404, { error: 'Not found' }]);
    state.answer = () => ({ rows: [], rowCount: 1 });
    const many = await contacts(HELD, 'POST', '/bulk/delete', { contactIds: [5, 6, 8] });
    assert.deepEqual(many.body, { deleted: 1 });
    assert.deepEqual(find(/^DELETE FROM contacts/), [
      [`DELETE FROM contacts WHERE id=$1 AND workspace_id=$2${OWN('contacts', 3)}`, ['5', 7, 12]],
      [`DELETE FROM contacts WHERE id IN ($2,$3,$4) AND workspace_id=$1${OWN('contacts', 5)}`, [7, 5, 6, 8, 12]],
    ]);
    assert.deepEqual(ruled(), [], 'no "contact of one of my deals" in a delete');
  });
  test('a new contact is theirs', async () => {
    state.answer = t => (/^INSERT INTO contacts/.test(t) ? { rows: [{ id: 60 }] } : null);
    assert.equal((await contacts(HELD, 'POST', '/', { name: 'New' })).status, 201);
    assert.equal(find(/^INSERT INTO contacts/)[0][1][5], 12);
  });
  test('import: a row whose email is somebody else\'s contact is left out — not rewritten, not taken, no deal made', async () => {
    state.answer = (t, p) => (/^SELECT id FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(t) ? { rows: p[1] === 'new@example.com' ? [] : [{ id: p[1] === 'mine@example.com' ? 31 : 30 }] }
      : t === SEES_CONTACT ? { rows: p[0] === 31 ? [{}] : [] }
      : /^INSERT INTO contacts/.test(t) ? { rows: [{ id: 70 }] } : null);
    const r = await contacts(HELD, 'POST', '/import', {
      contacts: [{ name: 'Theirs', email: 'Theirs@Example.com', phone: '1' }, { name: 'Mine', email: 'mine@example.com' }, { name: 'New', email: 'new@example.com' }],
      createDealsForNew: true, createDealsForUpdated: true, pipelineId: 3, stageId: 9,
    });
    assert.deepEqual([r.status, r.body], [201, { imported: 2, deals_created: 2, skipped: 1 }]);
    assert.deepEqual(find(/^SELECT 1 FROM contacts c/).map(a => a[1]), [[30, 7, 12], [31, 7, 12]]);
    assert.deepEqual(find(/^UPDATE contacts/).map(a => a[1][5]), [31], 'only the contact the member sees is rewritten');
    assert.deepEqual(find(/^INSERT INTO deals/).map(a => a[1][1]), [31, 70], 'no deal on the contact left out');
  });
});
