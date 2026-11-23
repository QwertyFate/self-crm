// CLIENT tests: note templates (NOTE_EDITOR_CHANGES Part 5).
//
// Next to the note boxes of a deal and of a contact — the box for a new entry and the editor of an existing one —
// sits "Insert template". It lists the workspace's templates; picking one puts its text into the note at the
// cursor, on lines of its own, and tells the field it was typed into, so the view treats it like typing (the draft
// is kept, an edited note saves itself). The same list offers "Add template" and "Manage templates". The note is
// saved as any note is: nothing here writes one.
//
// The pure functions run as the real code from public/js/note-templates.js; the windows are pinned as text.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFns, sliceFn, sliceConst } = require('../helpers/client-fn');

const js   = read('public/js/note-templates.js');
const dv   = read('public/js/detail-views.js');
const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const route = read('routes/note-templates.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const BASE = `${sliceFn(core, 'esc', 'core.js')}
  const __dict = ${JSON.stringify(dict.en)};
  const t = k => { if (!(k in __dict)) throw new Error('no key ' + k); return __dict[k]; };
  const tf = (k, o) => t(k).replace(/\\{(\\w+)\\}/g, (_, n) => o[n]);
  const icon = name => '<i:' + name + '>';`;
const F = loadFns('public/js/note-templates.js', ['ntplButtonHtml', 'ntplInserted', 'ntplInsert', 'ntplListHtml', 'ntplErrorText', 'ntplKind', 'ntplQuestions', 'ntplMoved', 'ntplQuestionRowsHtml', 'ntplAnswered', 'ntplAnswerRowsHtml'], {
  extra: `${BASE} ${js.match(/^const NTPL_ERRORS = \{[^\n]*\};$/m)[0]} ${js.match(/^const NTPL_MAX_QUESTIONS = \d+, NTPL_MAX_QUESTION = \d+;/m)[0]}` });

describe('where the text goes (ntplInserted)', () => {
  const T = 'Budget:\nDecision maker:';
  test('an empty note: the template is the note, the cursor after it', () => {
    assert.deepEqual(F.ntplInserted('', 0, 0, T), { value: T, caret: T.length });
  });
  test('at the cursor, on lines of its own: a line break before and after where text touches it', () => {
    const r = F.ntplInserted('Hello world', 5, 5, T);
    assert.equal(r.value, `Hello\n${T}\n world`);
    assert.equal(r.caret, `Hello\n${T}`.length);
  });
  test('at the end of what is written', () => {
    assert.equal(F.ntplInserted('Called at ten.', 14, 14, T).value, `Called at ten.\n${T}`);
  });
  test('no second line break where one is already there', () => {
    assert.equal(F.ntplInserted('Intro\n\nOutro', 6, 6, T).value, `Intro\n${T}\nOutro`);
  });
  test('a selection is replaced', () => {
    assert.equal(F.ntplInserted('Keep REPLACE keep', 5, 12, 'X').value, 'Keep \nX\n keep');
  });
  test('a field with text that was never clicked into (cursor at the very start): the template goes to the end, never above what is written', () => {
    assert.equal(F.ntplInserted('Already written', 0, 0, T).value, `Already written\n${T}`);
    assert.equal(F.ntplInserted('   ', 0, 0, T).value, `${T}\n   `, 'only spaces is not "something written"');
  });
  test('Windows line ends in a template become plain ones; a cursor outside the text is pulled in', () => {
    assert.equal(F.ntplInserted('', 0, 0, 'a\r\nb\rc').value, 'a\nb\nc');
    assert.equal(F.ntplInserted('abc', 99, 99, 'X').value, 'abc\nX');
    assert.equal(F.ntplInserted('abc', undefined, undefined, 'X').value, 'abc\nX');
  });
});

describe('putting it into the field (ntplInsert)', () => {
  const field = (value, at) => { const f = { value, selectionStart: at, selectionEnd: at, focused: 0, range: null, events: [],
    focus() { this.focused++; }, setSelectionRange(a, b) { this.range = [a, b]; }, dispatchEvent(e) { this.events.push(e); } }; return f; };

  test('the text, the cursor after it, the focus back in the field — and the field is told it was typed into', () => {
    const f = field('Hello', 5);
    F.ntplInsert(f, 'Budget:');
    assert.equal(f.value, 'Hello\nBudget:');
    assert.deepEqual(f.range, [13, 13]); assert.equal(f.focused, 1);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].type, 'input'); assert.equal(f.events[0].bubbles, true, 'the views listen on their root, so it must bubble');
  });
  test('no field, or one that is switched off (a deal without a contact): nothing', () => {
    assert.doesNotThrow(() => F.ntplInsert(null, 'x'));
    const f = field('', 0); f.disabled = true;
    F.ntplInsert(f, 'x');
    assert.equal(f.value, ''); assert.equal(f.events.length, 0);
  });
  test('the views hear that event: the new entry\'s draft, the edited note\'s auto-save and its height', () => {
    assert.match(dv, /on\(root, 'input', '#dd-compose-text', \(e, el\) => \{ S\.text = el\.value;/);
    assert.match(dv, /on\(host, 'input', '#ct-atext', \(e, el\) => \{ S\.draft\.text = el\.value;/);
    assert.match(dv, /on\(root, 'input', '#dd-act-edit', \(e, el\) => \{ S\.editText = el\.value; el\.removeAttribute\('aria-invalid'\); dvAutoGrow\(el\); S\.saver && S\.saver\.input\(el\.value\); \}\);/);
    assert.match(dv, /on\(host, 'input', '#ct-aedit', \(e, el\) => \{ S\.editText = el\.value; el\.removeAttribute\('aria-invalid'\); dvAutoGrow\(el\); S\.saver && S\.saver\.input\(el\.value\); \}\)\);/);
  });
});

describe('the button', () => {
  test('a button that never submits the form it sits in, and names the field its template goes into', () => {
    assert.equal(F.ntplButtonHtml('dd-compose-text'), '<button type="button" class="btn btn-ghost btn-sm ntpl-btn" data-tpl="dd-compose-text" aria-haspopup="menu"><i:file-text>Insert template</button>');
    assert.match(F.ntplButtonHtml('dd-compose-text', true), / disabled>/);
    assert.doesNotMatch(F.ntplButtonHtml('"><img>'), /<img>/);
  });
  test('it is next to all four note boxes: a new entry and an edited one, on a deal and on a contact', () => {
    assert.match(dv, /<span class="row">\$\{ntplButtonHtml\('dd-compose-text', !c\)\}<button class="btn btn-primary btn-sm" type="submit" \$\{c \? '' : 'disabled'\}>/, 'deal, new entry: off while the deal has no contact, like the box itself');
    assert.match(dv, /<div class="row-between">\$\{ntplButtonHtml\('dd-act-edit'\)\}<span class="row">\$\{dvSaveStateHtml\('dd-act-state', S\.editSave\)\}/, 'deal, edited entry');
    assert.match(dv, /<div class="ct-compose-foot"><span class="help">\$\{esc\(t\('dv_ctrl_enter'\)\)\}<\/span><span class="row">\$\{ntplButtonHtml\('ct-atext'\)\}<button class="btn btn-primary btn-sm" type="submit">/, 'contact, new entry');
    assert.match(dv, /<span class="row">\$\{ntplButtonHtml\('ct-aedit'\)\}<span class="help">\$\{esc\(t\('ctrl_enter_saves_esc_cancels'\)\)\}<\/span><\/span>/, 'contact, edited entry');
    assert.equal((dv.match(/ntplButtonHtml\(/g) || []).length, 4);
    for (const id of ['dd-compose-text', 'dd-act-edit', 'ct-atext', 'ct-aedit']) assert.ok(dv.includes(`id="${id}"`), `the field #${id} exists`);
  });
  test('one listener on the page opens the list for any such button; a switched-off one does nothing', () => {
    assert.match(js, /document\.addEventListener\('click', e => \{\s*const b = e\.target && e\.target\.closest \? e\.target\.closest\('\[data-tpl\]'\) : null;\s*if \(!b \|\| b\.disabled\) return;\s*e\.preventDefault\(\);\s*ntplMenu\(b\);\s*\}\);/);
  });
  test('the script is loaded once, after the windows it uses and before the views that call it', () => {
    assert.equal((html.match(/<script src="js\/note-templates\.js"><\/script>/g) || []).length, 1);
    const at = s => html.indexOf(`<script src="js/${s}"></script>`);
    assert.ok(at('core.js') < at('note-templates.js') && at('note-templates.js') < at('detail-views.js'));
  });
});

