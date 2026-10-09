// CLIENT (static) tests for the product tour (guide.js): sprite icons on the
// Prev/Next buttons, and a real bug fix — showGuideStep used to set
// guide-next-btn's textContent for the "Next →"/"Finish" label, which wipes
// out any child element (the button's own arrow icon) on every single step,
// starting with the first. The reference's own tour (reference/pro/src/
// screens/tour.js) is a spotlight-and-popover tour over the live shell with
// richer per-step content (bulleted highlights, a welcome badge); the app's
// existing tour is the same mechanism (spotlight + positioned tooltip, a
// step counter, dots, Prev/Next) with its own step content — the mechanism
// was not rebuilt, only its icons and the bug were fixed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const guide = read('public/js/guide.js');
const section = html.slice(html.indexOf('<div id="guide-overlay"'), html.indexOf('<script src="js/analytics.js">'));

describe('markup: the guide overlay uses sprite icons', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/guide.js')]));
  test('Prev and Next use chevron-left/chevron-right from the sprite', () => {
    assert.match(section, /id="guide-prev-btn"[^>]*onclick="guidePrev\(\)"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"\/><\/svg><span data-i18n="btn_back">Back<\/span>/);
    assert.match(section, /id="guide-next-btn"[^>]*onclick="guideNext\(\)"><span data-i18n="html_next">Next<\/span><svg class="ic" aria-hidden="true"><use href="#i-chevron-right"\/><\/svg>/);
  });
  test('every sprite reference inside the overlay resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});

describe('guide.js: showGuideStep sets the Next button safely', () => {
  test('innerHTML is used (not textContent), with sprite icons for Next and Finish', () => {
    const s = sliceFn(guide, 'showGuideStep', 'guide.js');
    assert.match(s, /nextBtn\.innerHTML = isLast/);
    assert.match(s, /icon\('check', 'ic-sm'\)/);
    assert.match(s, /icon\('chevron-right', 'ic-sm'\)/);
    assert.doesNotMatch(s, /next-btn'\)\.textContent/);
    assert.doesNotMatch(s, /Next →/);
  });
});
