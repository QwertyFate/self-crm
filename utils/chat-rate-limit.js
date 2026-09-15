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

module.exports = { createChatRateLimiter };
