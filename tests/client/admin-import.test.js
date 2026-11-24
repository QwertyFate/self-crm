// CLIENT (static + pure-function) tests: the admin console's "Import into a workspace" (WORKSPACE_IMPORT_CHANGES
// Parts 1–2, 2026-11-24; public/admin.html, routes/admin-transfer.js, utils/workspace-import.js): the DATA of an
// export file — contacts, deals, notes, with the pipelines and fields they need — into a workspace that is here.
// First the check, which only reads; then, only when nothing is in the way and only after a yes, the import.
//
// The page's own functions are sliced out of admin.html and run against a stand-in document and a stand-in server
// (fetch answers by "METHOD address"; an answer may be a function, an Error, or a promise that is still open).
// What matters most here: an import is never sent without a check that allowed it and a yes; whatever the server —
// and so the file — names stays TEXT; and only a number ever becomes part of an address.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const exporter = require('../../utils/workspace-export');
const importer = require('../../utils/workspace-import');

const html   = read('public/admin.html');
const panel  = html.slice(html.indexOf('<div id="tab-provisioning"'), html.indexOf('<!-- /#tab-provisioning -->'));
const section = panel.slice(panel.indexOf('<div class="section" id="imp-section">'));
const inline = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));
const block  = inline.slice(inline.indexOf('IMPORT INTO A WORKSPACE (WORKSPACE_IMPORT_CHANGES'), inline.indexOf('CRM ACCESS TAB (MASTER_ACCESS_CHANGES'));
const line = name => { const m = inline.match(new RegExp(`^    const ${name} = .*$`, 'm')); assert.ok(m, name); return m[0]; };

const NAMES = ['importTargetOptions', 'importSummary', 'importTableHtml', 'importNotesHtml', 'renderImportCheck', 'renderImportDone', 'renderImportActions', 'importChanged', 'importChosen', 'checkImportFile', 'importCheckedFile', 'renderImports', 'loadImports'];
const F = loadFns('public/admin.html', NAMES, {
  state: { importReady: null },
  extra: [sliceFn(inline, 'esc', 'admin.html'), sliceFn(inline, 'fmtVisitTime', 'admin.html'), inline.match(/^    const IMPORT_LABELS = \{[\s\S]*?^    \};/m)[0],
    line('IMPORT_MAX_BYTES'), line('importLabel'), line('importCount'), line('importId'), line('importFileName'), line('importSay'), line('importBlockersHtml'), line('drawImportActions'),
    `const API_BASE = '/api/admin';
     const document = { getElementById: id => (document._els[id] ||= { innerHTML: '', value: '', disabled: false, files: [] }), _els: {} };
     const __asked = [];
     let __answers = {}, __confirm = true, __lists = 0;
     function confirm(text) { __asked.push(['confirm', text]); return __confirm; }
     function loadProvisionList() { __lists++; }
     async function fetch(url, init) {
       const method = (init && init.method) || 'GET';
       __asked.push([method, url, (init && init.headers) || null, (init && init.body) || null]);
       let a = __answers[method + ' ' + url];
       if (typeof a === 'function') a = a();
       a = await a;
       if (a instanceof Error) throw a;
       if (a && a.__raw) return { status: a.__raw, json: async () => { throw new Error('no JSON'); } };
       return { status: 200, json: async () => a };
     }
     function __set2(k, v) { if (k === 'answers') __answers = v; else if (k === 'confirm') __confirm = v; }
     function __ready() { return importReady; }
     function __lists_() { return __lists; }
     function __reset() { document._els = {}; __asked.length = 0; __answers = {}; __confirm = true; __lists = 0; importReady = null; }`].join('\n'),
  expose: ['document', '__asked', '__set2', '__ready', '__lists_', '__reset', 'IMPORT_LABELS', 'IMPORT_MAX_BYTES', 'importLabel', 'importCount', 'importId', 'importFileName', 'importSay', 'importBlockersHtml'],
});
const el = id => F.document._els[id];
const HOSTILE = '<img src=x onerror="alert(1)"> "q" \'s\' &';
const SAFE = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &quot;q&quot; &#39;s&#39; &amp;';
const FILE = (more = {}) => ({ name: 'upgrads-muller-5-2026-11-24.tar.gz', size: 2048, ...more });
const T = (name, rows, adds, here = 0, left_out = 0) => ({ name, rows, adds, here, left_out });
const CHECK = (more = {}) => ({ file: { name: 'Müller & Söhne', exported_at: '2026-11-24T10:00:00.000Z', version: 2 }, into: { id: 7, name: 'Ziel GmbH' },
  tables: [T('custom_fields', 2, 1, 1), T('deal_fields', 0, 0), T('pipelines', 1, 1), T('pipeline_stages', 3, 3), T('contacts', 12, 10, 2), T('deals', 5, 4, 0, 1), T('activities', 30, 30), T('activity_comments', 0, 0)],
  unassigned: 6, pipelines: [{ name: 'Vertrieb', as: 'Vertrieb (imported)' }], not_included: [{ name: 'users', rows: 3 }, { name: 'tasks', rows: 12 }],
  warnings: ['2 contacts of the file have an email address that is in this workspace already.'], blockers: [], can_import: true, ...more });
