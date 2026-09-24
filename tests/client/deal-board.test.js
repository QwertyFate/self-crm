// CLIENT (static + pure-function) tests for the Deals kanban rework: calm cards
// with one ⋯ menu, columns that carry count + stage total and an "Add deal"
// footer, honest drag-and-drop (slots only while dragging, column-level
// highlight, state cleared on every path, revert on error), and copy via t().
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const dealsJs = read('public/js/deals.js');
const modalsJs = read('public/js/modals.js');
const EMOJI = /[✀-➿\u{1F300}-\u{1FAFF}⠀-⣿]|✕|️|→|👤/u;
const section = html.slice(html.indexOf('<section id="page-deals"'), html.indexOf('</section>', html.indexOf('<section id="page-deals"')));

describe('board markup (deals.js)', () => {
  const board = sliceFn(dealsJs, 'renderDealsBoard', 'deals.js');
  const card  = sliceFn(dealsJs, 'dealCard', 'deals.js');
  test('no emoji or symbol glyphs anywhere in deals.js', () => {
    const hit = dealsJs.match(EMOJI);
    assert.equal(hit, null, `found "${hit && hit[0]}" at ${hit && hit.index}`);
  });
  test('columns: sorted cards, count and stage total, a drop slot, an add-deal footer', () => {
    for (const s of ['sortStageDeals(', 'col-total', 'col-drop-slot', 'col-add-btn', 'openDealModal(null, { stageId:', 'ondragenter="dealDragEnter(event)"', 'ondrop="dealDrop(event,']) assert.ok(board.includes(s), s);
    assert.doesNotMatch(board, /text-transform|style="background:\$\{stage\.color\}"/, 'stage colour goes through a custom property');
    assert.ok(board.includes('--stage:'), 'col-dot reads --stage');
  });
  test('card: focusable, one menu button, no select, no red delete, no contact-card class', () => {
    for (const s of ['tabindex="0"', 'deal-card-menu-btn', 'UI_ICON.more', 'openDealCardMenu(event,', 'deal-card-title', 'deal-card-value', 'deal-card-avatar', 'onkeydown=']) assert.ok(card.includes(s), s);
    for (const s of ['<select', 'btn-danger', 'contact-card', 'urgency-select', 'setDealUrgency(']) assert.equal(card.includes(s), false, `card must not contain ${s}`);
  });
  test('urgency labels are translated and colours are tokens', () => {
    const urg = sliceConst('public/js/deals.js', 'DEAL_URGENCY');
    assert.equal((urg.match(/t\('urg_[0-4]'\)/g) || []).length, 5);
    assert.doesNotMatch(urg, /#[0-9a-f]{6}/i);
  });
});

describe('drag and drop', () => {
  const drop = sliceFn(dealsJs, 'dealDrop', 'deals.js');
  test('dealDrop records the previous stage before the optimistic move, clears state on every return, reverts on error', () => {
    const iPrev = drop.indexOf('const prevStageId = deal.stage_id;'), iSet = drop.indexOf('deal.stage_id = stageId;'), iPatch = drop.indexOf('api.patch(');
    assert.ok(iPrev >= 0 && iSet > iPrev && iPatch > iSet);
    assert.equal(drop.includes('maybePromptOnboarding'), false, 'no onboarding prompt on this branch');
    // every `return` inside the body is preceded (within the same statement) by finishDealDrag()
    const returns = [...drop.matchAll(/return;/g)];
    assert.ok(returns.length >= 2, 'has early returns');
    for (const m of returns) assert.match(drop.slice(Math.max(0, m.index - 80), m.index), /finishDealDrag\(\)/, `return at ${m.index} clears drag state`);
    assert.ok(drop.includes('showBoardNotice('), 'failed PATCH shows a notice');
    assert.ok(drop.includes('deal.stage_id = prevStageId'), 'failed PATCH reverts the move');
  });
  test('enter/leave use a counter on the column; start uses closest(); a menu move reuses dealDrop', () => {
    assert.match(sliceFn(dealsJs, 'dealDragEnter', 'deals.js'), /dataset\.over/);
    assert.match(sliceFn(dealsJs, 'dealDragLeave', 'deals.js'), /dataset\.over/);
    assert.match(sliceFn(dealsJs, 'dealDragStart', 'deals.js'), /closest\('\.deal-card'\)/);
    assert.match(sliceFn(dealsJs, 'moveDealToStage', 'deals.js'), /dealDrop\(/);
  });
});

describe('pure helpers', () => {
  const F = loadFns('public/js/deals.js', ['fmtMoney', 'initials', 'sortStageDeals', 'stageTotal'], { state: { currentLang: 'de' } });
  test('fmtMoney formats euros per language without decimals', () => {
    assert.match(F.fmtMoney(1234.5).replace(/ /g, ' '), /1\.235/);
    F.__set('currentLang', 'en');
    assert.match(F.fmtMoney(1234.5).replace(/ /g, ' '), /1,235/);
    assert.equal(F.fmtMoney(null), '');
  });
  test('initials takes up to two letters', () => {
    assert.equal(F.initials('Anna Weber'), 'AW');
    assert.equal(F.initials('Cher'), 'C');
    assert.equal(F.initials(''), '');
  });
  test('sortStageDeals: urgency first, then newest; stageTotal sums values', () => {
    const list = [{ id: 1, urgency: 0, created_at: '2026-09-01', value: 10 }, { id: 2, urgency: 4, created_at: '2026-08-01', value: '5' }, { id: 3, urgency: 0, created_at: '2026-09-20', value: null }];
    assert.deepEqual(F.sortStageDeals(list).map(d => d.id), [2, 3, 1]);
    assert.equal(F.stageTotal(list), 15);
  });
});

describe('markup, icons and copy', () => {
  test('page header: summary line, pipeline select before the view toggle, labelled toggles, a notice slot', () => {
    assert.match(section, /id="deals-summary"/);
    assert.ok(section.indexOf('id="deals-pipeline-select"') < section.indexOf('class="view-toggle"'), 'pipeline select first');
    assert.match(section, /id="deal-view-kanban"[^>]*aria-label=/);
    assert.match(section, /id="deal-view-list"[^>]*aria-label=/);
    assert.match(section, /id="deals-board-notice" class="board-notice hidden"/);
  });
  test('UI_ICON has more + check; every t() key used by deals.js exists in EN and DE', () => {
    for (const k of ['more', 'check']) assert.match(core, new RegExp(`^\\s*${k}:\\s*'<svg`, 'm'), `UI_ICON.${k}`);
    const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    const keys = [...dealsJs.matchAll(/\bt\('([a-z_0-9]+)'\)/g)].map(m => m[1]);
    assert.ok(keys.length > 10, 'deals.js uses t()');
    assert.deepEqual([...new Set(keys.filter(k => !(k in dict.en) || !(k in dict.de)))], []);
    assert.equal(dict.en.add_deal, 'Add deal');
  });
  test('openDealModal accepts a preset stage; deleteDeal uses a translated confirm', () => {
    assert.match(sliceFn(modalsJs, 'openDealModal', 'modals.js'), /opts\.stageId/);
    assert.match(sliceFn(modalsJs, 'deleteDeal', 'modals.js'), /t\('confirm_delete_deal'\)/);
  });
});

describe('stylesheet', () => {
  test('board rules exist; urgency is an inset bar, not a border; the pinned width stays', () => {
    for (const r of ['.deal-card {', '.deal-card.dragging {', '.pipeline-col.drag-over {', '.col-drop-slot {', '.col-add-btn {', '.card-menu {', '.card-menu-item {', '.deal-card-menu-btn {', '.deal-card-avatar {', '.col-total {', '.board-notice {', '.pipeline-board.is-dragging .col-drop-slot {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\n\.deal-card \{[^}]*inset 3px 0 0 var\(--urgency\)/, 'the urgency bar is an inset shadow on the card');
    assert.match(css, /\.deal-card\.urgency-4 \{[^}]*--urgency: var\(--danger\)/);
    assert.doesNotMatch(css, /border-left: 4px solid #f59e0b/);
    assert.doesNotMatch(css, /^\.urgency-select \{/m);
    assert.match(css, /\.pipeline-col \{[^}]*min-width: var\(--kanban-col-w\); max-width: var\(--kanban-col-w\)/);
    assert.match(css, /\.col-dot \{[^}]*var\(--stage[,)]/);
    assert.doesNotMatch(css, /\.col-name \{[^}]*text-transform: uppercase/);
  });
});
