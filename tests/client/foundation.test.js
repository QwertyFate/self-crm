// CLIENT (static) tests for the design foundation ported from `reference/pro`:
// the reference's token values under the app's token names (plus the
// reference's own names as aliases), the local Inter font, the icon sprite,
// the rebuilt shell (dark sidebar with an icon rail, top bar with crumbs,
// search, New, bell, help) and the ui primitives in core.js.
//
// The reference folder is gitignored; the token comparison is skipped when it
// is absent so CI without the folder still runs the structural checks.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { read } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const css  = read('public/style.css');
const html = read('public/index.html');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const REF  = path.join(ROOT, 'reference/pro/src');
const hasRef = fs.existsSync(path.join(REF, 'base.css'));
const count = (src, needle) => src.split(needle).length - 1;

/* ---------- token parsing: every `:root {…}` / `[data-theme="dark"] {…}` block, merged ---------- */
function blocks(src, selector) {
  const out = {};
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'g');
  for (const m of src.matchAll(re)) {
    const start = m.index + m[0].length;
    const end = src.indexOf('}', start);
    const body = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const decl of body.split(';')) {
      const i = decl.indexOf(':'); if (i < 0) continue;
      const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim();
      if (k.startsWith('--')) out[k] = v;
    }
  }
  return out;
}
function resolve(map, fallback, v, depth = 0) {
  if (depth > 12) throw new Error('token cycle: ' + v);
  return v.replace(/var\((--[\w-]+)\)/g, (_, n) => {
    const next = map[n] ?? fallback[n];
    if (next == null) throw new Error('undefined token ' + n);
    return resolve(map, fallback, next, depth + 1);
  });
}
const norm = s => s.toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim();
const appLight = blocks(css, ':root'), appDark = blocks(css, '[data-theme="dark"]');
const val = (map, fb, name) => norm(resolve(map, fb, map[name] ?? fb[name] ?? (() => { throw new Error('missing ' + name); })()));

// app name → reference name (the value must be identical in both themes)
const MAP = {
  '--canvas': '--bg', '--surface': '--surface', '--surface-sunken': '--surface-2', '--surface-hover': '--hover', '--surface-active': '--selected',
  '--line': '--border', '--line-soft': '--divider', '--line-strong': '--border-strong',
  '--ink': '--text', '--ink-secondary': '--text-2', '--ink-muted': '--text-3', '--ink-subtle': '--text-3', '--ink-inverse': '--text-inv',
  '--brand': '--primary', '--brand-hover': '--primary-hover', '--brand-active': '--primary-active', '--brand-ink': '--link',
  '--brand-subtle': '--selected', '--brand-subtle-2': '--selected-strong',
  '--success': '--success', '--success-subtle': '--success-bg', '--success-ink': '--success',
  '--warning': '--warning', '--warning-subtle': '--warning-bg', '--warning-ink': '--warning',
  '--danger': '--danger', '--danger-subtle': '--danger-bg', '--danger-ink': '--danger',
  '--info': '--info', '--info-subtle': '--info-bg', '--info-ink': '--info',
  '--nav-bg': '--sb-bg', '--nav-ink': '--sb-text', '--nav-label': '--sb-text-dim', '--nav-active': '--sb-active-bg', '--nav-border': '--sb-border',
  '--shadow-sm': '--shadow-sm', '--shadow-md': '--shadow-md', '--shadow-lg': '--shadow-lg',
  '--r-sm': '--r-sm', '--r-md': '--r-md', '--r-lg': '--r-lg', '--r-xl': '--r-xl',
  '--fs-xs': '--fs-xs', '--fs-sm': '--fs-sm', '--fs-base': '--fs-md', '--fs-md': '--fs-md', '--fs-lg': '--fs-lg', '--fs-xl': '--fs-xl', '--fs-2xl': '--fs-2xl',
  '--sidebar-w': '--sb-width',
};

