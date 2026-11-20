// CLIENT (static + pure-function) tests for the fonio tab's layout (FONIO_CHANGES Part 41, 2026-11-19): the look only.
// Asked: "remake the setup so that its just easier to manage right now its full of text make it professional and
// more easily configurable … dont change any settings just the UI".
//
// Pinned: the tab has a head (what is connected in one line, the status, five parts to choose from) and shows one
// part at a time; every setting sits in the part it belongs to and keeps its id; the three settings parts share the
// one Save, which still reads every field whatever part is open; a part hides with the hidden attribute only;
// "Setup in fonio" is offered to nobody it would be empty for; every explanation is still there, folded behind a
// line to open it; the texts that pointed "below" or "above" to another part now name that part.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/integrations.js');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pane = html.slice(html.indexOf('<div id="intg-pane-fonio"'), html.indexOf('<!-- ── Workspaces page ── -->'));
const count = (src, needle) => src.split(needle).length - 1;
const PARTS = ['connection', 'who', 'after', 'setup', 'calls'];
// a part's markup: from its opening tag to the next part's (or the pane's end)
const partStart = name => pane.indexOf(`<div class="fonio-part" data-fonio-part="${name}"`);
const partOf = name => { const a = partStart(name), next = PARTS.map(partStart).filter(i => i > a).sort((x, y) => x - y)[0]; return pane.slice(a, next === undefined ? pane.length : next); };

describe('the head of the tab', () => {
  const head = pane.slice(pane.indexOf('<div class="settings-card fonio-head" id="fonio-head">'), pane.indexOf('<div class="settings-card" id="fonio-card">'));
  test('comes first: one line that says what is connected, the status, and who may change things', () => {
    assert.ok(head.length > 0, 'the head stands before the settings card');
    assert.match(head, /<p class="fonio-line" id="fonio-line"><\/p>\s*<span id="fonio-status" class="badge" data-i18n="fonio_status_none">/);
    assert.match(head, /<p class="settings-hint hidden" id="fonio-readonly-hint" data-i18n="fonio_readonly_hint">/);
    for (const id of ['fonio-head', 'fonio-line', 'fonio-status', 'fonio-readonly-hint', 'fonio-parts']) assert.equal(count(pane, `id="${id}"`), 1, id);
  });
  test('five parts to choose from, in this order, each a button that opens its part; the first is open', () => {
    const buttons = [...head.matchAll(/<button type="button" role="tab" data-fonio-part="([a-z]+)" aria-selected="(true|false)" onclick="setFonioPart\('([a-z]+)'\)" data-i18n="([a-z_]+)"( hidden)?>([^<]+)<\/button>/g)];
    assert.deepEqual(buttons.map(b => b[1]), PARTS);
    assert.deepEqual(buttons.map(b => b[3]), PARTS, 'each button opens the part it names');
    assert.deepEqual(buttons.map(b => b[2]), ['true', 'false', 'false', 'false', 'false']);
    assert.deepEqual(buttons.map(b => b[4]), ['fonio_title', 'fonio_part_who', 'fonio_part_after', 'fonio_part_setup', 'fonio_calls_title']);
    assert.deepEqual(buttons.map(b => !!b[5]), [false, false, false, true, false], '"Setup in fonio" is offered only once the code knows it has something to show');
    for (const b of buttons) assert.equal(b[6], dict.en[b[4]], `the page's default text of ${b[4]} is the English one`);
    assert.match(head, /<div class="seg fonio-parts" id="fonio-parts" role="tablist" aria-label="[^"]+" data-i18n-aria="fonio_parts_aria">/);
  });
  test('the sentence about the one account for the workspace is still there, folded', () => {
    assert.match(head, /<details class="fonio-more">\s*<summary data-i18n="fonio_more">[^<]*<\/summary>\s*<p class="settings-hint" data-i18n="fonio_hint">[^<]+<\/p>\s*<\/details>/);
  });
});

