// CLIENT (static) tests for the Board (Miro embed) page: the reference's
// empty state (hero + numbered steps) ported since the underlying feature —
// link one shared board, show it embedded — matches 1:1
// (reference/pro/src/screens/board.js); the connected state keeps its
// .board-topbar but with sprite icons instead of emoji.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const objects = read('public/js/objects.js');
const css = read('public/style.css');

describe('objects.js: loadBoard', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/objects.js')]));
  test('the empty state is the reference hero + numbered steps, not two plain <p> lines', () => {
    const r = sliceFn(objects, 'loadBoard', 'objects.js');
    assert.match(r, /class="board-empty bd-empty"/);
    assert.match(r, /class="hero">\$\{icon\('board'\)\}/);
    assert.match(r, /class="bd-steps"/);
    assert.match(r, /<li>/);
    assert.doesNotMatch(r, /<p>No Miro board linked yet\.<\/p>/);
  });
  test('the connected topbar uses sprite icons instead of emoji/arrows', () => {
    const r = sliceFn(objects, 'loadBoard', 'objects.js');
    assert.match(r, /icon\('alert', 'ic-sm'\)/);
    assert.match(r, /icon\('refresh', 'ic-sm'\)/);
    assert.match(r, /icon\('arrow-up-right', 'ic-sm'\)/);
    assert.doesNotMatch(r, /⚠️|🔄|↗/);
  });
});

describe('stylesheet: the reference empty-state classes exist', () => {
  test('.bd-empty .hero / .bd-steps are defined', () => {
    assert.match(css, /^\.bd-empty \.hero \{/m);
    assert.match(css, /^\.bd-steps \{/m);
    assert.match(css, /^\.bd-steps li::before \{/m);
  });
  test('the old .board-topbar / .board-content / .miro-iframe rules are kept', () => {
    assert.match(css, /^\.board-topbar \{/m); assert.match(css, /^\.miro-iframe \{/m);
  });
});
