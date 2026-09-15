/**
 * Per-user sliding-window rate limiter for chat messages.
 *
 * Keyed by user id, never by socket id, so a user with several tabs shares one
 * bucket and a disconnect/reconnect does not reset it. Each user holds at most
 * `max` timestamps; expired ones are pruned on every check and a background
 * sweep removes idle users entirely, so memory is bounded by the number of
 * users active within the last window.
 *
 *   const limiter = createChatRateLimiter({ windowMs: 10_000, max: 6 });
 *   const verdict = limiter.check(userId);
 *   // { allowed: true, remaining: 5 }  or  { allowed: false, retryAfterMs: 8123 }
 *
 * `now` is injectable so tests can drive the clock deterministically.
 */
function createChatRateLimiter({ windowMs = 10_000, max = 6, sweepMs = 60_000, now = Date.now } = {}) {
  const hits = new Map(); // userId -> ascending timestamps inside the window, length <= max

  function prune(stamps, t) {
    const cutoff = t - windowMs;
    let i = 0;
    while (i < stamps.length && stamps[i] <= cutoff) i++;
    if (i) stamps.splice(0, i);
  }

  function check(userId) {
    const t = now();
    let stamps = hits.get(userId);
    if (!stamps) { stamps = []; hits.set(userId, stamps); }
    prune(stamps, t);
    if (stamps.length >= max) {
      return { allowed: false, retryAfterMs: Math.max(0, stamps[0] + windowMs - t) };
    }
    stamps.push(t);
    return { allowed: true, remaining: max - stamps.length };
  }

  function sweep() {
    const t = now();
    for (const [userId, stamps] of hits) {
      prune(stamps, t);
      if (stamps.length === 0) hits.delete(userId);
    }
  }

  const timer = setInterval(sweep, sweepMs);
  if (typeof timer.unref === 'function') timer.unref(); // never keeps the process alive

  return {
    check,
    sweep,                       // exposed for tests; the interval calls it in production
    size: () => hits.size,
    stop: () => clearInterval(timer),
  };
}

// ---------------------------------------------------------------------------
// The one shared bucket, and the limits both write paths enforce.
//
// server.js (socket handler) and routes/chat.js (HTTP POST) both require this
// module, and Node's module cache guarantees they get the same `chatLimiter`
// instance. Both key it on the user id, so six socket messages followed by an
// HTTP post is seven messages in one bucket, exactly as it should be.
// ---------------------------------------------------------------------------
const CHAT_LIMIT       = { windowMs: 10_000, max: 6 };
const CHAT_MAX_LENGTH  = 1000;   // business rule, enforced on both write paths
const CHAT_HARD_LENGTH = 1100;   // coarse pre-check in the middleware; 100 chars of headroom
const chatLimiter      = createChatRateLimiter(CHAT_LIMIT);

/**
 * Express middleware for POST /api/chat/messages. Runs after requireAuth, so
 * req.userId is set. Rejects oversized content before touching the bucket, so
 * a malformed request never spends the user's legitimate quota. The 429 body
 * mirrors the socket's chat_rate_limited payload.
 */
function chatRateLimitMiddleware(req, res, next) {
  const { content } = req.body || {};

  // All validation before the bucket, so only an acceptable message spends
  // quota. Order preserves the 413/400 split: >1100 is the coarse "too large"
  // guard, 1001–1100 is the business rule.
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  if (content.length > CHAT_HARD_LENGTH) {
    return res.status(413).json({ error: `Message too long. Maximum ${CHAT_MAX_LENGTH} characters.` });
  }
  if (content.length > CHAT_MAX_LENGTH) {
    return res.status(400).json({ error: `Message too long. Maximum ${CHAT_MAX_LENGTH} characters.` });
  }

  const verdict = chatLimiter.check(req.userId);
  if (!verdict.allowed) {
    return res.status(429).json({
      error:        'You are sending messages too quickly. Please slow down.',
      retryAfterMs: verdict.retryAfterMs,
      limit:        CHAT_LIMIT.max,
      windowMs:     CHAT_LIMIT.windowMs,
    });
  }
  next();
}

module.exports = {
  createChatRateLimiter,
  chatLimiter,
  chatRateLimitMiddleware,
  CHAT_LIMIT,
  CHAT_MAX_LENGTH,
  CHAT_HARD_LENGTH,
};
