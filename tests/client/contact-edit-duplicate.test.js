// CLIENT: an inline edit the server refuses is undone on screen and said in the user's language.
//
// WHY. The contacts table's inline edit wrote the new value into the row and ignored the server's answer, so a
// refused email (now a 409 email_taken, DESIGN_PRO Part 48) would still show as saved. The contact view's inline edit
// undid it but showed the server's English sentence. The real commitInlineEdit runs here against stand-ins.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

function table(answer) {
  const extra = `
    const api = { put: async (u, p) => { __log.sent.push(p); return __answer; } };
    const ui = { toast: m => __log.toasts.push(m) };
    function t(k) { return __dict.de[k] ?? k; }
    function filterContacts() { __log.rendered++; }
    const document = { getElementById: () => ({ classList: { contains: () => false } }) };
    function renderDealsBoard() {}
    const members = [];`;
  const F = loadFns('public/js/contacts.js', ['commitInlineEdit'], { state: { contacts: null, __log: null, __answer: null, __dict: null }, extra });
  const contacts = [{ id: 10, name: 'Jonas', email: 'jonas@becker.de', phone: '+49 1', company: 'Becker Bau', assigned_to: 3, custom_data: { quelle: 'Web' } }];
  const log = { sent: [], toasts: [], rendered: 0 };
  F.__set('contacts', contacts); F.__set('__log', log); F.__set('__answer', answer); F.__set('__dict', dict);
  return { F, contacts, log };
}

describe('the contacts table\'s inline edit', () => {
  test('the email taken: the row shows the saved address again, the message says why, the table re-renders', async () => {
    const { F, contacts, log } = table({ error: 'Contact with this email already exists in this workspace', code: 'email_taken' });
    await F.commitInlineEdit(10, 'email', 'email', 'erika@muster.de');
    assert.equal(log.sent[0].email, 'erika@muster.de', 'it was sent');
    assert.equal(contacts[0].email, 'jonas@becker.de', 'undone on screen');
    assert.deepEqual(log.toasts, [dict.de.cf_err_email_taken]);
    assert.equal(log.rendered, 1);
  });
  test('any other refusal: undone, the general message (a custom field too)', async () => {
    const { F, contacts, log } = table({ error: 'Serverfehler (500)' });
    await F.commitInlineEdit(10, 'quelle', 'text', 'Messe');
    assert.deepEqual(contacts[0].custom_data, { quelle: 'Web' });
    assert.deepEqual(log.toasts, [dict.de.cf_err_save]);
  });
  test('saved: the row keeps the new value, nothing to say', async () => {
    const { F, contacts, log } = table({ success: true });
    await F.commitInlineEdit(10, 'email', 'email', 'neu@becker.de');
    assert.equal(contacts[0].email, 'neu@becker.de');
    assert.deepEqual(log.toasts, []);
  });
});

describe('the contact view\'s inline edit', () => {
  test('a refusal is undone and said in the user\'s language: the email taken, or the general message', () => {
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /if \(res\?\.error\) \{ Object\.assign\(S\.c, prev\); render\(\); return ui\.toast\(t\(res\.code === 'email_taken' \? 'cf_err_email_taken' : 'cf_err_save'\)\); \}/);
  });
});