describe('the parts', () => {
  test('five, in the order of the buttons; only the first is shown at first, the others carry the hidden attribute', () => {
    const tags = [...pane.matchAll(/<div class="fonio-part" data-fonio-part="([a-z]+)"( hidden)?>/g)];
    assert.deepEqual(tags.map(m => m[1]), PARTS);
    assert.deepEqual(tags.map(m => !!m[2]), [false, true, true, true, true]);
    assert.equal(count(pane, 'class="fonio-part"'), 5);
  });
  const WHERE = {
    connection: ['fonio-facts', 'fonio-key', 'fonio-from', 'fonio-active', 'fonio-paused-hint'],
    who: ['fonio-on-manual', 'fonio-on-webhook', 'fonio-delay', 'fonio-who', 'fonio-who-pipelines', 'fonio-who-webhooks', 'fonio-cc', 'fonio-prefixes', 'fonio-hours-on', 'fonio-days', 'fonio-hours-from', 'fonio-hours-to', 'fonio-hours-tz'],
    after: ['fonio-follow-on', 'fonio-follow-no-answer', 'fonio-follow-voicemail', 'fonio-follow-busy', 'fonio-follow-attempts', 'fonio-callback-on', 'fonio-book-meetings', 'fonio-rules', 'fonio-rules-pipeline', 'fonio-rules-table'],
    setup: ['fonio-result-card', 'fonio-result-url', 'fonio-result-body', 'fonio-outcome-words', 'fonio-cb-date-desc', 'fonio-cb-time-desc', 'fonio-cb-prompt', 'fonio-ls-desc', 'fonio-ls-prompt', 'fonio-result-last',
      'fonio-vars-card', 'fonio-vars-prompt', 'fonio-vars-rows', 'fonio-vars-out-wrap', 'fonio-vars-out', 'fonio-vars-msg'],
    calls: ['fonio-calls-card', 'fonio-calls'],
  };
  test('every setting sits in the part it belongs to, once, under the id it always had', () => {
    for (const [name, ids] of Object.entries(WHERE)) {
      const part = partOf(name);
      for (const id of ids) {
        assert.ok(part.includes(`id="${id}"`), `#${id} is in "${name}"`);
        assert.equal(count(pane, `id="${id}"`), 1, `#${id} exists once`);
      }
    }
  });
  test('Connection: the key, the number and the Active switch with its paused line right under it', () => {
    const part = partOf('connection');
    assert.match(part, /id="fonio-active"[^\n]*\n\s*<p class="help hidden" id="fonio-paused-hint" data-i18n="fonio_paused_hint">/);
    assert.ok(part.indexOf('id="fonio-key"') < part.indexOf('id="fonio-from"') && part.indexOf('id="fonio-from"') < part.indexOf('id="fonio-active"'));
    assert.doesNotMatch(part, /fonio-on-manual|fonio-delay/, 'which new deals are called, and when, is the next part');
  });
  test('After the call: nobody answers, a callback, a meeting, the deal — in that order', () => {
    const part = partOf('after');
    const at = k => part.indexOf(`data-i18n="${k}"`);
    assert.ok(at('fonio_follow_label') > 0 && at('fonio_follow_label') < at('fonio_callback_label') && at('fonio_callback_label') < at('fonio_meet_label') && at('fonio_meet_label') < at('fonio_rules_label'));
  });
  test('Setup in fonio is the two cards of owners and admins, still closed until the code opens them; Calls is the history', () => {
    assert.match(partOf('setup'), /<div class="settings-card hidden" id="fonio-result-card">[\s\S]*<div class="settings-card hidden" id="fonio-vars-card">/);
    assert.match(partOf('calls'), /<div class="settings-card" id="fonio-calls-card">[\s\S]*onclick="loadFonioCalls\(\)"/);
  });
});

