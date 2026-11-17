// CLIENT tests for the lead-webhook card: up to five named webhooks (LEAD_WEBHOOK_CHANGES Part 1; five since Part 6).
// The markup builders run against a tiny fake DOM, and the calls that write are checked for being scoped to ONE webhook
// id — a save that still went to /settings would rewrite all of them, which is exactly the failure this feature must avoid.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const intg = read('public/js/integrations.js');
const html = read('public/index.html');
const css  = read('public/style.css');

// Built inside the sandbox: a document whose getElementById returns a tiny element with innerHTML, value and the one
// classList method the renderers use. `dom` is handed back so a test can look at what was drawn.
const SETUP = `
  const UI_ICON = { plus: '<svg-plus>' };
  const t = k => k;
  const esc = s => String(s);
  const dom = {};
  const make = id => {
    const el = { id, innerHTML: '', value: '', hidden: false,
      classList: { toggle(cls, on) { if (cls === 'hidden') el.hidden = on; } } };
    return el;
  };
  const document = { getElementById: id => (dom[id] ||= make(id)) };
`;

const WEBHOOKS = [
  { id: 1, name: 'Webhook 1', active: true,  webhook_key: 'k1' },
  { id: 2, name: 'Facebook',  active: false, webhook_key: 'k2' },
];

function loadCard(names, state) {
  return loadFns('public/js/integrations.js', names, { state, extra: SETUP, expose: ['dom'] });
}

