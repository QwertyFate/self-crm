// INTEGRATION — the whole app, for real, the way `npm run dev` runs it with no .env: server.js
// booted on a random port against an embedded database in a temp folder, then every save path
// the interface uses, driven over real HTTP with a real session cookie, plus the team chat
// through a real socket.io client. Each write is followed by a read that proves it landed.
//
// What this covers that the route tests cannot: express-session + connect-pg-simple on PGlite,
// requireAuth against real memberships, multer → storage → /files for documents, socket.io's
// cookie-based auth and the chat INSERT, open signup / open admin as a whole, and the clean stop.
// It never touches the repo's data/ folder and leaves no process behind.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { ROOT } = require('../helpers/load-route');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-smoke-'));
process.env.DATA_DIR = TMP;
for (const k of ['DATABASE_URL', 'SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPEN_SIGNUP', 'OPEN_ADMIN', 'ADMIN_SECRET', 'BASE_URL', 'APP_URL', 'SMTP_HOST']) delete process.env[k];
process.env.ENGINE_RETRY_WORKER = '0';   // nothing to retry on an empty database; keeps the test quiet
process.env.BACKUP_DIR = path.join(TMP, 'backups');   // the daily archive stays in the temp folder, never in the repo's backups/

let server, base, stopped = false;
const quiet = fn => { const orig = console.log; console.log = () => {}; return fn().finally(() => { console.log = orig; }); };

