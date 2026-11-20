// UNIT tests for utils/journey-vars.js (CUSTOMER_JOURNEY_CHANGES Part 14, 2026-11-19): the variables a workflow
// step's text can use — {{first_name}}, {{name|fallback}}, {{deal.<field>}} — and what they become.
//
// The lists (the page mirrors them), the syntax, every variable's value from the row the engine reads, the
// workspace's own fields, what is asked of the database and what is not, and the sample values of the test email.
// The statements were answered by a real throwaway Postgres as well (see the change log).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const vars = require('../../utils/journey-vars');

// a pool that answers by the statement's text and writes down what it was asked
function fakePool({ meeting = [], deal = [], contact = [] } = {}) {
  const asked = [];
  return { asked, query: async (sql, params) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    asked.push({ sql: t, params });
    if (/FROM activities a/.test(t)) return { rows: meeting };
    if (/FROM deal_fields/.test(t)) return { rows: deal.filter(f => params[1].includes(f.field_key.toLowerCase())) };
    if (/FROM custom_fields/.test(t)) return { rows: contact.filter(f => params[1].includes(f.field_key.toLowerCase())) };
    throw new Error('unexpected statement: ' + t);
  } };
}
const NOW = new Date('2026-11-19T10:00:00Z');
const ROW = { workspace_id: 7, deal_id: 60, contact_id: 40, contact_name: '  Erika  Maria Musterfrau ', contact_email: ' erika@example.de ', contact_phone: '+49 151 1234567', contact_company: 'Müller & Söhne',
  deal_title: 'Wohnung <3>', deal_value: '250000.00', stage_name: 'Erstgespräch', pipeline_name: 'Vertrieb', owner_name: 'Max von Berater', owner_email: 'max@firma.de', workspace_name: 'Firma GmbH',
  deal_data: { finanzierung: 'Ja', Zimmer: 3, ausstattung: ['Balkon', 'Keller', ''], moebliert: false, leer: '', nichts: null, ding: { a: 1 } }, contact_data: { kundenstatus: 'Interessent', newsletter: true } };
const DEAL_FIELDS = [{ field_key: 'finanzierung', name: 'Finanzierung' }, { field_key: 'Zimmer', name: 'Zimmer' }, { field_key: 'ausstattung', name: 'Ausstattung' }, { field_key: 'moebliert', name: 'Möbliert' },
  { field_key: 'leer', name: 'Leer' }, { field_key: 'nichts', name: 'Nichts' }, { field_key: 'ding', name: 'Ding' }, { field_key: 'unbesetzt', name: 'Unbesetzt' }, { field_key: 'constructor', name: 'Bauart' }];
const CONTACT_FIELDS = [{ field_key: 'kundenstatus', name: 'Kundenstatus' }, { field_key: 'newsletter', name: 'Newsletter' }];
const V = vars.rowValues(ROW, NOW);

describe('the lists the page mirrors', () => {
  test('the variables in their groups, the German names, and the two prefixes of the workspace\'s own fields', () => {
    assert.deepEqual(vars.GROUPS, { contact: ['name', 'first_name', 'last_name', 'email', 'phone', 'company'], deal: ['deal', 'deal_value', 'stage', 'pipeline'],
      owner: ['owner', 'owner_first_name', 'owner_email'], now: ['date', 'time', 'date_time', 'weekday', 'month', 'year'], other: ['workspace', 'today', 'meeting_date', 'meeting_time', 'unsubscribe'] });
    assert.deepEqual(vars.ALIASES, { vorname: 'first_name', nachname: 'last_name', telefon: 'phone', firma: 'company', wert: 'deal_value', phase: 'stage', betreuer: 'owner', betreuer_vorname: 'owner_first_name',
      betreuer_email: 'owner_email', heute: 'today', termin_datum: 'meeting_date', termin_uhrzeit: 'meeting_time', abmelden: 'unsubscribe', unsubscribe_url: 'unsubscribe', datum: 'date', uhrzeit: 'time', datum_uhrzeit: 'date_time', wochentag: 'weekday', monat: 'month', jahr: 'year' });
    assert.deepEqual(vars.FIELD_PREFIXES, { 'deal.': 'deal', 'contact.': 'contact', 'kontakt.': 'contact' });
    assert.equal(vars.ZONE, 'Europe/Berlin');
  });
  test('every name once; a German name stands for a variable there is, and is never one itself', () => {
    assert.deepEqual(vars.NAMES, Object.values(vars.GROUPS).flat());
    assert.equal(new Set(vars.NAMES).size, vars.NAMES.length);
    for (const [de, en] of Object.entries(vars.ALIASES)) { assert.ok(vars.NAMES.includes(en), de); assert.ok(!vars.NAMES.includes(de), de); }
    assert.deepEqual(Object.keys(vars.rowValues({}, NOW)), vars.NAMES, 'every variable has a value, also when nothing is known');
    assert.deepEqual(Object.keys(vars.sampleValues(NOW)), vars.NAMES, 'and a sample');
  });
});

