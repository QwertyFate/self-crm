// ROUTE tests for "members only see what is assigned to them" in TASKS, their files, LISTINGS and ANALYTICS
// (MEMBER_VISIBILITY_CHANGES, pieces 2 and 3, 2026-11-25) — and for utils/task-visibility.js, the rule for tasks.
//
// The real routes on a throwaway server; the database is a stand-in that records every statement. So these show
// WHAT each route asks. For a held member: every statement that reads, counts or changes a task, a deal or a contact
// carries the rule with the member's id as its LAST parameter (the placeholder is that parameter's number), a row
// the rule hides is a 404 / left out, and NOTHING is asked or written after a refusal. For an owner, an admin and a
// member of a workspace without the switch: the statements that shipped, no extra question. What the rule selects
// on real rows — lists per person, sums, a refused write leaving the row untouched — is shown on a real Postgres
// (the log names the harness); a stand-in cannot run a WHERE.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, inject, ROOT } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

// The bare conditions of utils/visibility.js, spelt out (its own tests pin them), and what this piece builds on them.
const dealR    = (d, n) => `(${d}.assigned_to = $${n} OR (${d}.assigned_to IS NULL AND EXISTS (SELECT 1 FROM contacts vc WHERE vc.id = ${d}.contact_id AND vc.assigned_to = $${n})))`;
const contactR = (c, n) => `(${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier' OR EXISTS (SELECT 1 FROM deals vd WHERE vd.contact_id = ${c}.id AND vd.assigned_to = $${n}))`;
const DEAL     = (d, n) => ` AND ${dealR(d, n)}`;
const CONTACT  = (c, n) => ` AND ${contactR(c, n)}`;
const NAMES    = (a, n) => `(CASE WHEN ${a}.deal_id IS NOT NULL THEN EXISTS (SELECT 1 FROM deals ld WHERE ld.id = ${a}.deal_id AND ${dealR('ld', n)}) WHEN ${a}.contact_id IS NOT NULL THEN EXISTS (SELECT 1 FROM contacts lc WHERE lc.id = ${a}.contact_id AND ${contactR('lc', n)}) ELSE true END)`;
const TASK     = (t, n) => ` AND (${NAMES(t, n)} AND (${t}.parent_id IS NULL OR EXISTS (SELECT 1 FROM tasks pt WHERE pt.id = ${t}.parent_id AND ${NAMES('pt', n)})))`;
const SEES_TASK    = `SELECT 1 FROM tasks t WHERE t.id = $1 AND t.workspace_id = $2${TASK('t', 3)}`;
const SEES_DEAL    = `SELECT 1 FROM deals d WHERE d.id = $1 AND d.workspace_id = $2${DEAL('d', 3)}`;
const SEES_CONTACT = `SELECT 1 FROM contacts c WHERE c.id = $1 AND c.workspace_id = $2${CONTACT('c', 3)}`;

const HELD = { id: 12, workspaceId: 7, role: 'member', ownOnly: true };
const FREE = [{ id: 1, workspaceId: 7, role: 'owner' }, { id: 2, workspaceId: 7, role: 'admin' }, { id: 12, workspaceId: 7, role: 'member' }];

