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
const F = loadFns('public/js/note-templates.js', ['ntplButtonHtml', 'ntplInserted', 'ntplInsert', 'ntplListHtml', 'ntplErrorText'], {
  extra: `${BASE} ${js.match(/^const NTPL_ERRORS = \{[^\n]*\};$/m)[0]}` });

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
    const seen = { menus: [], inserted: [], forms: 0, manage: 0 };
    const M = loadFns('public/js/note-templates.js', ['ntplMenu'], {
      extra: `${BASE}
        const __seen = { menus: [], inserted: [], forms: 0, manage: 0 }; let __list = [], __onPage = true;
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
    assert.match(form, /const body = \{ name: now\.name, content: now\.text \};/, 'the text goes as typed: plain text');
  });
  test('an empty name or text is said in the form before the server is asked; a refusal shows the server\'s reason in words', () => {
    assert.match(form, /if \(!now\.name\) \{ fail\(t\('ntpl_err_name'\)\); el\('name'\)\.focus\(\); return; \}\s*if \(!now\.text\.trim\(\)\) \{ fail\(t\('ntpl_err_content'\)\); el\('text'\)\.focus\(\); return; \}/);
    assert.match(form, /if \(!res \|\| res\.error \|\| !res\.template\) \{ fail\(ntplErrorText\(res\)\);/);
  });
  test('closing it with something typed and not saved asks, as a note does; a save closes without the question', () => {
    assert.match(form, /beforeClose: \(\) => \{ const now = read\(\); return \(now\.name === start\.name && now\.text === start\.text\) \|\| typeof dvConfirmUnsaved !== 'function' \|\| dvConfirmUnsaved\(\); \}/);
    assert.match(form, /m\.close\(\);[^\n]*\n\s*ui\.toast\(t\('ntpl_saved'\)\);\s*if \(onDone\) onDone\(res\.template\);/);
    assert.match(dv, /^function dvConfirmUnsaved\(\)/m);
  });
});

describe('words and codes', () => {
  test('every refusal the route names has its sentence, in both languages', () => {
    const codes = [...route.matchAll(/^\s{2}(\w+):\s+\[\d{3},/gm)].map(m => m[1]);
    assert.deepEqual(codes, ['name', 'content', 'name_taken', 'limit', 'not_found']);
    for (const c of codes) assert.notEqual(F.ntplErrorText({ code: c }), dict.en.ntpl_err_generic, c);
    assert.equal(F.ntplErrorText({ code: 'whatever' }), dict.en.ntpl_err_generic);
    assert.equal(F.ntplErrorText(null), dict.en.ntpl_err_generic);
  });
  test('every sentence exists in both languages and is used; the German ones address nobody', () => {
    const keys = Object.keys(dict.en).filter(k => k.startsWith('ntpl_'));
    assert.equal(keys.length, 25);
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
