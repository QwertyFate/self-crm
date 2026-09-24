// CLIENT (static, no jsdom) regression test for the Import-CSV modal layout.
// The modal box is `display:flex; max-height; overflow:hidden`, so the only
// way its footer stays reachable is the app-wide shape: header, ONE scrolling
// `.modal-body`, and footers as direct children of `.modal`. Before the fix the
// action bar lived inside the step div and was clipped once "Create deals
// during import" made the step taller than the box.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const html = read('public/index.html');

// Source of the <div …> element that starts at `start` (balanced div count).
function elementAt(src, start) {
  const re = /<div\b|<\/div>/g; re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) return src.slice(start, m.index + 6); }
  throw new Error('unbalanced <div> from offset ' + start);
}
function divById(src, id) {
  const i = src.indexOf(`id="${id}"`); assert.ok(i > 0, `element #${id} present`);
  return elementAt(src, src.lastIndexOf('<div', i));
}
const openTag = el => el.slice(0, el.indexOf('>') + 1);

const modal = divById(html, 'import-modal');
const STEPS = ['upload', 'map', 'done'];

describe('#import-modal markup', () => {
  test('exactly one .modal-body, and all three steps are inside it', () => {
    assert.equal((modal.match(/class="modal-body"/g) || []).length, 1);
    const body = elementAt(modal, modal.indexOf('<div class="modal-body"'));
    for (const s of STEPS) assert.ok(body.includes(`id="import-step-${s}"`), `step ${s} in the body`);
  });
  test('no action bar inside any step div (that is what got clipped)', () => {
    for (const s of STEPS) assert.doesNotMatch(divById(modal, `import-step-${s}`), /modal-(actions|footer)/, `step ${s}`);
  });
  test('the map and done footers are siblings of the body, hidden by default, and hold the original buttons', () => {
    const body = elementAt(modal, modal.indexOf('<div class="modal-body"'));
    const afterBody = modal.indexOf(body) + body.length;
    for (const s of ['map', 'done']) {
      const f = divById(modal, `import-footer-${s}`);
      assert.ok(modal.indexOf(f) >= afterBody, `footer ${s} comes after the body, not inside it`);
      assert.match(openTag(f), /class="modal-(actions|footer)[^"]*\bhidden\b/, `footer ${s} hidden by default`);
    }
    const map = divById(modal, 'import-footer-map');
    assert.ok(map.includes('id="import-run-btn"') && map.includes('onclick="runImport()"'), 'Import button');
    assert.ok(map.includes('onclick="importBack()"'), 'Back button');
    assert.ok(divById(modal, 'import-footer-done').includes("closeModal('import-modal');loadContacts()"), 'Done button');
  });
});

describe('showImportStep', () => {
  // Real function from admin-import.js, run against a five-element fake document.
  const src = sliceFn(read('public/js/admin-import.js'), 'showImportStep', 'admin-import.js');
  const els = {};
  for (const id of ['import-step-upload', 'import-step-map', 'import-step-done', 'import-footer-map', 'import-footer-done']) {
    els[id] = { hidden: null, classList: { toggle(cls, on) { if (cls === 'hidden') els[id].hidden = !!on; } } };
  }
  const showImportStep = new Function('document', src + '\nreturn showImportStep;')({ getElementById: id => els[id] || null });
  const hiddenMap = () => Object.fromEntries(Object.entries(els).map(([k, v]) => [k, v.hidden]));

  test('shows the step AND its footer, hides the others; a step without a footer does not throw', () => {
    showImportStep('map');
    assert.deepEqual(hiddenMap(), { 'import-step-upload': true, 'import-step-map': false, 'import-step-done': true, 'import-footer-map': false, 'import-footer-done': true });
    showImportStep('done');
    assert.deepEqual(hiddenMap(), { 'import-step-upload': true, 'import-step-map': true, 'import-step-done': false, 'import-footer-map': true, 'import-footer-done': false });
    showImportStep('upload');
    assert.deepEqual(hiddenMap(), { 'import-step-upload': false, 'import-step-map': true, 'import-step-done': true, 'import-footer-map': true, 'import-footer-done': true });
  });
});
