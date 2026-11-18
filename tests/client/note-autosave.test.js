// CLIENT tests: a note saves itself while it is edited (NOTE_EDITOR_CHANGES Part 1).
//
// Notes are edited in place in two timelines: the deal window (#dd-act-edit) and the contact view (#ct-aedit).
// Both hand their typing to one helper, dvNoteSaver, which is run here as the real function from detail-views.js
// with a fake clock and a fake server:
//   - 1.5 seconds after the last key the text is sent, flagged `autosave` (routes/activities.js then tells nobody
//     mentioned in it); nothing is sent while keys keep coming, and never an empty note
//   - one request at a time; what is typed while one is out goes with the next
//   - Save ends the edit with a save WITHOUT the flag when the note changed, so the people mentioned hear once
//   - Esc and Cancel put the note back to the text it had when the editor opened, on the server too
//   - the editor says "Saving…", "Saved", "Not saved" or "Empty, not saved" next to its buttons
// The rest is pinned statically: both editors feed the saver and show its state.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFns, sliceFn, sliceConst } = require('../helpers/client-fn');

const dv    = read('public/js/detail-views.js');
const core  = read('public/js/core.js');
const style = read('public/style.css');
const MS    = Number(dv.match(/^const DV_AUTOSAVE_MS = (\d+);$/m)?.[1]);

// One editor: the real dvNoteSaver (and the real esc), a clock that only moves when told, a server that records.
function editor(id, text) {
  const F = loadFns('public/js/detail-views.js', ['dvNoteSaver'], {
    extra: `const DV_AUTOSAVE_MS = ${MS};
      ${sliceFn(core, 'esc', 'public/js/core.js')}
      const __timers = []; let __tid = 0;
      function setTimeout(fn, ms) { const n = ++__tid; __timers.push({ n, fn, ms }); return n; }
      function clearTimeout(n) { const i = __timers.findIndex(x => x.n === n); if (i >= 0) __timers.splice(i, 1); }
      const __calls = []; let __answer = () => ({ success: true });
      async function apiFetchSilent(url, opts) { const call = { url, method: opts.method, body: JSON.parse(opts.body) }; __calls.push(call); return __answer(call); }
      function __pause() { const due = __timers.splice(0); return Promise.all(due.map(x => x.fn())); }
      function __waiting() { return __timers.map(x => x.ms); }
      function __sent() { return __calls; }
      function __reply(fn) { __answer = fn; }`,
    expose: ['__pause', '__waiting', '__sent', '__reply'],
  });
  const states = [];
  const saver = F.dvNoteSaver(id, text, s => states.push(s));
  return { saver, states, pause: F.__pause, waiting: F.__waiting, sent: F.__sent, reply: F.__reply };
}
// A request that stays out until the test lets it land.
function held() { let land; const p = new Promise(r => { land = r; }); return { p, land: (v = { success: true }) => land(v) }; }
const tick = () => new Promise(r => setImmediate(r));

