// CLIENT (static + pure-function) tests for the Onboarding monitor page
// (public/js/onboarding.js): sidebar link and page markup, script order, the
// wiring in auth.js / integrations.js, both dictionaries, the CSS, and the pure
// renderers — phase derivation, stale marker, and the table row including when
// the "Start onboarding" button is shown, disabled, or absent.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const intg = read('public/js/integrations.js');
const onb  = read('public/js/onboarding.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;

const pageStart = html.indexOf('<section id="page-onboarding"');
const page = html.slice(pageStart, html.indexOf('</section>', pageStart));

const STATUSES = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];

const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  sliceFn(core, 't', 'core.js'),
  sliceFn(core, 'tf', 'core.js'),
  sliceFn(core, 'fmtDate', 'core.js'),
  sliceFn(core, 'icon', 'core.js'),
  'const ONB_STALE_DAYS = 14;',
  sliceConst('public/js/onboarding.js', 'ONB_STATUSES'),
  sliceConst('public/js/onboarding.js', 'ONB_FILTERS'),
].join('\n');
const F = loadFns('public/js/onboarding.js',
  ['onboardingPhase', 'onboardingIsStale', 'onboardingStatusStep', 'onboardingRowHtml'],
  { state: { currentLang: 'en' }, extra });

const base = {
  deal_id: 17, deal_title: 'Landingpage Muster', pipeline_id: 1, pipeline_name: 'Sales', stage_id: 2, stage_name: 'Proposal', stage_color: '#fa0',
  contact_id: 60, contact_name: 'Erika Muster', contact_company: 'Muster GmbH',
  onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, status_since: '2026-10-01T10:00:00.000Z',
  in_trigger: false, trigger_stage_id: 4, trigger_stage_name: 'Won', delivery: null,
};

