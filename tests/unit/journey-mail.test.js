// UNIT tests for utils/journey-mail.js (CUSTOMER_JOURNEY_CHANGES Part 2, 2026-11-19): the Google side of the
// journey's sending address, over a fake Google (globalThis.fetch).
//
// Pinned: Google is asked for sending only (openid, email, gmail.send — never for reading); the state is accepted
// only when this server signed it for this flow, this person and this workspace, and not yet expired; the address
// comes from the ID token; a refresh token Google no longer accepts is told apart from a refusal and from an outage;
// a message's headers cannot be extended by what is put into them; the text and the HTML arrive as they were
// written; the token is sealed at rest.
// Part 17 (2026-11-20): Google's "too much" — HTTP 429, or 403 with one of its rate reasons — is told apart from
// every other refusal (code 'limited'), with the time Google names for trying again; a message carries the two
// one-click unsubscribe headers for an https address, and for nothing else.
const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const ENV = { GOOGLE_MAIL_CLIENT_ID: 'cid-123.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret', SESSION_SECRET: 'test-session-secret' };
const saved = {};
for (const k of [...Object.keys(ENV), 'CALCOM_ENCRYPTION_KEY']) saved[k] = process.env[k];
Object.assign(process.env, ENV); delete process.env.CALCOM_ENCRYPTION_KEY;

const mail  = require('../../utils/journey-mail');
const gmail = require('../../utils/gmail');   // the mailbox flow that is on hold: its states must not pass here
const { read } = require('../helpers/client-fn');

const SEND = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN = 'https://oauth2.googleapis.com/token', REVOKE = 'https://oauth2.googleapis.com/revoke', SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const ME = { userId: 1, workspaceId: 7 };

