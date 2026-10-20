// CLIENT (static + pure-function) tests for the break inside the CRM (BREAK_GAME_CHANGES.md Part 2, 2026-10-20).
// The same game as the landing page (public/js/break-game.js + public/break-game.css), opened from two hidden places:
// the faint four squares at the foot of the sidebar, and "Kurze Pause" in the Ctrl+K palette, which shows up only when
// one of a few words is typed. The board is the workspace's (/api/break-scores); the signed-in user plays under their
// own name. Pinned: the files loaded and fingerprinted, the sidebar button, the palette's hidden entry and its words,
// the team store, the opener, the game's words in the app's dictionary (equal to the landing page's), the look of the
// button, and the game keeping its keys to itself while it is open.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const html  = read('public/index.html');
const core  = read('public/js/core.js');
const game  = read('public/js/break-game.js');
const style = read('public/style.css');
const app   = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const land  = new Function(sliceConst('public/js/landing.js', 'MO_I18N').replace(/^[^{]*/, 'return '))();
const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const s = src.indexOf('{', i); let d = 0; for (let j = s; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) return src.slice(s, j + 1); } return ''; };

describe('the files', () => {
  test('the app loads the game\'s stylesheet after its own and the game\'s script once; the fingerprint covers the stylesheet', () => {
    assert.match(html, /<link rel="stylesheet" href="style\.css" \/>\s*<link rel="stylesheet" href="break-game\.css" \/>/);
    assert.equal((html.match(/<script src="js\/break-game\.js"><\/script>/g) || []).length, 1);
    assert.match(html, /<script src="js\/core\.js"><\/script>\s*<script src="js\/break-game\.js"><\/script>/, 'right after core.js (detail-views.js stays last)');
    assert.match(read('utils/app-version.js'), /return \['index\.html', 'style\.css', 'break-game\.css', \.\.\.js\]/, 'a change to the game\'s look reloads open tabs too');
  });
});

describe('the ways in', () => {
  test('the sidebar: four faint squares at the very foot, labelled, opening the game', () => {
    const foot = html.slice(html.indexOf('<div class="sb-foot">'), html.indexOf('</nav>', html.indexOf('<div class="sb-foot">')));
    assert.match(foot, /<button class="brk-egg" id="brk-egg" type="button" onclick="openBreak\(\)" aria-label="Quick break" data-i18n-aria="brk_title"><svg class="brk-egg-ic" viewBox="0 0 18 12" aria-hidden="true">(<rect [^>]+\/>){4}<\/svg><\/button>/);
    assert.ok(foot.indexOf('id="brk-egg"') > foot.indexOf('id="sidebar-user-btn"'), 'below the user button');
    assert.match(style, /^\.brk-egg \{[^}]*color: var\(--sb-text-dim\);[^}]*opacity: \.3;/m, 'dim until reached');
    assert.match(style, /^\.brk-egg:hover, \.brk-egg:focus-visible \{ opacity: 1; color: var\(--sky-400\); \}$/m, 'light sky on the navy sidebar in both themes');
  });
  test('the palette: "Kurze Pause" appears only when one of the words is typed, and opens the game instead of a page', () => {
    const p = fnBody(core, 'openPalette');
    assert.match(p, /if \(breakPaletteMatch\(term\)\) list = list\.concat\(\[\{ label: t\('brk_title'\), icon: 'keyboard', action: openBreak \}\]\);/);
    assert.match(p, /const run = i => \{ const it = list\[i\]; if \(!it\) return; close\(\); if \(it\.action\) it\.action\(\); else switchPage\(it\.page\); \};/);
    const F = loadFns('public/js/core.js', ['breakPaletteMatch'], { extra: sliceConst('public/js/core.js', 'BREAK_WORDS') });
    for (const w of ['pause', 'Kurze Pause', 'break', 'quick break', 'spie', 'game', 'tetris', 'blöcke']) assert.equal(F.breakPaletteMatch(w), true, w);
    for (const w of ['', 'pau', 'deals', 'kontakte', 'settings', 'gam']) assert.equal(F.breakPaletteMatch(w), false, w);
  });
});

describe('the opener and the team board', () => {
  test('the store reads and writes /api/break-scores, sends only the numbers, and refuses anything but a list', async () => {
    const calls = [];
    const fakeApi = { get: async u => { calls.push(['GET', u]); return [{ name: 'A', score: 9 }]; }, post: async (u, d) => { calls.push(['POST', u, d]); return d.score === 1 ? { error: 'Too many score requests.' } : [{ name: 'A', score: d.score, mine: true }]; } };
    const store = new Function('api', sliceConst('public/js/core.js', 'breakTeamStore').replace(/^[^{]*/, 'return '))(fakeApi);
    assert.equal(store.scope, 'team');
    assert.deepEqual(await store.load(), [{ name: 'A', score: 9 }]);
    assert.deepEqual(await store.save({ name: 'Anna Weiß', score: 500, lines: 4, level: 1, at: 1 }), [{ name: 'A', score: 500, mine: true }]);
    assert.deepEqual(calls[1], ['POST', '/api/break-scores', { score: 500, lines: 4, level: 1 }], 'the server takes the name and the workspace from the session');
    await assert.rejects(store.save({ score: 1, lines: 0, level: 1 }), 'a refusal is not a board');
    assert.deepEqual(calls[0], ['GET', '/api/break-scores']);
  });
  test('openBreak: the app\'s words (tf when there are values), the signed-in user as the player, the team store', () => {
    const o = fnBody(core, 'openBreak');
    assert.match(o, /if \(typeof brkOpen !== 'function'\) return;/);
    assert.match(o, /brkOpen\(\{ t: \(k, v\) => \(v \? tf\(k, v\) : t\(k\)\), player: \(currentUser && currentUser\.name\) \|\| '', store: breakTeamStore \}\);/);
  });
  test('every word the game asks for is in the app\'s dictionary, German and English, the same as on the landing page', () => {
    const asked = [...new Set([...game.matchAll(/'(brk_[a-z0-9_]+)'/g)].map(m => m[1]))];
    assert.ok(asked.length >= 25);
    for (const k of asked) for (const lang of ['de', 'en']) {
      assert.ok(typeof app[lang][k] === 'string' && app[lang][k], `${lang} ${k} in TRANSLATIONS`);
      assert.equal(app[lang][k], land[lang][k], `${lang} ${k}: one voice on both pages`);
    }
    assert.equal(app.de.brk_scope_team, 'Die Bestenliste des ganzen Teams.');
  });
  test('while the game is open it keeps its keys to itself: the app\'s Ctrl+K and / stay quiet behind it', () => {
    const k = game.slice(game.indexOf("d.addEventListener('keydown'"), game.indexOf("document.addEventListener('visibilitychange'"));
    assert.match(k, /^d\.addEventListener\('keydown', e => \{\s*e\.stopPropagation\(\);/);
  });
});
