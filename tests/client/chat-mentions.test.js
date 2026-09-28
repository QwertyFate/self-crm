// CLIENT (static + pure-function) tests for /deal and /contact mentions in the
// team chat: the slash parser, the record filter, the "@Label" → [[kind:id|Label]]
// encoding on send, the token → link rendering, the composer wiring (menu owns
// the keys, delegated click opens the record, no switchPage), copy in both
// dictionaries, and token-only CSS inside the chat section.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const css  = read('public/style.css');
const chat = read('public/js/chat.js');
const core = read('public/js/core.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const chatCss = css.slice(css.indexOf('25 · TEAM CHAT'), css.indexOf('@mention autocomplete'));

const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'UI_ICON'),
  sliceFn(core, 't', 'core.js'),
].join('\n');
const F = loadFns('public/js/chat.js',
  ['parseSlashCommand', 'filterChatRefs', 'chatRefLabel', 'chatRefToken', 'encodeChatMentions', 'chatRefHtml', 'renderMessageBody', 'linkify', 'chatInitials'],
  { state: { currentLang: 'en' }, extra });

describe('parseSlashCommand', () => {
  test('a bare slash lists the commands; a partial command narrows it; nonsense closes it', () => {
    assert.deepEqual(F.parseSlashCommand('/', 1), { mode: 'commands', query: '', start: 0 });
    assert.deepEqual(F.parseSlashCommand('hi /co', 6), { mode: 'commands', query: 'co', start: 3 });
    assert.equal(F.parseSlashCommand('/dealx', 6), null);
    assert.equal(F.parseSlashCommand('/xyz', 4), null);
  });
  test('/deal and /contact open their lists with the query after the space', () => {
    assert.deepEqual(F.parseSlashCommand('/deal', 5), { mode: 'deal', query: '', start: 0 });
    assert.deepEqual(F.parseSlashCommand('see /deal acm', 13), { mode: 'deal', query: 'acm', start: 4 });
    assert.deepEqual(F.parseSlashCommand('/Contact jane doe', 17), { mode: 'contact', query: 'jane doe', start: 0 });
  });
  test('only at a word start, only up to the caret, never across a line break', () => {
    assert.equal(F.parseSlashCommand('a/deal', 6), null, 'mid-word slash is not a command');
    assert.equal(F.parseSlashCommand('http://x', 8), null);
    assert.deepEqual(F.parseSlashCommand('/deal acm and more', 9), { mode: 'deal', query: 'acm', start: 0 }, 'text after the caret is ignored');
    assert.equal(F.parseSlashCommand('/deal\nx', 7), null);
  });
});

describe('filterChatRefs', () => {
  const items = [
    { kind: 'deal', id: 1, label: 'Acme renewal', meta: 'Jane Doe · Proposal' },
    { kind: 'deal', id: 2, label: 'Globex onboarding', meta: 'Bob' },
    { kind: 'deal', id: 3, label: 'Third', meta: '' },
  ];
  test('matches label or meta, case-insensitive, capped', () => {
    assert.deepEqual(F.filterChatRefs(items, 'ACME').map(i => i.id), [1]);
    assert.deepEqual(F.filterChatRefs(items, 'bob').map(i => i.id), [2]);
    assert.deepEqual(F.filterChatRefs(items, '').map(i => i.id), [1, 2, 3]);
    assert.equal(F.filterChatRefs(items, '', 2).length, 2);
  });
});

describe('tokens', () => {
  test('labels drop the token syntax characters and are capped', () => {
    assert.equal(F.chatRefLabel(' A [b] | c\nd '), 'A b c d');
    assert.equal(F.chatRefLabel('x'.repeat(200)).length, 120);
    assert.equal(F.chatRefToken('deal', '12', 'Acme renewal'), '[[deal:12|Acme renewal]]');
    assert.equal(F.chatRefToken('contact', 7, ''), '[[contact:7|contact]]');
  });
  test('encode: each picked "@Label" becomes its token once, longest label first; an edited label stays text', () => {
    const drafts = [{ kind: 'deal', id: 12, label: 'Acme' }, { kind: 'deal', id: 13, label: 'Acme renewal' }];
    assert.equal(F.encodeChatMentions('look at @Acme renewal and @Acme', drafts), 'look at [[deal:13|Acme renewal]] and [[deal:12|Acme]]');
    assert.equal(F.encodeChatMentions('look at @Acme renew', [{ kind: 'deal', id: 13, label: 'Acme renewal' }]), 'look at @Acme renew');
    assert.equal(F.encodeChatMentions('plain', []), 'plain');
  });
});

describe('renderMessageBody', () => {
  test('a deal token becomes a chip link with the deal glyph; plain runs are escaped and linkified around it', () => {
    const html = F.renderMessageBody('see [[deal:12|Acme & Co]] at https://x.y/ <b>');
    assert.match(html, /^see <a href="#" class="chat-ref chat-ref-deal" data-kind="deal" data-id="12" title="Open deal"><svg[\s\S]*<\/svg><span>Acme &amp; Co<\/span><\/a> at <a href="https:\/\/x\.y\/" target="_blank" rel="noopener">https:\/\/x\.y\/<\/a> &lt;b&gt;$/);
  });
  test('a contact token gets an initials badge; a malformed token stays plain text', () => {
    const html = F.renderMessageBody('[[contact:7|Jane Doe]]');
    assert.match(html, /^<a href="#" class="chat-ref chat-ref-contact" data-kind="contact" data-id="7" title="Open contact"><span class="chat-ref-avatar" aria-hidden="true">JD<\/span><span>Jane Doe<\/span><\/a>$/);
    assert.equal(F.renderMessageBody('[[deal:abc|x]]'), '[[deal:abc|x]]');
    assert.equal(F.renderMessageBody('[[task:1|x]]'), '[[task:1|x]]');
  });
  test('a label cannot smuggle markup or attributes', () => {
    const html = F.renderMessageBody('[[deal:1|"><img src=x onerror=alert(1)>]]');
    assert.equal(html.includes('<img'), false);
    assert.match(html, /<span>&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/span>/);
  });
});

