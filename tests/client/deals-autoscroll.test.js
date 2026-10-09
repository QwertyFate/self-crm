// CLIENT (static + sandboxed) tests for Part 45: the deals board scrolls itself while a
// card is dragged near an edge, so a stage column off the right of the screen can be
// reached. Native drag autoscroll of an overflow container is unreliable (Safari never
// does it), so deals.js drives it: a capturing dragover on the document records the
// pointer, a requestAnimationFrame loop scrolls #deals-board sideways and the card list
// under the pointer up/down. Verified statically and in a sandbox — repo rule, no browser.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const deals = read('public/js/deals.js');

describe('deals.js: the drag handlers arm and disarm the autoscroll loop', () => {
  test('dragstart starts it; dragend and drop stop it (drop first, before the stage PATCH)', () => {
    assert.match(sliceFn(deals, 'dealDragStart', 'deals.js'), /dealAutoScrollStart\(\)/);
    assert.match(sliceFn(deals, 'dealDragEnd', 'deals.js'), /dealAutoScrollStop\(\)/);
    const drop = sliceFn(deals, 'dealDrop', 'deals.js');
    assert.ok(drop.indexOf('dealAutoScrollStop()') < drop.indexOf('moveDealToStage'), 'stop before the move');
  });
  test('the pointer comes from a capturing dragover on the document; the board scrolls horizontally, the card list vertically', () => {
    const start = sliceFn(deals, 'dealAutoScrollStart', 'deals.js');
    assert.match(start, /document\.addEventListener\('dragover', dealAutoScrollMove, true\)/);
    assert.match(start, /getElementById\('deals-board'\)/);
    assert.match(start, /board\.scrollLeft \+= dx/);
    assert.match(start, /closest\('\.col-board \.col-cards'\)/);
    assert.match(start, /cards\.scrollTop \+= dy/);
    assert.match(sliceFn(deals, 'dealAutoScrollStop', 'deals.js'), /removeEventListener\('dragover', dealAutoScrollMove, true\)/);
    assert.match(deals, /const DEAL_AUTOSCROLL = \{ edge: 72, max: 24 \};/);
  });
  test('the board is the horizontal scroller the loop moves (CSS: .board overflow auto)', () => {
    assert.match(read('public/style.css'), /\.board \{[^}]*overflow: auto/);
    assert.match(read('public/index.html'), /<div id="deals-board" class="board">/);
  });
});

describe('deals.js: dealEdgeScrollDelta (sandbox)', () => {
  const f = loadFns('public/js/deals.js', ['dealEdgeScrollDelta'], { extra: 'const DEAL_AUTOSCROLL = { edge: 72, max: 24 };' }).dealEdgeScrollDelta;
  test('nothing in the middle, faster towards an edge, full speed at and beyond it', () => {
    assert.equal(f(500, 200, 1000), 0);
    assert.equal(f(1000 - 72, 200, 1000), 0, 'the zone starts just inside edge px');
    assert.equal(f(1000 - 36, 200, 1000), 12, 'half-way in → half speed');
    assert.equal(f(1000, 200, 1000), 24, 'at the edge → full speed');
    assert.equal(f(1400, 200, 1000), 24, 'past the board → still full speed, capped');
    assert.equal(f(200 + 36, 200, 1000), -12);
    assert.equal(f(200, 200, 1000), -24);
    assert.equal(f(100, 200, 1000), -24);
  });
  test('a span narrower than two edge zones never scrolls', () => {
    assert.equal(f(150, 100, 240), 0);
    assert.equal(f(101, 100, 240), 0);
  });
});