describe('markup', () => {
  test('sidebar: one Onboarding link, hidden by default, after Analytics and before Integrations, with a sprite icon', () => {
    assert.equal(count(html, 'data-page="onboarding"'), 1);
    const link = html.match(/<a href="#" class="sb-link hidden" data-page="onboarding" id="nav-onboarding-link">[^\n]*<\/a>/);
    assert.ok(link, 'link markup');
    assert.match(link[0], /<use href="#i-target"\/>/);
    assert.match(link[0], /<span class="sb-text" data-i18n="nav_onboarding">/);
    const iA = html.indexOf('data-page="analytics"'), iO = html.indexOf('data-page="onboarding"'), iI = html.indexOf('data-page="integrations"');
    assert.ok(iA < iO && iO < iI, 'order in the sidebar');
    assert.ok(html.includes('symbol id="i-target"'), 'icon is defined in the sprite');
  });
  test('page section: header with refresh, inactive hint, toolbar, table with eight translated columns and an empty tbody', () => {
    assert.ok(pageStart > 0, '#page-onboarding exists');
    assert.equal(count(html, 'id="page-onboarding"'), 1);
    assert.match(page, /<section id="page-onboarding" class="page">/);
    assert.match(page, /<h1 class="page-title">[\s\S]*?<span data-i18n="nav_onboarding">/);
    assert.match(page, /<p class="page-sub" id="onboarding-page-sub"><\/p>/);
    assert.match(page, /onclick="loadOnboarding\(\)"[\s\S]*?data-i18n="btn_refresh"/);
    assert.match(page, /<p class="onb-inactive hidden" id="onboarding-inactive" data-i18n="onb_inactive_hint">/);
    assert.match(page, /<div class="toolbar" id="onboarding-toolbar"><\/div>/);
    assert.match(page, /<div class="table-wrap">\s*<table class="table" id="onboarding-table">/);
    const ths = [...page.matchAll(/<th[^>]*data-i18n="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(ths, ['onb_col_deal', 'onb_col_customer', 'onb_col_stage', 'onb_col_status', 'onb_col_since', 'onb_col_delivery', 'onb_col_drive', 'onb_col_actions']);
    assert.match(page, /<tbody id="onboarding-body"><\/tbody>/);
    // every text node in the section is translated (the i18n sweep enforces this globally; pin it here too)
    for (const m of page.matchAll(/<(th|span|p|h1)([^>]*)>([^<]+)</g)) if (/[A-Za-z]{2,}/.test(m[3])) assert.match(m[2], /data-i18n=/, `untranslated: ${m[3].trim()}`);
  });
  test('onboarding.js is loaded after integrations.js and before the socket client', () => {
    const iI = html.indexOf('<script src="js/integrations.js">'), iO = html.indexOf('<script src="js/onboarding.js">'), iS = html.indexOf('<script src="/socket.io/socket.io.js">');
    assert.ok(iI > 0 && iO > iI && iO < iS);
    assert.equal(count(html, '<script src="js/onboarding.js">'), 1);
  });
});

describe('wiring', () => {
  test('switchPage loads the page; showApp decides the link; resetClientState clears the state and hides the link', () => {
    assert.match(sliceFn(auth, 'switchPage', 'auth.js'), /if \(page === 'onboarding'\)\s+await loadOnboarding\(\);/);
    assert.match(sliceFn(auth, 'showApp', 'auth.js'), /updateOnboardingNav\(\);/);
    const reset = sliceFn(auth, 'resetClientState', 'auth.js');
    assert.match(reset, /onboardingData = null; onboardingFilter = 'all';/);
    assert.match(reset, /getElementById\('nav-onboarding-link'\)\?\.classList\.add\('hidden'\)/);
  });
  test('saving the Engine card re-evaluates the link, so the Active switch shows/hides Onboarding at once', () => {
    assert.match(sliceFn(intg, 'saveEngineSettings', 'integrations.js'), /updateOnboardingNav\(\);/);
  });
  test('updateOnboardingNav: managers only, then the cheap status call (never GET /settings, which creates a row)', () => {
    const fn = sliceFn(onb, 'updateOnboardingNav', 'onboarding.js');
    assert.match(fn, /currentUser\?\.role === 'owner' \|\| currentUser\?\.role === 'admin'/);
    assert.match(fn, /apiFetchSilent\('\/api\/engine\/status'\)/);
    assert.doesNotMatch(fn, /\/api\/engine\/settings/);
    assert.match(fn, /classList\.toggle\('hidden', !\(s && !s\.error && s\.active && s\.can_manage\)\)/);
  });
  test('startOnboarding goes through the existing stage route with the resolved trigger stage, after a confirm', () => {
    const fn = sliceFn(onb, 'startOnboarding', 'onboarding.js');
    assert.match(fn, /ui\.confirm\(\{/);
    assert.match(fn, /api\.patch\(`\/api\/deals\/\$\{dealId\}\/stage`, \{ stage_id: row\.trigger_stage_id \}\)/);
    assert.match(fn, /if \(!row \|\| row\.in_trigger \|\| !row\.trigger_stage_id \|\| row\.contact_id == null\) return;/);
    // reads of onboarding_status (===, indexOf) are fine; a write would be a call to the Engine API, an object key
    // `onboarding_status:` in a payload, or an assignment. The header comment may name the Engine endpoint.
    assert.doesNotMatch(onb, /api\.\w+\(\s*[`'"]\/api\/kunden|onboarding_status:\s|onboarding_status\s*=[^=]/, 'the client never writes the Engine status');
  });
  test('loadOnboarding reads GET /api/engine/onboarding and renders', () => {
    assert.match(sliceFn(onb, 'loadOnboarding', 'onboarding.js'), /api\.get\('\/api\/engine\/onboarding'\)[\s\S]*renderOnboarding\(\)/);
  });
});

describe('dictionary', () => {
  test('every onb_* key and nav_onboarding exist in both languages, including the run-time built filter and status keys', () => {
    const keys = Object.keys(dict.en).filter(k => k.startsWith('onb_')).concat('nav_onboarding');
    assert.ok(keys.length >= 30, `found ${keys.length}`);
    for (const k of keys) { assert.ok(k in dict.en, `en.${k}`); assert.ok(k in dict.de, `de.${k}`); }
    for (const f of ['all', 'not_started', 'running', 'done']) assert.ok(('onb_filter_' + f) in dict.de, f);
    for (const s of STATUSES) assert.ok(('onb_status_' + s) in dict.de, s);
    // every key used in the page markup exists
    for (const m of page.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(m[1] in dict.en && m[1] in dict.de, m[1]);
  });
  test('the German texts are German and the stage column uses the app\'s word for stage', () => {
    assert.equal(dict.de.onb_col_stage, dict.de.col_stage);
    assert.equal(dict.de.onb_btn_start, 'Onboarding starten');
    assert.match(dict.de.onb_confirm_body, /verschoben/);
  });
});

describe('styles', () => {
  test('the status pill, inactive hint, drive link and actions column are defined once', () => {
    for (const sel of ['.onb-status {', '.onb-status.step-0 {', '.onb-status.done {', '.onb-inactive {', '.onb-drive {', '.onb-actions {', '.onb-sub {']) assert.equal(count(css, sel), 1, sel);
  });
});

describe('onboardingPhase / onboardingIsStale / onboardingStatusStep', () => {
  test('phase: nothing happened → not_started', () => assert.equal(F.onboardingPhase(base), 'not_started'));
  test('phase: kicked off (trigger stage or a delivery) but Engine silent → running', () => {
    assert.equal(F.onboardingPhase({ ...base, in_trigger: true }), 'running');
    assert.equal(F.onboardingPhase({ ...base, delivery: { status: 'failed' } }), 'running');
  });
  test('phase: any Engine progress → running; onboarding_abgeschlossen → done', () => {
    for (const s of STATUSES.slice(1, -1)) assert.equal(F.onboardingPhase({ ...base, onboarding_status: s }), 'running', s);
    assert.equal(F.onboardingPhase({ ...base, onboarding_status: 'onboarding_abgeschlossen' }), 'done');
  });
  test('phase: a deal without a customer is not_started unless kicked off', () => {
    assert.equal(F.onboardingPhase({ ...base, contact_id: null, onboarding_status: null }), 'not_started');
    assert.equal(F.onboardingPhase({ ...base, contact_id: null, onboarding_status: null, in_trigger: true }), 'running');
  });
  test('stale: only while running, and only after 14 days without a status change', () => {
    const now = new Date('2026-10-20T00:00:00Z').getTime();
    const running = { ...base, onboarding_status: 'formular_versendet' };
    assert.equal(F.onboardingIsStale({ ...running, status_since: '2026-10-01T10:00:00.000Z' }, now), true);    // 18.6 days
    assert.equal(F.onboardingIsStale({ ...running, status_since: '2026-10-10T10:00:00.000Z' }, now), false);   // 9.6 days
    assert.equal(F.onboardingIsStale({ ...base, status_since: '2026-01-01T00:00:00.000Z' }, now), false);      // not started
    assert.equal(F.onboardingIsStale({ ...running, onboarding_status: 'onboarding_abgeschlossen', status_since: '2026-01-01T00:00:00.000Z' }, now), false);
    assert.equal(F.onboardingIsStale({ ...running, status_since: null }, now), false);
  });
  test('status step counts 0..6 in the Engine\'s order; unknown → 0', () => {
    STATUSES.forEach((s, i) => assert.equal(F.onboardingStatusStep(s), i));
    assert.equal(F.onboardingStatusStep('bogus'), 0);
    assert.equal(F.onboardingStatusStep(null), 0);
  });
});

describe('onboardingRowHtml', () => {
  test('not started, with customer and trigger stage: enabled Start button bound to the deal; deal and customer open their detail views', () => {
    const h = F.onboardingRowHtml(base);
    assert.match(h, /<tr data-deal="17">/);
    assert.match(h, /<button type="button" class="btn btn-primary btn-sm" onclick="startOnboarding\(17\)">Start onboarding<\/button>/);
    assert.match(h, /openDealDetail\(17\)/);
    assert.match(h, /openContactDetail\(60\)/);
    assert.match(h, /<span class="stage-pill"><i style="background:#fa0"><\/i>Proposal<\/span>/);
    assert.match(h, /<span class="onb-status step-0">No onboarding<\/span>/);
    assert.match(h, /Not sent/);
    assert.doesNotMatch(h, /onb-drive/);
  });
  test('no customer: button disabled with the reason; status and customer show a dash', () => {
    const h = F.onboardingRowHtml({ ...base, contact_id: null, contact_name: null, contact_company: null, onboarding_status: null, akte_version: null, status_since: null });
    assert.match(h, /<button type="button" class="btn btn-secondary btn-sm" disabled title="Link a customer to this deal first">Start onboarding<\/button>/);
    assert.doesNotMatch(h, /startOnboarding\(/);
    assert.doesNotMatch(h, /onb-status/);
    assert.doesNotMatch(h, /openContactDetail/);
    assert.equal(count(h, 'muted-dash'), 2);
  });
  test('no trigger stage in the pipeline: button disabled pointing to Integrations', () => {
    const h = F.onboardingRowHtml({ ...base, trigger_stage_id: null, trigger_stage_name: null });
    assert.match(h, /disabled title="No trigger stage is configured for this pipeline \(Integrations → Upgrads Engine\)"/);
  });
  test('already in a trigger stage, running, or done: no button at all', () => {
    assert.doesNotMatch(F.onboardingRowHtml({ ...base, in_trigger: true, stage_id: 4, stage_name: 'Won' }), /Start onboarding/);
    assert.doesNotMatch(F.onboardingRowHtml({ ...base, onboarding_status: 'termin_gebucht' }), /Start onboarding/);
    assert.doesNotMatch(F.onboardingRowHtml({ ...base, onboarding_status: 'onboarding_abgeschlossen' }), /Start onboarding/);
    assert.doesNotMatch(F.onboardingRowHtml({ ...base, delivery: { status: 'pending', attempts: 1 } }), /Start onboarding/);
  });
  test('Engine status pill: translated label, step class, done class; stale badge after 14 days', () => {
    const h = F.onboardingRowHtml({ ...base, onboarding_status: 'termin_gebucht', status_since: '2000-01-01T00:00:00.000Z' });
    assert.match(h, /<span class="onb-status step-3">Appointment booked<\/span>/);
    assert.match(h, /<span class="badge badge-warning">14\+ days unchanged<\/span>/);
    const done = F.onboardingRowHtml({ ...base, onboarding_status: 'onboarding_abgeschlossen', status_since: '2000-01-01T00:00:00.000Z' });
    assert.match(done, /<span class="onb-status step-6 done">Completed<\/span>/);
    assert.doesNotMatch(done, /days unchanged/);
    F.__set('currentLang', 'de');
    assert.match(F.onboardingRowHtml({ ...base, onboarding_status: 'termin_gebucht' }), /Termin gebucht/);
    F.__set('currentLang', 'en');
  });
  test('delivery badge follows the last webhook delivery and carries the error as title', () => {
    assert.match(F.onboardingRowHtml({ ...base, delivery: { status: 'success', attempts: 1, last_error: null } }), /<span class="badge badge-success" title="">Delivered<\/span>/);
    assert.match(F.onboardingRowHtml({ ...base, delivery: { status: 'failed', attempts: 3, last_error: 'HTTP 500' } }), /<span class="badge badge-danger" title="HTTP 500">Failed<\/span>/);
    assert.match(F.onboardingRowHtml({ ...base, delivery: { status: 'pending', attempts: 1 } }), /badge-warning" title="">Pending</);
  });
  test('Drive link: encoded folder id, new tab, noopener, translated label', () => {
    const h = F.onboardingRowHtml({ ...base, drive_ordner_id: '1Ab C/é' });
    assert.match(h, /<a class="onb-drive" href="https:\/\/drive\.google\.com\/drive\/folders\/1Ab%20C%2F%C3%A9" target="_blank" rel="noopener" title="Open Drive folder" aria-label="Open Drive folder">/);
  });
  test('everything from the database is escaped', () => {
    const h = F.onboardingRowHtml({ ...base, deal_title: '<img src=x onerror=1>', contact_name: 'A & B', contact_company: '"Q"', stage_name: '<b>', stage_color: '"onclick="x', delivery: { status: 'failed', last_error: '<script>' } });
    assert.doesNotMatch(h, /<img|<b>|<script>/);
    assert.match(h, /&lt;img src=x onerror=1&gt;/);
    assert.match(h, /A &amp; B/);
    assert.match(h, /style="background:&quot;onclick=&quot;x"/);
  });
});
