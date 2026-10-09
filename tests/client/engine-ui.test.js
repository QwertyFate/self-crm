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
  sliceFn(core, 'tf', 'core.js'),
].join('\n');
const F = loadFns('public/js/integrations.js',
  ['maskSecret', 'renderEngineStages', 'engineDeliveryHtml', 'renderEngineApiKeys'],
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

describe('API keys card (Part 12)', () => {
  const keysStart = page.indexOf('id="engine-keys-card"');
  const keysEnd   = page.indexOf('<!-- ── Deliveries ── -->');
  const keysCard  = page.slice(keysStart, keysEnd);
  test('one card, in the Engine pane right after the connection card, with the create / reveal / list sections', () => {
    assert.equal(count(html, 'id="engine-keys-card"'), 1);
    assert.ok(keysStart > cardStart && keysStart < page.indexOf('id="intg-pane-deliveries"'), 'after #engine-card, inside the Engine pane');
    for (const id of ['engine-keys-create', 'engine-key-name', 'engine-key-reveal', 'engine-key-value', 'engine-keys']) assert.equal(count(keysCard, `id="${id}"`), 1, id);
    for (const fn of ['createEngineApiKey(this)', 'copyEngineApiKey(this)', 'hideEngineApiKey()']) assert.ok(keysCard.includes(`onclick="${fn}"`), fn);
    const tag = id => (keysCard.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    assert.match(tag('engine-key-value'), /\breadonly\b/, 'the revealed key is read-only');
    assert.match(tag('engine-key-name'), /maxlength="100"/);
    assert.match(keysCard, /<div class="intg-section hidden" id="engine-key-reveal">/, 'the reveal box starts hidden');
    assert.match(keysCard, /<div class="intg-section engine-manage" id="engine-keys-create">/, 'the create section is a manager control');
    assert.doesNotMatch(keysCard, /engine-manage-input/, 'no field of this card is part of the settings form');
  });
  test('every label in the card is translated and every key exists in both dictionaries', () => {
    const keys = [...keysCard.matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)].map(m => m[1]);
    assert.ok(keys.length >= 10, `found ${keys.length}`);
    for (const k of keys) { assert.ok(k in dict.en, `en.${k}`); assert.ok(k in dict.de, `de.${k}`); }
    for (const m of keysCard.matchAll(/<(h2|h3|p|button|span)([^>]*)>([^<]+)</g)) if (/[A-Za-z]{2,}/.test(m[3])) assert.match(m[2], /data-i18n=/, `untranslated: ${m[3].trim()}`);
    for (const k of ['engine_keys_none', 'engine_keys_never', 'engine_keys_revoke', 'engine_keys_revoked', 'engine_keys_confirm_revoke', 'engine_keys_revoked_toast', 'engine_keys_name_required', 'engine_keys_col_name', 'engine_keys_col_key', 'engine_keys_col_created', 'engine_keys_col_last_used']) {
      assert.ok(k in dict.en && k in dict.de, `runtime key ${k}`);
    }
  });
  test('wiring: settings load pulls the keys; members get the card hidden and no fetch; create posts and reveals once; revoke confirms (danger) then DELETEs; reset clears the cache', () => {
    assert.match(sliceFn(intg, 'loadEngineSettings', 'integrations.js'), /loadEngineApiKeys\(\);/);
    assert.match(sliceFn(intg, 'setEngineReadOnly', 'integrations.js'), /getElementById\('engine-keys-card'\)\?\.classList\.toggle\('hidden', readOnly\)/);
    const load = sliceFn(intg, 'loadEngineApiKeys', 'integrations.js');
    assert.match(load, /if \(!engineData\?\.can_manage\) return;/);
    assert.match(load, /api\.get\('\/api\/engine\/api-keys'\)/);
    const create = sliceFn(intg, 'createEngineApiKey', 'integrations.js');
    assert.match(create, /api\.post\('\/api\/engine\/api-keys', \{ name \}\)/);
    assert.match(create, /getElementById\('engine-key-value'\); if \(val\) val\.value = res\.key \|\| ''/);
    assert.match(create, /getElementById\('engine-key-reveal'\)\?\.classList\.remove\('hidden'\)/);
    assert.match(sliceFn(intg, 'hideEngineApiKey', 'integrations.js'), /val\.value = ''/);
    const revoke = sliceFn(intg, 'revokeEngineApiKey', 'integrations.js');
    assert.match(revoke, /ui\.confirm\(\{[\s\S]*danger: true/);
    assert.match(revoke, /api\.del\(`\/api\/engine\/api-keys\/\$\{id\}`\)/);
    assert.match(sliceFn(read('public/js/auth.js'), 'resetClientState', 'auth.js'), /engineApiKeys = \[\];/);
    assert.doesNotMatch(intg, /localStorage[^\n]*key/i, 'the plain key is never persisted client-side');
  });
  test('renderEngineApiKeys: empty state; rows with prefix only, created, last used or never, Revoke for managers on live keys, Revoked badge otherwise; everything escaped', () => {
    assert.match(F.renderEngineApiKeys([], true), /<p class="empty-inline">No keys yet\.<\/p>/);
    const keys = [
      { id: 1, name: 'Engine <prod>', key_prefix: 'upg_live_abc', created_at: '2026-10-09T10:00:00.000Z', last_used_at: null, revoked_at: null },
      { id: 2, name: 'Old', key_prefix: 'upg_live_def', created_at: '2026-09-01T10:00:00.000Z', last_used_at: '2026-10-01T10:00:00.000Z', revoked_at: '2026-10-05T10:00:00.000Z' },
    ];
    const out = F.renderEngineApiKeys(keys, true);
    assert.match(out, /<table class="table compact engine-keys-table">/);
    assert.match(out, /<th>Name<\/th><th>Key<\/th><th>Created<\/th><th>Last used<\/th><th><\/th>/);
    assert.match(out, /Engine &lt;prod&gt;/); assert.doesNotMatch(out, /<prod>/);
    assert.match(out, /<code class="engine-key-prefix">upg_live_abc…<\/code>/);
    assert.match(out, /<td>never<\/td>/, 'never used');
    assert.match(out, /onclick="revokeEngineApiKey\(1\)">Revoke<\/button>/);
    assert.doesNotMatch(out, /revokeEngineApiKey\(2\)/, 'no Revoke on a revoked key');
    assert.match(out, /<tr class="engine-key-revoked">[\s\S]*<span class="badge">Revoked<\/span>/);
    assert.doesNotMatch(out, /upg_live_[0-9a-f]{32}/, 'never a full key');
    assert.doesNotMatch(F.renderEngineApiKeys(keys, false), /revokeEngineApiKey/);
    F.__set('currentLang', 'de');
    assert.match(F.renderEngineApiKeys(keys, true), /<th>Schlüssel<\/th>/);
    assert.match(F.renderEngineApiKeys(keys, true), /<td>nie<\/td>/);
    F.__set('currentLang', 'en');
  });
  test('routes: list/create/revoke exist behind requireManage and never select or return key_hash', () => {
    const src = read('routes/engine.js');
    for (const r of ["router.get('/api-keys', requireManage", "router.post('/api-keys', requireManage", "router.delete('/api-keys/:id', requireManage"]) assert.ok(src.includes(r), r);
    assert.match(src, /const KEY_COLS\s*=\s*'id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at'/);
    assert.match(src, /hashKey\(key\)/);
    assert.match(src, /'upg_live_' \+ crypto\.randomBytes\(16\)\.toString\('hex'\)/);
    for (const sel of ['.engine-keys-table {', '.engine-key-prefix {', '.engine-key-revoked td {', '.engine-key-actions {']) assert.equal(count(css, sel), 1, sel);
  });
});

describe('engineDeliveryHtml — Retry button and next attempt (Part 11)', () => {
  const sent = { id: 5, event: 'vertrag.unterschrieben', status: 'failed', attempts: 7, last_status_code: 503, last_error: 'HTTP 503', deal_title: 'Acme', contact_name: null, payload: { event: 'vertrag.unterschrieben', kunde_id: 42, daten: {} }, created_at: '2026-09-28T09:15:00.000Z', next_attempt_at: null };
  test('a manager sees Retry on a failed or pending contract event, wired to the delivery id', () => {
    F.__set('engineData', { can_manage: true });
    const out = F.engineDeliveryHtml(sent);
    assert.match(out, /<button type="button" class="btn btn-secondary btn-sm engine-retry" onclick="retryEngineDelivery\(5, this\)">Retry<\/button>/);
    assert.match(F.engineDeliveryHtml({ ...sent, status: 'pending' }), /retryEngineDelivery\(5, this\)/);
    F.__set('engineData', null);
  });
  test('no Retry for a delivered row, a test ping, a contract event without kunde_id, or for a member', () => {
    F.__set('engineData', { can_manage: true });
    assert.doesNotMatch(F.engineDeliveryHtml({ ...sent, status: 'success' }), /engine-retry/);
    assert.doesNotMatch(F.engineDeliveryHtml({ ...sent, event: 'test.ping', payload: { event: 'test.ping', kunde_id: null } }), /engine-retry/);
    assert.doesNotMatch(F.engineDeliveryHtml({ ...sent, payload: { event: 'vertrag.unterschrieben', kunde_id: null } }), /engine-retry/);
    assert.doesNotMatch(F.engineDeliveryHtml({ ...sent, payload: null }), /engine-retry/);
    F.__set('engineData', { can_manage: false });
    assert.doesNotMatch(F.engineDeliveryHtml(sent), /engine-retry/);
    F.__set('engineData', null);
    assert.doesNotMatch(F.engineDeliveryHtml(sent), /engine-retry/);
  });
  test('a pending row shows when the worker tries next; other statuses do not', () => {
    const out = F.engineDeliveryHtml({ ...sent, status: 'pending', next_attempt_at: '2026-09-28T10:15:00.000Z' });
    assert.match(out, /Next attempt /);
    assert.doesNotMatch(F.engineDeliveryHtml({ ...sent, status: 'failed', next_attempt_at: '2026-09-28T10:15:00.000Z' }), /Next attempt/);
    assert.doesNotMatch(F.engineDeliveryHtml({ ...sent, status: 'pending', next_attempt_at: null }), /Next attempt/);
  });
  test('retryEngineDelivery posts to the retry route, toasts the outcome and reloads the list; keys exist in both languages', () => {
    const fn = sliceFn(intg, 'retryEngineDelivery', 'integrations.js');
    assert.match(fn, /api\.post\(`\/api\/engine\/deliveries\/\$\{id\}\/retry`, \{\}\)/);
    assert.match(fn, /t\('engine_retry_ok'\)/); assert.match(fn, /tf\('engine_retry_failed', \{ error: /);
    assert.match(fn, /loadEngineDeliveries\(\)/);
    for (const k of ['engine_btn_retry', 'engine_retry_ok', 'engine_retry_failed', 'engine_next_attempt']) { assert.ok(k in dict.en, `en.${k}`); assert.ok(k in dict.de, `de.${k}`); }
    assert.equal(count(css, '.intg-log-entry-header .engine-retry {'), 1);
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
