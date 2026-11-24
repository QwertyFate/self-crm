// UNIT tests for utils/facebook.js (FACEBOOK_CHANGES Part 1, 2026-11-23): the platform's one Facebook connection —
// the sign-in at Facebook and what is asked of Facebook afterwards.
//
// Facebook itself is a stand-in here: global fetch is replaced, every address the module asks is written down, and
// the answers are the shapes Meta documents ("Manually Build a Login Flow", "Get Long-Lived Tokens", /me/accounts).
// Nothing leaves the machine.
//
// Part 3 (2026-11-24): receiving leads — the word and the signature Facebook is known by, who a message is about,
// the app installed on a Page, one lead's answers, and where the app is registered to be told.
const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { read } = require('../helpers/client-fn');
const fb = require('../../utils/facebook');

const realFetch = globalThis.fetch, savedEnv = { ...process.env };
let asked = [], answers = [], methods = [];
const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
globalThis.fetch = async (url, init) => { asked.push(new URL(String(url))); methods.push(init && init.method); const next = answers.shift(); if (next instanceof Error) throw next; return next || answer({}); };
const setEnv = (more = {}) => { for (const k of ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_SCOPES']) delete process.env[k]; Object.assign(process.env, { META_APP_ID: '1234567890', META_APP_SECRET: 's3cret', ...more }); };
beforeEach(() => { asked = []; answers = []; methods = []; setEnv(); });
after(() => { globalThis.fetch = realFetch; for (const k of ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_SCOPES']) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } });
const q = (url, k) => url.searchParams.get(k);
const proof = token => crypto.createHmac('sha256', 's3cret').update(token).digest('hex');

describe('the app this server signs in with', () => {
  test('named by two lines of .env; without both there is no Facebook', () => {
    assert.deepEqual(fb.config(), { id: '1234567890', secret: 's3cret', version: 'v26.0', scopes: fb.SCOPES });
    assert.equal(fb.isConfigured(), true);
    for (const more of [{ META_APP_ID: '' }, { META_APP_SECRET: '' }, { META_APP_ID: '   ' }, { META_APP_ID: 'abc' }, { META_APP_ID: '12' }, { META_APP_ID: '1234567890; DROP' }]) { setEnv(more); assert.equal(fb.config(), null, JSON.stringify(more)); assert.equal(fb.isConfigured(), false); }
    setEnv({ META_APP_ID: ' 1234567890 ', META_APP_SECRET: ' s3cret ' });
    assert.deepEqual([fb.config().id, fb.config().secret], ['1234567890', 's3cret'], 'blanks around them do not count');
  });
  test('the version and the permissions can be set without a change of code — only in the shape they have', () => {
    assert.deepEqual(fb.SCOPES, ['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'leads_retrieval', 'ads_management']);
    setEnv({ META_GRAPH_VERSION: 'v27.0', META_SCOPES: ' pages_show_list, leads_retrieval ,pages_show_list,, Bad Scope,<x>,pages_manage_ads' });
    assert.deepEqual([fb.config().version, fb.config().scopes], ['v27.0', ['pages_show_list', 'leads_retrieval', 'pages_manage_ads']]);
    for (const v of ['27', 'v27', 'latest', 'v27.0/../x', '']) { setEnv({ META_GRAPH_VERSION: v }); assert.equal(fb.config().version, 'v26.0', v); }
    setEnv({ META_SCOPES: ' , <x>' });
    assert.deepEqual(fb.config().scopes, fb.SCOPES, 'a list with nothing usable in it: the default');
  });
});

describe('the word of one sign-in', () => {
  test('random, with ten minutes to live; it counts only as it was kept, and only in time', () => {
    const a = fb.newState(1000), b = fb.newState(1000);
    assert.match(a.value, /^[\w-]{32}$/); assert.notEqual(a.value, b.value);
    assert.deepEqual([a.expires, fb.STATE_TTL_MS], [1000 + 600000, 600000]);
    assert.equal(fb.stateMatches(a, a.value, 1000), true);
    assert.equal(fb.stateMatches(a, a.value, a.expires - 1), true);
    assert.equal(fb.stateMatches(a, a.value, a.expires), false, 'the moment it runs out it no longer counts');
    for (const given of [b.value, a.value + 'x', a.value.slice(1), '', undefined, null, 5, [a.value]]) assert.equal(fb.stateMatches(a, given, 1000), false, String(given));
    for (const kept of [null, undefined, {}, { value: '', expires: 9e15 }, { value: a.value }, { value: 5, expires: 9e15 }, 'x']) assert.equal(fb.stateMatches(kept, a.value, 1000), false, JSON.stringify(kept));
  });
});

describe('the way to Facebook\'s sign-in page', () => {
  test('the dialog of the version, with the app, where to come back to, the word and the permissions — and a code asked for', () => {
    const url = new URL(fb.authUrl({ redirectUri: 'https://crm.example.de/api/admin/facebook/callback', state: 'W0rd' }));
    assert.equal(url.origin + url.pathname, 'https://www.facebook.com/v26.0/dialog/oauth');
    assert.deepEqual(Object.fromEntries(url.searchParams), { client_id: '1234567890', redirect_uri: 'https://crm.example.de/api/admin/facebook/callback', state: 'W0rd',
      scope: 'pages_show_list,pages_read_engagement,pages_manage_metadata,leads_retrieval,ads_management', response_type: 'code' });
    assert.doesNotMatch(String(url), /s3cret/, 'the secret is never part of an address a browser sees');
    setEnv({ META_GRAPH_VERSION: 'v27.0', META_SCOPES: 'pages_show_list' });
    assert.match(fb.authUrl({ redirectUri: 'https://x/cb', state: 's' }), /^https:\/\/www\.facebook\.com\/v27\.0\/dialog\/oauth\?.*scope=pages_show_list&response_type=code$/);
  });
});

describe('the code, traded for a long-lived token', () => {
  test('two questions to Facebook: the code for a short-lived token, that for a long-lived one', async () => {
    answers = [answer({ access_token: 'SHORT', token_type: 'bearer', expires_in: 5000 }), answer({ access_token: 'LONG', token_type: 'bearer', expires_in: 5183944 })];
    const out = await fb.exchangeCode('C0DE', 'https://crm.example.de/api/admin/facebook/callback', Date.UTC(2026, 10, 23));
    assert.deepEqual(out, { token: 'LONG', expiresAt: new Date(Date.UTC(2026, 10, 23) + 5183944000) });
    assert.equal(asked.length, 2);
    assert.equal(asked[0].origin + asked[0].pathname, 'https://graph.facebook.com/v26.0/oauth/access_token');
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { client_id: '1234567890', redirect_uri: 'https://crm.example.de/api/admin/facebook/callback', client_secret: 's3cret', code: 'C0DE' });
    assert.equal(asked[1].origin + asked[1].pathname, 'https://graph.facebook.com/v26.0/oauth/access_token');
    assert.deepEqual(Object.fromEntries(asked[1].searchParams), { grant_type: 'fb_exchange_token', client_id: '1234567890', client_secret: 's3cret', fb_exchange_token: 'SHORT' });
  });
  test('no time named: no expiry; no token in an answer: refused', async () => {
    answers = [answer({ access_token: 'SHORT' }), answer({ access_token: 'LONG' })];
    assert.equal((await fb.exchangeCode('c', 'https://x/cb')).expiresAt, null);
    for (const expires_in of [0, -5, 'soon', null, '1e999', 'Infinity']) { answers = [answer({ access_token: 'SHORT' }), answer({ access_token: 'LONG', expires_in })]; assert.equal((await fb.exchangeCode('c', 'https://x/cb')).expiresAt, null, String(expires_in)); }
    answers = [answer({ token_type: 'bearer' })]; asked = [];
    await assert.rejects(fb.exchangeCode('c', 'https://x/cb'), e => e.name === 'FacebookError' && e.code === 'rejected' && e.message === 'Facebook answered without a token');
    assert.equal(asked.filter(u => q(u, 'grant_type')).length, 0, 'the second question is not asked');
    answers = [answer({ access_token: 'SHORT' }), answer({ access_token: '' })];
    await assert.rejects(fb.exchangeCode('c', 'https://x/cb'), e => e.code === 'rejected' && e.message === 'Facebook answered without a long-lived token');
  });
});

describe('what is asked of Facebook afterwards', () => {
  test('every question carries the token and the token signed with the app\'s secret', async () => {
    answers = [answer({ id: '77', name: 'Olga Owner' })];
    assert.deepEqual(await fb.me('TOKEN'), { id: '77', name: 'Olga Owner' });
    assert.equal(asked[0].origin + asked[0].pathname, 'https://graph.facebook.com/v26.0/me');
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { fields: 'id,name', access_token: 'TOKEN', appsecret_proof: proof('TOKEN') });
    assert.equal(fb.proofOf('TOKEN', 's3cret'), proof('TOKEN'));
    assert.notEqual(fb.proofOf('TOKEN', 's3cret'), fb.proofOf('TOKEN', 'other'));
    answers = [answer({})];
    assert.deepEqual(await fb.me('T'), { id: '', name: '' }, 'an answer without them: empty, not "undefined"');
  });
  test('the permissions the person gave — only those given', async () => {
    answers = [answer({ data: [{ permission: 'pages_show_list', status: 'granted' }, { permission: 'leads_retrieval', status: 'declined' }, { permission: 'ads_management', status: 'granted' }, { status: 'granted' }, null, { permission: 5, status: 'granted' }] })];
    assert.deepEqual(await fb.granted('TOKEN'), ['pages_show_list', 'ads_management']);
    assert.equal(asked[0].pathname, '/v26.0/me/permissions');
    assert.equal(q(asked[0], 'appsecret_proof'), proof('TOKEN'));
    for (const body of [{}, { data: null }, { data: 'x' }]) { answers = [answer(body)]; assert.deepEqual(await fb.granted('T'), []); }
  });
  test('the Pages of the person: id, name, what the person may do there, the Page\'s own token', async () => {
    answers = [answer({ data: [{ id: '100', name: 'Müller Immobilien', tasks: ['ADVERTISE', 'ANALYZE', 5], access_token: 'PAGE-100' }, { id: 200, name: null }, { name: 'no id' }, null] })];
    assert.deepEqual(await fb.pages('TOKEN'), [{ id: '100', name: 'Müller Immobilien', tasks: ['ADVERTISE', 'ANALYZE'], token: 'PAGE-100' }, { id: '200', name: '', tasks: [], token: '' }]);
    assert.equal(asked[0].pathname, '/v26.0/me/accounts');
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { fields: 'id,name,tasks,access_token', limit: '100', access_token: 'TOKEN', appsecret_proof: proof('TOKEN') });
  });
  test('every page of Facebook\'s answer is read, by the address Facebook itself hands out — and no other address', async () => {
    const next = 'https://graph.facebook.com/v26.0/77/accounts?access_token=TOKEN&limit=100&after=CURSOR';
    answers = [answer({ data: [{ id: '1', name: 'a' }], paging: { next } }), answer({ data: [{ id: '2', name: 'b' }], paging: { next: 'https://evil.example/steal?access_token=TOKEN' } })];
    assert.deepEqual((await fb.pages('TOKEN')).map(p => p.id), ['1', '2']);
    assert.equal(asked.length, 2, 'an address that is not Facebook\'s is not asked');
    assert.equal(asked[1].origin + asked[1].pathname, 'https://graph.facebook.com/v26.0/77/accounts');
    assert.deepEqual([q(asked[1], 'after'), q(asked[1], 'appsecret_proof')], ['CURSOR', proof('TOKEN')], 'the next page is signed too');
    answers = Array.from({ length: 30 }, (_, i) => answer({ data: [{ id: String(i + 1) }], paging: { next } }));
    asked = [];
    assert.equal((await fb.pages('TOKEN')).length, fb.MAX_PAGE_CALLS, 'an answer that never ends is read ten pages far');
    assert.equal(asked.length, 10);
  });
});

describe('a refusal', () => {
  test('says Facebook\'s own words and nothing of the request: no token, no secret, no address', async () => {
    answers = [answer({ error: { message: 'Invalid OAuth access token - Cannot parse access token', type: 'OAuthException', code: 190, fbtrace_id: 'x' } }, 400)];
    await assert.rejects(fb.me('SECRET-TOKEN'), e => { assert.equal(e.name, 'FacebookError'); assert.equal(e.code, 'gone'); assert.equal(e.message, 'Invalid OAuth access token - Cannot parse access token'); assert.doesNotMatch(e.message + e.stack, /SECRET-TOKEN|s3cret|graph\.facebook/); return true; });
    answers = [answer({ error: { message: '(#200) Requires pages_show_list permission', code: 200 } }, 403)];
    await assert.rejects(fb.pages('T'), e => e.code === 'rejected' && e.message === '(#200) Requires pages_show_list permission');
    answers = [answer({ error: { message: 'x'.repeat(500), code: 1 } }, 500)];
    await assert.rejects(fb.me('T'), e => e.code === 'rejected' && e.message.length === 200);
  });
  test('an error in an answer that came with "200", an answer that is no JSON, a string for an error', async () => {
    answers = [answer({ error: { message: 'Session has expired', code: 190 } }, 200)];
    await assert.rejects(fb.me('T'), e => e.code === 'gone' && e.message === 'Session has expired');
    answers = [{ ok: false, status: 502, json: async () => { throw new Error('not json'); } }];
    await assert.rejects(fb.me('T'), e => e.code === 'rejected' && e.message === 'HTTP 502');
    answers = [answer({ error: 'invalid_request' }, 400)];
    await assert.rejects(fb.me('T'), e => e.code === 'rejected' && e.message === 'invalid_request');
    answers = [answer({ error: { code: '190' } }, 400)];
    await assert.rejects(fb.me('T'), e => e.code === 'gone' && e.message === 'HTTP 400', 'the number as text is the number');
  });
  test('Facebook does not answer: unreachable; the server is not set up: said, and Facebook is not asked', async () => {
    answers = [new Error('ECONNRESET at https://graph.facebook.com/v26.0/me?access_token=SECRET-TOKEN')];
    await assert.rejects(fb.me('SECRET-TOKEN'), e => e.code === 'unreachable' && e.message === 'Facebook could not be reached');
    setEnv({ META_APP_SECRET: '' });
    asked = [];
    await assert.rejects(fb.me('T'), e => e.code === 'rejected' && e.message === 'Facebook is not set up on this server');
    assert.equal(asked.length, 0);
  });
});

describe('Part 3: the word and the signature Facebook is known by', () => {
  const sign = (bytes, secret = 's3cret') => 'sha256=' + crypto.createHmac('sha256', secret).update(bytes).digest('hex');
  test('the word for the one question while registering: made from the app\'s secret, the same every time, never the secret', () => {
    const word = fb.verifyToken();
    assert.match(word, /^[0-9a-f]{40}$/);
    assert.equal(fb.verifyToken(), word, 'the same after a restart: nothing is stored');
    assert.equal(word, crypto.createHmac('sha256', 's3cret').update('facebook receiver: verify token').digest('hex').slice(0, 40));
    setEnv({ META_APP_SECRET: 'other' });
    assert.notEqual(fb.verifyToken(), word, 'another app, another word');
    setEnv({ META_APP_SECRET: '' });
    assert.equal(fb.verifyToken(), null);
    assert.equal(fb.verifyMatches(word), false, 'without an app no word counts');
  });
  test('only the word itself counts', () => {
    const word = fb.verifyToken();
    assert.equal(fb.verifyMatches(word), true);
    for (const given of [word + '0', word.slice(1), word.toUpperCase(), ' ' + word, word + ' ', '', undefined, null, 5, [word], { word }]) assert.equal(fb.verifyMatches(given), false, String(given));
  });
  test('bytes count only when signed with the app\'s secret — "sha256=" and the HMAC of exactly these bytes', () => {
    const raw = Buffer.from('{"object":"page","entry":[]}');
    assert.equal(fb.signatureMatches(raw, sign(raw)), true);
    assert.equal(fb.signatureMatches(raw, ' ' + sign(raw).toUpperCase().replace('SHA256', 'sha256') + ' '), true, 'blanks around it and capital hex digits are the same signature');
    assert.equal(fb.signatureMatches(Buffer.from('{"object":"page","entry":[] }'), sign(raw)), false, 'one byte more: another message');
    assert.equal(fb.signatureMatches(raw, sign(raw, 'guess')), false, 'signed with another secret');
    assert.equal(fb.signatureMatches(raw, 'sha1=' + crypto.createHmac('sha1', 's3cret').update(raw).digest('hex')), false, 'the old sha1 header is not taken');
    for (const header of [undefined, null, '', 'sha256=', 'sha256=zz', sign(raw).slice(7), sign(raw) + 'ab', sign(raw).slice(0, -2), 'x' + sign(raw), sign(raw).replace('sha256=', 'sha1='), 5, [sign(raw)]]) assert.equal(fb.signatureMatches(raw, header), false, String(header));
    for (const body of [raw.toString(), null, undefined, { a: 1 }]) assert.equal(fb.signatureMatches(body, sign(raw)), false, 'only bytes are checked');
    setEnv({ META_APP_SECRET: '' });
    assert.equal(fb.signatureMatches(raw, sign(raw)), false, 'without an app nothing is signed rightly');
    assert.equal(fb.signatureMatches(raw, sign(raw, '')), false);
  });
});

describe('Part 3: who a message is about', () => {
  const events = j => fb.leadEvents(Buffer.from(typeof j === 'string' ? j : JSON.stringify(j)));
  const msg = changes => ({ object: 'page', entry: [{ id: '153125381133', time: 1438292065, changes }] });
  test('Meta\'s own example: two leads of one Page, the ids as bare numbers', () => {
    const raw = '{"object":"page","entry":[{"id":153125381133,"time":1438292065,"changes":[{"field":"leadgen","value":{"leadgen_id":123123123123,"page_id":123123123,"form_id":12312312312,"created_time":1440120384}},{"field":"leadgen","value":{"leadgen_id":123123123124,"page_id":123123123,"form_id":12312312312,"created_time":1440120384}}]}]}';
    assert.deepEqual(events(raw), [{ leadgenId: '123123123123', pageId: '123123123', formId: '12312312312' }, { leadgenId: '123123123124', pageId: '123123123', formId: '12312312312' }]);
  });
  test('an id longer than a number can hold is read digit for digit — bare or as text', () => {
    const raw = '{"object":"page","entry":[{"id": 12345678901234567891 ,"changes":[{"field":"leadgen","value":{"leadgen_id":98765432109876543219,"form_id":[11112222333344445555]}},{"field":"leadgen","value":{"leadgen_id":"98765432109876543218","page_id":"77"}}]}]}';
    assert.deepEqual(events(raw), [{ leadgenId: '98765432109876543219', pageId: '12345678901234567891', formId: null }, { leadgenId: '98765432109876543218', pageId: '77', formId: null }]);
    assert.equal(String(JSON.parse('98765432109876543219')), '98765432109876540000', 'what a plain reading would have made of it');
    const sixteen = '{"object":"page","entry":[{"id":"5","changes":[{"field":"leadgen","value":{"leadgen_id":9007199254740993}}]}]}';
    assert.deepEqual(events(sixteen), [{ leadgenId: '9007199254740993', pageId: '5', formId: null }], 'sixteen digits can already be more than a number holds (2^53 + 1)');
    assert.equal(String(JSON.parse('9007199254740993')), '9007199254740992');
    const both = '{"object":"page","entry":[{"id":"5","changes":[{"field":"leadgen","value":{"leadgen_id":98765432109876543219,"note":"a: 1234567890123456, b"}}]}]}';
    assert.deepEqual(events(both), [], 'where only the plain reading works, an id that came out rounded is no id: the lead is left out, never taken under a wrong one');
    const texty = '{"object":"page","entry":[{"id":"5","changes":[{"field":"leadgen","value":{"leadgen_id":"7","note":"a: 1234567890123456, b"}}]}]}';
    assert.deepEqual(events(texty), [{ leadgenId: '7', pageId: '5', formId: null }], 'a text that only looks like such a number does not break the message');
  });
  test('the Page is the one the change names, else the entry\'s; a lead named twice counts once', () => {
    assert.deepEqual(events(msg([{ field: 'leadgen', value: { leadgen_id: '1', page_id: '9' } }, { field: 'leadgen', value: { leadgen_id: '2' } }, { field: 'leadgen', value: { leadgen_id: '1', page_id: '9' } }])),
      [{ leadgenId: '1', pageId: '9', formId: null }, { leadgenId: '2', pageId: '153125381133', formId: null }]);
  });
  test('what is no lead of a Page is left out, and what is no message about Pages is none', () => {
    assert.deepEqual(events(msg([{ field: 'feed', value: { leadgen_id: '1' } }, { field: 'leadgen' }, { field: 'leadgen', value: null }, { field: 'leadgen', value: { leadgen_id: 0 } }, { field: 'leadgen', value: 'x' }, null, 'x', { field: 'leadgen', value: { leadgen_id: 'abc' } }, { field: 'leadgen', value: { leadgen_id: '1; DROP' } },
      { field: 'leadgen', value: { leadgen_id: -5 } }, { field: 'leadgen', value: { leadgen_id: 1.5 } }, { field: 'leadgen', value: { leadgen_id: '0'.repeat(31) } }, { field: 'leadgen', value: { leadgen_id: ['7'] } }])), []);
    assert.deepEqual(events({ object: 'page', entry: [null, 'x', { id: '5' }, { id: '5', changes: 'x' }, { changes: [{ field: 'leadgen', value: { leadgen_id: '3' } }] }] }), [], 'a lead without any Page is not taken');
    for (const j of [{ object: 'user', entry: [] }, { object: 'page' }, { object: 'page', entry: {} }, [], 'null', '5', '"page"', 'not json', '']) assert.equal(events(j), null, JSON.stringify(j));
    for (const raw of ['{"object":"page","entry":[]}', null, undefined, { object: 'page', entry: [] }]) assert.equal(fb.leadEvents(raw), null, 'only bytes are read');
  });
  test('at most a thousand leads are read from one message', () => {
    const many = Array.from({ length: 1005 }, (_, i) => ({ field: 'leadgen', value: { leadgen_id: String(i + 1) } }));
    const got = events(msg(many));
    assert.deepEqual([got.length, fb.MAX_EVENTS, got[999].leadgenId], [1000, 1000, '1000']);
  });
});

describe('Part 3: the app on a Page, and one lead', () => {
  test('installed for its leads and taken off again — with the Page\'s own token, signed', async () => {
    answers = [answer({ success: true }), answer({ success: true })];
    await fb.subscribePage('555', 'PAGE-T');
    await fb.unsubscribePage('555', 'PAGE-T');
    assert.deepEqual(asked.map(u => u.origin + u.pathname), ['https://graph.facebook.com/v26.0/555/subscribed_apps', 'https://graph.facebook.com/v26.0/555/subscribed_apps']);
    assert.deepEqual(methods, ['POST', 'DELETE']);
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { subscribed_fields: 'leadgen', access_token: 'PAGE-T', appsecret_proof: proof('PAGE-T') });
    assert.deepEqual(Object.fromEntries(asked[1].searchParams), { access_token: 'PAGE-T', appsecret_proof: proof('PAGE-T') });
  });
  test('a refusal of either says Facebook\'s words', async () => {
    answers = [answer({ error: { message: '(#200) To subscribe to the leadgen field, one of these permissions is needed: leads_retrieval', code: 200 } }, 403), new Error('down')];
    await assert.rejects(fb.subscribePage('555', 'PAGE-T'), e => e.code === 'rejected' && /leads_retrieval/.test(e.message) && e.transient === false);
    await assert.rejects(fb.unsubscribePage('555', 'PAGE-T'), e => e.code === 'unreachable');
  });
  test('Part 4: is the app on a Page for its leads? Asked with the Page\'s own token — true only for this app with the field leadgen', async () => {
    const apps = (...list) => answer({ data: list });
    answers = [apps({ id: '1234567890', name: 'CRM', subscribed_fields: ['leadgen'] })];
    assert.equal(await fb.pageInstalled('555', 'PAGE-T'), true);
    assert.deepEqual([methods[0], asked[0].origin + asked[0].pathname, Object.fromEntries(asked[0].searchParams)], ['GET', 'https://graph.facebook.com/v26.0/555/subscribed_apps', { access_token: 'PAGE-T', appsecret_proof: proof('PAGE-T') }]);
    answers = [apps({ id: 1234567890, subscribed_fields: ['feed', 'leadgen'] })];
    assert.equal(await fb.pageInstalled('555', 'PAGE-T'), true, 'the app\'s id as a number is the same app');
    for (const body of [{ data: [] }, {}, { data: 'x' }, { data: [null, 'x'] }, { data: [{ id: '999', subscribed_fields: ['leadgen'] }] }, { data: [{ id: '1234567890', subscribed_fields: ['feed'] }] }, { data: [{ id: '1234567890' }] },
      { data: [{ id: '1234567890', subscribed_fields: 'leadgen' }] }, { data: [{ id: '12345678901', subscribed_fields: ['leadgen'] }] }]) {
      answers = [answer(body)];
      assert.equal(await fb.pageInstalled('555', 'PAGE-T'), false, JSON.stringify(body));
    }
    answers = [answer({ error: { message: 'Session has expired', code: 190 } }, 400), new Error('down')];
    await assert.rejects(fb.pageInstalled('555', 'PAGE-T'), e => e.code === 'gone');
    await assert.rejects(fb.pageInstalled('555', 'PAGE-T'), e => e.code === 'unreachable');
    setEnv({ META_APP_ID: '' }); asked = [];
    await assert.rejects(fb.pageInstalled('555', 'PAGE-T'), e => e.code === 'rejected' && e.message === 'Facebook is not set up on this server');
    assert.equal(asked.length, 0);
  });
  const LEAD = { id: '777', created_time: '2026-11-24T09:00:00+0000', field_data: [{ name: 'email', values: ['a@b.de'] }, { name: 'full_name', values: ['Ada Lovelace'] }], form_id: '12', campaign_name: 'Herbst', ad_name: 'Bild 1' };
  test('a lead is asked for with its answers, its form, and the ad and campaign it came from', async () => {
    answers = [answer(LEAD)];
    assert.deepEqual(await fb.lead('777', 'PAGE-T'), LEAD, 'handed back as Facebook has it');
    assert.equal(asked.length, 1);
    assert.equal(asked[0].origin + asked[0].pathname, 'https://graph.facebook.com/v26.0/777');
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { fields: 'id,created_time,field_data,form_id,platform,is_organic,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name', access_token: 'PAGE-T', appsecret_proof: proof('PAGE-T') });
    assert.equal(methods[0], 'GET');
  });
  test('where Facebook refuses the ad\'s names, the lead is asked for again as Facebook gives it by itself', async () => {
    const plain = { id: '777', created_time: LEAD.created_time, field_data: LEAD.field_data };
    answers = [answer({ error: { message: '(#100) Tried accessing nonexisting field (campaign_name)', code: 100 } }, 400), answer(plain)];
    assert.deepEqual(await fb.lead('777', 'PAGE-T'), plain);
    assert.equal(asked.length, 2);
    assert.deepEqual(Object.fromEntries(asked[1].searchParams), { access_token: 'PAGE-T', appsecret_proof: proof('PAGE-T') }, 'no list of fields the second time');
  });
  test('a refusal that is none of the fields\' is not asked twice: the token gone, Facebook away, Facebook saying "later"', async () => {
    answers = [answer({ error: { message: 'Session has expired', code: 190 } }, 400)];
    await assert.rejects(fb.lead('777', 'PAGE-T'), e => e.code === 'gone');
    answers = [new Error('down')];
    await assert.rejects(fb.lead('777', 'PAGE-T'), e => e.code === 'unreachable');
    answers = [answer({ error: { message: 'Please retry your request later.', code: 2, is_transient: true } }, 400)];
    await assert.rejects(fb.lead('777', 'PAGE-T'), e => e.code === 'rejected' && e.transient === true);
    answers = [answer({ error: { message: 'An unknown error occurred', code: 1 } }, 500)];
    await assert.rejects(fb.lead('777', 'PAGE-T'), e => e.code === 'rejected' && e.transient === true, 'an answer in the 500s: later');
    assert.equal(asked.length, 4, 'each asked once');
    answers = [answer({ error: { message: 'no', code: 100 } }, 400), answer({ error: { message: 'Unsupported get request. Object with ID \'777\' does not exist', code: 100 } }, 400)];
    await assert.rejects(fb.lead('777', 'PAGE-T'), e => e.code === 'rejected' && /does not exist/.test(e.message) && e.transient === false, 'the second refusal is the lead\'s');
  });
  test('an answer without the lead\'s answers is no lead', async () => {
    for (const body of [null, {}, { id: '777' }, { id: '777', field_data: 'x' }, { id: '777', field_data: { name: 'email' } }]) {
      answers = [answer(body)];
      await assert.rejects(fb.lead('777', 'PAGE-T'), e => e.code === 'rejected' && e.message === 'Facebook answered without the lead\'s answers', JSON.stringify(body));
    }
    answers = [answer({ id: '777', field_data: [] })];
    assert.deepEqual(await fb.lead('777', 'PAGE-T'), { id: '777', field_data: [] }, 'a form with no answers is still a lead');
  });
});

describe('Part 3: where the app is registered to be told', () => {
  const HERE = 'https://crm.example.de/api/integrations/facebook/receive';
  test('asked with the app\'s own token; what it has for Pages is handed back', async () => {
    answers = [answer({ data: [{ object: 'user', callback_url: 'https://x.example/u', fields: ['name'], active: true }, { object: 'page', callback_url: HERE, fields: [{ name: 'leadgen', version: 'v26.0' }, 'feed', 5, null], active: true }] })];
    assert.deepEqual(await fb.receiver(), { callback_url: HERE, fields: ['leadgen', 'feed'], active: true });
    assert.equal(asked[0].origin + asked[0].pathname, 'https://graph.facebook.com/v26.0/1234567890/subscriptions');
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { access_token: '1234567890|s3cret', appsecret_proof: proof('1234567890|s3cret') });
    assert.equal(methods[0], 'GET');
  });
  test('nothing for Pages: none; a registration Facebook switched off says so', async () => {
    for (const body of [{ data: [] }, {}, { data: 'x' }, { data: [null, { object: 'user', callback_url: HERE }] }]) { answers = [answer(body)]; assert.equal(await fb.receiver(), null, JSON.stringify(body)); }
    answers = [answer({ data: [{ object: 'page', active: false }] })];
    assert.deepEqual(await fb.receiver(), { callback_url: '', fields: [], active: false });
    answers = [answer({ data: [{ object: 'page', callback_url: HERE, fields: ['leadgen'] }] })];
    assert.equal((await fb.receiver()).active, true, 'only an outright "no" is off');
  });
  test('registering names the address, the leads and the word Facebook will ask it with', async () => {
    answers = [answer({ success: true })];
    assert.equal(await fb.registerReceiver(HERE), undefined);
    assert.equal(asked[0].origin + asked[0].pathname, 'https://graph.facebook.com/v26.0/1234567890/subscriptions');
    assert.equal(methods[0], 'POST');
    assert.deepEqual(Object.fromEntries(asked[0].searchParams), { object: 'page', callback_url: HERE, fields: 'leadgen', include_values: 'true', verify_token: fb.verifyToken(), access_token: '1234567890|s3cret', appsecret_proof: proof('1234567890|s3cret') });
  });
  test('Facebook\'s refusal is said in its words; without an app nothing is asked', async () => {
    answers = [answer({ error: { message: '(#2200) Callback verification failed with the following errors: HTTP Status Code = 403', code: 2200 } }, 400)];
    await assert.rejects(fb.registerReceiver(HERE), e => e.code === 'rejected' && /Callback verification failed/.test(e.message));
    setEnv({ META_APP_ID: '' });
    asked = [];
    await assert.rejects(fb.receiver(), e => e.code === 'rejected' && e.message === 'Facebook is not set up on this server');
    await assert.rejects(fb.registerReceiver(HERE), e => e.code === 'rejected' && e.message === 'Facebook is not set up on this server');
    assert.equal(asked.length, 0);
  });
});

describe('how it is built', () => {
  const code = read('utils/facebook.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens no database and writes no log: what it knows it is handed, what it learns it hands back', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['crypto']);
    assert.doesNotMatch(code, /console\.|\.query\(/);
    assert.deepEqual(Object.keys(fb).sort(), ['DEFAULT_VERSION', 'FacebookError', 'LEAD_AD_FIELDS', 'LEAD_FIELDS', 'LEAD_TIMEOUT_MS', 'MAX_EVENTS', 'MAX_PAGE_CALLS', 'PAGE_SIZE', 'SCOPES', 'STATE_TTL_MS', 'authUrl', 'call', 'config', 'exchangeCode', 'granted', 'isConfigured', 'lead', 'leadEvents', 'me', 'newState', 'pageInstalled', 'pages', 'proofOf',
      'receiver', 'registerReceiver', 'signatureMatches', 'stateMatches', 'subscribePage', 'unsubscribePage', 'verifyMatches', 'verifyToken']);
  });
  test('every question to Facebook has a time limit, and only Facebook\'s own addresses are asked', () => {
    assert.match(code, /async function call\(path, query = \{\}, \{ method = 'GET', timeoutMs = TIMEOUT_MS \} = \{\}\)/);
    assert.match(code, /fetch\(url, \{ method, signal: AbortSignal\.timeout\(timeoutMs\) \}\)/);
    assert.match(code, /const TIMEOUT_MS = 15000,/);
    assert.equal(fb.LEAD_TIMEOUT_MS, 8000, 'a lead is fetched while Facebook waits: a shorter limit');
    assert.match(code, /async function lead\(leadgenId, pageToken, \{ timeoutMs = LEAD_TIMEOUT_MS \} = \{\}\)/);
    assert.match(code, /async function pageInstalled\(pageId, pageToken, \{ timeoutMs = LEAD_TIMEOUT_MS \} = \{\}\)/, 'the installed check is asked for every given Page when the tab opens: the shorter limit too');
    assert.match(code, /call\(`\$\{pageId\}\/subscribed_apps`, \{ access_token: pageToken \}, \{ timeoutMs \}\)/);
    const leadFn = code.slice(code.indexOf('async function lead('), code.indexOf('const appToken'));
    assert.equal((leadFn.match(/, \{ timeoutMs \}\);/g) || []).length, 2, 'both questions for a lead have that limit');
    assert.equal((code.match(/fetch\(/g) || []).length, 1, 'one place asks Facebook');
    assert.match(code, /\/\^https:\\\/\\\/graph\\\.facebook\\\.com\\\/\/\.test\(path\) \? new URL\(path\) : new URL\(`https:\/\/graph\.facebook\.com\/\$\{c\.version\}\//);
  });
});
