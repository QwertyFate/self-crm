// CLIENT (static + pure-function) tests for the one-press save lock and the note editors' keys (2026-10-20).
//
// The bug: on a contact, a note edit saved twice in quick succession sent PATCH /api/activities/null.
// The first save cleared the edited id while the contact reloaded; the editor was still on screen,
// and a second save in that gap read the cleared id. Postgres refused "null" as an integer (22P02).
//
// Pinned here:
//   1. core.js: a click on a primary (or submit) button locks that button for one second; a second
//      click within the second is swallowed before any handler runs. The lock is a class, never
//      `disabled`, so the form guard and handlers that disable their own buttons are untouched.
//   2. The note editors (deal and contact): Enter is a new line; Ctrl/Cmd+Enter saves by clicking
//      the Save button, so the keyboard goes through the same lock.
//   3. The contact editor reads the note's id once, before any wait, and never sends a missing id.
//   4. The help line under the contact editor says Ctrl+Enter, in both languages.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFns, sliceConst } = require('../helpers/client-fn');

const core  = read('public/js/core.js');
const dv    = read('public/js/detail-views.js');
const style = read('public/style.css');

function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, `${name} exists`);
  const s = src.indexOf('{', i); let d = 0;
  for (let j = s; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) return src.slice(s, j + 1); }
  return '';
}

describe('the one-press lock in core.js', () => {
  test('one second, on primary and submit buttons, registered on the document in the capture phase', () => {
    assert.match(core, /^const SAVE_LOCK_MS = 1000;$/m);
    assert.match(core, /^const SAVE_BUTTONS = 'button\.btn-primary, button\[type="submit"\]';$/m);
    assert.match(core, /^document\.addEventListener\('click', saveLockClick, true\);$/m);
    assert.doesNotMatch(fnBody(core, 'lockSave') + fnBody(core, 'saveLockClick'), /\.disabled\s*=/, 'the lock never writes disabled');
  });

  // The real functions, with a fake clock and fake buttons.
  const lockMs  = core.match(/^const SAVE_LOCK_MS = (\d+);$/m)?.[1];
  const sel     = core.match(/^const SAVE_BUTTONS = ('[^']+');$/m)?.[1];
  const F = lockMs && sel ? loadFns('public/js/core.js', ['lockSave', 'saveLockClick'], {
    extra: `const SAVE_LOCK_MS = ${lockMs}; const SAVE_BUTTONS = ${sel}; const saveLocks = new WeakSet();
            const __timers = []; function setTimeout(fn, ms) { __timers.push({ fn, ms }); }
            function __tick() { const due = __timers.splice(0); due.forEach(t => t.fn()); return due.map(t => t.ms); }`,
    expose: ['__tick'],
  }) : null;
  const button = () => { const cls = new Set(); return { disabled: false, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } }; };
  const click  = btn => ({ target: { closest: s => (btn && s === eval(sel) ? btn : null) }, prevented: false, stopped: false,
                           preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } });

  test('the first click passes and dims the button; a second click within the second is swallowed', () => {
    assert.ok(F, 'lockSave and saveLockClick load from core.js');
    const b = button();
    const e1 = click(b); F.saveLockClick(e1);
    assert.equal(e1.prevented, false); assert.equal(e1.stopped, false, 'the first click reaches the handlers');
    assert.ok(b.classList.contains('is-save-locked'));
    const e2 = click(b); F.saveLockClick(e2);
    assert.equal(e2.prevented, true); assert.equal(e2.stopped, true, 'the second click never reaches a handler');
    assert.deepEqual(F.__tick(), [1000], 'one timer of one second');
    assert.ok(!b.classList.contains('is-save-locked'), 'the button is back after a second');
    const e3 = click(b); F.saveLockClick(e3);
    assert.equal(e3.stopped, false, 'after the second, the next click passes again');
    F.__tick();
  });

  test('the lock is per button; other clicks and disabled buttons are left alone', () => {
    const a = button(), b = button();
    F.saveLockClick(click(a));
    const eb = click(b); F.saveLockClick(eb);
    assert.equal(eb.stopped, false, 'another save button is not locked by the first');
    const plain = click(null); F.saveLockClick(plain);
    assert.equal(plain.stopped, false); assert.equal(plain.prevented, false, 'a click elsewhere is untouched');
    const d = button(); d.disabled = true;
    const ed = click(d); F.saveLockClick(ed);
    assert.equal(ed.stopped, false); assert.ok(!d.classList.contains('is-save-locked'), 'a disabled button is not touched');
    F.__tick();
  });

  test('the locked look: dimmed, still hit by the pointer (so the lock can swallow the click)', () => {
    const rule = style.match(/^\.btn\.is-save-locked \{([^}]*)\}$/m);
    assert.ok(rule, '.btn.is-save-locked has a rule');
    assert.match(rule[1], /opacity: \.6;/); assert.match(rule[1], /cursor: progress;/);
    assert.doesNotMatch(rule[1], /pointer-events/, 'a click on a locked button must land on it, not on what lies behind');
  });
});

describe('the note editors', () => {
  test('deal page: Enter is a new line; Ctrl/Cmd+Enter clicks the Save button', () => {
    const i = dv.indexOf("on(root, 'keydown', '#dd-act-edit'"); assert.ok(i >= 0);
    const h = dv.slice(i, dv.indexOf('}));', i));
    assert.doesNotMatch(h, /e\.key === 'Enter' && !e\.shiftKey/, 'a bare Enter no longer saves');
    assert.match(h, /if \(e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)\) \{ e\.preventDefault\(\); R\('\[data-act="act-save"\]'\)\?\.click\(\); \}/);
  });
  test('contact page: Enter is a new line; Ctrl/Cmd+Enter clicks the Save button', () => {
    const i = dv.indexOf("on(host, 'keydown', '#ct-aedit'"); assert.ok(i >= 0);
    const h = dv.slice(i, dv.indexOf('}));', i));
    assert.doesNotMatch(h, /e\.key === 'Enter' && !e\.shiftKey/, 'a bare Enter no longer saves');
    assert.match(h, /if \(e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)\) \{ e\.preventDefault\(\); host\.querySelector\('\[data-act="act-save"\]'\)\?\.click\(\); \}/);
  });
  test('contact page: the save reads the id once, before any wait, and never sends a missing one', () => {
    const s = fnBody(dv, 'saveNoteEdit');
    assert.match(s, /^\{\s*(\/\/[^\n]*\n\s*)*const aid = S\.editAct; if \(!aid\) return;/, 'the id is captured first');
    assert.match(s, /api\.patch\(`\/api\/activities\/\$\{aid\}`/);
    assert.doesNotMatch(s, /\$\{S\.editAct\}/, 'the URL never reads the shared state');
  });
  test('the help line under the contact editor says Ctrl+Enter, in both languages; the old key is gone', () => {
    const app = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    assert.equal(app.en.ctrl_enter_saves_esc_cancels, 'Ctrl+Enter saves · Esc cancels');
    assert.equal(app.de.ctrl_enter_saves_esc_cancels, 'Strg+Enter speichert · Esc bricht ab');
    assert.ok(!('enter_saves_esc_cancels' in app.en) && !('enter_saves_esc_cancels' in app.de));
    assert.match(dv, /<span class="help">\$\{esc\(t\('ctrl_enter_saves_esc_cancels'\)\)\}<\/span>/);
  });
});
