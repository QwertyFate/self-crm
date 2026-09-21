// UNIT tests for the chat rate limiter. The factory accepts a `now` function,
// so the test controls the clock: no waiting, no flakiness — we simply move
// `t` forward and ask the limiter what it thinks.
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('../helpers/fake-http');
const { createChatRateLimiter, chatRateLimitMiddleware, CHAT_LIMIT, CHAT_MAX_LENGTH, chatLimiter } = require('../../utils/chat-rate-limit');

describe('createChatRateLimiter — sliding window per user', () => {
  let t = 1_000_000;
  const limiter = createChatRateLimiter({ windowMs: 10_000, max: 6, now: () => t });
  after(() => limiter.stop());

  test('the first six messages in a window are allowed, the seventh is refused with a retry time', () => {
    for (let i = 1; i <= 6; i++) assert.equal(limiter.check('alice').allowed, true, `message ${i}`);
    const seventh = limiter.check('alice');
    assert.equal(seventh.allowed, false);
    assert.equal(seventh.retryAfterMs, 10_000, 'the oldest stamp is still fully inside the window');
  });

  test('the window slides: once the oldest message ages out, one more is allowed', () => {
    t += 10_001;                                        // 10 s + 1 ms later
    assert.equal(limiter.check('alice').allowed, true);
  });

  test('users have independent buckets', () => {
    for (let i = 0; i < 6; i++) limiter.check('bob');
    assert.equal(limiter.check('bob').allowed, false);
    assert.equal(limiter.check('carol').allowed, true);
  });

  test('sweep() forgets users whose stamps have all expired', () => {
    t += 60_000;
    limiter.sweep();
    assert.equal(limiter.size(), 0);
  });
});

describe('chatRateLimitMiddleware — validation first, then the shared bucket', () => {
  function run(body, userId) {
    const res = fakeRes();
    let nextCalled = false;
    chatRateLimitMiddleware(fakeReq({ body, userId }), res, () => { nextCalled = true; });
    return { code: res.code, body: res.body, nextCalled };
  }
  after(() => chatLimiter.stop());

  test('non-string or empty content -> 400 before any quota is spent', () => {
    assert.equal(run({ content: 12345 }, 'u-400').code, 400, 'number');
    assert.equal(run({ content: '   ' }, 'u-400').code, 400, 'blank');
    assert.equal(run({}, 'u-400').code, 400, 'missing');
  });

  test('over 1100 characters -> 413; 1001–1100 -> 400 with the business-rule message', () => {
    assert.equal(run({ content: 'x'.repeat(1101) }, 'u-len').code, 413);
    const r = run({ content: 'x'.repeat(CHAT_MAX_LENGTH + 1) }, 'u-len');
    assert.equal(r.code, 400);
    assert.match(r.body.error, /Maximum 1000 characters/);
  });

  test('valid messages pass through; the seventh in ten seconds -> 429 with the window and limit', () => {
    for (let i = 0; i < CHAT_LIMIT.max; i++) assert.equal(run({ content: 'hi' }, 'u-429').nextCalled, true, `message ${i + 1}`);
    const r = run({ content: 'hi' }, 'u-429');
    assert.equal(r.code, 429);
    assert.ok(r.body.retryAfterMs > 0 && r.body.retryAfterMs <= CHAT_LIMIT.windowMs, `retryAfterMs within the window (${r.body.retryAfterMs})`);
    assert.equal(r.body.limit, CHAT_LIMIT.max);
    assert.equal(r.body.windowMs, CHAT_LIMIT.windowMs);
  });
});
