// CLIENT (static + pure-function) tests for the second landing page at /landingpagetwo (LOGIN_LANDING_CHANGES Part 48,
// 2026-10-22): "Das CRM, das mit anpackt." A selling page that is played with: a live Deals board in the hero (leads
// drop in by themselves, the bell rings for a booked meeting and for Notetaker's notes, any card can be dragged, Won is
// the team's move and the Engine answers it); five numbered jobs that walk one deal through what Upgrads does (the lead,
// the booking with the conflict check, Notetaker's note, the win with Undo, the Engine's statuses); the rest of the day
// in tabs (tasks, the week, the team chat, the win rate, the list the team names itself); four questions; the request.
// Pinned: the route and the document; the face (Commissioner with its flair axis, self-hosted, no earlier page's);
// nothing of the earlier pages; the hero board and its arrivals (pure, run here); the five jobs (pure, run here) and
// every rule they reproduce against the code that has it; the day (pure, run here); the app's words against
// TRANSLATIONS; the words audits (few words, impersonal, claims, tells); the request; the stylesheet audit; the script.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const server = read('server.js');
const html   = read('public/landingpagetwo.html');
const css    = read('public/landing-two.css');
const js     = read('public/js/landing-two.js');
const style  = read('public/style.css');
const REL    = 'public/js/landing-two.js';
const dict   = new Function(sliceConst(REL, 'PI_I18N').replace(/^[^{]*/, 'return '))();
const app    = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words  = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const SCREEN = k => /^pi_(app_|s_|src_)/.test(k);   // the words inside the screens and the source names, not page copy
const PAGE_KEYS = Object.keys(dict.de).filter(k => !SCREEN(k));
const COMPETITORS = /\b(hubspot|pipedrive|salesforce|zoho|onoffice|propstack|attio|twenty|monday\.com|close\.com|freshsales|copper|keap|insightly|nethunt|fireflies|tl;dv|tldv|claap|read\.ai|meetgeek)\b/i;
const EARLIER_HOOKS = ['Alles landet im Deal.', 'Das CRM, das den Kleinkram übernimmt.', 'Ein CRM, kein Bastelprojekt.', 'Wer hat das alles eingetippt?', 'Erst Probe fahren. Dann reden.', 'Selbst zum Lead werden.', 'Bei anderen CRMs ein Zusatz, bei Upgrads eingebaut.'];
const section = id => { const at = html.indexOf(`id="${id}"`); return html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', html.indexOf('</ol>', at))); };

// The page's pure parts, loaded from the real file: the constants by their literal, the scalars by their line.
const scalar = name => { const m = js.match(new RegExp(`^const ${name} = [^;\\n]*;`, 'm')); assert.ok(m, `const ${name}`); return m[0]; };
const CONSTS = ['PI_I18N', 'PI_TEAM', 'PI_STAGES', 'PI_BOARD_SEED', 'PI_HERO_SCRIPT', 'PI_LEADS', 'PI_SOURCES', 'PI_DAYS', 'PI_CRM_ENTRIES', 'PI_ENGINE', 'PI_NOTES', 'PI_NOTE_WORDS', 'PI_TABS', 'PI_AN_BASE'];
const EXTRA = [scalar('PI_ME'), scalar('PI_WON'), scalar('PI_ZONE'), ...CONSTS.map(n => sliceConst(REL, n))].join('\n');
const FNS = ['piWord', 'piFill', 'piEuro', 'piMoney', 'piLocale', 'piMin', 'piHhmm', 'piUtc', 'piTime', 'piAmPm', 'piDayLabel', 'piSlotLabel', 'piWhen',
  'piBoardInitial', 'piBoardCard', 'piBoardCount', 'piBoardShare', 'piHeroEvent', 'piBoardMove', 'piBoardUndo', 'piFeedTitle', 'piFeedDetail',
  'piClash', 'piClashText', 'piNoteText', 'piJobsInitial', 'piTried', 'piJobAct', 'piJobsTried',
  'piWinRate', 'piDayInitial', 'piClean', 'piDayAct', 'piDayTasks', 'piAnalytics', 'piListName', 'piAskOk', 'piAskMailto'];
const F = loadFns(REL, FNS, { state: { piLang: 'de' }, extra: EXTRA, expose: ['PI_BOARD_SEED', 'PI_HERO_SCRIPT', 'PI_LEADS', 'PI_DAYS', 'PI_CRM_ENTRIES', 'PI_ENGINE', 'PI_NOTES', 'PI_STAGES', 'PI_TEAM', 'PI_ME', 'PI_WON'] });
const S = F.PI_STAGES.length;

describe('route and document', () => {
  test('/landingpagetwo serves public/landingpagetwo.html, after /landingpage and before the SPA catch-all', () => {
    assert.match(server, /app\.get\('\/landingpagetwo', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'public', 'landingpagetwo\.html'\)\)\);/);
    const one = server.indexOf("app.get('/landingpage',"), two = server.indexOf("app.get('/landingpagetwo',"), all = server.indexOf("app.get('*'");
    assert.ok(one > 0 && two > one && all > two);
  });
  test('the head: German, the app in dark (data-theme), the root class, the face and Inter preloaded, the app stylesheet first, one deferred script; no inline style or script', () => {
    assert.match(html, /^<!DOCTYPE html>\n<html lang="de" class="pi-root" data-theme="dark">/);
    assert.match(head, /<meta name="color-scheme" content="dark">/);
    for (const f of ['Commissioner', 'inter-latin-wght']) assert.match(head, new RegExp(`<link rel="preload" href="/fonts/${f}\\.woff2" as="font" type="font/woff2" crossorigin>`));
    assert.match(head, /<link rel="stylesheet" href="\/style\.css">\s*<link rel="stylesheet" href="\/landing-two\.css">\s*<script src="\/js\/landing-two\.js" defer><\/script>/);
    assert.equal((html.match(/<script\b/g) || []).length, 1);
    assert.match(body, /^<body class="pi">\n<svg class="pi-sprite" aria-hidden="true" focusable="false">/);
    assert.equal((body.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(html, /\sstyle="|<style\b|on(click|load|input|submit|change)="/);
    assert.doesNotMatch(html, /https?:\/\/(?!upgrads\.de\/)/, 'nothing loads from another host (the sprite is inline)');
  });
  test('the face: Commissioner, self-hosted with its licence, its flair axis on the headlines; no earlier page used it; Part 47\'s faces gone', () => {
    const file = path.join(ROOT, 'public/fonts/Commissioner.woff2');
    assert.ok(fs.statSync(file).size > 20000); assert.equal(fs.readFileSync(file).slice(0, 4).toString('latin1'), 'wOF2');
    assert.match(read('public/fonts/OFL-Commissioner.txt'), /SIL Open Font License, Version 1\.1/);
    assert.deepEqual([...bare.matchAll(/font-family: "([^"]+)"/g)].map(m => m[1]), ['Commissioner']);
    for (const sel of ['.pi-h1', '.pi-h2']) assert.match(bare, new RegExp(`\\${sel} \\{[^}]*font-variation-settings: "FLAR" 100;`), sel);
    for (const f of ['Anybody', 'HankenGrotesk', 'OFL-Anybody', 'OFL-HankenGrotesk']) assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/${f}.${f.startsWith('OFL') ? 'txt' : 'woff2'}`)), `${f} gone`);
    for (const other of ['tests/client/landing-page.test.js', 'public/landing.css', 'public/style.css']) assert.doesNotMatch(read(other), /Commissioner/, other);
  });
  test('the screens speak the app\'s Inter and dark tokens, never its component classes', () => {
    for (const sel of ['.pi-window', '.pi-ui']) assert.match(bare, new RegExp(`\\${sel} \\{[^}]*font-family: var\\(--font\\);\\s*font-feature-settings: "cv11", "ss01";`), sel);
    const appClasses = /class="[^"]*(?<![\w-])(btn|card|badge|seg|table|field|modal|toast|dcard|sidebar|topbar|sb-[a-z]+|page|kebab|iconbtn)(?![\w-])[^"]*"/;
    assert.doesNotMatch(body, appClasses);
    assert.doesNotMatch(js, /className = '[^']*(?<![\w-])(btn|card|badge|toast|dcard)(?![\w-])/);
  });
});

describe('nothing of the earlier pages', () => {
  test('not their prefixes, dictionaries, faces or game', () => {
    assert.doesNotMatch(html + css + js, /(?<![\w-])(lz|mo|cv|rq|pf|up|wt|bk|vs)-[a-z]|LZ_I18N|MO_I18N|CV_I18N|RQ_I18N|PF_I18N|WT_I18N|BK_I18N|VS_I18N|Anybody|Hanken|Figtree|Shantell|Rethink|Source Serif|Red Hat|Bricolage|Geologica|Instrument|break-game|landing\.css|js\/landing\.js/);
  });
  test('not their hooks, and not a comparison: no other platform is named or argued with', () => {
    for (const h of EARLIER_HOOKS) for (const lang of ['de', 'en']) assert.notEqual(dict[lang].pi_h1, h);
    assert.doesNotMatch(Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + html + css + js, COMPETITORS);
    assert.doesNotMatch(Object.values(dict.de).join('\n'), /andere[nr]? (CRM|Plattform|Anbieter)|im Vergleich|Übliche/i);
  });
});

describe('the hero: the claim and the live board', () => {
  test('one h1 with the claim; the sub, the two ways forward (request, try it), who it is for', () => {
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(body, /<h1 class="pi-h1" id="pi-h1" data-i18n="pi_h1">Das CRM, das mit anpackt\.<\/h1>/);
    assert.equal(dict.en.pi_h1, 'The CRM that pitches in.');
    assert.match(body, /<a class="pi-btn" href="#pi-ask" data-i18n="pi_request">Zugang anfragen<\/a>\s*<a class="pi-btn pi-btn-ghost" href="#pi-jobs" data-i18n="pi_try">Selbst ausprobieren<\/a>/);
    for (const k of ['pi_for1', 'pi_for2', 'pi_for3']) assert.match(body, new RegExp(`<li data-i18n="${k}">`));
  });
  test('the window is the app: its sidebar in the app\'s order with the app\'s names, the top bar (search, Neu, the bell), five columns in the pipeline\'s order', () => {
    const side = body.slice(body.indexOf('<div class="pi-side"'), body.indexOf('<div class="pi-main">'));
    assert.deepEqual([...side.matchAll(/data-i18n="(pi_app_[a-z]+)"/g)].map(m => m[1]), ['pi_app_ws', 'pi_app_deals', 'pi_app_contacts', 'pi_app_tasks', 'pi_app_tools', 'pi_app_chat', 'pi_app_calendar', 'pi_app_analytics', 'pi_app_onboarding', 'pi_app_integrations']);
    assert.match(body, /<span class="pi-bell" id="pi-bell" role="img" data-i18n-aria="pi_app_notifications"/);
    const cols = [...body.slice(body.indexOf('id="pi-board"'), body.indexOf('id="pi-board-toast"')).matchAll(/<section class="pi-col pi-st-(\d)" data-col="(\d)"[^>]*>.*?data-i18n="(pi_s_st\d)"/g)].map(m => `${m[1]}${m[2]}${m[3]}`);
    assert.deepEqual(cols, ['00pi_s_st0', '11pi_s_st1', '22pi_s_st2', '33pi_s_st3', '44pi_s_st4']);
    assert.match(read('db.js'), /\['New',\s+'#6b7280', 0\],\s*\['Contacted',\s+'#3b82f6', 1\],\s*\['Proposal',\s+'#f59e0b', 2\],\s*\['Negotiation', '#8b5cf6', 3\],\s*\['Won',\s+'#22c55e', 4\]/, 'the seeded stages, in this order');
  });
  test('the board: six seeded deals; a move changes the column at once and remembers where it came from; Undo puts it back; no-ops return the same state', () => {
    const s0 = F.piBoardInitial();
    assert.deepEqual([0, 1, 2, 3, 4].map(i => F.piBoardCount(s0, i)), [1, 2, 1, 1, 1]);
    assert.ok(Math.abs([0, 1, 2, 3, 4].reduce((a, i) => a + F.piBoardShare(s0, i), 0) - 1) < 1e-9, 'the shares are of all value');
    const s1 = F.piBoardMove(s0, 'b2', 2);
    assert.equal(F.piBoardCard(s1, 'b2').stage, 2); assert.deepEqual(s1.last, { id: 'b2', from: 1, to: 2 });
    assert.equal(F.piBoardCard(s0, 'b2').stage, 1, 'pure: the old state is untouched');
    assert.equal(F.piBoardCard(F.piBoardUndo(s1), 'b2').stage, 1); assert.equal(F.piBoardUndo(s1).last, null);
    for (const [id, to] of [['b2', 1], ['nope', 2], ['b2', 9], ['b2', -1], ['b2', 1.5]]) assert.equal(F.piBoardMove(s0, id, to), s0, `${id} → ${to}`);
    assert.equal(F.piBoardUndo(s0), s0);
  });
  test('a move into Gewonnen is the hand\'s ("von Hand") and tells the Engine once per card on this page', () => {
    const s1 = F.piBoardMove(F.piBoardInitial(), 'b4', F.PI_WON);
    assert.deepEqual(s1.feed.at(-1), { n: 4, kind: 'won', deal: 'Praxis Neumann' }); assert.deepEqual(s1.told, ['b4']);
    assert.equal(F.piFeedTitle(s1.feed.at(-1)), 'Verschoben nach Gewonnen'); assert.equal(F.piFeedDetail(s1.feed.at(-1)), 'Praxis Neumann, von Hand');
    const s2 = F.piBoardMove(F.piBoardMove(s1, 'b4', 3), 'b4', F.PI_WON);
    assert.deepEqual(s2.told, ['b4']);
    assert.match(js, /if \(stage === PI_WON && !before\.told\.includes\(id\)\) \{\s*piLater\(\(\) => piHeroApply\(\{ kind: 'delivered', deal: id \}\), 1000, 'engine-' \+ id\);\s*piLater\(\(\) => piHeroApply\(\{ kind: 'form', deal: id \}\), 2600, 'engine-' \+ id\);/);
  });
  test('what arrives by itself: two leads, the meeting bell, the Notetaker bell; nothing in the script moves a card', () => {
    assert.deepEqual(F.PI_HERO_SCRIPT.map(e => e.kind), ['lead', 'meeting', 'note', 'lead']);
    const at = F.PI_HERO_SCRIPT.map(e => e.at); assert.deepEqual([...at].sort((a, b) => a - b), at);
    let s = F.piBoardInitial();
    for (const ev of F.PI_HERO_SCRIPT) s = F.piHeroEvent(s, ev);
    assert.equal(s.bell, 2, 'the bell rings for the meeting and the notes, never for a lead');
    assert.deepEqual(s.feed.map(f => `${f.n}:${f.kind}`), ['1:lead', '2:meeting', '3:note', '1:lead']);
    assert.deepEqual(F.piBoardInitial().cards.map(c => c.stage), s.cards.slice(0, 6).map(c => c.stage), 'no card moved');
    assert.equal(F.piHeroEvent(s, F.PI_HERO_SCRIPT[0]), s, 'a lead arrives once');
  });
  test('a lead from the inbound address is a deal titled with the person\'s name, in the first stage, with no value and no owner; the route tells nobody', () => {
    const s = F.piHeroEvent(F.piBoardInitial(), F.PI_HERO_SCRIPT[0]);
    const c = F.piBoardCard(s, 'b7');
    assert.deepEqual({ title: c.title, who: c.who, value: c.value, owner: c.owner, stage: c.stage }, { title: 'Jonas Becker', who: 'Jonas Becker, Becker Haustechnik', value: null, owner: null, stage: 0 });
    assert.equal(F.piEuro(c.value), '—');
    assert.equal(F.piFeedDetail(s.feed[0]), 'Jonas Becker, über Website-Formular');
    const integrations = read('routes/integrations.js');
    assert.match(integrations, /INSERT INTO deals \(workspace_id, contact_id, pipeline_id, stage_id, title\)/);
    const receive = integrations.slice(integrations.indexOf("router.post('/receive/:key'"), integrations.indexOf('\n});', integrations.indexOf("router.post('/receive/:key'")));
    assert.doesNotMatch(receive, /notify/, 'no bell for a lead');
  });
  test('the stage menu and the drag: a finger drags only sideways; the toast is the app\'s with Undo for 4.2 s', () => {
    assert.match(js, /if \(d\.touch && Math\.abs\(dy\) > Math\.abs\(dx\)\) \{ d = null; return; \}/);
    assert.match(bare, /\.pi-card \{[^}]*touch-action: pan-y;/);
    assert.match(js, /piToast\('pi-board-toast', piFill\('pi_app_moved', \{ s: piWord\(PI_STAGES\[stage\]\) \}\), \(\) => \{ piBoard = piBoardUndo\(piBoard\); piRenderBoard\(\); \}\);/);
    assert.match(js, /piLater\(\(\) => t\.remove\(\), 4200,/);
    assert.match(read('public/js/core.js'), /4200/);
    assert.match(body, /<div class="pi-move" id="pi-move" role="dialog" data-i18n-aria="pi_app_move"/);
  });
  test('the arrivals wait until the board is seen and while the tab is hidden; without motion the board starts where they end', () => {
    assert.match(js, /new IntersectionObserver\(/); assert.match(js, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) piCancel\('hero'\); else piHeroRun\(\); \}\);/);
    assert.match(js, /if \(piStill\) \{ for \(const ev of PI_HERO_SCRIPT\) piBoard = piHeroEvent\(piBoard, ev\);/);
  });
});

describe('the five jobs', () => {
  test('five numbered panels in the order a deal lives, one open at a time, each with its colour; the numerals are a picture', () => {
    const row = html.slice(html.indexOf('<ol class="pi-row"'), html.indexOf('<section class="pi-day"'));
    assert.deepEqual([...row.matchAll(/<li class="pi-job pi-c-(\d)( is-open)?" data-job="(\d)">\s*<button type="button" class="pi-job-h" id="pi-jh-\d" aria-expanded="(true|false)" aria-controls="pi-jb-\d"><span class="pi-job-n" aria-hidden="true">(\d)<\/span><span class="pi-job-t" data-i18n="pi_j(\d)_t">/g)].map(m => [m[1], m[3], m[5], m[6]].join('') + (m[2] ? '!' : '') + m[4][0]),
      ['1111!t', '2222f', '3333f', '4444f', '5555f']);
    assert.equal((row.match(/<div class="pi-job-b" id="pi-jb-\d" role="region" aria-labelledby="pi-jh-\d" hidden>/g) || []).length, 4, 'four bodies start hidden');
  });
  test('the reducer: a lead first (from one of four sources, at most four); nothing else counts before it', () => {
    let s = F.piJobsInitial();
    assert.equal(F.piJobAct(s, { type: 'book' }), s); assert.equal(F.piJobAct(s, { type: 'move', stage: 4 }), s);
    s = F.piJobAct(s, { type: 'lead', src: 'pi_src_zapier' });
    assert.deepEqual(s.leads[0], { ...F.PI_LEADS[0], src: 'pi_src_zapier' }); assert.equal(F.piJobsTried(s), 1);
    assert.equal(F.piJobAct(F.piJobsInitial(), { type: 'lead', src: 'evil' }).leads[0].src, 'pi_src_form');
    for (let i = 0; i < 6; i++) s = F.piJobAct(s, { type: 'lead', src: 'pi_src_make' });
    assert.equal(s.leads.length, F.PI_LEADS.length);
    assert.equal(F.piJobAct(s, { type: 'nope' }), s); assert.equal(F.piJobAct(s, null), s);
  });
  test('the booking: only days with open times; a slot of the chosen day; Notetaker only after its check answered; booked once', () => {
    let s = F.piJobAct(F.piJobsInitial(), { type: 'lead', src: 'pi_src_form' });
    assert.equal(F.piJobAct(s, { type: 'day', iso: '2026-10-28' }), s, 'a day without times cannot be picked');
    s = F.piJobAct(s, { type: 'day', iso: '2026-10-27' });
    assert.equal(F.piJobAct(s, { type: 'slot', slot: '09:30' }), s, 'not a time of this day');
    s = F.piJobAct(s, { type: 'slot', slot: '14:00' });
    assert.equal(F.piJobAct(s, { type: 'rec', on: true }), s, 'the box waits for the check');
    s = F.piJobAct(F.piJobAct(s, { type: 'nt-check' }), { type: 'nt-ok' });
    s = F.piJobAct(s, { type: 'rec', on: true }); assert.equal(s.rec, true);
    s = F.piJobAct(s, { type: 'book' }); assert.equal(s.booked, true); assert.equal(s.tried[1], true);
    assert.equal(F.piJobAct(s, { type: 'slot', slot: '10:00' }), s); assert.equal(F.piJobAct(s, { type: 'book' }), s);
    assert.match(read('public/js/detail-views.js'), /record: !!\(B\.record && B\.nt === 'ok' && isMeet\(place\)\)/, 'the app sends the box only once Notetaker said yes, on Google Meet');
    assert.match(read('public/js/detail-views.js'), /record: false, nt: 'idle'/, 'the box starts unticked, as here');
    assert.equal(F.piJobsInitial().rec, false);
  });
  test('the conflict check: the booker\'s entries, each counted as 30 minutes, overlapping the slot; the warning in the app\'s words; it does not block', () => {
    assert.deepEqual(F.piClash('2026-10-27', '11:00').map(e => e.at), ['11:15']);
    for (const h of ['10:00', '14:00', '15:30']) assert.deepEqual(F.piClash('2026-10-27', h), [], h);
    assert.deepEqual(F.piClash('2026-10-29', '15:00').map(e => e.at), ['15:00']); assert.deepEqual(F.piClash('2026-10-29', '09:30'), []);
    assert.equal(F.piClashText(F.piClash('2026-10-27', '11:00')[0]), 'Konflikt: um 11:15 (11:15 AM) steht bereits Rückruf Lena Hoffmann (Anna Weiß) im Kalender.');
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /const t0 = mins\(v\.time\), t1 = t0 \+ 30;\s*if \(t0 < s1 && t1 > s0\) found\.push\(\{ time: `\$\{v\.time\} \(\$\{ampmOf\(v\.time\)\}\)`/);
    assert.match(dv, /const people = new Set\(\[currentUser\?\.id, cal\.host_user_id\]\.filter\(Boolean\)\);/);
    assert.match(js, /book\.textContent = piWord\(clash\.length \? 'pi_app_anyway' : 'pi_app_submit'\)/, 'a clash turns the button into "Trotzdem buchen"');
  });
  test('the clocks, as the dialog writes them: the day, the slot with the 12-hour time beside it, the toast after booking', () => {
    assert.equal(F.piDayLabel('2026-10-27', 'de'), 'Di., 27. Okt.'); assert.equal(F.piDayLabel('2026-10-27', 'en'), 'Tue 27 Oct');
    assert.equal(F.piSlotLabel('2026-10-27', '14:00', 'de'), '14:00 bis 14:30 (2:00 PM)'); assert.equal(F.piSlotLabel('2026-10-27', '14:00', 'en'), '14:00 to 14:30 (2:00 PM)');
    assert.equal(F.piFill('pi_app_done', { when: F.piWhen('2026-10-27', '14:00', 'de') }, 'de'), 'Gebucht: Di., 27. Okt., 14:00 (2:00 PM). Cal.com schickt die Einladung.');
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /const fmtDay  = iso => new Date\(iso \+ 'T12:00:00Z'\)\.toLocaleDateString\(locale, \{ weekday: 'short', day: 'numeric', month: 'short' \}\);/);
    assert.match(dv, /const when = `\$\{fmtWhen\(B\.picked\)\} \(\$\{fmtAmPm\(B\.picked\)\}\)`;/);
    assert.equal(new Set(F.PI_DAYS.map(d => new Date(d.iso + 'T12:00:00Z').getUTCDay())).size, 5, 'Monday to Friday');
  });
  test('Notetaker\'s note on the deal is word for word what utils/notetaker.js resultNote() writes, in both languages; signed "Notetaker"', () => {
    const { resultNote } = require(path.join(ROOT, 'utils/notetaker.js'));
    for (const lang of ['de', 'en']) assert.equal(F.piNoteText(lang), resultNote({ event: 'recording.completed', notes: F.PI_NOTES[lang] }, lang).content, lang);
    assert.match(F.piNoteText('de'), /^Erstgespräch Becker Haustechnik\n\n.+\n\nWichtige Punkte\n• /);
    assert.match(read('routes/activities.js'), /WHEN a\.source = 'notetaker' THEN 'Notetaker'/);
    let s = F.piJobAct(F.piJobsInitial(), { type: 'lead' });
    s = F.piJobAct(F.piJobAct(F.piJobAct(s, { type: 'day', iso: '2026-10-27' }), { type: 'slot', slot: '14:00' }), { type: 'book' });
    assert.equal(F.piJobAct(s, { type: 'end' }), s, 'booked without Notetaker: no notes come back');
  });
  test('the win: one move, with Undo; into Gewonnen the Engine is told (Ausstehend, then Zugestellt, then its statuses in the API\'s order); signed "Upgrads Engine"', () => {
    let s = F.piJobAct(F.piJobsInitial(), { type: 'lead' });
    s = F.piJobAct(s, { type: 'move', stage: F.PI_WON }); assert.equal(s.stage, F.PI_WON); assert.equal(s.delivery, 'pending'); assert.equal(s.tried[3], true);
    const u = F.piJobAct(s, { type: 'undo' }); assert.equal(u.stage, 3); assert.equal(u.prev, null); assert.equal(F.piJobAct(u, { type: 'undo' }), u);
    s = F.piJobAct(s, { type: 'engine' }); assert.equal(s.delivery, 'success'); assert.equal(s.step, 0);
    for (let i = 0; i < 9; i++) s = F.piJobAct(s, { type: 'engine' });
    assert.equal(s.step, F.PI_ENGINE.length); assert.equal(s.tried[4], true); assert.equal(F.piJobsTried(s), 3);
    const api = read('routes/engine-api.js');
    const list = new Function('return ' + api.slice(api.indexOf('[', api.indexOf('const ONBOARDING_STATUSES')), api.indexOf('];', api.indexOf('const ONBOARDING_STATUSES')) + 1))();
    assert.deepEqual(list, ['kein_onboarding', ...F.PI_ENGINE]);
    assert.match(read('routes/activities.js'), /WHEN a\.source = 'engine' THEN 'Upgrads Engine'/);
    assert.match(read('routes/deals.js'), /fireEngine\(req,/);
    assert.deepEqual([...html.matchAll(/<li data-st="([a-z_]+)" data-i18n="pi_app_st_\1">/g)].map(m => m[1]), F.PI_ENGINE);
  });
  test('"Alles zeigen" plays the five jobs with the same actions a hand sends; "Von vorn" starts again', () => {
    const play = js.slice(js.indexOf('function piPlay()'), js.indexOf('function piBook()'));
    for (const a of ["type: 'lead', src: 'pi_src_form'", "type: 'day', iso: '2026-10-27'", "type: 'slot', slot: '11:00'", "type: 'slot', slot: '14:00'", "type: 'rec', on: true", 'piBook()', "type: 'end'", 'piJobsMoveWon()']) assert.ok(play.includes(a), a);
    assert.ok(play.indexOf("slot: '11:00'") < play.indexOf("slot: '14:00'"), 'the conflict shows before the clean time');
    assert.deepEqual(F.piJobAct(F.piJobAct(F.piJobsInitial(), { type: 'lead' }), { type: 'reset' }), F.piJobsInitial());
  });
});

describe('the rest of the day', () => {
  test('five tabs (four app pages and the list), arrow keys move between them; the panels in the same order', () => {
    assert.deepEqual([...html.matchAll(/<button type="button" class="pi-tab" role="tab" id="pi-tab-([a-z]+)" aria-controls="pi-panel-\1" aria-selected="(true|false)"(?: tabindex="-1")? data-tab="\1">/g)].map(m => m[1] + (m[2] === 'true' ? '!' : '')), ['tasks!', 'cal', 'chat', 'an', 'list']);
    assert.deepEqual([...html.matchAll(/<div class="pi-panel" id="pi-panel-([a-z]+)" role="tabpanel" aria-labelledby="pi-tab-\1" data-panel="\1"( hidden)?>/g)].map(m => m[1] + (m[2] ? '' : '!')), ['tasks!', 'cal', 'chat', 'an', 'list']);
    assert.match(js, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]\.includes\(e\.key\)/);
  });
  test('tasks: the tick with Undo, quick add with Enter assigned to the one who typed, All or My tasks', () => {
    let s = F.piDayInitial();
    s = F.piDayAct(s, { type: 'tick', id: 't1' }); assert.equal(s.tasks[0].done, true);
    s = F.piDayAct(s, { type: 'undo' }); assert.equal(s.tasks[0].done, false); assert.equal(F.piDayAct(s, { type: 'undo' }), s);
    assert.equal(F.piDayAct(s, { type: 'add', text: '   ' }), s);
    s = F.piDayAct(s, { type: 'add', text: '  Angebot   nachfassen ' }); assert.deepEqual(s.tasks.at(-1), { id: 't4', text: 'Angebot nachfassen', due: 'none', who: F.PI_ME, done: false });
    assert.deepEqual(F.piDayTasks(F.piDayAct(s, { type: 'scope', scope: 'mine' })).map(t => t.who), ['AW', 'AW', 'AW']);
    assert.match(read('public/js/tasks.js'), /function toggleTaskDone/); assert.match(read('public/js/tasks.js'), /function quickAddTask/);
  });
  test('the chat: a message lands, the one answer comes once; the win rate is won / (won + lost) and the deal won above counts', () => {
    let s = F.piDayAct(F.piDayInitial(), { type: 'say', text: 'Hallo', at: '10:00' });
    assert.deepEqual(s.chat.at(-1), { who: 'AW', text: 'Hallo', at: '10:00' });
    s = F.piDayAct(s, { type: 'reply', at: '10:01' }); assert.equal(F.piDayAct(s, { type: 'reply' }), s);
    assert.equal(F.piDayAct(s, { type: 'say', text: '' }), s);
    assert.equal(F.piWinRate(8, 4), 67); assert.equal(F.piWinRate(0, 0), null);
    assert.equal(F.piAnalytics(false).rate, 67); assert.equal(F.piAnalytics(true).rate, 69);
    assert.equal(F.piAnalytics(true).won - F.piAnalytics(false).won, F.piAnalytics(false).open - F.piAnalytics(true).open);
    assert.match(read('routes/analytics.js'), /won \/ \(won \+ lost\)|won\s*\/\s*decided|\(won \+ lost\)/);
  });
  test('the list the team names itself: trimmed to 40, empty means the default name', () => {
    let s = F.piDayAct(F.piDayInitial(), { type: 'list', name: '  Immobilien  ' });
    assert.equal(F.piListName(s, 'de'), 'Immobilien');
    assert.equal(F.piListName(F.piDayAct(s, { type: 'list', name: '' }), 'de'), 'Objekte');
    assert.equal(F.piDayAct(s, { type: 'list', name: 'x'.repeat(60) }).list.length, 40);
    assert.match(read('routes/workspace.js'), /UPDATE workspaces SET object_name=\$1 WHERE id=\$2/);
  });
});

describe('the product speaks the app\'s own words and formats', () => {
  test('each pi_app_* word equals the app\'s TRANSLATIONS value, in both languages', () => {
    const MAP = {
      pi_app_ws: 'sb_workspace', pi_app_tools: 'sb_tools', pi_app_deals: 'nav_deals', pi_app_contacts: 'nav_contacts', pi_app_tasks: 'nav_tasks', pi_app_chat: 'nav_chat', pi_app_calendar: 'nav_calendar',
      pi_app_analytics: 'nav_analytics', pi_app_onboarding: 'nav_onboarding', pi_app_integrations: 'nav_integrations', pi_app_search: 'topbar_search', pi_app_new: 'topbar_new', pi_app_notifications: 'set_notifications',
      pi_app_moved: 'moved_to', pi_app_undo: 'undo', pi_app_move: 'move_to_stage', pi_app_urg3: 'urg_3', pi_app_stage: 'chip_stage',
      pi_app_leads_t: 'intg_activity_title', pi_app_lead: 'intg_log_success', pi_app_now: 'ago_now', pi_app_by: 'dv_by_name', pi_app_meeting: 'act_meeting', pi_app_note: 'act_note',
      pi_app_booked: 'notif_meeting_booked', pi_app_nt_done: 'notif_notetaker_done',
      pi_app_book_title: 'cal_book_title', pi_app_invite_to: 'cal_book_invite_to', pi_app_type: 'cal_book_type', pi_app_minutes: 'cal_minutes', pi_app_where: 'cal_book_where',
      pi_app_n_times: 'cal_book_n_times', pi_app_slot: 'cal_book_slot', pi_app_zone: 'cal_book_zone', pi_app_conflict: 'cal_book_conflict', pi_app_conflict_hint: 'cal_book_conflict_hint',
      pi_app_anyway: 'cal_book_anyway', pi_app_submit: 'cal_book_submit', pi_app_booking: 'cal_book_booking', pi_app_done: 'cal_book_done',
      pi_app_record: 'cal_book_record', pi_app_rec_checking: 'cal_rec_checking', pi_app_rec_scheduled: 'cal_rec_scheduled', pi_app_rec_short: 'cal_book_record_short', pi_app_with: 'cal_book_with', pi_app_join: 'cal_join',
      pi_app_pending: 'engine_status_pending', pi_app_delivered: 'engine_status_success',
      pi_app_col_deal: 'onb_col_deal', pi_app_col_customer: 'onb_col_customer', pi_app_col_status: 'onb_col_status', pi_app_col_delivery: 'onb_col_delivery',
      pi_app_tk_all: 'tk_all', pi_app_tk_mine: 'tk_mine', pi_app_tk_add: 'tk_add_task', pi_app_tk_enter: 'tk_press_enter', pi_app_tk_added: 'tk_added_to', pi_app_tk_done: 'tk_completed', pi_app_tk_reopened: 'tk_reopened',
      pi_app_due_today: 'dv_due_today_at', pi_app_overdue: 'dv_overdue_n', pi_app_tomorrow: 'tk_due_tomorrow', pi_app_week: 'html_week', pi_app_chat_ph: 'html_chat_ph', pi_app_online: 'chat_online',
      pi_app_an_open: 'an_kpi_open_pipeline', pi_app_an_won: 'an_kpi_won_value', pi_app_an_rate: 'an_win_rate', pi_app_an_new: 'an_kpi_new_deals', pi_app_an_snapshot: 'an_snapshot', pi_app_an_wl: 'an_won_lost',
      pi_app_obj_name: 'set_object_name', pi_app_obj_add: 'obj_add_item', pi_app_obj_default: 'obj_listings_fallback', pi_app_obj_hint: 'obj_field_hint',
    };
    for (const s of ['kein_onboarding', ...F.PI_ENGINE]) MAP[`pi_app_st_${s}`] = `onb_status_${s}`;
    for (const [k, a] of Object.entries(MAP)) for (const lang of ['de', 'en']) assert.equal(dict[lang][k], app[lang][a], `${lang} ${k} = app ${a}`);
    for (const k of Object.keys(dict.de).filter(k => k.startsWith('pi_app_'))) assert.ok(k in MAP, `${k} is pinned`);
  });
  test('money as the app writes it: card values with fmtEUR (de-DE in both languages), analytics with fmtCurrency in the page\'s language', () => {
    const D = loadFns('public/js/deals.js', ['fmtEUR']);
    for (const n of [3200, 12400, 18000]) assert.equal(F.piEuro(n), D.fmtEUR(n));
    const A = loadFns('public/js/analytics.js', ['anLocale', 'anCurrency', 'fmtCurrency'], { state: { currentLang: 'de', analyticsData: null }, extra: "const AN_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];" });
    for (const lang of ['de', 'en']) { A.__set('currentLang', lang); for (const n of [950, 48300, 64100, 1250000]) assert.equal(F.piMoney(n, lang), A.fmtCurrency(n), `${lang} ${n}`); }
  });
});

describe('words', () => {
  const unesc = s => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  test('both languages hold the same keys; the markup equals the German value key for key, aria and placeholders included', () => {
    assert.deepEqual(Object.keys(dict.de), Object.keys(dict.en));
    let n = 0;
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) { assert.equal(unesc(m[2]), dict.de[m[1]], m[1]); n++; }
    for (const m of html.matchAll(/data-i18n-aria="([^"]+)" aria-label="([^"]*)"/g)) { assert.equal(unesc(m[2]), dict.de[m[1]], m[1]); n++; }
    for (const m of html.matchAll(/data-i18n-ph="([^"]+)" placeholder="([^"]*)"/g)) { assert.equal(unesc(m[2]), dict.de[m[1]], m[1]); n++; }
    assert.equal((html.match(/data-i18n-aria=/g) || []).length, [...html.matchAll(/data-i18n-aria="[^"]+" aria-label=/g)].length, 'every aria key sits right before its label');
    assert.ok(n > 120, `${n} words checked`);
  });
  test('no dead keys, no unknown keys', () => {
    const used = new Set([...html.matchAll(/data-i18n(?:-aria|-ph)?="([^"]+)"/g)].map(m => m[1]));
    const code = js.slice(js.indexOf('\n};', js.indexOf('const PI_I18N')));
    for (const m of code.matchAll(/'(pi_[a-z0-9_]*[a-z0-9])'/g)) used.add(m[1]);   // a literal ending in _ is a prefix (below)
    for (const m of code.matchAll(/'pi_app_st_' \+/g)) for (const s of ['kein_onboarding', ...F.PI_ENGINE]) used.add('pi_app_st_' + s);
    for (const m of code.matchAll(/key: '(pi_[a-z0-9_]+)'/g)) used.add(m[1]);
    for (const k of Object.keys(dict.de)) assert.ok(used.has(k), `${k} is used`);
    for (const k of used) assert.ok(k in dict.de, `${k} exists`);
  });
  test('impersonal German in the page\'s own copy, English where it differs', () => {
    const KEEP = /^(CRM|Deals|Deal|Onboarding|Name|Make|Zapier|n8n|Cal\.com|Notetaker|Google Meet|Online:|Phase|Webhook|\{n\} Min\.)$/;
    for (const k of PAGE_KEYS) {
      assert.doesNotMatch(dict.de[k], IMPERSONAL, `${k} is impersonal: ${dict.de[k]}`);
      if (!KEEP.test(dict.de[k])) assert.notEqual(dict.de[k], dict.en[k], `${k} is translated`);
    }
    for (const k of Object.keys(dict.de).filter(k => /^pi_s_/.test(k))) assert.doesNotMatch(dict.de[k], IMPERSONAL, k);
  });
  test('few words: the claim, the sub, each job, each tab line, the whole page', () => {
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      assert.ok(words(d.pi_h1) <= 6, `${lang} claim`); assert.ok(words(d.pi_sub) <= 18, `${lang} sub`);
      for (const n of [1, 2, 3, 4, 5]) { assert.ok(words(d[`pi_j${n}_t`]) <= 6, `${lang} job ${n} title`); assert.ok(words(d[`pi_j${n}_d`]) <= 16, `${lang} job ${n} line`); }
      for (const k of ['pi_day_tasks', 'pi_day_cal', 'pi_day_chat', 'pi_day_an', 'pi_day_list']) assert.ok(words(d[k]) <= 12, `${lang} ${k}`);
      for (const k of ['pi_jobs_t', 'pi_day_t', 'pi_c_t', 'pi_feed_t']) assert.ok(words(d[k]) <= 7, `${lang} ${k}`);
      const total = PAGE_KEYS.reduce((a, k) => a + words(d[k]), 0);
      assert.ok(total <= (lang === "de" ? 460 : 500), `${lang}: ${total} words of page copy (the screens are not counted)`);
    }
  });
  test('the claims audit on the page\'s own copy: no code words, no superlative, no price, no AI or compliance or speed promise, no "Upgrads sends", no chat links, no email sync', () => {
    const copy = PAGE_KEYS.flatMap(k => [dict.de[k], dict.en[k]]).join('\n');
    assert.doesNotMatch(copy, /\b(api|endpoint|payload|json|hmac|http|url|token|header|curl)\b/i);
    assert.doesNotMatch(copy, /(?<!\p{L})(beste[rsn]?|schnellste[rsn]?|einfachste[rsn]?|einzige[rsn]?|revolutionär|führend|marktführer|best|fastest|easiest|leading|revolutionary|world-class)(?!\p{L})/iu);
    assert.doesNotMatch(copy, /\b(preis|price|kostenlos|free|trial|testphase|rabatt|discount)\b|€|\$/i);
    assert.doesNotMatch(copy, /DSGVO|GDPR|KI\b|\bAI\b|künstliche Intelligenz|artificial intelligence|in Sekunden|in seconds|sofort|instantly|Echtzeit|real.?time|automatisch|automatic/i);
    assert.doesNotMatch(copy, /verschickt (das CRM|Upgrads)|Upgrads (sendet|verschickt|schickt)|CRM sends|Upgrads sends/i);
    assert.doesNotMatch(copy, /Team-Chat.*(Deal|Kontakt)|chat.*(deal|contact)|@/i);
    assert.doesNotMatch(copy, /Postfach|Gmail|mailbox|inbox|E-Mails? (lesen|synchron)/i, 'the mailbox only connects so far');
    assert.match(dict.de.pi_a3, /^Nein\. Die Einladung schickt Cal\.com/, 'the answer to "does Upgrads write to customers" is no');
  });
  test('none of the tells of generated copy: no em dash, no middle dot, no arrow glyph, no buzzwords, no "not just X but Y"; no caps labels', () => {
    const copy = Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + '\n' + body.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy, /—|·|→|←/);
    assert.doesNotMatch(copy, /seamless|effortless|nahtlos|mühelos|game.?changer|supercharge|unlock|elevate|empower|next.level/i);
    assert.doesNotMatch(copy, /not just|nicht nur .* sondern/i);
    assert.doesNotMatch(bare, /text-transform/);
  });
  test('the request: team@upgrads.de, the privacy and legal notices linked, the hidden trap, the server route with the mail fallback', () => {
    assert.doesNotMatch(html + js, /hello@/);
    assert.match(body, /href="https:\/\/upgrads\.de\/datenschutz"/); assert.match(body, /href="https:\/\/upgrads\.de\/impressum"/);
    assert.match(body, /<div class="pi-trap" aria-hidden="true"><label for="pi-website">Website<\/label><input id="pi-website" name="website" type="text" tabindex="-1" autocomplete="off"><\/div>/);
    assert.match(js, /const r = await fetch\('\/api\/landing\/status'\);\s*piReady = r\.ok && \(await r\.json\(\)\)\.ready === true;/);
    assert.match(js, /if \(piReady\) \{\s*try \{\s*const r = await fetch\('\/api\/landing\/ask'/);
    assert.match(js, /if \(!ok\) window\.location\.href = piAskMailto\(v\);/);
    assert.equal(F.piAskOk({ name: 'Jo', email: 'jo@firma.de' }), true);
    for (const v of [{ name: 'J', email: 'jo@firma.de' }, { name: 'Jo', email: 'jo@firma' }, { name: 'Jo', email: '' }]) assert.equal(F.piAskOk(v), false);
    const m = F.piAskMailto({ name: 'Jo Kraus', email: 'jo@firma.de', company: 'Firma GmbH' });
    assert.match(m, /^mailto:team@upgrads\.de\?subject=Anfrage%20zu%20Upgrads%20CRM&body=/);
    assert.equal(decodeURIComponent(m.split('body=')[1]), 'Name: Jo Kraus\nE-Mail: jo@firma.de\nFirma: Firma GmbH');
    F.__set('piLang', 'en'); assert.equal(F.piWord('pi_h1'), 'The CRM that pitches in.'); assert.equal(F.piWord('nope'), 'nope'); F.__set('piLang', 'de');
  });
});

// ── the stylesheet ──────────────────────────────────────────────────────────────────────────────────────────────
function parseCss(src) {
  const rules = []; let i = 0; const stack = [];
  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  while (i < src.length) {
    skipWs(); if (i >= src.length) break;
    if (src[i] === '}') { stack.pop(); i++; continue; }
    const open = src.indexOf('{', i); const selector = src.slice(i, open).trim();
    if (/^@(media|keyframes|supports)/.test(selector)) { stack.push(selector); i = open + 1; continue; }
    let depth = 0, close = open;
    for (let j = open; j < src.length; j++) { if (src[j] === '{') depth++; if (src[j] === '}') { depth--; if (depth === 0) { close = j; break; } } }
    const inner = src.slice(open + 1, close);
    if (/\{/.test(inner)) { stack.push(selector); i = open + 1; continue; }   // a keyframe block's steps
    const decls = inner.split(/;(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(d => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });
    rules.push({ selector, decls, in: stack.join(' > ') });
    i = close + 1;
  }
  return rules;
}
const rules = parseCss(bare);
const classesIn = s => [...s.matchAll(/\.((?:pi|is)-[a-zA-Z0-9-]+)/g)].map(m => m[1]);
const cssClasses = new Set(rules.flatMap(r => r.selector.startsWith('@') || r.in.includes('@keyframes') ? [] : classesIn(r.selector)));
const usedClasses = new Set();
for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/'((?:pi|is)-[a-zA-Z0-9-]+)'/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/'((?:pi|is)-[a-z-]+)' \+/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/`([^`]*)`/g)) for (const c of m[1].matchAll(/(?<![\w-])((?:pi|is)-[a-z-]+)(?:\$\{[^}]+\})?/g)) usedClasses.add(c[1]);
for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([a-z-]+)'/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/(?:'| )(pi-[a-z]+(?:-[a-z]+)*)(?: |')/g)) usedClasses.add(m[1]);
for (const m of js.matchAll(/'([^'\n]*)'/g)) for (const c of m[1].split(/\s+/)) if (/^(pi|is)-[a-z0-9-]+$/.test(c)) usedClasses.add(c);
// classes the script builds from a prefix and a value (`pi-urg-${c.urg}`, `pi-av-${who}`, …): the prefix stands for them
const builtPrefixes = [...js.matchAll(/(?<![\w-])((?:pi|is)-[a-z-]*-)\$\{/g)].map(m => m[1]);
const isBuilt = c => builtPrefixes.some(p => c.startsWith(p));

describe('stylesheet discipline and the audit', () => {
  const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128]);
  const PROPS = new Set(('position top right bottom left inset z-index display flex flex-direction flex-wrap align-items align-self align-content justify-content justify-self gap row-gap column-gap grid-template-columns grid-template-rows grid-template-areas grid-area grid-column grid-row place-items order width min-width max-width height min-height max-height margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-top border-bottom border-right border-left border-left-color border-top-color border-color border-collapse border-radius background color font-family font-size font-weight font-style font-display font-feature-settings font-variant-numeric font-variation-settings src line-height letter-spacing text-align text-wrap text-decoration text-decoration-color text-underline-offset text-overflow white-space writing-mode list-style overflow opacity transform transition animation animation-delay box-shadow outline outline-offset cursor content scroll-behavior touch-action user-select pointer-events isolation backdrop-filter scroll-margin-top fill stroke stroke-width stroke-linecap stroke-linejoin flex-grow flex-basis').split(' '));
  test('every class in the stylesheet is used by the page, and every class the markup uses has a rule', () => {
    for (const c of cssClasses) assert.ok(usedClasses.has(c) || isBuilt(c), `.${c} is used`);
    for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (/^(pi|is)-/.test(c) && c !== 'pi-root') assert.ok(cssClasses.has(c), `.${c} has a rule`);
  });
  test('prefix, hex only as the page\'s named tokens, the few gradients, no !important, a short z-index ladder', () => {
    for (const r of rules) if (!r.selector.startsWith('@') && !r.in.includes('@keyframes')) assert.ok(/\.pi-|body\.pi|html\.pi-root|div\.pi-card/.test(r.selector), `scoped: ${r.selector}`);
    for (const r of rules) for (const [p, v] of r.decls) if (/#[0-9a-f]{3,8}\b/i.test(v)) assert.ok(r.selector === 'html.pi-root' && p.startsWith('--pi-'), `hex only as a token: ${r.selector} ${p}`);
    assert.equal((bare.match(/gradient\(/g) || []).length, 4, 'the hero\'s two lights, the request\'s one, the week\'s hour lines');
    assert.doesNotMatch(bare, /!important/);
    const z = rules.flatMap(r => r.decls.filter(([p]) => p === 'z-index').map(([, v]) => Number(v)));
    assert.deepEqual([...new Set(z)].sort((a, b) => a - b), [-1, 2, 3, 4, 5, 6]);
  });
  test('the job colours mean the job: --pi-c is set only by .pi-c-1 … .pi-c-5', () => {
    const sets = rules.filter(r => r.decls.some(([p]) => p === '--pi-c')).map(r => r.selector);
    assert.deepEqual(sets, ['.pi-c-1', '.pi-c-2', '.pi-c-3', '.pi-c-4', '.pi-c-5']);
    assert.deepEqual(rules.filter(r => r.decls.some(([p]) => p === '--pi-st')).map(r => r.selector), ['.pi-st-0', '.pi-st-1', '.pi-st-2', '.pi-st-3', '.pi-st-4']);
  });
  test('every custom property resolves; every property name is real; no declaration repeated; no selector declared twice at the same level', () => {
    const defined = new Set([...(style + bare).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    for (const k of ['--pi-share', '--pi-rate', '--pi-at']) { assert.ok(js.includes(`'${k}'`), `${k} is set by the script`); defined.add(k); }
    for (const m of bare.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} resolves`);
    const seen = new Set();
    for (const r of rules) {
      if (r.in.includes('@keyframes')) continue;
      const props = r.decls.map(([p]) => p);
      for (const p of props) assert.ok(PROPS.has(p) || p.startsWith('--'), `${r.selector}: "${p}" is a property`);
      assert.equal(new Set(props).size, props.length, `${r.selector}: no repeated declaration`);
      if (r.selector === '@font-face') continue;
      const key = r.in + ' | ' + r.selector; assert.ok(!seen.has(key), `${key} declared once`); seen.add(key);
    }
  });
  test('spacing on the scale; a block\'s own padding never wipes .pi-wrap\'s gutter; breakpoints descending; the app\'s input rules outranked', () => {
    for (const r of rules) for (const [p, v] of r.decls) if (/^(margin|padding|gap|row-gap|column-gap)/.test(p)) {
      let flat = v; while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '~');
      for (const tok of flat.split(/\s+/)) {
        if (/^(0|auto|none|-?[a-z-]+~|[\d.]+%)$/.test(tok)) continue;
        const px = tok.match(/^(-?\d+)px$/); assert.ok(px && SCALE.has(Math.abs(+px[1])), `${r.selector}: ${p}: ${v} on the scale`);
      }
    }
    const wrapped = new Set([...html.matchAll(/class="pi-wrap ([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
    for (const r of rules) if (classesIn(r.selector).some(c => wrapped.has(c))) for (const [p] of r.decls) assert.notEqual(p, 'padding', `${r.selector} sets "padding" and would wipe the gutter`);
    assert.deepEqual([...bare.matchAll(/@media \(max-width: (\d+)px\)/g)].map(m => +m[1]), [1100, 900, 600, 420]);
    for (const sel of ['.pi-ask .pi-ask-i', '.pi-quick-l .pi-quick', '.pi-chat-f .pi-chat-in', '.pi-set .pi-set-in']) assert.ok(rules.some(r => r.selector === sel), `${sel} (two classes beat input[type="text"])`);
    assert.match(style, /^\[hidden\] \{ display: none !important; \}$/m, 'the panels, the menu and the answers swap by the attribute');
  });
  test('motion: every animation inside prefers-reduced-motion: no-preference; only the call\'s waveform and dot loop; nothing follows the pointer or tilts', () => {
    const motion = bare.slice(bare.indexOf('@media (prefers-reduced-motion: no-preference)'));
    const outside = bare.slice(0, bare.indexOf('@media (prefers-reduced-motion: no-preference)'));
    assert.doesNotMatch(outside, /animation(-delay)?:/);
    assert.deepEqual([...bare.matchAll(/@keyframes ([a-z-]+)/g)].map(m => m[1]), ['pi-rise', 'pi-drop', 'pi-pop', 'pi-slide', 'pi-in', 'pi-wave', 'pi-pulse']);
    assert.deepEqual([...motion.matchAll(/([.\w-]+(?: [.\w-]+)*) \{ animation: [^;]*infinite/g)].map(m => m[1]), ['.pi-wave i', '.pi-live-dot']);
    assert.doesNotMatch(bare, /rotate|perspective|skew/);
    assert.doesNotMatch(js, /mousemove|deviceorientation|mouseenter/);
    assert.match(js, /if \(piStill \|\| !from \|\| !to \|\| typeof from\.animate !== 'function'\) return;/, 'the packet flies only when motion is welcome');
  });
  test('the app\'s heading and link rules are outranked on the dark ground', () => {
    assert.match(style, /^h1, h2, h3, h4 \{[^}]*color: var\(--ink\); \}$/m);
    for (const sel of ['.pi-h1', '.pi-h2', '.pi-a', '.pi-feed-t']) assert.match(bare, new RegExp(`\\${sel} \\{[^}]*color: var\\(--pi-ink\\)`), sel);
    assert.match(bare, /\.pi-a:hover \{[^}]*text-decoration: none; \}/);
  });
});

describe('the script', () => {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  test('every id it touches exists; the app\'s language key only on a pick; the start on DOMContentLoaded; strict; no innerHTML; no t( call', () => {
    for (const m of js.matchAll(/piId\('([^']+)'\)/g)) assert.ok(ids.has(m[1]), `#${m[1]} exists`);
    assert.match(js, /if \(save\) \{ try \{ localStorage\.setItem\('lang', piLang\); \}/);
    assert.match(js.trim(), /document\.addEventListener\('DOMContentLoaded', piInit\);$/);
    assert.match(js, /^'use strict';$/m);
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
    assert.doesNotMatch(js, /(?<![\w.$])t\(|(?<![\w.$])tf\(/, 'the app\'s i18n sweep reads every t( in public/js');
    assert.doesNotMatch(js, /\.map\(piCardEl\)/, 'map would pass the index as "still" and freeze every card but the first');
    assert.match(js, /piPlaying = true; piCancel\('play'\); piRenderJobs\(\);/, 'the play button is disabled while it plays');
  });
  test('what the visitor types is drawn as text only and bounded (task 120, chat 2000, list 40, request 120/254/120)', () => {
    assert.match(js, /const text = piClean\(a\.text, 120\);/); assert.match(js, /const text = piClean\(a\.text, 2000\);/); assert.match(js, /list: piClean\(a\.name, 40\)/);
    assert.match(body, /id="pi-quick" type="text" maxlength="120"/); assert.match(body, /id="pi-chat-in" type="text" maxlength="2000"/); assert.match(body, /id="pi-list-in" type="text" maxlength="40"/);
    assert.match(js, /function piEl\(tag, cls, text\) \{ const el = document\.createElement\(tag\); if \(cls\) el\.className = cls; if \(text != null\) el\.textContent = text; return el; \}/);
  });
});