describe('dvNoteSaver: saving while typing', () => {
  test('the wait is 1.5 seconds, inside the 1 to 2 asked for', () => {
    assert.equal(MS, 1500);
  });

  test('nothing is sent while keys keep coming; each key starts the wait again', () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello w'); e.saver.input('Hello wo'); e.saver.input('Hello world');
    assert.deepEqual(e.sent(), [], 'no request yet');
    assert.deepEqual(e.waiting(), [1500], 'one wait, not three');
    assert.equal(e.saver.dirty, true);
  });

  test('after the pause the text goes out once, as an auto-save, to the note the editor was opened on', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello <b>world</b>\nsecond line');
    await e.pause();
    assert.deepEqual(e.sent(), [{ url: '/api/activities/31', method: 'PATCH', body: { content: 'Hello &lt;b&gt;world&lt;/b&gt;<br>second line', autosave: true } }]);
    assert.deepEqual(e.states, ['saving', 'saved'], '"Saving…" from the first key, "Saved" once it landed');
    assert.equal(e.saver.dirty, false);
    assert.deepEqual(e.waiting(), [], 'nothing left to do');
  });

  test('the text is sent trimmed, as the Save button always sent it', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('  Hello there \n\n');
    await e.pause();
    assert.equal(e.sent()[0].body.content, 'Hello there');
  });

  test('an editor that was only opened sends nothing and says nothing', async () => {
    const e = editor(31, 'Hello');
    await e.pause();
    assert.deepEqual(e.sent(), []); assert.deepEqual(e.states, []);
    assert.equal(e.saver.dirty, false);
  });

  test('typed and taken back before the pause: nothing is sent, the line is empty again', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello!'); e.saver.input('Hello');
    assert.deepEqual(e.waiting(), [], 'the wait is called off');
    await e.pause();
    assert.deepEqual(e.sent(), []);
    assert.deepEqual(e.states, ['saving', '']);
  });

  test('spaces around the same text are not a change', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello  ');
    assert.equal(e.saver.dirty, false); assert.deepEqual(e.waiting(), []);
  });

  test('one request at a time: what is typed while one is out goes with the next', async () => {
    const e = editor(31, 'A');
    const first = held(); e.reply(() => first.p);
    e.saver.input('AB');
    const p1 = e.pause(); await tick();
    assert.equal(e.sent().length, 1, 'the first save is out');
    e.saver.input('ABC');                                  // typed while it is out
    e.reply(() => ({ success: true }));
    const p2 = e.pause(); await tick();                    // the next pause ends before the first save lands
    assert.equal(e.sent().length, 1, 'the second waits for the first');
    first.land(); await p1; await p2;
    assert.deepEqual(e.sent().map(c => c.body.content), ['AB', 'ABC']);
    assert.deepEqual(e.states.at(-1), 'saved');
    assert.ok(!e.states.slice(0, -1).includes('saved'), '"Saved" only once everything typed is stored');
    assert.equal(e.saver.dirty, false);
  });

  test('a save that lands while newer text waits does not say "Saved"', async () => {
    const e = editor(31, 'A');
    const first = held(); e.reply(() => first.p);
    e.saver.input('AB');
    const p1 = e.pause(); await tick();
    e.saver.input('ABC');
    first.land(); await p1;
    assert.equal(e.states.at(-1), 'saving');
    assert.equal(e.saver.dirty, true);
    assert.deepEqual(e.waiting(), [1500], 'the newer text has its own wait');
  });

  test('a failed save says "Not saved", stays unsaved, and the next key tries again', async () => {
    const e = editor(31, 'Hello');
    e.reply(() => ({ error: 'Network error' }));
    e.saver.input('Hello world');
    await e.pause();
    assert.equal(e.states.at(-1), 'failed');
    assert.equal(e.saver.dirty, true);
    e.reply(() => ({ success: true }));
    e.saver.input('Hello world!');
    assert.equal(e.states.at(-1), 'saving');
    await e.pause();
    assert.equal(e.states.at(-1), 'saved');
    assert.equal(e.sent().at(-1).body.content, 'Hello world!');
  });

  test('an empty note is never sent; the line says so', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('   ');
    assert.equal(e.states.at(-1), 'empty');
    await e.pause();
    assert.deepEqual(e.sent(), []);
    assert.equal(e.saver.dirty, true, 'still not what the server holds');
  });
});

