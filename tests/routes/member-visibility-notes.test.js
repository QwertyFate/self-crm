// ROUTE tests for "members only see what is assigned to them", the notes (MEMBER_VISIBILITY_CHANGES Part 2,
// 2026-11-25): /api/activities, /api/activity-comments, a contact's documents, and the notes listed inside a
// contact (GET /api/contacts/:id).
//
// A note, a comment and a document HANG on a deal or a contact and follow it (utils/visibility.js, linked()):
// bound to a deal → seen when the deal is seen; on a contact only → when the contact is seen; on neither → by
// everyone. A comment follows its note.
//
// The real routes on a throwaway server; the database is a stand-in that records every statement. So these show
// WHAT each route asks: for a held member the rule is in the statement with the member's id (or the sees-check
// is asked first), a hidden row is a 404 / left out and NOTHING is written after it; for an owner, an admin and a
// member of a workspace without the switch the statements are the ones that shipped. What the rule selects on
// real rows is shown on a real Postgres (the log names the harness).
const { test, describe, beforeEach, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve, inject } = require('../helpers/load-route');

const DEAL_IS    = (d, n) => `(${d}.assigned_to = $${n} OR (${d}.assigned_to IS NULL AND EXISTS (SELECT 1 FROM contacts vc WHERE vc.id = ${d}.contact_id AND vc.assigned_to = $${n})))`;
const CONTACT_IS = (c, n) => `(${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier' OR EXISTS (SELECT 1 FROM deals vd WHERE vd.contact_id = ${c}.id AND vd.assigned_to = $${n}))`;
const LINKED_IS  = (t, n) => `(CASE WHEN ${t}.deal_id IS NOT NULL THEN EXISTS (SELECT 1 FROM deals ld WHERE ld.id = ${t}.deal_id AND ${DEAL_IS('ld', n)}) WHEN ${t}.contact_id IS NOT NULL THEN EXISTS (SELECT 1 FROM contacts lc WHERE lc.id = ${t}.contact_id AND ${CONTACT_IS('lc', n)}) ELSE true END)`;
const LINKED     = (t, n) => ` AND ${LINKED_IS(t, n)}`;
const SEES_DEAL    = `SELECT 1 FROM deals d WHERE d.id = $1 AND d.workspace_id = $2 AND ${DEAL_IS('d', 3)}`;
const SEES_CONTACT = `SELECT 1 FROM contacts c WHERE c.id = $1 AND c.workspace_id = $2 AND ${CONTACT_IS('c', 3)}`;
const ON_SEEN_ACTIVITY = (col, n) => ` AND EXISTS (SELECT 1 FROM activities va WHERE va.id = ${col} AND ${LINKED_IS('va', n)})`;

const HELD = { id: 12, workspaceId: 7, role: 'member', ownOnly: true };
const FREE = [{ id: 1, workspaceId: 7, role: 'owner' }, { id: 2, workspaceId: 7, role: 'admin' }, { id: 12, workspaceId: 7, role: 'member' }];

// The Activities list as it shipped (`mine` and `seen` empty) and as a held member asks it.
const LIST = (mine = '', seen = '') => [
  'SELECT a.id, a.workspace_id, a.contact_id, a.type, a.content, a.created_by, a.created_at,',
  'a.completed, a.source, a.cancelled_at, a.calcom_uid, a.calcom_event_type_id,',
  "TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date,",
  'c.name AS contact_name,',
  'a.deal_id AS bound_deal_id,',
  'COALESCE(db.id, d.id) AS deal_id, COALESCE(db.title, d.title) AS deal_title,',
  "COALESCE(u.name, CASE WHEN a.source = 'engine' THEN 'Upgrads Engine' WHEN a.source = 'notetaker' THEN 'Notetaker' WHEN a.source = 'fonio' THEN 'fonio' END) AS logged_by_name, u.email AS logged_by_email",
  'FROM activities a',
  'LEFT JOIN contacts c ON c.id = a.contact_id',
  'LEFT JOIN users u ON u.id = a.created_by',
  'LEFT JOIN deals db ON db.id = a.deal_id',
  'LEFT JOIN LATERAL (',
  'SELECT id, title FROM deals',
  `WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id${mine}`,
  'ORDER BY deals.updated_at DESC LIMIT 1',
  ') d ON true',
  'WHERE a.workspace_id = $1',
  `AND ($2::int IS NULL OR a.deal_id = $2 OR (a.deal_id IS NULL AND a.contact_id = (SELECT contact_id FROM deals WHERE id = $2 AND workspace_id = $1${mine})))`,
  `AND ($3::int IS NULL OR a.contact_id = $3)${seen}`,
  'ORDER BY a.created_at DESC LIMIT 200',
].join(' ');
const ONE = seen => `LEFT JOIN users u ON u.id = a.created_by WHERE a.id = $1 AND a.workspace_id = $2${seen}`;
const PATCH = seen => `completed = COALESCE($6, completed) WHERE id=$3 AND workspace_id=$4${seen} RETURNING id`;

