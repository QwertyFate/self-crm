// CLIENT (static) tests for the Contact column of the deal view: it renders
// the shared record card (avatar + name + company, owner pill, email / phone
// with WhatsApp, the "Contact information" fold) with the deal surface.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const css = read('public/style.css');
const html = read('public/index.html');
const modals = read('public/js/modals.js');
const panel = sliceFn(modals, 'renderContactPanelReadOnly', 'modals.js');
const edit  = sliceFn(modals, 'editContactPanel', 'modals.js');

describe('renderContactPanelReadOnly', () => {
  test('renders the shared record card with the deal surface; the card has the bands', () => {
    assert.ok(panel.includes("contactDetailCardHtml(full, full.id, { surface: 'deal' })"), 'delegates to the shared card');
    assert.ok(panel.includes('contact-card-empty'));
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    for (const s of ['contact-card-head', 'contact-card-avatar', 'initials(c.name)', 'contact-card-name', 'contact-card-company',
                     'contact-card-channels', 'UI_ICON.mail', 'UI_ICON.call', 'contact-channel-action', 'owner-pill',
                     'contact-card-list', 'contact-card-row']) {
      assert.ok(card.includes(s), s);
    }
    assert.equal(panel.includes('contact-panel-rows'), false);
    assert.equal(panel.includes('contact-panel-header'), false);
  });
  test('no onboarding or Drive bands on this branch', () => {
    for (const s of ['onboardingBadge', 'onboardingStatusSelect', 'driveSectionHtml', 'loadDriveFiles', 'contact-card-onboarding', 'contact-card-drive']) {
      assert.equal(panel.includes(s), false, s);
    }
  });
  test('company, email and phone have their own bands on the shared card; the column builds none of its own', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    assert.match(card, /href="mailto:\$\{esc\(c\.email\)\}"/);
    assert.match(card, /waLink\(c\.phone, c\)/);
    assert.equal(panel.includes('effectiveContactColumns('), false);
    assert.equal(panel.includes('waLink('), false);
  });
  test('edit mode uses the same card', () => {
    for (const s of ['contact-card-head', 'contact-card-form', 'contact-card-foot', "t('edit_contact_title')"]) assert.ok(edit.includes(s), s);
    assert.equal(edit.includes('contact-panel-form'), false);
  });
  test('the initial empty state in the markup is the empty card', () => {
    assert.match(html, /<div id="deal-contact-panel" class="contact-panel">\s*<div class="contact-card contact-card-empty" data-i18n="deal_no_contact_hint">/);
  });
});

describe('stylesheet', () => {
  test('card rules exist, the old row rules are gone, the column is wider', () => {
    for (const r of ['.contact-card {', '.contact-card-head {', '.contact-card-avatar {', '.contact-card-channels {', '.contact-channel {',
                     '.contact-card-list {', '.contact-card-row {', '.contact-card-empty {', '.contact-card-form {', '.contact-card-foot {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\.contact-card-row \{[^}]*grid-template-columns: 120px minmax\(0, 1fr\)/);
    assert.equal(/\.contact-card-onboarding|\.contact-card-drive|\.onb-status-control/.test(css), false, 'no onboarding / Drive card rules');
    assert.match(css, /\.deal-modal-columns \{[^}]*minmax\(360px, 1\.1fr\)/);
    assert.doesNotMatch(css, /\.contact-panel-row label \{ flex: 0 0 38%/);
    assert.doesNotMatch(css, /^\.contact-panel-rows \{/m);
    assert.match(css, /\.contact-panel-section-label \{[^}]*text-transform: none/);
  });
});
