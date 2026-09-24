// CLIENT (static + pure-function) tests for the team chat rework: a calm
// transcript (day pills, author groups that survive live appends, links,
// pre-wrap bubbles), presence in the header, an honest composer (textarea,
// Enter / Shift+Enter, disabled while empty, counter, pending / sent / failed),
// respected scroll position, visible connection state, and every string via t().
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css = read('public/style.css');
const chat = read('public/js/chat.js');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const section = html.slice(html.indexOf('<section id="page-chat"'), html.indexOf('</section>', html.indexOf('<section id="page-chat"')));
const chatCss = css.slice(css.indexOf('25 · TEAM CHAT'), css.indexOf('@mention autocomplete'));

describe('markup', () => {
  test('the page: presence in the header, a live transcript, a connection banner, a jump pill, a textarea composer', () => {
    for (const s of ['data-i18n="page_chat"', 'id="chat-presence"', 'id="chat-connection"', 'id="chat-jump"', 'id="chat-counter"', 'id="chat-notice"',
                     '<textarea', 'id="chat-page-input"', 'data-i18n-ph="chat_placeholder"', 'id="chat-page-send"']) {
      assert.ok(section.includes(s), s);
    }
    assert.match(section, /<div class="chat-page-messages" id="chat-page-messages" role="log" aria-live="polite"/);
    for (const s of ['onkeydown=', 'renderChatRoom', 'chat-page-online-bar', 'Refresh', 'style="']) assert.equal(section.includes(s), false, `${s} is gone`);
  });
  test('the sidebar entry is translated and its badge is labelled', () => {
    const nav = html.slice(html.indexOf('data-page="chat"'), html.indexOf('</a></li>', html.indexOf('data-page="chat"')));
    assert.match(nav, /<span class="nav-icon-wrap">/);
    assert.match(nav, /<span data-i18n="nav_chat">/);
    assert.match(nav, /id="chat-badge"[^>]*aria-label=/);
    assert.equal(nav.includes('style="'), false);
  });
});

