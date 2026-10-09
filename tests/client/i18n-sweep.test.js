// CLIENT (static) tests for Part 45: the German sweep. Every user-visible string in the
// client goes through the dictionary in core.js (TRANSLATIONS.en / .de, t(), tf()) or a
// data-i18n* attribute in index.html, and every key used anywhere exists in BOTH languages.
// These tests pin the contract so a new hardcoded label cannot slip back in unnoticed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { read, sliceConst, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const html = read('public/index.html');
const jsFiles = fs.readdirSync(path.join(ROOT, 'public/js')).filter(f => f.endsWith('.js')).map(f => 'public/js/' + f);
// The dictionary itself is sliced out of core.js so its VALUES (which may contain "t('" by chance) are not scanned.
const codeOf = rel => { const src = read(rel); return rel.endsWith('core.js') ? src.replace(sliceConst('public/js/core.js', 'TRANSLATIONS'), '') : src; };

describe('the dictionary', () => {
  test('en and de hold exactly the same keys', () => {
    const en = Object.keys(dict.en), de = Object.keys(dict.de);
    assert.deepEqual(en.filter(k => !(k in dict.de)), [], 'missing in de');
    assert.deepEqual(de.filter(k => !(k in dict.en)), [], 'missing in en');
    assert.ok(en.length > 900, `the sweep added hundreds of keys (now ${en.length})`);
  });
  test('no empty strings, and {placeholders} agree between the languages', () => {
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
    // three German sentences deliberately drop or swap the noun placeholder (the caller passes both forms)
    const phOk = new Set(['dv_link_object_sub', 'dv_deals_linked_here', 'dv_tasks_linked_here']);
    for (const k of Object.keys(dict.en)) {
      assert.ok(String(dict.en[k]).trim() && String(dict.de[k]).trim(), `${k} is empty`);
      if (!phOk.has(k)) assert.equal(ph(dict.de[k]), ph(dict.en[k]), `${k}: placeholders differ`);
    }
  });
});

describe('every key the code uses exists in both languages', () => {
  const missing = [];
  // a key built at run time (t('chip_' + x)) is skipped: the literal must be followed by , or )
  test("literal t('key') / tf('key', …) calls in every public/js file", () => {
    for (const rel of jsFiles) {
      const code = codeOf(rel);
      for (const m of code.matchAll(/\btf?\(\s*'([a-z][a-z0-9_]*)'\s*[,)]/g)) if (!(m[1] in dict.en) || !(m[1] in dict.de)) missing.push(`${rel}: ${m[1]}`);
    }
    assert.deepEqual(missing, []);
  });
  test('data-i18n, data-i18n-ph, data-i18n-title, data-i18n-aria and data-i18n-alt keys in index.html', () => {
    const bad = [];
    for (const m of html.matchAll(/data-i18n(?:-ph|-title|-aria|-alt)?="([^"]*)"/g)) if (!(m[1] in dict.en) || !(m[1] in dict.de)) bad.push(m[1]);
    assert.deepEqual(bad, []);
  });
  test('applyTranslations applies all five attribute kinds', () => {
    const fn = sliceFn(read('public/js/core.js'), 'applyTranslations', 'core.js');
    assert.match(fn, /\[data-i18n\]'\)\.forEach\(el => \{ el\.textContent = t\(el\.dataset\.i18n\)/);
    assert.match(fn, /\[data-i18n-ph\]'\)\.forEach\(el => \{ el\.placeholder = t\(el\.dataset\.i18nPh\)/);
    assert.match(fn, /\[data-i18n-title\]'\)\.forEach\(el => \{ el\.title = t\(el\.dataset\.i18nTitle\)/);
    assert.match(fn, /\[data-i18n-aria\]'\)\.forEach\(el => \{ el\.setAttribute\('aria-label', t\(el\.dataset\.i18nAria\)\)/);
    assert.match(fn, /\[data-i18n-alt\]'\)\.forEach\(el => \{ el\.alt = t\(el\.dataset\.i18nAlt\)/);
  });
});

describe('the labels the user named are no longer hardcoded', () => {
  const dv = read('public/js/detail-views.js');
  test("detail-views.js: no raw 'Details', 'Owner', 'Overview', 'Not set', 'Unassigned', 'Edit all', 'View all' in templates", () => {
    for (const s of ['>Details<', "'Owner'", "'Overview'", 'Not set<', 'Unassigned<', '>Edit all<', '>View all<', '>Next tasks<', '>Latest activity<', "'Deal value'", "'Last activity'"])
      assert.equal(dv.includes(s), false, `found ${s}`);
  });
  test('the deal pop window opens on the Activities tab', () => {
    assert.match(dv, /tab: 'activity', actsOnly: false, type: 'note'/);
  });
  test('core.js: date formatting, the Close / Search / Confirm chrome and the API error texts follow the language', () => {
    const core = codeOf('public/js/core.js');
    assert.match(sliceFn(core, 'fmtDate', 'core.js'), /currentLang === 'de' \? 'de-DE' : 'en-GB'/);
    assert.equal((core.match(/aria-label="Close"/g) || []).length, 0);
    assert.equal((core.match(/aria-label="Search"/g) || []).length, 0);
    assert.doesNotMatch(core, /confirmLabel = 'Confirm'/);
    assert.doesNotMatch(core, /'Network error'|`Server error \(/);
    assert.match(core, /get label\(\) \{ return t\('col_company'\); \}/);
  });
});

describe('index.html: nothing user-visible is left without a data-i18n* attribute', () => {
  // The same heuristic the sweep used: text nodes and labelled attributes of elements that carry
  // no data-i18n*, minus tokens that are not language (brand names, keys, template variables).
  const skip = /^(Upgrads( CRM)?|Ctrl K|EUR|CSV|DE|EN|1 of 13|\{\{\w+\}\}|[\d\s.,%:–—-]*|WhatsApp|Miro|Suppliers|Listings|https?:\/\/\S+|Hi \{\{name\}\},?)$/;
  const german = /[äöüßÄÖÜ]|\b(und|der|die|das|für|mit|nicht|ein|eine|zum|zur|Passwort|Anmelden|Arbeitsbereich|Konto|Zurück|Einladungscode|Name|Code|Kopieren|Beitreten|Dunkelmodus|Sprache)\b/;
  test('scan', () => {
    const out = [];
    for (const m of html.matchAll(/<(\w+)([^>]*)>([^<]*)/g)) {
      const [, tag, attrs, text] = m;
      if (/^(script|style|svg|use|path|symbol|defs|linearGradient|stop|g|rect|circle|title|code)$/.test(tag)) continue;
      const tx = text.replace(/\s+/g, ' ').trim();
      if (tx && !/data-i18n=/.test(attrs) && /[A-Za-z]{2,}/.test(tx) && !skip.test(tx) && !german.test(tx)) out.push(`<${tag}> ${tx}`);
      for (const a of attrs.matchAll(/\b(aria-label|title|placeholder|alt)="([^"]*)"/g)) {
        const v = a[2].trim(), has = new RegExp(`data-i18n-${{ 'aria-label': 'aria', title: 'title', placeholder: 'ph', alt: 'alt' }[a[1]]}=`).test(attrs);
        if (v && !has && /[A-Za-z]{2,}/.test(v) && !skip.test(v) && !german.test(v)) out.push(`<${tag} ${a[1]}> ${v}`);
      }
    }
    assert.deepEqual(out, []);
  });
});
