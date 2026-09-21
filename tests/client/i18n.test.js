// CLIENT (static, no jsdom) tests for the i18n layer in public/js/core.js:
// the two dictionaries must cover every key the whole page uses and each
// other, and t() must fall back de -> en -> key.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, sliceConst, read } = require('../helpers/client-fn');

const DICT = sliceConst('public/js/core.js', 'TRANSLATIONS');
const { en, de } = new Function(DICT + '\nreturn TRANSLATIONS;')();
const F = loadFns('public/js/core.js', ['t'], { state: { currentLang: 'en' }, extra: DICT });

describe('dictionaries', () => {
  test('exactly the two locales, each with a non-empty string for every key', () => {
    assert.deepEqual(Object.keys(new Function(DICT + '\nreturn TRANSLATIONS;')()).sort(), ['de', 'en']);
    for (const [lang, dict] of [['en', en], ['de', de]]) {
      for (const [k, v] of Object.entries(dict)) assert.ok(typeof v === 'string' && v.trim(), `${lang}.${k} is a non-empty string`);
    }
  });
  test('key parity: every en key exists in de and every de key exists in en', () => {
    const onlyEn = Object.keys(en).filter(k => !(k in de)), onlyDe = Object.keys(de).filter(k => !(k in en));
    assert.deepEqual(onlyEn, [], 'keys only in en');
    assert.deepEqual(onlyDe, [], 'keys only in de');
  });
  test('every data-i18n / data-i18n-ph key in the WHOLE of index.html exists in both dictionaries', () => {
    const html = read('public/index.html');
    const used = [...new Set([...html.matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)].map(m => m[1]))];
    assert.ok(used.length > 50, `found ${used.length} keys in the markup`);
    const missing = used.filter(k => !(k in en) || !(k in de));
    assert.deepEqual(missing, [], 'markup keys missing from a dictionary');
  });
});

describe('t()', () => {
  test('current language, then English, then the key itself', () => {
    F.__set('currentLang', 'de');
    assert.equal(F.t('nav_deals'), de.nav_deals);
    assert.equal(F.t('no_such_key_xyz'), 'no_such_key_xyz');
    F.__set('currentLang', 'xx');
    assert.equal(F.t('nav_deals'), en.nav_deals, 'unknown language -> English');
    F.__set('currentLang', 'en');
    assert.equal(F.t('nav_deals'), en.nav_deals);
  });
});
