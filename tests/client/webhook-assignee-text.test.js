// CLIENT: the lead webhook's "Standard-Zuständigkeit" says what happens when none is set.
//
// WHY. The empty choice read "Nicht gesetzt (dir selbst zugewiesen)" / "Not set (assigned to yourself)", but a lead
// from the webhook with no default assignee gets nobody (routes/integrations.js: wh.default_assignee_id || null);
// there is no "you" behind a webhook. The German also used "dir", where the app speaks impersonally. Found in the full
// review of 2026-10-22 (LOGIN_LANDING_CHANGES Part 44).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst } = require('../helpers/client-fn');

const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const html = read('public/index.html');

describe('the webhook\'s empty default-assignee choice', () => {
  test('the server leaves such a lead unassigned', () => {
    assert.match(read('routes/integrations.js'), /const defaultAssigneeId = wh\.default_assignee_id \|\| null;/);
  });
  test('the words say nobody is assigned, in both languages, impersonal in German', () => {
    assert.match(dict.de.opt_assignee_self, /^Niemand\b/);
    assert.match(dict.en.opt_assignee_self, /^Nobody\b/);
    assert.doesNotMatch(dict.de.opt_assignee_self + dict.en.opt_assignee_self, /zugewiesen\)|yourself|\bdir\b|\bdu\b/i);
  });
  test('index.html\'s built-in text is the English one', () => {
    assert.match(html, new RegExp(`<option value="" data-i18n="opt_assignee_self">${dict.en.opt_assignee_self.replace(/[()]/g, '\\$&')}</option>`));
  });
});
