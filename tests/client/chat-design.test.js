// CLIENT (static) tests for the Team Chat page, aligned to the reference's
// flat message-stream convention (reference/pro/src/screens/chat.js) within
// the app's existing single-room chat (no channels/DMs — see "Deferred" in
// DESIGN_PRO_CHANGES.md Part 6). The floating #chat-messages widget
// (renderMessages, chatAvatar, .chat-bubble) has no markup anywhere in
// index.html — dead code, like Contacts' kanban and Tasks' attachments —
// and is intentionally left untouched.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const chat = read('public/js/chat.js');
const css = read('public/style.css');
const section = html.slice(html.indexOf('<section id="page-chat"'), html.indexOf('<!-- ── Activities ── -->'));

describe('markup: the composer send button uses the sprite', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/chat.js')]));
  test('send button', () => {
    assert.match(section, /<button class="chat-send-btn" onclick="sendChatMessageFromPage\(\)" title="Send" aria-label="Send message">\s*<svg class="ic" aria-hidden="true"><use href="#i-send"\/><\/svg>/);
  });
  test('every sprite reference inside the Team Chat section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});

describe('chat.js: the live renderer (renderMessagesToPage) follows the reference .msg convention', () => {
  test('rows are .msg with a shared avatar(), a .who/.when header, a hover .gtime and .ch-text', () => {
    const r = sliceFn(chat, 'renderMessagesToPage', 'chat.js');
    assert.match(r, /class="msg\$\{grouped \? ' grouped' : ''\}"/);
    assert.match(r, /avatar\(msg\.user_name\)/);
    assert.match(r, /class="who"/); assert.match(r, /class="when"/);
    assert.match(r, /class="gtime"/); assert.match(r, /class="ch-text"/);
    assert.doesNotMatch(r, /chat-avatar|chat-bubble|chat-meta|chat-time/);
    assert.match(r, /querySelectorAll\('\.msg:not\(\.chat-day-sep\)'\)/, 'the prepend lookup uses the new row class');
  });
  test('the dead #chat-messages widget (renderMessages) is untouched', () => {
    const r = sliceFn(chat, 'renderMessages', 'chat.js');
    assert.match(r, /chat-avatar|chat-bubble/, 'left alone: nothing in index.html renders #chat-messages');
  });
});

describe('stylesheet: new message-row rules scoped under .chat-page-messages', () => {
  test('.msg / .gtime / .ch-text are defined for the chat page', () => {
    assert.match(css, /^\.chat-page-messages \.msg \{/m);
    assert.match(css, /^\.chat-page-messages \.msg \.gtime \{/m);
    assert.match(css, /^\.chat-page-messages \.msg:hover \.gtime \{ opacity: 1; \}/m);
    assert.match(css, /^\.chat-page-messages \.ch-text \{/m);
  });
  test('the old bubble rules are kept (the dead widget still uses them)', () => {
    assert.match(css, /^\.chat-bubble \{/m); assert.match(css, /^\.chat-avatar \{/m);
  });
});