describe('one Save for the three settings parts, reading every field whatever part is open', () => {
  const card = pane.slice(pane.indexOf('<div class="settings-card" id="fonio-card">'), partStart('setup'));
  test('the settings card holds exactly the three settings parts, then the Save row, which belongs to none of them', () => {
    assert.deepEqual([...card.matchAll(/data-fonio-part="([a-z]+)"/g)].map(m => m[1]), ['connection', 'who', 'after']);
    const row = card.indexOf('<div class="settings-card-actions hidden" id="fonio-actions">');
    assert.ok(row > card.indexOf('id="fonio-rules-table"'), 'after the last setting');
    // the three parts are closed before the row: as many <div> opened as closed between the first part and the row
    const parts = card.slice(card.indexOf('<div class="fonio-part"'), row);
    assert.equal(count(parts, '<div'), count(parts, '</div>'), 'the Save row is no part\'s child');
    assert.match(card, /<button class="btn btn-primary btn-sm" id="fonio-save-btn" onclick="saveFonio\(this\)" data-i18n="fonio_btn_save">/);
    assert.equal(count(pane, 'onclick="saveFonio(this)"'), 1, 'one Save');
  });
  test('every field Save reads is inside the settings card, so a member\'s lock and the Save reach it in any part', () => {
    const save = sliceFn(js, 'saveFonio', 'integrations.js');
    const ids = [...new Set([...save.matchAll(/\b[vc]\('(fonio-[a-z-]+)'\)/g)].map(m => m[1]))];
    assert.ok(ids.length >= 16, `the fields Save reads (${ids.length})`);
    for (const id of ids) assert.ok(card.includes(`id="${id}"`), `#${id}`);
    assert.match(sliceFn(js, 'renderFonio', 'integrations.js'), /card\.querySelectorAll\('input'\)\.forEach\(el => \{ el\.disabled = !manage; \}\)/);
  });
  test('Save and the form do not know which part is open', () => {
    for (const fn of ['saveFonio', 'readFonioForm', 'removeFonio', 'saveFonioVars']) assert.doesNotMatch(sliceFn(js, fn, 'integrations.js'), /fonioPart|FONIO_PARTS|hidden/, fn);
  });
  test('a part hides with the hidden attribute only: what a part\'s own code hides with the class is left alone', () => {
    const fn = sliceFn(js, 'renderFonioParts', 'integrations.js');
    assert.doesNotMatch(fn, /classList|\.disabled|\.value|innerHTML|api\./);
    assert.match(fn, /p\.hidden = p\.dataset\.fonioPart !== fonioPart;/);
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m, 'which hides a part although .fonio-part sets a display of its own');
    assert.match(css, /^\.fonio-part \{ display: flex; flex-direction: column; gap: var\(--sp-3\); \}$/m);
  });
});

describe('explanations are folded, not deleted', () => {
  const HINTS = ['fonio_hint', 'fonio_conn_hint', 'fonio_who_hint', 'fonio_numbers_hint', 'fonio_hours_hint', 'fonio_follow_hint', 'fonio_follow_attempts_hint', 'fonio_callback_hint', 'fonio_callback_rules',
    'fonio_meet_hint', 'fonio_book_meetings_hint', 'fonio_rules_hint', 'fonio_rules_note', 'fonio_result_link_hint', 'fonio_result_body_hint', 'fonio_outcome_hint', 'fonio_cb_hint', 'fonio_ls_hint',
    'fonio_vars_slots_hint', 'fonio_vars_prompt_hint', 'fonio_vars_list_hint', 'fonio_vars_out_hint'];
  // is the element with this key inside an open <details class="fonio-more"> … </details>?
  const folded = key => { const at = pane.indexOf(`data-i18n="${key}"`), open = pane.lastIndexOf('<details class="fonio-more">', at); return at > 0 && open > 0 && !pane.slice(open, at).includes('</details>'); };
  test('each of the long explanations is still in the tab, behind a line that opens it', () => {
    for (const k of HINTS) {
      assert.equal(count(pane, `data-i18n="${k}"`), 1, `${k} is in the tab once`);
      assert.ok(folded(k), `${k} is folded`);
      assert.ok(dict.en[k] && dict.de[k], k);
    }
  });
  test('no explanation of a section stands open any more', () => {
    for (const m of pane.matchAll(/<p class="intg-section-hint" data-i18n="([a-z_]+)"/g)) assert.ok(folded(m[1]), m[1]);
    assert.ok(count(pane, '<p class="intg-section-hint"') >= 16);
  });
  test('what stays in sight is short: a card\'s one or two sentences, a field\'s format', () => {
    for (const k of ['fonio_result_hint', 'fonio_vars_hint', 'fonio_calls_hint', 'fonio_from_hint', 'fonio_delay_hint', 'fonio_prefixes_hint']) {
      assert.equal(count(pane, `data-i18n="${k}"`), 1, k);
      assert.ok(!folded(k), `${k} stays in sight`);
    }
  });
  test('every folded block has a line to open it, in words from the dictionary, and closes again', () => {
    const blocks = [...pane.matchAll(/<details class="fonio-more">\s*<summary data-i18n="([a-z_]+)">([^<]+)<\/summary>/g)];
    assert.equal(blocks.length, count(pane, '<details'), 'every <details> in the tab is one of these');
    assert.equal(count(pane, '<details'), count(pane, '</details>'));
    assert.ok(blocks.length >= 17, String(blocks.length));
    for (const b of blocks) {
      assert.ok(['fonio_more', 'fonio_more_how', 'fonio_more_slots'].includes(b[1]), b[1]);
      assert.equal(b[2], dict.en[b[1]], 'the page\'s default text is the English one');
    }
    assert.ok(blocks.some(b => b[1] === 'fonio_more_how'), 'the setup texts open as "how to set this up"');
  });
  test('the fold needs no code: it is the browser\'s own', () => {
    assert.doesNotMatch(js, /fonio-more/);
    assert.match(css, /^\.fonio-more > summary \{[^}]*cursor: pointer;[^}]*\}$/m);
    assert.match(css, /^\.fonio-more > summary:focus-visible \{ outline: none; box-shadow: var\(--focus-ring\); \}$/m);
  });
});

