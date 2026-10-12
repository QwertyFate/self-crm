// The local build serves on 4001 by default (2026-10-12); every fallback that builds a localhost
// URL agrees, and the production LaunchDaemon pins PORT=3000 so the Mac mini does not move.
// (routes/auth.js left the list the same day: password reset became a page, so it builds no URL.)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('default port 4001', () => {
  test('server.js listens on PORT or 4001', () => {
    assert.match(read('server.js'), /const PORT\s*=\s*process\.env\.PORT \|\| 4001;/);
  });
  test('every localhost fallback uses the same default', () => {
    for (const rel of ['routes/admin-provision.js', 'embedded.js']) {
      const src = read(rel);
      assert.match(src, /process\.env\.PORT \|\| 4001/, rel);
      assert.doesNotMatch(src, /process\.env\.PORT \|\| 3000/, rel);
    }
    assert.doesNotMatch(read('routes/auth.js'), /localhost:/, 'auth.js hands out no URL any more');
  });
  test('.env.example and the README say 4001', () => {
    assert.match(read('.env.example'), /^PORT=4001$/m);
    assert.match(read('README.md'), /CRM running at http:\/\/localhost:4001/);
    assert.doesNotMatch(read('README.md'), /localhost:3000/);
  });
  test('production keeps 3000: the LaunchDaemon sets PORT explicitly', () => {
    assert.match(read('deploy/com.upgrads.crm.plist'), /<key>PORT<\/key>\s*<string>3000<\/string>/);
  });
});
