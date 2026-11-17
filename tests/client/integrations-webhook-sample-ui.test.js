// CLIENT (static + pure-function) tests for the test delivery on the lead webhook card (LEAD_WEBHOOK_CHANGES Part 2):
// the section sits between the address and the mapping; the button starts and stops the listening for the chosen
// webhook; the page asks every three seconds while one listens and takes over only the test's own fields; the sample
// is shown as text, never as markup; every string is in the dictionary in both languages.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/integrations.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('the markup', () => {
  test('the section: after the address, before the mapping; the button, the status, the sample hidden until there is one', () => {
    const i = html.indexOf('data-i18n="intg_test_title"');
    assert.ok(i > html.indexOf('id="intg-url"') && i < html.indexOf('id="intg-field-map"'));
    assert.match(html, /<button class="btn btn-sm" type="button" id="intg-test-btn" onclick="toggleIntgTest\(this\)" data-i18n="intg_test_start">[^<]+<\/button>\s*<button class="btn btn-sm" type="button" id="intg-last-btn" onclick="useIntgLastDelivery\(this\)" data-i18n="intg_sample_last">[^<]+<\/button>\s*<span id="intg-test-status" class="intg-test-status"><\/span>/);
    assert.match(html, /<div id="intg-sample-wrap" class="intg-sample-wrap hidden">[\s\S]*?<span id="intg-sample-when" class="intg-sample-when"><\/span>\s*<button class="btn btn-sm btn-ghost" type="button" onclick="discardIntgSample\(\)" data-i18n="intg_sample_discard">[^<]+<\/button>[\s\S]*?<pre id="intg-sample" class="intg-log-raw intg-sample"><\/pre>/);
    for (const id of ['intg-test-btn', 'intg-last-btn', 'intg-test-status', 'intg-sample-wrap', 'intg-sample-when', 'intg-sample', 'intg-preview']) assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
    const css = read('public/style.css');
    for (const sel of ['.intg-log-badge.test', '.intg-test-status', '.intg-sample-head', '.intg-sample {']) assert.ok(css.includes(sel), sel);
  });
  test('every text exists in English and German with the same placeholders; a log row with status "test" has its word', () => {
    for (const k of ['intg_test_title', 'intg_test_hint', 'intg_test_start', 'intg_test_stop', 'intg_test_listening', 'intg_test_received', 'intg_sample_when', 'intg_sample_discard', 'intg_log_test']) {
      assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k);
      assert.deepEqual((dict.de[k].match(/\{\w+\}/g) || []).sort(), (dict.en[k].match(/\{\w+\}/g) || []).sort(), k);
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, k);
    }
    assert.match(sliceFn(js, 'loadIntgLogs', 'integrations.js'), /esc\(t\('intg_log_' \+ l\.status\)\)/);
  });
});

