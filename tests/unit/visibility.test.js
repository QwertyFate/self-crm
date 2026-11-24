// UNIT tests for utils/visibility.js (MEMBER_VISIBILITY_CHANGES Part 1, 2026-11-25): the pieces of SQL that hold
// a member to the deals and contacts assigned to them.
//
// What these show: WHO is held (only req.ownOnly === true), that everyone else's statement is left exactly as it
// was (no text, no parameter), and the exact rule that is added. What the rule SELECTS on real rows is shown on a
// real Postgres (the log names the harness); a stand-in database cannot run a WHERE.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');
const v = require(path.join(ROOT, 'utils', 'visibility.js'));

const member = { ownOnly: true, userId: 12, workspaceId: 7 };
const DEAL = (d, n) => ` AND (${d}.assigned_to = $${n} OR (${d}.assigned_to IS NULL AND EXISTS (SELECT 1 FROM contacts vc WHERE vc.id = ${d}.contact_id AND vc.assigned_to = $${n})))`;
const CONTACT = (c, n) => ` AND (${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier' OR EXISTS (SELECT 1 FROM deals vd WHERE vd.contact_id = ${c}.id AND vd.assigned_to = $${n}))`;
const OWN = (c, n) => ` AND (${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier')`;

describe('utils/visibility.js: who is held to their own', () => {
  test('only a real true on req.ownOnly; anything else sees everything', () => {
    assert.equal(v.restricted({ ownOnly: true }), true);
    for (const x of [false, undefined, null, 1, 'true', 't', {}]) assert.equal(v.restricted({ ownOnly: x }), false, String(x));
  });
  test('whoever is not held gets no SQL and no parameter: the statement is the one that shipped', () => {
    for (const fn of [v.deals, v.contacts, v.ownContacts]) {
      const params = [7];
      assert.equal(fn({ ownOnly: false, userId: 12 }, params), '');
      assert.deepEqual(params, [7]);
    }
  });
});

describe('utils/visibility.js: the rule that is added', () => {
  test('a deal: assigned to the member, or assigned to nobody while its contact is the member\'s', () => {
    const params = [7];
    assert.equal(v.deals(member, params), DEAL('d', 2));
    assert.deepEqual(params, [7, 12]);
  });
  test('a contact: assigned to the member, a supplier, or the contact of a deal assigned to the member', () => {
    const params = [7, 'contact'];
    assert.equal(v.contacts(member, params), CONTACT('c', 3));
    assert.deepEqual(params, [7, 'contact', 12]);
  });
  test('deleting a contact is narrower: seeing it through a deal is not enough', () => {
    const params = [5, 7];
    const sql = v.ownContacts(member, params, 'contacts');
    assert.equal(sql, OWN('contacts', 3));
    assert.doesNotMatch(sql, /deals/);
  });
  test('the placeholder is the number of the parameter just pushed, wherever the statement stands', () => {
    const params = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 5, 7];
    assert.equal(v.deals(member, params, 'deals'), DEAL('deals', 12));
    assert.equal(params.length, 12); assert.equal(params[11], 12);
  });
  test('the member\'s id is only ever a parameter, never text in the statement', () => {
    const sql = v.deals({ ownOnly: true, userId: "1 OR 1=1" }, [7]) + v.contacts({ ownOnly: true, userId: "1 OR 1=1" }, [7]);
    assert.doesNotMatch(sql, /1 OR 1=1/);
  });
  test('an unassigned deal with no contact, or a contact of nobody, matches no branch (read from the text)', () => {
    // assigned_to = $n is never true for NULL; the EXISTS needs a contact row whose assignee is the member.
    assert.match(DEAL('d', 2), /d\.assigned_to IS NULL AND EXISTS \(SELECT 1 FROM contacts vc WHERE vc\.id = d\.contact_id AND vc\.assigned_to = \$2\)/);
    assert.equal(v.deals(member, [7]), DEAL('d', 2));
  });
});

describe('utils/visibility.js: one row by id', () => {
  const asked = [];
  const pool = rows => ({ query: async (sql, p) => { asked.push([sql, p]); return { rows }; } });
  test('whoever is not held: yes, and the database is not asked', async () => {
    asked.length = 0;
    assert.equal(await v.seesDeal(pool([]), { ownOnly: false }, 5), true);
    assert.equal(await v.seesContact(pool([]), { ownOnly: false }, 5), true);
    assert.equal(asked.length, 0);
  });
  test('a held member: asked with the id, the workspace and the member; a row means yes, none means no', async () => {
    asked.length = 0;
    assert.equal(await v.seesDeal(pool([{}]), member, 5), true);
    assert.equal(await v.seesDeal(pool([]), member, 5), false);
    assert.equal(await v.seesContact(pool([{}]), member, 9), true);
    assert.equal(await v.seesContact(pool([]), member, 9), false);
    assert.equal(asked[0][0], `SELECT 1 FROM deals d WHERE d.id = $1 AND d.workspace_id = $2${DEAL('d', 3)}`);
    assert.deepEqual(asked[0][1], [5, 7, 12]);
    assert.equal(asked[2][0], `SELECT 1 FROM contacts c WHERE c.id = $1 AND c.workspace_id = $2${CONTACT('c', 3)}`);
    assert.deepEqual(asked[2][1], [9, 7, 12]);
  });
});

