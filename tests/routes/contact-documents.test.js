// ROUTE tests for routes/contact-documents.js (session side): list, multipart
// upload into the private bucket, signed download, delete — every query scoped to
// the workspace — and the dokument.hinzugefuegt webhook the upload fires through
// the real utils/engine.js. storage.js is replaced by a recording stub.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, inject, ROOT } = require('../helpers/load-route');

const SECRET = 'd'.repeat(64);
const ACTIVE = { workspace_id: 7, engine_url: 'https://engine.example/hook', active: true, trigger_stage_ids: [5], webhook_secret: SECRET };
const DOC = { id: 9, workspace_id: 7, contact_id: 55, deal_id: 17, typ: 'vertrag', file_name: 'Vertrag Muster.pdf', file_size: 13, file_type: 'application/pdf', storage_path: '7/55/123-Vertrag_Muster.pdf', uploaded_by: 1, created_at: '2026-10-09T10:00:00.000Z', uploaded_by_name: 'Anna' };

const state = { settings: null, contacts: new Map(), docs: [], deal: null, calls: [], storage: [], deleted: [], uploadFails: false, signFails: false };
const storageStub = {
  uploadDocument: async (...a) => { state.storage.push(a); if (state.uploadFails) throw new Error('Bucket not found'); return { storagePath: `7/55/123-${String(a[3]).replace(/[^a-zA-Z0-9._-]/g, '_')}` }; },
  deleteDocument: async p => { state.deleted.push(p); },
  signedDocumentUrl: async (p, s) => { if (state.signFails) throw new Error('sign failed'); return `https://signed.example/${p}?exp=${s}`; },
};
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    if (/^SELECT id, contact_type FROM contacts WHERE id=\$1 AND workspace_id=\$2/.test(sql)) { const c = state.contacts.get(params[0]); return { rows: c && c.workspace_id === params[1] ? [c] : [] }; }
    if (/FROM contact_documents d\s+LEFT JOIN users/.test(sql))                             return { rows: state.docs.filter(d => d.contact_id === params[0] && d.workspace_id === params[1]) };
    if (/FROM contact_documents d\s+JOIN contacts c/.test(sql)) {                              // the dispatcher's lookup
      const d = state.docs.find(x => x.id === params[0] && x.workspace_id === params[1]); const c = d && state.contacts.get(d.contact_id);
      return { rows: d && c ? [{ ...d, contact_type: c.contact_type }] : [] };
    }
    if (sql.startsWith('INSERT INTO contact_documents')) {
      const row = { id: 9, workspace_id: params[0], contact_id: params[1], deal_id: params[2], typ: params[3], file_name: params[4], file_size: params[5], file_type: params[6], storage_path: params[7], uploaded_by: params[8], created_at: '2026-10-09T10:00:00.000Z' };
      state.docs.push(row); const { storage_path, workspace_id, ...ret } = row; return { rows: [ret] };
    }
    if (/^SELECT id FROM deals WHERE id=\$1 AND workspace_id=\$2 AND contact_id=\$3/.test(sql)) return { rows: state.deal && state.deal.id === params[0] && state.deal.contact_id === params[2] ? [state.deal] : [] };
    if (/^SELECT (id, )?storage_path FROM contact_documents WHERE id=\$1 AND contact_id=\$2 AND workspace_id=\$3/.test(sql)) {
      const d = state.docs.find(x => x.id === params[0] && x.contact_id === params[1] && x.workspace_id === params[2]); return { rows: d ? [d] : [] };
    }
    if (sql.startsWith('DELETE FROM contact_documents'))                                    { state.docs = state.docs.filter(d => d.id !== params[0]); return { rowCount: 1, rows: [] }; }
    if (sql.includes('FROM workspace_engine'))                                                return { rows: state.settings ? [state.settings] : [] };
    if (sql.includes('INSERT INTO engine_deliveries'))                                         return { rows: [{ id: 300 }] };
    if (sql.includes('UPDATE engine_deliveries'))                                              return { rowCount: 1, rows: [] };
    return { rows: [], rowCount: 0 };
  },
};

