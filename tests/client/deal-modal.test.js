// CLIENT (static) tests for the deal view rework: a hero band with the title and
// a stage stepper, a label-left field grid with a segmented urgency control, the
// Listings panel wired back in, SVG icons in the timeline, visible comment /
// reply buttons, every string through t(), Escape closing modals, and a failed
// save that keeps the modal open.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const modals = read('public/js/modals.js');
const start = html.indexOf('<div id="deal-modal"');
const block = html.slice(start, html.indexOf('<!-- Task Modal -->', start));
const EMOJI = /[✀-➿\u{1F300}-\u{1FAFF}⠀-⣿]|✕|️|→|↳|＋/u;
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('markup', () => {
  test('hero: heading-sized title input tied to the form, and a stage stepper; the stage select is still there', () => {
    assert.match(block, /<div class="deal-hero">[\s\S]*<input type="text" id="df-title" class="deal-title-input" form="deal-form" required/);
    assert.match(block, /<div id="df-stage-stepper" class="stage-stepper" role="radiogroup"/);
    assert.match(block, /<select id="df-stage"/);
    assert.match(block, /<div class="modal modal-deal">/, 'no modal-full, no inline style on the box');
  });
  test('details: a field grid with a segmented urgency control writing to the hidden select', () => {
    assert.match(block, /<form id="deal-form" onsubmit="saveDeal\(event\)" class="field-grid">/);
    assert.match(block, /<div class="seg" id="df-urgency-seg"/);
    assert.match(block, /<select id="df-urgency" class="sr-only" onchange="updateUrgencyDot\(\)">/);
    assert.equal((block.match(/<option value="[0-4]" data-i18n="urg_[0-4]">/g) || []).length, 5);
    assert.equal(block.includes('urgency-row'), false);
  });
  test('contact column carries the Listings panel the JS has been looking for', () => {
    assert.match(block, /id="deal-object-panel-label"/);
    assert.match(block, /id="deal-object-panel-body"/);
  });
  test('notes column and footer', () => {
    assert.match(block, /<div class="seg" id="deal-activity-type-seg"/);
    assert.match(block, /<select id="deal-activity-type" class="sr-only">/);
    assert.match(block, /id="deal-activity-content" class="note-editor" contenteditable="true" data-i18n-ph="detail_log_ph"/);
    assert.match(block, /<span id="deal-form-error" class="workspace-name-msg error hidden"><\/span>/);
    assert.match(block, /form="deal-form" class="btn btn-primary" data-i18n="save_deal"/);
  });
  test('no onboarding button in the header on this branch', () => {
    assert.equal(block.includes('deal-onboarding-btn'), false);
    assert.equal(block.includes('startOnboardingFromDeal'), false);
    assert.match(block, /id="deal-add-task-btn"/);
  });
  test('no glyphs; every data-i18n key in the block exists in both languages', () => {
    const hit = block.match(EMOJI);
    assert.equal(hit, null, `found "${hit && hit[0]}"`);
    const keys = [...block.matchAll(/data-i18n(?:-ph|-title)?="([a-z_0-9]+)"/g)].map(m => m[1]);
    assert.ok(keys.length >= 25, `only ${keys.length} translated strings in the modal`);
    assert.deepEqual([...new Set(keys.filter(k => !(k in dict.en) || !(k in dict.de)))], []);
  });
});

describe('modals.js', () => {
  test('no glyphs in the deal-modal renderers; timeline icons come from UI_ICON', () => {
    for (const fn of ['renderTimelineItem', 'renderContactPanelReadOnly', 'inlineEditDealNote', 'renderObjectPanel', 'renderCommentTree', 'commentFormHTML', 'openDealModal', 'editContactPanel']) {
      const src = sliceFn(modals, fn, 'modals.js');
      const hit = src.match(EMOJI);
      assert.equal(hit, null, `${fn}: found "${hit && hit[0]}"`);
    }
    assert.match(sliceConst('public/js/modals.js', '_timelineIcons'), /UI_ICON\.note[\s\S]*UI_ICON\.call[\s\S]*UI_ICON\.mail[\s\S]*UI_ICON\.chat/);
  });
  test('stepper and urgency segments are wired to the hidden selects', () => {
    assert.match(sliceFn(modals, 'populateDealStages', 'modals.js'), /renderStageStepper\(\)/);
    assert.match(sliceFn(modals, 'renderStageStepper', 'modals.js'), /df-stage-stepper/);
    assert.match(sliceFn(modals, 'setDealStage', 'modals.js'), /getElementById\('df-stage'\)/);
    assert.match(sliceFn(modals, 'updateUrgencyDot', 'modals.js'), /aria-checked/);
  });
  test('a failed save keeps the modal open; opening for a contact fills the contact column', () => {
    const save = sliceFn(modals, 'saveDeal', 'modals.js');
    assert.ok(save.indexOf('saved?.error') >= 0 && save.indexOf('saved?.error') < save.indexOf("closeModal('deal-modal')"), 'error checked before closing');
    assert.match(save, /showDealFormError\(saved\.error\)/);
    assert.match(sliceFn(modals, 'showDealFormError', 'modals.js'), /deal-form-error/);
    assert.equal(save.includes('maybePromptOnboarding'), false, 'no onboarding prompt on this branch');
    assert.match(sliceFn(modals, 'openDealModalForContact', 'modals.js'), /onDealContactChange\(\)/);
  });
  test('comments: a real button, no inline display toggling', () => {
    const item = sliceFn(modals, 'renderTimelineItem', 'modals.js');
    assert.match(item, /<button type="button" class="deal-comment-toggle-btn"/);
    assert.doesNotMatch(item, /style="display:none"/);
    assert.match(sliceFn(modals, 'toggleActivityComments', 'modals.js'), /classList\.toggle\('hidden'/);
  });
  test('every t() key used in modals.js exists in EN and DE', () => {
    const keys = [...modals.matchAll(/\bt\('([a-z_0-9]+)'\)/g)].map(m => m[1]);
    assert.ok(keys.length > 40, `modals.js uses t() ${keys.length} times`);
    assert.deepEqual([...new Set(keys.filter(k => !(k in dict.en) || !(k in dict.de)))], []);
  });
});

describe('core.js', () => {
  test('Escape closes the topmost open modal; overlay clicks go through closeModal; timeline icons exist', () => {
    assert.match(core, /e\.key !== 'Escape'[\s\S]{0,400}closeModal\(open\.id\)/);
    assert.match(core, /if \(e\.target === overlay\) closeModal\(overlay\.id\)/);
    for (const k of ['note', 'call', 'mail', 'chat']) assert.match(core, new RegExp(`^\\s*${k}:\\s*'<svg`, 'm'), `UI_ICON.${k}`);
  });
});

describe('stylesheet', () => {
  test('new primitives exist, old ones are gone, the modal is narrower', () => {
    for (const r of ['.modal-deal {', '.deal-hero {', '.deal-title-input {', '.stage-stepper {', '.stage-step {', '.field-grid {', '.seg {', '.seg-btn {', '.sr-only {', '.deal-col-title {', '.input-affix {', '.deal-comments-loading {', '.inline-edit-actions {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\.modal-deal \{[^}]*min\(96vw, 1440px\)/);
    assert.doesNotMatch(css, /\.deal-comment-toggle-btn \{[^}]*opacity: 0/);
    assert.doesNotMatch(css, /^\.urgency-row/m);
    assert.doesNotMatch(css, /^\.deal-modal-header-actions/m);
    assert.match(css, /\.modal-full \{/, 'the ladder keeps its stop');
  });
});