describe('dvNoteSaver: Save (done)', () => {
  test('text still waiting is sent at once, without the auto-save flag', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello @Anna');
    const res = await e.saver.done();
    assert.deepEqual(res, { ok: true, sent: true, changed: true });
    assert.deepEqual(e.sent(), [{ url: '/api/activities/31', method: 'PATCH', body: { content: 'Hello @Anna' } }]);
    assert.deepEqual(e.waiting(), [], 'the wait is called off');
  });

  test('text an auto-save already stored is sent once more without the flag: that is the save that tells the people mentioned', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello @Anna');
    await e.pause();
    const res = await e.saver.done();
    assert.deepEqual(res, { ok: true, sent: true, changed: true });
    assert.deepEqual(e.sent().map(c => c.body), [{ content: 'Hello @Anna', autosave: true }, { content: 'Hello @Anna' }]);
  });

  test('nothing changed: nothing is sent', async () => {
    const e = editor(31, 'Hello');
    assert.deepEqual(await e.saver.done(), { ok: true, sent: false, changed: false });
    assert.deepEqual(e.sent(), []);
  });

  test('changed, auto-saved, and typed back: the way back is saved quietly and nothing counts as changed', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello @Anna');
    await e.pause();
    e.saver.input('Hello');
    const res = await e.saver.done();
    assert.deepEqual(res, { ok: true, sent: true, changed: false });
    assert.deepEqual(e.sent().map(c => c.body), [{ content: 'Hello @Anna', autosave: true }, { content: 'Hello', autosave: true }]);
  });

  test('an empty note is refused and stays open', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('');
    assert.deepEqual(await e.saver.done(), { empty: true });
    assert.deepEqual(e.sent(), []);
    e.saver.input('Hello again');
    assert.deepEqual(await e.saver.done(), { ok: true, sent: true, changed: true }, 'and can be saved once it has text');
  });

  test('a failed save comes back as the error and the editor lives on', async () => {
    const e = editor(31, 'Hello');
    e.reply(() => ({ error: 'Network error' }));
    e.saver.input('Hello world');
    assert.deepEqual(await e.saver.done(), { error: 'Network error' });
    assert.equal(e.states.at(-1), 'failed');
    assert.equal(e.saver.dirty, true);
    e.reply(() => ({ success: true }));
    assert.deepEqual(await e.saver.done(), { ok: true, sent: true, changed: true });
  });

  test('Save waits for an auto-save that is still out, then sends the newest text', async () => {
    const e = editor(31, 'A');
    const first = held(); e.reply(() => first.p);
    e.saver.input('AB');
    const p1 = e.pause(); await tick();
    e.saver.input('ABC'); e.reply(() => ({ success: true }));
    const done = e.saver.done(); await tick();
    assert.equal(e.sent().length, 1, 'not two requests at once');
    first.land(); await p1;
    assert.deepEqual(await done, { ok: true, sent: true, changed: true });
    assert.deepEqual(e.sent().map(c => c.body), [{ content: 'AB', autosave: true }, { content: 'ABC' }]);
  });

  test('pressed twice: the second sends nothing', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello world');
    const [a, b] = await Promise.all([e.saver.done(), e.saver.done()]);
    assert.equal(a.ok, true); assert.equal(b.ok, true);
    assert.equal(e.sent().length, 1);
  });
});

describe('dvNoteSaver: Esc and Cancel (back)', () => {
  test('nothing stored yet: the wait is called off and nothing is sent', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello world');
    assert.deepEqual(await e.saver.back(), { ok: true, sent: false });
    assert.deepEqual(e.sent(), []); assert.deepEqual(e.waiting(), []);
  });

  test('an auto-save already stored the new text: the old text is sent back, quietly', async () => {
    const e = editor(31, 'Hello\nthere');
    e.saver.input('Something else');
    await e.pause();
    assert.deepEqual(await e.saver.back(), { ok: true, sent: true });
    assert.deepEqual(e.sent().map(c => c.body), [{ content: 'Something else', autosave: true }, { content: 'Hello<br>there', autosave: true }]);
  });

  test('an auto-save is still out: it is waited for, then undone', async () => {
    const e = editor(31, 'Hello');
    const first = held(); e.reply(() => first.p);
    e.saver.input('Something else');
    const p1 = e.pause(); await tick();
    e.reply(() => ({ success: true }));
    const back = e.saver.back(); await tick();
    assert.equal(e.sent().length, 1);
    first.land(); await p1;
    assert.deepEqual(await back, { ok: true, sent: true });
    assert.deepEqual(e.sent().map(c => c.body.content), ['Something else', 'Hello']);
  });

  test('the old text cannot be sent back: the error is returned and the editor lives on', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Something else');
    await e.pause();
    e.reply(() => ({ error: 'Network error' }));
    assert.deepEqual(await e.saver.back(), { error: 'Network error' });
    e.reply(() => ({ success: true }));
    assert.deepEqual(await e.saver.back(), { ok: true, sent: true });
  });
});

describe('dvNoteSaver: once the edit is over', () => {
  for (const [name, end] of [['Save', e => e.saver.done()], ['Cancel', e => e.saver.back()], ['stop', e => e.saver.stop()]]) {
    test(`after ${name}: no more saves, no more words, nothing waiting`, async () => {
      const e = editor(31, 'Hello');
      e.saver.input('Hello world');
      await end(e);
      const sent = e.sent().length, said = e.states.length;
      e.saver.input('typed into a closed editor');
      await e.pause();
      assert.equal(e.sent().length, sent); assert.equal(e.states.length, said);
      assert.deepEqual(e.waiting(), []);
      assert.equal(e.saver.dirty, false);
    });
  }

  test('stop sends nothing at all (the note was deleted)', async () => {
    const e = editor(31, 'Hello');
    e.saver.input('Hello world'); e.saver.stop();
    await e.pause();
    assert.deepEqual(e.sent(), []);
  });

  test('every request goes to the note the editor was opened on; the helper cannot read a view\'s state', async () => {
    const e = editor(77, 'Hello');
    e.saver.input('One'); await e.pause(); e.saver.input('Two'); await e.saver.done();
    assert.deepEqual([...new Set(e.sent().map(c => c.url))], ['/api/activities/77']);
    assert.doesNotMatch(sliceFn(dv, 'dvNoteSaver', 'public/js/detail-views.js'), /\bS\./);
  });
});