describe('deals.js: the frame loop (sandbox with a fake document, rAF and clock)', () => {
  const extra = `
    const DEAL_AUTOSCROLL = { edge: 72, max: 24 };
    let now = 1000; const Date = { now: () => now };
    const frames = []; const requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
    let cancelled = 0; const cancelAnimationFrame = () => { cancelled++; };
    const board = { scrollLeft: 100, getBoundingClientRect: () => ({ left: 200, right: 1000, top: 0, bottom: 600 }) };
    const cards = { scrollTop: 50, getBoundingClientRect: () => ({ left: 220, right: 480, top: 120, bottom: 560 }) };
    let under = null;   // what elementFromPoint finds
    const listeners = {};
    const document = {
      addEventListener: (type, fn, cap) => { listeners[type] = { fn, cap }; }, removeEventListener: type => { delete listeners[type]; },
      getElementById: id => id === 'deals-board' ? board : null, elementFromPoint: () => under };
    function __tick() { const fn = frames.shift(); if (fn) fn(); }
    function __probe() { return { left: board.scrollLeft, top: cards.scrollTop, listeners: Object.keys(listeners), capture: listeners.dragover?.cap, frames: frames.length, cancelled, running: dealAutoScroll !== null }; }
    function __advance(ms) { now += ms; }
    function __under(el) { under = el ? { closest: sel => sel === '.col-board .col-cards' ? cards : null } : null; }`;
  const load = () => loadFns('public/js/deals.js', ['dealEdgeScrollDelta', 'dealAutoScrollMove', 'dealAutoScrollStart', 'dealAutoScrollStop'],
    { state: { dragDealId: 7, dealAutoScroll: null }, extra, expose: ['__tick', '__probe', '__advance', '__under'] });

  test('scrolls the board by the delta for the last pointer position, every frame, while the drag is on', () => {
    const F = load();
    F.dealAutoScrollStart();
    let p = F.__probe(); assert.deepEqual([p.listeners, p.capture, p.frames, p.running], [['dragover'], true, 1, true]);
    F.__tick(); assert.equal(F.__probe().left, 100, 'no pointer seen yet → nothing moves');
    F.dealAutoScrollMove({ clientX: 964, clientY: 300 }); F.__tick();   // 36 px into the right zone → +12
    assert.equal(F.__probe().left, 112);
    F.__tick(); assert.equal(F.__probe().left, 124, 'keeps scrolling while the pointer stays there');
    F.dealAutoScrollMove({ clientX: 1300, clientY: 300 }); F.__tick();  // far past the right edge → +24
    assert.equal(F.__probe().left, 148);
    F.dealAutoScrollMove({ clientX: 150, clientY: 300 }); F.__tick();   // left of the board → -24
    assert.equal(F.__probe().left, 124);
    F.dealAutoScrollMove({ clientX: 600, clientY: 300 }); F.__tick();   // the middle → nothing
    assert.equal(F.__probe().left, 124);
    assert.equal(F.__probe().frames, 1, 'the loop re-arms itself each frame');
    F.dealAutoScrollStart(); assert.equal(F.__probe().frames, 1, 'a second start while running is a no-op');
  });
  test('scrolls the card list under the pointer up or down near its top or bottom edge', () => {
    const F = load();
    F.dealAutoScrollStart(); F.__under(true);
    F.dealAutoScrollMove({ clientX: 300, clientY: 560 }); F.__tick();   // bottom edge of the list → +24
    assert.deepEqual([F.__probe().left, F.__probe().top], [100, 74]);
    F.dealAutoScrollMove({ clientX: 300, clientY: 120 }); F.__tick();   // top edge → -24
    assert.equal(F.__probe().top, 50);
    F.__under(false); F.dealAutoScrollMove({ clientX: 300, clientY: 120 }); F.__tick();
    assert.equal(F.__probe().top, 50, 'nothing under the pointer → the list is left alone');
  });
  test('stops on its own when no dragover arrived for a second, when the drag id is cleared, and on stop()', () => {
    const F = load();
    F.dealAutoScrollStart(); F.dealAutoScrollMove({ clientX: 964, clientY: 300 }); F.__tick();
    F.__advance(1500); F.__tick();   // the pointer left the window (or the card was re-rendered before dragend)
    let p = F.__probe(); assert.deepEqual([p.listeners, p.running, p.frames, p.cancelled], [[], false, 0, 1]);
    F.dealAutoScrollStop(); assert.equal(F.__probe().cancelled, 1, 'stop() on a stopped loop is a no-op');
    F.dealAutoScrollStart(); F.__set('dragDealId', null); F.__tick();   // drop handled, dragDealId cleared
    p = F.__probe(); assert.deepEqual([p.listeners, p.running], [[], false]);
    F.__set('dragDealId', 9); F.dealAutoScrollStart(); F.dealAutoScrollStop();
    p = F.__probe(); assert.deepEqual([p.listeners, p.running, p.cancelled], [[], false, 3]);
  });
});
