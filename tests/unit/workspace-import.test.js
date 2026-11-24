// UNIT tests for utils/workspace-import.js (WORKSPACE_IMPORT_CHANGES Parts 1–2, 2026-11-24): the DATA of an export
// (contacts, deals, notes and their comments, with the pipelines and fields they need) brought into a workspace
// that exists here. The rule the whole file stands on: an import only ADDS; nothing that is in the database is
// replaced, changed or deleted. The check (Part 1) writes nothing at all; the import (Part 2) writes by INSERT only,
// with ids the database gives — and the tests hold both to that.
//
// A file is a real one: made with the export's own bundleEntries, utils/tar.js and gzip. The database is a stand-in
// that records what it is asked: for the check one that refuses everything that is not a SELECT, for the import a
// connection that knows a transaction's statements, the reads and the two kinds of INSERT. (That the import does on
// a real Postgres what these tests say is the main thread's own harness.)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { read } = require('../helpers/client-fn');
const { tarStream } = require('../../utils/tar');
const exporter = require('../../utils/workspace-export');
const imp = require('../../utils/workspace-import');

// ── a file ──
const BUNDLE = (tables = {}, more = {}) => ({ format: exporter.FORMAT, version: exporter.VERSION, exported_at: '2026-11-24T10:00:00.000Z', workspace_id: 5, workspace_name: 'Müller & Söhne', counts: {},
  tables: { workspaces: [{ id: 5, name: 'Müller & Söhne' }], ...tables }, ...more });
async function tarOf(entries) { const chunks = []; for await (const c of tarStream(entries)) chunks.push(c); return Buffer.concat(chunks); }
const entry = (name, text) => { const body = Buffer.from(text, 'utf8'); return { name, size: body.length, body, mtime: 0 }; };
const pack = async bundle => zlib.gzipSync(await tarOf(exporter.bundleEntries(bundle)));
const packRaw = async (name, text) => zlib.gzipSync(await tarOf([entry(name, text)]));
const refused = async (bytes, code, message) => assert.rejects(imp.readBundle(bytes), e => e instanceof imp.ImportError && e.name === 'ImportError' && e.code === code && (message === undefined || e.message === message), code);

// ── this database's tables, as schemaOf() describes them (the real shape: tests on a real Postgres hold it true) ──
const col = (nullable, has_default = false, json = false) => ({ nullable, has_default, json });
const SCHEMA = () => {
  const field = () => ({ columns: { id: col(false, true), workspace_id: col(false), name: col(false), field_key: col(false), type: col(true, true), options: col(true, true, true), position: col(true, true) }, refs: { workspace_id: 'workspaces' } });
  return {
    custom_fields: field(), deal_fields: field(),
    pipelines: { columns: { id: col(false, true), workspace_id: col(false), name: col(false), position: col(false, true), created_at: col(true, true) }, refs: { workspace_id: 'workspaces' } },
    pipeline_stages: { columns: { id: col(false, true), workspace_id: col(false), pipeline_id: col(false), name: col(false), color: col(true, true), position: col(false, true) }, refs: { workspace_id: 'workspaces', pipeline_id: 'pipelines' } },
    contacts: { columns: { id: col(false, true), workspace_id: col(false), name: col(false), email: col(true), phone: col(true), company: col(true), stage_id: col(true), assigned_to: col(true), custom_data: col(false, true, true),
      onboarding_status: col(false, true), drive_ordner_id: col(true), akte_version: col(false, true) }, refs: { workspace_id: 'workspaces', stage_id: 'stages', assigned_to: 'users' } },
    deals: { columns: { id: col(false, true), workspace_id: col(false), contact_id: col(true), pipeline_id: col(false), stage_id: col(true), title: col(false), value: col(true), custom_data: col(false, true, true), assigned_to: col(true), supplier_id: col(true) },
      refs: { workspace_id: 'workspaces', contact_id: 'contacts', pipeline_id: 'pipelines', stage_id: 'pipeline_stages', assigned_to: 'users', supplier_id: 'contacts' } },
    activities: { columns: { id: col(false, true), workspace_id: col(false), contact_id: col(true), deal_id: col(true), type: col(false), content: col(false), created_by: col(true), source: col(true, true), calcom_uid: col(true), calcom_event_type_id: col(true), calendly_uri: col(true), calendly_event_uri: col(true) },
      refs: { workspace_id: 'workspaces', contact_id: 'contacts', deal_id: 'deals', created_by: 'users' } },
    activity_comments: { columns: { id: col(false, true), activity_id: col(false), parent_id: col(true), workspace_id: col(false), content: col(false), created_by: col(true) },
      refs: { workspace_id: 'workspaces', activity_id: 'activities', parent_id: 'activity_comments', created_by: 'users' } },
  };
};
const TARGET = (more = {}) => ({ workspace: { id: 9, name: 'Ziel' }, active_flows: [], imported_at: null, contacts: new Map(), custom_fields: new Map(), deal_fields: new Map(), pipelines: new Set(), ...more });
const W = 5;
const contact = (id, more = {}) => ({ id, workspace_id: W, name: `C${id}`, email: `c${id}@example.de`, phone: null, company: null, stage_id: null, assigned_to: null, custom_data: {}, onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, ...more });
const pipe = (id, name = 'Vertrieb') => ({ id, workspace_id: W, name, position: 0, created_at: '2026-01-01T00:00:00Z' });
const stage = (id, pipeline_id, name = 'Neu') => ({ id, workspace_id: W, pipeline_id, name, color: null, position: 0 });
const deal = (id, more = {}) => ({ id, workspace_id: W, contact_id: null, pipeline_id: 40, stage_id: null, title: `D${id}`, value: null, custom_data: {}, assigned_to: null, supplier_id: null, ...more });
const note = (id, more = {}) => ({ id, workspace_id: W, contact_id: null, deal_id: null, type: 'note', content: `N${id}`, created_by: null, source: 'user', calcom_uid: null, calcom_event_type_id: null, calendly_uri: null, calendly_event_uri: null, ...more });
const comment = (id, activity_id, more = {}) => ({ id, activity_id, parent_id: null, workspace_id: W, content: `K${id}`, created_by: null, ...more });
const fieldRow = (id, field_key, type = 'text') => ({ id, workspace_id: W, name: field_key, field_key, type, options: null, position: 0 });
const plan = (tables, target = TARGET(), schema = SCHEMA()) => imp.plan(BUNDLE(tables), schema, target);
const of = (p, name) => { const t = p.tables.find(x => x.name === name); return [t.rows, t.adds, t.here, t.left_out]; };

describe('the file is opened', () => {
  test('an export as the export makes it comes back whole — the real entries, the real tar, gzip', async () => {
    const bundle = BUNDLE({ contacts: [contact(1, { name: 'Ünïcödé "q" <b>' })], deals: [deal(3, { contact_id: 1 })] });
    assert.deepEqual(await imp.readBundle(await pack(bundle)), bundle);
    const v1 = BUNDLE({}, { version: 1 });
    assert.equal((await imp.readBundle(await pack(v1))).version, 1, 'an export of the first version is read too');
    const withMore = zlib.gzipSync(await tarOf([entry('files/readme.txt', 'x'), ...exporter.bundleEntries(bundle), entry('zz/last.txt', 'y')]));
    assert.deepEqual(await imp.readBundle(withMore), bundle, 'other entries of the archive are passed over');
  });
  test('what is no gzip, or nothing at all: not_gzip', async () => {
    for (const bytes of [Buffer.from('not a gzip at all'), Buffer.from([0x1f, 0x8b, 0x08, 0, 1, 2, 3]), (await pack(BUNDLE())).subarray(0, 40)]) await refused(bytes, 'not_gzip', 'The file is not a .tar.gz as the export makes it.');
    for (const bytes of [Buffer.alloc(0), null, undefined, 'a string', { length: 5 }, [1, 2]]) await refused(bytes, 'not_gzip', 'The file is empty.');
  });
  test('a file that unpacks to more than an export can be: too_big — asked of zlib with the limit, never unpacked beyond it', async () => {
    assert.equal(imp.MAX_BYTES, 300 * 1024 * 1024);
    const real = zlib.gunzipSync, asked = [];
    zlib.gunzipSync = (bytes, options) => { asked.push(options); return real(bytes, { ...options, maxOutputLength: 20000 }); };   // the same call, with a limit a test can reach
    try {
      await refused(zlib.gzipSync(Buffer.alloc(50000)), 'too_big', 'Unpacked, the file is larger than an export can be.');
      assert.deepEqual(asked, [{ maxOutputLength: imp.MAX_BYTES }], 'the limit is handed to zlib itself');
      asked.length = 0;
      assert.equal((await imp.readBundle(await pack(BUNDLE()))).workspace_name, 'Müller & Söhne', 'what fits is read');
    } finally { zlib.gunzipSync = real; }
  });
  test('a gzip that is no export: not_bundle', async () => {
    await refused(zlib.gzipSync(Buffer.from('plain text, no archive')), 'not_bundle', 'The file cannot be read as an export.');
    await refused(zlib.gzipSync(await tarOf([entry('other.json', '{}')])), 'not_bundle', 'There is no workspace.json in the file.');
    await refused(zlib.gzipSync(await tarOf([entry('sub/workspace.json', JSON.stringify(BUNDLE()))])), 'not_bundle', 'There is no workspace.json in the file.');
    await refused(zlib.gzipSync(Buffer.alloc(0)), 'not_bundle', 'There is no workspace.json in the file.');
    await refused(await packRaw('workspace.json', '{ not json'), 'not_bundle', 'workspace.json is not JSON.');
  });
  test('JSON that is no export of this CRM: format', async () => {
    for (const text of ['null', '5', '"x"', '[]', '{}', JSON.stringify(BUNDLE({}, { format: 'something-else' })), JSON.stringify(BUNDLE({}, { format: undefined }))]) await refused(await packRaw('workspace.json', text), 'format', 'The file is not a workspace export of this CRM.');
  });
  test('an export newer than this install reads, or of no version: version — and its words hold no more than ten characters of the file\'s', async () => {
    await refused(await pack(BUNDLE({}, { version: exporter.VERSION + 1 })), 'version', `The export is of version ${exporter.VERSION + 1}; this install reads up to version ${exporter.VERSION}.`);
    for (const version of [0, -1, 1.5, '2', null, undefined, [2]]) await refused(await pack(BUNDLE({}, { version })), 'version');
    await assert.rejects(imp.readBundle(await pack(BUNDLE({}, { version: '<script>alert(1)</script>'.repeat(20) }))), e => e.code === 'version' && e.message === `The export is of version <script>al; this install reads up to version ${exporter.VERSION}.`);
  });
  test('tables that are not lists of rows, or not exactly one workspace: shape', async () => {
    for (const tables of [null, [], 'x', 5, { workspaces: [{ id: 1 }], contacts: 'x' }, { workspaces: [{ id: 1 }], contacts: [null] }, { workspaces: [{ id: 1 }], contacts: [[1]] }, { workspaces: [{ id: 1 }], contacts: ['x'] }, { workspaces: [{ id: 1 }], deals: {} }]) {
      await refused(await packRaw('workspace.json', JSON.stringify({ ...BUNDLE(), tables })), 'shape', 'The export\'s tables are not lists of rows.');
    }
    for (const workspaces of [[], [{ id: 1 }, { id: 2 }]]) await refused(await packRaw('workspace.json', JSON.stringify({ ...BUNDLE(), tables: { workspaces } })), 'shape', 'The export does not hold exactly one workspace.');
    await refused(await packRaw('workspace.json', JSON.stringify({ ...BUNDLE(), tables: { contacts: [] } })), 'shape', 'The export does not hold exactly one workspace.');
  });
});