describe('composer wiring', () => {
  test('the menu owns the keys before Enter sends; input re-checks the slash; the transcript delegates record clicks', () => {
    const init = sliceFn(chat, 'initChatComposer', 'chat.js');
    assert.ok(init.indexOf('chatSlashKeydown(e)') < init.indexOf("e.key === 'Enter'"), 'menu keys are handled first');
    assert.match(init, /checkChatSlash\(\)/);
    assert.match(init, /getElementById\('chat-page-messages'\)\?\.addEventListener\('click'/);
    assert.match(init, /closest\('\.chat-ref'\)/);
    assert.match(init, /openChatRef\(ref\.dataset\.kind, ref\.dataset\.id\)/);
  });
  test('opening a record never leaves the chat page', () => {
    const open = sliceFn(chat, 'openChatRef', 'chat.js');
    assert.match(open, /openDealModal\(n\)/); assert.match(open, /openDetail\(n\)/);
    assert.equal(open.includes('switchPage('), false);
  });
  test('sending encodes the drafts, then clears them; the counter and the send button judge the encoded text', () => {
    const send = sliceFn(chat, 'sendChatMessageFromPage', 'chat.js');
    assert.match(send, /const content = encodeChatMentions\(input\.value\.trim\(\), chatDraftMentions\)/);
    assert.match(send, /chatDraftMentions = \[\]/);
    const state = sliceFn(chat, 'updateSendState', 'chat.js');
    assert.match(state, /encodeChatMentions\(input\.value, chatDraftMentions\)/);
    assert.match(state, /canSend\(encoded/);
    assert.match(sliceFn(chat, 'messageHtml', 'chat.js'), /renderMessageBody\(msg\.content\)/);
    assert.match(sliceFn(chat, 'leaveChatPage', 'chat.js'), /closeSlashMenu\(\); chatDraftMentions = \[\]; chatLinkCache = null;/);
  });
  test('Enter, Tab, arrows and Escape are consumed while the menu is open; a pick writes "@Label " and records the draft', () => {
    const keys = sliceFn(chat, 'chatSlashKeydown', 'chat.js');
    for (const k of ['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'Tab']) assert.ok(keys.includes(`'${k}'`), k);
    assert.match(keys, /^\s*if \(!chatSlash\) return false;/m);
    const pick = sliceFn(chat, 'pickSlashRow', 'chat.js');
    assert.match(pick, /insert = `@\$\{row\.label\} `; chatDraftMentions\.push\(\{ kind: row\.kind, id: row\.id, label: row\.label \}\)/);
    assert.match(pick, /input\.setSelectionRange\(pos, pos\)/);
  });
  test('the lists load silently once per visit, deals unfiltered', () => {
    const load = sliceFn(chat, 'ensureChatLinkOptions', 'chat.js');
    assert.match(load, /apiFetchSilent\('\/api\/deals'\)/);
    assert.match(load, /apiFetchSilent\('\/api\/contacts\?contact_type=contact'\)/);
    assert.match(load, /if \(chatLinkCache\) return chatLinkCache;/);
  });
  test('no inline styles or handlers in the new templates; every string via t()', () => {
    assert.equal(chat.includes('style="'), false);
    assert.equal((chat.match(/onclick=/g) || []).length, 3, 'only the three pre-existing retry/reload buttons');
    for (const s of ['Link a deal', 'Link a contact', 'No matches', 'Open deal', 'Open contact']) assert.equal(chat.includes(s), false, s);
    for (const k of ['chat_cmd_deal_hint', 'chat_cmd_contact_hint', 'chat_ref_deal', 'chat_ref_contact', 'no_matches']) assert.ok(k in dict.en && k in dict.de, k);
  });
});

describe('stylesheet', () => {
  test('menu and chip rules exist inside the chat section, tokens only; the active mention row is finally styled', () => {
    for (const r of ['.chat-slash-menu {', '.chat-slash-cmd {', '.chat-slash-kind {', '.chat-slash-meta {', '.chat-bubble .chat-ref {', '.chat-ref-avatar {', '.chat-msg.me .chat-bubble .chat-ref {']) {
      assert.ok(chatCss.includes('\n' + r), r);
    }
    assert.match(css, /\.chat-composer-row \{ position: relative;/, 'the menu is anchored to the composer row');
    assert.match(css, /\.chat-bubble \.chat-ref \{[^}]*text-decoration: none/, 'chips beat the underlined bubble links');
    assert.doesNotMatch(chatCss, /#[0-9a-f]{3,6}\b/i);
    assert.ok(css.includes('\n.mention-item.active {'));
  });
});
