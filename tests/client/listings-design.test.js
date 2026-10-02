// CLIENT (static) tests for the Listings/Objects page, aligned to the
// reference's toolbar/table/pagination idiom (reference/pro/src/screens/
// listings.js) within the app's generic custom-object data model (no fixed
// Type/Status/City/Owner columns to build filter chips from — this stays a
// plain searchable table, see DESIGN_PRO_CHANGES.md Part 9).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const objects = read('public/js/objects.js');
const css = read('public/style.css');
const section = html.slice(html.indexOf('<section id="page-objects"'), html.indexOf('<!-- ── Tasks ── -->'));

describe('markup: header uses the sprite, a more menu, pagination container unchanged', () => {
  test('files parse', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/objects.js')]));
  test('Add column, more menu, Add, and Clear search all use sprite icons', () => {
    assert.match(section, /id="add-object-column-btn"[\s\S]*?<svg class="ic" aria-hidden="true"><use href="#i-columns"\/><\/svg>/);
    assert.match(section, /onclick="openObjectsMoreMenu\(this\)"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-ellipsis"\/><\/svg>/);
    assert.match(section, /id="add-object-btn" onclick="openObjectModal\(\)"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg>/);
    assert.match(section, /id="object-search-clear"[^>]*>\s*<svg class="ic" aria-hidden="true"><use href="#i-x"\/><\/svg>/);
  });
  test('every sprite reference inside the section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});

describe('objects.js: table renderer uses a kebab menu and the shared pagination nav', () => {
  test('rows end in a kebab, not bare Edit/Delete buttons', () => {
    const r = sliceFn(objects, 'renderObjectsTable', 'objects.js');
    assert.match(r, /openObjectKebab\(this,\$\{o\.id\}\)/);
    assert.doesNotMatch(r, />Edit<|>Delete</);
  });
  test('pagination renders .ct-pg with sprite chevrons, not the old .page-btn widget', () => {
    const r = sliceFn(objects, 'renderObjectsTable', 'objects.js');
    assert.match(r, /class="ct-pg"/); assert.match(r, /class="ct-flip">\$\{icon\('chevron-right'\)\}/);
    assert.doesNotMatch(r, /pagination-controls|page-btn|page-ellipsis|‹|›/);
  });
  test('the kebab menu offers Edit and Delete through ui.menu', () => {
    const k = sliceFn(objects, 'openObjectKebab', 'objects.js');
    assert.match(k, /ui\.menu\(/); assert.match(k, /openObjectModal\(id\)/); assert.match(k, /deleteObject\(id\)/);
  });
  test('the more menu calls the new CSV export', () => {
    assert.match(sliceFn(objects, 'openObjectsMoreMenu', 'objects.js'), /exportObjectsCsv\(\)/);
  });
});

describe('stylesheet: dead pagination classes removed; .ct-pg reused', () => {
  test('.page-btn / .pagination-info / .pagination-controls / .page-ellipsis are gone', () => {
    for (const cls of ['.page-btn', '.pagination-info', '.pagination-controls', '.page-ellipsis']) {
      assert.ok(!css.includes(cls + ' {') && !css.includes(cls + ':') && !css.includes(cls + '.'), `${cls} removed`);
    }
  });
  test('.ct-pg is still defined (Part 4) and nothing object-specific needed adding', () => {
    assert.match(css, /^\.ct-pg \{/m);
  });
});