describe('what comes in, and what does not', () => {
  test('the data: fields, pipelines and stages, contacts, deals, notes and their comments — in the export\'s own order, and nothing else', () => {
    assert.deepEqual(imp.DATA, ['custom_fields', 'deal_fields', 'pipelines', 'pipeline_stages', 'contacts', 'deals', 'activities', 'activity_comments']);
    const order = exporter.TABLES.map(([name]) => name);
    assert.deepEqual([...imp.DATA].sort((a, b) => order.indexOf(a) - order.indexOf(b)), imp.DATA, 'everything a row points to stands above it');
    for (const never of ['users', 'user_workspaces', 'workspaces', 'tasks', 'journey_flows', 'journey_nodes', 'journey_runs', 'fonio_calls', 'note_templates', 'contact_documents', 'objects']) assert.equal(imp.DATA.includes(never), false, never);
  });
  test('a plain file into an empty workspace: every row would be added, each kind counted', () => {
    const p = plan({ custom_fields: [fieldRow(1, 'budget')], deal_fields: [fieldRow(2, 'quelle')], pipelines: [pipe(40)], pipeline_stages: [stage(41, 40), stage(42, 40, 'Gewonnen')],
      contacts: [contact(1), contact(2)], deals: [deal(3, { contact_id: 1, stage_id: 41 })], activities: [note(7, { contact_id: 1 }), note(8, { deal_id: 3 })], activity_comments: [comment(9, 7), comment(10, 7, { parent_id: 9 })] });
    assert.deepEqual(p.tables, [{ name: 'custom_fields', rows: 1, adds: 1, here: 0, left_out: 0 }, { name: 'deal_fields', rows: 1, adds: 1, here: 0, left_out: 0 }, { name: 'pipelines', rows: 1, adds: 1, here: 0, left_out: 0 },
      { name: 'pipeline_stages', rows: 2, adds: 2, here: 0, left_out: 0 }, { name: 'contacts', rows: 2, adds: 2, here: 0, left_out: 0 }, { name: 'deals', rows: 1, adds: 1, here: 0, left_out: 0 },
      { name: 'activities', rows: 2, adds: 2, here: 0, left_out: 0 }, { name: 'activity_comments', rows: 2, adds: 2, here: 0, left_out: 0 }]);
    assert.deepEqual([p.unassigned, p.pipelines, p.not_included, p.warnings, p.blockers], [0, [{ name: 'Vertrieb', as: 'Vertrieb' }], [], [], []]);
  });
  test('a file with nothing in it: every kind is there with zeros, nothing is said', () => {
    const p = plan({});
    assert.deepEqual(p.tables.map(t => [t.name, t.rows, t.adds, t.here, t.left_out]), imp.DATA.map(n => [n, 0, 0, 0, 0]));
    assert.deepEqual([p.unassigned, p.pipelines, p.not_included, p.warnings, p.blockers], [0, [], [], [], []]);
    assert.deepEqual(imp.plan({ ...BUNDLE(), tables: { workspaces: [{ id: 5 }], contacts: 'not a list' } }, SCHEMA(), TARGET()).tables.find(t => t.name === 'contacts').rows, 0, 'what is no list counts as none');
  });
  test('what else the file holds is named as not part of an import — never the workspace\'s own row, never an empty table', () => {
    const p = plan({ contacts: [contact(1)], users: [{ id: 1 }, { id: 2 }], tasks: [{ id: 1 }], journey_flows: [], 'weird "table"': [{ a: 1 }] });
    assert.deepEqual(p.not_included, [{ name: 'users', rows: 2 }, { name: 'tasks', rows: 1 }, { name: 'weird "table"', rows: 1 }]);
    assert.deepEqual(of(p, 'contacts'), [1, 1, 0, 0]);
  });
});

describe('what is there already is left as it is, and used', () => {
  test('a field whose key is here: not made again — and a different kind is said, with the field here staying as it is', () => {
    const p = plan({ custom_fields: [fieldRow(1, 'budget', 'number'), fieldRow(2, 'neu'), fieldRow(3, 'gleich', 'date')], deal_fields: [fieldRow(4, 'budget', 'text'), fieldRow(5, 'quelle', 'select')] },
      TARGET({ custom_fields: new Map([['budget', 'text'], ['gleich', 'date']]), deal_fields: new Map([['quelle', 'select']]) }));
    assert.deepEqual([of(p, 'custom_fields'), of(p, 'deal_fields')], [[3, 1, 2, 0], [2, 1, 1, 0]], 'a contact field and a deal field of the same key are two fields');
    assert.deepEqual(p.warnings, ['The field "budget" is here as text and in the file as number. The field here stays as it is; the file\'s values arrive under it.']);
  });
  test('the key is compared exactly, and a key that is no text is no key', () => {
    const p = plan({ custom_fields: [fieldRow(1, 'Budget'), fieldRow(2, ' budget'), { ...fieldRow(3, 'x'), field_key: 5 }, { ...fieldRow(4, 'x'), field_key: null }] }, TARGET({ custom_fields: new Map([['budget', 'text'], ['', 'text']]) }));
    assert.deepEqual(of(p, 'custom_fields'), [4, 2, 0, 2], 'the two rows without a text key are no fields: left out — also where a field with an empty key is here; the two with another spelling are new');
    const long = plan({ custom_fields: [fieldRow(1, 'k'.repeat(200), 'x'.repeat(200))] }, TARGET({ custom_fields: new Map([['k'.repeat(200), 'text']]) }));
    assert.equal(long.warnings[0], `The field "${'k'.repeat(60)}" is here as text and in the file as ${'x'.repeat(30)}. The field here stays as it is; the file's values arrive under it.`);
  });
  test('a contact whose email is here — whatever its capitals and blanks: not made again; its deals and notes still arrive, and count as added', () => {
    const p = plan({ pipelines: [pipe(40)], contacts: [contact(1, { email: '  Ada@Example.DE ' }), contact(2)], deals: [deal(3, { contact_id: 1 }), deal(4, { contact_id: 2 })],
      activities: [note(7, { contact_id: 1 }), note(8, { deal_id: 3 })], activity_comments: [comment(9, 7)] }, TARGET({ contacts: new Map([['ada@example.de', { id: 900, name: 'Ada here' }]]) }));
    assert.deepEqual([of(p, 'contacts'), of(p, 'deals'), of(p, 'activities'), of(p, 'activity_comments')], [[2, 1, 1, 0], [2, 2, 0, 0], [2, 2, 0, 0], [1, 1, 0, 0]]);
    assert.deepEqual(p.warnings, ['1 contact of the file has an email address that is in this workspace already. That contact here stays as it is; the file\'s deals and notes are attached to it.']);
    const two = plan({ contacts: [contact(1), contact(2), contact(3)] }, TARGET({ contacts: new Map([['c1@example.de', { id: 1 }], ['c2@example.de', { id: 2 }]]) }));
    assert.deepEqual(two.warnings, ['2 contacts of the file have an email address that is in this workspace already. Those contacts here stay as they are; the file\'s deals and notes are attached to them.']);
  });
  test('a contact without an email address is always added — an empty address meets nobody', () => {
    const p = plan({ contacts: [contact(1, { email: null }), contact(2, { email: '' }), contact(3, { email: '   ' }), contact(4, { email: 5 }), { id: 5, workspace_id: W, name: 'no column' }] }, TARGET({ contacts: new Map([['5', { id: 2 }], ['null', { id: 3 }], ['undefined', { id: 4 }]]) }));
    assert.deepEqual(of(p, 'contacts'), [5, 5, 0, 0]);
  });
  test('a pipeline whose name is here arrives beside it under another name, the next free one — the one that is here gets nothing', () => {
    const p = plan({ pipelines: [pipe(40, 'Vertrieb'), pipe(41, ' vertrieb '), pipe(42, 'Neu'), pipe(43, 'Vertrieb (imported)')], pipeline_stages: [stage(50, 40), stage(51, 41)], deals: [deal(3, { pipeline_id: 40, stage_id: 50 })] },
      TARGET({ pipelines: new Set(['vertrieb']) }));
    assert.deepEqual(p.pipelines, [{ name: 'Vertrieb', as: 'Vertrieb (imported)' }, { name: ' vertrieb ', as: 'vertrieb (imported 2)' }, { name: 'Neu', as: 'Neu' }, { name: 'Vertrieb (imported)', as: 'Vertrieb (imported) (imported)' }]);
    assert.deepEqual([of(p, 'pipelines'), of(p, 'pipeline_stages'), of(p, 'deals')], [[4, 4, 0, 0], [2, 2, 0, 0], [1, 1, 0, 0]], 'a pipeline is never "here": it always arrives as its own');
    assert.deepEqual(p.warnings.slice(0, 3), ['A pipeline called "Vertrieb" is here already. The file\'s pipeline would arrive beside it as "Vertrieb (imported)"; the one that is here is not touched.',
      'A pipeline called " vertrieb " is here already. The file\'s pipeline would arrive beside it as "vertrieb (imported 2)"; the one that is here is not touched.',
      'A pipeline called "Vertrieb (imported)" is here already. The file\'s pipeline would arrive beside it as "Vertrieb (imported) (imported)"; the one that is here is not touched.']);
  });
  test('the name a pipeline gets: its own while free; "(imported)", "(imported 2)" … while taken; a pipeline without a name is "Pipeline"', () => {
    assert.equal(imp.pipelineName('Vertrieb', new Set()), 'Vertrieb');
    assert.equal(imp.pipelineName('  Vertrieb ', new Set()), 'Vertrieb');
    assert.equal(imp.pipelineName('Vertrieb', new Set(['vertrieb'])), 'Vertrieb (imported)');
    assert.equal(imp.pipelineName('VERTRIEB', new Set(['vertrieb', 'vertrieb (imported)'])), 'VERTRIEB (imported 2)');
    assert.equal(imp.pipelineName('Vertrieb', new Set(['vertrieb', 'vertrieb (imported)', 'vertrieb (imported 2)', 'vertrieb (imported 3)'])), 'Vertrieb (imported 4)');
    for (const none of ['', '   ', null, undefined]) assert.equal(imp.pipelineName(none, new Set(['pipeline'])), 'Pipeline (imported)', String(none));
    const taken = new Set(['a']);
    imp.pipelineName('a', taken);
    assert.deepEqual([...taken], ['a'], 'the names that are taken are not changed by asking');
  });
});