describe('chat.js', () => {
  test('dead code is gone; the new surface exists', () => {
    for (const s of ["getElementById('chat-messages')", 'function renderMessages(', 'function renderOnlineUsers(', 'chatOpen', 'renderChatRoom', 'renderMessagesToPage', "api.patch('/api/chat/read'"]) {
      assert.equal(chat.includes(s), false, `${s} removed`);
    }
    for (const fn of ['chatHue', 'chatInitials', 'chatTime', 'chatDayLabel', 'linkify', 'groupPlan', 'canSend', 'chatCounter', 'messageHtml', 'renderTranscript',
                      'appendMessages', 'prependMessages', 'loadOlderMessages', 'renderPresence', 'markChatRead', 'sendChatMessageFromPage', 'retryChatMessage',
                      'loadChatPage', 'leaveChatPage', 'initChatSocket', 'refreshChatBadge', 'updateChatBadge']) {
      assert.match(chat, new RegExp(`^(async )?function ${fn}\\(`, 'm'), fn);
    }
  });
  test('no inline styles and no hard-coded English in the templates', () => {
    assert.equal(chat.includes('style="'), false);
    for (const s of ['No one online', 'Online:', '>You<', "'You'", "'Today'", "'Yesterday'", 'just now', 'No messages yet', 'Could not load', 'Loading…', 'Refresh']) {
      assert.equal(chat.includes(s), false, s);
    }
  });
  test('sending is honest: pending element, ack callback, offline notice, retry; reads go silent', () => {
    const send = sliceFn(chat, 'sendChatMessageFromPage', 'chat.js');
    for (const s of ['canSend(', 'pending: true', 'emitChatMessage(', 'chat_offline']) assert.ok(send.includes(s), s);
    const emit = sliceFn(chat, 'emitChatMessage', 'chat.js');
    assert.match(emit, /socket\.emit\('chat_message', msg\.content, finish\)/, 'the send carries an ack callback');
    assert.match(emit, /setTimeout\([\s\S]*?, 8000\)/, 'no ack within eight seconds counts as a failure');
    assert.match(chat, /^function retryChatMessage\(/m);
    assert.match(sliceFn(chat, 'retryChatMessage', 'chat.js'), /emitChatMessage\(/);
    assert.match(sliceFn(chat, 'markChatRead', 'chat.js'), /apiFetchSilent\('\/api\/chat\/read'/);
    const init = sliceFn(chat, 'initChatSocket', 'chat.js');
    for (const s of ["socket.on('connect'", "socket.on('disconnect'", "socket.on('online_users'", "socket.on('new_message'", 'after=']) assert.ok(init.includes(s), s);
  });
  test('leaving the page stops read-marking; auth switches it off', () => {
    assert.match(sliceFn(chat, 'leaveChatPage', 'chat.js'), /chatPageOpen = false/);
    assert.match(sliceFn(auth, 'switchPage', 'auth.js'), /if \(page === 'chat'\)\s+await loadChatPage\(\); else leaveChatPage\(\);/);
  });
});

describe('pure helpers', () => {
  const extra = sliceFn(core, 'esc', 'core.js') + '\n' + sliceConst('public/js/core.js', 'TRANSLATIONS') + '\n' + sliceFn(core, 't', 'core.js') + '\n' + sliceFn(core, 'dayLabelFor', 'core.js');
  const F = loadFns('public/js/chat.js', ['chatHue', 'chatInitials', 'chatLocale', 'chatSameDay', 'linkify', 'groupPlan', 'canSend', 'chatCounter', 'chatDayLabel'], { state: { currentLang: 'en' }, extra });
  test('chatHue is stable and within the six hues; initials take two letters', () => {
    assert.equal(F.chatHue(7), F.chatHue(7));
    for (const id of [0, 1, 5, 6, 13, 9999, null, 'x']) { const h = F.chatHue(id); assert.ok(Number.isInteger(h) && h >= 0 && h < 6, String(id)); }
    assert.equal(F.chatInitials('Anna Weber'), 'AW'); assert.equal(F.chatInitials('cher'), 'C'); assert.equal(F.chatInitials(''), '?');
  });
  test('linkify escapes first and links http(s) only', () => {
    assert.equal(F.linkify('<b>hi</b>'), '&lt;b&gt;hi&lt;/b&gt;');
    assert.equal(F.linkify('see https://x.de/a?b=1&c=2.'), 'see <a href="https://x.de/a?b=1&amp;c=2" target="_blank" rel="noopener">https://x.de/a?b=1&amp;c=2</a>.');
    assert.equal(F.linkify('javascript:alert(1) and ftp://x'), 'javascript:alert(1) and ftp://x');
  });
  test('groupPlan: same author within five minutes groups; a new day or author starts a group', () => {
    const a = { user_id: 1, created_at: '2026-09-24T10:00:00Z' };
    assert.deepEqual(F.groupPlan(null, a), { newDay: true, newGroup: true });
    assert.deepEqual(F.groupPlan({ userId: 1, at: '2026-09-24T09:58:00Z' }, a), { newDay: false, newGroup: false });
    assert.deepEqual(F.groupPlan({ userId: 1, at: '2026-09-24T09:50:00Z' }, a), { newDay: false, newGroup: true });
    assert.deepEqual(F.groupPlan({ userId: 2, at: '2026-09-24T09:59:00Z' }, a), { newDay: false, newGroup: true });
    // Days are the viewer's local days, so the midnight case is written in local time.
    assert.deepEqual(F.groupPlan({ userId: 1, at: '2026-09-23T23:59:00' }, { user_id: 1, created_at: '2026-09-24T00:01:00' }), { newDay: true, newGroup: true });
  });
  test('canSend and the counter', () => {
    assert.equal(F.canSend('hi', true), true);
    assert.equal(F.canSend('   ', true), false);
    assert.equal(F.canSend('hi', false), false);
    assert.equal(F.canSend('x'.repeat(2001), true), false);
    assert.deepEqual(F.chatCounter('short'), { show: false, left: 1995, over: false });
    assert.deepEqual(F.chatCounter('x'.repeat(1900)), { show: true, left: 100, over: false });
    assert.deepEqual(F.chatCounter('x'.repeat(2001)), { show: true, left: -1, over: true });
  });
  test('day labels come from the dictionary', () => {
    const now = new Date('2026-09-24T12:00:00');
    assert.equal(F.chatDayLabel('2026-09-24T08:00:00', now), dict.en.chat_today);
    assert.equal(F.chatDayLabel('2026-09-23T23:00:00', now), dict.en.chat_yesterday);
    assert.match(F.chatDayLabel('2026-09-01T09:00:00', now), /September/);
  });
});

describe('copy and stylesheet', () => {
  test('every chat key exists in both dictionaries', () => {
    for (const k of ['nav_chat', 'page_chat', 'chat_placeholder', 'chat_send', 'chat_online_one', 'chat_online_n', 'chat_nobody_online', 'chat_you', 'chat_today', 'chat_yesterday',
                     'chat_empty_title', 'chat_empty_hint', 'chat_load_error', 'chat_retry', 'chat_history_start', 'chat_loading_older', 'chat_new_messages', 'chat_unread_divider',
                     'chat_reconnecting', 'chat_offline', 'chat_not_sent', 'chat_too_long', 'chat_rate_limited', 'chat_chars_left']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
    for (const k of ['send', 'arrowDown']) assert.match(core, new RegExp(`^\\s*${k}:\\s*'<svg`, 'm'), `UI_ICON.${k}`);
  });
  test('the transcript, composer and state rules exist; the dead panel, FAB and online bar are gone', () => {
    for (const r of ['.chat-presence {', '.chat-avatar {', '.chat-avatar.hue-0 {', '.chat-avatar.hue-5 {', '.chat-day-sep {', '.chat-msg {', '.chat-msg.me .chat-bubble {',
                     '.chat-msg.pending .chat-bubble {', '.chat-msg.failed .chat-bubble {', '.chat-msg-error {', '.chat-unread-sep {', '.chat-history-start {', '.chat-loading-older {',
                     '.chat-empty {', '.chat-connection {', '.chat-jump {', '.chat-composer {', '.chat-input {', '.chat-counter {', '.chat-send-btn {', '.chat-notice {', '.nav-icon-wrap {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\.chat-bubble \{[^}]*white-space: pre-wrap/);
    for (const s of ['.chat-panel', '.chat-fab', '.chat-online-bar', '.chat-header {', '.chat-title', '.chat-avatar-spacer', 'calc(50% - 52px)']) assert.equal(css.includes(s), false, `${s} gone`);
    assert.doesNotMatch(chatCss, /#[0-9a-f]{3,6}\b/i, 'tokens only in the chat section');
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    assert.match(coarse, /\.chat-send-btn \{ width: 44px; height: 44px; \}/);
    assert.match(css, /\.guide-help-fab \{[^}]*bottom: var\(--sp-5\)/, 'the help button sits in the corner');
  });
});