// The stand-in: `answer(sql, params)` may return { rows, rowCount } for a statement; everything else finds nothing.
const state = { asked: [], answer: null, storage: [] };
const pool = { query: async (sql, params) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.asked.push([t, params]);
  return (state.answer && state.answer(t, params)) || { rows: [], rowCount: 0 };
} };
const storageStub = {
  uploadDocument: async (...a) => { state.storage.push(['upload', ...a.slice(0, 2)]); return { storagePath: '7/55/x.pdf' }; },
  deleteDocument: async p => { state.storage.push(['delete', p]); },
  signedDocumentUrl: async p => { state.storage.push(['sign', p]); return `https://signed.example/${p}`; },
};
before(() => { inject('storage.js', storageStub); });
beforeEach(() => { state.asked = []; state.answer = null; state.storage = []; });

const withServer = async (file, mount, user, fn) => {
  const server = await serve({ [mount]: loadRoute(file, { pool, user }) });
  try { return await fn(server); } finally { await server.close(); }
};
const call = (file, mount, user, method, url, body) => withServer(file, mount, user, s => s.request(method, mount + url, body));
const notes    = (user, method, url, body) => call('activities.js', '/api/activities', user, method, url, body);
const comments = (user, method, url, body) => call('activity-comments.js', '/api/activity-comments', user, method, url, body);
const docs     = (user, method, url, body) => call('contact-documents.js', '/api/contacts', user, method, url, body);
const contacts = (user, method, url, body) => call('contacts.js', '/api/contacts', user, method, url, body);
const upload = (user, contactId, fields = {}) => withServer('contact-documents.js', '/api/contacts', user, async s => {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'Vertrag.pdf');
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${s.base}/api/contacts/${contactId}/documents`, { method: 'POST', body: fd });
  let body = null; try { body = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, body };
});
const find  = re => state.asked.filter(a => re.test(a[0]));
const wrote = () => state.asked.filter(a => /^(INSERT|UPDATE|DELETE)/.test(a[0]));
// any trace of the rule: its inner aliases (vc, vd, ld, lc, va) or a sees-check
const ruled = () => state.asked.filter(a => /\b(v[cda]|l[dc])\./.test(a[0]) || /^SELECT 1 FROM/.test(a[0]));

describe('/api/activities: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, no extra parameter, no extra question`, async () => {
    state.answer = t => (/^SELECT contact_id FROM deals/.test(t) ? { rows: [{ contact_id: 6 }] } : /^INSERT INTO activities/.test(t) ? { rows: [{ id: 40 }] }
      : /^UPDATE activities/.test(t) ? { rows: [{ id: 5 }], rowCount: 1 } : /^DELETE/.test(t) ? { rows: [], rowCount: 1 } : null);
    await notes(user, 'GET', '/');
    await notes(user, 'GET', '/?deal_id=5&contact_id=6');
    await notes(user, 'GET', '/5');
    assert.equal((await notes(user, 'POST', '/', { content: 'x', type: 'note', deal_id: 5, contact_id: 6 })).status, 201);
    assert.equal((await notes(user, 'PATCH', '/5', { content: 'y', autosave: true })).status, 200);
    assert.equal((await notes(user, 'DELETE', '/5')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(find(/^SELECT a\.id.*LATERAL/), [[LIST(), [7, null, null]], [LIST(), [7, 5, 6]]]);
    const one = find(/^SELECT a\.id/).filter(a => !/LATERAL/.test(a[0]))[0];
    assert.ok(one[0].endsWith(ONE('')), one[0]); assert.deepEqual(one[1], ['5', 7]);
    assert.deepEqual(find(/^SELECT contact_id FROM deals/), [['SELECT contact_id FROM deals WHERE id=$1 AND workspace_id=$2', [5, 7]]]);
    const up = find(/^UPDATE activities/)[0];
    assert.ok(up[0].endsWith(PATCH('')), up[0]); assert.equal(up[1].length, 11);
    assert.deepEqual(find(/^DELETE/), [['DELETE FROM activities WHERE id=$1 AND workspace_id=$2', ['5', 7]]]);
  });
});

