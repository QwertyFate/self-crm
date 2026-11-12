// UNIT tests for utils/fonio-result.js (FONIO_CHANGES Part 7, 2026-11-09): what fonio sends after a call, read and
// turned into the note. fonio's Body is written by whoever sets up the HTTP Request in fonio, so the names vary and
// a variable fonio could not fill may arrive as its {{placeholder}}. Pinned: the bytes are read as JSON, and once
// more with raw line breaks inside strings escaped; the aliases and the first filled one; placeholders are empty;
// the contact's number is found by shape, never the workspace's own fonio number; crm_call_id only as a positive
// whole number; a conversation link only as https; inbound calls are told apart; the note's text, its caps and
// its words when fonio sent nothing to write.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fr = require('../../utils/fonio-result');

const OWN = '+4930123456';

describe('parseBody', () => {
  test('JSON bytes become the object', () => {
    assert.deepEqual(fr.parseBody(Buffer.from('{"summary":"Hallo","duration":42}')), { summary: 'Hallo', duration: 42 });
  });
  test('a transcript put into a string with raw line breaks and tabs is still read, the lines kept', () => {
    const raw = '{\n  "summary": "Kurz",\n  "transcript": "Agent: Guten Tag\nKunde: Hallo\tja\r\nAgent: \\"Super\\""\n}';
    assert.throws(() => JSON.parse(raw));
    assert.deepEqual(fr.parseBody(Buffer.from(raw)), { summary: 'Kurz', transcript: 'Agent: Guten Tag\nKunde: Hallo\tja\r\nAgent: "Super"' });
  });
  test('anything that is not a JSON object is null', () => {
    for (const raw of ['', 'summary=Hallo', '[1,2]', '"text"', '{"a": "unclosed', 'null']) assert.equal(fr.parseBody(Buffer.from(raw)), null, raw);
  });
  test('a body another parser already read is taken as it is', () => {
    assert.deepEqual(fr.parseBody({ summary: 'x' }), { summary: 'x' });
    assert.equal(fr.parseBody([1]), null);
  });
});

