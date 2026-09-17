/**
 * The client-side tests need a fake browser (a DOM) to run public/js/*.js
 * against. `jsdom` provides that, but it is an optional test-only dependency
 * we deliberately do NOT ship. This helper tries to load it:
 *   - if present, exports the JSDOM class;
 *   - if absent, exports `unavailable` with a reason, so each client test can
 *     skip itself cleanly instead of crashing the whole run.
 *
 * To enable the client tests:  npm i -D jsdom   (in the repo root)
 */
let JSDOM = null;
let unavailable = null;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  unavailable = 'jsdom is not installed — run `npm i -D jsdom` to enable the client (browser) tests';
}
// Pass this as the options argument of describe(): `{ skip: <reason> }` when
// jsdom is missing, `{}` when it is present. (Passing `skip: null` would still
// skip — Node's runner treats the presence of the key as the signal.)
const skipOpts = unavailable ? { skip: unavailable } : {};

module.exports = { JSDOM, unavailable, skipOpts };
