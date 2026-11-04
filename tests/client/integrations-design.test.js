// CLIENT (static) test for the Integrations page: the setup guide prints the webhook address escaped (2026-11-04: the
// page's look tests were removed; this guard stays)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const intg = read('public/js/integrations.js');

describe('integrations.js markup builders', () => {
  test('the guide panel escapes the webhook URL it prints', () => {
    const s = sliceFn(intg, 'showIntgGuide', 'integrations.js');
    assert.match(s, /<code>\$\{esc\(webhookUrl\)\}<\/code>/);
    assert.doesNotMatch(s, /<code>\$\{webhookUrl\}<\/code>/);
  });
});
