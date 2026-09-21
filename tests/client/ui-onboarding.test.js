// CLIENT (static + jsdom-optional) tests for the Onboarding Engine UI wiring:
// the shipped markup, the i18n dictionaries, and the badge helper.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { JSDOM, skipOpts } = require('../helpers/dom');
const { ONBOARDING_STATUSES } = require('../helpers/schema-constants');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('public/index.html'), core = read('public/js/core.js'), contacts = read('public/js/contacts.js'), modals = read('public/js/modals.js'), intg = read('public/js/integrations.js');

// Evaluate the TRANSLATIONS object literal out of core.js.
function dictionaries() {
  const m = /const TRANSLATIONS\s*=\s*(\{[\s\S]*?\n\});/.exec(core);
  assert.ok(m, 'could not locate `const TRANSLATIONS = {…};` in core.js');
  return new Function('return ' + m[1])();
}

const CARD_IDS = ['eng-webhook-card', 'eng-active', 'eng-url', 'eng-description', 'eng-events', 'eng-secret-display', 'eng-rotate-btn', 'eng-secret-reveal', 'eng-secret-value', 'eng-save-btn', 'eng-test-btn', 'eng-msg', 'eng-deliveries', 'eng-keys-card', 'eng-key-name', 'eng-create-key-btn', 'eng-key-reveal', 'eng-key-value', 'eng-keys', 'eng-owner-hint'];
const CARD_I18N = ['eng_webhook_title', 'eng_active', 'eng_webhook_hint', 'eng_owner_only', 'eng_url', 'eng_description', 'eng_events', 'eng_secret', 'eng_rotate', 'eng_shown_once', 'eng_copy', 'eng_save', 'eng_send_test', 'eng_deliveries', 'eng_refresh', 'eng_no_deliveries', 'eng_keys_title', 'eng_keys_hint', 'eng_key_name', 'eng_create_key', 'eng_no_keys'];
const HANDLERS  = ['engRotateSecret', 'engCopy', 'engSaveWebhook', 'engSendTest', 'engLoadDeliveries', 'engCreateKey'];

describe('integrations page markup', () => {
  test('both cards exist with the ids the client uses', () => {
    for (const id of CARD_IDS) assert.ok(html.includes(`id="${id}"`), id);
  });
  test('every data-i18n key the cards use exists in BOTH dictionaries', () => {
    const { en, de } = dictionaries();
    const start = html.indexOf('id="eng-webhook-card"');
    const section = html.slice(start, html.indexOf('</section>', start));   // both cards, up to the end of the Integrations page
    const used = [...new Set([...section.matchAll(/data-i18n(?:-ph)?="([a-z_]+)"/g)].map(m => m[1]))];
    for (const k of CARD_I18N) assert.ok(used.includes(k), `markup uses ${k}`);
    for (const k of used) { assert.ok(en[k], `en.${k}`); assert.ok(de[k], `de.${k}`); }
  });
  test('the client defines every eng* handler the markup calls', () => {
    const called = [...new Set([...html.matchAll(/onclick="(eng[A-Za-z]+)\(/g)].map(m => m[1]))];
    for (const fn of HANDLERS) assert.ok(called.includes(fn), `markup calls ${fn}`);
    for (const fn of called) assert.match(intg, new RegExp(`function ${fn}\\(`), `${fn} defined`);
    assert.match(intg, /loadEngineSettings\(\);/, 'loadIntegrations wires loadEngineSettings');
  });
});

describe('contacts: badge and trigger', () => {
  test('the seven status labels are German in both dictionaries', () => {
    const { en, de } = dictionaries();
    const expected = { kein_onboarding: 'Kein Onboarding', formular_versendet: 'Formular versendet', formular_ausgefuellt: 'Formular ausgefüllt', termin_gebucht: 'Termin gebucht', call_erfolgt: 'Call erfolgt', briefing_fertig: 'Briefing fertig', onboarding_abgeschlossen: 'Onboarding abgeschlossen' };
    for (const s of ONBOARDING_STATUSES) { assert.equal(en[`onb_${s}`], expected[s], `en ${s}`); assert.equal(de[`onb_${s}`], expected[s], `de ${s}`); }
  });
  test('contacts.js defines the badge, the meta for exactly the seven statuses, the optional column and startOnboarding', () => {
    assert.match(contacts, /function onboardingBadge\(/);
    assert.match(contacts, /async function startOnboarding\(/);
    const meta = /const ONBOARDING_STATUS_META = \{([\s\S]*?)\n\};/.exec(contacts);
    assert.ok(meta, 'ONBOARDING_STATUS_META found');
    assert.deepEqual([...meta[1].matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]), ONBOARDING_STATUSES);
    assert.match(contacts, /key: 'onboarding_status', label: \(\) => t\('col_onboarding'\)/);
    assert.match(contacts, /api\.post\(`\/api\/contacts\/\$\{id\}\/onboarding\/start`/);
  });
  test('the detail view shows the badge and the Start Onboarding button', () => {
    assert.match(modals, /onboardingBadge\(c\.onboarding_status\)/);
    assert.match(modals, /startOnboarding\(\$\{id\}/);
    assert.match(modals, /t\('btn_start_onboarding'\)/);
  });
});

describe('badge rendering (jsdom)', skipOpts, () => {
  test('onboardingBadge renders the German label with a colour dot; unknown falls back to kein_onboarding', () => {
    const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://localhost/' }).window;
    w.esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const { en } = dictionaries();
    w.t = k => en[k] || k;
    const start = contacts.indexOf('const ONBOARDING_STATUS_META'); const end = contacts.indexOf('async function startOnboarding');
    assert.ok(start > 0 && end > start, 'badge block located in contacts.js');
    w.eval(contacts.slice(start, end) + '\nwindow.__badge = onboardingBadge;');
    assert.match(w.__badge('termin_gebucht'), /stage-badge-dot" style="background:#8b5cf6"><\/span>Termin gebucht</);
    assert.match(w.__badge(undefined), /Kein Onboarding/);
    assert.match(w.__badge('<img>'), /Kein Onboarding/);
  });
});