describe('/api/activities: a held member', () => {
  test('the list: only notes on what they see, and the derived deal and the ?deal_id filter look only among deals they see', async () => {
    await notes(HELD, 'GET', '/');
    await notes(HELD, 'GET', '/?deal_id=5&contact_id=6');
    const mine = ` AND ${DEAL_IS('deals', 4)}`;
    assert.deepEqual(state.asked, [[LIST(mine, LINKED('a', 4)), [7, null, null, 12]], [LIST(mine, LINKED('a', 4)), [7, 5, 6, 12]]]);
    assert.equal(LIST(mine, LINKED('a', 4)).split(mine).length - 1, 2, 'the rule for a deal looked up by itself is in both places');
  });
  test('opening somebody else\'s note is a 404; their own opens', async () => {
    const r = await notes(HELD, 'GET', '/5');
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.equal(state.asked.length, 1);
    assert.ok(state.asked[0][0].endsWith(ONE(LINKED('a', 3))), state.asked[0][0]);
    assert.deepEqual(state.asked[0][1], ['5', 7, 12]);
    state.answer = () => ({ rows: [{ id: 5, content: 'mine' }] });
    assert.equal((await notes(HELD, 'GET', '/5')).body.content, 'mine');
  });
  test('changing somebody else\'s note is a 404: the rule is in the UPDATE itself, and nobody is told', async () => {
    const r = await notes(HELD, 'PATCH', '/5', { content: 'hello @ben', completed: true });
    assert.deepEqual([r.status, r.body], [404, { error: 'Activity not found' }]);
    assert.equal(state.asked.length, 1, 'no mention scan after the refusal');
    assert.ok(state.asked[0][0].endsWith(PATCH(LINKED('activities', 12))), state.asked[0][0]);
    assert.equal(state.asked[0][1].length, 12); assert.equal(state.asked[0][1][11], 12);
    assert.deepEqual(state.asked[0][1].slice(2, 4), ['5', 7]);
  });
  test('changing their own note works as before', async () => {
    state.answer = t => (/^UPDATE activities/.test(t) ? { rows: [{ id: 5 }], rowCount: 1 } : null);
    const r = await notes(HELD, 'PATCH', '/5', { completed: true, autosave: true });
    assert.deepEqual([r.status, r.body], [200, { success: true, id: 5 }]);
  });
  test('deleting somebody else\'s note is a 404 and the rule is in the DELETE itself', async () => {
    const r = await notes(HELD, 'DELETE', '/5');
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[`DELETE FROM activities WHERE id=$1 AND workspace_id=$2${LINKED('activities', 3)}`, ['5', 7, 12]]]);
  });
  test('a note is not written on a deal the member cannot see: 404, nothing written', async () => {
    const r = await notes(HELD, 'POST', '/', { content: 'x', type: 'note', deal_id: 5 });
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[SEES_DEAL, [5, 7, 12]]]);
  });
  test('nor on a contact they cannot see — also when the deal named with it IS theirs', async () => {
    state.answer = t => (t === SEES_DEAL ? { rows: [{}] } : null);
    const both = await notes(HELD, 'POST', '/', { content: 'x', type: 'note', deal_id: 5, contact_id: 6 });
    assert.deepEqual([both.status, both.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[SEES_DEAL, [5, 7, 12]], [SEES_CONTACT, [6, 7, 12]]]);
    state.asked = [];
    assert.equal((await notes(HELD, 'POST', '/', { content: 'x', type: 'note', contact_id: 6 })).status, 404);
    assert.deepEqual(state.asked, [[SEES_CONTACT, [6, 7, 12]]]);
    assert.deepEqual(wrote(), []);
  });
  test('a contact id that is not a number is refused without asking the database about it', async () => {
    const r = await notes(HELD, 'POST', '/', { content: 'x', type: 'note', contact_id: '6 OR 1=1' });
    assert.equal(r.status, 404);
    assert.deepEqual(state.asked, []);
  });
  test('on a deal and contact they see it is written, bound to both, by them', async () => {
    state.answer = t => (/^SELECT 1 FROM/.test(t) ? { rows: [{}] } : /^SELECT contact_id FROM deals/.test(t) ? { rows: [{ contact_id: 6 }] } : /^INSERT INTO activities/.test(t) ? { rows: [{ id: 40 }] } : null);
    const r = await notes(HELD, 'POST', '/', { content: 'x', type: 'note', deal_id: 5, contact_id: 6 });
    assert.deepEqual([r.status, r.body], [201, { id: 40 }]);
    const ins = find(/^INSERT INTO activities/)[0][1];
    assert.deepEqual([ins[0], ins[1], ins[4], ins[8]], [7, 6, 12, 5]);
  });
  test('a note on neither a deal nor a contact needs no check: it is about nobody\'s lead', async () => {
    state.answer = t => (/^INSERT INTO activities/.test(t) ? { rows: [{ id: 41 }] } : null);
    assert.equal((await notes(HELD, 'POST', '/', { content: 'x', type: 'note' })).status, 201);
    assert.deepEqual(ruled(), []);
  });
});