let server, engine, fetchCalls;
before(async () => {
  inject('storage.js', storageStub);
  delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
  server = await serve({ '/api/contacts': loadRoute('contact-documents.js', { pool }) });
  engine = require(path.join(ROOT, 'utils', 'engine.js'));
});
after(async () => { await server.close(); });
beforeEach(() => {
  state.settings = { ...ACTIVE }; state.calls.length = 0; state.storage.length = 0; state.deleted.length = 0; state.uploadFails = false; state.signFails = false;
  state.contacts.clear(); state.contacts.set(55, { id: 55, workspace_id: 7, contact_type: 'contact' }); state.contacts.set(61, { id: 61, workspace_id: 8, contact_type: 'contact' }); state.contacts.set(70, { id: 70, workspace_id: 7, contact_type: 'supplier' });
  state.docs = []; state.deal = { id: 17, contact_id: 55 };
  fetchCalls = [];
  engine.configure({ timeoutMs: 50, fetch: async (url, init) => { fetchCalls.push({ url, init }); return { status: 200, text: async () => '' }; } });
});
afterEach(() => engine.resetConfig());

async function uploadPdf(contactId, fields = { typ: 'vertrag', deal_id: '17' }, name = 'Vertrag Muster.pdf', bytes = '%PDF-1.4 test') {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${server.base}/api/contacts/${contactId}/documents`, { method: 'POST', body: fd });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

describe('POST /:contactId/documents (multipart)', () => {
  test('stores the file in the private bucket, writes the row, answers 201 without the storage path, fires dokument.hinzugefuegt with the §5.2 view and an absolute download_url', async () => {
    const r = await uploadPdf(55);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 9, contact_id: 55, deal_id: 17, typ: 'vertrag', file_name: 'Vertrag Muster.pdf', file_size: 13, file_type: 'application/pdf', uploaded_by: 1, created_at: '2026-10-09T10:00:00.000Z' });
    assert.equal(state.storage.length, 1);
    const [wid, cid, buf, name, mime] = state.storage[0];
    assert.equal(wid, 7); assert.equal(cid, 55); assert.ok(Buffer.isBuffer(buf) && buf.toString() === '%PDF-1.4 test'); assert.equal(name, 'Vertrag Muster.pdf'); assert.equal(mime, 'application/pdf');
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO contact_documents'));
    assert.deepEqual(ins.params, [7, 55, 17, 'vertrag', 'Vertrag Muster.pdf', 13, 'application/pdf', '7/55/123-Vertrag_Muster.pdf', 1]);
    assert.ok(state.calls.some(c => /^SELECT id FROM deals WHERE id=\$1 AND workspace_id=\$2 AND contact_id=\$3/.test(c.sql)), 'the deal link is verified against this contact');

    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    const p = JSON.parse(fetchCalls[0].init.body);
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(p.event, 'dokument.hinzugefuegt'); assert.equal(p.kunde_id, 55);
    assert.deepEqual(p.daten, { id: 9, typ: 'vertrag', dateiname: 'Vertrag Muster.pdf', mimetype: 'application/pdf', groesse: 13, erstellt_am: '2026-10-09T10:00:00.000Z', download_url: `${server.base}/api/dokumente/9/download`, vertrag_id: 17 });
    assert.equal(fetchCalls[0].init.headers['X-Upgrads-Event'], 'dokument.hinzugefuegt');
    assert.deepEqual(engine.verify(SECRET, fetchCalls[0].init.body, fetchCalls[0].init.headers['X-Upgrads-Signature']), { ok: true });
    const log = state.calls.find(c => c.sql.includes('INSERT INTO engine_deliveries'));
    assert.equal(log.params[1], 'dokument.hinzugefuegt'); assert.equal(log.params[3], 17, 'deal_id'); assert.equal(log.params[4], 55, 'contact_id');
  });
  test('typ defaults to sonstiges and deal_id is optional; an unknown typ or a foreign deal is 400 before any upload', async () => {
    let r = await uploadPdf(55, {});
    assert.equal(r.status, 201); assert.equal(r.body.typ, 'sonstiges'); assert.equal(r.body.deal_id, null);
    r = await uploadPdf(55, { typ: 'rechnung' });
    assert.equal(r.status, 400); assert.match(r.body.error, /vertrag, aufnahme, sonstiges/);
    r = await uploadPdf(55, { typ: 'vertrag', deal_id: '99' });
    assert.equal(r.status, 400); assert.match(r.body.error, /deal/i);
    r = await uploadPdf(55, { typ: 'vertrag', deal_id: 'abc' });
    assert.equal(r.status, 400);
    assert.equal(state.storage.length, 1, 'only the valid upload reached storage');
  });
  test('no file → 400; a contact of another workspace → 404; nothing stored, nothing fired', async () => {
    const fd = new FormData(); fd.append('typ', 'vertrag');
    const r1 = await fetch(`${server.base}/api/contacts/55/documents`, { method: 'POST', body: fd });
    assert.equal(r1.status, 400);
    const r2 = await uploadPdf(61);
    assert.equal(r2.status, 404);
    assert.equal(state.storage.length, 0);
    await engine.drain(); assert.equal(fetchCalls.length, 0);
  });
  test('a storage failure (e.g. the private bucket is missing) is a 500 and writes no row', async () => {
    state.uploadFails = true;
    const r = await uploadPdf(55);
    assert.equal(r.status, 500);
    assert.equal(state.calls.some(c => c.sql.startsWith('INSERT INTO contact_documents')), false);
  });
  test('a document on a supplier is stored but never announced to the Engine', async () => {
    state.deal = null;
    const r = await uploadPdf(70, { typ: 'sonstiges' });
    assert.equal(r.status, 201);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('integration off: upload works, nothing fired', async () => {
    state.settings = { ...ACTIVE, active: false };
    assert.equal((await uploadPdf(55)).status, 201);
    await engine.drain(); assert.equal(fetchCalls.length, 0);
  });
});

describe('GET /:contactId/documents', () => {
  test('lists the contact\'s documents with the uploader\'s name, scoped; 404 for a foreign contact', async () => {
    state.docs = [{ ...DOC }, { ...DOC, id: 10, contact_id: 56 }];
    const r = await server.request('GET', '/api/contacts/55/documents');
    assert.equal(r.status, 200); assert.equal(r.body.length, 1); assert.equal(r.body[0].id, 9);
    const q = state.calls.find(c => /FROM contact_documents d\s+LEFT JOIN users/.test(c.sql));
    assert.deepEqual(q.params, [55, 7]);
    assert.match(q.sql, /WHERE d\.contact_id = \$1 AND d\.workspace_id = \$2/);
    assert.doesNotMatch(q.sql, /storage_path/, 'the storage path never reaches the browser');
    assert.equal((await server.request('GET', '/api/contacts/61/documents')).status, 404);
    assert.equal((await server.request('GET', '/api/contacts/abc/documents')).status, 400);
  });
});

describe('GET /:contactId/documents/:id/download', () => {
  test('302 to a 10-minute signed URL; 404 when the document is not this contact\'s', async () => {
    state.docs = [{ ...DOC }];
    const r = await fetch(`${server.base}/api/contacts/55/documents/9/download`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://signed.example/7/55/123-Vertrag_Muster.pdf?exp=600');
    const q = state.calls.find(c => /^SELECT storage_path FROM contact_documents/.test(c.sql));
    assert.deepEqual(q.params, [9, 55, 7]);
    assert.equal((await fetch(`${server.base}/api/contacts/55/documents/99/download`, { redirect: 'manual' })).status, 404);
    state.docs = [{ ...DOC, contact_id: 56 }];
    assert.equal((await fetch(`${server.base}/api/contacts/55/documents/9/download`, { redirect: 'manual' })).status, 404);
  });
});

describe('DELETE /:contactId/documents/:id', () => {
  test('removes the storage object first, then the row (scoped); 404 for unknown', async () => {
    state.docs = [{ ...DOC }];
    const r = await server.request('DELETE', '/api/contacts/55/documents/9');
    assert.equal(r.status, 200);
    assert.deepEqual(state.deleted, ['7/55/123-Vertrag_Muster.pdf']);
    const del = state.calls.find(c => c.sql.startsWith('DELETE FROM contact_documents'));
    assert.match(del.sql, /WHERE id=\$1 AND workspace_id=\$2/); assert.deepEqual(del.params, [9, 7]);
    assert.equal(state.docs.length, 0);
    assert.equal((await server.request('DELETE', '/api/contacts/55/documents/9')).status, 404);
    assert.equal(state.deleted.length, 1);
  });
});