describe('words', () => {
  const NEW = ['fonio_parts_aria', 'fonio_part_who', 'fonio_part_after', 'fonio_part_setup', 'fonio_more', 'fonio_more_how', 'fonio_more_slots', 'fonio_line_none', 'fonio_line_active', 'fonio_line_paused', 'fonio_line_hours'];
  test('every new text exists in both languages and is used; German addresses nobody', () => {
    for (const k of NEW) {
      assert.ok(dict.en[k] && dict.de[k], k);
      assert.notEqual(dict.en[k], dict.de[k], k);
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
      assert.ok(js.includes(`'${k}'`) || pane.includes(`"${k}"`), `${k} is used`);
    }
  });
  test('a text that pointed "below" or "above" to what is now another part names that part instead', () => {
    for (const lang of ['en', 'de']) {
      const d = dict[lang];
      assert.ok(d.fonio_paused_hint.includes(d.fonio_part_who), `${lang}: the paused line says where the two switches are`);
      assert.ok(d.fonio_follow_hint.includes(d.fonio_calls_title) && d.fonio_callback_hint.includes(d.fonio_calls_title), `${lang}: a retry and a callback are found under Calls`);
      for (const k of ['fonio_follow_attempts_hint', 'fonio_callback_rules', 'fonio_rules_hint']) assert.ok(d[k].includes(d.fonio_part_setup) && d[k].includes(d.fonio_result_title), `${lang}: ${k} names the part and the card`);
      assert.ok(d.fonio_ls_hint.includes(d.fonio_part_after) && d.fonio_ls_hint.includes(d.fonio_rules_label), `${lang}: the setup text names the table it feeds and its part`);
    }
    assert.doesNotMatch(dict.en.fonio_paused_hint + dict.en.fonio_follow_hint + dict.en.fonio_follow_attempts_hint, /\bbelow\b/);
    assert.doesNotMatch(dict.de.fonio_paused_hint + dict.de.fonio_follow_hint + dict.de.fonio_follow_attempts_hint, /\b(darunter|unten)\b/);
  });
  test('the page\'s default text of each reworded sentence is the English one', () => {
    for (const k of ['fonio_paused_hint', 'fonio_follow_hint', 'fonio_follow_attempts_hint', 'fonio_callback_hint', 'fonio_callback_rules', 'fonio_rules_hint', 'fonio_ls_hint']) {
      assert.ok(pane.includes(`data-i18n="${k}">${dict.en[k].replace(/&/g, '&amp;')}<`), k);
    }
  });
});

