// UI wiring for the Onboarding Engine: static checks on the shipped files, plus
// a jsdom check of the badge when jsdom is installed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { JSDOM, skipOpts } = require('../helpers/dom');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('public/index.html'), core = read('public/js/core.js'), contacts = read('public/js/contacts.js'), modals = read('public/js/modals.js'), intg = read('public/js/integrations.js');
const STATUSES = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];

// Pull the two dictionaries out of core.js by evaluating the object literal.
function dictionaries() {
  const m = /const I18N\s*=\s*(\{[\s\S]*?\n\});/.exec(core) || /(\{\s*\n\s*en:\s*\{[\s\S]*?\n\s*\}\s*,\s*\n\s*de:\s*\{[\s\S]*?\n\s*\}\s*\n\})/.exec(core);
  assert.ok(m, 'could not locate the i18n object in core.js');
  return new Function('return ' + m[1])();
}

describe('integrations page markup', () => {
  test('both cards exist with the ids the client uses', () => {
    for (const id of ['eng-webhook-card', 'eng-active', 'eng-url', 'eng-description', 'eng-events', 'eng-secret-display', 'eng-rotate-btn', 'eng-secret-reveal', 'eng-secret-value', 'eng-save-btn', 'eng-test-btn', 'eng-msg', 'eng-deliveries', 'eng-keys-card', 'eng-key-name', 'eng-create-key-btn', 'eng-key-reveal', 'eng-key-value', 'eng-keys', 'eng-owner-hint']) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
  });
  test('every data-i18n key used by the cards exists in BOTH dictionaries', () => {
    const { en, de } = dictionaries();
    const section = html.slice(html.indexOf('id="eng-webhook-card"'), html.indexOf('id="eng-keys"') + 20);
    const used = [...section.matchAll(/data-i18n(?:-ph)?="([a-z_]+)"/g)].map(m => m[1]);
    assert.ok(used.length > 15, `found ${used.length} keys`);
    for (const k of new Set(used)) { assert.ok(en[k], `en.${k}`); assert.ok(de[k], `de.${k}`); }
  });
  test('the client defines every eng* handler the markup calls', () => {
    for (const fn of [...new Set([...html.matchAll(/onclick="(eng[A-Za-z]+)\(/g)].map(m => m[1]))]) assert.match(intg, new RegExp(`function ${fn}\\(`), fn);
    assert.match(intg, /loadEngineSettings\(\);/);
  });
});

describe('contacts: badge and trigger', () => {
  test('the seven status labels are German in both dictionaries', () => {
    const { en, de } = dictionaries();
    const expected = { kein_onboarding: 'Kein Onboarding', formular_versendet: 'Formular versendet', formular_ausgefuellt: 'Formular ausgefüllt', termin_gebucht: 'Termin gebucht', call_erfolgt: 'Call erfolgt', briefing_fertig: 'Briefing fertig', onboarding_abgeschlossen: 'Onboarding abgeschlossen' };
    for (const s of STATUSES) { assert.equal(en[`onb_${s}`], expected[s]); assert.equal(de[`onb_${s}`], expected[s]); }
  });
  test('contacts.js defines the badge, the meta for exactly the seven statuses, the optional column and startOnboarding', () => {
    assert.match(contacts, /function onboardingBadge\(/); assert.match(contacts, /async function startOnboarding\(/);
    const meta = /const ONBOARDING_STATUS_META = \{([\s\S]*?)\n\};/.exec(contacts)[1];
    assert.deepEqual([...meta.matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]), STATUSES);
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
    w.api = {}; w.stages = []; w.fields = [];
    const start = contacts.indexOf('const ONBOARDING_STATUS_META'); const end = contacts.indexOf('async function startOnboarding');
    w.eval(contacts.slice(start, end) + '\nwindow.__badge = onboardingBadge;');
    assert.match(w.__badge('termin_gebucht'), /stage-badge-dot" style="background:#8b5cf6"><\/span>Termin gebucht</);
    assert.match(w.__badge(undefined), /Kein Onboarding/);
    assert.match(w.__badge('<img>'), /Kein Onboarding/);
  });
});
