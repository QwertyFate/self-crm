// CLIENT (static + pure-function) tests: the admin console's "Engine Monitor" tab —
// switches, tiles, the incoming-request and outgoing-webhook tables, the filters,
// the auto-refresh, and the renderers (escaping, badges, copy button).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const html   = read('public/admin.html');
const panel  = html.slice(html.indexOf('<div id="tab-monitor"'), html.indexOf('<!-- /#tab-monitor -->'));
const inline = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));
const count = (src, needle) => src.split(needle).length - 1;

const F = loadFns('public/admin.html', ['renderMonitorRequests', 'renderMonitorDeliveries', 'monStatusBadge', 'renderMonitorTiles'], {
  state: {},
  extra: [sliceFn(inline, 'esc', 'admin.html'), sliceFn(inline, 'fmtProvDate', 'admin.html'),
    "const document = { getElementById: id => (document._els[id] ||= { innerHTML: '' }), _els: {} };"].join('\n'),
  expose: ['document'],
});

describe('the tab', () => {
  test('a fifth tab after Engine API, a hidden panel, showAdminTab knows it and loads it', () => {
    assert.match(html, /id="tabbtn-engine"[^>]*>Engine API<\/button>\s*<button class="admin-tab"\s+id="tabbtn-monitor"\s+onclick="showAdminTab\('monitor'\)">Engine Monitor<\/button>/);
    assert.match(html, /<div id="tab-monitor" class="hidden">/);
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine', 'monitor'\]\)/);
    assert.match(inline, /if \(name === 'monitor'\) loadEngineMonitor\(\);/);
  });
  test('the switches: two status badges and two buttons wired to toggleEngineControl, disabled until loaded', () => {
    for (const id of ['mon-api-status', 'mon-webhooks-status', 'mon-api-btn', 'mon-webhooks-btn']) assert.equal(count(panel, `id="${id}"`), 1, id);
    assert.match(panel, /onclick="toggleEngineControl\('api_enabled'\)" disabled/);
    assert.match(panel, /onclick="toggleEngineControl\('webhooks_enabled'\)" disabled/);
    assert.match(panel, /503 api_deaktiviert/); assert.match(panel, /held back/);
  });
  test('tiles, filters, auto-refresh and the two tables with their column sets', () => {
    for (const id of ['mon-tiles', 'mon-auto', 'mon-workspace', 'mon-req-status', 'mon-del-status', 'mon-req-body', 'mon-del-body']) assert.equal(count(panel, `id="${id}"`), 1, id);
    assert.match(panel, /onchange="setMonitorAutoRefresh\(this\.checked\)"/);
    assert.equal(count(panel, 'onchange="monitorFilterChanged()"'), 3);
    assert.match(panel, /<th>Time<\/th><th>Workspace<\/th><th>Key<\/th><th>Request<\/th><th>Status<\/th><th>Error code<\/th><th>ms<\/th><th>IP<\/th>/);
    assert.match(panel, /<th>Time<\/th><th>Workspace<\/th><th>Event<\/th><th>About<\/th><th>Status<\/th><th>Attempts<\/th><th>Last answer<\/th><th>Next attempt<\/th><th><\/th>/);
    assert.match(panel, /never the body/); assert.match(panel, /30 days/); assert.match(panel, /never affects the CRM/);
  });
  test('every handler the panel references is defined; the loader hits the five admin endpoints; disabling asks first', () => {
    for (const m of panel.matchAll(/on(?:click|change)="(\w+)\(/g)) assert.match(inline, new RegExp(`function\\s+${m[1]}\\s*\\(`), m[1]);
    const load = sliceFn(inline, 'loadEngineMonitor', 'admin.html');
    for (const p of ["monFetch('workspaces')", "monFetch('summary')", 'monFetch(`requests?${q}status=', 'monFetch(`deliveries?${q}status=']) assert.ok(load.includes(p), p);
    assert.match(sliceFn(inline, 'monFetch', 'admin.html'), /fetch\(`\$\{API_BASE\}\/engine\/\$\{pathAndQuery\}`\)/);
    const toggle = sliceFn(inline, 'toggleEngineControl', 'admin.html');
    assert.match(toggle, /if \(!next\) \{[\s\S]*?if \(!confirm\(warning\)\) return;/);
    assert.match(toggle, /\/engine\/controls`, \{\s*method: 'PATCH'/);
    assert.match(sliceFn(inline, 'setMonitorAutoRefresh', 'admin.html'), /setInterval\([\s\S]*?10000\)/);
  });
  test('the Engine API tutorial\'s errors table now lists 413 and 503 (the switch)', () => {
    const tut = html.slice(html.indexOf('<div id="tab-engine"'), html.indexOf('<!-- /#tab-engine -->'));
    assert.match(tut, /<td><code>413<\/code><\/td><td><code>anfrage_zu_gross<\/code>/);
    assert.match(tut, /<td><code>503<\/code><\/td><td><code>api_deaktiviert<\/code>/);
  });
});

describe('renderers', () => {
  test('monStatusBadge: 2xx yes, 4xx no, 5xx off', () => {
    assert.equal(F.monStatusBadge(200), '<span class="prov-badge yes">200</span>');
    assert.equal(F.monStatusBadge('404'), '<span class="prov-badge no">404</span>');
    assert.equal(F.monStatusBadge(503), '<span class="prov-badge off">503</span>');
  });
  test('requests: empty state; a row with workspace, key prefix, request, badge, code; everything escaped', () => {
    assert.match(F.renderMonitorRequests([]), /No requests in this view/);
    const out = F.renderMonitorRequests([{ id: 1, created_at: '2026-10-09T10:00:00.000Z', workspace_id: 7, workspace_name: 'A <b>', api_key_id: 5, key_name: 'Engine "prod"', key_prefix: 'upg_live_abc', method: 'PATCH', path: '/api/kunden/42/status', status: 422, duration_ms: 12, fehler_code: 'ungueltiger_status', ip: '10.0.0.5' }]);
    assert.match(out, /A &lt;b&gt; <span class="prov-hint">#7<\/span>/);
    assert.match(out, /Engine &quot;prod&quot; <span class="prov-hint">upg_live_abc…<\/span>/);
    assert.match(out, /<code class="mon-code">PATCH \/api\/kunden\/42\/status<\/code>/);
    assert.match(out, /prov-badge no">422/); assert.match(out, /<code class="mon-code">ungueltiger_status<\/code>/);
    assert.match(out, /<td>12<\/td>/);
    const anon = F.renderMonitorRequests([{ id: 2, created_at: 'x', workspace_id: null, method: 'GET', path: '/api/kunden/1', status: 401, fehler_code: 'nicht_authentifiziert' }]);
    assert.equal(count(anon, '<span class="prov-hint">—</span>'), 2, 'no workspace, no key');
  });
  test('deliveries: badge by status, about from deal/contact/payload, last error, next attempt only when pending, copy-payload button with the JSON', () => {
    const rows = [
      { id: 1, created_at: 'c', workspace_id: 7, workspace_name: 'A', event: 'vertrag.unterschrieben', status: 'pending', attempts: 2, last_status_code: 503, last_error: 'HTTP 503 <down>', next_attempt_at: '2026-10-09T12:00:00.000Z', deal_title: 'Deal <1>', payload: { kunde_id: 42, event: 'vertrag.unterschrieben' } },
      { id: 2, created_at: 'c', workspace_id: 7, workspace_name: 'A', event: 'kunde.angelegt', status: 'success', attempts: 1, last_status_code: 200, contact_name: 'Erika', payload: { kunde_id: 42 } },
      { id: 3, created_at: 'c', workspace_id: 7, workspace_name: 'A', event: 'test.ping', status: 'failed', attempts: 1, last_status_code: 401, payload: { kunde_id: null, daten: { workspace_id: 7 } } },
    ];
    const out = F.renderMonitorDeliveries(rows);
    assert.match(out, /prov-badge no">pending/); assert.match(out, /prov-badge yes">success/); assert.match(out, /prov-badge off">failed/);
    assert.match(out, /<td>Deal &lt;1&gt;<\/td>/); assert.match(out, /<td>Erika<\/td>/);
    assert.match(out, /HTTP 503<div class="prov-hint mon-err">HTTP 503 &lt;down&gt;<\/div>/);
    assert.equal(count(out, 'Copy payload'), 3);
    // JSON.stringify twice: the inner quotes are backslash-escaped, the outer ones become &quot; for the attribute
    assert.match(out, /copyProvText\(&quot;\{\\n  \\&quot;kunde_id\\&quot;: 42/);
    assert.doesNotMatch(out, /<down>/);
    assert.match(F.renderMonitorDeliveries([]), /No events in this view/);
  });
  test('tiles: ten tiles, colour classes only when the number is non-zero', () => {
    F.renderMonitorTiles({ requests: { requests_24h: 31, requests_24h_4xx: 0, requests_24h_5xx: 2, avg_ms_24h: 48 }, deliveries: { sent_24h: 12, delivered_24h: 9, pending: 0, failed_24h: 1 }, setup: { active_workspaces: 1, live_keys: 2 } });
    const html = F.document._els['mon-tiles'].innerHTML;
    assert.equal(count(html, 'class="mon-tile'), 10);
    assert.match(html, /<div class="mon-tile bad"><div class="mon-num">2<\/div><div class="mon-label">5xx answers<\/div>/);
    assert.match(html, /<div class="mon-tile "><div class="mon-num">0<\/div><div class="mon-label">4xx answers<\/div>/);
    assert.match(html, /<div class="mon-tile good"><div class="mon-num">9<\/div><div class="mon-label">delivered<\/div>/);
  });
});
