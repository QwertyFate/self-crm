// CLIENT (static) tests for the fonio tab on the Integrations page (FONIO_CHANGES Parts 2 and 5). No browser: the
// markup is asserted as text and the pure functions are sliced out of public/js/integrations.js and run with the real
// English dictionary. Pinned: the rail tab and its icon; every element the code reads is in the pane; every text has
// its data-i18n; the tab talks to exactly its six routes and puts nothing unescaped into the page; every status,
// reason, trigger and day the server can send has its label in both languages; every refusal the server names has
// its own sentence; the form becomes the right PUT body (the key only when typed); a call's row escapes what people
// and fonio typed, and offers cancel only to owners/admins on a waiting call.
// Part 8: the result card (the link fonio posts to, the Body to paste, the last delivery) shows only when the
// server sent a link, which it does for owners/admins with a saved connection; the Body's names are ones the
// server reads; every delivery outcome the server records has its words in both languages.
// Part 14: the variables card. A pasted prompt's placeholders become rows (a name from their words, a CRM value
// where the words say so), the prompt comes back with the connected ones as {{name}}, only rows with a name and a
// value are saved, every source the server offers has its label, and what people typed cannot inject markup.
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
      'fonio-hours-tz', 'fonio-actions', 'fonio-save-btn', 'fonio-remove-btn', 'fonio-msg', 'fonio-detail', 'fonio-calls-card', 'fonio-calls',
      'fonio-result-card', 'fonio-result-url', 'fonio-result-body', 'fonio-result-last',
      'fonio-vars-card', 'fonio-vars-prompt', 'fonio-vars-found', 'fonio-vars-rows', 'fonio-vars-out-wrap', 'fonio-vars-out', 'fonio-vars-msg'];
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
  test('loadIntegrations loads the tab; the tab uses its six routes and nothing else; no raw fetch; nothing unescaped into innerHTML', () => {
    assert.match(sliceFn(js, 'loadIntegrations', 'integrations.js'), /loadNotetakerAi\(\);\s*loadFonio\(\);/);
    const routes = [...block.matchAll(/api\.(get|post|put|patch|del)\(([`'])([^`']+)\2/g)].map(m => `${m[1]} ${m[3]}`);
    assert.deepEqual([...new Set(routes)].sort(), [
      'del /api/integrations/fonio', 'get /api/integrations/fonio', 'get /api/integrations/fonio/calls', 'get /api/integrations/fonio/sources',
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
  test('the variables card says which free-time variables every call carries while a booking service is connected (Part 29)', () => {
    assert.match(pane, /<p class="settings-hint" data-i18n="fonio_vars_slots_hint">[^<]+<\/p>/);
    for (const lang of ['en', 'de']) for (const name of ['{{freie_termine}}', '{{freie_termine_json}}', '{{heute}}']) assert.ok(dict[lang].fonio_vars_slots_hint.includes(name), `${lang}: ${name}`);
    const names = require('../../utils/fonio-calls').SLOT_NAMES;
    assert.deepEqual(names, { text: ['freie_termine', 'free_times'], json: ['freie_termine_json', 'free_times_json'], today: ['heute', 'today'] });
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
    reasons.delete('inbound');   // the result link's answer to fonio (Part 7), never shown on the page
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

describe('the result card (Part 8): the link, the Body for fonio, the last delivery', () => {
  const bodySrc = js.match(/const FONIO_RESULT_BODY = JSON\.stringify\(\{[\s\S]*?\}, null, 2\);/)[0];
  const R = loadFns('public/js/integrations.js', ['renderFonioResult', 'fonioDeliveryText'], {
    state: { currentLang: 'en', fonioData: null, document: null },
    extra: `${bodySrc}
      ${sliceConst('public/js/integrations.js', 'FONIO_DELIVERY_OUTCOMES')}
      const t = k => { const v = globalThis.__fonioDict.en[k]; if (v === undefined) throw new Error('no key ' + k); return v; };
      const tf = (k, o) => t(k).replace(/\\{(\\w+)\\}/g, (_, n) => o[n]);
      function __body() { return FONIO_RESULT_BODY; }`,
    expose: ['__body'],
  });
  function page() {
    const card = { hidden: true, classList: { toggle(_c, on) { card.hidden = on; } } };
    const els = { 'fonio-result-card': card, 'fonio-result-url': { value: '' }, 'fonio-result-body': { textContent: '' }, 'fonio-result-last': { textContent: '' } };
    R.__set('document', { getElementById: id => els[id] || null });
    return els;
  }
  const LINK = 'https://crm.example/api/integrations/fonio/receive/' + 'a'.repeat(64);

  test('markup: the card starts hidden, the link is read-only, both copy buttons copy', () => {
    assert.match(pane, /<div class="settings-card hidden" id="fonio-result-card">/);
    assert.match(pane, /<input type="text" id="fonio-result-url" readonly class="intg-url-input" \/>\s*<button class="btn btn-sm" onclick="copyIntgText\(this, document\.getElementById\('fonio-result-url'\)\.value\)" data-i18n="btn_copy">/);
    assert.match(pane, /<div class="intg-json-block">[\s\S]*?onclick="copyIntgJson\(this\)"[\s\S]*?<pre class="intg-code" id="fonio-result-body"><\/pre>/);
    assert.ok(pane.indexOf('id="fonio-result-card"') > pane.indexOf('id="fonio-card"') && pane.indexOf('id="fonio-result-card"') < pane.indexOf('id="fonio-calls-card"'), 'between the connection and the calls');
  });

  test('renderFonio draws it, also when nothing is connected (before the early return)', () => {
    const fn = sliceFn(js, 'renderFonio', 'integrations.js');
    assert.ok(fn.indexOf('renderFonioResult();') > 0 && fn.indexOf('renderFonioResult();') < fn.indexOf("if (!set) { facts.innerHTML = ''; return; }"));
  });

  test('owner with a connection: the link, the Body and the last delivery are filled in', () => {
    const els = page();
    R.__set('fonioData', { configured: true, can_manage: true, settings: { receive_url: LINK, last_delivery: null } });
    R.renderFonioResult();
    assert.equal(els['fonio-result-card'].hidden, false);
    assert.equal(els['fonio-result-url'].value, LINK);
    assert.equal(els['fonio-result-body'].textContent, R.__body());
    assert.equal(els['fonio-result-last'].textContent, 'Nothing has arrived from fonio yet.');
  });

  test('hidden for a member, without a connection, and without a link', () => {
    for (const data of [
      { configured: true, can_manage: false, settings: { receive_url: LINK } },
      { configured: false, can_manage: true, settings: { receive_url: LINK } },
      { configured: true, can_manage: true, settings: { receive_url: null } },
      null,
    ]) {
      const els = page();
      els['fonio-result-card'].hidden = false;
      R.__set('fonioData', data);
      R.renderFonioResult();
      assert.equal(els['fonio-result-card'].hidden, true, JSON.stringify(data));
      assert.equal(els['fonio-result-url'].value, '', 'no link written into a hidden card');
    }
  });

  test('the Body is JSON whose names the server reads; the person and agent numbers are found by shape', () => {
    const body = JSON.parse(R.__body());
    const fr = require('../../utils/fonio-result');
    const filled = Object.fromEntries(Object.keys(body).map(k => [k, 'x']));
    Object.assign(filled, { crm_call_id: '7', conversation_link: 'https://app.fonio.ai/c/1', person_number: '+491711234567', agent_number: '+4930123456' });
    assert.deepEqual(fr.readResult(filled, '+4930123456'), { crmCallId: 7, conversationId: 'x', link: 'https://app.fonio.ai/c/1', direction: 'x', inbound: false,
      duration: 'x', summary: 'x', transcript: 'x', numbers: ['+491711234567'], name: 'x', meeting: null });
    assert.deepEqual(Object.keys(body), ['crm_call_id', 'conversation_id', 'conversation_link', 'direction', 'person_number', 'agent_number', 'caller_name', 'meeting_booked', 'meeting_date', 'meeting_time', 'meeting_email', 'duration', 'summary', 'transcript']);
    // Part 28: the three meeting names are read too; left as fonio's unfilled placeholders they are no meeting
    assert.deepEqual(fr.readResult({ ...filled, meeting_booked: 'yes', meeting_date: '2026-11-20', meeting_time: '14:00' }, '+4930123456').meeting, { date: '2026-11-20', time: '14:00', email: null, said: '2026-11-20 14:00' });
    assert.equal(fr.readResult(body, '+4930123456').meeting, null);
    for (const lang of ['en', 'de']) for (const k of ['meeting_booked', 'meeting_date', 'meeting_time', 'meeting_email']) assert.ok(dict[lang].fonio_result_body_hint.includes(k), `${lang}: the hint says what ${k} is`);
    for (const k of ['notif_meeting_failed']) { assert.ok(dict.en[k]); assert.ok(dict.de[k]); }
  });

  test('every outcome the server records has its words in both languages; the list here matches the server', () => {
    const recorded = new Set([...server.matchAll(/outcome: '([a-z_]+)'|remember\('([a-z_]+)'\)/g)].map(m => m[1] || m[2]));
    const listed = new Function(sliceConst('public/js/integrations.js', 'FONIO_DELIVERY_OUTCOMES').replace(/^[^[]*/, 'return '))();
    assert.deepEqual([...recorded].sort(), [...listed].sort());
    for (const o of [...listed, 'other']) assert.ok(both(`fonio_delivery_${o}`), o);
    for (const k of ['fonio_result_title', 'fonio_result_hint', 'fonio_result_link_label', 'fonio_result_link_hint', 'fonio_result_body_label',
      'fonio_result_body_name', 'fonio_result_body_hint', 'fonio_result_last_none', 'fonio_result_last', 'fonio_delivery_fields']) assert.ok(both(k), k);
  });

  test('the last delivery: when, what happened, the field names; an unknown outcome is just "received"', () => {
    const at = '2026-11-10T09:05:00.000Z', date = new Date(at).toLocaleString('en-GB');
    assert.equal(R.fonioDeliveryText({ at, outcome: 'noted', call_id: 4, fields: ['summary', 'transcript'] }), `Last delivery ${date}: note written. Fields: summary, transcript`);
    assert.equal(R.fonioDeliveryText({ at, outcome: 'bad_json', fields: [] }), `Last delivery ${date}: the Body was not valid JSON.`);
    assert.equal(R.fonioDeliveryText({ at, outcome: 'something_new' }), `Last delivery ${date}: received.`);
    assert.equal(R.fonioDeliveryText(null), 'Nothing has arrived from fonio yet.');
    assert.equal(R.fonioDeliveryText({}), 'Nothing has arrived from fonio yet.');
  });
});

describe('the variables card (Part 14): a prompt\'s placeholders connected to CRM values', () => {
  const fnNames = ['fonioVarKey', 'fonioFindPlaceholders', 'fonioSuggestSource', 'fonioRowsFromPrompt', 'fonioConvertPrompt', 'fonioVarsBody',
    'fonioVarOptions', 'fonioVarRowHtml', 'renderFonioVars', 'renderFonioVarsOut', 'resetFonioVars'];
  const V = loadFns('public/js/integrations.js', fnNames, {
    state: { fonioData: null, fonioVars: [], fonioVarSources: null, fonioVarsPrompt: '', document: null },
    extra: `${sliceConst('public/js/integrations.js', 'FONIO_VAR_HINTS')}
      ${sliceConst('public/js/integrations.js', 'FONIO_VAR_CALENDAR')}
      const FONIO_PLACEHOLDER = ${js.match(/const FONIO_PLACEHOLDER = (\/.*\/g);/)[1]};
      const t = k => { const v = globalThis.__fonioDict.en[k]; if (v === undefined) throw new Error('no key ' + k); return v; };
      ${sliceFn(read('public/js/core.js'), 'esc', 'core.js')}`,
  });
  const VALUES = require('../../utils/fonio-calls').VALUE_SOURCES;
  test('the calendar\'s free times and today are values a prompt\'s name can be connected to (Part 32): suggested for the usual names, in a group of their own', () => {
    for (const v of ['free_times', 'free_times_json', 'today']) assert.ok(VALUES.includes(v), v);
    const src = { values: VALUES, contact_fields: [], deal_fields: [] };
    for (const [key, want] of [['freie_termine', 'value:free_times'], ['freie_zeiten', 'value:free_times'], ['free_times', 'value:free_times'], ['freie_termine_json', 'value:free_times_json'], ['heute', 'value:today'], ['today', 'value:today'], ['heutiges_datum', 'value:today']]) assert.equal(V.fonioSuggestSource(key, src), want, key);
    const options = V.fonioVarOptions('value:free_times', src);
    assert.match(options, /<optgroup label="Calendar \(Cal\.com or Calendly\)"><option value="value:free_times" selected>Free times, as text<\/option><option value="value:free_times_json">Free times, as a list \(JSON\)<\/option><option value="value:today">Today's date<\/option><\/optgroup>$/);
    assert.doesNotMatch(options.slice(0, options.indexOf('Calendar (')), /value:free_times|value:today/, 'not among the contact\'s values');
    for (const k of ['fonio_var_group_calendar', 'fonio_var_src_free_times', 'fonio_var_src_free_times_json', 'fonio_var_src_today']) { assert.ok(dict.en[k], k); assert.ok(dict.de[k], k); }
  });
  const SRC = { values: VALUES, contact_fields: [{ key: 'eigenkapital', name: 'Eigenkapital' }, { key: 'cf_7', name: 'Warum in Immobilien investieren?' }],
    deal_fields: [{ key: 'budget', name: 'Budget' }] };
  const PROMPT = 'Spreche ich mit {Vorname Nachname}?\nAnfrage vom {Anfragedatum}. Adresse: {Adresse, Teil für Teil}.\nBeim Eigenkapital {Spanne}, {Eigenkapital}. Danke, {Vorname Nachname}. Schon da: {{email}}. Termin {freie Zeit 1}.';

  test('markup: the card starts hidden; find, add and save call their functions; the converted prompt starts hidden', () => {
    assert.match(pane, /<div class="settings-card hidden" id="fonio-vars-card">/);
    assert.match(pane, /<textarea id="fonio-vars-prompt"[^>]*data-i18n-ph="fonio_vars_prompt_ph"><\/textarea>/);
    for (const call of ['fonioVarsFromPrompt()', 'addFonioVar()', 'saveFonioVars(this)']) assert.ok(pane.includes(`onclick="${call}"`), call);
    assert.match(pane, /<div class="intg-section hidden" id="fonio-vars-out-wrap">/);
    assert.match(pane, /<pre class="intg-code fonio-vars-out" id="fonio-vars-out"><\/pre>/);
    assert.match(css, /^\.fonio-var-row \{ display: grid;/m);
  });

  test('fonioVarKey: words as a variable name', () => {
    assert.equal(V.fonioVarKey('Vorname Nachname'), 'vorname_nachname');
    assert.equal(V.fonioVarKey('Adresse, Teil für Teil'), 'adresse_teil_fuer_teil');
    assert.equal(V.fonioVarKey('E-Mail'), 'e_mail');
    assert.equal(V.fonioVarKey('1. Wahl'), 'v_1_wahl');
    assert.equal(V.fonioVarKey('crm_call_id'), 'v_crm_call_id');
    assert.equal(V.fonioVarKey('x'.repeat(80)).length, 60);
    assert.equal(V.fonioVarKey('???'), '');
  });

  test('the names it makes are names the server accepts', () => {
    const { checkVariables } = require('../../utils/fonio-calls');
    for (const words of ['Vorname Nachname', 'Adresse, Teil für Teil', '1. Wahl', 'crm_call_id', 'x'.repeat(80), 'Größe (m²)']) {
      assert.ok(checkVariables([{ name: V.fonioVarKey(words), source: 'value:name' }]).value, words);
    }
  });

  test('fonioFindPlaceholders: single and double braces, each once, in order; JSON-like text across lines is not one', () => {
    assert.deepEqual(V.fonioFindPlaceholders(PROMPT).map(p => p.text),
      ['{Vorname Nachname}', '{Anfragedatum}', '{Adresse, Teil für Teil}', '{Spanne}', '{Eigenkapital}', '{{email}}', '{freie Zeit 1}']);
    assert.deepEqual(V.fonioFindPlaceholders('{{ vorname }} {}  {\n"a": 1\n}'), [{ text: '{{ vorname }}', inner: 'vorname', double: true }]);
    assert.deepEqual(V.fonioFindPlaceholders('{ Name }'), [{ text: '{ Name }', inner: 'Name', double: false }]);
    assert.deepEqual(V.fonioFindPlaceholders(''), []);
  });

  test('fonioSuggestSource: a built-in by its own name or a usual word, a custom field by its name; nothing when the name does not say', () => {
    assert.equal(V.fonioSuggestSource('email', SRC), 'value:email');
    assert.equal(V.fonioSuggestSource('vorname_nachname', SRC), 'value:name');
    assert.equal(V.fonioSuggestSource('anfragedatum', SRC), 'value:request_date');
    assert.equal(V.fonioSuggestSource('e_mail', SRC), 'value:email');
    assert.equal(V.fonioSuggestSource('eigenkapital', SRC), 'contact_field:eigenkapital');
    assert.equal(V.fonioSuggestSource('warum_in_immobilien_investieren', SRC), 'contact_field:cf_7');
    assert.equal(V.fonioSuggestSource('budget', SRC), 'deal_field:budget');
    assert.equal(V.fonioSuggestSource('deal_budget', SRC), 'deal_field:budget');
    for (const k of ['spanne', 'freie_zeit_1', 'adresse_teil_fuer_teil', '']) assert.equal(V.fonioSuggestSource(k, SRC), '', k);
    assert.equal(V.fonioSuggestSource('email', null), '');
    for (const target of Object.values(new Function(sliceConst('public/js/integrations.js', 'FONIO_VAR_HINTS').replace(/^[^{]*/, 'return '))())) assert.ok(VALUES.includes(target), target);
  });

  test('fonioRowsFromPrompt: one row per placeholder, suggestions filled in, saved rows kept and tied to their {{name}}; twice adds nothing', () => {
    const saved = [{ name: 'email', source: 'value:email', from: '' }, { name: 'spanne', source: 'contact_field:eigenkapital', from: '' }];
    const first = V.fonioRowsFromPrompt(PROMPT, saved, SRC);
    assert.equal(first.added, 6);
    assert.deepEqual(first.rows, [
      { name: 'email', source: 'value:email', from: '{{email}}' },
      { name: 'spanne', source: 'contact_field:eigenkapital', from: '' },
      { name: 'vorname_nachname', source: 'value:name', from: '{Vorname Nachname}' },
      { name: 'anfragedatum', source: 'value:request_date', from: '{Anfragedatum}' },
      { name: 'adresse_teil_fuer_teil', source: '', from: '{Adresse, Teil für Teil}' },
      { name: 'spanne_2', source: '', from: '{Spanne}' },
      { name: 'eigenkapital', source: 'contact_field:eigenkapital', from: '{Eigenkapital}' },
      { name: 'freie_zeit_1', source: '', from: '{freie Zeit 1}' },
    ]);
    assert.deepEqual(saved[0], { name: 'email', source: 'value:email', from: '' }, 'the rows passed in are not changed');
    const again = V.fonioRowsFromPrompt(PROMPT, first.rows, SRC);
    assert.equal(again.added, 0);
    assert.deepEqual(again.rows, first.rows);
    // a single-brace placeholder is never tied to a saved row of the same words: it gets its own row
    assert.deepEqual(V.fonioRowsFromPrompt('{ email }', [{ name: 'email', source: 'value:email', from: '' }], SRC).rows.map(r => r.name), ['email', 'email_2']);
  });

  test('fonioConvertPrompt: connected placeholders become {{name}} everywhere; unconnected ones and {{…}} already there stay', () => {
    const rows = V.fonioRowsFromPrompt(PROMPT, [], SRC).rows;
    rows.find(r => r.from === '{Adresse, Teil für Teil}').source = 'value:email';
    rows.find(r => r.from === '{Adresse, Teil für Teil}').name = ' email_adresse ';
    assert.equal(V.fonioConvertPrompt(PROMPT, rows),
      'Spreche ich mit {{vorname_nachname}}?\nAnfrage vom {{anfragedatum}}. Adresse: {{email_adresse}}.\nBeim Eigenkapital {Spanne}, {{eigenkapital}}. Danke, {{vorname_nachname}}. Schon da: {{email}}. Termin {freie Zeit 1}.');
    assert.equal(V.fonioConvertPrompt('{name} and {{name}}', [{ name: 'kunde', source: 'value:name', from: '{name}' }]), '{{kunde}} and {{name}}');
    assert.equal(V.fonioConvertPrompt(PROMPT, []), PROMPT);
  });

  test('fonioVarsBody: only rows with a name and a CRM value, trimmed, without the placeholder', () => {
    assert.deepEqual(V.fonioVarsBody([{ name: ' a ', source: 'value:name', from: '{A}' }, { name: 'b', source: '', from: '{B}' }, { name: '  ', source: 'value:email', from: '' }]),
      [{ name: 'a', source: 'value:name' }]);
  });

  test('every source the server offers has its label in both languages; so do the groups and the card\'s texts', () => {
    for (const v of VALUES) assert.ok(both(`fonio_var_src_${v}`), v);
    for (const k of ['fonio_var_src_none', 'fonio_var_missing', 'fonio_var_group_contact', 'fonio_var_group_deal', 'fonio_var_group_contact_fields',
      'fonio_var_group_deal_fields', 'fonio_vars_found', 'fonio_vars_found_none', 'fonio_vars_none', 'fonio_vars_saved', 'fonio_var_name_label',
      'fonio_var_name_ph', 'fonio_var_source_label', 'fonio_var_remove', 'fonio_err_variables']) assert.ok(both(k), k);
  });

  test('a row: the placeholder, the name, the chosen value selected; a field that is gone says so; nothing typed injects markup', () => {
    const row = V.fonioVarRowHtml({ name: 'spanne', source: 'contact_field:eigenkapital', from: '{Spanne}' }, 2, SRC);
    assert.match(row, /<span class="fonio-var-from">\{Spanne\}<\/span>/);
    assert.match(row, /value="spanne"[^>]*oninput="setFonioVar\(2, 'name', this\.value\)"/);
    assert.match(row, /<option value="contact_field:eigenkapital" selected>Eigenkapital<\/option>/);
    assert.match(row, /<optgroup label="Custom deal fields"><option value="deal_field:budget">Budget<\/option><\/optgroup>/);
    assert.match(row, /<option value="value:first_name">First name<\/option>/);
    assert.equal((row.match(/ selected>/g) || []).length, 1);
    assert.match(V.fonioVarRowHtml({ name: 'x', source: 'deal_field:gone', from: '' }, 0, SRC), /<option value="deal_field:gone" selected>Field no longer exists<\/option>/);
    assert.match(V.fonioVarRowHtml({ name: 'x', source: '', from: '' }, 0, SRC), /<option value="" selected>Not from the CRM<\/option>/);
    const evil = '"><img src=x onerror=alert(1)>';
    const out = V.fonioVarRowHtml({ name: evil, source: evil, from: `{${evil}}` }, 0, { values: VALUES, contact_fields: [{ key: evil, name: evil }], deal_fields: [] });
    assert.doesNotMatch(out, /<img/);
  });

  test('renderFonioVars: shown to an owner with a connection, hidden otherwise; the converted prompt only once a prompt is pasted', () => {
    const el = () => { const e = { hidden: null, innerHTML: '', textContent: '', value: 'old', classList: { toggle(_c, on) { e.hidden = on; } } }; return e; };
    const els = { 'fonio-vars-card': el(), 'fonio-vars-rows': el(), 'fonio-vars-out-wrap': el(), 'fonio-vars-out': el(), 'fonio-vars-prompt': el() };
    V.__set('document', { getElementById: id => els[id] || null });
    V.__set('fonioVarSources', SRC);
    V.__set('fonioData', { configured: true, can_manage: true, settings: { variables: [{ name: 'vorname', source: 'value:first_name' }] } });
    V.resetFonioVars();
    assert.equal(els['fonio-vars-prompt'].value, '');
    V.renderFonioVars();
    assert.equal(els['fonio-vars-card'].hidden, false);
    assert.match(els['fonio-vars-rows'].innerHTML, /value="vorname"/);
    assert.equal(els['fonio-vars-out-wrap'].hidden, true);
    V.__set('fonioVarsPrompt', 'Hallo {{vorname}}');
    V.renderFonioVars();
    assert.deepEqual([els['fonio-vars-out-wrap'].hidden, els['fonio-vars-out'].textContent], [false, 'Hallo {{vorname}}']);
    V.__set('fonioVars', []);
    V.renderFonioVars();
    assert.match(els['fonio-vars-rows'].innerHTML, /No variables yet\./);
    for (const data of [{ configured: true, can_manage: false, settings: {} }, { configured: false, can_manage: true, settings: {} }, null]) {
      V.__set('fonioData', data);
      V.renderFonioVars();
      assert.equal(els['fonio-vars-card'].hidden, true, JSON.stringify(data));
    }
  });

  test('the wiring: loaded with the tab, redrawn by renderFonio, reset only on load and remove, saved as { variables } alone', () => {
    assert.match(sliceFn(js, 'loadFonio', 'integrations.js'), /resetFonioVars\(\);\s*renderFonio\(\);[\s\S]*if \(data\.can_manage\) \{[\s\S]*api\.get\('\/api\/integrations\/fonio\/sources'\)/);
    assert.match(sliceFn(js, 'renderFonio', 'integrations.js'), /renderFonioResult\(\);\s*renderFonioVars\(\);/);
    assert.match(sliceFn(js, 'removeFonio', 'integrations.js'), /resetFonioVars\(\);\s*renderFonio\(\);/);
    assert.doesNotMatch(sliceFn(js, 'saveFonio', 'integrations.js'), /resetFonioVars|variables/);
    assert.match(sliceFn(js, 'saveFonioVars', 'integrations.js'), /api\.put\('\/api\/integrations\/fonio', \{ variables: fonioVarsBody\(fonioVars\) \}\)/);
    assert.match(sliceFn(js, 'setFonioVar', 'integrations.js'), /renderFonioVarsOut\(\);/);
    assert.doesNotMatch(sliceFn(js, 'setFonioVar', 'integrations.js'), /renderFonioVars\(\)/, 'typing does not redraw the row');
  });
});
