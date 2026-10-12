// CLIENT (static) — the Backups card in the platform admin console: inside the Platform Defaults
// tab only, wired into the single inline script, loaded with the dashboard, and rendering
// archive names safely. The tab list and the Provisioning panel's handlers are re-asserted
// because other tests pin them and this card must not disturb them.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');

const html = read('public/admin.html');
const inline = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const panel = (id) => html.slice(html.indexOf(`<div id="tab-${id}"`), html.indexOf(`<!-- /#tab-${id} -->`));
const count = (s, needle) => s.split(needle).length - 1;

describe('placement', () => {
  test('the card sits inside #tab-defaults and nowhere else; there is still exactly one <script>', () => {
    assert.ok(panel('defaults').includes('id="backup-card"'));
    for (const id of ['provisioning', 'tutorial', 'engine', 'monitor']) assert.equal(panel(id).includes('backup-'), false, `#tab-${id}`);
    assert.equal(count(html, '<script'), 1);
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine', 'monitor'\]\)/, 'the tab array is untouched');
  });
  test('every id of the card is declared once', () => {
    for (const id of ['backup-card', 'backup-save-btn', 'backup-download-btn', 'backup-hosted-note', 'backup-body', 'backup-meta', 'backup-list-body']) assert.equal(count(html, ` id="${id}"`), 1, id);
  });
  test('the buttons start disabled and point at functions the inline script defines; the restore hint names the command', () => {
    const card = panel('defaults').slice(panel('defaults').indexOf('id="backup-card"'));
    assert.match(card, /<button class="btn" id="backup-save-btn" onclick="saveBackupNow\(\)" disabled>/);
    assert.match(card, /<button class="btn btn-primary" id="backup-download-btn" onclick="downloadBackup\(\)" disabled>/);
    for (const fn of ['saveBackupNow', 'downloadBackup', 'loadBackups', 'renderBackupRows', 'fmtBytes', 'fmtBackupTime']) assert.equal((inline.match(new RegExp(`(?:async )?function ${fn}\\(`, 'g')) || []).length, 1, fn);
    assert.match(card, /npm run restore -- backups\/&lt;archive&gt;\.tar\.gz/);
    assert.match(card, /moved aside with a timestamp, never deleted/);
    assert.match(card, /<tbody id="backup-list-body"><tr><td colspan="3" class="loading">/);
  });
  test('loadDashboard fills the card without waiting on it, and the inline script parses', () => {
    const dash = sliceFn(inline, 'loadDashboard', 'admin.html');
    assert.ok(dash.indexOf('loadBackups();') < dash.indexOf('Promise.all'), 'before the stats, not awaited');
    const tmp = path.join(os.tmpdir(), `admin-inline-${process.pid}.js`);
    fs.writeFileSync(tmp, inline);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } finally { fs.unlinkSync(tmp); }
  });
});

describe('behaviour of the handlers (sliced out of the inline script)', () => {
  const api = new Function(`${sliceFn(inline, 'esc', 'admin.html')}\n${sliceFn(inline, 'fmtBytes', 'admin.html')}\n${sliceFn(inline, 'fmtBackupTime', 'admin.html')}\n${sliceFn(inline, 'renderBackupRows', 'admin.html')}\nreturn { renderBackupRows, fmtBytes };`)();
  test('renderBackupRows: an empty state spanning the three columns; names and sizes escaped', () => {
    assert.match(api.renderBackupRows([]), /^<tr><td colspan="3" class="loading">No archives yet/);
    const rows = api.renderBackupRows([{ name: 'crm-backup-2026-10-12.tar.gz<img src=x onerror=alert(1)>', size: 2048, createdAt: '2026-10-12T09:00:00.000Z' }]);
    assert.equal(rows.includes('<img'), false); assert.match(rows, /&lt;img/);
    assert.match(rows, /<code>crm-backup-2026-10-12\.tar\.gz/); assert.match(rows, /2 KB/);
  });
  test('fmtBytes', () => {
    assert.equal(api.fmtBytes(512), '512 B'); assert.equal(api.fmtBytes(10240), '10 KB'); assert.equal(api.fmtBytes(3 * 1048576), '3.0 MB'); assert.equal(api.fmtBytes(undefined), '—');
  });
  test('loadBackups treats 503 as "not the embedded database": note shown, buttons stay disabled; saveBackupNow reports through showMessage', () => {
    const lb = sliceFn(inline, 'loadBackups', 'admin.html');
    assert.match(lb, /res\.status === 503/); assert.match(lb, /'backup-hosted-note'\)\.classList\.remove\('hidden'\)/); assert.match(lb, /saveBtn\.disabled = true; dlBtn\.disabled = true;/);
    assert.match(lb, /API_BASE\}\/backup\/list/);
    const sn = sliceFn(inline, 'saveBackupNow', 'admin.html');
    assert.match(sn, /method: 'POST'/); assert.match(sn, /showMessage\(`Saved /); assert.match(sn, /showMessage\(`Backup failed: /); assert.match(sn, /loadBackups\(\);/);
    assert.match(sliceFn(inline, 'downloadBackup', 'admin.html'), /a\.href = `\$\{API_BASE\}\/backup`/);
  });
});

describe('what other tests pin is untouched', () => {
  test('the Provisioning panel still wires exactly its three handlers', () => {
    const fromPanel = [...panel('provisioning').matchAll(/onclick="(\w+)\(/g)].map(m => m[1]);
    assert.deepEqual([...new Set(fromPanel)].sort(), ['addProvField', 'loadProvisionList', 'submitProvision']);
  });
});