describe('GET /api/contacts/:id: the notes listed inside a contact', () => {
  const CONTACT_ROW = t => (/FROM contacts c LEFT JOIN users/.test(t) ? { rows: [{ id: 5, name: 'C' }] } : null);
  test('a held member on a contact they see: a note bound to somebody else\'s deal stays out', async () => {
    state.answer = CONTACT_ROW;
    assert.equal((await contacts(HELD, 'GET', '/5')).status, 200);
    const list = find(/FROM activities a/)[0];
    assert.ok(list[0].endsWith(`LEFT JOIN deals db ON db.id = a.deal_id WHERE a.contact_id = $1 AND a.workspace_id = $2${LINKED('a', 3)} ORDER BY a.created_at DESC`), list[0]);
    assert.deepEqual(list[1], ['5', 7, 12]);
  });
  for (const user of FREE) test(`${user.role}: the list as it shipped`, async () => {
    state.answer = CONTACT_ROW;
    assert.equal((await contacts(user, 'GET', '/5')).status, 200);
    const list = find(/FROM activities a/)[0];
    assert.ok(list[0].endsWith('LEFT JOIN deals db ON db.id = a.deal_id WHERE a.contact_id = $1 AND a.workspace_id = $2 ORDER BY a.created_at DESC'), list[0]);
    assert.deepEqual(list[1], ['5', 7]);
    assert.deepEqual(ruled(), []);
  });
});

