// UNIT tests for utils/lead-mapping.js (LEAD_WEBHOOK_CHANGES Parts 3–5): where in a delivery a contact field's value
// is. Pinned: a path the old receiver understood (dots only) finds what it always found; lists are reached by
// position and name/value pairs by name; keys with dots, blanks or brackets in their names are found; text() turns a
// value into what a contact field takes and refuses objects; flatten() offers every reachable value and every path
// it offers is one pick() resolves to that value; mapPayload() derives what the receiver always derived; asPayload()
// reads JSON, form posts and text; and the body parsers read those from a real request.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const ROOT = path.resolve(__dirname, '..', '..');
const lm = require(path.join(ROOT, 'utils', 'lead-mapping.js'));

// What the receiver's own pick() was until Part 3, word for word: the yardstick for "nothing changed".
const oldPick = (payload, key) => (!key ? null : key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), payload));

const FACEBOOK = { id: '4447', created_time: '2026-11-17T09:00:00+0000', form_id: '99',
  field_data: [{ name: 'full_name', values: ['Erika Muster'] }, { name: 'email', values: ['erika@muster.de'] }, { name: 'Telefonnummer ', values: ['+491711234567'] }, { name: 'interesse', values: ['Studentenapartment', 'Boardinghouse'] }] };
const NESTED = { event: 'lead.created', data: { contact: { email: 'erika@muster.de', name: { first: 'Erika', last: 'Muster' } }, score: 87, vip: true, tags: ['a', 'b'], notes: null },
  items: [{ sku: 'A1', qty: 2 }, { sku: 'B2', qty: 1 }] };

describe('pick: paths the receiver always understood', () => {
  test('a key, a nested key, a missing key, an empty path: the same answers as before', () => {
    const p = { full_name: 'Erika Muster', email: '', data: { contact: { email: 'e@x.de' }, n: 0, off: false, none: null }, list: [{ a: 1 }] };
    for (const key of ['full_name', 'email', 'data.contact.email', 'data.n', 'data.off', 'data.none', 'data.contact', 'nope', 'data.nope.deeper', 'full_name.deeper', 'list.0.a', 'list.5.a', '']) {
      assert.deepEqual(lm.pick(p, key), oldPick(p, key), key);
    }
    assert.equal(lm.pick(p, undefined), null); assert.equal(lm.pick(p, 7), null); assert.equal(lm.pick(null, 'a'), null); assert.equal(lm.pick('text', 'length'), null);
  });
  test('only the delivery\'s own keys count, never what every object has', () => {
    assert.equal(lm.pick({}, 'constructor'), null); assert.equal(lm.pick({ a: {} }, 'a.toString'), null); assert.equal(lm.pick({}, '__proto__'), null);
  });
});

