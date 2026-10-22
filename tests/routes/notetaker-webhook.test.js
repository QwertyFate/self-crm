// ROUTE tests for the Notetaker's result link (routes/notetaker.js, Part 2, 2026-10-20): POST /api/notetaker/webhook/
// <48 hex>, public, one secret link per recorded meeting. When the meeting is over the Notetaker POSTs the result there
// by itself (nobody waits for it): the CRM writes the notes as a note on the meeting's deal and contact (source
// 'notetaker', no author, signed "Notetaker" in the timeline) and tells the person who booked it with the bell.
// Served the way server.js serves it (raw bytes, 5 MB) over a fake pool. Pinned: the workspace, deal and contact come
// from the link's meeting, never from the body; one note per recording however often the result is delivered; a
// failed recording is written as such; other events are acknowledged and ignored; an unknown or malformed link is a
// 404; a result for another meeting is refused; with NOTETAKER_WEBHOOK_SECRET set the signature is required; the wiring
// in server.js, db.js, the timeline's author label and the bell.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const { loadRoute, ROOT } = require('../helpers/load-route');
const nt = require(path.join(ROOT, 'utils', 'notetaker.js'));

const WID = 7, LINK = 'a1'.repeat(24), OTHER = 'b2'.repeat(24), MEET = 'https://meet.google.com/abc-defg-hij';
const MEETING_TITLE = '30 Minuten zwischen Mara Kühn und Jana Weber';
const NOTES = { title: 'Angebot Elbstraße 12', language: 'de', summary: 'Jana Weber möchte besichtigen.', key_points: ['Preis 480.000 €'], decisions: [], action_items: [{ task: 'Exposé schicken', owner: 'Anna Weiß', due: 'Freitag' }], open_questions: [] };
const done = (over = {}) => ({ event: 'recording.completed', id: '818b8fe97480', external_id: 'crm-meeting-100', status: 'done', meeting_url: MEET, metadata: { workspace_id: '99', deal_id: '55', contact_id: '66', user_id: '9' }, language: 'de', transcript: { text: 'Anna Weiß: Hallo', speakers_labelled: true, turns: [] }, notes: NOTES, errors: { recording: null, transcript: null, notes: null }, ...over });

const state = {}; let told = [];
function reset() {
  told = [];
  Object.assign(state, {
    calls: [], nextId: 101,
    activities: [{ id: 100, workspace_id: WID, type: 'meeting', content: `${MEETING_TITLE}\n${MEET}`, deal_id: 12, contact_id: 5 },
                 { id: 200, workspace_id: 8, type: 'meeting', content: 'Elsewhere', deal_id: 30, contact_id: 31 }],
    recordings: [{ id: 1, workspace_id: WID, activity_id: 100, requested_by: 2, external_id: 'crm-meeting-100', language: 'de', callback_token: LINK, status: 'scheduled', job_id: '818b8fe97480', error: null, finished_at: null, note_activity_id: null },
                 { id: 2, workspace_id: 8, activity_id: 200, requested_by: 3, external_id: 'crm-meeting-200', language: 'en', callback_token: OTHER, status: 'scheduled', job_id: 'j_other', error: null, finished_at: null, note_activity_id: null }],
  });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (q === 'SELECT n.id, n.workspace_id, n.external_id, n.requested_by, n.language, n.finished_at, n.note_activity_id, a.content AS meeting_content, a.deal_id, a.contact_id FROM notetaker_recordings n JOIN activities a ON a.id = n.activity_id AND a.workspace_id = n.workspace_id WHERE n.callback_token = $1') {
      const r = state.recordings.find(x => x.callback_token === params[0]);
      const a = r && state.activities.find(x => x.id === r.activity_id && x.workspace_id === r.workspace_id);
      return { rows: r && a ? [{ id: r.id, workspace_id: r.workspace_id, external_id: r.external_id, requested_by: r.requested_by, language: r.language, finished_at: r.finished_at, note_activity_id: r.note_activity_id, meeting_content: a.content, deal_id: a.deal_id, contact_id: a.contact_id }] : [] };
    }
    if (q === "WITH claim AS ( UPDATE notetaker_recordings SET status=$1, error=$2, job_id=COALESCE(job_id, $3), finished_at=NOW(), updated_at=NOW() WHERE id=$4 AND finished_at IS NULL RETURNING workspace_id ) INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) SELECT workspace_id, $5::int, $6::int, 'note', $7::text, NULL, 'notetaker' FROM claim RETURNING id") {
      const r = state.recordings.find(x => x.id === params[3] && !x.finished_at);
      if (!r) return { rows: [] };
      Object.assign(r, { status: params[0], error: params[1], job_id: r.job_id ?? params[2], finished_at: '2026-10-21T13:00:00.000Z' });
      const a = { id: state.nextId++, workspace_id: r.workspace_id, contact_id: params[4], deal_id: params[5], type: 'note', content: params[6], created_by: null, source: 'notetaker' };
      state.activities.push(a);
      return { rows: [{ id: a.id }] };
    }
    if (q === 'UPDATE notetaker_recordings SET note_activity_id=$1 WHERE id=$2') {
      state.recordings.find(x => x.id === params[1]).note_activity_id = params[0];
      return { rows: [] };
    }
    throw new Error('unexpected query: ' + q);
  },
};

