// CLIENT tests for the Onboarding page: the pure helpers in
// public/js/onboarding.js (no DOM) and the static wiring — nav item, page
// section, script order, page switch and language re-render.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, sliceConst, read } = require('../helpers/client-fn');
const { ONBOARDING_STATUSES } = require('../helpers/schema-constants');

const F = loadFns('public/js/onboarding.js', ['onboardingSteps', 'onboardingProgress', 'filterOnboardingRows', 'onboardingCounts'],
  { extra: sliceConst('public/js/contacts.js', 'ONBOARDING_STATUS_META') });
const ACTIVE = ONBOARDING_STATUSES.filter(s => s !== 'kein_onboarding');

const ROWS = [
  { id: 1, name: 'Erika Muster', company: 'Muster GmbH', email: 'erika@x.de', onboarding_status: 'termin_gebucht',           updated_at: '2026-09-10T10:00:00Z' },
  { id: 2, name: 'Max Beispiel', company: null,          email: null,         onboarding_status: 'formular_versendet',       updated_at: '2026-09-15T10:00:00Z' },
  { id: 3, name: 'Nobody',       company: 'Idle AG',     email: 'n@x.de',     onboarding_status: 'kein_onboarding',          updated_at: '2026-09-20T10:00:00Z' },
  { id: 4, name: 'Done Co',      company: 'Done Co',     email: 'd@x.de',     onboarding_status: 'onboarding_abgeschlossen', updated_at: '2026-09-01T10:00:00Z' },
  { id: 5, name: 'Odd',          company: 'Odd',         email: 'o@x.de',     onboarding_status: 'constructor',              updated_at: '2026-09-21T10:00:00Z' },
];

describe('pure helpers', () => {
  test('onboardingSteps: the six active statuses in META order', () => {
    assert.deepEqual(F.onboardingSteps(), ACTIVE);
  });
  test('onboardingProgress: 0/6 for kein_onboarding or unknown, 1/6 first step, 6/6 completed', () => {
    assert.deepEqual(F.onboardingProgress('kein_onboarding'), { step: 0, total: 6, pct: 0 });
    assert.deepEqual(F.onboardingProgress('nope'), { step: 0, total: 6, pct: 0 });
    assert.deepEqual(F.onboardingProgress('formular_versendet'), { step: 1, total: 6, pct: 17 });
    assert.deepEqual(F.onboardingProgress('onboarding_abgeschlossen'), { step: 6, total: 6, pct: 100 });
  });
  test('filterOnboardingRows: drops kein_onboarding and unknown statuses, newest change first, input untouched', () => {
    const out = F.filterOnboardingRows(ROWS);
    assert.deepEqual(out.map(r => r.id), [2, 1, 4]);
    assert.deepEqual(ROWS.map(r => r.id), [1, 2, 3, 4, 5], 'not mutated');
  });
  test('filterOnboardingRows: status pill and case-insensitive search over name / company / email', () => {
    assert.deepEqual(F.filterOnboardingRows(ROWS, { status: 'termin_gebucht' }).map(r => r.id), [1]);
    assert.deepEqual(F.filterOnboardingRows(ROWS, { q: 'MUSTER' }).map(r => r.id), [1]);
    assert.deepEqual(F.filterOnboardingRows(ROWS, { q: 'd@x.de' }).map(r => r.id), [4]);
    assert.deepEqual(F.filterOnboardingRows(ROWS, { q: 'max' }).map(r => r.id), [2], 'null company/email do not throw');
    assert.deepEqual(F.filterOnboardingRows(ROWS, { status: 'call_erfolgt' }), []);
  });
  test('onboardingCounts: one key per active status plus all', () => {
    assert.deepEqual(F.onboardingCounts(ROWS), { all: 3, formular_versendet: 1, formular_ausgefuellt: 0, termin_gebucht: 1, call_erfolgt: 0, briefing_fertig: 0, onboarding_abgeschlossen: 1 });
  });
});

describe('wiring', () => {
  const html = read('public/index.html');
  test('sidebar item and page section exist with the ids the script uses', () => {
    assert.match(html, /<a href="#" data-page="onboarding">[\s\S]*?<span data-i18n="nav_onboarding">/);
    assert.match(html, /<section id="page-onboarding" class="page">/);
    for (const id of ['onb-count', 'onb-search', 'onb-pills', 'onb-table-wrap', 'onb-tbody', 'onb-empty']) assert.ok(html.includes(`id="${id}"`), id);
  });
  test('onboarding.js is loaded after contacts.js (it reuses its helpers)', () => {
    const a = html.indexOf('<script src="js/contacts.js">'), b = html.indexOf('<script src="js/onboarding.js">');
    assert.ok(a > 0 && b > a);
  });
  test('switchPage loads the page and setLanguage re-renders it', () => {
    assert.match(read('public/js/auth.js'), /if \(page === 'onboarding'\)\s+await loadOnboarding\(\);/);
    assert.match(read('public/js/core.js'), /if \(page === 'onboarding'\)\s+renderOnboarding\(\);/);
  });
});
