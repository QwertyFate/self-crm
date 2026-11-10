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
      duration: '125', summary: 'Termin vereinbart.', transcript: 'Agent: Hallo\nKunde: Hi', numbers: ['+491711234567'] });
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
    assert.equal(fr.resultNote(r), 'fonio-Anruf\n\nfonio hat weder eine Zusammenfassung noch ein Transkript mitgeschickt.');
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
    assert.deepEqual(fr.readResult(null, OWN), { crmCallId: null, conversationId: null, link: null, direction: '', inbound: false, duration: '', summary: '', transcript: '', numbers: [] });
  });
});

describe('resultNote', () => {
  const base = { duration: '', summary: '', transcript: '', link: null };
  test('the call, its length, the summary, the transcript and the link to fonio', () => {
    assert.equal(fr.resultNote({ ...base, duration: '125', summary: 'Termin vereinbart.', transcript: 'Agent: Hallo\nKunde: Hi', link: 'https://app.fonio.ai/c/1' }),
      'fonio-Anruf · Dauer 125\n\nZusammenfassung\nTermin vereinbart.\n\nTranskript\nAgent: Hallo\nKunde: Hi\n\nGespräch in fonio: https://app.fonio.ai/c/1');
  });
  test('fonio sent neither summary nor transcript: the note says so', () => {
    assert.equal(fr.resultNote(base), 'fonio-Anruf\n\nfonio hat weder eine Zusammenfassung noch ein Transkript mitgeschickt.');
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
