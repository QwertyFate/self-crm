// UNIT tests for the Notetaker's way back (utils/notetaker.js, Part 2, 2026-10-20). Each recorded meeting gets its own
// secret result link (<NOTETAKER_CALLBACK_URL>/<48 hex>), sent as callback_url; when the meeting is over, the
// Notetaker POSTs the result there on its own (recording.completed with the transcript and Claude's notes, or
// recording.failed), signed with X-Notetaker-Signature: sha256=<HMAC of "<timestamp>.<raw body>"> when
// NOTETAKER_WEBHOOK_SECRET is set on both sides. Pinned: the link, the signature check (right, wrong, stale, missing),
// and the note the CRM writes from the result: the notes' title, summary and lists in the notes' language, empty lists
// left out, the reason when there are no notes or no recording, a partial recording marked, other events ignored.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const nt = require(path.join(ROOT, 'utils', 'notetaker.js'));

const ENV = ['NOTETAKER_CALLBACK_URL', 'NOTETAKER_WEBHOOK_SECRET', 'PORT'];
const saved = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const NOTES_DE = { title: 'Angebot Elbstraße 12', language: 'de', summary: 'Jana Weber möchte die Wohnung besichtigen. Der Preis bleibt bei 480.000 €.', key_points: ['Preis 480.000 €', 'Besichtigung am Samstag'], decisions: ['Das Exposé wird geschickt'], action_items: [{ task: 'Exposé schicken', owner: 'Anna Weiß', due: 'Freitag' }, { task: 'Finanzierung klären', owner: null, due: null }], open_questions: [] };
const done = (over = {}) => ({ event: 'recording.completed', id: '818b8fe97480', external_id: 'crm-meeting-100', status: 'done', language: 'de', transcript: { text: 'Anna Weiß: Hallo zusammen', speakers_labelled: true, turns: [] }, notes: NOTES_DE, errors: { recording: null, transcript: null, notes: null }, ...over });

describe('the result link', () => {
  test('a fresh secret per meeting (48 hex), under the callback address; no token is the bare address', () => {
    const a = nt.newCallbackToken(), b = nt.newCallbackToken();
    assert.match(a, /^[0-9a-f]{48}$/); assert.notEqual(a, b);
    assert.equal(nt.callbackUrlFor(a), `http://localhost:3000/api/notetaker/webhook/${a}`);
    process.env.NOTETAKER_CALLBACK_URL = 'http://localhost:4001/api/notetaker/webhook/';
    assert.equal(nt.callbackUrlFor('ab'.repeat(24)), `http://localhost:4001/api/notetaker/webhook/${'ab'.repeat(24)}`, 'a trailing slash is not doubled');
    assert.equal(nt.callbackUrlFor(null), 'http://localhost:4001/api/notetaker/webhook');
  });
  test('the request carries the meeting\'s own link as callback_url', () => {
    const p = nt.payload({ meetingUrl: 'https://meet.google.com/abc-defg-hij', callbackToken: 'cd'.repeat(24) });
    assert.equal(p.callback_url, `http://localhost:3000/api/notetaker/webhook/${'cd'.repeat(24)}`);
  });
  test('the signing secret is NOTETAKER_WEBHOOK_SECRET, none by default', () => {
    assert.equal(nt.config().webhookSecret, null);
    process.env.NOTETAKER_WEBHOOK_SECRET = '  shh  ';
    assert.equal(nt.config().webhookSecret, 'shh');
  });
});

describe('the signature', () => {
  const SECRET = 'notetaker-secret', raw = Buffer.from(JSON.stringify(done()));
  const now = 1792500000000, ts = String(now / 1000);
  const sig = (t, body = raw, s = SECRET) => 'sha256=' + crypto.createHmac('sha256', s).update(`${t}.`).update(body).digest('hex');
  test('the service\'s own scheme: sha256=<HMAC-SHA256 of "<timestamp>.<raw body>">', () => {
    assert.equal(nt.verifySignature(raw, ts, sig(ts), SECRET, now), true);
  });
  test('wrong secret, changed body, missing header, or a timestamp over five minutes off: refused', () => {
    assert.equal(nt.verifySignature(raw, ts, sig(ts, raw, 'other'), SECRET, now), false);
    assert.equal(nt.verifySignature(Buffer.from('{"event":"x"}'), ts, sig(ts), SECRET, now), false);
    assert.equal(nt.verifySignature(raw, ts, undefined, SECRET, now), false);
    assert.equal(nt.verifySignature(raw, undefined, sig(ts), SECRET, now), false);
    assert.equal(nt.verifySignature(raw, 'abc', sig('abc'), SECRET, now), false);
    const old = String(now / 1000 - 301);
    assert.equal(nt.verifySignature(raw, old, sig(old), SECRET, now), false);
    const near = String(now / 1000 - 299);
    assert.equal(nt.verifySignature(raw, near, sig(near), SECRET, now), true);
  });
});

