// CLIENT (static + pure-function) tests: the admin console's "Assistant" tab (ASSISTANT_CHANGES, 2026-11-24;
// public/admin.html, routes/admin-assistant.js): a conversation with Claude, which looks at a workspace's setup and
// proposes a workflow; the proposal's card; "Create", "Undo" and "Create again"; and the list of what it made.
//
// The page's own functions are sliced out of admin.html and run against a stand-in document and a stand-in server
// (fetch answers by "METHOD address"; an answer may be a function, an Error, or a promise that is still open).
// What matters most here: whatever the server hands back stays TEXT, and only a number ever reaches a handler.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const html   = read('public/admin.html');
const panel  = html.slice(html.indexOf('<div id="tab-assistant"'), html.indexOf('<!-- /#tab-assistant -->'));
const inline = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));
const block  = inline.slice(inline.indexOf('ASSISTANT (ASSISTANT_CHANGES'), inline.indexOf('    function esc(value)'));
const count = (src, needle) => src.split(needle).length - 1;
const line = name => { const m = inline.match(new RegExp(`^    const ${name} = .*$`, 'm')); assert.ok(m, name); return m[0]; };

const NAMES = ['assistantFetch', 'assistantDuration', 'assistantWait', 'assistantBoxName', 'assistantLines', 'renderAssistantStatus', 'renderAssistantSaid', 'renderAssistantActions', 'renderAssistantStep',
  'renderAssistantCard', 'renderAssistantEntry', 'renderAssistantEntries', 'renderAssistantChats', 'renderAssistantMade', 'drawAssistant', 'assistantPut', 'loadAssistant', 'loadAssistantMade', 'refreshAssistantChats',
  'newAssistantChat', 'openAssistantChat', 'assistantKey', 'askAssistant', 'actOnAssistantProposal', 'createAssistantProposal', 'undoAssistantProposal'];
const F = loadFns('public/admin.html', NAMES, {
  state: { assistantInfo: null, assistantChat: null, assistantEntries: [], assistantBusy: false, assistantMade: [], assistantMadeError: '', assistantSaid: {}, assistantActing: [] },
  extra: [sliceFn(inline, 'esc', 'admin.html'), sliceFn(inline, 'fmtVisitTime', 'admin.html'), inline.match(/^    const ASSISTANT_EXAMPLES = \[[\s\S]*?^    \];/m)[0], line('assistantMax'), line('assistantId'), line('assistantSay'),
    `const API_BASE = '/api/admin';
     const document = { getElementById: id => (document._els[id] ||= { innerHTML: '', textContent: '', value: '', disabled: false, style: {}, scrollTop: 0, scrollHeight: 999, classList: { remove(c) { document._els[id].removed = c; } } }), _els: {} };
     const __asked = [];
     let __answers = {}, __confirm = true;
     function confirm(text) { __asked.push(['confirm', text]); return __confirm; }
     async function fetch(url, init) {
       const method = (init && init.method) || 'GET';
       __asked.push(init && init.body ? [method, url, JSON.parse(init.body)] : [method, url]);
       let a = __answers[method + ' ' + url];
       if (typeof a === 'function') a = a();
       a = await a;
       if (a instanceof Error) throw a;
       if (a && a.__raw) return { status: a.__raw, json: async () => { throw new Error('no JSON'); } };
       return { status: 200, json: async () => a };
     }
     function __set2(k, v) { if (k === 'answers') __answers = v; else if (k === 'confirm') __confirm = v; }
     function __state() { return { assistantInfo, assistantChat, assistantEntries, assistantBusy, assistantMade, assistantMadeError, assistantSaid, assistantActing }; }
     function __reset() { document._els = {}; __asked.length = 0; __answers = {}; __confirm = true; assistantInfo = null; assistantChat = null; assistantEntries = []; assistantBusy = false; assistantMade = []; assistantMadeError = ''; assistantSaid = {}; assistantActing = []; }`].join('\n'),
  expose: ['document', '__asked', '__set2', '__state', '__reset', 'ASSISTANT_EXAMPLES', 'assistantMax', 'assistantId', 'assistantSay', 'fmtVisitTime'],
});
const el = id => F.document._els[id];
const HOSTILE = '<img src=x onerror="alert(1)"> "q" \'s\' &';
const SAFE = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &quot;q&quot; &#39;s&#39; &amp;';
const READY = (more = {}) => ({ configured: true, model: 'claude-opus-5-5', max_text: 4000, chats: [], ...more });
const PROPOSAL = (more = {}) => ({ id: 12, chat_id: 3, workspace_id: 7, workspace_name: 'Müller & Söhne', name: 'Welcome new leads', asked: 'Make a welcome workflow', explain: 'Greets every new lead\nand follows up.', status: 'proposed',
  flow_id: null, created_at: '2026-11-24T10:00:00.000Z', made_at: null, undone_at: null, notes: ['Gmail is not connected in this workspace.'],
  start: { label: 'Start', explain: 'When a lead comes in through "Website".', settings: { trigger: 'lead', webhook_ids: [70] }, next: 'mail1' },
  steps: [
    { key: 'mail1', kind: 'email', label: 'Email', title: 'Welcome', body: 'Hello {{first_name|there}}', wait_minutes: 0, explain: 'A first hello.', settings: { tz: 'Europe/Berlin' }, next: 'wait1', else: null, routes: [] },
    { key: 'wait1', kind: 'wait', label: 'Wait', title: '', body: '', wait_minutes: 2880, explain: '', settings: {}, next: 'ask1', else: null, routes: [] },
    { key: 'ask1', kind: 'branch', label: 'If / else', title: '', body: '', wait_minutes: 0, explain: 'Still in the first stage?', settings: { test: 'stage', stage_ids: [30] }, next: 'task1', else: null, routes: [] },
    { key: 'task1', kind: 'task', label: 'Task', title: 'Call the lead', body: 'Ring them.', wait_minutes: 90, explain: '', settings: {}, next: null, else: null, routes: [] },
  ], ...more });
// the stand-in page as it stands once the tab is open and the assistant is set up
function open(more = {}) { F.__reset(); F.__set('assistantInfo', READY(more)); }

describe('the tab', () => {
  test('an eighth tab after "Facebook", its hidden panel, and showAdminTab loads it', () => {
    assert.match(html, /id="tabbtn-facebook"[^>]*>Facebook<\/button>\s*<button class="admin-tab"\s+id="tabbtn-assistant"\s+onclick="showAdminTab\('assistant'\)">Assistant<\/button>/);
    assert.match(html, /<div id="tab-assistant" class="hidden">/);
    assert.match(inline, /for \(const t of \['defaults', 'provisioning', 'tutorial', 'engine', 'monitor', 'crm', 'facebook', 'assistant'\]\)/);
    assert.match(inline, /if \(name === 'assistant'\) loadAssistant\(\);/);
    assert.ok(html.indexOf('<!-- /#tab-facebook -->') < html.indexOf('<div id="tab-assistant"') && html.indexOf('<!-- /#tab-assistant -->') < html.indexOf('<div id="message"'), 'its panel stands after the Facebook tab\'s, inside the console');
  });
  test('what stands in it: the status, the conversation with its input, the earlier conversations, and what it made', () => {
    for (const id of ['as-status', 'as-chat-section', 'as-new', 'as-entries', 'as-error', 'as-text', 'as-send', 'as-chats', 'as-made-section', 'as-made']) assert.equal(count(panel, `id="${id}"`), 1, id);
    assert.match(panel, /<textarea id="as-text" maxlength="4000" rows="3" placeholder="[^"<]+" onkeydown="assistantKey\(event\)"><\/textarea>/);
    assert.match(panel, /<button class="btn btn-primary" id="as-send" onclick="askAssistant\(\)">Send<\/button>/);
    assert.match(panel, /<button class="btn" id="as-new" onclick="newAssistantChat\(\)">New conversation<\/button>/);
    assert.match(panel, /Enter sends, Shift\+Enter starts a new line\./);
    assert.match(panel, /<div class="section" id="as-chat-section" style="display:none">/, 'no input until the assistant is known to be set up');
    assert.match(panel, /<div class="section" id="as-made-section" style="display:none">/);
  });
  test('one line always says what it can do and what it cannot', () => {
    const text = panel.replace(/\s+/g, ' ');
    assert.match(text, /It can look at how a workspace is set up and propose a workflow for it\. It cannot delete, change or switch on anything: a workflow is made only when you press "Create", and it is made switched off\./);
    assert.ok(panel.indexOf('It cannot delete') < panel.indexOf('id="as-status"'), 'above everything that is loaded, so it stands there whatever is loaded');
    assert.match(text, /"Undo" takes a workflow away again while nobody has switched it on or changed it in the workspace; "Create again" makes it once more\./);
    assert.doesNotMatch(panel, /type="password"|api[_ ]key value/i, 'no place to type a key: it belongs into the server\'s .env');
  });
});

