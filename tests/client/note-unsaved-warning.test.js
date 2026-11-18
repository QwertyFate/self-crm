// CLIENT tests: leaving with unsaved note text (NOTE_EDITOR_CHANGES Part 2).
//
// Decided by the user: closing right after typing saves first and closes without a question; the question
// "You have unsaved changes. Are you sure you want to close?" comes only for what cannot be saved — a save that
// fails, an empty note, a new note typed but not logged.
//
// Where it is asked:
//   - the deal window and the contact pop window: the X, a click beside the window, Escape (ui.modal's beforeClose)
//   - the contact side panel: its X, and another contact taking the panel
//   - a second deal opened over the first; the jump from a deal to its contact or object, and from a contact to a deal
//   - the Deals page, which closes the side panel
//   - the browser tab: the browser's own question while something is unsaved, and what is waiting is sent at once
// close() and closeSidePanel() themselves never ask (they also run after a delete).
//
// The pieces are run as the real code cut out of the files, with fakes for what they touch; the wiring is pinned.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFns, sliceFn, sliceConst } = require('../helpers/client-fn');

const dv     = read('public/js/detail-views.js');
const core   = read('public/js/core.js');
const modals = read('public/js/modals.js');
const auth   = read('public/js/auth.js');
const html   = read('public/index.html');
const MS     = Number(dv.match(/^const DV_AUTOSAVE_MS = (\d+);$/m)?.[1]);

// `function name(...) { … }` (or any text starting at `head`) cut out of `src` by matching braces.
function cut(src, head) {
  const i = src.indexOf(head); assert.ok(i >= 0, `"${head}" exists`);
  assert.equal(src.indexOf(head, i + 1), -1, `"${head}" exists once`);
  const open = src.indexOf('{', i + head.length - 1); let depth = 0;
  for (let j = open; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && !--depth) return src.slice(i, j + 1); }
  throw new Error(`unbalanced: ${head}`);
}
const tick = () => new Promise(r => setImmediate(r));
const deal = sliceFn(dv, 'openDealDetail', 'detail-views.js'), contact = sliceFn(dv, 'openContactDetail', 'detail-views.js');