describe('what the editor says', () => {
  const app = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
  const words = lang => loadFns('public/js/detail-views.js', ['dvSaveStateHtml', 'dvSaveStateShow'], {
    extra: `${sliceFn(core, 'esc', 'public/js/core.js')}
      const __dict = ${JSON.stringify(app[lang])}; function t(k) { return __dict[k] ?? k; }
      ${dv.match(/^const DV_SAVE_STATES = \{[^\n]*\};$/m)[0]}
      ${dv.match(/^const dvSaveStateText = [^\n]*;$/m)[0]}`,
  });

  test('the four sentences exist in both languages', () => {
    assert.deepEqual([app.en.note_saving, app.en.note_saved, app.en.note_not_saved, app.en.note_empty], ['Saving…', 'Saved', 'Not saved', 'Empty, not saved']);
    assert.deepEqual([app.de.note_saving, app.de.note_saved, app.de.note_not_saved, app.de.note_empty], ['Speichert…', 'Gespeichert', 'Nicht gespeichert', 'Leer, nicht gespeichert']);
  });

  test('the line: empty until something was typed, then one sentence per state, read out politely', () => {
    const F = words('en');
    assert.equal(F.dvSaveStateHtml('dd-act-state', ''), '<span class="note-state" id="dd-act-state" role="status" aria-live="polite" data-state=""></span>');
    assert.equal(F.dvSaveStateHtml('dd-act-state', 'saving'), '<span class="note-state" id="dd-act-state" role="status" aria-live="polite" data-state="saving">Saving…</span>');
    assert.match(F.dvSaveStateHtml('ct-astate', 'saved'), /data-state="saved">Saved<\/span>$/);
    assert.match(F.dvSaveStateHtml('ct-astate', 'failed'), /data-state="failed">Not saved<\/span>$/);
    assert.match(F.dvSaveStateHtml('ct-astate', 'empty'), /data-state="empty">Empty, not saved<\/span>$/);
    assert.match(F.dvSaveStateHtml('ct-astate', 'nonsense'), /data-state=""><\/span>$/, 'an unknown state says nothing');
    assert.match(words('de').dvSaveStateHtml('ct-astate', 'saved'), />Gespeichert<\/span>$/);
  });

  test('a new state is written into the line that is on screen, without building the editor again', () => {
    const F = words('en'), el = { dataset: {}, textContent: 'x' };
    F.dvSaveStateShow(el, 'saving'); assert.deepEqual([el.dataset.state, el.textContent], ['saving', 'Saving…']);
    F.dvSaveStateShow(el, '');       assert.deepEqual([el.dataset.state, el.textContent], ['', '']);
    assert.doesNotThrow(() => F.dvSaveStateShow(null, 'saved'), 'no line on screen is not an error');
  });

  test('the look: quiet, red only when a save failed', () => {
    assert.match(style, /^\.note-state \{ font-size: var\(--fs-sm\); color: var\(--text-3\); \}$/m);
    assert.match(style, /^\.note-state\[data-state="failed"\] \{ color: var\(--danger\); font-weight: 600; \}$/m);
  });
});