describe('pick: lists, name/value pairs, awkward key names', () => {
  test('a list entry by position, written with a dot or with brackets', () => {
    assert.equal(lm.pick(NESTED, 'items.1.sku'), 'B2'); assert.equal(lm.pick(NESTED, 'items[1].sku'), 'B2'); assert.equal(lm.pick(NESTED, 'items[0][qty]'), 2);
    assert.equal(lm.pick([{ email: 'a@b.de' }], '0.email'), 'a@b.de', 'a delivery that is itself a list');
  });
  test('a name/value pair by its name: case and outer blanks do not matter, the first match wins, no match is nothing', () => {
    assert.deepEqual(lm.pick(FACEBOOK, 'field_data[name=email].values'), ['erika@muster.de']);
    assert.equal(lm.pick(FACEBOOK, 'field_data[name=email].values.0'), 'erika@muster.de');
    assert.equal(lm.pick(FACEBOOK, 'field_data[name = EMAIL ].values.0'), 'erika@muster.de');
    assert.equal(lm.pick(FACEBOOK, 'field_data[name=telefonnummer].values.0'), '+491711234567', 'the delivery wrote the name with a blank at its end');
    assert.equal(lm.pick(FACEBOOK, 'field_data[name=company].values.0'), null);
    assert.equal(lm.pick(FACEBOOK, 'id[name=email]'), null, 'a selector on something that is no list');
    assert.equal(lm.pick([{ key: 'mail', value: 'a@b.de' }], '[key=mail].value'), 'a@b.de', 'a delivery that is itself a list of pairs');
    assert.equal(lm.pick({ f: [{ name: 'a.b', value: 1 }] }, 'f[name=a.b].value'), 1, 'a dot inside the brackets belongs to the name');
  });
  test('a form post\'s contact[email] is contact.email', () => {
    assert.equal(lm.pick({ contact: { email: 'a@b.de' } }, 'contact[email]'), 'a@b.de');
  });
  test('a key exactly as written: with a blank, a dot or brackets in its name; nested always comes first', () => {
    assert.equal(lm.pick({ 'Full Name': 'Erika' }, 'Full Name'), 'Erika');
    assert.equal(lm.pick({ 'contact.email': 'a@b.de' }, 'contact.email'), 'a@b.de');
    assert.equal(lm.pick({ data: { 'contact.email': 'a@b.de', 'x.y': { z: 1 } } }, 'data.contact.email'), 'a@b.de');
    assert.equal(lm.pick({ data: { 'x.y': { z: 1 } } }, 'data.x.y.z'), 1);
    assert.equal(lm.pick({ 'fields[email]': 'a@b.de' }, 'fields[email]'), 'a@b.de');
    assert.equal(lm.pick({ a: { b: 'nested' }, 'a.b': 'flat' }, 'a.b'), 'nested');
    assert.equal(lm.pick({ 'open[bracket': 1 }, 'open[bracket'), 1);
  });
});

describe('text: a value as a contact field takes it', () => {
  test('text as it is; numbers and true/false in words; a list of plain values joined; nothing, objects and lists of objects are no value', () => {
    assert.equal(lm.text(' Erika '), ' Erika ', 'text is not trimmed here: the receiver never did');
    assert.equal(lm.text(''), ''); assert.equal(lm.text(87), '87'); assert.equal(lm.text(0), '0'); assert.equal(lm.text(true), 'true'); assert.equal(lm.text(false), 'false');
    assert.equal(lm.text(['a', 2, null, '', ' ', true]), 'a, 2, true');
    for (const v of [null, undefined, {}, { a: 1 }, [], [{ a: 1 }], [null], NaN, Infinity, () => 1]) assert.equal(lm.text(v), null, String(JSON.stringify(v)));
  });
});