const DONE = (more = {}) => { const { file, can_import, ...rest } = CHECK(); return { file, imported: { id: 31, ...rest, ...more } }; };
// the stand-in page with a workspace and a file chosen
function chosen({ id = '7', file = FILE() } = {}) { F.__reset(); F.document.getElementById('imp-into').value = id; F.document.getElementById('imp-file').files = file ? [file] : []; return file; }
const CHECK_URL = 'POST /api/admin/workspaces/7/import/check', RUN_URL = 'POST /api/admin/workspaces/7/import', LIST_URL = 'GET /api/admin/workspaces/imports';

describe('markup: the section in the Provisioning tab, below the list of workspaces', () => {
  test('what stands in it: the workspace to choose, the file, "Check the file", the result, the import\'s button, the record', () => {
    assert.ok(panel.indexOf('id="imp-section"') > panel.indexOf('id="prov-list-body"'), 'below the list with its Export buttons');
    assert.match(section, /<h2[^>]*>Import into a workspace<\/h2>/);
    assert.match(section, /<select id="imp-into" onchange="importChanged\(\)"><option value="">— choose the workspace —<\/option><\/select>/);
    assert.match(section, /<input type="file" id="imp-file" accept="\.gz,\.tgz,application\/gzip" onchange="importChanged\(\)" \/>/);
    assert.match(section, /<button class="btn btn-primary" id="imp-check" onclick="checkImportFile\(\)">Check the file<\/button>/);
    for (const id of ['imp-result', 'imp-actions', 'imp-list']) assert.ok(section.includes(`id="${id}"`), id);
    assert.ok(section.indexOf('id="imp-result"') < section.indexOf('id="imp-actions"') && section.indexOf('id="imp-actions"') < section.indexOf('Imports so far'), 'the button stands below what the check found');
  });
  test('one sentence is always there: an import only adds — and what comes along and what does not', () => {
    assert.match(section, /<strong>An import only adds — nothing that is in the workspace is replaced, changed or deleted\.<\/strong>/);
    assert.match(section, /its contacts, deals, notes\s+and their comments, with the pipelines and custom fields they need\. No owner, no team and no settings come\s+along\./);
    assert.match(section, /the check only reads the file and says what an import would add/);
    assert.doesNotMatch(html, /not built yet/i, 'the import is built: nothing says otherwise');
  });
  test('there is no import button in the markup itself: it is drawn only when a check allows it', () => {
    assert.doesNotMatch(section, /importCheckedFile/);
    assert.equal((html.match(/onclick="importCheckedFile\(\)"/g) || []).length, 1, 'one place draws it');
    assert.match(inline, /function renderImportActions\(\) \{\s*if \(!importReady\) return '';/);
  });
  test('every handler of the section is a function of the page; the list of workspaces fills the choice and loads the record', () => {
    for (const fn of ['importChanged', 'checkImportFile', 'importCheckedFile', 'loadImports', 'importTargetOptions']) assert.match(inline, new RegExp(`function\\s+${fn}\\s*\\(`), fn);
    const list = sliceFn(inline, 'loadProvisionList', 'admin.html');
    assert.match(list, /const into = document\.getElementById\('imp-into'\);[^\n]*\n\s*if \(into\) into\.innerHTML = importTargetOptions\(data\.workspaces, into\.value\);\n\s*loadImports\(\);/);
  });
});

describe('the words for what a file holds', () => {
  test('the kinds an import brings in, by name', () => {
    assert.deepEqual(importer.DATA.map(F.importLabel), ['Contact fields', 'Deal fields', 'Pipelines', 'Stages', 'Contacts', 'Deals', 'Notes and activities', 'Comments']);
  });
  test('every table an export can hold has its words — one added to the export later fails here', () => {
    for (const [name] of exporter.TABLES) { assert.ok(Object.prototype.hasOwnProperty.call(F.IMPORT_LABELS, name), name); assert.notEqual(F.importLabel(name), name, name); }
    assert.deepEqual(Object.keys(F.IMPORT_LABELS).sort(), exporter.TABLES.map(([n]) => n).sort(), 'and no words for a table that is none');
    assert.deepEqual([F.importLabel('users'), F.importLabel('tasks'), F.importLabel('journey_flows')], ['People (accounts)', 'Tasks', 'Workflows']);
  });
  test('a table that has no words is shown by its own name — also one named like something every object has', () => {
    for (const name of ['brand_new_table', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(F.importLabel(name), name);
    assert.deepEqual([F.importLabel(null), F.importLabel(undefined), F.importLabel(5)], ['', '', '5']);
  });
  test('a count is a whole number from nought; a workspace\'s id a plain positive number; a file\'s name only plain characters', () => {
    assert.deepEqual([3, '4', 2.9, 0, -5, null, undefined, 'x', NaN, Infinity, [7]].map(F.importCount), [3, 4, 2, 0, 0, 0, 0, 0, 0, 0, 7]);
    assert.deepEqual([7, '7', '1234567890', 0, '0', '07', -1, '7x', '7 OR 1=1', '1.5', '12345678901', null, undefined, '', [7]].map(F.importId), [7, 7, 1234567890, null, null, null, null, null, null, null, null, null, null, null, 7]);
    assert.deepEqual([{ name: 'upgrads-müller (1).tar.gz' }, { name: '<script>"x"</script>\r\nX-Evil: 1' }, { name: 'a'.repeat(300) }, {}, null].map(F.importFileName), ['upgrads-mller (1).tar.gz', 'scriptxscriptX-Evil 1', 'a'.repeat(200), '', '']);
    assert.equal(F.IMPORT_MAX_BYTES, 100 * 1024 * 1024);
    assert.match(read('server.js'), /import\(\?=\\\/\|\$\)\/, express\.raw\(\{ type: '\*\/\*', limit: '100mb' \}\)\)/, 'the same limit the server has on this address');
    assert.equal(String(/[^\w.() -]/g), String(/[^\w.() -]/g));
    assert.match(read('routes/admin-transfer.js'), /req\.get\('X-File-Name'\) \|\| ''\)\.replace\(\/\[\^\\w\.\(\) -\]\/g, ''\)\.slice\(0, 200\)/, 'cleaned here as the server cleans it');
  });
  test('the workspaces to choose from: a number as the value, the name as text, the one that was chosen still chosen', () => {
    const out = F.importTargetOptions([{ id: 7, name: 'Ziel GmbH' }, { id: 8, name: HOSTILE }, { id: '9', name: '' }, { id: '7);alert(1)//', name: 'bad id' }, null, { name: 'no id' }], '8');
    assert.equal(out, `<option value="">— choose the workspace —</option><option value="7">Ziel GmbH (#7)</option><option value="8" selected>${SAFE} (#8)</option><option value="9">(no name) (#9)</option>`);
    assert.equal(F.importTargetOptions(null, ''), '<option value="">— choose the workspace —</option>');
    assert.doesNotMatch(F.importTargetOptions([{ id: 7, name: 'x' }], ''), /selected/);
  });
  test('"12 contacts, 5 deals, 30 notes": the three kinds a person asks about, then how many rows else', () => {
    assert.equal(F.importSummary(CHECK().tables), '10 contacts, 4 deals, 30 notes, 5 other rows (fields, pipelines, stages, comments)');
    assert.equal(F.importSummary([T('contacts', 1, 1), T('deals', 1, 1), T('activities', 1, 1), T('pipelines', 1, 1)]), '1 contact, 1 deal, 1 note, 1 other row (fields, pipelines, stages, comments)');
    assert.equal(F.importSummary([T('contacts', 3, 0, 3)]), '0 contacts, 0 deals, 0 notes');
    for (const none of [null, undefined, 'x', {}, []]) assert.equal(F.importSummary(none), '0 contacts, 0 deals, 0 notes');
    assert.equal(F.importSummary([null, { name: 'contacts', adds: '2' }, { name: HOSTILE, adds: 1 }]), '2 contacts, 0 deals, 0 notes, 1 other row (fields, pipelines, stages, comments)');
  });
});

describe('what the check found', () => {
  test('from which file into which workspace; each kind with rows: in the file, would be added, already here, left out', () => {
    const out = F.renderImportCheck(CHECK());
    assert.match(out, /^<p style="margin-top:10px">From <strong>Müller &amp; Söhne<\/strong>, exported [^<]+ — into <strong>Ziel GmbH<\/strong> <span class="prov-hint">#7<\/span>\.<\/p>/);
    assert.match(out, /<thead><tr><th>What<\/th><th>In the file<\/th><th>Would be added<\/th><th>Already here \(kept as they are\)<\/th><th>Left out<\/th><\/tr><\/thead>/);
    assert.deepEqual([...out.matchAll(/<tr><td>([^<]*)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)].map(m => m.slice(1)),
      [['Contact fields', '2', '1', '1', '0'], ['Pipelines', '1', '1', '0', '0'], ['Stages', '3', '3', '0', '0'], ['Contacts', '12', '10', '2', '0'], ['Deals', '5', '4', '0', '1'], ['Notes and activities', '30', '30', '0', '0']],
      'a kind the file has no rows of (deal fields, comments) is not listed');
    assert.doesNotMatch(out, /message error/);
  });
  test('what else is said: the pipeline under another name, the rows that arrive unassigned, what to know, and what is not part of an import', () => {
    const out = F.renderImportCheck(CHECK());
    assert.match(out, /A pipeline that would arrive under another name, because one of that name is here:<\/p>\s*<ul[^>]*><li>Vertrieb → <strong>Vertrieb \(imported\)<\/strong><\/li><\/ul>/);
    assert.match(out, /<p style="margin-top:10px">6 rows arrive unassigned: people do not come along\.<\/p>/);
    assert.match(out, /<strong>To know before importing<\/strong><\/p><ul[^>]*><li>2 contacts of the file have an email address that is in this workspace already\.<\/li><\/ul>/);
    assert.match(out, /<strong>Not part of an import<\/strong> <span class="prov-hint">\(in the file, and staying behind\)<\/span><\/p>\s*<ul[^>]*><li>People \(accounts\): 3<\/li><li>Tasks: 12<\/li><\/ul>/);
  });
  test('each of those only when there is something to say — and in the singular for one', () => {
    const quiet = F.renderImportCheck(CHECK({ unassigned: 0, pipelines: [{ name: 'Vertrieb', as: 'Vertrieb' }], not_included: [{ name: 'tasks', rows: 0 }], warnings: [] }));
    assert.doesNotMatch(quiet, /another name|unassigned|To know before|Not part of an import/);
    const one = F.renderImportCheck(CHECK({ unassigned: 1, pipelines: [{ name: 'A', as: 'A (imported)' }, { name: 'B', as: 'B (imported)' }, { name: 'C', as: 'C' }] }));
    assert.match(one, /1 row arrives unassigned/);
    assert.match(one, /Pipelines that would arrive under another name[\s\S]*<li>A → <strong>A \(imported\)<\/strong><\/li><li>B → <strong>B \(imported\)<\/strong><\/li><\/ul>/);
    assert.doesNotMatch(one, /<li>C →/);
  });
  test('something in the way is said first, in the error style — the counts are shown all the same', () => {
    const out = F.renderImportCheck(CHECK({ can_import: false, blockers: ['1 workflow is switched on in this workspace ("Neue Leads").', 'This file was imported into this workspace before (2026-02-02).'] }));
    assert.match(out, /^<div class="message error" style="display:block">This file cannot be imported here:<ul[^>]*><li>1 workflow is switched on in this workspace \(&quot;Neue Leads&quot;\)\.<\/li><li>This file was imported into this workspace before \(2026-02-02\)\.<\/li><\/ul><\/div><p/);
    assert.match(out, /<td>Contacts<\/td><td>12<\/td>/);
  });
  test('a file with nothing an import brings in says so', () => {
    const out = F.renderImportCheck(CHECK({ tables: [T('contacts', 0, 0)], pipelines: [], unassigned: 0, warnings: [] }));
    assert.match(out, /The file holds nothing an import brings in: no contacts, deals, notes, pipelines or fields\./);
    assert.doesNotMatch(out, /<table/);
  });
  test('whatever the server names — and so whatever the file names — stays text', () => {
    const out = F.renderImportCheck({ file: { name: HOSTILE, exported_at: HOSTILE }, into: { id: '7"><script>', name: HOSTILE }, tables: [{ name: HOSTILE, rows: 1, adds: '<b>', here: HOSTILE, left_out: 1 }], unassigned: '<i>',
      pipelines: [{ name: HOSTILE, as: HOSTILE + '2' }], not_included: [{ name: HOSTILE, rows: 2 }], warnings: [HOSTILE], blockers: [HOSTILE], can_import: true });
    assert.equal(out.split(SAFE).length - 1, 8, 'the file, the workspace, a kind, a pipeline twice, a table staying behind, a warning, a blocker');
    assert.doesNotMatch(out, /<img|<script|<b>|<i>|onerror="/);
    assert.doesNotMatch(out, /#7/, 'an id that is no number is not shown as one');
  });
  test('an answer with parts missing or of the wrong kind is still drawn, never thrown on', () => {
    for (const d of [{}, null, undefined, { tables: 'x', warnings: 'y', blockers: {}, pipelines: 5, not_included: null, file: [], into: 'z' }, { tables: [null, 'x', { rows: 1 }], pipelines: [null, 'x'], not_included: [null], warnings: [null, 5, ''], blockers: [undefined] }]) {
      const out = F.renderImportCheck(d);
      assert.match(out, /From <strong>\(no name\)<\/strong> — into <strong>\(no name\)<\/strong>\./);
      assert.doesNotMatch(out, /undefined|null|NaN|\[object/);
    }
  });
});

describe('"Check the file": the file goes to the server as it is, for the chosen workspace — and nothing is written', () => {
  test('what is missing is said, and nothing is sent: no workspace, no file, a file larger than the server takes', async () => {
    chosen({ id: '' });
    await F.checkImportFile();
    assert.deepEqual([el('imp-result').innerHTML, F.__asked.length], ['<div class="message error" style="display:block">Choose the workspace the file should go into.</div>', 0]);
    for (const id of ['abc', '0', '7 OR 1=1', '7/../8']) { chosen({ id }); await F.checkImportFile(); assert.deepEqual([/Choose the workspace/.test(el('imp-result').innerHTML), F.__asked.length], [true, 0], id); }
    chosen({ file: null });
    await F.checkImportFile();
    assert.deepEqual([el('imp-result').innerHTML, F.__asked.length], ['<div class="message error" style="display:block">Choose the export file (.tar.gz) first.</div>', 0]);
    chosen({ file: FILE({ size: 100 * 1024 * 1024 + 1 }) });
    await F.checkImportFile();
    assert.deepEqual([el('imp-result').innerHTML, F.__asked.length], ['<div class="message error" style="display:block">The file is larger than 100 MB: an export is never that large.</div>', 0]);
    chosen({ file: FILE({ size: 100 * 1024 * 1024 }) });
    F.__set2('answers', { [CHECK_URL]: CHECK() });
    await F.checkImportFile();
    assert.equal(F.__asked.length, 1, 'exactly the limit is still sent');
  });
  test('the request: the very file as the body, as gzip, to the address of the chosen workspace', async () => {
    const file = chosen();
    F.__set2('answers', { [CHECK_URL]: CHECK() });
    await F.checkImportFile();
    assert.equal(F.__asked.length, 1);
    const [method, url, headers, body] = F.__asked[0];
    assert.deepEqual([method, url, headers], ['POST', '/api/admin/workspaces/7/import/check', { 'Content-Type': 'application/gzip' }]);
    assert.equal(body, file, 'the file itself, not a copy read into the page');
  });
  test('while the server reads: the button is locked and it says so; afterwards the result stands and the button is free', async () => {
    chosen();
    let answer;
    F.__set2('answers', { [CHECK_URL]: new Promise(resolve => { answer = resolve; }) });
    const running = F.checkImportFile();
    assert.deepEqual([el('imp-check').disabled, el('imp-result').innerHTML, el('imp-actions').innerHTML], [true, '<div class="loading">Checking the file…</div>', '']);
    answer(CHECK());
    await running;
    assert.equal(el('imp-check').disabled, false);
    assert.match(el('imp-result').innerHTML, /^<p style="margin-top:10px">From <strong>Müller &amp; Söhne<\/strong>/);
  });
  test('nothing in the way: the import is offered — for that workspace, that file, with what would be added', async () => {
    const file = chosen();
    F.__set2('answers', { [CHECK_URL]: CHECK() });
    await F.checkImportFile();
    assert.deepEqual(F.__ready(), { id: 7, name: 'Ziel GmbH', file, adds: '10 contacts, 4 deals, 30 notes, 5 other rows (fields, pipelines, stages, comments)' });
    assert.equal(el('imp-actions').innerHTML, '<button class="btn btn-primary" id="imp-run" onclick="importCheckedFile()">Import into Ziel GmbH</button> <span class="prov-hint">Adds 10 contacts, 4 deals, 30 notes, 5 other rows (fields, pipelines, stages, comments). Nothing that is in the workspace is changed.</span>');
    chosen();
    F.__set2('answers', { [CHECK_URL]: CHECK({ into: { id: 7, name: HOSTILE } }) });
    await F.checkImportFile();
    assert.equal(el('imp-actions').innerHTML.split(SAFE).length - 1, 1, 'the workspace\'s name on the button is text');
    assert.doesNotMatch(el('imp-actions').innerHTML, /<img/);
  });
  test('something in the way, or the server not saying it may be imported: no import is offered', async () => {
    for (const more of [{ can_import: false, blockers: ['A workflow is switched on.'] }, { can_import: true, blockers: ['said one thing, meant another'] }, { can_import: false }, { can_import: 'yes' }, { can_import: undefined }]) {
      chosen();
      F.__set2('answers', { [CHECK_URL]: CHECK(more) });
      await F.checkImportFile();
      assert.deepEqual([F.__ready(), el('imp-actions').innerHTML], [null, ''], JSON.stringify(more));
    }
  });
  test('a refusal is said as the server said it, as text; the network away and an answer that is none are said too — and no import is offered', async () => {
    for (const [answer, said] of [[{ error: 'The file is not a workspace export of this CRM.', code: 'format' }, 'The file is not a workspace export of this CRM.'], [{ error: HOSTILE, code: 'x' }, SAFE], [{ error: 'Workspace not found.', code: 'workspace' }, 'Workspace not found.'],
      [new Error('offline'), 'The server could not be reached, or it did not answer the check.'], [{ __raw: 413 }, 'The server could not be reached, or it did not answer the check.'], [{}, 'That did not work.'], [null, 'That did not work.'], [{ tables: 'x' }, 'That did not work.']]) {
      chosen();
      F.__set2('answers', { [CHECK_URL]: answer });
      await F.checkImportFile();
      assert.deepEqual([el('imp-result').innerHTML, F.__ready(), el('imp-actions').innerHTML, el('imp-check').disabled], [`<div class="message error" style="display:block">${said}</div>`, null, '', false], said);
    }
  });
  test('a new check first withdraws what the one before allowed; so does choosing another workspace or another file', async () => {
    chosen();
    F.__set2('answers', { [CHECK_URL]: CHECK() });
    await F.checkImportFile();
    assert.ok(F.__ready());
    F.__set2('answers', { [CHECK_URL]: { error: 'no' } });
    await F.checkImportFile();
    assert.deepEqual([F.__ready(), el('imp-actions').innerHTML], [null, '']);
    F.__set2('answers', { [CHECK_URL]: CHECK() });
    await F.checkImportFile();
    assert.ok(F.__ready());
    F.importChanged();
    assert.deepEqual([F.__ready(), el('imp-actions').innerHTML, el('imp-result').innerHTML], [null, '', ''], 'what was checked is no longer what would be imported');
    assert.match(block, /async function checkImportFile\(\) \{\s*importReady = null; drawImportActions\(\);/);
  });
});

describe('"Import into …": only what was checked, only after a yes, only once', () => {
  const ready = async (more = {}) => { const file = chosen(); F.__set2('answers', { [CHECK_URL]: CHECK(), ...more }); await F.checkImportFile(); F.__asked.length = 0; return file; };
  test('without a check that allowed it nothing is asked and nothing is sent', async () => {
    chosen();
    await F.importCheckedFile();
    assert.equal(F.__asked.length, 0);
  });
  test('it asks once, saying what will be added and that nothing existing is changed — "no" sends nothing and leaves the offer standing', async () => {
    await ready();
    F.__set2('confirm', false);
    await F.importCheckedFile();
    assert.deepEqual(F.__asked, [['confirm', 'Add the data of this file to "Ziel GmbH"?\n\n10 contacts, 4 deals, 30 notes, 5 other rows (fields, pipelines, stages, comments) would be added.\nNothing that is in the workspace is changed, replaced or deleted. An import cannot be taken back with one click.']]);
    assert.ok(F.__ready(), 'still offered');
    assert.match(el('imp-actions').innerHTML, /Import into Ziel GmbH/);
  });
  test('"yes": the same file once more, to the import\'s address of the same workspace, with its name for the record as plain characters', async () => {
    const file = await ready({ [RUN_URL]: DONE(), [LIST_URL]: { imports: [] } });
    file.name = 'upgrads-müller (1)\r\n.tar.gz';
    await F.importCheckedFile();
    const sent = F.__asked.filter(a => a[0] === 'POST');
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0][1], sent[0][2]], ['/api/admin/workspaces/7/import', { 'Content-Type': 'application/gzip', 'X-File-Name': 'upgrads-mller (1).tar.gz' }]);
    assert.equal(sent[0][3], file, 'the very file that was checked');
  });
  test('the offer is gone the moment it is taken — a second click while it runs sends nothing', async () => {
    await ready();
    let answer;
    F.__set2('answers', { [RUN_URL]: new Promise(resolve => { answer = resolve; }) });
    const running = F.importCheckedFile();
    assert.deepEqual([F.__ready(), el('imp-actions').innerHTML, el('imp-result').innerHTML], [null, '', '<div class="loading">Importing… this can take a moment.</div>']);
    await F.importCheckedFile();
    assert.equal(F.__asked.filter(a => a[0] === 'POST').length, 1);
    answer(DONE());
    await running;
  });
  test('done: what was added is said, per kind, in the past tense — and the list above and the record are read again', async () => {
    await ready({ [RUN_URL]: DONE() });
    await F.importCheckedFile();
    const out = el('imp-result').innerHTML;
    assert.match(out, /^<div class="message success" style="display:block">Imported into Ziel GmbH: 10 contacts, 4 deals, 30 notes, 5 other rows \(fields, pipelines, stages, comments\) were added\. Nothing that was there before was changed\.<\/div>/);
    assert.match(out, /From <strong>Müller &amp; Söhne<\/strong>\. The workspace's Contacts and Deals now show them\./);
    assert.match(out, /<th>Added<\/th><th>Already here \(kept as they were\)<\/th><th>Left out<\/th>/);
    assert.match(out, /<td>Contacts<\/td><td>12<\/td><td>10<\/td><td>2<\/td><td>0<\/td>/);
    assert.match(out, /A pipeline that arrived under another name/);
    assert.match(out, /6 rows arrived unassigned/);
    assert.match(out, /<strong>To know about this import<\/strong>/);
    assert.match(out, /<strong>Not part of an import<\/strong>/);
    assert.doesNotMatch(out, /Would be added|would arrive|To know before importing/);
    assert.deepEqual([F.__lists_(), F.__ready(), el('imp-actions').innerHTML], [1, null, ''], 'the workspace\'s counts and "Imports so far" are loaded anew; no button is left');
  });
  test('after an import the same file is not offered again: it has to be checked anew (and the check then says it was imported)', async () => {
    await ready({ [RUN_URL]: DONE() });
    await F.importCheckedFile();
    F.__asked.length = 0;
    await F.importCheckedFile();
    assert.equal(F.__asked.length, 0);
  });
  test('something came in the way between check and import: the server\'s sentence with its reasons — it says nothing was written', async () => {
    await ready({ [RUN_URL]: { error: 'This file cannot be imported into this workspace as things are. Nothing was written.', code: 'blocked', blockers: ['1 workflow is switched on in this workspace ("Neue <b>").'] }, [LIST_URL]: { imports: [] } });
    await F.importCheckedFile();
    assert.equal(el('imp-result').innerHTML, '<div class="message error" style="display:block">This file cannot be imported into this workspace as things are. Nothing was written.<ul style="margin:6px 0 0 18px"><li>1 workflow is switched on in this workspace (&quot;Neue &lt;b&gt;&quot;).</li></ul></div>');
    assert.deepEqual([F.__ready(), el('imp-actions').innerHTML, F.__lists_()], [null, '', 0]);
    assert.equal(F.__asked.some(a => a[0] === 'GET' && a[1] === '/api/admin/workspaces/imports'), true, 'the record is read again all the same');
  });
  test('any other refusal: the server\'s sentence, and that nothing was written', async () => {
    for (const [answer, said] of [[{ error: 'Workspace not found.', code: 'workspace' }, 'Workspace not found. Nothing was written.'], [{ error: HOSTILE }, `${SAFE} Nothing was written.`], [{}, 'That did not work. Nothing was written.'], [null, 'That did not work. Nothing was written.'],
      [{ imported: { tables: 'x' } }, 'That did not work. Nothing was written.'], [{ error: 'Internal server error' }, 'Internal server error Nothing was written.']]) {
      await ready({ [RUN_URL]: answer, [LIST_URL]: { imports: [] } });
      await F.importCheckedFile();
      assert.equal(el('imp-result').innerHTML, `<div class="message error" style="display:block">${said}</div>`, JSON.stringify(answer));
      assert.equal(F.__ready(), null);
    }
  });
  test('no answer at all: it does NOT claim that nothing was written — it says where to look before trying again', async () => {
    for (const answer of [new Error('offline'), { __raw: 502 }]) {
      await ready({ [RUN_URL]: answer, [LIST_URL]: { imports: [] } });
      await F.importCheckedFile();
      assert.equal(el('imp-result').innerHTML, '<div class="message error" style="display:block">The server could not be reached, or it did not answer. Whether the import went through is said under &quot;Imports so far&quot; — look there before trying again.</div>');
      assert.equal(F.__ready(), null, 'not offered again without a new check');
    }
  });
  test('what was done, drawn from the server\'s answer alone: every word of it stays text', () => {
    const out = F.renderImportDone({ file: { name: HOSTILE }, imported: { id: 1, into: { id: 7, name: HOSTILE }, tables: [{ name: HOSTILE, rows: 1, adds: 1, here: 0, left_out: 0 }], unassigned: 2, pipelines: [{ name: HOSTILE, as: 'x' }], not_included: [{ name: HOSTILE, rows: 1 }], warnings: [HOSTILE] } });
    assert.equal(out.split(SAFE).length - 1, 6);
    assert.doesNotMatch(out, /<img/);
    for (const d of [{}, null, { imported: null }, { imported: { tables: null } }]) assert.match(F.renderImportDone(d), /^<div class="message success" style="display:block">Imported into \(no name\): 0 contacts, 0 deals, 0 notes were added\./);
  });
});

describe('"Imports so far": the record', () => {
  const ROW = (more = {}) => ({ id: 2, workspace_id: 7, workspace_name: 'Ziel GmbH', file_name: 'upgrads-muller-5.tar.gz', source_name: 'Müller & Söhne', exported_at: '2026-11-24T10:00:00.000Z',
    counts: { contacts: { adds: 10, here: 2, left_out: 0 }, deals: { adds: 4, here: 0, left_out: 1 }, activities: { adds: 30, here: 0, left_out: 0 }, pipelines: { adds: 1, here: 0, left_out: 0 } }, created_at: '2026-11-24T12:00:00.000Z', ...more });
  test('when, which file, from which workspace, into which, and what was added', () => {
    const out = F.renderImports([ROW()]);
    assert.match(out, /<thead><tr><th>When<\/th><th>File<\/th><th>From<\/th><th>Into<\/th><th>Added<\/th><\/tr><\/thead>/);
    assert.match(out, /<td>upgrads-muller-5\.tar\.gz<\/td><td>Müller &amp; Söhne<br><span class="prov-hint">exported [^<]+<\/span><\/td>\s*<td>Ziel GmbH <span class="prov-hint">#7<\/span><\/td><td>10 contacts, 4 deals, 30 notes, 1 other row \(fields, pipelines, stages, comments\)<\/td><\/tr>/);
  });
  test('none yet; a workspace that was deleted since; a row with parts missing', () => {
    for (const none of [[], null, undefined, 'x', [null]]) assert.equal(F.renderImports(none), 'Nothing has been imported yet.');
    const out = F.renderImports([ROW({ workspace_id: null, workspace_name: 'Gelöscht', file_name: '', exported_at: null, counts: null })]);
    assert.match(out, /<td>—<\/td><td>Müller &amp; Söhne<\/td>\s*<td>Gelöscht <span class="prov-hint">\(workspace deleted\)<\/span><\/td><td>0 contacts, 0 deals, 0 notes<\/td>/);
    assert.doesNotMatch(F.renderImports([{ id: 1 }, { counts: [1, 2] }, { counts: 'x' }]), /undefined|null|NaN|\[object/);
  });
  test('every word of a row stays text', () => {
    const out = F.renderImports([ROW({ workspace_name: HOSTILE, file_name: HOSTILE, source_name: HOSTILE, workspace_id: '7"><script>', counts: { [HOSTILE]: { adds: '<b>' } } })]);
    assert.equal(out.split(SAFE).length - 1, 3);
    assert.doesNotMatch(out, /<img|<script|<b>/);
  });
  test('it is read from the server; a refusal or no answer is said in its place, as text', async () => {
    F.__reset();
    F.__set2('answers', { [LIST_URL]: { imports: [ROW()] } });
    await F.loadImports();
    assert.deepEqual(F.__asked.map(a => [a[0], a[1]]), [['GET', '/api/admin/workspaces/imports']]);
    assert.match(el('imp-list').innerHTML, /<td>Ziel GmbH /);
    for (const [answer, said] of [[{ error: HOSTILE }, SAFE], [new Error('offline'), 'The record of imports could not be loaded.'], [{}, 'The record of imports could not be loaded.'], [{ imports: 'x' }, 'The record of imports could not be loaded.'], [null, 'The record of imports could not be loaded.']]) {
      F.__reset(); F.__set2('answers', { [LIST_URL]: answer });
      await F.loadImports();
      assert.equal(el('imp-list').innerHTML, said);
    }
  });
});

describe('the lines that make it so', () => {
  test('an address is built from a number only, in both places; the file is the body as it is', () => {
    assert.deepEqual([...block.matchAll(/fetch\(`\$\{API_BASE\}\/workspaces\/([^`]*)`/g)].map(m => m[1]), ['${chosen.id}/import/check', '${ready.id}/import', 'imports']);
    assert.match(block, /const id = importId\(document\.getElementById\('imp-into'\)\.value\);/);
    assert.match(block, /importReady = \{ id: chosen\.id, name: String\(\(data\.into && data\.into\.name\) \|\| ''\), file: chosen\.file, adds: importSummary\(data\.tables\) \};/);
    assert.equal((block.match(/body: (chosen|ready)\.file \}/g) || []).length, 2);
  });
  test('the import is offered only when the server said so AND named nothing in the way; it is sent only from the one function, after its question', () => {
    assert.match(block, /if \(data\.can_import === true && !blocked\) importReady = /);
    assert.equal((block.match(/\/import`, \{ method: 'POST'/g) || []).length, 1);
    const fn = sliceFn(inline, 'importCheckedFile', 'admin.html');
    assert.ok(fn.indexOf('if (!ready) return;') < fn.indexOf('confirm(') && fn.indexOf('confirm(') < fn.indexOf('importReady = null; drawImportActions();') && fn.indexOf('importReady = null; drawImportActions();') < fn.indexOf('fetch('), 'no offer → nothing; the question; the offer withdrawn; only then the request');
  });
  test('nothing the page shows of an answer is put into the page as it came: every value goes through esc, a number through a count', () => {
    for (const name of ['importTableHtml', 'importNotesHtml', 'renderImportCheck', 'renderImportDone', 'renderImportActions', 'renderImports', 'importTargetOptions']) {
      const fn = sliceFn(inline, name, 'admin.html');
      for (const m of fn.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
        const inner = m[1].trim();
        if (/^(esc\(|importCount\(|importId\(|importTableHtml\(|importNotesHtml\(|importBlockersHtml\(|renamed\.length|joined|unassigned === 1|done \?|parts|rows\.map|renamed\.map|warnings\.map|behind\.map|list\.map|blockers\.length \?|String\(importId|file\.exported_at \?|importId\(into\.id\) \?|importId\(r\.workspace_id\) \?|r\.exported_at \?|unassigned\b)/.test(inner)) continue;
        assert.fail(`${name}: \${${inner.slice(0, 80)}} is neither escaped nor a count`);
      }
    }
  });
});
