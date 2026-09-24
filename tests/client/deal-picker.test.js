// CLIENT (static + pure-function) tests for the searchable contact / supplier
// pickers in the deal view: one reusable combobox in core.js that wraps the
// existing hidden <select>, so everything that reads #df-contact keeps working.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const modals = read('public/js/modals.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('core.js picker', () => {
  test('the combobox API exists and the outside-click closer knows the picker', () => {
    for (const fn of ['attachPicker', 'refreshPicker', 'pickerSetValue', 'pickerFilter', 'pickerItems']) assert.match(core, new RegExp(`^function ${fn}\\(`, 'm'), fn);
    assert.match(core, /closest\('\.picker'\)/);
    const attach = sliceFn(core, 'attachPicker', 'core.js');
    for (const s of ['role="combobox"', 'aria-expanded', 'role="listbox"', "'ArrowDown'", "'Escape'", 'e.stopPropagation()', "dispatchEvent(new Event('change'", 'picker-clear']) assert.ok(attach.includes(s), s);
    for (const k of ['search_contact_ph', 'search_named_ph', 'no_matches', 'btn_clear']) assert.ok(k in dict.en && k in dict.de, k);
  });
  test('pickerFilter matches name, company and email case-insensitively and caps the list', () => {
    const F = loadFns('public/js/core.js', ['pickerFilter']);
    const items = [
      { value: '1', label: 'Anna Weber', meta: 'Acme GmbH · anna@acme.de' },
      { value: '2', label: 'Karl Schulze', meta: 'Schulze Dach' },
      { value: '3', label: 'Zoe Ø', meta: '' },
    ];
    assert.deepEqual(F.pickerFilter(items, 'acme').map(i => i.value), ['1']);
    assert.deepEqual(F.pickerFilter(items, 'SCHUL').map(i => i.value), ['2']);
    assert.deepEqual(F.pickerFilter(items, 'anna@').map(i => i.value), ['1']);
    assert.deepEqual(F.pickerFilter(items, '').map(i => i.value), ['1', '2', '3']);
    const many = Array.from({ length: 50 }, (_, i) => ({ value: String(i), label: `c${i}`, meta: '' }));
    assert.equal(F.pickerFilter(many, '').length, 30);
    assert.equal(F.pickerFilter(many, '', 5).length, 5);
  });
});

describe('deal view wiring', () => {
  test('the two selects stay in the form (hidden) inside picker cells', () => {
    assert.match(html, /<div class="picker-cell"><select id="df-contact" class="sr-only" onchange="onDealContactChange\(\)"><\/select><\/div>/);
    assert.match(html, /<div class="picker-cell"><select id="df-supplier" class="sr-only"><\/select><\/div>/);
  });
  test('openDealModal renders option meta and attaches both pickers; edit and contact-preset paths refresh them', () => {
    const open = sliceFn(modals, 'openDealModal', 'modals.js');
    assert.ok(open.includes('data-meta='), 'options carry company · email meta');
    assert.ok(open.includes("attachPicker('df-contact'"), 'contact picker');
    assert.ok(open.includes("attachPicker('df-supplier'"), 'supplier picker');
    assert.ok(open.indexOf("refreshPicker('df-contact')") > open.indexOf('contactSel.value  = d.contact_id'), 'refreshed after the edit path sets the value');
    assert.match(sliceFn(modals, 'openDealModalForContact', 'modals.js'), /refreshPicker\('df-contact'\)/);
    // the readers that other tests pin are untouched
    assert.match(sliceFn(modals, 'saveDeal', 'modals.js'), /getElementById\('df-contact'\)\.value/);
    assert.match(sliceFn(modals, 'onDealContactChange', 'modals.js'), /getElementById\('df-contact'\)/);
  });
  test('stylesheet', () => {
    for (const r of ['.picker {', '.picker-cell {', '.picker-input {', '.picker-clear {', '.picker.is-empty .picker-clear {', '.picker-list {', '.deal-search-item.active {']) assert.ok(css.includes('\n' + r), r);
  });
});