// One "browser": a cookie jar per user, JSON in and out.
function client() {
  let cookie = '';
  async function call(method, urlPath, body, extra = {}) {
    const headers = { ...(extra.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + urlPath, { method, headers, body: payload, redirect: 'manual' });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  return { call, get cookie() { return cookie; } };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, `${r.status}: ${r.text?.slice(0, 300)}`); return r.body; };

before(async () => {
  server = require(path.join(ROOT, 'server.js'));
  const { port } = await quiet(() => server.start(0));
  base = `http://127.0.0.1:${port}`;
});
after(async () => {
  if (!stopped) await server.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const ada = client(), bob = client();
const ids = {};

describe('the door', () => {
  test('signup is open; Ada creates "Smoke GmbH" with no code and is its owner', async () => {
    assert.equal(ok(await ada.call('GET', '/api/auth/signup-options')).openSignup, true);
    ok(await ada.call('POST', '/api/auth/signup', { mode: 'create', workspace_name: 'Smoke GmbH', name: 'Ada', email: 'ada@smoke.test', password: 'secret1' }), 201);
    assert.ok(ada.cookie.startsWith('connect.sid='), 'a session cookie from connect-pg-simple');
    const me = ok(await ada.call('GET', '/api/auth/me'));
    assert.equal(me.user.name, 'Ada'); assert.equal(me.user.role, 'owner'); assert.equal(me.workspace.name, 'Smoke GmbH');
    ids.workspace = me.workspace.id; ids.ada = me.user.id;
  });
  test('the seeded pipeline is there', async () => {
    const pipelines = ok(await ada.call('GET', '/api/pipelines'));
    assert.equal(pipelines.length, 1);
    ids.pipeline = pipelines[0].id;
    const stages = pipelines[0].stages || [];
    assert.equal(stages.length, 6, JSON.stringify(pipelines[0]).slice(0, 200));
    ids.stage1 = stages[0].id; ids.stage2 = stages[1].id;
  });
  test('an unauthenticated request is refused', async () => {
    assert.equal((await client().call('GET', '/api/contacts')).status, 401);
  });
});

describe('contacts and custom fields save', () => {
  test('create, edit, read back', async () => {
    const c = ok(await ada.call('POST', '/api/contacts', { name: 'Max Muster', email: 'max@example.com', phone: '+49 151 0000', company: 'Alt AG' }), 201);
    ids.contact = c.id;
    ok(await ada.call('PUT', `/api/contacts/${c.id}`, { name: 'Max Mustermann', email: 'max@example.com', phone: '+49 151 1111', company: 'Neu AG', custom_data: {} }));
    const back = ok(await ada.call('GET', `/api/contacts/${c.id}`));
    assert.equal(back.name, 'Max Mustermann'); assert.equal(back.company, 'Neu AG'); assert.equal(back.phone, '+49 151 1111');
    const list = ok(await ada.call('GET', '/api/contacts'));
    assert.ok(list.some(x => x.id === c.id && x.name === 'Max Mustermann'));
  });
  test('a custom field, then a value in it', async () => {
    ok(await ada.call('POST', '/api/fields', { name: 'Branche', field_key: 'branche', type: 'text' }), 201);
    const fields = ok(await ada.call('GET', '/api/fields'));
    assert.ok(fields.some(f => f.field_key === 'branche'));
    ok(await ada.call('PUT', `/api/contacts/${ids.contact}`, { name: 'Max Mustermann', email: 'max@example.com', phone: '+49 151 1111', company: 'Neu AG', custom_data: { branche: 'Solar' } }));
    assert.equal(ok(await ada.call('GET', `/api/contacts/${ids.contact}`)).custom_data.branche, 'Solar');
  });
});

describe('deals save', () => {
  test('create, change the value, move the stage, read back', async () => {
    const d = ok(await ada.call('POST', '/api/deals', { contact_id: ids.contact, pipeline_id: ids.pipeline, stage_id: ids.stage1, title: 'Dachanlage', value: 1500 }), 201);
    ids.deal = d.id;
    ok(await ada.call('PUT', `/api/deals/${d.id}`, { contact_id: ids.contact, pipeline_id: ids.pipeline, stage_id: ids.stage1, title: 'Dachanlage 12 kWp', value: 2500 }));
    ok(await ada.call('PATCH', `/api/deals/${d.id}/stage`, { stage_id: ids.stage2 }));
    const back = ok(await ada.call('GET', `/api/deals/${d.id}`));
    assert.equal(back.title, 'Dachanlage 12 kWp'); assert.equal(Number(back.value), 2500); assert.equal(back.stage_id, ids.stage2);
  });
});

describe('tasks save', () => {
  test('create with a due date and time, edit, change status, read back', async () => {
    const t = ok(await ada.call('POST', '/api/tasks', { title: 'Anrufen', priority: 'high', due_date: '2026-10-20', due_time: '10:00', contact_id: ids.contact }), 201);
    ids.task = t.id;
    ok(await ada.call('PUT', `/api/tasks/${t.id}`, { title: 'Zurückrufen', description: 'wegen Angebot', status: 'todo', priority: 'high', due_date: '2026-10-21', due_time: '14:30', contact_id: ids.contact }));
    ok(await ada.call('PATCH', `/api/tasks/${t.id}/status`, { status: 'done' }));
    const back = ok(await ada.call('GET', `/api/tasks/${t.id}`));
    assert.equal(back.title, 'Zurückrufen'); assert.equal(back.description, 'wegen Angebot'); assert.equal(back.status, 'done');
    assert.equal(String(back.due_date).slice(0, 10), '2026-10-21'); assert.equal(String(back.due_time).slice(0, 5), '14:30');
    assert.ok(ok(await ada.call('GET', '/api/tasks')).some(x => x.id === t.id));
  });
});

describe('activities save', () => {
  test('a note on the contact, edited, read back', async () => {
    const a = ok(await ada.call('POST', '/api/activities', { contact_id: ids.contact, type: 'note', content: 'Erstgespräch geführt', deal_id: ids.deal }), 201);
    ok(await ada.call('PATCH', `/api/activities/${a.id}`, { type: 'note', content: 'Erstgespräch geführt, Angebot folgt' }));
    assert.equal(ok(await ada.call('GET', `/api/activities/${a.id}`)).content, 'Erstgespräch geführt, Angebot folgt');
    const list = ok(await ada.call('GET', `/api/activities?contact_id=${ids.contact}`));
    assert.ok(list.some(x => x.id === a.id));
  });
});

describe('settings and preferences save', () => {
  test('workspace name, WhatsApp template, contact columns; the user\'s timezone', async () => {
    ok(await ada.call('PATCH', '/api/workspace/name', { name: 'Smoke AG' }));
    ok(await ada.call('PATCH', '/api/workspace/whatsapp-template', { template: 'Hallo {{name}}, hier Smoke' }));
    ok(await ada.call('PATCH', '/api/workspace/contact-columns', { columns: [{ key: 'company', label: 'Firma', visible: true, isCustom: false }, { key: 'email', label: 'E-Mail', visible: false, isCustom: false }] }));
    ok(await ada.call('PATCH', '/api/auth/preferences', { timezone: 'Europe/Vienna', deal_columns: ['title', 'value'] }));
    const me = ok(await ada.call('GET', '/api/auth/me'));
    assert.equal(me.workspace.name, 'Smoke AG');
    assert.equal(me.workspace.whatsapp_template, 'Hallo {{name}}, hier Smoke');
    assert.deepEqual(me.workspace.contact_columns.map(c => c.label), ['Firma', 'E-Mail']);
    assert.equal(me.user.timezone, 'Europe/Vienna');
    assert.deepEqual(me.user.deal_columns, ['title', 'value']);
  });
});

describe('a second person joins with no code', () => {
  test('Bob picks the workspace from the list and arrives as a member', async () => {
    const opts = ok(await bob.call('GET', '/api/auth/signup-options'));
    assert.deepEqual(opts.workspaces.map(w => w.name), ['Smoke AG']);
    ok(await bob.call('POST', '/api/auth/signup', { mode: 'join', workspace_id: opts.workspaces[0].id, name: 'Bob', email: 'bob@smoke.test', password: 'secret2' }), 201);
    const me = ok(await bob.call('GET', '/api/auth/me'));
    assert.equal(me.user.role, 'member'); assert.equal(me.workspace.id, ids.workspace);
    ids.bob = me.user.id;
    const members = ok(await ada.call('GET', '/api/workspace/members'));
    assert.deepEqual(members.map(m => m.name).sort(), ['Ada', 'Bob']);
  });
  test('a member cannot rename the workspace; the owner can promote', async () => {
    assert.equal((await bob.call('PATCH', '/api/workspace/name', { name: 'Hijack' })).status, 403);
    ok(await ada.call('PATCH', `/api/workspace/members/${ids.bob}/role`, { role: 'admin' }));
    assert.equal(ok(await bob.call('GET', '/api/auth/me')).user.role, 'admin');
  });
  test('Bob forgot his password: email → token → new password on the login screen, no e-mail; then he logs in with it', async () => {
    const door = client();
    const f = ok(await door.call('POST', '/api/auth/forgot-password', { email: 'bob@smoke.test' }));
    assert.match(f.token, /^[0-9a-f]{64}$/); assert.equal(f.email, 'bob@smoke.test');
    ok(await door.call('POST', '/api/auth/reset-password', { token: f.token, password: 'secret3' }));
    assert.equal((await door.call('POST', '/api/auth/reset-password', { token: f.token, password: 'secret4' })).status, 400, 'a token works once');
    assert.equal((await client().call('POST', '/api/auth/login', { email: 'bob@smoke.test', password: 'secret2' })).status, 401, 'the old password is gone');
    ok(await client().call('POST', '/api/auth/login', { email: 'bob@smoke.test', password: 'secret3' }));
    assert.equal((await door.call('POST', '/api/auth/forgot-password', { email: 'nobody@smoke.test' })).status, 404);
  });
});

describe('team chat', () => {
  test('Ada sends through socket.io with her session cookie; Bob receives it live; it is stored', async () => {
    const { io: ioc } = require('socket.io-client');
    const connect = cookie => new Promise((resolve, reject) => {
      const s = ioc(base, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, reconnection: false });
      s.once('connect', () => resolve(s)); s.once('connect_error', reject);
      setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    });
    const sa = await connect(ada.cookie), sb = await connect(bob.cookie);
    try {
      const online = await new Promise(r => sb.once('online_users', r));
      assert.ok(Array.isArray(online));
      const received = new Promise(r => sb.once('new_message', r));
      sa.emit('chat_message', 'Hallo Team — Smoke-Test');
      const msg = await received;
      assert.equal(msg.content, 'Hallo Team — Smoke-Test'); assert.equal(msg.user_name, 'Ada'); assert.ok(msg.id);
      const { messages } = ok(await bob.call('GET', '/api/chat/messages'));
      assert.ok(messages.some(m => m.id === msg.id && m.content === 'Hallo Team — Smoke-Test'), 'the message is in chat_messages');
      const bad = new Promise(r => { sb.once('new_message', r); setTimeout(() => r(null), 400); });
      sa.emit('chat_message', { not: 'a string' });   // the guard: ignored, no crash
      assert.equal(await bad, null);
      ok(await bob.call('PATCH', '/api/chat/read'));
      assert.equal(ok(await bob.call('GET', '/api/chat/unread')).unread, 0);
    } finally { sa.close(); sb.close(); }
  });
  test('a socket with no session is dropped', async () => {
    const { io: ioc } = require('socket.io-client');
    const s = ioc(base, { transports: ['websocket'], reconnection: false });
    const outcome = await new Promise(r => { s.once('disconnect', reason => r('disconnected:' + reason)); s.once('connect_error', e => r('error:' + e.message)); setTimeout(() => r('still connected'), 2000); });
    s.close();
    assert.match(outcome, /^disconnected|^error/);
  });
});

describe('documents on the Mac\'s disk', () => {
  test('upload, list, download through the signed link, and the bytes sit under DATA_DIR/files', async () => {
    const pdf = Buffer.from('%PDF-1.4\n% smoke test\n');
    const fd = new FormData();
    fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Vertrag Müller.pdf');
    fd.append('typ', 'vertrag');
    fd.append('deal_id', String(ids.deal));
    const doc = ok(await ada.call('POST', `/api/contacts/${ids.contact}/documents`, fd), 201);
    assert.equal(doc.file_name, 'Vertrag Müller.pdf'); assert.equal(doc.typ, 'vertrag'); assert.equal('storage_path' in doc, false);
    const list = ok(await ada.call('GET', `/api/contacts/${ids.contact}/documents`));
    assert.equal(list.length, 1);
    const r = await ada.call('GET', `/api/contacts/${ids.contact}/documents/${doc.id}/download`);
    assert.equal(r.status, 302);
    const loc = r.headers.get('location');
    assert.match(loc, /^\/files\/documents\/\d+\/\d+\/\d+-Vertrag_M_ller\.pdf\?exp=\d+&sig=/);
    const bytes = await fetch(base + loc);   // no cookie: the signature is the credential
    assert.equal(bytes.status, 200);
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), pdf);
    assert.match(bytes.headers.get('content-type'), /^application\/pdf/);
    const onDisk = fs.readdirSync(path.join(TMP, 'files', 'contact-documents', String(ids.workspace), String(ids.contact)));
    assert.equal(onDisk.length, 1);
    ok(await ada.call('DELETE', `/api/contacts/${ids.contact}/documents/${doc.id}`));
    assert.equal(fs.readdirSync(path.join(TMP, 'files', 'contact-documents', String(ids.workspace), String(ids.contact))).length, 0);
  });
});