describe('utils/visibility.js keeps to the rule for utilities', () => {
  test('it requires nothing: the pool is handed in', () => {
    assert.doesNotMatch(read('utils/visibility.js'), /require\(/);
  });
});

describe('middleware/auth.js puts the answer for this caller on req.ownOnly', () => {
  const { inject } = require('../helpers/load-route');
  const abs = path.join(ROOT, 'middleware', 'auth.js');
  const run = async row => {
    const calls = [];
    const restore = inject('db.js', { pool: { query: async (sql, p) => { calls.push([sql, p]); return { rows: row ? [row] : [] }; } } });
    delete require.cache[abs];
    try {
      const req = { session: { userId: 12, workspaceId: 7, destroy() {} } };
      let passed = false;
      await require(abs)(req, { status: () => ({ json: () => {} }) }, () => { passed = true; });
      return { req, calls, passed };
    } finally { restore(); delete require.cache[abs]; }
  };
  test('a member of a workspace that has it on: true', async () => {
    const { req, calls, passed } = await run({ role: 'member', workspace_id: 7, timezone: null, members_own_only: true });
    assert.equal(passed, true); assert.equal(req.ownOnly, true);
    assert.equal(calls.length, 1, 'still one query per request');
    assert.match(calls[0][0], /w\.members_own_only/);
    assert.match(calls[0][0], /JOIN workspaces w ON w\.id = uw\.workspace_id/, 'the switch of the workspace the membership is in, not one a caller names');
    assert.deepEqual(calls[0][1], [12, 7]);
  });
  test('a member of a workspace that has it off, and an owner or admin whatever the switch: false', async () => {
    assert.equal((await run({ role: 'member', workspace_id: 7, members_own_only: false })).req.ownOnly, false);
    assert.equal((await run({ role: 'admin', workspace_id: 7, members_own_only: true })).req.ownOnly, false);
    assert.equal((await run({ role: 'owner', workspace_id: 7, members_own_only: true })).req.ownOnly, false);
  });
  test('only a real true from the database counts', async () => {
    for (const x of [null, undefined, 't', 1]) assert.equal((await run({ role: 'member', workspace_id: 7, members_own_only: x })).req.ownOnly, false, String(x));
  });
});

// Part 2 (2026-11-25): what hangs on a deal or a contact follows it.
describe('utils/visibility.js: a row that names a deal and/or a contact', () => {
  const LD = n => `EXISTS (SELECT 1 FROM deals ld WHERE ld.id = a.deal_id${DEAL('ld', n)})`;
  const LC = n => `EXISTS (SELECT 1 FROM contacts lc WHERE lc.id = a.contact_id${CONTACT('lc', n)})`;
  test('the deal decides when there is one, else the contact; a row that names neither is seen by everyone', () => {
    const params = [7];
    assert.equal(v.linked(member, params, { deal: 'a.deal_id', contact: 'a.contact_id' }),
      ` AND (CASE WHEN a.deal_id IS NOT NULL THEN ${LD(2)} WHEN a.contact_id IS NOT NULL THEN ${LC(2)} ELSE true END)`);
    assert.deepEqual(params, [7, 12]);
  });
  test('only one of the two columns, and rows that name nobody kept for owners and admins', () => {
    assert.equal(v.linked(member, [7], { contact: 'a.contact_id' }), ` AND (CASE WHEN a.contact_id IS NOT NULL THEN ${LC(2)} ELSE true END)`);
    assert.equal(v.linked(member, [7], { deal: 'a.deal_id', orphans: false }), ` AND (CASE WHEN a.deal_id IS NOT NULL THEN ${LD(2)} ELSE false END)`);
  });
  test('whoever is not held: nothing added', () => {
    const params = [7];
    assert.equal(v.linked({ ownOnly: false, userId: 12 }, params, { deal: 'a.deal_id', contact: 'a.contact_id' }), '');
    assert.deepEqual(params, [7]);
  });
  test('the bare conditions are the same ones the pieces use', () => {
    assert.equal(` AND ${v.rules.deal('d', 2)}`, DEAL('d', 2));
    assert.equal(` AND ${v.rules.contact('c', 2)}`, CONTACT('c', 2));
    assert.equal(` AND ${v.rules.ownContact('c', 2)}`, OWN('c', 2));
    assert.equal(` AND ${v.rules.linked({ deal: 'a.deal_id', contact: 'a.contact_id' }, 2)}`, v.linked(member, [7], { deal: 'a.deal_id', contact: 'a.contact_id' }));
  });
  test('one row by what it names: the deal first, then the contact, then the answer for rows that name nobody', async () => {
    const asked = [];
    const pool = rows => ({ query: async (sql, p) => { asked.push([sql.slice(0, 22), p]); return { rows }; } });
    assert.equal(await v.seesLinked(pool([]), { ownOnly: false }, { dealId: 5 }), true);
    assert.equal(asked.length, 0, 'whoever is not held: the database is not asked');
    assert.equal(await v.seesLinked(pool([{}]), member, { dealId: 5, contactId: 9 }), true);
    assert.equal(await v.seesLinked(pool([]), member, { dealId: 5, contactId: 9 }), false, 'a hidden deal is not rescued by its contact');
    assert.equal(await v.seesLinked(pool([{}]), member, { contactId: 9 }), true);
    assert.deepEqual(asked, [['SELECT 1 FROM deals d ', [5, 7, 12]], ['SELECT 1 FROM deals d ', [5, 7, 12]], ['SELECT 1 FROM contacts', [9, 7, 12]]]);
    assert.equal(await v.seesLinked(pool([]), member, {}), true);
    assert.equal(await v.seesLinked(pool([]), member, { orphans: false }), false);
    assert.equal(await v.seesLinked(pool([]), member), true);
  });
});