// A pop window listens for keys on the document in the capture phase, so it hears Escape before the field that has
// the focus. Until Part 1, Escape in a note editor inside the deal window (or the contact's pop window) closed the
// whole window and the editor's own Escape never ran. A field marked data-esc now keeps the key.
describe('Escape inside a note editor in a pop window', () => {
  const overlay = sliceFn(core, 'uiOverlay', 'public/js/core.js');
  // the window's real key handler, cut out of uiOverlay and given what it reads
  function keys({ popover = false } = {}) {
    const i = overlay.indexOf('const onKey = e => {'); assert.ok(i >= 0, 'uiOverlay has its key handler');
    const open = overlay.indexOf('{', i); let depth = 0, end = -1;
    for (let j = open; j < overlay.length; j++) { if (overlay[j] === '{') depth++; else if (overlay[j] === '}' && !--depth) { end = j + 1; break; } }
    const closed = { n: 0 };
    const onKey = new Function('isTop', 'openPopover', 'askClose', '$$', 'panel', 'document', `return (${overlay.slice(overlay.indexOf('e =>', i), end)});`)(
      () => true, popover ? {} : null, () => { closed.n++; }, () => [], {}, { activeElement: null });
    return { onKey, closed };
  }
  const press = (key, inEditor) => ({ key, stopped: false, target: { closest: sel => (inEditor && sel === '[data-esc]' ? {} : null) }, stopPropagation() { this.stopped = true; } });

  test('the window hears keys first: on the document, in the capture phase', () => {
    assert.match(overlay, /document\.addEventListener\('keydown', onKey, true\);/);
  });

  test('Escape in a note editor: the window stays open and the key goes on to the editor', () => {
    const k = keys(), e = press('Escape', true);
    k.onKey(e);
    assert.equal(k.closed.n, 0, 'the window is not closed');
    assert.equal(e.stopped, false, 'the editor still gets the key');
  });

  test('Escape anywhere else closes the window, as before', () => {
    const k = keys(), e = press('Escape', false);
    k.onKey(e);
    assert.equal(k.closed.n, 1); assert.equal(e.stopped, true);
  });

  test('while a menu is open, Escape belongs to the menu, as before', () => {
    const k = keys({ popover: true }), e = press('Escape', false);
    k.onKey(e);
    assert.equal(k.closed.n, 0); assert.equal(e.stopped, false);
  });

  test('both note editors are marked, and nothing else is', () => {
    assert.match(dv, /<textarea class="textarea dv-grow" id="dd-act-edit" data-esc rows="3"/);
    assert.match(dv, /<textarea class="textarea dv-grow" id="ct-aedit" data-esc rows="3"/);
    assert.equal((dv.match(/\bdata-esc\b/g) || []).length, 2);
    assert.doesNotMatch(read('public/index.html'), /\bdata-esc\b/);
  });
});