describe('tokens: the reference values under the app names, and the reference names as aliases', { skip: !hasRef && 'reference/pro is not present' }, () => {
  const refCss = hasRef ? fs.readFileSync(path.join(REF, 'base.css'), 'utf8') : '';
  const refLight = blocks(refCss, ':root'), refDark = blocks(refCss, '[data-theme="dark"]');
  test('every mapped pair resolves to the same value, light theme', () => {
    for (const [a, r] of Object.entries(MAP)) assert.equal(val(appLight, {}, a), val(refLight, {}, r), `${a} ← ${r}`);
  });
  test('every mapped pair resolves to the same value, dark theme', () => {
    for (const [a, r] of Object.entries(MAP)) assert.equal(val(appDark, appLight, a), val(refDark, refLight, r), `${a} ← ${r}`);
  });
  test('every reference token name exists in the app with the same value (so screen CSS copies verbatim)', () => {
    for (const r of Object.keys(refLight)) assert.equal(val(appLight, {}, r), val(refLight, {}, r), `light ${r}`);
    for (const r of Object.keys(refDark)) assert.equal(val(appDark, appLight, r), val(refDark, refLight, r), `dark ${r}`);
  });
  test('the reference sprite is embedded whole', () => {
    const ref = fs.readFileSync(path.join(REF, 'icons.svg'), 'utf8');
    const ids = s => [...s.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(ids(html), ids(ref));
  });
});

describe('font: Inter is served locally (the production CSP allows only self and data: fonts)', () => {
  test('no Google Fonts links; one @font-face pointing at a real woff2 file', () => {
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
    assert.match(css, /@font-face\s*\{[^}]*font-family:\s*["']Inter["'][^}]*font-weight:\s*100 900[^}]*url\(["']?\/?fonts\/inter-latin-wght\.woff2["']?\)/);
    const f = path.join(ROOT, 'public/fonts/inter-latin-wght.woff2');
    assert.ok(fs.existsSync(f), 'public/fonts/inter-latin-wght.woff2');
    assert.ok(fs.statSync(f).size > 40000, 'the file is the full variable font, not a stub');
    assert.equal(fs.readFileSync(f).slice(0, 4).toString('latin1'), 'wOF2');
  });
  test('body uses the Inter stack through --font', () => {
    assert.match(css, /^:root \{[\s\S]*?--font:\s*"Inter"/m);
    assert.match(css, /^body \{[^}]*font-family: var\(--font\)/m);
  });
});

describe('shell: sprite, sidebar, top bar', () => {
  const app = html.slice(html.indexOf('<div id="app"'), html.indexOf('<!-- ── Deals ── -->'));
  test('the sprite is injected once at the top of the body and every <use> resolves', () => {
    assert.equal(count(html, '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'), 1);
    assert.ok(html.indexOf('<symbol id="i-') < html.indexOf('<div id="app"'), 'sprite before the app');
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of html.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), `undefined icon ${m[1]}`);
    assert.ok(count(html, '<use href="#i-') >= 14, 'the sidebar and top bar draw from the sprite');
  });
  test('sidebar: brand + collapse toggle, workspace button, two groups, every page link, footer', () => {
    assert.equal(count(app, '<nav class="sidebar"'), 1);
    assert.match(app, /<div class="sb-brand">[\s\S]*?<img[^>]*class="sb-full"[\s\S]*?<button class="iconbtn sb-toggle"[^>]*onclick="toggleRail\(\)"/);
    assert.match(app, /<button class="sb-ws" id="ws-switcher" onclick="switchPage\('workspaces'\)"[\s\S]*?id="sidebar-workspace"[\s\S]*?<span class="sidebar-clock sb-ws-meta" id="sidebar-clock"[^>]*onclick="event\.stopPropagation\(\); switchSettingsTab\('preferences'\); switchPage\('settings'\)"/, 'the clock is a span: a button may not contain a div');
    assert.match(app, /<div class="sb-scroll sidebar-main">/, 'the tour still targets .sidebar-main');
    assert.equal(count(app, '<div class="sb-label"'), 2);
    for (const p of ['deals', 'contacts', 'suppliers', 'tasks', 'chat', 'activities', 'calendar', 'objects', 'board', 'analytics', 'integrations', 'settings']) {
      assert.equal(count(app, `class="sb-link" data-page="${p}"`), 1, p);
    }
    assert.match(app, /<span class="sb-count alert hidden" id="chat-badge">0<\/span>/);
    assert.match(app, /<div class="sb-foot">[\s\S]*?data-page="settings"[\s\S]*?<button class="sb-user" id="sidebar-user-btn" onclick="openUserMenu\(this\)"[\s\S]*?id="sidebar-user-avatar"[\s\S]*?<b id="sidebar-user">/);
    assert.doesNotMatch(app, /dark-toggle|sidebar-logout-btn|notif-bell-btn"[^>]*class="notif-bell-btn|class="sidebar-nav"|class="sidebar-top"|class="sidebar-footer"/);
  });
  test('top bar: crumbs, search trigger, New menu, bell with badge, help', () => {
    assert.match(app, /<div class="main">\s*<header class="topbar">/);
    assert.match(app, /<div class="crumbs" id="crumbs"><\/div>/);
    assert.match(app, /<button class="search-trigger" onclick="openPalette\(\)"/);
    assert.match(app, /<div class="topbar-actions">[\s\S]*?<button class="btn btn-primary" id="topbar-new-btn" onclick="openNewMenu\(this\)"[\s\S]*?<button class="iconbtn" id="notif-bell-btn" onclick="toggleNotifPanel\(\)"[\s\S]*?<span class="notif-badge hidden" id="notif-badge">0<\/span>[\s\S]*?<button class="iconbtn" id="guide-help-btn" onclick="openHelpMenu\(this\)"/);
    assert.match(app, /<main class="view">/);
    assert.equal(count(html, 'class="content"'), 0, 'the old .content wrapper is gone');
    assert.equal(count(html, '<main '), 1);
  });
  test('every id a script reads exists exactly once', () => {
    for (const id of ['sidebar-workspace', 'sidebar-user', 'sidebar-user-avatar', 'sidebar-clock', 'nav-objects-label', 'nav-suppliers-label', 'nav-board-link', 'nav-suppliers-link', 'nav-objects-link', 'chat-badge', 'notif-badge', 'notif-bell-btn', 'guide-help-btn', 'notif-panel', 'notif-list', 'crumbs', 'ws-switcher']) {
      assert.equal(count(html, `id="${id}"`), 1, id);
    }
  });
  test('the notification panel keeps its ids and becomes a top-bar popover', () => {
    assert.match(html, /<div id="notif-panel" class="notif-panel hidden">[\s\S]*?<div id="notif-list" class="notif-list">/);
    assert.ok(html.indexOf('id="notif-panel"') > html.indexOf('<header class="topbar">'), 'panel sits under the top bar');
    assert.match(css, /^\.notif-panel \{[^}]*position: fixed; top: 60px; right: 12px;[^}]*width: 380px/m);
  });
});

describe('stylesheet: the reference recipe under the app selectors, plus the reference primitives', () => {
  test('shell layout is the reference grid with a collapsible rail', () => {
    assert.match(css, /^#app \{ display: grid; grid-template-columns: var\(--sb-width\) minmax\(0, 1fr\);/m);
    assert.match(css, /^#app\.rail \{ grid-template-columns: var\(--sb-width-rail\) minmax\(0, 1fr\); \}/m);
    assert.match(css, /^\.sidebar \{[^}]*background: var\(--sb-bg\); color: var\(--sb-text\)/m);
    assert.match(css, /^\.sb-link\[aria-current="page"\] \{/m);
    assert.match(css, /^@media \(max-width: 1180px\) \{ #app \{ grid-template-columns: var\(--sb-width-rail\)/m, 'auto-rail on narrow screens');
    assert.match(css, /^\.main \{ display: flex; flex-direction: column; min-width: 0; min-height: 0; \}/m);
    assert.match(css, /^\.topbar \{ height: 56px;/m);
    assert.match(css, /^\.view \{ flex: 1 1 auto; overflow: auto; min-height: 0; position: relative;/m);
    assert.doesNotMatch(css, /^\.content \{/m);
    assert.doesNotMatch(css, /^\.sidebar-nav|^\.dark-toggle|^\.toggle-track|^\.sidebar-logout-btn|^\.ws-switcher|^\.sidebar-top|^\.sidebar-footer/m, 'the old sidebar rules are gone');
    assert.match(css, /^\.page \{ display: none; flex-direction: column; height: 100%; overflow: hidden; padding: 24px var\(--page-pad\); gap: var\(--sp-4\); \}/m, 'pages keep their flex column; reference padding');
  });
  test('controls follow the reference', () => {
    assert.match(css, /^\.btn \{[^}]*height: 34px;[^}]*border-radius: var\(--r-md\);[^}]*border: 1px solid var\(--border-strong\)/m, 'a bare .btn is the reference secondary button');
    assert.match(css, /^\.btn-secondary \{/m);
    assert.match(css, /^\.btn-primary \{ background: var\(--primary\); color: var\(--on-primary\); border-color: var\(--primary\);/m);
    assert.match(css, /^\.btn-ghost \{ border-color: transparent;/m);
    assert.match(css, /^\.btn-danger \{ background: var\(--danger\); color: #fff;/m);
    assert.match(css, /^\.btn-danger-ghost \{/m);
    assert.match(css, /^\.iconbtn \{ position: relative; width: 34px; height: 34px;/m);
    assert.match(css, /^input\[type="text"\][\s\S]*?select, textarea \{[^}]*height: 34px; padding: 0 10px;[^}]*border: 1px solid var\(--border-strong\); border-radius: var\(--r-md\)/m);
    assert.match(css, /^input:focus, select:focus, textarea:focus \{[^}]*border-color: var\(--focus\); box-shadow: var\(--focus-ring\)/m);
    assert.match(css, /^input\[type="checkbox"\]\.switch,\n#pref-dark-toggle \{[^}]*width: 36px; height: 20px/m);
    assert.match(css, /^input\[type="checkbox"\]\.switch::after,\n#pref-dark-toggle::after \{[^}]*width: 16px; height: 16px/m);
    assert.match(css, /^input\[type="checkbox"\]\.switch:checked::after,\n#pref-dark-toggle:checked::after \{ transform: translateX\(16px\); \}/m);
    assert.match(css, /^\.view-toggle \{ display: inline-flex; padding: 2px; background: var\(--surface-3\); border-radius: var\(--r-md\); gap: 2px; border: 1px solid var\(--border\); \}/m, 'the view switcher is the reference .seg');
    // Part 18 scoped this to `.toolbar > input` so it stops painting a second magnifier over the
    // Contacts toolbar's reference `.input-group` search box (whose icon is a real sprite child).
    assert.match(css, /^\.toolbar > input \{[^}]*height: 34px;[^}]*border: 1px solid var\(--border-strong\); border-radius: var\(--r-md\)/m);
  });
  test('data display and overlays follow the reference', () => {
    assert.match(css, /^\.table thead th, \.table th \{ position: sticky; top: 0; z-index: 2; background: var\(--surface-2\); text-align: left; font-weight: 600; font-size: var\(--fs-sm\); color: var\(--text-3\); padding: 0 12px; height: 38px;/m);
    assert.match(css, /^\.table td \{ padding: 0 12px; height: 48px; border-bottom: 1px solid var\(--divider\);/m);
    assert.match(css, /^\.badge \{ display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 10px;/m);
    assert.match(css, /^\.modal-overlay \{[^}]*background: var\(--scrim\)/m);
    assert.match(css, /^\.modal \{[^}]*border-radius: var\(--r-xl\);[^}]*box-shadow: var\(--shadow-lg\)/m);
    // The app's own pre-port .modal-header/.modal-footer/.modal-actions were kept here through Part 1
    // because the markup still used them; Part 16 (tests/client/detail-views.test.js) swept every
    // remaining modal to the reference's own .modal-head/.modal-foot, retiring these for good.
    assert.doesNotMatch(css, /^\.modal-header \{/m);
    assert.doesNotMatch(css, /^\.modal-footer, \.modal-actions \{/m);
    for (const sel of ['.card', '.card-header', '.card-title', '.card-body', '.kpi', '.kpi-value', '.badge-success', '.badge-warning', '.badge-danger', '.badge-info', '.badge-violet', '.stage-pill', '.avatar', '.person', '.chip', '.chip.on', '.seg', '.tabs', '.tab', '.check', '.kbd', '.field', '.label', '.help', '.input, .select, .textarea', '.input-group', '.table-foot', '.bulkbar', '.empty', '.list', '.list-item', '.kv', '.progress', '.legend', '.section-title', '.overlay', '.drawer', '.menu', '.menu-item', '.menu-sep', '.menu-label', '.toasts', '.toast', '.palette', '.palette-input', '.palette-item', '.modal-head', '.modal-title', '.modal-body', '.modal-foot', '.modal.sm', '.modal.lg', '.dcard', '.col-board', '.stepper', '.step', '.timeline', '.tl-item', '.cal-grid', '.cal-cell', '.msg', '.crumbs', '.search-trigger', '.topbar-actions', '.page-title', '.page-sub', '.grid-kpi', '.split-2-1', '.delta', '.summary', '.stack', '.stack-legend']) {
      // the reference packs several rules per line, so the selector may follow a closing brace
      assert.match(css, new RegExp(`(^|\\s)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,[^{]*)? \\{`, 'm'), sel);
    }
    assert.match(css, /^\/\* ══ 00b · PRO PRIMITIVES/m);
  });
  test('the rules the earlier suites pin are untouched', () => {
    assert.match(css, /^\.settings-layout \{[^}]*grid-template-columns: 208px minmax\(0, 1fr\)/m);
    assert.match(css, /^\.page-rail \{[^}]*--rail-content-max: 1080px/m);
    assert.ok(css.indexOf('@media (max-width: 820px)') < css.indexOf('@media print'));
  });
});

describe('core.js: icons and ui primitives; auth.js: crumbs, rail state, page links', () => {
  test('both files parse', () => {
    for (const f of ['public/js/core.js', 'public/js/auth.js', 'public/js/modals.js', 'public/js/guide.js']) execFileSync('node', ['--check', path.join(ROOT, f)]);
  });
  test('icon() draws from the sprite through the reference alias map', () => {
    assert.match(core, /^const ICON_ALIAS = \{/m);
    assert.match(core, /^function icon\(name, cls = ''\) \{ return `<svg class="ic \$\{cls\}" aria-hidden="true"><use href="#i-\$\{ICON_ALIAS\[name\] \|\| name\}"\/><\/svg>`; \}/m);
  });
  test('the ui primitives exist and the menu closes on outside click and Escape', () => {
    for (const fn of ['ui.closePopover', 'ui.popover', 'ui.menu', 'ui.select', 'ui.modal', 'ui.drawer', 'ui.confirm', 'ui.toast']) assert.match(core, new RegExp(`^${fn.replace('.', '\\.')} = `, 'm'), fn);
    assert.match(core, /^const ui = \{\};/m);
    const pop = core.slice(core.indexOf('ui.popover = '), core.indexOf('ui.menu = '));
    assert.match(pop, /addEventListener\('pointerdown', onDown, true\)/);
    assert.match(pop, /e\.key === 'Escape'/);
    assert.match(core, /^function on\(root, type, selector, handler\)/m);
  });
  test('shell helpers: crumbs from the active link, rail persisted, menus wired to the real functions', () => {
    assert.match(core, /^function setCrumbs\(page, trail = \[\]\)/m);
    assert.match(core, /^function toggleRail\(\)[\s\S]*?localStorage\.setItem\('sidebarRail'/m);
    assert.match(core, /^function applyRailState\(\)[\s\S]*?localStorage\.getItem\('sidebarRail'\)/m);
    const newMenu = core.slice(core.indexOf('function openNewMenu('), core.indexOf('function openHelpMenu('));
    assert.match(newMenu, /openDealModal\(\)/); assert.match(newMenu, /openContactModal\(\)/); assert.match(newMenu, /openTaskModal\(\)/);
    assert.match(newMenu, /currentContactType = 'supplier'/, 'the Supplier entry opens the contact form in supplier mode');
    const help = core.slice(core.indexOf('function openHelpMenu('), core.indexOf('function openUserMenu('));
    assert.match(help, /tourEnabled/); assert.match(help, /startGuide\(\)/); assert.match(help, /showShortcuts\(\)/);
    const user = core.slice(core.indexOf('function openUserMenu('), core.indexOf('function openPalette('));
    assert.match(user, /switchPage\('settings'\)/); assert.match(user, /toggleDarkMode\(\)/); assert.match(user, /logout\(\)/);
    const pal = core.slice(core.indexOf('function openPalette('), core.indexOf('function showShortcuts('));
    assert.match(pal, /\.sb-link\[data-page\]/, 'the palette lists the pages the sidebar shows');
    assert.match(core, /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === 'k'/);
  });
  test('switchPage marks the link with aria-current and sets the crumbs; showApp restores the rail', () => {
    const sp = auth.slice(auth.indexOf('async function switchPage('), auth.indexOf('function invalidate('));
    assert.match(sp, /\.sb-link\[data-page\]/); assert.match(sp, /setAttribute\('aria-current', 'page'\)/); assert.match(sp, /setCrumbs\(page\)/);
    assert.doesNotMatch(sp, /sidebar-nav/);
    const show = auth.slice(auth.indexOf('function showApp('), auth.indexOf('function showAuthView('));
    assert.match(show, /applyRailState\(\)/);
    assert.match(auth, /document\.querySelectorAll\('\.sb-link\[data-page\]'\)\.forEach/);
    assert.doesNotMatch(read('public/js/modals.js') + read('public/js/guide.js'), /sidebar-nav|closest\('li'\)/);
  });
});
