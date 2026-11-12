// CLIENT (static + pure-function) tests for the Calendly tab on the Integrations page
// (public/js/calendly.js, CALENDLY_CHANGES Part 1): the rail gets a Calendly tab, the pane holds
// one card whose sections follow the server's connected / can_manage / blocked_by, every string
// goes through the dictionary in both languages, the token field is masked and emptied after the
// request, every refusal code of the server has its sentence, and the script talks to exactly
// the five routes.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/calendly.js');
const intg = read('public/js/integrations.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pane = html.slice(html.indexOf('<div id="intg-pane-calendly"'), html.indexOf('<!-- ── Cal.com: one account per workspace'));
const pageStart = html.indexOf('<section id="page-integrations"');
const rail = html.slice(pageStart, html.indexOf('<div class="settings-tab-body">', pageStart));
const count = (s, needle) => s.split(needle).length - 1;

describe('the markup', () => {
  test('the rail: the Calendly tab in Cal.com\'s group, with a calendar icon of its own', () => {
    assert.match(rail, /data-tab="calcom"[^\n]*\n\s*<button class="settings-tab hidden" data-tab="notetaker"[^\n]*\n\s*<button class="settings-tab" data-tab="calendly"\s+onclick="switchIntgTab\('calendly'\)"\s+data-i18n="intg_tab_calendly">Calendly<\/button>\n\s*<div class="settings-tab-sep"/);
    assert.equal(count(rail, 'data-tab="calendly"'), 1);
    assert.match(css, /^\.settings-tab\[data-tab="calendly"\]::before \{ --ico: url\("data:image\/svg\+xml;charset=utf-8,%3Csvg[^"]*stroke='black'[^"]*rect x='3' y='5'[^"]*"\); \}$/m);
  });
  test('the pane: one card with the status badge, the member line, the Cal.com line, the token field, the guide, the account, the event type and one actions row', () => {
    assert.match(pane, /^<div id="intg-pane-calendly" class="settings-pane">/);
    assert.equal(count(html, 'id="intg-pane-calendly"'), 1);
    assert.match(pane, /<div class="settings-card" id="cly-card">/); assert.equal(count(pane, 'class="settings-card"'), 1, 'one card');
    assert.match(pane, /<span id="cly-status" class="badge" data-i18n="cal_status_none">/);
    assert.match(pane, /<p class="settings-hint hidden" id="cly-readonly-hint" data-i18n="cly_readonly_hint">/);
    assert.match(pane, /<p class="settings-hint hidden" id="cly-blocked" data-i18n="cly_blocked">/);
    assert.match(pane, /<div class="intg-section hidden" id="cly-connect-section">[\s\S]*<input type="text" id="cly-token" class="intg-url-input intg-secret-input" autocomplete="off" spellcheck="false" placeholder="[^"]*" data-i18n-ph="cly_token_ph" \/>\s*<\/div>/, 'the token is typed into a masked text field, as the Cal.com key is');
    assert.match(pane, /<div class="intg-section hidden" id="cly-guide-section">\s*<div class="intg-guide-panel" id="cly-guide-panel"><\/div>/);
    assert.match(pane, /<p class="empty-inline hidden" id="cly-none" data-i18n="cly_none">/);
    assert.match(pane, /<div class="intg-section hidden" id="cly-account-section">[\s\S]*<div id="cly-facts"><\/div>/);
    assert.match(pane, /<div class="intg-section hidden" id="cly-type-section">[\s\S]*<select id="cly-event-type" class="form-control" onchange="saveCalendlyEventType\(\)"><\/select>\s*<input type="text" id="cly-type-readonly" class="form-control hidden" readonly \/>/);
    assert.match(pane, /<div class="settings-card-actions" id="cly-actions">\s*<button class="btn btn-primary btn-sm hidden" id="cly-connect-btn" onclick="connectCalendly\(this\)" data-i18n="cal_btn_connect">[^<]*<\/button>\s*<button class="btn btn-sm hidden" id="cly-refresh-btn" onclick="refreshCalendlyEventTypes\(this\)" data-i18n="cal_btn_refresh">[^<]*<\/button>\s*<button class="btn btn-sm hidden" id="cly-register-btn" onclick="registerCalendlyWebhook\(this\)" data-i18n="cal_btn_register">[^<]*<\/button>\s*<button class="btn btn-sm btn-danger hidden" id="cly-disconnect-btn" onclick="disconnectCalendly\(\)" data-i18n="cal_btn_disconnect">[^<]*<\/button>\s*<span id="cly-msg" class="workspace-name-msg hidden"><\/span>\s*<\/div>/);
    assert.match(pane, /<div class="intg-section hidden" id="cly-log-section">[\s\S]*<div id="cly-log" class="intg-logs"><p class="empty-inline" data-i18n="cal_log_none">/, 'the booking log, as on the Cal.com card (Part 2)');
    assert.doesNotMatch(pane, /id="cal-|engine-|webhook_secret|receive_token/, 'nothing of the other tabs, nothing secret');
    for (const m of pane.matchAll(/\bid="([^"]+)"/g)) assert.equal(count(html, `id="${m[1]}"`), 1, m[1] + ' is unique on the page');
  });
  test('calendly.js is loaded once, after integrations.js and before the socket client', () => {
    const i = html.indexOf('<script src="js/calendly.js">');
    assert.ok(i > html.indexOf('<script src="js/integrations.js">') && i < html.indexOf('<script src="/socket.io/socket.io.js">'));
    assert.equal(count(html, '<script src="js/calendly.js">'), 1);
  });
  test('every string on the pane and in the script goes through the dictionary, in both languages, German impersonal', () => {
    const keys = new Set([...pane.matchAll(/data-i18n(?:-ph)?="(\w+)"/g)].map(m => m[1]));
    keys.add(rail.match(/data-tab="calendly"[^>]*data-i18n="(\w+)"/)[1]);
    for (const m of js.matchAll(/\bt[f]?\('(\w+)'(?=[,)])/g)) keys.add(m[1]);
    for (const k of [...Object.values(new Function(sliceConst('public/js/calendly.js', 'CLY_ERROR_KEYS').replace(/^[^{]*/, 'return '))()), ...Object.values(new Function(sliceConst('public/js/calendly.js', 'CLY_LOG_KEYS').replace(/^[^{]*/, 'return '))()), 'src_calendly', ...js.match(/'cly_guide_\w+'/g).map(s => s.slice(1, -1)), 'cal_err_calendly']) keys.add(k);
    assert.ok(keys.size >= 40, `keys used: ${keys.size}`);
    for (const k of keys) { assert.ok(dict.en[k], `en.${k}`); assert.ok(dict.de[k], `de.${k}`); }
    const own = Object.keys(dict.en).filter(k => /^cly_|^intg_(tab|pane)_calendly|^cal_err_calendly$|^src_calendly$/.test(k));
    for (const k of own) {
      assert.ok(dict.de[k], `de.${k}`); assert.ok(keys.has(k), `${k} is used`);
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
      assert.deepEqual((dict.de[k].match(/\{\w+\}/g) || []).sort(), (dict.en[k].match(/\{\w+\}/g) || []).sort(), `${k}: the same placeholders`);
    }
    for (const m of pane.matchAll(/<(h2|h3|p|button|span)\b[^>]*>([^<]+)</g)) if (m[2].trim()) assert.match(m[0], /data-i18n=/, m[0].slice(0, 80));
  });
  test('the guide names the five permissions the connection needs, exactly as Calendly lists them, in both languages', () => {
    for (const lang of ['en', 'de']) for (const scope of ['users:read', 'event_types:read', 'scheduled_events:read', 'scheduled_events:write', 'webhooks:write']) assert.ok(dict[lang].cly_guide_step3.includes(`<code>${scope}</code>`), `${lang}: ${scope}`);
  });
});

describe('the script', () => {
  test('the Integrations page loads the Calendly status; exactly the seven routes, nothing else', () => {
    assert.match(sliceFn(intg, 'loadIntegrations', 'integrations.js'), /loadFonio\(\);\s*if \(typeof loadCalendly === 'function'\) loadCalendly\(\);/);
    assert.deepEqual([...js.matchAll(/api\.(get|post|patch|del)\('([^']+)'/g)].map(m => [m[1], m[2]]),
      [['get', '/api/integrations/calendly'], ['post', '/api/integrations/calendly/connect'], ['patch', '/api/integrations/calendly'], ['post', '/api/integrations/calendly/refresh'], ['post', '/api/integrations/calendly/register-webhook'], ['get', '/api/integrations/calendly/logs'], ['del', '/api/integrations/calendly']]);
    assert.doesNotMatch(js, /fetch\(|localStorage/, 'no raw fetch, nothing kept in the browser');
    for (const f of ['loadCalendly', 'renderCalendly', 'clyTypeLabel', 'clyErrorText', 'renderCalendlyGuide', 'toggleCalendlyGuide', 'showClyMsg', 'connectCalendly', 'saveCalendlyEventType', 'refreshCalendlyEventTypes', 'registerCalendlyWebhook', 'loadCalendlyLogs', 'disconnectCalendly']) assert.match(js, new RegExp(`^(async )?function ${f}\\(`, 'm'), f);
  });
  test('renderCalendly: the sections follow connected, can_manage and blocked_by; the token never reaches the page', () => {
    const r = sliceFn(js, 'renderCalendly', 'calendly.js');
    assert.match(r, /const c = d\.calendly, manage = !!d\.can_manage, connected = !!d\.connected && !!c, blocked = !connected && d\.blocked_by === 'calcom';/);
    assert.match(r, /show\('cly-readonly-hint', !manage\);\s*show\('cly-blocked', blocked\);\s*show\('cly-connect-section', manage && !connected && !blocked\);\s*show\('cly-none', !manage && !connected && !blocked\);/);
    assert.match(r, /show\('cly-account-section', connected\);\s*show\('cly-type-section', connected\);\s*show\('cly-actions', manage && !blocked\);\s*show\('cly-connect-btn', manage && !connected && !blocked\);\s*show\('cly-refresh-btn', manage && connected\);\s*show\('cly-register-btn', manage && connected && !c\?\.webhook_registered\);\s*show\('cly-log-section', connected\);\s*show\('cly-disconnect-btn', manage && connected\);\s*show\('cly-guide-section', manage && !blocked\);/);
    assert.match(r, /status\.className = 'badge' \+ \(connected \? ' badge-success' : ''\)/);
    assert.match(r, /<option value="\$\{esc\(x\.uri\)\}"\$\{c\.event_type && c\.event_type\.uri === x\.uri \? ' selected' : ''\}>\$\{esc\(clyTypeLabel\(x\)\)\}<\/option>/, 'the option value is the type\'s URI, escaped');
    assert.match(r, /facts\.map\(\(\[k, v\]\) => `<tr><td class="strong">\$\{esc\(k\)\}<\/td><td>\$\{esc\(v\)\}<\/td><\/tr>`\)/, 'the account facts are escaped');
    assert.match(r, /\} else \{[\s\S]*ro\.value = c\.event_type \? clyTypeLabel\(c\.event_type\) : t\('cal_no_event_types'\);/, 'members read the type from a read-only field');
    assert.match(r, /\[t\('cal_fact_webhook'\),\s*c\.webhook_registered \? t\('cal_webhook_on'\) : t\('cal_webhook_off'\) \+ \(c\.last_error \? ', ' \+ c\.last_error : ''\) \+ '\. ' \+ t\('cly_webhook_hint'\)\]/, 'the webhook row says registered, or why not');
    assert.match(r, /if \(!connected\) return;\s*loadCalendlyLogs\(\);/);
    const logs = sliceFn(js, 'loadCalendlyLogs', 'calendly.js');
    assert.doesNotMatch(logs.replace(/\$\{esc\([^`]*?\)\}/g, '').replace(/\$\{l\.status === '(error|success)' \?/g, '').replace(/\$\{\[c\.title \?[^\n]*\n/, ''), /\$\{(?!l\.error \?)/, 'everything a delivery brings is escaped');
    assert.doesNotMatch(js, /token_sealed|receive_token|webhook_secret/);
  });
  test('connect sends the token once and empties the field whatever the answer; disconnect asks first; the select saves on change', () => {
    const c = sliceFn(js, 'connectCalendly', 'calendly.js');
    assert.match(c, /if \(!token\) \{ showClyMsg\(t\('cly_token_required'\), false\); input\?\.focus\(\); return; \}/);
    assert.match(c, /await api\.post\('\/api\/integrations\/calendly\/connect', \{ token \}\);\s*if \(input\) input\.value = '';/, 'emptied before the answer is looked at');
    assert.match(c, /if \(!res \|\| res\.error\) \{ showClyMsg\(clyErrorText\(res\), false\);/); assert.match(c, /finally \{\s*if \(btn\) btn\.disabled = false;/);
    const d = sliceFn(js, 'disconnectCalendly', 'calendly.js');
    assert.match(d, /await ui\.confirm\(\{ title: t\('cal_btn_disconnect'\), message: t\('cly_confirm_disconnect'\), confirmLabel: t\('cal_btn_disconnect'\), danger: true \}\)/);
    assert.match(d, /if \(!ok\) return;\s*const res = await api\.del\('\/api\/integrations\/calendly'\);/);
    const s = sliceFn(js, 'saveCalendlyEventType', 'calendly.js');
    assert.match(s, /if \(!uri\) return;\s*const res = await api\.patch\('\/api\/integrations\/calendly', \{ event_type: uri \}\);/);
  });
  test('the Cal.com card: its connect says why while Calendly is connected, and each card re-reads the other after a connect or a disconnect', () => {
    const c = sliceFn(intg, 'connectCalcom', 'integrations.js');
    assert.match(c, /showCalMsg\(res\?\.code === 'calendly_connected' \? t\('cal_err_calendly'\) : \(res\?\.error \|\| t\('cal_err_generic'\)\), false\)/);
    assert.match(c, /calcomData = res; renderCalcom\(\);\s*if \(typeof loadCalendly === 'function'\) loadCalendly\(\);/);
    assert.match(sliceFn(intg, 'disconnectCalcom', 'integrations.js'), /calcomData = res; renderCalcom\(\);\s*if \(typeof loadCalendly === 'function'\) loadCalendly\(\);/);
  });
});

describe('the pure functions', () => {
  const STUBS = "const t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/');";
  const F = loadFns('public/js/calendly.js', ['clyTypeLabel', 'clyErrorText'], { extra: [STUBS, sliceConst('public/js/calendly.js', 'CLY_ERROR_KEYS')].join('\n') });
  test('clyTypeLabel: the name, its minutes, and a tag for a type Calendly keeps secret', () => {
    assert.equal(F.clyTypeLabel({ name: 'Erstgespräch', slug: 'erst', duration: 30, secret: false }), 'Erstgespräch (cal_minutes:30)');
    assert.equal(F.clyTypeLabel({ name: '', slug: 'erst', duration: null, secret: true }), 'erst [cly_secret_tag]');
  });
  test('clyErrorText: every code the routes answer has its sentence; scope lists the permissions; anything else is the general line', () => {
    const routes = read('routes/calendly.js');
    const codes = new Set([...routes.matchAll(/code: '(\w+)'/g)].map(m => m[1]));
    assert.deepEqual([...codes].sort(), ['calcom_connected', 'calendly_error', 'event_type', 'not_connected', 'rejected', 'reseal', 'scope', 'token_shape', 'unreachable', 'webhook']);
    for (const code of codes) assert.notEqual(F.clyErrorText({ error: 'x', code, scopes: ['a'], detail: 'd' }), 'cal_err_generic', code);
    assert.equal(F.clyErrorText({ error: 'x', code: 'scope', scopes: ['users:read', 'webhooks:write'] }), 'cly_err_scope:users:read, webhooks:write');
    assert.equal(F.clyErrorText({ error: 'x', code: 'calendly_error', detail: 'boom' }), 'cly_err_answer:boom');
    assert.equal(F.clyErrorText({ error: 'x', code: 'calcom_connected' }), 'cly_blocked');
    assert.equal(F.clyErrorText({ error: 'x', code: 'webhook', detail: 'Please upgrade' }), 'cly_err_webhook:Please upgrade');
    assert.equal(F.clyErrorText({ error: 'Owner or admin only' }), 'cal_err_generic'); assert.equal(F.clyErrorText(null), 'cal_err_generic');
  });
});

// ── Part 2: a Calendly booking is named as one wherever an activity shows its source ──
describe('the Calendly badge', () => {
  test('on the Activities page and in the calendar\'s entry detail', () => {
    assert.match(read('public/js/objects.js'), /\$\{a\.source === 'calendly' \? `<span class="badge badge-outline" title="\$\{esc\(t\('src_calendly'\)\)\}">\$\{esc\(t\('src_calendly'\)\)\}<\/span>` : ''\}/);
    assert.match(read('public/js/calendar.js'), /\$\{e\.source === 'calendly' \? `<span class="badge badge-outline">\$\{esc\(t\('src_calendly'\)\)\}<\/span>` : ''\}/);
    assert.equal((read('routes/calendar.js').match(/a\.source AS source/g) || []).length, 2, 'the calendar hands the source to the page');
  });
});