// The stand-in: `answer(sql, params)` may return { rows, rowCount } for a statement; everything else finds nothing.
const state = { asked: [], answer: null, files: [] };
const pool = { query: async (sql, params) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.asked.push([t, params]);
  return (state.answer && state.answer(t, params)) || { rows: [], rowCount: 0 };
} };
// storage.js needs Supabase; the files of a task go to a recording stand-in instead.
inject('storage.js', {
  uploadFile: async (...a) => { state.files.push(['upload', a[1]]); return { publicUrl: 'https://files.invalid/a.txt', storagePath: '7/5/a.txt' }; },
  deleteFile: async p => { state.files.push(['delete', p]); },
});
beforeEach(() => { state.asked = []; state.answer = null; state.files = []; });
const call = async (file, mount, user, method, url, body) => {
  const server = await serve({ [mount]: loadRoute(file, { pool, user }) });
  try { return await server.request(method, mount + url, body); } finally { await server.close(); }
};
const tasks     = (user, method, url, body) => call('tasks.js', '/api/tasks', user, method, url, body);
const files     = (user, method, url, body) => call('task-attachments.js', '/api/tasks', user, method, url, body);
const objects   = (user, method, url, body) => call('objects.js', '/api/objects', user, method, url, body);
const analytics = (user, url) => call('analytics.js', '/api/analytics', user, 'GET', url);
const upload = async (user, taskId) => {
  const server = await serve({ '/api/tasks': loadRoute('task-attachments.js', { pool, user }) });
  try {
    const fd = new FormData(); fd.append('file', new Blob(['hallo']), 'a.txt');
    const res = await fetch(`${server.base}/api/tasks/${taskId}/attachments`, { method: 'POST', body: fd });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally { await server.close(); }
};
const find  = re => state.asked.filter(a => re.test(a[0]));
const wrote = () => state.asked.filter(a => /^(INSERT|UPDATE|DELETE)/.test(a[0]));
const ruled = () => state.asked.filter(a => /\b(v[cd]|l[cd]|pt)\./.test(a[0]));
const last  = a => a[1][a[1].length - 1];

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('utils/task-visibility.js: which tasks a held member sees', () => {
  const tv = require(path.join(ROOT, 'utils', 'task-visibility.js'));
  const member = { ownOnly: true, userId: 12, workspaceId: 7 };
  test('whoever is not held gets no SQL and no parameter', () => {
    for (const x of [false, undefined, 1, 'true']) {
      const params = [7];
      assert.equal(tv.tasks({ ownOnly: x, userId: 12 }, params), '');
      assert.deepEqual(params, [7]);
    }
  });
  test('a task follows the deal it names, else the contact; a subtask also follows its parent; naming nothing hides nothing', () => {
    const params = [7];
    assert.equal(tv.tasks(member, params), TASK('t', 2));
    assert.deepEqual(params, [7, 12]);
    assert.match(TASK('t', 2), /ELSE true END\) AND \(t\.parent_id IS NULL OR EXISTS \(SELECT 1 FROM tasks pt WHERE pt\.id = t\.parent_id AND /);
  });
  test('the assignee of the task is not asked: the deal decides, also for a task assigned to the member', () => {
    assert.doesNotMatch(TASK('t', 2).replace(/\b(ld|lc|vc|vd)\.assigned_to/g, ''), /assigned_to/);
  });
  test('the placeholder is the number of the parameter just pushed; the alias is the statement\'s own', () => {
    const params = ['done', 5, 7];
    assert.equal(tv.tasks(member, params, 'tasks'), TASK('tasks', 4));
    assert.equal(params[3], 12);
    assert.equal(` AND ${tv.rule('t', 2)}`, TASK('t', 2));
    assert.equal(tv.own('s', 2), NAMES('s', 2));
  });
  test('one task by id: not held → yes without asking; held → asked with the id, the workspace and the member', async () => {
    const asked = [];
    const db = rows => ({ query: async (sql, p) => { asked.push([sql, p]); return { rows }; } });
    assert.equal(await tv.seesTask(db([]), { ownOnly: false }, 5), true);
    assert.equal(asked.length, 0);
    assert.equal(await tv.seesTask(db([{}]), member, 5), true);
    assert.equal(await tv.seesTask(db([]), member, 5), false);
    assert.deepEqual(asked[0], [SEES_TASK, [5, 7, 12]]);
  });
  test('it builds on utils/visibility.js and requires nothing else: the pool is handed in', () => {
    const requires = [...read('utils/task-visibility.js').matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
    assert.deepEqual(requires, ['./visibility']);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const LIST = (sub, contact, where) => `SELECT t.*, TO_CHAR(t.due_time, 'HH24:MI') AS due_time, TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date, u.name AS assigned_to_name, cu.name AS created_by_name, dl.title AS deal_title, ct.name AS contact_name, (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id${sub}) AS subtask_count, (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done'${sub}) AS subtask_done FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN deals dl ON dl.id = t.deal_id LEFT JOIN contacts ct ON ct.id = t.contact_id${contact} WHERE t.workspace_id = $1${where} ORDER BY t.parent_id NULLS FIRST, t.created_at ASC`;
const ONE  = (contact, where) => `SELECT t.*, TO_CHAR(t.due_time, 'HH24:MI') AS due_time, TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date, u.name AS assigned_to_name, dl.title AS deal_title, ct.name AS contact_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN deals dl ON dl.id = t.deal_id LEFT JOIN contacts ct ON ct.id = t.contact_id${contact} WHERE t.id = $1 AND t.workspace_id = $2${where}`;
const SUBS = where => `SELECT t.*, TO_CHAR(t.due_time, 'HH24:MI') AS due_time, TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date, u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.parent_id = $1${where} ORDER BY t.created_at ASC`;
const PUT  = where => `UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4, assigned_to=$5, due_date=$6, due_time=$14, due_tz=$15, project_id=$7, list_id=$8, deal_id=$9, contact_id=$10, custom_data=$11, updated_at=NOW() WHERE id=$12 AND workspace_id=$13${where}`;
const taskAnswers = t => (/^SELECT 1 FROM (deals|contacts|tasks)/.test(t) ? { rows: [{}] } : /FROM tasks t LEFT JOIN users u ON u\.id = t\.assigned_to LEFT JOIN deals/.test(t) ? { rows: [{ id: 5, title: 'T' }] }
  : /^INSERT INTO tasks/.test(t) ? { rows: [{ id: 50 }] } : /^(UPDATE|DELETE)/.test(t) ? { rows: [], rowCount: 1 } : null);

describe('/api/tasks: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, no extra parameter, no extra question`, async () => {
    state.answer = taskAnswers;
    assert.equal((await tasks(user, 'GET', '/')).status, 200);
    assert.equal((await tasks(user, 'GET', '/?list_id=3')).status, 200);
    assert.equal((await tasks(user, 'GET', '/5')).status, 200);
    assert.equal((await tasks(user, 'POST', '/', { title: 'N', deal_id: 4, contact_id: 6, parent_id: 5 })).status, 201);
    assert.equal((await tasks(user, 'PUT', '/5', { title: 'T', status: 'todo', priority: 'low', deal_id: 4, contact_id: 6 })).status, 200);
    assert.equal((await tasks(user, 'PATCH', '/5/status', { status: 'done' })).status, 200);
    assert.equal((await tasks(user, 'DELETE', '/5')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(state.asked.map(a => a[0]), [
      LIST('', '', ''), LIST('', '', ' AND t.list_id = $2'), ONE('', ''), SUBS(''),
      'SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2', 'SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2',
      'INSERT INTO tasks (workspace_id, parent_id, project_id, list_id, deal_id, contact_id, title, description, status, priority, assigned_to, due_date, due_time, created_by, due_tz) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
      'SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2', 'SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2', PUT(''),
      'UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3', 'DELETE FROM tasks WHERE id=$1 AND workspace_id=$2',
    ]);
    assert.deepEqual(state.asked.map(a => a[1].length), [1, 2, 2, 1, 2, 2, 15, 2, 2, 15, 3, 2]);
    assert.deepEqual([state.asked[0][1], state.asked[1][1], state.asked[2][1], state.asked[3][1], state.asked[4][1], state.asked[10][1], state.asked[11][1]], [[7], [7, '3'], ['5', 7], ['5'], [4, 7], ['done', '5', 7], ['5', 7]]);
  });
});

describe('/api/tasks: a held member', () => {
  test('the list: the rule after the page\'s own filter, the same rule in both subtask counts, and the contact\'s name only when the contact is seen', async () => {
    await tasks(HELD, 'GET', '/');
    await tasks(HELD, 'GET', '/?list_id=3');
    assert.deepEqual(state.asked, [
      [LIST(` AND ${NAMES('s', 2)}`, CONTACT('ct', 2), TASK('t', 2)), [7, 12]],
      [LIST(` AND ${NAMES('s', 3)}`, CONTACT('ct', 3), ` AND t.list_id = $2${TASK('t', 3)}`), [7, '3', 12]],
    ]);
  });
  test('opening a task that names somebody else\'s deal or contact is a 404, and its subtasks are not read — also when it is assigned to the member', async () => {
    const r = await tasks(HELD, 'GET', '/5');
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[ONE(CONTACT('ct', 3), TASK('t', 3)), ['5', 7, 12]]]);
  });
  test('opening their own: the subtasks are read with the rule for what each names', async () => {
    state.answer = taskAnswers;
    const r = await tasks(HELD, 'GET', '/5');
    assert.equal(r.status, 200);
    assert.deepEqual(state.asked[1], [SUBS(` AND ${NAMES('t', 2)}`), ['5', 12]]);
  });
  for (const [name, method, url, body, sql] of [
    ['changing', 'PUT', '/5', { title: 'T', status: 'todo', priority: 'low' }, PUT(TASK('tasks', 16))],
    ['the status of', 'PATCH', '/5/status', { status: 'done' }, `UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3${TASK('tasks', 4)}`],
    ['deleting', 'DELETE', '/5', undefined, `DELETE FROM tasks WHERE id=$1 AND workspace_id=$2${TASK('tasks', 3)}`],
  ]) test(`${name} a task they cannot see is a 404: the write itself carries the rule, so nothing is changed`, async () => {
    const r = await tasks(HELD, method, url, body);
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.equal(state.asked.length, 1);
    assert.equal(state.asked[0][0], sql);
    assert.equal(last(state.asked[0]), 12);
    state.asked = []; state.answer = taskAnswers;
    assert.equal((await tasks(HELD, method, url, body)).status, 200, 'their own goes through the same statement');
    assert.equal(state.asked[0][0], sql);
  });
  test('a task is not put on a deal or contact the member cannot see — new or changed: the answer of a deal that does not exist, nothing written', async () => {
    for (const [method, url] of [['POST', '/'], ['PUT', '/5']]) {
      state.asked = [];
      const d = await tasks(HELD, method, url, { title: 'N', status: 'todo', priority: 'low', deal_id: 4, contact_id: 6 });
      assert.deepEqual([d.status, d.body], [400, { error: 'Deal not found in this workspace' }]);
      assert.deepEqual(state.asked, [[`SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2${DEAL('deals', 3)}`, [4, 7, 12]]]);
      state.asked = [];
      const c = await tasks(HELD, method, url, { title: 'N', status: 'todo', priority: 'low', contact_id: 6 });
      assert.deepEqual([c.status, c.body], [400, { error: 'Contact not found in this workspace' }]);
      assert.deepEqual(state.asked, [[`SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2${CONTACT('contacts', 3)}`, [6, 7, 12]]]);
    }
    // a deal they see does not carry a contact they do not see
    state.asked = []; state.answer = t => (/^SELECT 1 FROM deals/.test(t) ? { rows: [{}] } : null);
    assert.equal((await tasks(HELD, 'POST', '/', { title: 'N', deal_id: 4, contact_id: 6 })).status, 400);
    assert.deepEqual(wrote(), []);
  });
  test('a subtask is not put under a task the member cannot see: 404, nothing written', async () => {
    const r = await tasks(HELD, 'POST', '/', { title: 'N', parent_id: 5 });
    assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
    assert.deepEqual(state.asked, [[SEES_TASK, [5, 7, 12]]]);
  });
  test('a new task on what they see, or on nothing, is made; no parent, no question', async () => {
    state.answer = taskAnswers;
    assert.equal((await tasks(HELD, 'POST', '/', { title: 'N', deal_id: 4, contact_id: 6, parent_id: 5 })).status, 201);
    assert.deepEqual(state.asked.map(a => a[0].slice(0, 26)), ['SELECT 1 FROM deals WHERE ', 'SELECT 1 FROM contacts WHE', 'SELECT 1 FROM tasks t WHER', 'INSERT INTO tasks (workspa']);
    state.asked = [];
    assert.equal((await tasks(HELD, 'POST', '/', { title: 'M' })).status, 201);
    assert.equal(state.asked.length, 1);
    assert.equal(state.asked[0][1].length, 15, 'the INSERT itself is the shipped one');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('/api/tasks/:taskId/attachments: a task\'s files follow the task', () => {
  const fileAnswers = t => (/^SELECT \* FROM task_attachments WHERE id/.test(t) ? { rows: [{ id: 9, storage_path: '7/5/a.txt' }] } : /^INSERT INTO task_attachments/.test(t) ? { rows: [{ id: 51 }] } : null);
  for (const user of FREE) test(`${user.role} (not held): the three statements that shipped, and the task is not asked about`, async () => {
    state.answer = fileAnswers;
    assert.equal((await files(user, 'GET', '/5/attachments')).status, 200);
    assert.equal((await upload(user, 5)).status, 201);
    assert.equal((await files(user, 'DELETE', '/5/attachments/9')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(state.asked.map(a => [a[0], a[1].length]), [
      ['SELECT ta.*, u.name AS uploaded_by_name FROM task_attachments ta LEFT JOIN users u ON u.id = ta.uploaded_by WHERE ta.task_id = $1 AND ta.workspace_id = $2 ORDER BY ta.created_at ASC', 2],
      ['INSERT INTO task_attachments (task_id, workspace_id, file_name, file_size, file_type, file_url, storage_path, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', 8],
      ['SELECT * FROM task_attachments WHERE id=$1 AND task_id=$2 AND workspace_id=$3', 3], ['DELETE FROM task_attachments WHERE id=$1', 1],
    ]);
    assert.deepEqual(state.files, [['upload', '5'], ['delete', '7/5/a.txt']]);
  });
  test('a held member and a task they cannot see: list, upload and delete are a 404 — nothing read, stored or deleted', async () => {
    state.answer = fileAnswers;   // the files exist; only the task is not theirs
    const got = [await files(HELD, 'GET', '/5/attachments'), await upload(HELD, 5), await files(HELD, 'DELETE', '/5/attachments/9')];
    assert.deepEqual(got.map(r => [r.status, r.body]), Array(3).fill([404, { error: 'Not found' }]));
    assert.deepEqual(state.asked, Array(3).fill([SEES_TASK, ['5', 7, 12]]));
    assert.deepEqual(state.files, []);
  });
  test('a held member and their own task: asked first, then the statements that shipped', async () => {
    state.answer = t => (t === SEES_TASK ? { rows: [{}] } : fileAnswers(t));
    assert.equal((await files(HELD, 'GET', '/5/attachments')).status, 200);
    assert.equal((await upload(HELD, 5)).status, 201);
    assert.equal((await files(HELD, 'DELETE', '/5/attachments/9')).status, 200);
    assert.deepEqual(state.asked.map(a => a[0] === SEES_TASK), [true, false, true, false, true, false, false]);
    assert.deepEqual(state.files, [['upload', '5'], ['delete', '7/5/a.txt']]);
  });
  test('an upload with no file is refused before anything is asked', async () => {
    assert.equal((await files(HELD, 'POST', '/5/attachments', {})).status, 400);
    assert.deepEqual(state.asked, []);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OBJ_DEALS    = where => `SELECT d.id, d.title, d.value, ps.name AS stage_name, ps.color AS stage_color, c.name AS contact_name, p.name AS pipeline_name FROM deal_objects dobj JOIN deals d ON d.id = dobj.deal_id LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN pipelines p ON p.id = d.pipeline_id WHERE dobj.object_id = $1 AND d.workspace_id = $2${where} ORDER BY d.created_at DESC`;
const OBJ_CONTACTS = where => `SELECT c.id, c.name, c.email, c.phone, c.company, c.contact_type FROM object_contacts oc JOIN contacts c ON c.id = oc.contact_id WHERE oc.object_id = $1 AND c.workspace_id = $2${where} ORDER BY oc.created_at`;
const objAnswers = t => (/^SELECT \* FROM objects WHERE id/.test(t) ? { rows: [{ id: 5, name: 'Haus' }] } : /^SELECT id FROM deals WHERE id/.test(t) ? { rows: [{ id: 4 }] } : null);

describe('/api/objects: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, no extra parameter, no extra question`, async () => {
    state.answer = objAnswers;
    assert.equal((await objects(user, 'GET', '/5')).status, 200);
    assert.equal((await objects(user, 'POST', '/5/deals', { deal_id: 4 })).status, 201);
    assert.equal((await objects(user, 'DELETE', '/5/deals/4')).status, 200);
    assert.equal((await objects(user, 'GET', '/5/contacts')).status, 200);
    assert.equal((await objects(user, 'POST', '/5/contacts', { contact_id: 6 })).status, 201);
    assert.equal((await objects(user, 'DELETE', '/5/contacts/6')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(state.asked, [
      ['SELECT * FROM objects WHERE id=$1 AND workspace_id=$2', ['5', 7]], [OBJ_DEALS(''), ['5', 7]], [OBJ_CONTACTS(''), ['5', 7]],
      ['SELECT id FROM deals WHERE id=$1 AND workspace_id=$2', [4, 7]], ['INSERT INTO deal_objects (deal_id, object_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [4, '5']],
      ['DELETE FROM deal_objects WHERE deal_id=$1 AND object_id=$2', ['4', '5']], [OBJ_CONTACTS(''), ['5', 7]],
      ['INSERT INTO object_contacts (object_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', ['5', 6]],
      ['DELETE FROM object_contacts WHERE object_id=$1 AND contact_id=$2', ['5', '6']],
    ]);
  });
});

describe('/api/objects: a held member', () => {
  test('the listings themselves are everybody\'s: the list and the listing\'s own row are read as before', async () => {
    state.answer = objAnswers;
    await objects(HELD, 'GET', '/');
    await objects(HELD, 'GET', '/5');
    assert.deepEqual(state.asked.slice(0, 2), [['SELECT * FROM objects WHERE workspace_id=$1 ORDER BY created_at DESC', [7]], ['SELECT * FROM objects WHERE id=$1 AND workspace_id=$2', ['5', 7]]]);
  });
  test('on a listing only the deals and contacts they see are shown', async () => {
    state.answer = objAnswers;
    await objects(HELD, 'GET', '/5');
    await objects(HELD, 'GET', '/5/contacts');
    assert.deepEqual(state.asked.slice(1), [[OBJ_DEALS(DEAL('d', 3)), ['5', 7, 12]], [OBJ_CONTACTS(CONTACT('c', 3)), ['5', 7, 12]], [OBJ_CONTACTS(CONTACT('c', 3)), ['5', 7, 12]]]);
  });
  test('linking somebody else\'s deal: the answer of a deal that does not exist, no link written', async () => {
    const r = await objects(HELD, 'POST', '/5/deals', { deal_id: 4 });
    assert.deepEqual([r.status, r.body], [404, { error: 'Deal not found' }]);
    assert.deepEqual(state.asked, [[`SELECT id FROM deals WHERE id=$1 AND workspace_id=$2${DEAL('deals', 3)}`, [4, 7, 12]]]);
  });
  test('unlinking somebody else\'s deal, linking or unlinking somebody else\'s contact: 404, nothing written', async () => {
    const got = [await objects(HELD, 'DELETE', '/5/deals/4'), await objects(HELD, 'POST', '/5/contacts', { contact_id: 6 }), await objects(HELD, 'DELETE', '/5/contacts/6')];
    assert.deepEqual(got.map(r => [r.status, r.body]), Array(3).fill([404, { error: 'Not found' }]));
    assert.deepEqual(state.asked, [[SEES_DEAL, ['4', 7, 12]], [SEES_CONTACT, [6, 7, 12]], [SEES_CONTACT, ['6', 7, 12]]]);
  });
  test('their own deal and contact they link and unlink', async () => {
    state.answer = t => (t === SEES_DEAL || t === SEES_CONTACT ? { rows: [{}] } : objAnswers(t));
    assert.equal((await objects(HELD, 'POST', '/5/deals', { deal_id: 4 })).status, 201);
    assert.equal((await objects(HELD, 'DELETE', '/5/deals/4')).status, 200);
    assert.equal((await objects(HELD, 'POST', '/5/contacts', { contact_id: 6 })).status, 201);
    assert.equal((await objects(HELD, 'DELETE', '/5/contacts/6')).status, 200);
    assert.deepEqual(wrote().map(a => a[0].slice(0, 30)), ['INSERT INTO deal_objects (deal', 'DELETE FROM deal_objects WHERE', 'INSERT INTO object_contacts (o', 'DELETE FROM object_contacts WH']);
  });
  test('a missing id is refused before anything is asked', async () => {
    assert.equal((await objects(HELD, 'POST', '/5/deals', {})).status, 400);
    assert.equal((await objects(HELD, 'POST', '/5/contacts', {})).status, 400);
    assert.deepEqual(state.asked, []);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Analytics. `valueField` is what the workspace sums ('value', a custom field, or nothing).
const analyticsAnswers = valueField => t => (
  /^SELECT analytics_config/.test(t) ? { rows: [{ analytics_config: { won_stage_ids: [1], lost_stage_ids: [2], value_field: valueField } }] }
  : /^SELECT field_key FROM deal_fields/.test(t) ? { rows: [{ field_key: 'preis' }] }
  : /total_contacts/.test(t) ? { rows: [{ total_contacts: '4' }] } : /new_contacts/.test(t) ? { rows: [{ new_contacts: '1' }] }
  : /AS prev_new_deals/.test(t) ? { rows: [{ prev_new_deals: '1' }] } : /AS new_deals/.test(t) ? { rows: [{ new_deals: '2' }] }
  : /AS av FROM/.test(t) ? { rows: [{ av: '5' }] } : /AS avg_deal_size/.test(t) ? { rows: [{ avg_deal_size: '5', n: '2' }] }
  : /AS prev_avg_deal_size/.test(t) ? { rows: [{ prev_avg_deal_size: null }] }
  : /AS total_tasks/.test(t) ? { rows: [{ total_tasks: '3', done_tasks: '1', overdue_tasks: '0' }] }
  : /^SELECT id, name FROM pipelines/.test(t) ? { rows: [{ id: 3, name: 'P' }] } : /^SELECT analytics_layout/.test(t) ? { rows: [{ analytics_layout: {} }] } : null);
// what a statement reads people's rows from — outside the rule's own sub-selects (their aliases are vc, vd, ld, lc, pt)
// and not counting `contacts c`, the contact joined to a deal the statement already holds to the rule
const reads = t => [...t.matchAll(/\b(?:FROM|JOIN) (deals|contacts|tasks)(?: (d))?\b(?! (?:vc|vd|ld|lc|pt|c)\b)/g)].map(m => [m[1], m[2] || m[1]]);
const SHIPPED_PARAMS = {   // every statement of the page, in order, for a workspace that sums a value
  summary: [[7], [7], [7], [7], [7], [7, 6], [7, 12, 6], [7], [7, 6], [7, 12, 6], [7], [7], [7, [1], [2], 6], [7], [7], [7, [1, 2]], [7, [1], [2], 6], [7], [7, 3], [7, 3, 6], [7, 3], [1]],
  trend: [[7], [7], [7], [7], [7]],
};

describe('/api/analytics: whoever is not held gets the whole workspace\'s numbers, asked exactly as shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule in any statement, the parameters that shipped`, async () => {
    state.answer = analyticsAnswers('value');
    assert.equal((await analytics(user, '/summary')).status, 200);
    const summary = state.asked; state.asked = [];
    assert.equal((await analytics(user, '/trend')).status, 200);
    assert.deepEqual(ruled().concat(summary.filter(a => /\b(v[cd]|l[cd]|pt)\./.test(a[0]))), []);
    assert.deepEqual(summary.map(a => a[1]), SHIPPED_PARAMS.summary.slice(0, -1).concat([[user.id]]));
    assert.deepEqual(state.asked.map(a => a[1]), SHIPPED_PARAMS.trend);
    assert.equal(summary[4][0], 'SELECT stage_id, COUNT(*) AS cnt, COALESCE(SUM(value),0) AS val FROM deals WHERE workspace_id=$1 GROUP BY stage_id');
    assert.equal(summary[2][0], 'SELECT COUNT(*) AS total_contacts FROM contacts WHERE workspace_id=$1');
    assert.match(summary[10][0], /FROM tasks WHERE workspace_id=\$1$/);
    assert.match(summary[11][0], /LEFT JOIN deals d ON d\.pipeline_id = p\.id AND d\.workspace_id = p\.workspace_id WHERE p\.workspace_id=\$1 GROUP BY/);
    assert.match(state.asked[2][0], /FROM contacts WHERE workspace_id=\$1 AND created_at >= date_trunc\('day'/);
    assert.doesNotMatch(state.asked.map(a => a[0]).join(' '), /\{OWN\}|\{TABLE\}/);
  });
});

describe('/api/analytics: a held member gets THEIR numbers', () => {
  for (const valueField of ['value', 'preis', null]) test(`summary, summing ${valueField || 'nothing'}: every statement that reads deals, contacts or tasks carries the rule, and no other does`, async () => {
    state.answer = analyticsAnswers(valueField);
    const r = await analytics(HELD, '/summary?months=12&pipeline_id=3');
    assert.equal(r.status, 200);
    const people = state.asked.filter(a => reads(a[0]).length);
    assert.equal(people.length, valueField ? 15 : 12, 'two contact counts, the deal statements, one task count');
    for (const [sql, params] of people) {
      const n = params.length;
      assert.equal(params[n - 1], 12, sql);
      const [[table, alias]] = reads(sql);
      const piece = table === 'tasks' ? TASK('tasks', n) : table === 'contacts' ? CONTACT('contacts', n) : DEAL(alias, n);
      assert.ok(sql.includes(piece), `${table} read without the rule:\n${sql}`);
      assert.equal(reads(sql).length, 1, 'one table of people\'s rows per statement');
    }
    const others = state.asked.filter(a => !reads(a[0]).length);
    assert.deepEqual(others.filter(a => /\b(v[cd]|l[cd]|pt)\./.test(a[0])), []);
    assert.deepEqual(others.map(a => a[0].slice(0, 34)), [
      'SELECT analytics_config FROM worksp', 'SELECT field_key FROM deal_fields W', 'SELECT ps.id, ps.name, ps.color, p.', 'SELECT field_key, name, type FROM d',
      'SELECT id, name FROM pipelines WHER', 'SELECT id, name, color FROM pipelin', 'SELECT analytics_layout FROM users ',
    ].map(s => s.slice(0, 34)));
  });
  test('where the rule sits: after each statement\'s own conditions, inside the JOIN for the tables that list every pipeline and every member', async () => {
    state.answer = analyticsAnswers('value');
    await analytics(HELD, '/summary');
    const one = re => { const hit = find(re); assert.equal(hit.length, 1, String(re)); return hit[0]; };
    assert.deepEqual(one(/AS total_contacts/), [`SELECT COUNT(*) AS total_contacts FROM contacts WHERE workspace_id=$1${CONTACT('contacts', 2)}`, [7, 12]]);
    assert.deepEqual(one(/AS new_contacts/)[0], `SELECT COUNT(*) AS new_contacts FROM contacts WHERE workspace_id=$1 AND created_at >= date_trunc('month', NOW())${CONTACT('contacts', 2)}`);
    assert.deepEqual(one(/^SELECT stage_id, COUNT\(\*\) AS cnt, COALESCE\(SUM\(value\),0\) AS val FROM deals WHERE workspace_id=\$1 AND \(deals/), [`SELECT stage_id, COUNT(*) AS cnt, COALESCE(SUM(value),0) AS val FROM deals WHERE workspace_id=$1${DEAL('deals', 2)} GROUP BY stage_id`, [7, 12]]);
    assert.deepEqual(one(/AS new_deals/), [`SELECT COUNT(*) AS new_deals FROM deals WHERE workspace_id=$1 AND created_at >= NOW() - ($2 || ' months')::interval${DEAL('deals', 3)}`, [7, 6, 12]]);
    assert.ok(one(/AS prev_new_deals/)[0].endsWith(`AND created_at < NOW() - ($3 || ' months')::interval${DEAL('deals', 4)}`));
    assert.ok(one(/AS av FROM/)[0].endsWith(`value IS NOT NULL${DEAL('deals', 2)}`));
    assert.ok(one(/AS avg_deal_size/)[0].endsWith(`($2 || ' months')::interval${DEAL('deals', 3)}`));
    assert.ok(one(/AS prev_avg_deal_size/)[0].endsWith(`($3 || ' months')::interval${DEAL('deals', 4)}`));
    assert.ok(one(/AS total_tasks/)[0].endsWith(`FROM tasks WHERE workspace_id=$1${TASK('tasks', 2)}`));
    assert.ok(one(/FROM pipelines p LEFT JOIN deals d/)[0].includes(`LEFT JOIN deals d ON d.pipeline_id = p.id AND d.workspace_id = p.workspace_id${DEAL('d', 2)} WHERE p.workspace_id=$1 GROUP BY`), 'a pipeline with none of their deals keeps its row');
    const owner = one(/FROM user_workspaces uw/);
    assert.ok(owner[0].includes(`AND d.created_at >= NOW() - ($4 || ' months')::interval${DEAL('d', 5)} WHERE uw.workspace_id = $1 GROUP BY`), 'every member keeps a row');
    assert.deepEqual(owner[1], [7, [1], [2], 6, 12]);
    assert.ok(one(/c\.company AS contact_company/)[0].includes(`AND (d.stage_id IS NULL OR NOT (d.stage_id = ANY($2::int[])))${DEAL('d', 3)} ORDER BY val DESC NULLS LAST`));
    assert.ok(one(/AS ym/)[0].includes(`|| ' months')::interval)${DEAL('deals', 5)} GROUP BY 1 ORDER BY 1`));
    assert.ok(one(/AND pipeline_id=\$2 AND created_at/)[0].includes(`($3 || ' months')::interval${DEAL('deals', 4)} GROUP BY stage_id`));
    assert.ok(one(/FROM deals d WHERE d\.workspace_id=\$1 AND d\.pipeline_id=\$2/)[0].endsWith(`d.pipeline_id=$2${DEAL('d', 3)} GROUP BY d.stage_id`));
  });
  for (const period of ['week', 'month', 'year']) test(`trend (${period}): the contacts, the deals and the value series chart only what they see`, async () => {
    state.answer = analyticsAnswers('value');
    assert.equal((await analytics(HELD, `/trend?period=${period}`)).status, 200);
    const series = state.asked.filter(a => /generate_series/.test(a[0]));
    assert.equal(series.length, 3);
    assert.ok(series[0][0].includes(`FROM contacts WHERE workspace_id=$1${CONTACT('contacts', 2)} AND created_at >= date_trunc(`), series[0][0]);
    assert.ok(series[1][0].includes(`COUNT(*) AS cnt FROM deals WHERE workspace_id=$1${DEAL('deals', 2)} AND created_at >= date_trunc(`), series[1][0]);
    assert.ok(series[2][0].includes(`COALESCE(SUM(value),0) AS val FROM deals WHERE workspace_id=$1${DEAL('deals', 2)} AND created_at >= date_trunc(`), series[2][0]);
    assert.deepEqual(series.map(a => a[1]), [[7, 12], [7, 12], [7, 12]]);
    assert.doesNotMatch(series.map(a => a[0]).join(' '), /\{OWN\}|\{TABLE\}/);
  });
  test('the rule\'s own placeholder is put into the series as written (a replacement string would read "$2" as a pattern)', () => {
    assert.match(read('routes/analytics.js'), /\.replace\('\{OWN\}', \(\) => visibility\.contacts\(req, q, 'contacts'\)\)/);
    assert.match(read('routes/analytics.js'), /\.replace\('\{OWN\}', \(\) => visibility\.deals\(req, q, 'deals'\)\)/);
  });
  test('the field the money is summed over is still the only name written into the SQL, and only after the workspace\'s own check', async () => {
    state.answer = analyticsAnswers("x') OR 1=1 --");
    assert.equal((await analytics(HELD, '/summary')).status, 200);
    assert.equal(state.asked.some(a => /1=1/.test(a[0])), false);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('/api/pipelines: structure is everybody\'s, and "empty" means empty for EVERYONE', () => {
  test('a held member\'s delete still counts every deal in the pipeline, not only theirs — and is refused with that count', async () => {
    const seen = [];
    const client = { query: async (sql, p) => { const t = String(sql).replace(/\s+/g, ' ').trim(); seen.push([t, p]); return /FOR UPDATE$/.test(t) ? { rows: [{ id: 4 }] } : /COUNT/.test(t) ? { rows: [{ n: 3 }] } : { rows: [] }; }, release() {} };
    const own = { query: async () => { throw new Error('the pool itself is asked nothing'); }, connect: async () => client };
    const server = await serve({ '/api/pipelines': loadRoute('pipelines.js', { pool: own, user: HELD }) });
    let r; try { r = await server.request('DELETE', '/api/pipelines/4'); } finally { await server.close(); }
    assert.deepEqual([r.status, r.body.code, r.body.deals], [409, 'has_deals', 3]);
    assert.deepEqual(seen.filter(s => /deals/.test(s[0])), [['SELECT COUNT(*)::int AS n FROM deals WHERE pipeline_id=$1', [4]]]);
    assert.equal(seen.some(s => /^DELETE/.test(s[0])), false);
  });
  test('the pipelines with their stages are listed for a held member as for everyone', async () => {
    const server = await serve({ '/api/pipelines': loadRoute('pipelines.js', { pool, user: HELD }) });
    try { assert.equal((await server.request('GET', '/api/pipelines')).status, 200); } finally { await server.close(); }
    assert.equal(state.asked.length, 1);
    assert.deepEqual(state.asked[0][1], [7]);
    assert.deepEqual(ruled(), []);
    assert.doesNotMatch(read('routes/pipelines.js'), /visibility/, 'no statement of this file reads a deal or contact for the screen');
  });
});