describe('the script', () => {
  test('the card draws the test with the form; loading the settings starts the watch; the routes are the webhook\'s own', () => {
    assert.match(sliceFn(js, 'renderIntgWebhookForm', 'integrations.js'), /renderIntgTest\(\);/);
    assert.match(sliceFn(js, 'reloadIntgSettings', 'integrations.js'), /watchIntgTest\(\);\s*await loadIntgLogs\(\);/);
    const t = sliceFn(js, 'toggleIntgTest', 'integrations.js');
    assert.match(t, /const url = `\/api\/integrations\/settings\/\$\{wh\.id\}\/test`;\s*const res = wh\.testing \? await api\.del\(url\) : await api\.post\(url, \{\}\);/);
    assert.match(sliceFn(js, 'discardIntgSample', 'integrations.js'), /api\.del\(`\/api\/integrations\/settings\/\$\{wh\.id\}\/sample`\)/);
    const w = sliceFn(js, 'watchIntgTest', 'integrations.js');
    assert.match(w, /if \(!intgWebhooks\.some\(w => w\.testing\)\) return;/, 'no polling unless a webhook listens');
    assert.match(w, /apiFetchSilent\('\/api\/integrations\/settings'\)/); assert.match(w, /\}, 3000\);/);
    assert.match(w, /if \(arrived\) \{ intgSampleChanged\(\); intgFlash\(t\('intg_test_received'\)\); loadIntgLogs\(\); \}\s*else renderIntgTest\(\);/, 'a sample that arrived redraws the mapping and the preview');
    assert.match(w, /if \(!intgWebhooks\.some\(w => w\.testing\)\) \{ clearInterval\(intgTestTimer\); intgTestTimer = null; \}/, 'and it stops by itself');
    assert.match(sliceFn(js, 'renderIntgTest', 'integrations.js'), /pre\.textContent = JSON\.stringify\(wh\.sample, null, 2\);/);
    assert.doesNotMatch(sliceFn(js, 'renderIntgTest', 'integrations.js'), /innerHTML/, 'a payload is never markup');
  });

  const els = {};
  const el = id => (els[id] = els[id] || { textContent: '', hidden: null, classList: { toggle(c, on) { els[id].hidden = on; } } });
  const F = loadFns('public/js/integrations.js', ['renderIntgTest', 'intgTakeTest', 'intgWebhook'], {
    state: { intgWebhooks: [], currentWebhookId: 1, currentLang: 'en' },
    extra: `${sliceConst('public/js/integrations.js', 'INTG_TEST_FIELDS')}
      const t = k => globalThis.__sampleDict.en[k];
      const tf = (k, v) => globalThis.__sampleDict.en[k].replace(/\\{(\\w+)\\}/g, (_, n) => v[n]);
      const document = { getElementById: id => globalThis.__sampleEl(id) };`,
  });
  globalThis.__sampleDict = dict; globalThis.__sampleEl = el;

  test('renderIntgTest: the button and the status follow the listening; the sample is shown only when there is one', () => {
    F.__set('intgWebhooks', [{ id: 1, testing: false, sample: null }]);
    F.renderIntgTest();
    assert.equal(els['intg-test-btn'].textContent, 'Listen for a test delivery'); assert.equal(els['intg-test-status'].textContent, ''); assert.equal(els['intg-sample-wrap'].hidden, true);
    F.__set('intgWebhooks', [{ id: 1, testing: true, test_seconds_left: 125, sample: null }]);
    F.renderIntgTest();
    assert.equal(els['intg-test-btn'].textContent, 'Stop listening');
    assert.equal(els['intg-test-status'].textContent, 'Listening: send one delivery to the address above within 3 minutes. It will not become a contact.');
    F.__set('intgWebhooks', [{ id: 1, testing: false, sample: { a: '<b>x</b>' }, sample_at: '2026-11-17T10:00:00Z' }]);
    F.renderIntgTest();
    assert.equal(els['intg-sample-wrap'].hidden, false); assert.equal(els['intg-sample'].textContent, '{\n  "a": "<b>x</b>"\n}'); assert.match(els['intg-sample-when'].textContent, /^Sample received /);
    F.__set('intgWebhooks', [{ id: 1, testing: false, sample: [] }]);
    F.renderIntgTest();
    assert.equal(els['intg-sample-wrap'].hidden, false, 'an empty list is still a sample');
  });
  test('intgTakeTest: only the test\'s fields are taken over; it says when a new sample arrived', () => {
    const mine = { id: 1, name: 'typed but not saved', testing: true, sample: null, sample_at: null };
    F.__set('intgWebhooks', [mine]);
    assert.equal(F.intgTakeTest({ id: 1, name: 'server name', testing: true, test_seconds_left: 500, sample: null, sample_at: null }), false);
    assert.equal(mine.name, 'typed but not saved'); assert.equal(mine.test_seconds_left, 500);
    assert.equal(F.intgTakeTest({ id: 1, testing: false, test_seconds_left: 0, sample: { a: 1 }, sample_at: 'T1' }), true);
    assert.deepEqual([mine.testing, mine.sample, mine.sample_at], [false, { a: 1 }, 'T1']);
    assert.equal(F.intgTakeTest({ id: 1, testing: false, sample: { a: 1 }, sample_at: 'T1' }), false, 'the same sample is not news');
    assert.equal(F.intgTakeTest({ id: 9, sample_at: 'T2' }), false, 'a webhook the page does not know');
  });
});

