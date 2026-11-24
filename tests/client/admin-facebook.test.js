// CLIENT (static + pure-function) tests: the admin console's "Facebook" tab (FACEBOOK_CHANGES Part 1, 2026-11-23;
// public/admin.html, routes/admin-facebook.js): the status, the buttons that fit it, the Pages table, and what the
// console says when Facebook sends the browser back.
// Part 3: "Receiving leads" — whether the Meta app is registered to tell this server of a new lead, and the button
// that registers it.
// Part 4: the table's "Leads" column — is the app really on the Page at Facebook, how many leads arrived, and what
// became of the last one.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const html   = read('public/admin.html');
const panel  = html.slice(html.indexOf('<div id="tab-facebook"'), html.indexOf('<!-- /#tab-facebook -->'));
const inline = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));
const count = (src, needle) => src.split(needle).length - 1;

const F = loadFns('public/admin.html', ['renderFacebookStatus', 'renderFacebookActions', 'renderFacebookPages', 'facebookReturn', 'loadFacebook', 'connectFacebook', 'disconnectFacebook',
  'facebookWorkspaceOptions', 'facebookWebhookOptions', 'renderFacebookPageRow', 'facebookWorkspaceChosen', 'assignFacebookPage', 'unassignFacebookPage',
  'renderFacebookReceiver', 'renderFacebookReceiverActions', 'loadFacebookReceiver', 'registerFacebookReceiver', 'facebookLeadOutcome', 'renderFacebookLeads'], {
  state: { facebookStatus: null, facebookTargets: [] },
  extra: [sliceFn(inline, 'esc', 'admin.html'), sliceFn(inline, 'fmtProvDate', 'admin.html'), sliceFn(inline, 'fmtVisitTime', 'admin.html'), inline.match(/^    const FB_OUTCOMES = \{[\s\S]*?^    \};/m)[0], inline.match(/^    const facebookSay = .*$/m)[0],
    inline.match(/^    const FB_LEAD_REASONS = \{[\s\S]*?^    \};/m)[0], inline.match(/^    const facebookCount = .*$/m)[0],
    `const API_BASE = '/api/admin';
     const document = { getElementById: id => (document._els[id] ||= { innerHTML: '', textContent: '', value: '', style: {}, classList: { remove(c) { document._els[id].removed = c; } } }), _els: {} };
     const location = { search: '', pathname: '/adminconsole', href: '' };
     const history = { replaced: [], replaceState(a, b, url) { history.replaced.push(url); } };
     const __shown = [], __asked = [];
     let __answers = {}, __confirm = true;
     function showAdminTab(name) { __shown.push(name); }
     function confirm(text) { __asked.push(['confirm', text]); return __confirm; }
     async function fetch(url, init) { __asked.push(init && init.body && init.method !== 'POST' ? [init.method, url, JSON.parse(init.body)] : [(init && init.method) || 'GET', url]); const a = __answers[((init && init.method) || 'GET') + ' ' + url]; if (a instanceof Error) throw a; return { json: async () => a }; }
     function __set2(k, v) { if (k === 'answers') __answers = v; else if (k === 'confirm') __confirm = v; else if (k === 'search') location.search = v; }
     function __reset() { document._els = {}; __shown.length = 0; __asked.length = 0; history.replaced.length = 0; location.search = ''; location.href = ''; __answers = {}; __confirm = true; }`].join('\n'),
  expose: ['document', 'location', 'history', '__shown', '__asked', '__set2', '__reset', 'FB_LEAD_REASONS', 'facebookCount', 'fmtVisitTime'],
});
const CONNECTED = { configured: true, redirect_uri: 'https://crm.example.de/api/admin/facebook/callback', version: 'v26.0', scopes: ['pages_show_list', 'leads_retrieval'],
  connection: { user_id: '77', name: 'Olga <b>Owner</b>', connected_at: '2026-11-23T10:00:00.000Z', expires_at: '2027-01-22T10:00:00.000Z', scopes: ['pages_show_list', 'leads_retrieval'], missing: [] } };

describe('the tab', () => {
  test('a seventh tab after "CRM access", its hidden panel, and showAdminTab loads it', () => {
    assert.match(html, /id="tabbtn-crm"[^>]*>CRM access<\/button>\s*<button class="admin-tab"\s+id="tabbtn-facebook"\s+onclick="showAdminTab\('facebook'\)">Facebook<\/button>/);
    assert.match(html, /<div id="tab-facebook" class="hidden">/);
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine', 'monitor', 'crm', 'facebook', 'assistant'\]\)/);
    assert.match(inline, /if \(name === 'facebook'\) loadFacebook\(\);/);
    assert.match(inline, /loadDashboard\(\);\s+facebookReturn\(\);/, 'back from Facebook\'s sign-in page the console opens on this tab');
    assert.match(inline, /^    let facebookTargets = \[\];/m, 'a list from the first moment: a workspace chosen before the tab finished loading finds nothing, not an error');
  });
  test('what stands in it: the status, the buttons, the setup with the address to register, the Pages table', () => {
    for (const id of ['fb-status', 'fb-actions', 'fb-error', 'fb-redirect', 'fb-scopes', 'fb-version', 'fb-pages-body', 'fb-receiver-section', 'fb-receiver', 'fb-receiver-actions', 'fb-receiver-error', 'fb-receive-url', 'fb-verify-token']) assert.equal(count(panel, `id="${id}"`), 1, id);
    assert.match(panel, /<th>Page<\/th><th>Page ID<\/th><th>You may advertise<\/th><th>Workspace<\/th><th>Lead webhook<\/th><th>Leads<\/th><th><\/th><\/tr>/);
    assert.match(panel, /One Page belongs to one workspace; a workspace can have several Pages\./);
    assert.match(panel, /Valid OAuth Redirect URIs/); assert.match(panel, /<code>META_APP_ID<\/code> and <code>META_APP_SECRET<\/code>/);
    assert.match(panel, /The customers never sign in at Facebook/);
    assert.doesNotMatch(panel, /app secret value|access_token/i, 'no place to type or show a secret');
  });
});

