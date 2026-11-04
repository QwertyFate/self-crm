// UNIT: utils/app-version.js and its two outlets in server.js (2026-10-13): the client files'
// fingerprint that lets an open tab reload itself after a deploy. Pinned: the fingerprint is a
// stable twelve-hex SHA-1 over index.html, style.css and public/js/*.js in a fixed order; it
// changes when any of those changes and not when something else does; GET /api/version serves it
// uncached before the SPA catch-all; every authenticated socket hears it on connect.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const { APP_VERSION, computeVersion, clientFiles } = require(path.join(ROOT, 'utils', 'app-version.js'));

function tmpPublic() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-version-'));
  fs.mkdirSync(path.join(dir, 'js')); fs.mkdirSync(path.join(dir, 'images'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>1</html>');
  fs.writeFileSync(path.join(dir, 'style.css'), 'body{}');
  fs.writeFileSync(path.join(dir, 'js', 'core.js'), 'let a = 1;');
  fs.writeFileSync(path.join(dir, 'js', 'auth.js'), 'let b = 2;');
  fs.writeFileSync(path.join(dir, 'images', 'logo.png'), 'png');
  return dir;
}

describe('computeVersion', () => {
  test('the files the app loads, in a fixed order; twelve hex characters; the same twice', () => {
    const dir = tmpPublic();
    assert.deepEqual(clientFiles(dir), ['index.html', 'style.css', path.join('js', 'auth.js'), path.join('js', 'core.js')]);
    const v = computeVersion(dir);
    assert.match(v, /^[0-9a-f]{12}$/); assert.equal(computeVersion(dir), v);
  });
  test('a change to a script, the stylesheet or the page changes it; an image or a non-script file does not', () => {
    const dir = tmpPublic(); const v0 = computeVersion(dir);
    fs.writeFileSync(path.join(dir, 'js', 'core.js'), 'let a = 2;'); const v1 = computeVersion(dir); assert.notEqual(v1, v0);
    fs.writeFileSync(path.join(dir, 'style.css'), 'body{color:red}'); const v2 = computeVersion(dir); assert.notEqual(v2, v1);
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>2</html>'); const v3 = computeVersion(dir); assert.notEqual(v3, v2);
    fs.writeFileSync(path.join(dir, 'images', 'logo.png'), 'png2'); fs.writeFileSync(path.join(dir, 'js', 'notes.txt'), 'x'); assert.equal(computeVersion(dir), v3, 'images and non-scripts are not the app');
    fs.writeFileSync(path.join(dir, 'js', 'new.js'), ''); assert.notEqual(computeVersion(dir), v3, 'a new script counts');
  });
  test('the exported APP_VERSION is the live public folder\'s fingerprint', () => {
    assert.match(APP_VERSION, /^[0-9a-f]{12}$/);
    assert.equal(APP_VERSION, computeVersion(path.join(ROOT, 'public')));
  });
});

describe('server.js', () => {
  const s = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  test('GET /api/version answers the fingerprint uncached, before the SPA catch-all; every authenticated socket hears it on connect', () => {
    assert.match(s, /const \{ APP_VERSION \} = require\('\.\/utils\/app-version'\);/);
    const route = s.indexOf("app.get('/api/version', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ version: APP_VERSION }); });");
    const all = s.indexOf("app.get('*', (req, res) => res.sendFile(");
    assert.ok(route > 0 && route < all, 'the version route sits right before the catch-all');
    const conn = s.indexOf("io.on('connection', async (socket) => {"), auth = s.indexOf("if (!mem) { socket.disconnect(); return; }", conn), emit = s.indexOf("socket.emit('app:version', APP_VERSION);", conn);
    assert.ok(conn > 0 && auth > conn && emit > auth, 'emitted after the membership check');
  });
});