// ── Part 3: each field chosen from the sample ────────────────────────────────
describe('choosing a field from the sample (Part 3)', () => {
  const FIELDS = [{ path: 'full_name', value: 'Erika Muster' }, { path: 'data.email', value: 'e@x.de' }, { path: 'field_data[name=budget].values', value: 'x'.repeat(80) }, { path: 'leer', value: '' }];
  const P = loadFns('public/js/integrations.js', ['intgSampleFields', 'intgSavedPath', 'intgPickHtml', 'renderFieldRow', 'intgWebhook'], {
    state: { intgWebhooks: [], currentWebhookId: 1 },
    extra: `${js.match(/^const INTG_PICK_TYPE = .*$/m)[0]}
      ${js.match(/^const INTG_PICK_EXAMPLE = .*$/m)[0]}
      const UI_ICON = { edit: '<i edit>', x: '<i x>' };
      const t = k => globalThis.__sampleDict.en[k];
      const tf = (k, v) => globalThis.__sampleDict.en[k].replace(/\\{(\\w+)\\}/g, (_, n) => v[n]);
      ${sliceFn(read('public/js/core.js'), 'esc', 'core.js')}`,
  });
  const options = html => [...html.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map(m => [m[1], !!m[2], m[3]]);

  test('the list: "do not fill", every value of the sample with its example (long ones shortened), "type the key by hand"; the saved path is the chosen one', () => {
    const html = P.intgPickHtml('email', 'data.email', FIELDS);
    assert.match(html, /^<select class="form-control intg-map-pick" data-crm="email" onchange="intgPickField\(this\)" aria-label="Value from the sample">/);
    assert.deepEqual(options(html), [['', false, 'Do not fill'], ['full_name', false, 'full_name: Erika Muster'], ['data.email', true, 'data.email: e@x.de'],
      ['field_data[name=budget].values', false, 'field_data[name=budget].values: ' + 'x'.repeat(48) + '…'], ['leer', false, 'leer'], ['::type-the-key::', false, 'Type the key by hand']]);
  });
  test('a saved path the sample does not have is kept and says so; an empty one is "do not fill"; nothing injects markup', () => {
    assert.deepEqual(options(P.intgPickHtml('phone', 'phone_number', FIELDS)).filter(o => o[1]), [['phone_number', true, 'phone_number (not in the sample)']]);
    assert.deepEqual(options(P.intgPickHtml('company', '', FIELDS)).filter(o => o[1]), [['', true, 'Do not fill']]);
    const evil = P.intgPickHtml('x"y', '<img src=x>', [{ path: '"><script>', value: '<b>' }]);
    assert.doesNotMatch(evil, /<img|<script|<b>/); assert.match(evil, /data-crm="x&quot;y"/);
  });
  test('intgSavedPath: the saved text, "" for do-not-fill, null when nothing is saved (the usual key then stands in)', () => {
    assert.equal(P.intgSavedPath({ name: 'full_name' }, 'name'), 'full_name'); assert.equal(P.intgSavedPath({ company: '' }, 'company'), '');
    for (const [map, key] of [[{}, 'name'], [null, 'name'], [{ name: 7 }, 'name'], [{}, 'toString']]) assert.equal(P.intgSavedPath(map, key), null);
  });
  test('a row with a sample: the list first, the text field and its pencil behind it; without a sample: the text field as always', () => {
    P.__set('intgWebhooks', [{ id: 1, sample: { a: 1 }, sample_fields: FIELDS }]);
    const withSample = P.renderFieldRow('email', 'Email', 'email', 'data.email', false);
    assert.match(withSample, /<div class="intg-key-field">\s*<select class="form-control intg-map-pick"[\s\S]*<\/select>\s*<input class="intg-map-input intg-key-input hidden" type="text"\s+data-crm="email"\s+value="data.email"/);
    assert.match(withSample, /class="btn btn-sm btn-icon intg-key-edit-btn hidden"/);
    P.__set('intgWebhooks', [{ id: 1, sample: null, sample_fields: [] }]);
    const plain = P.renderFieldRow('email', 'Email', 'email', null, false);
    assert.doesNotMatch(plain, /intg-map-pick/); assert.match(plain, /<input class="intg-map-input intg-key-input" type="text"\s+data-crm="email"\s+value="email"/, 'nothing saved: the usual key');
    assert.match(P.renderFieldRow('company', 'Company', 'company', '', false), /value=""\s+placeholder="Do not fill"/, '"" is do-not-fill, not the usual key');
  });
  test('the two name parts are rows of their own with no usual key; the server joins them when there is no full name', () => {
    const fields = new Function(sliceConst('public/js/integrations.js', 'INTG_BUILTIN_FIELDS').replace(/^[^[]*/, 'return '))();
    assert.deepEqual(fields.map(f => [f.key, f.placeholder]), [['name', 'full_name'], ['first_name', ''], ['last_name', ''], ['email', 'email'], ['phone', 'phone_number'], ['company', 'company']]);
    for (const f of fields) { assert.ok(dict.en[f.labelKey], f.labelKey); assert.ok(dict.de[f.labelKey], f.labelKey); }
    assert.match(sliceFn(js, 'intgKeyBlur', 'integrations.js'), /input\.value\s+= builtin \? builtin\.placeholder : \(cf\?\.field_key \|\| crmKey\);/);
    const lm = require('../../utils/lead-mapping');
    for (const f of fields) assert.ok(lm.BUILTIN.has(f.key), f.key + ' is a built-in for the server too');
  });
  test('the wiring: a chosen value becomes the row\'s key and is saved at once; "by hand" brings the text field back; every row is read, empty ones too', () => {
    const pick = sliceFn(js, 'intgPickField', 'integrations.js');
    assert.match(pick, /if \(sel\.value === INTG_PICK_TYPE\) \{[\s\S]*input\.removeAttribute\('readonly'\); input\.focus\(\); input\.select\(\);\s*return;\s*\}/);
    assert.match(pick, /input\.value = sel\.value;\s*input\.classList\.add\('hidden'\); btn\?\.classList\.add\('hidden'\);\s*refreshGuideJson\(\);\s*await saveIntegration\(true\);/);
    assert.match(sliceFn(js, 'getIntgFieldMap', 'integrations.js'), /forEach\(inp => \{\s*map\[inp\.dataset\.crm\] = inp\.value\.trim\(\);\s*\}\);/);
    const blur = sliceFn(js, 'intgKeyBlur', 'integrations.js');
    assert.match(blur, /if \(pick\) setTimeout\(\(\) => \{\s*if \(document\.activeElement === pick \|\| !pick\.isConnected\) return;\s*pick\.outerHTML = intgPickHtml\(input\.dataset\.crm, input\.value\.trim\(\), intgSampleFields\(\)\);[\s\S]*saveIntegration\(true\);[^\n]*\n\s*\}, 0\);/, 'a key typed by hand joins the list and is saved, unless the person went straight on to the list');
    assert.match(sliceFn(js, 'renderIntgFieldMap', 'integrations.js'), /renderFieldRow\(f\.key, t\(f\.labelKey\), f\.placeholder, intgSavedPath\(fieldMap, f\.key\), false\)/);
    assert.match(sliceFn(js, 'intgSampleChanged', 'integrations.js'), /renderIntgTest\(\);\s*renderIntgFieldMap\(getIntgFieldMap\(\)\);\s*loadIntgPreview\(\);/);
    const last = sliceFn(js, 'useIntgLastDelivery', 'integrations.js');
    assert.match(last, /api\.post\(`\/api\/integrations\/settings\/\$\{wh\.id\}\/sample\/last`, \{\}\)/); assert.match(last, /intgTakeTest\(res\.webhook\);\s*intgSampleChanged\(\);/);
    assert.match(sliceFn(js, 'discardIntgSample', 'integrations.js'), /intgTakeTest\(res\.webhook\);\s*intgSampleChanged\(\);/);
    const E = loadFns('public/js/integrations.js', ['intgErrorText'], { extra: 'const t = k => k;' });
    assert.equal(E.intgErrorText({ error: 'x', reason: 'no_delivery' }), 'intg_err_no_delivery');
  });
  test('every new text exists in both languages with the same placeholders, German impersonal', () => {
    for (const k of ['intg_sample_last', 'intg_err_no_delivery', 'intg_map_first_name', 'intg_map_last_name', 'intg_pick_none', 'intg_pick_missing', 'intg_pick_type', 'intg_pick_aria', 'intg_mapping_hint',
      'intg_preview_title', 'intg_preview_new', 'intg_preview_update', 'intg_preview_rejected', 'intg_preview_rejected_hint', 'intg_preview_skipped', 'intg_preview_deal', 'intg_preview_name_from_email', 'intg_preview_empty']) {
      assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k);
      assert.deepEqual((dict.de[k].match(/\{\w+\}/g) || []).sort(), (dict.en[k].match(/\{\w+\}/g) || []).sort(), k);
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, k);
    }
    assert.equal(html.match(/data-i18n="intg_mapping_hint">([^<]+)</)[1], dict.en.intg_mapping_hint, 'the markup carries the same sentence');
  });
});