describe('/api/activity-comments: a comment follows its note', () => {
  const LIST_C = seen => `SELECT ac.*, u.name AS created_by_name FROM activity_comments ac LEFT JOIN users u ON u.id = ac.created_by WHERE ac.activity_id = $1 AND ac.workspace_id = $2${seen} ORDER BY ac.created_at ASC`;
  for (const user of FREE) test(`${user.role}: exactly what shipped`, async () => {
    state.answer = t => (/^SELECT id FROM activities/.test(t) ? { rows: [{ id: 9 }] } : /^INSERT INTO activity_comments/.test(t) ? { rows: [{ id: 3 }] } : /^DELETE/.test(t) ? { rows: [], rowCount: 1 } : null);
    await comments(user, 'GET', '/?activity_id=9');
    assert.equal((await comments(user, 'POST', '/', { activity_id: 9, content: 'c' })).status, 201);
    assert.equal((await comments(user, 'DELETE', '/3')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(state.asked[0], [LIST_C(''), [9, 7]]);
    assert.deepEqual(find(/^SELECT id FROM activities/), [['SELECT id FROM activities WHERE id=$1 AND workspace_id=$2', [9, 7]]]);
    assert.deepEqual(find(/^DELETE/), [['DELETE FROM activity_comments WHERE id=$1 AND workspace_id=$2', ['3', 7]]]);
  });
  test('a held member gets the comments only of a note they see (the rule is in the list)', async () => {
    const r = await comments(HELD, 'GET', '/?activity_id=9');
    assert.deepEqual([r.status, r.body], [200, []]);
    assert.deepEqual(state.asked, [[LIST_C(ON_SEEN_ACTIVITY('ac.activity_id', 3)), [9, 7, 12]]]);
  });
  test('a held member cannot comment on somebody else\'s note: answered like a note that is not there, nothing written', async () => {
    const r = await comments(HELD, 'POST', '/', { activity_id: 9, content: 'hello @ben' });
    assert.deepEqual([r.status, r.body], [404, { error: 'Activity not found' }]);
    assert.deepEqual(state.asked, [[`SELECT id FROM activities WHERE id=$1 AND workspace_id=$2${LINKED('activities', 3)}`, [9, 7, 12]]]);
  });
  test('on a note they see the comment is written', async () => {
    state.answer = t => (/^SELECT id FROM activities/.test(t) ? { rows: [{ id: 9 }] } : /^INSERT INTO activity_comments/.test(t) ? { rows: [{ id: 3 }] } : null);
    assert.equal((await comments(HELD, 'POST', '/', { activity_id: 9, content: 'c' })).status, 201);
    assert.deepEqual(find(/^INSERT INTO activity_comments/)[0][1], [9, null, 7, 'c', 12]);
  });
  test('a held member cannot delete a comment under somebody else\'s note: the rule is in the DELETE', async () => {
    const r = await comments(HELD, 'DELETE', '/3');
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[`DELETE FROM activity_comments WHERE id=$1 AND workspace_id=$2${ON_SEEN_ACTIVITY('activity_comments.activity_id', 3)}`, ['3', 7, 12]]]);
  });
});