describe('flatten: every value a path can reach', () => {
  const paths = p => lm.flatten(p).map(f => f.path);
  const full = p => Object.fromEntries(lm.flatten(p).map(f => [f.path, f.value]));
  test('nested keys with dots; a list of plain values as one field; other lists by position; empty and null values are offered too', () => {
    assert.deepEqual(full(NESTED), { event: 'lead.created', 'data.contact.email': 'erika@muster.de', 'data.contact.name.first': 'Erika', 'data.contact.name.last': 'Muster',
      'data.score': '87', 'data.vip': 'true', 'data.tags': 'a, b', 'data.notes': '', 'items.0.sku': 'A1', 'items.0.qty': '2', 'items.1.sku': 'B2', 'items.1.qty': '1' });
    assert.deepEqual(full({ a: '', b: [], c: {} }), { a: '', b: '' });
  });
  test('a list of name/value pairs is offered by name, with its value key', () => {
    assert.deepEqual(full(FACEBOOK), { id: '4447', created_time: '2026-11-17T09:00:00+0000', form_id: '99',
      'field_data[name=full_name].values': 'Erika Muster', 'field_data[name=email].values': 'erika@muster.de', 'field_data[name=Telefonnummer].values': '+491711234567',
      'field_data[name=interesse].values': 'Studentenapartment, Boardinghouse' });
    assert.deepEqual(paths({ fields: [{ name: 'email', value: 'a@b.de', objectTypeId: '0-1' }, { name: 'firstname', value: 'Erika', objectTypeId: '0-1' }] }), ['fields[name=email].value', 'fields[name=firstname].value']);
    assert.deepEqual(paths([{ key: 'mail', value: 'a@b.de' }, { key: 'tel', value: '1' }]), ['[key=mail].value', '[key=tel].value']);
    assert.deepEqual(paths({ answers: [{ question: 'Budget?', answer: '10k' }] }), ['answers[question=Budget?].answer']);
  });
  test('a list of records is NOT read as pairs (a selector on a person\'s name would only match the sample): by position', () => {
    assert.deepEqual(paths({ people: [{ name: 'Erika', email: 'a@b.de' }, { name: 'Max', email: 'c@d.de' }] }), ['people.0.name', 'people.0.email', 'people.1.name', 'people.1.email']);
    assert.deepEqual(paths({ f: [{ name: 'x', value: 1 }, { name: 'x', value: 2 }] }), ['f.0.name', 'f.0.value', 'f.1.name', 'f.1.value'], 'the same name twice names nothing');
    assert.deepEqual(paths({ f: [{ name: 'a]b', value: 1 }] }), ['f.0.name', 'f.0.value'], 'a name a selector cannot hold');
    assert.deepEqual(paths({ f: [{ name: 'a', value: 1 }, 'plain'] }), ['f.0.name', 'f.0.value', 'f.1']);
  });
  test('keys with dots are offered and found; a key with brackets only at the top, as one value', () => {
    assert.deepEqual(full({ 'contact.email': 'a@b.de', 'fields[email]': 'c@d.de', 'deep[x]': { y: 1 }, data: { 'a.b': 1, 'c[d]': 2 } }), { 'contact.email': 'a@b.de', 'fields[email]': 'c@d.de', 'data.a.b': '1' });
  });
  test('every path it offers is one pick() resolves to that value', () => {
    const samples = [NESTED, FACEBOOK, [{ key: 'mail', value: 'a@b.de' }], [{ email: 'a@b.de', tags: ['x'] }], { 'contact.email': 'a', 'fields[email]': 'b', data: { 'a.b': { c: [1, 2] } } },
      { form_response: { answers: [{ type: 'text', text: 'Hallo', field: { id: 'q1', ref: 'r1' } }, { type: 'email', email: 'a@b.de', field: { id: 'q2', ref: 'r2' } }] } },
      { custom_fields: [{ id: 'c1', name: 'Budget', type: 'number', value: 5000 }, { id: 'c2', name: 'Quelle', type: 'text', value: 'Messe' }] }];
    let checked = 0;
    for (const s of samples) for (const f of lm.flatten(s)) { assert.equal(lm.text(lm.pick(s, f.path)) ?? '', f.value, `${f.path} in ${JSON.stringify(s).slice(0, 60)}`); checked++; }
    assert.ok(checked >= 30, String(checked));
  });
  test('bounded: at most MAX_FIELDS values, MAX_LIST entries of a list, long values shortened, deep nesting ends; nothing for what is no object', () => {
    const wide = Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, i]));
    assert.equal(lm.flatten(wide).length, lm.MAX_FIELDS);
    assert.equal(lm.flatten({ rows: Array.from({ length: 60 }, (_, i) => ({ n: i })) }).length, lm.MAX_LIST);
    assert.equal(lm.flatten({ a: 'x'.repeat(500) })[0].value.length, lm.EXAMPLE_CHARS + 1);
    let deep = { v: 1 }; for (let i = 0; i < 30; i++) deep = { d: deep };
    assert.deepEqual(lm.flatten(deep), []);
    const loop = { a: 1 }; loop.self = loop;
    assert.ok(lm.flatten(loop).length >= 1, 'an object that contains itself ends too');
    for (const v of [null, undefined, 'text', 5]) assert.deepEqual(lm.flatten(v), []);
  });
});

