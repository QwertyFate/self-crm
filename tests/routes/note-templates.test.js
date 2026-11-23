// ROUTE tests: /api/note-templates — the workspace's note templates (NOTE_EDITOR_CHANGES Part 4).
//
// A template is a name and a text. Picking one in a note box puts its text into the note; the note is then saved as
// any note is, in the notes table (activities.content). Only the templates themselves live here, in a list of their
// own per workspace (decided by the user 2026-11-18), and every member may add, change and delete them.
//
// Pinned: the list is the caller's workspace only, by name; a template is checked (name 1–80, text 1–20,000, a name
// once per workspace whatever its capitals, at most 50); changing and deleting never reach another workspace; every
// refusal carries a code the page turns into a sentence; who and where always come from the session.
//
// Part 8 (2026-11-20): a template is a text OR a questionnaire — a list of questions set up once, of which the user
// later only writes the answers. Pinned at the end: how the questions are cleaned, checked, stored and sent back.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const WS = 7, OTHER = 8;
const state = { rows: [], next: 1, calls: [] };
const pool = {
  query: async (sql, p = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: t, params: p });
    const view = r => ({ id: r.id, name: r.name, content: r.content, questions: r.questions ?? null, created_by: r.created_by, updated_at: r.updated_at });
    // a jsonb column takes JSON text; a list handed over as it is would be read as a Postgres array — the real one fails there
    const json = v => { if (v !== null && typeof v !== 'string') throw new Error('questions must be handed over as JSON text or null'); return v === null ? null : JSON.parse(v); };
    if (t.startsWith('SELECT id, name, content, questions, created_by, updated_at FROM note_templates WHERE workspace_id = $1 ORDER BY name_key, id')) {
      return { rows: state.rows.filter(r => r.workspace_id === p[0]).sort((a, b) => (a.name_key < b.name_key ? -1 : a.name_key > b.name_key ? 1 : a.id - b.id)).map(view) };
    }
    if (t.startsWith('SELECT COUNT(*)::int AS n FROM note_templates WHERE workspace_id = $1')) return { rows: [{ n: state.rows.filter(r => r.workspace_id === p[0]).length }] };
    // the fake compares name_key exactly, as a database under a C locale does: the lower-casing is the route's
    if (t.startsWith('SELECT id FROM note_templates WHERE workspace_id = $1 AND name_key = $2 AND id <> $3')) {
      return { rows: state.rows.filter(r => r.workspace_id === p[0] && r.name_key === p[1] && r.id !== p[2]).map(r => ({ id: r.id })) };
    }
    if (t.startsWith('INSERT INTO note_templates (workspace_id, name, name_key, content, questions, created_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING')) {
      if (state.rows.some(r => r.workspace_id === p[0] && r.name_key === p[2])) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const row = { id: state.next++, workspace_id: p[0], name: p[1], name_key: p[2], content: p[3], questions: json(p[4]), created_by: p[5], updated_at: '2026-11-18T10:00:00.000Z' };
      state.rows.push(row); return { rows: [view(row)] };
    }
    if (t.startsWith('UPDATE note_templates SET name = $3, name_key = $4, content = $5, questions = $6::jsonb, updated_at = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING')) {
      const row = state.rows.find(r => r.id === p[0] && r.workspace_id === p[1]); if (!row) return { rows: [] };
      row.name = p[2]; row.name_key = p[3]; row.content = p[4]; row.questions = json(p[5]); row.updated_at = '2026-11-18T11:00:00.000Z'; return { rows: [view(row)] };
    }
    if (t.startsWith('DELETE FROM note_templates WHERE id = $1 AND workspace_id = $2')) {
      const i = state.rows.findIndex(r => r.id === p[0] && r.workspace_id === p[1]); if (i < 0) return { rowCount: 0, rows: [] };
      state.rows.splice(i, 1); return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected statement: ${t}`);
  },
};
const writes = () => state.calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

let member, other;
before(async () => {
  member = await serve({ '/api/note-templates': loadRoute('note-templates.js', { pool, user: { id: 3, workspaceId: WS, role: 'member' } }) });
  other  = await serve({ '/api/note-templates': loadRoute('note-templates.js', { pool, user: { id: 9, workspaceId: OTHER, role: 'owner' } }) });
});
after(async () => { await member.close(); await other.close(); });
beforeEach(() => { state.rows = []; state.next = 1; state.calls = []; });

const add = (srv, body) => srv.request('POST', '/api/note-templates', body);
const QUESTIONS = 'Budget:\nDecision maker:\nTimeline:\n';

describe('the list', () => {
  test('empty at first', async () => {
    const r = await member.request('GET', '/api/note-templates');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { templates: [], max: 50 });
  });
  test('this workspace\'s templates, by name whatever the capitals; never another workspace\'s', async () => {
    await add(member, { name: 'zweites Gespräch', content: 'B' });
    await add(member, { name: 'Erstgespräch', content: 'A' });
    await add(other, { name: 'Other', content: 'X' });
    const r = await member.request('GET', '/api/note-templates');
    assert.deepEqual(r.body.templates.map(t => t.name), ['Erstgespräch', 'zweites Gespräch']);
    assert.deepEqual((await other.request('GET', '/api/note-templates')).body.templates.map(t => t.name), ['Other']);
    assert.deepEqual(Object.keys(r.body.templates[0]).sort(), ['content', 'created_by', 'id', 'name', 'questions', 'updated_at']);
  });
});

describe('adding', () => {
  test('any member adds one: the name trimmed, the text kept as typed (line breaks, markup as text)', async () => {
    const r = await add(member, { name: '  Discovery call ', content: QUESTIONS + '<b>not markup</b>' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.template, { id: 1, name: 'Discovery call', content: QUESTIONS + '<b>not markup</b>', questions: null, created_by: 3, updated_at: '2026-11-18T10:00:00.000Z' });
    assert.deepEqual(state.rows[0].workspace_id, WS, 'the workspace comes from the session');
  });
  test('who and where never come from the body', async () => {
    await add(member, { name: 'A', content: 'x', workspace_id: OTHER, created_by: 99, id: 500 });
    assert.deepEqual([state.rows[0].workspace_id, state.rows[0].created_by, state.rows[0].id], [WS, 3, 1]);
  });
  test('refused with a code, nothing written: no name, a name too long, no text, a text too long, a wrong shape', async () => {
    for (const [body, code] of [[{ content: 'x' }, 'name'], [{ name: '   ', content: 'x' }, 'name'], [{ name: 'n'.repeat(81), content: 'x' }, 'name'], [{ name: 5, content: 'x' }, 'name'],
      [{ name: 'A' }, 'content'], [{ name: 'A', content: '  \n ' }, 'content'], [{ name: 'A', content: 'x'.repeat(20001) }, 'content'], [{ name: 'A', content: ['x'] }, 'content']]) {
      const r = await add(member, body);
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60)); assert.equal(r.body.code, code);
    }
    assert.deepEqual(writes(), []);
    assert.equal((await add(member, { name: 'n'.repeat(80), content: 'x'.repeat(20000) })).status, 201, 'the limits themselves are allowed');
  });
  test('a name exists once per workspace, whatever its capitals; another workspace may use it too', async () => {
    await add(member, { name: 'Discovery', content: 'x' });
    const again = await add(member, { name: 'DISCOVERY', content: 'y' });
    assert.equal(again.status, 409); assert.equal(again.body.code, 'name_taken');
    assert.equal((await add(other, { name: 'Discovery', content: 'z' })).status, 201);
    assert.equal(state.rows.length, 2);
  });
  test('umlauts count as letters too: the name is lower-cased by the route, not by the database (a C locale leaves Ä alone)', async () => {
    await add(member, { name: 'Erstgespräch Überblick', content: 'x' });
    const again = await add(member, { name: 'ERSTGESPRÄCH ÜBERBLICK', content: 'y' });
    assert.equal(again.status, 409); assert.equal(again.body.code, 'name_taken');
    assert.equal(state.rows[0].name_key, 'erstgespräch überblick');
    assert.equal(state.rows[0].name, 'Erstgespräch Überblick', 'the name itself is kept as typed');
    const code = read('routes/note-templates.js').replace(/\/\*[\s\S]*?\*\//, '');   // the code without its header
    assert.doesNotMatch(code, /LOWER\(/, 'no lower-casing left to the database');
    assert.match(code, /return \{ name, key: name\.toLowerCase\(\), content: b\.content, questions: null \};/);
  });
  test('two people adding the same name at the same moment: the index decides, and the loser hears "name taken"', async () => {
    const keep = pool.query;
    pool.query = async (sql, p) => (/^SELECT id FROM note_templates WHERE workspace_id = \$1 AND name_key/.test(String(sql).trim()) ? { rows: [] } : keep(sql, p));   // both checks pass
    try {
      const [a, b] = await Promise.all([add(member, { name: 'Same', content: 'x' }), add(member, { name: 'same', content: 'y' })]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409]);
      assert.equal([a, b].find(r => r.status === 409).body.code, 'name_taken');
    } finally { pool.query = keep; }
  });
  test('at most 50 per workspace', async () => {
    for (let i = 0; i < 50; i++) state.rows.push({ id: state.next++, workspace_id: WS, name: `T${i}`, name_key: `t${i}`, content: 'x', created_by: 1, updated_at: 'x' });
    const r = await add(member, { name: 'One more', content: 'x' });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'limit');
    assert.equal((await add(other, { name: 'One more', content: 'x' })).status, 201, 'the limit is per workspace');
  });
});

describe('changing', () => {
  test('name and text are replaced; the answer is the template as it now is', async () => {
    await add(member, { name: 'Discovery', content: 'old' });
    const r = await member.request('PUT', '/api/note-templates/1', { name: 'Discovery call', content: 'new\ntext' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.template.name, r.body.template.content, r.body.template.updated_at], ['Discovery call', 'new\ntext', '2026-11-18T11:00:00.000Z']);
  });
  test('keeping its own name is no clash; taking another template\'s name is', async () => {
    await add(member, { name: 'One', content: 'x' }); await add(member, { name: 'Two', content: 'x' });
    assert.equal((await member.request('PUT', '/api/note-templates/1', { name: 'one', content: 'y' })).status, 200);
    const clash = await member.request('PUT', '/api/note-templates/1', { name: 'TWO', content: 'y' });
    assert.equal(clash.status, 409); assert.equal(clash.body.code, 'name_taken');
  });
  test('the same checks as adding', async () => {
    await add(member, { name: 'One', content: 'x' });
    assert.equal((await member.request('PUT', '/api/note-templates/1', { name: '', content: 'y' })).body.code, 'name');
    assert.equal((await member.request('PUT', '/api/note-templates/1', { name: 'One', content: ' ' })).body.code, 'content');
    assert.equal(state.rows[0].content, 'x');
  });
  test('another workspace\'s template, an unknown one, a bad id: 404 not_found, nothing changed', async () => {
    await add(other, { name: 'Theirs', content: 'x' });
    for (const id of ['1', '999', 'abc', '0', '-1', '1.5']) {
      const r = await member.request('PUT', `/api/note-templates/${id}`, { name: 'Mine now', content: 'y' });
      assert.equal(r.status, 404, id); assert.equal(r.body.code, 'not_found');
    }
    assert.deepEqual([state.rows[0].name, state.rows[0].content], ['Theirs', 'x']);
  });
});

describe('deleting', () => {
  test('any member deletes one; notes are not touched (no statement names another table)', async () => {
    await add(member, { name: 'One', content: 'x' });
    const r = await member.request('DELETE', '/api/note-templates/1');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true });
    assert.equal(state.rows.length, 0);
    for (const c of state.calls) assert.match(c.sql, /note_templates/, c.sql);
  });
  test('another workspace\'s template, an unknown one, a bad id: 404, nothing deleted', async () => {
    await add(other, { name: 'Theirs', content: 'x' });
    for (const id of ['1', '999', 'abc']) assert.equal((await member.request('DELETE', `/api/note-templates/${id}`)).status, 404, id);
    assert.equal(state.rows.length, 1);
  });
});

// ── Part 8: a questionnaire ──────────────────────────────────────────────────
describe('a questionnaire: questions set up once (Part 8)', () => {
  const ASKED = ['What is the budget?', 'Is the financing clarified?', 'When should the move happen?'];

  test('added with its questions in their order; the answer and the list carry them', async () => {
    const r = await add(member, { name: 'First call', questions: ASKED });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.template.questions, ASKED);
    assert.deepEqual((await member.request('GET', '/api/note-templates')).body.templates[0].questions, ASKED);
  });
  test('its text is made by the route: the questions as plain text, a blank line between them — never taken from the body', async () => {
    const r = await add(member, { name: 'First call', questions: ASKED, content: 'something else' });
    assert.equal(r.body.template.content, 'What is the budget?\n\nIs the financing clarified?\n\nWhen should the move happen?');
    assert.equal(state.rows[0].content, r.body.template.content);
  });
  test('each question is one line: trimmed, line breaks and runs of spaces made one space; empty rows are left out', async () => {
    const r = await add(member, { name: 'A', questions: ['  Budget?  ', '', '   ', 'Who\ndecides\t and   when?', '<b>markup stays text</b>'] });
    assert.deepEqual(r.body.template.questions, ['Budget?', 'Who decides and when?', '<b>markup stays text</b>']);
  });
  test('the list goes to the database as JSON text, a text template as nothing', async () => {
    await add(member, { name: 'Q', questions: ['One?', 'Two?'] });
    await add(member, { name: 'T', content: 'text' });
    const [q, t] = writes();
    assert.equal(q.params[4], '["One?","Two?"]'); assert.equal(t.params[4], null);
    assert.match(read('routes/note-templates.js'), /^const stored = questions => \(questions \? JSON\.stringify\(questions\) : null\);$/m);
  });
  test('a text template has no questions; `questions: null` in a body is a text template too', async () => {
    assert.equal((await add(member, { name: 'T', content: 'text' })).body.template.questions, null);
    const r = await add(member, { name: 'T2', content: 'text', questions: null });
    assert.equal(r.status, 201); assert.deepEqual([r.body.template.content, r.body.template.questions], ['text', null]);
  });
  test('refused with the code "questions", nothing written: no list, a list of something else, no question left, too many, one too long', async () => {
    for (const questions of ['Budget?', 5, { 0: 'Budget?' }, true, [], ['', '   ', '\n'], ['Budget?', 5], ['Budget?', null], ['Budget?', ['nested']],
      Array.from({ length: 41 }, (_, i) => `Question ${i}?`), ['q'.repeat(301)]]) {
      const r = await add(member, { name: 'A', questions, content: 'a text does not rescue it' });
      assert.equal(r.status, 400, JSON.stringify(questions).slice(0, 60)); assert.equal(r.body.code, 'questions');
    }
    assert.deepEqual(writes(), []);
    const most = await add(member, { name: 'Most', questions: Array.from({ length: 40 }, (_, i) => `${i}`.padEnd(300, 'q')) });
    assert.equal(most.status, 201, 'the limits themselves are allowed');
    assert.ok(most.body.template.content.length <= 20000, 'and the text made from them fits a template\'s text');
    assert.equal((await add(member, { name: 'Empty rows do not count', questions: [...Array.from({ length: 40 }, (_, i) => `Q${i}?`), '', ' '] })).status, 201);
  });
  test('the name is checked first, as for a text', async () => {
    assert.equal((await add(member, { name: ' ', questions: ASKED })).body.code, 'name');
    await add(member, { name: 'First call', questions: ASKED });
    assert.equal((await add(member, { name: 'FIRST CALL', questions: ASKED })).body.code, 'name_taken');
  });
  test('changing: the questions are replaced; a text becomes a questionnaire and a questionnaire a text again', async () => {
    await add(member, { name: 'First call', content: 'Budget:' });
    const asked = await member.request('PUT', '/api/note-templates/1', { name: 'First call', questions: ['Budget?', 'Timeline?'] });
    assert.deepEqual([asked.status, asked.body.template.questions, asked.body.template.content], [200, ['Budget?', 'Timeline?'], 'Budget?\n\nTimeline?']);
    const fewer = await member.request('PUT', '/api/note-templates/1', { name: 'First call', questions: ['Timeline?'] });
    assert.deepEqual([fewer.body.template.questions, fewer.body.template.content], [['Timeline?'], 'Timeline?']);
    const text = await member.request('PUT', '/api/note-templates/1', { name: 'First call', content: 'Plain again' });
    assert.deepEqual([text.body.template.questions, text.body.template.content, state.rows[0].questions], [null, 'Plain again', null]);
    const bad = await member.request('PUT', '/api/note-templates/1', { name: 'First call', questions: [] });
    assert.equal(bad.body.code, 'questions'); assert.equal(state.rows[0].content, 'Plain again');
  });
  test('another workspace never sees or changes them', async () => {
    await add(member, { name: 'First call', questions: ASKED });
    assert.deepEqual((await other.request('GET', '/api/note-templates')).body.templates, []);
    assert.equal((await other.request('PUT', '/api/note-templates/1', { name: 'Theirs', questions: ['x'] })).status, 404);
    assert.deepEqual(state.rows[0].questions, ASKED);
  });
  test('db.js: the questions are a column added afterwards; the table\'s own statement is as it was shipped', () => {
    const db = read('db.js');
    const at = db.indexOf('CREATE TABLE IF NOT EXISTS note_templates'), table = db.slice(at, db.indexOf(')\n  `);', at));
    assert.doesNotMatch(table, /questions/);
    assert.match(db, /await pool\.query\(`ALTER TABLE note_templates ADD COLUMN IF NOT EXISTS questions JSONB`\);/);
    assert.ok(db.indexOf('ADD COLUMN IF NOT EXISTS questions JSONB') > at, 'after the table exists');
  });
  test('the limits are the page\'s too', () => {
    assert.match(read('routes/note-templates.js'), /^const MAX_QUESTIONS = 40, MAX_QUESTION = 300;$/m);
    assert.match(read('public/js/note-templates.js'), /^const NTPL_MAX_QUESTIONS = 40, NTPL_MAX_QUESTION = 300;/m);
  });
});

