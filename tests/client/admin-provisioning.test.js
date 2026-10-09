// CLIENT (static) tests for the Provisioning tab in public/admin.html.
//
// No browser: the inline <script> is extracted and `node --check`ed, the markup
// is asserted as text, and the pure functions are sliced out and executed with
// tests/helpers/client-fn.js. That is the house style here — a headless browser
// is not used in this repo.
//
// The two things most worth pinning: buildProvisionPayload (the form → API body
// shape, including which optional keys are omitted rather than sent empty) and
// renderProvisionRows, which interpolates WORKSPACE AND OWNER NAMES — both
// user-supplied — into HTML and must escape them.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, loadFns } = require('../helpers/client-fn');

const html = read('public/admin.html');
const inline = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
const panel = html.slice(html.indexOf('<div id="tab-provisioning"'), html.indexOf('<!-- /#tab-provisioning -->'));

const F = loadFns('public/admin.html',
  ['buildProvisionPayload', 'renderProvisionRows', 'esc', 'fmtProvDate']);

describe("admin.html's inline script still parses", () => {
  test('node --check on the extracted script', () => {
    const tmp = path.join(os.tmpdir(), `admin-inline-${process.pid}.js`);
    fs.writeFileSync(tmp, inline);
    try { execFileSync('node', ['--check', tmp]); } finally { fs.unlinkSync(tmp); }
  });
});

