// CLIENT: the contact dialog stays open and says why when saving fails.
//
// WHY. saveContact ignored the server's answer and always closed the dialog. A contact with an email the workspace
// already has was refused (409), so the dialog closed, nothing was created, and nobody was told (full review of
// 2026-10-22, LOGIN_LANDING_CHANGES Part 44). Now: the email taken → the message under the form, the email field
// marked and focused; any other failure → a general message; success → closed as before. Opening the dialog clears it.
// The real saveContact runs here against stand-ins for the page.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const html = read('public/index.html');
const modals = read('public/js/modals.js');

function el(id, value = '') {
  return { id, value, textContent: '', hidden: true, attrs: {}, focused: false,
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, focus() { this.focused = true; } };
}
// A fresh page: the dialog's fields, the new error line, a recording closeModal and a scripted api.
function page(answer) {
  const els = Object.fromEntries(['contact-id', 'cf-name', 'cf-company', 'cf-email', 'cf-phone', 'cf-assignee', 'cf-type', 'cf-error'].map(id => [id, el(id)]));
  els['cf-name'].value = 'Erika Zwei'; els['cf-email'].value = 'erika@muster.de';
  const log = { closed: [], sent: [] };
  const extra = `
    const document = { getElementById: id => __els[id], querySelector: () => ({ id: 'page-contacts' }) };
    const api = { post: async (u, p) => { __log.sent.push(['post', u, p]); return __answer; }, put: async (u, p) => { __log.sent.push(['put', u, p]); return __answer; } };
    function closeModal(id) { __log.closed.push(id); }
    function invalidate() {}
    async function loadContacts() {} async function loadDeals() {}
    function t(k) { return __dict.de[k] ?? k; }
    const fields = [];`;
  const F = loadFns('public/js/modals.js', ['saveContact'], { state: { currentContactType: 'contact', __els: null, __log: null, __answer: null, __dict: null }, extra });
  F.__set('__els', els); F.__set('__log', log); F.__set('__answer', answer); F.__set('__dict', dict);
  return { F, els, log };
}
const submit = { preventDefault() {} };

describe('saving a contact', () => {
  test('the email is taken: the dialog stays open, the message says so, the email field is marked and focused', async () => {
    const { F, els, log } = page({ error: 'Contact with this email already exists in this workspace', code: 'email_taken' });
    await F.saveContact(submit);
    assert.deepEqual(log.closed, [], 'not closed');
    assert.equal(els['cf-error'].hidden, false);
    assert.equal(els['cf-error'].textContent, dict.de.cf_err_email_taken);
    assert.equal(els['cf-email'].attrs['aria-invalid'], 'true');
    assert.equal(els['cf-email'].focused, true);
  });
  test('any other failure: open, the general message, the email field not blamed', async () => {
    const { F, els, log } = page({ error: 'Serverfehler (500)' });
    await F.saveContact(submit);
    assert.deepEqual(log.closed, []);
    assert.equal(els['cf-error'].textContent, dict.de.cf_err_save);
    assert.equal(els['cf-email'].attrs['aria-invalid'], undefined);
  });
  test('success: closed as before, the message hidden', async () => {
    const { F, els, log } = page({ id: 55, name: 'Erika Zwei' });
    await F.saveContact(submit);
    assert.deepEqual(log.closed, ['contact-modal']);
    assert.equal(els['cf-error'].hidden, true);
  });
  test('the dialog has the message line; opening it clears the message and the mark; the words exist in both languages, impersonal', () => {
    assert.match(html, /<p class="error-text" id="cf-error" role="alert" hidden><\/p>/);
    assert.match(html, /<input type="email" id="cf-email" aria-describedby="cf-error" \/>/);
    const open = modals.slice(modals.indexOf('async function openContactModal('), modals.indexOf('function renderFieldInput('));
    assert.match(open, /document\.getElementById\('cf-error'\)\.hidden = true;/);
    assert.match(open, /document\.getElementById\('cf-email'\)\.removeAttribute\('aria-invalid'\);/);
    for (const k of ['cf_err_email_taken', 'cf_err_save']) for (const lang of ['de', 'en']) assert.ok(dict[lang][k], `${lang} ${k}`);
    for (const k of ['cf_err_email_taken', 'cf_err_save']) assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*|gib)\b/i);
  });
});