describe('the wiring', () => {
  test('every statement names the workspace from the session', async () => {
    await add(member, { name: 'One', content: 'x' });
    await member.request('PUT', '/api/note-templates/1', { name: 'One', content: 'y' });
    await member.request('GET', '/api/note-templates');
    await member.request('DELETE', '/api/note-templates/1');
    for (const c of state.calls) assert.ok(c.params.includes(WS), c.sql);
  });
  test('the route needs a login and is mounted in server.js', () => {
    assert.match(read('routes/note-templates.js'), /^router\.use\(requireAuth\);$/m);
    assert.match(read('server.js'), /app\.use\('\/api\/note-templates', require\('\.\/routes\/note-templates'\)\);/);
  });
  test('db.js: a list of its own per workspace; the notes table is not touched', () => {
    const db = read('db.js');
    const table = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS note_templates'), db.indexOf(')\n  `);', db.indexOf('CREATE TABLE IF NOT EXISTS note_templates')));
    assert.match(table, /workspace_id\s+INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(table, /name\s+TEXT NOT NULL/); assert.match(table, /name_key\s+TEXT NOT NULL/); assert.match(table, /content\s+TEXT NOT NULL/);
    assert.match(table, /created_by\s+INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
    assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS note_templates_name ON note_templates \(workspace_id, name_key\)/);
    assert.doesNotMatch(db, /ALTER TABLE activities ADD COLUMN IF NOT EXISTS (is_)?template/);
  });
});
