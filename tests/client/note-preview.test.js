// CLIENT tests for long notes (NOTETAKER_AI_CHANGES Part 9, 2026-11-05): where notes are listed (the deal and contact
// timelines, the Activities page) a long note (more than 20 lines, or more than 4,000 characters; a meeting's
// transcript, say) shows its first 20 lines and "…", and under it a button that opens the whole note in a window. The
// real helpers from detail-views.js run here: the cut, the same escaping and linking as dvActHtml, the button (outside
// the note, so it never opens the editor), the window. The three places that list notes are pinned to use them.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const dv = read('public/js/detail-views.js');
const objects = read('public/js/objects.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const CONSTS = dv.match(/^const DV_NOTE_PREVIEW_LINES = \d+, DV_NOTE_PREVIEW_CHARS = \d+;$/m);
const ESC = `function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }`;
function load() {
  return loadFns('public/js/detail-views.js', ['dvActHtml', 'dvActText', 'dvLinkify', 'dvNotePreview', 'dvActPreviewHtml', 'dvNoteMoreHtml', 'dvOpenNote'], {
    extra: `${ESC}
      ${CONSTS[0]}
      const t = k => '[' + k + ']';
      const icon = n => '<i ' + n + '>';
      const dvTypeOf = id => ({ note: { label: 'act_note' }, call: { label: 'act_call' } }[id] || { label: 'act_note' });
      const dvWhen = ts => ts ? 'WHEN(' + ts + ')' : '';
      const __modals = []; const ui = { modal: o => (__modals.push(o), { el: {}, close() {} }) };`,
    expose: ['__modals'] });
}
const lines = n => Array.from({ length: n }, (_, i) => `Anna Weiß: Zeile ${i + 1}`).join('\n');

describe('the preview', () => {
  test('the limits: 20 lines, 4,000 characters', () => {
    assert.ok(CONSTS, 'the two limits are one line in detail-views.js');
    assert.equal(CONSTS[0], 'const DV_NOTE_PREVIEW_LINES = 20, DV_NOTE_PREVIEW_CHARS = 4000;');
  });
  test('a short note (up to 20 lines and 4,000 characters) is whole, exactly as dvActHtml shows it', () => {
    const F = load();
    for (const s of ['Kurz.', lines(20), 'x'.repeat(4000), 'Call: https://meet.google.com/abc-defg-hij.', '<a href="https://x.de">x</a>', '<img src=x onerror=alert(1)>', '<b>fett</b><br>zwei', null]) {
      assert.equal(F.dvNotePreview(s).long, false, String(s).slice(0, 30));
      assert.equal(F.dvActPreviewHtml(s), F.dvActHtml(s), String(s).slice(0, 30));
      assert.equal(F.dvNoteMoreHtml({ id: 1, content: s }), '', 'no button');
    }
  });
  test('more than 20 lines: the first 20, then "…" on its own line', () => {
    const F = load();
    const p = F.dvNotePreview('Transkript\n' + lines(150));
    assert.equal(p.long, true);
    assert.equal(p.text, 'Transkript\n' + lines(19) + '\n…');
    assert.equal(p.text.split('\n').length, 21, '20 lines and the "…"');
    assert.equal(F.dvActPreviewHtml('Transkript\n' + lines(150)), ('Transkript\n' + lines(19) + '\n…').replace(/\n/g, '<br>'));
  });
  test('more than 4,000 characters in few lines (or one): cut at 4,000, then " …"', () => {
    const F = load();
    assert.deepEqual(F.dvNotePreview('y'.repeat(10000)), { long: true, text: 'y'.repeat(4000) + ' …' });
    const fat = Array.from({ length: 5 }, () => 'z'.repeat(1000)).join('\n');   // 5 lines, 5,004 characters
    const p = F.dvNotePreview(fat);
    assert.equal(p.long, true); assert.equal(p.text.length, 4002); assert.match(p.text, / …$/);
    assert.equal(F.dvNotePreview('a'.repeat(3995) + ' '.repeat(10) + 'b'.repeat(100)).text, 'a'.repeat(3995) + ' …', 'a cut that lands in blanks drops them');
  });
  test('the preview is as safe as the whole note: stored markup stripped, text escaped, only typed addresses linked', () => {
    const F = load();
    const html = F.dvActPreviewHtml('<img src=x onerror=alert(1)>Hallo <b>&</b> https://x.de/a\n' + lines(30));
    assert.match(html, /^Hallo &amp; <a href="https:\/\/x\.de\/a" target="_blank" rel="noopener">https:\/\/x\.de\/a<\/a><br>/);
    assert.doesNotMatch(html, /<img|<b>|onerror/);
  });
});

describe('the button and the window', () => {
  test('a long note gets a button under it: its id, the words, an icon; the timelines catch it by data-note-full', () => {
    const F = load();
    assert.equal(F.dvNoteMoreHtml({ id: 42, content: lines(25) }), '<div class="note-more"><button type="button" class="btn btn-ghost btn-sm" data-note-full="42"><i file-text>[note_show_all]</button></div>');
  });
  test('the Activities page names its opener; only a plain function name becomes an onclick, the id only as a number', () => {
    const F = load();
    assert.match(F.dvNoteMoreHtml({ id: 7, content: lines(25) }, 'openActivityNote'), /data-note-full="7" onclick="openActivityNote\(7\)">/);
    assert.doesNotMatch(F.dvNoteMoreHtml({ id: 7, content: lines(25) }, 'x);alert(1'), /onclick/);
    assert.match(F.dvNoteMoreHtml({ id: '7" onmouseover="x', content: lines(25) }, 'openActivityNote'), /data-note-full="NaN" onclick="openActivityNote\(NaN\)"/, 'never the raw id');
  });
  test('the window: the note\'s kind and time as the title, wide, the whole note (every line) inside, a Close button', () => {
    const F = load();
    const content = 'Transkript\n' + lines(150);
    F.dvOpenNote({ id: 9, type: 'note', content, created_at: '2026-11-05T09:00:00Z' });
    assert.equal(F.__modals.length, 1);
    const m = F.__modals[0];
    assert.equal(m.title, '[act_note] · WHEN(2026-11-05T09:00:00Z)');
    assert.equal(m.size, 'lg');
    assert.equal(m.body, `<div class="note-full">${F.dvActHtml(content)}</div>`);
    assert.match(m.body, /Zeile 150<\/div>$/, 'to the last line');
    assert.equal(m.footer, '<button class="btn btn-secondary" data-close>[btn_close]</button>');
    F.dvOpenNote(undefined);
    assert.equal(F.__modals.length, 1, 'no note, no window');
  });
});

describe('where notes are listed', () => {
  test('the deal and the contact timelines: the preview inside the note, the button after it (outside the click-to-edit area); each catches the button', () => {
    const tl = /<div class="tl-text dd-pre" data-note="\$\{a\.id\}" title="\$\{esc\(t\('click_to_edit'\)\)\}">\$\{dvActPreviewHtml\(a\.content\)\}<\/div>\$\{dvNoteMoreHtml\(a\)\}\$\{dvJoinRow\(a\)\}/g;
    assert.equal((dv.match(tl) || []).length, 2, 'both timelines');
    assert.doesNotMatch(dv, /data-note="\$\{a\.id\}"[^>]*>\$\{dvActHtml\(/, 'no timeline lists a whole note any more');
    assert.match(dv, /on\(root, 'click', '\[data-note-full\]', \(e, el\) => dvOpenNote\(S\.acts\.find\(x => x\.id === \+el\.dataset\.noteFull\)\)\);/, 'the deal');
    assert.match(dv, /offs\.push\(on\(host, 'click', '\[data-note-full\]', \(e, el\) => dvOpenNote\(acts\(\)\.find\(x => x\.id === \+el\.dataset\.noteFull\)\)\)\);/, 'the contact');
  });
  test('the Activities page: the preview, the button with its opener, which finds the note in the page\'s list', () => {
    assert.match(sliceFn(objects, 'renderActivitiesFeed', 'objects.js'), /<div class="tl-text ac-text">\$\{dvActPreviewHtml\(a\.content\)\}<\/div>\$\{dvNoteMoreHtml\(a, 'openActivityNote'\)\}\$\{dvJoinRow\(a\)\}/);
    assert.match(objects, /^function openActivityNote\(id\) \{ dvOpenNote\(activities\.find\(x => x\.id === id\)\); \}$/m);
  });
  test('the calendar\'s entry detail is a window already: it still shows the whole text', () => {
    assert.match(read('public/js/calendar.js'), /<div class="cal-note">\$\{dvActHtml\(e\.content\)/);
  });
  test('the words, the icon and the look', () => {
    assert.equal(dict.en.note_show_all, 'Show the whole note'); assert.equal(dict.de.note_show_all, 'Ganze Notiz anzeigen');
    assert.match(read('public/index.html'), /<symbol id="i-file-text"/);
    const css = read('public/style.css');
    assert.match(css, /^\.note-more \{ margin-top: 2px; \}$/m);
    assert.match(css, /^\.note-full \{ overflow-wrap: anywhere; line-height: 1\.6; \}$/m);
  });
});
