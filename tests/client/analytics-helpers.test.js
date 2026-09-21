// CLIENT (pure, no jsdom) tests for public/js/analytics.js number formatting
// and the stat-card ordering.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, sliceConst } = require('../helpers/client-fn');

const F = loadFns('public/js/analytics.js', ['fmt', 'fmtCurrency', 'buildStatOrder'],
  { extra: sliceConst('public/js/analytics.js', 'STAT_CARD_DEFS') + '\n' + sliceConst('public/js/analytics.js', 'DEFAULT_STAT_ORDER') });
const DEFAULT = ['contacts', 'deals', 'win_rate', 'pipeline_value', 'won_value', 'new_deals'];
const withValue = { config: { value_field: 'amount' } }, noValue = { config: { value_field: null } };

describe('fmt / fmtCurrency', () => {
  test('fmt: null -> em dash; <1000 rounded; K and M with one decimal', () => {
    assert.equal(F.fmt(null), '—');
    assert.equal(F.fmt(999), '999');
    assert.equal(F.fmt(999.6), '1000');
    assert.equal(F.fmt(1000), '1.0K');
    assert.equal(F.fmt(1234567), '1.2M');
  });
  test('fmtCurrency: dollar prefix, K one decimal, M two decimals, no fraction below 1000', () => {
    assert.equal(F.fmtCurrency(null), '—');
    assert.equal(F.fmtCurrency(999.4), '$999');
    assert.equal(F.fmtCurrency(1500), '$1.5K');
    assert.equal(F.fmtCurrency(2000000), '$2.00M');
  });
});

describe('buildStatOrder', () => {
  test('empty saved order -> the default six when a value field is configured', () => {
    assert.deepEqual(F.buildStatOrder([], [], withValue), DEFAULT.map(id => ({ id, hidden: false })));
  });
  test('the two value cards are dropped when no value field is configured', () => {
    assert.deepEqual(F.buildStatOrder([], [], noValue).map(c => c.id), ['contacts', 'deals', 'win_rate', 'new_deals']);
  });
  test('saved order is kept, unknown ids dropped, hidden ids flagged', () => {
    const out = F.buildStatOrder(['deals', 'bogus', 'contacts'], ['deals'], withValue);
    assert.deepEqual(out, [{ id: 'deals', hidden: true }, { id: 'contacts', hidden: false }]);
  });
  test('inherited property names are not card ids: an own-property lookup drops them', () => {
    assert.deepEqual(F.buildStatOrder(['constructor', 'deals'], [], withValue), [{ id: 'deals', hidden: false }]);
    assert.deepEqual(F.buildStatOrder(['__proto__', 'toString', 'hasOwnProperty'], [], withValue), []);
  });
});
