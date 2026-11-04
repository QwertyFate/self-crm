// CLIENT tests: Analytics shows money in the currency the workspace chose (public/js/analytics.js, 2026-10-21).
// Before: fmtCurrency hardcoded "$" ("$12.5K") while deals show "€". Now fmtCurrency formats with
// analyticsData.config.currency (EUR when none was chosen, as on the deals board) in the page's language, compact from
// a thousand up; the configuration dialog offers EUR, USD, GBP and CHF and saves the choice with the rest.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const js = read('public/js/analytics.js');
const html = read('public/index.html');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const money = (currency, lang) => {
  const F = loadFns('public/js/analytics.js', ['fmtCurrency', 'anLocale', 'anCurrency'], { state: { analyticsData: currency === undefined ? { config: {} } : { config: { currency } }, currentLang: lang }, extra: sliceConst('public/js/analytics.js', 'AN_CURRENCIES') });
  return n => F.fmtCurrency(n).replace(/ | /g, ' ');
};

describe('the money in Analytics', () => {
  test('no hardcoded dollar any more', () => {
    const fn = js.slice(js.indexOf('function fmtCurrency('), js.indexOf('\n}', js.indexOf('function fmtCurrency(')));
    assert.doesNotMatch(fn, /'\$'/);
  });
  test('the chosen currency, in the page\'s language; euros when none was chosen', () => {
    assert.equal(money(undefined, 'de')(480000), money('EUR', 'de')(480000));
    assert.match(money('EUR', 'de')(480000), /€/); assert.doesNotMatch(money('EUR', 'de')(480000), /\$/);
    assert.match(money('USD', 'en')(12500), /^\$/);
    assert.match(money('GBP', 'en')(12500), /^£/);
    assert.match(money('CHF', 'de')(950), /CHF/);
    assert.equal(money('EUR', 'de')(950), '950 €');
    assert.equal(money('USD', 'en')(950), '$950');
  });
  test('compact from a thousand up, so the cards stay short; an unknown stored code falls back to euros; nothing stays a dash', () => {
    assert.ok(money('EUR', 'en')(1250000).length <= 8, money('EUR', 'en')(1250000));
    assert.match(money('USD', 'en')(1250000), /^\$1\.3M$|^\$1\.25M$/);
    assert.equal(money('XYZ', 'en')(950), money('EUR', 'en')(950));
    assert.equal(money('EUR', 'de')(null), '—');
  });
});

describe('the choice', () => {
  test('the dialog has a currency select, filled with EUR, USD, GBP and CHF and the saved one selected; save sends it', () => {
    assert.match(html, /<div class="analytics-config-label" data-i18n="html_currency">[^<]+<\/div>\s*<p class="text-xs text-muted" data-i18n="html_currency_hint">[^<]+<\/p>\s*<select id="analytics-currency" class="form-control" style="width:100%"><\/select>/);
    assert.match(js, /^const AN_CURRENCIES = \['EUR', 'USD', 'GBP', 'CHF'\];$/m);
    assert.match(js, /document\.getElementById\('analytics-currency'\)\.innerHTML =\s*AN_CURRENCIES\.map\(c => `<option value="\$\{c\}" \$\{anCurrency\(\) === c \? 'selected' : ''\}>\$\{esc\(t\('an_cur_' \+ c\.toLowerCase\(\)\)\)\}<\/option>`\)\.join\(''\);/);
    assert.match(js, /api\.patch\('\/api\/analytics\/config', \{ won_stage_ids: wonIds, lost_stage_ids: lostIds, value_field: valueField, currency: document\.getElementById\('analytics-currency'\)\.value \}\)/);
  });
  test('the words, in both languages', () => {
    for (const k of ['html_currency', 'html_currency_hint', 'an_cur_eur', 'an_cur_usd', 'an_cur_gbp', 'an_cur_chf']) for (const lang of ['de', 'en']) assert.ok(dict[lang][k], `${lang} ${k}`);
    assert.equal(dict.de.html_currency, 'Währung'); assert.equal(dict.en.html_currency, 'Currency');
  });
});
