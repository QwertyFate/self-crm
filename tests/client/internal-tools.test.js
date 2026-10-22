// CLIENT (static + pure-function) tests for the internal team's tools page (internal-tools/page, INTERNAL_TOOLS_CHANGES
// Parts 2–4, 2026-10-21). Not part of the CRM: served only under a fixed secret path, its own look, every call relative
// to that path, the password (the ADMIN_SECRET's value) in the tab's memory only and sent with every request. One
// screen (Part 4 removed the settings and the tabs): an audio file to the Notetaker, the transcript plain or with
// timestamps, copy, .txt.
// Pinned: the document; the words (German and English, the markup equal to the German, impersonal); the pure helpers
// (clock, transcript, file name, meta line, every answer the server can give); the calls (relative, with the password,
// nothing kept in storage but the language); nothing from the server written as HTML; its own stylesheet.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const DIR    = 'internal-tools/page/';
const html   = read(DIR + 'index.html');
const css    = read(DIR + 'tools.css');
const js     = read(DIR + 'tools.js');
const dict   = new Function(sliceConst(DIR + 'tools.js', 'IT_I18N').replace(/^[^{]*/, 'return '))();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const F = loadFns(DIR + 'tools.js', ['itWord', 'itFill', 'itClock', 'itTranscript', 'itTxtName', 'itMb', 'itMeta', 'itError'], { state: { itLang: 'de' }, extra: sliceConst(DIR + 'tools.js', 'IT_I18N') });
const RESULT = { filename: 'call.mp3', language: 'de', duration_seconds: 61.2, seconds_taken: 27.5, text: 'Hallo.\nTschüss.', segments: [{ start: 0, end: 1.5, text: 'Hallo.' }, { start: 59, end: 61.2, text: 'Tschüss.' }] };

describe('the document', () => {
  test('German, not indexed, no referrer (the path stays out of other sites\' logs); its own stylesheet and script, by relative links; no inline style or script', () => {
    assert.match(html, /^<!DOCTYPE html>\n<html lang="de" class="it-root">/);
    assert.match(head, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(head, /<meta name="referrer" content="no-referrer">/);
    assert.match(head, /<link rel="stylesheet" href="tools\.css">\s*<script src="tools\.js" defer><\/script>/);
    assert.equal((html.match(/<script\b/g) || []).length, 1);
    assert.equal((html.match(/<link rel="stylesheet"/g) || []).length, 1, 'no CRM stylesheet');
    assert.doesNotMatch(html, /\sstyle="|<style\b|on(click|load|input|submit|change)="|href="\/|src="\//);
  });
  test('locked first: the password form shows, the tools are hidden; [hidden] wins over every display rule', () => {
    assert.match(body, /<section class="it-card it-gate" id="it-gate"/);
    assert.match(body, /<section class="it-tools" id="it-tools" hidden>/);
    assert.match(body, /<input id="it-pass" name="secret" type="password" autocomplete="current-password" required/);
    assert.match(bare, /html\.it-root \[hidden\] \{ display: none !important; \}/);
  });
  test('one screen, no settings: the file, the language (detect first, then German and English), start; no tabs', () => {
    assert.match(body, /<form class="it-card it-card-body it-form" id="it-tr-form" novalidate aria-labelledby="it-tr-t">/);
    assert.match(body, /<select id="it-tr-lang" name="language">\s*<option value="" data-i18n="it_lang_auto">Automatisch erkennen<\/option>\s*<option value="de" data-i18n="it_lang_de">Deutsch<\/option>\s*<option value="en" data-i18n="it_lang_en">Englisch<\/option>\s*<\/select>/);
    assert.equal((body.match(/<form\b/g) || []).length, 2, 'the password form and the file form, nothing else');
    assert.doesNotMatch(body, /role="tab|tabpanel|it-set-|it-url|it-token|it-max|Einstellungen/);
    assert.doesNotMatch(js, /api\/settings|Einstellungen|Settings/);
  });
});

describe('words', () => {
  test('both languages hold the same keys; the markup equals the German value key for key, aria included', () => {
    assert.deepEqual(Object.keys(dict.de), Object.keys(dict.en));
    let n = 0;
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) { assert.equal(m[2], dict.de[m[1]], m[1]); n++; }
    for (const m of html.matchAll(/data-i18n-aria="([^"]+)" aria-label="([^"]*)"/g)) { assert.equal(m[2], dict.de[m[1]], m[1]); n++; }
    assert.ok(n >= 20, `${n} words checked`);
  });
  test('no dead keys, no unknown keys', () => {
    const used = new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(m => m[1]));
    const code = js.slice(js.indexOf('\n};'));
    for (const m of code.matchAll(/'(it_[a-zA-Z0-9_]+)'/g)) used.add(m[1]);
    for (const k of Object.keys(dict.de)) assert.ok(used.has(k), `${k} is used`);
    for (const k of used) assert.ok(k in dict.de, `${k} exists`);
  });
  test('impersonal German, English where it differs; no em dash or middle dot; nothing about the CRM', () => {
    const KEEP = /^\{name\} \(\{mb\} MB\)$/;
    for (const [k, v] of Object.entries(dict.de)) {
      assert.doesNotMatch(v, IMPERSONAL, `${k}: ${v}`);
      if (!KEEP.test(v)) assert.notEqual(v, dict.en[k], `${k} is translated`);
    }
    assert.doesNotMatch(body.replace(/<[^>]+>/g, ' '), IMPERSONAL);
    const all = Object.values(dict.de).concat(Object.values(dict.en)).join('\n');
    assert.doesNotMatch(all, /—|·/);
    assert.doesNotMatch(all + body, /\bCRM\b|Upgrads|\.env/);
  });
});

describe('the helpers', () => {
  test('the clock: m:ss, then h:mm:ss', () => {
    assert.equal(F.itClock(0), '0:00'); assert.equal(F.itClock(61.2), '1:01'); assert.equal(F.itClock(599.6), '10:00'); assert.equal(F.itClock(3725), '1:02:05'); assert.equal(F.itClock(-4), '0:00');
  });
  test('the transcript: the text as it came, or one line per segment with its start', () => {
    assert.equal(F.itTranscript(RESULT, false), 'Hallo.\nTschüss.');
    assert.equal(F.itTranscript(RESULT, true), '[0:00] Hallo.\n[0:59] Tschüss.');
    assert.equal(F.itTranscript({ ...RESULT, segments: [] }, true), 'Hallo.\nTschüss.', 'no segments: the text');
  });
  test('the download\'s name: the audio\'s name as .txt, never a path; a fallback in the page\'s language', () => {
    assert.equal(F.itTxtName('call.mp3'), 'call.txt');
    assert.equal(F.itTxtName('Gespräch Müller.final.m4a'), 'Gespräch Müller.final.txt');
    assert.equal(F.itTxtName('a/b\\c:d.wav'), 'a b c d.txt');
    assert.equal(F.itTxtName(''), 'transkript.txt');
    F.__set('itLang', 'en'); assert.equal(F.itTxtName(''), 'transcript.txt'); F.__set('itLang', 'de');
  });
  test('the size and the meta line in each language', () => {
    assert.equal(F.itMb(4.25 * 1024 * 1024), '4,3'); assert.equal(F.itMb(500), '0');
    assert.equal(F.itMeta(RESULT), 'Deutsch, 1:01 Audio, in 28 Sekunden transkribiert');
    F.__set('itLang', 'en');
    assert.equal(F.itMb(4.25 * 1024 * 1024), '4.3');
    assert.equal(F.itMeta({ ...RESULT, language: 'fr' }), 'FR, 1:01 of audio, transcribed in 28 seconds');
    F.__set('itLang', 'de');
  });
  test('every answer the server can give has its own sentence; a wrong password, the tools off or too many tries lock the page', () => {
    const say = (s, b) => F.itError(s, b);
    assert.deepEqual(say(401, { error: 'password' }), { text: dict.de.it_err_expired, gate: true });
    assert.deepEqual(say(503, { error: 'off' }), { text: dict.de.it_err_off, gate: true });
    assert.deepEqual(say(429, { error: 'too_many' }), { text: dict.de.it_err_too_many, gate: true });
    const cases = [
      [400, { error: 'no_file' }, dict.de.it_need_file], [400, { error: 'empty' }, dict.de.it_err_empty],
      [413, { error: 'too_large', maxMb: 50 }, 'Die Datei ist größer als 50 MB.'], [429, { error: 'busy' }, dict.de.it_err_busy],
      [502, { error: 'token' }, dict.de.it_err_token], [422, { error: 'unreadable', detail: 'could not decode' }, 'Der Notetaker konnte die Datei nicht lesen: could not decode'],
      [502, { error: 'notetaker', status: 500 }, 'Der Notetaker meldet einen Fehler (500).'], [502, { error: 'unreachable' }, dict.de.it_err_unreachable],
      [504, { error: 'timeout' }, dict.de.it_err_timeout], [400, { error: 'language' }, dict.de.it_err_any], [500, { error: 'config' }, dict.de.it_err_any],
      [400, { error: 'upload' }, dict.de.it_err_any], [0, null, dict.de.it_err_any], [500, { error: 'Internal server error' }, dict.de.it_err_any],
    ];
    for (const [s, b, text] of cases) assert.deepEqual(say(s, b), { text, gate: false }, JSON.stringify(b));
  });
});

describe('the calls the page makes', () => {
  test('every call is relative to the secret path and carries the password; nothing of the CRM is asked', () => {
    assert.match(js, /const r = await fetch\(url, \{ method, headers: \{ 'X-Tools-Secret': secret \} \}\);/);
    assert.match(js, /itApi\('POST', 'api\/unlock', secret\)/);
    assert.match(js, /fetch\('api\/transcribe', \{ method: 'POST', body: form, headers: \{ 'X-Tools-Secret': itSecret \} \}\)/);
    assert.doesNotMatch(js, /fetch\('\/|itApi\('[A-Z]+', '\//, 'no absolute address');
    assert.doesNotMatch(js, /\/api\/admin|\/api\/auth/);
  });
  test('the password: kept only in the tab\'s memory, set on a right answer, forgotten when locked; the field emptied after each try', () => {
    assert.match(js, /^let itSecret = '';/m);
    assert.match(js, /if \(r\.ok\) \{ itSecret = secret; return itShowTools\(\); \}/);
    assert.match(js, /function itShowGate\(message\) \{\n  itSecret = '';/);
    assert.match(js, /document\.getElementById\('it-pass'\)\.value = '';/);
    assert.doesNotMatch(js, /sessionStorage|document\.cookie|indexedDB/);
    assert.deepEqual([...js.matchAll(/localStorage\.(?:get|set)Item\(([^,)]+)/g)].map(m => m[1]), ['IT_LANG_KEY', 'IT_LANG_KEY'], 'only the language is remembered');
    assert.match(js, /^const IT_LANG_KEY = 'internal-tools-lang';/m);
  });
  test('a transcription: the file under "file", the language only when one is picked; after unlocking the file field has the focus', () => {
    assert.match(js, /form\.append\('file', itFile, itFile\.name\);/);
    assert.match(js, /const lang = document\.getElementById\('it-tr-lang'\)\.value;\n  if \(lang\) form\.append\('language', lang\);/);
    assert.match(js, /document\.getElementById\('it-file'\)\.focus\(\);/);
  });
  test('nothing from the server or a file name is written as HTML; one timer, cleared when the answer comes; strict; the start', () => {
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
    assert.equal((js.match(/setInterval\(/g) || []).length, 1);
    assert.match(js, /clearInterval\(itTimer\);/);
    assert.match(js, /^'use strict';$/m);
    assert.match(js.trim(), /document\.addEventListener\('DOMContentLoaded', itInit\);$/);
  });
  test('every id the script touches exists in the page', () => {
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(ids.has(m[1]), `#${m[1]}`);
    for (const m of js.matchAll(/itSay\('([^']+)'/g)) assert.ok(ids.has(m[1]), `#${m[1]}`);
  });
});

describe('its own stylesheet', () => {
  const classes = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
  for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) classes.add(m[1]);
  test('every class the page uses has a rule here and every rule is used; all its own (it- and states)', () => {
    for (const c of classes) assert.match(c, /^(it|it-[a-z0-9-]+|is-[a-z]+|has-[a-z]+)$/, `.${c} is the page's own`);
    const ruled = new Set([...bare.matchAll(/\.((?:it|is|has)-[a-z0-9-]+)/g)].map(m => m[1]));
    for (const c of classes) if (c !== 'it' && c !== 'it-root') assert.ok(ruled.has(c), `.${c} has a rule`);
    for (const c of ruled) assert.ok(classes.has(c) || c === 'it-root', `.${c} is used`);
  });
  test('scoped, hex only as tokens on html.it-root, light and dark from the system, the file input focusable', () => {
    for (const sel of bare.replace(/@media[^{]+\{/g, '').match(/[^{}]+(?=\{)/g).map(s => s.trim()).filter(Boolean)) assert.match(sel, /^(html\.it-root|body\.it|\.it\b)/, `scoped: ${sel}`);
    for (const m of bare.matchAll(/([^{};]+)\{([^{}]*#[0-9a-fA-F]{3,8}\b[^{}]*)\}/g)) {
      assert.equal(m[1].trim(), 'html.it-root', 'hex only in the token blocks');
      for (const decl of m[2].split(';').filter(d => /#[0-9a-f]{3,8}\b/i.test(d))) assert.match(decl.trim(), /^--it-[a-z0-9-]+: #[0-9A-F]{6}$/, decl);
    }
    assert.match(bare, /@media \(prefers-color-scheme: dark\) \{\s*html\.it-root \{/);
    assert.match(bare, /\.it-file \{[^}]*position: absolute;[^}]*opacity: 0;/);
    assert.doesNotMatch(bare, /\.it-file \{[^}]*display: none/);
    assert.doesNotMatch(bare, /var\(--(?!it-)/, 'no token from anywhere else');
  });
});
