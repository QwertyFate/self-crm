// ROUTE tests: an Engine-written note (activities.source = 'engine', created_by
// NULL) is signed "Upgrads Engine" wherever the CRM lists activities — the
// contact detail (GET /api/contacts/:id) and the Activities page / deal detail
// (GET /api/activities) — without any renderer having to know about it.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const calls = [];
const pool = {
  query: async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM contacts c\s+LEFT JOIN users/.test(sql)) return { rows: [{ id: 55, name: 'Erika', workspace_id: 7 }] };
    return { rows: [] };
  },
};
let contacts, activities;
before(async () => {
  contacts   = await serve({ '/api/contacts':   loadRoute('contacts.js',   { pool }) });
  activities = await serve({ '/api/activities': loadRoute('activities.js', { pool }) });
});
after(async () => { await contacts.close(); await activities.close(); });

const LABEL = /COALESCE\(u\.name, CASE WHEN a\.source = 'engine' THEN 'Upgrads Engine' END\) AS logged_by_name/;

describe('the author label', () => {
  test('GET /api/contacts/:id selects a.source and labels Engine notes', async () => {
    calls.length = 0;
    const r = await contacts.request('GET', '/api/contacts/55');
    assert.equal(r.status, 200);
    const q = calls.find(c => /FROM activities a/.test(c.sql));
    assert.ok(q, 'activities query ran');
    assert.match(q.sql, LABEL);
    assert.match(q.sql, /a\.completed, a\.source,/);
  });
  test('GET /api/activities selects a.source and labels Engine notes', async () => {
    calls.length = 0;
    const r = await activities.request('GET', '/api/activities');
    assert.equal(r.status, 200);
    const q = calls.find(c => /FROM activities a/.test(c.sql));
    assert.match(q.sql, LABEL);
    assert.match(q.sql, /a\.completed, a\.source,/);
  });
  test('GET /api/activities/:id (the single-activity read) labels Engine notes too', async () => {
    calls.length = 0;
    await activities.request('GET', '/api/activities/5');
    const q = calls.find(c => /FROM activities a/.test(c.sql));
    assert.match(q.sql, LABEL);
    assert.match(q.sql, /a\.completed, a\.source,/);
  });
});
