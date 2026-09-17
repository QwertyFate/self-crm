// UNIT tests for the ADMIN_CONSOLE_PATH resolver: unset disables the console,
// a valid value is returned as-is, anything guessable or malformed is a
// boot-time error (the server refuses to start rather than fall back).
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { resolveAdminConsolePath } = require('../../utils/admin-console');

test('unset or blank -> null (console disabled)', () => {
  assert.equal(resolveAdminConsolePath(undefined), null);
  assert.equal(resolveAdminConsolePath(''), null);
  assert.equal(resolveAdminConsolePath('   '), null);
});

test('a single 16–128 character segment is accepted and trimmed', () => {
  assert.equal(resolveAdminConsolePath('/a1b2c3d4e5f6a7b8c9d0'), '/a1b2c3d4e5f6a7b8c9d0');
  assert.equal(resolveAdminConsolePath('  /a1b2c3d4e5f6a7b8c9d0  '), '/a1b2c3d4e5f6a7b8c9d0');
});

test('guessable or malformed values throw with an explanation', () => {
  for (const bad of ['/admin', '/adminconsole', 'a1b2c3d4e5f6a7b8c9d0', '/a1b2c3d4e5f6a7b8c9d0/', '/abc/def', '/a1b2c3d4e5f6a7b8c9d0?x=1', '/' + 'x'.repeat(129)]) {
    assert.throws(() => resolveAdminConsolePath(bad), /ADMIN_CONSOLE_PATH must be a single path segment/, bad);
  }
});