describe('a contact\'s documents', () => {
  const OWN_C = 'SELECT id, contact_type FROM contacts WHERE id=$1 AND workspace_id=$2';
  const DOC_LIST = seen => `LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.contact_id = $1 AND d.workspace_id = $2${seen} ORDER BY d.created_at DESC, d.id DESC`;
  const seenContact = (more = () => null) => (t, p) => (t.startsWith(OWN_C) ? { rows: [{ id: 55, contact_type: 'contact' }] } : more(t, p));

  for (const user of FREE) test(`${user.role}: exactly what shipped`, async () => {
    state.answer = seenContact(t => (/^SELECT id FROM deals/.test(t) ? { rows: [{ id: 17 }] } : /^SELECT (id, )?storage_path/.test(t) ? { rows: [{ id: 9, storage_path: 'p' }] }
      : /^INSERT INTO contact_documents/.test(t) ? { rows: [{ id: 9 }] } : null));
    await docs(user, 'GET', '/55/documents');
    assert.equal((await upload(user, 55, { deal_id: '17' })).status, 201);
    await withServer('contact-documents.js', '/api/contacts', user, s => fetch(`${s.base}/api/contacts/55/documents/9/download`, { redirect: 'manual' }));
    assert.equal((await docs(user, 'DELETE', '/55/documents/9')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(find(/^SELECT id, contact_type/), Array(4).fill([OWN_C, [55, 7]]));
    const list = find(/FROM contact_documents d LEFT JOIN/)[0];
    assert.ok(list[0].endsWith(DOC_LIST('')), list[0]); assert.deepEqual(list[1], [55, 7]);
    assert.deepEqual(find(/^SELECT id FROM deals/), [['SELECT id FROM deals WHERE id=$1 AND workspace_id=$2 AND contact_id=$3', [17, 7, 55]]]);
    assert.deepEqual(find(/^SELECT storage_path/), [['SELECT storage_path FROM contact_documents WHERE id=$1 AND contact_id=$2 AND workspace_id=$3', [9, 55, 7]]]);
    assert.deepEqual(find(/^SELECT id, storage_path/), [['SELECT id, storage_path FROM contact_documents WHERE id=$1 AND contact_id=$2 AND workspace_id=$3', [9, 55, 7]]]);
    assert.deepEqual(state.storage.map(s => s[0]), ['upload', 'sign', 'delete']);
  });

  test('a held member on somebody else\'s contact: 404 in all four handlers, and the store is not touched', async () => {
    const answers = [
      await docs(HELD, 'GET', '/55/documents'),
      await upload(HELD, 55),
      await docs(HELD, 'GET', '/55/documents/9/download'),
      await docs(HELD, 'DELETE', '/55/documents/9'),
    ];
    for (const r of answers) assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, Array(4).fill([`${OWN_C} AND ${CONTACT_IS('contacts', 3)}`, [55, 7, 12]]));
    assert.deepEqual(state.storage, []);
  });
  test('on a contact they see, the list leaves out a document bound to somebody else\'s deal', async () => {
    state.answer = seenContact();
    assert.equal((await docs(HELD, 'GET', '/55/documents')).status, 200);
    const list = find(/FROM contact_documents d LEFT JOIN/)[0];
    assert.ok(list[0].endsWith(DOC_LIST(LINKED('d', 3))), list[0]);
    assert.deepEqual(list[1], [55, 7, 12]);
  });
  test('such a document is a 404 to download and to delete: no link is signed, nothing is removed', async () => {
    state.answer = seenContact();
    const down = await docs(HELD, 'GET', '/55/documents/9/download');
    const del  = await docs(HELD, 'DELETE', '/55/documents/9');
    assert.deepEqual([down.status, del.status, del.body], [404, 404, { error: 'Not found' }]);
    assert.deepEqual(find(/^SELECT storage_path/), [[`SELECT storage_path FROM contact_documents WHERE id=$1 AND contact_id=$2 AND workspace_id=$3${LINKED('contact_documents', 4)}`, [9, 55, 7, 12]]]);
    assert.deepEqual(find(/^SELECT id, storage_path/), [[`SELECT id, storage_path FROM contact_documents WHERE id=$1 AND contact_id=$2 AND workspace_id=$3${LINKED('contact_documents', 4)}`, [9, 55, 7, 12]]]);
    assert.deepEqual(state.storage, []);
    assert.deepEqual(wrote(), []);
  });
  test('a document they see is signed and deleted as before', async () => {
    state.answer = seenContact(t => (/^SELECT (id, )?storage_path/.test(t) ? { rows: [{ id: 9, storage_path: 'p' }] } : null));
    const down = await withServer('contact-documents.js', '/api/contacts', HELD, s => fetch(`${s.base}/api/contacts/55/documents/9/download`, { redirect: 'manual' }));
    assert.equal(down.status, 302);
    assert.equal((await docs(HELD, 'DELETE', '/55/documents/9')).status, 200);
    assert.deepEqual(state.storage, [['sign', 'p'], ['delete', 'p']]);
    assert.equal(wrote().length, 1);
  });
  test('an upload is not bound to a deal the member cannot see: refused like a deal that is not this contact\'s, nothing stored', async () => {
    state.answer = seenContact();
    const r = await upload(HELD, 55, { deal_id: '17' });
    assert.deepEqual([r.status, r.body], [400, { error: 'The deal does not belong to this contact' }]);
    assert.deepEqual(find(/^SELECT id FROM deals/), [[`SELECT id FROM deals WHERE id=$1 AND workspace_id=$2 AND contact_id=$3 AND ${DEAL_IS('deals', 4)}`, [17, 7, 55, 12]]]);
    assert.deepEqual(state.storage, []);
    assert.deepEqual(wrote(), []);
  });
  test('an upload on a contact they see, with their deal or with none, is stored', async () => {
    state.answer = seenContact(t => (/^SELECT id FROM deals/.test(t) ? { rows: [{ id: 17 }] } : /^INSERT INTO contact_documents/.test(t) ? { rows: [{ id: 9 }] } : null));
    assert.equal((await upload(HELD, 55, { deal_id: '17' })).status, 201);
    assert.equal((await upload(HELD, 55)).status, 201);
    assert.deepEqual(find(/^INSERT INTO contact_documents/).map(a => [a[1][1], a[1][2], a[1][8]]), [[55, 17, 12], [55, null, 12]]);
  });
});

describe('routes/notetaker.js', () => {
  test('has nothing a logged-in person calls: one public receiver, no session check to scope', () => {
    const src = require('../helpers/client-fn').read('routes/notetaker.js');
    assert.deepEqual(src.match(/^router\.\w+\('[^']+'/gm), ["router.post('/webhook/:token'"]);
    assert.doesNotMatch(src, /requireAuth/);
  });
});

// A mention's notification points at what the NOTE hangs on (its own deal, else its contact), so the bell's rule for
// a held member (routes/notifications.js) is the note's own rule. Until 2026-11-25 it pointed at the contact's most
// recently updated deal, which can be somebody else's.
describe('a mention points at the note\'s own deal, else its contact', () => {
  const people = (t, own) => (/^SELECT id, name FROM users WHERE workspace_id = \$1/.test(t) ? { rows: [{ id: 12, name: 'Anna Berg' }, { id: 13, name: 'Ben' }] }
    : /^SELECT name FROM users WHERE id=\$1/.test(t) ? { rows: [{ name: 'Olga' }] }
    : /^SELECT a\.contact_id, a\.deal_id/.test(t) ? { rows: [{ contact_id: 9, contact_name: 'Kunde', ...own }] }
    : /^INSERT INTO activit/.test(t) ? { rows: [{ id: 70 }] }
    : /^SELECT id FROM activities WHERE id=\$1/.test(t) ? { rows: [{ id: 70 }] }
    : /^SELECT contact_id FROM deals WHERE id=\$1 AND workspace_id=\$2/.test(t) ? { rows: [{ contact_id: 9 }] } : null);
  const bell = () => state.asked.filter(a => /^INSERT INTO notifications/.test(a[0])).map(a => a[1].slice(1, 2).concat(a[1].slice(7)));
  const newest = () => state.asked.filter(a => /FROM deals WHERE contact_id = \$1 AND workspace_id = \$2 ORDER BY updated_at DESC LIMIT 1/.test(a[0]));

  test('a note on a deal: the mentioned people are pointed at THAT deal', async () => {
    state.answer = t => people(t, { deal_id: 5 });
    assert.equal((await notes(FREE[0], 'POST', '/', { type: 'note', content: 'bitte @anna und @ben', deal_id: 5, contact_id: 9 })).status, 201);
    assert.deepEqual(bell(), [[12, 'deal', 5], [13, 'deal', 5]]);
    assert.deepEqual(newest(), [], 'the contact\'s newest deal is not looked up any more');
  });
  test('a note on a contact only: pointed at the contact, whatever deals that contact has', async () => {
    state.answer = t => people(t, { deal_id: null });
    assert.equal((await notes(FREE[0], 'POST', '/', { type: 'note', content: '@ben bitte anrufen', contact_id: 9 })).status, 201);
    assert.deepEqual(bell(), [[13, 'contact', 9]]);
    assert.deepEqual(newest(), []);
  });
  test('a comment follows its note: the note\'s deal, else the note\'s contact', async () => {
    state.answer = t => (/^SELECT id, name FROM users WHERE workspace_id = \$1 AND LOWER\(name\) = ANY/.test(t) ? { rows: [{ id: 13, name: 'Ben' }] } : people(t, { deal_id: 5 }));
    assert.equal((await comments(FREE[0], 'POST', '/', { activity_id: 70, content: '@ben schau mal' })).status, 201);
    state.answer = t => (/^SELECT id, name FROM users WHERE workspace_id = \$1 AND LOWER\(name\) = ANY/.test(t) ? { rows: [{ id: 13, name: 'Ben' }] } : people(t, { deal_id: null }));
    assert.equal((await comments(FREE[0], 'POST', '/', { activity_id: 70, content: '@ben noch einmal' })).status, 201);
    assert.deepEqual(bell(), [[13, 'deal', 5], [13, 'contact', 9]]);
    assert.deepEqual(newest(), []);
  });
});
