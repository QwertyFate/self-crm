// Zero-dependency loader for pure browser-side functions.
//
// The browser files are plain scripts: every helper is a top-level `function`
// declaration and the state it reads lives in file-scope `let`s (not on
// `window`). So we slice the function text out of the real file by name and
// evaluate it inside ONE `new Function` body together with `let` declarations
// for the state it needs. Everything in that body shares a scope, which is why
// `__set(name, value)` can change the state the sliced functions see.
//
//   const F = loadFns('public/js/core.js', ['waLink'], { state: { currentWorkspace: null } });
//   F.__set('currentWorkspace', { whatsapp_template: 'Hallo {{name}}' });
//   F.waLink('+49 151', { name: 'E' });
//
// A renamed or removed function fails loudly ("not found"); a slice that is not
// valid JavaScript fails with a SyntaxError from `new Function`.
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('./load-route');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// Index just past the bracket that closes the one at `openIdx`. Only the
// bracket kinds in `kinds` are counted (strings/regex are not parsed; none of
// the sliced bodies contain an unbalanced bracket inside a literal).
function balancedEnd(src, openIdx, kinds) {
  const close = { '{': '}', '[': ']', '(': ')' };
  const stack = [];
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (kinds.includes(ch)) stack.push(close[ch]);
    else if (Object.values(close).includes(ch) && kinds.includes(Object.keys(close).find(k => close[k] === ch))) {
      if (stack.pop() !== ch) throw new Error(`unbalanced bracket at offset ${i}`);
      if (!stack.length) return i + 1;
    }
  }
  throw new Error('unterminated bracket');
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Source text of `function NAME(...) { ... }` — exactly one such declaration must exist.
// An `async` prefix is kept, so an async function can be evaluated by loadFns.
function sliceFn(src, name, rel) {
  const re = new RegExp(`(^|[^\\w$.])(?:async\\s+)?function\\s+${escapeRe(name)}\\s*\\(`, 'g');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) throw new Error(`function ${name} found ${hits.length} times in ${rel} (expected exactly one)`);
  const start = hits[0].index + hits[0][1].length;
  const paren = src.indexOf('(', start);
  const afterParams = balancedEnd(src, paren, ['(']);   // skip the parameter list: it may hold a destructuring `{ … }`
  const brace = src.indexOf('{', afterParams);
  const end = balancedEnd(src, brace, ['{']);
  return src.slice(start, end);
}

// Source text of a top-level `const NAME = <object|array literal>;`.
function sliceConst(rel, name) {
  const src = read(rel);
  const re = new RegExp(`(^|\\n)const\\s+${escapeRe(name)}\\s*=\\s*`, 'g');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) throw new Error(`const ${name} found ${hits.length} times in ${rel} (expected exactly one)`);
  const start = hits[0].index + hits[0][1].length;
  const open = start + hits[0][0].length - hits[0][1].length;
  if (!'{['.includes(src[open])) throw new Error(`const ${name} in ${rel} is not an object/array literal`);
  const end = balancedEnd(src, open, ['{', '[']);
  return src.slice(start, end) + ';';
}

function loadFns(rel, names, { state = {}, extra = '' } = {}) {
  const src  = read(rel);
  const keys = Object.keys(state);
  const decl = keys.map(k => `let ${k} = ${JSON.stringify(state[k] ?? null)};`).join('\n');
  const setter = `function __set(k, v) { switch (k) { ${keys.map(k => `case ${JSON.stringify(k)}: ${k} = v; break;`).join(' ')} default: throw new Error('unknown state: ' + k); } }`;
  const fns = names.map(n => sliceFn(src, n, rel)).join('\n');
  const body = `${decl}\n${extra}\n${fns}\n${setter}\nreturn { ${[...names, '__set'].join(', ')} };`;
  return new Function(body)();   // eslint-disable-line no-new-func
}

module.exports = { loadFns, sliceConst, sliceFn, read };