describe('what a row points to', () => {
  test('a deal without its pipeline is left out, and its notes with it — unless a note also hangs on a contact that arrives', () => {
    const p = plan({ pipelines: [pipe(40)], contacts: [contact(1)], deals: [deal(3, { pipeline_id: 99, contact_id: 1 }), deal(4, { pipeline_id: 40 })],
      activities: [note(7, { deal_id: 3 }), note(8, { deal_id: 3, contact_id: 1 }), note(9, { deal_id: 4 })], activity_comments: [comment(20, 7), comment(21, 8), comment(22, 20)] });
    assert.deepEqual([of(p, 'deals'), of(p, 'activities'), of(p, 'activity_comments')], [[2, 1, 0, 1], [3, 2, 0, 1], [3, 1, 0, 2]],
      'note 7 hung only on the deal that does not arrive; note 8 keeps its contact; the comment on 7 goes, and so does the answer to it');
    assert.deepEqual(p.warnings, ['deals: 1 of 2 would be left out, because what it belongs to does not arrive.', 'activities: 1 of 3 would be left out, because what it belongs to does not arrive.',
      'activity comments: 2 of 3 would be left out, because what they belong to does not arrive.']);
  });
  test('a stage without its pipeline is left out; a deal that named that stage arrives without a stage', () => {
    const p = plan({ pipelines: [pipe(40)], pipeline_stages: [stage(50, 40), stage(51, 77)], deals: [deal(3, { pipeline_id: 40, stage_id: 51 })] });
    assert.deepEqual([of(p, 'pipeline_stages'), of(p, 'deals')], [[2, 1, 0, 1], [1, 1, 0, 0]]);
  });
  test('a note with neither its contact nor its deal is left out — also when it never named either', () => {
    const p = plan({ contacts: [contact(1)], activities: [note(7), note(8, { contact_id: 55 }), note(9, { deal_id: 66 }), note(10, { contact_id: 1 })] });
    assert.deepEqual(of(p, 'activities'), [4, 1, 0, 3]);
    assert.deepEqual(p.warnings, ['activities: 3 of 4 would be left out, because what they belong to does not arrive.']);
  });
  test('a note on a contact that is here already arrives, attached to the one that is here', () => {
    const p = plan({ contacts: [contact(1)], activities: [note(7, { contact_id: 1 })] }, TARGET({ contacts: new Map([['c1@example.de', { id: 900 }]]) }));
    assert.deepEqual([of(p, 'contacts'), of(p, 'activities')], [[1, 0, 1, 0], [1, 1, 0, 0]]);
  });
  test('a row may point into its own table: an answer to a comment that arrives stays, one to a comment that is not in the file is emptied', () => {
    const p = plan({ contacts: [contact(1)], activities: [note(7, { contact_id: 1 })], activity_comments: [comment(20, 7, { parent_id: 21 }), comment(21, 7), comment(22, 7, { parent_id: 999 })] });
    assert.deepEqual(of(p, 'activity_comments'), [3, 3, 0, 0], 'the order inside one table is the import\'s to solve: an answer may stand before what it answers');
  });
  test('what a row says about a person is emptied, never a reason to leave it out — and such rows are counted once each', () => {
    const p = plan({ pipelines: [pipe(40)], contacts: [contact(1, { assigned_to: 11 }), contact(2)], deals: [deal(3, { assigned_to: 11, contact_id: 1 })],
      activities: [note(7, { contact_id: 1, created_by: 12 }), note(8, { contact_id: 2 })], activity_comments: [comment(20, 7, { created_by: 12 })] });
    assert.deepEqual(p.tables.map(t => t.left_out), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(p.unassigned, 4, 'one contact, one deal, one note, one comment');
    assert.deepEqual(p.warnings, ['4 rows name a person (who a contact or deal is assigned to, who wrote a note). People do not come along: they arrive without one.']);
    const one = plan({ contacts: [contact(1, { assigned_to: 11 })] });
    assert.deepEqual([one.unassigned, one.warnings], [1, ['1 row names a person (who a contact or deal is assigned to, who wrote a note). People do not come along: it arrives without one.']]);
  });
  test('a row that is here already or left out is not counted as unassigned', () => {
    const p = plan({ contacts: [contact(1, { assigned_to: 11 })], deals: [deal(3, { pipeline_id: 99, assigned_to: 11 })], activities: [note(7, { created_by: 12 })] }, TARGET({ contacts: new Map([['c1@example.de', { id: 900 }]]) }));
    assert.deepEqual([of(p, 'contacts'), of(p, 'deals'), of(p, 'activities'), p.unassigned], [[1, 0, 1, 0], [1, 0, 0, 1], [1, 0, 0, 1], 0]);
  });
  test('the workspace a row was of is never a reason: it is the one the file goes into', () => {
    const p = plan({ contacts: [contact(1, { workspace_id: 123456 }), contact(2, { workspace_id: null }), { ...contact(3), workspace_id: 'x' }], pipelines: [{ ...pipe(40), workspace_id: 999 }] });
    assert.deepEqual([of(p, 'contacts'), of(p, 'pipelines')], [[3, 3, 0, 0], [1, 1, 0, 0]]);
  });
  test('a supplier that is not in the file is emptied, the deal arrives', () => {
    const p = plan({ pipelines: [pipe(40)], contacts: [contact(1)], deals: [deal(3, { supplier_id: 1 }), deal(4, { supplier_id: 500 }), deal(5, { contact_id: 600 })] });
    assert.deepEqual(of(p, 'deals'), [3, 3, 0, 0]);
  });
});

describe('what belongs to the install the file came from', () => {
  test('the columns that are not carried over — a contact\'s Engine state and old stage, a meeting\'s booking — and no others', () => {
    assert.deepEqual(imp.NOT_CARRIED, { contacts: ['drive_ordner_id', 'akte_version', 'onboarding_status', 'stage_id'], activities: ['calcom_uid', 'calcom_event_type_id', 'calendly_uri', 'calendly_event_uri'] });
  });
  test('they are never a reason to leave a row out — not even where this database would insist on what they point to', () => {
    const schema = SCHEMA();
    schema.contacts.columns.stage_id = col(false);   // as if the old stage could not be empty
    schema.activities.refs.calcom_event_type_id = 'somewhere';
    schema.activities.columns.calcom_event_type_id = col(false);
    const p = plan({ contacts: [contact(1, { stage_id: 77 })], activities: [note(7, { contact_id: 1, calcom_event_type_id: 5 })] }, TARGET(), schema);
    assert.deepEqual([of(p, 'contacts'), of(p, 'activities')], [[1, 1, 0, 0], [1, 1, 0, 0]]);
  });
  test('their two sentences: said once, only when a row really holds such a value — an untouched contact holds none', () => {
    const quiet = plan({ contacts: [contact(1, { stage_id: 77 }), contact(2, { akte_version: 0, onboarding_status: 'kein_onboarding', drive_ordner_id: null })], activities: [note(7, { contact_id: 1 })] });
    assert.deepEqual(quiet.warnings, []);
    const ENGINE = 'The Engine\'s state of a contact (its folder, its onboarding) belongs to the install the file came from and is not carried over.';
    const BOOKED = 'Meetings booked through Cal.com or Calendly arrive as plain appointments: their booking belongs to the other install\'s account.';
    for (const more of [{ drive_ordner_id: 'abc' }, { akte_version: 3 }, { onboarding_status: 'call_erfolgt' }]) assert.deepEqual(plan({ contacts: [contact(1, more), contact(2, more)] }).warnings, [ENGINE], JSON.stringify(more));
    for (const more of [{ calcom_uid: 'u' }, { calcom_event_type_id: 9 }, { calendly_uri: 'x' }, { calendly_event_uri: 'y' }]) assert.deepEqual(plan({ contacts: [contact(1)], activities: [note(7, { contact_id: 1, ...more })] }).warnings, [BOOKED], JSON.stringify(more));
    const both = plan({ contacts: [contact(1, { akte_version: 2 })], activities: [note(7, { contact_id: 1, calcom_uid: 'u' })] });
    assert.deepEqual(both.warnings, [ENGINE, BOOKED]);
  });
});

describe('a file and a database that do not fit', () => {
  test('columns the file has and this database does not would be dropped: said per kind, eight names at most', () => {
    const p = plan({ contacts: [{ ...contact(1), brand_new: 1 }], pipelines: [{ ...pipe(40), ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`extra_${i}`, i])) }] });
    assert.deepEqual(p.warnings, ['pipelines: the columns extra_0, extra_1, extra_2, extra_3, extra_4, extra_5, extra_6, extra_7 are not known here and would be dropped.', 'contacts: the column brand_new is not known here and would be dropped.']);
    assert.deepEqual([of(p, 'contacts'), of(p, 'pipelines'), p.blockers], [[1, 1, 0, 0], [1, 1, 0, 0], []]);
  });
  test('a kind of row this database has no table for: nothing of it arrives, and the file cannot be imported', () => {
    const schema = SCHEMA(); delete schema.activity_comments;
    const p = plan({ contacts: [contact(1)], activities: [note(7, { contact_id: 1 })], activity_comments: [comment(20, 7), comment(21, 7)] }, TARGET(), schema);
    assert.deepEqual([of(p, 'activity_comments'), p.blockers], [[2, 0, 0, 2], ['This database has no table activity_comments.']]);
    const none = plan({ contacts: [contact(1)] }, TARGET(), schema);
    assert.deepEqual(none.blockers, [], 'a table the file has no rows for is not missed');
  });
  test('a column this database insists on and the file\'s rows do not have: a blocker, said once — a column with a default or one that may be empty is none', () => {
    const schema = SCHEMA();
    schema.contacts.columns.must_have = col(false);
    schema.contacts.columns.has_default = col(false, true);
    schema.contacts.columns.may_be_empty = col(true);
    const p = plan({ contacts: [contact(1), contact(2)] }, TARGET(), schema);
    assert.deepEqual(p.blockers, ['contacts.must_have is required here and the file has no such column: the file is older than this database expects.']);
    assert.deepEqual(of(p, 'contacts'), [2, 2, 0, 0], 'the count still says what the file holds');
  });
  test('for every kind of row: in the file = would be added + already here + left out', () => {
    const p = plan({ custom_fields: [fieldRow(1, 'a'), fieldRow(2, 'b')], deal_fields: [fieldRow(3, 'a')], pipelines: [pipe(40), pipe(41, 'Zwei')], pipeline_stages: [stage(50, 40), stage(51, 99)],
      contacts: [contact(1), contact(2), contact(3, { email: null })], deals: [deal(3, { contact_id: 1 }), deal(4, { pipeline_id: 99 }), deal(5, { pipeline_id: 41, contact_id: 2 })],
      activities: [note(7, { contact_id: 1 }), note(8, { deal_id: 4 }), note(9)], activity_comments: [comment(20, 7), comment(21, 8), comment(22, 9)] },
      TARGET({ custom_fields: new Map([['a', 'text']]), contacts: new Map([['c2@example.de', { id: 1 }]]), pipelines: new Set(['zwei']) }));
    for (const t of p.tables) assert.equal(t.rows, t.adds + t.here + t.left_out, t.name);
    assert.deepEqual(p.tables.map(t => [t.adds, t.here, t.left_out]), [[1, 1, 0], [1, 0, 0], [2, 0, 0], [1, 0, 1], [2, 1, 0], [2, 0, 1], [1, 0, 2], [1, 0, 2]]);
  });
  test('asking twice says the same, and neither the file nor what is known of the workspace is changed by asking', () => {
    const bundle = BUNDLE({ pipelines: [pipe(40)], contacts: [contact(1, { assigned_to: 5 })], deals: [deal(3, { contact_id: 1 })] });
    const target = TARGET({ pipelines: new Set(['vertrieb']), contacts: new Map([['c1@example.de', { id: 9 }]]) }), schema = SCHEMA();
    const before = [JSON.stringify(bundle), JSON.stringify([...target.pipelines]), JSON.stringify([...target.contacts]), JSON.stringify(schema)];
    assert.deepEqual(imp.plan(bundle, schema, target), imp.plan(bundle, schema, target));
    assert.deepEqual([JSON.stringify(bundle), JSON.stringify([...target.pipelines]), JSON.stringify([...target.contacts]), JSON.stringify(schema)], before);
  });
});

