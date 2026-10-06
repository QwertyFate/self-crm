// UNIT tests for how production is run: a launchd LaunchDaemon on the Mac mini,
// not `npm run dev` in a remote terminal.
//
// WHY. Production was `npm run dev` typed into an SSH session: nodemon (a
// devDependency, absent from a production install), restarting on any file
// change, and dying with the terminal. A shell `until` loop was tried around it
// to survive crashes — measured: it never fires on an app crash (nodemon waits
// for a file change instead of exiting) and it ignores Ctrl+C (nodemon exits
// 130, which `until` reads as "failed, retry"). The supervisor's job belongs to
// the OS: launchd restarts on crash (KeepAlive) and at boot (RunAtLoad), with no
// terminal attached. Also found: NODE_ENV was never set, so server.js's CSP —
// applied only when NODE_ENV=production — was off in production.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { ROOT } = require('../helpers/load-route');

describe('package.json scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  test('npm start is plain node and tolerates a missing .env (hosts that inject env vars; --env-file exits 9 without one)', () => {
    assert.equal(pkg.scripts.start, 'node --env-file-if-exists=.env server.js');
  });
  test('npm run dev is plain nodemon — no shell restart loop; that is the supervisor\'s job', () => {
    assert.match(pkg.scripts.dev, /^nodemon --exec 'node --env-file-if-exists=\.env' server\.js$/);
    assert.doesNotMatch(pkg.scripts.dev, /until |while |sleep |trap /);
  });
});

describe('deploy/com.upgrads.crm.plist — the LaunchDaemon', () => {
  const plist = path.join(ROOT, 'deploy', 'com.upgrads.crm.plist');
  test('exists and is valid property-list XML (plutil -lint, the macOS validator)', (t) => {
    assert.ok(fs.existsSync(plist), 'deploy/com.upgrads.crm.plist is missing');
    if (process.platform !== 'darwin') return t.skip('plutil is macOS-only; the structural checks below still run');
    execFileSync('plutil', ['-lint', plist]);   // throws with plutil's message if the XML is bad
  });
  test('restarts on crash and at boot, throttled, as a named user (not root), with logs to files', () => {
    const x = fs.readFileSync(plist, 'utf8');
    assert.match(x, /<key>KeepAlive<\/key>\s*<true\/>/, 'KeepAlive — restart whenever the process exits');
    assert.match(x, /<key>RunAtLoad<\/key>\s*<true\/>/, 'RunAtLoad — start at boot, before any login');
    assert.match(x, /<key>ThrottleInterval<\/key>\s*<integer>\d+<\/integer>/, 'a pause between restarts, so a DB-down crash loop stays civil');
    assert.match(x, /<key>UserName<\/key>\s*<string>[^<]+<\/string>/, 'a LaunchDaemon runs as root unless told otherwise');
    assert.match(x, /<key>WorkingDirectory<\/key>/);
    assert.match(x, /<key>StandardOutPath<\/key>/); assert.match(x, /<key>StandardErrorPath<\/key>/);
  });
  test('runs the same command as npm start, with NODE_ENV=production so the CSP is on', () => {
    const x = fs.readFileSync(plist, 'utf8');
    assert.match(x, /<string>--env-file-if-exists=\.env<\/string>\s*<string>server\.js<\/string>/);
    assert.match(x, /<key>NODE_ENV<\/key>\s*<string>production<\/string>/);
    assert.doesNotMatch(x, /nodemon/, 'never nodemon in production');
  });
});
