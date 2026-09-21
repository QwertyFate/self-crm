// UNIT/static tests for the shared status list and the trigger-stage column
// wiring: one source of truth for the seven statuses, and the new workspace
// column reaching the client through every workspace SELECT in routes/auth.js.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ONBOARDING_STATUSES } = require('../helpers/schema-constants');
const { read } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

describe('utils/onboarding-statuses.js', () => {
  test('exports the seven statuses in process order', () => {
    delete require.cache[path.join(ROOT, 'utils', 'onboarding-statuses.js')];
    const mod = require(path.join(ROOT, 'utils', 'onboarding-statuses.js'));
    assert.deepEqual(mod.ONBOARDING_STATUSES, ONBOARDING_STATUSES);
  });
  test('engine-api.js and contacts.js take the list from there; engine-api keeps re-exporting it', () => {
    const engine = read('routes/engine-api.js'), contacts = read('routes/contacts.js');
    assert.match(engine, /require\('\.\.\/utils\/onboarding-statuses'\)/);
    assert.match(engine, /module\.exports\.ONBOARDING_STATUSES = ONBOARDING_STATUSES/);
    assert.doesNotMatch(engine, /const ONBOARDING_STATUSES = \[/, 'no second copy in engine-api.js');
    assert.match(contacts, /require\('\.\.\/utils\/onboarding-statuses'\)/);
    assert.doesNotMatch(contacts, /require\('\.\/engine-api'\)/, 'contacts.js must not load the engine router as a side effect');
  });
});

describe('onboarding_trigger_stage_ids reaches the client', () => {
  test('every workspace SELECT in routes/auth.js lists the column (six identical statements)', () => {
    const auth = read('routes/auth.js');
    const selects = auth.match(/SELECT id, name, kanban_fields[^\n]*FROM workspaces WHERE id\s*=\s*\$1/g) || [];
    assert.equal(selects.length, 6, 'the six workspace SELECTs');
    for (const s of selects) assert.ok(s.includes('onboarding_trigger_stage_ids'), s.slice(0, 60));
  });
});