// the sandbox: the tab's own state, a page of buttons, parts and the settings card, and the real t / tf
const F = loadFns('public/js/integrations.js', ['fonioPartOf', 'setFonioPart', 'renderFonioParts', 'fonioLineText'], {
  state: { currentLang: 'en', fonioData: null, fonioPart: 'connection', document: null },
  extra: [sliceConst('public/js/core.js', 'TRANSLATIONS'), sliceFn(core, 't', 'core.js'), sliceFn(core, 'tf', 'core.js'),
    sliceConst('public/js/integrations.js', 'FONIO_PARTS'), sliceConst('public/js/integrations.js', 'FONIO_FORM_PARTS'), 'function __part() { return fonioPart; }'].join('\n'),
  expose: ['__part'],
});
function page() {
  const buttons = PARTS.map(p => ({ dataset: { fonioPart: p }, hidden: p === 'setup', selected: null, setAttribute(k, v) { if (k === 'aria-selected') this.selected = v; } }));
  const parts = PARTS.map(p => ({ dataset: { fonioPart: p }, hidden: p !== 'connection' }));
  const card = { hidden: false };
  F.__set('document', { querySelectorAll: sel => (sel === '#fonio-parts [data-fonio-part]' ? buttons : sel === '#intg-pane-fonio .fonio-part' ? parts : []), getElementById: id => (id === 'fonio-card' ? card : null) });
  const shown = () => parts.filter(p => !p.hidden).map(p => p.dataset.fonioPart);
  const selected = () => buttons.filter(b => b.selected === 'true').map(b => b.dataset.fonioPart);
  return { buttons, parts, card, shown, selected, setup: buttons[3] };
}
const OWNER = { configured: true, can_manage: true, settings: { from_number: '+4930123456', active: true, delay_minutes: 5, hours_on: true, hours_from: '09:00', hours_to: '18:00' } };
function open({ data = OWNER, part = 'connection', lang = 'en' } = {}) { F.__set('currentLang', lang); F.__set('fonioData', data); F.__set('fonioPart', part); return page(); }

describe('choosing a part', () => {
  test('the chosen part is shown, its button marked, the others hidden; the choice is kept', () => {
    const p = open();
    for (const part of PARTS) {
      F.setFonioPart(part);
      assert.deepEqual([p.shown(), p.selected(), F.__part()], [[part], [part], part], part);
    }
    F.renderFonioParts();
    assert.deepEqual(p.shown(), ['calls'], 'drawing again, as after a save, keeps the open part');
  });
  test('the settings card with its Save is there for the three settings parts and gone for the other two', () => {
    const p = open();
    for (const [part, hidden] of [['connection', false], ['who', false], ['after', false], ['setup', true], ['calls', true], ['who', false]]) {
      F.setFonioPart(part);
      assert.equal(p.card.hidden, hidden, part);
    }
  });
  test('"Setup in fonio" is offered to an owner or admin with a saved connection, and to nobody else', () => {
    for (const [data, offered] of [[OWNER, true], [{ ...OWNER, can_manage: false }, false], [{ ...OWNER, configured: false }, false], [null, false]]) {
      const p = open({ data });
      F.renderFonioParts();
      assert.equal(p.setup.hidden, !offered, JSON.stringify(data && { c: data.configured, m: data.can_manage }));
      F.setFonioPart('setup');
      assert.deepEqual(p.shown(), [offered ? 'setup' : 'connection']);
    }
  });
  test('when the connection is removed while "Setup in fonio" is open, the tab goes back to the first part instead of showing nothing', () => {
    const p = open({ part: 'setup' });
    F.renderFonioParts();
    assert.deepEqual(p.shown(), ['setup']);
    F.__set('fonioData', { configured: false, can_manage: true, settings: {} });
    F.renderFonioParts();
    assert.deepEqual([p.shown(), p.selected(), p.setup.hidden, p.card.hidden], [['connection'], ['connection'], true, false]);
  });
  test('anything that is no part opens the first', () => {
    const p = open();
    for (const odd of ['', 'x', null, undefined, 5, 'Calls']) { F.setFonioPart(odd); assert.deepEqual(p.shown(), ['connection'], String(odd)); }
    assert.equal(F.fonioPartOf('who', null), 'who');
    assert.equal(F.fonioPartOf('setup', { configured: true, can_manage: false }), 'connection');
  });
  test('a tab without its head or card does not break', () => {
    F.__set('fonioData', OWNER); F.__set('fonioPart', 'who');
    F.__set('document', { querySelectorAll: () => [], getElementById: () => null });
    assert.doesNotThrow(() => F.renderFonioParts());
  });
  test('drawing the tab sets the line as text and then shows the open part, before anything can return early', () => {
    const fn = sliceFn(js, 'renderFonio', 'integrations.js');
    assert.match(fn, /const line = \$\('fonio-line'\);\s*if \(line\) line\.textContent = fonioLineText\(d\);[^\n]*\n\s*renderFonioParts\(\);\s*const facts = \$\('fonio-facts'\);/);
    assert.ok(fn.indexOf('renderFonioParts();') < fn.indexOf("if (!set) { facts.innerHTML = ''; return; }"));
  });
});

