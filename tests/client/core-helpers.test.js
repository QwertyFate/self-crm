// CLIENT (pure, no jsdom) tests for helpers in public/js/core.js:
// pagination, the WhatsApp link builder, the HTML escaper and date formatting.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns } = require('../helpers/client-fn');

const F = loadFns('public/js/core.js', ['buildPageNumbers', 'waLink', 'esc', 'fmtDate'], { state: { currentWorkspace: null } });
beforeEach(() => F.__set('currentWorkspace', null));
const GAP = '…';

describe('buildPageNumbers', () => {
  test('seven pages or fewer -> every page', () => {
    assert.deepEqual(F.buildPageNumbers(1, 7), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(F.buildPageNumbers(1, 0), []);
  });
  test('windows around the current page with a single-character ellipsis', () => {
    assert.deepEqual(F.buildPageNumbers(1, 10),  [1, 2, GAP, 10]);
    assert.deepEqual(F.buildPageNumbers(3, 10),  [1, 2, 3, 4, GAP, 10], 'no leading gap while page 2 is adjacent');
    assert.deepEqual(F.buildPageNumbers(5, 10),  [1, GAP, 4, 5, 6, GAP, 10]);
    assert.deepEqual(F.buildPageNumbers(8, 10),  [1, GAP, 7, 8, 9, 10], 'no trailing gap while page 9 is adjacent');
    assert.deepEqual(F.buildPageNumbers(10, 10), [1, GAP, 9, 10]);
  });
});

describe('waLink', () => {
  test('no phone or fewer than six digits -> null', () => {
    assert.equal(F.waLink(null), null);
    assert.equal(F.waLink(''), null);
    assert.equal(F.waLink('+49 12', {}), null);
  });
  test('digits only in the URL; default template addresses the contact by name', () => {
    assert.equal(F.waLink('+49 (0)151-23 45', { name: 'Erika' }), 'https://wa.me/4901512345?text=Hi%20Erika%2C%20');
    assert.equal(F.waLink('015123456', 'Bob'), 'https://wa.me/015123456?text=Hi%20Bob%2C%20', 'a plain string is the name');
    assert.equal(F.waLink('015123456'), 'https://wa.me/015123456?text=Hi%20%2C%20', 'no contact -> empty name');
  });
  test('the workspace template replaces {{name}} and {{company}}', () => {
    F.__set('currentWorkspace', { whatsapp_template: 'Hallo {{name}} von {{company}}!' });
    assert.equal(F.waLink('+49151234', { name: 'E', company: 'M GmbH' }), 'https://wa.me/49151234?text=Hallo%20E%20von%20M%20GmbH!');
    assert.equal(F.waLink('+49151234', 'E'), 'https://wa.me/49151234?text=Hallo%20E%20von%20!', 'string contact has no company');
  });
});

describe('esc', () => {
  test('escapes & < > " (not the single quote — pinned), null -> empty, numbers stringified', () => {
    assert.equal(F.esc(`<a href="x">&'`), `&lt;a href=&quot;x&quot;&gt;&amp;'`);
    assert.equal(F.esc(null), '');
    assert.equal(F.esc(undefined), '');
    assert.equal(F.esc(5), '5');
  });
});

describe('fmtDate', () => {
  test('falsy -> empty; otherwise "Mon D, YYYY" in en-US', () => {
    assert.equal(F.fmtDate(''), '');
    assert.equal(F.fmtDate(null), '');
    assert.equal(F.fmtDate('2026-03-05T12:00:00'), 'Mar 5, 2026');   // local noon: no UTC-midnight day shift
  });
});
