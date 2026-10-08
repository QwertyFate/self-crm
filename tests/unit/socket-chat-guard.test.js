// UNIT: a chat socket payload that is not a string must not take the server down.
//
// WHY. server.js's 'chat_message' listener did `content?.trim()` on whatever the
// client sent. A socket client can emit any JSON value; for a number, boolean,
// array or object `content?.trim` is undefined, so calling it throws a TypeError
// inside an `async` listener. Socket.IO does not await or catch listener
// promises, the server registered no 'unhandledRejection' handler, and Node 22
// terminates the process on an unhandled rejection — one `socket.emit(
// 'chat_message', 1)` from any member's browser console exited the server for
// every tenant (launchd then restarted it, dropping every open socket).
//
// The fix: the guard is a named function, chatMessageText(), that only accepts a
// non-empty string of at most 2000 characters (executed below for every bad
// shape); the connect-time name lookup moved inside a try so a database error
// there disconnects instead of rejecting unhandled; and a process-level
// 'unhandledRejection' handler logs instead of exiting, as the safety net for
// any other async listener.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const src = read('server.js');

describe('chatMessageText: the only shape that reaches the database is a non-empty string', () => {
  const chatMessageText = new Function(sliceFn(src, 'chatMessageText', 'server.js') + ' return chatMessageText;')();
  test('rejects every non-string payload instead of throwing', () => {
    for (const bad of [1, 0, true, false, null, undefined, [], ['x'], {}, { trim: 'x' }, () => 'x', Symbol('s'), 10n]) {
      assert.equal(chatMessageText(bad), null, String(typeof bad));
    }
  });
  test('rejects blank and over-long strings, trims the rest, keeps the 2000 limit on the raw length', () => {
    assert.equal(chatMessageText(''), null);
    assert.equal(chatMessageText('   \n\t '), null);
    assert.equal(chatMessageText('a'.repeat(2001)), null);
    assert.equal(chatMessageText('a'.repeat(2000)), 'a'.repeat(2000));
    assert.equal(chatMessageText('  hello  '), 'hello');
  });
});

describe('server.js wiring', () => {
  const handler = src.slice(src.indexOf("socket.on('chat_message'"), src.indexOf("socket.on('disconnect'"));
  test("the 'chat_message' listener goes through chatMessageText and never calls .trim() on the raw payload", () => {
    assert.match(handler, /const text = chatMessageText\(content\);\s*if \(text === null\) return;/);
    assert.doesNotMatch(handler, /content\??\.trim\(\)/);
    assert.doesNotMatch(handler, /content\.length/);
    assert.match(handler, /\[workspaceId, userId, text\]/, 'the trimmed text is what is inserted');
    assert.match(handler, /content: text,/, 'and what is broadcast');
  });
  test('the connect-time name lookup cannot reject unhandled: it is inside a try that disconnects on failure', () => {
    const conn = src.slice(src.indexOf("io.on('connection'"), src.indexOf("socket.join("));
    const lookup = conn.indexOf("SELECT name FROM users WHERE id=$1");
    const tryBefore = conn.lastIndexOf('try {', lookup), catchAfter = conn.indexOf('catch', lookup);
    assert.ok(lookup > 0 && tryBefore > 0 && catchAfter > lookup, 'lookup is wrapped');
    assert.match(conn.slice(catchAfter, catchAfter + 80), /socket\.disconnect\(\); return;/);
  });
  test("a process-level 'unhandledRejection' handler logs instead of exiting", () => {
    assert.match(src, /process\.on\('unhandledRejection', \(reason\) => \{\s*console\.error\('Unhandled promise rejection:', reason\);\s*\}\);/);
    assert.ok(src.indexOf("process.on('unhandledRejection'") < src.indexOf("io.on('connection'"), 'registered before any listener exists');
  });
});