describe('is the assistant set up', () => {
  test('could not be loaded (with why), not set up (naming the line of .env), ready (naming the model, as text)', () => {
    assert.equal(F.renderAssistantStatus(null), '<span class="prov-badge off">Could not be loaded</span>');
    assert.equal(F.renderAssistantStatus(null, HOSTILE), `<span class="prov-badge off">Could not be loaded</span> <span class="prov-hint">${SAFE}</span>`);
    assert.equal(F.renderAssistantStatus({ configured: false, model: 'claude-opus-5-5' }), '<span class="prov-badge off">Not set up</span> <span class="prov-hint">ANTHROPIC_API_KEY is not in the server\'s .env yet. Add it and restart the server.</span>');
    const ready = F.renderAssistantStatus(READY({ model: '<b>m</b>' }));
    assert.match(ready, /^<span class="prov-badge yes">Ready<\/span> <span class="prov-hint">Model <code>&lt;b&gt;m&lt;\/b&gt;<\/code>\. /);
    assert.match(ready, /An order goes to Anthropic together with what the assistant looks up for it: how workspaces are set up, never their contacts or deals\./);
  });
});

describe('a wait in words, and where a line leads', () => {
  test('no time is "at once"; else the largest unit that holds it whole', () => {
    const wait = (wait_minutes, more = {}) => F.assistantWait({ kind: 'email', wait_minutes, ...more });
    assert.deepEqual([0, 1, 45, 60, 90, 120, 1440, 1500, 2880, 43200].map(n => wait(n)), ['at once', 'after 1 minute', 'after 45 minutes', 'after 1 hour', 'after 90 minutes', 'after 2 hours', 'after 1 day', 'after 25 hours', 'after 2 days', 'after 30 days']);
    for (const odd of [undefined, null, -5, 'x', NaN, Infinity, {}]) assert.equal(wait(odd), 'at once', String(odd));
    assert.deepEqual([F.assistantDuration(0), F.assistantDuration(61), F.assistantDuration('120')], ['', '61 minutes', '2 hours']);
  });
  test('a Wait box is its time: so long, until a time of day, both, or nothing said', () => {
    assert.equal(F.assistantWait({ kind: 'wait', wait_minutes: 2880, settings: {} }), '2 days');
    assert.equal(F.assistantWait({ kind: 'wait', wait_minutes: 0, settings: { until: '09:00', tz: 'Europe/Berlin' } }), 'until 09:00');
    assert.equal(F.assistantWait({ kind: 'wait', wait_minutes: 60, settings: { until: '09:00' } }), '1 hour, until 09:00');
    assert.equal(F.assistantWait({ kind: 'wait', wait_minutes: 0 }), '');
    assert.equal(F.assistantWait({ kind: 'wait', wait_minutes: 0, settings: { until: 900 } }), '', 'a time of day is a text');
  });
  test('a line is named by the title of the box it leads to, else by what that box is; one that leads nowhere "ends here"', () => {
    const p = PROPOSAL();
    assert.deepEqual([F.assistantBoxName(p, 'mail1'), F.assistantBoxName(p, 'wait1'), F.assistantBoxName(p, 'ask1')], ['Welcome', 'Wait', 'If / else']);
    for (const none of [null, undefined, '', 'nowhere', 5, {}]) assert.equal(F.assistantBoxName(p, none), null, String(none));
    assert.equal(F.assistantBoxName({ steps: [{ key: 'a' }] }, 'a'), 'a', 'a box with neither: its key');
    assert.equal(F.assistantBoxName({}, 'a'), null); assert.equal(F.assistantBoxName(null, 'a'), null);
    assert.deepEqual(F.assistantLines(p, p.steps[0]), ['then: Wait']);
    assert.deepEqual(F.assistantLines(p, p.steps[3]), ['ends here']);
    assert.deepEqual(F.assistantLines(p, { kind: 'start', next: 'mail1' }), ['then: Welcome']);
    assert.deepEqual(F.assistantLines(p, { kind: 'email', next: 'gone' }), ['ends here'], 'a key that names no box leads nowhere');
  });
  test('If / else has a yes and a no; a router one line per route and "otherwise"', () => {
    const p = PROPOSAL();
    assert.deepEqual(F.assistantLines(p, p.steps[2]), ['yes → Call the lead', 'no → ends here']);
    assert.deepEqual(F.assistantLines(p, { kind: 'branch', next: null, else: 'mail1' }), ['yes → ends here', 'no → Welcome']);
    assert.deepEqual(F.assistantLines(p, { kind: 'router', routes: [{ name: 'Hot', next: 'task1' }, { name: '', next: null }, null, { name: 'Rest', next: 'x' }], else: 'mail1', next: 'task1' }),
      ['Hot → Call the lead', 'Route 2 → ends here', 'Route 3 → ends here', 'Rest → ends here', 'otherwise → Welcome'], 'a router has no line of its own: its "next" is not shown');
    assert.deepEqual(F.assistantLines(p, { kind: 'router', else: null }), ['otherwise → ends here']);
  });
});