describe('the syntax', () => {
  test('a name in two braces is its value; spaces inside and capitals do not matter; German names are the same values', () => {
    assert.equal(vars.fill('Hallo {{first_name}}, {{ Vorname }}, {{NAME}} von {{firma}} / {{Company}}', V, false), 'Hallo Erika, Erika, Erika  Maria Musterfrau von Müller & Söhne / Müller & Söhne');
    for (const [de, en] of Object.entries(vars.ALIASES)) assert.equal(vars.fill(`{{${de}}}`, V, false), vars.fill(`{{${en}}}`, V, false), de);
    assert.equal(vars.keyOf('  Betreuer_Vorname '), 'owner_first_name');
  });
  test('{{name|text}}: the value, or the text when there is none', () => {
    const none = vars.rowValues({}, NOW);
    assert.equal(vars.fill('Hallo {{first_name|zusammen}}!', none, false), 'Hallo zusammen!');
    assert.equal(vars.fill('Hallo {{first_name|zusammen}}!', V, false), 'Hallo Erika!', 'a value there is wins');
    assert.equal(vars.fill('Hallo {{ first_name |  liebe Kundin  }}!', none, false), 'Hallo liebe Kundin!', 'outer spaces go, inner ones stay');
    assert.equal(vars.fill('[{{first_name|}}] [{{first_name}}] [{{vorname| }}]', none, false), '[] [] []', 'no text: nothing');
    assert.equal(vars.fill('{{company|a|b}}', none, false), 'a|b', 'the first bar parts the name from the text');
    assert.equal(vars.fill('{{first_name|x}}', { ...none, first_name: '   ' }, false), 'x', 'spaces are no value');
    assert.equal(vars.fill('{{deal_value|auf Anfrage}} / {{owner|das Team}}', none, false), 'auf Anfrage / das Team');
  });
  test('a name nobody knows stays exactly as typed, with or without a text behind the bar', () => {
    assert.equal(vars.fill('Hi {{frist_name}} {{}} {{ }} {name} {{frist_name|x}} {{deal.}} {{contact.}} {{|x}}', V, false), 'Hi {{frist_name}} {{}} {{ }} {name} {{frist_name|x}} {{deal.}} {{contact.}} {{|x}}');
    assert.equal(vars.fill('{{deal.finanzierung}} {{kontakt.x}}', V, false), '{{deal.finanzierung}} {{kontakt.x}}', 'a field is known only when the workspace has it');
  });
  test('only the values themselves count, nothing an object carries besides', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) assert.equal(vars.fill(`{{${name}}}`, V, false), `{{${name}}}`, name);
    assert.equal(vars.fill('{{first_name}}', Object.create({ first_name: 'geerbt' }), false), '{{first_name}}', 'not what is inherited');
    for (const odd of [null, undefined, 'x', 7]) assert.equal(vars.fill('{{first_name}}', odd, false), '{{first_name}}');
    assert.equal(vars.fill(null, V, false), ''); assert.equal(vars.fill(undefined, V, true), '');
  });
  test('in HTML a value and a fallback are text: neither can become markup, nor leave an attribute', () => {
    assert.equal(vars.fill('<p>{{company}} / {{deal}}</p>', V, true), '<p>Müller &amp; Söhne / Wohnung &lt;3&gt;</p>');
    const evil = vars.rowValues({ contact_name: '<script>alert(1)</script> X', contact_company: '" onmouseover="x', deal_title: "' onclick='y" }, NOW);
    assert.equal(vars.fill('<b>{{name}}</b>', evil, true), '<b>&lt;script&gt;alert(1)&lt;/script&gt; X</b>');
    assert.equal(vars.fill('<a title="{{company}}" alt=\'{{deal}}\'>', evil, true), '<a title="&quot; onmouseover=&quot;x" alt=\'&#39; onclick=&#39;y\'>');
    assert.equal(vars.fill('<p>{{first_name|<b>du</b> & "sie"}}</p>', vars.rowValues({}, NOW), true), '<p>&lt;b&gt;du&lt;/b&gt; &amp; &quot;sie&quot;</p>');
    assert.equal(vars.fill('{{company}} {{first_name|<b>}}', { ...vars.rowValues({}, NOW), company: 'A & B' }, false), 'A & B <b>', 'plain text is left as it is');
  });
  test('the names a text uses are read the way they are filled', () => {
    assert.deepEqual([...vars.usedIn(['Hallo {{ Vorname | du }}, {{deal.Finanzierung}} {{kontakt.Kundenstatus|–}} {{}} {{x}}', '{{TERMIN_DATUM}}', null])].sort(),
      ['contact.kundenstatus', 'deal.finanzierung', 'first_name', 'meeting_date', 'x']);
    assert.deepEqual([...vars.usedIn('{{unsubscribe|x}}')], ['unsubscribe']);
    assert.deepEqual([...vars.usedIn(undefined)], []);
  });
});

