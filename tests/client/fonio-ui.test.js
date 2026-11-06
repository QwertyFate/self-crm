// CLIENT (static) tests for the fonio tab on the Integrations page (FONIO_CHANGES Parts 2 and 5). No browser: the
// markup is asserted as text and the pure functions are sliced out of public/js/integrations.js and run with the real
// English dictionary. Pinned: the rail tab and its icon; every element the code reads is in the pane; every text has
// its data-i18n; the tab talks to exactly its five routes and puts nothing unescaped into the page; every status,
// reason, trigger and day the server can send has its label in both languages; every refusal the server names has
// its own sentence; the form becomes the right PUT body (the key only when typed); a call's row escapes what people
// and fonio typed, and offers cancel only to owners/admins on a waiting call.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/integrations.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pane = html.slice(html.indexOf('<div id="intg-pane-fonio"'), html.indexOf('<!-- ── Workspaces page ── -->'));
const pageStart = html.indexOf('<section id="page-integrations"');
const rail = html.slice(pageStart, html.indexOf('<div class="settings-tab-body">', pageStart));
const block = js.slice(js.indexOf('// ── fonio.ai'));
const server = read('utils/fonio-calls.js') + read('routes/fonio.js');
const both = k => k in dict.en && k in dict.de;

describe('markup', () => {
  test('the rail: a separator, then the fonio tab, the last one; its icon is a phone', () => {
    assert.match(rail, /<div class="settings-tab-sep" aria-hidden="true"><\/div>\n\s*<button class="settings-tab" data-tab="fonio"\s+onclick="switchIntgTab\('fonio'\)"\s+data-i18n="intg_tab_fonio">fonio<\/button>\n\s*<\/nav>/);
    assert.match(css, /^\.settings-tab\[data-tab="fonio"\]::before \{ --ico: url\("data:image\/svg\+xml;[^"]*M22 16\.9v3[^"]*"\); \}$/m);
  });

  test('every element the code reads is in the pane', () => {
    const ids = ['fonio-card', 'fonio-status', 'fonio-readonly-hint', 'fonio-facts', 'fonio-key', 'fonio-from', 'fonio-active', 'fonio-on-manual',
      'fonio-on-webhook', 'fonio-delay', 'fonio-cc', 'fonio-prefixes', 'fonio-hours-on', 'fonio-days', 'fonio-hours-from', 'fonio-hours-to',
      'fonio-hours-tz', 'fonio-actions', 'fonio-save-btn', 'fonio-remove-btn', 'fonio-msg', 'fonio-detail', 'fonio-calls-card', 'fonio-calls'];
    for (const id of ids) assert.ok(pane.includes(`id="${id}"`), `missing #${id}`);
    for (const m of block.matchAll(/getElementById\('([a-z-]+)'\)|\$\('([a-z-]+)'\)/g)) {
      const id = m[1] || m[2];
      assert.ok(pane.includes(`id="${id}"`), `the code reads #${id}, which the pane does not have`);
    }
  });

  test('the key is a masked text field, so the browser never offers to save it as a password', () => {
    assert.match(pane, /<input type="text" id="fonio-key" class="intg-url-input intg-secret-input" autocomplete="off" spellcheck="false"/);
  });

  test('the actions start hidden (members never see them); the hours take times; the delay a number 0–10080', () => {
    assert.match(pane, /<div class="settings-card-actions hidden" id="fonio-actions">/);
    assert.match(pane, /<button class="btn btn-sm btn-danger hidden" id="fonio-remove-btn" onclick="removeFonio\(\)"/);
    assert.match(pane, /<input type="time" id="fonio-hours-from"/);
    assert.match(pane, /<input type="time" id="fonio-hours-to"/);
    assert.match(pane, /<input type="number" id="fonio-delay" class="form-control" min="0" max="10080" step="1" \/>/);
  });

  test('every text in the pane carries its data-i18n', () => {
    for (const m of pane.matchAll(/<(h2|h3|p|button|span|label)\b[^>]*>([^<]+)</g)) if (m[2].trim()) assert.match(m[0], /data-i18n=/, m[0].slice(0, 80));
  });
});

