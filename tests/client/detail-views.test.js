// CLIENT (static + sandboxed) tests for Part 16: the pop windows and side
// panels rebuilt to the reference's own detail/form layouts
// (reference/pro/src/screens/deal-detail.js, contacts.js detail + form,
// tasks.js drawer + form, Forms.*). The old static #deal-modal / #task-modal /
// #detail-modal / #object-detail-modal blocks are gone; public/js/detail-views.js
// renders them through the ui.modal / ui.drawer primitives, and every other
// static modal uses the reference chrome (.modal-head/.modal-title, iconbtn
// close, .field/.label/.input, .modal-foot). Verified statically — repo rule.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const dv = read('public/js/detail-views.js');
const modals = read('public/js/modals.js');
const tasks = read('public/js/tasks.js');
const objects = read('public/js/objects.js');
const deals = read('public/js/deals.js');
const calendar = read('public/js/calendar.js');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const css = read('public/style.css');
const count = (src, needle) => src.split(needle).length - 1;

describe('files parse', () => {
  test('node --check on every touched script', () => {
    for (const f of ['public/js/detail-views.js', 'public/js/modals.js', 'public/js/tasks.js', 'public/js/objects.js', 'public/js/deals.js', 'public/js/calendar.js', 'public/js/core.js', 'public/js/auth.js'])
      execFileSync('node', ['--check', path.join(ROOT, f)]);
  });
});

describe('index.html: the static deal/task/detail modals are gone, detail-views.js is loaded last', () => {
  test('no #deal-modal, #task-modal, #detail-modal, #object-detail-modal markup remains', () => {
    for (const id of ['deal-modal', 'task-modal', 'detail-modal', 'object-detail-modal']) assert.equal(count(html, `id="${id}"`), 0, id);
    assert.equal(count(html, 'deal-modal-columns'), 0);
    assert.equal(count(html, 'id="task-form"'), 0);
    assert.equal(count(html, 'note-editor'), 0);
  });
  test('detail-views.js is the last script, after admin-import.js', () => {
    const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    assert.equal(scripts.at(-1), 'js/detail-views.js');
    assert.equal(scripts.at(-2), 'js/admin-import.js');
  });
  test('the contact side panel keeps its iconbtn close and widens to fit the reference detail', () => {
    const panel = html.slice(html.indexOf('id="contact-side-panel"'), html.indexOf('<!-- ── Team Chat ── -->'));
    assert.match(panel, /<button class="iconbtn" onclick="closeSidePanel\(\)" aria-label="Close"><svg class="ic" aria-hidden="true"><use href="#i-x"\/><\/svg><\/button>/);
    assert.match(css, /\.contact-side-panel \{[^}]*width: 46%; min-width: 520px/);
  });
});

describe('index.html: every remaining static modal uses the reference chrome', () => {
  const blocks = [...html.matchAll(/<div id="([\w-]+)" class="modal-overlay hidden">/g)].map(m => m[1]);
  test('there are still static modals to sweep', () => { assert.ok(blocks.length >= 15, String(blocks.length)); });
  test('no old chrome classes or bare × characters anywhere in the page', () => {
    for (const cls of ['modal-header', 'close-btn', 'modal-actions', 'modal-footer', 'form-group', 'modal-wide', 'modal-sm', 'form-grid-2', 'form-stack']) assert.equal(count(html, `"${cls}`) + count(html, ` ${cls}"`) + count(html, ` ${cls} `), 0, cls);
    assert.equal(count(html, '&times;'), 0);
  });
  test('each modal has a .modal-head with a .modal-title and an iconbtn close using the sprite x', () => {
    const starts = [...html.matchAll(/<div id="[\w-]+" class="modal-overlay hidden">/g)].map(m => m.index);
    starts.forEach((start, i) => {
      const block = html.slice(start, starts[i + 1] ?? html.length);
      const id = blocks[i];
      assert.match(block, /<div class="modal-head">\s*<h2 class="modal-title"/, id);
      assert.match(block, /<button class="iconbtn" onclick="[^"]+" aria-label="Close"><svg class="ic" aria-hidden="true"><use href="#i-x"\/><\/svg><\/button>/, id);
    });
  });
  test('form fields use .field/.label and the control classes; footers are .modal-foot with a secondary Cancel', () => {
    assert.ok(count(html, '<div class="field">') >= 25, String(count(html, '<div class="field">')));
    assert.ok(count(html, 'class="label"') >= 25);
    assert.equal(count(html, '<div class="modal-foot">'), count(html, 'class="modal-overlay hidden"'), 'one footer per form modal (import has two steps, add-workspace none, balancing out)');
    assert.ok(count(html, 'class="btn btn-secondary"') >= 14);
    assert.equal(count(html, '<button type="button" class="btn" onclick'), 0);
    assert.equal(count(html, '<button class="btn" onclick'), 0);
  });
  test('every sprite reference inside the modals resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    const tail = html.slice(html.indexOf('id="join-workspace-modal"'));
    for (const m of tail.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
    assert.equal(count(tail.slice(0, tail.indexOf('id="guide-overlay"')), '<svg class="ic" viewBox'), 0, 'no inline SVG paths left in the modals');
  });
});