describe('every variable\'s value', () => {
  test('the contact: its name, the first word of it, the rest of it, address, phone, company', () => {
    assert.deepEqual([V.name, V.first_name, V.last_name, V.email, V.phone, V.company], ['Erika  Maria Musterfrau', 'Erika', 'Maria Musterfrau', 'erika@example.de', '+49 151 1234567', 'Müller & Söhne']);
    assert.deepEqual([vars.rowValues({ contact_name: 'Cher' }, NOW).first_name, vars.rowValues({ contact_name: 'Cher' }, NOW).last_name], ['Cher', ''], 'one word: no last name');
  });
  test('the deal: its title, its value with German grouping and no currency sign, its stage and pipeline by name', () => {
    assert.deepEqual([V.deal, V.deal_value, V.stage, V.pipeline], ['Wohnung <3>', '250.000', 'Erstgespräch', 'Vertrieb']);
    for (const [given, said] of [['250000', '250.000'], [250000, '250.000'], ['1250.5', '1.250,50'], ['1250.50', '1.250,50'], ['1234567.891', '1.234.567,89'], [999, '999'], [1000, '1.000'], [0, '0'], ['0.00', '0'],
      ['-1500', '-1.500'], [null, ''], [undefined, ''], ['', ''], ['  ', ''], ['abc', ''], [Infinity, ''], ['1e30', '']]) assert.equal(vars.valueText(given), said, JSON.stringify(given));
  });
  test('the person the deal is assigned to — nobody: nothing', () => {
    assert.deepEqual([V.owner, V.owner_first_name, V.owner_email], ['Max von Berater', 'Max', 'max@firma.de']);
    const none = vars.rowValues({ ...ROW, owner_name: null, owner_email: null }, NOW);
    assert.deepEqual([none.owner, none.owner_first_name, none.owner_email], ['', '', '']);
  });
  test('the workspace, and today as dd.mm.yyyy on Berlin\'s clock; the link is empty here — an email puts its own in', () => {
    assert.deepEqual([V.workspace, V.unsubscribe, V.today], ['Firma GmbH', '', '19.11.2026']);
    assert.equal(vars.rowValues(ROW, new Date('2026-11-19T23:30:00Z')).today, '20.11.2026', 'half past midnight in Berlin is the next day');
    assert.equal(vars.rowValues(ROW, new Date('2026-06-30T21:59:00Z')).today, '30.06.2026'); assert.equal(vars.rowValues(ROW, new Date('2026-06-30T22:00:00Z')).today, '01.07.2026', 'summer time');
    assert.equal(vars.fill('[{{unsubscribe}}] [{{abmelden|kein Link}}]', V, false), '[] [kein Link]', 'known, and empty: a task has no link');
  });
  test('nothing known: every value is empty, none is "undefined" or "null"', () => {
    const none = vars.rowValues(undefined, NOW);
    for (const name of vars.NAMES.filter(n => n !== 'today' && !vars.GROUPS.now.includes(n))) assert.equal(none[name], '', name);   // the day and the time are known for everyone
    assert.equal(vars.fill('Hallo {{first_name}}{{last_name}}{{owner}}{{deal_value}}!', vars.rowValues(null, NOW), false), 'Hallo !');
  });
  test('a field\'s value as text: a list joined, yes and no in words, a number as written, nothing as nothing', () => {
    for (const [given, said] of [['  Ja ', 'Ja'], [3, '3'], [0, '0'], [true, 'ja'], [false, 'nein'], [null, ''], [undefined, ''], [['Balkon', 'Keller', '', null], 'Balkon, Keller'], [[], ''], [[true, 2], 'ja, 2'], [{ a: 1 }, '']]) {
      assert.equal(vars.fieldText(given), said, JSON.stringify(given));
    }
  });
});

