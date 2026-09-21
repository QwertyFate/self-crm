// CLIENT (static) tests for starting onboarding from the deal editor: the
// header button, its visibility toggle, the shared confirm/POST helper, and
// the stage badge in the deal's contact panel.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const html     = read('public/index.html');
const modals   = read('public/js/modals.js');
const contacts = read('public/js/contacts.js');

describe('deal modal', () => {
  test('the header has a hidden-by-default Start Onboarding button next to the Task button', () => {
    const header = html.slice(html.indexOf('id="deal-modal-title"'), html.indexOf('id="deal-add-task-btn"'));
    assert.match(header, /<button type="button" class="btn btn-sm" id="deal-onboarding-btn" onclick="startOnboardingFromDeal\(\)" style="display:none" data-i18n="btn_start_onboarding">/);
  });
  test('openDealModal shows it only for an existing deal (same toggle as the Task button)', () => {
    const open = sliceFn(modals, 'openDealModal', 'modals.js');
    assert.match(open, /getElementById\('deal-onboarding-btn'\)[\s\S]{0,80}style\.display = id \? '' : 'none'/);
  });
  test('startOnboardingFromDeal reads the live contact select, refuses without a contact, and delegates to the shared helper', () => {
    const fn = sliceFn(modals, 'startOnboardingFromDeal', 'modals.js');
    assert.match(fn, /getElementById\('df-contact'\)\.value/);
    assert.match(fn, /alert\(t\('onb_link_contact_first'\)\)/);
    assert.match(fn, /requestOnboardingStart\(contactId, /);
    assert.match(fn, /renderContactPanelReadOnly\(\{ id: contactId \}\)/, 'panel re-rendered so the badge updates; the modal stays open');
    assert.doesNotMatch(fn, /closeModal\('deal-modal'\)/);
  });
  test("the deal's contact panel shows the onboarding badge", () => {
    assert.match(sliceFn(modals, 'renderContactPanelReadOnly', 'modals.js'), /onboardingBadge\(full\.onboarding_status\)/);
  });
});

describe('shared helper in contacts.js', () => {
  test('startOnboarding delegates; the POST literal lives exactly once, inside requestOnboardingStart', () => {
    assert.match(sliceFn(contacts, 'startOnboarding', 'contacts.js'), /await requestOnboardingStart\(id, currentStatus\)/);
    const helper = sliceFn(contacts, 'requestOnboardingStart', 'contacts.js');
    assert.match(helper, /api\.post\(`\/api\/contacts\/\$\{id\}\/onboarding\/start`, \{\}\)/);
    assert.match(helper, /invalidate\(\)/);
    assert.equal((contacts.match(/onboarding\/start/g) || []).length, 1);
  });
  test('after a start from the Onboarding page, that page is reloaded instead of the contacts table', () => {
    assert.match(sliceFn(contacts, 'startOnboarding', 'contacts.js'), /page === 'onboarding'\) await loadOnboarding\(\); else await loadContacts\(\);/);
  });
});
