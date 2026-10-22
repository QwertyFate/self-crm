// CLIENT (static + pure-function) tests for the second landing page at /landingpagetwo (LOGIN_LANDING_CHANGES Part 46,
// 2026-10-22): "Bei anderen CRMs ein Zusatz. Bei Upgrads eingebaut." The comparison is the first screen: a split, grey
// for other CRM platforms, navy for Upgrads, four rows (enquiries, meeting notes, your own list, after the win) that
// open their detail below. The comparison and its sources: Part 45.
// Pinned: the route and the document; Geologica (and none of the earlier pages' faces); nothing of the first page or
// the earlier page twos; the rows and panels and the pure choice (vsInitial, vsAct, vsTitle); the comparison told
// honestly (the source on the page, in every panel and in the questions; no vendor named; the others' side hedged);
// every claim about Upgrads against the code; the app's words against TRANSLATIONS; the words audits; the request;
// the stylesheet audit; the script.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');
const nt     = require(path.join(ROOT, 'utils', 'notetaker.js'));

const server = read('server.js');
const html   = read('public/landingpagetwo.html');
const css    = read('public/landing-two.css');
const js     = read('public/js/landing-two.js');
const style  = read('public/style.css');
const dict   = new Function(sliceConst('public/js/landing-two.js', 'VS_I18N').replace(/^[^{]*/, 'return '))();
const app    = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const TOPICS = new Function(sliceConst('public/js/landing-two.js', 'VS_TOPICS').replace(/^[^[]*/, 'return '))();
const head   = html.slice(0, html.indexOf('<body'));
const body   = html.slice(html.indexOf('<body'));
const bare   = css.replace(/\/\*[\s\S]*?\*\//g, '');
const IMPERSONAL = /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/;
const words  = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const F = loadFns('public/js/landing-two.js', ['vsWord', 'vsFill', 'vsInitial', 'vsAct', 'vsTitle'], { state: { vsLang: 'de' }, extra: [sliceConst('public/js/landing-two.js', 'VS_I18N'), sliceConst('public/js/landing-two.js', 'VS_TOPICS')].join('\n') });
const go = (...acts) => acts.reduce((s, a) => F.vsAct(s, a), F.vsInitial());
const PAGE_KEYS = Object.keys(dict.de).filter(k => !/^vs_(app_|d_(list|city|rooms|n_)|by_|n_head$)/.test(k));
const OTHERS = k => /^vs_o_(leads|notes|list|handover)$|^vs_(leads|notes|list|handover)_o\d$/.test(k);
const EARLIER_HOOKS = ['Das CRM, das den Kleinkram übernimmt.', 'Ein CRM, kein Bastelprojekt.', 'Wer hat das alles eingetippt?', 'Erst Probe fahren. Dann reden.', 'Selbst zum Lead werden.', 'Vom ersten Formular bis zum fertigen Onboarding.'];
const VENDORS = /\b(hubspot|pipedrive|salesforce|zoho|onoffice|propstack|attio|twenty|monday|close\.com|freshsales|copper|keap|insightly|nethunt|zeeg|fireflies|tl;dv|tldv|claap|read\.ai|meetgeek|nova)\b/i;

describe('route and document', () => {
  test('/landingpagetwo serves public/landingpagetwo.html, after /landingpage and before the SPA catch-all', () => {
    assert.match(server, /app\.get\('\/landingpagetwo', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'public', 'landingpagetwo\.html'\)\)\);/);
    const one = server.indexOf("app.get('/landingpage',"), two = server.indexOf("app.get('/landingpagetwo',"), all = server.indexOf("app.get('*'");
    assert.ok(one > 0 && two > one && all > two);
  });
  test('the head: German, light, the root class, the faces preloaded, the app stylesheet first, one deferred script; no inline style or script', () => {
    assert.match(html, /^<!DOCTYPE html>\n<html lang="de" class="vs-root">/);
    assert.match(head, /<meta name="color-scheme" content="light">/);
    for (const f of ['Geologica', 'inter-latin-wght']) assert.match(head, new RegExp(`<link rel="preload" href="/fonts/${f}\\.woff2" as="font" type="font/woff2" crossorigin>`));
    assert.match(head, /<link rel="stylesheet" href="\/style\.css">\s*<link rel="stylesheet" href="\/landing-two\.css">\s*<script src="\/js\/landing-two\.js" defer><\/script>/);
    assert.equal((html.match(/<script\b/g) || []).length, 1);
    assert.match(body, /^<body class="vs">\n<header class="vs-head">/);
    assert.equal((body.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(html, /\sstyle="|<style\b|on(click|load|input|submit)="/);
  });
  test('one h1 with the whole claim for every reader; the two big halves are its picture (hidden from screen readers)', () => {
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(body, /<h1 class="vs-sr" id="vs-h1" data-i18n="vs_h1">Bei anderen CRMs ein Zusatz, bei Upgrads eingebaut\.<\/h1>/);
    assert.match(body, /<div class="vs-cell vs-o vs-big-cell" aria-hidden="true">/); assert.match(body, /<div class="vs-cell vs-u vs-big-cell" aria-hidden="true">/);
    assert.match(bare, /\.vs-sr \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\); white-space: nowrap; \}/);
  });
  test('Geologica is self-hosted with its licence, a face no earlier page used; the earlier page twos\' faces are gone', () => {
    assert.ok(fs.statSync(path.join(ROOT, 'public/fonts/Geologica.woff2')).size > 20000);
    assert.match(read('public/fonts/OFL-Geologica.txt'), /SIL Open Font License, Version 1\.1/);
    for (const f of ['RethinkSans', 'SourceSerif4', 'RedHatDisplay', 'RedHatText', 'BricolageGrotesque']) assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/${f}.woff2`)), `${f} gone`);
    for (const f of ['OFL-RedHat.txt', 'OFL-SourceSerif4.txt', 'OFL-RethinkSans.txt', 'OFL-BricolageGrotesque.txt']) assert.ok(!fs.existsSync(path.join(ROOT, `public/fonts/${f}`)), `${f} gone`);
    assert.doesNotMatch(read('tests/client/landing-page.test.js'), /Geologica/);
    assert.deepEqual([...bare.matchAll(/font-family: "([^"]+)"/g)].map(m => m[1]), ['Geologica']);
    assert.match(bare, /\.vs-mini \{[^}]*font-family: var\(--font\); font-feature-settings: "cv11", "ss01";/, 'the screens speak the app\'s Inter');
  });
});

describe('nothing of the first page, nor of the earlier page twos', () => {
  test('not their prefixes, dictionaries, faces or game', () => {
    assert.doesNotMatch(html + css + js, /(?<![\w-])(mo|cv|rq|pf|up|wt|bk)-[a-z]|MO_I18N|CV_I18N|RQ_I18N|PF_I18N|UP_I18N|WT_I18N|BK_I18N|Figtree|Shantell|Rethink|Source Serif|Red Hat|Bricolage|Recursive|Mona Sans|break-game|landing\.css|js\/landing\.js/);
  });
  test('not their hooks', () => {
    for (const h of EARLIER_HOOKS) for (const lang of ['de', 'en']) assert.notEqual(dict[lang].vs_h1, h);
  });
});

describe('the comparison: four rows, four panels', () => {
  test('the four topics in the order a deal lives; each row pairs the others\' side with Upgrads\' side and says "eingebaut"; the first is open', () => {
    assert.deepEqual(TOPICS, ['leads', 'notes', 'list', 'handover']);
    TOPICS.forEach((t, i) => {
      const row = html.slice(html.indexOf(`data-topic="${t}"`), html.indexOf('</button>', html.indexOf(`data-topic="${t}"`)));
      assert.match(html, new RegExp(`<button type="button" class="vs-row" data-topic="${t}" aria-pressed="${i === 0}" aria-controls="vs-detail">`), t);
      assert.match(row, new RegExp(`<span class="vs-cell vs-o"><span class="vs-topic" data-i18n="vs_t_${t}">[^<]+</span> <span class="vs-what" data-i18n="vs_o_${t}">`), `${t} others`);
      assert.match(row, new RegExp(`<span class="vs-cell vs-u"><span class="vs-topic" data-i18n="vs_t_${t}">[^<]+</span> <span class="vs-what" data-i18n="vs_u_${t}">[^<]+</span> <span class="vs-yes" data-i18n="vs_yes">eingebaut</span>`), `${t} Upgrads`);
      assert.match(html, new RegExp(`<div class="vs-panel" data-panel="${t}"${i === 0 ? '' : ' hidden'}>`), `${t} panel`);
    });
  });
  test('each panel: the others\' card with the source, Upgrads\' card with its points and its screen, "Nächster Unterschied"', () => {
    for (const t of TOPICS) {
      const at = html.indexOf(`data-panel="${t}"`), end = html.indexOf('class="vs-panel-next"', at);
      const p = html.slice(at, end);
      assert.match(p, /<div class="vs-card vs-card-o">\s*<p class="vs-card-h" data-i18n="vs_d_o">Übliche CRM-Plattformen<\/p>/);
      assert.match(p, /<p class="vs-card-src" data-i18n="vs_source">/, `${t} source`);
      assert.match(p, /<div class="vs-card vs-card-u">[\s\S]*<div class="vs-mini" aria-hidden="true">/, `${t} screen`);
      assert.ok((p.match(new RegExp(`data-i18n="vs_${t}_o\\d"`, 'g')) || []).length >= 2, `${t}: two points for the others`);
      assert.ok((p.match(new RegExp(`data-i18n="vs_${t}_u\\d"`, 'g')) || []).length >= 2, `${t}: Upgrads' points`);
    }
    assert.equal((html.match(/<button type="button" class="vs-link" data-next data-i18n="vs_next">Nächster Unterschied<\/button>/g) || []).length, 4);
  });
  test('the choice: the first open; a row opens itself; "next" walks round; unknown changes nothing; the title follows', () => {
    assert.deepEqual(F.vsInitial(), { topic: 'leads' });
    assert.deepEqual(go({ t: 'pick', id: 'list' }), { topic: 'list' });
    assert.deepEqual(go({ t: 'next' }, { t: 'next' }, { t: 'next' }), { topic: 'handover' });
    assert.deepEqual(go({ t: 'pick', id: 'handover' }, { t: 'next' }), { topic: 'leads' }, 'round');
    const s = F.vsInitial(); assert.equal(F.vsAct(s, { t: 'pick', id: 'nothing' }), s);
    assert.equal(F.vsTitle(F.vsInitial()), 'Anfragen im Vergleich');
    assert.match(body, /<h2 class="vs-h2" id="vs-detail-t">Anfragen im Vergleich<\/h2>/, 'the markup shows the first title');
    F.__set('vsLang', 'en'); assert.equal(F.vsTitle(go({ t: 'pick', id: 'notes' })), 'Meeting notes, compared'); F.__set('vsLang', 'de');
  });
});