describe('the list under the button (ntplMenu)', () => {
  // the real ntplMenu with a fake server, a fake menu and a fake page
  async function open({ templates, onPage = true }) {
    const M = loadFns('public/js/note-templates.js', ['ntplMenu', 'ntplKind'], {
      extra: `${BASE}
        const __seen = { menus: [], inserted: [], answered: [], forms: 0, manage: 0 }; let __list = [], __onPage = true;
        function ntplAnswer(field, tpl) { __seen.answered.push([field().id, tpl.name]); }
        const api = { get: async url => { __seen.url = url; return { templates: __list, max: 50 }; } };
        const ui = { menu: (anchor, items) => { __seen.menus.push(items); } };
        const document = { body: { contains: () => __onPage }, getElementById: id => ({ id }) };
        function ntplInsert(field, text) { __seen.inserted.push([field.id, text]); }
        function ntplForm(tpl) { __seen.forms++; } function ntplManage() { __seen.manage++; }
        function __setup(list, onPage) { __list = list; __onPage = onPage; } function __state() { return __seen; }`,
      expose: ['__setup', '__state'] });
    M.__setup(templates, onPage);
    await M.ntplMenu({ dataset: { tpl: 'dd-compose-text' } });
    return M.__state();
  }

  test('the workspace\'s templates as the server sends them, then "Add template" and "Manage templates"', async () => {
    const s = await open({ templates: [{ id: 1, name: 'First call', content: 'Budget:' }, { id: 2, name: 'Follow-up', content: 'Open points:' }] });
    assert.equal(s.url, '/api/note-templates');
    assert.deepEqual(s.menus[0].map(i => i.sep ? '—' : i.label), ['First call', 'Follow-up', '—', 'Add template', 'Manage templates']);
  });
  test('picking one puts its text into the field the button names', async () => {
    const s = await open({ templates: [{ id: 1, name: 'First call', content: 'Budget:\nTimeline:' }] });
    s.menus[0][0].onSelect();
    assert.deepEqual(s.inserted, [['dd-compose-text', 'Budget:\nTimeline:']]);
  });
  test('"Add template" opens the form, "Manage templates" the list', async () => {
    const s = await open({ templates: [{ id: 1, name: 'A', content: 'x' }] });
    s.menus[0][2].onSelect(); s.menus[0][3].onSelect();   // after the one template and the line
    assert.deepEqual([s.forms, s.manage], [1, 1]);
  });
  test('no templates yet: the list says so and offers only "Add template"', async () => {
    const s = await open({ templates: [] });
    assert.deepEqual(s.menus[0].map(i => i.sep ? '—' : i.heading || i.label), ['No templates yet', '—', 'Add template']);
  });
  test('the view was rebuilt while the list was fetched: no list on a button that is gone', async () => {
    assert.deepEqual((await open({ templates: [{ id: 1, name: 'A', content: 'x' }], onPage: false })).menus, []);
  });
  test('the list is asked for every time, so a template a colleague just added is there', () => {
    assert.doesNotMatch(js, /let ntpl(Cache|List)\b/);
  });
});

