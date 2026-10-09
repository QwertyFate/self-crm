// Loading states (2026-10-07): the top bar runs for every request and ends when
// the request does; the blocking overlay waits 2 s and, once the shell is up,
// covers only the content area so the sidebar and top bar never vanish. Pages
// fade in on activation. Static checks on core.js / style.css / index.html —
// no browser (headless Chrome hangs on this machine).
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', '..', 'public');
const core = fs.readFileSync(path.join(PUB, 'js', 'core.js'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const loader = core.slice(core.indexOf('const loader = (() => {'), core.indexOf('async function apiFetch('));

describe('loader: bar for every request, overlay only after 2 s', () => {
  test('the overlay waits OVERLAY_DELAY = 2000 ms and is armed once per burst, not reset by each new request', () => {
    assert.match(loader, /const OVERLAY_DELAY = 2000;/);
    assert.match(loader, /if \(!overlayTimer\) overlayTimer = setTimeout\(\(\) => \{ overlayTimer = null; if \(count > 0\) overlay\(\)\?\.classList\.remove\('hidden'\); \}, OVERLAY_DELAY\);/);
    const start = loader.slice(loader.indexOf('function start()'), loader.indexOf('function done()'));
    assert.doesNotMatch(start, /clearTimeout\(overlayTimer\)/, 'a second request in flight must not postpone the overlay');
    assert.doesNotMatch(loader, /, 300\)/, 'the old 300 ms overlay delay is gone');
  });
  test('no minimum display time: done() finishes the bar at once and clears every pending timer', () => {
    assert.doesNotMatch(loader, /MIN_DISPLAY_TIME|startTime|elapsed/);
    const done = loader.slice(loader.indexOf('function done()'));
    assert.match(done, /clearTimeout\(overlayTimer\); overlayTimer = null;/);
    assert.match(done, /clearFill\(\);/);
    assert.match(done, /overlay\(\)\?\.classList\.add\('hidden'\);/);
    assert.match(done, /f\.style\.width = '100%'/);
    assert.match(done, /\}, 200\);/, 'the bar fades right after reaching 100%');
  });
  test('both fill timers are tracked so a finished request cannot be overdrawn by a stale 70% tick', () => {
    assert.match(loader, /const clearFill = \(\) => \{ \(fillTimer \|\| \[\]\)\.forEach\(clearTimeout\); fillTimer = null; \};/);
    assert.match(loader, /fillTimer = \[\s*setTimeout\([^]*?, 50\),\s*setTimeout\([^]*?, 400\),\s*\];/);
  });
  test('apiFetch still brackets every request with start/done; apiFetchSilent never touches the loader', () => {
    const af = core.slice(core.indexOf('async function apiFetch('), core.indexOf('async function apiFetchSilent('));
    assert.match(af, /loader\.start\(\);/); assert.match(af, /finally \{\s*loader\.done\(\);/);
    const silent = core.slice(core.indexOf('async function apiFetchSilent('), core.indexOf('const api = {'));
    assert.doesNotMatch(silent, /loader\./);
  });
});

describe('overlay geometry: the shell stays visible under it', () => {
  test('markup: the overlay is a sibling of #app, not inside a page, so it can be scoped by :has()', () => {
    assert.ok(html.indexOf('<div id="loading-overlay" class="hidden">') < html.indexOf('<div id="app" class="hidden">'));
    assert.equal((html.match(/id="loading-overlay"/g) || []).length, 1);
  });
  test('once #app is shown the overlay insets past the sidebar (rail-aware) and the top bar', () => {
    assert.match(css, /^#loading-overlay \{\s*\n\s*position: fixed; inset: 0;/m);
    assert.match(css, /^body:has\(#app:not\(\.hidden\)\) #loading-overlay \{ left: var\(--sb-width\); top: var\(--topbar-h\); \}/m);
    assert.match(css, /^body:has\(#app\.rail:not\(\.hidden\)\) #loading-overlay \{ left: var\(--sb-width-rail\); \}/m);
    const topbarH = css.match(/--topbar-h:(\d+)px;/)[1];
    const topbar = css.match(/^\.topbar \{ height: (\d+)px;/m)[1];
    assert.equal(topbarH, topbar, '--topbar-h must track the real .topbar height');
    assert.ok(css.indexOf('#loading-overlay.hidden { display: none !important; }') < css.indexOf('body:has(#app:not(.hidden)) #loading-overlay'), '.hidden still wins: it is !important and declared first');
  });
});

describe('page transition: a short fade on activation', () => {
  test('.page.active animates page-in over --dur; the keyframe is defined; reduced-motion collapses it', () => {
    assert.match(css, /^\.page\.active \{ display: flex; flex: 1 1 auto; min-height: 0; animation: page-in var\(--dur\) var\(--ease\) both; \}/m);
    assert.match(css, /^@keyframes page-in \{ from \{ opacity: 0; transform: translateY\(3px\); \} to \{ opacity: 1; transform: none; \} \}/m);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{\s*animation-duration: \.01ms !important;/);
  });
});
