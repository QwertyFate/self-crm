// CLIENT (static + pure-function + sandboxed) tests for the break: the falling-block game in public/js/break-game.js
// with public/break-game.css, shared by the landing page and (next) the app. Part 40 (2026-10-20).
// Pinned: the rules (turn, collide, merge, clear, score, levels, speed, the bag, the shadow, spawn), hold (once per
// piece, park then swap), the high score board (ranking, ties, the cut at ten, who qualifies, names, the store kept in
// this browser), the whole game played in a sandbox with a stub page (hold, the board view pausing, the end, the name,
// the highlighted row, play again, a player saved without asking), and the stylesheet (prefix, tokens only, the scale,
// the dialog without a display value, the layer's [hidden] rule, the pad for fingers, reduced motion last).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('vm');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const js    = read('public/js/break-game.js');
const css   = read('public/break-game.css');
const style = read('public/style.css');
const bare  = css.replace(/\/\*[\s\S]*?\*\//g, '');
const P     = new Function(sliceConst('public/js/break-game.js', 'BRK_PIECES').replace(/^[^{]*/, 'return '))();
const fnBody = name => { const i = js.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const s = js.indexOf('{', i); let d = 0; for (let j = s; j < js.length; j++) { if (js[j] === '{') d++; else if (js[j] === '}' && !--d) return js.slice(s, j + 1); } return ''; };
const R = loadFns('public/js/break-game.js', ['brkEmpty', 'brkRotate', 'brkCollides', 'brkMerge', 'brkClear', 'brkScore', 'brkLevel', 'brkInterval', 'brkBag', 'brkGhost', 'brkSpawn', 'brkHoldSwap', 'brkRank', 'brkQualifies', 'brkCleanName', 'brkLocalStore'], {
  state: { BRK_W: 10, BRK_H: 20, BRK_TYPES: ['I', 'O', 'T', 'S', 'Z', 'J', 'L'], BRK_BOARD_MAX: 10, BRK_NAME_MAX: 16, BRK_PIECES: P },
  extra: 'const localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; })();',
});

// ── a stub page: just enough document for the real script to play in a sandbox ──────────────────────────
function sandbox() {
  const els = {}, store = {}, listeners = {};
  const node = (id, extra) => Object.assign({ id, textContent: '', innerHTML: '', hidden: false, disabled: false, value: '', width: 0, height: 0, clientWidth: 260, clientHeight: 520, offsetWidth: 1, open: false,
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute() {}, focus() { this.focused = true; }, addEventListener(t, f) { (listeners[(id || 'dlg') + ':' + t] ||= []).push(f); },
    querySelector: q => (q === '#brk-name' ? node('brk-name') : null),
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }),
    showModal() { this.open = true; }, close() { this.open = false; (listeners['brk:close'] || []).forEach(f => f()); } }, extra);
  const get = id => (els[id] ||= node(id));
  const ctx = {
    console, Math, Object, Array, String, Number, JSON, Promise, Proxy, Set, Date,
    document: { getElementById: get, createElement: () => (els.brk = node('brk')), body: { appendChild() {} }, documentElement: {}, hidden: false, addEventListener() {} },
    window: { devicePixelRatio: 2, addEventListener() {} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    getComputedStyle: () => ({ getPropertyValue: v => 'c' + v }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  };
  vm.createContext(ctx);
  vm.runInContext(js + '\n;this.__ = { BRK, brkOpen, brkAct, brkSave, brkLock, brkNew, brkEmpty, brkLocalStore, BRK_PIECES };', ctx);
  return { ...ctx.__, els, store };
}
const tick = () => new Promise(r => setImmediate(r));
const words = { brk_over: 'Vorbei. {n} Punkte.', brk_place: 'Platz {n}!', brk_name_default: 'Gast' };
const t = (k, v) => { let s = words[k] || k; for (const [a, b] of Object.entries(v || {})) s = s.split('{' + a + '}').join(String(b)); return s; };

describe('the rules', () => {
  test('turning: clockwise and back, four turns a full circle for every piece', () => {
    assert.deepEqual(R.brkRotate(P.T, 1), [[0, 1, 0], [0, 1, 1], [0, 1, 0]]);
    assert.deepEqual(R.brkRotate(P.T, -1), [[0, 1, 0], [1, 1, 0], [0, 1, 0]]);
    for (const k of Object.keys(P)) { let m = P[k]; for (let n = 0; n < 4; n++) m = R.brkRotate(m, 1); assert.deepEqual(m, P[k], k); assert.deepEqual(R.brkRotate(R.brkRotate(P[k], 1), -1), P[k], k); }
  });
  test('collisions: the sides, the floor, settled blocks; the air above the top is open; merging leaves the old board alone', () => {
    const e = R.brkEmpty(); assert.equal(e.length, 20); assert.ok(e.every(r => r.length === 10 && r.every(v => v === 0)));
    assert.equal(R.brkCollides(e, P.I, -1, 0), true); assert.equal(R.brkCollides(e, P.I, 6, 0), false); assert.equal(R.brkCollides(e, P.I, 7, 0), true);
    assert.equal(R.brkCollides(e, P.I, 0, 18), false); assert.equal(R.brkCollides(e, P.I, 0, 19), true);
    assert.equal(R.brkCollides(e, P.T, 3, -2), false, 'above the top');
    const one = R.brkMerge(e, P.O, 4, 18, 2);
    assert.equal(one[19][5], 2); assert.equal(e[19][5], 0); assert.equal(R.brkCollides(one, P.O, 4, 17), true);
    assert.equal(R.brkGhost(e, P.O, 4, 0), 18); assert.equal(R.brkGhost(one, P.O, 4, 0), 16);
  });
  test('clearing, scoring, levels, speed', () => {
    const full = R.brkEmpty(); full[18] = Array(10).fill(3); full[19] = Array(10).fill(4); full[17][0] = 5;
    const { board, cleared } = R.brkClear(full);
    assert.equal(cleared, 2); assert.equal(board.length, 20); assert.equal(board[19][0], 5);
    assert.deepEqual([0, 1, 2, 3, 4].map(n => R.brkScore(n, 1)), [0, 100, 300, 500, 800]); assert.equal(R.brkScore(4, 3), 2400);
    assert.deepEqual([0, 9, 10, 25].map(R.brkLevel), [1, 1, 2, 3]);
    assert.equal(R.brkInterval(1), 800); assert.equal(R.brkInterval(2), 725); assert.equal(R.brkInterval(30), 90);
  });
  test('the bag: each piece once, the order from the random source; the spawn is centred, the I one row higher', () => {
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const a = R.brkBag(rand), b = R.brkBag(rand);
    for (const bag of [a, b]) assert.deepEqual(bag.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
    assert.notDeepEqual(a, b);
    assert.deepEqual(R.brkSpawn('T'), { type: 'T', m: P.T, x: 3, y: 0 }); assert.deepEqual(R.brkSpawn('O'), { type: 'O', m: P.O, x: 4, y: 0 }); assert.equal(R.brkSpawn('I').y, -1);
  });
  test('hold: the first hold parks the piece and takes the next from the queue; later holds swap', () => {
    assert.deepEqual(R.brkHoldSwap('T', null), { cur: null, held: 'T', fromQueue: true });
    assert.deepEqual(R.brkHoldSwap('S', 'T'), { cur: 'T', held: 'S', fromQueue: false });
  });
});

describe('the high score board', () => {
  test('best first, equal scores keep the earlier one ahead, ten at most, zero never counts', () => {
    const list = [{ name: 'A', score: 500, at: 2 }, { name: 'B', score: 900, at: 3 }, { name: 'C', score: 500, at: 1 }, { name: 'Z', score: 0, at: 4 }];
    assert.deepEqual(R.brkRank(list, null, 10).list.map(e => e.name), ['B', 'C', 'A']);
    const entry = { name: 'D', score: 700, at: 5 };
    const r = R.brkRank(list, entry, 10); assert.equal(r.place, 1); assert.equal(r.list[1], entry);
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: 'P' + i, score: 1000 - i * 10, at: i }));
    assert.equal(R.brkRank(ten, { name: 'low', score: 5, at: 99 }, 10).place, -1, 'out of the ten');
    assert.equal(R.brkRank(ten, { name: 'top', score: 2000, at: 99 }, 10).list.length, 10);
  });
  test('who qualifies; names cleaned and capped at sixteen', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: 'P' + i, score: 1000 - i * 10 }));
    assert.equal(R.brkQualifies([], 1, 10), true); assert.equal(R.brkQualifies([], 0, 10), false);
    assert.equal(R.brkQualifies(ten, 910, 10), false, 'a tie with the last does not push it out'); assert.equal(R.brkQualifies(ten, 911, 10), true);
    assert.equal(R.brkCleanName('  Anna \n  Weiß  '), 'Anna Weiß'); assert.equal(R.brkCleanName('x'.repeat(30)).length, 16); assert.equal(R.brkCleanName(null), '');
  });
  test('the store kept in this browser: saves the ten best under the host\'s key, survives junk', async () => {
    const s = R.brkLocalStore('test_board');
    assert.equal(s.scope, 'browser');
    assert.deepEqual(await s.load(), []);
    await s.save({ name: 'A', score: 300, at: 1 }); const after = await s.save({ name: 'B', score: 800, at: 2 });
    assert.deepEqual(after.map(e => e.name), ['B', 'A']);
    assert.deepEqual((await s.load()).map(e => e.score), [800, 300]);
    for (let i = 0; i < 12; i++) await s.save({ name: 'n' + i, score: 1000 + i, at: 10 + i });
    assert.equal((await s.load()).length, 10);
  });
});