// ── the database: a stand-in that answers SELECTs and refuses everything else ──
function readOnlyPool(answer = () => []) {
  const asked = [];
  return { asked, query: async (sql, params) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    asked.push({ sql: t, params });
    if (!/^SELECT /.test(t)) throw new Error(`not a SELECT: ${t}`);
    return { rows: answer(t, params) };
  } };
}

describe('what this database\'s tables look like is read, never changed', () => {
  test('two questions, both of the database\'s own description of itself, for the data tables — and their answers as plan() takes them', async () => {
    const pool = readOnlyPool(t => (/information_schema\.columns/.test(t)
      ? [{ table_name: 'contacts', column_name: 'id', nullable: false, has_default: true, json: false }, { table_name: 'contacts', column_name: 'custom_data', nullable: true, has_default: false, json: true }, { table_name: 'deals', column_name: 'pipeline_id', nullable: false, has_default: false }]
      : [{ table_name: 'contacts', column_name: 'assigned_to', ref: 'users' }, { table_name: 'deals', column_name: 'pipeline_id', ref: 'pipelines' }, { table_name: 'unknown_table', column_name: 'x', ref: 'y' }]));
    assert.deepEqual(await imp.schemaOf(pool), { contacts: { columns: { id: { nullable: false, has_default: true, json: false }, custom_data: { nullable: true, has_default: false, json: true } }, refs: { assigned_to: 'users' } },
      deals: { columns: { pipeline_id: { nullable: false, has_default: false, json: false } }, refs: { pipeline_id: 'pipelines' } } });
    assert.equal(pool.asked.length, 2);
    assert.match(pool.asked[0].sql, /^SELECT table_name, column_name, is_nullable = 'YES' AS nullable, \(column_default IS NOT NULL OR is_identity = 'YES'\) AS has_default, data_type IN \('json', 'jsonb'\) AS json FROM information_schema\.columns WHERE table_schema = current_schema\(\) AND table_name = ANY\(\$1::text\[\]\)$/);
    assert.match(pool.asked[1].sql, /^SELECT c\.relname AS table_name, a\.attname AS column_name, r\.relname AS ref FROM pg_constraint k .* WHERE k\.contype = 'f' AND array_length\(k\.conkey, 1\) = 1 AND n\.nspname = current_schema\(\) AND c\.relname = ANY\(\$1::text\[\]\)$/);
    assert.deepEqual(pool.asked.map(a => a.params), [[imp.DATA], [imp.DATA]], 'the table names are a parameter');
    const some = readOnlyPool();
    assert.deepEqual(await imp.schemaOf(some, ['contacts']), {});
    assert.deepEqual(some.asked[0].params, [['contacts']]);
  });
});

