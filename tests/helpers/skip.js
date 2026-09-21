/**
 * Options for describe()/test() that skip a block unless a condition holds.
 *
 *   describe('needs jsdom', skipUnless(hasJsdom, 'jsdom is not installed'), () => { ... });
 *
 * Node's runner treats the mere presence of the `skip` key as "skip" (even
 * `skip: null`), so the helper returns an empty object when the condition is
 * met — never `{ skip: null }`.
 */
function skipUnless(condition, reason) {
  return condition ? {} : { skip: reason };
}

module.exports = { skipUnless };