describe('detail-views.js: the reference deal detail in a pop window', () => {
  const d = sliceFn(dv, 'openDealDetail', 'detail-views.js');
  test('opens through ui.modal at the xl size and lays out top / head / split main+side like the reference shell', () => {
    assert.match(d, /ui\.modal\(\{ title: 'Deal', size: 'xl'/);
    assert.match(d, /class="card dd-head"/); assert.match(d, /class="split split-2-1"/); assert.match(d, /class="card dd-main"/); assert.match(d, /class="dd-side"/);
  });
  test('head card: clickable stage stepper and the five KPI cells', () => {
    assert.match(d, /class="stepper dd-stepper" role="group" aria-label="Deal stage"/);
    assert.match(d, /class="step \$\{i === cur \? 'current' : i < cur \? 'done' : ''\}" data-act="stage"/);
    assert.match(d, /class="dd-kpis"/);
    for (const k of ["'Deal value'", "'Stage'", "'Urgency'", "'Owner'", "'Last activity'"]) assert.match(d, new RegExp(`k\\(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
  test('inline editing: title and value through dd-ie buttons, urgency/pipeline/owner/stage through ui.select', () => {
    assert.match(d, /class="dd-ie dd-ie-title" data-ie="title"/);
    assert.match(d, /ie\('value'/); assert.match(d, /ie\('urgency'/); assert.match(d, /ie\('pipeline'/);
    assert.ok(count(d, 'ui.select(') >= 5);
    assert.match(d, /dvInlineEdit\(btn/);
  });
  test('talks to the real routes: stage PATCH, urgency PATCH, full PUT, activities POST/PATCH/DELETE, tasks, linked listings', () => {
    assert.match(d, /api\.patch\(`\/api\/deals\/\$\{S\.d\.id\}\/stage`, \{ stage_id: s\.id \}\)/);
    assert.match(d, /api\.patch\(`\/api\/deals\/\$\{S\.d\.id\}\/urgency`, \{ urgency: v \}\)/);
    assert.match(d, /api\.put\(`\/api\/deals\/\$\{S\.d\.id\}`, payload\(patch\)\)/);
    assert.match(d, /api\.post\('\/api\/activities', \{ contact_id: c\.id, deal_id: S\.d\.id, type: S\.type/);
    assert.match(d, /api\.patch\(`\/api\/activities\/\$\{\+el\.dataset\.id\}`/); assert.match(d, /api\.del\(`\/api\/activities\/\$\{aid\}`\)/);
    assert.match(d, /api\.post\('\/api\/tasks', \{ title, status: dvFirstKey\(\)/); assert.match(d, /api\.patch\(`\/api\/tasks\/\$\{x\.id\}\/status`/);
    assert.match(d, /api\.post\(`\/api\/deals\/\$\{S\.d\.id\}\/objects`, \{ object_id: v \}\)/); assert.match(d, /api\.del\(`\/api\/deals\/\$\{S\.d\.id\}\/objects\/\$\{\+el\.dataset\.id\}`\)/);
  });
  test('tabs Overview / Activity / Tasks with the reference compose, filter chip, timeline and task list (no Files tab: no backend)', () => {
    assert.match(d, /role="tablist" aria-label="Deal sections"/);
    assert.match(d, /\['overview', 'Overview', null\], \['activity', 'Activity', S\.acts\.length\], \['tasks', 'Tasks', openTasks\]/);
    assert.doesNotMatch(d, /'files'/);
    assert.match(d, /class="dd-compose" id="dd-compose"/); assert.match(d, /class="seg" role="group" aria-label="Activity type"/);
    assert.match(d, /class="chip \$\{S\.filter \? 'on' : ''\}" data-act="tlfilter"/);
    assert.match(d, /class="timeline">\$\{list\.map\(tlItem\)/); assert.match(d, /class="tl-item" data-aid/); assert.match(d, /class="tl-ic \$\{a\.type\}"/);
    assert.match(d, /class="list dd-tasks" aria-label="Tasks linked to this deal"/); assert.match(d, /class="dd-task \$\{done \? 'done' : ''\}"/);
    assert.match(d, /class="dd-taskform" id="dd-taskform"/);
  });
  test('side column: Details kv card with Edit all, Contact and Supplier person cards, Listings card with Add / unlink', () => {
    assert.match(d, /aria-label="Details"><div class="card-header"><h2 class="card-title">Details<\/h2><button class="btn btn-ghost btn-sm" data-act="edit-full">/);
    assert.match(d, /<dl class="kv"/);
    assert.match(d, /class="dd-person">\$\{avatar\(c\.name, 'lg'\)\}/); assert.match(d, /class="dd-lines"/);
    assert.match(d, /personCard\(\{ title: 'Contact'/); assert.match(d, /personCard\(\{ title: dvSupplierWord\(\)/);
    assert.match(d, /data-act="object-add"/); assert.match(d, /data-act="object-rm"/); assert.match(d, /class="dd-lst"/);
  });
  test('top: editable title, meta pills, Call / Email / WhatsApp quick actions and a More menu with Edit / Duplicate / Delete', () => {
    assert.match(d, /class="page-title dd-h1"/); assert.match(d, /class="dd-meta"/); assert.match(d, /class="stage-pill"><i style="background:\$\{esc\(st\.color\)\}"/);
    for (const t of ['call', 'email', 'whatsapp']) assert.match(d, new RegExp(`data-act="qa" data-type="${t}"`));
    assert.match(d, /\{ label: 'Edit deal', icon: 'pencil'/); assert.match(d, /\{ label: 'Duplicate', icon: 'copy'/); assert.match(d, /\{ label: 'Delete deal', icon: 'trash', danger: true/);
    assert.match(d, /ui\.confirm\(\{ title: 'Delete this deal\?'/);
  });
});

describe('detail-views.js: the reference deal form (create / edit all)', () => {
  const f = sliceFn(dv, 'openDealForm', 'detail-views.js');
  test('ui.modal with the dd-form: Title, Contact + Supplier, Pipeline + Stage, Value (EUR affix) + Urgency, Owner, custom deal fields', () => {
    assert.match(f, /form\.className = 'dd-form'/);
    assert.match(f, /ui\.modal\(\{ title: editing \? 'Edit deal' : 'New deal', size: 'md', body: form/);
    assert.ok(count(f, '<div class="field-row">') >= 4);
    assert.match(f, /class="input-affix dd-affix">.*<span class="affix">EUR<\/span>/);
    assert.match(f, /dealFields\.map\(customField\)/);
    assert.match(f, /class="btn btn-secondary" type="button" data-close/);
  });
  test('validates title/value inline, saves through POST or PUT /api/deals and presets pipeline + stage from the board column', () => {
    assert.match(f, /errs\[`\$\{fid\}-title`\] = 'Enter a deal title\.'/);
    assert.match(f, /editing \? await api\.put\(`\/api\/deals\/\$\{editing\.id\}`, payload\) : await api\.post\('\/api\/deals', payload\)/);
    assert.match(f, /pipeline_id: opts\.pipelineId \|\| currentPipelineId/); assert.match(f, /stage_id: opts\.stageId \|\| null/);
  });
  test('deals.js: the board column + opens the form with the pipeline and stage preset', () => {
    assert.match(sliceFn(deals, 'addDealInStage', 'deals.js'), /openDealForm\(\{ pipelineId: currentPipelineId, stageId \}\)/);
    assert.doesNotMatch(deals, /populateDealStages/);
  });
});

describe('detail-views.js: the reference contact detail in the side panel (or a pop window off the Contacts page)', () => {
  const c = sliceFn(dv, 'openContactDetail', 'detail-views.js');
  test('header: xl avatar, name, meta line, Call / Email / WhatsApp / Edit / More', () => {
    assert.match(c, /class="page-header ct-head"><div class="ct-id">\$\{avatar\(S\.c\.name, 'xl'\)\}/);
    assert.match(c, /class="ct-meta"/);
    assert.match(c, /\$\{icon\('phone'\)\}Call/); assert.match(c, /\$\{icon\('mail'\)\}Email/); assert.match(c, /\$\{icon\('message-circle'\)\}WhatsApp/);
    assert.match(c, /data-act="edit-all">\$\{icon\('pencil'\)\}Edit/); assert.match(c, /data-act="more" aria-label="More actions"/);
  });
  test('tabs Overview / Activity / Deals / Tasks on a card, with the side cards (Details kv, Deals total)', () => {
    assert.match(c, /tabLbl = \{ overview: 'Overview', activity: 'Activity', deals: 'Deals', tasks: 'Tasks' \}/);
    assert.match(c, /class="split split-2-1 ct-split"/); assert.match(c, /class="ct-side"/);
    assert.match(c, /class="ct-big">\$\{fmtEUR\(sumVal\(ds\)\)\}/); assert.match(c, /class="ct-mini"/);
  });
  test('overview: inline-edit grid (ct-fgrid / ct-edit) for name, company, email, phone, custom fields and the owner menu (no stage — Part 19)', () => {
    assert.match(c, /<dl class="ct-fgrid">\$\{editable\('name', 'Full name'\)\}\$\{editable\('company', 'Company'\)\}\$\{editable\('email', 'Email'\)\}\$\{editable\('phone', 'Phone'\)\}\$\{fields\.map/);
    assert.match(c, /class="ct-edit" data-edit="\$\{esc\(key\)\}"/); assert.match(c, /data-edit="owner"/);
    assert.doesNotMatch(c, /data-edit="stage"/);
    assert.match(c, /api\.put\(`\/api\/contacts\/\$\{id\}`, payload\(patch\)\)/);
  });
  test('activity tab: seg compose posting to /api/activities, a type filter select, the timeline', () => {
    assert.match(c, /class="ct-compose" id="ct-compose"/); assert.match(c, /data-atype="\$\{x\.id\}"/);
    assert.match(c, /api\.post\('\/api\/activities', \{ contact_id: id, type: d\.type/);
    assert.match(c, /id="ct-afilter"/); assert.match(c, /class="timeline">\$\{list\.map\(actItem\)/);
  });
  test('deals and tasks tabs: table + Add deal (opens the deal form for this contact), list + Add task (opens the task form)', () => {
    assert.match(c, /<table class="table"><thead><tr><th>Deal<\/th><th>Stage<\/th><th class="num-col">Value<\/th><th>Owner<\/th>/);
    assert.match(c, /'add-deal': \(\) => openDealForm\(\{ contactId: id/); assert.match(c, /'add-task': \(\) => openTaskForm\(\{ contactId: id, contactName: S\.c\.name/);
    assert.match(c, /class="check round"><input type="checkbox" data-task-toggle/);
  });
  test('renders into #side-panel-body on the Contacts/Suppliers page, else into an xl ui.modal; row highlight kept', () => {
    assert.match(c, /activePage === 'contacts' \|\| activePage === 'suppliers'/);
    assert.match(c, /document\.getElementById\('side-panel-body'\)/); assert.match(c, /classList\.add\('side-panel-active'\)/);
    assert.match(c, /ui\.modal\(\{ title: sup \? dvSupplierWord\(\) : 'Contact', size: 'xl'/);
  });
  test('a deal is clickable across the whole row, in the Deals tab and in the side card (Part 20)', () => {
    assert.match(c, /<tr class="clickable" data-act="open-deal" data-id="\$\{d\.id\}">/, 'the Deals tab row');
    assert.match(c, /<div class="ct-mini clickable" data-act="open-deal" data-id="\$\{d\.id\}">/, 'the side card row, not just its title link');
    assert.match(c, /'open-deal': el => \{ close\(\); openDealDetail\(\+el\.dataset\.id\); \}/);
  });
  test('a note can be edited in place: click or double-click the text, or use the pencil (Part 20)', () => {
    assert.match(c, /data-note="\$\{a\.id\}"/, 'the note text itself is the edit target');
    assert.match(c, /title="\$\{esc\(t\('click_to_edit'\)\)\}"/);
    assert.match(c, /data-act="act-edit" data-id="\$\{a\.id\}"/, 'and a visible pencil affordance');
    // both gestures enter edit mode, and the editor saves on Enter / cancels on Escape
    assert.match(c, /on\(host, 'click', '\[data-note\]'/);
    assert.match(c, /on\(host, 'dblclick', '\[data-note\]'/);
    assert.match(c, /id="ct-aedit"/);
    assert.match(c, /api\.patch\(`\/api\/activities\/\$\{S\.editAct\}`, \{ content:/);
    assert.match(c, /'act-save'/); assert.match(c, /'act-cancel'/);
    assert.match(c, /e\.key === 'Escape'/);
  });
  test('the deal detail timeline edits notes the same way: click or double-click the text, next to its Edit button (Part 21)', () => {
    const d2 = sliceFn(dv, 'openDealDetail', 'detail-views.js');
    assert.match(d2, /data-note="\$\{a\.id\}"/);
    assert.match(d2, /on\(root, 'click', '\[data-note\]'/);
    assert.match(d2, /on\(root, 'dblclick', '\[data-note\]'/);
  });
  test('the note editor grows to fit the whole note in both views, and keeps that height across re-renders (Part 21)', () => {
    const g = sliceFn(dv, 'dvAutoGrow', 'detail-views.js');
    assert.match(g, /scrollHeight/, 'height follows the content');
    assert.match(g, /style\.height = 'auto'/, 'reset first so it can shrink again, not only grow');
    // applied on open, on every keystroke, and after a re-render in both the deal and contact views
    const d2 = sliceFn(dv, 'openDealDetail', 'detail-views.js');
    assert.match(d2, /dvAutoGrow\(R\('#dd-act-edit'\)\)/);
    assert.match(c, /dvAutoGrow\(host\.querySelector\('#ct-aedit'\)\)/);
    assert.equal((dv.match(/dvAutoGrow\(/g) || []).length >= 5, true, 'wired in both views: open, input and render');
    // the growing field owns its height, so no inner scrollbar and no manual resize fighting it
    assert.match(css, /^\.dv-grow \{[^}]*resize: none;[^}]*overflow: hidden;/m);
    for (const id of ['dd-act-edit', 'ct-aedit']) assert.match(dv, new RegExp(`class="textarea dv-grow" id="${id}"`), id);
  });
  test('More menu: copy email / phone, delete through ui.confirm', () => {
    assert.match(c, /\{ label: 'Copy email', icon: 'copy'/); assert.match(c, /\{ label: 'Copy phone', icon: 'copy'/);
    assert.match(c, /ui\.confirm\(\{ title: `Delete this \$\{one\}\?`/);
  });
});

describe('detail-views.js: the reference task drawer and task form', () => {
  const dr = sliceFn(dv, 'openTaskDrawer', 'detail-views.js');
  const tf = sliceFn(dv, 'openTaskForm', 'detail-views.js');
  test('drawer: ui.drawer 580 wide, big done toggle, auto-growing title, kv props that save on change, subtasks', () => {
    assert.match(dr, /ui\.drawer\(\{ title: 'Task details', width: 580/);
    assert.match(dr, /class="tk-dr"/); assert.match(dr, /class="tk-done big \$\{fin\(\) \? 'on' : ''\}" data-dtoggle/);
    assert.match(dr, /<textarea class="tk-dr-title"/); assert.match(dr, /<dl class="kv tk-props">/);
    for (const f of ['status', 'priority', 'assigned_to', 'due_date', 'project_id', 'list_id', 'deal_id', 'contact_id', 'description']) assert.match(dr, new RegExp(`data-f="${f}"`), f);
    assert.match(dr, /api\.put\(`\/api\/tasks\/\$\{id\}`, payload\(\)\)/);
    assert.match(dr, /api\.patch\(`\/api\/tasks\/\$\{id\}\/status`, \{ status: next \}\)/);
    assert.match(dr, /class="tk-secH"><b>Subtasks<\/b>/); assert.match(dr, /class="tk-si"/); assert.match(dr, /api\.post\('\/api\/tasks', \{ title: v, parent_id: id/);
    assert.match(dr, /class="btn btn-danger-ghost" data-del/); assert.match(dr, /ui\.confirm\(\{ title: 'Delete this task\?'/);
  });
  test('form: ui.modal with .field-row pairs for project/list, status/priority, due/assignee, deal/contact, plus custom task fields', () => {
    assert.match(tf, /ui\.modal\(\{ title: 'New task', size: 'md'/);
    assert.ok(count(tf, '<div class="field-row">') >= 4);
    assert.match(tf, /api\.post\('\/api\/tasks', payload\)/);
    assert.match(tf, /taskFields\.map\(cf\)/);
  });
  test('the old openers now route to the new views', () => {
    assert.match(sliceFn(dv, 'openDealModal', 'detail-views.js'), /id \? openDealDetail\(id\) : openDealForm\(\)/);
    assert.match(sliceFn(dv, 'openDetail', 'detail-views.js'), /openContactDetail\(id\)/);
    assert.match(sliceFn(dv, 'openTaskModal', 'detail-views.js'), /id \? openTaskDrawer\(id\) : openTaskForm\(/);
    assert.match(sliceFn(dv, 'openDealModalForContact', 'detail-views.js'), /openDealForm\(\{ contactId \}\)/);
    assert.match(sliceFn(dv, 'openTaskModalForContact', 'detail-views.js'), /openTaskForm\(\{ contactId \}\)/);
    assert.match(sliceFn(dv, 'addTaskFromDeal', 'detail-views.js'), /openTaskForm\(\{ dealId \}\)/);
  });
  test('no native confirm/alert, no emoji, no inline SVG paths in detail-views.js', () => {
    assert.doesNotMatch(dv, /[^.\w]confirm\(|alert\(/); assert.doesNotMatch(dv, /[\u{1F300}-\u{1FAFF}☀-➿]/u); assert.doesNotMatch(dv, /<svg viewBox|<path d=/);
  });
});

describe('detail-views.js: pure helpers in a sandbox', () => {
  // dvDue now converts through the zone helpers and takes "now" from the picked clock;
  // identity stubs keep this fixture on the browser's clock, which is what d(n) builds from.
  const F = loadFns('public/js/detail-views.js', ['dvDue', 'dvActText', 'dvDigits'], {
    extra: "function toViewerClock(d, t) { return { date: String(d || '').slice(0, 10), time: t || null }; } function nowInTimezone() { return new Date(); } function currentTimezone() { return 'UTC'; }" });
  test('dvDue phrases a due date relative to today', () => {
    // Builds the date from local Y/M/D, like a real <input type="date"> due-date picker would — not
    // toISOString(), whose UTC calendar date can fall a day either side of "today" near local midnight.
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    assert.equal(F.dvDue(null), 'No due date');
    assert.equal(F.dvDue(d(0)), 'Due today'); assert.equal(F.dvDue(d(1)), 'Due tomorrow'); assert.equal(F.dvDue(d(5)), 'In 5 days');
    assert.equal(F.dvDue(d(-1)), '1 day overdue'); assert.equal(F.dvDue(d(-3)), '3 days overdue');
  });
  test('dvActText turns a stored rich note into editable plain text; dvDigits keeps a dialable number', () => {
    assert.equal(F.dvActText('<p>Hello</p><br>world'), 'Hello\n\nworld');
    assert.equal(F.dvDigits('+49 (0) 151 / 23'), '+49015123');
  });
});

describe('the superseded modal code is removed, the kept code uses the new primitives', () => {
  test('modals.js keeps the contact form + activity modal helpers and drops the deal modal, side-panel builder and old timeline', () => {
    for (const fn of ['openContactModal', 'renderFieldInput', 'saveContact', 'deleteContact', 'closeSidePanel', 'renderDealFieldInput', 'openActivityModal', 'saveActivity']) sliceFn(modals, fn, 'modals.js');
    for (const fn of ['openDealModal', 'buildDetailHTML', 'openDetail', 'renderTimelineItem', 'saveDeal', 'populateDealStages', 'renderObjectPanel', 'editContactPanel', 'openDealModalForContact', 'toggleActivityComments', 'addTaskFromDeal']) assert.equal(count(modals, `function ${fn}(`), 0, fn);
    assert.match(sliceFn(modals, 'deleteContact', 'modals.js'), /ui\.confirm\(/);
    assert.doesNotMatch(modals, /[^.\w]confirm\(/);
    assert.match(sliceFn(modals, 'openContactModal', 'modals.js'), /<div class="field"><label class="label" for="cfield-\$\{f\.field_key\}">/);
  });
  test('tasks.js drops the task modal, link picker, subtask-modal and attachment code', () => {
    for (const fn of ['openTaskModal', 'saveTask', 'deleteTaskFromModal', 'renderTaskLinks', 'toggleTaskLinkPicker', 'renderSubtasksList', 'loadTaskAttachments', 'uploadAttachments', 'openLinkedTaskObject', 'openTaskModalForContact']) assert.equal(count(tasks, `function ${fn}(`), 0, fn);
    assert.equal(count(tasks, 'currentTaskId'), 0); assert.equal(count(tasks, 'task-drop-zone'), 0);
    assert.equal(count(auth, 'taskLinkOptionsCache'), 0);
    assert.match(sliceFn(tasks, 'deleteTasks', 'tasks.js'), /ui\.confirm\(/);   // Part 40: deleteTask delegates to the plural
  });
  test('objects.js: the listing detail is a ui.modal with kv details, person/deal lists and link menus; the search dropdowns are gone', () => {
    const o = sliceFn(objects, 'openObjectDetail', 'objects.js');
    assert.match(o, /ui\.modal\(\{ title: obj\.name, size: 'lg'/);
    assert.match(o, /<dl class="kv"/); assert.match(o, /class="list-item"/); assert.match(o, /class="person"/);
    assert.match(o, /ui\.select\(/); assert.match(o, /class="btn btn-danger-ghost"/);
    for (const fn of ['filterObjectContactSearch', 'selectObjectContactItem', 'filterDealSearch', 'selectDealSearchItem', 'positionDropdown']) assert.equal(count(objects, `function ${fn}(`), 0, fn);
    assert.equal(count(objects, 'deal-search'), 0);
    assert.match(sliceFn(objects, 'deleteObject', 'objects.js'), /ui\.confirm\(/);
    assert.match(sliceFn(objects, 'navigateToDeal', 'objects.js'), /openDealDetail\(dealId\)/);
  });
  test('calendar.js: the day pop window is a ui.modal with the reference legend', () => {
    const c = sliceFn(calendar, 'openDayModal', 'calendar.js');
    assert.match(c, /ui\.modal\(\{ title: dateLabel/); assert.match(c, /class="legend/);
    assert.doesNotMatch(c, /modal-header|close-btn/);
  });
  test('core.js: stacked overlays — only the topmost one answers Escape and traps Tab', () => {
    const u = sliceFn(core, 'uiOverlay', 'core.js');
    assert.match(u, /const isTop = \(\) => \$\$\('\.overlay'\)\.at\(-1\) === ov/);
    assert.match(u, /if \(!isTop\(\)\) return;/);
  });
});

describe('stylesheet: the reference detail/drawer rules exist, the modal-era rules are gone', () => {
  test('new rules', () => {
    for (const s of ['.modal.xl {', '.dd-kpis {', '.dd-ie {', '.dd-stepper .step {', '.dd-compose {', '.dd-tasks {', '.dd-side {', '.dd-person {', '.dd-form {', '.ct-head {', '.ct-fgrid {', '.ct-edit {', '.ct-compose {', '.ct-side {', '.ct-big {', '.tk-dr {', '.tk-dr-title {', '.tk-props {', '.tk-done {', '.tk-si {', '.tk-secH {', '.side-panel-body .ct-split {'])
      assert.ok(css.includes(s), s);
  });
  test('removed rules', () => {
    for (const s of ['.deal-modal-columns', '.deal-timeline-item', '.contact-panel-row', '.object-panel-card', '.task-drop-zone', '.task-link-row', '.modal-header', '.form-group', '.deal-search-dropdown', '.detail-grid', '.close-btn', '.modal-wide', '.modal-sm', '.subtask-item', '.task-attach-item', '.mini-act', '.note-editor', '.fmt-btn', '.task-side-section', '#deal-activity-date'])
      assert.equal(count(css, s), 0, s);
  });
});