describe('the line at the top', () => {
  test('not connected: where the key and the number go', () => {
    for (const data of [null, undefined, { configured: false, settings: {} }]) assert.equal(F.fonioLineText(data), 'Not connected yet. The API key and the fonio number are entered under "Connection".');
  });
  test('connected and calling: the number, after how many minutes, and the calling hours when they are on', () => {
    open();
    assert.equal(F.fonioLineText(OWNER), 'Connected with +4930123456. Active: new deals are called 5 min after they are created. Calling hours 09:00 to 18:00.');
    assert.equal(F.fonioLineText({ ...OWNER, settings: { ...OWNER.settings, hours_on: false, delay_minutes: 0 } }), 'Connected with +4930123456. Active: new deals are called 0 min after they are created.');
  });
  test('connected and paused: said plainly, without the delay', () => {
    assert.equal(F.fonioLineText({ ...OWNER, settings: { ...OWNER.settings, active: false } }), 'Connected with +4930123456. Paused: no calls go out.');
  });
  test('in German too, and it is what is saved, not what is typed', () => {
    open({ lang: 'de' });
    assert.equal(F.fonioLineText(OWNER), 'Verbunden mit +4930123456. Aktiv: Neue Deals werden 5 Min. nach dem Anlegen angerufen. Anrufzeiten 09:00 bis 18:00.');
    assert.equal(F.fonioLineText(null), 'Noch nicht verbunden. API-Schlüssel und fonio-Nummer werden unter „Verbindung“ eingetragen.');
    assert.doesNotMatch(sliceFn(js, 'fonioLineText', 'integrations.js'), /getElementById|document|\.value|\.checked/);
    open();
  });
  test('a number is text: the line is put into the page as text', () => {
    assert.doesNotMatch(sliceFn(js, 'renderFonio', 'integrations.js'), /fonio-line[^\n]*innerHTML/);
    assert.match(F.fonioLineText({ ...OWNER, settings: { ...OWNER.settings, from_number: '<b>x</b>' } }), /<b>x<\/b>/, 'returned as it is — textContent makes it harmless');
  });
});

describe('the look', () => {
  test('the head: the line takes the room, the badge stays beside it, the buttons wrap on a narrow screen', () => {
    assert.match(css, /^\.fonio-line \{ flex: 1 1 auto; min-width: 0;/m);
    assert.match(css, /^\.seg\.fonio-parts \{ display: flex; flex-wrap: wrap;/m);
    assert.match(css, /^\.seg button:hover \{ color: var\(--text\); \} \.seg button\[aria-pressed="true"\], \.seg button\[aria-selected="true"\] \{/m, 'the open part\'s button is marked by the page\'s own rule');
  });
  test('a part\'s first section starts without a line above it, as a card\'s first section does; the settings card starts further down', () => {
    assert.match(css, /^\.fonio-part > \.intg-section:first-child, \.fonio-part > #fonio-facts:empty \+ \.intg-section \{ padding-top: 0; border-top: none; \}$/m);
    assert.match(css, /^#fonio-card > \.settings-card-body \{ padding-top: var\(--sp-4\); \}$/m);
    assert.match(css, /^\.intg-stack \.settings-card-body > \.settings-card-actions \{ padding-top: var\(--sp-3\); border-top: 1px solid var\(--line-soft\); \}$/m, 'the Save row is still the card body\'s own child, with its line');
    assert.match(pane, /<div class="settings-card" id="fonio-card">\s*<div class="settings-card-body">\s*<div class="fonio-part" data-fonio-part="connection">/);
  });
  test('the new rules stand with the tab\'s other rules, not at the end of the stylesheet', () => {
    assert.ok(css.indexOf('.fonio-part {') > css.indexOf('.fonio-rules-table select') && css.indexOf('.fonio-more > summary {') < css.indexOf('.intg-autosaved {'));
  });
});