// ── the fake Google: `plan` maps a URL to { status, body } or { throw: true } ──
const realFetch = globalThis.fetch;
let google = [];
function fakeGoogle(plan) {
  google = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const sent = typeof init.body === 'string' ? (String(init.headers?.['Content-Type'] || '').includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : undefined;
    google.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: sent });
    const r = plan[u] || { status: 404, body: { error: 'not_found' } };
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers || {}) } });
  };
}
const idToken = claims => ['eyJhbGciOiJSUzI1NiJ9', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const tokenOk = (extra = {}) => ({ status: 200, body: { access_token: 'ya29.access', refresh_token: '1//refresh-plain', scope: `openid https://www.googleapis.com/auth/userinfo.email ${SEND}`,
  token_type: 'Bearer', expires_in: 3599, id_token: idToken({ sub: '1', email: 'News@Firma.de', email_verified: true }), ...extra } });

after(() => { globalThis.fetch = realFetch; for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
beforeEach(() => { Object.assign(process.env, ENV); fakeGoogle({}); });

describe('what Google is asked for', () => {
  test('sending only: openid and email to learn the address, gmail.send to send — nothing that reads the mailbox', () => {
    assert.deepEqual(mail.SCOPES, ['openid', 'email', SEND]);
    const code = read('utils/journey-mail.js').replace(/\/\*[\s\S]*?\*\//, '');   // the code without its header
    assert.doesNotMatch(code, /gmail\.(readonly|modify|compose|metadata)|mail\.google\.com/);
    assert.equal(mail.canSend(['openid', SEND]), true);
    for (const granted of [['openid', 'email'], [], undefined, 'x', ['https://www.googleapis.com/auth/gmail.readonly']]) assert.equal(mail.canSend(granted), false);
  });
  test('the sign-in address: Google\'s page, this client, offline, a fresh consent, the redirect and the state as given', () => {
    const url = new URL(mail.authUrl({ redirectUri: 'https://crm.example.de/api/journey/mail/google/callback', state: 'S.1' }));
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      client_id: ENV.GOOGLE_MAIL_CLIENT_ID, redirect_uri: 'https://crm.example.de/api/journey/mail/google/callback', response_type: 'code',
      scope: `openid email ${SEND}`, access_type: 'offline', prompt: 'consent', state: 'S.1',
    });
  });
  test('set up or not follows the two lines in .env', () => {
    assert.equal(mail.isConfigured(), true);
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    assert.equal(mail.isConfigured(), false);
    process.env.GOOGLE_MAIL_CLIENT_SECRET = '   ';
    assert.equal(mail.isConfigured(), false);
  });
});

describe('the state', () => {
  test('accepted for the person and workspace it was signed for, until it expires', () => {
    const now = Date.UTC(2026, 10, 19, 9, 0, 0);
    const state = mail.signState(ME, now);
    assert.match(state, /^1\.7\.\d+\.[\w-]+\.[\w-]+$/);
    assert.equal(mail.checkState(state, ME, now + 9 * 60 * 1000), true);
    assert.equal(mail.checkState(state, ME, now + 10 * 60 * 1000 + 1), false, 'ten minutes');
    assert.equal(mail.checkState(state, { userId: 2, workspaceId: 7 }, now), false, 'another person');
    assert.equal(mail.checkState(state, { userId: 1, workspaceId: 8 }, now), false, 'another workspace');
    assert.notEqual(mail.signState(ME, now), state, 'never the same twice');
  });
  test('refused when changed, cut, or not a state at all', () => {
    const now = Date.now(), state = mail.signState(ME, now), p = state.split('.');
    const later = [p[0], p[1], String(Number(p[2]) + 3600000), p[3], p[4]].join('.');
    assert.equal(mail.checkState(later, ME, now), false, 'a longer life');
    assert.equal(mail.checkState([2, p[1], p[2], p[3], p[4]].join('.'), { userId: 2, workspaceId: 7 }, now), false, 'another person written in');
    for (const bad of [p.slice(0, 4).join('.'), state + 'x', '', null, undefined, 5, {}, 'a.b.c.d.e']) assert.equal(mail.checkState(bad, ME, now), false, String(bad));
  });
  test('a state signed for the mailbox flow is no good here, and this one is no good there', () => {
    const now = Date.now();
    assert.equal(mail.checkState(gmail.signState(ME, now), ME, now), false);
    assert.equal(gmail.checkState(mail.signState(ME, now), ME, now), false);
  });
});

describe('the code from Google\'s callback', () => {
  test('is traded once for the tokens; the address comes from the ID token, in lower case', async () => {
    fakeGoogle({ [TOKEN]: tokenOk() });
    const out = await mail.exchangeCode('4/code', 'https://crm.example.de/cb');
    assert.deepEqual(out, { refreshToken: '1//refresh-plain', accessToken: 'ya29.access', scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email', SEND], email: 'news@firma.de', emailVerified: true });
    assert.equal(google.length, 1);
    assert.deepEqual(google[0].body, { code: '4/code', client_id: ENV.GOOGLE_MAIL_CLIENT_ID, client_secret: ENV.GOOGLE_MAIL_CLIENT_SECRET, redirect_uri: 'https://crm.example.de/cb', grant_type: 'authorization_code' });
    assert.equal(google[0].method, 'POST');
  });
  test('no ID token, one that cannot be read, no address in it, an address that is none: no address', async () => {
    for (const id_token of [undefined, 'garbage', 'a.b.c', idToken({ sub: '1' }), idToken({ email: 'Name <a@b.de>' }), idToken(['x']), idToken({ email: 5 })]) {
      fakeGoogle({ [TOKEN]: tokenOk({ id_token }) });
      assert.equal((await mail.exchangeCode('c', 'r')).email, null, String(id_token));
    }
  });
  test('an address Google has not verified is reported as such', async () => {
    for (const [value, want] of [[false, false], [undefined, false], ['false', false], ['true', true], [true, true]]) {
      fakeGoogle({ [TOKEN]: tokenOk({ id_token: idToken({ email: 'a@b.de', email_verified: value }) }) });
      assert.equal((await mail.exchangeCode('c', 'r')).emailVerified, want, String(value));
    }
  });
  test('what Google left out is null, not a guess', async () => {
    fakeGoogle({ [TOKEN]: { status: 200, body: { access_token: 'a' } } });
    assert.deepEqual(await mail.exchangeCode('c', 'r'), { refreshToken: null, accessToken: 'a', scopes: [], email: null, emailVerified: false });
  });
  test('a refusal carries Google\'s own words; an outage is told apart', async () => {
    fakeGoogle({ [TOKEN]: { status: 400, body: { error: 'redirect_uri_mismatch', error_description: 'Bad Request' } } });
    await assert.rejects(mail.exchangeCode('c', 'r'), e => e instanceof mail.MailError && e.code === 'rejected' && e.message === 'Bad Request');
    fakeGoogle({ [TOKEN]: { throw: true } });
    await assert.rejects(mail.exchangeCode('c', 'r'), e => e instanceof mail.MailError && e.code === 'unreachable');
  });
});

describe('a fresh access token', () => {
  test('is asked for with the saved refresh token', async () => {
    fakeGoogle({ [TOKEN]: { status: 200, body: { access_token: 'ya29.new', expires_in: 3599 } } });
    assert.equal(await mail.accessToken('1//refresh-plain'), 'ya29.new');
    assert.deepEqual(google[0].body, { refresh_token: '1//refresh-plain', client_id: ENV.GOOGLE_MAIL_CLIENT_ID, client_secret: ENV.GOOGLE_MAIL_CLIENT_SECRET, grant_type: 'refresh_token' });
  });
  test('"gone" when Google no longer accepts the sign-in; "rejected" for any other refusal; "unreachable" for an outage', async () => {
    fakeGoogle({ [TOKEN]: { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'gone' && e.message === 'Token has been expired or revoked.');
    fakeGoogle({ [TOKEN]: { status: 401, body: { error: 'invalid_client' } } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'rejected' && e.message === 'invalid_client');
    fakeGoogle({ [TOKEN]: { status: 500, body: {} } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'rejected' && e.message === 'HTTP 500');
    fakeGoogle({ [TOKEN]: { throw: true } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'unreachable');
    fakeGoogle({ [TOKEN]: { status: 200, body: {} } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'rejected');
  });
  test('without the two lines in .env nothing is asked of Google', async () => {
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    await assert.rejects(mail.accessToken('x'), e => e instanceof mail.MailError && e.code === 'rejected');
    assert.equal(google.length, 0);
  });
});

describe('one address', () => {
  test('an address, and nothing but an address', () => {
    for (const ok of ['news@firma.de', 'a.b+c@sub.example.co.uk', 'x_y-z@d-e.io']) assert.equal(mail.isAddress(ok), true, ok);
    for (const bad of ['', 'firma.de', 'a@b', 'Name <a@b.de>', 'a@b.de, c@d.de', 'a@b.de;c@d.de', 'a@b.de\r\nBcc: x@y.de', 'a@b.de\nX: 1', 'a b@c.de', 'a@@b.de', 'müller@firma.de', 'a@b.de ', null, undefined, 5,
      ['a@b.de'], 'a'.repeat(250) + '@b.de']) assert.equal(mail.isAddress(bad), false, String(bad).slice(0, 30));
  });
});

// what a mail program makes of a header's encoded words
const decodeHeader = v => v.replace(/\r\n /g, '').replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));

describe('a header\'s text', () => {
  test('plain and short stays as it is', () => {
    assert.equal(mail.headerText('Your offer'), 'Your offer');
    assert.equal(mail.headerText(''), '');
    assert.equal(mail.headerText(null), '');
  });
  test('umlauts, and anything long, go as encoded words that read back as written', () => {
    const subject = 'Test: Die E-Mail-Verbindung des CRM funktioniert für Müller & Söhne — schön 🎉';
    const out = mail.headerText(subject);
    assert.match(out, /^=\?UTF-8\?B\?/);
    for (const line of out.split('\r\n ')) { assert.match(line, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/); assert.ok('Subject: '.length + line.length <= 78, `a word of ${line.length} characters`); }
    assert.equal(decodeHeader(out), subject);
    assert.ok(out.split('\r\n ').length >= 2, 'more than one word');
    const long = 'x'.repeat(200);
    assert.equal(decodeHeader(mail.headerText(long)), long);
  });
  test('no word is cut inside a character', () => {
    const subject = 'ä'.repeat(120) + '🎉'.repeat(30);
    for (const line of mail.headerText(subject).split('\r\n ')) {
      const bytes = Buffer.from(line.replace(/^=\?UTF-8\?B\?|\?=$/g, ''), 'base64');
      assert.equal(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes), true, 'every word is whole UTF-8');
    }
  });
  test('a line break or a made-up encoded word in the value cannot become part of the header', () => {
    const out = mail.headerText('Hello\r\nBcc: victim@example.de');
    assert.doesNotMatch(out, /[\r\n]/);
    assert.equal(out, 'Hello Bcc: victim@example.de', 'one line, as text');
    assert.match(mail.headerText('=?UTF-8?B?eA==?='), /^=\?UTF-8\?B\?PT9VVEYtOD9CP2VBPT0\/PQ==\?=$/, 'encoded again, so it is read as the text it is');
  });
});

describe('a message', () => {
  const M = { from: 'news@firma.de', to: 'lead@example.de', subject: 'Schön, dass es klappt', text: 'Hallo,\n\ndas ist Text mit Ümlauten.', html: '<p style="color:#18345D">Hallo,<br><b>das</b> ist HTML mit Ümlauten 🎉</p>' };
  const bodyOf = (msg, type) => {
    const m = msg.match(new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]*?)\\r\\n(?:--|$)`));
    return m ? Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : null;
  };
  test('with HTML: both versions side by side, each exactly as written', () => {
    const msg = mail.buildMessage(M);
    const [head] = msg.split('\r\n\r\n');
    const lines = head.split('\r\n');
    assert.deepEqual(lines.slice(0, 2), ['From: news@firma.de', 'To: lead@example.de']);
    assert.match(lines[2], /^Subject: =\?UTF-8\?B\?/);
    assert.equal(decodeHeader(lines[2].slice('Subject: '.length)), M.subject);
    assert.equal(lines[3], 'MIME-Version: 1.0');
    const boundary = lines[4].match(/^Content-Type: multipart\/alternative; boundary="(crm-[0-9a-f]{24})"$/)[1];
    assert.equal(msg.split(`--${boundary}\r\n`).length, 3, 'two parts');
    assert.ok(msg.endsWith(`--${boundary}--\r\n`));
    assert.equal(bodyOf(msg, 'text/plain'), M.text);
    assert.equal(bodyOf(msg, 'text/html'), M.html);
    assert.ok(msg.indexOf('text/plain') < msg.indexOf('text/html'), 'plain first: a mail program shows the last version it can');
    for (const line of msg.split('\r\n')) assert.ok(line.length <= 78, `a line of ${line.length} characters`);
    assert.doesNotMatch(msg.replace(/\r\n/g, ''), /[\r\n]/, 'every line ends the mail way');
  });
  test('a long text is cut into lines of 76 and reads back whole', () => {
    const text = 'Zeile mit Ümlaut. '.repeat(400);
    const msg = mail.buildMessage({ ...M, text, html: `<p>${text}</p>` });
    assert.equal(bodyOf(msg, 'text/plain'), text);
    assert.equal(bodyOf(msg, 'text/html'), `<p>${text}</p>`);
  });
  test('without HTML: one plain text', () => {
    for (const html of [undefined, '', null]) {
      const msg = mail.buildMessage({ ...M, html });
      assert.doesNotMatch(msg, /multipart|text\/html/);
      assert.equal(bodyOf(msg, 'text/plain'), M.text);
    }
  });
  test('two messages never share a boundary', () => {
    const b = m => m.match(/boundary="([^"]+)"/)[1];
    assert.notEqual(b(mail.buildMessage(M)), b(mail.buildMessage(M)));
  });
  test('the sender and the recipient are one address each, or nothing is written', () => {
    for (const patch of [{ to: 'lead@example.de\r\nBcc: victim@example.de' }, { to: 'a@b.de, c@d.de' }, { to: 'Name <a@b.de>' }, { to: '' }, { to: undefined }, { from: 'x' }, { from: 'news@firma.de\nX-A: 1' }]) {
      assert.throws(() => mail.buildMessage({ ...M, ...patch }), TypeError, JSON.stringify(patch));
    }
  });
  test('nothing typed into the subject, the text or the HTML can add a header', () => {
    const msg = mail.buildMessage({ ...M, subject: 'Hi\r\nBcc: victim@example.de', text: 'x\r\nBcc: victim@example.de', html: '<p>\r\nBcc: victim@example.de</p>' });
    const head = msg.split('\r\n\r\n')[0];
    assert.doesNotMatch(head, /^Bcc:/m);
    assert.equal(head.split('\r\n').filter(l => /^[A-Za-z-]+:/.test(l)).map(l => l.split(':')[0]).join(','), 'From,To,Subject,MIME-Version,Content-Type');
    assert.equal(head.split('\r\n')[2], 'Subject: Hi Bcc: victim@example.de', 'the subject\'s line break is a space: one line, read as the subject');
    assert.doesNotMatch(msg.slice(head.length), /victim@example\.de|Bcc/, 'the text and the HTML are inside their encoded parts, nowhere in the clear');
  });
});

describe('sending', () => {
  test('one message goes to Gmail with the access token, base64url, and Gmail\'s id comes back', async () => {
    fakeGoogle({ [SEND_URL]: { status: 200, body: { id: '18c0ffee', threadId: '18c0ffee', labelIds: ['SENT'] } } });
    const message = mail.buildMessage({ from: 'news@firma.de', to: 'lead@example.de', subject: 'Hallo', text: 'Ümlaut', html: '<b>Ümlaut</b>' });
    assert.deepEqual(await mail.send('ya29.access', message), { id: '18c0ffee' });
    const [call] = google;
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, 'Bearer ya29.access');
    assert.deepEqual(Object.keys(call.body), ['raw']);
    assert.match(call.body.raw, /^[A-Za-z0-9_-]+$/, 'base64url: no +, / or =');
    assert.equal(Buffer.from(call.body.raw, 'base64url').toString('utf8'), message);
  });
  test('a refusal carries Google\'s own words; an outage is told apart', async () => {
    fakeGoogle({ [SEND_URL]: { status: 400, body: { error: { code: 400, message: 'Mail service not enabled', status: 'FAILED_PRECONDITION' } } } });
    await assert.rejects(mail.send('t', 'm'), e => e instanceof mail.MailError && e.code === 'rejected' && e.message === 'Mail service not enabled');
    // (a 429 was "rejected" here until Part 17: it is 'limited' now — see "Google says too much" below)
    fakeGoogle({ [SEND_URL]: { status: 403, body: { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } } } });
    await assert.rejects(mail.send('t', 'm'), e => e.code === 'rejected' && /insufficient authentication scopes/.test(e.message) && e.retryAt === null);
    fakeGoogle({ [SEND_URL]: { throw: true } });
    await assert.rejects(mail.send('t', 'm'), e => e.code === 'unreachable');
  });
});

// Part 17: what Google answers when an address sends too much, with bodies as Google writes them.
describe('Google says "too much": told apart from every other refusal', () => {
  const said = async plan => { fakeGoogle({ [SEND_URL]: plan }); try { await mail.send('t', 'm'); } catch (e) { return e; } return null; };
  const DAILY = 'User-rate limit exceeded.  Retry after 2026-11-20T18:01:06.151Z (Mail sending)';
  const v1 = (code, message, reason, domain = 'usageLimits') => ({ status: code, body: { error: { code, message, errors: [{ domain, reason, message }] } } });
  test('the daily sending limit — HTTP 429 with the time to try again in its words: "limited", the words, the time', async () => {
    const e = await said(v1(429, DAILY, 'rateLimitExceeded'));
    assert.ok(e instanceof mail.MailError);
    assert.deepEqual([e.code, e.message, e.retryAt.toISOString()], ['limited', DAILY, '2026-11-20T18:01:06.151Z']);
  });
  test('any 429 is a limit, whatever its body: without a time there is none, and what is no JSON says its number', async () => {
    const plain = await said({ status: 429, body: { error: { code: 429, message: 'Too many concurrent requests for user' } } });
    assert.deepEqual([plain.code, plain.message, plain.retryAt], ['limited', 'Too many concurrent requests for user', null]);
    const html = await said({ status: 429, body: '<html>Too Many Requests</html>' });
    assert.deepEqual([html.code, html.message, html.retryAt], ['limited', 'HTTP 429', null]);
    const bare = await said({ status: 429, body: { error: { code: 429 } } });
    assert.deepEqual([bare.code, bare.message], ['limited', 'HTTP 429'], 'an error without words is not "[object Object]"');
  });
  test('403 with one of Google\'s rate reasons is a limit too — in the old shape of its errors and in the new one', async () => {
    for (const [reason, words] of [['rateLimitExceeded', 'Rate Limit Exceeded'], ['userRateLimitExceeded', 'User Rate Limit Exceeded'], ['dailyLimitExceeded', 'Daily Limit Exceeded']]) {
      const e = await said(v1(403, words, reason));
      assert.deepEqual([e.code, e.message, e.retryAt], ['limited', words, null], reason);
    }
    const exhausted = await said({ status: 403, body: { error: { code: 403, message: 'Quota exceeded for quota metric', status: 'RESOURCE_EXHAUSTED' } } });
    assert.equal(exhausted.code, 'limited');
    const info = await said({ status: 403, body: { error: { code: 403, message: 'Quota exceeded', status: 'PERMISSION_DENIED', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'RATE_LIMIT_EXCEEDED', domain: 'googleapis.com' }] } } });
    assert.equal(info.code, 'limited');
  });
  test('403 for any other reason is a refusal no waiting puts right — and so is every other answer', async () => {
    for (const [reason, words] of [['domainPolicy', 'The domain administrators have disabled Gmail apps.'], ['insufficientPermissions', 'Insufficient Permission'], ['forbidden', 'Delegation denied'], ['accessNotConfigured', 'Gmail API has not been used in project']]) {
      const e = await said(v1(403, words, reason, 'global'));
      assert.deepEqual([e.code, e.message, e.retryAt], ['rejected', words, null], reason);
    }
    assert.equal((await said({ status: 403, body: { error: { code: 403, message: 'no' } } })).code, 'rejected', 'no reason given');
    assert.equal((await said({ status: 403, body: { error: { code: 403, message: 'x', errors: 'rateLimitExceeded', details: { reason: 'RATE_LIMIT_EXCEEDED' } } } })).code, 'rejected', 'a reason is read from Google\'s lists, not from anything that holds the word');
    for (const status of [400, 401, 404, 500, 503]) assert.equal((await said(v1(status, 'Rate Limit Exceeded', 'rateLimitExceeded'))).code, 'rejected', `HTTP ${status}`);
  });
  test('the time to try again: the Retry-After header — seconds or a date — before the time in the words', async () => {
    const before = Date.now();
    const seconds = await said({ status: 429, headers: { 'retry-after': '120' }, body: { error: { code: 429, message: DAILY } } });
    assert.ok(seconds.retryAt.getTime() >= before + 120000 && seconds.retryAt.getTime() <= Date.now() + 120000, 'two minutes from now');
    const date = await said({ status: 429, headers: { 'retry-after': 'Fri, 20 Nov 2026 19:30:00 GMT' }, body: { error: { code: 429, message: DAILY } } });
    assert.equal(date.retryAt.toISOString(), '2026-11-20T19:30:00.000Z');
    const junk = await said({ status: 429, headers: { 'retry-after': 'soon' }, body: { error: { code: 429, message: DAILY } } });
    assert.equal(junk.retryAt.toISOString(), '2026-11-20T18:01:06.151Z', 'a header that says nothing leaves the words');
  });
  test('the time is read from everything Google said, also where the words that are kept end; a time that is none is none', async () => {
    const long = `${'x'.repeat(230)} Retry after 2026-11-21T08:00:00Z (Mail sending)`;
    const e = await said({ status: 429, body: { error: { code: 429, message: long } } });
    assert.deepEqual([e.message.length, e.retryAt.toISOString()], [200, '2026-11-21T08:00:00.000Z']);
    assert.equal((await said({ status: 429, body: { error: { code: 429, message: 'Retry after 2026-11-21T08:00:00+01:00' } } })).retryAt.toISOString(), '2026-11-21T07:00:00.000Z', 'with its own time zone');
    for (const words of ['Retry after a while', 'Retry after 2026-13-45T99:99:99Z', 'Retry later', 'retry after tomorrow 08:00']) assert.equal((await said({ status: 429, body: { error: { code: 429, message: words } } })).retryAt, null, words);
  });
  test('the address where tokens are fetched can say it as well; a sign-in that is gone stays "gone"', async () => {
    fakeGoogle({ [TOKEN]: { status: 429, body: { error: 'rate_limit_exceeded', error_description: 'Too many requests' } } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'limited' && e.message === 'Too many requests' && e.retryAt === null);
    fakeGoogle({ [TOKEN]: { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } });
    await assert.rejects(mail.accessToken('x'), e => e.code === 'gone' && e.retryAt === null);
  });
  test('the lines that make it so', () => {
    const code = read('utils/journey-mail.js').replace(/\/\*[\s\S]*?\*\//, '');
    assert.match(code, /const RATE_REASONS = \['ratelimitexceeded', 'userratelimitexceeded', 'dailylimitexceeded'\];/);
    assert.match(code, /if \(status === 429\) return true;\s+if \(status !== 403\) return false;/);
    assert.match(code, /if \(isLimit\(res\.status, json\)\) throw new MailError\('limited', said, retryTime\(res, words\)\);/);
    assert.ok(code.indexOf("throw new MailError('limited'") < code.indexOf("throw new MailError(json.error === 'invalid_grant' ? 'gone' : 'rejected', said);"), 'asked first: a limit is never "rejected"');
  });
});

// Part 17: the headers a mail program reads to offer its own "unsubscribe" (RFC 8058).
describe('the one-click unsubscribe headers', () => {
  const M = { from: 'news@firma.de', to: 'lead@example.de', subject: 'Hallo', text: 'Text', html: '<p>HTML</p>' };
  const LINK = 'https://crm.example.de/api/journey/unsubscribe/40.s0Me-Signature_43-characters-long-abcdefghijk';
  const names = msg => msg.split('\r\n\r\n')[0].split('\r\n').filter(l => /^[A-Za-z-]+:/.test(l)).map(l => l.split(':')[0]);
  test('an https address: both headers, with the address between brackets, on lines of their own before the body', () => {
    const msg = mail.buildMessage({ ...M, unsubscribe: LINK }), head = msg.split('\r\n\r\n')[0].split('\r\n');
    assert.deepEqual(names(msg), ['From', 'To', 'Subject', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'MIME-Version', 'Content-Type']);
    assert.equal(head[3], `List-Unsubscribe: <${LINK}>`);
    assert.equal(head[4], 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    assert.ok(head[3].length < 998, 'one line, as a mail line may be');
    const plain = mail.buildMessage({ from: M.from, to: M.to, subject: M.subject, text: M.text, unsubscribe: LINK });
    assert.deepEqual(names(plain), ['From', 'To', 'Subject', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'MIME-Version', 'Content-Type', 'Content-Transfer-Encoding'], 'also on a message without HTML');
  });
  test('nothing else of the message changes', () => {
    const boundary = m => m.match(/boundary="([^"]+)"/)[1];
    const withIt = mail.buildMessage({ ...M, unsubscribe: LINK }), without = mail.buildMessage(M);
    const same = m => m.split(boundary(m)).join('B');
    assert.equal(same(withIt).replace(`List-Unsubscribe: <${LINK}>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n`, ''), same(without));
  });
  test('never for http, and never without an address', () => {
    for (const none of ['http://crm.example.de/api/journey/unsubscribe/40.sig', 'HTTP://x.de/a', 'ftp://x.de/a', '//x.de/a', 'crm.example.de/a', '', null, undefined, 5, {}, ['https://x.de/a']]) {
      assert.equal(mail.unsubscribeHeaders(none), '', String(none));
      assert.deepEqual(names(mail.buildMessage({ ...M, unsubscribe: none })), ['From', 'To', 'Subject', 'MIME-Version', 'Content-Type'], String(none));
    }
  });
  test('an address that is more than an address adds no header and no line: a blank, a line break, a bracket, a comma, a letter that is no plain one, a length no address has', () => {
    for (const bad of ['https://x.de/a b', 'https://x.de/a\r\nBcc: victim@example.de', 'https://x.de/a\nX: 1', 'https://x.de/a>, <mailto:victim@example.de', 'https://x.de/<a>', 'https://x.de/a,b', 'https://x.de/ä', ' https://x.de/a', 'https://x.de/a ',
      'https://' + 'a'.repeat(901), 'https://']) {
      assert.equal(mail.unsubscribeHeaders(bad), '', JSON.stringify(bad).slice(0, 40));
      const msg = mail.buildMessage({ ...M, unsubscribe: bad });
      assert.doesNotMatch(msg.split('\r\n\r\n')[0], /List-Unsubscribe|Bcc|victim|X: 1/);
    }
    assert.match(mail.unsubscribeHeaders('https://' + 'a'.repeat(900)), /^List-Unsubscribe: </);
  });
  test('the lines that make it so', () => {
    const code = read('utils/journey-mail.js').replace(/\/\*[\s\S]*?\*\//, '');
    assert.match(code, /return typeof url === 'string' && \/\^https:\\\/\\\/\[\\x21-\\x7e\]\{1,900\}\$\/\.test\(url\) && !\/\[<>,\]\/\.test\(url\)/);
    assert.match(code, /\? `List-Unsubscribe: <\$\{url\}>\\r\\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\\r\\n` : '';/);
    assert.match(code, /Subject: \$\{headerText\(subject\)\}\\r\\n\$\{unsubscribeHeaders\(unsubscribe\)\}MIME-Version: 1\.0\\r\\n`;/);
  });
});

describe('ending the grant, and the token at rest', () => {
  test('revoke: true when Google took it, false when it refused, was away, or there was no token — never thrown', async () => {
    fakeGoogle({ [REVOKE]: { status: 200, body: {} } });
    assert.equal(await mail.revoke('1//refresh-plain'), true);
    assert.deepEqual(google[0].body, { token: '1//refresh-plain' });
    fakeGoogle({ [REVOKE]: { status: 400, body: { error: 'invalid_token' } } });
    assert.equal(await mail.revoke('x'), false);
    fakeGoogle({ [REVOKE]: { throw: true } });
    assert.equal(await mail.revoke('x'), false);
    fakeGoogle({});
    assert.equal(await mail.revoke(null), false);
    assert.equal(google.length, 0, 'nothing asked without a token');
  });
  test('sealed, the token cannot be read; opened with the server\'s secret it is itself again', () => {
    const sealed = mail.sealToken('1//refresh-plain');
    assert.doesNotMatch(sealed, /refresh-plain/);
    assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(mail.openToken(sealed), '1//refresh-plain');
    assert.notEqual(mail.sealToken('1//refresh-plain'), sealed, 'never sealed the same way twice');
    process.env.SESSION_SECRET = 'another-secret';
    assert.throws(() => mail.openToken(sealed));
  });
});
