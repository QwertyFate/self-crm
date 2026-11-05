// CLIENT tests for the Notetaker tab on the Integrations page (NOTETAKER_AI_CHANGES Part 5, 2026-11-05): the summary
// AI, one per workspace (Claude, ChatGPT, Gemini or DeepSeek). Static: the rail tab (hidden until the server answers),
// the pane's one card, the masked key field, every string in the dictionary in both languages (German impersonal), the
// three routes and nothing else. Run: the real render, pick, save and remove functions over a small fake page and a
// fake api, so what an owner and a member see, what each refusal says, and that the key never stays on the page are
// pinned by running them.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/integrations.js');
const css  = read('public/style.css');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pane = html.slice(html.indexOf('<div id="intg-pane-notetaker"'), html.indexOf('<!-- ── Workspaces page ── -->'));
const pageStart = html.indexOf('<section id="page-integrations"');
const rail = html.slice(pageStart, html.indexOf('<div class="settings-tab-body">', pageStart));
const block = js.slice(js.indexOf('// ── Notetaker: the summary AI'));

describe('the markup', () => {
  test('the rail: the Notetaker tab after Cal.com, hidden until the server says the Notetaker is on', () => {
    assert.match(rail, /data-i18n="intg_tab_calcom">Cal\.com<\/button>\n\s*<button class="settings-tab hidden" data-tab="notetaker" onclick="switchIntgTab\('notetaker'\)" data-i18n="intg_tab_notetaker">Notetaker<\/button>\n\s*<\/nav>/);
    assert.match(css, /^\.settings-tab\[data-tab="notetaker"\]::before \{ --ico: url\("data:image\/svg\+xml;charset=utf-8,%3Csvg[^"]*stroke='black'[^"]*rect x='9' y='2' width='6' height='12' rx='3'[^"]*"\); \}$/m, 'the rail icon: a microphone');
    assert.match(css, /^\.hidden \{ display: none !important; \}$/m, 'the hidden tab really is hidden: .hidden wins over .settings-tab');
  });
  test('the pane: one card with the badge, the member line, the empty line, the current AI, the form, the actions and the detail line', () => {
    assert.match(pane, /^<div id="intg-pane-notetaker" class="settings-pane">/);
    assert.match(pane, /<h2 class="settings-pane-title" data-i18n="intg_pane_notetaker">/); assert.match(pane, /<p class="settings-tab-hint" data-i18n="intg_pane_notetaker_hint">/);
    assert.match(pane, /<div class="settings-card" id="nt-ai-card">/); assert.equal((pane.match(/class="settings-card"/g) || []).length, 1, 'one card');
    assert.match(pane, /<span id="nt-ai-status" class="badge" data-i18n="nt_ai_status_none">/);
    assert.match(pane, /<p class="settings-hint hidden" id="nt-ai-readonly-hint" data-i18n="nt_ai_readonly_hint">/);
    assert.match(pane, /<p class="empty-inline hidden" id="nt-ai-soon" data-i18n="nt_ai_soon">[^<]+<\/p>\s*<p class="empty-inline hidden" id="nt-ai-none" data-i18n="nt_ai_none">/, 'the coming-soon note (Part 10) first in the card body');
    assert.match(pane, /<div class="intg-section hidden" id="nt-ai-current-section">[\s\S]*<div id="nt-ai-facts"><\/div>/);
    assert.match(pane, /<div class="intg-section hidden" id="nt-ai-form-section">/);
    assert.match(pane, /<label id="nt-ai-provider-label" data-i18n="nt_ai_provider_label">[^<]*<\/label>\s*<div class="seg" id="nt-ai-provider" role="group" aria-labelledby="nt-ai-provider-label"><\/div>/, 'the four AIs as one segmented control, filled by the script');
    assert.match(pane, /<label for="nt-ai-key" data-i18n="nt_ai_key_label">[^<]*<\/label>\s*<input type="text" id="nt-ai-key" class="intg-url-input intg-secret-input" autocomplete="off" spellcheck="false" placeholder="[^"]*" data-i18n-ph="nt_ai_key_ph" \/>/, 'a masked text field, as the Cal.com key: the browser never offers to save it as a password');
    assert.doesNotMatch(pane, /type="password"/);
    assert.match(pane, /<label for="nt-ai-model" data-i18n="nt_ai_model_label">[^<]*<\/label>\s*<input type="text" id="nt-ai-model" class="form-control" autocomplete="off" spellcheck="false" maxlength="100" placeholder="[^"]*" data-i18n-ph="nt_ai_model_ph" \/>\s*<p class="help" data-i18n="nt_ai_model_hint">/, 'the model: optional, at most the Notetaker\'s 100 characters');
    assert.match(pane, /<div class="settings-card-actions hidden" id="nt-ai-actions">\s*<button class="btn btn-primary btn-sm" id="nt-ai-save-btn" onclick="saveNotetakerAi\(this\)" data-i18n="nt_ai_btn_save">[^<]*<\/button>\s*<button class="btn btn-sm btn-danger hidden" id="nt-ai-remove-btn" onclick="removeNotetakerAi\(\)" data-i18n="nt_ai_btn_remove">[^<]*<\/button>\s*<span id="nt-ai-msg" class="workspace-name-msg hidden"><\/span>\s*<\/div>\s*<p class="help hidden" id="nt-ai-detail"><\/p>/);
    assert.match(css, /^\.intg-field > \.seg \{ align-self: flex-start; \}/m, 'the picker is as wide as its buttons');
  });
  test('every string on the pane and in the script goes through the dictionary, in both languages; German impersonal; placeholders agree', () => {
    const keys = new Set([...pane.matchAll(/data-i18n(?:-ph|-aria|-title)?="(\w+)"/g)].map(m => m[1]));
    for (const m of block.matchAll(/\bt[f]?\('(\w+)'(?=[,)])/g)) keys.add(m[1]);
    assert.ok(keys.size >= 38, `keys used: ${keys.size}`);
    for (const k of keys) { assert.ok(dict.en[k], `en.${k}`); assert.ok(dict.de[k], `de.${k}`); }
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
    for (const k of Object.keys(dict.de).filter(k => /^nt_ai_|^intg_(tab|pane)_notetaker/.test(k))) {
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
      assert.equal(ph(dict.de[k]), ph(dict.en[k]), `${k}: placeholders`);
    }
    for (const m of pane.matchAll(/<(h2|h3|p|button|span|label)\b[^>]*>([^<]+)</g)) if (m[2].trim()) assert.match(m[0], /data-i18n=/, m[0].slice(0, 80));
    assert.equal(dict.de.nt_ai_btn_save, 'Prüfen und speichern'); assert.equal(dict.de.nt_ai_title, 'KI für die Zusammenfassung');
  });
});

describe('the script, read', () => {
  test('loadIntegrations loads it after Cal.com; the three routes and nothing else; no raw fetch; nothing unescaped into innerHTML', () => {
    assert.match(sliceFn(js, 'loadIntegrations', 'integrations.js'), /loadCalcomSettings\(\);\s*loadNotetakerAi\(\);/);
    assert.deepEqual([...block.matchAll(/api\.(get|post|put|patch|del)\('([^']+)'/g)].map(m => [m[1], m[2]]),
      [['get', '/api/integrations/notetaker/ai'], ['put', '/api/integrations/notetaker/ai'], ['del', '/api/integrations/notetaker/ai']]);
    assert.doesNotMatch(block, /fetch\(|innerHTML = [^`]*\$\{(?!esc\()/);
    assert.match(sliceConst('public/js/integrations.js', 'NT_AI_NAMES'), /\{ claude: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', deepseek: 'DeepSeek' \}/, 'the Notetaker\'s names, shown as the brands');
    assert.doesNotMatch(sliceFn(js, 'renderNotetakerAi', 'integrations.js'), /api_key|sealed/, 'render never touches a key');
  });
});

// ── run: the real functions over a fake page ──────────────────────────────────
// Each element named in the pane (and the rail tab) starts with the classes the markup gives it.
function fakePage() {
  const classesOf = id => { const m = html.match(new RegExp(`id="${id}"[^>]*?class="([^"]*)"|class="([^"]*)"[^>]*?id="${id}"`)); return new Set(((m && (m[1] || m[2])) || '').split(/\s+/).filter(Boolean)); };
  const els = {};
  const make = (id, cls) => {
    const set = cls;
    return els[id] = { id, textContent: '', innerHTML: '', value: '', disabled: false, focused: 0, onclick: null,
      get className() { return [...set].join(' '); }, set className(v) { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => set.add(c)); },
      classList: { toggle: (c, on) => { const want = on === undefined ? !set.has(c) : !!on; if (want) set.add(c); else set.delete(c); return want; }, add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) },
      focus() { this.focused++; } };
  };
  const tab = make('tab:notetaker', new Set(['settings-tab', 'hidden']));
  const document = {
    getElementById: id => els[id] || (html.includes(`id="${id}"`) ? make(id, classesOf(id)) : null),
    querySelector: sel => (sel === '#page-integrations .settings-tab[data-tab="notetaker"]' ? tab : null),
  };
  return { document, el: id => document.getElementById(id), tab, hidden: id => document.getElementById(id).classList.contains('hidden') };
}
function load() {
  globalThis.__ntDict = dict;
  const F = loadFns('public/js/integrations.js',
    ['loadNotetakerAi', 'ntAiName', 'renderNotetakerAi', 'pickNotetakerAi', 'showNtAiMsg', 'showNtAiDetail', 'ntAiErrorText', 'saveNotetakerAi', 'removeNotetakerAi'],
    { state: { document: null, api: null, ui: null, currentLang: 'en', currentIntgTab: 'webhook', ntAiData: null, ntAiPick: null, switched: [] },
      extra: `${sliceConst('public/js/integrations.js', 'NT_AI_NAMES')}
        const t = k => { const v = globalThis.__ntDict.en[k]; if (v === undefined) throw new Error('no key ' + k); return v; };
        const tf = (k, o) => t(k).replace(/\\{(\\w+)\\}/g, (_, n) => o[n]);
        ${sliceFn(read('public/js/core.js'), 'esc', 'core.js')}
        const setTimeout = () => 0;
        function switchIntgTab(tab) { currentIntgTab = tab; switched.push(tab); }
        function __get() { return { ntAiData, ntAiPick, currentIntgTab, switched }; }`,
      expose: ['__get'] });
  const page = fakePage();
  F.__set('document', page.document);
  return { F, page };
}
const PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek'];
const SET = (extra = {}) => ({ configured: true, ai: { provider: 'claude', model: null, saved_by: 1, saved_by_name: 'Olaf <Owner>', saved_at: '2026-11-05T09:00:00.000Z', key_hint: 'wxyz', ...extra }, providers: PROVIDERS, can_manage: true });

describe('the script, run', () => {
  test('the Notetaker is off (the server answers 404): the tab stays hidden, and a remembered Notetaker tab falls back to the lead webhook', async () => {
    const { F, page } = load();
    F.__set('currentIntgTab', 'notetaker');
    F.__set('api', { get: async () => ({ error: 'The Notetaker is off' }) });
    await F.loadNotetakerAi();
    assert.equal(page.tab.classList.contains('hidden'), true);
    assert.deepEqual(F.__get().switched, ['webhook']);
    assert.equal(F.__get().ntAiData, null);
  });
  test('the Notetaker is on: the tab shows; nothing set for a member: the empty line and the member line, no form, no actions', async () => {
    const { F, page } = load();
    F.__set('api', { get: async url => (assert.equal(url, '/api/integrations/notetaker/ai'), { configured: false, ai: null, providers: PROVIDERS, can_manage: false }) });
    await F.loadNotetakerAi();
    assert.equal(page.tab.classList.contains('hidden'), false);
    for (const [id, hidden] of [['nt-ai-soon', true], ['nt-ai-readonly-hint', false], ['nt-ai-none', false], ['nt-ai-current-section', true], ['nt-ai-form-section', true], ['nt-ai-actions', true]]) assert.equal(page.hidden(id), hidden, id);
    assert.equal(page.el('nt-ai-status').textContent, 'Not set'); assert.equal(page.el('nt-ai-status').className, 'badge');
  });
  test('coming soon (the server answers { soon: true }, Part 10): the tab shows the badge and the note only', async () => {
    const { F, page } = load();
    F.__set('api', { get: async () => ({ soon: true }) });
    await F.loadNotetakerAi();
    assert.equal(page.tab.classList.contains('hidden'), false);
    for (const [id, hidden] of [['nt-ai-soon', false], ['nt-ai-readonly-hint', true], ['nt-ai-none', true], ['nt-ai-current-section', true], ['nt-ai-form-section', true], ['nt-ai-actions', true], ['nt-ai-remove-btn', true]]) assert.equal(page.hidden(id), hidden, id);
    assert.equal(page.el('nt-ai-status').textContent, 'Coming soon'); assert.equal(page.el('nt-ai-status').className, 'badge');
    assert.equal(F.__get().ntAiPick, null);
  });
  test('set, seen by a member: the AI, the model (or the Notetaker\'s default) and who saved it; never the key\'s last four, even if an answer carried them', () => {
    const { F, page } = load();
    const d = SET(); d.can_manage = false;   // the server leaves key_hint out for members; the page does not rely on it
    F.__set('ntAiData', d); F.__set('ntAiPick', 'claude'); F.renderNotetakerAi();
    assert.equal(page.hidden('nt-ai-current-section'), false); assert.equal(page.hidden('nt-ai-form-section'), true); assert.equal(page.hidden('nt-ai-none'), true);
    assert.equal(page.el('nt-ai-status').textContent, 'Set'); assert.equal(page.el('nt-ai-status').className, 'badge badge-success');
    const facts = page.el('nt-ai-facts').innerHTML;
    assert.match(facts, /<td class="strong">AI<\/td><td>Claude<\/td>/);
    assert.match(facts, /<td class="strong">Model<\/td><td>The Notetaker&#39;s default<\/td>|<td class="strong">Model<\/td><td>The Notetaker's default<\/td>/);
    assert.match(facts, /Olaf &lt;Owner&gt;/, 'escaped');
    assert.doesNotMatch(facts, /API key|…/, 'no key row for a member');
  });
  test('set, seen by an owner: the key row with its last four; the form with the saved AI pressed and its model filled; Remove shown', () => {
    const { F, page } = load();
    F.__set('ntAiData', SET({ provider: 'openai', model: 'gpt-6-astra' })); F.__set('ntAiPick', 'openai'); F.renderNotetakerAi();
    assert.match(page.el('nt-ai-facts').innerHTML, /<td class="strong">API key<\/td><td>…wxyz<\/td>/);
    assert.match(page.el('nt-ai-facts').innerHTML, /<td class="strong">AI<\/td><td>ChatGPT<\/td>/);
    for (const [id, hidden] of [['nt-ai-form-section', false], ['nt-ai-actions', false], ['nt-ai-remove-btn', false], ['nt-ai-readonly-hint', true]]) assert.equal(page.hidden(id), hidden, id);
    const seg = page.el('nt-ai-provider').innerHTML;
    assert.deepEqual([...seg.matchAll(/data-provider="(\w+)" aria-pressed="(true|false)">([^<]+)</g)].map(m => [m[1], m[2], m[3]]),
      [['claude', 'false', 'Claude'], ['openai', 'true', 'ChatGPT'], ['gemini', 'false', 'Gemini'], ['deepseek', 'false', 'DeepSeek']]);
    assert.equal(page.el('nt-ai-model').value, 'gpt-6-astra');
    assert.equal(page.el('nt-ai-key').value, '', 'the key field is never filled');
  });
  test('picking another AI presses it, empties the model (that AI\'s own default) and hands the focus to the key; picking back restores the model', () => {
    const { F, page } = load();
    F.__set('ntAiData', SET({ model: 'claude-opus-5-5' })); F.__set('ntAiPick', 'claude'); F.renderNotetakerAi();
    page.el('nt-ai-provider').onclick({ target: { closest: () => ({ dataset: { provider: 'gemini' } }) } });
    assert.equal(F.__get().ntAiPick, 'gemini');
    assert.match(page.el('nt-ai-provider').innerHTML, /data-provider="gemini" aria-pressed="true"/);
    assert.equal(page.el('nt-ai-model').value, '');
    assert.equal(page.el('nt-ai-key').focused, 1);
    F.pickNotetakerAi('claude');
    assert.equal(page.el('nt-ai-model').value, 'claude-opus-5-5');
    F.pickNotetakerAi('mistral');
    assert.equal(F.__get().ntAiPick, 'claude', 'an unknown name is ignored');
  });
  test('save: no AI chosen or no key: said, nothing sent; otherwise one PUT with the AI, the key and the model, the field emptied, the answer shown', async () => {
    const { F, page } = load();
    const sent = [];
    F.__set('api', { put: async (url, body) => { sent.push([url, body]); return SET({ provider: 'deepseek', model: 'deepseek-v4-pro', key_hint: 'cdef' }); } });
    F.__set('ntAiData', { configured: false, ai: null, providers: PROVIDERS, can_manage: true }); F.renderNotetakerAi();
    await F.saveNotetakerAi(null);
    assert.equal(page.el('nt-ai-msg').textContent, 'Choose an AI first.'); assert.deepEqual(sent, []);
    F.pickNotetakerAi('deepseek');
    await F.saveNotetakerAi(null);
    assert.equal(page.el('nt-ai-msg').textContent, 'Paste the API key first.'); assert.deepEqual(sent, []);
    page.el('nt-ai-key').value = '  sk-0123456789abcdef0123456789abcdef  '; page.el('nt-ai-model').value = ' deepseek-v4-pro ';
    const btn = { disabled: false, textContent: 'Check and save' };
    await F.saveNotetakerAi(btn);
    assert.deepEqual(sent, [['/api/integrations/notetaker/ai', { provider: 'deepseek', api_key: 'sk-0123456789abcdef0123456789abcdef', model: 'deepseek-v4-pro' }]]);
    assert.equal(page.el('nt-ai-key').value, '', 'the key leaves the page');
    assert.equal(page.el('nt-ai-msg').textContent, 'DeepSeek saved. The key works.'); assert.equal(page.el('nt-ai-msg').className, 'workspace-name-msg success');
    assert.match(page.el('nt-ai-facts').innerHTML, /…cdef/);
    assert.deepEqual([btn.disabled, btn.textContent], [false, 'Check and save'], 'the button comes back');
  });
  test('the button says it is checking while the AI is asked', async () => {
    const { F, page } = load();
    const btn = { disabled: false, textContent: 'Check and save' };
    let during;
    F.__set('api', { put: async () => { during = [btn.disabled, btn.textContent]; return { error: 'x', reason: 'unreachable' }; } });
    F.__set('ntAiData', { configured: false, ai: null, providers: PROVIDERS, can_manage: true }); F.__set('ntAiPick', 'claude'); F.renderNotetakerAi();
    page.el('nt-ai-key').value = 'sk-ant-0123456789abcdefghij';
    await F.saveNotetakerAi(btn);
    assert.deepEqual(during, [true, 'Checking the key']);
  });
  test('a refused save: the page\'s own words by reason; the AI\'s words under it only for a refused key or a busy AI; the key emptied anyway; nothing kept', async () => {
    const cases = [
      [{ error: 'OpenAI refused the key (401): Incorrect API key provided: …', reason: 'key' }, 'openai', '',            'ChatGPT did not accept this key.',                                  'Details: OpenAI refused the key (401): Incorrect API key provided: …'],
      [{ error: 'Claude has no model "claude-nope" for this key', reason: 'model' },           'claude', 'claude-nope', 'Claude has no model "claude-nope" for this key.',                    ''],
      [{ error: 'Gemini could not be reached', reason: 'unreachable' },                         'gemini', '',            'Gemini could not be reached. Please try again.',                     ''],
      [{ error: 'DeepSeek answered 429: Rate limited', reason: 'refused' },                     'deepseek', '',          'DeepSeek is not answering the check right now. Please try again later.', 'Details: DeepSeek answered 429: Rate limited'],
      [{ error: 'That does not look like an API key', reason: 'key_shape' },                    'claude', '',            'That does not look like an API key.',                                ''],
      [{ error: 'That does not look like a model name', reason: 'model_shape' },                'claude', 'a b',         'That does not look like a model name.',                              ''],
      [{ error: 'Owner or admin only' },                                                        'claude', '',            'That did not work. Please try again.',                               'Details: Owner or admin only'],
      [null,                                                                                     'claude', '',            'That did not work. Please try again.',                               ''],
    ];
    for (const [answer, provider, model, msg, detail] of cases) {
      const { F, page } = load();
      F.__set('api', { put: async () => answer });
      const before = { configured: false, ai: null, providers: PROVIDERS, can_manage: true };
      F.__set('ntAiData', before); F.__set('ntAiPick', provider); F.renderNotetakerAi();
      page.el('nt-ai-key').value = 'sk-0123456789abcdefghij-SECRET'; page.el('nt-ai-model').value = model;
      await F.saveNotetakerAi(null);
      assert.equal(page.el('nt-ai-msg').textContent, msg, JSON.stringify(answer));
      assert.equal(page.el('nt-ai-msg').className, 'workspace-name-msg error');
      assert.equal(page.el('nt-ai-detail').textContent, detail, JSON.stringify(answer));
      assert.equal(page.el('nt-ai-detail').classList.contains('hidden'), !detail);
      assert.equal(page.el('nt-ai-key').value, '', 'emptied whatever the answer');
      assert.equal(F.__get().ntAiData, before, 'the saved state is unchanged');
    }
  });
  test('remove asks first; no: nothing sent; yes: one DELETE, the card back to "not set", the form empty', async () => {
    const { F, page } = load();
    const calls = [];
    let answer = false;
    F.__set('ui', { confirm: async o => { calls.push(['confirm', o.title, o.message, o.confirmLabel, o.danger]); return answer; } });
    F.__set('api', { del: async url => { calls.push(['del', url]); return { configured: false, ai: null, providers: PROVIDERS, can_manage: true }; } });
    F.__set('ntAiData', SET()); F.__set('ntAiPick', 'claude'); F.renderNotetakerAi();
    await F.removeNotetakerAi();
    assert.deepEqual(calls, [['confirm', 'Remove', dict.en.nt_ai_confirm_remove, 'Remove', true]]);
    answer = true; calls.length = 0;
    await F.removeNotetakerAi();
    assert.deepEqual(calls.map(c => c[0]), ['confirm', 'del']); assert.equal(calls[1][1], '/api/integrations/notetaker/ai');
    assert.equal(F.__get().ntAiPick, null);
    assert.equal(page.hidden('nt-ai-current-section'), true); assert.equal(page.hidden('nt-ai-none'), false); assert.equal(page.hidden('nt-ai-remove-btn'), true);
    assert.doesNotMatch(page.el('nt-ai-provider').innerHTML, /aria-pressed="true"/);
    assert.equal(page.el('nt-ai-msg').textContent, 'Summary AI removed.');
  });
});