describe('the game, played in a sandbox', () => {
  test('opening: a dialog with the field, hold and next, the stats, pause and the board; a new game starts', async () => {
    const G = sandbox();
    G.brkOpen({ t, store: G.brkLocalStore('b') });
    const d = G.els.brk;
    assert.equal(d.open, true); assert.match(d.innerHTML, /id="brk-canvas" tabindex="0" autofocus/);
    for (const id of ['brk-layer', 'brk-held', 'brk-next', 'brk-score', 'brk-lines', 'brk-level', 'brk-record', 'brk-pop', 'brk-pause', 'brk-board']) assert.match(d.innerHTML, new RegExp(`id="${id}"`), id);
    assert.deepEqual([...d.innerHTML.matchAll(/data-key="([a-z]+)"/g)].map(m => m[1]), ['left', 'rotate', 'right', 'down', 'drop', 'hold']);
    assert.ok(G.BRK.board && G.BRK.piece && G.BRK.next && G.BRK.running);
  });
  test('hold: parks the piece and takes the next; not twice for the same piece; after a landing, it swaps back', () => {
    const G = sandbox(); G.brkOpen({ t, store: G.brkLocalStore('b') });
    const first = G.BRK.piece.type, second = G.BRK.next;
    G.brkAct('hold');
    assert.equal(G.BRK.held, first); assert.equal(G.BRK.piece.type, second); assert.equal(G.BRK.canHold, false);
    G.brkAct('hold'); assert.equal(G.BRK.held, first, 'the same piece cannot be held twice');
    G.brkAct('drop'); assert.equal(G.BRK.canHold, true, 'a landing allows the next hold');
    const now = G.BRK.piece.type; G.brkAct('hold');
    assert.equal(G.BRK.piece.type, first, 'the held piece comes back'); assert.equal(G.BRK.held, now);
  });
  test('the board view pauses the game and blocks the keys; back resumes', () => {
    const G = sandbox(); G.brkOpen({ t, store: G.brkLocalStore('b') });
    G.BRK.view = 'board'; G.BRK.paused = true;
    const before = JSON.stringify(G.BRK.piece); G.brkAct('left'); G.brkAct('drop');
    assert.equal(JSON.stringify(G.BRK.piece), before, 'nothing moves behind the board');
    assert.match(fnBody('brkMount'), /else if \(a === 'board'\) \{ BRK\.paused = true; BRK\.view = 'board';/);
    assert.match(fnBody('brkMount'), /else if \(a === 'back'\) \{ BRK\.view = 'play'; BRK\.paused = false;/);
  });
  test('the end: a good score asks for a name; saving puts it on the board, highlighted; the record follows; play again starts fresh', async () => {
    const G = sandbox(); G.brkOpen({ t, store: G.brkLocalStore('b') }); await tick();
    G.BRK.score = 1234;
    let n = 0; while (!G.BRK.over && n++ < 300) G.brkAct('drop');
    assert.equal(G.BRK.over, true); assert.equal(G.BRK.view, 'over');
    const layer = G.els['brk-layer'];
    assert.equal(layer.hidden, false); assert.match(layer.innerHTML, /Vorbei\. \d+ Punkte\./); assert.match(layer.innerHTML, /<form class="brk-form" data-form="name">/);
    G.brkSave('  Anna  '); await tick(); await tick();
    assert.equal(G.BRK.saved, true); assert.equal(G.BRK.place, 0);
    assert.match(layer.innerHTML, /<li class="brk-row is-me"><span class="brk-rank">1<\/span><span class="brk-name">Anna<\/span>/);
    assert.doesNotMatch(layer.innerHTML, /data-form="name"/, 'saved: the form goes');
    assert.match(layer.innerHTML, /Platz 1!/);
    assert.equal(G.els['brk-record'].textContent, String(G.BRK.score));
    assert.equal(G.store.break_last_name, 'Anna', 'the name is remembered for next time');
    assert.equal(JSON.parse(G.store.b)[0].name, 'Anna');
    G.brkNew(); assert.equal(G.BRK.over, false); assert.equal(G.BRK.score, 0); assert.equal(G.BRK.view, 'play'); assert.equal(G.els['brk-layer'].hidden, true);
  });
  test('a player name saves without asking (the app\'s signed-in user)', async () => {
    const saved = [];
    const G = sandbox(); G.brkOpen({ t, player: 'Jan Krause', store: { scope: 'team', load: () => Promise.resolve([]), save: e => { saved.push(e); return Promise.resolve([{ ...e, mine: true }]); } } });
    await tick(); G.BRK.score = 99;
    let n = 0; while (!G.BRK.over && n++ < 300) G.brkAct('drop');
    await tick(); await tick();
    assert.equal(saved.length, 1); assert.equal(saved[0].name, 'Jan Krause');
    assert.doesNotMatch(G.els['brk-layer'].innerHTML, /data-form="name"/);
    assert.equal(G.BRK.place, 0, 'the server marks the row as mine');
    assert.match(G.els['brk-layer'].innerHTML, /brk_scope_team/);
  });
  test('keys: typing a name is typing; a focused button keeps Space and Enter; C and Shift hold', () => {
    const k = fnBody('brkMount');
    assert.match(k, /if \(e\.target\.closest\('input, textarea'\)\) return;/);
    assert.match(k, /if \(\(e\.key === ' ' \|\| e\.key === 'Enter'\) && e\.target\.closest\('button'\)\) return;/);
    assert.match(js, /c: 'hold', C: 'hold', Shift: 'hold'/);
    assert.match(fnBody('brkLoop'), /const dt = BRK\.last \? Math\.min\(250, now - BRK\.last\) : 0;/);
    assert.equal((js.match(/(?<!function )brkRun\(\)/g) || []).length, 1, 'only the opening starts the loop');
  });
  test('self-contained: no app helper is called; words only through the host\'s translator', () => {
    const outsideMarkup = js.replace(fnBody('brkMarkup'), '{}').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(outsideMarkup, /\b(api|ui)\.\w|(?<![\w.])t\(|\besc\(|TRANSLATIONS|currentLang|fetch\(/, 'no app helper outside the template');
    assert.match(fnBody('brkMarkup'), /const w = k => brkEsc\(brkT\(k\)\);/, 'the template\'s w is the host\'s translator, escaped');
    assert.doesNotMatch(js, /(?<![\w.])tf?\(\s*'brk_/, 'no t(\'brk_…\') call for the app\'s sweep to misread');
    assert.match(fnBody('brkT'), /BRK\.opts\.t\(k, vars\)/);
    assert.doesNotMatch(js, /\.style\.(?!setProperty)|innerHTML \+=/);
  });
});

describe('the stylesheet', () => {
  const rules = [];
  { let i = 0; const src = bare, stack = []; while (i < src.length) { while (i < src.length && /\s/.test(src[i])) i++; if (i >= src.length) break; if (src[i] === '}') { stack.pop(); i++; continue; } const open = src.indexOf('{', i), sel = src.slice(i, open).trim(); if (/^@(media|keyframes)/.test(sel)) { stack.push(sel); i = open + 1; continue; } const close = src.indexOf('}', open); rules.push({ sel, in: stack.join(' > '), decls: src.slice(open + 1, close).split(/;(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]) }); i = close + 1; } }
  test('prefix, tokens only (every one resolves), no hex, no gradient', () => {
    for (const r of rules) if (!r.in.includes('@keyframes')) assert.ok(/^\.brk/.test(r.sel), `scoped: ${r.sel}`);
    const defined = new Set([...style.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    for (const m of bare.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
    assert.doesNotMatch(bare, /#[0-9a-f]{3,8}\b|gradient\(|!important/i);
  });
  test('the dialog has no display (a closed dialog stays hidden); the layer\'s [hidden] wins; the pad only for fingers; reduced motion last', () => {
    assert.ok(!rules.find(r => r.sel === '.brk').decls.some(([p]) => p === 'display'));
    assert.match(bare, /^\.brk-layer\[hidden\] \{ display: none; \}$/m);
    assert.match(bare, /^\.brk-pad \{ display: none;/m);
    assert.match(bare, /@media \(pointer: coarse\) \{\s*\.brk-pad \{ display: grid; \}\s*\.brk-help \{ display: none; \}\s*\}/);
    assert.ok(bare.lastIndexOf('@media (prefers-reduced-motion: reduce)') > bare.lastIndexOf('@media (max-width'));
  });
  test('every class the script writes has a rule, and every rule is used', () => {
    // class attributes read from the source, each value with its own ${…} taken out: class="brk-row${…}" reads as brk-row
    const attrs = [...js.matchAll(/class="([^"]*)"/g)].map(m => m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean));
    const used = new Set(attrs.flat());
    for (const m of js.matchAll(/'(?: )?((?:brk|is)-[a-z0-9-]+)'/g)) used.add(m[1]);
    used.add('brk'); used.add('is-me'); used.add('is-on');
    const ids = new Set([...js.matchAll(/id="([^"$]+)"/g)].map(m => m[1])), inAttr = new Set(attrs.flat());
    for (const id of ids) if (!inAttr.has(id)) used.delete(id);   // an id is not a class, unless it is also written as one
    const inCss = new Set(rules.flatMap(r => [...r.sel.matchAll(/\.((?:brk|is)-[a-z0-9-]+|brk)\b/g)].map(m => m[1])));
    for (const c of used) if (/^(brk|is-)/.test(c)) assert.ok(inCss.has(c), `.${c} has a rule`);
    for (const c of inCss) assert.ok(used.has(c), `.${c} is used`);
  });
  test('spacing on the 4/8 scale', () => {
    const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96, 128]);
    for (const r of rules) for (const [p, v] of r.decls) if (/^(margin|padding|gap)/.test(p)) {
      let flat = v; while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '~');
      for (const tok of flat.split(/\s+/)) { if (/^(0|auto|[\d.]+%|-?[a-z-]+~)$/.test(tok)) continue; const px = tok.match(/^(-?\d+)px$/); assert.ok(px && SCALE.has(Math.abs(+px[1])), `${r.sel}: ${p}: ${v}`); }
    }
  });
});
