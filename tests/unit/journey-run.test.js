// UNIT tests for utils/journey-run.js (CUSTOMER_JOURNEY_CHANGES Part 4, 2026-11-19): what makes a workflow happen.
//
// Here: what an email becomes (plain text or HTML, the "no more emails" link; the variables themselves are
// utils/journey-vars.js with tests of their own), what a task says, the link's signature, and
// the public page behind it. The engine's work on the database — taking deals in, the tick, each kind of step, the
// stop stage, retries, a crashed tick — was checked on a real throwaway Postgres (see the change log): its statements
// are joins and conflicts a stand-in cannot answer faithfully. The lines that carry its guarantees are pinned below,
// so a change to one of them is a deliberate one.
// Part 17 (2026-11-20): an email and the limits of its address — it waits instead of going over a limit, a paused
// address asks Google nothing, Google's "limit" pauses it, what went out is counted, the one-click unsubscribe
// headers, the POST behind them, and the worker's trim. The limits themselves are journey-sends.test.js.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const { loadRoute, serve } = require('../helpers/load-route');
const { createSends } = require('../helpers/fake-sends');   // what utils/journey-sends.js asks the database (Part 17)

const saved = { SESSION_SECRET: process.env.SESSION_SECRET, APP_BASE_URL: process.env.APP_BASE_URL, BASE_URL: process.env.BASE_URL };
process.env.SESSION_SECRET = 'test-session-secret'; process.env.APP_BASE_URL = 'https://crm.example.de'; delete process.env.BASE_URL;
const run = require('../../utils/journey-run');
after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

const vars = require('../../utils/journey-vars');   // what stands between two braces (Part 14): its own tests are journey-vars.test.js
const DATA = vars.rowValues({ contact_name: 'Erika  Musterfrau', contact_company: 'Müller & Söhne', contact_email: 'erika@example.de', deal_title: 'Wohnung <3>' });
const LINK = 'https://crm.example.de/api/journey/unsubscribe/40.sig';

describe('an email\'s text', () => {
  test('HTML or plain text is told by a tag', () => {
    for (const html of ['<p>x</p>', 'a<br>b', '<div style="x">', 'x </b>']) assert.equal(run.isHtml(html), true, html);
    for (const plain of ['Hallo,\nwie geht es?', '1 < 2 und 3 > 2', 'a <3 b', '', null]) assert.equal(run.isHtml(plain), false, String(plain));
  });
  test('HTML is sent as written, with a plain version made from it', () => {
    const p = run.emailParts({ title: 'Angebot für {{firma}}', body: '<h1>Hallo {{first_name}}</h1><p>Zeile 1<br>Zeile 2</p><p><a href="https://x.de/a">Termin buchen</a> &amp; mehr</p><style>p{color:red}</style>' }, DATA, null);
    assert.equal(p.subject, 'Angebot für Müller & Söhne', 'a subject is plain text: nothing is escaped in it');
    assert.match(p.html, /^<h1>Hallo Erika<\/h1><p>Zeile 1<br>Zeile 2<\/p>/);
    assert.equal(p.text, 'Hallo Erika\nZeile 1\nZeile 2\nTermin buchen (https://x.de/a) & mehr');
  });
  test('plain text keeps its line breaks in the HTML version, and its characters are text there', () => {
    const p = run.emailParts({ title: 'Hi', body: 'Hallo {{first_name}},\n\n1 < 2 & "ok".' }, DATA, null);
    assert.equal(p.text, 'Hallo Erika,\n\n1 < 2 & "ok".');
    assert.match(p.html, /^<div style="[^"]*">Hallo Erika,<br><br>1 &lt; 2 &amp; &quot;ok&quot;\.<\/div>$/);
  });
  test('every email carries the "no more emails" link: where the text places it, or in a small line at the end', () => {
    const end = run.emailParts({ title: 'x', body: '<p>Hallo</p>' }, DATA, LINK);
    assert.match(end.html, /<p>Hallo<\/p><p style="[^"]*">Keine weiteren E-Mails erhalten: <a href="https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/40\.sig" style="[^"]*">abmelden<\/a><\/p>$/);
    assert.match(end.text, /^Hallo\n\n--\nKeine weiteren E-Mails erhalten: https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/40\.sig$/);
    for (const name of ['unsubscribe', 'abmelden', ' Unsubscribe ']) {
      const placed = run.emailParts({ title: 'x', body: `<p>Hallo</p><a href="{{${name}}}">Abmelden</a>` }, DATA, LINK);
      assert.equal(placed.html, `<p>Hallo</p><a href="${LINK}">Abmelden</a>`, name);
      assert.doesNotMatch(placed.html, /Keine weiteren E-Mails/, 'not a second time');
    }
    const plain = run.emailParts({ title: 'x', body: 'Hallo\nAbmelden: {{unsubscribe}}' }, DATA, LINK);
    assert.equal(plain.text, `Hallo\nAbmelden: ${LINK}`);
  });
  // Part 19: the tick box "Add the unsubscribe line at the end" of the step's window.
  test('the line at the end: always when the text has no link of its own; with one, only when the step asks for it', () => {
    const LINE = `Keine weiteren E-Mails erhalten: <a href="${LINK}" style="color:#6E7A8C">abmelden</a></p>`;
    for (const name of ['unsubscribe', 'abmelden', 'unsubscribe_url', ' Unsubscribe_URL ', 'unsubscribe_url|x']) {
      const own = `<p>Hallo</p><a href="{{${name}}}">Abmelden</a>`, filled = `<p>Hallo</p><a href="${LINK}">Abmelden</a>`;
      for (const config of [{ footer: false }, {}, undefined, null, 'x', { footer: 'true' }, { footer: 1 }]) assert.equal(run.emailParts({ title: 'x', body: own, config }, DATA, LINK).html, filled, `${name} ${JSON.stringify(config)}: the text's own link is enough`);
      const both = run.emailParts({ title: 'x', body: own, config: { tz: 'Europe/Berlin', footer: true } }, DATA, LINK);
      assert.ok(both.html.startsWith(filled + '<p style="') && both.html.endsWith(LINE), `${name}: the link of the text and the line`);
      assert.ok(both.text.endsWith(`\n\n--\nKeine weiteren E-Mails erhalten: ${LINK}`), name);
      assert.equal(run.emailParts({ title: 'x', body: own, config: { footer: true } }, DATA, null).html, `<p>Hallo</p><a href="${name.includes('|') ? 'x' : ''}">Abmelden</a>`, 'no public address: no line either');
    }
    for (const config of [{ footer: false }, { footer: true }, {}, undefined]) {
      const none = run.emailParts({ title: 'x', body: '<p>Hallo {{first_name}}</p>', config }, DATA, LINK);
      assert.ok(none.html.endsWith(LINE) && none.text.endsWith(LINK), `${JSON.stringify(config)}: a text without a link never goes without the line`);
    }
    assert.ok(run.emailParts({ title: '{{unsubscribe}}', body: 'Hallo', config: { footer: false } }, DATA, LINK).html.endsWith(LINE), 'a link in the subject is none');
    assert.ok(run.emailParts({ title: 'x', body: 'Hallo {{unsubscribe_link}}', config: { footer: false } }, DATA, LINK).html.endsWith(LINE), 'nor is a name nobody knows');
  });
  test('without a public address there is no link, and nothing pretends to be one', () => {
    const p = run.emailParts({ title: 'x', body: '<p>Hallo</p>' }, DATA, null);
    assert.equal(p.html, '<p>Hallo</p>');
    assert.equal(run.unsubscribeUrl(40, null), null);
    assert.equal(run.unsubscribeUrl(null, 'https://crm.example.de'), null);
  });
  test('HTML as plain text: blocks end lines, tags go, a link keeps its address, signs are themselves again', () => {
    assert.equal(run.htmlToText('<div>A</div><div>B &lt;C&gt;&nbsp;&quot;D&quot; &#39;E&#39;</div><ul><li>eins</li><li>zwei</li></ul>'), 'A\nB <C> "D" \'E\'\neins\nzwei');
    assert.equal(run.htmlToText('<p>x</p>\n\n\n\n<p>y</p><script>alert(1)</script><style>.a{}</style>'), 'x\n\ny');
    assert.equal(run.htmlToText('<a href="https://x.de">https://x.de</a>'), 'https://x.de', 'an address is not said twice');
    assert.equal(run.htmlToText(''), ''); assert.equal(run.htmlToText(null), '');
  });
});

describe('the "no more emails" link', () => {
  test('names the contact, signed: the contact comes back from it, and from nothing else', () => {
    const token = run.unsubscribeToken(40);
    assert.match(token, /^40\.[\w-]{43}$/);
    assert.equal(run.contactOfToken(token), 40);
    assert.equal(run.unsubscribeUrl(40), `https://crm.example.de/api/journey/unsubscribe/${token}`);
    const sig = token.split('.')[1];
    for (const bad of [`41.${sig}`, `40.${sig}x`, `40.${sig.slice(0, -1)}`, '40', '40.', 'abc.def', '', null, undefined, `0.${sig}`, `-40.${sig}`, `40.${sig}.x`]) assert.equal(run.contactOfToken(bad), null, String(bad));
    assert.notEqual(run.unsubscribeToken(41).split('.')[1], sig, 'another contact, another signature');
  });
  test('a token made under another server secret is no good', () => {
    const token = run.unsubscribeToken(40);
    process.env.SESSION_SECRET = 'another-secret';
    assert.equal(run.contactOfToken(token), null);
    process.env.SESSION_SECRET = 'test-session-secret';
    assert.equal(run.contactOfToken(token), 40);
  });
});

