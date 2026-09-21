// CLIENT (pure, no jsdom) tests for the CSV import helpers in
// public/js/admin-import.js: delimiter sniffing, the quote-aware parser, the
// field-key slug and the header auto-mapper.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns } = require('../helpers/client-fn');

const F = loadFns('public/js/admin-import.js', ['detectDelimiter', 'parseCSV', 'toFieldKey', 'autoMapHeader'], { state: { fields: [] } });
beforeEach(() => F.__set('fields', []));

describe('detectDelimiter', () => {
  test('tab wins only when it beats both others; ; beats , only when strictly more; else ,', () => {
    assert.equal(F.detectDelimiter('a\tb\tc\nx,y'), '\t');
    assert.equal(F.detectDelimiter('a;b;c'), ';');
    assert.equal(F.detectDelimiter('a,b,c'), ',');
    assert.equal(F.detectDelimiter('a;b,c'), ',', 'tie between ; and , falls to ,');
    assert.equal(F.detectDelimiter('a\tb,c;d'), ',', 'three-way tie falls to ,');
    assert.equal(F.detectDelimiter(''), ',');
  });
  test('the first NON-blank line decides', () => {
    assert.equal(F.detectDelimiter('\n   \n a;b \nx,y,z'), ';');
  });
});

describe('parseCSV', () => {
  test('quoted fields keep the delimiter and unescape ""', () => {
    assert.deepEqual(F.parseCSV('a,b\n"x, y","he said ""hi"""'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  });
  test('CRLF rows, blank lines dropped, trailing empty field kept', () => {
    assert.deepEqual(F.parseCSV('\r\na,b\r\n\r\nc,\r\n'), [['a', 'b'], ['c', '']]);
  });
  test('honours the given delimiter', () => {
    assert.deepEqual(F.parseCSV('a;b,c', ';'), [['a', 'b,c']]);
    assert.deepEqual(F.parseCSV('a\tb', '\t'), [['a', 'b']]);
  });
});

describe('toFieldKey', () => {
  test('lower-case, runs of non-alphanumerics -> one _, trimmed at both ends', () => {
    assert.equal(F.toFieldKey('Vor- und Nachname'), 'vor_und_nachname');
    assert.equal(F.toFieldKey('  Firma  '), 'firma');
    assert.equal(F.toFieldKey('Budget 2026'), 'budget_2026');
    assert.equal(F.toFieldKey('Straße'), 'stra_e', 'umlauts/ß are not letters to this slug');
    assert.equal(F.toFieldKey('E-Mail'), 'e_mail');
  });
});

describe('autoMapHeader', () => {
  test('one English and one German alias per built-in column, whitespace collapsed', () => {
    const cases = [['Full Name', 'name'], ['Vor- und Nachname', 'name'], ['  Full   Name ', 'name'],
      ['Email Address', 'email'], ['E-Mail-Adresse', 'email'],
      ['Phone Number', 'phone'], ['Telefonnr', 'phone'], ['Handy', 'phone'],
      ['Company', 'company'], ['Firma', 'company'],
      ['Deal Stage', 'stage'], ['Phase', 'stage'],
      ['Owner', 'assignee'], ['Zuständig', 'assignee']];
    for (const [h, want] of cases) assert.equal(F.autoMapHeader(h), want, h);
  });
  test('a custom field matches by name or by key -> custom:<key>; unknown -> skip', () => {
    F.__set('fields', [{ name: 'Budget', field_key: 'budget', type: 'number' }]);
    assert.equal(F.autoMapHeader('Budget'), 'custom:budget', 'by name');
    assert.equal(F.autoMapHeader('BUDGET'), 'custom:budget', 'by key after slugging');
    assert.equal(F.autoMapHeader('Irgendwas'), 'skip');
    F.__set('fields', []);
    assert.equal(F.autoMapHeader('Budget'), 'skip', 'no custom fields -> skip');
  });
});
