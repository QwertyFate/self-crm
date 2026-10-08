// CLIENT (static) tests: activity notes never show their HTML tags, and never
// run them either.
//
// NOTES ARE STORED IN TWO SHAPES. The deal/contact timeline editors save
// esc(text).replace(/\n/g, '<br>') — escaped text with <br> tags. The activity
// modal saved the raw textarea value. The server stores whatever it is sent.
//
// THE BUG. The Activities page rendered esc(a.content): escaping the already
// escaped shape a second time, so "<br>" (and "&amp;") appeared literally.
// Reported as "in notes it shows the html tags".
//
// THE LATENT HOLE. The timelines rendered with dvActHtml, which TRUSTED any
// stored string containing a tag — right for the escaped shape, but a raw
// "<img onerror=…>" from the modal would have been written into the DOM as
// markup. Fixing the page by reusing that renderer would have widened it.
//
// THE FIX. One renderer: reduce whatever was stored to plain text first
// (dvActText — <br>/</p> → newline, tags stripped, entities decoded), THEN
// escape, THEN newlines → <br>. Every legitimate note looks the same as before;
// no stored markup can ever reach the DOM. The modal now saves the same shape
// as the other three writers, and search/export read the visible text.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const dv = read('public/js/detail-views.js');
const objects = read('public/js/objects.js');
const modals = read('public/js/modals.js');
const ESC = `function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }`;

describe('dvActHtml: stored note → safe HTML, same picture for every stored shape', () => {
  const F = () => loadFns('public/js/detail-views.js', ['dvActHtml', 'dvActText'], { extra: ESC });

  test('the escaped-with-<br> shape (the timeline editors) renders its line break, not a literal "<br>"', () => {
    const out = F().dvActHtml('Called &amp; agreed<br>Follow up Monday');
    assert.equal(out, 'Called &amp; agreed<br>Follow up Monday');
    assert.doesNotMatch(out, /&lt;br/, 'this is the bug: the tag shown as text');
  });
  test('raw text with a newline (the modal, until now) renders the same way', () => {
    assert.equal(F().dvActHtml('Line one\nLine two'), 'Line one<br>Line two');
  });
  test('a rich note with <p> and <br> collapses to its text and breaks', () => {
    assert.equal(F().dvActHtml('<p>Hello</p><br>world'), 'Hello<br><br>world');
  });
  test('an ampersand typed by the user survives a round trip once, not as &amp;amp;', () => {
    assert.equal(F().dvActHtml('R&amp;D meeting'), 'R&amp;D meeting');
    assert.equal(F().dvActHtml('R&D meeting'), 'R&amp;D meeting');
  });
  test('a stored raw <img onerror> can never reach the DOM as markup', () => {
    const out = F().dvActHtml('<img src=x onerror="alert(1)">hi');
    assert.doesNotMatch(out, /<img/);
    assert.match(out, /hi/);
  });
  test('…nor a <script>, in either stored shape', () => {
    assert.doesNotMatch(F().dvActHtml('<script>alert(1)</script>x'), /<script/);
    const escaped = F().dvActHtml('&lt;script&gt;alert(1)&lt;/script&gt;x');
    assert.doesNotMatch(escaped, /<script/);
    assert.match(escaped, /&lt;script&gt;/, 'what the user literally typed is shown as text');
  });
  test('empty and null render empty', () => {
    assert.equal(F().dvActHtml(''), ''); assert.equal(F().dvActHtml(null), '');
  });
  test('it is text-first, then escaped — not "trust it if it contains a tag"', () => {
    const src = sliceFn(dv, 'dvActHtml', 'detail-views.js');
    assert.match(src, /esc\(dvActText\(s\)\)/);
    assert.doesNotMatch(src, /test\(s/, 'the old regex gate is gone');
  });
});

describe('the Activities page', () => {
  test('the feed renders notes through dvActHtml, never esc(a.content)', () => {
    const f = sliceFn(objects, 'renderActivitiesFeed', 'objects.js');
    assert.match(f, /<div class="tl-text ac-text">\$\{dvActHtml\(a\.content\)\}<\/div>/);
    assert.doesNotMatch(f, /esc\(a\.content\)/);
  });
  test('search matches the VISIBLE text of a note, not its stored <br> and entities', () => {
    assert.match(sliceFn(objects, 'visibleActivities', 'objects.js'), /dvActText\(a\.content\)/);
  });
  test('the CSV export writes the visible text, not stored markup', () => {
    assert.match(objects, /a\.created_at \? new Date\(a\.created_at\)\.toISOString\(\) : '', dvActText\(a\.content\)\]/);
  });
});

describe('the activity modal saves the same shape as the other three writers', () => {
  test('escaped text with <br> for newlines', () => {
    const s = sliceFn(modals, 'saveActivity', 'modals.js');
    assert.match(s, /content:\s+esc\(document\.getElementById\('act-content'\)\.value\)\.replace\(\/\\n\/g, '<br>'\)/);
  });
  test('every writer in the app now stores esc(…).replace(/\\n/g, "<br>")', () => {
    const writers = (dv.match(/content: esc\([^)]*\)\.replace\(\/\\n\/g, '<br>'\)/g) || []).length
                  + (modals.match(/content:\s+esc\([^)]*\)\.replace\(\/\\n\/g, '<br>'\)/g) || []).length;
    assert.ok(writers >= 4, `expected the four writers, found ${writers}`);
    assert.doesNotMatch(modals, /content:\s+document\.getElementById\('act-content'\)\.value,/);
  });
});
