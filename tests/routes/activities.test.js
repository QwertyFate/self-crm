// ROUTE tests for notes and comments: HTML is sanitised on write, mentions
// still fire, and response shapes are unchanged.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const PAYLOAD = '<p>Hi <b>bold</b> <a href="https://ok.test">ok</a> <a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)><script>alert(1)</script></p>';
const CLEAN   = '<p>Hi <b>bold</b> <a href="https://ok.test">ok</a> <a>bad</a></p>';
const db = { lastComment: '' };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /^INSERT INTO activities/,                       reply: () => ({ rows: [{ id: 1 }] }) },
    { match: /^UPDATE activities SET/,                        reply: () => ({ rows: [{ id: 5 }], rowCount: 1 }) },
    { match: /SELECT name FROM users WHERE id=\$1/,           reply: () => ({ rows: [{ name: 'Alice' }] }) },
    { match: /SELECT id, name FROM users WHERE workspace_id/, reply: () => ({ rows: [{ id: 2, name: 'Justin Cap' }] }) },
    { match: /SELECT a\.contact_id/,                          reply: () => ({ rows: [{ contact_id: null, type: 'note', contact_name: null }] }) },
    { match: /^INSERT INTO notifications/,                    reply: () => ({ rows: [] }) },
    { match: /SELECT id FROM activities WHERE id=\$1 AND workspace_id=\$2/, reply: () => ({ rows: [{ id: 1 }] }) },
    { match: /^INSERT INTO activity_comments/,                reply: p => { db.lastComment = p[3]; return { rows: [{ id: 9 }] }; } },
    { match: /FROM activity_comments ac .* WHERE ac\.id = \$1/, reply: () => ({ rows: [{ id: 9, activity_id: 1, parent_id: null, workspace_id: 7, content: db.lastComment, created_by: 1, created_by_name: 'Alice' }] }) },
  ]);
  server = await serve({
    '/api/activities':        loadRoute('activities.js', { pool }),
    '/api/activity-comments': loadRoute('activity-comments.js', { pool }),
  });
});
after(() => server.close());
beforeEach(() => pool.reset());

describe('sanitised on write', () => {
  test('POST note: the stored value is sanitised, formatting kept', async () => {
    const r = await server.request('POST', '/api/activities', { type: 'note', content: PAYLOAD });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 1 });
    assert.equal(pool.find(/^INSERT INTO activities/).params[3], CLEAN);
  });
  test('PATCH note: the stored value is sanitised, formatting kept', async () => {
    const r = await server.request('PATCH', '/api/activities/5', { content: PAYLOAD });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, id: 5 });
    assert.equal(pool.find(/^UPDATE activities SET/).params[1], CLEAN);
  });
  test('POST comment: stored sanitised, and the returned row carries the sanitised content', async () => {
    const r = await server.request('POST', '/api/activity-comments', { activity_id: 1, content: PAYLOAD });
    assert.equal(r.status, 201);
    assert.equal(pool.find(/^INSERT INTO activity_comments/).params[3], CLEAN);
    assert.equal(r.body.content, CLEAN);
    assert.equal(r.body.created_by_name, 'Alice');
  });
  test("the editor's <div> lines are stored as paragraphs", async () => {
    await server.request('POST', '/api/activities', { type: 'note', content: '<div>line1</div><div>line2</div>' });
    assert.equal(pool.find(/^INSERT INTO activities/).params[3], '<p>line1</p><p>line2</p>');
  });
  test('a note that is nothing but a script has no content -> 400, nothing inserted', async () => {
    const r = await server.request('POST', '/api/activities', { type: 'note', content: '<script>alert(1)</script>' });
    assert.equal(r.status, 400);
    assert.equal(pool.some(/^INSERT INTO activities/), false);
  });
});

describe('mentions', () => {
  test('an @mention inside formatting still notifies the matched user', async () => {
    await server.request('POST', '/api/activities', { type: 'note', content: '<b>@justin</b> ping' });
    const notif = pool.find(/^INSERT INTO notifications/);
    assert.ok(notif, 'a notification INSERT was issued');
    assert.equal(notif.params[1], 2, 'user_id of "Justin Cap"');
    assert.match(notif.params[5], /mentioned you in a note/);
  });
});