describe('readResult', () => {
  test('the names this CRM suggests', () => {
    const r = fr.readResult({ crm_call_id: '17', conversation_id: 'conv_1', conversation_link: 'https://app.fonio.ai/c/1', direction: 'outbound',
      duration: '125', summary: ' Termin vereinbart. ', transcript: 'Agent: Hallo\r\nKunde: Hi', person_number: '+49 171 1234567', agent_number: OWN }, OWN);
    assert.deepEqual(r, { crmCallId: 17, conversationId: 'conv_1', link: 'https://app.fonio.ai/c/1', direction: 'outbound', inbound: false,
      duration: '125', summary: 'Termin vereinbart.', transcript: 'Agent: Hallo\nKunde: Hi', numbers: ['+491711234567'], name: '', meeting: null });
  });
  test("fonio's own names and its default Body (the person's number as \"from\")", () => {
    const r = fr.readResult({ conversationId: 'c9', from: '+491711234567', to: OWN, conversationLink: 'https://app.fonio.ai/x', plainTranscript: 'T', summary: 'S' }, OWN);
    assert.equal(r.conversationId, 'c9');
    assert.equal(r.link, 'https://app.fonio.ai/x');
    assert.equal(r.transcript, 'T');
    assert.deepEqual(r.numbers, ['+491711234567']);
  });
  test('the first filled name wins; a {{placeholder}} fonio did not fill is empty', () => {
    const r = fr.readResult({ crm_call_id: '{{crm_call_id}}', crmCallId: '8', conversation_id: '', conversationId: '{{conversationId}}', id: 'c3', summary: '{{summary}}' }, OWN);
    assert.equal(r.crmCallId, 8);
    assert.equal(r.conversationId, 'c3');
    assert.equal(r.summary, '');
  });
  test("the suggested Body's <values>, pasted into fonio without being replaced, are empty too: the note says nothing came", () => {
    const r = fr.readResult({ duration: '<Duration>', summary: '<Summary>', transcript: '<Plain transcript>' }, OWN);
    assert.deepEqual([r.duration, r.summary, r.transcript], ['', '', '']);
    assert.equal(fr.resultNote(r), 'fonio-Anruf\n\n' + fr.NOT_RECORDED);
    assert.equal(fr.readResult({ summary: 'Kunde: <b>ja</b> gerne' }, OWN).summary, 'Kunde: <b>ja</b> gerne');
  });
  test('crm_call_id only as a positive whole number', () => {
    for (const v of ['0', '-3', '1.5', '12abc', 'DROP', '', '12345678901']) assert.equal(fr.readResult({ crm_call_id: v }, OWN).crmCallId, null, v);
    assert.equal(fr.readResult({ crm_call_id: 23 }, OWN).crmCallId, 23);
  });
  test('the link only as https', () => {
    for (const v of ['javascript:alert(1)', 'http://app.fonio.ai/c', 'https://a b', 'ftp://x']) assert.equal(fr.readResult({ conversation_link: v }, OWN).link, null, v);
  });
  test('numbers: every international number in the body but our own, 00 read as +, at most five; text is no number', () => {
    const r = fr.readResult({ a: '0049 171 1234567', b: OWN, c: '030 123456', d: 'Agent: +491709999999 bitte', e: '+43 664 1234567' }, '+49 30 123456');
    assert.deepEqual(r.numbers, ['+491711234567', '+436641234567']);
  });
  test('inbound and incoming calls are told apart; outbound or none is not', () => {
    for (const d of ['inbound', 'INBOUND', 'incoming']) assert.equal(fr.readResult({ direction: d }, OWN).inbound, true, d);
    for (const d of ['outbound', 'OUTGOING', '', '{{direction}}']) assert.equal(fr.readResult({ direction: d }, OWN).inbound, false, d);
  });
  test('nothing usable: all empty, never a throw', () => {
    assert.deepEqual(fr.readResult(null, OWN), { crmCallId: null, conversationId: null, link: null, direction: '', inbound: false, duration: '', summary: '', transcript: '', numbers: [], name: '', meeting: null });
  });
});

describe('resultNote', () => {
  const base = { duration: '', summary: '', transcript: '', link: null };
  test('the call, its length, the summary, the transcript and the link to fonio', () => {
    assert.equal(fr.resultNote({ ...base, duration: '125', summary: 'Termin vereinbart.', transcript: 'Agent: Hallo\nKunde: Hi', link: 'https://app.fonio.ai/c/1' }),
      'fonio-Anruf · Dauer 125\n\nZusammenfassung\nTermin vereinbart.\n\nTranskript\nAgent: Hallo\nKunde: Hi\n\nGespräch in fonio: https://app.fonio.ai/c/1');
  });
  test('fonio sent neither summary nor transcript: the note says so', () => {
    assert.equal(fr.resultNote(base), 'fonio-Anruf\n\n' + fr.NOT_RECORDED);
  });
  test('a long summary and a long transcript are cut and say so', () => {
    const note = fr.resultNote({ ...base, summary: 's'.repeat(fr.MAX_SUMMARY + 5), transcript: 't'.repeat(fr.MAX_TRANSCRIPT + 5) });
    assert.ok(note.includes(`${'s'.repeat(fr.MAX_SUMMARY)}\n… (gekürzt)`));
    assert.ok(note.endsWith(`${'t'.repeat(fr.MAX_TRANSCRIPT)}\n… (Transkript gekürzt)`));
  });
});

describe('fieldNames', () => {
  test("the body's names only, never its values, at most 30", () => {
    const body = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, 'secret']));
    assert.equal(fr.fieldNames(body).length, 30);
    assert.deepEqual(fr.fieldNames({ summary: 'private words' }), ['summary']);
    assert.deepEqual(fr.fieldNames(null), []);
  });
});