describe('the comparison, told honestly', () => {
  test('the source with its month: under the split, in every panel, in the questions', () => {
    assert.match(dict.de.vs_source, /Hilfe- und Preisseiten großer Anbieter, Stand Oktober 2026/);
    assert.match(dict.en.vs_source, /help and pricing pages of large vendors, as of October 2026/);
    assert.equal((html.match(/data-i18n="vs_source"/g) || []).length, 5);
    assert.match(dict.de.vs_q1_a, /Stand Oktober 2026/);
  });
  test('no vendor is named anywhere: not in the words, the markup, the stylesheet or the script; the questions say why', () => {
    assert.doesNotMatch(Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + html + css + js.replace(/\/\/[^\n]*/g, ''), VENDORS);
    assert.match(dict.de.vs_q2_q, /Namen/);
  });
  test('every sentence about the others is hedged (oft, meist, manche, oder, wo es); Upgrads\' side never uses a price word', () => {
    for (const k of Object.keys(dict.de).filter(OTHERS)) assert.match(dict.de[k], /\b(oft|meist|[Mm]anche|oder|Wo es)\b/, k);
    assert.doesNotMatch(Object.values(dict.de).concat(Object.values(dict.en)).join('\n'), /kostenlos|inklusive|gratis|free of charge|included in the price|no extra cost/i);
  });
});