describe('renderIntgWebhookTabs: one tab per webhook, plus the add button until the cap', () => {
  const load = () => loadCard(['intgWebhook', 'renderIntgWebhookTabs'], {
    intgWebhooks: WEBHOOKS, currentWebhookId: 2, intgData: { max_webhooks: 5 },
  });
  // The two above plus as many more as it takes to have `n` (LEAD_WEBHOOK_CHANGES Part 6: the cap is five).
  const upTo = n => [...WEBHOOKS, ...Array.from({ length: n - WEBHOOKS.length }, (_, i) => ({ id: 3 + i, name: `Source ${3 + i}`, active: true }))];

  test('the selected webhook is marked active, the inactive one dimmed, and both names are printed', () => {
    const F = load();
    F.renderIntgWebhookTabs();
    const out = F.dom['intg-webhook-list'].innerHTML;

    assert.match(out, /class="intg-webhook-tab active off"\s+data-webhook="2"/, 'selected, and switched off');
    assert.match(out, /class="intg-webhook-tab"\s+data-webhook="1"/, 'on, just not selected');
    assert.match(out, />Webhook 1</);
    assert.match(out, />Facebook</);
    assert.match(out, /onclick="selectIntgWebhook\(1\)"/);
    assert.match(out, /onclick="addIntgWebhook\(\)"/, 'room for more');
  });

  test('four webhooks still leave room for a fifth', () => {
    const F = load();
    F.__set('intgWebhooks', upTo(4));
    F.renderIntgWebhookTabs();
    const out = F.dom['intg-webhook-list'].innerHTML;

    assert.equal((out.match(/data-webhook="/g) || []).length, 4, 'one tab each');
    assert.match(out, /onclick="addIntgWebhook\(\)"/);
    assert.doesNotMatch(out, /intg-webhook-count/);
  });

  test('at the cap the add button is gone and the card says why', () => {
    const F = load();
    F.__set('intgWebhooks', upTo(5));
    F.renderIntgWebhookTabs();
    const out = F.dom['intg-webhook-list'].innerHTML;

    assert.equal((out.match(/data-webhook="/g) || []).length, 5);
    assert.doesNotMatch(out, /addIntgWebhook/);
    assert.match(out, /class="intg-webhook-count">intg_add_webhook_max</);
  });

  test('a page that was not told the cap assumes five, the server\'s own number', () => {
    const F = load();
    F.__set('intgData', {});
    F.__set('intgWebhooks', upTo(4));
    F.renderIntgWebhookTabs();
    assert.match(F.dom['intg-webhook-list'].innerHTML, /addIntgWebhook/);

    F.__set('intgWebhooks', upTo(5));
    F.renderIntgWebhookTabs();
    assert.doesNotMatch(F.dom['intg-webhook-list'].innerHTML, /addIntgWebhook/);

    const route = read('routes/integrations.js');
    assert.match(route, /^const MAX_WEBHOOKS = 5;/m, 'the cap the server enforces');
  });

  test('both languages name five, in the hint and in the refusal', () => {
    const core = read('public/js/core.js');
    assert.match(core, /intg_webhooks_hint:'Up to five,/);
    assert.match(core, /intg_webhooks_hint:'Bis zu fünf,/);
    assert.match(core, /intg_err_limit:'A workspace can have at most five lead webhooks\.'/);
    assert.match(core, /intg_err_limit:'Ein Arbeitsbereich kann höchstens fünf Lead-Webhooks haben\.'/);
    assert.match(html, /data-i18n="intg_webhooks_hint">Up to five,/);
    assert.doesNotMatch(core, /intg_(webhooks_hint|err_limit):'[^']*(three|drei)/);
  });

  test('the "bookings use the first webhook" note shows only while the first is selected', () => {
    const F = load();
    F.renderIntgWebhookTabs();
    assert.equal(F.dom['intg-webhook-default-hint'].hidden, true, 'Facebook is selected, not the first');

    F.__set('currentWebhookId', 1);
    F.renderIntgWebhookTabs();
    assert.equal(F.dom['intg-webhook-default-hint'].hidden, false);
  });

  test('intgWebhook() answers with the selected row, else the first one', () => {
    const F = load();
    assert.equal(F.intgWebhook().id, 2);
    F.__set('currentWebhookId', 99);
    assert.equal(F.intgWebhook().id, 1, 'a deleted selection falls back to the oldest');
  });
});

describe('renderIntgLogFilter: all webhooks, and the choice survives a reload', () => {
  test('lists every webhook, keeps a valid selection, drops a deleted one', () => {
    const F = loadCard(['renderIntgLogFilter'], { intgWebhooks: WEBHOOKS });
    F.renderIntgLogFilter();                 // draws the element into the fake DOM
    const select = F.dom['intg-log-filter'];

    select.value = '2';
    F.renderIntgLogFilter();
    assert.match(select.innerHTML, /<option value="">intg_log_all_webhooks<\/option>/);
    assert.match(select.innerHTML, /<option value="1">Webhook 1<\/option>/);
    assert.equal(select.value, '2', 'the filter stays on the chosen webhook');

    select.value = '9';
    F.renderIntgLogFilter();
    assert.equal(select.value, '', 'a deleted webhook falls back to All');
  });
});

describe('every write names the webhook it changes', () => {
  test('save, rename, delete and regenerate use /settings/:id', () => {
    const save = sliceFn(intg, 'saveIntegration', 'integrations.js');
    assert.match(save, /api\.patch\(`\/api\/integrations\/settings\/\$\{wh\.id\}`/);
    assert.doesNotMatch(save, /api\.patch\('\/api\/integrations\/settings'/);

    const rename = sliceFn(intg, 'renameIntgWebhook', 'integrations.js');
    assert.match(rename, /api\.patch\(`\/api\/integrations\/settings\/\$\{wh\.id\}`/);

    const del = sliceFn(intg, 'deleteIntgWebhook', 'integrations.js');
    assert.match(del, /api\.del\(`\/api\/integrations\/settings\/\$\{wh\.id\}`/);

    const regen = sliceFn(intg, 'regenerateWebhookKey', 'integrations.js');
    assert.match(regen, /api\.post\(`\/api\/integrations\/settings\/\$\{wh\.id\}\/regenerate-key`/);
  });

  test('the loader takes the whole list, not one webhook', () => {
    const reload = sliceFn(intg, 'reloadIntgSettings', 'integrations.js');
    assert.match(reload, /intgWebhooks = Array\.isArray\(data\.webhooks\) \? data\.webhooks : \[\]/);
    assert.match(reload, /intgData = data/);
  });

  test('the errors the server sends are answered in the user\'s language', () => {
    const F = loadFns('public/js/integrations.js', ['intgErrorText'], { extra: 'const t = k => k;' });
    assert.equal(F.intgErrorText({ error: 'x', reason: 'limit' }), 'intg_err_limit');
    assert.equal(F.intgErrorText({ error: 'x', reason: 'name_taken' }), 'intg_err_name_taken');
    assert.equal(F.intgErrorText({ error: 'x', reason: 'last_webhook' }), 'intg_err_last_webhook');
    assert.equal(F.intgErrorText({ error: 'server said no' }), 'server said no');
  });

  test('the CSV import\'s assignee fallback reads the first webhook of the list', () => {
    const src = read('public/js/admin-import.js');
    assert.match(src, /intgSettings\?\.webhooks\?\.\[0\]\?\.default_assignee_id/);
    assert.doesNotMatch(src, /intgSettings\?\.webhook\?\./);
  });
});

describe('the markup and the styles the card needs are there', () => {
  test('the pane carries the tab list, the name field and the delete button', () => {
    assert.match(html, /<div id="intg-webhook-list" class="intg-webhook-tabs"><\/div>/);
    assert.match(html, /<input type="text" id="intg-webhook-name"[^>]*maxlength="60"/);
    assert.match(html, /onchange="renameIntgWebhook\(\)"/);
    assert.match(html, /id="intg-delete-btn"[^>]*onclick="deleteIntgWebhook\(\)"/);
    assert.match(html, /<select id="intg-log-filter"[^>]*onchange="loadIntgLogs\(\)"><\/select>/);
    assert.match(html, /id="intg-webhook-default-hint"[^>]*class="intg-section-hint hidden"/);
  });

  test('the styles for the tabs, the log badge and the filter exist', () => {
    for (const cls of ['intg-webhook-tabs', 'intg-webhook-tab', 'intg-webhook-dot', 'intg-webhook-add',
      'intg-webhook-count', 'intg-log-webhook', 'intg-log-toolbar', 'intg-log-filter']) {
      assert.match(css, new RegExp(`\\.${cls}\\b`), cls);
    }
  });
});