let base, server;
const envSaved = {};
before(async () => {
  for (const k of ['NOTETAKER_WEBHOOK_SECRET']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  const app = express();
  app.use('/api/notetaker/webhook', express.raw({ type: '*/*', limit: '5mb' }));   // as server.js
  app.use(express.json());
  app.use('/api/notetaker', loadRoute('notetaker.js', { pool, notifications: { notify() {}, notifyUser: async (...a) => { told.push(a); return true; } } }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections?.(); await new Promise(r => server.close(r)); for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; } });
beforeEach(() => { reset(); delete process.env.NOTETAKER_WEBHOOK_SECRET; });

// The Notetaker's own delivery: JSON with its headers, signed when a secret is given (webhooks.py _post_once).
const post = async (link, body, { secret, ts = String(Math.floor(Date.now() / 1000)), sig } = {}) => {
  const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Notetaker-Webhook/1', 'X-Notetaker-Event': body?.event || 'x', 'X-Notetaker-Delivery': crypto.randomBytes(16).toString('hex'), 'X-Notetaker-Timestamp': ts };
  if (secret) headers['X-Notetaker-Signature'] = sig || 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.`).update(raw).digest('hex');
  const r = await fetch(`${base}/api/notetaker/webhook/${link}`, { method: 'POST', headers, body: raw });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const notes = () => state.activities.filter(a => a.type === 'note');

describe('a finished recording', () => {
  test('the notes land on the meeting\'s deal and contact, in this workspace, as Notetaker\'s note; the booker is told', async () => {
    const r = await post(LINK, done());
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, kind: 'completed', activity_id: 101 });
    assert.deepEqual(notes(), [{ id: 101, workspace_id: WID, contact_id: 5, deal_id: 12, type: 'note', content: nt.resultNote(done(), 'de').content, created_by: null, source: 'notetaker' }], 'the body\'s metadata (workspace 99, deal 55) is never used');
    assert.match(notes()[0].content, /^Angebot Elbstraße 12\n\nJana Weber möchte besichtigen\.\n\nWichtige Punkte\n• Preis 480\.000 €\n\nAufgaben\n• Exposé schicken \(Anna Weiß\), bis Freitag$/);
    assert.deepEqual({ ...state.recordings[0], finished_at: !!state.recordings[0].finished_at }, { id: 1, workspace_id: WID, activity_id: 100, requested_by: 2, external_id: 'crm-meeting-100', language: 'de', callback_token: LINK, status: 'completed', job_id: '818b8fe97480', error: null, finished_at: true, note_activity_id: 101 });
    assert.deepEqual(told, [[WID, null, 2, { type: 'notetaker_done', category: 'activities', title: MEETING_TITLE, body: 'Angebot Elbstraße 12', entityType: 'deal', entityId: 12 }]]);
  });
  test('delivered again (a retry, a redeliver): acknowledged, still one note, nobody told twice', async () => {
    await post(LINK, done());
    const again = await post(LINK, done());
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, { success: true, already: true, activity_id: 101 });
    assert.equal(notes().length, 1); assert.equal(told.length, 1);
  });
  test('a recording that failed is written as such, with the reason, and the booker is told', async () => {
    const r = await post(LINK, { event: 'recording.failed', id: '818b8fe97480', external_id: 'crm-meeting-100', status: 'failed', errors: { recording: 'not admitted from the lobby within 15 minutes', transcript: null, notes: null } });
    assert.equal(r.status, 200); assert.equal(r.body.kind, 'failed');
    assert.equal(notes()[0].content, 'Notetaker konnte das Meeting nicht aufnehmen.\nGrund: not admitted from the lobby within 15 minutes');
    assert.equal(state.recordings[0].status, 'recording_failed'); assert.equal(state.recordings[0].error, 'not admitted from the lobby within 15 minutes');
    assert.deepEqual(told[0][3], { type: 'notetaker_failed', category: 'activities', title: MEETING_TITLE, body: 'not admitted from the lobby within 15 minutes', entityType: 'deal', entityId: 12 });
  });
  test('a meeting on a contact only: the note is on the contact and the bell opens the contact', async () => {
    state.activities[0].deal_id = null;
    await post(LINK, done());
    assert.equal(notes()[0].deal_id, null); assert.equal(notes()[0].contact_id, 5);
    assert.equal(told[0][3].entityType, 'contact'); assert.equal(told[0][3].entityId, 5);
  });
  test('a booker who has left: the note is still written, nobody is told', async () => {
    state.recordings[0].requested_by = null;
    const r = await post(LINK, done());
    assert.equal(r.status, 200); assert.equal(notes().length, 1); assert.equal(told.length, 0);
  });
  test('a whole transcript fits: a 2 MB result is accepted', async () => {
    const r = await post(LINK, done({ transcript: { text: 'Anna Weiß: ' + 'blah '.repeat(400000), turns: [] } }));
    assert.equal(r.status, 200); assert.equal(notes().length, 1);
  });
});

describe('what is ignored or refused', () => {
  test('any other event is acknowledged (so it is not retried) and writes nothing', async () => {
    for (const event of ['recording.scheduled', 'recording.in_progress', 'recording.cancelled']) {
      const r = await post(LINK, done({ event }));
      assert.equal(r.status, 200); assert.deepEqual(r.body, { ignored: true });
    }
    assert.equal(notes().length, 0); assert.equal(state.recordings[0].finished_at, null); assert.equal(told.length, 0);
  });
  test('an unknown link is a 404; a malformed one is a 404 without asking the database', async () => {
    assert.equal((await post('c3'.repeat(24), done())).status, 404);
    const n = state.calls.length;
    for (const bad of ['abc', 'g'.repeat(48), 'A1'.repeat(24), LINK + '0']) assert.equal((await post(bad, done())).status, 404, bad);
    assert.equal(state.calls.length, n);
    assert.equal(notes().length, 0);
  });
  test('the result of another meeting on this link is refused', async () => {
    const r = await post(LINK, done({ external_id: 'crm-meeting-200' }));
    assert.equal(r.status, 400); assert.equal(notes().length, 0);
  });
  test('a body that is not JSON is refused', async () => {
    const r = await post(LINK, '{not json');
    assert.equal(r.status, 400); assert.equal(notes().length, 0);
  });
  test('with NOTETAKER_WEBHOOK_SECRET set: unsigned, wrongly signed or stale results are refused; a signed one lands', async () => {
    process.env.NOTETAKER_WEBHOOK_SECRET = 'shared-secret';
    assert.equal((await post(LINK, done())).status, 401);
    assert.equal((await post(LINK, done(), { secret: 'other-secret' })).status, 401);
    assert.equal((await post(LINK, done(), { secret: 'shared-secret', ts: String(Math.floor(Date.now() / 1000) - 600) })).status, 401);
    assert.equal(notes().length, 0);
    const ok = await post(LINK, done(), { secret: 'shared-secret' });
    assert.equal(ok.status, 200); assert.equal(notes().length, 1);
  });
});

describe('the wiring', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  test('server.js: raw bytes up to 5 MB before json(), the inbound limits, then the public router', () => {
    const s = read('server.js');
    const raw = s.indexOf("app.use('/api/notetaker/webhook', express.raw({ type: '*/*', limit: '5mb' }));");
    assert.ok(raw > 0 && raw < s.indexOf('app.use(express.json());'));
    assert.match(s, /const notetakerLinkLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000, max: 30,[\s\S]*?keyGenerator: \(req\) => req\.path \|\| 'unknown',\s*\}\);/);
    const lim = s.indexOf("app.use('/api/notetaker/webhook', webhookIpLimiter, notetakerLinkLimiter);");
    const mount = s.indexOf("app.use('/api/notetaker',     require('./routes/notetaker'));");
    assert.ok(lim > 0 && mount > lim);
  });
  test('the router is public on purpose: no session, the link and the signature are the guard', () => {
    const r = read('routes/notetaker.js');
    assert.doesNotMatch(r, /requireAuth|middleware\/auth/);
    assert.match(r, /router\.post\('\/webhook\/:token'/);
  });
  test('db.js: the link, the note and the end are kept per recording; activities may come from the Notetaker', () => {
    const db = read('db.js');
    assert.match(db, /ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS callback_token\s+TEXT UNIQUE/);
    assert.match(db, /ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS note_activity_id INTEGER/);
    assert.match(db, /ALTER TABLE notetaker_recordings ADD COLUMN IF NOT EXISTS finished_at\s+TIMESTAMPTZ/);
    assert.ok(db.indexOf('ADD COLUMN IF NOT EXISTS callback_token') > db.indexOf('CREATE TABLE IF NOT EXISTS notetaker_recordings'));
    assert.match(db, /ADD CONSTRAINT activities_source_check CHECK\(source IN \('user','engine','calcom','notetaker'\)\)/);
  });
  test('the timelines sign a Notetaker note "Notetaker", as the Engine\'s are signed "Upgrads Engine"', () => {
    const label = /COALESCE\(u\.name, CASE WHEN a\.source = 'engine' THEN 'Upgrads Engine' WHEN a\.source = 'notetaker' THEN 'Notetaker' END\) AS logged_by_name/g;
    assert.equal((read('routes/activities.js').match(label) || []).length, 2);
    assert.equal((read('routes/contacts.js').match(label) || []).length, 1);
  });
  test('the bell: two kinds with their own icon and line, in both languages, German impersonal', () => {
    const notif = read('public/js/notifications.js');
    assert.match(notif, /notetaker_done:\s+'📝',[^\n]*\n\s*notetaker_failed:\s+'⚠️',/);
    assert.match(notif, /notetaker_done: 'notif_notetaker_done', notetaker_failed: 'notif_notetaker_failed' \};$/m);
    const { sliceConst } = require('../helpers/client-fn');
    const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    assert.equal(dict.en.notif_notetaker_done, 'Notetaker notes are in'); assert.equal(dict.de.notif_notetaker_done, 'Notetaker-Notizen sind da');
    assert.equal(dict.en.notif_notetaker_failed, 'Notetaker could not record'); assert.equal(dict.de.notif_notetaker_failed, 'Notetaker konnte nicht aufnehmen');
  });
  test('.env.example names the signing secret', () => {
    assert.match(read('.env.example'), /^# ?NOTETAKER_WEBHOOK_SECRET=$/m);
  });
});