describe('code', () => {
  test('loadIntegrations loads the tab; the tab uses its five routes and nothing else; no raw fetch; nothing unescaped into innerHTML', () => {
    assert.match(sliceFn(js, 'loadIntegrations', 'integrations.js'), /loadNotetakerAi\(\);\s*loadFonio\(\);/);
    const routes = [...block.matchAll(/api\.(get|post|put|patch|del)\(([`'])([^`']+)\2/g)].map(m => `${m[1]} ${m[3]}`);
    assert.deepEqual([...new Set(routes)].sort(), [
      'del /api/integrations/fonio', 'get /api/integrations/fonio', 'get /api/integrations/fonio/calls',
      'post /api/integrations/fonio/calls/${Number(id)}/cancel', 'put /api/integrations/fonio',
    ]);
    assert.doesNotMatch(block, /fetch\(|innerHTML = [^`]*\$\{(?!esc\()/);
    assert.doesNotMatch(sliceFn(js, 'renderFonio', 'integrations.js'), /api_key|sealed/, 'render never touches a key');
  });

  test('members get every input disabled; the day buttons only toggle for owners/admins', () => {
    const fn = sliceFn(js, 'renderFonio', 'integrations.js');
    assert.match(fn, /card\.querySelectorAll\('input'\)\.forEach\(el => \{ el\.disabled = !manage; \}\)/);
    assert.match(fn, /if \(b && manage\) toggleFonioDay/);
  });
});

describe('Active is the main switch (the triggers only count once it is on)', () => {
  test('markup: Active re-checks on every change; the paused line follows it, hidden at first', () => {
    assert.match(pane, /<input type="checkbox" id="fonio-active" class="switch" onchange="updateFonioActive\(\)">/);
    assert.match(pane, /id="fonio-active"[^\n]*\n\s*<p class="help hidden" id="fonio-paused-hint" data-i18n="fonio_paused_hint">/);
    assert.match(sliceFn(js, 'renderFonio', 'integrations.js'), /el\.disabled = !manage; \}\);\s*updateFonioActive\(\);/, 'after the member lock, so it has the last word on the triggers');
    assert.match(css, /^\.switch-row:has\(> input\.switch:disabled\) \{ color: var\(--text-3\); cursor: default; \}/m, 'the label greys out too');
  });

  const G = loadFns('public/js/integrations.js', ['updateFonioActive'], { state: { document: null, fonioData: null } });
  function page(active) {
    const hint = { hidden: true, classList: { toggle(_c, on) { hint.hidden = on; } } };
    const els = { 'fonio-active': { checked: active }, 'fonio-on-manual': { disabled: false }, 'fonio-on-webhook': { disabled: false }, 'fonio-paused-hint': hint };
    G.__set('document', { getElementById: id => els[id] || null });
    return els;
  }

  test('owner, Active off: both triggers greyed out, the paused line shown', () => {
    G.__set('fonioData', { can_manage: true });
    const els = page(false);
    G.updateFonioActive();
    assert.deepEqual([els['fonio-on-manual'].disabled, els['fonio-on-webhook'].disabled, els['fonio-paused-hint'].hidden], [true, true, false]);
  });
  test('owner, Active on: the triggers can be changed, no paused line', () => {
    G.__set('fonioData', { can_manage: true });
    const els = page(true);
    G.updateFonioActive();
    assert.deepEqual([els['fonio-on-manual'].disabled, els['fonio-on-webhook'].disabled, els['fonio-paused-hint'].hidden], [false, false, true]);
  });
  test('member: the triggers stay read-only even with Active on', () => {
    G.__set('fonioData', { can_manage: false });
    const els = page(true);
    G.updateFonioActive();
    assert.deepEqual([els['fonio-on-manual'].disabled, els['fonio-on-webhook'].disabled], [true, true]);
  });
});

describe('every label the server can ask for, in both languages', () => {
  test('the seven days', () => { for (let d = 1; d <= 7; d++) assert.ok(both(`fonio_day_${d}`), d); });
  test("every status in fonio_calls' CHECK", () => {
    const check = /status\s+TEXT NOT NULL DEFAULT 'scheduled' CHECK \(status IN \(([^)]+)\)\)/.exec(read('db.js'));
    const statuses = [...check[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
    assert.equal(statuses.length, 6);
    for (const s of statuses) assert.ok(both(`fonio_call_status_${s}`), s);
  });
  test('both triggers', () => { for (const tr of ['deal_manual', 'deal_webhook']) assert.ok(both(`fonio_trigger_${tr}`), tr); });
  test('every reason the queue or the route writes', () => {
    // the queue writes a call's reason; the route only through cancelWaiting (its other reasons are the form's)
    const queue = read('utils/fonio-calls.js');
    const reasons = new Set([
      ...[...queue.matchAll(/reason(?::| =) '([a-z_]+)'/g)].map(m => m[1]),
      ...[...queue.matchAll(/skip\('([a-z_]+)'/g)].map(m => m[1]),
      ...[...server.matchAll(/cancelWaiting\([^)]*'([a-z_]+)'/g)].map(m => m[1]),
    ]);
    for (const r of ['no_contact', 'no_phone', 'bad_number', 'number_not_allowed', 'already_scheduled', 'no_hours', 'inactive', 'disconnected', 'by_user', 'interrupted', 'fonio', 'key', 'error']) {
      assert.ok(reasons.has(r), `${r} is no longer written by the server — drop it here`);
    }
    for (const r of reasons) {
      if (r === 'not_waiting') continue;   // the cancel route's 409, said by fonio_call_not_waiting
      assert.ok(both(`fonio_reason_${r}`), `fonio_reason_${r}`);
    }
  });
});

const F = loadFns('public/js/integrations.js', ['readFonioForm', 'fonioErrorText', 'fonioCallHtml'], {
  state: { currentLang: 'en' },
  extra: `${sliceConst('public/js/integrations.js', 'FONIO_CALL_BADGE')}
    const t = k => { const v = globalThis.__fonioDict.en[k]; if (v === undefined) throw new Error('no key ' + k); return v; };
    const tf = (k, o) => t(k).replace(/\\{(\\w+)\\}/g, (_, n) => o[n]);
    ${sliceFn(read('public/js/core.js'), 'esc', 'core.js')}`,
});
globalThis.__fonioDict = dict;

describe('readFonioForm: the form as the PUT body', () => {
  const form = {
    key: '', from: ' +49 30 123456 ', active: true, onManual: true, onWebhook: false, delay: '15', cc: ' +49 ',
    prefixes: '+49 15, 0171;0160\n', hoursOn: true, days: [5, 1, 3], hoursFrom: '09:00', hoursTo: '18:00',
  };
  test('trims, splits the number starts on commas, sorts the days; no key typed, no key sent', () => {
    assert.deepEqual(F.readFonioForm(form), {
      from_number: '+49 30 123456', active: true, on_deal_manual: true, on_deal_webhook: false, delay_minutes: 15,
      country_code: '+49', number_prefixes: ['+49 15', '0171', '0160'], hours_on: true, hours_days: [1, 3, 5],
      hours_from: '09:00', hours_to: '18:00',
    });
  });
  test('a typed key is sent, trimmed', () => assert.equal(F.readFonioForm({ ...form, key: '  fonio_live_abc  ' }).api_key, 'fonio_live_abc'));
  test('an empty delay is sent as not-a-number, so the server refuses it instead of reading 0', () => {
    assert.ok(Number.isNaN(F.readFonioForm({ ...form, delay: '' }).delay_minutes));
  });
});

describe('fonioErrorText: every refusal the server names has its own sentence', () => {
  test('each reason of routes/fonio.js and of the key check', () => {
    const reasons = new Set([...read('routes/fonio.js').matchAll(/reason: '([a-z_]+)'/g)].map(m => m[1]));
    for (const r of ['key', 'refused', 'unreachable']) reasons.add(r);   // utils/fonio.js testKey
    for (const r of ['active', 'on_deal_manual', 'on_deal_webhook', 'hours_on', 'not_waiting']) reasons.delete(r);   // switches the form always sends right; the cancel route's own
    for (const r of reasons) assert.notEqual(F.fonioErrorText({ reason: r }), dict.en.fonio_err_generic, r);
    assert.equal(F.fonioErrorText({ reason: 'whatever' }), dict.en.fonio_err_generic);
    assert.equal(F.fonioErrorText(null), dict.en.fonio_err_generic);
  });
});

describe("fonioCallHtml: one call's row", () => {
  const call = (over = {}) => ({ id: 4, trigger: 'deal_webhook', status: 'sent', reason: null, raw_number: '0171 1234567', to_number: '+491711234567',
    message: 'Call initiated', due_at: '2026-11-06T09:05:00.000Z', sent_at: '2026-11-06T09:05:20.000Z', created_at: '2026-11-06T09:00:00.000Z',
    contact_name: 'Erika Muster', deal_title: 'Erika Muster', cancelled_by_name: null, ...over });

  test('status, number, trigger and fonio\'s words; the deal title only when it differs from the contact', () => {
    const out = F.fonioCallHtml(call(), true);
    assert.match(out, /intg-log-badge success">Called</);
    assert.match(out, /\+491711234567/);
    assert.match(out, /Deal from the webhook/);
    assert.match(out, /fonio says: Call initiated/);
    assert.doesNotMatch(out, /Erika Muster · Erika Muster/);
    assert.match(F.fonioCallHtml(call({ deal_title: 'Kitchen' }), true), /Erika Muster · Kitchen/);
  });

  test('a waiting call shows when it is due; cancel only for owners/admins, with the numeric id', () => {
    const waiting = call({ status: 'scheduled', sent_at: null, message: null });
    assert.match(F.fonioCallHtml(waiting, true), /Due /);
    assert.match(F.fonioCallHtml(waiting, true), /onclick="cancelFonioCall\(4, this\)">Cancel call</);
    assert.doesNotMatch(F.fonioCallHtml(waiting, false), /cancelFonioCall/);
    assert.doesNotMatch(F.fonioCallHtml(call(), true), /cancelFonioCall/, 'a call already made cannot be cancelled');
    assert.match(F.fonioCallHtml({ ...waiting, id: '4);alert(1);//' }, true), /cancelFonioCall\(NaN, this\)/);
  });

  test('the reason in words; "by_user" names who cancelled', () => {
    assert.match(F.fonioCallHtml(call({ status: 'skipped', reason: 'no_phone', message: null }), true), /The contact has no phone number/);
    assert.match(F.fonioCallHtml(call({ status: 'cancelled', reason: 'by_user', cancelled_by_name: 'Olaf' }), true), /Cancelled by Olaf/);
  });

  test('what people and fonio typed cannot inject markup', () => {
    const out = F.fonioCallHtml(call({ contact_name: '<img src=x onerror=alert(1)>', deal_title: '<script>x</script>', message: '<b>hi</b>', to_number: '"><svg>' }), true);
    for (const raw of ['<img', '<script>', '<b>', '<svg>']) assert.ok(!out.includes(raw), raw);
  });
});
