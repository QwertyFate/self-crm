// CLIENT (static + pure-function) tests for the Notetaker box in the Cal.com booking dialog (2026-10-20).
// Part 3 (2026-10-21): the box is asked for first. When Google Meet is the place, the dialog asks the server
// whether the Notetaker is there (GET /api/integrations/notetaker/health); the box stays greyed out while it asks,
// can be ticked only when the answer is yes, and otherwise says why with "Check again"; nothing is asked for a
// recording the Notetaker cannot take.
// "Mit Notetaker aufzeichnen": offered only when the chosen place is Google Meet and only when booking (a meeting
// being moved keeps its recording, the server tells the bot); unticked until someone ticks it; the summary says so;
// the request carries record: true only for Google Meet; afterwards one line says what the Notetaker answered.
// Every word is in TRANSLATIONS, German and English.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const dv  = read('public/js/detail-views.js');
const app = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const fnBody = name => { const i = dv.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const s = dv.indexOf(') {', i) + 2;   // the body, past a destructured parameter list
  let d = 0; for (let j = s; j < dv.length; j++) { if (dv[j] === '{') d++; else if (dv[j] === '}' && !--d) return dv.slice(s, j + 1); } return ''; };
const book = fnBody('openCalcomBooking');

describe('the box in the booking dialog', () => {
  test('shown again (2026-10-27; hidden 2026-10-26): the switch is on, so the box and its health check are back', () => {
    assert.match(read('public/js/detail-views.js'), /^const DV_NOTETAKER_SHOWN = true;$/m);
  });
  test('starts unticked and not yet asked; Google Meet is the integration google-meet', () => {
    assert.match(book, /const B = \{[^}]*record: false, nt: 'idle', ntWhy: ''[^}]*\};/);
    assert.match(book, /const isMeet = l => !!l && l\.type === 'integration' && l\.integration === 'google-meet';/);
  });
  test('shown only for Google Meet and only when booking; tickable only once the Notetaker said yes; otherwise why, and Check again', () => {
    assert.match(book, /const ntOk = B\.nt === 'ok';/);
    assert.match(book, /const ntLine = ntOk \? esc\(t\('cal_book_record_help'\)\)\s*: B\.nt === 'down' && B\.ntWhy === 'soon' \? esc\(t\('cal_rec_soon'\)\)\s*: B\.nt === 'down' \? `\$\{esc\(t\(NT_DOWN\[B\.ntWhy\] \|\| NT_DOWN\.error\)\)\} <button type="button" class="btn btn-ghost btn-sm" id="cal-book-recheck">\$\{esc\(t\('cal_rec_recheck'\)\)\}<\/button>`\s*: esc\(t\('cal_rec_checking'\)\);/);
    assert.match(book, /const rec = DV_NOTETAKER_SHOWN && !reschedule && isMeet\(place\) \? `<div class="cal-book-sec"><label class="check"><input type="checkbox" id="cal-book-record"\$\{ntOk && B\.record \? ' checked' : ''\}\$\{ntOk \? '' : ' disabled'\}><span>\$\{esc\(t\('cal_book_record'\)\)\}<\/span><\/label><p class="help" aria-live="polite">\$\{ntLine\}<\/p>\$\{sumBox\}<\/div>` : '';/, 'the summary box (NOTETAKER_AI Part 6) sits in the same section, under the help line');
    assert.match(book, /host\.innerHTML = `[^`]*\$\{what\}\$\{rec\}\$\{when\}/, 'right under the type and the place');
    assert.match(book, /on\(host, 'change', '#cal-book-record', \(e, el\) => \{ B\.record = el\.checked; render\(\); \}\);/);
    assert.match(book, /on\(host, 'click', '#cal-book-recheck', \(\) => checkNotetaker\(true\)\);/);
  });
  test('asked once Google Meet is the place (from any path into render), quietly, and again only on Check again', () => {
    assert.match(book, /const NT_DOWN = \{ unreachable: 'cal_rec_down_unreachable', token: 'cal_rec_down_token', error: 'cal_rec_down_error' \};/);
    const fn = book.slice(book.indexOf('async function checkNotetaker('), book.indexOf('\n  }', book.indexOf('async function checkNotetaker(')) + 4);
    assert.match(fn, /B\.nt = 'checking'; render\(\);/);
    assert.match(fn, /const r = await apiFetchSilent\('\/api\/integrations\/notetaker\/health' \+ \(fresh \? '\?fresh=1' : ''\)\);/, 'no loading bar, never a throw');
    assert.match(fn, /if \(!host\.isConnected\) return;/, 'a dialog closed meanwhile is left alone');
    assert.match(fn, /B\.nt = r && r\.available === true \? 'ok' : 'down'; B\.ntWhy = \(r && r\.reason\) \|\| 'error';\s*if \(B\.nt !== 'ok'\) B\.record = false;\s*render\(\);/);
    assert.match(book, /if \(DV_NOTETAKER_SHOWN && !reschedule && isMeet\(place\) && B\.nt === 'idle'\) checkNotetaker\(false\);\s*\}\n  \/\/ Is the Notetaker there\?/, 'at the end of render: the first time Google Meet is the place');
  });
  test('the summary says it; the request asks for it only on Google Meet', () => {
    assert.match(book, /!reschedule && B\.record && B\.nt === 'ok' && isMeet\(place\) \? t\('cal_book_record_short'\) : ''/);
    assert.match(book, /api\.post\('\/api\/integrations\/calcom\/book', \{ deal_id: dealId, .*, record: !!\(B\.record && B\.nt === 'ok' && isMeet\(place\)\), summary: !!\(B\.summary && B\.ai && B\.record && B\.nt === 'ok' && isMeet\(place\)\) \}\)/);
  });
  test('afterwards one line says what the Notetaker answered (also for a recorded meeting that was moved)', () => {
    assert.match(book, /if \(res\.notetaker\) dvNotetakerToast\(res\.notetaker\);/);
    const shown = [];
    const F = loadFns('public/js/detail-views.js', ['dvNotetakerToast'], { extra: `const ui = { toast: m => __shown.push(m) }; const __shown = []; function t(k) { return '[' + k + ']'; } function tf(k, v) { return '[' + k + ':' + JSON.stringify(v) + ']'; }`, expose: ['__shown'] });
    for (const [status, key] of [['scheduled', 'cal_rec_scheduled'], ['queued', 'cal_rec_queued'], ['updated', 'cal_rec_updated'], ['duplicate', 'cal_rec_duplicate'], ['waiting_link', 'cal_rec_waiting']]) F.dvNotetakerToast({ status });
    F.dvNotetakerToast({ status: 'failed', error: 'The Notetaker is not reachable' });
    F.dvNotetakerToast(null);
    assert.deepEqual(F.__shown, ['[cal_rec_scheduled]', '[cal_rec_queued]', '[cal_rec_updated]', '[cal_rec_duplicate]', '[cal_rec_waiting]', '[cal_rec_failed:{"error":"The Notetaker is not reachable"}]']);
    void shown;
  });
});

