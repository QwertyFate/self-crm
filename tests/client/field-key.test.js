// CLIENT (pure, no jsdom) tests pinning the two field-key slugifiers: the
// admin console's generateFieldKey (private/admin.html) and the app's
// toFieldKey (public/js/admin-import.js). They disagree on punctuation; this
// file records that fact so a change on either side is noticed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, read } = require('../helpers/client-fn');

const admin = loadFns('private/admin.html', ['generateFieldKey']);
const app   = loadFns('public/js/admin-import.js', ['toFieldKey']);

describe('generateFieldKey (admin console) vs toFieldKey (app)', () => {
  test('agree on plain words, digits and surrounding whitespace', () => {
    for (const [input, want] of [['Budget 2026', 'budget_2026'], ['  Firma  ', 'firma'], ['Kunden Nummer', 'kunden_nummer']]) {
      assert.equal(admin.generateFieldKey(input), want, `admin ${input}`);
      assert.equal(app.toFieldKey(input), want, `app ${input}`);
    }
  });
  test('agree on punctuation too: runs of non-alphanumerics become one underscore in both', () => {
    for (const [input, want] of [['Ust-ID', 'ust_id'], ['E-Mail', 'e_mail'], ['Straße', 'stra_e'], ['a--b__c', 'a_b_c'], ['(Preis)', 'preis']]) {
      assert.equal(admin.generateFieldKey(input), want, `admin ${input}`);
      assert.equal(app.toFieldKey(input), want, `app ${input}`);
    }
  });
});

test('every slugifier — app (settings.js ×4, objects.js ×1, admin-import.js ×1) and admin console (×1) — uses the same rule', () => {
  const rule = /\.replace\(\/\[\^a-z0-9\]\+\/g,\s*'_'\)/g;
  assert.equal((read('public/js/settings.js').match(rule) || []).length, 4, 'settings.js');
  assert.equal((read('public/js/objects.js').match(rule) || []).length, 1, 'objects.js');
  assert.equal((read('public/js/admin-import.js').match(rule) || []).length, 1, 'admin-import.js (toFieldKey itself)');
  assert.equal((read('private/admin.html').match(rule) || []).length, 1, 'admin.html (generateFieldKey)');
  assert.doesNotMatch(read('private/admin.html'), /\[\^a-z0-9\\s\]/, 'the old delete-punctuation rule is gone');
});
