// CLIENT tests for the manual status picker: the select markup (pure) and
// where it is used — contact detail, deal contact panel, Onboarding page —
// plus the change handler's endpoint and per-context refresh.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, sliceConst, read, sliceFn } = require('../helpers/client-fn');
const { ONBOARDING_STATUSES } = require('../helpers/schema-constants');

const F = loadFns('public/js/contacts.js', ['onboardingStatusSelect', 'onboardingLabel'],
  { extra: sliceConst('public/js/contacts.js', 'ONBOARDING_STATUS_META') + "\nfunction t(k) { return k; }\nfunction esc(s) { return String(s ?? '').replace(/</g, '&lt;'); }" });

describe('onboardingStatusSelect', () => {
  test('seven options in process order, the current one selected, change handler carries id and context', () => {
    const html = F.onboardingStatusSelect(60, 'termin_gebucht', 'deal');
    assert.deepEqual([...html.matchAll(/<option value="([a-z_]+)"/g)].map(m => m[1]), ONBOARDING_STATUSES);
    assert.match(html, /<option value="termin_gebucht" selected>onb_termin_gebucht</);
    assert.equal((html.match(/ selected/g) || []).length, 1);
    assert.match(html, /onchange="changeOnboardingStatus\(60, this\.value, 'deal'\)"/);
    assert.match(html, /class="onb-status-select"/);
  });
  test('an unknown status selects nothing rather than throwing', () => {
    const html = F.onboardingStatusSelect(1, 'bogus', 'detail');
    assert.equal((html.match(/ selected/g) || []).length, 0);
  });
});

describe('wiring', () => {
  const modals = read('public/js/modals.js'), contacts = read('public/js/contacts.js');
  test('shown next to the badge in the contact detail, the deal contact panel and the Onboarding page', () => {
    assert.match(sliceFn(modals, 'buildDetailHTML', 'modals.js'), /onboardingBadge\(c\.onboarding_status\) \+ onboardingStatusSelect\(id, c\.onboarding_status, 'detail'\)/);
    assert.match(sliceFn(modals, 'renderContactPanelReadOnly', 'modals.js'), /onboardingBadge\(full\.onboarding_status\) \+ onboardingStatusSelect\(full\.id, full\.onboarding_status, 'deal'\)/);
    assert.match(sliceFn(read('public/js/onboarding.js'), 'renderOnboarding', 'onboarding.js'), /onboardingStatusSelect\(r\.id, r\.onboarding_status, 'page'\)/);
  });
  test('changeOnboardingStatus PATCHes the scoped endpoint and refreshes per context', () => {
    const fn = sliceFn(contacts, 'changeOnboardingStatus', 'contacts.js');
    assert.match(fn, /api\.patch\(`\/api\/contacts\/\$\{id\}\/onboarding-status`, \{ onboarding_status: status \}\)/);
    assert.match(fn, /invalidate\(\)/);
    assert.match(fn, /ctx === 'deal'\)\s+await renderContactPanelReadOnly\(\{ id \}\)/);
    assert.match(fn, /ctx === 'page'\)\s+await loadOnboarding\(\)/);
    assert.match(fn, /await openDetail\(id\)/);
  });
});
