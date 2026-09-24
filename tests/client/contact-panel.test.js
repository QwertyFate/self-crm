// CLIENT (static) tests for the contact side panel rework: one identity card
// (who · reach · create · status · details) edited in place, then Deals,
// Notes (the deal modal's form) and Files — in that order, in both languages.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const modals = read('public/js/modals.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const GLYPH = /📅|🔗|✕/;

describe('buildDetailHTML: the record in order', () => {
  const body = sliceFn(modals, 'buildDetailHTML', 'modals.js');
  test('identity card first, then deals, tasks, notes; no Files block on this branch', () => {
    for (const s of ['id="contact-detail-card"', 'contactDetailCardHtml(', 'contact-activity-type-seg', 'sr-only', "t('detail_log_ph')", '<kbd', 'renderDealTimeline(c.activities, false)', 'id="contact-show-all-btn"',
                     'openDealModalForContact(', 'openTaskModalForContact(']) {
      assert.ok(body.includes(s), s);
    }
    const order = ['contact-detail-card', 'contact-deals-list', 'contact-tasks-list', 'contact-note-form-wrapper'].map(s => body.indexOf(s));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `order: ${order.join(',')}`);
    for (const s of ['driveSectionHtml', 'contact-card-drive', 'sec_files']) assert.equal(body.includes(s), false, s);
  });
  test('no footer action row, no inline styles, no glyphs, no hard-coded English', () => {
    for (const s of ['detail-grid', 'detail-actions', 'style="', '+ Add Deal', '+ Add Task', 'Show All', '+ Add Note']) assert.equal(body.includes(s), false, s);
    assert.doesNotMatch(body, GLYPH);
  });
});

describe('contactDetailCardHtml: who · owner · reach · create · details', () => {
  const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
  test('bands and their functions', () => {
    for (const s of ['initials(c.name)', 'contact-card-channels', 'UI_ICON.mail', 'UI_ICON.call', 'waLink(c.phone, c)',
                     'openContactDetailMenu(event', 'fields.map(', 'muted-dash', 'fmtDate(c.created_at)']) {
      assert.ok(card.includes(s), s);
    }
    for (const s of ['onboardingBadge', 'onboardingStatusSelect', 'startOnboarding(', 'updateContactStage(',
                     'contact-card-actions', 'openDealModalForContact(', 'openTaskModalForContact(']) assert.equal(card.includes(s), false, s);
    assert.equal(card.includes('editContactDetail('), false, 'no Edit button in the head: values edit in place (contact-record-edit.test.js)');
    assert.equal(card.includes('style="'), false, 'no inline styles (contacts have no stage, so no stage dot either)');
    assert.doesNotMatch(card, GLYPH);
  });
});

describe('editing in place', () => {
  test('edit / save / cancel / menu exist and target the card node', () => {
    for (const fn of ['editContactDetail', 'saveContactDetail', 'cancelContactDetailEdit', 'openContactDetailMenu']) assert.match(modals, new RegExp(`^(async )?function ${fn}\\(`, 'm'), fn);
    const edit = sliceFn(modals, 'editContactDetail', 'modals.js');
    assert.match(edit, /getElementById\('contact-detail-card'\)/);
    assert.match(edit, /renderFieldInput\(/, 'custom fields use the typed inputs');
    const save = sliceFn(modals, 'saveContactDetail', 'modals.js');
    assert.match(save, /api\.put\(`\/api\/contacts\/\$\{/);
    assert.match(save, /name_required/);
    assert.match(save, /refreshContactDetailCard\(/, 'save re-renders the card in place');
    assert.match(sliceFn(modals, 'refreshContactDetailCard', 'modals.js'), /filterContacts\(\)/, 'the table row refreshes');
    const menu = sliceFn(modals, 'openContactDetailMenu', 'modals.js');
    assert.match(menu, /openPopoverMenu\(/);
    assert.match(menu, /editContactDetail\(/, 'Edit all fields lives in the menu');
    assert.match(menu, /edit_all_fields/);
    assert.match(menu, /deleteContact\(/);
  });
  test('openDetail wires the type segment and loads no Drive files; delete confirms via t()', () => {
    const open = sliceFn(modals, 'openDetail', 'modals.js');
    assert.equal(open.includes('loadDriveFiles'), false);
    assert.match(open, /renderSegFromSelect\('contact-activity-type-seg', 'contact-activity-type'/);
    assert.match(sliceFn(modals, 'deleteContact', 'modals.js'), /confirm\(t\('confirm_delete_contact'\)\)/);
    const dealsList = sliceFn(modals, 'renderContactDeals', 'modals.js');
    assert.equal(dealsList.includes('style="width:7px'), false);
    assert.match(dealsList, /stage-badge-dot/);
    assert.match(dealsList, /fmtMoney\(/);
  });
  test('keys exist in both dictionaries', () => {
    for (const k of ['sec_deals', 'sec_tasks', 'no_tasks_hint', 'sec_contact_info', 'toggle_section', 'lbl_added', 'contact_menu', 'no_deals_hint', 'btn_add_note', 'btn_show_all', 'sec_notes', 'detail_log_ph', 'btn_log', 'confirm_delete_contact', 'delete_contact', 'add_deal', 'btn_add_task', 'edit_contact_title', 'name_required']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
  });
});

describe('markup and stylesheet', () => {
  test('the detail modal shares the panel bed; the panel bed and the card bands are styled', () => {
    assert.match(html, /<div id="detail-body" class="side-panel-body">/);
    for (const r of ['.side-panel-body {', '.contact-task-row {', '.detail-block-head {', '.detail-block-toggle {', '.detail-block-count {', '.contact-card-row select {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.equal(css.includes('.contact-card-actions'), false, 'the card has no action band');
    assert.equal(css.includes('.contact-card-stageline'), false, 'contacts have no stage line');
    assert.match(css, /\n\.side-panel-body \{[^}]*var\(--canvas\)/);
    assert.ok(css.includes('\n.detail-section h3 {'), 'objects.js still uses the detail grid');
    assert.equal(css.includes('.wa-detail-link'), false, 'the old WhatsApp text link is gone');
  });
});
