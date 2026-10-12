// CLIENT (static) — the admin console under open admin: /api/admin/me answers { isAdmin, open };
// when open, the console skips its login screen, shows a notice instead of a Logout button, and
// its Engine tutorial describes the local file storage that is now the default.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');

const html = read('public/admin.html');

describe('public/admin.html', () => {
  test('checkAdminStatus honours `open`: no Logout button, the notice shown', () => {
    const fn = html.slice(html.indexOf('async function checkAdminStatus()'), html.indexOf('async function adminLogin()'));
    assert.match(fn, /data\.open \? 'none' : 'inline-flex'/);
    assert.match(fn, /'admin-open-notice'\)\.classList\.toggle\('hidden', !data\.open\)/);
  });
  test('the notice exists once, hidden by default, and tells how to lock the console again', () => {
    assert.equal(html.split(' id="admin-open-notice"').length - 1, 1);
    assert.match(html, /id="admin-open-notice"[^>]*class="[^"]*hidden[^"]*"/);
    assert.match(html, /OPEN_ADMIN=false/);
    assert.match(html, /ADMIN_SECRET/);
  });
  test('the storage hints describe the local default and keep Supabase as the alternative', () => {
    assert.match(html, /local(ly)? under <code>data\/files<\/code>/);
    assert.match(html, /<strong>private<\/strong> Supabase bucket <code>contact-documents<\/code>/);
    assert.doesNotMatch(html, /a <strong>private<\/strong> Supabase bucket <code>contact-documents<\/code> \(or <code>SUPABASE_DOCS_BUCKET<\/code>\) for contracts and recordings, and/, 'the old sentence presented Supabase as the only option');
  });
});