describe('what the workspace already has is read — of that workspace only, and never changed', () => {
  const answers = (t, p) => {
    if (t === 'SELECT id, name FROM workspaces WHERE id = $1') return p[0] === 9 ? [{ id: 9, name: 'Ziel' }] : [];
    if (/FROM contacts /.test(t)) return [{ id: 900, name: 'Ada here', email: 'ada@example.de' }];
    if (/FROM custom_fields /.test(t)) return [{ field_key: 'budget', type: 'number' }];
    if (/FROM deal_fields /.test(t)) return [{ field_key: 'quelle', type: 'select' }];
    if (/FROM pipelines /.test(t)) return [{ name: ' Vertrieb ' }, { name: 'NEU' }, { name: null }];
    if (/FROM journey_flows /.test(t)) return p[0] === 9 ? [{ name: 'Läuft' }, { name: 5 }] : [];
    if (/FROM workspace_imports /.test(t)) return p[2] === '2026-01-01T00:00:00.000Z' ? [{ created_at: '2026-02-02T08:00:00.000Z' }] : [];
    return [];
  };
  test('the workspace, its contacts with the file\'s email addresses, its fields\' keys and kinds, its pipelines\' names, its workflows that are switched on, and whether this very file came in before', async () => {
    const pool = readOnlyPool(answers);
    const target = await imp.targetOf(pool, 9, BUNDLE({ contacts: [contact(1, { email: ' Ada@Example.DE ' }), contact(2, { email: 'ada@example.de' }), contact(3, { email: null }), contact(4, { email: 'Bo@example.de' })] }));
    assert.deepEqual(target.workspace, { id: 9, name: 'Ziel' });
    assert.deepEqual([...target.contacts], [['ada@example.de', { id: 900, name: 'Ada here' }]]);
    assert.deepEqual([[...target.custom_fields], [...target.deal_fields], [...target.pipelines]], [[['budget', 'number']], [['quelle', 'select']], ['vertrieb', 'neu', '']]);
    assert.deepEqual([target.active_flows, target.imported_at], [['Läuft', '5'], null]);
    assert.deepEqual(Object.keys(target).sort(), ['active_flows', 'contacts', 'custom_fields', 'deal_fields', 'imported_at', 'pipelines', 'workspace']);
    assert.deepEqual(pool.asked.map(a => a.sql), ['SELECT id, name FROM workspaces WHERE id = $1',
      'SELECT DISTINCT ON (lower(btrim(email))) id, name, lower(btrim(email)) AS email FROM contacts WHERE workspace_id = $1 AND lower(btrim(email)) = ANY($2::text[]) ORDER BY lower(btrim(email)), id',
      'SELECT field_key, type FROM custom_fields WHERE workspace_id = $1', 'SELECT field_key, type FROM deal_fields WHERE workspace_id = $1', 'SELECT name FROM pipelines WHERE workspace_id = $1',
      'SELECT name FROM journey_flows WHERE workspace_id = $1 AND active = true ORDER BY id',
      'SELECT created_at FROM workspace_imports WHERE workspace_id = $1 AND source_name = $2 AND exported_at = $3 ORDER BY id LIMIT 1']);
    assert.deepEqual(pool.asked.map(a => a.params), [[9], [9, ['ada@example.de', 'bo@example.de']], [9], [9], [9], [9], [9, 'Müller & Söhne', '2026-11-24T10:00:00.000Z']], 'every question is about workspace 9; each address once, in small letters');
  });
  test('every question but the one for the workspace itself names the workspace in its WHERE: another workspace\'s contact, field or pipeline is not "here"', async () => {
    const pool = readOnlyPool(answers);
    await imp.targetOf(pool, 9, BUNDLE({ contacts: [contact(1)] }));
    for (const a of pool.asked.slice(1)) { assert.match(a.sql, / WHERE workspace_id = \$1( |$)/, a.sql); assert.equal(a.params[0], 9); }
    assert.equal(pool.asked.every(a => !/\$\{/.test(a.sql) && !/example\.de|Müller/.test(a.sql)), true, 'nothing of the file is part of a statement');
  });
  test('a file without email addresses asks for no contacts; a workspace that is not there is nothing, and nothing more is asked', async () => {
    const pool = readOnlyPool(answers);
    const target = await imp.targetOf(pool, 9, BUNDLE({ contacts: [contact(1, { email: null }), contact(2, { email: '  ' })] }));
    assert.deepEqual([target.contacts.size, pool.asked.length, pool.asked.some(a => /FROM contacts/.test(a.sql))], [0, 6, false]);
    const none = readOnlyPool(answers);
    assert.equal(await imp.targetOf(none, 404, BUNDLE({ contacts: [contact(1)] })), null);
    assert.deepEqual(none.asked.map(a => [a.sql, a.params]), [['SELECT id, name FROM workspaces WHERE id = $1', [404]]]);
    assert.equal((await imp.targetOf(readOnlyPool(answers), 9, BUNDLE({}))).contacts.size, 0, 'a file without contacts');
  });
  test('this very file — the same export of the same workspace — brought into THIS workspace before: when; the file\'s words are parameters, cut to what the record holds', async () => {
    const before = await imp.targetOf(readOnlyPool(answers), 9, BUNDLE({}, { exported_at: '2026-01-01T00:00:00.000Z' }));
    assert.equal(before.imported_at, '2026-02-02T08:00:00.000Z');
    const pool = readOnlyPool(answers);
    await imp.targetOf(pool, 9, BUNDLE({}, { workspace_name: 'N'.repeat(500), exported_at: 'E'.repeat(100) }));
    assert.deepEqual(pool.asked.at(-1).params, [9, 'N'.repeat(200), 'E'.repeat(40)]);
    const odd = readOnlyPool(answers);
    await imp.targetOf(odd, 9, BUNDLE({}, { workspace_name: null, exported_at: 12345 }));
    assert.deepEqual(odd.asked.at(-1).params, [9, '', ''], 'a file without a name or a time of its own');
    const other = readOnlyPool((t, p) => (t === 'SELECT id, name FROM workspaces WHERE id = $1' ? [{ id: 8, name: 'Andere' }] : answers(t, p)));
    assert.deepEqual((await imp.targetOf(other, 8, BUNDLE({}))).active_flows, [], 'another workspace\'s workflows are not this one\'s: the question names the workspace');
    assert.deepEqual(other.asked.find(a => /FROM journey_flows/.test(a.sql)).params, [8]);
  });
});

// ══ Part 2: the import ══════════════════════════════════════════════════════════════════════════════════════════════

describe('what the check says is what the import does: one place decides (decide), and the check is that without the rows', () => {
  test('the rows that will stand for something here, in the order they are written: the data tables\' order, each table as the file has it', () => {
    const tables = { custom_fields: [fieldRow(1, 'budget'), fieldRow(2, 'neu')], deal_fields: [fieldRow(3, 'quelle')], pipelines: [pipe(40), pipe(41, 'Zwei')], pipeline_stages: [stage(50, 40)],
      contacts: [contact(1), contact(2), contact(3, { email: null })], deals: [deal(3, { contact_id: 1 }), deal(4, { pipeline_id: 99 })], activities: [note(7, { contact_id: 2 }), note(8)], activity_comments: [comment(20, 7)] };
    const target = TARGET({ custom_fields: new Map([['budget', 'text']]), contacts: new Map([['c2@example.de', { id: 900, name: 'here' }]]), pipelines: new Set(['zwei']) });
    const d = imp.decide(BUNDLE(tables), SCHEMA(), target);
    assert.deepEqual(d.steps.map(s => [s.t, s.row.id, s.here, s.as]), [['custom_fields', 1, true, undefined], ['custom_fields', 2, undefined, undefined], ['deal_fields', 3, undefined, undefined],
      ['pipelines', 40, undefined, 'Vertrieb'], ['pipelines', 41, undefined, 'Zwei (imported)'], ['pipeline_stages', 50, undefined, undefined],
      ['contacts', 1, undefined, undefined], ['contacts', 2, 900, undefined], ['contacts', 3, undefined, undefined], ['deals', 3, undefined, undefined], ['activities', 7, undefined, undefined], ['activity_comments', 20, undefined, undefined]],
      'a field that is here is marked; a contact that is here carries the id of the contact here; a pipeline its name here; what is left out (deal 4, note 8) has no step');
    assert.equal(d.steps[6].row, tables.contacts[0], 'the file\'s own row, as it is');
    const order = d.steps.map(s => imp.DATA.indexOf(s.t));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(d.steps.length, d.tables.reduce((n, t) => n + t.adds + t.here, 0), 'one step for every row that is added or here');
  });
  test('the check\'s answer is exactly that decision without the rows — no row of the file leaves through the check', () => {
    const bundle = BUNDLE({ pipelines: [pipe(40)], contacts: [contact(1, { name: 'SECRET NAME' })], deals: [deal(3, { contact_id: 1 })] });
    const { steps, ...said } = imp.decide(bundle, SCHEMA(), TARGET());
    const p = imp.plan(bundle, SCHEMA(), TARGET());
    assert.deepEqual(p, said);
    assert.deepEqual(Object.keys(p).sort(), ['blockers', 'not_included', 'pipelines', 'tables', 'unassigned', 'warnings']);
    assert.doesNotMatch(JSON.stringify(p), /SECRET NAME|c1@example\.de/);
  });
  test('a workspace whose workflows are switched on is not imported into: said with their names, five at most, each cut', () => {
    const one = plan({ contacts: [contact(1)] }, TARGET({ active_flows: ['Neue Leads'] }));
    assert.deepEqual(one.blockers, ['1 workflow is switched on in this workspace ("Neue Leads"). Switch it off in the workspace first: a running workflow would take the imported deals for new ones and write to their contacts. Switched on again afterwards, it only acts on what happens from then on.']);
    assert.deepEqual(of(one, 'contacts'), [1, 1, 0, 0], 'the counts still say what the file holds');
    const many = plan({}, TARGET({ active_flows: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }));
    assert.deepEqual(many.blockers, ['7 workflows are switched on in this workspace ("A", "B", "C", "D", "E", …). Switch them off in the workspace first: a running workflow would take the imported deals for new ones and write to their contacts. Switched on again afterwards, they only act on what happens from then on.']);
    const long = plan({}, TARGET({ active_flows: ['x'.repeat(200), 'B'] }));
    assert.match(long.blockers[0], new RegExp(`^2 workflows are switched on in this workspace \\("${'x'.repeat(60)}", "B"\\)\\. Switch them off`));
    for (const none of [[], undefined, null, 'x']) assert.deepEqual(plan({}, TARGET({ active_flows: none })).blockers, [], String(none));
  });
  test('the same file into the same workspace a second time is not imported: said with the day it came in', () => {
    const p = plan({ contacts: [contact(1)] }, TARGET({ imported_at: '2026-02-02T08:00:00.000Z' }));
    assert.deepEqual(p.blockers, ['This file was imported into this workspace before (2026-02-02). A second time, every deal and note in it would be there twice.']);
    assert.deepEqual(plan({}, TARGET({ imported_at: new Date('2026-03-04T23:59:59Z') })).blockers, ['This file was imported into this workspace before (2026-03-04). A second time, every deal and note in it would be there twice.']);
    const both = plan({}, TARGET({ imported_at: '2026-02-02T08:00:00.000Z', active_flows: ['A'] }));
    assert.equal(both.blockers.length, 2);
    assert.match(both.blockers[0], /^This file was imported/);
  });
  test('a row that cannot be without its person does not arrive — and what hangs on it goes with it', () => {
    const schema = SCHEMA();
    schema.activities.columns.created_by = col(false);   // as if a note had to have its writer
    const p = plan({ contacts: [contact(1)], activities: [note(7, { contact_id: 1, created_by: 12 }), note(8, { contact_id: 1 })], activity_comments: [comment(20, 7), comment(21, 8)] }, TARGET(), schema);
    assert.deepEqual([of(p, 'activities'), of(p, 'activity_comments'), p.unassigned], [[2, 1, 0, 1], [2, 1, 0, 1], 0]);
  });
});

describe('a comment after the comment it answers', () => {
  const st = (id, parent_id = null) => ({ t: 'activity_comments', row: { id, parent_id } });
  const ids = steps => imp.parentsFirst(steps).map(s => s.row.id);
  test('a chain in order stays; the same chain turned round is put right; comments that answer nothing keep their places', () => {
    assert.deepEqual(ids([st(1), st(2, 1), st(3, 2)]), [1, 2, 3]);
    assert.deepEqual(ids([st(3, 2), st(2, 1), st(1)]), [1, 2, 3]);
    assert.deepEqual(ids([st(5), st(3, 2), st(6), st(2, 1), st(1), st(7, 6)]), [5, 6, 1, 7, 2, 3]);
    assert.deepEqual(ids([]), []);
  });
  test('an answer to a comment that is not in the list waits for nobody; undefined is no parent', () => {
    assert.deepEqual(ids([st(2, 999), st(1), st(3, undefined)]), [2, 1, 3]);
  });
  test('comments that answer each other in a circle are written as they come, after everything that can be ordered — never lost, never twice', () => {
    assert.deepEqual(ids([st(1, 2), st(2, 1), st(3), st(4, 3)]), [3, 4, 1, 2]);
    assert.deepEqual(ids([st(1, 1)]), [1], 'a comment that answers itself');
    const many = [st(9, 8), st(8, 7), st(7, 9), st(1), st(2, 1)];
    assert.deepEqual(ids(many).sort(), [1, 2, 7, 8, 9]);
  });
  test('the list that was handed in is not changed, and the steps are the same objects', () => {
    const steps = [st(2, 1), st(1)], copy = [...steps];
    const out = imp.parentsFirst(steps);
    assert.deepEqual(steps, copy);
    assert.equal(out[0], steps[1]);
  });
});

// ── the import's own connection: a stand-in that knows a transaction, the reads, and the two kinds of INSERT ──
// It keeps rows per table and gives ids as a database would: new ones, far from every id of the file.
function importPool({ schema = SCHEMA(), workspace = { id: 9, name: 'Ziel' }, here = {}, flows = [], importedAt = null, failOn = null } = {}) {
  const log = [], inserted = [], state = { connects: 0, released: 0, nextId: 5000 };
  const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
  const client = { query: async (sql, params) => {
    const t = flat(sql);
    log.push({ sql: t, params });
    if (failOn && failOn(t, params)) throw new Error('the database refuses');
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] };
    if (t === 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE') return { rows: workspace && params[0] === workspace.id ? [{ id: workspace.id }] : [] };
    if (t === 'SELECT id, name FROM workspaces WHERE id = $1') return { rows: workspace && params[0] === workspace.id ? [workspace] : [] };
    if (/^SELECT DISTINCT ON \(lower\(btrim\(email\)\)\) id, name, lower\(btrim\(email\)\) AS email FROM contacts WHERE workspace_id = \$1/.test(t)) return { rows: (here.contacts || []).filter(c => params[1].includes(c.email)) };
    if (t === 'SELECT field_key, type FROM custom_fields WHERE workspace_id = $1') return { rows: here.custom_fields || [] };
    if (t === 'SELECT field_key, type FROM deal_fields WHERE workspace_id = $1') return { rows: here.deal_fields || [] };
    if (t === 'SELECT name FROM pipelines WHERE workspace_id = $1') return { rows: (here.pipelines || []).map(name => ({ name })) };
    if (t === 'SELECT name FROM journey_flows WHERE workspace_id = $1 AND active = true ORDER BY id') return { rows: flows.map(name => ({ name })) };
    if (/^SELECT created_at FROM workspace_imports WHERE workspace_id = \$1 AND source_name = \$2 AND exported_at = \$3/.test(t)) return { rows: importedAt ? [{ created_at: importedAt }] : [] };
    if (/FROM information_schema\.columns/.test(t)) return { rows: Object.entries(schema).flatMap(([table_name, s]) => Object.entries(s.columns).map(([column_name, c]) => ({ table_name, column_name, nullable: c.nullable, has_default: c.has_default, json: !!c.json }))) };
    if (/FROM pg_constraint/.test(t)) return { rows: Object.entries(schema).flatMap(([table_name, s]) => Object.entries(s.refs).map(([column_name, ref]) => ({ table_name, column_name, ref }))) };
    const data = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\) RETURNING id$/.exec(t);
    if (data && imp.DATA.includes(data[1])) {
      const cols = data[2].split(', '), marks = data[3].split(', '), id = state.nextId++;
      inserted.push({ table: data[1], id, cols, marks, row: Object.fromEntries(cols.map((c, i) => [c.replace(/"/g, ''), params[i]])) });
      return { rows: [{ id }] };
    }
    if (t === 'INSERT INTO workspace_imports (workspace_id, workspace_name, file_name, source_name, exported_at, counts) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id') { inserted.push({ table: 'workspace_imports', id: 77, params }); return { rows: [{ id: 77 }] }; }
    throw new Error(`a statement nobody expected: ${t}`);
  }, release: () => { state.released++; } };
  return { log, inserted, state, connect: async () => { state.connects++; return client; }, query: async sql => { throw new Error(`asked of the pool, not of the import's connection: ${flat(sql)}`); } };
}
const FULL = () => ({ custom_fields: [fieldRow(1, 'budget', 'number'), fieldRow(2, 'neu')], deal_fields: [{ ...fieldRow(3, 'quelle', 'select'), options: ['Web', 'Messe'] }], pipelines: [pipe(40), pipe(41, 'Zwei')], pipeline_stages: [stage(50, 40), stage(51, 41)],
  contacts: [contact(1, { assigned_to: 11, custom_data: { budget: '300000' }, stage_id: 7, drive_ordner_id: 'DRIVE-FOLDER', akte_version: 4, onboarding_status: 'call_erfolgt' }), contact(2, { email: ' Ada@Example.DE ' }), contact(3, { email: null })],
  deals: [deal(3, { contact_id: 1, pipeline_id: 40, stage_id: 50, assigned_to: 11, supplier_id: 3, custom_data: { quelle: 'Web' } }), deal(4, { contact_id: 2, pipeline_id: 41, stage_id: 51 })],
  activities: [note(7, { contact_id: 1, deal_id: 3, created_by: 12 }), note(8, { contact_id: 2, type: 'meeting', source: 'calcom', calcom_uid: 'CAL-UID', calcom_event_type_id: 9 }), note(9, { deal_id: 4, source: 'calendly', calendly_uri: 'CLY-URI' }), note(10, { contact_id: 3, source: 'fonio' })],
  activity_comments: [comment(21, 7, { parent_id: 20, created_by: 12 }), comment(20, 7), comment(22, 8)] });
const HERE = () => ({ contacts: [{ id: 900, name: 'Ada here', email: 'ada@example.de' }], custom_fields: [{ field_key: 'budget', type: 'text' }], pipelines: ['zwei'] });
const run = (pool, tables = FULL(), more = {}) => imp.run(pool, 9, BUNDLE(tables), { file: { name: 'upgrads-muller-5-2026-11-24.tar.gz' }, ...more });
const made = (pool, table) => pool.inserted.filter(i => i.table === table);

describe('the import: one transaction, the workspace held, decided there once more, written by INSERT only', () => {
  test('begin, the workspace\'s row held, what is there read ON THE SAME CONNECTION, the rows, the record, commit, the connection given back', async () => {
    const pool = importPool({ here: HERE() });
    const out = await run(pool);
    const kinds = pool.log.map(l => (/^INSERT INTO (\w+)/.exec(l.sql) || /^(BEGIN|COMMIT|ROLLBACK)/.exec(l.sql) || /FROM (\w+(?:\.\w+)?)/.exec(l.sql))[1] + (/FOR NO KEY UPDATE$/.test(l.sql) ? ' (held)' : ''));
    assert.deepEqual(kinds, ['BEGIN', 'workspaces (held)', 'workspaces', 'contacts', 'custom_fields', 'deal_fields', 'pipelines', 'journey_flows', 'workspace_imports', 'information_schema.columns', 'pg_constraint',
      'custom_fields', 'deal_fields', 'pipelines', 'pipelines', 'pipeline_stages', 'pipeline_stages', 'contacts', 'contacts', 'deals', 'deals', 'activities', 'activities', 'activities', 'activities',
      'activity_comments', 'activity_comments', 'activity_comments', 'workspace_imports', 'COMMIT']);
    assert.deepEqual([pool.state.connects, pool.state.released], [1, 1], 'one connection for all of it; the pool itself is asked nothing');
    assert.deepEqual(pool.log[1].params, [9]);
    assert.equal(out.ok, true);
    assert.deepEqual([out.id, out.into, out.unassigned], [77, { id: 9, name: 'Ziel' }, 4]);
    assert.equal('steps' in out, false, 'no row of the file is in the answer');
    assert.deepEqual(out.tables.map(t => [t.name, t.rows, t.adds, t.here, t.left_out]), [['custom_fields', 2, 1, 1, 0], ['deal_fields', 1, 1, 0, 0], ['pipelines', 2, 2, 0, 0], ['pipeline_stages', 2, 2, 0, 0],
      ['contacts', 3, 2, 1, 0], ['deals', 2, 2, 0, 0], ['activities', 4, 4, 0, 0], ['activity_comments', 3, 3, 0, 0]]);
    assert.deepEqual(pool.inserted.filter(i => i.table !== 'workspace_imports').length, out.tables.reduce((n, t) => n + t.adds, 0), 'exactly one INSERT per row that is added — none for what is here, none for what is left out');
  });
  test('no row keeps its id: `id` is never a column, and every id the import uses afterwards is one the database gave', async () => {
    const pool = importPool({ here: HERE() });
    await run(pool);
    for (const i of pool.inserted.filter(x => x.cols)) assert.equal(i.cols.includes('"id"'), false, i.table);
    const fileIds = new Set([1, 2, 3, 4, 7, 8, 9, 10, 20, 21, 22, 40, 41, 50, 51, 11, 12]);
    for (const i of pool.inserted.filter(x => x.cols)) for (const [c, v] of Object.entries(i.row)) if (/_id$|^assigned_to$|^created_by$/.test(c) && c !== 'workspace_id' && v !== null) assert.equal(fileIds.has(v), false, `${i.table}.${c} = ${v} is an id of the file`);
  });
  test('a row is written with what the rows it points to BECAME: a deal\'s contact, pipeline and stage; a note\'s contact and deal; a comment\'s note and the comment it answers', async () => {
    const pool = importPool({ here: HERE() });
    await run(pool);
    const [p40, p41] = made(pool, 'pipelines'), [s50, s51] = made(pool, 'pipeline_stages'), [c1, c3] = made(pool, 'contacts'), [d3, d4] = made(pool, 'deals'), [n7, n8, n9, n10] = made(pool, 'activities');
    assert.deepEqual([s50.row.pipeline_id, s51.row.pipeline_id], [p40.id, p41.id]);
    assert.deepEqual([d3.row.contact_id, d3.row.pipeline_id, d3.row.stage_id, d3.row.supplier_id], [c1.id, p40.id, s50.id, c3.id]);
    assert.deepEqual([d4.row.contact_id, d4.row.pipeline_id, d4.row.stage_id], [900, p41.id, s51.id], 'the contact whose email is here: the deal hangs on the contact that is HERE');
    assert.deepEqual([[n7.row.contact_id, n7.row.deal_id], [n8.row.contact_id, n8.row.deal_id], [n9.row.contact_id, n9.row.deal_id], [n10.row.contact_id, n10.row.deal_id]], [[c1.id, d3.id], [900, null], [null, d4.id], [c3.id, null]]);
    const comments = made(pool, 'activity_comments');
    assert.deepEqual(comments.map(c => c.row.content), ['K20', 'K22', 'K21'], 'the comment that is answered is written before its answer');
    assert.deepEqual([comments[0].row.activity_id, comments[0].row.parent_id, comments[2].row.activity_id, comments[2].row.parent_id, comments[1].row.activity_id], [n7.id, null, n7.id, comments[0].id, n8.id]);
  });
  test('what is here already is used and not written: no INSERT for the field whose key is here, none for the contact whose email is here', async () => {
    const pool = importPool({ here: HERE() });
    await run(pool);
    assert.deepEqual(made(pool, 'custom_fields').map(f => f.row.field_key), ['neu']);
    assert.deepEqual(made(pool, 'contacts').map(c => c.row.name), ['C1', 'C3']);
    assert.equal(pool.log.some(l => /^(UPDATE|DELETE)/.test(l.sql)), false);
  });
  test('the workspace is always the one it goes into; people are emptied; what belongs to the other install is not among the columns at all', async () => {
    const pool = importPool({ here: HERE() });
    await run(pool);
    for (const i of pool.inserted.filter(x => x.cols)) assert.equal(i.row.workspace_id, 9, i.table);
    const [c1] = made(pool, 'contacts'), [d3] = made(pool, 'deals'), [n7, n8, n9, n10] = made(pool, 'activities'), comments = made(pool, 'activity_comments');
    assert.deepEqual([c1.row.assigned_to, d3.row.assigned_to, n7.row.created_by, comments[2].row.created_by], [null, null, null, null]);
    for (const absent of imp.NOT_CARRIED.contacts) assert.equal(c1.cols.includes(`"${absent}"`), false, absent);
    for (const absent of imp.NOT_CARRIED.activities) assert.equal(n8.cols.includes(`"${absent}"`), false, absent);
    assert.doesNotMatch(JSON.stringify(pool.inserted.filter(i => i.cols).map(i => i.row)), /DRIVE-FOLDER|CAL-UID|CLY-URI|call_erfolgt/);
    assert.deepEqual([n7.row.source, n8.row.source, n9.row.source, n10.row.source, n8.row.type], ['user', 'user', 'user', 'fonio', 'meeting'], 'a meeting booked at Cal.com or Calendly arrives as a plain appointment; every other source stays');
  });
  test('a pipeline is written under its name HERE; everything else of a row as the file has it', async () => {
    const pool = importPool({ here: HERE() });
    const out = await run(pool);
    assert.deepEqual(made(pool, 'pipelines').map(p => p.row.name), ['Vertrieb', 'Zwei (imported)']);
    assert.deepEqual(out.pipelines, [{ name: 'Vertrieb', as: 'Vertrieb' }, { name: 'Zwei', as: 'Zwei (imported)' }]);
    const [c1, c3] = made(pool, 'contacts');
    assert.deepEqual([c1.row.name, c1.row.email, c1.row.phone, c3.row.email], ['C1', 'c1@example.de', null, null]);
  });
  test('a JSON column is handed over as JSON text and marked ::jsonb; an empty one stays empty; nothing of a value is ever part of the statement', async () => {
    const pool = importPool({ here: HERE() });
    await run(pool);
    const [c1] = made(pool, 'contacts'), [f3] = made(pool, 'deal_fields'), [f2] = made(pool, 'custom_fields');
    assert.deepEqual([c1.row.custom_data, c1.marks[c1.cols.indexOf('"custom_data"')]], ['{"budget":"300000"}', `$${c1.cols.indexOf('"custom_data"') + 1}::jsonb`]);
    assert.deepEqual([f3.row.options, f2.row.options, f2.marks[f2.cols.indexOf('"options"')]], ['["Web","Messe"]', null, `$${f2.cols.indexOf('"options"') + 1}::jsonb`]);
    assert.equal(c1.marks[c1.cols.indexOf('"name"')], `$${c1.cols.indexOf('"name"') + 1}`);
    for (const l of pool.log.filter(x => /^INSERT INTO/.test(x.sql))) assert.match(l.sql, /^INSERT INTO \w+ \(("[a-z_][a-z0-9_]*"(, )?)+\) VALUES \((\$\d+(::jsonb)?(, )?)+\) RETURNING id$|^INSERT INTO workspace_imports /, l.sql);
    for (const l of pool.log) assert.doesNotMatch(l.sql, /example\.de|C1|Vertrieb|300000|Müller/, 'no value of the file is ever part of a statement');
  });
  test('only columns this database has are written — and one whose name is no plain identifier is never written, whatever the database calls it', async () => {
    const schema = SCHEMA();
    schema.contacts.columns['name"; DROP TABLE contacts; --'] = col(true);
    schema.contacts.columns.Capital = col(true);
    schema.contacts.columns.fine_2 = col(true);
    const pool = importPool({ schema });
    await run(pool, { contacts: [{ ...contact(1), 'name"; DROP TABLE contacts; --': 'x', Capital: 'y', fine_2: 'z', unknown_here: 'w' }] });
    const [c1] = made(pool, 'contacts');
    assert.deepEqual(c1.cols.filter(c => !/^"(workspace_id|name|email|phone|company|assigned_to|custom_data)"$/.test(c)), ['"fine_2"']);
    assert.equal(pool.log.some(l => /DROP|Capital|unknown_here/.test(l.sql)), false);
  });
  test('a column the file\'s row does not have is left to the database\'s own default', async () => {
    const pool = importPool();
    await run(pool, { contacts: [{ id: 1, workspace_id: 5, name: 'Only a name' }] });
    assert.deepEqual(made(pool, 'contacts')[0].cols, ['"workspace_id"', '"name"']);
  });
  test('the record is written last, inside the same transaction: which file, from which workspace, into which, and what became of each kind', async () => {
    const pool = importPool({ here: HERE() });
    await run(pool);
    const record = pool.inserted.at(-1);
    assert.equal(record.table, 'workspace_imports');
    assert.deepEqual(record.params.slice(0, 5), [9, 'Ziel', 'upgrads-muller-5-2026-11-24.tar.gz', 'Müller & Söhne', '2026-11-24T10:00:00.000Z']);
    assert.deepEqual(JSON.parse(record.params[5]), { custom_fields: { adds: 1, here: 1, left_out: 0 }, deal_fields: { adds: 1, here: 0, left_out: 0 }, pipelines: { adds: 2, here: 0, left_out: 0 }, pipeline_stages: { adds: 2, here: 0, left_out: 0 },
      contacts: { adds: 2, here: 1, left_out: 0 }, deals: { adds: 2, here: 0, left_out: 0 }, activities: { adds: 4, here: 0, left_out: 0 }, activity_comments: { adds: 3, here: 0, left_out: 0 } });
    assert.equal(pool.log.at(-2).sql.startsWith('INSERT INTO workspace_imports'), true);
    assert.equal(pool.log.at(-1).sql, 'COMMIT');
    const cut = importPool();
    await imp.run(cut, 9, BUNDLE({}, { workspace_name: 'N'.repeat(500), exported_at: 12345 }), { file: { name: 'F'.repeat(500) } });
    assert.deepEqual(cut.inserted.at(-1).params.slice(2, 5), ['F'.repeat(200), 'N'.repeat(200), null]);
    const bare = importPool();
    assert.equal((await imp.run(bare, 9, BUNDLE({}))).ok, true, 'without a file name');
    assert.equal(bare.inserted.at(-1).params[2], '');
  });
});

describe('the import that does not happen leaves nothing behind', () => {
  test('something is in the way (a workflow switched on; the same file before): rolled back, no INSERT, the blockers handed back', async () => {
    for (const [more, words] of [[{ flows: ['Läuft'] }, /^1 workflow is switched on/], [{ importedAt: '2026-02-02T08:00:00.000Z' }, /^This file was imported into this workspace before \(2026-02-02\)/]]) {
      const pool = importPool(more);
      const out = await run(pool);
      assert.deepEqual([out.ok, out.code, out.blockers.length], [false, 'blocked', 1]);
      assert.match(out.blockers[0], words);
      assert.deepEqual([pool.inserted.length, pool.log.at(-1).sql, pool.log.some(l => l.sql === 'COMMIT'), pool.state.released], [0, 'ROLLBACK', false, 1]);
    }
  });
  test('a file this database cannot take (a required column the file lacks): the same — nothing is written', async () => {
    const schema = SCHEMA();
    schema.contacts.columns.must_have = col(false);
    const pool = importPool({ schema });
    const out = await run(pool, { contacts: [contact(1)] });
    assert.deepEqual([out.ok, out.code, pool.inserted.length, pool.log.at(-1).sql], [false, 'blocked', 0, 'ROLLBACK']);
  });
  test('no such workspace: rolled back before anything else is asked', async () => {
    const pool = importPool({ workspace: null });
    assert.deepEqual(await run(pool), { ok: false, code: 'workspace' });
    assert.deepEqual([pool.log.map(l => l.sql), pool.state.released], [['BEGIN', 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE', 'ROLLBACK'], 1]);
  });
  test('an INSERT fails in the middle: rolled back, the connection given back, the error goes on — and no record of an import is written', async () => {
    const pool = importPool({ failOn: t => /^INSERT INTO deals/.test(t) });
    await assert.rejects(run(pool), /the database refuses/);
    assert.deepEqual([pool.log.at(-1).sql, pool.log.some(l => l.sql === 'COMMIT'), pool.state.released, made(pool, 'workspace_imports').length], ['ROLLBACK', false, 1, 0]);
    const record = importPool({ failOn: t => /^INSERT INTO workspace_imports/.test(t) });
    await assert.rejects(run(record), /the database refuses/);
    assert.deepEqual([record.log.at(-1).sql, record.log.some(l => l.sql === 'COMMIT'), record.state.released], ['ROLLBACK', false, 1], 'rows without their record are not kept either');
    const commit = importPool({ failOn: t => t === 'COMMIT' });
    await assert.rejects(run(commit), /the database refuses/);
    assert.deepEqual([commit.log.at(-1).sql, commit.state.released], ['ROLLBACK', 1]);
  });
  test('the connection cannot be had at all: the error goes on', async () => {
    await assert.rejects(imp.run({ connect: async () => { throw new Error('no connection'); } }, 9, BUNDLE({})), /no connection/);
  });
});

describe('an import only adds: what the file itself may say', () => {
  const code = read('utils/workspace-import.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('no statement that changes or removes a row, none that moves a counter, none that replaces on a clash', () => {
    assert.doesNotMatch(code, /\b(DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|COPY|MERGE)\b/);
    assert.deepEqual(code.match(/\bUPDATE\b/g), ['UPDATE'], 'the one UPDATE in the text is the row lock "FOR NO KEY UPDATE"');
    assert.match(code, /'SELECT id FROM workspaces WHERE id = \$1 FOR NO KEY UPDATE'/);
    assert.doesNotMatch(code, /setval|nextval|ON CONFLICT|OVERRIDING|RESTART|session_replication_role|DISABLE TRIGGER/i);
  });
  test('its only INSERTs: the one for a row of the eight data tables — columns and marks only, RETURNING id — and the one into the record', () => {
    assert.deepEqual(code.match(/INSERT INTO [^(]+/g), ['INSERT INTO ${t} ', 'INSERT INTO workspace_imports ']);
    assert.match(code, /await db\.query\(`INSERT INTO \$\{t\} \(\$\{cols\.join\(', '\)\}\) VALUES \(\$\{marks\.join\(', '\)\}\) RETURNING id`, values\);/);
    assert.match(code, /for \(const t of DATA\) \{\s*const mine = steps\.filter\(s => s\.t === t\)/, '`t` is one of the eight names written in this file, never a word of the file');
    assert.match(code, /if \(col === 'id' \|\| !\(col in row\) \|\| skip\.includes\(col\) \|\| !IDENT\.test\(col\)\) continue;/);
    assert.match(code, /const IDENT = \/\^\[a-z_\]\[a-z0-9_\]\{0,62\}\$\/;/);
    assert.match(code, /cols\.push\(`"\$\{col\}"`\); values\.push\(c\.json && v !== null \? JSON\.stringify\(v\) : v\); marks\.push\(`\$\$\{values\.length\}\$\{c\.json \? '::jsonb' : ''\}`\);/);
  });
  test('every other question it asks of the database is a SELECT or one of a transaction\'s three words', () => {
    const asked = [...code.matchAll(/\.query\(\s*[`']([^`']*)/g)].map(m => m[1].trim());
    assert.equal(asked.length, (code.match(/\.query\(/g) || []).length, 'no question is built from anything but a text written here');
    const kinds = asked.map(sql => (/^(SELECT|INSERT INTO \$\{t\}|INSERT INTO workspace_imports|BEGIN|COMMIT|ROLLBACK)/.exec(sql) || ['?'])[0]);
    assert.deepEqual(kinds.sort(), ['BEGIN', 'COMMIT', 'INSERT INTO ${t}', 'INSERT INTO workspace_imports', 'ROLLBACK', 'ROLLBACK', 'ROLLBACK', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT'].sort());
  });
  test('the check asks nothing but SELECTs: readBundle, schemaOf, targetOf, decide and plan hold no word of a transaction and no INSERT', () => {
    const check = code.slice(0, code.indexOf('// ── the import (Part 2)'));
    assert.doesNotMatch(check, /INSERT|BEGIN|COMMIT|ROLLBACK|FOR NO KEY|\.connect\(/);
    for (const sql of [...check.matchAll(/\.query\(\s*[`']([^`']*)/g)].map(m => m[1].trim())) assert.match(sql, /^SELECT /, sql);
    const fn = check.slice(check.indexOf('function decide('));
    assert.doesNotMatch(fn, /await|\.query\(|pool/, 'deciding asks nothing: it is handed what was read');
  });
  test('it opens no database and no file: the pool is handed in, the bytes are handed in', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['zlib', './tar', './workspace-export']);
    assert.doesNotMatch(code, /console\.|writeFile|createWriteStream|extractTar|child_process/);
    assert.deepEqual(Object.keys(imp).sort(), ['DATA', 'ImportError', 'MAX_BYTES', 'NOT_CARRIED', 'decide', 'parentsFirst', 'pipelineName', 'plan', 'readBundle', 'run', 'schemaOf', 'targetOf'].sort());
  });
});