describe('both editors use it', () => {
  const body = name => { const s = sliceFn(dv, name, 'public/js/detail-views.js'); return s.slice(s.indexOf('{')); };

  test('every key goes to the saver', () => {
    assert.match(dv, /on\(root, 'input', '#dd-act-edit', \(e, el\) => \{ S\.editText = el\.value; el\.removeAttribute\('aria-invalid'\); dvAutoGrow\(el\); S\.saver && S\.saver\.input\(el\.value\); \}\);/);
    assert.match(dv, /on\(host, 'input', '#ct-aedit', \(e, el\) => \{ S\.editText = el\.value; el\.removeAttribute\('aria-invalid'\); dvAutoGrow\(el\); S\.saver && S\.saver\.input\(el\.value\); \}\)\);/);
  });

  test('opening a note gives it a saver with that note\'s id and text', () => {
    assert.match(body('noteOpen'), /S\.saver = dvNoteSaver\(a\.id, S\.editText, noteState\);/);
    assert.match(body('startNoteEdit'), /S\.saver = dvNoteSaver\(aid, S\.editText, noteState\);/);
  });

  test('the line sits left of Cancel and Save in both editors', () => {
    // since the templates (Part 5) the deal editor's row has the "Insert template" button on its left
    assert.match(dv, /<div class="row-between">\$\{ntplButtonHtml\('dd-act-edit'\)\}<span class="row">\$\{dvSaveStateHtml\('dd-act-state', S\.editSave\)\}<button class="btn btn-secondary btn-sm" data-act="act-cancel">/);
    assert.match(dv, /<span class="row">\$\{dvSaveStateHtml\('ct-astate', S\.editSave\)\}<button class="btn btn-secondary btn-sm" type="button" data-act="act-cancel">/);
    assert.match(dv, /const noteState = s => \{ S\.editSave = s; dvSaveStateShow\(R\('#dd-act-state'\), s\); \};/);
  });

  test('the contact view writes its state only while it still owns the side panel', () => {
    assert.match(dv, /const noteState = s => \{ if \(host\._ctOff !== offs\) return; S\.editSave = s; dvSaveStateShow\(host\.querySelector\('#ct-astate'\), s\); \};/);
  });

  test('Save, Cancel and Esc go through the saver', () => {
    assert.match(dv, /'act-edit': el => noteOpen\(\+el\.dataset\.id\),\n\s*'act-cancel': \(\) => noteBack\(\),\n\s*'act-save': \(\) => noteSave\(\),/);
    assert.match(dv, /'act-edit': el => startNoteEdit\(\+el\.dataset\.id\),\n\s*'act-cancel': \(\) => cancelNoteEdit\(\),\n\s*'act-save': \(\) => saveNoteEdit\(\),/);
    assert.match(dv, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); noteBack\(\); \}/);
    assert.match(dv, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); cancelNoteEdit\(\); \}/);
    for (const name of ['noteSave', 'saveNoteEdit']) assert.match(body(name), /const saver = S\.saver; if \(!saver \|\| S\.editBusy\) return false;\s*S\.editBusy = true; const res = await saver\.done\(\); S\.editBusy = false;/, name);
    for (const name of ['noteBack', 'cancelNoteEdit']) assert.match(body(name), /const saver = S\.saver; if \(!saver \|\| S\.editBusy\) return;\s*S\.editBusy = true; const res = await saver\.back\(\); S\.editBusy = false;/, name);
  });

  test('an empty note and a failed save keep the editor open', () => {
    for (const name of ['noteSave', 'saveNoteEdit']) {
      const s = body(name);
      assert.match(s, /if \(res\.empty\) \{[^}]*setAttribute\('aria-invalid', 'true'\); ta\.focus\(\); \} return false; \}/, name);
      assert.match(s, /if \(res\.error\) \{ ui\.toast\(res\.error\); return false; \}/, name);
      assert.ok(s.indexOf('res.error') < s.search(/noteEnd\(\)|endNoteEdit\(\)/), `${name}: the editor is closed only after both checks`);
    }
    for (const name of ['noteBack', 'cancelNoteEdit']) assert.match(body(name), /if \(res\.error\) return ui\.toast\(res\.error\);\s*(noteEnd|endNoteEdit)\(\);/, name);
  });

  test('the list is read again only when the server heard from the editor; "Entry updated" only when the note changed', () => {
    assert.match(body('noteSave'), /noteEnd\(\); if \(res\.sent\) await loadActs\(\); render\('main'\); if \(res\.changed\) ui\.toast\(t\('entry_updated'\)\);/);
    assert.match(body('noteBack'), /noteEnd\(\); if \(res\.sent\) await loadActs\(\); render\('main'\);/);
    assert.match(body('saveNoteEdit'), /endNoteEdit\(\);\s*if \(res\.sent\) \{ const fresh = await api\.get\(`\/api\/contacts\/\$\{id\}`\); if \(fresh && !fresh\.error\) S\.c = fresh; \}\s*render\(\); if \(res\.changed\) ui\.toast\(t\('entry_updated'\)\);/);
    assert.match(body('cancelNoteEdit'), /endNoteEdit\(\);\s*if \(res\.sent\) \{ const fresh = await api\.get\(`\/api\/contacts\/\$\{id\}`\); if \(fresh && !fresh\.error\) S\.c = fresh; \}\s*render\(\);/);
  });

  test('opening another note saves the open one first, and stays on it if that fails; the open note\'s own pencil only focuses it', () => {
    assert.match(body('noteOpen'), /^\{\s*if \(S\.editAct === aid\) return R\('#dd-act-edit'\)\?\.focus\(\);\s*if \(S\.editAct && !\(await noteSave\(\)\)\) return;/);
    assert.match(body('startNoteEdit'), /^\{\s*if \(S\.editAct === aid\) return host\.querySelector\('#ct-aedit'\)\?\.focus\(\);\s*if \(S\.editAct && !\(await saveNoteEdit\(\)\)\) return;/);
  });

  test('deleting the note that is being edited ends the edit, so no save follows it', () => {
    assert.match(dv, /if \(res\?\.error\) return ui\.toast\(res\.error\); if \(S\.editAct === aid\) noteEnd\(\); await refresh\(\);/);
    assert.match(dv, /if \(res\?\.error\) return ui\.toast\(res\.error\); if \(S\.editAct === aid\) endNoteEdit\(\); const fresh = await api\.get/);
    for (const name of ['noteEnd', 'endNoteEdit']) assert.match(body(name), /^\{ if \(S\.saver\) S\.saver\.stop\(\); S\.saver = null; S\.editAct = null; S\.editText = ''; S\.editSave = ''; \}$/, name);
  });

  test('no editor sends a note\'s text past the saver, and nothing ends an edit by hand', () => {
    assert.doesNotMatch(dv, /api\.patch\(`\/api\/activities\/[^`]*`, \{ content/);
    assert.equal((dv.match(/S\.editAct = null/g) || []).length, 2, 'only noteEnd and endNoteEdit clear the open note');
  });
});