describe('the next meeting', () => {
  test('asked only when a text names it: the earliest that is not cancelled and lies today or later, for the deal or its contact', async () => {
    const pool = fakePool({ meeting: [{ day: '24.11.2026', time: '14:30' }] });
    const v = await vars.valuesFor(pool, ROW, ['Am {{meeting_date}} um {{termin_uhrzeit}}'], NOW);
    assert.deepEqual([v.meeting_date, v.meeting_time], ['24.11.2026', '14:30']);
    assert.equal(pool.asked.length, 1);
    assert.equal(pool.asked[0].sql, "SELECT to_char(a.event_date, 'DD.MM.YYYY') AS day, to_char(a.event_time, 'HH24:MI') AS time FROM activities a WHERE a.workspace_id = $1 AND a.type = 'meeting' AND a.cancelled_at IS NULL "
      + 'AND a.event_date IS NOT NULL AND a.event_date >= $4::date AND (a.deal_id = $2 OR (a.deal_id IS NULL AND a.contact_id = $3)) ORDER BY a.event_date, a.event_time NULLS LAST, a.id LIMIT 1');
    assert.deepEqual(pool.asked[0].params, [7, 60, 40, '2026-11-19']);
  });
  test('none: both are empty, and a fallback says so; a deal without a contact asks for no contact; "today" is Berlin\'s day', async () => {
    const none = fakePool();
    const v = await vars.valuesFor(none, { ...ROW, contact_id: undefined }, ['{{meeting_date|noch offen}}'], new Date('2026-11-19T23:30:00Z'));
    assert.deepEqual([v.meeting_date, v.meeting_time], ['', '']);
    assert.equal(vars.fill('Termin: {{meeting_date|noch offen}}', v, false), 'Termin: noch offen');
    assert.deepEqual(none.asked[0].params, [7, 60, null, '2026-11-20']);
    assert.deepEqual(await vars.nextMeeting(fakePool({ meeting: [{ day: '01.12.2026', time: null }] }), ROW, NOW), { meeting_date: '01.12.2026', meeting_time: '' }, 'a meeting without a time has a day');
  });
});

