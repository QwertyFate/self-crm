// CLIENT (static + pure-function) tests: the contact record's sections are
// disclosures. Each block head is one <button aria-expanded> (chevron, title,
// count) with the block's actions beside it; the card's custom fields fold
// into a "Details (n)" row; choices persist per user; a collapsed block opens
// when something is added to it.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const css = read('public/style.css');
const modals = read('public/js/modals.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('block heads are disclosures', () => {
  test('one shared head: a toggle button with the actions as its sibling', () => {
    const head = sliceFn(modals, 'detailBlockHead', 'modals.js');
    assert.match(head, /<button type="button" class="detail-block-toggle" aria-expanded="\$\{open\}" aria-controls="contact-section-\$\{name\}" title="\$\{esc\(t\('toggle_section'\)\)\}" onclick="toggleDetailBlock\(this\)">/);
    assert.match(head, /UI_ICON\.chevronDown/);
    assert.match(head, /<span class="contact-panel-section-label">\$\{label\}<\/span><span class="detail-block-count" id="contact-\$\{name\}-count">/);
    const before = head.slice(0, head.indexOf('detail-block-actions'));
    assert.equal((before.match(/<button/g) || []).length, 1, 'no nested buttons: the actions come after the toggle');
    assert.match(head, /<\/button>[\s\S]*detail-block-actions/);
  });
  test('buildDetailHTML: deals, tasks and notes use the head and a body that can hide', () => {
    const body = sliceFn(modals, 'buildDetailHTML', 'modals.js');
    for (const name of ['deals', 'tasks', 'notes']) {
      assert.match(body, new RegExp(`<section class="detail-block" data-section="${name}">`), name);
      assert.match(body, new RegExp(`detailBlockHead\\('${name}',`), `${name} head`);
      assert.match(body, new RegExp(`<div class="detail-block-body\\$\\{[^}]*${name}[^}]*\\}" id="contact-section-${name}">`), `${name} body`);
    }
    for (const s of ['id="contact-deals-list"', 'id="contact-tasks-list"', 'id="contact-note-form-wrapper"', 'id="detail-acts"']) assert.ok(body.includes(s), s);
    assert.match(body, /const prefs = loadPanelSections\(\)/);
    assert.match(body, /panelSectionOpen\(prefs, 'deals', true\)[\s\S]*panelSectionOpen\(prefs, 'tasks', true\)[\s\S]*panelSectionOpen\(prefs, 'notes', true\)/, 'blocks default to open');
    assert.equal(body.includes('style="'), false);
  });
  test('the card shows the essentials and folds the rest into "Contact information (n)", collapsed by default', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    assert.match(card, /data-section="contact_info"/);
    assert.match(card, /class="detail-block-toggle contact-card-details-toggle" aria-expanded="\$\{detailsOpen\}" aria-controls="\$\{infoId\}"[^>]*onclick="toggleDetailBlock\(this\)"/);
    assert.match(card, /panelSectionOpen\(prefs, 'contact_info', false\)/, 'collapsed unless the user opened it');
    assert.match(card, /const infoId = `contact-section-contact-info\$\{/);
    assert.match(card, /id="\$\{infoId\}"/);
    assert.match(card, /fields\.length \? /, 'no fold without custom fields');
    assert.ok(card.includes("t('sec_contact_info')"));
    assert.equal(card.includes("t('sec_details')"), false);
    assert.ok(card.includes('fmtDate(c.created_at)'));
    // Always visible, in this order, before the fold: who · owner · reach; the fold is the card's last band.
    const order = ['contact-card-head', 'owner-strip', 'contact-card-channels', 'data-section="contact_info"'].map(s => card.indexOf(s));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `order: ${order.join(',')}`);
    assert.ok(card.lastIndexOf('</div>`;') > card.indexOf('data-section="contact_info"'), 'the fold closes the card');
  });
});