describe('mapPayload: what the receiver derives', () => {
  const MAP = { name: 'full_name', email: 'email', phone: 'phone_number', company: 'company' };
  test('the four built-in fields; name falls back to first_name + last_name; a missing value is null, a missing name is empty text', () => {
    assert.deepEqual(lm.mapPayload({ full_name: 'Erika Muster', email: 'E@X.de', phone_number: '+49171', company: 'Muster GmbH' }, MAP),
      { name: 'Erika Muster', email: 'E@X.de', phone: '+49171', company: 'Muster GmbH', customData: {}, skipped: {} });
    assert.deepEqual(lm.mapPayload({}, MAP), { name: '', email: null, phone: null, company: null, customData: {}, skipped: {} });
    assert.equal(lm.mapPayload({ vor: 'Erika', nach: 'Muster' }, { ...MAP, first_name: 'vor', last_name: 'nach' }).name, 'Erika Muster');
    assert.equal(lm.mapPayload({ vor: 'Erika' }, { first_name: 'vor', last_name: 'nach' }).name, 'Erika');
    assert.equal(lm.mapPayload({ full_name: 'Voll', vor: 'Erika' }, { ...MAP, first_name: 'vor' }).name, 'Voll', 'a full name wins');
  });
  test('everything else is a custom field; one whose value is missing or blank is listed as skipped; "do not fill" (an empty path) is neither', () => {
    const r = lm.mapPayload({ email: 'a@b.de', budget: 5000, tags: ['a', 'b'], blank: '  ', obj: { x: 1 } }, { ...MAP, eigenkapital: 'budget', herkunft: 'tags', leer: 'blank', fehlt: 'nope', objekt: 'obj', aus: '' });
    assert.deepEqual(r.customData, { eigenkapital: '5000', herkunft: 'a, b' });
    assert.deepEqual(Object.keys(r.skipped), ['leer', 'fehlt', 'objekt']);
    assert.equal(r.skipped.fehlt, 'incoming key "nope" not found or empty in payload');
  });
  test('values that are not text never break it: a number as the name, a list as the email, an object as the phone', () => {
    const r = lm.mapPayload({ full_name: 4711, email: ['a@b.de'], phone_number: { mobile: '1' }, company: true }, MAP);
    assert.deepEqual([r.name, r.email, r.phone, r.company], ['4711', 'a@b.de', null, 'true']);
  });
  test('a Facebook lead with a map of pair paths; a field map that is no object is an empty one', () => {
    const r = lm.mapPayload(FACEBOOK, { name: 'field_data[name=full_name].values', email: 'field_data[name=email].values', phone: 'field_data[name=telefonnummer].values', interesse: 'field_data[name=interesse].values' });
    assert.deepEqual(r, { name: 'Erika Muster', email: 'erika@muster.de', phone: '+491711234567', company: null, customData: { interesse: 'Studentenapartment, Boardinghouse' }, skipped: {} });
    for (const bad of [null, undefined, 'x', [1]]) assert.deepEqual(lm.mapPayload({ email: 'a@b.de' }, bad), { name: '', email: null, phone: null, company: null, customData: {}, skipped: {} });
  });
});

describe('asPayload: the body as an object, whatever was sent', () => {
  test('an object or a list as it is; JSON sent as text; a form post sent as text; anything else kept as raw_body; nothing is {}', () => {
    const o = { a: 1 };
    assert.equal(lm.asPayload(o), o); assert.deepEqual(lm.asPayload([o]), [o]);
    assert.deepEqual(lm.asPayload('{"email":"a@b.de"}'), { email: 'a@b.de' }); assert.deepEqual(lm.asPayload(Buffer.from('[1,2]')), [1, 2]);
    assert.deepEqual(lm.asPayload('"just text"'), { value: 'just text' }); assert.deepEqual(lm.asPayload('42'), { value: 42 });
    assert.deepEqual(lm.asPayload('email=a%40b.de&name=Erika+Muster&tag=a&tag=b&contact[city]=Berlin'), { email: 'a@b.de', name: 'Erika Muster', tag: ['a', 'b'], 'contact[city]': 'Berlin' });
    assert.deepEqual(lm.asPayload('<lead><email>a@b.de</email></lead>'), { raw_body: '<lead><email>a@b.de</email></lead>' });
    assert.equal(lm.asPayload('x'.repeat(9000)).raw_body.length, 5000);
    for (const v of [undefined, null, '', '   ', 7]) assert.deepEqual(lm.asPayload(v), {});
  });
});