describe('markup: the tab bar and the provisioning panel', () => {
  test('both tabs exist and Platform Defaults is the one that starts active', () => {
    assert.match(html, /id="tabbtn-defaults"[^>]*onclick="showAdminTab\('defaults'\)"/);
    assert.match(html, /id="tabbtn-provisioning"[^>]*onclick="showAdminTab\('provisioning'\)"/);
    assert.match(html, /class="admin-tab active" id="tabbtn-defaults"/);
    // the provisioning panel is hidden until its tab is chosen
    assert.match(html, /<div id="tab-provisioning" class="hidden">/);
    assert.match(html, /<div id="tab-defaults">/);
  });

  test('the form has every input submitProvision reads', () => {
    for (const id of ['prov-ws-name', 'prov-owner-email', 'prov-owner-name',
                      'prov-create-deal', 'prov-webhook-active']) {
      assert.ok(panel.includes(`id="${id}"`), `missing #${id}`);
    }
    assert.match(panel, /id="prov-contact-fields"/);
    assert.match(panel, /id="prov-deal-fields"/);
    assert.match(panel, /onclick="addProvField\('contact'\)"/);
    assert.match(panel, /onclick="addProvField\('deal'\)"/);
    assert.match(panel, /id="prov-submit"[^>]*onclick="submitProvision\(\)"/);
  });

  test('both webhook defaults are checked, matching the API defaults', () => {
    assert.match(panel, /id="prov-create-deal" checked/);
    assert.match(panel, /id="prov-webhook-active" checked/);
  });

  test('the deal-fields section states that the webhook cannot fill them', () => {
    const dealSection = panel.slice(panel.indexOf('Deal custom fields'));
    assert.match(dealSection, /does\s*\n?\s*<strong>not<\/strong> fill these/);
  });

  test('the table head and every placeholder row agree on 8 columns', () => {
    const head = panel.slice(panel.indexOf('<thead>'), panel.indexOf('</thead>'));
    assert.equal((head.match(/<th>/g) || []).length, 8);
    for (const m of panel.matchAll(/colspan="(\d+)"/g)) assert.equal(m[1], '8');
    const rowsFn = require('../helpers/client-fn').sliceFn(html, 'renderProvisionRows', 'admin.html');
    for (const m of rowsFn.matchAll(/colspan="(\d+)"/g)) assert.equal(m[1], '8');
  });

  test('every function reachable by onclick is actually defined', () => {
    // Three sources of handlers: the panel's own markup, the tab bar above it,
    // and the HTML the renderers generate at runtime — a typo in any of them is
    // silent in a browser, so resolve them all against the script.
    const fromPanel = [...panel.matchAll(/onclick="(\w+)\(/g)].map(m => m[1]);
    const fromTabs  = [...html.matchAll(/onclick="(showAdminTab)\(/g)].map(m => m[1]);
    const generated = ['copyProvText', 'renderProvisionResult', 'resetProvisionForm', 'readProvFields', 'copyRow'];
    const called = new Set([...fromPanel, ...fromTabs, ...generated]);

    assert.deepEqual([...new Set(fromPanel)].sort(),
      ['addProvField', 'loadProvisionList', 'submitProvision'],
      'the panel wires up exactly these handlers');
    for (const fn of called) {
      assert.match(inline, new RegExp(`function\\s+${fn}\\s*\\(`), `${fn}() is referenced but not defined`);
    }
  });
});

describe('buildProvisionPayload: form → request body', () => {
  const base = {
    workspaceName: '  Acme Corp  ', ownerEmail: '  maria@acme.io ', ownerName: '',
    createDeal: true, webhookActive: true, contactFields: [], dealFields: [],
  };

  test('trims, and sends only the two required keys plus the booleans', () => {
    assert.deepEqual(F.buildProvisionPayload(base), {
      workspace_name: 'Acme Corp',
      owner_email: 'maria@acme.io',
      create_deal: true,
      webhook_active: true,
    });
  });

  test('empty optional values are OMITTED, not sent blank', () => {
    const body = F.buildProvisionPayload({ ...base, ownerName: '   ' });
    assert.ok(!('owner_name' in body), 'a blank owner name must not be sent');
    assert.ok(!('contact_fields' in body), 'an empty field list must not be sent');
    assert.ok(!('deal_fields' in body));
  });

  test('field lists and owner name come through when present', () => {
    const body = F.buildProvisionPayload({
      ...base,
      ownerName: ' Maria ',
      contactFields: [{ name: 'Lead Source', type: 'dropdown', options: ['Ads'] }],
      dealFields: [{ name: 'Seats', type: 'number' }],
    });
    assert.equal(body.owner_name, 'Maria');
    assert.deepEqual(body.contact_fields, [{ name: 'Lead Source', type: 'dropdown', options: ['Ads'] }]);
    assert.deepEqual(body.deal_fields, [{ name: 'Seats', type: 'number' }]);
  });

  test('the checkboxes are coerced to real booleans', () => {
    const body = F.buildProvisionPayload({ ...base, createDeal: undefined, webhookActive: 1 });
    assert.equal(body.create_deal, false, 'the API rejects a non-boolean');
    assert.equal(body.webhook_active, true);
  });
});

describe('renderProvisionRows: the workspace table', () => {
  const row = {
    id: 7, name: 'Acme', owner_name: 'Maria', owner_email: 'maria@acme.io',
    created_at: '2026-10-01T10:00:00Z', provisioned: true, member_count: 3,
    contact_field_count: 2, deal_field_count: 1, contact_count: 40, deal_count: 5,
    webhook_url: 'https://crm.test/api/integrations/receive/abc', webhook_active: true,
  };

  test('an empty list renders one spanning row, not an empty table', () => {
    assert.match(F.renderProvisionRows([]), /colspan="8"/);
    assert.match(F.renderProvisionRows(null), /colspan="8"/);
  });

  test('a provisioned workspace is badged, a pre-existing one shows a dash', () => {
    assert.match(F.renderProvisionRows([row]), /prov-badge yes">Provisioned/);
    assert.match(F.renderProvisionRows([{ ...row, provisioned: false }]), /prov-badge no">—/);
  });

  test('webhook state: active, inactive, or none at all', () => {
    assert.match(F.renderProvisionRows([row]), /prov-badge yes">Active/);
    assert.match(F.renderProvisionRows([{ ...row, webhook_active: false }]), /prov-badge off">Inactive/);
    const none = F.renderProvisionRows([{ ...row, webhook_url: null }]);
    assert.match(none, /prov-badge no">none/);
    assert.doesNotMatch(none, /Copy URL/, 'nothing to copy when there is no webhook');
  });

  test('a workspace with no owner row says so instead of printing "undefined"', () => {
    const out = F.renderProvisionRows([{ ...row, owner_email: null, owner_name: null }]);
    assert.match(out, /no owner row/);
    assert.doesNotMatch(out, /undefined|null/);
  });

  test('a hostile workspace or owner name cannot inject markup', () => {
    const out = F.renderProvisionRows([{
      ...row,
      name: '<img src=x onerror="alert(1)">',
      owner_name: '</td><script>alert(2)</script>',
      owner_email: '"><svg onload=alert(3)>',
    }]);
    assert.doesNotMatch(out, /<img/, 'the workspace name was not escaped');
    assert.doesNotMatch(out, /<script>/, 'the owner name was not escaped');
    assert.doesNotMatch(out, /<svg/, 'the owner email was not escaped');
    assert.match(out, /&lt;img/);
  });

  test('no password is ever rendered into the table', () => {
    // The list endpoint does not return one — only bcrypt hashes are stored —
    // and the renderer must not invent a column for it.
    const src = require('../helpers/client-fn').sliceFn(html, 'renderProvisionRows', 'admin.html');
    assert.doesNotMatch(src, /password/i);
  });
});

describe('esc and fmtProvDate', () => {
  test('esc covers all five HTML-significant characters', () => {
    assert.equal(F.esc(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
  });
  test('esc renders null and undefined as empty, not as the words', () => {
    assert.equal(F.esc(null), '');
    assert.equal(F.esc(undefined), '');
  });
  test('fmtProvDate degrades to a dash rather than "Invalid Date"', () => {
    assert.equal(F.fmtProvDate(null), '—');
    assert.equal(F.fmtProvDate('not a date'), '—');
    assert.ok(F.fmtProvDate('2026-10-01T10:00:00Z').length > 4);
  });
});