describe('the public page behind the link', () => {
  const calls = [];
  const pool = { query: async (sql, p) => { calls.push([String(sql).replace(/\s+/g, ' ').trim(), p]); return { rows: [], rowCount: 1 }; } };
  let server;
  before(async () => { server = await serve({ '/api/journey/unsubscribe': loadRoute('journey-public.js', { pool }) }); });
  after(() => server.close());
  const get = path => fetch(server.base + '/api/journey/unsubscribe/' + path).then(async r => ({ status: r.status, type: r.headers.get('content-type'), text: await r.text() }));
  test('a good link switches that contact\'s emails off and says so, without a login', async () => {
    const r = await get(run.unsubscribeToken(40));
    assert.equal(r.status, 200); assert.match(r.type, /text\/html/);
    assert.match(r.text, /Es werden keine weiteren automatischen E-Mails an diese Adresse gesendet\./); assert.match(r.text, /No further automatic emails/);
    assert.deepEqual(calls, [['UPDATE contacts SET journey_opt_out = true WHERE id = $1', [40]]]);
  });
  test('a link that is no good changes nothing and says only that', async () => {
    calls.length = 0;
    for (const bad of ['40.wrong', 'test', '%3Cscript%3E']) {
      const r = await get(bad);
      assert.equal(r.status, 200); assert.match(r.text, /Dieser Link ist nicht gültig\./);
      assert.doesNotMatch(r.text, /script>/);
    }
    assert.deepEqual(calls, []);
  });
  // Part 17: the one-click unsubscribe. A mail program POSTs to the address of the List-Unsubscribe header for the
  // person who pressed its own button (RFC 8058): no login, no cookie, a body the route does not read.
  const post = (path, init = {}) => fetch(server.base + '/api/journey/unsubscribe/' + path, { method: 'POST', ...init }).then(async r => ({ status: r.status, type: r.headers.get('content-type'), text: await r.text() }));
  test('a POST to a good link — what a mail program sends for one click — switches that contact\'s emails off and answers 200', async () => {
    for (const init of [{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }, { headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: '--x\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--x--\r\n' },
      {}, { headers: { 'Content-Type': 'application/json' }, body: '{"contact":41}' }]) {
      calls.length = 0;
      const r = await post(run.unsubscribeToken(40), init);
      assert.equal(r.status, 200, JSON.stringify(init.headers || {}));
      assert.deepEqual(calls, [['UPDATE contacts SET journey_opt_out = true WHERE id = $1', [40]]], 'the contact of the signed link, whatever the body says');
    }
  });
  test('a POST to a link that is no good changes nothing, and answers 200 all the same', async () => {
    calls.length = 0;
    for (const bad of ['40.wrong', 'test', `41.${run.unsubscribeToken(40).split('.')[1]}`]) {
      const r = await post(bad, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
      assert.equal(r.status, 200); assert.match(r.text, /Dieser Link ist nicht gültig\./);
    }
    assert.deepEqual(calls, []);
  });
  test('the lines that make it so: one answer for both, and no other way in', () => {
    const pub = read('routes/journey-public.js').replace(/\/\*[\s\S]*?\*\//, '');
    assert.match(pub, /^router\.get\('\/:token', unsubscribe\);\nrouter\.post\('\/:token', unsubscribe\);$/m);
    assert.deepEqual([...pub.matchAll(/^router\.(\w+)\(/gm)].map(m => m[1]), ['get', 'post']);
    assert.doesNotMatch(pub, /req\.body|req\.query|requireAuth/, 'nothing a caller sends is read but the link itself');
  });
});

// Part 10: a Wait box, and every way a workflow ends for a deal.
describe('when a box happens', () => {
  const from = new Date('2026-11-20T18:00:00Z');   // Friday 19:00 in Berlin
  test('after its own wait, whatever kind it is', () => {
    assert.equal(run.dueOf({ kind: 'email', wait_minutes: 0 }, from).toISOString(), from.toISOString());
    assert.equal(run.dueOf({ kind: 'call', wait_minutes: 90 }, from).toISOString(), '2026-11-20T19:30:00.000Z');
    assert.equal(run.dueOf({ kind: 'wait', wait_minutes: 1440, config: {} }, from).toISOString(), '2026-11-21T18:00:00.000Z');
  });
  test('a Wait box can then hold on until a time of day, on the days it names, on the clock it was saved with', () => {
    const until = config => run.dueOf({ kind: 'wait', wait_minutes: 0, config }, from).toISOString();
    assert.equal(until({ until: '09:00', tz: 'Europe/Berlin' }), '2026-11-21T08:00:00.000Z', 'Saturday 09:00');
    assert.equal(until({ until: '09:00', tz: 'Europe/Berlin', weekdays: [1, 2, 3, 4, 5] }), '2026-11-23T08:00:00.000Z', 'Monday 09:00');
    assert.equal(until({ until: '20:00', tz: 'Europe/Berlin' }), '2026-11-20T19:00:00.000Z', 'still to come today');
    assert.equal(run.dueOf({ kind: 'wait', wait_minutes: 2880, config: { until: '09:00', tz: 'Europe/Berlin', weekdays: [1, 2, 3, 4, 5] } }, from).toISOString(), '2026-11-23T08:00:00.000Z', 'two days, then the next working morning');
    assert.equal(until({ until: 'soon', tz: 'Europe/Berlin' }), from.toISOString(), 'a time that is none: the wait alone');
  });
  test('only a Wait box holds on: a time of day in another box\'s settings moves nothing', () => {
    assert.equal(run.dueOf({ kind: 'email', wait_minutes: 0, config: { until: '09:00', tz: 'Europe/Berlin' } }, from).toISOString(), from.toISOString());
  });
});

describe('where a workflow ends for a deal', () => {
  const X = { workspace_id: 7, deal_id: 60, contact_id: 40, stage_id: 31, started_at: new Date('2026-11-19T08:00:00Z'), journey_opt_out: false };
  const db = (hits = {}) => { const calls = []; return { calls, query: async (sql, p) => { const t = String(sql).replace(/\s+/g, ' ').trim(); calls.push({ sql: t, params: p }); return { rows: hits[/FROM (activities|fonio_calls)/.exec(t)[1]] ? [{}] : [] }; } }; };
  const why = (config, more = {}, hits = {}) => run.stopReason(db(hits), { ...X, ...more, start_config: config });
  test('the deal is in a stage it stops in — any of them', async () => {
    assert.equal(await why({ stop_stage_ids: [32, 31] }), 'stop_stage');
    assert.equal(await why({ stop_stage_ids: [32] }), null);
    assert.equal(await why({ stop_stage_ids: [32] }, { stage_id: null }), null, 'a deal without a stage is in none');
  });
  test('the deal is in none of the stages the workflow is meant for any more', async () => {
    assert.equal(await why({ stay_stage_ids: [31, 32] }), null, 'still in one of them');
    assert.equal(await why({ stay_stage_ids: [32, 33] }), 'left_stages');
    assert.equal(await why({ stay_stage_ids: [31] }, { stage_id: null }), 'left_stages', 'moved out of every stage');
    assert.equal(await why({ stay_stage_ids: [] }), null, 'no such rule');
  });
  test('the contact said "no more emails", when the start says that ends it', async () => {
    assert.equal(await why({ stop_on: ['opt_out'] }, { journey_opt_out: true }), 'opted_out');
    assert.equal(await why({ stop_on: [] }, { journey_opt_out: true }), null, 'not asked for: the emails are skipped, the other steps go on');
  });
  test('a meeting was booked, or a fonio call reached the person, since the deal entered — asked only when the start says so', async () => {
    const quiet = db();
    assert.equal(await run.stopReason(quiet, { ...X, start_config: { stop_stage_ids: [32] } }), null);
    assert.deepEqual(quiet.calls, [], 'a start that names neither asks the database nothing');
    assert.equal(await why({ stop_on: ['meeting'] }, {}, { activities: true }), 'meeting_booked');
    assert.equal(await why({ stop_on: ['meeting'] }, {}, { fonio_calls: true }), null);
    assert.equal(await why({ stop_on: ['answered'] }, {}, { fonio_calls: true }), 'call_answered');
    const asked = db();
    await run.stopReason(asked, { ...X, start_config: { stop_on: ['meeting', 'answered'] } });
    assert.equal(asked.calls.length, 2);
    for (const c of asked.calls) assert.deepEqual(c.params, [7, 60, 40, X.started_at], 'the workspace, the deal, its contact, and since when');
    // in the list's own order (Part 13): the call that reached the person before the meeting
    assert.match(asked.calls[0].sql, /f\.call_outcome = 'answered' AND f\.result_at >= \$4 AND \(f\.deal_id = \$2 OR \(f\.deal_id IS NULL AND f\.contact_id = \$3\)\)/);
    assert.match(asked.calls[1].sql, /a\.type = 'meeting' AND a\.source IN \('calcom','calendly'\) AND a\.cancelled_at IS NULL AND a\.created_at >= \$4 AND \(a\.deal_id = \$2 OR \(a\.deal_id IS NULL AND a\.contact_id = \$3\)\)/);
  });
  test('a start from before these rules, or none at all, ends nothing', async () => {
    for (const c of [undefined, null, {}, { stop_stage_ids: 'x', stay_stage_ids: 5, stop_on: 'meeting' }]) assert.equal(await why(c), null, JSON.stringify(c));
  });
});

// Part 14: the variables of a step's text. What a variable is and how it is filled is journey-vars.test.js; here the
// engine itself runs one row against a stand-in database, so what reaches the task or the email is what is checked.
describe('what a step says to a person: the variables in an email and in a task', () => {
  const NOW = new Date('2027-03-05T10:00:00Z');   // the tick's clock — not the day these tests run on, so {{heute}} shows whose clock it is
  const ROW = { id: 1, workspace_id: 7, flow_id: 2, deal_id: 60, node_id: 3, started_at: new Date('2026-11-18T10:00:00Z'), flow_name: 'Nurture', start_config: {}, kind: 'task', title: '', body: '', config: {},
    next_id: null, else_id: null, deal_title: 'Wohnung 3', stage_id: 31, contact_id: 40, assigned_to: 5, urgency: 0, deal_data: { finanzierung: 'Ja', zimmer: 3 }, contact_name: 'Erika Musterfrau',
    contact_email: 'Erika@Example.de', contact_company: 'Muster <GmbH>', contact_phone: '+49 151 1', journey_opt_out: false, contact_data: { kundenstatus: 'Interessent' }, onboarding_status: null,
    deal_value: '250000.00', stage_name: 'Neu', pipeline_name: 'Vertrieb', owner_name: 'Max Berater', owner_email: 'max@firma.de', workspace_name: 'Firma GmbH' };
  const FIELDS = { deal_fields: [{ field_key: 'finanzierung', name: 'Finanzierung' }, { field_key: 'zimmer', name: 'Zimmer' }], custom_fields: [{ field_key: 'kundenstatus', name: 'Kundenstatus' }] };
  // one row whose time has come, and the answers the engine needs for it
  function stepPool(row, { meeting = [], sender = null } = {}) {
    const asked = [], limits = createSends({ mail: sender ? [{ workspace_id: 7, email: sender.email }] : [] });   // Part 17: the sender's address has room
    return { asked, query: async (sql, p) => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      asked.push({ sql: t, params: p });
      const known = limits.answer(t, p);
      if (known) return known;
      if (t.startsWith("UPDATE journey_runs SET status = 'working'")) return { rows: [{ id: 1, attempts: 1 }] };
      if (t.startsWith('SELECT r.id, r.workspace_id, r.flow_id, r.deal_id, r.node_id, r.started_at')) return { rows: [row] };
      const list = /^SELECT field_key, name FROM (deal_fields|custom_fields) WHERE workspace_id = \$1 AND LOWER\(field_key\) = ANY\(\$2::text\[\]\)$/.exec(t);
      if (list) return { rows: FIELDS[list[1]].filter(f => p[0] === 7 && p[1].includes(f.field_key)) };
      if (/FROM activities a WHERE a\.workspace_id = \$1 AND a\.type = 'meeting'/.test(t)) return { rows: meeting };
      if (t === 'SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1') return { rows: sender ? [sender] : [] };
      if (t.startsWith('INSERT INTO tasks')) return { rows: [{ id: 9 }] };
      return { rows: [], rowCount: 1 };
    } };
  }
  const taskOf = pool => pool.asked.find(c => c.sql.startsWith('INSERT INTO tasks')).params;
  const tables = pool => pool.asked.map(c => (/FROM (deal_fields|custom_fields|activities a)/.exec(c.sql) || [])[1]).filter(Boolean);

  test('a task\'s title and text say who and what: every variable is filled, a missing value takes its fallback, a mistake stays as typed', async () => {
    const pool = stepPool({ ...ROW, title: '{{first_name|Den Lead}} wegen {{deal}} anrufen', body: '{{name}} · {{firma}} · {{telefon}} · {{wert}} · {{phase}} · {{betreuer_vorname}} · {{deal.Finanzierung}} · {{kontakt.kundenstatus}} · {{deal.zimmer}} · '
      + '{{deal.gibtsnicht|x}} · {{nix}} · {{heute}} · [{{unsubscribe}}]' });
    assert.deepEqual(await run.runOne(pool, 1, { now: NOW }), { id: 1, status: 'done', step: 'task', finished: true });
    const [wid, deal, contact, title, text, owner] = taskOf(pool);
    assert.deepEqual([wid, deal, contact, owner], [7, 60, 40, 5]);
    assert.equal(title, 'Erika wegen Wohnung 3 anrufen');
    assert.equal(text, 'Erika Musterfrau · Muster <GmbH> · +49 151 1 · 250.000 · Neu · Max · Ja · Interessent · 3 · {{deal.gibtsnicht|x}} · {{nix}} · 05.03.2027 · []', 'plain text: nothing is escaped, and a task has no "no more emails" link');
    assert.deepEqual(tables(pool), ['deal_fields', 'custom_fields'], 'the field lists are asked because the text names fields; no meeting is looked for');
  });
  // Part 18: the day and the time of the moment the step happens, on the clock the step was saved with.
  test('the day, the time, the weekday, the month and the year are those of the tick, on the clock of who saved the step', async () => {
    const late = new Date('2026-12-31T23:30:00Z'), text = '{{date}} | {{time}} | {{date_time}} | {{weekday}} | {{month}} | {{year}} | {{datum}} {{uhrzeit}} {{wochentag}} {{monat}} {{jahr}} | {{heute}}';
    const said = async config => { const pool = stepPool({ ...ROW, title: 'Stand {{jahr}}', body: text, config }); await run.runOne(pool, 1, { now: late }); return [taskOf(pool)[3], taskOf(pool)[4], tables(pool)]; };
    assert.deepEqual(await said({ tz: 'America/New_York' }), ['Stand 2026', '31.12.2026 | 18:30 | 31.12.2026, 18:30 | Donnerstag | Dezember | 2026 | 31.12.2026 18:30 Donnerstag Dezember 2026 | 31.12.2026', []]);
    assert.deepEqual(await said({ tz: 'Asia/Manila' }), ['Stand 2027', '01.01.2027 | 07:30 | 01.01.2027, 07:30 | Freitag | Januar | 2027 | 01.01.2027 07:30 Freitag Januar 2027 | 01.01.2027', []]);
    for (const config of [{}, null, { tz: 'Nowhere/None' }, { tz: 7 }]) assert.deepEqual((await said(config)).slice(0, 2), ['Stand 2027', '01.01.2027 | 00:30 | 01.01.2027, 00:30 | Freitag | Januar | 2027 | 01.01.2027 00:30 Freitag Januar 2027 | 01.01.2027'], `a step saved before, or with no zone (${JSON.stringify(config)}): Berlin`);
  });
  test('a WhatsApp and an SMS are the same kind of task, with their word in front; the title never grows past its 200 characters', async () => {
    for (const [kind, word] of [['whatsapp', 'WhatsApp: '], ['sms', 'SMS: ']]) {
      const pool = stepPool({ ...ROW, kind, title: 'Hallo {{vorname}}', body: 'Hallo {{vorname}}, Termin am {{termin_datum|noch offen}} um {{termin_uhrzeit|–}}.' }, { meeting: [{ day: '24.11.2026', time: '14:30' }] });
      await run.runOne(pool, 1, { now: NOW });
      assert.deepEqual([taskOf(pool)[3], taskOf(pool)[4]], [`${word}Hallo Erika`, 'Hallo Erika, Termin am 24.11.2026 um 14:30.'], kind);
      assert.deepEqual(tables(pool), ['activities a'], 'the meeting is looked for because the text names it');
    }
    const long = stepPool({ ...ROW, title: 'x'.repeat(190) + ' {{name}}', body: '' });
    await run.runOne(long, 1, { now: NOW });
    assert.deepEqual([taskOf(long)[3].length, taskOf(long)[3].slice(188), taskOf(long)[4]], [200, 'xx Erika Mus', null], 'cut after filling; an empty text is no text');
  });
  test('a deal without a contact, an assignee, a value or a meeting: the fallbacks speak, nothing says "undefined"', async () => {
    const bare = { ...ROW, contact_id: null, contact_name: null, contact_email: null, contact_company: null, contact_phone: null, contact_data: null, assigned_to: null, owner_name: null, owner_email: null, deal_value: null,
      title: '{{first_name|Den Lead}} anrufen', body: '{{name|ohne Kontakt}} / {{betreuer|niemand}} / {{wert|kein Wert}} / {{termin_datum|kein Termin}} / {{kontakt.kundenstatus|–}} / {{firma}}{{telefon}}{{email}}' };
    const pool = stepPool(bare);
    await run.runOne(pool, 1, { now: NOW });
    assert.deepEqual([taskOf(pool)[2], taskOf(pool)[3], taskOf(pool)[4], taskOf(pool)[5]], [null, 'Den Lead anrufen', 'ohne Kontakt / niemand / kein Wert / kein Termin / – / ', null]);
    assert.doesNotMatch(JSON.stringify(taskOf(pool)), /undefined|null\b.*null\b.*NaN|NaN/);
  });
  test('what only the title names is looked up as well: a field in a task\'s title, a field and the meeting in an email\'s subject', async () => {
    const pool = stepPool({ ...ROW, title: '{{deal.zimmer}} Zimmer, Termin {{termin_datum}}', body: 'ohne Variable' }, { meeting: [{ day: '24.11.2026', time: '14:30' }] });
    await run.runOne(pool, 1, { now: NOW });
    assert.equal(taskOf(pool)[3], '3 Zimmer, Termin 24.11.2026');
    assert.deepEqual(tables(pool), ['activities a', 'deal_fields']);
    const parts = run.emailParts({ title: '{{deal.zimmer}} Zimmer am {{termin_datum}}', body: 'x' }, await vars.valuesFor(stepPool(ROW, { meeting: [{ day: '24.11.2026', time: '14:30' }] }), ROW, ['{{deal.zimmer}} Zimmer am {{termin_datum}}', 'x'], NOW), null);
    assert.equal(parts.subject, '3 Zimmer am 24.11.2026');
  });
  test('a step without a variable asks the database nothing more than before', async () => {
    const pool = stepPool({ ...ROW, title: 'Rückruf', body: 'Bitte heute anrufen. 100 % {x} {{ }}' });
    await run.runOne(pool, 1, { now: NOW });
    assert.deepEqual([taskOf(pool)[3], taskOf(pool)[4]], ['Rückruf', 'Bitte heute anrufen. 100 % {x} {{ }}']);
    assert.deepEqual(tables(pool), []);
  });
  test('a call step is not filled: fonio has its own variables, and nothing is looked up for it', async () => {
    const pool = stepPool({ ...ROW, kind: 'call', title: '{{first_name}} {{deal.finanzierung}} {{termin_datum}}', body: '' });
    assert.equal((await run.runOne(pool, 1, { now: NOW })).status, 'skipped');
    assert.deepEqual(tables(pool), []);
    assert.ok(!pool.asked.some(c => c.sql.startsWith('INSERT INTO tasks')));
  });
  test('an email: the subject and the text are filled for this deal — also the workspace\'s fields and the meeting — and a value is text in HTML', async () => {
    const mail = require('../../utils/journey-mail');
    const env = { GOOGLE_MAIL_CLIENT_ID: process.env.GOOGLE_MAIL_CLIENT_ID, GOOGLE_MAIL_CLIENT_SECRET: process.env.GOOGLE_MAIL_CLIENT_SECRET }, realFetch = globalThis.fetch, sent = [];
    Object.assign(process.env, { GOOGLE_MAIL_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret' });
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'ya29.x' }), { status: 200, headers: { 'content-type': 'application/json' } });
      sent.push(Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8'));
      return new Response(JSON.stringify({ id: 'm1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const partOf = (msg, type) => Buffer.from(msg.match(new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]*?)\\r\\n--`))[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
    try {
      const pool = stepPool({ ...ROW, kind: 'email', title: 'Angebot {{deal}} für {{nachname|Sie}}', body: '<p>Hallo {{first_name|zusammen}} von {{company}},</p><p>Finanzierung: {{deal.finanzierung}}, Termin: {{meeting_date|offen}}, '
        + 'Betreuer: {{owner}} ({{owner_email}}), {{workspace}}, {{today}}, {{unknown|x}}</p><a href="{{unsubscribe}}">abmelden</a>' },
        { sender: { email: 'news@firma.de', refresh_token_sealed: mail.sealToken('1//refresh') }, meeting: [{ day: '24.11.2026', time: '14:30' }] });
      assert.deepEqual(await run.runOne(pool, 1, { now: NOW }), { id: 1, status: 'done', step: 'email', finished: true });
      assert.equal(sent.length, 1);
      assert.match(sent[0], /^From: news@firma\.de\r\nTo: erika@example\.de\r\nSubject: /, 'to the contact\'s address, in small letters');
      const subject = Buffer.from(sent[0].match(/Subject: =\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/)[1], 'base64').toString('utf8');   // an umlaut: the header is encoded
      assert.equal(subject, 'Angebot Wohnung 3 für Musterfrau');
      const html = partOf(sent[0], 'text/html'), text = partOf(sent[0], 'text/plain');
      const link = run.unsubscribeUrl(40);
      assert.equal(html, `<p>Hallo Erika von Muster &lt;GmbH&gt;,</p><p>Finanzierung: Ja, Termin: 24.11.2026, Betreuer: Max Berater (max@firma.de), Firma GmbH, 05.03.2027, {{unknown|x}}</p><a href="${link}">abmelden</a>`);
      assert.match(text, /^Hallo Erika von Muster <GmbH>,\nFinanzierung: Ja, Termin: 24\.11\.2026/);
      assert.doesNotMatch(html, /Keine weiteren E-Mails/, 'the text placed the link itself');
      assert.deepEqual(tables(pool), ['activities a', 'deal_fields']);
      const entry = pool.asked.find(c => /INSERT INTO activities/.test(c.sql)).params[3];
      assert.match(entry, /Betreff: Angebot Wohnung 3 für Musterfrau\n/, 'the entry on the contact says the subject as it was sent');
      // Part 19: the engine hands the step's own settings on — the line at the end although the text has its link, or not
      const again = async config => { const p = stepPool({ ...ROW, kind: 'email', title: 'x', body: '<a href="{{unsubscribe_url}}">abmelden</a>', config }, { sender: { email: 'news@firma.de', refresh_token_sealed: mail.sealToken('1//refresh') } });
        await run.runOne(p, 1, { now: NOW }); return partOf(sent.at(-1), 'text/html'); };
      const on = await again({ tz: 'Europe/Berlin', footer: true });
      assert.ok(on.startsWith(`<a href="${link}">abmelden</a><p style="`) && on.endsWith(`Keine weiteren E-Mails erhalten: <a href="${link}" style="color:#6E7A8C">abmelden</a></p>`), on);
      assert.equal(await again({ tz: 'Europe/Berlin', footer: false }), `<a href="${link}">abmelden</a>`);
      assert.equal(await again({ tz: 'Europe/Berlin' }), `<a href="${link}">abmelden</a>`, 'a step saved before there was a tick box');
      assert.equal(sent.length, 4);
    } finally {
      globalThis.fetch = realFetch;
      for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  test('the email\'s parts: a fallback, the link placed with any of its names, and the values handed in are all it knows', () => {
    const none = vars.rowValues({}, NOW);
    assert.equal(run.emailParts({ title: 'Hallo {{vorname|zusammen}}', body: 'x' }, none, null).subject, 'Hallo zusammen');
    for (const name of ['unsubscribe', 'ABMELDEN', ' unsubscribe | hier ']) {
      const p = run.emailParts({ title: 'x', body: `<p>Hi</p><a href="{{${name}}}">x</a>` }, none, LINK);
      assert.equal(p.html, `<p>Hi</p><a href="${LINK}">x</a>`, name);
    }
    assert.equal(run.emailParts({ title: 'x', body: '<p>{{first_name}} {{deal.finanzierung}}</p>' }, { ...none, 'deal.finanzierung': '<b>Ja</b>' }, null).html, '<p> &lt;b&gt;Ja&lt;/b&gt;</p>');
    assert.equal(run.emailParts({ title: '{{first_name}}', body: '{{first_name}}' }, null, null).text, '{{first_name}}', 'no values: nothing is known, nothing is guessed');
    assert.deepEqual([typeof run.valuesOf, typeof run.fill], ['undefined', 'undefined'], 'the variables have one home: utils/journey-vars.js');
  });
});

// Part 15: the whole record. What an entry is and how it is read is journey-log.test.js; here the engine itself runs
// against a stand-in database and what it writes into the record is read back.
describe('the record: what the engine writes down beside what each step did', () => {
  const NOW = new Date('2026-11-20T10:00:00Z');
  const ROW = { id: 1, workspace_id: 7, flow_id: 2, deal_id: 60, node_id: 3, started_at: new Date('2026-11-19T10:00:00Z'), flow_name: 'Nurture', start_config: {}, kind: 'task', title: 'Anrufen', body: '', config: {},
    next_id: null, else_id: null, deal_title: 'Wohnung 3', stage_id: 31, contact_id: 40, assigned_to: 5, urgency: 0, deal_data: {}, contact_name: 'Erika', contact_email: 'erika@example.de', journey_opt_out: false };
  // every entry as an object, in the order it was written
  const KEYS = ['workspace_id', 'flow_id', 'node_id', 'deal_id', 'kind', 'title', 'status', 'detail', 'event', 'flow_name', 'deal_title', 'actor_id', 'actor_name'];
  function recPool(answer, { broken = false } = {}) {
    const asked = [], entries = [];
    return { asked, entries, query: async (sql, p) => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      asked.push(t);
      if (t.startsWith('INSERT INTO journey_log')) {
        if (broken) throw new Error('the record is away');
        entries.push(Object.fromEntries(KEYS.map((k, i) => [k, p[i]]))); return { rows: [{ id: entries.length }] };
      }
      return answer(t, p) || { rows: [], rowCount: 1 };
    } };
  }
  const stepPool = (row, opts) => { const limits = createSends({ mail: opts && opts.sender ? [{ workspace_id: 7, email: opts.sender.email }] : [] }); return recPool((t, p) => {   // Part 17: the sender's address has room
    const known = limits.answer(t, p);
    if (known) return known;
    if (t.startsWith("UPDATE journey_runs SET status = 'working'")) return { rows: [{ id: 1, attempts: (opts && opts.attempts) || 1 }] };
    if (t.startsWith('SELECT r.id, r.workspace_id, r.flow_id, r.deal_id, r.node_id, r.started_at')) return { rows: row ? [row] : [] };
    if (t === 'SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1') return { rows: opts && opts.sender ? [opts.sender] : [] };
    if (t.startsWith('INSERT INTO tasks')) return { rows: [{ id: 9 }] };
    if (t.startsWith('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND flow_id = $2')) return { rows: opts && opts.next ? [opts.next] : [] };
    return null;
  }, opts); };
  const said = e => [e.event, e.kind, e.title, e.status, e.detail];
  const quiet = async fn => { const words = [], real = console.error; console.error = (...a) => words.push(a.join(' ')); try { return [await fn(), words]; } finally { console.error = real; } };

  test('a step, and then the end: each entry says whose it is, which workflow and which deal — by their names', async () => {
    const pool = stepPool(ROW);
    await run.runOne(pool, 1, { now: NOW });
    assert.deepEqual(pool.entries.map(said), [['step', 'task', 'Anrufen', 'done', 'assigned'], ['ended', '', '', 'done', null]]);
    assert.deepEqual(pool.entries[0], { workspace_id: 7, flow_id: 2, node_id: 3, deal_id: 60, kind: 'task', title: 'Anrufen', status: 'done', detail: 'assigned', event: 'step', flow_name: 'Nurture', deal_title: 'Wohnung 3', actor_id: null, actor_name: null });
    assert.deepEqual([pool.entries[1].flow_name, pool.entries[1].deal_title, pool.entries[1].node_id], ['Nurture', 'Wohnung 3', null], 'the names as the engine read them: the entry still says them when the workflow or the deal is gone');
    const step = pool.asked.findIndex(t => t.startsWith('INSERT INTO journey_log')), done = pool.asked.findIndex(t => t.startsWith('UPDATE journey_runs SET status = $2, reason = $3'));
    assert.ok(step >= 0 && step < done && done < pool.asked.lastIndexOf(pool.asked.filter(t => t.startsWith('INSERT INTO journey_log'))[1]), 'what the step did — the row ends — that it ended');
  });
  test('a step with another one behind it writes its own entry and no end', async () => {
    const pool = stepPool({ ...ROW, next_id: 4 }, { next: { id: 4, wait_minutes: 60, kind: 'task', config: {} } });
    assert.equal((await run.runOne(pool, 1, { now: NOW })).finished, false);
    assert.deepEqual(pool.entries.map(e => e.event), ['step']);
  });
  test('where the workflow ends for a deal, the record says so with the reason — and no step happened', async () => {
    const pool = stepPool({ ...ROW, start_config: { stop_stage_ids: [31] } });
    assert.deepEqual(await run.runOne(pool, 1, { now: NOW }), { id: 1, status: 'stopped', reason: 'stop_stage' });
    assert.deepEqual(pool.entries.map(said), [['ended', '', '', 'stopped', 'stop_stage']]);
    assert.ok(!pool.asked.some(t => t.startsWith('INSERT INTO tasks')));
    const left = stepPool({ ...ROW, start_config: { stay_stage_ids: [99] } });
    await run.runOne(left, 1, { now: NOW });
    assert.deepEqual(left.entries.map(said), [['ended', '', '', 'stopped', 'left_stages']]);
  });
  test('a deal whose step is gone is through with the workflow; a row that is gone altogether has nothing to say', async () => {
    const pool = stepPool({ ...ROW, kind: null, title: null, node_id: null });
    assert.deepEqual(await run.runOne(pool, 1, { now: NOW }), { id: 1, status: 'done' });
    assert.deepEqual(pool.entries.map(said), [['ended', '', '', 'done', null]]);
    const none = stepPool(null);
    assert.deepEqual(await run.runOne(none, 1, { now: NOW }), { id: 1, status: 'done' });
    assert.deepEqual(none.entries, [], 'no workspace, no workflow, no deal: no entry');
  });
  test('an email Google cannot be reached for: "will be tried again" each time, and after the last try the step failed', async () => {
    const mail = require('../../utils/journey-mail');
    const env = { GOOGLE_MAIL_CLIENT_ID: process.env.GOOGLE_MAIL_CLIENT_ID, GOOGLE_MAIL_CLIENT_SECRET: process.env.GOOGLE_MAIL_CLIENT_SECRET }, realFetch = globalThis.fetch;
    Object.assign(process.env, { GOOGLE_MAIL_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret' });
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    try {
      const row = { ...ROW, kind: 'email', title: 'Willkommen', body: 'Hallo' }, sender = { email: 'news@firma.de', refresh_token_sealed: mail.sealToken('1//refresh') };
      const first = stepPool(row, { sender, attempts: 1 });
      assert.deepEqual(await run.runOne(first, 1, { now: NOW }), { id: 1, status: 'retry' });
      assert.deepEqual(first.entries.map(said), [['retry', 'email', 'Willkommen', 'retry', 'unreachable']]);
      assert.deepEqual([first.entries[0].node_id, first.entries[0].flow_name, first.entries[0].deal_title], [3, 'Nurture', 'Wohnung 3']);
      const last = stepPool(row, { sender, attempts: run.MAX_ATTEMPTS });
      await run.runOne(last, 1, { now: NOW });
      assert.deepEqual(last.entries.map(said), [['step', 'email', 'Willkommen', 'failed', 'unreachable'], ['ended', '', '', 'done', null]], 'no further try: the step failed, and the workflow went on to its end');
    } finally {
      globalThis.fetch = realFetch;
      for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  test('a deal a start takes in is an entry that names the start; a deal that was in already is none', async () => {
    const flow = { id: 2, workspace_id: 7, first_id: 3, config: { trigger: 'meeting_booked' } };
    const taken = recPool(t => (t.startsWith('SELECT id, wait_minutes, kind, config FROM journey_nodes') ? { rows: [{ id: 3, wait_minutes: 0, kind: 'task', config: {} }] } : t.startsWith('INSERT INTO journey_runs') ? { rows: [{ id: 5, status: 'waiting', due_at: NOW }] } : null));
    assert.deepEqual(await run.enroll(taken, flow, 60, { now: NOW, key: 'm9' }), { id: 5, status: 'waiting', due_at: NOW });
    assert.deepEqual(taken.entries, [{ workspace_id: 7, flow_id: 2, node_id: null, deal_id: 60, kind: '', title: '', status: '', detail: 'meeting_booked', event: 'entered', flow_name: null, deal_title: null, actor_id: null, actor_name: null }],
      'the names are read by the statement that writes the entry');
    const already = recPool(t => (t.startsWith('SELECT id, wait_minutes') ? { rows: [{ id: 3, wait_minutes: 0, kind: 'task', config: {} }] } : t.startsWith('INSERT INTO journey_runs') ? { rows: [] } : null));
    assert.equal(await run.enroll(already, flow, 60, { now: NOW }), null);
    assert.deepEqual(already.entries, []);
  });
  test('a workflow with nothing behind its start: the deal entered, and was through at once', async () => {
    const pool = recPool(t => (t.startsWith('INSERT INTO journey_runs') ? { rows: [{ id: 5, status: 'done', due_at: null }] } : null));
    await run.enroll(pool, { id: 2, workspace_id: 7, first_id: null, config: { trigger: 'lead' } }, 60, { now: NOW });
    assert.deepEqual(pool.entries.map(said), [['entered', '', '', '', 'lead'], ['ended', '', '', 'done', null]]);
  });
  test('a person puts a deal in: "manual" with who — "restart" when the deal was in it already', async () => {
    const pool = was => recPool((t, p) => {
      if (t.startsWith('SELECT f.id, f.workspace_id, f.activated_at, s.config, s.next_id AS first_id')) return { rows: [{ id: 2, workspace_id: 7, activated_at: NOW, config: { trigger: 'lead' }, first_id: 3 }] };
      if (t === 'SELECT id FROM deals WHERE id = $1 AND workspace_id = $2') return { rows: [{ id: p[0] }] };
      if (t === "SELECT 1 FROM journey_runs WHERE flow_id = $1 AND deal_id = $2 AND workspace_id = $3 AND event_key = '' AND status <> 'old'") return { rows: was ? [{ '?column?': 1 }] : [] };
      if (t.startsWith('SELECT id, wait_minutes')) return { rows: [{ id: 3, wait_minutes: 0, kind: 'task', config: {} }] };
      if (t.startsWith('INSERT INTO journey_runs')) return { rows: [{ id: 5, status: 'waiting', due_at: NOW }] };
      return null;
    });
    const fresh = pool(false), again = pool(true);
    await run.include(fresh, { workspaceId: 7, flowId: 2, dealId: 60, now: NOW, actorId: 3 });
    await run.include(again, { workspaceId: 7, flowId: 2, dealId: 60, now: NOW, actorId: 3 });
    assert.deepEqual([fresh.entries.map(said), fresh.entries[0].actor_id], [[['entered', '', '', '', 'manual']], 3], 'not the start\'s name: a person did it');
    assert.deepEqual([again.entries.map(said), again.entries[0].actor_id], [[['entered', '', '', '', 'restart']], 3]);
    assert.ok(fresh.asked.some(t => /status <> 'old'/.test(t)), 'a deal the start had only written down as "there already" was never in it');
    const nobody = pool(false);
    await run.include(nobody, { workspaceId: 7, flowId: 2, dealId: 60, now: NOW });
    assert.equal(nobody.entries[0].actor_id, null, 'put in by something that is no person: no name is made up');
  });
  test('an entry about a deal coming or going that cannot be written holds nothing up — only the step\'s own entry still does', async () => {
    const flow = { id: 2, workspace_id: 7, first_id: null, config: { trigger: 'lead' } };
    const [row, words] = await quiet(() => run.enroll(recPool(t => (t.startsWith('INSERT INTO journey_runs') ? { rows: [{ id: 5, status: 'done', due_at: null }] } : null), { broken: true }), flow, 60, { now: NOW }));
    assert.deepEqual(row, { id: 5, status: 'done', due_at: null }, 'the deal is in all the same');
    assert.equal(words.filter(w => /an entry of the record could not be written: the record is away/.test(w)).length, 2, 'said in the server\'s log, once per entry');
    const stopped = stepPool({ ...ROW, start_config: { stop_stage_ids: [31] } }, { broken: true });
    const [out] = await quiet(() => run.runOne(stopped, 1, { now: NOW }));
    assert.deepEqual(out, { id: 1, status: 'stopped', reason: 'stop_stage' });
    assert.ok(stopped.asked.some(t => t.startsWith('UPDATE journey_runs SET status = $2, reason = $3')), 'the workflow ended for it');
    const step = stepPool(ROW, { broken: true });
    await assert.rejects(run.runOne(step, 1, { now: NOW }), /the record is away/, 'what a step did must be written down before the row moves on');
    assert.ok(!step.asked.some(t => t.startsWith('UPDATE journey_runs SET status = $2, reason = $3') || /SET node_id = \$2, status = 'waiting'/.test(t)), 'so the row stays where it is');
  });
  test('a row a crashed tick had left: its step says "interrupted" — and the end, when nothing stood behind it', async () => {
    const pool = recPool(t => (/WHERE r\.status = 'working' AND r\.updated_at < \$1/.test(t)
      ? { rows: [{ id: 1, workspace_id: 7, flow_id: 2, node_id: 3, deal_id: 60, kind: 'task', title: 'Anrufen', next_id: null }, { id: 2, workspace_id: 7, flow_id: 2, node_id: 4, deal_id: 61, kind: 'email', title: 'Mail', next_id: 9 }] }
      : t.startsWith('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND flow_id = $2') ? { rows: [{ id: 9, wait_minutes: 0, kind: 'task', config: {} }] } : null));
    await run.runDue(pool, { now: NOW });
    assert.deepEqual(pool.entries.map(e => [e.deal_id, ...said(e)]), [[60, 'step', 'task', 'Anrufen', 'failed', 'interrupted'], [60, 'ended', '', '', 'done', null], [61, 'step', 'email', 'Mail', 'failed', 'interrupted']]);
  });
  test('the lines that make it so', () => {
    const src = read('utils/journey-run.js');
    assert.match(src, /^const log\s+= require\('\.\/journey-log'\);/m);
    assert.match(src, /if \(entry && over\) await log\.record\(pool, \{ \.\.\.entry, event: 'ended', status, detail: reason \}\);/, 'said when the workflow is over for the deal — on its last route (Part 23)');
    assert.match(src, /await log\.record\(pool, \{ \.\.\.step, event: 'retry', status: 'retry', detail: res\.detail \}\);\s+return \{ id, status: 'retry' \};/);
    assert.match(src, /await log\.record\(pool, \{ \.\.\.entry, event: 'entered', detail: by \|\| \(flow\.config && flow\.config\.trigger\) \|\| '', actorId \}\);/);
    assert.match(src, /restart: true, by: was \? 'restart' : 'manual', actorId \}\)/);
    assert.doesNotMatch(src, /INSERT INTO journey_log/, 'the record is written in one place');
  });
});

// Part 17: the limits of the sending address. What a limit is and how its time is worked out is journey-sends.test.js;
// here the engine itself runs one email row against the stand-in database and a stand-in Google, so what is checked
// is what happens to the deal, to the record and to Google.
describe('an email and the limits of its address', () => {
  const mail = require('../../utils/journey-mail');
  const NOW = new Date('2026-11-20T10:00:00.000Z'), MIN = 60000, HOUR = 60 * MIN, FROM = 'news@firma.de';
  const ago = span => new Date(NOW.getTime() - span), in_ = span => new Date(NOW.getTime() + span);
  const SEALED = mail.sealToken('1//refresh');
  const ROW = { id: 1, workspace_id: 7, flow_id: 2, deal_id: 60, node_id: 3, started_at: new Date('2026-11-19T10:00:00Z'), held: null, flow_name: 'Nurture', start_config: {}, kind: 'email', title: 'Willkommen', body: 'Hallo', config: {},
    next_id: null, else_id: null, deal_title: 'Wohnung 3', stage_id: 31, contact_id: 40, assigned_to: 5, urgency: 0, deal_data: {}, contact_name: 'Erika', contact_email: 'erika@example.de', journey_opt_out: false };
  const mailed = (n, when, extra = {}) => Array.from({ length: n }, () => ({ workspace_id: 7, from_email: FROM, contact_id: null, kind: 'step', sent_at: when, ...extra }));
  const HOLD = "UPDATE journey_runs SET status = 'waiting', due_at = $2, attempts = GREATEST(attempts - 1, 0), held = $3, updated_at = NOW() WHERE id = $1";
  const CLEAR = 'UPDATE journey_runs SET held = NULL WHERE id = $1';
  // One email row whose time has come, the lists of its address, and who is told. conn: the connection's limits and
  // pause; broken: a statement the database cannot answer; token: what is stored as the sealed sign-in.
  function scene({ row = ROW, conn = {}, attempts = 1, broken = null, token = SEALED, mail: rows, ...lists } = {}) {
    const w = createSends({ mail: rows || [{ workspace_id: 7, email: FROM, ...conn }], members: [{ user_id: 1, workspace_id: 7, role: 'owner' }, { user_id: 3, workspace_id: 7, role: 'member' }], ...lists });
    const calls = [], entries = [], told = [];   // (w.asked: the names of the statements about limits, in the order they were asked)
    const pool = { query: async (sql, p) => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: t, params: p });
      if (broken && broken.test(t)) throw new Error('the database is away');
      if (t.startsWith("UPDATE journey_runs SET status = 'working'")) return { rows: [{ id: 1, attempts }] };
      if (t.startsWith('SELECT r.id, r.workspace_id, r.flow_id, r.deal_id, r.node_id, r.started_at, r.held, f.name AS flow_name')) return { rows: [row] };
      if (t === 'SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1') return { rows: w.w.mail.filter(m => m.workspace_id === p[0]).map(m => ({ email: m.email, refresh_token_sealed: token })) };
      if (t.startsWith('INSERT INTO journey_log')) { entries.push([p[8], p[4], p[5], p[6], p[7]]); return { rows: [{ id: entries.length }] }; }   // event, kind, title, status, detail
      return w.answer(t, p) || { rows: [], rowCount: 1 };
    } };
    return { ...w, pool, calls, entries, told, tell: { notifyUser: async (...a) => { told.push(a); return true; } }, sqls: () => calls.map(c => c.sql), one: text => calls.filter(c => c.sql === text) };
  }
  // Google for the length of one test: every send is answered by `answer` (given how many came before it), and kept.
  async function withGoogle(answer, fn) {
    const env = { GOOGLE_MAIL_CLIENT_ID: process.env.GOOGLE_MAIL_CLIENT_ID, GOOGLE_MAIL_CLIENT_SECRET: process.env.GOOGLE_MAIL_CLIENT_SECRET }, realFetch = globalThis.fetch, google = { tokens: 0, sent: [] };
    Object.assign(process.env, { GOOGLE_MAIL_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_MAIL_CLIENT_SECRET: 'g-secret' });
    const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).includes('/token')) { google.tokens++; return json(200, { access_token: 'ya29.x' }); }
      google.sent.push(Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8'));
      const r = answer ? answer(google.sent.length) : null;
      return r ? json(r.status, r.body, r.headers) : json(200, { id: 'm1' });
    };
    try { return await fn(google); }
    finally { globalThis.fetch = realFetch; for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  }
  const quiet = async fn => { const words = [], real = console.error; console.error = (...a) => words.push(a.join(' ')); try { return [await fn(), words]; } finally { console.error = real; } };
  const LIMIT_429 = { status: 429, body: { error: { code: 429, message: 'User-rate limit exceeded.  Retry after 2026-11-20T10:20:00.000Z (Mail sending)', errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }] } } };

  test('an email the day has no room for WAITS at its step: not sent, not failed, not counted — due again when there is room', async () => {
    const s = scene({ conn: { limit_day: 3 }, sends: [...mailed(2, ago(HOUR)), ...mailed(1, ago(20 * HOUR))] });
    await withGoogle(null, async google => {
      assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW, tell: s.tell }), { id: 1, status: 'held', detail: 'limit_day', until: in_(4 * HOUR) });
      assert.deepEqual([google.tokens, google.sent.length], [0, 0], 'Google is asked nothing');
    });
    assert.deepEqual(s.one(HOLD).map(c => c.params), [[1, in_(4 * HOUR), 'limit_day']], 'waiting again, at the moment the oldest of the three is a day old, with why');
    assert.deepEqual(s.entries, [['retry', 'email', 'Willkommen', 'retry', 'limit_day']], 'the record says why it waits — no step, no end');
    assert.ok(!s.sqls().some(t => /SET node_id = \$2|SET status = \$2, reason = \$3|INSERT INTO activities|INSERT INTO journey_sends|SET due_at = \$2, updated_at = NOW\(\) WHERE id = \$1$/.test(t)), 'the row does not move on, nothing is written onto the contact, nothing is counted, and it is no "tried again"');
    assert.equal(s.w.sends.length, 3);
  });
  test('the hour, the person, a pause: each with its own word and its own time', async () => {
    const cases = [
      [{ conn: { limit_hour: 2 }, sends: mailed(2, ago(15 * MIN)) }, 'limit_hour', in_(45 * MIN)],
      [{ sends: mailed(3, ago(2 * HOUR), { contact_id: 40 }) }, 'limit_person', in_(22 * HOUR)],
      [{ conn: { paused_until: in_(3 * HOUR), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 1 } }, 'paused', in_(3 * HOUR)],
    ];
    for (const [lists, why, until] of cases) {
      const s = scene(lists);
      await withGoogle(null, async google => {
        assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW, tell: s.tell }), { id: 1, status: 'held', detail: why, until }, why);
        assert.equal(google.sent.length + google.tokens, 0, `${why}: Google is asked nothing`);
      });
      assert.deepEqual(s.entries, [['retry', 'email', 'Willkommen', 'retry', why]]);
      assert.deepEqual(s.one(HOLD)[0].params, [1, until, why]);
    }
    const other = scene({ sends: mailed(3, ago(2 * HOUR), { contact_id: 41 }) });
    await withGoogle(null, async google => { assert.equal((await run.runOne(other.pool, 1, { now: NOW })).status, 'done'); assert.equal(google.sent.length, 1, 'three to another contact are not this contact\'s'); });
  });
  test('waiting is no try: a step on its last try waits like any other, and never turns into "failed"', async () => {
    const s = scene({ attempts: run.MAX_ATTEMPTS, conn: { limit_day: 1 }, sends: mailed(1, ago(HOUR)) });
    assert.equal((await run.runOne(s.pool, 1, { now: NOW })).status, 'held');
    assert.deepEqual(s.entries.map(e => [e[0], e[3]]), [['retry', 'retry']]);
    assert.match(HOLD, /attempts = GREATEST\(attempts - 1, 0\)/, 'the count the claim added is taken back');
  });
  test('the record says it ONCE: an email that is looked at again and still waits for the same reason writes no second entry — for another reason it does', async () => {
    const same = scene({ row: { ...ROW, held: 'limit_day' }, conn: { limit_day: 1 }, sends: mailed(1, ago(HOUR)) });
    assert.equal((await run.runOne(same.pool, 1, { now: NOW })).status, 'held');
    assert.deepEqual(same.entries, []);
    assert.deepEqual(same.sqls().filter(t => t.startsWith('UPDATE journey_runs') && /held = /.test(t)), [CLEAR, HOLD], 'what held it is over when it is taken up, and said anew when it is held again');
    const other = scene({ row: { ...ROW, held: 'paused' }, conn: { limit_day: 1 }, sends: mailed(1, ago(HOUR)) });
    await run.runOne(other.pool, 1, { now: NOW });
    assert.deepEqual(other.entries, [['retry', 'email', 'Willkommen', 'retry', 'limit_day']]);
  });
  test('an email that waited and now has room goes out: what held it is cleared, and the step is done', async () => {
    const s = scene({ row: { ...ROW, held: 'limit_hour' } });
    await withGoogle(null, async google => {
      assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW }), { id: 1, status: 'done', step: 'email', finished: true });
      assert.equal(google.sent.length, 1);
    });
    assert.equal(s.one(CLEAR).length, 1); assert.equal(s.one(HOLD).length, 0);
    assert.deepEqual(s.entries, [['step', 'email', 'Willkommen', 'done', 'erika@example.de'], ['ended', '', '', 'done', null]]);
    const stopped = scene({ row: { ...ROW, held: 'limit_day', start_config: { stop_stage_ids: [31] } } });
    assert.equal((await run.runOne(stopped.pool, 1, { now: NOW })).status, 'stopped');
    assert.equal(stopped.one(CLEAR).length, 1, 'also when the workflow ends for the deal instead');
    const never = scene();
    await withGoogle(null, () => run.runOne(never.pool, 1, { now: NOW }));
    assert.equal(never.one(CLEAR).length, 0, 'a row that was not held is not written to for it');
  });
  test('an email that goes out is counted — for the address, as a step, with the contact — and written onto the contact as before', async () => {
    const s = scene();
    await withGoogle(null, async google => {
      assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW }), { id: 1, status: 'done', step: 'email', finished: true });
      assert.deepEqual([google.tokens, google.sent.length], [1, 1]);
    });
    assert.deepEqual(s.w.sends, [{ workspace_id: 7, from_email: FROM, contact_id: 40, kind: 'step', sent_at: NOW }]);
    const order = s.sqls().map(t => (t.startsWith('SELECT m.email, m.limit_day') ? 'limits' : t.startsWith('INSERT INTO journey_sends') ? 'counted' : t.startsWith('INSERT INTO activities') ? 'entry' : t.startsWith('INSERT INTO journey_log') ? 'record' : null)).filter(Boolean);
    assert.deepEqual(order, ['limits', 'counted', 'entry', 'record', 'record'], 'asked before it goes, counted when it is out, then what the step did');
  });
  test('GOOGLE SAYS "LIMIT": the address is paused until the time Google names, this email waits, the owners and admins are told — and nobody asks Google again', async () => {
    const s = scene({ sends: mailed(4, ago(HOUR)) });
    await withGoogle(() => LIMIT_429, async google => {
      assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW, tell: s.tell }), { id: 1, status: 'held', detail: 'paused', until: in_(20 * MIN) });
      assert.equal(google.sent.length, 1);
      assert.deepEqual(s.entries, [['retry', 'email', 'Willkommen', 'retry', 'paused']], 'not "failed": the email is not lost');
      assert.deepEqual(s.one(HOLD)[0].params, [1, in_(20 * MIN), 'paused']);
      // the next email of that address, a minute later — in this tick or the next
      assert.deepEqual(await run.runOne(s.pool, 1, { now: in_(MIN), tell: s.tell }), { id: 1, status: 'held', detail: 'paused', until: in_(20 * MIN) });
      assert.equal(google.sent.length, 1, 'while the address is paused nothing is sent to Google at all');
      assert.equal(google.tokens, 1, 'not even a token is fetched');
    });
    assert.deepEqual([s.w.mail[0].paused_until, s.w.mail[0].pause_reason, s.w.mail[0].pause_detail, s.w.mail[0].pause_count],
      [in_(20 * MIN), 'google_limit', 'User-rate limit exceeded.  Retry after 2026-11-20T10:20:00.000Z (Mail sending)', 1]);
    assert.deepEqual(s.told.map(a => [a[0], a[1], a[2], a[3].type]), [[7, null, 1, 'journey_mail_paused']], 'the owner once — not the member, and not a second time');
    assert.equal(s.w.sends.length, 4, 'an email Google refused is not counted');
  });
  test('Google names no time (403 with a rate reason): paused for an hour; after the pause the next email goes, is counted, and ends the doubling', async () => {
    const s = scene();
    await withGoogle(n => (n === 1 ? { status: 403, body: { error: { code: 403, message: 'User Rate Limit Exceeded', errors: [{ domain: 'usageLimits', reason: 'userRateLimitExceeded' }] } } } : null), async google => {
      assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW, tell: s.tell }), { id: 1, status: 'held', detail: 'paused', until: in_(HOUR) });
      assert.deepEqual(await run.runOne(s.pool, 1, { now: in_(HOUR), tell: s.tell }), { id: 1, status: 'done', step: 'email', finished: true }, 'the pause is over');
      assert.equal(google.sent.length, 2);
    });
    assert.deepEqual([s.w.mail[0].paused_until, s.w.mail[0].pause_count, s.w.sends.length], [null, 0, 1]);
  });
  test('any other refusal of Google is what it was: the step failed with Google\'s words, nothing is paused', async () => {
    const s = scene();
    await withGoogle(() => ({ status: 403, body: { error: { code: 403, message: 'The domain administrators have disabled Gmail apps.', errors: [{ domain: 'global', reason: 'domainPolicy' }] } } }), async () => {
      assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW, tell: s.tell }), { id: 1, status: 'failed', step: 'email', finished: true });
    });
    assert.deepEqual(s.entries[0], ['step', 'email', 'Willkommen', 'failed', 'rejected: The domain administrators have disabled Gmail apps.']);
    assert.deepEqual([s.w.mail[0].paused_until || null, s.told.length, s.w.sends.length], [null, 0, 0]);
  });
  test('LIMITS THAT CANNOT BE ASKED are no leave to send: the email waits a quarter of an hour and is looked at again — said in the record and in the server\'s log', async () => {
    const s = scene({ broken: /^SELECT m\.email, m\.limit_day/ });
    await withGoogle(null, async google => {
      const [out, words] = await quiet(() => run.runOne(s.pool, 1, { now: NOW, tell: s.tell }));
      assert.deepEqual(out, { id: 1, status: 'held', detail: 'error', until: in_(run.RETRY_MINUTES * MIN) });
      assert.deepEqual([google.tokens, google.sent.length], [0, 0], 'nothing is sent unasked');
      assert.ok(words.some(w => /the sending limits could not be asked, the email waits: the database is away/.test(w)));
    });
    assert.deepEqual(s.entries, [['retry', 'email', 'Willkommen', 'retry', 'error']]);
    const slot = scene({ broken: /OFFSET \$5 LIMIT 1$/, conn: { limit_day: 1 }, sends: mailed(1, ago(HOUR)) });
    const [out] = await quiet(() => run.runOne(slot.pool, 1, { now: NOW }));
    assert.deepEqual([out.status, out.detail], ['held', 'error'], 'also when only the time cannot be worked out');
  });
  test('a pause or a count that cannot be written holds nothing up: the email waits all the same, and an email that is out stays done', async () => {
    const pause = scene({ broken: /^UPDATE workspace_mail SET paused_until = \$2/ });
    await withGoogle(() => LIMIT_429, async () => {
      const [out, words] = await quiet(() => run.runOne(pause.pool, 1, { now: NOW, tell: pause.tell }));
      assert.deepEqual(out, { id: 1, status: 'held', detail: 'paused', until: in_(HOUR) }, 'an hour, the pause without a time');
      assert.ok(words.some(w => /the pause of the sending address could not be written: the database is away/.test(w)));
    });
    const count = scene({ broken: /^INSERT INTO journey_sends/ });
    await withGoogle(null, async google => {
      const [out, words] = await quiet(() => run.runOne(count.pool, 1, { now: NOW }));
      assert.deepEqual(out, { id: 1, status: 'done', step: 'email', finished: true });
      assert.equal(google.sent.length, 1);
      assert.ok(words.some(w => /a sent email could not be counted: the database is away/.test(w)));
    });
    assert.deepEqual(count.entries[0], ['step', 'email', 'Willkommen', 'done', 'erika@example.de']);
  });
  test('what is decided before the limits stays as it was: no address, no email address, "no more emails", a sign-in that cannot be opened — the limits are not even asked', async () => {
    const cases = [[{ mail: [] }, 'skipped', 'no_sender'], [{ row: { ...ROW, contact_email: '' } }, 'skipped', 'no_email'], [{ row: { ...ROW, contact_id: null } }, 'skipped', 'no_email'], [{ row: { ...ROW, journey_opt_out: true } }, 'skipped', 'opted_out'],
      [{ token: 'v1.not.a.token' }, 'failed', 'gone']];
    for (const [lists, status, detail] of cases) {
      const s = scene({ conn: { limit_day: 1 }, sends: mailed(5, ago(HOUR)), ...lists });
      await withGoogle(null, async google => {
        assert.deepEqual(await run.runOne(s.pool, 1, { now: NOW }), { id: 1, status, step: 'email', finished: true }, detail);
        assert.equal(google.sent.length, 0);
      });
      assert.deepEqual(s.entries[0], ['step', 'email', 'Willkommen', status, detail]);
      assert.deepEqual(s.asked, [], `${detail}: nothing is asked about limits`);
    }
  });
  test('the address was disconnected in the very moment between the two questions: skipped like "no address", nothing sent', async () => {
    const s = scene();
    const pool = { query: async (sql, p) => (/^\s*SELECT m\.email, m\.limit_day/.test(sql) ? { rows: [] } : s.pool.query(sql, p)) };
    await withGoogle(null, async google => {
      assert.deepEqual(await run.runOne(pool, 1, { now: NOW }), { id: 1, status: 'skipped', step: 'email', finished: true });
      assert.equal(google.sent.length, 0);
    });
    assert.deepEqual(s.entries[0], ['step', 'email', 'Willkommen', 'skipped', 'no_sender']);
  });
  test('ONE-CLICK UNSUBSCRIBE: a workflow\'s email names the contact\'s own link in its headers when the server\'s address is https — and never for http', async () => {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await withGoogle(null, async google => {
      await run.runOne(scene().pool, 1, { now: NOW });
      const link = run.unsubscribeUrl(40);
      assert.match(link, /^https:\/\/crm\.example\.de\/api\/journey\/unsubscribe\/40\./);
      assert.match(google.sent[0], new RegExp(`\\r\\nSubject: Willkommen\\r\\nList-Unsubscribe: <${esc(link)}>\\r\\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\\r\\nMIME-Version: 1\\.0\\r\\n`));
      assert.equal(run.contactOfToken(link.split('/').pop()), 40, 'the link the public route takes — by GET and by POST');
      for (const [origin, name] of [['http://crm.example.de', 'http'], ['', 'no public address']]) {
        process.env.APP_BASE_URL = origin;
        try { await run.runOne(scene().pool, 1, { now: NOW }); } finally { process.env.APP_BASE_URL = 'https://crm.example.de'; }
        assert.doesNotMatch(google.sent.at(-1), /List-Unsubscribe/, name);
      }
      assert.equal(google.sent.length, 3, 'the email goes out either way');
    });
  });
  test('the worker deletes the counted emails that are older than seven days — once an hour, after the tick\'s work, and never in its way', async () => {
    const asked = [], errors = [];
    let trimFails = false, tickFails = false;
    const pool = { query: async sql => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      asked.push(t);
      if (tickFails && /WHERE r\.status = 'working'/.test(t)) throw new Error('the tick broke');
      if (t === 'DELETE FROM journey_sends WHERE sent_at < $1') { if (trimFails) throw new Error('no delete today'); return { rows: [], rowCount: 2 }; }
      return { rows: [], rowCount: 0 };
    } };
    const trims = () => asked.filter(t => t.startsWith('DELETE FROM journey_sends')).length;
    let worker = run.startWorker(pool, { intervalMs: 3600000, log: { error: (...a) => errors.push(a.join(' ')) } });
    try {
      await worker.tick();
      assert.equal(trims(), 1);
      assert.ok(asked.findIndex(t => /WHERE r\.status = 'waiting' AND r\.due_at <= \$1 AND f\.active/.test(t)) < asked.indexOf('DELETE FROM journey_sends WHERE sent_at < $1'), 'after the steps that were due');
      await worker.tick(); await worker.tick();
      assert.equal(trims(), 1, 'not again within the hour');
    } finally { worker.stop(); }
    // a tick that fails still deletes; a delete that fails is said and breaks nothing
    asked.length = 0; tickFails = true; trimFails = true;
    worker = run.startWorker(pool, { intervalMs: 3600000, log: { error: (...a) => errors.push(a.join(' ')) } });
    try {
      await worker.tick();
      assert.equal(trims(), 1);
      assert.ok(errors.some(e => /journey worker: the tick broke/.test(e)) && errors.some(e => /the old counted emails could not be deleted: no delete today/.test(e)));
      tickFails = false;
      await worker.tick();
      assert.ok(asked.filter(t => /WHERE r\.status = 'waiting' AND r\.due_at <= \$1/.test(t)).length === 1, 'the next tick works as ever');
    } finally { worker.stop(); }
  });
  test('the lines that make it so', () => {
    const code = read('utils/journey-run.js').replace(/\/\*[\s\S]*?\*\//, '');
    assert.match(code, /^const sends\s+= require\('\.\/journey-sends'\);/m);
    const email = code.slice(code.indexOf('async function doEmail('), code.indexOf('async function doCall('));
    assert.match(email, /try \{ door = await sends\.gate\(pool, \{ workspaceId: x\.workspace_id, contactId: x\.contact_id, now \}\); \}\s+catch \(err\) \{[\s\S]{0,200}return \{ status: 'held', detail: 'error', until: new Date\(at \+ RETRY_MINUTES \* 60000\) \};/);
    assert.match(email, /if \(!door\.ok\) return \{ status: 'held', detail: door\.why, until: door\.until \};/);
    assert.ok(email.indexOf('sends.gate(') > email.indexOf("'opted_out'") && email.indexOf('sends.gate(') > email.indexOf('mail.openToken('), 'after everything that needs no limit');
    assert.ok(email.indexOf("if (!door.ok) return { status: 'held'") < email.indexOf('vars.valuesFor(') && email.indexOf('vars.valuesFor(') < email.indexOf('mail.send('), 'nothing is looked up, and nothing sent, for an email that waits');
    assert.match(email, /mail\.buildMessage\(\{ from: sender\.email, to, \.\.\.parts, unsubscribe: link \}\)/);
    assert.match(email, /if \(err\.code === 'limited'\) \{[\s\S]{0,260}sends\.pause\(pool, \{ from: sender\.email, now, retryAt: err\.retryAt, detail: err\.message, tell \}\)[\s\S]{0,200}return \{ status: 'held', detail: 'paused', until \};/);
    assert.ok(email.indexOf("err.code === 'limited'") < email.indexOf("return { status: 'failed', detail: err.code === 'gone'"), 'a limit is never a failure');
    assert.ok(email.indexOf('await mail.send(') < email.indexOf('await sends.sent(pool, {') && email.indexOf('await sends.sent(pool, {') < email.indexOf('INSERT INTO activities'), 'counted once it is out');
    assert.match(email, /await sends\.sent\(pool, \{ workspaceId: x\.workspace_id, from: sender\.email, contactId: x\.contact_id, kind: 'step', now, state: door\.state \}\)\s+\.catch\(/);
    const one = code.slice(code.indexOf('async function runOne('), code.indexOf('// ── taking deals in'));
    assert.match(one, /r\.node_id, r\.started_at, r\.held, f\.name AS flow_name/);
    assert.match(one, /if \(x && x\.held\) await pool\.query\(`UPDATE journey_runs SET held = NULL WHERE id = \$1`, \[id\]\);/);
    assert.match(one, /if \(res\.status === 'held'\) \{\s+await pool\.query\(`UPDATE journey_runs SET status = 'waiting', due_at = \$2, attempts = GREATEST\(attempts - 1, 0\), held = \$3, updated_at = NOW\(\) WHERE id = \$1`, \[id, res\.until, res\.detail\]\);\s+if \(x\.held !== res\.detail\) await log\.record\(pool, \{ \.\.\.step, event: 'retry', status: 'retry', detail: res\.detail \}\);\s+return \{ id, status: 'held', detail: res\.detail, until: res\.until \};\s+\}/);
    assert.ok(one.indexOf("if (res.status === 'held')") < one.indexOf("if (res.status === 'retry' && claimed.attempts < MAX_ATTEMPTS)") && one.indexOf("if (res.status === 'held')") < one.indexOf("await log.write(pool, { ...step, event: 'step'"), 'before a try is counted and before a step is written down');
    const worker = code.slice(code.indexOf('function startWorker('));
    assert.match(worker, /if \(Date\.now\(\) - trimmed >= sends\.TRIM_EVERY_MS\) \{\s+trimmed = Date\.now\(\);\s+try \{ await sends\.trim\(pool\); \}\s+catch \(err\) \{/);
    assert.match(read('db.js'), /ALTER TABLE journey_runs ADD COLUMN IF NOT EXISTS held TEXT/);
    // a deal a person puts in again starts afresh: what held its email back is not said about its new start
    assert.match(code, /UPDATE SET node_id = EXCLUDED\.node_id, status = EXCLUDED\.status, due_at = EXCLUDED\.due_at, reason = NULL, held = NULL, attempts = 0, started_at = NOW\(\), updated_at = NOW\(\)/);
  });
});

// Part 23 (2026-11-23): a router box — a deal goes down every route whose question says yes, and is then at several
// places of the workflow at once: the row the start made (the root) and a row of its own for every further route.
describe('a router box: a deal on several routes at once', () => {
  const NOW = new Date('2026-11-23T10:00:00Z'), STARTED = new Date('2026-11-20T08:00:00Z');
  const wait = (id, next_id = null, minutes = 0) => ({ id, flow_id: 2, kind: 'wait', title: '', wait_minutes: minutes, config: {}, next_id, else_id: null });
  const router = (routes, else_id = null) => ({ id: 5, flow_id: 2, kind: 'router', title: 'Split', wait_minutes: 0, config: { routes }, next_id: null, else_id });
  const ALWAYS = [{ id: 1, name: 'A', when: null, next_id: 10 }, { id: 2, name: 'B', when: null, next_id: 11 }, { id: 3, name: 'C', when: null, next_id: 12 }];
  const row = (id, node_id, more = {}) => ({ id, workspace_id: 7, flow_id: 2, deal_id: 60, node_id, status: 'waiting', due_at: NOW, attempts: 0, held: null, reason: null, event_key: '', started_at: STARTED, root_id: null, ...more });
  // The run table and the boxes in memory, answering the engine's own statements — and nothing else: a statement
  // nobody expects is an error, so a changed statement is seen here.
  function world(nodes, runs, { start = {}, deal = {} } = {}) {
    const asked = [], entries = [];
    let nextId = 100;
    const of = id => runs.find(r => r.id === id);
    const drop = keep => { for (let i = runs.length - 1; i >= 0; i--) if (!keep(runs[i])) runs.splice(i, 1); };
    return { asked, entries, runs, query: async (sql, p) => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      asked.push({ sql: t, params: p });
      if (t.startsWith("UPDATE journey_runs SET status = 'working'")) { const r = runs.find(x => x.id === p[0] && x.status === 'waiting'); if (!r) return { rows: [] }; r.status = 'working'; r.attempts++; return { rows: [{ id: r.id, attempts: r.attempts }] }; }
      if (t.startsWith('SELECT r.id, r.workspace_id, r.flow_id, r.deal_id, r.node_id, r.started_at')) {
        const r = of(p[0]); if (!r) return { rows: [] };
        const n = nodes.find(x => x.id === r.node_id) || {};
        return { rows: [{ ...r, flow_name: 'Nurture', start_config: start, kind: n.kind ?? null, title: n.title ?? null, body: '', config: n.config ?? null, next_id: n.next_id ?? null, else_id: n.else_id ?? null,
          deal_title: 'Wohnung 3', stage_id: 31, contact_id: 40, assigned_to: 5, urgency: 0, deal_data: {}, contact_data: {}, contact_phone: '+49 1', contact_email: 'e@example.de', journey_opt_out: false, ...deal }] };
      }
      if (t.startsWith('INSERT INTO journey_log')) { entries.push({ node_id: p[2], kind: p[4], status: p[6], detail: p[7], event: p[8] }); return { rows: [{ id: entries.length }] }; }
      if (t === 'SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = $1 AND flow_id = $2') return { rows: nodes.filter(n => n.id === p[0] && n.flow_id === p[1]).map(({ id, wait_minutes, kind, config }) => ({ id, wait_minutes, kind, config })) };
      if (t === "UPDATE journey_runs SET node_id = $2, status = 'waiting', due_at = $3, attempts = 0, updated_at = NOW() WHERE id = $1") { Object.assign(of(p[0]) || {}, { node_id: p[1], status: 'waiting', due_at: p[2], attempts: 0 }); return { rows: [], rowCount: 1 }; }
      if (t === 'SELECT COUNT(*)::int AS n FROM journey_runs WHERE root_id = $1') return { rows: [{ n: runs.filter(r => r.root_id === p[0]).length }] };
      if (t.startsWith('WITH on_it AS ( UPDATE journey_runs SET node_id = $2, status = \'waiting\', due_at = $3, attempts = 0, updated_at = NOW() WHERE id = $1 RETURNING')) {
        const r = of(p[0]); if (!r) return { rows: [], rowCount: 0 };
        Object.assign(r, { node_id: p[1], status: 'waiting', due_at: p[2], attempts: 0 });
        p[3].forEach((node_id, i) => runs.push(row(nextId++, node_id, { due_at: p[4][i], event_key: p[5][i], started_at: r.started_at, root_id: r.root_id || r.id })));
        return { rows: [], rowCount: p[3].length };
      }
      if (t === 'DELETE FROM journey_runs WHERE id = $1 AND root_id IS NOT NULL') { drop(r => !(r.id === p[0] && r.root_id)); return { rows: [] }; }
      if (t === 'SELECT id, status FROM journey_runs WHERE root_id = $1 ORDER BY id') return { rows: runs.filter(r => r.root_id === p[0]).sort((a, b) => a.id - b.id).map(r => ({ id: r.id, status: r.status })) };
      if (t === "DELETE FROM journey_runs WHERE id = $1 AND root_id = $2 AND status = 'waiting' RETURNING node_id, due_at, attempts, held") {
        const r = runs.find(x => x.id === p[0] && x.root_id === p[1] && x.status === 'waiting'); if (!r) return { rows: [] };
        drop(x => x !== r); return { rows: [{ node_id: r.node_id, due_at: r.due_at, attempts: r.attempts, held: r.held }] };
      }
      if (t === "UPDATE journey_runs SET node_id = $2, status = 'waiting', due_at = $3, attempts = $4, held = $5, updated_at = NOW() WHERE id = $1") { Object.assign(of(p[0]), { node_id: p[1], status: 'waiting', due_at: p[2], attempts: p[3], held: p[4] }); return { rows: [] }; }
      if (t === "UPDATE journey_runs SET node_id = NULL, status = 'waiting', due_at = NOW() + INTERVAL '1 minute', updated_at = NOW() WHERE id = $1") { Object.assign(of(p[0]), { node_id: null, status: 'waiting', due_at: 'in a minute' }); return { rows: [] }; }
      if (t === 'UPDATE journey_runs SET status = $2, reason = $3, node_id = NULL, due_at = NULL, updated_at = NOW() WHERE id = $1') { Object.assign(of(p[0]) || {}, { status: p[1], reason: p[2], node_id: null, due_at: null }); return { rows: [] }; }
      if (t === 'DELETE FROM journey_runs WHERE root_id = $1') { drop(r => r.root_id !== p[0]); return { rows: [] }; }
      if (t === 'UPDATE journey_runs SET held = NULL WHERE id = $1') { Object.assign(of(p[0]) || {}, { held: null }); return { rows: [] }; }   // what held a row back is over once it is taken up (Part 17)
      throw new Error(`a statement nobody expected: ${t}`);
    } };
  }
  const places = w => w.runs.map(r => [r.id, r.node_id, r.status, r.root_id]);
  const said = w => w.entries.map(e => [e.event, e.kind, e.status, e.detail]);

  test('every route whose question says yes: the deal\'s row takes the first, each other gets a row of its own — and the record says which routes', async () => {
    const w = world([router(ALWAYS), wait(10, null, 60), wait(11), wait(12, null, 1440)], [row(1, 5)]);
    assert.deepEqual(await run.runOne(w, 1, { now: NOW }), { id: 1, status: 'done', step: 'router', finished: false, routes: 3 });
    assert.deepEqual(places(w), [[1, 10, 'waiting', null], [100, 11, 'waiting', 1], [101, 12, 'waiting', 1]]);
    assert.deepEqual(w.runs.map(r => r.due_at.toISOString()), ['2026-11-23T11:00:00.000Z', '2026-11-23T10:00:00.000Z', '2026-11-24T10:00:00.000Z'], 'each due after its own box\'s wait');
    assert.deepEqual(w.runs.slice(1).map(r => [r.workspace_id, r.flow_id, r.deal_id, r.started_at]), [[7, 2, 60, STARTED], [7, 2, 60, STARTED]], 'the same deal in the same workflow, entered when the deal entered');
    assert.deepEqual(said(w), [['step', 'router', 'done', 'routes:1,2,3']]);
    assert.ok(!w.entries.some(e => e.event === 'ended'), 'nothing is over');
  });
  test('a further row\'s key is the deal\'s own key, "~" and a tail nobody else has — whatever row it came from', async () => {
    const w = world([router(ALWAYS), wait(10), wait(11), wait(12)], [row(1, 5, { event_key: 'b77' })]);
    await run.runOne(w, 1, { now: NOW });
    const keys = w.runs.slice(1).map(r => r.event_key);
    for (const k of keys) assert.match(k, /^b77~[0-9a-f]{12}$/);
    assert.equal(new Set(keys).size, 2);
    const nested = world([router(ALWAYS), wait(10), wait(11), wait(12)], [row(1, 9), row(50, 5, { root_id: 1, event_key: '~aaaaaaaaaaaa' })]);
    await run.runOne(nested, 50, { now: NOW });
    assert.deepEqual(nested.runs.slice(2).map(r => [r.root_id, /^~[0-9a-f]{12}$/.test(r.event_key)]), [[1, true], [1, true]], 'a route\'s own routes belong to the deal\'s row, and their keys do not grow');
  });
  test('only the routes whose question says yes — and a route that says yes but leads nowhere is gone down all the same: no "otherwise"', async () => {
    const asks = [{ id: 1, name: '', when: { test: 'has_phone' }, next_id: 10 }, { id: 2, name: '', when: { test: 'has_email' }, next_id: 11 }, { id: 4, name: '', when: { test: 'assigned' }, next_id: null }];
    const w = world([router(asks, 12), wait(10), wait(11), wait(12)], [row(1, 5)], { deal: { contact_email: '' } });
    await run.runOne(w, 1, { now: NOW });
    assert.deepEqual(places(w), [[1, 10, 'waiting', null]], 'the phone route; the email route said no; the third leads nowhere');
    assert.deepEqual(said(w), [['step', 'router', 'done', 'routes:1,3']], 'the record names a route by its place among the routes — the number on its foot — not by the number the server keeps it under (4)');
    assert.ok(!w.asked.some(c => c.sql.startsWith('WITH on_it')), 'one way on: the plain statement, no further row');
    const only = world([router([asks[2]], 12), wait(12)], [row(1, 5)]);
    assert.deepEqual(await run.runOne(only, 1, { now: NOW }), { id: 1, status: 'done', step: 'router', finished: true });
    assert.deepEqual([places(only), said(only)], [[[1, null, 'done', null]], [['step', 'router', 'done', 'routes:1'], ['ended', '', 'done', null]]], 'it led nowhere: the deal is through');
  });
  test('no route says yes: the "otherwise" line — and without one the deal is through', async () => {
    const asks = [{ id: 1, name: '', when: { test: 'has_phone' }, next_id: 10 }, { id: 2, name: '', when: { test: 'has_email' }, next_id: 11 }];
    const w = world([router(asks, 12), wait(10), wait(11), wait(12)], [row(1, 5)], { deal: { contact_email: '', contact_phone: '' } });
    await run.runOne(w, 1, { now: NOW });
    assert.deepEqual([places(w), said(w)], [[[1, 12, 'waiting', null]], [['step', 'router', 'done', 'else']]]);
    const none = world([router(asks, null), wait(10), wait(11)], [row(1, 5)], { deal: { contact_email: '', contact_phone: '' } });
    await run.runOne(none, 1, { now: NOW });
    assert.deepEqual([places(none), said(none)], [[[1, null, 'done', null]], [['step', 'router', 'done', 'else'], ['ended', '', 'done', null]]]);
    const gone = world([router(ALWAYS), wait(11)], [row(1, 5)]);   // two of the three boxes were deleted meanwhile
    await run.runOne(gone, 1, { now: NOW });
    assert.deepEqual(places(gone), [[1, 11, 'waiting', null]], 'a line to a box that is gone leads nowhere');
  });
  test('two routes that lead to the same box: the deal is there twice, once per route', async () => {
    const w = world([router([{ id: 1, when: null, next_id: 10 }, { id: 2, when: null, next_id: 10 }]), wait(10)], [row(1, 5)]);
    await run.runOne(w, 1, { now: NOW });
    assert.deepEqual(places(w), [[1, 10, 'waiting', null], [100, 10, 'waiting', 1]]);
  });
  test('a route that is through deletes its row; the workflow is over — and the record says "ended" — only with the last one', async () => {
    const w = world([router(ALWAYS), wait(10), wait(11), wait(12)], [row(1, 5)]);
    await run.runOne(w, 1, { now: NOW });
    assert.deepEqual(await run.runOne(w, 100, { now: NOW }), { id: 100, status: 'done', step: 'wait', finished: true });
    assert.deepEqual(places(w), [[1, 10, 'waiting', null], [101, 12, 'waiting', 1]], 'the row of the route that is through is gone');
    await run.runOne(w, 101, { now: NOW });
    assert.deepEqual(places(w), [[1, 10, 'waiting', null]]);
    assert.ok(!w.entries.some(e => e.event === 'ended'), 'two routes through, one on its way: not over');
    await run.runOne(w, 1, { now: NOW });
    assert.deepEqual(places(w), [[1, null, 'done', null]]);
    assert.deepEqual(w.entries.filter(e => e.event === 'ended').map(e => [e.status, e.detail]), [['done', null]], 'said once, with the last route');
  });
  test('the deal\'s own row is through first: it takes over a route that is still on its way, and is done only when none is left', async () => {
    const later = new Date('2026-11-30T09:00:00Z');
    const w = world([router(ALWAYS), wait(10), wait(11), wait(12)], [row(1, 5)]);
    await run.runOne(w, 1, { now: NOW });
    Object.assign(w.runs[1], { due_at: later, attempts: 2, held: 'limit_day' });
    await run.runOne(w, 1, { now: NOW });   // the route at box 10 is through
    assert.deepEqual(places(w), [[1, 11, 'waiting', null], [101, 12, 'waiting', 1]], 'the oldest route that waits is now the deal\'s row');
    assert.deepEqual([w.runs[0].due_at, w.runs[0].attempts, w.runs[0].held], [later, 2, 'limit_day'], 'as it was: when it is due, its tries, what holds it');
    assert.ok(!w.entries.some(e => e.event === 'ended'));
    await run.runOne(w, 1, { now: later }); await run.runOne(w, 1, { now: later });
    assert.deepEqual(places(w), [[1, null, 'done', null]]);
    assert.equal(w.entries.filter(e => e.event === 'ended').length, 1);
  });
  test('a route whose step is being done this very moment cannot be taken over: the deal\'s row asks again in a minute, and is not done', async () => {
    const w = world([wait(10)], [row(1, 10), row(100, 10, { root_id: 1, status: 'working' })]);
    assert.deepEqual(await run.pathDone(w, { id: 1, root_id: null }), { over: false });
    assert.deepEqual(places(w), [[1, null, 'waiting', null], [100, 10, 'working', 1]]);
    assert.equal(w.runs[0].due_at, 'in a minute');
    w.runs.splice(1, 1);   // that route is through meanwhile
    assert.deepEqual(await run.runOne(w, 1, { now: NOW }), { id: 1, status: 'done' }, 'the row without a box is asked again: now it is over');
    assert.deepEqual([places(w), said(w)], [[[1, null, 'done', null]], [['ended', '', 'done', null]]]);
  });
  test('of several routes still on their way the first that WAITS is taken over — one whose step is being done is left to finish', async () => {
    const w = world([wait(10), wait(11), wait(12)], [row(1, 10), row(100, 11, { root_id: 1, status: 'working' }), row(101, 12, { root_id: 1 })]);
    assert.deepEqual(await run.pathDone(w, { id: 1, root_id: null }), { over: false });
    assert.deepEqual(places(w), [[1, 12, 'waiting', null], [100, 11, 'working', 1]]);
  });
  test('a route\'s question is asked at the moment of the run, not at the moment of the clock on the wall', async () => {
    const young = [{ id: 1, when: { test: 'deal_age', op: 'newer', minutes: 60 }, next_id: 10 }];   // "created within the last hour"
    const THEN = new Date('2020-01-01T10:00:00Z');   // long past: on the wall's clock a deal made half an hour before it is years old
    const w = world([router(young, 11), wait(10), wait(11)], [row(1, 5)], { deal: { deal_created_at: new Date(THEN.getTime() - 30 * 60000) } });
    await run.runOne(w, 1, { now: THEN });
    assert.deepEqual([places(w), said(w)], [[[1, 10, 'waiting', null]], [['step', 'router', 'done', 'routes:1']]]);
    const old = world([router([{ id: 1, when: { test: 'deal_age', op: 'older', minutes: 60 }, next_id: 10 }], 11), wait(10), wait(11)], [row(1, 5)], { deal: { deal_created_at: new Date(THEN.getTime() - 30 * 60000) } });
    await run.runOne(old, 1, { now: THEN });
    assert.deepEqual(said(old), [['step', 'router', 'done', 'else']], 'and half an hour is not yet an hour');
  });
  test('pathDone by itself: a further route is deleted and never over; the deal\'s row alone is done and over', async () => {
    const w = world([], [row(1, 10), row(100, 11, { root_id: 1 })]);
    assert.deepEqual(await run.pathDone(w, { id: 100, root_id: 1 }), { over: false });
    assert.deepEqual(places(w), [[1, 10, 'waiting', null]]);
    assert.deepEqual(w.asked.map(c => c.sql), ['DELETE FROM journey_runs WHERE id = $1 AND root_id IS NOT NULL'], 'one statement, and it can never delete a deal\'s own row');
    assert.deepEqual(await run.pathDone(w, { id: 1, root_id: null }), { over: true });
    assert.deepEqual([w.runs[0].status, w.runs[0].reason, w.runs[0].node_id, w.runs[0].due_at], ['done', null, null, null]);
  });
  test('a rule that ends the workflow ends it on every route at once: the further rows go, the deal\'s row says stopped and why, the record says it once', async () => {
    const w = world([router(ALWAYS), wait(10), wait(11), wait(12)], [row(1, 5)]);
    await run.runOne(w, 1, { now: NOW });
    const stopped = world([wait(10), wait(11), wait(12)], w.runs, { start: { stop_stage_ids: [31] } });   // the deal reached a stop stage meanwhile
    assert.deepEqual(await run.runOne(stopped, 101, { now: NOW }), { id: 101, status: 'stopped', reason: 'stop_stage' }, 'seen on a further route');
    assert.deepEqual(places(stopped), [[1, null, 'stopped', null]]);
    assert.equal(stopped.runs[0].reason, 'stop_stage');
    assert.deepEqual(said(stopped), [['ended', '', 'stopped', 'stop_stage']]);
    assert.equal(await run.runOne(stopped, 1, { now: NOW }), null, 'nothing is left to run');
    const direct = world([], [row(1, 10), row(100, 11, { root_id: 1 }), row(101, 12, { root_id: 1, status: 'working' }), row(2, 10), row(200, 11, { root_id: 2 })]);
    await run.pathStopped(direct, { id: 1, root_id: null }, 'meeting');
    assert.deepEqual(places(direct), [[1, null, 'stopped', null], [2, 10, 'waiting', null], [200, 11, 'waiting', 2]], 'this deal\'s routes only');
  });
  test('at most 24 places per deal and workflow: a route beyond that is not gone down, and the record says so', async () => {
    assert.equal(run.MAX_PATHS, 24);
    const six = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, when: null, next_id: 10 + i }));
    const boxes = [router(six), ...six.map(r => wait(r.next_id))];
    const full = world(boxes, [row(1, 5), ...Array.from({ length: 20 }, (_, i) => row(300 + i, 10, { root_id: 1 }))]);
    assert.equal((await run.runOne(full, 1, { now: NOW })).routes, 4, 'the deal\'s row and three more: 24 places in all');
    assert.equal(full.runs.length, 24);
    assert.deepEqual(said(full), [['step', 'router', 'done', 'routes:1,2,3,4,5,6'], ['step', 'router', 'skipped', 'paths_limit']]);
    const room = world(boxes, [row(1, 5), ...Array.from({ length: 18 }, (_, i) => row(300 + i, 10, { root_id: 1 }))]);
    await run.runOne(room, 1, { now: NOW });
    assert.deepEqual([room.runs.length, said(room).length], [24, 1], 'exactly room for all six: nothing is said');
    const none = world(boxes, [row(1, 5), ...Array.from({ length: 23 }, (_, i) => row(300 + i, 10, { root_id: 1 }))]);
    await run.runOne(none, 1, { now: NOW });
    assert.deepEqual([none.runs.length, none.runs[0].node_id], [24, 10], 'no room: the deal\'s row still goes down the first route');
    const child = world(boxes, [row(1, 9), row(50, 5, { root_id: 1 }), ...Array.from({ length: 21 }, (_, i) => row(300 + i, 10, { root_id: 1 }))]);
    await run.runOne(child, 50, { now: NOW });
    assert.equal(child.runs.length, 24, 'counted for the deal\'s row, whichever route reaches the router');
  });
  test('"Include" starts the deal again from the first box: the routes it was on before are not gone on with', async () => {
    const calls = [];
    const pool = { query: async (sql, p) => { const t = String(sql).replace(/\s+/g, ' ').trim(); calls.push([t, p]);
      return t.startsWith('INSERT INTO journey_runs') ? { rows: [{ id: 5, status: 'waiting', due_at: NOW }] } : t.startsWith('SELECT id, wait_minutes') ? { rows: [{ id: 3, wait_minutes: 0, kind: 'task', config: {} }] } : { rows: [], rowCount: 1 }; } };
    const flow = { id: 2, workspace_id: 7, first_id: 3, config: { trigger: 'manual' } };
    await run.enroll(pool, flow, 60, { now: NOW, restart: true, by: 'restart' });
    assert.deepEqual(calls.find(c => c[0].startsWith('DELETE FROM journey_runs')), ['DELETE FROM journey_runs WHERE root_id = $1', [5]]);
    calls.length = 0;
    await run.enroll(pool, flow, 60, { now: NOW });
    assert.ok(!calls.some(c => c[0].startsWith('DELETE')), 'a deal a start takes in has no routes from before to clear');
  });
  test('the lines that make it so', () => {
    const src = read('utils/journey-run.js');
    assert.match(src, /^const routes\s+= require\('\.\/journey-router'\);/m);
    assert.match(src, /WITH on_it AS \(\s+UPDATE journey_runs SET node_id = \$2, status = 'waiting', due_at = \$3, attempts = 0, updated_at = NOW\(\) WHERE id = \$1\s+RETURNING workspace_id, flow_id, deal_id, started_at, COALESCE\(root_id, id\) AS root\s+\)\s+INSERT INTO journey_runs \(workspace_id, flow_id, deal_id, node_id, status, due_at, event_key, started_at, root_id\)\s+SELECT o\.workspace_id, o\.flow_id, o\.deal_id, t\.node_id, 'waiting', t\.due_at, t\.key, o\.started_at, o\.root\s+FROM on_it o, unnest\(\$4::int\[\], \$5::timestamptz\[\], \$6::text\[\]\) AS t\(node_id, due_at, key\)/, 'the row moves on and the further rows are made in ONE statement: a crash leaves all of it or none');
    assert.match(src, /const over = status === 'stopped' \? \(await pathStopped\(pool, row, reason\), true\) : \(await pathDone\(pool, row\)\)\.over;/);
    assert.match(src, /else if \(\(await pathDone\(pool, s\)\)\.over\) await log\.record\(pool, \{ \.\.\.entry, event: 'ended', status: 'done' \}\);/, 'a row a crash left with nothing behind its step is through like any other');
    assert.match(src, /`SELECT r\.id, r\.root_id, r\.workspace_id, r\.flow_id, r\.node_id, r\.deal_id, n\.kind, n\.title, n\.next_id FROM journey_runs r LEFT JOIN journey_nodes n ON n\.id = r\.node_id/);
    assert.match(src, /n\.next_id, n\.else_id, r\.root_id, r\.event_key,/);
    assert.match(read('db.js'), /ALTER TABLE journey_runs ADD COLUMN IF NOT EXISTS root_id INTEGER REFERENCES journey_runs\(id\) ON DELETE CASCADE/);
    assert.match(read('db.js'), /CREATE INDEX IF NOT EXISTS journey_runs_root_idx ON journey_runs \(root_id\) WHERE root_id IS NOT NULL/, 'a deal\'s routes are looked up by it at every end of a route');
    assert.deepEqual([typeof run.pathDone, typeof run.pathStopped], ['function', 'function'], 'the route ends a route the same way when a box is deleted');
  });
});

describe('the lines that carry the engine\'s guarantees', () => {
  const code = read('utils/journey-run.js').replace(/\/\*[\s\S]*?\*\//, '');   // the code without its header
  test('it never opens the database module itself', () => {
    assert.doesNotMatch(code, /require\('\.\.\/db'\)|require\('\.\.\/notifications'\)|require\('\.\/engine'\)/);
    assert.match(code, /^async function runDue\(pool, \{ now = new Date\(\), limit = 25, tell = \{\} \} = \{\}\)/m);
  });
  test('a row is claimed before its step happens, so no step happens twice', () => {
    const one = code.slice(code.indexOf('async function runOne('), code.indexOf('// ── taking deals in'));
    assert.match(one, /UPDATE journey_runs SET status = 'working', attempts = attempts \+ 1, updated_at = NOW\(\) WHERE id = \$1 AND status = 'waiting' RETURNING id, attempts/);
    assert.match(one, /if \(!claimed\) return null;/);
    assert.ok(one.indexOf("status = 'working'") < one.indexOf('await doEmail('), 'claimed first');
  });
  test('the stop stage is looked at before the step, and the step\'s outcome is written down before the row moves on', () => {
    const one = code.slice(code.indexOf('async function runOne('), code.indexOf('// ── taking deals in'));
    assert.ok(one.indexOf("const stop = await stopReason(pool, x, now);") > 0 && one.indexOf("if (stop) { await end('stopped', stop);") < one.indexOf('await doEmail('), 'where it ends is asked before the step');
    // Part 15: the step's entry goes through the record's write() — the one that throws, so a step whose outcome cannot be written down does not move on
    assert.ok(one.indexOf("await log.write(pool, { ...step, event: 'step', status, detail: res.detail });") > 0 && one.indexOf("await log.write(pool, { ...step, event: 'step'") < one.indexOf("SET node_id = $2, status = 'waiting', due_at = $3, attempts = 0"));
    assert.match(one, /if \(res\.status === 'retry' && claimed\.attempts < MAX_ATTEMPTS\)/);
  });
  test('only workflows that are on run, and a start takes in only what happened since its workflow was switched on', () => {
    const starts = read('utils/journey-triggers.js');   // Part 9: every start is this file; the engine asks it
    assert.match(code, /WHERE r\.status = 'waiting' AND r\.due_at <= \$1 AND f\.active ORDER BY r\.due_at, r\.id LIMIT \$2/);
    assert.match(code, /^const newDeals = \(pool, flow, now = new Date\(\)\) => triggers\.find\(pool, flow, now\);$/m);
    assert.match(starts, /WHERE d\.workspace_id = \$1 AND d\.created_at >= \$5 AND \(\$3::int IS NULL OR d\.pipeline_id = \$3\)\s+AND NOT EXISTS \(SELECT 1 FROM journey_runs r WHERE r\.flow_id = \$2 AND r\.deal_id = d\.id\)/);
    assert.match(starts, /l\.deal_id = d\.id AND l\.workspace_id = d\.workspace_id AND l\.source = 'lead' AND l\.webhook_id IS NOT NULL\s+AND \(\$6::int\[\] IS NULL OR l\.webhook_id = ANY\(\$6::int\[\]\)\)/);
    assert.match(starts, /SELECT d\.workspace_id, \$2, d\.id, NULL, 'old', NULL FROM deals d WHERE d\.workspace_id = \$1 AND d\.stage_id = \$3\s+ON CONFLICT \(flow_id, deal_id, event_key\) DO NOTHING/);
    assert.match(starts, /if \(!isTrigger\(c\.trigger\) \|\| !flow\.activated_at\) return \[\];/, 'a workflow that was never switched on takes nothing in');
  });
  test('a deal is in a workflow once per thing that happened, and one start that fails does not hold the others back', () => {
    assert.match(code, /INSERT INTO journey_runs \(workspace_id, flow_id, deal_id, node_id, status, due_at, event_key\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)\s+ON CONFLICT \(flow_id, deal_id, event_key\) DO \$\{restart/);
    assert.match(read('db.js'), /CREATE UNIQUE INDEX IF NOT EXISTS journey_runs_once_idx ON journey_runs \(flow_id, deal_id, event_key\)/);
    const enrol = code.slice(code.indexOf('async function enrollNew('), code.indexOf('const baseline ='));
    assert.match(enrol, /try \{\s+for \(const found of await newDeals\(pool, flow, now\)\) if \(await enroll\(pool, flow, found\.dealId, \{ now, key: found\.key \}\)\) taken\+\+;\s+\} catch \(err\)/);
  });
  test('a Wait box does nothing but take its time, and every box\'s time is worked out in one place', () => {
    assert.match(code, /res = x\.kind === 'wait' \? \{ status: 'done', detail: 'waited' \}\s+: x\.kind === 'branch' \? await doBranch\(pool, x, now\)\s+: x\.kind === 'router' \? await doRouter\(pool, x, now\)\s+: x\.kind === 'email'/);
    assert.equal((code.match(/SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = \$1 AND flow_id = \$2/g) || []).length, 3, 'the first box, the next box, and the box after a step a crash interrupted');
    assert.equal((code.match(/dueOf\((first|next|n), /g) || []).length, 5, 'and, with a router (Part 23), the first of several routes and each further route\'s box');
    assert.doesNotMatch(code.slice(code.indexOf('async function runOne(')), /wait_minutes \|\| 0\) \* 60000/, 'no second way to work a time out');
  });
  // Part 22: an age is counted back from the moment the row is run, and the row carries who and when
  test('a branch box is asked at the moment of the run, with the deal\'s and the contact\'s assignee and creation in the row', () => {
    assert.match(code, /d\.custom_data AS deal_data, d\.created_at AS deal_created_at,/);
    assert.match(code, /c\.custom_data AS contact_data, c\.onboarding_status, c\.assigned_to AS contact_assigned_to, c\.created_at AS contact_created_at\s+FROM journey_runs r/);
    assert.match(code, /LEFT JOIN contacts c ON c\.id = d\.contact_id AND c\.workspace_id = d\.workspace_id/, 'a contact of another workspace is not read');
  });
  test('a branch box does nothing to the deal: its answer picks the line, and a line that leads nowhere ends the workflow', () => {
    assert.match(code, /async function doBranch\(pool, x, now\) \{\s+const yes = await branch\.holds\(pool, x, x\.config, \{ now \}\);\s+return \{ status: 'done', detail: yes \? 'yes' : 'no', to: \(yes \? x\.next_id : x\.else_id\) \|\| null \};\s+\}/);
    const one = code.slice(code.indexOf('async function runOne('), code.indexOf('// ── taking deals in'));
    assert.match(one, /const wanted = \(res\.targets !== undefined \? res\.targets : \[res\.to !== undefined \? res\.to : x\.next_id\]\)\.filter\(Boolean\);/);
    assert.match(one, /const \{ rows: \[n\] \} = await pool\.query\('SELECT id, wait_minutes, kind, config FROM journey_nodes WHERE id = \$1 AND flow_id = \$2', \[nextId, x\.flow_id\]\);/, 'a box of this workflow only');
    assert.match(one, /const \[next, \.\.\.more\] = nexts;\s+if \(!next\) \{ await end\('done'\);/);
    assert.match(one, /n\.kind, n\.title, n\.body, n\.config, n\.next_id, n\.else_id,/);
    assert.match(one, /d\.assigned_to, d\.urgency, d\.custom_data AS deal_data,/); assert.match(one, /c\.phone AS contact_phone, c\.journey_opt_out/);
    assert.ok(one.indexOf('const stop = await stopReason(pool, x, now);') > 0 && one.indexOf('const stop = await stopReason(pool, x, now);') < one.indexOf('await doBranch(pool, x, now)'), 'where the workflow ends is asked before the question');
    assert.ok(one.indexOf('await doBranch(pool, x, now)') < one.indexOf("await log.write(pool, { ...step, event: 'step'"), 'which way a deal went is written down');
  });
  test('the two questions a start can end a workflow on are the branch box\'s own', () => {
    // Part 13: every rule beside the stages is utils/journey-ends.js; the two that a branch box asks too are still its
    const stop = code.slice(code.indexOf('async function stopReason('), code.indexOf('async function doBranch('));
    assert.match(stop, /return ends\.reasonOf\(pool, x, c, now\);/);
    assert.doesNotMatch(stop, /FROM activities|FROM fonio_calls|\.query\(/, 'the engine itself asks the database nothing about where it ends');
    const rules = read('utils/journey-ends.js');
    assert.match(rules, /answered:\s+\(pool, x\) => branch\.answeredSince\(pool, x\),/); assert.match(rules, /meeting:\s+\(pool, x\) => branch\.meetingSince\(pool, x\),/);
    assert.match(code, /^const branch\s+= require\('\.\/journey-branch'\);/m); assert.match(code, /^const ends\s+= require\('\.\/journey-ends'\);/m);
  });
  test('a question or a wait a crash interrupted is asked again; only a step that may have happened is not repeated', () => {
    const tick = code.slice(code.indexOf('async function runDue('));
    assert.match(tick, /if \(s\.kind === 'branch' \|\| s\.kind === 'router' \|\| s\.kind === 'wait'\) \{ await pool\.query\(`UPDATE journey_runs SET status = 'waiting', updated_at = NOW\(\) WHERE id = \$1 AND status = 'working'`, \[s\.id\]\); continue; \}/);
    assert.ok(tick.indexOf("if (s.kind === 'branch' || s.kind === 'router' || s.kind === 'wait')") < tick.indexOf("status: 'failed', detail: 'interrupted'") && tick.indexOf("status: 'failed', detail: 'interrupted'") > 0);
  });
  // Found by the bug hunt of 2026-11-19: the rows a crashed tick had left were put right with nothing around them, so
  // one row that could not be written kept every tick from every other deal, in every workspace.
  test('a row a tick had left that cannot be put right does not keep the tick from the other deals', async () => {
    const asked = [], errors = [], realError = console.error;
    const pool = { query: async (sql, p) => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      asked.push(t);
      if (/WHERE r\.status = 'working' AND r\.updated_at < \$1/.test(t)) return { rows: [{ id: 1, workspace_id: 7, flow_id: 2, node_id: 3, deal_id: 60, kind: 'task', title: 'x', next_id: null }, { id: 2, workspace_id: 7, flow_id: 2, node_id: 4, deal_id: 61, kind: 'branch', title: '', next_id: null }] };
      if (t.startsWith('INSERT INTO journey_log')) throw new Error('the log cannot be written');
      return { rows: [], rowCount: 0 };
    } };
    console.error = (...a) => errors.push(a.join(' '));
    try { await run.runDue(pool, { now: new Date('2026-11-19T12:00:00Z') }); } finally { console.error = realError; }
    assert.ok(errors.some(e => /a row a tick had left could not be put right: the log cannot be written/.test(e)), 'said, not swallowed');
    assert.ok(asked.some(t => /^UPDATE journey_runs SET status = 'waiting', updated_at = NOW\(\) WHERE id = \$1 AND status = 'working'$/.test(t)), 'the next row a tick had left is still put right');
    assert.ok(asked.some(t => /WHERE r\.status = 'waiting' AND r\.due_at <= \$1 AND f\.active/.test(t)), 'and the steps that are due are still looked for');
  });
  test('the variables: the row reads what is cheap to join, each step asks for its own texts only, and a call asks for nothing', () => {
    const one = code.slice(code.indexOf('async function runOne('), code.indexOf('// ── taking deals in'));
    assert.match(one, /d\.value AS deal_value, ps\.name AS stage_name, p\.name AS pipeline_name, u\.name AS owner_name, u\.email AS owner_email, w\.name AS workspace_name/);
    for (const join of ['LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id', 'LEFT JOIN pipelines p ON p.id = d.pipeline_id', 'LEFT JOIN users u ON u.id = d.assigned_to', 'LEFT JOIN workspaces w ON w.id = r.workspace_id']) {
      assert.ok(one.includes(join), join);   // LEFT: a deal without a stage or an assignee still gets its step
    }
    const email = code.slice(code.indexOf('async function doEmail('), code.indexOf('async function doCall('));
    // Part 17: the link has a name now — it also goes into the message's one-click unsubscribe headers
    assert.match(email, /const link = unsubscribeUrl\(x\.contact_id\);\s+const parts = emailParts\(\{ title: x\.title, body: x\.body, config: x\.config \}, await vars\.valuesFor\(pool, x, \[x\.title, x\.body\], now\), link\);/);
    for (const reason of ['no_sender', 'no_email', 'opted_out']) assert.ok(email.indexOf(`'${reason}'`) < email.indexOf('vars.valuesFor('), `${reason}: nothing is looked up for an email that is not sent`);
    const task = code.slice(code.indexOf('async function doTask('), code.indexOf('async function doMove('));
    assert.match(task, /const values = await vars\.valuesFor\(pool, x, \[x\.title, x\.body\], now\);/);
    assert.doesNotMatch(task, /unsubscribe/, 'no link: that is an email\'s');
    assert.match(task, /const title = \(TASK_PREFIX\[x\.kind\] \+ vars\.fill\(x\.title, values, false\)\)\.slice\(0, 200\);/);
    assert.match(task, /title, vars\.fill\(x\.body, values, false\) \|\| null, x\.assigned_to \|\| null\]/);
    assert.doesNotMatch(code.slice(code.indexOf('async function doCall('), code.indexOf('// A task for the person')), /vars\./);
    assert.match(one, /await doEmail\(pool, x, now, tell\)/); assert.match(one, /await doTask\(pool, x, tell, now\)/);   // Part 17: an email step may have to tell of a pause
    const parts = code.slice(code.indexOf('function emailParts('), code.indexOf('// ── what a box does'));
    assert.match(parts, /html = vars\.fill\(raw, values, true\);/, 'into HTML as text'); assert.match(parts, /text = vars\.fill\(raw, values, false\);/);
    assert.match(parts, /const footer = !vars\.usedIn\(raw\)\.has\('unsubscribe'\) \|\| !!\(node\.config && typeof node\.config === 'object' && node\.config\.footer === true\);/);
    assert.match(parts, /if \(link && footer\) \{/);
    assert.doesNotMatch(code, /function valuesOf|function fill\b/, 'one home for the variables');
  });
  test('an email is skipped, not sent, without a sender, an address, or after the person said no', () => {
    const email = code.slice(code.indexOf('async function doEmail('), code.indexOf('async function doCall('));
    for (const reason of ['no_sender', 'no_email', 'opted_out']) assert.ok(email.indexOf(`'${reason}'`) > 0 && email.indexOf(`'${reason}'`) < email.indexOf('mail.send('), reason);
    assert.match(email, /if \(err\.code === 'unreachable'\) return \{ status: 'retry', detail: 'unreachable' \};/);
    assert.match(email, /VALUES \(\$1,\$2,\$3,'email',\$4,NULL,'journey'\)/, 'written onto the contact and the deal as the journey\'s own entry');
  });
  test('a workflow\'s call goes through fonio\'s own checks, not around them', () => {
    const calls = read('utils/fonio-calls.js');
    const fn = calls.slice(calls.indexOf('async function scheduleForJourney('), calls.indexOf('// A call a PERSON asks for (Part 42)'));
    assert.match(fn, /if \(!conn \|\| !conn\.active\) return null;/);
    for (const check of ["skip('no_contact')", 'checkNumber(deal.phone, conn)', "skip('already_scheduled'", 'fonio.nextCallTime(new Date(now), conn)', "trigger: 'journey'"]) assert.ok(fn.includes(check), check);
    assert.doesNotMatch(fn, /on_deal_manual|on_deal_webhook|only_webhooks|only_pipelines|delay_minutes/, 'the tab\'s choices for new deals are not asked: the workflow decided');
  });
});