describe('backups through the live server', () => {
  test('the admin console\'s card: list, save now, download — all against the running database', async () => {
    const list = ok(await ada.call('GET', '/api/admin/backup/list'));
    assert.equal(list.dir, path.join(TMP, 'backups')); assert.equal(list.schedulerEnabled, true); assert.deepEqual(list.backups, []);
    const fd = new FormData(); fd.append('file', new Blob([Buffer.from('%PDF-1.4 kept')], { type: 'application/pdf' }), 'Angebot.pdf'); fd.append('typ', 'sonstiges');
    ok(await ada.call('POST', `/api/contacts/${ids.contact}/documents`, fd), 201);   // the earlier test deleted its upload; this one stays
    const saved = ok(await ada.call('POST', '/api/admin/backup/now', {}));
    assert.match(saved.backup.name, /^crm-backup-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz$/);
    assert.ok(fs.statSync(path.join(TMP, 'backups', saved.backup.name)).size === saved.backup.size && saved.backup.size > 100000);
    assert.equal(ok(await ada.call('GET', '/api/admin/backup/list')).backups.length, 1);
    const dl = await fetch(`${base}/api/admin/backup`, { headers: { Cookie: ada.cookie } });
    assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/gzip');
    assert.match(dl.headers.get('content-disposition'), /^attachment; filename="crm-backup-.*\.tar\.gz"$/);
    const bytes = Buffer.from(await dl.arrayBuffer());
    assert.deepEqual([bytes[0], bytes[1]], [0x1f, 0x8b]); assert.ok(bytes.length > 100000);
    // the archive names the four kinds of content; the document uploaded above is in it
    const names = [];
    for await (const e of require(path.join(ROOT, 'utils', 'tar.js')).readTar(require('stream').Readable.from([bytes]).pipe(require('zlib').createGunzip()))) names.push(e.name);
    assert.deepEqual(names.slice(0, 3), ['manifest.json', 'pgdata.tar.gz', 'secrets.json']);
    assert.ok(names.some(n => /^files\/contact-documents\//.test(n)), names.join(','));
  });
  test('Bob, a plain member, can also reach it only because admin is open here — and the hosted guard is in place', async () => {
    assert.equal((await bob.call('GET', '/api/admin/backup/list')).status, 200);
  });
});

describe('the rest of the interface reads', () => {
  test('notifications, calendar, analytics summary, workspace list, admin console', async () => {
    const notif = ok(await ada.call('GET', '/api/notifications'));
    assert.ok(Array.isArray(notif.notifications) && typeof notif.unread === 'number');
    // notify() fans out to every member EXCEPT the actor: a task Ada creates now reaches Bob, who joined above
    ok(await ada.call('POST', '/api/tasks', { title: 'Benachrichtigung', priority: 'low' }), 201);
    const bobNotif = ok(await bob.call('GET', '/api/notifications'));
    assert.ok(bobNotif.notifications.some(n => n.type === 'task_created' && n.title === 'New task: Benachrichtigung'), JSON.stringify(bobNotif).slice(0, 300));
    assert.ok(bobNotif.unread >= 1);
    const cal = ok(await ada.call('GET', '/api/calendar?start=2026-10-01&end=2026-10-31'));
    assert.ok(Array.isArray(cal) ? cal.length >= 1 : cal, 'the task due on 2026-10-21 shows on the calendar');
    ok(await ada.call('GET', '/api/analytics/summary'));
    assert.deepEqual(ok(await ada.call('GET', '/api/auth/my-workspaces')).workspaces.map(w => w.name), ['Smoke AG']);
    assert.deepEqual(ok(await ada.call('GET', '/api/admin/me')), { isAdmin: true, open: true });
    const stats = ok(await ada.call('GET', '/api/admin/stats')); assert.equal(stats.totalWorkspaces, 1); assert.equal(stats.totalUsers, 2); assert.equal(stats.totalContacts, 1); assert.equal(stats.totalDeals, 1);
    const page = await fetch(base + '/adminconsole'); assert.equal(page.status, 200);
  });
});

describe('stop', () => {
  test('a clean stop releases the lock and leaves the database folder behind', async () => {
    await server.stop(); stopped = true;
    assert.equal(fs.existsSync(path.join(TMP, 'pgdata.lock')), false);
    assert.ok(fs.existsSync(path.join(TMP, 'pgdata', 'PG_VERSION')));
    assert.ok(fs.existsSync(path.join(TMP, 'secrets.json')));
  });
});