describe('ui.modal: beforeClose', () => {
  const overlay = sliceFn(core, 'uiOverlay', 'core.js');
  // the real askClose, with a window that counts how often it was closed
  function win(beforeClose) {
    const w = { closed: 0, ov: { isConnected: true } };
    w.askClose = new Function('beforeClose', 'ov', 'close', `let asking = false; ${cut(overlay, 'async function askClose()')}; return askClose;`)(beforeClose, w.ov, () => { w.closed++; w.ov.isConnected = false; });
    return w;
  }

  test('it is an option of the window, next to onClose', () => {
    assert.match(core, /^function uiOverlay\(kind, \{ title, body, footer, size = 'md', onClose, beforeClose, width \}\) \{$/m);
  });

  test('a window without it closes at once, as every window did before', () => {
    const w = win(undefined);
    w.askClose();
    assert.equal(w.closed, 1, 'closed before anything was awaited');
  });

  test('true closes the window, false keeps it open', async () => {
    const yes = win(async () => true); await yes.askClose(); assert.equal(yes.closed, 1);
    const no = win(async () => false); await no.askClose(); assert.equal(no.closed, 0);
    const plain = win(() => true); await plain.askClose(); assert.equal(plain.closed, 1, 'an answer that is not a promise works too');
  });

  test('a second attempt while the first is still being answered is ignored', async () => {
    let asked = 0, answer; const w = win(() => { asked++; return new Promise(r => { answer = r; }); });
    const a = w.askClose(), b = w.askClose(), c = w.askClose();
    assert.equal(asked, 1, 'one question, not three');
    answer(true); await Promise.all([a, b, c]);
    assert.equal(w.closed, 1);
  });

  test('after an answer the window can be asked again', async () => {
    let n = 0; const w = win(async () => ++n > 1);
    await w.askClose(); assert.equal(w.closed, 0);
    await w.askClose(); assert.equal(w.closed, 1);
  });

  test('an answer that arrives after the window is gone closes nothing twice', async () => {
    let answer; const w = win(() => new Promise(r => { answer = r; }));
    const a = w.askClose();
    w.ov.isConnected = false;           // closed meanwhile by code (the record was deleted)
    answer(true); await a;
    assert.equal(w.closed, 0);
  });

  test('a question that throws does not lock the window for good', async () => {
    let n = 0; const w = win(async () => { if (!n++) throw new Error('boom'); return true; });
    await assert.rejects(w.askClose());
    await w.askClose(); assert.equal(w.closed, 1);
  });

  test('the X, a click beside the window and Escape ask; close() handed to the caller never does', () => {
    assert.match(overlay, /ov\.addEventListener\('mousedown', e => \{ if \(e\.target === ov\) askClose\(\); \}\);/);
    assert.match(overlay, /on\(ov, 'click', '\[data-close\]', \(\) => askClose\(\)\);/);
    assert.match(overlay, /if \(e\.key === 'Escape' && !openPopover\) \{ e\.stopPropagation\(\); askClose\(\); \}/);
    assert.match(overlay, /return \{ el: ov, body: \$\('\.modal-body', ov\), footer: \$\('\.modal-foot', ov\), close \};/);
    assert.doesNotMatch(cut(overlay, 'function close()'), /beforeClose|askClose/);
  });
});

describe('the question', () => {
  const app = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

  test('the sentence that was asked for, and its buttons, in both languages', () => {
    assert.deepEqual([app.en.note_unsaved_title, app.en.note_unsaved_msg, app.en.note_unsaved_leave, app.en.note_unsaved_stay],
      ['Unsaved changes', 'You have unsaved changes. Are you sure you want to close?', 'Close without saving', 'Keep editing']);
    assert.deepEqual([app.de.note_unsaved_title, app.de.note_unsaved_msg, app.de.note_unsaved_leave, app.de.note_unsaved_stay],
      ['Ungespeicherte Änderungen', 'Es gibt ungespeicherte Änderungen. Wirklich schließen?', 'Ohne Speichern schließen', 'Weiter bearbeiten']);
    for (const k of ['note_unsaved_title', 'note_unsaved_msg', 'note_unsaved_leave', 'note_unsaved_stay']) assert.doesNotMatch(app.de[k], /\b(du|dein|deine|Sie|Ihre?)\b/, `${k} is impersonal`);
  });

  test('one dialog: closing is the marked action, staying the other button', async () => {
    const F = loadFns('public/js/detail-views.js', ['dvConfirmUnsaved'], {
      extra: `const __asked = []; const ui = { confirm: o => { __asked.push(o); return Promise.resolve(true); } }; function t(k) { return k; } function __q() { return __asked; }`, expose: ['__q'] });
    assert.equal(await F.dvConfirmUnsaved(), true);
    assert.deepEqual(F.__q(), [{ title: 'note_unsaved_title', message: 'note_unsaved_msg', confirmLabel: 'note_unsaved_leave', cancelLabel: 'note_unsaved_stay', danger: true }]);
  });
});

// leave() of each view, cut out of its opener and given a view's state.
function view(kind, { saver = null, save = async () => true, confirm = async () => false, text = '', busy = false } = {}) {
  const log = [], fields = {};
  const el = id => (fields[id] = fields[id] || { id, focus() { log.push(`focus ${id}`); } });
  const S = kind === 'deal'
    ? { saver, editBusy: busy, text, tab: 'tasks', filter: 'call' }
    : { saver, editBusy: busy, draft: { text, filter: 'call' }, tab: 'deals' };
  const noteSave = async () => { log.push('save'); return save(S); }, ask = async () => { log.push('ask'); return confirm(); };
  const noteEnd = () => { log.push('end'); S.saver = null; }, render = (...a) => { log.push(`render${a.length ? ' ' + a[0] : ''}`); };
  const present = { dd: ['#dd-compose-text', '#dd-act-edit'], ct: ['#ct-atext', '#ct-aedit'] };
  const leave = kind === 'deal'
    ? new Function('S', 'noteSave', 'dvConfirmUnsaved', 'noteEnd', 'render', 'R', `${cut(deal, 'async function leave()')}; return leave;`)(S, noteSave, ask, noteEnd, render, sel => (present.dd.includes(sel) && (sel !== '#dd-act-edit' || S.saver) ? el(sel) : null))
    : new Function('S', 'saveNoteEdit', 'dvConfirmUnsaved', 'endNoteEdit', 'render', 'host', `${cut(contact, 'async function leave()')}; return leave;`)(S, noteSave, ask, noteEnd, render, { querySelector: sel => (present.ct.includes(sel) && (sel !== '#ct-aedit' || S.saver) ? el(sel) : null) });
  return { S, log, leave, draft: () => (kind === 'deal' ? S.text : S.draft.text), filter: () => (kind === 'deal' ? S.filter : S.draft.filter) };
}

for (const kind of ['deal', 'contact']) {
  const names = kind === 'deal' ? { edit: '#dd-act-edit', box: '#dd-compose-text', all: null, render: 'render main' } : { edit: '#ct-aedit', box: '#ct-atext', all: 'all', render: 'render' };

  describe(`leave(): the ${kind} view`, () => {
    test('nothing open and nothing typed: go, without a question', async () => {
      const v = view(kind);
      assert.equal(await v.leave(), true);
      assert.deepEqual(v.log, []);
    });

    test('a note is open and its save works: saved, then go — no question', async () => {
      const v = view(kind, { saver: {}, save: async S => { S.saver = null; return true; } });
      assert.equal(await v.leave(), true);
      assert.deepEqual(v.log, ['save']);
    });

    test('the note cannot be saved, "Close without saving": the edit is dropped and the view may go', async () => {
      const v = view(kind, { saver: {}, save: async () => false, confirm: async () => true });
      assert.equal(await v.leave(), true);
      assert.deepEqual(v.log, ['save', 'ask', 'end']);
    });

    test('the note cannot be saved, "Keep editing": stay, with the note on screen and in focus', async () => {
      const v = view(kind, { saver: {}, save: async () => false, confirm: async () => false });
      assert.equal(await v.leave(), false);
      assert.deepEqual(v.log, ['save', 'ask', names.render, `focus ${names.edit}`]);
      assert.equal(v.S.tab, 'activity', 'the tab with the timeline');
      assert.equal(v.filter(), names.all, 'the type filter is lifted so it cannot hide the note');
    });

    test('a new note is typed but not logged: the question; "Keep editing" shows the box and keeps the text', async () => {
      const v = view(kind, { text: 'Call again on Friday' });
      assert.equal(await v.leave(), false);
      assert.deepEqual(v.log, ['ask', names.render, `focus ${names.box}`]);
      assert.equal(v.S.tab, 'activity');
      assert.equal(v.draft(), 'Call again on Friday');
      assert.equal(v.filter(), 'call', 'the filter is left alone: the box is always there');
    });

    test('a new note is typed, "Close without saving": the text is dropped and the view may go', async () => {
      const v = view(kind, { text: 'Call again on Friday', confirm: async () => true });
      assert.equal(await v.leave(), true);
      assert.equal(v.draft(), '');
    });

    test('spaces in the box are not a note', async () => {
      const v = view(kind, { text: '  \n ' });
      assert.equal(await v.leave(), true);
      assert.deepEqual(v.log, []);
    });

    test('a saved note and a typed new one: the note is saved first, then one question about the new one', async () => {
      const v = view(kind, { saver: {}, save: async S => { S.saver = null; return true; }, text: 'New one' });
      assert.equal(await v.leave(), false);
      assert.deepEqual(v.log, ['save', 'ask', names.render, `focus ${names.box}`]);
    });

    test('a Save that is under way finishes first', async () => {
      const v = view(kind, { saver: {}, busy: true, save: async S => { S.saver = null; return true; } });
      const p = v.leave();
      await tick(); assert.deepEqual(v.log, [], 'nothing happens while the Save runs');
      v.S.editBusy = false; v.S.saver = null;           // the Save ended the edit
      assert.equal(await p, true);
      assert.deepEqual(v.log, [], 'and nothing is saved twice');
    });
  });
}

describe('the views register what they hold', () => {
  test('the deal window: a guard while it is open, asked by the X / Escape / a click beside it', () => {
    assert.match(deal, /beforeClose: \(\) => leave\(\),/);
    assert.match(deal, /const guard = \{ leave, dirty: \(\) => !!\(S\.saver && S\.saver\.dirty\) \|\| !!S\.text\.trim\(\), flush: \(\) => \{ if \(S\.saver\) S\.saver\.flush\(\); \} \};/);
    assert.match(deal, /const inst = \{ close: \(\) => m\.close\(\), reload, leave \};\s*dvDeal = inst; dvGuards\.add\(guard\); render\(\);/);
    assert.match(deal, /onClose: \(\) => \{ dvGuards\.delete\(guard\); if \(S\.saver\) S\.saver\.done\(\);/, 'closed: the guard goes, and a note still open is sent as far as it can be');
  });

  test('a second deal opened over the first asks the first one', () => {
    assert.match(deal, /^async function openDealDetail\(id, opts = \{\}\) \{\s*(\/\/[^\n]*\n\s*)*if \(dvDeal && !\(await dvDeal\.leave\(\)\)\) return;\s*if \(dvDeal\) dvDeal\.close\(\);/);
  });

  test('the jumps from one record to another ask before they close', () => {
    assert.match(deal, /'open-contact': async el => \{ if \(!\(await leave\(\)\)\) return; m\.close\(\); openContactDetail\(\+el\.dataset\.id\); \},/);
    assert.match(deal, /'open-object': async el => \{ if \(!\(await leave\(\)\)\) return; m\.close\(\); if \(typeof openObjectDetail === 'function'\) openObjectDetail\(\+el\.dataset\.id\); \},/);
    assert.match(contact, /'open-deal': async el => \{ if \(!\(await leave\(\)\)\) return; close\(\); openDealDetail\(\+el\.dataset\.id\); \},/);
  });

  test('deleting the deal or the contact closes without a question', () => {
    assert.match(deal, /S\.gone = true; deals = deals\.filter\(x => x\.id !== S\.d\.id\); dvRefreshDeals\(\); m\.close\(\);/);
    assert.match(contact, /if \(res\?\.error\) return ui\.toast\(res\.error\); close\(\); invalidate\(\);/);
  });

  test('the contact view: a guard in both hosts; the side panel also remembers it', () => {
    assert.match(contact, /modal = ui\.modal\(\{ title: noun, size: 'xl', body: '<div><\/div>', beforeClose: \(\) => leave\(\), onClose: \(\) => \{ end\(\); opts\.onClose && opts\.onClose\(\); \} \}\);/);
    assert.match(contact, /const guard = \{ leave, dirty: \(\) => !!\(S\.saver && S\.saver\.dirty\) \|\| !!S\.draft\.text\.trim\(\), flush: \(\) => \{ if \(S\.saver\) S\.saver\.flush\(\); \} \};/);
    assert.match(contact, /dvGuards\.add\(guard\);\s*if \(!modal\) \{ host\._ctGuard = guard; host\._ctEnd = end; \}/);
  });

  test('another contact asks the view in the panel before anything is loaded, and ends it before taking the panel', () => {
    assert.match(contact, /^async function openContactDetail\(id, opts = \{\}\) \{\s*(\/\/[^\n]*\n\s*)*if \(dvUsesPanel\(opts\) && !\(await dvLeavePanel\(\)\)\) return;\s*await Promise\.all/);
    assert.match(contact, /const usePanel = dvUsesPanel\(opts\);/);
    assert.match(contact, /if \(host\._ctEnd\) host\._ctEnd\(\);[^\n]*\n\s*if \(host\._ctOff\) host\._ctOff\.forEach\(f => f\(\)\); const offs = \[\]; host\._ctOff = offs;/);
  });

  test('a view that lost the panel paints nothing into it', () => {
    assert.match(cut(contact, 'function render()'), /^function render\(\) \{\s*if \(host\._ctOff !== offs\) return;/);
  });

  test('the end of a contact view: its guard goes, and a note still open is sent as far as it can be', () => {
    const calls = [], guard = {}, other = {};
    const mk = (host, S) => new Function('dvGuards', 'guard', 'host', 'S', `${cut(contact, 'function end()')}; return end;`)({ delete: g => calls.push(['delete', g === guard]) }, guard, host, S);
    const host = { _ctGuard: guard, _ctEnd: 'x' }, S = { saver: { done: () => calls.push(['done']) } };
    mk(host, S)();
    assert.deepEqual(calls, [['delete', true], ['done']]);
    assert.deepEqual([host._ctGuard, host._ctEnd, S.saver], [null, null, null]);
    const taken = { _ctGuard: other, _ctEnd: 'theirs' };
    mk(taken, { saver: null })();
    assert.deepEqual([taken._ctGuard, taken._ctEnd], [other, 'theirs'], 'a panel that already belongs to the next view is left alone');
  });
});

describe('the contact side panel', () => {
  // the real helpers with a page that has (or lacks) a panel, a current page and a view in the panel
  function page({ current = 'contacts', panel = true, guard = null, end = null } = {}) {
    const F = loadFns('public/js/detail-views.js', ['dvUsesPanel', 'dvPanelGuard', 'dvLeavePanel', 'dvCloseSidePanel', 'dvPanelClosed'], {
      extra: `const __host = { _ctGuard: null, _ctEnd: null }; let __page = 'contacts', __panel = true, __closed = 0;
        const document = { querySelector: sel => (sel === '.sb-link[aria-current="page"]' ? { dataset: { page: __page } } : null),
          getElementById: id => (id === 'side-panel-body' ? __host : id === 'contact-side-panel' ? (__panel ? {} : null) : null) };
        function closeSidePanel() { __closed++; }
        function __setup(o) { __page = o.current; __panel = o.panel; __host._ctGuard = o.guard; __host._ctEnd = o.end; }
        function __closedTimes() { return __closed; }`,
      expose: ['__setup', '__closedTimes'] });
    F.__setup({ current, panel, guard, end });
    return F;
  }

  test('where the contact view opens: the panel on Contacts and Suppliers, a pop window elsewhere or when asked to', () => {
    assert.equal(page({ current: 'contacts' }).dvUsesPanel(), true);
    assert.equal(page({ current: 'suppliers' }).dvUsesPanel({}), true);
    assert.equal(page({ current: 'activities' }).dvUsesPanel(), false);
    assert.equal(page({ current: 'contacts' }).dvUsesPanel({ modal: true }), false);
    assert.equal(page({ current: 'contacts', panel: false }).dvUsesPanel(), false);
  });

  test('no view in the panel: nothing to ask', async () => {
    const F = page();
    assert.equal(F.dvPanelGuard(), null);
    assert.equal(await F.dvLeavePanel(), true);
  });

  test('the view in the panel answers', async () => {
    assert.equal(await page({ guard: { leave: async () => false } }).dvLeavePanel(), false);
    assert.equal(await page({ guard: { leave: async () => true } }).dvLeavePanel(), true);
  });

  test('the X closes the panel only when the view lets it', async () => {
    const stay = page({ guard: { leave: async () => false } }); await stay.dvCloseSidePanel(); assert.equal(stay.__closedTimes(), 0);
    const go = page({ guard: { leave: async () => true } }); await go.dvCloseSidePanel(); assert.equal(go.__closedTimes(), 1);
    const empty = page(); await empty.dvCloseSidePanel(); assert.equal(empty.__closedTimes(), 1);
  });

  test('the X in index.html is that one; nothing in the page closes the panel past it', () => {
    assert.match(html, /<button class="iconbtn" onclick="dvCloseSidePanel\(\)" aria-label="Close" data-i18n-aria="btn_close">/);
    assert.doesNotMatch(html, /onclick="closeSidePanel\(\)"/);
  });

  test('closeSidePanel() never asks, and tells the view in the panel that it is over', () => {
    const s = sliceFn(modals, 'closeSidePanel', 'modals.js');
    assert.match(s, /if \(typeof dvPanelClosed === 'function'\) dvPanelClosed\(\);/);
    assert.doesNotMatch(s, /leave|confirm|await/);
    let ended = 0; page({ end: () => { ended++; } }).dvPanelClosed(); assert.equal(ended, 1);
    assert.doesNotThrow(() => page().dvPanelClosed(), 'no view in the panel is not an error');
  });

  test('the Deals page closes the panel, so it asks first — before the page changes, and only when a view is there', () => {
    const s = sliceFn(auth, 'switchPage', 'auth.js');
    assert.match(s, /^async function switchPage\(page\) \{\s*(\/\/[^\n]*\n\s*)*const panelView = page === 'deals' && typeof dvPanelGuard === 'function' && dvPanelGuard\(\);\s*if \(panelView && !\(await panelView\.leave\(\)\)\) return;\s*document\.querySelectorAll\('\.sb-link\[data-page\]'\)/);
    assert.match(s, /if \(page === 'deals'\)\s+\{ closeSidePanel\(\); await loadDeals\(\); \}/);
  });
});

describe('closing or reloading the browser tab', () => {
  const F = () => loadFns('public/js/detail-views.js', ['dvBeforeUnload'], {
    extra: `const dvGuards = new Set(); function __add(g) { dvGuards.add(g); }`, expose: ['__add'] });
  const event = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const guard = dirty => ({ flushed: 0, dirty: () => dirty, flush() { this.flushed++; } });

  test('the listener is on the window', () => {
    assert.match(dv, /^window\.addEventListener\('beforeunload', dvBeforeUnload\);$/m);
  });

  test('nothing open, or everything saved: the tab closes without a question and nothing is sent', () => {
    const f = F(), e = event(), g = guard(false);
    f.dvBeforeUnload(e); assert.equal(e.prevented, false);
    f.__add(g); f.dvBeforeUnload(e);
    assert.equal(e.prevented, false); assert.ok(!('returnValue' in e)); assert.equal(g.flushed, 0);
  });

  test('something unsaved: the browser is told to ask, and every open view sends what is waiting', () => {
    const f = F(), e = event(), clean = guard(false), dirty = guard(true);
    f.__add(clean); f.__add(dirty); f.dvBeforeUnload(e);
    assert.equal(e.prevented, true); assert.equal(e.returnValue, '');
    assert.deepEqual([clean.flushed, dirty.flushed], [1, 1]);
  });
});

describe('dvNoteSaver: flush (the tab is going)', () => {
  function editor(id, text) {
    const F = loadFns('public/js/detail-views.js', ['dvNoteSaver'], {
      extra: `const DV_AUTOSAVE_MS = ${MS};
        ${sliceFn(core, 'esc', 'public/js/core.js')}
        const __timers = []; let __tid = 0;
        function setTimeout(fn, ms) { const n = ++__tid; __timers.push({ n, fn, ms }); return n; }
        function clearTimeout(n) { const i = __timers.findIndex(x => x.n === n); if (i >= 0) __timers.splice(i, 1); }
        const __calls = [];
        async function apiFetchSilent(url, opts) { __calls.push({ url, keepalive: opts.keepalive === true, body: JSON.parse(opts.body) }); return { success: true }; }
        function __pause() { const due = __timers.splice(0); return Promise.all(due.map(x => x.fn())); }
        function __waiting() { return __timers.length; }
        function __sent() { return __calls; }`,
      expose: ['__pause', '__waiting', '__sent'] });
    return { saver: F.dvNoteSaver(id, text, () => {}), pause: F.__pause, waiting: F.__waiting, sent: F.__sent };
  }

  test('text still waiting goes out at once, as an auto-save in a request that may outlive the page', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello world');
    e.saver.flush(); await tick();
    assert.deepEqual(e.sent(), [{ url: '/api/activities/31', keepalive: true, body: { content: 'Hello world', autosave: true } }]);
    assert.equal(e.waiting(), 0, 'the wait is called off: it is not sent a second time');
    assert.equal(e.saver.dirty, false);
  });

  test('nothing waiting, an empty note, or an edit that is over: nothing is sent', async () => {
    const clean = editor(31, 'Hello'); clean.saver.flush(); await tick(); assert.deepEqual(clean.sent(), []);
    const empty = editor(31, 'Hello'); empty.saver.input('  '); empty.saver.flush(); await tick(); assert.deepEqual(empty.sent(), []);
    const over = editor(31, 'Hello'); over.saver.input('Hello world'); over.saver.stop(); over.saver.flush(); await tick(); assert.deepEqual(over.sent(), []);
  });

  test('an ordinary auto-save is an ordinary request', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello world'); await e.pause();
    assert.equal(e.sent()[0].keepalive, false);
  });

  test('a view is unsaved while its note is, or while a new note sits in the box', () => {
    // the guards' dirty(), as pinned above, read exactly these two things
    const e = editor(31, 'Hello');
    assert.equal(e.saver.dirty, false);
    e.saver.input('Hello world'); assert.equal(e.saver.dirty, true);
  });
});

// ── Part 3: the two other places where a new note is typed ───────────────────
// Checking the request again showed two places Parts 1 and 2 had missed: the "Log activity" window of the Calendar,
// which was closed without a word by its X, by Cancel and by a click beside it, and — for the browser tab only —
// the box on the Activities page.
describe('the "Log activity" window of the Calendar asks before it loses a typed text (Part 3)', () => {
  // the real closeActivityModal with a page that has (or lacks) a typed text
  function win({ text = '', answer = true, confirmThere = true } = {}) {
    const seen = { asked: 0, closed: [], focused: 0 };
    const F = loadFns('public/js/modals.js', ['closeActivityModal'], {
      extra: `const __seen = { asked: 0, closed: [], focused: 0 }; let __text = '', __answer = true;
        const document = { getElementById: id => (id === 'act-content' ? { get value() { return __text; }, focus() { __seen.focused++; } } : null) };
        function closeModal(id) { __seen.closed.push(id); }
        ${confirmThere ? 'async function dvConfirmUnsaved() { __seen.asked++; return __answer; }' : ''}
        function __setup(text, answer) { __text = text; __answer = answer; }
        function __state() { return __seen; }`,
      expose: ['__setup', '__state'] });
    F.__setup(text, answer);
    return { close: F.closeActivityModal, state: F.__state, seen };
  }

  test('nothing typed: it closes at once, without a question', async () => {
    const w = win({ text: '   ' });
    await w.close();
    assert.deepEqual(w.state(), { asked: 0, closed: ['activity-modal'], focused: 0 });
  });
  test('a text is typed: the question; "Close without saving" closes', async () => {
    const w = win({ text: 'Call back on Friday', answer: true });
    await w.close();
    assert.deepEqual(w.state(), { asked: 1, closed: ['activity-modal'], focused: 0 });
  });
  test('a text is typed, "Keep editing": the window stays and the text has the focus again', async () => {
    const w = win({ text: 'Call back on Friday', answer: false });
    await w.close();
    assert.deepEqual(w.state(), { asked: 1, closed: [], focused: 1 });
  });
  test('the X, Cancel and a click beside the window all go through it; saving closes without a question', () => {
    const start = html.indexOf('<div id="activity-modal"'), win = html.slice(start, html.indexOf('</form>', start));
    assert.match(html, /<div id="activity-modal" class="modal-overlay hidden" data-ask-close="closeActivityModal">/);
    assert.match(win, /<button class="iconbtn" onclick="closeActivityModal\(\)" aria-label="Close" data-i18n-aria="btn_close">/);
    assert.match(win, /<button type="button" class="btn btn-secondary" onclick="closeActivityModal\(\)" data-i18n="btn_cancel">/);
    assert.doesNotMatch(win, /closeModal\('activity-modal'\)/, 'no way past the question in the markup');
    assert.match(sliceFn(modals, 'saveActivity', 'modals.js'), /closeModal\('activity-modal'\);/, 'a saved entry closes the window itself');
  });
  test('a click beside a window calls the closer the window names; every other window closes as before', () => {
    const src = core.slice(core.indexOf("document.querySelectorAll('.modal-overlay').forEach(overlay => {"));
    const handler = new Function('overlay', 'window', `${cut(src, "overlay.addEventListener('click', e => {").replace("overlay.addEventListener('click', e =>", 'return (e =>')})`);
    const mk = (askClose, fns = {}) => { const o = { dataset: askClose ? { askClose } : {}, hidden: false, classList: { add: c => { if (c === 'hidden') o.hidden = true; } } }; return { o, on: handler(o, fns) }; };
    let asked = 0;
    const guarded = mk('closeActivityModal', { closeActivityModal: () => { asked++; } });
    guarded.on({ target: guarded.o }); assert.deepEqual([asked, guarded.o.hidden], [1, false], 'the closer decides');
    guarded.on({ target: {} });        assert.equal(asked, 1, 'a click inside the window is not a click beside it');
    const plain = mk(null); plain.on({ target: plain.o }); assert.equal(plain.o.hidden, true);
    const stale = mk('goneFunction'); stale.on({ target: stale.o }); assert.equal(stale.o.hidden, true, 'a closer that does not exist never traps the window open');
  });
});

describe('closing the browser tab also counts a new note typed elsewhere (Part 3)', () => {
  function page({ modalOpen = false, modalText = '', compose } = {}) {
    return loadFns('public/js/detail-views.js', ['dvDraftElsewhere'], {
      extra: `const document = { getElementById: id => (id === 'activity-modal' ? { classList: { contains: c => c === 'hidden' && !${modalOpen} } } : id === 'act-content' ? { value: ${JSON.stringify(modalText)} } : null) };
        ${compose === undefined ? '' : `let activityCompose = ${JSON.stringify(compose)};`}`,
    }).dvDraftElsewhere();
  }
  test('the "Log activity" window: only while it is open and has a text', () => {
    assert.equal(page({ modalOpen: true, modalText: 'x' }), true);
    assert.equal(page({ modalOpen: true, modalText: '  ' }), false);
    assert.equal(page({ modalOpen: false, modalText: 'left from before' }), false, 'a closed window holds nothing');
  });
  test('the box on the Activities page: while it has a text, whichever page is open', () => {
    assert.equal(page({ compose: { text: 'Draft' } }), true);
    assert.equal(page({ compose: { text: ' ' } }), false);
    assert.equal(page({}), false, 'a page without that box is not an error');
    assert.match(read('public/js/objects.js'), /^let activityCompose = \{ type: 'note', text: '', deal: '', contact: '', err: '' \};$/m);
  });
  test('it is one of the guards the tab asks', () => {
    assert.match(dv, /^dvGuards\.add\(\{ leave: async \(\) => true, dirty: dvDraftElsewhere, flush\(\) \{\} \}\);$/m);
  });
});
