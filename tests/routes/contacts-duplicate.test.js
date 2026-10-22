// ROUTE: a contact cannot get an email another contact in the workspace already has, on create or on edit, and the
// refusal carries a code the screens can act on.
//
// WHY. Create: the 409 carried only an English sentence, and the contact dialog ignored the answer (full review of
// 2026-10-22, LOGIN_LANDING_CHANGES Part 44; DESIGN_PRO Part 47). Edit: never checked at all, and it stored the email
// as typed, while create, the lead webhook and the CSV import match on the lowercased address, so an edited
// "Erika@Muster.de" made the next lead from erika@muster.de a second contact (DESIGN_PRO Part 48). An edit that keeps
// the contact's own address is not checked, so contacts that already share one from before stay editable.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

// The workspace: Erika (9) has erika@muster.de; Jonas (10) was saved by an old edit as "Jonas@Becker.de".
const inserted = [], updated = [], checked = [];
const pool = {
  query: async (sql, params) => {
    if (/^SELECT id FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(sql)) return { rows: params[1] === 'erika@muster.de' ? [{ id: 9 }] : [] };
    if (/^SELECT id FROM contacts WHERE workspace_id=\$1 AND lower\(email\)=\$2 AND id<>\$3/.test(sql)) { checked.push(params); return { rows: params[1] === 'erika@muster.de' && String(params[2]) !== '9' ? [{ id: 9 }] : [] }; }
    if (/^SELECT name, email, phone, company, contact_type FROM contacts WHERE id=\$1 AND workspace_id=\$2/.test(sql)) {
      const rows = { 9: { name: 'Erika', email: 'erika@muster.de', phone: null, company: null, contact_type: 'contact' }, 10: { name: 'Jonas', email: 'Jonas@Becker.de', phone: null, company: null, contact_type: 'contact' } };
      return { rows: rows[params[0]] ? [rows[params[0]]] : [] };
    }
    if (sql.startsWith('INSERT INTO contacts')) { inserted.push(params); return { rows: [{ id: 55, name: params[1], email: params[2] }] }; }
    if (sql.startsWith('UPDATE contacts')) { updated.push(params); return { rowCount: 1, rows: [] }; }
    return { rows: [], rowCount: 0 };
  },
};
const put = (id, body) => srv.request('PUT', `/api/contacts/${id}`, { name: 'Jonas', ...body });
let srv;
before(async () => { srv = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) }); });
after(async () => { await srv.close(); });

describe('POST /api/contacts with an email that already exists', () => {
  test('409 with the code email_taken (any spelling of the address); nothing is inserted', async () => {
    const r = await srv.request('POST', '/api/contacts', { name: 'Erika Zwei', email: '  Erika@Muster.DE ' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'email_taken');
    assert.ok(r.body.error);
    assert.equal(inserted.length, 0);
  });
  test('a new email is still created', async () => {
    const r = await srv.request('POST', '/api/contacts', { name: 'Neu', email: 'neu@muster.de' });
    assert.notEqual(r.status, 409);
    assert.equal(inserted.length, 1);
  });
});

describe('PUT /api/contacts/:id', () => {
  test('changing the email to another contact\'s (any spelling): 409 email_taken, nothing written', async () => {
    updated.length = 0;
    const r = await put(10, { email: '  ERIKA@muster.de ' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'email_taken');
    assert.equal(updated.length, 0);
  });
  test('a new address of its own: saved, lowercased and trimmed like on create', async () => {
    updated.length = 0;
    const r = await put(10, { email: ' Jonas.Neu@Becker.de ' });
    assert.equal(r.status, 200);
    assert.equal(updated[0][1], 'jonas.neu@becker.de');
  });
  test('keeping its own address (in any spelling) is not checked and not rewritten, so old shared addresses stay editable', async () => {
    updated.length = 0; checked.length = 0;
    const r = await put(10, { email: 'jonas@becker.de', company: 'Becker Bau' });
    assert.equal(r.status, 200);
    assert.equal(checked.length, 0, 'no duplicate check');
    assert.equal(updated[0][1], 'Jonas@Becker.de', 'the stored spelling kept');
    assert.equal((await put(9, { name: 'Erika', email: 'erika@muster.de' })).status, 200, 'Erika keeps hers');
  });
  test('no email at all is allowed, as before', async () => {
    updated.length = 0;
    const r = await put(10, { email: '' });
    assert.equal(r.status, 200);
    assert.equal(updated[0][1], null);
  });
});
