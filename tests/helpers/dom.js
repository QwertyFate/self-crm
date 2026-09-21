/**
 * The client-side tests need a fake browser (a DOM) to run public/js/*.js
 * against. `jsdom` provides that, but it is an optional test-only dependency
 * we deliberately do NOT ship. This helper tries to load it:
 *   - if present, exports the JSDOM class and `skipOpts = {}`;
 *   - if absent, exports `unavailable` with a reason and `skipOpts = { skip }`,
 *     so each client suite skips itself cleanly instead of crashing the run.
 *
 * To enable the client tests:  npm i -D jsdom   (in the repo root)
 */
const { skipUnless } = require('./skip');

let JSDOM = null;
let unavailable = null;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  unavailable = 'jsdom is not installed — run `npm i -D jsdom` to enable the client (browser) tests';
}

const skipOpts = skipUnless(!!JSDOM, unavailable);

module.exports = { JSDOM, unavailable, skipOpts };