describe('the status', () => {
  test('could not be loaded, not set up, not connected', () => {
    for (const data of [null, undefined, { error: true }]) assert.equal(F.renderFacebookStatus(data), '<span class="prov-badge off">Could not be loaded</span>');
    assert.match(F.renderFacebookStatus({ configured: false, connection: null }), /^<span class="prov-badge off">Not set up<\/span> <span class="prov-hint">META_APP_ID and META_APP_SECRET are not in the server's \.env yet/);
    assert.equal(F.renderFacebookStatus({ configured: true, connection: null }), '<span class="prov-badge no">Not connected</span> <span class="prov-hint">No Facebook account is connected.</span>');
  });
  test('connected: as whom, since when, until when — and a name stays text', () => {
    const out = F.renderFacebookStatus(CONNECTED);
    assert.match(out, /^<span class="prov-badge yes">Connected<\/span> as <strong>Olga &lt;b&gt;Owner&lt;\/b&gt;<\/strong> <span class="prov-hint">\(Facebook user 77, since /);
    assert.match(out, /The sign-in runs until [^<]*2027[^<]*\. Connect again before then: Facebook gives a person's sign-in about 60 days\./);
    assert.doesNotMatch(out, /<b>Owner|Not given at sign-in/);
    assert.doesNotMatch(F.renderFacebookStatus({ ...CONNECTED, connection: { ...CONNECTED.connection, expires_at: null } }), /runs until/, 'no time named: no such line');
    assert.match(F.renderFacebookStatus({ ...CONNECTED, connection: { ...CONNECTED.connection, name: '' } }), /as <strong>someone<\/strong>/);
    assert.match(F.renderFacebookStatus({ ...CONNECTED, connection: { ...CONNECTED.connection, user_id: '<i>7</i>' } }), /\(Facebook user &lt;i&gt;7&lt;\/i&gt;, since /, 'whatever came back as the id stays text');
  });
  test('permissions that were not given are named, each as text', () => {
    const out = F.renderFacebookStatus({ ...CONNECTED, connection: { ...CONNECTED.connection, missing: ['leads_retrieval', '<i>x</i>'] } });
    assert.match(out, /<strong>Not given at sign-in:<\/strong> <code>leads_retrieval<\/code>, <code>&lt;i&gt;x&lt;\/i&gt;<\/code>\. Connect again and allow them, or leads cannot be read\./);
  });
});

describe('the buttons', () => {
  test('none while it cannot be used, "Connect Facebook" when not connected, "Connect again" and "Disconnect" when connected', () => {
    for (const data of [null, { error: true }, { configured: false }]) assert.equal(F.renderFacebookActions(data), '');
    assert.equal(F.renderFacebookActions({ configured: true, connection: null }), '<button class="btn btn-primary" onclick="connectFacebook()">Connect Facebook</button>');
    assert.equal(F.renderFacebookActions(CONNECTED), '<button class="btn btn-primary" onclick="connectFacebook()">Connect again</button><button class="btn" onclick="disconnectFacebook()">Disconnect</button>');
  });
});

const TARGETS = [{ id: 8, name: 'acme <b>', webhooks: [{ id: 80, name: 'Leads', active: true }] }, { id: 9, name: 'Leer', webhooks: [] },
  { id: 7, name: 'Müller & Söhne', webhooks: [{ id: 70, name: 'Website <i>', active: true }, { id: 71, name: 'Facebook', active: false }] }];
const options = html => [...html.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)</g)].map(m => [m[1], !!m[2], m[3]]);

describe('the Pages', () => {
  test('a Page that can be given: its name as text, two lists — workspaces, and "choose a workspace first" — and one button', () => {
    const out = F.renderFacebookPageRow({ id: '100', name: 'Müller <b>Immobilien</b>', can_advertise: true, assigned: null }, TARGETS);
    assert.match(out, /^<tr><td>Müller &lt;b&gt;Immobilien&lt;\/b&gt;<\/td><td><code>100<\/code><\/td><td><span class="prov-badge yes">Yes<\/span><\/td><td><select id="fb-ws-100" onchange="facebookWorkspaceChosen\('100'\)">/);
    assert.deepEqual(options(out.slice(out.indexOf('id="fb-ws-100"'), out.indexOf('</select>'))), [['', false, '— choose —'], ['8', false, 'acme &lt;b&gt;'], ['9', false, 'Leer'], ['7', false, 'Müller &amp; Söhne']]);
    assert.match(out, /<select id="fb-wh-100"><option value="">— choose a workspace first —<\/option><\/select>/);
    assert.match(out, /<button class="btn btn-primary" onclick="assignFacebookPage\('100'\)">Give to workspace<\/button> <\/td><\/tr>$/);
    assert.doesNotMatch(out, /Take back|<b>Immobilien|was deleted/, 'a Page that is not given has nothing to take back and no webhook that could have been deleted');
    for (const targets of [null, undefined, 'x']) assert.match(F.renderFacebookPageRow({ id: '100', name: 'Seite', can_advertise: true, assigned: null }, targets), /<select id="fb-ws-100"[^>]*><option value="">— choose —<\/option><\/select>/, 'nothing to give it to yet: the row still stands');
    assert.match(F.renderFacebookPageRow({ id: '100', name: 'Seite', can_advertise: true, assigned: { workspace_id: 7, workspace_name: 'W', webhook_id: 70, webhook_name: 'h' } }, null), /<select id="fb-wh-100"><option value="">— choose a workspace first —<\/option>/);
  });
  test('a Page that is given: its workspace and its lead webhook are chosen, "Save" and "Take back"', () => {
    const out = F.renderFacebookPageRow({ id: '100', name: 'Seite', can_advertise: true, assigned: { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: 71, webhook_name: 'Facebook' } }, TARGETS);
    assert.deepEqual(options(out.slice(out.indexOf('id="fb-ws-100"'), out.indexOf('</select>'))).filter(o => o[1]), [['7', true, 'Müller &amp; Söhne']]);
    const hooks = out.slice(out.indexOf('id="fb-wh-100"'));
    assert.deepEqual(options(hooks.slice(0, hooks.indexOf('</select>'))), [['', false, '— choose —'], ['70', false, 'Website &lt;i&gt;'], ['71', true, 'Facebook (switched off)']]);
    assert.match(out, /onclick="assignFacebookPage\('100'\)">Save<\/button> <button class="btn" onclick="unassignFacebookPage\('100'\)">Take back<\/button><\/td><\/tr>$/);
    assert.doesNotMatch(out, /was deleted/);
  });
  test('given, but its lead webhook was deleted: said, and none is chosen', () => {
    const out = F.renderFacebookPageRow({ id: '100', name: 'Seite', can_advertise: true, assigned: { workspace_id: 7, workspace_name: 'x', webhook_id: null, webhook_name: null } }, TARGETS);
    assert.match(out, /<\/select> <span class="prov-hint">Its lead webhook was deleted: choose one\.<\/span><\/td>/);
    const hooks = out.slice(out.indexOf('id="fb-wh-100"'));
    assert.equal(options(hooks.slice(0, hooks.indexOf('</select>'))).filter(o => o[1]).length, 0);
  });
  test('a Page whose leads cannot be read has no lists: it cannot be given — and one that was given can only be taken back', () => {
    const none = F.renderFacebookPageRow({ id: '200', name: 'Nur Lesen', can_advertise: false, assigned: null }, TARGETS);
    assert.equal(none, '<tr><td>Nur Lesen</td><td><code>200</code></td><td><span class="prov-badge off">No</span> <span class="prov-hint">leads of this Page cannot be read</span></td><td colspan="2" class="prov-hint">Cannot be given to a workspace.</td><td><span class="prov-hint">—</span></td><td></td></tr>');
    const was = F.renderFacebookPageRow({ id: '200', name: '', can_advertise: false, assigned: { workspace_id: 8, workspace_name: 'acme <b>', webhook_id: 80, webhook_name: 'Leads' } }, TARGETS);
    assert.match(was, /<td>\(no name\)<\/td>/);
    assert.match(was, /<td colspan="2" class="prov-hint">Given to acme &lt;b&gt;, but its leads cannot be read any more\.<\/td><td><div class="prov-hint">No lead yet\.<\/div><\/td><td><button class="btn" onclick="unassignFacebookPage\('200'\)">Take back<\/button><\/td><\/tr>$/);
    assert.doesNotMatch(none + was, /<select/);
  });
  test('only a number ever goes into a handler: a Page whose id is none gets no button and no list', () => {
    const out = F.renderFacebookPageRow({ id: "1');alert(1);('", name: 'x', can_advertise: true, assigned: { workspace_id: 7, workspace_name: 'w', webhook_id: 70, webhook_name: 'h' } }, TARGETS);
    assert.doesNotMatch(out, /onclick|<select/);
    assert.match(out, /<code>1&#39;\);alert\(1\);\(&#39;<\/code>/, 'the id itself is shown, as text');
    assert.match(out, /<td colspan="2" class="prov-hint">This Page has an id the console cannot work with\.<\/td><td><div class="prov-hint">No lead yet\.<\/div><\/td><td><\/td><\/tr>$/);
  });
  test('the lists: workspaces with the chosen one marked; a workspace\'s lead webhooks, or why there is nothing to choose', () => {
    assert.deepEqual(options(F.facebookWorkspaceOptions(TARGETS, 9)), [['', false, '— choose —'], ['8', false, 'acme &lt;b&gt;'], ['9', true, 'Leer'], ['7', false, 'Müller &amp; Söhne']]);
    assert.deepEqual(options(F.facebookWorkspaceOptions(TARGETS, '8')).filter(o => o[1]).map(o => o[0]), ['8'], 'an id as text is the id');
    for (const t of [null, undefined, 'x']) assert.deepEqual(options(F.facebookWorkspaceOptions(t, 7)), [['', false, '— choose —']]);
    assert.deepEqual(options(F.facebookWebhookOptions(null, 70)), [['', false, '— choose a workspace first —']]);
    assert.deepEqual(options(F.facebookWebhookOptions(TARGETS[1], null)), [['', false, 'This workspace has no lead webhook yet']]);
    assert.deepEqual(options(F.facebookWebhookOptions(TARGETS[2], 70)), [['', false, '— choose —'], ['70', true, 'Website &lt;i&gt;'], ['71', false, 'Facebook (switched off)']]);
    assert.deepEqual(options(F.facebookWebhookOptions({ id: 5 }, null)), [['', false, 'This workspace has no lead webhook yet']]);
  });
  test('the table: the account\'s Pages, then the Pages that were given but are no longer the account\'s', () => {
    const out = F.renderFacebookPages({ pages: [{ id: '100', name: 'Eins', can_advertise: true, assigned: null }], lost: [{ id: '300', name: 'Weg <b>', assigned: { workspace_id: 8, workspace_name: 'acme <b>', webhook_id: 80, webhook_name: 'Leads <i>' } },
      { id: '400', name: '', assigned: { workspace_id: 7, workspace_name: 'W', webhook_id: null, webhook_name: null } }] }, TARGETS);
    assert.equal((out.match(/<tr>/g) || []).length, 3);
    assert.ok(out.indexOf('Eins') < out.indexOf('Weg'));
    assert.match(out, /<tr><td>Weg &lt;b&gt;<\/td><td><code>300<\/code><\/td><td><span class="prov-badge off">No longer one of your Pages<\/span><\/td>\s*<td>acme &lt;b&gt;<\/td><td>Leads &lt;i&gt;<\/td><td><span class="prov-hint">—<\/span><\/td><td><button class="btn" onclick="unassignFacebookPage\('300'\)">Take back<\/button><\/td><\/tr>/);
    assert.match(out, /<td>\(no name\)<\/td><td><code>400<\/code><\/td>[^]*?<td>W<\/td><td>—<\/td>/);
    const only = F.renderFacebookPages({ pages: [], lost: [{ id: '300', name: 'Weg', assigned: { workspace_id: 8, workspace_name: 'acme', webhook_id: 80, webhook_name: 'Leads' } }] }, TARGETS);
    assert.doesNotMatch(only, /No Pages\./, 'an account that lost its last Page still shows what is given: it has to be taken back');
    assert.match(only, /No longer one of your Pages/);
    const odd = F.renderFacebookPages({ pages: [], lost: [{ id: "3');alert(1);('", name: 'x', assigned: { workspace_id: 8, workspace_name: 'a', webhook_id: 80, webhook_name: 'b' } }, { id: '500', name: 'bare' }] }, TARGETS);
    assert.doesNotMatch(odd.slice(0, odd.indexOf('<code>500')), /onclick/, 'only a number ever goes into a handler');
    assert.match(odd, /<td>bare<\/td><td><code>500<\/code><\/td>[^]*?<td>—<\/td><td>—<\/td><td><span class="prov-hint">—<\/span><\/td><td><button class="btn" onclick="unassignFacebookPage\('500'\)">Take back<\/button><\/td><\/tr>$/, 'a lost Page that says nothing of where it was given still stands, and can be taken back');
  });
  test('none: said', () => {
    for (const data of [{ pages: [], lost: [] }, null, undefined, 'x', {}, { pages: 'x' }]) assert.match(F.renderFacebookPages(data, TARGETS), /^<tr><td colspan="7" class="loading">No Pages\. The Facebook account that is connected manages none/);
  });
});

describe('loading the tab', () => {
  test('connected: the status, the buttons, the setup\'s values — then the Pages, asked for separately', async () => {
    F.__reset();
    F.__set2('answers', { 'GET /api/admin/facebook': CONNECTED, 'GET /api/admin/facebook/pages': { pages: [{ id: '100', name: 'Seite', can_advertise: true, assigned: { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: 70, webhook_name: 'Website' } }], lost: [] },
      'GET /api/admin/facebook/targets': { workspaces: TARGETS } });
    await F.loadFacebook();
    const el = F.document._els;
    assert.match(el['fb-status'].innerHTML, /Connected/); assert.equal(el['fb-status'].removed, 'loading');
    assert.match(el['fb-actions'].innerHTML, /Connect again/);
    assert.deepEqual([el['fb-redirect'].textContent, el['fb-scopes'].textContent, el['fb-version'].textContent], ['https://crm.example.de/api/admin/facebook/callback', 'pages_show_list, leads_retrieval', 'v26.0']);
    assert.match(el['fb-pages-body'].innerHTML, /<td>Seite<\/td>/);
    assert.match(el['fb-pages-body'].innerHTML, /<option value="7" selected>Müller &amp; Söhne<\/option>[^]*<option value="70" selected>Website &lt;i&gt;<\/option>/, 'with what it can be given to, and where it is');
    assert.deepEqual(F.__asked, [['GET', '/api/admin/facebook'], ['GET', '/api/admin/facebook/receiver'], ['GET', '/api/admin/facebook/pages'], ['GET', '/api/admin/facebook/targets']]);
  });
  test('not connected: the Pages are not asked for; a refusal for the Pages is said in the table, as text', async () => {
    F.__reset();
    F.__set2('answers', { 'GET /api/admin/facebook': { configured: true, redirect_uri: 'r', version: 'v26.0', scopes: [], connection: null } });
    await F.loadFacebook();
    assert.deepEqual(F.__asked, [['GET', '/api/admin/facebook'], ['GET', '/api/admin/facebook/receiver']], 'the receiver needs the app, not an account');
    assert.equal(F.document._els['fb-pages-body'].innerHTML, '<tr><td colspan="7" class="loading">Not connected.</td></tr>');
    F.__reset();
    F.__set2('answers', { 'GET /api/admin/facebook': CONNECTED, 'GET /api/admin/facebook/pages': { error: 'Facebook refused the request. <x>', code: 'rejected' } });
    await F.loadFacebook();
    assert.equal(F.document._els['fb-pages-body'].innerHTML, '<tr><td colspan="7" class="loading">Facebook refused the request. &lt;x&gt;</td></tr>');
    F.__reset();
    F.__set2('answers', { 'GET /api/admin/facebook': new Error('offline') });
    await F.loadFacebook();
    assert.match(F.document._els['fb-status'].innerHTML, /Could not be loaded/);
    assert.equal(F.document._els['fb-actions'].innerHTML, '');
  });
});

describe('connecting and disconnecting', () => {
  test('"Connect Facebook" asks the server for Facebook\'s page and goes there; a refusal is said, as text, and the browser stays', async () => {
    F.__reset();
    F.__set2('answers', { 'POST /api/admin/facebook/connect': { url: 'https://www.facebook.com/v26.0/dialog/oauth?client_id=1' } });
    await F.connectFacebook();
    assert.equal(F.location.href, 'https://www.facebook.com/v26.0/dialog/oauth?client_id=1');
    assert.deepEqual(F.__asked, [['POST', '/api/admin/facebook/connect']]);
    for (const [answer, said] of [[{ error: 'Facebook is not set up <here>.', code: 'not_configured' }, 'Facebook is not set up &lt;here&gt;.'], [{}, 'That did not work.'], [new Error('offline'), 'The server could not be reached.'],
      [{ error: 'Refused.', url: 'https://www.facebook.com/x' }, 'Refused.']]) {   // a refusal is a refusal, whatever stands beside it
      F.__reset();
      F.__set2('answers', { 'POST /api/admin/facebook/connect': answer });
      await F.connectFacebook();
      assert.equal(F.location.href, '', 'the browser goes nowhere');
      assert.equal(F.document._els['fb-error'].innerHTML, `<div class="message error" style="display:block">${said}</div>`);
    }
  });
  test('"Disconnect" asks first; "no" changes nothing; "yes" forgets the connection and reads the status again', async () => {
    F.__reset(); F.__set2('confirm', false);
    await F.disconnectFacebook();
    assert.deepEqual(F.__asked.map(a => a[0]), ['confirm']);
    assert.match(F.__asked[0][1], /every Page is taken back from its workspace/);
    F.__reset(); F.__set2('answers', { 'DELETE /api/admin/facebook': { success: true }, 'GET /api/admin/facebook': { configured: true, connection: null, scopes: [] } });
    await F.disconnectFacebook(); await new Promise(r => setImmediate(r));
    assert.deepEqual(F.__asked.slice(1).map(a => a.join(' ')), ['DELETE /api/admin/facebook', 'GET /api/admin/facebook', 'GET /api/admin/facebook/receiver']);
  });
});

describe('giving a Page and taking it back (Part 2)', () => {
  const said = () => F.document._els['fb-error'].innerHTML;
  const AFTER = { 'GET /api/admin/facebook': CONNECTED, 'GET /api/admin/facebook/pages': { pages: [], lost: [] }, 'GET /api/admin/facebook/targets': { workspaces: TARGETS } };
  const choose = (pageId, ws, hook) => { F.document.getElementById(`fb-ws-${pageId}`).value = ws; F.document.getElementById(`fb-wh-${pageId}`).value = hook; };
  test('another workspace chosen: the second list offers that workspace\'s lead webhooks, none chosen', () => {
    F.__reset(); F.__set('facebookTargets', TARGETS);
    choose('100', '7', '80');
    F.facebookWorkspaceChosen('100');
    assert.deepEqual(options(F.document._els['fb-wh-100'].innerHTML), [['', false, '— choose —'], ['70', false, 'Website &lt;i&gt;'], ['71', false, 'Facebook (switched off)']]);
    choose('100', '9', ''); F.facebookWorkspaceChosen('100');
    assert.deepEqual(options(F.document._els['fb-wh-100'].innerHTML), [['', false, 'This workspace has no lead webhook yet']]);
    choose('100', '', ''); F.facebookWorkspaceChosen('100');
    assert.deepEqual(options(F.document._els['fb-wh-100'].innerHTML), [['', false, '— choose a workspace first —']]);
  });
  test('"Give to workspace" sends the workspace and the lead webhook as numbers, reads the tab again and says so', async () => {
    F.__reset(); F.__set2('answers', { ...AFTER, 'PUT /api/admin/facebook/pages/100': { success: true } });
    choose('100', '7', '71');
    await F.assignFacebookPage('100');
    assert.deepEqual(F.__asked[0], ['PUT', '/api/admin/facebook/pages/100', { workspace_id: 7, webhook_id: 71 }]);
    assert.deepEqual(F.__asked.slice(1).map(a => a.join(' ')), ['GET /api/admin/facebook', 'GET /api/admin/facebook/receiver', 'GET /api/admin/facebook/pages', 'GET /api/admin/facebook/targets']);
    assert.equal(said(), '<div class="message success" style="display:block">The Page is given to the workspace.</div>');
  });
  test('nothing chosen: said, and the server is not asked; a refusal is said as text and the tab stays as it is', async () => {
    for (const [ws, hook] of [['', ''], ['7', ''], ['', '70']]) {
      F.__reset(); choose('100', ws, hook);
      await F.assignFacebookPage('100');
      assert.deepEqual([F.__asked.length, said()], [0, '<div class="message error" style="display:block">Choose a workspace and one of its lead webhooks.</div>'], `${ws}/${hook}`);
    }
    for (const [answer, text] of [[{ error: 'The connected Facebook account may not advertise on this Page <x>.', code: 'no_advertise' }, 'The connected Facebook account may not advertise on this Page &lt;x&gt;.'], [{}, 'That did not work.'], [new Error('offline'), 'The server could not be reached.'],
      [{ error: 'Facebook did not install the app on this Page, so its leads would not arrive. (#200) <No>', code: 'subscribe' }, 'Facebook did not install the app on this Page, so its leads would not arrive. (#200) &lt;No&gt;']]) {   // Part 3: Facebook's refusal to install the app
      F.__reset(); F.__set2('answers', { 'PUT /api/admin/facebook/pages/100': answer }); choose('100', '7', '70');
      await F.assignFacebookPage('100');
      assert.deepEqual([F.__asked.length, said()], [1, `<div class="message error" style="display:block">${text}</div>`]);
    }
  });
  test('"Take back" asks first; "no" changes nothing; "yes" takes the Page back and reads the tab again', async () => {
    F.__reset(); F.__set2('confirm', false);
    await F.unassignFacebookPage('100');
    assert.deepEqual(F.__asked, [['confirm', 'Take this Page back? Its leads will no longer arrive in the workspace.']]);
    F.__reset(); F.__set2('answers', { ...AFTER, 'DELETE /api/admin/facebook/pages/100': { success: true } });
    await F.unassignFacebookPage('100');
    assert.deepEqual(F.__asked.slice(1).map(a => a.join(' ')), ['DELETE /api/admin/facebook/pages/100', 'GET /api/admin/facebook', 'GET /api/admin/facebook/receiver', 'GET /api/admin/facebook/pages', 'GET /api/admin/facebook/targets']);
    assert.equal(said(), '');
    F.__reset(); F.__set2('answers', { ...AFTER, 'DELETE /api/admin/facebook/pages/100': { success: true, unsubscribed: true } });
    await F.unassignFacebookPage('100');
    assert.equal(said(), '', 'Facebook confirmed: nothing more to say');
    F.__reset(); F.__set2('answers', { ...AFTER, 'DELETE /api/admin/facebook/pages/100': { success: true, unsubscribed: false } });
    await F.unassignFacebookPage('100');
    assert.equal(said(), '<div class="message success" style="display:block">The Page is taken back. Facebook did not confirm that the app was taken off the Page: leads it still announces are not taken in.</div>', 'Part 3: taken back here all the same, and said');
    assert.equal(F.__asked.length, 6, 'the tab is read again either way');
    F.__reset(); F.__set2('answers', { 'DELETE /api/admin/facebook/pages/100': { error: 'Nope.', code: 'page' } });
    await F.unassignFacebookPage('100');
    assert.deepEqual([F.__asked.length, said()], [2, '<div class="message error" style="display:block">Nope.</div>'], 'a refusal is said, and the tab is not read again');
  });
});

// Part 3: where Facebook tells this server of a new lead.
describe('receiving leads (Part 3)', () => {
  const HERE = 'https://crm.example.de/api/integrations/facebook/receive', WORD = 'b916f8255e0b872d05103bb6fbc636ca0e5242b6';
  const R = (more = {}) => ({ callback_url: HERE, verify_token: WORD, registered: true, elsewhere: null, error: null, ...more });
  const el = id => F.document._els[id];
  test('the section stands between the setup and the Pages, hidden until the server says Facebook is set up; by hand: Webhooks, Page, the address, the word, leadgen', () => {
    assert.ok(panel.indexOf('id="fb-setup-section"') < panel.indexOf('id="fb-receiver-section"') && panel.indexOf('id="fb-receiver-section"') < panel.indexOf('<h2 style="margin: 0 0 4px 0;">Your Pages</h2>'));
    assert.match(panel, /<div class="section" id="fb-receiver-section" style="display:none">\s+<h2 style="margin: 0 0 4px 0;">Receiving leads<\/h2>/);
    const byHand = panel.slice(panel.indexOf('<details'), panel.indexOf('</details>'));
    assert.match(byHand, /<summary[^>]*>Set it up by hand<\/summary>/);
    assert.match(byHand, /Meta's app dashboard[^<]*"Webhooks"[^<]*"Page"[^]*Callback URL: <code id="fb-receive-url">…<\/code>[^]*Verify token: <code id="fb-verify-token">…<\/code>[^]*subscribe to the field <code>leadgen<\/code>/);
    assert.match(panel, /Giving a Page installs the app on it at Facebook:\s+from then on each of its leads arrives at the chosen lead webhook\./);
  });
  test('registered: said, with the address; the button offers to register again', () => {
    assert.equal(F.renderFacebookReceiver(R()), `<span class="prov-badge yes">Registered at Facebook</span><p class="prov-hint" style="margin-top:8px">This server's address for it: <code>${HERE}</code></p>`);
    assert.equal(F.renderFacebookReceiverActions(R()), '<button class="btn" onclick="registerFacebookReceiver()">Register again</button>');
  });
  test('not registered: said, with the button; registered elsewhere: where, and that registering here replaces it — as text', () => {
    const out = F.renderFacebookReceiver(R({ registered: false }));
    assert.match(out, /^<span class="prov-badge no">Not registered<\/span> <span class="prov-hint">Facebook does not tell this server of new leads yet\.<\/span><p class="prov-hint" style="margin-top:8px">This server's address for it: <code>https:\/\/crm\.example\.de\/api\/integrations\/facebook\/receive<\/code><\/p>$/);
    assert.equal(F.renderFacebookReceiverActions(R({ registered: false })), '<button class="btn btn-primary" onclick="registerFacebookReceiver()">Register at Facebook</button>');
    const other = F.renderFacebookReceiver(R({ registered: false, elsewhere: 'https://old.example.de/x?<b>' }));
    assert.match(other, /Not registered[^]*<p class="prov-hint" style="margin-top:8px">The app is registered for another address: <code>https:\/\/old\.example\.de\/x\?&lt;b&gt;<\/code>\. Registering here replaces it: an app has one address for Pages\.<\/p>$/);
    assert.doesNotMatch(F.renderFacebookReceiver(R({ registered: true, elsewhere: 'https://old.example.de/x' })), /another address/, 'registered here is registered here');
  });
  test('could not be checked: said with why, as text — the address and the button stay, so it can still be registered', () => {
    const out = F.renderFacebookReceiver(R({ registered: null, error: 'Facebook could not be <reached>.' }));
    assert.match(out, /^<span class="prov-badge off">Could not be checked<\/span> <span class="prov-hint">Facebook could not be &lt;reached&gt;\.<\/span><p class="prov-hint"[^>]*>This server's address for it: <code>/);
    assert.match(F.renderFacebookReceiver(R({ registered: null, error: null })), /Could not be checked<\/span> <span class="prov-hint">Facebook did not say\.<\/span>/);
    assert.match(F.renderFacebookReceiver(R({ registered: undefined })), /Could not be checked/, 'only a plain yes is "registered", only a plain no "not registered"');
    assert.match(F.renderFacebookReceiver(R({ registered: 'true' })), /Could not be checked/);
    assert.equal(F.renderFacebookReceiverActions(R({ registered: null, error: 'x' })), '<button class="btn btn-primary" onclick="registerFacebookReceiver()">Register at Facebook</button>');
  });
  test('a refusal instead of an answer: "could not be loaded" with the server\'s words as text, and no button', () => {
    for (const r of [null, undefined, {}, 'x']) { assert.equal(F.renderFacebookReceiver(r), '<span class="prov-badge off">Could not be loaded</span>'); assert.equal(F.renderFacebookReceiverActions(r), ''); }
    assert.equal(F.renderFacebookReceiver({ error: 'Facebook is not set up <here>.', code: 'not_configured' }), '<span class="prov-badge off">Could not be loaded</span> <span class="prov-hint">Facebook is not set up &lt;here&gt;.</span>');
    assert.equal(F.renderFacebookReceiverActions({ error: 'x', code: 'not_configured' }), '');
    assert.match(F.renderFacebookReceiver(R({ callback_url: 'https://x.example/<i>' })), /<code>https:\/\/x\.example\/&lt;i&gt;<\/code>/, 'the address is text too');
  });
  test('loading the tab: the section shows only while Facebook is set up — also before an account is connected — and fills the values to set it up by hand', async () => {
    F.__reset(); F.__set2('answers', { 'GET /api/admin/facebook': { configured: true, redirect_uri: 'r', version: 'v26.0', scopes: [], connection: null }, 'GET /api/admin/facebook/receiver': R({ registered: false }) });
    await F.loadFacebook();
    assert.equal(el('fb-receiver-section').style.display, '');
    assert.match(el('fb-receiver').innerHTML, /Not registered/); assert.equal(el('fb-receiver').removed, 'loading');
    assert.match(el('fb-receiver-actions').innerHTML, /Register at Facebook/);
    assert.deepEqual([el('fb-receive-url').textContent, el('fb-verify-token').textContent], [HERE, WORD]);
    for (const status of [{ configured: false, connection: null, scopes: [] }, { error: true }, new Error('offline')]) {
      F.__reset(); F.__set2('answers', { 'GET /api/admin/facebook': status });
      await F.loadFacebook();
      assert.equal(el('fb-receiver-section').style.display, 'none');
      assert.deepEqual(F.__asked, [['GET', '/api/admin/facebook']], 'and the receiver is not asked for');
    }
  });
  test('loading the tab: whatever becomes of the receiver, the rest of the tab stands', async () => {
    const PAGES = { pages: [{ id: '100', name: 'Seite', can_advertise: true, assigned: null }], lost: [] };
    for (const [answer, shown] of [[new Error('offline'), /Could not be loaded<\/span> <span class="prov-hint">The server could not be reached\.<\/span>/], [{ error: 'Admin access required' }, /Could not be loaded<\/span> <span class="prov-hint">Admin access required<\/span>/], [undefined, /Could not be loaded<\/span>$/]]) {
      F.__reset(); F.__set2('answers', { 'GET /api/admin/facebook': CONNECTED, 'GET /api/admin/facebook/receiver': answer, 'GET /api/admin/facebook/pages': PAGES, 'GET /api/admin/facebook/targets': { workspaces: TARGETS } });
      await F.loadFacebook();
      assert.match(el('fb-receiver').innerHTML, shown);
      assert.equal(el('fb-receiver-actions').innerHTML, '');
      assert.match(el('fb-status').innerHTML, /Connected/); assert.match(el('fb-pages-body').innerHTML, /<td>Seite<\/td>/);
      assert.equal(el('fb-receive-url'), undefined, 'the values to set it up by hand are left as they were');
    }
  });
  test('"Register at Facebook" asks the server, reads the receiver again — only that — and says so in its own box', async () => {
    F.__reset(); F.__set2('answers', { 'POST /api/admin/facebook/receiver': { success: true }, 'GET /api/admin/facebook/receiver': R() });
    F.document.getElementById('fb-receiver-error').innerHTML = 'an older message';
    await F.registerFacebookReceiver();
    assert.deepEqual(F.__asked, [['POST', '/api/admin/facebook/receiver'], ['GET', '/api/admin/facebook/receiver']]);
    assert.match(el('fb-receiver').innerHTML, /Registered at Facebook/); assert.match(el('fb-receiver-actions').innerHTML, /Register again/);
    assert.equal(el('fb-receiver-error').innerHTML, '<div class="message success" style="display:block">Registered. Facebook now tells this server when a lead arrives on a Page that is given to a workspace.</div>');
    assert.equal(el('fb-error'), undefined, 'the box of the connection is not written to');
  });
  test('registering refused: said as text in its own box, and nothing is read again', async () => {
    for (const [answer, said] of [[{ error: 'Facebook did not accept the receiving address. (#2200) <Callback> verification failed', code: 'receiver' }, 'Facebook did not accept the receiving address. (#2200) &lt;Callback&gt; verification failed'],
      [{}, 'That did not work.'], [new Error('offline'), 'The server could not be reached.'], [{ success: false }, 'That did not work.'], [{ success: true, error: 'Refused.' }, 'Refused.']]) {
      F.__reset(); F.__set2('answers', { 'POST /api/admin/facebook/receiver': answer });
      await F.registerFacebookReceiver();
      assert.deepEqual([F.__asked.length, el('fb-receiver-error').innerHTML], [1, `<div class="message error" style="display:block">${said}</div>`]);
    }
  });
  test('the lines that make it so: the section is shown and hidden by its own style, and what the console says goes where it is told to', () => {
    assert.match(inline, /document\.getElementById\('fb-receiver-section'\)\.style\.display = configured \? '' : 'none';/);
    assert.match(inline, /async function registerFacebookReceiver\(\) \{\s*facebookSay\('', 'error', 'fb-receiver-error'\);/, 'an older message is gone the moment the button is pressed, not only when the answer is there');
    assert.match(inline, /const facebookSay = \(text, type = 'error', where = 'fb-error'\) => \{ document\.getElementById\(where\)\.innerHTML = text \? `<div class="message \$\{type\}" style="display:block">\$\{esc\(text\)\}<\/div>` : ''; \};/);
    assert.doesNotMatch(sliceFn(inline, 'renderFacebookReceiver', 'admin.html'), /verify_token/, 'the word is written as text into its own place, never into markup');
    assert.match(sliceFn(inline, 'loadFacebookReceiver', 'admin.html'), /getElementById\('fb-verify-token'\)\.textContent = r\.verify_token \|\| '';/);
  });
});

// Part 4: per Page — is the app really on it at Facebook, how many leads arrived, what became of the last one.
describe('Part 4: the "Leads" column', () => {
  const GIVEN = { workspace_id: 7, workspace_name: 'Müller & Söhne', webhook_id: 70, webhook_name: 'Website' };
  const P = (more = {}) => ({ id: '100', name: 'Seite', can_advertise: true, assigned: GIVEN, installed: true, installed_note: null, leads: null, ...more });
  const AT = '2026-11-24T10:00:00.000Z';
  const L = (last, more = {}) => ({ total: 3, contacts: 2, waiting: 0, last: last ? { status: 'done', reason: null, detail: null, at: AT, ...last } : null, ...more });
  const RECEIVING = '<span class="prov-badge yes">Receiving</span>', NONE_YET = '<div class="prov-hint">No lead yet.</div>', DASH = '<span class="prov-hint">—</span>';
  const leadsCode = read('utils/facebook-leads.js').replace(/\/\*[\s\S]*?\*\//, '');

  test('the table has a seventh column, said in the intro; every line that stands for the whole table spans seven', () => {
    const head = panel.slice(panel.indexOf('<thead>'), panel.indexOf('</thead>'));
    assert.deepEqual([...head.matchAll(/<th>([^<]*)<\/th>/g)].map(m => m[1]), ['Page', 'Page ID', 'You may advertise', 'Workspace', 'Lead webhook', 'Leads', '']);
    assert.match(panel, /"Leads" says whether the app is really on\s+the Page at Facebook right now, how many leads arrived, and what became of the last one\./);
    assert.match(panel, /<tbody id="fb-pages-body"><tr><td colspan="7" class="loading">Not connected\.<\/td><\/tr><\/tbody>/);
    const fns = sliceFn(inline, 'loadFacebook', 'admin.html') + sliceFn(inline, 'renderFacebookPages', 'admin.html');
    assert.deepEqual([count(fns, 'colspan="7" class="loading"'), count(fns, 'class="loading"'), count(panel + fns + sliceFn(inline, 'renderFacebookPageRow', 'admin.html'), 'colspan="6"')], [4, 4, 0]);
  });

  test('a given Page: "Receiving", "Not installed" with what to do, or "Could not be checked" with why — only a plain yes is a yes', () => {
    assert.equal(F.renderFacebookLeads(P()), RECEIVING + NONE_YET);
    assert.equal(F.renderFacebookLeads(P({ installed: false })), '<span class="prov-badge no">Not installed</span> <span class="prov-hint">The app is not on this Page at Facebook: press Save to install it again.</span>' + NONE_YET);
    assert.equal(F.renderFacebookLeads(P({ installed: null, installed_note: 'Facebook no longer accepts the Page\'s token. Save the Page again.' })),
      '<span class="prov-badge off">Could not be checked</span> <span class="prov-hint">Facebook no longer accepts the Page&#39;s token. Save the Page again.</span>' + NONE_YET);
    assert.equal(F.renderFacebookLeads(P({ installed: null })), '<span class="prov-badge off">Could not be checked</span>' + NONE_YET, 'no reason known: none said');
    for (const installed of ['true', 1, undefined, 'yes', {}, 0, '']) assert.match(F.renderFacebookLeads(P({ installed })), /^<span class="prov-badge off">Could not be checked<\/span>/, String(installed));
    assert.doesNotMatch(F.renderFacebookLeads(P({ installed: true, installed_note: 'left over' })), /left over/, 'a note belongs to "could not be checked" only');
    assert.doesNotMatch(F.renderFacebookLeads(P({ installed: false, installed_note: 'left over' })), /left over/);
  });
  test('whatever Facebook said stays text', () => {
    const out = F.renderFacebookLeads(P({ installed: null, installed_note: '(#200) <img src=x onerror=alert(1)> "q" & \'s\'' }));
    assert.equal(out, '<span class="prov-badge off">Could not be checked</span> <span class="prov-hint">(#200) &lt;img src=x onerror=alert(1)&gt; &quot;q&quot; &amp; &#39;s&#39;</span>' + NONE_YET);
  });
  test('a Page that is not given has no badge — nothing is asked of Facebook about it; "No lead yet." is said only of a given Page', () => {
    assert.equal(F.renderFacebookLeads(P({ assigned: null, installed: null })), DASH);
    assert.equal(F.renderFacebookLeads(P({ assigned: null, installed: true })), DASH, 'not given is not given, whatever else stands there');
    assert.equal(F.renderFacebookLeads({ leads: null }), DASH, 'a lost Page without leads');
    for (const p of [null, undefined, {}, 'x']) assert.equal(F.renderFacebookLeads(p), DASH);
    const older = { id: '100', assigned: GIVEN };   // an answer that says nothing about the app
    assert.equal(F.renderFacebookLeads(older), NONE_YET, 'no word about the app: no badge, not "could not be checked"');
    assert.equal(F.renderFacebookLeads(P({ leads: { total: 0, contacts: 0, waiting: 0, last: null } })), RECEIVING + NONE_YET, 'none counted is none');
  });

  test('how many: one lead and one contact are one, the others many; what Facebook sends again is said only when there is some', () => {
    const counts = more => F.renderFacebookLeads(P({ leads: L(null, more) })).replace(RECEIVING, '');
    assert.equal(counts({ total: 1, contacts: 1 }), '<div class="prov-hint">1 lead, 1 contact</div>');
    assert.equal(counts({ total: 12, contacts: 10, waiting: 2 }), '<div class="prov-hint">12 leads, 10 contacts, 2 are to be sent again</div>');
    assert.equal(counts({ total: 2, contacts: 0, waiting: 1 }), '<div class="prov-hint">2 leads, 0 contacts, 1 is to be sent again</div>');
    assert.equal(counts({ total: 5, contacts: 1, waiting: 0 }), '<div class="prov-hint">5 leads, 1 contact</div>');
    assert.equal(counts({ total: '3', contacts: undefined, waiting: undefined }), '<div class="prov-hint">3 leads, 0 contacts</div>', 'a number as text is the number; what is missing is none');
    assert.equal(counts({ total: '<b>7</b>', contacts: '<i>' }), NONE_YET, 'what is no number is no lead — and never markup');
    assert.deepEqual([F.facebookCount(1, 'lead', 'leads'), F.facebookCount(0, 'lead', 'leads'), F.facebookCount(2, 'lead', 'leads'), F.facebookCount('1', 'is', 'are'), F.facebookCount(null, 'lead', 'leads'), F.facebookCount('<b>', 'lead', 'leads'), F.facebookCount(undefined, 'a', 'b')],
      ['1 lead', '0 leads', '2 leads', '1 is', '0 leads', '0 leads', '0 b']);
  });

  test('the last lead: when, and what became of it — a contact, the test delivery, nothing (why), not yet (why), right now', () => {
    const last = l => { const out = F.renderFacebookLeads(P({ leads: L(l) })); return out.slice(out.lastIndexOf('<div class="prov-hint">')); };
    const when = F.fmtVisitTime(AT);
    assert.notEqual(when, '—');
    assert.equal(last({ status: 'done' }), `<div class="prov-hint">Last lead ${when}: became a contact</div>`);
    assert.equal(last({ status: 'test' }), `<div class="prov-hint">Last lead ${when}: kept as the lead webhook&#39;s test delivery</div>`);
    assert.equal(last({ status: 'skipped', reason: 'off' }), `<div class="prov-hint">Last lead ${when}: nothing came of it: its lead webhook was switched off</div>`);
    assert.equal(last({ status: 'failed', reason: 'unreachable' }), `<div class="prov-hint">Last lead ${when}: not taken yet: Facebook did not answer. Facebook sends it again</div>`);
    assert.equal(last({ status: 'working' }), `<div class="prov-hint">Last lead ${when}: is being taken right now</div>`);
    assert.equal(last({ status: 'done', at: 'no date' }), '<div class="prov-hint">Last lead —: became a contact</div>');
    assert.equal(F.renderFacebookLeads(P({ leads: L(null) })), RECEIVING + '<div class="prov-hint">3 leads, 2 contacts</div>', 'counts without a last lead: only the counts');
  });
  test('every reason the server keeps has its words, for a lead nothing came of and for one not taken yet', () => {
    assert.deepEqual(F.FB_LEAD_REASONS, { no_page: 'the Page was given to no workspace then', no_webhook: 'its lead webhook was deleted', off: 'its lead webhook was switched off', rejected: 'Facebook did not hand the lead out',
      unmapped: 'neither a name nor an email could be read — check the field mapping of the lead webhook', unreachable: 'Facebook did not answer', gone: 'the Page\'s token was not accepted — save the Page again', facebook: 'Facebook said: later', error: 'this server could not take it' });
    for (const [reason, words] of Object.entries(F.FB_LEAD_REASONS)) {
      assert.equal(F.facebookLeadOutcome({ status: 'skipped', reason }), `nothing came of it: ${words}`);
      assert.equal(F.facebookLeadOutcome({ status: 'failed', reason }), `not taken yet: ${words}. Facebook sends it again`);
      assert.equal(F.facebookLeadOutcome({ status: 'done', reason }), 'became a contact', 'a contact needs no reason');
    }
    for (const reason of [null, undefined, '', 'something new', '<script>alert(1)</script>', 5, 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(F.facebookLeadOutcome({ status: 'skipped', reason }), 'nothing came of it: no reason was kept', String(reason));
      assert.equal(F.facebookLeadOutcome({ status: 'failed', reason }), 'not taken yet: no reason was kept. Facebook sends it again');
    }
    for (const none of [null, undefined]) assert.equal(F.facebookLeadOutcome(none), '');
    for (const status of [undefined, null, 'working', 'DONE', '<b>']) assert.equal(F.facebookLeadOutcome({ status }), 'is being taken right now', String(status));
  });
  test('the words the server kept with a lead are shown as text, twice escaped into their place — and not for a contact', () => {
    const detail = 'Unsupported get request. <img src=x onerror=alert(1)> "q" \'s\' &';
    const safe = 'Unsupported get request. &lt;img src=x onerror=alert(1)&gt; &quot;q&quot; &#39;s&#39; &amp;';
    const out = F.renderFacebookLeads(P({ leads: L({ status: 'skipped', reason: 'rejected', detail }) }));
    assert.ok(out.endsWith(`: nothing came of it: Facebook did not hand the lead out <span title="${safe}">(${safe})</span></div>`), out);
    assert.doesNotMatch(out, /<img|"q"/);
    assert.match(F.renderFacebookLeads(P({ leads: L({ status: 'failed', reason: 'error', detail: 'deadlock detected' }) })), /: not taken yet: this server could not take it\. Facebook sends it again <span title="deadlock detected">\(deadlock detected\)<\/span><\/div>$/);
    assert.match(F.renderFacebookLeads(P({ leads: L({ status: 'done', detail: 'left over' }) })), /: became a contact<\/div>$/, 'a contact has nothing more to say');
    for (const empty of [null, undefined, '']) assert.match(F.renderFacebookLeads(P({ leads: L({ status: 'skipped', reason: 'off', detail: empty }) })), /switched off<\/div>$/);
    const odd = F.renderFacebookLeads(P({ leads: L({ status: '<b>x</b>', reason: '<i>', at: '<u>' }) }));
    assert.match(odd, /<div class="prov-hint">Last lead —: is being taken right now<\/div>$/, 'a status, a reason or a time that is none is never shown as it came');
  });
  test('the reasons here are exactly the ones utils/facebook-leads.js can write, and its statuses are the ones told apart', () => {
    const ends = [...leadsCode.matchAll(/end\('(skipped|failed)', ([^,)]+)/g)].map(m => m[2].trim());
    assert.ok(ends.length >= 9, 'the place the reasons are written is where it was');
    const written = new Set();
    for (const arg of ends) {
      if (/^'[a-z_]+'$/.test(arg)) written.add(arg.slice(1, -1));
      else if (arg === 'err.code') for (const m of leadsCode.matchAll(/err\.code === '([a-z_]+)'/g)) written.add(m[1]);
      else if (arg === "out.kind === 'off' ? 'off' : 'unmapped'") { written.add('off'); written.add('unmapped'); }
      else assert.fail(`a reason written in a way this test does not know: ${arg}`);
    }
    for (const m of leadsCode.matchAll(/reason: '([a-z_]+)'/g)) written.add(m[1]);
    assert.deepEqual([...written].sort(), Object.keys(F.FB_LEAD_REASONS).sort());
    const statuses = new Set([...leadsCode.matchAll(/end\('([a-z]+)'/g)].map(m => m[1]));
    assert.deepEqual([...statuses].sort(), ['done', 'failed', 'skipped', 'test'], 'and "working" while it is being taken');
    const told = [...sliceFn(inline, 'facebookLeadOutcome', 'admin.html').matchAll(/last\.status === '([a-z]+)'/g)].map(m => m[1]);
    assert.deepEqual(told.sort(), ['done', 'failed', 'skipped', 'test']);
    const header = read('utils/facebook-leads.js').match(/\/\*[\s\S]*?\*\//)[0];
    for (const reason of Object.keys(F.FB_LEAD_REASONS)) assert.match(header, new RegExp(`\\b${reason}\\b`), reason);
  });

  // every row of the table fills seven columns, and the "Leads" cell stands before the buttons
  const columns = row => (row.match(/<td/g) || []).length + (row.match(/colspan="2"/g) || []).length;
  test('in every kind of row: a Page that can be given, one that is given, one whose leads cannot be read, one with an unusable id', () => {
    const free = F.renderFacebookPageRow(P({ assigned: null, installed: null }), TARGETS);
    assert.equal(columns(free), 7);
    assert.match(free, /<\/select><\/td><td><span class="prov-hint">—<\/span><\/td>\s+<td style="white-space:nowrap"><button class="btn btn-primary" onclick="assignFacebookPage\('100'\)">Give to workspace<\/button> <\/td><\/tr>$/);
    const given = F.renderFacebookPageRow(P({ leads: L({ status: 'done' }, { total: 2, contacts: 1 }) }), TARGETS);
    assert.equal(columns(given), 7);
    assert.match(given, /<\/select><\/td><td><span class="prov-badge yes">Receiving<\/span><div class="prov-hint">2 leads, 1 contact<\/div><div class="prov-hint">Last lead [^<]*: became a contact<\/div><\/td>\s+<td style="white-space:nowrap"><button class="btn btn-primary" onclick="assignFacebookPage\('100'\)">Save<\/button> <button/);
    const noHook = F.renderFacebookPageRow(P({ assigned: { ...GIVEN, webhook_id: null, webhook_name: null }, installed: false }), TARGETS);
    assert.match(noHook, /choose one\.<\/span><\/td><td><span class="prov-badge no">Not installed<\/span>/);
    const cannot = F.renderFacebookPageRow(P({ id: '200', can_advertise: false, installed: null, installed_note: 'Facebook could not be reached.', leads: L(null, { total: 1, contacts: 0, waiting: 1 }) }), TARGETS);
    assert.equal(columns(cannot), 7);
    assert.match(cannot, /but its leads cannot be read any more\.<\/td><td><span class="prov-badge off">Could not be checked<\/span> <span class="prov-hint">Facebook could not be reached\.<\/span><div class="prov-hint">1 lead, 0 contacts, 1 is to be sent again<\/div><\/td><td><button class="btn" onclick="unassignFacebookPage\('200'\)">Take back<\/button><\/td><\/tr>$/);
    const cannotFree = F.renderFacebookPageRow(P({ id: '200', can_advertise: false, assigned: null, installed: null, leads: L(null, { total: 4, contacts: 0 }) }), TARGETS);
    assert.equal(columns(cannotFree), 7);
    assert.match(cannotFree, /Cannot be given to a workspace\.<\/td><td><div class="prov-hint">4 leads, 0 contacts<\/div><\/td><td><\/td><\/tr>$/, 'leads that arrived for a Page nobody has are shown all the same');
    const odd = F.renderFacebookPageRow(P({ id: "1');alert(1);('" }), TARGETS);
    assert.equal(columns(odd), 7);
    assert.match(odd, /cannot work with\.<\/td><td><span class="prov-badge yes">Receiving<\/span><div class="prov-hint">No lead yet\.<\/div><\/td><td><\/td><\/tr>$/);
    assert.doesNotMatch(odd, /onclick/);
  });
  test('a Page that is no longer the account\'s: its leads, and nothing about the app', () => {
    const out = F.renderFacebookPages({ pages: [], lost: [{ id: '300', name: 'Weg', assigned: GIVEN, installed: true, installed_note: 'x', leads: L({ status: 'skipped', reason: 'no_webhook', detail: '<b>' }, { total: 2, contacts: 1 }) }, { id: '400', name: 'Leer', assigned: GIVEN, leads: null }] }, TARGETS);
    const [first, second] = out.split('</tr>');
    assert.deepEqual([columns(first), columns(second)], [7, 7]);
    assert.match(first, /<td>Website<\/td><td><div class="prov-hint">2 leads, 1 contact<\/div><div class="prov-hint">Last lead [^<]*: nothing came of it: its lead webhook was deleted <span title="&lt;b&gt;">\(&lt;b&gt;\)<\/span><\/div><\/td><td><button class="btn" onclick="unassignFacebookPage\('300'\)">Take back<\/button><\/td>$/);
    assert.doesNotMatch(out, /Receiving|Not installed|Could not be checked|No lead yet/, 'what the app is on a Page that cannot be read any more is not said');
    assert.match(second, /<td>Website<\/td><td><span class="prov-hint">—<\/span><\/td><td><button/);
  });
  test('loading the tab puts it into the table', async () => {
    F.__reset();
    F.__set2('answers', { 'GET /api/admin/facebook': CONNECTED, 'GET /api/admin/facebook/targets': { workspaces: TARGETS },
      'GET /api/admin/facebook/pages': { pages: [P({ leads: L({ status: 'failed', reason: 'gone', detail: 'Session has expired' }, { total: 2, contacts: 1, waiting: 1 }) }), P({ id: '200', name: 'Zwei', assigned: null, installed: null })], lost: [] } });
    await F.loadFacebook();
    const body = F.document._els['fb-pages-body'].innerHTML;
    assert.equal((body.match(/<tr>/g) || []).length, 2);
    assert.match(body, /<span class="prov-badge yes">Receiving<\/span><div class="prov-hint">2 leads, 1 contact, 1 is to be sent again<\/div><div class="prov-hint">Last lead [^<]*: not taken yet: the Page&#39;s token was not accepted — save the Page again\. Facebook sends it again <span title="Session has expired">\(Session has expired\)<\/span><\/div>/);
    assert.equal(count(body, 'prov-badge yes">Receiving'), 1, 'only the given Page');
  });
});

describe('Facebook sends the browser back', () => {
  const said = () => F.document._els['fb-error'].innerHTML;
  test('each outcome has its sentence; the tab opens, and the word is taken out of the address', () => {
    const cases = { connected: ['success', 'Facebook is connected.'], denied: ['error', 'The sign-in at Facebook was cancelled. Nothing was connected.'], login: ['error', 'Log in to the console first, then connect Facebook.'],
      unreachable: ['error', 'Facebook could not be reached. Try again in a moment.'], state: ['error', 'That sign-in did not start in this browser session, or it took too long. Start it again here.'] };
    for (const [outcome, [type, text]] of Object.entries(cases)) {
      F.__reset(); F.__set2('search', `?facebook=${outcome}`);
      assert.equal(F.facebookReturn(), true);
      assert.equal(said(), `<div class="message ${type}" style="display:block">${text}</div>`, outcome);
      assert.deepEqual([F.__shown, F.history.replaced], [['facebook'], ['/adminconsole']]);
    }
  });
  test('a word nobody knows is "it did not work" — never shown as it came; without the word nothing happens', () => {
    for (const outcome of ['failed', 'nonsense', '<script>alert(1)</script>', 'constructor', 'toString']) {
      F.__reset(); F.__set2('search', `?facebook=${encodeURIComponent(outcome)}`);
      F.facebookReturn();
      assert.match(said(), /^<div class="message error" style="display:block">Facebook did not accept the sign-in\. Check the app&#39;s ID, secret and redirect address, then try again\.<\/div>$/, outcome);
    }
    for (const search of ['', '?x=1', '?facebook=']) { F.__reset(); F.__set2('search', search); assert.equal(F.facebookReturn(), false); assert.deepEqual([F.__shown.length, F.history.replaced.length], [0, 0]); }
  });
  test('every outcome the server can send has a sentence here', () => {
    const route = read('routes/admin-facebook.js');
    const sent = [...new Set([...route.matchAll(/back\(res, '([a-z]+)'\)/g)].map(m => m[1])), 'denied', 'failed', 'unreachable'].filter((v, i, a) => a.indexOf(v) === i);
    const known = Object.keys(new Function(`${inline.match(/^    const FB_OUTCOMES = \{[\s\S]*?^    \};/m)[0]} return FB_OUTCOMES;`)());
    for (const s of sent) assert.ok(known.includes(s), s);
    assert.deepEqual(known.sort(), ['connected', 'denied', 'failed', 'login', 'state', 'unreachable']);
  });
});