describe('every claim about Upgrads, against the code that does it', () => {
  const integrations = read('routes/integrations.js');
  test('enquiries: one address per workspace, the field mapping, a contact (a known email updated), a deal if wanted, the log with what was missing', () => {
    assert.match(integrations, /router\.post\('\/receive\/:key'/);
    assert.match(integrations, /SELECT id, name, email, phone, company, contact_type FROM contacts WHERE workspace_id=\$1 AND email=\$2/);
    assert.match(integrations, /UPDATE contacts SET name=\$1, phone=\$2, company=\$3/);
    assert.match(integrations, /if \(wh\.create_deal && wh\.pipeline_id\)/);
    assert.match(integrations, /INSERT INTO webhook_logs/);
    assert.match(integrations, /not found or empty in payload/);
  });
  test('meeting notes: one tick when booking, Google Meet only; the note lands on the deal signed "Notetaker"; its headings follow the meeting\'s language', () => {
    assert.match(read('public/js/detail-views.js'), /record: !!\(B\.record && B\.nt === 'ok' && isMeet\(place\)\)/);
    assert.match(read('routes/activities.js'), /WHEN a\.source = 'notetaker' THEN 'Notetaker'/);
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      const written = nt.resultNote({ event: 'recording.completed', notes: { title: d.vs_d_n_title, language: lang, summary: d.vs_d_n_sum, action_items: [lang === 'de' ? { task: 'Angebot schicken', owner: 'Anna', due: 'Freitag' } : { task: 'Send the proposal', owner: 'Anna', due: 'Friday' }] } }, lang).content;
      assert.equal(written, `${d.vs_d_n_title}\n\n${d.vs_d_n_sum}\n\n${d.vs_n_head}\n• ${d.vs_d_n_a1}`, lang);
    }
    assert.equal(dict.de.vs_by_nt, app.de.dv_by_name.replace('{name}', 'Notetaker'));
  });
  test('your own list: a name the workspace sets, its own fields, linked to deals and to contacts', () => {
    assert.match(read('routes/workspace.js'), /UPDATE workspaces SET object_name=\$1 WHERE id=\$2/);
    const db = read('db.js');
    for (const t of ['object_fields', 'deal_objects', 'object_contacts']) assert.match(db, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`), t);
  });
  test('after the win: the Engine\'s statuses the page names, never overwriting the team\'s data', () => {
    const api = read('routes/engine-api.js');
    for (const st of ['formular_versendet', 'formular_ausgefuellt', 'briefing_fertig']) assert.match(api, new RegExp(`'${st}'`));
    assert.match(api, /abweichende Stammdaten erkannt – nicht überschrieben/);
  });
  test('left out on purpose and the everyday tools: nothing sent by the CRM, no marketplace, invite codes; undo, the clash warning', () => {
    const dv = read('public/js/detail-views.js'), core = read('public/js/core.js');
    assert.match(dv + core, /tel:/); assert.match(dv + core, /mailto:/); assert.match(core, /wa\.me/);
    assert.doesNotMatch(read('package.json'), /twilio|whatsapp-web|sendgrid/i);
    assert.doesNotMatch(core + read('server.js'), /marketplace|app store/i, 'no marketplace in the app');
    assert.match(read('routes/invites.js'), /role/);
    for (const k of ['undo', 'cal_book_conflict']) assert.ok(app.de[k], k);
  });
});

describe('the product speaks the app\'s own words', () => {
  test('each vs_app_* word equals the app\'s TRANSLATIONS value, in both languages', () => {
    const MAP = { vs_app_recent: 'intg_tab_activity', vs_app_received: 'intg_log_success', vs_app_rejected: 'intg_log_error', vs_app_now: 'ago_now', vs_app_note: 'act_note', vs_app_deals: 'nav_deals', vs_app_linked: 'obj_linked', vs_app_onboarding: 'nav_onboarding', vs_app_customer: 'onb_col_customer', vs_app_status: 'onb_col_status', vs_app_delivery: 'onb_col_delivery', vs_app_form_done: 'onb_status_formular_ausgefuellt', vs_app_briefing: 'onb_status_briefing_fertig', vs_app_delivered: 'engine_status_success' };
    for (const [k, a] of Object.entries(MAP)) for (const lang of ['de', 'en']) assert.equal(dict[lang][k], app[lang][a], `${lang} ${k} = app ${a}`);
    for (const k of Object.keys(dict.de).filter(k => k.startsWith('vs_app_'))) assert.ok(k in MAP, `${k} is pinned`);
  });
});

describe('words', () => {
  test('both languages hold the same keys; the markup equals the German value key for key, aria included', () => {
    assert.deepEqual(Object.keys(dict.de), Object.keys(dict.en));
    const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    let n = 0;
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) { assert.equal(unesc(m[2]), dict.de[m[1]], m[1]); n++; }
    for (const m of html.matchAll(/data-i18n-aria="([^"]+)" aria-label="([^"]*)"/g)) { assert.equal(unesc(m[2]), dict.de[m[1]], m[1]); n++; }
    assert.ok(n > 100, `${n} words checked`);
  });
  test('no dead keys, no unknown keys (the topic titles counted by their family)', () => {
    const used = new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(m => m[1]));
    const code = js.slice(js.indexOf('\n};'));
    for (const m of code.matchAll(/'(vs_[a-z0-9_]+)'/g)) used.add(m[1]);
    for (const k of Object.keys(dict.de)) assert.ok(used.has(k), `${k} is used`);
    for (const k of used) if (!k.endsWith('_')) assert.ok(k in dict.de, `${k} exists`);
  });
  test('impersonal German, English where it differs', () => {
    const KEEP = /^(CRM|Deals|Onboarding|Webhook|Name|Upgrads)$/;
    for (const [k, v] of Object.entries(dict.de)) {
      assert.doesNotMatch(v, IMPERSONAL, `${k} is impersonal: ${v}`);
      if (!KEEP.test(v)) assert.notEqual(v, dict.en[k], `${k} is translated`);
    }
    assert.doesNotMatch(body.replace(/<[^>]+>/g, ' '), IMPERSONAL);
  });
  test('short: the claim, the big halves, the intro, the page copy as a whole', () => {
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      assert.ok(words(d.vs_h1) <= 9, `${lang} claim`); assert.ok(words(d.vs_o_big) <= 2 && words(d.vs_u_big) <= 2, `${lang} halves`); assert.ok(words(d.vs_intro) <= 30, `${lang} intro`);
      const total = PAGE_KEYS.reduce((a, k) => a + words(d[k]), 0);
      assert.ok(total <= 900, `${lang}: ${total} words of page copy`);
    }
  });
  test('the claims audit on the page\'s own copy: no code words, no superlative, no price, no AI or compliance or speed promise, no "the CRM sends", no chat links', () => {
    const copy = PAGE_KEYS.flatMap(k => [dict.de[k], dict.en[k]]).join('\n') + '\n' + body.replace(/<div class="vs-mini"[\s\S]*?<\/div>\s*<\/div>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy, /\b(webhook|api|endpoint|payload|json|hmac|http|url|token|header|curl)\b/i);
    assert.doesNotMatch(copy, /(?<!\p{L})(beste[rsn]?|schnellste[rsn]?|einfachste[rsn]?|einzige[rsn]?|revolutionär|führend|marktführer|best|fastest|easiest|leading|revolutionary|world-class)(?!\p{L})/iu);
    assert.doesNotMatch(copy, /\b(preis|price|kostenlos|free|trial|testphase|rabatt|discount)\b|€|\$/i);
    assert.doesNotMatch(copy, /DSGVO|GDPR|KI\b|\bAI\b|künstliche Intelligenz|artificial intelligence|in Sekunden|in seconds|sofort benachrichtigt|instantly notified|Echtzeit|real.?time|automatisch/i);
    assert.doesNotMatch(copy, /verschickt (das CRM|Upgrads)|Upgrads (sendet|verschickt)|CRM sends|Upgrads sends/i);
    assert.doesNotMatch(copy, /Team-Chat.*(Deal|Kontakt)|chat.*(deal|contact)/i);
  });
  test('none of the tells of generated copy: no em dash, no middle dot, no arrow glyph, no buzzwords, no "not just X but Y"', () => {
    const copy = Object.values(dict.de).concat(Object.values(dict.en)).join('\n') + '\n' + body.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(copy, /—|·|→|←/);
    assert.doesNotMatch(copy, /seamless|effortless|nahtlos|mühelos|game.?changer|supercharge|unlock|elevate|empower|next.level/i);
    assert.doesNotMatch(copy, /not just|nicht nur .* sondern/i);
  });
  test('the request: team@upgrads.de, the privacy notice and the legal notice linked, the hidden trap, the server route with the mail fallback', () => {
    assert.doesNotMatch(html + js, /hello@/);
    assert.match(body, /href="https:\/\/upgrads\.de\/datenschutz"/); assert.match(body, /href="https:\/\/upgrads\.de\/impressum"/);
    assert.match(body, /<div class="vs-trap" aria-hidden="true"><label for="vs-website">Website<\/label><input id="vs-website" name="website" type="text" tabindex="-1" autocomplete="off"><\/div>/);
    assert.match(js, /const r = await fetch\('\/api\/landing\/status'\);\s*vsReady = r\.ok && \(await r\.json\(\)\)\.ready === true;/);
    assert.match(js, /if \(vsReady\) \{\s*try \{\s*const r = await fetch\('\/api\/landing\/ask'/);
    assert.match(js, /if \(!ok\) window\.location\.href = vsAskMailto\(v\);/);
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
    const close = src.indexOf('}', open);
    const decls = src.slice(open + 1, close).split(/;(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(d => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });
    rules.push({ selector, decls, in: stack.join(' > ') });
    i = close + 1;
  }
  return rules;
}
const rules = parseCss(bare);
const classesIn = s => [...s.matchAll(/\.((?:vs|is)-[a-z0-9-]+)/g)].map(m => m[1]);
const cssClasses = new Set(rules.flatMap(r => r.selector.startsWith('@') || r.in.includes('@keyframes') ? [] : classesIn(r.selector)));
const usedClasses = new Set();
for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) usedClasses.add(m[1]);

describe('stylesheet discipline and the audit', () => {
  const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 112, 128]);
  const PROPS = new Set(('position top right bottom left inset display flex flex-direction flex-wrap align-items align-self align-content justify-content justify-self gap row-gap column-gap grid-template-columns grid-template-rows grid-column place-items order width min-width max-width height min-height max-height margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-top border-bottom border-color border-radius background color font-family font-size font-weight font-style font-display font-feature-settings font-variant-numeric src line-height letter-spacing text-align text-wrap text-decoration text-decoration-color text-underline-offset white-space list-style overflow clip-path opacity transform transition animation box-shadow outline outline-offset cursor content scroll-behavior').split(' '));
  test('every class in the stylesheet is used by the markup or the script, and every class they use has a rule', () => {
    for (const c of cssClasses) assert.ok(usedClasses.has(c), `.${c} is used`);
    for (const c of usedClasses) if (/^(vs|is)-/.test(c) && c !== 'vs-root') assert.ok(cssClasses.has(c), `.${c} has a rule`);
  });
  test('prefix, hex only as the page\'s named tokens, no gradient, one keyframe, no caps, no tilt, no !important, no z-index', () => {
    for (const r of rules) if (!r.selector.startsWith('@') && !r.in.includes('@keyframes')) assert.ok(/\.vs-|body\.vs|html\.vs-root/.test(r.selector), `scoped: ${r.selector}`);
    for (const r of rules) for (const [p, v] of r.decls) if (/#[0-9a-f]{3,8}\b/i.test(v)) assert.ok(r.selector === 'html.vs-root' && p.startsWith('--vs-'), `hex only as a token: ${r.selector} ${p}`);
    const hexes = rules.find(r => r.selector === 'html.vs-root' && !r.in).decls.filter(([, v]) => /^#/.test(v)).map(([p]) => p);
    assert.deepEqual(hexes, ['--vs-ground', '--vs-paper', '--vs-ink', '--vs-mute', '--vs-line', '--vs-o', '--vs-o-2', '--vs-o-ink', '--vs-o-line']);
    assert.equal((bare.match(/gradient\(/g) || []).length, 0);
    assert.deepEqual([...bare.matchAll(/@keyframes ([a-z-]+)/g)].map(m => m[1]), ['vs-in']);
    assert.doesNotMatch(bare, /text-transform|!important|rotate|perspective|z-index/);
    assert.doesNotMatch(js, /mousemove|deviceorientation|rotate|perspective/);
  });
  test('the grey means only "the others": the split\'s left half, its rows, the others\' card', () => {
    const uses = rules.filter(r => r.decls.some(([p, v]) => !p.startsWith('--vs-o') && /var\(--vs-o(-2|-ink|-line)?\)/.test(v))).map(r => r.selector);
    for (const sel of uses) assert.match(sel, /\.vs-o\b|vs-card-o/, sel);
    assert.ok(uses.length >= 4);
  });
  test('every custom property resolves; every property name is real; no declaration repeated; no selector declared twice at the same level', () => {
    const defined = new Set([...(style + bare).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
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
  test('spacing on the scale; a block\'s own padding never wipes .vs-wrap\'s gutter; breakpoints descending, reduced motion last; the app\'s input rules outranked', () => {
    for (const r of rules) for (const [p, v] of r.decls) if (/^(margin|padding|gap|row-gap|column-gap)/.test(p)) {
      let flat = v; while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '~');
      for (const tok of flat.split(/\s+/)) {
        if (/^(0|auto|none|-?[a-z-]+~|[\d.]+%)$/.test(tok)) continue;
        const px = tok.match(/^(-?\d+)px$/); assert.ok(px && SCALE.has(Math.abs(+px[1])), `${r.selector}: ${p}: ${v} on the scale`);
      }
    }
    const wrapped = new Set([...html.matchAll(/class="vs-wrap ([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
    for (const r of rules) if (classesIn(r.selector).some(c => wrapped.has(c))) for (const [p] of r.decls) assert.notEqual(p, 'padding', `${r.selector} sets "padding" and would wipe the gutter`);
    assert.deepEqual([...bare.matchAll(/@media \(max-width: (\d+)px\)/g)].map(m => +m[1]), [1100, 860, 600, 420]);
    assert.ok(bare.lastIndexOf('@media (prefers-reduced-motion: reduce)') > bare.lastIndexOf('@media (max-width'));
    assert.ok(rules.some(r => r.selector === '.vs-ask .vs-ask-i'));
    assert.match(style, /^\[hidden\] \{ display: none !important; \}$/m, 'the closed panels rely on it');
  });
});

describe('the script', () => {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  test('every id it touches exists; no timers; the app\'s language key only on a pick; the start on DOMContentLoaded; strict; no t( calls; no innerHTML', () => {
    for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(ids.has(m[1]), `#${m[1]} exists`);
    assert.doesNotMatch(js, /setTimeout|setInterval|requestAnimationFrame/);
    assert.match(js, /if \(save\) \{ try \{ localStorage\.setItem\('lang', vsLang\); \}/);
    assert.match(js.trim(), /document\.addEventListener\('DOMContentLoaded', vsInit\);$/);
    assert.match(js, /^'use strict';$/m);
    assert.doesNotMatch(js, /\btf?\(\s*'/);
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML/);
  });
  test('the render: each row pressed or not, one panel shown, the title; "next" keeps the focus on the next panel\'s button', () => {
    assert.match(js, /b\.setAttribute\('aria-pressed', String\(b\.dataset\.topic === vsS\.topic\)\)/);
    assert.match(js, /p\.hidden = p\.dataset\.panel !== vsS\.topic;/);
    assert.match(js, /document\.getElementById\('vs-detail-t'\)\.textContent = vsTitle\(vsS\);/);
    assert.match(js, /document\.querySelector\(`\[data-panel="\$\{vsS\.topic\}"\] \[data-next\]`\)\.focus\(\);/);
  });
});
