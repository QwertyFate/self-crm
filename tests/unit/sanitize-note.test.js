// UNIT test — the simplest kind. sanitizeNote is a pure function: a string
// goes in, a string comes out, no database and no network. Each test follows
// the same three steps: arrange an input, act by calling the function, assert
// on the result.
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { sanitizeNote } = require('../../utils/sanitize-note');

test('strips script, img and event handlers but keeps allowed formatting', () => {
  const input = '<p>Hi <b>bold</b> <a href="https://ok.test">ok</a> <a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)><script>alert(1)</script></p>';
  const out = sanitizeNote(input);
  assert.equal(out, '<p>Hi <b>bold</b> <a href="https://ok.test">ok</a> <a>bad</a></p>');
  assert.doesNotMatch(out, /onerror|<img|<script|javascript:/i);
});

test("the editor's <div> line breaks survive as paragraphs", () => {
  assert.equal(sanitizeNote('<div>line1</div><div>line2</div>'), '<p>line1</p><p>line2</p>');
});

test('lists and inline formatting are kept; a styling <span> is reduced to its text', () => {
  const out = sanitizeNote('<ul><li><i>a</i></li></ul><span style="color:red">red</span><strong>s</strong><em>e</em><br>');
  assert.equal(out, '<ul><li><i>a</i></li></ul>red<strong>s</strong><em>e</em><br />');
});

test('only http, https and mailto links keep their address', () => {
  assert.equal(sanitizeNote('<a href="mailto:a@b.c">m</a>'), '<a href="mailto:a@b.c">m</a>');
  assert.equal(sanitizeNote('<a href="ftp://x">f</a>'), '<a>f</a>');
  assert.equal(sanitizeNote('<a href="//evil.test">p</a>'), '<a>p</a>');   // protocol-relative refused
});

test('a note that is only disallowed markup sanitises to an empty string', () => {
  assert.equal(sanitizeNote('<img src=x onerror=alert(1)>'), '');
  assert.equal(sanitizeNote('<script>alert(1)</script>'), '');
});

test('null and undefined pass straight through (the route decides what to do next)', () => {
  assert.equal(sanitizeNote(null), null);
  assert.equal(sanitizeNote(undefined), undefined);
});