describe('the words', () => {
  test('in both languages; German impersonal; the failure line carries the reason', () => {
    for (const k of ['cal_book_record', 'cal_book_record_help', 'cal_book_record_short', 'cal_rec_scheduled', 'cal_rec_queued', 'cal_rec_updated', 'cal_rec_duplicate', 'cal_rec_waiting', 'cal_rec_failed', 'cal_rec_checking', 'cal_rec_down_unreachable', 'cal_rec_down_token', 'cal_rec_down_error', 'cal_rec_recheck', 'cal_rec_soon']) {
      for (const lang of ['de', 'en']) assert.ok(typeof app[lang][k] === 'string' && app[lang][k], `${lang} ${k}`);
      assert.doesNotMatch(app.de[k], /\b(Sie|Ihnen|Ihr\w*|du|dich|dein\w*)\b/, `${k} is impersonal`);
    }
    assert.equal(app.de.cal_book_record, 'Mit Notetaker aufzeichnen'); assert.equal(app.en.cal_book_record, 'Record with Notetaker');
    assert.match(app.de.cal_rec_failed, /\{error\}/); assert.match(app.en.cal_rec_failed, /\{error\}/);
    assert.equal(app.en.cal_rec_checking, 'Checking whether Notetaker is ready…');
    assert.equal(app.en.cal_rec_down_unreachable, 'Notetaker is not reachable right now, so this meeting cannot be recorded.');
    assert.equal(app.en.cal_rec_recheck, 'Check again');
    // coming soon (NOTETAKER_AI_CHANGES Part 10): the line under the greyed-out box, with no Check again
    assert.equal(app.de.cal_rec_soon, 'Kommt bald: Notetaker wird noch getestet.'); assert.equal(app.en.cal_rec_soon, 'Coming soon: Notetaker is still being tested.');
  });
  test('a greyed-out box looks and feels unavailable', () => {
    const css = read('public/style.css');
    assert.match(css, /^\.check:has\(input:disabled\) \{ cursor: not-allowed; color: var\(--text-3\); \} \.check input:disabled \{ cursor: not-allowed; opacity: \.5; \}$/m);
  });
});

