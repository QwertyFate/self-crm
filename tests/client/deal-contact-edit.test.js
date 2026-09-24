// CLIENT (static + render) tests: the deal view's Contact column is the same
// click-to-edit record card as the side panel — one markup, one editor, one
// owner pill, one fold — rendered with `surface: 'deal'`, which only changes
// the ⋯ menu (its own "Edit all fields" form, no Delete) and the fold's id.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const modals = read('public/js/modals.js');
const core = read('public/js/core.js');

describe('one card for both surfaces', () => {
  test('the deal column renders the shared record card and remembers which contact it shows', () => {
    const panel = sliceFn(modals, 'renderContactPanelReadOnly', 'modals.js');
    for (const s of ["contactDetailCardHtml(full, full.id, { surface: 'deal' })", 'dataset.contactId', 'ensureMembers()', 'contact-card-empty', "t('loading')"]) {
      assert.ok(panel.includes(s), s);
    }
    for (const s of ['effectiveContactColumns(', 'editContactPanel(${full.id})', 'contact-card-channels', 'contact-card-row']) {
      assert.equal(panel.includes(s), false, `${s} is no longer built here`);
    }
  });
  test('the card takes a surface: the menu call and the fold id carry it', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    assert.match(card, /^function contactDetailCardHtml\(c, id, opts = \{\}\)/);
    assert.match(card, /const surface = opts\.surface \|\| 'panel'/);
    assert.match(card, /openContactDetailMenu\(event, \$\{id\}, '\$\{surface\}'\)/);
    assert.match(card, /contact-section-contact-info\$\{[^}]*surface === 'deal'[^}]*\}/);
  });
  test('the menu: Edit all fields on both surfaces, Delete contact only in the panel', () => {
    const menu = sliceFn(modals, 'openContactDetailMenu', 'modals.js');
    assert.match(menu, /^function openContactDetailMenu\(e, id, surface = 'panel'\)/);
    assert.match(menu, /surface === 'deal'[\s\S]*editContactPanel\(\$\{id\}\)/);
    assert.match(menu, /editContactDetail\(\$\{id\}\)/);
    assert.match(menu, /deleteContact\(\$\{id\}\)/);
    const dealBranch = menu.slice(menu.indexOf("surface === 'deal'"), menu.indexOf('editContactDetail('));
    assert.equal(dealBranch.includes('deleteContact('), false, 'no delete from the deal view');
  });
  test('a save re-renders the deal column when it shows that contact', () => {
    const refresh = sliceFn(modals, 'refreshContactDetailCard', 'modals.js');
    assert.match(refresh, /getElementById\('deal-contact-panel'\)/);
    assert.match(refresh, /Number\(dealPanel\.dataset\.contactId\) === id/);
    assert.match(refresh, /contactDetailCardHtml\(fresh, id, \{ surface: 'deal' \}\)/);
  });
});

describe('rendered card (real template, stubbed globals)', () => {
  const extra = [
    sliceConst('public/js/core.js', 'TRANSLATIONS'),
    sliceConst('public/js/core.js', 'UI_ICON'),
    "const WA_SVG = '<svg class=\"wa\"></svg>';",
    "const localStorage = { getItem: () => null, setItem() {} };",
    sliceFn(core, 't', 'core.js'), sliceFn(core, 'esc', 'core.js'), sliceFn(core, 'waLink', 'core.js'), sliceFn(core, 'fmtDate', 'core.js'),
    sliceFn(read('public/js/deals.js'), 'initials', 'deals.js'),
    sliceFn(modals, 'readPanelSections', 'modals.js'), sliceFn(modals, 'panelSectionOpen', 'modals.js'), sliceFn(modals, 'loadPanelSections', 'modals.js'),
  ].join('\n');
  const state = { members: [{ id: 3, name: 'Zoe Quinn' }], fields: [{ field_key: 'k', name: 'K', type: 'text' }], currentLang: 'en', currentWorkspace: null };
  const contact = { id: 7, name: 'Anna Weber', company: 'Acme', email: 'a@x.de', phone: '+49 151 1234567', assigned_to: 3, assigned_to_name: 'Zoe Quinn', custom_data: { k: 'v' }, created_at: '2026-01-02' };

  test('the deal surface: same editors and owner pill, its own fold id, the deal menu', () => {
    const F = loadFns('public/js/modals.js', ['contactDetailCardHtml'], { state, extra });
    const html = F.contactDetailCardHtml(contact, 7, { surface: 'deal' });
    for (const s of ['id="contact-section-contact-info-deal"', 'aria-controls="contact-section-contact-info-deal"', "openContactDetailMenu(event, 7, 'deal')",
                     "saveContactField(7, 'assigned_to', this.value)", "startContactFieldEdit(this, 7, 'email', 'email')", "startContactFieldEdit(this, 7, 'name', 'text')",
                     "startContactFieldEdit(this, 7, 'k', 'text')", 'owner-pill-avatar" aria-hidden="true">ZQ<', 'mailto:a@x.de', 'aria-expanded="false"']) {
      assert.ok(html.includes(s), s);
    }
    assert.equal(html.includes('contact-section-contact-info"'), false, 'the panel id is not reused');
  });
  test('the panel surface keeps its id and menu', () => {
    const F = loadFns('public/js/modals.js', ['contactDetailCardHtml'], { state, extra });
    const html = F.contactDetailCardHtml(contact, 7);
    assert.ok(html.includes('id="contact-section-contact-info"'));
    assert.ok(html.includes("openContactDetailMenu(event, 7, 'panel')"));
    assert.equal(html.includes('contact-info-deal'), false);
  });
});