describe('the "Note templates" window', () => {
  test('each template: its name, the first line of its text, Edit and Delete', () => {
    const h = F.ntplListHtml([{ id: 3, name: 'First call', content: '\n  Budget:\nTimeline:' }]);
    assert.match(h, /^<ul class="ntpl-list"><li class="ntpl-row"><div class="ntpl-what"><b>First call<\/b><span class="muted truncate">Budget:<\/span><\/div>/);
    assert.match(h, /<button class="iconbtn" data-ntpl-edit="3" aria-label="Edit template First call" title="Edit"><i:pencil><\/button>/);
    assert.match(h, /<button class="iconbtn" data-ntpl-del="3" aria-label="Delete template First call" title="Delete"><i:trash><\/button>/);
  });
  test('none yet: what a template is, in one sentence', () => {
    assert.match(F.ntplListHtml([]), /<b>No templates yet<\/b><div>A template is a text written once and put into a note with one click/);
  });
  test('names and texts typed by people cannot inject markup', () => {
    const h = F.ntplListHtml([{ id: 1, name: '<img src=x onerror=alert(1)>', content: '<script>alert(2)</script>' }]);
    assert.doesNotMatch(h, /<img|<script/);
    assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
  test('deleting asks first and says that notes stay; one a colleague deleted meanwhile counts as deleted', () => {
    const m = sliceFn(js, 'ntplManage', 'note-templates.js');
    assert.match(m, /const ok = await ui\.confirm\(\{ title: t\('ntpl_delete_q'\), message: tf\('ntpl_delete_msg', \{ name: tp\.name \}\), confirmLabel: t\('btn_delete'\), danger: true \}\);\s*if \(!ok\) return;/);
    assert.match(m, /const res = await api\.del\(`\/api\/note-templates\/\$\{tp\.id\}`\);\s*if \(res && res\.error && res\.code !== 'not_found'\) return ui\.toast\(ntplErrorText\(res\)\);/);
    assert.ok(dict.en.ntpl_delete_msg.includes('stay as they are') && dict.de.ntpl_delete_msg.includes('bleiben unverändert'));
  });
});

describe('the form', () => {
  const form = sliceFn(js, 'ntplForm', 'note-templates.js');
  test('a name and a text, with the route\'s limits; saving adds or changes', () => {
    assert.match(js, /^const NTPL_MAX_NAME = 80, NTPL_MAX_TEXT = 20000;/m);
    assert.match(route, /const MAX_TEMPLATES = 50, MAX_NAME = 80, MAX_CONTENT = 20000;/, 'the same limits as the route');
    assert.match(form, /<input class="input" id="\$\{id\}-name" maxlength="\$\{NTPL_MAX_NAME\}"/);
    assert.match(form, /<textarea class="textarea" id="\$\{id\}-text" rows="14" maxlength="\$\{NTPL_MAX_TEXT\}"/);
    assert.match(form, /const res = tpl \? await api\.put\(`\/api\/note-templates\/\$\{tpl\.id\}`, body\) : await api\.post\('\/api\/note-templates', body\);/);
    assert.match(form, /const body = kind === 'questions' \? \{ name: now\.name, questions: now\.qs \} : \{ name: now\.name, content: now\.text \};/, 'the text goes as typed: plain text');
  });
  test('an empty name or text is said in the form before the server is asked; a refusal shows the server\'s reason in words', () => {
    assert.match(form, /if \(!now\.name\) \{ fail\(t\('ntpl_err_name'\)\); el\('name'\)\.focus\(\); return; \}\s*if \(kind === 'text' && !now\.text\.trim\(\)\) \{ fail\(t\('ntpl_err_content'\)\); el\('text'\)\.focus\(\); return; \}/);
    assert.match(form, /if \(!res \|\| res\.error \|\| !res\.template\) \{ fail\(ntplErrorText\(res\)\);/);
  });
  test('closing it with something typed and not saved asks, as a note does; a save closes without the question', () => {
    assert.match(form, /beforeClose: \(\) => \{ const now = read\(\); return \(now\.name === start\.name && now\.text === start\.text && now\.qs\.join\('\\n'\) === start\.qs\.join\('\\n'\)\) \|\| typeof dvConfirmUnsaved !== 'function' \|\| dvConfirmUnsaved\(\); \}/);
    assert.match(form, /m\.close\(\);[^\n]*\n\s*ui\.toast\(t\('ntpl_saved'\)\);\s*if \(onDone\) onDone\(res\.template\);/);
    assert.match(dv, /^function dvConfirmUnsaved\(\)/m);
  });
  // Part 7: the form sat in the window as a plain block, so the name field touched the label of the text field. A window's
  // body spaces its own children only (.modal-body: gap), and the form is its one child — the fields are the form's.
  test('the fields stand apart: the form is a column with a gap, as the other form windows are', () => {
    assert.match(form, /<form id="\$\{id\}" novalidate class="col" style="gap:14px;padding-top:4px">/);
    assert.match(dv, /<form id="\$\{fid\}" novalidate class="col" style="gap:14px;padding-top:4px">/, 'the same as the task form in detail-views.js');
    assert.match(css, /^\.col \{ display: flex; flex-direction: column; gap: 8px; \}/m);
    assert.doesNotMatch(css, /\.field \+ \.field|\.modal-body > form|\.modal-body form/, 'no rule spaces a plain form\'s fields by itself');
  });
});

describe('words and codes', () => {
  test('every refusal the route names has its sentence, in both languages', () => {
    const codes = [...route.matchAll(/^\s{2}(\w+):\s+\[\d{3},/gm)].map(m => m[1]);
    assert.deepEqual(codes, ['name', 'content', 'questions', 'name_taken', 'limit', 'not_found']);
    for (const c of codes) assert.notEqual(F.ntplErrorText({ code: c }), dict.en.ntpl_err_generic, c);
    assert.equal(F.ntplErrorText({ code: 'whatever' }), dict.en.ntpl_err_generic);
    assert.equal(F.ntplErrorText(null), dict.en.ntpl_err_generic);
  });
  test('every sentence exists in both languages and is used; the German ones address nobody', () => {
    const keys = Object.keys(dict.en).filter(k => k.startsWith('ntpl_'));
    assert.equal(keys.length, 42);
    for (const k of keys) {
      assert.ok(k in dict.de, k);
      assert.ok(js.includes(`'${k}'`), `${k} is used`);
      assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|Sie|Ihre?n?)\b/, `${k} is impersonal`);
    }
    assert.equal(dict.en.ntpl_insert, 'Insert template'); assert.equal(dict.de.ntpl_insert, 'Vorlage einfügen');
    assert.ok(dict.en.ntpl_err_limit.includes('50') && dict.en.ntpl_err_name.includes('80') && dict.en.ntpl_err_content.includes('20,000'), 'the sentences name the route\'s limits');
  });
});

describe('a note from a template is a note like any other', () => {
  test('this file writes no note and reads none: only the templates\' own route', () => {
    assert.doesNotMatch(js, /\/api\/activities/);
    assert.deepEqual([...new Set([...js.matchAll(/['`](\/api\/[a-z-]+)/g)].map(m => m[1]))], ['/api/note-templates']);
  });
  test('the notes\' own writers are untouched: the same stored shape as before', () => {
    assert.match(dv, /api\.post\('\/api\/activities', \{ contact_id: c\.id, deal_id: S\.d\.id, type: S\.type, content: esc\(text\)\.replace\(\/\\n\/g, '<br>'\) \}\);/);
    assert.match(dv, /api\.post\('\/api\/activities', \{ contact_id: id, type: d\.type, content: esc\(text\)\.replace\(\/\\n\/g, '<br>'\) \}\);/);
  });
});

describe('the look', () => {
  test('the button is quiet; the rows of the window', () => {
    assert.match(css, /^\.ntpl-btn \{ color: var\(--text-2\); \}$/m);
    assert.match(css, /^\.ntpl-row \{ display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var\(--divider\); \}$/m);
    assert.match(css, /^\.dd-editor \.row-between > \.row:last-child \{ margin-left: auto; \}/m, 'in the editor the buttons stay right, the template button and the help line left');
  });
});

// ── Part 6: everywhere a note can be created ─────────────────────────────────
// Asked after Part 5: "add them to all where a note can be created". A note is created in four places — the deal
// window, the contact view, the box on the Activities page and the Calendar's "Log activity" window — and each of
// them now has the button next to its text field.
describe('everywhere a note can be created (Part 6)', () => {
  const fs = require('fs'), path = require('path');
  const { ROOT } = require('../helpers/load-route');
  const objects = read('public/js/objects.js'), modals = read('public/js/modals.js');
  // the app's own scripts; the landing page's demo is a copy of the look and writes nothing
  const appFiles = fs.readdirSync(path.join(ROOT, 'public/js')).filter(f => f.endsWith('.js') && !f.startsWith('landing')).map(f => 'public/js/' + f);

  test('the four places that create a note are the only ones, and each has the button for its own text field', () => {
    const writers = appFiles.flatMap(f => (read(f).match(/api\.post\('\/api\/activities'/g) || []).map(() => f)).sort();
    assert.deepEqual(writers, ['public/js/detail-views.js', 'public/js/detail-views.js', 'public/js/modals.js', 'public/js/objects.js'],
      'a fifth place that creates a note needs "Insert template" too — then add it here');
    // the field each writer reads its text from, and the button that names that field
    assert.match(dv, /const text = S\.text\.trim\(\)/);                        assert.match(dv, /ntplButtonHtml\('dd-compose-text', !c\)/);
    assert.match(dv, /const d = S\.draft, text = d\.text\.trim\(\);/);         assert.match(dv, /ntplButtonHtml\('ct-atext'\)/);
    assert.match(objects, /const C = activityCompose, text = C\.text\.trim\(\)/); assert.match(objects, /ntplButtonHtml\('ac-text'\)/);
    assert.match(modals, /content:\s+esc\(document\.getElementById\('act-content'\)\.value\)/); assert.match(html, /data-tpl="act-content"/);
  });

  test('the Activities page: the button beside the type buttons, for the box #ac-text', () => {
    const r = sliceFn(objects, 'renderActivityCompose', 'objects.js');
    assert.match(r, /<div class="row-between"><div class="seg" role="group" aria-label="\$\{esc\(t\('lbl_type'\)\)\}">\$\{ACT_TYPES\.map\([\s\S]*?\.join\(''\)\}<\/div>\$\{typeof ntplButtonHtml === 'function' \? ntplButtonHtml\('ac-text'\) : ''\}<\/div>/);
    assert.match(r, /<textarea class="textarea" id="ac-text" rows="2"[^>]*oninput="onActivityComposeInput\(this\)"/);
    const at = s => html.indexOf(`<script src="js/${s}"></script>`);
    assert.ok(at('objects.js') < at('note-templates.js'), 'objects.js is loaded first, hence the "typeof" before the call: the page is drawn later, when the button exists');
  });

  test('the Activities page: an inserted template is the box\'s draft, exactly as if it had been typed', () => {
    const O = loadFns('public/js/objects.js', ['onActivityComposeInput', 'activityComposeClearError'], {
      state: { activityCompose: { type: 'note', text: '', deal: '', contact: '', err: '' } },
      extra: `const document = { getElementById: () => null }; function __draft() { return activityCompose.text; }`, expose: ['__draft'] });
    // what ntplInsert does to the field, then the field's own oninput
    const field = { value: '', selectionStart: 0, selectionEnd: 0, focus() {}, setSelectionRange() {}, dispatchEvent(e) { if (e.type === 'input') O.onActivityComposeInput(this); } };
    F.ntplInsert(field, 'Budget:\nTimeline:');
    assert.equal(O.__draft(), 'Budget:\nTimeline:');
    assert.match(dv, /return typeof activityCompose !== 'undefined' && !!String\(activityCompose\?\.text \|\| ''\)\.trim\(\);/, 'and that draft counts when the browser tab is closed (Part 3)');
  });

  test('the Calendar\'s "Log activity" window: the button in the row of the text\'s label, as plain markup with its word from the dictionary', () => {
    const start = html.indexOf('<div id="activity-modal"'), win = html.slice(start, html.indexOf('</form>', start));
    assert.match(win, /<div class="field"><div class="row-between"><label class="label" for="act-content">[\s\S]*?<\/label><button type="button" class="btn btn-ghost btn-sm ntpl-btn" data-tpl="act-content" aria-haspopup="menu"><svg class="ic" aria-hidden="true"><use href="#i-file-text"\/><\/svg><span data-i18n="ntpl_insert">Insert template<\/span><\/button><\/div><textarea id="act-content" rows="8" required><\/textarea><\/div>/);
    assert.equal((win.match(/data-tpl=/g) || []).length, 1);
    assert.match(html, /<symbol id="i-file-text"/, 'the icon exists in the sprite');
  });

  test('the Calendar window: the same button as the views draw (type button, never a submit), and its text is what is saved and what is asked about', () => {
    const drawn = F.ntplButtonHtml('act-content').replace('<i:file-text>', '<svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg>').replace('Insert template</button>', '<span data-i18n="ntpl_insert">Insert template</span></button>');
    assert.ok(html.includes(drawn), 'class, type and attributes match ntplButtonHtml');
    assert.match(sliceFn(modals, 'closeActivityModal', 'modals.js'), /const field = document\.getElementById\('act-content'\);\s*if \(field && field\.value\.trim\(\)/, 'an inserted template counts as typed: closing asks first (Part 3)');
  });

  test('one listener serves all six buttons: no place wires its own', () => {
    assert.equal((js.match(/addEventListener\('click'/g) || []).length, 1);
    for (const src of [dv, objects, modals]) assert.doesNotMatch(src, /ntplMenu\(/);
    assert.deepEqual([(dv.match(/ntplButtonHtml\(/g) || []).length, (objects.match(/ntplButtonHtml\(/g) || []).length, (html.match(/data-tpl="/g) || []).length], [4, 1, 1],
      'four in the deal window and the contact view, one on the Activities page, one in the Calendar window');
  });
});

// ── Part 8: a template is a text or a questionnaire ──────────────────────────
// Asked 2026-11-20: "a questionnaire wherein a user can set up the questions, then when using it it's just the answer
// they write". This part is the SETTING UP: the form's second kind, a list of questions, one per row. The pure
// functions run as the real code; the form's wiring is pinned as text (and was run in a DOM, see the change log).
describe('a questionnaire is set up as a list of questions (Part 8)', () => {
  const form = sliceFn(js, 'ntplForm', 'note-templates.js');

  test('which kind a template is: one with questions is a questionnaire, every other a text', () => {
    assert.equal(F.ntplKind({ questions: ['Budget?'] }), 'questions');
    for (const tpl of [null, undefined, {}, { questions: null }, { questions: [] }, { questions: 'Budget?' }, { content: 'Budget?' }]) assert.equal(F.ntplKind(tpl), 'text', JSON.stringify(tpl));
  });

  test('the questions as they are saved: one line each, trimmed, empty rows left out — the route\'s own cleaning', () => {
    assert.deepEqual(F.ntplQuestions(['  Budget?  ', '', '   ', 'Who\ndecides\t and   when?']), ['Budget?', 'Who decides and when?']);
    assert.deepEqual(F.ntplQuestions(['', ' ']), []);
    for (const none of [null, undefined, 'Budget?', 5, {}]) assert.deepEqual(F.ntplQuestions(none), []);
    assert.deepEqual(F.ntplQuestions([null, 5, 'x']), ['5', 'x'], 'never throws on something that is no text');
    assert.match(route, /const qs = list\.map\(q => q\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\)\.filter\(Boolean\);/, 'the same rule in the route');
    assert.match(sliceFn(js, 'ntplQuestions', 'note-templates.js'), /\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\)\.filter\(Boolean\);/);
  });

  test('moving a row one place up or down; the first cannot go up, the last cannot go down; the list given is not changed', () => {
    const list = ['a', 'b', 'c'];
    assert.deepEqual(F.ntplMoved(list, 1, -1), ['b', 'a', 'c']);
    assert.deepEqual(F.ntplMoved(list, 1, 1), ['a', 'c', 'b']);
    assert.deepEqual(F.ntplMoved(list, 0, -1), ['a', 'b', 'c']);
    assert.deepEqual(F.ntplMoved(list, 2, 1), ['a', 'b', 'c']);
    for (const i of [-1, 3, NaN, 1.5]) assert.deepEqual(F.ntplMoved(list, i, 1), ['a', 'b', 'c'], String(i));
    assert.deepEqual(list, ['a', 'b', 'c']);
  });

  test('a row: its number, the question in a field with the route\'s limit, then up, down and remove — each named with the row\'s number', () => {
    const h = F.ntplQuestionRowsHtml(['Budget?', 'Timeline?']);
    assert.equal((h.match(/<li class="ntpl-q">/g) || []).length, 2);
    assert.match(h, /^<li class="ntpl-q"><span class="ntpl-q-no" aria-hidden="true">1\.<\/span><input class="input" data-ntpl-q="0" maxlength="300" autocomplete="off" placeholder="Question 1" aria-label="Question 1" value="Budget\?">/);
    assert.match(h, /<button type="button" class="iconbtn" data-ntpl-qup="1" aria-label="Move question 2 up" title="Move question 2 up"><i:arrow-up><\/button>/);
    assert.match(h, /<button type="button" class="iconbtn" data-ntpl-qdown="0" aria-label="Move question 1 down" title="Move question 1 down"><i:arrow-down><\/button>/);
    assert.match(h, /<button type="button" class="iconbtn" data-ntpl-qdel="1" aria-label="Remove question 2" title="Remove question 2"><i:x><\/button><\/li>$/);
    for (const name of ['arrow-up', 'arrow-down', 'x', 'plus']) assert.ok(html.includes(`<symbol id="i-${name}"`), `the icon ${name} exists`);
  });
  test('the first row has no way up, the last no way down, a single row neither; every button is a plain button, never a submit', () => {
    const h = F.ntplQuestionRowsHtml(['a', 'b', 'c']);
    assert.match(h, /data-ntpl-qup="0"[^>]* disabled>/); assert.doesNotMatch(h, /data-ntpl-qup="[12]"[^>]* disabled>/);
    assert.match(h, /data-ntpl-qdown="2"[^>]* disabled>/); assert.doesNotMatch(h, /data-ntpl-qdown="[01]"[^>]* disabled>/);
    assert.doesNotMatch(h, /data-ntpl-qdel="\d"[^>]* disabled>/);
    const one = F.ntplQuestionRowsHtml(['']);
    assert.match(one, /data-ntpl-qup="0"[^>]* disabled>/); assert.match(one, /data-ntpl-qdown="0"[^>]* disabled>/);
    assert.equal((h.match(/<button /g) || []).length, (h.match(/<button type="button" /g) || []).length);
    assert.equal(F.ntplQuestionRowsHtml([]), '');
  });
  test('a question typed by someone cannot inject markup or leave its field', () => {
    const h = F.ntplQuestionRowsHtml(['"><img src=x onerror=alert(1)>']);
    assert.doesNotMatch(h, /<img/);
    assert.match(h, /value="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;">/);
  });

  test('the form: the two kinds at its top, the text\'s part and the questions\' part', () => {
    assert.match(form, /<div class="seg ntpl-kind" role="group" aria-label="\$\{esc\(t\('ntpl_kind'\)\)\}"><button type="button" data-ntpl-kind="text">\$\{esc\(t\('ntpl_text'\)\)\}<\/button><button type="button" data-ntpl-kind="questions">\$\{esc\(t\('ntpl_kind_q'\)\)\}<\/button><\/div>/);
    assert.match(form, /<div class="field" data-ntpl-pane="text"><label class="label" for="\$\{id\}-text">/);
    assert.match(form, /<div class="field" data-ntpl-pane="questions"><span class="label" id="\$\{id\}-qlabel">\$\{esc\(t\('ntpl_questions'\)\)\}<\/span>\s*<ol class="ntpl-qs" id="\$\{id\}-qs" aria-labelledby="\$\{id\}-qlabel"><\/ol>\s*<div><button type="button" class="btn btn-ghost btn-sm" data-ntpl-qadd>\$\{icon\('plus'\)\}\$\{esc\(t\('ntpl_q_add'\)\)\}<\/button><\/div>\s*<p class="help">\$\{esc\(t\('ntpl_q_hint'\)\)\}<\/p><\/div>/);
    assert.ok(form.indexOf('data-ntpl-kind="text"') > form.indexOf('id="${id}-name"') && form.indexOf('data-ntpl-kind="text"') < form.indexOf('data-ntpl-pane="text"'), 'the name, then the kind, then its part');
  });
  test('it opens on the kind the template has: a new one and a text as text, a questionnaire with its questions; a questionnaire\'s text is not offered as a text', () => {
    assert.match(form, /const id = 'ntpl-' \+ uid\(\), asks = ntplKind\(tpl\) === 'questions';/);
    assert.match(form, /const start = \{ name: tpl \? tpl\.name : '', text: tpl && !asks \? tpl\.content : '', qs: asks \? ntplQuestions\(tpl\.questions\) : \[\] \};/);
    assert.match(form, /let kind = asks \? 'questions' : 'text', qs = start\.qs\.length \? \[\.\.\.start\.qs\] : \[''\];/, 'an empty first row to type into');
    assert.match(form, /draw\(\); show\(\);\s*return m;/);
  });
  test('only the chosen kind\'s part is shown, and its button is pressed; what was typed for the other is kept (nothing is cleared)', () => {
    assert.match(form, /m\.el\.querySelectorAll\('\[data-ntpl-kind\]'\)\.forEach\(b => b\.setAttribute\('aria-pressed', String\(b\.dataset\.ntplKind === kind\)\)\);/);
    assert.match(form, /m\.el\.querySelectorAll\('\[data-ntpl-pane\]'\)\.forEach\(p => \{ p\.hidden = p\.dataset\.ntplPane !== kind; \}\);/);
    assert.match(form, /on\(m\.el, 'click', '\[data-ntpl-kind\]', \(e, b\) => \{ kind = b\.dataset\.ntplKind; el\('err'\)\.hidden = true; show\(\); \}\);/);
    // .field is display:flex — an author rule that would beat the hidden attribute without this one (feedback: hidden vs cascade)
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m);
    assert.match(css, /^\.field \{ display: flex;/m);
  });
  test('typing a question keeps it; Enter in a question is "the next question" and never saves; "Add question" adds a row at the end', () => {
    assert.match(form, /on\(m\.el, 'input', '\[data-ntpl-q\]', \(e, f\) => \{ qs\[Number\(f\.dataset\.ntplQ\)\] = f\.value; \}\);/);
    assert.match(form, /on\(m\.el, 'keydown', '\[data-ntpl-q\]', \(e, f\) => \{ if \(e\.key !== 'Enter' \|\| e\.isComposing\) return; e\.preventDefault\(\); addAfter\(Number\(f\.dataset\.ntplQ\)\); \}\);/);
    assert.match(form, /on\(m\.el, 'click', '\[data-ntpl-qadd\]', \(\) => addAfter\(qs\.length - 1\)\);/);
    assert.match(form, /function addAfter\(i\) \{\s*if \(qs\.length >= NTPL_MAX_QUESTIONS\) return;\s*qs\.splice\(i \+ 1, 0, ''\); draw\(\); focusRow\(i \+ 1\);\s*\}/);
  });
  test('no more rows than the route takes: the button is off at the limit', () => {
    assert.match(form, /m\.el\.querySelector\('\[data-ntpl-qadd\]'\)\.disabled = qs\.length >= NTPL_MAX_QUESTIONS;/);
    assert.match(js, /^const NTPL_MAX_QUESTIONS = 40, NTPL_MAX_QUESTION = 300;/m);
    assert.match(route, /^const MAX_QUESTIONS = 40, MAX_QUESTION = 300;$/m, 'the same limits as the route');
    assert.ok(dict.en.ntpl_q_hint.includes('40') && dict.de.ntpl_q_hint.includes('40') && dict.en.ntpl_err_questions.includes('40') && dict.en.ntpl_err_questions.includes('300'), 'the sentences name them');
  });
  test('removing a row; the last one is emptied instead of taken away; moving keeps the cursor on the row that moved', () => {
    assert.match(form, /qs\.splice\(i, 1\); if \(!qs\.length\) qs = \[''\];/);
    assert.match(form, /draw\(\); focusRow\(Math\.min\(i, qs\.length - 1\)\);/);
    assert.match(form, /const up = b\.dataset\.ntplQup !== undefined, i = Number\(up \? b\.dataset\.ntplQup : b\.dataset\.ntplQdown\), by = up \? -1 : 1;\s*qs = ntplMoved\(qs, i, by\); draw\(\); focusRow\(i \+ by, up \? 'qup' : 'qdown'\);/);
    assert.match(form, /const want = m\.el\.querySelector\(`\[data-ntpl-\$\{part\}="\$\{i\}"\]`\), f = want && !want\.disabled \? want : m\.el\.querySelector\(`\[data-ntpl-q="\$\{i\}"\]`\);/, 'a button that is switched off at the edge: the question itself');
  });
  test('saving sends the kind that is shown: the questions cleaned, or the text; a questionnaire without a question is said in the form', () => {
    assert.match(form, /function read\(\) \{ return \{ name: el\('name'\)\.value\.trim\(\), text: el\('text'\)\.value, qs: ntplQuestions\(qs\) \}; \}/);
    assert.match(form, /if \(kind === 'questions' && !now\.qs\.length\) \{ fail\(t\('ntpl_err_questions'\)\); focusRow\(0\); return; \}/);
    assert.match(form, /const body = kind === 'questions' \? \{ name: now\.name, questions: now\.qs \} : \{ name: now\.name, content: now\.text \};/);
  });

  test('the "Note templates" window says what a questionnaire is and how many questions it has', () => {
    const row = tpl => F.ntplListHtml([{ id: 1, name: 'First call', ...tpl }]);
    assert.match(row({ content: 'Budget?\n\nTimeline?', questions: ['Budget?', 'Timeline?'] }), /<b>First call<\/b><span class="muted truncate">Questionnaire, 2 questions<\/span>/);
    assert.match(row({ content: 'Budget?', questions: ['Budget?'] }), /<span class="muted truncate">Questionnaire, 1 question<\/span>/);
    assert.match(row({ content: 'Budget:', questions: null }), /<span class="muted truncate">Budget:<\/span>/, 'a text: its first line, as before');
    assert.equal(dict.de.ntpl_q_one, 'Fragebogen, 1 Frage'); assert.equal(dict.de.ntpl_q_many, 'Fragebogen, {n} Fragen');
  });

  test('a questionnaire\'s own text is the route\'s: the questions, a blank line between them (for whatever reads only the text)', () => {
    assert.match(route, /content: questions\.join\('\\n\\n'\), questions \} : \{ code: 'questions' \};/);
  });

  test('the look: the kind buttons do not stretch across the form; a row is the number, the field and three buttons', () => {
    assert.match(css, /^\.col \{ display: flex; flex-direction: column;/m, 'the form is a column, whose children stretch …');
    assert.match(css, /^\.ntpl-kind \{ align-self: flex-start; \}$/m, '… so the two buttons are told not to');
    assert.match(css, /^\.ntpl-qs \{ list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; \}$/m);
    assert.match(css, /^\.ntpl-q \{ display: flex; align-items: center; gap: 4px; \}$/m);
    assert.match(css, /^\.ntpl-q \.input \{ flex: 1 1 auto; min-width: 0; margin-right: 2px; \}$/m);
    assert.match(css, /^\.ntpl-q \.iconbtn:disabled \{ opacity: \.35; cursor: default; background: none; color: var\(--text-2\); \}$/m);
    const at = s => css.indexOf(s);
    assert.ok(at('.ntpl-q .iconbtn:disabled') > at('.iconbtn:hover { background: var(--hover)'), 'after the hover rule it switches off (same weight would lose, more weight wins either way)');
  });

  test('the words: German as the team says it, addressing nobody', () => {
    assert.deepEqual([dict.de.ntpl_kind_q, dict.de.ntpl_questions, dict.de.ntpl_q_add, dict.de.ntpl_q_ph], ['Fragebogen', 'Fragen', 'Frage hinzufügen', 'Frage {n}']);
    assert.deepEqual([dict.en.ntpl_kind_q, dict.en.ntpl_questions, dict.en.ntpl_q_add, dict.en.ntpl_q_ph], ['Questionnaire', 'Questions', 'Add question', 'Question {n}']);
    for (const k of ['ntpl_q_ph', 'ntpl_q_remove', 'ntpl_q_up', 'ntpl_q_down', 'ntpl_q_many']) for (const lang of ['en', 'de']) assert.ok(dict[lang][k].includes('{n}'), `${lang} ${k} names the number`);
  });
});

// ── Part 9: using a questionnaire — only the answers are written ─────────────
// Piece 2 of the request of 2026-11-20. Picking a questionnaire under "Insert template" opens a window with every
// question and a box for its answer; "Insert into note" puts the answered questions into the note (question, answer
// under it, a blank line between two) and leaves the unanswered ones out. From there it is a note like any other.
describe('a questionnaire is answered in its own window (Part 9)', () => {
  const answer = sliceFn(js, 'ntplAnswer', 'note-templates.js');
  const Q = ['What is the budget?', 'Is the financing clarified?', 'When should the move happen?'];

  test('what goes into the note: each question with its answer under it, a blank line between two', () => {
    assert.equal(F.ntplAnswered(Q, ['300,000 €', 'Yes, the bank has approved', 'Spring 2027']),
      'What is the budget?\n300,000 €\n\nIs the financing clarified?\nYes, the bank has approved\n\nWhen should the move happen?\nSpring 2027');
  });
  test('a question without an answer is left out — empty, only spaces, only line breaks, or no box at all', () => {
    assert.equal(F.ntplAnswered(Q, ['300,000 €', '', 'Spring 2027']), 'What is the budget?\n300,000 €\n\nWhen should the move happen?\nSpring 2027');
    assert.equal(F.ntplAnswered(Q, ['', '  \n \t', 'Spring 2027']), 'When should the move happen?\nSpring 2027');
    assert.equal(F.ntplAnswered(Q, ['300,000 €']), 'What is the budget?\n300,000 €');
    assert.equal(F.ntplAnswered(Q, [null, undefined, 0]), 'When should the move happen?\n0', 'a 0 is an answer');
  });
  test('nothing answered: nothing, so the window can say so instead of putting an empty text into the note', () => {
    for (const none of [[], ['', ' ', '\n'], null, undefined, 'x']) assert.equal(F.ntplAnswered(Q, none), '', JSON.stringify(none));
    assert.equal(F.ntplAnswered(null, ['x']), ''); assert.equal(F.ntplAnswered([], ['x']), '');
  });
  test('an answer keeps its own lines and its inner spaces; the spaces around it go, Windows line ends become plain ones', () => {
    assert.equal(F.ntplAnswered(['Notes?'], ['  first line\r\n  second line\r\rlast  ']), 'Notes?\nfirst line\n  second line\n\nlast');
  });
  test('the answer stays with ITS question when one before it is left empty', () => {
    assert.equal(F.ntplAnswered(['A?', 'B?', 'C?'], ['', 'b', '']), 'B?\nb');
  });
  test('in the note it lands like any template: on lines of its own, after what is written', () => {
    const text = F.ntplAnswered(['Budget?'], ['300']);
    assert.equal(F.ntplInserted('Called at ten.', 14, 14, text).value, 'Called at ten.\nBudget?\n300');
  });

  test('the window\'s rows: the question is the label of the box its answer is written in', () => {
    const h = F.ntplAnswerRowsHtml('ntpl-x', ['Budget?', 'Timeline?']);
    assert.equal(h, '<div class="field ntpl-a"><label class="label" for="ntpl-x-a0">Budget?</label><textarea class="textarea" id="ntpl-x-a0" data-ntpl-a="0" rows="2" placeholder="Answer"></textarea></div>'
      + '<div class="field ntpl-a"><label class="label" for="ntpl-x-a1">Timeline?</label><textarea class="textarea" id="ntpl-x-a1" data-ntpl-a="1" rows="2" placeholder="Answer"></textarea></div>');
    assert.equal(F.ntplAnswerRowsHtml('ntpl-x', []), '');
  });
  test('a question typed by someone cannot inject markup into the window', () => {
    const h = F.ntplAnswerRowsHtml('ntpl-x', ['</label><img src=x onerror=alert(1)>']);
    assert.doesNotMatch(h, /<img/); assert.match(h, /&lt;\/label&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/label>/);
  });

  // the real ntplMenu with a fake server and a stand-in for the window
  async function pick(templates, i = 0) {
    const M = loadFns('public/js/note-templates.js', ['ntplMenu', 'ntplKind'], {
      extra: `${BASE}
        const __seen = { menus: [], inserted: [], answered: [] }; let __list = [];
        const api = { get: async () => ({ templates: __list, max: 50 }) };
        const ui = { menu: (anchor, items) => { __seen.menus.push(items); } };
        const document = { body: { contains: () => true }, getElementById: id => ({ id }) };
        function ntplInsert(field, text) { __seen.inserted.push([field.id, text]); }
        function ntplAnswer(field, tpl) { __seen.answered.push([typeof field, field().id, tpl.name, tpl.questions]); }
        function ntplForm() {} function ntplManage() {}
        function __setup(list) { __list = list; } function __state() { return __seen; }`,
      expose: ['__setup', '__state'] });
    M.__setup(templates);
    await M.ntplMenu({ dataset: { tpl: 'dd-compose-text' } });
    const s = M.__state();
    s.menus[0][i].onSelect();
    return s;
  }
  test('picking a questionnaire opens its window — with the way to the note\'s field, not the field of that moment — and puts nothing into the note yet', async () => {
    const s = await pick([{ id: 1, name: 'First call', content: 'Budget?\n\nTimeline?', questions: ['Budget?', 'Timeline?'] }]);
    assert.deepEqual(s.answered, [['function', 'dd-compose-text', 'First call', ['Budget?', 'Timeline?']]]);
    assert.deepEqual(s.inserted, []);
  });
  test('picking a text puts it into the note at once, as before; a template with an empty list of questions is a text', async () => {
    const list = [{ id: 1, name: 'Plain', content: 'Budget:', questions: null }, { id: 2, name: 'Odd', content: 'Text', questions: [] }];
    assert.deepEqual((await pick(list, 0)).inserted, [['dd-compose-text', 'Budget:']]);
    const odd = await pick(list, 1);
    assert.deepEqual([odd.inserted, odd.answered], [[['dd-compose-text', 'Text']], []]);
  });
  test('the list tells the two apart by their sign', async () => {
    const s = await pick([{ id: 1, name: 'First call', content: 'x', questions: ['Budget?'] }, { id: 2, name: 'Plain', content: 'y', questions: null }]);
    assert.deepEqual(s.menus[0].slice(0, 2).map(i => [i.label, i.icon]), [['First call', 'list'], ['Plain', 'file-text']]);
    assert.ok(html.includes('<symbol id="i-list"'), 'the icon exists');
  });

  test('the window: named after the template, a line that says what to do, the rows, Cancel and "Insert into note"', () => {
    assert.match(answer, /const id = 'ntpl-' \+ uid\(\), qs = ntplQuestions\(tpl\.questions\);/);
    assert.match(answer, /const m = ui\.modal\(\{ title: tpl\.name, size: 'lg',/);
    assert.match(read('public/js/core.js'), /<h2 class="modal-title" id="\$\{id\}">\$\{esc\(title\)\}<\/h2>/, 'a window escapes its title, so a template\'s name cannot inject markup');
    assert.match(answer, /<p class="help">\$\{esc\(t\('ntpl_a_hint'\)\)\}<\/p>\$\{ntplAnswerRowsHtml\(id, qs\)\}/);
    assert.match(answer, /footer: `<button class="btn btn-secondary" data-close>\$\{esc\(t\('btn_cancel'\)\)\}<\/button><button class="btn btn-primary" data-ntpl-put>\$\{esc\(t\('ntpl_a_insert'\)\)\}<\/button>`/);
    assert.deepEqual([dict.en.ntpl_a_insert, dict.de.ntpl_a_insert, dict.en.ntpl_a_ph, dict.de.ntpl_a_ph], ['Insert into note', 'In Notiz einfügen', 'Answer', 'Antwort']);
    assert.ok(dict.en.ntpl_a_hint.includes('left empty is not put into the note') && dict.de.ntpl_a_hint.includes('ohne Antwort kommt nicht in die Notiz'));
  });
  test('"Insert into note": the answered questions go into the field as it is at that moment, then the window is gone', () => {
    assert.match(answer, /const text = ntplAnswered\(qs, read\(\)\);/);
    assert.match(answer, /const to = field\(\);\s*if \(!to \|\| to\.disabled\) \{ fail\(t\('ntpl_a_err_gone'\)\); return; \}[^\n]*\n\s*m\.close\(\);[^\n]*\n\s*ntplInsert\(to, text\);/);
    assert.match(answer, /function read\(\) \{ return boxes\(\)\.map\(b => b\.value\); \}/);
    assert.match(answer, /on\(m\.el, 'click', '\[data-ntpl-put\]', \(\) => put\(\)\);/);
  });
  test('nothing answered is said in the window and nothing is put into the note; a note that is gone keeps the answers in the window', () => {
    assert.match(answer, /if \(!text\) \{ fail\(t\('ntpl_a_err_none'\)\); const first = boxes\(\)\[0\]; if \(first\) first\.focus\(\); return; \}/);
    assert.ok(answer.indexOf("if (!text)") < answer.indexOf('const to = field();') && answer.indexOf('const to = field();') < answer.indexOf('m.close();'), 'both are checked before the window closes');
    assert.equal(dict.en.ntpl_a_err_none, 'Answer at least one question.');
    assert.ok(dict.en.ntpl_a_err_gone.includes('Copy the answers') && dict.de.ntpl_a_err_gone.includes('kopieren'));
  });
  test('Enter is a new line in an answer; with Ctrl or ⌘ it inserts; typing takes the error line away', () => {
    assert.match(answer, /on\(m\.el, 'keydown', '\[data-ntpl-a\]', e => \{ if \(e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\) && !e\.isComposing\) \{ e\.preventDefault\(\); put\(\); \} \}\);/);
    assert.match(answer, /on\(m\.el, 'input', '\[data-ntpl-a\]', \(e, b\) => \{ m\.el\.querySelector\(`#\$\{id\}-err`\)\.hidden = true; if \(typeof dvAutoGrow === 'function'\) dvAutoGrow\(b\); \}\);/);
    assert.match(dv, /^function dvAutoGrow\(el\) \{/m);
  });
  test('closing it with an answer typed asks first, as a note does; with none it just closes', () => {
    assert.match(answer, /beforeClose: \(\) => !read\(\)\.some\(a => a\.trim\(\)\) \|\| typeof dvConfirmUnsaved !== 'function' \|\| dvConfirmUnsaved\(\) \}\);/);
  });
  test('the answers go nowhere but the note: the window asks no server, and the note is saved by its own view', () => {
    assert.doesNotMatch(answer, /api\./);
    assert.deepEqual([...new Set([...js.matchAll(/['`](\/api\/[a-z-]+)/g)].map(m => m[1]))], ['/api/note-templates']);
  });
  test('the form that sets a questionnaire up says what picking it does', () => {
    assert.ok(dict.en.ntpl_q_hint.includes('each question is shown with a box for its answer'));
    assert.ok(dict.de.ntpl_q_hint.includes('erscheint jede Frage mit einem Feld für die Antwort'));
  });
  test('the look: the question reads as text, over a low box', () => {
    assert.match(css, /^\.ntpl-a \.label \{ color: var\(--text\); font-size: var\(--fs-md\); \}$/m);
    assert.match(css, /^\.ntpl-a \.textarea \{ min-height: 58px; \}$/m);
    assert.ok(css.indexOf('.ntpl-a .textarea') > css.indexOf('.textarea { height: auto; min-height: 84px;'), 'after the box\'s own rule, and heavier');
  });
});