// ── Part 28: a meeting agreed in the call ────────────────────────────────────
describe('readMeeting: a meeting the assistant agreed in the call', () => {
  const m = b => fr.readMeeting(b);
  test('yes with a day and a time, as the CRM asks for them', () => {
    assert.deepEqual(m({ meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00' }), { date: '2026-11-20', time: '14:00', email: null, said: '2026-11-20 14:00' });
    assert.deepEqual(fr.readResult({ meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00' }, OWN).meeting, { date: '2026-11-20', time: '14:00', email: null, said: '2026-11-20 14:00' });
  });
  test('as an assistant may write them: German dates, "Uhr", am/pm, a date-time in one field, other names for the fields', () => {
    for (const [date, want] of [['20.11.2026', '2026-11-20'], ['1.2.26', '2026-02-01'], ['20/11/2026', '2026-11-20'], ['2026-11-20T14:30:00+01:00', '2026-11-20'], ['2026-1-5', '2026-01-05']]) assert.equal(fr.readDate(date), want, date);
    for (const bad of ['31.02.2026', '2026-13-01', 'nächsten Donnerstag', '', '20.11.', '1999-01-01']) assert.equal(fr.readDate(bad), null, bad);
    for (const [time, want] of [['14:00', '14:00'], ['9:30', '09:30'], ['14.00', '14:00'], ['14 Uhr', '14:00'], ['14:30 Uhr', '14:30'], ['2:30 pm', '14:30'], ['12 am', '00:00'], ['14:00:00', '14:00'], ['2026-11-20T08:15:00', '08:15'], ['9', '09:00']]) assert.equal(fr.readTime(time), want, time);
    for (const bad of ['nachmittags', '25:00', '14:75', '']) assert.equal(fr.readTime(bad), null, bad);
    assert.deepEqual(m({ termin_gebucht: 'Ja', termin_datum: '20.11.2026', termin_uhrzeit: '14 Uhr' }), { date: '2026-11-20', time: '14:00', email: null, said: '20.11.2026 14 Uhr' });
    assert.deepEqual(m({ meetingBooked: 'true', meetingDate: '2026-11-20T14:30:00', meetingTime: '' }), { date: '2026-11-20', time: '14:30', email: null, said: '2026-11-20T14:30:00' });
  });
  test('no meeting: a plain no (whatever else is filled), nothing filled, or fonio\'s placeholders left as they are', () => {
    for (const no of ['no', 'Nein', 'false', '0', 'none', 'keiner', '-']) assert.equal(m({ meeting_booked: no, meeting_date: '2026-11-20', meeting_time: '14:00' }), null, no);
    assert.equal(m({ summary: 'x' }), null);
    assert.equal(m({ meeting_booked: '{{meeting_booked}}', meeting_date: '{{meeting_date}}', meeting_time: '{{meeting_time}}' }), null);
    assert.equal(m({ meeting_booked: '', meeting_date: '2026-11-20', meeting_time: '' }), null, 'no yes and no whole time: nothing to go on');
  });
  test('no yes/no at all, but a readable day and time: a meeting; yes with a time nobody can read: a meeting without date and time, what was said kept for the note', () => {
    assert.deepEqual(m({ meeting_date: '2026-11-20', meeting_time: '14:00' }), { date: '2026-11-20', time: '14:00', email: null, said: '2026-11-20 14:00' });
    assert.deepEqual(m({ meeting_booked: 'yes', meeting_date: 'nächsten Donnerstag', meeting_time: 'nachmittags' }), { date: null, time: null, email: null, said: 'nächsten Donnerstag nachmittags' });
    assert.deepEqual(m({ meeting_booked: 'yes' }), { date: null, time: null, email: null, said: null });
  });
  test('an email the lead gave in the call rides along, lower-cased; something that is no address does not', () => {
    assert.equal(m({ meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00', meeting_email: ' Erika@Muster.de ' }).email, 'erika@muster.de');
    assert.equal(m({ meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00', meeting_email: 'keine' }).email, null);
  });
});