describe('a proposal is a card', () => {
  test('its name and workspace, what it does, the start and every step with its wait, its reason and its lines', () => {
    const out = F.renderAssistantCard(PROPOSAL());
    assert.match(out, /^<div class="as-card"><div class="as-card-head"><strong>Welcome new leads<\/strong> <span class="prov-hint">a workflow for Müller &amp; Söhne<\/span><\/div><div class="as-text">Greets every new lead\nand follows up\.<\/div><ol class="as-steps">/);
    const items = out.slice(out.indexOf('<ol'), out.indexOf('</ol>')).split('<li>').slice(1);
    assert.equal(items.length, 5, 'the start and four boxes');
    assert.equal(items[0], '<span class="as-kind">Start</span><div class="as-text">When a lead comes in through &quot;Website&quot;.</div><div class="prov-hint">then: Welcome</div></li>');
    assert.equal(items[1], '<span class="as-kind">Email</span> <strong>Welcome</strong> <span class="prov-hint">at once</span><div class="as-text">A first hello.</div><details class="prov-hint"><summary style="cursor:pointer">Its text</summary><div class="as-text">Hello {{first_name|there}}</div></details><div class="prov-hint">then: Wait</div></li>');
    assert.equal(items[2], '<span class="as-kind">Wait</span> <span class="prov-hint">2 days</span><div class="prov-hint">then: If / else</div></li>');
    assert.equal(items[3], '<span class="as-kind">If / else</span> <span class="prov-hint">at once</span><div class="as-text">Still in the first stage?</div><div class="prov-hint">yes → Call the lead<br>no → ends here</div></li>');
    assert.equal(items[4], '<span class="as-kind">Task</span> <strong>Call the lead</strong> <span class="prov-hint">after 90 minutes</span><details class="prov-hint"><summary style="cursor:pointer">Its text</summary><div class="as-text">Ring them.</div></details><div class="prov-hint">ends here</div></li>');
  });
  test('what is still to settle stands as a warning; without notes there is none', () => {
    assert.match(F.renderAssistantCard(PROPOSAL()), /<div class="as-notes"><strong>To settle before it is switched on<\/strong><ul><li>Gmail is not connected in this workspace\.<\/li><\/ul><\/div>/);
    assert.match(F.renderAssistantCard(PROPOSAL({ notes: ['a', '  ', 5, null, HOSTILE] })), new RegExp(`<ul><li>a</li><li>${SAFE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</li></ul>`));
    for (const notes of [[], null, undefined, 'x', ['', ' ']]) assert.doesNotMatch(F.renderAssistantCard(PROPOSAL({ notes })), /as-notes/, JSON.stringify(notes));
  });
  test('"Exact settings" holds the start and every box as they will be saved, as JSON text', () => {
    const out = F.renderAssistantCard(PROPOSAL());
    const pre = /<details class="prov-hint"><summary style="cursor:pointer">Exact settings<\/summary><pre class="as-exact">([\s\S]*?)<\/pre><\/details>/.exec(out);
    assert.ok(pre);
    const exact = JSON.parse(pre[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    assert.deepEqual(exact.start, { settings: { trigger: 'lead', webhook_ids: [70] }, next: 'mail1' });
    assert.deepEqual(exact.steps.map(s => s.key), ['mail1', 'wait1', 'ask1', 'task1']);
    assert.deepEqual(exact.steps[2], { key: 'ask1', kind: 'branch', title: '', body: '', wait_minutes: 0, settings: { test: 'stage', stage_ids: [30] }, next: 'task1', else: null, routes: [] });
    assert.doesNotMatch(pre[1], /"explain"/, 'the assistant\'s own sentences are no settings');
    assert.ok(out.indexOf('Exact settings') < out.indexOf('as-card-actions'), 'the buttons come last');
  });
  test('whatever the server hands back stays text — in every place of the card', () => {
    const p = PROPOSAL({ name: HOSTILE, workspace_name: HOSTILE, explain: HOSTILE, notes: [HOSTILE],
      start: { label: HOSTILE, explain: HOSTILE, settings: { trigger: HOSTILE }, next: 'a' },
      steps: [{ key: 'a', kind: HOSTILE, label: HOSTILE, title: HOSTILE, body: HOSTILE, wait_minutes: 5, explain: HOSTILE, settings: { x: HOSTILE }, next: 'b', else: null, routes: [] },
        { key: 'b', kind: 'router', label: 'Router', title: '', body: '', wait_minutes: 0, explain: '', settings: {}, next: null, else: 'a', routes: [{ name: HOSTILE, next: 'a' }] },
        { key: HOSTILE, kind: 'wait', label: '', title: '', body: '', wait_minutes: 0, settings: { until: HOSTILE } }] });
    const out = F.renderAssistantCard(p);
    assert.doesNotMatch(out, /<img|onerror="alert/);
    assert.ok(count(out, '&lt;img src=x') >= 14, `every place: ${count(out, '&lt;img src=x')}`);
    assert.equal(count(out, '<button'), 1); assert.match(out, /onclick="createAssistantProposal\(12\)"/);
  });
  test('a card for what is no proposal is nothing; one with holes still stands', () => {
    for (const none of [null, undefined, 'x', 5]) assert.equal(F.renderAssistantCard(none), '');
    assert.match(F.renderAssistantCard(PROPOSAL({ start: { settings: {}, next: null } })), /<ol class="as-steps"><li><span class="as-kind">Start<\/span><div class="prov-hint">ends here<\/div><\/li>/, 'a start the server did not label is still called "Start"');
    const bare = F.renderAssistantCard({ id: 4, workspace_id: 7 });
    assert.match(bare, /<strong>\(no name\)<\/strong> <span class="prov-hint">a workflow for a workspace that no longer exists<\/span><\/div><ol class="as-steps"><\/ol>/);
    assert.match(F.renderAssistantCard({ id: 4, workspace_id: 7, steps: [null, 'x', { key: 'a' }], start: 'x' }), /<ol class="as-steps"><li><span class="as-kind">Step<\/span> <span class="prov-hint">at once<\/span><div class="prov-hint">ends here<\/div><\/li><\/ol>/);
  });
});

describe('a proposal\'s buttons, by what became of it', () => {
  test('proposed: "Create in <workspace> (switched off)"; created: said, and "Undo"; undone: said, and "Create again"', () => {
    assert.equal(F.renderAssistantActions(PROPOSAL()), '<button class="btn btn-primary" onclick="createAssistantProposal(12)">Create in Müller &amp; Söhne (switched off)</button>');
    assert.equal(F.renderAssistantActions(PROPOSAL({ status: 'created', flow_id: 9 })),
      '<span class="prov-badge yes">Created, switched off</span> <span class="prov-hint">Review it under Workflows in Müller &amp; Söhne before it is switched on.</span> <button class="btn" onclick="undoAssistantProposal(12)">Undo</button>');
    assert.equal(F.renderAssistantActions(PROPOSAL({ status: 'undone' })), '<span class="prov-badge no">Undone</span> <button class="btn" onclick="createAssistantProposal(12)">Create again</button>');
    assert.equal(F.renderAssistantActions(PROPOSAL({ status: 'something new' })), F.renderAssistantActions(PROPOSAL()), 'a state the console does not know is no reason for another button');
    assert.equal(F.renderAssistantActions(PROPOSAL({ workspace_name: '' })), '<button class="btn btn-primary" onclick="createAssistantProposal(12)">Create in the workspace (switched off)</button>');
  });
  test('a workspace that no longer exists: nothing can be made there', () => {
    assert.equal(F.renderAssistantActions(PROPOSAL({ workspace_id: null })), '<span class="prov-hint">The workspace no longer exists.</span>');
    assert.equal(F.renderAssistantActions(PROPOSAL({ workspace_id: null, status: 'undone' })), '<span class="prov-badge no">Undone</span> <span class="prov-hint">The workspace no longer exists.</span>');
    assert.equal(F.renderAssistantActions(PROPOSAL({ workspace_id: null, status: 'created' })), '<span class="prov-badge yes">Created</span> <span class="prov-hint">The workspace no longer exists.</span>');
  });
  test('only a number ever goes into a handler: an id that is none gets no button', () => {
    for (const id of ['12);alert(1);(', '<i>', null, undefined, 0, -3, 1.5, '012', {}, [12, 13]]) {
      for (const status of ['proposed', 'created', 'undone']) assert.doesNotMatch(F.renderAssistantActions(PROPOSAL({ id, status })), /<button|onclick|alert/, `${String(id)} ${status}`);
    }
    assert.match(F.renderAssistantActions(PROPOSAL({ id: '15' })), /onclick="createAssistantProposal\(15\)"/, 'digits as text are the number');
    assert.deepEqual(['7', 7, '0', '7x', ' 7', '1e3', 1e16].map(F.assistantId), [7, 7, null, null, null, null, null]);
    const handlers = [...block.matchAll(/onclick="([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual([...new Set(handlers)].sort(), ['createAssistantProposal(${id})', 'openAssistantChat(${assistantId(c.id)})', 'undoAssistantProposal(${id})']);
  });
  test('while "Create" or "Undo" runs for a proposal its button is locked — that proposal\'s only', () => {
    F.__reset(); F.__set('assistantActing', [12]);
    assert.match(F.renderAssistantActions(PROPOSAL()), /<button class="btn btn-primary" disabled onclick="createAssistantProposal\(12\)">/);
    assert.match(F.renderAssistantActions(PROPOSAL({ status: 'created' })), /<button class="btn" disabled onclick="undoAssistantProposal\(12\)">Undo<\/button>/);
    assert.doesNotMatch(F.renderAssistantActions(PROPOSAL({ id: 13 })), /disabled/);
    F.__reset();
  });
  test('what the server refused is said on the card, with every problem as a line of text', () => {
    F.__reset();
    assert.equal(F.renderAssistantSaid(PROPOSAL()), '');
    F.__set('assistantSaid', { 12: { text: 'It is no longer valid.', problems: ['ask1: The stage is not one of this workspace', HOSTILE, '', 5] } });
    assert.equal(F.renderAssistantSaid(PROPOSAL()), `<div class="message error" style="display:block; margin-top:10px">It is no longer valid.<ul class="as-problems"><li>ask1: The stage is not one of this workspace</li><li>${SAFE}</li></ul></div>`);
    assert.equal(F.renderAssistantSaid(PROPOSAL({ id: 13 })), '', 'on that proposal\'s card only');
    F.__set('assistantSaid', { 12: { text: HOSTILE } });
    assert.equal(F.renderAssistantSaid(PROPOSAL()), `<div class="message error" style="display:block; margin-top:10px">${SAFE}</div>`);
    assert.match(F.renderAssistantCard(PROPOSAL()), /<\/div><div class="message error" style="display:block; margin-top:10px">/);
    assert.equal(F.renderAssistantSaid(PROPOSAL({ id: 'constructor' })), '', 'an id that is none names nothing');
    F.__reset();
  });
});

describe('the conversation', () => {
  test('none yet: two orders as examples, as plain text', () => {
    const out = F.renderAssistantEntries([], false);
    assert.match(out, /^<div class="prov-hint">No conversation yet\. An order can be as plain as:<\/div><ul class="prov-hint as-examples"><li>/);
    assert.equal(count(out, '<li>'), 2); assert.equal(F.ASSISTANT_EXAMPLES.length, 2);
    assert.match(out, /lead webhook &quot;Website&quot;/);
    for (const none of [null, undefined, 'x']) assert.equal(F.renderAssistantEntries(none, false), out);
  });
  test('your order and the assistant\'s answer: both as text with their line breaks, the answer with what it looked at', () => {
    assert.equal(F.renderAssistantEntry({ role: 'you', text: 'Line one\nline <two>', looked_at: ['never shown'], proposals: [PROPOSAL()] }), '<div class="as-entry as-you"><div class="as-who">You</div><div class="as-text">Line one\nline &lt;two&gt;</div></div>');
    assert.equal(F.renderAssistantEntry({ role: 'assistant', text: `**bold** ${HOSTILE}\n\n- a`, looked_at: ['Looked at the setup of "Müller"', HOSTILE, '', 5], proposals: [] }),
      `<div class="as-entry as-assistant"><div class="as-who">Assistant</div><div class="prov-hint as-looked">Looked at the setup of &quot;Müller&quot;</div><div class="prov-hint as-looked">${SAFE}</div><div class="as-text">**bold** ${SAFE}\n\n- a</div></div>`);
    assert.match(html, /\.as-text \{ white-space: pre-wrap; overflow-wrap: anywhere;/, 'the line breaks are kept by the style, not by markup');
    assert.match(F.renderAssistantEntry({ role: 'assistant', text: '', proposals: [PROPOSAL()] }), /^<div class="as-entry as-assistant"><div class="as-who">Assistant<\/div><div class="as-card">/);
    assert.equal(F.renderAssistantEntry({ role: 'something', text: 'x' }), '<div class="as-entry as-assistant"><div class="as-who">Assistant</div><div class="as-text">x</div></div>');
    for (const none of [null, undefined, 'x']) assert.equal(F.renderAssistantEntry(none), '');
  });
  test('while an order is with the assistant it says "Working…" under the order', () => {
    const out = F.renderAssistantEntries([{ role: 'you', text: 'Do it' }], true);
    assert.equal(out, '<div class="as-entry as-you"><div class="as-who">You</div><div class="as-text">Do it</div></div><div class="as-entry as-assistant"><div class="as-who">Assistant</div><span class="prov-hint">Working… This can take a minute.</span></div>');
    assert.doesNotMatch(F.renderAssistantEntries([{ role: 'you', text: 'Do it' }], false), /Working/);
    assert.match(F.renderAssistantEntries([], true), /^<div class="as-entry as-assistant"><div class="as-who">Assistant<\/div><span class="prov-hint">Working…/);
  });
  test('the earlier conversations: each a button with its title as text; the open one marked; none, nothing', () => {
    const chats = [{ id: 3, title: 'Welcome workflow', updated_at: '2026-11-24T10:00:00.000Z' }, { id: 2, title: HOSTILE + 'x'.repeat(80), updated_at: null }, { id: '4);x(', title: 'never' }, null, { id: 5, title: '' }];
    const out = F.renderAssistantChats(chats, 3, false);
    assert.match(out, /^<span class="prov-hint" style="margin:0">Earlier conversations:<\/span><button class="btn btn-primary" onclick="openAssistantChat\(3\)" title="[^"<]+">Welcome workflow<\/button>/);
    assert.equal(count(out, '<button'), 3); assert.doesNotMatch(out, /never|<img|alert\(1\)"/);
    assert.match(out, /<button class="btn" onclick="openAssistantChat\(5\)" title="—">Untitled<\/button>$/);
    assert.ok(/onclick="openAssistantChat\(2\)" title="—">([^<]*)<\/button>/.exec(out)[1].startsWith('&lt;img src=x'), 'a title is cut at sixty characters, then made text');
    assert.equal(count(F.renderAssistantChats(chats, null, true), ' disabled onclick='), 3, 'none can be opened while an order runs');
    for (const none of [[], null, undefined, 'x', [{ id: 'x' }]]) assert.equal(F.renderAssistantChats(none, null, false), '');
  });
});

describe('what the assistant made', () => {
  test('nothing yet; a list that could not be read says why', () => {
    assert.equal(F.renderAssistantMade([], ''), '<div class="prov-hint">Nothing yet. A workflow the assistant proposes is listed here, with what became of it.</div>');
    for (const none of [null, undefined, 'x', [null, 5]]) assert.equal(F.renderAssistantMade(none, ''), F.renderAssistantMade([], ''));
    assert.equal(F.renderAssistantMade([PROPOSAL()], HOSTILE), `<div class="message error" style="display:block">${SAFE}</div>`);
  });
  test('each proposal a row: the workflow, the workspace, the order (cut, whole in its title), when — and the same buttons as on its card', () => {
    const long = 'Make it. ' + 'y'.repeat(300);
    const out = F.renderAssistantMade([PROPOSAL({ status: 'created' }), PROPOSAL({ id: 11, name: HOSTILE, workspace_name: '', asked: long, status: 'undone', created_at: 'never' })], '');
    assert.match(out, /^<div style="overflow-x:auto"><table class="prov-table"><thead><tr><th>Workflow<\/th><th>Workspace<\/th><th>Order<\/th><th>Proposed<\/th><th><\/th><\/tr><\/thead><tbody><tr>/);
    const rows = out.split('<tr>').slice(2);
    assert.equal(rows.length, 2);
    assert.ok(rows[0].startsWith(`<td><strong>Welcome new leads</strong></td><td>Müller &amp; Söhne</td><td class="as-asked" title="Make a welcome workflow">Make a welcome workflow</td><td>${F.fmtVisitTime('2026-11-24T10:00:00.000Z')}</td><td><div class="as-card-actions" style="margin:0"><span class="prov-badge yes">Created, switched off</span>`));
    assert.match(rows[0], /onclick="undoAssistantProposal\(12\)">Undo<\/button><\/div><\/td><\/tr>/);
    assert.ok(rows[1].startsWith(`<td><strong>${SAFE}</strong></td><td>—</td><td class="as-asked" title="${long}">${long.slice(0, 160)}…</td><td>—</td>`));
    assert.match(rows[1], /<span class="prov-badge no">Undone<\/span> <button class="btn" onclick="createAssistantProposal\(11\)">Create again<\/button>/);
    F.__set('assistantSaid', { 12: { text: 'It was switched on.' } });
    assert.match(F.renderAssistantMade([PROPOSAL({ status: 'created' })], ''), /Undo<\/button><\/div><div class="message error" style="display:block; margin-top:10px">It was switched on\.<\/div><\/td>/, 'a refusal is said in its row too');
    F.__reset();
  });
});

describe('opening the tab', () => {
  const ROUTES = (info, proposals = { proposals: [] }) => ({ 'GET /api/admin/assistant': info, 'GET /api/admin/assistant/proposals': proposals });
  test('set up: the status, the conversation with its input unlocked, and what it made — asked for after the status', async () => {
    F.__reset(); F.__set2('answers', ROUTES(READY({ max_text: 1500, chats: [{ id: 3, title: 'Earlier', updated_at: null }] }), { proposals: [PROPOSAL({ id: 20 }), PROPOSAL({ id: 19, status: 'created' })] }));
    await F.loadAssistant();
    assert.deepEqual(F.__asked, [['GET', '/api/admin/assistant'], ['GET', '/api/admin/assistant/proposals']]);
    assert.match(el('as-status').innerHTML, /prov-badge yes">Ready/); assert.equal(el('as-status').removed, 'loading');
    assert.deepEqual([el('as-chat-section').style.display, el('as-made-section').style.display, el('as-text').disabled, el('as-send').disabled, el('as-new').disabled, el('as-text').maxLength], ['', '', false, false, false, 1500]);
    assert.match(el('as-entries').innerHTML, /No conversation yet/); assert.match(el('as-chats').innerHTML, /openAssistantChat\(3\)/);
    assert.deepEqual(F.__state().assistantMade.map(p => p.id), [20, 19], 'newest first, as the server lists them');
    assert.equal(count(el('as-made').innerHTML, '<tr>'), 3); assert.equal(el('as-made').removed, 'loading');
  });
  test('not set up: said, and no input — what it made earlier is still listed, with its buttons', async () => {
    F.__reset(); F.__set2('answers', ROUTES({ configured: false, model: 'claude-opus-5-5', max_text: 4000, chats: [] }, { proposals: [PROPOSAL({ status: 'created' })] }));
    await F.loadAssistant();
    assert.match(el('as-status').innerHTML, /Not set up.*ANTHROPIC_API_KEY/);
    assert.deepEqual([el('as-chat-section').style.display, el('as-made-section').style.display, el('as-text').disabled, el('as-send').disabled], ['none', '', true, true]);
    assert.match(el('as-made').innerHTML, /undoAssistantProposal\(12\)/);
    el('as-text').value = 'Do it anyway';
    await F.askAssistant();
    assert.equal(F.__asked.filter(a => a[0] === 'POST').length, 0, 'and an order is not sent');
  });
  test('the server away, or an answer that is none: said, both parts stay hidden, nothing more is asked', async () => {
    for (const [answer, said] of [[new Error('offline'), 'The server could not be reached.'], [{ error: 'Admin authentication required' }, 'Admin authentication required'], [{ __raw: 500 }, 'The server did not answer as expected.'], [{}, null], [null, 'The server did not answer as expected.'], [{ configured: 'yes' }, null]]) {
      F.__reset(); F.__set2('answers', ROUTES(answer));
      await F.loadAssistant();
      assert.equal(el('as-status').innerHTML, `<span class="prov-badge off">Could not be loaded</span>${said ? ` <span class="prov-hint">${said}</span>` : ''}`, JSON.stringify(answer));
      assert.deepEqual([el('as-chat-section').style.display, el('as-made-section').style.display, F.__asked.length], ['none', 'none', 1]);
    }
  });
  test('the list of what it made cannot be read: said in its place, the conversation stands', async () => {
    for (const [answer, said] of [[{ error: 'Too <many>' }, 'Too &lt;many&gt;'], [new Error('offline'), 'The server could not be reached.'], [{}, 'The list could not be loaded.'], [{ proposals: 'x' }, 'The list could not be loaded.']]) {
      F.__reset(); F.__set2('answers', ROUTES(READY(), answer));
      await F.loadAssistant();
      assert.equal(el('as-made').innerHTML, `<div class="message error" style="display:block">${said}</div>`);
      assert.match(el('as-entries').innerHTML, /No conversation yet/); assert.equal(el('as-text').disabled, false);
    }
  });
  test('opening the tab again leaves the open conversation as it is, and its cards follow what became of their proposals', async () => {
    open(); F.__set('assistantChat', 3); F.__set('assistantEntries', [{ role: 'you', text: 'Make it' }, { role: 'assistant', text: 'Here.', proposals: [PROPOSAL()] }]);
    F.__set2('answers', ROUTES(READY(), { proposals: [PROPOSAL({ status: 'created', flow_id: 9 })] }));
    await F.loadAssistant();
    assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries.length, F.__state().assistantEntries[1].proposals[0].status], [3, 2, 'created']);
    assert.match(el('as-entries').innerHTML, /Created, switched off/);
  });
});

describe('an order', () => {
  const ASK = 'POST /api/admin/assistant/ask';
  test('is shown at once and the input locked while the assistant works; then the answer stands under it', async () => {
    open();
    let answer; const waiting = new Promise(r => { answer = r; });
    F.__set2('answers', { [ASK]: () => waiting, 'GET /api/admin/assistant': READY({ chats: [{ id: 8, title: 'Make a welcome workflow', updated_at: null }] }) });
    el('as-text') || F.document.getElementById('as-text'); F.document.getElementById('as-text').value = '  Make a welcome workflow for Müller  ';
    const done = F.askAssistant();
    await new Promise(r => setImmediate(r));
    assert.deepEqual(F.__asked, [['POST', '/api/admin/assistant/ask', { chat_id: null, text: 'Make a welcome workflow for Müller' }]], 'a new conversation; the order without the blanks around it');
    assert.match(el('as-entries').innerHTML, /<div class="as-text">Make a welcome workflow for Müller<\/div><\/div><div class="as-entry as-assistant"><div class="as-who">Assistant<\/div><span class="prov-hint">Working…/);
    assert.deepEqual([el('as-text').value, el('as-text').disabled, el('as-send').disabled, el('as-new').disabled, F.__state().assistantBusy], ['', true, true, true, true]);
    F.document.getElementById('as-text').value = 'A second one meanwhile';
    await F.askAssistant(); F.newAssistantChat(); await F.openAssistantChat(3);
    assert.equal(F.__asked.length, 1, 'nothing else is sent, opened or begun while it runs');
    F.document.getElementById('as-text').value = '';
    answer({ chat_id: 8, reply: 'Proposed.\nHave a look.', looked_at: ['Looked at the setup of "Müller & Söhne"'], proposals: [PROPOSAL({ chat_id: 8 })] });
    await done;
    const s = F.__state();
    assert.deepEqual([s.assistantBusy, s.assistantChat, s.assistantEntries.length, s.assistantEntries[1].role, s.assistantMade.map(p => p.id)], [false, 8, 2, 'assistant', [12]]);
    assert.deepEqual(F.__asked.slice(1), [['GET', '/api/admin/assistant']], 'the earlier conversations are read again: the new one has its title now');
    assert.match(el('as-entries').innerHTML, /as-looked">Looked at the setup of &quot;Müller &amp; Söhne&quot;<\/div><div class="as-text">Proposed\.\nHave a look\.<\/div><div class="as-card">/);
    assert.doesNotMatch(el('as-entries').innerHTML, /Working/);
    assert.match(el('as-chats').innerHTML, /<button class="btn btn-primary" onclick="openAssistantChat\(8\)"/);
    assert.match(el('as-made').innerHTML, /createAssistantProposal\(12\)/, 'what it proposed is in the list at once');
    assert.deepEqual([el('as-text').disabled, el('as-send').disabled, el('as-error').innerHTML], [false, false, '']);
  });
  test('the next order goes into the same conversation', async () => {
    open(); F.__set('assistantChat', 8); F.__set('assistantEntries', [{ role: 'you', text: 'a' }, { role: 'assistant', text: 'b', proposals: [] }]);
    F.__set2('answers', { [ASK]: { chat_id: 8, reply: 'c', looked_at: 'x', proposals: 'x' }, 'GET /api/admin/assistant': new Error('offline') });
    F.document.getElementById('as-text').value = 'And now?';
    await F.askAssistant();
    assert.deepEqual(F.__asked[0], ['POST', '/api/admin/assistant/ask', { chat_id: 8, text: 'And now?' }]);
    assert.deepEqual(F.__state().assistantEntries.map(e => [e.role, e.text]), [['you', 'a'], ['assistant', 'b'], ['you', 'And now?'], ['assistant', 'c']]);
    assert.deepEqual([F.__state().assistantEntries[3].looked_at, F.__state().assistantEntries[3].proposals], [[], []], 'what is no list is none');
    assert.deepEqual(F.__state().assistantInfo.chats, [], 'the list of conversations that could not be read again stays as it was');
  });
  test('nothing, only blanks, or more than the server takes is not sent', async () => {
    open({ max_text: 20 });
    for (const text of ['', '   \n ']) { F.document.getElementById('as-text').value = text; await F.askAssistant(); }
    F.document.getElementById('as-text').value = 'x'.repeat(21);
    await F.askAssistant();
    assert.deepEqual([F.__asked.length, el('as-error').innerHTML, el('as-text').value.length, F.__state().assistantEntries.length],
      [0, '<div class="message error" style="display:block; margin-bottom:12px">An order has at most 20 characters. This one has 21.</div>', 21, 0]);
    assert.deepEqual([F.assistantMax(), (F.__set('assistantInfo', READY({ max_text: 'x' })), F.assistantMax()), (F.__set('assistantInfo', null), F.assistantMax())], [20, 4000, 4000]);
  });
  test('every refusal is said in the server\'s words, as text — and the order is back in the input', async () => {
    const REFUSALS = [['not_configured', 'The assistant is not set up on this server.'], ['text', 'An order has 1 to 4000 characters.'], ['chat', 'No such conversation.'], ['busy', 'The assistant is still working on this conversation.'],
      ['key', 'Anthropic does not accept the API key.'], ['rate', 'Anthropic\'s limit is reached. Try again in a moment.'], ['unreachable', 'Anthropic could not be reached.'], ['declined', 'The assistant declined this order.'],
      ['too_long', 'That took too many steps. Ask for less at once.'], ['rejected', `Anthropic refused the request. ${HOSTILE}`]];
    for (const [code, error] of REFUSALS) {
      open(); F.__set2('answers', { [ASK]: { error, code }, 'GET /api/admin/assistant': READY() });
      F.document.getElementById('as-text').value = 'Make it';
      await F.askAssistant();
      assert.equal(el('as-error').innerHTML, `<div class="message error" style="display:block; margin-bottom:12px">${error === REFUSALS[9][1] ? `Anthropic refused the request. ${SAFE}` : error.replace(/'/g, '&#39;')}</div>`, code);
      assert.deepEqual([el('as-text').value, F.__state().assistantEntries.length, F.__state().assistantBusy, el('as-text').disabled], ['Make it', 0, false, false], code);
      assert.doesNotMatch(el('as-entries').innerHTML, /Working|Make it/, code);
    }
  });
  test('the network away, an answer that is no JSON, too many orders, an answer without a reply', async () => {
    // "too many orders" comes from the server's limiter as a sentence without a code (server.js: its codes are the
    // Engine API's) — or, from something in between, as a bare 429 with no JSON at all: both are said
    for (const [answer, said] of [[new Error('offline'), 'The server could not be reached.'], [{ __raw: 502 }, 'The server did not answer as expected.'], [{ __raw: 429 }, 'Too many orders in a short time. Try again in a few minutes.'],
      [{ error: 'Too many orders for the assistant. Please wait a few minutes.' }, 'Too many orders for the assistant. Please wait a few minutes.'],
      [{}, 'That did not work.'], [{ reply: 5 }, 'That did not work.'], [null, 'The server did not answer as expected.']]) {
      open(); F.__set2('answers', { [ASK]: answer, 'GET /api/admin/assistant': READY() });
      F.document.getElementById('as-text').value = 'Make it';
      await F.askAssistant();
      assert.equal(el('as-error').innerHTML, `<div class="message error" style="display:block; margin-bottom:12px">${said}</div>`, JSON.stringify(answer));
      assert.deepEqual([el('as-text').value, F.__state().assistantEntries.length, F.__state().assistantChat], ['Make it', 0, null]);
      assert.deepEqual(F.__asked.map(a => a.slice(0, 2)), [['POST', '/api/admin/assistant/ask'], ['GET', '/api/admin/assistant']], 'no conversation is named, so none is read');
    }
    const limiter = read('server.js').match(/const assistantAskLimiter = rateLimit\(\{[\s\S]*?\}\);/)[0];
    assert.match(limiter, /message: \{ error: 'Too many orders for the assistant\. Please wait a few minutes\.' \},/, 'the limiter\'s answer is that sentence, and carries no code');
    assert.doesNotMatch(limiter, /code:/);
  });
  test('a refused FIRST order whose look-ups the server kept names its conversation: that one is opened and read, and the next order goes on in it', async () => {
    const KEPT = [{ role: 'you', text: 'Make it' }, { role: 'assistant', text: 'I looked at the workspace.', proposals: [PROPOSAL({ id: 31, chat_id: 9 })] }];
    open(); F.__set('assistantMade', [PROPOSAL({ id: 31, chat_id: 9, status: 'created' })]);
    F.__set2('answers', { [ASK]: { error: 'That took too many steps. Ask for less at once.', code: 'too_long', chat_id: 9 }, 'GET /api/admin/assistant/chats/9': { chat: { id: 9, title: 'Make it', entries: KEPT } }, 'GET /api/admin/assistant': READY({ chats: [{ id: 9, title: 'Make it', updated_at: null }] }) });
    F.document.getElementById('as-text').value = 'Make it';
    await F.askAssistant();
    assert.deepEqual(F.__asked.map(a => a.slice(0, 2)), [['POST', '/api/admin/assistant/ask'], ['GET', '/api/admin/assistant/chats/9'], ['GET', '/api/admin/assistant']]);
    assert.deepEqual(F.__asked[0][2], { chat_id: null, text: 'Make it' }, 'it was asked as a new conversation');
    const st = F.__state();
    assert.deepEqual([st.assistantChat, st.assistantEntries.length, st.assistantEntries[1].text, st.assistantEntries[1].proposals[0].status, st.assistantBusy], [9, 2, 'I looked at the workspace.', 'created', false], 'what the server kept is shown, a card as its proposal is now');
    assert.equal(el('as-text').value, '', 'the order stands in the conversation: not in the input a second time');
    assert.match(el('as-error').innerHTML, /That took too many steps\. Ask for less at once\./);
    assert.match(el('as-chats').innerHTML, /<button class="btn btn-primary" onclick="openAssistantChat\(9\)"/, 'it is the open one in the list');
    // the next order goes on in it
    F.__asked.length = 0;
    F.__set2('answers', { [ASK]: { chat_id: 9, reply: 'Done.', looked_at: [], proposals: [] }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'Only the email then';
    await F.askAssistant();
    assert.deepEqual(F.__asked[0], ['POST', '/api/admin/assistant/ask', { chat_id: 9, text: 'Only the email then' }]);
    assert.equal(F.__state().assistantEntries.length, 4);
  });
  test('… the order itself was not kept there: it is back in the input; and when that conversation cannot be read, it is the open one all the same', async () => {
    open();
    F.__set2('answers', { [ASK]: { error: 'Anthropic could not be reached.', code: 'unreachable', chat_id: '9' }, 'GET /api/admin/assistant/chats/9': { chat: { id: 9, title: 't', entries: [{ role: 'you', text: 'Something earlier' }, { role: 'assistant', text: 'b', proposals: [] }] } }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'Make it';
    await F.askAssistant();
    assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries.length, el('as-text').value], [9, 2, 'Make it'], 'an id that came as text is the same conversation');
    open();
    F.__set2('answers', { [ASK]: { error: 'Anthropic could not be reached.', code: 'unreachable', chat_id: 9 }, 'GET /api/admin/assistant/chats/9': new Error('offline'), 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'Make it';
    await F.askAssistant();
    assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries.length, el('as-text').value, F.__state().assistantBusy], [9, 0, 'Make it', false]);
    assert.match(el('as-error').innerHTML, /Anthropic could not be reached\./);
  });
  test('only a number names a conversation: anything else in a refusal\'s `chat_id` is not opened and never becomes part of an address', async () => {
    for (const chat_id of ['abc', 0, -1, 1.5, '9/../../workspaces', '9?x=1', '', null, {}, [9, 1], true, '0009']) {
      open(); F.__set2('answers', { [ASK]: { error: 'No.', code: 'rejected', chat_id }, 'GET /api/admin/assistant': READY() });
      F.document.getElementById('as-text').value = 'Make it';
      await F.askAssistant();
      assert.deepEqual([F.__state().assistantChat, F.__asked.map(a => a[1])], [null, ['/api/admin/assistant/ask', '/api/admin/assistant']], JSON.stringify(chat_id));
    }
    // in a conversation that is open, such a `chat_id` changes nothing: the open one is read again, as before
    open(); F.__set('assistantChat', 8);
    F.__set2('answers', { [ASK]: { error: 'No.', code: 'rejected', chat_id: 'abc' }, 'GET /api/admin/assistant/chats/8': { chat: { id: 8, title: 't', entries: [] } }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'Make it';
    await F.askAssistant();
    assert.deepEqual([F.__state().assistantChat, F.__asked.map(a => a[1])], [8, ['/api/admin/assistant/ask', '/api/admin/assistant/chats/8', '/api/admin/assistant']]);
    // and a refusal that names ANOTHER conversation than the open one moves to the one the server kept the order in
    open(); F.__set('assistantChat', 8);
    F.__set2('answers', { [ASK]: { error: 'No.', code: 'rejected', chat_id: 12 }, 'GET /api/admin/assistant/chats/12': { chat: { id: 12, title: 't', entries: [] } }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'Make it';
    await F.askAssistant();
    assert.deepEqual([F.__state().assistantChat, F.__asked.map(a => a[1])], [12, ['/api/admin/assistant/ask', '/api/admin/assistant/chats/12', '/api/admin/assistant']]);
  });
  test('an answer that is neither a reply nor a refusal but names a conversation: that did not work — and the conversation it names is the open one', async () => {
    open(); F.__set2('answers', { [ASK]: { chat_id: 8 }, 'GET /api/admin/assistant/chats/8': { chat: { id: 8, title: 't', entries: [{ role: 'you', text: 'Make it' }] } }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'Make it';
    await F.askAssistant();
    assert.equal(el('as-error').innerHTML, '<div class="message error" style="display:block; margin-bottom:12px">That did not work.</div>');
    assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries.length, el('as-text').value], [8, 1, '']);
  });
  test('a refusal in a conversation that exists: what the server kept of it is what is shown', async () => {
    const KEPT = [{ role: 'you', text: 'a' }, { role: 'assistant', text: 'b', proposals: [PROPOSAL()] }];
    open(); F.__set('assistantChat', 8); F.__set('assistantEntries', [...KEPT]); F.__set('assistantMade', [PROPOSAL({ status: 'created' })]);
    F.__set2('answers', { [ASK]: { error: 'Anthropic could not be reached.', code: 'unreachable' }, 'GET /api/admin/assistant/chats/8': { chat: { id: 8, title: 't', entries: KEPT } }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'And now?';
    await F.askAssistant();
    assert.deepEqual(F.__asked.map(a => a.slice(0, 2)), [['POST', '/api/admin/assistant/ask'], ['GET', '/api/admin/assistant/chats/8'], ['GET', '/api/admin/assistant']]);
    assert.deepEqual([F.__state().assistantEntries.length, el('as-text').value, F.__state().assistantEntries[1].proposals[0].status], [2, 'And now?', 'created'], 'the order was not kept: it is back in the input; the card shows what became of its proposal');
    assert.match(el('as-error').innerHTML, /Anthropic could not be reached\./);
    // the server kept the order (the assistant failed later): it stands in the conversation, not in the input a second time
    open(); F.__set('assistantChat', 8); F.__set('assistantEntries', [...KEPT]);
    F.__set2('answers', { [ASK]: { error: 'That took too many steps.', code: 'too_long' }, 'GET /api/admin/assistant/chats/8': { chat: { id: 8, title: 't', entries: [...KEPT, { role: 'you', text: 'And now?' }, { role: 'assistant', text: 'I looked.', proposals: [] }] } }, 'GET /api/admin/assistant': READY() });
    F.document.getElementById('as-text').value = 'And now?';
    await F.askAssistant();
    assert.deepEqual([F.__state().assistantEntries.length, el('as-text').value], [4, '']);
    // the conversation cannot be read again either: it stays as it was shown, without the order
    open(); F.__set('assistantChat', 8); F.__set('assistantEntries', [...KEPT]);
    F.__set2('answers', { [ASK]: new Error('offline'), 'GET /api/admin/assistant/chats/8': new Error('offline'), 'GET /api/admin/assistant': new Error('offline') });
    F.document.getElementById('as-text').value = 'And now?';
    await F.askAssistant();
    assert.deepEqual([F.__state().assistantEntries.length, el('as-text').value, F.__state().assistantBusy], [2, 'And now?', false]);
  });
  test('Enter sends, Shift+Enter is a new line, and nothing else sends', async () => {
    open(); F.__set2('answers', { [ASK]: { chat_id: 1, reply: 'ok', looked_at: [], proposals: [] }, 'GET /api/admin/assistant': READY() });
    const press = async over => { const e = { key: 'Enter', shiftKey: false, isComposing: false, prevented: 0, preventDefault() { e.prevented++; }, ...over }; F.assistantKey(e); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); return e.prevented; };
    F.document.getElementById('as-text').value = 'Do it';
    for (const over of [{ shiftKey: true }, { key: 'a' }, { key: 'Escape' }, { isComposing: true }]) assert.equal(await press(over), 0, JSON.stringify(over));
    assert.equal(F.__asked.length, 0);
    F.assistantKey(null); F.assistantKey(undefined);
    assert.equal(await press({}), 1, 'the line break is not typed');
    assert.deepEqual(F.__asked[0], ['POST', '/api/admin/assistant/ask', { chat_id: null, text: 'Do it' }]);
  });
});

describe('"Create", "Undo" and "Create again"', () => {
  const START = () => { open(); F.__set('assistantChat', 3); F.__set('assistantEntries', [{ role: 'you', text: 'Make it' }, { role: 'assistant', text: 'Here.', proposals: [PROPOSAL(), PROPOSAL({ id: 13, name: 'Another' })] }]); F.__set('assistantMade', [PROPOSAL({ id: 13, name: 'Another' }), PROPOSAL()]); };
  test('"Create" asks the server for that proposal; what comes back takes its place on the card and in the list', async () => {
    START(); F.__set2('answers', { 'POST /api/admin/assistant/proposals/12/create': { proposal: PROPOSAL({ status: 'created', flow_id: 9, made_at: '2026-11-24T10:05:00.000Z' }) } });
    await F.createAssistantProposal(12);
    assert.deepEqual(F.__asked, [['POST', '/api/admin/assistant/proposals/12/create', {}]]);
    const s = F.__state();
    assert.deepEqual([s.assistantEntries[1].proposals.map(p => [p.id, p.status]), s.assistantMade.map(p => [p.id, p.status]), s.assistantActing, s.assistantSaid], [[[12, 'created'], [13, 'proposed']], [[13, 'proposed'], [12, 'created']], [], {}]);
    assert.equal(count(el('as-entries').innerHTML, 'Created, switched off'), 1); assert.equal(count(el('as-made').innerHTML, 'Created, switched off'), 1);
    assert.equal(count(el('as-entries').innerHTML, 'undoAssistantProposal(12)'), 1); assert.match(el('as-entries').innerHTML, /createAssistantProposal\(13\)/);
  });
  test('"Undo" asks first; then the workflow is taken away, and "Create again" makes it once more', async () => {
    START(); F.__set('assistantMade', [PROPOSAL({ status: 'created' })]); F.__set('assistantEntries', [{ role: 'assistant', text: '', proposals: [PROPOSAL({ status: 'created' })] }]);
    F.__set2('confirm', false);
    assert.equal(await F.undoAssistantProposal(12), undefined);
    assert.deepEqual(F.__asked, [['confirm', 'Take this workflow away again? It is removed from the workspace. That works only while nobody has switched it on or changed it there.']], 'declined: nothing is asked of the server');
    F.__set2('confirm', true);
    F.__set2('answers', { 'POST /api/admin/assistant/proposals/12/undo': { proposal: PROPOSAL({ status: 'undone', undone_at: '2026-11-24T10:06:00.000Z' }) }, 'POST /api/admin/assistant/proposals/12/create': { proposal: PROPOSAL({ status: 'created', flow_id: 10 }) } });
    await F.undoAssistantProposal(12);
    assert.deepEqual(F.__asked.at(-1), ['POST', '/api/admin/assistant/proposals/12/undo', {}]);
    assert.match(el('as-entries').innerHTML, /<span class="prov-badge no">Undone<\/span> <button class="btn" onclick="createAssistantProposal\(12\)">Create again<\/button>/);
    await F.createAssistantProposal(12);
    assert.deepEqual([F.__state().assistantMade[0].status, F.__state().assistantMade[0].flow_id], ['created', 10]);
    assert.match(el('as-made').innerHTML, /undoAssistantProposal\(12\)/);
  });
  test('while it runs the button is locked, and a second press does nothing', async () => {
    START();
    let answer; const waiting = new Promise(r => { answer = r; });
    F.__set2('answers', { 'POST /api/admin/assistant/proposals/12/create': () => waiting });
    const done = F.createAssistantProposal(12);
    await new Promise(r => setImmediate(r));
    assert.match(el('as-entries').innerHTML, /<button class="btn btn-primary" disabled onclick="createAssistantProposal\(12\)">/);
    assert.match(el('as-entries').innerHTML, /<button class="btn btn-primary" onclick="createAssistantProposal\(13\)">/, 'the other proposal is free');
    await F.createAssistantProposal(12);
    assert.equal(F.__asked.length, 1);
    answer({ proposal: PROPOSAL({ status: 'created' }) });
    await done;
    assert.deepEqual(F.__state().assistantActing, []);
  });
  test('a refusal is said on the proposal\'s card — "no longer valid" with every problem — and the list is read again', async () => {
    const CASES = [['create', { error: 'The proposal is no longer valid.', code: 'invalid', problems: ['ask1: The stage is not one of this workspace', `mail1: ${HOSTILE}`] }, /The proposal is no longer valid\.<ul class="as-problems"><li>ask1: The stage is not one of this workspace<\/li><li>mail1: &lt;img/],
      ['create', { error: 'A workspace has at most 20 workflows', code: 'limit' }, />A workspace has at most 20 workflows<\/div>/], ['create', { error: 'The workspace no longer exists.', code: 'workspace' }, />The workspace no longer exists\.<\/div>/],
      ['create', { error: 'It is already created.', code: 'state' }, />It is already created\.<\/div>/], ['create', { error: 'Not found', code: 'not_found' }, />Not found<\/div>/],
      ['undo', { error: 'It was switched on, has run or was changed in the workspace. Remove it there.', code: 'changed' }, />It was switched on, has run or was changed in the workspace\. Remove it there\.<\/div>/],
      ['undo', { error: 'There is nothing to undo.', code: 'state' }, />There is nothing to undo\.<\/div>/], ['create', new Error('offline'), />The server could not be reached\.<\/div>/], ['create', {}, />That did not work\.<\/div>/], ['undo', { proposal: 'x' }, />That did not work\.<\/div>/]];
    for (const [what, answer, said] of CASES) {
      START(); F.__set2('answers', { [`POST /api/admin/assistant/proposals/12/${what}`]: answer, 'GET /api/admin/assistant/proposals': { proposals: [PROPOSAL({ id: 13, name: 'Another' }), PROPOSAL({ status: what === 'undo' ? 'created' : 'proposed' })] } });
      await (what === 'undo' ? F.undoAssistantProposal(12) : F.createAssistantProposal(12));
      assert.deepEqual(F.__asked.filter(a => a[0] !== 'confirm').map(a => a.slice(0, 2)), [['POST', `/api/admin/assistant/proposals/12/${what}`], ['GET', '/api/admin/assistant/proposals']], JSON.stringify(answer));
      assert.match(el('as-entries').innerHTML, said); assert.match(el('as-made').innerHTML, said);
      assert.doesNotMatch(el('as-entries').innerHTML, /<img/);
      assert.equal(count(el('as-entries').innerHTML, 'message error'), 1, 'on that card only');
      assert.deepEqual(F.__state().assistantActing, []);
    }
    // the next press takes the old words away before the server answers
    START(); F.__set('assistantSaid', { 12: { text: 'Old words' } });
    F.__set2('answers', { 'POST /api/admin/assistant/proposals/12/create': { proposal: PROPOSAL({ status: 'created' }) } });
    await F.createAssistantProposal(12);
    assert.doesNotMatch(el('as-entries').innerHTML, /Old words/); assert.deepEqual(F.__state().assistantSaid, {});
  });
  test('an id that is no number is never sent', async () => {
    START();
    for (const id of ['12/../../x', '<i>', null, undefined, 0, -1, 1.5, {}]) { await F.createAssistantProposal(id); F.__set2('confirm', true); await F.undoAssistantProposal(id); await F.openAssistantChat(id); }
    assert.deepEqual(F.__asked.filter(a => a[0] !== 'confirm'), []);
  });
  test('a proposal the list did not have yet is put in front; what is no proposal is not put anywhere', () => {
    START();
    F.assistantPut(PROPOSAL({ id: 30 })); F.assistantPut(null); F.assistantPut('x'); F.assistantPut({ id: 'x' }); F.assistantPut({});
    assert.deepEqual(F.__state().assistantMade.map(p => p.id), [30, 13, 12]);
  });
});

describe('an earlier conversation, and a new one', () => {
  test('opened: its turns as the server has them; its cards show what became of their proposals since', async () => {
    open(); F.__set('assistantMade', [PROPOSAL({ status: 'undone' })]);
    F.__set2('answers', { 'GET /api/admin/assistant/chats/3': { chat: { id: 3, title: 'Earlier', entries: [{ role: 'you', text: 'Make it' }, { role: 'assistant', text: 'Here.', proposals: [PROPOSAL()] }] } } });
    F.assistantSay('an older refusal');
    await F.openAssistantChat('3');
    assert.deepEqual(F.__asked, [['GET', '/api/admin/assistant/chats/3']]);
    assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries.length, el('as-error').innerHTML], [3, 2, '']);
    assert.match(el('as-entries').innerHTML, /<div class="as-text">Make it<\/div>/); assert.match(el('as-entries').innerHTML, /Create again/);
  });
  test('one that cannot be opened: said, and the conversation that is open stays', async () => {
    for (const [answer, said] of [[{ error: 'No such <conversation>.', code: 'chat' }, 'No such &lt;conversation&gt;.'], [new Error('offline'), 'The server could not be reached.'], [{}, 'That did not work.'], [{ chat: { id: 3 } }, 'That did not work.']]) {
      open(); F.__set('assistantChat', 8); F.__set('assistantEntries', [{ role: 'you', text: 'stays' }]);
      F.__set2('answers', { 'GET /api/admin/assistant/chats/3': answer });
      await F.openAssistantChat(3);
      assert.equal(el('as-error').innerHTML, `<div class="message error" style="display:block; margin-bottom:12px">${said}</div>`);
      assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries.length], [8, 1]);
    }
  });
  test('"New conversation": the turns are gone from view, the next order begins a new one, and nothing is asked of the server', async () => {
    open(); F.__set('assistantChat', 8); F.__set('assistantEntries', [{ role: 'you', text: 'old' }]); F.assistantSay('an older refusal');
    F.newAssistantChat();
    assert.deepEqual([F.__state().assistantChat, F.__state().assistantEntries, F.__asked.length, el('as-error').innerHTML], [null, [], 0, '']);
    assert.match(el('as-entries').innerHTML, /No conversation yet/);
    assert.doesNotMatch(block, /method: 'DELETE'|'DELETE'|'PUT'|'PATCH'/, 'the console has no way to delete or change a conversation, a proposal or a workflow other than "Undo"');
    assert.deepEqual([...new Set([...block.matchAll(/assistantFetch\('(GET|POST)', (`[^`]*`|'[^']*')/g)].map(m => `${m[1]} ${m[2].slice(1, -1)}`))].sort(),
      ['GET /assistant', 'GET /assistant/chats/${assistantChat}', 'GET /assistant/chats/${n}', 'GET /assistant/proposals', 'POST /assistant/ask', 'POST /assistant/proposals/${n}/${what}']);
  });
});

describe('the lines that make it so', () => {
  test('every value that is put into the page goes through esc, or is one of the console\'s own', () => {
    // Every ${…} of the functions that build HTML, at every depth. A hole that itself holds a template only chooses
    // or repeats it (cond ? `…` : '…', list.map(x => `…`)): its inner holes are checked on their own. Every other
    // hole is escaped, a number, or something the console itself wrote.
    const LEAF = [/^esc\(/, /^id$/, /^assistantId\(c\.id\)$/, /^locked$/, /^undone$/, /^where$/, /^looked$/, /^cards$/, /^asked\(p\)$/, /^renderAssistant(Actions|Said|Step)\(p(, \w+)?\)$/, /^renderAssistantStep\(p, s\)$/,
      /^start \? renderAssistantStep\(p, start\) : ''$/, /^steps\.map\(s => renderAssistantStep\(p, s\)\)\.join\(''\)$/, /^assistantLines\(p, box\)\.map\(esc\)\.join\('<br>'\)$/, /^busy \? ' disabled' : ''$/,
      /^assistantId\(c\.id\) === open \? ' btn-primary' : ''$/, /^you \? 'as-you' : 'as-assistant'$/, /^you \? 'You' : 'Assistant'$/, /^renderAssistantActions\(p\)$/, /^renderAssistantSaid\(p\)$/];
    const CHOOSES = [/^[^`$]*\? `[\s\S]*` : ''$/, /^[^`$]*\.map\(\w+ => `[\s\S]*`\)\.join\(''\)$/];
    const holesOf = src => {
      const out = []; const stack = [];
      for (let i = 0; i < src.length; i++) {
        if (src[i] === '$' && src[i + 1] === '{') { stack.push({ from: i + 2, braces: 0 }); i++; }
        else if (src[i] === '{' && stack.length) stack.at(-1).braces++;
        else if (src[i] === '}' && stack.length) { const top = stack.at(-1); if (top.braces) top.braces--; else { out.push(src.slice(top.from, i).trim()); stack.pop(); } }
      }
      return out;
    };
    const builders = ['renderAssistantStatus', 'renderAssistantSaid', 'renderAssistantActions', 'renderAssistantStep', 'renderAssistantCard', 'renderAssistantEntry', 'renderAssistantEntries', 'renderAssistantChats', 'renderAssistantMade'];
    let leaves = 0;
    for (const name of builders) {
      const src = sliceFn(inline, name, 'admin.html');
      // only what is inside a template: the function's own braces are no holes
      const holes = [...src.matchAll(/`(?:[^`\\]|\\.)*`/g)].length ? holesOf(src) : [];
      assert.ok(holes.length > 0, name);
      for (const hole of holes) {
        if (hole.includes('`')) assert.ok(CHOOSES.some(re => re.test(hole)), `${name} chooses: \${${hole}}`);
        else { leaves++; assert.ok(LEAF.some(re => re.test(hole)), `${name}: \${${hole}}`); }
      }
    }
    assert.ok(leaves >= 40, `holes looked at: ${leaves}`);
    assert.match(line('assistantSay'), /\$\{esc\(text\)\}/);
  });
  test('the answer is put into the page as text only: no place of the tab turns it into markup', () => {
    const assigned = [...block.matchAll(/\.innerHTML = (.*)$/gm)].map(m => m[1]);
    for (const right of assigned) assert.match(right, /^(renderAssistant(Status|Entries|Chats|Made)\(|text \? `<div class="message error" style="display:block; margin-bottom:12px">\$\{esc\(text\)\}<\/div>` : '')/, right.slice(0, 80));
    assert.doesNotMatch(block, /\bmarked\(|DOMParser|insertAdjacentHTML|document\.write|\beval\(/);
    assert.equal(count(block, '.innerHTML = '), 5, 'the status, the turns, the conversations, the list, and what is said');
  });
  test('the state the tab keeps, and that an order names the conversation it belongs to', () => {
    for (const decl of ['let assistantInfo = null;', 'let assistantChat = null;', 'let assistantEntries = [];', 'let assistantBusy = false;', 'let assistantMade = [];', 'let assistantSaid = {};', 'let assistantActing = [];']) assert.equal(count(inline, `    ${decl}`), 1, decl);
    assert.match(block, /assistantFetch\('POST', '\/assistant\/ask', \{ chat_id: assistantChat, text \}\)/);
    assert.match(block, /assistantChat = assistantId\(data && data\.chat_id\) \|\| assistantChat;\s+\/\/ a refused order whose look-ups were kept names its conversation\n\s+if \(assistantChat\) \{/, 'the conversation a refusal names is taken before it is decided whether there is one to read again');
    assert.match(block, /entries\.scrollTop = entries\.scrollHeight;/, 'the newest turn is the one in view');
  });
});