describe('the whole mapping, drawn (Part 3)', () => {
  const box = { innerHTML: '' };
  const M = loadFns('public/js/integrations.js', ['renderIntgFieldMap', 'renderFieldRow', 'intgPickHtml', 'intgSampleFields', 'intgSavedPath', 'intgWebhook'], {
    state: { intgWebhooks: [], currentWebhookId: 1, activeCustomKeys: [], intgData: { contact_fields: [{ field_key: 'eigenkapital', name: 'Eigenkapital' }, { field_key: 'ort', name: 'Ort' }] } },
    extra: `${sliceConst('public/js/integrations.js', 'INTG_BUILTIN_FIELDS')}
      ${js.match(/^const INTG_PICK_TYPE = .*$/m)[0]}
      ${js.match(/^const INTG_PICK_EXAMPLE = .*$/m)[0]}
      const UI_ICON = { edit: '<i edit>', plus: '<i plus>', x: '<i x>', trash: '<i trash>' };
      const t = k => { const v = globalThis.__sampleDict.en[k]; if (v === undefined) throw new Error('no key ' + k); return v; };
      const tf = (k, v) => t(k).replace(/\\{(\\w+)\\}/g, (_, n) => v[n]);
      ${sliceFn(read('public/js/core.js'), 'esc', 'core.js')}
      const document = { getElementById: id => (id === 'intg-field-map' ? globalThis.__mapBox : null) };`,
  });
  globalThis.__mapBox = box;
  const rows = () => [...box.innerHTML.matchAll(/<span class="intg-map-label" title="([^"]*)">/g)].map(m => m[1]);
  const keys = () => [...box.innerHTML.matchAll(/data-crm="(\w+)"\s+value="([^"]*)"/g)].map(m => [m[1], m[2]]);
  const MAP = { name: 'field_data[name=full_name].values', email: 'data.email', phone: 'phone_number', company: '', first_name: '', last_name: '', eigenkapital: 'budget' };

  test('without a sample: six built-in rows and the saved custom ones as typed keys; "" stays empty, nothing saved shows the usual key', () => {
    M.__set('intgWebhooks', [{ id: 1, sample: null, sample_fields: [] }]);
    M.renderIntgFieldMap(MAP);
    assert.deepEqual(rows(), ['Name', 'First name (when there is no full name)', 'Last name (when there is no full name)', 'Email', 'Phone', 'Company', 'Eigenkapital']);
    assert.deepEqual(keys(), [['name', 'field_data[name=full_name].values'], ['first_name', ''], ['last_name', ''], ['email', 'data.email'], ['phone', 'phone_number'], ['company', ''], ['eigenkapital', 'budget']]);
    assert.doesNotMatch(box.innerHTML, /intg-map-pick/);
    M.__set('activeCustomKeys', []);
    M.renderIntgFieldMap({});
    assert.deepEqual(keys(), [['name', 'full_name'], ['first_name', ''], ['last_name', ''], ['email', 'email'], ['phone', 'phone_number'], ['company', 'company']], 'a webhook that never saved a map: the usual keys, the name parts empty');
  });
  test('with a sample: every row is a list with the saved path chosen, and the same keys wait behind them for the save', () => {
    M.__set('activeCustomKeys', []);
    M.__set('intgWebhooks', [{ id: 1, sample: {}, sample_fields: [{ path: 'field_data[name=full_name].values', value: 'Erika Muster' }, { path: 'data.email', value: 'e@x.de' }, { path: 'budget', value: '10k' }] }]);
    M.renderIntgFieldMap(MAP);
    assert.equal((box.innerHTML.match(/<select class="form-control intg-map-pick"/g) || []).length, 7, 'one list per row');
    const chosen = [...box.innerHTML.matchAll(/<select class="form-control intg-map-pick" data-crm="(\w+)"[^>]*>(.*?)<\/select>/g)].map(m => [m[1], (m[2].match(/<option value="([^"]*)" selected>/) || [])[1]]);
    assert.deepEqual(chosen, [['name', 'field_data[name=full_name].values'], ['first_name', ''], ['last_name', ''], ['email', 'data.email'], ['phone', 'phone_number'], ['company', ''], ['eigenkapital', 'budget']]);
    assert.match(box.innerHTML, /<option value="phone_number" selected>phone_number \(not in the sample\)<\/option>/);
    assert.equal((box.innerHTML.match(/intg-key-input hidden/g) || []).length, 7);
    assert.deepEqual(keys().map(k => k[1]), ['field_data[name=full_name].values', '', '', 'data.email', 'phone_number', '', 'budget']);
  });
});

// ── Part 4: what the sample would become ─────────────────────────────────────
describe('the preview (Part 4)', () => {
  const V = loadFns('public/js/integrations.js', ['intgPreviewHtml'], {
    extra: `const t = k => globalThis.__sampleDict.en[k];
      const tf = (k, v) => globalThis.__sampleDict.en[k].replace(/\\{(\\w+)\\}/g, (_, n) => v[n]);
      ${sliceFn(read('public/js/core.js'), 'esc', 'core.js')}`,
  });
  const CF = [{ field_key: 'eigenkapital', name: 'Eigenkapital' }];
  const base = { has_sample: true, rejected: false, contact: { name: 'Erika Muster', email: 'e@x.de', phone: null, company: null }, custom: [{ key: 'eigenkapital', value: '10k' }], skipped: [], existing: null };
  const cells = out => [...out.matchAll(/<tr><td class="strong">([^<]*)<\/td><td>(.*?)<\/td><\/tr>/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, '')]);

  test('a new contact: its values, the custom fields by their names, what is not filled says so', () => {
    const out = V.intgPreviewHtml(base, null, CF);
    assert.match(out, /<span class="badge badge-success">A new contact<\/span>/);
    assert.deepEqual(cells(out), [['Name', 'Erika Muster'], ['Email', 'e@x.de'], ['Phone', 'not filled'], ['Company', 'not filled'], ['Eigenkapital', '10k']]);
    assert.doesNotMatch(out, /intg-preview-note/);
  });
  test('an existing contact is named; missing custom fields are listed; the deal the card would create is said', () => {
    const out = V.intgPreviewHtml({ ...base, existing: { id: 5, name: 'Erika M.' }, skipped: [{ key: 'eigenkapital', incoming: 'x' }, { key: 'gone_field', incoming: 'y' }] }, { pipeline: 'Sales', stage: 'Neu' }, CF);
    assert.match(out, /<span class="badge badge-info">Updates the contact Erika M\.<\/span>/);
    assert.match(out, /<p class="intg-preview-note">Not in the sample: Eigenkapital, gone_field<\/p>/);
    assert.match(out, /<p class="intg-preview-note">A deal is created in Sales, stage Neu\.<\/p>/);
  });
  test('rejected: the verdict and what to do, and no deal line; no name but an email: the email is the name', () => {
    const out = V.intgPreviewHtml({ ...base, rejected: true, contact: { name: null, email: null, phone: '1', company: null }, custom: [] }, { pipeline: 'Sales', stage: 'Neu' }, CF);
    assert.match(out, /<span class="badge badge-danger">Would be rejected<\/span>/); assert.match(out, /Neither a name nor an email is filled/); assert.doesNotMatch(out, /A deal is created/);
    assert.deepEqual(cells(V.intgPreviewHtml({ ...base, contact: { name: null, email: 'e@x.de', phone: null, company: null }, custom: [] }, null, CF))[0], ['Name', 'e@x.de (the email is used as the name)']);
  });
  test('everything a delivery brings is escaped', () => {
    const out = V.intgPreviewHtml({ ...base, contact: { name: '<img src=x>', email: '"><b>', phone: null, company: null }, custom: [{ key: '<k>', value: '<script>' }], existing: { id: 1, name: '<i>' }, skipped: [{ key: '<s>' }] }, { pipeline: '<p>', stage: '<st>' }, []);
    assert.doesNotMatch(out, /<img|<script|<b>|<i>|<k>|<s>|<p>|<st>/);
  });
  test('the wiring: asked with the form\'s mapping as it stands; only the newest answer is drawn; hidden without a sample; redrawn after every save and with the form', () => {
    const load = sliceFn(js, 'loadIntgPreview', 'integrations.js');
    assert.match(load, /if \(!wh \|\| wh\.sample === null \|\| wh\.sample === undefined\) \{ hide\(\); return; \}/);
    assert.match(load, /api\.post\(`\/api\/integrations\/settings\/\$\{wh\.id\}\/preview`, \{ field_map: getIntgFieldMap\(\) \}\)/);
    assert.match(load, /const seq = \+\+intgPreviewSeq;[\s\S]*if \(seq !== intgPreviewSeq\) return;/);
    assert.match(load, /el\.innerHTML = intgPreviewHtml\(res, intgPreviewDeal\(\), intgData\?\.contact_fields\);/);
    assert.match(sliceFn(js, 'saveIntegration', 'integrations.js'), /renderIntgWebhookTabs\(\);\s*\}\s*loadIntgPreview\(\);/);
    assert.match(sliceFn(js, 'renderIntgWebhookForm', 'integrations.js'), /renderIntgTest\(\);\s*loadIntgPreview\(\);/);
    assert.match(html, /<div id="intg-field-map" class="intg-field-map"><\/div>\s*<!--[^>]*-->\s*<div id="intg-preview" class="intg-preview hidden" aria-live="polite"><\/div>/);
    const css = read('public/style.css');
    for (const sel of ['.intg-map-pick {', '.intg-preview {', '.intg-preview-head {', '.intg-preview-note {']) assert.ok(css.includes(sel), sel);
  });
});
