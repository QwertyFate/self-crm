// CLIENT (static) test: public/style.css parses — balanced comments, balanced
// braces, no comment closed early by its own text.
//
// WHAT THIS CAUGHT. A banner comment listed old class names separated by
// slashes: ".contact-card/.card-*/". CSS comments cannot contain "*/", so the
// comment CLOSED at ".card-*/", mid-sentence. The rest of the banner became
// garbage tokens the parser read as a selector, and the first real rule after
// it — #deals-board.board { flex: 1 1 auto; min-height: 0; } — was swallowed
// into that invalid rule and silently dropped. VS Code showed the file in red;
// the browser just lost a rule. Nothing else in the suite looks at the
// stylesheet as a whole, so this is the guard.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');

// A small tokenizer that knows about comments and strings — enough to find the
// faults a real CSS parser would choke on, without pulling in a CSS library.
function scan(src) {
  const lines = src.split('\n'), problems = [];
  let inC = false, inS = null, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    for (let j = 0; j < L.length; j++) {
      const ch = L[j], nx = L[j + 1];
      if (inC) {
        if (ch === '*' && nx === '/') { inC = false; j++; }
        else if (ch === '/' && nx === '*') problems.push(`line ${i + 1}: "/*" inside a comment (comments do not nest)`);
        continue;
      }
      if (inS) { if (ch === '\\') { j++; continue; } if (ch === inS) inS = null; continue; }
      if (ch === '/' && nx === '*') { inC = true; j++; continue; }
      if (ch === '*' && nx === '/') { problems.push(`line ${i + 1}: stray "*/" outside any comment — a comment above it was closed early by its own text`); j++; continue; }
      if (ch === '"' || ch === "'") { inS = ch; continue; }
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth < 0) { problems.push(`line ${i + 1}: "}" with nothing open`); depth = 0; } }
    }
  }
  if (inC) problems.push('file ends inside an unclosed comment');
  if (inS) problems.push('file ends inside an unclosed string');
  if (depth !== 0) problems.push(`${depth} "{" never closed`);
  return problems;
}

describe('public/style.css is syntactically sound', () => {
  const css = read('public/style.css');

  test('no comment is closed early by its own text, no stray "*/", comments and braces balance', () => {
    const problems = scan(css);
    assert.deepEqual(problems, [], problems.join('\n'));
  });

  test('the rule that was being swallowed is present and still reachable as a rule of its own', () => {
    // It must begin a line (nothing dangling in front of it from a broken comment).
    assert.match(css, /^#deals-board\.board \{ flex: 1 1 auto; min-height: 0; \}/m);
  });

  test('the scanner itself catches the fault it was written for', () => {
    assert.deepEqual(scan('/* a */ .x { color: red; }'), []);
    assert.match(scan('/* list: .a/.b-*/ more text */ .x { color: red; }').join(' '), /stray "\*\/"/);
    assert.match(scan('/* open').join(' '), /unclosed comment/);
    assert.match(scan('.x { color: red; } }').join(' '), /nothing open/);
    assert.deepEqual(scan('.x { content: "*/"; }'), [], 'a "*/" inside a string is not a comment close');
  });
});