describe('the deal view', () => {
  test('its contact column is the same card, rendered with the deal surface, which gives the fold its own body id', () => {
    const panel = sliceFn(modals, 'renderContactPanelReadOnly', 'modals.js');
    assert.ok(panel.includes("contactDetailCardHtml(full, full.id, { surface: 'deal' })"));
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    assert.match(card, /const surface = opts\.surface \|\| 'panel'/);
    assert.match(card, /contact-section-contact-info\$\{[^}]*'-deal'[^}]*\}/, 'the fold id carries the surface');
    assert.match(card, /panelSectionOpen\(prefs, 'contact_info', false\)/, 'one shared preference, collapsed by default');
  });
});

describe('behaviour', () => {
  test('toggleDetailBlock flips the state, hides the body and persists; openDetailBlock only opens', () => {
    for (const fn of ['toggleDetailBlock', 'openDetailBlock', 'loadPanelSections', 'savePanelSection', 'readPanelSections', 'panelSectionOpen', 'detailBlockHead']) {
      assert.match(modals, new RegExp(`^function ${fn}\\(`, 'm'), fn);
    }
    const tog = sliceFn(modals, 'toggleDetailBlock', 'modals.js');
    for (const s of ["getAttribute('aria-expanded')", "setAttribute('aria-expanded'", "getAttribute('aria-controls')", "classList.toggle('hidden'", 'savePanelSection(', 'closest(\'[data-section]\')']) assert.ok(tog.includes(s), s);
    const open = sliceFn(modals, 'openDetailBlock', 'modals.js');
    assert.match(open, /aria-expanded/); assert.match(open, /classList\.remove\('hidden'\)/);
    assert.equal(open.includes('savePanelSection('), false, 'auto-expanding does not overwrite the preference');
    assert.match(sliceFn(modals, 'toggleContactNoteForm', 'modals.js'), /openDetailBlock\('notes'\)/);
    assert.match(sliceFn(modals, 'refreshContactTasks', 'modals.js'), /openDetailBlock\('tasks'\)/);
    assert.match(sliceFn(modals, 'loadPanelSections', 'modals.js'), /localStorage\.getItem\('contactPanelSections'\)/);
    assert.match(sliceFn(modals, 'savePanelSection', 'modals.js'), /localStorage\.setItem\('contactPanelSections'/);
  });
  test('readPanelSections / panelSectionOpen are pure and forgiving', () => {
    const F = loadFns('public/js/modals.js', ['readPanelSections', 'panelSectionOpen']);
    assert.deepEqual(F.readPanelSections('{"deals":false,"tasks":true}'), { deals: false, tasks: true });
    assert.deepEqual(F.readPanelSections('not json'), {});
    assert.deepEqual(F.readPanelSections(null), {});
    assert.deepEqual(F.readPanelSections('[1,2]'), {});
    const prefs = F.readPanelSections('{"deals":false,"notes":"yes"}');
    assert.equal(F.panelSectionOpen(prefs, 'deals', true), false, 'a stored false wins over an open default');
    assert.equal(F.panelSectionOpen(prefs, 'tasks', true), true, 'missing → fallback');
    assert.equal(F.panelSectionOpen(prefs, 'tasks', false), false);
    assert.equal(F.panelSectionOpen(prefs, 'notes', true), true, 'a non-boolean is ignored');
  });
  test('keys exist in both dictionaries', () => {
    for (const k of ['sec_contact_info', 'toggle_section']) assert.ok(k in dict.en && k in dict.de, k);
  });
});

describe('stylesheet', () => {
  test('toggle, rotated chevron, body, touch height, reduced motion', () => {
    for (const r of ['.detail-block-toggle {', '.detail-block-toggle .ic {', '.detail-block-toggle[aria-expanded="false"] .ic {', '.detail-block-body {', '.contact-card-details-toggle {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\.detail-block-toggle\[aria-expanded="false"\] \.ic \{[^}]*rotate\(-90deg\)/);
    assert.match(css, /\.detail-block-toggle:focus-visible \{[^}]*var\(--shadow-focus\)/);
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    assert.match(coarse, /\.detail-block-toggle[^{]*\{[^}]*min-height: 36px/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.detail-block-toggle \.ic \{ transition: none; \}/);
    assert.equal(css.includes('\n.detail-block > .contact-timeline'), false, 'child rules moved to the body');
    assert.ok(css.includes('\n.detail-block-body > .contact-timeline'));
  });
});