// ── NOTETAKER_AI_CHANGES Part 6: the summary box under "Mit Notetaker aufzeichnen" ──
describe('the summary box (NOTETAKER_AI Part 6)', () => {
  test('starts unticked with no AI known; asked for the saved AI alongside the health check, quietly; no AI unticks it', () => {
    assert.match(book, /record: false, nt: 'idle', ntWhy: '', summary: false, ai: null \};/);
    const fn = book.slice(book.indexOf('async function checkNotetaker('), book.indexOf('\n  }', book.indexOf('async function checkNotetaker(')) + 4);
    assert.match(fn, /const aiAsk = apiFetchSilent\('\/api\/integrations\/notetaker\/ai'\);[^\n]*\n\s*const r = await apiFetchSilent\('\/api\/integrations\/notetaker\/health'/, 'both asked at once, no loading bar');
    assert.match(fn, /const aiRes = await aiAsk;\s*if \(!host\.isConnected\) return;\s*B\.ai = aiRes && !aiRes\.error && aiRes\.configured && aiRes\.ai \? aiRes\.ai\.provider : null;\s*if \(!B\.ai\) B\.summary = false;/, 'a Notetaker that is off answers 404: no AI, no box');
  });
  test('shown only under a ticked recording, once the Notetaker said yes and an AI is saved; in the same section; its own help line', () => {
    assert.match(book, /const sumOn = ntOk && B\.record && !!B\.ai;/);
    assert.match(book, /const sumBox = sumOn \? `<div class="cal-book-sub"><label class="check"><input type="checkbox" id="cal-book-summary"\$\{B\.summary \? ' checked' : ''\}><span>\$\{esc\(tf\('cal_book_summary', \{ ai: dvAiName\(B\.ai\) \}\)\)\}<\/span><\/label><p class="help">\$\{esc\(t\('cal_book_summary_help'\)\)\}<\/p><\/div>` : '';/);
    assert.match(book, /<p class="help" aria-live="polite">\$\{ntLine\}<\/p>\$\{sumBox\}<\/div>/);
    assert.match(book, /on\(host, 'change', '#cal-book-summary', \(e, el\) => \{ B\.summary = el\.checked; render\(\); \}\);/);
    assert.match(read('public/style.css'), /^\.cal-book-sub \{ display: flex; flex-direction: column; gap: var\(--sp-1\); padding-left: 23px; \}$/m, 'indented under the recording box');
  });
  test('the booking line names it; the request asks for it only with the recording, a saved AI, the Notetaker ready and Google Meet', () => {
    assert.match(book, /!reschedule && sumOn && B\.summary && isMeet\(place\) \? tf\('cal_book_summary_short', \{ ai: dvAiName\(B\.ai\) \}\) : ''/);
    assert.match(book, /summary: !!\(B\.summary && B\.ai && B\.record && B\.nt === 'ok' && isMeet\(place\)\) \}\);/);
  });
  test('the AI\'s name is the Notetaker tab\'s (NT_AI_NAMES in integrations.js, loaded first); unknown names pass through', () => {
    const html = read('public/index.html');
    assert.ok(html.indexOf('<script src="js/integrations.js">') < html.indexOf('<script src="js/detail-views.js">'), 'integrations.js loads before detail-views.js');
    const withNames = loadFns('public/js/detail-views.js', ['dvAiName'], { extra: "const NT_AI_NAMES = { openai: 'ChatGPT', claude: 'Claude' };" });
    assert.equal(withNames.dvAiName('openai'), 'ChatGPT'); assert.equal(withNames.dvAiName('mistral'), 'mistral'); assert.equal(withNames.dvAiName(null), '');
    const without = loadFns('public/js/detail-views.js', ['dvAiName']);
    assert.equal(without.dvAiName('openai'), 'openai', 'without the Integrations script: the raw name, never a throw');
  });
  test('the words, in both languages; German impersonal; {ai} in each', () => {
    for (const k of ['cal_book_summary', 'cal_book_summary_help', 'cal_book_summary_short']) {
      for (const lang of ['de', 'en']) assert.ok(typeof app[lang][k] === 'string' && app[lang][k], `${lang} ${k}`);
      assert.doesNotMatch(app.de[k], /\b(Sie|Ihnen|Ihr\w*|du|dich|dein\w*)\b/, `${k} is impersonal`);
    }
    for (const k of ['cal_book_summary', 'cal_book_summary_short']) for (const lang of ['de', 'en']) assert.match(app[lang][k], /\{ai\}/, `${lang} ${k}`);
    assert.equal(app.de.cal_book_summary, 'Zusammenfassung mit {ai} schreiben'); assert.equal(app.en.cal_book_summary, 'Write a summary with {ai}');
    assert.equal(app.en.cal_book_summary_help, 'Without it, the note on the deal is the transcript.');
  });
});