describe('the body parsers, on a real request', () => {
  let server, base;
  before(async () => {
    const app = express();
    app.use('/hook', ...lm.bodyParsers(express));   // as server.js mounts them, ahead of the app's express.json()
    app.use(express.json());
    app.post('/hook/:key', (req, res) => res.json({ payload: lm.asPayload(req.body) }));
    app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}/hook/k`;
  });
  after(() => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }));
  const send = async (body, headers) => { const r = await fetch(base, { method: 'POST', headers, body }); return { status: r.status, body: await r.json() }; };

  test('JSON as before', async () => {
    assert.deepEqual((await send('{"email":"a@b.de","data":{"n":1}}', { 'Content-Type': 'application/json' })).body.payload, { email: 'a@b.de', data: { n: 1 } });
    assert.equal((await send('{broken', { 'Content-Type': 'application/json' })).status, 400, 'broken JSON is still the app\'s own 400');
  });
  test('a form post: fields by name, nested names as objects, a repeated name as a list', async () => {
    const r = await send('email=a%40b.de&full+name=Erika+Muster&contact[city]=Berlin&tag=a&tag=b', { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.deepEqual(r.body.payload, { email: 'a@b.de', 'full name': 'Erika Muster', contact: { city: 'Berlin' }, tag: ['a', 'b'] });
  });
  test('a multipart form: its text fields; an uploaded file is not kept and does not fail the delivery', async () => {
    const form = new FormData();
    form.set('email', 'a@b.de'); form.set('contact[city]', 'Berlin');
    assert.deepEqual((await send(form)).body.payload, { email: 'a@b.de', contact: { city: 'Berlin' } });
    const withFile = new FormData();
    withFile.set('email', 'a@b.de'); withFile.set('cv', new Blob(['%PDF']), 'cv.pdf');
    const r = await send(withFile);
    assert.equal(r.status, 200); assert.equal(r.body.payload.email, 'a@b.de'); assert.equal(r.body.payload.cv, undefined);
  });
  test('JSON sent as text/plain, as application/vnd.api+json, or with no content type at all is read as JSON', async () => {
    for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/vnd.api+json' }, { 'Content-Type': 'application/octet-stream' }]) {
      assert.deepEqual((await send('{"email":"a@b.de"}', headers)).body.payload, { email: 'a@b.de' }, headers['Content-Type']);
    }
    const bare = await new Promise((resolve, reject) => {   // fetch always adds a content type to text: a raw request has none
      const req = require('http').request(base, { method: 'POST', headers: { 'Content-Length': 18 } }, res => { let d = ''; res.on('data', c => { d += c; }); res.on('end', () => resolve(JSON.parse(d))); });
      req.on('error', reject); req.end('{"email":"a@b.de"}');
    });
    assert.deepEqual(bare.payload, { email: 'a@b.de' });
  });
  test('text that is neither JSON nor a form is kept as raw_body, so the card can show what arrived', async () => {
    assert.deepEqual((await send('<lead/>', { 'Content-Type': 'application/xml' })).body.payload, { raw_body: '<lead/>' });
  });
  test('server.js mounts them on the lead receiver only, ahead of express.json()', () => {
    const server = require('fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const i = server.indexOf("app.use('/api/integrations/receive', ...require('./utils/lead-mapping').bodyParsers(express));");
    assert.ok(i > 0 && i < server.indexOf('app.use(express.json());'));
    assert.equal(server.split('bodyParsers(express)').length - 1, 1);
  });
});