describe('the note from the result', () => {
  test('notes: the title, the summary and each list under its heading, in German; an empty list is left out', () => {
    const r = nt.resultNote(done(), 'de');
    assert.equal(r.kind, 'completed'); assert.equal(r.title, 'Angebot Elbstraße 12'); assert.equal(r.reason, null);
    assert.equal(r.content, [
      'Angebot Elbstraße 12', '',
      'Jana Weber möchte die Wohnung besichtigen. Der Preis bleibt bei 480.000 €.', '',
      'Wichtige Punkte', '• Preis 480.000 €', '• Besichtigung am Samstag', '',
      'Entscheidungen', '• Das Exposé wird geschickt', '',
      'Aufgaben', '• Exposé schicken (Anna Weiß), bis Freitag', '• Finanzierung klären',
    ].join('\n'));
  });
  test('English notes get English headings, whatever language the booking was made in', () => {
    const notes = { ...NOTES_DE, language: 'en', title: 'Offer', summary: 'Short.', key_points: [], decisions: [], action_items: [{ task: 'Send the brochure', owner: 'Tom', due: 'Friday' }], open_questions: ['Parking?'] };
    assert.equal(nt.resultNote(done({ notes }), 'de').content, ['Offer', '', 'Short.', '', 'Action items', '• Send the brochure (Tom), due Friday', '', 'Open questions', '• Parking?'].join('\n'));
  });
  test('recorded but no notes: says so with the reason, in the booking\'s language', () => {
    const r = nt.resultNote(done({ notes: null, errors: { recording: null, transcript: null, notes: 'no Claude API key: put ANTHROPIC_API_KEY=sk-ant-... in .env' } }), 'de');
    assert.equal(r.kind, 'completed'); assert.equal(r.title, null);
    assert.equal(r.content, 'Notetaker hat das Meeting aufgenommen, aber keine Notizen geschrieben.\nGrund: no Claude API key: put ANTHROPIC_API_KEY=sk-ant-... in .env');
    assert.equal(nt.resultNote(done({ notes: null, errors: { transcript: 'whisper crashed' } }), 'en').content, 'Notetaker recorded the meeting but wrote no notes.\nReason: whisper crashed');
  });
  test('a partial recording keeps its notes and says it was partial', () => {
    const r = nt.resultNote(done({ errors: { recording: 'partial recording: the bot stopped after 12 minutes', transcript: null, notes: null } }), 'de');
    assert.match(r.content, /^Angebot Elbstraße 12\n/);
    assert.match(r.content, /\n\nHinweis: partial recording: the bot stopped after 12 minutes$/);
  });
  test('no recording: says so with the reason', () => {
    const r = nt.resultNote({ event: 'recording.failed', status: 'failed', errors: { recording: 'not admitted from the lobby within 15 minutes' } }, 'de');
    assert.deepEqual(r, { kind: 'failed', title: null, reason: 'not admitted from the lobby within 15 minutes', content: 'Notetaker konnte das Meeting nicht aufnehmen.\nGrund: not admitted from the lobby within 15 minutes' });
    assert.equal(nt.resultNote({ event: 'recording.failed', status: 'missed' }, 'en').content, 'Notetaker could not record the meeting.\nReason: missed');
  });
  test('any other event, or no event, writes nothing', () => {
    for (const b of [{ event: 'recording.scheduled' }, { event: 'recording.in_progress' }, { event: 'recording.cancelled' }, {}, null, 'x']) assert.equal(nt.resultNote(b, 'de').kind, 'ignored');
  });
  test('odd shapes are survived: lists that are not lists, items that are not text, overlong text cut', () => {
    const r = nt.resultNote(done({ notes: { title: 'T', summary: 'x'.repeat(9000), key_points: 'not a list', decisions: [null, 7, ' kept '], action_items: [{ owner: 'nobody' }, 'Call back'], open_questions: undefined } }), 'de');
    assert.equal(r.kind, 'completed');
    assert.ok(r.content.length <= 20000);
    assert.match(r.content, /\n\nEntscheidungen\n• 7\n• kept\n\nAufgaben\n• Call back$/);
    assert.doesNotMatch(r.content, /Wichtige Punkte|nobody/);
  });
});
