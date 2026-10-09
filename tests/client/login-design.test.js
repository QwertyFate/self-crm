// CLIENT (static) tests for the login page (2026-10-06, reworked the same day
// after the first cut was rejected): a two-tone split — the navy wall (the
// sidebar's own gradient and the reference's fading grid) beside a white half
// holding a 400px form column, no card, no canvas. Headlines are set in
// Schibsted Grotesk, the landing page's display face, self-hosted under the
// CSP; body text stays on Inter. The door is German first (the team is
// German) with English behind every data-i18n key, and `currentLang` now
// defaults to 'de'. The login/signup tabs became a sentence switch built on
// the same .auth-tabs/.auth-tab hooks auth.js binds at script load.
//
// What the JS depends on is pinned by id (auth.js showAuth() does unguarded
// getElementById); what the earlier suites pinned (three sprite back links,
// the verbatim admin anchor, the slice boundaries, one <main> per page) stays
// byte-exact. Two latent bugs ride along: `animation: modal-in` was named four
// times and defined nowhere, and id="join-ws-code"/"join-ws-error" existed
// twice, so the auth-screen Join view could not submit.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const css  = read('public/style.css');
const auth = read('public/js/auth.js');
const core = read('public/js/core.js');
const section = html.slice(html.indexOf('<div id="auth-screen"'), html.indexOf('MAIN APP'));
const count = (s, needle) => s.split(needle).length - 1;
const rule = (sel) => { const m = css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm')); assert.ok(m, `rule ${sel}`); return m[1]; };

describe('layout: the navy wall beside the white form half', () => {
  test('#auth-screen is .au > aside.au-brand + section.au-main > .au-col — no card, no .auth-* chrome, no <main>', () => {
    assert.match(section, /<div id="auth-screen" class="hidden">\s*<div class="au">\s*(?:<!--[\s\S]*?-->\s*)?<aside class="au-brand"/);
    assert.match(section, /<section class="au-main">\s*(?:<div class="au-tools">[\s\S]*?<\/button>\s*<\/div>\s*)?<div class="au-col au-in">/);   // not <main>: the app shell owns the page's one <main>; the tools corner (DE|EN, theme) may sit first
    assert.doesNotMatch(section, /<main[\s>]/, 'the app shell owns the page\'s one <main>');
    assert.doesNotMatch(section, /class="auth-(wrap|card|logo|form|field|submit|link-row)[" ]/);
    assert.doesNotMatch(section, /style="display/, 'visibility is the .hidden class only');
  });
  test('the wall: wordmark, headline, lede, three benefit rows with sprite icons — and a staggered reveal', () => {
    assert.match(section, /<img class="au-logo au-rise" src="\/images\/logo\.png" alt="Upgrads">/);
    assert.match(section, /<p class="au-headline au-rise au-rise-1" data-i18n="au_headline">/);
    assert.match(section, /<p class="au-lede au-rise au-rise-2" data-i18n="au_lede">/);
    const points = section.match(/<ul class="au-points au-rise au-rise-3">([\s\S]*?)<\/ul>/);
    assert.ok(points, '.au-points list');
    assert.deepEqual([...points[1].matchAll(/<use href="#(i-[\w-]+)"/g)].map(m => m[1]), ['i-kanban', 'i-users', 'i-message-circle']);
    assert.deepEqual([...points[1].matchAll(/<b data-i18n="(au_pt_\w+)"/g)].map(m => m[1]), ['au_pt_pipe_t', 'au_pt_contacts_t', 'au_pt_team_t']);
    assert.doesNotMatch(section, /au-snap|au-copy|au-hint/, 'no fictional statistics, no demo hints');
  });
  test('the login/signup switch is a sentence on the .auth-tabs/.auth-tab hooks, after the views', () => {
    assert.match(section, /<div class="auth-tabs au-switch">\s*<span data-for="signup" data-i18n="au_switch_q_signup">[^<]*<\/span><button type="button" class="auth-tab" data-tab="signup" aria-selected="false" data-i18n="tab_signup">[^<]*<\/button>\s*<span data-for="login" data-i18n="au_switch_q_login">[^<]*<\/span><button type="button" class="auth-tab active" data-tab="login" aria-selected="true" data-i18n="tab_login">[^<]*<\/button>\s*<\/div>/);
    assert.equal([...section.matchAll(/class="auth-tab( active)?"/g)].length, 2);   // not a prefix count: the container is .auth-tabs
    assert.ok(section.indexOf('id="auth-view-join-workspace"') < section.indexOf('class="auth-tabs au-switch"'), 'the switch sits under the form');
    assert.match(css, /^\.au-switch \.auth-tab\.active,\n\.au-switch:has\(\.auth-tab\.active\[data-tab="login"\]\) \[data-for="login"\],\n\.au-switch:has\(\.auth-tab\.active\[data-tab="signup"\]\) \[data-for="signup"\] \{ display: none; \}/m);
  });
  test('the three sprite back links and the verbatim admin anchor survive (auth-design.test.js stays green)', () => {
    assert.equal([...section.matchAll(/<svg class="ic" aria-hidden="true"><use href="#i-arrow-left"\/><\/svg>/g)].length, 3);
    assert.match(section, /<a href="\/\?admin" class="admin-link"><svg class="ic" aria-hidden="true"><use href="#i-settings"\/><\/svg><span data-i18n="role_admin">Admin<\/span><\/a>/);
    assert.doesNotMatch(section.match(/<aside class="au-brand"[\s\S]*?<\/aside>/)[0], /i-arrow-left/, 'no back link in the wall');
  });
});

describe('contract: every id auth.js reads exists exactly once', () => {
  const ids = ['login-form', 'signup-form', 'login-error', 'signup-error', 'forgot-error', 'forgot-success',
    'forgot-link-box', 'forgot-btn', 'reset-error', 'reset-token', 'reset-password', 'reset-confirm', 'forgot-email',
    'forgot-link-val', 'login-email', 'login-password', 'su-workspace-field', 'su-platform-code-field', 'su-code-field',
    'su-workspace', 'su-platform-code', 'su-code', 'su-name', 'su-email', 'su-password',
    'auth-view-main', 'auth-view-forgot', 'auth-view-reset', 'auth-view-workspace-picker', 'auth-view-join-workspace',
    'workspace-picker-list', 'workspace-picker-error', 'login-notice', 'join-ws-auth-code', 'join-ws-auth-error'];
  for (const id of ids) test(`#${id}`, () => assert.equal(count(section, ` id="${id}"`), 1));
  test('both forms are <form> elements (showAuth calls .reset()) with their handlers', () => {
    assert.match(section, /<form id="login-form" class="au-form" onsubmit="handleLogin\(event\)">/);
    assert.match(section, /<form id="signup-form" class="au-form hidden" onsubmit="handleSignup\(event\)">/);
  });
  test('the signup mode is the radio group auth.js reads, as selectable rows on the house .check.round recipe', () => {
    assert.match(section, /<label class="check round au-mode"><input type="radio" name="signup-mode" value="create" checked onchange="toggleSignupMode\(\)">/);
    assert.match(section, /<label class="check round au-mode"><input type="radio" name="signup-mode" value="join" onchange="toggleSignupMode\(\)">/);
    assert.match(css, /^\.au-mode:has\(input:checked\) \{ border-color: var\(--brand\); background: var\(--brand-subtle\)/m);
  });
  test('no id is declared twice anywhere in index.html (join-ws-code / join-ws-error were)', () => {
    const all = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    assert.deepEqual([...new Set(dupes)], []);
  });
});

describe('fields: the house recipe, the Forgot link beside Password, an icon-only Show/Hide on every password', () => {
  test('every field is .au-field.field with a .label for= its input', () => {
    assert.ok(count(section, '<div class="au-field field') >= 12, 'every field uses the house .field recipe');
    for (const m of section.matchAll(/<label class="label" for="([\w-]+)"/g)) assert.equal(count(section, ` id="${m[1]}"`), 1, `label for=${m[1]}`);
  });
  test('Password label row: label + Forgot link side by side', () => {
    assert.match(section, /<div class="au-lab"><label class="label" for="login-password" data-i18n="lbl_password">[^<]*<\/label><a href="#" onclick="showForgotPassword\(event\)" data-i18n="auth_forgot">[^<]*<\/a><\/div>/);
  });
  test('four password inputs, each with an icon-only Show/Hide button whose label is screen-reader text', () => {
    const btns = [...section.matchAll(/<button type="button" class="au-pw-btn" data-pw="([\w-]+)" aria-pressed="false" onclick="togglePassword\(this\)"><svg class="ic" aria-hidden="true"><use href="#i-eye"\/><\/svg><span class="sr-only" data-i18n="auth_show">[^<]*<\/span><\/button>/g)].map(m => m[1]);
    assert.deepEqual(btns, ['login-password', 'su-password', 'reset-password', 'reset-confirm']);
    for (const id of btns) assert.match(section, new RegExp(`<input class="input" type="password" id="${id}"`));
  });
  test('inputs carry class="input" so the house control recipe applies', () => {
    for (const m of section.matchAll(/<input ([^>]*)>/g)) {
      if (/type="(hidden|radio)"/.test(m[1])) continue;
      assert.match(m[1], /^class="input"/, m[0]);
    }
  });
});

describe('stylesheet: the 22b block and the display face', () => {
  test('Schibsted Grotesk is self-hosted (CSP: fonts from self only), declared once, and is the login\'s display face', () => {
    assert.equal([...css.matchAll(/@font-face \{ font-family: "Schibsted Grotesk"; font-style: normal; font-weight: 400 900; font-display: swap; src: url\(\/fonts\/SchibstedGrotesk\.woff2\) format\("woff2"\); \}/g)].length, 1);
    const f = path.join(ROOT, 'public/fonts/SchibstedGrotesk.woff2');
    assert.ok(fs.existsSync(f)); assert.ok(fs.statSync(f).size > 40000, 'the real variable font, not a stub');
    assert.equal(fs.readFileSync(f).slice(0, 4).toString('latin1'), 'wOF2');
    assert.match(rule('.au'), /--font-display: "Schibsted Grotesk", var\(--font\)/, 'scoped to .au, not a :root token (foundation diffs :root against the reference)');
    for (const sel of ['.au-headline', '.au-title', '.au-points b']) assert.match(rule(sel), /font-family: var\(--font-display\)/, sel);
    assert.doesNotMatch(css, /^body \{[^}]*Schibsted/m, 'body stays on Inter');
  });
  test('the split: two-tone, the wall is the sidebar gradient under the canvas with a sky glow, the logo white in BOTH themes', () => {
    assert.match(rule('.au'), /grid-template-columns: minmax\(400px, 23fr\) 27fr/);
    assert.match(rule('.au-main'), /background: var\(--canvas\)/, 'the form half is the app canvas, with depth on top of it');
    assert.match(rule('.au-main::before'), /var\(--sky-400\)/, 'the sky glow');
    assert.match(rule('.au-main::after'), /background-size: 24px 24px/, 'the dot grid'); assert.match(rule('.au-main::after'), /mask-image: linear-gradient\(180deg, #000 0%, transparent 78%\)/, 'fading downward');
    assert.match(rule('.au-brand'), /radial-gradient\(120% 90% at 0% 0%, var\(--sb-bg-2\) 0%, var\(--sb-bg\) 62%\)/);
    assert.match(rule('.au-brand::before'), /var\(--sky-400\)/);
    assert.match(rule('.au-wall'), /position: absolute; inset: 0/);   // the canvas replaced the grid overlay
    assert.match(rule('.au-logo'), /filter: brightness\(0\) invert\(1\)/);
    assert.doesNotMatch(css, /\[data-theme="dark"\] \.au-/);
  });
  test('type: a fluid display headline on the wall, 28px titles in the column', () => {
    assert.match(rule('.au-headline'), /font-size: clamp\(32px, 3\.2vw, 44px\)/);
    assert.match(rule('.au-headline'), /color: var\(--navy-50\)/);
    assert.match(rule('.au-title'), /font-size: 28px/);
    assert.match(rule('.au-main'), /align-items: center/, 'the column is centred in its half');
    assert.match(rule('.au-col'), /max-width: 440px/);   // the card (Part 7)
  });
  test('fields: 44px inputs, 600 labels, a sky focus ring — and no decorative rail any more', () => {
    assert.match(rule('.au-field .input'), /height: 44px/);
    assert.match(rule('.au-field .label'), /font-weight: 600/);
    assert.match(rule('.au-field .input:focus'), /var\(--sky-400\)/);
    assert.doesNotMatch(css, /\.au-field:focus-within::before/);
  });
  test('one orchestrated reveal, busy submit, alert and notice tones', () => {
    assert.match(rule('.au-rise'), /animation: modal-in \.5s var\(--ease-out\) both/);
    assert.match(css, /^\.au-rise-1 \{ animation-delay: \.08s; \} \.au-rise-2 \{ animation-delay: \.16s; \} \.au-rise-3 \{ animation-delay: \.24s; \}/m);
    assert.match(css, /^\.au-submit\[aria-busy="true"\] \{/m);
    assert.match(rule('.au-alert'), /background: var\(--danger-bg\); border: 1px solid var\(--danger-bd\); color: var\(--danger\)/);
    assert.match(rule('.au-notice'), /background: var\(--success-bg\); border: 1px solid var\(--success-bd\); color: var\(--success\)/);
  });
  test('under 960px: one column, the wall keeps only logo + headline', () => {
    const mq = css.match(/@media \(max-width: 960px\) \{[^@]*?\.au \{[\s\S]*?\n\}/);
    assert.ok(mq, 'the au- media block');
    assert.match(mq[0], /\.au \{ grid-template-columns: minmax\(0, 1fr\); grid-template-rows: auto 1fr; \}/);
    assert.match(mq[0], /\.au-lede, \.au-points \{ display: none; \}/);
  });
  test('@keyframes modal-in exists exactly once (the wall, the column, the workspace dropdown and chat name it)', () => {
    assert.equal([...css.matchAll(/^@keyframes modal-in \{/gm)].length, 1);
    assert.ok([...css.matchAll(/animation: modal-in /g)].length >= 5);
  });
  test('rules whose last consumer was the login are gone; the admin gates\' rules stay', () => {
    for (const re of [/^\.auth-tabs \{/m, /^\.auth-tab \{/m, /^\.auth-mode-opt \{/m, /^\.auth-view-title \{/m, /^\.auth-hint \{/m, /^\.auth-reset-link \{/m, /^\.reset-link-row \{/m, /^\.auth-success \{/m]) assert.doesNotMatch(css, re);
    for (const re of [/^\.auth-wrap \{/m, /^\.auth-card \{/m, /^\.auth-error/m, /^\.auth-field \{/m, /^\.auth-submit \{/m, /^\.workspace-picker-btn \{/m]) assert.match(css, re);
  });
});

describe('auth.js: translated, busy while logging in, no dialogs, the Join view submits', () => {
  test('showAuth translates the door and clears the reset notice', () => {
    const s = sliceFn(auth, 'showAuth', 'auth.js');
    assert.match(s, /applyTranslations\(\)/); assert.match(s, /login-notice/); assert.match(s, /aria-selected/);
  });
  test('togglePassword flips type, aria-pressed, the eye icon and the label', () => {
    const s = sliceFn(auth, 'togglePassword', 'auth.js');
    assert.match(s, /#i-eye-off/); assert.match(s, /aria-pressed/); assert.match(s, /auth_hide/);
  });
  test('handleLogin marks the button busy around the request', () => {
    const s = sliceFn(auth, 'handleLogin', 'auth.js');
    assert.match(s, /setAuthBusy\(e\.target, true, 'auth_logging_in'\)/);
    assert.ok(s.indexOf('setAuthBusy(e.target, true') < s.indexOf("api.post('/api/auth/login'"));
    assert.match(sliceFn(auth, 'setAuthBusy', 'auth.js'), /aria-busy/);
  });
  test('no alert() dialogs on the door', () => {
    for (const fn of ['copyResetLink', 'handleResetPassword', 'selectWorkspace', 'handleJoinWorkspace', 'showJoinWorkspace', 'showAuth', 'handleLogin']) {
      assert.doesNotMatch(sliceFn(auth, fn, 'auth.js'), /\balert\(/, fn);
    }
    assert.match(sliceFn(auth, 'handleResetPassword', 'auth.js'), /t\('auth_pw_updated'\)/);
    assert.match(sliceFn(auth, 'copyResetLink', 'auth.js'), /t\('copied'\)/);
  });
  test('handleJoinWorkspace reads the form that submitted (modal or auth view) and re-shows the app', () => {
    const s = sliceFn(auth, 'handleJoinWorkspace', 'auth.js');
    assert.match(s, /const form = e\.target/);
    assert.doesNotMatch(s, /#join-workspace-modal input\[id="join-ws-code"\]/);
    assert.match(s, /getElementById\('auth-screen'\)\.classList\.add\('hidden'\)/);
    assert.match(sliceFn(auth, 'showJoinWorkspace', 'auth.js'), /join-ws-auth-code/);
  });
  test('showAuthView is still the sync declaration after showApp (foundation.test.js slices on it)', () => {
    assert.ok(auth.indexOf('function showApp(') < auth.indexOf('function showAuthView('));
    assert.doesNotMatch(auth, /async function showAuthView\(/);
  });
  test('auth.js and core.js parse', () => { for (const f of ['public/js/auth.js', 'public/js/core.js']) execFileSync(process.execPath, ['--check', path.join(ROOT, f)]); });
});

describe('the wall: upgrads.de\'s louvre-wall mechanism in vanilla JS', () => {
  const wall = read('public/js/login-wall.js');
  test('a canvas and a scrim sit under the content; the script is loaded with the others', () => {
    assert.match(section, /<aside class="au-brand"[^>]*>\s*<canvas class="au-wall" aria-hidden="true"><\/canvas>\s*<span class="au-scrim" aria-hidden="true"><\/span>\s*<img class="au-logo/);
    assert.match(html, /<script src="js\/guide\.js"><\/script>\s*<script src="js\/login-wall\.js"><\/script>\s*<script src="js\/admin-import\.js"><\/script>/, 'before admin-import.js and detail-views.js, which another suite pins as the last two');
    assert.match(rule('.au-wall'), /pointer-events: none/);
    // THE CASCADE, not just the rule: ".au-brand > *" (position: relative, for stacking the content) has the
    // same specificity as ".au-wall" and comes later, so on its own it would put the canvas back in the flow —
    // full panel height, on top, content pushed below (what the user saw). The wall and scrim must be re-asserted
    // absolute by a LATER, MORE SPECIFIC rule.
    const universal = css.indexOf('.au-brand > * { position: relative; z-index: 1; }');
    assert.ok(universal > 0, 'the content-stacking rule');
    const fixRe = /^\.au-brand > \.au-wall, \.au-brand > \.au-scrim \{ position: absolute; z-index: 0; \}/m;
    assert.match(css, fixRe);
    assert.ok(css.search(fixRe) > universal, 'the absolute re-assertion must come AFTER the universal rule');
    assert.doesNotMatch(css, /^\.au-wall, \.au-scrim \{ z-index: 0; \}/m, 'the old z-index-only line (which left position: relative in force) is gone');
    assert.doesNotMatch(css, /^\.au-brand::after/m, 'the grid overlay is gone — the wall is the texture now');
  });
  test('vanilla and small: one 2D context, no library, no WebGL, under 12 KB', () => {
    assert.ok(wall.length < 12000, `${wall.length} bytes`);
    assert.doesNotMatch(wall.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\b(import|require)\b|three|gsap|pixi|p5|particles|webgl/i, 'code only — the header comment names what it avoids');
    assert.equal(count(wall, "getContext('2d')"), 2, 'the wall and its one offscreen mask');
  });
  test('the mechanism: pointer-driven louvre tilt, the logo PNG as a supersampled two-tone mask, idle wander, a sweep, sleeping cells', () => {
    for (const re of [/pointermove/, /REST = 72 \* DEG/, /MAX_TILT = 60 \* DEG/, /RADIUS = 300/, /MASK_SRC = '\/images\/logo\.png'/, /c\.drawImage\(logo/, /const S = 4/, /getImageData/, /logo\.onload/, /p\.t > 0\.5 \? 1 : 2/, /Math\.sin\(t \* 0\.29\)/, /sweepFrom/, /settled: skip/, /buckets\[p\.bucket\]\.push/]) assert.match(wall, re);
  });
  test('it costs nothing while hidden or on a still-frame preference, and ignores coarse pointers', () => {
    assert.match(wall, /cv\.offsetParent !== null && !document\.hidden/);
    assert.match(wall, /prefers-reduced-motion: reduce/); assert.match(wall, /if \(reduce\) return;/);
    assert.match(wall, /pointer: coarse/); assert.match(wall, /if \(!coarse && !reduce\)/);
    assert.match(wall, /new ResizeObserver/);
  });
  test('the pure helpers behave', () => {
    const F = loadFns('public/js/login-wall.js', ['wallSmooth', 'wallGrid', 'wallHex', 'wallMix']);
    assert.equal(F.wallSmooth(-1), 0); assert.equal(F.wallSmooth(2), 1); assert.equal(F.wallSmooth(0.5), 0.5);
    const g = F.wallGrid(640, 900, 6000); assert.ok(Math.abs(g.cols * g.rows - 6000) < 300, JSON.stringify(g)); assert.ok(g.cols < g.rows);
    assert.ok(g.cols >= 60, 'dense enough that the logo at 86% width gets ~7 cells per letter');
    assert.equal(F.wallGrid(2000, 4, 2000).rows, 6, 'never fewer than 6 a side, however flat the panel');
    assert.deepEqual(F.wallHex(' #96CAE2 ', [0, 0, 0]), [150, 202, 226]); assert.deepEqual(F.wallHex('nope', [1, 2, 3]), [1, 2, 3]);
    assert.equal(F.wallMix([0, 0, 0], [255, 255, 255], 0.5), '#808080');
  });
  test('the script parses', () => { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/js/login-wall.js')]); });
});

describe('the form half: a precise card on a textured canvas', () => {
  test('the column is a card: 440px, hairline, 14px radius, the house large shadow', () => {
    const c = rule('.au-col');
    for (const re of [/max-width: 440px/, /background: var\(--surface\)/, /border: 1px solid var\(--line\)/, /border-radius: 14px/, /box-shadow: var\(--shadow-lg\)/]) assert.match(c, re);
  });
  test('titles are brand navy (sky in dark, by the token); fields have the mail / lock sprite icons', () => {
    assert.match(rule('.au-title'), /color: var\(--brand\)/);
    assert.equal([...section.matchAll(/<div class="au-inp"><svg class="ic au-inp-ic" aria-hidden="true"><use href="#i-mail"\/><\/svg><input class="input" type="email"/g)].length, 3, 'login, signup, forgot');
    assert.equal([...section.matchAll(/<div class="au-pw au-inp"><svg class="ic au-inp-ic" aria-hidden="true"><use href="#i-lock"\/><\/svg><input class="input" type="password"/g)].length, 4);
    assert.match(rule('.au-inp .input'), /padding-left: 40px/);
    assert.match(css, /^\.au-inp:focus-within \.au-inp-ic \{ color: var\(--accent-strong\); \}/m);
  });
  test('one orchestrated moment: the form rows rise in turn; the button lifts on hover; the switch sits on a hairline', () => {
    assert.match(css, /^\.au-form > \* \{ animation: modal-in \.45s var\(--ease-out\) both; \}/m);
    assert.match(css, /\.au-form > :nth-child\(1\) \{ animation-delay: \.05s; \}/);
    assert.match(css, /\.au-form > :nth-child\(n\+8\) \{ animation-delay: \.4s; \}/);
    assert.match(rule('.au-submit:hover'), /translateY\(-1px\)/);
    assert.match(rule('.au-switch'), /border-top: 1px solid var\(--line-soft\)/);
  });
});

describe('login errors speak the door\'s language', () => {
  test('the two server messages the door can show are mapped to translation keys (fallback: the raw text)', () => {
    const s = sliceFn(auth, 'handleLogin', 'auth.js');
    assert.match(s, /AUTH_ERRORS\[data\.error\]/);
    assert.match(auth, /^const AUTH_ERRORS = \{ 'Invalid email or password': 'auth_err_invalid', 'Too many login attempts\. Please try again in 15 minutes\.': 'auth_err_limit' \};/m);
    const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    for (const k of ['auth_err_invalid', 'auth_err_limit']) { assert.ok(dict.de[k] && dict.en[k], k); assert.doesNotMatch(dict.de[k], /\b(du|Sie)\b/); }
    assert.match(read('server.js'), /'Too many login attempts\. Please try again in 15 minutes\.'/, 'the mapped text is the server\'s actual text');
  });
});

describe('a failed login: a visible countdown, and after five a way out', () => {
  test('the hint under the error: info tone, impersonal, a link straight into the forgot-password flow', () => {
    assert.match(section, /<div id="login-error" class="au-alert hidden" role="alert"><\/div>\s*<div id="login-hint" class="au-advice hidden" role="status"><span data-i18n="auth_fails_hint">[^<]+<\/span><a href="#" onclick="showForgotPassword\(event\)" data-i18n="auth_fails_link">[^<]+<\/a><\/div>/);
    assert.match(rule('.au-advice'), /background: var\(--info-bg\); border: 1px solid var\(--info-bd\); color: var\(--info\)/);
    const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    for (const k of ['auth_fails_hint', 'auth_fails_link', 'auth_retry_in']) assert.ok(dict.de[k] && dict.en[k], k);
    assert.match(dict.de.auth_retry_in, /%s/); assert.match(dict.en.auth_retry_in, /%s/);
  });
  test('the wiring: a wrong password starts the countdown and counts; the fifth shows the hint; success resets; logout resets', () => {
    const hl = sliceFn(auth, 'handleLogin', 'auth.js');
    assert.match(hl, /loginFails \+= 1/); assert.match(hl, /startLoginCooldown\(e\.target, LOGIN_COOLDOWN_S\)/); assert.match(hl, /loginFails >= LOGIN_FAILS_HINT/);
    assert.match(hl, /loginFails = 0/);
    assert.match(auth, /^const LOGIN_COOLDOWN_S = 8, LOGIN_FAILS_HINT = 5;/m);   // 8 s: the user found 5 too short to read as deliberate
    const sa = sliceFn(auth, 'showAuth', 'auth.js');
    assert.match(sa, /loginFails = 0; clearInterval\(loginCooldown\)/, 'door state resets on every entry to the door (logout included) — not in resetClientState, which is workspace state');
    assert.match(sa, /'login-hint'/);
    assert.match(sliceFn(auth, 'showForgotPassword', 'auth.js'), /login-hint/);
  });
  test('run for real: 401 → button disabled with the 8 s countdown, ticking back to its label; the 5th failure shows the hint; success resets', async () => {
    const extra = `
      const timers = [];
      const els = {};
      const el = id => els[id] || (els[id] = { id, cls: new Set(['hidden']), textContent: id === 'btn' ? 'Anmelden' : '', dataset: {}, attrs: {}, value: '', disabled: false,
        classList: { add: c => els[id].cls.add(c), remove: c => els[id].cls.delete(c), toggle: (c, on) => on ? els[id].cls.add(c) : els[id].cls.delete(c), contains: c => els[id].cls.has(c) },
        setAttribute: (k, v) => { els[id].attrs[k] = v; }, removeAttribute: k => { delete els[id].attrs[k]; } });
      const document = { getElementById: el, querySelector: sel => sel === '.au-submit' ? el('btn') : null, querySelectorAll: () => [] };
      const form = { querySelector: sel => sel === '.au-submit' ? el('btn') : null };
      const api = { post: async () => responses.shift() };
      const t = k => ({ auth_retry_in: 'Erneut versuchen in %s s', auth_err_invalid: 'falsch' })[k] || k;
      function setInterval(fn) { timers.push(fn); return timers.length; } function clearInterval() {}
      function showApp() { log.push('showApp'); } function showWorkspacePicker() {}
      function __probe() { return { btn: el('btn'), hint: el('login-hint'), timers, fails: loginFails }; }
    `;
    const F = loadFns('public/js/auth.js', ['handleLogin', 'setAuthBusy', 'startLoginCooldown'], {
      state: { currentUser: null, currentWorkspace: null, kanbanFields: null, contactColumns: null, dealColumns: null, objectColumns: null, loginFails: 0, loginCooldown: null, responses: null, log: null },
      extra: extra + '\nconst LOGIN_COOLDOWN_S = 8, LOGIN_FAILS_HINT = 5; const AUTH_ERRORS = { "Invalid email or password": "auth_err_invalid" };', expose: ['__probe'] });
    const responses = [], log = [];
    F.__set('responses', responses); F.__set('log', log);
    const fail = { error: 'Invalid email or password' };
    const e = { preventDefault() {}, target: { querySelector: () => F.__probe().btn } };
    responses.push(fail); await F.handleLogin(e);
    let p = F.__probe();
    assert.equal(p.btn.disabled, true); assert.equal(p.btn.textContent, 'Erneut versuchen in 8 s'); assert.equal(p.fails, 1);
    assert.ok(p.hint.cls.has('hidden'), 'no hint yet');
    const tick = p.timers[0];
    tick(); assert.equal(F.__probe().btn.textContent, 'Erneut versuchen in 7 s');
    for (let i = 0; i < 7; i++) tick();
    p = F.__probe(); assert.equal(p.btn.disabled, false); assert.equal(p.btn.textContent, 'Anmelden', 'label back after the countdown');
    for (let i = 0; i < 4; i++) { responses.push(fail); await F.handleLogin(e); }
    p = F.__probe(); assert.equal(p.fails, 5); assert.ok(!p.hint.cls.has('hidden'), 'the hint after five failures');
    responses.push({ user: { id: 1 }, workspace: { id: 7 } }); await F.handleLogin(e);
    assert.deepEqual(log, ['showApp']); assert.equal(F.__probe().fails, 0, 'success resets the count');
  });
});

describe('the DE | EN switch', () => {
  test('two buttons on the form half, German pressed by default, wired to setLanguage()', () => {
    assert.match(section, /<div class="au-lang" role="group" aria-label="Sprache \/ Language">\s*<button type="button" data-lang="de" aria-pressed="true" onclick="setLanguage\('de'\)">DE<\/button>\s*<button type="button" data-lang="en" aria-pressed="false" onclick="setLanguage\('en'\)">EN<\/button>\s*<\/div>/);
    assert.match(rule('.au-lang button[aria-pressed="true"]'), /var\(--brand-subtle\)/);
  });
  test('applyTranslations keeps aria-pressed on the switch, so the door and the saved language agree', () => {
    assert.match(sliceFn(core, 'applyTranslations', 'core.js'), /\.au-lang button'\)\.forEach\(b => b\.setAttribute\('aria-pressed', String\(b\.dataset\.lang === currentLang\)\)\)/);
  });
  test('setLanguage is safe before login: every page refresh it does is guarded', () => {
    const s = sliceFn(core, 'setLanguage', 'core.js');
    assert.match(s, /localStorage\.setItem\('lang', lang\)/); assert.match(s, /applyTranslations\(\)/);
    assert.doesNotMatch(s, /^\s*(loadDeals|switchPage|loadSettings)\(/m, 'no unconditional page loader');
  });
});

describe('the theme switch (2026-10-07: the user asked for dark / light on the login page)', () => {
  test('one icon button beside DE | EN in the tools corner: moon in light, pressed + sun in dark, wired to toggleDarkMode()', () => {
    assert.match(section, /<div class="au-tools">\s*<div class="au-lang" role="group"[\s\S]*?<\/div>\s*<button type="button" class="au-theme" id="au-theme" aria-pressed="false" aria-label="Dunkelmodus" title="Dunkelmodus" onclick="toggleDarkMode\(\)"><svg class="ic" aria-hidden="true"><use id="au-theme-ic" href="#i-moon"\/><\/svg><\/button>\s*<\/div>/);
    assert.equal((section.match(/id="au-theme"/g) || []).length, 1); assert.equal((section.match(/toggleDarkMode\(\)/g) || []).length, 1, 'one switch on the door');
    for (const id of ['i-moon', 'i-sun']) assert.ok(html.includes(`<symbol id="${id}"`), `${id} in the sprite`);
  });
  test('applyTheme drives it (pressed state, sun/moon, the translated name) and tints the browser chrome; setLanguage re-names it', () => {
    const a = sliceFn(core, 'applyTheme', 'core.js');
    assert.match(a, /document\.getElementById\('au-theme'\)/); assert.match(a, /door\.setAttribute\('aria-pressed', String\(dark\)\)/);
    assert.match(a, /t\(dark \? 'light_mode' : 'dark_mode'\)/); assert.match(a, /door\.setAttribute\('aria-label', name\); door\.title = name;/);
    assert.match(a, /getElementById\('au-theme-ic'\)\?\.setAttribute\('href', dark \? '#i-sun' : '#i-moon'\)/);
    assert.match(a, /meta\[name="theme-color"\][\s\S]*dark \? '#0B1424' : '#18345D'/);
    assert.match(sliceFn(core, 'setLanguage', 'core.js'), /applyTheme\(document\.documentElement\.getAttribute\('data-theme'\) === 'dark'\)/);
    assert.match(sliceFn(core, 'toggleDarkMode', 'core.js'), /localStorage\.setItem\('theme', next \? 'dark' : 'light'\)/, 'the choice is kept, as in the app');
    const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    for (const lang of ['de', 'en']) { const d = dict[lang]; assert.ok(d.dark_mode && d.light_mode, `${lang} names both modes`); }
  });
  test('styled by tokens only, so the login half follows the theme without a single [data-theme] rule: the corner is one flex row, the button a 32px square in the same chrome as DE | EN, pressed in brand-subtle', () => {
    assert.match(rule('.au-tools'), /position: absolute; top: 20px; right: 24px; display: flex; align-items: center; gap: 8px;/);
    assert.doesNotMatch(rule('.au-lang'), /position: absolute/, 'the lang switch sits in the corner, not on its own');
    assert.match(rule('.au-theme'), /width: 32px; height: 32px;[^}]*border: 1px solid var\(--line\); border-radius: var\(--r-md\); background: var\(--surface\); color: var\(--text-3\)/);
    assert.match(rule('.au-theme[aria-pressed="true"]'), /var\(--brand-subtle\)/); assert.match(rule('.au-theme:focus-visible'), /var\(--focus-ring\)/);
    assert.doesNotMatch(rule('.au-theme'), /#[0-9a-fA-F]{3,8}\b/, 'no hex in the switch');
    assert.match(css, /^  \.au-tools \{ top: 16px; right: 16px; \}$/m, 'tighter in the corner on a phone'); assert.doesNotMatch(css, /^  \.au-lang \{ top: 16px/m);
  });
});

describe('language: German first, English behind every key', () => {
  const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
  test('a browser with no saved language gets German', () => {
    assert.match(core, /^let currentLang\s*=\s*localStorage\.getItem\('lang'\) \|\| 'de';/m);
  });
  test('the markup\'s default text IS the German translation, key for key', () => {
    let n = 0;
    for (const m of section.matchAll(/<(\w+)[^>]*\sdata-i18n="([a-z_]+)"[^>]*>([^<]*)<\/\1>/g)) { n++; assert.equal(m[3], dict.de[m[2]], m[2]); }
    for (const m of section.matchAll(/data-i18n-ph="([a-z_]+)"[^>]*placeholder="([^"]*)"/g)) { n++; assert.equal(m[2], dict.de[m[1]], m[1]); }
    assert.ok(n >= 50, `checked ${n} strings`);
  });
  test('every data-i18n / data-i18n-ph key in #auth-screen exists in en AND de', () => {
    const keys = [...section.matchAll(/data-i18n(?:-ph)?="([a-z_]+)"/g)].map(m => m[1]);
    for (const k of keys) { assert.ok(typeof dict.en[k] === 'string', `en ${k}`); assert.ok(typeof dict.de[k] === 'string', `de ${k}`); }
  });
  test('nothing a person reads is left without a key', () => {
    const bare = [];
    for (const re of [/<label(?![^>]*data-i18n)[^>]*>([^<]*)<\/label>/g, /<h1(?![^>]*data-i18n)[^>]*>([^<]*)<\/h1>/g,
      /<p class="au-(sub|headline|lede)[^"]*"(?![^>]*data-i18n)[^>]*>([^<]*)<\/p>/g, /<button[^>]*class="btn[^"]*"(?![^>]*data-i18n)[^>]*>([^<]*)<\/button>/g,
      /<input(?![^>]*data-i18n-ph)[^>]*placeholder="([^"]+)"/g]) {
      for (const m of section.matchAll(re)) { const txt = m[m.length - 1].trim(); if (txt) bare.push(txt); }
    }
    assert.deepEqual(bare, []);
  });
  test('every data-i18n element is a leaf (applyTranslations writes textContent)', () => {
    assert.doesNotMatch(section, /<[^>]+data-i18n="[^"]+"[^>]*>[^<]*<(?!\/)/);
  });
  test('the German is impersonal (neither du nor Sie — it has to sit beside both app voices), the headline is the approved hero line, and no value breaks the const slicer', () => {
    const keys = Object.keys(dict.de).filter(k => /^(au_|auth_|tab_|lbl_(password|workspace_name|your_name|confirm_password)|btn_(login|create_account|send_reset|set_password|join_workspace|back)|ph_)/.test(k));
    assert.ok(keys.length >= 45);
    for (const k of keys) {
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
      assert.doesNotMatch(dict.de[k], /[{}]/); assert.doesNotMatch(dict.en[k], /[{}]/);
    }
    assert.equal(dict.en.au_headline, 'From first lead to signed contract, on one board.');
    assert.equal(dict.de.au_headline, 'Vom ersten Lead bis zum unterschriebenen Vertrag – auf einem Board.');
  });
});
