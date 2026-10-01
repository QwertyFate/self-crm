// CLIENT (static + pure-function) tests for the Upgrads Engine card on the
// Integrations page: the markup, the copy in both dictionaries, the loader
// chaining, and the three pure renderers (mask, stage chips, delivery entry).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const intg = read('public/js/integrations.js');
const core = read('public/js/core.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

const pageStart = html.indexOf('<section id="page-integrations"');
const page = html.slice(pageStart, html.indexOf('</section>', pageStart));
const cardStart = page.indexOf('id="engine-card"');
const nextCard  = page.indexOf('<div class="settings-card"', cardStart + 1);   // the next plain card, not this card's body/header
const card = page.slice(cardStart, nextCard === -1 ? undefined : nextCard);
const count = (src, needle) => src.split(needle).length - 1;

const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceFn(core, 't', 'core.js'),
].join('\n');
const F = loadFns('public/js/integrations.js',
  ['maskSecret', 'renderEngineStages', 'engineDeliveryHtml'],
  { state: { currentLang: 'en', engineData: null }, extra });

describe('markup', () => {
  test('one engine card, in the Engine pane of the Integrations page; the Settings page carries nothing of it', () => {
    assert.equal(count(html, 'id="engine-card"'), 1);
    assert.ok(cardStart > 0, 'card is inside #page-integrations');
    assert.ok(page.indexOf('id="intg-pane-engine"') > 0 && page.indexOf('id="intg-pane-engine"') < cardStart, 'engine card sits in its own pane');
    assert.ok(page.indexOf('id="intg-pane-deliveries"') < page.indexOf('id="engine-deliveries"'), 'the deliveries list is in the Deliveries pane');
    const settingsStart = html.indexOf('<section id="page-settings"');
    const settings = html.slice(settingsStart, html.indexOf('</section>', settingsStart));
    assert.ok(!settings.includes('engine-'), 'settings page untouched');
  });
  test('every control exists exactly once and is wired to the new functions', () => {
    for (const id of ['engine-active', 'engine-url', 'engine-stages', 'engine-secret', 'engine-msg', 'engine-readonly-hint']) {
      assert.equal(count(card, `id="${id}"`), 1, id);
    }
    for (const fn of ['saveEngineSettings(true)', 'saveEngineSettings()', 'copyEngineSecret(this)', 'regenerateEngineSecret()', 'sendEngineTestEvent(this)']) {
      assert.ok(card.includes(`onclick="${fn}"`) || card.includes(`onchange="${fn}"`), fn);
    }
    // The deliveries list lives in its own card (Deliveries tab), still on this page.
    assert.equal(count(page, 'id="engine-deliveries"'), 1);
    assert.ok(page.includes('onclick="loadEngineDeliveries()"'));
    const tag = id => (card.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    assert.match(tag('engine-secret'), /\breadonly\b/, 'secret field is read-only');
    assert.match(tag('engine-url'), /type="url"/);
  });
  test('every data-i18n key in the card exists in both dictionaries, and the card carries no hard-coded English labels', () => {
    const keys = [...card.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
    assert.ok(keys.length >= 12, `found ${keys.length} keys`);
    for (const k of keys) { assert.ok(k in dict.en, `en.${k}`); assert.ok(k in dict.de, `de.${k}`); }
    for (const k of ['engine_title', 'engine_hint', 'engine_url_label', 'engine_stages_label', 'engine_secret_label', 'engine_btn_test', 'btn_copy', 'btn_regenerate', 'btn_save_changes']) {
      assert.ok(keys.includes(k), k);
    }
    for (const k of ['copied', 'engine_saved', 'engine_test_ok', 'engine_test_failed', 'engine_confirm_regen_secret', 'engine_status_pending', 'engine_status_success', 'engine_status_failed', 'engine_attempts', 'engine_view_payload', 'engine_no_stages']) {
      assert.ok(k in dict.en && k in dict.de, `runtime key ${k}`);
    }
  });
});

describe('wiring in integrations.js', () => {
  test('loadIntegrations starts by loading the engine card, before its own early return', () => {
    assert.match(sliceFn(intg, 'loadIntegrations', 'integrations.js'), /^async function loadIntegrations\(\) \{\s*loadEngineSettings\(\);/);
  });
  test('save PATCHes /api/engine/settings with url, active and the ticked stage ids', () => {
    const s = sliceFn(intg, 'saveEngineSettings', 'integrations.js');
    assert.match(s, /api\.patch\('\/api\/engine\/settings'/);
    assert.match(s, /trigger_stage_ids:\s*getEngineTriggerIds\(\)/);
    assert.match(s, /engine_url/);
    assert.match(s, /active/);
  });
  test('the ticked stages are read from the chips by data-id', () => {
    assert.match(sliceFn(intg, 'getEngineTriggerIds', 'integrations.js'), /#engine-stages input\[data-id\]:checked/);
  });
  test('copy takes the secret from state, never from the masked input', () => {
    const s = sliceFn(intg, 'copyEngineSecret', 'integrations.js');
    assert.match(s, /engineData/);
    assert.doesNotMatch(s, /getElementById\('engine-secret'\)\.value/);
    assert.match(s, /fallbackCopy/);
  });
  test('regenerate confirms first, then POSTs and updates state and the masked field', () => {
    const s = sliceFn(intg, 'regenerateEngineSecret', 'integrations.js');
    assert.match(s, /confirm\(t\('engine_confirm_regen_secret'\)\)/);
    assert.match(s, /api\.post\('\/api\/engine\/settings\/regenerate-secret'/);
    assert.match(s, /maskSecret\(/);
  });
  test('test event and deliveries hit their routes', () => {
    assert.match(sliceFn(intg, 'sendEngineTestEvent', 'integrations.js'), /api\.post\('\/api\/engine\/test-event'/);
    assert.match(sliceFn(intg, 'loadEngineDeliveries', 'integrations.js'), /api\.get\('\/api\/engine\/deliveries'\)/);
  });
  test('the renderers use no inline style attributes except the stage colour variable', () => {
    assert.doesNotMatch(sliceFn(intg, 'engineDeliveryHtml', 'integrations.js'), /style=/);
    assert.doesNotMatch(sliceFn(intg, 'maskSecret', 'integrations.js'), /style=/);
  });
});

describe('maskSecret', () => {
  test('shows only the last four characters; null is a dash', () => {
    assert.equal(F.maskSecret('0123456789abcdef'), '••••••••cdef');
    assert.equal(F.maskSecret(null), '—');
    assert.equal(F.maskSecret(''), '—');
  });
});

describe('renderEngineStages', () => {
  const stages = [
    { id: 4, name: 'Won',      color: '#2a2', pipeline_id: 1, pipeline_name: 'Sales' },
    { id: 5, name: '<b>Sign', color: '#22a', pipeline_id: 1, pipeline_name: 'Sales' },
    { id: 8, name: 'Done',     color: '#aaa', pipeline_id: 2, pipeline_name: 'Ops<' },
  ];
  test('groups by pipeline, ticks the selected ids (string or number), escapes names', () => {
    const out = F.renderEngineStages(stages, ['5', 8]);
    assert.equal(count(out, 'analytics-pipeline-group'), 2);
    assert.ok(out.includes('Ops&lt;'), 'pipeline name escaped');
    assert.ok(out.includes('&lt;b&gt;Sign'), 'stage name escaped');
    assert.ok(!out.includes('<b>Sign'));
    assert.match(out, /data-id="5" checked/);
    assert.match(out, /data-id="8" checked/);
    assert.doesNotMatch(out, /data-id="4" checked/);
    assert.equal(count(out, 'type="checkbox"'), 3);
  });
  test('no stages: a hint, no chips', () => {
    const out = F.renderEngineStages([], []);
    assert.ok(out.includes(dict.en.engine_no_stages));
    assert.doesNotMatch(out, /checkbox/);
  });
});

describe('engineDeliveryHtml', () => {
  const base = { id: 1, event: 'vertrag.unterschrieben', status: 'success', attempts: 1, last_status_code: 200, last_error: null, deal_title: 'Acme', contact_name: 'Jane', payload: { vertrag_id: 1 }, created_at: '2026-09-28T09:15:00.000Z' };
  test('a success entry: badge, deal title, attempts, payload', () => {
    const out = F.engineDeliveryHtml(base);
    assert.match(out, /intg-log-badge success/);
    assert.ok(out.includes('Acme'));
    assert.ok(out.includes(`1 ${dict.en.engine_attempt_one}`), 'singular for one attempt');
    assert.ok(F.engineDeliveryHtml({ ...base, attempts: 3 }).includes(`3 ${dict.en.engine_attempts}`), 'plural otherwise');
    assert.ok(dict.en.engine_attempt_one !== dict.en.engine_attempts && 'engine_attempt_one' in dict.de);
    assert.ok(out.includes('HTTP 200'));
    assert.ok(out.includes('&quot;vertrag_id&quot;: 1'));
    assert.doesNotMatch(out, /intg-log-entry error/);
  });
  test('a failed entry is marked and the error is escaped', () => {
    const out = F.engineDeliveryHtml({ ...base, status: 'failed', attempts: 3, last_status_code: 503, last_error: 'HTTP 503 <script>x</script>', deal_title: null });
    assert.match(out, /intg-log-entry error/);
    assert.match(out, /intg-log-badge failed/);
    assert.ok(out.includes('&lt;script&gt;x&lt;/script&gt;'));
    assert.ok(!out.includes('<script>'));
    assert.ok(out.includes('vertrag.unterschrieben'), 'falls back to the event name without a deal');
  });
  test('unknown status renders as pending', () => {
    assert.match(F.engineDeliveryHtml({ ...base, status: 'weird' }), /intg-log-badge pending/);
  });
});

describe('stylesheet', () => {
  const section = css.slice(css.indexOf('21 · INTEGRATIONS'), css.indexOf('22 · AUTH & ADMIN'));
  test('engine rules live in the integrations section and use tokens only', () => {
    for (const sel of ['.engine-stage-groups', '.intg-log-badge.pending', '.intg-log-badge.failed', '.engine-delivery-meta']) {
      assert.ok(section.includes(sel), sel);
    }
    const added = section.slice(section.indexOf('.engine-stage-groups'));
    assert.doesNotMatch(added, /#[0-9a-f]{3,6}\b/i, 'no hex colours');
  });
  test('trigger stages read as chips: the checkbox stays real, the label shows the checked state', () => {
    assert.match(section, /\.engine-stage-groups \.analytics-stage-option \{/);
    assert.match(section, /\.engine-stage-groups \.analytics-stage-option:has\(input:checked\) \{[^}]*var\(--success/);
    assert.match(section, /\.engine-stage-groups \.analytics-stage-option input \{[^}]*position: absolute/, 'box visually hidden, still focusable');
    assert.match(section, /\.engine-stage-groups \.analytics-stage-option:focus-within \{/, 'keyboard focus stays visible');
  });
});