describe('the workspace\'s own fields', () => {
  const pool = () => fakePool({ deal: DEAL_FIELDS, contact: CONTACT_FIELDS });
  test('{{deal.<key>}} and {{contact.<key>}} — also {{kontakt.<key>}} — are the values of the deal and of its contact', async () => {
    const db = pool(), text = '{{deal.finanzierung}} | {{deal.zimmer}} | {{deal.ausstattung}} | {{deal.moebliert}} | {{contact.kundenstatus}} | {{kontakt.newsletter}}';
    const v = await vars.valuesFor(db, ROW, [text], NOW);
    assert.equal(vars.fill(text, v, false), 'Ja | 3 | Balkon, Keller | nein | Interessent | ja');
    assert.equal(vars.fill('{{ Deal.Finanzierung }} {{KONTAKT.Kundenstatus}}', v, false), 'Ja Interessent', 'capitals do not matter, in the prefix or in the key');
  });
  test('the key goes to the database as a value, in small letters, with the workspace — one question for the deal\'s fields, one for the contact\'s', async () => {
    const db = pool();
    await vars.valuesFor(db, ROW, ["{{deal.Finanzierung}} {{deal.x'; DROP TABLE deals; --}} {{contact.kundenstatus}}"], NOW);
    assert.deepEqual(db.asked, [
      { sql: 'SELECT field_key, name FROM deal_fields WHERE workspace_id = $1 AND LOWER(field_key) = ANY($2::text[])', params: [7, ['finanzierung', "x'; drop table deals; --"]] },
      { sql: 'SELECT field_key, name FROM custom_fields WHERE workspace_id = $1 AND LOWER(field_key) = ANY($2::text[])', params: [7, ['kundenstatus']] },
    ]);
  });
  test('a field without a value is empty and takes the fallback; a key that is no field of the workspace stays as typed', async () => {
    const text = '[{{deal.leer}}] [{{deal.nichts|–}}] [{{deal.unbesetzt|offen}}] [{{deal.ding}}] [{{deal.gibtsnicht}}] [{{deal.gibtsnicht|x}}] [{{contact.finanzierung}}]';
    const v = await vars.valuesFor(pool(), ROW, [text], NOW);
    assert.equal(vars.fill(text, v, false), '[] [–] [offen] [] [{{deal.gibtsnicht}}] [{{deal.gibtsnicht|x}}] [{{contact.finanzierung}}]', 'a deal\'s field is no contact\'s field');
  });
  test('a field is read by the key the workspace wrote, among the row\'s own keys only', async () => {
    const v = await vars.valuesFor(pool(), ROW, ['{{deal.zimmer}} {{deal.constructor}}'], NOW);
    assert.equal(v['deal.zimmer'], '3', 'the workspace wrote "Zimmer"');
    assert.equal(v['deal.constructor'], '', 'a field called "constructor" that holds nothing is empty, not what an object carries');
    const hostile = await vars.valuesFor(pool(), ROW, ['{{deal.__proto__}} {{deal.hasOwnProperty}} {{contact.toString}}'], NOW);
    assert.equal(vars.fill('{{deal.__proto__}} {{deal.hasOwnProperty}} {{contact.toString}}', hostile, false), '{{deal.__proto__}} {{deal.hasOwnProperty}} {{contact.toString}}');
    for (const deal_data of [null, undefined, 'x', 7, ['finanzierung']]) assert.equal((await vars.valuesFor(pool(), { ...ROW, deal_data }, ['{{deal.finanzierung}}'], NOW))['deal.finanzierung'], '', String(deal_data));
  });
  test('in an HTML email a field\'s value is text like every other', async () => {
    const v = await vars.valuesFor(pool(), { ...ROW, deal_data: { finanzierung: '<img src=x onerror=alert(1)>' } }, ['{{deal.finanzierung}}'], NOW);
    assert.equal(vars.fill('<p>{{deal.finanzierung}}</p>', v, true), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
});

describe('what is asked of the database', () => {
  test('nothing, when the texts use only what the row says', async () => {
    const db = fakePool();
    const v = await vars.valuesFor(db, ROW, ['Hallo {{first_name|du}}, {{deal}} {{wert}} {{phase}} {{pipeline}} {{betreuer}} {{owner_email}} {{workspace}} {{heute}} {{abmelden}} {{unbekannt}}', '{{name}}'], NOW);
    assert.equal(db.asked.length, 0);
    assert.deepEqual(v, vars.rowValues(ROW, NOW));
  });
  test('the meeting only for a text that names it, a field list only for a prefix that is used', async () => {
    const onlyDeal = fakePool({ deal: DEAL_FIELDS });
    await vars.valuesFor(onlyDeal, ROW, ['{{deal.finanzierung}}'], NOW);
    assert.deepEqual(onlyDeal.asked.map(c => c.sql.match(/FROM (\w+)/)[1]), ['deal_fields']);
    const onlyContact = fakePool({ contact: CONTACT_FIELDS });
    await vars.valuesFor(onlyContact, ROW, ['{{kontakt.kundenstatus}}'], NOW);
    assert.deepEqual(onlyContact.asked.map(c => c.sql.match(/FROM (\w+)/)[1]), ['custom_fields']);
    const all = fakePool({ deal: DEAL_FIELDS, contact: CONTACT_FIELDS });
    await vars.valuesFor(all, ROW, ['{{termin_datum}} {{deal.finanzierung}}', '{{contact.kundenstatus}}'], NOW);
    assert.deepEqual(all.asked.map(c => c.sql.match(/FROM (\w+)/)[1]), ['activities', 'deal_fields', 'custom_fields']);
    const empty = fakePool();
    await vars.valuesFor(empty, ROW, ['', null, undefined, 'no braces at all', '{{deal.}} {{contact.}} {{kontakt.}} {{ deal. |x}}'], NOW);
    assert.equal(empty.asked.length, 0, 'a prefix with no key behind it names no field');
  });
});

// Part 18: the moment a step happens, on the clock of whoever saved the step.
describe('the day and the time', () => {
  const late = new Date('2026-12-31T23:30:00Z');   // New Year's Eve, half past eleven at night in London
  test('the day, the time, both, the weekday, the month and the year — on a zone\'s clock', () => {
    assert.deepEqual(vars.clockValues(late, 'Europe/Berlin'), { date: '01.01.2027', time: '00:30', date_time: '01.01.2027, 00:30', weekday: 'Freitag', month: 'Januar', year: '2027', today: '01.01.2027' });
    assert.deepEqual(vars.clockValues(late, 'America/New_York'), { date: '31.12.2026', time: '18:30', date_time: '31.12.2026, 18:30', weekday: 'Donnerstag', month: 'Dezember', year: '2026', today: '31.12.2026' });
    assert.deepEqual(vars.clockValues(late, 'Asia/Manila').date_time, '01.01.2027, 07:30');
    assert.equal(vars.clockValues(new Date('2026-07-01T07:05:00Z'), 'Europe/Berlin').time, '09:05', 'summer time, and two digits for the hour');
    for (const none of [null, undefined, '', 'Nowhere/None', 7]) assert.deepEqual(vars.clockValues(late, none), vars.clockValues(late, 'Europe/Berlin'), `a zone that is none (${none}) is Berlin`);
  });
  test('a step goes by the zone it was saved with; one saved before, by Berlin', () => {
    const at = (tz, text) => vars.fill(text, vars.rowValues({ ...ROW, config: tz === undefined ? {} : { tz } }, late), false);
    assert.equal(at('America/New_York', '© {{year}} · {{date}}, {{time}} Uhr · {{weekday}}, {{month}} · {{date_time}} · {{today}}'), '© 2026 · 31.12.2026, 18:30 Uhr · Donnerstag, Dezember · 31.12.2026, 18:30 · 31.12.2026');
    assert.equal(at('Asia/Manila', '{{jahr}} {{datum}} {{uhrzeit}} {{wochentag}} {{monat}} {{datum_uhrzeit}} {{heute}}'), '2027 01.01.2027 07:30 Freitag Januar 01.01.2027, 07:30 01.01.2027', 'the German names');
    assert.equal(at(undefined, '{{date_time}}'), '01.01.2027, 00:30');
    assert.equal(vars.fill('{{date}}', vars.rowValues({ ...ROW, config: null }, late), false), '01.01.2027');
    assert.equal(vars.fill('{{ Year }}|{{TIME}}', vars.rowValues({ config: { tz: 'UTC' } }, late), false), '2026|23:30');
    assert.equal(vars.fill('<b>{{weekday}}</b>', vars.rowValues({ config: { tz: 'UTC' } }, late), true), '<b>Donnerstag</b>');
  });
  test('the test email says the real day and time, on the clock of who asks for it', () => {
    assert.deepEqual([vars.sampleValues(late).date_time, vars.sampleValues(late, 'America/New_York').date_time, vars.sampleValues(late, 'America/New_York').year], ['01.01.2027, 00:30', '31.12.2026, 18:30', '2026']);
    assert.deepEqual(vars.KINDS, ['email', 'whatsapp', 'sms', 'task'], 'the kinds of step whose texts are filled: those keep a zone');
  });
});

describe('sample values', () => {
  test('what the test email says, and what the page\'s preview mirrors', () => {
    assert.deepEqual(vars.sampleValues(NOW), { name: 'Erika Musterfrau', first_name: 'Erika', last_name: 'Musterfrau', email: 'erika@example.de', phone: '+49 151 23456789', company: 'Muster GmbH',
      deal: 'Beispiel-Deal', deal_value: '250.000', stage: 'Erstgespräch', pipeline: 'Vertrieb', owner: 'Max Berater', owner_first_name: 'Max', owner_email: 'max@example.de',
      workspace: 'Muster Immobilien', today: '19.11.2026', meeting_date: '26.11.2026', meeting_time: '10:00', unsubscribe: '',
      date: '19.11.2026', time: '11:00', date_time: '19.11.2026, 11:00', weekday: 'Donnerstag', month: 'November', year: '2026' });
    assert.deepEqual([vars.sampleValues(new Date('2026-12-28T12:00:00Z')).today, vars.sampleValues(new Date('2026-12-28T12:00:00Z')).meeting_date], ['28.12.2026', '04.01.2027'], 'the meeting is a week on, also across a year');
    assert.deepEqual([vars.sampleValues(new Date('2026-03-27T12:00:00Z')).meeting_date, vars.sampleValues(new Date('2026-10-23T22:30:00Z')).meeting_date], ['03.04.2026', '31.10.2026'], 'and across both changes of the clock');
  });
  test('for a step of a workspace: a field says its own name in brackets; a key that is no field stays as typed', async () => {
    const db = fakePool({ deal: DEAL_FIELDS, contact: CONTACT_FIELDS });
    const text = '{{first_name}} {{deal.Finanzierung}} {{kontakt.kundenstatus}} {{deal.gibtsnicht}} {{unsubscribe}}';
    const v = await vars.sampleFor(db, 7, [text], NOW);
    assert.equal(vars.fill(text, v, false), 'Erika [Finanzierung] [Kundenstatus] {{deal.gibtsnicht}} ');
    assert.deepEqual(db.asked.map(c => c.params), [[7, ['finanzierung', 'gibtsnicht']], [7, ['kundenstatus']]]);
    const none = fakePool();
    assert.deepEqual(await vars.sampleFor(none, 7, ['Hallo {{first_name}}'], NOW), vars.sampleValues(NOW));
    assert.equal(none.asked.length, 0, 'no field named: nothing asked');
    assert.equal((await vars.sampleFor(fakePool({ deal: [{ field_key: 'ohne', name: '' }] }), 7, ['{{deal.ohne}}'], NOW))['deal.ohne'], '[ohne]', 'a field without a name says its key');
  });
});

describe('how it is built', () => {
  const code = read('utils/journey-vars.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens nothing itself: the pool is handed in, and the only file it needs is the one that reads a zone\'s clock', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['./calcom']);
    assert.doesNotMatch(code, /require\('\.\.\/db'\)|require\('\.\/db'\)/);
  });
  test('nothing typed by a person is put into a statement: three statements of fixed text, each with the workspace', () => {
    assert.equal((code.match(/pool\.query\(/g) || []).length, 2, 'the meeting, and the field lists through one call');
    const statements = code.split('SELECT ').slice(1).map(part => part.slice(0, part.search(/LIMIT 1`|\[\]\)'/) + 8));   // each up to its own end
    assert.equal(statements.length, 3, 'the next meeting, a deal\'s fields, a contact\'s fields');
    for (const s of statements) { assert.doesNotMatch(s, /\$\{/, s.slice(0, 60)); assert.match(s, /workspace_id = \$1/, s.slice(0, 60)); }
    assert.match(code, /const \{ rows \} = await pool\.query\(FIELD_LISTS\[of\], \[workspaceId, wanted\]\);/);
    assert.match(code, /for \(const of of Object\.keys\(FIELD_LISTS\)\)/, 'which list is asked is chosen among the two fixed ones');
  });
  test('a value is taken from the row\'s own keys, and a name is looked up among the values\' own keys', () => {
    assert.match(code, /values\[f\.key\] = fieldText\(Object\.hasOwn\(own, f\.field_key\) \? own\[f\.field_key\] : null\);/);
    assert.match(code, /if \(key === null \|\| !Object\.hasOwn\(known, key\)\) return whole;/);
    assert.match(code, /if \(Object\.hasOwn\(ALIASES, name\)\) return ALIASES\[name\];/);
  });
});
